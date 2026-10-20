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
const CACHE_NAME = 'prisme-scan-v16';
const PRECACHE = ['./scan.html', './manifest.json', './js/constants.js', './data/index.json'];
const CDN_HOSTS = ['unpkg.com', 'cdn.jsdelivr.net', 'fonts.googleapis.com', 'fonts.gstatic.com'];

// Anciennes versions du Scan : enregistrées sans portée → contrôlaient TOUT le site (appli PRISME comprise).
// Un worker dont la portée n'est pas …/scan se désinstalle et laisse le réseau répondre.
const WRONG_SCOPE = !/\/scan\/?$/.test(new URL(self.registration.scope).pathname);
const NET_TIMEOUT_MS = 4000; // réseau lent en rayon : au-delà, la copie en cache répond

self.addEventListener('install', e => {
  if (WRONG_SCOPE) { self.skipWaiting(); return; }
  e.waitUntil(caches.open(CACHE_NAME).then(c => c.addAll(PRECACHE)).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  if (WRONG_SCOPE) {
    e.waitUntil(self.registration.unregister().then(() => self.clients.matchAll()).then(cs => cs.forEach(c => c.navigate(c.url))).catch(() => {}));
    return;
  }
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
  const fromCache = () => caches.match(req, { ignoreSearch: true });
  const net = fetch(req.url, { cache: 'no-cache', credentials: 'same-origin' }).then(res => {
    if (res.ok) {
      const copy = res.clone();
      caches.open(CACHE_NAME).then(c => c.put(req, copy));
      return res;
    }
    // 404 / 5xx : la dernière copie connue plutôt qu'une page d'erreur
    return fromCache().then(hit => hit || res);
  });
  // Réseau qui ne répond pas (cave, une barre) : après NET_TIMEOUT_MS, la copie en cache si elle existe
  const timeout = new Promise(resolve => setTimeout(() => fromCache().then(hit => hit && resolve(hit)), NET_TIMEOUT_MS));
  return Promise.race([net, timeout]).catch(() => fromCache().then(hit => hit || Promise.reject(new Error('hors-ligne'))));
}

self.addEventListener('fetch', e => {
  if (WRONG_SCOPE) return; // laisse passer : ce worker est en train de se désinstaller
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
