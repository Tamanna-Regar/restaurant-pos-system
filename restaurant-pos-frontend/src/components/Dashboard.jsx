import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import io from 'socket.io-client';
import InventoryManagement from './InventoryManagement';
import TableTransferModal from './TableTransferModal';
import ExpenseManager from './ExpenseManager';
import { QRCodeCanvas } from 'qrcode.react';
import TableReservation from './TableReservation';
import StaffHRMModule from './StaffHRMModule';
import AdminDashboard from './AdminDashboard';
import ReportsAndCosting from './ReportsAndCosting';
import RecipeBuilder from './RecipeBuilder';
import CashierShift from './CashierShift';
import CustomerCRM from './CustomerCRM';

import {BarChart,Bar,XAxis,YAxis,CartesianGrid,Tooltip,ResponsiveContainer} from 'recharts';

import {
  VegNonVegBadge,
  TableCard,
  QuickSettleModal,
  KOTPrintArea,
  ShiftTableModal,
  ItemModifierModal,
  KeyboardShortcutsBanner
} from './PosComponents';

import { api } from '../api';
import ReceiptPrintArea from './Receiptprintarea';
import { ui } from '../styles/uiStyles';

const normalizeMenuItem = (item = {}, index = 0) => {
  const safeItem = item || {};
  const itemId = safeItem._id || safeItem.id || `menu-${index + 1}`;
  return {
    ...safeItem,
    _id: itemId,
    id: itemId,
    name: safeItem.name || `Menu Item ${index + 1}`,
    category: safeItem.category || 'Main Course',
    foodType: String(safeItem.foodType || 'veg').toLowerCase(),
    price: Number(safeItem.price || 0),
    halfPrice: safeItem.halfPrice !== undefined && safeItem.halfPrice !== null ? Number(safeItem.halfPrice) : undefined,
    image: safeItem.image || 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=300',
    isAvailable: safeItem.isAvailable !== false,
    floor: safeItem.floor || 'Veg Floor'
  };
};

const normalizeTable = (table = {}, index = 0) => {
  const safeTable = table || {};
  const tableId = safeTable._id || safeTable.id || `table-${index + 1}`;
  const tableNoValue = safeTable.tableNo ?? safeTable.tableNumber ?? `T-${String(index + 1).padStart(2, '0')}`;
  return {
    ...safeTable,
    _id: tableId,
    id: tableId,
    tableNo: String(tableNoValue),
    tableNumber: String(safeTable.tableNumber ?? tableNoValue),
    capacity: Number(safeTable.capacity || 4),
    floor: safeTable.floor || 'Veg Floor',
    type: safeTable.type || 'Dining',
    status: String(safeTable.status || 'available').toLowerCase()
  };
};

const isNonVegFloor = (table) =>
  String(table?.floor || '').trim().toLowerCase() === 'non-veg floor';

const normalizeCustomerGstin = (value) => String(value || '').trim().toUpperCase().replace(/\s+/g, '');
const isValidCustomerGstin = (value) => {
  const gstin = normalizeCustomerGstin(value);
  return gstin === '' || /^[0-9A-Z]{15}$/.test(gstin);
};
const getGstinStateCode = (value) => {
  const gstin = normalizeCustomerGstin(value);
  return /^[0-9]{2}/.test(gstin) ? gstin.slice(0, 2) : '';
};

