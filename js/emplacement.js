// ═══════════════════════════════════════════════════════════════
// PRISME — emplacement.js
// Arbitrage rayon (rendement par emplacement) — bloc injecté dans Analyse du stock
// Dépend de : state.js, store.js, utils.js
// ═══════════════════════════════════════════════════════════════
'use strict';

import { _S } from './state.js';
import { DataStore } from './store.js';
import { formatEuro, escapeHtml, _copyCodeBtn } from './utils.js';
// ── Arbitrage Rayon — Performance par emplacement ──────────────
let _empSort = { col: 'valStock', asc: false };

export function computePerfEmplacement() {
  const data = DataStore.finalData;
  if (!data.length) return [];

  // Décision d'assortiment (quel emplacement garder / libérer) → 12MG pleine période,
  // insensible au filtre période (cf. Doctrine temporelle). MAGASIN uniquement, myStore.
  const caByArticle = new Map();   // CA MAGASIN total (prélevé + enlevé) — classement moteur
  const caPrelByArticle = new Map(); // CA prélevé — rotation du stock en rayon
  if (_S.ventesLocalMag12MG) {
    for (const [, artMap] of _S.ventesLocalMag12MG) {
      for (const [code, d] of artMap) {
        caByArticle.set(code, (caByArticle.get(code) || 0) + (d.sumCA || 0));
        caPrelByArticle.set(code, (caPrelByArticle.get(code) || 0) + (d.sumCAPrelevee || 0));
      }
    }
  }

  // Taux de marge depuis ventesParAgence (VMB ÷ CA, même source)
  const vpmByArticle = new Map(); // code → { ca, vmb }
  const myStoreData = _S.ventesParAgence?.[_S.selectedMyStore];
  if (myStoreData) {
    for (const [code, d] of Object.entries(myStoreData)) {
      vpmByArticle.set(code, { ca: d.sumCA || 0, vmb: d.sumVMB || 0 });
    }
  }

  const clientsOf = _S.articleClientsFull || _S.articleClients;
  const map = {};
  for (const r of data) {
    const emp = r.emplacement || '(vide)';
    if (!map[emp]) map[emp] = { ca: 0, caPrel: 0, caVpm: 0, vmb: 0, valStock: 0, nbRef: 0, clients: new Set(), nbRupture: 0, nbDormant: 0 };
    const e = map[emp];
    const vpm = vpmByArticle.get(r.code);
    e.ca += caByArticle.get(r.code) || 0;
    e.caPrel += caPrelByArticle.get(r.code) || 0;
    e.caVpm += vpm?.ca || 0;
    e.vmb += vpm?.vmb || 0;
    e.valStock += (r.valeurStock || 0);
    e.nbRef++;
    if (r.stockActuel === 0 && r.nouveauMin > 0) e.nbRupture++;
    if (r.W === 0 && r.stockActuel > 0) e.nbDormant++;
    const buyers = clientsOf?.get(r.code);
    if (buyers) for (const cc of buyers) e.clients.add(cc);
  }

  const rows = Object.entries(map)
    .filter(([emp, e]) => emp !== '(vide)' && !(e.ca === 0 && e.clients.size === 0 && e.valStock === 0))
    .map(([emp, e]) => {
      const txMarge = e.caVpm > 0 ? e.vmb / e.caVpm : 0;
      return {
        emp,
        valStock: e.valStock,
        nbRef: e.nbRef,
        nbClients: e.clients.size,
        ca: e.ca,
        marge: Math.round(e.ca * txMarge),
        rotation: e.valStock > 0 ? e.caPrel / e.valStock : 0, // CA prélevé 12 mois par € de stock
        nbRupture: e.nbRupture,
        nbDormant: e.nbDormant,
        txService: e.nbRef > 0 ? Math.round((e.nbRef - e.nbRupture) / e.nbRef * 100) : 100,
        statut: '',
      };
    });

  // ── Classification MOTEUR / TRAFIC / POIDS MORT (ABC sur CA puis trafic client) ──
  const caTotal = rows.reduce((s, r) => s + r.ca, 0);
  const byCa = [...rows].sort((a, b) => b.ca - a.ca);
  let cumCA = 0;
  const moteurSet = new Set();
  for (const r of byCa) {
    if (cumCA >= caTotal * 0.8) break;
    cumCA += r.ca;
    moteurSet.add(r.emp);
  }

  const nonMoteurs = rows.filter(r => !moteurSet.has(r.emp));
  const byClients = [...nonMoteurs].sort((a, b) => b.nbClients - a.nbClients);
  let cumCli = 0;
  const totalCliNonMoteur = nonMoteurs.reduce((s, r) => s + r.nbClients, 0);
  const traficSet = new Set();
  for (const r of byClients) {
    if (cumCli >= totalCliNonMoteur * 0.8) break;
    cumCli += r.nbClients;
    traficSet.add(r.emp);
  }

  // Seuil plancher : un rayon avec ≥3 clients n'est jamais Poids Mort, c'est du Trafic minimum
  const SEUIL_CLIENTS_POIDS_MORT = 3;
  for (const r of rows) {
    if (moteurSet.has(r.emp)) r.statut = 'moteur';
    else if (traficSet.has(r.emp) || r.nbClients >= SEUIL_CLIENTS_POIDS_MORT) r.statut = 'trafic';
    else r.statut = 'poids_mort';
  }

  return rows;
}

