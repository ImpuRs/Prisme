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
import { buildChalandiseStore } from './chalandise-store.js';


const CACHE_KEY       = 'PRISME_PREFS';
const CACHE_KEY_OLD   = 'PRISME_CACHE_OLD'; // ancienne clé volumineuse — purgée au démarrage
const EXCL_KEY        = 'PRISME_EXCLUSIONS';
const FILE_HASHES_KEY = 'prisme_fileHashes'; // OPT 1 — hash des fichiers chargés

// OPT 1 — Hash-check fichiers (premiers 64 Ko) via SubtleCrypto SHA-1
export async function _getFileHash(file) {
  try {
    const buf = await file.slice(0, 64 * 1024).arrayBuffer();
    const hBuf = await crypto.subtle.digest('SHA-1', buf);
    const hash = Array.from(new Uint8Array(hBuf)).map(b => b.toString(16).padStart(2, '0')).join('');
    // Inclure taille + lastModified pour fiabilité (changement après 64Ko détecté)
    return hash + ':' + (file.size || 0) + ':' + (file.lastModified || 0);
  } catch (_) { return ''; }
}
// f1 peut être un File unique ou un FileList/Array (multi-consommé)
async function _hashConsommeFiles(f1) {
  if (!f1) return [];
  // FileList ou Array
  const files = f1.length !== undefined ? Array.from(f1) : [f1];
  const hashes = await Promise.all(files.map(f => _getFileHash(f)));
  return hashes.sort(); // tri pour comparaison stable quel que soit l'ordre de sélection
}
export async function _checkFilesUnchanged(f1, f2, f3 = null, f4 = null) {
  try {
    const [hC, h2, h3, h4] = await Promise.all([
      _hashConsommeFiles(f1),
      f2 ? _getFileHash(f2) : Promise.resolve(null),
      f3 ? _getFileHash(f3) : Promise.resolve(null),
      f4 ? _getFileHash(f4) : Promise.resolve(null),
    ]);
    const saved = JSON.parse(localStorage.getItem(FILE_HASHES_KEY) || 'null');
    if (!saved) return false;
    const currentStore = localStorage.getItem('prisme_selectedStore') || '';
    const h4Match = (!h4 && !saved.h4) || h4 === saved.h4;
    // Comparer les hashes consommé (tableau trié)
    const savedHC = saved.hC || (saved.h1 ? [saved.h1] : []);
    const hcMatch = hC.length === savedHC.length && hC.every((h, i) => h === savedHC[i]);
    return hC.length > 0 && hcMatch && saved.h2 === h2 && saved.h3 === h3 && saved.store === currentStore && h4Match;
  } catch (_) { return false; }
}
export async function _saveFileHashes(f1, f2, f3 = null, f4 = null) {
  try {
    const [hC, h2, h3, h4] = await Promise.all([
      _hashConsommeFiles(f1),
      f2 ? _getFileHash(f2) : Promise.resolve(null),
      f3 ? _getFileHash(f3) : Promise.resolve(null),
      f4 ? _getFileHash(f4) : Promise.resolve(null),
    ]);
    if (hC.length) localStorage.setItem(FILE_HASHES_KEY, JSON.stringify({ hC, h2, h3, h4, store: _S.selectedMyStore || '' }));
  } catch (_) {}
}

// Version du cache IndexedDB — incrémenter à chaque ajout de structure V3+
// Toute session stockée avec une version différente est purgée automatiquement.
const CACHE_VERSION  = 'v3.9'; // bump : territoireLines en store séparé (columnar), allège structured clone

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
    // periodFilter : restauré depuis IndexedDB uniquement (source de vérité unique)
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
  // periodFilter reset via resetAppState() — pas de double écriture
  const b = document.getElementById('cacheBanner');
  if (b) b.classList.add('hidden');
  const iz = document.getElementById('importZone');
  if (iz) iz.classList.remove('hidden');
  const ob = document.getElementById('onboardingStep0');
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
  document.getElementById('onboardingStep0')?.classList.remove('hidden');
  if (_S.storesIntersection && _S.storesIntersection.size > 1) {
    document.getElementById('storeSelector')?.classList.remove('hidden');
  }
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
  localStorage.removeItem(FILE_HASHES_KEY);
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
const IDB_VERSION = 2; // v2 : ajout store 'territoire' séparé
const IDB_STORE   = 'session';
const IDB_TERR    = 'territoire';

