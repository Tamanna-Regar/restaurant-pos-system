const mongoose = require('mongoose');

const salaryPaymentSchema = new mongoose.Schema({
  staffId: { type: mongoose.Schema.Types.ObjectId, ref: 'Staff', required: true },
  month: { type: String, required: true },
  amount: { type: Number, required: true, min: 0 },
  paymentMode: { type: String, enum: ['Cash', 'Bank Transfer', 'UPI', 'Cheque'], default: 'Bank Transfer' },
  reference: { type: String, default: '' },
  paidBy: { type: String, default: 'Admin' },
  paidAt: { type: Date, default: Date.now }
}, { timestamps: true });

salaryPaymentSchema.index({ staffId: 1, month: 1 });
module.exports = mongoose.model('SalaryPayment', salaryPaymentSchema);
