import React, { useState, useEffect, useCallback, useMemo } from 'react';
import io from 'socket.io-client';
import { api } from '../api';
import { playTone } from '../utils/audioAlert';

const STATIONS = [
  { id: 'all', label: '🍳 All Stations' },
  { id: 'kitchen', label: '🥘 Main Kitchen' },
  { id: 'tandoor', label: '🔥 Tandoor & Breads' },
  { id: 'pantry', label: '🥗 Pantry & Salads' },
  { id: 'bar', label: '🍹 Beverages & Shakes' },
  { id: 'dessert', label: '🍨 Desserts' }
];

export default function KitchenDisplay({ onBackToPos }) {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedStation, setSelectedStation] = useState('all');
  const [currentTime, setCurrentTime] = useState(Date.now());
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [filterMode, setFilterMode] = useState('active'); // 'active' | 'ready' | 'all'

  // Live timer tick every 10 seconds to update ticket wait durations
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(Date.now()), 10000);
    return () => clearInterval(timer);
  }, []);

  // Fetch active kitchen orders
  const fetchKitchenOrders = useCallback(async () => {
    try {
      const res = await api.get('/orders');
      const allOrders = res && res.data ? (Array.isArray(res.data) ? res.data : (res.data.data || [])) : [];
      // Filter orders that have items in placed or preparing states
      const activeKitchenOrders = allOrders.filter(o => 
        ['placed', 'preparing', 'ready'].includes(o.orderStatus) &&
        o.items?.some(i => ['placed', 'preparing', 'ready'].includes(i.itemStatus || o.orderStatus))
      );
      setOrders(activeKitchenOrders);
    } catch (err) {
      console.error('KDS Fetch Error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Setup live Socket.io connection for Kitchen updates
  useEffect(() => {
    fetchKitchenOrders();
    let socket = null;
    try {
      socket = typeof io === 'function' ? io('http://localhost:5000') : null;
    } catch (e) {}

    if (socket && typeof socket.on === 'function') {
      socket.on('newTableOrder', () => {
        if (soundEnabled) playTone('order');
        fetchKitchenOrders();
      });

      socket.on('new-kot', () => {
        if (soundEnabled) playTone('order');
        fetchKitchenOrders();
      });

      socket.on('order-updated', () => fetchKitchenOrders());
      socket.on('kot-item-updated', () => fetchKitchenOrders());
    }

    return () => {
      if (socket && typeof socket.disconnect === 'function') {
        socket.disconnect();
      }
    };
  }, [fetchKitchenOrders, soundEnabled]);

  // Update item status in KOT
  const handleUpdateItemStatus = async (orderId, itemId, newStatus, kotNumber = 1) => {
    try {
      await api.put(`/orders/${orderId}/item-status`, {
        kotNumber,
        itemId,
        status: newStatus,
        chef: 'Kitchen Master'
      });
      if (newStatus === 'ready' && soundEnabled) {
        playTone('success');
      }
      fetchKitchenOrders();
    } catch (err) {
      console.error('Update item status error:', err);
      alert(err.response?.data?.message || 'Could not update item status');
    }
  };

  // Mark all items in an order to preparing
  const handleMarkAllPreparing = async (order) => {
    for (const item of (order.items || [])) {
      if (item.itemStatus === 'placed' || !item.itemStatus) {
        await handleUpdateItemStatus(order._id, item._id, 'preparing', order.kotNumber || 1);
      }
    }
  };

  // Mark all items in an order to ready
  const handleMarkAllReady = async (order) => {
    for (const item of (order.items || [])) {
      if (['placed', 'preparing'].includes(item.itemStatus || order.orderStatus)) {
        await handleUpdateItemStatus(order._id, item._id, 'ready', order.kotNumber || 1);
      }
    }
  };

  // Compute tickets filtered by station
  const filteredOrders = useMemo(() => {
    return orders.filter(order => {
      if (filterMode === 'active') {
        const hasPending = (order.items || []).some(i => ['placed', 'preparing'].includes(i.itemStatus || order.orderStatus));
        if (!hasPending) return false;
      } else if (filterMode === 'ready') {
        const allReady = (order.items || []).every(i => i.itemStatus === 'ready');
        if (!allReady) return false;
      }

      if (selectedStation === 'all') return true;
      return (order.items || []).some(i => (i.kitchenStation || 'kitchen') === selectedStation);
    });
  }, [orders, selectedStation, filterMode]);

  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: '#090d16',
      color: '#f8fafc',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      padding: '16px'
    }}>
      {/* Top KDS Header Bar */}
      <div style={{
        display: 'flex',
        flexWrap: 'wrap',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '12px 18px',
        backgroundColor: '#111827',
        borderRadius: '12px',
        border: '1px solid #1f2937',
        marginBottom: '16px',
        gap: '12px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          {onBackToPos && (
            <button
              onClick={onBackToPos}
              style={{
                backgroundColor: '#374151',
                color: '#fff',
                border: 'none',
                padding: '8px 14px',
                borderRadius: '8px',
                cursor: 'pointer',
                fontWeight: 'bold',
                fontSize: '13px'
              }}
            >
              ← Exit to POS
            </button>
          )}
          <div>
            <h1 style={{ margin: 0, fontSize: '20px', fontWeight: '900', color: '#10b981', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span>👨‍🍳 KDS Live Kitchen Display</span>
              <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '12px', backgroundColor: '#064e3b', color: '#6ee7b7' }}>
                PURE VEG KITCHEN
              </span>
            </h1>
            <span style={{ fontSize: '12px', color: '#9ca3af' }}>
              Active Tickets: {filteredOrders.length} · Live Kitchen Dispatcher
            </span>
          </div>
        </div>

        {/* Station Filter Tabs */}
        <div style={{ display: 'flex', gap: '6px', overflowX: 'auto', paddingBottom: '2px' }}>
          {STATIONS.map(st => (
            <button
              key={st.id}
              onClick={() => setSelectedStation(st.id)}
              style={{
                padding: '8px 12px',
                borderRadius: '8px',
                border: 'none',
                backgroundColor: selectedStation === st.id ? '#10b981' : '#1f2937',
                color: selectedStation === st.id ? '#064e3b' : '#d1d5db',
                fontWeight: 'bold',
                fontSize: '12px',
                cursor: 'pointer',
                whiteSpace: 'nowrap'
              }}
            >
              {st.label}
            </button>
          ))}
        </div>

        {/* Sound Toggle & Refresh */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            onClick={() => setSoundEnabled(!soundEnabled)}
            style={{
              padding: '8px 12px',
              borderRadius: '8px',
              border: '1px solid #374151',
              backgroundColor: soundEnabled ? '#064e3b' : '#374151',
              color: '#fff',
              fontSize: '12px',
              fontWeight: 'bold',
              cursor: 'pointer'
            }}
          >
            {soundEnabled ? '🔔 Chime ON' : '🔕 Chime OFF'}
          </button>
          <button
            onClick={fetchKitchenOrders}
            style={{
              padding: '8px 12px',
              borderRadius: '8px',
              border: 'none',
              backgroundColor: '#2563eb',
              color: '#fff',
              fontSize: '12px',
              fontWeight: 'bold',
              cursor: 'pointer'
            }}
          >
            🔄 Refresh
          </button>
        </div>
      </div>

      {/* Grid of Kitchen Tickets */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '100px 20px', color: '#9ca3af' }}>
          <div style={{ fontSize: '36px', marginBottom: '10px' }}>⏳</div>
          <h3>Loading Kitchen Display...</h3>
        </div>
      ) : filteredOrders.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '120px 20px', backgroundColor: '#111827', borderRadius: '16px', border: '1px solid #1f2937' }}>
          <div style={{ fontSize: '48px', marginBottom: '14px' }}>✨</div>
          <h2 style={{ color: '#10b981', margin: '0 0 8px 0' }}>All Orders are Cooked & Ready!</h2>
          <p style={{ color: '#9ca3af', margin: 0 }}>
            Kitchen queue is currently clear. New KOTs will automatically appear here with a chime sound.
          </p>
        </div>
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
          gap: '16px'
        }}>
          {filteredOrders.map(order => {
            const elapsedMins = Math.floor((currentTime - new Date(order.createdAt).getTime()) / 60000);
            const isDelayed = elapsedMins >= 20;
            const isWarning = elapsedMins >= 10 && elapsedMins < 20;

            const cardBorderColor = isDelayed ? '#ef4444' : isWarning ? '#f59e0b' : '#10b981';
            const timerBg = isDelayed ? '#7f1d1d' : isWarning ? '#78350f' : '#064e3b';
            const timerColor = isDelayed ? '#fca5a5' : isWarning ? '#fde68a' : '#6ee7b7';

            const tableLabel = order.tableId?.tableNo ? `Table ${order.tableId.tableNo}` : (order.orderType || 'Dine-In');

            return (
              <div
                key={order._id}
                style={{
                  backgroundColor: '#111827',
                  borderRadius: '12px',
                  border: `2px solid ${cardBorderColor}`,
                  boxShadow: isDelayed ? '0 0 16px rgba(239, 68, 68, 0.3)' : '0 4px 12px rgba(0,0,0,0.4)',
                  display: 'flex',
                  flexDirection: 'column',
                  overflow: 'hidden'
                }}
              >
                {/* Ticket Header */}
                <div style={{
                  padding: '12px 14px',
                  backgroundColor: '#1f2937',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  borderBottom: '1px solid #374151'
                }}>
                  <div>
                    <div style={{ fontSize: '17px', fontWeight: '900', color: '#fff' }}>
                      {tableLabel}
                    </div>
                    <div style={{ fontSize: '11px', color: '#9ca3af' }}>
                      KOT #{order.kotNumber || 1} · Server: {order.waiterName || 'Staff'}
                    </div>
                  </div>
                  <div style={{
                    backgroundColor: timerBg,
                    color: timerColor,
                    padding: '4px 10px',
                    borderRadius: '8px',
                    fontWeight: 'bold',
                    fontSize: '12px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px'
                  }}>
                    <span>⏱️</span>
                    <span>{elapsedMins}m ago</span>
                  </div>
                </div>

                {/* Items List */}
                <div style={{ padding: '12px', flex: 1, display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {(order.items || []).map((item, idx) => {
                    const itemStatus = item.itemStatus || order.orderStatus || 'placed';
                    const isReady = itemStatus === 'ready';
                    const isPreparing = itemStatus === 'preparing';

                    return (
                      <div
                        key={item._id || idx}
                        style={{
                          backgroundColor: isReady ? '#064e3b' : isPreparing ? '#1e293b' : '#18202f',
                          border: `1px solid ${isReady ? '#059669' : isPreparing ? '#3b82f6' : '#334155'}`,
                          borderRadius: '8px',
                          padding: '10px 12px',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          gap: '10px'
                        }}
                      >
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: '14px', fontWeight: '800', color: isReady ? '#a7f3d0' : '#fff' }}>
                            <span style={{ color: '#10b981', marginRight: '6px' }}>{item.quantity}x</span>
                            {item.name} {item.portion === 'Half' ? '(Half)' : ''}
                          </div>

                          {/* Cooking Instructions / Addons */}
                          {(item.notes || item.customNote || item.addons?.length > 0) && (
                            <div style={{
                              fontSize: '11px',
                              color: '#fbbf24',
                              backgroundColor: '#451a03',
                              padding: '2px 6px',
                              borderRadius: '4px',
                              marginTop: '4px',
                              display: 'inline-block'
                            }}>
                              🏷️ {item.notes || item.customNote || ''}
                            </div>
                          )}
                        </div>

                        {/* Item Quick Status Buttons */}
                        <div style={{ display: 'flex', gap: '6px' }}>
                          {itemStatus === 'placed' && (
                            <button
                              onClick={() => handleUpdateItemStatus(order._id, item._id, 'preparing', order.kotNumber || 1)}
                              style={{
                                backgroundColor: '#2563eb',
                                color: '#fff',
                                border: 'none',
                                padding: '6px 10px',
                                borderRadius: '6px',
                                fontSize: '11px',
                                fontWeight: 'bold',
                                cursor: 'pointer'
                              }}
                            >
                              🍳 Cook
                            </button>
                          )}
                          {itemStatus === 'preparing' && (
                            <button
                              onClick={() => handleUpdateItemStatus(order._id, item._id, 'ready', order.kotNumber || 1)}
                              style={{
                                backgroundColor: '#10b981',
                                color: '#064e3b',
                                border: 'none',
                                padding: '6px 10px',
                                borderRadius: '6px',
                                fontSize: '11px',
                                fontWeight: 'bold',
                                cursor: 'pointer'
                              }}
                            >
                              ✅ Ready
                            </button>
                          )}
                          {isReady && (
                            <span style={{ fontSize: '12px', color: '#34d399', fontWeight: 'bold' }}>
                              ✓ Cooked
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Ticket Footer Quick Actions */}
                <div style={{
                  padding: '10px 14px',
                  backgroundColor: '#1f2937',
                  borderTop: '1px solid #374151',
                  display: 'flex',
                  gap: '8px'
                }}>
                  <button
                    onClick={() => handleMarkAllPreparing(order)}
                    style={{
                      flex: 1,
                      backgroundColor: '#1e3a8a',
                      color: '#93c5fd',
                      border: 'none',
                      padding: '8px',
                      borderRadius: '6px',
                      fontSize: '11px',
                      fontWeight: 'bold',
                      cursor: 'pointer'
                    }}
                  >
                    🍳 All Preparing
                  </button>
                  <button
                    onClick={() => handleMarkAllReady(order)}
                    style={{
                      flex: 1.5,
                      backgroundColor: '#059669',
                      color: '#fff',
                      border: 'none',
                      padding: '8px',
                      borderRadius: '6px',
                      fontSize: '12px',
                      fontWeight: 'bold',
                      cursor: 'pointer'
                    }}
                  >
                    🛎️ All Ready & Buzzer
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
