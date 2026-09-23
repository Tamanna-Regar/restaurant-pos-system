import React, { useState, useEffect, useMemo, useCallback } from 'react';
import io from 'socket.io-client';
import toast, { Toaster } from 'react-hot-toast';
import { api } from '../api';
import { playTone, announceAuditEvent } from '../utils/audioAlert';
import { openRazorpayCheckout } from '../utils/razorpayHelper';

// Quick 1-tap cooking instruction tags
export const QUICK_COOKING_TAGS = [
  '🌶️ Less Spicy',
  '🔥 Extra Spicy',
  '🌿 Jain Prep (No Onion/Garlic)',
  '✨ Less Oil',
  '🧈 Extra Butter',
  '🍪 Extra Crispy',
  '🥡 Pack / Parcel',
  '⚡ Serve Urgently',
  '🥛 Dairy Free / No Milk'
];

export default function WaiterOrderingApp() {
  // Session & Authentication
  const [user, setUser] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('user') || 'null');
    } catch {
      return null;
    }
  });
  const [token, setToken] = useState(() => localStorage.getItem('token') || '');
  const [pinInput, setPinInput] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [loginError, setLoginError] = useState('');

  // Tables, Menu & Active Orders
  const [tables, setTables] = useState([]);
  const [menuItems, setMenuItems] = useState([]);
  const [activeOrders, setActiveOrders] = useState([]);
  const [activeWaiterAlerts, setActiveWaiterAlerts] = useState([]);
  const [foodReadyAlerts, setFoodReadyAlerts] = useState([]);
  const [loading, setLoading] = useState(true);

  // Selected Table & Ordering Context
  const [selectedTable, setSelectedTable] = useState(null);
  const [selectedFloor, setSelectedFloor] = useState('Veg Floor');
  const [orderModeTab, setOrderModeTab] = useState('menu'); // 'menu' | 'running'
  const [cart, setCart] = useState([]);
  const [guestCount, setGuestCount] = useState(2);
  const [showCartDrawer, setShowCartDrawer] = useState(false);
  const [isSubmittingKot, setIsSubmittingKot] = useState(false);

  // Menu Filters & Search
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [pureVegFilter, setPureVegFilter] = useState('all'); // 'all' | 'jain' | 'chef' | 'fast'
  const [notesItem, setNotesItem] = useState(null);
  const [customNote, setCustomNote] = useState('');

  // Modals
  const [showShiftModal, setShowShiftModal] = useState(false);
  const [targetShiftTableId, setTargetShiftTableId] = useState('');
  const [isShifting, setIsShifting] = useState(false);

  const [showMergeModal, setShowMergeModal] = useState(false);
  const [targetMergeTableId, setTargetMergeTableId] = useState('');
  const [isMerging, setIsMerging] = useState(false);

  const [showBillModal, setShowBillModal] = useState(false);
  const [isRequestingBill, setIsRequestingBill] = useState(false);
  const [isProcessingRazorpay, setIsProcessingRazorpay] = useState(false);

  const [cancelItemTarget, setCancelItemTarget] = useState(null);
  const [cancelReason, setCancelReason] = useState('');
  const [isCancellingItem, setIsCancellingItem] = useState(false);

  // Audio buzzer chime
  const playBuzzer = (type = 'success') => {
    try {
      playTone(type);
    } catch {
      // Audio fallback
    }
  };

  // Socket Connection for live table, KOT & Kitchen alerts
  useEffect(() => {
    const socket = io('http://localhost:5000');

    socket.on('table-updated', () => loadData(false));
    socket.on('new-kot', () => loadData(false));
    socket.on('order-updated', () => loadData(false));

    // Kitchen marked an item status (placed -> preparing -> ready -> served)
    socket.on('kot-item-updated', (data) => {
      loadData(false);
      if (data?.status === 'ready') {
        playBuzzer('success');
      }
    });

    // Dedicated food-ready buzzer event from kitchen chef
    socket.on('food-ready', (alert) => {
      playBuzzer('success');
      setFoodReadyAlerts((prev) => [
        {
          id: `${Date.now()}-${alert.itemId}`,
          orderId: alert.orderId,
          kotNumber: alert.kotNumber,
          itemId: alert.itemId,
          itemName: alert.itemName || 'Dish',
          portion: alert.portion || 'Full',
          quantity: alert.quantity || 1,
          tableNo: alert.tableNo || 'Table',
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        },
        ...prev.slice(0, 5)
      ]);

      toast(`🛎️ Table T-${alert.tableNo}: ${alert.itemName} is READY for pickup!`, {
        icon: '🛎️',
        duration: 8000,
        style: { background: '#10b981', color: '#fff', fontWeight: 'bold' }
      });
    });

    // Guest assistance request (Call Waiter / Cutlery / Water / Bill)
    socket.on('call-waiter', (alertData) => {
      playBuzzer('warning');
      setActiveWaiterAlerts((prev) => [alertData, ...prev.slice(0, 4)]);
      toast(`🛎️ Table ${alertData.tableNo}: ${String(alertData.requestType).toUpperCase()}`, {
        icon: '🛎️',
        duration: 8000,
        style: { background: '#f59e0b', color: '#000', fontWeight: 'bold' }
      });
    });

    return () => socket.disconnect();
  }, []);

  const loadData = useCallback(async (showSpinner = true) => {
    if (!token) return;
    try {
      if (showSpinner) setLoading(true);
      const [resTables, resMenu, resOrders] = await Promise.all([
        api.get('/tables').catch(() => ({ data: [] })),
        api.get('/menu').catch(() => ({ data: { data: [] } })),
        api.get('/orders/active').catch(() => ({ data: { data: [] } }))
      ]);

      const tblList = Array.isArray(resTables.data?.data)
        ? resTables.data.data
        : Array.isArray(resTables.data)
        ? resTables.data
        : [];
      const mList = Array.isArray(resMenu.data?.data)
        ? resMenu.data.data
        : Array.isArray(resMenu.data)
        ? resMenu.data
        : [];
      const oList = Array.isArray(resOrders.data?.data)
        ? resOrders.data.data
        : Array.isArray(resOrders.data)
        ? resOrders.data
        : [];

      setTables(tblList);
      setMenuItems(mList);
      setActiveOrders(oList);
    } catch (err) {
      console.error('Failed to load waiter data:', err);
    } finally {
      if (showSpinner) setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (token) {
      loadData(true);
    }
  }, [token, loadData]);

  // Handle Quick PIN Login
  const handlePinSubmit = async (e) => {
    if (e) e.preventDefault();
    if (!pinInput || pinInput.length < 4) {
      setLoginError('Please enter your 4-digit staff PIN');
      return;
    }
    try {
      setIsLoggingIn(true);
      setLoginError('');
      const res = await api.post('/auth/login-pin', { pin: pinInput });
      if (res.data?.success) {
        localStorage.setItem('token', res.data.token);
        localStorage.setItem('refreshToken', res.data.refreshToken);
        localStorage.setItem('user', JSON.stringify(res.data.user));
        setUser(res.data.user);
        setToken(res.data.token);
        toast.success(`Welcome, ${res.data.user.name}!`);
        setPinInput('');
      }
    } catch (err) {
      setLoginError(err.response?.data?.message || 'Invalid PIN. Try again.');
      setPinInput('');
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('user');
    setUser(null);
    setToken('');
    setSelectedTable(null);
    setCart([]);
  };

  // Find active running order for currently selected table
  const currentTableOrder = useMemo(() => {
    if (!selectedTable) return null;
    return activeOrders.find(
      (o) =>
        (o.tableId?._id === selectedTable._id || String(o.tableId) === String(selectedTable._id)) &&
        ['placed', 'preparing', 'ready', 'billed'].includes(o.orderStatus)
    );
  }, [selectedTable, activeOrders]);

  // Unique floors
  const availableFloors = useMemo(() => {
    const list = Array.from(new Set(tables.map((t) => t.floor || 'Veg Floor')));
    return list.length ? list : ['Veg Floor'];
  }, [tables]);

  const filteredTables = useMemo(() => {
    return tables.filter((t) => (t.floor || 'Veg Floor') === selectedFloor);
  }, [tables, selectedFloor]);

  // Free tables available for shift/transfer
  const freeTablesForShift = useMemo(() => {
    if (!selectedTable) return [];
    return tables.filter(
      (t) => String(t._id) !== String(selectedTable._id) && (t.status === 'available' || !t.status)
    );
  }, [tables, selectedTable]);

  // Unique Categories
  const categories = useMemo(() => {
    const cats = Array.from(new Set(menuItems.map((m) => m.category || 'Main Course')));
    return ['All', ...cats];
  }, [menuItems]);

  // Pure Veg Menu filtering
  const filteredMenuItems = useMemo(() => {
    return menuItems.filter((item) => {
      if (item.isAvailable === false) return false;
      if (selectedCategory !== 'All' && item.category !== selectedCategory) return false;

      // Pure Veg Specific Filters
      if (pureVegFilter === 'jain') {
        const isJain = item.isJainAvailable || item.isJain || (item.name || '').toLowerCase().includes('jain') || (item.description || '').toLowerCase().includes('jain');
        if (!isJain) return false;
      } else if (pureVegFilter === 'chef') {
        const isSpecial = item.isChefSpecial || item.isPopular || item.isRecommended;
        if (!isSpecial) return false;
      } else if (pureVegFilter === 'fast') {
        const isFasting = (item.name || '').toLowerCase().includes('falahari') || (item.name || '').toLowerCase().includes('upvas') || (item.category || '').toLowerCase().includes('fasting');
        if (!isFasting) return false;
      }

      if (search.trim()) {
        const query = search.trim().toLowerCase();
        const matchName = item.name?.toLowerCase().includes(query);
        const matchCode = item.code?.toLowerCase().includes(query);
        if (!matchName && !matchCode) return false;
      }
      return true;
    });
  }, [menuItems, selectedCategory, pureVegFilter, search]);

  // Cart operations
  const addToCart = (item, portion = 'Full') => {
    const unitPrice = portion === 'Half' && item.halfPrice ? item.halfPrice : item.price;
    const cartKey = `${item._id}-${portion}`;

    setCart((prev) => {
      const idx = prev.findIndex((i) => i.cartKey === cartKey);
      if (idx > -1) {
        const next = [...prev];
        next[idx].quantity += 1;
        return next;
      }
      return [
        ...prev,
        {
          cartKey,
          itemId: item._id,
          name: item.name,
          portion,
          price: unitPrice,
          foodType: 'veg',
          quantity: 1,
          notes: ''
        }
      ];
    });
    playBuzzer('success');
    toast.success(`+1 ${item.name} (${portion})`, { duration: 1000 });
  };

  const updateCartQty = (cartKey, delta) => {
    setCart((prev) => {
      return prev
        .map((item) => {
          if (item.cartKey === cartKey) {
            const newQty = item.quantity + delta;
            return newQty > 0 ? { ...item, quantity: newQty } : null;
          }
          return item;
        })
        .filter(Boolean);
    });
  };

  const removeCartItem = (cartKey) => {
    setCart((prev) => prev.filter((i) => i.cartKey !== cartKey));
  };

  // Quick tag toggle for cooking note
  const toggleQuickTag = (tag) => {
    setCustomNote((prev) => {
      if (prev.includes(tag)) {
        return prev.replace(tag, '').replace(/,\s*,/g, ',').trim();
      }
      return prev ? `${prev}, ${tag}` : tag;
    });
  };

  const saveCustomNote = () => {
    if (!notesItem) return;
    setCart((prev) =>
      prev.map((i) => (i.cartKey === notesItem.cartKey ? { ...i, notes: customNote.trim() } : i))
    );
    setNotesItem(null);
    setCustomNote('');
  };

  // Quick Repeat (+1) feature for running KOT items
  const handleQuickRepeatItem = (item) => {
    addToCart({ _id: item.itemId || item._id, name: item.name, price: item.price, halfPrice: item.halfPrice }, item.portion || 'Full');
    setOrderModeTab('menu');
    setShowCartDrawer(true);
    toast.success(`Repeated: +1 ${item.name}. Ready to punch KOT!`);
  };

  // Mark Item as Served
  const handleMarkItemServed = async (kotNumber, itemId) => {
    if (!currentTableOrder) return;
    try {
      const res = await api.put(`/orders/${currentTableOrder._id}/item-status`, {
        kotNumber,
        itemId,
        status: 'served',
        chef: user?.name || 'Captain'
      });
      if (res.data?.success) {
        toast.success('Dish marked as Served! 🥗');
        playBuzzer('success');
        await loadData(false);
      }
    } catch (err) {
      console.error('Mark Served Error:', err);
      toast.error('Failed to update status to Served');
    }
  };

  // Dismiss food ready pickup alert
  const dismissFoodReadyAlert = async (alert) => {
    setFoodReadyAlerts((prev) => prev.filter((a) => a.id !== alert.id));
    if (alert.orderId && alert.itemId) {
      await handleMarkItemServed(alert.kotNumber, alert.itemId);
    }
  };

  // Cancel / Void Item in KOT
  const handleCancelItem = async () => {
    if (!cancelItemTarget || !currentTableOrder) return;
    if (!cancelReason.trim()) {
      toast.error('Please enter reason for cancellation');
      return;
    }

    try {
      setIsCancellingItem(true);
      const res = await api.put(`/orders/${currentTableOrder._id}/item-status`, {
        kotNumber: cancelItemTarget.kotNumber,
        itemId: cancelItemTarget.itemId,
        status: 'cancelled',
        reason: cancelReason.trim(),
        chef: user?.name || 'Captain'
      });
      if (res.data?.success) {
        toast.success(`Item cancelled: ${cancelItemTarget.name}`);
        playBuzzer('void');
        setCancelItemTarget(null);
        setCancelReason('');
        await loadData(false);
      }
    } catch (err) {
      console.error('Cancel Item Error:', err);
      toast.error(err.response?.data?.message || 'Failed to cancel item');
    } finally {
      setIsCancellingItem(false);
    }
  };

  // Send KOT to Kitchen
  const handlePunchKot = async () => {
    if (!selectedTable) return;
    if (cart.length === 0) {
      toast.error('Cart is empty! Add dishes first.');
      return;
    }

    try {
      setIsSubmittingKot(true);
      const waiterName = user?.name || 'Captain';

      if (currentTableOrder) {
        // Table already has an order -> Punch additional KOT #2/#3
        const payload = {
          newItems: cart.map((i) => ({
            itemId: i.itemId,
            name: i.name,
            portion: i.portion,
            price: i.price,
            quantity: i.quantity,
            notes: i.notes,
            foodType: 'veg'
          })),
          waiterName
        };

        const res = await api.post(`/orders/kot/punch/${currentTableOrder._id}`, payload);
        if (res.data?.success) {
          playBuzzer('success');
          toast.success(`KOT #${res.data.data?.kots?.length || 2} Sent to Kitchen! 🔥`);
          setCart([]);
          setShowCartDrawer(false);
          setOrderModeTab('running');
          await loadData(false);
        }
      } else {
        // New order on fresh table
        const payload = {
          tableId: selectedTable._id,
          orderType: 'Dine-In',
          waiterName,
          pax: guestCount || 2,
          items: cart.map((i) => ({
            itemId: i.itemId,
            name: i.name,
            portion: i.portion,
            price: i.price,
            quantity: i.quantity,
            notes: i.notes,
            foodType: 'veg'
          }))
        };

        const res = await api.post('/orders', payload);
        if (res.data?.success) {
          playBuzzer('success');
          toast.success(`Order Placed & KOT #1 Sent to Kitchen! 🔥`);
          setCart([]);
          setShowCartDrawer(false);
          setOrderModeTab('running');
          await loadData(false);
        }
      }
    } catch (err) {
      console.error('Punch KOT Error:', err);
      toast.error(err.response?.data?.message || 'Failed to punch KOT.');
    } finally {
      setIsSubmittingKot(false);
    }
  };

  // Table Transfer / Shift
  const handleShiftTable = async () => {
    if (!selectedTable || !targetShiftTableId) {
      toast.error('Please select destination table');
      return;
    }

    try {
      setIsShifting(true);
      const res = await api.put(`/tables/transfer/${selectedTable._id}/${targetShiftTableId}`);
      if (res.data?.success) {
        toast.success(res.data.message || 'Table shifted successfully!');
        playBuzzer('success');
        setShowShiftModal(false);
        setTargetShiftTableId('');

        // Find the new destination table
        const newTable = tables.find((t) => String(t._id) === String(targetShiftTableId));
        if (newTable) setSelectedTable(newTable);
        await loadData(false);
      }
    } catch (err) {
      console.error('Shift Table Error:', err);
      toast.error(err.response?.data?.message || 'Failed to shift table');
    } finally {
      setIsShifting(false);
    }
  };

  // Table Merge
  const handleMergeTable = async () => {
    if (!selectedTable || !targetMergeTableId) {
      toast.error('Please select secondary table to merge');
      return;
    }

    try {
      setIsMerging(true);
      const res = await api.put(`/tables/merge/${selectedTable._id}/${targetMergeTableId}`);
      if (res.data?.success) {
        toast.success(res.data.message || 'Tables merged successfully!');
        playBuzzer('success');
        setShowMergeModal(false);
        setTargetMergeTableId('');
        await loadData(false);
      }
    } catch (err) {
      console.error('Merge Table Error:', err);
      toast.error(err.response?.data?.message || 'Failed to merge tables');
    } finally {
      setIsMerging(false);
    }
  };

  // Request Bill
  const handleRequestBill = async () => {
    if (!currentTableOrder) return;
    try {
      setIsRequestingBill(true);
      const res = await api.put(`/orders/status/${currentTableOrder._id}`, {
        status: 'billed',
        updatedBy: user?.name || 'Captain'
      });
      if (res.data?.success) {
        toast.success(`Bill Requested! Table T-${selectedTable.tableNo || selectedTable.tableNumber} is now Billed 🟣`);
        playBuzzer('success');
        setShowBillModal(false);
        await loadData(false);
      }
    } catch (err) {
      console.error('Request Bill Error:', err);
      toast.error(err.response?.data?.message || 'Failed to request bill');
    } finally {
      setIsRequestingBill(false);
    }
  };

  const handleWaiterRazorpayPayment = async () => {
    if (!currentTableOrder) return;
    setIsProcessingRazorpay(true);
    try {
      await openRazorpayCheckout({
        orderId: currentTableOrder._id,
        amount: billSummary?.grandTotal || currentTableOrder.grandTotal,
        customerName: currentTableOrder.customerName || `Guest T-${selectedTable.tableNo || selectedTable.tableNumber}`,
        customerPhone: currentTableOrder.customerPhone || '',
        description: `Bill for Table T-${selectedTable.tableNo || selectedTable.tableNumber} - Tamanna Pure Veg`,
        onSuccess: async (paymentData) => {
          setIsProcessingRazorpay(false);
          setShowBillModal(false);
          toast.success(`⚡ Table Bill Paid via Razorpay! Ref: ${paymentData.paymentId}`);
          playBuzzer('success');
          await loadData(false);
        },
        onFailure: (err) => {
          setIsProcessingRazorpay(false);
          toast.error(err.message || 'Razorpay payment was not completed');
        },
        onDismiss: () => {
          setIsProcessingRazorpay(false);
        }
      });
    } catch (err) {
      setIsProcessingRazorpay(false);
      toast.error(err.message || 'Could not launch Razorpay');
    }
  };

  const cartTotal = useMemo(() => {
    return cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  }, [cart]);

  const cartItemCount = useMemo(() => {
    return cart.reduce((sum, item) => sum + item.quantity, 0);
  }, [cart]);

  // Live Bill Preview Calculation
  const billSummary = useMemo(() => {
    if (!currentTableOrder) return null;
    const subTotal = (currentTableOrder.items || []).filter(i => i.itemStatus !== 'cancelled').reduce((sum, item) => sum + Number(item.price) * Number(item.quantity || 1), 0);
    const gst = Math.round(subTotal * 0.05 * 100) / 100;
    const grandTotal = Math.round((subTotal + gst) * 100) / 100;
    return { subTotal, gst, grandTotal };
  }, [currentTableOrder]);

  // ─────────────────────────────────────────────────────────────
  // 1. PIN LOGIN SCREEN
  // ─────────────────────────────────────────────────────────────
  if (!token || !user) {
    return (
      <div style={styles.mobileWrapper}>
        <div style={styles.pinCard}>
          <div style={{ textAlign: 'center', marginBottom: 20 }}>
            <span style={{ fontSize: 40 }}>👨‍🍳</span>
            <h2 style={{ fontSize: 22, fontWeight: 800, margin: '8px 0 2px', color: '#0f172a' }}>
              Captain & Waiter POS
            </h2>
            <p style={{ fontSize: 13, color: '#64748b', margin: 0 }}>
              Enter your 4-digit staff PIN to take orders
            </p>
          </div>

          {loginError && (
            <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626', padding: '10px 12px', borderRadius: 10, fontSize: 13, textAlign: 'center', marginBottom: 16 }}>
              {loginError}
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 20 }}>
            <input
              type="password"
              maxLength={4}
              value={pinInput}
              readOnly
              placeholder="● ● ● ●"
              style={{
                width: '180px',
                textAlign: 'center',
                fontSize: 28,
                letterSpacing: 10,
                padding: '10px 16px',
                borderRadius: 14,
                border: '2px solid #cbd5e1',
                background: '#f8fafc',
                fontWeight: 800,
                color: '#0f172a'
              }}
            />
          </div>

          {/* Touch Numpad */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
            {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setPinInput((prev) => (prev.length < 4 ? prev + n : prev))}
                style={styles.pinBtn}
              >
                {n}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setPinInput('')}
              style={{ ...styles.pinBtn, background: '#fee2e2', color: '#dc2626', fontSize: 13, fontWeight: 800 }}
            >
              Clear
            </button>
            <button
              type="button"
              onClick={() => setPinInput((prev) => (prev.length < 4 ? prev + '0' : prev))}
              style={styles.pinBtn}
            >
              0
            </button>
            <button
              type="button"
              onClick={() => setPinInput((prev) => prev.slice(0, -1))}
              style={{ ...styles.pinBtn, background: '#f1f5f9', color: '#475569', fontSize: 18 }}
            >
              ⌫
            </button>
          </div>

          <button
            type="button"
            onClick={handlePinSubmit}
            disabled={isLoggingIn || pinInput.length < 4}
            style={{
              width: '100%',
              marginTop: 18,
              padding: 14,
              borderRadius: 14,
              background: pinInput.length === 4 ? '#fc4f1a' : '#cbd5e1',
              color: '#fff',
              fontSize: 16,
              fontWeight: 800,
              border: 0,
              cursor: pinInput.length === 4 ? 'pointer' : 'not-allowed',
              boxShadow: pinInput.length === 4 ? '0 4px 14px rgba(252,79,26,0.3)' : 'none'
            }}
          >
            {isLoggingIn ? 'Logging in...' : 'Sign In'}
          </button>
        </div>
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────
  // 2. MAIN APP VIEW
  // ─────────────────────────────────────────────────────────────
  return (
    <div style={styles.mobileWrapper}>
      <Toaster position="top-center" />

      {/* TOP HEADER */}
      <header style={styles.appHeader}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {selectedTable ? (
            <button
              type="button"
              onClick={() => {
                if (cart.length > 0) {
                  if (!window.confirm('Unsaved items in cart will be lost. Return to table view?')) return;
                  setCart([]);
                }
                setSelectedTable(null);
                setShowCartDrawer(false);
              }}
              style={styles.backBtn}
            >
              ‹ Tables
            </button>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 18 }}>🍽️</span>
              <div>
                <div style={{ fontWeight: 800, fontSize: 15, color: '#0f172a', lineHeight: 1.1 }}>Tamanna Restaurant</div>
                <div style={{ fontSize: 10, color: '#16a34a', fontWeight: 700 }}>100% Pure Veg POS</div>
              </div>
            </div>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: '#0f172a' }}>👨‍🍳 {user.name}</div>
            <div style={{ fontSize: 10, color: '#64748b' }}>Captain</div>
          </div>
          <button
            type="button"
            onClick={handleLogout}
            title="Sign out"
            style={{ background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: 8, padding: '6px 8px', fontSize: 12, cursor: 'pointer' }}
          >
            🚪
          </button>
        </div>
      </header>

      {/* FOOD READY PICKUP NOTIFICATION BANNER */}
      {foodReadyAlerts.length > 0 && (
        <div style={{ background: '#ecfdf5', borderBottom: '2px solid #10b981', padding: '10px 14px' }}>
          <div style={{ fontSize: 11, fontWeight: '800', color: '#065f46', marginBottom: 6, textTransform: 'uppercase' }}>
            🛎️ Kitchen Ready Alerts ({foodReadyAlerts.length})
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {foodReadyAlerts.map((alert) => (
              <div
                key={alert.id}
                style={{
                  background: '#fff',
                  border: '1px solid #a7f3d0',
                  borderRadius: 10,
                  padding: '8px 12px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 8,
                  boxShadow: '0 2px 4px rgba(16,185,129,0.1)'
                }}
              >
                <div>
                  <span style={{ fontWeight: 800, fontSize: 13, color: '#065f46' }}>
                    Table T-{alert.tableNo}:
                  </span>{' '}
                  <span style={{ fontSize: 13, color: '#0f172a', fontWeight: 700 }}>
                    {alert.quantity}x {alert.itemName} ({alert.portion})
                  </span>
                  <div style={{ fontSize: 10, color: '#64748b', marginTop: 2 }}>
                    Ready at {alert.timestamp} · Please deliver to table
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => dismissFoodReadyAlert(alert)}
                  style={{
                    background: '#10b981',
                    color: '#fff',
                    border: 0,
                    borderRadius: 8,
                    padding: '6px 12px',
                    fontSize: 11,
                    fontWeight: 800,
                    cursor: 'pointer',
                    whiteSpace: 'nowrap'
                  }}
                >
                  ✓ Served
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* GUEST ASSISTANCE ALERTS BANNER */}
      {activeWaiterAlerts.length > 0 && (
        <div style={{ background: '#fef3c7', borderBottom: '2px solid #f59e0b', padding: '10px 14px' }}>
          <div style={{ fontSize: 11, fontWeight: '800', color: '#92400e', marginBottom: 6, textTransform: 'uppercase' }}>
            🛎️ Guest Assistance Requests ({activeWaiterAlerts.length})
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {activeWaiterAlerts.map((alt, idx) => (
              <div
                key={idx}
                style={{
                  background: '#fff',
                  border: '1px solid #fde68a',
                  borderRadius: 10,
                  padding: '8px 10px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 8,
                  boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
                }}
              >
                <div>
                  <span style={{ fontWeight: 'bold', fontSize: 13, color: '#0f172a' }}>
                    Table {alt.tableNo}:
                  </span>{' '}
                  <span style={{ fontSize: 12, color: '#b45309', fontWeight: '700' }}>
                    {alt.requestType === 'water' ? '💧 Needs Water' :
                     alt.requestType === 'cutlery' ? '🍴 Needs Cutlery' :
                     alt.requestType === 'bill' ? '🧾 Requesting Bill' : '🙋 Call Captain'}
                  </span>
                  {alt.customNote && (
                    <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>
                      "{alt.customNote}"
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setActiveWaiterAlerts((prev) => prev.filter((_, i) => i !== idx))}
                  style={{
                    background: '#10b981',
                    color: '#fff',
                    border: 0,
                    borderRadius: 6,
                    padding: '4px 10px',
                    fontSize: 11,
                    fontWeight: 'bold',
                    cursor: 'pointer'
                  }}
                >
                  ✓ Done
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          A. TABLE SELECTOR SCREEN
          ───────────────────────────────────────────────────────────── */}
      {!selectedTable && (
        <div style={{ padding: '16px 14px 40px', flex: 1, overflowY: 'auto' }}>
          {/* Floor Tabs */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 16, overflowX: 'auto', paddingBottom: 4 }}>
            {availableFloors.map((fl) => (
              <button
                key={fl}
                onClick={() => setSelectedFloor(fl)}
                style={{
                  padding: '8px 14px',
                  borderRadius: 20,
                  fontSize: 12,
                  fontWeight: 700,
                  whiteSpace: 'nowrap',
                  border: selectedFloor === fl ? '2px solid #fc4f1a' : '1px solid #cbd5e1',
                  background: selectedFloor === fl ? '#fff7ed' : '#fff',
                  color: selectedFloor === fl ? '#fc4f1a' : '#475569'
                }}
              >
                {fl}
              </button>
            ))}
          </div>

          {/* Quick Legend & Refresh */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 11, fontWeight: 700 }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#16a34a' }}>● Free</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#d97706' }}>● Occupied</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#7c3aed' }}>● Billed</span>
            </div>
            <button
              onClick={() => loadData(false)}
              style={{ fontSize: 12, color: '#fc4f1a', background: 'transparent', border: 0, fontWeight: 800, cursor: 'pointer' }}
            >
              🔄 Refresh
            </button>
          </div>

          {loading ? (
            <div style={{ textAlign: 'center', padding: 40, color: '#64748b' }}>Loading restaurant tables...</div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(105px, 1fr))', gap: 10 }}>
              {filteredTables.map((tbl) => {
                const isOccupied = tbl.status === 'occupied';
                const isBilled = tbl.status === 'billed';
                const isReserved = tbl.status === 'reserved';
                const order = activeOrders.find(
                  (o) =>
                    (o.tableId?._id === tbl._id || String(o.tableId) === String(tbl._id)) &&
                    ['placed', 'preparing', 'ready', 'billed'].includes(o.orderStatus)
                );

                const statusColor = isBilled ? '#8b5cf6' : isOccupied ? '#f59e0b' : isReserved ? '#f97316' : '#10b981';
                const statusBg = isBilled ? '#f5f3ff' : isOccupied ? '#fffbeb' : isReserved ? '#fff7ed' : '#f0fdf4';

                return (
                  <div
                    key={tbl._id}
                    onClick={() => {
                      if (isReserved) {
                        toast('Table is currently Reserved for a booking!', { icon: '⚠️' });
                      }
                      setSelectedTable(tbl);
                      setCart([]);
                      setOrderModeTab(isOccupied || isBilled ? 'running' : 'menu');
                    }}
                    style={{
                      background: statusBg,
                      border: `2px solid ${statusColor}`,
                      borderRadius: 14,
                      padding: '12px 8px',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                      minHeight: 92,
                      boxShadow: '0 2px 6px rgba(0,0,0,0.04)',
                      transition: 'all 0.15s'
                    }}
                  >
                    <div style={{ fontSize: 16, fontWeight: 900, color: '#0f172a' }}>
                      T-{tbl.tableNo || tbl.tableNumber}
                    </div>
                    <div style={{ fontSize: 10, color: '#64748b', marginTop: 2 }}>
                      👥 {tbl.capacity || 4} Seats
                    </div>

                    <div
                      style={{
                        marginTop: 6,
                        fontSize: 9,
                        fontWeight: 800,
                        padding: '2px 6px',
                        borderRadius: 8,
                        background: statusColor,
                        color: '#fff',
                        textTransform: 'uppercase'
                      }}
                    >
                      {isBilled ? 'Billed' : isOccupied ? 'Occupied' : isReserved ? 'Reserved' : 'Free'}
                    </div>

                    {order && (
                      <div style={{ fontSize: 11, fontWeight: 900, color: isBilled ? '#6d28d9' : '#b45309', marginTop: 4 }}>
                        ₹{Number(order.grandTotal || 0).toFixed(0)}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          B. ORDERING & SERVICE VIEW FOR SELECTED TABLE
          ───────────────────────────────────────────────────────────── */}
      {selectedTable && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          
          {/* Table Header Bar */}
          <div style={{ background: '#fff', borderBottom: '1px solid #e2e8f0', padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 16, fontWeight: 900, color: '#0f172a' }}>
                  Table T-{selectedTable.tableNo || selectedTable.tableNumber}
                </span>
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 800,
                    padding: '2px 6px',
                    borderRadius: 8,
                    background: selectedTable.status === 'billed' ? '#f5f3ff' : selectedTable.status === 'occupied' ? '#fef3c7' : '#dcfce7',
                    color: selectedTable.status === 'billed' ? '#7c3aed' : selectedTable.status === 'occupied' ? '#b45309' : '#15803d'
                  }}
                >
                  {selectedTable.status === 'billed' ? 'BILLED' : selectedTable.status === 'occupied' ? 'OCCUPIED' : 'AVAILABLE'}
                </span>
              </div>

              {/* PAX / Guests input */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 3 }}>
                <span style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>Guests:</span>
                <input
                  type="number"
                  min="1"
                  max="20"
                  value={guestCount}
                  onChange={(e) => setGuestCount(Number(e.target.value) || 1)}
                  style={{ width: '42px', padding: '2px 4px', fontSize: 11, fontWeight: 800, border: '1px solid #cbd5e1', borderRadius: 6, textAlign: 'center' }}
                />
              </div>
            </div>

            {/* Actions: Tab switch and Shift/Merge */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              {currentTableOrder && (
                <button
                  type="button"
                  onClick={() => setShowShiftModal(true)}
                  title="Shift order to another table"
                  style={{ padding: '6px 8px', borderRadius: 8, border: '1px solid #cbd5e1', background: '#f8fafc', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}
                >
                  🔀 Shift
                </button>
              )}

              <div style={{ display: 'flex', background: '#f1f5f9', padding: 2, borderRadius: 8 }}>
                <button
                  type="button"
                  onClick={() => setOrderModeTab('menu')}
                  style={{
                    padding: '6px 10px',
                    borderRadius: 6,
                    border: 0,
                    fontSize: 11,
                    fontWeight: 800,
                    cursor: 'pointer',
                    background: orderModeTab === 'menu' ? '#fff' : 'transparent',
                    color: orderModeTab === 'menu' ? '#0f172a' : '#64748b'
                  }}
                >
                  + Add Items
                </button>
                {currentTableOrder && (
                  <button
                    type="button"
                    onClick={() => setOrderModeTab('running')}
                    style={{
                      padding: '6px 10px',
                      borderRadius: 6,
                      border: 0,
                      fontSize: 11,
                      fontWeight: 800,
                      cursor: 'pointer',
                      background: orderModeTab === 'running' ? '#fff' : 'transparent',
                      color: orderModeTab === 'running' ? '#fc4f1a' : '#64748b'
                    }}
                  >
                    Running ({currentTableOrder.items?.length || 0})
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* TAB 1: MENU CATALOG */}
          {orderModeTab === 'menu' && (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              {/* Search & Pure Veg Filters */}
              <div style={{ padding: '8px 14px', background: '#fff', borderBottom: '1px solid #f1f5f9', display: 'flex', gap: 8 }}>
                <input
                  type="text"
                  placeholder="🔍 Search dishes (Paneer, Roti, Dal)..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  style={{ flex: 1, padding: '8px 12px', borderRadius: 10, border: '1px solid #cbd5e1', fontSize: 13, outline: 'none' }}
                />
                <select
                  value={pureVegFilter}
                  onChange={(e) => setPureVegFilter(e.target.value)}
                  style={{ padding: '8px 10px', borderRadius: 10, border: '1px solid #cbd5e1', fontSize: 11, fontWeight: 800, background: '#fff', color: '#166534' }}
                >
                  <option value="all">🟢 Pure Veg</option>
                  <option value="jain">🌿 Jain Special</option>
                  <option value="chef">⭐ Chef Specials</option>
                  <option value="fast">🥥 Fast / Upvas</option>
                </select>
              </div>

              {/* Category Horizontal Slider */}
              <div style={{ display: 'flex', gap: 6, padding: '8px 14px', background: '#f8fafc', overflowX: 'auto', borderBottom: '1px solid #e2e8f0', whiteSpace: 'nowrap' }}>
                {categories.map((cat) => (
                  <button
                    key={cat}
                    onClick={() => setSelectedCategory(cat)}
                    style={{
                      padding: '6px 12px',
                      borderRadius: 16,
                      fontSize: 11,
                      fontWeight: 700,
                      border: selectedCategory === cat ? '1px solid #fc4f1a' : '1px solid #e2e8f0',
                      background: selectedCategory === cat ? '#fc4f1a' : '#fff',
                      color: selectedCategory === cat ? '#fff' : '#475569',
                      cursor: 'pointer'
                    }}
                  >
                    {cat}
                  </button>
                ))}
              </div>

              {/* Menu Items List */}
              <div style={{ flex: 1, overflowY: 'auto', padding: '10px 14px 90px' }}>
                {filteredMenuItems.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: 40, color: '#94a3b8', fontSize: 13 }}>
                    No Pure Veg items found matching your filters.
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {filteredMenuItems.map((item) => {
                      const fullCartItem = cart.find((i) => i.cartKey === `${item._id}-Full`);
                      const halfCartItem = cart.find((i) => i.cartKey === `${item._id}-Half`);
                      const hasHalf = item.halfPrice !== undefined && item.halfPrice !== null && item.halfPrice > 0;

                      return (
                        <div
                          key={item._id}
                          style={{
                            background: '#fff',
                            border: '1px solid #e2e8f0',
                            borderRadius: 12,
                            padding: '10px 12px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: 10,
                            boxShadow: '0 1px 3px rgba(0,0,0,0.02)'
                          }}
                        >
                          <div style={{ flex: 1 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <span style={{ fontSize: 10 }}>🟢</span>
                              <span style={{ fontWeight: 800, fontSize: 14, color: '#0f172a' }}>
                                {item.name}
                              </span>
                              {item.isJainAvailable && (
                                <span style={{ fontSize: 9, color: '#15803d', background: '#dcfce7', padding: '1px 5px', borderRadius: 4, fontWeight: 700 }}>
                                  Jain
                                </span>
                              )}
                            </div>
                            <div style={{ fontSize: 12, color: '#475569', marginTop: 3 }}>
                              ₹{item.price} {hasHalf ? ` · Half: ₹${item.halfPrice}` : ''}
                            </div>
                          </div>

                          {/* Action Buttons: Full / Half */}
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            {hasHalf && (
                              <div style={{ textAlign: 'center' }}>
                                {halfCartItem ? (
                                  <div style={{ display: 'flex', alignItems: 'center', background: '#f1f5f9', borderRadius: 8, padding: '2px 4px' }}>
                                    <button onClick={() => updateCartQty(halfCartItem.cartKey, -1)} style={styles.qtyBtn}>-</button>
                                    <span style={{ fontSize: 12, fontWeight: 800, padding: '0 6px' }}>{halfCartItem.quantity}H</span>
                                    <button onClick={() => updateCartQty(halfCartItem.cartKey, 1)} style={styles.qtyBtn}>+</button>
                                  </div>
                                ) : (
                                  <button
                                    onClick={() => addToCart(item, 'Half')}
                                    style={{ ...styles.addBtn, background: '#f8fafc', color: '#0f172a', border: '1px solid #cbd5e1' }}
                                  >
                                    + Half
                                  </button>
                                )}
                              </div>
                            )}

                            <div>
                              {fullCartItem ? (
                                <div style={{ display: 'flex', alignItems: 'center', background: '#f1f5f9', borderRadius: 8, padding: '2px 4px' }}>
                                  <button onClick={() => updateCartQty(fullCartItem.cartKey, -1)} style={styles.qtyBtn}>-</button>
                                  <span style={{ fontSize: 12, fontWeight: 800, padding: '0 6px' }}>{fullCartItem.quantity}</span>
                                  <button onClick={() => updateCartQty(fullCartItem.cartKey, 1)} style={styles.qtyBtn}>+</button>
                                </div>
                              ) : (
                                <button onClick={() => addToCart(item, 'Full')} style={styles.addBtn}>
                                  + Add
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 2: RUNNING KOTS & OPERATIONS */}
          {orderModeTab === 'running' && currentTableOrder && (
            <div style={{ flex: 1, overflowY: 'auto', padding: '14px', background: '#f8fafc', paddingBottom: 110 }}>
              
              {/* Order KPI Banner */}
              <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #e2e8f0', padding: 14, marginBottom: 12, boxShadow: '0 2px 5px rgba(0,0,0,0.03)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <div>
                    <span style={{ fontSize: 12, fontWeight: 800, color: '#64748b' }}>Running Order #{String(currentTableOrder._id || '').slice(-5)}</span>
                    <div style={{ fontSize: 11, color: '#475569' }}>
                      Captain: <b>{currentTableOrder.waiterName || 'Staff'}</b> · Status: <b style={{ textTransform: 'uppercase', color: currentTableOrder.orderStatus === 'billed' ? '#7c3aed' : '#b45309' }}>{currentTableOrder.orderStatus}</b>
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 18, fontWeight: 900, color: '#0f172a' }}>₹{Number(currentTableOrder.grandTotal || 0).toFixed(2)}</div>
                    <span style={{ fontSize: 10, color: '#16a34a', fontWeight: 700 }}>Incl. 5% GST</span>
                  </div>
                </div>

                {/* Bill Request Button */}
                <div style={{ display: 'flex', gap: 8, marginTop: 10, paddingTop: 10, borderTop: '1px solid #f1f5f9' }}>
                  <button
                    type="button"
                    onClick={() => setShowBillModal(true)}
                    style={{
                      flex: 1,
                      padding: '10px 14px',
                      borderRadius: 10,
                      background: currentTableOrder.orderStatus === 'billed' ? '#7c3aed' : '#0f172a',
                      color: '#fff',
                      fontSize: 13,
                      fontWeight: 800,
                      border: 0,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 6
                    }}
                  >
                    <span>🧾</span>
                    <span>{currentTableOrder.orderStatus === 'billed' ? 'Billed (View Bill)' : 'Request Bill for Guest'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowShiftModal(true)}
                    style={{
                      padding: '10px 14px',
                      borderRadius: 10,
                      background: '#f1f5f9',
                      color: '#0f172a',
                      fontSize: 12,
                      fontWeight: 700,
                      border: '1px solid #cbd5e1',
                      cursor: 'pointer'
                    }}
                  >
                    🔀 Shift Table
                  </button>
                </div>
              </div>

              {/* Punched KOTs List */}
              <div style={{ fontSize: 13, fontWeight: 800, color: '#0f172a', marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>Punched KOTs ({currentTableOrder.kots?.length || 1})</span>
                <span style={{ fontSize: 11, color: '#64748b' }}>Ready dishes can be marked Served</span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {(currentTableOrder.kots || [{ kotNumber: 1, items: currentTableOrder.items, punchedAt: currentTableOrder.createdAt }]).map((kot, kidx) => (
                  <div key={kidx} style={{ background: '#fff', borderRadius: 14, border: '1px solid #e2e8f0', padding: 12, boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px dashed #e2e8f0', paddingBottom: 6, marginBottom: 8 }}>
                      <span style={{ fontSize: 12, fontWeight: 800, color: '#fc4f1a' }}>KOT #{kot.kotNumber}</span>
                      <span style={{ fontSize: 11, color: '#94a3b8' }}>
                        {new Date(kot.punchedAt || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {(kot.items || []).map((it, idx) => {
                        const isReady = it.itemStatus === 'ready';
                        const isServed = it.itemStatus === 'served';
                        const isCancelled = it.itemStatus === 'cancelled';

                        return (
                          <div
                            key={idx}
                            style={{
                              background: isReady ? '#f0fdf4' : isServed ? '#f8fafc' : '#fff',
                              border: isReady ? '1px solid #86efac' : '1px solid #f1f5f9',
                              borderRadius: 10,
                              padding: '8px 10px',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              gap: 8
                            }}
                          >
                            <div style={{ flex: 1 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                <span style={{ fontWeight: 800, fontSize: 13, color: isCancelled ? '#94a3b8' : '#0f172a', textDecoration: isCancelled ? 'line-through' : 'none' }}>
                                  {it.quantity}x {it.name} {it.portion === 'Half' ? '(Half)' : ''}
                                </span>
                                <span
                                  style={{
                                    fontSize: 9,
                                    fontWeight: 800,
                                    padding: '2px 6px',
                                    borderRadius: 6,
                                    background: isReady ? '#dcfce7' : isServed ? '#e0f2fe' : isCancelled ? '#fee2e2' : '#fef3c7',
                                    color: isReady ? '#166534' : isServed ? '#0369a1' : isCancelled ? '#991b1b' : '#b45309',
                                    textTransform: 'uppercase'
                                  }}
                                >
                                  {it.itemStatus || 'placed'}
                                </span>
                              </div>
                              {it.notes && <div style={{ fontSize: 10, color: '#d97706', marginTop: 2 }}>📝 Note: "{it.notes}"</div>}
                            </div>

                            {/* Service actions for item */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              {/* Quick Repeat (+1) */}
                              {!isCancelled && (
                                <button
                                  type="button"
                                  onClick={() => handleQuickRepeatItem(it)}
                                  title="Repeat 1 quantity of this item"
                                  style={{ background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: 6, padding: '4px 6px', fontSize: 10, fontWeight: 700, cursor: 'pointer' }}
                                >
                                  + Repeat
                                </button>
                              )}

                              {/* Mark Served if ready or placed */}
                              {!isServed && !isCancelled && (
                                <button
                                  type="button"
                                  onClick={() => handleMarkItemServed(kot.kotNumber, it.itemId || it._id)}
                                  style={{
                                    background: isReady ? '#10b981' : '#f1f5f9',
                                    color: isReady ? '#fff' : '#0f172a',
                                    border: isReady ? 0 : '1px solid #cbd5e1',
                                    borderRadius: 6,
                                    padding: '4px 8px',
                                    fontSize: 10,
                                    fontWeight: 800,
                                    cursor: 'pointer'
                                  }}
                                >
                                  {isReady ? '✓ Mark Served' : 'Serve'}
                                </button>
                              )}

                              {/* Cancel item request if placed or preparing */}
                              {!isServed && !isCancelled && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setCancelItemTarget({ kotNumber: kot.kotNumber, itemId: it.itemId || it._id, name: it.name });
                                    setCancelReason('');
                                  }}
                                  title="Cancel item"
                                  style={{ border: 0, background: 'transparent', color: '#dc2626', cursor: 'pointer', fontSize: 13 }}
                                >
                                  ✕
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          C. FLOATING CART BAR & BOTTOM DRAWER
          ───────────────────────────────────────────────────────────── */}
      {selectedTable && cart.length > 0 && (
        <div style={styles.floatingCartBar}>
          <div onClick={() => setShowCartDrawer(!showCartDrawer)} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
            <span style={{ background: '#fff', color: '#fc4f1a', borderRadius: 12, padding: '2px 8px', fontSize: 12, fontWeight: 900 }}>
              {cartItemCount}
            </span>
            <div>
              <div style={{ fontSize: 13, fontWeight: 800 }}>View Cart</div>
              <div style={{ fontSize: 11, opacity: 0.9 }}>₹{cartTotal.toFixed(2)}</div>
            </div>
          </div>

          <button
            type="button"
            onClick={handlePunchKot}
            disabled={isSubmittingKot}
            style={styles.punchKotBtn}
          >
            {isSubmittingKot ? 'Sending...' : '🔥 Send KOT'}
          </button>
        </div>
      )}

      {/* Cart Expandable Bottom Drawer */}
      {showCartDrawer && (
        <div style={styles.drawerBackdrop} onClick={() => setShowCartDrawer(false)}>
          <div style={styles.drawerContent} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #e2e8f0', paddingBottom: 10, marginBottom: 12 }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 800, color: '#0f172a' }}>
                  KOT for Table T-{selectedTable.tableNo || selectedTable.tableNumber}
                </div>
                <div style={{ fontSize: 11, color: '#64748b' }}>
                  Captain: {user.name} · {guestCount} Guests
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowCartDrawer(false)}
                style={{ background: '#f1f5f9', border: 0, borderRadius: 20, width: 28, height: 28, fontWeight: 800, cursor: 'pointer' }}
              >
                ✕
              </button>
            </div>

            <div style={{ maxHeight: '280px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
              {cart.map((item) => (
                <div key={item.cartKey} style={{ background: '#f8fafc', padding: 8, borderRadius: 10, border: '1px solid #e2e8f0' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <span style={{ fontWeight: 700, fontSize: 13 }}>{item.name}</span>
                      <span style={{ fontSize: 10, color: '#64748b', marginLeft: 6 }}>[{item.portion}]</span>
                      <div style={{ fontSize: 11, color: '#475569' }}>₹{(item.price * item.quantity).toFixed(2)}</div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <button onClick={() => updateCartQty(item.cartKey, -1)} style={styles.qtyBtn}>-</button>
                      <span style={{ fontSize: 12, fontWeight: 800 }}>{item.quantity}</span>
                      <button onClick={() => updateCartQty(item.cartKey, 1)} style={styles.qtyBtn}>+</button>
                      <button onClick={() => removeCartItem(item.cartKey)} style={{ border: 0, background: 'transparent', color: '#dc2626', cursor: 'pointer', fontSize: 14 }}>🗑️</button>
                    </div>
                  </div>

                  <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <button
                      type="button"
                      onClick={() => {
                        setNotesItem(item);
                        setCustomNote(item.notes || '');
                      }}
                      style={{ fontSize: 11, color: '#0284c7', background: 'transparent', border: 0, padding: 0, cursor: 'pointer', fontWeight: 700 }}
                    >
                      {item.notes ? `📝 "${item.notes}" (Edit)` : '+ Add Cooking Tag (e.g. Jain, Less spicy)'}
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div style={{ borderTop: '1px solid #e2e8f0', marginTop: 12, paddingTop: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: '#475569' }}>Total ({cartItemCount} items)</span>
              <span style={{ fontSize: 18, fontWeight: 900, color: '#0f172a' }}>₹{cartTotal.toFixed(2)}</span>
            </div>

            <button
              type="button"
              onClick={handlePunchKot}
              disabled={isSubmittingKot}
              style={{
                width: '100%',
                marginTop: 12,
                padding: 14,
                borderRadius: 12,
                background: '#fc4f1a',
                color: '#fff',
                fontWeight: 900,
                fontSize: 16,
                border: 0,
                cursor: 'pointer',
                boxShadow: '0 4px 12px rgba(252,79,26,0.3)'
              }}
            >
              {isSubmittingKot ? 'Sending to Kitchen...' : '🔥 SEND KOT TO KITCHEN NOW'}
            </button>
          </div>
        </div>
      )}

      {/* 1-TAP COOKING TAGS MODAL */}
      {notesItem && (
        <div style={styles.drawerBackdrop}>
          <div style={{ ...styles.drawerContent, maxWidth: 380, margin: 'auto' }}>
            <h4 style={{ margin: '0 0 8px', fontSize: 15, fontWeight: 800 }}>
              Special Cooking Note for {notesItem.name}
            </h4>
            <p style={{ fontSize: 11, color: '#64748b', margin: '0 0 10px' }}>
              Tap any quick tags below or type your custom instruction:
            </p>

            {/* Quick 1-tap Tag Chips */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
              {QUICK_COOKING_TAGS.map((tag) => {
                const isSelected = customNote.includes(tag);
                return (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => toggleQuickTag(tag)}
                    style={{
                      padding: '5px 10px',
                      borderRadius: 14,
                      fontSize: 11,
                      fontWeight: 700,
                      cursor: 'pointer',
                      border: isSelected ? '1px solid #16a34a' : '1px solid #cbd5e1',
                      background: isSelected ? '#dcfce7' : '#f8fafc',
                      color: isSelected ? '#166534' : '#475569'
                    }}
                  >
                    {tag}
                  </button>
                );
              })}
            </div>

            <input
              type="text"
              placeholder="e.g. Jain prep, very hot, extra lemon..."
              value={customNote}
              onChange={(e) => setCustomNote(e.target.value)}
              style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid #cbd5e1', fontSize: 13, boxSizing: 'border-box', marginBottom: 12 }}
            />

            <div style={{ display: 'flex', gap: 8 }}>
              <button
                type="button"
                onClick={() => setNotesItem(null)}
                style={{ flex: 1, padding: 10, borderRadius: 10, border: '1px solid #cbd5e1', background: '#fff', fontWeight: 700, cursor: 'pointer' }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={saveCustomNote}
                style={{ flex: 1, padding: 10, borderRadius: 10, border: 0, background: '#fc4f1a', color: '#fff', fontWeight: 800, cursor: 'pointer' }}
              >
                Save Note
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SHIFT TABLE MODAL */}
      {showShiftModal && selectedTable && (
        <div style={styles.drawerBackdrop}>
          <div style={{ ...styles.drawerContent, maxWidth: 380, margin: 'auto' }}>
            <h4 style={{ margin: '0 0 6px', fontSize: 16, fontWeight: 900 }}>
              🔀 Shift Table T-{selectedTable.tableNo || selectedTable.tableNumber}
            </h4>
            <p style={{ fontSize: 12, color: '#64748b', margin: '0 0 14px' }}>
              Select an available free table to shift this active order:
            </p>

            {freeTablesForShift.length === 0 ? (
              <div style={{ padding: 20, textAlign: 'center', color: '#ef4444', fontSize: 12, fontWeight: 700 }}>
                No free tables available right now!
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, maxHeight: '200px', overflowY: 'auto', marginBottom: 14 }}>
                {freeTablesForShift.map((tbl) => (
                  <button
                    key={tbl._id}
                    type="button"
                    onClick={() => setTargetShiftTableId(tbl._id)}
                    style={{
                      padding: 10,
                      borderRadius: 10,
                      border: targetShiftTableId === tbl._id ? '2px solid #fc4f1a' : '1px solid #cbd5e1',
                      background: targetShiftTableId === tbl._id ? '#fff7ed' : '#f8fafc',
                      color: targetShiftTableId === tbl._id ? '#fc4f1a' : '#0f172a',
                      fontWeight: 800,
                      fontSize: 13,
                      cursor: 'pointer'
                    }}
                  >
                    T-{tbl.tableNo || tbl.tableNumber}
                    <div style={{ fontSize: 9, color: '#64748b', fontWeight: 600 }}>{tbl.capacity || 4} Seats</div>
                  </button>
                ))}
              </div>
            )}

            <div style={{ display: 'flex', gap: 8 }}>
              <button
                type="button"
                onClick={() => { setShowShiftModal(false); setTargetShiftTableId(''); }}
                style={{ flex: 1, padding: 10, borderRadius: 10, border: '1px solid #cbd5e1', background: '#fff', fontWeight: 700, cursor: 'pointer' }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleShiftTable}
                disabled={isShifting || !targetShiftTableId}
                style={{
                  flex: 1,
                  padding: 10,
                  borderRadius: 10,
                  border: 0,
                  background: targetShiftTableId ? '#fc4f1a' : '#cbd5e1',
                  color: '#fff',
                  fontWeight: 800,
                  cursor: targetShiftTableId ? 'pointer' : 'not-allowed'
                }}
              >
                {isShifting ? 'Shifting...' : 'Confirm Shift'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* REQUEST BILL & LIVE PREVIEW MODAL */}
      {showBillModal && currentTableOrder && (
        <div style={styles.drawerBackdrop}>
          <div style={{ ...styles.drawerContent, maxWidth: 400, margin: 'auto' }}>
            <div style={{ textAlign: 'center', marginBottom: 12 }}>
              <span style={{ fontSize: 32 }}>🧾</span>
              <h4 style={{ margin: '4px 0 2px', fontSize: 17, fontWeight: 900, color: '#0f172a' }}>
                Bill Preview · Table T-{selectedTable.tableNo || selectedTable.tableNumber}
              </h4>
              <p style={{ fontSize: 11, color: '#64748b', margin: 0 }}>
                Present bill to guest and alert POS cashier
              </p>
            </div>

            {/* Bill Line Items */}
            <div style={{ maxHeight: '180px', overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: 10, padding: '8px 10px', background: '#f8fafc', marginBottom: 12 }}>
              {(currentTableOrder.items || []).filter(i => i.itemStatus !== 'cancelled').map((it, idx) => (
                <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '3px 0' }}>
                  <span>{it.quantity}x {it.name} {it.portion === 'Half' ? '(H)' : ''}</span>
                  <span style={{ fontWeight: 700 }}>₹{(Number(it.price) * Number(it.quantity || 1)).toFixed(2)}</span>
                </div>
              ))}
            </div>

            {/* Total Calculations */}
            {billSummary && (
              <div style={{ background: '#f1f5f9', borderRadius: 10, padding: 10, marginBottom: 14, fontSize: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ color: '#64748b' }}>Subtotal:</span>
                  <span style={{ fontWeight: 700 }}>₹{billSummary.subTotal.toFixed(2)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ color: '#64748b' }}>GST (5%):</span>
                  <span style={{ fontWeight: 700 }}>₹{billSummary.gst.toFixed(2)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid #cbd5e1', paddingTop: 6, fontSize: 15, fontWeight: 900, color: '#0f172a' }}>
                  <span>Grand Total:</span>
                  <span style={{ color: '#7c3aed' }}>₹{billSummary.grandTotal.toFixed(2)}</span>
                </div>
              </div>
            )}

            {/* Razorpay Online Settlement Button */}
            <button
              type="button"
              onClick={handleWaiterRazorpayPayment}
              disabled={isProcessingRazorpay}
              style={{
                width: '100%',
                marginBottom: 10,
                padding: '12px 14px',
                borderRadius: 10,
                border: 0,
                background: 'linear-gradient(135deg, #0284c7 0%, #16a34a 100%)',
                color: '#fff',
                fontWeight: 900,
                fontSize: 13,
                cursor: isProcessingRazorpay ? 'not-allowed' : 'pointer',
                boxShadow: '0 4px 12px rgba(2, 132, 199, 0.3)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                opacity: isProcessingRazorpay ? 0.7 : 1
              }}
            >
              <span>⚡</span>
              <span>{isProcessingRazorpay ? 'Opening Razorpay Gateway...' : `Collect ₹${billSummary ? billSummary.grandTotal.toFixed(2) : currentTableOrder.grandTotal} via Razorpay`}</span>
            </button>

            <div style={{ display: 'flex', gap: 8 }}>
              <button
                type="button"
                onClick={() => setShowBillModal(false)}
                style={{ flex: 1, padding: 12, borderRadius: 10, border: '1px solid #cbd5e1', background: '#fff', fontWeight: 700, cursor: 'pointer' }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleRequestBill}
                disabled={isRequestingBill}
                style={{
                  flex: 1.5,
                  padding: 12,
                  borderRadius: 10,
                  border: 0,
                  background: '#7c3aed',
                  color: '#fff',
                  fontWeight: 900,
                  fontSize: 14,
                  cursor: 'pointer',
                  boxShadow: '0 4px 12px rgba(124,58,237,0.3)'
                }}
              >
                {isRequestingBill ? 'Requesting...' : '✓ Confirm Request Bill'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CANCEL ITEM MODAL */}
      {cancelItemTarget && (
        <div style={styles.drawerBackdrop}>
          <div style={{ ...styles.drawerContent, maxWidth: 360, margin: 'auto' }}>
            <h4 style={{ margin: '0 0 6px', fontSize: 15, fontWeight: 800, color: '#dc2626' }}>
              Cancel Item: {cancelItemTarget.name}
            </h4>
            <p style={{ fontSize: 11, color: '#64748b', margin: '0 0 10px' }}>
              Enter reason for cancellation to inform kitchen:
            </p>
            <input
              type="text"
              placeholder="e.g. Guest changed mind, placed by mistake..."
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 13, boxSizing: 'border-box', marginBottom: 12 }}
              autoFocus
            />
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                type="button"
                onClick={() => setCancelItemTarget(null)}
                style={{ flex: 1, padding: 10, borderRadius: 8, border: '1px solid #cbd5e1', background: '#fff', fontWeight: 700, cursor: 'pointer' }}
              >
                Back
              </button>
              <button
                type="button"
                onClick={handleCancelItem}
                disabled={isCancellingItem}
                style={{ flex: 1, padding: 10, borderRadius: 8, border: 0, background: '#dc2626', color: '#fff', fontWeight: 800, cursor: 'pointer' }}
              >
                {isCancellingItem ? 'Cancelling...' : 'Cancel Item'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

const styles = {
  mobileWrapper: {
    maxWidth: 500,
    margin: '0 auto',
    height: '100vh',
    display: 'flex',
    flexDirection: 'column',
    background: '#f8fafc',
    fontFamily: 'Inter, system-ui, sans-serif',
    boxShadow: '0 0 20px rgba(0,0,0,0.06)',
    position: 'relative'
  },
  appHeader: {
    background: '#fff',
    borderBottom: '1px solid #e2e8f0',
    padding: '12px 14px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    position: 'sticky',
    top: 0,
    zIndex: 20
  },
  backBtn: {
    background: '#f1f5f9',
    border: '1px solid #cbd5e1',
    borderRadius: 8,
    padding: '6px 12px',
    fontSize: 12,
    fontWeight: 800,
    color: '#0f172a',
    cursor: 'pointer'
  },
  pinCard: {
    margin: 'auto 20px',
    background: '#fff',
    borderRadius: 24,
    padding: '30px 24px',
    border: '1px solid #e2e8f0',
    boxShadow: '0 12px 36px rgba(0,0,0,0.08)'
  },
  pinBtn: {
    padding: '14px 0',
    borderRadius: 12,
    border: '1px solid #e2e8f0',
    background: '#fff',
    fontSize: 20,
    fontWeight: 800,
    color: '#0f172a',
    cursor: 'pointer'
  },
  qtyBtn: {
    width: 26,
    height: 26,
    borderRadius: 6,
    border: '1px solid #cbd5e1',
    background: '#fff',
    fontSize: 14,
    fontWeight: 800,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center'
  },
  addBtn: {
    padding: '6px 12px',
    borderRadius: 8,
    background: '#fc4f1a',
    color: '#fff',
    border: 0,
    fontWeight: 800,
    fontSize: 12,
    cursor: 'pointer'
  },
  floatingCartBar: {
    position: 'fixed',
    bottom: 12,
    left: '50%',
    transform: 'translateX(-50%)',
    width: 'calc(100% - 24px)',
    maxWidth: 476,
    background: '#0f172a',
    color: '#fff',
    borderRadius: 16,
    padding: '10px 14px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    boxShadow: '0 10px 25px rgba(15,23,42,0.4)',
    zIndex: 50
  },
  punchKotBtn: {
    background: '#fc4f1a',
    color: '#fff',
    border: 0,
    padding: '8px 16px',
    borderRadius: 10,
    fontWeight: 800,
    fontSize: 13,
    cursor: 'pointer'
  },
  drawerBackdrop: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(15,23,42,0.5)',
    zIndex: 99,
    display: 'flex',
    alignItems: 'flex-end',
    justifyContent: 'center'
  },
  drawerContent: {
    width: '100%',
    maxWidth: 500,
    background: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 16,
    boxSizing: 'border-box',
    animation: 'slideUp 0.2s ease-out'
  }
};
