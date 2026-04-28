'use strict';
// ── PRISME Scan — module autonome lecture IDB ──────────────────────────
// Lit finalData depuis IndexedDB PRISME, lookup par code article.
// Zéro dépendance sur main.js / state.js / store.js.

const IDB_NAME = 'PRISME';
const IDB_VERSION = 2;
const IDB_STORE = 'session';

let _articles = null;   // Map<code, article>
let _eanMap = null;     // Map<ean, code>
let _refMap = null;     // Map<refFournisseur, code>
let _scanCount = 0;
let _actionMap = new Map();  // Map<code, {code, libelle, famille, emplacement, retour?, commander?, corriger_erp?, nouvelEmplacement?, ts}>
const _AQ_KEY = 'prisme_scan_actions';

// ── Corrections locales — appliquées depuis _actionMap au chargement ─
function _applyCorrections() {
  if (!_articles || !_actionMap.size) return;
  for (const [code, a] of _actionMap) {
    const r = _articles.get(code);
    if (!r) continue;
    // Inventaire : re-appliquer le stock corrigé
    if (a.inventaire) {
      const match = a.inventaire.match(/→\s*(\d+)/);
      if (match) r.stockActuel = parseInt(match[1], 10);
    }
  }
}

// ── IDB ────────────────────────────────────────────────────────────────
function _openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, IDB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) db.createObjectStore(IDB_STORE);
      if (!db.objectStoreNames.contains('territoire')) db.createObjectStore('territoire');
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function loadData() {
  console.log('[Scan] loadData — début');
  try {
    const db = await _openDB();
    try {
      console.log('[Scan] IDB ouverte, stores:', [...db.objectStoreNames]);
      // Priorité 1 : clé 'scan' (payload minimal, fiable sur Safari iOS)
      const tx = db.transaction(IDB_STORE, 'readonly');
      const data = await new Promise((resolve, reject) => {
        const r = tx.objectStore(IDB_STORE).get('scan');
        r.onsuccess = () => resolve(r.result);
        r.onerror = () => reject(r.error);
      });
      console.log('[Scan] IDB scan:', data ? ('articles=' + (data.articles?.length || 0) + ' finalData=' + (data.finalData?.length || 0)) : 'vide');

      // Nouveau format : payload scan minimal {articles,ean,...}
      if (data?.articles?.length) {
        _loadFromScanPayload(data);
        console.log('[Scan] ✅ ' + _articles.size + ' articles restaurés depuis IDB (scan)');
        return;
      }

      // Fallback rétrocompat : anciennes sessions sans clé 'scan'
      let dataEffective = data;
      if (!dataEffective?.finalData?.length) {
        const tx0 = db.transaction(IDB_STORE, 'readonly');
        dataEffective = await new Promise((resolve, reject) => {
          const r = tx0.objectStore(IDB_STORE).get('current');
          r.onsuccess = () => resolve(r.result);
          r.onerror = () => reject(r.error);
        });
        console.log('[Scan] IDB current:', dataEffective ? 'finalData=' + (dataEffective.finalData?.length || 0) : 'vide');
      }

      if (dataEffective?.finalData?.length) {
        _articles = new Map();
        for (const r of dataEffective.finalData) _articles.set(r.code, r);
        if (dataEffective.ventesParAgence) {
          const myStore = dataEffective.selectedMyStore || '';
          const vpm = dataEffective.ventesParAgence;
          const allStores = Object.keys(vpm);
          for (const [code, r] of _articles) {
            let reseauCount = 0, totalCA = 0, totalQte = 0, totalVMB = 0;
            for (const s of allStores) {
              const v = vpm[s]?.[code];
              if (!v || v.countBL <= 0) continue;
              if (s !== myStore) reseauCount++;
              totalCA += v.sumCA || 0;
              totalQte += (v.sumPrelevee || 0) + (v.sumEnleve || 0);
              totalVMB += v.sumVMB || 0;
            }
            r._reseauAgences = reseauCount;
            r.prixMoyenReseau = totalQte > 0 ? Math.round(totalCA / totalQte * 100) / 100 : null;
            r.txMargeReseau = totalCA > 0 ? Math.round(totalVMB / totalCA * 10000) / 100 : null;
          }
        }
        _applyCorrections();
        document.getElementById('refCount').textContent = _articles.size + ' refs';
        if (dataEffective.ean && !_eanMap) {
          _eanMap = new Map();
          for (const [ean, code] of Object.entries(dataEffective.ean)) _eanMap.set(ean, code);
          console.log('[Scan] EAN depuis IDB : ' + _eanMap.size);
        }
        console.log('[Scan] ' + _articles.size + ' articles chargés depuis IDB (scan/session)');
        _scheduleSaveToLS();
        return;
      }
      // Fallback : données scan importées via JSON, persistées en IDB
      const tx2 = db.transaction(IDB_STORE, 'readonly');
      const scanData = await new Promise((resolve, reject) => {
        const r = tx2.objectStore(IDB_STORE).get('scan-import');
        r.onsuccess = () => resolve(r.result);
        r.onerror = () => reject(r.error);
      });
      console.log('[Scan] IDB scan-import:', scanData ? 'articles=' + (scanData.articles?.length || 0) : 'vide');
      if (scanData?.articles?.length) {
        _loadFromScanPayload(scanData);
        console.log('[Scan] ✅ ' + _articles.size + ' articles restaurés depuis IDB (scan-import)');
        return;
      }
      // Fallback : fetch data/scan.json
      if (await _tryFetchScanJson()) return;
      // Fallback : localStorage (fiable sur Safari iOS)
      if (_loadFromLS()) return;
      _showImportFallback();
    } finally {
      try { db.close(); } catch (_) {}
    }
  } catch (e) {
    console.error('[Scan] Erreur chargement IDB:', e);
    const reason = (e && (e.name || e.message)) ? ((e.name || 'Erreur') + (e.message ? ' — ' + e.message : '')) : 'Erreur inconnue';
    if (await _tryFetchScanJson()) return;
    if (_loadFromLS()) return;
    _showImportFallback(reason);
  }
}

async function _tryFetchScanJson() {
  try {
    const resp = await fetch('data/scan.json', { cache: 'no-cache' });
    if (!resp.ok) return false;
    const data = await resp.json();
    if (!data.articles?.length) return false;
    _loadFromScanPayload(data);
    console.log('[Scan] ' + _articles.size + ' articles chargés depuis data/scan.json');
    await _saveScanToIDB(data);
    return true;
  } catch (e) { console.warn('[Scan] fetch scan.json échoué:', e); return false; }
}

function _loadFromScanPayload(data) {
  _articles = new Map();
  for (const r of data.articles) _articles.set(r.code, r);
  if (data.ean) {
    _eanMap = new Map();
    for (const [ean, code] of Object.entries(data.ean)) _eanMap.set(ean, code);
  }
  _applyCorrections();
  document.getElementById('refCount').textContent = _articles.size + ' refs';
  document.getElementById('importZone').style.display = 'none';
  _scheduleSaveToLS();
}

// ── localStorage fallback (Safari iOS purge IDB) ─────────────────────
const _LS_KEY = 'prisme_scan_data';
// Champs utiles au scan — on élimine le reste pour tenir dans ~2-3 Mo
const _SCAN_FIELDS = ['code','libelle','famille','sousFamille','emplacement','statut',
  'stockActuel','prixMoyenReseau','txMargeReseau','W','V','ancienMin','ancienMax',
  'nouveauMin','nouveauMax','couvertureJours','abcClass','fmrClass','matriceVerdict','enleveTotal',
  '_sqClassif','_sqRole','_sqVerdict','_vitesseReseau','_fallbackERP','isParent',
  'medMinReseau','medMaxReseau','prixUnitaire','_reseauAgences'];

function _saveToLS() {
  try {
    if (!_articles || !_articles.size) return;
    const compact = [];
    for (const r of _articles.values()) {
      const o = {};
      for (const k of _SCAN_FIELDS) { if (r[k] != null) o[k] = r[k]; }
      compact.push(o);
    }
    const json = JSON.stringify({ v: 3, ts: Date.now(), articles: compact });
    localStorage.setItem(_LS_KEY, json);
    console.log('[Scan] LS sauvegardé : ' + compact.length + ' articles (' + (json.length / 1024).toFixed(0) + ' Ko)');
  } catch (e) {
    console.warn('[Scan] LS save échoué:', e);
  }
}

