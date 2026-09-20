import React, { useState } from 'react';

const KitchenDisplaySystem = () => {
  const [orders, setOrders] = useState([]);

  // Status update function
  const updateStatus = (id, newStatus) => {
    setOrders(orders.map(order => order.id === id ? { ...order, status: newStatus } : order));
  };

  return (
    <div style={{ padding: '20px', background: '#fff', borderRadius: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}>
      <h3 style={{ marginBottom: '15px', color: '#333' }}>🍳 Kitchen Display System (KDS) - Live Orders</h3>
      
      {orders.length === 0 ? (
        <div style={{ border: '1px dashed #cbd5e1', borderRadius: '12px', background: '#f8fafc', padding: '34px 18px', textAlign: 'center', color: '#64748b' }}>
          <div style={{ fontSize: '32px', marginBottom: '8px' }}>🍽️</div>
          <div style={{ fontWeight: '700', fontSize: '18px', color: '#0f172a', marginBottom: '6px' }}>No live kitchen orders</div>
          <div style={{ fontSize: '13px' }}>New dine-in or QR orders will appear here once they are sent to the kitchen.</div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '15px' }}>
          {orders.map(order => (
            <div key={order.id} style={{ border: '1px solid #ddd', borderRadius: '8px', padding: '15px', background: '#fafafa' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
                <span style={{ fontWeight: 'bold', color: '#1976d2' }}>Order #{order.id}</span>
                <span style={{ background: '#e0e0e0', padding: '2px 6px', borderRadius: '4px', fontSize: '12px' }}>{order.table}</span>
              </div>
              
              <ul style={{ paddingLeft: '20px', margin: '10px 0', color: '#444', fontSize: '14px' }}>
                {order.items.map((item, index) => (
                  <li key={index}>{item}</li>
                ))}
              </ul>

              <div style={{ marginTop: '15px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{
                  fontSize: '12px',
                  fontWeight: 'bold',
                  color: order.status === 'Pending' ? '#e65100' : order.status === 'Preparing' ? '#f57f17' : '#2e7d32'
                }}>
                  Status: {order.status}
                </span>

                <div>
                  {order.status === 'Pending' && (
                    <button onClick={() => updateStatus(order.id, 'Preparing')} style={{ background: '#ff9800', color: '#fff', border: 'none', padding: '5px 10px', borderRadius: '4px', cursor: 'pointer' }}>Start</button>
                  )}
                  {order.status === 'Preparing' && (
                    <button onClick={() => updateStatus(order.id, 'Ready')} style={{ background: '#4caf50', color: '#fff', border: 'none', padding: '5px 10px', borderRadius: '4px', cursor: 'pointer' }}>Mark Ready</button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default KitchenDisplaySystem;