// ---------------------------------------------------------------------------
// Main Dashboard Component
// ---------------------------------------------------------------------------
function Dashboard({ handleLogout }) {
  // Tabs: tables | billing | kot | online | analytics | payments | dayend | admin | waiters
  const [activeTab, setActiveTab] = useState('tables');
  const [tables, setTables] = useState([]);
  const [menuItems, setMenuItems] = useState([]);
  const [orders, setOrders] = useState([]);
  const [payments, setPayments] = useState([]);
  const [paymentReconciliation, setPaymentReconciliation] = useState(null);
  const [paymentPeriod, setPaymentPeriod] = useState('Today');
  const [selectedPeriod, setSelectedPeriod] = useState('Week'); // 'Today' | 'Week' | 'Month' | 'Year'

  // UI States
  const [selectedFloor, setSelectedFloor] = useState('Veg Floor');

  // Waiter Management
  const WAITERS_LIST = ['Raju', 'Ramesh', 'Suresh', 'Amit', 'Sunil'];
  const [selectedWaiter, setSelectedWaiter] = useState(WAITERS_LIST[0]);

  // Active Context
  const [selectedTable, setSelectedTable] = useState(null);
  const [celebrationOccasion, setCelebrationOccasion] = useState('Birthday Party'); // 'Birthday Party', 'Anniversary Celebration', 'Kitty / Family Party', 'Special Celebration'
  const [celebrantName, setCelebrantName] = useState('');
  const [orderType, setOrderType] = useState('Dine-In'); // 'Dine-In', 'Takeaway', 'Delivery'
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerGstin, setCustomerGstin] = useState('');
  const [placeOfSupply, setPlaceOfSupply] = useState('');
  const [isInterState, setIsInterState] = useState(false);
  const [paymentMode] = useState('Cash');
  const [discount, setDiscount] = useState(0);
  const [customDiscount, setCustomDiscount] = useState(0);
  const [serviceCharge, setServiceCharge] = useState(0);
  const [gstRate, setGstRate] = useState(5);
  const [roundOff, setRoundOff] = useState(0);
  const [compDiscount, setCompDiscount] = useState(0);
  const [partialPayment, setPartialPayment] = useState(0);
  const [splitBillCount, setSplitBillCount] = useState(2);
  const [selectedMergeTableId, setSelectedMergeTableId] = useState('');
  const [savedBills, setSavedBills] = useState(() => {
    try {
      const stored = localStorage.getItem('tamannaSavedBills');
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });
  const [dayEndRecord, setDayEndRecord] = useState(null);
  const [dayEndOpeningCash, setDayEndOpeningCash] = useState('');
  const [dayEndClosingCash, setDayEndClosingCash] = useState('');

  useEffect(() => {
    localStorage.setItem('tamannaSavedBills', JSON.stringify(savedBills));
  }, [savedBills]);

  // Cart for new items to be punched
  const [cart, setCart] = useState([]);
  const [selectedMenuItem, setSelectedMenuItem] = useState(null);
  const [menuItemModalQuantity, setMenuItemModalQuantity] = useState(1);

  // POS modal and dialog state
  const [settleOrderModal, setSettleOrderModal] = useState(null);
  const [shiftTableModal, setShiftTableModal] = useState(null);
  const [qrModalTable, setQrModalTable] = useState(null);
  const [modifierModalItem, setModifierModalItem] = useState(null);


  const playNotificationSound = () => {
    try {
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const oscillator = audioCtx.createOscillator();
      const gainNode = audioCtx.createGain();

      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(587.33, audioCtx.currentTime);
      
      gainNode.gain.setValueAtTime(0.1, audioCtx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.5);

      oscillator.connect(gainNode);
      gainNode.connect(audioCtx.destination);

      oscillator.start();
      oscillator.stop(audioCtx.currentTime + 0.5);
    } catch (err) {
      console.log("Audio play error:", err);
    }
  };

  useEffect(() => {
    const socket = io('http://localhost:5000');

    socket.on('newTableOrder', (orderData) => {
      playNotificationSound();
      setNotifications((current) => [{
        id: `${Date.now()}-qr`,
        title: 'New QR order',
        message: `New order received for table ${orderData.tableNo || 'QR'}.`,
        createdAt: new Date().toISOString()
      }, ...current].slice(0, 30));
    });
    const addNotification = (title, message) => {
      playNotificationSound();
      setNotifications((current) => [{
        id: `${Date.now()}-${title}`,
        title,
        message,
        createdAt: new Date().toISOString()
      }, ...current].slice(0, 30));
    };
    socket.on('expense-updated', () => addNotification('Expense updated', 'A new expense was recorded.'));
    socket.on('online-order-updated', (data) => addNotification('Online order updated', data?.order?.status ? `Order status: ${data.order.status}.` : 'An online order changed.'));
    socket.on('payment-updated', () => addNotification('Payment updated', 'A payment or refund was recorded.'));
    socket.on('inventory-updated', () => addNotification('Inventory updated', 'Inventory stock was updated.'));
    socket.on('inventory-low-stock', (data) => {
      const ingredient = data?.ingredient;
      if (ingredient) addNotification('Low stock alert', `${ingredient.name} is at ${ingredient.stock ?? ingredient.currentStock} ${ingredient.unit || ''}; minimum is ${ingredient.minLimit ?? ingredient.minStockAlert}.`);
    });

    api.get('/ingredients/low-stock').then((response) => {
      (response.data?.data || []).forEach((ingredient) => {
        setNotifications((current) => {
          const id = `low-stock-${ingredient._id}`;
          if (current.some((notification) => notification.id === id)) return current;
          return [{
            id,
            title: 'Low stock alert',
            message: `${ingredient.name} is at ${ingredient.stock ?? ingredient.currentStock} ${ingredient.unit || ''}; minimum is ${ingredient.minLimit ?? ingredient.minStockAlert}.`,
            createdAt: new Date().toISOString()
          }, ...current].slice(0, 30);
        });
      });
    }).catch(() => {});

    return () => socket.disconnect();
  }, []);

  // Print Slips state
  const [printType, setPrintType] = useState('bill'); // 'bill' or 'kot'
  const [kotPrintData, setKotPrintData] = useState(null);
  const [receiptData, setReceiptData] = useState(null);

  // Search & Filters
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState('All');
  const [foodTypeFilter, setFoodTypeFilter] = useState('veg'); // 'all', 'veg',
  const [portionSelection, setPortionSelection] = useState({});

  const searchInputRef = useRef(null);

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [notifications, setNotifications] = useState([]);
  const [showNotifications, setShowNotifications] = useState(false);

  const [kdsStatusFilter, setKdsStatusFilter] = useState('all');
const [kdsSearchTerm, setKdsSearchTerm] = useState('');
const [kdsHistoryOrder, setKdsHistoryOrder] = useState(null);

const [selectedRecipe, setSelectedRecipe] = useState(null);


  const [onlineOrderConfig, setOnlineOrderConfig] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('tamannaOnlineOrderConfig') || 'null') || {
        zomatoApiKey: '',
        swiggyApiKey: '',
        webhookSecret: '',
        autoAccept: false,
        defaultDeliveryPartner: '',
        commissionRate: 0
      };
    } catch {
      return {
        zomatoApiKey: '',
        swiggyApiKey: '',
        webhookSecret: '',
        autoAccept: false,
        defaultDeliveryPartner: '',
        commissionRate: 0
      };
    }
  });

  const [onlineOrders, setOnlineOrders] = useState(() => {
    try {
      const saved = localStorage.getItem('tamannaOnlineOrders');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    localStorage.setItem('tamannaOnlineOrders', JSON.stringify(onlineOrders));
  }, [onlineOrders]);

  useEffect(() => {
    localStorage.setItem('tamannaOnlineOrderConfig', JSON.stringify(onlineOrderConfig));
  }, [onlineOrderConfig]);

  const getOnlineOrderTotal = (order) =>
    (order.items || []).reduce((sum, item) => sum + (Number(item.price || 0) * Number(item.qty || 1)), 0);

  const getOnlineCommission = (order) => {
    const total = getOnlineOrderTotal(order);
    return Number(((total * Number(onlineOrderConfig.commissionRate || 0)) / 100).toFixed(2));
  };

  const normalizeOnlineOrder = (order = {}) => ({
    ...order,
    source: order.source || order.provider || 'Direct',
    items: (order.items || []).map((item) => ({
      ...item,
      qty: Number(item.qty || item.quantity || 1),
      quantity: Number(item.quantity || item.qty || 1)
    }))
  });

  const getNextOnlineStatus = (status) => {
    const sequence = ['Pending', 'Accepted', 'Preparing', 'Ready for Pickup', 'Out for Delivery', 'Delivered'];
    const idx = sequence.indexOf(status);
    return sequence[idx + 1] || 'Delivered';
  };

  const handleOnlineOrderAction = async (orderId, action) => {
    const currentOrder = onlineOrders.find((order) => order._id === orderId);
    if (!currentOrder) return;

    try {
      let response;
      if (action === 'accept') {
        response = await api.post(`/online-orders/accept/${orderId}`, {
          deliveryPartner: currentOrder.deliveryPartner || onlineOrderConfig.defaultDeliveryPartner
        });
      } else if (action === 'reject') {
        response = await api.post(`/online-orders/reject/${orderId}`);
      } else if (action === 'assign') {
        response = await api.post(`/online-orders/assign-rider/${orderId}`, {
          deliveryPartner: currentOrder.deliveryPartner || onlineOrderConfig.defaultDeliveryPartner
        });
      } else if (action === 'advance') {
        response = await api.patch(`/online-orders/status/${orderId}`, {
          status: getNextOnlineStatus(currentOrder.status || 'Pending')
        });
      }

      const updatedOrder = response?.data?.data;
      if (updatedOrder) {
        setOnlineOrders((prev) => prev.map((order) => order._id === orderId ? normalizeOnlineOrder(updatedOrder) : order));
        return;
      }
    } catch (error) {
      console.error('Online order update failed:', error);
    }

    setOnlineOrders((prev) => prev.map((order) => {
      if (order._id !== orderId) return order;
      if (action === 'accept') return { ...order, status: 'Accepted', deliveryPartner: order.deliveryPartner || onlineOrderConfig.defaultDeliveryPartner };
      if (action === 'reject') return { ...order, status: 'Rejected', rejectedAt: new Date().toISOString() };
      if (action === 'assign') return { ...order, status: order.status === 'Rejected' ? 'Rejected' : 'Accepted', deliveryPartner: order.deliveryPartner || onlineOrderConfig.defaultDeliveryPartner };
      if (action === 'advance') return { ...order, status: getNextOnlineStatus(order.status || 'Pending') };
      return order;
    }));
  };

  const exportOnlineOrdersCsv = () => {
    const rows = [
      ['Source', 'Customer', 'Status', 'Total', 'Commission', 'Partner', 'Address'],
      ...onlineOrders.map((order) => [
        order.source,
        order.customerName,
        order.status,
        getOnlineOrderTotal(order),
        getOnlineCommission(order),
        order.deliveryPartner || 'Unassigned',
        order.deliveryAddress || ''
      ])
    ];

    const csv = rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'online-orders-export.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportMenuCsv = async () => {
    try {
      const response = await api.get('/menu/export.csv', { responseType: 'blob' });
      const url = URL.createObjectURL(response.data);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'menu-export.csv';
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      alert(error.response?.data?.message || 'Menu export failed.');
    }
  };

  const importMenuCsv = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      const lines = String(reader.result || '').split(/\r?\n/).filter(Boolean);
      if (lines.length < 2) return alert('CSV me menu rows nahi hain.');
      const parse = (line) => line.match(/(".*?"|[^",]+)(?=\s*,|\s*$)/g)?.map((cell) => cell.replace(/^"|"$/g, '').replace(/""/g, '"')) || [];
      const headers = parse(lines[0]);
      const items = lines.slice(1).map((line) => Object.fromEntries(parse(line).map((value, index) => [headers[index], value]))).filter((item) => item.name);
      try {
        await api.post('/menu/import', { items });
        alert(`${items.length} menu item(s) imported.`);
        loadInitialData();
      } catch (error) {
        alert(error.response?.data?.message || 'Menu import failed.');
      }
    };
    reader.readAsText(file);
    event.target.value = '';
  };

  const exportPaymentLedgerCsv = () => {
    const rows = [
      ['Customer Name', 'Phone', 'GSTIN', 'Invoice', 'Date', 'Order Type', 'Table', 'Waiter', 'Payment Mode', 'Payment Reference', 'Status', 'Amount', 'Refund Reason'],
      ...filteredPayments.map((payment) => {
        const order = payment.orderId || {};
        const paymentDate = payment.status === 'refunded' ? payment.refundedAt : payment.settledAt;
        return [
          payment.customerName || 'Walk-in Customer',
          payment.customerPhone || order.customerPhone || '',
          payment.customerGstin || order.customerGstin || '',
          payment.invoiceNumber || order.invoiceNumber || '',
          paymentDate ? new Date(paymentDate).toLocaleString('en-IN') : '',
          order.orderType || 'Order',
          order.tableId?.tableNo || '',
          order.waiterName || '',
          payment.paymentMode || 'Cash',
          payment.paymentReference || '',
          payment.status || '',
          Number(payment.grandTotal || 0).toFixed(2),
          payment.refundReason || ''
        ];
      })
    ];
    const csv = rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `payment-ledger-${paymentPeriod.toLowerCase()}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  // Live Clock
  const [currentTime, setCurrentTime] = useState(new Date());
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);
  // Admin New Item & Table Form state
  const [newItem, setNewItem] = useState({ name: '', code: '', price: '', category: 'Main Course', foodType: 'veg', image: '', floor: 'Veg Floor', halfPrice: '' });
  const [imagePreview, setImagePreview] = useState('');
  const [newTable, setNewTable] = useState({ tableNumber: '', capacity: '4', floor: 'Floor 1', type: 'Dining' });

  // Current Logged-in User
  const [currentUser] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('user') || '{}');
    } catch {
      return {};
    }
  });
  const currentUserRole = String(currentUser?.role || 'waiter').toLowerCase();
  const roleAccessMap = useMemo(() => ({
    admin: ['tables', 'billing', 'kot', 'online', 'waiters', 'analytics', 'reports', 'recipes', 'payments', 'dayend', 'shifts', 'admin', 'inventory', 'expenses', 'reservations', 'staff', 'customers'],
    manager: ['tables', 'billing', 'kot', 'online', 'analytics', 'reports', 'recipes', 'payments', 'shifts', 'inventory', 'expenses', 'reservations', 'staff', 'customers'],
    waiter: ['tables', 'billing', 'kot', 'payments', 'customers'],
    cashier: ['tables', 'billing', 'kot', 'payments', 'dayend', 'shifts', 'customers'],
    chef: ['kot'],
    inventory_manager: ['inventory', 'expenses', 'analytics', 'reports', 'recipes', 'payments'],
    delivery: ['tables', 'billing', 'online', 'payments', 'analytics']
  }), []);
  const allowedTabs = roleAccessMap[currentUserRole] || roleAccessMap.admin;
  const canAccessTab = useCallback((tab) => allowedTabs.includes(tab), [allowedTabs]);

  useEffect(() => {
    if (!canAccessTab(activeTab)) {
      setActiveTab(allowedTabs[0] || 'tables');
    }
  }, [activeTab, allowedTabs, canAccessTab]);

  // Restaurant Settings
  const [restaurantSettings, setRestaurantSettings] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('restaurantSettings') || 'null') || {
        name: '',
        address: '',
        phone: '',
        gstin: '',
        upiId: '',
        printerWidth: '58mm',
        autoPrintKot: false
      };
    } catch {
      return { name: '', address: '', phone: '', gstin: '', upiId: '', printerWidth: '58mm', autoPrintKot: false };
    }
  });

  const saveRestaurantSettings = (settings) => {
    setRestaurantSettings(settings);
    localStorage.setItem('restaurantSettings', JSON.stringify(settings));
    api.put('/settings/restaurant', settings).catch((error) => {
      console.error('Restaurant settings save failed:', error);
    });
  };

  useEffect(() => {
    api.get('/settings/restaurant').then((response) => {
      if (response.data?.data) {
        setRestaurantSettings(response.data.data);
        localStorage.setItem('restaurantSettings', JSON.stringify(response.data.data));
      }
    }).catch(() => {});
  }, []);

  // Load Data from Backend
  const loadInitialData = async () => {
    setLoading(true);
    setLoadError('');
    try {
      const branchQuery = currentUser?.branchId ? `?branchId=${encodeURIComponent(currentUser.branchId)}` : '';
      const [resTables, resMenu, resOrders] = await Promise.all([
        api.get('/tables').catch(() => ({ data: [] })),
        api.get(`/menu${branchQuery}`).catch(() => ({ data: [] })),
        api.get('/orders/active').catch(() => ({ data: [] }))
      ]);
      const resOnlineOrders = await api.get('/online-orders').catch(() => ({ data: [] }));
      const resDayEnd = await api.get(`/day-end/current?date=${new Date().toISOString().slice(0, 10)}`).catch(() => ({ data: null }));
      const resPayments = await api.get('/payments').catch(() => ({ data: { data: [] } }));
      const resPaymentSummary = await api.get(`/payments/reconciliation/summary?date=${new Date().toISOString().slice(0, 10)}`).catch(() => ({ data: { data: null } }));

      const tablesData = Array.isArray(resTables?.data?.data) ? resTables.data.data : Array.isArray(resTables?.data) ? resTables.data : [];
      const menuData = Array.isArray(resMenu?.data?.data) ? resMenu.data.data : Array.isArray(resMenu?.data) ? resMenu.data : [];
      const ordersData = Array.isArray(resOrders?.data?.data) ? resOrders.data.data : Array.isArray(resOrders?.data) ? resOrders.data : [];
      const onlineOrdersData = Array.isArray(resOnlineOrders?.data?.data) ? resOnlineOrders.data.data : Array.isArray(resOnlineOrders?.data) ? resOnlineOrders.data : [];

      const normalizedTables = tablesData.map(normalizeTable).filter((table) => !isNonVegFloor(table));
      const normalizedMenuItems = menuData.map(normalizeMenuItem);

      setTables(normalizedTables);
      setMenuItems(normalizedMenuItems);
      setOrders(Array.isArray(ordersData) ? ordersData : []);
      setPayments(Array.isArray(resPayments?.data?.data) ? resPayments.data.data : []);
      setPaymentReconciliation(resPaymentSummary?.data?.data || null);
      setOnlineOrders(onlineOrdersData.map(normalizeOnlineOrder));
      const currentDayEnd = resDayEnd?.data?.data || null;
      setDayEndRecord(currentDayEnd);
      if (currentDayEnd) setDayEndOpeningCash(String(currentDayEnd.openingCash ?? ''));
    } catch (err) {
      console.error('Data Load Error:', err);
      setTables([]);
      setMenuItems([]);
      setOrders([]);
      setLoadError('Could not connect to backend. No local sample data is available.');
    } finally {
      setLoading(false);
    }
  };

  const closeBusinessDay = async () => {
    try {
      let record = dayEndRecord;
      if (!record) {
        const openingCash = Number(dayEndOpeningCash);
        if (!Number.isFinite(openingCash) || openingCash < 0) {
          alert('Please enter a valid opening cash amount.');
          return;
        }
        const opened = await api.post('/day-end/open', {
          businessDate: new Date().toISOString().slice(0, 10),
          openingCash
        });
        record = opened.data?.data;
        setDayEndRecord(record);
      }

      const closingCash = Number(dayEndClosingCash);
      if (!record?._id || !Number.isFinite(closingCash) || closingCash < 0) {
        alert('Please enter a valid closing cash amount.');
        return;
      }
      const closed = await api.post(`/day-end/close/${record._id}`, { closingCash });
      setDayEndRecord(closed.data?.data || record);
      alert('Day-end closing saved successfully.');
    } catch (error) {
      alert(error.response?.data?.message || 'Unable to close business day.');
    }
  };

  useEffect(() => {
    loadInitialData();
    // Initial dashboard hydration should run once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!selectedTable && tables.length) {
      setSelectedTable(tables[0]);
    }
  }, [tables, selectedTable]);

  const getLinkedTableIds = (tableId) => {
    if (!tableId) return [];
    const ids = new Set([String(tableId)]);
    const queue = [String(tableId)];

    while (queue.length) {
      const current = queue.pop();
      tables.forEach((table) => {
        const tableIdStr = String(table._id);
        const mergedWith = table.mergedWith ? String(table.mergedWith) : '';
        if ((tableIdStr === current || mergedWith === current) && !ids.has(tableIdStr)) {
          ids.add(tableIdStr);
          queue.push(tableIdStr);
        }
      });

      tables.forEach((table) => {
        const tableIdStr = String(table._id);
        if (tableIdStr !== current && (String(table.mergedWith || '') === tableIdStr || String(tableIdStr) === String(table.mergedWith || '')) && !ids.has(tableIdStr)) {
          ids.add(tableIdStr);
          queue.push(tableIdStr);
        }
      });
    }

    return Array.from(ids);
  };

  const getRelatedOrdersForTable = (tableId) => {
    const linkedTableIds = getLinkedTableIds(tableId);
    return orders.filter((o) => {
      const idValue = o.tableId ? (typeof o.tableId === 'object' ? o.tableId._id : o.tableId) : null;
      return linkedTableIds.includes(String(idValue)) && o.orderStatus !== 'completed' && o.orderStatus !== 'cancelled';
    });
  };

  // Find active running order for selected table (if any)
  const getActiveOrderForTable = (tableId) => {
    if (!tableId) return null;
    return orders.find(
      (o) =>
        String(o.tableId?._id || o.tableId || '') === String(tableId) &&
        o.orderStatus !== 'completed' &&
        o.orderStatus !== 'cancelled'
    );
  };

  const getTableDisplayStatus = (table) => {
    if (!table) return 'available';
    const activeOrder = getActiveOrderForTable(table._id);
    if (activeOrder) return 'occupied';
    return String(table.status || 'available').toLowerCase();
  };

  const getCombinedOrderForTable = (tableId) => {
    const relatedOrders = getRelatedOrdersForTable(tableId);
    if (!relatedOrders.length) return getActiveOrderForTable(tableId);

    const mergedItems = relatedOrders.flatMap((order) => Array.isArray(order.items) ? order.items : []);
    const summary = relatedOrders.reduce((acc, order) => {
      acc.subTotal += Number(order.subTotal || 0);
      acc.grandTotal += Number(order.grandTotal || 0);
      acc.discount += Number(order.discount || 0);
      acc.tax += Number(order.tax || 0);
      return acc;
    }, { subTotal: 0, grandTotal: 0, discount: 0, tax: 0 });

    return {
      _id: `${tableId}-merged`,
      tableId: tableId,
      orderType: 'Dine-In',
      orderStatus: 'placed',
      customerName: relatedOrders[0]?.customerName || 'Walk-in Customer',
      customerPhone: relatedOrders[0]?.customerPhone || '',
      waiterName: relatedOrders[0]?.waiterName || selectedWaiter,
      items: mergedItems,
      subTotal: summary.subTotal,
      grandTotal: summary.grandTotal,
      discount: summary.discount,
      tax: summary.tax,
      createdAt: relatedOrders[0]?.createdAt || new Date().toISOString(),
      tableNo: selectedTable?.tableNo || selectedTable?.tableNumber || 'Merged'
    };
  };

  const currentRunningOrder = selectedTable ? getCombinedOrderForTable(selectedTable._id) : null;

  // Billing rule: Settle/Bill payment is only allowed once the Kitchen (KDS)
  // has marked the order as "ready". This forces the correct flow:
  // KOT punched -> goes to Kitchen -> Kitchen marks Ready -> THEN Settle/Bill.
  const isOrderReadyToSettle = !!(currentRunningOrder && currentRunningOrder.orderStatus === 'ready');

  // Sync customer details when selecting an occupied table
  useEffect(() => {
    if (currentRunningOrder) {
      setCustomerName(currentRunningOrder.customerName || '');
      setCustomerPhone(currentRunningOrder.customerPhone || '');
      setDiscount(currentRunningOrder.discount || 0);
      if (currentRunningOrder.celebrationOccasion) {
        setCelebrationOccasion(currentRunningOrder.celebrationOccasion);
      }
      if (currentRunningOrder.celebrantName) {
        setCelebrantName(currentRunningOrder.celebrantName);
      }
    }
  }, [selectedTable, currentRunningOrder]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      // F1: Dine-In
      if (e.key === 'F1') {
        e.preventDefault();
        setOrderType('Dine-In');
        setActiveTab('tables');
      }
      // F2: Takeaway
      else if (e.key === 'F2') {
        e.preventDefault();
        setOrderType('Takeaway');
        setSelectedTable(null);
        setActiveTab('billing');
      }
      // F3: Delivery
      else if (e.key === 'F3') {
        e.preventDefault();
        setOrderType('Delivery');
        setSelectedTable(null);
        setActiveTab('billing');
      }
      // F4: Focus Search
      else if (e.key === 'F4') {
        e.preventDefault();
        if (activeTab !== 'billing') setActiveTab('billing');
        setTimeout(() => searchInputRef.current?.focus(), 50);
      }
      // F8: Save KOT
      else if (e.key === 'F8') {
        e.preventDefault();
        handlePunchKOT(false);
      }
      // F9: Settle & Bill
      else if (e.key === 'F9') {
        e.preventDefault();
        handleOpenSettleCurrent();
      }
      // Escape: Close Modals
      else if (e.key === 'Escape') {
        setSettleOrderModal(null);
        setShiftTableModal(null);
        setModifierModalItem(null);
        setSelectedMenuItem(null);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  });

  // Calculate half portion price
  const getHalfPrice = (item) => {
    if (item.halfPrice !== undefined && item.halfPrice !== null && item.halfPrice !== '') {
      return Number(item.halfPrice);
    }
    return Math.round(item.price * 0.6);
  };

  const getEffectivePrice = (item) => {
    const now = new Date();
    const hour = now.getHours() * 60 + now.getMinutes();
    const parseTime = (value) => {
      const match = String(value || '').match(/^(\d{1,2}):(\d{2})$/);
      return match ? Number(match[1]) * 60 + Number(match[2]) : null;
    };
    const start = parseTime(item.happyHour?.start);
    const end = parseTime(item.happyHour?.end);
    const happyHourActive = item.happyHour?.enabled && start !== null && end !== null && (start <= end ? hour >= start && hour <= end : hour >= start || hour <= end);
    return happyHourActive && Number(item.happyHour?.price) > 0 ? Number(item.happyHour.price) : Number(item.price || 0);
  };

  const isSeasonalActive = (item) => {
    if (!item.seasonalTag) return true;
    const now = new Date();
    return (!item.seasonalFrom || now >= new Date(item.seasonalFrom)) &&
      (!item.seasonalTill || now <= new Date(item.seasonalTill));
  };

  // Add Item to Cart
  const addToCart = (item, portion = 'Full') => {
    if (item.isAvailable === false) return;
    const isHalf = portion === 'Half';
    const cartId = `${item._id}-${portion}`;
    const cartPrice = isHalf ? getHalfPrice(item) : getEffectivePrice(item);
    const cartName = isHalf ? `${item.name} (Half)` : item.name;

    setCart((prev) => {
      const existing = prev.find((i) => i._id === cartId);
      if (existing) {
        return prev.map((i) => i._id === cartId ? { ...i, quantity: (i.quantity || 1) + 1 } : i);
      }
      return [
        ...prev,
        {
          ...item,
          _id: cartId,
          originalId: item._id,
          portion,
          name: cartName,
          price: cartPrice,
          foodType: item.foodType || 'veg',
          quantity: 1,
          notes: ''
        }
      ];
    });
  };


  
  const updateCartQuantity = (itemId, delta) => {
    setCart((prev) =>
      prev
        .map((i) => {
          if (i._id === itemId) {
            const newQty = (i.quantity || 1) + delta;
            return newQty > 0 ? { ...i, quantity: newQty } : null;
          }
          return i;
        })
        .filter(Boolean)
    );
  };

  const removeFromCart = (itemId) => {
    setCart((prev) => prev.filter((i) => i._id !== itemId));
  };

  // Cart and Running totals calculation
  const getBillTotals = () => {
    // Aggregates unpunched cart items + already punched items (if table order is active)
    const activeItems = currentRunningOrder ? (currentRunningOrder.items || []) : [];
    const allCombined = [...activeItems, ...cart];

    const subTotal = allCombined.reduce((sum, i) => sum + (Number(i.price) * Number(i.quantity || 1)), 0);
    const discountPercentAmt = subTotal * (Number(discount || 0) / 100);
    const customDiscountAmt = Number(customDiscount || 0);
    const serviceChargeAmt = (subTotal - discountPercentAmt - customDiscountAmt) * (Number(serviceCharge || 0) / 100);
    const taxableBeforeGst = Math.max(0, subTotal - discountPercentAmt - customDiscountAmt + serviceChargeAmt);
    const gstPercent = Number(gstRate || 0);
    const cgst = taxableBeforeGst * (gstPercent / 2 / 100);
    const sgst = taxableBeforeGst * (gstPercent / 2 / 100);
    const tax = cgst + sgst;
    const roundOffAmount = Number(roundOff || 0);
    const compDiscountAmount = Number(compDiscount || 0);
    const grandTotal = Math.max(0, taxableBeforeGst + tax + roundOffAmount - compDiscountAmount);

    const newCartSubTotal = cart.reduce((sum, i) => sum + (Number(i.price) * Number(i.quantity || 1)), 0);

    return {
      subTotal,
      discountAmt: discountPercentAmt + customDiscountAmt,
      tax,
      cgst,
      sgst,
      serviceChargeAmt,
      roundOffAmount,
      compDiscountAmount,
      grandTotal,
      newCartSubTotal,
      totalItemCount: allCombined.length,
      taxableBeforeGst
    };
  };

  // -------------------------------------------------------------------------
  // KOT workflow: Save & Print KOT
  // -------------------------------------------------------------------------
  const handlePrintKOT = () => {
    if (cart.length === 0 && !currentRunningOrder) {
      alert('');
      return;
    }

    const itemsToPrint = cart.length ? cart : (currentRunningOrder?.items || []);
    const kotNumber = currentRunningOrder?.kotNumber || 1;

    setKotPrintData({
      kotNumber,
      tableNo: selectedTable?.tableNo || selectedTable?.tableNumber || orderType,
      waiterName: selectedWaiter,
      orderType,
      items: itemsToPrint,
      createdAt: new Date()
    });
    setPrintType('kot');
    setTimeout(() => window.print(), 100);
  };

  const handlePunchKOT = async (shouldPrint = false) => {
    if (orderType === 'Dine-In' && !selectedTable) {
      return alert('');
    }
    if (cart.length === 0) {
      return alert('');
    }
    const normalizedGstin = normalizeCustomerGstin(customerGstin);
    if (!isValidCustomerGstin(normalizedGstin)) {
      alert('GSTIN invalid hai, isliye ise B2C bill ke liye ignore kiya ja raha hai. B2B bill ke liye valid 15-character GSTIN enter karein.');
    }
    if (isValidCustomerGstin(normalizedGstin) && normalizedGstin && placeOfSupply && getGstinStateCode(normalizedGstin) !== placeOfSupply) {
      return alert(`State Code GSTIN se match nahi kar raha. Is GSTIN ke liye ${getGstinStateCode(customerGstin)} enter karein.`);
    }

    try {
      const targetOrder = getActiveOrderForTable(selectedTable?._id) || getRelatedOrdersForTable(selectedTable?._id)[0];

      if (orderType === 'Dine-In' && targetOrder) {
        const res = await api.post(`/orders/kot/punch/${targetOrder._id}`, {
          newItems: cart,
          discount: Number(discount || 0),
          waiterName: selectedWaiter
        });

        if (shouldPrint || restaurantSettings.autoPrintKot) {
          setKotPrintData({
            kotNumber: res.data.kot?.kotNumber || (targetOrder.kots?.length || 0) + 1,
            tableNo: selectedTable?.tableNo || selectedTable?.tableNumber,
            waiterName: selectedWaiter,
            orderType: 'Dine-In',
            items: cart,
            createdAt: new Date()
          });
          setPrintType('kot');
          setTimeout(() => window.print(), 100);
        }

        alert(`✅ KOT #${res.data.kot?.kotNumber || 2} Punched to Kitchen for Table ${selectedTable?.tableNo}!`);
        setCart([]);
        loadInitialData();
        return;
      }

      const { subTotal, tax, grandTotal } = getBillTotals();
      const isFloor2Table = selectedTable?.floor === 'Birthday Party Zone';
      const orderPayload = {
        tableId: orderType === 'Dine-In' ? selectedTable?._id : null,
        orderType,
        deliveryAddress: orderType === 'Delivery' ? deliveryAddress : '',
        customerName: customerName || 'Walk-in Customer',
        customerPhone: customerPhone || '',
        customerGstin: isValidCustomerGstin(normalizedGstin) ? normalizedGstin : '',
        placeOfSupply: placeOfSupply.trim(),
        isInterState,
        waiterName: selectedWaiter,
        celebrationOccasion: isFloor2Table ? celebrationOccasion : '',
        celebrantName: isFloor2Table ? celebrantName : '',
        paymentMode,
        discount: Number(discount || 0),
        customDiscount: Number(customDiscount || 0),
        serviceCharge: Number(serviceCharge || 0),
        gstRate: Number(gstRate || 0),
        roundOff: Number(roundOff || 0),
        compDiscount: Number(compDiscount || 0),
        subTotal,
        tax,
        grandTotal,
        items: cart.map((i) => ({
          itemId: i.originalId || i._id,
          name: i.name,
          foodType: i.foodType || 'veg',
          portion: i.portion || 'Full',
          quantity: Number(i.quantity || 1),
          price: Number(i.price),
          notes: i.notes || ''
        }))
      };

      const res = await api.post('/orders/create', orderPayload);

      if (shouldPrint || restaurantSettings.autoPrintKot) {
        setKotPrintData({
          kotNumber: 1,
          tableNo: selectedTable?.tableNo || selectedTable?.tableNumber || orderType,
          waiterName: selectedWaiter,
          orderType,
          celebrationOccasion: isFloor2Table ? celebrationOccasion : '',
          celebrantName: isFloor2Table ? celebrantName : '',
          items: cart,
          createdAt: new Date()
        });
        setPrintType('kot');
        setTimeout(() => window.print(), 100);
      }

      alert(`✅ KOT #${res?.data?.kot?.kotNumber || 1} Punched for ${orderType === 'Dine-In' ? `Table ${selectedTable?.tableNo}` : orderType}!`);
      setCart([]);
      loadInitialData();
    } catch (err) {
      alert('Order/KOT failed: ' + (err.response?.data?.message || err.message));
    }
  };

  // -------------------------------------------------------------------------
  // Direct Place Order for Delivery / Takeaway
  // -------------------------------------------------------------------------
  const handlePlaceOrderDirect = async (actionType) => {
    if (cart.length === 0) {
      return alert('⚠️ Cart empty hai! Add items first.');
    }
    const normalizedGstin = normalizeCustomerGstin(customerGstin);
    if (!isValidCustomerGstin(normalizedGstin)) {
      alert('GSTIN invalid hai, isliye ise B2C bill ke liye ignore kiya ja raha hai. B2B bill ke liye valid 15-character GSTIN enter karein.');
    }
    if (isValidCustomerGstin(normalizedGstin) && normalizedGstin && placeOfSupply && getGstinStateCode(normalizedGstin) !== placeOfSupply) {
      return alert(`State Code GSTIN se match nahi kar raha. Is GSTIN ke liye ${getGstinStateCode(customerGstin)} enter karein.`);
    }

    try {
      const { subTotal, tax, grandTotal } = getBillTotals();
      const orderPayload = {
        tableId: null,
        orderType,
        deliveryAddress: orderType === 'Delivery' ? deliveryAddress : '',
        customerName: customerName || (orderType === 'Delivery' ? 'Delivery Customer' : 'Takeaway Customer'),
        customerPhone: customerPhone || '',
        customerGstin: isValidCustomerGstin(normalizedGstin) ? normalizedGstin : '',
        placeOfSupply: placeOfSupply.trim(),
        isInterState,
        waiterName: selectedWaiter,
        paymentMode: paymentMode,
        discount: Number(discount || 0),
        customDiscount: Number(customDiscount || 0),
        serviceCharge: Number(serviceCharge || 0),
        gstRate: Number(gstRate || 0),
        roundOff: Number(roundOff || 0),
        compDiscount: Number(compDiscount || 0),
        subTotal,
        tax,
        grandTotal,
        items: cart.map((i) => ({
          itemId: i.originalId || i._id,
          name: i.name,
          foodType: i.foodType || 'veg',
          portion: i.portion || 'Full',
          quantity: Number(i.quantity || 1),
          price: Number(i.price),
          notes: i.notes || ''
        }))
      };

      const res = await api.post('/orders/create', orderPayload);
      const newOrder = res.data.data;
      
      setCart([]);
      setCustomerName('');
      setCustomerPhone('');
      if (orderType === 'Delivery') setDeliveryAddress('');
      
      alert(`✅ Order Placed for ${orderType}!`);
      loadInitialData();

      if (actionType === 'bill') {
        handlePrintProvisionalBill(newOrder);
      } else if (actionType === 'settle') {
        alert('📋');
      }
    } catch (err) {
      alert('Order failed: ' + (err.response?.data?.message || err.message));
    }
  };

  // -------------------------------------------------------------------------
  // Print Provisional Bill (Customer Estimate) & Mark Table as 'Billed'
  // -------------------------------------------------------------------------
  const handlePrintProvisionalBill = async (orderToBill) => {
    const order = orderToBill || currentRunningOrder;
    if (!order) return alert('No active order to bill.');

    const orderIsReadyForFinalPrint = order.orderStatus === 'ready' || order.orderStatus === 'completed';
    if (!orderIsReadyForFinalPrint) {
      alert('⚠️ The final bill can be printed only after settlement. Mark the order as "Ready" in the kitchen, then settle the bill.');
      return;
    }

    try {
      // Update status to 'billed' in backend
      await api.put(`/orders/status/${order._id}`, { status: 'billed' }).catch(() => {});

      setReceiptData({
        customerName: order.customerName,
        customerPhone: order.customerPhone,
        tableLabel: order.tableId?.tableNo || order.tableId?.tableNumber || order.orderType || 'N/A',
        celebrationOccasion: order.celebrationOccasion || '',
        celebrantName: order.celebrantName || '',
        items: order.items || [],
        subTotal: order.subTotal || 0,
        discount: order.discount || 0,
        discountAmt: order.discountAmt || 0,
        tax: order.tax || 0,
        grandTotal: order.grandTotal || 0,
        paymentMode: order.paymentMode || 'Pending',
        createdAt: order.createdAt,
        waiterName: order.waiterName || ''
      });
      setPrintType('bill');
      setTimeout(() => window.print(), 100);

      loadInitialData();
    } catch (err) {
      alert('Print bill failed: ' + err.message);
    }
  };

  const handleOpenSettleCurrent = () => {
    if (orderType !== 'Dine-In' && cart.length > 0) {
      alert('📋 Send the order to the kitchen first using "Place Order & Print Bill" or "Place Order", then settle it after the kitchen marks it Ready.');
      return;
    }

    if (currentRunningOrder) {
      if (currentRunningOrder.orderStatus !== 'ready') {
        alert(
          `⚠️ This order is still in the kitchen (Status: ${(currentRunningOrder.orderStatus || 'placed').toUpperCase()}).\n` +
          `Settlement is available after Kitchen Display (KDS) marks the order as "Ready to Serve".`
        );
        return;
      }
      setSettleOrderModal(currentRunningOrder);
    } else if (cart.length > 0) {
      alert('⚠️ Save the KOT first so the order can be sent to the kitchen.');
    } else {
      alert('⚠️ No active order is selected for settlement.');
    }
  };

  const handleRefundOrder = async (order) => {
    if (!['admin', 'manager'].includes(currentUser?.role)) {
      alert('Only Admin or Manager can process refunds.');
      return;
    }
    const reason = window.prompt('Refund reason:', 'Customer refund');
    if (reason === null) return;
    try {
      await api.post(`/payments/order/${order._id}/refund`, { reason });
      alert('Refund processed. Order, table and inventory have been reconciled.');
      loadInitialData();
    } catch (error) {
      alert(error.response?.data?.message || 'Refund failed.');
    }
  };

  const handleConfirmSettle = async (settleDetails) => {
    if (!settleOrderModal) return;

    try {
      const splitAmounts = settleDetails.splitAmounts || {};
      const paymentModeLabel = settleDetails.paymentMode;
      const ordersToSettle = getRelatedOrdersForTable(selectedTable?._id).length
        ? getRelatedOrdersForTable(selectedTable?._id)
        : (settleOrderModal._id ? [settleOrderModal] : []);

      const settlementResponses = await Promise.all(
        ordersToSettle.map((order) =>
          api.put(`/orders/pay/${order._id}`, {
            paymentMode: paymentModeLabel,
            cashTendered: settleDetails.cashTendered,
            changeReturn: settleDetails.changeReturn,
            splitAmounts: settleDetails.splitAmounts || null,
            paymentReference: settleDetails.paymentReference || '',
            paymentProvider: settleDetails.paymentProvider || 'manual'
          })
        )
      );
      const settledOrder = settlementResponses[0]?.data?.order || {};

      setReceiptData({
        customerName: settleOrderModal.customerName,
        customerPhone: settleOrderModal.customerPhone,
        customerGstin: settledOrder.customerGstin ?? settleOrderModal.customerGstin ?? '',
        invoiceNumber: settledOrder.invoiceNumber || settleOrderModal.invoiceNumber || '',
        tableLabel: settleOrderModal.tableId?.tableNo || settleOrderModal.tableId?.tableNumber || settleOrderModal.orderType || 'N/A',
        celebrationOccasion: settleOrderModal.celebrationOccasion || '',
        celebrantName: settleOrderModal.celebrantName || '',
        items: settleOrderModal.items || [],
        subTotal: settleOrderModal.subTotal || 0,
        discount: settleOrderModal.discount || 0,
        discountAmt: settleOrderModal.discountAmt || 0,
        tax: settleOrderModal.tax || 0,
        gstRate: settledOrder.gstRate ?? settleOrderModal.gstRate ?? 0,
        cgst: settledOrder.cgst ?? settleOrderModal.cgst ?? 0,
        sgst: settledOrder.sgst ?? settleOrderModal.sgst ?? 0,
        igst: settledOrder.igst ?? settleOrderModal.igst ?? 0,
        isInterState: settledOrder.isInterState ?? settleOrderModal.isInterState ?? false,
        grandTotal: settleOrderModal.grandTotal || 0,
        paymentMode: paymentModeLabel,
        createdAt: new Date(),
        waiterName: settleOrderModal.waiterName || ''
      });
      setPrintType('bill');
      setTimeout(() => window.print(), 100);

      const settlementMessage = settleDetails.paymentMode === 'Split'
        ? `✅ Split payment recorded: Cash ₹${Number(splitAmounts.cash || 0).toFixed(2)} + UPI/Card ₹${Number(splitAmounts.online || 0).toFixed(2)}.`
        : `✅ Bill Settled! Table is now free. ${settleDetails.changeReturn > 0 ? `Return change: ₹${settleDetails.changeReturn.toFixed(2)}` : ''}`;

      alert(settlementMessage);
      setSettleOrderModal(null);
      setSelectedTable(null);
      setCart([]);
      setCustomerName('');
      setCustomerPhone('');
      loadInitialData();
    } catch (err) {
      alert('Settlement failed: ' + (err.response?.data?.message || err.message));
    }
  };

  // -------------------------------------------------------------------------
  // Table Shift / Transfer Handler
  // -------------------------------------------------------------------------
  const handleConfirmShift = async (fromId, toId) => {
    try {
      const res = await api.put(`/tables/transfer/${fromId}/${toId}`);
      alert(res.data.message || 'Table shifted successfully!');
      setShiftTableModal(null);
      loadInitialData();
    } catch (err) {
      alert('Table shift failed: ' + (err.response?.data?.message || err.message));
    }
  };

  // Kitchen Display Status Update
  const handleKitchenStatusUpdate = async (order, newStatus) => {
    if (newStatus === 'cancelled') {
      if (!['admin', 'manager'].includes(currentUser?.role)) {
        alert('Only Admin or Manager can cancel an order.');
        return;
      }
      const reason = window.prompt('Cancellation reason:', 'Customer cancelled order');
      if (reason === null || !reason.trim() || !window.confirm('Cancel this order and restore its stock?')) return;
      try {
        await api.put(`/orders/status/${order._id}`, { status: newStatus, reason: reason.trim() });
        alert('Order cancelled and inventory restored.');
        loadInitialData();
      } catch (error) {
        alert(error.response?.data?.message || 'Order cancellation failed.');
      }
      return;
    }

    try {
      if (newStatus === 'completed') {
        setSettleOrderModal(order);
        return;
      }
      const now = new Date().toISOString();
      setKitchenMeta((prev) => {
        const existing = prev[order._id] || {};
        const next = {
          ...existing,
          chef: existing.chef || 'Chef Raju',
          startedAt: existing.startedAt || order.createdAt || now,
          readyAt: newStatus === 'ready' ? (existing.readyAt || now) : existing.readyAt || null,
          priority: existing.priority || order.priority || 'Normal',
          statusHistory: [
            ...(existing.statusHistory || []),
            { status: newStatus, timestamp: now, updatedBy: existing.chef || 'Chef Raju' }
          ]
        };
        return { ...prev, [order._id]: next };
      });
      await api.put(`/orders/status/${order._id}`, { status: newStatus });
      loadInitialData();
    } catch (err) {
      alert('Update failed: ' + (err.response?.data?.message || err.message));
    }
  };

  // Kitchen workflow state for chef assignment, timestamps, priority and item-level tracking
  const [kitchenMeta, setKitchenMeta] = useState({});
  const chefRoster = ['Chef Raju', 'Chef Neha', 'Chef Sagar', 'Chef Mohan'];

  const setKitchenPriority = (orderId, priority) => {
    setKitchenMeta((prev) => ({
      ...prev,
      [orderId]: {
        ...(prev[orderId] || {}),
        priority,
        statusHistory: [
          ...(prev[orderId]?.statusHistory || []),
          { status: `priority:${priority.toLowerCase()}`, timestamp: new Date().toISOString(), updatedBy: 'Kitchen Lead' }
        ]
      }
    }));
  };

  const expediteOrder = (orderId) => {
    setKitchenPriority(orderId, 'Urgent');
    setKitchenMeta((prev) => ({
      ...prev,
      [orderId]: {
        ...(prev[orderId] || {}),
        delayAlert: true,
        chef: prev[orderId]?.chef || 'Chef Raju'
      }
    }));
  };

  const handleItemLevelStatusUpdate = async (orderId, kotNumber, itemId, newStatus, chef = 'Chef Raju') => {
    try {
      const now = new Date().toISOString();
      setKitchenMeta((prev) => {
        const existing = prev[orderId] || {};
        const itemState = {
          status: newStatus,
          updatedAt: now,
          chef,
        };
        const nextItems = {
          ...(existing.itemStates || {}),
          [String(itemId)]: itemState
        };

        const next = {
          ...existing,
          chef: existing.chef || chef,
          startedAt: existing.startedAt || now,
          readyAt: newStatus === 'ready' ? (existing.readyAt || now) : existing.readyAt || null,
          itemStates: nextItems
        };

        if (newStatus === 'ready' && Object.values(nextItems).every((state) => state.status === 'ready')) {
          next.readyAt = next.readyAt || now;
        }

        return { ...prev, [orderId]: next };
      });

      await api.put(`/orders/${orderId}/item-status`, {
        kotNumber,
        itemId,
        status: newStatus,
        chef
      });

      if (typeof loadInitialData === 'function') loadInitialData();
    } catch (err) {
      console.error('Failed to update item-level status:', err);
    }
  };

  // Menu items filter (by Floor, Category, Search, FoodType)

