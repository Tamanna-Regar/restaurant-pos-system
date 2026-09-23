import React, { useState, useEffect } from 'react';
import { api } from '../api';

export default function SupplierPortal() {
  const [suppliers, setSuppliers] = useState([]);
  const [selectedSupplier, setSelectedSupplier] = useState('');
  const [orders, setOrders] = useState([]);
  const [ledger, setLedger] = useState(null);
  const [loading, setLoading] = useState(false);
  const [actionMessage, setActionMessage] = useState('');

  // Load suppliers list
  useEffect(() => {
    api.get('/suppliers')
      .then(res => {
        const list = res.data?.data || [];
        setSuppliers(list);
        if (list.length > 0) {
          setSelectedSupplier(list[0].name);
        }
      })
      .catch(err => console.error('Failed to load suppliers:', err));
  }, []);

  // Load POs and ledger for selected supplier
  const loadSupplierData = async (name) => {
    if (!name) return;
    setLoading(true);
    try {
      const [posRes, ledgerRes] = await Promise.all([
        api.get('/purchase-orders').catch(() => ({ data: { data: [] } })),
        api.get(`/suppliers/ledger?supplierName=${encodeURIComponent(name)}`).catch(() => ({ data: { data: null } }))
      ]);

      const allOrders = posRes.data?.data || [];
      const supplierOrders = allOrders.filter(
        o => (o.supplierName || '').trim().toLowerCase() === name.trim().toLowerCase()
      );

      setOrders(supplierOrders);
      setLedger(ledgerRes.data?.data || null);
    } catch (err) {
      console.error('Error loading supplier data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (selectedSupplier) {
      loadSupplierData(selectedSupplier);
    }
  }, [selectedSupplier]);

  const handleUpdateStatus = async (orderId, newStatus) => {
    try {
      await api.patch(`/purchase-orders/${orderId}/status`, { status: newStatus });
      setActionMessage(`Purchase order updated to "${newStatus}"!`);
      loadSupplierData(selectedSupplier);
      setTimeout(() => setActionMessage(''), 3000);
    } catch (err) {
      alert('Failed to update order: ' + (err.response?.data?.message || err.message));
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 font-sans p-4 md:p-8">
      <div className="max-w-6xl mx-auto space-y-6">
        
        {/* Top Header */}
        <div className="flex flex-wrap items-center justify-between gap-4 pb-6 border-b border-slate-800">
          <div className="flex items-center space-x-3">
            <span className="text-3xl">🚚📦</span>
            <div>
              <h1 className="text-xl font-bold tracking-tight">Vendor & Supplier Self-Service Portal</h1>
              <p className="text-xs text-slate-400">
                Direct view for ingredient suppliers to track Purchase Orders, deliveries, and payment settlements.
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-3">
            <select
              value={selectedSupplier}
              onChange={(e) => setSelectedSupplier(e.target.value)}
              className="bg-slate-800 border border-slate-700 text-white rounded-xl px-4 py-2 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-500"
            >
              {suppliers.map(s => (
                <option key={s._id || s.name} value={s.name}>
                  {s.name} ({s.category || 'General'})
                </option>
              ))}
            </select>

            <button
              onClick={() => loadSupplierData(selectedSupplier)}
              className="px-3 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs rounded-xl transition"
            >
              🔄 Refresh
            </button>
            <button
              onClick={() => window.location.href = '/'}
              className="px-3 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl transition"
            >
              Back to POS
            </button>
          </div>
        </div>

        {actionMessage && (
          <div className="p-3 bg-emerald-600/20 border border-emerald-500/40 text-emerald-300 rounded-xl text-xs font-medium">
            ✅ {actionMessage}
          </div>
        )}

        {/* Ledger Balance Summary Cards */}
        {ledger && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-slate-800/80 p-4 rounded-xl border border-slate-700">
              <span className="text-[11px] font-bold text-slate-400 uppercase">Total Supplies</span>
              <div className="text-2xl font-black text-white mt-1">₹{ledger.receivedTotal?.toFixed(2) || 0}</div>
            </div>
            <div className="bg-slate-800/80 p-4 rounded-xl border border-slate-700">
              <span className="text-[11px] font-bold text-slate-400 uppercase">Paid by Restaurant</span>
              <div className="text-2xl font-black text-emerald-400 mt-1">₹{ledger.paidTotal?.toFixed(2) || 0}</div>
            </div>
            <div className="bg-slate-800/80 p-4 rounded-xl border border-slate-700">
              <span className="text-[11px] font-bold text-slate-400 uppercase">Returns / Wastage</span>
              <div className="text-2xl font-black text-amber-400 mt-1">₹{ledger.returnedTotal?.toFixed(2) || 0}</div>
            </div>
            <div className="bg-slate-800/80 p-4 rounded-xl border border-slate-700">
              <span className="text-[11px] font-bold text-slate-400 uppercase">Outstanding Balance</span>
              <div className="text-2xl font-black text-blue-400 mt-1">₹{ledger.outstanding?.toFixed(2) || 0}</div>
            </div>
          </div>
        )}

        {/* Purchase Orders List */}
        <div className="bg-slate-800/80 rounded-2xl border border-slate-700 p-6 shadow-xl">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <span>📋</span> Purchase Orders for {selectedSupplier} ({orders.length})
            </h3>
            <span className="text-xs text-slate-400">100% Pure Veg Ingredients & Supplies</span>
          </div>

          {loading ? (
            <div className="py-12 text-center text-slate-400 text-sm">Loading purchase orders...</div>
          ) : orders.length === 0 ? (
            <div className="py-12 text-center text-slate-400 text-sm">
              No purchase orders found for this supplier.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-700 text-slate-400">
                    <th className="py-3 px-4">PO Date</th>
                    <th className="py-3 px-4">Item Name</th>
                    <th className="py-3 px-4">Quantity</th>
                    <th className="py-3 px-4">Unit Rate</th>
                    <th className="py-3 px-4">Total Amount</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4 text-right">Vendor Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {orders.map((po) => {
                    const statusColors = {
                      'Pending': 'bg-amber-500/20 text-amber-300 border-amber-500/40',
                      'Approved': 'bg-blue-500/20 text-blue-300 border-blue-500/40',
                      'Partially Received': 'bg-purple-500/20 text-purple-300 border-purple-500/40',
                      'Received': 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
                      'Cancelled': 'bg-red-500/20 text-red-300 border-red-500/40'
                    };
                    const colorCls = statusColors[po.status] || 'bg-slate-700 text-slate-300 border-slate-600';

                    return (
                      <tr key={po._id} className="hover:bg-slate-800/50 transition">
                        <td className="py-3 px-4 text-slate-400">
                          {new Date(po.createdAt).toLocaleDateString()}
                        </td>
                        <td className="py-3 px-4 font-bold text-white">
                          {po.itemName}
                        </td>
                        <td className="py-3 px-4">
                          {po.quantity} {po.unit || 'kg'}
                        </td>
                        <td className="py-3 px-4">
                          ₹{po.unitPrice}
                        </td>
                        <td className="py-3 px-4 font-bold text-emerald-400">
                          ₹{po.totalAmount}
                        </td>
                        <td className="py-3 px-4">
                          <span className={`px-2.5 py-1 rounded-full border text-[10px] font-bold uppercase tracking-wider ${colorCls}`}>
                            {po.status}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right space-x-2">
                          {po.status === 'Pending' && (
                            <button
                              onClick={() => handleUpdateStatus(po._id, 'Approved')}
                              className="px-2.5 py-1 rounded bg-blue-600 hover:bg-blue-500 text-white text-[11px] font-semibold"
                            >
                              ✓ Accept PO
                            </button>
                          )}
                          {po.status === 'Approved' && (
                            <button
                              onClick={() => handleUpdateStatus(po._id, 'Received')}
                              className="px-2.5 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-semibold"
                            >
                              🚚 Mark Delivered
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}

