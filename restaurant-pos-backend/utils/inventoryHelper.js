const Recipe = require('../models/Recipe');
const Ingredient = require('../models/Ingredient');
const MenuItem = require('../models/Item');
const InventoryLedger = require('../models/InventoryLedger');
const InventoryBatch = require('../models/InventoryBatch');

const consumeIngredientStock = async (ingredientId, quantity, referenceId, note) => {
  let remaining = Number(quantity);
  const allocations = [];
  const batches = await InventoryBatch.find({
    ingredientId,
    quantityRemaining: { $gt: 0 },
    $or: [{ expiryDate: null }, { expiryDate: { $gte: new Date() } }]
  }).sort({ expiryDate: 1, receivedAt: 1 });

  for (const batch of batches) {
    if (remaining <= 0) break;
    const used = Math.min(remaining, batch.quantityRemaining);
    batch.quantityRemaining -= used;
    batch.status = batch.quantityRemaining === 0 ? 'depleted' : 'active';
    await batch.save();
    allocations.push({ batch, used });
    remaining -= used;
  }

  return { remaining, allocations };
};

// Validate inventory stock without deducting
const validateStockForOrder = async (orderItems) => {
  const requiredByIngredient = new Map();
  const missingRecipes = [];
  
  for (const item of orderItems || []) {
    const recipe = await Recipe.findOne({ itemId: item.itemId || item._id }).lean();
    if (!recipe || !recipe.ingredients || recipe.ingredients.length === 0) {
      continue; // Skip items without recipes gracefully (e.g. packages, decor, or items not yet mapped)
    }
    for (const ing of recipe.ingredients) {
      const required = Number(ing.quantityRequired || 0) * Number(item.quantity || 1);
      requiredByIngredient.set(String(ing.ingredientId), (requiredByIngredient.get(String(ing.ingredientId)) || 0) + required);
    }
  }
  
  for (const [ingredientId, required] of requiredByIngredient) {
    const ingredient = await Ingredient.findById(ingredientId).select('name currentStock minStockAlert');
    if (!ingredient) throw new Error(`Ingredient ${ingredientId} not found while validating stock`);
    if (Number(ingredient.currentStock) < required) {
      throw new Error(`Insufficient stock for ${ingredient.name}. Required: ${required}, available: ${ingredient.currentStock}`);
    }
  }
  
  return {};
};

// Deduct inventory stock when order is placed or completed & update menu availability
const deductStockForOrder = async (orderItems, referenceId = '') => {
  // We can skip validation here if it's already done, but it's safer to keep it or just trust the earlier call.
  // We'll leave it as is to avoid breaking anything else, or just rely on the new validateStockForOrder.
  const requiredByIngredient = new Map();
  for (const item of orderItems || []) {
    const recipe = await Recipe.findOne({ itemId: item.itemId || item._id }).lean();
    if (!recipe) continue;
    for (const ing of recipe.ingredients) {
      const required = Number(ing.quantityRequired || 0) * Number(item.quantity || 1);
      requiredByIngredient.set(String(ing.ingredientId), (requiredByIngredient.get(String(ing.ingredientId)) || 0) + required);
    }
  }
  for (const [ingredientId, required] of requiredByIngredient) {
    const ingredient = await Ingredient.findById(ingredientId).select('name currentStock minStockAlert');
    if (!ingredient) throw new Error(`Ingredient ${ingredientId} not found while deducting stock`);
    if (Number(ingredient.currentStock) < required) {
      throw new Error(`Insufficient stock for ${ingredient.name}. Required: ${required}, available: ${ingredient.currentStock}`);
    }
  }
  for (const item of orderItems) {
      const recipe = await Recipe.findOne({ itemId: item.itemId || item._id });
      if (!recipe) continue; // Skip if no recipe mapped

      for (const ing of recipe.ingredients) {
        const totalQtyNeeded = ing.quantityRequired * (item.quantity || 1);
        
        const batchConsumption = await consumeIngredientStock(ing.ingredientId, totalQtyNeeded, null, item.name);
        // Opening stock without a batch remains supported as a legacy fallback.
        const ingredientDeduction = batchConsumption.remaining;
        const updatedIngredient = await Ingredient.findOneAndUpdate(
          { _id: ing.ingredientId, currentStock: { $gte: ingredientDeduction } },
          { $inc: { currentStock: -ingredientDeduction } },
          { new: true }
        );
        if (!updatedIngredient) {
          const ingredient = await Ingredient.findById(ing.ingredientId).select('name currentStock minStockAlert');
          if (!ingredient) throw new Error(`Ingredient ${ing.ingredientId} not found while deducting stock`);
          throw new Error(`Insufficient stock for ${ingredient.name}. Available: ${ingredient.currentStock}`);
        }
        for (const allocation of batchConsumption.allocations) {
          await InventoryLedger.create({ ingredientId: ing.ingredientId, batchId: allocation.batch._id, type: 'sale', quantity: -allocation.used, balanceAfter: updatedIngredient.currentStock, referenceType: 'Order', referenceId: String(referenceId || ''), note: `FIFO consumption for menu item ${item.name || item.itemId}` });
        }
        if (batchConsumption.remaining > 0) {
          await InventoryLedger.create({ ingredientId: ing.ingredientId, type: 'sale', quantity: -batchConsumption.remaining, balanceAfter: updatedIngredient.currentStock, referenceType: 'Order', referenceId: String(referenceId || ''), note: `Opening-stock consumption for menu item ${item.name || item.itemId}` });
        }

        // 2. Agar raw material khatam ho gaya (currentStock <= 0)
        if (updatedIngredient.currentStock <= updatedIngredient.minStockAlert) {
          const recipes = await Recipe.find({ 'ingredients.ingredientId': ing.ingredientId }).select('itemId');
          await MenuItem.updateMany(
            { _id: { $in: recipes.map((recipe) => recipe.itemId) } },
            { $set: { isAvailable: false } }
          );
        }
      }
    }
};

