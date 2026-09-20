const mongoose = require('mongoose');

const customerSchema = new mongoose.Schema({
  phone: { type: String, required: true, unique: true },
  name: { type: String, default: 'Guest Customer' },
  email: { type: String, default: '' },
  address: { type: String, default: '' },
  gstin: { type: String, default: '', uppercase: true, trim: true, match: [/^$|^[0-9A-Z]{15}$/, 'Invalid GSTIN'] },
  stateCode: { type: String, default: '', trim: true, maxlength: 2 },
  dateOfBirth: { type: Date, default: null },
  membershipTier: { type: String, enum: ['Regular', 'Silver', 'Gold', 'Platinum'], default: 'Regular' },
  totalOrders: { type: Number, default: 0 },
  totalSpent: { type: Number, default: 0 },
  loyaltyPoints: { type: Number, default: 0 },
  redeemedPoints: { type: Number, default: 0 },
  lastBirthdayOfferYear: { type: Number, default: null }
}, 
{ timestamps: true });

module.exports = mongoose.model('Customer', customerSchema);