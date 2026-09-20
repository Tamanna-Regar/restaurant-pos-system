const express = require('express');
const router = express.Router();
const Coupon = require('../models/Coupon');

// Create New Coupon (Admin)
router.post('/create', async (req, res) => {
  try {
    const coupon = new Coupon(req.body);
    await coupon.save();
    res.status(201).json({ success: true, data: coupon });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

// Validate & Apply Coupon on Billing Screen
router.post('/apply', async (req, res) => {
  try {
    const { code, orderAmount, customerPhone = '' } = req.body;
    const coupon = await Coupon.findOne({ code: code.toUpperCase(), isActive: true });

    if (!coupon) {
      return res.status(404).json({ success: false, message: 'Invalid or expired coupon code' });
    }

    // Check expiry
    if (new Date() > new Date(coupon.validTill)) {
      return res.status(400).json({ success: false, message: 'Coupon has expired' });
    }

    // Check minimum bill condition
    if (orderAmount < coupon.minOrderAmount) {
      return res.status(400).json({ 
        success: false, 
        message: `Minimum bill amount to apply this coupon is ₹${coupon.minOrderAmount}` 
      });
    }

    // Check usage limit
    if (coupon.usageLimit > 0 && coupon.usedCount >= coupon.usageLimit) {
      return res.status(400).json({ success: false, message: 'Coupon usage limit reached' });
    }
    const phone = String(customerPhone || '').replace(/\D/g, '');
    if (phone && coupon.redemptions.some((redemption) => redemption.phone === phone)) {
      return res.status(400).json({ success: false, message: 'This coupon has already been used by this customer' });
    }

    // Calculate Discount Amount
    let discountAmt = 0;
    if (coupon.discountType === 'percentage') {
      discountAmt = (orderAmount * coupon.discountValue) / 100;
      if (coupon.maxDiscountAmount > 0 && discountAmt > coupon.maxDiscountAmount) {
        discountAmt = coupon.maxDiscountAmount;
      }
    } else {
      discountAmt = coupon.discountValue;
    }

    res.json({
      success: true,
      code: coupon.code,
      discountAmt: Math.round(discountAmt * 100) / 100,
      message: 'Coupon applied successfully!'
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Get All Coupons
router.get('/', async (req, res) => {
  try {
    const coupons = await Coupon.find({}).sort({ createdAt: -1 });
    res.json({ success: true, data: coupons });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;