import React, { useState } from 'react';
import { api } from '../api';

const Feedback = () => {
  const orderId = new URLSearchParams(window.location.search).get('order') || '';
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');
  const [status, setStatus] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    setSaving(true);
    try {
      await api.post('/feedback', { orderId, rating, comment });
      setStatus('Thank you! Your feedback has been saved.');
      setComment('');
    } catch (error) {
      setStatus(error.response?.data?.message || 'Feedback submit nahi ho saka.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <main style={{ minHeight: '100vh', background: '#fff7ed', padding: 24, display: 'grid', placeItems: 'center' }}>
      <form onSubmit={submit} style={{ width: '100%', maxWidth: 440, background: '#fff', padding: 24, borderRadius: 16, boxShadow: '0 10px 30px rgba(0,0,0,.08)' }}>
        <h1 style={{ marginTop: 0, color: '#0f172a' }}>How was your Tamanna Restaurant visit?</h1>
        <p style={{ color: '#64748b', fontSize: 13 }}>Your feedback helps us improve our food and service.</p>
        <label style={{ display: 'block', fontWeight: 700, marginBottom: 8 }}>Rating</label>
        <div style={{ display: 'flex', gap: 8, marginBottom: 18 }}>
          {[1, 2, 3, 4, 5].map((value) => (
            <button key={value} type="button" onClick={() => setRating(value)} style={{ border: 0, background: 'transparent', fontSize: 30, cursor: 'pointer', opacity: value <= rating ? 1 : .3 }}>★</button>
          ))}
        </div>
        <textarea value={comment} onChange={(event) => setComment(event.target.value)} placeholder="Tell us about your experience (optional)" maxLength={1000} style={{ width: '100%', minHeight: 110, boxSizing: 'border-box', padding: 10, border: '1px solid #cbd5e1', borderRadius: 8 }} />
        <button type="submit" disabled={saving || !orderId} style={{ width: '100%', marginTop: 14, padding: 12, border: 0, borderRadius: 8, background: '#ea4615', color: '#fff', fontWeight: 700 }}>{saving ? 'Saving…' : 'Submit feedback'}</button>
        {status && <p role="status" style={{ color: '#166534', fontSize: 13 }}>{status}</p>}
        {!orderId && <p style={{ color: '#b91c1c', fontSize: 13 }}>Invalid feedback link.</p>}
      </form>
    </main>
  );
};

export default Feedback;
