const express = require('express');
const AuditLog = require('../models/AuditLog');

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const filter = {};
    if (req.query.resource) filter.resource = req.query.resource;
    const logs = await AuditLog.find(filter).sort({ createdAt: -1 }).limit(Math.min(Number(req.query.limit || 200), 1000));
    res.json({ success: true, data: logs });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Create audit log (manual/testing)
router.post('/', async (req, res) => {
  try {
    const { action, resource, resourceId = '', metadata = null } = req.body;
    if (!action || !resource) {
      return res.status(400).json({ success: false, message: 'action and resource are required' });
    }

    const log = await AuditLog.create({
      action,
      resource,
      resourceId,
      userId: req.user?._id || null,
      userName: req.user?.name || 'System',
      metadata,
      ipAddress: req.ip || ''
    });

    res.status(201).json({ success: true, data: log });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

module.exports = router;