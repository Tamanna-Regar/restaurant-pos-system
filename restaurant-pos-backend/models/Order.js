const mongoose = require('mongoose');

const orderSchema = new mongoose.Schema({
  branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', default: null, index: true },
  tableId: { type: mongoose.Schema.Types.ObjectId, ref: 'Table', required: false, default: null },
  orderType: { type: String, enum: ['Dine-In', 'Takeaway', 'Delivery'], default: 'Dine-In' },
  deliveryAddress: { type: String, default: '' },
  customerName: { type: String, default: 'Walk-in Customer' },
  customerPhone: { type: String, default: '' },
  customerGstin: { type: String, default: '', uppercase: true, trim: true, match: [/^$|^[0-9A-Z]{15}$/, 'Invalid GSTIN'] },
  placeOfSupply: { type: String, default: '', trim: true, maxlength: 2 },
  isInterState: { type: Boolean, default: false },
  waiterName: { type: String, default: 'Captain' },

  // ---- NEW: Order Priority / VIP Tagging for KDS ----
  priority: { type: String, enum: ['Normal', 'VIP', 'Urgent'], default: 'Normal' },

  // Celebration / Event details for Floor 2
  celebrationOccasion: { type: String, default: '' }, // 'Birthday Party', 'Anniversary', 'Get-Together', etc.
  celebrantName: { type: String, default: '' }, // e.g. "Birthday Boy/Girl: Aarav"

  kotNumber: { type: Number, default: 1 },

  // Petpooja Multi-KOT support: Each punch creates a new KOT record for kitchen
  kots: [{
    kotNumber: Number,
    punchedAt: { type: Date, default: Date.now },
    status: { type: String, enum: ['placed', 'preparing', 'ready', 'served', 'cancelled'], default: 'placed' },
    items: [{
      itemId: { type: mongoose.Schema.Types.ObjectId, ref: 'Item' },
      name: String,
      foodType: { type: String, default: 'veg' },
      portion: { type: String, default: 'Full' },
      price: Number,
      basePrice: Number,
      addonTotal: { type: Number, default: 0 },
      addons: { type: [mongoose.Schema.Types.Mixed], default: [] },
      hsnSac: { type: String, default: '' },
      taxRate: { type: Number, default: 5, min: 0, max: 100 },
      taxCategory: { type: String, default: 'taxable' },
      quantity: Number,
      notes: { type: String, default: '' },
      // ---- NEW: Item-Level Status Tracking ----
      itemStatus: { type: String, enum: ['placed', 'preparing', 'ready', 'served', 'cancelled'], default: 'placed' }
    }]
  }],

  // Total aggregated items for final billing
  items: [{
    itemId: { type: mongoose.Schema.Types.ObjectId, ref: 'Item' },
    name: String,
    foodType: { type: String, default: 'veg' },
    portion: { type: String, default: 'Full' },
    price: Number,
    basePrice: Number,
    addonTotal: { type: Number, default: 0 },
    addons: { type: [mongoose.Schema.Types.Mixed], default: [] },
    hsnSac: { type: String, default: '' },
    taxRate: { type: Number, default: 5, min: 0, max: 100 },
    taxCategory: { type: String, default: 'taxable' },
    quantity: Number,
    notes: { type: String, default: '' },
    kotNumber: { type: Number, default: 1 }
  }],

  // ---- Status History Timeline (Petpooja style) ----
  statusHistory: [{
    status: { type: String, enum: ['placed', 'preparing', 'ready', 'billed', 'completed', 'cancelled'] },
    timestamp: { type: Date, default: Date.now },
    updatedBy: { type: String, default: 'Staff' }
  }],

  subTotal: { type: Number, default: 0 },
  discount: { type: Number, default: 0 }, // % discount
  discountAmt: { type: Number, default: 0 },
  customDiscountAmt: { type: Number, default: 0 },
  serviceChargeRate: { type: Number, default: 0 },
  serviceChargeAmt: { type: Number, default: 0 },
  taxableAmount: { type: Number, default: 0 },
  gstRate: { type: Number, default: 5 },
  tax: { type: Number, default: 0 },
  cgst: { type: Number, default: 0 },
  sgst: { type: Number, default: 0 },
  roundOffAmount: { type: Number, default: 0 },
  compDiscountAmt: { type: Number, default: 0 },
  grandTotal: { type: Number, default: 0 },
  // Invoice numbers are generated only when an order is settled. Keeping this
  // field absent for pending KOTs allows multiple unpaid orders with sparse
  // uniqueness.
  invoiceNumber: { type: String, default: undefined, unique: true, sparse: true },

  paymentMode: { 
    type: String, 
    enum: ['Cash', 'PhonePe', 'QR', 'Online', 'UPI', 'Card', 'Credit/Debit Card', 'QR Code', 'UPI/Online', 'Split'], 
    default: 'Cash' 
  },
  paymentBreakdown: { type: mongoose.Schema.Types.Mixed, default: null },
  paymentReference: { type: String, default: '', trim: true, maxlength: 100 },
  paymentProvider: { type: String, default: 'manual', trim: true, maxlength: 40 },
  cashTendered: { type: Number, default: 0 },
  changeReturn: { type: Number, default: 0 },
  paymentStatus: { type: String, enum: ['pending', 'paid'], default: 'pending' },
  orderStatus: { type: String, enum: ['placed', 'preparing', 'ready', 'billed', 'completed', 'cancelled'], default: 'placed' },
  settledAt: { type: Date, default: null },
  cancellationReason: { type: String, default: '', maxlength: 250 },
  cancelledBy: { type: String, default: '' },
  cancelledAt: { type: Date, default: null }
}, { timestamps: true });

module.exports = mongoose.model('Order', orderSchema);