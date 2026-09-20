const express = require('express');
const router = express.Router();
const Reservation = require('../models/Reservation');

// Get all reservations
router.get('/', async (req, res) => {
  try {
    const reservations = await Reservation.find().sort({ date: 1 });
    res.json(reservations);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Add new reservation with table conflict check
router.post('/', async (req, res) => {
  try {
    const { tableNumber, date, timeSlot } = req.body;

    // Check if this table is already booked for the same date and time slot
    const existingBooking = await Reservation.findOne({ 
      tableNumber, 
      date, 
      timeSlot,
      status: 'Confirmed' 
    });

    if (existingBooking) {
      return res.status(400).json({ 
        error: `Table ${tableNumber} is already booked for this date and time slot!` 
      });
    }

    const newReservation = new Reservation(req.body);
    const saved = await newReservation.save();

    // Real-time socket sync trigger
    const io = req.app.get('io');
    if (io) {
      io.emit('reservation-updated');
    }

    res.json(saved);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/:id/status', async (req, res) => {
  try {
    const allowed = ['Confirmed', 'Completed', 'Cancelled', 'No-show'];
    if (!allowed.includes(req.body.status)) return res.status(400).json({ success: false, message: 'Invalid reservation status' });
    const reservation = await Reservation.findByIdAndUpdate(req.params.id, { status: req.body.status }, { new: true, runValidators: true });
    if (!reservation) return res.status(404).json({ success: false, message: 'Reservation not found' });
    const io = req.app.get('io');
    if (io) io.emit('reservation-updated', reservation);
    res.json({ success: true, data: reservation });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;