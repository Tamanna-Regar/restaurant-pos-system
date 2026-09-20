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

    if (!tableNoVal) {
      return res.status(400).json({ message: "Table number is required" });
    }

    const newTable = new Table({
      tableNo: Number(tableNoVal),
      tableNumber: Number(tableNoVal),
      capacity: Number(capacityVal),
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
// @desc    Petpooja Table Transfer: Shift active order from one table to another
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
      orderStatus: { $in: ['placed', 'preparing', 'ready'] }
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

module.exports = router;