const express = require('express');
const router = express.Router();
const Order = require('../models/Order');
const Table = require('../models/Table');
const Payment = require('../models/Payment');
const Item = require('../models/Item');
const Ingredient = require('../models/Ingredient');
const { resolveModifiers } = require('../utils/modifierHelper');

// ---- INTEGRATED HELPERS ----
const { deductStockForOrder } = require('../utils/inventoryHelper');
const { updateCustomerCRM } = require('../utils/crmHelper');
const { sendWhatsAppBill } = require('../utils/whatsappHelper'); // WhatsApp Bill Integration Helper
const { queueOrderCommunications } = require('../utils/communicationHelper');
const { getNextInvoiceNumber } = require('../utils/invoiceHelper');
const { getBranchScope, canAccessBranch } = require('../utils/branchScope');

const emitLowStockAlerts = async (io) => {
  if (!io) return;
  const ingredients = await Ingredient.find({ $expr: { $lte: ['$currentStock', '$minStockAlert'] } }).select('name unit currentStock minStockAlert');
  ingredients.forEach((ingredient) => io.emit('inventory-low-stock', {
    ingredient: {
      _id: ingredient._id,
      name: ingredient.name,
      unit: ingredient.unit,
      stock: ingredient.currentStock,
      minLimit: ingredient.minStockAlert
    }
  }));
};

// Helper to calculate totals accurately
function calculateTotals(items, options = {}) {
  const subTotal = items.reduce((sum, item) => sum + (Number(item.price) * Number(item.quantity || 1)), 0);
  const discountPercent = Math.max(0, Math.min(100, Number(options.discountPercent || 0)));
  const customDiscountAmt = Math.max(0, Number(options.customDiscountAmt || 0));
  const serviceChargeRate = Math.max(0, Math.min(100, Number(options.serviceChargeRate || 0)));
  const gstRate = Math.max(0, Math.min(100, Number(options.gstRate ?? 5)));
  const isInterState = Boolean(options.isInterState);
  const roundOffAmount = Number(options.roundOffAmount || 0);
  const compDiscountAmt = Math.max(0, Number(options.compDiscountAmt || 0));
  const discountAmt = Math.round((subTotal * (discountPercent / 100)) * 100) / 100;
  const serviceChargeAmt = Math.max(0, subTotal - discountAmt - customDiscountAmt) * (serviceChargeRate / 100);
  const taxable = Math.max(0, subTotal - discountAmt - customDiscountAmt + serviceChargeAmt);
  const itemTaxable = items.reduce((sum, item) => {
    if (item.taxCategory === 'exempt' || item.taxCategory === 'zero-rated') return sum;
    const rate = Number.isFinite(Number(item.taxRate)) ? Number(item.taxRate) : gstRate;
    return sum + (Number(item.price) * Number(item.quantity || 1) * rate / 100);
  }, 0);
  const tax = Math.round((itemTaxable * (1 - ((discountAmt + customDiscountAmt) / Math.max(subTotal, 1))) + (serviceChargeAmt * gstRate / 100)) * 100) / 100;
  const cgst = isInterState ? 0 : Math.round((tax / 2) * 100) / 100;
  const sgst = isInterState ? 0 : Math.round((tax - cgst) * 100) / 100;
  const igst = isInterState ? tax : 0;
  const grandTotal = Math.max(0, Math.round((taxable + tax + roundOffAmount - compDiscountAmt) * 100) / 100);
  return { subTotal, discountAmt, customDiscountAmt, serviceChargeRate, serviceChargeAmt, taxableAmount: taxable, gstRate, tax, cgst, sgst, igst, isInterState, roundOffAmount, compDiscountAmt, grandTotal };
}

async function normalizeOrderItems(items) {
  const ids = items.map((item) => item.itemId || item.originalId || item._id).filter(Boolean);
  const menuItems = await Item.find({ _id: { $in: ids } }).select('_id price addons hsnSac taxRate taxCategory');
  const menuById = new Map(menuItems.map((item) => [String(item._id), item]));
  return items.map((item) => {
    const itemId = item.itemId || item.originalId || item._id;
    const menuItem = menuById.get(String(itemId));
    const addons = resolveModifiers(item.addons, menuItem?.addons);
    if (!menuItem) throw new Error('One or more menu items were not found');
    const basePrice = Number(menuItem.price);
    const addonTotal = addons.reduce((sum, addon) => sum + addon.price, 0);
    const effectivePrice = Number((basePrice + addonTotal).toFixed(2));
    return {
      ...item,
      itemId: menuItem._id,
      basePrice,
      addonTotal,
      addons,
      price: effectivePrice,
      hsnSac: menuItem.hsnSac || '',
      taxRate: Number(menuItem.taxRate ?? 5),
      taxCategory: menuItem.taxCategory || 'taxable'
    };
  });
}