let _lsSaveScheduled = false;
function _scheduleSaveToLS() {
  if (_lsSaveScheduled) return;
  _lsSaveScheduled = true;
  const run = () => { _lsSaveScheduled = false; _saveToLS(); };
  if (typeof requestIdleCallback === 'function') requestIdleCallback(run, { timeout: 1500 });
  else setTimeout(run, 120);
}

function _loadFromLS() {
  try {
    const raw = localStorage.getItem(_LS_KEY);
    if (!raw) return false;
    const data = JSON.parse(raw);
    if (!data.articles?.length) return false;
    _articles = new Map();
    for (const r of data.articles) _articles.set(r.code, r);
    _applyCorrections();
    document.getElementById('refCount').textContent = _articles.size + ' refs';
    document.getElementById('importZone').style.display = 'none';
    console.log('[Scan] ✅ ' + _articles.size + ' articles restaurés depuis localStorage');
    return true;
  } catch (e) {
    console.warn('[Scan] LS load échoué:', e);
    return false;
  }
}

// Persister les données scan importées en IDB
async function _saveScanToIDB(data) {
  let db = null;
  try {
    db = await _openDB();
    try {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      tx.objectStore(IDB_STORE).put(data, 'scan-import');
      await new Promise((resolve, reject) => {
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(new Error('Transaction IDB annulée: ' + (tx.error?.message || 'quota?')));
      });
      // Vérification : relire immédiatement
      const tx2 = db.transaction(IDB_STORE, 'readonly');
      const check = await new Promise((resolve, reject) => {
        const r = tx2.objectStore(IDB_STORE).get('scan-import');
        r.onsuccess = () => resolve(r.result);
        r.onerror = () => reject(r.error);
      });
      if (check?.articles?.length) {
        console.log('[Scan] ✅ IDB vérifié : ' + check.articles.length + ' articles persistés');
      } else {
        console.error('[Scan] ❌ IDB write OK mais relecture vide !');
      }
    } finally {
      try { db.close(); } catch (_) {}
    }
  } catch (e) {
    console.error('[Scan] ❌ Échec sauvegarde IDB:', e);
    if (db) { try { db.close(); } catch (_) {} }
  }
}

function _showImportFallback(reason) {
  document.getElementById('importZone').style.display = 'block';
  document.getElementById('content').innerHTML = `
    <div class="empty">
      <div class="icon">📱</div>
      <p>Pas de cache PRISME sur cet appareil.</p>
      <p style="margin-top:12px;font-size:12px;color:var(--t2)">Chargez le fichier <strong>prisme-scan-XXX.json</strong><br>exporté depuis PRISME sur PC.</p>
      ${reason ? `<p style="margin-top:10px;font-size:11px;color:var(--t3)">IndexedDB indisponible : ${_esc(reason)}</p>` : ''}
    </div>`;
}

// ── Lookup & render ────────────────────────────────────────────────────
function lookup(code) {
  const el = document.getElementById('content');
  if (!_articles) {
    el.innerHTML = '<div class="notfound"><div class="icon">⏳</div><p>Chargement en cours…</p></div>';
    return;
  }
  const raw = code.trim();
  const clean = raw.replace(/\D/g, '');
  if (!raw) return;

  // Lookup : code article → EAN → ref fournisseur
  let r = clean ? _articles.get(clean) : null;
  if (!r && _eanMap && clean) {
    const artCode = _eanMap.get(clean);
    if (artCode) r = _articles.get(artCode);
  }
  if (!r && _refMap) {
    const artCode = _refMap.get(raw) || _refMap.get(raw.toUpperCase());
    if (artCode) r = _articles.get(artCode);
  }
  if (!r) {
    el.innerHTML = `<div class="notfound"><div class="icon">🔍</div><p>Code <strong>${_esc(raw)}</strong> non trouvé<br><span style="font-size:11px;color:var(--t3)">${_articles.size} refs en mémoire</span></p></div>`;
    return;
  }

  _scanCount++;
  document.getElementById('scanCount').textContent = _scanCount + ' scan' + (_scanCount > 1 ? 's' : '');
  _lastCode = r.code;
  _renderCard(r.code);
  // Mode inventaire : enregistrer le scan
  if (_invMode && _invEmpl && !_invScanned.has(r.code)) {
    _invScanned.set(r.code, { stock: r.stockActuel || 0, confirmed: true });
    _saveInv();
    _updateInvBanner();
  }
  // Zebra : vider l'input pour que le prochain scan ne concatène pas
  input.value = '';
  clearBtn.style.display = 'none';
}

let _lastCode = null;

