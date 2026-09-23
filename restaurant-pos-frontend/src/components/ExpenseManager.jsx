import React, { useState, useEffect, useMemo } from 'react';
import io from 'socket.io-client';
import toast from 'react-hot-toast';
import { api } from '../api';
import { playTone, announceAuditEvent } from '../utils/audioAlert';

const socket = io('http://localhost:5000');

// Comprehensive list of standard restaurant expense categories
export const EXPENSE_CATEGORIES = [
  { value: 'Vegetables & Fruits', label: '🥬 Vegetables & Fruits (सब्जी व फल)' },
  { value: 'Dairy & Milk Products', label: '🥛 Dairy & Milk Products (दूध, पनीर, मक्खन, घी)' },
  { value: 'Kitchen Groceries & Spices', label: '🌾 Kitchen Groceries & Spices (किराना व मसाले)' },
  { value: 'Grains, Atta & Pulses', label: '🍚 Grains, Atta & Dal (आटा, चावल, दालें)' },
  { value: 'Commercial LPG Gas', label: '🔥 Commercial LPG Gas (गैस सिलेंडर)' },
  { value: 'Packaging & Disposables', label: '📦 Packaging & Disposables (कंटेनर, फॉयल)' },
  { value: 'Cleaning & Housekeeping', label: '🧹 Cleaning & Chemicals (फिनाइल, सर्फ)' },
  { value: 'Staff Advance & Daily Wages', label: '👥 Staff Advance & Wages (स्टाफ खर्चा/एडवांस)' },
  { value: 'Utilities (Electricity/Water)', label: '⚡ Utilities (बिजली, पानी, वाईफाई)' },
  { value: 'Maintenance & Repairs', label: '🔧 Maintenance & Repairs (मरम्मत और रिपेयर)' },
  { value: 'Marketing & Printing', label: '📢 Marketing & Printing (प्रमोशन/पर्चे)' },
  { value: 'Rent & Licenses', label: '🏢 Rent & Licenses (किराया व लाइसेंस)' },
  { value: 'Kitchen Supplies', label: '🍳 Kitchen Supplies (बर्तन व सामान)' },
  { value: 'Other Misc Expenses', label: '📌 Other Misc Expenses (अन्य फुटकर खर्चे)' }
];

export const PAYMENT_MODES = [
  { value: 'Cash', label: '💵 Cash (Drawer)', badgeClass: 'bg-emerald-100 text-emerald-800 border-emerald-300' },
  { value: 'UPI', label: '📱 UPI / GPay / PhonePe', badgeClass: 'bg-purple-100 text-purple-800 border-purple-300' },
  { value: 'Card', label: '💳 Debit / Credit Card', badgeClass: 'bg-blue-100 text-blue-800 border-blue-300' },
  { value: 'Bank Transfer', label: '🏦 Bank Transfer / NEFT', badgeClass: 'bg-gray-100 text-gray-800 border-gray-300' }
];

const getTodayString = () => new Date().toISOString().split('T')[0];

const getYesterdayString = () => {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().split('T')[0];
};

const getMonthStartString = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
};

