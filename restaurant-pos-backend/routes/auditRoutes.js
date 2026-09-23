const express = require('express');
const AuditLog = require('../models/AuditLog');
const { logAudit } = require('../utils/auditLogger');

const router = express.Router();

// 1. Get Audit Logs with search, filters, date range and pagination
router.get('/', async (req, res) => {
  try {
    const filter = {};
    const { resource, action, q, startDate, endDate, page = 1, limit = 100 } = req.query;

    if (resource && resource !== 'all') {
      filter.resource = resource;
    }

    if (action && action !== 'all') {
      filter.action = action.toUpperCase();
    }

    if (startDate || endDate) {
      filter.createdAt = {};
      if (startDate) {
        const start = new Date(startDate);
        start.setHours(0, 0, 0, 0);
        filter.createdAt.$gte = start;
      }
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        filter.createdAt.$lte = end;
      }
    }

    if (q && String(q).trim()) {
      const regex = new RegExp(String(q).trim(), 'i');
      filter.$or = [
        { userName: regex },
        { userRole: regex },
        { action: regex },
        { resource: regex },
        { resourceId: regex },
        { ipAddress: regex },
        { 'metadata.dishName': regex },
        { 'metadata.itemName': regex },
        { 'metadata.reason': regex },
        { 'metadata.email': regex }
      ];
    }

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(Math.max(1, parseInt(limit, 10) || 100), 500);
    const skip = (pageNum - 1) * limitNum;

    const [logs, total] = await Promise.all([
      AuditLog.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .lean(),
      AuditLog.countDocuments(filter)
    ]);

    res.json({
      success: true,
      data: logs,
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        pages: Math.ceil(total / limitNum) || 1
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// 2. Get Audit Statistics & Summary
router.get('/stats', async (req, res) => {
  try {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const [
      totalToday,
      loginsToday,
      recipeUpdatesToday,
      voidsAlertsToday,
      shiftsToday,
      recentActions
    ] = await Promise.all([
      AuditLog.countDocuments({ createdAt: { $gte: todayStart } }),
      AuditLog.countDocuments({
        createdAt: { $gte: todayStart },
        action: { $in: ['LOGIN_SUCCESS', 'PIN_LOGIN_SUCCESS'] }
      }),
      AuditLog.countDocuments({
        createdAt: { $gte: todayStart },
        resource: 'Recipe'
      }),
      AuditLog.countDocuments({
        createdAt: { $gte: todayStart },
        action: { $in: ['ORDER_CANCELLED', 'ITEM_VOIDED', 'LOGIN_FAILED'] }
      }),
      AuditLog.countDocuments({
        createdAt: { $gte: todayStart },
        resource: 'Shift'
      }),
      AuditLog.aggregate([
        { $match: { createdAt: { $gte: todayStart } } },
        { $group: { _id: '$action', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 5 }
      ])
    ]);

    res.json({
      success: true,
      data: {
        totalToday,
        loginsToday,
        recipeUpdatesToday,
        voidsAlertsToday,
        shiftsToday,
        topActionsToday: recentActions
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// 3. Create audit log manually
router.post('/', async (req, res) => {
  try {
    const { action, resource, resourceId = '', metadata = null } = req.body;
    if (!action || !resource) {
      return res.status(400).json({ success: false, message: 'action and resource are required' });
    }

    const log = await logAudit({
      action,
      resource,
      resourceId,
      user: req.user,
      metadata,
      req
    });

    res.status(201).json({ success: true, data: log });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

module.exports = router;