const express = require('express');
const router = express.Router();
const Expense = require('../models/Expense');

// Get all expenses from MongoDB
router.get('/', async (req, res) => {
  try {
    const expenses = await Expense.find().sort({ createdAt: -1 });
    res.json(expenses);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Add new expense and emit socket event
router.post('/', async (req, res) => {
  try {
    const newExpense = new Expense(req.body);
    const savedExpense = await newExpense.save();
    
    // Trigger real-time update via Socket.io
    const io = req.app.get('io');
    if (io) {
      io.emit('expense-updated');
    }

    res.json(savedExpense);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;