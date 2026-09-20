const express = require('express');
const Ingredient = require('../models/Ingredient');
const StockAdjustment = require('../models/StockAdjustment');
const InventoryLedger = require('../models/InventoryLedger');

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const records = await StockAdjustment.find().sort({ createdAt: -1 });
    res.json({ success: true, data: records });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/waste', async (req, res) => {
  try {
    const quantity = Number(req.body.quantity);
    if (!Number.isFinite(quantity) || quantity <= 0) return res.status(400).json({ success: false, message: 'Waste quantity must be greater than zero' });
    const ingredient = req.body.ingredientId
      ? await Ingredient.findById(req.body.ingredientId)
      : await Ingredient.findOne({ name: String(req.body.ingredientName || '').trim() });
    if (!ingredient) return res.status(404).json({ success: false, message: 'Ingredient not found' });
    if (ingredient.currentStock < quantity) return res.status(400).json({ success: false, message: `Only ${ingredient.currentStock} ${ingredient.unit} is available` });

    const adjustment = await StockAdjustment.create({
      ingredientId: ingredient._id,
      ingredientName: ingredient.name,
      previousQuantity: ingredient.currentStock,
      newQuantity: ingredient.currentStock - quantity,
      difference: -quantity,
      reason: String(req.body.reason || 'Waste / spoilage').trim(),
      requestedBy: req.user?.name || 'Inventory Staff',
      status: 'pending',
      type: 'waste'
    });
    res.status(201).json({ success: true, data: adjustment });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.post('/:id/approve', async (req, res) => {
  try {
    if (!['admin', 'manager'].includes(req.user?.role)) return res.status(403).json({ success: false, message: 'Only admin or manager can approve waste' });
    const adjustment = await StockAdjustment.findById(req.params.id);
    if (!adjustment) return res.status(404).json({ success: false, message: 'Adjustment not found' });
    if (adjustment.status !== 'pending') return res.status(409).json({ success: false, message: 'Adjustment is already reviewed' });
    const quantity = Math.abs(Number(adjustment.difference));
    const ingredient = await Ingredient.findById(adjustment.ingredientId);
    if (!ingredient) return res.status(404).json({ success: false, message: 'Ingredient not found' });
    if (ingredient.currentStock < quantity) return res.status(400).json({ success: false, message: 'Current stock is lower than requested waste quantity' });
    ingredient.currentStock -= quantity;
    await ingredient.save();
    await InventoryLedger.create({ ingredientId: ingredient._id, type: 'waste', quantity: -quantity, balanceAfter: ingredient.currentStock, referenceType: 'StockAdjustment', referenceId: String(adjustment._id), note: adjustment.reason, createdBy: req.user.name });
    adjustment.newQuantity = ingredient.currentStock;
    adjustment.difference = -quantity;
    adjustment.status = 'approved';
    adjustment.approvedBy = req.user.name;
    adjustment.reviewedBy = req.user.name;
    adjustment.reviewedAt = new Date();
    await adjustment.save();
    res.json({ success: true, data: adjustment });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.post('/:id/reject', async (req, res) => {
  try {
    if (!['admin', 'manager'].includes(req.user?.role)) return res.status(403).json({ success: false, message: 'Only admin or manager can reject waste' });
    const adjustment = await StockAdjustment.findById(req.params.id);
    if (!adjustment) return res.status(404).json({ success: false, message: 'Adjustment not found' });
    if (adjustment.status !== 'pending') return res.status(409).json({ success: false, message: 'Adjustment is already reviewed' });
    adjustment.status = 'rejected';
    adjustment.reviewedBy = req.user.name;
    adjustment.reviewedAt = new Date();
    await adjustment.save();
    res.json({ success: true, data: adjustment });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const body = req.body || {};
    const itemName = body.ingredientName || body.itemName || body.name || 'Ingredient';
    const suppliedType = String(body.adjustmentType || body.type || 'correction');
    const normalizedType = ['increase', 'decrease', 'waste', 'correction'].includes(suppliedType.toLowerCase())
      ? suppliedType.toLowerCase()
      : 'correction';

    let ingredient = null;

    if (body.ingredientId) {
      ingredient = await Ingredient.findById(body.ingredientId);
    }

    if (!ingredient) {
      ingredient = await Ingredient.findOne({ name: { $regex: `^${itemName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' } });
    }

    if (!ingredient) {
      ingredient = await Ingredient.create({
        name: itemName,
        unit: body.unit || 'kg',
        currentStock: 0,
        minStockAlert: Number(body.minStockAlert || 5),
        costPerUnit: Number(body.costPerUnit || 0)
      });
    }

    const previousQuantity = Number(ingredient.currentStock || 0);
    const quantityDelta = Number(body.quantity ?? 0);
    const requestedQuantity = Number(body.newQuantity ?? body.currentStock ?? body.quantity ?? previousQuantity);

    let finalQuantity = requestedQuantity;
    if (body.newQuantity == null && body.quantity != null) {
      if (normalizedType === 'increase') finalQuantity = previousQuantity + quantityDelta;
      if (normalizedType === 'decrease') finalQuantity = Math.max(0, previousQuantity - quantityDelta);
      if (normalizedType === 'waste') finalQuantity = Math.max(0, previousQuantity - quantityDelta);
    }

    ingredient.currentStock = finalQuantity;
    await ingredient.save();

    await InventoryLedger.create({
      ingredientId: ingredient._id,
      type: normalizedType === 'waste' ? 'waste' : 'adjustment',
      quantity: finalQuantity - previousQuantity,
      balanceAfter: finalQuantity,
      referenceType: 'StockAdjustment',
      note: body.reason || 'Manual stock adjustment',
      createdBy: req.user?.name || 'Manager'
    });

    const adjustment = await StockAdjustment.create({
      ingredientId: ingredient._id,
      ingredientName: ingredient.name,
      previousQuantity,
      newQuantity: finalQuantity,
      difference: finalQuantity - previousQuantity,
      reason: body.reason || 'Manual stock adjustment',
      approvedBy: body.approvedBy || req.user?.name || 'Manager',
      type: normalizedType
    });

    res.status(201).json({ success: true, data: adjustment });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

module.exports = router;
