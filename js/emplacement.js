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
let _empSort = { col: 'rendement3m', asc: true };

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

  // CA 3 derniers mois depuis _byMonth (CA prélevé réel, pas approximation)
  const periodEnd = _S.periodFilterEnd || _S.consommePeriodMax || new Date();
  const m2 = periodEnd.getFullYear() * 12 + periodEnd.getMonth();
  const last3Months = new Set([m2 - 2, m2 - 1, m2]);
  const ca3mByArticle = new Map();
  const byMonth = _S._byMonth;
  if (byMonth) {
    for (const [, artMap] of Object.entries(byMonth)) {
      for (const [code, monthMap] of Object.entries(artMap)) {
        for (const [midx, agg] of Object.entries(monthMap)) {
          if (!last3Months.has(parseInt(midx))) continue;
          ca3mByArticle.set(code, (ca3mByArticle.get(code) || 0) + (agg.sumCAPrelevee || agg.sumPrelevee || 0));
        }
      }
    }
  }

  // CA + VMB depuis ventesParMagasin (même source, même période = ratio cohérent)
  const vpmByArticle = new Map(); // code → { ca, vmb }
  const myStoreData = _S.ventesParMagasin?.[_S.selectedMyStore];
  if (myStoreData) {
    for (const [code, d] of Object.entries(myStoreData)) {
      vpmByArticle.set(code, { ca: d.sumCA || 0, vmb: d.sumVMB || 0 });
    }
  }

  const map = {};
  for (const r of data) {
    const emp = r.emplacement || '(vide)';
    if (!map[emp]) map[emp] = { caPeriode: 0, ca3m: 0, caVpm: 0, vmb: 0, valStock: 0, nbRef: 0, clients: new Set(), sumW: 0, nbRupture: 0, nbDormant: 0 };
    const e = map[emp];

    const caPeriode = caByArticle.get(r.code) || 0;
    const vpm = vpmByArticle.get(r.code);

    e.caPeriode += caPeriode;
    e.ca3m += ca3mByArticle.get(r.code) || 0;
    e.caVpm += vpm?.ca || 0;
    e.vmb += vpm?.vmb || 0;
    e.valStock += (r.valeurStock || 0);
    e.nbRef++;
    e.sumW += (r.W || 0);
    if (r.stockActuel === 0 && r.nouveauMin > 0) e.nbRupture++;
    if (r.W === 0 && r.stockActuel > 0) e.nbDormant++;
    const buyers = _S.articleClients?.get(r.code);
    if (buyers) for (const cc of buyers) e.clients.add(cc);
  }

  const rows = Object.entries(map)
    .filter(([, e]) => !(e.caPeriode === 0 && e.clients.size === 0))
    .map(([emp, e]) => ({
      emp,
      valStock: e.valStock,
      nbRef: e.nbRef,
      nbClients: e.clients.size,
      rotMoyW: e.nbRef > 0 ? e.sumW / e.nbRef : 0,
      caPeriode: e.caPeriode,
      ca3m: e.ca3m,
      caVpm: e.caVpm,
      vmb: e.vmb,
      txMarge: e.caVpm > 0 ? Math.round(e.vmb / e.caVpm * 100) : 0,
      rendementPeriode: e.valStock > 0 ? e.caPeriode / e.valStock : 0,
      rendement3m: e.valStock > 0 ? e.ca3m / e.valStock : 0,
      delta: e.valStock > 0 ? (e.ca3m / e.valStock) - (e.caPeriode / e.valStock) : 0,
      nbRupture: e.nbRupture,
      nbDormant: e.nbDormant,
      txService: e.nbRef > 0 ? Math.round((e.nbRef - e.nbRupture) / e.nbRef * 100) : 100,
      densiteClient: e.nbRef > 0 ? +(e.clients.size / e.nbRef).toFixed(1) : 0,
      statut: '', // rempli ci-dessous
    }));

  // ── Classification MOTEUR / TRAFIC / POIDS MORT (ABC sur CA puis trafic client) ──
  const caTotal = rows.reduce((s, r) => s + r.caPeriode, 0);
  const clientsTotal = new Set();
  if (_S.articleClients) {
    for (const r of data) {
      const buyers = _S.articleClients.get(r.code);
      if (buyers) for (const cc of buyers) clientsTotal.add(cc);
    }
  }
  const nbClientsTotal = clientsTotal.size || 1;

  // Tri par CA décroissant pour ABC
  const byCa = [...rows].sort((a, b) => b.caPeriode - a.caPeriode);
  let cumCA = 0;
  const moteurSet = new Set();
  for (const r of byCa) {
    cumCA += r.caPeriode;
    moteurSet.add(r.emp);
    if (cumCA >= caTotal * 0.8) break;
  }

  // Tri par trafic client décroissant pour les non-moteurs
  const nonMoteurs = rows.filter(r => !moteurSet.has(r.emp));
  const byClients = [...nonMoteurs].sort((a, b) => b.nbClients - a.nbClients);
  let cumCli = 0;
  const totalCliNonMoteur = nonMoteurs.reduce((s, r) => s + r.nbClients, 0);
  const traficSet = new Set();
  for (const r of byClients) {
    cumCli += r.nbClients;
    traficSet.add(r.emp);
    if (cumCli >= totalCliNonMoteur * 0.8) break;
  }

  for (const r of rows) {
    r.statut = moteurSet.has(r.emp) ? 'moteur' : traficSet.has(r.emp) ? 'trafic' : 'poids_mort';
  }

  return rows;
}

