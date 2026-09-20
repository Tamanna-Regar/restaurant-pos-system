const express = require('express');
const Feedback = require('../models/Feedback');
const Order = require('../models/Order');

const router = express.Router();

router.post('/', async (req, res) => {
  try {
    const orderId = String(req.body.orderId || '');
    const rating = Number(req.body.rating);
    if (!orderId || !Number.isInteger(rating) || rating < 1 || rating > 5) {
      return res.status(400).json({ success: false, message: 'Order and rating from 1 to 5 are required.' });
    }
    const order = await Order.findById(orderId).select('customerName customerPhone');
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });
    const feedback = await Feedback.findOneAndUpdate(
      { orderId },
      { orderId, rating, comment: String(req.body.comment || '').trim(), customerName: order.customerName, customerPhone: order.customerPhone },
      { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true }
    );
    res.status(201).json({ success: true, data: feedback });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.get('/', async (req, res) => {
  try {
    const feedback = await Feedback.find({}).sort({ createdAt: -1 }).limit(300).lean();
    res.json({ success: true, data: feedback });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
