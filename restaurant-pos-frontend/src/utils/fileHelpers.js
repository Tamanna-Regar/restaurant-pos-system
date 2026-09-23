import { api } from '../api';

const API_BASE_URL = 'http://localhost:5000/api';

/**
 * Uploads an image or document to backend via multer
 */
export const uploadFile = async (file, type = 'image') => {
  const formData = new FormData();
  formData.append(type === 'image' ? 'image' : 'document', file);

  const token = localStorage.getItem('token');
  const response = await fetch(`${API_BASE_URL}/upload/${type}`, {
    method: 'POST',
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: formData
  });

  const data = await response.json();
  if (!response.ok || !data.success) {
    throw new Error(data.message || 'File upload failed');
  }

  return data.file;
};

/**
 * Downloads a server-generated binary PDF Invoice
 */
export const downloadPdfInvoice = async (orderId, invoiceNumber = '') => {
  const token = localStorage.getItem('token');
  const response = await fetch(`${API_BASE_URL}/orders/invoice/${orderId}/pdf`, {
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    }
  });

  if (!response.ok) {
    throw new Error('Failed to generate PDF invoice');
  }

  const blob = await response.blob();
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `Invoice_${invoiceNumber || orderId}.pdf`;
  document.body.appendChild(a);
  a.click();
  window.URL.revokeObjectURL(url);
  document.body.removeChild(a);
};

/**
 * Downloads a server-generated styled Excel (.xlsx) report
 */
export const downloadExcelReport = async (type = 'sales', params = {}) => {
  const token = localStorage.getItem('token');
  const query = new URLSearchParams(params).toString();
  const endpoint = type === 'sales' ? '/reports/export/sales-excel' : '/reports/export/inventory-excel';

  const response = await fetch(`${API_BASE_URL}${endpoint}?${query}`, {
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    }
  });

  if (!response.ok) {
    throw new Error('Failed to generate Excel report');
  }

  const blob = await response.blob();
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = type === 'sales' ? `Sales_Report_${params.from || 'period'}.xlsx` : `Inventory_Stock_${new Date().toISOString().slice(0, 10)}.xlsx`;
  document.body.appendChild(a);
  a.click();
  window.URL.revokeObjectURL(url);
  document.body.removeChild(a);
};

