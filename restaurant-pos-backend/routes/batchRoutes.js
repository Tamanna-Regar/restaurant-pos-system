const express = require('express');
const InventoryBatch = require('../models/InventoryBatch');
const BatchDisposal = require('../models/BatchDisposal');
const Ingredient = require('../models/Ingredient');
const InventoryLedger = require('../models/InventoryLedger');

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const filter = {};
    if (req.query.status) filter.status = req.query.status;
    if (req.query.ingredientId) filter.ingredientId = req.query.ingredientId;
    const batches = await InventoryBatch.find(filter).populate('ingredientId', 'name unit').sort({ expiryDate: 1, receivedAt: -1 }).limit(500);
    const today = new Date();
    const data = batches.map((batch) => {
      const value = batch.toObject();
      const isExpired = value.expiryDate && new Date(value.expiryDate) < today && value.quantityRemaining > 0;
      if (isExpired && value.status !== 'expired') value.status = 'expired';
      return value;
    });
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.get('/expiring', async (req, res) => {
  try {
    const days = Math.max(1, Math.min(365, Number(req.query.days || 30)));
    const until = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
    const batches = await InventoryBatch.find({ quantityRemaining: { $gt: 0 }, expiryDate: { $ne: null, $lte: until } }).populate('ingredientId', 'name unit').sort({ expiryDate: 1 });
    res.json({ success: true, data: batches });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/mark-expired', async (req, res) => {
  try {
    const result = await InventoryBatch.updateMany(
      { quantityRemaining: { $gt: 0 }, expiryDate: { $ne: null, $lt: new Date() }, status: { $ne: 'disposed' } },
      { $set: { status: 'expired' } }
    );
    res.json({ success: true, marked: result.modifiedCount });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/:id/disposal-request', async (req, res) => {
  try {
    const batch = await InventoryBatch.findById(req.params.id);
    if (!batch) return res.status(404).json({ success: false, message: 'Batch not found' });
    if (batch.quantityRemaining <= 0) return res.status(400).json({ success: false, message: 'Batch has no remaining stock' });
    const existing = await BatchDisposal.findOne({ batchId: batch._id, status: 'pending' });
    if (existing) return res.status(409).json({ success: false, message: 'A disposal request is already pending' });
    const disposal = await BatchDisposal.create({ batchId: batch._id, ingredientId: batch.ingredientId, batchNo: batch.batchNo, quantity: batch.quantityRemaining, reason: String(req.body.reason || 'Expired stock').trim(), requestedBy: req.user?.name || 'Inventory Staff' });
    res.status(201).json({ success: true, data: disposal });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.get('/disposals', async (req, res) => {
  try {
    const records = await BatchDisposal.find().sort({ createdAt: -1 }).limit(500);
    res.json({ success: true, data: records });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/disposals/:id/:action', async (req, res) => {
  try {
    if (!['admin', 'manager'].includes(req.user?.role)) return res.status(403).json({ success: false, message: 'Only admin or manager can review disposal' });
    if (!['approve', 'reject'].includes(req.params.action)) return res.status(400).json({ success: false, message: 'Invalid disposal action' });
    const disposal = await BatchDisposal.findById(req.params.id);
    if (!disposal) return res.status(404).json({ success: false, message: 'Disposal request not found' });
    if (disposal.status !== 'pending') return res.status(409).json({ success: false, message: 'Disposal request is already reviewed' });
    if (req.params.action === 'reject') {
      disposal.status = 'rejected';
    } else {
      const batch = await InventoryBatch.findById(disposal.batchId);
      const ingredient = await Ingredient.findById(disposal.ingredientId);
      if (!batch || !ingredient) return res.status(404).json({ success: false, message: 'Batch or ingredient not found' });
      const quantity = Math.min(disposal.quantity, batch.quantityRemaining, ingredient.currentStock);
      if (quantity <= 0) return res.status(400).json({ success: false, message: 'No stock remains to dispose' });
      batch.quantityRemaining -= quantity;
      batch.status = 'disposed';
      batch.disposedAt = new Date();
      batch.disposedBy = req.user.name;
      ingredient.currentStock -= quantity;
      await batch.save();
      await ingredient.save();
      await InventoryLedger.create({ ingredientId: ingredient._id, batchId: batch._id, type: 'waste', quantity: -quantity, balanceAfter: ingredient.currentStock, referenceType: 'BatchDisposal', referenceId: String(disposal._id), note: disposal.reason, createdBy: req.user.name });
      disposal.quantity = quantity;
      disposal.status = 'approved';
    }
    disposal.reviewedBy = req.user.name;
    disposal.reviewedAt = new Date();
    await disposal.save();
    res.json({ success: true, data: disposal });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

module.exports = router;
