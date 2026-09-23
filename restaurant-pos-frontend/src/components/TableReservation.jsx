import React, { useState, useEffect, useMemo, useCallback } from 'react';
import io from 'socket.io-client';
import { api } from '../api';
import { playTone, speakText } from '../utils/audioAlert';
import { sendWhatsAppReservation } from '../utils/whatsappHelper';

const socket = io('http://localhost:5000');

// Helper to normalize table identifiers for robust matching
const normalizeTable = (tbl) => {
  if (!tbl) return '';
  return String(tbl)
    .trim()
    .replace(/^table\s*/i, '')
    .replace(/^t-?0*/i, '')
    .trim();
};

// Local date string in YYYY-MM-DD
const getLocalDateString = (d = new Date()) => {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

// Local time string in HH:mm
const getLocalTimeString = (d = new Date()) => {
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
};

// Parse any time string ("19:00", "7:00 PM", "07:00 PM - 09:00 PM") into minutes from midnight
const parseTimeToMinutes = (timeStr) => {
  if (!timeStr) return null;
  const clean = String(timeStr).trim();
  const firstPart = clean.includes('-') ? clean.split('-')[0].trim() : clean;

  const match12 = firstPart.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
  if (match12) {
    let hours = parseInt(match12[1], 10);
    const minutes = parseInt(match12[2], 10);
    const ampm = match12[3] ? match12[3].toUpperCase() : null;

    if (ampm === 'PM' && hours < 12) hours += 12;
    if (ampm === 'AM' && hours === 12) hours = 0;
    return hours * 60 + minutes;
  }

  const match24 = firstPart.match(/^(\d{1,2}):(\d{2})$/);
  if (match24) {
    const hours = parseInt(match24[1], 10);
    const minutes = parseInt(match24[2], 10);
    return hours * 60 + minutes;
  }

  return null;
};

// Parse duration string into minutes
const parseDurationToMinutes = (durationStr, fallback = 120) => {
  if (!durationStr) return fallback;
  const match = String(durationStr).match(/(\d+(\.\d+)?)/);
  if (match) {
    return Math.round(parseFloat(match[1]) * 60);
  }
  return fallback;
};

// Format minutes from midnight into 12-hour AM/PM string, e.g. 1140 -> "7:00 PM"
const formatMinutesTo12Hour = (totalMinutes) => {
  const m = ((totalMinutes % 1440) + 1440) % 1440;
  const hours24 = Math.floor(m / 60);
  const mins = m % 60;
  const ampm = hours24 >= 12 ? 'PM' : 'AM';
  const hours12 = hours24 % 12 || 12;
  return `${hours12}:${String(mins).padStart(2, '0')} ${ampm}`;
};

// Format range string e.g. 1140 to 1260 -> "7:00-9:00 PM"
const formatRangeString = (startM, endM) => {
  const sStr = formatMinutesTo12Hour(startM);
  const eStr = formatMinutesTo12Hour(endM);
  const sParts = sStr.split(' ');
  const eParts = eStr.split(' ');
  if (sParts[1] === eParts[1]) {
    return `${sParts[0]}-${eParts[0]} ${eParts[1]}`;
  }
  return `${sStr} - ${eStr}`;
};

const TableReservation = () => {
  const [reservations, setReservations] = useState([]);
  const [tablesList, setTablesList] = useState([]);
  const [formError, setFormError] = useState('');
  const [successBooking, setSuccessBooking] = useState(null);

  // Search & Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [dateFilter, setDateFilter] = useState('All');

  const todayStr = useMemo(() => getLocalDateString(), []);
  const currentTimeStr = useMemo(() => getLocalTimeString(), []);

  const [form, setForm] = useState({
    customerName: '',
    phone: '',
    tableNumber: '',
    date: getLocalDateString(),
    timeSlot: '19:00',
    duration: '2 Hours',
    guests: 2,
    notes: '',
    status: 'Confirmed'
  });

  // Fetch all reservations
  const fetchReservations = useCallback(async () => {
    try {
      const res = await api.get('/reservations');
      const data = res.data;
      if (Array.isArray(data)) {
        setReservations(data);
      }
    } catch (err) {
      console.error("Error fetching reservations:", err);
    }
  }, []);

  // Fetch tables dynamically from backend database (`/api/tables`)
  const fetchTables = useCallback(async () => {
    try {
      const res = await api.get('/tables');
      const data = res.data?.data || res.data;
      if (Array.isArray(data) && data.length > 0) {
        setTablesList(data);
        setForm(prev => ({
          ...prev,
          tableNumber: prev.tableNumber || String(data[0].tableNo ?? data[0].tableNumber ?? data[0].name ?? 'Table 1')
        }));
      }
    } catch (err) {
      console.error("Error fetching tables:", err);
    }
  }, []);

  useEffect(() => {
    fetchReservations();
    fetchTables();

    socket.on('reservation-updated', fetchReservations);
    return () => socket.off('reservation-updated');
  }, [fetchReservations, fetchTables]);

  // Find currently selected table object & its capacity
  const selectedTableObj = useMemo(() => {
    if (!form.tableNumber || !tablesList.length) return null;
    const target = normalizeTable(form.tableNumber);
    return tablesList.find(t => normalizeTable(t.tableNo ?? t.tableNumber ?? t.name) === target) || null;
  }, [form.tableNumber, tablesList]);

  const selectedCapacity = selectedTableObj?.capacity || 4;
  const isOverCapacity = Number(form.guests) > selectedCapacity;

  // Real-time check if selected time is in the past for today
  const isPastTime = useMemo(() => {
    if (form.date === todayStr) {
      const selectedM = parseTimeToMinutes(form.timeSlot);
      const currentM = parseTimeToMinutes(getLocalTimeString());
      return selectedM !== null && currentM !== null && selectedM < currentM;
    }
    return form.date < todayStr;
  }, [form.date, form.timeSlot, todayStr]);

  // 8. Phone Number Auto-Fill Handler
  const handlePhoneChange = async (e) => {
    const val = e.target.value;
    setForm(prev => ({ ...prev, phone: val }));
    setFormError('');

    const clean = val.replace(/\D/g, '');
    if (clean.length >= 10 && !form.customerName) {
      // 1. Check in client memory reservations first
      const prevBooking = reservations.find(r => r.phone && r.phone.replace(/\D/g, '') === clean);
      if (prevBooking && prevBooking.customerName) {
        setForm(prev => ({ ...prev, customerName: prevBooking.customerName }));
        return;
      }

      // 2. Query backend lookup
      try {
        const res = await api.get(`/reservations/customer-lookup/${clean}`);
        if (res.data?.success && res.data.customer?.name) {
          setForm(prev => ({ ...prev, customerName: res.data.customer.name }));
        }
      } catch (err) {
        // non-blocking
      }
    }
  };

  // Submit Handler with Strict Priority 1 Validations
  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError('');
    setSuccessBooking(null);

    if (!form.customerName.trim() || !form.phone.trim()) {
      setFormError("Please fill in Customer Name and Phone Number!");
      playTone('warning');
      return;
    }

    // --- 1. PAST DATE / TIME BLOCK CHECK ---
    const now = new Date();
    const currDateStr = getLocalDateString(now);
    const currTimeStr = getLocalTimeString(now);
    const currMinutes = parseTimeToMinutes(currTimeStr);
    const reqStartMinutes = parseTimeToMinutes(form.timeSlot);

    if (form.date < currDateStr) {
      const errMsg = "Past date pe booking allow nahi hai.";
      setFormError(errMsg);
      playTone('warning');
      alert(errMsg);
      return;
    }

    if (form.date === currDateStr && reqStartMinutes !== null && currMinutes !== null && reqStartMinutes < currMinutes) {
      const errMsg = "Past time pe booking allow nahi hai. Kripya aage ka time chunein.";
      setFormError(errMsg);
      playTone('warning');
      alert(errMsg);
      return;
    }

    // --- 2. GUEST COUNT VS TABLE CAPACITY CHECK ---
    const tableDisplayName = String(form.tableNumber).startsWith('Table')
      ? form.tableNumber
      : `Table ${form.tableNumber}`;

    if (isOverCapacity) {
      const errMsg = `${tableDisplayName} sirf ${selectedCapacity} guests tak hi hold karta hai.`;
      setFormError(errMsg);
      playTone('warning');
      alert(errMsg);
      return;
    }

    // --- 3. DOUBLE-BOOKING TIME RANGE OVERLAP CHECK ---
    const normTargetTable = normalizeTable(form.tableNumber);
    const reqDurationMinutes = parseDurationToMinutes(form.duration, 120);
    const reqEndMinutes = reqStartMinutes + reqDurationMinutes;

    const conflict = reservations.find((r) => {
      if (!['Confirmed', 'Seated'].includes(r.status)) return false;
      if (r.date !== form.date) return false;
      if (normalizeTable(r.tableNumber) !== normTargetTable) return false;

      const existStart = parseTimeToMinutes(r.timeSlot);
      if (existStart === null) return false;
      const existDuration = parseDurationToMinutes(r.duration, 120);
      const existEnd = existStart + existDuration;

      // Overlap condition: startA < endB && startB < endA
      return reqStartMinutes < existEnd && existStart < reqEndMinutes;
    });

    if (conflict) {
      const existStart = parseTimeToMinutes(conflict.timeSlot);
      const existDuration = parseDurationToMinutes(conflict.duration, 120);
      const rangeStr = formatRangeString(existStart, existStart + existDuration);
      const errMsg = `${tableDisplayName} already booked ${rangeStr} pe.`;
      setFormError(errMsg);
      playTone('warning');
      alert(errMsg);
      return;
    }

    try {
      const res = await api.post('/reservations', form);
      const created = res.data;
      playTone('success');
      speakText(`Table booked for ${form.customerName}`);
      setSuccessBooking(created);

      setForm({
        customerName: '',
        phone: '',
        tableNumber: tablesList[0]?.tableNo ? `Table ${tablesList[0].tableNo}` : (tablesList[0]?.name || 'Table 1'),
        date: getLocalDateString(),
        timeSlot: '19:00',
        duration: '2 Hours',
        guests: 2,
        notes: '',
        status: 'Confirmed'
      });
      fetchReservations();
    } catch (err) {
      console.error("Error saving reservation:", err);
      const backendError = err.response?.data?.error || err.response?.data?.message || "Could not save reservation.";
      setFormError(backendError);
      playTone('warning');
      alert(backendError);
    }
  };

  // 5. "Seat Now" Button Handler: Links reservation and marks table as Occupied
  const handleSeatNow = async (item) => {
    try {
      const res = await api.post(`/reservations/${item._id}/seat`);
      playTone('success');
      speakText(`Guest seated at ${item.tableNumber}`);
      fetchReservations();
      alert(res.data?.message || `Guest seated! ${item.tableNumber} is now marked Occupied in POS.`);
    } catch (err) {
      console.error('Error seating guest:', err);
      alert(err.response?.data?.message || 'Could not mark guest as seated.');
    }
  };

  // 6. Direct Cancel Button Handler
  const handleCancelBooking = async (item) => {
    const tableLabel = String(item.tableNumber).startsWith('Table') ? item.tableNumber : `Table ${item.tableNumber}`;
    if (!window.confirm(`Cancel reservation for ${item.customerName} on ${tableLabel}?`)) return;

    try {
      await api.post(`/reservations/${item._id}/cancel`);
      playTone('void');
      speakText(`Reservation cancelled for ${item.customerName}`);
      fetchReservations();
    } catch (err) {
      console.error('Error cancelling reservation:', err);
      alert('Failed to cancel reservation.');
    }
  };

  // 10. WhatsApp Confirmation Handler
  const handleWhatsApp = (item) => {
    sendWhatsAppReservation(item);
  };

  // 9. Search and Filter Logic
  const filteredReservations = useMemo(() => {
    return reservations.filter((item) => {
      // Status filter
      if (statusFilter !== 'All' && item.status !== statusFilter) return false;

      // Date filter
      if (dateFilter === 'Today' && item.date !== todayStr) return false;
      if (dateFilter === 'Tomorrow') {
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        if (item.date !== getLocalDateString(tomorrow)) return false;
      }
      if (dateFilter === 'Week') {
        const nextWeek = new Date();
        nextWeek.setDate(nextWeek.getDate() + 7);
        if (item.date < todayStr || item.date > getLocalDateString(nextWeek)) return false;
      }

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchName = item.customerName?.toLowerCase().includes(q);
        const matchPhone = item.phone?.includes(q);
        const matchTable = String(item.tableNumber || '').toLowerCase().includes(q);
        const matchNotes = item.notes?.toLowerCase().includes(q);
        if (!matchName && !matchPhone && !matchTable && !matchNotes) return false;
      }

      return true;
    });
  }, [reservations, statusFilter, dateFilter, searchQuery, todayStr]);

  const getStatusBadgeStyle = (status) => {
    switch (status) {
      case 'Pending':
        return { bg: '#fef3c7', color: '#b45309', border: '#fde68a', icon: '⏳' };
      case 'Seated':
        return { bg: '#dbeafe', color: '#1d4ed8', border: '#bfdbfe', icon: '🪑' };
      case 'Completed':
        return { bg: '#f1f5f9', color: '#334155', border: '#cbd5e1', icon: '🔵' };
      case 'Cancelled':
        return { bg: '#fee2e2', color: '#b91c1c', border: '#fecaca', icon: '🔴' };
      case 'No-show':
        return { bg: '#f8fafc', color: '#64748b', border: '#e2e8f0', icon: '⚪' };
      case 'Confirmed':
      default:
        return { bg: '#dcfce7', color: '#15803d', border: '#bbf7d0', icon: '🟢' };
    }
  };

  return (
    <div style={{ flex: 1, minHeight: 0, height: '100%', width: '100%', boxSizing: 'border-box', background: '#f8fafc', overflowY: 'auto', padding: '24px 28px' }}>
      
      {/* Title & Quick Stats */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h2 style={{ fontSize: '22px', fontWeight: '800', color: '#0f172a', margin: 0 }}>
            📅 Table Reservation Manager
          </h2>
          <p style={{ fontSize: '13px', color: '#64748b', margin: '4px 0 0 0' }}>
            Advance table bookings with smart collision checks, capacity guard & 1-click POS seating.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '8px' }}>
          <span style={{ fontSize: '12px', backgroundColor: '#ecfdf5', color: '#047857', padding: '6px 12px', borderRadius: '20px', fontWeight: 'bold', border: '1px solid #a7f3d0' }}>
            🟢 {reservations.filter(r => r.status === 'Confirmed').length} Confirmed
          </span>
          <span style={{ fontSize: '12px', backgroundColor: '#eff6ff', color: '#1d4ed8', padding: '6px 12px', borderRadius: '20px', fontWeight: 'bold', border: '1px solid #bfdbfe' }}>
            🪑 {reservations.filter(r => r.status === 'Seated').length} Seated Now
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* ================================================================= */}
        {/* 1. BOOKING FORM */}
        {/* ================================================================= */}
        <div className="bg-white border rounded-xl p-5 shadow-sm h-fit">
          <h3 className="font-semibold text-gray-800 mb-3 text-base">New Table Booking</h3>

          {/* Validation Feedback Banners */}
          {formError && (
            <div style={{
              backgroundColor: '#fef2f2',
              border: '1px solid #fecaca',
              color: '#b91c1c',
              padding: '10px 12px',
              borderRadius: '8px',
              fontSize: '12px',
              fontWeight: '600',
              marginBottom: '12px',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}>
              <span>🚫</span>
              <span>{formError}</span>
            </div>
          )}

          {successBooking && (
            <div style={{
              backgroundColor: '#ecfdf5',
              border: '1px solid #a7f3d0',
              color: '#047857',
              padding: '12px',
              borderRadius: '8px',
              fontSize: '12px',
              marginBottom: '12px'
            }}>
              <div style={{ fontWeight: '700', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span>✅</span>
                <span>Booking Confirmed for {successBooking.customerName}!</span>
              </div>
              <div style={{ marginTop: '4px', color: '#065f46' }}>
                {successBooking.tableNumber} on {successBooking.date} ({successBooking.timeSlot})
              </div>
              <div style={{ marginTop: '8px' }}>
                <button
                  type="button"
                  onClick={() => handleWhatsApp(successBooking)}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                    padding: '5px 10px',
                    borderRadius: '6px',
                    backgroundColor: '#10b981',
                    color: '#fff',
                    border: 'none',
                    fontWeight: 'bold',
                    fontSize: '11px',
                    cursor: 'pointer'
                  }}
                >
                  💬 Send WhatsApp Confirmation
                </button>
              </div>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <label className="text-xs text-gray-600 block mb-1">
                Phone Number (10 Digits)
              </label>
              <input 
                type="text" 
                className="w-full border rounded p-2 text-sm"
                placeholder="Type phone to auto-fill name"
                value={form.phone}
                onChange={handlePhoneChange}
                required
              />
            </div>

            <div>
              <label className="text-xs text-gray-600 block mb-1">Customer Name</label>
              <input 
                type="text" 
                className="w-full border rounded p-2 text-sm"
                placeholder="e.g. Rahul Sharma"
                value={form.customerName}
                onChange={(e) => setForm({ ...form, customerName: e.target.value })}
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-gray-600 block mb-1">
                  Table {selectedCapacity ? `(${selectedCapacity} Seater)` : ''}
                </label>
                <select 
                  className="w-full border rounded p-2 text-sm bg-white"
                  value={form.tableNumber}
                  onChange={(e) => {
                    setForm({ ...form, tableNumber: e.target.value });
                    setFormError('');
                  }}
                >
                  {tablesList.length === 0 ? (
                    <option value="Table 1">Table 1 (4 Seater)</option>
                  ) : (
                    tablesList.map((tbl, idx) => {
                      const tNo = tbl.tableNo ?? tbl.tableNumber ?? tbl.name;
                      const label = String(tNo).startsWith('Table') ? tNo : `Table ${tNo}`;
                      return (
                        <option key={idx} value={label}>
                          {label} {tbl.capacity ? `(${tbl.capacity} Seater)` : ''}
                        </option>
                      );
                    })
                  )}
                </select>
              </div>

              <div>
                <label className="text-xs text-gray-600 block mb-1">
                  Guests {isOverCapacity && <span style={{ color: '#dc2626', fontWeight: 'bold' }}>Max {selectedCapacity}!</span>}
                </label>
                <input 
                  type="number" 
                  min="1"
                  className={`w-full border rounded p-2 text-sm ${isOverCapacity ? 'border-red-500 bg-red-50 text-red-700 font-bold' : ''}`}
                  value={form.guests}
                  onChange={(e) => {
                    setForm({ ...form, guests: Number(e.target.value) });
                    setFormError('');
                  }}
                />
              </div>
            </div>

            {/* Real-time Capacity Warning */}
            {isOverCapacity && (
              <div style={{
                backgroundColor: '#fff1f2',
                border: '1px solid #fecdd3',
                color: '#be123c',
                padding: '6px 10px',
                borderRadius: '6px',
                fontSize: '11px',
                fontWeight: '600'
              }}>
                ⚠️ {String(form.tableNumber).startsWith('Table') ? form.tableNumber : `Table ${form.tableNumber}`} sirf {selectedCapacity} guests tak hi hold karta hai.
              </div>
            )}

            <div>
              <label className="text-xs text-gray-600 block mb-1">
                Date (Past dates disabled)
              </label>
              <input 
                type="date" 
                min={todayStr}
                className="w-full border rounded p-2 text-sm bg-white"
                value={form.date}
                onChange={(e) => {
                  setForm({ ...form, date: e.target.value });
                  setFormError('');
                }}
              />
            </div>

            {/* Time and Duration Grid */}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-gray-600 block mb-1">
                  Time {isPastTime && <span style={{ color: '#dc2626', fontWeight: 'bold' }}>Past!</span>}
                </label>
                <input 
                  type="time" 
                  min={form.date === todayStr ? currentTimeStr : undefined}
                  className={`w-full border rounded p-2 text-sm bg-white ${isPastTime ? 'border-red-500 bg-red-50 text-red-700 font-bold' : ''}`}
                  value={form.timeSlot}
                  onChange={(e) => {
                    setForm({ ...form, timeSlot: e.target.value });
                    setFormError('');
                  }}
                />
              </div>
              <div>
                <label className="text-xs text-gray-600 block mb-1">Duration</label>
                <select 
                  className="w-full border rounded p-2 text-sm bg-white"
                  value={form.duration}
                  onChange={(e) => {
                    setForm({ ...form, duration: e.target.value });
                    setFormError('');
                  }}
                >
                  <option value="1 Hour">1 Hour</option>
                  <option value="2 Hours">2 Hours</option>
                  <option value="3 Hours">3 Hours</option>
                  <option value="4 Hours">4 Hours</option>
                </select>
              </div>
            </div>

            {/* 7. Special Request / Notes Field */}
            <div>
              <label className="text-xs text-gray-600 block mb-1">
                Special Requests / Notes (Optional)
              </label>
              <input 
                type="text" 
                className="w-full border rounded p-2 text-sm"
                placeholder="e.g. Birthday cake, Window seat, Less spicy"
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
              />
            </div>

            {/* 4. Initial Status Option */}
            <div>
              <label className="text-xs text-gray-600 block mb-1">Initial Status</label>
              <select
                className="w-full border rounded p-2 text-sm bg-white"
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value })}
              >
                <option value="Confirmed">🟢 Confirmed</option>
                <option value="Pending">⏳ Pending Approval</option>
              </select>
            </div>

            {/* Real-time Past Time Warning */}
            {isPastTime && (
              <div style={{
                backgroundColor: '#fff1f2',
                border: '1px solid #fecdd3',
                color: '#be123c',
                padding: '6px 10px',
                borderRadius: '6px',
                fontSize: '11px',
                fontWeight: '600'
              }}>
                ⚠️ Past date/time select kiya hai. Kripya future time chunein.
              </div>
            )}

            <button
              type="submit"
              disabled={isOverCapacity || isPastTime}
              style={{
                width: '100%',
                padding: '10px',
                borderRadius: '8px',
                fontSize: '14px',
                fontWeight: '600',
                color: '#ffffff',
                border: 'none',
                marginTop: '10px',
                cursor: (isOverCapacity || isPastTime) ? 'not-allowed' : 'pointer',
                backgroundColor: (isOverCapacity || isPastTime) ? '#94a3b8' : '#2563eb',
                boxShadow: (isOverCapacity || isPastTime) ? 'none' : '0 2px 6px rgba(37, 99, 235, 0.3)'
              }}
            >
              Confirm Booking
            </button>
          </form>
        </div>

        {/* ================================================================= */}
        {/* 2. UPCOMING RESERVATIONS VIEW */}
        {/* ================================================================= */}
        <div className="lg:col-span-2 bg-white border rounded-xl p-5 shadow-sm flex flex-col">
          
          {/* 9. Search and Filter Bar */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
              <div>
                <h3 className="font-semibold text-gray-800 m-0 text-base">Upcoming Reservations</h3>
                <p className="text-xs text-gray-500 m-0">Live bookings synced with POS table occupancy</p>
              </div>

              {/* Date Filter Quick Pills */}
              <div style={{ display: 'flex', gap: '6px' }}>
                {['All', 'Today', 'Tomorrow', 'Week'].map((dOpt) => (
                  <button
                    key={dOpt}
                    type="button"
                    onClick={() => setDateFilter(dOpt)}
                    style={{
                      padding: '4px 10px',
                      borderRadius: '6px',
                      fontSize: '11px',
                      fontWeight: '600',
                      border: '1px solid',
                      cursor: 'pointer',
                      borderColor: dateFilter === dOpt ? '#0f172a' : '#cbd5e1',
                      backgroundColor: dateFilter === dOpt ? '#0f172a' : '#ffffff',
                      color: dateFilter === dOpt ? '#ffffff' : '#475569'
                    }}
                  >
                    {dOpt === 'All' ? 'All Dates' : dOpt === 'Week' ? 'Next 7 Days' : dOpt}
                  </button>
                ))}
              </div>
            </div>

            {/* Search Input & Status Tabs */}
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
              <div style={{ flex: '1 1 200px' }}>
                <input
                  type="text"
                  placeholder="🔍 Search customer name, phone, table, notes..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    fontSize: '12px',
                    outline: 'none',
                    boxSizing: 'border-box'
                  }}
                />
              </div>

              {/* Status Filter Dropdown */}
              <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 'bold' }}>Status:</span>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  style={{
                    padding: '6px 10px',
                    borderRadius: '6px',
                    border: '1px solid #cbd5e1',
                    fontSize: '12px',
                    backgroundColor: '#fff',
                    outline: 'none'
                  }}
                >
                  <option value="All">All Statuses ({reservations.length})</option>
                  <option value="Confirmed">🟢 Confirmed</option>
                  <option value="Seated">🪑 Seated</option>
                  <option value="Pending">⏳ Pending</option>
                  <option value="Completed">🔵 Completed</option>
                  <option value="Cancelled">🔴 Cancelled</option>
                  <option value="No-show">⚪ No-show</option>
                </select>
              </div>
            </div>
          </div>

          {/* Reservations Table */}
          <div className="overflow-x-auto flex-1">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="bg-gray-50 text-gray-600 border-b text-xs uppercase tracking-wider">
                  <th className="p-3">Customer & Phone</th>
                  <th className="p-3">Table</th>
                  <th className="p-3">Time Range & Date</th>
                  <th className="p-3">Guests</th>
                  <th className="p-3">Status</th>
                  <th className="p-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredReservations.length === 0 ? (
                  <tr>
                    <td colSpan="6" className="text-center py-8 text-gray-400">
                      <div style={{ fontSize: '24px', marginBottom: '4px' }}>🔍</div>
                      No matching table reservations found.
                    </td>
                  </tr>
                ) : (
                  filteredReservations.map((item) => {
                    const startM = parseTimeToMinutes(item.timeSlot);
                    const durM = parseDurationToMinutes(item.duration, 120);
                    const rangeDisplay = startM !== null ? formatRangeString(startM, startM + durM) : item.timeSlot;
                    const badge = getStatusBadgeStyle(item.status);
                    const isActionable = ['Confirmed', 'Pending'].includes(item.status);

                    return (
                      <tr key={item._id} className="border-b hover:bg-gray-50 transition-colors">
                        <td className="p-3 font-medium text-gray-800">
                          <div style={{ fontWeight: '700' }}>{item.customerName}</div>
                          <div style={{ fontSize: '11px', color: '#64748b' }}>📞 {item.phone}</div>
                          {item.notes && (
                            <div style={{
                              display: 'inline-block',
                              marginTop: '3px',
                              padding: '2px 6px',
                              borderRadius: '4px',
                              backgroundColor: '#fef3c7',
                              color: '#92400e',
                              fontSize: '10px',
                              fontWeight: '600'
                            }}>
                              📝 {item.notes}
                            </div>
                          )}
                        </td>

                        <td className="p-3 font-semibold text-blue-600">
                          {String(item.tableNumber || '').startsWith('Table') ? item.tableNumber : `Table ${item.tableNumber}`}
                        </td>

                        <td className="p-3 text-gray-600">
                          <div style={{ fontWeight: '700', color: '#0f172a' }}>{rangeDisplay}</div>
                          <div style={{ fontSize: '11px', color: '#64748b' }}>
                            📅 {item.date} · ⏱️ {item.duration || '2 Hours'}
                          </div>
                        </td>

                        <td className="p-3 text-gray-600 font-medium">
                          {item.guests} Guests
                        </td>

                        {/* 4. Status Dropdown */}
                        <td className="p-3">
                          <select
                            value={item.status || 'Confirmed'}
                            onChange={async (e) => {
                              try {
                                await api.patch(`/reservations/${item._id}/status`, { status: e.target.value });
                                fetchReservations();
                              } catch (err) {
                                alert('Failed to update reservation status');
                              }
                            }}
                            style={{
                              fontSize: '11px',
                              fontWeight: 'bold',
                              padding: '4px 8px',
                              borderRadius: '20px',
                              border: `1px solid ${badge.border}`,
                              cursor: 'pointer',
                              backgroundColor: badge.bg,
                              color: badge.color,
                              outline: 'none'
                            }}
                          >
                            <option value="Confirmed">🟢 Confirmed</option>
                            <option value="Seated">🪑 Seated</option>
                            <option value="Pending">⏳ Pending</option>
                            <option value="Completed">🔵 Completed</option>
                            <option value="Cancelled">🔴 Cancelled</option>
                            <option value="No-show">⚪ No-show</option>
                          </select>
                        </td>

                        {/* 5, 6, 10. Operational Action Buttons: Seat Now, Cancel, WhatsApp */}
                        <td className="p-3 text-right">
                          <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end', alignItems: 'center' }}>
                            {/* 5. Seat Now Button */}
                            {isActionable && (
                              <button
                                type="button"
                                onClick={() => handleSeatNow(item)}
                                title="Guest arrived? Click to Seat and mark table Occupied"
                                style={{
                                  padding: '5px 9px',
                                  borderRadius: '6px',
                                  backgroundColor: '#1d4ed8',
                                  color: '#fff',
                                  fontSize: '11px',
                                  fontWeight: '700',
                                  border: 'none',
                                  cursor: 'pointer',
                                  boxShadow: '0 1px 3px rgba(29, 78, 216, 0.25)'
                                }}
                              >
                                🪑 Seat Now
                              </button>
                            )}

                            {/* 10. WhatsApp Button */}
                            <button
                              type="button"
                              onClick={() => handleWhatsApp(item)}
                              title="Send WhatsApp confirmation message"
                              style={{
                                padding: '5px 8px',
                                borderRadius: '6px',
                                backgroundColor: '#25d366',
                                color: '#fff',
                                fontSize: '11px',
                                fontWeight: '700',
                                border: 'none',
                                cursor: 'pointer'
                              }}
                            >
                              💬 WA
                            </button>

                            {/* 6. Cancel Button */}
                            {item.status !== 'Cancelled' && item.status !== 'Completed' && (
                              <button
                                type="button"
                                onClick={() => handleCancelBooking(item)}
                                title="Cancel this reservation"
                                style={{
                                  padding: '5px 8px',
                                  borderRadius: '6px',
                                  backgroundColor: '#fef2f2',
                                  color: '#dc2626',
                                  border: '1px solid #fecaca',
                                  fontSize: '11px',
                                  fontWeight: '600',
                                  cursor: 'pointer'
                                }}
                              >
                                ✕ Cancel
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </div>
  );
};

export default TableReservation;