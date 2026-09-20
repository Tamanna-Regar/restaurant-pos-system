const mongoose = require('mongoose');

const purchaseReturnSchema = new mongoose.Schema({
  purchaseOrderId: { type: mongoose.Schema.Types.ObjectId, ref: 'PurchaseOrder', default: null },
  batchId: { type: mongoose.Schema.Types.ObjectId, ref: 'InventoryBatch', default: null },
  ingredientId: { type: mongoose.Schema.Types.ObjectId, ref: 'Ingredient', required: true },
  itemName: { type: String, required: true },
  supplierName: { type: String, required: true },
  quantity: { type: Number, required: true },
  amount: { type: Number, default: 0 },
  reason: { type: String, default: '' },
  returnedBy: { type: String, default: 'System' },
  returnedAt: { type: Date, default: Date.now }
}, { timestamps: true });

module.exports = mongoose.model('PurchaseReturn', purchaseReturnSchema);