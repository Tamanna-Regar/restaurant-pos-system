const mongoose = require('mongoose');

const branchSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 100 },
  code: { type: String, required: true, trim: true, uppercase: true, maxlength: 20 },
  address: { type: String, default: '', trim: true },
  phone: { type: String, default: '', trim: true },
  gstin: { type: String, default: '', trim: true, uppercase: true },
  isActive: { type: Boolean, default: true }
}, { timestamps: true });

branchSchema.index({ code: 1 }, { unique: true });
branchSchema.index({ name: 1 }, { unique: true });

module.exports = mongoose.model('Branch', branchSchema);
