const express = require('express');
const crypto = require('crypto');
const Razorpay = require('razorpay');
const Payment = require('../models/Payment');
const Order = require('../models/Order');
const Table = require('../models/Table');
const DayEnd = require('../models/DayEnd');
const { restoreStockForOrder } = require('../utils/inventoryHelper');
const { getBranchScope, canAccessBranch } = require('../utils/branchScope');
const { updateCustomerCRM } = require('../utils/crmHelper');
const { sendWhatsAppBill } = require('../utils/whatsappHelper');
const { queueOrderCommunications } = require('../utils/communicationHelper');
const { getNextInvoiceNumber } = require('../utils/invoiceHelper');
const { logAudit } = require('../utils/auditLogger');

const router = express.Router();

// Helper to get initialized Razorpay instance
const getRazorpayInstance = () => {
  const key_id = process.env.RAZORPAY_KEY_ID;
  const key_secret = process.env.RAZORPAY_KEY_SECRET;
  if (!key_id || !key_secret) {
    throw new Error('Razorpay credentials (RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET) not configured in environment');
  }
  return new Razorpay({ key_id, key_secret });
};

// ==========================================
// ⚡ RAZORPAY PAYMENT GATEWAY ENDPOINTS
// ==========================================

// 1. GET /api/payments/razorpay/config - Fetch public Key ID for client checkout
router.get('/razorpay/config', (req, res) => {
  const keyId = process.env.RAZORPAY_KEY_ID || '';
  if (!keyId) {
    return res.status(500).json({ success: false, message: 'RAZORPAY_KEY_ID is missing in environment' });
  }
  res.json({
    success: true,
    keyId,
    currency: 'INR',
    businessName: 'Tamanna Restaurant'
  });
});

// 2. POST /api/payments/razorpay/create-order - Create Razorpay payment order
router.post('/razorpay/create-order', async (req, res) => {
  try {
    const { orderId, amount, customerName, customerPhone } = req.body;
    let finalAmount = Number(amount);

    let existingOrder = null;
    if (orderId) {
      existingOrder = await Order.findById(orderId);
      if (existingOrder) {
        finalAmount = Number(existingOrder.grandTotal);
      }
    }

    if (!Number.isFinite(finalAmount) || finalAmount <= 0) {
      return res.status(400).json({ success: false, message: 'Invalid payment amount. Amount must be greater than 0.' });
    }

    const rzp = getRazorpayInstance();
    const amountInPaise = Math.round(finalAmount * 100);

    const rzpOrder = await rzp.orders.create({
      amount: amountInPaise,
      currency: 'INR',
      receipt: `rcpt_${String(existingOrder?._id || Date.now()).slice(-10)}`,
      notes: {
        orderId: String(existingOrder?._id || orderId || ''),
        customerName: customerName || existingOrder?.customerName || 'Guest',
        customerPhone: customerPhone || existingOrder?.customerPhone || '',
        tableId: String(existingOrder?.tableId || '')
      }
    });

    res.json({
      success: true,
      razorpayOrderId: rzpOrder.id,
      amount: rzpOrder.amount, // in paise
      amountInRupees: finalAmount,
      currency: rzpOrder.currency,
      keyId: process.env.RAZORPAY_KEY_ID,
      businessName: 'Tamanna Restaurant',
      customerName: customerName || existingOrder?.customerName || '',
      customerPhone: customerPhone || existingOrder?.customerPhone || '',
      orderId: existingOrder?._id || orderId || null
    });
  } catch (error) {
    console.error('Razorpay Create Order Error:', error);
    res.status(500).json({ success: false, message: error.error?.description || error.message });
  }
});

