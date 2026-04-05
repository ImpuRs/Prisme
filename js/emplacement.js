// ═══════════════════════════════════════════════════════════════
// PRISME — emplacement.js
// Arbitrage rayon (rendement par emplacement) + Plan de stock
// stratégique (squelette) — blocs injectés dans Analyse du stock
// Dépend de : state.js, store.js, utils.js, engine.js
// ═══════════════════════════════════════════════════════════════
'use strict';

import { _S } from './state.js';
import { DataStore } from './store.js';
import { formatEuro, escapeHtml, _copyCodeBtn } from './utils.js';
import { computeSquelette } from './engine.js';

// ── Arbitrage Rayon — Performance par emplacement ──────────────

function computePerfEmplacement() {
  const data = DataStore.finalData;
  if (!data.length) return [];
  const map = {};
  for (const r of data) {
    const emp = r.emplacement || '(vide)';
    if (!map[emp]) map[emp] = { ca: 0, valStock: 0, nbRef: 0, clients: new Set(), sumW: 0 };
    const e = map[emp];
    e.ca += (r.caAnnuel || 0);
    e.valStock += (r.valeurStock || 0);
    e.nbRef++;
    e.sumW += (r.W || 0);
    const buyers = _S.articleClients?.get(r.code);
    if (buyers) for (const cc of buyers) e.clients.add(cc);
  }
  return Object.entries(map).map(([emp, e]) => ({
    emp, ca: e.ca, valStock: e.valStock, nbRef: e.nbRef,
    nbClients: e.clients.size,
    rotMoy: e.nbRef > 0 ? e.sumW / e.nbRef : 0,
    rendement: e.valStock > 0 ? e.ca / e.valStock : 0
  }));
}

function _renderArbitrageRayon(rows) {
  rows.sort((a, b) => a.rendement - b.rendement);
  const avgRendement = rows.reduce((s, r) => s + r.rendement, 0) / rows.length;
  const avgFmt = avgRendement >= 10 ? avgRendement.toFixed(0) : avgRendement.toFixed(1);
  const rowsHtml = rows.map(r => {
    const rdCol = r.rendement >= 2 ? 'c-ok' : r.rendement >= 1 ? 'c-caution' : 'c-danger';
    const rdFmt = r.rendement >= 10 ? r.rendement.toFixed(0) + '\xd7' : r.rendement.toFixed(1) + '\xd7';
    return `<tr class="hover:s-hover cursor-pointer border-b b-light" onclick="window._filterByEmplacement('${escapeHtml(r.emp)}')">
      <td class="py-1.5 px-2 font-semibold t-primary">${escapeHtml(r.emp)}</td>
      <td class="py-1.5 px-2 text-right">${r.ca > 0 ? formatEuro(r.ca) : '\u2014'}</td>
      <td class="py-1.5 px-2 text-right t-secondary">${r.valStock > 0 ? formatEuro(r.valStock) : '\u2014'}</td>
      <td class="py-1.5 px-2 text-center">${r.nbRef}</td>
      <td class="py-1.5 px-2 text-center">${r.nbClients || '\u2014'}</td>
      <td class="py-1.5 px-2 text-center t-secondary">${r.rotMoy.toFixed(1)}</td>
      <td class="py-1.5 px-2 text-center font-bold ${rdCol}">${rdFmt}</td>
    </tr>`;
  }).join('');
  return `<details class="s-card rounded-xl shadow-md border mb-3 overflow-hidden">
    <summary class="flex items-center justify-between px-4 py-3 cursor-pointer select-none hover:brightness-95">
      <div class="flex items-center gap-2">
        <span class="font-extrabold text-sm t-primary">&#128205; Arbitrage rayon</span>
        <span class="text-[10px] t-disabled">${rows.length} emplacements \xb7 rendement moyen ${avgFmt}\xd7</span>
      </div>
      <span class="acc-arrow t-disabled">&#9654;</span>
    </summary>
    <div class="overflow-x-auto" style="max-height:500px;overflow-y:auto">
      <table class="min-w-full text-xs">
        <thead class="s-panel-inner t-inverse font-bold sticky top-0">
          <tr>
            <th class="py-2 px-2 text-left">Emplacement</th>
            <th class="py-2 px-2 text-right">CA</th>
            <th class="py-2 px-2 text-right">Val. stock</th>
            <th class="py-2 px-2 text-center">R\xe9f.</th>
            <th class="py-2 px-2 text-center">Clients</th>
            <th class="py-2 px-2 text-center">Rotation moy.</th>
            <th class="py-2 px-2 text-center">Rendement</th>
          </tr>
        </thead>
        <tbody>${rowsHtml}</tbody>
      </table>
    </div>
    <p class="text-[9px] t-disabled px-4 py-2">Rendement = CA \xf7 valeur stock \xb7 Cliquer sur un emplacement pour filtrer les articles \xb7 Tri\xe9 par rendement croissant (priorit\xe9s en t\xeate)</p>
  </details>`;
}

