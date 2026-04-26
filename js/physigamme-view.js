// © 2026 Jawad El Barkaoui — Tous droits réservés
// PRISME — Physigamme view helpers
// Fragments HTML réutilisables pour l'écran Direction > Physigamme.
// ═══════════════════════════════════════════════════════════════
'use strict';

import { formatEuro } from './utils.js';
import { PHYSIGAMME_COPY } from './physigamme.js?v=20260425a';

export function renderPhysigammeHero({ articleCount, perimLabel }) {
  return `<div class="rounded-xl p-3" style="background:linear-gradient(135deg,rgba(56,189,248,0.14),rgba(139,92,246,0.12));border:1px solid rgba(56,189,248,0.25)">
    <div class="flex items-start justify-between gap-3">
      <div>
        <div class="text-[11px] uppercase tracking-widest font-black" style="color:#38bdf8">${PHYSIGAMME_COPY.title}</div>
        <div class="text-sm font-black t-primary mt-0.5">${PHYSIGAMME_COPY.subtitle}</div>
        <div class="text-[10px] t-disabled mt-1">${PHYSIGAMME_COPY.description}</div>
      </div>
      <div class="text-right text-[10px] t-disabled shrink-0">
        <div><strong class="t-primary">${articleCount}</strong> articles analysés</div>
        <div>${perimLabel || ''}</div>
      </div>
    </div>
  </div>`;
}

export function renderPhysigammeKpis({ data, includeAll, isCustom, renderKpi }) {
  return `<div class="grid grid-cols-4 gap-2">
    ${renderKpi('', 'Métiers audités', data.totalMetiers, 'var(--c-action)', includeAll ? '100% fichier' : isCustom ? 'cluster' : 'stratégiques')}
    ${renderKpi('tronc', 'Socle PDV', data.troncCount, '#22c55e', 'standard ≥ 60%')}
    ${renderKpi('inter', 'Socle régional', data.interCount, '#f59e0b', '30-59% métiers')}
    ${renderKpi('spec', 'Spécialistes', data.specCount, '#ef4444', '< 30% métiers')}
  </div>`;
}

export function renderPhysigammePerimeterBar({ perimLabel, articleCount, totalMetiers }) {
  return `<div class="flex items-center gap-2 rounded-lg px-3 py-1.5 text-[10px]" style="background:var(--bg-card);border-left:3px solid var(--c-action)">
    <span class="t-primary font-bold">${perimLabel}</span>
    <span class="t-disabled">· ${articleCount} articles · ${totalMetiers} métiers</span>
  </div>`;
}

export function renderPhysigammeOutOfScope({ clients, ca }) {
  if (!clients) return '';
  return `<div class="flex items-center gap-2 rounded-lg px-3 py-1.5 text-[10px]" style="background:var(--bg-card);border-left:3px solid #a855f7">
    <span class="t-disabled">👤 <strong class="t-primary">${clients}</strong> clients hors cluster (${formatEuro(ca)} CA) — non inclus dans la transversalité</span>
  </div>`;
}
