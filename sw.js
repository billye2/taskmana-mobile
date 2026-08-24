// PWA service worker. Cache-first app shell keyed by release version;
// scripts/bump-version.mjs rewrites VERSION so every release invalidates the
// phone's cached copy.
const VERSION = '2.3.4';
const CACHE = `taskmana-${VERSION}`;
// Every script index.html loads must be here — a missing one 404s on an
// offline cold start and the app boots into a blank page.
const ASSETS = [
  '/',
  '/index.html',
  '/css/style.css',
  '/js/store.js',
  '/js/model.js',
  '/js/config.js',
  '/js/sync.js',
  '/js/nav.js',
  '/js/ui.js',
  '/js/viewport.js',
  '/js/swipe.js',
  '/js/app.js',
  '/manifest.webmanifest',
  '/icons/icon180.png',
  '/icons/icon192.png',
  '/icons/icon512.png',
];
// js/vendor/supabase.js is deliberately absent: ~200KB, lazy-loaded, and
// offline sync is a contradiction anyway.

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches
      .open(CACHE)
      // Not addAll: it's all-or-nothing, so one bad path aborts the whole
      // install and the app is silently never offline-capable.
      .then((c) => Promise.allSettled(ASSETS.map((a) => c.add(a))))
      .then(() => self.skipWaiting())
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
  e.respondWith(
    caches.match(key).then((hit) => {
      if (hit) return hit;
      // Miss: fetch and backfill, so files added between releases become
      // available offline without waiting for a version bump.
      return fetch(e.request).then((res) => {
        if (res.ok && res.type === 'basic') {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy));
        }
        return res;
      });
    })
  );
});
