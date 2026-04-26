// © 2026 Jawad El Barkaoui — Tous droits réservés
// PRISME — Physigamme deployment
// Vue de déploiement agences : conformité, CA manqué, amorçage.
// ═══════════════════════════════════════════════════════════════
'use strict';

import { formatEuro } from './utils.js';

function _median(values) {
  if (!values.length) return 0;
  const sorted = values.slice().sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] || 0;
}

export function buildPhysigammeDeployment({
  articles,
  stores,
  storeSnapshots,
  amorcageStores,
  airainApplied,
  airainTotal,
  totalMetiers
}) {
  const troncArticlesAll = articles.filter(a => a.indice >= 60);
  const troncCodes = troncArticlesAll.map(a => a.code);
  const amorcageSet = amorcageStores || new Set();
  const activeStores = stores.filter(s => !amorcageSet.has(s));

  const storeData = [];
  for (const store of stores) {
    const sd = storeSnapshots.get(store) || {};
    let implanted = 0, caTotal = 0, caMissed = 0;
    const missing = [];
    for (const code of troncCodes) {
      if (sd[code] && ((sd[code].sumCA || 0) > 0 || (sd[code].sumPrelevee || 0) > 0)) {
        implanted++;
        caTotal += sd[code].sumCA || 0;
      } else {
        const cas = activeStores.map(s => storeSnapshots.get(s)?.[code]?.sumCA || 0).filter(v => v > 0);
        caMissed += _median(cas);
        missing.push(code);
      }
    }
    const pct = troncCodes.length ? Math.round(implanted / troncCodes.length * 100) : 0;
    storeData.push({ store, implanted, total: troncCodes.length, pct, caTotal, caMissed, missing, isAmorcage: amorcageSet.has(store) });
  }

  const activeData = storeData.filter(d => !d.isAmorcage).sort((a, b) => b.pct - a.pct);
  const amorcageData = storeData.filter(d => d.isAmorcage).sort((a, b) => a.store.localeCompare(b.store));

  return {
    troncCodes,
    airainApplied,
    airainTotal,
    totalMetiers,
    activeData,
    amorcageData,
    sortedStoreData: [...activeData, ...amorcageData],
    avgPct: activeData.length ? Math.round(activeData.reduce((s, d) => s + d.pct, 0) / activeData.length) : 0,
    below50: activeData.filter(d => d.pct < 50).length,
    totalMissedCA: activeData.reduce((s, d) => s + d.caMissed, 0)
  };
}

