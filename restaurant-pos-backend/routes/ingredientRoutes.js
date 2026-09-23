const express = require('express');
const router = express.Router();
const Ingredient = require('../models/Ingredient'); // Aapka MongoDB model
const InventoryLedger = require('../models/InventoryLedger');

const serialize = (ingredient) => ({
  ...ingredient.toObject(),
  category: ingredient.category || 'General',
  stock: Number(ingredient.currentStock || 0),
  minLimit: Number(ingredient.minStockAlert || 0),
  barcode: ingredient.barcode || '',
  stockByLocation: ingredient.stockByLocation ? Object.fromEntries(ingredient.stockByLocation) : {}
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
    const providedLocations = req.body.stockByLocation || {};
    const totalStock = Object.keys(providedLocations).length > 0 
      ? Object.values(providedLocations).reduce((sum, val) => sum + Number(val || 0), 0)
      : Number(req.body.stock ?? req.body.currentStock ?? 0);

    const ingredient = await Ingredient.create({
      name: String(req.body.name || '').trim(),
      category: req.body.category || 'General',
      unit: req.body.unit,
      currentStock: totalStock,
      minStockAlert: Number(req.body.minLimit ?? req.body.minStockAlert ?? 0),
      costPerUnit: Number(req.body.costPerUnit || 0),
      barcode: String(req.body.barcode || '').trim(),
      stockByLocation: providedLocations
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
    if (req.body.category !== undefined) update.category = String(req.body.category).trim();
    if (req.body.unit !== undefined) update.unit = req.body.unit;
    if (req.body.minLimit !== undefined) update.minStockAlert = Number(req.body.minLimit);
    if (req.body.costPerUnit !== undefined) update.costPerUnit = Number(req.body.costPerUnit);
    if (req.body.barcode !== undefined) update.barcode = String(req.body.barcode).trim();
    
    if (req.body.stockByLocation !== undefined) {
      update.stockByLocation = req.body.stockByLocation;
      update.currentStock = Object.values(req.body.stockByLocation).reduce((sum, val) => sum + Number(val || 0), 0);
    } else if (req.body.stock !== undefined) {
      update.currentStock = Number(req.body.stock);
    }
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

router.post('/bulk-import', async (req, res) => {
  try {
    const rawItems = Array.isArray(req.body.items) ? req.body.items : [];
    if (!rawItems.length) {
      return res.status(400).json({ success: false, message: 'No items provided for bulk import' });
    }

    let createdCount = 0;
    let updatedCount = 0;
    const processed = [];

    for (const raw of rawItems) {
      const name = String(raw.name || '').trim();
      if (!name) continue;

      const category = String(raw.category || 'General').trim();
      const unit = String(raw.unit || 'kg').trim();
      const stock = Math.max(0, Number(raw.stock ?? raw.currentStock ?? 0));
      const minLimit = Math.max(0, Number(raw.minLimit ?? raw.minStockAlert ?? 5));
      const costPerUnit = Math.max(0, Number(raw.costPerUnit || 0));
      const barcode = String(raw.barcode || '').trim();
      const stockByLocation = raw.stockByLocation || { 'Main Store': stock, 'Kitchen': 0 };

      let ingredient = await Ingredient.findOne({ name: { $regex: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') } });

      if (ingredient) {
        // Update existing item
        ingredient.category = category || ingredient.category;
        ingredient.unit = unit || ingredient.unit;
        ingredient.minStockAlert = minLimit;
        ingredient.costPerUnit = costPerUnit || ingredient.costPerUnit;
        if (barcode) ingredient.barcode = barcode;
        
        // Add new stock to existing stock
        ingredient.currentStock = Number(ingredient.currentStock || 0) + stock;
        const currentLoc = ingredient.stockByLocation ? Object.fromEntries(ingredient.stockByLocation) : {};
        currentLoc['Main Store'] = (Number(currentLoc['Main Store'] || 0)) + stock;
        ingredient.stockByLocation = currentLoc;

        await ingredient.save();
        await InventoryLedger.create({
          ingredientId: ingredient._id,
          type: 'adjustment',
          quantity: stock,
          balanceAfter: ingredient.currentStock,
          note: 'Bulk CSV import (stock addition)'
        });
        updatedCount++;
        processed.push(serialize(ingredient));
      } else {
        // Create new item
        ingredient = await Ingredient.create({
          name,
          category,
          unit,
          currentStock: stock,
          minStockAlert: minLimit,
          costPerUnit,
          barcode,
          stockByLocation
        });
        await InventoryLedger.create({
          ingredientId: ingredient._id,
          type: 'adjustment',
          quantity: stock,
          balanceAfter: stock,
          note: 'Bulk CSV import (initial creation)'
        });
        createdCount++;
        processed.push(serialize(ingredient));
      }
    }

    const io = req.app.get('io');
    if (io) {
      io.emit('inventory-updated', { message: 'Bulk stock imported' });
    }

    res.json({
      success: true,
      message: `Bulk import completed: ${createdCount} created, ${updatedCount} updated.`,
      createdCount,
      updatedCount,
      totalProcessed: processed.length,
      data: processed
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
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