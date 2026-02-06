/**
 * Gratitude App - Cloudflare Worker
 *
 * Handles:
 * - Push subscription storage
 * - User settings storage
 * - Scheduled push notification sending (via cron)
 */

import { generateRandomTimes, getDateInTimezone, getTimeInTimezone, scheduleKey } from './scheduler.js';

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
    console.log('Cron triggered at:', new Date().toISOString());
    await processScheduledPushes(env);
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

  // Generate schedule for today if reminders are enabled
  if (enabled) {
    const today = getDateInTimezone(timezone);
    const times = generateRandomTimes(remindersPerDay, startTime, endTime, today);

    const schedule = {
      times,
      sent: [], // Track which times have been sent
      timezone
    };

    await env.GRATITUDE_KV.put(
      scheduleKey(today, userId),
      JSON.stringify(schedule)
    );

    console.log(`Generated schedule for user ${userId} on ${today}:`, times);
  }

  return jsonResponse({ success: true });
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

/**
 * Process scheduled push notifications (called by cron)
 */
async function processScheduledPushes(env) {
  // List all users with settings
  // Note: In production, you'd want a more efficient way to do this
  // For MVP, we iterate through known schedule keys

  // Get all schedule keys for today across different timezones
  // We check multiple possible "today" dates to handle timezone differences
  const now = new Date();
  const dates = [
    now.toISOString().split('T')[0], // UTC today
  ];

  // Add yesterday and tomorrow to handle timezone edge cases
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  dates.push(yesterday.toISOString().split('T')[0]);

  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  dates.push(tomorrow.toISOString().split('T')[0]);

  console.log('Checking schedules for dates:', dates);

  // List all keys with schedule prefix
  // Note: KV list has limitations, for large scale you'd need a different approach
  const listResult = await env.GRATITUDE_KV.list({ prefix: 'schedule:' });

  for (const key of listResult.keys) {
    await processScheduleKey(key.name, env);
  }
}

/**
 * Process a single schedule key
 */
async function processScheduleKey(key, env) {
  // Parse key: schedule:{date}:{userId}
  const parts = key.split(':');
  if (parts.length !== 3) return;

  const [, date, userId] = parts;

  // Get schedule
  const scheduleJson = await env.GRATITUDE_KV.get(key);
  if (!scheduleJson) return;

  const schedule = JSON.parse(scheduleJson);
  const { times, sent, timezone } = schedule;

  // Get current time in user's timezone
  const currentTime = getTimeInTimezone(timezone);
  const currentDate = getDateInTimezone(timezone);

  // Only process if this schedule is for today in user's timezone
  if (date !== currentDate) return;

  // Check if any scheduled time matches current minute
  for (const time of times) {
    if (time === currentTime && !sent.includes(time)) {
      console.log(`Sending push to user ${userId} at ${time}`);

      // Get user's subscription
      const subscriptionJson = await env.GRATITUDE_KV.get(`user:${userId}:subscription`);
      if (!subscriptionJson) {
        console.log(`No subscription found for user ${userId}`);
        continue;
      }

      const subscription = JSON.parse(subscriptionJson);

      // Send push notification
      await sendPush(subscription, env);

      // Mark as sent
      sent.push(time);
      await env.GRATITUDE_KV.put(key, JSON.stringify({ times, sent, timezone }));

      console.log(`Push sent to user ${userId}`);
    }
  }
}

/**
 * Send a push notification to a subscription
 */
async function sendPush(subscription, env) {
  const payload = JSON.stringify({
    title: 'Gratitude Moment',
    body: 'Take a moment to notice something you\'re grateful for today.',
    icon: '/icons/icon-192.png',
    badge: '/icons/badge-72.png',
    data: {
      action: 'open-entry'
    }
  });

  try {
    // Use Web Push protocol
    const response = await fetch(subscription.endpoint, {
      method: 'POST',
      headers: {
        'TTL': '86400',
        'Content-Type': 'application/json',
        'Content-Length': payload.length.toString(),
        // In production, add VAPID authentication headers
        // This simplified version works with some push services
      },
      body: payload
    });

    if (!response.ok) {
      console.error('Push failed:', response.status, await response.text());
    }

    return response;
  } catch (error) {
    console.error('Push error:', error);
    throw error;
  }
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
