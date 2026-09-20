const crypto = require('crypto');
const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/user');
const RefreshToken = require('../models/RefreshToken');
const LoginActivity = require('../models/LoginActivity');
const { authenticate } = require('../middleware/authMiddleware');

const validRoles = ['admin', 'manager', 'waiter', 'chef', 'inventory_manager', 'delivery', 'cashier'];
const REFRESH_TOKEN_TTL = 7 * 24 * 60 * 60 * 1000;

const createToken = (user, expiresIn = '15m') => {
  if (!process.env.JWT_SECRET_KEY) {
    throw new Error('JWT_SECRET_KEY is not configured');
  }
  return jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET_KEY, { expiresIn });
};

const createRefreshToken = async (user) => {
  const raw = crypto.randomBytes(32).toString('hex');
  const hash = crypto.createHash('sha256').update(raw).digest('hex');
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL);

  await RefreshToken.deleteMany({ userId: user._id });
  await RefreshToken.create({ userId: user._id, tokenHash: hash, expiresAt, createdBy: 'auth' });

  return { raw, hash, expiresAt };
};

const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');

const recordLogin = (req, data) => LoginActivity.create({
  ...data,
  ipAddress: req.ip,
  userAgent: String(req.get('user-agent') || '').slice(0, 500)
}).catch((error) => console.error('Login activity error:', error.message));

const defaultUsers = [
  { name: 'Admin User', email: 'admin@restaurant.com', password: 'admin123', role: 'admin' },
  { name: 'Manager User', email: 'manager@restaurant.com', password: 'manager123', role: 'manager' },
  { name: 'Waiter User', email: 'waiter@restaurant.com', password: 'waiter123', role: 'waiter' },
  { name: 'Chef User', email: 'chef@restaurant.com', password: 'chef123', role: 'chef' },
  { name: 'Inventory Manager', email: 'inventory@restaurant.com', password: 'inventory123', role: 'inventory_manager' },
  { name: 'Delivery User', email: 'delivery@restaurant.com', password: 'delivery123', role: 'delivery' }
];

const ensureDefaultUsers = async () => {
  for (const userData of defaultUsers) {
    const existing = await User.findOne({ email: userData.email });
    if (!existing) {
      const hash = await bcrypt.hash(userData.password, 10);
      await User.create({
        name: userData.name,
        email: userData.email,
        password: hash,
        role: userData.role,
        isActive: true
      });
    }
  }
};

