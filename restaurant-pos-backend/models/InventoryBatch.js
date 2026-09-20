const mongoose = require('mongoose');

const inventoryBatchSchema = new mongoose.Schema({
  ingredientId: { type: mongoose.Schema.Types.ObjectId, ref: 'Ingredient', required: true },
  purchaseOrderId: { type: mongoose.Schema.Types.ObjectId, ref: 'PurchaseOrder', required: true, unique: true },
  itemName: { type: String, required: true, trim: true },
  supplierName: { type: String, default: '' },
  batchNo: { type: String, required: true, trim: true },
  quantityReceived: { type: Number, required: true, min: 0 },
  quantityRemaining: { type: Number, required: true, min: 0 },
  unit: { type: String, default: 'kg' },
  unitCost: { type: Number, default: 0, min: 0 },
  expiryDate: { type: Date, default: null },
  receivedAt: { type: Date, default: Date.now },
  status: { type: String, enum: ['active', 'depleted', 'expired', 'disposed'], default: 'active' },
  disposedAt: { type: Date, default: null },
  disposedBy: { type: String, default: '' }
}, { timestamps: true });

inventoryBatchSchema.index({ ingredientId: 1, expiryDate: 1 });
module.exports = mongoose.model('InventoryBatch', inventoryBatchSchema);
