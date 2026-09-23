const mongoose = require('mongoose');

const itemSchema = new mongoose.Schema({
  branchIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Branch' }],
  isCentral: { type: Boolean, default: true },
  name: { type: String, required: true },
  code: { type: String, default: '' }, // short code for fast punching (e.g. PBM, ROTI)
  category: { type: String, default: 'Main Course' },
  foodType: { type: String, enum: ['veg', 'non-veg', 'egg'], default: 'veg' },
  price: { type: Number, required: true },
  hsnSac: { type: String, default: '', trim: true, maxlength: 20 },
  taxRate: { type: Number, default: 5, min: 0, max: 100 },
  taxCategory: { type: String, enum: ['taxable', 'exempt', 'zero-rated'], default: 'taxable' },
  isAvailable: { type: Boolean, default: true },
  kitchenStation: { type: String, enum: ['kitchen', 'bar', 'tandoor', 'dessert', 'pantry'], default: 'kitchen' },
  image: { type: String, default: 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=300' },
  floor: { type: String, default: 'Floor 1' },
  halfPrice: { type: Number, default: null },
  description: { type: String, default: '' },
  barcode: { type: String, default: '', trim: true, index: true },
  isCombo: { type: Boolean, default: false },
  comboItems: { type: [mongoose.Schema.Types.Mixed], default: [] },
  seasonalTag: { type: String, default: '', trim: true },
  seasonalFrom: { type: Date, default: null },
  seasonalTill: { type: Date, default: null },
  happyHour: {
    enabled: { type: Boolean, default: false },
    start: { type: String, default: '' },
    end: { type: String, default: '' },
    price: { type: Number, default: null }
  },
  // Backward-compatible: existing records may contain string names, while new
  // records can store { name, price } for billable modifiers.
  addons: { type: [mongoose.Schema.Types.Mixed], default: [] }
}, { timestamps: true });

module.exports = mongoose.model('Item', itemSchema);