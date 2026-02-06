/**
 * Storage module - handles localStorage operations for entries and settings
 */

const STORAGE_KEYS = {
  USER_ID: 'gratitude_user_id',
  ENTRIES: 'gratitude_entries',
  SETTINGS: 'gratitude_settings'
};

/**
 * Generate a UUID v4
 * @returns {string}
 */
function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

/**
 * Get or create user ID
 * @returns {string}
 */
function getUserId() {
  let userId = localStorage.getItem(STORAGE_KEYS.USER_ID);
  if (!userId) {
    userId = generateUUID();
    localStorage.setItem(STORAGE_KEYS.USER_ID, userId);
  }
  return userId;
}

/**
 * Get all entries
 * @returns {Array<{id: string, text: string, timestamp: string, date: string}>}
 */
function getAllEntries() {
  const entries = localStorage.getItem(STORAGE_KEYS.ENTRIES);
  return entries ? JSON.parse(entries) : [];
}

/**
 * Get entries for a specific date
 * @param {string} date - Date in YYYY-MM-DD format
 * @returns {Array}
 */
function getEntriesForDate(date) {
  const entries = getAllEntries();
  return entries.filter(entry => entry.date === date);
}

/**
 * Get today's entries
 * @returns {Array}
 */
function getTodayEntries() {
  const today = getLocalDate();
  return getEntriesForDate(today);
}

/**
 * Add a new entry
 * @param {string} text - Entry text
 * @returns {Object} The created entry
 */
function addEntry(text) {
  const entries = getAllEntries();
  const now = new Date();

  const entry = {
    id: generateUUID(),
    text: text.trim(),
    timestamp: now.toISOString(),
    date: getLocalDate(),
    time: now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  };

  entries.unshift(entry); // Add to beginning
  localStorage.setItem(STORAGE_KEYS.ENTRIES, JSON.stringify(entries));

  return entry;
}

/**
 * Delete an entry by ID
 * @param {string} id - Entry ID
 * @returns {boolean} Success
 */
function deleteEntry(id) {
  const entries = getAllEntries();
  const index = entries.findIndex(entry => entry.id === id);

  if (index === -1) return false;

  entries.splice(index, 1);
  localStorage.setItem(STORAGE_KEYS.ENTRIES, JSON.stringify(entries));

  return true;
}

/**
 * Get entries grouped by date
 * @param {number} limit - Max number of days to return
 * @returns {Object} Entries grouped by date
 */
function getEntriesGroupedByDate(limit = 30) {
  const entries = getAllEntries();
  const grouped = {};

  for (const entry of entries) {
    if (!grouped[entry.date]) {
      grouped[entry.date] = [];
    }
    grouped[entry.date].push(entry);
  }

  // Sort dates descending and limit
  const sortedDates = Object.keys(grouped).sort().reverse().slice(0, limit);
  const result = {};

  for (const date of sortedDates) {
    result[date] = grouped[date];
  }

  return result;
}

/**
 * Get settings from localStorage
 * @returns {Object}
 */
function getSettings() {
  const settings = localStorage.getItem(STORAGE_KEYS.SETTINGS);
  return settings ? JSON.parse(settings) : {
    enabled: false,
    remindersPerDay: 3,
    startTime: '09:00',
    endTime: '21:00',
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
  };
}

/**
 * Save settings to localStorage
 * @param {Object} settings
 */
function saveSettings(settings) {
  localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(settings));
}

/**
 * Get local date in YYYY-MM-DD format
 * @returns {string}
 */
function getLocalDate() {
  const now = new Date();
  return now.getFullYear() + '-' +
    String(now.getMonth() + 1).padStart(2, '0') + '-' +
    String(now.getDate()).padStart(2, '0');
}

/**
 * Format a date string for display
 * @param {string} dateStr - Date in YYYY-MM-DD format
 * @returns {string}
 */
function formatDateForDisplay(dateStr) {
  const date = new Date(dateStr + 'T00:00:00');
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  const todayStr = getLocalDate();
  const yesterdayStr = yesterday.getFullYear() + '-' +
    String(yesterday.getMonth() + 1).padStart(2, '0') + '-' +
    String(yesterday.getDate()).padStart(2, '0');

  if (dateStr === todayStr) {
    return 'Today';
  } else if (dateStr === yesterdayStr) {
    return 'Yesterday';
  } else {
    return date.toLocaleDateString(undefined, {
      weekday: 'long',
      month: 'long',
      day: 'numeric'
    });
  }
}

// Export functions for use in other modules
window.Storage = {
  getUserId,
  getAllEntries,
  getEntriesForDate,
  getTodayEntries,
  addEntry,
  deleteEntry,
  getEntriesGroupedByDate,
  getSettings,
  saveSettings,
  getLocalDate,
  formatDateForDisplay
};
