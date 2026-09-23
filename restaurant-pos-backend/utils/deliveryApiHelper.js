const axios = require('axios');
const OnlineOrder = require('../models/OnlineOrder');

/**
 * Pushes order status update back to external delivery platform (Zomato / Swiggy)
 */
const pushOrderStatusToDeliveryPartner = async (provider, providerOrderId, newStatus, extra = {}) => {
  try {
    const isZomato = provider?.toLowerCase() === 'zomato';
    const isSwiggy = provider?.toLowerCase() === 'swiggy';

    const apiKey = isZomato 
      ? process.env.ZOMATO_API_KEY 
      : isSwiggy 
      ? process.env.SWIGGY_API_KEY 
      : null;

    const webhookUrl = isZomato 
      ? process.env.ZOMATO_WEBHOOK_URL 
      : isSwiggy 
      ? process.env.SWIGGY_WEBHOOK_URL 
      : null;

    if (apiKey && webhookUrl && !webhookUrl.includes('example.com')) {
      const payload = {
        orderId: providerOrderId,
        status: newStatus,
        riderName: extra.riderName || null,
        riderPhone: extra.riderPhone || null,
        timestamp: new Date().toISOString()
      };

      const response = await axios.post(webhookUrl, payload, {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        timeout: 8000
      });

      console.log(`[Delivery API: ${provider}] Updated order #${providerOrderId} -> ${newStatus}`);
      return { success: true, live: true, data: response.data };
    }

    // Simulation fallback
    console.log(`[Delivery API Simulator: ${provider}] Order #${providerOrderId} status transitioned to "${newStatus}"`);
    return {
      success: true,
      live: false,
      simulated: true,
      message: `Status "${newStatus}" dispatched to ${provider} mock gateway.`
    };
  } catch (error) {
    console.error(`[Delivery API Error: ${provider}]:`, error.response?.data || error.message);
    return { success: false, error: error.message };
  }
};

/**
 * Simulates an incoming Pure Veg order from Zomato or Swiggy for demo & testing
 */
const simulateIncomingDeliveryOrder = async ({ provider = 'Zomato', customerName, customerPhone, items, deliveryAddress }, io = null) => {
  try {
    const orderNumber = Math.floor(100000 + Math.random() * 900000);
    const providerOrderId = `${provider.toUpperCase().slice(0, 3)}-${orderNumber}`;

    const defaultItems = [
      { name: 'Paneer Butter Masala (Pure Veg)', quantity: 1, price: 280 },
      { name: 'Butter Tandoori Roti', quantity: 3, price: 30 },
      { name: 'Jeera Rice', quantity: 1, price: 160 }
    ];

    const orderItems = items && items.length > 0 ? items : defaultItems;
    const subtotal = orderItems.reduce((acc, it) => acc + (it.price * (it.quantity || 1)), 0);
    const commissionRate = provider.toLowerCase() === 'zomato' ? 20 : 18;
    const commissionAmount = Number(((subtotal * commissionRate) / 100).toFixed(2));

    const onlineOrder = await OnlineOrder.create({
      provider,
      providerOrderId,
      status: 'Pending',
      customerName: customerName || (provider === 'Zomato' ? 'Aakash Sharma' : 'Pooja Verma'),
      customerPhone: customerPhone || '9876500000',
      deliveryAddress: deliveryAddress || 'Flat 402, Royal Palms, City Center',
      items: orderItems,
      subtotal,
      commissionRate,
      commissionAmount,
      statusHistory: [{ status: 'Pending', updatedBy: `${provider} Webhook Simulator` }]
    });

    // Notify POS and Kitchen in real-time
    if (io) {
      io.emit('new-online-order', {
        order: onlineOrder,
        alertTone: true
      });
      console.log(`[Delivery Simulator] Broadcasted new-online-order event for ${providerOrderId}`);
    }

    return { success: true, order: onlineOrder };
  } catch (error) {
    console.error('[Delivery Simulator Error]:', error.message);
    return { success: false, error: error.message };
  }
};

module.exports = {
  pushOrderStatusToDeliveryPartner,
  simulateIncomingDeliveryOrder
};

