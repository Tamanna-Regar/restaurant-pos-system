const axios = require('axios');

/**
 * Normalizes phone number to international format without + (default 91 for India)
 */
const normalizePhoneNumber = (phone) => {
  if (!phone) return '';
  let cleaned = String(phone).replace(/\D/g, '');
  if (cleaned.length === 10) {
    cleaned = '91' + cleaned;
  }
  return cleaned;
};

/**
 * Creates formatted WhatsApp text receipt
 */
const createWhatsAppBillText = ({ customerName, grandTotal, orderId, invoiceNumber, items, restaurantName = 'Tamanna Restaurant' }) => {
  const shortId = orderId ? String(orderId).slice(-6).toUpperCase() : '';
  const billNo = invoiceNumber || shortId || 'BILL';
  
  let text = `🧾 *${restaurantName.toUpperCase()}*\n`;
  text += `*Digital Cash Bill / Receipt*\n`;
  text += `━━━━━━━━━━━━━━━━━━━━━\n`;
  text += `🧾 *Bill No*: ${billNo}\n`;
  text += `👤 *Customer*: ${customerName || 'Valued Guest'}\n`;
  
  if (Array.isArray(items) && items.length > 0) {
    text += `━━━━━━━━━━━━━━━━━━━━━\n`;
    text += `*Items:*\n`;
    items.forEach((item, idx) => {
      const qty = item.quantity || 1;
      const price = Number(item.price || 0);
      text += `${idx + 1}. ${item.name} × ${qty} = ₹${(qty * price).toFixed(2)}\n`;
    });
  }

  text += `━━━━━━━━━━━━━━━━━━━━━\n`;
  text += `💰 *Grand Total: ₹${Number(grandTotal || 0).toFixed(2)}*\n`;
  text += `━━━━━━━━━━━━━━━━━━━━━\n`;
  text += `🙏 *Thank you for dining with us! Visit again.*\n`;
  text += `🌱 100% Pure Vegetarian Excellence\n`;

  return text;
};

/**
 * Generates a wa.me direct WhatsApp link
 */
const getWhatsAppDirectLink = (phone, text) => {
  const normalized = normalizePhoneNumber(phone);
  if (!normalized) return '';
  return `https://wa.me/${normalized}?text=${encodeURIComponent(text)}`;
};

/**
 * Sends a WhatsApp digital receipt via Meta Cloud API or returns simulation fallback
 */
const sendWhatsAppBill = async (customerPhone, customerName, grandTotal, orderId, extraData = {}) => {
  try {
    const formattedPhone = normalizePhoneNumber(customerPhone);
    if (!formattedPhone) {
      console.warn('[WhatsApp] No valid customer phone provided');
      return { success: false, reason: 'Invalid phone number' };
    }

    const ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN;
    const PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_ID;
    const TEMPLATE_NAME = process.env.WHATSAPP_TEMPLATE_NAME || 'restaurant_bill_receipt';

    const billText = createWhatsAppBillText({
      customerName,
      grandTotal,
      orderId,
      invoiceNumber: extraData.invoiceNumber,
      items: extraData.items,
      restaurantName: extraData.restaurantName || 'Tamanna Restaurant'
    });

    const directLink = getWhatsAppDirectLink(formattedPhone, billText);

    // If Meta Cloud API is configured with live credentials
    const isLiveConfigured = ACCESS_TOKEN && 
                             PHONE_NUMBER_ID && 
                             ACCESS_TOKEN !== 'YOUR_WHATSAPP_TOKEN' &&
                             PHONE_NUMBER_ID !== 'YOUR_PHONE_NUMBER_ID';

    if (isLiveConfigured) {
      const url = `https://graph.facebook.com/v18.0/${PHONE_NUMBER_ID}/messages`;
      
      // Attempt sending via Meta Cloud API
      const payload = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: formattedPhone,
        type: 'text',
        text: { preview_url: false, body: billText }
      };

      try {
        const response = await axios.post(url, payload, {
          headers: {
            'Authorization': `Bearer ${ACCESS_TOKEN}`,
            'Content-Type': 'application/json'
          },
          timeout: 10000
        });

        console.log(`[WhatsApp Live API] Sent to +${formattedPhone} (Message ID: ${response.data?.messages?.[0]?.id})`);
        return {
          success: true,
          provider: 'meta_cloud',
          messageId: response.data?.messages?.[0]?.id,
          directLink
        };
      } catch (metaErr) {
        console.error('[WhatsApp Live API Error]', metaErr.response?.data || metaErr.message);
        // Fallback to direct link
        return {
          success: true,
          provider: 'meta_cloud_failed_fallback_direct',
          error: metaErr.response?.data || metaErr.message,
          directLink
        };
      }
    }

    // Simulation / Direct Link mode
    console.log(`[WhatsApp Simulated/Direct] Bill ready for +${formattedPhone} (Total: ₹${grandTotal})`);
    console.log(`[WhatsApp Direct Link] ${directLink}`);

    return {
      success: true,
      provider: 'simulation',
      simulated: true,
      directLink
    };
  } catch (error) {
    console.error('[WhatsApp Helper Error]:', error.message);
    return { success: false, error: error.message };
  }
};

module.exports = {
  normalizePhoneNumber,
  createWhatsAppBillText,
  getWhatsAppDirectLink,
  sendWhatsAppBill
};