import React, { useState, useEffect } from 'react';
import io from 'socket.io-client';
import { api } from '../api';

const socket = io('http://localhost:5000');

const ExpenseManager = () => {
  const [expenses, setExpenses] = useState([]);
  const [form, setForm] = useState({ 
    title: '', 
    category: 'Kitchen Supplies', 
    amount: '', 
    paidTo: '' 
  });

  const fetchExpenses = async () => {
    try {
      const res = await api.get('/expenses');
      const data = res.data;
      if (Array.isArray(data)) {
        setExpenses(data);
      }
    } catch (err) {
      console.error("Error fetching expenses:", err);
    }
  };

  useEffect(() => {
    fetchExpenses();

    // Listen for real-time updates from backend/database
    socket.on('expense-updated', () => {
      fetchExpenses();
    });

    return () => {
      socket.off('expense-updated');
    };
  }, []);

  const handleAddExpense = async (e) => {
    e.preventDefault();
    if (!form.title || !form.amount) return;
    
    const newExpenseData = {
      ...form,
      amount: Number(form.amount),
      date: new Date().toISOString().split('T')[0]
    };

    try {
      await api.post('/expenses', newExpenseData);
      setForm({ title: '', category: 'Kitchen Supplies', amount: '', paidTo: '' });
      fetchExpenses();
    } catch (err) {
      console.error("Error saving expense:", err);
    }
  };

  const totalExpense = expenses.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-xl font-bold text-gray-800">Expense & Vendor Management</h2>
          <p className="text-sm text-gray-500">Track daily operational cash outflows and supplier accounts in real-time.</p>
        </div>
        <div className="bg-red-50 border border-red-200 px-4 py-2 rounded-xl">
          <span className="text-xs text-red-600 font-medium block">Total Expenses Recorded</span>
          <span className="text-lg font-bold text-red-700">₹{totalExpense}</span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Add Expense Form */}
        <div className="bg-white border rounded-xl p-4 shadow-sm h-fit">
          <h3 className="font-semibold text-gray-800 mb-4">Add New Expense</h3>
          <form onSubmit={handleAddExpense} className="space-y-3">
            <div>
              <label className="text-xs text-gray-600 block mb-1">Expense Title / Description</label>
              <input 
                type="text" 
                className="w-full border rounded p-2 text-sm"
                placeholder="e.g. Milk & Dairy Supply"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
              />
            </div>
            <div>
              <label className="text-xs text-gray-600 block mb-1">Category</label>
              <select 
                className="w-full border rounded p-2 text-sm bg-white"
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
              >
                <option value="Kitchen Supplies">Kitchen Supplies / Groceries</option>
                <option value="Utilities">Utilities (Electricity/Gas)</option>
                <option value="Staff Salary">Staff Advance / Salary</option>
                <option value="Maintenance">Maintenance & Repairs</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-600 block mb-1">Amount (₹)</label>
              <input 
                type="number" 
                className="w-full border rounded p-2 text-sm"
                placeholder="0.00"
                value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
              />
            </div>
            <div>
              <label className="text-xs text-gray-600 block mb-1">Paid To / Vendor Name</label>
              <input 
                type="text" 
                className="w-full border rounded p-2 text-sm"
                placeholder="Vendor or Person name"
                value={form.paidTo}
                onChange={(e) => setForm({ ...form, paidTo: e.target.value })}
              />
            </div>
            <button type="submit" className="w-full bg-blue-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-blue-700 mt-2">
              Save Expense
            </button>
          </form>
        </div>

        {/* Expenses List Table */}
        <div className="lg:col-span-2 bg-white border rounded-xl p-4 shadow-sm">
          <h3 className="font-semibold text-gray-800 mb-4">Database Expenses Log (Live Sync)</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="bg-gray-50 text-gray-600 border-b">
                  <th className="p-3">Title</th>
                  <th className="p-3">Category</th>
                  <th className="p-3">Paid To</th>
                  <th className="p-3">Date</th>
                  <th className="p-3 text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {expenses.length === 0 ? (
                  <tr>
                    <td colSpan="5" className="text-center py-6 text-gray-400">No expenses recorded in database yet.</td>
                  </tr>
                ) : (
                  expenses.map((item) => (
                    <tr key={item._id} className="border-b hover:bg-gray-50">
                      <td className="p-3 font-medium text-gray-800">{item.title}</td>
                      <td className="p-3 text-gray-600">
                        <span className="bg-gray-100 px-2 py-1 rounded text-xs">{item.category}</span>
                      </td>
                      <td className="p-3 text-gray-600">{item.paidTo || 'N/A'}</td>
                      <td className="p-3 text-gray-500 text-xs">{item.date}</td>
                      <td className="p-3 text-right font-bold text-red-600">₹{item.amount}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ExpenseManager;