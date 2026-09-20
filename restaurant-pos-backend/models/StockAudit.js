const mongoose = require('mongoose');

const stockAuditSchema = new mongoose.Schema({
  ingredientId: { type: mongoose.Schema.Types.ObjectId, ref: 'Ingredient', required: true },
  ingredientName: { type: String, required: true, trim: true },
  systemQuantity: { type: Number, required: true },
  countedQuantity: { type: Number, required: true, min: 0 },
  variance: { type: Number, required: true },
  reason: { type: String, default: '', trim: true },
  auditedBy: { type: String, default: 'Inventory Staff' }
}, { timestamps: true });

stockAuditSchema.index({ ingredientId: 1, createdAt: -1 });
module.exports = mongoose.model('StockAudit', stockAuditSchema);
