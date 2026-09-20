import React, { useState, useEffect } from 'react';
import io from 'socket.io-client';
import { api } from '../api';

const socket = io('http://localhost:5000');

const TableReservation = () => {
  const [reservations, setReservations] = useState([]);
  const [tablesList, setTablesList] = useState([]); 
  const [form, setForm] = useState({
    customerName: '',
    phone: '',
    tableNumber: '',
    date: new Date().toISOString().split('T')[0],
    timeSlot: '19:00', // Default custom time
    duration: '2 Hours', // Duration field added
    guests: 2
  });

  // Fetch all reservations
  const fetchReservations = async () => {
    try {
      const res = await api.get('/reservations');
      const data = res.data;
      if (Array.isArray(data)) {
        setReservations(data);
      }
    } catch (err) {
      console.error("Error fetching reservations:", err);
    }
  };

  // Fetch tables dynamically from backend database (`/api/tables`)
  const fetchTables = async () => {
    try {
      const res = await api.get('/tables');
      const data = res.data?.data || res.data;
      if (Array.isArray(data) && data.length > 0) {
        setTablesList(data);
        // Default select first table if available
        setForm(prev => ({ ...prev, tableNumber: data[0].tableNumber || data[0].name || 'Table 1' }));
      }
    } catch (err) {
      console.error("Error fetching tables:", err);
    }
  };

  useEffect(() => {
    fetchReservations();
    fetchTables();

    socket.on('reservation-updated', fetchReservations);
    return () => socket.off('reservation-updated');
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.customerName || !form.phone) {
      alert("Please fill in Customer Name and Phone Number!");
      return;
    }

    try {
      await api.post('/reservations', form);
      setForm({ 
        customerName: '', 
        phone: '', 
        tableNumber: tablesList[0]?.tableNumber || tablesList[0]?.name || 'Table 1', 
        date: new Date().toISOString().split('T')[0], 
        timeSlot: '19:00', 
        duration: '2 Hours',
        guests: 2 
      });
      fetchReservations();
    } catch (err) {
      console.error("Error saving reservation:", err);
      alert("Network Error: Could not connect to backend server.");
    }
  };

  return (
    <div className="p-6">
      <div className="mb-6">
        <h2 className="text-xl font-bold text-gray-800">Table Reservation Manager</h2>
        <p className="text-sm text-gray-500">Manage advance table bookings and customer slots.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Booking Form */}
        <div className="bg-white border rounded-xl p-4 shadow-sm h-fit">
          <h3 className="font-semibold text-gray-800 mb-4">New Table Booking</h3>
          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <label className="text-xs text-gray-600 block mb-1">Customer Name</label>
              <input 
                type="text" 
                className="w-full border rounded p-2 text-sm"
                placeholder="e.g. Rahul Sharma"
                value={form.customerName}
                onChange={(e) => setForm({ ...form, customerName: e.target.value })}
              />
            </div>
            <div>
              <label className="text-xs text-gray-600 block mb-1">Phone Number</label>
              <input 
                type="text" 
                className="w-full border rounded p-2 text-sm"
                placeholder="10-digit mobile number"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-gray-600 block mb-1">Table</label>
                <select 
                  className="w-full border rounded p-2 text-sm bg-white"
                  value={form.tableNumber}
                  onChange={(e) => setForm({ ...form, tableNumber: e.target.value })}
                >
                  {tablesList.length === 0 ? (
                    <option value="Table 1">Table 1</option>
                  ) : (
                    tablesList.map((tbl, idx) => (
                      <option key={idx} value={tbl.tableNumber || tbl.name}>
                        {tbl.tableNumber || tbl.name} {tbl.capacity ? `(${tbl.capacity} Seater)` : ''}
                      </option>
                    ))
                  )}
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-600 block mb-1">Guests</label>
                <input 
                  type="number" 
                  className="w-full border rounded p-2 text-sm"
                  value={form.guests}
                  onChange={(e) => setForm({ ...form, guests: Number(e.target.value) })}
                />
              </div>
            </div>
            <div>
              <label className="text-xs text-gray-600 block mb-1">Date</label>
              <input 
                type="date" 
                className="w-full border rounded p-2 text-sm"
                value={form.date}
                onChange={(e) => setForm({ ...form, date: e.target.value })}
              />
            </div>

            {/* Time and Duration Grid */}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-gray-600 block mb-1">Time</label>
                <input 
                  type="time" 
                  className="w-full border rounded p-2 text-sm bg-white"
                  value={form.timeSlot}
                  onChange={(e) => setForm({ ...form, timeSlot: e.target.value })}
                />
              </div>
              <div>
                <label className="text-xs text-gray-600 block mb-1">Duration</label>
                <select 
                  className="w-full border rounded p-2 text-sm bg-white"
                  value={form.duration}
                  onChange={(e) => setForm({ ...form, duration: e.target.value })}
                >
                  <option value="1 Hour">1 Hour</option>
                  <option value="2 Hours">2 Hours</option>
                  <option value="3 Hours">3 Hours</option>
                  <option value="4 Hours">4 Hours</option>
                </select>
              </div>
            </div>

            <button type="submit" className="w-full bg-blue-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-blue-700 mt-2">
              Confirm Booking
            </button>
          </form>
        </div>

        {/* Reservations List */}
        <div className="lg:col-span-2 bg-white border rounded-xl p-4 shadow-sm">
          <h3 className="font-semibold text-gray-800 mb-4">Upcoming Reservations</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="bg-gray-50 text-gray-600 border-b">
                  <th className="p-3">Customer</th>
                  <th className="p-3">Table</th>
                  <th className="p-3">Slot & Date</th>
                  <th className="p-3">Guests</th>
                  <th className="p-3 text-right">Status</th>
                </tr>
              </thead>
              <tbody>
                {reservations.length === 0 ? (
                  <tr>
                    <td colSpan="5" className="text-center py-6 text-gray-400">No table reservations found.</td>
                  </tr>
                ) : (
                  reservations.map((item) => (
                    <tr key={item._id} className="border-b hover:bg-gray-50">
                      <td className="p-3 font-medium text-gray-800">
                        {item.customerName}
                        <span className="block text-xs text-gray-400">{item.phone}</span>
                      </td>
                      <td className="p-3 font-semibold text-blue-600">{item.tableNumber}</td>
                      <td className="p-3 text-gray-600">
                        {item.date}
                        <span className="block text-xs text-gray-400">
                          {item.timeSlot} {item.duration ? `(${item.duration})` : ''}
                        </span>
                      </td>
                      <td className="p-3 text-gray-600">{item.guests} Persons</td>
                      <td className="p-3 text-right">
                        <span className="bg-green-100 text-green-700 px-2.5 py-1 rounded-full text-xs font-medium">
                          {item.status}
                        </span>
                      </td>
                    </tr>
                  ))
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