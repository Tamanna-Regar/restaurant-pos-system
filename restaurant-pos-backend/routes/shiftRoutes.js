const express = require('express');
const CashierShift = require('../models/CashierShift');
const Payment = require('../models/Payment');
const Expense = require('../models/Expense');
const { logAudit } = require('../utils/auditLogger');

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
      { 
        $match: { 
          createdAt: { $gte: shift.createdAt, $lte: new Date() },
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

router.get('/current/summary', async (req, res) => {
  try {
    const shiftFilter = req.user.role === 'cashier'
      ? { cashier: req.user._id, status: 'open' }
      : { status: 'open' };
    const shift = await CashierShift.findOne(shiftFilter);
    if (!shift) return res.json({ success: true, data: null });

    const now = new Date();
    const [salesData, expenseData, orderData, orderTypeData] = await Promise.all([
      Payment.aggregate([
        { $match: { status: 'paid', paymentMode: 'Cash', settledAt: { $gte: shift.createdAt, $lte: now } } },
        { $group: { _id: null, total: { $sum: '$grandTotal' }, count: { $sum: 1 } } }
      ]),
      Expense.aggregate([
        { 
          $match: { 
            createdAt: { $gte: shift.createdAt, $lte: now },
            $or: [
              { paymentMode: 'Cash' },
              { paymentMode: { $exists: false } },
              { paymentMode: null }
            ]
          } 
        },
        { $group: { _id: null, total: { $sum: '$amount' } } }
      ]),
      Payment.aggregate([
        { $match: { status: 'paid', settledAt: { $gte: shift.createdAt, $lte: now } } },
        { $group: { _id: '$paymentMode', total: { $sum: '$grandTotal' }, count: { $sum: 1 } } }
      ]),
      // Order Breakdown by type: Dine-In / Takeaway / Delivery
      Payment.aggregate([
        { $match: { status: 'paid', settledAt: { $gte: shift.createdAt, $lte: now } } },
        {
          $lookup: {
            from: 'orders',
            localField: 'orderId',
            foreignField: '_id',
            as: 'order'
          }
        },
        { $unwind: { path: '$order', preserveNullAndEmptyArrays: true } },
        {
          $group: {
            _id: '$order.orderType',
            count: { $sum: 1 },
            total: { $sum: '$grandTotal' }
          }
        }
      ])
    ]);

    const cashSales = money(salesData[0]?.total || 0);
    const expenses = money(expenseData[0]?.total || 0);
    const cashIn = money(shift.movements.filter(m => m.type === 'cash-in').reduce((s, m) => s + m.amount, 0));
    const cashOut = money(shift.movements.filter(m => m.type === 'cash-out').reduce((s, m) => s + m.amount, 0));
    const expectedCash = money(shift.openingCash + cashSales + cashIn - expenses - cashOut);

    const durationMs = now - new Date(shift.createdAt);
    const durationHrs = Math.floor(durationMs / 3600000);
    const durationMins = Math.floor((durationMs % 3600000) / 60000);

    const paymentBreakdown = {};
    orderData.forEach(item => { paymentBreakdown[item._id] = { total: item.total, count: item.count }; });

    const orderBreakdown = {};
    orderTypeData.forEach(item => { orderBreakdown[item._id] = { count: item.count, total: money(item.total) }; });

    res.json({
      success: true,
      data: {
        openingCash: shift.openingCash,
        cashSales,
        cashIn,
        cashOut,
        expenses,
        expectedCash,
        movementsCount: shift.movements.length,
        shiftDuration: `${durationHrs}h ${durationMins}m`,
        shiftStarted: shift.createdAt,
        paymentBreakdown,
        orderBreakdown,
        totalOrders: orderData.reduce((s, i) => s + i.count, 0)
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});


router.get('/current', async (req, res) => {
  try {
    const shiftFilter = req.user.role === 'cashier'
      ? { cashier: req.user._id, status: 'open' }
      : { status: 'open' };
    const shift = await CashierShift.findOne(shiftFilter).populate('cashier', 'name email role');
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
    const shiftFilter = req.user.role === 'cashier'
      ? { cashier: req.user._id, status: 'open' }
      : { status: 'open' };
    const existing = await CashierShift.findOne(shiftFilter);
    if (existing) return res.status(409).json({ success: false, message: 'An open shift is already active', data: existing });
    const shift = await CashierShift.create({ cashier: req.user._id, businessDate, openingCash });

    await logAudit({
      action: 'SHIFT_OPEN',
      resource: 'Shift',
      resourceId: String(shift._id),
      user: req.user,
      metadata: { businessDate, openingCash },
      req
    });

    res.status(201).json({ success: true, data: shift });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.post('/:id/movements', async (req, res) => {
  try {
    const shiftFilter = req.user.role === 'cashier'
      ? { _id: req.params.id, cashier: req.user._id, status: 'open' }
      : { _id: req.params.id, status: 'open' };
    const shift = await CashierShift.findOne(shiftFilter);
    if (!shift) return res.status(404).json({ success: false, message: 'Open cashier shift not found' });
    const amount = Number(req.body.amount);
    const type = String(req.body.type || '');
    const reason = String(req.body.reason || '').trim();
    if (!['cash-in', 'cash-out'].includes(type) || !Number.isFinite(amount) || amount <= 0 || !reason) {
      return res.status(400).json({ success: false, message: 'Valid movement type, amount and reason are required' });
    }
    shift.movements.push({ type, amount: money(amount), reason, createdBy: req.user._id });
    await shift.save();

    await logAudit({
      action: type === 'cash-in' ? 'CASH_IN' : 'CASH_OUT',
      resource: 'Shift',
      resourceId: String(shift._id),
      user: req.user,
      metadata: { type, amount, reason },
      req
    });

    res.status(201).json({ success: true, data: shift });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.post('/:id/close', async (req, res) => {
  try {
    const shiftFilter = req.user.role === 'cashier'
      ? { _id: req.params.id, cashier: req.user._id, status: 'open' }
      : { _id: req.params.id, status: 'open' };
    const shift = await CashierShift.findOne(shiftFilter);
    if (!shift) return res.status(404).json({ success: false, message: 'Open cashier shift not found' });
    const closingCash = Number(req.body.closingCash);
    if (!Number.isFinite(closingCash) || closingCash < 0) return res.status(400).json({ success: false, message: 'Valid closingCash is required' });
    const expectedCash = await calculateExpectedCash(shift);

    const rawDenoms = req.body.denominations || {};
    const denominations = {
      d500: Math.max(0, Number(rawDenoms.d500 || rawDenoms[500] || 0)),
      d200: Math.max(0, Number(rawDenoms.d200 || rawDenoms[200] || 0)),
      d100: Math.max(0, Number(rawDenoms.d100 || rawDenoms[100] || 0)),
      d50: Math.max(0, Number(rawDenoms.d50 || rawDenoms[50] || 0)),
      d20: Math.max(0, Number(rawDenoms.d20 || rawDenoms[20] || 0)),
      d10: Math.max(0, Number(rawDenoms.d10 || rawDenoms[10] || 0)),
      coins: Math.max(0, Number(rawDenoms.coins || 0))
    };

    const variance = money(closingCash - expectedCash);

    Object.assign(shift, {
      closingCash: money(closingCash),
      expectedCash,
      variance,
      status: 'closed',
      closedBy: req.user._id,
      closedAt: new Date(),
      notes: String(req.body.notes || '').trim(),
      denominations
    });
    await shift.save();
    await shift.populate('cashier', 'name email role');

    await logAudit({
      action: 'SHIFT_CLOSE',
      resource: 'Shift',
      resourceId: String(shift._id),
      user: req.user,
      metadata: { closingCash, expectedCash, variance, notes: shift.notes },
      req
    });

    res.json({ success: true, data: shift });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.post('/:id/approve', async (req, res) => {
  try {
    if (!['admin', 'manager'].includes(req.user.role)) return res.status(403).json({ success: false, message: 'Only a manager or admin can approve a shift' });
    const shift = await CashierShift.findOneAndUpdate(
      { _id: req.params.id, status: 'closed' },
      { status: 'handed-over', approvedBy: req.user._id, approvedAt: new Date() },
      { new: true }
    ).populate('cashier', 'name email role');
    if (!shift) return res.status(404).json({ success: false, message: 'Closed cashier shift not found' });

    await logAudit({
      action: 'SHIFT_APPROVE',
      resource: 'Shift',
      resourceId: String(shift._id),
      user: req.user,
      metadata: { cashierName: shift.cashier?.name },
      req
    });

    res.json({ success: true, data: shift });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

module.exports = router;
