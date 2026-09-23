import React, { useState, useEffect } from 'react';
import { api } from '../api';

export default function OwnerLiveMonitor() {
  const [data, setData] = useState({
    todaySales: 0,
    subtotal: 0,
    tax: 0,
    discount: 0,
    orderCount: 0,
    activeTables: 0,
    totalTables: 0,
    cashTotal: 0,
    upiTotal: 0,
    cardTotal: 0,
    recentOrders: []
  });
  const [loading, setLoading] = useState(true);
  const [lastRefreshed, setLastRefreshed] = useState(new Date());

  const fetchLiveMetrics = async () => {
    try {
      const today = new Date().toISOString().slice(0, 10);
      const [salesRes, tablesRes, ordersRes, paymentsRes] = await Promise.all([
        api.get(`/reports/sales?from=${today}&to=${today}`).catch(() => ({ data: { data: {} } })),
        api.get('/tables').catch(() => ({ data: [] })),
        api.get('/orders/active').catch(() => ({ data: [] })),
        api.get('/payments').catch(() => ({ data: { data: [] } }))
      ]);

      const totals = salesRes.data?.data?.totals || {};
      const tables = Array.isArray(tablesRes.data?.data) ? tablesRes.data.data : Array.isArray(tablesRes.data) ? tablesRes.data : [];
      const orders = Array.isArray(ordersRes.data?.data) ? ordersRes.data.data : Array.isArray(ordersRes.data) ? ordersRes.data : [];
      const payments = Array.isArray(paymentsRes.data?.data) ? paymentsRes.data.data : [];

      // Payment mode breakdown
      let cash = 0, upi = 0, card = 0;
      payments.forEach(p => {
        const mode = (p.paymentMode || '').toLowerCase();
        const amt = Number(p.grandTotal || 0);
        if (mode.includes('cash')) cash += amt;
        else if (mode.includes('upi') || mode.includes('razorpay') || mode.includes('online')) upi += amt;
        else if (mode.includes('card')) card += amt;
      });

      setData({
        todaySales: totals.grossSales || payments.reduce((sum, p) => sum + (p.grandTotal || 0), 0),
        subtotal: totals.subtotal || 0,
        tax: totals.tax || 0,
        discount: totals.discounts || 0,
        orderCount: totals.orders || payments.length,
        activeTables: tables.filter(t => t.status === 'occupied').length,
        totalTables: tables.length,
        cashTotal: cash,
        upiTotal: upi,
        cardTotal: card,
        recentOrders: orders.slice(0, 8)
      });
      setLastRefreshed(new Date());
    } catch (err) {
      console.error('Owner monitor fetch error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLiveMetrics();
    const interval = setInterval(fetchLiveMetrics, 15000); // 15-sec auto refresh
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="min-h-screen bg-slate-900 text-white font-sans p-4 md:p-8">
      {/* Top Bar */}
      <div className="max-w-6xl mx-auto flex flex-wrap justify-between items-center gap-4 pb-6 border-b border-slate-800">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-xl">
            👑
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight">Tamanna Restaurant — Owner Live Monitor</h1>
            <p className="text-xs text-slate-400">
              Live executive view • Auto-refreshed at {lastRefreshed.toLocaleTimeString()}
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-3">
          <button
            onClick={() => window.location.href = '/'}
            className="px-3 py-1.5 rounded-lg border border-slate-700 text-xs text-slate-300 hover:text-white hover:bg-slate-800 transition"
          >
            🖥️ Open POS
          </button>
          <button
            onClick={fetchLiveMetrics}
            disabled={loading}
            className="px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-xs font-bold transition flex items-center space-x-1.5 shadow-lg shadow-emerald-900/30"
          >
            <span>{loading ? '🔄 Refreshing...' : '⚡ Refresh Now'}</span>
          </button>
        </div>
      </div>

      <div className="max-w-6xl mx-auto pt-6 space-y-6">
        {/* Core KPI Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-slate-800/80 p-5 rounded-2xl border border-slate-700/60 shadow-xl backdrop-blur">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Today's Total Sales</span>
            <div className="text-3xl font-black text-emerald-400 mt-2">
              ₹{Number(data.todaySales).toFixed(0)}
            </div>
            <span className="text-[11px] text-slate-400 mt-1 block">
              {data.orderCount} bills settled today
            </span>
          </div>

          <div className="bg-slate-800/80 p-5 rounded-2xl border border-slate-700/60 shadow-xl backdrop-blur">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Table Occupancy</span>
            <div className="text-3xl font-black text-amber-400 mt-2">
              {data.activeTables} <span className="text-sm font-normal text-slate-400">/ {data.totalTables}</span>
            </div>
            <span className="text-[11px] text-slate-400 mt-1 block">
              {data.totalTables > 0 ? Math.round((data.activeTables / data.totalTables) * 100) : 0}% capacity occupied
            </span>
          </div>

          <div className="bg-slate-800/80 p-5 rounded-2xl border border-slate-700/60 shadow-xl backdrop-blur">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Cash in Drawer</span>
            <div className="text-3xl font-black text-cyan-400 mt-2">
              ₹{Number(data.cashTotal).toFixed(0)}
            </div>
            <span className="text-[11px] text-slate-400 mt-1 block">
              Physical cash collected
            </span>
          </div>

          <div className="bg-slate-800/80 p-5 rounded-2xl border border-slate-700/60 shadow-xl backdrop-blur">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">UPI / Card Digital</span>
            <div className="text-3xl font-black text-purple-400 mt-2">
              ₹{Number(data.upiTotal + data.cardTotal).toFixed(0)}
            </div>
            <span className="text-[11px] text-slate-400 mt-1 block">
              UPI: ₹{data.upiTotal.toFixed(0)} | Card: ₹{data.cardTotal.toFixed(0)}
            </span>
          </div>
        </div>

        {/* Live Active Orders Stream */}
        <div className="bg-slate-800/80 rounded-2xl border border-slate-700/60 p-6 shadow-xl">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse"></span>
              Live Kitchen & Dining Orders ({data.recentOrders.length} active)
            </h3>
            <span className="text-xs text-slate-400">Real-time floor status</span>
          </div>

          {data.recentOrders.length === 0 ? (
            <div className="py-12 text-center text-slate-400 text-sm">
              ✨ All active orders have been served and settled.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {data.recentOrders.map(order => (
                <div
                  key={order._id}
                  className="bg-slate-900/90 border border-slate-700 p-4 rounded-xl flex flex-col justify-between"
                >
                  <div>
                    <div className="flex justify-between items-start mb-2">
                      <span className="font-bold text-sm text-emerald-400">
                        {order.tableNo ? `Table ${order.tableNo}` : order.orderType || 'Order'}
                      </span>
                      <span className="text-[10px] px-2 py-0.5 rounded bg-slate-800 text-slate-300 uppercase font-semibold">
                        {order.orderStatus || 'in-progress'}
                      </span>
                    </div>

                    <div className="text-xs text-slate-300 space-y-1 mb-3">
                      {(order.items || []).slice(0, 3).map((item, idx) => (
                        <div key={idx} className="flex justify-between text-[11px]">
                          <span className="truncate max-w-[140px] text-slate-300">{item.name}</span>
                          <span className="text-slate-400 font-bold">x{item.quantity}</span>
                        </div>
                      ))}
                      {(order.items || []).length > 3 && (
                        <span className="text-[10px] text-slate-500 italic">
                          + {(order.items || []).length - 3} more items
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="pt-2 border-t border-slate-800 flex justify-between items-center text-xs">
                    <span className="text-slate-400">Total:</span>
                    <span className="font-bold text-white">₹{order.grandTotal || 0}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

