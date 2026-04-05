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

function computePerfEmplacement() {
  const data = DataStore.finalData;
  if (!data.length) return [];
  const myStore = _S.selectedMyStore;
  const ventesStore = _S.ventesParMagasin?.[myStore] || {};
  const map = {};
  for (const r of data) {
    const emp = r.emplacement || '(vide)';
    if (!map[emp]) map[emp] = { ca: 0, valStock: 0, nbRef: 0, clients: new Set(), sumW: 0 };
    const e = map[emp];
    const ventes = ventesStore[r.code];
    e.ca += (ventes?.sumCA || ventes?.sumPrelevee || r.caAnnuel || 0);
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



window.renderArbitrageRayonBlock = renderArbitrageRayonBlock;
