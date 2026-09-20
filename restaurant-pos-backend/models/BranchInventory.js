const mongoose = require('mongoose');

const branchInventorySchema = new mongoose.Schema({
  branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', required: true },
  ingredientId: { type: mongoose.Schema.Types.ObjectId, ref: 'Ingredient', required: true },
  quantity: { type: Number, default: 0, min: 0 },
  minStockAlert: { type: Number, default: 0, min: 0 },
  updatedBy: { type: String, default: '' }
}, { timestamps: true });

branchInventorySchema.index({ branchId: 1, ingredientId: 1 }, { unique: true });

module.exports = mongoose.model('BranchInventory', branchInventorySchema);
