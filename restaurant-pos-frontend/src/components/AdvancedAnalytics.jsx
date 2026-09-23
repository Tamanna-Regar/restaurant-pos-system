import React, { useState, useMemo } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line, Legend
} from 'recharts';

const COLORS = ['#16a34a', '#2563eb', '#f59e0b', '#dc2626', '#8b5cf6', '#06b6d4', '#ec4899'];

export default function AdvancedAnalytics({ orders = [], customers = [], selectedPeriod = 'Week', onPeriodChange }) {
  const [activeView, setActiveView] = useState('peak-hours'); // 'peak-hours' | 'combos' | 'retention'

  // Filter completed orders
  const validOrders = useMemo(() => {
    return orders.filter(o => o.orderStatus === 'completed' || o.paymentStatus === 'paid' || o.grandTotal > 0);
  }, [orders]);

  // 1. Peak Hours Heatmap / Hourly Analysis (00:00 - 23:00)
  const hourlyData = useMemo(() => {
    const hours = Array.from({ length: 24 }, (_, i) => ({
      hour: `${String(i).padStart(2, '0')}:00`,
      hourNum: i,
      orderCount: 0,
      revenue: 0,
      isRush: (i >= 12 && i <= 15) || (i >= 19 && i <= 23)
    }));

    validOrders.forEach(o => {
      const date = new Date(o.createdAt || o.settledAt || Date.now());
      const h = date.getHours();
      if (hours[h]) {
        hours[h].orderCount += 1;
        hours[h].revenue += Number(o.grandTotal || 0);
      }
    });

    return hours;
  }, [validOrders]);

  // Peak Hour Stats
  const peakStats = useMemo(() => {
    let busiestHour = { hour: 'N/A', orderCount: 0 };
    let highestRevenueHour = { hour: 'N/A', revenue: 0 };

    hourlyData.forEach(h => {
      if (h.orderCount > busiestHour.orderCount) busiestHour = h;
      if (h.revenue > highestRevenueHour.revenue) highestRevenueHour = h;
    });

    return { busiestHour, highestRevenueHour };
  }, [hourlyData]);

  // 2. Best-Selling Food Combos (Pairs ordered together)
  const comboData = useMemo(() => {
    const pairMap = {};

    validOrders.forEach(order => {
      const items = (order.items || [])
        .map(it => (it.name || '').trim())
        .filter(name => name.length > 0);

      // Unique items per order to prevent self-pairing
      const uniqueItems = Array.from(new Set(items));

      for (let i = 0; i < uniqueItems.length; i++) {
        for (let j = i + 1; j < uniqueItems.length; j++) {
          const pairKey = [uniqueItems[i], uniqueItems[j]].sort().join(' + ');
          pairMap[pairKey] = (pairMap[pairKey] || 0) + 1;
        }
      }
    });

    return Object.entries(pairMap)
      .map(([combo, count]) => ({ combo, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);
  }, [validOrders]);

  // 3. Customer Retention & Repeat Metrics
  const retentionMetrics = useMemo(() => {
    const phoneMap = {};
    let guestOrders = 0;

    validOrders.forEach(order => {
      const phone = (order.customerPhone || '').trim();
      if (!phone || phone.length < 10) {
        guestOrders++;
        return;
      }
      phoneMap[phone] = (phoneMap[phone] || 0) + 1;
    });

    const uniqueTracked = Object.keys(phoneMap).length;
    const repeatCustomers = Object.values(phoneMap).filter(count => count > 1).length;
    const singleVisitCustomers = uniqueTracked - repeatCustomers;
    const repeatRate = uniqueTracked > 0 ? ((repeatCustomers / uniqueTracked) * 100).toFixed(1) : 0;

    const totalRev = validOrders.reduce((sum, o) => sum + (o.grandTotal || 0), 0);
    const aov = validOrders.length > 0 ? (totalRev / validOrders.length).toFixed(1) : 0;

    return {
      uniqueTracked,
      repeatCustomers,
      singleVisitCustomers,
      guestOrders,
      repeatRate,
      aov,
      totalOrders: validOrders.length
    };
  }, [validOrders]);

  const customerPieData = [
    { name: 'Repeat Guests', value: retentionMetrics.repeatCustomers || 1, color: '#16a34a' },
    { name: 'First-time Guests', value: retentionMetrics.singleVisitCustomers || 1, color: '#3b82f6' },
    { name: 'Walk-in (No Phone)', value: retentionMetrics.guestOrders || 1, color: '#94a3b8' }
  ];

  return (
    <div className="p-6 bg-slate-50 flex-1 overflow-y-auto font-sans">
      {/* Top Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div>
          <h2 className="text-2xl font-black text-slate-900 flex items-center gap-2">
            <span>📈</span> Enterprise Restaurant Analytics
          </h2>
          <p className="text-xs text-slate-500">
            Peak hours heatmap, popular combos, and customer retention insights.
          </p>
        </div>

        {/* View Switcher */}
        <div className="flex bg-white rounded-xl shadow-sm border border-slate-200 p-1">
          <button
            onClick={() => setActiveView('peak-hours')}
            className={`px-4 py-2 text-xs font-bold rounded-lg transition ${
              activeView === 'peak-hours'
                ? 'bg-slate-900 text-white shadow'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            ⏰ Peak Hours Rush
          </button>
          <button
            onClick={() => setActiveView('combos')}
            className={`px-4 py-2 text-xs font-bold rounded-lg transition ${
              activeView === 'combos'
                ? 'bg-slate-900 text-white shadow'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            🍽️ Best Combos
          </button>
          <button
            onClick={() => setActiveView('retention')}
            className={`px-4 py-2 text-xs font-bold rounded-lg transition ${
              activeView === 'retention'
                ? 'bg-slate-900 text-white shadow'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            👥 Retention & AOV
          </button>
        </div>
      </div>

      {/* KPI Stats Overview */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Average Order Value</span>
          <div className="text-2xl font-black text-emerald-600 mt-1">₹{retentionMetrics.aov}</div>
          <span className="text-[10px] text-slate-500">Per bill average</span>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Busiest Hour</span>
          <div className="text-2xl font-black text-amber-600 mt-1">{peakStats.busiestHour.hour}</div>
          <span className="text-[10px] text-slate-500">{peakStats.busiestHour.orderCount} orders punched</span>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Repeat Customer Rate</span>
          <div className="text-2xl font-black text-blue-600 mt-1">{retentionMetrics.repeatRate}%</div>
          <span className="text-[10px] text-slate-500">{retentionMetrics.repeatCustomers} regular patrons</span>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Peak Revenue Hour</span>
          <div className="text-2xl font-black text-purple-600 mt-1">{peakStats.highestRevenueHour.hour}</div>
          <span className="text-[10px] text-slate-500">₹{peakStats.highestRevenueHour.revenue.toFixed(0)} sales</span>
        </div>
      </div>

      {/* View 1: Peak Hours Rush Heatmap & Hourly Chart */}
      {activeView === 'peak-hours' && (
        <div className="space-y-6">
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
            <div className="flex justify-between items-center mb-4">
              <div>
                <h3 className="text-base font-bold text-slate-800">24-Hour Peak Rush Analysis</h3>
                <p className="text-xs text-slate-500">Order volumes throughout the day. Lunch (12-3 PM) & Dinner (7-11 PM) rush highlighted.</p>
              </div>
              <div className="flex items-center gap-3 text-xs">
                <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-amber-500"></span> Rush Hour</span>
                <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-emerald-500"></span> Normal Hour</span>
              </div>
            </div>

            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={hourlyData} margin={{ top: 10, right: 10, left: -20, bottom: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="hour" tick={{ fontSize: 10 }} interval={1} angle={-30} textAnchor="end" />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip
                    content={({ active, payload }) => {
                      if (active && payload && payload.length) {
                        const data = payload[0].payload;
                        return (
                          <div className="bg-slate-900 text-white p-2.5 rounded-lg text-xs shadow-xl">
                            <p className="font-bold">{data.hour} {data.isRush ? '🔥 Rush Window' : ''}</p>
                            <p className="text-emerald-400">Orders: {data.orderCount}</p>
                            <p className="text-slate-300">Revenue: ₹{data.revenue.toFixed(2)}</p>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  <Bar dataKey="orderCount" radius={[4, 4, 0, 0]}>
                    {hourlyData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.isRush ? '#f59e0b' : '#10b981'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}

      {/* View 2: Best-Selling Combos */}
      {activeView === 'combos' && (
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
          <div className="mb-4">
            <h3 className="text-base font-bold text-slate-800">Frequently Ordered Together (Food Combos)</h3>
            <p className="text-xs text-slate-500">Pairs of dishes frequently punched in the same bill. Perfect for meal bundles & promotions.</p>
          </div>

          {comboData.length === 0 ? (
            <div className="py-12 text-center text-slate-400 text-sm">
              Punch more orders to generate dish pairing correlation insights.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {comboData.map((item, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between p-4 rounded-xl border border-slate-100 bg-slate-50/60 hover:bg-emerald-50/40 transition"
                >
                  <div className="flex items-center space-x-3">
                    <span className="w-7 h-7 rounded-full bg-emerald-100 text-emerald-800 font-bold text-xs flex items-center justify-center">
                      #{idx + 1}
                    </span>
                    <div>
                      <div className="text-sm font-bold text-slate-800">{item.combo}</div>
                      <span className="text-[10px] text-emerald-700 font-semibold uppercase">Popular Pairing</span>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-base font-black text-slate-900">{item.count} times</div>
                    <span className="text-[10px] text-slate-500">ordered together</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* View 3: Customer Retention & Loyalty Breakdown */}
      {activeView === 'retention' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col items-center">
            <h3 className="text-base font-bold text-slate-800 mb-2 w-full text-left">Patron Loyalty Distribution</h3>
            <div className="h-60 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={customerPieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={55}
                    outerRadius={80}
                    paddingAngle={4}
                    dataKey="value"
                  >
                    {customerPieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between">
            <div>
              <h3 className="text-base font-bold text-slate-800 mb-1">Retention Strategy Recommendations</h3>
              <p className="text-xs text-slate-500 mb-4">Actionable suggestions based on current customer ordering frequency.</p>
              
              <div className="space-y-3">
                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-900">
                  <p className="font-bold">🎯 Boost Repeat Visits:</p>
                  <span>Launch WhatsApp birthday loyalty points 2 days before customer birthdays.</span>
                </div>
                <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl text-xs text-blue-900">
                  <p className="font-bold">⚡ Maximize Lunch Rush:</p>
                  <span>Offer express thali or quick combo meals during {peakStats.busiestHour.hour} to speed table turnover.</span>
                </div>
                <div className="p-3 bg-purple-50 border border-purple-200 rounded-xl text-xs text-purple-900">
                  <p className="font-bold">💎 High AOV Incentive:</p>
                  <span>Customers spending over ₹800 receive 50 bonus loyalty points for their next visit.</span>
                </div>
              </div>
            </div>

            <div className="mt-4 pt-4 border-t border-slate-100 text-xs text-slate-500 flex justify-between">
              <span>Total Orders Tracked: <strong>{retentionMetrics.totalOrders}</strong></span>
              <span>Unique Phones: <strong>{retentionMetrics.uniqueTracked}</strong></span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

