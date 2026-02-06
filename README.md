# Gratitude Journal

A mobile-first PWA for mindful gratitude journaling with Web Push reminders.

## Features

- **Daily Gratitude Entries**: Capture what you're grateful for throughout the day
- **Random Reminders**: Get gentle push notifications at random times within your preferred window
- **Daily Reflection**: View a template-based summary of your daily gratitudes
- **History**: Browse past entries organized by date
- **Offline Support**: Works offline with Service Worker caching
- **Installable**: Add to home screen for a native app experience

## Tech Stack

- **Frontend**: Vanilla HTML/CSS/JS (no build step)
- **Backend**: Cloudflare Worker (serverless)
- **Database**: Cloudflare KV (key-value storage)
- **Scheduler**: Cloudflare Cron Triggers

## Project Structure

```
gratitude-app/
├── frontend/               # Static PWA (deploy to GitHub Pages)
│   ├── index.html
│   ├── css/styles.css
│   ├── js/
│   │   ├── app.js          # Main app logic
│   │   ├── storage.js      # LocalStorage helpers
│   │   └── push.js         # Push subscription logic
│   ├── sw.js               # Service Worker
│   ├── manifest.json       # PWA manifest
│   └── icons/              # App icons (you need to add these)
├── worker/                 # Cloudflare Worker (deploy via wrangler)
│   ├── src/
│   │   ├── index.js        # Worker entry point
│   │   ├── push.js         # Web Push sending logic
│   │   └── scheduler.js    # Random time scheduling
│   ├── wrangler.toml       # Cloudflare config
│   └── package.json
└── README.md
```

## Setup

### 1. Generate VAPID Keys

VAPID keys are required for Web Push authentication. Generate them once:

```bash
cd worker
npm install
npx web-push generate-vapid-keys
```

Save the output - you'll need both keys.

### 2. Set Up Cloudflare Worker

1. Install Wrangler CLI:
   ```bash
   npm install -g wrangler
   ```

2. Login to Cloudflare:
   ```bash
   wrangler login
   ```

3. Create KV namespace:
   ```bash
   cd worker
   npx wrangler kv:namespace create "GRATITUDE_KV"
   ```
   Copy the returned ID and update `wrangler.toml`.

4. Set secrets:
   ```bash
   npx wrangler secret put VAPID_PUBLIC_KEY
   npx wrangler secret put VAPID_PRIVATE_KEY
   npx wrangler secret put VAPID_SUBJECT
   ```
   For VAPID_SUBJECT, use a mailto: URL (e.g., `mailto:you@example.com`).

5. Update `wrangler.toml`:
   - Replace `YOUR_KV_NAMESPACE_ID` with the ID from step 3
   - Update `FRONTEND_URL` with your GitHub Pages URL

6. Deploy:
   ```bash
   npx wrangler deploy
   ```
   Note the worker URL (e.g., `https://gratitude-worker.YOUR_SUBDOMAIN.workers.dev`).

### 3. Set Up Frontend

1. Update API URL in `frontend/js/push.js`:
   ```javascript
   const API_URL = 'https://gratitude-worker.YOUR_SUBDOMAIN.workers.dev';
   ```

2. Add app icons to `frontend/icons/`:
   - `icon-72.png` (72x72)
   - `icon-96.png` (96x96)
   - `icon-128.png` (128x128)
   - `icon-144.png` (144x144)
   - `icon-152.png` (152x152)
   - `icon-192.png` (192x192)
   - `icon-384.png` (384x384)
   - `icon-512.png` (512x512)
   - `badge-72.png` (72x72, for notification badge)

   You can generate these from a single high-res icon using tools like:
   - https://realfavicongenerator.net/
   - https://maskable.app/editor

3. Deploy to GitHub Pages:
   - Push this repo to GitHub
   - Go to Settings > Pages
   - Set source to the branch containing the code
   - Set folder to `/frontend`

### 4. Configure GitHub Pages

If using a custom domain:
1. Add a `CNAME` file to `frontend/` with your domain
2. Update `manifest.json` start_url if needed

## Local Development

### Frontend

```bash
cd frontend
npx serve .
# Or use Python:
# python3 -m http.server 8000
```

Open http://localhost:5000 (or 8000).

### Worker

```bash
cd worker
npm install
npx wrangler dev
```

The worker runs at http://localhost:8787. Update the API_URL in `push.js` for local testing.

## Testing Push Notifications

1. Open the app in a browser that supports Web Push (Chrome, Firefox, Edge)
2. Go to Settings and enable reminders
3. Grant notification permission when prompted
4. Set the reminder window and count
5. Monitor worker logs: `npx wrangler tail`
6. Wait for a scheduled notification or trigger manually

### Manual Testing

To test the cron handler manually:
```bash
curl -X POST http://localhost:8787/__scheduled
```

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                 Frontend (PWA) - GitHub Pages               │
│                                                             │
│  LocalStorage: entries, settings                            │
│  Service Worker: caching, push events                       │
└──────────────────────────┬──────────────────────────────────┘
                           │ HTTPS API
                           ▼
┌─────────────────────────────────────────────────────────────┐
│              Cloudflare Worker (Serverless)                 │
│                                                             │
│  POST /api/subscribe - save push subscription               │
│  POST /api/settings  - save settings, generate schedule     │
│  GET  /api/settings/:userId - retrieve settings             │
│                                                             │
│  Cron (every minute): send due push notifications           │
│                                                             │
│  KV Storage:                                                │
│  - user:{id}:subscription  → push subscription              │
│  - user:{id}:settings      → reminder settings              │
│  - schedule:{date}:{id}    → times + sent tracking          │
└─────────────────────────────────────────────────────────────┘
```

## Costs (Free Tier)

- **Cloudflare Workers**: 100,000 requests/day free
- **Cloudflare KV**: 100,000 reads/day, 1,000 writes/day free
- **GitHub Pages**: Free for public repos

For personal use, this should stay well within free tiers.

## Security Notes

- User IDs are generated client-side (UUIDs) and stored in localStorage
- No authentication system - anyone with a user ID can access those entries
- HTTPS is required for Service Workers and Web Push
- VAPID keys should be kept secret (stored as Cloudflare secrets)

## Limitations

- Push notification encryption is simplified for MVP
- No user authentication (anonymous usage)
- No data export functionality
- No cross-device sync (data is per-browser)

## License

MIT
