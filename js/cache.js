// ═══════════════════════════════════════════════════════════════
// PILOT PRO — cache.js
// Persistance :
//   - localStorage : préférences utilisateur seulement (< 1 Ko)
//   - IndexedDB    : session complète parsée (10-30 Mo)
// Dépend de : state.js (variables globales)
// ═══════════════════════════════════════════════════════════════
'use strict';

const CACHE_KEY      = 'PILOT_PREFS';
const CACHE_KEY_OLD  = 'PILOT_CACHE';   // ancienne clé volumineuse — purgée au démarrage
const EXCL_KEY       = 'PILOT_EXCLUSIONS';

// Purger l'ancien cache volumineux (pouvait atteindre 15 Mo)
try { localStorage.removeItem(CACHE_KEY_OLD); } catch (_) {}

// ── localStorage : préférences (< 1 Ko) ───────────────────────
function _saveToCache() {
  try {
    const prefs = {
      version: '2.0',
      timestamp: Date.now(),
      selectedMyStore,
      selectedObsCompare,
      obsFilterUnivers,
      periodFilterStart: periodFilterStart ? periodFilterStart.getTime() : null,
      periodFilterEnd:   periodFilterEnd   ? periodFilterEnd.getTime()   : null,
    };
    localStorage.setItem(CACHE_KEY, JSON.stringify(prefs));
  } catch (e) {
    console.warn('PILOT: sauvegarde préférences échouée :', e.message);
  }
}

// ── Restauration des préférences ──────────────────────────────
// Toujours retourne false : aucune donnée volumineuse stockée.
// Utilisé en fallback si IndexedDB n'est pas disponible.
function _restoreFromCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return false;
    const prefs = JSON.parse(raw);
    if (!prefs || prefs.version !== '2.0') {
      localStorage.removeItem(CACHE_KEY);
      return false;
    }
    if (prefs.selectedMyStore)    selectedMyStore    = prefs.selectedMyStore;
    if (prefs.selectedObsCompare) selectedObsCompare = prefs.selectedObsCompare;
    if (prefs.obsFilterUnivers)   obsFilterUnivers   = prefs.obsFilterUnivers;
    if (prefs.periodFilterStart)  periodFilterStart  = new Date(prefs.periodFilterStart);
    if (prefs.periodFilterEnd)    periodFilterEnd    = new Date(prefs.periodFilterEnd);
    console.log('PILOT: préférences restaurées (agence :', prefs.selectedMyStore || '—', ')');
  } catch (e) {
    console.warn('PILOT: restauration préférences échouée :', e);
    localStorage.removeItem(CACHE_KEY);
  }
  return false;
}

// ── Effacer les préférences localStorage ──────────────────────
function _clearCache() {
  localStorage.removeItem(CACHE_KEY);
  selectedMyStore    = '';
  selectedObsCompare = 'median';
  obsFilterUnivers   = '';
  periodFilterStart  = null;
  periodFilterEnd    = null;
  const b = document.getElementById('cacheBanner');
  if (b) b.classList.add('hidden');
  const iz = document.getElementById('importZone');
  if (iz) iz.classList.remove('hidden');
  const ob = document.getElementById('onboardingBlock');
  if (ob) ob.classList.remove('hidden');
  if (!finalData.length) {
    document.getElementById('tabsContainer')?.classList.add('hidden');
    document.getElementById('globalFilters')?.classList.add('hidden');
    document.getElementById('navReportingBtn')?.classList.add('hidden');
    document.getElementById('navStore')?.classList.add('hidden');
    document.body.classList.remove('pilot-loaded');
    document.getElementById('insightsBanner')?.classList.add('hidden');
  }
}

// ── Bandeau "données restaurées depuis IndexedDB" ─────────────
let _idbTimestamp = null; // renseigné par _restoreSessionFromIDB()

