/**
 * Gratitude App - Main Application Logic
 */

// Inspirational quotes
const QUOTES = [
  "Be thankful for what you have; you'll end up having more.",
  "Gratitude turns what we have into enough.",
  "The more grateful I am, the more beauty I see.",
  "Gratitude is the fairest blossom which springs from the soul.",
  "When you are grateful, fear disappears and abundance appears.",
  "Gratitude makes sense of our past, brings peace for today, and creates a vision for tomorrow.",
  "Enjoy the little things, for one day you may look back and realize they were the big things.",
  "Gratitude is not only the greatest of virtues, but the parent of all others.",
  "What separates privilege from entitlement is gratitude.",
  "The roots of all goodness lie in the soil of appreciation for goodness."
];

// App state
let currentView = 'home';
let deferredInstallPrompt = null;

// DOM Elements
const views = {
  home: document.getElementById('view-home'),
  history: document.getElementById('view-history'),
  summary: document.getElementById('view-summary'),
  settings: document.getElementById('view-settings')
};

const elements = {
  entryText: document.getElementById('entry-text'),
  saveEntryBtn: document.getElementById('save-entry-btn'),
  greetingMessage: document.getElementById('greeting-message'),
  gratitudeCount: document.getElementById('gratitude-count'),
  entriesContainer: document.getElementById('entries-container'),
  historyContainer: document.getElementById('history-container'),
  summaryContainer: document.getElementById('summary-container'),
  dailyQuote: document.getElementById('daily-quote'),
  remindersToggle: document.getElementById('reminders-toggle'),
  reminderSettings: document.getElementById('reminder-settings'),
  remindersCount: document.getElementById('reminders-count'),
  remindersCountValue: document.getElementById('reminders-count-value'),
  startTime: document.getElementById('start-time'),
  endTime: document.getElementById('end-time'),
  notificationStatus: document.getElementById('notification-status'),
  enableNotificationsBtn: document.getElementById('enable-notifications-btn'),
  installPrompt: document.getElementById('install-prompt'),
  installNowBtn: document.getElementById('install-now'),
  installLaterBtn: document.getElementById('install-later'),
  micBtn: document.getElementById('mic-btn')
};

/**
 * Initialize the app
 */
async function init() {
  // Set greeting based on time
  updateGreeting();

  // Set random daily quote
  setDailyQuote();

  // Load today's entries
  renderTodayEntries();

  // Load settings
  loadSettings();

  // Set up navigation
  setupNavigation();

  // Set up event listeners
  setupEventListeners();

  // Initialize push notifications
  await window.Push.initializePush();

  // Update notification status
  updateNotificationStatus();

  // Check for hash-based navigation (from notification click)
  handleHashNavigation();

  // Listen for SW messages
  window.addEventListener('open-entry-modal', () => {
    elements.entryText.focus();
  });

  console.log('Gratitude app initialized');
}

/**
 * Update greeting based on time of day
 */
function updateGreeting() {
  const hour = new Date().getHours();
  let greeting;

  if (hour < 12) {
    greeting = 'Good morning';
  } else if (hour < 17) {
    greeting = 'Good afternoon';
  } else {
    greeting = 'Good evening';
  }

  elements.greetingMessage.textContent = greeting;
}

/**
 * Set a random daily quote (consistent for the day)
 */
function setDailyQuote() {
  // Use the date as seed for consistent daily quote
  const today = new Date();
  const seed = today.getFullYear() * 10000 + (today.getMonth() + 1) * 100 + today.getDate();
  const index = seed % QUOTES.length;
  elements.dailyQuote.textContent = `"${QUOTES[index]}"`;
}

/**
 * Set up navigation buttons
 */
function setupNavigation() {
  const navButtons = document.querySelectorAll('.nav-btn');

  navButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const viewName = btn.dataset.view;
      navigateTo(viewName);
    });
  });
}