function _renderCard(code) {
  const el = document.getElementById('content');
  const r = _articles?.get(code);
  if (!r) return;

  const verdict = _verdict(r);
  const stock = r.stockActuel ?? 0;
  const prixMoyen = r.prixMoyenReseau ? _euro(r.prixMoyenReseau) : '—';
  const txMarge = r.txMargeReseau != null ? r.txMargeReseau.toFixed(0) + '%' : '—';
  const emp = r.emplacement || '—';
  const min = r.nouveauMin || 0;
  const max = r.nouveauMax || 0;
  const erpMin = r.ancienMin || 0;
  const erpMax = r.ancienMax || 0;
  const couv = r.couvertureJours != null && r.couvertureJours < 9999 ? r.couvertureJours + 'j' : '—';
  const hasNewMM = min > 0 || max > 0;
  const minMax = hasNewMM ? min + ' / ' + max : (erpMin > 0 || erpMax > 0 ? erpMin + ' / ' + erpMax : '— / —');
  const mmSource = hasNewMM ? 'PRISME' : 'ERP';
  const vitTag = r._vitesseReseau ? (r._fallbackERP ? ' <span class="vitesse-tag">(Méd.)</span>' : ' <span class="vitesse-tag">(Vitesse)</span>') : '';

  // Verdict Squelette
  const sqClassif = r._sqClassif || '';
  const sqVerdict = r._sqVerdict || '';
  const _sqStyles = {
    socle:      { bg: 'rgba(59,130,246,.25)', color: '#93c5fd', icon: '🔵' },
    implanter:  { bg: 'rgba(34,197,94,.25)',  color: '#86efac', icon: '🟢' },
    challenger: { bg: 'rgba(239,68,68,.2)',   color: '#fca5a5', icon: '💀' },
    surveiller: { bg: 'rgba(245,158,11,.2)',  color: '#fbbf24', icon: '⚠️' },
  };
  const sqStyle = _sqStyles[sqClassif] || { bg: 'rgba(100,116,139,.15)', color: '#94a3b8', icon: '—' };
  const sqLabel = sqVerdict || (sqClassif ? sqClassif.charAt(0).toUpperCase() + sqClassif.slice(1) : '');

  // Divergence ERP : calcul surplus / déficit
  const effectiveMax = hasNewMM ? max : erpMax;
  const surplus = effectiveMax > 0 && stock > effectiveMax ? stock - effectiveMax : 0;

  // Action buttons — cumulables, recalculés sur le stock réel corrigé
  const _noted = () => `this.textContent='✓ Noté';this.disabled=true;this.style.opacity='.5';setTimeout(()=>_refocus(),200);`;
  let actionHtml = '';
  if (surplus > 0) {
    actionHtml += `<button class="action-btn action-surstock" onclick="_confirmRetour('${r.code}',${surplus},${stock},${effectiveMax})" style="margin-bottom:6px;display:flex;align-items:center;justify-content:center;gap:8px">
      <span>📦 Retour centrale ·</span>
      <strong id="retourQte" onclick="event.stopPropagation();_editRetour('${r.code}',${surplus},${stock},${effectiveMax})" style="cursor:pointer;text-decoration:underline;font-size:18px">${surplus} pcs</strong>
    </button>`;
  }
  if (hasNewMM && (erpMin !== min || erpMax !== max)) {
    actionHtml += `<button class="action-btn action-erp" onclick="${_noted()}addAction('${r.code}','corriger_erp','Corriger ERP: ${erpMin}/${erpMax} → ${min}/${max}')" style="margin-bottom:6px">
      🔄 Corriger ERP · ${min} / ${max}</button>`;
  }
  const effectiveMin = hasNewMM ? min : erpMin;
  if (effectiveMin > 0 && stock < effectiveMin) {
    const qte = effectiveMin - stock;
    actionHtml += `<button class="action-btn action-rupture" onclick="${_noted()}addAction('${r.code}','commander','Commander: ${qte} pcs (stock ${stock} vs MIN ${effectiveMin})')" style="margin-bottom:6px">
      🚨 Commander · <strong>${qte} pcs</strong> (stock ${stock} &lt; MIN ${effectiveMin})</button>`;
  }
  // Poids mort : purge complète (MIN/MAX→0, vider empl., retour stock)
  const W = r.enleveTotal || 0;
  if (min === 0 && max === 0 && stock > 0 && W === 0) {
    actionHtml += `<button class="action-btn" style="margin-bottom:6px;background:rgba(100,116,139,.2);color:#cbd5e1;border:1px solid rgba(100,116,139,.3)" onclick="${_noted()}addAction('${r.code}','corriger_erp','Purge: MIN/MAX → 0/0');addAction('${r.code}','emplacement','');addAction('${r.code}','retour','Retour: ${stock} pcs (purge poids mort)')">
      🗑️ Purger · MIN/MAX 0/0 · vider empl. · retour <strong>${stock} pcs</strong></button>`;
  }
  // Zone emplacement inline (activée au clic sur EMPL.)
  actionHtml += `<div id="empZone"></div>`;

  el.innerHTML = `<div class="card flash">
    <div class="card-head">
      <div class="code">${_esc(r.code)}<span style="float:right;font-size:12px;color:var(--t3)">${_esc(r.famille || '')}</span></div>
      <div class="lib">${_esc(r.libelle || '—')}</div>
    </div>
    <div class="hero">
      <div class="hero-cell">
        <div class="hero-val">${prixMoyen}</div>
        <div class="hero-label">PRIX MOY.<span style="color:var(--t3);font-size:8px;margin-left:3px">${txMarge}</span></div>
      </div>
      <div class="hero-cell" onclick="_editStock('${r.code}',${stock})" style="cursor:pointer">
        <div class="hero-val" id="stockVal" style="color:${stock > 0 ? 'var(--green)' : 'var(--red)'}">${stock}</div>
        <div class="hero-label">STOCK <span style="color:var(--t3)">${couv}</span> ✏️</div>
      </div>
      <div class="hero-cell" onclick="_editEmp('${r.code}','${_esc(emp)}')" style="cursor:pointer">
        <div class="hero-val hero-emp" id="empVal">${_esc(emp)}</div>
        <div class="hero-label">EMPL. ✏️</div>
      </div>
    </div>
    ${sqLabel ? `<div class="sq-banner" style="background:${sqStyle.bg};color:${sqStyle.color}">
      <span class="sq-icon">${sqStyle.icon}</span>
      <span class="sq-label">${_esc(sqLabel)}</span>
      <span class="sq-classif">${_esc(sqClassif)}</span>
    </div>` : ''}
    <div class="verdict-bar" style="background:${verdict.bg};color:${verdict.color}">${verdict.label}</div>
    <div class="detail-grid">
      <div class="d-cell">
        <span class="d-label">MIN/MAX ${mmSource}${vitTag}</span>
        <span class="d-val">${minMax}</span>
      </div>
      ${hasNewMM && (erpMin !== min || erpMax !== max) ? `<div class="d-cell">
        <span class="d-label">ERP actuel</span>
        <span class="d-val d-erp">${erpMin} / ${erpMax}</span>
      </div>` : ''}
      <div class="d-cell">
        <span class="d-label">Marge réseau</span>
        <span class="d-val">${txMarge}</span>
      </div>
      <div class="d-cell">
        <span class="d-label">ABC/FMR</span>
        <span class="d-val">${r.abcClass || '—'}-${r.fmrClass || '—'}${r.matriceVerdict ? ' · ' + _esc(r.matriceVerdict) : ''}</span>
      </div>
      <div class="d-cell">
        <span class="d-label">Statut</span>
        <span class="d-val">${_esc(r.statut || '—')}</span>
      </div>
    </div>
    ${actionHtml ? `<div class="action-zone">${actionHtml}</div>` : ''}
  </div>`;
}

// ── Verdict (simplifié) ────────────────────────────────────────────────
function _verdict(r) {
  const stock = r.stockActuel || 0;
  const min = r.nouveauMin || 0;
  const max = r.nouveauMax || 0;
  const W = r.W || 0;
  const isVitesse = !!r._vitesseReseau;

  // Rupture
  if (stock === 0 && min > 0)
    return { label: '🔴 RUPTURE', bg: 'rgba(239,68,68,.2)', color: '#fca5a5' };
  // Sous-min
  if (stock > 0 && stock < min)
    return { label: '🟠 Sous MIN', bg: 'rgba(245,158,11,.2)', color: '#fbbf24' };
  // Sur-stock
  if (max > 0 && stock > max * 1.5)
    return { label: '🟣 Sur-stock', bg: 'rgba(139,92,246,.2)', color: '#c4b5fd' };
  // Réf Schizo : en stock, 0 ventes, réseau vend
  if (stock > 0 && W === 0 && isVitesse)
    return { label: '💀 Réf Schizo', bg: 'rgba(239,68,68,.15)', color: '#f87171' };
  // Dormant
  if (stock > 0 && W === 0 && !isVitesse)
    return { label: '💤 Dormant', bg: 'rgba(100,116,139,.2)', color: '#94a3b8' };
  // OK
  if (stock >= min && (max === 0 || stock <= max))
    return { label: '✅ OK', bg: 'rgba(34,197,94,.15)', color: '#86efac' };
  // Poids mort : 0/0, en stock
  if (min === 0 && max === 0 && stock > 0)
    return { label: '⚖️ Poids mort', bg: 'rgba(100,116,139,.15)', color: '#94a3b8' };

  return { label: '—', bg: 'transparent', color: 'var(--t2)' };
}

