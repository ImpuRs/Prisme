// Service Worker — PRISME Scan (hors-ligne)
// Enregistré par scan.html avec scope './scan' : ne contrôle QUE les pages scan*.html
// (l'appli principale index.html n'est pas concernée).
//
// Stratégies :
//  - Librairies CDN versionnées (React, Babel, lecteurs code-barres, polices) : cache d'abord
//    — l'URL contient la version, le contenu ne change jamais.
//  - Pages et données (scan.html, data/*.json, catalogue, constants.js, config.json) : réseau
//    d'abord, copie en cache en secours — toujours la version à jour quand il y a du réseau,
//    la dernière connue sinon. Requête en `cache: 'no-cache'` : le navigateur revalide auprès
//    du serveur (ETag) au lieu de resservir sa copie HTTP (GitHub Pages : max-age 10 min).
'use strict';
const CACHE_NAME = 'prisme-scan-v11';
const PRECACHE = ['./scan.html', './manifest.json', './js/constants.js', './data/index.json'];
const CDN_HOSTS = ['unpkg.com', 'cdn.jsdelivr.net', 'fonts.googleapis.com', 'fonts.gstatic.com'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE_NAME).then(c => c.addAll(PRECACHE)).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k.startsWith('prisme-scan-') && k !== CACHE_NAME).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function cacheFirst(req) {
  return caches.match(req).then(hit => hit || fetch(req).then(res => {
    // Réponses opaques (scripts sans CORS) acceptées : l'URL est versionnée
    if (res.ok || res.type === 'opaque') {
      const copy = res.clone();
      caches.open(CACHE_NAME).then(c => c.put(req, copy));
    }
    return res;
  }));
}

function networkFirst(req) {
  return fetch(req.url, { cache: 'no-cache', credentials: 'same-origin' }).then(res => {
    if (res.ok) {
      const copy = res.clone();
      caches.open(CACHE_NAME).then(c => c.put(req, copy));
    }
    return res;
  }).catch(() => caches.match(req, { ignoreSearch: true }).then(hit => hit || Promise.reject(new Error('hors-ligne'))));
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (CDN_HOSTS.includes(url.hostname)) {
    // OCR (OpenCV / modèles Paddle, non versionnés et très lourds) : laissé au réseau
    if (url.pathname.includes('paddleocr-browser')) return;
    e.respondWith(cacheFirst(req));
    return;
  }
  if (url.origin === self.location.origin) {
    e.respondWith(networkFirst(req));
  }
  // Autres domaines (docs.opencv.org…) : comportement réseau normal
});
