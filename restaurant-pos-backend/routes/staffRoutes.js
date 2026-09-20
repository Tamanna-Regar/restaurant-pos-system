const express = require('express');
const router = express.Router();
const Staff = require('../models/Staff');
const Attendance = require('../models/Attendance');
const LeaveRequest = require('../models/LeaveRequest');
const OvertimeRequest = require('../models/OvertimeRequest');
const SalaryPayment = require('../models/SalaryPayment');
const ShiftRoster = require('../models/ShiftRoster');

// 1. Get all staff
router.get('/', async (req, res) => {
  try {
    const staffList = await Staff.find().sort({ createdAt: -1 });
    res.json(staffList);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 2. Add new staff
router.post('/', async (req, res) => {
  try {
    const count = await Staff.countDocuments();
    const empId = `EMP00${count + 1}`;
    
    const newStaff = new Staff({
      ...req.body,
      empId
    });

    await newStaff.save();

    // Agar Socket.io notify karna ho toh real-time event bhej sakte hain
    const io = req.app.get('io');
    if (io) {
      io.emit('staffUpdated', { action: 'add', data: newStaff });
    }

    res.status(201).json(newStaff);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// 3. Update staff
router.put('/:id', async (req, res) => {
  try {
    const updatedStaff = await Staff.findByIdAndUpdate(req.params.id, req.body, { new: true });
    
    const io = req.app.get('io');
    if (io) {
      io.emit('staffUpdated', { action: 'update', data: updatedStaff });
    }

    res.json(updatedStaff);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// 4. Delete staff
router.delete('/:id', async (req, res) => {
  try {
    await Staff.findByIdAndDelete(req.params.id);
    
    const io = req.app.get('io');
    if (io) {
      io.emit('staffUpdated', { action: 'delete', id: req.params.id });
    }

    res.json({ message: 'Staff deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id/attendance', async (req, res) => {
  try {
    const records = await Attendance.find({ staffId: req.params.id }).sort({ date: -1 }).limit(366);
    res.json({ success: true, data: records });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/:id/attendance', async (req, res) => {
  try {
    const staff = await Staff.findById(req.params.id);
    if (!staff) return res.status(404).json({ success: false, message: 'Staff not found' });
    const record = await Attendance.findOneAndUpdate(
      { staffId: req.params.id, date: req.body.date },
      { ...req.body, staffId: req.params.id },
      { upsert: true, new: true, runValidators: true }
    );
    res.json({ success: true, data: record });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.get('/:id/payroll', async (req, res) => {
  try {
    const staff = await Staff.findById(req.params.id);
    if (!staff) return res.status(404).json({ success: false, message: 'Staff not found' });
    const gross = Number(staff.basicSalary || 0) + Number(staff.overtimeHours || 0) * Number(staff.overtimeRatePerHour || 0);
    const net = Math.max(0, gross - Number(staff.advanceTaken || 0) - Number(staff.otherDeductions || 0));
    res.json({ success: true, data: { staffId: staff._id, month: req.query.month || new Date().toISOString().slice(0, 7), gross, deductions: gross - net, net } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.get('/roster', async (req, res) => {
  try {
    const date = String(req.query.date || new Date().toISOString().slice(0, 10));
    const roster = await ShiftRoster.find({ date }).populate('staffId', 'name role phone').sort({ shift: 1 });
    res.json({ success: true, data: roster });
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
});

router.post('/:id/roster', async (req, res) => {
  try {
    const roster = await ShiftRoster.findOneAndUpdate({ staffId: req.params.id, date: req.body.date }, { staffId: req.params.id, date: req.body.date, shift: req.body.shift, assignedBy: req.user?.name || 'Manager' }, { upsert: true, new: true, runValidators: true });
    res.json({ success: true, data: roster });
  } catch (error) { res.status(400).json({ success: false, message: error.message }); }
});

router.post('/:id/clock', async (req, res) => {
  try {
    const date = String(req.body.date || new Date().toISOString().slice(0, 10));
    const status = String(req.body.status || 'present').toLowerCase();
    const update = { staffId: req.params.id, date, status };
    if (status === 'present' && req.body.action !== 'clock-out') update.checkIn = new Date();
    if (req.body.action === 'clock-out') update.checkOut = new Date();
    const record = await Attendance.findOneAndUpdate({ staffId: req.params.id, date }, { $set: update, ...(req.body.action === 'clock-out' ? {} : { $setOnInsert: { checkIn: new Date() } }) }, { upsert: true, new: true, runValidators: true });
    res.json({ success: true, data: record });
  } catch (error) { res.status(400).json({ success: false, message: error.message }); }
});

router.get('/leave-requests', async (req, res) => {
  try { res.json({ success: true, data: await LeaveRequest.find().populate('staffId', 'name role').sort({ createdAt: -1 }) }); }
  catch (error) { res.status(500).json({ success: false, message: error.message }); }
});

router.post('/:id/leave-requests', async (req, res) => {
  try { res.status(201).json({ success: true, data: await LeaveRequest.create({ ...req.body, staffId: req.params.id, requestedBy: req.user?.name || 'Staff' }) }); }
  catch (error) { res.status(400).json({ success: false, message: error.message }); }
});

router.patch('/leave-requests/:requestId', async (req, res) => {
  try {
    if (!['Approved', 'Rejected'].includes(req.body.status)) return res.status(400).json({ success: false, message: 'Invalid leave status' });
    const record = await LeaveRequest.findByIdAndUpdate(req.params.requestId, { status: req.body.status, reviewedBy: req.user?.name || 'Manager', reviewedAt: new Date() }, { new: true, runValidators: true });
    if (!record) return res.status(404).json({ success: false, message: 'Leave request not found' });
    res.json({ success: true, data: record });
  } catch (error) { res.status(400).json({ success: false, message: error.message }); }
});

router.get('/overtime-requests', async (req, res) => {
  try { res.json({ success: true, data: await OvertimeRequest.find().populate('staffId', 'name role').sort({ createdAt: -1 }) }); }
  catch (error) { res.status(500).json({ success: false, message: error.message }); }
});

router.post('/:id/overtime-requests', async (req, res) => {
  try { res.status(201).json({ success: true, data: await OvertimeRequest.create({ ...req.body, staffId: req.params.id, requestedBy: req.user?.name || 'Staff' }) }); }
  catch (error) { res.status(400).json({ success: false, message: error.message }); }
});

router.patch('/overtime-requests/:requestId', async (req, res) => {
  try {
    if (!['Approved', 'Rejected'].includes(req.body.status)) return res.status(400).json({ success: false, message: 'Invalid overtime status' });
    const record = await OvertimeRequest.findByIdAndUpdate(req.params.requestId, { status: req.body.status, reviewedBy: req.user?.name || 'Manager', reviewedAt: new Date() }, { new: true, runValidators: true });
    if (!record) return res.status(404).json({ success: false, message: 'Overtime request not found' });
    if (record.status === 'Approved') await Staff.findByIdAndUpdate(record.staffId, { $inc: { overtimeHours: record.hours } });
    res.json({ success: true, data: record });
  } catch (error) { res.status(400).json({ success: false, message: error.message }); }
});

router.get('/:id/salary-payments', async (req, res) => {
  try { res.json({ success: true, data: await SalaryPayment.find({ staffId: req.params.id }).sort({ month: -1 }) }); }
  catch (error) { res.status(500).json({ success: false, message: error.message }); }
});

router.post('/:id/salary-payments', async (req, res) => {
  try { res.status(201).json({ success: true, data: await SalaryPayment.create({ ...req.body, staffId: req.params.id, paidBy: req.user?.name || 'Admin' }) }); }
  catch (error) { res.status(400).json({ success: false, message: error.message }); }
});

module.exports = router;