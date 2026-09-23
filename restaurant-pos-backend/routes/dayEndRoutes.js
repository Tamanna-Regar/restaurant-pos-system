const express = require('express');
const DayEnd = require('../models/DayEnd');
const Payment = require('../models/Payment');
const Expense = require('../models/Expense');

const router = express.Router();

const dateRange = (businessDate) => {
  const start = new Date(`${businessDate}T00:00:00.000`);
  const end = new Date(`${businessDate}T23:59:59.999`);
  return { $gte: start, $lte: end };
};

const summarizeDay = async (businessDate, openingCash = 0) => {
  const [payments, cashExpenses] = await Promise.all([
    Payment.aggregate([
      { $match: { status: 'paid', settledAt: dateRange(businessDate) } },
      { $group: { _id: '$paymentMode', amount: { $sum: '$grandTotal' }, count: { $sum: 1 } } }
    ]),
    Expense.aggregate([
      { 
        $match: { 
          createdAt: dateRange(businessDate),
          $or: [
            { paymentMode: 'Cash' },
            { paymentMode: { $exists: false } },
            { paymentMode: null }
          ]
        } 
      },
      { $group: { _id: null, amount: { $sum: '$amount' } } }
    ])
  ]);

  const paymentTotals = payments.reduce((result, row) => {
    result[row._id || 'Unknown'] = { amount: Number(row.amount.toFixed(2)), count: row.count };
    return result;
  }, {});
  const cashSales = Number((paymentTotals.Cash?.amount || 0).toFixed(2));
  const cashExpenseTotal = Number((cashExpenses[0]?.amount || 0).toFixed(2));
  const expectedCash = Number((Number(openingCash) + cashSales - cashExpenseTotal).toFixed(2));

  return { paymentTotals, cashSales, cashExpenses: cashExpenseTotal, expectedCash };
};

router.get('/', async (req, res) => {
  try {
    const records = await DayEnd.find().sort({ businessDate: -1 }).limit(90);
    res.json({ success: true, data: records });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.get(['/current', '/today'], async (req, res) => {
  try {
    const businessDate = String(req.query.date || new Date().toISOString().slice(0, 10));
    const record = await DayEnd.findOne({ businessDate });
    res.json({ success: true, data: record });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/open', async (req, res) => {
  try {
    const businessDate = String(req.body.businessDate || new Date().toISOString().slice(0, 10));
    const openingCash = Number(req.body.openingCash || 0);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(businessDate) || !Number.isFinite(openingCash) || openingCash < 0) {
      return res.status(400).json({ success: false, message: 'Valid businessDate and openingCash are required' });
    }
    const existing = await DayEnd.findOne({ businessDate });
    if (existing) return res.status(409).json({ success: false, message: 'This business date is already open or closed', data: existing });
    const record = await DayEnd.create({ businessDate, openingCash });
    res.status(201).json({ success: true, data: record });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.post('/close/:id', async (req, res) => {
  try {
    const record = await DayEnd.findById(req.params.id);
    if (!record) return res.status(404).json({ success: false, message: 'Day-end record not found' });
    if (record.status === 'closed') return res.status(409).json({ success: false, message: 'Business date is already closed', data: record });
    const closingCash = Number(req.body.closingCash);
    if (!Number.isFinite(closingCash) || closingCash < 0) return res.status(400).json({ success: false, message: 'Valid closingCash is required' });

    const summary = await summarizeDay(record.businessDate, record.openingCash);
    Object.assign(record, summary, {
      closingCash,
      variance: Number((closingCash - summary.expectedCash).toFixed(2)),
      status: 'closed',
      closedBy: req.user?.name || 'Manager',
      notes: String(req.body.notes || ''),
      closedAt: new Date()
    });
    await record.save();
    res.json({ success: true, data: record });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.post('/reopen/:id', async (req, res) => {
  try {
    if (req.user?.role !== 'admin') return res.status(403).json({ success: false, message: 'Only admin can reopen a closed business date' });
    const record = await DayEnd.findByIdAndUpdate(req.params.id, { status: 'open', closedAt: null, closedBy: '', closingCash: null, variance: null }, { new: true });
    if (!record) return res.status(404).json({ success: false, message: 'Day-end record not found' });
    res.json({ success: true, data: record });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

module.exports = router;