// ── Helpers ────────────────────────────────────────────────────────────
function _esc(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
function _euro(n) { return n.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

// ── Input handlers ─────────────────────────────────────────────────────
const input = document.getElementById('scanInput');
const clearBtn = document.getElementById('clearBtn');

let _debounce;
input.addEventListener('input', () => {
  clearBtn.style.display = input.value ? 'block' : 'none';
  // Recherche live — suggestions au fil de la saisie
  clearTimeout(_debounce);
  _debounce = setTimeout(() => _liveSearch(input.value.trim()), 150);
});

// ── Mode douchette (inputmode=none → pas de clavier virtuel) ──────────
let _scanMode = localStorage.getItem('prisme_scan_mode') === '1';
function toggleScanMode() {
  _scanMode = !_scanMode;
  localStorage.setItem('prisme_scan_mode', _scanMode ? '1' : '0');
  _applyScanMode();
}
function _applyScanMode() {
  const btn = document.getElementById('scanModeBtn');
  if (_scanMode) {
    input.setAttribute('inputmode', 'none');
    input.readOnly = false;
    btn.textContent = '📠';
    btn.classList.add('active');
    btn.title = 'Mode Douchette (clavier masqué)';
  } else {
    input.removeAttribute('inputmode');
    btn.textContent = '⌨️';
    btn.classList.remove('active');
    btn.title = 'Mode Clavier';
  }
}
_applyScanMode();
window.toggleScanMode = toggleScanMode;

// ── Caméra scan (html5-qrcode) ───────────────────────────────────────
let _camScanner = null;
let _camActive = false;

function toggleCamera() {
  if (_camActive) { _stopCamera(); return; }
  _startCamera();
}
window.toggleCamera = toggleCamera;

function _startCamera() {
  const zone = document.getElementById('camZone');
  const btn = document.getElementById('camBtn');
  if (!zone || typeof Html5Qrcode === 'undefined') {
    alert('Librairie caméra non chargée. Vérifiez la connexion.');
    return;
  }
  zone.classList.add('open');
  btn.classList.add('active');
  _camActive = true;

  _camScanner = new Html5Qrcode('camReader');
  _camScanner.start(
    { facingMode: 'environment' },
    { fps: 20, qrbox: { width: 350, height: 150 }, aspectRatio: 1.5,
      formatsToSupport: [
        Html5QrcodeSupportedFormats.EAN_13,
        Html5QrcodeSupportedFormats.EAN_8,
        Html5QrcodeSupportedFormats.CODE_128,
        Html5QrcodeSupportedFormats.CODE_39,
        Html5QrcodeSupportedFormats.QR_CODE
      ]
    },
    (code) => {
      // Scan réussi — vibration + lookup
      _vibrate();
      _stopCamera();
      input.value = code;
      lookup(code);
    },
    () => {} // scan en cours, pas de match
  ).catch(err => {
    console.warn('Caméra:', err);
    _stopCamera();
    alert('Impossible d\'ouvrir la caméra.\nVérifiez les permissions.');
  });
}

function _stopCamera() {
  const zone = document.getElementById('camZone');
  const btn = document.getElementById('camBtn');
  if (_camScanner) {
    _camScanner.stop().then(() => { _camScanner.clear(); }).catch(() => {});
    _camScanner = null;
  }
  if (zone) zone.classList.remove('open');
  if (btn) btn.classList.remove('active');
  _camActive = false;
}

// Enter = DataWedge suffix → lookup immédiat (Zebra)
input.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    const code = input.value.trim();
    if (_invMode && !_invEmpl && code) { startInventaire(code); }
    else if (code) { _clearSuggestions(); lookup(code); }
    setTimeout(() => input.select(), 50);
  }
});

function _liveSearch(q) {
  if (!_articles || q.length < 3) { _clearSuggestions(); return; }
  const el = document.getElementById('content');
  const clean = q.replace(/\D/g, '');
  // Code exact → lookup direct
  if (clean.length === 6 && _articles.has(clean)) {
    _clearSuggestions();
    lookup(clean);
    return;
  }
  // Lookup EAN direct (8-14 chiffres)
  if (_eanMap && clean.length >= 8 && clean.length <= 14) {
    const artCode = _eanMap.get(clean);
    if (artCode && _articles.has(artCode)) {
      _clearSuggestions();
      lookup(artCode);
      return;
    }
  }
  // Lookup ref fournisseur exact
  if (_refMap) {
    const artCode = _refMap.get(q.trim()) || _refMap.get(q.trim().toUpperCase());
    if (artCode && _articles.has(artCode)) {
      _clearSuggestions();
      lookup(artCode);
      return;
    }
  }
  // Recherche multi-mots : chaque mot doit matcher quelque part (code/libellé/emplacement/famille/ref)
  // "make agen blanc" → matche "MAKEMO AGENCEMENT BLANC"
  const words = q.toLowerCase().split(/\s+/).filter(w => w.length >= 2);
  if (!words.length) { _clearSuggestions(); return; }
  const matches = [];
  for (const [code, r] of _articles) {
    if (matches.length >= 12) break;
    const ref = r._refFourn || '';
    const hay = (code + ' ' + (r.libelle || '') + ' ' + (r.emplacement || '') + ' ' + (r.famille || '') + ' ' + ref).toLowerCase();
    let ok = true;
    for (let i = 0; i < words.length; i++) { if (!hay.includes(words[i])) { ok = false; break; } }
    if (ok) matches.push(r);
  }
  if (!matches.length) {
    el.innerHTML = `<div class="notfound"><div class="icon">🔍</div><p>Aucun résultat pour "${_esc(q)}"</p></div>`;
    return;
  }
  // Si 1 seul résultat exact par code → afficher direct
  if (matches.length === 1 && matches[0].code === clean) {
    lookup(matches[0].code);
    return;
  }
  // Afficher la liste cliquable
  el.innerHTML = matches.map(r => {
    const v = _verdict(r);
    const stock = r.stockActuel ?? 0;
    const mm = (r.nouveauMin > 0 || r.nouveauMax > 0) ? r.nouveauMin + '/' + r.nouveauMax : '—';
    // Geste 4 — Infiltration Squelette : pastille squelette + état stock
    const _sqC = r._sqClassif || '';
    const sqDot = { socle: '🔵', implanter: '🟢', challenger: '🔴', surveiller: '🟠' }[_sqC] || '';
    const vLabel = sqDot ? sqDot + ' ' + v.label.replace(/^[^\s]+\s/, '') : v.label;
    return `<div onclick="selectArticle('${r.code}')" style="padding:10px 16px;border-bottom:1px solid var(--border);cursor:pointer;display:flex;align-items:center;gap:10px"
      class="hover-row">
      <div style="flex:1;min-width:0">
        <div style="font-size:10px;color:var(--border);letter-spacing:.5px">${_esc(r.code)}</div>
        <div style="font-size:13px;font-weight:700;color:var(--t1);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${_esc(r.libelle || '—')}</div>
        <div style="font-size:11px;color:#7dd3fc;font-weight:600;margin-top:1px">${_esc(r.emplacement || '—')}<span style="color:var(--border);font-weight:400;margin-left:6px">${r.famille ? _esc(r.famille) : ''}</span></div>
      </div>
      <div style="text-align:right;flex-shrink:0;min-width:44px">
        <div style="font-size:18px;font-weight:900;color:${stock > 0 ? 'var(--green)' : 'var(--red)'}; line-height:1">${stock}</div>
        <div style="font-size:9px;color:var(--border);margin-top:2px">${mm}</div>
      </div>
      <div class="verdict" style="background:${v.bg};color:${v.color};font-size:9px;padding:2px 6px;white-space:nowrap;min-width:52px;text-align:center">${vLabel}</div>
    </div>`;
  }).join('');
}

function selectArticle(code) {
  input.value = code;
  _clearSuggestions();
  lookup(code);
  setTimeout(() => input.select(), 50);
}
window.selectArticle = selectArticle;

function _clearSuggestions() {
  // Ne rien faire si le contenu est une fiche article (card)
  const el = document.getElementById('content');
  if (el.querySelector('.card')) return;
}

function clearScan() {
  input.value = '';
  clearBtn.style.display = 'none';
  input.focus();
  document.getElementById('content').innerHTML = `
    <div class="empty">
      <div class="icon">📦</div>
      <p>Scannez un code article<br>ou tapez-le au clavier</p>
    </div>`;
}
window.clearScan = clearScan;

// ── Import JSON (mobile — pas d'IDB partagé) ──────────────────────────
function importScanFile(fileInput) {
  const file = fileInput.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result);
      if (!data.articles?.length) throw new Error('Pas d\'articles dans le fichier');
      _loadFromScanPayload(data);
      document.getElementById('content').innerHTML = `
        <div class="empty">
          <div class="icon">✅</div>
          <p><strong>${_articles.size} refs</strong> chargées<br>
          Agence : ${_esc(data.store || '—')}<br>
          <span style="font-size:10px;color:var(--t3)">Scannez un code article</span></p>
        </div>`;
      _saveScanToIDB(data);
      input.focus();
    } catch (e) {
      document.getElementById('content').innerHTML = `
        <div class="notfound"><div class="icon">❌</div><p>Erreur : ${_esc(e.message)}</p></div>`;
    }
  };
  reader.readAsText(file);
}
window.importScanFile = importScanFile;

// ── Purge cache ───────────────────────────────────────────────────────
async function purgeCache() {
  if (!confirm('Supprimer toutes les données scan en cache ?')) return;
  try {
    const db = await _openDB();
    try {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      tx.objectStore(IDB_STORE).delete('scan-import');
      tx.objectStore(IDB_STORE).delete('scan');
      await new Promise((resolve, reject) => { tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); });
    } finally {
      try { db.close(); } catch (_) {}
    }
  } catch (_) {}
  _articles = null;
  _eanMap = null;
  _refMap = null;
  _actionMap.clear();
  _saveActions();
  try { localStorage.removeItem(_LS_KEY); } catch(_) {}
  _scanCount = 0;
  document.getElementById('refCount').textContent = '—';
  document.getElementById('scanCount').textContent = '';
  _updateActionBadge();
  _showImportFallback();
}
window.purgeCache = purgeCache;

