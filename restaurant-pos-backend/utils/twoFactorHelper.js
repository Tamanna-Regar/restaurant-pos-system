const speakeasy = require('speakeasy');
const QRCode = require('qrcode');
const crypto = require('crypto');

/**
 * Generates TOTP secret and QR code data URL for Google/Microsoft Authenticator
 */
const generateTwoFactorSecret = async (email, issuer = 'Tamanna Restaurant POS') => {
  const secret = speakeasy.generateSecret({
    name: `${issuer} (${email})`,
    issuer,
    length: 20
  });

  const otpauthUrl = secret.otpauth_url;
  const qrCodeDataUrl = await QRCode.toDataURL(otpauthUrl);

  return {
    ascii: secret.ascii,
    base32: secret.base32,
    otpauthUrl,
    qrCodeDataUrl
  };
};

/**
 * Verifies a 6-digit TOTP token against a user's base32 secret
 */
const verifyTwoFactorToken = (base32Secret, token) => {
  if (!base32Secret || !token) return false;
  return speakeasy.totp.verify({
    secret: base32Secret,
    encoding: 'base32',
    token: String(token).trim(),
    window: 1 // Allow 1 step (30s) drift before and after
  });
};

/**
 * Generates an array of single-use recovery codes
 */
const generateRecoveryCodes = (count = 8) => {
  const codes = [];
  for (let i = 0; i < count; i++) {
    const code = crypto.randomBytes(4).toString('hex').toUpperCase();
    codes.push(`${code.slice(0, 4)}-${code.slice(4)}`);
  }
  return codes;
};

module.exports = {
  generateTwoFactorSecret,
  verifyTwoFactorToken,
  generateRecoveryCodes
};

