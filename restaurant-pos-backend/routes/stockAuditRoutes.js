const express = require('express');
const Ingredient = require('../models/Ingredient');
const InventoryLedger = require('../models/InventoryLedger');
const StockAudit = require('../models/StockAudit');

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const records = await StockAudit.find().sort({ createdAt: -1 }).limit(500);
    res.json({ success: true, data: records });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const countedQuantity = Number(req.body.countedQuantity);
    if (!Number.isFinite(countedQuantity) || countedQuantity < 0) {
      return res.status(400).json({ success: false, message: 'Counted quantity must be zero or greater' });
    }
    const ingredient = req.body.ingredientId
      ? await Ingredient.findById(req.body.ingredientId)
      : await Ingredient.findOne({ name: String(req.body.ingredientName || '').trim() });
    if (!ingredient) return res.status(404).json({ success: false, message: 'Ingredient not found' });

    const systemQuantity = Number(ingredient.currentStock || 0);
    const variance = countedQuantity - systemQuantity;
    ingredient.currentStock = countedQuantity;
    await ingredient.save();
    const audit = await StockAudit.create({
      ingredientId: ingredient._id,
      ingredientName: ingredient.name,
      systemQuantity,
      countedQuantity,
      variance,
      reason: String(req.body.reason || 'Physical stock count').trim(),
      auditedBy: req.user?.name || 'Inventory Staff'
    });
    await InventoryLedger.create({
      ingredientId: ingredient._id,
      type: 'adjustment',
      quantity: variance,
      balanceAfter: countedQuantity,
      referenceType: 'StockAudit',
      referenceId: String(audit._id),
      note: audit.reason,
      createdBy: req.user?.name || 'Inventory Staff'
    });
    res.status(201).json({ success: true, data: audit });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

module.exports = router;
