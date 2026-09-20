const mongoose = require('mongoose');

const tableSchema = new mongoose.Schema(
  {
    tableNo: {
      type: Number,
      required: true
    },

    tableNumber: {
      type: Number
    },

    capacity: {
      type: Number,
      required: true,
      default: 4
    },

    floor: {
      type: String,
      required: true,
      default: 'Floor 1'
    },

    type: {
      type: String,
      default: 'Dining'
    },

    status: {
      type: String,
      enum: ['available', 'occupied', 'billed', 'reserved'],
      default: 'available'
    },

    currentOrderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Order',
      default: null
    }
  },
  {
    timestamps: true
  }
);

// Same table number can exist on different floors,
// but cannot be duplicated on the same floor.
tableSchema.index(
  { floor: 1, tableNo: 1 },
  { unique: true }
);

module.exports = mongoose.model('Table', tableSchema);