const STATUT_BADGE = {
  moteur:     { label: 'Moteur',     tone: 'high', action: 'Top 80 % du CA du magasin — soigner la marge et la rotation' },
  trafic:     { label: 'Trafic',     tone: 'mid',  action: 'Fait venir des clients (≥3) — fiabiliser le stock, simplifier l’offre' },
  poids_mort: { label: 'Poids mort', tone: 'low',  action: 'Ni CA ni clients (<3 sur 12 mois) — déstocker ou réattribuer l’emplacement' },
};

let _empFilterStatut = ''; // '' | 'moteur' | 'trafic' | 'poids_mort'
const _sortRows = (rows, { col, asc }) => rows.sort((a, b) => {
  const va = a[col], vb = b[col];
  if (typeof va === 'string') return asc ? va.localeCompare(vb) : vb.localeCompare(va);
  return asc ? va - vb : vb - va;
});
const _chip = (active, onclick, label, n, tone) =>
  `<button type="button" class="ar-chip${active ? ' ar-chip-on' : ''}" data-tone="${tone || ''}" onclick="${onclick}" aria-pressed="${active}">${label} <span class="pt-num">${n}</span></button>`;

function _renderArbitrageRayon(rows) {
  _sortRows(rows, _empSort);
  const counts = { moteur: 0, trafic: 0, poids_mort: 0 };
  for (const r of rows) counts[r.statut]++;
  const displayed = _empFilterStatut ? rows.filter(r => r.statut === _empFilterStatut) : rows;
  const arr = k => _empSort.col === k ? (_empSort.asc ? ' ▲' : ' ▼') : '';
  const th = (label, key, num) => `<th class="${num ? 'ar-r' : ''}"><button type="button" class="ar-th" onclick="window._empSortBy('${key}')">${label}${arr(key)}</button></th>`;
  const chips = Object.entries(STATUT_BADGE).map(([k, b]) =>
    _chip(_empFilterStatut === k, `window._empFilterStatut('${k}')`, b.label, counts[k], b.tone)).join('');

  const rowsHtml = displayed.map(r => {
    const b = STATUT_BADGE[r.statut];
    return `<tr class="ar-click" onclick="window._filterByEmplacement('${escapeHtml(r.emp)}')" title="Voir les articles de ${escapeHtml(r.emp)}">
      <td class="pt-strong">${escapeHtml(r.emp)}</td>
      <td><span class="ar-tag" data-tone="${b.tone}">${b.label}</span></td>
      <td class="pt-num ar-r">${r.nbRef}</td>
      <td class="pt-num ar-r">${r.valStock > 0 ? formatEuro(r.valStock) : '—'}</td>
      <td class="pt-num ar-r">${r.ca > 0 ? formatEuro(r.ca) : '—'}</td>
      <td class="pt-num ar-r">${r.marge > 0 ? formatEuro(r.marge) : '—'}</td>
      <td class="pt-num ar-r">${r.valStock > 0 ? r.rotation.toFixed(1).replace('.', ',') + ' €' : '—'}</td>
      <td class="pt-num ar-r">${r.nbClients || '—'}</td>
      <td class="pt-num ar-r">${r.nbDormant || '—'}</td>
    </tr>`;
  }).join('');

  const valPM = rows.filter(r => r.statut === 'poids_mort').reduce((s, r) => s + r.valStock, 0);
  return `<details class="ar-sec" id="arSecEmp">
    <summary><span class="pt-col" style="gap:2px"><span class="pt-h3">Emplacements</span>
      <span class="pt-small pt-muted">${rows.length} emplacements · ${counts.poids_mort} poids morts immobilisent ${formatEuro(valPM)}</span></span>
      <span class="ar-chev" aria-hidden="true"></span></summary>
    <div class="ar-sec-body">
      <div class="pt-row" style="gap:8px;flex-wrap:wrap">${chips}
        ${_empFilterStatut ? `<span class="pt-small pt-muted">${STATUT_BADGE[_empFilterStatut].action}</span>` : ''}</div>
      <div class="pt-list"><div class="pt-scroll"><table class="pt-table">
        <thead><tr>${th('Emplacement', 'emp')}${th('Statut', 'statut')}${th('Réf.', 'nbRef', 1)}${th('Stock', 'valStock', 1)}${th('CA 12 mois', 'ca', 1)}${th('Marge 12 mois', 'marge', 1)}${th('CA par € de stock', 'rotation', 1)}${th('Clients', 'nbClients', 1)}${th('Jamais vendus', 'nbDormant', 1)}</tr></thead>
        <tbody>${rowsHtml}</tbody></table></div>
        <div class="pt-row pt-between pt-small pt-muted" style="padding:10px 12px;gap:12px;flex-wrap:wrap">
          <span>${displayed.length} emplacement${displayed.length > 1 ? 's' : ''} · clic = articles de l’emplacement · ventes MAGASIN 12 mois</span>
          <button type="button" class="pt-link" onclick="window._empExportCSV()">Exporter en CSV</button>
        </div></div>
    </div>
  </details>`;
}