export function renderArbitrageRayonBlock() {
  const el = document.getElementById('arbitrageRayonBlock');
  if (!el) return;
  const rows = computePerfEmplacement();
  if (!rows.length) { el.innerHTML = ''; return; }
  el.innerHTML = _renderArbitrageRayon(rows);
}

window._filterByEmplacement = function(emp) {
  const sel = document.getElementById('filterEmplacement');
  if (sel) {
    sel.value = emp === '(vide)' ? '' : emp;
    if (typeof window.onFilterChange === 'function') window.onFilterChange();
    if (typeof window.switchTab === 'function') window.switchTab('table');
  }
};

// ── Plan de Stock Stratégique (Squelette) ──────────────────────

const CLASSIF_BADGE = {
  socle:      { label: 'Socle',      bg: '#dcfce7', color: '#166534', icon: '🟢' },
  implanter:  { label: 'Implanter',  bg: '#dbeafe', color: '#1e40af', icon: '🔵' },
  challenger: { label: 'Challenger', bg: '#fee2e2', color: '#991b1b', icon: '🔴' },
  potentiel:  { label: 'Potentiel',  bg: '#fef9c3', color: '#854d0e', icon: '🟡' },
  surveiller: { label: 'Surveiller', bg: '#f1f5f9', color: '#475569', icon: '👁' }
};

function _sourceBar(a) {
  const s = a.sources;
  const seg = (key, color, label) =>
    `<span title="${label}" style="display:inline-block;width:14px;height:10px;border-radius:2px;margin-right:1px;background:${s.has(key) ? color : 'var(--s-muted,#e2e8f0)'};opacity:${s.has(key) ? 1 : 0.2}"></span>`;
  return `<span class="inline-flex items-center">
    ${seg('reseau', 'var(--c-info,#3b82f6)', 'R\xe9seau')}
    ${seg('chalandise', 'var(--c-ok,#22c55e)', 'Chalandise')}
    ${seg('horsZone', 'var(--c-caution,#f59e0b)', 'Hors-zone')}
    ${seg('livraisons', 'var(--c-action,#8b5cf6)', 'Livraisons')}
  </span>`;
}

function _classifBadge(classif) {
  const b = CLASSIF_BADGE[classif];
  if (!b) return '';
  return `<span class="text-[8px] px-1.5 py-0.5 rounded-full font-bold" style="background:${b.bg};color:${b.color}">${b.icon} ${b.label}</span>`;
}

let _sqFilterClassif = '', _sqFilterDir = '', _sqPageMap = {};

function _sqExportRows(articles) {
  const sep = ';';
  const header = ['Code', 'Libell\xe9', 'Direction', 'Classification', 'Score', 'R\xe9seau', 'Chalandise', 'Hors-zone', 'Livraisons', 'Nb agences', 'Nb BL livr.', 'Nb clients zone', 'CA agence', 'Stock actuel'].join(sep);
  const rows = articles.map(a => [
    a.code, `"${(a.libelle || '').replace(/"/g, '""')}"`, `"${(a.direction || '').replace(/"/g, '""')}"`,
    a.classification, a.score,
    a.sources.has('reseau') ? 'Oui' : 'Non', a.sources.has('chalandise') ? 'Oui' : 'Non',
    a.sources.has('horsZone') ? 'Oui' : 'Non', a.sources.has('livraisons') ? 'Oui' : 'Non',
    a.nbAgencesReseau, a.nbBLLivraisons, a.nbClientsZone,
    (a.caAgence || 0).toFixed(2), a.stockActuel
  ].join(sep));
  return '\uFEFF' + header + '\n' + rows.join('\n');
}

