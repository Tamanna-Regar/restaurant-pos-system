const mongoose = require('mongoose');

const onlineOrderItemSchema = new mongoose.Schema({
  itemId: { type: mongoose.Schema.Types.ObjectId, ref: 'Item', default: null },
  name: { type: String, required: true, trim: true },
  quantity: { type: Number, required: true, min: 1 },
  price: { type: Number, required: true, min: 0 }
}, { _id: false });

const onlineOrderSchema = new mongoose.Schema({
  provider: {
    type: String,
    enum: ['Zomato', 'Swiggy', 'Direct'],
    required: true
  },
  providerOrderId: { type: String, required: true, trim: true },
  status: {
    type: String,
    enum: ['Pending', 'Accepted', 'Rejected', 'Preparing', 'Ready for Pickup', 'Out for Delivery', 'Delivered', 'Cancelled'],
    default: 'Pending'
  },
  customerName: { type: String, default: 'New Customer', trim: true },
  customerPhone: { type: String, default: '', trim: true },
  deliveryAddress: { type: String, default: '', trim: true },
  deliveryPartner: { type: String, default: '', trim: true },
  items: { type: [onlineOrderItemSchema], default: [] },
  subtotal: { type: Number, default: 0, min: 0 },
  commissionRate: { type: Number, default: 18, min: 0, max: 100 },
  commissionAmount: { type: Number, default: 0, min: 0 },
  rawPayload: { type: mongoose.Schema.Types.Mixed, default: null },
  statusHistory: [{
    status: String,
    timestamp: { type: Date, default: Date.now },
    updatedBy: { type: String, default: 'System' }
  }]
}, { timestamps: true });

onlineOrderSchema.index({ provider: 1, providerOrderId: 1 }, { unique: true });
onlineOrderSchema.index({ status: 1, createdAt: -1 });

onlineOrderSchema.methods.recalculateTotals = function () {
  this.subtotal = this.items.reduce((total, item) => total + (item.price * item.quantity), 0);
  this.commissionAmount = Number(((this.subtotal * this.commissionRate) / 100).toFixed(2));
};

module.exports = mongoose.model('OnlineOrder', onlineOrderSchema);