// ── Enlevés sans rayon — opportunités d'implantation ──────────────

let _enlSort = { col: 'caEnl', asc: false };
let _enlFilter = ''; // '' | 'sansStock' | 'enStock'
let _enlPage = 0;
const _ENL_PAGE_SIZE = 30;

export function computeEnlevesSansRayon() {
  const data = DataStore.finalData;
  if (!data.length) return [];

  // Construire CA prélevé + enlevé par article depuis ventesLocalMag12MG (pleine période, MAGASIN)
  const artStats = new Map(); // code → { caPrel, caEnl, blPrel, blEnl, clients: Set }
  if (_S.ventesLocalMag12MG?.size) {
    for (const [cc, artMap] of _S.ventesLocalMag12MG) {
      for (const [code, d] of artMap) {
        if (!/^\d{6}$/.test(code)) continue;
        if (!artStats.has(code)) artStats.set(code, { caPrel: 0, caEnl: 0, blPrel: 0, blEnl: 0, clients: new Set() });
        const s = artStats.get(code);
        const prel = d.sumPrelevee || 0; // qté prélevée
        const total = d.countBL || 0;
        const caTotal = d.sumCA || d.sumCAAll || 0;
        const caPrel = d.sumCAPrelevee || 0;
        const caEnl = caTotal - caPrel;
        if (caEnl > 0) {
          s.caEnl += caEnl;
          s.clients.add(cc);
        }
        if (caPrel > 0) s.caPrel += caPrel;
        // BL : approx — si prélevé > 0, au moins 1 BL prélevé
        if (prel > 0) s.blPrel += 1;
        if (caEnl > 0) s.blEnl += 1;
      }
    }
  }

  const results = [];
  for (const r of data) {
    const s = artStats.get(r.code);
    if (!s || s.caEnl <= 0) continue;
    const totalCA = s.caPrel + s.caEnl;
    if (totalCA <= 0) continue;
    const ratioEnl = Math.round(s.caEnl / totalCA * 100);
    if (ratioEnl < 50) continue; // au moins 50% enlevé

    // Exclure fin de série
    const sl = (r.statut || '').toLowerCase();
    if (sl.includes('fin de série') || sl.includes('fin de serie') || sl.includes('fin de stock') || sl.includes('fin de catalogue')) continue;

    const blMono = _S.enleveSingleBL?.[r.code] || 0;

    results.push({
      code: r.code,
      libelle: r.libelle || '',
      famille: r.famille || '',
      caEnl: s.caEnl,
      caPrel: s.caPrel,
      ratioEnl,
      nbClients: s.clients.size,
      blMono,
      stockActuel: r.stockActuel || 0,
      nouveauMin: r.nouveauMin || 0,
      nouveauMax: r.nouveauMax || 0,
      emplacement: r.emplacement || '',
    });
  }

  return results;
}

