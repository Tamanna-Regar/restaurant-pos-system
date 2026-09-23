import React, { useState, useEffect } from 'react';
import { getPendingOfflineOrders, syncOfflineOrders } from '../utils/offlineQueue';

export default function OfflineStatusBanner({ token, apiUrl }) {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [pendingCount, setPendingCount] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState('');

  const refreshPending = async () => {
    try {
      const pending = await getPendingOfflineOrders();
      setPendingCount(pending.length);
    } catch (e) {
      console.warn('Failed to check offline orders:', e);
    }
  };

  const handleSync = async () => {
    if (syncing || pendingCount === 0) return;
    setSyncing(true);
    setSyncMessage('Syncing offline orders with server...');
    try {
      const result = await syncOfflineOrders(apiUrl, token);
      if (result.synced > 0) {
        setSyncMessage(`Synced ${result.synced} order(s) successfully!`);
      } else if (result.failed > 0) {
        setSyncMessage(`Failed to sync ${result.failed} order(s). Will retry.`);
      }
      await refreshPending();
      setTimeout(() => setSyncMessage(''), 4000);
    } catch (err) {
      setSyncMessage('Sync error: ' + err.message);
      setTimeout(() => setSyncMessage(''), 4000);
    } finally {
      setSyncing(false);
    }
  };

  useEffect(() => {
    refreshPending();

    const handleOnlineStatus = () => {
      setIsOnline(true);
      // Auto-sync when reconnecting
      setTimeout(() => {
        handleSync();
      }, 1000);
    };

    const handleOfflineStatus = () => {
      setIsOnline(false);
    };

    window.addEventListener('online', handleOnlineStatus);
    window.addEventListener('offline', handleOfflineStatus);

    const interval = setInterval(refreshPending, 10000);

    return () => {
      window.removeEventListener('online', handleOnlineStatus);
      window.removeEventListener('offline', handleOfflineStatus);
      clearInterval(interval);
    };
  }, [token, apiUrl]);

  if (isOnline && pendingCount === 0 && !syncMessage) {
    return null;
  }

  return (
    <div
      className={`w-full px-4 py-2 text-sm font-medium flex items-center justify-between shadow-md transition-colors z-50 ${
        !isOnline
          ? 'bg-amber-600 text-white'
          : pendingCount > 0
          ? 'bg-blue-600 text-white'
          : 'bg-emerald-600 text-white'
      }`}
    >
      <div className="flex items-center space-x-2">
        {!isOnline ? (
          <>
            <span className="animate-pulse text-lg">📡⚠️</span>
            <span>
              <strong>Offline Mode Active:</strong> Internet / WiFi is disconnected. You can continue taking orders; they are securely saved locally.
            </span>
          </>
        ) : (
          <>
            <span className="text-lg">🌐</span>
            <span>
              Connected to Server. {pendingCount > 0 && `${pendingCount} offline orders waiting to sync.`} {syncMessage}
            </span>
          </>
        )}
      </div>

      <div className="flex items-center space-x-3">
        {pendingCount > 0 && (
          <button
            onClick={handleSync}
            disabled={syncing || !isOnline}
            className={`px-3 py-1 text-xs font-semibold rounded shadow transition bg-white ${
              !isOnline ? 'text-gray-400 opacity-60 cursor-not-allowed' : 'text-blue-700 hover:bg-gray-100 active:scale-95'
            }`}
          >
            {syncing ? '🔄 Syncing...' : `🚀 Sync Now (${pendingCount})`}
          </button>
        )}
      </div>
    </div>
  );
}

