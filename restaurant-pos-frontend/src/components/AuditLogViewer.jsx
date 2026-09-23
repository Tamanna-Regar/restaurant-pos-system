import React, { useState, useEffect, useCallback, useMemo } from 'react';
import io from 'socket.io-client';
import { api } from '../api';
import {
  playTone,
  speakText,
  isAudioMuted,
  isVoiceMuted,
  setAudioMuted,
  setVoiceMuted,
  announceAuditEvent
} from '../utils/audioAlert';

export default function AuditLogViewer() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedResource, setSelectedResource] = useState('all');
  const [selectedAction, setSelectedAction] = useState('all');
  const [dateFilter, setDateFilter] = useState('today'); // 'today', 'yesterday', 'week', 'all'
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ total: 0, pages: 1 });

  // Stats
  const [stats, setStats] = useState({
    totalToday: 0,
    loginsToday: 0,
    recipeUpdatesToday: 0,
    voidsAlertsToday: 0,
    shiftsToday: 0
  });

  // Audio settings modal & state
  const [soundMuted, setSoundMutedState] = useState(isAudioMuted());
  const [voiceMuted, setVoiceMutedState] = useState(isVoiceMuted());
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [selectedLogDetail, setSelectedLogDetail] = useState(null);

  // Calculate Date bounds based on quick selector
  const getDateBounds = useCallback((filter) => {
    const now = new Date();
    const start = new Date();
    const end = new Date();

    if (filter === 'today') {
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);
      return {
        startDate: start.toISOString().split('T')[0],
        endDate: end.toISOString().split('T')[0]
      };
    }
    if (filter === 'yesterday') {
      start.setDate(start.getDate() - 1);
      start.setHours(0, 0, 0, 0);
      end.setDate(end.getDate() - 1);
      end.setHours(23, 59, 59, 999);
      return {
        startDate: start.toISOString().split('T')[0],
        endDate: end.toISOString().split('T')[0]
      };
    }
    if (filter === 'week') {
      start.setDate(start.getDate() - 7);
      start.setHours(0, 0, 0, 0);
      return {
        startDate: start.toISOString().split('T')[0],
        endDate: end.toISOString().split('T')[0]
      };
    }
    return {};
  }, []);

  // Fetch Logs from Backend
  const fetchLogs = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const params = {
        page,
        limit: 50,
        resource: selectedResource !== 'all' ? selectedResource : undefined,
        action: selectedAction !== 'all' ? selectedAction : undefined,
        q: searchQuery.trim() || undefined
      };

      const dates = getDateBounds(dateFilter);
      if (dates.startDate) params.startDate = dates.startDate;
      if (dates.endDate) params.endDate = dates.endDate;

      const res = await api.get('/audit-logs', { params });
      if (res.data?.success) {
        setLogs(res.data.data || []);
        setPagination(res.data.pagination || { total: 0, pages: 1 });
      }
    } catch (err) {
      console.error('Failed to load audit logs:', err);
      setError('Failed to fetch activity logs. Please verify connection.');
    } finally {
      setLoading(false);
    }
  }, [page, selectedResource, selectedAction, searchQuery, dateFilter, getDateBounds]);

  // Fetch Stats from Backend
  const fetchStats = useCallback(async () => {
    try {
      const res = await api.get('/audit-logs/stats');
      if (res.data?.success) {
        setStats(res.data.data);
      }
    } catch (err) {
      console.warn('Failed to fetch audit stats:', err.message);
    }
  }, []);

  useEffect(() => {
    fetchLogs();
    fetchStats();
  }, [fetchLogs, fetchStats]);

  // Real-time socket sync
  useEffect(() => {
    const socketUrl = process.env.REACT_APP_SOCKET_URL || 'http://localhost:5000';
    const socket = io(socketUrl);

    socket.on('audit-logged', (payload) => {
      if (payload?.log) {
        setLogs((prev) => [payload.log, ...prev.slice(0, 49)]);
        setStats((prev) => ({
          ...prev,
          totalToday: (prev.totalToday || 0) + 1,
          recipeUpdatesToday: payload.log.resource === 'Recipe' ? (prev.recipeUpdatesToday || 0) + 1 : prev.recipeUpdatesToday,
          loginsToday: payload.log.action?.includes('LOGIN_SUCCESS') ? (prev.loginsToday || 0) + 1 : prev.loginsToday,
          voidsAlertsToday: (payload.log.action === 'ORDER_CANCELLED' || payload.log.action === 'ITEM_VOIDED') ? (prev.voidsAlertsToday || 0) + 1 : prev.voidsAlertsToday
        }));

        // Audio announcement if active
        announceAuditEvent(payload.log.action, {
          userName: payload.log.userName,
          dishName: payload.log.metadata?.dishName,
          orderNumber: payload.log.metadata?.orderNumber,
          itemName: payload.log.metadata?.itemName
        });
      }
    });

    return () => socket.disconnect();
  }, []);

  const handleToggleSound = () => {
    const next = !soundMuted;
    setSoundMutedState(next);
    setAudioMuted(next);
  };

  const handleToggleVoice = () => {
    const next = !voiceMuted;
    setVoiceMutedState(next);
    setVoiceMuted(next);
  };

  const getActionBadge = (action) => {
    const act = String(action || '').toUpperCase();
    if (act.includes('LOGIN_SUCCESS')) {
      return { bg: '#ecfdf5', color: '#047857', border: '#a7f3d0', icon: '🟢', label: 'Login' };
    }
    if (act.includes('LOGIN_FAILED')) {
      return { bg: '#fef2f2', color: '#b91c1c', border: '#fecaca', icon: '🔴', label: 'Auth Failed' };
    }
    if (act.includes('LOGOUT')) {
      return { bg: '#f1f5f9', color: '#475569', border: '#cbd5e1', icon: '🚪', label: 'Logout' };
    }
    if (act === 'RECIPE_UPDATE') {
      return { bg: '#fff7ed', color: '#c2410c', border: '#fed7aa', icon: '🍲', label: 'Recipe Updated' };
    }
    if (act === 'RECIPE_DELETE') {
      return { bg: '#fef2f2', color: '#b91c1c', border: '#fecaca', icon: '🗑️', label: 'Recipe Deleted' };
    }
    if (act === 'ORDER_CANCELLED') {
      return { bg: '#fef2f2', color: '#991b1b', border: '#fca5a5', icon: '🚫', label: 'Order Cancelled' };
    }
    if (act === 'ITEM_VOIDED') {
      return { bg: '#fff1f2', color: '#be123c', border: '#fecdd3', icon: '⚠️', label: 'Item Voided' };
    }
    if (act.startsWith('SHIFT_')) {
      return { bg: '#faf5ff', color: '#7e22ce', border: '#e9d5ff', icon: '💼', label: act.replace('SHIFT_', 'Shift ') };
    }
    if (act === 'CASH_IN' || act === 'CASH_OUT') {
      return { bg: '#eff6ff', color: '#1d4ed8', border: '#bfdbfe', icon: '💵', label: act.replace('_', ' ') };
    }
    return { bg: '#f8fafc', color: '#334155', border: '#e2e8f0', icon: 'ℹ️', label: act };
  };

  const formatTime = (isoString) => {
    if (!isoString) return '--';
    const date = new Date(isoString);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) +
           ' (' + date.toLocaleDateString([], { day: '2-digit', month: 'short' }) + ')';
  };

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%', overflowY: 'auto', backgroundColor: '#f8fafc', padding: '24px' }}>
      
      {/* 1. Header & Quick Controls */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <h1 style={{ fontSize: '24px', fontWeight: '800', color: '#0f172a', margin: 0 }}>
              🛡️ Audit Trail & Audio Activity Trail
            </h1>
            <span style={{ fontSize: '11px', backgroundColor: '#10b981', color: '#ffffff', padding: '3px 8px', borderRadius: '12px', fontWeight: 'bold' }}>
              LIVE SOCKET
            </span>
          </div>
          <p style={{ margin: '4px 0 0 0', color: '#64748b', fontSize: '13px' }}>
            Real-time track of who logged in, recipe modifications, cashier drawer actions, and security alerts.
          </p>
        </div>

        {/* Audio / Voice Controls Bar */}
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <button
            onClick={handleToggleSound}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 14px',
              borderRadius: '8px',
              border: '1px solid #cbd5e1',
              backgroundColor: soundMuted ? '#fef2f2' : '#ecfdf5',
              color: soundMuted ? '#b91c1c' : '#047857',
              fontWeight: '600',
              fontSize: '13px',
              cursor: 'pointer'
            }}
            title={soundMuted ? 'Audio Chimes Muted. Click to Unmute.' : 'Audio Chimes Active. Click to Mute.'}
          >
            {soundMuted ? '🔇 Sound Muted' : '🔊 Chimes ON'}
          </button>

          <button
            onClick={handleToggleVoice}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 14px',
              borderRadius: '8px',
              border: '1px solid #cbd5e1',
              backgroundColor: voiceMuted ? '#fef2f2' : '#eff6ff',
              color: voiceMuted ? '#b91c1c' : '#1d4ed8',
              fontWeight: '600',
              fontSize: '13px',
              cursor: 'pointer'
            }}
            title={voiceMuted ? 'Voice announcements Muted' : 'Voice Announcements Active'}
          >
            {voiceMuted ? '🔇 Voice OFF' : '🗣️ Voice ON'}
          </button>

          <button
            onClick={() => setShowSettingsModal(true)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 14px',
              borderRadius: '8px',
              border: '1px solid #cbd5e1',
              backgroundColor: '#ffffff',
              color: '#334155',
              fontWeight: '600',
              fontSize: '13px',
              cursor: 'pointer'
            }}
          >
            ⚙️ Test Audio
          </button>

          <button
            onClick={() => { fetchLogs(); fetchStats(); }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 14px',
              borderRadius: '8px',
              backgroundColor: '#0f172a',
              color: '#ffffff',
              border: 'none',
              fontWeight: '600',
              fontSize: '13px',
              cursor: 'pointer'
            }}
          >
            🔄 Refresh
          </button>
        </div>
      </div>

      {/* 2. Top Metric Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px', marginBottom: '20px' }}>
        <div style={{ backgroundColor: '#ffffff', padding: '16px', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
          <div style={{ fontSize: '12px', color: '#64748b', fontWeight: '600' }}>TOTAL ACTIONS TODAY</div>
          <div style={{ fontSize: '26px', fontWeight: '800', color: '#0f172a', marginTop: '6px' }}>{stats.totalToday || 0}</div>
          <div style={{ fontSize: '11px', color: '#10b981', marginTop: '4px' }}>⚡ Recorded in live log</div>
        </div>

        <div style={{ backgroundColor: '#ffffff', padding: '16px', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
          <div style={{ fontSize: '12px', color: '#64748b', fontWeight: '600' }}>STAFF LOGINS TODAY</div>
          <div style={{ fontSize: '26px', fontWeight: '800', color: '#047857', marginTop: '6px' }}>{stats.loginsToday || 0}</div>
          <div style={{ fontSize: '11px', color: '#64748b', marginTop: '4px' }}>PIN & Password logins</div>
        </div>

        <div style={{ backgroundColor: '#ffffff', padding: '16px', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
          <div style={{ fontSize: '12px', color: '#64748b', fontWeight: '600' }}>RECIPE MODIFICATIONS</div>
          <div style={{ fontSize: '26px', fontWeight: '800', color: '#ea580c', marginTop: '6px' }}>{stats.recipeUpdatesToday || 0}</div>
          <div style={{ fontSize: '11px', color: '#ea580c', marginTop: '4px' }}>Cost & Ingredient edits</div>
        </div>

        <div style={{ backgroundColor: '#ffffff', padding: '16px', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
          <div style={{ fontSize: '12px', color: '#64748b', fontWeight: '600' }}>VOIDS & ALERTS</div>
          <div style={{ fontSize: '26px', fontWeight: '800', color: '#dc2626', marginTop: '6px' }}>{stats.voidsAlertsToday || 0}</div>
          <div style={{ fontSize: '11px', color: '#dc2626', marginTop: '4px' }}>Cancelled orders / voids</div>
        </div>
      </div>

      {/* 3. Filtering Toolbar */}
      <div style={{
        backgroundColor: '#ffffff',
        padding: '16px',
        borderRadius: '12px',
        border: '1px solid #e2e8f0',
        marginBottom: '20px',
        display: 'flex',
        flexWrap: 'wrap',
        gap: '12px',
        alignItems: 'center',
        justifyContent: 'space-between'
      }}>
        {/* Search */}
        <div style={{ flex: '1 1 240px', minWidth: '220px' }}>
          <input
            type="text"
            placeholder="🔍 Search staff, dish, action, IP..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              width: '100%',
              padding: '9px 12px',
              borderRadius: '8px',
              border: '1px solid #cbd5e1',
              fontSize: '13px',
              outline: 'none',
              boxSizing: 'border-box'
            }}
          />
        </div>

        {/* Resource Filter */}
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <span style={{ fontSize: '12px', color: '#64748b', fontWeight: '600' }}>Module:</span>
          <select
            value={selectedResource}
            onChange={(e) => { setSelectedResource(e.target.value); setPage(1); }}
            style={{
              padding: '8px 12px',
              borderRadius: '8px',
              border: '1px solid #cbd5e1',
              fontSize: '13px',
              backgroundColor: '#fff',
              outline: 'none'
            }}
          >
            <option value="all">All Modules</option>
            <option value="Auth">🔐 Auth & Logins</option>
            <option value="Recipe">🍲 Recipe Builder</option>
            <option value="Order">🧾 Orders & Billing</option>
            <option value="Shift">💼 Cashier Shifts</option>
          </select>
        </div>

        {/* Date Filter */}
        <div style={{ display: 'flex', gap: '6px' }}>
          {['today', 'yesterday', 'week', 'all'].map((opt) => (
            <button
              key={opt}
              onClick={() => { setDateFilter(opt); setPage(1); }}
              style={{
                padding: '6px 12px',
                borderRadius: '6px',
                fontSize: '12px',
                fontWeight: '600',
                border: '1px solid',
                cursor: 'pointer',
                borderColor: dateFilter === opt ? '#0f172a' : '#cbd5e1',
                backgroundColor: dateFilter === opt ? '#0f172a' : '#ffffff',
                color: dateFilter === opt ? '#ffffff' : '#475569'
              }}
            >
              {opt === 'today' ? 'Today' : opt === 'yesterday' ? 'Yesterday' : opt === 'week' ? 'Last 7 Days' : 'All Time'}
            </button>
          ))}
        </div>
      </div>

      {/* 4. Logs List & Table */}
      <div style={{ backgroundColor: '#ffffff', borderRadius: '12px', border: '1px solid #e2e8f0', overflow: 'hidden', flex: 1, display: 'flex', flexDirection: 'column' }}>
        {loading ? (
          <div style={{ padding: '60px', textAlign: 'center', color: '#64748b' }}>
            <div style={{ fontSize: '24px', marginBottom: '8px' }}>⏳</div>
            Loading audit activity records...
          </div>
        ) : error ? (
          <div style={{ padding: '40px', textAlign: 'center', color: '#b91c1c' }}>
            {error}
          </div>
        ) : logs.length === 0 ? (
          <div style={{ padding: '60px', textAlign: 'center', color: '#64748b' }}>
            <div style={{ fontSize: '32px', marginBottom: '8px' }}>🔍</div>
            <div style={{ fontWeight: '700', fontSize: '16px', color: '#1e293b' }}>No activity records found</div>
            <p style={{ fontSize: '13px', margin: '4px 0 0 0' }}>Try changing the search query or date range filters.</p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto', flex: 1 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
              <thead>
                <tr style={{ backgroundColor: '#f1f5f9', borderBottom: '1px solid #e2e8f0', color: '#475569', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  <th style={{ padding: '12px 16px' }}>Timestamp</th>
                  <th style={{ padding: '12px 16px' }}>Staff User</th>
                  <th style={{ padding: '12px 16px' }}>Role</th>
                  <th style={{ padding: '12px 16px' }}>Module</th>
                  <th style={{ padding: '12px 16px' }}>Action</th>
                  <th style={{ padding: '12px 16px' }}>Details / Note</th>
                  <th style={{ padding: '12px 16px' }}>IP / Device</th>
                  <th style={{ padding: '12px 16px', textAlign: 'center' }}>Inspect</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => {
                  const badge = getActionBadge(log.action);
                  let detailsText = '--';
                  if (log.metadata) {
                    if (log.metadata.dishName) detailsText = `Dish: ${log.metadata.dishName} (${log.metadata.ingredientCount || 0} ingredients)`;
                    else if (log.metadata.orderNumber) detailsText = `Order #${log.metadata.orderNumber} (Table ${log.metadata.tableNo || '--'})`;
                    else if (log.metadata.reason) detailsText = `Reason: ${log.metadata.reason}`;
                    else if (log.metadata.closingCash !== undefined) detailsText = `Closing Cash: ₹${log.metadata.closingCash} (Expected: ₹${log.metadata.expectedCash})`;
                    else if (log.metadata.email) detailsText = `Account: ${log.metadata.email}`;
                    else detailsText = JSON.stringify(log.metadata).slice(0, 45);
                  }

                  return (
                    <tr
                      key={log._id}
                      style={{
                        borderBottom: '1px solid #f1f5f9',
                        transition: 'background-color 0.15s ease'
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f8fafc'}
                      onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                    >
                      <td style={{ padding: '12px 16px', color: '#64748b', whiteSpace: 'nowrap' }}>
                        {formatTime(log.createdAt)}
                      </td>
                      <td style={{ padding: '12px 16px', fontWeight: '600', color: '#0f172a' }}>
                        {log.userName || 'System'}
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        <span style={{
                          fontSize: '11px',
                          textTransform: 'uppercase',
                          fontWeight: '700',
                          padding: '2px 6px',
                          borderRadius: '4px',
                          backgroundColor: '#e2e8f0',
                          color: '#334155'
                        }}>
                          {log.userRole || 'Staff'}
                        </span>
                      </td>
                      <td style={{ padding: '12px 16px', color: '#475569', fontWeight: '500' }}>
                        {log.resource}
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        <span style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                          fontSize: '12px',
                          fontWeight: '600',
                          padding: '4px 8px',
                          borderRadius: '6px',
                          backgroundColor: badge.bg,
                          color: badge.color,
                          border: `1px solid ${badge.border}`
                        }}>
                          <span>{badge.icon}</span>
                          <span>{badge.label}</span>
                        </span>
                      </td>
                      <td style={{ padding: '12px 16px', color: '#334155', maxWidth: '240px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={detailsText}>
                        {detailsText}
                      </td>
                      <td style={{ padding: '12px 16px', color: '#94a3b8', fontSize: '11px' }}>
                        {log.ipAddress || '127.0.0.1'}
                      </td>
                      <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                        <button
                          onClick={() => setSelectedLogDetail(log)}
                          style={{
                            padding: '4px 8px',
                            borderRadius: '4px',
                            border: '1px solid #cbd5e1',
                            backgroundColor: '#fff',
                            fontSize: '11px',
                            cursor: 'pointer',
                            color: '#2563eb',
                            fontWeight: '600'
                          }}
                        >
                          View
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Footer */}
        {pagination.pages > 1 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 20px', borderTop: '1px solid #e2e8f0', backgroundColor: '#f8fafc' }}>
            <span style={{ fontSize: '12px', color: '#64748b' }}>
              Showing Page {pagination.page} of {pagination.pages} ({pagination.total} total logs)
            </span>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                style={{
                  padding: '6px 12px',
                  borderRadius: '6px',
                  border: '1px solid #cbd5e1',
                  backgroundColor: page <= 1 ? '#f1f5f9' : '#fff',
                  cursor: page <= 1 ? 'not-allowed' : 'pointer',
                  fontSize: '12px'
                }}
              >
                Previous
              </button>
              <button
                disabled={page >= pagination.pages}
                onClick={() => setPage((p) => Math.min(pagination.pages, p + 1))}
                style={{
                  padding: '6px 12px',
                  borderRadius: '6px',
                  border: '1px solid #cbd5e1',
                  backgroundColor: page >= pagination.pages ? '#f1f5f9' : '#fff',
                  cursor: page >= pagination.pages ? 'not-allowed' : 'pointer',
                  fontSize: '12px'
                }}
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 5. Sound & Voice Test / Settings Modal */}
      {showSettingsModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          backdropFilter: 'blur(3px)'
        }}>
          <div style={{
            backgroundColor: '#ffffff',
            borderRadius: '16px',
            width: '460px',
            maxWidth: '90%',
            padding: '24px',
            boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ margin: 0, fontSize: '18px', fontWeight: '800', color: '#0f172a' }}>
                🔊 Audio Alert & Voice Feedback Settings
              </h3>
              <button
                onClick={() => setShowSettingsModal(false)}
                style={{ border: 'none', background: 'transparent', fontSize: '18px', cursor: 'pointer', color: '#94a3b8' }}
              >
                ✕
              </button>
            </div>

            <p style={{ fontSize: '13px', color: '#64748b', marginTop: 0 }}>
              Test synthesize chimes and text-to-speech voice announcements directly in your browser.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', margin: '20px 0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px', backgroundColor: '#f8fafc', borderRadius: '8px' }}>
                <div>
                  <div style={{ fontWeight: '600', fontSize: '14px', color: '#1e293b' }}>Sound Chimes</div>
                  <div style={{ fontSize: '11px', color: '#64748b' }}>Musical bells on actions</div>
                </div>
                <button
                  onClick={handleToggleSound}
                  style={{
                    padding: '6px 12px',
                    borderRadius: '6px',
                    border: 'none',
                    fontWeight: '600',
                    fontSize: '12px',
                    cursor: 'pointer',
                    backgroundColor: soundMuted ? '#cbd5e1' : '#10b981',
                    color: '#fff'
                  }}
                >
                  {soundMuted ? 'Muted' : 'Enabled'}
                </button>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px', backgroundColor: '#f8fafc', borderRadius: '8px' }}>
                <div>
                  <div style={{ fontWeight: '600', fontSize: '14px', color: '#1e293b' }}>Voice Announcements (TTS)</div>
                  <div style={{ fontSize: '11px', color: '#64748b' }}>Speaks dish names, staff names & alerts</div>
                </div>
                <button
                  onClick={handleToggleVoice}
                  style={{
                    padding: '6px 12px',
                    borderRadius: '6px',
                    border: 'none',
                    fontWeight: '600',
                    fontSize: '12px',
                    cursor: 'pointer',
                    backgroundColor: voiceMuted ? '#cbd5e1' : '#3b82f6',
                    color: '#fff'
                  }}
                >
                  {voiceMuted ? 'Muted' : 'Enabled'}
                </button>
              </div>
            </div>

            <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: '16px', marginTop: '16px' }}>
              <div style={{ fontSize: '12px', fontWeight: '700', color: '#475569', marginBottom: '8px' }}>
                TEST AUDIO SAMPLES:
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                <button
                  onClick={() => { playTone('login'); speakText('Welcome, Admin User'); }}
                  style={{ padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1', backgroundColor: '#f0fdf4', color: '#166534', fontWeight: '600', fontSize: '12px', cursor: 'pointer' }}
                >
                  🔔 Login Chime
                </button>
                <button
                  onClick={() => { playTone('recipe'); speakText('Recipe for Paneer Butter Masala saved'); }}
                  style={{ padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1', backgroundColor: '#fff7ed', color: '#9a3412', fontWeight: '600', fontSize: '12px', cursor: 'pointer' }}
                >
                  🍲 Recipe Chime
                </button>
                <button
                  onClick={() => { playTone('shift'); speakText('Cashier shift opened with cash 5000'); }}
                  style={{ padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1', backgroundColor: '#faf5ff', color: '#6b21a8', fontWeight: '600', fontSize: '12px', cursor: 'pointer' }}
                >
                  💼 Shift Chime
                </button>
                <button
                  onClick={() => { playTone('void'); speakText('Alert: Item cancelled from order'); }}
                  style={{ padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1', backgroundColor: '#fef2f2', color: '#991b1b', fontWeight: '600', fontSize: '12px', cursor: 'pointer' }}
                >
                  ⚠️ Void Alert Tone
                </button>
              </div>
            </div>

            <div style={{ marginTop: '20px', textAlign: 'right' }}>
              <button
                onClick={() => setShowSettingsModal(false)}
                style={{ padding: '8px 16px', borderRadius: '8px', border: 'none', backgroundColor: '#0f172a', color: '#fff', fontWeight: '600', fontSize: '13px', cursor: 'pointer' }}
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 6. Inspect Payload Modal */}
      {selectedLogDetail && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          backdropFilter: 'blur(3px)'
        }}>
          <div style={{
            backgroundColor: '#ffffff',
            borderRadius: '16px',
            width: '560px',
            maxWidth: '90%',
            padding: '24px',
            boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ margin: 0, fontSize: '18px', fontWeight: '800', color: '#0f172a' }}>
                📄 Activity Log Detail
              </h3>
              <button
                onClick={() => setSelectedLogDetail(null)}
                style={{ border: 'none', background: 'transparent', fontSize: '18px', cursor: 'pointer', color: '#94a3b8' }}
              >
                ✕
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px', fontSize: '13px' }}>
              <div>
                <span style={{ color: '#64748b' }}>Action: </span>
                <strong>{selectedLogDetail.action}</strong>
              </div>
              <div>
                <span style={{ color: '#64748b' }}>Resource: </span>
                <strong>{selectedLogDetail.resource}</strong>
              </div>
              <div>
                <span style={{ color: '#64748b' }}>Staff User: </span>
                <strong>{selectedLogDetail.userName} ({selectedLogDetail.userRole || 'Staff'})</strong>
              </div>
              <div>
                <span style={{ color: '#64748b' }}>IP Address: </span>
                <strong>{selectedLogDetail.ipAddress || '127.0.0.1'}</strong>
              </div>
              <div style={{ gridColumn: 'span 2' }}>
                <span style={{ color: '#64748b' }}>Timestamp: </span>
                <strong>{new Date(selectedLogDetail.createdAt).toLocaleString()}</strong>
              </div>
            </div>

            <div style={{ fontSize: '12px', fontWeight: '700', color: '#475569', marginBottom: '6px' }}>
              METADATA PAYLOAD:
            </div>
            <pre style={{
              backgroundColor: '#0f172a',
              color: '#38bdf8',
              padding: '14px',
              borderRadius: '8px',
              fontSize: '12px',
              overflowX: 'auto',
              maxHeight: '260px',
              margin: 0
            }}>
              {JSON.stringify(selectedLogDetail.metadata || {}, null, 2)}
            </pre>

            <div style={{ marginTop: '20px', textAlign: 'right' }}>
              <button
                onClick={() => setSelectedLogDetail(null)}
                style={{ padding: '8px 16px', borderRadius: '8px', border: 'none', backgroundColor: '#0f172a', color: '#fff', fontWeight: '600', fontSize: '13px', cursor: 'pointer' }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

