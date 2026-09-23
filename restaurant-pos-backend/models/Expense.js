const mongoose = require('mongoose');

const expenseSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true },
  category: { type: String, required: true, trim: true },
  amount: { type: Number, required: true, min: 0 },
  paidTo: { type: String, default: '', trim: true },
  paymentMode: { 
    type: String, 
    enum: ['Cash', 'UPI', 'Card', 'Bank Transfer'], 
    default: 'Cash' 
  },
  billNumber: { type: String, default: '', trim: true },
  notes: { type: String, default: '', trim: true },
  date: { type: String, required: true }, // Format: YYYY-MM-DD
  recordedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  recordedByName: { type: String, default: 'Staff' }
}, { timestamps: true });

// Compound indexes for snappy filtering and reporting
expenseSchema.index({ date: -1, createdAt: -1 });
expenseSchema.index({ category: 1, paymentMode: 1 });

module.exports = mongoose.model('Expense', expenseSchema);