// ── Service Worker (cache offline) ─────────────────────────────────────
// Ne pas désenregistrer/vider les caches à chaque load : trop agressif sur iOS.
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').then(reg => {
    try { reg.update?.(); } catch (_) {}
  }).catch(() => {});
}

// ── Init ───────────────────────────────────────────────────────────────
_loadActions();
loadData();

// Charger EAN + refs fournisseur depuis le catalogue (indépendant de l'IDB)
fetch('js/catalogue-marques.json', { cache: 'no-cache' }).then(r => r.ok ? r.json() : null).then(data => {
  if (!data) return;
  if (data.E && !_eanMap) {
    _eanMap = new Map();
    for (const [ean, code] of Object.entries(data.E)) _eanMap.set(ean, code);
    console.log('[Scan] EAN chargés : ' + _eanMap.size);
  }
  if (data.R) {
    _refMap = new Map();
    for (const [ref, code] of Object.entries(data.R)) {
      _refMap.set(ref, code);
      // Enrichir l'article avec la ref fournisseur pour la recherche multi-mots
      const art = _articles?.get(code);
      if (art) art._refFourn = ref;
    }
    console.log('[Scan] Refs fournisseur chargées : ' + _refMap.size);
  }
}).catch(() => {});

// ── File d'actions terrain ─────────────────────────────────────────
function _saveActions() {
  try {
    const json = JSON.stringify([..._actionMap.values()]);
    localStorage.setItem(_AQ_KEY, json);
    // Vérification immédiate
    const check = localStorage.getItem(_AQ_KEY);
    console.log('[Scan] 💾 Actions sauvées: ' + _actionMap.size + ' articles, ' + json.length + ' octets, relecture OK: ' + (check === json));
  } catch(e) { console.error('[Scan] ❌ Erreur save actions:', e); }
}
function _loadActions() {
  try {
    const s = localStorage.getItem(_AQ_KEY);
    console.log('[Scan] 📂 Actions localStorage: ' + (s ? s.length + ' octets' : 'VIDE'));
    if (s) {
      const arr = JSON.parse(s);
      _actionMap.clear();
      for (const a of arr) _actionMap.set(a.code, a);
      console.log('[Scan] ✅ ' + _actionMap.size + ' actions restaurées');
      _updateActionBadge();
    }
  } catch(e) { console.error('[Scan] ❌ Erreur load actions:', e); }
}

function addAction(code, type, detail) {
  const r = _articles?.get(code);
  if (!r) return;
  const existing = _actionMap.get(code) || {
    code, libelle: r.libelle || '', famille: r.famille || '',
    emplacement: r.emplacement || '', ts: new Date().toISOString()
  };
  // Upsert: merge correction into the article's record
  if (type === 'retour') existing.retour = detail;
  else if (type === 'commander') existing.commander = detail;
  else if (type === 'corriger_erp') existing.corriger_erp = detail;
  else if (type === 'emplacement') existing.nouvelEmplacement = detail;
  else if (type === 'inventaire') existing.inventaire = detail;
  existing.ts = new Date().toISOString();
  _actionMap.set(code, existing);
  _saveActions();
  _updateActionBadge();
  _vibrate();
}
window.addAction = addAction;

function _editEmp(code, ancienEmp) {
  const cell = document.getElementById('empVal');
  if (!cell) return;
  _refocusLocked = true;
  cell.outerHTML = `<div onclick="event.stopPropagation()" style="display:flex;align-items:center;gap:4px;justify-content:center">
    <input type="text" id="empInput" value="${_esc(ancienEmp === '—' ? '' : ancienEmp)}" placeholder="Empl."
      style="width:70px;padding:4px;border-radius:6px;border:2px solid var(--act);background:var(--card);color:var(--t1);font-size:14px;font-weight:700;text-align:center;text-transform:uppercase"
      autocomplete="off">
    <button onclick="event.stopPropagation();_validateEmp('${code}','${_esc(ancienEmp)}')"
      style="padding:4px 8px;border-radius:6px;border:none;background:var(--green);color:#000;font-size:14px;font-weight:700;cursor:pointer">✓</button>
  </div>`;
  const inp = document.getElementById('empInput');
  inp.focus();
  inp.select();
  inp.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); _validateEmp(code, ancienEmp); }
  });
}
window._editEmp = _editEmp;

function _validateEmp(code, ancienEmp) {
  const inp = document.getElementById('empInput');
  const nouvelEmp = (inp?.value || '').trim().toUpperCase();
  if (!nouvelEmp) { inp?.focus(); return; }
  if (nouvelEmp !== ancienEmp) {
    addAction(code, 'emplacement', ancienEmp + ' → ' + nouvelEmp);
    // Mettre à jour l'article local
    const r = _articles?.get(code);
    if (r) r.emplacement = nouvelEmp;
  }
  _renderCard(code);
  _vibrate();
  setTimeout(() => { _refocusLocked = false; }, 400);
}
window._validateEmp = _validateEmp;

function _editStock(code, currentStock) {
  const cell = document.getElementById('stockVal');
  if (!cell) return;
  _refocusLocked = true;
  cell.outerHTML = `<div onclick="event.stopPropagation()" style="display:flex;align-items:center;gap:4px;justify-content:center">
    <input type="number" id="stockInput" inputmode="numeric" pattern="[0-9]*" value="${currentStock}"
      style="width:60px;padding:6px;border-radius:8px;border:2px solid var(--act);background:var(--card);color:var(--t1);font-size:22px;font-weight:900;text-align:center;font-variant-numeric:tabular-nums"
      autocomplete="off">
    <button onclick="event.stopPropagation();_applyStockCorrection('${code}',${currentStock})"
      style="padding:6px 10px;border-radius:8px;border:none;background:var(--green);color:#000;font-size:16px;font-weight:700;cursor:pointer">✓</button>
  </div>`;
  const inp = document.getElementById('stockInput');
  inp.focus();
  inp.select();
  inp.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); _applyStockCorrection(code, currentStock); }
  });
}
window._editStock = _editStock;

function _applyStockCorrection(code, ancienStock) {
  const inp = document.getElementById('stockInput');
  const nv = parseInt(inp?.value, 10);
  if (isNaN(nv) || nv < 0) { inp?.focus(); return; }
  // Update local article data
  const r = _articles?.get(code);
  if (!r) return;
  r.stockActuel = nv;
  // Record in action map if different from ERP
  if (nv !== ancienStock) {
    addAction(code, 'inventaire', 'Stock: ' + ancienStock + ' → ' + nv);
  }
  // Mode inventaire : mettre à jour le stock compté
  if (_invMode && _invEmpl) {
    _invScanned.set(code, { stock: nv, confirmed: true, corrected: nv !== ancienStock });
    _saveInv();
    _updateInvBanner();
  }
  // Re-render the full card with updated stock & recalculated actions
  _renderCard(code);
  _vibrate();
  // Relâcher le lock refocus après le re-render (laisse le temps au DOM de se stabiliser)
  setTimeout(() => { _refocusLocked = false; }, 400);
}
window._applyStockCorrection = _applyStockCorrection;

function _editRetour(code, surplus, stock, effMax) {
  const el = document.getElementById('retourQte');
  if (!el) return;
  _refocusLocked = true;
  el.outerHTML = `<input type="number" id="retourInput" inputmode="numeric" pattern="[0-9]*" value="${surplus}"
    style="width:50px;padding:4px;border-radius:6px;border:2px solid #fff;background:rgba(255,255,255,.15);color:#fff;font-size:18px;font-weight:900;text-align:center"
    min="1" max="${stock}" autocomplete="off">`;
  const inp = document.getElementById('retourInput');
  inp.focus();
  inp.select();
  inp.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); _confirmRetour(code, null, stock, effMax); }
  });
}
window._editRetour = _editRetour;

