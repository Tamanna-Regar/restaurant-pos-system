import React, { useState } from 'react';
import { api } from '../api';

const TableTransferModal = ({ isOpen, onClose, currentTable, allTables, onTransferSuccess }) => {
  const [targetTableId, setTargetTableId] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  
  if (!isOpen || !currentTable) return null;

  // Filter out the current table from target options (only show available tables)
  const availableTargetTables = (Array.isArray(allTables) ? allTables : []).filter(t => t && t._id !== currentTable?._id && t.status === 'available');
  const handleTransfer = async () => {
    if (!targetTableId) {
      setError('Please select a target table.');
      return;
    }
    try {
      setLoading(true);
      setError('');

      // Calling the backend API route for table transfer
      const response = await api.put(`/tables/transfer/${currentTable._id}/${targetTableId}`);
      if (response.data.success) {
        alert(response.data.message);
        onTransferSuccess(); // Refresh data callback
        onClose(); // Close modal
      }
    } catch (err) {
      console.error('Table Transfer Failed:', err);
      setError(err.response?.data?.message || 'Failed to transfer table.');
    } finally {
      setLoading(false);
    }
  };

  return (
  <div style={modalOverlayStyle}>
    <div style={modalContentStyle}>
      <h3>🔄 Transfer Table {currentTable.tableNo || currentTable.tableNumber}</h3>
      <p style={{ color: '#666', fontSize: '14px' }}>Select an available table to shift this order:</p>
      {error && <p style={{ color: 'red', fontSize: '13px' }}>{error}</p>}
      <div style={{ margin: '15px 0' }}>
          <label style={{ display: 'block', marginBottom: '5px', fontWeight: '500' }}>Target Table:</label>
          <select 
            value={targetTableId} 
            onChange={(e) => setTargetTableId(e.target.value)}
            style={{ width: '100%', padding: '10px', borderRadius: '5px', border: '1px solid #ccc' }}
          >
            <option value="">-- Choose Available Table --</option>
            {availableTargetTables.map(tbl => (
              <option key={tbl._id} value={tbl._id}>
                Table {tbl.tableNo || tbl.tableNumber} ({tbl.floor || 'Floor 1'} - Capacity: {tbl.capacity})
              </option>
            ))}
          </select>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '20px' }}>
          <button 
            onClick={onClose} 
            style={{ padding: '8px 15px', background: '#ccc', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
          >
            Cancel
          </button>
          <button 
            onClick={handleTransfer} 
            disabled={loading}
            style={{ padding: '8px 15px', background: '#28a745', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
          >
            {loading ? 'Transferring...' : 'Confirm Transfer'}
          </button>
        </div>
      </div>
    </div>
  );
};

// Simple Inline Styles for Modal
const modalOverlayStyle = {
  position: 'fixed', top: 0, left: 0, width: '100%', height: '100%',
  backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000
};

const modalContentStyle = {
  background: '#fff', padding: '25px', borderRadius: '8px', width: '400px', boxShadow: '0 4px 10px rgba(0,0,0,0.2)'
};

export default TableTransferModal;