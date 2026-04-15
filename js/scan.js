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
let _actionQueue = [];  // File d'actions terrain [{code, libelle, action, detail, ts}]

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
      console.log('[Scan] IDB scan:', data ? 'finalData=' + (data.finalData?.length || 0) : 'vide');

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
        if (dataEffective.ventesParMagasin) {
          const myStore = dataEffective.selectedMyStore || '';
          const vpm = dataEffective.ventesParMagasin;
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
        document.getElementById('refCount').textContent = _articles.size + ' refs';
        if (dataEffective.ean && !_eanMap) {
          _eanMap = new Map();
          for (const [ean, code] of Object.entries(dataEffective.ean)) _eanMap.set(ean, code);
          console.log('[Scan] EAN depuis IDB : ' + _eanMap.size);
        }
        console.log('[Scan] ' + _articles.size + ' articles chargés depuis IDB (scan/session)');
        _saveToLS();
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
  document.getElementById('refCount').textContent = _articles.size + ' refs';
  document.getElementById('importZone').style.display = 'none';
  _saveToLS();
}

// ── localStorage fallback (Safari iOS purge IDB) ─────────────────────
const _LS_KEY = 'prisme_scan_data';
// Champs utiles au scan — on élimine le reste pour tenir dans ~2-3 Mo
const _SCAN_FIELDS = ['code','libelle','famille','sousFamille','emplacement','statut',
  'stockActuel','prixMoyenReseau','txMargeReseau','W','V','ancienMin','ancienMax',
  'nouveauMin','nouveauMax','couvertureJours','abcClass','fmrClass','matriceVerdict',
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

function _loadFromLS() {
  try {
    const raw = localStorage.getItem(_LS_KEY);
    if (!raw) return false;
    const data = JSON.parse(raw);
    if (!data.articles?.length) return false;
    _articles = new Map();
    for (const r of data.articles) _articles.set(r.code, r);
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
  const deficit = min > 0 && stock < min ? min - stock : 0;

  // Action button
  let actionHtml = '';
  if (surplus > 0) {
    actionHtml = `<button class="action-btn action-surstock" onclick="addAction('${r.code}','retour','Retour centrale: ${surplus} pièces (stock ${stock} vs MAX ${effectiveMax})')">
      📦 Retour centrale · <strong>${surplus} pcs</strong></button>`;
  } else if (stock === 0 && min > 0) {
    actionHtml = `<button class="action-btn action-rupture" onclick="addAction('${r.code}','commander','Commander: rupture (MIN ${min})')">
      🚨 Commander · MIN <strong>${min}</strong></button>`;
  } else if (hasNewMM && (erpMin !== min || erpMax !== max)) {
    actionHtml = `<button class="action-btn action-erp" onclick="addAction('${r.code}','corriger_erp','Corriger ERP: ${erpMin}/${erpMax} → ${min}/${max}')">
      🔄 Corriger ERP · ${min} / ${max}</button>`;
  }

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
      <div class="hero-cell">
        <div class="hero-val" style="color:${stock > 0 ? 'var(--green)' : 'var(--red)'}">${stock}</div>
        <div class="hero-label">STOCK <span style="color:var(--t3)">${couv}</span></div>
      </div>
      <div class="hero-cell">
        <div class="hero-val hero-emp">${_esc(emp)}</div>
        <div class="hero-label">EMPL.</div>
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
  // Zebra : vider l'input pour que le prochain scan ne concatène pas
  input.value = '';
  clearBtn.style.display = 'none';
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
function _euro(n) { return n.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }); }

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

// Enter = DataWedge suffix → lookup immédiat (Zebra)
input.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    const code = input.value.trim();
    if (code) { _clearSuggestions(); lookup(code); }
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
  _actionQueue = [];
  _saveActions();
  try { localStorage.removeItem(_LS_KEY); } catch(_) {}
  _scanCount = 0;
  document.getElementById('refCount').textContent = '—';
  document.getElementById('scanCount').textContent = '';
  _updateActionBadge();
  _showImportFallback();
}
window.purgeCache = purgeCache;

// ── Service Worker ─────────────────────────────────────────────────────
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}