/**
 * Navigate to a view
 * @param {string} viewName
 */
function navigateTo(viewName) {
  // Update active nav button
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.view === viewName);
  });

  // Update active view
  Object.keys(views).forEach(name => {
    if (views[name]) {
      views[name].classList.toggle('active', name === viewName);
    }
  });

  // Render view-specific content
  if (viewName === 'history') {
    renderHistory();
  } else if (viewName === 'summary') {
    renderSummary();
  } else if (viewName === 'home') {
    renderTodayEntries();
    updateGreeting();
  }

  currentView = viewName;
}

/**
 * Set up event listeners
 */
function setupEventListeners() {
  // Save entry button
  elements.saveEntryBtn.addEventListener('click', saveEntry);

  // Enter key to save (Ctrl/Cmd + Enter)
  elements.entryText.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      saveEntry();
    }
  });

  // Mic button (placeholder - voice not implemented)
  elements.micBtn.addEventListener('click', () => {
    alert('Voice input coming soon!');
  });

  // Reminders toggle
  elements.remindersToggle.addEventListener('change', handleRemindersToggle);

  // Reminders count slider
  elements.remindersCount.addEventListener('input', handleRemindersCountChange);

  // Time inputs
  elements.startTime.addEventListener('change', saveSettingsDebounced);
  elements.endTime.addEventListener('change', saveSettingsDebounced);

  // Enable notifications button
  elements.enableNotificationsBtn.addEventListener('click', enableNotifications);

  // Install prompt
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredInstallPrompt = e;
    elements.installPrompt.style.display = 'flex';
  });

  elements.installNowBtn.addEventListener('click', handleInstall);
  elements.installLaterBtn.addEventListener('click', () => {
    elements.installPrompt.style.display = 'none';
  });
}

/**
 * Save entry
 */
function saveEntry() {
  const text = elements.entryText.value.trim();

  if (!text) {
    elements.entryText.focus();
    return;
  }

  const entry = window.Storage.addEntry(text);
  console.log('Entry saved:', entry);

  // Clear input
  elements.entryText.value = '';

  // Re-render entries
  renderTodayEntries();

  // Quick feedback animation on button
  elements.saveEntryBtn.style.transform = 'scale(1.05)';
  setTimeout(() => {
    elements.saveEntryBtn.style.transform = '';
  }, 150);
}

/**
 * Render today's entries
 */
function renderTodayEntries() {
  const entries = window.Storage.getTodayEntries();

  // Update count
  const count = entries.length;
  elements.gratitudeCount.textContent = `${count} moment${count !== 1 ? 's' : ''} of gratitude`;

  if (entries.length === 0) {
    elements.entriesContainer.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">
          <svg viewBox="0 0 24 24" fill="currentColor">
            <circle cx="12" cy="12" r="5"/>
            <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>
          </svg>
        </div>
        <p>No gratitude entries yet today.<br>Take a moment to reflect!</p>
      </div>
    `;
    return;
  }

  elements.entriesContainer.innerHTML = `
    <div class="entries-section">
      ${entries.map(entry => `
        <div class="gratitude-entry" data-id="${entry.id}">
          <p class="gratitude-entry-text">${escapeHtml(entry.text)}</p>
          <span class="gratitude-entry-time">${entry.time}</span>
          <button class="gratitude-entry-delete" onclick="deleteEntry('${entry.id}')" aria-label="Delete entry">
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
            </svg>
          </button>
        </div>
      `).join('')}
    </div>
  `;
}

/**
 * Delete an entry
 * @param {string} id
 */
function deleteEntry(id) {
  if (confirm('Delete this entry?')) {
    window.Storage.deleteEntry(id);
    renderTodayEntries();

    // Also refresh history if we're on that view
    if (currentView === 'history') {
      renderHistory();
    }
  }
}

// Make deleteEntry available globally for onclick
window.deleteEntry = deleteEntry;

/**
 * Render history view
 */
function renderHistory() {
  const grouped = window.Storage.getEntriesGroupedByDate(30);
  const dates = Object.keys(grouped);

  // Filter out today
  const today = window.Storage.getLocalDate();
  const pastDates = dates.filter(d => d !== today);

  if (pastDates.length === 0) {
    elements.historyContainer.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
            <line x1="16" y1="2" x2="16" y2="6"/>
            <line x1="8" y1="2" x2="8" y2="6"/>
            <line x1="3" y1="10" x2="21" y2="10"/>
          </svg>
        </div>
        <p>No past entries yet.</p>
      </div>
    `;
    return;
  }

  elements.historyContainer.innerHTML = pastDates.map(date => `
    <div class="history-day">
      <h3 class="history-date">${window.Storage.formatDateForDisplay(date)}</h3>
      <div class="history-entries">
        ${grouped[date].map(entry => `
          <p class="history-entry">${escapeHtml(entry.text)}</p>
        `).join('')}
      </div>
    </div>
  `).join('');
}