function _renderSquelette(data) {
  if (!data || !data.directions.length) return '<p class="text-xs t-disabled p-4">Donn\xe9es insuffisantes pour calculer le squelette.</p>';

  const t = data.totals;

  const _badge = (key, n) => {
    const b = CLASSIF_BADGE[key];
    const active = _sqFilterClassif === key;
    return `<button onclick="window._laboSqFilterClassif('${key}')" class="flex flex-col items-center p-2 rounded-lg border cursor-pointer transition-all ${active ? 's-panel-inner' : 's-card'}" style="${active ? 'box-shadow:0 0 0 2px ' + b.color : ''}">
      <span class="text-base leading-none">${b.icon}</span>
      <span class="text-[13px] font-extrabold ${active ? 't-inverse' : 't-primary'}">${n}</span>
      <span class="text-[9px] ${active ? 't-inverse-muted' : 't-disabled'}">${b.label}</span>
    </button>`;
  };

  const kpiHtml = `<div class="grid grid-cols-5 gap-2 mb-3">
    ${_badge('socle', t.socle)}${_badge('implanter', t.implanter)}${_badge('challenger', t.challenger)}${_badge('potentiel', t.potentiel)}${_badge('surveiller', t.surveiller)}
  </div>`;

  const dirs = data.directions.map(d => d.direction);
  const dirOptions = ['<option value="">Toutes les directions</option>', ...dirs.map(d => `<option value="${escapeHtml(d)}" ${_sqFilterDir === d ? 'selected' : ''}>${escapeHtml(d)}</option>`)].join('');
  const dirFilterHtml = `<div class="mb-3 flex items-center gap-2">
    <select onchange="window._laboSqFilterDir(this.value)" class="text-[11px] px-2 py-1.5 rounded-lg border b-light s-card t-primary">${dirOptions}</select>
    <span class="text-[9px] t-disabled">${data.directions.length} directions \xb7 4 sources crois\xe9es</span>
  </div>`;

  const legendHtml = `<div class="flex items-center gap-3 mb-3 text-[9px] t-disabled">
    <span style="display:inline-block;width:10px;height:8px;border-radius:2px;background:var(--c-info,#3b82f6)"></span> R\xe9seau
    <span style="display:inline-block;width:10px;height:8px;border-radius:2px;background:var(--c-ok,#22c55e)"></span> Chalandise
    <span style="display:inline-block;width:10px;height:8px;border-radius:2px;background:var(--c-caution,#f59e0b)"></span> Hors-zone
    <span style="display:inline-block;width:10px;height:8px;border-radius:2px;background:var(--c-action,#8b5cf6)"></span> Livraisons
  </div>`;

  const filteredDirs = _sqFilterDir ? data.directions.filter(d => d.direction === _sqFilterDir) : data.directions;

  const dirsHtml = filteredDirs.map((d, idx) => {
    let allArts = [...d.socle, ...d.implanter, ...d.challenger, ...d.potentiel, ...d.surveiller];
    if (_sqFilterClassif) allArts = allArts.filter(a => a.classification === _sqFilterClassif);
    if (!allArts.length) return '';
    allArts.sort((a, b) => b.score - a.score);

    const pageKey = d.direction;
    const page = _sqPageMap[pageKey] || 20;
    const shown = allArts.slice(0, page);
    const hasMore = allArts.length > page;

    const rowsHtml = shown.map(a =>
      `<tr class="border-b b-light hover:s-hover text-[11px]">
        <td class="py-1.5 px-2">${_copyCodeBtn(a.code)}</td>
        <td class="py-1.5 px-2 max-w-[180px] truncate" title="${escapeHtml(a.libelle)}">${escapeHtml(a.libelle)}</td>
        <td class="py-1.5 px-2 text-center">${_classifBadge(a.classification)}</td>
        <td class="py-1.5 px-2 text-center">${_sourceBar(a)}</td>
        <td class="py-1.5 px-2 text-right">${a.nbBLLivraisons || '\u2014'}</td>
        <td class="py-1.5 px-2 text-right">${a.nbAgencesReseau || '\u2014'}</td>
        <td class="py-1.5 px-2 text-right">${a.nbClientsZone || '\u2014'}</td>
        <td class="py-1.5 px-2 text-right font-bold c-action">${a.caAgence > 0 ? formatEuro(a.caAgence) : '\u2014'}</td>
      </tr>`
    ).join('');

    const moreHtml = hasMore
      ? `<div class="text-center py-2"><button onclick="window._laboSqMore('${escapeHtml(pageKey)}')" class="text-[10px] px-4 py-1.5 rounded-lg border b-light s-card t-secondary hover:t-primary">Voir plus (${allArts.length - page} restants)</button></div>`
      : '';

    const summary = [
      d.implanter.length ? `${d.implanter.length} \xe0 implanter` : '',
      d.challenger.length ? `${d.challenger.length} \xe0 challenger` : '',
      d.socle.length ? `${d.socle.length} socle` : ''
    ].filter(Boolean).join(' \xb7 ');

    const csvBtn = `<button onclick="event.stopPropagation();window._laboSqExportDir('${escapeHtml(d.direction)}')" class="text-[9px] px-2 py-1 rounded border b-light hover:bg-gray-100 dark:hover:bg-gray-700" title="Export CSV">CSV</button>`;

    return `<details class="border-b b-light" ${idx === 0 && !_sqFilterDir ? 'open' : _sqFilterDir ? 'open' : ''}>
      <summary class="flex items-center justify-between px-4 py-3 cursor-pointer select-none hover:s-hover">
        <div class="flex items-center gap-2">
          <span class="font-bold text-[12px] t-primary">${escapeHtml(d.direction)}</span>
          <span class="text-[9px] t-disabled">${summary}</span>
        </div>
        <div class="flex items-center gap-2">
          ${csvBtn}
          <span class="acc-arrow t-disabled">&#9654;</span>
        </div>
      </summary>
      <div class="overflow-x-auto">
        <table class="min-w-full">
          <thead class="s-panel-inner t-inverse text-[10px]">
            <tr>
              <th class="py-1.5 px-2 text-left">Code</th>
              <th class="py-1.5 px-2 text-left">Libell\xe9</th>
              <th class="py-1.5 px-2 text-center">Classif.</th>
              <th class="py-1.5 px-2 text-center">Sources</th>
              <th class="py-1.5 px-2 text-right">BL Livr.</th>
              <th class="py-1.5 px-2 text-right">Ag. r\xe9seau</th>
              <th class="py-1.5 px-2 text-right">Cli. zone</th>
              <th class="py-1.5 px-2 text-right">CA agence</th>
            </tr>
          </thead>
          <tbody>${rowsHtml}</tbody>
        </table>
      </div>
      ${moreHtml}
    </details>`;
  }).join('');

  const exportBtn = `<div class="flex items-center gap-2 mt-3">
    <button onclick="window._laboSqExportAll()" class="text-[10px] px-3 py-1.5 rounded-lg border b-light s-card t-secondary hover:t-primary">&#128229; Export CSV global</button>
  </div>`;

  return kpiHtml + dirFilterHtml + legendHtml + dirsHtml + exportBtn;
}

