const axios = require('axios');

const sendWhatsAppBill = async (customerPhone, customerName, grandTotal, orderId) => {
  try {
    if (!customerPhone) return;

    // Phone number formatting (Ensure it has country code, e.g., 91 for India)
    let formattedPhone = customerPhone.replace(/\D/g, ''); // Remove special chars
    if (formattedPhone.length === 10) {
      formattedPhone = '91' + formattedPhone; // Default to India country code
    }

    // Example using Meta Cloud API (Or replace with Wati / Interakt endpoint)
    // Aap yahan apni API provider ka URL aur Token daal sakte hain
    const ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN || 'YOUR_WHATSAPP_TOKEN';
    const PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_ID || 'YOUR_PHONE_NUMBER_ID';

    const url = `https://graph.facebook.com/v17.0/${PHONE_NUMBER_ID}/messages`;

    const payload = {
      messaging_product: "whatsapp",
      to: formattedPhone,
      type: "template",
      template: {
        name: "restaurant_bill_receipt", // Aapka approved WhatsApp template name
        language: {
          code: "en"
        },
        components: [
          {
            type: "body",
            parameters: [
              { type: "text", text: customerName || "Customer" },
              { type: "text", text: String(grandTotal) },
              { type: "text", text: String(orderId).slice(-6) } // Short Order ID
            ]
          }
        ]
      }
    };

    // Agar aap Meta API use nahi kar rahe aur koi simple service hai, toh unka endpoint yahan use hoga.
    // Uncomment below line jab aapki API ready ho:
    // await axios.post(url, payload, { headers: { Authorization: `Bearer ${ACCESS_TOKEN}` } });

    console.log(`[WhatsApp Simulation] Digital receipt sent to +${formattedPhone} for Order #${orderId} (Total: ₹${grandTotal})`);
    
  } catch (error) {
    console.error('WhatsApp API Error:', error.response?.data || error.message);
  }
};

module.exports = { sendWhatsAppBill };