// ── Init ───────────────────────────────────────────────────────────────
loadData();
_loadActions();

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
const _AQ_KEY = 'prisme_scan_actions';
function _saveActions() { try { localStorage.setItem(_AQ_KEY, JSON.stringify(_actionQueue)); } catch(_){} }
function _loadActions() { try { const s = localStorage.getItem(_AQ_KEY); if (s) { _actionQueue = JSON.parse(s); _updateActionBadge(); } } catch(_){} }

function addAction(code, type, detail) {
  const r = _articles?.get(code);
  if (!r) return;
  if (_actionQueue.some(a => a.code === code && a.type === type)) {
    _vibrate(); return;
  }
  _actionQueue.push({ code, libelle: r.libelle || '', famille: r.famille || '', emplacement: r.emplacement || '', type, detail, ts: new Date().toISOString() });
  _saveActions();
  _updateActionBadge();
  _vibrate();
  const btn = document.querySelector('.action-btn');
  if (btn) { btn.textContent = '✓ Noté'; btn.disabled = true; btn.style.opacity = '.5'; }
}
window.addAction = addAction;

function _vibrate() { try { navigator.vibrate?.(50); } catch(_){} }

function _updateActionBadge() {
  const badge = document.getElementById('actionBadge');
  if (!badge) return;
  badge.textContent = _actionQueue.length;
  badge.style.display = _actionQueue.length > 0 ? 'flex' : 'none';
}

function showActions() {
  const el = document.getElementById('content');
  if (!_actionQueue.length) {
    el.innerHTML = '<div class="empty"><div class="icon">📋</div><p>Aucune action en file.<br><span style="font-size:11px;color:var(--t3)">Scannez des articles pour ajouter des actions.</span></p></div>';
    return;
  }
  const typeLabels = { retour: '📦 Retour', commander: '🚨 Commander', corriger_erp: '🔄 Corriger ERP' };
  const typeColors = { retour: 'var(--violet)', commander: 'var(--red)', corriger_erp: 'var(--act)' };
  let html = '<div style="padding:12px 0"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px"><strong style="font-size:14px">' + _actionQueue.length + ' action' + (_actionQueue.length > 1 ? 's' : '') + ' en file</strong><button onclick="exportActions()" style="padding:6px 14px;border-radius:8px;border:none;background:var(--act);color:#fff;font-size:12px;font-weight:600;cursor:pointer">Exporter CSV</button></div>';
  for (let i = _actionQueue.length - 1; i >= 0; i--) {
    const a = _actionQueue[i];
    html += '<div style="padding:10px 12px;margin-bottom:6px;background:var(--card);border-radius:10px;border:1px solid var(--border);display:flex;align-items:center;gap:10px"><div style="flex:1;min-width:0"><div style="font-size:11px;color:var(--t3)">' + _esc(a.code) + ' · ' + _esc(a.emplacement) + '</div><div style="font-size:12px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + _esc(a.libelle) + '</div><div style="font-size:10px;color:' + (typeColors[a.type] || 'var(--t2)') + ';margin-top:2px;font-weight:600">' + (typeLabels[a.type] || a.type) + ' — ' + _esc(a.detail) + '</div></div><button onclick="removeAction(' + i + ')" style="background:none;border:none;color:var(--t3);font-size:16px;cursor:pointer;padding:4px">✕</button></div>';
  }
  html += '</div>';
  el.innerHTML = html;
}
window.showActions = showActions;

function removeAction(idx) {
  _actionQueue.splice(idx, 1);
  _saveActions();
  _updateActionBadge();
  showActions();
}
window.removeAction = removeAction;

function exportActions() {
  if (!_actionQueue.length) return;
  const sep = ';';
  const header = ['Code', 'Libellé', 'Famille', 'Emplacement', 'Action', 'Détail', 'Date'].join(sep);
  const rows = _actionQueue.map(a =>
    [a.code, a.libelle, a.famille, a.emplacement, a.type, a.detail, a.ts.slice(0, 16).replace('T', ' ')].map(v => '"' + (v || '').replace(/"/g, '""') + '"').join(sep)
  );
  const csv = '\uFEFF' + header + '\n' + rows.join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'prisme-actions-' + new Date().toISOString().slice(0, 10) + '.csv'; a.click();
  URL.revokeObjectURL(url);
}
window.exportActions = exportActions;
