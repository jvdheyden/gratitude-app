/**
 * Scheduler module - generates random reminder times within a user's preferred window
 */

/**
 * Generate N random times within a time window for a given date
 * @param {number} n - Number of reminders
 * @param {string} startTime - Start time in HH:MM format (24h)
 * @param {string} endTime - End time in HH:MM format (24h)
 * @param {string} date - Date in YYYY-MM-DD format
 * @returns {string[]} Array of times in HH:MM format, sorted chronologically
 */
export function generateRandomTimes(n, startTime, endTime, date) {
  const [startHour, startMin] = startTime.split(':').map(Number);
  const [endHour, endMin] = endTime.split(':').map(Number);

  // Convert to minutes since midnight
  const startMinutes = startHour * 60 + startMin;
  const endMinutes = endHour * 60 + endMin;

  if (endMinutes <= startMinutes) {
    throw new Error('End time must be after start time');
  }

  const windowMinutes = endMinutes - startMinutes;

  // Generate n random times
  const times = [];
  for (let i = 0; i < n; i++) {
    const randomOffset = Math.floor(Math.random() * windowMinutes);
    const totalMinutes = startMinutes + randomOffset;
    const hour = Math.floor(totalMinutes / 60);
    const minute = totalMinutes % 60;
    times.push(`${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`);
  }

  // Sort chronologically
  return times.sort();
}

/**
 * Get the current date in user's timezone
 * @param {string} timezone - IANA timezone string
 * @returns {string} Date in YYYY-MM-DD format
 */
export function getDateInTimezone(timezone) {
  const now = new Date();
  const options = { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' };
  const parts = new Intl.DateTimeFormat('en-CA', options).formatToParts(now);
  const year = parts.find(p => p.type === 'year').value;
  const month = parts.find(p => p.type === 'month').value;
  const day = parts.find(p => p.type === 'day').value;
  return `${year}-${month}-${day}`;
}

/**
 * Get the current time (HH:MM) in user's timezone
 * @param {string} timezone - IANA timezone string
 * @returns {string} Time in HH:MM format
 */
export function getTimeInTimezone(timezone) {
  const now = new Date();
  const options = { timeZone: timezone, hour: '2-digit', minute: '2-digit', hour12: false };
  const formatter = new Intl.DateTimeFormat('en-GB', options);
  return formatter.format(now);
}

/**
 * Create a schedule key for KV storage
 * @param {string} date - Date in YYYY-MM-DD format
 * @param {string} userId - User ID
 * @returns {string} KV key
 */
export function scheduleKey(date, userId) {
  return `schedule:${date}:${userId}`;
}
