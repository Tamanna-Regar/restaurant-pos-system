const express = require('express');
const router = express.Router();
const Item = require('../models/Item');
const { authenticate, authorize } = require('../middleware/authMiddleware');

const menuManager = [authenticate, authorize('admin', 'manager')];
const availabilityManager = [authenticate, authorize('admin', 'manager', 'chef', 'waiter')];

// 1. Get All Menu Items
router.get('/', async (req, res) => {
  try {
    const branchId = String(req.query.branchId || '').trim();
    const filter = branchId ? { $or: [{ isCentral: true }, { branchIds: branchId }] } : {};
    const items = await Item.find(filter).sort({ category: 1, name: 1 });
    res.json({ success: true, data: items });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// 2. Add New Menu Item
router.post(['/', '/add'], ...menuManager, async (req, res) => {
  try {
    const { name, code, barcode, category, foodType, price, image, floor, halfPrice, description, addons, hsnSac, taxRate, taxCategory, isCombo, comboItems, seasonalTag, seasonalFrom, seasonalTill, happyHour, branchIds, isCentral } = req.body;
    
    const imageUrl = image || "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=300";

    const newItem = new Item({ 
      name,
      code: code ? code.trim().toUpperCase() : '',
      barcode: String(barcode || '').trim(),
      category: category || 'Main Course',
      foodType: foodType || 'veg',
      price: Number(price), 
      image: imageUrl,
      floor: floor || 'Floor 1',
      halfPrice: (halfPrice !== undefined && halfPrice !== null && halfPrice !== '') ? Number(halfPrice) : null,
      description: description || '',
      hsnSac: String(hsnSac || '').trim(),
      taxRate: taxRate === undefined || taxRate === '' ? 5 : Number(taxRate),
      taxCategory: taxCategory || 'taxable',
      addons: Array.isArray(addons) ? addons : (addons ? addons.split(',').map(s => s.trim()).filter(Boolean) : []),
      isCombo: Boolean(isCombo),
      comboItems: Array.isArray(comboItems) ? comboItems : [],
      seasonalTag: String(seasonalTag || '').trim(),
      seasonalFrom: seasonalFrom || null,
      seasonalTill: seasonalTill || null,
      happyHour: happyHour || {}
      ,branchIds: Array.isArray(branchIds) ? branchIds : []
      ,isCentral: isCentral !== false
    });

    await newItem.save();
    res.status(201).json({ success: true, data: newItem });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.get('/export.csv', ...menuManager, async (req, res) => {
  try {
    const items = await Item.find({}).sort({ category: 1, name: 1 }).lean();
    const headers = ['name', 'code', 'barcode', 'category', 'foodType', 'price', 'halfPrice', 'isAvailable', 'isCombo', 'seasonalTag', 'seasonalFrom', 'seasonalTill', 'happyHourStart', 'happyHourEnd', 'happyHourPrice', 'addons'];
    const rows = items.map((item) => headers.map((header) => {
      if (header === 'happyHourStart') return item.happyHour?.start || '';
      if (header === 'happyHourEnd') return item.happyHour?.end || '';
      if (header === 'happyHourPrice') return item.happyHour?.price ?? '';
      if (header === 'addons') return (item.addons || []).map((addon) => typeof addon === 'string' ? addon : `${addon.name}:${addon.price || 0}`).join('|');
      return item[header] ?? '';
    }));
    const csv = [headers, ...rows].map((row) => row.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(',')).join('\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="menu-export.csv"');
    res.send(`\uFEFF${csv}`);
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/import', ...menuManager, async (req, res) => {
  try {
    const rows = Array.isArray(req.body.items) ? req.body.items : [];
    if (!rows.length) return res.status(400).json({ success: false, message: 'Import items are required.' });
    const operations = rows.filter((row) => row.name && Number.isFinite(Number(row.price))).map((row) => ({
      updateOne: {
        filter: row.barcode ? { barcode: String(row.barcode).trim() } : { code: String(row.code || '').trim().toUpperCase(), name: String(row.name).trim() },
        update: { $set: {
          ...row,
          code: String(row.code || '').trim().toUpperCase(),
          price: Number(row.price),
          halfPrice: row.halfPrice ? Number(row.halfPrice) : null,
          isAvailable: row.isAvailable !== false && String(row.isAvailable).toLowerCase() !== 'false',
          isCombo: String(row.isCombo).toLowerCase() === 'true',
          addons: Array.isArray(row.addons) ? row.addons : String(row.addons || '').split('|').filter(Boolean),
          happyHour: { enabled: Boolean(row.happyHourStart || row.happyHourEnd || row.happyHourPrice), start: row.happyHourStart || '', end: row.happyHourEnd || '', price: Number(row.happyHourPrice || 0) }
        } },
        upsert: true
      }
    }));
    const result = await Item.bulkWrite(operations);
    res.json({ success: true, matched: result.matchedCount, upserted: result.upsertedCount });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

// 3. Update Item Availability (86-ing)
router.patch('/toggle/:id', ...availabilityManager, async (req, res) => {
  try {
    const item = await Item.findById(req.params.id);
    if (!item) return res.status(404).json({ message: 'Item not found' });

    item.isAvailable = !item.isAvailable;
    await item.save();

    const io = req.app.get('io');
    if (io) {
      io.emit('menu-item-availability-updated', {
        itemId: item._id,
        isAvailable: item.isAvailable,
        name: item.name
      });
    }

    res.json({ success: true, data: item });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// 4. Update Menu Item Details
router.put('/:id', ...menuManager, async (req, res) => {
  try {
    const updated = await Item.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!updated) return res.status(404).json({ message: 'Item not found' });
    res.json({ success: true, data: updated });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// 5. Delete Menu Item
router.delete('/:id', ...menuManager, async (req, res) => {
  try {
    const deletedItem = await Item.findByIdAndDelete(req.params.id);
    if (!deletedItem) {
      return res.status(404).json({ success: false, message: 'Item nahi mila!' });
    }
    res.json({ success: true, message: 'Item successfully delete ho gaya!' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;