router.post('/seed-default-users', authenticate, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Only admin can seed default users' });
    }
    await ensureDefaultUsers();
    res.json({ success: true, message: 'Default restaurant users ready.' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/register', authenticate, async (req, res) => {
  try {
    const { name, email, password } = req.body;
    const role = req.user?.role;
    if (!req.user || !['admin', 'manager'].includes(req.user.role)) {
      return res.status(403).json({ success: false, message: 'Only admin or manager can create users' });
    }
    const selectedRole = String(req.body.role || 'waiter').toLowerCase();
    const normalizedEmail = String(email || '').trim().toLowerCase();

    if (!name || !email || !password) {
      return res.status(400).json({ message: 'Name, email and password are required' });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      return res.status(400).json({ message: 'A valid email is required' });
    }
    if (String(password).length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters' });
    }
    if (!validRoles.includes(selectedRole)) {
      return res.status(400).json({ message: 'Invalid role selected' });
    }

    const existingUser = await User.findOne({ email: normalizedEmail });
    if (existingUser) {
      return res.status(400).json({ message: 'Email already registered' });
    }

    const hashed = await bcrypt.hash(password, 10);
    const user = await User.create({
      name,
      email: normalizedEmail,
      password: hashed,
      role: selectedRole,
      isActive: true
    });

    const accessToken = createToken(user, '15m');
    const refreshToken = await createRefreshToken(user);

    res.status(201).json({
      success: true,
      message: 'User registered successfully',
      token: accessToken,
      refreshToken: refreshToken.raw,
      user: { id: user._id, name: user.name, email: user.email, role: user.role, branchId: user.branchId || null }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Public registration is intentionally limited to non-privileged staff roles.
// Admin and manager accounts must still be created by an authorized user.
router.post('/register-public', async (req, res) => {
  try {
    const name = String(req.body.name || '').trim();
    const normalizedEmail = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');
    const role = String(req.body.role || 'waiter').toLowerCase();
    const publicRoles = ['waiter', 'cashier', 'chef', 'inventory_manager', 'delivery'];

    if (name.length < 2 || name.length > 80) {
      return res.status(400).json({ success: false, message: 'Name must be between 2 and 80 characters.' });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      return res.status(400).json({ success: false, message: 'Enter a valid email address.' });
    }
    if (password.length < 6) {
      return res.status(400).json({ success: false, message: 'Password must be at least 6 characters.' });
    }
    if (!publicRoles.includes(role)) {
      return res.status(400).json({ success: false, message: 'Select a valid staff role.' });
    }
    if (await User.findOne({ email: normalizedEmail })) {
      return res.status(409).json({ success: false, message: 'Email already registered. Please sign in.' });
    }

    const user = await User.create({
      name,
      email: normalizedEmail,
      password: await bcrypt.hash(password, 10),
      role,
      isActive: true
    });

    res.status(201).json({
      success: true,
      message: 'Account created. You can sign in now.',
      user: { id: user._id, name: user.name, email: user.email, role: user.role, branchId: user.branchId || null }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/login', async (req, res) => {
  try {
    await ensureDefaultUsers();

    const { email, password, role } = req.body;
    const selectedRole = String(role || 'waiter').toLowerCase();
    const normalizedEmail = String(email || '').trim().toLowerCase();

    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required' });
    }
    if (!validRoles.includes(selectedRole)) {
      return res.status(400).json({ message: 'Invalid role selected' });
    }

    const user = await User.findOne({ email: normalizedEmail });
    if (!user) {
      await recordLogin(req, { email: normalizedEmail, success: false, failureReason: 'User not found' });
      return res.status(401).json({ message: 'User not found. Please register first.' });
    }
    if (user.role !== selectedRole) {
      await recordLogin(req, { email: normalizedEmail, userId: user._id, role: user.role, success: false, failureReason: 'Role mismatch' });
      return res.status(403).json({ message: `Selected role mismatch. This account is registered as ${user.role}.` });
    }
    if (!user.isActive) {
      await recordLogin(req, { email: normalizedEmail, userId: user._id, role: user.role, success: false, failureReason: 'Account inactive' });
      return res.status(403).json({ message: 'This account is inactive. Contact an administrator.' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      await recordLogin(req, { email: normalizedEmail, userId: user._id, role: user.role, success: false, failureReason: 'Invalid password' });
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const accessToken = createToken(user, '15m');
    const refreshToken = await createRefreshToken(user);
    await recordLogin(req, { email: normalizedEmail, userId: user._id, role: user.role, success: true });

    res.json({
      success: true,
      message: `${user.role} login successful`,
      token: accessToken,
      refreshToken: refreshToken.raw,
      user: { id: user._id, name: user.name, email: user.email, role: user.role, branchId: user.branchId || null }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/refresh', async (req, res) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) {
      return res.status(400).json({ success: false, message: 'Refresh token is required' });
    }

    const tokenHash = hashToken(refreshToken);
    const storedToken = await RefreshToken.findOne({ tokenHash, revokedAt: null }).sort({ createdAt: -1 });
    if (!storedToken || storedToken.expiresAt < new Date()) {
      return res.status(401).json({ success: false, message: 'Refresh token is invalid or expired' });
    }

    const user = await User.findById(storedToken.userId);
    if (!user || !user.isActive) {
      return res.status(401).json({ success: false, message: 'User not found or inactive' });
    }

    const accessToken = createToken(user, '15m');
    res.json({ success: true, token: accessToken, user: { id: user._id, name: user.name, email: user.email, role: user.role } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/logout', authenticate, async (req, res) => {
  try {
    const { refreshToken } = req.body;
    if (refreshToken) {
      await RefreshToken.updateOne(
        { userId: req.user._id, tokenHash: hashToken(refreshToken), revokedAt: null },
        { $set: { revokedAt: new Date() } }
      );
    }

    await RefreshToken.updateMany(
      { userId: req.user._id, revokedAt: null },
      { $set: { revokedAt: new Date() } }
    );

    res.json({ success: true, message: 'Logged out successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/change-password', authenticate, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ success: false, message: 'Current password and new password are required' });
    }
    if (String(newPassword).length < 6) {
      return res.status(400).json({ success: false, message: 'New password must be at least 6 characters' });
    }

    const user = await User.findById(req.user._id);
    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Current password is incorrect' });
    }

    user.password = await bcrypt.hash(newPassword, 10);
    user.passwordResetToken = null;
    user.passwordResetExpires = null;
    await user.save();
    await RefreshToken.updateMany({ userId: user._id }, { $set: { revokedAt: new Date() } });

    res.json({ success: true, message: 'Password changed successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/forgot-password', async (req, res) => {
  try {
    const normalizedEmail = String(req.body.email || '').trim().toLowerCase();
    if (!normalizedEmail) {
      return res.status(400).json({ success: false, message: 'Email is required' });
    }

    const user = await User.findOne({ email: normalizedEmail });
    if (!user) {
      return res.json({ success: true, message: 'If the account exists, a reset token has been generated.' });
    }

    const resetToken = crypto.randomBytes(24).toString('hex');
    user.passwordResetToken = resetToken;
    user.passwordResetExpires = new Date(Date.now() + 15 * 60 * 1000);
    await user.save();

    res.json({
      success: true,
      message: 'Password reset token generated successfully.',
      expiresInMinutes: 15
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/reset-password', async (req, res) => {
  try {
    const { token, newPassword } = req.body;
    if (!token || !newPassword) {
      return res.status(400).json({ success: false, message: 'Reset token and new password are required' });
    }
    if (String(newPassword).length < 6) {
      return res.status(400).json({ success: false, message: 'New password must be at least 6 characters' });
    }

    const user = await User.findOne({
      passwordResetToken: token,
      passwordResetExpires: { $gt: Date.now() }
    });

    if (!user) {
      return res.status(400).json({ success: false, message: 'Reset token is invalid or expired' });
    }

    user.password = await bcrypt.hash(newPassword, 10);
    user.passwordResetToken = null;
    user.passwordResetExpires = null;
    await user.save();
    await RefreshToken.deleteMany({ userId: user._id });

    res.json({ success: true, message: 'Password reset successful' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.get('/me', authenticate, async (req, res) => {
  res.json({
    success: true,
    user: {
      id: req.user._id,
      name: req.user.name,
      email: req.user.email,
      role: req.user.role,
      isActive: req.user.isActive,
      permissions: req.user.permissions || {}
      ,branchId: req.user.branchId || null
    }
  });
});

router.get('/users', authenticate, async (req, res) => {
  try {
    if (!['admin', 'manager'].includes(req.user.role)) {
      return res.status(403).json({ success: false, message: 'Only admin/manager can list users' });
    }
    const users = await User.find({}).select('-password').sort({ createdAt: -1 });
    res.json({ success: true, data: users });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/users', authenticate, async (req, res) => {
  try {
    if (!['admin', 'manager'].includes(req.user.role)) return res.status(403).json({ success: false, message: 'Only admin or manager can create users' });
    const { name, email, password, role = 'waiter' } = req.body;
    const normalizedEmail = String(email || '').trim().toLowerCase();
    const selectedRole = String(role).toLowerCase();
    if (!name || !normalizedEmail || !password || !validRoles.includes(selectedRole)) return res.status(400).json({ success: false, message: 'Name, email, password and valid role are required' });
    if (req.user.role !== 'admin' && selectedRole === 'admin') return res.status(403).json({ success: false, message: 'Only admin can create another admin' });
    if (String(password).length < 6) return res.status(400).json({ success: false, message: 'Password must be at least 6 characters' });
    if (await User.findOne({ email: normalizedEmail })) return res.status(409).json({ success: false, message: 'Email already registered' });
    const user = await User.create({ name: String(name).trim(), email: normalizedEmail, password: await bcrypt.hash(password, 10), role: selectedRole, branchId: req.body.branchId || null, isActive: true });
    res.status(201).json({ success: true, data: { id: user._id, name: user.name, email: user.email, role: user.role, isActive: user.isActive } });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.patch('/users/:id', authenticate, async (req, res) => {
  try {
    if (!['admin', 'manager'].includes(req.user.role)) return res.status(403).json({ success: false, message: 'Only admin or manager can update users' });
    const update = {};
    if (req.body.name !== undefined) update.name = String(req.body.name).trim();
    if (req.body.role !== undefined) {
      const role = String(req.body.role).toLowerCase();
      if (!validRoles.includes(role)) return res.status(400).json({ success: false, message: 'Invalid role' });
      if (req.user.role !== 'admin' && role === 'admin') return res.status(403).json({ success: false, message: 'Only admin can assign admin role' });
      update.role = role;
    }
    if (req.body.isActive !== undefined) update.isActive = Boolean(req.body.isActive);
    if (req.body.branchId !== undefined) update.branchId = req.body.branchId || null;
    if (req.body.permissions !== undefined) {
      if (req.user.role !== 'admin') return res.status(403).json({ success: false, message: 'Only admin can manage user permissions' });
      if (!req.body.permissions || typeof req.body.permissions !== 'object' || Array.isArray(req.body.permissions)) {
        return res.status(400).json({ success: false, message: 'Permissions must be an object' });
      }
      update.permissions = req.body.permissions;
    }
    const user = await User.findByIdAndUpdate(req.params.id, update, { new: true, runValidators: true }).select('-password');
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    if (update.isActive === false) await RefreshToken.updateMany({ userId: user._id }, { $set: { revokedAt: new Date() } });
    res.json({ success: true, data: user });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.post('/users/:id/password', authenticate, async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ success: false, message: 'Only admin can reset another user password' });
    const newPassword = String(req.body.newPassword || '');
    if (newPassword.length < 6) return res.status(400).json({ success: false, message: 'Password must be at least 6 characters' });
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    user.password = await bcrypt.hash(newPassword, 10);
    user.passwordResetToken = null;
    user.passwordResetExpires = null;
    await user.save();
    await RefreshToken.updateMany({ userId: user._id }, { $set: { revokedAt: new Date() } });
    res.json({ success: true, message: 'User password reset successfully' });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.get('/login-activity', authenticate, async (req, res) => {
  try {
    if (!['admin', 'manager'].includes(req.user.role)) return res.status(403).json({ success: false, message: 'Only admin or manager can view login activity' });
    const limit = Math.min(Math.max(Number(req.query.limit || 100), 1), 500);
    const records = await LoginActivity.find().populate('userId', 'name email role').sort({ createdAt: -1 }).limit(limit);
    res.json({ success: true, data: records });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;