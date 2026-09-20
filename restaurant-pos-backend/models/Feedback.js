const mongoose = require('mongoose');

const feedbackSchema = new mongoose.Schema({
  orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true },
  rating: { type: Number, required: true, min: 1, max: 5 },
  comment: { type: String, default: '', maxlength: 1000 },
  customerName: { type: String, default: '' },
  customerPhone: { type: String, default: '' }
}, { timestamps: true });

feedbackSchema.index({ orderId: 1 }, { unique: true });

module.exports = mongoose.model('Feedback', feedbackSchema);
