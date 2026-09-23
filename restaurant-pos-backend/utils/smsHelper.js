const axios = require('axios');

// In-memory OTP storage with 5 minute expiration
const otpStore = new Map();

/**
 * Generates and stores a 6-digit numeric OTP
 */
const generateOTP = (phone) => {
  const cleanPhone = phone.replace(/\D/g, '').slice(-10);
  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  otpStore.set(cleanPhone, {
    otp,
    expiresAt: Date.now() + 5 * 60 * 1000 // 5 minutes
  });
  return otp;
};

/**
 * Verifies a 6-digit numeric OTP
 */
const verifyOTP = (phone, candidateOtp) => {
  const cleanPhone = phone.replace(/\D/g, '').slice(-10);
  const entry = otpStore.get(cleanPhone);
  if (!entry) return false;

  if (Date.now() > entry.expiresAt) {
    otpStore.delete(cleanPhone);
    return false;
  }

  const isValid = entry.otp === String(candidateOtp).trim();
  if (isValid) {
    otpStore.delete(cleanPhone);
  }
  return isValid;
};

/**
 * Sends OTP via SMS Gateway (Fast2SMS / MSG91 / Twilio) or Simulator
 */
const sendOtpSms = async (phone, otp) => {
  const cleanPhone = phone.replace(/\D/g, '').slice(-10);
  const message = `Your Tamanna Restaurant login OTP is ${otp}. Valid for 5 minutes. Do not share with anyone.`;

  const FAST2SMS_API_KEY = process.env.FAST2SMS_API_KEY;

  if (FAST2SMS_API_KEY) {
    try {
      await axios.post(
        'https://www.fast2sms.com/dev/bulkV2',
        {
          route: 'otp',
          variables_values: otp,
          numbers: cleanPhone
        },
        {
          headers: {
            authorization: FAST2SMS_API_KEY
          }
        }
      );
      console.log(`[Fast2SMS] OTP sent successfully to +91${cleanPhone}`);
      return { success: true, mode: 'live' };
    } catch (apiErr) {
      console.error('Fast2SMS Gateway Error:', apiErr.response?.data || apiErr.message);
    }
  }

  // Graceful simulation fallback
  console.log(`📱 [SMS Gateway Simulation] To: +91${cleanPhone} | Message: "${message}"`);
  return { success: true, mode: 'simulated', otp: process.env.NODE_ENV !== 'production' ? otp : undefined };
};

module.exports = {
  generateOTP,
  verifyOTP,
  sendOtpSms
};

