const mongoose = require('mongoose');

const deliveryPartnerSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  phone: { type: String, required: true, trim: true },
  vehicleNumber: { type: String, default: '' },
  status: { type: String, enum: ['available', 'busy', 'offline'], default: 'available' },
  currentOrderId: { type: mongoose.Schema.Types.ObjectId, ref: 'OnlineOrder', default: null },
  active: { type: Boolean, default: true }
}, { timestamps: true });

deliveryPartnerSchema.index({ phone: 1 }, { unique: true });
module.exports = mongoose.model('DeliveryPartner', deliveryPartnerSchema);