const ExpenseManager = () => {
  const [expenses, setExpenses] = useState([]);
  const [loading, setLoading] = useState(false);

  // Form State (for both Add and Edit)
  const [form, setForm] = useState({
    title: '',
    category: 'Vegetables & Fruits',
    amount: '',
    paidTo: '',
    paymentMode: 'Cash',
    billNumber: '',
    notes: '',
    date: getTodayString()
  });

  // Edit Modal State
  const [editingExpense, setEditingExpense] = useState(null);
  const [showEditModal, setShowEditModal] = useState(false);

  // Delete Confirmation State
  const [deleteTarget, setDeleteTarget] = useState(null);

  // Filters State
  const [dateFilter, setDateFilter] = useState('ALL'); // 'ALL' | 'TODAY' | 'YESTERDAY' | 'THIS_MONTH' | 'CUSTOM'
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [paymentModeFilter, setPaymentModeFilter] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // Fetch expenses from database
  const fetchExpenses = async () => {
    setLoading(true);
    try {
      const res = await api.get('/expenses');
      const data = res.data;
      if (Array.isArray(data)) {
        setExpenses(data);
      } else if (data && Array.isArray(data.data)) {
        setExpenses(data.data);
      }
    } catch (err) {
      console.error('Error fetching expenses:', err);
      toast.error('Failed to load expenses from database');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchExpenses();

    // Listen for real-time updates from backend
    const handleExpenseUpdate = () => {
      fetchExpenses();
    };

    socket.on('expense-updated', handleExpenseUpdate);

    return () => {
      socket.off('expense-updated', handleExpenseUpdate);
    };
  }, []);

  // Quick Date Filter Buttons Handler
  const handleDateFilterChange = (filterType) => {
    setDateFilter(filterType);
    const today = getTodayString();
    if (filterType === 'TODAY') {
      setStartDate(today);
      setEndDate(today);
    } else if (filterType === 'YESTERDAY') {
      const yest = getYesterdayString();
      setStartDate(yest);
      setEndDate(yest);
    } else if (filterType === 'THIS_MONTH') {
      setStartDate(getMonthStartString());
      setEndDate(today);
    } else if (filterType === 'ALL') {
      setStartDate('');
      setEndDate('');
    }
  };

  // Add New Expense
  const handleAddExpense = async (e) => {
    e.preventDefault();
    if (!form.title.trim()) {
      toast.error('Please enter an expense title');
      playTone('warning');
      return;
    }
    const numAmt = Number(form.amount);
    if (!numAmt || numAmt <= 0) {
      toast.error('Please enter a valid amount greater than ₹0');
      playTone('warning');
      return;
    }

    const payload = {
      title: form.title.trim(),
      category: form.category,
      amount: numAmt,
      paidTo: form.paidTo.trim(),
      paymentMode: form.paymentMode,
      billNumber: form.billNumber.trim(),
      notes: form.notes.trim(),
      date: form.date || getTodayString()
    };

    try {
      await api.post('/expenses', payload);
      toast.success(`Expense ₹${numAmt} saved successfully!`);
      announceAuditEvent('EXPENSE_ADDED', { amount: numAmt });

      // Reset form
      setForm({
        title: '',
        category: 'Vegetables & Fruits',
        amount: '',
        paidTo: '',
        paymentMode: 'Cash',
        billNumber: '',
        notes: '',
        date: getTodayString()
      });
      fetchExpenses();
    } catch (err) {
      console.error('Error saving expense:', err);
      toast.error(err.response?.data?.error || 'Failed to record expense');
      playTone('warning');
    }
  };

  // Open Edit Modal
  const startEdit = (expense) => {
    setEditingExpense({
      _id: expense._id,
      title: expense.title || '',
      category: expense.category || 'Vegetables & Fruits',
      amount: expense.amount || '',
      paidTo: expense.paidTo || '',
      paymentMode: expense.paymentMode || 'Cash',
      billNumber: expense.billNumber || '',
      notes: expense.notes || '',
      date: expense.date || getTodayString()
    });
    setShowEditModal(true);
  };

  // Submit Edit
  const handleSaveEdit = async (e) => {
    e.preventDefault();
    if (!editingExpense.title.trim()) {
      toast.error('Title cannot be empty');
      return;
    }
    const numAmt = Number(editingExpense.amount);
    if (!numAmt || numAmt <= 0) {
      toast.error('Valid amount is required');
      return;
    }

    try {
      await api.put(`/expenses/${editingExpense._id}`, {
        ...editingExpense,
        amount: numAmt
      });
      toast.success('Expense updated successfully');
      announceAuditEvent('EXPENSE_UPDATED');
      setShowEditModal(false);
      setEditingExpense(null);
      fetchExpenses();
    } catch (err) {
      console.error('Error updating expense:', err);
      toast.error(err.response?.data?.error || 'Failed to update expense');
    }
  };

  // Delete Expense Handler
  const confirmDeleteExpense = async () => {
    if (!deleteTarget) return;
    try {
      await api.delete(`/expenses/${deleteTarget._id}`);
      toast.success(`Expense "${deleteTarget.title}" deleted`);
      announceAuditEvent('EXPENSE_DELETED');
      setDeleteTarget(null);
      fetchExpenses();
    } catch (err) {
      console.error('Error deleting expense:', err);
      toast.error(err.response?.data?.error || 'Failed to delete expense');
    }
  };

  // Filtered Expenses Computation
  const filteredExpenses = useMemo(() => {
    return expenses.filter((item) => {
      // Date filter
      if (startDate && item.date < startDate) return false;
      if (endDate && item.date > endDate) return false;

      // Category filter
      if (categoryFilter !== 'ALL' && item.category !== categoryFilter) {
        return false;
      }

      // Payment Mode filter
      if (paymentModeFilter !== 'ALL') {
        const itemMode = item.paymentMode || 'Cash';
        if (itemMode !== paymentModeFilter) return false;
      }

      // Search Query filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const titleMatch = (item.title || '').toLowerCase().includes(q);
        const paidToMatch = (item.paidTo || '').toLowerCase().includes(q);
        const billMatch = (item.billNumber || '').toLowerCase().includes(q);
        const notesMatch = (item.notes || '').toLowerCase().includes(q);
        const catMatch = (item.category || '').toLowerCase().includes(q);
        if (!titleMatch && !paidToMatch && !billMatch && !notesMatch && !catMatch) {
          return false;
        }
      }

      return true;
    });
  }, [expenses, startDate, endDate, categoryFilter, paymentModeFilter, searchQuery]);

  // Financial Stats Calculation on filtered list
  const stats = useMemo(() => {
    let total = 0;
    let cash = 0;
    let upi = 0;
    let card = 0;
    let bank = 0;

    filteredExpenses.forEach((item) => {
      const amt = Number(item.amount) || 0;
      total += amt;
      const mode = item.paymentMode || 'Cash';
      if (mode === 'Cash') cash += amt;
      else if (mode === 'UPI') upi += amt;
      else if (mode === 'Card') card += amt;
      else if (mode === 'Bank Transfer') bank += amt;
    });

    return {
      total,
      cash,
      upi,
      card,
      bank,
      online: upi + card + bank,
      count: filteredExpenses.length
    };
  }, [filteredExpenses]);

  // Export to CSV Function
  const exportToCSV = () => {
    if (filteredExpenses.length === 0) {
      toast.error('No expenses to export');
      return;
    }

    const headers = ['Date', 'Bill / Voucher No', 'Title', 'Category', 'Amount (INR)', 'Payment Mode', 'Paid To / Vendor', 'Recorded By', 'Notes'];
    const rows = filteredExpenses.map((e) => [
      `"${e.date || ''}"`,
      `"${(e.billNumber || '').replace(/"/g, '""')}"`,
      `"${(e.title || '').replace(/"/g, '""')}"`,
      `"${(e.category || '').replace(/"/g, '""')}"`,
      e.amount || 0,
      `"${e.paymentMode || 'Cash'}"`,
      `"${(e.paidTo || '').replace(/"/g, '""')}"`,
      `"${(e.recordedByName || 'Staff').replace(/"/g, '""')}"`,
      `"${(e.notes || '').replace(/"/g, '""')}"`
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    const filename = `Tamanna_Restaurant_Expenses_${getTodayString()}.csv`;
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success('Expense report downloaded as CSV');
    playTone('success');
  };

  return (
    <div style={{ flex: 1, minHeight: 0, height: '100%', width: '100%', boxSizing: 'border-box', background: '#f8fafc', overflowY: 'auto', padding: '24px 28px' }}>
      
      {/* Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div>
          <div className="flex items-center gap-3">
            <span className="text-2xl">💸</span>
            <h2 className="text-2xl font-bold text-gray-800 tracking-tight">Expense & Vendor Management</h2>
            <span className="bg-emerald-100 text-emerald-800 text-xs px-2.5 py-0.8 rounded-full font-semibold border border-emerald-200">
              Live Database
            </span>
          </div>
          <p className="text-sm text-gray-500 mt-1">
            Track daily cash drawer petty expenses, vendor invoices, utility bills & staff advances.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={exportToCSV}
            className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-xl text-sm font-semibold shadow-sm transition-all"
            title="Download Excel / CSV of current filtered expenses"
          >
            <span>📥 Export CSV</span>
          </button>
          <button
            onClick={fetchExpenses}
            className="flex items-center gap-2 bg-white hover:bg-gray-50 border border-gray-300 text-gray-700 px-3.5 py-2 rounded-xl text-sm font-medium shadow-sm transition-all"
            title="Refresh database records"
          >
            <span>🔄 {loading ? 'Syncing...' : 'Sync'}</span>
          </button>
        </div>
      </div>

      {/* KPI Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {/* Total Expenses */}
        <div className="bg-white border border-red-100 rounded-2xl p-4 shadow-xs relative overflow-hidden">
          <div className="absolute top-0 left-0 w-1.5 h-full bg-red-500"></div>
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Total Expenses</span>
            <span className="bg-red-50 text-red-700 text-xs px-2 py-0.5 rounded-full font-bold">{stats.count} bills</span>
          </div>
          <div className="text-2xl font-extrabold text-red-700 mt-2">
            ₹{stats.total.toLocaleString('en-IN')}
          </div>
          <span className="text-[11px] text-gray-400 mt-0.5 block">Sum of all filtered records</span>
        </div>

        {/* Cash Drawer Impact */}
        <div className="bg-white border border-emerald-100 rounded-2xl p-4 shadow-xs relative overflow-hidden">
          <div className="absolute top-0 left-0 w-1.5 h-full bg-emerald-500"></div>
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Cash (Drawer Outflow)</span>
            <span className="text-sm">💵</span>
          </div>
          <div className="text-2xl font-extrabold text-emerald-700 mt-2">
            ₹{stats.cash.toLocaleString('en-IN')}
          </div>
          <span className="text-[11px] text-emerald-600 font-medium mt-0.5 block">Deducted from Shift Cash Drawer</span>
        </div>

        {/* UPI / GPay / PhonePe */}
        <div className="bg-white border border-purple-100 rounded-2xl p-4 shadow-xs relative overflow-hidden">
          <div className="absolute top-0 left-0 w-1.5 h-full bg-purple-500"></div>
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">UPI / GPay / PhonePe</span>
            <span className="text-sm">📱</span>
          </div>
          <div className="text-2xl font-extrabold text-purple-700 mt-2">
            ₹{stats.upi.toLocaleString('en-IN')}
          </div>
          <span className="text-[11px] text-purple-600 font-medium mt-0.5 block">Bank account online outflow</span>
        </div>

        {/* Card & Bank Transfer */}
        <div className="bg-white border border-blue-100 rounded-2xl p-4 shadow-xs relative overflow-hidden">
          <div className="absolute top-0 left-0 w-1.5 h-full bg-blue-500"></div>
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Card & Bank Transfer</span>
            <span className="text-sm">💳</span>
          </div>
          <div className="text-2xl font-extrabold text-blue-700 mt-2">
            ₹{(stats.card + stats.bank).toLocaleString('en-IN')}
          </div>
          <span className="text-[11px] text-gray-400 mt-0.5 block">Card: ₹{stats.card} | Bank: ₹{stats.bank}</span>
        </div>
      </div>

      {/* Main Grid: Add Form (Left) & Expense Table + Filters (Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

        {/* LEFT COLUMN: Add Expense Form */}
        <div className="lg:col-span-4 bg-white border border-gray-200 rounded-2xl p-5 shadow-xs h-fit">
          <div className="flex items-center gap-2 mb-4 pb-3 border-b border-gray-100">
            <span className="text-lg">➕</span>
            <div>
              <h3 className="font-bold text-gray-800 text-base leading-tight">Record New Expense</h3>
              <p className="text-xs text-gray-500">Fill in expense details to store in database</p>
            </div>
          </div>

          <form onSubmit={handleAddExpense} className="space-y-3.5">
            {/* Title */}
            <div>
              <label className="text-xs font-semibold text-gray-700 block mb-1">
                Expense Title / Description <span className="text-red-500">*</span>
              </label>
              <input 
                type="text" 
                required
                className="w-full border border-gray-300 rounded-xl p-2.5 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                placeholder="e.g. 10L Milk & 2kg Paneer"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
              />
            </div>

            {/* Category Dropdown */}
            <div>
              <label className="text-xs font-semibold text-gray-700 block mb-1">
                Category <span className="text-red-500">*</span>
              </label>
              <select 
                className="w-full border border-gray-300 rounded-xl p-2.5 text-sm bg-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
              >
                {EXPENSE_CATEGORIES.map((cat) => (
                  <option key={cat.value} value={cat.value}>{cat.label}</option>
                ))}
              </select>
            </div>

            {/* Amount & Date in 2 columns */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-gray-700 block mb-1">
                  Amount (₹) <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-2.5 text-gray-400 font-bold text-sm">₹</span>
                  <input 
                    type="number" 
                    required
                    min="1"
                    step="any"
                    className="w-full border border-gray-300 rounded-xl py-2.5 pl-8 pr-2.5 text-sm font-semibold focus:ring-2 focus:ring-blue-500 focus:outline-none"
                    placeholder="0.00"
                    value={form.amount}
                    onChange={(e) => setForm({ ...form, amount: e.target.value })}
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-700 block mb-1">
                  Expense Date <span className="text-red-500">*</span>
                </label>
                <input 
                  type="date" 
                  required
                  className="w-full border border-gray-300 rounded-xl p-2.5 text-sm bg-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  value={form.date}
                  onChange={(e) => setForm({ ...form, date: e.target.value })}
                />
              </div>
            </div>

            {/* Payment Mode (Cash Drawer vs Online) */}
            <div>
              <label className="text-xs font-semibold text-gray-700 block mb-1.5">
                Payment Mode <span className="text-red-500">*</span>
              </label>
              <div className="grid grid-cols-2 gap-2">
                {PAYMENT_MODES.map((pm) => (
                  <button
                    key={pm.value}
                    type="button"
                    onClick={() => setForm({ ...form, paymentMode: pm.value })}
                    className={`py-2 px-2.5 rounded-xl text-xs font-medium text-left border transition-all ${
                      form.paymentMode === pm.value 
                        ? 'border-blue-600 bg-blue-50 text-blue-800 font-semibold shadow-xs' 
                        : 'border-gray-200 bg-gray-50 text-gray-600 hover:bg-gray-100'
                    }`}
                  >
                    {pm.label}
                  </button>
                ))}
              </div>
              {form.paymentMode === 'Cash' ? (
                <p className="text-[11px] text-emerald-600 font-medium mt-1.5 flex items-center gap-1">
                  ✓ This will automatically deduct from Cashier Shift drawer.
                </p>
              ) : (
                <p className="text-[11px] text-blue-600 font-medium mt-1.5 flex items-center gap-1">
                  ℹ️ Online payment - does NOT deduct from cashier drawer cash.
                </p>
              )}
            </div>

            {/* Vendor Name & Bill Number */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-gray-700 block mb-1">
                  Paid To / Vendor
                </label>
                <input 
                  type="text" 
                  className="w-full border border-gray-300 rounded-xl p-2.5 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  placeholder="e.g. Mahak Dairy"
                  value={form.paidTo}
                  onChange={(e) => setForm({ ...form, paidTo: e.target.value })}
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-700 block mb-1">
                  Invoice / Bill No.
                </label>
                <input 
                  type="text" 
                  className="w-full border border-gray-300 rounded-xl p-2.5 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  placeholder="e.g. INV-1049"
                  value={form.billNumber}
                  onChange={(e) => setForm({ ...form, billNumber: e.target.value })}
                />
              </div>
            </div>

            {/* Notes / Remarks */}
            <div>
              <label className="text-xs font-semibold text-gray-700 block mb-1">
                Notes / Purpose (Optional)
              </label>
              <textarea 
                rows="2"
                className="w-full border border-gray-300 rounded-xl p-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                placeholder="Additional notes, item details or reasons..."
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
              />
            </div>

            <button 
              type="submit" 
              className="w-full bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white py-3 rounded-xl text-sm font-bold shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2 mt-4"
            >
              <span>💾 Save Expense Record</span>
            </button>
          </form>
        </div>

        {/* RIGHT COLUMN: Search, Filters & Log Table */}
        <div className="lg:col-span-8 bg-white border border-gray-200 rounded-2xl p-5 shadow-xs flex flex-col">
          
          {/* Filter Toolbar */}
          <div className="mb-4 space-y-3 pb-4 border-b border-gray-100">
            {/* Quick Date Pills */}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 bg-gray-100 p-1 rounded-xl text-xs font-medium">
                {[
                  { id: 'ALL', label: 'All Time' },
                  { id: 'TODAY', label: 'Today' },
                  { id: 'YESTERDAY', label: 'Yesterday' },
                  { id: 'THIS_MONTH', label: 'This Month' },
                  { id: 'CUSTOM', label: 'Custom Range' }
                ].map((pill) => (
                  <button
                    key={pill.id}
                    onClick={() => handleDateFilterChange(pill.id)}
                    className={`px-3 py-1.5 rounded-lg transition-all ${
                      dateFilter === pill.id
                        ? 'bg-white text-gray-900 font-bold shadow-xs'
                        : 'text-gray-600 hover:text-gray-900'
                    }`}
                  >
                    {pill.label}
                  </button>
                ))}
              </div>

              <span className="text-xs text-gray-400 font-medium">
                Showing {filteredExpenses.length} of {expenses.length} records
              </span>
            </div>

            {/* Custom Date Range Pickers if CUSTOM selected */}
            {dateFilter === 'CUSTOM' && (
              <div className="flex items-center gap-3 bg-blue-50 border border-blue-200 p-2.5 rounded-xl">
                <span className="text-xs font-bold text-blue-900">Custom Date:</span>
                <input 
                  type="date"
                  className="border border-blue-300 rounded-lg p-1.5 text-xs bg-white"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
                <span className="text-xs text-blue-700 font-medium">to</span>
                <input 
                  type="date"
                  className="border border-blue-300 rounded-lg p-1.5 text-xs bg-white"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                />
                {(startDate || endDate) && (
                  <button 
                    onClick={() => { setStartDate(''); setEndDate(''); }}
                    className="text-xs text-red-600 hover:underline font-semibold ml-auto"
                  >
                    Clear Dates
                  </button>
                )}
              </div>
            )}

            {/* Search Input, Category Filter & Payment Mode Filter */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              {/* Search Box */}
              <div className="relative">
                <span className="absolute left-3 top-2.5 text-gray-400 text-xs">🔍</span>
                <input 
                  type="text"
                  placeholder="Search title, vendor, bill #..."
                  className="w-full border border-gray-200 rounded-xl py-2 pl-8 pr-3 text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
                {searchQuery && (
                  <button 
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2.5 top-2 text-gray-400 hover:text-gray-600 text-xs"
                  >
                    ✕
                  </button>
                )}
              </div>

              {/* Category Dropdown Filter */}
              <div>
                <select
                  className="w-full border border-gray-200 rounded-xl py-2 px-3 text-xs bg-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  value={categoryFilter}
                  onChange={(e) => setCategoryFilter(e.target.value)}
                >
                  <option value="ALL">📂 All Categories</option>
                  {EXPENSE_CATEGORIES.map((c) => (
                    <option key={c.value} value={c.value}>{c.value}</option>
                  ))}
                </select>
              </div>

              {/* Payment Mode Filter */}
              <div>
                <select
                  className="w-full border border-gray-200 rounded-xl py-2 px-3 text-xs bg-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  value={paymentModeFilter}
                  onChange={(e) => setPaymentModeFilter(e.target.value)}
                >
                  <option value="ALL">💳 All Payment Modes</option>
                  <option value="Cash">💵 Cash (Drawer Only)</option>
                  <option value="UPI">📱 UPI / Online</option>
                  <option value="Card">💳 Card</option>
                  <option value="Bank Transfer">🏦 Bank Transfer</option>
                </select>
              </div>
            </div>
          </div>

          {/* Expenses Table */}
          <div className="overflow-x-auto flex-1 rounded-xl border border-gray-100">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-gray-50/80 text-gray-600 border-b border-gray-200 uppercase font-bold text-[10px] tracking-wider">
                  <th className="p-3">Date / Bill #</th>
                  <th className="p-3">Expense Details</th>
                  <th className="p-3">Category</th>
                  <th className="p-3">Paid To / Staff</th>
                  <th className="p-3">Mode</th>
                  <th className="p-3 text-right">Amount</th>
                  <th className="p-3 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredExpenses.length === 0 ? (
                  <tr>
                    <td colSpan="7" className="text-center py-12 text-gray-400">
                      <div className="flex flex-col items-center justify-center">
                        <span className="text-3xl mb-2">🧾</span>
                        <span className="font-semibold text-gray-600">No matching expense records found</span>
                        <span className="text-xs text-gray-400 mt-0.5">Try clearing filters or add a new expense on the left</span>
                      </div>
                    </td>
                  </tr>
                ) : (
                  filteredExpenses.map((item) => {
                    const modeObj = PAYMENT_MODES.find(m => m.value === (item.paymentMode || 'Cash')) || PAYMENT_MODES[0];
                    return (
                      <tr key={item._id} className="hover:bg-blue-50/40 transition-colors">
                        {/* Date & Bill No */}
                        <td className="p-3 whitespace-nowrap">
                          <span className="font-semibold text-gray-800 block">{item.date || 'N/A'}</span>
                          {item.billNumber ? (
                            <span className="bg-gray-100 text-gray-600 text-[10px] px-1.5 py-0.5 rounded font-mono">
                              #{item.billNumber}
                            </span>
                          ) : (
                            <span className="text-[10px] text-gray-400 italic">No Bill #</span>
                          )}
                        </td>

                        {/* Title & Notes */}
                        <td className="p-3">
                          <span className="font-bold text-gray-900 text-sm block leading-snug">{item.title}</span>
                          {item.notes && (
                            <p className="text-gray-500 text-[11px] line-clamp-1 italic mt-0.5" title={item.notes}>
                              "{item.notes}"
                            </p>
                          )}
                        </td>

                        {/* Category */}
                        <td className="p-3 whitespace-nowrap">
                          <span className="bg-slate-100 text-slate-700 px-2.5 py-1 rounded-full text-[11px] font-medium border border-slate-200">
                            {item.category}
                          </span>
                        </td>

                        {/* Paid To & Recorded By */}
                        <td className="p-3">
                          <span className="text-gray-800 font-medium block">
                            {item.paidTo || <span className="text-gray-400 italic">N/A</span>}
                          </span>
                          <span className="text-[10px] text-gray-400 block mt-0.5">
                            By: {item.recordedByName || 'Staff'}
                          </span>
                        </td>

                        {/* Mode */}
                        <td className="p-3 whitespace-nowrap">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${modeObj.badgeClass}`}>
                            {modeObj.value}
                          </span>
                        </td>

                        {/* Amount */}
                        <td className="p-3 text-right whitespace-nowrap font-extrabold text-red-600 text-sm">
                          ₹{Number(item.amount).toLocaleString('en-IN')}
                        </td>

                        {/* Actions */}
                        <td className="p-3 text-center whitespace-nowrap">
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              onClick={() => startEdit(item)}
                              className="p-1.5 text-blue-600 hover:bg-blue-100 rounded-lg transition-all"
                              title="Edit Expense"
                            >
                              ✏️
                            </button>
                            <button
                              onClick={() => setDeleteTarget(item)}
                              className="p-1.5 text-red-600 hover:bg-red-100 rounded-lg transition-all"
                              title="Delete Expense"
                            >
                              🗑️
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Table Footer with Summary */}
          {filteredExpenses.length > 0 && (
            <div className="mt-3 pt-3 border-t border-gray-100 flex flex-col sm:flex-row justify-between items-center text-xs text-gray-500 gap-2">
              <span>Showing <strong>{filteredExpenses.length}</strong> recorded expenditures</span>
              <div className="flex items-center gap-4">
                <span>Cash Outflow: <strong className="text-emerald-700">₹{stats.cash.toLocaleString('en-IN')}</strong></span>
                <span>Online Outflow: <strong className="text-purple-700">₹{stats.online.toLocaleString('en-IN')}</strong></span>
                <span className="font-bold text-gray-800">Filtered Total: <strong className="text-red-700 text-sm">₹{stats.total.toLocaleString('en-IN')}</strong></span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* EDIT MODAL DIALOG */}
      {showEditModal && editingExpense && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full border border-gray-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="bg-blue-600 text-white px-6 py-4 flex justify-between items-center">
              <div>
                <h3 className="font-bold text-base">✏️ Edit Expense Record</h3>
                <p className="text-xs text-blue-100">Update expense details and update accounts</p>
              </div>
              <button 
                onClick={() => { setShowEditModal(false); setEditingExpense(null); }}
                className="text-white/80 hover:text-white text-lg font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="p-6 space-y-4">
              <div>
                <label className="text-xs font-semibold text-gray-700 block mb-1">Expense Title</label>
                <input 
                  type="text" 
                  required
                  className="w-full border border-gray-300 rounded-xl p-2.5 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  value={editingExpense.title}
                  onChange={(e) => setEditingExpense({ ...editingExpense, title: e.target.value })}
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-700 block mb-1">Category</label>
                <select 
                  className="w-full border border-gray-300 rounded-xl p-2.5 text-sm bg-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  value={editingExpense.category}
                  onChange={(e) => setEditingExpense({ ...editingExpense, category: e.target.value })}
                >
                  {EXPENSE_CATEGORIES.map((c) => (
                    <option key={c.value} value={c.value}>{c.label}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-gray-700 block mb-1">Amount (₹)</label>
                  <input 
                    type="number" 
                    required
                    min="1"
                    step="any"
                    className="w-full border border-gray-300 rounded-xl p-2.5 text-sm font-bold text-red-600 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                    value={editingExpense.amount}
                    onChange={(e) => setEditingExpense({ ...editingExpense, amount: e.target.value })}
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-700 block mb-1">Date</label>
                  <input 
                    type="date" 
                    required
                    className="w-full border border-gray-300 rounded-xl p-2.5 text-sm bg-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
                    value={editingExpense.date}
                    onChange={(e) => setEditingExpense({ ...editingExpense, date: e.target.value })}
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-700 block mb-1">Payment Mode</label>
                <select 
                  className="w-full border border-gray-300 rounded-xl p-2.5 text-sm bg-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  value={editingExpense.paymentMode}
                  onChange={(e) => setEditingExpense({ ...editingExpense, paymentMode: e.target.value })}
                >
                  {PAYMENT_MODES.map((pm) => (
                    <option key={pm.value} value={pm.value}>{pm.label}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-gray-700 block mb-1">Paid To / Vendor</label>
                  <input 
                    type="text" 
                    className="w-full border border-gray-300 rounded-xl p-2.5 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                    value={editingExpense.paidTo}
                    onChange={(e) => setEditingExpense({ ...editingExpense, paidTo: e.target.value })}
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-700 block mb-1">Invoice / Bill No.</label>
                  <input 
                    type="text" 
                    className="w-full border border-gray-300 rounded-xl p-2.5 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                    value={editingExpense.billNumber}
                    onChange={(e) => setEditingExpense({ ...editingExpense, billNumber: e.target.value })}
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-700 block mb-1">Notes / Remarks</label>
                <textarea 
                  rows="2"
                  className="w-full border border-gray-300 rounded-xl p-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  value={editingExpense.notes}
                  onChange={(e) => setEditingExpense({ ...editingExpense, notes: e.target.value })}
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => { setShowEditModal(false); setEditingExpense(null); }}
                  className="px-4 py-2 border border-gray-300 text-gray-700 rounded-xl text-sm font-semibold hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-bold shadow-md"
                >
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DELETE CONFIRMATION MODAL */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full border border-gray-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="p-6">
              <div className="w-12 h-12 rounded-full bg-red-100 text-red-600 flex items-center justify-center text-xl mb-4 mx-auto">
                🗑️
              </div>
              <h3 className="font-bold text-center text-gray-900 text-lg mb-1">Delete Expense Record?</h3>
              <p className="text-xs text-center text-gray-500 mb-4">
                Are you sure you want to permanently delete this expense? This action will update accounts and be logged in the audit trail.
              </p>

              <div className="bg-gray-50 border border-gray-200 rounded-xl p-3.5 mb-5 text-xs space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-gray-500">Title:</span>
                  <span className="font-bold text-gray-800">{deleteTarget.title}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Category:</span>
                  <span className="text-gray-700 font-medium">{deleteTarget.category}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Amount:</span>
                  <span className="font-bold text-red-600 text-sm">₹{deleteTarget.amount}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Mode:</span>
                  <span className="text-gray-700 font-medium">{deleteTarget.paymentMode || 'Cash'}</span>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setDeleteTarget(null)}
                  className="flex-1 py-2.5 border border-gray-300 text-gray-700 rounded-xl text-sm font-semibold hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={confirmDeleteExpense}
                  className="flex-1 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-xl text-sm font-bold shadow-md transition-colors"
                >
                  Yes, Delete
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default ExpenseManager;