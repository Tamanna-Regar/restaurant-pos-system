const privilegedRoles = new Set(['admin', 'manager']);

const getBranchScope = (req, field = 'branchId') => {
  const requested = String(req.query.branchId || '').trim();
  if (privilegedRoles.has(req.user?.role)) {
    return requested ? { [field]: requested } : {};
  }
  return { [field]: req.user?.branchId || null };
};

const canAccessBranch = (req, branchId) => {
  if (privilegedRoles.has(req.user?.role)) return true;
  return String(req.user?.branchId || '') === String(branchId || '');
};

module.exports = { getBranchScope, canAccessBranch };