// 1. Place New Order / Punch Initial KOT
router.post(['/', '/create'], async (req, res) => {
  try {
    const {
      tableId,
      orderType = 'Dine-In',
      deliveryAddress = '',
      items = [],
      customerName = 'Walk-in Customer',
      customerPhone = '',
      customerGstin = '',
      placeOfSupply = '',
      isInterState = false,
      waiterName = 'Captain',
      celebrationOccasion = '',
      celebrantName = '',
      discount = 0,
      customDiscount = 0,
      serviceCharge = 0,
      gstRate = 5,
      roundOff = 0,
      compDiscount = 0,
      paymentMode = 'Cash'
    } = req.body;

    const normalizedCustomerGstin = String(customerGstin || '').trim().toUpperCase().replace(/\s+/g, '');
    if (normalizedCustomerGstin && !/^[0-9A-Z]{15}$/.test(normalizedCustomerGstin)) {
      return res.status(400).json({ success: false, message: 'Invalid GSTIN. Enter exactly 15 letters/numbers or leave the GSTIN blank.' });
    }
    const normalizedPlaceOfSupply = String(placeOfSupply || '').trim();
    if (normalizedCustomerGstin && normalizedPlaceOfSupply && normalizedCustomerGstin.slice(0, 2) !== normalizedPlaceOfSupply) {
      return res.status(400).json({ success: false, message: `State code ${normalizedPlaceOfSupply} does not match GSTIN. Use ${normalizedCustomerGstin.slice(0, 2)}.` });
    }

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ success: false, message: 'At least one order item is required' });
    }

    const normalizedItems = items.map((item) => ({
      ...item,
      price: Number(item.price),
      quantity: Number(item.quantity || 1)
    }));
    if (normalizedItems.some((item) => !Number.isFinite(item.price) || item.price < 0 || !Number.isFinite(item.quantity) || item.quantity < 1)) {
      return res.status(400).json({ success: false, message: 'Each item must have a valid price and quantity' });
    }
    const pricedItems = await normalizeOrderItems(normalizedItems);

    const totals = calculateTotals(pricedItems, { discountPercent: discount, customDiscountAmt: customDiscount, serviceChargeRate: serviceCharge, gstRate, isInterState, roundOffAmount: roundOff, compDiscountAmt: compDiscount });

    // Initial KOT
    const firstKot = {
      kotNumber: 1,
      punchedAt: new Date(),
      status: 'placed',
      items: pricedItems.map(it => ({
        itemId: it.itemId || it.originalId || it._id,
        name: it.name,
        foodType: it.foodType || 'veg',
        portion: it.portion || 'Full',
        price: Number(it.price),
        basePrice: Number(it.basePrice),
        addonTotal: Number(it.addonTotal),
        addons: it.addons,
        hsnSac: it.hsnSac,
        taxRate: it.taxRate,
        taxCategory: it.taxCategory,
        quantity: Number(it.quantity || 1),
        notes: it.notes || ''
      }))
    };

    const newOrder = new Order({
      branchId: req.user?.branchId || (['admin', 'manager'].includes(req.user?.role) ? (req.body.branchId || null) : null),
      tableId: (orderType === 'Dine-In' && tableId) ? tableId : null,
      orderType,
      deliveryAddress: orderType === 'Delivery' ? deliveryAddress : '',
      customerName: customerName || 'Walk-in Customer',
      customerPhone: customerPhone || '',
      customerGstin: normalizedCustomerGstin,
      placeOfSupply: normalizedPlaceOfSupply,
      isInterState: Boolean(isInterState),
      waiterName: waiterName || 'Captain',
      celebrationOccasion,
      celebrantName,
      kotNumber: 1,
      kots: [firstKot],
      items: pricedItems.map(it => ({
        itemId: it.itemId || it.originalId || it._id,
        name: it.name,
        foodType: it.foodType || 'veg',
        portion: it.portion || 'Full',
        price: Number(it.price),
        basePrice: Number(it.basePrice),
        addonTotal: Number(it.addonTotal),
        addons: it.addons,
        hsnSac: it.hsnSac,
        taxRate: it.taxRate,
        taxCategory: it.taxCategory,
        quantity: Number(it.quantity || 1),
        notes: it.notes || '',
        kotNumber: 1
      })),
      ...totals,
      discount: Number(discount || 0),
      paymentMode,
      paymentStatus: 'pending',
      orderStatus: 'placed',
      statusHistory: [{
        status: 'placed',
        timestamp: new Date(),
        updatedBy: waiterName || 'Staff'
      }]
    });

    await newOrder.save();

    // ---- INVENTORY TRIGGER: Deduct raw material stock for KOT #1 ----
    await deductStockForOrder(newOrder.items, newOrder._id);
    await emitLowStockAlerts(req.app.get('io'));

    // If Dine-In, mark table as occupied and link order
    if (orderType === 'Dine-In' && tableId) {
      await Table.findByIdAndUpdate(tableId, {
        status: 'occupied',
        currentOrderId: newOrder._id
      });
    }

    res.status(201).json({ success: true, data: newOrder });
  } catch (error) {
    console.error('Create Order Error:', error);
    if (error?.code === 11000 && error?.keyPattern?.invoiceNumber) {
      return res.status(409).json({ success: false, message: 'Invoice number conflict. Please retry the order.' });
    }
    res.status(500).json({ success: false, message: error.message });
  }
});

