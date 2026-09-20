import React, { useCallback, useEffect, useState } from 'react';
import { api } from '../api';

const emptyMovement = { type: 'cash-in', amount: '', reason: '' };

export default function CashierShift() {
  const [shift, setShift] = useState(null);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [openingCash, setOpeningCash] = useState('');
  const [closingCash, setClosingCash] = useState('');
  const [movement, setMovement] = useState(emptyMovement);
  const [notes, setNotes] = useState('');
  const [currentUser, setCurrentUser] = useState(null);

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

  useEffect(() => {
    try {
      setCurrentUser(JSON.parse(localStorage.getItem('user') || 'null'));
    } catch {
      setCurrentUser(null);
    }
    loadShifts();
  }, [loadShifts]);

  const openShift = async (event) => {
    event.preventDefault();
    try {
      const response = await api.post('/shifts/open', { openingCash: Number(openingCash) });
      setShift(response.data.data);
      setOpeningCash('');
      setMessage('Shift opened successfully.');
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
    } catch (error) {
      setMessage(error.response?.data?.message || 'Cash movement could not be recorded.');
    }
  };

  const closeShift = async (event) => {
    event.preventDefault();
    try {
      const response = await api.post(`/shifts/${shift._id}/close`, {
        closingCash: Number(closingCash),
        notes
      });
      setShift(null);
      setClosingCash('');
      setNotes('');
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
    <div style={{ padding: 24, maxWidth: 1100 }}>
      <h2 style={{ marginTop: 0 }}>Cashier Shift & Handover</h2>
      {message && <div style={{ padding: 12, marginBottom: 16, background: '#eff6ff', color: '#1d4ed8', borderRadius: 8 }}>{message}</div>}

      {!shift ? (
        <form onSubmit={openShift} style={{ background: '#fff', padding: 20, borderRadius: 12, border: '1px solid #e2e8f0', maxWidth: 420 }}>
          <h3>Open New Shift</h3>
          <label style={{ display: 'block', marginBottom: 12 }}>Opening cash
            <input type="number" min="0" step="0.01" required value={openingCash} onChange={(event) => setOpeningCash(event.target.value)} style={{ display: 'block', width: '100%', padding: 10, marginTop: 6, boxSizing: 'border-box' }} />
          </label>
          <button type="submit" style={{ padding: '10px 16px', background: '#2563eb', color: '#fff', border: 0, borderRadius: 8 }}>Open Shift</button>
        </form>
      ) : (
        <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }}>
          <div style={{ background: '#fff', padding: 20, borderRadius: 12, border: '1px solid #e2e8f0' }}>
            <h3>Current Shift</h3>
            <p>Opening cash: <strong>₹{Number(shift.openingCash).toFixed(2)}</strong></p>
            <p>Movements: <strong>{shift.movements?.length || 0}</strong></p>
            <form onSubmit={addMovement}>
              <select value={movement.type} onChange={(event) => setMovement({ ...movement, type: event.target.value })} style={{ width: '100%', padding: 9, marginBottom: 8 }}>
                <option value="cash-in">Cash In</option>
                <option value="cash-out">Cash Out</option>
              </select>
              <input type="number" min="0.01" step="0.01" required placeholder="Amount" value={movement.amount} onChange={(event) => setMovement({ ...movement, amount: event.target.value })} style={{ width: '100%', padding: 9, marginBottom: 8, boxSizing: 'border-box' }} />
              <input required placeholder="Reason" value={movement.reason} onChange={(event) => setMovement({ ...movement, reason: event.target.value })} style={{ width: '100%', padding: 9, marginBottom: 8, boxSizing: 'border-box' }} />
              <button type="submit" style={{ padding: '9px 14px', background: '#0f766e', color: '#fff', border: 0, borderRadius: 8 }}>Record Movement</button>
            </form>
          </div>
          <form onSubmit={closeShift} style={{ background: '#fff', padding: 20, borderRadius: 12, border: '1px solid #e2e8f0' }}>
            <h3>Close Shift</h3>
            <label style={{ display: 'block', marginBottom: 12 }}>Actual closing cash
              <input type="number" min="0" step="0.01" required value={closingCash} onChange={(event) => setClosingCash(event.target.value)} style={{ display: 'block', width: '100%', padding: 10, marginTop: 6, boxSizing: 'border-box' }} />
            </label>
            <label style={{ display: 'block', marginBottom: 12 }}>Notes
              <textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows="3" style={{ display: 'block', width: '100%', padding: 10, marginTop: 6, boxSizing: 'border-box' }} />
            </label>
            <button type="submit" style={{ padding: '10px 16px', background: '#b91c1c', color: '#fff', border: 0, borderRadius: 8 }}>Close Shift</button>
          </form>
        </div>
      )}

      <div style={{ marginTop: 24, background: '#fff', padding: 20, borderRadius: 12, border: '1px solid #e2e8f0', overflowX: 'auto' }}>
        <h3>Shift History</h3>
        {history.length === 0 ? <p>No shift records found.</p> : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr><th align="left">Date</th><th align="left">Cashier</th><th align="right">Expected</th><th align="right">Actual</th><th align="right">Variance</th><th align="left">Status</th><th /></tr></thead>
            <tbody>{history.map((item) => (
              <tr key={item._id}><td>{item.businessDate}</td><td>{item.cashier?.name || '—'}</td><td align="right">{item.expectedCash == null ? '—' : `₹${Number(item.expectedCash).toFixed(2)}`}</td><td align="right">{item.closingCash == null ? '—' : `₹${Number(item.closingCash).toFixed(2)}`}</td><td align="right">{item.variance == null ? '—' : `₹${Number(item.variance).toFixed(2)}`}</td><td>{item.status}</td><td>{item.status === 'closed' && ['admin', 'manager'].includes(currentUser?.role) && <button onClick={() => approveShift(item._id)} style={{ padding: '6px 10px' }}>Approve</button>}</td></tr>
            ))}</tbody>
          </table>
        )}
      </div>
    </div>
  );
}
