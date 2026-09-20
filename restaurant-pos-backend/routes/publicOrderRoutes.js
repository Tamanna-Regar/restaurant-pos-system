const express = require('express');
const mongoose = require('mongoose');
const Order = require('../models/Order');
const Table = require('../models/Table');
const Item = require('../models/Item');
const { deductStockForOrder } = require('../utils/inventoryHelper');
const { resolveModifiers } = require('../utils/modifierHelper');
const Ingredient = require('../models/Ingredient');

const router = express.Router();

router.post('/', async (req, res) => {
  try {
    const { tableId, customerName = 'QR Guest', customerPhone = '', items = [] } = req.body || {};
    if (!Array.isArray(items) || items.length === 0 || items.length > 50) {
      return res.status(400).json({ success: false, message: 'One to fifty menu items are required' });
    }

    const requestedIds = items.map((item) => item.itemId || item._id || item.originalId).filter(Boolean);
    const menuItems = await Item.find({ _id: { $in: requestedIds }, isAvailable: true });
    const menuById = new Map(menuItems.map((item) => [String(item._id), item]));
    const normalizedItems = items.map((item) => {
      const menuItem = menuById.get(String(item.itemId || item._id || item.originalId));
      const quantity = Number(item.quantity || item.qty || 1);
      if (!menuItem || !Number.isInteger(quantity) || quantity < 1 || quantity > 99) throw new Error('One or more menu items are unavailable or invalid');
      const addons = resolveModifiers(item.addons, menuItem.addons);
      const addonTotal = addons.reduce((sum, addon) => sum + addon.price, 0);
      return { itemId: menuItem._id, name: menuItem.name, foodType: menuItem.foodType, portion: 'Full', basePrice: menuItem.price, addonTotal, addons, hsnSac: menuItem.hsnSac || '', taxRate: Number(menuItem.taxRate ?? 5), taxCategory: menuItem.taxCategory || 'taxable', price: Number((menuItem.price + addonTotal).toFixed(2)), quantity, notes: String(item.notes || ''), kotNumber: 1 };
    });

    let table = null;
    if (tableId && mongoose.isValidObjectId(tableId)) {
      table = await Table.findById(tableId);
      if (!table) return res.status(404).json({ success: false, message: 'Table not found' });
    }

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
      kots: [{ kotNumber: 1, status: 'placed', items: normalizedItems }],
      items: normalizedItems,
      subTotal,
      tax,
      cgst,
      sgst,
      grandTotal: Number((subTotal + tax).toFixed(2)),
      paymentMode: 'Cash',
      paymentStatus: 'pending',
      orderStatus: 'placed',
      statusHistory: [{ status: 'placed', updatedBy: 'QR Guest' }]
    });

    const io = req.app.get('io');
    await deductStockForOrder(order.items, order._id);
    const lowStock = await Ingredient.find({ $expr: { $lte: ['$currentStock', '$minStockAlert'] } }).select('name unit currentStock minStockAlert');
    lowStock.forEach((ingredient) => io?.emit('inventory-low-stock', { ingredient: { _id: ingredient._id, name: ingredient.name, unit: ingredient.unit, stock: ingredient.currentStock, minLimit: ingredient.minStockAlert } }));
    if (table) await Table.findByIdAndUpdate(table._id, { status: 'occupied', currentOrderId: order._id });
    if (io) io.emit('newTableOrder', { orderId: order._id, tableNo: table?.tableNo || table?.tableNumber || 'QR' });
    res.status(201).json({ success: true, data: order });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

module.exports = router;
