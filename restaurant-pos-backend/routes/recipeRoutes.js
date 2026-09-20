const express = require('express');
const Recipe = require('../models/Recipe');
const Ingredient = require('../models/Ingredient');
const MenuItem = require('../models/Item');

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const recipes = await Recipe.find().populate('itemId').populate('ingredients.ingredientId');
    res.json({ success: true, data: recipes });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const { itemId, ingredients = [] } = req.body;
    if (!itemId || !Array.isArray(ingredients) || ingredients.length === 0) {
      return res.status(400).json({ success: false, message: 'itemId and ingredients are required' });
    }
    if (!await MenuItem.exists({ _id: itemId })) {
      return res.status(400).json({ success: false, message: 'Menu item not found' });
    }
    const normalizedIngredients = ingredients.map((item) => ({
      ingredientId: item.ingredientId,
      quantityRequired: Number(item.quantityRequired)
    }));
    if (normalizedIngredients.some((item) => !item.ingredientId || !Number.isFinite(item.quantityRequired) || item.quantityRequired <= 0)) {
      return res.status(400).json({ success: false, message: 'Each recipe ingredient needs a valid positive quantity' });
    }
    const ingredientCount = await Ingredient.countDocuments({ _id: { $in: normalizedIngredients.map((item) => item.ingredientId) } });
    if (ingredientCount !== normalizedIngredients.length) {
      return res.status(400).json({ success: false, message: 'One or more ingredients were not found' });
    }
    const recipe = await Recipe.findOneAndUpdate(
      { itemId },
      { itemId, ingredients: normalizedIngredients },
      { upsert: true, new: true, runValidators: true }
    );
    res.status(201).json({ success: true, data: recipe });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.get('/cost/:itemId', async (req, res) => {
  try {
    const recipe = await Recipe.findOne({ itemId: req.params.itemId }).populate('ingredients.ingredientId').populate('itemId');
    if (!recipe) return res.status(404).json({ success: false, message: 'Recipe not found' });
    const breakdown = recipe.ingredients.map((entry) => {
      const ingredient = entry.ingredientId;
      const quantity = Number(entry.quantityRequired || 0);
      const unitCost = Number(ingredient?.costPerUnit || 0);
      return {
        ingredientId: ingredient?._id,
        name: ingredient?.name,
        unit: ingredient?.unit,
        quantity,
        unitCost,
        cost: Number((quantity * unitCost).toFixed(2))
      };
    });
    const cost = breakdown.reduce((sum, entry) => sum + entry.cost, 0);
    const sellingPrice = Number(recipe.itemId?.price || 0);
    res.json({
      success: true,
      data: {
        item: recipe.itemId,
        breakdown,
        cost: Number(cost.toFixed(2)),
        sellingPrice,
        margin: Number((sellingPrice - cost).toFixed(2)),
        foodCostPercent: sellingPrice > 0 ? Number(((cost / sellingPrice) * 100).toFixed(2)) : null
      }
    });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const deleted = await Recipe.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ success: false, message: 'Recipe not found' });
    res.json({ success: true, message: 'Recipe deleted successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
