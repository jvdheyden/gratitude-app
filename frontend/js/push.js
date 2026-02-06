/**
 * Push notification module - handles subscription and communication with backend
 */

// Backend API URL
const API_URL = 'https://gratitude-worker.jonas-vdheyden.workers.dev';

/**
 * Check if push notifications are supported
 * @returns {boolean}
 */
function isPushSupported() {
  return 'serviceWorker' in navigator &&
         'PushManager' in window &&
         'Notification' in window;
}

/**
 * Get current notification permission status
 * @returns {string} 'granted', 'denied', or 'default'
 */
function getNotificationPermission() {
  return Notification.permission;
}

/**
 * Request notification permission
 * @returns {Promise<string>} Permission status
 */
async function requestNotificationPermission() {
  const permission = await Notification.requestPermission();
  return permission;
}

/**
 * Get the VAPID public key from the backend
 * @returns {Promise<string>}
 */
async function getVapidPublicKey() {
  try {
    const response = await fetch(`${API_URL}/api/vapid-public-key`);
    const data = await response.json();
    return data.publicKey;
  } catch (error) {
    console.error('Failed to get VAPID public key:', error);
    throw error;
  }
}

/**
 * Convert a base64 string to Uint8Array (for VAPID key)
 * @param {string} base64String
 * @returns {Uint8Array}
 */
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding)
    .replace(/-/g, '+')
    .replace(/_/g, '/');

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

/**
 * Subscribe to push notifications
 * @returns {Promise<PushSubscription>}
 */
async function subscribeToPush() {
  const registration = await navigator.serviceWorker.ready;

  // Check for existing subscription
  let subscription = await registration.pushManager.getSubscription();

  if (subscription) {
    console.log('Already subscribed to push');
    return subscription;
  }

  // Get VAPID key from backend
  const vapidPublicKey = await getVapidPublicKey();
  const convertedKey = urlBase64ToUint8Array(vapidPublicKey);

  // Subscribe
  subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: convertedKey
  });

  console.log('Subscribed to push:', subscription);

  // Send subscription to backend
  await sendSubscriptionToBackend(subscription);

  return subscription;
}

/**
 * Send push subscription to backend for storage
 * @param {PushSubscription} subscription
 */
async function sendSubscriptionToBackend(subscription) {
  const userId = window.Storage.getUserId();

  const response = await fetch(`${API_URL}/api/subscribe`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      userId,
      subscription: subscription.toJSON()
    })
  });

  if (!response.ok) {
    throw new Error('Failed to save subscription to backend');
  }

  console.log('Subscription saved to backend');
}

/**
 * Unsubscribe from push notifications
 * @returns {Promise<boolean>}
 */
async function unsubscribeFromPush() {
  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();

  if (subscription) {
    await subscription.unsubscribe();
    console.log('Unsubscribed from push');
    return true;
  }

  return false;
}

/**
 * Save settings to backend (triggers schedule generation)
 * @param {Object} settings
 */
async function saveSettingsToBackend(settings) {
  const userId = window.Storage.getUserId();

  const response = await fetch(`${API_URL}/api/settings`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      userId,
      settings: {
        ...settings,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
      }
    })
  });

  if (!response.ok) {
    throw new Error('Failed to save settings to backend');
  }

  console.log('Settings saved to backend');
}

/**
 * Get settings from backend
 * @returns {Promise<Object|null>}
 */
async function getSettingsFromBackend() {
  const userId = window.Storage.getUserId();

  try {
    const response = await fetch(`${API_URL}/api/settings/${userId}`);
    const data = await response.json();
    return data.settings;
  } catch (error) {
    console.error('Failed to get settings from backend:', error);
    return null;
  }
}

/**
 * Initialize push notifications
 * - Registers service worker
 * - Sets up message listener
 */
async function initializePush() {
  if (!isPushSupported()) {
    console.log('Push notifications not supported');
    return false;
  }

  try {
    // Register service worker
    const registration = await navigator.serviceWorker.register('/sw.js');
    console.log('Service Worker registered:', registration);

    // Listen for messages from service worker
    navigator.serviceWorker.addEventListener('message', (event) => {
      console.log('Message from SW:', event.data);
      if (event.data && event.data.action === 'open-entry') {
        // Trigger entry modal open
        window.dispatchEvent(new CustomEvent('open-entry-modal'));
      }
    });

    return true;
  } catch (error) {
    console.error('Failed to initialize push:', error);
    return false;
  }
}

// Export functions
window.Push = {
  isPushSupported,
  getNotificationPermission,
  requestNotificationPermission,
  subscribeToPush,
  unsubscribeFromPush,
  saveSettingsToBackend,
  getSettingsFromBackend,
  initializePush,
  API_URL
};
