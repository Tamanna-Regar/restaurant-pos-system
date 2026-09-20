import React, { useState, useEffect } from 'react';
import { QRCodeCanvas } from 'qrcode.react';

// ---------------------------------------------------------------------------
// 1. Indian Standard FSSAI Veg / Non-Veg / Egg Badge
// ---------------------------------------------------------------------------
export function VegNonVegBadge({ type = 'veg', size = 16 }) {
  const isVeg = type === 'veg' || !type;
  const isEgg = type === 'egg';
  const color = isVeg ? '#16a34a' : isEgg ? '#eab308' : '#dc2626';

  return (
    <div
      title={isVeg ? 'Vegetarian' : isEgg ? 'Egg' : 'Non-Vegetarian'}
      style={{
        width: `${size}px`,
        height: `${size}px`,
        border: `2px solid ${color}`,
        borderRadius: '3px',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#ffffff',
        flexShrink: 0
      }}
    >
      {isVeg || isEgg ? (
        <div
          style={{
            width: `${Math.round(size * 0.55)}px`,
            height: `${Math.round(size * 0.55)}px`,
            borderRadius: '50%',
            backgroundColor: color
          }}
        />
      ) : (
        <div
          style={{
            width: 0,
            height: 0,
            borderLeft: `${Math.round(size * 0.3)}px solid transparent`,
            borderRight: `${Math.round(size * 0.3)}px solid transparent`,
            borderBottom: `${Math.round(size * 0.55)}px solid ${color}`
          }}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 2. Table Card with Live Timer, Running Amount & Direct Actions
// ---------------------------------------------------------------------------
export function TableCard({
  table,
  activeOrder,
  isSelected,
  onSelect,
  onAddKOT,
  onPrintBill,
  onSettle,
  onShiftTable
}) {
  const [elapsedMinutes, setElapsedMinutes] = useState(0);

  useEffect(() => {
    if (!activeOrder?.createdAt) {
      setElapsedMinutes(0);
      return;
    }
    const updateElapsed = () => {
      const diffMs = Date.now() - new Date(activeOrder.createdAt).getTime();
      setElapsedMinutes(Math.max(0, Math.floor(diffMs / 60000)));
    };
    updateElapsed();
    const interval = setInterval(updateElapsed, 30000);
    return () => clearInterval(interval);
  }, [activeOrder]);

  const status = table.status?.toLowerCase() || 'available';
  const isOccupied = status === 'occupied';
  const isBilled = status === 'billed';
  const isReserved = status === 'reserved';
  const isAvailable = status === 'available';

  // Theme colors
  const statusColor = isOccupied ? '#ef4444' : isBilled ? '#2563eb' : isReserved ? '#8b5cf6' : '#10b981';
  const statusBg = isOccupied ? '#fef2f2' : isBilled ? '#eff6ff' : isReserved ? '#f5f3ff' : '#ecfdf5';
  const statusLabel = isOccupied ? 'Running KOT' : isBilled ? 'Billed' : isReserved ? 'Reserved' : 'Vacant';

  const runningTotal = activeOrder?.grandTotal || (activeOrder?.items || []).reduce((s, i) => s + (i.price * i.quantity), 0);
  const itemCount = (activeOrder?.items || []).reduce((s, i) => s + (i.quantity || 1), 0);

  return (
    <div
      onClick={onSelect}
      style={{
        position: 'relative',
        backgroundColor: isSelected ? '#f8fafc' : '#ffffff',
        border: `2px solid ${isSelected ? statusColor : '#e2e8f0'}`,
        borderTop: `4px solid ${statusColor}`,
        borderRadius: '10px',
        padding: '12px 14px',
        minWidth: '150px',
        maxWidth: '180px',
        cursor: 'pointer',
        boxShadow: isSelected ? '0 4px 12px rgba(0,0,0,0.1)' : '0 1px 3px rgba(0,0,0,0.04)',
        transition: 'all 0.15s ease-in-out',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between'
      }}
    >
      {/* Table Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
        <div>
          <span style={{ fontSize: '15px', fontWeight: 'bold', color: '#0f172a' }}>
            T-{table.tableNo || table.tableNumber}
          </span>
          <span style={{ fontSize: '11px', color: '#64748b', marginLeft: '6px' }}>
            ({table.capacity || 4}p)
          </span>
        </div>
        <span
          style={{
            fontSize: '10px',
            fontWeight: 'bold',
            padding: '2px 7px',
            borderRadius: '12px',
            backgroundColor: statusBg,
            color: statusColor,
            border: `1px solid ${statusColor}33`
          }}
        >
          {statusLabel}
        </span>
      </div>

      {/* Body: Running Details */}
      {(isOccupied || isBilled) && activeOrder ? (
        <div style={{ backgroundColor: '#f8fafc', borderRadius: '6px', padding: '6px 8px', marginBottom: '10px', fontSize: '12px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', color: '#0f172a', fontWeight: 'bold' }}>
            <span>₹{runningTotal.toFixed(0)}</span>
            <span style={{ color: '#64748b', fontWeight: 'normal' }}>{itemCount} items</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', color: '#64748b', fontSize: '10px', marginTop: '4px' }}>
            <span>⏱️ {elapsedMinutes} min</span>
            <span>KOT #{activeOrder.kotNumber || 1}</span>
          </div>
          {activeOrder.celebrationOccasion && (
            <div style={{
              background: 'linear-gradient(90deg, #8b5cf6, #a855f7)',
              color: '#fff',
              border: 'none',
              borderRadius: '5px',
              padding: '4px 6px',
              fontSize: '10px',
              fontWeight: 'bold',
              marginTop: '4px',
              textAlign: 'center',
              boxShadow: '0 2px 6px rgba(139,92,246,0.3)'
            }}>
              🎉 {activeOrder.celebrationOccasion} {activeOrder.celebrantName ? `— ${activeOrder.celebrantName}` : ''}
            </div>
          )}
          {activeOrder.waiterName && (
            <div style={{ fontSize: '10px', color: '#475569', marginTop: '2px' }}>
              👤 {activeOrder.waiterName}
            </div>
          )}
        </div>
      ) : (
        <div style={{
          height: '52px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#94a3b8',
          fontSize: '11px',
          textAlign: 'center',
          ...(table.floor === 'Floor 2' ? {
            background: 'linear-gradient(135deg, #fdf4ff, #f5f3ff)',
            borderRadius: '6px',
            marginBottom: '6px',
            border: '1px dashed #d8b4fe',
            padding: '4px'
          } : {})
        }}>
          <span style={{ fontWeight: '600', color: table.floor === 'Floor 2' ? '#8b5cf6' : '#64748b', fontSize: table.floor === 'Floor 2' ? '13px' : '11px' }}>
            {table.floor === 'Floor 2' ? '🎉 Party / Event Zone' : (table.type || 'Dining')}
          </span>
          <span style={{ fontSize: '10px', color: table.floor === 'Floor 2' ? '#a78bfa' : '#94a3b8', marginTop: '2px' }}>
            {table.floor === 'Floor 2' ? '🎂 Birthday · 💑 Anniversary · 🎊 Celebrate' : 'Regular Table'}
          </span>
        </div>
      )}

      {/* Action Buttons for quick POS work */}
      <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginTop: '4px' }}>
        {isAvailable && (
          <button
            onClick={(e) => { e.stopPropagation(); onSelect(); }}
            style={{
              flex: 1,
              padding: '6px 0',
              backgroundColor: '#10b981',
              color: '#fff',
              border: 'none',
              borderRadius: '5px',
              fontSize: '11px',
              fontWeight: 'bold',
              cursor: 'pointer'
            }}
          >
            + Punch KOT
          </button>
        )}

        {isOccupied && (
          <>
            <button
              onClick={(e) => { e.stopPropagation(); onAddKOT(); }}
              title="Add more items to this table"
              style={{
                flex: 1,
                padding: '5px 0',
                backgroundColor: '#0f172a',
                color: '#fff',
                border: 'none',
                borderRadius: '5px',
                fontSize: '10px',
                fontWeight: '600',
                cursor: 'pointer'
              }}
            >
              + Items
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); onPrintBill(); }}
              title="Print Customer Bill / Estimate"
              style={{
                flex: 1,
                padding: '5px 0',
                backgroundColor: '#2563eb',
                color: '#fff',
                border: 'none',
                borderRadius: '5px',
                fontSize: '10px',
                fontWeight: '600',
                cursor: 'pointer'
              }}
            >
              🧾 Bill
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); onSettle(); }}
              title="Settle & Free Table"
              style={{
                flex: 1,
                padding: '5px 0',
                backgroundColor: '#16a34a',
                color: '#fff',
                border: 'none',
                borderRadius: '5px',
                fontSize: '10px',
                fontWeight: '600',
                cursor: 'pointer'
              }}
            >
              💳 Pay
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); onShiftTable(); }}
              title="Shift table"
              style={{
                padding: '5px 6px',
                backgroundColor: '#f1f5f9',
                color: '#475569',
                border: '1px solid #cbd5e1',
                borderRadius: '5px',
                fontSize: '10px',
                cursor: 'pointer'
              }}
            >
              ⇄
            </button>
          </>
        )}

        {isBilled && (
          <>
            <button
              onClick={(e) => { e.stopPropagation(); onSettle(); }}
              style={{
                flex: 2,
                padding: '6px 0',
                backgroundColor: '#16a34a',
                color: '#fff',
                border: 'none',
                borderRadius: '5px',
                fontSize: '11px',
                fontWeight: 'bold',
                cursor: 'pointer'
              }}
            >
              💳 Settle (₹{runningTotal.toFixed(0)})
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); onPrintBill(); }}
              title="Reprint Bill"
              style={{
                flex: 1,
                padding: '6px 0',
                backgroundColor: '#f1f5f9',
                color: '#1e293b',
                border: '1px solid #cbd5e1',
                borderRadius: '5px',
                fontSize: '10px',
                cursor: 'pointer'
              }}
            >
              🖨️
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 3. Quick Settle Modal (Cash Change Calculator + Dynamic UPI QR)
// ---------------------------------------------------------------------------
export function QuickSettleModal({
  order,
  restaurantSettings = {},
  onClose,
  onConfirmSettle
}) {
  const [paymentMode, setPaymentMode] = useState('Cash');
  const [cashTendered, setCashTendered] = useState('');
  const [splitAmounts, setSplitAmounts] = useState({ cash: '', online: '' });
  const [paymentReference, setPaymentReference] = useState('');

  if (!order) return null;

  const total = Number(order.grandTotal || 0);
  const tenderedNum = Number(cashTendered || 0);
  const changeReturn = Math.max(0, tenderedNum - total);
  const splitTotal = Number(splitAmounts.cash || 0) + Number(splitAmounts.online || 0);
  const splitIsValid = paymentMode !== 'Split' || Math.abs(splitTotal - total) <= 0.01;

  // Quick cash note presets
  const quickCashPresets = [
    { label: 'Exact', value: total },
    { label: '₹100', value: 100 },
    { label: '₹200', value: 200 },
    { label: '₹500', value: 500 },
    { label: '₹1000', value: 1000 },
    { label: '₹2000', value: 2000 }
  ];

  // Dynamic UPI URL for QR code
  const upiId = restaurantSettings.upiId || 'restro@upi';
  const restroName = encodeURIComponent(restaurantSettings.name || 'Restro');
  const upiUri = `upi://pay?pa=${upiId}&pn=${restroName}&am=${total.toFixed(2)}&cu=INR&tn=Bill%20Payment`;
  const digitalPaymentNeedsReference = paymentMode === 'UPI/Online' || paymentMode === 'Credit/Debit Card';
  const canSettle = (paymentMode !== 'Cash' || cashTendered === '' || tenderedNum >= total)
    && splitIsValid
    && (!digitalPaymentNeedsReference || paymentReference.trim().length > 0);

  const handleSettle = () => {
    onConfirmSettle({
      paymentMode,
      cashTendered: paymentMode === 'Cash' ? tenderedNum : total,
      changeReturn: paymentMode === 'Cash' ? changeReturn : 0,
      splitAmounts: paymentMode === 'Split' ? splitAmounts : null,
      paymentReference: paymentReference.trim(),
      paymentProvider: paymentMode === 'UPI/Online' ? 'UPI QR' : paymentMode === 'Credit/Debit Card' ? 'Card POS' : 'manual'
    });
  };

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(15, 23, 42, 0.65)',
        backdropFilter: 'blur(3px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999
      }}
    >
      <div
        style={{
          backgroundColor: '#ffffff',
          borderRadius: '16px',
          width: '560px',
          maxWidth: '92vw',
          maxHeight: '90vh',
          overflowY: 'auto',
          boxShadow: '0 20px 40px rgba(0,0,0,0.25)',
          padding: '24px'
        }}
      >
        {/* Modal Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #e2e8f0', paddingBottom: '14px', marginBottom: '18px' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 'bold', color: '#0f172a' }}>
              💳 Quick Settle & Bill
            </h3>
            <span style={{ fontSize: '12px', color: '#64748b' }}>
              {order.orderType || 'Dine-In'} {order.tableId ? `· Table ${order.tableId.tableNo || order.tableId.tableNumber}` : ''} · {order.customerName || 'Walk-in'}
            </span>
          </div>
          <button
            onClick={onClose}
            style={{ border: 'none', background: 'transparent', fontSize: '20px', color: '#94a3b8', cursor: 'pointer', padding: '4px' }}
          >
            ✕
          </button>
        </div>

        {/* Bill Breakdown Summary Banner */}
        <div style={{ backgroundColor: '#f1f5f9', borderRadius: '10px', padding: '14px 18px', marginBottom: '18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: '11px', color: '#64748b', textTransform: 'uppercase', fontWeight: 'bold' }}>Total Bill Payable</div>
            <div style={{ fontSize: '28px', fontWeight: 'bold', color: '#0f172a' }}>₹{total.toFixed(2)}</div>
            <div style={{ fontSize: '11px', color: '#64748b' }}>
              Subtotal: ₹{order.subTotal?.toFixed(2) || '0'} | GST: ₹{order.tax?.toFixed(2) || '0'}
              {order.discount > 0 ? ` | Disc: -₹${order.discountAmt?.toFixed(2)}` : ''}
            </div>
          </div>
          <span style={{ backgroundColor: '#10b981', color: '#fff', padding: '6px 12px', borderRadius: '20px', fontSize: '12px', fontWeight: 'bold' }}>
            {order.items?.length || 0} Items
          </span>
        </div>

        {/* Payment Modes Tabs */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px', marginBottom: '18px' }}>
          {[
            { id: 'Cash', label: '💵 Cash', icon: '💵' },
            { id: 'UPI/Online', label: '📱 UPI / QR', icon: '📱' },
            { id: 'Credit/Debit Card', label: '💳 Card', icon: '💳' },
            { id: 'Split', label: '⚡ Split', icon: '⚡' }
          ].map((mode) => (
            <button
              key={mode.id}
              onClick={() => setPaymentMode(mode.id)}
              style={{
                padding: '10px 6px',
                borderRadius: '8px',
                border: '2px solid',
                borderColor: paymentMode === mode.id ? '#10b981' : '#e2e8f0',
                backgroundColor: paymentMode === mode.id ? '#ecfdf5' : '#ffffff',
                color: paymentMode === mode.id ? '#047857' : '#475569',
                fontSize: '12px',
                fontWeight: 'bold',
                cursor: 'pointer'
              }}
            >
              {mode.label}
            </button>
          ))}
        </div>

        {/* Dynamic Mode Content */}
        {paymentMode === 'Cash' && (
          <div style={{ backgroundColor: '#fafafa', borderRadius: '10px', padding: '16px', border: '1px solid #e2e8f0', marginBottom: '20px' }}>
            <div style={{ marginBottom: '12px' }}>
              <label style={{ fontSize: '12px', fontWeight: 'bold', color: '#475569', display: 'block', marginBottom: '6px' }}>
                Cash Tendered / Received (₹):
              </label>
              <input
                type="number"
                placeholder={`Enter amount (e.g. ${Math.ceil(total / 100) * 100})`}
                value={cashTendered}
                onChange={(e) => setCashTendered(e.target.value)}
                style={{
                  width: '100%',
                  boxSizing: 'border-box',
                  padding: '12px 14px',
                  borderRadius: '8px',
                  border: '2px solid #cbd5e1',
                  fontSize: '18px',
                  fontWeight: 'bold',
                  outline: 'none',
                  color: '#0f172a'
                }}
                autoFocus
              />
            </div>

            {/* Quick Cash Buttons */}
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '14px' }}>
              {quickCashPresets.map((preset, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => setCashTendered(preset.value.toString())}
                  style={{
                    padding: '6px 12px',
                    borderRadius: '6px',
                    border: '1px solid #cbd5e1',
                    backgroundColor: '#ffffff',
                    color: '#0f172a',
                    fontSize: '12px',
                    fontWeight: '600',
                    cursor: 'pointer'
                  }}
                >
                  {preset.label}
                </button>
              ))}
            </div>

            {/* Change to Return Calculation Display */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '12px 16px',
                borderRadius: '8px',
                backgroundColor: tenderedNum >= total ? '#dcfce7' : '#fee2e2',
                border: `1px solid ${tenderedNum >= total ? '#86efac' : '#fca5a5'}`
              }}
            >
              <div>
                <div style={{ fontSize: '11px', fontWeight: 'bold', color: tenderedNum >= total ? '#166534' : '#991b1b', textTransform: 'uppercase' }}>
                  {tenderedNum >= total ? 'Change to Return to Customer' : 'Amount Short / Pending'}
                </div>
                <div style={{ fontSize: '20px', fontWeight: 'bold', color: tenderedNum >= total ? '#15803d' : '#b91c1c' }}>
                  ₹{Math.abs(tenderedNum - total).toFixed(2)}
                </div>
              </div>
              <span style={{ fontSize: '24px' }}>
                {tenderedNum >= total ? '💵' : '⚠️'}
              </span>
            </div>
          </div>
        )}

        {paymentMode === 'UPI/Online' && (
          <div style={{ backgroundColor: '#fafafa', borderRadius: '10px', padding: '18px', border: '1px solid #e2e8f0', textAlign: 'center', marginBottom: '20px' }}>
            <div style={{ fontSize: '13px', fontWeight: 'bold', color: '#0f172a', marginBottom: '8px' }}>
              Scan QR Code to Pay ₹{total.toFixed(2)}
            </div>
            <div style={{ display: 'inline-block', padding: '8px', backgroundColor: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 4px 10px rgba(0,0,0,0.05)' }}>
              <QRCodeCanvas value={upiUri} size={160} includeMargin />
            </div>
            <p style={{ margin: '8px 0 0 0', fontSize: '11px', color: '#64748b' }}>
              Accepts Google Pay, PhonePe, Paytm, BHIM & all UPI apps
            </p>
            <input
              value={paymentReference}
              onChange={(e) => setPaymentReference(e.target.value)}
              placeholder="Enter UPI transaction ID / UTR"
              style={{ width: '100%', boxSizing: 'border-box', marginTop: 12, padding: '10px', borderRadius: 6, border: '1px solid #cbd5e1' }}
            />
          </div>
        )}

        {paymentMode === 'Credit/Debit Card' && (
          <div style={{ backgroundColor: '#fafafa', borderRadius: '10px', padding: '20px', border: '1px solid #e2e8f0', textAlign: 'center', marginBottom: '20px' }}>
            <span style={{ fontSize: '36px' }}>💳</span>
            <div style={{ fontSize: '14px', fontWeight: 'bold', color: '#0f172a', marginTop: '8px' }}>
              Swipe / Dip Card on POS Machine
            </div>
            <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: '#64748b' }}>
              Ensure transaction of ₹{total.toFixed(2)} is approved on card terminal.
            </p>
            <input
              value={paymentReference}
              onChange={(e) => setPaymentReference(e.target.value)}
              placeholder="Enter card approval / transaction reference"
              style={{ width: '100%', boxSizing: 'border-box', marginTop: 12, padding: '10px', borderRadius: 6, border: '1px solid #cbd5e1' }}
            />
          </div>
        )}

        {paymentMode === 'Split' && (
          <div style={{ backgroundColor: '#fafafa', borderRadius: '10px', padding: '16px', border: '1px solid #e2e8f0', marginBottom: '20px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '10px' }}>
              <div>
                <label style={{ fontSize: '11px', fontWeight: 'bold', color: '#475569' }}>Cash Part (₹):</label>
                <input
                  type="number"
                  value={splitAmounts.cash}
                  onChange={(e) => setSplitAmounts({ ...splitAmounts, cash: e.target.value })}
                  style={{ width: '100%', boxSizing: 'border-box', padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '14px', fontWeight: 'bold' }}
                />
              </div>
              <div>
                <label style={{ fontSize: '11px', fontWeight: 'bold', color: '#475569' }}>UPI / Card Part (₹):</label>
                <input
                  type="number"
                  value={splitAmounts.online}
                  onChange={(e) => setSplitAmounts({ ...splitAmounts, online: e.target.value })}
                  style={{ width: '100%', boxSizing: 'border-box', padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '14px', fontWeight: 'bold' }}
                />
              </div>
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              flex: 1,
              padding: '12px',
              backgroundColor: '#f1f5f9',
              color: '#475569',
              border: 'none',
              borderRadius: '8px',
              fontWeight: 'bold',
              cursor: 'pointer'
            }}
          >
            Cancel (Esc)
          </button>
          <button
            type="button"
            onClick={handleSettle}
            disabled={!canSettle}
            style={{
              flex: 2,
              padding: '12px',
              backgroundColor: '#10b981',
              color: '#fff',
              border: 'none',
              borderRadius: '8px',
              fontWeight: 'bold',
              fontSize: '14px',
              cursor: !canSettle ? 'not-allowed' : 'pointer',
              opacity: !canSettle ? 0.6 : 1
            }}
          >
            ✅ Complete & Settle Bill
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 4. KOT Printable Slip & Invoice Components
// ---------------------------------------------------------------------------
export function KOTPrintArea({ kotData, restaurantSettings = {} }) {
  if (!kotData) return null;
  const { kotNumber = 1, tableNo, waiterName, items = [], createdAt = new Date(), orderType = 'Dine-In' } = kotData;

  return (
    <div id="kot-print-area" style={{ display: 'none' }}>
      <div style={{ width: '220px', fontFamily: 'monospace', fontSize: '12px', padding: '10px', color: '#000', wordBreak: 'break-word' }}>
        <div style={{ textAlign: 'center', borderBottom: '2px dashed #000', paddingBottom: '6px', marginBottom: '6px' }}>
          <h2 style={{ margin: '0 0 2px 0', fontSize: '16px' }}>{restaurantSettings.name || 'TAMANNA RESTRO'}</h2>
          <div style={{ fontWeight: 'bold', fontSize: '14px' }}>** KITCHEN ORDER TICKET **</div>
          <div style={{ fontSize: '13px', fontWeight: 'bold' }}>KOT #{kotNumber} ({orderType})</div>
          {kotData.celebrationOccasion && (
            <div style={{ fontSize: '12px', fontWeight: 'bold', marginTop: '3px', textTransform: 'uppercase' }}>
              🎉 {kotData.celebrationOccasion} {kotData.celebrantName ? `(${kotData.celebrantName})` : ''}
            </div>
          )}
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px', fontWeight: 'bold' }}>
          <span>Table: {tableNo || 'N/A'}</span>
          <span>Captain: {waiterName || 'Staff'}</span>
        </div>
        <div style={{ fontSize: '11px', marginBottom: '6px' }}>
          Time: {new Date(createdAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
        </div>
        <div style={{ borderBottom: '1px solid #000', marginBottom: '6px' }} />

        <div style={{ display: 'grid', gridTemplateColumns: '3fr 1fr', fontWeight: 'bold', borderBottom: '1px dashed #000', paddingBottom: '4px', marginBottom: '6px' }}>
          <span>ITEM NAME</span>
          <span style={{ textAlign: 'right' }}>QTY</span>
        </div>

        {items.map((it, idx) => (
          <div key={idx} style={{ marginBottom: '6px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '3fr 1fr', fontWeight: 'bold' }}>
              <span>{it.name} {it.portion === 'Half' ? '(H)' : ''}</span>
              <span style={{ textAlign: 'right', fontSize: '14px' }}>x{it.quantity}</span>
            </div>
            {it.notes && (
              <div style={{ fontSize: '11px', fontStyle: 'italic', paddingLeft: '10px', color: '#000' }}>
                👉 Note: {it.notes}
              </div>
            )}
          </div>
        ))}

        <div style={{ borderBottom: '2px dashed #000', marginTop: '8px', marginBottom: '6px' }} />
        <div style={{ textAlign: 'center', fontSize: '10px', fontWeight: 'bold' }}>
          TOTAL ITEMS: {items.reduce((s, i) => s + (i.quantity || 1), 0)}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 5. Shift Table Modal
// ---------------------------------------------------------------------------
export function ShiftTableModal({ currentTable, availableTables = [], onClose, onConfirmShift }) {
  const [targetTableId, setTargetTableId] = useState('');

  if (!currentTable) return null;

  return (
    <div
      style={{
        position: 'fixed',
        top: 0, left: 0, right: 0, bottom: 0,
        backgroundColor: 'rgba(15, 23, 42, 0.6)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 9999
      }}
    >
      <div style={{ backgroundColor: '#fff', borderRadius: '12px', padding: '24px', width: '380px' }}>
        <h3 style={{ margin: '0 0 8px 0', fontSize: '18px', color: '#0f172a' }}>⇄ Shift / Transfer Table</h3>
        <p style={{ margin: '0 0 16px 0', fontSize: '13px', color: '#64748b' }}>
          Shift active order from <b>Table {currentTable.tableNo || currentTable.tableNumber}</b> to an empty table:
        </p>

        <div style={{ marginBottom: '16px' }}>
          <label style={{ fontSize: '12px', fontWeight: 'bold', color: '#475569', display: 'block', marginBottom: '6px' }}>
            Select Target Table:
          </label>
          <select
            value={targetTableId}
            onChange={(e) => setTargetTableId(e.target.value)}
            style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '14px' }}
          >
            <option value="">-- Choose Vacant Table --</option>
            {availableTables
              .filter(t => t._id !== currentTable._id && t.status === 'available')
              .map(t => (
                <option key={t._id} value={t._id}>
                  Table {t.tableNo || t.tableNumber} ({t.floor || 'Floor 1'}) - Cap {t.capacity || 4}
                </option>
              ))}
          </select>
        </div>

        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={onClose}
            style={{ flex: 1, padding: '10px', backgroundColor: '#f1f5f9', border: 'none', borderRadius: '6px', cursor: 'pointer' }}
          >
            Cancel
          </button>
          <button
            onClick={() => {
              if (!targetTableId) return alert('Select a target table.');
              onConfirmShift(currentTable._id, targetTableId);
            }}
            style={{ flex: 1, padding: '10px', backgroundColor: '#2563eb', color: '#fff', border: 'none', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer' }}
          >
            Shift Table
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 6. Item Modifier / Cooking Notes Modal (e.g. "Less Spicy", "Jain", custom)
// ---------------------------------------------------------------------------
export function ItemModifierModal({ item, onClose, onSaveNotes }) {
  const [notes, setNotes] = useState(item?.notes || '');
  if (!item) return null;

  const presets = ['Less Spicy', 'Extra Spicy', 'Jain / No Onion Garlic', 'No Onion', 'Extra Crispy', 'Less Oil', 'Fast Serve'];

  return (
    <div
      style={{
        position: 'fixed',
        top: 0, left: 0, right: 0, bottom: 0,
        backgroundColor: 'rgba(15, 23, 42, 0.6)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 9999
      }}
    >
      <div style={{ backgroundColor: '#fff', borderRadius: '12px', padding: '20px', width: '380px' }}>
        <h3 style={{ margin: '0 0 6px 0', fontSize: '16px', color: '#0f172a' }}>
          👨‍🍳 Special Cooking Note
        </h3>
        <p style={{ margin: '0 0 14px 0', fontSize: '13px', color: '#64748b' }}>
          Item: <b>{item.name}</b>
        </p>

        {/* Quick Presets */}
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '14px' }}>
          {presets.map((p, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => {
                const current = notes ? `${notes}, ${p}` : p;
                setNotes(current);
              }}
              style={{
                padding: '4px 8px',
                borderRadius: '6px',
                border: '1px solid #cbd5e1',
                backgroundColor: notes.includes(p) ? '#ecfdf5' : '#f8fafc',
                color: notes.includes(p) ? '#047857' : '#334155',
                fontSize: '11px',
                cursor: 'pointer'
              }}
            >
              + {p}
            </button>
          ))}
        </div>

        <textarea
          rows={3}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Custom kitchen instruction (e.g. Serve hot, no salt)..."
          style={{
            width: '100%',
            boxSizing: 'border-box',
            padding: '10px',
            borderRadius: '6px',
            border: '1px solid #cbd5e1',
            fontSize: '13px',
            marginBottom: '14px'
          }}
        />

        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={onClose}
            style={{ flex: 1, padding: '8px', backgroundColor: '#f1f5f9', border: 'none', borderRadius: '6px', cursor: 'pointer' }}
          >
            Cancel
          </button>
          <button
            onClick={() => onSaveNotes(notes)}
            style={{ flex: 1, padding: '8px', backgroundColor: '#10b981', color: '#fff', border: 'none', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer' }}
          >
            Save Note
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 7. Keyboard Shortcuts Help Banner
// ---------------------------------------------------------------------------
export function KeyboardShortcutsBanner() {
  const shortcuts = [
    { key: 'F1', label: 'Dine-In' },
    { key: 'F2', label: 'Takeaway' },
    { key: 'F3', label: 'Delivery' },
    { key: 'F4', label: 'Search Item' },
    { key: 'F8', label: 'Punch KOT' },
    { key: 'F9', label: 'Settle Bill' }
  ];

  return (
    <div style={{ backgroundColor: '#1e293b', color: '#94a3b8', padding: '6px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '11px' }}>
      <span style={{ fontWeight: '600', color: '#e2e8f0' }}>⚡ Fast Billing Shortcuts:</span>
      <div style={{ display: 'flex', gap: '12px' }}>
        {shortcuts.map(s => (
          <span key={s.key}>
            <kbd style={{ backgroundColor: '#334155', color: '#38bdf8', padding: '1px 5px', borderRadius: '4px', fontWeight: 'bold', marginRight: '4px' }}>
              {s.key}
            </kbd>
            {s.label}
          </span>
        ))}
      </div>
    </div>
  );
}
