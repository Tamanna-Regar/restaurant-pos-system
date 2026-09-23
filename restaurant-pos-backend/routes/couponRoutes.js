const express = require('express');
const router = express.Router();
const Coupon = require('../models/Coupon');

// Default Seed Coupons
const DEFAULT_COUPONS = [
  {
    code: 'WELCOME10',
    discountType: 'percentage',
    discountValue: 10,
    minOrderAmount: 300,
    maxDiscountAmount: 100,
    validTill: new Date('2030-12-31'),
    isActive: true,
    usageLimit: 0
  },
  {
    code: 'FLAT50',
    discountType: 'flat',
    discountValue: 50,
    minOrderAmount: 400,
    maxDiscountAmount: 50,
    validTill: new Date('2030-12-31'),
    isActive: true,
    usageLimit: 0
  },
  {
    code: 'FESTIVE20',
    discountType: 'percentage',
    discountValue: 20,
    minOrderAmount: 800,
    maxDiscountAmount: 250,
    validTill: new Date('2030-12-31'),
    isActive: true,
    usageLimit: 0
  },
  {
    code: 'STAFF30',
    discountType: 'percentage',
    discountValue: 30,
    minOrderAmount: 100,
    maxDiscountAmount: 500,
    validTill: new Date('2030-12-31'),
    isActive: true,
    usageLimit: 0
  }
];

// 1. Get All Coupons (Auto-seeds if none exist)
router.get('/', async (req, res) => {
  try {
    let coupons = await Coupon.find({}).sort({ createdAt: -1 });
    if (coupons.length === 0) {
      await Coupon.insertMany(DEFAULT_COUPONS);
      coupons = await Coupon.find({}).sort({ createdAt: -1 });
    }
    res.json({ success: true, data: coupons });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// 2. Create New Coupon (Admin)
router.post('/create', async (req, res) => {
  try {
    if (!['admin', 'manager'].includes(req.user?.role)) {
      return res.status(403).json({ success: false, message: 'Only admin or manager can create coupons.' });
    }
    const { code, discountType, discountValue, minOrderAmount = 0, maxDiscountAmount = 0, validTill, usageLimit = 0 } = req.body;
    
    if (!code || !discountType || !discountValue) {
      return res.status(400).json({ success: false, message: 'Code, Discount Type, and Value are required.' });
    }

    const existing = await Coupon.findOne({ code: String(code).trim().toUpperCase() });
    if (existing) {
      return res.status(400).json({ success: false, message: 'A coupon with this code already exists.' });
    }

    const coupon = new Coupon({
      code: String(code).trim().toUpperCase(),
      discountType,
      discountValue: Number(discountValue),
      minOrderAmount: Number(minOrderAmount || 0),
      maxDiscountAmount: Number(maxDiscountAmount || 0),
      validTill: validTill ? new Date(validTill) : new Date('2030-12-31'),
      usageLimit: Number(usageLimit || 0),
      isActive: true
    });

    await coupon.save();
    res.status(201).json({ success: true, data: coupon });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

// 3. Validate & Apply Coupon on Billing Screen
router.post('/apply', async (req, res) => {
  try {
    const { code, orderAmount = 0, customerPhone = '' } = req.body;
    if (!code) {
      return res.status(400).json({ success: false, message: 'Coupon code is required.' });
    }

    const coupon = await Coupon.findOne({ code: String(code).trim().toUpperCase(), isActive: true });
    if (!coupon) {
      return res.status(404).json({ success: false, message: 'Invalid or inactive coupon code.' });
    }

    // Check expiry
    if (new Date() > new Date(coupon.validTill)) {
      return res.status(400).json({ success: false, message: 'This coupon has expired.' });
    }

    // Check minimum bill condition
    if (Number(orderAmount) < coupon.minOrderAmount) {
      return res.status(400).json({ 
        success: false, 
        message: `Minimum bill amount to apply this coupon is ₹${coupon.minOrderAmount}` 
      });
    }

    // Check overall usage limit
    if (coupon.usageLimit > 0 && coupon.usedCount >= coupon.usageLimit) {
      return res.status(400).json({ success: false, message: 'Coupon usage limit has been reached.' });
    }

    // Check customer-specific redemption
    const phone = String(customerPhone || '').replace(/\D/g, '');
    if (phone && coupon.redemptions && coupon.redemptions.some((r) => r.phone === phone)) {
      return res.status(400).json({ success: false, message: 'This coupon has already been redeemed for this customer.' });
    }

    // Calculate Discount Amount
    let discountAmt = 0;
    if (coupon.discountType === 'percentage') {
      discountAmt = (Number(orderAmount) * coupon.discountValue) / 100;
      if (coupon.maxDiscountAmount > 0 && discountAmt > coupon.maxDiscountAmount) {
        discountAmt = coupon.maxDiscountAmount;
      }
    } else {
      discountAmt = Math.min(coupon.discountValue, Number(orderAmount));
    }

    res.json({
      success: true,
      code: coupon.code,
      discountType: coupon.discountType,
      discountValue: coupon.discountValue,
      discountAmt: Math.round(discountAmt * 100) / 100,
      message: `Coupon "${coupon.code}" applied! You saved ₹${(Math.round(discountAmt * 100) / 100).toFixed(2)}.`
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// 4. Toggle Active/Inactive Status
router.patch('/:id/toggle', async (req, res) => {
  try {
    if (!['admin', 'manager'].includes(req.user?.role)) {
      return res.status(403).json({ success: false, message: 'Only admin or manager can modify coupons.' });
    }
    const coupon = await Coupon.findById(req.params.id);
    if (!coupon) return res.status(404).json({ success: false, message: 'Coupon not found.' });

    coupon.isActive = !coupon.isActive;
    await coupon.save();
    res.json({ success: true, data: coupon });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// 5. Delete Coupon
router.delete('/:id', async (req, res) => {
  try {
    if (!['admin', 'manager'].includes(req.user?.role)) {
      return res.status(403).json({ success: false, message: 'Only admin or manager can delete coupons.' });
    }
    const deleted = await Coupon.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ success: false, message: 'Coupon not found.' });
    res.json({ success: true, message: 'Coupon deleted successfully.' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;