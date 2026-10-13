// Caches only the app shell and static files. API calls (/api/*) always go to the network,
// so account data is never stored by the service worker.
const CACHE = 'pill-oh-v4';
// Registered as /sw.js?dev during `npm run dev`: push only, no caching (Vite serves changing source files).
const DEV = new URL(self.location.href).searchParams.has('dev');
const SHELL = ['/', '/theme-init.js', '/manifest.webmanifest', '/favicon.svg', '/icon-192.png'];

self.addEventListener('install', (event) => {
  if (DEV) {
    self.skipWaiting();
    return;
  }
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

const putInCache = (request, response) => {
  if (response.ok && response.type === 'basic') {
    const copy = response.clone();
    caches.open(CACHE).then((cache) => cache.put(request, copy));
  }
  return response;
};

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : '' };
  }
  event.waitUntil(
    self.registration.showNotification(data.title || 'Pill-oh', {
      body: data.body || 'You have a dose due.',
      tag: data.tag || 'pill-oh',
      renotify: true,
      requireInteraction: true,
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      vibrate: [120, 60, 120],
      data: { url: data.url || '/' },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || '/', self.location.origin);
  if (target.origin !== self.location.origin) return;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      const open = windows.find((w) => new URL(w.url).origin === self.location.origin);
      return open ? open.focus() : self.clients.openWindow(target.href);
    }),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (DEV || request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;

  if (request.mode === 'navigate') {
    // Network first so updates show up right away; fall back to the cached shell when offline.
    event.respondWith(
      fetch(request)
        .then((res) => putInCache('/', res))
        .catch(() => caches.match('/')),
    );
    return;
  }

  if (url.pathname.startsWith('/assets/')) {
    // Hashed build files never change, so the cached copy is always correct.
    event.respondWith(caches.match(request).then((hit) => hit || fetch(request).then((res) => putInCache(request, res))));
    return;
  }

  event.respondWith(
    caches.match(request).then((hit) => {
      const fresh = fetch(request).then((res) => putInCache(request, res));
      return hit || fresh;
    }),
  );
});
