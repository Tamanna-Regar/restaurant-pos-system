const mongoose = require('mongoose');

const purchaseOrderSchema = new mongoose.Schema({
  supplierName: { type: String, required: true, trim: true },
  ingredientId: { type: mongoose.Schema.Types.ObjectId, ref: 'Ingredient', default: null },
  itemName: { type: String, required: true, trim: true },
  category: { type: String, default: 'Vegetables' },
  unit: { type: String, default: 'kg' },
  quantity: { type: Number, required: true, min: 0 },
  unitPrice: { type: Number, required: true, min: 0 },
  totalAmount: { type: Number, required: true, min: 0 },
  batchNo: { type: String, default: '' },
  expiryDate: { type: Date, default: null },
  status: { type: String, enum: ['Pending', 'Approved', 'Received', 'Cancelled'], default: 'Pending' },
  expectedDate: { type: String, default: '' },
  notes: { type: String, default: '' },
  createdBy: { type: String, default: 'System' },
  receivedAt: { type: Date, default: null }
}, { timestamps: true });

module.exports = mongoose.model('PurchaseOrder', purchaseOrderSchema);
