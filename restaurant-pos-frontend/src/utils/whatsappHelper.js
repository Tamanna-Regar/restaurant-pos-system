/**
 * WhatsApp E-Bill Helper for Tamanna Restaurant POS
 * Generates formatted WhatsApp text receipts and opens WhatsApp Web / App.
 */

export function formatWhatsAppReceipt(order, settings = {}) {
  const restaurantName = settings.name || 'TAMANNA RESTAURANT';
  const address = settings.address || '';
  const phone = settings.phone || '';
  const gstin = settings.gstin || '';
  const fssai = settings.fssai || '';

  const invoiceNumber = order.invoiceNumber || order.billNo || (order._id ? order._id.slice(-6).toUpperCase() : 'BILL');
  const dateStr = new Date(order.createdAt || Date.now()).toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });

  const tableLabel = order.tableId?.tableNo || order.tableId?.tableNumber || order.tableLabel || order.orderType || 'Dine-In';
  const waiterName = order.waiterName || 'Staff';
  const customerName = order.customerName || 'Valued Guest';
  const items = Array.isArray(order.items) ? order.items : [];

  let msg = `🧾 *${restaurantName.toUpperCase()}*\n`;
  if (address) msg += `📍 ${address}\n`;
  if (phone) msg += `📞 Ph: ${phone}\n`;
  if (gstin || fssai) {
    const taxLine = [gstin ? `GSTIN: ${gstin}` : '', fssai ? `FSSAI: ${fssai}` : ''].filter(Boolean).join(' | ');
    msg += `📋 ${taxLine}\n`;
  }
  msg += `━━━━━━━━━━━━━━━━━━━━━\n`;
  msg += `*TAX INVOICE / CASH BILL*\n`;
  msg += `🧾 *Invoice #*: ${invoiceNumber}\n`;
  msg += `📅 *Date*: ${dateStr}\n`;
  msg += `🍽️ *Table*: ${tableLabel} | 👨‍🍳 *Server*: ${waiterName}\n`;
  if (customerName && customerName !== 'Walk-in Customer') {
    msg += `👤 *Customer*: ${customerName}\n`;
  }
  msg += `━━━━━━━━━━━━━━━━━━━━━\n`;
  msg += `*ITEMS ORDERED:*\n`;

  items.forEach((item, idx) => {
    const portionStr = item.portion && item.portion !== 'Full' ? ` (${item.portion})` : '';
    const itemTotal = ((Number(item.price) || 0) * (Number(item.quantity) || 1)).toFixed(2);
    msg += `${idx + 1}. *${item.name}*${portionStr}\n`;
    msg += `    ${item.quantity} × ₹${Number(item.price || 0).toFixed(2)} = ₹${itemTotal}\n`;
    if (item.notes) {
      msg += `    _Note: ${item.notes}_\n`;
    }
  });

  msg += `━━━━━━━━━━━━━━━━━━━━━\n`;
  const subTotal = Number(order.subTotal || 0).toFixed(2);
  const discountAmt = Number(order.discountAmt || order.discount || 0).toFixed(2);
  const grandTotal = Number(order.grandTotal || 0).toFixed(2);

  msg += `Subtotal: ₹${subTotal}\n`;
  if (Number(discountAmt) > 0) {
    const couponTag = order.couponCode ? ` (${order.couponCode})` : '';
    msg += `Discount: -₹${discountAmt}${couponTag}\n`;
  }

  if (order.tax) {
    const halfTax = (Number(order.tax) / 2).toFixed(2);
    msg += `CGST (2.5%): ₹${halfTax}\n`;
    msg += `SGST (2.5%): ₹${halfTax}\n`;
  }

  msg += `━━━━━━━━━━━━━━━━━━━━━\n`;
  msg += `*💰 GRAND TOTAL: ₹${grandTotal}*\n`;
  msg += `Payment Mode: *${order.paymentMode || 'Cash'}* ${order.paymentStatus === 'paid' ? '✅' : ''}\n`;
  msg += `━━━━━━━━━━━━━━━━━━━━━\n`;
  msg += `🙏 *Thank you for dining with us! Visit again.*\n`;
  msg += `⭐ Share your feedback: http://localhost:3000/feedback\n`;

  return msg;
}

export function sendWhatsAppBill(order, settings = {}, targetPhone = '') {
  let phone = String(targetPhone || order.customerPhone || '').replace(/\D/g, '');

  if (!phone || phone.length < 10) {
    const prompted = window.prompt('Enter customer 10-digit WhatsApp number (e.g. 9876543210):', phone || '');
    if (!prompted) return false;
    phone = prompted.replace(/\D/g, '');
  }

  if (phone.length === 10) {
    phone = '91' + phone;
  }

  const message = formatWhatsAppReceipt(order, settings);
  const waUrl = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;

  window.open(waUrl, '_blank');
  return true;
}

export function formatWhatsAppReservation(reservation, settings = {}) {
  const restaurantName = settings.name || 'TAMANNA RESTAURANT';
  const phone = settings.phone || '+91 98765 43210';
  const tableLabel = String(reservation.tableNumber || '').startsWith('Table')
    ? reservation.tableNumber
    : `Table ${reservation.tableNumber}`;

  let msg = `🍽️ *${restaurantName.toUpperCase()}*\n`;
  msg += `━━━━━━━━━━━━━━━━━━━━━\n`;
  msg += `🎉 *TABLE RESERVATION CONFIRMED* ✅\n\n`;
  msg += `Dear *${reservation.customerName}*,\n`;
  msg += `Your table booking has been successfully confirmed at ${restaurantName}!\n\n`;
  msg += `📌 *Booking Details:*\n`;
  msg += `🍽️ *Table*: ${tableLabel}\n`;
  msg += `📅 *Date*: ${reservation.date}\n`;
  msg += `⏰ *Time Slot*: ${reservation.timeSlot} (${reservation.duration || '2 Hours'})\n`;
  msg += `👥 *Guests*: ${reservation.guests} Persons\n`;
  if (reservation.notes) {
    msg += `📝 *Special Request*: ${reservation.notes}\n`;
  }
  msg += `\n━━━━━━━━━━━━━━━━━━━━━\n`;
  msg += `📞 *Restaurant Helpline*: ${phone}\n`;
  msg += `🙏 *We look forward to welcoming you!*\n`;
  msg += `_Note: Please arrive 5-10 minutes prior to your booking time._\n`;

  return msg;
}

export function sendWhatsAppReservation(reservation, settings = {}, targetPhone = '') {
  let phone = String(targetPhone || reservation.phone || '').replace(/\D/g, '');

  if (!phone || phone.length < 10) {
    const prompted = window.prompt('Enter customer 10-digit WhatsApp number (e.g. 9876543210):', phone || '');
    if (!prompted) return false;
    phone = prompted.replace(/\D/g, '');
  }

  if (phone.length === 10) {
    phone = '91' + phone;
  }

  const message = formatWhatsAppReservation(reservation, settings);
  const waUrl = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;

  window.open(waUrl, '_blank');
  return true;
}

