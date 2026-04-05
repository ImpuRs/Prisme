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

  // CA période depuis ventes MAGASIN (ventesClientArticle — MAGASIN uniquement)
  const caByArticle = new Map();
  if (_S.ventesClientArticle) {
    for (const [, artMap] of _S.ventesClientArticle) {
      for (const [code, d] of artMap) {
        caByArticle.set(code, (caByArticle.get(code) || 0) + (d.sumCA || 0));
      }
    }
  }

  // articleMonthlySales = quantités [12 mois] → ratio qty3m/qtyTotal pour approx CA 3 mois
  const ms = _S.articleMonthlySales || {};

  const map = {};
  for (const r of data) {
    const emp = r.emplacement || '(vide)';
    if (!map[emp]) map[emp] = { caPeriode: 0, ca3m: 0, valStock: 0, nbRef: 0, clients: new Set(), sumW: 0 };
    const e = map[emp];

    const caPeriode = caByArticle.get(r.code) || 0;
    const months = ms[r.code];
    let ca3m = 0;
    if (months && caPeriode > 0) {
      const qtyTotal = months.reduce((s, v) => s + v, 0);
      const qty3m = months.slice(-3).reduce((s, v) => s + v, 0);
      ca3m = qtyTotal > 0 ? caPeriode * (qty3m / qtyTotal) : 0;
    }

    e.caPeriode += caPeriode;
    e.ca3m += ca3m;
    e.valStock += (r.valeurStock || 0);
    e.nbRef++;
    e.sumW += (r.W || 0);
    const buyers = _S.articleClients?.get(r.code);
    if (buyers) for (const cc of buyers) e.clients.add(cc);
  }

  return Object.entries(map)
    .filter(([, e]) => !(e.caPeriode === 0 && e.clients.size === 0))
    .map(([emp, e]) => ({
      emp,
      valStock: e.valStock,
      nbRef: e.nbRef,
      nbClients: e.clients.size,
      rotMoyW: e.nbRef > 0 ? e.sumW / e.nbRef : 0,
      caPeriode: e.caPeriode,
      ca3m: e.ca3m,
      rendementPeriode: e.valStock > 0 ? e.caPeriode / e.valStock : 0,
      rendement3m: e.valStock > 0 ? e.ca3m / e.valStock : 0,
      delta: e.valStock > 0 ? (e.ca3m / e.valStock) - (e.caPeriode / e.valStock) : 0
    }));
}

function _renderArbitrageRayon(rows) {
  rows.sort((a, b) => a.rendement3m - b.rendement3m);
  const avgRdt = rows.reduce((s, r) => s + r.rendementPeriode, 0) / rows.length;
  const avgFmt = avgRdt >= 10 ? avgRdt.toFixed(0) : avgRdt.toFixed(1);
  const rdFmt = v => v >= 10 ? v.toFixed(0) + '\xd7' : v.toFixed(1) + '\xd7';
  const rdCol = v => v >= 2 ? 'c-ok' : v >= 1 ? 'c-caution' : 'c-danger';

  const rowsHtml = rows.map(r => {
    const deltaSign = r.delta > 0.05 ? '+' : '';
    const deltaCol = r.delta > 0.05 ? 'c-ok' : r.delta < -0.05 ? 'c-danger' : 't-disabled';
    const deltaFmt = Math.abs(r.delta) < 0.005 ? '\u2014' : deltaSign + r.delta.toFixed(1) + '\xd7';
    return `<tr class="hover:s-hover cursor-pointer border-b b-light" onclick="window._filterByEmplacement('${escapeHtml(r.emp)}')">
      <td class="py-1.5 px-2 font-semibold t-primary">${escapeHtml(r.emp)}</td>
      <td class="py-1.5 px-2 text-right t-secondary">${r.valStock > 0 ? formatEuro(r.valStock) : '\u2014'}</td>
      <td class="py-1.5 px-2 text-center">${r.nbRef}</td>
      <td class="py-1.5 px-2 text-center">${r.nbClients || '\u2014'}</td>
      <td class="py-1.5 px-2 text-center t-secondary">${r.rotMoyW.toFixed(1)}</td>
      <td class="py-1.5 px-2 text-right">${r.caPeriode > 0 ? formatEuro(r.caPeriode) : '\u2014'}</td>
      <td class="py-1.5 px-2 text-right">${r.ca3m > 0 ? formatEuro(r.ca3m) : '\u2014'}</td>
      <td class="py-1.5 px-2 text-center font-bold ${rdCol(r.rendementPeriode)}">${rdFmt(r.rendementPeriode)}</td>
      <td class="py-1.5 px-2 text-center font-bold ${rdCol(r.rendement3m)}">${rdFmt(r.rendement3m)}</td>
      <td class="py-1.5 px-2 text-center font-bold ${deltaCol}">${deltaFmt}</td>
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
            <th class="py-2 px-2 text-right">Val. stock</th>
            <th class="py-2 px-2 text-center">R\xe9f.</th>
            <th class="py-2 px-2 text-center">Clients</th>
            <th class="py-2 px-2 text-center">Rot. moy.</th>
            <th class="py-2 px-2 text-right">CA p\xe9riode</th>
            <th class="py-2 px-2 text-right">CA 3 mois</th>
            <th class="py-2 px-2 text-center">Rdt p\xe9riode</th>
            <th class="py-2 px-2 text-center">Rdt 3 mois</th>
            <th class="py-2 px-2 text-center">\u0394</th>
          </tr>
        </thead>
        <tbody>${rowsHtml}</tbody>
      </table>
    </div>
    <p class="text-[9px] t-disabled px-4 py-2">Rendement = CA \xf7 val. stock \xb7 CA 3 mois approx. (ratio qty) \xb7 \u0394 = Rdt 3m \u2212 Rdt p\xe9riode \xb7 Tri\xe9 par Rdt 3 mois croissant (priorit\xe9s en t\xeate) \xb7 Cliquer pour filtrer les articles</p>
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
