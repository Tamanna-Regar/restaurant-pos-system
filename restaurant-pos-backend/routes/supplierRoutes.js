const express = require('express');
const PurchaseOrder = require('../models/PurchaseOrder');
const SupplierPayment = require('../models/SupplierPayment');
const PurchaseReturn = require('../models/PurchaseReturn');
const Supplier = require('../models/Supplier');

const router = express.Router();

const normalizeName = (value) => String(value || '').trim();

router.get('/', async (req, res) => {
  try {
    const suppliers = await Supplier.find({ active: true }).sort({ name: 1 });
    res.json({ success: true, data: suppliers });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const name = normalizeName(req.body.name);
    const contact = normalizeName(req.body.contact);
    if (!name || !contact) return res.status(400).json({ success: false, message: 'Supplier name and contact are required' });
    const supplier = await Supplier.create({
      name,
      contact,
      category: normalizeName(req.body.category) || 'Vegetables',
      gstNo: normalizeName(req.body.gstNo),
      leadTime: normalizeName(req.body.leadTime) || '2 days'
    });
    res.status(201).json({ success: true, data: supplier });
  } catch (error) {
    if (error.code === 11000) return res.status(409).json({ success: false, message: 'A supplier with this name already exists' });
    res.status(400).json({ success: false, message: error.message });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const supplier = await Supplier.findById(req.params.id);
    if (!supplier) return res.status(404).json({ success: false, message: 'Supplier not found' });
    const oldName = supplier.name;
    const name = normalizeName(req.body.name);
    const contact = normalizeName(req.body.contact);
    if (!name || !contact) return res.status(400).json({ success: false, message: 'Supplier name and contact are required' });
    supplier.name = name;
    supplier.contact = contact;
    supplier.category = normalizeName(req.body.category) || supplier.category;
    supplier.gstNo = normalizeName(req.body.gstNo);
    supplier.leadTime = normalizeName(req.body.leadTime) || supplier.leadTime;
    await supplier.save();
    if (oldName !== name) {
      await Promise.all([
        PurchaseOrder.updateMany({ supplierName: oldName }, { $set: { supplierName: name } }),
        SupplierPayment.updateMany({ supplierName: oldName }, { $set: { supplierName: name } }),
        PurchaseReturn.updateMany({ supplierName: oldName }, { $set: { supplierName: name } })
      ]);
    }
    res.json({ success: true, data: supplier });
  } catch (error) {
    if (error.code === 11000) return res.status(409).json({ success: false, message: 'A supplier with this name already exists' });
    res.status(400).json({ success: false, message: error.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const supplier = await Supplier.findByIdAndUpdate(req.params.id, { active: false }, { new: true });
    if (!supplier) return res.status(404).json({ success: false, message: 'Supplier not found' });
    res.json({ success: true, message: 'Supplier deactivated successfully' });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.get('/summary', async (req, res) => {
  try {
    const [purchases, payments, returns] = await Promise.all([
      PurchaseOrder.aggregate([
        { $match: { status: 'Received' } },
        { $group: { _id: '$supplierName', receivedPurchases: { $sum: '$totalAmount' }, purchaseCount: { $sum: 1 } } }
      ]),
      SupplierPayment.aggregate([
        { $group: { _id: '$supplierName', paidAmount: { $sum: '$amount' }, paymentCount: { $sum: 1 } } }
      ]),
      PurchaseReturn.aggregate([{ $group: { _id: '$supplierName', returnedAmount: { $sum: '$amount' } } }])
    ]);

    const rows = new Map();
    purchases.forEach((row) => rows.set(row._id, { supplierName: row._id, receivedPurchases: row.receivedPurchases, purchaseCount: row.purchaseCount, paidAmount: 0, paymentCount: 0 }));
    payments.forEach((row) => {
      const current = rows.get(row._id) || { supplierName: row._id, receivedPurchases: 0, purchaseCount: 0, paidAmount: 0, paymentCount: 0 };
      current.paidAmount = row.paidAmount;
      current.paymentCount = row.paymentCount;
      rows.set(row._id, current);
    });
    returns.forEach((row) => {
      const current = rows.get(row._id) || { supplierName: row._id, receivedPurchases: 0, purchaseCount: 0, paidAmount: 0, paymentCount: 0 };
      current.returnedAmount = row.returnedAmount;
      rows.set(row._id, current);
    });
    const data = Array.from(rows.values()).map((row) => ({ ...row, returnedAmount: row.returnedAmount || 0, outstanding: Number((row.receivedPurchases - (row.returnedAmount || 0) - row.paidAmount).toFixed(2)) }));
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.get('/ledger', async (req, res) => {
  try {
    const supplierName = normalizeName(req.query.supplierName);
    if (!supplierName) return res.status(400).json({ success: false, message: 'supplierName is required' });
    const [purchases, payments, returns] = await Promise.all([
      PurchaseOrder.find({ supplierName, status: 'Received' }).sort({ receivedAt: -1, createdAt: -1 }),
      SupplierPayment.find({ supplierName }).sort({ paidAt: -1 }),
      PurchaseReturn.find({ supplierName }).sort({ returnedAt: -1 })
    ]);
    const receivedTotal = purchases.reduce((sum, row) => sum + Number(row.totalAmount || 0), 0);
    const paidTotal = payments.reduce((sum, row) => sum + Number(row.amount || 0), 0);
    const returnedTotal = returns.reduce((sum, row) => sum + Number(row.amount || 0), 0);
    res.json({ success: true, data: { supplierName, purchases, payments, returns, receivedTotal, paidTotal, returnedTotal, outstanding: Number((receivedTotal - returnedTotal - paidTotal).toFixed(2)) } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/payments', async (req, res) => {
  try {
    const supplierName = normalizeName(req.body.supplierName);
    const amount = Number(req.body.amount);
    if (!supplierName || !Number.isFinite(amount) || amount <= 0) return res.status(400).json({ success: false, message: 'Supplier name and a positive amount are required' });
    const payment = await SupplierPayment.create({
      supplierName,
      amount,
      paymentMode: req.body.paymentMode || 'Bank Transfer',
      reference: String(req.body.reference || '').trim(),
      notes: String(req.body.notes || '').trim(),
      paidBy: req.user?.name || 'Manager'
    });
    res.status(201).json({ success: true, data: payment });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

module.exports = router;
