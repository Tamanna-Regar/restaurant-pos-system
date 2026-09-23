const express = require('express');
const Customer = require('../models/Customer');
const Order = require('../models/Order');

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const { search, q } = req.query;
    const filter = {};
    const searchTerm = (search || q || '').trim();
    if (searchTerm) {
      const regex = new RegExp(searchTerm.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&'), 'i');
      filter.$or = [{ name: regex }, { phone: regex }, { email: regex }];
    }
    const customers = await Customer.find(filter).sort({ updatedAt: -1 }).limit(100);
    res.json({ success: true, data: customers });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.get('/history/:phone', async (req, res) => {
  try {
    const phone = String(req.params.phone || '').replace(/\D/g, '');
    if (!phone) return res.status(400).json({ success: false, message: 'Customer phone is required' });
    const orders = await Order.find({ customerPhone: phone })
      .select('invoiceNumber orderType items subTotal tax grandTotal paymentStatus orderStatus createdAt')
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();
    res.json({ success: true, data: orders });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.get('/:phone', async (req, res) => {
  try {
    const phone = String(req.params.phone || '').replace(/\D/g, '');
    if (!phone) return res.status(400).json({ success: false, message: 'Customer phone is required' });
    const customer = await Customer.findOne({ phone });
    if (!customer) return res.status(404).json({ success: false, message: 'Customer not found' });
    const today = new Date();
    const birthday = customer.dateOfBirth ? new Date(customer.dateOfBirth) : null;
    const isBirthdayMonth = Boolean(birthday && birthday.getMonth() === today.getMonth());
    const birthdayOffer = isBirthdayMonth
      ? { eligible: true, discountPercent: customer.membershipTier === 'Platinum' || customer.membershipTier === 'Gold' ? 20 : 10, message: 'Birthday month offer available' }
      : { eligible: false, discountPercent: 0, message: '' };
    res.json({ success: true, data: { ...customer.toObject(), birthdayOffer } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const phone = String(req.body.phone || '').replace(/\D/g, '');
    if (!phone) return res.status(400).json({ success: false, message: 'Customer phone is required' });
    const customer = await Customer.findOneAndUpdate(
      { phone },
      { $set: {
        name: req.body.name || 'Guest Customer',
        email: req.body.email || '',
        address: req.body.address || '',
        gstin: String(req.body.gstin || '').trim().toUpperCase(),
        stateCode: String(req.body.stateCode || '').trim(),
        dateOfBirth: req.body.dateOfBirth || null
      } },
      { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
    );
    res.status(201).json({ success: true, data: customer });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/:phone/redeem-points', async (req, res) => {
  try {
    const phone = String(req.params.phone || '').replace(/\D/g, '');
    const points = Number(req.body.points || 0);
    if (!phone || !Number.isInteger(points) || points < 100) {
      return res.status(400).json({ success: false, message: 'At least 100 valid points are required to redeem.' });
    }
    const customer = await Customer.findOne({ phone });
    if (!customer) return res.status(404).json({ success: false, message: 'Customer not found' });
    if (customer.loyaltyPoints < points) return res.status(400).json({ success: false, message: 'Insufficient loyalty points' });
    customer.loyaltyPoints -= points;
    customer.redeemedPoints += points;
    await customer.save();
    res.json({ success: true, data: { loyaltyPoints: customer.loyaltyPoints, redeemedPoints: customer.redeemedPoints, discountAmount: points } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
