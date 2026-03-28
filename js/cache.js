// © 2026 Jawad El Barkaoui — Tous droits réservés
// PRISME — Outil d'analyse BI pour distribution B2B
// Développé sur initiative et temps personnel
// Contact : Jawad EL BARKAOUI
// ═══════════════════════════════════════════════════════════════
// PRISME — cache.js
// Persistance :
//   - localStorage : préférences utilisateur seulement (< 1 Ko)
//   - IndexedDB    : session complète parsée (10-30 Mo)
// Dépend de : state.js (variables globales)
// ═══════════════════════════════════════════════════════════════
'use strict';
import { _S } from './state.js';


const CACHE_KEY      = 'PRISME_PREFS';
const CACHE_KEY_OLD  = 'PRISME_CACHE_OLD'; // ancienne clé volumineuse — purgée au démarrage
const EXCL_KEY       = 'PRISME_EXCLUSIONS';

// Version du cache IndexedDB — incrémenter à chaque ajout de structure V3+
// Toute session stockée avec une version différente est purgée automatiquement.
const CACHE_VERSION  = 'v3.1';

// Purger les anciennes clés volumineuses / migration PILOT → PRISME
(function _migrateLS() {
  // Purge ancienne clé volumineuse
  try { localStorage.removeItem('PILOT_CACHE'); } catch (_) {}
  try { localStorage.removeItem(CACHE_KEY_OLD); } catch (_) {}
  // Migrer PILOT_PREFS → PRISME_PREFS
  try {
    const old = localStorage.getItem('PILOT_PREFS');
    if (old !== null && localStorage.getItem(CACHE_KEY) === null) {
      localStorage.setItem(CACHE_KEY, old);
      console.log('[PRISME] Migration localStorage : PILOT_PREFS → PRISME_PREFS');
    }
    localStorage.removeItem('PILOT_PREFS');
  } catch (_) {}
  // Migrer PILOT_EXCLUSIONS → PRISME_EXCLUSIONS
  try {
    const old = localStorage.getItem('PILOT_EXCLUSIONS');
    if (old !== null && localStorage.getItem(EXCL_KEY) === null) {
      localStorage.setItem(EXCL_KEY, old);
      console.log('[PRISME] Migration localStorage : PILOT_EXCLUSIONS → PRISME_EXCLUSIONS');
    }
    localStorage.removeItem('PILOT_EXCLUSIONS');
  } catch (_) {}
})();

// ── localStorage : préférences (< 1 Ko) ───────────────────────
export function _saveToCache() {
  try {
    const prefs = {
      version: '2.0',
      timestamp: Date.now(),
      selectedMyStore:    _S.selectedMyStore,
      selectedObsCompare: _S.selectedObsCompare,
      obsFilterUnivers:   _S.obsFilterUnivers,
      periodFilterStart:  _S.periodFilterStart ? _S.periodFilterStart.getTime() : null,
      periodFilterEnd:    _S.periodFilterEnd   ? _S.periodFilterEnd.getTime()   : null,
    };
    localStorage.setItem(CACHE_KEY, JSON.stringify(prefs));
  } catch (e) {
    console.warn('[PRISME] sauvegarde préférences échouée :', e.message);
  }
}

// ── Restauration des préférences ──────────────────────────────
// Toujours retourne false : aucune donnée volumineuse stockée.
// Utilisé en fallback si IndexedDB n'est pas disponible.
export function _restoreFromCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return false;
    const prefs = JSON.parse(raw);
    if (!prefs || prefs.version !== '2.0') {
      localStorage.removeItem(CACHE_KEY);
      return false;
    }
    if (prefs.selectedMyStore)    _S.selectedMyStore    = prefs.selectedMyStore;
    if (prefs.selectedObsCompare) _S.selectedObsCompare = prefs.selectedObsCompare;
    if (prefs.obsFilterUnivers)   _S.obsFilterUnivers   = prefs.obsFilterUnivers;
    if (prefs.periodFilterStart)  _S.periodFilterStart  = new Date(prefs.periodFilterStart);
    if (prefs.periodFilterEnd)    _S.periodFilterEnd    = new Date(prefs.periodFilterEnd);
    console.log('[PRISME] préférences restaurées (agence :', prefs.selectedMyStore || '—', ')');
  } catch (e) {
    console.warn('[PRISME] restauration préférences échouée :', e);
    localStorage.removeItem(CACHE_KEY);
  }
  return false;
}

