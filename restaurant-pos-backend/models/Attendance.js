const mongoose = require('mongoose');

const attendanceSchema = new mongoose.Schema({
  staffId: { type: mongoose.Schema.Types.ObjectId, ref: 'Staff', required: true },
  date: { type: String, required: true },
  status: { type: String, enum: ['present', 'absent', 'leave', 'half-day'], required: true },
  checkIn: { type: Date, default: null },
  checkOut: { type: Date, default: null },
  note: { type: String, default: '' }
}, { timestamps: true });

attendanceSchema.index({ staffId: 1, date: 1 }, { unique: true });
module.exports = mongoose.model('Attendance', attendanceSchema);
