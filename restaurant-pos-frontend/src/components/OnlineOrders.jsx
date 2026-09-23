import React, { useState, useEffect, useCallback, useRef } from 'react';
import io from 'socket.io-client';
import toast, { Toaster } from 'react-hot-toast';
import { api } from '../api';

const SOCKET_URL = 'http://localhost:5000';

function formatElapsed(date) {
  if (!date) return 'Just now';
  const ms = Date.now() - new Date(date).getTime();
  const m = Math.floor(ms / 60000);
  if (m < 1) return 'Just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m ago`;
}

const PROVIDER_COLORS = {
  Zomato: { bg: '#fef2f2', text: '#e23744', border: '#fecaca', pill: '#e23744' },
  Swiggy: { bg: '#fff7ed', text: '#ea580c', border: '#fed7aa', pill: '#fc8019' },
  Direct: { bg: '#eff6ff', text: '#2563eb', border: '#bfdbfe', pill: '#3b82f6' }
};

const STATUS_BADGES = {
  Pending: { bg: '#fef3c7', text: '#92400e', border: '#fde68a', label: '🔔 Pending Confirmation' },
  Accepted: { bg: '#ecfdf5', text: '#065f46', border: '#a7f3d0', label: '🍳 Kitchen Preparing' },
  Preparing: { bg: '#ecfdf5', text: '#065f46', border: '#a7f3d0', label: '🍳 Kitchen Preparing' },
  'Ready for Pickup': { bg: '#f0fdf4', text: '#15803d', border: '#86efac', label: '📦 Food Ready for Pickup' },
  'Out for Delivery': { bg: '#eff6ff', text: '#1d4ed8', border: '#bfdbfe', label: '🛵 Out for Delivery' },
  Delivered: { bg: '#f8fafc', text: '#334155', border: '#cbd5e1', label: '✅ Delivered' },
  Rejected: { bg: '#fef2f2', text: '#991b1b', border: '#fecaca', label: '❌ Rejected / Cancelled' },
  Cancelled: { bg: '#fef2f2', text: '#991b1b', border: '#fecaca', label: '❌ Cancelled' }
};

