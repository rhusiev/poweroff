// Bump with every release: activate deletes the old cache, including earlier builds' hashed assets.
const CACHE_NAME = 'poweroff-v9';

const SHELL = [
  '/',
  '/favicon.svg',
  '/favicon.ico',
  '/favicon-96x96.png',
  '/apple-touch-icon.png',
  '/web-app-manifest-192x192.png',
  '/web-app-manifest-512x512.png',
  '/icon-maskable.svg',
  '/manifest.json',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(SHELL.map((url) => new Request(url, { cache: 'reload' }))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((names) => Promise.all(names.filter((name) => name !== CACHE_NAME).map((name) => caches.delete(name))))
      .then(() => self.clients.claim()),
  );
});

/** Store only complete same-origin answers; an error page must never be replayed. */
async function store(key, response) {
  if (!response.ok || response.type !== 'basic') return;
  try {
    const cache = await caches.open(CACHE_NAME);
    await cache.put(key, response);
  } catch {
    // Quota or a closed cache: the next online visit fills it again.
  }
}

/** Fresh when online, the last good copy when offline. */
async function networkFirst(event, key) {
  try {
    const response = await fetch(event.request);
    event.waitUntil(store(key, response.clone()));
    return response;
  } catch (error) {
    const cached = await caches.match(key);
    if (cached) return cached;
    throw error;
  }
}

/** Hashed build files never change, so a cached copy is always right. */
async function cacheFirst(event) {
  const cached = await caches.match(event.request);
  if (cached) return cached;
  const response = await fetch(event.request);
  event.waitUntil(store(event.request, response.clone()));
  return response;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  // Map tiles, the geocoder and the operator API go straight to the network.
  // Live data is never answered from this cache; the app keeps its own dated copy.
  if (request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api-proxy') || url.pathname === '/gpv') return;

  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(event, '/'));
  } else if (url.pathname.startsWith('/assets/')) {
    event.respondWith(cacheFirst(event));
  } else {
    event.respondWith(networkFirst(event, request));
  }
});
