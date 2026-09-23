const express = require('express');
const router = express.Router();
const Table = require('../models/Table');
const Order = require('../models/Order');

// @route   POST /api/tables/add
// @desc    Add new table
router.post(['/', '/add'], async (req, res) => {
  try {
    const tableNoVal = req.body.tableNo || req.body.tableNumber;
    const capacityVal = req.body.capacity || 4;
    const floorVal = req.body.floor || 'Floor 1';
    const typeVal = req.body.type || 'Dining';
    const tableNo = Number(tableNoVal);
    const capacity = Number(capacityVal);

    if (!tableNoVal || !Number.isInteger(tableNo) || tableNo < 1) {
      return res.status(400).json({ message: "Table number is required" });
    }
    if (!Number.isFinite(capacity) || capacity < 1) {
      return res.status(400).json({ message: "Capacity must be a positive number" });
    }

    const existingTable = await Table.findOne({ floor: floorVal, tableNo });
    if (existingTable) {
      return res.status(409).json({
        message: `Table ${tableNo} already exists on ${floorVal}. Please use a different table number.`
      });
    }

    const newTable = new Table({
      tableNo,
      tableNumber: tableNo,
      capacity,
      floor: floorVal,
      type: typeVal,
      status: 'available'
    });

    await newTable.save();
    res.status(201).json({ success: true, data: newTable });
  } catch (error) {
    console.error("Add Table DB Error:", error);
    res.status(500).json({ message: error.message });
  }
});

