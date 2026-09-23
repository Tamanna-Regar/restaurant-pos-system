const express = require('express');
const router = express.Router();
const Reservation = require('../models/Reservation');
const Table = require('../models/Table');
const { logAudit } = require('../utils/auditLogger');

// Helper to normalize table strings: 'Table 1', 'table 1', 'T-1', '1' -> '1'
function normalizeTable(tbl) {
  if (!tbl) return '';
  return String(tbl)
    .trim()
    .replace(/^table\s*/i, '')
    .replace(/^t-?0*/i, '')
    .trim();
}

// Parse any time string ("19:00", "7:00 PM", "07:00 PM - 09:00 PM") into minutes from midnight
function parseTimeToMinutes(timeStr) {
  if (!timeStr) return null;
  const clean = String(timeStr).trim();
  const firstPart = clean.includes('-') ? clean.split('-')[0].trim() : clean;

  // 12-hour format with AM/PM (e.g. "07:00 PM", "7:30 am")
  const match12 = firstPart.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
  if (match12) {
    let hours = parseInt(match12[1], 10);
    const minutes = parseInt(match12[2], 10);
    const ampm = match12[3] ? match12[3].toUpperCase() : null;

    if (ampm === 'PM' && hours < 12) hours += 12;
    if (ampm === 'AM' && hours === 12) hours = 0;
    return hours * 60 + minutes;
  }

  // 24-hour format "19:00"
  const match24 = firstPart.match(/^(\d{1,2}):(\d{2})$/);
  if (match24) {
    const hours = parseInt(match24[1], 10);
    const minutes = parseInt(match24[2], 10);
    return hours * 60 + minutes;
  }

  return null;
}

// Parse duration string ("1 Hour", "2 Hours", "3 Hours", "4 Hours", or number) into minutes
function parseDurationToMinutes(durationStr, fallbackMinutes = 120) {
  if (!durationStr) return fallbackMinutes;
  const match = String(durationStr).match(/(\d+(\.\d+)?)/);
  if (match) {
    return Math.round(parseFloat(match[1]) * 60);
  }
  return fallbackMinutes;
}

// Format minutes from midnight into 12-hour AM/PM string, e.g. 1140 -> "7:00 PM"
function formatMinutesTo12Hour(totalMinutes) {
  const m = ((totalMinutes % 1440) + 1440) % 1440;
  const hours24 = Math.floor(m / 60);
  const mins = m % 60;
  const ampm = hours24 >= 12 ? 'PM' : 'AM';
  const hours12 = hours24 % 12 || 12;
  return `${hours12}:${String(mins).padStart(2, '0')} ${ampm}`;
}

// Format range string e.g. 1140, 1260 -> "7:00-9:00 PM"
function formatRangeString(startM, endM) {
  const sStr = formatMinutesTo12Hour(startM);
  const eStr = formatMinutesTo12Hour(endM);
  const sParts = sStr.split(' ');
  const eParts = eStr.split(' ');
  if (sParts[1] === eParts[1]) {
    return `${sParts[0]}-${eParts[0]} ${eParts[1]}`;
  }
  return `${sStr} - ${eStr}`;
}

