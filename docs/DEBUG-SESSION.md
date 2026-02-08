# Gratitude App - Debug Session Notes

## Session Date: 2026-02-06

---

## What Was Accomplished

### Deployment Complete
- ✅ PNG icons generated from SVG (72-512px + badge-72)
- ✅ Git repository initialized
- ✅ GitHub repository created: https://github.com/jvdheyden/gratitude-app
- ✅ Folder restructured: `frontend/` → `docs/` for GitHub Pages
- ✅ GitHub Pages enabled: https://jvdheyden.github.io/gratitude-app/
- ✅ Worker `FRONTEND_URL` updated and redeployed

### Push Notification Fixes
- ✅ Fixed service worker path (`/sw.js` → `./sw.js`)
- ✅ Fixed cached asset paths to use relative paths (`./`)
- ✅ Fixed notification click URL to use `self.registration.scope`
- ✅ Added `/api/test-push` endpoint for manual testing
- ✅ Implemented VAPID JWT signing in worker (was missing, FCM requires it)
- ✅ Push messages now reach the service worker (`[SW] Push received` appears)

---

## Current Problem

### Notifications Not Displaying

**Symptom:**
- Push is received by service worker (console shows `[SW] Push received`)
- But no notification appears on screen
- Even basic `new Notification('Test', {body: 'test'})` doesn't work
- `Notification.permission` returns `"granted"`

**Likely Cause:**
System-level notifications are disabled for the browser.

**To Debug:**
1. **macOS:** System Settings → Notifications → Find browser → Enable
2. **Chrome:** Check `chrome://settings/content/notifications`
3. **Windows:** Settings → System → Notifications → Enable for browser

---

## How to Test Push Notifications

1. Open https://jvdheyden.github.io/gratitude-app/
2. Enable reminders in Settings (subscribes to push)
3. Open browser DevTools console
4. Run:
```javascript
fetch('https://gratitude-worker.jonas-vdheyden.workers.dev/api/test-push', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ userId: localStorage.getItem('gratitude_user_id') })
}).then(r => r.json()).then(console.log)
```

Expected: `{success: true, message: 'Test push sent'}` and a notification appears.

---

## Quick Debug Commands

```javascript
// Check notification permission
Notification.permission

// Check if subscribed
navigator.serviceWorker.ready.then(r => r.pushManager.getSubscription()).then(console.log)

// Test basic notification (bypasses push)
new Notification('Test', { body: 'Does this appear?' })

// Test SW notification
navigator.serviceWorker.ready.then(reg => reg.showNotification('Test', { body: 'SW test' }))
```

---

## Files Changed This Session

| File | Changes |
|------|---------|
| `docs/js/push.js` | Fixed SW registration path to `./sw.js` |
| `docs/sw.js` | Fixed asset paths to relative, fixed notification click URL |
| `worker/src/index.js` | Added `/api/test-push` endpoint, implemented VAPID JWT signing |

---

## Commits Made

1. `4b9f83f` - Initial commit: Gratitude PWA with Cloudflare Worker backend
2. `1be3fa5` - Move frontend to docs/ for GitHub Pages
3. `b3156e0` - Update FRONTEND_URL to GitHub Pages URL
4. `003b68f` - Update STATUS.md - deployment complete
5. `673bdf0` - Add test-push endpoint for manual testing
6. `243950d` - Fix paths for GitHub Pages subpath
7. *(uncommitted)* - VAPID JWT signing implementation

---

## Next Steps

1. **Fix system notifications** - Check OS/browser notification settings
2. **Test on mobile** - Push notifications often work better on mobile
3. **Commit remaining changes** - VAPID signing code not yet committed
4. **End-to-end test** - Full flow: enable reminders → receive push → add entry
