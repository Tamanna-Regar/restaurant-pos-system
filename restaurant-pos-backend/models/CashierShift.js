const mongoose = require('mongoose');

const cashMovementSchema = new mongoose.Schema({
  type: { type: String, enum: ['cash-in', 'cash-out'], required: true },
  amount: { type: Number, required: true, min: 0.01 },
  reason: { type: String, required: true, trim: true, maxlength: 200 },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  createdAt: { type: Date, default: Date.now }
}, { _id: true });

const cashierShiftSchema = new mongoose.Schema({
  cashier: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  businessDate: { type: String, required: true },
  status: { type: String, enum: ['open', 'closed', 'handed-over'], default: 'open' },
  openingCash: { type: Number, required: true, min: 0 },
  closingCash: { type: Number, default: null, min: 0 },
  expectedCash: { type: Number, default: null },
  variance: { type: Number, default: null },
  movements: { type: [cashMovementSchema], default: [] },
  closedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  closedAt: { type: Date, default: null },
  approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  approvedAt: { type: Date, default: null },
  notes: { type: String, default: '', maxlength: 500 },
  denominations: {
    d500: { type: Number, default: 0 },
    d200: { type: Number, default: 0 },
    d100: { type: Number, default: 0 },
    d50: { type: Number, default: 0 },
    d20: { type: Number, default: 0 },
    d10: { type: Number, default: 0 },
    coins: { type: Number, default: 0 }
  }
}, { timestamps: true });

cashierShiftSchema.index({ cashier: 1, status: 1 });
cashierShiftSchema.index({ businessDate: 1, cashier: 1 });

module.exports = mongoose.model('CashierShift', cashierShiftSchema);
