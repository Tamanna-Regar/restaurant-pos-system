const mongoose = require('mongoose');

const stockTransferSchema = new mongoose.Schema({
  ingredientId: { type: mongoose.Schema.Types.ObjectId, ref: 'Ingredient', required: true },
  quantity: { type: Number, required: true, min: 0.0001 },
  unit: { type: String, required: true },
  fromLocation: { type: String, required: true, trim: true },
  toLocation: { type: String, required: true, trim: true },
  fromBranchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', default: null },
  toBranchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', default: null },
  note: { type: String, default: '', maxlength: 250 },
  transferredBy: { type: String, default: 'Inventory Staff' }
}, { timestamps: true });

module.exports = mongoose.model('StockTransfer', stockTransferSchema);