// ── Verdicts : top emplacements à revoir (1 card par emplacement max) ──
// Basé sur rendement 3 mois (plus récent, plus actionnable)
function _buildVerdicts(rows, median3m) {
  const scored = [];
  for (const r of rows) {
    const problems = [];
    let severity = 0;

    // Dormants — rendement 3m sous médiane
    if (r.valStock > 0 && r.rendement3m < median3m * 0.7 && r.nbDormant >= 2) {
      problems.push(`${r.nbDormant} dormants · ${formatEuro(r.valStock)} immobilisés`);
      severity += r.valStock;
    }

    // Ruptures (seuil CA 3m relevé)
    if (r.nbRupture >= 2 && r.ca3m > 300) {
      problems.push(`${r.nbRupture} ruptures`);
      severity += r.ca3m * 4; // annualisé
    }

    // Rendement en chute
    if (r.delta < -0.3 && r.caPeriode > 500) {
      problems.push(`rendement ${r.rendementPeriode.toFixed(1)}× → ${r.rendement3m.toFixed(1)}×`);
      severity += Math.abs(r.delta) * 1000;
    }

    if (problems.length) scored.push({ r, problems, severity });
  }

  scored.sort((a, b) => b.severity - a.severity);

  // Pépite : meilleur rendement 3m avec CA significatif
  const pepite = rows
    .filter(r => r.rendement3m > median3m && r.delta >= -0.05 && r.ca3m > 150 && r.nbRupture === 0)
    .sort((a, b) => b.rendement3m - a.rendement3m)[0];

  const verdicts = [];

  for (const s of scored.slice(0, 3)) {
    const r = s.r;
    const hasRupt = s.problems.some(p => p.includes('rupture'));
    const hasDorm = s.problems.some(p => p.includes('dormant'));
    const hasChute = s.problems.some(p => p.includes('→'));

    const icon = hasRupt ? '🚨' : hasDorm ? '💤' : '📉';
    const color = hasRupt ? '#ef4444' : hasDorm ? '#f59e0b' : '#f97316';
    const bg = hasRupt ? 'rgba(239,68,68,0.10)' : hasDorm ? 'rgba(245,158,11,0.10)' : 'rgba(249,115,22,0.10)';
    const border = hasRupt ? 'rgba(239,68,68,0.25)' : hasDorm ? 'rgba(245,158,11,0.25)' : 'rgba(249,115,22,0.25)';

    const titles = [];
    if (hasRupt) titles.push('Ruptures');
    if (hasDorm) titles.push('Dormants');
    if (hasChute) titles.push('En baisse');

    const actions = [];
    if (hasRupt) actions.push('vérifier MIN/MAX');
    if (hasDorm) actions.push('purger les dormants');
    if (hasChute) actions.push('analyser la tendance');

    verdicts.push({
      icon, color, bg, border,
      emp: r.emp,
      title: titles.join(' + '),
      desc: `${s.problems.join(' · ')} · rdt 3m ${r.rendement3m.toFixed(1)}× (méd. ${median3m.toFixed(1)}×)`,
      action: actions.join(', ').replace(/^./, c => c.toUpperCase()),
    });
  }

  if (pepite && !scored.some(s => s.r.emp === pepite.emp)) {
    verdicts.push({
      icon: '🌟', color: '#22c55e', bg: 'rgba(34,197,94,0.10)', border: 'rgba(34,197,94,0.25)',
      emp: pepite.emp,
      title: 'Meilleur rendement',
      desc: `${pepite.rendement3m.toFixed(1)}× sur 3 mois · ${formatEuro(pepite.ca3m)} CA · ${pepite.nbClients} clients`,
      action: 'Modèle à répliquer',
    });
  }

  return verdicts;
}

