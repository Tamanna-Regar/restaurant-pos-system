const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema({
  branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', default: null, index: true },
  orderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Order',
    required: true
  },
  invoiceNumber: { type: String, default: '', index: true },
  tableId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Table',
    default: null
  },
  customerName: {
    type: String,
    default: 'Walk-in Customer'
  },
  customerPhone: {
    type: String,
    default: ''
  },
  customerGstin: {
    type: String,
    default: '',
    uppercase: true,
    trim: true,
    match: [/^$|^[0-9A-Z]{15}$/, 'Invalid GSTIN']
  },
  paymentMode: {
    type: String,
    enum: ['Cash', 'PhonePe', 'QR', 'Online', 'UPI', 'Card', 'Credit/Debit Card', 'QR Code', 'UPI/Online', 'Split'],
    default: 'Cash'
  },
  paymentBreakdown: {
    type: mongoose.Schema.Types.Mixed,
    default: null
  },
  paymentReference: { type: String, default: '', trim: true, maxlength: 100 },
  paymentProvider: { type: String, default: 'manual', trim: true, maxlength: 40 },
  subTotal: {
    type: Number,
    required: true
  },
  tax: {
    type: Number,
    default: 0
  },
  gstRate: { type: Number, default: 0, min: 0, max: 100 },
  cgst: { type: Number, default: 0, min: 0 },
  sgst: { type: Number, default: 0, min: 0 },
  igst: { type: Number, default: 0, min: 0 },
  discount: {
    type: Number,
    default: 0
  },
  grandTotal: {
    type: Number,
    required: true
  },
  status: {
    type: String,
    enum: ['paid', 'refunded'],
    default: 'paid'
  },
  refundReason: {
    type: String,
    default: ''
  },
  refundedBy: {
    type: String,
    default: ''
  },
  refundedAt: {
    type: Date,
    default: null
  },
  settledAt: {
    type: Date,
    default: Date.now
  }
}, { timestamps: true });

paymentSchema.index({ orderId: 1 }, { unique: true });

module.exports = mongoose.model('Payment', paymentSchema);