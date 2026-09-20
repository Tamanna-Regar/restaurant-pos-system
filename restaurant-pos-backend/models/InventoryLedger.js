const mongoose = require('mongoose');

const inventoryLedgerSchema = new mongoose.Schema({
  ingredientId: { type: mongoose.Schema.Types.ObjectId, ref: 'Ingredient', required: true },
  batchId: { type: mongoose.Schema.Types.ObjectId, ref: 'InventoryBatch', default: null },
  type: { type: String, enum: ['purchase', 'sale', 'waste', 'adjustment', 'return', 'transfer'], required: true },
  quantity: { type: Number, required: true },
  balanceAfter: { type: Number, required: true },
  referenceType: { type: String, default: '' },
  referenceId: { type: String, default: '' },
  note: { type: String, default: '' },
  createdBy: { type: String, default: 'System' }
}, { timestamps: true });

inventoryLedgerSchema.index({ ingredientId: 1, createdAt: -1 });
module.exports = mongoose.model('InventoryLedger', inventoryLedgerSchema);
