const CommunicationLog = require('../models/CommunicationLog');

const normalizePhone = (value) => {
  const digits = String(value || '').replace(/\D/g, '');
  return digits.length === 10 ? `91${digits}` : digits;
};

const queueCommunication = async ({ channel, purpose, phone, customerName, orderId, message }) => {
  const normalizedPhone = normalizePhone(phone);
  if (!normalizedPhone) return null;

  const log = await CommunicationLog.create({
    channel,
    purpose,
    phone: normalizedPhone,
    customerName: customerName || '',
    orderId: orderId || null,
    message,
    status: 'queued',
    provider: 'outbox'
  });

  // Provider delivery is intentionally opt-in. Configure a WhatsApp/SMS
  // provider before changing queued records to sent.
  console.log(`[Communication queued] ${channel}/${purpose} -> +${normalizedPhone}`);
  return log;
};

const queueOrderCommunications = async (order) => {
  if (!order?.customerPhone) return [];
  const feedbackUrl = `${process.env.FRONTEND_PUBLIC_URL || 'http://localhost:3000'}/feedback?order=${order._id}`;
  const total = Number(order.grandTotal || 0).toFixed(2);
  const invoice = order.invoiceNumber || 'Pending';
  const name = order.customerName || 'Customer';
  const message = `Hello ${name}, your Tamanna Restaurant bill ${invoice} of ₹${total} is confirmed. Feedback: ${feedbackUrl}`;
  return Promise.all([
    queueCommunication({ channel: 'whatsapp', purpose: 'digital_bill', phone: order.customerPhone, customerName: name, orderId: order._id, message }),
    queueCommunication({ channel: 'sms', purpose: 'payment_confirmation', phone: order.customerPhone, customerName: name, orderId: order._id, message })
  ]);
};

module.exports = { normalizePhone, queueCommunication, queueOrderCommunications };
