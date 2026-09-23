const express = require('express');
const router = express.Router();
const Expense = require('../models/Expense');
const { logAudit } = require('../utils/auditLogger');

// Helper to escape regex special characters
const escapeRegex = (text) => text.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');

// GET /api/expenses/stats - Aggregated metrics & category breakdown
router.get('/stats', async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const filter = {};
    if (startDate && endDate) {
      filter.date = { $gte: String(startDate), $lte: String(endDate) };
    } else if (startDate) {
      filter.date = { $gte: String(startDate) };
    } else if (endDate) {
      filter.date = { $lte: String(endDate) };
    }

    const expenses = await Expense.find(filter);

    let totalAmount = 0;
    let cashAmount = 0;
    let upiAmount = 0;
    let cardAmount = 0;
    let bankTransferAmount = 0;
    const categoryTotals = {};

    expenses.forEach((item) => {
      const amt = Number(item.amount) || 0;
      totalAmount += amt;

      const mode = item.paymentMode || 'Cash';
      if (mode === 'Cash') cashAmount += amt;
      else if (mode === 'UPI') upiAmount += amt;
      else if (mode === 'Card') cardAmount += amt;
      else if (mode === 'Bank Transfer') bankTransferAmount += amt;

      const cat = item.category || 'Other';
      categoryTotals[cat] = (categoryTotals[cat] || 0) + amt;
    });

    const categoryBreakdown = Object.entries(categoryTotals)
      .map(([category, total]) => ({ category, total }))
      .sort((a, b) => b.total - a.total);

    res.json({
      success: true,
      data: {
        totalCount: expenses.length,
        totalAmount,
        cashAmount,
        upiAmount,
        cardAmount,
        bankTransferAmount,
        onlineTotal: upiAmount + cardAmount + bankTransferAmount,
        categoryBreakdown
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/expenses - Get all expenses with advanced filtering & search
router.get('/', async (req, res) => {
  try {
    const { startDate, endDate, category, paymentMode, search, q } = req.query;
    const filter = {};

    // Date range filter
    if (startDate && endDate) {
      filter.date = { $gte: String(startDate), $lte: String(endDate) };
    } else if (startDate) {
      filter.date = { $gte: String(startDate) };
    } else if (endDate) {
      filter.date = { $lte: String(endDate) };
    }

    // Category filter
    if (category && category !== 'All') {
      filter.category = category;
    }

    // Payment mode filter
    if (paymentMode && paymentMode !== 'All') {
      if (paymentMode === 'Cash') {
        filter.$or = [
          { paymentMode: 'Cash' },
          { paymentMode: { $exists: false } },
          { paymentMode: null }
        ];
      } else {
        filter.paymentMode = paymentMode;
      }
    }

    // Keyword search filter (title, paidTo, billNumber, notes)
    const searchTerm = (search || q || '').trim();
    if (searchTerm) {
      const regex = new RegExp(escapeRegex(searchTerm), 'i');
      const searchConditions = [
        { title: regex },
        { paidTo: regex },
        { billNumber: regex },
        { notes: regex }
      ];

      if (filter.$or) {
        filter.$and = [
          { $or: filter.$or },
          { $or: searchConditions }
        ];
        delete filter.$or;
      } else {
        filter.$or = searchConditions;
      }
    }

    const expenses = await Expense.find(filter).sort({ date: -1, createdAt: -1 });
    res.json(expenses);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/expenses - Add new expense
router.post('/', async (req, res) => {
  try {
    const {
      title,
      category,
      amount,
      paidTo,
      paymentMode,
      billNumber,
      notes,
      date
    } = req.body;

    if (!title || !title.trim()) {
      return res.status(400).json({ error: 'Expense title is required' });
    }

    const numericAmount = Number(amount);
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      return res.status(400).json({ error: 'Valid expense amount greater than 0 is required' });
    }

    if (!category || !category.trim()) {
      return res.status(400).json({ error: 'Expense category is required' });
    }

    const expenseDate = date || new Date().toISOString().split('T')[0];

    const newExpense = new Expense({
      title: title.trim(),
      category: category.trim(),
      amount: numericAmount,
      paidTo: (paidTo || '').trim(),
      paymentMode: ['Cash', 'UPI', 'Card', 'Bank Transfer'].includes(paymentMode) ? paymentMode : 'Cash',
      billNumber: (billNumber || '').trim(),
      notes: (notes || '').trim(),
      date: expenseDate,
      recordedBy: req.user?._id || null,
      recordedByName: req.user?.name || req.user?.username || 'Staff'
    });

    const savedExpense = await newExpense.save();

    // Trigger real-time update via Socket.io
    const io = req.app.get('io');
    if (io) {
      io.emit('expense-updated', savedExpense);
    }

    // Audit log
    await logAudit({
      action: 'EXPENSE_ADDED',
      resource: 'Expense',
      resourceId: String(savedExpense._id),
      user: req.user,
      metadata: {
        title: savedExpense.title,
        amount: savedExpense.amount,
        category: savedExpense.category,
        paymentMode: savedExpense.paymentMode,
        paidTo: savedExpense.paidTo,
        billNumber: savedExpense.billNumber
      },
      req
    });

    res.status(201).json(savedExpense);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/expenses/:id - Update an existing expense
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const expense = await Expense.findById(id);

    if (!expense) {
      return res.status(404).json({ error: 'Expense record not found' });
    }

    const {
      title,
      category,
      amount,
      paidTo,
      paymentMode,
      billNumber,
      notes,
      date
    } = req.body;

    if (title !== undefined) {
      if (!title || !title.trim()) return res.status(400).json({ error: 'Title cannot be empty' });
      expense.title = title.trim();
    }

    if (category !== undefined) {
      if (!category || !category.trim()) return res.status(400).json({ error: 'Category cannot be empty' });
      expense.category = category.trim();
    }

    if (amount !== undefined) {
      const numAmt = Number(amount);
      if (!Number.isFinite(numAmt) || numAmt <= 0) {
        return res.status(400).json({ error: 'Amount must be greater than 0' });
      }
      expense.amount = numAmt;
    }

    if (paidTo !== undefined) expense.paidTo = (paidTo || '').trim();
    if (paymentMode !== undefined && ['Cash', 'UPI', 'Card', 'Bank Transfer'].includes(paymentMode)) {
      expense.paymentMode = paymentMode;
    }
    if (billNumber !== undefined) expense.billNumber = (billNumber || '').trim();
    if (notes !== undefined) expense.notes = (notes || '').trim();
    if (date !== undefined && date) expense.date = date;

    const updatedExpense = await expense.save();

    // Socket.io notification
    const io = req.app.get('io');
    if (io) {
      io.emit('expense-updated', updatedExpense);
    }

    // Audit log
    await logAudit({
      action: 'EXPENSE_UPDATED',
      resource: 'Expense',
      resourceId: String(updatedExpense._id),
      user: req.user,
      metadata: {
        title: updatedExpense.title,
        amount: updatedExpense.amount,
        category: updatedExpense.category,
        paymentMode: updatedExpense.paymentMode,
        paidTo: updatedExpense.paidTo
      },
      req
    });

    res.json(updatedExpense);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/expenses/:id - Delete an expense
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const expense = await Expense.findById(id);

    if (!expense) {
      return res.status(404).json({ error: 'Expense record not found' });
    }

    const deletedData = {
      title: expense.title,
      amount: expense.amount,
      category: expense.category,
      paymentMode: expense.paymentMode
    };

    await Expense.findByIdAndDelete(id);

    // Socket.io notification
    const io = req.app.get('io');
    if (io) {
      io.emit('expense-updated', { deletedId: id });
    }

    // Audit log
    await logAudit({
      action: 'EXPENSE_DELETED',
      resource: 'Expense',
      resourceId: String(id),
      user: req.user,
      metadata: deletedData,
      req
    });

    res.json({ success: true, message: 'Expense deleted successfully', id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;