// @route   GET /api/tables
// @desc    Get all tables
router.get('/', async (req, res) => {
  try {
    const tables = await Table.find().sort({ tableNo: 1 });
    res.json(tables);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// @route   PUT /api/tables/:id
// @desc    Update table status or details
router.put('/:id', async (req, res) => {
  try {
    const { status, floor, capacity, type, currentOrderId } = req.body;
    const updateData = {};
    if (status !== undefined) updateData.status = status.toLowerCase();
    if (floor !== undefined) updateData.floor = floor;
    if (capacity !== undefined) updateData.capacity = Number(capacity);
    if (type !== undefined) updateData.type = type;
    if (currentOrderId !== undefined) updateData.currentOrderId = currentOrderId;

    const table = await Table.findByIdAndUpdate(req.params.id, updateData, { new: true });
    if (!table) return res.status(404).json({ message: 'Table not found' });
    res.json({ success: true, data: table });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// @route   PUT /api/tables/transfer/:fromId/:toId
// @desc    Table transfer: Shift active order from one table to another
router.put('/transfer/:fromId/:toId', async (req, res) => {
  try {
    const { fromId, toId } = req.params;
    const fromTable = await Table.findById(fromId);
    const toTable = await Table.findById(toId);

    if (!fromTable || !toTable) {
      return res.status(404).json({ message: 'Source or target table not found' });
    }

    if (toTable.status === 'occupied') {
      return res.status(400).json({ message: 'Target table is already occupied!' });
    }

    // Find active running order for fromTable
    const activeOrder = await Order.findOne({
      tableId: fromId,
      orderStatus: { $in: ['placed', 'preparing', 'ready', 'billed'] }
    });

    if (activeOrder) {
      activeOrder.tableId = toId;
      await activeOrder.save();
    }

    // Update target table
    toTable.status = fromTable.status; // e.g. occupied or billed
    toTable.currentOrderId = activeOrder ? activeOrder._id : null;
    await toTable.save();

    // Free source table
    fromTable.status = 'available';
    fromTable.currentOrderId = null;
    await fromTable.save();

    // Real-time notification across all POS & Waiter screens
    const io = req.app.get('io');
    if (io) {
      io.emit('table-updated', { action: 'transfer', fromTable, toTable });
      io.emit('order-updated', { action: 'transfer', order: activeOrder });
    }

    res.json({
      success: true,
      message: `Order successfully shifted from Table ${fromTable.tableNo} to Table ${toTable.tableNo}`,
      fromTable,
      toTable,
      order: activeOrder
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// @route   DELETE /api/tables/:id
// @desc    Delete table
router.delete('/:id', async (req, res) => {
  try {
    const table = await Table.findByIdAndDelete(req.params.id);
    if (!table) return res.status(404).json({ message: 'Table not found' });
    res.json({ success: true, message: 'Table deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// @route   PUT /api/tables/merge/:primaryId/:secondaryId
// @desc    Merge secondary table into primary table with database persistence
router.put('/merge/:primaryId/:secondaryId', async (req, res) => {
  try {
    const { primaryId, secondaryId } = req.params;
    if (primaryId === secondaryId) {
      return res.status(400).json({ success: false, message: 'Cannot merge table with itself' });
    }

    const primaryTable = await Table.findById(primaryId);
    const secondaryTable = await Table.findById(secondaryId);

    if (!primaryTable || !secondaryTable) {
      return res.status(404).json({ success: false, message: 'Primary or secondary table not found' });
    }

    // Find active running orders
    const [primaryOrder, secondaryOrder] = await Promise.all([
      Order.findOne({ tableId: primaryId, orderStatus: { $in: ['placed', 'preparing', 'ready', 'billed'] } }),
      Order.findOne({ tableId: secondaryId, orderStatus: { $in: ['placed', 'preparing', 'ready', 'billed'] } })
    ]);

    // If secondary table has an active order and primary also has one: merge items/kots
    if (secondaryOrder && primaryOrder && String(secondaryOrder._id) !== String(primaryOrder._id)) {
      const startKotNo = (primaryOrder.kotNumber || 1) + 1;
      const transferredKots = (secondaryOrder.kots || []).map((k, idx) => ({
        ...k.toObject(),
        kotNumber: startKotNo + idx
      }));
      primaryOrder.kots.push(...transferredKots);
      primaryOrder.items.push(...(secondaryOrder.items || []));
      primaryOrder.kotNumber = startKotNo + transferredKots.length;

      const subTotal = primaryOrder.items.reduce((sum, item) => sum + (Number(item.price) * Number(item.quantity || 1)), 0);
      primaryOrder.subTotal = subTotal;
      primaryOrder.grandTotal = subTotal;
      await primaryOrder.save();

      secondaryOrder.orderStatus = 'cancelled';
      secondaryOrder.cancellationReason = `Merged into Table ${primaryTable.tableNo} (Order #${primaryOrder._id})`;
      await secondaryOrder.save();
    } else if (secondaryOrder && !primaryOrder) {
      secondaryOrder.tableId = primaryId;
      await secondaryOrder.save();
      primaryTable.status = secondaryOrder.orderStatus === 'billed' ? 'billed' : 'occupied';
      primaryTable.currentOrderId = secondaryOrder._id;
    }

    secondaryTable.status = 'occupied';
    secondaryTable.mergedWith = primaryTable._id;
    secondaryTable.isMerged = true;
    secondaryTable.currentOrderId = primaryOrder?._id || secondaryOrder?._id || primaryTable.currentOrderId;
    await secondaryTable.save();

    primaryTable.mergedWith = secondaryTable._id;
    await primaryTable.save();

    const io = req.app.get('io');
    if (io) {
      io.emit('table-updated', { action: 'merge', primaryTable, secondaryTable });
    }

    res.json({
      success: true,
      message: `Table ${secondaryTable.tableNo} successfully merged with Table ${primaryTable.tableNo}`,
      primaryTable,
      secondaryTable
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// @route   PUT /api/tables/unmerge/:id
// @desc    Unmerge table
router.put('/unmerge/:id', async (req, res) => {
  try {
    const table = await Table.findById(req.params.id);
    if (!table) return res.status(404).json({ success: false, message: 'Table not found' });

    if (table.mergedWith) {
      const otherTable = await Table.findById(table.mergedWith);
      if (otherTable) {
        otherTable.mergedWith = null;
        otherTable.isMerged = false;
        const otherOrder = await Order.findOne({ tableId: otherTable._id, orderStatus: { $in: ['placed', 'preparing', 'ready', 'billed'] } });
        if (!otherOrder) {
          otherTable.status = 'available';
          otherTable.currentOrderId = null;
        }
        await otherTable.save();
      }
    }

    table.mergedWith = null;
    table.isMerged = false;
    const activeOrder = await Order.findOne({ tableId: table._id, orderStatus: { $in: ['placed', 'preparing', 'ready', 'billed'] } });
    if (!activeOrder) {
      table.status = 'available';
      table.currentOrderId = null;
    }
    await table.save();

    const io = req.app.get('io');
    if (io) {
      io.emit('table-updated', { action: 'unmerge', table });
    }

    res.json({ success: true, message: `Table ${table.tableNo} unmerged successfully`, table });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;