function _renderEnlevesSansRayon(rows) {
  _sortRows(rows, _enlSort);
  const totalCAEnl = rows.reduce((s, r) => s + r.caEnl, 0);
  const nbSansStock = rows.filter(r => r.stockActuel === 0).length;
  const nbEnStock = rows.length - nbSansStock;
  const displayed = _enlFilter === 'sansStock' ? rows.filter(r => r.stockActuel === 0)
    : _enlFilter === 'enStock' ? rows.filter(r => r.stockActuel > 0)
    : rows;
  const chips = _chip(_enlFilter === 'sansStock', "window._enlSetFilter('sansStock')", 'Absents du rayon', nbSansStock, 'low')
    + _chip(_enlFilter === 'enStock', "window._enlSetFilter('enStock')", 'En stock mais passés en livraison', nbEnStock, 'mid');
  const hint = _enlFilter === 'sansStock' ? 'Stock 0 et commandés en livraison : à implanter pour vendre au comptoir.'
    : _enlFilter === 'enStock' ? 'En rayon mais vendus en livraison : visibilité en rayon ou habitude vendeur à vérifier.'
    : 'Articles vendus à plus de 50 % en livraison (enlevé) au MAGASIN sur 12 mois. Fins de série exclues.';

  const arr = k => _enlSort.col === k ? (_enlSort.asc ? ' ▲' : ' ▼') : '';
  const th = (label, key, num) => `<th class="${num ? 'ar-r' : ''}"><button type="button" class="ar-th" onclick="window._enlSortBy('${key}')">${label}${arr(key)}</button></th>`;
  const totalPages = Math.ceil(displayed.length / _ENL_PAGE_SIZE) || 1;
  if (_enlPage >= totalPages) _enlPage = totalPages - 1;
  const start = _enlPage * _ENL_PAGE_SIZE;
  const rowsHtml = displayed.slice(start, start + _ENL_PAGE_SIZE).map(r => `<tr>
      <td class="pt-num pt-muted">${_copyCodeBtn(r.code)}</td>
      <td>${escapeHtml(r.libelle)}</td>
      <td class="pt-muted">${escapeHtml(r.famille)}</td>
      <td class="pt-num ar-r pt-strong">${formatEuro(r.caEnl)}</td>
      <td class="pt-num ar-r">${r.caPrel > 0 ? formatEuro(r.caPrel) : '—'}</td>
      <td class="pt-num ar-r">${r.ratioEnl} %</td>
      <td class="pt-num ar-r">${r.nbClients}</td>
      <td class="pt-num ar-r">${r.blMono || '—'}</td>
      <td class="pt-num ar-r">${r.stockActuel === 0 ? '<span class="ar-tag" data-tone="low">0</span>' : r.stockActuel}</td>
      <td class="pt-num ar-r">${r.nouveauMin}/${r.nouveauMax}</td>
    </tr>`).join('');
  const pager = totalPages > 1 ? `<span class="pt-row" style="gap:8px">
      <button type="button" class="pt-link" onclick="window._enlPageNav(-1)" ${_enlPage <= 0 ? 'disabled' : ''}>← Préc.</button>
      <span>${start + 1}–${Math.min(start + _ENL_PAGE_SIZE, displayed.length)} sur ${displayed.length}</span>
      <button type="button" class="pt-link" onclick="window._enlPageNav(1)" ${_enlPage >= totalPages - 1 ? 'disabled' : ''}>Suiv. →</button></span>`
    : `<span>${displayed.length} article${displayed.length > 1 ? 's' : ''}</span>`;

  return `<details class="ar-sec" id="arSecEnl">
    <summary><span class="pt-col" style="gap:2px"><span class="pt-h3">Vendus en livraison, pas au rayon</span>
      <span class="pt-small pt-muted">${rows.length} articles · ${formatEuro(totalCAEnl)} de CA en livraison · ${nbSansStock} absents du rayon</span></span>
      <span class="ar-chev" aria-hidden="true"></span></summary>
    <div class="ar-sec-body" id="enlSansRayonInner">
      <div class="pt-row" style="gap:8px;flex-wrap:wrap">${chips}</div>
      <p class="pt-small pt-muted" style="margin:0">${hint} <em>BL mono</em> = le client est venu pour ce seul article.</p>
      <div class="pt-list"><div class="pt-scroll"><table class="pt-table">
        <thead><tr>${th('Code', 'code')}${th('Article', 'libelle')}${th('Famille', 'famille')}${th('CA livraison', 'caEnl', 1)}${th('CA comptoir', 'caPrel', 1)}${th('% livraison', 'ratioEnl', 1)}${th('Clients', 'nbClients', 1)}${th('BL mono', 'blMono', 1)}${th('Stock', 'stockActuel', 1)}${th('MIN/MAX reco', 'nouveauMin', 1)}</tr></thead>
        <tbody>${rowsHtml}</tbody></table></div>
        <div class="pt-row pt-between pt-small pt-muted" style="padding:10px 12px">${pager}</div></div>
    </div>
  </details>`;
}