const restoreStockForOrder = async (orderItems, referenceId, createdBy = 'Refund') => {
  const saleLedger = await InventoryLedger.find({ referenceType: 'Order', referenceId: String(referenceId || ''), type: 'sale', batchId: { $ne: null } });
  if (saleLedger.length) {
    const restoreByBatch = new Map();
    saleLedger.forEach((entry) => restoreByBatch.set(String(entry.batchId), (restoreByBatch.get(String(entry.batchId)) || 0) + Math.abs(entry.quantity)));
    for (const [batchId, quantity] of restoreByBatch) {
      const batch = await InventoryBatch.findByIdAndUpdate(batchId, { $inc: { quantityRemaining: quantity }, $set: { status: 'active', disposedAt: null, disposedBy: '' } }, { new: true });
      if (!batch) continue;
      const ingredient = await Ingredient.findByIdAndUpdate(batch.ingredientId, { $inc: { currentStock: quantity } }, { new: true });
      await InventoryLedger.create({ ingredientId: batch.ingredientId, batchId: batch._id, type: 'return', quantity, balanceAfter: ingredient.currentStock, referenceType: 'Refund', referenceId: String(referenceId), note: `Restored to batch ${batch.batchNo}`, createdBy });
    }
    return;
  }
  for (const item of orderItems || []) {
    const recipe = await Recipe.findOne({ itemId: item.itemId || item._id });
    if (!recipe) continue;
    for (const ing of recipe.ingredients) {
      const quantity = Number(ing.quantityRequired || 0) * Number(item.quantity || 1);
      if (!quantity) continue;
      const updatedIngredient = await Ingredient.findByIdAndUpdate(
        ing.ingredientId,
        { $inc: { currentStock: quantity } },
        { new: true }
      );
      if (!updatedIngredient) throw new Error(`Ingredient ${ing.ingredientId} not found while restoring stock`);
      await InventoryLedger.create({
        ingredientId: ing.ingredientId,
        type: 'return',
        quantity,
        balanceAfter: updatedIngredient.currentStock,
        referenceType: 'Refund',
        referenceId: String(referenceId || ''),
        note: `Stock restored for refunded item ${item.name || item.itemId}`,
        createdBy
      });
      if (updatedIngredient.currentStock > updatedIngredient.minStockAlert) {
        const recipes = await Recipe.find({ 'ingredients.ingredientId': ing.ingredientId }).select('itemId');
        await MenuItem.updateMany({ _id: { $in: recipes.map((recipe) => recipe.itemId) } }, { $set: { isAvailable: true } });
      }
    }
  }
};

const restoreStockForItems = async (items, referenceId, createdBy = 'Void Item') => {
  for (const item of items || []) {
    const recipe = await Recipe.findOne({ itemId: item.itemId || item.originalId || item._id });
    if (!recipe) continue;
    for (const ing of recipe.ingredients) {
      const quantity = Number(ing.quantityRequired || 0) * Number(item.quantity || 1);
      if (!quantity) continue;
      const updatedIngredient = await Ingredient.findByIdAndUpdate(
        ing.ingredientId,
        { $inc: { currentStock: quantity } },
        { new: true }
      );
      if (!updatedIngredient) continue;
      await InventoryLedger.create({
        ingredientId: ing.ingredientId,
        type: 'return',
        quantity,
        balanceAfter: updatedIngredient.currentStock,
        referenceType: 'Void Item',
        referenceId: String(referenceId || ''),
        note: `Stock restored for cancelled item ${item.name || item.itemId}`,
        createdBy
      });
      if (updatedIngredient.currentStock > updatedIngredient.minStockAlert) {
        const recipes = await Recipe.find({ 'ingredients.ingredientId': ing.ingredientId }).select('itemId');
        await MenuItem.updateMany({ _id: { $in: recipes.map((r) => r.itemId) } }, { $set: { isAvailable: true } });
      }
    }
  }
};

module.exports = { deductStockForOrder, restoreStockForOrder, restoreStockForItems, validateStockForOrder };