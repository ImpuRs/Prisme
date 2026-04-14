'use strict';
// ── PRISME Scan — module autonome lecture IDB ──────────────────────────
// Lit finalData depuis IndexedDB PRISME, lookup par code article.
// Zéro dépendance sur main.js / state.js / store.js.

const IDB_NAME = 'PRISME';
const IDB_VERSION = 2;
const IDB_STORE = 'session';

let _articles = null;   // Map<code, article>
let _scanCount = 0;

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
  try {
    const db = await _openDB();
    const tx = db.transaction(IDB_STORE, 'readonly');
    const data = await new Promise((resolve, reject) => {
      const r = tx.objectStore(IDB_STORE).get('current');
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
    if (!data?.finalData?.length) {
      document.getElementById('content').innerHTML = `
        <div class="empty">
          <div class="icon">⚠️</div>
          <p>Aucune donnée en cache.<br>Ouvrez <a href="index.html" style="color:var(--act)">PRISME</a> et chargez vos fichiers d'abord.</p>
        </div>`;
      return;
    }
    _articles = new Map();
    for (const r of data.finalData) {
      _articles.set(r.code, r);
    }
    // Enrichir avec ventesParMagasin pour données réseau
    if (data.ventesParMagasin && data.selectedMyStore) {
      const myStore = data.selectedMyStore;
      const vpm = data.ventesParMagasin;
      const otherStores = Object.keys(vpm).filter(s => s !== myStore);
      for (const [code, r] of _articles) {
        let reseauCount = 0;
        for (const s of otherStores) {
          if (vpm[s]?.[code]?.countBL > 0) reseauCount++;
        }
        r._reseauAgences = reseauCount;
      }
    }
    document.getElementById('refCount').textContent = _articles.size + ' refs';
    console.log('[Scan] ' + _articles.size + ' articles chargés depuis IDB');
  } catch (e) {
    console.error('[Scan] Erreur chargement IDB:', e);
    document.getElementById('content').innerHTML = `
      <div class="empty">
        <div class="icon">❌</div>
        <p>Erreur de lecture IndexedDB.<br>${e.message}</p>
      </div>`;
  }
}

// ── Lookup & render ────────────────────────────────────────────────────
function lookup(code) {
  const el = document.getElementById('content');
  if (!_articles) {
    el.innerHTML = '<div class="notfound"><div class="icon">⏳</div><p>Chargement en cours…</p></div>';
    return;
  }
  // Nettoyage code : garder uniquement les chiffres
  const clean = code.replace(/\D/g, '').trim();
  if (!clean) return;

  const r = _articles.get(clean);
  if (!r) {
    el.innerHTML = `<div class="notfound"><div class="icon">🔍</div><p>Code <strong>${_esc(clean)}</strong> non trouvé<br><span style="font-size:11px;color:var(--t3)">${_articles.size} refs en mémoire</span></p></div>`;
    return;
  }

  _scanCount++;
  document.getElementById('scanCount').textContent = _scanCount + ' scan' + (_scanCount > 1 ? 's' : '') + ' cette session';

  const verdict = _verdict(r);
  const minMax = (r.nouveauMin > 0 || r.nouveauMax > 0)
    ? r.nouveauMin + ' / ' + r.nouveauMax
    : (r.ancienMin > 0 || r.ancienMax > 0 ? r.ancienMin + ' / ' + r.ancienMax : '— / —');
  const minMaxLabel = (r.nouveauMin > 0 || r.nouveauMax > 0) ? 'PRISME' : 'ERP';
  const vitTag = r._vitesseReseau
    ? (r._fallbackERP ? '<span class="vitesse-tag">(Méd. ERP)</span>' : '<span class="vitesse-tag">(Vitesse)</span>')
    : '';
  const erpReseau = (r.medMinReseau > 0 || r.medMaxReseau > 0)
    ? r.medMinReseau + ' / ' + r.medMaxReseau
    : '—';
  const stock = r.stockActuel ?? '—';
  const couv = r.couvertureJours != null && r.couvertureJours < 9999
    ? r.couvertureJours + 'j'
    : '—';
  const pu = r.prixUnitaire ? _euro(r.prixUnitaire) : '—';
  const emp = r.emplacement || '—';
  const abc = r.abcClass || '—';
  const fmr = r.fmrClass || '—';
  const reseauInfo = r._reseauAgences > 0
    ? '<strong>' + r._reseauAgences + '</strong> agence' + (r._reseauAgences > 1 ? 's' : '') + ' réseau'
    : 'Pas de données réseau';

  el.innerHTML = `<div class="card flash">
    <div class="card-head">
      <div class="code">${_esc(r.code)}</div>
      <div class="lib">${_esc(r.libelle || '—')}</div>
      <div class="fam">${_esc(r.famille || '')} ${r.sousFamille ? '· ' + _esc(r.sousFamille) : ''}</div>
      <div class="verdict" style="background:${verdict.bg};color:${verdict.color}">${verdict.label}</div>
    </div>
    <div class="grid">
      <div class="cell">
        <div class="label">Stock actuel</div>
        <div class="val" style="color:${stock > 0 ? 'var(--green)' : 'var(--red)'}">${stock}</div>
        <div class="sub">Couverture ${couv}</div>
      </div>
      <div class="cell">
        <div class="label">MIN / MAX ${minMaxLabel}${vitTag}</div>
        <div class="val">${minMax}</div>
        <div class="sub">ERP : ${r.ancienMin || 0} / ${r.ancienMax || 0}</div>
      </div>
      <div class="cell">
        <div class="label">Emplacement</div>
        <div class="val" style="font-size:16px">${_esc(emp)}</div>
      </div>
      <div class="cell">
        <div class="label">PU</div>
        <div class="val" style="font-size:16px">${pu}</div>
        <div class="sub">ABC-${abc} FMR-${fmr}</div>
      </div>
      <div class="cell">
        <div class="label">Fréquence (W)</div>
        <div class="val">${r.W ?? '—'}</div>
        <div class="sub">${r.W > 0 ? r.W + ' BL' : 'Aucune vente'}</div>
      </div>
      <div class="cell">
        <div class="label">Réseau ERP</div>
        <div class="val" style="font-size:16px">${erpReseau}</div>
        <div class="sub">${reseauInfo}</div>
      </div>
    </div>
    <div class="reseau">
      Statut : <strong>${_esc(r.statut || '—')}</strong>
    </div>
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
function _euro(n) { return n.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }); }

// ── Input handlers ─────────────────────────────────────────────────────
const input = document.getElementById('scanInput');
const clearBtn = document.getElementById('clearBtn');

input.addEventListener('input', () => {
  clearBtn.style.display = input.value ? 'block' : 'none';
});

// Enter = DataWedge suffix → lookup immédiat
input.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    const code = input.value.trim();
    if (code) lookup(code);
    // Auto-select tout pour le prochain scan
    setTimeout(() => input.select(), 50);
  }
});

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

// ── Service Worker ─────────────────────────────────────────────────────
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}

// ── Init ───────────────────────────────────────────────────────────────
loadData();