// ── Effacer les préférences localStorage ──────────────────────
export function _clearCache() {
  localStorage.removeItem(CACHE_KEY);
  _S.selectedMyStore    = '';
  _S.selectedObsCompare = 'median';
  _S.obsFilterUnivers   = '';
  _S.periodFilterStart  = null;
  _S.periodFilterEnd    = null;
  const b = document.getElementById('cacheBanner');
  if (b) b.classList.add('hidden');
  const iz = document.getElementById('importZone');
  if (iz) iz.classList.remove('hidden');
  const ob = document.getElementById('onboardingBlock');
  if (ob) ob.classList.remove('hidden');
  if (!_S.finalData.length) {
    document.getElementById('tabsContainer')?.classList.add('hidden');
    document.getElementById('globalFilters')?.classList.add('hidden');
    document.getElementById('navReportingBtn')?.classList.add('hidden');
    document.getElementById('navStore')?.classList.add('hidden');
    document.body.classList.remove('pilot-loaded'); // classe CSS interne, non renommée
    document.getElementById('insightsBanner')?.classList.add('hidden');
  }
}

// ── Bandeau "cache mis à jour — rechargez vos fichiers" ───────
// Affiché quand la version IndexedDB ne correspond plus à CACHE_VERSION.
export function _showCacheUpdateBanner() {
  const banner = document.getElementById('cacheBanner');
  if (!banner) return;
  const btnStyle = 'padding:2px 10px;border-radius:4px;background:#1e293b;color:rgba(255,255,255,0.7);font-size:var(--fs-xs);cursor:pointer;border:1px solid rgba(255,255,255,0.15)';
  banner.innerHTML =
    `<span>🔄 Cache mis à jour — rechargez vos fichiers pour bénéficier des nouvelles fonctionnalités.</span>` +
    `<div style="display:flex;gap:6px">` +
    `<button onclick="document.getElementById('cacheBanner').classList.add('hidden')" style="${btnStyle}">OK</button>` +
    `</div>`;
  banner.classList.remove('hidden');
}

// ── Bandeau "données restaurées depuis IndexedDB" ─────────────
let _idbTimestamp = null; // renseigné par _restoreSessionFromIDB()

