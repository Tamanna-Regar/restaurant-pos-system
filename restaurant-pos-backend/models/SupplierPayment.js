const mongoose = require('mongoose');

const supplierPaymentSchema = new mongoose.Schema({
  supplierName: { type: String, required: true, trim: true },
  amount: { type: Number, required: true, min: 0.01 },
  paymentMode: { type: String, enum: ['Cash', 'UPI', 'Bank Transfer', 'Card', 'Cheque'], default: 'Bank Transfer' },
  reference: { type: String, default: '' },
  notes: { type: String, default: '' },
  paidBy: { type: String, default: 'System' },
  paidAt: { type: Date, default: Date.now }
}, { timestamps: true });

supplierPaymentSchema.index({ supplierName: 1, paidAt: -1 });
module.exports = mongoose.model('SupplierPayment', supplierPaymentSchema);
