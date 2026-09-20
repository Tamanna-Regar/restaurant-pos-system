import React, { useState } from 'react';
import { api } from '../api';

const CustomerAndCouponWidget = ({ subTotal, onDiscountApplied, onCustomerSelect }) => {
  // Customer State
  const [phone, setPhone] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [loyaltyPoints, setLoyaltyPoints] = useState(0);
  const [crmStatus, setCrmStatus] = useState('');

  // Coupon State
  const [couponCode, setCouponCode] = useState('');
  const [couponDiscount, setCouponDiscount] = useState(0);
  const [appliedCoupon, setAppliedCoupon] = useState(null);
  const [couponError, setCouponError] = useState('');
  const [couponSuccess, setCouponSuccess] = useState('');

  // 1. Phone number type hone par Customer Fetch/Check
  const handlePhoneChange = async (e) => {
    const val = e.target.value;
    setPhone(val);
    
    if (val.length === 10) {
      try {
        const res = await api.get(`/customers/${val}`);
        if (res.data && res.data.data) {
          const cust = res.data.data;
          setCustomerName(cust.name);
          setLoyaltyPoints(cust.loyaltyPoints || 0);
          setCrmStatus(`Existing Customer (${cust.loyaltyPoints || 0} Loyalty Points)`);
          onCustomerSelect({ phone: val, name: cust.name, loyaltyPoints: cust.loyaltyPoints });
        } else {
          setCrmStatus('New Customer');
          onCustomerSelect({ phone: val, name: customerName || 'Guest Customer' });
        }
      } catch (err) {
        setCrmStatus('New Customer');
        onCustomerSelect({ phone: val, name: customerName || 'Guest Customer' });
      }
    }
  };

  // 2. Name Update Handler
  const handleNameChange = (e) => {
    const val = e.target.value;
    setCustomerName(val);
    onCustomerSelect({ phone, name: val });
  };

  // 3. Apply Coupon Handler
  const handleApplyCoupon = async () => {
    setCouponError('');
    setCouponSuccess('');

    if (!couponCode.trim()) {
      setCouponError('Please enter a promo code');
      return;
    }

    try {
      const res = await api.post('/coupons/apply', {
        code: couponCode,
        orderAmount: subTotal
      });

      if (res.data.success) {
        const discAmt = res.data.discountAmt;
        setCouponDiscount(discAmt);
        setAppliedCoupon(res.data.code);
        setCouponSuccess(`Coupon '${res.data.code}' applied! Saved ₹${discAmt}`);
        onDiscountApplied(discAmt, res.data.code);
      }
    } catch (err) {
      setCouponError(err.response?.data?.message || 'Failed to apply coupon');
      setCouponDiscount(0);
      setAppliedCoupon(null);
      onDiscountApplied(0, null);
    }
  };

  // 4. Remove Applied Coupon
  const handleRemoveCoupon = () => {
    setCouponCode('');
    setCouponDiscount(0);
    setAppliedCoupon(null);
    setCouponSuccess('');
    setCouponError('');
    onDiscountApplied(0, null);
  };

  return (
    <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 space-y-4 mb-4">
      
      {/* SECTION 1: Customer CRM Lookup */}
      <div>
        <h4 className="font-semibold text-gray-700 text-sm mb-2">👤 Customer Info & Loyalty</h4>
        <div className="grid grid-cols-2 gap-2">
          <input
            type="text"
            placeholder="Phone Number (10 digit)"
            value={phone}
            onChange={handlePhoneChange}
            maxLength={10}
            className="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
          />
          <input
            type="text"
            placeholder="Customer Name"
            value={customerName}
            onChange={handleNameChange}
            className="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
          />
        </div>
        {crmStatus && (
          <p className={`text-xs mt-1 font-medium ${crmStatus.includes('Existing') ? 'text-green-600' : 'text-gray-500'}`}>
            {crmStatus}
          </p>
        )}
      </div>

      <hr className="border-gray-100" />

      {/* SECTION 2: Discount Coupon Engine */}
      <div>
        <h4 className="font-semibold text-gray-700 text-sm mb-2">🎟️ Apply Promo / Coupon Code</h4>
        
        {!appliedCoupon ? (
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="e.g. FESTIVE20"
              value={couponCode}
              onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
              className="flex-1 px-3 py-2 text-sm border rounded-lg uppercase focus:outline-none focus:ring-2 focus:ring-orange-500"
            />
            <button
              type="button"
              onClick={handleApplyCoupon}
              className="px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white text-sm font-medium rounded-lg transition"
            >
              Apply
            </button>
          </div>
        ) : (
          <div className="flex justify-between items-center bg-green-50 p-2.5 rounded-lg border border-green-200">
            <div>
              <span className="font-bold text-green-700 text-xs bg-green-200 px-2 py-0.5 rounded mr-2">
                {appliedCoupon}
              </span>
              <span className="text-xs text-green-700 font-medium">₹{couponDiscount} Off</span>
            </div>
            <button
              onClick={handleRemoveCoupon}
              className="text-xs text-red-600 font-semibold hover:underline"
            >
              Remove
            </button>
          </div>
        )}

        {couponError && <p className="text-xs text-red-500 mt-1">{couponError}</p>}
        {couponSuccess && !appliedCoupon && <p className="text-xs text-green-600 mt-1">{couponSuccess}</p>}
      </div>

    </div>
  );
};

export default CustomerAndCouponWidget;