const mongoose = require('mongoose');

const ingredientSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true }, // e.g., 'Paneer', 'Butter', 'Cooking Oil'
  unit: { type: String, required: true, enum: ['kg', 'gm', 'ltr', 'ml', 'pcs', 'pack'] },
  currentStock: { type: Number, required: true, default: 0 },
  minStockAlert: { type: Number, default: 5 }, // Low stock notification threshold
  costPerUnit: { type: Number, default: 0 }, // Purchase price per unit
  stockByLocation: { type: Map, of: Number, default: {} }
}, { timestamps: true });

module.exports = mongoose.model('Ingredient', ingredientSchema);