// ═══════════════════════════════════════════════════════════════
// PILOT PRO — cache.js
// Persistance localStorage : sauvegarde et restauration des données parsées
// Dépend de : state.js (variables globales)
// ═══════════════════════════════════════════════════════════════
'use strict';

const CACHE_KEY = 'PILOT_CACHE';
const EXCL_KEY  = 'PILOT_EXCLUSIONS';
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24h en ms
const CACHE_MAX_BYTES = 4_000_000;      // 4 Mo

// Métadonnées de la dernière restauration (pour _showCacheBanner)
let _cacheTimestamp = null;
let _cacheMissingData = []; // liste des clés trop volumineuses, droppées

// ── Sauvegarde ────────────────────────────────────────────────
function _saveToCache() {
  try {
    // Sérialiser ventesClientsPerStore (obj de Sets → obj de tableaux)
    const vcpsSerialized = {};
    for (const [sk, set] of Object.entries(ventesClientsPerStore || {})) {
      vcpsSerialized[sk] = [...set];
    }

    const cache = {
      version: '1.1',
      timestamp: Date.now(),
      selectedMyStore,
      finalData: finalData.map(r => ({ ...r })),
      ventesParMagasin,
      stockParMagasin,
      ventesClientArticle: Object.fromEntries(
        [...ventesClientArticle].map(([k, v]) => [k, Object.fromEntries([...v])])
      ),
      clientArticles: Object.fromEntries(
        [...clientArticles].map(([k, v]) => [k, [...v]])
      ),
      articleClients: Object.fromEntries(
        [...articleClients].map(([k, v]) => [k, [...v]])
      ),
      clientsMagasin: [...clientsMagasin],
      chalandiseData: chalandiseReady ? Object.fromEntries([...chalandiseData]) : null,
      storesIntersection: [...storesIntersection],
      libelleLookup,
      articleFamille,
      articleUnivers,
      chalandiseMetiers,
      consommePeriodMin:     consommePeriodMin     ? consommePeriodMin.toISOString()     : null,
      consommePeriodMax:     consommePeriodMax     ? consommePeriodMax.toISOString()     : null,
      consommePeriodMinFull: consommePeriodMinFull ? consommePeriodMinFull.toISOString() : null,
      consommePeriodMaxFull: consommePeriodMaxFull ? consommePeriodMaxFull.toISOString() : null,
      consommeMoisCouverts,
      globalJoursOuvres,
      clientNomLookup,
      clientLastOrder: Object.fromEntries(
        [...clientLastOrder].map(([k, v]) => [k, v instanceof Date ? v.toISOString() : v])
      ),
      ventesClientsPerStore: vcpsSerialized,
      blConsommeSet: [...blConsommeSet],
      _missingData: []
    };

    let json = JSON.stringify(cache);

    // Si > 4 Mo, on drop les données les plus lourdes
    if (json.length > CACHE_MAX_BYTES) {
      console.warn('PILOT cache trop volumineux (' + Math.round(json.length / 1024) + ' KB), réduction...');
      cache.ventesClientArticle = null;
      cache.clientArticles = null;
      cache.blConsommeSet = [];
      cache._missingData = ['ventesClientArticle', 'clientArticles', 'blConsommeSet'];
      json = JSON.stringify(cache);
    }

    // Deuxième passe si toujours trop volumineux
    if (json.length > CACHE_MAX_BYTES) {
      cache.stockParMagasin = {};
      cache.ventesClientsPerStore = {};
      cache._missingData.push('stockParMagasin', 'ventesClientsPerStore');
      json = JSON.stringify(cache);
    }

    localStorage.setItem(CACHE_KEY, json);
    console.log('PILOT cache sauvegardé :', Math.round(json.length / 1024), 'KB',
      cache._missingData.length ? '(données manquantes: ' + cache._missingData.join(', ') + ')' : '');
  } catch (e) {
    console.warn('Cache save failed (probablement trop volumineux) :', e.message);
  }
}

