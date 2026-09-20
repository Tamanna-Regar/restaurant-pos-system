import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../api';

const today = new Date().toISOString().slice(0, 10);

const money = (value) => `₹${Number(value || 0).toFixed(2)}`;
const downloadCsv = (rows, filename) => {
  const csv = rows.map((row) => row.map((cell) => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
  const link = document.createElement('a');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
};

export default function ReportsAndCosting() {
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [report, setReport] = useState(null);
  const [tax, setTax] = useState(null);
  const [ownerProfit, setOwnerProfit] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const loadReports = useCallback(async () => {
    if (from > to) {
      setError('From date cannot be after To date.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const query = `?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;
      const [foodCostResponse, taxResponse, ownerProfitResponse] = await Promise.all([
        api.get(`/reports/food-cost${query}`),
        api.get(`/reports/tax${query}`),
        api.get(`/reports/owner-profit${query}`)
      ]);
      setReport(foodCostResponse.data?.data || null);
      setTax(taxResponse.data?.data || null);
      setOwnerProfit(ownerProfitResponse.data?.data || null);
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Reports could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, [from, to]);

  useEffect(() => {
    loadReports();
  }, [loadReports]);

  const exportCsv = () => {
    if (!report?.rows?.length) return;
    const rows = [
      ['Item', 'Quantity Sold', 'Sales', 'Unit Cost', 'Food Cost', 'Margin'],
      ...report.rows.map((row) => [row.name, row.quantity, row.sales, row.unitCost, row.cost, row.margin])
    ];
    downloadCsv(rows, `food-cost-${from}-to-${to}.csv`);
  };

  const exportTaxCsv = () => {
    if (!tax) return;
    const rows = [
      ['From', 'To', 'Taxable Sales', 'Tax Collected', 'CGST', 'SGST', 'IGST', 'Invoices'],
      [tax.from, tax.to, tax.taxableSales || 0, tax.taxCollected || 0, tax.cgst || 0, tax.sgst || 0, tax.igst || 0, tax.invoices || 0]
    ];
    (tax.rateBreakdown || []).forEach((row) => rows.push([tax.from, tax.to, row.taxableSales || 0, row.taxCollected || 0, row.cgst || 0, row.sgst || 0, row.igst || 0, row.invoices || 0]));
    downloadCsv(rows, `gst-tax-report-${from}-to-${to}.csv`);
  };

  const exportOwnerCsv = () => {
    if (!ownerProfit) return;
    const inventory = ownerProfit.inventory || {};
    const rows = [
      ['Owner Profit & Loss Report', `${from} to ${to}`],
      ['Metric', 'Amount'],
      ['Revenue', ownerProfit.revenue || 0],
      ['Food / Stock Used Cost', inventory.usedCost || 0],
      ['Waste Cost', inventory.wasteCost || 0],
      ['Staff Salaries', ownerProfit.salaryCost || 0],
      ['Operating Expenses', ownerProfit.operatingExpenses || 0],
      ['Online Commission', ownerProfit.onlineCommission || 0],
      ['Total Costs', ownerProfit.totalCosts || 0],
      ['Net Profit', ownerProfit.netProfit || 0],
      ['Profit Margin %', ownerProfit.profitMargin || 0],
      [],
      ['Inventory Item', 'Current Quantity', 'Unit', 'Current Value'],
      ...(inventory.ingredients || []).map((item) => [item.name, item.currentStock, item.unit, item.value])
    ];
    downloadCsv(rows, `owner-profit-${from}-to-${to}.csv`);
  };

  const printReport = () => {
    if (!ownerProfit && !report && !tax) return;
    window.print();
  };

  const periodPresets = ['Today', 'This Week', 'This Month', 'This Quarter', 'This Year'];

  const dateKey = (date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const applyPreset = (preset) => {
    const end = new Date();
    const start = new Date(end);
    if (preset === 'Today') {
      // Keep today's date.
    } else if (preset === 'This Week') {
      const day = start.getDay();
      start.setDate(start.getDate() - (day === 0 ? 6 : day - 1));
    } else if (preset === 'This Month') {
      start.setDate(1);
    } else if (preset === 'This Quarter') {
      start.setMonth(Math.floor(start.getMonth() / 3) * 3, 1);
    } else {
      start.setMonth(0, 1);
    }
    setFrom(dateKey(start));
    setTo(dateKey(end));
  };

  const cards = useMemo(() => [
    ['Sales', money(report?.totalSales), '#0f766e'],
    ['Food Cost', money(report?.totalCost), '#b45309'],
    ['Food Cost %', `${Number(report?.foodCostPercent || 0).toFixed(2)}%`, '#7c3aed'],
    ['Gross Margin', money(report?.grossMargin), '#166534'],
    ['Tax Collected', money(tax?.taxCollected), '#1d4ed8'],
    ['CGST', money(tax?.cgst), '#2563eb'],
    ['SGST', money(tax?.sgst), '#7c3aed'],
    ['IGST', money(tax?.igst), '#c2410c']
  ], [report, tax]);

  return (
    <div className="reports-costing-page" style={{ flex: 1, overflowY: 'auto', padding: 24, background: '#f8fafc' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 18 }}>
        <div>
          <h2 style={{ margin: 0, color: '#0f172a' }}>📊 Reports & Food Cost</h2>
          <p style={{ margin: '5px 0 0', color: '#64748b', fontSize: 13 }}>Sales, tax and recipe-cost visibility.</p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'end', flexWrap: 'wrap' }}>
          <label style={{ fontSize: 12, color: '#475569' }}>From<input type="date" value={from} onChange={(e) => setFrom(e.target.value)} style={{ display: 'block', padding: 7, border: '1px solid #cbd5e1', borderRadius: 6 }} /></label>
          <label style={{ fontSize: 12, color: '#475569' }}>To<input type="date" value={to} onChange={(e) => setTo(e.target.value)} style={{ display: 'block', padding: 7, border: '1px solid #cbd5e1', borderRadius: 6 }} /></label>
          <button onClick={loadReports} disabled={loading} style={{ padding: '8px 12px', border: 0, borderRadius: 7, background: '#0f172a', color: '#fff', cursor: 'pointer' }}>{loading ? 'Loading...' : 'Refresh'}</button>
          <button onClick={exportCsv} disabled={!report?.rows?.length} style={{ padding: '8px 12px', border: '1px solid #cbd5e1', borderRadius: 7, background: '#fff', cursor: 'pointer' }}>Export CSV</button>
          <button onClick={exportTaxCsv} disabled={!tax} style={{ padding: '8px 12px', border: '1px solid #cbd5e1', borderRadius: 7, background: '#fff', cursor: 'pointer' }}>GST CSV</button>
          <button onClick={exportOwnerCsv} disabled={!ownerProfit} style={{ padding: '8px 12px', border: '1px solid #cbd5e1', borderRadius: 7, background: '#fff', cursor: 'pointer' }}>Excel Report</button>
          <button onClick={printReport} disabled={!ownerProfit && !report && !tax} style={{ padding: '8px 12px', border: 0, borderRadius: 7, background: '#0f766e', color: '#fff', cursor: 'pointer' }}>Print / PDF</button>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
        {periodPresets.map((label) => <button key={label} onClick={() => applyPreset(label)} style={{ padding: '8px 12px', border: '1px solid #cbd5e1', borderRadius: 7, background: '#fff', color: '#334155', cursor: 'pointer' }}>{label}</button>)}
      </div>
      {error && <div style={{ padding: 10, marginBottom: 12, borderRadius: 7, background: '#fee2e2', color: '#991b1b' }}>{error}</div>}
      <div style={{ background: '#0f172a', color: '#fff', borderRadius: 12, padding: 18, marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 11, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 1 }}>Owner Profit & Loss</div>
            <div style={{ fontSize: 28, fontWeight: 800, color: Number(ownerProfit?.netProfit || 0) >= 0 ? '#86efac' : '#fca5a5', marginTop: 5 }}>{money(ownerProfit?.netProfit)}</div>
            <div style={{ fontSize: 12, color: '#cbd5e1' }}>{Number(ownerProfit?.profitMargin || 0).toFixed(2)}% net margin · {ownerProfit?.bills || 0} paid bills</div>
          </div>
          <div style={{ fontSize: 12, color: '#cbd5e1', lineHeight: 1.7 }}>
            Revenue: <strong style={{ color: '#fff' }}>{money(ownerProfit?.revenue)}</strong><br />
            Total costs: <strong style={{ color: '#fca5a5' }}>{money(ownerProfit?.totalCosts)}</strong>
          </div>
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 12, marginBottom: 16 }}>
        {[
          ['Stock Used', ownerProfit?.inventory?.usedCost, '#b45309'],
          ['Waste Cost', ownerProfit?.inventory?.wasteCost, '#dc2626'],
          ['Staff Salaries', ownerProfit?.salaryCost, '#7c3aed'],
          ['Other Expenses', ownerProfit?.operatingExpenses, '#c2410c'],
          ['Current Stock Value', ownerProfit?.inventory?.currentStockValue, '#0369a1']
        ].map(([label, value, color]) => <div key={label} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, padding: 14 }}><div style={{ color: '#64748b', fontSize: 11 }}>{label}</div><strong style={{ color, fontSize: 18 }}>{money(value)}</strong></div>)}
      </div>
      {tax && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 12, marginBottom: 16 }}>
          <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, padding: 14 }}>
            <strong style={{ fontSize: 12, color: '#334155' }}>Invoice Classification</strong>
            {(tax.invoiceTypes || []).map((row) => <div key={row._id} style={{ display: 'flex', justifyContent: 'space-between', marginTop: 9, fontSize: 12 }}><span>{row._id}</span><span>{row.invoices} invoices · {money(row.taxCollected)}</span></div>)}
          </div>
          <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, padding: 14 }}>
            <strong style={{ fontSize: 12, color: '#334155' }}>GST Rate Breakdown</strong>
            {(tax.rateBreakdown || []).map((row) => <div key={String(row._id)} style={{ display: 'flex', justifyContent: 'space-between', marginTop: 9, fontSize: 12 }}><span>{Number(row._id || 0)}% · {row.invoices} invoices</span><span>{money(row.taxCollected)}</span></div>)}
          </div>
        </div>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(260px,1fr))', gap: 16, marginBottom: 16 }}>
        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, padding: 14 }}>
          <div style={{ fontWeight: 700, marginBottom: 10 }}>Inventory Movement</div>
          <div style={{ fontSize: 13, lineHeight: 1.9, color: '#475569' }}>
            Stock used: <strong>{Number(ownerProfit?.inventory?.usedQuantity || 0).toFixed(2)}</strong><br />
            Waste quantity: <strong style={{ color: '#dc2626' }}>{Number(ownerProfit?.inventory?.wasteQuantity || 0).toFixed(2)}</strong><br />
            Purchases: <strong>{money(ownerProfit?.inventory?.purchasesCost)}</strong>
          </div>
        </div>
        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, padding: 14 }}>
          <div style={{ fontWeight: 700, marginBottom: 10 }}>Expense Breakdown</div>
          {(ownerProfit?.expenseRows || []).length ? ownerProfit.expenseRows.map((row) => <div key={row.category} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '5px 0', borderBottom: '1px solid #f1f5f9' }}><span>{row.category}</span><strong>{money(row.amount)}</strong></div>) : <div style={{ color: '#64748b', fontSize: 13 }}>No expenses in this period.</div>}
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(145px,1fr))', gap: 12, marginBottom: 16 }}>
        {cards.map(([label, value, color]) => <div key={label} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, padding: 14 }}><div style={{ color: '#64748b', fontSize: 11 }}>{label}</div><strong style={{ color, fontSize: 18 }}>{value}</strong></div>)}
      </div>
      <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, overflow: 'hidden' }}>
        <div style={{ padding: 14, fontWeight: 700, color: '#0f172a' }}>Item-wise Food Cost</div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead><tr style={{ background: '#f1f5f9', color: '#475569', textAlign: 'left' }}>{['Item', 'Qty', 'Sales', 'Unit Cost', 'Food Cost', 'Margin'].map((heading) => <th key={heading} style={{ padding: 10 }}>{heading}</th>)}</tr></thead>
            <tbody>
              {(report?.rows || []).map((row) => <tr key={String(row._id)} style={{ borderTop: '1px solid #f1f5f9' }}><td style={{ padding: 10, fontWeight: 600 }}>{row.name}</td><td style={{ padding: 10 }}>{row.quantity}</td><td style={{ padding: 10 }}>{money(row.sales)}</td><td style={{ padding: 10 }}>{money(row.unitCost)}</td><td style={{ padding: 10, color: '#b45309' }}>{money(row.cost)}</td><td style={{ padding: 10, color: '#166534', fontWeight: 700 }}>{money(row.margin)}</td></tr>)}
              {!report?.rows?.length && <tr><td colSpan="6" style={{ padding: 24, textAlign: 'center', color: '#64748b' }}>No food-cost data is available for the selected period.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
