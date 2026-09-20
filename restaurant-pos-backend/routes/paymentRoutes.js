const express = require('express');
const Payment = require('../models/Payment');
const Order = require('../models/Order');
const Table = require('../models/Table');
const DayEnd = require('../models/DayEnd');
const { restoreStockForOrder } = require('../utils/inventoryHelper');
const { getBranchScope, canAccessBranch } = require('../utils/branchScope');

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const filter = { ...getBranchScope(req) };
    if (req.query.status) filter.status = req.query.status;
    const payments = await Payment.find(filter).populate({ path: 'orderId', populate: { path: 'tableId', select: 'tableNo tableNumber' } }).sort({ createdAt: -1 }).limit(500);
    res.json({ success: true, data: payments });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.get('/reconciliation/summary', async (req, res) => {
  try {
    const businessDate = String(req.query.date || new Date().toISOString().slice(0, 10));
    const start = new Date(`${businessDate}T00:00:00.000`);
    const end = new Date(`${businessDate}T23:59:59.999`);
    const result = await Payment.aggregate([
      { $match: { ...getBranchScope(req), settledAt: { $gte: start, $lte: end } } },
      { $group: { _id: '$paymentMode', count: { $sum: 1 }, amount: { $sum: '$grandTotal' } } },
      { $sort: { amount: -1 } }
    ]);
    const [paid, refunded, dayEnd] = await Promise.all([
      Payment.aggregate([{ $match: { ...getBranchScope(req), status: 'paid', settledAt: { $gte: start, $lte: end } } }, { $group: { _id: null, amount: { $sum: '$grandTotal' }, count: { $sum: 1 } } }]),
      Payment.aggregate([{ $match: { ...getBranchScope(req), status: 'refunded', refundedAt: { $gte: start, $lte: end } } }, { $group: { _id: null, amount: { $sum: '$grandTotal' }, count: { $sum: 1 } } }]),
      DayEnd.findOne({ businessDate }).lean()
    ]);
    const splitPayments = await Payment.find({ ...getBranchScope(req), paymentMode: 'Split', status: 'paid', settledAt: { $gte: start, $lte: end } }).select('paymentBreakdown grandTotal invoiceNumber').lean();
    const split = splitPayments.reduce((totals, payment) => ({
      cash: totals.cash + Number(payment.paymentBreakdown?.cash || 0),
      online: totals.online + Number(payment.paymentBreakdown?.online || 0)
    }), { cash: 0, online: 0 });
    res.json({ success: true, data: {
      businessDate,
      paymentModes: result,
      paid: { amount: Number((paid[0]?.amount || 0).toFixed(2)), count: paid[0]?.count || 0 },
      refunded: { amount: Number((refunded[0]?.amount || 0).toFixed(2)), count: refunded[0]?.count || 0 },
      split: { cash: Number(split.cash.toFixed(2)), online: Number(split.online.toFixed(2)), count: splitPayments.length },
      dayEnd: dayEnd ? { openingCash: dayEnd.openingCash, expectedCash: dayEnd.expectedCash, closingCash: dayEnd.closingCash, variance: dayEnd.variance, status: dayEnd.status } : null
    } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

const refundPayment = async (req, res, payment) => {
  if (!['admin', 'manager'].includes(req.user?.role)) {
    return res.status(403).json({ success: false, message: 'Only admin or manager can process refunds' });
  }
  if (!payment) return res.status(404).json({ success: false, message: 'Payment not found' });
  if (payment.status === 'refunded') return res.status(409).json({ success: false, message: 'Payment already refunded' });
  const reason = String(req.body.reason || '').trim();
  if (!reason) return res.status(400).json({ success: false, message: 'Refund reason is required' });

  const order = payment.orderId ? await Order.findById(payment.orderId) : null;
  if (!canAccessBranch(req, payment.branchId || order?.branchId)) return res.status(403).json({ success: false, message: 'This payment belongs to another branch.' });
  if (order) {
    await restoreStockForOrder(order.items, order._id, req.user?.name || req.body.updatedBy || 'Refund');
    order.paymentStatus = 'pending';
    order.orderStatus = 'cancelled';
    order.settledAt = null;
    order.paymentBreakdown = null;
    order.cancellationReason = reason.slice(0, 250);
    order.cancelledBy = req.user?.name || 'Refund';
    order.cancelledAt = new Date();
    order.statusHistory.push({ status: 'cancelled', updatedBy: req.user?.name || req.body.updatedBy || 'Refund' });
    await order.save();
    if (order.tableId) await Table.findByIdAndUpdate(order.tableId, { status: 'available', currentOrderId: null });
  }

  payment.status = 'refunded';
  payment.refundReason = reason.slice(0, 250);
  payment.refundedBy = req.user?.name || req.body.updatedBy || 'Refund';
  payment.refundedAt = new Date();
  await payment.save();
  return res.json({ success: true, data: payment, order });
};

router.post('/order/:orderId/refund', async (req, res) => {
  try {
    const payment = await Payment.findOne({ orderId: req.params.orderId, status: 'paid' }).sort({ createdAt: -1 });
    return refundPayment(req, res, payment);
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/:id/refund', async (req, res) => {
  try {
    const payment = await Payment.findById(req.params.id);
    return refundPayment(req, res, payment);
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
