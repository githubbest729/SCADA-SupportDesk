const KB_CACHE = "agac-kb-v1";
const SHELL_CACHE = "agac-shell-v1";
const SHELL_ASSETS = ["/index.html", "/offline.html", "/css/style.css", "/js/app.js", "/js/db.js", "/js/clickup-sync.js", "/manifest.json"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(SHELL_CACHE).then((cache) => cache.addAll(SHELL_ASSETS)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => ![KB_CACHE, SHELL_CACHE].includes(k)).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Stale-while-revalidate for knowledge-base manuals (iFIX, Wonderware, TIA Portal docs)
function isKbRequest(url) {
  return url.pathname.startsWith("/kb/");
}

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

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

  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request).catch(() =>
        caches.match(event.request).then((cached) => cached || caches.match("/offline.html"))
      )
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  );
});

// Background sync: flush queued tickets from IndexedDB into ClickUp the moment connectivity returns
self.addEventListener("sync", (event) => {
  if (event.tag === "sync-ticket-queue") {
    event.waitUntil(flushTicketQueue());
  }
});

async function flushTicketQueue() {
  const clients = await self.clients.matchAll();
  // Delegate the actual IndexedDB read + ClickUp POST to the page context via clickup-sync.js,
  // since the SW has no direct import of the app's DB module here without importScripts.
  for (const client of clients) {
    client.postMessage({ type: "FLUSH_TICKET_QUEUE" });
  }
  // If no page is open, fall back to a self-contained flush using importScripts.
  if (clients.length === 0) {
    importScripts("/js/db.js", "/js/clickup-sync.js");
    await self.AgacSync.flushQueue();
  }
}

// Push notifications: high-priority SCADA alarm escalations and ticket status updates
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
