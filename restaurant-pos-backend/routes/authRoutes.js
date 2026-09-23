const crypto = require('crypto');
const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/user');
const RefreshToken = require('../models/RefreshToken');
const LoginActivity = require('../models/LoginActivity');
const { authenticate } = require('../middleware/authMiddleware');
const { logAudit } = require('../utils/auditLogger');
const { sendPasswordResetEmail } = require('../utils/emailHelper');
const { generateOTP, verifyOTP, sendOtpSms } = require('../utils/smsHelper');
const { generateTwoFactorSecret, verifyTwoFactorToken, generateRecoveryCodes } = require('../utils/twoFactorHelper');

const validRoles = ['admin', 'manager', 'waiter', 'chef', 'inventory_manager', 'delivery', 'cashier'];
const REFRESH_TOKEN_TTL = 7 * 24 * 60 * 60 * 1000;

const createToken = (user, expiresIn = '24h') => {
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

const recordLogin = async (req, data) => {
  try {
    await LoginActivity.create({
      ...data,
      ipAddress: req.ip,
      userAgent: String(req.get('user-agent') || '').slice(0, 500)
    });

    const isPin = String(data.email || '').startsWith('pin-');
    const isSuccess = !!data.success;
    const action = isSuccess ? (isPin ? 'PIN_LOGIN_SUCCESS' : 'LOGIN_SUCCESS') : 'LOGIN_FAILED';

    await logAudit({
      action,
      resource: 'Auth',
      resourceId: data.userId ? String(data.userId) : '',
      userName: data.userName || data.email || 'User',
      userRole: data.role || 'guest',
      metadata: {
        email: data.email,
        success: isSuccess,
        failureReason: data.failureReason || null
      },
      req
    });
  } catch (error) {
    console.error('Login activity error:', error.message);
  }
};

const defaultUsers = [
  { name: 'Admin User', email: 'admin@restaurant.com', password: 'admin123', pin: '1111', role: 'admin' },
  { name: 'Manager User', email: 'manager@restaurant.com', password: 'manager123', pin: '2222', role: 'manager' },
  { name: 'Waiter User', email: 'waiter@restaurant.com', password: 'waiter123', pin: '3333', role: 'waiter' },
  { name: 'Chef User', email: 'chef@restaurant.com', password: 'chef123', pin: '4444', role: 'chef' },
  { name: 'Inventory Manager', email: 'inventory@restaurant.com', password: 'inventory123', pin: '5555', role: 'inventory_manager' },
  { name: 'Delivery User', email: 'delivery@restaurant.com', password: 'delivery123', pin: '6666', role: 'delivery' }
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
        pin: userData.pin,
        role: userData.role,
        isActive: true
      });
    } else if (!existing.pin) {
      existing.pin = userData.pin;
      await existing.save();
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

    const accessToken = createToken(user, '24h');
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

    // Two-Factor Authentication Check
    if (user.isTwoFactorEnabled && user.twoFactorSecret) {
      const tempToken = jwt.sign(
        { id: user._id, role: user.role, is2FATemp: true },
        process.env.JWT_SECRET_KEY,
        { expiresIn: '5m' }
      );
      return res.json({
        success: true,
        require2FA: true,
        message: 'Two-factor authentication code required',
        tempToken,
        user: { id: user._id, name: user.name, email: user.email, role: user.role }
      });
    }

    const accessToken = createToken(user, '24h');
    const refreshToken = await createRefreshToken(user);
    await recordLogin(req, { email: normalizedEmail, userId: user._id, userName: user.name, role: user.role, success: true });

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

router.post('/login-pin', async (req, res) => {
  try {
    await ensureDefaultUsers();
    const { pin, role } = req.body;
    const cleanPin = String(pin || '').trim();

    if (!cleanPin || cleanPin.length < 4) {
      return res.status(400).json({ success: false, message: 'Please enter a valid 4-digit PIN' });
    }

    const filter = { pin: cleanPin, isActive: true };
    if (role && validRoles.includes(String(role).toLowerCase())) {
      filter.role = String(role).toLowerCase();
    }

    let user = await User.findOne(filter);
    if (!user && role) {
      user = await User.findOne({ pin: cleanPin, isActive: true });
    }

    if (!user) {
      await recordLogin(req, { email: `pin-${cleanPin}`, success: false, failureReason: 'Invalid PIN' });
      return res.status(401).json({ success: false, message: 'Invalid PIN or account inactive' });
    }

    const accessToken = createToken(user, '24h');
    const refreshToken = await createRefreshToken(user);
    await recordLogin(req, { email: user.email, userId: user._id, userName: user.name, role: user.role, success: true });

    res.json({
      success: true,
      message: `${user.role} PIN login successful`,
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

    const accessToken = createToken(user, '24h');
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

    await logAudit({
      action: 'LOGOUT',
      resource: 'Auth',
      resourceId: String(req.user._id),
      user: req.user,
      metadata: { role: req.user.role },
      req
    });

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

    try {
      await sendPasswordResetEmail(user.email, resetToken, user.name);
    } catch (mailErr) {
      console.warn('Mail send error:', mailErr.message);
    }

    res.json({
      success: true,
      message: 'Password reset link and token sent to your email successfully.',
      expiresInMinutes: 15,
      ...(process.env.NODE_ENV !== 'production' ? { resetToken } : {})
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
    const user = await User.create({ name: String(name).trim(), email: normalizedEmail, password: await bcrypt.hash(password, 10), pin: req.body.pin ? String(req.body.pin).trim() : undefined, role: selectedRole, branchId: req.body.branchId || null, isActive: true });
    res.status(201).json({ success: true, data: { id: user._id, name: user.name, email: user.email, role: user.role, pin: user.pin, isActive: user.isActive } });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.patch('/users/:id', authenticate, async (req, res) => {
  try {
    if (!['admin', 'manager'].includes(req.user.role)) return res.status(403).json({ success: false, message: 'Only admin or manager can update users' });
    const update = {};
    if (req.body.name !== undefined) update.name = String(req.body.name).trim();
    if (req.body.pin !== undefined) update.pin = req.body.pin ? String(req.body.pin).trim() : null;
    if (req.body.password) update.password = await bcrypt.hash(req.body.password, 10);
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

// 12. Send OTP for Mobile Login / Verification
router.post('/send-otp', async (req, res) => {
  try {
    const phone = String(req.body.phone || '').trim();
    const cleanPhone = phone.replace(/\D/g, '').slice(-10);

    if (cleanPhone.length !== 10) {
      return res.status(400).json({ success: false, message: 'Please enter a valid 10-digit mobile number' });
    }

    const otp = generateOTP(cleanPhone);
    const result = await sendOtpSms(cleanPhone, otp);

    res.json({
      success: true,
      message: `OTP sent successfully to +91 ${cleanPhone}`,
      mode: result.mode,
      ...(result.otp ? { otp: result.otp } : {})
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// 13. Verify OTP and authenticate
router.post('/verify-otp', async (req, res) => {
  try {
    const phone = String(req.body.phone || '').trim();
    const otp = String(req.body.otp || '').trim();
    const cleanPhone = phone.replace(/\D/g, '').slice(-10);

    if (!cleanPhone || !otp) {
      return res.status(400).json({ success: false, message: 'Phone number and OTP are required' });
    }

    const isValid = verifyOTP(cleanPhone, otp);
    if (!isValid) {
      return res.status(400).json({ success: false, message: 'Invalid or expired OTP. Please try again.' });
    }

    // Check if phone matches any staff or customer
    let user = await User.findOne({ $or: [{ phone: cleanPhone }, { phone: `+91${cleanPhone}` }] });
    if (!user) {
      // Find default guest or staff
      user = await User.findOne({ role: 'waiter' });
    }

    const token = createToken(user);
    const refreshToken = await createRefreshToken(user);

    res.json({
      success: true,
      message: 'OTP verified successfully!',
      token,
      refreshToken: refreshToken.raw,
      user: {
        id: user._id,
        name: user.name,
        role: user.role,
        email: user.email
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// 14. 2FA: Generate QR Code & Secret for Authenticator App
router.post('/2fa/generate', authenticate, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    const { base32, otpauthUrl, qrCodeDataUrl } = await generateTwoFactorSecret(user.email);
    user.twoFactorTempSecret = base32;
    await user.save();

    res.json({
      success: true,
      qrCodeDataUrl,
      secret: base32,
      otpauthUrl
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// 15. 2FA: Enable 2FA after verifying first 6-digit code
router.post('/2fa/enable', authenticate, async (req, res) => {
  try {
    const { code } = req.body;
    const user = await User.findById(req.user._id);
    if (!user || !user.twoFactorTempSecret) {
      return res.status(400).json({ success: false, message: 'Please generate a 2FA secret first' });
    }

    const isValid = verifyTwoFactorToken(user.twoFactorTempSecret, code);
    if (!isValid) {
      return res.status(400).json({ success: false, message: 'Invalid 6-digit verification code. Please check your Authenticator app.' });
    }

    const recoveryCodes = generateRecoveryCodes(8);
    user.twoFactorSecret = user.twoFactorTempSecret;
    user.twoFactorTempSecret = null;
    user.isTwoFactorEnabled = true;
    user.twoFactorRecoveryCodes = recoveryCodes;
    await user.save();

    res.json({
      success: true,
      message: 'Two-factor authentication enabled successfully!',
      recoveryCodes
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// 16. 2FA: Disable 2FA
router.post('/2fa/disable', authenticate, async (req, res) => {
  try {
    const { password, code } = req.body;
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    const isMatch = await bcrypt.compare(password || '', user.password);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Incorrect password' });
    }

    if (code) {
      const isValid = verifyTwoFactorToken(user.twoFactorSecret, code);
      if (!isValid && !user.twoFactorRecoveryCodes.includes(code)) {
        return res.status(400).json({ success: false, message: 'Invalid 2FA code' });
      }
    }

    user.isTwoFactorEnabled = false;
    user.twoFactorSecret = null;
    user.twoFactorRecoveryCodes = [];
    await user.save();

    res.json({ success: true, message: 'Two-factor authentication disabled successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// 17. 2FA: Verify code during login
router.post('/2fa/verify-login', async (req, res) => {
  try {
    const { tempToken, code } = req.body;
    if (!tempToken || !code) {
      return res.status(400).json({ success: false, message: 'Token and 6-digit code are required' });
    }

    let payload;
    try {
      payload = jwt.verify(tempToken, process.env.JWT_SECRET_KEY);
    } catch (err) {
      return res.status(401).json({ success: false, message: 'Login session expired. Please log in again.' });
    }

    if (!payload.is2FATemp) {
      return res.status(400).json({ success: false, message: 'Invalid authentication token' });
    }

    const user = await User.findById(payload.id);
    if (!user || !user.isActive) {
      return res.status(401).json({ success: false, message: 'User not found or inactive' });
    }

    let isValid = verifyTwoFactorToken(user.twoFactorSecret, code);
    let usedRecovery = false;

    if (!isValid && Array.isArray(user.twoFactorRecoveryCodes)) {
      const formattedCode = String(code).trim().toUpperCase();
      const codeIndex = user.twoFactorRecoveryCodes.indexOf(formattedCode);
      if (codeIndex !== -1) {
        isValid = true;
        usedRecovery = true;
        user.twoFactorRecoveryCodes.splice(codeIndex, 1);
        await user.save();
      }
    }

    if (!isValid) {
      return res.status(400).json({ success: false, message: 'Invalid 2FA verification code' });
    }

    const accessToken = createToken(user, '24h');
    const refreshToken = await createRefreshToken(user);

    res.json({
      success: true,
      message: '2FA verification successful',
      token: accessToken,
      refreshToken: refreshToken.raw,
      usedRecoveryCode: usedRecovery,
      user: { id: user._id, name: user.name, email: user.email, role: user.role, branchId: user.branchId || null }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;