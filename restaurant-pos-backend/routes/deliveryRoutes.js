const express = require('express');
const DeliveryPartner = require('../models/DeliveryPartner');
const OnlineOrder = require('../models/OnlineOrder');

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const partners = await DeliveryPartner.find({ active: true }).sort({ name: 1 });
    res.json({ success: true, data: partners });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const partner = await DeliveryPartner.create(req.body);
    res.status(201).json({ success: true, data: partner });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.patch('/:id/status', async (req, res) => {
  try {
    const partner = await DeliveryPartner.findByIdAndUpdate(req.params.id, { status: req.body.status }, { new: true, runValidators: true });
    if (!partner) return res.status(404).json({ success: false, message: 'Delivery partner not found' });
    res.json({ success: true, data: partner });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.post('/:id/assign/:orderId', async (req, res) => {
  try {
    const [partner, order] = await Promise.all([
      DeliveryPartner.findById(req.params.id),
      OnlineOrder.findById(req.params.orderId)
    ]);
    if (!partner || !order) return res.status(404).json({ success: false, message: 'Partner or order not found' });
    if (partner.status === 'busy') return res.status(409).json({ success: false, message: 'Partner is already busy' });
    partner.status = 'busy';
    partner.currentOrderId = order._id;
    order.deliveryPartner = partner.name;
    if (order.status === 'Pending') order.status = 'Accepted';
    order.statusHistory.push({ status: order.status, updatedBy: 'Delivery Assignment' });
    await Promise.all([partner.save(), order.save()]);
    res.json({ success: true, data: { partner, order } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