// 3. POST /api/payments/razorpay/verify - Verify payment signature & settle bill
router.post('/razorpay/verify', async (req, res) => {
  try {
    const {
      orderId,
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      customerName,
      customerPhone,
      updatedBy
    } = req.body;

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({
        success: false,
        message: 'Missing required Razorpay payment verification fields (order_id, payment_id, signature).'
      });
    }

    // Cryptographic signature verification
    const secret = process.env.RAZORPAY_KEY_SECRET;
    const hmac = crypto.createHmac('sha256', secret);
    hmac.update(`${razorpay_order_id}|${razorpay_payment_id}`);
    const generatedSignature = hmac.digest('hex');

    if (generatedSignature !== razorpay_signature) {
      console.warn('⚠️ Razorpay Signature Mismatch!');
      return res.status(400).json({
        success: false,
        message: 'Payment verification failed: Signature mismatch. Potential tampering detected.'
      });
    }

    // Signature verified successfully -> Settle the POS order & table
    let order = null;
    if (orderId) {
      order = await Order.findById(orderId);
    }

    if (order) {
      order.paymentStatus = 'paid';
      order.paymentMode = 'Razorpay';
      order.paymentProvider = 'Razorpay';
      order.paymentReference = razorpay_payment_id;
      order.settledAt = new Date();
      order.invoiceNumber = order.invoiceNumber || await getNextInvoiceNumber(order.settledAt);

      if (order.orderType === 'Dine-In') {
        order.orderStatus = 'completed';
      }

      order.statusHistory = order.statusHistory || [];
      order.statusHistory.push({
        status: 'completed',
        timestamp: new Date(),
        updatedBy: updatedBy || req.user?.name || 'Razorpay Gateway'
      });

      await order.save();

      // Free the table
      if (order.tableId) {
        await Table.updateMany(
          { $or: [{ _id: order.tableId }, { mergedWith: order.tableId }] },
          { status: 'available', currentOrderId: null, mergedWith: null, isMerged: false }
        );
      }

      // Record in Payment collection
      const paymentDoc = await Payment.create({
        orderId: order._id,
        tableId: order.tableId,
        invoiceNumber: order.invoiceNumber,
        customerName: customerName || order.customerName || 'Walk-in Customer',
        customerPhone: customerPhone || order.customerPhone || '',
        paymentMode: 'Razorpay',
        paymentProvider: 'Razorpay',
        paymentReference: razorpay_payment_id,
        subTotal: order.subTotal || 0,
        tax: order.tax || 0,
        gstRate: order.gstRate || 5,
        cgst: order.cgst || 0,
        sgst: order.sgst || 0,
        discount: order.discount || 0,
        grandTotal: order.grandTotal || 0,
        status: 'paid',
        settledAt: new Date()
      });

      // Update CRM & WhatsApp triggers
      if (order.customerPhone) {
        try {
          await updateCustomerCRM(order.customerPhone, order.customerName, order.grandTotal);
          await sendWhatsAppBill(order.customerPhone, order.customerName, order.grandTotal, order._id);
          await queueOrderCommunications(order);
        } catch (commErr) {
          console.warn('Communications warning:', commErr.message);
        }
      }

      // Audit Trail Logging
      await logAudit({
        action: 'PAYMENT_RECEIVED',
        resource: 'Payment',
        resourceId: String(paymentDoc._id),
        user: req.user,
        userName: updatedBy || req.user?.name || 'Razorpay Gateway',
        metadata: {
          gateway: 'Razorpay',
          paymentId: razorpay_payment_id,
          razorpayOrderId: razorpay_order_id,
          amount: order.grandTotal,
          orderId: String(order._id)
        },
        req
      });

      // Real-time socket sync
      const io = req.app.get('io');
      if (io) {
        io.emit('payment-updated', { orderId: order._id, paymentMode: 'Razorpay', grandTotal: order.grandTotal });
        io.emit('table-updated', { tableId: order.tableId, status: 'available' });
        io.emit('order-updated', { order });
      }

      return res.json({
        success: true,
        message: 'Payment verified and settled successfully via Razorpay! Bill cleared & Table freed.',
        paymentId: razorpay_payment_id,
        order,
        payment: paymentDoc
      });
    }

    res.json({
      success: true,
      message: 'Razorpay payment verified successfully.',
      paymentId: razorpay_payment_id
    });
  } catch (error) {
    console.error('Razorpay Verify Error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ==========================================
// 📋 PAYMENT REPORTING & RECONCILIATION
// ==========================================

router.get('/', async (req, res) => {
  try {
    const filter = { ...getBranchScope(req) };
    if (req.query.status) filter.status = req.query.status;
    const payments = await Payment.find(filter)
      .populate({ path: 'orderId', populate: { path: 'tableId', select: 'tableNo tableNumber' } })
      .sort({ createdAt: -1 })
      .limit(500);
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
    if (order.tableId) {
      await Table.updateMany(
        { $or: [{ _id: order.tableId }, { mergedWith: order.tableId }] },
        { status: 'available', currentOrderId: null, mergedWith: null, isMerged: false }
      );
      const primaryTable = await Table.findById(order.tableId);
      if (primaryTable?.mergedWith) {
        await Table.findByIdAndUpdate(primaryTable.mergedWith, {
          status: 'available', currentOrderId: null, mergedWith: null, isMerged: false
        });
      }
    }
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
