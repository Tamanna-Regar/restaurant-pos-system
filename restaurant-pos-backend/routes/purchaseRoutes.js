const express = require('express');
const fs = require('fs');
const path = require('path');
const PurchaseOrder = require('../models/PurchaseOrder');
const Ingredient = require('../models/Ingredient');
const InventoryLedger = require('../models/InventoryLedger');
const InventoryBatch = require('../models/InventoryBatch');
const PurchaseReturn = require('../models/PurchaseReturn');

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const orders = await PurchaseOrder.find().sort({ createdAt: -1 });
    res.json({ success: true, data: orders });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/auto-generate', async (req, res) => {
  try {
    const ingredients = await Ingredient.find({ $expr: { $lt: ["$currentStock", "$minStockAlert"] } });
    if (!ingredients.length) {
      return res.json({ success: true, message: 'No low stock items found.', count: 0 });
    }

    const generatedOrders = [];
    for (const item of ingredients) {
      const orderQty = item.minStockAlert ? (item.minStockAlert * 2) : 10;
      const payload = {
        supplierName: 'Default Supplier',
        ingredientId: item._id,
        itemName: item.name,
        category: 'Grocery',
        unit: item.unit || 'kg',
        quantity: orderQty,
        unitPrice: item.costPerUnit || 1,
        totalAmount: orderQty * (item.costPerUnit || 1),
        status: 'Pending',
        createdBy: req.user?.name || 'System Auto-Gen'
      };
      const order = await PurchaseOrder.create(payload);
      generatedOrders.push(order);
    }

    res.json({ success: true, message: `Auto-generated ${generatedOrders.length} purchase orders!`, count: generatedOrders.length });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const body = req.body || {};
    const itemDetails = Array.isArray(body.items) && body.items.length > 0 ? body.items[0] : {};

    const supplierName = body.supplierName || body.supplier || body.vendor || 'Supplier';
    const itemName = body.itemName || itemDetails.name || itemDetails.itemName || 'Item';
    const category = body.category || itemDetails.category || 'Vegetables';
    const unit = body.unit || itemDetails.unit || 'kg';
    const quantity = Number(body.quantity ?? itemDetails.quantity ?? 0);
    const unitPrice = Number(body.unitPrice ?? itemDetails.unitCost ?? itemDetails.unitPrice ?? itemDetails.price ?? 0);
    const totalAmount = Number(body.totalAmount ?? itemDetails.totalAmount ?? itemDetails.totalPrice ?? quantity * unitPrice);
    const statusValue = String(body.status || itemDetails.status || 'Pending');
    const normalizedStatus = (() => {
      const map = {
        pending: 'Pending',
        approved: 'Approved',
        received: 'Received',
        cancelled: 'Cancelled',
        cancel: 'Cancelled'
      };
      const normalized = String(statusValue).trim();
      return map[normalized.toLowerCase()] || 'Pending';
    })();

    const payload = {
      supplierName,
      ingredientId: body.ingredientId || itemDetails.ingredientId || null,
      itemName,
      category,
      unit,
      quantity,
      unitPrice,
      totalAmount,
      batchNo: body.batchNo || itemDetails.batchNo || '',
      expiryDate: body.expiryDate || itemDetails.expiryDate || null,
      status: normalizedStatus,
      expectedDate: body.expectedDate || itemDetails.expectedDate || '',
      notes: body.notes || itemDetails.notes || '',
      createdBy: body.createdBy || req.user?.name || 'System'
    };

    const order = await PurchaseOrder.create(payload);
    res.status(201).json({ success: true, data: order });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.patch('/:id/status', async (req, res) => {
  try {
    const existing = await PurchaseOrder.findById(req.params.id);
    if (!existing) return res.status(404).json({ success: false, message: 'Purchase order not found' });
    let priceWarning = false;
    const nextStatus = String(req.body.status || '');
    if (!['Pending', 'Approved', 'Partially Received', 'Received', 'Cancelled'].includes(nextStatus)) {
      return res.status(400).json({ success: false, message: 'Invalid purchase order status' });
    }
    if (existing.status === 'Received') {
      return res.status(409).json({ success: false, message: 'A fully received purchase order cannot be changed' });
    }
    
    if (nextStatus === 'Received' || nextStatus === 'Partially Received') {
      const ingredient = existing.ingredientId
        ? await Ingredient.findById(existing.ingredientId)
        : await Ingredient.findOne({ name: { $regex: `^${existing.itemName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' } });
      if (!ingredient) return res.status(400).json({ success: false, message: 'Link this purchase order to an ingredient before receiving it' });
      
      const receiveQty = req.body.receivedQuantity !== undefined ? Number(req.body.receivedQuantity) : (existing.quantity - existing.receivedQuantity);
      if (receiveQty <= 0) return res.status(400).json({ success: false, message: 'Received quantity must be greater than zero' });
      if (existing.receivedQuantity + receiveQty > existing.quantity) {
        return res.status(400).json({ success: false, message: 'Cannot receive more than the ordered quantity' });
      }

      if (ingredient.costPerUnit > 0 && existing.unitPrice > (ingredient.costPerUnit * 1.10)) {
        priceWarning = true;
      }
      
      const previousStock = Number(ingredient.currentStock || 0);
      const previousCost = Number(ingredient.costPerUnit || 0);

      ingredient.currentStock += receiveQty;
      ingredient.costPerUnit = Number(((previousStock * previousCost + receiveQty * existing.unitPrice) / ingredient.currentStock).toFixed(4));
      
      await ingredient.save();
      await InventoryLedger.create({ ingredientId: ingredient._id, type: 'purchase', quantity: receiveQty, balanceAfter: ingredient.currentStock, referenceType: 'PurchaseOrder', referenceId: String(existing._id), note: `Received ${receiveQty} from ${existing.supplierName}`, createdBy: req.user?.name || 'System' });
      await InventoryBatch.create({
        ingredientId: ingredient._id,
        purchaseOrderId: existing._id,
        itemName: existing.itemName,
        supplierName: existing.supplierName,
        batchNo: existing.batchNo || `PO-${String(existing._id).slice(-6).toUpperCase()}`,
        quantityReceived: receiveQty,
        quantityRemaining: receiveQty,
        unit: existing.unit,
        unitCost: existing.unitPrice,
        expiryDate: existing.expiryDate,
        receivedAt: new Date()
      });
      existing.ingredientId = ingredient._id;
      existing.receivedAt = new Date();
      existing.receivedQuantity += receiveQty;
      
      // Auto upgrade status to fully received if completed
      if (existing.receivedQuantity >= existing.quantity) {
        existing.status = 'Received';
      } else {
        existing.status = 'Partially Received';
      }
    } else {
      existing.status = nextStatus;
    }
    const order = await existing.save();
    res.json({ success: true, data: order, priceWarning });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.post('/:id/upload-bill', async (req, res) => {
  try {
    const { base64Data, filename } = req.body;
    if (!base64Data) return res.status(400).json({ success: false, message: 'Base64 data required' });
    
    const existing = await PurchaseOrder.findById(req.params.id);
    if (!existing) return res.status(404).json({ success: false, message: 'Purchase order not found' });
    
    const uploadsDir = path.join(__dirname, '..', 'public', 'uploads');
    if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
    
    const ext = filename ? path.extname(filename) : '.jpg';
    const safeFilename = `PO-${existing._id}-${Date.now()}${ext}`;
    const filePath = path.join(uploadsDir, safeFilename);
    
    const base64DataPart = base64Data.replace(/^data:[a-zA-Z0-9/+-]+;base64,/, '');
    fs.writeFileSync(filePath, base64DataPart, 'base64');
    
    existing.invoiceBillUrl = `/uploads/${safeFilename}`;
    await existing.save();
    
    res.json({ success: true, message: 'Bill uploaded successfully', url: existing.invoiceBillUrl });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Record material that has physically arrived. This creates the purchase record,
// updates stock, and keeps a batch/ledger trail in one operation.
router.post('/receive', async (req, res) => {
  try {
    const body = req.body || {};
    const itemName = String(body.itemName || '').trim();
    const supplierName = String(body.supplierName || body.supplier || '').trim();
    const unit = String(body.unit || 'kg').trim();
    const quantity = Number(body.quantity);
    const unitPrice = Number(body.unitPrice);

    if (!itemName || !supplierName || !Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(unitPrice) || unitPrice <= 0) {
      return res.status(400).json({ success: false, message: 'Item, supplier, positive quantity and unit price are required' });
    }

    let ingredient = body.ingredientId ? await Ingredient.findById(body.ingredientId) : null;
    if (!ingredient) {
      ingredient = await Ingredient.findOne({ name: { $regex: `^${itemName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' } });
    }
    if (ingredient && ingredient.unit !== unit) {
      return res.status(400).json({ success: false, message: `${ingredient.name} is measured in ${ingredient.unit}, not ${unit}` });
    }
    if (!ingredient) {
      ingredient = await Ingredient.create({
        name: itemName,
        unit,
        currentStock: 0,
        minStockAlert: Number(body.minStockAlert || 0),
        costPerUnit: 0
      });
    }

    const previousStock = Number(ingredient.currentStock || 0);
    const previousCost = Number(ingredient.costPerUnit || 0);
    ingredient.currentStock = previousStock + quantity;
    ingredient.costPerUnit = Number(((previousStock * previousCost + quantity * unitPrice) / ingredient.currentStock).toFixed(4));
    const targetLocation = String(body.location || 'Main Store').trim();
    const stockByLocation = Object.fromEntries(ingredient.stockByLocation || []);
    stockByLocation[targetLocation] = Number((Number(stockByLocation[targetLocation] || 0) + quantity).toFixed(4));
    ingredient.stockByLocation = stockByLocation;

    const order = await PurchaseOrder.create({
      supplierName,
      ingredientId: ingredient._id,
      itemName: ingredient.name,
      category: body.category || 'Other',
      unit,
      quantity,
      unitPrice,
      totalAmount: Number((quantity * unitPrice).toFixed(2)),
      batchNo: String(body.batchNo || '').trim(),
      expiryDate: body.expiryDate || null,
      status: 'Received',
      notes: String(body.notes || '').trim(),
      createdBy: req.user?.name || 'Inventory Staff',
      receivedAt: new Date()
    });

    await ingredient.save();
    const batch = await InventoryBatch.create({
      ingredientId: ingredient._id,
      purchaseOrderId: order._id,
      itemName: ingredient.name,
      supplierName,
      batchNo: String(body.batchNo || `GRN-${String(order._id).slice(-6).toUpperCase()}`),
      quantityReceived: quantity,
      quantityRemaining: quantity,
      unit,
      unitCost: unitPrice,
      expiryDate: body.expiryDate || null,
      receivedAt: new Date()
    });
    await InventoryLedger.create({
      ingredientId: ingredient._id,
      batchId: batch._id,
      type: 'purchase',
      quantity,
      balanceAfter: ingredient.currentStock,
      referenceType: 'PurchaseOrder',
      referenceId: String(order._id),
      note: `Received from ${supplierName}`,
      createdBy: req.user?.name || 'Inventory Staff'
    });

    res.status(201).json({ success: true, data: { order, batch, ingredient } });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.get('/returns', async (req, res) => {
  try {
    const returns = await PurchaseReturn.find().sort({ returnedAt: -1 }).limit(500);
    res.json({ success: true, data: returns });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/returns', async (req, res) => {
  try {
    const itemName = String(req.body.itemName || '').trim();
    const supplierName = String(req.body.supplierName || req.body.supplier || '').trim();
    const quantity = Number(req.body.quantity);
    if (!itemName || !supplierName || !Number.isFinite(quantity) || quantity <= 0) return res.status(400).json({ success: false, message: 'Item, supplier and positive quantity are required' });

    const batch = req.body.batchId
      ? await InventoryBatch.findById(req.body.batchId)
      : await InventoryBatch.findOne({ itemName, supplierName, quantityRemaining: { $gte: quantity }, status: { $in: ['active', 'expired'] } }).sort({ expiryDate: 1, receivedAt: 1 });
    const ingredient = batch ? await Ingredient.findById(batch.ingredientId) : await Ingredient.findOne({ name: itemName });
    if (!ingredient) return res.status(404).json({ success: false, message: 'Ingredient or received batch not found' });
    if (ingredient.currentStock < quantity) return res.status(400).json({ success: false, message: `Only ${ingredient.currentStock} ${ingredient.unit} is available` });
    if (batch && batch.quantityRemaining < quantity) return res.status(400).json({ success: false, message: 'Return quantity exceeds batch quantity' });

    const purchaseOrder = batch?.purchaseOrderId ? await PurchaseOrder.findById(batch.purchaseOrderId) : null;
    const amount = Number((quantity * Number(batch?.unitCost || purchaseOrder?.unitPrice || 0)).toFixed(2));
    ingredient.currentStock -= quantity;
    await ingredient.save();
    if (batch) {
      batch.quantityRemaining -= quantity;
      if (batch.quantityRemaining === 0) batch.status = 'depleted';
      await batch.save();
    }
    const record = await PurchaseReturn.create({ purchaseOrderId: batch?.purchaseOrderId || null, batchId: batch?._id || null, ingredientId: ingredient._id, itemName, supplierName, quantity, amount, reason: String(req.body.reason || 'Quality / expired stock').trim(), returnedBy: req.user?.name || 'Inventory Manager' });
    await InventoryLedger.create({ ingredientId: ingredient._id, batchId: batch?._id || null, type: 'return', quantity: -quantity, balanceAfter: ingredient.currentStock, referenceType: 'PurchaseReturn', referenceId: String(record._id), note: record.reason, createdBy: req.user?.name || 'Inventory Manager' });
    res.status(201).json({ success: true, data: record });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

module.exports = router;
