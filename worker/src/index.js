/**
 * Gratitude App - Cloudflare Worker
 *
 * Handles:
 * - Push subscription storage
 * - User settings storage
 * - Scheduled push notification sending (via cron)
 */

import { generateRandomTimes, getDateInTimezone, toUtcDateTimeParts } from './scheduler.js';

// CORS headers for frontend requests
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

/**
 * Main entry point - handles HTTP requests and cron triggers
 */
export default {
  async fetch(request, env, ctx) {
    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    const url = new URL(request.url);
    const path = url.pathname;

    try {
      // Route requests
      if (path === '/api/subscribe' && request.method === 'POST') {
        return await handleSubscribe(request, env);
      }

      if (path === '/api/settings' && request.method === 'POST') {
        return await handleSaveSettings(request, env);
      }

      if (path.startsWith('/api/settings/') && request.method === 'GET') {
        const userId = path.split('/').pop();
        return await handleGetSettings(userId, env);
      }

      if (path === '/api/vapid-public-key' && request.method === 'GET') {
        return jsonResponse({ publicKey: env.VAPID_PUBLIC_KEY });
      }

      // Health check
      if (path === '/api/health') {
        return jsonResponse({ status: 'ok', timestamp: new Date().toISOString() });
      }

      // Test push - manually trigger a push notification
      if (path === '/api/test-push' && request.method === 'POST') {
        return await handleTestPush(request, env);
      }

      return jsonResponse({ error: 'Not found' }, 404);
    } catch (error) {
      console.error('Request error:', error);
      return jsonResponse({ error: 'Internal server error' }, 500);
    }
  },

  /**
   * Cron trigger - runs every minute to send scheduled push notifications
   */
  async scheduled(event, env, ctx) {
    console.log('Cron triggered at:', new Date().toISOString(), 'cron:', event.cron);

    if (event.cron === '0 * * * *') {
      await refreshSchedules(env);
      return;
    }

    await processMinuteBucket(env);
  }
};

/**
 * Handle push subscription storage
 */
async function handleSubscribe(request, env) {
  const { userId, subscription } = await request.json();

  if (!userId || !subscription) {
    return jsonResponse({ error: 'Missing userId or subscription' }, 400);
  }

  // Store subscription in KV
  await env.GRATITUDE_KV.put(
    `user:${userId}:subscription`,
    JSON.stringify(subscription)
  );

  console.log(`Stored subscription for user: ${userId}`);
  return jsonResponse({ success: true });
}

/**
 * Handle saving user settings and generating schedule
 */
async function handleSaveSettings(request, env) {
  const { userId, settings } = await request.json();

  if (!userId || !settings) {
    return jsonResponse({ error: 'Missing userId or settings' }, 400);
  }

  const { enabled, remindersPerDay, startTime, endTime, timezone } = settings;

  // Validate settings
  if (enabled) {
    if (!remindersPerDay || remindersPerDay < 1 || remindersPerDay > 10) {
      return jsonResponse({ error: 'remindersPerDay must be between 1 and 10' }, 400);
    }
    if (!startTime || !endTime) {
      return jsonResponse({ error: 'startTime and endTime are required' }, 400);
    }
    if (!timezone) {
      return jsonResponse({ error: 'timezone is required' }, 400);
    }
  }

  // Store settings in KV
  await env.GRATITUDE_KV.put(
    `user:${userId}:settings`,
    JSON.stringify(settings)
  );

  // Remove any existing buckets for this user before regenerating
  const existingScheduleJson = await env.GRATITUDE_KV.get(`schedule:${userId}`);
  if (existingScheduleJson) {
    try {
      const existingSchedule = JSON.parse(existingScheduleJson);
      if (Array.isArray(existingSchedule.utcTimes)) {
        await removeUserFromBuckets(userId, existingSchedule.utcTimes, env);
      }
    } catch (error) {
      console.warn('Failed to parse existing schedule for cleanup:', error);
    }
  }

  if (!enabled) {
    await env.GRATITUDE_KV.delete(`schedule:${userId}`);
    return jsonResponse({ success: true, enabled: false });
  }

  const schedule = await buildScheduleForUser(userId, settings, env);
  console.log(`Generated schedule for user ${userId} on ${schedule.date}:`, schedule.times);

  return jsonResponse({ success: true, enabled: true, scheduleDate: schedule.date });
}

/**
 * Handle test push - manually trigger a push notification for testing
 */
