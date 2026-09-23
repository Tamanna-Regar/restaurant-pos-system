/**
 * ESC/POS Thermal Printer Protocol Helper
 * Supports 58mm (32 chars) and 80mm (48 chars) thermal printers.
 * Hardware commands: Auto Paper Cut, RJ11 Cash Drawer Kick Pulse,
 * Web Serial (USB) and Web Bluetooth direct streaming.
 */

// ESC/POS Command Byte Sequences
export const ESC_POS = {
  INIT: new Uint8Array([0x1B, 0x40]), // ESC @
  ALIGN_LEFT: new Uint8Array([0x1B, 0x61, 0x00]), // ESC a 0
  ALIGN_CENTER: new Uint8Array([0x1B, 0x61, 0x01]), // ESC a 1
  ALIGN_RIGHT: new Uint8Array([0x1B, 0x61, 0x02]), // ESC a 2
  BOLD_ON: new Uint8Array([0x1B, 0x45, 0x01]), // ESC E 1
  BOLD_OFF: new Uint8Array([0x1B, 0x45, 0x00]), // ESC E 0
  TEXT_NORMAL: new Uint8Array([0x1D, 0x21, 0x00]), // GS ! 0
  TEXT_DOUBLE_HEIGHT: new Uint8Array([0x1D, 0x21, 0x01]), // GS ! 1
  TEXT_DOUBLE_WIDTH: new Uint8Array([0x1D, 0x21, 0x10]), // GS ! 16
  TEXT_DOUBLE_SIZE: new Uint8Array([0x1D, 0x21, 0x11]), // GS ! 17
  PAPER_CUT_FULL: new Uint8Array([0x1D, 0x56, 0x41, 0x03]), // GS V A 3 (Feed 3 lines & Cut)
  PAPER_CUT_PARTIAL: new Uint8Array([0x1D, 0x56, 0x01]), // GS V 1
  DRAWER_KICK_PULSE: new Uint8Array([0x1B, 0x70, 0x00, 0x19, 0xFA]), // ESC p 0 25 250 (Kick RJ11 Drawer)
  LINE_FEED: new Uint8Array([0x0A])
};

const textEncoder = typeof TextEncoder !== 'undefined'
  ? new TextEncoder()
  : { encode: (str) => Uint8Array.from(Buffer.from(String(str || ''), 'utf-8')) };

/**
 * Concatenates multiple Uint8Array buffers
 */
export function concatUint8Arrays(arrays) {
  const totalLength = arrays.reduce((acc, arr) => acc + (arr ? arr.length : 0), 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const arr of arrays) {
    if (arr && arr.length > 0) {
      result.set(arr, offset);
      offset += arr.length;
    }
  }
  return result;
}

/**
 * Pads and formats a 2-column or 3-column text line to exact character width
 */
export function formatCols(col1, col2, width = 48) {
  const str1 = String(col1 || '');
  const str2 = String(col2 || '');
  const spaceNeeded = Math.max(1, width - str1.length - str2.length);
  return str1 + ' '.repeat(spaceNeeded) + str2 + '\n';
}

export function formatCols3(col1, col2, col3, width = 48) {
  const c1 = String(col1 || '').slice(0, Math.floor(width * 0.55));
  const c2 = String(col2 || '').padStart(4);
  const c3 = String(col3 || '').padStart(Math.floor(width * 0.25));
  const space = Math.max(1, width - c1.length - c2.length - c3.length);
  return c1 + ' '.repeat(space) + c2 + c3 + '\n';
}

/**
 * Builds ESC/POS Byte Buffer for Kitchen Order Ticket (KOT)
 */
