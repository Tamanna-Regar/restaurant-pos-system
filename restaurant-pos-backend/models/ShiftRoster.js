const mongoose = require('mongoose');

const shiftRosterSchema = new mongoose.Schema({
  staffId: { type: mongoose.Schema.Types.ObjectId, ref: 'Staff', required: true },
  date: { type: String, required: true },
  shift: { type: String, required: true },
  assignedBy: { type: String, default: 'Manager' }
}, { timestamps: true });

shiftRosterSchema.index({ staffId: 1, date: 1 }, { unique: true });
module.exports = mongoose.model('ShiftRoster', shiftRosterSchema);
