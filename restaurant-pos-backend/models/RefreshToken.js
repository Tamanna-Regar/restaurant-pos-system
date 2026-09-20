const mongoose = require('mongoose');

const refreshTokenSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  tokenHash: { type: String, required: true },
  expiresAt: { type: Date, required: true },
  revokedAt: { type: Date, default: null },
  createdBy: { type: String, default: 'system' }
}, { timestamps: true });

refreshTokenSchema.index({ userId: 1, tokenHash: 1 }, { unique: true });
refreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('RefreshToken', refreshTokenSchema);