function _renderSqueletteWrapper(data) {
  const t = data.totals;
  const inner = _renderSquelette(data);
  return `<details class="s-card rounded-xl shadow-md border mb-3 overflow-hidden">
    <summary class="flex items-center justify-between px-4 py-3 cursor-pointer select-none hover:brightness-95">
      <div class="flex items-center gap-2">
        <span class="font-extrabold text-sm t-primary">&#129460; Plan de stock strat\xe9gique</span>
        <span class="text-[10px] t-disabled">${t.implanter} \xe0 implanter \xb7 ${t.challenger} \xe0 challenger \xb7 ${t.socle} socle</span>
      </div>
      <span class="acc-arrow t-disabled">&#9654;</span>
    </summary>
    <div class="p-3">${inner}</div>
  </details>`;
}

function _rerenderSquelette() {
  const el = document.getElementById('squelettePlanBlock');
  if (!el || !_S._squeletteFull) return;
  el.innerHTML = _renderSqueletteWrapper(_S._squeletteFull);
}

export function renderSqueletteBlock() {
  const el = document.getElementById('squelettePlanBlock');
  if (!el) return;
  if (!_S.ventesParMagasin || !Object.keys(_S.ventesParMagasin).length) { el.innerHTML = ''; return; }
  if (!_S._squeletteFull) {
    _sqFilterClassif = '';
    _sqFilterDir = '';
    _sqPageMap = {};
    _S._squeletteFull = computeSquelette();
  }
  if (!_S._squeletteFull || !_S._squeletteFull.directions?.length) { el.innerHTML = ''; return; }
  el.innerHTML = _renderSqueletteWrapper(_S._squeletteFull);
}

window._laboSqFilterClassif = function(key) {
  _sqFilterClassif = _sqFilterClassif === key ? '' : key;
  _sqPageMap = {};
  _rerenderSquelette();
};

window._laboSqFilterDir = function(val) {
  _sqFilterDir = val;
  _sqPageMap = {};
  _rerenderSquelette();
};

window._laboSqMore = function(dir) {
  _sqPageMap[dir] = (_sqPageMap[dir] || 20) + 20;
  _rerenderSquelette();
};

window._laboSqExportDir = function(direction) {
  const data = _S._squeletteFull;
  if (!data) return;
  const d = data.directions.find(d => d.direction === direction);
  if (!d) return;
  const all = [...d.socle, ...d.implanter, ...d.challenger, ...d.potentiel, ...d.surveiller];
  const csv = _sqExportRows(all);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `PRISME_Squelette_${direction.replace(/\s+/g, '_')}_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link); link.click(); document.body.removeChild(link);
  URL.revokeObjectURL(link.href);
};

window._laboSqExportAll = function() {
  const data = _S._squeletteFull;
  if (!data) return;
  const all = [];
  for (const d of data.directions) all.push(...d.socle, ...d.implanter, ...d.challenger, ...d.potentiel, ...d.surveiller);
  const csv = _sqExportRows(all);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `PRISME_Squelette_${_S.selectedMyStore || 'AG'}_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link); link.click(); document.body.removeChild(link);
  URL.revokeObjectURL(link.href);
};

window.renderArbitrageRayonBlock = renderArbitrageRayonBlock;
window.renderSqueletteBlock = renderSqueletteBlock;
