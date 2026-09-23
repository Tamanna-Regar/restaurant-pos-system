const mongoose = require('mongoose');

const reservationSchema = new mongoose.Schema({
  customerName: { type: String, required: true },
  phone: { type: String, required: true },
  tableNumber: { type: String, required: true },
  date: { type: String, required: true },      // e.g. "2026-09-20"
  timeSlot: { type: String, required: true },    // e.g. "19:00" or "08:00 PM - 10:00 PM"
  duration: { type: String, default: '2 Hours' },
  endTime: { type: String, default: '' },
  guests: { type: Number, required: true },
  notes: { type: String, default: '' },
  tableId: { type: mongoose.Schema.Types.ObjectId, ref: 'Table', default: null },
  status: { 
    type: String, 
    enum: ['Pending', 'Confirmed', 'Seated', 'Completed', 'No-show', 'Cancelled'], 
    default: 'Confirmed' 
  }
}, { timestamps: true });

module.exports = mongoose.model('Reservation', reservationSchema);