function _renderVerdicts(verdicts) {
  if (!verdicts.length) return '';
  return `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:8px;padding:12px 16px">
    ${verdicts.map(v => `
      <div style="background:${v.bg};border:1px solid ${v.border};border-radius:10px;padding:10px 12px;cursor:pointer"
        onclick="window._filterByEmplacement('${escapeHtml(v.emp)}')">
        <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px">
          <span style="font-size:16px">${v.icon}</span>
          <span style="font-weight:800;font-size:11px;color:${v.color}">${v.title}</span>
        </div>
        <div style="font-size:11px;font-weight:700;color:var(--t-primary);margin-bottom:2px">${escapeHtml(v.emp)}</div>
        <div style="font-size:10px;color:var(--t-secondary);line-height:1.4">${v.desc}</div>
        <div style="font-size:9px;color:${v.color};margin-top:4px;font-weight:600">→ ${v.action}</div>
      </div>
    `).join('')}
  </div>`;
}

const STATUT_BADGE = {
  moteur:     { icon: '🔥', label: 'Moteur',     color: '#22c55e', bg: 'rgba(34,197,94,0.15)',  border: 'rgba(34,197,94,0.3)',  action: 'Optimiser la marge, accélérer la rotation' },
  trafic:     { icon: '👥', label: 'Trafic',     color: '#3b82f6', bg: 'rgba(59,130,246,0.15)', border: 'rgba(59,130,246,0.3)', action: 'Fiabiliser le stock, simplifier l\'offre' },
  poids_mort: { icon: '💀', label: 'Poids mort', color: '#ef4444', bg: 'rgba(239,68,68,0.15)',  border: 'rgba(239,68,68,0.3)', action: 'Plan de sortie — déstocker ou réattribuer l\'emplacement' },
};

let _empFilterStatut = ''; // '' | 'moteur' | 'trafic' | 'poids_mort'

