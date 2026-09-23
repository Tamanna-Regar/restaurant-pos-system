const express = require('express');
const mongoose = require('mongoose');
const Order = require('../models/Order');
const Table = require('../models/Table');
const Item = require('../models/Item');
const { deductStockForOrder } = require('../utils/inventoryHelper');
const { resolveModifiers } = require('../utils/modifierHelper');
const Ingredient = require('../models/Ingredient');

const router = express.Router();

// 1. Place or Append Public QR Order
router.post('/', async (req, res) => {
  try {
    const { tableId, customerName = 'QR Guest', customerPhone = '', items = [] } = req.body || {};
    if (!Array.isArray(items) || items.length === 0 || items.length > 50) {
      return res.status(400).json({ success: false, message: 'One to fifty menu items are required' });
    }

    const requestedIds = items.map((item) => item.itemId || item._id || item.originalId).filter(Boolean);
    const menuItems = await Item.find({ _id: { $in: requestedIds }, isAvailable: true });
    const menuById = new Map(menuItems.map((item) => [String(item._id), item]));

    let table = null;
    if (tableId && mongoose.isValidObjectId(tableId)) {
      table = await Table.findById(tableId);
      if (!table) return res.status(404).json({ success: false, message: 'Table not found' });
    } else if (tableId) {
      table = await Table.findOne({ $or: [{ tableNo: tableId }, { tableNumber: tableId }] });
    }

    const io = req.app.get('io');

    // Check if table already has a running active order
    let runningOrder = null;
    if (table) {
      runningOrder = await Order.findOne({
        tableId: table._id,
        orderStatus: { $in: ['placed', 'preparing', 'ready'] }
      });
    }

    if (runningOrder) {
      // Append as next KOT batch to running order
      const existingKots = Array.isArray(runningOrder.kots) ? runningOrder.kots : [];
      const nextKotNumber = existingKots.length > 0
        ? Math.max(...existingKots.map(k => k.kotNumber || 1)) + 1
        : (runningOrder.kotNumber || 1) + 1;

      const normalizedItems = items.map((item) => {
        const menuItem = menuById.get(String(item.itemId || item._id || item.originalId));
        const quantity = Number(item.quantity || item.qty || 1);
        if (!menuItem || !Number.isInteger(quantity) || quantity < 1 || quantity > 99) {
          throw new Error('One or more menu items are unavailable or invalid');
        }
        const addons = resolveModifiers(item.addons, menuItem.addons);
        const addonTotal = addons.reduce((sum, addon) => sum + addon.price, 0);
        return {
          itemId: menuItem._id,
          name: menuItem.name,
          foodType: menuItem.foodType,
          portion: item.portion || 'Full',
          basePrice: menuItem.price,
          addonTotal,
          addons,
          hsnSac: menuItem.hsnSac || '',
          taxRate: Number(menuItem.taxRate ?? 5),
          taxCategory: menuItem.taxCategory || 'taxable',
          price: Number((menuItem.price + addonTotal).toFixed(2)),
          quantity,
          notes: String(item.notes || ''),
          kotNumber: nextKotNumber
        };
      });

      runningOrder.items.push(...normalizedItems);
      runningOrder.kots.push({
        kotNumber: nextKotNumber,
        status: 'placed',
        items: normalizedItems,
        punchedAt: new Date()
      });
      runningOrder.kotNumber = nextKotNumber;

      // Recalculate totals
      const activeItems = runningOrder.items.filter(i => i.itemStatus !== 'cancelled');
      const subTotal = activeItems.reduce((sum, item) => sum + item.price * item.quantity, 0);
      const tax = Number((subTotal * 0.05).toFixed(2));
      runningOrder.subTotal = subTotal;
      runningOrder.tax = tax;
      runningOrder.cgst = Number((tax / 2).toFixed(2));
      runningOrder.sgst = Number((tax - (tax / 2)).toFixed(2));
      runningOrder.grandTotal = Number((subTotal + tax).toFixed(2));

      await runningOrder.save();
      await deductStockForOrder(normalizedItems, runningOrder._id);

      if (io) {
        io.emit('new-kot', {
          orderId: runningOrder._id,
          kotNumber: nextKotNumber,
          tableNo: table?.tableNo || table?.tableNumber || 'QR Table',
          items: normalizedItems,
          orderType: runningOrder.orderType || 'Dine-In'
        });
        io.emit('order-updated', runningOrder);
        io.emit('newTableOrder', { orderId: runningOrder._id, tableNo: table?.tableNo || table?.tableNumber || 'QR' });
      }

      return res.status(200).json({ success: true, data: runningOrder, isAdditionalKot: true, kotNumber: nextKotNumber });
    }

    // New Order Creation
    const normalizedItems = items.map((item) => {
      const menuItem = menuById.get(String(item.itemId || item._id || item.originalId));
      const quantity = Number(item.quantity || item.qty || 1);
      if (!menuItem || !Number.isInteger(quantity) || quantity < 1 || quantity > 99) {
        throw new Error('One or more menu items are unavailable or invalid');
      }
      const addons = resolveModifiers(item.addons, menuItem.addons);
      const addonTotal = addons.reduce((sum, addon) => sum + addon.price, 0);
      return {
        itemId: menuItem._id,
        name: menuItem.name,
        foodType: menuItem.foodType,
        portion: item.portion || 'Full',
        basePrice: menuItem.price,
        addonTotal,
        addons,
        hsnSac: menuItem.hsnSac || '',
        taxRate: Number(menuItem.taxRate ?? 5),
        taxCategory: menuItem.taxCategory || 'taxable',
        price: Number((menuItem.price + addonTotal).toFixed(2)),
        quantity,
        notes: String(item.notes || ''),
        kotNumber: 1
      };
    });

    const subTotal = normalizedItems.reduce((sum, item) => sum + item.price * item.quantity, 0);
    const tax = Number((subTotal * 0.05).toFixed(2));
    const cgst = Number((tax / 2).toFixed(2));
    const sgst = Number((tax - cgst).toFixed(2));

    const order = await Order.create({
      branchId: req.body.branchId || null,
      tableId: table?._id || null,
      orderType: 'Dine-In',
      customerName: String(customerName).trim().slice(0, 100) || 'QR Guest',
      customerPhone: String(customerPhone).trim().slice(0, 20),
      waiterName: 'QR Guest',
      kotNumber: 1,
      kots: [{ kotNumber: 1, status: 'placed', items: normalizedItems, punchedAt: new Date() }],
      items: normalizedItems,
      subTotal,
      tax,
      cgst,
      sgst,
      grandTotal: Number((subTotal + tax).toFixed(2)),
      paymentMode: 'Cash',
      paymentStatus: 'pending',
      orderStatus: 'placed',
      statusHistory: [{ status: 'placed', updatedBy: 'QR Guest', timestamp: new Date() }]
    });

    await deductStockForOrder(order.items, order._id);
    const lowStock = await Ingredient.find({ $expr: { $lte: ['$currentStock', '$minStockAlert'] } }).select('name unit currentStock minStockAlert');
    lowStock.forEach((ingredient) => io?.emit('inventory-low-stock', { ingredient: { _id: ingredient._id, name: ingredient.name, unit: ingredient.unit, stock: ingredient.currentStock, minLimit: ingredient.minStockAlert } }));

    if (table) {
      await Table.findByIdAndUpdate(table._id, { status: 'occupied', currentOrderId: order._id });
    }

    if (io) {
      io.emit('new-kot', {
        orderId: order._id,
        kotNumber: 1,
        tableNo: table?.tableNo || table?.tableNumber || 'QR Table',
        items: normalizedItems,
        orderType: 'Dine-In'
      });
      io.emit('newTableOrder', { orderId: order._id, tableNo: table?.tableNo || table?.tableNumber || 'QR' });
    }

    res.status(201).json({ success: true, data: order, isAdditionalKot: false, kotNumber: 1 });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

// 2. Customer Live Order Status Tracker
router.get('/status/:tableId', async (req, res) => {
  try {
    const { tableId } = req.params;
    let table = null;

    if (mongoose.isValidObjectId(tableId)) {
      table = await Table.findById(tableId);
    } else {
      table = await Table.findOne({ $or: [{ tableNo: tableId }, { tableNumber: tableId }] });
    }

    const tableFilter = table ? { tableId: table._id } : (mongoose.isValidObjectId(tableId) ? { tableId } : null);
    if (!tableFilter) {
      return res.json({ success: true, activeOrder: null, table: null });
    }

    const activeOrder = await Order.findOne({
      ...tableFilter,
      orderStatus: { $in: ['placed', 'preparing', 'ready', 'served', 'billed'] }
    }).sort({ createdAt: -1 });

    res.json({
      success: true,
      table: table ? { _id: table._id, tableNo: table.tableNo || table.tableNumber, floor: table.floor, status: table.status } : null,
      activeOrder
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// 3. Customer "Call Waiter" / Assistance
router.post('/call-waiter', async (req, res) => {
  try {
    const { tableId, requestType = 'waiter', customNote = '' } = req.body || {};
    let table = null;

    if (tableId && mongoose.isValidObjectId(tableId)) {
      table = await Table.findById(tableId);
    } else if (tableId) {
      table = await Table.findOne({ $or: [{ tableNo: tableId }, { tableNumber: tableId }] });
    }

    const tableNo = table ? (table.tableNo || table.tableNumber) : (tableId || 'QR Table');
    const floor = table?.floor || 'Dining Area';

    const alertPayload = {
      tableId: table?._id || tableId,
      tableNo: String(tableNo),
      floor,
      requestType, // 'water' | 'cutlery' | 'bill' | 'waiter' | 'clean'
      customNote: String(customNote).slice(0, 150),
      timestamp: new Date().toISOString()
    };

    const io = req.app.get('io');
    if (io) {
      io.emit('call-waiter', alertPayload);
    }

    res.json({ success: true, message: 'Waiter alert dispatched successfully', alert: alertPayload });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
