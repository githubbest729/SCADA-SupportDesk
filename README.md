# AGAC SCADA SupportDesk

An offline-first Progressive Web App that lets plant-floor operators log SCADA incidents from substations with no network coverage, then automatically syncs those tickets to ClickUp the moment connectivity returns.

## Architecture overview

```
index.html          Intake/triage UI, diagnostic assist, ticket queue view
offline.html         Fallback page for uncached routes
manifest.json        Standalone display + share_target for diagnostic photos
sw.js                Service worker: caching, background sync, push notifications
css/style.css        App styling
js/db.js             IndexedDB schema and data access
js/clickup-sync.js   ClickUp API sync (via backend proxy)
js/app.js            App logic: form handling, KB lookups, queue rendering
icons/               App icons (see "Icons & assets" below)
```

## Offline-first ticketing

Every ticket an operator submits is written to IndexedDB (`ticket_drafts` store) before anything touches the network. The UI never blocks on connectivity — the "Save ticket" button succeeds instantly whether the device is online or not. Tickets sit in a `queued` state until they're successfully pushed to ClickUp, at which point they flip to `synced`.

### IndexedDB schema (`js/db.js`)

| Store | Key | Purpose |
|---|---|---|
| `ticket_drafts` | `localId` (auto) | Offline queue of operator-submitted incidents, indexed by `status` and `equipmentTagId` |
| `equipment_tags` | `tagId` | Known PLC/HMI/RTU tags, indexed by `system` and `location` |
| `knowledge_articles` | `articleId` | Cached troubleshooting content, indexed by `system` and `faultCode` |

## Caching strategy (`sw.js`)

- **App shell** (`index.html`, `offline.html`, CSS/JS, `manifest.json`) is precached on install for instant, fully-offline loads.
- **Knowledge base manuals** (`/kb/*`) use **stale-while-revalidate**: a cached copy is served immediately, while a background fetch refreshes it for next time — critical during unplanned downtime when a fresh network round-trip can't be guaranteed.
- **Navigation requests** that fail (no cache, no network) fall back to `offline.html`, which explains what's still usable (ticket drafts, cached manuals) rather than showing a browser error.

## ClickUp API synchronization

`js/clickup-sync.js` maps each queued ticket to a ClickUp task:

1. On reconnect, the Service Worker's `sync` event (tag: `sync-ticket-queue`) fires.
2. The page (or the SW itself, via `importScripts`, if no page is open) reads all `queued` tickets from IndexedDB.
3. Each ticket is POSTed to a **backend proxy** at `/api/clickup/list/:listId/task` — never directly to `api.clickup.com` from the client, since a ClickUp API token must not ship inside PWA code.
4. On success, the ticket is marked `synced` with its ClickUp task ID. On failure, it stays `queued` and retries on the next sync event.
5. Engineering resolution notes are pushed back via `pushResolutionUpdate()`, appending timestamped comments to the ClickUp task to preserve an audit trail.

**You must implement the `/api/clickup/*` proxy** (a small serverless function or backend route) that holds the ClickUp API token server-side and forwards requests to `https://api.clickup.com/api/v2/`.

## Push notifications

The Service Worker's `push` handler surfaces high-priority alarm escalations and ticket status changes as native notifications, using `requireInteraction` for `critical`-priority alerts so they don't auto-dismiss. Wire this up to a push provider (e.g. web-push with VAPID keys) on your backend.

## Local development

```bash
npm install
npm run dev
```

This starts `http-server` at `http://localhost:8080` with caching disabled, so service worker changes are picked up on reload. Service workers require `localhost` or HTTPS — `http-server` on localhost satisfies this for local testing.

To test offline behavior: open the app, load it once, then use your browser's DevTools → Network → "Offline" toggle (or Application → Service Workers → "Offline") and reload.

## Icons & assets

`icons/` currently ships placeholder PNGs. Replace them with real Al Gurg-branded assets: `icon-192.png`, `icon-512.png` (maskable), `apple-touch-icon.png`, `favicon.ico`, and `og-image.png` for social sharing previews.

## Known stubs to complete before production

- [ ] `/api/clickup/*` backend proxy holding the ClickUp API token
- [ ] Real cached KB content for GE iFIX, Wonderware, and Siemens TIA Portal V21
- [ ] Push notification backend (VAPID keys, subscription storage)
- [ ] Operator auth/session (currently `operatorId` is hardcoded in `js/app.js`)
- [ ] Final branded icon and `og-image.png` assets
