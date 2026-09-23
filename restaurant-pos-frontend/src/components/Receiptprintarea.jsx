import React from 'react';
import { QRCodeCanvas } from 'qrcode.react';

// ---------------------------------------------------------------------------
// Printable Final Tax Invoice (GST Compliant)
// ---------------------------------------------------------------------------
export function ReceiptPrintArea({ receiptData, restaurantSettings }) {
  if (!receiptData) return null;
  const { customerName, customerPhone, customerGstin, invoiceNumber, tableLabel, celebrationOccasion, celebrantName, items = [], subTotal = 0, discount = 0, discountAmt = 0, tax = 0, cgst, sgst, igst, isInterState, gstRate, grandTotal = 0, paymentMode = 'Cash', createdAt, waiterName } = receiptData;
  const settings = restaurantSettings || {};

  const upiUri = settings.upiId
    ? `upi://pay?pa=${settings.upiId}&pn=${encodeURIComponent(settings.name || 'Tamanna Restaurant')}&am=${grandTotal.toFixed(2)}&cu=INR&tn=Invoice%20${invoiceNumber || ''}`
    : '';

  return (
    <div id="receipt-print-area" style={{ display: 'none' }}>
      <div style={{ width: '220px', fontFamily: 'monospace', fontSize: '12px', padding: '10px', color: '#000', wordBreak: 'break-word' }}>
        <h3 style={{ textAlign: 'center', margin: '0 0 4px 0', fontSize: '16px' }}>{settings.name || 'TAMANNA RESTAURANT'}</h3>
        {settings.address && <div style={{ textAlign: 'center', fontSize: '10px' }}>{settings.address}</div>}
        {settings.phone && <div style={{ textAlign: 'center', fontSize: '10px' }}>Ph: {settings.phone}</div>}
        {settings.gstin && <div style={{ textAlign: 'center', fontSize: '10px' }}>GSTIN: {settings.gstin}</div>}
        {settings.fssai && <div style={{ textAlign: 'center', fontSize: '10px' }}>FSSAI: {settings.fssai}</div>}
        <div style={{ textAlign: 'center', margin: '6px 0', fontSize: '10px' }}>TAX INVOICE / BILL</div>
        {invoiceNumber && <div style={{ textAlign: 'center', fontWeight: 'bold', fontSize: '11px' }}>Invoice No: {invoiceNumber}</div>}
        <div style={{ textAlign: 'center', marginBottom: '6px', fontSize: '10px' }}>{new Date(createdAt || Date.now()).toLocaleString('en-IN')}</div>
        {celebrationOccasion && (
          <div style={{ textAlign: 'center', fontWeight: 'bold', fontSize: '11px', margin: '4px 0', border: '1px dashed #000', padding: '3px' }}>
            🎉 CELEBRATION: {celebrationOccasion.toUpperCase()}
            {celebrantName && <div>Host: {celebrantName}</div>}
          </div>
        )}
        <hr style={{ borderTop: '1px dashed #000' }} />
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span>Table: {tableLabel}</span>
          <span>Waiter: {waiterName || 'Staff'}</span>
        </div>
        <div>Customer: {customerName || 'Walk-in'}</div>
        {customerPhone && <div>Phone: {customerPhone}</div>}
        {customerGstin && <div>GSTIN: {customerGstin}</div>}
        <hr style={{ borderTop: '1px dashed #000' }} />
        <div style={{ display: 'grid', gridTemplateColumns: '3fr 1fr 1.5fr', fontWeight: 'bold', marginBottom: '4px' }}>
          <span>ITEM / HSN</span>
          <span style={{ textAlign: 'center' }}>QTY</span>
          <span style={{ textAlign: 'right' }}>AMT</span>
        </div>
        {items.map((it, idx) => (
          <div key={idx} style={{ display: 'grid', gridTemplateColumns: '3fr 1fr 1.5fr', margin: '2px 0' }}>
            <span>{it.name} {it.portion === 'Half' ? '(H)' : ''}{it.hsnSac ? ` · ${it.hsnSac}` : ''}</span>
            <span style={{ textAlign: 'center' }}>{it.quantity}</span>
            <span style={{ textAlign: 'right' }}>₹{(it.price * it.quantity).toFixed(2)}</span>
          </div>
        ))}
        <hr style={{ borderTop: '1px dashed #000' }} />
        <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Subtotal</span><span>₹{subTotal.toFixed(2)}</span></div>
        {discount > 0 && (
          <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Discount ({discount}%)</span><span>-₹{discountAmt.toFixed(2)}</span></div>
        )}
        {isInterState ? (
          <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>IGST ({Number(gstRate || 0)}%)</span><span>₹{Number(igst ?? tax).toFixed(2)}</span></div>
        ) : (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>CGST ({Number(gstRate || 0) / 2}%)</span><span>₹{Number(cgst ?? tax / 2).toFixed(2)}</span></div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>SGST ({Number(gstRate || 0) / 2}%)</span><span>₹{Number(sgst ?? tax / 2).toFixed(2)}</span></div>
          </>
        )}
        <hr style={{ borderTop: '1px dashed #000' }} />
        <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', fontSize: '14px' }}>
          <span>GRAND TOTAL</span><span>₹{grandTotal.toFixed(2)}</span>
        </div>
        <div style={{ marginTop: '6px' }}>Payment Mode: <b>{paymentMode}</b></div>
        {upiUri && grandTotal > 0 && (
          <div style={{ textAlign: 'center', margin: '8px 0', padding: '6px 4px', border: '1px dashed #000' }}>
            <div style={{ fontSize: '9px', fontWeight: 'bold', marginBottom: '4px' }}>SCAN & PAY VIA UPI</div>
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <QRCodeCanvas value={upiUri} size={80} level="M" />
            </div>
            <div style={{ fontSize: '8px', marginTop: '3px' }}>GPay · PhonePe · Paytm · BHIM</div>
          </div>
        )}
        <hr style={{ borderTop: '1px dashed #000' }} />
        <div style={{ textAlign: 'center', fontSize: '11px', marginTop: '6px' }}>Thank you! Visit again.</div>
      </div>
    </div>
  );
}
export default ReceiptPrintArea;