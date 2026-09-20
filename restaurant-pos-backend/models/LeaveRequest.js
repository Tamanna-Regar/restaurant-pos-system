const mongoose = require('mongoose');

const leaveRequestSchema = new mongoose.Schema(
  {
    staffId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Staff',
      required: true
    },

    fromDate: {
      type: String,
      required: true
    },

    toDate: {
      type: String,
      required: true
    },

    days: {
      type: Number,
      required: true,
      min: 0.5
    },

    reason: {
      type: String,
      default: ''
    },

    status: {
      type: String,
      enum: ['Pending', 'Approved', 'Rejected'],
      default: 'Pending'
    },

    requestedBy: {
      type: String,
      default: 'Staff'
    },

    reviewedBy: {
      type: String,
      default: ''
    },

    reviewedAt: {
      type: Date,
      default: null
    }
  },
  {
    timestamps: true
  }
);

module.exports = mongoose.model('LeaveRequest', leaveRequestSchema);