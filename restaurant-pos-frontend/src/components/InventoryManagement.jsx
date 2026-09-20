import React, { useState, useEffect } from 'react';
import { api } from '../api';

const InventoryManagement = () => {
  const [inventory, setInventory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  // Filter and Control States
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All Items');
  const [sortBy, setSortBy] = useState('Name (A-Z)');

  // Modal Control States
  const [activeModal, setActiveModal] = useState(null); // 'add-edit', 'bulk', 'report', 'logs'
  const [isEditMode, setIsEditMode] = useState(false);
  const [currentId, setCurrentId] = useState(null);
  
  // Form State for Add / Edit
  const [formData, setFormData] = useState({
    name: '',
    category: 'Vegetables',
    unit: 'kg',
    stock: '',
    minLimit: ''
  });

  const categories = ['All Items', 'In Stock', 'Low Stock', 'Out of Stock', 'Vegetables', 'Dairy', 'Meat & Seafood', 'Dry Goods', 'Beverages', 'Other'];

  const [suppliers, setSuppliers] = useState([]);
  const [supplierForm, setSupplierForm] = useState({ name: '', contact: '', category: 'Vegetables', gstNo: '', leadTime: '' });
  const [editingSupplierId, setEditingSupplierId] = useState(null);
  const [supplierBalances, setSupplierBalances] = useState([]);
  const [expiringBatches, setExpiringBatches] = useState([]);
  const [reorderSuggestions, setReorderSuggestions] = useState([]);
  const [purchaseOrders, setPurchaseOrders] = useState([]);
  const [grnEntries, setGrnEntries] = useState([]);
  const [purchaseReturns] = useState([]);
  const [stockAdjustments] = useState([]);
  const [adjustmentRecords, setAdjustmentRecords] = useState([]);
  const [auditRecords, setAuditRecords] = useState([]);
  const [auditForm, setAuditForm] = useState({ ingredientId: '', countedQuantity: '', reason: '' });
  const [recipeUsage, setRecipeUsage] = useState([]);
  const [purchaseForm, setPurchaseForm] = useState({
    supplier: '',
    itemName: '',
    category: 'Vegetables',
    unit: 'kg',
    quantity: '',
    unitPrice: '',
    note: '',
    batchNo: '',
    expiryDate: ''
  });

  // Fetch Inventory from MongoDB
  const fetchInventory = async () => {
    try {
      const response = await api.get('/ingredients');
      const data = response.data;
      setInventory(Array.isArray(data) ? data : []);
      const adjustmentsResponse = await api.get('/stock-adjustments').catch(() => ({ data: { data: [] } }));
      setAdjustmentRecords(adjustmentsResponse.data?.data || []);
      const auditResponse = await api.get('/stock-audits').catch(() => ({ data: { data: [] } }));
      setAuditRecords(auditResponse.data?.data || []);
      const supplierResponse = await api.get('/suppliers/summary').catch(() => ({ data: { data: [] } }));
      setSupplierBalances(supplierResponse.data?.data || []);
      const supplierMasterResponse = await api.get('/suppliers').catch(() => ({ data: { data: [] } }));
      const masterSuppliers = supplierMasterResponse.data?.data || [];
      const knownSupplierNames = (supplierResponse.data?.data || []).map((supplier) => ({
        id: `summary-${supplier.supplierName}`,
        name: supplier.supplierName,
        contact: '',
        category: 'Other',
        gstNo: '',
        leadTime: ''
      }));
      const mergedSuppliers = [...masterSuppliers.map((supplier) => ({
        ...supplier,
        id: supplier._id,
        name: supplier.name
      })), ...knownSupplierNames];
      setSuppliers(mergedSuppliers.filter((supplier, index, list) => supplier.name && list.findIndex((item) => item.name.toLowerCase() === supplier.name.toLowerCase()) === index));
      const purchaseResponse = await api.get('/purchase-orders').catch(() => ({ data: { data: [] } }));
      const backendPurchases = purchaseResponse.data?.data || [];
      if (backendPurchases.length) {
        setPurchaseOrders(backendPurchases.map((order) => ({
          ...order,
          id: order._id,
          supplier: order.supplierName,
          total: order.totalAmount,
          date: order.createdAt?.slice(0, 10) || ''
        })));
      }
      const batchResponse = await api.get('/inventory-batches').catch(() => ({ data: { data: [] } }));
      const expiringResponse = await api.get('/inventory-batches/expiring?days=30').catch(() => ({ data: { data: [] } }));
      setExpiringBatches(expiringResponse.data?.data || []);
      const reorderResponse = await api.get('/ingredients/reorder-suggestions').catch(() => ({ data: { data: [] } }));
      setReorderSuggestions(reorderResponse.data?.data || []);
      const backendBatches = batchResponse.data?.data || [];
      if (backendBatches.length) {
        setGrnEntries(backendBatches.map((batch) => ({
          id: batch._id,
          orderId: batch.purchaseOrderId,
          itemName: batch.itemName,
          supplier: batch.supplierName,
          quantity: batch.quantityRemaining,
          batchNo: batch.batchNo,
          expiryDate: batch.expiryDate ? batch.expiryDate.slice(0, 10) : '',
          receivedDate: batch.receivedAt ? batch.receivedAt.slice(0, 10) : ''
        })));
      }
      setError(null);
      setLoading(false);
    } catch (err) {
      console.error('Error fetching inventory:', err);
      setInventory([]);
      setError('Inventory data is unavailable. Please try again when the backend is connected.');
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchInventory();
  }, []);

  // Open Add Modal
  const openAddModal = () => {
    setIsEditMode(false);
    setFormData({ name: '', category: 'Vegetables', unit: 'kg', stock: '', minLimit: '' });
    setActiveModal('add-edit');
  };

  // Open Edit Modal
  const openEditModal = (item) => {
    setIsEditMode(true);
    setCurrentId(item._id || item.id);
    setFormData({
      name: item.name || '',
      category: item.category || 'Vegetables',
      unit: item.unit || 'kg',
      stock: item.stock !== undefined ? item.stock : '',
      minLimit: item.minLimit !== undefined ? item.minLimit : ''
    });
    setActiveModal('add-edit');
  };

  // Handle Form Submit (Add or Update in MongoDB)
  const handleFormSubmit = async (e) => {
    e.preventDefault();
    try {
      const payload = {
        ...formData,
        stock: Number(formData.stock),
        minLimit: Number(formData.minLimit)
      };

      if (isEditMode) await api.put(`/ingredients/${currentId}`, payload);
      else await api.post('/ingredients', payload);

      fetchInventory(); // Refresh data
      setActiveModal(null);
      alert(isEditMode ? 'Item successfully updated!' : 'New item successfully added!');
    } catch (err) {
      console.error('Error saving item:', err);
      alert('An error occurred while saving the data.');
    }
  };

  // Delete Item Function
  const handleDeleteItem = async (id) => {
    if (window.confirm('Are you sure you want to delete this item?')) {
      try {
        await api.delete(`/ingredients/${id}`);

        setInventory(inventory.filter(item => (item._id || item.id) !== id));
        alert('Item successfully deleted!');
      } catch (err) {
        console.error('Error deleting item:', err);
        alert('An error occurred while deleting the item.');
      }
    }
  };

  // Filter and Sort Logic
  const filteredInventory = inventory.filter(item => {
    const stock = Number(item.stock ?? item.currentStock ?? 0);
    const minLimit = Number(item.minLimit ?? item.minStockAlert ?? 5);
    const isOut = stock <= 0;
    const isLow = stock <= minLimit && !isOut;
    const isIn = !isOut && !isLow;

    const matchesSearch = item.name.toLowerCase().includes(searchTerm.toLowerCase());
    
    let matchesCategory = true;
    if (selectedCategory === 'All Items') matchesCategory = true;
    else if (selectedCategory === 'In Stock') matchesCategory = isIn;
    else if (selectedCategory === 'Low Stock') matchesCategory = isLow;
    else if (selectedCategory === 'Out of Stock') matchesCategory = isOut;
    else matchesCategory = item.category === selectedCategory;

    return matchesSearch && matchesCategory;
  }).sort((a, b) => {
    if (sortBy === 'Name (A-Z)') return a.name.localeCompare(b.name);
    if (sortBy === 'Stock (Low to High)') return (a.stock || 0) - (b.stock || 0);
    if (sortBy === 'Stock (High to Low)') return (b.stock || 0) - (a.stock || 0);
    return 0;
  });

  // Computed Metrics
  const totalItems = inventory.length;
  const getStockValue = (item) => Number(item.stock ?? item.currentStock ?? 0);
  const getMinStockValue = (item) => Number(item.minLimit ?? item.minStockAlert ?? 5);
  const inStockCount = inventory.filter(i => getStockValue(i) > getMinStockValue(i)).length;
  const lowStockCount = inventory.filter(i => getStockValue(i) <= getMinStockValue(i) && getStockValue(i) > 0).length;
  const outOfStockCount = inventory.filter(i => getStockValue(i) <= 0).length;
  const pendingApprovalCount = purchaseOrders.filter(order => order.status === 'Pending').length;
  const purchaseReturnCount = purchaseReturns.length;
  const totalWasteLoss = stockAdjustments.reduce((sum, item) => sum + Math.abs(Number(item.quantity || 0)), 0);
  const totalRecipeConsumption = recipeUsage.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
  const expiringSoonCount = grnEntries.filter(entry => {
    const expiry = new Date(entry.expiryDate);
    const now = new Date();
    const daysLeft = (expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
    return daysLeft <= 30 && daysLeft >= 0;
  }).length;

  const handlePurchaseSubmit = async (e) => {
    e.preventDefault();
    const quantity = Number(purchaseForm.quantity || 0);
    const unitPrice = Number(purchaseForm.unitPrice || 0);

    if (!purchaseForm.itemName || quantity <= 0 || unitPrice <= 0) {
      alert('Please fill valid item name, quantity and price.');
      return;
    }

    try {
      await api.post('/purchase-orders', {
        supplierName: purchaseForm.supplier,
        itemName: purchaseForm.itemName,
        category: purchaseForm.category,
        unit: purchaseForm.unit,
        quantity,
        unitPrice,
        totalAmount: quantity * unitPrice,
        batchNo: purchaseForm.batchNo,
        expiryDate: purchaseForm.expiryDate || null,
        expectedDate: purchaseForm.expiryDate,
        notes: purchaseForm.note
      });
      await fetchInventory();
    } catch (error) {
      alert(error.response?.data?.message || 'Purchase order create failed.');
      return;
    }
    setPurchaseForm({
      supplier: suppliers[0]?.name || '',
      itemName: '',
      category: 'Vegetables',
      unit: 'kg',
      quantity: '',
      unitPrice: '',
      note: '',
      batchNo: '',
      expiryDate: ''
    });
    setActiveModal(null);
    alert('Supplier purchase request created and sent for approval.');
  };

  const handlePurchaseStatus = async (orderId, nextStatus) => {
    const order = purchaseOrders.find(item => item.id === orderId);
    if (!order) return;
    try {
      await api.patch(`/purchase-orders/${orderId}/status`, { status: nextStatus });
      await fetchInventory();
      alert(nextStatus === 'Received' ? `Purchase received: ${order.itemName} stock updated.` : 'Purchase order approved.');
    } catch (error) {
      alert(error.response?.data?.message || 'Purchase status update failed.');
    }
  };

  const handleReceiveSubmit = async (e) => {
    e.preventDefault();
    const quantity = Number(purchaseForm.quantity || 0);
    const unitPrice = Number(purchaseForm.unitPrice || 0);
    if (!purchaseForm.itemName || !purchaseForm.supplier || quantity <= 0 || unitPrice <= 0) {
      alert('Please fill item, supplier, valid quantity and price.');
      return;
    }
    try {
      await api.post('/purchase-orders/receive', {
        supplierName: purchaseForm.supplier,
        itemName: purchaseForm.itemName,
        category: purchaseForm.category,
        unit: purchaseForm.unit,
        quantity,
        unitPrice,
        batchNo: purchaseForm.batchNo,
        expiryDate: purchaseForm.expiryDate || null,
        notes: purchaseForm.note
      });
      await fetchInventory();
      setPurchaseForm({ supplier: '', itemName: '', category: 'Vegetables', unit: 'kg', quantity: '', unitPrice: '', note: '', batchNo: '', expiryDate: '' });
      setActiveModal(null);
      alert('Raw material received and stock updated successfully.');
    } catch (error) {
      alert(error.response?.data?.message || 'Unable to save received material.');
    }
  };

  const handleSupplierSubmit = async (e) => {
    e.preventDefault();
    if (!supplierForm.name || !supplierForm.contact) {
      alert('Supplier name and contact are required.');
      return;
    }

    try {
      const response = editingSupplierId
        ? await api.put(`/suppliers/${editingSupplierId}`, supplierForm)
        : await api.post('/suppliers', supplierForm);
      const supplier = response.data?.data;
      if (supplier) {
        const normalized = { ...supplier, id: supplier._id };
        setSuppliers(prev => editingSupplierId
          ? prev.map(item => item.id === editingSupplierId ? normalized : item)
          : [normalized, ...prev]);
      }
      setSupplierForm({ name: '', contact: '', category: 'Vegetables', gstNo: '', leadTime: '' });
      setEditingSupplierId(null);
      setActiveModal(null);
      alert(editingSupplierId ? 'Supplier updated successfully.' : 'Supplier master updated successfully.');
    } catch (error) {
      alert(error.response?.data?.message || 'Unable to save supplier.');
    }
  };

  const editSupplier = (supplier) => {
    setEditingSupplierId(supplier.id);
    setSupplierForm({
      name: supplier.name || '',
      contact: supplier.contact || '',
      category: supplier.category || 'Other',
      gstNo: supplier.gstNo || '',
      leadTime: supplier.leadTime || ''
    });
  };

  const deactivateSupplier = async (supplier) => {
    if (!supplier.id || !window.confirm(`Deactivate supplier "${supplier.name}"? Existing purchase history will remain.`)) return;
    try {
      await api.delete(`/suppliers/${supplier.id}`);
      setSuppliers(prev => prev.filter(item => item.id !== supplier.id));
      alert('Supplier deactivated successfully.');
    } catch (error) {
      alert(error.response?.data?.message || 'Unable to deactivate supplier.');
    }
  };

  const recordSupplierPayment = async (supplierName) => {
    const amount = Number(window.prompt(`Payment amount for ${supplierName}:`, '0'));
    if (!Number.isFinite(amount) || amount <= 0) return;
    const paymentMode = window.prompt('Payment mode (Cash / UPI / Bank Transfer / Card / Cheque):', 'Bank Transfer');
    const reference = window.prompt('Reference / transaction number (optional):', '');
    try {
      await api.post('/suppliers/payments', { supplierName, amount, paymentMode, reference });
      await fetchInventory();
      alert(`₹${amount.toFixed(2)} supplier payment recorded.`);
    } catch (error) {
      alert(error.response?.data?.message || 'Supplier payment failed.');
    }
  };

  const requestBatchDisposal = async (batch) => {
    const reason = window.prompt(`Disposal reason for batch ${batch.batchNo}:`, 'Expired stock');
    if (reason === null) return;
    try {
      await api.post(`/inventory-batches/${batch.id}/disposal-request`, { reason });
      alert('Batch disposal request sent for manager approval.');
    } catch (error) {
      alert(error.response?.data?.message || 'Disposal request failed.');
    }
  };

  const handlePurchaseReturn = async (itemName, supplier, quantity) => {
    const validQty = Number(quantity || 0);
    if (!itemName || validQty <= 0) {
      alert('Please enter a valid return quantity.');
      return;
    }

    try {
      await api.post('/purchase-orders/returns', {
        itemName,
        supplierName: supplier,
        quantity: validQty,
        reason: 'Return due to quality / expired stock'
      });
      await fetchInventory();
      alert(`${validQty} ${itemName} returned and stock adjusted.`);
    } catch (error) {
      alert(error.response?.data?.message || 'Purchase return failed.');
    }
  };

  const handleStockAdjustment = async (itemName, change, reason) => {
    const qty = Math.abs(Number(change || 0));
    if (!itemName || !qty) {
      alert('Please enter a valid adjustment quantity.');
      return;
    }

    try {
      const item = inventory.find((entry) => entry.name.toLowerCase() === itemName.toLowerCase());
      await api.post('/stock-adjustments/waste', {
        ingredientId: item?._id,
        ingredientName: itemName,
        quantity: qty,
        reason: reason || 'Waste loss'
      });
      alert(`${qty} ${itemName} wastage request sent for manager approval.`);
      fetchInventory();
    } catch (error) {
      alert(error.response?.data?.message || 'Wastage request failed.');
    }
  };

  const handleStockAudit = async (e) => {
    e.preventDefault();
    const ingredient = inventory.find((item) => (item._id || item.id) === auditForm.ingredientId);
    const countedQuantity = Number(auditForm.countedQuantity);
    if (!ingredient || !Number.isFinite(countedQuantity) || countedQuantity < 0) {
      alert('Select an item and enter a valid counted quantity.');
      return;
    }
    try {
      const response = await api.post('/stock-audits', {
        ingredientId: auditForm.ingredientId,
        countedQuantity,
        reason: auditForm.reason || 'Physical stock count'
      });
      setAuditRecords((previous) => [response.data.data, ...previous]);
      await fetchInventory();
      setAuditForm({ ingredientId: '', countedQuantity: '', reason: '' });
      setActiveModal(null);
      alert(`Stock audit saved. Variance: ${Number(response.data.data.variance || 0)}`);
    } catch (error) {
      alert(error.response?.data?.message || 'Unable to save stock audit.');
    }
  };

  const reviewWasteRequest = async (adjustmentId, action) => {
    try {
      await api.post(`/stock-adjustments/${adjustmentId}/${action}`);
      await fetchInventory();
      alert(`Wastage request ${action}d successfully.`);
    } catch (error) {
      alert(error.response?.data?.message || `Unable to ${action} wastage request.`);
    }
  };

  const handleRecipeConsumption = (ingredientName, qty) => {
    const consumed = Number(qty || 0);
    if (!ingredientName || consumed <= 0) {
      alert('Please choose a valid ingredient and quantity.');
      return;
    }

    setRecipeUsage(prev => [{
      id: `ru-${Date.now()}`,
      recipe: 'Chef Production Issue',
      ingredient: ingredientName,
      quantity: consumed,
      unit: 'kg',
      date: new Date().toISOString().split('T')[0]
    }, ...prev]);

    setInventory(prev => prev.map(item =>
      item.name.toLowerCase() === ingredientName.toLowerCase()
        ? { ...item, stock: Math.max(0, Number(item.stock || 0) - consumed) }
        : item
    ));

    alert(`${consumed} ${ingredientName} consumed for recipe production.`);
  };

  return (
    <div className="inventory-page" style={{ display: 'flex', flexDirection: 'column', height: '100%', width: '100%', boxSizing: 'border-box', background: '#f8fafc', overflowY: 'auto', overflowX: 'hidden', padding: '28px', fontFamily: 'Inter, sans-serif' }}>
      <div className="inventory-shell" style={{ maxWidth: '1440px', width: '100%', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '22px', paddingBottom: '40px', minWidth: 0 }}>
        
        {/* Top Header Card */}
        <div className="inventory-header" style={{ background: '#ffffff', padding: '26px', borderRadius: '14px', border: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.02)' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '22px', color: '#0f172a', fontWeight: '800', display: 'flex', alignItems: 'center', gap: '10px', letterSpacing: '-0.5px' }}>
              <span style={{ background: '#f1f5f9', padding: '8px', borderRadius: '10px' }}>📦</span> Inventory Management
            </h2>
            <p style={{ margin: '6px 0 0', fontSize: '13px', color: '#64748b' }}>Track stock, manage items and keep your kitchen running smoothly.</p>
          </div>
          <button 
            onClick={openAddModal}
            style={{ background: '#0f172a', color: '#fff', border: 'none', padding: '10px 18px', borderRadius: '9px', fontWeight: '600', cursor: 'pointer', fontSize: '13px', boxShadow: '0 2px 4px rgba(15, 23, 42, 0.2)' }}
          >
            + Add New Item
          </button>
        </div>

        {/* Metric Summary Cards Bar */}
        <div className="inventory-metrics" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px' }}>
          <div onClick={() => setSelectedCategory('All Items')} style={{ background: '#fff', padding: '18px 20px', borderRadius: '12px', border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: '14px', cursor: 'pointer' }}>
            <div style={{ background: '#f1f5f9', padding: '12px', borderRadius: '10px', fontSize: '18px' }}>📦</div>
            <div>
              <div style={{ fontSize: '11px', color: '#64748b', fontWeight: '700', textTransform: 'uppercase' }}>Total Items</div>
              <div style={{ fontSize: '20px', fontWeight: '800', color: '#0f172a', marginTop: '2px' }}>{totalItems}</div>
            </div>
          </div>
          <div onClick={() => setSelectedCategory('In Stock')} style={{ background: '#fff', padding: '18px 20px', borderRadius: '12px', border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: '14px', cursor: 'pointer' }}>
            <div style={{ background: '#ecfdf5', padding: '12px', borderRadius: '10px', fontSize: '18px' }}>✅</div>
            <div>
              <div style={{ fontSize: '11px', color: '#059669', fontWeight: '700', textTransform: 'uppercase' }}>In Stock</div>
              <div style={{ fontSize: '20px', fontWeight: '800', color: '#065f46', marginTop: '2px' }}>{inStockCount}</div>
            </div>
          </div>
          <div onClick={() => setSelectedCategory('Low Stock')} style={{ background: '#fff', padding: '18px 20px', borderRadius: '12px', border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: '14px', cursor: 'pointer' }}>
            <div style={{ background: '#fffbeb', padding: '12px', borderRadius: '10px', fontSize: '18px' }}>⚠️</div>
            <div>
              <div style={{ fontSize: '11px', color: '#d97706', fontWeight: '700', textTransform: 'uppercase' }}>Low Stock</div>
              <div style={{ fontSize: '20px', fontWeight: '800', color: '#b45309', marginTop: '2px' }}>{lowStockCount}</div>
            </div>
          </div>
          <div onClick={() => setSelectedCategory('Out of Stock')} style={{ background: '#fff', padding: '18px 20px', borderRadius: '12px', border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: '14px', cursor: 'pointer' }}>
            <div style={{ background: '#fef2f2', padding: '12px', borderRadius: '10px', fontSize: '18px' }}>🚨</div>
            <div>
              <div style={{ fontSize: '11px', color: '#dc2626', fontWeight: '700', textTransform: 'uppercase' }}>Out of Stock</div>
              <div style={{ fontSize: '20px', fontWeight: '800', color: '#991b1b', marginTop: '2px' }}>{outOfStockCount}</div>
            </div>
          </div>
        </div>

        {expiringBatches.length > 0 && (
          <div style={{ background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: '12px', padding: '14px 18px', color: '#9a3412' }}>
            <div style={{ fontWeight: 800, fontSize: '13px', marginBottom: '6px' }}>Expiry Alert · {expiringBatches.length} batch(es) within 30 days</div>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {expiringBatches.slice(0, 6).map((batch) => (
                <span key={batch._id} style={{ padding: '5px 8px', background: '#ffedd5', borderRadius: '6px', fontSize: '11px', fontWeight: 700 }}>
                  {batch.itemName} · {batch.batchNo} · {batch.expiryDate ? new Date(batch.expiryDate).toLocaleDateString('en-IN') : 'No date'}
                </span>
              ))}
            </div>
          </div>
        )}
        {reorderSuggestions.length > 0 && (
          <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '12px', padding: '14px 18px', color: '#1e40af' }}>
            <div style={{ fontWeight: 800, fontSize: '13px', marginBottom: '6px' }}>Reorder Suggestions · {reorderSuggestions.length} item(s)</div>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {reorderSuggestions.slice(0, 8).map((item) => (
                <span key={item._id} style={{ padding: '5px 8px', background: '#dbeafe', borderRadius: '6px', fontSize: '11px', fontWeight: 700 }}>
                  {item.name}: order {item.suggestedQuantity} {item.unit} · ₹{item.estimatedCost}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Main Content Layout */}
        <div className="inventory-main-grid" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(280px, 340px)', gap: '22px', alignItems: 'start', minWidth: 0 }}>
          
          {/* Left Column: Filters, Search & Table */}
          <div className="inventory-list-column" style={{ display: 'flex', flexDirection: 'column', gap: '16px', minWidth: 0 }}>
            
            {/* Category Filter Tabs */}
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', background: '#fff', padding: '12px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
              {categories.map(cat => (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  style={{
                    padding: '7px 14px',
                    borderRadius: '8px',
                    border: 'none',
                    fontSize: '12px',
                    fontWeight: '700',
                    cursor: 'pointer',
                    background: selectedCategory === cat ? '#0f172a' : '#f1f5f9',
                    color: selectedCategory === cat ? '#fff' : '#475569',
                    transition: 'all 0.15s ease'
                  }}
                >
                  {cat}
                </button>
              ))}
            </div>

            {/* Search and Sort Control Bar */}
            <div className="inventory-search-bar" style={{ background: '#fff', padding: '14px 18px', borderRadius: '12px', border: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px' }}>
              <input 
                type="text" 
                placeholder="🔍 Search items by name..." 
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                style={{ flex: 1, padding: '10px 14px', border: '1px solid #cbd5e1', borderRadius: '8px', fontSize: '13px', outline: 'none', background: '#f8fafc' }}
              />
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: '#64748b', fontWeight: '600' }}>
                <span>Sort by:</span>
                <select 
                  value={sortBy}
                  onChange={e => setSortBy(e.target.value)}
                  style={{ padding: '9px 12px', border: '1px solid #cbd5e1', borderRadius: '8px', fontSize: '12px', background: '#f8fafc', fontWeight: '600', color: '#0f172a' }}
                >
                  <option value="Name (A-Z)">Name (A-Z)</option>
                  <option value="Stock (Low to High)">Stock (Low to High)</option>
                  <option value="Stock (High to Low)">Stock (High to Low)</option>
                </select>
              </div>
            </div>

            {/* Inventory Table Card */}
            <div className="inventory-table-card" style={{ background: '#ffffff', borderRadius: '14px', border: '1px solid #e2e8f0', overflow: 'hidden', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.02)' }}>
              {loading ? (
                <div style={{ padding: '60px', textAlign: 'center', color: '#64748b', fontSize: '14px', fontWeight: '500' }}>Fetching inventory data from database...</div>
              ) : error ? (
                <div style={{ padding: '60px', textAlign: 'center', color: '#dc2626', fontSize: '14px', fontWeight: '600' }}>{error}</div>
              ) : filteredInventory.length === 0 ? (
                <div style={{ padding: '60px 20px', textAlign: 'center', color: '#64748b' }}>
                  <div style={{ fontSize: '42px', marginBottom: '10px' }}>📂</div>
                  <div style={{ fontSize: '16px', fontWeight: 'bold', color: '#0f172a' }}>No Ingredients Found</div>
                  <p style={{ fontSize: '13px', margin: '6px 0 0' }}>No items match your search or filter criteria.</p>
                </div>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
                  <thead>
                    <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#475569', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.8px', fontWeight: '700' }}>
                      <th style={{ padding: '14px 18px' }}>#</th>
                      <th style={{ padding: '14px 18px' }}>Item Name</th>
                      <th style={{ padding: '14px 18px' }}>Category</th>
                      <th style={{ padding: '14px 18px' }}>Unit</th>
                      <th style={{ padding: '14px 18px' }}>Current Stock</th>
                      <th style={{ padding: '14px 18px' }}>Min Stock</th>
                      <th style={{ padding: '14px 18px' }}>Status</th>
                      <th style={{ padding: '14px 18px', textAlign: 'center' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredInventory.map((item, index) => {
                      const stock = getStockValue(item);
                      const minLimit = getMinStockValue(item);
                      const isOut = stock <= 0;
                      const isLow = stock <= minLimit && !isOut;
                      const itemId = item._id || item.id;

                      return (
                        <tr key={itemId} style={{ borderBottom: '1px solid #f1f5f9', transition: 'background 0.15s ease' }}>
                          <td style={{ padding: '14px 18px', color: '#64748b', fontWeight: '600' }}>{index + 1}</td>
                          <td style={{ padding: '14px 18px', fontWeight: '700', color: '#0f172a' }}>{item.name}</td>
                          <td style={{ padding: '14px 18px' }}>
                            <span style={{ fontSize: '11px', fontWeight: '700', padding: '3px 8px', borderRadius: '6px', background: '#f1f5f9', color: '#334155' }}>
                              {item.category || 'General'}
                            </span>
                          </td>
                          <td style={{ padding: '14px 18px', color: '#64748b', fontWeight: '600' }}>{item.unit || 'kg'}</td>
                          <td style={{ padding: '14px 18px', color: '#0f172a', fontWeight: '700' }}>{stock}</td>
                          <td style={{ padding: '14px 18px', color: '#64748b', fontWeight: '600' }}>{minLimit}</td>
                          <td style={{ padding: '14px 18px' }}>
                            <span style={{
                              padding: '4px 10px',
                              borderRadius: '6px',
                              fontSize: '11px',
                              fontWeight: '700',
                              background: isOut ? '#fef2f2' : isLow ? '#fffbeb' : '#ecfdf5',
                              color: isOut ? '#dc2626' : isLow ? '#d97706' : '#059669',
                              border: isOut ? '1px solid #fecaca' : isLow ? '1px solid #fde68a' : '1px solid #a7f3d0'
                            }}>
                              {isOut ? '● Out of Stock' : isLow ? '● Low Stock' : '● In Stock'}
                            </span>
                          </td>
                          <td style={{ padding: '14px 18px', textAlign: 'center' }}>
                            <div style={{ display: 'flex', gap: '6px', justifyContent: 'center' }}>
                              <button 
                                onClick={() => openEditModal(item)}
                                title="Edit" 
                                style={{ padding: '5px 8px', background: '#e0f2fe', color: '#0369a1', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '11px' }}
                              >
                                ✏️
                              </button>
                              <button 
                                onClick={() => handleDeleteItem(itemId)}
                                title="Delete" 
                                style={{ padding: '5px 8px', background: '#fee2e2', color: '#dc2626', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '11px' }}
                              >
                                🗑️
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>

          </div>

          {/* Right Column: Side Widgets */}
          <div className="inventory-side-column" style={{ display: 'flex', flexDirection: 'column', gap: '20px', minWidth: 0 }}>
            
            {/* Low Stock Alerts Widget */}
            <div style={{ background: '#fff', padding: '20px', borderRadius: '14px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.02)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                <h3 style={{ margin: 0, fontSize: '14px', fontWeight: '800', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  ⚠️ Low/Out of Stock Alerts
                </h3>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {inventory.filter(i => getStockValue(i) <= getMinStockValue(i)).slice(0, 4).map(item => {
                  const isOut = getStockValue(item) <= 0;
                  return (
                    <div key={item._id || item.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                      <div>
                        <div style={{ fontSize: '12px', fontWeight: '700', color: '#0f172a' }}>{item.name}</div>
                        <div style={{ fontSize: '11px', color: '#64748b' }}>{getStockValue(item)} {item.unit || 'kg'} (Min: {getMinStockValue(item)})</div>
                      </div>
                      <span style={{ fontSize: '10px', fontWeight: '750', padding: '3px 8px', borderRadius: '6px', background: isOut ? '#fee2e2' : '#fef3c7', color: isOut ? '#dc2626' : '#d97706' }}>
                        {isOut ? 'Out of Stock' : 'Low Stock'}
                      </span>
                    </div>
                  );
                })}
                {inventory.filter(i => getStockValue(i) <= getMinStockValue(i)).length === 0 && (
                  <div style={{ fontSize: '12px', color: '#059669', textAlign: 'center', padding: '10px', fontWeight: '600' }}>All stock levels are optimal! 🎉</div>
                )}
              </div>
            </div>

            {/* Quick Actions Widget */}
            <div style={{ background: '#fff', padding: '20px', borderRadius: '14px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.02)' }}>
              <h3 style={{ margin: '0 0 14px', fontSize: '14px', fontWeight: '800', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '6px' }}>
                ⚡ Quick Actions
              </h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <button onClick={() => setActiveModal('bulk')} style={{ padding: '12px', background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: '10px', fontSize: '12px', fontWeight: '700', color: '#334155', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontSize: '16px' }}>🔄</span> Bulk Update
                </button>
                <button onClick={() => setActiveModal('report')} style={{ padding: '12px', background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: '10px', fontSize: '12px', fontWeight: '700', color: '#334155', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontSize: '16px' }}>📊</span> Report
                </button>
                <button onClick={() => setActiveModal('logs')} style={{ padding: '12px', background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: '10px', fontSize: '12px', fontWeight: '700', color: '#334155', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontSize: '16px' }}>👁️</span> View Logs
                </button>
                <button onClick={() => { setAuditForm({ ingredientId: inventory[0]?._id || '', countedQuantity: '', reason: '' }); setActiveModal('audit'); }} style={{ padding: '12px', background: '#f5f3ff', border: '1px solid #ddd6fe', borderRadius: '10px', fontSize: '12px', fontWeight: '700', color: '#5b21b6', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontSize: '16px' }}>🧾</span> Stock Audit
                </button>
                <button onClick={() => setActiveModal('suppliers')} style={{ padding: '12px', background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: '10px', fontSize: '12px', fontWeight: '700', color: '#0c4a6e', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontSize: '16px' }}>🏪</span> Supplier Master
                </button>
                <button onClick={() => setActiveModal('grn')} style={{ padding: '12px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '10px', fontSize: '12px', fontWeight: '700', color: '#166534', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontSize: '16px' }}>📦</span> GRN / Inward
                </button>
                <button onClick={() => { setPurchaseForm({ supplier: suppliers[0]?.name || '', itemName: '', category: 'Vegetables', unit: 'kg', quantity: '', unitPrice: '', note: '', batchNo: '', expiryDate: '' }); setActiveModal('receive'); }} style={{ padding: '12px', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '10px', fontSize: '12px', fontWeight: '700', color: '#1d4ed8', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px', gridColumn: '1 / -1' }}>
                  <span style={{ fontSize: '16px' }}>✅</span> Receive Raw Material
                </button>
                <button onClick={() => {
                  const itemName = window.prompt('Enter item name for purchase return:', inventory[0]?.name || '');
                  const supplier = window.prompt('Enter supplier name:', suppliers[0]?.name || '');
                  const quantity = Number(window.prompt('Return quantity:', '1'));
                  if (itemName) handlePurchaseReturn(itemName, supplier || 'Supplier', quantity);
                }} style={{ padding: '12px', background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: '10px', fontSize: '12px', fontWeight: '700', color: '#9a4d00', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontSize: '16px' }}>↩️</span> Return
                </button>
                <button onClick={() => {
                  const itemName = window.prompt('Enter item name for stock adjustment:', inventory[0]?.name || '');
                  const change = Number(window.prompt('Waste quantity:', '1'));
                  const reason = window.prompt('Reason for adjustment:', 'Waste loss');
                  if (itemName) handleStockAdjustment(itemName, change, reason || 'Stock adjustment');
                }} style={{ padding: '12px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '10px', fontSize: '12px', fontWeight: '700', color: '#991b1b', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontSize: '16px' }}>🧮</span> Waste / Adj.
                </button>
                <button onClick={() => {
                  const ingredient = window.prompt('Ingredient for recipe consumption:', inventory[0]?.name || '');
                  const qty = Number(window.prompt('Quantity used:', '1'));
                  if (ingredient) handleRecipeConsumption(ingredient, qty);
                }} style={{ padding: '12px', background: '#eef2ff', border: '1px solid #c7d2fe', borderRadius: '10px', fontSize: '12px', fontWeight: '700', color: '#3730a3', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontSize: '16px' }}>🍲</span> Recipe Usage
                </button>
                <button onClick={async () => {
                  const item = inventory[0];
                  const itemName = window.prompt('Ingredient to transfer:', item?.name || '');
                  const ingredient = inventory.find((entry) => entry.name.toLowerCase() === String(itemName || '').trim().toLowerCase());
                  if (!ingredient) return;
                  const quantity = Number(window.prompt(`Quantity (${ingredient.unit}):`, '1'));
                  const fromLocation = window.prompt('From location:', 'Main Store');
                  const toLocation = window.prompt('To location:', 'Kitchen');
                  if (!Number.isFinite(quantity) || !fromLocation || !toLocation) return;
                  try {
                    await api.post('/stock-transfers', { ingredientId: ingredient._id, quantity, fromLocation, toLocation });
                    alert('Stock transfer recorded successfully.');
                    fetchInventory();
                  } catch (error) {
                    alert(error.response?.data?.message || 'Stock transfer failed.');
                  }
                }} style={{ padding: '12px', background: '#fdf4ff', border: '1px solid #e9d5ff', borderRadius: '10px', fontSize: '12px', fontWeight: '700', color: '#7e22ce', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontSize: '16px' }}>↔️</span> Stock Transfer
                </button>
                <button onClick={() => setActiveModal('purchase')} style={{ padding: '12px', background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: '10px', fontSize: '12px', fontWeight: '700', color: '#166534', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px', gridColumn: '1 / -1' }}>
                  <span style={{ fontSize: '16px' }}>📥</span> Supplier Purchase
                </button>
              </div>
            </div>

          </div>

        </div>

      </div>

      {/* ================= MODALS SECTION ================= */}

      {/* 1. Add / Edit Item Modal */}
      {activeModal === 'add-edit' && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 }}>
          <div style={{ background: '#fff', padding: '30px', borderRadius: '14px', width: '400px', boxShadow: '0 10px 25px rgba(0,0,0,0.1)' }}>
            <h3 style={{ margin: '0 0 20px', fontSize: '18px', color: '#0f172a', fontWeight: '800' }}>
              {isEditMode ? '✏️ Edit Inventory Item' : '➕ Add New Inventory Item'}
            </h3>
            
            <form onSubmit={handleFormSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ fontSize: '12px', fontWeight: '700', color: '#475569', display: 'block', marginBottom: '6px' }}>Item Name</label>
                <input 
                  type="text" 
                  required
                  placeholder="e.g. Tomatoes" 
                  value={formData.name}
                  onChange={e => setFormData({...formData, name: e.target.value})}
                  style={{ width: '100%', padding: '10px', border: '1px solid #cbd5e1', borderRadius: '8px', fontSize: '13px', boxSizing: 'border-box' }}
                />
              </div>

              <div>
                <label style={{ fontSize: '12px', fontWeight: '700', color: '#475569', display: 'block', marginBottom: '6px' }}>Category</label>
                <select 
                  value={formData.category}
                  onChange={e => setFormData({...formData, category: e.target.value})}
                  style={{ width: '100%', padding: '10px', border: '1px solid #cbd5e1', borderRadius: '8px', fontSize: '13px', boxSizing: 'border-box', background: '#fff' }}
                >
                  <option value="Vegetables">Vegetables</option>
                  <option value="Dairy">Dairy</option>
                  <option value="Meat & Seafood">Meat & Seafood</option>
                  <option value="Dry Goods">Dry Goods</option>
                  <option value="Beverages">Beverages</option>
                  <option value="Other">Other</option>
                </select>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <label style={{ fontSize: '12px', fontWeight: '700', color: '#475569', display: 'block', marginBottom: '6px' }}>Current Stock</label>
                  <input 
                    type="number" 
                    required
                    placeholder="0" 
                    value={formData.stock}
                    onChange={e => setFormData({...formData, stock: e.target.value})}
                    style={{ width: '100%', padding: '10px', border: '1px solid #cbd5e1', borderRadius: '8px', fontSize: '13px', boxSizing: 'border-box' }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '12px', fontWeight: '700', color: '#475569', display: 'block', marginBottom: '6px' }}>Min Limit</label>
                  <input 
                    type="number" 
                    required
                    placeholder="5" 
                    value={formData.minLimit}
                    onChange={e => setFormData({...formData, minLimit: e.target.value})}
                    style={{ width: '100%', padding: '10px', border: '1px solid #cbd5e1', borderRadius: '8px', fontSize: '13px', boxSizing: 'border-box' }}
                  />
                </div>
              </div>

              <div>
                <label style={{ fontSize: '12px', fontWeight: '700', color: '#475569', display: 'block', marginBottom: '6px' }}>Unit</label>
                <select 
                  value={formData.unit}
                  onChange={e => setFormData({...formData, unit: e.target.value})}
                  style={{ width: '100%', padding: '10px', border: '1px solid #cbd5e1', borderRadius: '8px', fontSize: '13px', boxSizing: 'border-box', background: '#fff' }}
                >
                  <option value="kg">kg</option>
                  <option value="ltr">ltr</option>
                  <option value="pcs">pcs</option>
                  <option value="pack">pack</option>
                </select>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
                <button 
                  type="button" 
                  onClick={() => setActiveModal(null)}
                  style={{ padding: '10px 16px', background: '#f1f5f9', border: 'none', borderRadius: '8px', fontWeight: '600', cursor: 'pointer', fontSize: '13px', color: '#475569' }}
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  style={{ padding: '10px 16px', background: '#0f172a', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: '600', cursor: 'pointer', fontSize: '13px' }}
                >
                  {isEditMode ? 'Update Item' : 'Save Item'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 2. Bulk Update Modal */}
      {activeModal === 'bulk' && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 }}>
          <div style={{ background: '#fff', padding: '30px', borderRadius: '14px', width: '400px', boxShadow: '0 10px 25px rgba(0,0,0,0.1)' }}>
            <h3 style={{ margin: '0 0 14px', fontSize: '18px', color: '#0f172a', fontWeight: '800' }}>🔄 Bulk Stock Update</h3>
            <p style={{ fontSize: '13px', color: '#64748b', marginBottom: '20px' }}>Yahan aap Excel sheet ya multiple items ki stock quantities ek sath update kar sakte hain.</p>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button onClick={() => setActiveModal(null)} style={{ padding: '10px 16px', background: '#0f172a', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: '600', cursor: 'pointer', fontSize: '13px' }}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* 3. Purchase Order Modal */}
      {(activeModal === 'purchase' || activeModal === 'receive') && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 }}>
          <div style={{ background: '#fff', padding: '30px', borderRadius: '14px', width: '780px', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 10px 25px rgba(0,0,0,0.1)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h3 style={{ margin: 0, fontSize: '18px', color: '#0f172a', fontWeight: '800' }}>{activeModal === 'receive' ? '✅ Receive Raw Material' : '📥 Supplier Purchase & Stock Approval'}</h3>
              <button onClick={() => setActiveModal(null)} style={{ background: 'none', border: 'none', fontSize: '18px', cursor: 'pointer', color: '#64748b' }}>✕</button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr', gap: '18px' }}>
              <form onSubmit={activeModal === 'receive' ? handleReceiveSubmit : handlePurchaseSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  <div>
                    <label style={{ fontSize: '12px', fontWeight: '700', color: '#475569', display: 'block', marginBottom: '6px' }}>Supplier</label>
                    <input
                      list="inventory-supplier-options"
                      value={purchaseForm.supplier}
                      onChange={e => setPurchaseForm({ ...purchaseForm, supplier: e.target.value })}
                      placeholder={suppliers.length ? 'Select or type supplier' : 'Type supplier name'}
                      style={{ width: '100%', padding: '10px', border: '1px solid #cbd5e1', borderRadius: '8px', boxSizing: 'border-box' }}
                      required
                    />
                    <datalist id="inventory-supplier-options">
                      {suppliers.map(supplier => (
                        <option key={supplier.id || supplier.name} value={supplier.name} />
                      ))}
                    </datalist>
                  </div>
                  <div>
                    <label style={{ fontSize: '12px', fontWeight: '700', color: '#475569', display: 'block', marginBottom: '6px' }}>Item Name</label>
                    <input type="text" value={purchaseForm.itemName} onChange={e => setPurchaseForm({ ...purchaseForm, itemName: e.target.value })} placeholder="e.g. Cabbage" style={{ width: '100%', padding: '10px', border: '1px solid #cbd5e1', borderRadius: '8px', boxSizing: 'border-box' }} />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  <div>
                    <label style={{ fontSize: '12px', fontWeight: '700', color: '#475569', display: 'block', marginBottom: '6px' }}>Category</label>
                    <select value={purchaseForm.category} onChange={e => setPurchaseForm({ ...purchaseForm, category: e.target.value })} style={{ width: '100%', padding: '10px', border: '1px solid #cbd5e1', borderRadius: '8px' }}>
                      {['Vegetables', 'Dairy', 'Meat & Seafood', 'Dry Goods', 'Beverages', 'Other'].map(category => (
                        <option key={category} value={category}>{category}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label style={{ fontSize: '12px', fontWeight: '700', color: '#475569', display: 'block', marginBottom: '6px' }}>Unit</label>
                    <select value={purchaseForm.unit} onChange={e => setPurchaseForm({ ...purchaseForm, unit: e.target.value })} style={{ width: '100%', padding: '10px', border: '1px solid #cbd5e1', borderRadius: '8px' }}>
                      <option value="kg">kg</option>
                      <option value="ltr">ltr</option>
                      <option value="pcs">pcs</option>
                      <option value="packets">packets</option>
                    </select>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  <div>
                    <label style={{ fontSize: '12px', fontWeight: '700', color: '#475569', display: 'block', marginBottom: '6px' }}>Quantity</label>
                    <input type="number" value={purchaseForm.quantity} onChange={e => setPurchaseForm({ ...purchaseForm, quantity: e.target.value })} placeholder="25" style={{ width: '100%', padding: '10px', border: '1px solid #cbd5e1', borderRadius: '8px', boxSizing: 'border-box' }} />
                  </div>
                  <div>
                    <label style={{ fontSize: '12px', fontWeight: '700', color: '#475569', display: 'block', marginBottom: '6px' }}>Unit Price (₹)</label>
                    <input type="number" value={purchaseForm.unitPrice} onChange={e => setPurchaseForm({ ...purchaseForm, unitPrice: e.target.value })} placeholder="40" style={{ width: '100%', padding: '10px', border: '1px solid #cbd5e1', borderRadius: '8px', boxSizing: 'border-box' }} />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  <div>
                    <label style={{ fontSize: '12px', fontWeight: '700', color: '#475569', display: 'block', marginBottom: '6px' }}>Batch No.</label>
                    <input type="text" value={purchaseForm.batchNo} onChange={e => setPurchaseForm({ ...purchaseForm, batchNo: e.target.value })} placeholder="e.g. TOM-4032" style={{ width: '100%', padding: '10px', border: '1px solid #cbd5e1', borderRadius: '8px', boxSizing: 'border-box' }} />
                  </div>
                  <div>
                    <label style={{ fontSize: '12px', fontWeight: '700', color: '#475569', display: 'block', marginBottom: '6px' }}>Expiry Date</label>
                    <input type="date" value={purchaseForm.expiryDate} onChange={e => setPurchaseForm({ ...purchaseForm, expiryDate: e.target.value })} style={{ width: '100%', padding: '10px', border: '1px solid #cbd5e1', borderRadius: '8px', boxSizing: 'border-box' }} />
                  </div>
                </div>

                <div>
                  <label style={{ fontSize: '12px', fontWeight: '700', color: '#475569', display: 'block', marginBottom: '6px' }}>Notes</label>
                  <textarea value={purchaseForm.note} onChange={e => setPurchaseForm({ ...purchaseForm, note: e.target.value })} rows="3" placeholder="Delivery notes or remarks" style={{ width: '100%', padding: '10px', border: '1px solid #cbd5e1', borderRadius: '8px', resize: 'vertical', boxSizing: 'border-box' }} />
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                  <button type="button" onClick={() => setActiveModal(null)} style={{ padding: '10px 16px', background: '#f1f5f9', border: 'none', borderRadius: '8px', fontWeight: '600', cursor: 'pointer', color: '#475569' }}>Cancel</button>
                  <button type="submit" style={{ padding: '10px 16px', background: '#0f172a', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: '600', cursor: 'pointer' }}>{activeModal === 'receive' ? 'Save & Update Stock' : 'Send for Approval'}</button>
                </div>
              </form>

              <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '14px' }}>
                <h4 style={{ margin: '0 0 12px', fontSize: '13px', color: '#0f172a', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.6px' }}>Approval Queue</h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {purchaseOrders.slice(0, 5).map(order => (
                    <div key={order.id} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '10px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                        <strong style={{ fontSize: '12px', color: '#0f172a' }}>{order.itemName}</strong>
                        <span style={{ fontSize: '10px', padding: '3px 6px', borderRadius: '999px', background: order.status === 'Pending' ? '#fef3c7' : '#dcfce7', color: order.status === 'Pending' ? '#92400e' : '#166534', fontWeight: '700' }}>{order.status}</span>
                      </div>
                      <div style={{ fontSize: '11px', color: '#64748b', marginBottom: '6px' }}>{order.supplier} • {order.quantity} {order.unit}</div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '11px', color: '#334155', fontWeight: '700' }}>₹{order.total}</span>
                        {order.status === 'Pending' && (
                          <button onClick={() => handlePurchaseStatus(order.id, 'Approved')} style={{ padding: '5px 8px', background: '#0f172a', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '10px', fontWeight: '700', cursor: 'pointer' }}>Approve</button>
                        )}
                        {order.status === 'Approved' && (
                          <button onClick={() => handlePurchaseStatus(order.id, 'Received')} style={{ padding: '5px 8px', background: '#166534', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '10px', fontWeight: '700', cursor: 'pointer' }}>Receive</button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Supplier Master Modal */}
      {activeModal === 'suppliers' && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 }}>
          <div style={{ background: '#fff', padding: '30px', borderRadius: '14px', width: '740px', maxHeight: '88vh', overflowY: 'auto', boxShadow: '0 10px 25px rgba(0,0,0,0.1)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h3 style={{ margin: 0, fontSize: '18px', color: '#0f172a', fontWeight: '800' }}>🏪 Supplier Master</h3>
              <button onClick={() => setActiveModal(null)} style={{ background: 'none', border: 'none', fontSize: '18px', cursor: 'pointer', color: '#64748b' }}>✕</button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 0.9fr', gap: '18px' }}>
              <form onSubmit={handleSupplierSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div>
                  <label style={{ fontSize: '12px', fontWeight: '700', color: '#475569', display: 'block', marginBottom: '6px' }}>Supplier Name</label>
                  <input type="text" value={supplierForm.name} onChange={e => setSupplierForm({ ...supplierForm, name: e.target.value })} placeholder="e.g. Fresh Valley Foods" style={{ width: '100%', padding: '10px', border: '1px solid #cbd5e1', borderRadius: '8px', boxSizing: 'border-box' }} />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  <div>
                    <label style={{ fontSize: '12px', fontWeight: '700', color: '#475569', display: 'block', marginBottom: '6px' }}>Contact</label>
                    <input type="text" value={supplierForm.contact} onChange={e => setSupplierForm({ ...supplierForm, contact: e.target.value })} placeholder="98765..." style={{ width: '100%', padding: '10px', border: '1px solid #cbd5e1', borderRadius: '8px', boxSizing: 'border-box' }} />
                  </div>
                  <div>
                    <label style={{ fontSize: '12px', fontWeight: '700', color: '#475569', display: 'block', marginBottom: '6px' }}>Category</label>
                    <select value={supplierForm.category} onChange={e => setSupplierForm({ ...supplierForm, category: e.target.value })} style={{ width: '100%', padding: '10px', border: '1px solid #cbd5e1', borderRadius: '8px', boxSizing: 'border-box' }}>
                      {['Vegetables', 'Dairy', 'Meat & Seafood', 'Dry Goods', 'Beverages', 'Other'].map(category => (
                        <option key={category} value={category}>{category}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  <div>
                    <label style={{ fontSize: '12px', fontWeight: '700', color: '#475569', display: 'block', marginBottom: '6px' }}>GST No.</label>
                    <input type="text" value={supplierForm.gstNo} onChange={e => setSupplierForm({ ...supplierForm, gstNo: e.target.value })} placeholder="27AA..." style={{ width: '100%', padding: '10px', border: '1px solid #cbd5e1', borderRadius: '8px', boxSizing: 'border-box' }} />
                  </div>
                  <div>
                    <label style={{ fontSize: '12px', fontWeight: '700', color: '#475569', display: 'block', marginBottom: '6px' }}>Lead Time</label>
                    <input type="text" value={supplierForm.leadTime} onChange={e => setSupplierForm({ ...supplierForm, leadTime: e.target.value })} placeholder="2 days" style={{ width: '100%', padding: '10px', border: '1px solid #cbd5e1', borderRadius: '8px', boxSizing: 'border-box' }} />
                  </div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                  <button type="button" onClick={() => setActiveModal(null)} style={{ padding: '10px 16px', background: '#f1f5f9', border: 'none', borderRadius: '8px', fontWeight: '600', cursor: 'pointer', color: '#475569' }}>Cancel</button>
                  <button type="submit" style={{ padding: '10px 16px', background: '#0f172a', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: '600', cursor: 'pointer' }}>{editingSupplierId ? 'Update Supplier' : 'Save Supplier'}</button>
                </div>
              </form>

              <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '14px' }}>
                <h4 style={{ margin: '0 0 10px', fontSize: '13px', color: '#0f172a', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.6px' }}>Active Suppliers</h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {suppliers.map(supplier => (
                    <div key={supplier.id} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '10px' }}>
                      {(() => {
                        const balance = supplierBalances.find((row) => row.supplierName === supplier.name);
                        return (
                          <>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                        <strong style={{ fontSize: '12px', color: '#0f172a' }}>{supplier.name}</strong>
                        <span style={{ fontSize: '10px', padding: '3px 6px', borderRadius: '999px', background: '#e0f2fe', color: '#075985', fontWeight: '700' }}>{supplier.category}</span>
                      </div>
                      <div style={{ fontSize: '11px', color: '#64748b' }}>Contact: {supplier.contact}</div>
                      <div style={{ fontSize: '11px', color: '#64748b' }}>Lead Time: {supplier.leadTime}</div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '8px', paddingTop: '8px', borderTop: '1px solid #f1f5f9' }}>
                        <div>
                          <div style={{ fontSize: '11px', color: '#b45309', fontWeight: 700 }}>Outstanding: ₹{Number(balance?.outstanding || 0).toFixed(2)}</div>
                          <div style={{ fontSize: '10px', color: '#64748b', marginTop: '3px' }}>Purchased: ₹{Number(balance?.receivedPurchases || 0).toFixed(2)} · Paid: ₹{Number(balance?.paidAmount || 0).toFixed(2)}</div>
                        </div>
                        <div style={{ display: 'flex', gap: '5px' }}>
                          <button onClick={() => editSupplier(supplier)} style={{ padding: '5px 7px', border: '1px solid #bfdbfe', borderRadius: '5px', background: '#eff6ff', color: '#1d4ed8', fontSize: '10px', fontWeight: 700, cursor: 'pointer' }}>Edit</button>
                          <button onClick={() => deactivateSupplier(supplier)} style={{ padding: '5px 7px', border: '1px solid #fecaca', borderRadius: '5px', background: '#fef2f2', color: '#b91c1c', fontSize: '10px', fontWeight: 700, cursor: 'pointer' }}>Delete</button>
                          <button onClick={() => recordSupplierPayment(supplier.name)} style={{ padding: '5px 7px', border: 'none', borderRadius: '5px', background: '#0f172a', color: '#fff', fontSize: '10px', fontWeight: 700, cursor: 'pointer' }}>Pay</button>
                        </div>
                      </div>
                          </>
                        );
                      })()}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* GRN / Stock Inward Modal */}
      {activeModal === 'grn' && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 }}>
          <div style={{ background: '#fff', padding: '30px', borderRadius: '14px', width: '720px', maxHeight: '88vh', overflowY: 'auto', boxShadow: '0 10px 25px rgba(0,0,0,0.1)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h3 style={{ margin: 0, fontSize: '18px', color: '#0f172a', fontWeight: '800' }}>📦 GRN / Stock Inward Register</h3>
              <button onClick={() => setActiveModal(null)} style={{ background: 'none', border: 'none', fontSize: '18px', cursor: 'pointer', color: '#64748b' }}>✕</button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {grnEntries.map(entry => (
                <div key={entry.id} style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '12px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                    <strong style={{ fontSize: '12px', color: '#0f172a' }}>{entry.itemName}</strong>
                    <span style={{ fontSize: '10px', padding: '3px 6px', borderRadius: '999px', background: '#dcfce7', color: '#166534', fontWeight: '700' }}>{entry.batchNo}</span>
                  </div>
                  <div style={{ fontSize: '11px', color: '#64748b' }}>Supplier: {entry.supplier}</div>
                  <div style={{ fontSize: '11px', color: '#64748b' }}>Quantity: {entry.quantity} | Expiry: {entry.expiryDate} | Received: {entry.receivedDate}</div>
                  {Number(entry.quantity || 0) > 0 && (
                    <button onClick={() => requestBatchDisposal(entry)} style={{ marginTop: '8px', padding: '5px 8px', border: '1px solid #fecaca', borderRadius: '5px', background: '#fef2f2', color: '#b91c1c', fontSize: '10px', fontWeight: 700, cursor: 'pointer' }}>Request Disposal</button>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 4. Report Modal */}
      {activeModal === 'report' && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 }}>
          <div style={{ background: '#fff', padding: '30px', borderRadius: '14px', width: '400px', boxShadow: '0 10px 25px rgba(0,0,0,0.1)' }}>
            <h3 style={{ margin: '0 0 14px', fontSize: '18px', color: '#0f172a', fontWeight: '800' }}>📊 Inventory Summary Report</h3>
            <p style={{ fontSize: '13px', color: '#64748b', marginBottom: '8px' }}>Total Items: <strong>{totalItems}</strong></p>
            <p style={{ fontSize: '13px', color: '#64748b', marginBottom: '8px' }}>In Stock: <strong>{inStockCount}</strong></p>
            <p style={{ fontSize: '13px', color: '#64748b', marginBottom: '8px' }}>Low Stock: <strong>{lowStockCount}</strong></p>
            <p style={{ fontSize: '13px', color: '#64748b', marginBottom: '8px' }}>Out of Stock: <strong style={{color: '#dc2626'}}>{outOfStockCount}</strong></p>
            <p style={{ fontSize: '13px', color: '#64748b', marginBottom: '8px' }}>Pending Purchases: <strong style={{color: '#d97706'}}>{pendingApprovalCount}</strong></p>
            <p style={{ fontSize: '13px', color: '#64748b', marginBottom: '8px' }}>GRN Entries: <strong>{grnEntries.length}</strong></p>
            <p style={{ fontSize: '13px', color: '#64748b', marginBottom: '8px' }}>Open Returns: <strong>{purchaseReturnCount}</strong></p>
            <p style={{ fontSize: '13px', color: '#64748b', marginBottom: '8px' }}>Waste Loss: <strong>{totalWasteLoss}</strong></p>
            <p style={{ fontSize: '13px', color: '#64748b', marginBottom: '8px' }}>Recipe Usage: <strong>{totalRecipeConsumption}</strong></p>
            <p style={{ fontSize: '13px', color: '#64748b', marginBottom: '20px' }}>Expiring Soon: <strong>{expiringSoonCount}</strong></p>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button onClick={() => setActiveModal(null)} style={{ padding: '10px 16px', background: '#0f172a', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: '600', cursor: 'pointer', fontSize: '13px' }}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* 4. View Logs Modal */}
      {activeModal === 'logs' && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 }}>
          <div style={{ background: '#fff', padding: '30px', borderRadius: '14px', width: '450px', boxShadow: '0 10px 25px rgba(0,0,0,0.1)' }}>
            <h3 style={{ margin: '0 0 14px', fontSize: '18px', color: '#0f172a', fontWeight: '800' }}>👁️ Recent Activity Logs</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '20px', fontSize: '13px', color: '#334155' }}>
              {adjustmentRecords.filter((record) => record.status === 'pending').map((record) => (
                <div key={record._id} style={{ padding: '10px', background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: '6px' }}>
                  <div style={{ fontWeight: 700 }}>{record.ingredientName} · Waste {Math.abs(record.difference)} {record.reason ? `· ${record.reason}` : ''}</div>
                  <div style={{ display: 'flex', gap: '6px', marginTop: '8px' }}>
                    <button onClick={() => reviewWasteRequest(record._id, 'approve')} style={{ padding: '5px 8px', border: 'none', borderRadius: '5px', background: '#16a34a', color: '#fff', cursor: 'pointer' }}>Approve</button>
                    <button onClick={() => reviewWasteRequest(record._id, 'reject')} style={{ padding: '5px 8px', border: 'none', borderRadius: '5px', background: '#dc2626', color: '#fff', cursor: 'pointer' }}>Reject</button>
                  </div>
                </div>
              ))}
              {adjustmentRecords.filter((record) => record.status === 'pending').length === 0 && (
                <div style={{ padding: '8px', background: '#f8fafc', borderRadius: '6px' }}>• No pending wastage approvals.</div>
              )}

              {activeModal === 'audit' && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 }}>
                  <div style={{ background: '#fff', padding: '26px', borderRadius: '14px', width: '560px', maxWidth: 'calc(100vw - 28px)', maxHeight: '88vh', overflowY: 'auto', boxShadow: '0 10px 25px rgba(0,0,0,0.1)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }}>
                      <h3 style={{ margin: 0, fontSize: '18px', color: '#0f172a', fontWeight: '800' }}>🧾 Physical Stock Audit</h3>
                      <button onClick={() => setActiveModal(null)} style={{ background: 'none', border: 'none', fontSize: '18px', cursor: 'pointer', color: '#64748b' }}>✕</button>
                    </div>
                    <form onSubmit={handleStockAudit} style={{ display: 'flex', flexDirection: 'column', gap: '13px' }}>
                      <label style={{ fontSize: '12px', fontWeight: 700, color: '#475569' }}>Inventory Item
                        <select value={auditForm.ingredientId} onChange={(e) => setAuditForm({ ...auditForm, ingredientId: e.target.value })} style={{ display: 'block', width: '100%', marginTop: 6, padding: 10, border: '1px solid #cbd5e1', borderRadius: 8 }} required>
                          <option value="">Select item</option>
                          {inventory.map((item) => <option key={item._id || item.id} value={item._id || item.id}>{item.name} · System: {item.stock || 0} {item.unit}</option>)}
                        </select>
                      </label>
                      <label style={{ fontSize: '12px', fontWeight: 700, color: '#475569' }}>Physical Count
                        <input type="number" min="0" step="0.001" value={auditForm.countedQuantity} onChange={(e) => setAuditForm({ ...auditForm, countedQuantity: e.target.value })} placeholder="Actual quantity counted" style={{ display: 'block', width: '100%', marginTop: 6, padding: 10, border: '1px solid #cbd5e1', borderRadius: 8, boxSizing: 'border-box' }} required />
                      </label>
                      <label style={{ fontSize: '12px', fontWeight: 700, color: '#475569' }}>Reason / Note
                        <input type="text" value={auditForm.reason} onChange={(e) => setAuditForm({ ...auditForm, reason: e.target.value })} placeholder="Monthly physical count" style={{ display: 'block', width: '100%', marginTop: 6, padding: 10, border: '1px solid #cbd5e1', borderRadius: 8, boxSizing: 'border-box' }} />
                      </label>
                      <div style={{ background: '#f8fafc', borderRadius: 8, padding: 12, fontSize: 12, color: '#64748b' }}>The difference will be recorded in the inventory ledger and current stock will be updated.</div>
                      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                        <button type="button" onClick={() => setActiveModal(null)} style={{ padding: '10px 16px', background: '#f1f5f9', border: 0, borderRadius: 8, fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
                        <button type="submit" style={{ padding: '10px 16px', background: '#5b21b6', color: '#fff', border: 0, borderRadius: 8, fontWeight: 700, cursor: 'pointer' }}>Save Audit</button>
                      </div>
                    </form>
                    <div style={{ marginTop: 22, borderTop: '1px solid #e2e8f0', paddingTop: 14 }}>
                      <strong style={{ fontSize: 12 }}>Recent Audits</strong>
                      {auditRecords.slice(0, 5).map((audit) => <div key={audit._id} style={{ padding: '9px 0', borderBottom: '1px solid #f1f5f9', fontSize: 11, color: '#475569' }}>{audit.ingredientName}: {audit.systemQuantity} → {audit.countedQuantity} ({audit.variance >= 0 ? '+' : ''}{audit.variance})</div>)}
                    </div>
                  </div>
                </div>
              )}
              <div style={{ padding: '8px', background: '#f8fafc', borderRadius: '6px' }}>• Stock updated from database sync.</div>
              <div style={{ padding: '8px', background: '#f8fafc', borderRadius: '6px' }}>• Low stock alerts checked successfully.</div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button onClick={() => setActiveModal(null)} style={{ padding: '10px 16px', background: '#0f172a', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: '600', cursor: 'pointer', fontSize: '13px' }}>Close</button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default InventoryManagement;