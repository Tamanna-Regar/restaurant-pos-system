import React, { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api';

const emptyMovement = { type: 'cash-in', amount: '', reason: '' };

/* ─── helpers ─── */
const fmt = (n) => `₹${Number(n ?? 0).toFixed(2)}`;

function elapsed(createdAt) {
  if (!createdAt) return '—';
  const ms = Date.now() - new Date(createdAt).getTime();
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  return `${h}h ${m}m`;
}

const cardStyle = {
  background: '#fff',
  padding: 20,
  borderRadius: 14,
  border: '1px solid #e2e8f0',
  boxShadow: '0 2px 12px rgba(0,0,0,0.06)'
};

/* ─── Live Cash Summary Card ─── */
function LiveSummaryCard({ summary, loading, onRefresh }) {
  const [, setTick] = useState(0);
  const timerRef = useRef(null);

  useEffect(() => {
    timerRef.current = setInterval(() => setTick((t) => t + 1), 60000);
    return () => clearInterval(timerRef.current);
  }, []);

  if (loading && !summary) {
    return (
      <div style={cardStyle}>
        <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#1e293b' }}>📊 Live Cash Summary</h3>
        <p style={{ color: '#64748b', marginTop: 12 }}>Loading live summary…</p>
      </div>
    );
  }

  if (!summary) {
    return (
      <div style={cardStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#1e293b' }}>📊 Live Cash Summary</h3>
          <button onClick={onRefresh} style={{ fontSize: 12, padding: '4px 10px', borderRadius: 6, border: '1px solid #cbd5e1', background: '#f8fafc', cursor: 'pointer' }}>🔄 Retry</button>
        </div>
        <p style={{ color: '#94a3b8', marginTop: 12, fontSize: 13 }}>Summary data is currently loading...</p>
      </div>
    );
  }

  const rows = [
    { label: '🪙 Opening Cash',   value: fmt(summary.openingCash), color: '#1e40af' },
    { label: '💵 Cash Sales',      value: fmt(summary.cashSales),   color: '#15803d' },
    { label: '➕ Manual Cash In',  value: fmt(summary.cashIn),      color: '#0369a1' },
    { label: '➖ Manual Cash Out', value: fmt(summary.cashOut),     color: '#b45309', neg: true },
    { label: '🧾 Expenses Paid',   value: fmt(summary.expenses),    color: '#9333ea', neg: true },
  ];

  const payModes = Object.entries(summary.paymentBreakdown || {});

  return (
    <div style={cardStyle}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
        <div>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#1e293b' }}>📊 Live Cash Summary</h3>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
            <span style={{ fontSize: 12, color: '#64748b' }}>Auto-refreshes every minute</span>
            <button
              type="button"
              onClick={onRefresh}
              disabled={loading}
              title="Refresh numbers now"
              style={{
                fontSize: 11, padding: '2px 8px', borderRadius: 6,
                border: '1px solid #cbd5e1', background: '#f8fafc',
                cursor: loading ? 'wait' : 'pointer', fontWeight: 600, color: '#334155'
              }}
            >
              {loading ? '⏳' : '🔄 Refresh'}
            </button>
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 11, color: '#94a3b8' }}>Shift Duration</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#0f172a' }}>⏱ {elapsed(summary.shiftStarted)}</div>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
        {rows.map(({ label, value, color, neg }) => (
          <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc', borderRadius: 8, padding: '8px 12px', borderLeft: `4px solid ${color}` }}>
            <span style={{ fontSize: 13, color: '#475569' }}>{label}</span>
            <span style={{ fontWeight: 700, color: neg ? '#dc2626' : color, fontSize: 15 }}>
              {neg && value !== '₹0.00' ? `− ${value}` : value}
            </span>
          </div>
        ))}
      </div>

      <div style={{ borderTop: '2px dashed #e2e8f0', marginBottom: 14 }} />

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'linear-gradient(135deg,#0f172a 0%,#1e3a5f 100%)', borderRadius: 10, padding: '12px 16px', marginBottom: 16 }}>
        <span style={{ color: '#94a3b8', fontSize: 14, fontWeight: 600 }}>🧮 Expected Cash in Drawer</span>
        <span style={{ color: '#fff', fontSize: 22, fontWeight: 800 }}>{fmt(summary.expectedCash)}</span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: payModes.length ? 16 : 0 }}>
        {[{ label: 'Total Orders', value: summary.totalOrders, icon: '🧾', bg: '#eff6ff', text: '#1d4ed8' },
          { label: 'Cash Movements', value: summary.movementsCount, icon: '💱', bg: '#faf5ff', text: '#7c3aed' }
        ].map(({ label, value, icon, bg, text }) => (
          <div key={label} style={{ background: bg, borderRadius: 10, padding: '10px 14px', textAlign: 'center' }}>
            <div style={{ fontSize: 20 }}>{icon}</div>
            <div style={{ fontWeight: 800, fontSize: 20, color: text }}>{value}</div>
            <div style={{ fontSize: 11, color: '#64748b' }}>{label}</div>
          </div>
        ))}
      </div>

      {payModes.length > 0 && (
        <div>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#64748b', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>
            Payment Breakdown (This Shift)
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {payModes.map(([mode, data]) => (
              <div key={mode} style={{ background: '#f1f5f9', borderRadius: 8, padding: '6px 12px', textAlign: 'center', minWidth: 90 }}>
                <div style={{ fontSize: 11, color: '#64748b' }}>{mode || 'Other'}</div>
                <div style={{ fontWeight: 700, color: '#0f172a', fontSize: 14 }}>{fmt(data.total)}</div>
                <div style={{ fontSize: 10, color: '#94a3b8' }}>{data.count} order{data.count !== 1 ? 's' : ''}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 📊 Order Type Breakdown */}
      {(() => {
        const breakdown = summary.orderBreakdown || {};
        const types = [
          { key: 'Dine-In',   icon: '🍽️', bg: '#eff6ff', border: '#bfdbfe', text: '#1d4ed8', label: 'Dine-In'   },
          { key: 'Takeaway',  icon: '🥡',  bg: '#faf5ff', border: '#e9d5ff', text: '#7c3aed', label: 'Takeaway'  },
          { key: 'Delivery',  icon: '🛵',  bg: '#fff7ed', border: '#fed7aa', text: '#c2410c', label: 'Delivery'  },
        ];
        const hasAny = types.some(t => breakdown[t.key]);
        if (!hasAny) return null;
        return (
          <div style={{ marginTop: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#64748b', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.5 }}>
              📊 Order Breakdown (This Shift)
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
              {types.map(({ key, icon, bg, border, text, label }) => {
                const d = breakdown[key];
                return (
                  <div key={key} style={{
                    background: bg, border: `1px solid ${border}`,
                    borderRadius: 12, padding: '12px 8px', textAlign: 'center'
                  }}>
                    <div style={{ fontSize: 22, marginBottom: 4 }}>{icon}</div>
                    <div style={{ fontSize: 11, color: '#64748b', marginBottom: 2 }}>{label}</div>
                    <div style={{ fontWeight: 800, fontSize: 18, color: text }}>
                      {d ? d.count : 0}
                    </div>
                    <div style={{ fontSize: 10, color: '#94a3b8' }}>orders</div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: text, marginTop: 4 }}>
                      {d ? fmt(d.total) : '₹0.00'}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}
    </div>
  );
}

/* ─── Shift Print Report ─── */
function handleWhatsAppZReport(reportData) {
  const s = reportData.summary || {};
  const actualCash = reportData.closingCash ?? reportData.shift?.closingCash ?? 0;
  const expectedCash = s.expectedCash ?? reportData.shift?.expectedCash ?? 0;
  const diff = (reportData.closingCash != null || reportData.shift?.variance != null)
    ? (Number(actualCash) - Number(expectedCash))
    : null;
  const statusStr = diff === null ? '—' : diff === 0 ? '✅ MATCHED (₹0.00)' : diff > 0 ? `🟢 SURPLUS (+₹${diff.toFixed(2)})` : `🔴 SHORTFALL (-₹${Math.abs(diff).toFixed(2)})`;

  let msg = `*TAMANNA RESTAURANT - SHIFT Z-REPORT*\n`;
  msg += `--------------------------------\n`;
  msg += `📅 *Date:* ${reportData.businessDate || new Date().toISOString().slice(0, 10)}\n`;
  msg += `👤 *Cashier:* ${reportData.cashierName || 'Cashier'}\n`;
  if (s.shiftDuration) {
    msg += `⏱ *Duration:* ${s.shiftDuration}\n`;
  }
  msg += `--------------------------------\n`;
  msg += `🪙 *Opening Cash:* ₹${Number(reportData.shift?.openingCash || 0).toFixed(2)}\n`;
  if (s.cashSales != null) msg += `💵 *Cash Sales:* ₹${Number(s.cashSales || 0).toFixed(2)}\n`;
  if (s.cashIn != null) msg += `➕ *Manual Cash-In:* ₹${Number(s.cashIn || 0).toFixed(2)}\n`;
  if (s.cashOut != null) msg += `➖ *Manual Cash-Out:* ₹${Number(s.cashOut || 0).toFixed(2)}\n`;
  if (s.expenses != null) msg += `🧾 *Expenses Paid:* ₹${Number(s.expenses || 0).toFixed(2)}\n`;
  msg += `--------------------------------\n`;
  msg += `🧮 *Expected Drawer Cash:* ₹${Number(expectedCash).toFixed(2)}\n`;
  msg += `💰 *Actual Cash Counted:* ₹${Number(actualCash).toFixed(2)}\n`;
  if (diff !== null) {
    msg += `⚖️ *Variance Status:* ${statusStr}\n`;
  }
  if (s.totalOrders) {
    msg += `🧾 *Total Orders:* ${s.totalOrders}\n`;
  }

  const denoms = reportData.denominations || reportData.shift?.denominations;
  if (denoms) {
    const d500 = Number(denoms.d500 || denoms[500] || 0);
    const d200 = Number(denoms.d200 || denoms[200] || 0);
    const d100 = Number(denoms.d100 || denoms[100] || 0);
    const d50  = Number(denoms.d50  || denoms[50]  || 0);
    const d20  = Number(denoms.d20  || denoms[20]  || 0);
    const d10  = Number(denoms.d10  || denoms[10]  || 0);
    const coins = Number(denoms.coins || 0);
    const hasNotes = d500 || d200 || d100 || d50 || d20 || d10 || coins;
    if (hasNotes) {
      msg += `--------------------------------\n`;
      msg += `💵 *Denomination Breakdown:*\n`;
      if (d500) msg += `• ₹500 × ${d500} = ₹${d500 * 500}\n`;
      if (d200) msg += `• ₹200 × ${d200} = ₹${d200 * 200}\n`;
      if (d100) msg += `• ₹100 × ${d100} = ₹${d100 * 100}\n`;
      if (d50)  msg += `• ₹50 × ${d50} = ₹${d50 * 50}\n`;
      if (d20)  msg += `• ₹20 × ${d20} = ₹${d20 * 20}\n`;
      if (d10)  msg += `• ₹10 × ${d10} = ₹${d10 * 10}\n`;
      if (coins) msg += `• Coins = ₹${Number(coins).toFixed(2)}\n`;
    }
  }

  if (reportData.notes) {
    msg += `--------------------------------\n`;
    msg += `📝 *Notes:* ${reportData.notes}\n`;
  }
  msg += `--------------------------------\n`;
  msg += `_Generated at ${new Date().toLocaleTimeString('en-IN')}_`;

  const url = `https://wa.me/?text=${encodeURIComponent(msg)}`;
  window.open(url, '_blank');
}

function ShiftPrintReport({ data, onClose }) {
  if (!data) return null;
  const handlePrint = () => window.print();
  const movements = data.shift?.movements || [];
  const cashIn = movements.filter(m => m.type === 'cash-in').reduce((s, m) => s + m.amount, 0);
  const cashOut = movements.filter(m => m.type === 'cash-out').reduce((s, m) => s + m.amount, 0);
  const variance = (data.closingCash != null && data.summary?.expectedCash != null)
    ? (Number(data.closingCash) - Number(data.summary.expectedCash))
    : (data.shift?.variance ?? null);

  const denoms = data.denominations || data.shift?.denominations;
  const d500 = Number(denoms?.d500 || denoms?.[500] || 0);
  const d200 = Number(denoms?.d200 || denoms?.[200] || 0);
  const d100 = Number(denoms?.d100 || denoms?.[100] || 0);
  const d50  = Number(denoms?.d50  || denoms?.[50]  || 0);
  const d20  = Number(denoms?.d20  || denoms?.[20]  || 0);
  const d10  = Number(denoms?.d10  || denoms?.[10]  || 0);
  const coins = Number(denoms?.coins || 0);
  const hasDenoms = d500 || d200 || d100 || d50 || d20 || d10 || coins;

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: '#fff', borderRadius: 16, padding: 32, maxWidth: 480, width: '100%', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
        {/* No-print buttons */}
        <div className="no-print" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 8 }}>
          <span style={{ fontWeight: 700, fontSize: 16 }}>🖨️ Shift Z-Report</span>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button
              onClick={() => handleWhatsAppZReport(data)}
              style={{ padding: '8px 14px', background: '#25D366', color: '#fff', border: 0, borderRadius: 8, cursor: 'pointer', fontWeight: 700, fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}
              title="Send formatted Z-report to owner on WhatsApp"
            >
              <span>📲</span> WhatsApp
            </button>
            <button onClick={handlePrint} style={{ padding: '8px 14px', background: '#2563eb', color: '#fff', border: 0, borderRadius: 8, cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>
              Print / PDF
            </button>
            <button onClick={onClose} style={{ padding: '8px 12px', background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: 8, cursor: 'pointer', fontSize: 13 }}>
              ✕ Close
            </button>
          </div>
        </div>

        {/* Printable content */}
        <div style={{ fontFamily: 'monospace', fontSize: 13, lineHeight: 1.7 }}>
          <div style={{ textAlign: 'center', marginBottom: 12 }}>
            <div style={{ fontSize: 18, fontWeight: 800 }}>Tamanna Restaurant</div>
            <div style={{ fontSize: 12, color: '#64748b' }}>Cashier Shift Report (Z-Report)</div>
          </div>
          <hr style={{ border: 'none', borderTop: '1px dashed #ccc', margin: '10px 0' }} />

          <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Cashier:</span><strong>{data.cashierName || '—'}</strong></div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Date:</span><strong>{data.businessDate || '—'}</strong></div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Shift Started:</span><strong>{data.shiftStarted ? new Date(data.shiftStarted).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true }) : '—'}</strong></div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Shift Duration:</span><strong>{data.summary?.shiftDuration || '—'}</strong></div>

          <hr style={{ border: 'none', borderTop: '1px dashed #ccc', margin: '10px 0' }} />

          <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Opening Cash:</span><strong>{fmt(data.shift?.openingCash)}</strong></div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Cash Sales:</span><strong>{fmt(data.summary?.cashSales)}</strong></div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Cash In (Manual):</span><strong>+ {fmt(cashIn)}</strong></div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Cash Out (Manual):</span><strong>− {fmt(cashOut)}</strong></div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Expenses:</span><strong>− {fmt(data.summary?.expenses)}</strong></div>

          <hr style={{ border: 'none', borderTop: '2px solid #000', margin: '10px 0' }} />

          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 15, fontWeight: 700 }}><span>Expected Cash:</span><span>{fmt(data.summary?.expectedCash)}</span></div>
          {data.closingCash != null && (
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 15, fontWeight: 700 }}><span>Actual Cash:</span><span>{fmt(data.closingCash)}</span></div>
          )}
          {variance != null && (
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, fontWeight: 700, color: variance >= 0 ? '#15803d' : '#dc2626' }}>
              <span>Variance:</span><span>{variance === 0 ? 'Exact Match (₹0)' : (variance > 0 ? `▲ +${fmt(variance)} (Surplus)` : `▼ -${fmt(Math.abs(variance))} (Shortfall)`)}</span>
            </div>
          )}

          {/* Physical Cash Denominations */}
          {hasDenoms && (
            <>
              <hr style={{ border: 'none', borderTop: '1px dashed #ccc', margin: '10px 0' }} />
              <div style={{ marginBottom: 4, fontWeight: 700 }}>Cash Denomination Breakdown:</div>
              {[
                { label: '₹500', count: d500, val: d500 * 500 },
                { label: '₹200', count: d200, val: d200 * 200 },
                { label: '₹100', count: d100, val: d100 * 100 },
                { label: '₹50',  count: d50,  val: d50 * 50 },
                { label: '₹20',  count: d20,  val: d20 * 20 },
                { label: '₹10',  count: d10,  val: d10 * 10 },
              ].filter(r => r.count > 0).map(r => (
                <div key={r.label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                  <span>{r.label} × {r.count}</span>
                  <span>{fmt(r.val)}</span>
                </div>
              ))}
              {coins > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                  <span>Coins</span>
                  <span>{fmt(coins)}</span>
                </div>
              )}
            </>
          )}

          {movements.length > 0 && (
            <>
              <hr style={{ border: 'none', borderTop: '1px dashed #ccc', margin: '10px 0' }} />
              <div style={{ marginBottom: 4, fontWeight: 700 }}>Cash Movements ({movements.length}):</div>
              {movements.map((m, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                  <span>{m.type === 'cash-in' ? '↑' : '↓'} {m.reason}</span>
                  <span>{m.type === 'cash-in' ? '+' : '−'} {fmt(m.amount)}</span>
                </div>
              ))}
            </>
          )}

          {data.notes && (
            <>
              <hr style={{ border: 'none', borderTop: '1px dashed #ccc', margin: '10px 0' }} />
              <div style={{ fontSize: 12 }}><strong>Notes:</strong> {data.notes}</div>
            </>
          )}

          <hr style={{ border: 'none', borderTop: '1px dashed #ccc', margin: '10px 0' }} />
          <div style={{ textAlign: 'center', fontSize: 11, color: '#94a3b8' }}>Printed: {new Date().toLocaleString('en-IN')}</div>
        </div>
      </div>
    </div>
  );
}

/* ─── Denomination Helpers ─── */
const defaultDenominations = { 500: '', 200: '', 100: '', 50: '', 20: '', 10: '', coins: '' };

const calcDenominationTotal = (denoms) => {
  const n500 = (Number(denoms[500]) || 0) * 500;
  const n200 = (Number(denoms[200]) || 0) * 200;
  const n100 = (Number(denoms[100]) || 0) * 100;
  const n50  = (Number(denoms[50])  || 0) * 50;
  const n20  = (Number(denoms[20])  || 0) * 20;
  const n10  = (Number(denoms[10])  || 0) * 10;
  const coins = Number(denoms.coins) || 0;
  return n500 + n200 + n100 + n50 + n20 + n10 + coins;
};

/* ─── Main component ─── */
export default function CashierShift() {
  const [shift, setShift] = useState(null);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [openingCash, setOpeningCash] = useState('');
  const [closingCash, setClosingCash] = useState('');
  const [denominations, setDenominations] = useState(defaultDenominations);
  const [useDenominationCounter, setUseDenominationCounter] = useState(true);
  const [movement, setMovement] = useState(emptyMovement);
  const [notes, setNotes] = useState('');
  const [currentUser, setCurrentUser] = useState(null);
  const [summaryRefresh, setSummaryRefresh] = useState(0);
  // Feature: Print Report
  const [printData, setPrintData] = useState(null);
  const [liveSummary, setLiveSummary] = useState(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  // Feature: Variance Alert
  const [varianceAlert, setVarianceAlert] = useState(null);
  // Feature: History Filter
  const [filterFrom, setFilterFrom] = useState('');
  const [filterTo, setFilterTo] = useState('');
  const [filterStatus, setFilterStatus] = useState('');

  const loadShifts = useCallback(async () => {
    try {
      setLoading(true);
      const [currentResponse, historyResponse] = await Promise.all([
        api.get('/shifts/current'),
        api.get('/shifts')
      ]);
      setShift(currentResponse.data?.data || null);
      setHistory(historyResponse.data?.data || []);
    } catch (error) {
      setMessage(error.response?.data?.message || 'Shift data could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch live summary for live card, variance check & print
  const fetchLiveSummary = useCallback(async () => {
    try {
      setSummaryLoading(true);
      const res = await api.get('/shifts/current/summary');
      const data = res.data?.data ?? null;
      setLiveSummary(data);
      return data;
    } catch {
      return null;
    } finally {
      setSummaryLoading(false);
    }
  }, []);

  useEffect(() => {
    try { setCurrentUser(JSON.parse(localStorage.getItem('user') || 'null')); }
    catch { setCurrentUser(null); }
    loadShifts();
  }, [loadShifts]);

  useEffect(() => {
    if (shift) {
      fetchLiveSummary();
      const interval = setInterval(fetchLiveSummary, 60000);
      return () => clearInterval(interval);
    } else {
      setLiveSummary(null);
    }
  }, [shift, summaryRefresh, fetchLiveSummary]);

  const openShift = async (event) => {
    event.preventDefault();
    try {
      const response = await api.post('/shifts/open', { openingCash: Number(openingCash) });
      setShift(response.data.data);
      setOpeningCash('');
      setMessage('Shift opened successfully.');
      setSummaryRefresh((n) => n + 1);
    } catch (error) {
      setMessage(error.response?.data?.message || 'Shift could not be opened.');
    }
  };

  const addMovement = async (event) => {
    event.preventDefault();
    try {
      const response = await api.post(`/shifts/${shift._id}/movements`, {
        type: movement.type,
        amount: Number(movement.amount),
        reason: movement.reason
      });
      setShift(response.data.data);
      setMovement(emptyMovement);
      setMessage('Cash movement recorded.');
      setSummaryRefresh((n) => n + 1);
      fetchLiveSummary();
    } catch (error) {
      setMessage(error.response?.data?.message || 'Cash movement could not be recorded.');
    }
  };

  // Instant variance check when closing cash changes
  const handleClosingCashChange = (value) => {
    setClosingCash(value);
    if (!value || isNaN(value)) { setVarianceAlert(null); return; }
    const expected = liveSummary?.expectedCash ?? 0;
    const diff = Number(value) - expected;
    setVarianceAlert({ diff, expected });
  };

  // Denomination input change with instant variance calculation
  const handleDenomChange = (denomKey, val) => {
    const cleanVal = val === '' ? '' : Math.max(0, Number(val));
    const updated = { ...denominations, [denomKey]: cleanVal };
    setDenominations(updated);
    const total = calcDenominationTotal(updated);
    const anyFilled = Object.values(updated).some((v) => v !== '');
    const totalStr = anyFilled ? String(total) : '';
    setClosingCash(totalStr);

    if (totalStr !== '') {
      const expected = liveSummary?.expectedCash ?? 0;
      const diff = total - expected;
      setVarianceAlert({ diff, expected });
    } else {
      setVarianceAlert(null);
    }
  };

  const closeShift = async (event) => {
    event.preventDefault();
    try {
      const summary = liveSummary || await fetchLiveSummary();
      const response = await api.post(`/shifts/${shift._id}/close`, {
        closingCash: Number(closingCash),
        notes,
        denominations
      });
      // Open print report before clearing state
      setPrintData({
        shift: response.data?.data || shift,
        summary,
        closingCash: Number(closingCash),
        notes,
        denominations,
        cashierName: currentUser?.name || 'Unknown',
        businessDate: shift.businessDate,
        shiftStarted: shift.createdAt
      });
      setShift(null);
      setClosingCash('');
      setDenominations(defaultDenominations);
      setNotes('');
      setVarianceAlert(null);
      setHistory((items) => [response.data.data, ...items]);
      setMessage('Shift closed and submitted for approval.');
    } catch (error) {
      setMessage(error.response?.data?.message || 'Shift could not be closed.');
    }
  };

  const approveShift = async (id) => {
    try {
      const response = await api.post(`/shifts/${id}/approve`);
      setHistory((items) => items.map((item) => item._id === id ? response.data.data : item));
      setMessage('Shift handover approved.');
    } catch (error) {
      setMessage(error.response?.data?.message || 'Shift could not be approved.');
    }
  };

  if (loading) return <div style={{ padding: 24 }}>Loading shift data...</div>;

  return (
    <div style={{ flex: 1, minHeight: 0, height: '100%', width: '100%', boxSizing: 'border-box', background: '#f8fafc', overflowY: 'auto', overflowX: 'hidden', padding: '24px 28px' }}>
      <div style={{ maxWidth: 1280, margin: '0 auto', paddingBottom: 60 }}>
        {/* Print Report Modal */}
        {printData && <ShiftPrintReport data={printData} onClose={() => setPrintData(null)} />}

        <h2 style={{ marginTop: 0 }}>Cashier Shift &amp; Handover</h2>
      {message && (
        <div style={{ padding: 12, marginBottom: 16, background: '#eff6ff', color: '#1d4ed8', borderRadius: 8 }}>
          {message}
        </div>
      )}

      {!shift ? (
        <form onSubmit={openShift} style={{ background: '#fff', padding: 20, borderRadius: 12, border: '1px solid #e2e8f0', maxWidth: 420 }}>
          <h3>Open New Shift</h3>
          <label style={{ display: 'block', marginBottom: 12 }}>Opening cash
            <input type="number" min="0" step="0.01" required value={openingCash}
              onChange={(event) => setOpeningCash(event.target.value)}
              style={{ display: 'block', width: '100%', padding: 10, marginTop: 6, boxSizing: 'border-box' }} />
          </label>
          <button type="submit" style={{ padding: '10px 16px', background: '#2563eb', color: '#fff', border: 0, borderRadius: 8 }}>Open Shift</button>
        </form>
      ) : (
        <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))' }}>

          {/* Live Summary */}
          <LiveSummaryCard summary={liveSummary} loading={summaryLoading} onRefresh={fetchLiveSummary} />

          {/* Record Movement */}
          <div style={cardStyle}>
            <h3 style={{ marginTop: 0 }}>Current Shift</h3>
            <p>Opening cash: <strong>{fmt(shift.openingCash)}</strong></p>
            <p>Movements: <strong>{shift.movements?.length || 0}</strong></p>
            <form onSubmit={addMovement}>
              <select value={movement.type} onChange={(event) => setMovement({ ...movement, type: event.target.value })} style={{ width: '100%', padding: 9, marginBottom: 8 }}>
                <option value="cash-in">Cash In</option>
                <option value="cash-out">Cash Out</option>
              </select>
              <input type="number" min="0.01" step="0.01" required placeholder="Amount" value={movement.amount}
                onChange={(event) => setMovement({ ...movement, amount: event.target.value })}
                style={{ width: '100%', padding: 9, marginBottom: 8, boxSizing: 'border-box' }} />
              <input required placeholder="Reason" value={movement.reason}
                onChange={(event) => setMovement({ ...movement, reason: event.target.value })}
                style={{ width: '100%', padding: 9, marginBottom: 8, boxSizing: 'border-box' }} />
              <button type="submit" style={{ padding: '9px 14px', background: '#0f766e', color: '#fff', border: 0, borderRadius: 8 }}>Record Movement</button>
            </form>

            {/* ── Movements Detail List ── */}
            {shift.movements?.length > 0 && (
              <div style={{ marginTop: 20 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: '#374151' }}>💱 Movement History</span>
                  <span style={{ fontSize: 11, color: '#94a3b8' }}>{shift.movements.length} entries</span>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 260, overflowY: 'auto' }}>
                  {[...shift.movements].reverse().map((m, i) => {
                    const isCashIn = m.type === 'cash-in';
                    const time = m.createdAt
                      ? new Date(m.createdAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })
                      : '—';
                    return (
                      <div key={m._id || i} style={{
                        display: 'flex', alignItems: 'center', gap: 10,
                        background: isCashIn ? '#f0fdf4' : '#fff7ed',
                        border: `1px solid ${isCashIn ? '#bbf7d0' : '#fed7aa'}`,
                        borderRadius: 8, padding: '8px 10px'
                      }}>
                        <span style={{
                          fontSize: 11, fontWeight: 700, padding: '2px 7px', borderRadius: 10,
                          background: isCashIn ? '#dcfce7' : '#ffedd5',
                          color: isCashIn ? '#15803d' : '#c2410c',
                          whiteSpace: 'nowrap'
                        }}>
                          {isCashIn ? '↑ IN' : '↓ OUT'}
                        </span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, color: '#374151', fontWeight: 600 }}>{m.reason}</div>
                          <div style={{ fontSize: 11, color: '#94a3b8' }}>{time}</div>
                        </div>
                        <span style={{
                          fontWeight: 800, fontSize: 14,
                          color: isCashIn ? '#15803d' : '#dc2626',
                          whiteSpace: 'nowrap'
                        }}>
                          {isCashIn ? '+' : '−'} {fmt(m.amount)}
                        </span>
                      </div>
                    );
                  })}
                </div>

                {/* Totals footer */}
                <div style={{
                  display: 'flex', justifyContent: 'space-between',
                  borderTop: '1px dashed #e2e8f0', marginTop: 10, paddingTop: 8
                }}>
                  <span style={{ fontSize: 12, color: '#15803d', fontWeight: 700 }}>
                    ↑ Total In: {fmt(shift.movements.filter(m => m.type === 'cash-in').reduce((s, m) => s + m.amount, 0))}
                  </span>
                  <span style={{ fontSize: 12, color: '#dc2626', fontWeight: 700 }}>
                    ↓ Total Out: {fmt(shift.movements.filter(m => m.type === 'cash-out').reduce((s, m) => s + m.amount, 0))}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Close Shift */}
          <form onSubmit={closeShift} style={cardStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <h3 style={{ margin: 0 }}>Close Shift</h3>
              <button
                type="button"
                onClick={() => setUseDenominationCounter((v) => !v)}
                style={{ fontSize: 12, color: '#2563eb', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600, padding: 0 }}
              >
                {useDenominationCounter ? '🔢 Switch to Simple Total' : '💵 Use Denomination Counter'}
              </button>
            </div>

            {/* 💵 Denomination Counter Grid */}
            {useDenominationCounter && (
              <div style={{ background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: 10, padding: '12px 14px', marginBottom: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#334155' }}>💵 Count Physical Notes &amp; Coins</span>
                  <button
                    type="button"
                    onClick={() => {
                      setDenominations(defaultDenominations);
                      handleClosingCashChange('');
                    }}
                    style={{ fontSize: 11, color: '#dc2626', background: 'transparent', border: 'none', cursor: 'pointer', fontWeight: 600, padding: 0 }}
                  >
                    Clear All
                  </button>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))', gap: 8 }}>
                  {[500, 200, 100, 50, 20, 10].map((val) => (
                    <div key={val} style={{ background: '#fff', border: '1px solid #cbd5e1', borderRadius: 8, padding: '6px 8px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, fontWeight: 700, color: '#475569', marginBottom: 4 }}>
                        <span>₹{val}</span>
                        <span style={{ color: '#0284c7' }}>₹{((Number(denominations[val]) || 0) * val).toLocaleString('en-IN')}</span>
                      </div>
                      <input
                        type="number"
                        min="0"
                        placeholder="Qty"
                        value={denominations[val]}
                        onChange={(e) => handleDenomChange(val, e.target.value)}
                        style={{ width: '100%', padding: '6px 8px', borderRadius: 6, border: '1px solid #e2e8f0', fontSize: 13, boxSizing: 'border-box' }}
                      />
                    </div>
                  ))}
                  <div style={{ background: '#fff', border: '1px solid #cbd5e1', borderRadius: 8, padding: '6px 8px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, fontWeight: 700, color: '#475569', marginBottom: 4 }}>
                      <span>Coins</span>
                      <span style={{ color: '#0284c7' }}>₹{(Number(denominations.coins) || 0).toLocaleString('en-IN')}</span>
                    </div>
                    <input
                      type="number"
                      min="0"
                      step="0.5"
                      placeholder="Total ₹"
                      value={denominations.coins}
                      onChange={(e) => handleDenomChange('coins', e.target.value)}
                      style={{ width: '100%', padding: '6px 8px', borderRadius: 6, border: '1px solid #e2e8f0', fontSize: 13, boxSizing: 'border-box' }}
                    />
                  </div>
                </div>
                <div style={{ marginTop: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 8, borderTop: '1px dashed #cbd5e1' }}>
                  <span style={{ fontSize: 12, color: '#64748b' }}>Counted Total:</span>
                  <span style={{ fontSize: 16, fontWeight: 800, color: '#0f172a' }}>
                    {fmt(calcDenominationTotal(denominations))}
                  </span>
                </div>
              </div>
            )}

            <label style={{ display: 'block', marginBottom: 8 }}>
              Actual closing cash
              <input
                type="number"
                min="0"
                step="0.01"
                required
                value={closingCash}
                onChange={(event) => handleClosingCashChange(event.target.value)}
                placeholder="Total drawer cash (₹)"
                style={{ display: 'block', width: '100%', padding: 10, marginTop: 6, boxSizing: 'border-box', fontWeight: 700, fontSize: 15 }}
              />
            </label>

            {/* 🔔 Variance Alert */}
            {varianceAlert && closingCash && (
              <div style={{
                padding: '10px 14px', borderRadius: 10, marginBottom: 12,
                background: varianceAlert.diff === 0 ? '#f0fdf4' : Math.abs(varianceAlert.diff) <= 10 ? '#fffbeb' : varianceAlert.diff > 0 ? '#f0fdf4' : '#fef2f2',
                border: `1px solid ${varianceAlert.diff === 0 ? '#86efac' : Math.abs(varianceAlert.diff) <= 10 ? '#fde68a' : varianceAlert.diff > 0 ? '#86efac' : '#fca5a5'}`,
                display: 'flex', alignItems: 'center', gap: 10
              }}>
                <span style={{ fontSize: 20 }}>
                  {varianceAlert.diff === 0 ? '✅' : Math.abs(varianceAlert.diff) <= 10 ? '⚠️' : varianceAlert.diff > 0 ? '🟢' : '🔴'}
                </span>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 13, color: varianceAlert.diff >= 0 ? '#15803d' : '#dc2626' }}>
                    {varianceAlert.diff === 0 ? 'Perfect match!' : varianceAlert.diff > 0 ? `Surplus: + ${fmt(Math.abs(varianceAlert.diff))}` : `Shortfall: − ${fmt(Math.abs(varianceAlert.diff))}`}
                  </div>
                  <div style={{ fontSize: 11, color: '#64748b' }}>Expected: {fmt(varianceAlert.expected)}</div>
                </div>
              </div>
            )}

            <label style={{ display: 'block', marginBottom: 12 }}>Notes
              <textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows="3"
                placeholder="Any remarks on cash surplus, shortage, or shift handoff..."
                style={{ display: 'block', width: '100%', padding: 10, marginTop: 6, boxSizing: 'border-box' }} />
            </label>
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="submit" style={{ padding: '10px 16px', background: '#b91c1c', color: '#fff', border: 0, borderRadius: 8, cursor: 'pointer', fontWeight: 600 }}>Close Shift</button>
              {liveSummary && (
                <button type="button" onClick={async () => {
                  const s = liveSummary || await fetchLiveSummary();
                  setPrintData({
                    shift,
                    summary: s,
                    closingCash: closingCash ? Number(closingCash) : null,
                    denominations,
                    notes,
                    cashierName: currentUser?.name || 'Unknown',
                    businessDate: shift.businessDate,
                    shiftStarted: shift.createdAt
                  });
                }} style={{ padding: '10px 14px', background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: 8, cursor: 'pointer', fontWeight: 600 }}>
                  🖨️ Preview Report
                </button>
              )}
            </div>
          </form>
        </div>
      )}

      {/* Shift History */}
      <div style={{ marginTop: 24, background: '#fff', padding: 20, borderRadius: 12, border: '1px solid #e2e8f0', overflowX: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
          <h3 style={{ margin: 0 }}>Shift History</h3>
          {/* 🔍 Filter Bar */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <input type="date" value={filterFrom} onChange={(e) => setFilterFrom(e.target.value)}
              title="From date" style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13 }} />
            <input type="date" value={filterTo} onChange={(e) => setFilterTo(e.target.value)}
              title="To date" style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13 }} />
            <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}
              style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13 }}>
              <option value="">All Status</option>
              <option value="open">Open</option>
              <option value="closed">Closed</option>
              <option value="handed-over">Handed Over</option>
            </select>
            {(filterFrom || filterTo || filterStatus) && (
              <button onClick={() => { setFilterFrom(''); setFilterTo(''); setFilterStatus(''); }}
                style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid #e2e8f0', background: '#f8fafc', cursor: 'pointer', fontSize: 13 }}>
                ✕ Clear
              </button>
            )}
          </div>
        </div>

        {(() => {
          const filtered = history.filter(item => {
            if (filterStatus && item.status !== filterStatus) return false;
            if (filterFrom && item.businessDate < filterFrom) return false;
            if (filterTo && item.businessDate > filterTo) return false;
            return true;
          });
          if (filtered.length === 0) return <p style={{ color: '#94a3b8' }}>{history.length === 0 ? 'No shift records found.' : 'No records match the filter.'}</p>;
          return (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid #e2e8f0' }}>
                  <th align="left" style={{ padding: '6px 4px' }}>Date</th>
                  <th align="left" style={{ padding: '6px 4px' }}>Cashier</th>
                  <th align="right" style={{ padding: '6px 4px' }}>Expected</th>
                  <th align="right" style={{ padding: '6px 4px' }}>Actual</th>
                  <th align="right" style={{ padding: '6px 4px' }}>Variance</th>
                  <th align="left" style={{ padding: '6px 4px' }}>Status</th>
                  <th style={{ padding: '6px 4px' }} />
                </tr>
              </thead>
              <tbody>
                {filtered.map((item) => {
                  const variance = item.variance ?? null;
                  const varColor = variance === null ? '#64748b' : variance >= 0 ? '#15803d' : '#dc2626';
                  const statusColors = { open: { bg: '#dbeafe', text: '#1d4ed8' }, closed: { bg: '#fef9c3', text: '#854d0e' }, 'handed-over': { bg: '#dcfce7', text: '#166534' } };
                  const sc = statusColors[item.status] || { bg: '#f1f5f9', text: '#475569' };
                  return (
                    <tr key={item._id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '8px 4px' }}>{item.businessDate}</td>
                      <td style={{ padding: '8px 4px' }}>{item.cashier?.name || '—'}</td>
                      <td align="right" style={{ padding: '8px 4px' }}>{item.expectedCash == null ? '—' : fmt(item.expectedCash)}</td>
                      <td align="right" style={{ padding: '8px 4px' }}>{item.closingCash == null ? '—' : fmt(item.closingCash)}</td>
                      <td align="right" style={{ padding: '8px 4px', fontWeight: 700, color: varColor }}>
                        {variance === null ? '—' : (variance >= 0 ? '▲ ' : '▼ ') + fmt(Math.abs(variance))}
                      </td>
                      <td style={{ padding: '8px 4px' }}>
                        <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 12, fontSize: 12, fontWeight: 600, background: sc.bg, color: sc.text }}>
                          {item.status}
                        </span>
                      </td>
                      <td style={{ padding: '8px 4px', whiteSpace: 'nowrap' }}>
                        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                          {item.status !== 'open' && (
                            <button
                              onClick={() => setPrintData({
                                shift: item,
                                summary: {
                                  expectedCash: item.expectedCash,
                                  cashSales: Math.max(0, (item.expectedCash || 0) - (item.openingCash || 0)),
                                  shiftDuration: 'Closed',
                                },
                                closingCash: item.closingCash,
                                denominations: item.denominations,
                                notes: item.notes,
                                cashierName: item.cashier?.name || 'Cashier',
                                businessDate: item.businessDate,
                                shiftStarted: item.createdAt
                              })}
                              title="View Z-Report / Print / WhatsApp"
                              style={{ padding: '5px 9px', borderRadius: 6, border: '1px solid #cbd5e1', background: '#f8fafc', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}
                            >
                              🖨️ Z-Report
                            </button>
                          )}
                          {item.status === 'closed' && ['admin', 'manager'].includes(currentUser?.role) && (
                            <button onClick={() => approveShift(item._id)} style={{ padding: '5px 9px', borderRadius: 6, border: '1px solid #16a34a', background: '#f0fdf4', color: '#166534', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
                              Approve
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          );
        })()}
      </div>
      </div>
    </div>
  );
}
