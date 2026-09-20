import React, { useState } from 'react';
import { api } from '../api';

const emptyDetails = {
  phone: '',
  name: '',
  email: '',
  address: '',
  gstin: '',
  stateCode: '',
  dateOfBirth: ''
};

const formatCurrency = (value) => `₹${Number(value || 0).toLocaleString('en-IN', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
})}`;

const CustomerCRM = () => {
  const [phoneQuery, setPhoneQuery] = useState('');
  const [details, setDetails] = useState(emptyDetails);
  const [customer, setCustomer] = useState(null);
  const [orders, setOrders] = useState([]);
  const [lookupState, setLookupState] = useState('idle');
  const [lookupMessage, setLookupMessage] = useState('');
  const [saveState, setSaveState] = useState('idle');
  const [saveMessage, setSaveMessage] = useState('');

  const updateDetails = (event) => {
    const { name, value } = event.target;
    setDetails((previous) => ({
      ...previous,
      [name]: name === 'gstin' ? value.toUpperCase() : value
    }));
  };

  const handleLookup = async (event) => {
    event?.preventDefault();
    const phone = phoneQuery.replace(/\D/g, '');

    if (!phone) {
      setLookupState('error');
      setLookupMessage('Enter a customer phone number to search.');
      setCustomer(null);
      return;
    }

    setLookupState('loading');
    setLookupMessage('');
    setSaveState('idle');
    setSaveMessage('');

    try {
      const [response, historyResponse] = await Promise.all([
        api.get(`/customers/${phone}`),
        api.get(`/customers/history/${phone}`)
      ]);
      const record = response.data?.data;
      if (!record) {
        throw new Error('Customer response did not include a profile.');
      }

      setCustomer(record);
      setOrders(historyResponse.data?.data || []);
      setDetails({
        phone: record.phone || phone,
        name: record.name || '',
        email: record.email || '',
        address: record.address || '',
        gstin: record.gstin || '',
        stateCode: record.stateCode || '',
        dateOfBirth: record.dateOfBirth ? String(record.dateOfBirth).slice(0, 10) : ''
      });
      setLookupState('found');
      setLookupMessage('Customer profile loaded.');
    } catch (error) {
      if (error.response?.status === 404) {
        setCustomer(null);
        setDetails({ ...emptyDetails, phone });
        setLookupState('new');
        setOrders([]);
        setLookupMessage('No customer found. Enter the details below to create a profile.');
      } else {
        setLookupState('error');
        setLookupMessage(error.response?.data?.message || 'Customer lookup failed. Please try again.');
      }
    }
  };

  const handleSave = async (event) => {
    event.preventDefault();
    setSaveState('loading');
    setSaveMessage('');

    try {
      const response = await api.post('/customers', {
        phone: details.phone,
        name: details.name.trim(),
        email: details.email.trim(),
        address: details.address.trim(),
        gstin: details.gstin.trim(),
        stateCode: details.stateCode.trim(),
        dateOfBirth: details.dateOfBirth || null
      });
      const savedCustomer = response.data?.data;
      if (!savedCustomer) {
        throw new Error('Customer save response did not include a profile.');
      }

      setCustomer(savedCustomer);
      const historyResponse = await api.get(`/customers/history/${savedCustomer.phone || details.phone}`);
      setOrders(historyResponse.data?.data || []);
      setPhoneQuery(savedCustomer.phone || details.phone);
      setDetails({
        phone: savedCustomer.phone || details.phone,
        name: savedCustomer.name || '',
        email: savedCustomer.email || '',
        address: savedCustomer.address || '',
        gstin: savedCustomer.gstin || '',
        stateCode: savedCustomer.stateCode || '',
        dateOfBirth: savedCustomer.dateOfBirth ? String(savedCustomer.dateOfBirth).slice(0, 10) : ''
      });
      setLookupState('found');
      setSaveState('saved');
      setSaveMessage('Customer details saved successfully.');
    } catch (error) {
      setSaveState('error');
      setSaveMessage(error.response?.data?.message || 'Could not save customer details. Please try again.');
    }
  };

  const hasProfile = customer !== null;
  const inputStyle = {
    width: '100%',
    boxSizing: 'border-box',
    border: '1px solid #cbd5e1',
    borderRadius: '8px',
    padding: '10px 12px',
    color: '#0f172a',
    background: '#fff',
    fontSize: '13px'
  };
  const labelStyle = { display: 'block', color: '#475569', fontSize: '12px', fontWeight: 700, marginBottom: '6px' };

  return (
    <section style={{ flex: 1, overflowY: 'auto', padding: '28px', background: '#f8fafc' }}>
      <div style={{ maxWidth: '1120px', margin: '0 auto' }}>
        <div style={{ marginBottom: '22px' }}>
          <h1 style={{ margin: 0, color: '#0f172a', fontSize: '24px' }}>Customer CRM & Loyalty</h1>
          <p style={{ margin: '6px 0 0', color: '#64748b', fontSize: '13px' }}>
            Search by phone to view customer history, loyalty value, and GST details.
          </p>
        </div>

        <form onSubmit={handleLookup} style={{ display: 'flex', gap: '10px', alignItems: 'flex-end', maxWidth: '620px', marginBottom: '18px' }}>
          <div style={{ flex: 1 }}>
            <label htmlFor="customer-phone-search" style={labelStyle}>Phone number</label>
            <input
              id="customer-phone-search"
              value={phoneQuery}
              onChange={(event) => setPhoneQuery(event.target.value.replace(/[^\d+\s-]/g, ''))}
              placeholder="Search customer phone"
              maxLength={16}
              style={inputStyle}
              aria-label="Search customer by phone number"
            />
          </div>
          <button type="submit" disabled={lookupState === 'loading'} style={{ border: 0, borderRadius: '8px', padding: '10px 18px', background: '#fc4f1a', color: '#fff', fontWeight: 700, cursor: 'pointer' }}>
            {lookupState === 'loading' ? 'Searching…' : 'Search'}
          </button>
        </form>

        {lookupMessage && (
          <div role="status" style={{ marginBottom: '18px', color: lookupState === 'error' ? '#b91c1c' : lookupState === 'new' ? '#92400e' : '#166534', background: lookupState === 'error' ? '#fef2f2' : lookupState === 'new' ? '#fffbeb' : '#f0fdf4', border: `1px solid ${lookupState === 'error' ? '#fecaca' : lookupState === 'new' ? '#fde68a' : '#bbf7d0'}`, borderRadius: '8px', padding: '10px 12px', fontSize: '13px' }}>
            {lookupMessage}
          </div>
        )}

        {hasProfile && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '14px', marginBottom: '20px' }}>
            {[
              ['Total orders', customer.totalOrders, '#2563eb'],
              ['Total spent', formatCurrency(customer.totalSpent), '#0d9f5f'],
              ['Loyalty points', customer.loyaltyPoints || 0, '#c2410c'],
              ['Membership', customer.membershipTier || 'Regular', '#7c3aed']
            ].map(([label, value, color]) => (
              <div key={label} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '18px' }}>
                <div style={{ color: '#64748b', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase' }}>{label}</div>
                <div style={{ color, fontSize: '25px', fontWeight: 800, marginTop: '8px' }}>{value}</div>
              </div>
            ))}
          </div>
        )}
        {hasProfile && customer.birthdayOffer?.eligible && (
          <div style={{ marginBottom: 18, padding: '12px 14px', borderRadius: 10, background: '#fff7ed', border: '1px solid #fed7aa', color: '#9a3412', fontSize: 13, fontWeight: 700 }}>
            🎂 Birthday month offer: {customer.birthdayOffer.discountPercent}% discount available
          </div>
        )}

        {(hasProfile || lookupState === 'new') && (
          <form onSubmit={handleSave} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '22px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'center', marginBottom: '18px', flexWrap: 'wrap' }}>
              <div>
                <h2 style={{ margin: 0, color: '#0f172a', fontSize: '17px' }}>{hasProfile ? 'Customer details' : 'Create customer profile'}</h2>
                <p style={{ margin: '4px 0 0', color: '#64748b', fontSize: '12px' }}>Order totals and loyalty points are maintained by the billing API.</p>
              </div>
              {hasProfile && <span style={{ color: '#166534', background: '#dcfce7', borderRadius: '999px', padding: '5px 10px', fontSize: '11px', fontWeight: 700 }}>Existing customer</span>}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '16px' }}>
              <div>
                <label htmlFor="crm-phone" style={labelStyle}>Phone number</label>
                <input id="crm-phone" name="phone" value={details.phone} readOnly style={{ ...inputStyle, background: '#f8fafc' }} />
              </div>
              <div>
                <label htmlFor="crm-name" style={labelStyle}>Customer name</label>
                <input id="crm-name" name="name" value={details.name} onChange={updateDetails} required style={inputStyle} />
              </div>
              <div>
                <label htmlFor="crm-email" style={labelStyle}>Email</label>
                <input id="crm-email" type="email" name="email" value={details.email} onChange={updateDetails} style={inputStyle} />
              </div>
              <div>
                <label htmlFor="crm-gstin" style={labelStyle}>GSTIN</label>
                <input id="crm-gstin" name="gstin" value={details.gstin} onChange={updateDetails} maxLength={15} pattern="^$|^[0-9A-Z]{15}$" title="GSTIN must be 15 uppercase letters and numbers" style={inputStyle} />
              </div>
              <div>
                <label htmlFor="crm-state-code" style={labelStyle}>State code</label>
                <input id="crm-state-code" name="stateCode" value={details.stateCode} onChange={updateDetails} maxLength={2} pattern="^$|^[0-9]{2}$" title="State code must be two digits" style={inputStyle} />
              </div>
              <div>
                <label htmlFor="crm-date-of-birth" style={labelStyle}>Birthday</label>
                <input id="crm-date-of-birth" type="date" name="dateOfBirth" value={details.dateOfBirth || ''} onChange={updateDetails} style={inputStyle} />
              </div>
              <div>
                <label htmlFor="crm-address" style={labelStyle}>Address</label>
                <input id="crm-address" name="address" value={details.address} onChange={updateDetails} style={inputStyle} />
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '12px', marginTop: '20px', flexWrap: 'wrap' }}>
              {saveMessage && <span role="status" style={{ color: saveState === 'error' ? '#b91c1c' : '#166534', fontSize: '13px' }}>{saveMessage}</span>}
              <button type="submit" disabled={saveState === 'loading'} style={{ border: 0, borderRadius: '8px', padding: '10px 18px', background: '#0f172a', color: '#fff', fontWeight: 700, cursor: 'pointer' }}>
                {saveState === 'loading' ? 'Saving…' : 'Save customer details'}
              </button>
            </div>
          </form>
        )}
        {hasProfile && (
          <div style={{ marginTop: 18, background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '22px', overflowX: 'auto' }}>
            <h2 style={{ margin: '0 0 14px', color: '#0f172a', fontSize: '17px' }}>Order history</h2>
            {orders.length === 0 ? (
              <p style={{ color: '#64748b', fontSize: 13 }}>No orders found for this customer.</p>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead><tr style={{ textAlign: 'left', color: '#64748b' }}><th>Date</th><th>Invoice</th><th>Items</th><th>Total</th><th>Status</th></tr></thead>
                <tbody>{orders.map((order) => (
                  <tr key={order._id} style={{ borderTop: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '10px 6px' }}>{new Date(order.createdAt).toLocaleDateString('en-IN')}</td>
                    <td style={{ padding: '10px 6px' }}>{order.invoiceNumber || 'Pending'}</td>
                    <td style={{ padding: '10px 6px' }}>{(order.items || []).reduce((sum, item) => sum + Number(item.quantity || 0), 0)}</td>
                    <td style={{ padding: '10px 6px', fontWeight: 700 }}>{formatCurrency(order.grandTotal)}</td>
                    <td style={{ padding: '10px 6px' }}>{order.paymentStatus || order.orderStatus}</td>
                  </tr>
                ))}</tbody>
              </table>
            )}
          </div>
        )}
      </div>
    </section>
  );
};

export default CustomerCRM;