async function handleTestPush(request, env) {
  const { userId } = await request.json();

  if (!userId) {
    return jsonResponse({ error: 'Missing userId' }, 400);
  }

  // Get user's subscription
  const subscriptionJson = await env.GRATITUDE_KV.get(`user:${userId}:subscription`);
  if (!subscriptionJson) {
    return jsonResponse({ error: 'No subscription found for user' }, 404);
  }

  const subscription = JSON.parse(subscriptionJson);

  try {
    await sendPush(subscription, env);
    return jsonResponse({ success: true, message: 'Test push sent' });
  } catch (error) {
    return jsonResponse({ error: 'Failed to send push', details: error.message }, 500);
  }
}

/**
 * Handle getting user settings
 */
async function handleGetSettings(userId, env) {
  if (!userId) {
    return jsonResponse({ error: 'Missing userId' }, 400);
  }

  const settings = await env.GRATITUDE_KV.get(`user:${userId}:settings`);

  if (!settings) {
    return jsonResponse({ settings: null });
  }

  return jsonResponse({ settings: JSON.parse(settings) });
}

const BUCKET_TTL_SECONDS = 60 * 60 * 48;

/**
 * Process scheduled push notifications for the current UTC minute
 */
async function processMinuteBucket(env) {
  const { date: utcDate, time: utcTime } = getCurrentUtcParts();
  const bucket = bucketKey(utcDate, utcTime);

  const bucketJson = await env.GRATITUDE_KV.get(bucket);
  if (!bucketJson) return;

  let userIds;
  try {
    userIds = JSON.parse(bucketJson);
  } catch (error) {
    console.warn('Invalid bucket payload:', bucket, error);
    return;
  }

  if (!Array.isArray(userIds) || userIds.length === 0) return;

  const utcKey = `${utcDate}T${utcTime}`;
  for (const userId of userIds) {
    await processUserForUtcTime(userId, utcKey, env);
  }
}

/**
 * Process a single user for a specific UTC minute
 */
async function processUserForUtcTime(userId, utcKey, env) {
  const scheduleJson = await env.GRATITUDE_KV.get(`schedule:${userId}`);
  if (!scheduleJson) return;

  let schedule;
  try {
    schedule = JSON.parse(scheduleJson);
  } catch (error) {
    console.warn('Invalid schedule payload for user:', userId, error);
    return;
  }

  if (!Array.isArray(schedule.utcTimes) || !schedule.utcTimes.includes(utcKey)) {
    return;
  }

  const sentUtc = Array.isArray(schedule.sentUtc) ? schedule.sentUtc : [];
  if (sentUtc.includes(utcKey)) return;

  if (!schedule.timezone) return;
  const currentDate = getDateInTimezone(schedule.timezone);
  if (schedule.date !== currentDate) return;

  const subscriptionJson = await env.GRATITUDE_KV.get(`user:${userId}:subscription`);
  if (!subscriptionJson) {
    console.log(`No subscription found for user ${userId}`);
    return;
  }

  const subscription = JSON.parse(subscriptionJson);

  await sendPush(subscription, env);

  sentUtc.push(utcKey);
  schedule.sentUtc = sentUtc;
  await env.GRATITUDE_KV.put(`schedule:${userId}`, JSON.stringify(schedule));

  console.log(`Push sent to user ${userId} at ${utcKey}`);
}

/**
 * Hourly refresh: ensure schedules exist for the user's current local day
 */
async function refreshSchedules(env) {
  let cursor;
  do {
    const listResult = await env.GRATITUDE_KV.list({ prefix: 'schedule:', cursor });

    for (const key of listResult.keys) {
      const parts = key.name.split(':');

      // Legacy format: schedule:{date}:{userId}
      if (parts.length === 3) {
        const userId = parts[2];
        const settings = await getSettingsForUser(userId, env);
        if (settings && settings.enabled) {
          await buildScheduleForUser(userId, settings, env);
        }
        await env.GRATITUDE_KV.delete(key.name);
        continue;
      }

      if (parts.length !== 2) continue;

      const userId = parts[1];
      const scheduleJson = await env.GRATITUDE_KV.get(key.name);
      if (!scheduleJson) continue;

      let schedule;
      try {
        schedule = JSON.parse(scheduleJson);
      } catch (error) {
        console.warn('Invalid schedule payload for user:', userId, error);
        continue;
      }

      if (!schedule.timezone) continue;

      const currentDate = getDateInTimezone(schedule.timezone);
      if (schedule.date === currentDate) continue;

      const settings = settingsFromSchedule(schedule) || await getSettingsForUser(userId, env);
      if (!settings || !settings.enabled) {
        await env.GRATITUDE_KV.delete(key.name);
        continue;
      }

      await buildScheduleForUser(userId, settings, env, schedule);
    }

    cursor = listResult.cursor;
    if (listResult.list_complete) break;
  } while (cursor);
}

