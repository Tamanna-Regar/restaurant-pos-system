/**
 * Tamanna Restaurant POS - Desktop & Web Push Notification Helper
 * Triggers OS-level desktop notification banners for orders, kitchen alerts, waiter calls.
 */

export async function requestNotificationPermission() {
  if (!('Notification' in window)) {
    console.warn('Browser does not support desktop notifications');
    return false;
  }

  if (Notification.permission === 'granted') {
    return true;
  }

  if (Notification.permission !== 'denied') {
    const permission = await Notification.requestPermission();
    return permission === 'granted';
  }

  return false;
}

export function isNotificationSupported() {
  return 'Notification' in window;
}

export function getNotificationPermission() {
  if (!('Notification' in window)) return 'unsupported';
  return Notification.permission;
}

/**
 * Dispatch an OS-level notification
 * @param {string} title 
 * @param {object} options { body, icon, tag }
 */
export function showDesktopNotification(title, options = {}) {
  try {
    if (!('Notification' in window) || Notification.permission !== 'granted') {
      return null;
    }

    const defaultIcon = '/favicon.ico';
    const notification = new Notification(title, {
      icon: options.icon || defaultIcon,
      badge: '/favicon.ico',
      body: options.body || '',
      tag: options.tag || 'tamanna-pos-alert',
      renotify: true,
      silent: false,
      ...options
    });

    notification.onclick = function () {
      window.focus();
      if (options.onClick) options.onClick();
      notification.close();
    };

    // Auto-close after 6 seconds
    setTimeout(() => {
      try {
        notification.close();
      } catch (e) {}
    }, 6000);

    return notification;
  } catch (err) {
    console.warn('Could not display desktop notification:', err);
    return null;
  }
}