// 2. Multi-KOT Punch: Add extra items to a running order as a new KOT
router.post('/kot/punch/:orderId', async (req, res) => {
  try {
    const { newItems = [], discount, waiterName } = req.body;
    const order = await Order.findById(req.params.orderId);

    if (!order) return res.status(404).json({ message: 'Order not found' });
    if (order.orderStatus === 'completed' || order.orderStatus === 'cancelled') {
      return res.status(400).json({ message: 'Cannot add items to completed/cancelled order' });
    }
    if (!Array.isArray(newItems) || newItems.length === 0) {
      return res.status(400).json({ success: false, message: 'At least one new item is required' });
    }
    const normalizedNewItems = newItems.map((item) => ({
      ...item,
      price: Number(item.price),
      quantity: Number(item.quantity || 1)
    }));
    if (normalizedNewItems.some((item) => !Number.isFinite(item.price) || item.price < 0 || !Number.isFinite(item.quantity) || item.quantity < 1)) {
      return res.status(400).json({ success: false, message: 'Each new item must have a valid price and quantity' });
    }
    const pricedNewItems = await normalizeOrderItems(normalizedNewItems);

    const nextKotNumber = (order.kots?.length || 0) + 1;

    const newKot = {
      kotNumber: nextKotNumber,
      punchedAt: new Date(),
      status: 'placed',
      items: pricedNewItems.map(it => ({
        itemId: it.itemId || it.originalId || it._id,
        name: it.name,
        foodType: it.foodType || 'veg',
        portion: it.portion || 'Full',
        price: Number(it.price),
        basePrice: Number(it.basePrice),
        addonTotal: Number(it.addonTotal),
        addons: it.addons,
        quantity: Number(it.quantity || 1),
        notes: it.notes || ''
      }))
    };

    // Older orders may not have the multi-KOT array yet. Initialize it so
    // additional items stay on the same order instead of creating a new one.
    order.kots = Array.isArray(order.kots) ? order.kots : [];
    order.kots.push(newKot);

    // Append to items
    pricedNewItems.forEach(it => {
      order.items.push({
        itemId: it.itemId || it.originalId || it._id,
        name: it.name,
        foodType: it.foodType || 'veg',
        portion: it.portion || 'Full',
        price: Number(it.price),
        basePrice: Number(it.basePrice),
        addonTotal: Number(it.addonTotal),
        addons: it.addons,
        quantity: Number(it.quantity || 1),
        notes: it.notes || '',
        kotNumber: nextKotNumber
      });
    });

    const activeDiscount = discount !== undefined ? Number(discount) : order.discount;
    const totals = calculateTotals(order.items, { discountPercent: activeDiscount, customDiscountAmt: order.customDiscountAmt, serviceChargeRate: order.serviceChargeRate, gstRate: order.gstRate, isInterState: order.isInterState, roundOffAmount: order.roundOffAmount, compDiscountAmt: order.compDiscountAmt });

    Object.assign(order, totals);
    order.discount = activeDiscount;
    order.kotNumber = nextKotNumber;
    order.orderStatus = 'preparing';

    order.statusHistory = order.statusHistory || [];
    order.statusHistory.push({
      status: 'preparing',
      timestamp: new Date(),
      updatedBy: waiterName || order.waiterName || 'Staff'
    });

    await order.save();

    // ---- INVENTORY TRIGGER: Deduct stock for newly added items ----
    await deductStockForOrder(pricedNewItems, order._id);
    await emitLowStockAlerts(req.app.get('io'));

    // Ensure table remains occupied
    if (order.tableId) {
      await Table.findByIdAndUpdate(order.tableId, { status: 'occupied' });
    }

    res.json({ success: true, message: `KOT #${nextKotNumber} punched successfully!`, data: order, kot: newKot });
  } catch (error) {
    console.error('Punch KOT Error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// 3. Fetch All Orders
router.get('/active', async (req, res) => {
  try {
    const allOrders = await Order.find(getBranchScope(req))
      .sort({ createdAt: -1 })
      .populate('tableId')
      .populate('items.itemId');
    res.json({ success: true, data: allOrders });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// 4. Update Kitchen Status or Mark as Billed
router.put('/status/:orderId', async (req, res) => {
  try {
    const { status, updatedBy } = req.body;

    if (!['placed', 'preparing', 'ready', 'billed', 'cancelled'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Invalid status. Use 'placed', 'preparing', 'ready', 'billed', or 'cancelled'."
      });
    }

    const order = await Order.findById(req.params.orderId);
    if (!order) return res.status(404).json({ message: 'Order not found' });
    if (!canAccessBranch(req, order.branchId)) return res.status(403).json({ success: false, message: 'This order belongs to another branch.' });
    if (status === 'cancelled') {
      if (!['admin', 'manager'].includes(req.user?.role)) {
        return res.status(403).json({ success: false, message: 'Only admin or manager can cancel an order' });
      }
      if (order.paymentStatus === 'paid') {
        return res.status(409).json({ success: false, message: 'Paid bills must be refunded from Payments before cancellation' });
      }
      if (order.orderStatus === 'cancelled') {
        return res.status(409).json({ success: false, message: 'Order is already cancelled' });
      }
      await restoreStockForOrder(order.items, order._id, req.user?.name || updatedBy || 'Cancellation');
      order.cancellationReason = String(req.body.reason || 'Order cancelled').trim().slice(0, 250);
      order.cancelledBy = req.user?.name || updatedBy || 'Manager';
      order.cancelledAt = new Date();
    }

    order.orderStatus = status;

    order.statusHistory = order.statusHistory || [];
    order.statusHistory.push({
      status,
      timestamp: new Date(),
      updatedBy: updatedBy || order.waiterName || 'Staff'
    });

    await order.save();

    // Synchronize Table status
    if (order.tableId) {
      if (status === 'billed') {
        await Table.findByIdAndUpdate(order.tableId, { status: 'billed' });
      } else if (status === 'cancelled') {
        await Table.findByIdAndUpdate(order.tableId, { status: 'available', currentOrderId: null });
      }
    }

    res.json({ success: true, data: order });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// 5. Complete Order & Payment Settlement
router.put('/pay/:orderId', async (req, res) => {
  try {
    const { paymentMode, cashTendered = 0, changeReturn, splitAmounts, paymentReference = '', paymentProvider = 'manual', updatedBy } = req.body;
    const order = await Order.findById(req.params.orderId);

    if (!order) return res.status(404).json({ message: 'Order not found' });
    if (order.paymentStatus === 'paid') {
      return res.json({ success: true, message: 'Order payment was already settled', order });
    }

    const supportedPaymentModes = ['Cash', 'PhonePe', 'QR', 'Online', 'UPI', 'Card', 'Credit/Debit Card', 'QR Code', 'UPI/Online', 'Split'];
    const normalizedPaymentMode = paymentMode || order.paymentMode || 'Cash';
    if (!supportedPaymentModes.includes(normalizedPaymentMode)) {
      return res.status(400).json({ success: false, message: `Unsupported payment mode: ${normalizedPaymentMode}` });
    }
    const billTotal = Number(order.grandTotal || 0);
    if (!Number.isFinite(billTotal) || billTotal < 0) {
      return res.status(400).json({ success: false, message: 'Order has an invalid bill total' });
    }
    const normalizedReference = String(paymentReference || '').trim().slice(0, 100);
    if (normalizedPaymentMode !== 'Cash' && normalizedPaymentMode !== 'Split' && !normalizedReference) {
      return res.status(400).json({ success: false, message: 'Transaction reference is required for digital/card payments' });
    }
    let paymentBreakdown = null;
    if (normalizedPaymentMode === 'Split') {
      const cash = Number(splitAmounts?.cash || 0);
      const online = Number(splitAmounts?.online || 0);
      if (!Number.isFinite(cash) || !Number.isFinite(online) || cash < 0 || online < 0) {
        return res.status(400).json({ success: false, message: 'Split payment amounts must be valid non-negative numbers' });
      }
      if (Math.abs((cash + online) - billTotal) > 0.01) {
        return res.status(400).json({ success: false, message: `Split payment must equal the bill total of ₹${billTotal.toFixed(2)}` });
      }
      paymentBreakdown = { cash: Number(cash.toFixed(2)), online: Number(online.toFixed(2)) };
    } else if (normalizedPaymentMode === 'Cash') {
      const tendered = Number(cashTendered);
      if (!Number.isFinite(tendered) || tendered < billTotal) {
        return res.status(400).json({ success: false, message: `Cash tendered must be at least ₹${billTotal.toFixed(2)}` });
      }
    }

    order.paymentStatus = 'paid';
    
    if (order.orderType === 'Dine-In') {
      order.orderStatus = 'completed';

      order.statusHistory = order.statusHistory || [];
      order.statusHistory.push({
        status: 'completed',
        timestamp: new Date(),
        updatedBy: updatedBy || order.waiterName || 'Staff'
      });
    }
    
    order.paymentMode = normalizedPaymentMode;
    order.paymentBreakdown = paymentBreakdown;
    order.paymentReference = normalizedReference;
    order.paymentProvider = String(paymentProvider || 'manual').trim().slice(0, 40) || 'manual';
    order.cashTendered = normalizedPaymentMode === 'Cash' ? Number(Number(cashTendered).toFixed(2)) : 0;
    order.changeReturn = normalizedPaymentMode === 'Cash'
      ? Number((order.cashTendered - billTotal).toFixed(2))
      : 0;
    if (changeReturn !== undefined && normalizedPaymentMode === 'Cash' && Math.abs(Number(changeReturn) - order.changeReturn) > 0.01) {
      return res.status(400).json({ success: false, message: 'Change return does not match cash tendered and bill total' });
    }
    order.settledAt = new Date();
    order.invoiceNumber = order.invoiceNumber || await getNextInvoiceNumber(order.settledAt);
    await order.save();

    // ---- CRM & LOYALTY TRIGGER: Credit points & update customer purchase history ----
    if (order.customerPhone) {
      await updateCustomerCRM(order.customerPhone, order.customerName, order.grandTotal);
      
      // ---- WHATSAPP NOTIFICATION TRIGGER: Send E-Receipt to Customer ----
      await sendWhatsAppBill(order.customerPhone, order.customerName, order.grandTotal, order._id);
      await queueOrderCommunications(order);
    }

    // Free the table
    if (order.tableId) {
      await Table.findByIdAndUpdate(order.tableId, { status: 'available', currentOrderId: null });
    }

    // Record into Payments collection
    await Payment.create({
      branchId: order.branchId || req.user?.branchId || null,
      orderId: order._id,
      invoiceNumber: order.invoiceNumber,
      tableId: order.tableId || null,
      customerName: order.customerName,
      customerPhone: order.customerPhone,
      customerGstin: order.customerGstin,
      paymentMode: order.paymentMode,
      paymentBreakdown: order.paymentBreakdown,
      paymentReference: order.paymentReference,
      paymentProvider: order.paymentProvider,
      subTotal: order.subTotal,
      tax: order.tax,
      gstRate: order.gstRate,
      cgst: order.cgst,
      sgst: order.sgst,
      igst: order.igst,
      discount: order.discount || 0,
      grandTotal: order.grandTotal,
      status: 'paid'
    });

    res.json({ success: true, message: 'Payment completed, CRM updated, WhatsApp bill sent & table freed!', order });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});


// 6. Update Individual Item Status in KOT
router.put('/:orderId/item-status', async (req, res) => {
  try {
    const { kotNumber, itemId, status } = req.body;
    const { orderId } = req.params;

    if (!['placed', 'preparing', 'ready', 'served', 'cancelled'].includes(status)) {
      return res.status(400).json({ success: false, message: "Invalid item status." });
    }

    const order = await Order.findById(orderId);
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

    let foundItem = null;

    // Find and update item inside specific KOT array
    if (order.kots && order.kots.length > 0) {
      const kot = order.kots.find(k => k.kotNumber === Number(kotNumber));
      if (kot && kot.items) {
        foundItem = kot.items.find(i => String(i.itemId) === String(itemId) || String(i._id) === String(itemId));
        if (foundItem) {
          foundItem.itemStatus = status;
        }
      }
    }

    await order.save();

    res.json({ success: true, message: 'Item status updated successfully!', data: order });
  } catch (error) {
    console.error('Update Item Status Error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});
module.exports = router;