function _renderArbitrageRayon(rows) {
  const col = _empSort.col;
  const asc = _empSort.asc;
  rows.sort((a, b) => {
    const va = a[col], vb = b[col];
    if (typeof va === 'string') return asc ? va.localeCompare(vb) : vb.localeCompare(va);
    return asc ? va - vb : vb - va;
  });

  const rowsAvecCA = rows.filter(r => r.caPeriode > 0);
  const rendements = rowsAvecCA.map(r => r.rendementPeriode).sort((a, b) => a - b);
  const median = rendements.length ? rendements[Math.floor(rendements.length / 2)] : 0;
  const caTotalPeriode = rows.reduce((s, r) => s + r.caPeriode, 0);
  const caVpmTotal = rows.reduce((s, r) => s + (r.caVpm || 0), 0);
  const vmbTotal = rows.reduce((s, r) => s + r.vmb, 0);
  const txMargeGlobal = caVpmTotal > 0 ? Math.round(vmbTotal / caVpmTotal * 100) : 0;

  const rendements3m = rowsAvecCA.filter(r => r.ca3m > 0).map(r => r.rendement3m).sort((a, b) => a - b);
  const median3m = rendements3m.length ? rendements3m[Math.floor(rendements3m.length / 2)] : 0;

  // Compteurs par statut
  const statutCounts = { moteur: 0, trafic: 0, poids_mort: 0 };
  for (const r of rows) statutCounts[r.statut]++;

  const verdicts = _buildVerdicts(rows, median3m);

  // Filtre statut
  const displayed = _empFilterStatut ? rows.filter(r => r.statut === _empFilterStatut) : rows;

  const rdFmt = v => v >= 10 ? v.toFixed(0) + '\xd7' : v.toFixed(1) + '\xd7';
  const rdCol = v => v >= 2 ? 'c-ok' : v >= 1 ? 'c-caution' : 'c-danger';
  const arr = k => _empSort.col === k ? (_empSort.asc ? ' \u25b2' : ' \u25bc') : '';
  const th = (label, key, align) =>
    `<th class="py-2 px-2 ${align} text-[10px] cursor-pointer hover:t-primary whitespace-nowrap" onclick="window._empSortBy('${key}')">${label}${arr(key)}</th>`;

  // Pilules filtre statut
  const pills = Object.entries(STATUT_BADGE).map(([k, b]) => {
    const active = _empFilterStatut === k;
    const n = statutCounts[k];
    return `<button onclick="window._empFilterStatut('${k}')" title="${b.action}"
      class="text-[10px] px-2 py-1 rounded border cursor-pointer transition-all ${active ? 'font-bold' : 'hover:t-primary'}"
      style="border-color:${b.border};${active ? `background:${b.bg};color:${b.color};box-shadow:0 0 0 1px ${b.color}` : `color:${b.color}`}">${b.icon} ${b.label} <strong>${n}</strong></button>`;
  }).join('');

  const rowsHtml = displayed.map(r => {
    const sb = STATUT_BADGE[r.statut];
    const deltaSign = r.delta > 0.05 ? '+' : '';
    const deltaCol = r.delta > 0.05 ? 'c-ok' : r.delta < -0.05 ? 'c-danger' : 't-disabled';
    const deltaFmt = Math.abs(r.delta) < 0.005 ? '\u2014' : deltaSign + r.delta.toFixed(1) + '\xd7';
    const ruptBadge = r.nbRupture > 0 ? ` <span class="c-danger font-bold">(${r.nbRupture}R)</span>` : '';
    const dormBadge = r.nbDormant > 0 ? ` <span class="c-caution">(${r.nbDormant}D)</span>` : '';
    const txSrvCol = r.txService >= 98 ? 'c-ok' : r.txService >= 90 ? 'c-caution' : 'c-danger';
    const txMargeCol = r.txMarge >= 35 ? 'c-ok' : r.txMarge >= 25 ? 'c-caution' : 'c-danger';
    return `<tr class="hover:s-hover cursor-pointer border-b b-light" onclick="window._filterByEmplacement('${escapeHtml(r.emp)}')">
      <td class="py-1.5 px-2 font-semibold t-primary">${escapeHtml(r.emp)}${ruptBadge}${dormBadge}</td>
      <td class="py-1.5 px-2 text-center"><span class="text-[9px] px-1.5 py-0.5 rounded-full font-bold" style="background:${sb.bg};color:${sb.color}" title="${sb.action}">${sb.icon} ${sb.label}</span></td>
      <td class="py-1.5 px-2 text-right">${r.caPeriode > 0 ? formatEuro(r.caPeriode) : '\u2014'}</td>
      <td class="py-1.5 px-2 text-right" style="color:#8b5cf6">${r.vmb > 0 ? formatEuro(r.vmb) : '\u2014'}</td>
      <td class="py-1.5 px-2 text-center font-bold ${txMargeCol}">${r.txMarge}%</td>
      <td class="py-1.5 px-2 text-right t-secondary">${r.valStock > 0 ? formatEuro(r.valStock) : '\u2014'}</td>
      <td class="py-1.5 px-2 text-center">${r.nbRef}</td>
      <td class="py-1.5 px-2 text-center">${r.nbClients || '\u2014'}</td>
      <td class="py-1.5 px-2 text-center font-bold ${rdCol(r.rendement3m)}">${rdFmt(r.rendement3m)}</td>
      <td class="py-1.5 px-2 text-center font-bold ${txSrvCol}">${r.txService}%</td>
      <td class="py-1.5 px-2 text-center t-secondary">${r.densiteClient}</td>
      <td class="py-1.5 px-2 text-center font-bold ${deltaCol}">${deltaFmt}</td>
    </tr>`;
  }).join('');

  return `<details style="background:linear-gradient(135deg,rgba(100,116,139,0.15),rgba(51,65,85,0.08));border:1px solid rgba(100,116,139,0.25);border-radius:14px;overflow:hidden;margin-bottom:12px">
    <summary style="padding:14px 20px;cursor:pointer;display:flex;align-items:center;justify-content:space-between;background:linear-gradient(135deg,rgba(100,116,139,0.22),rgba(51,65,85,0.14));border-bottom:1px solid rgba(100,116,139,0.2);list-style:none" class="select-none">
      <div style="display:flex;align-items:center;gap:8px">
        <span style="font-weight:800;font-size:13px;color:#cbd5e1">&#128205; Arbitrage rayon</span>
        <span style="font-size:10px;color:rgba(255,255,255,0.45)">${rows.length} emplacements \xb7 ${formatEuro(caTotalPeriode)} CA \xb7 ${formatEuro(vmbTotal)} marge \xb7 tx ${txMargeGlobal}%</span>
      </div>
      <span class="acc-arrow" style="color:#cbd5e1">&#9654;</span>
    </summary>
    <div class="flex flex-wrap gap-1.5 px-4 py-2 items-center">
      ${pills}
      ${_empFilterStatut ? `<button onclick="window._empFilterStatut('')" class="text-[10px] t-disabled hover:t-primary ml-1">✕ Tous</button>` : ''}
      ${_empFilterStatut ? `<span class="text-[10px] ml-2" style="color:${STATUT_BADGE[_empFilterStatut].color}">→ ${STATUT_BADGE[_empFilterStatut].action}</span>` : ''}
      <span class="text-[10px] t-disabled ml-auto">${displayed.length} affichés</span>
    </div>
    <div class="overflow-x-auto" style="max-height:500px;overflow-y:auto">
      <table class="min-w-full text-xs">
        <thead class="s-panel-inner t-inverse font-bold sticky top-0">
          <tr>
            ${th('Emplacement', 'emp', 'text-left')}
            ${th('Statut', 'statut', 'text-center')}
            ${th('CA', 'caPeriode', 'text-right')}
            ${th('Marge', 'vmb', 'text-right')}
            ${th('Tx marge', 'txMarge', 'text-center')}
            ${th('Val. stock', 'valStock', 'text-right')}
            ${th('R\xe9f.', 'nbRef', 'text-center')}
            ${th('Clients', 'nbClients', 'text-center')}
            ${th('Rdt 3m', 'rendement3m', 'text-center')}
            ${th('Tx service', 'txService', 'text-center')}
            ${th('Cli/R\xe9f', 'densiteClient', 'text-center')}
            ${th('\u0394', 'delta', 'text-center')}
          </tr>
        </thead>
        <tbody>${rowsHtml}</tbody>
      </table>
    </div>
    <div class="px-4 py-2 flex items-center gap-3">
      <button onclick="window._empExportCSV()" class="text-[10px] t-secondary border b-light rounded px-3 py-1 hover:t-primary cursor-pointer s-card">\u2b07 CSV</button>
    </div>
    <details class="px-4 py-2">
      <summary class="text-[9px] t-disabled cursor-pointer hover:t-primary select-none">&#128214; Glossaire</summary>
      <div class="text-[9px] t-disabled mt-1 grid grid-cols-2 gap-x-4 gap-y-0.5">
        <div>&#128293; <strong>Moteur</strong> = Top 80% du CA. Centre de profit, optimiser la marge.</div>
        <div>&#128101; <strong>Trafic</strong> = Top 80% du trafic client (hors moteurs). Centre de service, fiabiliser.</div>
        <div>&#128128; <strong>Poids mort</strong> = Ni CA ni trafic significatif. Plan de sortie.</div>
        <div><strong>Rdt 3m</strong> = CA 3 mois \xf7 val. stock. <strong>\u0394</strong> = tendance vs p\xe9riode.</div>
        <div><strong>Tx service</strong> = % refs sans rupture. <strong>Cli/R\xe9f</strong> = densit\xe9 client par ref.</div>
        <div><strong>Tx marge</strong> = VMB \xf7 CA. (R) = ruptures. (D) = dormants.</div>
      </div>
    </details>
  </details>`;
}

