const mongoose = require('mongoose');

const supplierSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true, trim: true },
  contact: { type: String, required: true, trim: true },
  category: { type: String, default: 'Vegetables', trim: true },
  gstNo: { type: String, default: '', trim: true },
  leadTime: { type: String, default: '2 days', trim: true },
  active: { type: Boolean, default: true }
}, { timestamps: true });

module.exports = mongoose.model('Supplier', supplierSchema);