const filteredMenu = menuItems.filter((item) => {
  const itemFloor = item?.floor
    ? item.floor.toString().trim().toLowerCase()
    : 'veg floor';

  const currentFloor = selectedFloor
    .toString()
    .trim()
    .toLowerCase();

  const matchesFloor =
    itemFloor === currentFloor ||
    !item?.floor;

  const matchesCategory =
    activeCategory === 'All' ||
    item?.category === activeCategory;

  const searchText = search.toString().trim().toLowerCase();

  const matchesSearch =
    !searchText ||
    item?.name?.toLowerCase().includes(searchText) ||
    item?.code?.toLowerCase().includes(searchText) ||
    String(item?.barcode || '').toLowerCase().includes(searchText);

  // NON-VEG + EGG completely hidden
  const foodType = item?.foodType
    ?.toString()
    .trim()
    .toLowerCase();

  const matchesFoodType =
    foodType !== 'non-veg' &&
    foodType !== 'egg';

  return (
    matchesFloor &&
    matchesCategory &&
    matchesSearch &&
    item.isAvailable !== false &&
    isSeasonalActive(item) &&
    matchesFoodType
  );
});

const categories = [
  'All',
  'Thali & Plates',
  'Starters',
  'Main Course',
  'Breads & Rotis',
  'Rice & Biryani',
  'Fast Food',
  'Snacks',
  'Beverages',
  'Dessert'
];

const floor2Categories = [
  'Party Packages',
  'Cakes & Bakery',
  'Decorations',
  'Drinks & Pitchers',
  'Desserts',
  'Party Add-ons'
];

const {
  subTotal,
  discountAmt,
  grandTotal,
  cgst,
  sgst,
  serviceChargeAmt,
  compDiscountAmount
} = getBillTotals();

const splitBillPreview = Array.from({ length: Math.max(1, Number(splitBillCount || 1)) }, (_, idx) => {
  const splitAmount = Number((grandTotal / Math.max(1, Number(splitBillCount || 1))).toFixed(2));
  return { index: idx + 1, amount: splitAmount };
});

const remainingBalance = Math.max(0, grandTotal - Number(partialPayment || 0));

const paymentPeriodStart = (() => {
  const start = new Date();
  if (paymentPeriod === 'Week') {
    const day = start.getDay();
    start.setDate(start.getDate() - (day === 0 ? 6 : day - 1));
  } else if (paymentPeriod === 'Month') {
    start.setDate(1);
  } else if (paymentPeriod === 'Year') {
    start.setMonth(0, 1);
  }
  start.setHours(0, 0, 0, 0);
  return start;
})();

const paymentPeriodEnd = new Date();
paymentPeriodEnd.setHours(23, 59, 59, 999);
const filteredPayments = payments.filter((payment) => {
  const paymentDate = new Date(payment.status === 'refunded' ? (payment.refundedAt || payment.settledAt) : payment.settledAt);
  return !Number.isNaN(paymentDate.getTime()) && paymentDate >= paymentPeriodStart && paymentDate <= paymentPeriodEnd;
});
const paymentMetrics = filteredPayments.reduce((summary, payment) => {
  const amount = Number(payment.grandTotal || 0);
  if (payment.status === 'refunded') summary.refunded += amount;
  else {
    summary.paid += amount;
    summary.count += 1;
    if (payment.paymentMode === 'Split') {
      summary.splitCash += Number(payment.paymentBreakdown?.cash || 0);
      summary.splitOnline += Number(payment.paymentBreakdown?.online || 0);
    }
  }
  return summary;
}, { paid: 0, refunded: 0, splitCash: 0, splitOnline: 0, count: 0 });

const handleHoldBill = () => {
  if ((cart.length === 0 && (!currentRunningOrder || !currentRunningOrder.items || currentRunningOrder.items.length === 0))) {
    alert('There is no active bill to hold.');
    return;
  }

  const holdPayload = {
    id: Date.now(),
    title: selectedTable ? `Table ${selectedTable.tableNo || selectedTable.tableNumber}` : (orderType || 'Walk-in'),
    total: grandTotal,
    items: [...(currentRunningOrder?.items || []), ...cart],
    createdAt: new Date().toISOString(),
    waiterName: selectedWaiter
  };

  setSavedBills((prev) => [holdPayload, ...prev].slice(0, 8));
  setCart([]);
  alert('✅ Bill hold kar diya gaya hai. Saved bills section se restore ho sakta hai.');
};

const handleRestoreSavedBill = (savedBill) => {
  if (!savedBill || !Array.isArray(savedBill.items)) return;
  setCart(savedBill.items.map((item) => ({
    ...item,
    _id: item._id || `${item.name}-${Date.now()}-${Math.random()}`,
    originalId: item.originalId || item.itemId || item._id,
    quantity: Number(item.quantity || 1),
    price: Number(item.price || 0),
    portion: item.portion || 'Full',
    foodType: item.foodType || 'veg'
  })));
  alert(`✅ Saved bill restored: ${savedBill.title}`);
};

const handleMergeTables = () => {
  if (!selectedTable || !selectedMergeTableId || selectedTable._id === selectedMergeTableId) {
    alert('Select a valid table to merge.');
    return;
  }

  setTables((prev) => prev.map((table) => {
    if (table._id === selectedTable._id || table._id === selectedMergeTableId) {
      return {
        ...table,
        status: 'occupied',
        mergedWith: table._id === selectedTable._id ? selectedMergeTableId : selectedTable._id
      };
    }
    return table;
  }));

  const mergedTable = tables.find((table) => table._id === selectedMergeTableId);
  setTables((prev) => prev.map((table) =>
    table._id === selectedTable._id || table._id === selectedMergeTableId
      ? { ...table, mergedWith: table._id === selectedTable._id ? selectedMergeTableId : selectedTable._id }
      : table
  ));
  alert(`✅ Table ${selectedTable.tableNo || selectedTable.tableNumber} aur ${mergedTable?.tableNo || 'selected table'} merge kar diya gaya.`);
  setSelectedMergeTableId('');
};
// Floor tables
const floorTables = tables.filter((t) => {
  const dbFloor = String(t.floor || 'Floor 1').trim().toLowerCase();
  const currentFloor = String(selectedFloor || 'Floor 1').trim().toLowerCase();

  // UI name -> Database floor name mapping
  if (currentFloor === 'veg floor') {
    return dbFloor === 'floor 1';
  }

  if (
    currentFloor === 'birthday party zone' ||
    currentFloor === 'party floor'
  ) {
    return (
      dbFloor === 'floor 2' ||
      dbFloor === 'birthday party zone' ||
      dbFloor === 'party floor'
    );
  }

  return dbFloor === currentFloor;
});

// Status counts for Floor plan summary
const vacantCount = floorTables.filter(
  (t) => (t.status || 'available') === 'available'
).length;

const occupiedCount = floorTables.filter(
  (t) => t.status === 'occupied'
).length;

const billedCount = floorTables.filter(
  (t) => t.status === 'billed'
).length;
const activeOrderMetrics = orders.filter((o) => o.orderStatus && ['placed', 'preparing', 'ready'].includes(String(o.orderStatus).toLowerCase()));
const totalRevenue = orders.reduce((sum, order) => {
  const value = Number(order.grandTotal ?? order.totalAmount ?? order.total ?? 0);
  return sum + (Number.isFinite(value) ? value : 0);
}, 0);

const getLocalDateKey = (value) => {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) return '';
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const isOrderInPeriod = (order, period) => {
  const orderDate = new Date(order.settledAt || order.completedAt || order.createdAt);
  if (Number.isNaN(orderDate.getTime())) return false;
  const now = new Date();
  if (period === 'Today') return getLocalDateKey(orderDate) === getLocalDateKey(now);
  if (period === 'Year') return orderDate.getFullYear() === now.getFullYear();
  if (period === 'Month') {
    return orderDate.getFullYear() === now.getFullYear() && orderDate.getMonth() === now.getMonth();
  }
  const startOfWeek = new Date(now);
  const day = startOfWeek.getDay();
  startOfWeek.setHours(0, 0, 0, 0);
  startOfWeek.setDate(startOfWeek.getDate() - (day === 0 ? 6 : day - 1));
  return orderDate >= startOfWeek;
};

const totalGuests = orders.reduce((sum, order) => {
  const guestCount = Number(order.guestCount ?? order.customers ?? 0);
  return sum + (Number.isFinite(guestCount) && guestCount > 0 ? guestCount : 1);
}, 0);

const avgBillValue = orders.length ? totalRevenue / orders.length : 0;

const itemSalesSummary = orders.reduce((map, order) => {
  const itemList = Array.isArray(order.items) ? order.items : [];
  itemList.forEach((item) => {
    const itemName = item?.name || 'Unknown Item';
    const quantity = Number(item?.quantity || item?.qty || 1);
    map[itemName] = (map[itemName] || 0) + quantity;
  });
  return map;
}, {});