export function _openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, IDB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) db.createObjectStore(IDB_STORE);
      if (!db.objectStoreNames.contains(IDB_TERR))  db.createObjectStore(IDB_TERR);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror  = () => reject(req.error);
  });
}

// Sérialise territoireLines en format columnar (tableaux de colonnes)
// → réduit le coût du structured clone IDB de ~60% vs tableau d'objets
function _serializeTerritoire(lines) {
  if (!lines?.length) return null;
  const n = lines.length;
  const cols = {
    code: new Array(n), libelle: new Array(n), famille: new Array(n),
    direction: new Array(n), secteur: new Array(n), bl: new Array(n),
    ca: new Float64Array(n), canal: new Array(n),
    clientCode: new Array(n), clientNom: new Array(n), clientType: new Array(n),
    rayonStatus: new Array(n), isSpecial: new Uint8Array(n),
    commercial: new Array(n), dateExp: new Array(n),
  };
  for (let i = 0; i < n; i++) {
    const l = lines[i];
    cols.code[i]        = l.code;
    cols.libelle[i]     = l.libelle;
    cols.famille[i]     = l.famille;
    cols.direction[i]   = l.direction;
    cols.secteur[i]     = l.secteur;
    cols.bl[i]          = l.bl;
    cols.ca[i]          = l.ca || 0;
    cols.canal[i]       = l.canal;
    cols.clientCode[i]  = l.clientCode;
    cols.clientNom[i]   = l.clientNom;
    cols.clientType[i]  = l.clientType || '';
    cols.rayonStatus[i] = l.rayonStatus || '';
    cols.isSpecial[i]   = l.isSpecial ? 1 : 0;
    cols.commercial[i]  = l.commercial || '';
    cols.dateExp[i]     = l.dateExp instanceof Date ? l.dateExp.getTime() : (l.dateExp || null);
  }
  return cols;
}

function _deserializeTerritoire(cols) {
  if (!cols?.code?.length) return [];
  const n = cols.code.length;
  const lines = new Array(n);
  for (let i = 0; i < n; i++) {
    lines[i] = {
      code: cols.code[i], libelle: cols.libelle[i], famille: cols.famille[i],
      direction: cols.direction[i], secteur: cols.secteur[i], bl: cols.bl[i],
      ca: cols.ca[i], canal: cols.canal[i],
      clientCode: cols.clientCode[i], clientNom: cols.clientNom[i],
      clientType: cols.clientType[i], rayonStatus: cols.rayonStatus[i],
      isSpecial: !!cols.isSpecial[i], commercial: cols.commercial[i],
      dateExp: cols.dateExp[i] ? new Date(cols.dateExp[i]) : null,
    };
  }
  return lines;
}

// Sauvegarde complète — déférée via requestIdleCallback pour ne pas perturber l'UI
let _idbSaveScheduled = false;
export function _saveSessionToIDB() {
  // Ne pas écraser une session valide avec un état partiel (ex: rattachement commercial chargé
  // avant que le consommé/stock ne soient parsés). Une session "vide" n'a pas d'intérêt à restaurer.
  if (!_S.finalData?.length) return Promise.resolve();
  if (_idbSaveScheduled) return Promise.resolve();
  _idbSaveScheduled = true;
  return new Promise(resolve => {
    const run = () => { _idbSaveScheduled = false; _saveSessionToIDBNow().then(resolve).catch(e => { console.warn('[PRISME] IDB save deferred error:', e); resolve(); }); };
    if (typeof requestIdleCallback === 'function') requestIdleCallback(run, { timeout: 3000 });
    else setTimeout(run, 50);
  });
}

