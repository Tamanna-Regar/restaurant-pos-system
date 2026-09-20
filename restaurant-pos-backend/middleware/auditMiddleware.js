const AuditLog = require('../models/AuditLog');
const audit = (action, resource) => async (req, res, next) => {
  res.on('finish', () => {
    if (res.statusCode >= 200 && res.statusCode < 300) {
      AuditLog.create({
        action,
        resource,
        resourceId: req.params.id || req.params.orderId || '',
        userId: req.user?._id || null,
        userName: req.user?.name || req.body?.updatedBy || 'System',
        metadata: { method: req.method, statusCode: res.statusCode },
        ipAddress: req.ip
      }).catch((error) => console.error('Audit log error:', error.message));
    }
  });
  next();
};
module.exports = audit;
