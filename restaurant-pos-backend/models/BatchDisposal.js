const mongoose = require('mongoose');

const batchDisposalSchema = new mongoose.Schema({
  batchId: { type: mongoose.Schema.Types.ObjectId, ref: 'InventoryBatch', required: true },
  ingredientId: { type: mongoose.Schema.Types.ObjectId, ref: 'Ingredient', required: true },
  batchNo: { type: String, required: true },
  quantity: { type: Number, required: true, min: 0 },
  reason: { type: String, required: true, trim: true },
  status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
  requestedBy: { type: String, default: 'System' },
  reviewedBy: { type: String, default: '' },
  reviewedAt: { type: Date, default: null }
}, { timestamps: true });

batchDisposalSchema.index({ status: 1, createdAt: -1 });
module.exports = mongoose.model('BatchDisposal', batchDisposalSchema);
