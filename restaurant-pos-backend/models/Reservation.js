const mongoose = require('mongoose');

const reservationSchema = new mongoose.Schema({
  customerName: { type: String, required: true },
  phone: { type: String, required: true },
  tableNumber: { type: String, required: true },
  date: { type: String, required: true },      // e.g. "2026-09-20"
  timeSlot: { type: String, required: true },    // e.g. "08:00 PM - 10:00 PM"
  guests: { type: Number, required: true },
  status: { type: String, default: 'Confirmed' } // Confirmed, Completed, Cancelled
}, { timestamps: true });

module.exports = mongoose.model('Reservation', reservationSchema);