const OnlineOrders = () => {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('All');
  const [providerFilter, setProviderFilter] = useState('All');
  const [autoAccept, setAutoAccept] = useState(() => localStorage.getItem('online_auto_accept') === 'true');
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [simulating, setSimulating] = useState(false);

  // Rejection Modal
  const [rejectModalOpen, setRejectModalOpen] = useState(false);
  const [selectedOrderId, setSelectedOrderId] = useState(null);
  const [reason, setReason] = useState('Item Out of Stock');
  const [submittingAction, setSubmittingAction] = useState(false);

  // Rider Assignment Modal
  const [riderModalOpen, setRiderModalOpen] = useState(false);
  const [riderOrderId, setRiderOrderId] = useState(null);
  const [riderName, setRiderName] = useState('');
  const [riderPhone, setRiderPhone] = useState('');

  // Audio Synth Alert on New Order
  const playAlertChime = useCallback(() => {
    if (!soundEnabled) return;
    try {
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const now = audioCtx.currentTime;

      // Tone 1
      const osc1 = audioCtx.createOscillator();
      const gain1 = audioCtx.createGain();
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(880, now);
      gain1.gain.setValueAtTime(0.3, now);
      gain1.gain.exponentialRampToValueAtTime(0.01, now + 0.35);
      osc1.connect(gain1);
      gain1.connect(audioCtx.destination);
      osc1.start(now);
      osc1.stop(now + 0.35);

      // Tone 2
      const osc2 = audioCtx.createOscillator();
      const gain2 = audioCtx.createGain();
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(1174, now + 0.15);
      gain2.gain.setValueAtTime(0.35, now + 0.15);
      gain2.gain.exponentialRampToValueAtTime(0.01, now + 0.55);
      osc2.connect(gain2);
      gain2.connect(audioCtx.destination);
      osc2.start(now + 0.15);
      osc2.stop(now + 0.55);
    } catch {
      // Audio autoplay policy fallback
    }
  }, [soundEnabled]);

  // Fetch Orders from API
  const fetchOrders = useCallback(async (isSilent = false) => {
    try {
      if (!isSilent) setLoading(true);
      const res = await api.get('/online-orders');
      const orderList = Array.isArray(res.data?.data) ? res.data.data : [];
      setOrders(orderList);
    } catch (err) {
      console.error('Error fetching online orders:', err);
      if (!isSilent) toast.error('Could not load online orders.');
    } finally {
      if (!isSilent) setLoading(false);
    }
  }, []);

  // Accept Order Handler
  const handleAcceptOrder = async (orderId) => {
    try {
      setSubmittingAction(true);
      await api.post(`/online-orders/accept/${orderId}`);
      toast.success('Order accepted & dispatched to Kitchen KDS! 🍳');
      await fetchOrders(true);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to accept order.');
    } finally {
      setSubmittingAction(false);
    }
  };

  // Reject Order Handler
  const confirmRejectOrder = async () => {
    if (!selectedOrderId) return;
    try {
      setSubmittingAction(true);
      await api.post(`/online-orders/reject/${selectedOrderId}`, { reason });
      toast.error(`Order rejected: ${reason}`);
      setRejectModalOpen(false);
      setSelectedOrderId(null);
      await fetchOrders(true);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to reject order.');
    } finally {
      setSubmittingAction(false);
    }
  };

  // Status Change Handler
  const handleStatusChange = async (orderId, newStatus) => {
    try {
      setSubmittingAction(true);
      await api.patch(`/online-orders/status/${orderId}`, { status: newStatus });
      toast.success(`Status updated to ${newStatus}`);
      await fetchOrders(true);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to update status.');
    } finally {
      setSubmittingAction(false);
    }
  };

  // Assign Rider Handler
  const confirmAssignRider = async () => {
    if (!riderOrderId) return;
    const partner = riderName ? `${riderName.trim()} (${riderPhone.trim() || 'No phone'})` : 'Delivery Partner';
    try {
      setSubmittingAction(true);
      await api.post(`/online-orders/assign-rider/${riderOrderId}`, { deliveryPartner: partner });
      await api.patch(`/online-orders/status/${riderOrderId}`, { status: 'Out for Delivery' });
      toast.success(`Rider ${riderName || 'Partner'} assigned! Order is Out for Delivery 🛵`);
      setRiderModalOpen(false);
      setRiderOrderId(null);
      setRiderName('');
      setRiderPhone('');
      await fetchOrders(true);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to assign rider.');
    } finally {
      setSubmittingAction(false);
    }
  };

  // Simulate Order Handler
  const handleSimulateOrder = async (provider) => {
    try {
      setSimulating(true);
      const res = await api.post('/online-orders/simulate', { provider });
      toast.success(`Simulated ${provider} Order #${res.data?.data?.providerOrderId || ''} placed!`);
      playAlertChime();
      await fetchOrders(true);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Simulation failed.');
    } finally {
      setSimulating(false);
    }
  };

  // WhatsApp Customer Delivery Notification
  const handleWhatsAppCustomer = (order) => {
    const rawPhone = order.customerPhone || '';
    const cleanPhone = rawPhone.replace(/\D/g, '');
    const phoneWithCode = cleanPhone.length === 10 ? `91${cleanPhone}` : cleanPhone;

    const message = `*TAMANNA RESTAURANT — ORDER UPDATE*\n` +
      `--------------------------------\n` +
      `Namaste *${order.customerName}*,\n` +
      `Aapka *${order.provider}* Order #${order.providerOrderId} dispatch ho gaya hai!\n\n` +
      `${order.deliveryPartner ? `*Delivery Rider:* ${order.deliveryPartner}\n` : ''}` +
      `*Delivery Address:* ${order.deliveryAddress || 'Your location'}\n` +
      `*Bill Amount:* ₹${order.subtotal}\n\n` +
      `Aapka khana garma-garam pahunch raha hai. Dining with us is a pleasure! 🍽️`;

    const encoded = encodeURIComponent(message);
    const waUrl = phoneWithCode ? `https://wa.me/${phoneWithCode}?text=${encoded}` : `https://wa.me/?text=${encoded}`;
    window.open(waUrl, '_blank');
  };

  // Socket Connection for Real-Time Incoming Orders
  useEffect(() => {
    fetchOrders();

    const socket = io(SOCKET_URL, { transports: ['websocket', 'polling'] });

    socket.on('online-order-created', (payload) => {
      const newOrder = payload?.order || payload;
      playAlertChime();
      toast(`🛵 New ${newOrder.provider || 'Online'} Order #${newOrder.providerOrderId || ''}!`, {
        icon: '🔔',
        style: { borderRadius: '10px', background: '#0f172a', color: '#fff', fontWeight: 700 }
      });

      setOrders(prev => [newOrder, ...prev.filter(o => o._id !== newOrder._id)]);

      // Auto-Accept Feature Check
      if (localStorage.getItem('online_auto_accept') === 'true' && newOrder._id) {
        setTimeout(() => {
          handleAcceptOrder(newOrder._id);
        }, 1500);
      }
    });

    socket.on('online-order-updated', (payload) => {
      const updatedOrder = payload?.order || payload;
      setOrders(prev => prev.map(o => (o._id === updatedOrder._id ? updatedOrder : o)));
    });

    return () => {
      socket.disconnect();
    };
  }, [fetchOrders, playAlertChime]);

  // Toggle Auto-Accept
  const toggleAutoAccept = () => {
    const nextVal = !autoAccept;
    setAutoAccept(nextVal);
    localStorage.setItem('online_auto_accept', String(nextVal));
    toast.success(`⚡ Auto-Accept is now ${nextVal ? 'ENABLED' : 'DISABLED'}`);
  };

  // Calculations
  const pendingCount = orders.filter(o => o.status === 'Pending').length;
  const preparingCount = orders.filter(o => ['Accepted', 'Preparing'].includes(o.status)).length;
  const outDeliveryCount = orders.filter(o => o.status === 'Out for Delivery').length;
  const deliveredCount = orders.filter(o => o.status === 'Delivered').length;

  const totalGrossSales = orders
    .filter(o => !['Rejected', 'Cancelled'].includes(o.status))
    .reduce((sum, o) => sum + (Number(o.subtotal) || 0), 0);

  const totalCommission = orders
    .filter(o => !['Rejected', 'Cancelled'].includes(o.status))
    .reduce((sum, o) => sum + (Number(o.commissionAmount) || (Number(o.subtotal || 0) * 0.18)), 0);

  const netReceivable = Math.max(0, totalGrossSales - totalCommission);

  // Filtered Orders
  const filteredOrders = orders.filter(order => {
    const matchesProvider = providerFilter === 'All' || order.provider === providerFilter;
    if (!matchesProvider) return false;
    if (statusFilter === 'All') return true;
    if (statusFilter === 'Pending') return order.status === 'Pending';
    if (statusFilter === 'Preparing') return ['Accepted', 'Preparing', 'Ready for Pickup'].includes(order.status);
    if (statusFilter === 'Out for Delivery') return order.status === 'Out for Delivery';
    if (statusFilter === 'Delivered') return order.status === 'Delivered';
    if (statusFilter === 'Rejected') return ['Rejected', 'Cancelled'].includes(order.status);
    return true;
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', width: '100%', boxSizing: 'border-box', background: '#f8fafc', overflowY: 'auto', padding: '28px', fontFamily: 'Inter, sans-serif' }}>
      <Toaster position="top-right" />
      <div style={{ maxWidth: '1440px', width: '100%', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '22px', paddingBottom: '40px' }}>

        {/* Top Header Card */}
        <div style={{ background: '#ffffff', padding: '24px 28px', borderRadius: '16px', border: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.02)', flexWrap: 'wrap', gap: '16px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <span style={{ background: '#fef2f2', padding: '10px', borderRadius: '12px', color: '#dc2626', fontSize: '20px' }}>🛵</span>
              <div>
                <h2 style={{ margin: 0, fontSize: '22px', color: '#0f172a', fontWeight: '800', letterSpacing: '-0.5px' }}>
                  Online Aggregators Center
                </h2>
                <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#64748b' }}>
                  Live Orders from Zomato, Swiggy, & Direct Online Deliveries.
                </p>
              </div>
            </div>
          </div>

          {/* Action & Simulation Bar */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            {/* Auto Accept Switch */}
            <button
              onClick={toggleAutoAccept}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '9px 15px',
                borderRadius: '10px',
                border: '1px solid',
                borderColor: autoAccept ? '#86efac' : '#cbd5e1',
                background: autoAccept ? '#f0fdf4' : '#f8fafc',
                color: autoAccept ? '#166534' : '#475569',
                fontWeight: 700,
                fontSize: '12px',
                cursor: 'pointer'
              }}
            >
              <span>{autoAccept ? '⚡ Auto-Accept: ON' : '⏸️ Auto-Accept: OFF'}</span>
            </button>

            {/* Sound Toggle */}
            <button
              onClick={() => setSoundEnabled(!soundEnabled)}
              title={soundEnabled ? 'Mute buzzer alert' : 'Enable buzzer alert'}
              style={{ padding: '9px 12px', background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: '10px', fontSize: '13px', cursor: 'pointer' }}
            >
              {soundEnabled ? '🔔 Sound ON' : '🔕 Muted'}
            </button>

            {/* Test Simulator Buttons */}
            <button
              disabled={simulating}
              onClick={() => handleSimulateOrder('Zomato')}
              style={{ background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca', padding: '9px 14px', borderRadius: '10px', fontWeight: '700', fontSize: '12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              🍔 + Simulate Zomato
            </button>

            <button
              disabled={simulating}
              onClick={() => handleSimulateOrder('Swiggy')}
              style={{ background: '#fff7ed', color: '#ea580c', border: '1px solid #fed7aa', padding: '9px 14px', borderRadius: '10px', fontWeight: '700', fontSize: '12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              🛵 + Simulate Swiggy
            </button>

            {pendingCount > 0 && (
              <div style={{ background: '#dc2626', color: '#fff', padding: '9px 16px', borderRadius: '20px', fontWeight: '800', fontSize: '12px', animation: 'pulse 2s infinite' }}>
                {pendingCount} Pending
              </div>
            )}
          </div>
        </div>

        {/* Financial & Status KPI Bar */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px' }}>
          <div style={{ background: '#fff', padding: '16px 20px', borderRadius: '12px', border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ background: '#f1f5f9', padding: '10px', borderRadius: '10px', fontSize: '18px' }}>📦</div>
            <div>
              <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 700, textTransform: 'uppercase' }}>Total Orders</div>
              <div style={{ fontSize: '20px', fontWeight: 800, color: '#0f172a', marginTop: '2px' }}>{orders.length}</div>
            </div>
          </div>

          <div style={{ background: '#fff', padding: '16px 20px', borderRadius: '12px', border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ background: '#fef3c7', padding: '10px', borderRadius: '10px', fontSize: '18px' }}>🔔</div>
            <div>
              <div style={{ fontSize: '11px', color: '#b45309', fontWeight: 700, textTransform: 'uppercase' }}>Pending Accept</div>
              <div style={{ fontSize: '20px', fontWeight: 800, color: '#b45309', marginTop: '2px' }}>{pendingCount}</div>
            </div>
          </div>

          <div style={{ background: '#fff', padding: '16px 20px', borderRadius: '12px', border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ background: '#eff6ff', padding: '10px', borderRadius: '10px', fontSize: '18px' }}>🍳</div>
            <div>
              <div style={{ fontSize: '11px', color: '#1d4ed8', fontWeight: 700, textTransform: 'uppercase' }}>Kitchen Preparing</div>
              <div style={{ fontSize: '20px', fontWeight: 800, color: '#1d4ed8', marginTop: '2px' }}>{preparingCount}</div>
            </div>
          </div>

          <div style={{ background: '#fff', padding: '16px 20px', borderRadius: '12px', border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ background: '#ecfdf5', padding: '10px', borderRadius: '10px', fontSize: '18px' }}>💰</div>
            <div>
              <div style={{ fontSize: '11px', color: '#059669', fontWeight: 700, textTransform: 'uppercase' }}>Gross Sales</div>
              <div style={{ fontSize: '20px', fontWeight: 800, color: '#065f46', marginTop: '2px' }}>₹{totalGrossSales.toFixed(2)}</div>
            </div>
          </div>

          <div style={{ background: '#fff', padding: '16px 20px', borderRadius: '12px', border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ background: '#f8fafc', padding: '10px', borderRadius: '10px', fontSize: '18px' }}>💵</div>
            <div>
              <div style={{ fontSize: '11px', color: '#475569', fontWeight: 700, textTransform: 'uppercase' }}>Net Take-Home</div>
              <div style={{ fontSize: '20px', fontWeight: 800, color: '#0f172a', marginTop: '2px' }}>₹{netReceivable.toFixed(2)}</div>
            </div>
          </div>
        </div>

        {/* Filter Navigation Bar */}
        <div style={{ background: '#fff', padding: '14px 18px', borderRadius: '14px', border: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
          {/* Status Tabs */}
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            {[
              { id: 'All', label: 'All Orders', count: orders.length },
              { id: 'Pending', label: '🔔 Pending', count: pendingCount },
              { id: 'Preparing', label: '🍳 In Kitchen', count: preparingCount },
              { id: 'Out for Delivery', label: '🛵 On the Way', count: outDeliveryCount },
              { id: 'Delivered', label: '✅ Delivered', count: deliveredCount },
              { id: 'Rejected', label: '❌ Rejected', count: orders.filter(o => ['Rejected', 'Cancelled'].includes(o.status)).length }
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setStatusFilter(tab.id)}
                style={{
                  padding: '7px 14px',
                  borderRadius: '8px',
                  border: 'none',
                  fontSize: '12px',
                  fontWeight: '700',
                  cursor: 'pointer',
                  background: statusFilter === tab.id ? '#0f172a' : '#f1f5f9',
                  color: statusFilter === tab.id ? '#fff' : '#475569',
                  transition: 'all 0.15s ease'
                }}
              >
                {tab.label} {tab.count > 0 ? `(${tab.count})` : ''}
              </button>
            ))}
          </div>

          {/* Provider Filter */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: '#64748b' }}>
            <span style={{ fontWeight: 600 }}>Aggregator:</span>
            {['All', 'Zomato', 'Swiggy', 'Direct'].map(prov => (
              <button
                key={prov}
                onClick={() => setProviderFilter(prov)}
                style={{
                  padding: '5px 10px',
                  borderRadius: '6px',
                  border: '1px solid',
                  borderColor: providerFilter === prov ? '#0f172a' : '#cbd5e1',
                  background: providerFilter === prov ? '#0f172a' : '#fff',
                  color: providerFilter === prov ? '#fff' : '#334155',
                  fontSize: '11px',
                  fontWeight: 700,
                  cursor: 'pointer'
                }}
              >
                {prov}
              </button>
            ))}
          </div>
        </div>

        {/* Orders Grid */}
        {loading ? (
          <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '14px', padding: '60px 20px', textAlign: 'center', color: '#64748b' }}>
            <div style={{ fontSize: '14px', fontWeight: 600 }}>Fetching live online orders from server...</div>
          </div>
        ) : filteredOrders.length === 0 ? (
          <div style={{ background: '#ffffff', border: '1px dashed #cbd5e1', borderRadius: '14px', padding: '60px 20px', textAlign: 'center', color: '#64748b' }}>
            <div style={{ fontSize: '48px', marginBottom: '12px' }}>🛵</div>
            <div style={{ fontSize: '18px', fontWeight: '800', color: '#0f172a', marginBottom: '6px' }}>No orders in "{statusFilter}" view</div>
            <p style={{ fontSize: '13px', margin: '0 0 16px' }}>Click one of the simulation buttons above to create a test Zomato or Swiggy order.</p>
            <button
              onClick={() => handleSimulateOrder('Zomato')}
              style={{ background: '#e23744', color: '#fff', border: 'none', padding: '10px 18px', borderRadius: '8px', fontWeight: 700, fontSize: '12px', cursor: 'pointer' }}
            >
              🍔 Generate Test Zomato Order
            </button>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(420px, 1fr))', gap: '20px' }}>
            {filteredOrders.map((order) => {
              const provStyle = PROVIDER_COLORS[order.provider] || PROVIDER_COLORS.Zomato;
              const statusStyle = STATUS_BADGES[order.status] || STATUS_BADGES.Pending;
              const isPending = order.status === 'Pending';
              const isKitchen = ['Accepted', 'Preparing'].includes(order.status);
              const isReady = order.status === 'Ready for Pickup';
              const isOut = order.status === 'Out for Delivery';
              const isDelivered = order.status === 'Delivered';
              const isRejected = ['Rejected', 'Cancelled'].includes(order.status);

              return (
                <div
                  key={order._id}
                  style={{
                    background: '#ffffff',
                    borderRadius: '16px',
                    border: `1.5px solid ${isPending ? '#f59e0b' : '#e2e8f0'}`,
                    padding: '22px',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    gap: '16px',
                    boxShadow: isPending ? '0 10px 25px -5px rgba(245, 158, 11, 0.15)' : '0 4px 6px -1px rgba(0,0,0,0.02)',
                    transition: 'all 0.2s ease'
                  }}
                >
                  {/* Card Top: Provider & Time */}
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #f1f5f9', paddingBottom: '12px', marginBottom: '14px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <span style={{ padding: '4px 10px', borderRadius: '8px', background: provStyle.bg, color: provStyle.text, border: `1px solid ${provStyle.border}`, fontWeight: '800', fontSize: '13px' }}>
                          {order.provider}
                        </span>
                        <strong style={{ fontSize: '14px', color: '#0f172a' }}>#{order.providerOrderId}</strong>
                      </div>
                      <span style={{ fontSize: '11px', color: '#64748b', fontWeight: '600' }}>
                        🕒 {formatElapsed(order.createdAt)}
                      </span>
                    </div>

                    {/* Customer Info */}
                    <div style={{ background: '#f8fafc', borderRadius: '10px', padding: '12px', border: '1px solid #f1f5f9', marginBottom: '14px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <strong style={{ fontSize: '14px', color: '#0f172a' }}>👤 {order.customerName}</strong>
                        {order.customerPhone && (
                          <button
                            onClick={() => handleWhatsAppCustomer(order)}
                            title="Message customer on WhatsApp"
                            style={{ background: '#dcfce7', color: '#15803d', border: '1px solid #86efac', padding: '3px 8px', borderRadius: '6px', fontSize: '10px', fontWeight: 700, cursor: 'pointer' }}
                          >
                            💬 WhatsApp
                          </button>
                        )}
                      </div>
                      <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>📞 {order.customerPhone || 'Not provided'}</div>
                      <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>📍 {order.deliveryAddress || 'Direct counter pickup'}</div>
                      {order.deliveryPartner && (
                        <div style={{ fontSize: '11px', color: '#1e40af', fontWeight: 700, marginTop: '6px', background: '#eff6ff', padding: '4px 8px', borderRadius: '6px' }}>
                          🛵 Rider: {order.deliveryPartner}
                        </div>
                      )}
                    </div>

                    {/* Items List */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '14px' }}>
                      {(order.items || []).map((item, idx) => (
                        <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '12px', color: '#334155', background: '#ffffff', padding: '6px 10px', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                          <div>
                            <strong style={{ color: '#0f172a' }}>{item.quantity}x</strong> {item.name}
                          </div>
                          <span style={{ fontWeight: 700, color: '#475569' }}>₹{(item.price * item.quantity).toFixed(2)}</span>
                        </div>
                      ))}
                    </div>

                    {/* Rejection / Cancellation Note */}
                    {order.statusHistory?.find(h => h.status === 'Rejected') && (
                      <div style={{ fontSize: '11px', color: '#dc2626', background: '#fef2f2', padding: '8px 10px', borderRadius: '6px', border: '1px solid #fecaca', marginBottom: '14px' }}>
                        <strong>Rejection Reason:</strong> {order.statusHistory.find(h => h.status === 'Rejected')?.updatedBy || 'Kitchen busy'}
                      </div>
                    )}
                  </div>

                  {/* Card Bottom: Financials & Action Buttons */}
                  <div>
                    {/* Financial Breakdown */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px dashed #e2e8f0', paddingTop: '10px', marginBottom: '14px', fontSize: '12px' }}>
                      <div>
                        <div style={{ color: '#64748b', fontSize: '11px' }}>Gross Total: <strong style={{ color: '#0f172a' }}>₹{order.subtotal}</strong></div>
                        <div style={{ color: '#ea580c', fontSize: '10px' }}>Comm (18%): -₹{Number(order.commissionAmount || (order.subtotal * 0.18)).toFixed(2)}</div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: '10px', color: '#64748b', textTransform: 'uppercase', fontWeight: 700 }}>Net Payout</div>
                        <div style={{ fontSize: '16px', fontWeight: '800', color: '#16a34a' }}>
                          ₹{(order.subtotal - Number(order.commissionAmount || (order.subtotal * 0.18))).toFixed(2)}
                        </div>
                      </div>
                    </div>

                    {/* Action Buttons based on status */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
                      <span style={{ padding: '5px 10px', borderRadius: '6px', fontSize: '11px', fontWeight: '700', background: statusStyle.bg, color: statusStyle.text, border: `1px solid ${statusStyle.border}` }}>
                        {statusStyle.label}
                      </span>

                      {/* Dynamic Action Buttons */}
                      <div style={{ display: 'flex', gap: '6px' }}>
                        {isPending && (
                          <>
                            <button
                              onClick={() => { setSelectedOrderId(order._id); setRejectModalOpen(true); }}
                              disabled={submittingAction}
                              style={{ background: '#fee2e2', color: '#dc2626', border: '1px solid #fecaca', padding: '8px 12px', borderRadius: '8px', fontSize: '11px', fontWeight: '700', cursor: 'pointer' }}
                            >
                              ❌ Reject
                            </button>
                            <button
                              onClick={() => handleAcceptOrder(order._id)}
                              disabled={submittingAction}
                              style={{ background: '#10b981', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: '8px', fontSize: '11px', fontWeight: '700', cursor: 'pointer', boxShadow: '0 2px 4px rgba(16, 185, 129, 0.2)' }}
                            >
                              ✅ Accept
                            </button>
                          </>
                        )}

                        {isKitchen && (
                          <button
                            onClick={() => handleStatusChange(order._id, 'Ready for Pickup')}
                            disabled={submittingAction}
                            style={{ background: '#0284c7', color: '#fff', border: 'none', padding: '8px 14px', borderRadius: '8px', fontSize: '11px', fontWeight: '700', cursor: 'pointer' }}
                          >
                            📦 Mark Ready
                          </button>
                        )}

                        {isReady && (
                          <button
                            onClick={() => { setRiderOrderId(order._id); setRiderModalOpen(true); }}
                            disabled={submittingAction}
                            style={{ background: '#4f46e5', color: '#fff', border: 'none', padding: '8px 14px', borderRadius: '8px', fontSize: '11px', fontWeight: '700', cursor: 'pointer' }}
                          >
                            🛵 Assign Rider
                          </button>
                        )}

                        {isOut && (
                          <button
                            onClick={() => handleStatusChange(order._id, 'Delivered')}
                            disabled={submittingAction}
                            style={{ background: '#16a34a', color: '#fff', border: 'none', padding: '8px 14px', borderRadius: '8px', fontSize: '11px', fontWeight: '700', cursor: 'pointer' }}
                          >
                            ✅ Mark Delivered
                          </button>
                        )}
                      </div>
                    </div>
                  </div>

                </div>
              );
            })}
          </div>
        )}

      </div>

      {/* ================= REJECT REASON MODAL ================= */}
      {rejectModalOpen && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000, padding: '20px' }}>
          <div style={{ background: '#fff', padding: '28px', borderRadius: '16px', width: '420px', maxWidth: '100%', boxShadow: '0 10px 25px rgba(0,0,0,0.1)' }}>
            <h3 style={{ margin: '0 0 10px', fontSize: '18px', color: '#0f172a', fontWeight: '800' }}>⚠️ Select Rejection Reason</h3>
            <p style={{ fontSize: '13px', color: '#64748b', marginBottom: '16px' }}>Choose why this aggregator order cannot be fulfilled:</p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '20px' }}>
              {['Item Out of Stock', 'Kitchen Overloaded / Too Busy', 'Restaurant Closing Soon', 'Power / Equipment Issue', 'Delivery Area Unserviceable'].map((item) => (
                <label key={item} style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '13px', color: '#334155', cursor: 'pointer', background: '#f8fafc', padding: '10px 12px', borderRadius: '8px', border: reason === item ? '1.5px solid #dc2626' : '1px solid #e2e8f0' }}>
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
                type="button"
                onClick={() => setRejectModalOpen(false)}
                style={{ padding: '9px 14px', background: '#f1f5f9', border: 'none', borderRadius: '8px', fontWeight: '600', cursor: 'pointer', fontSize: '12px', color: '#475569' }}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={submittingAction}
                onClick={confirmRejectOrder}
                style={{ padding: '9px 16px', background: '#dc2626', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: '700', cursor: 'pointer', fontSize: '12px' }}
              >
                {submittingAction ? 'Rejecting...' : 'Confirm Rejection'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================= ASSIGN RIDER MODAL ================= */}
      {riderModalOpen && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000, padding: '20px' }}>
          <div style={{ background: '#fff', padding: '28px', borderRadius: '16px', width: '420px', maxWidth: '100%', boxShadow: '0 10px 25px rgba(0,0,0,0.1)' }}>
            <h3 style={{ margin: '0 0 10px', fontSize: '18px', color: '#0f172a', fontWeight: '800' }}>🛵 Assign Delivery Partner</h3>
            <p style={{ fontSize: '13px', color: '#64748b', marginBottom: '16px' }}>Enter delivery rider details for handover:</p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '20px' }}>
              <div>
                <label style={{ fontSize: '12px', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '4px' }}>Rider Name</label>
                <input
                  type="text"
                  placeholder="e.g. Ramesh Kumar (Swiggy / Direct)"
                  value={riderName}
                  onChange={e => setRiderName(e.target.value)}
                  style={{ width: '100%', padding: '10px', border: '1px solid #cbd5e1', borderRadius: '8px', fontSize: '13px', boxSizing: 'border-box' }}
                />
              </div>

              <div>
                <label style={{ fontSize: '12px', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '4px' }}>Rider Contact Number</label>
                <input
                  type="text"
                  placeholder="e.g. 9876543210"
                  value={riderPhone}
                  onChange={e => setRiderPhone(e.target.value)}
                  style={{ width: '100%', padding: '10px', border: '1px solid #cbd5e1', borderRadius: '8px', fontSize: '13px', boxSizing: 'border-box' }}
                />
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button
                type="button"
                onClick={() => setRiderModalOpen(false)}
                style={{ padding: '9px 14px', background: '#f1f5f9', border: 'none', borderRadius: '8px', fontWeight: '600', cursor: 'pointer', fontSize: '12px', color: '#475569' }}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={submittingAction}
                onClick={confirmAssignRider}
                style={{ padding: '9px 18px', background: '#0f172a', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: '700', cursor: 'pointer', fontSize: '12px' }}
              >
                {submittingAction ? 'Assigning...' : 'Dispatch & Mark Out'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default OnlineOrders;