export function renderPhysigammeDeployment({ deployment, myStore }) {
  const { troncCodes, activeData, amorcageData, sortedStoreData, avgPct, below50, totalMissedCA, airainApplied, airainTotal, totalMetiers } = deployment;

  if (!troncCodes.length) {
    return `<div class="text-center t-disabled py-4">Aucun article Socle PDV (≥60%) pour vérifier le déploiement agence.</div></div>`;
  }

  let html = '';
  if (airainApplied) {
    html += `<div class="text-[9px] t-disabled mb-2 px-2">🛡️ Loi d'Airain active — <strong class="t-primary">${troncCodes.length} Incontournables</strong> sur ${airainTotal} articles Socle PDV (≥60% agences)</div>`;
  }
  if (amorcageData.length) {
    html += `<div class="text-[9px] mb-2 px-2 py-1 rounded" style="background:rgba(34,197,94,0.1);color:#22c55e">🚀 <strong>${amorcageData.length}</strong> agence${amorcageData.length > 1 ? 's' : ''} en amorçage — exclue${amorcageData.length > 1 ? 's' : ''} des statistiques (${amorcageData.map(d => d.store).join(', ')})</div>`;
  }

  html += `<div class="grid grid-cols-4 gap-2 mb-3">
    <div class="rounded-lg p-3 text-center" style="background:var(--bg-card)">
      <div class="text-2xl font-black" style="color:#8B5CF6">${troncCodes.length}</div>
      <div class="text-[10px] t-primary font-bold">${airainApplied ? 'Incontournables' : 'Socle PDV'}</div>
      <div class="text-[9px] t-disabled">${airainApplied ? "Loi d'Airain · ≥60% agences" : `${totalMetiers} métiers · ≥60%`}</div>
    </div>
    <div class="rounded-lg p-3 text-center" style="background:var(--bg-card)">
      <div class="text-2xl font-black" style="color:${avgPct >= 70 ? '#22c55e' : '#f59e0b'}">${avgPct}%</div>
      <div class="text-[10px] t-primary font-bold">Implantation moy.</div>
    </div>
    <div class="rounded-lg p-3 text-center" style="background:var(--bg-card)">
      <div class="text-2xl font-black" style="color:#ef4444">${below50}</div>
      <div class="text-[10px] t-primary font-bold">Agences < 50%</div>
      <div class="text-[9px] t-disabled">à recadrer</div>
    </div>
    <div class="rounded-lg p-3 text-center" style="background:var(--bg-card)">
      <div class="text-2xl font-black" style="color:#ef4444">${formatEuro(totalMissedCA)}</div>
      <div class="text-[10px] t-primary font-bold">CA perdu estimé</div>
    </div>
  </div>`;

  html += `<div id="troncConfMissingPanel"></div>`;

  const rows = sortedStoreData.map(d => {
    const isMine = d.store === myStore;
    const ring = isMine ? 'outline:2px solid #8B5CF6;outline-offset:-2px;' : '';

    if (d.isAmorcage) {
      return `<tr style="${ring}background:rgba(34,197,94,0.05)">
        <td class="px-3 py-2 text-[11px] font-bold" style="color:#22c55e">${d.store}</td>
        <td class="px-3 py-2"><span class="text-[9px] px-2 py-0.5 rounded-full font-bold text-white" style="background:#22c55e">🚀 Amorçage</span></td>
        <td class="px-3 py-2 text-[11px] t-disabled text-center" colspan="2">Exclue des statistiques</td>
        <td class="px-3 py-2 text-right">
          <button onclick="event.stopPropagation();window._troncKitDemarrage('${d.store}')" class="text-[9px] px-2 py-1 rounded font-bold cursor-pointer text-white" style="background:#22c55e">🚀 Kit de Démarrage</button>
        </td>
        <td class="px-3 py-2 text-right">
          <button onclick="event.stopPropagation();window._troncToggleAmorcage('${d.store}')" class="text-[9px] px-1.5 py-0.5 rounded cursor-pointer t-disabled" style="background:var(--bg-surface)" title="Retirer du mode amorçage">✕</button>
        </td>
      </tr>`;
    }

    const color = d.pct >= 80 ? '#22c55e' : d.pct >= 50 ? '#f59e0b' : '#ef4444';
    const barW = Math.max(d.pct, 2);
    return `<tr class="hover:s-hover cursor-pointer" onclick="window._troncConfShowMissing('${d.store}')" style="${ring}">
      <td class="px-3 py-2 text-[11px] font-bold ${isMine ? 'text-violet-400' : 't-primary'}">
        ${d.store}
        <button onclick="event.stopPropagation();window._troncToggleAmorcage('${d.store}')" class="text-[8px] ml-1 px-1 py-0.5 rounded cursor-pointer t-disabled opacity-40 hover:opacity-100" style="background:var(--bg-surface)" title="Marquer en amorçage (nouvelle agence)">🚀</button>
      </td>
      <td class="px-3 py-2"><div class="flex items-center gap-2">
        <div class="w-32 h-2 rounded-full" style="background:var(--bg-surface)">
          <div class="h-full rounded-full" style="width:${barW}%;background:${color}"></div>
        </div>
        <span class="text-[11px] font-bold" style="color:${color}">${d.pct}%</span>
      </div></td>
      <td class="px-3 py-2 text-[11px] t-primary text-right">${d.implanted}/${d.total}</td>
      <td class="px-3 py-2 text-[11px] t-disabled text-right">${formatEuro(d.caTotal)}</td>
      <td class="px-3 py-2 text-[11px] font-bold text-right" style="color:${d.caMissed > 1000 ? '#ef4444' : '#f59e0b'}">${d.caMissed > 0 ? formatEuro(d.caMissed) : '-'}</td>
      <td class="px-3 py-2 text-[11px] t-disabled text-right">${d.missing.length > 0 ? d.missing.length + ' réf.' : '✓'}</td>
    </tr>`;
  }).join('');

  return html + `<div class="overflow-x-auto rounded-lg" style="background:var(--bg-card)">
    <table class="w-full"><thead><tr class="text-[9px] t-disabled uppercase tracking-wider">
      <th class="px-3 py-2 text-left">Agence</th>
      <th class="px-3 py-2 text-left">Implantation</th>
      <th class="px-3 py-2 text-right">Couverture</th>
      <th class="px-3 py-2 text-right">CA vendus</th>
      <th class="px-3 py-2 text-right">CA perdu est.</th>
      <th class="px-3 py-2 text-right">Manquants</th>
    </tr></thead><tbody>${rows}</tbody></table>
  </div></div>`;
}
