const mongoose = require('mongoose');

const couponSchema = new mongoose.Schema({
  code: { type: String, required: true, unique: true, uppercase: true, trim: true }, // e.g., 'FESTIVE20', 'FLAT100'
  discountType: { type: String, enum: ['percentage', 'flat'], required: true }, // % discount ya flat ₹ off
  discountValue: { type: Number, required: true }, // 20 (% or ₹ value)
  minOrderAmount: { type: Number, default: 0 }, // Minimum bill value to apply
  maxDiscountAmount: { type: Number, default: 0 }, // Max cap for % discount (e.g., max ₹150 off)
  validTill: { type: Date, required: true },
  isActive: { type: Boolean, default: true },
  usageLimit: { type: Number, default: 0 }, // 0 = unlimited usage
  usedCount: { type: Number, default: 0 },
  redemptions: [{
    phone: { type: String, default: '' },
    redeemedAt: { type: Date, default: Date.now }
  }]
}, { timestamps: true });

module.exports = mongoose.model('Coupon', couponSchema);