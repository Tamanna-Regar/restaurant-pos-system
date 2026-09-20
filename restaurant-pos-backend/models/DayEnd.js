const mongoose = require('mongoose');

const dayEndSchema = new mongoose.Schema({
  businessDate: { type: String, required: true },
  status: { type: String, enum: ['open', 'closed'], default: 'open' },
  openingCash: { type: Number, default: 0, min: 0 },
  cashSales: { type: Number, default: 0, min: 0 },
  cashExpenses: { type: Number, default: 0, min: 0 },
  expectedCash: { type: Number, default: 0 },
  closingCash: { type: Number, default: null, min: 0 },
  variance: { type: Number, default: null },
  paymentTotals: { type: mongoose.Schema.Types.Mixed, default: {} },
  closedBy: { type: String, default: '' },
  notes: { type: String, default: '' },
  closedAt: { type: Date, default: null }
}, { timestamps: true });

dayEndSchema.index({ businessDate: 1 }, { unique: true });
module.exports = mongoose.model('DayEnd', dayEndSchema);
