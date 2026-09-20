const express = require('express');
const router = express.Router();
const Ingredient = require('../models/Ingredient'); // Aapka MongoDB model
const InventoryLedger = require('../models/InventoryLedger');

const serialize = (ingredient) => ({
  ...ingredient.toObject(),
  stock: Number(ingredient.currentStock || 0),
  minLimit: Number(ingredient.minStockAlert || 0)
});

router.get('/low-stock', async (req, res) => {
  try {
    const ingredients = await Ingredient.find({
      $expr: { $lte: ['$currentStock', '$minStockAlert'] }
    }).sort({ currentStock: 1, name: 1 });
    res.json({ success: true, data: ingredients.map(serialize) });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.get('/reorder-suggestions', async (req, res) => {
  try {
    const ingredients = await Ingredient.find({ $expr: { $lte: ['$currentStock', '$minStockAlert'] } }).sort({ currentStock: 1, name: 1 });
    res.json({ success: true, data: ingredients.map((ingredient) => ({
      ...serialize(ingredient),
      suggestedQuantity: Math.max(Number(ingredient.minStockAlert || 0) * 2 - Number(ingredient.currentStock || 0), 0),
      estimatedCost: Number((Math.max(Number(ingredient.minStockAlert || 0) * 2 - Number(ingredient.currentStock || 0), 0) * Number(ingredient.costPerUnit || 0)).toFixed(2))
    })) });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET: Sabhi ingredients fetch karne ke liye
router.get('/', async (req, res) => {
  try {
    const ingredients = await Ingredient.find();
    res.json(ingredients.map(serialize));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const ingredient = await Ingredient.create({
      name: String(req.body.name || '').trim(),
      unit: req.body.unit,
      currentStock: Number(req.body.stock ?? req.body.currentStock ?? 0),
      minStockAlert: Number(req.body.minLimit ?? req.body.minStockAlert ?? 0),
      costPerUnit: Number(req.body.costPerUnit || 0)
    });
    await InventoryLedger.create({
      ingredientId: ingredient._id,
      type: 'adjustment',
      quantity: ingredient.currentStock,
      balanceAfter: ingredient.currentStock,
      note: 'Opening stock'
    });
    const io = req.app.get('io');
    if (io && ingredient.currentStock <= ingredient.minStockAlert) io.emit('inventory-low-stock', { ingredient: serialize(ingredient) });
    res.status(201).json({ success: true, data: serialize(ingredient) });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const existing = await Ingredient.findById(req.params.id);
    if (!existing) return res.status(404).json({ success: false, message: 'Ingredient not found' });
    const update = {};
    if (req.body.name !== undefined) update.name = String(req.body.name).trim();
    if (req.body.unit !== undefined) update.unit = req.body.unit;
    if (req.body.stock !== undefined) update.currentStock = Number(req.body.stock);
    if (req.body.minLimit !== undefined) update.minStockAlert = Number(req.body.minLimit);
    if (req.body.costPerUnit !== undefined) update.costPerUnit = Number(req.body.costPerUnit);
    const ingredient = await Ingredient.findByIdAndUpdate(req.params.id, update, { new: true, runValidators: true });
    if (update.currentStock !== undefined) {
      await InventoryLedger.create({
        ingredientId: ingredient._id,
        type: 'adjustment',
        quantity: ingredient.currentStock - existing.currentStock,
        balanceAfter: ingredient.currentStock,
        note: 'Manual stock update'
      });
    }
    const io = req.app.get('io');
    if (io && ingredient.currentStock <= ingredient.minStockAlert) io.emit('inventory-low-stock', { ingredient: serialize(ingredient) });
    res.json({ success: true, data: serialize(ingredient) });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const deleted = await Ingredient.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ success: false, message: 'Ingredient not found' });
    res.json({ success: true, message: 'Ingredient deleted successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;