function _confirmRetour(code, defaultQte, stock, effMax) {
  const inp = document.getElementById('retourInput');
  const qte = inp ? parseInt(inp.value, 10) : defaultQte;
  if (!qte || qte <= 0) return;
  addAction(code, 'retour', 'Retour centrale: ' + qte + ' pièces (stock ' + stock + ' vs MAX ' + effMax + ')');
  // Feedback visuel figé — pas de re-render
  const zone = document.querySelector('.action-surstock');
  if (zone) {
    zone.innerHTML = '<span style="font-size:16px;font-weight:700">✓ Noté · ' + qte + ' pcs à renvoyer</span>';
    zone.style.pointerEvents = 'none';
    zone.style.opacity = '.6';
  }
  _vibrate();
  _refocusLocked = false;
  _refocus();
}
window._confirmRetour = _confirmRetour;

// ── Auto-focus Zebra ─────────────────────────────────────────────────
function _refocus() {
  setTimeout(() => { input.value = ''; clearBtn.style.display = 'none'; input.focus(); }, 150);
}

// Blur listener : si le focus quitte la barre de recherche et qu'aucun
// autre input n'est actif, on remet le focus automatiquement (Zebra)
let _refocusLocked = false;
if (_scanMode) {
  document.addEventListener('click', (e) => {
    if (_refocusLocked) return;
    const tag = e.target.tagName;
    if (tag === 'INPUT' || tag === 'BUTTON' || tag === 'A') return;
    setTimeout(() => { if (!_refocusLocked) input.focus(); }, 100);
  });
}

function _vibrate() { try { navigator.vibrate?.(50); } catch(_){} }

function _updateActionBadge() {
  const badge = document.getElementById('actionBadge');
  if (!badge) return;
  const n = _actionMap.size;
  badge.textContent = n;
  badge.style.display = n > 0 ? 'flex' : 'none';
}

// ── Code 128B — encodeur SVG inline (zéro dépendance) ─────────────────
function _barcode128(text) {
  const P = [
    '212222','222122','222221','121223','121322','131222','122213','122312','132212','221213',
    '221312','231212','112232','122132','122231','113222','123122','123221','223211','221132',
    '221231','213212','223112','312131','311222','321122','321221','312212','322112','322211',
    '212123','212321','232121','111323','131123','131321','112313','132113','132311','211313',
    '231113','231311','112133','112331','132131','113123','113321','133121','313121','211331',
    '231131','213113','213311','213131','311123','311321','331121','312113','312311','332111',
    '314111','221411','431111','111224','111422','121124','121421','141122','141221','112214',
    '112412','122114','122411','142112','142211','241211','221114','413111','241112','134111',
    '111242','121142','121241','114212','124112','124211','411212','421112','421211','212141',
    '214121','412121','111143','111341','131141','114113','114311','411113','411311','113141',
    '114131','311141','411131','211412','211214','211232','2331112'
  ];
  const codes = [104]; // Start B
  let chk = 104;
  for (let i = 0; i < text.length; i++) {
    const v = text.charCodeAt(i) - 32;
    codes.push(v);
    chk += v * (i + 1);
  }
  codes.push(chk % 103);
  codes.push(106); // Stop
  let bars = '', x = 0;
  for (const c of codes) {
    const p = P[c];
    for (let j = 0; j < p.length; j++) {
      const w = +p[j];
      if (j % 2 === 0) bars += `<rect x="${x}" y="0" width="${w * 2}" height="50"/>`;
      x += w * 2;
    }
  }
  return `<svg viewBox="-10 -4 ${x + 20} 58" height="50" style="background:#fff;border-radius:4px;padding:2px 6px">${bars}</svg>`;
}

function showActions() {
  const el = document.getElementById('content');
  if (!_actionMap.size) {
    el.innerHTML = '<div class="empty"><div class="icon">📋</div><p>Aucune action en file.<br><span style="font-size:11px;color:var(--t3)">Scannez des articles pour ajouter des actions.</span></p></div>';
    return;
  }
  const entries = [..._actionMap.values()].sort((a, b) => a.code.localeCompare(b.code));
  let html = '<div style="padding:8px 0">'
    + '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">'
    + '<strong style="font-size:15px">' + entries.length + ' article' + (entries.length > 1 ? 's' : '') + ' à corriger</strong>'
    + '<button onclick="exportActions()" style="padding:6px 14px;border-radius:8px;border:none;background:var(--act);color:#fff;font-size:13px;font-weight:600;cursor:pointer">Exporter CSV</button>'
    + '</div>';
  for (const a of entries) {
    // Ligne 1 : CODE en géant + bouton supprimer
    // Ligne 2 : Libellé en gris (souffleur de vérification)
    // Ligne 3 : Actions dans l'ordre ERP : Emplacement → MIN/MAX → Stock
    // Ligne 4 : Commande/Retour séparés (badge distinct)
    const actions = [];
    if (a.nouvelEmplacement) {
      const empParts = a.nouvelEmplacement.split(' → ');
      const empAnc = empParts[0] || '';
      const empNv = empParts[1] || empParts[0] || '';
      actions.push('<div style="display:flex;align-items:center;gap:6px"><span style="color:var(--amber);font-size:14px">📍</span><span style="color:var(--t2);font-size:13px">Empl.</span>' + (empParts.length > 1 ? '<span style="color:var(--t3);font-size:13px;text-decoration:line-through">' + _esc(empAnc) + '</span><span style="color:var(--t2);font-size:13px">→</span>' : '') + '<span style="color:var(--amber);font-size:16px;font-weight:900">' + _esc(empNv) + '</span></div>');
    }
    if (a.corriger_erp) {
      const mmParts = a.corriger_erp.replace('Corriger ERP: ', '').split(' → ');
      const ancien = mmParts[0] || '';
      const nouveau = mmParts[1] || '';
      actions.push('<div style="display:flex;align-items:center;gap:6px"><span style="color:var(--act);font-size:16px">🔄</span><span style="color:var(--t2);font-size:13px">MIN/MAX</span><span style="color:var(--t3);font-size:15px;text-decoration:line-through">' + _esc(ancien) + '</span><span style="color:var(--t2);font-size:15px">→</span><span style="color:var(--green);font-size:22px;font-weight:900;letter-spacing:1px">' + _esc(nouveau) + '</span></div>');
    }
    if (a.inventaire) {
      const stParts = a.inventaire.replace('Stock: ', '').split(' → ');
      const stAnc = stParts[0] || '';
      const stNv = stParts[1] || '';
      const _delta = parseInt(stNv, 10) - parseInt(stAnc, 10);
      const _deltaStr = _delta > 0 ? '+' + _delta : '' + _delta;
      const _deltaColor = _delta > 0 ? 'var(--green)' : 'var(--red)';
      actions.push('<div style="display:flex;align-items:center;gap:6px"><span style="color:var(--green);font-size:14px">📋</span><span style="color:var(--t2);font-size:13px">Stock</span><span style="color:var(--t3);font-size:15px;text-decoration:line-through">' + _esc(stAnc) + '</span><span style="color:var(--t2);font-size:13px">→</span><span style="color:var(--green);font-size:20px;font-weight:900">' + _esc(stNv) + '</span><span style="color:' + _deltaColor + ';font-size:14px;font-weight:800;padding:2px 6px;border-radius:6px;background:rgba(255,255,255,.06)">ajuster ' + _deltaStr + '</span></div>');
    }
    // Commande / Retour — badges séparés
    const badges = [];
    if (a.commander) badges.push('<div style="display:inline-flex;align-items:center;gap:4px;padding:4px 10px;border-radius:8px;background:rgba(248,113,113,.15);color:var(--red);font-size:13px;font-weight:700">🚨 ' + _esc(a.commander.replace('Commander: ', '')) + '</div>');
    if (a.retour) badges.push('<div style="display:inline-flex;align-items:center;gap:4px;padding:4px 10px;border-radius:8px;background:rgba(167,139,250,.15);color:var(--violet);font-size:13px;font-weight:700">📦 ' + _esc(a.retour.replace('Retour centrale: ', '')) + '</div>');

    html += '<div style="padding:12px;margin-bottom:8px;background:var(--card);border-radius:12px;border:1px solid var(--border)">'
      // Ligne 1 : Code géant + barcode + supprimer
      + '<div style="display:flex;justify-content:space-between;align-items:center">'
      + '<span style="font-size:22px;font-weight:900;color:var(--t1);letter-spacing:2px;font-variant-numeric:tabular-nums">' + _esc(a.code) + '</span>'
      + '<div style="display:flex;align-items:center;gap:8px">' + _barcode128(a.code)
      + '<button onclick="removeAction(\'' + a.code + '\')" style="background:none;border:none;color:var(--t3);font-size:18px;cursor:pointer;padding:4px">✕</button>'
      + '</div></div>'
      // Ligne 2 : Libellé souffleur
      + '<div style="font-size:12px;color:var(--t3);margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + _esc(a.libelle) + ' · ' + _esc(a.emplacement) + '</div>'
      // Ligne 3 : Actions dans l'ordre ERP
      + (actions.length ? '<div style="margin-top:8px;display:flex;flex-direction:column;gap:4px">' + actions.join('') + '</div>' : '')
      // Ligne 4 : Badges commande/retour
      + (badges.length ? '<div style="margin-top:8px;display:flex;flex-wrap:wrap;gap:6px">' + badges.join('') + '</div>' : '')
      + '</div>';
  }
  html += '</div>';
  el.innerHTML = html;
}
window.showActions = showActions;

