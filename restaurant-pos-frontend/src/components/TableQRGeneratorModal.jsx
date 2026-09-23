import React, { useState, useRef } from 'react';
import { QRCodeCanvas } from 'qrcode.react';

export default function TableQRGeneratorModal({ tables = [], onClose }) {
  const [selectedTableId, setSelectedTableId] = useState('all');
  const [restaurantName, setRestaurantName] = useState('Tamanna Restaurant');
  const [tagline, setTagline] = useState('100% Pure Vegetarian Dining');
  const [wifiSsid, setWifiSsid] = useState('Tamanna_Guest_WiFi');
  const [wifiPass, setWifiPass] = useState('tamanna123');
  const printRef = useRef(null);

  const baseUrl = window.location.origin;

  const tablesToRender = selectedTableId === 'all'
    ? tables
    : tables.filter(t => (t._id === selectedTableId || t.tableNo === selectedTableId));

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[92vh] flex flex-col overflow-hidden animate-in fade-in duration-200">
        
        {/* Header - Screen only */}
        <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between print:hidden">
          <div className="flex items-center space-x-3">
            <span className="text-2xl">🪑📱</span>
            <div>
              <h2 className="text-lg font-bold">Acrylic Table QR Standee Generator</h2>
              <p className="text-xs text-slate-300">Generate & print table tent QR cards for contactless customer self-ordering</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white text-2xl font-bold px-2 py-1 rounded-lg"
          >
            &times;
          </button>
        </div>

        {/* Controls - Screen only */}
        <div className="p-4 bg-slate-50 border-b border-slate-200 grid grid-cols-1 md:grid-cols-4 gap-3 print:hidden text-xs">
          <div>
            <label className="block font-semibold text-slate-700 mb-1">Select Table:</label>
            <select
              value={selectedTableId}
              onChange={(e) => setSelectedTableId(e.target.value)}
              className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg bg-white font-medium"
            >
              <option value="all">🖨️ All Tables ({tables.length} Total)</option>
              {tables.map(t => (
                <option key={t._id || t.tableNo} value={t._id || t.tableNo}>
                  Table {t.tableNo || t.tableNumber} ({t.floor || 'Main'})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">Restaurant Name:</label>
            <input
              type="text"
              value={restaurantName}
              onChange={(e) => setRestaurantName(e.target.value)}
              className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg bg-white"
            />
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">Tagline:</label>
            <input
              type="text"
              value={tagline}
              onChange={(e) => setTagline(e.target.value)}
              className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg bg-white"
            />
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">Guest WiFi (SSID / Pass):</label>
            <div className="flex space-x-1">
              <input
                type="text"
                placeholder="SSID"
                value={wifiSsid}
                onChange={(e) => setWifiSsid(e.target.value)}
                className="w-1/2 px-2 py-1.5 border border-slate-300 rounded-lg bg-white text-xs"
              />
              <input
                type="text"
                placeholder="Password"
                value={wifiPass}
                onChange={(e) => setWifiPass(e.target.value)}
                className="w-1/2 px-2 py-1.5 border border-slate-300 rounded-lg bg-white text-xs"
              />
            </div>
          </div>
        </div>

        {/* Printable Cards Area */}
        <div ref={printRef} className="flex-1 overflow-y-auto p-6 bg-slate-100 print:bg-white print:p-0">
          <style>{`
            @media print {
              body * {
                visibility: hidden;
              }
              .print-standee-container, .print-standee-container * {
                visibility: visible;
              }
              .print-standee-container {
                position: absolute;
                left: 0;
                top: 0;
                width: 100%;
              }
              .standee-card {
                page-break-inside: avoid;
                margin-bottom: 24px;
                box-shadow: none !important;
                border: 2px dashed #0f172a !important;
              }
            }
          `}</style>

          <div className="print-standee-container grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6 justify-items-center">
            {tablesToRender.map((table) => {
              const tableNum = table.tableNo || table.tableNumber || '1';
              const targetUrl = `${baseUrl}/menu/${tableNum}`;

              return (
                <div
                  key={table._id || tableNum}
                  className="standee-card bg-white w-72 rounded-3xl border-4 border-emerald-600 shadow-xl overflow-hidden flex flex-col items-center text-center p-5 relative"
                  style={{ minHeight: '380px' }}
                >
                  {/* Decorative Pure Veg Top Badge */}
                  <div className="w-full bg-emerald-600 text-white py-1.5 px-3 rounded-full mb-3 shadow-sm flex items-center justify-center space-x-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-white border border-emerald-700"></span>
                    <span className="text-[11px] font-black tracking-wider uppercase">100% PURE VEGETARIAN</span>
                  </div>

                  <h3 className="text-xl font-black text-slate-900 tracking-tight">{restaurantName}</h3>
                  <p className="text-[11px] text-emerald-700 font-medium mb-2">{tagline}</p>

                  {/* Table Badge */}
                  <div className="my-2 bg-slate-900 text-white px-5 py-1.5 rounded-xl shadow">
                    <span className="text-xs uppercase tracking-widest font-bold text-emerald-400">TABLE</span>{' '}
                    <span className="text-2xl font-black">{tableNum}</span>
                  </div>

                  {/* High Quality QR Canvas */}
                  <div className="p-3 bg-white rounded-2xl border-2 border-emerald-500 shadow-inner my-2">
                    <QRCodeCanvas
                      value={targetUrl}
                      size={140}
                      level="H"
                      includeMargin={false}
                    />
                  </div>

                  <p className="text-xs font-bold text-slate-800 mt-1 flex items-center justify-center space-x-1">
                    <span>📲</span>
                    <span>Scan to View Menu & Order</span>
                  </p>
                  <p className="text-[10px] text-slate-500 mb-3">No App Download Needed</p>

                  {/* WiFi Credentials Box */}
                  <div className="w-full mt-auto bg-slate-50 rounded-xl p-2 border border-slate-200 text-[10px] text-slate-600 flex justify-around">
                    <div>
                      <span className="font-semibold text-slate-700">📶 WiFi:</span> {wifiSsid}
                    </div>
                    <div>
                      <span className="font-semibold text-slate-700">🔑 Pass:</span> {wifiPass}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-3 bg-slate-900 text-white flex justify-between items-center print:hidden">
          <span className="text-xs text-slate-300">
            Showing {tablesToRender.length} table card(s). Ready for acrylic tent or table standee holders.
          </span>
          <div className="flex space-x-3">
            <button
              onClick={onClose}
              className="px-4 py-1.5 rounded-lg border border-slate-600 text-slate-300 hover:text-white text-xs font-medium"
            >
              Cancel
            </button>
            <button
              onClick={handlePrint}
              className="px-5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-lg flex items-center space-x-1.5"
            >
              <span>🖨️</span>
              <span>Print Standees (Batch)</span>
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}