/** Rend les deux sections dans leurs conteneurs (layout fourni par arbitrage.js). */
export function renderArbitrageRayonBlock() {
  const empEl = document.getElementById('arbitrageRayonBlock');
  const enlEl = document.getElementById('arbitrageEnlBlock');
  if (empEl) {
    const wasOpen = empEl.querySelector('details')?.open || false;
    const rows = computePerfEmplacement();
    empEl.innerHTML = rows.length ? _renderArbitrageRayon(rows) : '';
    if (wasOpen && empEl.firstElementChild) empEl.firstElementChild.open = true;
  }
  if (enlEl) {
    const wasOpen = enlEl.querySelector('details')?.open || false;
    const rows = computeEnlevesSansRayon();
    enlEl.innerHTML = rows.length ? _renderEnlevesSansRayon(rows) : '';
    if (wasOpen && enlEl.firstElementChild) enlEl.firstElementChild.open = true;
  }
}

/** Ouvre une section, applique un filtre et la fait défiler à l'écran (cartes de décision). */
export function openArbitrageSection(which, filter) {
  if (which === 'emp') _empFilterStatut = filter || '';
  else { _enlFilter = filter || ''; _enlPage = 0; }
  renderArbitrageRayonBlock();
  const d = document.getElementById(which === 'emp' ? 'arSecEmp' : 'arSecEnl');
  if (d) { d.open = true; d.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
}

window._enlSetFilter = function(f) {
  _enlFilter = _enlFilter === f ? '' : f;
  _enlPage = 0;
  renderArbitrageRayonBlock();
};

window._enlSortBy = function(col) {
  if (_enlSort.col === col) _enlSort.asc = !_enlSort.asc;
  else { _enlSort.col = col; _enlSort.asc = col === 'code' || col === 'libelle' || col === 'famille'; }
  _enlPage = 0;
  renderArbitrageRayonBlock();
};

window._enlPageNav = function(dir) {
  _enlPage = Math.max(0, _enlPage + dir);
  renderArbitrageRayonBlock();
};

window._empSortBy = function(col) {
  if (_empSort.col === col) _empSort.asc = !_empSort.asc;
  else { _empSort.col = col; _empSort.asc = col === 'emp' || col === 'statut'; }
  renderArbitrageRayonBlock();
};

window._empFilterStatut = function(statut) {
  _empFilterStatut = _empFilterStatut === statut ? '' : statut;
  renderArbitrageRayonBlock();
};

window._empExportCSV = function() {
  const rows = computePerfEmplacement();
  if (!rows.length) return;
  const sep = ';';
  const header = ['Emplacement', 'Statut', 'Réf.', 'Val stock', 'CA 12 mois', 'Marge 12 mois', 'CA prélevé par € de stock', 'Clients', 'Jamais vendus'].join(sep);
  const lines = rows.map(r =>
    [r.emp, STATUT_BADGE[r.statut]?.label || '', r.nbRef, r.valStock.toFixed(0), Math.round(r.ca), r.marge, r.rotation.toFixed(2).replace('.', ','), r.nbClients, r.nbDormant].join(sep)
  );
  const csv = '\uFEFF' + [header, ...lines].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
  a.download = `arbitrage-rayon-${_S.selectedMyStore || 'export'}.csv`;
  a.click(); URL.revokeObjectURL(a.href);
};

window._filterByEmplacement = function(emp) {
  const sel = document.getElementById('filterEmplacement');
  if (sel) {
    sel.value = emp === '(vide)' ? '' : emp;
    if (typeof window.onFilterChange === 'function') window.onFilterChange();
    if (typeof window.switchTab === 'function') window.switchTab('table');
  }
};

window.renderArbitrageRayonBlock = renderArbitrageRayonBlock;