function removeAction(code) {
  _actionMap.delete(code);
  _saveActions();
  _updateActionBadge();
  showActions();
}
window.removeAction = removeAction;

function exportActions() {
  if (!_actionMap.size) return;
  const sep = ';';
  const header = ['Code', 'Libellé', 'Famille', 'Emplacement actuel', 'NV_STOCK', 'Corriger MIN/MAX', 'Commander', 'Retour centrale', 'Nouvel emplacement'].join(sep);
  const entries = [..._actionMap.values()].sort((a, b) => a.code.localeCompare(b.code));
  const rows = entries.map(a =>
    [a.code, a.libelle, a.famille, a.emplacement,
     a.inventaire || '', a.corriger_erp || '', a.commander || '', a.retour || '', a.nouvelEmplacement || ''
    ].map(v => '"' + (v || '').replace(/"/g, '""') + '"').join(sep)
  );
  const csv = '\uFEFF' + header + '\n' + rows.join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'prisme-corrections-' + new Date().toISOString().slice(0, 10) + '.csv'; a.click();
  URL.revokeObjectURL(url);
}
window.exportActions = exportActions;

// ══════════════════════════════════════════════════════════════════════════
// MODE INVENTAIRE — scan exhaustif par emplacement
// ══════════════════════════════════════════════════════════════════════════

let _invMode = false;
let _invEmpl = '';           // emplacement en cours
let _invScanned = new Map(); // Map<code, {stock, confirmed}>
const _INV_KEY = 'prisme_scan_inventaire';

function _saveInv() {
  const data = { empl: _invEmpl, scanned: Object.fromEntries(_invScanned) };
  localStorage.setItem(_INV_KEY, JSON.stringify(data));
}
function _restoreInv() {
  try {
    const raw = localStorage.getItem(_INV_KEY);
    if (!raw) return;
    const data = JSON.parse(raw);
    _invEmpl = data.empl || '';
    _invScanned = new Map(Object.entries(data.scanned || {}));
  } catch(_) {}
}

function toggleInventaire() {
  if (_invMode) {
    // Quitter le mode inventaire
    if (_invScanned.size > 0 && !confirm('Quitter le mode inventaire ? Les données scannées seront conservées.')) return;
    _invMode = false;
    _invEmpl = '';
    document.getElementById('invBtn').style.background = 'transparent';
    document.getElementById('invBtn').style.color = 'var(--t2)';
    _hideInvBanner();
    input.placeholder = 'Code, libellé ou emplacement…';
    document.getElementById('content').innerHTML = '<div class="empty"><div class="icon">📦</div><p>Scannez un code article<br>ou tapez-le au clavier</p></div>';
    return;
  }
  // Activer le mode inventaire → demander l'emplacement
  _invMode = true;
  document.getElementById('invBtn').style.background = 'var(--amber)';
  document.getElementById('invBtn').style.color = '#000';
  _showEmplPicker();
}
window.toggleInventaire = toggleInventaire;

function _showEmplPicker() {
  const el = document.getElementById('content');
  // Collecter les emplacements uniques depuis les articles
  const empls = new Map();
  if (_articles) {
    for (const [code, r] of _articles) {
      const e = (r.emplacement || '').trim().toUpperCase();
      if (e && e !== '—') {
        if (!empls.has(e)) empls.set(e, 0);
        empls.set(e, empls.get(e) + 1);
      }
    }
  }
  const sorted = [...empls.entries()].sort((a, b) => a[0].localeCompare(b[0]));

  el.innerHTML = `<div style="padding:16px 0">
    <h2 style="font-size:16px;font-weight:800;margin-bottom:12px">📋 Mode Inventaire</h2>
    <p style="font-size:12px;color:var(--t2);margin-bottom:16px">Sélectionnez ou scannez l'emplacement à inventorier.</p>
    <input type="text" id="invEmplInput" placeholder="Emplacement…" autocomplete="off"
      style="width:100%;padding:12px;font-size:16px;font-weight:700;border-radius:10px;border:2px solid var(--border);background:var(--card);color:var(--t1);text-transform:uppercase;margin-bottom:12px;letter-spacing:1px">
    ${sorted.length ? `<div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:16px">${sorted.map(([e, n]) =>
      `<button onclick="startInventaire('${_esc(e)}')" style="padding:6px 12px;border-radius:8px;border:1px solid var(--border);background:var(--card);color:var(--t1);font-size:12px;font-weight:600;cursor:pointer">${_esc(e)} <span style="color:var(--t3);font-size:10px">${n}</span></button>`
    ).join('')}</div>` : ''}
    <button onclick="startInventaire(document.getElementById('invEmplInput').value)" style="width:100%;padding:14px;border-radius:12px;border:none;background:var(--amber);color:#000;font-size:16px;font-weight:700;cursor:pointer">Démarrer l'inventaire</button>
  </div>`;
  const inp = document.getElementById('invEmplInput');
  // Zebra scanne toujours dans le main input → changer son placeholder
  input.placeholder = 'Scannez ou tapez l\'emplacement…';
  input.value = '';
  input.focus();
  inp.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); startInventaire(inp.value); }
  });
}

function startInventaire(empl) {
  empl = (empl || '').trim().toUpperCase();
  if (!empl) { alert('Entrez un emplacement'); return; }
  _invEmpl = empl;
  input.placeholder = 'Code, libellé ou emplacement…';
  _invScanned = new Map();
  _saveInv();
  _showInvBanner();
  // Prêt à scanner
  const el = document.getElementById('content');
  const expected = _getExpectedArticles();
  el.innerHTML = `<div class="empty"><div class="icon">📦</div><p>Emplacement <strong>${_esc(empl)}</strong><br>${expected.length} articles attendus dans l'ERP<br><br>Scannez le premier article</p></div>`;
  input.focus();
}
window.startInventaire = startInventaire;

function _getExpectedArticles() {
  if (!_articles) return [];
  const results = [];
  for (const [code, r] of _articles) {
    const e = (r.emplacement || '').trim().toUpperCase();
    if (e === _invEmpl) results.push(r);
  }
  return results;
}

function _showInvBanner() {
  let banner = document.getElementById('invBanner');
  if (!banner) {
    banner = document.createElement('div');
    banner.id = 'invBanner';
    banner.style.cssText = 'padding:6px 12px;background:rgba(251,191,36,.15);border-bottom:1px solid rgba(251,191,36,.3);display:flex;align-items:center;justify-content:space-between;font-size:12px;font-weight:700;color:var(--amber)';
    const searchWrap = document.querySelector('.search-wrap');
    searchWrap.parentNode.insertBefore(banner, searchWrap.nextSibling);
  }
  _updateInvBanner();
}