async function _saveSessionToIDBNow() {
  if (_S._idbSaving) return; // guard anti-boucle
  // Guard également ici : l'état peut changer entre le scheduling et l'exécution.
  if (!_S.finalData?.length) return;
  _S._idbSaving = true;
  let db = null;
  try {
    db = await _openDB();
    // Payload minimal pour scan.html — survit même si la session complète échoue (quota Safari iOS)
    try {
      const txScan = db.transaction([IDB_STORE], 'readwrite');
      const stScan = txScan.objectStore(IDB_STORE);
      const eanObj = _S.catalogueEAN?.size ? Object.fromEntries(_S.catalogueEAN) : null;
      const scanPayload = {
        version: CACHE_VERSION,
        timestamp: Date.now(),
        selectedMyStore: _S.selectedMyStore || '',
        storesIntersection: [..._S.storesIntersection],
        finalData: _S.finalData,
        ventesParMagasin: _S.ventesParMagasin,
        ean: eanObj,
      };
      stScan.put(scanPayload, 'scan');
      await new Promise((res, rej) => { txScan.oncomplete = res; txScan.onerror = () => rej(txScan.error); });
    } catch (eScan) {
      console.warn('[PRISME] IDB save scan payload failed:', eScan);
    }
    const tx = db.transaction([IDB_STORE, IDB_TERR], 'readwrite');
    const st = tx.objectStore(IDB_STORE);
    const payload = {
      version: CACHE_VERSION,
      timestamp: Date.now(),
      _hasStock:             _S._hasStock,
      // ── Core ──
      finalData:             _S.finalData,
      ventesParMagasin:      _S.ventesParMagasin,
      ventesParMagasinByCanal: _S.ventesParMagasinByCanal,
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
      ventesClientArticle:      _serializeNestedMap(_S.ventesClientArticle),
      ventesClientArticleFull:  _serializeNestedMap(_S.ventesClientArticleFull),
      byMonth:                  _S._byMonth || null,
      byMonthFull:              _S._byMonthFull || null,
      byMonthCanal:             _S._byMonthCanal || null,
      byMonthStoreArtCanal:     _S._byMonthStoreArtCanal || null,
      byMonthStoreClients:      _S._byMonthStoreClients
        ? Object.fromEntries(Object.entries(_S._byMonthStoreClients).map(([sk, months]) =>
            [sk, Object.fromEntries(Object.entries(months).map(([mi, s]) => [mi, [...s]]))]))
        : null,
      byMonthClients:           _S._byMonthClients
        ? Object.fromEntries(Object.entries(_S._byMonthClients).map(([k, v]) => [k, [...v]]))
        : null,
      byMonthClientsByCanal:    _S._byMonthClientsByCanal
        ? Object.fromEntries(Object.entries(_S._byMonthClientsByCanal).map(([k, cm]) => {
            const _o = {}; for (const _c in cm) _o[_c] = [...cm[_c]]; return [k, _o];
          }))
        : null,
      ventesClientHorsMagasin:  _serializeNestedMap(_S.ventesClientHorsMagasin),
      ventesClientAutresAgences: [...(_S.ventesClientAutresAgences || [])],
      cannauxHorsMagasin:       [...(_S.cannauxHorsMagasin || [])],
      clientLastOrder:       [..._S.clientLastOrder].map(([k, v]) => [k, v instanceof Date ? v.getTime() : v]),
      clientLastOrderAll:   [..._S.clientLastOrderAll].map(([k, v]) => [k, { date: v.date instanceof Date ? v.date.getTime() : v.date, canal: v.canal }]),
      clientLastOrderByCanal: [..._S.clientLastOrderByCanal].map(([cc, cMap]) => [cc, [...cMap].map(([c, d]) => [c, d instanceof Date ? d.getTime() : d])]),
      clientNomLookup:       _S.clientNomLookup,
      ventesClientsPerStore: _serializeSetsObj(_S.ventesClientsPerStore),
      commandesPerStoreCanal: _serializeCmdPerStoreCanal(_S.commandesPerStoreCanal),
      articleClients:        [..._S.articleClients].map(([k, v]) => [k, [...v]]),
      clientArticles:        [..._S.clientArticles].map(([k, v]) => [k, [...v]]),
      // ── Vue commerciale (V3) — Map<code, Map<canal, {ca,qteP,countBL}>> ──
      articleCanalCA:        _serializeNestedMap(_S.articleCanalCA),
      // ── Territoire (lines dans store séparé IDB_TERR) ──
      territoireReady:       _S.territoireReady,
      terrDirectionData:     _S.terrDirectionData,
      // ── Chalandise ──
      chalandiseData:        [..._S.chalandiseData],
      chalandiseReady:       _S.chalandiseReady,
      chalandiseMetiers:     _S.chalandiseMetiers,
      // ── Table de forçage commercial ──
      forcageCommercial:     [..._S.forcageCommercial],
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
      clientsByCommercial:   [...(_S.clientsByCommercial||[])].map(([k,v])=>[k,[...v]]),
      clientsByMetier:       [...(_S.clientsByMetier||[])].map(([k,v])=>[k,[...v]]),
      _selectedCommercial:   _S._selectedCommercial || '',
      _selectedMetier:       _S._selectedMetier     || '',
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
      // ── Livraisons (5ème fichier) ──
      livraisonsData:        [...(_S.livraisonsData||[])].map(([k,v])=>[k,{ca:v.ca,vmb:v.vmb,bl:[...v.bl],articles:[...v.articles],lastDate:v.lastDate?.getTime()||null}]),
      livraisonsReady:       _S.livraisonsReady || false,
      livraisonsClientCount: _S.livraisonsClientCount || 0,
      livraisonsDateMin:     _S.livraisonsDateMin?.getTime() || null,
      livraisonsDateMax:     _S.livraisonsDateMax?.getTime() || null,
      // ── Catalogue animation (Plan de rayon) ──
      catalogueFamille:      _S.catalogueFamille     ? [..._S.catalogueFamille]     : null,
      catalogueDesignation:  _S.catalogueDesignation ? [..._S.catalogueDesignation] : null,
      // ── Associations de ventes ──
      _associations:         _S._associations || [],
    };
    st.put(payload, 'current');
    // Territoire en store séparé (columnar → structured clone allégé)
    const terrStore = tx.objectStore(IDB_TERR);
    const terrPayload = _serializeTerritoire(_S.territoireLines);
    terrStore.put(terrPayload, 'lines');
    await new Promise((res, rej) => { tx.oncomplete = res; tx.onerror = () => rej(tx.error); });
    try { db.close(); } catch (_) {}
    localStorage.setItem('prisme_idbSavedAt', Date.now().toString());
    console.log('[PRISME] session sauvegardée dans IndexedDB', {
      finalData: _S.finalData?.length || 0,
      territoireLines: _S.territoireLines?.length || 0,
      chalandise: _S.chalandiseData?.size || 0,
      livraisons: _S.livraisonsData?.size || 0,
    });
  } catch (e) {
    console.error('[PRISME] IDB save error:', e);
    if (db) { try { db.close(); } catch (_) {} }
  } finally {
    _S._idbSaving = false;
  }
}

