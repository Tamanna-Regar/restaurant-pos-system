const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  pin: { type: String, unique: true, sparse: true },
  role: {
    type: String,
    enum: ['admin', 'manager', 'cashier', 'waiter', 'chef', 'inventory_manager', 'delivery'],
    default: 'waiter'
  },
  branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', default: null, index: true },
  isActive: { type: Boolean, default: true },
  permissions: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  passwordResetToken: { type: String, default: null },
  passwordResetExpires: { type: Date, default: null }
}, { timestamps: true });

module.exports = mongoose.model('User', userSchema);