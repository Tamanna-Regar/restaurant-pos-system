import React, { useState } from 'react';

const OnlineOrders = () => {
  const [orders, setOrders] = useState([]);

  // Modal & Rejection States
  const [rejectModalOpen, setRejectModalOpen] = useState(false);
  const [selectedOrderId, setSelectedOrderId] = useState(null);
  const [reason, setReason] = useState('Item Out of Stock');

  // Order Accept Handler
  const handleAcceptOrder = (id) => {
    setOrders(orders.map(order => 
      order.id === id ? { ...order, status: 'Accepted' } : order
    ));
  };

  // Open Reject Modal
  const openRejectModal = (id) => {
    setSelectedOrderId(id);
    setReason('Item Out of Stock');
    setRejectModalOpen(true);
  };

  // Confirm Reject with Reason
  const confirmRejectOrder = () => {
    setOrders(orders.map(order => 
      order.id === selectedOrderId ? { ...order, status: 'Rejected', cancelReason: reason } : order
    ));
    setRejectModalOpen(false);
    setSelectedOrderId(null);
  };

  const pendingCount = orders.filter(o => o.status === 'Pending').length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', width: '100%', boxSizing: 'border-box', background: '#f8fafc', overflowY: 'auto', padding: '28px', fontFamily: 'Inter, sans-serif' }}>
      <div style={{ maxWidth: '1440px', width: '100%', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '22px', paddingBottom: '40px' }}>
        
        {/* Top Header Card */}
        <div style={{ background: '#ffffff', padding: '26px', borderRadius: '14px', border: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.02)' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '22px', color: '#0f172a', fontWeight: '800', display: 'flex', alignItems: 'center', gap: '10px', letterSpacing: '-0.5px' }}>
              <span style={{ background: '#fef2f2', padding: '8px', borderRadius: '10px', color: '#dc2626' }}>🛵</span> Online Orders Integration
            </h2>
            <p style={{ margin: '6px 0 0', fontSize: '13px', color: '#64748b' }}>Zomato & Swiggy aggregator orders center.</p>
          </div>
          <div style={{ background: '#fee2e2', color: '#dc2626', padding: '8px 16px', borderRadius: '20px', fontWeight: '700', fontSize: '13px', border: '1px solid #fecaca' }}>
            {pendingCount} Pending
          </div>
        </div>

        {orders.length === 0 ? (
          <div style={{ background: '#ffffff', border: '1px dashed #cbd5e1', borderRadius: '14px', padding: '34px 18px', textAlign: 'center', color: '#64748b' }}>
            <div style={{ fontSize: '42px', marginBottom: '10px' }}>🛵</div>
            <div style={{ fontSize: '20px', fontWeight: '800', color: '#0f172a', marginBottom: '6px' }}>No online orders yet</div>
            <div style={{ fontSize: '13px' }}>Orders from Zomato, Swiggy, and other channels will appear here automatically.</div>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(400px, 1fr))', gap: '20px' }}>
            {orders.map((order) => (
              <div key={order.id} style={{ background: '#ffffff', borderRadius: '14px', border: '1px solid #e2e8f0', padding: '22px', display: 'flex', flexDirection: 'column', gap: '16px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.02)' }}>
                
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #f1f5f9', paddingBottom: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ width: '12px', height: '12px', borderRadius: '50%', background: order.platform === 'Zomato' ? '#e23744' : '#fc8019' }}></span>
                    <span style={{ fontWeight: '800', fontSize: '16px', color: '#0f172a' }}>{order.platform}</span>
                  </div>
                  <span style={{ fontSize: '12px', color: '#64748b', fontWeight: '600' }}>{order.timeAgo}</span>
                </div>

                <div>
                  <div style={{ fontSize: '15px', fontWeight: '700', color: '#0f172a', marginBottom: '8px' }}>{order.customerName}</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {order.items.map((item, idx) => (
                      <div key={idx} style={{ fontSize: '13px', color: '#475569', background: '#f8fafc', padding: '6px 10px', borderRadius: '6px', border: '1px solid #f1f5f9' }}>{item}</div>
                    ))}
                  </div>
                  {order.cancelReason && (
                    <div style={{ fontSize: '12px', color: '#dc2626', marginTop: '8px', background: '#fef2f2', padding: '6px 10px', borderRadius: '6px', border: '1px solid #fecaca' }}>
                      <strong>Reason:</strong> {order.cancelReason}
                    </div>
                  )}
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid #f1f5f9', paddingTop: '14px' }}>
                  <div style={{ fontSize: '18px', fontWeight: '800', color: '#0f172a' }}>
                    ₹{order.total}
                  </div>
                  
                  <div>
                    {order.status === 'Pending' ? (
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button 
                          onClick={() => openRejectModal(order.id)}
                          style={{ background: '#fee2e2', color: '#dc2626', border: '1px solid #fecaca', padding: '8px 14px', borderRadius: '8px', fontSize: '12px', fontWeight: '700', cursor: 'pointer' }}
                        >
                          ❌ Reject
                        </button>
                        <button 
                          onClick={() => handleAcceptOrder(order.id)}
                          style={{ background: '#10b981', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: '8px', fontSize: '12px', fontWeight: '700', cursor: 'pointer', boxShadow: '0 2px 4px rgba(16, 185, 129, 0.2)' }}
                        >
                          ✅ Accept
                        </button>
                      </div>
                    ) : (
                      <span style={{ 
                        padding: '6px 14px', 
                        borderRadius: '8px', 
                        fontSize: '12px', 
                        fontWeight: '700', 
                        background: order.status === 'Accepted' ? '#ecfdf5' : '#fef2f2',
                        color: order.status === 'Accepted' ? '#059669' : '#dc2626',
                        border: order.status === 'Accepted' ? '1px solid #a7f3d0' : '1px solid #fecaca'
                      }}>
                        {order.status}
                      </span>
                    )}
                  </div>
                </div>

              </div>
            ))}
          </div>
        )}

      </div>

      {/* ================= REJECT REASON MODAL ================= */}
      {rejectModalOpen && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 }}>
          <div style={{ background: '#fff', padding: '26px', borderRadius: '14px', width: '400px', boxShadow: '0 10px 25px rgba(0,0,0,0.1)' }}>
            <h3 style={{ margin: '0 0 14px', fontSize: '18px', color: '#0f172a', fontWeight: '800' }}>⚠️ Select Cancellation Reason</h3>
            <p style={{ fontSize: '13px', color: '#64748b', marginBottom: '16px' }}>Please select a reason for rejecting this order:</p>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '20px' }}>
              {['Item Out of Stock', 'Kitchen Too Busy', 'Restaurant Closing Soon', 'Incorrect Price / Item Issue'].map((item) => (
                <label key={item} style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '13px', color: '#334155', cursor: 'pointer', background: '#f8fafc', padding: '10px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                  <input 
                    type="radio" 
                    name="cancelReason" 
                    value={item} 
                    checked={reason === item} 
                    onChange={(e) => setReason(e.target.value)} 
                  />
                  {item}
                </label>
              ))}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button 
                onClick={() => setRejectModalOpen(false)} 
                style={{ padding: '9px 14px', background: '#f1f5f9', border: 'none', borderRadius: '8px', fontWeight: '600', cursor: 'pointer', fontSize: '13px', color: '#475569' }}
              >
                Cancel
              </button>
              <button 
                onClick={confirmRejectOrder} 
                style={{ padding: '9px 16px', background: '#dc2626', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: '600', cursor: 'pointer', fontSize: '13px' }}
              >
                Confirm Rejection
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default OnlineOrders;