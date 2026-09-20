const express = require('express');
const Ingredient = require('../models/Ingredient');
const StockTransfer = require('../models/StockTransfer');
const InventoryLedger = require('../models/InventoryLedger');

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const transfers = await StockTransfer.find({}).populate('ingredientId', 'name unit').sort({ createdAt: -1 }).limit(300);
    res.json({ success: true, data: transfers });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const ingredient = await Ingredient.findById(req.body.ingredientId);
    const quantity = Number(req.body.quantity);
    const fromLocation = String(req.body.fromLocation || '').trim();
    const toLocation = String(req.body.toLocation || '').trim();
    if (!ingredient || !Number.isFinite(quantity) || quantity <= 0 || !fromLocation || !toLocation || fromLocation === toLocation) {
      return res.status(400).json({ success: false, message: 'Valid ingredient, quantity and different locations are required.' });
    }
    const locations = Object.fromEntries(ingredient.stockByLocation || []);
    const fromStock = fromLocation === 'Main Store' && Object.keys(locations).length === 0
      ? Number(ingredient.currentStock || 0)
      : Number(locations[fromLocation] || 0);
    if (fromStock < quantity) return res.status(400).json({ success: false, message: `Only ${fromStock} ${ingredient.unit} available at ${fromLocation}.` });
    locations[fromLocation] = Number((fromStock - quantity).toFixed(4));
    locations[toLocation] = Number((Number(locations[toLocation] || 0) + quantity).toFixed(4));
    ingredient.stockByLocation = locations;
    await ingredient.save();
    const transfer = await StockTransfer.create({ ingredientId: ingredient._id, quantity, unit: ingredient.unit, fromLocation, toLocation, note: String(req.body.note || '').trim(), transferredBy: req.user?.name || 'Inventory Staff' });
    await InventoryLedger.create({ ingredientId: ingredient._id, type: 'transfer', quantity: 0, balanceAfter: ingredient.currentStock, referenceType: 'StockTransfer', referenceId: String(transfer._id), note: `${fromLocation} → ${toLocation}: ${quantity} ${ingredient.unit}`, createdBy: req.user?.name || 'Inventory Staff' });
    res.status(201).json({ success: true, data: transfer });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

module.exports = router;