export function renderArbitrageRayonBlock() {
  const el = document.getElementById('arbitrageRayonBlock');
  if (!el) return;
  const wasOpen = el.querySelector('details')?.open || false;
  const scrollParent = el.closest('.overflow-y-auto') || el.closest('[class*="mainContent"]') || document.getElementById('mainContent');
  const scrollTop = scrollParent?.scrollTop || 0;
  const rows = computePerfEmplacement();
  if (!rows.length) { el.innerHTML = ''; return; }
  el.innerHTML = _renderArbitrageRayon(rows);
  if (wasOpen) requestAnimationFrame(() => {
    const d = el.querySelector('details');
    if (d) d.open = true;
    if (scrollParent) scrollParent.scrollTop = scrollTop;
  });
}

window._empSortBy = function(col) {
  if (_empSort.col === col) _empSort.asc = !_empSort.asc;
  else { _empSort.col = col; _empSort.asc = col !== 'emp'; }
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
  const header = ['Emplacement','Statut','CA','Marge VMB','Tx marge %','Val stock','Refs','Clients','Rdt 3m','Tx service %','Cli/Ref','Delta','Ruptures','Dormants'].join(sep);
  const lines = rows.map(r =>
    [r.emp, STATUT_BADGE[r.statut]?.label || '', r.caPeriode.toFixed(0), r.vmb.toFixed(0), r.txMarge, r.valStock.toFixed(0), r.nbRef, r.nbClients, r.rendement3m.toFixed(2), r.txService, r.densiteClient, r.delta.toFixed(2), r.nbRupture, r.nbDormant].join(sep)
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
