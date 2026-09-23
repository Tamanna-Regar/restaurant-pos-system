import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';
import io from 'socket.io-client';
import { openRazorpayCheckout } from '../utils/razorpayHelper';

const API_BASE = 'http://localhost:5000/api';
const SOCKET_URL = 'http://localhost:5000';

const normalizeMenuItem = (item, index) => ({
  ...item,
  _id: item?._id || item?.id || `menu-${index + 1}`,
  name: item?.name || `Menu Item ${index + 1}`,
  price: Number(item?.price || 0),
  halfPrice: item?.halfPrice ? Number(item.halfPrice) : null,
  category: item?.category || 'Main Course',
  foodType: String(item?.foodType || 'veg').toLowerCase(),
  isAvailable: item?.isAvailable !== false
});

const CustomerMenu = () => {
  const { tableId } = useParams();

  // State
  const [menuItems, setMenuItems] = useState([]);
  const [activeTab, setActiveTab] = useState('menu'); // 'menu' | 'track'
  const [cart, setCart] = useState([]);
  const [loading, setLoading] = useState(true);
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [isPayingRazorpay, setIsPayingRazorpay] = useState(false);
  const [error, setError] = useState('');
  const [tableInfo, setTableInfo] = useState(null);
  const [activeOrder, setActiveOrder] = useState(null);

  // Filters & Customizations
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [vegOnly, setVegOnly] = useState(false);
  const [customizingItem, setCustomizingItem] = useState(null);
  const [selectedPortion, setSelectedPortion] = useState('Full');
  const [selectedAddons, setSelectedAddons] = useState([]);
  const [customCookingNote, setCustomCookingNote] = useState('');

  // Call Waiter Modal State
  const [showCallWaiterModal, setShowCallWaiterModal] = useState(false);
  const [callReason, setCallReason] = useState('water');
  const [callNote, setCallNote] = useState('');
  const [isCallingWaiter, setIsCallingWaiter] = useState(false);
  const [waiterCallSuccess, setWaiterCallSuccess] = useState('');

  // Fetch Menu
  const fetchMenu = useCallback(async () => {
    try {
      const res = await axios.get(`${API_BASE}/menu`);
      const items = Array.isArray(res.data) ? res.data : (res.data?.data || []);
      setMenuItems(items.map(normalizeMenuItem));
    } catch (err) {
      console.error('Error fetching menu:', err);
      setError('Menu is currently unavailable. Please ask your server.');
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch Live Table & Active Order Status
  const fetchTableStatus = useCallback(async () => {
    if (!tableId) return;
    try {
      const res = await axios.get(`${API_BASE}/orders/public/qr/status/${tableId}`);
      if (res.data?.success) {
        setTableInfo(res.data.table);
        if (res.data.activeOrder) {
          setActiveOrder(res.data.activeOrder);
        }
      }
    } catch (err) {
      console.error('Error fetching table status:', err);
    }
  }, [tableId]);

  useEffect(() => {
    fetchMenu();
    fetchTableStatus();

    // Socket.io Real-time connection
    const socket = io(SOCKET_URL, { transports: ['websocket', 'polling'] });

    socket.on('order-updated', (data) => {
      if (data && (data.tableId === tableId || data.tableId?._id === tableId || data.tableId?.tableNo === tableId)) {
        setActiveOrder(data);
      } else {
        fetchTableStatus();
      }
    });

    socket.on('kot-status-update', () => {
      fetchTableStatus();
    });

    socket.on('menu-item-availability-updated', (data) => {
      setMenuItems(prev => prev.map(i => i._id === data.itemId ? { ...i, isAvailable: data.isAvailable } : i));
    });

    return () => socket.disconnect();
  }, [fetchMenu, fetchTableStatus, tableId]);

  // Categories
  const categories = useMemo(() => {
    const set = new Set();
    menuItems.forEach(i => { if (i.category) set.add(i.category); });
    return ['All', ...Array.from(set)];
  }, [menuItems]);

  // Filtered Menu Items
  const filteredItems = useMemo(() => {
    return menuItems.filter(item => {
      const matchesCat = selectedCategory === 'All' || item.category === selectedCategory;
      const matchesSearch = !search || item.name.toLowerCase().includes(search.toLowerCase());
      const matchesVeg = !vegOnly || item.foodType === 'veg';
      return matchesCat && matchesSearch && matchesVeg;
    });
  }, [menuItems, selectedCategory, search, vegOnly]);

  // Open item modal for portion / notes / addons
  const openItemCustomization = (item) => {
    setCustomizingItem(item);
    setSelectedPortion('Full');
    setSelectedAddons([]);
    setCustomCookingNote('');
  };

  const addonName = (addon) => typeof addon === 'string' ? addon : addon?.name || '';
  const addonPrice = (addon) => typeof addon === 'string' ? 0 : Number(addon?.price || 0);

  // Add customized item to cart
  const confirmAddToCart = () => {
    if (!customizingItem) return;
    const isHalf = selectedPortion === 'Half' && customizingItem.halfPrice;
    const basePrice = isHalf ? customizingItem.halfPrice : customizingItem.price;
    const addonSum = selectedAddons.reduce((sum, a) => sum + addonPrice(a), 0);
    const itemTotal = basePrice + addonSum;

    const cartKey = `${customizingItem._id}:${selectedPortion}:${selectedAddons.map(addonName).join('|')}:${customCookingNote}`;

    setCart(prev => {
      const existing = prev.find(i => i.cartKey === cartKey);
      if (existing) {
        return prev.map(i => i.cartKey === cartKey ? { ...i, qty: i.qty + 1 } : i);
      }
      return [...prev, {
        ...customizingItem,
        portion: selectedPortion,
        price: itemTotal,
        basePrice,
        addons: selectedAddons,
        notes: customCookingNote,
        cartKey,
        qty: 1
      }];
    });

    setCustomizingItem(null);
  };

  // Direct quick add (Full portion)
  const quickAddToCart = (item) => {
    if (item.addons?.length || item.halfPrice) {
      openItemCustomization(item);
      return;
    }
    const cartKey = `${item._id}:Full::`;
    setCart(prev => {
      const existing = prev.find(i => i.cartKey === cartKey);
      if (existing) {
        return prev.map(i => i.cartKey === cartKey ? { ...i, qty: i.qty + 1 } : i);
      }
      return [...prev, {
        ...item,
        portion: 'Full',
        price: item.price,
        addons: [],
        notes: '',
        cartKey,
        qty: 1
      }];
    });
  };

  const updateQuantity = (cartKey, delta) => {
    setCart(prev => prev.map(item => {
      if (item.cartKey === cartKey) {
        const newQty = item.qty + delta;
        return newQty > 0 ? { ...item, qty: newQty } : null;
      }
      return item;
    }).filter(Boolean));
  };

  const calculateSubtotal = () => cart.reduce((sum, i) => sum + (Number(i.price) * Number(i.qty)), 0);
  const calculateTax = () => Number((calculateSubtotal() * 0.05).toFixed(2));
  const calculateGrandTotal = () => Number((calculateSubtotal() + calculateTax()).toFixed(2));

  // Handle Submit Order
  const handlePlaceOrder = async () => {
    if (cart.length === 0) return;

    try {
      const orderData = {
        tableId: tableId || 'QR-Table',
        orderType: 'Dine-In',
        customerName: customerName || 'Guest at Table',
        customerPhone: '',
        items: cart.map(item => ({
          itemId: item._id,
          name: item.name,
          foodType: item.foodType || 'veg',
          portion: item.portion || 'Full',
          quantity: Number(item.qty || 1),
          price: Number(item.price || 0),
          notes: item.notes || (item.addons?.length ? `Add-ons: ${item.addons.map(addonName).join(', ')}` : ''),
          addons: item.addons || []
        }))
      };

      const res = await axios.post(`${API_BASE}/orders/public/qr`, orderData);
      if (res.data?.success) {
        setActiveOrder(res.data.data);
        setCart([]);
        setActiveTab('track');
      }
    } catch (err) {
      console.error('Order placement failed:', err);
      alert(err.response?.data?.message || 'Failed to place order. Please try again.');
    }
  };

  // Call Waiter Request
  const handleCallWaiter = async () => {
    try {
      setIsCallingWaiter(true);
      await axios.post(`${API_BASE}/orders/public/qr/call-waiter`, {
        tableId: tableId || 'QR-Table',
        requestType: callReason,
        customNote: callNote
      });
      setWaiterCallSuccess('Captain / Waiter has been alerted! They will assist you shortly.');
      setTimeout(() => {
        setWaiterCallSuccess('');
        setShowCallWaiterModal(false);
        setCallNote('');
      }, 3000);
    } catch (err) {
      alert('Could not notify waiter. Please inform the captain directly.');
    } finally {
      setIsCallingWaiter(false);
    }
  };

  // Handle Instant Online Payment with Razorpay
  const handlePayOnlineWithRazorpay = async () => {
    if (!activeOrder) return;
    setIsPayingRazorpay(true);
    try {
      await openRazorpayCheckout({
        orderId: activeOrder._id,
        amount: activeOrder.grandTotal,
        customerName: customerName || activeOrder.customerName || 'Table Guest',
        customerPhone: customerPhone || activeOrder.customerPhone || '',
        description: `Bill for ${tableLabel} - Tamanna Pure Veg`,
        onSuccess: (paymentData) => {
          setIsPayingRazorpay(false);
          setActiveOrder((prev) => ({
            ...prev,
            paymentStatus: 'paid',
            paymentMode: 'Razorpay',
            paymentReference: paymentData.paymentId
          }));
          alert(`🎉 Payment Successful! Reference ID: ${paymentData.paymentId}. Thank you for dining with Tamanna Pure Veg Restaurant!`);
        },
        onFailure: (err) => {
          setIsPayingRazorpay(false);
          alert(`Payment Failed: ${err.message || 'Payment not completed'}`);
        },
        onDismiss: () => {
          setIsPayingRazorpay(false);
        }
      });
    } catch (err) {
      setIsPayingRazorpay(false);
      alert(err.message || 'Could not launch Razorpay Gateway');
    }
  };

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '100px 20px', fontFamily: 'sans-serif', color: '#64748b' }}>
        <div style={{ fontSize: '36px', marginBottom: '14px' }}>🍽️</div>
        <h3>Loading Tamanna Menu...</h3>
      </div>
    );
  }

  const tableLabel = tableInfo?.tableNo ? `Table ${tableInfo.tableNo}` : (tableId ? `Table ${tableId}` : 'Dining Table');

  return (
    <div style={{ maxWidth: '560px', margin: '0 auto', background: '#f8fafc', minHeight: '100vh', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif', paddingBottom: '90px' }}>
      
      {/* Top Header */}
      <header style={{
        background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
        color: '#fff',
        padding: '16px 20px',
        position: 'sticky',
        top: 0,
        zIndex: 30,
        boxShadow: '0 2px 10px rgba(0,0,0,0.15)'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h1 style={{ margin: 0, fontSize: '18px', fontWeight: '800', letterSpacing: '0.3px' }}>
              TAMANNA RESTAURANT
            </h1>
            <div style={{ fontSize: '12px', color: '#38bdf8', fontWeight: '600', marginTop: '2px' }}>
              📍 {tableLabel} {tableInfo?.floor ? `· ${tableInfo.floor}` : ''}
            </div>
          </div>

          {/* Quick Call Waiter Button */}
          <button
            onClick={() => setShowCallWaiterModal(true)}
            style={{
              background: '#f59e0b',
              color: '#000',
              border: 0,
              borderRadius: '20px',
              padding: '6px 14px',
              fontSize: '12px',
              fontWeight: '800',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              cursor: 'pointer',
              boxShadow: '0 2px 8px rgba(245, 158, 11, 0.4)'
            }}
          >
            <span>🛎️</span>
            <span>Call Waiter</span>
          </button>
        </div>

        {/* Navigation Tabs (Menu vs Live Order Tracker) */}
        <div style={{
          display: 'flex',
          background: 'rgba(255, 255, 255, 0.1)',
          padding: '4px',
          borderRadius: '10px',
          marginTop: '14px',
          gap: '4px'
        }}>
          <button
            onClick={() => setActiveTab('menu')}
            style={{
              flex: 1,
              background: activeTab === 'menu' ? '#fff' : 'transparent',
              color: activeTab === 'menu' ? '#0f172a' : '#94a3b8',
              border: 0,
              borderRadius: '8px',
              padding: '8px',
              fontSize: '13px',
              fontWeight: '700',
              cursor: 'pointer'
            }}
          >
            📖 Digital Menu
          </button>
          <button
            onClick={() => setActiveTab('track')}
            style={{
              flex: 1,
              background: activeTab === 'track' ? '#fff' : 'transparent',
              color: activeTab === 'track' ? '#0f172a' : '#94a3b8',
              border: 0,
              borderRadius: '8px',
              padding: '8px',
              fontSize: '13px',
              fontWeight: '700',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px'
            }}
          >
            <span>⏱ Live Order</span>
            {activeOrder && (
              <span style={{
                background: '#10b981',
                color: '#fff',
                fontSize: '10px',
                padding: '1px 6px',
                borderRadius: '10px'
              }}>
                Active
              </span>
            )}
          </button>
        </div>
      </header>

      {/* ERROR BANNER */}
      {error && (
        <div style={{ margin: '14px 20px', padding: '12px', background: '#fee2e2', color: '#991b1b', borderRadius: '8px', fontSize: '13px' }}>
          {error}
        </div>
      )}

      {/* ─── TAB 1: MENU VIEW ─── */}
      {activeTab === 'menu' && (
        <div style={{ padding: '16px 20px' }}>
          
          {/* Guest Name Input */}
          <div style={{ marginBottom: '14px' }}>
            <input
              type="text"
              placeholder="Your Name (e.g. Rahul Sharma)"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              style={{
                width: '100%',
                background: '#fff',
                border: '1px solid #cbd5e1',
                borderRadius: '8px',
                padding: '10px 14px',
                fontSize: '13px',
                boxSizing: 'border-box'
              }}
            />
          </div>

          {/* Search & Veg Filter */}
          <div style={{ display: 'flex', gap: '10px', marginBottom: '14px' }}>
            <input
              type="text"
              placeholder="🔍 Search dishes..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{
                flex: 1,
                background: '#fff',
                border: '1px solid #cbd5e1',
                borderRadius: '8px',
                padding: '10px 14px',
                fontSize: '13px',
                boxSizing: 'border-box'
              }}
            />
            <button
              onClick={() => setVegOnly(!vegOnly)}
              style={{
                background: vegOnly ? '#15803d' : '#fff',
                color: vegOnly ? '#fff' : '#15803d',
                border: '1px solid #15803d',
                borderRadius: '8px',
                padding: '0 14px',
                fontSize: '12px',
                fontWeight: '700',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '4px'
              }}
            >
              <span>🟢</span>
              <span>Veg Only</span>
            </button>
          </div>

          {/* Category Slider */}
          <div style={{
            display: 'flex',
            overflowX: 'auto',
            gap: '8px',
            marginBottom: '16px',
            paddingBottom: '4px'
          }}>
            {categories.map(cat => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                style={{
                  background: selectedCategory === cat ? '#0f172a' : '#fff',
                  color: selectedCategory === cat ? '#fff' : '#475569',
                  border: '1px solid #cbd5e1',
                  borderRadius: '20px',
                  padding: '6px 14px',
                  fontSize: '12px',
                  fontWeight: '600',
                  whiteSpace: 'nowrap',
                  cursor: 'pointer'
                }}
              >
                {cat}
              </button>
            ))}
          </div>

          {/* Menu Items List */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {filteredItems.map(item => {
              const isAvailable = item.isAvailable !== false;
              const hasHalf = !!item.halfPrice;

              return (
                <div
                  key={item._id}
                  style={{
                    background: '#fff',
                    borderRadius: '12px',
                    padding: '14px',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
                    border: '1px solid #e2e8f0',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: '12px',
                    opacity: isAvailable ? 1 : 0.6
                  }}
                >
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span>{item.foodType === 'non-veg' ? '🔴' : '🟢'}</span>
                      <span style={{ fontSize: '15px', fontWeight: '700', color: '#1e293b' }}>
                        {item.name}
                      </span>
                    </div>

                    <div style={{ marginTop: '4px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '15px', fontWeight: '800', color: '#059669' }}>
                        ₹{item.price}
                      </span>
                      {hasHalf && (
                        <span style={{ fontSize: '12px', color: '#64748b' }}>
                          (Half: ₹{item.halfPrice})
                        </span>
                      )}
                    </div>

                    {item.description && (
                      <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px', lineHeight: '1.4' }}>
                        {item.description}
                      </div>
                    )}
                  </div>

                  {/* Add Button */}
                  <div>
                    {!isAvailable ? (
                      <span style={{
                        background: '#f1f5f9',
                        color: '#94a3b8',
                        fontSize: '11px',
                        fontWeight: '700',
                        padding: '6px 12px',
                        borderRadius: '6px'
                      }}>
                        Out of Stock
                      </span>
                    ) : (
                      <button
                        onClick={() => quickAddToCart(item)}
                        style={{
                          background: '#2563eb',
                          color: '#fff',
                          border: 0,
                          borderRadius: '8px',
                          padding: '8px 16px',
                          fontSize: '13px',
                          fontWeight: '700',
                          cursor: 'pointer',
                          boxShadow: '0 2px 6px rgba(37, 99, 235, 0.3)'
                        }}
                      >
                        ADD +
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ─── TAB 2: LIVE ORDER TRACKER VIEW ─── */}
      {activeTab === 'track' && (
        <div style={{ padding: '20px' }}>
          {!activeOrder ? (
            <div style={{
              textAlign: 'center',
              padding: '60px 20px',
              background: '#fff',
              borderRadius: '16px',
              border: '1px solid #e2e8f0'
            }}>
              <div style={{ fontSize: '42px', marginBottom: '10px' }}>🍽️</div>
              <h3 style={{ margin: '0 0 6px 0', color: '#1e293b' }}>No Active Order</h3>
              <p style={{ margin: '0 0 16px 0', fontSize: '13px', color: '#64748b' }}>
                You have not placed any order yet for {tableLabel}.
              </p>
              <button
                onClick={() => setActiveTab('menu')}
                style={{
                  background: '#2563eb',
                  color: '#fff',
                  border: 0,
                  borderRadius: '8px',
                  padding: '10px 20px',
                  fontSize: '13px',
                  fontWeight: '700',
                  cursor: 'pointer'
                }}
              >
                Browse Menu & Order
              </button>
            </div>
          ) : (
            <div>
              {/* Order Status Timeline Card */}
              <div style={{
                background: '#fff',
                borderRadius: '16px',
                padding: '20px',
                boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
                border: '1px solid #e2e8f0',
                marginBottom: '16px'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                  <div>
                    <h3 style={{ margin: 0, fontSize: '16px', color: '#0f172a' }}>
                      Order Status: <span style={{ textTransform: 'capitalize', color: '#2563eb' }}>{activeOrder.orderStatus}</span>
                    </h3>
                    <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>
                      Invoice #{activeOrder.invoiceNumber || String(activeOrder._id || '').slice(-6)}
                    </div>
                  </div>

                  <button
                    onClick={fetchTableStatus}
                    style={{
                      background: '#f1f5f9',
                      border: 0,
                      borderRadius: '6px',
                      padding: '6px 10px',
                      fontSize: '11px',
                      cursor: 'pointer',
                      fontWeight: '600'
                    }}
                  >
                    🔄 Refresh
                  </button>
                </div>

                {/* Progress Steps */}
                {(() => {
                  const steps = [
                    { id: 'placed', label: 'Order Received', icon: '⏳' },
                    { id: 'preparing', label: 'Cooking', icon: '🔥' },
                    { id: 'ready', label: 'Ready', icon: '✅' },
                    { id: 'served', label: 'Served', icon: '🍽️' }
                  ];

                  const statusOrder = { placed: 0, preparing: 1, ready: 2, served: 3, billed: 4 };
                  const currentIdx = statusOrder[activeOrder.orderStatus] ?? 0;

                  return (
                    <div style={{ display: 'flex', justifyContent: 'space-between', position: 'relative', marginTop: '10px' }}>
                      {steps.map((st, idx) => {
                        const isDone = currentIdx >= idx;
                        const isCurrent = currentIdx === idx;

                        return (
                          <div key={st.id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1, zIndex: 2 }}>
                            <div style={{
                              width: '36px',
                              height: '36px',
                              borderRadius: '50%',
                              background: isCurrent ? '#2563eb' : (isDone ? '#10b981' : '#e2e8f0'),
                              color: isDone ? '#fff' : '#64748b',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontSize: '16px',
                              boxShadow: isCurrent ? '0 0 10px rgba(37, 99, 235, 0.5)' : 'none',
                              marginBottom: '6px'
                            }}>
                              {st.icon}
                            </div>
                            <span style={{
                              fontSize: '11px',
                              fontWeight: isCurrent ? 'bold' : 'normal',
                              color: isCurrent ? '#2563eb' : (isDone ? '#0f172a' : '#94a3b8'),
                              textAlign: 'center'
                            }}>
                              {st.label}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
              </div>

              {/* Items in Active Order */}
              <div style={{
                background: '#fff',
                borderRadius: '16px',
                padding: '20px',
                boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
                border: '1px solid #e2e8f0',
                marginBottom: '16px'
              }}>
                <h4 style={{ margin: '0 0 12px 0', fontSize: '14px', color: '#0f172a' }}>
                  Ordered Items ({activeOrder.items?.length || 0})
                </h4>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {(activeOrder.items || []).map((item, idx) => (
                    <div
                      key={idx}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        padding: '8px 0',
                        borderBottom: idx !== activeOrder.items.length - 1 ? '1px dashed #f1f5f9' : 'none'
                      }}
                    >
                      <div>
                        <div style={{ fontSize: '14px', fontWeight: '600', color: '#1e293b' }}>
                          {item.foodType === 'non-veg' ? '🔴' : '🟢'} {item.name} × {item.quantity}
                          {item.portion && item.portion !== 'Full' && (
                            <span style={{ fontSize: '11px', color: '#64748b', marginLeft: '6px' }}>({item.portion})</span>
                          )}
                        </div>
                        {item.notes && (
                          <div style={{ fontSize: '11px', color: '#f59e0b', marginTop: '2px' }}>
                            Note: {item.notes}
                          </div>
                        )}
                      </div>
                      <div style={{ fontWeight: '700', fontSize: '14px', color: '#0f172a' }}>
                        ₹{(item.price * item.quantity).toFixed(2)}
                      </div>
                    </div>
                  ))}
                </div>

                <div style={{ borderTop: '1px solid #e2e8f0', marginTop: '12px', paddingTop: '12px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: '#64748b', marginBottom: '4px' }}>
                    <span>Subtotal:</span>
                    <span>₹{activeOrder.subTotal}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: '#64748b', marginBottom: '8px' }}>
                    <span>GST (5%):</span>
                    <span>₹{activeOrder.tax}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '16px', fontWeight: '800', color: '#0f172a' }}>
                    <span>Grand Total:</span>
                    <span>₹{activeOrder.grandTotal}</span>
                  </div>
                </div>

                {/* Razorpay Online Payment Integration */}
                {activeOrder.paymentStatus === 'paid' ? (
                  <div style={{
                    backgroundColor: '#dcfce7',
                    border: '1px solid #86efac',
                    borderRadius: '10px',
                    padding: '14px',
                    marginTop: '14px',
                    textAlign: 'center'
                  }}>
                    <div style={{ color: '#166534', fontWeight: 'bold', fontSize: '15px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                      <span>✅</span>
                      <span>Bill Paid & Cleared Online</span>
                    </div>
                    <div style={{ color: '#15803d', fontSize: '12px', marginTop: '4px' }}>
                      Mode: {activeOrder.paymentMode || 'Razorpay'} · Ref: {activeOrder.paymentReference || 'Paid'}
                    </div>
                    <div style={{ color: '#166534', fontSize: '11px', marginTop: '4px' }}>
                      Thank you for dining with Tamanna Pure Veg! 🙏
                    </div>
                  </div>
                ) : (
                  <div style={{ marginTop: '16px' }}>
                    <button
                      onClick={handlePayOnlineWithRazorpay}
                      disabled={isPayingRazorpay}
                      style={{
                        width: '100%',
                        background: 'linear-gradient(135deg, #0284c7 0%, #16a34a 100%)',
                        color: '#fff',
                        border: 0,
                        borderRadius: '12px',
                        padding: '14px',
                        fontSize: '15px',
                        fontWeight: '800',
                        cursor: isPayingRazorpay ? 'not-allowed' : 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '8px',
                        boxShadow: '0 4px 14px rgba(2, 132, 199, 0.35)',
                        opacity: isPayingRazorpay ? 0.7 : 1
                      }}
                    >
                      <span>⚡</span>
                      <span>{isPayingRazorpay ? 'Opening Razorpay Gateway...' : `Pay ₹${activeOrder.grandTotal} with Razorpay`}</span>
                    </button>
                    <div style={{ fontSize: '11px', color: '#64748b', textAlign: 'center', marginTop: '6px' }}>
                      🔒 UPI (GPay, PhonePe, Paytm), RuPay, Visa, MC & NetBanking
                    </div>
                  </div>
                )}
              </div>

              {/* Order More Button */}
              <button
                onClick={() => setActiveTab('menu')}
                style={{
                  width: '100%',
                  background: '#059669',
                  color: '#fff',
                  border: 0,
                  borderRadius: '12px',
                  padding: '14px',
                  fontSize: '14px',
                  fontWeight: '800',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  boxShadow: '0 2px 8px rgba(5, 150, 105, 0.3)'
                }}
              >
                <span>➕</span>
                <span>Order More Dishes for {tableLabel}</span>
              </button>
            </div>
          )}
        </div>
      )}

      {/* ─── STICKY CART BAR (WHEN ITEMS IN CART) ─── */}
      {cart.length > 0 && activeTab === 'menu' && (
        <div style={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          maxWidth: '560px',
          margin: '0 auto',
          background: '#0f172a',
          color: '#fff',
          padding: '14px 20px',
          boxShadow: '0 -4px 20px rgba(0,0,0,0.25)',
          zIndex: 40,
          borderTopLeftRadius: '16px',
          borderTopRightRadius: '16px'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
            <div>
              <div style={{ fontSize: '12px', color: '#94a3b8' }}>
                {cart.reduce((sum, i) => sum + i.qty, 0)} Items in Cart
              </div>
              <div style={{ fontSize: '18px', fontWeight: '900', color: '#38bdf8' }}>
                ₹{calculateGrandTotal()} <span style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 'normal' }}>(incl. GST)</span>
              </div>
            </div>

            <button
              onClick={handlePlaceOrder}
              style={{
                background: '#10b981',
                color: '#fff',
                border: 0,
                borderRadius: '10px',
                padding: '10px 20px',
                fontSize: '14px',
                fontWeight: '800',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                boxShadow: '0 2px 10px rgba(16, 185, 129, 0.4)'
              }}
            >
              <span>🔥</span>
              <span>{activeOrder ? 'ADD TO ORDER' : 'PLACE ORDER'}</span>
            </button>
          </div>

          {/* Cart preview list */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '120px', overflowY: 'auto' }}>
            {cart.map(item => (
              <div key={item.cartKey} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '12px' }}>
                <span style={{ color: '#e2e8f0' }}>{item.name} [{item.portion}]</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <button onClick={() => updateQuantity(item.cartKey, -1)} style={{ background: '#334155', color: '#fff', border: 0, borderRadius: '4px', width: '22px', height: '22px', cursor: 'pointer' }}>-</button>
                  <span>{item.qty}</span>
                  <button onClick={() => updateQuantity(item.cartKey, 1)} style={{ background: '#334155', color: '#fff', border: 0, borderRadius: '4px', width: '22px', height: '22px', cursor: 'pointer' }}>+</button>
                  <span style={{ fontWeight: 'bold', width: '50px', textAlign: 'right' }}>₹{(item.price * item.qty).toFixed(0)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ─── CUSTOMIZE ITEM MODAL (PORTION & NOTES) ─── */}
      {customizingItem && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.6)',
          zIndex: 50,
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'center'
        }}>
          <div style={{
            background: '#fff',
            width: '100%',
            maxWidth: '560px',
            borderTopLeftRadius: '20px',
            borderTopRightRadius: '20px',
            padding: '20px',
            boxShadow: '0 -4px 25px rgba(0,0,0,0.3)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '17px', color: '#0f172a' }}>
                  {customizingItem.name}
                </h3>
                <span style={{ fontSize: '13px', color: '#059669', fontWeight: 'bold' }}>
                  Base: ₹{customizingItem.price}
                </span>
              </div>
              <button
                onClick={() => setCustomizingItem(null)}
                style={{ background: '#f1f5f9', border: 0, borderRadius: '50%', width: '32px', height: '32px', cursor: 'pointer', fontWeight: 'bold' }}
              >
                ✕
              </button>
            </div>

            {/* Portion Selector */}
            {customizingItem.halfPrice && (
              <div style={{ marginBottom: '14px' }}>
                <label style={{ fontSize: '12px', fontWeight: 'bold', color: '#475569', display: 'block', marginBottom: '6px' }}>
                  SELECT PORTION
                </label>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <button
                    onClick={() => setSelectedPortion('Full')}
                    style={{
                      flex: 1,
                      padding: '10px',
                      borderRadius: '8px',
                      border: selectedPortion === 'Full' ? '2px solid #2563eb' : '1px solid #cbd5e1',
                      background: selectedPortion === 'Full' ? '#eff6ff' : '#fff',
                      color: selectedPortion === 'Full' ? '#2563eb' : '#0f172a',
                      fontWeight: 'bold',
                      fontSize: '13px',
                      cursor: 'pointer'
                    }}
                  >
                    Full (₹{customizingItem.price})
                  </button>
                  <button
                    onClick={() => setSelectedPortion('Half')}
                    style={{
                      flex: 1,
                      padding: '10px',
                      borderRadius: '8px',
                      border: selectedPortion === 'Half' ? '2px solid #2563eb' : '1px solid #cbd5e1',
                      background: selectedPortion === 'Half' ? '#eff6ff' : '#fff',
                      color: selectedPortion === 'Half' ? '#2563eb' : '#0f172a',
                      fontWeight: 'bold',
                      fontSize: '13px',
                      cursor: 'pointer'
                    }}
                  >
                    Half (₹{customizingItem.halfPrice})
                  </button>
                </div>
              </div>
            )}

            {/* Addons List */}
            {customizingItem.addons?.length > 0 && (
              <div style={{ marginBottom: '14px' }}>
                <label style={{ fontSize: '12px', fontWeight: 'bold', color: '#475569', display: 'block', marginBottom: '6px' }}>
                  ADD-ONS
                </label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {customizingItem.addons.map(addon => {
                    const name = addonName(addon);
                    const price = addonPrice(addon);
                    const isSelected = selectedAddons.some(a => addonName(a) === name);

                    return (
                      <label key={name} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px', border: '1px solid #e2e8f0', borderRadius: '8px', cursor: 'pointer' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => {
                              setSelectedAddons(prev => isSelected ? prev.filter(a => addonName(a) !== name) : [...prev, addon]);
                            }}
                          />
                          <span style={{ fontSize: '13px', fontWeight: '600' }}>{name}</span>
                        </div>
                        {price > 0 && <span style={{ fontSize: '12px', color: '#059669', fontWeight: 'bold' }}>+₹{price}</span>}
                      </label>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Cooking Notes */}
            <div style={{ marginBottom: '16px' }}>
              <label style={{ fontSize: '12px', fontWeight: 'bold', color: '#475569', display: 'block', marginBottom: '6px' }}>
                SPECIAL COOKING INSTRUCTIONS
              </label>
              <input
                type="text"
                placeholder="e.g. Less spicy, Extra crispy, No garlic"
                value={customCookingNote}
                onChange={(e) => setCustomCookingNote(e.target.value)}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  borderRadius: '8px',
                  border: '1px solid #cbd5e1',
                  fontSize: '13px',
                  boxSizing: 'border-box'
                }}
              />
            </div>

            <button
              onClick={confirmAddToCart}
              style={{
                width: '100%',
                background: '#2563eb',
                color: '#fff',
                border: 0,
                borderRadius: '10px',
                padding: '12px',
                fontSize: '14px',
                fontWeight: 'bold',
                cursor: 'pointer'
              }}
            >
              Add to Cart
            </button>
          </div>
        </div>
      )}

      {/* ─── CALL WAITER MODAL ─── */}
      {showCallWaiterModal && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.65)',
          zIndex: 60,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '20px'
        }}>
          <div style={{
            background: '#fff',
            width: '100%',
            maxWidth: '400px',
            borderRadius: '16px',
            padding: '20px',
            boxShadow: '0 8px 30px rgba(0,0,0,0.25)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
              <h3 style={{ margin: 0, fontSize: '18px', color: '#0f172a' }}>
                🛎️ Call Server for {tableLabel}
              </h3>
              <button
                onClick={() => setShowCallWaiterModal(false)}
                style={{ background: '#f1f5f9', border: 0, borderRadius: '50%', width: '28px', height: '28px', cursor: 'pointer' }}
              >
                ✕
              </button>
            </div>

            {waiterCallSuccess ? (
              <div style={{
                textAlign: 'center',
                padding: '24px 10px',
                background: '#f0fdf4',
                color: '#15803d',
                borderRadius: '10px',
                fontSize: '14px',
                fontWeight: 'bold'
              }}>
                ✅ {waiterCallSuccess}
              </div>
            ) : (
              <div>
                <p style={{ margin: '0 0 14px 0', fontSize: '13px', color: '#64748b' }}>
                  What do you need assistance with?
                </p>

                {/* Quick Request Options */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '14px' }}>
                  {[
                    { id: 'water', label: '💧 Water', desc: 'Need drinking water' },
                    { id: 'cutlery', label: '🍴 Cutlery', desc: 'Spoons / Napkins' },
                    { id: 'bill', label: '🧾 Request Bill', desc: 'Ready for check' },
                    { id: 'waiter', label: '🙋 Call Captain', desc: 'General help' }
                  ].map(opt => (
                    <button
                      key={opt.id}
                      onClick={() => setCallReason(opt.id)}
                      style={{
                        padding: '12px 10px',
                        borderRadius: '10px',
                        border: callReason === opt.id ? '2px solid #f59e0b' : '1px solid #cbd5e1',
                        background: callReason === opt.id ? '#fef3c7' : '#fff',
                        textAlign: 'left',
                        cursor: 'pointer'
                      }}
                    >
                      <div style={{ fontWeight: 'bold', fontSize: '13px', color: '#0f172a' }}>{opt.label}</div>
                      <div style={{ fontSize: '10px', color: '#64748b', marginTop: '2px' }}>{opt.desc}</div>
                    </button>
                  ))}
                </div>

                <div style={{ marginBottom: '16px' }}>
                  <input
                    type="text"
                    placeholder="Optional message (e.g. Extra lemons, ice)"
                    value={callNote}
                    onChange={(e) => setCallNote(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '10px',
                      borderRadius: '8px',
                      border: '1px solid #cbd5e1',
                      fontSize: '13px',
                      boxSizing: 'border-box'
                    }}
                  />
                </div>

                <button
                  onClick={handleCallWaiter}
                  disabled={isCallingWaiter}
                  style={{
                    width: '100%',
                    background: '#f59e0b',
                    color: '#000',
                    border: 0,
                    borderRadius: '10px',
                    padding: '12px',
                    fontSize: '14px',
                    fontWeight: '800',
                    cursor: 'pointer',
                    boxShadow: '0 2px 8px rgba(245, 158, 11, 0.4)'
                  }}
                >
                  {isCallingWaiter ? 'Alerting Server...' : '🔔 NOTIFY SERVER NOW'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default CustomerMenu;