const topSellingItem = Object.entries(itemSalesSummary).sort((a, b) => b[1] - a[1])[0];

  return (
    <div className="pos-shell" style={ui.container}>
      {/* Print Styles */}
      <style>{`
        @media print {
          body * { visibility: hidden; }
          #receipt-print-area, #receipt-print-area * { visibility: visible; }
          #receipt-print-area { display: block !important; position: absolute; top: 0; left: 0; }
          #receipt-print-area > div, #kot-print-area > div { width: ${restaurantSettings.printerWidth === '80mm' ? '302px' : '220px'} !important; }
          #kot-print-area, #kot-print-area * { visibility: visible; }
          #kot-print-area { display: block !important; position: absolute; top: 0; left: 0; }
        }
      `}</style>

      {/* Hidden Print Slip Elements */}
      {printType === 'bill' && (
        <ReceiptPrintArea receiptData={receiptData} restaurantSettings={restaurantSettings} />
      )}
      {printType === 'kot' && (
        <KOTPrintArea kotData={kotPrintData} restaurantSettings={restaurantSettings} />
      )}

{/* ===================== PERMANENT LEFT SIDEBAR ===================== */}
<div
  className="pos-sidebar"
  style={{
    position: 'relative',
    height: '100vh',
    width: '260px',
    background: '#fff',
    borderRight: '1px solid #eef1f5',
    boxShadow: '2px 0 10px rgba(0,0,0,0.04)',
    zIndex: 100,
    display: 'flex',
    flexDirection: 'column',
    padding: '18px',
    boxSizing: 'border-box',
    flexShrink: 0
  }}
>
  {/* Existing restaurant logo */}
  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '18px' }}>
    <div style={{ width: '34px', height: '34px', borderRadius: '9px', background: 'linear-gradient(135deg, #ff7a45 0%, #fc4f1a 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', color: '#fff', fontSize: '18px', boxShadow: '0 2px 6px rgba(252,79,26,0.35)', flexShrink: 0 }}>
      🍽️
    </div>
    <div>
      <h2 style={{ margin: 0, fontSize: '15px', fontWeight: 'bold', color: '#1a1a2e', lineHeight: 1.2 }}>
        {restaurantSettings.name || 'TAMANNA RESTRO'}
      </h2>
      <span style={{ backgroundColor: '#e8fbf1', color: '#0d9f5f', fontSize: '9px', padding: '1px 6px', borderRadius: '8px', border: '1px solid #b9f0d4', fontWeight: 'bold' }}>
        ● POS Live
      </span>
    </div>
    <div style={{ marginLeft: 'auto', position: 'relative' }}>
      <button onClick={() => setShowNotifications((visible) => !visible)} aria-label="Notifications" style={{ position: 'relative', width: 36, height: 36, border: '1px solid #e2e8f0', borderRadius: 9, background: '#fff', cursor: 'pointer', fontSize: 16 }}>
        🔔
        {notifications.length > 0 && <span style={{ position: 'absolute', top: -5, right: -5, minWidth: 17, height: 17, padding: '0 4px', borderRadius: 999, background: '#dc2626', color: '#fff', fontSize: 10, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{notifications.length > 9 ? '9+' : notifications.length}</span>}
      </button>
      {showNotifications && <div style={{ position: 'absolute', top: 42, right: 0, width: 280, maxHeight: 320, overflowY: 'auto', background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, boxShadow: '0 10px 30px rgba(15,23,42,.16)', zIndex: 200, padding: 10 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 4px 8px', borderBottom: '1px solid #f1f5f9' }}>
          <strong style={{ fontSize: 12 }}>Live Notifications</strong>
          <button onClick={() => setNotifications([])} style={{ border: 0, background: 'transparent', color: '#64748b', fontSize: 11, cursor: 'pointer' }}>Clear</button>
        </div>
        {notifications.length === 0 ? <div style={{ padding: 16, color: '#64748b', fontSize: 12, textAlign: 'center' }}>No new notifications.</div> : notifications.map((notification) => <div key={notification.id} style={{ padding: '9px 4px', borderBottom: '1px solid #f8fafc' }}><div style={{ fontSize: 12, fontWeight: 700, color: '#0f172a' }}>{notification.title}</div><div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>{notification.message}</div><div style={{ fontSize: 10, color: '#94a3b8', marginTop: 3 }}>{new Date(notification.createdAt).toLocaleTimeString('en-IN')}</div></div>)}
      </div>}
    </div>
  </div>

  <div style={{ fontSize: '11px', color: '#64748b', marginBottom: '16px' }}>
    Cashier: <b>{currentUser?.name || 'Admin'}</b> · Shift Open
  </div>

  {/* Real-Time clock */}
  <div style={{
    background: 'linear-gradient(135deg, #ff7a45 0%, #fc4f1a 100%)',
    borderRadius: '12px',
    padding: '14px',
    color: '#fff',
    marginBottom: '18px',
    textAlign: 'center'
  }}>
    <div style={{ fontSize: '11px', opacity: 0.85, marginBottom: '4px' }}>Real-Time</div>
    <div style={{ fontSize: '24px', fontWeight: 'bold', letterSpacing: '1px' }}>
      {currentTime.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
    </div>
    <div style={{ fontSize: '11px', opacity: 0.9, marginTop: '4px' }}>
      {currentTime.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
    </div>
  </div>

  {/* Divider */}
  <div style={{ borderTop: '1px solid #eef1f5', margin: '4px 0 14px 0' }} />

  {/* Sabhi Navigation Tabs */}
  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', overflowY: 'auto', flex: 1 }}>
    {canAccessTab('tables') && (
      <button
        style={{ ...(activeTab === 'tables' ? ui.navBtnActive : ui.navBtn), textAlign: 'left', width: '100%' }}
        onClick={() => setActiveTab('tables')}
      >
        🪑 Tables (Floor)
      </button>
    )}

    {canAccessTab('billing') && (
      <button
        style={{ ...(activeTab === 'billing' ? ui.navBtnActive : ui.navBtn), textAlign: 'left', width: '100%' }}
        onClick={() => setActiveTab('billing')}
      >
        ⚡ POS Billing
      </button>
    )}

    {canAccessTab('customers') && (
      <button
        style={{ ...(activeTab === 'customers' ? ui.navBtnActive : ui.navBtn), textAlign: 'left', width: '100%' }}
        onClick={() => setActiveTab('customers')}
      >
        👥 Customers & Loyalty
      </button>
    )}

    {canAccessTab('kot') && (
      <button
        style={{ ...(activeTab === 'kot' ? ui.navBtnActive : ui.navBtn), textAlign: 'left', width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
        onClick={() => { loadInitialData(); setActiveTab('kot'); }}
      >
        <span>👨‍🍳 Kitchen KDS</span>
        {orders.filter(o => o.orderStatus === 'placed' || o.orderStatus === 'preparing').length > 0 && (
          <span style={{ backgroundColor: '#fc4f1a', color: '#fff', borderRadius: '10px', padding: '1px 6px', fontSize: '10px', fontWeight: 'bold' }}>
            {orders.filter(o => o.orderStatus === 'placed' || o.orderStatus === 'preparing').length}
          </span>
        )}
      </button>
    )}

    {canAccessTab('online') && (
      <button
        style={{ ...(activeTab === 'online' ? ui.navBtnActive : ui.navBtn), textAlign: 'left', width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
        onClick={() => setActiveTab('online')}
      >
        <span>🛵 Online</span>
        <span style={{ backgroundColor: '#ef4444', color: '#fff', borderRadius: '10px', padding: '1px 6px', fontSize: '10px', fontWeight: 'bold' }}>
          {onlineOrders.filter(o => o.status === 'Pending').length}
        </span>
      </button>
    )}

    {canAccessTab('waiters') && (
      <button
        style={{ ...(activeTab === 'waiters' ? ui.navBtnActive : ui.navBtn), textAlign: 'left', width: '100%' }}
        onClick={() => setActiveTab('waiters')}
      >
        👨‍🍳 Waiters
      </button>
    )}

    {canAccessTab('analytics') && (
      <button
        style={{ ...(activeTab === 'analytics' ? ui.navBtnActive : ui.navBtn), textAlign: 'left', width: '100%' }}
        onClick={() => setActiveTab('analytics')}
      >
        📈 Analytics
      </button>
    )}

    {canAccessTab('reports') && (
      <button style={{ ...(activeTab === 'reports' ? ui.navBtnActive : ui.navBtn), textAlign: 'left', width: '100%' }} onClick={() => setActiveTab('reports')}>
        📊 Food Cost & Reports
      </button>
    )}

    {canAccessTab('recipes') && (
      <button style={{ ...(activeTab === 'recipes' ? ui.navBtnActive : ui.navBtn), textAlign: 'left', width: '100%' }} onClick={() => setActiveTab('recipes')}>
        🍲 Recipe Builder
      </button>
    )}

    {canAccessTab('payments') && (
      <button
        style={{ ...(activeTab === 'payments' ? ui.navBtnActive : ui.navBtn), textAlign: 'left', width: '100%' }}
        onClick={() => setActiveTab('payments')}
      >
        💳 Payments
      </button>
    )}

    {canAccessTab('dayend') && (
      <button
        style={{ ...(activeTab === 'dayend' ? ui.navBtnActive : ui.navBtn), textAlign: 'left', width: '100%' }}
        onClick={() => setActiveTab('dayend')}
      >
        📋 Day-End Z-Report
      </button>
    )}

    {canAccessTab('shifts') && (
      <button
        style={{ ...(activeTab === 'shifts' ? ui.navBtnActive : ui.navBtn), textAlign: 'left', width: '100%' }}
        onClick={() => setActiveTab('shifts')}
      >
        💼 Cashier Shifts
      </button>
    )}

    {canAccessTab('admin') && (
      <button
        style={{ ...(activeTab === 'admin' ? ui.navBtnActive : ui.navBtn), textAlign: 'left', width: '100%' }}
        onClick={() => setActiveTab('admin')}
      >
        ⚙️ Admin
      </button>
    )}

    {canAccessTab('inventory') && (
      <button
        style={{ ...(activeTab === 'inventory' ? ui.navBtnActive : ui.navBtn), textAlign: 'left', width: '100%' }}
        onClick={() => setActiveTab('inventory')}
      >
        📦 Inventory
      </button>
    )}

    {canAccessTab('expenses') && (
      <button
        style={{ ...(activeTab === 'expenses' ? ui.navBtnActive : ui.navBtn), textAlign: 'left', width: '100%' }}
        onClick={() => setActiveTab('expenses')}
      >
        💸 Expenses
      </button>
    )}

    {canAccessTab('reservations') && (
      <button
        onClick={() => setActiveTab('reservations')}
        className={`px-3 py-2 rounded-lg text-sm font-medium text-left ${activeTab === 'reservations' ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-100'}`}
      >
        📅 Reservations
      </button>
    )}

    {canAccessTab('staff') && (
      <button 
        onClick={() => setActiveTab('staff')}
        className={`px-3 py-2 rounded-lg text-sm font-medium text-left flex items-center gap-2 ${activeTab === 'staff' ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-100'}`}
      >
        👥 Staff & Payroll
      </button>
    )}
    

    <div style={{ borderTop: '1px solid #eef1f5', margin: '10px 0' }} />

    <button style={{ ...ui.logoutBtn, textAlign: 'left', width: '100%' }} onClick={handleLogout}>
      Exit
    </button>
  </div>
</div>
      <div className="pos-main" style={{ flex: 1, minWidth: 0, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Speed Billing Keyboard Shortcuts Bar */}
      <KeyboardShortcutsBanner />

      {/* Main Content Area */}
      {loadError && (
        <div style={{ backgroundColor: '#fee2e2', color: '#991b1b', padding: '8px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>{loadError}</span>
          <button onClick={loadInitialData} style={{ ...ui.submitBtn, padding: '4px 10px', fontSize: '12px' }}>Retry</button>
        </div>
      )}

      {activeTab === 'inventory' && <InventoryManagement />}

      {activeTab === 'expenses' && <ExpenseManager />}

      {activeTab === 'reservations' && <TableReservation />}

      {activeTab === 'staff' && <StaffHRMModule />}

      {activeTab === 'reports' && <ReportsAndCosting />}

      {activeTab === 'recipes' && <RecipeBuilder />}
      {activeTab === 'shifts' && <CashierShift />}

      {activeTab === 'customers' && <CustomerCRM />}

      {loading ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b' }}>
          Loading Tamanna POS Engine...
        </div>
      ) : (
        <>
          {/* ================================================================= */}
         {/* TAB 1:  TABLE MANAGEMENT VIEW */}
{activeTab === 'tables' && (
  <div style={{ flex: 1, padding: '20px', overflowY: 'auto', backgroundColor: '#f8fafc' }}>
    {/* Floor Switcher & Status Badges */}
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
      <div style={{ display: 'flex', gap: '8px' }}>
        <button
          onClick={() => setSelectedFloor('Veg Floor')}
          style={{
            ...ui.floorTabBtn,
            backgroundColor: selectedFloor === 'Veg Floor' ? '#0d9f5f' : '#ffffff',
            color: selectedFloor === 'Veg Floor' ? '#fff' : '#475569',
            border: `1px solid ${selectedFloor === 'Veg Floor' ? '#0d9f5f' : '#cbd5e1'}`
          }}
        >
          🥬 Veg Floor
        </button>
        <button
          onClick={() => setSelectedFloor('Birthday Party Zone')}
          style={{
            ...ui.floorTabBtn,
            backgroundColor: selectedFloor === 'Birthday Party Zone' ? '#fc4f1a' : '#ffffff',
            color: selectedFloor === 'Birthday Party Zone' ? '#fff' : '#475569',
            border: `1px solid ${selectedFloor === 'Birthday Party Zone' ? '#fc4f1a' : '#cbd5e1'}`
          }}
        >
          🎉 Birthday Party Zone
        </button>
      </div>

      {/* Status Counter Chips */}
      <div style={{ display: 'flex', gap: '8px', fontSize: '12px' }}>
        <span style={{ backgroundColor: '#ecfdf5', color: '#047857', padding: '6px 12px', borderRadius: '20px', border: '1px solid #a7f3d0', fontWeight: 'bold' }}>
          🟢 {vacantCount} Vacant
        </span>
        <span style={{ backgroundColor: '#fef2f2', color: '#b91c1c', padding: '6px 12px', borderRadius: '20px', border: '1px solid #fecaca', fontWeight: 'bold' }}>
          🔴 {occupiedCount} Running KOT
        </span>
        <span style={{ backgroundColor: '#fff1ec', color: '#c2410c', padding: '6px 12px', borderRadius: '20px', border: '1px solid #ffd3bd', fontWeight: 'bold' }}>
          🔵 {billedCount} Billed
        </span>
      </div>
    </div>

    {/* New Restaurant Insights Feature */}
    <div className="dashboard-insights-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(180px, 1fr))', gap: '12px', marginBottom: '18px' }}>
      <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '16px', boxShadow: '0 4px 10px rgba(15, 23, 42, 0.03)' }}>
        <div style={{ fontSize: '11px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.7px' }}>Today's sales</div>
        <div style={{ marginTop: '10px', fontSize: '22px', fontWeight: '800', color: '#0f172a' }}>₹{totalRevenue.toFixed(0)}</div>
        <div style={{ marginTop: '4px', fontSize: '11px', color: '#059669' }}>+ {activeOrderMetrics.length} active orders</div>
      </div>
      <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '16px', boxShadow: '0 4px 10px rgba(15, 23, 42, 0.03)' }}>
        <div style={{ fontSize: '11px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.7px' }}>Guests served</div>
        <div style={{ marginTop: '10px', fontSize: '22px', fontWeight: '800', color: '#0f172a' }}>{totalGuests}</div>
        <div style={{ marginTop: '4px', fontSize: '11px', color: '#2563eb' }}>Avg {Math.round(totalGuests / Math.max(orders.length, 1))} per order</div>
      </div>
      <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '16px', boxShadow: '0 4px 10px rgba(15, 23, 42, 0.03)' }}>
        <div style={{ fontSize: '11px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.7px' }}>Avg bill</div>
        <div style={{ marginTop: '10px', fontSize: '22px', fontWeight: '800', color: '#0f172a' }}>₹{avgBillValue.toFixed(0)}</div>
        <div style={{ marginTop: '4px', fontSize: '11px', color: '#f59e0b' }}>{orders.length} bills recorded</div>
      </div>
      <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '16px', boxShadow: '0 4px 10px rgba(15, 23, 42, 0.03)' }}>
        <div style={{ fontSize: '11px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.7px' }}>Top seller</div>
        <div style={{ marginTop: '10px', fontSize: '18px', fontWeight: '800', color: '#0f172a' }}>{topSellingItem ? topSellingItem[0] : 'No sales yet'}</div>
        <div style={{ marginTop: '4px', fontSize: '11px', color: '#7c3aed' }}>{topSellingItem ? `${topSellingItem[1]} sold` : 'Waiting for orders'}</div>
      </div>
    </div>

    {/* Table Grid Cards */}
    <div className="table-floor-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '14px', width: '100%', minWidth: 0 }}>
      {floorTables.length === 0 ? (
        <p style={{ color: '#94a3b8', gridColumn: '1/-1' }}>
          {/* No tables found message */}
        </p>
      ) : (
        floorTables.map((t) => {
          const orderForTable = getActiveOrderForTable(t._id);
          const isSelected = selectedTable?._id === t._id;

          return (
            <TableCard
              key={t._id}
              table={t}
              activeOrder={orderForTable}
              isSelected={isSelected}
              onSelect={() => {
                setSelectedTable(t);
                setOrderType('Dine-In');
                setActiveTab('billing');
              }}
              onAddKOT={() => {
                setSelectedTable(t);
                setOrderType('Dine-In');
                setActiveTab('billing');
              }}
              onPrintBill={() => handlePrintProvisionalBill(orderForTable)}
              onSettle={() => {
                if (orderForTable) {
                  if (orderForTable.orderStatus !== 'ready') {
                    alert(`⚠️ This order is still in the kitchen (Status: ${(orderForTable.orderStatus || 'placed').toUpperCase()}). Settle it after the kitchen marks it Ready.`);
                    return;
                  }
                  setSettleOrderModal(orderForTable);
                }
              }}
              onShiftTable={() => setShiftTableModal(t)}
            />
          );
        })
      )}
    </div>

   
      {/* --- TABLE TRANSFER MODAL --- */}

      {shiftTableModal && (
        <TableTransferModal
          isOpen={Boolean(shiftTableModal)}
          onClose={() => setShiftTableModal(null)}
          currentTable={shiftTableModal}
          allTables={tables || floorTables}
          onTransferSuccess={() => {
            loadInitialData();
          }}
        />
      )}

      {/* --- TABLE QR CODE MODAL --- */}

      {qrModalTable && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            backgroundColor: 'rgba(0,0,0,0.5)',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            zIndex: 1000
          }}
        >
          <div
            style={{
              background: '#fff',
              padding: '25px',
              borderRadius: '8px',
              width: '320px',
              textAlign: 'center',
              boxShadow: '0 4px 10px rgba(0,0,0,0.3)'
            }}
          >
            <h3
              style={{
                marginBottom: '10px',
                color: '#333'
              }}
            >
              Table {qrModalTable.tableNo || qrModalTable.tableNumber} QR Menu
            </h3>

            <p
              style={{
                fontSize: '12px',
                color: '#666',
                marginBottom: '15px'
              }}
            >
              Scan to open digital menu on mobile:
            </p>

            <div
              style={{
                background: '#f9f9f9',
                padding: '15px',
                display: 'inline-block',
                borderRadius: '6px',
                border: '1px solid #ddd'
              }}
            >
              <QRCodeCanvas
                value={`http://localhost:3000/menu/${qrModalTable._id}`}
                size={180}
                level="H"
                includeMargin={true}
              />
            </div>

            <p
              style={{
                fontSize: '10px',
                color: '#888',
                marginTop: '10px',
                wordBreak: 'break-all'
              }}
            >
              http://localhost:3000/menu/{qrModalTable._id}
            </p>

            <div
              style={{
                display: 'flex',
                justifyContent: 'center',
                gap: '10px',
                marginTop: '20px'
              }}
            >
              <button
                onClick={() => window.print()}
                style={{
                  padding: '8px 15px',
                  background: '#0284c7',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '12px'
                }}
              >
                Print QR
              </button>

              <button
                onClick={() => setQrModalTable(null)}
                style={{
                  padding: '8px 15px',
                  background: '#64748b',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '12px'
                }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
)}
      {/* ================================================================= */}
      {/* TAB 2: SPEED BILLING & ORDER PUNCHING  */}
      {/* ================================================================= */}
      {activeTab === 'billing' && (
            <div style={{ display: 'flex', flex: 1, minWidth: 0, minHeight: 0, overflow: 'hidden', backgroundColor: '#f8fafc' }}>
              {/* Left & Center Menu Area */}
              <div style={{ flex: 1, minWidth: 0, padding: '12px 14px', overflowY: 'auto' }}>
                {/* Top Control Strip: Order Type & Customer Lookup */}
                <div style={{ display: 'flex', gap: '12px', marginBottom: '14px', flexWrap: 'wrap', alignItems: 'center' }}>
                  {/* Order Type Switcher (F1/F2/F3) */}
                  <div style={{ display: 'flex', gap: '6px', flex: '0 0 auto' }}>
                    {[
                      { key: 'Dine-In', label: '🍽️ Dine-In (F1)' },
                      { key: 'Takeaway', label: '🥡 Takeaway (F2)' },
                      { key: 'Delivery', label: '🚚 Delivery (F3)' }
                    ].map((opt) => (
                      <button
                        key={opt.key}
                        onClick={() => {
                          setOrderType(opt.key);
                          if (opt.key !== 'Dine-In') setSelectedTable(null);
                        }}
                        style={{
                          padding: '8px 14px',
                          borderRadius: '8px',
                          border: '2px solid',
                          borderColor: orderType === opt.key ? '#fc4f1a' : '#cbd5e1',
                          backgroundColor: orderType === opt.key ? '#fff1ec' : '#ffffff',
                          color: orderType === opt.key ? '#c2410c' : '#475569',
                          fontSize: '12px',
                          fontWeight: 'bold',
                          cursor: 'pointer'
                        }}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
{/* Active Table Badge / Selector */}
                  {orderType === 'Dine-In' && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ fontSize: '12px', fontWeight: 'bold', color: '#475569' }}>Table:</span>
                      <select
                        value={selectedTable?._id || ''}
                        onChange={(e) => {
                          const tbl = tables.find(t => t._id === e.target.value);
                          setSelectedTable(tbl || null);
                        }}
                        style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px', fontWeight: 'bold', backgroundColor: '#fff', color: '#0f172a' }}
                      >
                        <option value="">-- Choose Table --</option>
                        {tables.map((t) => (
                          <option key={t._id} value={t._id}>
                            Table {t.tableNo || t.tableNumber} ({t.floor || 'Floor 1'}) - [{getTableDisplayStatus(t).toUpperCase()}]
                          </option>
                        ))}
                      </select>

                      {/* 📱 QR Button added right next to the table selector dropdown */}
                      {selectedTable && (
                        <button
                          onClick={() => setQrModalTable(selectedTable)}
                          style={{
                            padding: '8px 12px',
                            backgroundColor: '#0284c7',
                            color: '#fff',
                            border: 'none',
                            borderRadius: '8px',
                            cursor: 'pointer',
                            fontWeight: 'bold',
                            fontSize: '12px'
                          }}
                          title="View Selected Table QR"
                        >
                          📱 QR
                        </button>
                      )}
                    </div>
                  )}
                  {/* Customer Lookup (CRM) */}
                  <div style={{ display: 'flex', gap: '8px', flex: 1 }}>
                    <input
                      placeholder="Customer Name"
                      value={customerName}
                      onChange={(e) => setCustomerName(e.target.value)}
                      style={{ ...ui.inputField, flex: 1, padding: '8px 12px' }}
                    />
                    <input
                      placeholder="Customer Phone"
                      value={customerPhone}
                      onChange={(e) => setCustomerPhone(e.target.value)}
                      style={{ ...ui.inputField, width: '150px', padding: '8px 12px' }}
                    />
                    <input
                      placeholder="GSTIN (B2B)"
                      value={customerGstin}
                      onChange={(e) => {
                        const nextGstin = normalizeCustomerGstin(e.target.value).slice(0, 15);
                        setCustomerGstin(nextGstin);
                        const gstinStateCode = getGstinStateCode(nextGstin);
                        if (gstinStateCode) setPlaceOfSupply(gstinStateCode);
                      }}
                      maxLength={15}
                      title="GSTIN blank rakhein, ya exactly 15 alphanumeric characters enter karein"
                      style={{ ...ui.inputField, width: '150px', padding: '8px 12px', borderColor: customerGstin && !isValidCustomerGstin(customerGstin) ? '#dc2626' : undefined }}
                    />
                    <input
                      placeholder="State code"
                      value={placeOfSupply}
                      onChange={(e) => setPlaceOfSupply(e.target.value.replace(/\D/g, '').slice(0, 2))}
                      maxLength={2}
                      style={{ ...ui.inputField, width: '90px', padding: '8px 12px' }}
                    />
                    <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, whiteSpace: 'nowrap' }}>
                      <input type="checkbox" checked={isInterState} onChange={(e) => setIsInterState(e.target.checked)} />
                      IGST
                    </label>
                    <select
                      value={selectedWaiter}
                      onChange={(e) => setSelectedWaiter(e.target.value)}
                      style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '12px', fontWeight: 'bold', backgroundColor: '#fff', color: '#0f172a', minWidth: '100px' }}
                      title="Select Waiter"
                    >
                      {WAITERS_LIST.map(w => <option key={w} value={w}>👨‍🍳 {w}</option>)}
                    </select>
                  </div>
                </div>

                {orderType === 'Delivery' && (
                  <div style={{ marginBottom: '12px' }}>
                    <input
                      placeholder="Enter Delivery Address..."
                      value={deliveryAddress}
                      onChange={(e) => setDeliveryAddress(e.target.value)}
                      style={{ ...ui.inputField, width: '100%', boxSizing: 'border-box' }}
                    />
                  </div>
                )}

                {/* Filter Strip: Search (F4), Category Tabs, Veg */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '7px', marginBottom: '10px' }}>
                  <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                    <div style={{ flex: 1, position: 'relative' }}>
                      <input
                        ref={searchInputRef}
                        id="search-input"
                        placeholder="🔍 Search items by name or short code (e.g. PBM, ROTI) ... [F4]"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        style={{ ...ui.inputField, width: '100%', boxSizing: 'border-box', paddingLeft: '14px' }}
                      />
                    </div>
                    <button onClick={exportMenuCsv} type="button" style={{ padding: '7px 9px', border: '1px solid #cbd5e1', borderRadius: 7, background: '#fff', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>Export</button>
                    <label style={{ padding: '7px 9px', border: '1px solid #cbd5e1', borderRadius: 7, background: '#fff', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
                      Import
                      <input type="file" accept=".csv,text/csv" onChange={importMenuCsv} style={{ display: 'none' }} />
                    </label>

                    {/* Veg / Non-Veg Quick Toggles */}
                    <div style={{ display: 'flex', gap: '4px', backgroundColor: '#e2e8f0', padding: '3px', borderRadius: '8px' }}>
                      <button
                        onClick={() => setFoodTypeFilter('all')}
                        style={{
                          padding: '6px 10px',
                          borderRadius: '6px',
                          border: 'none',
                          fontSize: '11px',
                          fontWeight: 'bold',
                          cursor: 'pointer',
                          backgroundColor: foodTypeFilter === 'all' ? '#ffffff' : 'transparent',
                          color: foodTypeFilter === 'all' ? '#0f172a' : '#64748b'
                        }}
                      >
                        All
                      </button>
                      <button
                        onClick={() => setFoodTypeFilter('veg')}
                        style={{
                          padding: '6px 10px',
                          borderRadius: '6px',
                          border: 'none',
                          fontSize: '11px',
                          fontWeight: 'bold',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px',
                          backgroundColor: foodTypeFilter === 'veg' ? '#ffffff' : 'transparent',
                          color: '#16a34a'
                        }}
                      >
                        <VegNonVegBadge type="veg" size={12} /> Veg
                      </button>
                    </div>
                  </div>

                  {/* Category Pills */}
                  <div style={{ display: 'flex', gap: '6px', overflowX: 'auto', paddingBottom: '2px' }}>
                    {(selectedFloor === 'Birthday Party Zone' || selectedFloor === 'Floor 2'
                      ? ['All', ...floor2Categories]
                      : categories
                    ).map((cat) => (
                      <button
                        key={cat}
                        onClick={() => setActiveCategory(cat)}
                        style={activeCategory === cat ? ui.categoryBtnActive : ui.categoryBtn}
                      >
                        {cat}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Food Items Grid with Veg & Half/Full Portions */}
                <div style={{ ...ui.grid, gridTemplateColumns: 'repeat(auto-fill, minmax(128px, 1fr))', gap: '8px' }}>
                  {filteredMenu.length === 0 ? (
                    <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: '40px', color: '#94a3b8' }}>
                      No items matched your search. Clear the search or choose another category.
                    </div>
                  ) : (
                    filteredMenu.map((item) => {
                      const portion = portionSelection[item._id] || 'Full';
                      const currentPrice = portion === 'Half' ? getHalfPrice(item) : getEffectivePrice(item);
                      const isOutOfStock = item.isAvailable === false;

                      return (
                        <div
                          key={item._id}
                          onClick={() => {
                            setSelectedMenuItem(item);
                            setMenuItemModalQuantity(1);
                          }}
                          style={{
                            ...ui.menuCard,
                            opacity: isOutOfStock ? 0.45 : 1,
                            position: 'relative',
                            cursor: 'pointer'
                          }}
                        >
                          {isOutOfStock && (
                            <div style={{ position: 'absolute', top: '6px', left: '6px', backgroundColor: '#ef4444', color: '#fff', fontSize: '9px', fontWeight: 'bold', padding: '2px 6px', borderRadius: '4px', zIndex: 2 }}>
                              OUT OF STOCK
                            </div>
                          )}

                          <div style={{ position: 'relative' }}>
                            <img src={item.image || 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=300'} alt={item.name} style={ui.menuImg} />
                            <div style={{ position: 'absolute', top: '6px', right: '6px', zIndex: 1 }}>
                              <VegNonVegBadge type={item.foodType || 'veg'} size={15} />
                            </div>
                          </div>

                          <div style={{ padding: '8px', display: 'flex', flexDirection: 'column', flex: 1, justifyContent: 'space-between' }}>
                            <div>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span style={{ fontSize: '9px', fontWeight: 'bold', textTransform: 'uppercase', color: '#c2410c', backgroundColor: '#fff1ec', padding: '1px 5px', borderRadius: '3px' }}>
                                  {item.category || 'Item'}
                                </span>
                                {item.code && (
                                  <span style={{ fontSize: '9px', fontWeight: 'bold', color: '#64748b' }}>
                                    #{item.code}
                                  </span>
                                )}
                              </div>
                              <h4 style={{ margin: '4px 0 2px 0', fontSize: '13px', fontWeight: '600', color: '#0f172a', lineHeight: '1.2' }}>
                                {item.name}
                              </h4>
                            </div>

                            {/* Half / Full Portion Buttons */}
                            <div style={{ display: 'flex', gap: '4px', marginTop: '6px' }}>
                              {['Half', 'Full'].map((p) => {
                                const isSelected = portion === p;
                                return (
                                  <button
                                    key={p}
                                    type="button"
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      setPortionSelection((prev) => ({ ...prev, [item._id]: p }));
                                    }}
                                    style={{
                                      flex: 1,
                                      padding: '2px 4px',
                                      fontSize: '9px',
                                      fontWeight: 'bold',
                                      borderRadius: '4px',
                                      border: `1px solid ${isSelected ? '#fc4f1a' : '#cbd5e1'}`,
                                      backgroundColor: isSelected ? '#fff1ec' : '#ffffff',
                                      color: isSelected ? '#c2410c' : '#64748b',
                                      cursor: 'pointer'
                                    }}
                                  >
                                    {p === 'Half' ? `H ₹${getHalfPrice(item)}` : `F ₹${getEffectivePrice(item)}`}
                                  </button>
                                );
                              })}
                            </div>

                            {/* Price and Add Button */}
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '8px' }}>
                              <span style={{ fontSize: '14px', fontWeight: 'bold', color: '#0f172a' }}>
                                ₹{currentPrice}
                              </span>
                              <button
                                onClick={(event) => {
                                  event.stopPropagation();
                                  addToCart(item, portion);
                                }}
                                disabled={isOutOfStock}
                                style={{
                                  backgroundColor: isOutOfStock ? '#cbd5e1' : '#fc4f1a',
                                  color: '#fff',
                                  border: 'none',
                                  padding: '4px 10px',
                                  borderRadius: '5px',
                                  fontSize: '11px',
                                  fontWeight: 'bold',
                                  cursor: isOutOfStock ? 'not-allowed' : 'pointer'
                                }}
                              >
                                + Add
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              {selectedMenuItem && (
                <div
                  onClick={() => setSelectedMenuItem(null)}
                  style={{
                    position: 'fixed',
                    inset: 0,
                    zIndex: 10000,
                    background: 'rgba(15, 23, 42, 0.58)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: 20
                  }}
                >
                  <div
                    onClick={(event) => event.stopPropagation()}
                    style={{
                      width: 'min(420px, 94vw)',
                      background: '#fff',
                      borderRadius: 16,
                      overflow: 'hidden',
                      boxShadow: '0 20px 60px rgba(0,0,0,.25)'
                    }}
                  >
                    <div style={{ position: 'relative' }}>
                      <img src={selectedMenuItem.image} alt={selectedMenuItem.name} style={{ width: '100%', height: 210, objectFit: 'cover', display: 'block' }} />
                      <button onClick={() => setSelectedMenuItem(null)} style={{ position: 'absolute', top: 10, right: 10, width: 32, height: 32, border: 0, borderRadius: '50%', background: 'rgba(0,0,0,.65)', color: '#fff', fontSize: 18, cursor: 'pointer' }}>×</button>
                    </div>
                    <div style={{ padding: 20 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'start' }}>
                        <div>
                          <div style={{ fontSize: 11, color: '#c2410c', fontWeight: 800, textTransform: 'uppercase' }}>{selectedMenuItem.category || 'Item'}</div>
                          <h2 style={{ margin: '5px 0 4px', color: '#0f172a', fontSize: 22 }}>{selectedMenuItem.name}</h2>
                          <div style={{ color: '#64748b', fontSize: 13 }}>{selectedMenuItem.description || 'Freshly prepared at Tamanna Restaurant.'}</div>
                          {selectedMenuItem.isCombo && <div style={{ marginTop: 8, color: '#7c3aed', fontSize: 12, fontWeight: 700 }}>🍱 Combo Meal</div>}
                          {selectedMenuItem.seasonalTag && <div style={{ marginTop: 5, color: '#15803d', fontSize: 12, fontWeight: 700 }}>🌿 {selectedMenuItem.seasonalTag}</div>}
                          {selectedMenuItem.addons?.length > 0 && <div style={{ marginTop: 10, color: '#475569', fontSize: 12 }}>Add-ons: {selectedMenuItem.addons.map((addon) => typeof addon === 'string' ? addon : addon.name).join(', ')}</div>}
                        </div>
                        <VegNonVegBadge type={selectedMenuItem.foodType || 'veg'} size={18} />
                      </div>
                      <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
                        {['Half', 'Full'].map((p) => (
                          <button key={p} type="button" onClick={() => setPortionSelection((prev) => ({ ...prev, [selectedMenuItem._id]: p }))} style={{ flex: 1, padding: 10, borderRadius: 8, border: `1px solid ${(portionSelection[selectedMenuItem._id] || 'Full') === p ? '#fc4f1a' : '#cbd5e1'}`, background: (portionSelection[selectedMenuItem._id] || 'Full') === p ? '#fff1ec' : '#fff', color: '#334155', fontWeight: 700, cursor: 'pointer' }}>
                            {p} · ₹{p === 'Half' ? getHalfPrice(selectedMenuItem) : selectedMenuItem.price}
                          </button>
                        ))}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 18 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                          <button onClick={() => setMenuItemModalQuantity((value) => Math.max(1, value - 1))} style={{ width: 32, height: 32, border: '1px solid #cbd5e1', borderRadius: 7, background: '#fff', cursor: 'pointer' }}>−</button>
                          <strong>{menuItemModalQuantity}</strong>
                          <button onClick={() => setMenuItemModalQuantity((value) => value + 1)} style={{ width: 32, height: 32, border: '1px solid #cbd5e1', borderRadius: 7, background: '#fff', cursor: 'pointer' }}>+</button>
                        </div>
                        <strong style={{ fontSize: 20, color: '#0f172a' }}>₹{((portionSelection[selectedMenuItem._id] || 'Full') === 'Half' ? getHalfPrice(selectedMenuItem) : getEffectivePrice(selectedMenuItem)) * menuItemModalQuantity}</strong>
                      </div>
                      <button
                        disabled={selectedMenuItem.isAvailable === false}
                        onClick={() => {
                          const selectedPortion = portionSelection[selectedMenuItem._id] || 'Full';
                          for (let index = 0; index < menuItemModalQuantity; index += 1) addToCart(selectedMenuItem, selectedPortion);
                          setSelectedMenuItem(null);
                        }}
                        style={{ width: '100%', marginTop: 18, padding: 13, border: 0, borderRadius: 9, background: selectedMenuItem.isAvailable === false ? '#cbd5e1' : '#fc4f1a', color: '#fff', fontWeight: 800, fontSize: 14, cursor: selectedMenuItem.isAvailable === false ? 'not-allowed' : 'pointer' }}
                      >
                        {selectedMenuItem.isAvailable === false ? 'Out of Stock' : 'Add to Cart'}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Right Panel: Tamanna  Bill Ticket & KOT Cart */}
              <div style={ui.cartSidebar}>
                <div>
                  {/* Cart Header */}
                  <div style={{ borderBottom: '1px solid #e2e8f0', paddingBottom: '10px', marginBottom: '10px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 'bold', color: '#0f172a' }}>
                        Order Ticket
                      </h3>
                      <span style={{ fontSize: '11px', fontWeight: 'bold', color: '#c2410c', backgroundColor: '#fff1ec', padding: '2px 8px', borderRadius: '10px' }}>
                        {orderType}
                      </span>
                    </div>

                    {orderType === 'Dine-In' && (
                      <div style={{ marginTop: '4px', fontSize: '12px', color: getTableDisplayStatus(selectedTable) === 'occupied' ? '#ef4444' : '#0d9f5f', fontWeight: 'bold' }}>
                        {selectedTable ? `Table: ${selectedTable.tableNo || selectedTable.tableNumber} (${getTableDisplayStatus(selectedTable).toUpperCase()})` : '⚠️ Please select a table'}
                      </div>
                    )}

                    {/* Live Kitchen Status Badge for the current running order */}
                    {orderType === 'Dine-In' && currentRunningOrder && (
                      <div style={{ marginTop: '6px' }}>
                        <span style={{
                          fontSize: '10px',
                          fontWeight: 'bold',
                          padding: '3px 10px',
                          borderRadius: '10px',
                          backgroundColor: currentRunningOrder.orderStatus === 'ready' ? '#dcfce7' : currentRunningOrder.orderStatus === 'preparing' ? '#ffedd5' : '#fef3c7',
                          color: currentRunningOrder.orderStatus === 'ready' ? '#166534' : currentRunningOrder.orderStatus === 'preparing' ? '#c2410c' : '#92400e'
                        }}>
                          👨‍🍳 Kitchen Status: {(currentRunningOrder.orderStatus || 'placed').toUpperCase()}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* 🎉 Floor 2 Celebration / Event Section */}
                  {orderType === 'Dine-In' && selectedTable?.floor === 'Floor 2' && (
                    <div style={{
                      background: 'linear-gradient(135deg, #fff7f2 0%, #fff1ec 100%)',
                      border: '2px solid #ffd3bd',
                      borderRadius: '10px',
                      padding: '12px',
                      marginBottom: '10px'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
                        <span style={{ fontSize: '18px' }}>🎉</span>
                        <span style={{ fontSize: '13px', fontWeight: 'bold', color: '#c2410c' }}>Celebration / Event Details</span>
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        <select
                          value={celebrationOccasion}
                          onChange={(e) => setCelebrationOccasion(e.target.value)}
                          style={{
                            padding: '8px 10px',
                            borderRadius: '8px',
                            border: '1.5px solid #ffd3bd',
                            backgroundColor: '#fff',
                            fontSize: '12px',
                            fontWeight: 'bold',
                            color: '#7c2d12',
                            cursor: 'pointer'
                          }}
                        >
                          <option value="Birthday Party">🎂 Birthday Party</option>
                          <option value="Anniversary Celebration">💑 Anniversary Celebration</option>
                          <option value="Kitty / Family Party">👨‍👩‍👧‍👦 Kitty / Family Party</option>
                          <option value="Special Celebration">✨ Special Celebration</option>
                          <option value="Get-Together">🤝 Get-Together</option>
                          <option value="Corporate Event">🏢 Corporate Event</option>
                          <option value="Engagement">💍 Engagement</option>
                          <option value="Baby Shower">👶 Baby Shower</option>
                        </select>

                        <input
                          placeholder="Celebrant Name (e.g. Aarav, Priya...)"
                          value={celebrantName}
                          onChange={(e) => setCelebrantName(e.target.value)}
                          style={{
                            padding: '8px 10px',
                            borderRadius: '8px',
                            border: '1.5px solid #ffd3bd',
                            backgroundColor: '#fff',
                            fontSize: '12px',
                            color: '#0f172a'
                          }}
                        />
                      </div>

                      {celebrantName && (
                        <div style={{
                          marginTop: '8px',
                          padding: '6px 10px',
                          background: 'linear-gradient(90deg, #fc4f1a, #ff7a45)',
                          borderRadius: '6px',
                          color: '#fff',
                          fontSize: '11px',
                          fontWeight: 'bold',
                          textAlign: 'center'
                        }}>
                          🎊 {celebrationOccasion} — {celebrantName}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Section 1: Running KOT items already sent to kitchen */}
                  {currentRunningOrder && (currentRunningOrder.items || []).length > 0 && (
                    <div style={{ marginBottom: '12px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#eff6ff', padding: '4px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 'bold', color: '#1e40af', marginBottom: '6px' }}>
                        <span>🍳 Kitchen Running KOTs ({currentRunningOrder.items.length})</span>
                        <span>₹{currentRunningOrder.subTotal?.toFixed(2) || '0'}</span>
                      </div>
                      <div style={{ maxHeight: '18vh', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        {currentRunningOrder.items.map((it, idx) => (
                          <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '11px', padding: '4px 6px', backgroundColor: '#f8fafc', borderRadius: '4px', border: '1px solid #e2e8f0' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                              <VegNonVegBadge type={it.foodType || 'veg'} size={11} />
                              <span style={{ color: '#0f172a', fontWeight: '500' }}>
                                {it.name} {it.portion === 'Half' ? '(H)' : ''} x{it.quantity}
                              </span>
                            </div>
                            <span style={{ fontWeight: 'bold', color: '#0f172a' }}>
                              ₹{(it.price * it.quantity).toFixed(2)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Section 2: New items to punch in this session */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                    <span style={{ fontSize: '11px', fontWeight: 'bold', color: '#475569', textTransform: 'uppercase' }}>
                      {currentRunningOrder ? '➕ New Items to Punch (KOT)' : '🛒 Current Cart'}
                    </span>
                    {cart.length > 0 && (
                      <button onClick={() => setCart([])} style={{ border: 'none', background: 'transparent', color: '#ef4444', fontSize: '11px', cursor: 'pointer' }}>
                        Clear
                      </button>
                    )}
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '28vh', overflowY: 'auto' }}>
                    {cart.length === 0 ? (
                      <div style={{ textAlign: 'center', padding: '24px 10px', color: '#94a3b8', fontSize: '12px' }}>
                        <span>🍽️</span>
                        <p style={{ margin: '4px 0 0 0' }}>Cart is empty. Click + Add on items</p>
                      </div>
                    ) : (
                      cart.map((item) => (
                        <div key={item._id} style={{ display: 'flex', flexDirection: 'column', padding: '8px', backgroundColor: '#ffffff', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <VegNonVegBadge type={item.foodType || 'veg'} size={12} />
                              <span style={{ fontSize: '12px', fontWeight: '600', color: '#0f172a' }}>{item.name}</span>
                            </div>
                            <button onClick={() => removeFromCart(item._id)} style={{ border: 'none', background: 'transparent', color: '#ef4444', cursor: 'pointer', fontSize: '12px' }}>
                              ✕
                            </button>
                          </div>

                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '6px' }}>
                            {/* Note button */}
                            <button
                              onClick={() => setModifierModalItem(item)}
                              style={{
                                border: '1px dashed #cbd5e1',
                                background: item.notes ? '#fff1ec' : '#f8fafc',
                                color: item.notes ? '#c2410c' : '#64748b',
                                padding: '2px 6px',
                                borderRadius: '4px',
                                fontSize: '10px',
                                cursor: 'pointer'
                              }}
                            >
                              {item.notes ? `📝 "${item.notes}"` : '+ Note'}
                            </button>

                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <button onClick={() => updateCartQuantity(item._id, -1)} style={ui.qtyBtn}>-</button>
                              <span style={{ fontSize: '12px', fontWeight: 'bold' }}>{item.quantity}</span>
                              <button onClick={() => updateCartQuantity(item._id, 1)} style={ui.qtyBtn}>+</button>
                            </div>

                            <span style={{ fontSize: '13px', fontWeight: 'bold', color: '#0f172a' }}>
                              ₹{(item.price * item.quantity).toFixed(2)}
                            </span>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* Cart Footer: Bill Summary & quick action buttons */}
                <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: '10px', marginTop: '10px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                    <label style={{ fontSize: '11px', color: '#64748b' }}>Discount (%):</label>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      value={discount}
                      onChange={(e) => setDiscount(Math.min(100, Math.max(0, Number(e.target.value))))}
                      style={{ ...ui.inputField, width: '55px', padding: '3px 6px', textAlign: 'right', fontSize: '12px' }}
                    />
                  </div>

                  <div style={{ backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '8px', marginBottom: '10px' }}>
                    <div style={{ fontSize: '11px', fontWeight: 'bold', color: '#475569', marginBottom: '8px', textTransform: 'uppercase' }}>
                      ⚙️ Advanced Billing Controls
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                      <label style={{ fontSize: '10px', color: '#64748b' }}>
                        GST %
                        <input type="number" value={gstRate} onChange={(e) => setGstRate(Math.max(0, Number(e.target.value) || 0))} style={{ ...ui.inputField, width: '100%', marginTop: '2px', fontSize: '11px' }} />
                      </label>
                      <label style={{ fontSize: '10px', color: '#64748b' }}>
                        Service %
                        <input type="number" value={serviceCharge} onChange={(e) => setServiceCharge(Math.max(0, Number(e.target.value) || 0))} style={{ ...ui.inputField, width: '100%', marginTop: '2px', fontSize: '11px' }} />
                      </label>
                      <label style={{ fontSize: '10px', color: '#64748b' }}>
                        Comp Disc
                        <input type="number" value={compDiscount} onChange={(e) => setCompDiscount(Math.max(0, Number(e.target.value) || 0))} style={{ ...ui.inputField, width: '100%', marginTop: '2px', fontSize: '11px' }} />
                      </label>
                      <label style={{ fontSize: '10px', color: '#64748b' }}>
                        Round Off
                        <input type="number" value={roundOff} onChange={(e) => setRoundOff(Number(e.target.value) || 0)} style={{ ...ui.inputField, width: '100%', marginTop: '2px', fontSize: '11px' }} />
                      </label>
                      <label style={{ fontSize: '10px', color: '#64748b' }}>
                        Custom Disc
                        <input type="number" value={customDiscount} onChange={(e) => setCustomDiscount(Math.max(0, Number(e.target.value) || 0))} style={{ ...ui.inputField, width: '100%', marginTop: '2px', fontSize: '11px' }} />
                      </label>
                      <label style={{ fontSize: '10px', color: '#64748b' }}>
                        Partial Pay
                        <input type="number" value={partialPayment} onChange={(e) => setPartialPayment(Math.max(0, Number(e.target.value) || 0))} style={{ ...ui.inputField, width: '100%', marginTop: '2px', fontSize: '11px' }} />
                      </label>
                    </div>

                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '8px' }}>
                      <button onClick={handleHoldBill} style={{ flex: 1, background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: '6px', padding: '6px 8px', fontSize: '10px', fontWeight: 'bold', cursor: 'pointer' }}>
                        🧾 Hold Bill
                      </button>
                      <button onClick={() => {
                        const nextTableId = tables.find((table) => table._id !== selectedTable?._id)?._id || '';
                        setSelectedMergeTableId(nextTableId);
                      }} style={{ flex: 1, background: '#eef2ff', border: '1px solid #c7d2fe', borderRadius: '6px', padding: '6px 8px', fontSize: '10px', fontWeight: 'bold', cursor: 'pointer' }}>
                        🔀 Merge Table
                      </button>
                    </div>

                    <div style={{ display: 'flex', gap: '6px', alignItems: 'center', marginTop: '8px' }}>
                      <select value={selectedMergeTableId} onChange={(e) => setSelectedMergeTableId(e.target.value)} style={{ flex: 1, padding: '6px 8px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '11px', background: '#fff' }}>
                        <option value="">Select table to merge</option>
                        {tables.filter((t) => t._id !== selectedTable?._id).map((table) => (
                          <option key={table._id} value={table._id}>{table.tableNo || table.tableNumber}</option>
                        ))}
                      </select>
                      <button onClick={handleMergeTables} style={{ background: '#10b981', color: '#fff', border: 'none', borderRadius: '6px', padding: '6px 10px', fontSize: '10px', fontWeight: 'bold', cursor: 'pointer' }}>
                        Merge
                      </button>
                    </div>

                    <div style={{ marginTop: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '6px' }}>
                      <span style={{ fontSize: '10px', color: '#64748b' }}>Split Bill</span>
                      <select value={splitBillCount} onChange={(e) => setSplitBillCount(Number(e.target.value))} style={{ padding: '4px 6px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '10px', background: '#fff' }}>
                        {[2, 3, 4, 5, 6].map((count) => <option key={count} value={count}>{count} Ways</option>)}
                      </select>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', marginTop: '6px' }}>
                      {splitBillPreview.map((share) => (
                        <div key={share.index} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: '#475569' }}>
                          <span>Share {share.index}</span>
                          <span>₹{share.amount.toFixed(2)}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div style={ui.billRow}><span>Subtotal</span><span>₹{subTotal.toFixed(2)}</span></div>
                  {discount > 0 && (
                    <div style={ui.billRow}><span>Discount ({discount}%)</span><span>-₹{discountAmt.toFixed(2)}</span></div>
                  )}
                  {customDiscount > 0 && (
                    <div style={ui.billRow}><span>Custom Discount</span><span>-₹{Number(customDiscount || 0).toFixed(2)}</span></div>
                  )}
                  {serviceCharge > 0 && (
                    <div style={ui.billRow}><span>Service Charge</span><span>₹{serviceChargeAmt.toFixed(2)}</span></div>
                  )}
                  <div style={ui.billRow}><span>CGST ({(gstRate / 2).toFixed(1)}%)</span><span>₹{cgst.toFixed(2)}</span></div>
                  <div style={ui.billRow}><span>SGST ({(gstRate / 2).toFixed(1)}%)</span><span>₹{sgst.toFixed(2)}</span></div>
                  {roundOff !== 0 && (
                    <div style={ui.billRow}><span>Round Off</span><span>{roundOff >= 0 ? '+' : '-'}₹{Math.abs(roundOff).toFixed(2)}</span></div>
                  )}
                  {compDiscount > 0 && (
                    <div style={ui.billRow}><span>Comp Discount</span><span>-₹{compDiscountAmount.toFixed(2)}</span></div>
                  )}
                  {partialPayment > 0 && (
                    <div style={ui.billRow}><span>Partial Payment</span><span>-₹{partialPayment.toFixed(2)}</span></div>
                  )}
                  <div style={{ ...ui.billRow, fontSize: '16px', fontWeight: 'bold', color: '#0f172a', borderTop: '1px solid #e2e8f0', paddingTop: '6px', margin: '4px 0 8px 0' }}>
                    <span>Grand Total</span><span>₹{grandTotal.toFixed(2)}</span>
                  </div>
                  {partialPayment > 0 && (
                    <div style={{ ...ui.billRow, color: '#b91c1c', fontWeight: 'bold' }}>
                      <span>Balance Due</span><span>₹{remainingBalance.toFixed(2)}</span>
                    </div>
                  )}

                  {/* Saved Bills */}
                  {savedBills.length > 0 && (
                    <div style={{ marginTop: '8px', padding: '8px', backgroundColor: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                      <div style={{ fontSize: '10px', fontWeight: 'bold', color: '#475569', marginBottom: '6px', textTransform: 'uppercase' }}>
                        Saved Bills
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        {savedBills.slice(0, 3).map((bill) => (
                          <button key={bill.id} onClick={() => handleRestoreSavedBill(bill)} style={{ border: '1px solid #cbd5e1', backgroundColor: '#fff', borderRadius: '6px', padding: '6px 8px', textAlign: 'left', cursor: 'pointer', fontSize: '10px', color: '#0f172a' }}>
                            {bill.title} · ₹{Number(bill.total || 0).toFixed(2)}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Tamanna Actions: Save & Print KOT (F8), Print Bill, Settle (F9) */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {orderType === 'Dine-In' ? (
                      <>
                        {/* Save KOT */}
                        <button
                          onClick={() => handlePunchKOT(false)}
                          disabled={cart.length === 0 || !selectedTable}
                          style={{
                            ...ui.orderBtn,
                            backgroundColor: '#fc4f1a',
                            opacity: (cart.length === 0 || !selectedTable) ? 0.5 : 1,
                            cursor: (cart.length === 0 || !selectedTable) ? 'not-allowed' : 'pointer'
                          }}
                        >
                          🧾 Save KOT (F8)
                        </button>

                        <button
                          onClick={handlePrintKOT}
                          disabled={cart.length === 0 && !currentRunningOrder}
                          style={{
                            ...ui.orderBtn,
                            backgroundColor: '#1d4ed8',
                            opacity: (cart.length === 0 && !currentRunningOrder) ? 0.5 : 1,
                            cursor: (cart.length === 0 && !currentRunningOrder) ? 'not-allowed' : 'pointer'
                          }}
                        >
                          🖨️ Print KOT
                        </button>

                        <div style={{ display: 'flex', gap: '6px' }}>
                          {/* Print Bill / Estimate */}
                          <button
                            onClick={() => {
                              if (!currentRunningOrder || !isOrderReadyToSettle) {
                                alert('⚠️ The final bill can be printed only after settlement. Mark the order as Ready in the kitchen, then settle the bill.');
                                return;
                              }
                              handlePrintProvisionalBill();
                            }}
                            disabled={!currentRunningOrder || !isOrderReadyToSettle}
                            style={{
                              flex: 1,
                              padding: '8px',
                              backgroundColor: '#2563eb',
                              color: '#fff',
                              border: 'none',
                              borderRadius: '6px',
                              fontWeight: 'bold',
                              fontSize: '12px',
                              cursor: (!currentRunningOrder || !isOrderReadyToSettle) ? 'not-allowed' : 'pointer',
                              opacity: (!currentRunningOrder || !isOrderReadyToSettle) ? 0.5 : 1
                            }}
                            title={!currentRunningOrder || !isOrderReadyToSettle ? 'Bill settle karne ke baad hi print hoga' : 'Bill print karne ke liye ready'}
                          >
                            🧾 Print Bill
                          </button>

                          {/* Settle & Pay — only enabled once Kitchen (KDS) marks order as Ready */}
                          <button
                            onClick={handleOpenSettleCurrent}
                            disabled={!isOrderReadyToSettle}
                            title={currentRunningOrder && !isOrderReadyToSettle ? 'Wait for the kitchen to mark the order Ready' : ''}
                            style={{
                              flex: 1,
                              padding: '8px',
                              backgroundColor: '#0d9f5f',
                              color: '#fff',
                              border: 'none',
                              borderRadius: '6px',
                              fontWeight: 'bold',
                              fontSize: '12px',
                              cursor: !isOrderReadyToSettle ? 'not-allowed' : 'pointer',
                              opacity: !isOrderReadyToSettle ? 0.5 : 1
                            }}
                          >
                            💳 Settle (F9)
                          </button>
                        </div>

                        {/* Helper note explaining why Settle is locked */}
                        {currentRunningOrder && !isOrderReadyToSettle && (
                          <div style={{ fontSize: '10px', color: '#b45309', textAlign: 'center', backgroundColor: '#fffbeb', border: '1px solid #fde68a', borderRadius: '6px', padding: '5px 8px' }}>
                            ⏳ Order is in the kitchen ({(currentRunningOrder.orderStatus || 'placed').toUpperCase()}). Settlement will be enabled after KDS marks it Ready to Serve.
                          </div>
                        )}
                      </>
                    ) : (
                      <>
                        <div style={{ display: 'flex', gap: '6px' }}>
                          <button
                            onClick={() => handlePlaceOrderDirect('bill')}
                            disabled={cart.length === 0}
                            style={{
                              flex: 1,
                              padding: '8px',
                              backgroundColor: '#2563eb',
                              color: '#fff',
                              border: 'none',
                              borderRadius: '6px',
                              fontWeight: 'bold',
                              fontSize: '12px',
                              cursor: cart.length === 0 ? 'not-allowed' : 'pointer',
                              opacity: cart.length === 0 ? 0.5 : 1
                            }}
                          >
                            🧾 Place Order & Print Bill
                          </button>

                          <button
                            onClick={() => handlePlaceOrderDirect('kitchen')}
                            disabled={cart.length === 0}
                            title="Send the order to the kitchen. Settle it from Payments/KDS after it is Ready."
                            style={{
                              flex: 1,
                              padding: '8px',
                              backgroundColor: '#fc4f1a',
                              color: '#fff',
                              border: 'none',
                              borderRadius: '6px',
                              fontWeight: 'bold',
                              fontSize: '12px',
                              cursor: cart.length === 0 ? 'not-allowed' : 'pointer',
                              opacity: cart.length === 0 ? 0.5 : 1
                            }}
                          >
                            👨‍🍳 Send to Kitchen
                          </button>
                        </div>
                        <div style={{ fontSize: '10px', color: '#64748b', textAlign: 'center' }}>
                          ℹ️ Takeaway/Delivery bhi kitchen se "Ready" hone ke baad hi Payments tab ya KDS se Settle hoga.
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

       {/* ================================================================= */}
   {/* TAB 3: KITCHEN DISPLAY SYSTEM (KDS) & ORDERS                      */}
   {/* ================================================================= */}
   {activeTab === 'kot' && (
     <div style={{ padding: '20px', flex: 1, overflowY: 'auto', backgroundColor: '#f8fafc' }}>
       <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '10px' }}>
         <div>
           <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 'bold', color: '#0f172a' }}>
             👨‍🍳 Kitchen Display System (KDS) - Advanced
           </h2>
           <p style={{ margin: '2px 0 0 0', fontSize: '12px', color: '#64748b' }}>
             Live kitchen tickets with item-level tracking, VIP priority & delay alerts.
           </p>
         </div>
         <button
           onClick={loadInitialData}
           style={{ padding: '8px 14px', backgroundColor: '#fc4f1a', color: '#fff', border: 'none', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer', fontSize: '12px' }}
         >
           🔄 Refresh
         </button>
       </div>

       {/* ---- Status Filter Tabs ---- */}
       <div style={{ display: 'flex', gap: '8px', marginBottom: '12px', flexWrap: 'wrap' }}>
         {['all', 'placed', 'preparing', 'ready', 'completed'].map((st) => {
           const count = st === 'all'
             ? orders.filter(o => o.orderStatus !== 'cancelled').length
             : orders.filter(o => o.orderStatus === st).length;
           const isActive = kdsStatusFilter === st;
           const labelMap = { all: '🔥 Active', placed: '🆕 Placed', preparing: '🍳 Preparing', ready: '✅ Ready', completed: '💳 Completed' };
           return (
             <button
               key={st}
               onClick={() => setKdsStatusFilter(st)}
               style={{
                 padding: '8px 14px',
                 borderRadius: '20px',
                 border: isActive ? '2px solid #fc4f1a' : '1px solid #e2e8f0',
                 backgroundColor: isActive ? '#fff7ed' : '#ffffff',
                 color: isActive ? '#fc4f1a' : '#475569',
                 fontWeight: 'bold',
                 fontSize: '12px',
                 cursor: 'pointer',
                 display: 'flex',
                 alignItems: 'center',
                 gap: '6px'
               }}
             >
               {labelMap[st]}
               <span style={{
                 backgroundColor: isActive ? '#fc4f1a' : '#e2e8f0',
                 color: isActive ? '#fff' : '#475569',
                 borderRadius: '10px',
                 padding: '1px 7px',
                 fontSize: '11px'
               }}>
                 {count}
               </span>
             </button>
           );
         })}
       </div>

       {/* ---- Search Bar ---- */}
       <div style={{ marginBottom: '16px' }}>
         <input
           type="text"
           value={kdsSearchTerm}
           onChange={(e) => setKdsSearchTerm(e.target.value)}
           placeholder="🔍 Search by table no, item name, KOT number, waiter..."
           style={{
             width: '100%',
             padding: '10px 14px',
             borderRadius: '8px',
             border: '1px solid #e2e8f0',
             fontSize: '13px',
             outline: 'none',
             boxSizing: 'border-box'
           }}
         />
       </div>

       {/* Kitchen Tickets Grid */}
       <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '14px' }}>
         {orders
           .filter(o => o.orderStatus !== 'cancelled')
           .filter(o => kdsStatusFilter === 'all' ? o.orderStatus !== 'completed' : o.orderStatus === kdsStatusFilter)
           .filter(o => {
             if (!kdsSearchTerm.trim()) return true;
             const term = kdsSearchTerm.toLowerCase();
             const tableStr = String(o.tableId?.tableNo || o.tableId?.tableNumber || o.orderType || '').toLowerCase();
             const kotStr = String(o.kotNumber || '').toLowerCase();
             const waiterStr = String(o.waiterName || '').toLowerCase();
             const itemsMatch = (o.items || []).some(it => (it.name || '').toLowerCase().includes(term));
             return tableStr.includes(term) || kotStr.includes(term) || waiterStr.includes(term) || itemsMatch;
           })
           .map((ord) => {
             const elapsedMin = ord.createdAt ? Math.max(0, Math.floor((Date.now() - new Date(ord.createdAt).getTime()) / 60000)) : 0;
             const kitchenOrderMeta = kitchenMeta[ord._id] || {};
             const itemStates = kitchenOrderMeta.itemStates || {};
             const orderPriority = kitchenOrderMeta.priority || ord.priority || 'Normal';
             const assignedChef = kitchenOrderMeta.chef || chefRoster[0];
             const isDelayed = elapsedMin > 20 || (kitchenOrderMeta.delayAlert && elapsedMin > 15);
             const isModerate = elapsedMin > 10;
             const isVip = orderPriority === 'VIP' || orderPriority === 'Urgent';
             const timeColor = isDelayed ? '#ef4444' : isModerate ? '#fc4f1a' : '#0d9f5f';
             const startedAt = kitchenOrderMeta.startedAt || ord.createdAt;
             const readyAt = kitchenOrderMeta.readyAt || null;

             return (
               <div
                 key={ord._id}
                 style={{
                   backgroundColor: '#ffffff',
                   borderRadius: '10px',
                   border: isVip ? '2px solid #e53935' : `2px solid ${timeColor}`,
                   boxShadow: isVip ? '0 4px 12px rgba(229, 57, 53, 0.2)' : '0 2px 8px rgba(0,0,0,0.06)',
                   overflow: 'hidden',
                   display: 'flex',
                   flexDirection: 'column',
                   justifyContent: 'space-between'
                 }}
               >
                 <div
                   onClick={() => setKdsHistoryOrder(ord)}
                   title="Click to view status history"
                   style={{ padding: '10px 14px', backgroundColor: isVip ? '#ffebee' : isDelayed ? '#fef2f2' : '#f8fafc', borderBottom: '1px solid #e2e8f0', cursor: 'pointer' }}
                 >
                   <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
                     <div>
                       <span style={{ fontWeight: 'bold', fontSize: '14px', color: '#0f172a' }}>
                         {ord.tableId ? `Table ${ord.tableId.tableNo || ord.tableId.tableNumber}` : ord.orderType}
                       </span>
                       <span style={{ fontSize: '11px', color: '#64748b', marginLeft: '6px' }}>
                         (KOT #{ord.kotNumber || 1})
                       </span>
                       {isVip && (
                         <span style={{ backgroundColor: '#c62828', color: '#fff', fontSize: '9px', padding: '1px 5px', borderRadius: '3px', marginLeft: '6px', fontWeight: 'bold' }}>
                           🔥 {orderPriority}
                         </span>
                       )}
                     </div>
                     <span style={{ fontSize: '11px', fontWeight: 'bold', color: timeColor }}>
                       ⏱️ {elapsedMin} min
                     </span>
                   </div>

                   <div style={{ marginTop: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '6px' }}>
                     <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                       <span style={{ backgroundColor: '#e0f2fe', color: '#0369a1', borderRadius: '999px', padding: '3px 8px', fontSize: '10px', fontWeight: 'bold' }}>
                         👨‍🍳 {assignedChef}
                       </span>
                       <span style={{ backgroundColor: '#ecfdf5', color: '#047857', borderRadius: '999px', padding: '3px 8px', fontSize: '10px', fontWeight: 'bold' }}>
                         Started: {startedAt ? new Date(startedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}
                       </span>
                       {readyAt && (
                         <span style={{ backgroundColor: '#dcfce7', color: '#166534', borderRadius: '999px', padding: '3px 8px', fontSize: '10px', fontWeight: 'bold' }}>
                           Ready: {new Date(readyAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                         </span>
                       )}
                     </div>
                     <select
                       value={orderPriority}
                       onClick={(e) => e.stopPropagation()}
                       onChange={(e) => setKitchenPriority(ord._id, e.target.value)}
                       style={{ border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '11px', padding: '4px 8px', background: '#fff' }}
                     >
                       <option value="Normal">Normal</option>
                       <option value="Priority">Priority</option>
                       <option value="Urgent">Urgent</option>
                       <option value="VIP">VIP</option>
                     </select>
                   </div>

                   {(isDelayed || kitchenOrderMeta.delayAlert) && (
                     <div style={{ marginTop: '8px', backgroundColor: '#fee2e2', color: '#b91c1c', border: '1px solid #fecaca', padding: '6px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: 'bold' }}>
                       ⚠️ Delay alert: Kitchen order is running beyond expected timing.
                     </div>
                   )}
                 </div>

                 <div style={{ padding: '12px 14px', flex: 1 }}>
                   <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                     {(ord.items || []).map((it, idx) => {
                       const state = itemStates[String(it.itemId || `${it.name}-${idx}`)] || {};
                       const itemStatus = state.status || 'queued';
                       const itemChef = state.chef || assignedChef;

                       return (
                         <div key={idx} style={{ borderBottom: '1px dashed #e2e8f0', paddingBottom: '6px' }}>
                           <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                             <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                               <VegNonVegBadge type={it.foodType || 'veg'} size={12} />
                               <span style={{ fontSize: '13px', fontWeight: 'bold', color: '#0f172a' }}>
                                 {it.name} {it.portion === 'Half' ? '(H)' : ''}
                               </span>
                             </div>
                             <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                               <button
                                 onClick={() => setSelectedRecipe({ name: it.name, itemId: it.itemId })}
                                 title="View Recipe / Ingredients"
                                 style={{ background: '#e0f2fe', color: '#0369a1', border: 'none', padding: '2px 6px', borderRadius: '4px', fontSize: '10px', cursor: 'pointer', fontWeight: 'bold' }}
                               >
                                 📖 Recipe
                               </button>
                               <span style={{ fontSize: '14px', fontWeight: 'bold', color: '#2563eb' }}>
                                 x{it.quantity}
                               </span>
                             </div>
                           </div>
                           {it.notes && (
                             <div style={{ fontSize: '11px', color: '#b91c1c', fontStyle: 'italic', marginTop: '2px' }}>
                               👉 Note: {it.notes}
                             </div>
                           )}
                           <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '5px', gap: '6px', flexWrap: 'wrap' }}>
                             <span style={{ backgroundColor: itemStatus === 'ready' ? '#dcfce7' : itemStatus === 'preparing' ? '#fef3c7' : '#e2e8f0', color: itemStatus === 'ready' ? '#166534' : itemStatus === 'preparing' ? '#92400e' : '#475569', borderRadius: '999px', padding: '2px 7px', fontSize: '10px', fontWeight: 'bold', textTransform: 'capitalize' }}>
                               {itemStatus}
                             </span>
                             <span style={{ fontSize: '10px', color: '#64748b' }}>
                               Chef: {itemChef}
                             </span>
                           </div>
                           <div style={{ display: 'flex', gap: '5px', marginTop: '6px' }}>
                             <button
                               onClick={() => handleItemLevelStatusUpdate && handleItemLevelStatusUpdate(ord._id, ord.kotNumber, it.itemId || `${it.name}-${idx}`, 'preparing', assignedChef)}
                               style={{ background: '#ffb74d', color: '#fff', border: 'none', padding: '2px 6px', fontSize: '10px', borderRadius: '3px', cursor: 'pointer', fontWeight: 'bold' }}
                             >
                               🍳 Prep Item
                             </button>
                             <button
                               onClick={() => handleItemLevelStatusUpdate && handleItemLevelStatusUpdate(ord._id, ord.kotNumber, it.itemId || `${it.name}-${idx}`, 'ready', assignedChef)}
                               style={{ background: '#66bb6a', color: '#fff', border: 'none', padding: '2px 6px', fontSize: '10px', borderRadius: '3px', cursor: 'pointer', fontWeight: 'bold' }}
                             >
                               ✅ Ready Item
                             </button>
                             <select
                               onClick={(e) => e.stopPropagation()}
                               onChange={(e) => handleItemLevelStatusUpdate && handleItemLevelStatusUpdate(ord._id, ord.kotNumber, it.itemId || `${it.name}-${idx}`, e.target.value, assignedChef)}
                               value={itemStatus}
                               style={{ border: '1px solid #cbd5e1', borderRadius: '3px', fontSize: '10px', padding: '2px 5px', background: '#fff' }}
                             >
                               <option value="queued">Queued</option>
                               <option value="preparing">Preparing</option>
                               <option value="ready">Ready</option>
                             </select>
                           </div>
                         </div>
                       );
                     })}
                   </div>
                 </div>

                 <div style={{ padding: '10px 14px', backgroundColor: '#f8fafc', borderTop: '1px solid #e2e8f0', display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                   {ord.orderStatus === 'placed' && (
                     <button
                       onClick={() => handleKitchenStatusUpdate(ord, 'preparing')}
                       style={{ flex: 1, padding: '8px', backgroundColor: '#fc4f1a', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '11px', fontWeight: 'bold', cursor: 'pointer' }}
                     >
                       🍳 Start Cooking
                     </button>
                   )}
                   {(ord.orderStatus === 'placed' || ord.orderStatus === 'preparing') && (
                     <button
                       onClick={() => handleKitchenStatusUpdate(ord, 'ready')}
                       style={{ flex: 1, padding: '8px', backgroundColor: '#0d9f5f', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '11px', fontWeight: 'bold', cursor: 'pointer' }}
                     >
                       ✅ Ready to Serve
                     </button>
                   )}
                   {ord.orderStatus === 'ready' && (
                     <button
                       onClick={() => handleKitchenStatusUpdate(ord, 'completed')}
                       style={{ flex: 1, padding: '8px', backgroundColor: '#3b82f6', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '11px', fontWeight: 'bold', cursor: 'pointer' }}
                     >
                       💳 Settle Bill
                     </button>
                   )}
                   <button
                     onClick={() => expediteOrder(ord._id)}
                     style={{ padding: '8px 10px', backgroundColor: '#fef2f2', color: '#b91c1c', border: '1px solid #fecaca', borderRadius: '6px', fontSize: '11px', fontWeight: 'bold', cursor: 'pointer' }}
                   >
                     🚨 Expedite
                   </button>
                   <button
                     onClick={() => setKdsHistoryOrder(ord)}
                     title="View Status History"
                     style={{ padding: '8px 10px', backgroundColor: '#f1f5f9', color: '#0f172a', border: 'none', borderRadius: '6px', fontSize: '11px', cursor: 'pointer' }}
                   >
                     🕘
                   </button>
                   <button
                     onClick={() => {
                       setKotPrintData({
                         kotNumber: ord.kotNumber || 1,
                         tableNo: ord.tableId?.tableNo || ord.tableId?.tableNumber || ord.orderType,
                         waiterName: ord.waiterName || 'Staff',
                         orderType: ord.orderType || 'Dine-In',
                         items: ord.items || [],
                         createdAt: ord.createdAt
                       });
                       setPrintType('kot');
                       setTimeout(() => window.print(), 100);
                     }}
                     title="Reprint KOT Slip"
                     style={{ padding: '8px 10px', backgroundColor: '#e2e8f0', color: '#0f172a', border: 'none', borderRadius: '6px', fontSize: '11px', cursor: 'pointer' }}
                   >
                     🖨️
                   </button>
                 </div>
               </div>
             );
           })}
       </div>

       {/* ---- Recipe Quick View Modal ---- */}
       {selectedRecipe && (
         <div
           onClick={() => setSelectedRecipe(null)}
           style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100 }}
         >
           <div
             onClick={(e) => e.stopPropagation()}
             style={{ backgroundColor: '#fff', borderRadius: '12px', width: '380px', maxWidth: '90%', padding: '20px', boxShadow: '0 10px 30px rgba(0,0,0,0.2)' }}
           >
             <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
               <h3 style={{ margin: 0, fontSize: '16px', color: '#0f172a' }}>📖 Recipe: {selectedRecipe.name}</h3>
               <button onClick={() => setSelectedRecipe(null)} style={{ border: 'none', background: 'none', fontSize: '18px', cursor: 'pointer', color: '#64748b' }}>✕</button>
             </div>
             <p style={{ fontSize: '13px', color: '#475569', background: '#f8fafc', padding: '10px', borderRadius: '6px' }}>
               The recipe and ingredient breakdown for this item will appear here for quick kitchen reference.
             </p>
             <button
               onClick={() => setSelectedRecipe(null)}
               style={{ width: '100%', marginTop: '10px', padding: '8px', backgroundColor: '#0f172a', color: '#fff', border: 'none', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer' }}
             >
               Close
             </button>
           </div>
         </div>
       )}

       {/* ---- Order Status History Modal ---- */}
       {kdsHistoryOrder && (
         <div
           onClick={() => setKdsHistoryOrder(null)}
           style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
         >
           <div
             onClick={(e) => e.stopPropagation()}
             style={{ backgroundColor: '#fff', borderRadius: '12px', width: '360px', maxWidth: '90%', maxHeight: '80vh', overflowY: 'auto', boxShadow: '0 10px 30px rgba(0,0,0,0.2)' }}
           >
             <div style={{ padding: '14px 18px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
               <h3 style={{ margin: 0, fontSize: '15px', color: '#0f172a' }}>
                 🕘 Order History — {kdsHistoryOrder.tableId ? `Table ${kdsHistoryOrder.tableId.tableNo || kdsHistoryOrder.tableId.tableNumber}` : kdsHistoryOrder.orderType} (KOT #{kdsHistoryOrder.kotNumber || 1})
               </h3>
               <button onClick={() => setKdsHistoryOrder(null)} style={{ border: 'none', background: 'none', fontSize: '18px', cursor: 'pointer', color: '#64748b' }}>✕</button>
             </div>
             <div style={{ padding: '14px 18px' }}>
               {(kdsHistoryOrder.statusHistory && kdsHistoryOrder.statusHistory.length > 0) ? (
                 <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                   {kdsHistoryOrder.statusHistory.map((h, idx) => (
                     <div key={idx} style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                       <div style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: '#fc4f1a', marginTop: '5px', flexShrink: 0 }} />
                       <div>
                         <div style={{ fontSize: '13px', fontWeight: 'bold', color: '#0f172a', textTransform: 'capitalize' }}>{h.status}</div>
                         <div style={{ fontSize: '11px', color: '#64748b' }}>
                           {h.updatedBy ? `by ${h.updatedBy} · ` : ''}{h.timestamp ? new Date(h.timestamp).toLocaleString() : ''}
                         </div>
                       </div>
                     </div>
                   ))}
                 </div>
               ) : (
                 <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                   <div style={{ fontSize: '13px', color: '#0f172a' }}>
                     🆕 Order Placed — {kdsHistoryOrder.createdAt ? new Date(kdsHistoryOrder.createdAt).toLocaleString() : 'N/A'}
                   </div>
                   <div style={{ fontSize: '13px', color: '#0f172a' }}>
                     Current status: <b style={{ textTransform: 'capitalize' }}>{kdsHistoryOrder.orderStatus}</b>
                   </div>
                 </div>
               )}
             </div>
           </div>
         </div>
       )}
     </div>
   )}
          {/* ================================================================= */}
          {/* TAB 4: ONLINE ORDERS (ZOMATO / SWIGGY)                            */}
          {/* ================================================================= */}
          {activeTab === 'online' && (
            <div style={{ padding: '25px', flex: 1, overflowY: 'auto', backgroundColor: '#f8fafc' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', gap: '12px', flexWrap: 'wrap' }}>
                <div>
                  <h2 style={{ margin: 0, fontSize: '20px', color: '#0f172a' }}>🛵 Online Orders Integration</h2>
                  <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: '#64748b' }}>Zomato, Swiggy, webhooks, partner assignment & commission tracking.</p>
                </div>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  <button onClick={exportOnlineOrdersCsv} style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', background: '#fff', color: '#0f172a', fontWeight: 700, cursor: 'pointer' }}>Export CSV</button>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '14px', marginBottom: '18px' }}>
                <div style={{ background: '#fff', borderRadius: '12px', padding: '18px', border: '1px solid #e2e8f0' }}>
                  <div style={{ color: '#64748b', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase' }}>Pending</div>
                  <div style={{ fontSize: '28px', fontWeight: 800, color: '#0f172a', marginTop: '8px' }}>{onlineOrders.filter(o => o.status === 'Pending').length}</div>
                </div>
                <div style={{ background: '#fff', borderRadius: '12px', padding: '18px', border: '1px solid #e2e8f0' }}>
                  <div style={{ color: '#64748b', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase' }}>Accepted</div>
                  <div style={{ fontSize: '28px', fontWeight: 800, color: '#0f172a', marginTop: '8px' }}>{onlineOrders.filter(o => o.status === 'Accepted' || o.status === 'Preparing' || o.status === 'Ready for Pickup').length}</div>
                </div>
                <div style={{ background: '#fff', borderRadius: '12px', padding: '18px', border: '1px solid #e2e8f0' }}>
                  <div style={{ color: '#64748b', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase' }}>Live Delivery</div>
                  <div style={{ fontSize: '28px', fontWeight: 800, color: '#0f172a', marginTop: '8px' }}>{onlineOrders.filter(o => o.status === 'Out for Delivery').length}</div>
                </div>
                <div style={{ background: '#fff', borderRadius: '12px', padding: '18px', border: '1px solid #e2e8f0' }}>
                  <div style={{ color: '#64748b', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase' }}>Commission</div>
                  <div style={{ fontSize: '28px', fontWeight: 800, color: '#0f172a', marginTop: '8px' }}>₹{onlineOrders.reduce((sum, order) => sum + getOnlineCommission(order), 0).toFixed(2)}</div>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1.25fr 0.75fr', gap: '18px', marginBottom: '20px' }}>
                <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0', padding: '16px' }}>
                  <div style={{ fontSize: '15px', fontWeight: 800, color: '#0f172a', marginBottom: '14px' }}>API / Webhook Config</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px' }}>
                    <label style={{ fontSize: '12px', color: '#475569', fontWeight: 700 }}>
                      Zomato API Key
                      <input value={onlineOrderConfig.zomatoApiKey} onChange={(e) => setOnlineOrderConfig({ ...onlineOrderConfig, zomatoApiKey: e.target.value })} style={{ ...ui.inputField, marginTop: '6px', width: '100%', boxSizing: 'border-box' }} />
                    </label>
                    <label style={{ fontSize: '12px', color: '#475569', fontWeight: 700 }}>
                      Swiggy API Key
                      <input value={onlineOrderConfig.swiggyApiKey} onChange={(e) => setOnlineOrderConfig({ ...onlineOrderConfig, swiggyApiKey: e.target.value })} style={{ ...ui.inputField, marginTop: '6px', width: '100%', boxSizing: 'border-box' }} />
                    </label>
                    <label style={{ fontSize: '12px', color: '#475569', fontWeight: 700 }}>
                      Webhook Secret
                      <input value={onlineOrderConfig.webhookSecret} onChange={(e) => setOnlineOrderConfig({ ...onlineOrderConfig, webhookSecret: e.target.value })} style={{ ...ui.inputField, marginTop: '6px', width: '100%', boxSizing: 'border-box' }} />
                    </label>
                    <label style={{ fontSize: '12px', color: '#475569', fontWeight: 700 }}>
                      Default Rider
                      <input value={onlineOrderConfig.defaultDeliveryPartner} onChange={(e) => setOnlineOrderConfig({ ...onlineOrderConfig, defaultDeliveryPartner: e.target.value })} style={{ ...ui.inputField, marginTop: '6px', width: '100%', boxSizing: 'border-box' }} />
                    </label>
                    <label style={{ fontSize: '12px', color: '#475569', fontWeight: 700 }}>
                      Commission %
                      <input type="number" value={onlineOrderConfig.commissionRate} onChange={(e) => setOnlineOrderConfig({ ...onlineOrderConfig, commissionRate: Number(e.target.value || 0) })} style={{ ...ui.inputField, marginTop: '6px', width: '100%', boxSizing: 'border-box' }} />
                    </label>
                  </div>
                </div>

                <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0', padding: '16px' }}>
                  <div style={{ fontSize: '15px', fontWeight: 800, color: '#0f172a', marginBottom: '14px' }}>Automation</div>
                  <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', fontSize: '12px', color: '#475569', fontWeight: 700 }}>
                    Auto accept incoming orders
                    <input type="checkbox" checked={onlineOrderConfig.autoAccept} onChange={(e) => setOnlineOrderConfig({ ...onlineOrderConfig, autoAccept: e.target.checked })} />
                  </label>
                  <div style={{ marginTop: '12px', padding: '10px', borderRadius: '8px', backgroundColor: '#f8fafc', fontSize: '12px', color: '#475569', lineHeight: 1.6 }}>
                    <b>Workflow:</b><br />
                    Webhook → Validate → Accept/Reject → Assign delivery rider → Live status sync → Commission tracking.
                  </div>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '12px' }}>
                {onlineOrders.map((order) => {
                  const isZomato = order.source === 'Zomato';
                  const orderTotal = getOnlineOrderTotal(order);
                  const commission = getOnlineCommission(order);
                  const statusColor = order.status === 'Pending' ? '#f59e0b' : order.status === 'Rejected' ? '#dc2626' : order.status === 'Delivered' ? '#10b981' : '#2563eb';

                  return (
                    <div key={order._id} style={{ backgroundColor: '#fff', borderRadius: '10px', border: '1px solid #e2e8f0', padding: '14px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                        <span style={{ fontWeight: 'bold', fontSize: '12px', color: isZomato ? '#dc2626' : '#ea580c' }}>
                          {isZomato ? '🔴 Zomato' : '🟠 Swiggy'}
                        </span>
                        <span style={{ fontSize: '10px', color: '#64748b' }}>{order.time || 'Now'}</span>
                      </div>

                      <div style={{ fontWeight: '800', fontSize: '14px', color: '#0f172a', marginBottom: '6px' }}>{order.customerName}</div>
                      <div style={{ fontSize: '11px', color: '#475569', marginBottom: '8px' }}>{order.deliveryAddress || 'Delivery address pending'}</div>

                      <div style={{ fontSize: '11px', color: '#475569', marginBottom: '10px' }}>
                        {order.items.map((it, i) => (
                          <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: '8px' }}>
                            <span>{it.qty}x {it.name}</span>
                            <span>₹{(Number(it.price || 0) * Number(it.qty || 1)).toFixed(2)}</span>
                          </div>
                        ))}
                      </div>

                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                        <span style={{ fontWeight: '800', fontSize: '15px' }}>₹{orderTotal.toFixed(2)}</span>
                        <span style={{ fontSize: '10px', fontWeight: 'bold', backgroundColor: '#ecfdf5', color: statusColor, padding: '2px 8px', borderRadius: '10px' }}>
                          {order.status}
                        </span>
                      </div>

                      <div style={{ fontSize: '11px', color: '#475569', marginBottom: '10px', display: 'flex', justifyContent: 'space-between' }}>
                        <span>Partner: {order.deliveryPartner || 'Unassigned'}</span>
                        <span>Commission: ₹{commission.toFixed(2)}</span>
                      </div>

                      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                        {order.status !== 'Rejected' && order.status !== 'Delivered' && (
                          <button onClick={() => handleOnlineOrderAction(order._id, 'accept')} style={{ flex: 1, minWidth: '90px', padding: '7px 8px', borderRadius: '8px', border: 'none', background: '#16a34a', color: '#fff', fontWeight: 700, cursor: 'pointer' }}>Accept</button>
                        )}
                        {order.status !== 'Rejected' && order.status !== 'Delivered' && (
                          <button onClick={() => handleOnlineOrderAction(order._id, 'reject')} style={{ flex: 1, minWidth: '90px', padding: '7px 8px', borderRadius: '8px', border: 'none', background: '#dc2626', color: '#fff', fontWeight: 700, cursor: 'pointer' }}>Reject</button>
                        )}
                        {order.status !== 'Rejected' && order.status !== 'Delivered' && (
                          <button onClick={() => handleOnlineOrderAction(order._id, 'assign')} style={{ flex: 1, minWidth: '90px', padding: '7px 8px', borderRadius: '8px', border: '1px solid #cbd5e1', background: '#fff', color: '#0f172a', fontWeight: 700, cursor: 'pointer' }}>Assign Rider</button>
                        )}
                        {order.status !== 'Delivered' && (
                          <button onClick={() => handleOnlineOrderAction(order._id, 'advance')} style={{ flex: 1, minWidth: '90px', padding: '7px 8px', borderRadius: '8px', border: '1px solid #cbd5e1', background: '#fff', color: '#0f172a', fontWeight: 700, cursor: 'pointer' }}>Advance</button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ================================================================= */}
          {/* TAB: WAITER MANAGEMENT & TRACKING                                */}
          {/* ================================================================= */}
          {activeTab === 'waiters' && (() => {
            // Group orders by waiterName
            const waiterStats = {};
            WAITERS_LIST.forEach(w => {
              waiterStats[w] = { name: w, totalOrders: 0, activeOrders: 0, revenue: 0, tables: [] };
            });
            orders.forEach(o => {
              const wName = o.waiterName || 'Unassigned';
              if (!waiterStats[wName]) {
                waiterStats[wName] = { name: wName, totalOrders: 0, activeOrders: 0, revenue: 0, tables: [] };
              }
              waiterStats[wName].totalOrders += 1;
              if (o.orderStatus !== 'completed' && o.orderStatus !== 'cancelled') {
                waiterStats[wName].activeOrders += 1;
                const tLabel = o.tableId ? `T-${o.tableId.tableNo || o.tableId.tableNumber}` : o.orderType;
                if (!waiterStats[wName].tables.includes(tLabel)) waiterStats[wName].tables.push(tLabel);
              }
              if (o.orderStatus === 'completed') {
                waiterStats[wName].revenue += (o.grandTotal || 0);
              }
            });
            const statsArray = Object.values(waiterStats);

            return (
              <div className="payment-ledger-page" style={{ padding: '24px', flex: 1, overflowY: 'auto', backgroundColor: '#f8fafc' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                  <div>
                    <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 'bold', color: '#0f172a' }}>
                      👨‍🍳 Waiter Management & Live Tracking
                    </h2>
                    <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: '#64748b' }}>
                      See which waiter is working on which tables/orders right now.
                    </p>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '12px', color: '#64748b', fontWeight: '600' }}>Active Waiter:</span>
                    <select
                      value={selectedWaiter}
                      onChange={(e) => setSelectedWaiter(e.target.value)}
                      style={{ padding: '6px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '13px', fontWeight: 'bold', color: '#0f172a' }}
                    >
                      {WAITERS_LIST.map(w => <option key={w} value={w}>{w}</option>)}
                    </select>
                  </div>
                </div>

                {/* Summary Cards */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '14px', marginBottom: '24px' }}>
                  {statsArray.map(w => {
                    const isActive = w.activeOrders > 0;
                    return (
                      <div key={w.name} style={{
                        backgroundColor: '#fff',
                        borderRadius: '12px',
                        padding: '16px',
                        border: `2px solid ${selectedWaiter === w.name ? '#fc4f1a' : isActive ? '#0d9f5f' : '#e2e8f0'}`,
                        boxShadow: selectedWaiter === w.name ? '0 0 0 3px rgba(252,79,26,0.15)' : '0 1px 3px rgba(0,0,0,0.04)',
                        cursor: 'pointer',
                        transition: 'all 0.2s'
                      }}
                      onClick={() => setSelectedWaiter(w.name)}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <div style={{
                              width: '36px', height: '36px', borderRadius: '50%',
                              backgroundColor: isActive ? '#dcfce7' : '#f1f5f9',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              fontSize: '16px'
                            }}>
                              👨‍🍳
                            </div>
                            <div>
                              <div style={{ fontWeight: 'bold', fontSize: '14px', color: '#0f172a' }}>{w.name}</div>
                              <div style={{ fontSize: '11px', color: isActive ? '#16a34a' : '#94a3b8' }}>
                                {isActive ? '● On Duty' : '○ Idle'}
                              </div>
                            </div>
                          </div>
                          {selectedWaiter === w.name && (
                            <span style={{ fontSize: '10px', backgroundColor: '#fff1ec', color: '#c2410c', padding: '2px 8px', borderRadius: '10px', fontWeight: 'bold' }}>
                              SELECTED
                            </span>
                          )}
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                          <div style={{ backgroundColor: '#f8fafc', borderRadius: '8px', padding: '8px', textAlign: 'center' }}>
                            <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#2563eb' }}>{w.activeOrders}</div>
                            <div style={{ fontSize: '10px', color: '#64748b' }}>Active Orders</div>
                          </div>
                          <div style={{ backgroundColor: '#f8fafc', borderRadius: '8px', padding: '8px', textAlign: 'center' }}>
                            <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#16a34a' }}>₹{w.revenue.toFixed(0)}</div>
                            <div style={{ fontSize: '10px', color: '#64748b' }}>Revenue</div>
                          </div>
                        </div>

                        {w.tables.length > 0 && (
                          <div style={{ marginTop: '10px', display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                            {w.tables.map(t => (
                              <span key={t} style={{ fontSize: '10px', backgroundColor: '#eff6ff', color: '#1d4ed8', padding: '2px 8px', borderRadius: '6px', fontWeight: 'bold' }}>
                                {t}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Active Orders for selected waiter */}
                <h3 style={{ margin: '0 0 12px 0', fontSize: '16px', color: '#0f172a' }}>
                  📋 {selectedWaiter}'s Active Orders
                </h3>
                <div style={{ backgroundColor: '#fff', borderRadius: '10px', overflow: 'hidden', border: '1px solid #e2e8f0' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.5fr 1fr 1fr 1fr', padding: '10px 16px', backgroundColor: '#f1f5f9', fontWeight: 'bold', fontSize: '12px', color: '#64748b' }}>
                    <div>Table / Type</div>
                    <div>Items</div>
                    <div>Status</div>
                    <div>Time</div>
                    <div style={{ textAlign: 'right' }}>Amount</div>
                  </div>
                  {orders
                    .filter(o => o.waiterName === selectedWaiter && o.orderStatus !== 'completed' && o.orderStatus !== 'cancelled')
                    .map(o => (
                      <div key={o._id} style={{ display: 'grid', gridTemplateColumns: '1fr 1.5fr 1fr 1fr 1fr', padding: '10px 16px', borderBottom: '1px solid #f1f5f9', fontSize: '13px', alignItems: 'center' }}>
                        <div style={{ fontWeight: 'bold', color: '#0f172a' }}>
                          {o.tableId ? `T-${o.tableId.tableNo || o.tableId.tableNumber}` : o.orderType}
                        </div>
                        <div style={{ fontSize: '11px', color: '#475569' }}>
                          {(o.items || []).map(it => `${it.quantity}x ${it.name}`).join(', ')}
                        </div>
                        <div>
                          <span style={{
                            fontSize: '10px', fontWeight: 'bold', padding: '3px 8px', borderRadius: '10px',
                            backgroundColor: o.orderStatus === 'placed' ? '#fef3c7' : o.orderStatus === 'preparing' ? '#ffedd5' : '#dcfce7',
                            color: o.orderStatus === 'placed' ? '#92400e' : o.orderStatus === 'preparing' ? '#c2410c' : '#166534'
                          }}>
                            {o.orderStatus?.toUpperCase()}
                          </span>
                        </div>
                        <div style={{ fontSize: '11px', color: '#64748b' }}>
                          {o.createdAt ? `${Math.max(0, Math.floor((Date.now() - new Date(o.createdAt).getTime()) / 60000))} min ago` : '-'}
                        </div>
                        <div style={{ textAlign: 'right', fontWeight: 'bold' }}>₹{(o.grandTotal || 0).toFixed(0)}</div>
                      </div>
                    ))
                  }
                  {orders.filter(o => o.waiterName === selectedWaiter && o.orderStatus !== 'completed' && o.orderStatus !== 'cancelled').length === 0 && (
                    <div style={{ padding: '20px', textAlign: 'center', color: '#94a3b8', fontSize: '13px' }}>
                      {selectedWaiter} has no active orders right now.
                    </div>
                  )}
                </div>
              </div>
            );
          })()}

          {/* ================================================================= */}
        {/* TAB 5: ANALYTICS & SALES REPORT                                  */}
  {/* ================================================================= */}
  {activeTab === 'analytics' && (() => {
    const completedOrders = orders.filter(o => o.orderStatus === 'completed' && isOrderInPeriod(o, selectedPeriod));
    const periodQuantity = completedOrders.reduce((sum, order) => (
      sum + (order.items || []).reduce((itemSum, item) => itemSum + Number(item.quantity || item.qty || 0), 0)
    ), 0);
    
    const salesByType = { 'Dine-In': 0, 'Takeaway': 0, 'Delivery': 0 };
    completedOrders.forEach(o => {
      if (salesByType[o.orderType] !== undefined) {
        salesByType[o.orderType] += (o.grandTotal || 0);
      }
    });
    const typeChartData = Object.keys(salesByType).map(key => ({
      name: key,
      Sales: salesByType[key]
    }));

    // Calculate Top Selling Items dynamically from completed orders data
    const itemSalesMap = {};
    completedOrders.forEach(o => {
      if (o.items && Array.isArray(o.items)) {
        o.items.forEach(it => {
          const itemName = it.name || 'Unknown Item';
          if (!itemSalesMap[itemName]) {
            itemSalesMap[itemName] = { quantity: 0, revenue: 0 };
          }
          itemSalesMap[itemName].quantity += Number(it.quantity || 1);
          itemSalesMap[itemName].revenue += Number(it.price || 0) * Number(it.quantity || 1);
        });
      }
    });

    const topSellingItems = Object.keys(itemSalesMap)
      .map(name => ({
        name,
        totalQuantity: itemSalesMap[name].quantity,
        totalRevenue: itemSalesMap[name].revenue
      }))
      .sort((a, b) => b.totalQuantity - a.totalQuantity)
      .slice(0, 5); // Top 5 items

    return (
      <div style={{ padding: '24px', backgroundColor: '#f8fafc', flex: 1, overflowY: 'auto' }}>
        <div className="analytics-heading-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '16px', flexWrap: 'wrap', marginBottom: '16px' }}>
          <div>
            <h2 style={{ margin: '0 0 4px 0', fontSize: '20px', fontWeight: 'bold', color: '#0f172a' }}>
              📊 {selectedPeriod} Sales & Demand Analytics
            </h2>
            <p style={{ margin: 0, color: '#64748b', fontSize: '13px' }}>
              Completed bills and item quantities for the selected period.
            </p>
          </div>
          <div className="analytics-period-controls" style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {['Today', 'Week', 'Month', 'Year'].map((period) => (
              <button
                key={period}
                onClick={() => setSelectedPeriod(period)}
                style={{
                  padding: '9px 15px',
                  borderRadius: '8px',
                  border: selectedPeriod === period ? '1px solid #fc4f1a' : '1px solid #cbd5e1',
                  background: selectedPeriod === period ? '#fff1eb' : '#fff',
                  color: selectedPeriod === period ? '#c2410c' : '#334155',
                  fontWeight: '700',
                  fontSize: '12px',
                  cursor: 'pointer'
                }}
              >
                {period}
              </button>
            ))}
          </div>
        </div>
        
        {/* Stat Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(150px, 1fr))', gap: '14px', marginBottom: '20px' }}>
          <div style={ui.statCard}>
            <div style={{ fontSize: '12px', color: '#64748b', fontWeight: '600' }}>TOTAL REVENUE</div>
            <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#16a34a', marginTop: '6px' }}>
              ₹{completedOrders.reduce((sum, o) => sum + (o.grandTotal || 0), 0).toFixed(2)}
            </div>
          </div>
          <div style={ui.statCard}>
            <div style={{ fontSize: '12px', color: '#64748b', fontWeight: '600' }}>COMPLETED ORDERS</div>
            <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#2563eb', marginTop: '6px' }}>
              {completedOrders.length}
            </div>
          </div>
          <div style={ui.statCard}>
            <div style={{ fontSize: '12px', color: '#64748b', fontWeight: '600' }}>RUNNING TABLES</div>
            <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#fc4f1a', marginTop: '6px' }}>
              {tables.filter(t => t.status === 'occupied').length}
            </div>
          </div>
          <div style={ui.statCard}>
            <div style={{ fontSize: '12px', color: '#64748b', fontWeight: '600' }}>ITEM QUANTITY SOLD</div>
            <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#7c3aed', marginTop: '6px' }}>
              {periodQuantity}
            </div>
          </div>
          <div style={ui.statCard}>
            <div style={{ fontSize: '12px', color: '#64748b', fontWeight: '600' }}>AVG BILL SIZE</div>
            <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#0891b2', marginTop: '6px' }}>
              ₹{completedOrders.length > 0 ? (completedOrders.reduce((s, o) => s + (o.grandTotal || 0), 0) / completedOrders.length).toFixed(0) : '0'}
            </div>
          </div>
        </div>

        {/* Charts & Top Items Grid Layout */}
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '20px' }}>
          
          {/* Revenue by Order Type Chart */}
          <div style={{ backgroundColor: '#ffffff', padding: '20px', borderRadius: '10px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)', border: '1px solid #e2e8f0' }}>
            <h3 style={{ margin: '0 0 16px 0', fontSize: '16px', color: '#0f172a' }}>Revenue by Order Type</h3>
            <div style={{ width: '100%', height: 300 }}>
              <ResponsiveContainer>
                <BarChart data={typeChartData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} />
                  <YAxis axisLine={false} tickLine={false} />
                  <Tooltip cursor={{ fill: '#f1f5f9' }} />
                  <Bar dataKey="Sales" fill="#fc4f1a" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Top Selling Items Box */}
          <div style={{ backgroundColor: '#ffffff', padding: '20px', borderRadius: '10px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)', border: '1px solid #e2e8f0' }}>
            <h3 style={{ margin: '0 0 16px 0', fontSize: '16px', color: '#0f172a' }}>🔥 Top Selling Items</h3>
            {topSellingItems.length === 0 ? (
              <p style={{ fontSize: '13px', color: '#64748b' }}>No completed orders yet.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {topSellingItems.map((item, index) => (
                  <div key={index} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #f1f5f9', paddingBottom: '8px' }}>
                    <div>
                      <span style={{ fontSize: '12px', fontWeight: 'bold', color: '#94a3b8', marginRight: '6px' }}>#{index + 1}</span>
                      <span style={{ fontSize: '14px', fontWeight: '600', color: '#1e293b' }}>{item.name}</span>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <span style={{ backgroundColor: '#dcfce7', color: '#15803d', fontSize: '11px', fontWeight: 'bold', padding: '2px 6px', borderRadius: '4px', marginRight: '6px' }}>
                        {item.totalQuantity} sold
                      </span>
                      <span style={{ fontSize: '13px', fontWeight: 'bold', color: '#0f172a' }}>₹{item.totalRevenue}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>
      </div>
    );
  })()}

          {/* ================================================================= */}
          {/* TAB 6: PAYMENTS TAB                                               */}
          {/* ================================================================= */}
          {activeTab === 'payments' && (
            <div style={{ padding: '24px', flex: 1, overflowY: 'auto', backgroundColor: '#f8fafc' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
                <div>
                  <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 'bold', color: '#0f172a' }}>💳 Payment Ledger</h2>
                  <div style={{ marginTop: 4, fontSize: 12, color: '#64748b' }}>{filteredPayments.length} transactions · {paymentPeriod} view</div>
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <button onClick={exportPaymentLedgerCsv} style={{ padding: '8px 12px', border: '1px solid #cbd5e1', borderRadius: 7, background: '#fff', color: '#334155', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>Export CSV</button>
                  <button onClick={() => window.print()} style={{ padding: '8px 12px', border: '1px solid #cbd5e1', borderRadius: 7, background: '#fff', color: '#334155', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>Print</button>
                  {['Today', 'Week', 'Month', 'Year'].map((period) => (
                    <button key={period} onClick={() => setPaymentPeriod(period)} style={{ padding: '8px 12px', border: paymentPeriod === period ? '1px solid #ea4615' : '1px solid #cbd5e1', borderRadius: 7, background: paymentPeriod === period ? '#fff1ec' : '#fff', color: paymentPeriod === period ? '#c2410c' : '#334155', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>{period}</button>
                  ))}
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '12px', marginBottom: '16px' }}>
                <div style={{ background: '#fff', padding: '14px', border: '1px solid #e2e8f0', borderRadius: '10px' }}><div style={{ fontSize: 11, color: '#64748b' }}>PAID {paymentPeriod.toUpperCase()}</div><strong>₹{paymentMetrics.paid.toFixed(2)}</strong><div style={{ fontSize: 11, color: '#64748b', marginTop: 3 }}>{paymentMetrics.count} payments</div></div>
                <div style={{ background: '#fff', padding: '14px', border: '1px solid #e2e8f0', borderRadius: '10px' }}><div style={{ fontSize: 11, color: '#64748b' }}>REFUNDED {paymentPeriod.toUpperCase()}</div><strong style={{ color: '#b91c1c' }}>₹{paymentMetrics.refunded.toFixed(2)}</strong></div>
                <div style={{ background: '#fff', padding: '14px', border: '1px solid #e2e8f0', borderRadius: '10px' }}><div style={{ fontSize: 11, color: '#64748b' }}>SPLIT CASH</div><strong>₹{paymentMetrics.splitCash.toFixed(2)}</strong></div>
                <div style={{ background: '#fff', padding: '14px', border: '1px solid #e2e8f0', borderRadius: '10px' }}><div style={{ fontSize: 11, color: '#64748b' }}>SPLIT ONLINE</div><strong>₹{paymentMetrics.splitOnline.toFixed(2)}</strong></div>
                <div style={{ background: paymentReconciliation?.dayEnd?.variance ? '#fff7ed' : '#fff', padding: '14px', border: '1px solid #e2e8f0', borderRadius: '10px' }}><div style={{ fontSize: 11, color: '#64748b' }}>CASH MISMATCH</div><strong style={{ color: Number(paymentReconciliation?.dayEnd?.variance || 0) === 0 ? '#15803d' : '#b45309' }}>₹{Number(paymentReconciliation?.dayEnd?.variance || 0).toFixed(2)}</strong></div>
              </div>
              <div className="payment-ledger-table-wrap" style={{ backgroundColor: '#ffffff', borderRadius: '10px', overflowX: 'auto', border: '1px solid #e2e8f0' }}>
                <div style={{ minWidth: '1120px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1.3fr 1.3fr 1.5fr 1fr 0.8fr 1fr 0.8fr', gap: '12px', padding: '12px 16px', backgroundColor: '#f1f5f9', fontWeight: 'bold', fontSize: '11px', color: '#64748b' }}>
                  <div>Customer Name</div><div>Phone / GSTIN</div><div>Invoice / Date</div><div>Order Details</div><div>Payment Mode</div><div>Status</div><div style={{ textAlign: 'right' }}>Amount</div><div style={{ textAlign: 'right' }}>Action</div>
                </div>
                {filteredPayments.map((payment) => {
                  const order = payment.orderId || {};
                  const phone = payment.customerPhone || order.customerPhone || '';
                  const gstin = payment.customerGstin || order.customerGstin || '';
                  const paymentDate = payment.status === 'refunded' ? payment.refundedAt : payment.settledAt;
                  return (
                  <div key={payment._id} style={{ display: 'grid', gridTemplateColumns: '1.4fr 1.3fr 1.3fr 1.5fr 1fr 0.8fr 1fr 0.8fr', gap: '12px', padding: '13px 16px', borderBottom: '1px solid #f1f5f9', fontSize: '12px', alignItems: 'center' }}>
                    <div style={{ fontWeight: 'bold', color: '#0f172a' }}>{payment.customerName || 'Walk-in Customer'}</div>
                    <div style={{ color: '#475569', lineHeight: 1.6 }}><div>{phone ? `📞 ${phone}` : 'No phone'}</div><div style={{ fontSize: 10, color: '#94a3b8' }}>{gstin || 'No GSTIN'}</div></div>
                    <div style={{ color: '#475569', lineHeight: 1.6 }}><div style={{ fontWeight: 600 }}>{payment.invoiceNumber || order.invoiceNumber || 'No invoice'}</div><div style={{ fontSize: 10, color: '#94a3b8' }}>{paymentDate ? new Date(paymentDate).toLocaleString('en-IN') : '-'}</div></div>
                    <div style={{ color: '#475569', lineHeight: 1.6 }}><div>{order.orderType || 'Order'}{order.tableId?.tableNo ? ` · Table ${order.tableId.tableNo}` : ''}</div><div style={{ fontSize: 10, color: '#94a3b8' }}>{order.waiterName ? `Waiter: ${order.waiterName}` : ''}{order.deliveryAddress ? ` · ${order.deliveryAddress}` : ''}</div></div>
                    <div style={{ color: '#334155' }}><div>{payment.paymentMode || 'Cash'}</div>{payment.paymentBreakdown && <div style={{ fontSize: 10, color: '#64748b' }}>₹{Number(payment.paymentBreakdown.cash || 0).toFixed(0)} + ₹{Number(payment.paymentBreakdown.online || 0).toFixed(0)}</div>}{payment.paymentReference && <div style={{ fontSize: 10, color: '#64748b' }}>Ref: {payment.paymentReference}</div>}</div>
                    <div><span style={{ color: payment.status === 'paid' ? '#16a34a' : '#b91c1c', fontWeight: 'bold' }}>{payment.status?.toUpperCase()}</span></div>
                    <div style={{ textAlign: 'right', fontWeight: 'bold' }}>₹{Number(payment.grandTotal || 0).toFixed(2)}</div>
                    <div style={{ textAlign: 'right' }}>
                      {payment.status === 'paid' && order._id && (
                        <button onClick={() => handleRefundOrder(order)} style={{ padding: '6px 8px', border: '1px solid #fecaca', borderRadius: '6px', background: '#fef2f2', color: '#b91c1c', fontSize: '11px', fontWeight: 700, cursor: 'pointer' }}>
                          Refund
                        </button>
                      )}
                    </div>
                  </div>
                  );
                })}
                {filteredPayments.length === 0 && <div style={{ padding: 24, textAlign: 'center', color: '#64748b', background: '#fff' }}>No payment records found for {paymentPeriod.toLowerCase()}.</div>}
                </div>
              </div>
            </div>
          )}

          {/* ================================================================= */}
          {/* TAB 7: DAY-END CLOSING (Z-REPORT)                                 */}
          {/* ================================================================= */}
          {activeTab === 'dayend' && (() => {
            const completed = orders.filter(o => o.orderStatus === 'completed');
            const cancelled = orders.filter(o => o.orderStatus === 'cancelled');
            const activeOrders = orders.filter(o => o.orderStatus !== 'completed' && o.orderStatus !== 'cancelled');

            const totalSales = completed.reduce((s, o) => s + (o.grandTotal || 0), 0);
            const totalBills = completed.length;
            const avgBill = totalBills > 0 ? totalSales / totalBills : 0;

            // Payment mode breakdown
            const paymentBreakdown = {};
            completed.forEach(o => {
              const mode = o.paymentMode || 'Cash';
              if (!paymentBreakdown[mode]) paymentBreakdown[mode] = { count: 0, amount: 0 };
              paymentBreakdown[mode].count += 1;
              paymentBreakdown[mode].amount += (o.grandTotal || 0);
            });

            // Order type breakdown
            const typeBreakdown = { 'Dine-In': { count: 0, amount: 0 }, 'Takeaway': { count: 0, amount: 0 }, 'Delivery': { count: 0, amount: 0 } };
            completed.forEach(o => {
              const t = o.orderType || 'Dine-In';
              if (typeBreakdown[t]) {
                typeBreakdown[t].count += 1;
                typeBreakdown[t].amount += (o.grandTotal || 0);
              }
            });

            // Tax summary
            const totalCGST = completed.reduce((s, o) => s + (o.cgst || 0), 0);
            const totalSGST = completed.reduce((s, o) => s + (o.sgst || 0), 0);
            const totalTax = totalCGST + totalSGST;
            const totalSubtotal = completed.reduce((s, o) => s + (o.subTotal || 0), 0);
            const totalDiscount = completed.reduce((s, o) => s + (o.discountAmt || 0), 0);

            // Waiter-wise
            const waiterSales = {};
            completed.forEach(o => {
              const w = o.waiterName || 'Unassigned';
              if (!waiterSales[w]) waiterSales[w] = { count: 0, amount: 0 };
              waiterSales[w].count += 1;
              waiterSales[w].amount += (o.grandTotal || 0);
            });

            // Category-wise from items
            const categorySales = {};
            completed.forEach(o => {
              (o.items || []).forEach(it => {
                const cat = it.itemId?.category || 'Other';
                if (!categorySales[cat]) categorySales[cat] = { qty: 0, amount: 0 };
                categorySales[cat].qty += (it.quantity || 1);
                categorySales[cat].amount += ((it.price || 0) * (it.quantity || 1));
              });
            });

            // Cancelled
            const cancelledAmount = cancelled.reduce((s, o) => s + (o.grandTotal || 0), 0);

            const rowStyle = { display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #f1f5f9', fontSize: '13px' };
            const sectionTitle = { fontSize: '14px', fontWeight: 'bold', color: '#0f172a', margin: '0 0 10px 0', paddingBottom: '6px', borderBottom: '2px solid #e2e8f0' };
            const cardBox = { backgroundColor: '#fff', borderRadius: '10px', padding: '16px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' };

            return (
              <div style={{ padding: '24px', flex: 1, overflowY: 'auto', backgroundColor: '#f8fafc' }}>
                {/* Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                  <div>
                    <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 'bold', color: '#0f172a' }}>
                      📋 Day-End Z-Report (Shift Closure)
                    </h2>
                    <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: '#64748b' }}>
                      {new Date().toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })} · Cashier: <b>{currentUser?.name || 'Admin'}</b> · Shift: Morning
                    </p>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'end', gap: '8px', flexWrap: 'wrap' }}>
                    <label style={{ fontSize: '11px', color: '#475569', fontWeight: 700 }}>
                      Opening Cash
                      <input type="number" min="0" value={dayEndOpeningCash} onChange={(e) => setDayEndOpeningCash(e.target.value)} disabled={Boolean(dayEndRecord)} style={{ display: 'block', width: '112px', marginTop: '4px', padding: '8px', border: '1px solid #cbd5e1', borderRadius: '6px' }} />
                    </label>
                    <label style={{ fontSize: '11px', color: '#475569', fontWeight: 700 }}>
                      Closing Cash
                      <input type="number" min="0" value={dayEndClosingCash} onChange={(e) => setDayEndClosingCash(e.target.value)} disabled={dayEndRecord?.status === 'closed'} style={{ display: 'block', width: '112px', marginTop: '4px', padding: '8px', border: '1px solid #cbd5e1', borderRadius: '6px' }} />
                    </label>
                    <button onClick={closeBusinessDay} disabled={dayEndRecord?.status === 'closed'} style={{ padding: '10px 20px', backgroundColor: dayEndRecord?.status === 'closed' ? '#94a3b8' : '#1a1a2e', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 'bold', cursor: dayEndRecord?.status === 'closed' ? 'not-allowed' : 'pointer', fontSize: '13px' }}>
                      {dayEndRecord?.status === 'closed' ? '✅ Day Closed' : '🔒 Close Day'}
                    </button>
                  </div>
                </div>

                {/* Top Summary Cards */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '12px', marginBottom: '20px' }}>
                  <div style={cardBox}>
                    <div style={{ fontSize: '11px', color: '#64748b', fontWeight: '600' }}>TOTAL SALES</div>
                    <div style={{ fontSize: '22px', fontWeight: 'bold', color: '#16a34a', marginTop: '4px' }}>₹{totalSales.toFixed(2)}</div>
                  </div>
                  <div style={cardBox}>
                    <div style={{ fontSize: '11px', color: '#64748b', fontWeight: '600' }}>TOTAL BILLS</div>
                    <div style={{ fontSize: '22px', fontWeight: 'bold', color: '#2563eb', marginTop: '4px' }}>{totalBills}</div>
                  </div>
                  <div style={cardBox}>
                    <div style={{ fontSize: '11px', color: '#64748b', fontWeight: '600' }}>AVG BILL VALUE</div>
                    <div style={{ fontSize: '22px', fontWeight: 'bold', color: '#0891b2', marginTop: '4px' }}>₹{avgBill.toFixed(0)}</div>
                  </div>
                  <div style={cardBox}>
                    <div style={{ fontSize: '11px', color: '#64748b', fontWeight: '600' }}>TOTAL TAX</div>
                    <div style={{ fontSize: '22px', fontWeight: 'bold', color: '#7c3aed', marginTop: '4px' }}>₹{totalTax.toFixed(2)}</div>
                  </div>
                  <div style={cardBox}>
                    <div style={{ fontSize: '11px', color: '#64748b', fontWeight: '600' }}>RUNNING ORDERS</div>
                    <div style={{ fontSize: '22px', fontWeight: 'bold', color: '#fc4f1a', marginTop: '4px' }}>{activeOrders.length}</div>
                  </div>
                </div>

                {/* Main Grid: 2 columns */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '20px' }}>

                  {/* Payment Mode Breakdown */}
                  <div style={cardBox}>
                    <h4 style={sectionTitle}>💳 Payment Mode Breakdown</h4>
                    {Object.entries(paymentBreakdown).map(([mode, data]) => (
                      <div key={mode} style={rowStyle}>
                        <div>
                          <span style={{ fontWeight: '600', color: '#0f172a' }}>{mode}</span>
                          <span style={{ fontSize: '11px', color: '#94a3b8', marginLeft: '6px' }}>({data.count} bills)</span>
                        </div>
                        <span style={{ fontWeight: 'bold', color: '#0f172a' }}>₹{data.amount.toFixed(2)}</span>
                      </div>
                    ))}
                    {Object.keys(paymentBreakdown).length === 0 && (
                      <div style={{ color: '#94a3b8', fontSize: '12px', padding: '10px 0' }}>No completed payments today.</div>
                    )}
                    <div style={{ ...rowStyle, borderBottom: 'none', fontWeight: 'bold', color: '#16a34a', borderTop: '2px solid #e2e8f0', marginTop: '4px', paddingTop: '10px' }}>
                      <span>NET TOTAL</span>
                      <span>₹{totalSales.toFixed(2)}</span>
                    </div>
                  </div>

                  {/* Order Type Breakdown */}
                  <div style={cardBox}>
                    <h4 style={sectionTitle}>🍽️ Order Type Breakdown</h4>
                    {Object.entries(typeBreakdown).map(([type, data]) => (
                      <div key={type} style={rowStyle}>
                        <div>
                          <span style={{ fontWeight: '600', color: '#0f172a' }}>
                            {type === 'Dine-In' ? '🪑' : type === 'Takeaway' ? '🥡' : '🛵'} {type}
                          </span>
                          <span style={{ fontSize: '11px', color: '#94a3b8', marginLeft: '6px' }}>({data.count} orders)</span>
                        </div>
                        <span style={{ fontWeight: 'bold', color: '#0f172a' }}>₹{data.amount.toFixed(2)}</span>
                      </div>
                    ))}
                  </div>

                  {/* Tax Summary */}
                  <div style={cardBox}>
                    <h4 style={sectionTitle}>🧾 Tax & Discount Summary</h4>
                    <div style={rowStyle}>
                      <span style={{ color: '#475569' }}>Subtotal (before tax)</span>
                      <span style={{ fontWeight: 'bold' }}>₹{totalSubtotal.toFixed(2)}</span>
                    </div>
                    <div style={rowStyle}>
                      <span style={{ color: '#475569' }}>CGST (2.5%)</span>
                      <span style={{ fontWeight: 'bold' }}>₹{totalCGST.toFixed(2)}</span>
                    </div>
                    <div style={rowStyle}>
                      <span style={{ color: '#475569' }}>SGST (2.5%)</span>
                      <span style={{ fontWeight: 'bold' }}>₹{totalSGST.toFixed(2)}</span>
                    </div>
                    <div style={rowStyle}>
                      <span style={{ color: '#475569' }}>Total Tax Collected</span>
                      <span style={{ fontWeight: 'bold', color: '#7c3aed' }}>₹{totalTax.toFixed(2)}</span>
                    </div>
                    <div style={{ ...rowStyle, borderBottom: 'none' }}>
                      <span style={{ color: '#dc2626' }}>Total Discount Given</span>
                      <span style={{ fontWeight: 'bold', color: '#dc2626' }}>- ₹{totalDiscount.toFixed(2)}</span>
                    </div>
                  </div>

                  {/* Cancelled Orders */}
                  <div style={cardBox}>
                    <h4 style={sectionTitle}>❌ Cancelled / Void Orders</h4>
                    <div style={rowStyle}>
                      <span style={{ color: '#475569' }}>Cancelled Orders</span>
                      <span style={{ fontWeight: 'bold', color: '#ef4444' }}>{cancelled.length}</span>
                    </div>
                    <div style={rowStyle}>
                      <span style={{ color: '#475569' }}>Cancelled Amount</span>
                      <span style={{ fontWeight: 'bold', color: '#ef4444' }}>₹{cancelledAmount.toFixed(2)}</span>
                    </div>
                    <div style={{ ...rowStyle, borderBottom: 'none', borderTop: '2px solid #e2e8f0', marginTop: '4px', paddingTop: '10px' }}>
                      <span style={{ fontWeight: 'bold', color: '#16a34a' }}>Net Revenue (after cancellation)</span>
                      <span style={{ fontWeight: 'bold', color: '#16a34a' }}>₹{(totalSales).toFixed(2)}</span>
                    </div>
                  </div>
                </div>

                {/* Bottom Grid: Waiter-wise & Category-wise */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                  {/* Waiter Performance */}
                  <div style={cardBox}>
                    <h4 style={sectionTitle}>👨‍🍳 Waiter-wise Performance</h4>
                    <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', padding: '6px 0', fontWeight: 'bold', fontSize: '11px', color: '#64748b', borderBottom: '1px solid #e2e8f0' }}>
                      <div>Waiter</div>
                      <div style={{ textAlign: 'center' }}>Bills</div>
                      <div style={{ textAlign: 'right' }}>Revenue</div>
                    </div>
                    {Object.entries(waiterSales)
                      .sort((a, b) => b[1].amount - a[1].amount)
                      .map(([name, data]) => (
                      <div key={name} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', padding: '8px 0', borderBottom: '1px solid #f8fafc', fontSize: '13px' }}>
                        <div style={{ fontWeight: '600', color: '#0f172a' }}>{name}</div>
                        <div style={{ textAlign: 'center', color: '#475569' }}>{data.count}</div>
                        <div style={{ textAlign: 'right', fontWeight: 'bold', color: '#16a34a' }}>₹{data.amount.toFixed(0)}</div>
                      </div>
                    ))}
                    {Object.keys(waiterSales).length === 0 && (
                      <div style={{ color: '#94a3b8', fontSize: '12px', padding: '10px 0' }}>No waiter data available.</div>
                    )}
                  </div>

                  {/* Category-wise Sales */}
                  <div style={cardBox}>
                    <h4 style={sectionTitle}>📂 Category-wise Sales</h4>
                    <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', padding: '6px 0', fontWeight: 'bold', fontSize: '11px', color: '#64748b', borderBottom: '1px solid #e2e8f0' }}>
                      <div>Category</div>
                      <div style={{ textAlign: 'center' }}>Qty Sold</div>
                      <div style={{ textAlign: 'right' }}>Amount</div>
                    </div>
                    {Object.entries(categorySales)
                      .sort((a, b) => b[1].amount - a[1].amount)
                      .map(([cat, data]) => (
                      <div key={cat} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', padding: '8px 0', borderBottom: '1px solid #f8fafc', fontSize: '13px' }}>
                        <div style={{ fontWeight: '600', color: '#0f172a' }}>{cat}</div>
                        <div style={{ textAlign: 'center', color: '#475569' }}>{data.qty}</div>
                        <div style={{ textAlign: 'right', fontWeight: 'bold', color: '#0891b2' }}>₹{data.amount.toFixed(0)}</div>
                      </div>
                    ))}
                    {Object.keys(categorySales).length === 0 && (
                      <div style={{ color: '#94a3b8', fontSize: '12px', padding: '10px 0' }}>No item data available.</div>
                    )}
                  </div>
                </div>
              </div>
            );
          })()}

          {/* ================================================================= */}
          {/* TAB 8: ADMIN MANAGEMENT PANEL                                     */}
          {/* ================================================================= */}
          {activeTab === 'admin' && <AdminDashboard handleLogout={handleLogout} />}
          {false && activeTab === 'admin' && (
            <div style={{ padding: '24px', flex: 1, overflowY: 'auto', backgroundColor: '#f8fafc' }}>
              <h2 style={{ margin: '0 0 16px 0', fontSize: '20px', fontWeight: 'bold', color: '#0f172a' }}>
                ⚙️ Restaurant Admin Configuration
              </h2>

              {/* Restaurant Details Form */}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  saveRestaurantSettings(restaurantSettings);
                  alert('✅ Details saved. They will appear on the receipt and KOT.');
                }}
                style={{ ...ui.adminFormFull, marginBottom: '20px' }}
              >
                <h3 style={{ margin: '0 0 12px 0', fontSize: '16px', color: '#0f172a' }}>🏪 Restaurant Details (Bill Header)</h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
                  <div>
                    <label style={ui.labelStyle}>Restaurant Name</label>
                    <input value={restaurantSettings.name} onChange={(e) => setRestaurantSettings({ ...restaurantSettings, name: e.target.value })} style={ui.inputFieldFull} />
                  </div>
                  <div>
                    <label style={ui.labelStyle}>Phone</label>
                    <input value={restaurantSettings.phone} onChange={(e) => setRestaurantSettings({ ...restaurantSettings, phone: e.target.value })} style={ui.inputFieldFull} />
                  </div>
                  <div>
                    <label style={ui.labelStyle}>GSTIN</label>
                    <input value={restaurantSettings.gstin} onChange={(e) => setRestaurantSettings({ ...restaurantSettings, gstin: e.target.value })} style={ui.inputFieldFull} />
                  </div>
                  <div>
                    <label style={ui.labelStyle}>UPI ID (for QR payment)</label>
                    <input value={restaurantSettings.upiId} onChange={(e) => setRestaurantSettings({ ...restaurantSettings, upiId: e.target.value })} style={ui.inputFieldFull} />
                  </div>
                </div>
                <button type="submit" style={{ ...ui.submitBtn, marginTop: '12px', width: '200px' }}>
                  💾 Save Details
                </button>
              </form>

              {/* Add Menu Item */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))', gap: '20px', marginBottom: '20px' }}>
                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    try {
                      const itemPayload = { ...newItem };
                      if (!itemPayload.image) {
                        itemPayload.image = 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=300';
                      }
                      await api.post('/menu/add', itemPayload);
                      alert('✅ Menu item added and available in POS Billing.');
                      setNewItem({ name: '', code: '', price: '', category: 'Main Course', foodType: 'veg', image: '', floor: 'Veg Floor', halfPrice: '' });
                      setImagePreview('');
                      loadInitialData();
                      setActiveTab('billing');
                    } catch (err) {
                      alert('Add failed: ' + (err.response?.data?.message || err.message));
                    }
                  }}
                  style={{ ...ui.adminFormFull, border: '2px solid #e2e8f0' }}
                >
                  <h3 style={{ margin: '0 0 16px 0', fontSize: '16px', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '8px' }}>🍔 Add Menu Item</h3>

                  {/* Image upload section */}
                  <div style={{ display: 'flex', gap: '16px', marginBottom: '14px', alignItems: 'flex-start' }}>
                    {/* Image Preview Box */}
                    <div style={{ flexShrink: 0 }}>
                      <div style={{
                        width: '110px', height: '90px', borderRadius: '10px', overflow: 'hidden',
                        border: '2px dashed #cbd5e1', backgroundColor: '#f8fafc',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative'
                      }}>
                        {(imagePreview || newItem.image) ? (
                          <img
                            src={imagePreview || newItem.image}
                            alt="preview"
                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                            onError={(e) => { e.target.src = 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=300'; }}
                          />
                        ) : (
                          <div style={{ textAlign: 'center', color: '#94a3b8', fontSize: '11px', padding: '6px' }}>
                            <div style={{ fontSize: '28px', marginBottom: '4px' }}>🍽️</div>
                            <span>Photo</span>
                          </div>
                        )}
                      </div>
                      <label style={{
                        display: 'block', marginTop: '6px', padding: '5px 8px',
                        backgroundColor: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: '6px',
                        fontSize: '10px', fontWeight: 'bold', color: '#475569', cursor: 'pointer', textAlign: 'center'
                      }}>
                        📷 Upload
                        <input
                          type="file"
                          accept="image/*"
                          style={{ display: 'none' }}
                          onChange={(e) => {
                            const file = e.target.files[0];
                            if (file) {
                              const reader = new FileReader();
                              reader.onloadend = () => {
                                setImagePreview(reader.result);
                                setNewItem(prev => ({ ...prev, image: reader.result }));
                              };
                              reader.readAsDataURL(file);
                            }
                          }}
                        />
                      </label>
                    </div>

                    {/* Name + Code + Image URL */}
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '8px' }}>
                        <div>
                          <label style={ui.labelStyle}>Item Name *</label>
                          <input placeholder="e.g. Paneer Butter Masala" value={newItem.name} onChange={(e) => setNewItem({ ...newItem, name: e.target.value })} style={ui.inputFieldFull} required />
                        </div>
                        <div>
                          <label style={ui.labelStyle}>Short Code</label>
                          <input placeholder="e.g. PBM" value={newItem.code} onChange={(e) => setNewItem({ ...newItem, code: e.target.value })} style={ui.inputFieldFull} />
                        </div>
                      </div>
                      <div>
                        <label style={ui.labelStyle}>Image URL (optional - if no image is uploaded)</label>
                        <input
                          placeholder="https://... ya khali chhodo"
                          value={newItem.image && !newItem.image.startsWith('data:') ? newItem.image : ''}
                          onChange={(e) => {
                            setNewItem({ ...newItem, image: e.target.value });
                            setImagePreview(e.target.value);
                          }}
                          style={ui.inputFieldFull}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Price + Half Price + Food Type */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px', marginBottom: '10px' }}>
                    <div>
                      <label style={ui.labelStyle}>Full Price (₹) *</label>
                      <input type="number" placeholder="260" value={newItem.price} onChange={(e) => setNewItem({ ...newItem, price: e.target.value })} style={ui.inputFieldFull} required />
                    </div>
                    <div>
                      <label style={ui.labelStyle}>Half Price (₹)</label>
                      <input type="number" placeholder="Auto 60%" value={newItem.halfPrice} onChange={(e) => setNewItem({ ...newItem, halfPrice: e.target.value })} style={ui.inputFieldFull} />
                    </div>
                    <div>
                      <label style={ui.labelStyle}>Food Type</label>
                      <select value={newItem.foodType} onChange={(e) => setNewItem({ ...newItem, foodType: e.target.value })} style={ui.inputFieldFull}>
                        <option value="veg">🟢 Veg</option>
                      </select>
                    </div>
                  </div>

                  {/* Category + Floor */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '14px' }}>
                    <div>
                      <label style={ui.labelStyle}>Category</label>
                      <select value={newItem.category} onChange={(e) => setNewItem({ ...newItem, category: e.target.value })} style={ui.inputFieldFull}>
                        {categories.filter(c => c !== 'All').map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </div>
                    <div>
                      <label style={ui.labelStyle}>Floor / Menu Section</label>
                      <select value={newItem.floor} onChange={(e) => setNewItem({ ...newItem, floor: e.target.value })} style={ui.inputFieldFull}>
                        <option value="Veg Floor">🥬 Veg Floor</option>
                        <option value="Birthday Party Zone">🎉 Birthday Party Zone</option>
                      </select>
                    </div>
                  </div>

                  <button type="submit" style={{ ...ui.submitBtn, width: '100%', padding: '11px', fontSize: '14px', backgroundColor: '#fc4f1a', borderRadius: '8px' }}>
                    ✅ Save Dish & Go to POS Billing
                  </button>
                </form>

                {/* Add Table */}
                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    try {
                      await api.post('/tables/add', newTable);
                      alert('Table Added!');
                      setNewTable({ tableNumber: '', capacity: '4', floor: 'Floor 1', type: 'Dining' });
                      loadInitialData();
                    } catch (err) {
                      alert('Add failed: ' + (err.response?.data?.message || err.message));
                    }
                  }}
                  style={ui.adminFormFull}
                >
                  <h3 style={{ margin: '0 0 12px 0', fontSize: '16px', color: '#0f172a' }}>🪑 Add Dining Table</h3>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '10px' }}>
                    <div>
                      <label style={ui.labelStyle}>Table No.</label>
                      <input placeholder="e.g. 12" value={newTable.tableNumber} onChange={(e) => setNewTable({ ...newTable, tableNumber: e.target.value })} style={ui.inputFieldFull} required />
                    </div>
                    <div>
                      <label style={ui.labelStyle}>Seating Pax</label>
                      <input type="number" placeholder="4" value={newTable.capacity} onChange={(e) => setNewTable({ ...newTable, capacity: e.target.value })} style={ui.inputFieldFull} required />
                    </div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '12px' }}>
                    <div>
                      <label style={ui.labelStyle}>Floor</label>
                      <select value={newTable.floor} onChange={(e) => setNewTable({ ...newTable, floor: e.target.value })} style={ui.inputFieldFull}>
                        <option value="Floor 1">Floor 1 (Dining)</option>
                        <option value="Floor 2">Floor 2 (Party)</option>
                      </select>
                    </div>
                    <div>
                      <label style={ui.labelStyle}>Type</label>
                      <select value={newTable.type} onChange={(e) => setNewTable({ ...newTable, type: e.target.value })} style={ui.inputFieldFull}>
                        <option value="Dining">Dining</option>
                        <option value="Cafe">Cafe</option>
                        <option value="Party">Party</option>
                      </select>
                    </div>
                  </div>
                  <button type="submit" style={{ ...ui.submitBtn, width: '100%', backgroundColor: '#fc4f1a' }}>+ Save Table</button>
                </form>
              </div>
{/* Existing Items Quick Out-of-Stock Toggle */}

<div style={ui.adminListFull}>
  <div style={{display: 'flex',justifyContent: 'space-between',alignItems: 'center',marginBottom: '12px'}}>
    <h3 style={{margin: 0,fontSize: '16px',color: '#0f172a'}}>
      Menu Items & 86 (Out-of-Stock) Quick Switch
    </h3> 
    <span
style={{fontSize: '12px',color: '#64748b'}}>
  {menuItems.length} items
</span>
  </div>
  <div
    style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
      gap: '10px',
      maxHeight: '350px',
      overflowY: 'auto'
    }}>
    {menuItems.map((item) => (
      <div
        key={item._id}
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '8px 12px',
          backgroundColor: '#f8fafc',
          borderRadius: '6px',
          border: '1px solid #e2e8f0'
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}
        >
          <VegNonVegBadge
            type={item.foodType || 'veg'}
            size={14}
          />
          <div>
            <div
              style={{
                fontSize: '13px',
                fontWeight: 'bold',
                color: '#0f172a'
              }}
            >
              {item.name}
            </div>
            <span
              style={{
                fontSize: '11px',
                color: '#64748b'
              }}
            >
              ₹{item.price} · {item.category}
            </span>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <button
            onClick={async () => {
              try {
                await api.patch(`/menu/toggle/${item._id}`);
                await loadInitialData();
              } catch (error) {
                console.error('Failed to toggle item availability:', error);
              }
            }}
            style={{
              backgroundColor: item.isAvailable === false ? '#fee2e2' : '#dcfce7',
              color: item.isAvailable === false ? '#ef4444' : '#15803d',
              border: 'none',
              padding: '4px 8px',
              borderRadius: '4px',
              fontSize: '10px',
              fontWeight: 'bold',
              cursor: 'pointer'
            }}
          >
            {item.isAvailable === false ? '⛔ Out of Stock' : '✅ In Stock'}
          </button>
          <button
            onClick={async () => {
              if (!window.confirm(`Are you sure you want to delete "${item.name}"?`)) return;
              try {
                await api.delete(`/menu/${item._id}`);
                await loadInitialData();
              } catch (error) {
                console.error('Failed to delete menu item:', error);
                alert('Delete failed: ' + (error.response?.data?.message || error.message));
              }
            }}
            style={{
              backgroundColor: '#fee2e2',
              color: '#b91c1c',
              border: 'none',
              padding: '4px 8px',
              borderRadius: '4px',
              fontSize: '10px',
              fontWeight: 'bold',
              cursor: 'pointer'
            }}
          >
            🗑 Delete
          </button>
        </div>
      </div>
    ))}
  </div>
</div>
</div>
)}

{/* ===================================================================
MODALS: QUICK SETTLE, SHIFT TABLE, ITEM MODIFIER
=================================================================== */}

{settleOrderModal && (
<QuickSettleModal
order={settleOrderModal}
restaurantSettings={restaurantSettings}
onClose={() => setSettleOrderModal(null)}
onConfirmSettle={handleConfirmSettle}
/>
)}

{shiftTableModal && (
<ShiftTableModal
currentTable={shiftTableModal}
availableTables={tables}
onClose={() => setShiftTableModal(null)}
onConfirmShift={handleConfirmShift}
/>
)}
{modifierModalItem && (
<ItemModifierModal
item={modifierModalItem}
onClose={() => setModifierModalItem(null)}
onSaveNotes={(notes) => {
setCart((prev) =>
prev.map((i) =>
i._id === modifierModalItem._id
? { ...i, notes }
: i
)
);
  setModifierModalItem(null);}}/>
)}
</>
)}
</div>
      </div>
);
}

export default Dashboard;
