const AuditLog = require('../models/AuditLog');

/**
 * Reusable Audit Logger for POS system activities.
 * Never throws errors to caller - logs failures to console so critical operations aren't interrupted.
 */
async function logAudit({
  action,
  resource,
  resourceId = '',
  user = null,
  userName = '',
  userRole = '',
  metadata = null,
  req = null,
  io = null
}) {
  try {
    if (!action || !resource) {
      console.warn('logAudit: action and resource are required.');
      return null;
    }

    // Resolve user details
    const resolvedUser = user || (req && req.user) || null;
    const finalUserId = resolvedUser?._id || resolvedUser?.id || null;
    const finalUserName = resolvedUser?.name || userName || 'System';
    const finalUserRole = resolvedUser?.role || userRole || 'system';

    // Extract IP address
    let clientIp = '';
    if (req) {
      clientIp = req.headers?.['x-forwarded-for']?.split(',')[0]?.trim() ||
                 req.socket?.remoteAddress ||
                 req.ip ||
                 '';
    }

    const logEntry = await AuditLog.create({
      action: String(action).toUpperCase(),
      resource: String(resource),
      resourceId: String(resourceId || ''),
      userId: finalUserId,
      userName: finalUserName,
      userRole: finalUserRole,
      metadata: metadata || null,
      ipAddress: clientIp
    });

    // Broadcast in real-time over Socket.io if available
    const activeIo = io || (req && req.app && req.app.get && req.app.get('io'));
    if (activeIo) {
      activeIo.emit('audit-logged', {
        log: logEntry,
        summary: `${finalUserName} (${finalUserRole}): ${action} on ${resource}`
      });
    }

    return logEntry;
  } catch (error) {
    console.error('AuditLogger error:', error.message);
    return null;
  }
}

module.exports = { logAudit };

