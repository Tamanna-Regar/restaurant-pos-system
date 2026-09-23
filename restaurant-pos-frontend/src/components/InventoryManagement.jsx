import React, { useState, useEffect, useMemo } from 'react';
import { toast } from 'react-hot-toast';
import { api } from '../api';
import BarcodeScannerModal from './BarcodeScannerModal';
import { downloadExcelReport } from '../utils/fileHelpers';

const InventoryManagement = () => {
  const [inventory, setInventory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Filter and Control States
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All Items');
  const [sortBy, setSortBy] = useState('Name (A-Z)');

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  // Modal Control States
  // 'add-edit' | 'bulk' | 'report' | 'logs' | 'audit' | 'suppliers' | 'grn' | 'purchase' | 'receive' | 'returns' | 'waste' | 'transfers' | 'recipe'
  const [activeModal, setActiveModal] = useState(null);
  const [isEditMode, setIsEditMode] = useState(false);
  const [currentId, setCurrentId] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [showScannerModal, setShowScannerModal] = useState(false);
  const [scannerTargetField, setScannerTargetField] = useState('search');

  const handleBarcodeScanned = (scannedCode) => {
    if (scannerTargetField === 'form') {
      setFormData(prev => ({ ...prev, barcode: scannedCode }));
      toast.success(`Barcode Scanned: ${scannedCode}`);
    } else {
      setSearchTerm(scannedCode);
      const found = inventory.find(i => i.barcode === scannedCode);
      if (found) {
        toast.success(`Found Item: ${found.name}`);
      } else {
        toast.info(`Scanned: ${scannedCode}`);
      }
    }
  };

  // Form State for Add / Edit
  const [formData, setFormData] = useState({
    name: '',
    stock: '',
    minLimit: '',
    unit: 'kg',
    costPerUnit: '',
    barcode: '',
    stockByLocation: {}
  });

  const baseCategories = ['Vegetables', 'Dairy', 'Grains & Pulses', 'Dry Goods', 'Beverages', 'Other'];
  const statusFilters = ['All Items', 'In Stock', 'Low Stock', 'Out of Stock'];

  const [suppliers, setSuppliers] = useState([]);
  const [supplierForm, setSupplierForm] = useState({ name: '', contact: '', category: 'Vegetables', gstNo: '', leadTime: '' });
  const [editingSupplierId, setEditingSupplierId] = useState(null);
  const [supplierBalances, setSupplierBalances] = useState([]);
  const [expiringBatches, setExpiringBatches] = useState([]);
  const [reorderSuggestions, setReorderSuggestions] = useState([]);
  const [purchaseOrders, setPurchaseOrders] = useState([]);
  const [grnEntries, setGrnEntries] = useState([]);
  const [purchaseReturns, setPurchaseReturns] = useState([]);
  const [adjustmentRecords, setAdjustmentRecords] = useState([]);
  const [auditRecords, setAuditRecords] = useState([]);
  const [auditForm, setAuditForm] = useState({ ingredientId: '', countedQuantity: '', reason: '' });
  const [recipeUsage, setRecipeUsage] = useState([]);
  const [stockTransfers, setStockTransfers] = useState([]);
  const [purchaseForm, setPurchaseForm] = useState({
    supplier: '',
    itemName: '',
    category: 'Vegetables',
    unit: 'kg',
    quantity: '',
    unitPrice: '',
    note: '',
    batchNo: '',
    expiryDate: '',
    location: 'Main Store'
  });

  // New feature form states
  const [returnForm, setReturnForm] = useState({ itemName: '', supplier: '', quantity: '', reason: 'Return due to quality / expired stock' });
  const [wasteForm, setWasteForm] = useState({ itemName: '', quantity: '', reason: 'Waste loss' });
  const [transferForm, setTransferForm] = useState({ itemName: '', quantity: '', fromLocation: 'Main Store', toLocation: 'Kitchen' });
  const [receivePOForm, setReceivePOForm] = useState({ orderId: null, itemName: '', quantityReceived: '', billFileBase64: null });
  const [recipeForm, setRecipeForm] = useState({ ingredientName: '', quantity: '' });
  const [bulkRows, setBulkRows] = useState([]);
  const [bulkSaving, setBulkSaving] = useState(false);

  // Supplier Ledger & Khata states
  const [selectedSupplierForLedger, setSelectedSupplierForLedger] = useState(null);
  const [supplierLedgerData, setSupplierLedgerData] = useState(null);
  const [ledgerLoading, setLedgerLoading] = useState(false);
  const [ledgerPaymentForm, setLedgerPaymentForm] = useState({ amount: '', paymentMode: 'Bank Transfer', reference: '', notes: '' });
  const [ledgerPaymentSubmitting, setLedgerPaymentSubmitting] = useState(false);

  // Bulk CSV Import states
  const [bulkImportRows, setBulkImportRows] = useState([]);
  const [bulkImportError, setBulkImportError] = useState('');
  const [bulkImportSuccess, setBulkImportSuccess] = useState('');
  const [bulkImportLoading, setBulkImportLoading] = useState(false);

  // Report sub-tab ('summary' | 'variance')
  const [reportSubTab, setReportSubTab] = useState('summary');

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
          receivedDate: batch.receivedAt ? batch.receivedAt.slice(0, 10) : '',
          disposalRequested: !!batch.disposalRequested
        })));
      }

      // Purchase Returns (was previously never fetched -> always showed 0)
      const returnsResponse = await api.get('/purchase-orders/returns').catch(() => ({ data: { data: [] } }));
      setPurchaseReturns(returnsResponse.data?.data || []);

      // Recipe usage history (was previously client-only and lost on refresh)
      const recipeResponse = await api.get('/recipe-usage').catch(() => ({ data: { data: [] } }));
      setRecipeUsage(recipeResponse.data?.data || []);

      // Stock transfers history (was previously not tracked at all)
      const transfersResponse = await api.get('/stock-transfers').catch(() => ({ data: { data: [] } }));
      setStockTransfers(transfersResponse.data?.data || []);

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

  // Reset to page 1 whenever filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, selectedCategory, sortBy]);

  // Dynamic categories: static list merged with any custom categories already used in inventory
  const categories = useMemo(() => {
    const dynamic = Array.from(new Set(inventory.map((item) => item.category).filter(Boolean)));
    const merged = Array.from(new Set([...baseCategories, ...dynamic]));
    return [...statusFilters, ...merged];
  }, [inventory]);

  const formCategories = useMemo(() => {
    const dynamic = Array.from(new Set(inventory.map((item) => item.category).filter(Boolean)));
    return Array.from(new Set([...baseCategories, ...dynamic]));
  }, [inventory]);

  // Open Add Modal
  const openAddModal = () => {
    setIsEditMode(false);
    setFormData({ name: '', stock: '', minLimit: '', unit: 'kg', costPerUnit: '', barcode: '', stockByLocation: {} });
    setActiveModal('add-edit');
  };

  // Open Edit Modal
  const openEditModal = (item) => {
    setIsEditMode(true);
    setCurrentId(item._id || item.id);
    const locations = item.stockByLocation || {};
    setFormData({
      name: item.name || '',
      category: item.category || 'Vegetables',
      unit: item.unit || 'kg',
      stock: item.stock !== undefined ? item.stock : '',
      minLimit: item.minLimit !== undefined ? item.minLimit : '',
      costPerUnit: item.costPerUnit || '',
      barcode: item.barcode || '',
      stockByLocation: { 'Main Store': locations['Main Store'] || '', 'Kitchen': locations['Kitchen'] || '' }
    });
    setActiveModal('add-edit');
  };

  // Handle Form Submit (Add or Update in MongoDB)
  const handleFormSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const payload = {
        ...formData,
        stock: Number(formData.stock),
        minLimit: Number(formData.minLimit),
        costPerUnit: Number(formData.costPerUnit || 0),
        stockByLocation: {
          'Main Store': Number(formData.stockByLocation['Main Store'] || 0),
          'Kitchen': Number(formData.stockByLocation['Kitchen'] || 0)
        }
      };

      if (isEditMode) await api.put(`/ingredients/${currentId}`, payload);
      else await api.post('/ingredients', payload);

      await fetchInventory(); // Refresh data
      setActiveModal(null);
      alert(isEditMode ? 'Item successfully updated!' : 'New item successfully added!');
    } catch (err) {
      console.error('Error saving item:', err);
      toast.error('An error occurred while saving the data.');
    } finally {
      setSubmitting(false);
    }
  };

  // Delete Item Function
  const handleDeleteItem = async (id) => {
    if (window.confirm('Are you sure you want to delete this item?')) {
      try {
        await api.delete(`/ingredients/${id}`);
        setInventory(inventory.filter(item => (item._id || item.id) !== id));
        toast.success('Item successfully deleted!');
      } catch (err) {
        console.error('Error deleting item:', err);
        toast.error('An error occurred while deleting the item.');
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

    const matchesSearch = item.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          (item.barcode && item.barcode.toLowerCase().includes(searchTerm.toLowerCase()));

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

  // Pagination slice
  const totalPages = Math.max(1, Math.ceil(filteredInventory.length / itemsPerPage));
  const paginatedInventory = filteredInventory.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  // Computed Metrics
  const totalItems = inventory.length;
  const getStockValue = (item) => Number(item.stock ?? item.currentStock ?? 0);
  const getMinStockValue = (item) => Number(item.minLimit ?? item.minStockAlert ?? 5);
  const inStockCount = inventory.filter(i => getStockValue(i) > getMinStockValue(i)).length;
  const lowStockCount = inventory.filter(i => getStockValue(i) <= getMinStockValue(i) && getStockValue(i) > 0).length;
  const outOfStockCount = inventory.filter(i => getStockValue(i) <= 0).length;
  const pendingApprovalCount = purchaseOrders.filter(order => order.status === 'Pending').length;
  const purchaseReturnCount = purchaseReturns.length;
  // Previously always 0 because stockAdjustments state never had a setter attached.
  // Waste loss is now derived from actual approved wastage adjustment records.
  const totalWasteLoss = adjustmentRecords
    .filter((record) => record.status === 'approved')
    .reduce((sum, record) => sum + Math.abs(Number(record.difference ?? record.quantity ?? 0)), 0);
  const totalRecipeConsumption = recipeUsage.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
  const totalInventoryValue = inventory.reduce((sum, item) => sum + (getStockValue(item) * Number(item.costPerUnit || 0)), 0);
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
      toast.success('Please fill valid item name, quantity and price.');
      return;
    }

    setSubmitting(true);
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
      setSubmitting(false);
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
      expiryDate: '',
      location: 'Main Store'
    });
    setActiveModal(null);
    setSubmitting(false);
    toast.success('Supplier purchase request created and sent for approval.');
  };

  const handleAutoGeneratePOs = async () => {
    if (!window.confirm('Are you sure you want to auto-generate purchase orders for low stock items?')) return;
    try {
      const res = await api.post('/purchases/auto-generate');
      if (res.data.success) {
        toast.success(res.data.message);
        fetchInventory();
      } else {
        toast.error('Failed to auto-generate: ' + res.data.message);
      }
    } catch (err) {
      toast.error('Something went wrong');
      toast.error('Error auto-generating POs');
    }
  };

  const handleReceivePO = async (e) => {
    e.preventDefault();
    if (!receivePOForm.orderId || !receivePOForm.quantityReceived) return;
    setSubmitting(true);
    try {
      // 1. Update PO Status and Stock
      const statusRes = await api.patch(`/purchases/${receivePOForm.orderId}/status`, {
        status: 'Partially Received', // will be auto upgraded if full
        receivedQuantity: receivePOForm.quantityReceived
      });
      
      // 2. Upload Bill if present
      if (statusRes.data.success && receivePOForm.billFileBase64) {
        await api.post(`/purchases/${receivePOForm.orderId}/upload-bill`, {
          base64Data: receivePOForm.billFileBase64,
          filename: 'bill_upload.jpg'
        });
      }
      
      if (statusRes.data.priceWarning) {
        toast.success('Received successfully! Note: The price is more than 10% higher than the previous cost.');
      } else {
        toast.success('Received successfully!');
      }
      setActiveModal(null);
      fetchInventory();
    } catch (err) {
      toast.error('Something went wrong');
      toast.error('Error receiving PO');
    } finally {
      setSubmitting(false);
    }
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

  const printPurchaseOrder = (order) => {
    const printWindow = window.open('', '', 'width=800,height=600');
    const html = `
      <html>
        <head>
          <title>Purchase Order - ${order.id}</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 40px; color: #1e293b; }
            .header { text-align: center; margin-bottom: 40px; }
            .title { font-size: 24px; font-weight: bold; }
            .details { margin-bottom: 30px; display: flex; justify-content: space-between; }
            table { width: 100%; border-collapse: collapse; margin-bottom: 30px; }
            th, td { border: 1px solid #cbd5e1; padding: 12px; text-align: left; }
            th { background-color: #f1f5f9; }
            .total { text-align: right; font-size: 18px; font-weight: bold; }
          </style>
        </head>
        <body>
          <div class="header">
            <div class="title">PURCHASE ORDER</div>
            <div>Order ID: ${order.id}</div>
          </div>
          <div class="details">
            <div>
              <strong>Supplier:</strong><br/>
              ${order.supplier}
            </div>
            <div style="text-align: right;">
              <strong>Date:</strong><br/>
              ${new Date(order.date).toLocaleDateString()}
            </div>
          </div>
          <table>
            <thead>
              <tr>
                <th>Item</th>
                <th>Category</th>
                <th>Quantity</th>
                <th>Unit Price</th>
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>${order.itemName}</td>
                <td>${order.category || 'N/A'}</td>
                <td>${order.quantity} ${order.unit}</td>
                <td>₹${order.unitPrice || (order.total/order.quantity).toFixed(2)}</td>
                <td>₹${order.total}</td>
              </tr>
            </tbody>
          </table>
          <div class="total">Total Amount: ₹${order.total}</div>
        </body>
      </html>
    `;
    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.print();
  };

  // 1. WhatsApp Purchase Order Dispatch
  const handleWhatsAppPO = (order) => {
    const supplierObj = suppliers.find(s => s.name?.toLowerCase() === (order.supplier || order.supplierName)?.toLowerCase());
    const rawContact = supplierObj?.contact || '';
    const cleanPhone = rawContact.replace(/\D/g, '');
    const phoneWithCode = cleanPhone.length === 10 ? `91${cleanPhone}` : cleanPhone;

    const poNumber = order.id ? String(order.id).slice(-6).toUpperCase() : 'PO';
    const message = `*PURCHASE ORDER — TAMANNA RESTAURANT*\n` +
      `--------------------------------\n` +
      `*PO Ref:* #${poNumber}\n` +
      `*Date:* ${new Date().toLocaleDateString('en-IN')}\n` +
      `*Supplier:* ${order.supplier || order.supplierName}\n\n` +
      `*Required Item:* ${order.itemName} (${order.category || 'General'})\n` +
      `*Quantity:* ${order.quantity} ${order.unit || 'kg'}\n` +
      `*Agreed Rate:* ₹${order.unitPrice || (order.total / order.quantity).toFixed(2)}/${order.unit || 'kg'}\n` +
      `*Total Order Amount:* ₹${order.total}\n\n` +
      `*Delivery Location:* Main Kitchen, Tamanna Restaurant\n` +
      `${order.notes ? `*Special Notes:* ${order.notes}\n` : ''}` +
      `--------------------------------\n` +
      `Kripya yeh order confirm karein aur expected delivery time batayein. Dhanyawad!`;

    const encoded = encodeURIComponent(message);
    const waUrl = phoneWithCode 
      ? `https://wa.me/${phoneWithCode}?text=${encoded}` 
      : `https://wa.me/?text=${encoded}`;
    window.open(waUrl, '_blank');
  };

  // 2. Open Supplier Ledger
  const openSupplierLedger = async (supplier) => {
    setSelectedSupplierForLedger(supplier);
    setLedgerPaymentForm({ amount: '', paymentMode: 'Bank Transfer', reference: '', notes: '' });
    setActiveModal('supplier-ledger');
    setLedgerLoading(true);
    try {
      const res = await api.get(`/suppliers/ledger?supplierName=${encodeURIComponent(supplier.name)}`);
      setSupplierLedgerData(res.data?.data || null);
    } catch (err) {
      console.error('Failed to load supplier ledger:', err);
      toast.error('Could not load ledger statement.');
    } finally {
      setLedgerLoading(false);
    }
  };

  // 3. Submit Payment inside Ledger Modal
  const handleLedgerPaymentSubmit = async (e) => {
    e.preventDefault();
    if (!selectedSupplierForLedger) return;
    const amount = Number(ledgerPaymentForm.amount);
    if (!amount || amount <= 0) {
      toast.error('Please enter a valid payment amount.');
      return;
    }
    setLedgerPaymentSubmitting(true);
    try {
      await api.post('/suppliers/payments', {
        supplierName: selectedSupplierForLedger.name,
        amount,
        paymentMode: ledgerPaymentForm.paymentMode,
        reference: ledgerPaymentForm.reference,
        notes: ledgerPaymentForm.notes
      });
      toast.success(`₹${amount.toFixed(2)} payment recorded successfully!`);
      setLedgerPaymentForm({ amount: '', paymentMode: 'Bank Transfer', reference: '', notes: '' });
      const res = await api.get(`/suppliers/ledger?supplierName=${encodeURIComponent(selectedSupplierForLedger.name)}`);
      setSupplierLedgerData(res.data?.data || null);
      await fetchInventory();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Payment submission failed.');
    } finally {
      setLedgerPaymentSubmitting(false);
    }
  };

  // 4. Download Sample CSV Template
  const handleDownloadSampleCsv = () => {
    const sampleHeaders = 'Name,Category,Unit,CurrentStock,MinStockAlert,CostPerUnit,Barcode\n';
    const sampleRows = 'Fresh Tomatoes,Vegetables,kg,50,10,35,890123456001\n' +
      'Amul Butter 500g,Dairy,packets,24,6,275,890123456002\n' +
      'Paneer Malai,Dairy,kg,15,5,320,890123456003\n' +
      'Basmati Rice,Dry Goods,kg,100,25,95,890123456004\n' +
      'Refined Cooking Oil 15L,Dry Goods,tin,5,2,1850,890123456005\n';
    const blob = new Blob([sampleHeaders + sampleRows], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'sample_inventory_template.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // 5. Handle CSV File Upload
  const handleCsvFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBulkImportError('');
    setBulkImportSuccess('');
    
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target.result;
        const lines = text.split(/\r\n|\n/).filter(line => line.trim().length > 0);
        if (lines.length < 2) {
          setBulkImportError('CSV file is empty or missing data rows.');
          return;
        }
        const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
        const nameIdx = headers.findIndex(h => h.includes('name') || h.includes('item'));
        const catIdx = headers.findIndex(h => h.includes('cat'));
        const unitIdx = headers.findIndex(h => h.includes('unit'));
        const stockIdx = headers.findIndex(h => h.includes('stock') || h.includes('qty'));
        const minIdx = headers.findIndex(h => h.includes('min') || h.includes('limit') || h.includes('alert'));
        const costIdx = headers.findIndex(h => h.includes('cost') || h.includes('price') || h.includes('rate'));
        const barcodeIdx = headers.findIndex(h => h.includes('bar'));

        if (nameIdx === -1) {
          setBulkImportError('CSV must contain an "Item Name" column header.');
          return;
        }

        const parsed = [];
        for (let i = 1; i < lines.length; i++) {
          const cells = lines[i].split(',').map(c => c.trim().replace(/^["']|["']$/g, ''));
          const name = cells[nameIdx];
          if (!name) continue;
          parsed.push({
            name,
            category: catIdx !== -1 && cells[catIdx] ? cells[catIdx] : 'General',
            unit: unitIdx !== -1 && cells[unitIdx] ? cells[unitIdx] : 'kg',
            stock: stockIdx !== -1 ? Math.max(0, Number(cells[stockIdx]) || 0) : 0,
            minLimit: minIdx !== -1 ? Math.max(0, Number(cells[minIdx]) || 5) : 5,
            costPerUnit: costIdx !== -1 ? Math.max(0, Number(cells[costIdx]) || 0) : 0,
            barcode: barcodeIdx !== -1 && cells[barcodeIdx] ? cells[barcodeIdx] : ''
          });
        }

        if (parsed.length === 0) {
          setBulkImportError('No valid items found in the file.');
          return;
        }

        setBulkImportRows(parsed);
      } catch (err) {
        console.error('CSV Parsing Error:', err);
        setBulkImportError('Error parsing CSV file. Please use the sample template.');
      }
    };
    reader.readAsText(file);
  };

  // 6. Execute Bulk Import to Backend API
  const handleExecuteBulkImport = async () => {
    if (!bulkImportRows.length) return;
    setBulkImportLoading(true);
    setBulkImportError('');
    setBulkImportSuccess('');
    try {
      const res = await api.post('/ingredients/bulk-import', { items: bulkImportRows });
      setBulkImportSuccess(res.data?.message || `Successfully processed ${bulkImportRows.length} items!`);
      await fetchInventory();
      setTimeout(() => {
        setBulkImportRows([]);
        setActiveModal(null);
      }, 1500);
    } catch (err) {
      setBulkImportError(err.response?.data?.message || 'Bulk import failed.');
    } finally {
      setBulkImportLoading(false);
    }
  };

  // 7. Print Barcode Label (50mm x 30mm)
  const handlePrintBarcodeLabel = (item) => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      alert('Please allow popups to print barcode stickers.');
      return;
    }
    const barcodeVal = item.barcode || `ITEM-${String(item._id || item.id).slice(-6).toUpperCase()}`;
    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Barcode Label - ${item.name}</title>
          <style>
            @page {
              size: 50mm 30mm;
              margin: 0;
            }
            body {
              margin: 0;
              padding: 4px;
              width: 48mm;
              height: 28mm;
              font-family: 'Arial', sans-serif;
              box-sizing: border-box;
              text-align: center;
              display: flex;
              flex-direction: column;
              justify-content: space-between;
              overflow: hidden;
            }
            .header {
              font-size: 8px;
              font-weight: 800;
              letter-spacing: 0.5px;
              text-transform: uppercase;
              color: #111;
              border-bottom: 1px dashed #666;
              padding-bottom: 2px;
            }
            .item-name {
              font-size: 11px;
              font-weight: 900;
              color: #000;
              margin: 2px 0 0;
              white-space: nowrap;
              overflow: hidden;
              text-overflow: ellipsis;
            }
            .details {
              font-size: 8px;
              color: #333;
              display: flex;
              justify-content: space-between;
              padding: 0 4px;
            }
            .barcode-box {
              margin: 2px auto;
              letter-spacing: 2px;
              font-family: monospace;
              font-size: 10px;
              font-weight: 700;
              background: #f4f4f4;
              padding: 2px 6px;
              border: 1px solid #ddd;
              display: inline-block;
            }
            .footer {
              font-size: 7px;
              color: #555;
            }
          </style>
        </head>
        <body onload="window.print(); window.close();">
          <div class="header">★ TAMANNA RESTAURANT ★</div>
          <div class="item-name">${item.name}</div>
          <div class="details">
            <span>Cat: ${item.category || 'General'}</span>
            <span>Unit: ${item.unit || 'kg'}</span>
            <span>Rate: ₹${item.costPerUnit || 0}</span>
          </div>
          <div class="barcode-box">||| ${barcodeVal} |||</div>
          <div class="footer">Packed: ${new Date().toLocaleDateString('en-IN')}</div>
        </body>
      </html>
    `;
    printWindow.document.write(html);
    printWindow.document.close();
  };

  const handleReceiveSubmit = async (e) => {
    e.preventDefault();
    const quantity = Number(purchaseForm.quantity || 0);
    const unitPrice = Number(purchaseForm.unitPrice || 0);
    if (!purchaseForm.itemName || !purchaseForm.supplier || quantity <= 0 || unitPrice <= 0) {
      toast.success('Please fill item, supplier, valid quantity and price.');
      return;
    }
    setSubmitting(true);
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
        notes: purchaseForm.note,
        location: purchaseForm.location
      });
      await fetchInventory();
      setPurchaseForm({ supplier: '', itemName: '', category: 'Vegetables', unit: 'kg', quantity: '', unitPrice: '', note: '', batchNo: '', expiryDate: '', location: 'Main Store' });
      setActiveModal(null);
      toast.success('Raw material received and stock updated successfully.');
    } catch (error) {
      alert(error.response?.data?.message || 'Unable to save received material.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSupplierSubmit = async (e) => {
    e.preventDefault();
    if (!supplierForm.name || !supplierForm.contact) {
      toast.success('Supplier name and contact are required.');
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
      toast.success('Supplier deactivated successfully.');
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
      // Reflect the request immediately instead of waiting for a manual refresh
      setGrnEntries((prev) => prev.map((entry) => entry.id === batch.id ? { ...entry, disposalRequested: true } : entry));
      toast.success('Batch disposal request sent for manager approval.');
    } catch (error) {
      alert(error.response?.data?.message || 'Disposal request failed.');
    }
  };

  // --- Purchase Return (now a proper modal with a visible history list, instead of blind window.prompt) ---
  const handlePurchaseReturn = async (e) => {
    e.preventDefault();
    const validQty = Number(returnForm.quantity || 0);
    if (!returnForm.itemName || validQty <= 0) {
      toast.success('Please enter a valid item and return quantity.');
      return;
    }

    setSubmitting(true);
    try {
      const response = await api.post('/purchase-orders/returns', {
        itemName: returnForm.itemName,
        supplierName: returnForm.supplier,
        quantity: validQty,
        reason: returnForm.reason || 'Return due to quality / expired stock'
      });
      if (response.data?.data) {
        setPurchaseReturns((prev) => [response.data.data, ...prev]);
      }
      await fetchInventory();
      setReturnForm({ itemName: '', supplier: '', quantity: '', reason: 'Return due to quality / expired stock' });
      alert(`${validQty} ${returnForm.itemName} returned and stock adjusted.`);
    } catch (error) {
      alert(error.response?.data?.message || 'Purchase return failed.');
    } finally {
      setSubmitting(false);
    }
  };

  // --- Waste / Stock Adjustment (now a proper modal, with the pending queue visible in the same place) ---
  const handleStockAdjustment = async (e) => {
    e.preventDefault();
    const qty = Math.abs(Number(wasteForm.quantity || 0));
    if (!wasteForm.itemName || !qty) {
      toast.success('Please enter a valid adjustment quantity.');
      return;
    }

    setSubmitting(true);
    try {
      const item = inventory.find((entry) => entry.name.toLowerCase() === wasteForm.itemName.toLowerCase());
      await api.post('/stock-adjustments/waste', {
        ingredientId: item?._id,
        ingredientName: wasteForm.itemName,
        quantity: qty,
        reason: wasteForm.reason || 'Waste loss'
      });
      alert(`${qty} ${wasteForm.itemName} wastage request sent for manager approval.`);
      setWasteForm({ itemName: '', quantity: '', reason: 'Waste loss' });
      await fetchInventory();
    } catch (error) {
      alert(error.response?.data?.message || 'Wastage request failed.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleStockAudit = async (e) => {
    e.preventDefault();
    const ingredient = inventory.find((item) => (item._id || item.id) === auditForm.ingredientId);
    const countedQuantity = Number(auditForm.countedQuantity);
    if (!ingredient || !Number.isFinite(countedQuantity) || countedQuantity < 0) {
      toast.success('Select an item and enter a valid counted quantity.');
      return;
    }
    setSubmitting(true);
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
    } finally {
      setSubmitting(false);
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

  // --- Recipe Consumption (now persisted to backend + shown as history, instead of a client-only, refresh-losing log) ---
  const handleRecipeConsumption = async (e) => {
    e.preventDefault();
    const consumed = Number(recipeForm.quantity || 0);
    if (!recipeForm.ingredientName || consumed <= 0) {
      toast.success('Please choose a valid ingredient and quantity.');
      return;
    }

    setSubmitting(true);
    try {
      const ingredient = inventory.find((item) => item.name.toLowerCase() === recipeForm.ingredientName.toLowerCase());
      const response = await api.post('/recipe-usage', {
        ingredientId: ingredient?._id,
        ingredient: recipeForm.ingredientName,
        quantity: consumed,
        unit: ingredient?.unit || 'kg'
      });
      if (response.data?.data) {
        setRecipeUsage((prev) => [response.data.data, ...prev]);
      }
      await fetchInventory();
      setRecipeForm({ ingredientName: '', quantity: '' });
      alert(`${consumed} ${recipeForm.ingredientName} consumed for recipe production.`);
    } catch (error) {
      alert(error.response?.data?.message || 'Unable to record recipe consumption.');
    } finally {
      setSubmitting(false);
    }
  };

  // --- Stock Transfer (now a proper modal with visible history, instead of blind window.prompt chain) ---
  const handleStockTransfer = async (e) => {
    e.preventDefault();
    const ingredient = inventory.find((entry) => entry.name.toLowerCase() === transferForm.itemName.trim().toLowerCase());
    const quantity = Number(transferForm.quantity || 0);
    if (!ingredient || quantity <= 0 || !transferForm.fromLocation || !transferForm.toLocation) {
      toast.success('Please select a valid item, quantity, and both locations.');
      return;
    }
    setSubmitting(true);
    try {
      // Note: the backend only populates ingredientId -> {name, unit} on GET, not on this
      // POST's create response, so we don't optimistically push the raw response into state
      // (it would show a blank name). fetchInventory() below re-pulls the populated list instead.
      await api.post('/stock-transfers', {
        ingredientId: ingredient._id,
        quantity,
        fromLocation: transferForm.fromLocation,
        toLocation: transferForm.toLocation
      });
      toast.success('Stock transfer recorded successfully.');
      setTransferForm({ itemName: '', quantity: '', fromLocation: 'Main Store', toLocation: 'Kitchen' });
      await fetchInventory();
    } catch (error) {
      alert(error.response?.data?.message || 'Stock transfer failed.');
    } finally {
      setSubmitting(false);
    }
  };

  // --- Bulk Update (previously just a placeholder message with no real functionality) ---
  const openBulkModal = () => {
    setBulkRows(inventory.map((item) => ({
      id: item._id || item.id,
      name: item.name,
      unit: item.unit || 'kg',
      stock: getStockValue(item)
    })));
    setActiveModal('bulk');
  };

  const updateBulkRow = (id, value) => {
    setBulkRows((prev) => prev.map((row) => row.id === id ? { ...row, stock: value } : row));
  };

  const handleBulkSave = async () => {
    setBulkSaving(true);
    try {
      const changedRows = bulkRows.filter((row) => {
        const original = inventory.find((item) => (item._id || item.id) === row.id);
        return original && Number(row.stock) !== getStockValue(original);
      });

      if (changedRows.length === 0) {
        toast.success('No stock changes to save.');
        setBulkSaving(false);
        return;
      }

      await Promise.all(changedRows.map((row) =>
        api.put(`/ingredients/${row.id}`, { stock: Number(row.stock) })
      ));

      await fetchInventory();
      alert(`${changedRows.length} item(s) updated successfully.`);
      setActiveModal(null);
    } catch (error) {
      alert(error.response?.data?.message || 'Bulk update failed for one or more items.');
    } finally {
      setBulkSaving(false);
    }
  };

  // --- Report export (previously view-only with no way to save/share the numbers) ---
  const handleDownloadReportCsv = () => {
    const rows = [
      ['Metric', 'Value'],
      ['Total Items', totalItems],
      ['In Stock', inStockCount],
      ['Low Stock', lowStockCount],
      ['Out of Stock', outOfStockCount],
      ['Pending Purchases', pendingApprovalCount],
      ['GRN Entries', grnEntries.length],
      ['Open Returns', purchaseReturnCount],
      ['Waste Loss', totalWasteLoss],
      ['Recipe Usage', totalRecipeConsumption],
      ['Expiring Soon', expiringSoonCount],
      ['Total Stock Value', `₹${totalInventoryValue.toFixed(2)}`]
    ];
    const csvContent = rows.map((row) => row.join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `inventory-report-${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
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
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <button
              onClick={() => { setScannerTargetField('search'); setShowScannerModal(true); }}
              style={{ background: '#ecfdf5', color: '#047857', border: '1px solid #a7f3d0', padding: '10px 16px', borderRadius: '9px', fontWeight: '700', cursor: 'pointer', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              📷 Scan Barcode
            </button>
            <button
              onClick={() => downloadExcelReport('inventory')}
              style={{ background: '#f0f9ff', color: '#0369a1', border: '1px solid #bae6fd', padding: '10px 16px', borderRadius: '9px', fontWeight: '700', cursor: 'pointer', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              📊 Export Excel
            </button>
            <button
              onClick={() => { setBulkImportRows([]); setBulkImportError(''); setBulkImportSuccess(''); setActiveModal('bulk-import'); }}
              style={{ background: '#f8fafc', color: '#0f172a', border: '1px solid #cbd5e1', padding: '10px 16px', borderRadius: '9px', fontWeight: '700', cursor: 'pointer', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              📥 Import CSV
            </button>
            <button
              onClick={openAddModal}
              style={{ background: '#0f172a', color: '#fff', border: 'none', padding: '10px 18px', borderRadius: '9px', fontWeight: '600', cursor: 'pointer', fontSize: '13px', boxShadow: '0 2px 4px rgba(15, 23, 42, 0.2)' }}
            >
              + Add New Item
            </button>
          </div>
        </div>

        {/* Metric Summary Cards Bar */}
        <div className="inventory-metrics" style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '16px' }}>
          <div onClick={() => setSelectedCategory('All Items')} style={{ background: '#fff', padding: '18px 20px', borderRadius: '12px', border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: '14px', cursor: 'pointer' }}>
            <div style={{ background: '#f1f5f9', padding: '12px', borderRadius: '10px', fontSize: '18px' }}>📦</div>
            <div>
              <div style={{ fontSize: '11px', color: '#64748b', fontWeight: '700', textTransform: 'uppercase' }}>Total Items</div>
              <div style={{ fontSize: '20px', fontWeight: '800', color: '#0f172a', marginTop: '2px' }}>{totalItems}</div>
            </div>
          </div>
          <div style={{ background: '#fff', padding: '18px 20px', borderRadius: '12px', border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: '14px' }}>
            <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '10px', fontSize: '18px' }}>💰</div>
            <div>
              <div style={{ fontSize: '11px', color: '#0f172a', fontWeight: '700', textTransform: 'uppercase' }}>Stock Value</div>
              <div style={{ fontSize: '20px', fontWeight: '800', color: '#0f172a', marginTop: '2px' }}>₹{totalInventoryValue.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</div>
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
                <>
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
                      {paginatedInventory.map((item, index) => {
                        const stock = getStockValue(item);
                        const minLimit = getMinStockValue(item);
                        const isOut = stock <= 0;
                        const isLow = stock <= minLimit && !isOut;
                        const itemId = item._id || item.id;

                        return (
                          <tr key={itemId} style={{ borderBottom: '1px solid #f1f5f9', transition: 'background 0.15s ease' }}>
                            <td style={{ padding: '14px 18px', color: '#64748b', fontWeight: '600' }}>{(currentPage - 1) * itemsPerPage + index + 1}</td>
                            <td style={{ padding: '14px 18px', fontWeight: '700', color: '#0f172a' }}>{item.name}</td>
                            <td style={{ padding: '14px 18px' }}>
                              <span style={{ fontSize: '11px', fontWeight: '700', padding: '3px 8px', borderRadius: '6px', background: '#f1f5f9', color: '#334155' }}>
                                {item.category || 'General'}
                              </span>
                            </td>
                            <td style={{ padding: '14px 18px', color: '#64748b', fontWeight: '600' }}>{item.unit || 'kg'}</td>
                            <td style={{ padding: '14px 18px' }}>
                              <div style={{ color: '#0f172a', fontWeight: '800', marginBottom: '4px' }}>{stock}</div>
                              {item.stockByLocation && Object.entries(item.stockByLocation).filter(([_, qty]) => Number(qty) > 0).map(([loc, qty]) => (
                                <span key={loc} style={{ display: 'inline-block', padding: '2px 6px', background: '#e2e8f0', color: '#334155', borderRadius: '4px', fontSize: '10px', fontWeight: '600', marginRight: '4px', marginBottom: '4px' }}>
                                  {loc}: {qty}
                                </span>
                              ))}
                            </td>
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
                                  onClick={() => handlePrintBarcodeLabel(item)}
                                  title="Print 50x30mm Barcode Sticker Label"
                                  style={{ padding: '5px 8px', background: '#f5f3ff', color: '#6d28d9', border: '1px solid #ddd6fe', borderRadius: '6px', cursor: 'pointer', fontSize: '11px' }}
                                >
                                  🏷️
                                </button>
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

                  {/* Pagination controls (previously missing — full list always rendered at once) */}
                  {totalPages > 1 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 18px', borderTop: '1px solid #f1f5f9' }}>
                      <span style={{ fontSize: '12px', color: '#64748b', fontWeight: 600 }}>
                        Showing {(currentPage - 1) * itemsPerPage + 1}-{Math.min(currentPage * itemsPerPage, filteredInventory.length)} of {filteredInventory.length}
                      </span>
                      <div style={{ display: 'flex', gap: '6px' }}>
                        <button
                          onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                          disabled={currentPage === 1}
                          style={{ padding: '6px 12px', borderRadius: '6px', border: '1px solid #e2e8f0', background: currentPage === 1 ? '#f8fafc' : '#fff', color: currentPage === 1 ? '#cbd5e1' : '#334155', fontSize: '12px', fontWeight: 700, cursor: currentPage === 1 ? 'not-allowed' : 'pointer' }}
                        >
                          ← Prev
                        </button>
                        <span style={{ padding: '6px 10px', fontSize: '12px', fontWeight: 700, color: '#0f172a' }}>Page {currentPage} / {totalPages}</span>
                        <button
                          onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                          disabled={currentPage === totalPages}
                          style={{ padding: '6px 12px', borderRadius: '6px', border: '1px solid #e2e8f0', background: currentPage === totalPages ? '#f8fafc' : '#fff', color: currentPage === totalPages ? '#cbd5e1' : '#334155', fontSize: '12px', fontWeight: 700, cursor: currentPage === totalPages ? 'not-allowed' : 'pointer' }}
                        >
                          Next →
                        </button>
                      </div>
                    </div>
                  )}
                </>
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
                <button onClick={openBulkModal} style={{ padding: '12px', background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: '10px', fontSize: '12px', fontWeight: '700', color: '#334155', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}>
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
                <button onClick={() => { setReturnForm({ itemName: inventory[0]?.name || '', supplier: suppliers[0]?.name || '', quantity: '', reason: 'Return due to quality / expired stock' }); setActiveModal('returns'); }} style={{ padding: '12px', background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: '10px', fontSize: '12px', fontWeight: '700', color: '#9a4d00', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontSize: '16px' }}>↩️</span> Return
                </button>
                <button onClick={() => { setWasteForm({ itemName: inventory[0]?.name || '', quantity: '', reason: 'Waste loss' }); setActiveModal('waste'); }} style={{ padding: '12px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '10px', fontSize: '12px', fontWeight: '700', color: '#991b1b', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontSize: '16px' }}>🧮</span> Waste / Adj.
                </button>
                <button onClick={() => { setRecipeForm({ ingredientName: inventory[0]?.name || '', quantity: '' }); setActiveModal('recipe'); }} style={{ padding: '12px', background: '#eef2ff', border: '1px solid #c7d2fe', borderRadius: '10px', fontSize: '12px', fontWeight: '700', color: '#3730a3', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontSize: '16px' }}>🍲</span> Recipe Usage
                </button>
                <button onClick={() => { setTransferForm({ itemName: inventory[0]?.name || '', quantity: '', fromLocation: 'Main Store', toLocation: 'Kitchen' }); setActiveModal('transfers'); }} style={{ padding: '12px', background: '#fdf4ff', border: '1px solid #e9d5ff', borderRadius: '10px', fontSize: '12px', fontWeight: '700', color: '#7e22ce', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontSize: '16px' }}>↔️</span> Stock Transfer
                </button>
                <button onClick={() => setActiveModal('purchase')} style={{ padding: '12px', background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: '10px', fontSize: '12px', fontWeight: '700', color: '#166534', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontSize: '16px' }}>📥</span> Supplier Purchase
                </button>
                <button onClick={handleAutoGeneratePOs} style={{ padding: '12px', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '10px', fontSize: '12px', fontWeight: '700', color: '#1d4ed8', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontSize: '16px' }}>🤖</span> Auto-Reorder
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
                  {formCategories.map((category) => (
                    <option key={category} value={category}>{category}</option>
                  ))}
                </select>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px' }}>
                <div>
                  <label style={{ fontSize: '12px', fontWeight: '700', color: '#475569', display: 'block', marginBottom: '6px' }}>Main Store Stock</label>
                  <input
                    type="number"
                    placeholder="0"
                    value={formData.stockByLocation['Main Store']}
                    onChange={e => setFormData({...formData, stockByLocation: {...formData.stockByLocation, 'Main Store': e.target.value}})}
                    style={{ width: '100%', padding: '10px', border: '1px solid #cbd5e1', borderRadius: '8px', fontSize: '13px', boxSizing: 'border-box' }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '12px', fontWeight: '700', color: '#475569', display: 'block', marginBottom: '6px' }}>Kitchen Stock</label>
                  <input
                    type="number"
                    placeholder="0"
                    value={formData.stockByLocation['Kitchen']}
                    onChange={e => setFormData({...formData, stockByLocation: {...formData.stockByLocation, 'Kitchen': e.target.value}})}
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

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
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
                <div>
                  <label style={{ fontSize: '12px', fontWeight: '700', color: '#475569', display: 'block', marginBottom: '6px' }}>Cost Per Unit (₹)</label>
                  <input
                    type="number"
                    placeholder="0"
                    value={formData.costPerUnit}
                    onChange={e => setFormData({...formData, costPerUnit: e.target.value})}
                    style={{ width: '100%', padding: '10px', border: '1px solid #cbd5e1', borderRadius: '8px', fontSize: '13px', boxSizing: 'border-box' }}
                  />
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '10px' }}>
                <div>
                  <label style={{ fontSize: '12px', fontWeight: '700', color: '#475569', display: 'block', marginBottom: '6px' }}>Barcode / EAN</label>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <input
                      type="text"
                      placeholder="Scan or enter barcode"
                      value={formData.barcode}
                      onChange={e => setFormData({...formData, barcode: e.target.value})}
                      style={{ flex: 1, padding: '10px', border: '1px solid #cbd5e1', borderRadius: '8px', fontSize: '13px', boxSizing: 'border-box' }}
                    />
                    <button
                      type="button"
                      onClick={() => { setScannerTargetField('form'); setShowScannerModal(true); }}
                      style={{ padding: '0 14px', background: '#ecfdf5', color: '#047857', border: '1px solid #a7f3d0', borderRadius: '8px', fontWeight: '700', cursor: 'pointer', fontSize: '12px' }}
                    >
                      📷 Scan
                    </button>
                  </div>
                </div>
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
                  disabled={submitting}
                  style={{ padding: '10px 16px', background: submitting ? '#64748b' : '#0f172a', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: '600', cursor: submitting ? 'not-allowed' : 'pointer', fontSize: '13px' }}
                >
                  {submitting ? 'Saving...' : (isEditMode ? 'Update Item' : 'Save Item')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 2. Bulk Update Modal (now a real editable table instead of a placeholder message) */}
      {activeModal === 'bulk' && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 }}>
          <div style={{ background: '#fff', padding: '30px', borderRadius: '14px', width: '560px', maxHeight: '85vh', overflowY: 'auto', boxShadow: '0 10px 25px rgba(0,0,0,0.1)' }}>
            <h3 style={{ margin: '0 0 6px', fontSize: '18px', color: '#0f172a', fontWeight: '800' }}>🔄 Bulk Stock Update</h3>
            <p style={{ fontSize: '13px', color: '#64748b', marginBottom: '16px' }}>Edit the stock quantities below and save — only changed rows will be updated.</p>

            <div style={{ border: '1px solid #e2e8f0', borderRadius: '10px', overflow: 'hidden', marginBottom: '18px' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                <thead>
                  <tr style={{ background: '#f8fafc', textAlign: 'left' }}>
                    <th style={{ padding: '10px 12px', color: '#475569', fontWeight: 700 }}>Item</th>
                    <th style={{ padding: '10px 12px', color: '#475569', fontWeight: 700 }}>Unit</th>
                    <th style={{ padding: '10px 12px', color: '#475569', fontWeight: 700 }}>New Stock</th>
                  </tr>
                </thead>
                <tbody>
                  {bulkRows.map((row) => (
                    <tr key={row.id} style={{ borderTop: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '8px 12px', fontWeight: 700, color: '#0f172a' }}>{row.name}</td>
                      <td style={{ padding: '8px 12px', color: '#64748b' }}>{row.unit}</td>
                      <td style={{ padding: '8px 12px' }}>
                        <input
                          type="number"
                          value={row.stock}
                          onChange={(e) => updateBulkRow(row.id, e.target.value)}
                          style={{ width: '90px', padding: '6px 8px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '12px' }}
                        />
                      </td>
                    </tr>
                  ))}
                  {bulkRows.length === 0 && (
                    <tr><td colSpan={3} style={{ padding: '16px', textAlign: 'center', color: '#94a3b8' }}>No inventory items to update.</td></tr>
                  )}
                </tbody>
              </table>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button onClick={() => setActiveModal(null)} style={{ padding: '10px 16px', background: '#f1f5f9', border: 'none', borderRadius: '8px', fontWeight: '600', cursor: 'pointer', fontSize: '13px', color: '#475569' }}>Cancel</button>
              <button onClick={handleBulkSave} disabled={bulkSaving} style={{ padding: '10px 16px', background: bulkSaving ? '#64748b' : '#0f172a', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: '600', cursor: bulkSaving ? 'not-allowed' : 'pointer', fontSize: '13px' }}>
                {bulkSaving ? 'Saving...' : 'Save Changes'}
              </button>
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
                      {formCategories.map(category => (
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

                {activeModal === 'receive' && (
                  <div style={{ marginBottom: '10px' }}>
                    <label style={{ fontSize: '12px', fontWeight: '700', color: '#475569', display: 'block', marginBottom: '6px' }}>Receive Location</label>
                    <select value={purchaseForm.location} onChange={e => setPurchaseForm({ ...purchaseForm, location: e.target.value })} style={{ width: '100%', padding: '10px', border: '1px solid #cbd5e1', borderRadius: '8px', boxSizing: 'border-box' }}>
                      <option value="Main Store">Main Store</option>
                      <option value="Kitchen">Kitchen</option>
                    </select>
                  </div>
                )}

                <div>
                  <label style={{ fontSize: '12px', fontWeight: '700', color: '#475569', display: 'block', marginBottom: '6px' }}>Notes</label>
                  <textarea value={purchaseForm.note} onChange={e => setPurchaseForm({ ...purchaseForm, note: e.target.value })} rows="3" placeholder="Delivery notes or remarks" style={{ width: '100%', padding: '10px', border: '1px solid #cbd5e1', borderRadius: '8px', resize: 'vertical', boxSizing: 'border-box' }} />
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                  <button type="button" onClick={() => setActiveModal(null)} style={{ padding: '10px 16px', background: '#f1f5f9', border: 'none', borderRadius: '8px', fontWeight: '600', cursor: 'pointer', color: '#475569' }}>Cancel</button>
                  <button type="submit" disabled={submitting} style={{ padding: '10px 16px', background: submitting ? '#64748b' : '#0f172a', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: '600', cursor: submitting ? 'not-allowed' : 'pointer' }}>
                    {submitting ? 'Saving...' : (activeModal === 'receive' ? 'Save & Update Stock' : 'Send for Approval')}
                  </button>
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
                        <div style={{ display: 'flex', gap: '5px' }}>
                          <button onClick={() => handleWhatsAppPO(order)} title="Send PO on WhatsApp to Supplier" style={{ padding: '5px 8px', background: '#dcfce7', color: '#15803d', border: '1px solid #86efac', borderRadius: '6px', fontSize: '10px', fontWeight: '700', cursor: 'pointer' }}>📲 WhatsApp</button>
                          <button onClick={() => printPurchaseOrder(order)} style={{ padding: '5px 8px', background: '#f1f5f9', color: '#334155', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '10px', fontWeight: '700', cursor: 'pointer' }}>🖨️ PDF</button>
                          {order.status === 'Pending' && (
                            <button onClick={() => handlePurchaseStatus(order.id, 'Approved')} style={{ padding: '5px 8px', background: '#0f172a', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '10px', fontWeight: '700', cursor: 'pointer' }}>Approve</button>
                          )}
                          {(order.status === 'Approved' || order.status === 'Partially Received') && (
                            <button onClick={() => {
                              setReceivePOForm({ orderId: order.id, itemName: order.itemName, quantityReceived: order.quantity - (order.receivedQuantity || 0), billFileBase64: null });
                              setActiveModal('receive-po');
                            }} style={{ padding: '5px 8px', background: '#166534', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '10px', fontWeight: '700', cursor: 'pointer' }}>Receive</button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                  {purchaseOrders.length === 0 && (
                    <div style={{ fontSize: '12px', color: '#94a3b8', textAlign: 'center', padding: '10px' }}>No purchase orders yet.</div>
                  )}
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
                      {formCategories.map(category => (
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
                        <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
                          <button onClick={() => openSupplierLedger(supplier)} style={{ padding: '5px 8px', border: '1px solid #fed7aa', borderRadius: '5px', background: '#fff7ed', color: '#c2410c', fontSize: '10px', fontWeight: 700, cursor: 'pointer' }}>📖 Khata / Ledger</button>
                          <button onClick={() => editSupplier(supplier)} style={{ padding: '5px 7px', border: '1px solid #bfdbfe', borderRadius: '5px', background: '#eff6ff', color: '#1d4ed8', fontSize: '10px', fontWeight: 700, cursor: 'pointer' }}>Edit</button>
                          <button onClick={() => deactivateSupplier(supplier)} style={{ padding: '5px 7px', border: '1px solid #fecaca', borderRadius: '5px', background: '#fef2f2', color: '#b91c1c', fontSize: '10px', fontWeight: 700, cursor: 'pointer' }}>Delete</button>
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
                    entry.disposalRequested ? (
                      <span style={{ display: 'inline-block', marginTop: '8px', padding: '5px 8px', border: '1px solid #fde68a', borderRadius: '5px', background: '#fffbeb', color: '#92400e', fontSize: '10px', fontWeight: 700 }}>Disposal Requested</span>
                    ) : (
                      <button onClick={() => requestBatchDisposal(entry)} style={{ marginTop: '8px', padding: '5px 8px', border: '1px solid #fecaca', borderRadius: '5px', background: '#fef2f2', color: '#b91c1c', fontSize: '10px', fontWeight: 700, cursor: 'pointer' }}>Request Disposal</button>
                    )
                  )}
                </div>
              ))}
              {grnEntries.length === 0 && (
                <div style={{ fontSize: '12px', color: '#94a3b8', textAlign: 'center', padding: '14px' }}>No GRN entries yet.</div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Purchase Returns Modal (previously created silently via window.prompt with no visible history) */}
      {activeModal === 'returns' && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 }}>
          <div style={{ background: '#fff', padding: '30px', borderRadius: '14px', width: '640px', maxHeight: '88vh', overflowY: 'auto', boxShadow: '0 10px 25px rgba(0,0,0,0.1)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }}>
              <h3 style={{ margin: 0, fontSize: '18px', color: '#0f172a', fontWeight: '800' }}>↩️ Purchase Return</h3>
              <button onClick={() => setActiveModal(null)} style={{ background: 'none', border: 'none', fontSize: '18px', cursor: 'pointer', color: '#64748b' }}>✕</button>
            </div>

            <form onSubmit={handlePurchaseReturn} style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '20px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <label style={{ fontSize: '12px', fontWeight: '700', color: '#475569', display: 'block', marginBottom: '6px' }}>Item</label>
                  <input list="inventory-return-items" value={returnForm.itemName} onChange={e => setReturnForm({ ...returnForm, itemName: e.target.value })} placeholder="Item name" style={{ width: '100%', padding: '10px', border: '1px solid #cbd5e1', borderRadius: '8px', boxSizing: 'border-box' }} required />
                  <datalist id="inventory-return-items">
                    {inventory.map((item) => <option key={item._id || item.id} value={item.name} />)}
                  </datalist>
                </div>
                <div>
                  <label style={{ fontSize: '12px', fontWeight: '700', color: '#475569', display: 'block', marginBottom: '6px' }}>Supplier</label>
                  <input list="inventory-return-suppliers" value={returnForm.supplier} onChange={e => setReturnForm({ ...returnForm, supplier: e.target.value })} placeholder="Supplier name" style={{ width: '100%', padding: '10px', border: '1px solid #cbd5e1', borderRadius: '8px', boxSizing: 'border-box' }} />
                  <datalist id="inventory-return-suppliers">
                    {suppliers.map((s) => <option key={s.id || s.name} value={s.name} />)}
                  </datalist>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '10px' }}>
                <div>
                  <label style={{ fontSize: '12px', fontWeight: '700', color: '#475569', display: 'block', marginBottom: '6px' }}>Quantity</label>
                  <input type="number" min="0" value={returnForm.quantity} onChange={e => setReturnForm({ ...returnForm, quantity: e.target.value })} style={{ width: '100%', padding: '10px', border: '1px solid #cbd5e1', borderRadius: '8px', boxSizing: 'border-box' }} required />
                </div>
                <div>
                  <label style={{ fontSize: '12px', fontWeight: '700', color: '#475569', display: 'block', marginBottom: '6px' }}>Reason</label>
                  <input type="text" value={returnForm.reason} onChange={e => setReturnForm({ ...returnForm, reason: e.target.value })} style={{ width: '100%', padding: '10px', border: '1px solid #cbd5e1', borderRadius: '8px', boxSizing: 'border-box' }} />
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button type="button" onClick={() => setActiveModal(null)} style={{ padding: '10px 16px', background: '#f1f5f9', border: 'none', borderRadius: '8px', fontWeight: '600', cursor: 'pointer', color: '#475569' }}>Cancel</button>
                <button type="submit" disabled={submitting} style={{ padding: '10px 16px', background: submitting ? '#64748b' : '#0f172a', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: '600', cursor: submitting ? 'not-allowed' : 'pointer' }}>{submitting ? 'Saving...' : 'Submit Return'}</button>
              </div>
            </form>

            <h4 style={{ margin: '0 0 10px', fontSize: '13px', color: '#0f172a', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.6px' }}>Return History</h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {purchaseReturns.slice(0, 10).map((ret) => (
                <div key={ret._id || ret.id} style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '10px', fontSize: '12px' }}>
                  <strong style={{ color: '#0f172a' }}>{ret.itemName}</strong> · {ret.quantity} returned to {ret.supplierName || ret.supplier || 'supplier'}
                  {ret.reason && <div style={{ color: '#64748b', marginTop: '3px' }}>{ret.reason}</div>}
                </div>
              ))}
              {purchaseReturns.length === 0 && (
                <div style={{ fontSize: '12px', color: '#94a3b8', textAlign: 'center', padding: '10px' }}>No returns recorded yet.</div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Receive Purchase Order Modal */}
      {activeModal === 'receive-po' && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 }}>
          <div style={{ background: '#fff', padding: '30px', borderRadius: '14px', width: '500px', maxHeight: '88vh', overflowY: 'auto', boxShadow: '0 10px 25px rgba(0,0,0,0.1)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }}>
              <h3 style={{ margin: 0, fontSize: '18px', color: '#0f172a', fontWeight: '800' }}>✅ Receive Purchase Order</h3>
              <button onClick={() => setActiveModal(null)} style={{ background: 'none', border: 'none', fontSize: '18px', cursor: 'pointer', color: '#64748b' }}>✕</button>
            </div>

            <form onSubmit={handleReceivePO} style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '20px' }}>
              <div>
                <label style={{ fontSize: '12px', fontWeight: '700', color: '#475569', display: 'block', marginBottom: '6px' }}>Quantity Received</label>
                <input type="number" min="0.01" step="0.01" value={receivePOForm.quantityReceived} onChange={e => setReceivePOForm({ ...receivePOForm, quantityReceived: e.target.value })} style={{ width: '100%', padding: '10px', border: '1px solid #cbd5e1', borderRadius: '8px', boxSizing: 'border-box' }} required />
              </div>
              <div>
                <label style={{ fontSize: '12px', fontWeight: '700', color: '#475569', display: 'block', marginBottom: '6px' }}>Upload Bill / Invoice Photo (Optional)</label>
                <input type="file" accept="image/*" onChange={(e) => {
                  const file = e.target.files[0];
                  if (file) {
                    const reader = new FileReader();
                    reader.onloadend = () => {
                      setReceivePOForm({ ...receivePOForm, billFileBase64: reader.result });
                    };
                    reader.readAsDataURL(file);
                  }
                }} style={{ width: '100%', padding: '8px', border: '1px solid #cbd5e1', borderRadius: '8px', boxSizing: 'border-box' }} />
                {receivePOForm.billFileBase64 && (
                  <img src={receivePOForm.billFileBase64} alt="Bill Preview" style={{ marginTop: '10px', maxHeight: '100px', borderRadius: '5px' }} />
                )}
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
                <button type="button" onClick={() => setActiveModal(null)} style={{ padding: '10px 16px', background: '#f1f5f9', border: 'none', borderRadius: '8px', fontWeight: '600', cursor: 'pointer', color: '#475569' }}>Cancel</button>
                <button type="submit" disabled={submitting} style={{ padding: '10px 16px', background: submitting ? '#64748b' : '#166534', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: '600', cursor: submitting ? 'not-allowed' : 'pointer' }}>{submitting ? 'Processing...' : 'Confirm Receipt'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Waste / Stock Adjustment Modal (previously a blind window.prompt chain) */}
      {activeModal === 'waste' && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 }}>
          <div style={{ background: '#fff', padding: '30px', borderRadius: '14px', width: '600px', maxHeight: '88vh', overflowY: 'auto', boxShadow: '0 10px 25px rgba(0,0,0,0.1)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }}>
              <h3 style={{ margin: 0, fontSize: '18px', color: '#0f172a', fontWeight: '800' }}>🧮 Waste / Stock Adjustment</h3>
              <button onClick={() => setActiveModal(null)} style={{ background: 'none', border: 'none', fontSize: '18px', cursor: 'pointer', color: '#64748b' }}>✕</button>
            </div>

            <form onSubmit={handleStockAdjustment} style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '20px' }}>
              <div>
                <label style={{ fontSize: '12px', fontWeight: '700', color: '#475569', display: 'block', marginBottom: '6px' }}>Item</label>
                <select value={wasteForm.itemName} onChange={e => setWasteForm({ ...wasteForm, itemName: e.target.value })} style={{ width: '100%', padding: '10px', border: '1px solid #cbd5e1', borderRadius: '8px' }} required>
                  <option value="">Select item</option>
                  {inventory.map((item) => <option key={item._id || item.id} value={item.name}>{item.name}</option>)}
                </select>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '10px' }}>
                <div>
                  <label style={{ fontSize: '12px', fontWeight: '700', color: '#475569', display: 'block', marginBottom: '6px' }}>Quantity</label>
                  <input type="number" min="0" value={wasteForm.quantity} onChange={e => setWasteForm({ ...wasteForm, quantity: e.target.value })} style={{ width: '100%', padding: '10px', border: '1px solid #cbd5e1', borderRadius: '8px', boxSizing: 'border-box' }} required />
                </div>
                <div>
                  <label style={{ fontSize: '12px', fontWeight: '700', color: '#475569', display: 'block', marginBottom: '6px' }}>Reason</label>
                  <input type="text" value={wasteForm.reason} onChange={e => setWasteForm({ ...wasteForm, reason: e.target.value })} style={{ width: '100%', padding: '10px', border: '1px solid #cbd5e1', borderRadius: '8px', boxSizing: 'border-box' }} />
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button type="button" onClick={() => setActiveModal(null)} style={{ padding: '10px 16px', background: '#f1f5f9', border: 'none', borderRadius: '8px', fontWeight: '600', cursor: 'pointer', color: '#475569' }}>Cancel</button>
                <button type="submit" disabled={submitting} style={{ padding: '10px 16px', background: submitting ? '#64748b' : '#0f172a', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: '600', cursor: submitting ? 'not-allowed' : 'pointer' }}>{submitting ? 'Submitting...' : 'Submit Request'}</button>
              </div>
            </form>

            <h4 style={{ margin: '0 0 10px', fontSize: '13px', color: '#0f172a', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.6px' }}>Pending Approvals</h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {adjustmentRecords.filter((r) => r.status === 'pending').map((record) => (
                <div key={record._id} style={{ padding: '10px', background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: '8px', fontSize: '12px' }}>
                  <div style={{ fontWeight: 700 }}>{record.ingredientName} · Waste {Math.abs(record.difference)} {record.reason ? `· ${record.reason}` : ''}</div>
                  <div style={{ display: 'flex', gap: '6px', marginTop: '8px' }}>
                    <button onClick={() => reviewWasteRequest(record._id, 'approve')} style={{ padding: '5px 8px', border: 'none', borderRadius: '5px', background: '#16a34a', color: '#fff', cursor: 'pointer' }}>Approve</button>
                    <button onClick={() => reviewWasteRequest(record._id, 'reject')} style={{ padding: '5px 8px', border: 'none', borderRadius: '5px', background: '#dc2626', color: '#fff', cursor: 'pointer' }}>Reject</button>
                  </div>
                </div>
              ))}
              {adjustmentRecords.filter((r) => r.status === 'pending').length === 0 && (
                <div style={{ fontSize: '12px', color: '#94a3b8', textAlign: 'center', padding: '10px' }}>No pending wastage approvals.</div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Stock Transfer Modal (previously blind window.prompt chain with no history) */}
      {activeModal === 'transfers' && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 }}>
          <div style={{ background: '#fff', padding: '30px', borderRadius: '14px', width: '620px', maxHeight: '88vh', overflowY: 'auto', boxShadow: '0 10px 25px rgba(0,0,0,0.1)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }}>
              <h3 style={{ margin: 0, fontSize: '18px', color: '#0f172a', fontWeight: '800' }}>↔️ Stock Transfer</h3>
              <button onClick={() => setActiveModal(null)} style={{ background: 'none', border: 'none', fontSize: '18px', cursor: 'pointer', color: '#64748b' }}>✕</button>
            </div>

            <form onSubmit={handleStockTransfer} style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '20px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '10px' }}>
                <div>
                  <label style={{ fontSize: '12px', fontWeight: '700', color: '#475569', display: 'block', marginBottom: '6px' }}>Item</label>
                  <select value={transferForm.itemName} onChange={e => setTransferForm({ ...transferForm, itemName: e.target.value })} style={{ width: '100%', padding: '10px', border: '1px solid #cbd5e1', borderRadius: '8px' }} required>
                    <option value="">Select item</option>
                    {inventory.map((item) => <option key={item._id || item.id} value={item.name}>{item.name} ({item.unit})</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: '12px', fontWeight: '700', color: '#475569', display: 'block', marginBottom: '6px' }}>Quantity</label>
                  <input type="number" min="0" value={transferForm.quantity} onChange={e => setTransferForm({ ...transferForm, quantity: e.target.value })} style={{ width: '100%', padding: '10px', border: '1px solid #cbd5e1', borderRadius: '8px', boxSizing: 'border-box' }} required />
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <label style={{ fontSize: '12px', fontWeight: '700', color: '#475569', display: 'block', marginBottom: '6px' }}>From Location</label>
                  <input type="text" value={transferForm.fromLocation} onChange={e => setTransferForm({ ...transferForm, fromLocation: e.target.value })} style={{ width: '100%', padding: '10px', border: '1px solid #cbd5e1', borderRadius: '8px', boxSizing: 'border-box' }} required />
                </div>
                <div>
                  <label style={{ fontSize: '12px', fontWeight: '700', color: '#475569', display: 'block', marginBottom: '6px' }}>To Location</label>
                  <input type="text" value={transferForm.toLocation} onChange={e => setTransferForm({ ...transferForm, toLocation: e.target.value })} style={{ width: '100%', padding: '10px', border: '1px solid #cbd5e1', borderRadius: '8px', boxSizing: 'border-box' }} required />
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button type="button" onClick={() => setActiveModal(null)} style={{ padding: '10px 16px', background: '#f1f5f9', border: 'none', borderRadius: '8px', fontWeight: '600', cursor: 'pointer', color: '#475569' }}>Cancel</button>
                <button type="submit" disabled={submitting} style={{ padding: '10px 16px', background: submitting ? '#64748b' : '#0f172a', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: '600', cursor: submitting ? 'not-allowed' : 'pointer' }}>{submitting ? 'Saving...' : 'Record Transfer'}</button>
              </div>
            </form>

            <h4 style={{ margin: '0 0 10px', fontSize: '13px', color: '#0f172a', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.6px' }}>Transfer History</h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {stockTransfers.slice(0, 10).map((t) => (
                <div key={t._id || t.id} style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '10px', fontSize: '12px' }}>
                  <strong style={{ color: '#0f172a' }}>{t.ingredientId?.name || t.ingredientName || t.itemName || 'Item'}</strong> · {t.quantity} {t.unit || t.ingredientId?.unit || ''} moved from {t.fromLocation} → {t.toLocation}
                </div>
              ))}
              {stockTransfers.length === 0 && (
                <div style={{ fontSize: '12px', color: '#94a3b8', textAlign: 'center', padding: '10px' }}>No transfers recorded yet.</div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Recipe Usage Modal (previously client-only, lost on refresh, no visible history) */}
      {activeModal === 'recipe' && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 }}>
          <div style={{ background: '#fff', padding: '30px', borderRadius: '14px', width: '600px', maxHeight: '88vh', overflowY: 'auto', boxShadow: '0 10px 25px rgba(0,0,0,0.1)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }}>
              <h3 style={{ margin: 0, fontSize: '18px', color: '#0f172a', fontWeight: '800' }}>🍲 Recipe Consumption</h3>
              <button onClick={() => setActiveModal(null)} style={{ background: 'none', border: 'none', fontSize: '18px', cursor: 'pointer', color: '#64748b' }}>✕</button>
            </div>

            <form onSubmit={handleRecipeConsumption} style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '20px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '10px' }}>
                <div>
                  <label style={{ fontSize: '12px', fontWeight: '700', color: '#475569', display: 'block', marginBottom: '6px' }}>Ingredient</label>
                  <select value={recipeForm.ingredientName} onChange={e => setRecipeForm({ ...recipeForm, ingredientName: e.target.value })} style={{ width: '100%', padding: '10px', border: '1px solid #cbd5e1', borderRadius: '8px' }} required>
                    <option value="">Select ingredient</option>
                    {inventory.map((item) => <option key={item._id || item.id} value={item.name}>{item.name} ({item.unit})</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: '12px', fontWeight: '700', color: '#475569', display: 'block', marginBottom: '6px' }}>Quantity Used</label>
                  <input type="number" min="0" value={recipeForm.quantity} onChange={e => setRecipeForm({ ...recipeForm, quantity: e.target.value })} style={{ width: '100%', padding: '10px', border: '1px solid #cbd5e1', borderRadius: '8px', boxSizing: 'border-box' }} required />
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button type="button" onClick={() => setActiveModal(null)} style={{ padding: '10px 16px', background: '#f1f5f9', border: 'none', borderRadius: '8px', fontWeight: '600', cursor: 'pointer', color: '#475569' }}>Cancel</button>
                <button type="submit" disabled={submitting} style={{ padding: '10px 16px', background: submitting ? '#64748b' : '#0f172a', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: '600', cursor: submitting ? 'not-allowed' : 'pointer' }}>{submitting ? 'Saving...' : 'Record Usage'}</button>
              </div>
            </form>

            <h4 style={{ margin: '0 0 10px', fontSize: '13px', color: '#0f172a', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.6px' }}>Usage History</h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {recipeUsage.slice(0, 10).map((usage) => (
                <div key={usage._id || usage.id} style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '10px', fontSize: '12px' }}>
                  <strong style={{ color: '#0f172a' }}>{usage.ingredient || usage.ingredientName}</strong> · {usage.quantity} {usage.unit} consumed
                </div>
              ))}
              {recipeUsage.length === 0 && (
                <div style={{ fontSize: '12px', color: '#94a3b8', textAlign: 'center', padding: '10px' }}>No recipe usage recorded yet.</div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 4. Report Modal with Food Cost & Shrinkage Variance Tab */}
      {activeModal === 'report' && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000, padding: '20px' }}>
          <div style={{ background: '#fff', padding: '28px', borderRadius: '14px', width: reportSubTab === 'variance' ? '760px' : '460px', maxWidth: '100%', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 10px 25px rgba(0,0,0,0.1)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ margin: 0, fontSize: '18px', color: '#0f172a', fontWeight: '800' }}>📊 Inventory & Food Cost Report</h3>
              <button onClick={() => setActiveModal(null)} style={{ background: 'none', border: 'none', fontSize: '18px', cursor: 'pointer', color: '#64748b' }}>✕</button>
            </div>

            {/* Sub-tabs */}
            <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', background: '#f1f5f9', padding: '4px', borderRadius: '8px' }}>
              <button
                type="button"
                onClick={() => setReportSubTab('summary')}
                style={{ flex: 1, padding: '8px', border: 'none', borderRadius: '6px', fontSize: '12px', fontWeight: 700, cursor: 'pointer', background: reportSubTab === 'summary' ? '#fff' : 'transparent', color: reportSubTab === 'summary' ? '#0f172a' : '#64748b', boxShadow: reportSubTab === 'summary' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none' }}
              >
                📊 Summary Metrics
              </button>
              <button
                type="button"
                onClick={() => setReportSubTab('variance')}
                style={{ flex: 1, padding: '8px', border: 'none', borderRadius: '6px', fontSize: '12px', fontWeight: 700, cursor: 'pointer', background: reportSubTab === 'variance' ? '#fff' : 'transparent', color: reportSubTab === 'variance' ? '#0f172a' : '#64748b', boxShadow: reportSubTab === 'variance' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none' }}
              >
                📉 Food Cost & Shrinkage Variance
              </button>
            </div>

            {reportSubTab === 'summary' ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '13px', color: '#64748b', marginBottom: '20px' }}>
                <p style={{ margin: '4px 0' }}>Total Items: <strong style={{ color: '#0f172a' }}>{totalItems}</strong></p>
                <p style={{ margin: '4px 0' }}>Total Stock Valuation: <strong style={{ color: '#0f172a' }}>₹{totalInventoryValue.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</strong></p>
                <p style={{ margin: '4px 0' }}>In Stock: <strong style={{ color: '#16a34a' }}>{inStockCount}</strong></p>
                <p style={{ margin: '4px 0' }}>Low Stock: <strong style={{ color: '#d97706' }}>{lowStockCount}</strong></p>
                <p style={{ margin: '4px 0' }}>Out of Stock: <strong style={{ color: '#dc2626' }}>{outOfStockCount}</strong></p>
                <p style={{ margin: '4px 0' }}>Pending Purchases: <strong style={{ color: '#d97706' }}>{pendingApprovalCount}</strong></p>
                <p style={{ margin: '4px 0' }}>GRN Batches: <strong style={{ color: '#0f172a' }}>{grnEntries.length}</strong></p>
                <p style={{ margin: '4px 0' }}>Open Returns: <strong style={{ color: '#0f172a' }}>{purchaseReturnCount}</strong></p>
                <p style={{ margin: '4px 0' }}>Recorded Waste Loss: <strong style={{ color: '#dc2626' }}>{totalWasteLoss}</strong></p>
                <p style={{ margin: '4px 0' }}>Recipe Consumption: <strong style={{ color: '#0f172a' }}>{totalRecipeConsumption}</strong></p>
                <p style={{ margin: '4px 0' }}>Expiring Soon (30 Days): <strong style={{ color: '#ea580c' }}>{expiringSoonCount}</strong></p>
              </div>
            ) : (
              <div style={{ marginBottom: '20px' }}>
                <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '12px' }}>
                  Audited variance compares physical stock audits and recorded wastages against current system stock to highlight shrinkage or over-portioning.
                </div>
                <div style={{ maxHeight: '300px', overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: '8px' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', textAlign: 'left' }}>
                    <thead>
                      <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#475569', fontWeight: 700 }}>
                        <th style={{ padding: '8px 10px' }}>Item</th>
                        <th style={{ padding: '8px 10px' }}>Current Stock</th>
                        <th style={{ padding: '8px 10px' }}>Wastage Logs</th>
                        <th style={{ padding: '8px 10px' }}>Audit Variance</th>
                        <th style={{ padding: '8px 10px', textAlign: 'right' }}>Est. Cost Leak</th>
                      </tr>
                    </thead>
                    <tbody>
                      {inventory.map(item => {
                        const itemAudits = auditRecords.filter(a => String(a.ingredientId) === String(item._id || item.id) || a.ingredientName === item.name);
                        const netAuditVariance = itemAudits.reduce((sum, a) => sum + (Number(a.variance) || 0), 0);
                        const itemWastes = adjustmentRecords.filter(r => r.ingredientName === item.name && r.status === 'approved');
                        const totalWaste = itemWastes.reduce((sum, r) => sum + Math.abs(Number(r.difference) || 0), 0);
                        const costLeak = Math.abs(netAuditVariance + totalWaste) * Number(item.costPerUnit || 0);

                        return (
                          <tr key={item._id || item.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                            <td style={{ padding: '8px 10px', fontWeight: 700, color: '#0f172a' }}>{item.name}</td>
                            <td style={{ padding: '8px 10px' }}>{getStockValue(item)} {item.unit}</td>
                            <td style={{ padding: '8px 10px', color: totalWaste > 0 ? '#dc2626' : '#64748b' }}>
                              {totalWaste > 0 ? `-${totalWaste} ${item.unit}` : '0'}
                            </td>
                            <td style={{ padding: '8px 10px', color: netAuditVariance < 0 ? '#dc2626' : netAuditVariance > 0 ? '#16a34a' : '#64748b', fontWeight: 600 }}>
                              {netAuditVariance !== 0 ? `${netAuditVariance > 0 ? '+' : ''}${netAuditVariance} ${item.unit}` : '0'}
                            </td>
                            <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 700, color: costLeak > 0 ? '#dc2626' : '#64748b' }}>
                              {costLeak > 0 ? `₹${costLeak.toFixed(2)}` : '₹0.00'}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button onClick={handleDownloadReportCsv} style={{ padding: '10px 16px', background: '#f1f5f9', color: '#334155', border: '1px solid #cbd5e1', borderRadius: '8px', fontWeight: '600', cursor: 'pointer', fontSize: '12px' }}>⬇ Download CSV</button>
              <button onClick={() => setActiveModal(null)} style={{ padding: '10px 16px', background: '#0f172a', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: '600', cursor: 'pointer', fontSize: '12px' }}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* 7. Supplier Khata / Ledger Modal */}
      {activeModal === 'supplier-ledger' && selectedSupplierForLedger && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000, padding: '20px' }}>
          <div style={{ background: '#fff', padding: '28px', borderRadius: '16px', width: '840px', maxWidth: '100%', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 10px 25px rgba(0,0,0,0.15)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px', borderBottom: '1px solid #e2e8f0', paddingBottom: '14px' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '20px', color: '#0f172a', fontWeight: '800', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  📖 Supplier Khata / Ledger: {selectedSupplierForLedger.name}
                </h3>
                <p style={{ margin: '4px 0 0', fontSize: '12px', color: '#64748b' }}>
                  📞 {selectedSupplierForLedger.contact} {selectedSupplierForLedger.gstNo ? `· GSTIN: ${selectedSupplierForLedger.gstNo}` : ''} · Category: {selectedSupplierForLedger.category}
                </p>
              </div>
              <button onClick={() => { setActiveModal('suppliers'); setSelectedSupplierForLedger(null); }} style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', color: '#64748b' }}>✕</button>
            </div>

            {ledgerLoading ? (
              <div style={{ padding: '40px', textAlign: 'center', color: '#64748b', fontSize: '14px' }}>Loading supplier ledger statement...</div>
            ) : (
              <>
                {/* Financial Summary KPIs */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', marginBottom: '20px' }}>
                  <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '12px' }}>
                    <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 700, textTransform: 'uppercase' }}>Total Purchases</div>
                    <div style={{ fontSize: '18px', fontWeight: 800, color: '#0f172a', marginTop: '4px' }}>₹{Number(supplierLedgerData?.receivedTotal || 0).toFixed(2)}</div>
                  </div>
                  <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '10px', padding: '12px' }}>
                    <div style={{ fontSize: '11px', color: '#166534', fontWeight: 700, textTransform: 'uppercase' }}>Total Paid</div>
                    <div style={{ fontSize: '18px', fontWeight: 800, color: '#15803d', marginTop: '4px' }}>₹{Number(supplierLedgerData?.paidTotal || 0).toFixed(2)}</div>
                  </div>
                  <div style={{ background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: '10px', padding: '12px' }}>
                    <div style={{ fontSize: '11px', color: '#9a3412', fontWeight: 700, textTransform: 'uppercase' }}>Returns / Credit</div>
                    <div style={{ fontSize: '18px', fontWeight: 800, color: '#c2410c', marginTop: '4px' }}>₹{Number(supplierLedgerData?.returnedTotal || 0).toFixed(2)}</div>
                  </div>
                  <div style={{ background: (supplierLedgerData?.outstanding || 0) > 0 ? '#fef2f2' : '#f0fdf4', border: (supplierLedgerData?.outstanding || 0) > 0 ? '1px solid #fecaca' : '1px solid #bbf7d0', borderRadius: '10px', padding: '12px' }}>
                    <div style={{ fontSize: '11px', color: (supplierLedgerData?.outstanding || 0) > 0 ? '#991b1b' : '#166534', fontWeight: 700, textTransform: 'uppercase' }}>Net Payable Balance</div>
                    <div style={{ fontSize: '18px', fontWeight: 800, color: (supplierLedgerData?.outstanding || 0) > 0 ? '#dc2626' : '#16a34a', marginTop: '4px' }}>₹{Number(supplierLedgerData?.outstanding || 0).toFixed(2)}</div>
                  </div>
                </div>

                {/* Inline Record Payment Form */}
                <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '16px', marginBottom: '22px' }}>
                  <h4 style={{ margin: '0 0 12px', fontSize: '13px', color: '#0f172a', fontWeight: 800 }}>➕ Record New Payment to {selectedSupplierForLedger.name}</h4>
                  <form onSubmit={handleLedgerPaymentSubmit} style={{ display: 'grid', gridTemplateColumns: '1.2fr 1.2fr 1.5fr 2fr auto', gap: '10px', alignItems: 'flex-end' }}>
                    <div>
                      <label style={{ fontSize: '11px', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '4px' }}>Amount (₹)</label>
                      <input
                        type="number"
                        step="0.01"
                        min="1"
                        required
                        placeholder="5000"
                        value={ledgerPaymentForm.amount}
                        onChange={e => setLedgerPaymentForm({ ...ledgerPaymentForm, amount: e.target.value })}
                        style={{ width: '100%', padding: '8px 10px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '12px', boxSizing: 'border-box' }}
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: '11px', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '4px' }}>Payment Mode</label>
                      <select
                        value={ledgerPaymentForm.paymentMode}
                        onChange={e => setLedgerPaymentForm({ ...ledgerPaymentForm, paymentMode: e.target.value })}
                        style={{ width: '100%', padding: '8px 10px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '12px', background: '#fff', boxSizing: 'border-box' }}
                      >
                        <option value="Bank Transfer">Bank Transfer (NEFT/IMPS)</option>
                        <option value="UPI">UPI (GPay/PhonePe)</option>
                        <option value="Cash">Cash</option>
                        <option value="Cheque">Cheque</option>
                        <option value="Card">Card</option>
                      </select>
                    </div>
                    <div>
                      <label style={{ fontSize: '11px', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '4px' }}>Transaction Ref / Cheque No</label>
                      <input
                        type="text"
                        placeholder="e.g. UTR / CHQ-1049"
                        value={ledgerPaymentForm.reference}
                        onChange={e => setLedgerPaymentForm({ ...ledgerPaymentForm, reference: e.target.value })}
                        style={{ width: '100%', padding: '8px 10px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '12px', boxSizing: 'border-box' }}
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: '11px', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '4px' }}>Remarks / Note</label>
                      <input
                        type="text"
                        placeholder="e.g. Bill payment"
                        value={ledgerPaymentForm.notes}
                        onChange={e => setLedgerPaymentForm({ ...ledgerPaymentForm, notes: e.target.value })}
                        style={{ width: '100%', padding: '8px 10px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '12px', boxSizing: 'border-box' }}
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={ledgerPaymentSubmitting}
                      style={{ padding: '9px 16px', background: ledgerPaymentSubmitting ? '#64748b' : '#0f172a', color: '#fff', border: 'none', borderRadius: '6px', fontWeight: 700, fontSize: '12px', cursor: ledgerPaymentSubmitting ? 'not-allowed' : 'pointer', whiteSpace: 'nowrap' }}
                    >
                      {ledgerPaymentSubmitting ? 'Saving...' : 'Save Payment'}
                    </button>
                  </form>
                </div>

                {/* Detailed Statement Table */}
                <h4 style={{ margin: '0 0 10px', fontSize: '13px', color: '#0f172a', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.6px' }}>
                  Chronological Transaction History
                </h4>
                <div style={{ border: '1px solid #e2e8f0', borderRadius: '10px', overflow: 'hidden' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '12px' }}>
                    <thead>
                      <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#475569', fontWeight: 700 }}>
                        <th style={{ padding: '10px 14px' }}>Date</th>
                        <th style={{ padding: '10px 14px' }}>Type</th>
                        <th style={{ padding: '10px 14px' }}>Description / Ref</th>
                        <th style={{ padding: '10px 14px', textAlign: 'right' }}>Purchase (Debit +)</th>
                        <th style={{ padding: '10px 14px', textAlign: 'right' }}>Payment (Credit -)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(() => {
                        const transactions = [];
                        (supplierLedgerData?.purchases || []).forEach(p => {
                          transactions.push({
                            date: new Date(p.receivedAt || p.createdAt || Date.now()),
                            type: 'Purchase',
                            desc: `${p.itemName} (${p.receivedQuantity || p.quantity} ${p.unit}) · Batch: ${p.batchNo || 'N/A'}`,
                            debit: Number((p.receivedQuantity || p.quantity || 0) * (p.unitPrice || 0)),
                            credit: 0
                          });
                        });
                        (supplierLedgerData?.payments || []).forEach(pm => {
                          transactions.push({
                            date: new Date(pm.paidAt || pm.createdAt || Date.now()),
                            type: 'Payment',
                            desc: `Paid via ${pm.paymentMode || 'Bank Transfer'}${pm.reference ? ` (Ref: ${pm.reference})` : ''}${pm.notes ? ` · ${pm.notes}` : ''}`,
                            debit: 0,
                            credit: Number(pm.amount || 0)
                          });
                        });
                        (supplierLedgerData?.returns || []).forEach(r => {
                          transactions.push({
                            date: new Date(r.returnedAt || r.createdAt || Date.now()),
                            type: 'Return',
                            desc: `Return: ${r.itemName} (${r.quantity})${r.reason ? ` · ${r.reason}` : ''}`,
                            debit: 0,
                            credit: Number(r.amount || 0)
                          });
                        });
                        transactions.sort((a, b) => b.date - a.date);

                        if (transactions.length === 0) {
                          return <tr><td colSpan={5} style={{ padding: '24px', textAlign: 'center', color: '#94a3b8' }}>No ledger transactions recorded yet.</td></tr>;
                        }

                        return transactions.map((t, idx) => (
                          <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                            <td style={{ padding: '10px 14px', color: '#64748b' }}>{t.date.toLocaleDateString('en-IN')}</td>
                            <td style={{ padding: '10px 14px' }}>
                              <span style={{
                                padding: '3px 7px',
                                borderRadius: '4px',
                                fontSize: '10px',
                                fontWeight: 700,
                                background: t.type === 'Purchase' ? '#e0f2fe' : t.type === 'Payment' ? '#dcfce7' : '#ffedd5',
                                color: t.type === 'Purchase' ? '#0369a1' : t.type === 'Payment' ? '#15803d' : '#c2410c'
                              }}>
                                {t.type}
                              </span>
                            </td>
                            <td style={{ padding: '10px 14px', color: '#1e293b' }}>{t.desc}</td>
                            <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 700, color: t.debit > 0 ? '#0f172a' : '#cbd5e1' }}>
                              {t.debit > 0 ? `₹${t.debit.toFixed(2)}` : '—'}
                            </td>
                            <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 700, color: t.credit > 0 ? '#16a34a' : '#cbd5e1' }}>
                              {t.credit > 0 ? `₹${t.credit.toFixed(2)}` : '—'}
                            </td>
                          </tr>
                        ));
                      })()}
                    </tbody>
                  </table>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '20px', gap: '10px' }}>
                  <button onClick={() => window.print()} style={{ padding: '10px 16px', background: '#f1f5f9', color: '#334155', border: '1px solid #cbd5e1', borderRadius: '8px', fontWeight: 600, cursor: 'pointer', fontSize: '12px' }}>🖨️ Print Statement</button>
                  <button onClick={() => { setActiveModal('suppliers'); setSelectedSupplierForLedger(null); }} style={{ padding: '10px 16px', background: '#0f172a', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 600, cursor: 'pointer', fontSize: '12px' }}>Close</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* 8. Excel / CSV Bulk Stock Import Modal */}
      {activeModal === 'bulk-import' && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000, padding: '20px' }}>
          <div style={{ background: '#fff', padding: '28px', borderRadius: '16px', width: '780px', maxWidth: '100%', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 10px 25px rgba(0,0,0,0.15)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', borderBottom: '1px solid #e2e8f0', paddingBottom: '14px' }}>
              <h3 style={{ margin: 0, fontSize: '18px', color: '#0f172a', fontWeight: '800', display: 'flex', alignItems: 'center', gap: '8px' }}>
                📥 Bulk Import Inventory via CSV
              </h3>
              <button onClick={() => { setActiveModal(null); setBulkImportRows([]); }} style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', color: '#64748b' }}>✕</button>
            </div>

            <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '10px', padding: '14px', marginBottom: '18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <strong style={{ fontSize: '13px', color: '#1e40af' }}>Download Sample CSV Format</strong>
                <p style={{ margin: '3px 0 0', fontSize: '11px', color: '#3b82f6' }}>Format: Name, Category, Unit, CurrentStock, MinStockAlert, CostPerUnit, Barcode</p>
              </div>
              <button
                type="button"
                onClick={handleDownloadSampleCsv}
                style={{ padding: '8px 14px', background: '#1d4ed8', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '11px', fontWeight: 700, cursor: 'pointer' }}
              >
                ⬇️ Sample CSV Template
              </button>
            </div>

            {/* File Upload Drop Area */}
            <div style={{ border: '2px dashed #cbd5e1', borderRadius: '12px', padding: '24px', textAlign: 'center', marginBottom: '18px', background: '#f8fafc' }}>
              <div style={{ fontSize: '32px', marginBottom: '8px' }}>📂</div>
              <label style={{ fontSize: '13px', fontWeight: 700, cursor: 'pointer', display: 'inline-block', padding: '8px 16px', background: '#0f172a', color: '#fff', borderRadius: '8px', marginBottom: '8px' }}>
                Choose CSV File
                <input type="file" accept=".csv" onChange={handleCsvFileUpload} style={{ display: 'none' }} />
              </label>
              <p style={{ margin: 0, fontSize: '11px', color: '#64748b' }}>Upload a .csv file exported from Excel or vendor software.</p>
            </div>

            {bulkImportError && (
              <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '10px 14px', color: '#dc2626', fontSize: '12px', fontWeight: 600, marginBottom: '14px' }}>
                ⚠️ {bulkImportError}
              </div>
            )}

            {bulkImportSuccess && (
              <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '8px', padding: '10px 14px', color: '#166534', fontSize: '12px', fontWeight: 700, marginBottom: '14px' }}>
                ✅ {bulkImportSuccess}
              </div>
            )}

            {/* Parsed Preview Table */}
            {bulkImportRows.length > 0 && (
              <div style={{ marginBottom: '18px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <strong style={{ fontSize: '12px', color: '#0f172a' }}>Preview Parsed Items ({bulkImportRows.length})</strong>
                  <button type="button" onClick={() => setBulkImportRows([])} style={{ fontSize: '11px', color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}>Clear</button>
                </div>
                <div style={{ maxHeight: '240px', overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: '8px' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px', textAlign: 'left' }}>
                    <thead>
                      <tr style={{ background: '#f1f5f9', borderBottom: '1px solid #e2e8f0', color: '#475569', fontWeight: 700 }}>
                        <th style={{ padding: '8px 10px' }}>Item Name</th>
                        <th style={{ padding: '8px 10px' }}>Category</th>
                        <th style={{ padding: '8px 10px' }}>Unit</th>
                        <th style={{ padding: '8px 10px' }}>Stock</th>
                        <th style={{ padding: '8px 10px' }}>Min Limit</th>
                        <th style={{ padding: '8px 10px' }}>Cost/Unit</th>
                        <th style={{ padding: '8px 10px' }}>Barcode</th>
                      </tr>
                    </thead>
                    <tbody>
                      {bulkImportRows.map((r, i) => (
                        <tr key={i} style={{ borderBottom: '1px solid #f1f5f9' }}>
                          <td style={{ padding: '8px 10px', fontWeight: 700 }}>{r.name}</td>
                          <td style={{ padding: '8px 10px' }}>{r.category}</td>
                          <td style={{ padding: '8px 10px' }}>{r.unit}</td>
                          <td style={{ padding: '8px 10px', fontWeight: 700 }}>{r.stock}</td>
                          <td style={{ padding: '8px 10px' }}>{r.minLimit}</td>
                          <td style={{ padding: '8px 10px' }}>₹{r.costPerUnit}</td>
                          <td style={{ padding: '8px 10px', color: '#64748b' }}>{r.barcode || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button
                type="button"
                onClick={() => { setActiveModal(null); setBulkImportRows([]); }}
                style={{ padding: '10px 16px', background: '#f1f5f9', border: 'none', borderRadius: '8px', fontWeight: 600, cursor: 'pointer', color: '#475569', fontSize: '12px' }}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={bulkImportLoading || bulkImportRows.length === 0}
                onClick={handleExecuteBulkImport}
                style={{ padding: '10px 18px', background: bulkImportLoading || bulkImportRows.length === 0 ? '#94a3b8' : '#0f172a', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 700, cursor: bulkImportLoading || bulkImportRows.length === 0 ? 'not-allowed' : 'pointer', fontSize: '12px' }}
              >
                {bulkImportLoading ? 'Importing...' : `Confirm & Import ${bulkImportRows.length} Items`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 5. View Logs Modal */}
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
              <div style={{ padding: '8px', background: '#f8fafc', borderRadius: '6px' }}>• Stock updated from database sync.</div>
              <div style={{ padding: '8px', background: '#f8fafc', borderRadius: '6px' }}>• Low stock alerts checked successfully.</div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button onClick={() => setActiveModal(null)} style={{ padding: '10px 16px', background: '#0f172a', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: '600', cursor: 'pointer', fontSize: '13px' }}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* 6. Stock Audit Modal — FIX: this was previously nested inside the 'logs' block and could never open.
           It is now its own top-level modal, correctly triggered by activeModal === 'audit'. */}
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
                <button type="submit" disabled={submitting} style={{ padding: '10px 16px', background: submitting ? '#7c5ec9' : '#5b21b6', color: '#fff', border: 0, borderRadius: 8, fontWeight: 700, cursor: submitting ? 'not-allowed' : 'pointer' }}>{submitting ? 'Saving...' : 'Save Audit'}</button>
              </div>
            </form>
            <div style={{ marginTop: 22, borderTop: '1px solid #e2e8f0', paddingTop: 14 }}>
              <strong style={{ fontSize: 12 }}>Recent Audits</strong>
              {auditRecords.slice(0, 5).map((audit) => <div key={audit._id} style={{ padding: '9px 0', borderBottom: '1px solid #f1f5f9', fontSize: 11, color: '#475569' }}>{audit.ingredientName}: {audit.systemQuantity} → {audit.countedQuantity} ({audit.variance >= 0 ? '+' : ''}{audit.variance})</div>)}
              {auditRecords.length === 0 && (
                <div style={{ padding: '9px 0', fontSize: 11, color: '#94a3b8' }}>No audits recorded yet.</div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 7. Barcode / QR Camera Scanner Modal */}
      <BarcodeScannerModal
        isOpen={showScannerModal}
        onClose={() => setShowScannerModal(false)}
        onScanSuccess={handleBarcodeScanned}
        title={scannerTargetField === 'form' ? 'Scan Product Barcode for Item' : 'Scan to Find Inventory Item'}
      />

    </div>
  );
};

export default InventoryManagement;
