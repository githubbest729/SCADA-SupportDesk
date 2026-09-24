/* ==========================================================================
   AGAC Enterprise SupportDesk — Service Worker
   ========================================================================== */

const KB_CACHE = "agac-kb-v1";
const SHELL_CACHE = "agac-shell-v2";

// Cleaned asset list: removed non-existent files to prevent 404 install crashes
const SHELL_ASSETS = [
  "/index.html", 
  "/css/style.css", 
  "/js/app.js", 
  "/js/db.js", 
  "/manifest.json"
];

// 1. Install & Cache Shell Assets
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => cache.addAll(SHELL_ASSETS))
  );
  self.skipWaiting();
});

// 2. Activate & Clean Old Caches
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => ![KB_CACHE, SHELL_CACHE].includes(k))
          .map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

// Helper for Knowledge Base caching
function isKbRequest(url) {
  return url.pathname.startsWith("/kb/");
}

// 3. Unified Fetch Router (Handles KB, Navigation, and Cache Fallbacks)
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Skip cross-origin requests (like Google Apps Script webhooks)
  if (url.origin !== location.origin) {
    return;
  }

  // Stale-while-revalidate for knowledge-base manuals
  if (isKbRequest(url)) {
    event.respondWith(
      caches.open(KB_CACHE).then(async (cache) => {
        const cached = await cache.match(event.request);
        const network = fetch(event.request)
          .then((response) => {
            if (response.ok) cache.put(event.request, response.clone());
            return response;
          })
          .catch(() => cached);
        return cached || network;
      })
    );
    return;
  }

  // Navigation requests (HTML pages)
  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request).catch(() =>
        caches.match("/index.html")
      )
    );
    return;
  }

  // Default: Cache first, falling back to network
  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  );
});

// 4. Background Sync for Offline Queue
self.addEventListener("sync", (event) => {
  if (event.tag === "sync-ticket-queue") {
    event.waitUntil(flushTicketQueue());
  }
});

async function flushTicketQueue() {
  const clients = await self.clients.matchAll();
  for (const client of clients) {
    client.postMessage({ type: "FLUSH_TICKET_QUEUE" });
  }
}

// 5. Push Notifications
self.addEventListener("push", (event) => {
  const data = event.data ? event.data.json() : {};
  const title = data.title || "SCADA Alarm Escalation";
  const options = {
    body: data.body || "A high-priority alarm requires attention.",
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    tag: data.ticketId ? `ticket-${data.ticketId}` : "agac-alert",
    requireInteraction: data.priority === "critical",
    data: { url: data.url || "/index.html", ticketId: data.ticketId },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: "window" }).then((clientList) => {
      const targetUrl = event.notification.data?.url || "/index.html";
      for (const client of clientList) {
        if (client.url.includes(targetUrl) && "focus" in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(targetUrl);
    })
  );
});
