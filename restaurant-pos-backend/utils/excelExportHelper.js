const ExcelJS = require('exceljs');

/**
 * Creates styled Excel header row
 */
const styleHeaderRow = (row, bgColor = '16A34A') => {
  row.eachCell((cell) => {
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: bgColor }
    };
    cell.font = {
      color: { argb: 'FFFFFF' },
      bold: true,
      size: 11
    };
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
    cell.border = {
      top: { style: 'thin', color: { argb: 'CBD5E1' } },
      left: { style: 'thin', color: { argb: 'CBD5E1' } },
      bottom: { style: 'thin', color: { argb: 'CBD5E1' } },
      right: { style: 'thin', color: { argb: 'CBD5E1' } }
    };
  });
  row.height = 24;
};

/**
 * Generates an Excel workbook for Sales & Financials
 */
const generateSalesReportWorkbook = async ({ payments = [], summary = {}, topItems = [], from, to }) => {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Tamanna Restaurant POS';
  workbook.created = new Date();

  // 1. Sheet: Detailed Settlements
  const sheetPayments = workbook.addWorksheet('Settled Orders');
  sheetPayments.columns = [
    { header: 'Invoice No', key: 'invoice', width: 20 },
    { header: 'Date & Time', key: 'date', width: 22 },
    { header: 'Customer', key: 'customer', width: 20 },
    { header: 'Table / Type', key: 'table', width: 16 },
    { header: 'Payment Mode', key: 'mode', width: 16 },
    { header: 'Reference', key: 'ref', width: 22 },
    { header: 'Subtotal (₹)', key: 'subtotal', width: 14 },
    { header: 'Tax (₹)', key: 'tax', width: 12 },
    { header: 'Discount (₹)', key: 'discount', width: 14 },
    { header: 'Grand Total (₹)', key: 'total', width: 16 }
  ];

  styleHeaderRow(sheetPayments.getRow(1), '16A34A');

  payments.forEach((p) => {
    const row = sheetPayments.addRow({
      invoice: p.invoiceNumber || '—',
      date: new Date(p.settledAt || p.createdAt).toLocaleString('en-IN'),
      customer: p.customerName || 'Walk-in',
      table: p.orderId?.tableId?.tableNo ? `Table ${p.orderId.tableId.tableNo}` : (p.orderId?.orderType || 'Dine-In'),
      mode: p.paymentMode || 'Cash',
      ref: p.paymentReference || '—',
      subtotal: Number(p.subTotal || 0).toFixed(2),
      tax: Number(p.tax || 0).toFixed(2),
      discount: Number(p.discount || 0).toFixed(2),
      total: Number(p.grandTotal || 0).toFixed(2)
    });
    row.alignment = { vertical: 'middle' };
  });

  // 2. Sheet: Top Selling Dishes
  const sheetItems = workbook.addWorksheet('Top Selling Items');
  sheetItems.columns = [
    { header: 'Rank', key: 'rank', width: 10 },
    { header: 'Dish / Item Name', key: 'name', width: 30 },
    { header: 'Quantity Sold', key: 'qty', width: 16 },
    { header: 'Total Sales (₹)', key: 'sales', width: 18 }
  ];

  styleHeaderRow(sheetItems.getRow(1), '0284C7');

  topItems.forEach((item, idx) => {
    sheetItems.addRow({
      rank: idx + 1,
      name: item._id || 'Item',
      qty: item.quantity || 0,
      sales: Number(item.sales || 0).toFixed(2)
    });
  });

  return workbook;
};

/**
 * Generates an Excel workbook for Inventory & Stock
 */
const generateInventoryWorkbook = async (ingredients = []) => {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Current Inventory');

  sheet.columns = [
    { header: 'Item Name', key: 'name', width: 26 },
    { header: 'Category', key: 'category', width: 16 },
    { header: 'Current Stock', key: 'stock', width: 14 },
    { header: 'Unit', key: 'unit', width: 10 },
    { header: 'Min Stock Alert', key: 'min', width: 16 },
    { header: 'Cost per Unit (₹)', key: 'cost', width: 16 },
    { header: 'Total Value (₹)', key: 'value', width: 16 },
    { header: 'Stock Health', key: 'health', width: 16 },
    { header: 'Barcode', key: 'barcode', width: 18 }
  ];

  styleHeaderRow(sheet.getRow(1), '059669');

  ingredients.forEach((ing) => {
    const isLow = Number(ing.currentStock || 0) <= Number(ing.minStockAlert || 0);
    const val = Number(ing.currentStock || 0) * Number(ing.costPerUnit || 0);

    const row = sheet.addRow({
      name: ing.name,
      category: ing.category || 'General',
      stock: ing.currentStock || 0,
      unit: ing.unit || 'kg',
      min: ing.minStockAlert || 0,
      cost: Number(ing.costPerUnit || 0).toFixed(2),
      value: val.toFixed(2),
      health: isLow ? '⚠️ LOW STOCK' : '✅ NORMAL',
      barcode: ing.barcode || '—'
    });

    if (isLow) {
      row.getCell('health').font = { color: { argb: 'DC2626' }, bold: true };
    }
  });

  return workbook;
};

/**
 * Convenience buffer export for sales reports
 */
const generateSalesExcelReport = async (payments, summary, topItems) => {
  const workbook = await generateSalesReportWorkbook({ payments, summary, topItems });
  return workbook.xlsx.writeBuffer();
};

/**
 * Convenience buffer export for inventory reports
 */
const generateInventoryExcelReport = async (ingredients) => {
  const workbook = await generateInventoryWorkbook(ingredients);
  return workbook.xlsx.writeBuffer();
};

module.exports = {
  generateSalesReportWorkbook,
  generateInventoryWorkbook,
  generateSalesExcelReport,
  generateInventoryExcelReport
};
