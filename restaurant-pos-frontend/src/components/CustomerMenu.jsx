import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';

const normalizeMenuItem = (item, index) => ({
  ...item,
  _id: item?._id || item?.id || `menu-${index + 1}`,
  name: item?.name || `Menu Item ${index + 1}`,
  price: Number(item?.price || 0),
  category: item?.category || 'Main Course',
  foodType: String(item?.foodType || 'veg').toLowerCase(),
  isAvailable: item?.isAvailable !== false
});

const CustomerMenu = () => {
  const { tableId } = useParams();
  const [menuItems, setMenuItems] = useState([]);
  const [cart, setCart] = useState([]);
  const [loading, setLoading] = useState(true);
  const [orderPlaced, setOrderPlaced] = useState(false);
  const [customerName, setCustomerName] = useState('');
  const [error, setError] = useState('');
  const [customizingItem, setCustomizingItem] = useState(null);
  const [selectedAddons, setSelectedAddons] = useState([]);

  useEffect(() => {
    const fetchMenu = async () => {
      try {
        const res = await axios.get('http://localhost:5000/api/menu');
        const items = Array.isArray(res.data) ? res.data : res.data?.data || [];
        setMenuItems(items.map(normalizeMenuItem));
      } catch (err) {
        console.error('Error fetching menu:', err);
        setMenuItems([]);
        setError('The menu is currently unavailable. Please try again later.');
      } finally {
        setLoading(false);
      }
    };

    fetchMenu();
  }, []);

  const openItemCustomization = (item) => {
    if (item.addons?.length) {
      setCustomizingItem(item);
      setSelectedAddons([]);
      return;
    }
    addToCart(item);
  };

  const addToCart = (item, addons = []) => {
    const addonKey = addons.map((addon) => typeof addon === 'string' ? addon : addon.name).join('|');
    const cartKey = `${item._id}:${addonKey}`;
    setCart(prevCart => {
      const existing = prevCart.find(i => i.cartKey === cartKey);
      if (existing) {
        return prevCart.map(i => i.cartKey === cartKey ? { ...i, qty: i.qty + 1 } : i);
      }
      return [...prevCart, { ...item, addons, cartKey, qty: 1 }];
    });
  };

  const addonName = (addon) => typeof addon === 'string' ? addon : addon?.name || '';
  const addonPrice = (addon) => typeof addon === 'string' ? 0 : Number(addon?.price || 0);
  const calculateTotal = () => cart.reduce((total, item) => {
    const modifiers = (item.addons || []).reduce((sum, addon) => sum + addonPrice(addon), 0);
    return total + (Number(item.price || 0) + modifiers) * Number(item.qty || 1);
  }, 0);

  const handlePlaceOrder = async () => {
    if (cart.length === 0) {
      alert('Your cart is empty!');
      return;
    }

    try {
      const orderData = {
        tableId: tableId || 'QR-Table',
        orderType: 'Dine-In',
        customerName: customerName || 'QR Guest',
        customerPhone: '',
        waiterName: 'QR Guest',
        paymentMode: 'Cash',
        items: cart.map((item) => ({
          itemId: item._id,
          originalId: item._id,
          name: item.name,
          foodType: item.foodType || 'veg',
          portion: 'Full',
          quantity: Number(item.qty || 1),
          price: Number(item.price || 0),
          notes: item.addons?.length ? `Add-ons: ${item.addons.map(addonName).join(', ')}` : '',
          addons: item.addons || []
        }))
      };

      await axios.post('http://localhost:5000/api/orders/public/qr', orderData);
      setOrderPlaced(true);
      setCart([]);
    } catch (err) {
      console.error('Order placement failed:', err);
      alert(err.response?.data?.message || 'Failed to place order. Please try again.');
    }
  };

  if (loading) return <div style={{ textAlign: 'center', padding: '50px' }}>Loading Menu...</div>;

  if (orderPlaced) {
    return (
      <div style={{ textAlign: 'center', padding: '50px', fontFamily: 'sans-serif' }}>
        <h2 style={{ color: '#16a34a' }}>🎉 Order Placed Successfully!</h2>
        <p>Your order has been sent to the kitchen for Table ID: {tableId || 'QR-Table'}</p>
        <p style={{ color: '#666', fontSize: '14px' }}>Sit back and relax, food is on the way!</p>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: '600px', margin: '0 auto', padding: '20px', fontFamily: 'sans-serif', background: '#f8fafc', minHeight: '100vh' }}>
      <header style={{ background: '#0f172a', color: '#fff', padding: '15px', borderRadius: '8px', textAlign: 'center', marginBottom: '20px' }}>
        <h2>🍽️ Tamanna Restaurant</h2>
        <p style={{ fontSize: '13px', color: '#94a3b8', margin: '5px 0 0 0' }}>Table ID: {tableId || 'QR-Table'}</p>
      </header>

      {error && (
        <div style={{ padding: '10px 12px', marginBottom: '12px', background: '#fff7ed', color: '#9a4d00', border: '1px solid #fed7aa', borderRadius: '8px' }}>
          {error}
        </div>
      )}

      <div style={{ marginBottom: '20px' }}>
        <input
          type="text"
          placeholder="Enter your name (Optional)"
          value={customerName}
          onChange={(e) => setCustomerName(e.target.value)}
          style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1', boxSizing: 'border-box' }}
        />
      </div>

      <h3>Menu Items</h3>
      <div style={{ display: 'grid', gap: '10px', marginBottom: '30px' }}>
        {menuItems.map(item => (
          <div key={item._id} style={{ background: '#fff', padding: '15px', borderRadius: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
            <div>
              <h4 style={{ margin: '0 0 5px 0', color: '#1e293b' }}>{item.name}</h4>
              <span style={{ color: '#059669', fontWeight: 'bold' }}>₹{item.price}</span>
              {item.addons?.length > 0 && <div style={{ color: '#64748b', fontSize: 11, marginTop: 4 }}>Customizations available</div>}
            </div>
            <button
              onClick={() => openItemCustomization(item)}
              style={{ background: '#2563eb', color: '#fff', border: 'none', padding: '8px 12px', borderRadius: '6px', cursor: 'pointer' }}
            >
              Add +
            </button>
          </div>
        ))}
      </div>

      {cart.length > 0 && (
        <div style={{ background: '#fff', padding: '20px', borderRadius: '8px', boxShadow: '0 4px 6px rgba(0,0,0,0.1)', position: 'sticky', bottom: '20px' }}>
          <h3>🛒 Your Cart</h3>
          {cart.map(item => (
            <div key={item.cartKey || item._id} style={{ display: 'flex', justifyContent: 'space-between', margin: '10px 0', fontSize: '14px' }}>
              <span>{item.name} x {item.qty}{item.addons?.length ? <small style={{ display: 'block', color: '#64748b' }}>{item.addons.map(addonName).join(', ')}</small> : null}</span>
              <div>
                <span style={{ marginRight: '10px' }}>₹{((Number(item.price) + (item.addons || []).reduce((sum, addon) => sum + addonPrice(addon), 0)) * item.qty).toFixed(2)}</span>
                <button onClick={() => setCart((current) => current.filter((entry) => (entry.cartKey || entry._id) !== (item.cartKey || item._id)))} style={{ background: '#ef4444', color: '#fff', border: 'none', borderRadius: '4px', padding: '2px 6px', cursor: 'pointer' }}>Remove</button>
              </div>
            </div>
          ))}
          <hr style={{ border: '0', borderTop: '1px solid #e2e8f0', margin: '15px 0' }} />
          <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', fontSize: '16px', marginBottom: '15px' }}>
            <span>Total:</span>
            <span>₹{calculateTotal()}</span>
          </div>
          <button
            onClick={handlePlaceOrder}
            style={{ width: '100%', background: '#16a34a', color: '#fff', border: 'none', padding: '12px', borderRadius: '6px', fontSize: '16px', fontWeight: 'bold', cursor: 'pointer' }}
          >
            Place Order Now
          </button>
        </div>
      )}
      {customizingItem && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, zIndex: 20 }}>
          <div style={{ background: '#fff', borderRadius: 12, padding: 20, width: '100%', maxWidth: 380 }}>
            <h3 style={{ marginTop: 0, color: '#0f172a' }}>Customize {customizingItem.name}</h3>
            <div style={{ display: 'grid', gap: 10 }}>
              {(customizingItem.addons || []).map((addon) => (
                <label key={addonName(addon)} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: 10, border: '1px solid #e2e8f0', borderRadius: 8 }}>
                  <input type="checkbox" checked={selectedAddons.some((entry) => addonName(entry) === addonName(addon))} onChange={() => setSelectedAddons((current) => current.some((entry) => addonName(entry) === addonName(addon)) ? current.filter((entry) => addonName(entry) !== addonName(addon)) : [...current, addon])} />
                  {addonName(addon)}{addonPrice(addon) > 0 ? ` (+₹${addonPrice(addon).toFixed(2)})` : ''}
                </label>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 18 }}>
              <button onClick={() => setCustomizingItem(null)} style={{ flex: 1, padding: 10, border: '1px solid #cbd5e1', borderRadius: 8, background: '#fff' }}>Cancel</button>
              <button onClick={() => { addToCart(customizingItem, selectedAddons); setCustomizingItem(null); }} style={{ flex: 1, padding: 10, border: 0, borderRadius: 8, background: '#2563eb', color: '#fff', fontWeight: 700 }}>Add to Cart</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CustomerMenu;