export function _showCacheBanner() {
  const banner = document.getElementById('cacheBanner');
  if (!banner) return;
  const dateStr = _idbTimestamp
    ? new Date(_idbTimestamp).toLocaleString('fr', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    : '—';
  const nArt = _S.finalData.length.toLocaleString('fr');
  const store = _S.selectedMyStore || '—';
  const btnStyle = 'padding:2px 10px;border-radius:4px;background:#1e293b;color:rgba(255,255,255,0.7);font-size:var(--fs-xs);cursor:pointer;border:1px solid rgba(255,255,255,0.15)';
  const btnDanger = 'padding:2px 10px;border-radius:4px;background:#7f1d1d;color:#fca5a5;font-size:var(--fs-xs);cursor:pointer;border:1px solid rgba(255,255,255,0.1)';
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
export function _onReloadFiles() {
  document.getElementById('cacheBanner').classList.add('hidden');
  document.getElementById('importZone')?.classList.remove('hidden');
  document.getElementById('onboardingBlock')?.classList.remove('hidden');
  if (_S.finalData.length > 0) {
    const btn = document.getElementById('importZoneCancelBtn');
    if (btn) { btn.classList.remove('hidden'); btn.style.display = 'flex'; }
  }
}

// Purger IndexedDB + préférences localStorage + reload
export async function _onPurgeCache() {
  await _clearIDB();
  _clearCache();
  localStorage.removeItem('prisme_selectedStore');
  location.reload();
}

// ── Exclusions clients (persistance permanente, sans TTL) ─────
export function _saveExclusions() {
  try {
    const data = {};
    for (const [k, v] of _S.excludedClients.entries()) {
      const { clientData, ...rest } = v;
      data[k] = rest;
    }
    localStorage.setItem(EXCL_KEY, JSON.stringify(data));
  } catch (e) {
    console.warn('Exclusions save failed :', e.message);
  }
}

export function _restoreExclusions() {
  try {
    const raw = localStorage.getItem(EXCL_KEY);
    if (!raw) return;
    const data = JSON.parse(raw);
    for (const [k, v] of Object.entries(data)) {
      if (k && v) _S.excludedClients.set(k, v);
    }
  } catch (e) {
    console.warn('Exclusions restore failed :', e);
  }
}

// ═══════════════════════════════════════════════════════════════
// IndexedDB — session complète parsée
// ═══════════════════════════════════════════════════════════════

const IDB_NAME    = 'PRISME';
const IDB_VERSION = 1;
const IDB_STORE   = 'session';

export function _openDB() {
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
export async function _saveSessionToIDB() {
  try {
    const db = await _openDB();
    const tx = db.transaction(IDB_STORE, 'readwrite');
    const st = tx.objectStore(IDB_STORE);
    const payload = {
      version: CACHE_VERSION,
      timestamp: Date.now(),
      // ── Core ──
      finalData:             _S.finalData,
      ventesParMagasin:      _S.ventesParMagasin,
      stockParMagasin:       _S.stockParMagasin,
      storesIntersection:    [..._S.storesIntersection],
      libelleLookup:         _S.libelleLookup,
      articleFamille:        _S.articleFamille,
      articleUnivers:        _S.articleUnivers,
      ventesAnalysis:        _S.ventesAnalysis,
      blConsommeKeys:        [..._S.blConsommeSet],
      cockpitLists:          _serializeCockpitLists(_S.cockpitLists),
      abcMatrixData:         _S.abcMatrixData,
      canalAgence:           _S.canalAgence,
      clientsMagasin:        [..._S.clientsMagasin],
      clientsMagasinFreq:    [..._S.clientsMagasinFreq],
      // ── Client data ──
      ventesClientArticle:   _serializeNestedMap(_S.ventesClientArticle),
      clientLastOrder:       [..._S.clientLastOrder].map(([k, v]) => [k, v instanceof Date ? v.getTime() : v]),
      clientNomLookup:       _S.clientNomLookup,
      ventesClientsPerStore: _serializeSetsObj(_S.ventesClientsPerStore),
      articleClients:        [..._S.articleClients].map(([k, v]) => [k, [...v]]),
      clientArticles:        [..._S.clientArticles].map(([k, v]) => [k, [...v]]),
      // ── Vue commerciale (V3) — Map<code, Map<canal, {ca,qteP,countBL}>> ──
      articleCanalCA:        _serializeNestedMap(_S.articleCanalCA),
      // ── Territoire ──
      territoireReady:       _S.territoireReady,
      territoireLines:       _S.territoireLines,
      terrDirectionData:     _S.terrDirectionData,
      // ── Chalandise ──
      chalandiseData:        [..._S.chalandiseData],
      chalandiseReady:       _S.chalandiseReady,
      chalandiseMetiers:     _S.chalandiseMetiers,
      // ── Périodes ──
      consommePeriodMin:     _S.consommePeriodMin     ? _S.consommePeriodMin.getTime()     : null,
      consommePeriodMax:     _S.consommePeriodMax     ? _S.consommePeriodMax.getTime()     : null,
      consommeMoisCouverts:  _S.consommeMoisCouverts,
      consommePeriodMinFull: _S.consommePeriodMinFull ? _S.consommePeriodMinFull.getTime() : null,
      consommePeriodMaxFull: _S.consommePeriodMaxFull ? _S.consommePeriodMaxFull.getTime() : null,
      globalJoursOuvres:     _S.globalJoursOuvres,
      // ── Compteurs agences (non dérivables fiablement post-restore) ──
      storeCountConsomme:    _S.storeCountConsomme,
      storeCountStock:       _S.storeCountStock,
      // ── Préférences ──
      selectedMyStore:       _S.selectedMyStore,
      selectedObsCompare:    _S.selectedObsCompare,
      obsFilterUnivers:      _S.obsFilterUnivers,
      periodFilterStart:     _S.periodFilterStart ? _S.periodFilterStart.getTime() : null,
      periodFilterEnd:       _S.periodFilterEnd   ? _S.periodFilterEnd.getTime()   : null,
      // ── Filtres chalandise ──
      _selectedCommercial:   _S._selectedCommercial || '',
      // ── Navigation sous-onglets ──
      _clientsActiveTab:     _S._clientsActiveTab   || 'priorites',
      // ── Benchmark (cache rendu) ──
      benchLists:            _serializeBenchLists(_S.benchLists),
      // ── Moteur saisonnier (B3) ──
      seasonalIndex:         _S.seasonalIndex,
      articleMonthlySales:   _S.articleMonthlySales,
      // ── Client aggregation Worker (B1) ──
      clientFamCA:           _S.clientFamCA,
      metierFamBench:        _S.metierFamBench,
      // ── Opportunité nette & reconquête (C1) ──
      opportuniteNette:      _S.opportuniteNette,
      reconquestCohort:      _S.reconquestCohort,
    };
    st.put(payload, 'current');
    await new Promise((res, rej) => { tx.oncomplete = res; tx.onerror = () => rej(tx.error); });
    db.close();
    console.log('[PRISME] session sauvegardée dans IndexedDB (' + Math.round(JSON.stringify(payload).length / 1024) + ' Ko)');
  } catch (e) {
    console.warn('[PRISME] sauvegarde IndexedDB échouée :', e.message);
  }
}

// Restauration — retourne true si succès, false sinon
export async function _restoreSessionFromIDB() {
  try {
    const db  = await _openDB();
    const tx  = db.transaction(IDB_STORE, 'readonly');
    const req = tx.objectStore(IDB_STORE).get('current');
    const data = await new Promise((res, rej) => { req.onsuccess = () => res(req.result); req.onerror = () => rej(req.error); });
    db.close();
    if (!data) return false;
    if (data.version !== CACHE_VERSION) {
      // Version obsolète : purger le cache et avertir l'utilisateur
      db.close(); await _clearIDB();
      console.log('[PRISME] version cache obsolète (' + (data.version || '?') + ' → ' + CACHE_VERSION + ') — purgée');
      _showCacheUpdateBanner();
      return false;
    }
    // TTL 30 jours : session trop ancienne → purge silencieuse
    if (data.timestamp && Date.now() - data.timestamp > 30 * 24 * 3600 * 1000) {
      db.close(); await _clearIDB();
      console.log('[PRISME] session IndexedDB expirée (> 30 j) — purgée');
      return false;
    }

    _S.finalData            = data.finalData            || [];
    _S.ventesParMagasin     = data.ventesParMagasin     || {};
    _S.stockParMagasin      = data.stockParMagasin      || {};
    _S.storesIntersection   = new Set(data.storesIntersection || []);
    _S.libelleLookup        = data.libelleLookup        || {};
    _S.articleFamille       = data.articleFamille       || {};
    _S.articleUnivers       = data.articleUnivers       || {};
    _S.ventesAnalysis       = data.ventesAnalysis       || {};
    _S.blConsommeSet        = new Set(data.blConsommeKeys || []);
    _S.cockpitLists         = _deserializeCockpitLists(data.cockpitLists || {});
    _S.abcMatrixData        = data.abcMatrixData        || {};
    _S.canalAgence          = data.canalAgence          || {};
    _S.clientsMagasin       = new Set(data.clientsMagasin || []);
    _S.clientsMagasinFreq   = new Map(data.clientsMagasinFreq || []);

    _S.ventesClientArticle   = _deserializeNestedMap(data.ventesClientArticle || []);
    _S.clientLastOrder       = new Map((data.clientLastOrder || []).map(([k, v]) => [k, v ? new Date(v) : null]));
    _S.clientNomLookup       = data.clientNomLookup       || {};
    _S.ventesClientsPerStore = _deserializeSetsObj(data.ventesClientsPerStore || {});
    _S.articleClients        = new Map((data.articleClients || []).map(([k, v]) => [k, new Set(v)]));
    _S.clientArticles        = new Map((data.clientArticles || []).map(([k, v]) => [k, new Set(v)]));

    _S.territoireReady   = data.territoireReady   || false;
    _S.territoireLines   = data.territoireLines   || [];
    _S.terrDirectionData = data.terrDirectionData || {};

    _S.chalandiseData    = new Map(data.chalandiseData || []);
    _S.chalandiseReady   = data.chalandiseReady   || false;
    _S.chalandiseMetiers = data.chalandiseMetiers || [];

    _S.consommePeriodMin     = data.consommePeriodMin     ? new Date(data.consommePeriodMin)     : null;
    _S.consommePeriodMax     = data.consommePeriodMax     ? new Date(data.consommePeriodMax)     : null;
    _S.consommeMoisCouverts  = data.consommeMoisCouverts  || 0;
    _S.consommePeriodMinFull = data.consommePeriodMinFull ? new Date(data.consommePeriodMinFull) : null;
    _S.consommePeriodMaxFull = data.consommePeriodMaxFull ? new Date(data.consommePeriodMaxFull) : null;
    _S.globalJoursOuvres     = data.globalJoursOuvres     || 250;

    _S.storeCountConsomme = data.storeCountConsomme || 0;
    _S.storeCountStock    = data.storeCountStock    || 0;
    _S.selectedMyStore    = data.selectedMyStore    || '';
    _S.selectedObsCompare = data.selectedObsCompare || 'median';
    _S.obsFilterUnivers   = data.obsFilterUnivers   || '';
    _S.periodFilterStart  = data.periodFilterStart  ? new Date(data.periodFilterStart)  : null;
    _S.periodFilterEnd    = data.periodFilterEnd    ? new Date(data.periodFilterEnd)    : null;

    _S.benchLists = _deserializeBenchLists(data.benchLists || {});

    // ── Vue commerciale (V3) — Map<code, Map<canal, {ca,qteP,countBL}>> ──
    _S.articleCanalCA = _deserializeNestedMap(data.articleCanalCA || []);

    // ── Moteur saisonnier (B3) ──
    _S.seasonalIndex       = data.seasonalIndex       || {};
    _S.articleMonthlySales = data.articleMonthlySales || {};

    // ── Client aggregation Worker (B1) ──
    _S.clientFamCA     = data.clientFamCA     || {};
    _S.metierFamBench  = data.metierFamBench  || {};

    // ── Filtres chalandise ──
    if (data._selectedCommercial !== undefined) _S._selectedCommercial = data._selectedCommercial;
    // ── Navigation sous-onglets ──
    if (data._clientsActiveTab)  _S._clientsActiveTab  = data._clientsActiveTab;

    // ── Opportunité nette & reconquête (C1) ──
    _S.opportuniteNette  = data.opportuniteNette  || [];
    _S.reconquestCohort  = data.reconquestCohort  || [];

    _idbTimestamp = data.timestamp;
    console.log('[PRISME] session restaurée depuis IndexedDB (' + _S.finalData.length + ' articles, ' + new Date(data.timestamp).toLocaleString('fr') + ')');
    return true;
  } catch (e) {
    console.warn('[PRISME] restauration IndexedDB échouée :', e);
    return false;
  }
}

// Vider le store IndexedDB
export async function _clearIDB() {
  try {
    const db = await _openDB();
    const tx = db.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).clear();
    await new Promise((res, rej) => { tx.oncomplete = res; tx.onerror = () => rej(tx.error); });
    db.close();
  } catch (_) {}
}

// Migration transparente : PILOT_PRO (ancienne base) → PRISME
export async function _migrateIDB() {
  try {
    const req = indexedDB.open('PILOT_PRO', 1);
    let oldDb = null;
    try {
      oldDb = await new Promise((res, rej) => {
        req.onsuccess = () => res(req.result);
        req.onerror  = () => res(null);
        // Si la base n'existe pas, onupgradeneeded se déclenche (version 0→1) → on ferme et ignore
        req.onupgradeneeded = () => { req.result.close(); res(null); };
      });
    } catch (_) {}
    if (!oldDb) return;
    let data = null;
    try {
      if (oldDb.objectStoreNames.contains('session')) {
        const tx  = oldDb.transaction('session', 'readonly');
        const rq  = tx.objectStore('session').get('current');
        data = await new Promise((res) => { rq.onsuccess = () => res(rq.result); rq.onerror = () => res(null); });
      }
    } catch (_) {}
    oldDb.close();
    if (data) {
      const newDb = await _openDB();
      const tx2   = newDb.transaction(IDB_STORE, 'readwrite');
      tx2.objectStore(IDB_STORE).put(data, 'current');
      await new Promise((res, rej) => { tx2.oncomplete = res; tx2.onerror = () => rej(tx2.error); });
      newDb.close();
      console.log('[PRISME] Migration IndexedDB PILOT_PRO → PRISME effectuée');
    }
    // Supprimer l'ancienne base
    try { indexedDB.deleteDatabase('PILOT_PRO'); } catch (_) {}
  } catch (e) {
    console.warn('[PRISME] Migration IndexedDB non bloquante :', e.message || e);
  }
}

// ── Helpers sérialisation Set / Map ───────────────────────────

export function _serializeCockpitLists(cl) {
  const out = {};
  for (const [k, v] of Object.entries(cl)) out[k] = v instanceof Set ? [...v] : v;
  return out;
}

export function _deserializeCockpitLists(cl) {
  const setKeys = new Set(['ruptures', 'fantomes', 'anomalies', 'saso', 'dormants', 'fins', 'top20', 'nouveautes', 'colisrayon']);
  const out = {};
  for (const [k, v] of Object.entries(cl)) out[k] = (setKeys.has(k) && Array.isArray(v)) ? new Set(v) : v;
  return out;
}

// Map<string, Map<string, obj>> ↔ array de [key, array de [key, obj]]
export function _serializeNestedMap(m) {
  return [...m].map(([k, inner]) => [k, [...inner]]);
}
export function _deserializeNestedMap(arr) {
  return new Map(arr.map(([k, inner]) => [k, new Map(inner)]));
}

// { store: Set<code> } ↔ { store: [...codes] }
export function _serializeSetsObj(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj)) out[k] = v instanceof Set ? [...v] : v;
  return out;
}
export function _deserializeSetsObj(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj)) out[k] = Array.isArray(v) ? new Set(v) : v;
  return out;
}

// _S.benchLists ne contient pas de Sets actuellement
export function _serializeBenchLists(bl) { return { ...bl }; }
export function _deserializeBenchLists(bl) { return bl || { missed: [], under: [], over: [], storePerf: {}, familyPerf: [], obsKpis: null, obsFamiliesLose: [], obsFamiliesWin: [], obsActionPlan: [], pepites: [], pepitesOther: [] }; }