// 1. Get all reservations
router.get('/', async (req, res) => {
  try {
    const reservations = await Reservation.find().sort({ date: 1, timeSlot: 1 });
    res.json(reservations);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 2. Customer Lookup by Phone (for auto-filling previous customer name)
router.get('/customer-lookup/:phone', async (req, res) => {
  try {
    const clean = String(req.params.phone || '').replace(/\D/g, '');
    if (clean.length < 5) return res.json({ success: true, customer: null });

    const regex = new RegExp(clean.slice(-10) + '$');
    const prev = await Reservation.findOne({ phone: regex }).sort({ createdAt: -1 });
    if (prev) {
      return res.json({
        success: true,
        customer: {
          name: prev.customerName,
          phone: prev.phone,
          lastTable: prev.tableNumber
        }
      });
    }
    res.json({ success: true, customer: null });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 3. Add new reservation with strict validations:
// - Past date/time block
// - Guest count vs Table capacity check
// - Double-booking time-range overlap check
// - Special requests / notes field
router.post('/', async (req, res) => {
  try {
    const { 
      customerName, 
      phone, 
      tableNumber, 
      date, 
      timeSlot, 
      duration = '2 Hours', 
      guests, 
      notes = '',
      status = 'Confirmed'
    } = req.body;

    if (!customerName || !phone || !tableNumber || !date || !timeSlot) {
      return res.status(400).json({ error: 'Customer name, phone, table, date and time are required.' });
    }

    const guestsCount = Number(guests || 0);
    if (!Number.isFinite(guestsCount) || guestsCount <= 0) {
      return res.status(400).json({ error: 'Please enter a valid guest count.' });
    }

    // --- 1. PAST DATE / TIME BLOCK ---
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const todayStr = `${year}-${month}-${day}`;
    const currentMinutes = now.getHours() * 60 + now.getMinutes();

    const startMinutes = parseTimeToMinutes(timeSlot);
    if (startMinutes === null) {
      return res.status(400).json({ error: 'Invalid time format. Please provide a valid time (e.g. 19:00).' });
    }

    const durationMinutes = parseDurationToMinutes(duration, 120);
    const endMinutes = startMinutes + durationMinutes;

    if (date < todayStr) {
      return res.status(400).json({ error: 'Past date pe booking allow nahi hai.' });
    }

    if (date === todayStr && startMinutes < currentMinutes) {
      return res.status(400).json({ error: 'Past time pe booking allow nahi hai. Kripya aage ka time chunein.' });
    }

    const normTable = normalizeTable(tableNumber);
    const tableNum = parseInt(normTable, 10);
    const tableDisplayName = String(tableNumber).startsWith('Table') ? tableNumber : `Table ${tableNumber}`;

    // --- 2. GUEST COUNT VS TABLE CAPACITY CHECK ---
    const tableDoc = await Table.findOne({
      $or: [
        { tableNo: !isNaN(tableNum) ? tableNum : -1 },
        { tableNumber: !isNaN(tableNum) ? tableNum : -1 }
      ]
    });

    if (tableDoc && tableDoc.capacity && guestsCount > tableDoc.capacity) {
      return res.status(400).json({
        error: `${tableDisplayName} sirf ${tableDoc.capacity} guests tak hi hold karta hai.`
      });
    }

    // --- 3. DOUBLE-BOOKING TIME RANGE OVERLAP CHECK ---
    const existingBookings = await Reservation.find({
      date,
      status: { $in: ['Confirmed', 'Seated'] }
    });

    for (const existing of existingBookings) {
      if (normalizeTable(existing.tableNumber) === normTable) {
        const existStart = parseTimeToMinutes(existing.timeSlot);
        if (existStart === null) continue;
        const existDuration = parseDurationToMinutes(existing.duration, 120);
        const existEnd = existStart + existDuration;

        // Overlap condition: startA < endB && startB < endA
        if (startMinutes < existEnd && existStart < endMinutes) {
          const rangeStr = formatRangeString(existStart, existEnd);
          return res.status(400).json({
            error: `${tableDisplayName} already booked ${rangeStr} pe.`
          });
        }
      }
    }

    // All checks passed -> Save reservation
    const newReservation = new Reservation({
      customerName: String(customerName).trim(),
      phone: String(phone).trim(),
      tableNumber,
      tableId: tableDoc?._id || null,
      date,
      timeSlot,
      duration,
      endTime: formatMinutesTo12Hour(endMinutes),
      guests: guestsCount,
      notes: String(notes || '').trim(),
      status: status || 'Confirmed'
    });

    const saved = await newReservation.save();

    // Audit log
    await logAudit({
      action: 'RESERVATION_CREATED',
      resource: 'Reservation',
      resourceId: String(saved._id),
      user: req.user,
      metadata: {
        customerName: saved.customerName,
        phone: saved.phone,
        tableNumber: saved.tableNumber,
        date: saved.date,
        timeSlot: saved.timeSlot,
        duration: saved.duration,
        guests: saved.guests,
        notes: saved.notes
      },
      req
    });

    // Real-time socket sync trigger
    const io = req.app.get('io');
    if (io) {
      io.emit('reservation-updated', saved);
    }

    res.status(201).json(saved);
  } catch (err) {
    console.error('Reservation creation error:', err);
    res.status(500).json({ error: err.message });
  }
});

// 4. "Seat Now" endpoint — Link reservation to Table and mark Table as "occupied" in POS
router.post('/:id/seat', async (req, res) => {
  try {
    const reservation = await Reservation.findById(req.params.id);
    if (!reservation) return res.status(404).json({ success: false, message: 'Reservation not found' });

    reservation.status = 'Seated';
    await reservation.save();

    const normTable = normalizeTable(reservation.tableNumber);
    const tableNum = parseInt(normTable, 10);
    const tableDoc = await Table.findOneAndUpdate(
      {
        $or: [
          { tableNo: !isNaN(tableNum) ? tableNum : -1 },
          { tableNumber: !isNaN(tableNum) ? tableNum : -1 }
        ]
      },
      { status: 'occupied' },
      { new: true }
    );

    await logAudit({
      action: 'RESERVATION_SEATED',
      resource: 'Reservation',
      resourceId: String(reservation._id),
      user: req.user,
      metadata: {
        customerName: reservation.customerName,
        tableNumber: reservation.tableNumber,
        tableId: tableDoc?._id
      },
      req
    });

    const io = req.app.get('io');
    if (io) {
      io.emit('reservation-updated', reservation);
      if (tableDoc) {
        io.emit('table-updated', { action: 'status', table: tableDoc });
        io.emit('tableStatusChanged', tableDoc);
      }
    }

    res.json({
      success: true,
      message: `Guest seated at ${reservation.tableNumber}! Table marked Occupied.`,
      data: reservation,
      table: tableDoc
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// 5. Quick Cancel endpoint
router.post('/:id/cancel', async (req, res) => {
  try {
    const reservation = await Reservation.findByIdAndUpdate(
      req.params.id,
      { status: 'Cancelled' },
      { new: true }
    );
    if (!reservation) return res.status(404).json({ success: false, message: 'Reservation not found' });

    await logAudit({
      action: 'RESERVATION_CANCELLED',
      resource: 'Reservation',
      resourceId: String(reservation._id),
      user: req.user,
      metadata: {
        customerName: reservation.customerName,
        tableNumber: reservation.tableNumber
      },
      req
    });

    const io = req.app.get('io');
    if (io) io.emit('reservation-updated', reservation);

    res.json({ success: true, message: 'Reservation cancelled successfully', data: reservation });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// 6. Update Status endpoint (Supports Pending, Confirmed, Seated, Completed, No-show, Cancelled)
router.patch('/:id/status', async (req, res) => {
  try {
    const allowed = ['Pending', 'Confirmed', 'Seated', 'Completed', 'Cancelled', 'No-show'];
    if (!allowed.includes(req.body.status)) {
      return res.status(400).json({ success: false, message: `Invalid status. Must be one of: ${allowed.join(', ')}` });
    }

    const reservation = await Reservation.findByIdAndUpdate(
      req.params.id,
      { status: req.body.status },
      { new: true, runValidators: true }
    );
    if (!reservation) return res.status(404).json({ success: false, message: 'Reservation not found' });

    // If seated, mark table occupied
    let tableDoc = null;
    const normTable = normalizeTable(reservation.tableNumber);
    const tableNum = parseInt(normTable, 10);

    if (req.body.status === 'Seated') {
      tableDoc = await Table.findOneAndUpdate(
        {
          $or: [
            { tableNo: !isNaN(tableNum) ? tableNum : -1 },
            { tableNumber: !isNaN(tableNum) ? tableNum : -1 }
          ]
        },
        { status: 'occupied' },
        { new: true }
      );
    }

    await logAudit({
      action: `RESERVATION_${req.body.status.toUpperCase().replace('-', '_')}`,
      resource: 'Reservation',
      resourceId: String(reservation._id),
      user: req.user,
      metadata: {
        customerName: reservation.customerName,
        tableNumber: reservation.tableNumber,
        status: reservation.status
      },
      req
    });

    const io = req.app.get('io');
    if (io) {
      io.emit('reservation-updated', reservation);
      if (tableDoc) {
        io.emit('table-updated', { action: 'status', table: tableDoc });
        io.emit('tableStatusChanged', tableDoc);
      }
    }

    res.json({ success: true, data: reservation, table: tableDoc });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;