function _hideInvBanner() {
  const banner = document.getElementById('invBanner');
  if (banner) banner.remove();
}

function _updateInvBanner() {
  const banner = document.getElementById('invBanner');
  if (!banner) return;
  const expected = _getExpectedArticles();
  const n = _invScanned.size;
  const total = expected.length;
  banner.innerHTML = `<span>📋 ${_esc(_invEmpl)} — ${n} / ${total} scannés</span>`
    + `<button onclick="showInvSummary()" style="padding:3px 10px;border-radius:6px;border:1px solid var(--amber);background:transparent;color:var(--amber);font-size:11px;font-weight:700;cursor:pointer">Bilan</button>`;
}


function showInvSummary() {
  const el = document.getElementById('content');
  const expected = _getExpectedArticles().sort((a, b) => a.code.localeCompare(b.code));
  const scanned = _invScanned;

  // Séparer : scannés vs non-scannés
  const lignesScannees = [];
  const lignesNonScannees = [];

  for (const r of expected) {
    if (scanned.has(r.code)) {
      const s = scanned.get(r.code);
      lignesScannees.push({ ...r, invStock: s.stock, corrected: s.corrected || false });
    } else {
      lignesNonScannees.push(r);
    }
  }

  // Articles scannés mais pas dans l'emplacement ERP (rajouts)
  const lignesExtras = [];
  for (const [code, s] of scanned) {
    const r = _articles?.get(code);
    if (r && (r.emplacement || '').trim().toUpperCase() !== _invEmpl) {
      lignesExtras.push({ ...r, invStock: s.stock, corrected: s.corrected || false, extra: true });
    }
  }

  let html = `<div style="padding:12px 0">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
      <h2 style="font-size:16px;font-weight:800">📋 Bilan — ${_esc(_invEmpl)}</h2>
      <button onclick="exportInventaire()" style="padding:6px 14px;border-radius:8px;border:none;background:var(--act);color:#fff;font-size:13px;font-weight:600;cursor:pointer">Exporter CSV</button>
    </div>
    <div style="display:flex;gap:8px;margin-bottom:16px">
      <div style="flex:1;padding:10px;border-radius:10px;background:rgba(34,197,94,.15);text-align:center">
        <div style="font-size:22px;font-weight:900;color:var(--green)">${lignesScannees.length}</div>
        <div style="font-size:11px;color:var(--t2)">Scannés</div>
      </div>
      <div style="flex:1;padding:10px;border-radius:10px;background:rgba(248,113,113,.15);text-align:center">
        <div style="font-size:22px;font-weight:900;color:var(--red)">${lignesNonScannees.length}</div>
        <div style="font-size:11px;color:var(--t2)">Non vérifiés</div>
      </div>
      <div style="flex:1;padding:10px;border-radius:10px;background:rgba(96,165,250,.15);text-align:center">
        <div style="font-size:22px;font-weight:900;color:var(--act)">${expected.length}</div>
        <div style="font-size:11px;color:var(--t2)">Attendus ERP</div>
      </div>
    </div>`;

  // Non-scannés en premier (priorité)
  if (lignesNonScannees.length > 0) {
    html += `<div style="margin-bottom:16px">
      <h3 style="font-size:13px;font-weight:700;color:var(--red);margin-bottom:8px">⚠️ Non vérifiés — à contrôler en priorité</h3>`;
    for (const r of lignesNonScannees) {
      html += `<div style="padding:8px 12px;margin-bottom:4px;background:var(--card);border-radius:8px;border:1px solid rgba(248,113,113,.3);display:flex;align-items:center;justify-content:space-between;cursor:pointer" onclick="input.value='${r.code}';lookup('${r.code}')">
        <div>
          <span style="font-size:14px;font-weight:800;letter-spacing:1px">${_esc(r.code)}</span>
          <span style="font-size:11px;color:var(--t3);margin-left:8px">${_esc((r.libelle || '').slice(0, 30))}</span>
        </div>
        <div style="text-align:right">
          <span style="font-size:13px;font-weight:700">Stock ERP: ${r.stockActuel || 0}</span>
          <span style="font-size:11px;color:var(--red);margin-left:6px">Non vérifié</span>
        </div>
      </div>`;
    }
    html += '</div>';
  }

  // Scannés
  if (lignesScannees.length > 0) {
    html += `<div style="margin-bottom:16px">
      <h3 style="font-size:13px;font-weight:700;color:var(--green);margin-bottom:8px">✅ Vérifiés (${lignesScannees.length})</h3>`;
    for (const r of lignesScannees) {
      const delta = r.invStock - (r.stockActuel || 0);
      const deltaHtml = r.corrected && delta !== 0 ? `<span style="color:${delta > 0 ? 'var(--green)' : 'var(--red)'};font-size:12px;font-weight:700;margin-left:4px">${delta > 0 ? '+' : ''}${delta}</span>` : '';
      html += `<div style="padding:6px 12px;margin-bottom:2px;background:var(--card);border-radius:8px;border:1px solid var(--border);display:flex;align-items:center;justify-content:space-between">
        <div>
          <span style="font-size:13px;font-weight:700;letter-spacing:1px">${_esc(r.code)}</span>
          <span style="font-size:11px;color:var(--t3);margin-left:6px">${_esc((r.libelle || '').slice(0, 25))}</span>
        </div>
        <div style="font-size:13px;font-weight:700">${r.invStock}${deltaHtml}</div>
      </div>`;
    }
    html += '</div>';
  }

  // Extras (pas dans l'emplacement ERP)
  if (lignesExtras.length > 0) {
    html += `<div>
      <h3 style="font-size:13px;font-weight:700;color:var(--amber);margin-bottom:8px">📍 Hors emplacement — trouvés ici mais ERP dit ailleurs</h3>`;
    for (const r of lignesExtras) {
      html += `<div style="padding:6px 12px;margin-bottom:2px;background:var(--card);border-radius:8px;border:1px solid rgba(251,191,36,.3);display:flex;align-items:center;justify-content:space-between">
        <div>
          <span style="font-size:13px;font-weight:700">${_esc(r.code)}</span>
          <span style="font-size:11px;color:var(--t3);margin-left:6px">${_esc((r.libelle || '').slice(0, 25))}</span>
        </div>
        <div style="font-size:11px;color:var(--amber)">ERP: ${_esc(r.emplacement || '—')}</div>
      </div>`;
    }
    html += '</div>';
  }

  html += '</div>';
  el.innerHTML = html;
}
window.showInvSummary = showInvSummary;

function exportInventaire() {
  const expected = _getExpectedArticles().sort((a, b) => a.code.localeCompare(b.code));
  const scanned = _invScanned;
  const sep = ';';
  const header = ['Code', 'Libellé', 'Famille', 'Emplacement', 'Stock ERP', 'Stock inventorié', 'Écart', 'Statut'].join(sep);
  const rows = [];

  for (const r of expected) {
    const s = scanned.get(r.code);
    const stockERP = r.stockActuel || 0;
    const stockInv = s ? s.stock : '';
    const ecart = s ? (s.stock - stockERP) : '';
    const statut = s ? (s.corrected ? 'Corrigé' : 'OK') : 'Non vérifié';
    rows.push([r.code, r.libelle, r.famille, _invEmpl, stockERP, stockInv, ecart, statut]
      .map(v => '"' + String(v ?? '').replace(/"/g, '""') + '"').join(sep));
  }

  // Extras
  for (const [code, s] of scanned) {
    const r = _articles?.get(code);
    if (!r) continue;
    if ((r.emplacement || '').trim().toUpperCase() === _invEmpl) continue;
    rows.push([r.code, r.libelle, r.famille, r.emplacement || '', r.stockActuel || 0, s.stock, '', 'Hors emplacement']
      .map(v => '"' + String(v ?? '').replace(/"/g, '""') + '"').join(sep));
  }

  const csv = '\uFEFF' + header + '\n' + rows.join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'prisme-inventaire-' + _invEmpl + '-' + new Date().toISOString().slice(0, 10) + '.csv'; a.click();
  URL.revokeObjectURL(url);
}
window.exportInventaire = exportInventaire;
