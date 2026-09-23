/**
 * Tamanna Restaurant POS - Offline Mode & IndexedDB Sync Queue
 * Provides local caching of menu/tables and queues orders during WiFi/network outages.
 */

const DB_NAME = 'tamanna_pos_offline_db';
const DB_VERSION = 1;
const STORE_ORDERS = 'offline_orders';
const STORE_CATALOG = 'cached_catalog';

function openDatabase() {
  return new Promise((resolve, reject) => {
    if (!window.indexedDB) {
      console.warn('IndexedDB not supported on this browser');
      return resolve(null);
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_ORDERS)) {
        db.createObjectStore(STORE_ORDERS, { keyPath: 'clientOrderId' });
      }
      if (!db.objectStoreNames.contains(STORE_CATALOG)) {
        db.createObjectStore(STORE_CATALOG, { keyPath: 'key' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = (err) => reject(err);
  });
}

/**
 * Cache menu items or tables locally
 */
export async function cacheCatalogData(key, data) {
  try {
    const db = await openDatabase();
    if (!db) return;
    const tx = db.transaction(STORE_CATALOG, 'readwrite');
    const store = tx.objectStore(STORE_CATALOG);
    store.put({ key, data, updatedAt: new Date().toISOString() });
    return new Promise((res) => {
      tx.oncomplete = () => res(true);
      tx.onerror = () => res(false);
    });
  } catch (err) {
    console.error('Error caching catalog data:', err);
  }
}

/**
 * Retrieve cached catalog data when offline
 */
export async function getCachedCatalogData(key) {
  try {
    const db = await openDatabase();
    if (!db) return null;
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_CATALOG, 'readonly');
      const store = tx.objectStore(STORE_CATALOG);
      const req = store.get(key);
      req.onsuccess = () => resolve(req.result ? req.result.data : null);
      req.onerror = () => resolve(null);
    });
  } catch (err) {
    console.error('Error retrieving cached catalog data:', err);
    return null;
  }
}

/**
 * Queue an order when network is down
 */
export async function queueOfflineOrder(orderPayload) {
  try {
    const db = await openDatabase();
    const clientOrderId = 'OFFLINE_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
    const offlineRecord = {
      clientOrderId,
      payload: {
        ...orderPayload,
        isOfflineCreated: true,
        offlineCreatedAt: new Date().toISOString()
      },
      createdAt: new Date().toISOString(),
      syncStatus: 'pending'
    };

    if (db) {
      const tx = db.transaction(STORE_ORDERS, 'readwrite');
      const store = tx.objectStore(STORE_ORDERS);
      store.put(offlineRecord);
      await new Promise((res) => {
        tx.oncomplete = () => res(true);
        tx.onerror = () => res(false);
      });
    } else {
      // Fallback to localStorage if IndexedDB is blocked
      const list = JSON.parse(localStorage.getItem('tamanna_offline_orders') || '[]');
      list.push(offlineRecord);
      localStorage.setItem('tamanna_offline_orders', JSON.stringify(list));
    }

    return { success: true, clientOrderId, isOffline: true };
  } catch (err) {
    console.error('Failed to queue offline order:', err);
    return { success: false, error: err.message };
  }
}

/**
 * Get all pending offline orders
 */
export async function getPendingOfflineOrders() {
  try {
    const db = await openDatabase();
    if (!db) {
      return JSON.parse(localStorage.getItem('tamanna_offline_orders') || '[]');
    }
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_ORDERS, 'readonly');
      const store = tx.objectStore(STORE_ORDERS);
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => resolve([]);
    });
  } catch (err) {
    return [];
  }
}

/**
 * Delete a synced order from IndexedDB
 */
export async function removeOfflineOrder(clientOrderId) {
  try {
    const db = await openDatabase();
    if (db) {
      const tx = db.transaction(STORE_ORDERS, 'readwrite');
      const store = tx.objectStore(STORE_ORDERS);
      store.delete(clientOrderId);
    }
    const list = JSON.parse(localStorage.getItem('tamanna_offline_orders') || '[]');
    const filtered = list.filter((item) => item.clientOrderId !== clientOrderId);
    localStorage.setItem('tamanna_offline_orders', JSON.stringify(filtered));
  } catch (err) {
    console.error('Error removing synced offline order:', err);
  }
}

/**
 * Synchronize all pending offline orders with the backend server
 */
export async function syncOfflineOrders(apiBaseUrl, token) {
  const pending = await getPendingOfflineOrders();
  if (!pending || pending.length === 0) {
    return { count: 0, synced: 0, failed: 0 };
  }

  let synced = 0;
  let failed = 0;
  const baseUrl = apiBaseUrl || (process.env.REACT_APP_API_URL || 'http://localhost:5000/api');

  for (const item of pending) {
    try {
      const res = await fetch(`${baseUrl}/orders`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify(item.payload)
      });

      if (res.ok) {
        await removeOfflineOrder(item.clientOrderId);
        synced++;
      } else {
        failed++;
      }
    } catch (e) {
      console.warn('Network sync attempt failed for order', item.clientOrderId, e);
      failed++;
    }
  }

  return { count: pending.length, synced, failed };
}

