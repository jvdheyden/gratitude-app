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

/**
 * Convert a local date/time in a specific timezone to UTC date/time parts
 * @param {string} date - Date in YYYY-MM-DD format (local to timezone)
 * @param {string} time - Time in HH:MM format (24h, local to timezone)
 * @param {string} timezone - IANA timezone string
 * @returns {{ date: string, time: string }} UTC date and time parts
 */
export function toUtcDateTimeParts(date, time, timezone) {
  const [year, month, day] = date.split('-').map(Number);
  const [hour, minute] = time.split(':').map(Number);

  // Start with a UTC guess for the local time
  const utcGuess = new Date(Date.UTC(year, month - 1, day, hour, minute, 0));
  let offset = getTimeZoneOffsetMinutes(timezone, utcGuess);
  let utcMs = utcGuess.getTime() - offset * 60 * 1000;

  // Recalculate once to handle DST transitions
  const offset2 = getTimeZoneOffsetMinutes(timezone, new Date(utcMs));
  if (offset2 !== offset) {
    offset = offset2;
    utcMs = utcGuess.getTime() - offset * 60 * 1000;
  }

  const utcDate = new Date(utcMs).toISOString();
  return {
    date: utcDate.slice(0, 10),
    time: utcDate.slice(11, 16)
  };
}

/**
 * Get timezone offset in minutes for a given date
 * @param {string} timezone - IANA timezone string
 * @param {Date} date - Date object (interpreted as UTC)
 * @returns {number} Offset minutes (e.g., -300 for UTC-5)
 */
function getTimeZoneOffsetMinutes(timezone, date) {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });

  const parts = dtf.formatToParts(date);
  const values = Object.fromEntries(parts.map(p => [p.type, p.value]));

  const asUtc = Date.UTC(
    parseInt(values.year, 10),
    parseInt(values.month, 10) - 1,
    parseInt(values.day, 10),
    parseInt(values.hour, 10),
    parseInt(values.minute, 10),
    parseInt(values.second, 10)
  );

  return (asUtc - date.getTime()) / 60000;
}
