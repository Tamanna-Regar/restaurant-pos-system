const mongoose = require('mongoose');

const restaurantSettingsSchema = new mongoose.Schema({
  name: { type: String, default: 'Tamanna Restaurant', trim: true },
  address: { type: String, default: '' },
  phone: { type: String, default: '' },
  gstin: { type: String, default: '', uppercase: true, trim: true },
  upiId: { type: String, default: '', trim: true },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }
}, { timestamps: true });

module.exports = mongoose.model('RestaurantSettings', restaurantSettingsSchema);