/**
 * Render daily summary
 */
function renderSummary() {
  const entries = window.Storage.getTodayEntries();

  if (entries.length === 0) {
    elements.summaryContainer.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
          </svg>
        </div>
        <p>Add some gratitude entries to see your daily reflection.</p>
      </div>
    `;
    return;
  }

  const story = generateDailyStory(entries);
  const closing = getClosingMessage();

  elements.summaryContainer.innerHTML = `
    <p class="summary-text">${story.intro}</p>
    <div class="summary-entries">
      ${entries.map(entry => `
        <p class="summary-entry">"${escapeHtml(entry.text)}"</p>
      `).join('')}
    </div>
    <p class="summary-closing">${closing}</p>
  `;
}

/**
 * Generate a daily story from entries
 * @param {Array} entries
 * @returns {Object}
 */
function generateDailyStory(entries) {
  const count = entries.length;

  const intros = {
    1: [
      "Today, you paused to recognize something meaningful:",
      "In your day, you found gratitude for:",
      "You took a moment to appreciate:"
    ],
    few: [
      "Today, you noticed several things to be grateful for:",
      "Your day held multiple moments of appreciation:",
      "You found gratitude in these moments:"
    ],
    many: [
      "What a grateful day! You recognized so many blessings:",
      "Today was rich with appreciation. You noticed:",
      "Your heart was full today with gratitude for:"
    ]
  };

  let introArray;
  if (count === 1) {
    introArray = intros[1];
  } else if (count <= 3) {
    introArray = intros.few;
  } else {
    introArray = intros.many;
  }

  const intro = introArray[Math.floor(Math.random() * introArray.length)];

  return { intro };
}

/**
 * Get a closing message
 * @returns {string}
 */
function getClosingMessage() {
  const messages = [
    "Every moment of gratitude strengthens your well-being.",
    "Gratitude turns what we have into enough.",
    "By noticing the good, you invite more of it into your life.",
    "Your grateful heart is a garden of abundance.",
    "Keep nurturing your practice of appreciation.",
    "What a beautiful practice of mindfulness.",
    "Each grateful thought is a seed of joy."
  ];

  return messages[Math.floor(Math.random() * messages.length)];
}

/**
 * Load settings into the UI
 */
function loadSettings() {
  const settings = window.Storage.getSettings();

  elements.remindersToggle.checked = settings.enabled;
  elements.remindersCount.value = settings.remindersPerDay;
  elements.remindersCountValue.textContent = settings.remindersPerDay;
  elements.startTime.value = settings.startTime;
  elements.endTime.value = settings.endTime;

  // Show/hide reminder settings based on toggle
  elements.reminderSettings.classList.toggle('hidden', !settings.enabled);
}

/**
 * Handle reminders toggle change
 */
async function handleRemindersToggle() {
  const enabled = elements.remindersToggle.checked;
  elements.reminderSettings.classList.toggle('hidden', !enabled);

  if (enabled) {
    // Check notification permission
    const permission = window.Push.getNotificationPermission();

    if (permission !== 'granted') {
      const result = await window.Push.requestNotificationPermission();
      if (result !== 'granted') {
        elements.remindersToggle.checked = false;
        elements.reminderSettings.classList.add('hidden');
        alert('Please enable notifications to use reminders.');
        return;
      }
    }

    // Subscribe to push
    try {
      await window.Push.subscribeToPush();
    } catch (error) {
      console.error('Failed to subscribe:', error);
      alert('Failed to enable reminders. Please try again.');
      elements.remindersToggle.checked = false;
      elements.reminderSettings.classList.add('hidden');
      return;
    }
  }

  saveSettingsDebounced();
  updateNotificationStatus();
}

/**
 * Handle reminders count slider change
 */
function handleRemindersCountChange() {
  elements.remindersCountValue.textContent = elements.remindersCount.value;
  saveSettingsDebounced();
}

// Debounce timer
let saveSettingsTimer = null;

/**
 * Debounced settings save
 */
function saveSettingsDebounced() {
  clearTimeout(saveSettingsTimer);
  saveSettingsTimer = setTimeout(saveAllSettings, 500);
}

/**
 * Save all settings to localStorage and backend
 */
async function saveAllSettings() {
  const settings = {
    enabled: elements.remindersToggle.checked,
    remindersPerDay: parseInt(elements.remindersCount.value, 10),
    startTime: elements.startTime.value,
    endTime: elements.endTime.value,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
  };

  // Validate time range
  if (settings.startTime >= settings.endTime) {
    alert('End time must be after start time.');
    return;
  }

  // Save locally
  window.Storage.saveSettings(settings);

  // Save to backend so the worker can create or remove schedules
  try {
    await window.Push.saveSettingsToBackend(settings);
    console.log('Settings synced to backend');
  } catch (error) {
    console.error('Failed to sync settings:', error);
  }
}

/**
 * Update notification status display
 */
function updateNotificationStatus() {
  if (!window.Push.isPushSupported()) {
    elements.notificationStatus.textContent = 'Push notifications are not supported on this device.';
    elements.enableNotificationsBtn.style.display = 'none';
    return;
  }

  const permission = window.Push.getNotificationPermission();

  if (permission === 'granted') {
    elements.notificationStatus.textContent = 'Notifications are enabled.';
    elements.enableNotificationsBtn.style.display = 'none';
  } else if (permission === 'denied') {
    elements.notificationStatus.textContent = 'Notifications are blocked. Please enable them in your browser settings.';
    elements.enableNotificationsBtn.style.display = 'none';
  } else {
    elements.notificationStatus.textContent = 'Enable notifications to receive gentle reminders.';
    elements.enableNotificationsBtn.style.display = 'block';
  }
}

/**
 * Enable notifications button handler
 */
async function enableNotifications() {
  const permission = await window.Push.requestNotificationPermission();
  updateNotificationStatus();

  if (permission === 'granted') {
    try {
      await window.Push.subscribeToPush();
    } catch (error) {
      console.error('Failed to subscribe:', error);
    }
  }
}

/**
 * Handle PWA install
 */
async function handleInstall() {
  if (!deferredInstallPrompt) return;

  deferredInstallPrompt.prompt();
  const result = await deferredInstallPrompt.userChoice;
  console.log('Install prompt result:', result);

  deferredInstallPrompt = null;
  elements.installPrompt.style.display = 'none';
}

/**
 * Handle hash-based navigation (for notification clicks)
 */
function handleHashNavigation() {
  if (window.location.hash === '#entry') {
    elements.entryText.focus();
    window.location.hash = '';
  }
}

/**
 * Escape HTML to prevent XSS
 * @param {string} text
 * @returns {string}
 */
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
