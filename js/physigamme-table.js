// © 2026 Jawad El Barkaoui — Tous droits réservés
// PRISME — Physigamme article table
// Tableau des décisions articles + accordéon métiers.
// ═══════════════════════════════════════════════════════════════
'use strict';

import { escapeHtml, formatEuro } from './utils.js';
import { renderPhysigammeDecisionBadge } from './physigamme.js?v=20260425a';

function _applyArticleKpiFilter(articles, kpiFilter) {
  if (kpiFilter === 'tronc') return articles.filter(a => a.indice >= 60);
  if (kpiFilter === 'inter') return articles.filter(a => a.indice >= 30 && a.indice < 60);
  if (kpiFilter === 'spec') return articles.filter(a => a.indice < 30);
  return articles;
}

function _groupByFamily(articles) {
  const byFam = new Map();
  for (const art of articles) {
    if (!byFam.has(art.famille)) byFam.set(art.famille, []);
    byFam.get(art.famille).push(art);
  }
  return [...byFam.entries()].sort((a, b) => {
    const bestA = Math.max(...a[1].map(x => x.indice));
    const bestB = Math.max(...b[1].map(x => x.indice));
    return bestB - bestA;
  });
}

export function renderPhysigammeArticleTable({
  data,
  kpiFilter = '',
  effectiveMetiers,
  verdictMap,
  openFams,
  expandedCode,
  famLabel
}) {
  const filtered = _applyArticleKpiFilter(data.articles, kpiFilter);
  const famOrder = _groupByFamily(filtered);
  const cols = 7;

  let html = `<div class="flex justify-end">
    <button onclick="window._troncExport()" class="text-[11px] px-3 py-1.5 rounded-lg font-bold cursor-pointer transition-all text-white" style="background:var(--c-action)">📥 Exporter la Physigamme</button>
  </div>`;

  html += `<div class="overflow-x-auto" style="max-height:60vh;overflow-y:auto">
    <table class="w-full text-[11px]">
    <thead><tr class="t-disabled text-[9px] uppercase" style="border-bottom:1px solid var(--border)">
      <th class="text-left py-1 px-1">Code</th>
      <th class="text-left py-1 px-1">Article</th>
      <th class="text-right py-1 px-1">Métiers</th>
      <th class="py-1 px-1 w-28">Couverture métiers</th>
      <th class="text-right py-1 px-1">CA</th>
      <th class="text-right py-1 px-1">Clients</th>
      <th class="text-center py-1 px-1">Décision gamme</th>
    </tr></thead><tbody>`;

  for (const [cf, arts] of famOrder) {
    const famOpen = openFams.has(cf);
    const famCA = arts.reduce((s, a) => s + a.caTotal, 0);
    const famBestIdx = Math.max(...arts.map(x => x.indice));
    const famBestColor = famBestIdx >= 60 ? '#22c55e' : famBestIdx >= 30 ? '#f59e0b' : '#ef4444';
    html += `<tr class="cursor-pointer hover:brightness-110" style="border-bottom:1px solid var(--border)" onclick="window._troncToggleFam('${escapeHtml(cf)}')">
      <td colspan="2" class="text-[10px] font-bold t-primary pt-2 pb-1 px-1">${famOpen ? '▼' : '▶'} ${famLabel(cf)}</td>
      <td class="text-right text-[9px] t-disabled pt-2 pb-1 px-1">${arts.length} art.</td>
      <td class="pt-2 pb-1 px-1"><span class="text-[9px] font-bold" style="color:${famBestColor}">max ${famBestIdx}%</span></td>
      <td class="text-right text-[9px] t-disabled pt-2 pb-1 px-1">${formatEuro(famCA)}</td>
      <td colspan="2" class="pt-2 pb-1 px-1"></td>
    </tr>`;
    if (!famOpen) continue;

    for (const art of arts.slice(0, 30)) {
      const barColor = art.indice >= 60 ? '#22c55e' : art.indice >= 30 ? '#f59e0b' : '#ef4444';
      const isExpanded = expandedCode === art.code;
      const verdictHtml = renderPhysigammeDecisionBadge(art, verdictMap.get(art.code));

      html += `<tr class="hover:brightness-110 cursor-pointer" style="border-bottom:1px solid var(--border)" onclick="window._troncToggleRow('${art.code}')">
        <td class="py-1 px-1 font-mono text-[10px] t-disabled">${art.code}</td>
        <td class="py-1 px-1">${escapeHtml(art.libelle)}</td>
        <td class="text-right py-1 px-1 font-bold">${art.nbMetiers}/${data.totalMetiers}</td>
        <td class="py-1 px-1"><div class="flex items-center gap-1">
          <div class="flex-1 h-2 rounded-full" style="background:var(--bg-surface)">
            <div class="h-2 rounded-full" style="width:${art.indice}%;background:${barColor}"></div>
          </div>
          <span class="text-[9px] font-bold" style="color:${barColor}">${art.indice}%</span>
        </div></td>
        <td class="text-right py-1 px-1">${formatEuro(art.caTotal)}</td>
        <td class="text-right py-1 px-1">${art.nbClients}</td>
        <td class="text-center py-1 px-1">${verdictHtml}</td>
      </tr>`;

      if (isExpanded) {
        const metiersQui = [...art.metierDetail.keys()].sort();
        const metiersNon = [...effectiveMetiers].filter(m => !art.metierDetail.has(m)).sort();
        html += `<tr><td colspan="${cols}" class="py-2 px-2" style="background:var(--bg-card)">
          <div class="grid grid-cols-2 gap-4">
            <div>
              <div class="text-[10px] font-bold mb-1" style="color:#22c55e">✅ L'achètent (${metiersQui.length})</div>
              ${metiersQui.map(m => {
                const md = art.metierDetail.get(m);
                return `<div class="text-[10px] py-0.5 flex justify-between"><span class="t-primary">${escapeHtml(m)}</span><span class="t-disabled">${md.clients.size} cl. · ${formatEuro(md.ca)}</span></div>`;
              }).join('')}
            </div>
            <div>
              <div class="text-[10px] font-bold mb-1" style="color:#ef4444">❌ L'ignorent (${metiersNon.length})</div>
              ${metiersNon.length ? metiersNon.map(m => `<div class="text-[10px] py-0.5 t-disabled">${escapeHtml(m)}</div>`).join('') : '<div class="text-[10px] t-disabled italic">Aucun — transversal à 100%</div>'}
            </div>
          </div>
        </td></tr>`;
      }
    }
    if (arts.length > 30) {
      html += `<tr><td colspan="${cols}" class="text-[9px] t-disabled px-1 py-0.5">… +${arts.length - 30} articles</td></tr>`;
    }
  }

  return html + `</tbody></table></div></div>`;
}