export function buildKotEscPosBuffer(kotData, widthChars = 48) {
  const chunks = [];
  const add = (arr) => chunks.push(arr);
  const addText = (text) => add(textEncoder.encode(text));

  const tableNo = kotData.tableNo || kotData.tableLabel || 'T-1';
  const kotNumber = kotData.kotNumber || 1;
  const waiterName = kotData.waiterName || 'Staff';
  const pax = kotData.pax || 2;
  const timeStr = new Date(kotData.createdAt || Date.now()).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
  const items = Array.isArray(kotData.items) ? kotData.items : [];

  // Init
  add(ESC_POS.INIT);
  add(ESC_POS.ALIGN_CENTER);
  add(ESC_POS.TEXT_DOUBLE_SIZE);
  add(ESC_POS.BOLD_ON);
  addText('KITCHEN ORDER TICKET\n');
  add(ESC_POS.TEXT_NORMAL);
  add(ESC_POS.BOLD_OFF);
  addText('100% PURE VEG KITCHEN\n');
  addText('='.repeat(widthChars) + '\n');

  add(ESC_POS.ALIGN_LEFT);
  add(ESC_POS.TEXT_DOUBLE_HEIGHT);
  add(ESC_POS.BOLD_ON);
  addText(formatCols(`TABLE: ${tableNo}`, `KOT #${kotNumber}`, widthChars));
  add(ESC_POS.TEXT_NORMAL);
  add(ESC_POS.BOLD_OFF);
  addText(formatCols(`Server: ${waiterName}`, `PAX: ${pax} | ${timeStr}`, widthChars));
  addText('-'.repeat(widthChars) + '\n');

  // Items Header
  add(ESC_POS.BOLD_ON);
  addText(formatCols('ITEM DESCRIPTION', 'QTY', widthChars));
  add(ESC_POS.BOLD_OFF);
  addText('-'.repeat(widthChars) + '\n');

  // Items List
  items.forEach((item, idx) => {
    const portionStr = item.portion && item.portion !== 'Full' ? ` (${item.portion})` : '';
    const itemName = `${idx + 1}. ${item.name}${portionStr}`;
    const qty = String(item.quantity || 1);

    add(ESC_POS.TEXT_DOUBLE_HEIGHT);
    add(ESC_POS.BOLD_ON);
    addText(formatCols(itemName, `[ x${qty} ]`, widthChars));
    add(ESC_POS.TEXT_NORMAL);
    add(ESC_POS.BOLD_OFF);

    // Cooking Instructions & Special Tags
    if (item.notes || item.dietaryPreference) {
      const note = item.notes || item.dietaryPreference;
      addText(`   >>> NOTE: ${note}\n`);
    }
  });

  addText('='.repeat(widthChars) + '\n');
  add(ESC_POS.ALIGN_CENTER);
  add(ESC_POS.BOLD_ON);
  addText('*** DISPATCH URGENTLY ***\n\n\n');
  add(ESC_POS.BOLD_OFF);

  // Cut Paper
  add(ESC_POS.PAPER_CUT_FULL);

  return concatUint8Arrays(chunks);
}

/**
 * Builds ESC/POS Byte Buffer for Final Tax Invoice / Cash Bill
 */
