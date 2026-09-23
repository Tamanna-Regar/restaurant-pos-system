import { api } from '../api';

/**
 * Dynamically ensures the Razorpay SDK script is loaded and ready
 */
export const loadRazorpaySDK = () => {
  return new Promise((resolve) => {
    if (window.Razorpay) {
      return resolve(true);
    }
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.async = true;
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
};

/**
 * Initiates Razorpay checkout flow:
 * 1. Creates order on backend via Razorpay SDK (paise conversion)
 * 2. Launches official Razorpay modal (UPI, Cards, Netbanking, Wallets)
 * 3. Verifies cryptographic signature on backend
 * 4. Calls onSuccess or onFailure callback
 */
export const openRazorpayCheckout = async ({
  orderId = null,
  amount,
  customerName = 'Guest',
  customerPhone = '',
  description = 'Pure Veg Dining Bill',
  onSuccess,
  onFailure,
  onDismiss
}) => {
  try {
    const isLoaded = await loadRazorpaySDK();
    if (!isLoaded || !window.Razorpay) {
      throw new Error('Razorpay SDK failed to load. Please check your internet connection.');
    }

    if (!amount || Number(amount) <= 0) {
      throw new Error('Invalid payment amount. Amount must be greater than 0.');
    }

    // Step 1: Create Order on backend
    const createRes = await api.post('/payments/razorpay/create-order', {
      orderId,
      amount: Number(amount),
      customerName,
      customerPhone
    });

    if (!createRes.data?.success) {
      throw new Error(createRes.data?.message || 'Failed to initiate Razorpay order');
    }

    const {
      razorpayOrderId,
      amount: amountInPaise,
      currency,
      keyId,
      businessName
    } = createRes.data;

    // Step 2: Configure Razorpay Checkout Options
    const options = {
      key: keyId,
      amount: amountInPaise,
      currency: currency || 'INR',
      name: businessName || 'Tamanna Restaurant',
      description: description || `Order #${String(orderId || '').slice(-6)} - Tamanna Pure Veg`,
      order_id: razorpayOrderId,
      prefill: {
        name: customerName && customerName !== 'Walk-in Customer' ? customerName : 'Guest',
        contact: customerPhone || ''
      },
      notes: {
        orderId: String(orderId || ''),
        diningType: 'Pure Veg Restaurant'
      },
      theme: {
        color: '#16a34a' // Tamanna Emerald Green
      },
      handler: async function (response) {
        try {
          // Step 3: Verify Signature on Backend
          const verifyRes = await api.post('/payments/razorpay/verify', {
            orderId,
            razorpay_order_id: response.razorpay_order_id,
            razorpay_payment_id: response.razorpay_payment_id,
            razorpay_signature: response.razorpay_signature,
            customerName,
            customerPhone
          });

          if (verifyRes.data?.success) {
            if (onSuccess) {
              onSuccess({
                ...verifyRes.data,
                paymentId: response.razorpay_payment_id,
                orderId: response.razorpay_order_id
              });
            }
          } else {
            throw new Error(verifyRes.data?.message || 'Payment signature verification failed');
          }
        } catch (verifyErr) {
          console.error('Razorpay verification error:', verifyErr);
          if (onFailure) {
            onFailure(verifyErr);
          } else {
            alert(`Payment verification error: ${verifyErr.response?.data?.message || verifyErr.message}`);
          }
        }
      },
      modal: {
        ondismiss: function () {
          if (onDismiss) onDismiss();
        }
      }
    };

    // Step 4: Open Razorpay Popup
    const rzp = new window.Razorpay(options);
    rzp.on('payment.failed', function (failResponse) {
      console.error('Razorpay Payment Failed:', failResponse.error);
      if (onFailure) {
        onFailure(new Error(failResponse.error?.description || 'Payment was declined or failed'));
      }
    });

    rzp.open();
    return true;
  } catch (error) {
    console.error('Razorpay Checkout Init Error:', error);
    if (onFailure) {
      onFailure(error);
    } else {
      alert(error.response?.data?.message || error.message);
    }
    return false;
  }
};

