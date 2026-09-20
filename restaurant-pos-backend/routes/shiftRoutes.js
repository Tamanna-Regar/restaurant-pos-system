const express = require('express');
const CashierShift = require('../models/CashierShift');
const Payment = require('../models/Payment');
const Expense = require('../models/Expense');

const router = express.Router();
const validDate = (date) => /^\d{4}-\d{2}-\d{2}$/.test(date);
const money = (value) => Number(Number(value).toFixed(2));

async function calculateExpectedCash(shift) {
  const [sales, expenses] = await Promise.all([
    Payment.aggregate([
      { $match: { status: 'paid', paymentMode: 'Cash', settledAt: { $gte: shift.createdAt, $lte: new Date() } } },
      { $group: { _id: null, amount: { $sum: '$grandTotal' } } }
    ]),
    Expense.aggregate([
      { $match: { createdAt: { $gte: shift.createdAt, $lte: new Date() } } },
      { $group: { _id: null, amount: { $sum: '$amount' } } }
    ])
  ]);
  const cashIn = shift.movements.filter((entry) => entry.type === 'cash-in').reduce((sum, entry) => sum + entry.amount, 0);
  const cashOut = shift.movements.filter((entry) => entry.type === 'cash-out').reduce((sum, entry) => sum + entry.amount, 0);
  return money(shift.openingCash + (sales[0]?.amount || 0) + cashIn - (expenses[0]?.amount || 0) - cashOut);
}

router.get('/', async (req, res) => {
  try {
    const query = req.user.role === 'cashier' ? { cashier: req.user._id } : {};
    const shifts = await CashierShift.find(query).populate('cashier', 'name email role').sort({ createdAt: -1 }).limit(100);
    res.json({ success: true, data: shifts });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.get('/current', async (req, res) => {
  try {
    const shift = await CashierShift.findOne({ cashier: req.user._id, status: 'open' }).populate('cashier', 'name email role');
    res.json({ success: true, data: shift });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/open', async (req, res) => {
  try {
    const businessDate = String(req.body.businessDate || new Date().toISOString().slice(0, 10));
    const openingCash = Number(req.body.openingCash);
    if (!validDate(businessDate) || !Number.isFinite(openingCash) || openingCash < 0) {
      return res.status(400).json({ success: false, message: 'Valid businessDate and openingCash are required' });
    }
    const existing = await CashierShift.findOne({ cashier: req.user._id, status: 'open' });
    if (existing) return res.status(409).json({ success: false, message: 'You already have an open shift', data: existing });
    const shift = await CashierShift.create({ cashier: req.user._id, businessDate, openingCash });
    res.status(201).json({ success: true, data: shift });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.post('/:id/movements', async (req, res) => {
  try {
    const shift = await CashierShift.findOne({ _id: req.params.id, cashier: req.user._id, status: 'open' });
    if (!shift) return res.status(404).json({ success: false, message: 'Open cashier shift not found' });
    const amount = Number(req.body.amount);
    const type = String(req.body.type || '');
    const reason = String(req.body.reason || '').trim();
    if (!['cash-in', 'cash-out'].includes(type) || !Number.isFinite(amount) || amount <= 0 || !reason) {
      return res.status(400).json({ success: false, message: 'Valid movement type, amount and reason are required' });
    }
    shift.movements.push({ type, amount: money(amount), reason, createdBy: req.user._id });
    await shift.save();
    res.status(201).json({ success: true, data: shift });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.post('/:id/close', async (req, res) => {
  try {
    const shift = await CashierShift.findOne({ _id: req.params.id, cashier: req.user._id, status: 'open' });
    if (!shift) return res.status(404).json({ success: false, message: 'Open cashier shift not found' });
    const closingCash = Number(req.body.closingCash);
    if (!Number.isFinite(closingCash) || closingCash < 0) return res.status(400).json({ success: false, message: 'Valid closingCash is required' });
    const expectedCash = await calculateExpectedCash(shift);
    Object.assign(shift, { closingCash: money(closingCash), expectedCash, variance: money(closingCash - expectedCash), status: 'closed', closedBy: req.user._id, closedAt: new Date(), notes: String(req.body.notes || '').trim() });
    await shift.save();
    res.json({ success: true, data: shift });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.post('/:id/approve', async (req, res) => {
  try {
    if (!['admin', 'manager'].includes(req.user.role)) return res.status(403).json({ success: false, message: 'Only a manager or admin can approve a shift' });
    const shift = await CashierShift.findOneAndUpdate({ _id: req.params.id, status: 'closed' }, { status: 'handed-over', approvedBy: req.user._id, approvedAt: new Date() }, { new: true });
    if (!shift) return res.status(404).json({ success: false, message: 'Closed cashier shift not found' });
    res.json({ success: true, data: shift });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

module.exports = router;