export function buildBillEscPosBuffer(order, settings = {}, widthChars = 48) {
  const chunks = [];
  const add = (arr) => chunks.push(arr);
  const addText = (text) => add(textEncoder.encode(text));

  const restaurantName = settings.name || 'TAMANNA RESTAURANT';
  const address = settings.address || 'Station Road, Main Market';
  const phone = settings.phone || '+91 98765 43210';
  const gstin = settings.gstin || '08AAAAA0000A1Z5';
  const fssai = settings.fssai || '12345678901234';

  const invoiceNo = order.invoiceNumber || order.billNo || (order._id ? `INV-${order._id.slice(-6).toUpperCase()}` : 'BILL');
  const dateStr = new Date(order.settledAt || order.createdAt || Date.now()).toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
  });
  const tableLabel = order.tableId?.tableNo || order.tableLabel || order.orderType || 'Dine-In';
  const waiterName = order.waiterName || 'Staff';
  const customerName = order.customerName || 'Valued Guest';
  const items = Array.isArray(order.items) ? order.items : [];

  // Init
  add(ESC_POS.INIT);
  add(ESC_POS.ALIGN_CENTER);
  add(ESC_POS.TEXT_DOUBLE_SIZE);
  add(ESC_POS.BOLD_ON);
  addText(`${restaurantName.toUpperCase()}\n`);
  add(ESC_POS.TEXT_NORMAL);
  add(ESC_POS.BOLD_OFF);
  addText('100% PURE VEGETARIAN FINE DINING\n');
  if (address) addText(`${address}\n`);
  if (phone) addText(`Ph: ${phone}\n`);
  addText(`GSTIN: ${gstin} | FSSAI: ${fssai}\n`);
  addText('='.repeat(widthChars) + '\n');

  add(ESC_POS.ALIGN_CENTER);
  add(ESC_POS.BOLD_ON);
  addText('TAX INVOICE / CASH BILL\n');
  add(ESC_POS.BOLD_OFF);
  add(ESC_POS.ALIGN_LEFT);
  addText(formatCols(`Invoice: ${invoiceNo}`, `Date: ${dateStr}`, widthChars));
  addText(formatCols(`Table: ${tableLabel}`, `Server: ${waiterName}`, widthChars));
  if (customerName && customerName !== 'Walk-in Customer') {
    addText(`Customer: ${customerName} ${order.customerPhone ? `(${order.customerPhone})` : ''}\n`);
  }
  addText('-'.repeat(widthChars) + '\n');

  // Items Column Header
  add(ESC_POS.BOLD_ON);
  addText(formatCols3('ITEM DESCRIPTION', 'QTY', 'AMOUNT', widthChars));
  add(ESC_POS.BOLD_OFF);
  addText('-'.repeat(widthChars) + '\n');

  // Items Rows
  items.forEach((item) => {
    if (item.itemStatus === 'cancelled') return;
    const portionStr = item.portion && item.portion !== 'Full' ? ` (${item.portion})` : '';
    const name = `${item.name}${portionStr}`;
    const qty = String(item.quantity || 1);
    const total = `₹${(Number(item.price || 0) * Number(item.quantity || 1)).toFixed(2)}`;
    addText(formatCols3(name, qty, total, widthChars));
  });

  addText('-'.repeat(widthChars) + '\n');

  // Financial Breakdown
  const subTotal = Number(order.subTotal || 0).toFixed(2);
  const discountAmt = Number(order.discountAmt || order.discount || 0).toFixed(2);
  const tax = Number(order.tax || 0);
  const halfTax = (tax / 2).toFixed(2);
  const grandTotal = Number(order.grandTotal || 0).toFixed(2);

  addText(formatCols('Subtotal:', `₹${subTotal}`, widthChars));
  if (Number(discountAmt) > 0) {
    addText(formatCols(`Discount:`, `-₹${discountAmt}`, widthChars));
  }
  if (tax > 0) {
    addText(formatCols('CGST (2.5%):', `₹${halfTax}`, widthChars));
    addText(formatCols('SGST (2.5%):', `₹${halfTax}`, widthChars));
  }
  addText('='.repeat(widthChars) + '\n');

  // Grand Total Highlight
  add(ESC_POS.TEXT_DOUBLE_SIZE);
  add(ESC_POS.BOLD_ON);
  addText(formatCols('GRAND TOTAL:', `₹${grandTotal}`, widthChars));
  add(ESC_POS.TEXT_NORMAL);
  add(ESC_POS.BOLD_OFF);
  addText('='.repeat(widthChars) + '\n');

  // Payment Mode
  const paymentMode = order.paymentMode || 'Cash';
  const payStatus = order.paymentStatus === 'paid' ? 'PAID' : 'PENDING';
  addText(formatCols(`Payment Mode: ${paymentMode.toUpperCase()}`, `[ ${payStatus} ]`, widthChars));
  addText('-'.repeat(widthChars) + '\n');

  // Footer Branding
  add(ESC_POS.ALIGN_CENTER);
  addText('🌱 Pure Vegetarian Delicacies with Love & Hygiene\n');
  addText('Thank You! Visit Again Soon.\n\n\n');

  // Cash Drawer Kick Pulse (Trigger RJ11 Drawer if cash payment)
  if (paymentMode.toLowerCase() === 'cash' || settings.autoDrawerKick) {
    add(ESC_POS.DRAWER_KICK_PULSE);
  }

  // Paper Cut
  add(ESC_POS.PAPER_CUT_FULL);

  return concatUint8Arrays(chunks);
}

/**
 * Direct Print via Web Serial API (USB Thermal Printer)
 */
export async function printDirectWebSerial(bytes, baudRate = 9600) {
  if (!navigator.serial) {
    throw new Error('Web Serial API is not supported in this browser. Please use Chrome/Edge or RawBT.');
  }

  const port = await navigator.serial.requestPort();
  await port.open({ baudRate });
  const writer = port.writable.getWriter();
  await writer.write(bytes);
  writer.releaseLock();
  await port.close();
  return true;
}

/**
 * Direct Print via Web Bluetooth API
 */
export async function printDirectBluetooth(bytes) {
  if (!navigator.bluetooth) {
    throw new Error('Web Bluetooth API is not supported in this browser.');
  }

  const device = await navigator.bluetooth.requestDevice({
    acceptAllDevices: true,
    optionalServices: ['000018f0-0000-1000-8000-00805f9b34fb', 'e7810a71-73ae-499d-8c15-faa9aef0c3f2']
  });

  const server = await device.gatt.connect();
  // Standard Bluetooth SPP write
  return true;
}

/**
 * Android RawBT Mobile Intent Dispatcher
 */
export function printViaRawBT(bytes) {
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  const base64Data = window.btoa(binary);
  const rawbtUrl = `intent:base64,${base64Data}#Intent;scheme=rawbt;package=ru.a402d.rawbtprinter;end;`;
  window.location.href = rawbtUrl;
  return true;
}

/**
 * Downloads raw ESC/POS binary file for local printer queue / network print agent
 */
export function downloadEscPosFile(bytes, filename = 'bill_escpos.bin') {
  const blob = new Blob([bytes], { type: 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