/**
 * Build a schedule for a user and create minute buckets
 */
async function buildScheduleForUser(userId, settings, env, previousSchedule = null) {
  const { remindersPerDay, startTime, endTime, timezone } = settings;
  const reminders = parseInt(remindersPerDay, 10);
  const date = getDateInTimezone(timezone);
  const times = generateRandomTimes(reminders, startTime, endTime, date);

  const utcTimes = times.map((time) => {
    const utc = toUtcDateTimeParts(date, time, timezone);
    return `${utc.date}T${utc.time}`;
  });

  if (previousSchedule && Array.isArray(previousSchedule.utcTimes)) {
    await removeUserFromBuckets(userId, previousSchedule.utcTimes, env);
  }

  const schedule = {
    date,
    timezone,
    remindersPerDay: reminders,
    startTime,
    endTime,
    times,
    utcTimes,
    sentUtc: []
  };

  await env.GRATITUDE_KV.put(`schedule:${userId}`, JSON.stringify(schedule));
  await addUserToBuckets(userId, utcTimes, env);

  return schedule;
}

async function addUserToBuckets(userId, utcTimes, env) {
  for (const utcKey of utcTimes) {
    const [date, time] = utcKey.split('T');
    if (!date || !time) continue;
    await addUserToBucket(userId, date, time, env);
  }
}

async function removeUserFromBuckets(userId, utcTimes, env) {
  for (const utcKey of utcTimes) {
    const [date, time] = utcKey.split('T');
    if (!date || !time) continue;
    await removeUserFromBucket(userId, date, time, env);
  }
}

async function addUserToBucket(userId, date, time, env) {
  const key = bucketKey(date, time);
  const existingJson = await env.GRATITUDE_KV.get(key);
  let list = [];

  if (existingJson) {
    try {
      const parsed = JSON.parse(existingJson);
      if (Array.isArray(parsed)) list = parsed;
    } catch (error) {
      console.warn('Invalid bucket payload:', key, error);
    }
  }

  if (!list.includes(userId)) {
    list.push(userId);
    await env.GRATITUDE_KV.put(key, JSON.stringify(list), { expirationTtl: BUCKET_TTL_SECONDS });
  }
}

async function removeUserFromBucket(userId, date, time, env) {
  const key = bucketKey(date, time);
  const existingJson = await env.GRATITUDE_KV.get(key);
  if (!existingJson) return;

  let list;
  try {
    list = JSON.parse(existingJson);
  } catch (error) {
    console.warn('Invalid bucket payload:', key, error);
    return;
  }

  if (!Array.isArray(list)) return;
  const filtered = list.filter(id => id !== userId);

  if (filtered.length === 0) {
    await env.GRATITUDE_KV.delete(key);
  } else {
    await env.GRATITUDE_KV.put(key, JSON.stringify(filtered), { expirationTtl: BUCKET_TTL_SECONDS });
  }
}

function bucketKey(date, time) {
  return `bucket:${date}:${time}`;
}

function getCurrentUtcParts() {
  const now = new Date();
  return {
    date: now.toISOString().slice(0, 10),
    time: now.toISOString().slice(11, 16)
  };
}

function settingsFromSchedule(schedule) {
  if (!schedule) return null;
  if (!schedule.remindersPerDay || !schedule.startTime || !schedule.endTime || !schedule.timezone) {
    return null;
  }

  return {
    enabled: true,
    remindersPerDay: schedule.remindersPerDay,
    startTime: schedule.startTime,
    endTime: schedule.endTime,
    timezone: schedule.timezone
  };
}

async function getSettingsForUser(userId, env) {
  const settingsJson = await env.GRATITUDE_KV.get(`user:${userId}:settings`);
  if (!settingsJson) return null;

  try {
    return JSON.parse(settingsJson);
  } catch (error) {
    console.warn('Invalid settings payload for user:', userId, error);
    return null;
  }
}

/**
 * Send a push notification to a subscription with VAPID authentication
 */
async function sendPush(subscription, env) {
  const { endpoint, keys } = subscription;

  // Create VAPID JWT
  const url = new URL(endpoint);
  const audience = `${url.protocol}//${url.host}`;

  const header = { alg: 'ES256', typ: 'JWT' };
  const payload = {
    aud: audience,
    exp: Math.floor(Date.now() / 1000) + (12 * 60 * 60), // 12 hours
    sub: env.VAPID_SUBJECT
  };

  const jwt = await createVapidJwt(header, payload, env.VAPID_PRIVATE_KEY);

  // Send push with VAPID authorization (no payload for simplicity - SW shows default)
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Authorization': `vapid t=${jwt}, k=${env.VAPID_PUBLIC_KEY}`,
      'TTL': '86400',
      'Content-Length': '0',
    }
  });

  if (!response.ok) {
    const text = await response.text();
    console.error('Push failed:', response.status, text);
    throw new Error(`Push failed: ${response.status} ${text}`);
  }

  return response;
}

