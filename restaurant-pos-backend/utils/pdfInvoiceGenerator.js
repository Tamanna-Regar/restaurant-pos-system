const PDFDocument = require('pdfkit');

/**
 * Generates a clean, professional PDF invoice for an order.
 * Returns a readable stream that can be piped directly into express res.
 */
const generateInvoicePDF = (order, restaurantInfo = {}) => {
  const doc = new PDFDocument({
    size: 'A5', // Standard compact restaurant receipt size
    margin: 25
  });

  const {
    name = 'Tamanna Restaurant',
    tagline = '100% Pure Vegetarian Fine Dining',
    address = 'Main Market, Station Road',
    phone = '+91 98765 43210',
    gstin = '08AAAAA0000A1Z5',
    fssai = '12345678901234'
  } = restaurantInfo;

  // Header Banner
  doc.rect(0, 0, doc.page.width, 45).fill('#16a34a'); // Pure Veg Emerald Green
  doc.fillColor('#ffffff').fontSize(16).font('Helvetica-Bold')
    .text(name.toUpperCase(), 0, 12, { align: 'center' });
  doc.fontSize(8).font('Helvetica')
    .text(tagline, 0, 30, { align: 'center' });

  doc.moveDown(1.5);

  // Restaurant details & GSTIN
  doc.fillColor('#475569').fontSize(8).font('Helvetica')
    .text(`${address} | Contact: ${phone}`, { align: 'center' })
    .text(`GSTIN: ${gstin} | FSSAI Lic No: ${fssai}`, { align: 'center' });

  doc.moveDown(0.5);
  doc.strokeColor('#cbd5e1').lineWidth(0.5).moveTo(25, doc.y).lineTo(doc.page.width - 25, doc.y).stroke();
  doc.moveDown(0.5);

  // Invoice & Table Details
  const invoiceNo = order.invoiceNumber || `INV-${String(order._id).slice(-8).toUpperCase()}`;
  const orderDate = new Date(order.settledAt || order.createdAt || Date.now()).toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
  });
  const tableNo = order.tableId?.tableNo || order.tableId?.tableNumber || (order.orderType === 'Dine-In' ? 'T-1' : order.orderType || 'Takeaway');
  const waiter = order.waiterName || 'Staff';

  const startY = doc.y;
  doc.fillColor('#0f172a').fontSize(8).font('Helvetica-Bold')
    .text(`Invoice No: `, 25, startY, { continued: true })
    .font('Helvetica').text(invoiceNo)
    .font('Helvetica-Bold').text(`Date & Time: `, 25, startY + 12, { continued: true })
    .font('Helvetica').text(orderDate);

  doc.font('Helvetica-Bold')
    .text(`Order Type: `, doc.page.width / 2 + 10, startY, { continued: true })
    .font('Helvetica').text(`${order.orderType || 'Dine-In'} (${tableNo})`)
    .font('Helvetica-Bold').text(`Server / Waiter: `, doc.page.width / 2 + 10, startY + 12, { continued: true })
    .font('Helvetica').text(waiter);

  if (order.customerName && order.customerName !== 'Walk-in Customer') {
    doc.text(`Customer: ${order.customerName} ${order.customerPhone ? `(${order.customerPhone})` : ''}`, 25, startY + 26);
  }

  doc.y = startY + (order.customerName && order.customerName !== 'Walk-in Customer' ? 40 : 28);
  doc.strokeColor('#cbd5e1').lineWidth(0.5).moveTo(25, doc.y).lineTo(doc.page.width - 25, doc.y).stroke();
  doc.moveDown(0.5);

  // Table Header
  const colX = {
    item: 25,
    portion: 210,
    qty: 260,
    rate: 300,
    total: 350
  };

  const headerY = doc.y;
  doc.rect(25, headerY - 2, doc.page.width - 50, 16).fill('#f1f5f9');
  doc.fillColor('#0f172a').fontSize(8).font('Helvetica-Bold');
  doc.text('Dish / Item Description', colX.item + 5, headerY + 2);
  doc.text('Portion', colX.portion, headerY + 2);
  doc.text('Qty', colX.qty, headerY + 2);
  doc.text('Rate', colX.rate, headerY + 2);
  doc.text('Amount', colX.total, headerY + 2, { width: 45, align: 'right' });

  doc.y = headerY + 18;

  // Table Items
  doc.font('Helvetica').fontSize(8).fillColor('#334155');
  const items = Array.isArray(order.items) ? order.items : [];
  
  items.forEach((it) => {
    if (it.itemStatus === 'cancelled') return;
    const itemTotal = Number(it.price || 0) * Number(it.quantity || 1);
    const itemY = doc.y;

    doc.text(it.name || 'Dish Item', colX.item + 5, itemY, { width: 175 });
    doc.text(it.portion || 'Full', colX.portion, itemY);
    doc.text(String(it.quantity || 1), colX.qty, itemY);
    doc.text(`₹${Number(it.price || 0).toFixed(2)}`, colX.rate, itemY);
    doc.text(`₹${itemTotal.toFixed(2)}`, colX.total, itemY, { width: 45, align: 'right' });

    doc.moveDown(0.6);
  });

  doc.moveDown(0.3);
  doc.strokeColor('#cbd5e1').lineWidth(0.5).moveTo(25, doc.y).lineTo(doc.page.width - 25, doc.y).stroke();
  doc.moveDown(0.5);

  // Totals Section
  const totalsY = doc.y;
  const totalsX = 230;
  const totalsValX = 330;

  const subTotal = Number(order.subTotal || 0);
  const tax = Number(order.tax || 0);
  const discount = Number(order.discountAmt || order.discount || 0);
  const grandTotal = Number(order.grandTotal || subTotal + tax - discount);
  const halfTax = tax / 2;

  doc.font('Helvetica').fontSize(8).fillColor('#475569');
  doc.text('Subtotal:', totalsX, totalsY);
  doc.text(`₹${subTotal.toFixed(2)}`, totalsValX, totalsY, { width: 65, align: 'right' });

  let curY = totalsY + 12;
  if (discount > 0) {
    doc.text('Discount:', totalsX, curY);
    doc.text(`- ₹${discount.toFixed(2)}`, totalsValX, curY, { width: 65, align: 'right' });
    curY += 12;
  }

  doc.text('CGST (2.5%):', totalsX, curY);
  doc.text(`₹${halfTax.toFixed(2)}`, totalsValX, curY, { width: 65, align: 'right' });
  curY += 12;

  doc.text('SGST (2.5%):', totalsX, curY);
  doc.text(`₹${halfTax.toFixed(2)}`, totalsValX, curY, { width: 65, align: 'right' });
  curY += 14;

  doc.rect(totalsX - 5, curY - 2, doc.page.width - totalsX - 20, 20).fill('#dcfce7');
  doc.fillColor('#166534').font('Helvetica-Bold').fontSize(10);
  doc.text('Grand Total:', totalsX, curY + 3);
  doc.text(`₹${grandTotal.toFixed(2)}`, totalsValX - 5, curY + 3, { width: 70, align: 'right' });

  // Payment Status Tag
  const payMode = order.paymentMode || 'Cash';
  const payRef = order.paymentReference ? ` (Ref: ${order.paymentReference.slice(0, 18)})` : '';
  doc.fillColor('#0284c7').fontSize(8).font('Helvetica-Bold')
    .text(`Payment: ${payMode.toUpperCase()}${payRef} · PAID`, 25, curY + 4);

  // Footer Message
  doc.y = curY + 36;
  doc.strokeColor('#e2e8f0').lineWidth(0.5).moveTo(25, doc.y).lineTo(doc.page.width - 25, doc.y).stroke();
  doc.moveDown(0.8);

  doc.fillColor('#16a34a').fontSize(8).font('Helvetica-Bold')
    .text('🌱 100% Pure Vegetarian Delicacies Prepared with Hygiene', { align: 'center' });
  doc.fillColor('#64748b').fontSize(7).font('Helvetica')
    .text('Thank you for dining with Tamanna Restaurant! Please visit again.', { align: 'center' });

  doc.end();
  return doc;
};

/**
 * Returns a Promise that resolves to a Buffer containing the complete PDF binary.
 */
const generateInvoicePDFBuffer = (order, restaurantInfo = {}) => {
  return new Promise((resolve, reject) => {
    const doc = generateInvoicePDF(order, restaurantInfo);
    const chunks = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });
};

module.exports = { generateInvoicePDF, generateInvoicePDFBuffer };
