const mongoose = require('mongoose');

const stockAdjustmentSchema = new mongoose.Schema({
  ingredientId: { type: mongoose.Schema.Types.ObjectId, ref: 'Ingredient', required: true },
  ingredientName: { type: String, default: '' },
  previousQuantity: { type: Number, required: true },
  newQuantity: { type: Number, required: true },
  difference: { type: Number, required: true },
  reason: { type: String, default: '' },
  approvedBy: { type: String, default: 'System' },
  requestedBy: { type: String, default: 'System' },
  reviewedBy: { type: String, default: '' },
  reviewedAt: { type: Date, default: null },
  status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'approved' },
  type: { type: String, enum: ['increase', 'decrease', 'waste', 'correction'], default: 'correction' }
}, { timestamps: true });

module.exports = mongoose.model('StockAdjustment', stockAdjustmentSchema);
