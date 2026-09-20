const mongoose = require('mongoose');

const overtimeRequestSchema = new mongoose.Schema({
  staffId: { type: mongoose.Schema.Types.ObjectId, ref: 'Staff', required: true },
  month: { type: String, required: true },
  hours: { type: Number, required: true, min: 0 },
  ratePerHour: { type: Number, default: 100, min: 0 },
  reason: { type: String, default: '' },
  status: { type: String, enum: ['Pending', 'Approved', 'Rejected'], default: 'Pending' },
  requestedBy: { type: String, default: 'Staff' },
  reviewedBy: { type: String, default: '' },
  reviewedAt: { type: Date, default: null }
}, { timestamps: true });

module.exports = mongoose.model('OvertimeRequest', overtimeRequestSchema);