// ── Restauration ──────────────────────────────────────────────
function _restoreFromCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return false;

    const cache = JSON.parse(raw);

    // TTL 24h
    if (!cache.timestamp || Date.now() - cache.timestamp > CACHE_TTL) {
      localStorage.removeItem(CACHE_KEY);
      return false;
    }

    // Vérification minimale
    if (!cache.finalData || !Array.isArray(cache.finalData) || cache.finalData.length === 0) {
      localStorage.removeItem(CACHE_KEY);
      return false;
    }

    _cacheTimestamp = cache.timestamp;
    _cacheMissingData = cache._missingData || [];

    // ── Variables simples ──
    selectedMyStore        = cache.selectedMyStore || '';
    finalData              = cache.finalData || [];
    ventesParMagasin       = cache.ventesParMagasin || {};
    stockParMagasin        = cache.stockParMagasin || {};
    libelleLookup          = cache.libelleLookup || {};
    articleFamille         = cache.articleFamille || {};
    articleUnivers         = cache.articleUnivers || {};
    chalandiseMetiers      = cache.chalandiseMetiers || [];
    globalJoursOuvres      = cache.globalJoursOuvres || 250;
    consommeMoisCouverts   = cache.consommeMoisCouverts || 0;
    clientNomLookup        = cache.clientNomLookup || {};

    // ── Dates ──
    consommePeriodMin     = cache.consommePeriodMin     ? new Date(cache.consommePeriodMin)     : null;
    consommePeriodMax     = cache.consommePeriodMax     ? new Date(cache.consommePeriodMax)     : null;
    consommePeriodMinFull = cache.consommePeriodMinFull ? new Date(cache.consommePeriodMinFull) : null;
    consommePeriodMaxFull = cache.consommePeriodMaxFull ? new Date(cache.consommePeriodMaxFull) : null;

    // ── Sets ──
    storesIntersection = new Set(cache.storesIntersection || []);
    clientsMagasin     = new Set(cache.clientsMagasin    || []);
    blConsommeSet      = new Set(cache.blConsommeSet     || []);

    // ── Maps ──
    ventesClientArticle = cache.ventesClientArticle
      ? new Map(Object.entries(cache.ventesClientArticle).map(([k, v]) => [k, new Map(Object.entries(v))]))
      : new Map();

    clientArticles = cache.clientArticles
      ? new Map(Object.entries(cache.clientArticles).map(([k, v]) => [k, new Set(v)]))
      : new Map();

    articleClients = cache.articleClients
      ? new Map(Object.entries(cache.articleClients).map(([k, v]) => [k, new Set(v)]))
      : new Map();

    clientLastOrder = cache.clientLastOrder
      ? new Map(Object.entries(cache.clientLastOrder).map(([k, v]) => [k, v ? new Date(v) : null]))
      : new Map();

    // ventesClientsPerStore : {store: [cc,...]} → {store: Set}
    const vcps = cache.ventesClientsPerStore || {};
    ventesClientsPerStore = {};
    for (const [sk, arr] of Object.entries(vcps)) {
      ventesClientsPerStore[sk] = new Set(arr);
    }

    // ── Chalandise ──
    if (cache.chalandiseData) {
      chalandiseData  = new Map(Object.entries(cache.chalandiseData));
      chalandiseReady = true;
    } else {
      chalandiseData  = new Map();
      chalandiseReady = false;
    }

    return true;
  } catch (e) {
    console.warn('Cache restore failed :', e);
    localStorage.removeItem(CACHE_KEY);
    return false;
  }
}

// ── Exclusions clients (persistance permanente, sans TTL) ─────
function _saveExclusions() {
  try {
    const data = {};
    for (const [k, v] of excludedClients.entries()) {
      // Ne pas sauvegarder clientData (objet lourd, peut être reconstruit)
      const { clientData, ...rest } = v;
      data[k] = rest;
    }
    localStorage.setItem(EXCL_KEY, JSON.stringify(data));
  } catch (e) {
    console.warn('Exclusions save failed :', e.message);
  }
}

function _restoreExclusions() {
  try {
    const raw = localStorage.getItem(EXCL_KEY);
    if (!raw) return;
    const data = JSON.parse(raw);
    for (const [k, v] of Object.entries(data)) {
      if (k && v) excludedClients.set(k, v);
    }
  } catch (e) {
    console.warn('Exclusions restore failed :', e);
  }
}

// ── Effacer le cache principal (pas les exclusions) ───────────
function _clearCache() {
  localStorage.removeItem(CACHE_KEY);
  _cacheTimestamp = null;
  _cacheMissingData = [];
  // Cacher le bandeau cache
  const b = document.getElementById('cacheBanner');
  if (b) b.classList.add('hidden');
  // Réafficher la zone d'import et l'onboarding
  const iz = document.getElementById('importZone');
  if (iz) iz.classList.remove('hidden');
  const ob = document.getElementById('onboardingBlock');
  if (ob) ob.classList.remove('hidden');
  // Masquer les onglets et la navbar store si pas de données
  if (!finalData.length) {
    document.getElementById('tabsContainer')?.classList.add('hidden');
    document.getElementById('globalFilters')?.classList.add('hidden');
    document.getElementById('navReportingBtn')?.classList.add('hidden');
    document.getElementById('navStore')?.classList.add('hidden');
    document.body.classList.remove('pilot-loaded');
    document.getElementById('insightsBanner')?.classList.add('hidden');
  }
}

// ── Bandeau "données restaurées depuis le cache" ──────────────
function _showCacheBanner() {
  const banner = document.getElementById('cacheBanner');
  if (!banner || !_cacheTimestamp) return;

  const ageMs  = Date.now() - _cacheTimestamp;
  const ageMin = Math.round(ageMs / 60000);
  let ageStr;
  if (ageMin < 2)        ageStr = 'à l\'instant';
  else if (ageMin < 60)  ageStr = 'il y a ' + ageMin + ' min';
  else                   ageStr = 'il y a ' + Math.round(ageMin / 60) + 'h';

  let extraWarn = '';
  if (_cacheMissingData.length) {
    extraWarn = ' <span class="text-amber-300 font-bold">· Données partielles (historique clients non restauré — rechargez les fichiers pour la vue complète)</span>';
  }

  const btnStyle = 'font-size:10px;color:rgba(255,255,255,0.35);background:none;border:1px solid rgba(255,255,255,0.15);border-radius:4px;padding:1px 8px;cursor:pointer;transition:color .15s,border-color .15s';
  const btnHover = 'onmouseover="this.style.color=\'rgba(255,255,255,0.65)\';this.style.borderColor=\'rgba(255,255,255,0.3)\'" onmouseout="this.style.color=\'rgba(255,255,255,0.35)\';this.style.borderColor=\'rgba(255,255,255,0.15)\'"';
  banner.innerHTML =
    '<span>Données restaurées (' + ageStr + ').' + extraWarn + '</span>' +
    '<span style="display:flex;align-items:center;gap:6px;flex-shrink:0">' +
      `<button onclick="_clearCache();expandImportZone()" style="${btnStyle}" ${btnHover}>↻ Recharger</button>` +
      `<button onclick="document.getElementById('cacheBanner').classList.add('hidden')" style="${btnStyle}" ${btnHover}>✕</button>` +
    '</span>';

  banner.classList.remove('hidden');
}