function _showCacheBanner() {
  const banner = document.getElementById('cacheBanner');
  if (!banner) return;
  const dateStr = _idbTimestamp
    ? new Date(_idbTimestamp).toLocaleString('fr', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    : '—';
  const nArt = finalData.length.toLocaleString('fr');
  const store = selectedMyStore || '—';
  const btnStyle = 'padding:2px 10px;border-radius:4px;background:#1e293b;color:rgba(255,255,255,0.7);font-size:10px;cursor:pointer;border:1px solid rgba(255,255,255,0.15)';
  const btnDanger = 'padding:2px 10px;border-radius:4px;background:#7f1d1d;color:#fca5a5;font-size:10px;cursor:pointer;border:1px solid rgba(255,255,255,0.1)';
  banner.innerHTML =
    `<span>📂 Données restaurées du ${dateStr} · ${nArt} articles · Agence ${store}</span>` +
    `<div style="display:flex;gap:6px">` +
    `<button onclick="document.getElementById('cacheBanner').classList.add('hidden')" style="${btnStyle}">Continuer</button>` +
    `<button onclick="_onReloadFiles()" style="${btnStyle}">Recharger les fichiers</button>` +
    `<button onclick="_onPurgeCache()" style="${btnDanger}">Purger le cache</button>` +
    `</div>`;
  banner.classList.remove('hidden');
}

// Afficher la zone d'import sans purger les données (l'utilisateur veut re-uploader)
function _onReloadFiles() {
  document.getElementById('cacheBanner').classList.add('hidden');
  document.getElementById('importZone')?.classList.remove('hidden');
  document.getElementById('onboardingBlock')?.classList.remove('hidden');
  if (finalData.length > 0) {
    const btn = document.getElementById('importZoneCancelBtn');
    if (btn) { btn.classList.remove('hidden'); btn.style.display = 'flex'; }
  }
}

// Purger IndexedDB + préférences localStorage + reload
async function _onPurgeCache() {
  await _clearIDB();
  _clearCache();
  location.reload();
}

// ── Exclusions clients (persistance permanente, sans TTL) ─────
function _saveExclusions() {
  try {
    const data = {};
    for (const [k, v] of excludedClients.entries()) {
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

// ═══════════════════════════════════════════════════════════════
// IndexedDB — session complète parsée
// ═══════════════════════════════════════════════════════════════

const IDB_NAME    = 'PILOT_PRO';
const IDB_VERSION = 1;
const IDB_STORE   = 'session';

function _openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, IDB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) db.createObjectStore(IDB_STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror  = () => reject(req.error);
  });
}

// Sauvegarde complète — appelé de façon non bloquante (sans await dans le flux principal)
async function _saveSessionToIDB() {
  try {
    const db = await _openDB();
    const tx = db.transaction(IDB_STORE, 'readwrite');
    const st = tx.objectStore(IDB_STORE);
    const payload = {
      version: '3.0',
      timestamp: Date.now(),
      // ── Core ──
      finalData,
      ventesParMagasin,
      stockParMagasin,
      storesIntersection: [...storesIntersection],
      libelleLookup,
      articleFamille,
      articleUnivers,
      ventesAnalysis,
      blConsommeKeys:  [...blConsommeSet],
      cockpitLists:    _serializeCockpitLists(cockpitLists),
      abcMatrixData,
      canalAgence,
      clientsMagasin:  [...clientsMagasin],
      // ── Client data ──
      ventesClientArticle:  _serializeNestedMap(ventesClientArticle),
      clientLastOrder:      [...clientLastOrder].map(([k, v]) => [k, v instanceof Date ? v.getTime() : v]),
      clientNomLookup,
      ventesClientsPerStore: _serializeSetsObj(ventesClientsPerStore),
      articleClients:       [...articleClients].map(([k, v]) => [k, [...v]]),
      clientArticles:       [...clientArticles].map(([k, v]) => [k, [...v]]),
      // ── Territoire ──
      territoireReady,
      territoireLines,
      terrDirectionData,
      // ── Chalandise ──
      chalandiseData:    [...chalandiseData],
      chalandiseReady,
      chalandiseMetiers,
      // ── Périodes ──
      consommePeriodMin:     consommePeriodMin     ? consommePeriodMin.getTime()     : null,
      consommePeriodMax:     consommePeriodMax     ? consommePeriodMax.getTime()     : null,
      consommeMoisCouverts,
      consommePeriodMinFull: consommePeriodMinFull ? consommePeriodMinFull.getTime() : null,
      consommePeriodMaxFull: consommePeriodMaxFull ? consommePeriodMaxFull.getTime() : null,
      globalJoursOuvres,
      // ── Préférences ──
      selectedMyStore,
      selectedObsCompare,
      obsFilterUnivers,
      periodFilterStart: periodFilterStart ? periodFilterStart.getTime() : null,
      periodFilterEnd:   periodFilterEnd   ? periodFilterEnd.getTime()   : null,
      // ── Benchmark (cache rendu) ──
      benchLists: _serializeBenchLists(benchLists),
    };
    st.put(payload, 'current');
    await new Promise((res, rej) => { tx.oncomplete = res; tx.onerror = () => rej(tx.error); });
    db.close();
    console.log('PILOT: session sauvegardée dans IndexedDB (' + Math.round(JSON.stringify(payload).length / 1024) + ' Ko)');
  } catch (e) {
    console.warn('PILOT: sauvegarde IndexedDB échouée :', e.message);
  }
}

// Restauration — retourne true si succès, false sinon
async function _restoreSessionFromIDB() {
  try {
    const db  = await _openDB();
    const tx  = db.transaction(IDB_STORE, 'readonly');
    const req = tx.objectStore(IDB_STORE).get('current');
    const data = await new Promise((res, rej) => { req.onsuccess = () => res(req.result); req.onerror = () => rej(req.error); });
    db.close();
    if (!data || data.version !== '3.0') return false;

    finalData            = data.finalData            || [];
    ventesParMagasin     = data.ventesParMagasin     || {};
    stockParMagasin      = data.stockParMagasin      || {};
    storesIntersection   = new Set(data.storesIntersection || []);
    libelleLookup        = data.libelleLookup        || {};
    articleFamille       = data.articleFamille       || {};
    articleUnivers       = data.articleUnivers       || {};
    ventesAnalysis       = data.ventesAnalysis       || {};
    blConsommeSet        = new Set(data.blConsommeKeys || []);
    cockpitLists         = _deserializeCockpitLists(data.cockpitLists || {});
    abcMatrixData        = data.abcMatrixData        || {};
    canalAgence          = data.canalAgence          || {};
    clientsMagasin       = new Set(data.clientsMagasin || []);

    ventesClientArticle   = _deserializeNestedMap(data.ventesClientArticle || []);
    clientLastOrder       = new Map((data.clientLastOrder || []).map(([k, v]) => [k, v ? new Date(v) : null]));
    clientNomLookup       = data.clientNomLookup       || {};
    ventesClientsPerStore = _deserializeSetsObj(data.ventesClientsPerStore || {});
    articleClients        = new Map((data.articleClients || []).map(([k, v]) => [k, new Set(v)]));
    clientArticles        = new Map((data.clientArticles || []).map(([k, v]) => [k, new Set(v)]));

    territoireReady   = data.territoireReady   || false;
    territoireLines   = data.territoireLines   || [];
    terrDirectionData = data.terrDirectionData || {};

    chalandiseData    = new Map(data.chalandiseData || []);
    chalandiseReady   = data.chalandiseReady   || false;
    chalandiseMetiers = data.chalandiseMetiers || [];

    consommePeriodMin     = data.consommePeriodMin     ? new Date(data.consommePeriodMin)     : null;
    consommePeriodMax     = data.consommePeriodMax     ? new Date(data.consommePeriodMax)     : null;
    consommeMoisCouverts  = data.consommeMoisCouverts  || 0;
    consommePeriodMinFull = data.consommePeriodMinFull ? new Date(data.consommePeriodMinFull) : null;
    consommePeriodMaxFull = data.consommePeriodMaxFull ? new Date(data.consommePeriodMaxFull) : null;
    globalJoursOuvres     = data.globalJoursOuvres     || 250;

    selectedMyStore    = data.selectedMyStore    || '';
    selectedObsCompare = data.selectedObsCompare || 'median';
    obsFilterUnivers   = data.obsFilterUnivers   || '';
    periodFilterStart  = data.periodFilterStart  ? new Date(data.periodFilterStart)  : null;
    periodFilterEnd    = data.periodFilterEnd    ? new Date(data.periodFilterEnd)    : null;

    benchLists = _deserializeBenchLists(data.benchLists || {});

    _idbTimestamp = data.timestamp;
    console.log('PILOT: session restaurée depuis IndexedDB (' + finalData.length + ' articles, ' + new Date(data.timestamp).toLocaleString('fr') + ')');
    return true;
  } catch (e) {
    console.warn('PILOT: restauration IndexedDB échouée :', e);
    return false;
  }
}

// Vider le store IndexedDB
async function _clearIDB() {
  try {
    const db = await _openDB();
    const tx = db.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).clear();
    await new Promise((res, rej) => { tx.oncomplete = res; tx.onerror = () => rej(tx.error); });
    db.close();
  } catch (_) {}
}

