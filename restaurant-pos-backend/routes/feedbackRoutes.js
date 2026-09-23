const express = require('express');
const Feedback = require('../models/Feedback');
const Order = require('../models/Order');
const { authenticate, authorize } = require('../middleware/authMiddleware');

const router = express.Router();

// PUBLIC: Customer submits feedback
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

// PUBLIC: Basic list (kept for backward compat)
router.get('/', async (req, res) => {
  try {
    const feedback = await Feedback.find({}).sort({ createdAt: -1 }).limit(300).lean();
    res.json({ success: true, data: feedback });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ─── ADMIN / MANAGER ROUTES ───────────────────────────────────────────────

// GET /feedback/admin — all feedback with stats, filter support
router.get('/admin', authenticate, authorize('admin', 'manager'), async (req, res) => {
  try {
    const { rating, from, to, limit = 200 } = req.query;
    const filter = {};
    if (rating) filter.rating = Number(rating);
    if (from || to) {
      filter.createdAt = {};
      if (from) filter.createdAt.$gte = new Date(from);
      if (to) {
        const toDate = new Date(to);
        toDate.setHours(23, 59, 59, 999);
        filter.createdAt.$lte = toDate;
      }
    }

    const [feedbackList, stats] = await Promise.all([
      Feedback.find(filter).sort({ createdAt: -1 }).limit(Number(limit)).lean(),
      Feedback.aggregate([
        { $group: {
          _id: null,
          avgRating: { $avg: '$rating' },
          total: { $sum: 1 },
          star5: { $sum: { $cond: [{ $eq: ['$rating', 5] }, 1, 0] } },
          star4: { $sum: { $cond: [{ $eq: ['$rating', 4] }, 1, 0] } },
          star3: { $sum: { $cond: [{ $eq: ['$rating', 3] }, 1, 0] } },
          star2: { $sum: { $cond: [{ $eq: ['$rating', 2] }, 1, 0] } },
          star1: { $sum: { $cond: [{ $eq: ['$rating', 1] }, 1, 0] } },
        }}
      ])
    ]);

    const s = stats[0] || { avgRating: 0, total: 0, star5: 0, star4: 0, star3: 0, star2: 0, star1: 0 };

    res.json({
      success: true,
      data: feedbackList,
      stats: {
        avgRating: Math.round((s.avgRating || 0) * 10) / 10,
        total: s.total,
        byRating: { 5: s.star5, 4: s.star4, 3: s.star3, 2: s.star2, 1: s.star1 }
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// DELETE /feedback/admin/:id — delete a feedback entry
router.delete('/admin/:id', authenticate, authorize('admin', 'manager'), async (req, res) => {
  try {
    await Feedback.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: 'Feedback deleted.' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
