const express = require('express');
const RestaurantSettings = require('../models/RestaurantSettings');

const router = express.Router();

const defaults = { name: 'Tamanna Restaurant', address: '', phone: '', gstin: '', upiId: '' };

router.get('/restaurant', async (req, res) => {
  try {
    const settings = await RestaurantSettings.findOne().lean();
    res.json({ success: true, data: settings || defaults });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.put('/restaurant', async (req, res) => {
  try {
    if (!['admin', 'manager'].includes(req.user.role)) {
      return res.status(403).json({ success: false, message: 'Only admin or manager can update restaurant settings' });
    }
    const update = {
      name: String(req.body.name || defaults.name).trim(),
      address: String(req.body.address || '').trim(),
      phone: String(req.body.phone || '').trim(),
      gstin: String(req.body.gstin || '').trim().toUpperCase(),
      upiId: String(req.body.upiId || '').trim(),
      updatedBy: req.user._id
    };
    const settings = await RestaurantSettings.findOneAndUpdate({}, update, { new: true, upsert: true, setDefaultsOnInsert: true, runValidators: true });
    res.json({ success: true, data: settings });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

module.exports = router;
