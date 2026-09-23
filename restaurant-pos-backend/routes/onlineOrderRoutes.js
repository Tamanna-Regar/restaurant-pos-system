const crypto = require('crypto');
const express = require('express');
const OnlineOrder = require('../models/OnlineOrder');
const Order = require('../models/Order');

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

    // KDS Sync: Push KOT to kitchen display system
    try {
      const kotItems = order.items.map(it => ({
        itemId: it.itemId || null,
        name: it.name,
        foodType: 'veg',
        portion: 'Full',
        price: it.price,
        basePrice: it.price,
        quantity: it.quantity,
        notes: `Online: ${order.provider} #${order.providerOrderId}`,
        itemStatus: 'placed'
      }));

      const newOrder = await Order.create({
        orderType: 'Delivery',
        customerName: `${order.provider}: ${order.customerName}`,
        customerPhone: order.customerPhone || '',
        deliveryAddress: order.deliveryAddress || 'Online Delivery',
        waiterName: order.provider,
        priority: 'Urgent',
        items: kotItems,
        kots: [{
          kotNumber: 1,
          punchedAt: new Date(),
          status: 'placed',
          items: kotItems
        }],
        subTotal: order.subtotal,
        grandTotal: order.subtotal
      });

      const io = req.app.get('io');
      if (io) {
        io.emit('new-kot', {
          orderId: newOrder._id,
          kotNumber: 1,
          tableNo: `${order.provider} #${order.providerOrderId}`,
          orderType: 'Delivery',
          items: kotItems
        });
        io.emit('order-placed', newOrder);
      }
    } catch (kdsErr) {
      console.error('KDS sync error on online order accept:', kdsErr);
    }

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

router.post('/simulate', async (req, res) => {
  try {
    const provider = req.body.provider === 'Swiggy' ? 'Swiggy' : (req.body.provider === 'Direct' ? 'Direct' : 'Zomato');
    const randomNum = Math.floor(1000 + Math.random() * 9000);
    const providerOrderId = `${provider.toUpperCase().slice(0, 3)}-${randomNum}`;

    const sampleItemsPool = [
      { name: 'Paneer Butter Masala', price: 280 },
      { name: 'Butter Naan', price: 45 },
      { name: 'Veg Biryani Special', price: 240 },
      { name: 'Dal Makhani', price: 220 },
      { name: 'Garlic Naan', price: 55 },
      { name: 'Chicken Tikka Masala', price: 340 },
      { name: 'Gulab Jamun (2 Pcs)', price: 80 }
    ];

    const shuffled = [...sampleItemsPool].sort(() => 0.5 - Math.random());
    const selectedCount = Math.floor(Math.random() * 2) + 2;
    const orderItems = shuffled.slice(0, selectedCount).map(dish => ({
      name: dish.name,
      quantity: Math.floor(Math.random() * 2) + 1,
      price: dish.price
    }));

    const sampleCustomers = [
      { name: 'Aarav Sharma', phone: '9823012345', address: 'Flat 402, Royal Palms, Civil Lines' },
      { name: 'Pooja Verma', phone: '9890123456', address: 'House 12, Green Park Avenue' },
      { name: 'Rohan Mehra', phone: '9765432109', address: 'Plot 88, Sector 14, Ring Road' },
      { name: 'Ananya Gupta', phone: '9911223344', address: 'B-201, Silver Heights, MG Road' }
    ];
    const customer = sampleCustomers[Math.floor(Math.random() * sampleCustomers.length)];

    const simulatedOrder = new OnlineOrder({
      provider,
      providerOrderId,
      customerName: customer.name,
      customerPhone: customer.phone,
      deliveryAddress: customer.address,
      status: 'Pending',
      items: orderItems,
      commissionRate: provider === 'Direct' ? 0 : 18
    });

    simulatedOrder.recalculateTotals();
    simulatedOrder.statusHistory = [{
      status: 'Pending',
      timestamp: new Date(),
      updatedBy: 'Simulator'
    }];

    await simulatedOrder.save();
    emitOrderEvent(req, 'online-order-created', simulatedOrder);

    res.status(201).json({
      success: true,
      message: `Simulated ${provider} order #${providerOrderId} generated successfully!`,
      data: simulatedOrder
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
module.exports.webhookHandler = webhookHandler;
