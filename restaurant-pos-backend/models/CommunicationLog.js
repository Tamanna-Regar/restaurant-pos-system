const mongoose = require('mongoose');

const communicationLogSchema = new mongoose.Schema({
  channel: { type: String, enum: ['whatsapp', 'sms'], required: true },
  purpose: { type: String, enum: ['digital_bill', 'payment_confirmation', 'birthday_offer', 'promotion', 'feedback'], required: true },
  phone: { type: String, required: true, trim: true },
  customerName: { type: String, default: '' },
  orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', default: null },
  message: { type: String, required: true, maxlength: 2000 },
  status: { type: String, enum: ['queued', 'sent', 'failed'], default: 'queued' },
  provider: { type: String, default: 'outbox' },
  providerMessageId: { type: String, default: '' },
  error: { type: String, default: '' }
}, { timestamps: true });

communicationLogSchema.index({ phone: 1, createdAt: -1 });
communicationLogSchema.index({ orderId: 1, purpose: 1 });

module.exports = mongoose.model('CommunicationLog', communicationLogSchema);