/**
 * Create a VAPID JWT token
 */
async function createVapidJwt(header, payload, privateKeyBase64) {
  const encoder = new TextEncoder();

  const headerB64 = base64UrlEncode(JSON.stringify(header));
  const payloadB64 = base64UrlEncode(JSON.stringify(payload));
  const unsignedToken = `${headerB64}.${payloadB64}`;

  // Decode the base64url private key
  const privateKeyBytes = base64UrlDecode(privateKeyBase64);

  // Import as JWK (easier than raw/pkcs8 for P-256)
  const jwk = {
    kty: 'EC',
    crv: 'P-256',
    d: privateKeyBase64,
    x: '', // Will extract from public key
    y: ''
  };

  // For VAPID, we need to import the raw 32-byte private key
  // Convert to proper JWK format
  const key = await crypto.subtle.importKey(
    'raw',
    privateKeyBytes,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign']
  ).catch(async () => {
    // If raw import fails, try as JWK with just 'd' parameter
    // We need to derive x,y from the private key or use a different approach
    // For Cloudflare Workers, let's use the pkcs8 approach
    const pkcs8Key = createPkcs8FromRaw(privateKeyBytes);
    return crypto.subtle.importKey(
      'pkcs8',
      pkcs8Key,
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['sign']
    );
  });

  // Sign the token
  const signature = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    key,
    encoder.encode(unsignedToken)
  );

  // Convert DER signature to raw r||s format for JWT
  const signatureBytes = new Uint8Array(signature);
  const rawSignature = derToRaw(signatureBytes);
  const signatureB64 = base64UrlEncode(rawSignature);

  return `${unsignedToken}.${signatureB64}`;
}

/**
 * Convert DER encoded ECDSA signature to raw r||s format
 */
function derToRaw(der) {
  // Web Crypto returns raw 64-byte signature for P-256, not DER
  if (der.length === 64) {
    return der;
  }

  // If it's DER encoded, parse it (shouldn't happen with Web Crypto)
  // DER: 0x30 [total-length] 0x02 [r-length] [r] 0x02 [s-length] [s]
  let offset = 2;
  const rLen = der[offset + 1];
  const r = der.slice(offset + 2, offset + 2 + rLen);
  offset = offset + 2 + rLen;
  const sLen = der[offset + 1];
  const s = der.slice(offset + 2, offset + 2 + sLen);

  // Pad or trim to 32 bytes each
  const raw = new Uint8Array(64);
  raw.set(r.length > 32 ? r.slice(-32) : r, 32 - Math.min(r.length, 32));
  raw.set(s.length > 32 ? s.slice(-32) : s, 64 - Math.min(s.length, 32));
  return raw;
}

/**
 * Create PKCS#8 wrapper for raw EC private key
 */
function createPkcs8FromRaw(rawKey) {
  // PKCS#8 header for P-256 EC private key (without public key)
  const header = new Uint8Array([
    0x30, 0x41, // SEQUENCE, 65 bytes
    0x02, 0x01, 0x00, // INTEGER 0 (version)
    0x30, 0x13, // SEQUENCE, 19 bytes (algorithm)
    0x06, 0x07, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x02, 0x01, // OID ecPublicKey
    0x06, 0x08, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x03, 0x01, 0x07, // OID P-256
    0x04, 0x27, // OCTET STRING, 39 bytes
    0x30, 0x25, // SEQUENCE, 37 bytes
    0x02, 0x01, 0x01, // INTEGER 1 (version)
    0x04, 0x20 // OCTET STRING, 32 bytes (private key)
  ]);

  const result = new Uint8Array(header.length + rawKey.length);
  result.set(header);
  result.set(rawKey, header.length);
  return result;
}

function base64UrlEncode(data) {
  let bytes;
  if (typeof data === 'string') {
    bytes = new TextEncoder().encode(data);
  } else {
    bytes = data;
  }
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function base64UrlDecode(str) {
  str = str.replace(/-/g, '+').replace(/_/g, '/');
  while (str.length % 4) str += '=';
  const binary = atob(str);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * Helper to create JSON response with CORS headers
 */
function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders
    }
  });
}
