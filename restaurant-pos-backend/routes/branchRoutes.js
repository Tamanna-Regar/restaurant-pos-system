const express = require('express');
const Branch = require('../models/Branch');
const BranchInventory = require('../models/BranchInventory');
const Ingredient = require('../models/Ingredient');
const StockTransfer = require('../models/StockTransfer');
const Payment = require('../models/Payment');
const User = require('../models/user');
const Order = require('../models/Order');

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const branches = await Branch.find({}).sort({ name: 1 });
    res.json({ success: true, data: branches });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const branch = await Branch.create({
      name: String(req.body.name || '').trim(),
      code: String(req.body.code || '').trim().toUpperCase(),
      address: String(req.body.address || '').trim(),
      phone: String(req.body.phone || '').trim(),
      gstin: String(req.body.gstin || '').trim().toUpperCase()
    });
    res.status(201).json({ success: true, data: branch });
  } catch (error) {
    res.status(error.code === 11000 ? 409 : 400).json({ success: false, message: error.code === 11000 ? 'Branch name or code already exists.' : error.message });
  }
});

router.patch('/:id', async (req, res) => {
  try {
    const branch = await Branch.findByIdAndUpdate(req.params.id, {
      $set: {
        name: String(req.body.name || '').trim(),
        code: String(req.body.code || '').trim().toUpperCase(),
        address: String(req.body.address || '').trim(),
        phone: String(req.body.phone || '').trim(),
        gstin: String(req.body.gstin || '').trim().toUpperCase(),
        ...(typeof req.body.isActive === 'boolean' ? { isActive: req.body.isActive } : {})
      }
    }, { new: true, runValidators: true });
    if (!branch) return res.status(404).json({ success: false, message: 'Branch not found.' });
    res.json({ success: true, data: branch });
  } catch (error) {
    res.status(error.code === 11000 ? 409 : 400).json({ success: false, message: error.message });
  }
});

router.get('/:id/inventory', async (req, res) => {
  try {
    const rows = await BranchInventory.find({ branchId: req.params.id }).populate('ingredientId', 'name unit costPerUnit').sort({ updatedAt: -1 });
    res.json({ success: true, data: rows });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/:id/inventory', async (req, res) => {
  try {
    const ingredient = await Ingredient.findById(req.body.ingredientId);
    const quantity = Number(req.body.quantity);
    if (!ingredient || !Number.isFinite(quantity) || quantity < 0) return res.status(400).json({ success: false, message: 'Valid ingredient and quantity are required.' });
    const row = await BranchInventory.findOneAndUpdate(
      { branchId: req.params.id, ingredientId: ingredient._id },
      { $set: { quantity, minStockAlert: Number(req.body.minStockAlert || ingredient.minStockAlert || 0), updatedBy: req.user?.name || '' } },
      { new: true, upsert: true, runValidators: true }
    );
    res.json({ success: true, data: row });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.post('/transfers', async (req, res) => {
  try {
    const ingredient = await Ingredient.findById(req.body.ingredientId);
    const quantity = Number(req.body.quantity);
    const fromBranchId = String(req.body.fromBranchId || '');
    const toBranchId = String(req.body.toBranchId || '');
    if (!ingredient || !Number.isFinite(quantity) || quantity <= 0 || !fromBranchId || !toBranchId || fromBranchId === toBranchId) {
      return res.status(400).json({ success: false, message: 'Valid ingredient, quantity and different branches are required.' });
    }
    const [fromBranch, toBranch] = await Promise.all([Branch.findById(fromBranchId), Branch.findById(toBranchId)]);
    if (!fromBranch || !toBranch || !fromBranch.isActive || !toBranch.isActive) return res.status(400).json({ success: false, message: 'Both branches must be active.' });
    const source = await BranchInventory.findOne({ branchId: fromBranchId, ingredientId: ingredient._id });
    if (!source || Number(source.quantity) < quantity) return res.status(400).json({ success: false, message: `Only ${Number(source?.quantity || 0)} ${ingredient.unit} available at ${fromBranch.name}.` });
    source.quantity = Number((source.quantity - quantity).toFixed(4));
    source.updatedBy = req.user?.name || '';
    await source.save();
    const destination = await BranchInventory.findOneAndUpdate(
      { branchId: toBranchId, ingredientId: ingredient._id },
      { $inc: { quantity }, $set: { minStockAlert: ingredient.minStockAlert, updatedBy: req.user?.name || '' } },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );
    const transfer = await StockTransfer.create({
      ingredientId: ingredient._id,
      quantity,
      unit: ingredient.unit,
      fromLocation: fromBranch.name,
      toLocation: toBranch.name,
      note: String(req.body.note || '').trim(),
      transferredBy: req.user?.name || 'Inventory Staff',
      fromBranchId,
      toBranchId
    });
    res.status(201).json({ success: true, data: { transfer, destination } });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.get('/comparison/summary', async (req, res) => {
  try {
    const [branches, sales, orders, users, lowStock] = await Promise.all([
      Branch.find({}).sort({ name: 1 }).lean(),
      Payment.aggregate([{ $match: { status: 'paid', branchId: { $ne: null } } }, { $group: { _id: '$branchId', sales: { $sum: '$grandTotal' }, bills: { $sum: 1 } } }]),
      Order.aggregate([{ $match: { branchId: { $ne: null } } }, { $group: { _id: '$branchId', orders: { $sum: 1 } } }]),
      User.aggregate([{ $match: { branchId: { $ne: null } } }, { $group: { _id: '$branchId', staff: { $sum: 1 } } }]),
      BranchInventory.aggregate([{ $match: { $expr: { $lte: ['$quantity', '$minStockAlert'] } } }, { $group: { _id: '$branchId', lowStock: { $sum: 1 } } }])
    ]);
    const byId = (rows) => Object.fromEntries(rows.map((row) => [String(row._id), row]));
    const salesById = byId(sales); const ordersById = byId(orders); const usersById = byId(users); const lowById = byId(lowStock);
    res.json({ success: true, data: branches.map((branch) => ({
      ...branch,
      sales: Number(salesById[String(branch._id)]?.sales || 0),
      bills: Number(salesById[String(branch._id)]?.bills || 0),
      orders: Number(ordersById[String(branch._id)]?.orders || 0),
      staff: Number(usersById[String(branch._id)]?.staff || 0),
      lowStock: Number(lowById[String(branch._id)]?.lowStock || 0)
    })) });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