// ── Helpers sérialisation Set / Map ───────────────────────────

function _serializeCockpitLists(cl) {
  const out = {};
  for (const [k, v] of Object.entries(cl)) out[k] = v instanceof Set ? [...v] : v;
  return out;
}

function _deserializeCockpitLists(cl) {
  const setKeys = new Set(['ruptures', 'fantomes', 'anomalies', 'saso', 'dormants', 'fins', 'top20', 'nouveautes', 'colisrayon']);
  const out = {};
  for (const [k, v] of Object.entries(cl)) out[k] = (setKeys.has(k) && Array.isArray(v)) ? new Set(v) : v;
  return out;
}

// Map<string, Map<string, obj>> ↔ array de [key, array de [key, obj]]
function _serializeNestedMap(m) {
  return [...m].map(([k, inner]) => [k, [...inner]]);
}
function _deserializeNestedMap(arr) {
  return new Map(arr.map(([k, inner]) => [k, new Map(inner)]));
}

// { store: Set<code> } ↔ { store: [...codes] }
function _serializeSetsObj(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj)) out[k] = v instanceof Set ? [...v] : v;
  return out;
}
function _deserializeSetsObj(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj)) out[k] = Array.isArray(v) ? new Set(v) : v;
  return out;
}

// benchLists ne contient pas de Sets actuellement
function _serializeBenchLists(bl) { return { ...bl }; }
function _deserializeBenchLists(bl) { return bl || { missed: [], under: [], over: [], storePerf: {}, familyPerf: [], obsKpis: null, obsFamiliesLose: [], obsFamiliesWin: [], obsActionPlan: [] }; }
