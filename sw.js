// PWA service worker (Vercel deployment only — never registered inside the
// extension, see the guard in app.js init). Cache-first app shell keyed by
// release version; scripts/bump-version.mjs rewrites VERSION so every release
// invalidates the phone's cache.
const VERSION = '1.0.1';
const CACHE = `taskmana-${VERSION}`;
const ASSETS = [
  '/',
  '/css/style.css',
  '/js/store.js',
  '/js/model.js',
  '/js/app.js',
  '/manifest.webmanifest',
  '/icons/icon192.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return; // never intercept API calls (sync)
  const key = e.request.mode === 'navigate' ? '/' : e.request;
  e.respondWith(caches.match(key).then((hit) => hit ?? fetch(e.request)));
});
