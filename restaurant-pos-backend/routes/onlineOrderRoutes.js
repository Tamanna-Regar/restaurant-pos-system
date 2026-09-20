const crypto = require('crypto');
const express = require('express');
const OnlineOrder = require('../models/OnlineOrder');

const router = express.Router();
const allowedStatuses = [
  'Pending',
  'Accepted',
  'Rejected',
  'Preparing',
  'Ready for Pickup',
  'Out for Delivery',
  'Delivered',
  'Cancelled'
];

const normalizeProvider = (value) => {
  const provider = String(value || 'Zomato').trim().toLowerCase();
  if (provider === 'swiggy') return 'Swiggy';
  if (provider === 'direct') return 'Direct';
  return 'Zomato';
};

const normalizeItems = (items) => (Array.isArray(items) ? items : []).map((item) => ({
  itemId: item.itemId || item.originalId || item._id || null,
  name: String(item.name || 'Unnamed item').trim(),
  quantity: Math.max(1, Number(item.quantity || item.qty || 1)),
  price: Math.max(0, Number(item.price || 0))
}));

const emitOrderEvent = (req, event, order) => {
  const io = req.app.get('io');
  if (io) io.emit(event, { order });
};

const isValidWebhookSecret = (req) => {
  const configuredSecret = process.env.ONLINE_ORDER_WEBHOOK_SECRET;
  if (!configuredSecret) return process.env.NODE_ENV !== 'production';

  const received = req.get('x-webhook-secret') || '';
  const expected = Buffer.from(configuredSecret);
  const actual = Buffer.from(received);
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
};

const toOrderInput = (payload) => {
  const incoming = payload.order || payload;
  const provider = normalizeProvider(incoming.provider || incoming.source || payload.provider || payload.source);
  const providerOrderId = String(
    incoming.providerOrderId || incoming.externalOrderId || incoming.orderId || incoming._id || ''
  ).trim();

  return {
    provider,
    providerOrderId,
    customerName: String(incoming.customerName || incoming.customer?.name || 'New Customer').trim(),
    customerPhone: String(incoming.customerPhone || incoming.customer?.phone || '').trim(),
    deliveryAddress: String(incoming.deliveryAddress || incoming.customer?.address || '').trim(),
    deliveryPartner: String(incoming.deliveryPartner || '').trim(),
    status: allowedStatuses.includes(incoming.status) ? incoming.status : 'Pending',
    items: normalizeItems(incoming.items),
    rawPayload: payload
  };
};

router.get('/', async (req, res) => {
  try {
    const filter = {};
    if (req.query.provider) filter.provider = normalizeProvider(req.query.provider);
    if (req.query.status && allowedStatuses.includes(req.query.status)) filter.status = req.query.status;

    const orders = await OnlineOrder.find(filter).sort({ createdAt: -1 }).limit(500);
    res.json({ success: true, data: orders });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

const webhookHandler = async (req, res) => {
  try {
    if (!isValidWebhookSecret(req)) {
      return res.status(401).json({ success: false, message: 'Invalid online-order webhook secret' });
    }

    const input = toOrderInput(req.body || {});
    if (!input.providerOrderId) {
      return res.status(400).json({ success: false, message: 'Provider order ID is required' });
    }

    const existing = await OnlineOrder.findOne({
      provider: input.provider,
      providerOrderId: input.providerOrderId
    });

    if (existing) {
      Object.assign(existing, input);
      existing.recalculateTotals();
      await existing.save();
      emitOrderEvent(req, 'online-order-updated', existing);
      return res.json({ success: true, duplicate: true, data: existing });
    }

    const order = new OnlineOrder(input);
    order.recalculateTotals();
    order.statusHistory = [{
      status: order.status,
      timestamp: new Date(),
      updatedBy: 'Webhook'
    }];
    await order.save();
    emitOrderEvent(req, 'online-order-created', order);
    res.status(201).json({ success: true, data: order });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ success: false, message: 'This provider order was already received' });
    }
    res.status(500).json({ success: false, message: error.message });
  }
};

router.post('/webhook', webhookHandler);

const findOrder = async (req, res) => {
  const order = await OnlineOrder.findById(req.params.id);
  if (!order) {
    res.status(404).json({ success: false, message: 'Online order not found' });
    return null;
  }
  return order;
};

router.post('/accept/:id', async (req, res) => {
  try {
    const order = await findOrder(req, res);
    if (!order) return;
    if (!['Pending', 'Accepted'].includes(order.status)) {
      return res.status(400).json({ success: false, message: `Cannot accept an order in ${order.status} status` });
    }

    order.status = 'Accepted';
    order.deliveryPartner = order.deliveryPartner || String(req.body?.deliveryPartner || '');
    order.statusHistory.push({ status: 'Accepted', updatedBy: req.body?.updatedBy || 'Staff' });
    await order.save();
    emitOrderEvent(req, 'online-order-updated', order);
    res.json({ success: true, data: order });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/reject/:id', async (req, res) => {
  try {
    const order = await findOrder(req, res);
    if (!order) return;
    if (['Delivered', 'Cancelled'].includes(order.status)) {
      return res.status(400).json({ success: false, message: `Cannot reject an order in ${order.status} status` });
    }

    order.status = 'Rejected';
    order.statusHistory.push({ status: 'Rejected', updatedBy: req.body?.updatedBy || 'Staff' });
    await order.save();
    emitOrderEvent(req, 'online-order-updated', order);
    res.json({ success: true, data: order });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/assign-rider/:id', async (req, res) => {
  try {
    const order = await findOrder(req, res);
    if (!order) return;
    const rider = String(req.body?.deliveryPartner || '').trim();
    if (!rider) return res.status(400).json({ success: false, message: 'Delivery partner is required' });
    if (['Rejected', 'Delivered', 'Cancelled'].includes(order.status)) {
      return res.status(400).json({ success: false, message: `Cannot assign rider to ${order.status} order` });
    }

    order.deliveryPartner = rider;
    if (order.status === 'Pending') order.status = 'Accepted';
    order.statusHistory.push({ status: order.status, updatedBy: req.body?.updatedBy || 'Staff' });
    await order.save();
    emitOrderEvent(req, 'online-order-updated', order);
    res.json({ success: true, data: order });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.patch('/status/:id', async (req, res) => {
  try {
    const order = await findOrder(req, res);
    if (!order) return;
    const status = req.body?.status;
    if (!allowedStatuses.includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid online order status' });
    }
    if (['Delivered', 'Rejected', 'Cancelled'].includes(order.status)) {
      return res.status(400).json({ success: false, message: `Cannot update a ${order.status} order` });
    }

    order.status = status;
    order.statusHistory.push({ status, updatedBy: req.body?.updatedBy || 'Staff' });
    await order.save();
    emitOrderEvent(req, 'online-order-updated', order);
    res.json({ success: true, data: order });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.get('/summary', async (req, res) => {
  try {
    const [totalOrders, pending, active, commission] = await Promise.all([
      OnlineOrder.countDocuments(),
      OnlineOrder.countDocuments({ status: 'Pending' }),
      OnlineOrder.countDocuments({
        status: { $in: ['Accepted', 'Preparing', 'Ready for Pickup', 'Out for Delivery'] }
      }),
      OnlineOrder.aggregate([{ $group: { _id: null, total: { $sum: '$commissionAmount' } } }])
    ]);

    res.json({
      success: true,
      data: {
        totalOrders,
        pending,
        accepted: active,
        commission: Number((commission[0]?.total || 0).toFixed(2))
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
module.exports.webhookHandler = webhookHandler;
