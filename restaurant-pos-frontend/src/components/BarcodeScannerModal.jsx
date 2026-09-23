import React, { useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';

export default function BarcodeScannerModal({ isOpen, onClose, onScanSuccess, title = 'Scan Barcode / QR Code' }) {
  const [errorMessage, setErrorMessage] = useState('');
  const [manualCode, setManualCode] = useState('');
  const html5QrCodeRef = useRef(null);
  const scannerContainerId = 'interactive-barcode-scanner-view';

  useEffect(() => {
    if (!isOpen) return;

    let isScanning = true;
    setErrorMessage('');

    const startScanner = async () => {
      try {
        const html5QrCode = new Html5Qrcode(scannerContainerId);
        html5QrCodeRef.current = html5QrCode;

        const config = {
          fps: 10,
          qrbox: { width: 250, height: 180 },
          aspectRatio: 1.333
        };

        await html5QrCode.start(
          { facingMode: 'environment' },
          config,
          (decodedText) => {
            if (!isScanning) return;
            isScanning = false;
            // Beep tone
            try {
              const ctx = new (window.AudioContext || window.webkitAudioContext)();
              const osc = ctx.createOscillator();
              osc.type = 'sine';
              osc.frequency.setValueAtTime(880, ctx.currentTime);
              osc.connect(ctx.destination);
              osc.start();
              osc.stop(ctx.currentTime + 0.15);
            } catch (e) {}

            onScanSuccess(decodedText);
            stopAndClose();
          },
          (err) => {
            // Frame error, ignore while searching
          }
        );
      } catch (err) {
        console.error('Barcode scanner start error:', err);
        setErrorMessage(err.message || 'Could not access camera. Please check camera permissions or type barcode below.');
      }
    };

    const timer = setTimeout(startScanner, 200);

    return () => {
      clearTimeout(timer);
      isScanning = false;
      if (html5QrCodeRef.current) {
        html5QrCodeRef.current.stop().catch(() => {}).then(() => {
          html5QrCodeRef.current?.clear();
        });
      }
    };
  }, [isOpen]);

  const stopAndClose = async () => {
    if (html5QrCodeRef.current) {
      try {
        await html5QrCodeRef.current.stop();
        html5QrCodeRef.current.clear();
      } catch (e) {}
    }
    onClose();
  };

  const handleManualSubmit = (e) => {
    e.preventDefault();
    if (manualCode.trim()) {
      onScanSuccess(manualCode.trim());
      stopAndClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      backgroundColor: 'rgba(15, 23, 42, 0.75)',
      backdropFilter: 'blur(4px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 99999,
      padding: '16px'
    }}>
      <div style={{
        backgroundColor: '#ffffff',
        borderRadius: '16px',
        width: '440px',
        maxWidth: '95vw',
        overflow: 'hidden',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)'
      }}>
        {/* Modal Header */}
        <div style={{
          padding: '14px 18px',
          borderBottom: '1px solid #e2e8f0',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          backgroundColor: '#f8fafc'
        }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '800', color: '#0f172a' }}>
              📷 {title}
            </h3>
            <span style={{ fontSize: '11px', color: '#64748b' }}>
              Point camera at barcode sticker or QR code
            </span>
          </div>
          <button
            onClick={stopAndClose}
            style={{
              border: 'none',
              background: '#e2e8f0',
              borderRadius: '50%',
              width: '28px',
              height: '28px',
              cursor: 'pointer',
              fontWeight: 'bold',
              color: '#475569'
            }}
          >
            ✕
          </button>
        </div>

        {/* Camera Viewport */}
        <div style={{ padding: '16px', textAlign: 'center' }}>
          {errorMessage ? (
            <div style={{
              backgroundColor: '#fee2e2',
              color: '#991b1b',
              padding: '16px',
              borderRadius: '10px',
              fontSize: '12px',
              marginBottom: '14px',
              textAlign: 'left'
            }}>
              <strong>⚠️ Camera Access Notice:</strong> {errorMessage}
            </div>
          ) : (
            <div
              id={scannerContainerId}
              style={{
                width: '100%',
                borderRadius: '10px',
                overflow: 'hidden',
                backgroundColor: '#000',
                minHeight: '220px'
              }}
            />
          )}

          {/* Manual Input Fallback */}
          <form onSubmit={handleManualSubmit} style={{ marginTop: '16px' }}>
            <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 'bold', marginBottom: '6px', textAlign: 'left' }}>
              Or Enter Barcode / Item Code Manually:
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input
                type="text"
                value={manualCode}
                onChange={(e) => setManualCode(e.target.value)}
                placeholder="e.g. 890123456001 or ITEM-001"
                style={{
                  flex: 1,
                  padding: '10px 12px',
                  borderRadius: '8px',
                  border: '1px solid #cbd5e1',
                  fontSize: '13px',
                  outline: 'none'
                }}
                autoFocus={!!errorMessage}
              />
              <button
                type="submit"
                style={{
                  backgroundColor: '#10b981',
                  color: '#fff',
                  border: 'none',
                  padding: '10px 16px',
                  borderRadius: '8px',
                  fontWeight: 'bold',
                  fontSize: '13px',
                  cursor: 'pointer'
                }}
              >
                Apply
              </button>
            </div>
          </form>
        </div>

        {/* Footer */}
        <div style={{ padding: '10px 18px', backgroundColor: '#f8fafc', borderTop: '1px solid #e2e8f0', textAlign: 'center', fontSize: '11px', color: '#94a3b8' }}>
          Supports 1D Barcodes (EAN, UPC, Code128) & 2D QR Codes
        </div>
      </div>
    </div>
  );
}

