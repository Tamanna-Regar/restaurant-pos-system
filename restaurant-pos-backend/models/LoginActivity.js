const mongoose = require('mongoose');

const loginActivitySchema = new mongoose.Schema({
  email: { type: String, default: '' },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  role: { type: String, default: '' },
  success: { type: Boolean, required: true },
  failureReason: { type: String, default: '' },
  ipAddress: { type: String, default: '' },
  userAgent: { type: String, default: '' }
}, { timestamps: true });

loginActivitySchema.index({ createdAt: -1 });
loginActivitySchema.index({ email: 1, createdAt: -1 });
module.exports = mongoose.model('LoginActivity', loginActivitySchema);