// Restauration — retourne true si succès, false sinon
export async function _restoreSessionFromIDB() {
  try {
    const db  = await _openDB();
    const tx  = db.transaction([IDB_STORE, IDB_TERR], 'readonly');
    const req = tx.objectStore(IDB_STORE).get('current');
    const reqT = tx.objectStore(IDB_TERR).get('lines');
    const [data, terrCols] = await Promise.all([
      new Promise((res, rej) => { req.onsuccess = () => res(req.result); req.onerror = () => rej(req.error); }),
      new Promise((res, rej) => { reqT.onsuccess = () => res(reqT.result); reqT.onerror = () => res(null); }),
    ]);
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

    _S._hasStock            = data._hasStock            || false;
    _S.finalData            = data.finalData            || [];
    _S.ventesParMagasin         = data.ventesParMagasin         || {};
    _S.ventesParMagasinByCanal  = data.ventesParMagasinByCanal  || {};
    _S.stockParMagasin          = data.stockParMagasin          || {};
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

    _S.ventesClientArticle      = _deserializeNestedMap(data.ventesClientArticle      || []);
    _S.ventesClientArticleFull  = _deserializeNestedMap(data.ventesClientArticleFull  || []);
    if (data.byMonth)      _S._byMonth      = data.byMonth;
    if (data.byMonthFull)  _S._byMonthFull  = data.byMonthFull;
    if (data.byMonthCanal) _S._byMonthCanal = data.byMonthCanal;
    if (data.byMonthStoreArtCanal) _S._byMonthStoreArtCanal = data.byMonthStoreArtCanal;
    if (data.byMonthStoreClients) {
      _S._byMonthStoreClients = {};
      for (const sk in data.byMonthStoreClients) { _S._byMonthStoreClients[sk] = {}; for (const mi in data.byMonthStoreClients[sk]) _S._byMonthStoreClients[sk][mi] = new Set(data.byMonthStoreClients[sk][mi]); }
    }
    if (data.byMonthClients) {
      _S._byMonthClients = Object.fromEntries(
        Object.entries(data.byMonthClients).map(([k, arr]) => [k, new Set(arr)])
      );
    }
    if (data.byMonthClientsByCanal) {
      _S._byMonthClientsByCanal = Object.fromEntries(
        Object.entries(data.byMonthClientsByCanal).map(([k, cm]) => {
          const _o = {}; for (const _c in cm) _o[_c] = new Set(cm[_c]);
          return [k, _o];
        })
      );
    }
    _S.ventesClientHorsMagasin  = _deserializeNestedMap(data.ventesClientHorsMagasin  || []);
    _S.ventesClientAutresAgences = new Map(data.ventesClientAutresAgences || []);
    _S.cannauxHorsMagasin       = new Set(data.cannauxHorsMagasin || []);
    _S.clientLastOrder       = new Map((data.clientLastOrder || []).map(([k, v]) => [k, v ? new Date(v) : null]));
    _S.clientLastOrderAll    = new Map((data.clientLastOrderAll || []).map(([k, v]) => [k, v ? { date: new Date(v.date), canal: v.canal || 'MAGASIN' } : { date: null, canal: 'MAGASIN' }]));
    _S.clientLastOrderByCanal = new Map((data.clientLastOrderByCanal || []).map(([cc, arr]) => [cc, new Map((arr || []).map(([c, d]) => [c, d ? new Date(d) : null]))]));
    _S.clientNomLookup       = data.clientNomLookup       || {};
    _S.ventesClientsPerStore = _deserializeSetsObj(data.ventesClientsPerStore || {});
    _S.commandesPerStoreCanal = _deserializeCmdPerStoreCanal(data.commandesPerStoreCanal || {});
    _S.articleClients        = new Map((data.articleClients || []).map(([k, v]) => [k, new Set(v)]));
    _S.clientArticles        = new Map((data.clientArticles || []).map(([k, v]) => [k, new Set(v)]));

    _S.territoireReady   = data.territoireReady   || false;
    _S.territoireLines   = terrCols ? _deserializeTerritoire(terrCols) : (data.territoireLines || []);
    _S.terrDirectionData = data.terrDirectionData || {};

    _S.chalandiseData    = new Map(data.chalandiseData || []);
    _S.chalandiseReady   = data.chalandiseReady   || false;
    _S.chalandiseMetiers = data.chalandiseMetiers || [];
    _S.forcageCommercial = new Map(data.forcageCommercial || []);

    _S.consommePeriodMin     = data.consommePeriodMin     ? new Date(data.consommePeriodMin)     : null;
    _S.consommePeriodMax     = data.consommePeriodMax     ? new Date(data.consommePeriodMax)     : null;
    _S.consommeMoisCouverts  = data.consommeMoisCouverts  || 0;
    _S.consommePeriodMinFull = data.consommePeriodMinFull ? new Date(data.consommePeriodMinFull) : _S.consommePeriodMin;
    _S.consommePeriodMaxFull = data.consommePeriodMaxFull ? new Date(data.consommePeriodMaxFull) : _S.consommePeriodMax;
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
    _S.clientsByCommercial = new Map((data.clientsByCommercial||[]).map(([k,v])=>[k,new Set(v)]));
    _S.clientsByMetier     = new Map((data.clientsByMetier||[]).map(([k,v])=>[k,new Set(v)]));
    if (data._selectedCommercial !== undefined) _S._selectedCommercial = data._selectedCommercial;
    if (data._selectedMetier     !== undefined) _S._selectedMetier     = data._selectedMetier;
    console.log('[PRISME] IDB restore - clientsByCommercial size:', _S.clientsByCommercial?.size, '_selectedCommercial:', _S._selectedCommercial);
    // Normaliser clés chalandise + appliquer forçage (compat caches anciens)
    buildChalandiseStore();
    // ── Navigation sous-onglets ──
    if (data._clientsActiveTab)  _S._clientsActiveTab  = data._clientsActiveTab;

    // ── Opportunité nette & reconquête (C1) ──
    _S.opportuniteNette  = data.opportuniteNette  || [];
    _S.reconquestCohort  = data.reconquestCohort  || [];

    // ── Livraisons (5ème fichier) ──
    _S.livraisonsData = new Map((data.livraisonsData||[]).map(([k,v])=>[k,{ca:v.ca,vmb:v.vmb,bl:new Set(v.bl),articles:new Map(v.articles),lastDate:v.lastDate?new Date(v.lastDate):null}]));
    _S.livraisonsReady = data.livraisonsReady || false;
    _S.livraisonsClientCount = data.livraisonsClientCount || 0;
    _S.livraisonsDateMin = data.livraisonsDateMin ? new Date(data.livraisonsDateMin) : null;
    _S.livraisonsDateMax = data.livraisonsDateMax ? new Date(data.livraisonsDateMax) : null;

    // ── Catalogue animation (Plan de rayon) ──
    _S.catalogueFamille     = data.catalogueFamille     ? new Map(data.catalogueFamille)     : null;
    _S.catalogueDesignation = data.catalogueDesignation ? new Map(data.catalogueDesignation) : null;

    // ── Associations de ventes ──
    _S._associations = data._associations || [];

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
    const tx = db.transaction([IDB_STORE, IDB_TERR], 'readwrite');
    tx.objectStore(IDB_STORE).clear();
    tx.objectStore(IDB_TERR).clear();
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
  const setKeys = new Set(['ruptures', 'fantomes', 'sansemplacement', 'anomalies', 'saso', 'dormants', 'fins', 'top20', 'nouveautes', 'colisrayon', 'stockneg', 'fragiles', 'phantom']);
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

// commandesPerStoreCanal : {store: {canal: Set<nc>}} ↔ {store: {canal: [nc]}}
export function _serializeCmdPerStoreCanal(obj) {
  if (!obj) return {};
  const out = {};
  for (const store in obj) {
    out[store] = {};
    for (const canal in obj[store]) {
      out[store][canal] = obj[store][canal] instanceof Set ? [...obj[store][canal]] : obj[store][canal];
    }
  }
  return out;
}
export function _deserializeCmdPerStoreCanal(obj) {
  if (!obj) return {};
  const out = {};
  for (const store in obj) {
    out[store] = {};
    for (const canal in obj[store]) {
      out[store][canal] = Array.isArray(obj[store][canal]) ? new Set(obj[store][canal]) : obj[store][canal];
    }
  }
  return out;
}

// _S.benchLists ne contient pas de Sets actuellement
export function _serializeBenchLists(bl) { return { ...bl }; }
export function _deserializeBenchLists(bl) { return bl || { missed: [], under: [], over: [], storePerf: {}, familyPerf: [], obsKpis: null, obsFamiliesLose: [], obsFamiliesWin: [], obsActionPlan: [], pepites: [], pepitesOther: [] }; }
