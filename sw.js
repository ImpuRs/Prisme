// Service Worker — PRISME Scan (cache-first pour offline)
const CACHE_NAME = 'prisme-scan-v3';
const ASSETS = [
  './scan.html',
  './js/scan.js',
  './manifest.json',
  'https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE_NAME).then(c => c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  // Network-first pour les pages, cache-first pour les assets
  e.respondWith(
    fetch(e.request).catch(() => caches.match(e.request))
  );
});
