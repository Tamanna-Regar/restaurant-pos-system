const express = require('express');
const CommunicationLog = require('../models/CommunicationLog');
const Customer = require('../models/Customer');
const { queueCommunication } = require('../utils/communicationHelper');

const router = express.Router();

router.get('/logs', async (req, res) => {
  try {
    const logs = await CommunicationLog.find({}).sort({ createdAt: -1 }).limit(200).lean();
    res.json({ success: true, data: logs });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/birthday-campaign', async (req, res) => {
  try {
    const month = new Date().getMonth();
    const customers = await Customer.find({ dateOfBirth: { $ne: null } }).lean();
    const eligible = customers.filter((customer) => new Date(customer.dateOfBirth).getMonth() === month && customer.phone);
    const logs = await Promise.all(eligible.map((customer) => queueCommunication({
      channel: 'whatsapp',
      purpose: 'birthday_offer',
      phone: customer.phone,
      customerName: customer.name,
      message: `Happy Birthday ${customer.name || 'Customer'}! Enjoy ${customer.membershipTier === 'Gold' || customer.membershipTier === 'Platinum' ? 20 : 10}% off at Tamanna Restaurant this birthday month.`
    })));
    res.json({ success: true, queued: logs.filter(Boolean).length });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
