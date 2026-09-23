import React, { useState } from 'react';
import { api } from '../api';
import { announceAuditEvent, playTone } from '../utils/audioAlert';

// ---------------------------------------------------------------------------
// Login Component
// ---------------------------------------------------------------------------
export function Login({ onLoginSuccess }) {
  const [mode, setMode] = useState('login');
  const [formData, setFormData] = useState({ email: '', password: '', role: 'admin' });
  const [signupData, setSignupData] = useState({ name: '', email: '', password: '', confirmPassword: '', role: 'waiter' });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState({ type: '', text: '' });

  const [pin, setPin] = useState('');

  const normalizeRole = (role) => String(role || 'admin').toLowerCase();

  const roleOptions = [
    { value: 'admin', label: 'Admin' },
    { value: 'manager', label: 'Manager' },
    { value: 'waiter', label: 'Waiter' },
    { value: 'cashier', label: 'Cashier' },
    { value: 'chef', label: 'Chef' },
    { value: 'inventory_manager', label: 'Inventory Manager' },
    { value: 'delivery', label: 'Delivery' }
  ];

  const roleImageMap = {
    admin: 'https://images.unsplash.com/photo-1547592180-85f173990554?auto=format&fit=crop&w=1200&q=85',
    manager: 'https://images.unsplash.com/photo-1515003197210-e0cd71810b5f?auto=format&fit=crop&w=1200&q=85',
    waiter: 'https://images.unsplash.com/photo-1552566626-52f8b828add9?auto=format&fit=crop&w=1200&q=85',
    chef: 'https://images.unsplash.com/photo-1577219491135-ce391730fb2c?auto=format&fit=crop&w=1200&q=85',
    inventory_manager: 'https://images.unsplash.com/photo-1498837167922-ddd27525d352?auto=format&fit=crop&w=1200&q=85',
    delivery: 'https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?auto=format&fit=crop&w=1200&q=85'
  };

  const selectedRole = normalizeRole(formData.role);
  const selectedRoleImage = roleImageMap[selectedRole] || roleImageMap.admin;

  const handleSignup = async (e) => {
    e.preventDefault();
    if (signupData.password !== signupData.confirmPassword) {
      setFeedback({ type: 'error', text: 'Passwords do not match.' });
      return;
    }
    try {
      setIsSubmitting(true);
      setFeedback({ type: '', text: '' });
      await api.post('/auth/register-public', {
        name: signupData.name,
        email: signupData.email,
        password: signupData.password,
        role: signupData.role
      });
      setFormData({ email: signupData.email.trim().toLowerCase(), password: '', role: signupData.role });
      setSignupData({ name: '', email: '', password: '', confirmPassword: '', role: 'waiter' });
      setMode('login');
      setFeedback({ type: 'success', text: 'Account created successfully. Sign in to continue.' });
    } catch (err) {
      setFeedback({ type: 'error', text: err.response?.data?.message || 'Account could not be created.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const enteredEmail = (formData.email || '').trim().toLowerCase();
    const enteredPassword = formData.password || '';

    try {
      setIsSubmitting(true);
      setFeedback({ type: '', text: '' });
      const res = await api.post('/auth/login', { email: enteredEmail, password: enteredPassword, role: selectedRole });
      localStorage.setItem('token', res.data.token);
      localStorage.setItem('refreshToken', res.data.refreshToken);
      localStorage.setItem('user', JSON.stringify(res.data.user));
      announceAuditEvent('LOGIN_SUCCESS', { userName: res.data.user?.name });
      onLoginSuccess();
    } catch (err) {
      playTone('warning');
      const message = err.response?.data?.message || 'Authentication failed.';
      setFeedback({ type: 'error', text: message });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePinLogin = async (e) => {
    if (e) e.preventDefault();
    if (!pin || pin.length < 4) {
      setFeedback({ type: 'error', text: 'Enter your 4-digit PIN.' });
      return;
    }
    try {
      setIsSubmitting(true);
      setFeedback({ type: '', text: '' });
      const res = await api.post('/auth/login-pin', { pin, role: selectedRole });
      localStorage.setItem('token', res.data.token);
      localStorage.setItem('refreshToken', res.data.refreshToken);
      localStorage.setItem('user', JSON.stringify(res.data.user));
      announceAuditEvent('LOGIN_SUCCESS', { userName: res.data.user?.name });
      onLoginSuccess();
    } catch (err) {
      setFeedback({ type: 'error', text: err.response?.data?.message || 'Invalid PIN' });
      setPin('');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="login-page" style={loginStyles.container}>
      <div className="login-page__hero" style={loginStyles.leftPanel}>
        <div style={loginStyles.imageOverlay}>
          <div style={loginStyles.heroBadge}>● LIVE RESTAURANT POS</div>
          <img
            src={selectedRoleImage}
            alt={`${selectedRole} restaurant interior`}
            style={loginStyles.foodImage}
          />
          <div style={loginStyles.heroCopy}>
            <h2 style={loginStyles.leftHeading}>Tamanna Restaurant</h2>
            <p style={loginStyles.leftSub}>One smart workspace for orders, tables and daily operations.</p>
          </div>
        </div>
      </div>

      <div className="login-page__content" style={loginStyles.rightPanel}>
        <div style={loginStyles.formCard}>
          <div style={loginStyles.eyebrow}>TAMANNA RESTAURANT · POS</div>
          <h2 style={loginStyles.title}>{mode === 'login' ? 'Welcome back' : 'Create staff account'}</h2>
          <p style={loginStyles.subtitle}>{mode === 'signup' ? 'Create a secure staff account to access the POS.' : 'Sign in to manage your restaurant operations.'}</p>

          {mode !== 'signup' && (
            <div style={{ display: 'flex', gap: '8px', marginBottom: '18px', background: '#f1f5f9', padding: '4px', borderRadius: '10px' }}>
              <button
                type="button"
                onClick={() => { setMode('login'); setFeedback({ type: '', text: '' }); }}
                style={{ flex: 1, padding: '8px 12px', border: 0, borderRadius: '8px', fontWeight: '700', fontSize: '12px', cursor: 'pointer', background: mode === 'login' ? '#fff' : 'transparent', color: mode === 'login' ? '#0f172a' : '#64748b', boxShadow: mode === 'login' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none' }}
              >
                🔑 Password Login
              </button>
              <button
                type="button"
                onClick={() => { setMode('pin'); setFeedback({ type: '', text: '' }); }}
                style={{ flex: 1, padding: '8px 12px', border: 0, borderRadius: '8px', fontWeight: '700', fontSize: '12px', cursor: 'pointer', background: mode === 'pin' ? '#fff' : 'transparent', color: mode === 'pin' ? '#0f172a' : '#64748b', boxShadow: mode === 'pin' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none' }}
              >
                ⚡ Fast PIN Login
              </button>
            </div>
          )}

          {feedback.text && <div role="alert" style={{ ...loginStyles.feedback, ...(feedback.type === 'error' ? loginStyles.feedbackError : loginStyles.feedbackSuccess) }}>{feedback.text}</div>}

          {mode === 'pin' ? (
            <form onSubmit={handlePinLogin} style={loginStyles.form}>
              <div style={loginStyles.inputGroup}>
                <label style={loginStyles.label}>Enter 4-Digit Staff PIN</label>
                <input
                  type="password"
                  maxLength={4}
                  placeholder="● ● ● ●"
                  value={pin}
                  onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                  style={{ ...loginStyles.input, textAlign: 'center', fontSize: '24px', letterSpacing: '8px', fontWeight: 'bold' }}
                  autoFocus
                />
              </div>

              {/* Touch Numpad */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', margin: '4px 0' }}>
                {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
                  <button
                    key={num}
                    type="button"
                    onClick={() => setPin((prev) => (prev.length < 4 ? prev + num : prev))}
                    style={{ padding: '12px', borderRadius: '10px', border: '1px solid #e2e8f0', background: '#f8fafc', fontSize: '18px', fontWeight: 'bold', cursor: 'pointer', color: '#1e293b' }}
                  >
                    {num}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => setPin('')}
                  style={{ padding: '12px', borderRadius: '10px', border: '1px solid #fecaca', background: '#fef2f2', fontSize: '13px', fontWeight: 'bold', cursor: 'pointer', color: '#dc2626' }}
                >
                  Clear
                </button>
                <button
                  type="button"
                  onClick={() => setPin((prev) => (prev.length < 4 ? prev + '0' : prev))}
                  style={{ padding: '12px', borderRadius: '10px', border: '1px solid #e2e8f0', background: '#f8fafc', fontSize: '18px', fontWeight: 'bold', cursor: 'pointer', color: '#1e293b' }}
                >
                  0
                </button>
                <button
                  type="button"
                  onClick={() => setPin((prev) => prev.slice(0, -1))}
                  style={{ padding: '12px', borderRadius: '10px', border: '1px solid #e2e8f0', background: '#f8fafc', fontSize: '16px', fontWeight: 'bold', cursor: 'pointer', color: '#64748b' }}
                >
                  ⌫
                </button>
              </div>

              <div style={loginStyles.inputGroup}>
                <label style={loginStyles.label}>Login as</label>
                <div style={loginStyles.roleRow}>
                  {roleOptions.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setFormData({ ...formData, role: option.value })}
                      style={{
                        ...loginStyles.roleButton,
                        ...(formData.role === option.value ? loginStyles.roleButtonActive : {})
                      }}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>

              <button type="submit" disabled={isSubmitting || pin.length < 4} style={{ ...loginStyles.button, opacity: (isSubmitting || pin.length < 4) ? 0.65 : 1 }}>
                {isSubmitting ? 'Verifying PIN...' : '⚡ Quick Sign In'}
              </button>
            </form>
          ) : mode === 'login' ? <form onSubmit={handleSubmit} style={loginStyles.form}>
            <div style={loginStyles.inputGroup}>
              <label style={loginStyles.label}>Email Address</label>
              <input
                type="email"
                placeholder="admin@restaurant.com"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                style={loginStyles.input}
                required
              />
            </div>

            <div style={loginStyles.inputGroup}>
              <label style={loginStyles.label}>Password</label>
              <input
                type="password"
                placeholder="••••••••"
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                style={loginStyles.input}
                required
              />
            </div>

            <div style={loginStyles.inputGroup}>
              <label style={loginStyles.label}>Login as</label>
              <div style={loginStyles.roleRow}>
                {roleOptions.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setFormData({ ...formData, role: option.value })}
                    style={{
                      ...loginStyles.roleButton,
                      ...(formData.role === option.value ? loginStyles.roleButtonActive : {})
                    }}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            <button type="submit" disabled={isSubmitting} style={{ ...loginStyles.button, opacity: isSubmitting ? 0.65 : 1 }}>
              {isSubmitting ? 'Signing in...' : 'Open Shift & Login'}
            </button>
          </form> : <form onSubmit={handleSignup} style={loginStyles.form}>
            <div style={loginStyles.inputGroup}><label style={loginStyles.label}>Full name</label><input style={loginStyles.input} value={signupData.name} onChange={(e) => setSignupData({ ...signupData, name: e.target.value })} placeholder="Your name" required minLength="2" /></div>
            <div style={loginStyles.inputGroup}><label style={loginStyles.label}>Email address</label><input type="email" style={loginStyles.input} value={signupData.email} onChange={(e) => setSignupData({ ...signupData, email: e.target.value })} placeholder="you@restaurant.com" required /></div>
            <div style={loginStyles.inputGroup}><label style={loginStyles.label}>Staff role</label><select style={loginStyles.input} value={signupData.role} onChange={(e) => setSignupData({ ...signupData, role: e.target.value })}>{roleOptions.filter(({ value }) => value !== 'admin' && value !== 'manager').map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></div>
            <div style={loginStyles.inputGroup}><label style={loginStyles.label}>Password</label><input type="password" style={loginStyles.input} value={signupData.password} onChange={(e) => setSignupData({ ...signupData, password: e.target.value })} placeholder="At least 6 characters" required minLength="6" /></div>
            <div style={loginStyles.inputGroup}><label style={loginStyles.label}>Confirm password</label><input type="password" style={loginStyles.input} value={signupData.confirmPassword} onChange={(e) => setSignupData({ ...signupData, confirmPassword: e.target.value })} placeholder="Re-enter password" required minLength="6" /></div>
            <button type="submit" disabled={isSubmitting} style={{ ...loginStyles.button, ...loginStyles.signupButton, opacity: isSubmitting ? 0.65 : 1 }}>{isSubmitting ? 'Creating account...' : 'Create account'}</button>
          </form>}
          <p style={loginStyles.toggleText}>{mode === 'login' ? 'Need a staff account?' : 'Already have an account?'} <button type="button" onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setFeedback({ type: '', text: '' }); }} style={loginStyles.toggleLink}>{mode === 'login' ? 'Sign up' : 'Sign in'}</button></p>
          {mode === 'signup' && <p style={loginStyles.securityNote}>Admin and manager accounts can only be created by an authorized administrator.</p>}
        </div>
      </div>
    </div>
  );
}

const loginStyles = {
  container: { display: 'flex', height: '100vh', width: '100vw', fontFamily: 'Inter, system-ui, sans-serif', background: '#eef1f3', overflow: 'hidden' },
  leftPanel: { flex: 1.08, background: 'linear-gradient(145deg, #20272d 0%, #30383d 55%, #161b20 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', padding: '42px clamp(24px, 5vw, 72px)', position: 'relative' },
  imageOverlay: { width: '100%', maxWidth: '560px', color: '#fff', display: 'flex', flexDirection: 'column', alignItems: 'stretch', justifyContent: 'center' },
  heroBadge: { alignSelf: 'flex-start', background: 'rgba(57, 211, 196, 0.14)', border: '1px solid rgba(57, 211, 196, 0.42)', color: '#63e2d2', borderRadius: '999px', padding: '7px 12px', fontSize: '10px', fontWeight: '800', letterSpacing: '0.8px', marginBottom: '16px' },
  foodImage: { width: '100%', maxWidth: '520px', height: '330px', borderRadius: '28px 28px 72px 8px', objectFit: 'cover', boxShadow: '0 24px 54px rgba(0,0,0,0.38)', marginBottom: '22px', border: '1px solid rgba(255,255,255,0.2)', backgroundColor: '#fff' },
  heroCopy: { paddingLeft: '6px' },
  leftHeading: { fontSize: 'clamp(28px, 3vw, 40px)', fontWeight: '850', margin: '0 0 8px', color: '#fff', letterSpacing: '-0.8px', lineHeight: 1.12, wordBreak: 'break-word' },
  leftSub: { fontSize: '14px', color: '#b9c5ca', fontWeight: '500', margin: 0, lineHeight: 1.6, maxWidth: '390px', wordBreak: 'break-word' },
  rightPanel: { flex: 0.92, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#f4f6f7', padding: '24px clamp(18px, 5vw, 72px)' },
  formCard: { width: '100%', maxWidth: '430px', padding: '42px 38px 30px', borderRadius: '24px', backgroundColor: '#fff', boxShadow: '0 18px 45px rgba(30, 41, 59, 0.12)', border: '1px solid #e5e9eb' },
  title: { fontSize: '30px', fontWeight: '850', color: '#1f2933', marginBottom: '7px', letterSpacing: '-0.5px', wordBreak: 'break-word' },
  eyebrow: { fontSize: '10px', letterSpacing: '1.6px', fontWeight: '850', color: '#18a99b', marginBottom: '14px' },
  subtitle: { fontSize: '13px', color: '#7b8790', marginBottom: '26px', lineHeight: 1.5, wordBreak: 'break-word' },
  form: { display: 'flex', flexDirection: 'column', gap: '16px' },
  inputGroup: { display: 'flex', flexDirection: 'column', gap: '6px' },
  label: { fontSize: '12px', fontWeight: '700', color: '#475569', letterSpacing: '0.2px' },
  input: { padding: '13px 14px', borderRadius: '9px', border: '1px solid #d9e0e3', fontSize: '14px', outline: 'none', backgroundColor: '#fbfcfc', boxSizing: 'border-box', width: '100%', color: '#1f2933' },
  roleRow: { display: 'flex', gap: '8px', marginTop: '4px', flexWrap: 'wrap' },
  roleButton: { flex: '1 1 110px', padding: '10px 12px', borderRadius: '9px', border: '1px solid #d9e0e3', backgroundColor: '#fbfcfc', color: '#52616b', cursor: 'pointer', fontWeight: '700', fontSize: '12px', transition: 'all 0.2s ease' },
  roleButtonActive: { backgroundColor: '#e6faf7', borderColor: '#39c7b8', color: '#087f76', boxShadow: '0 0 0 1px rgba(57,199,184,0.15)' },
  button: { marginTop: '8px', padding: '14px', borderRadius: '9px', border: 'none', background: 'linear-gradient(135deg, #2bc9b9 0%, #0fa99b 100%)', color: '#fff', fontSize: '14px', fontWeight: '800', cursor: 'pointer', boxShadow: '0 10px 18px rgba(15,169,155,0.24)' },
  signupButton: { background: 'linear-gradient(135deg, #fa3b78 0%, #e8175b 100%)', boxShadow: '0 10px 18px rgba(232,23,91,0.22)' },
  toggleText: { marginTop: '20px', textAlign: 'center', fontSize: '13px', color: '#64748b', lineHeight: 1.5, wordBreak: 'break-word' },
  toggleLink: { color: '#f22968', fontWeight: '800', cursor: 'pointer', marginLeft: '4px', border: 0, background: 'transparent', padding: 0 },
  feedback: { padding: '10px 12px', borderRadius: '10px', fontSize: '12px', lineHeight: 1.4, marginBottom: '2px' },
  feedbackError: { background: '#fef2f2', color: '#b91c1c', border: '1px solid #fecaca' },
  feedbackSuccess: { background: '#ecfdf5', color: '#047857', border: '1px solid #a7f3d0' },
  securityNote: { margin: '10px 0 0', textAlign: 'center', color: '#94a3b8', fontSize: '11px', lineHeight: 1.5 }
};