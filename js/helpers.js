// ═══════════════════════════════════════════════════════════════
// PRISME — helpers.js
// Fonctions de rendu transverses factorisées depuis main.js
// Dépend de : state.js, utils.js
// ═══════════════════════════════════════════════════════════════
'use strict';

import './state.js';
import './utils.js';

// ── buildPagerHtml — pagination unifiée ─────────────────────────
// Génère le HTML d'un pager prev/next avec compteur.
// @param {object} opts
//   total     — nombre total d'items
//   page      — page courante (1-based)
//   pageSize  — items par page
//   action    — nom de l'action data-action pour prev/next (dir passé en data-dir)
//   onCollapse— nom data-action optionnel pour bouton "↑ Réduire"
// @returns {string} HTML du pager
export function buildPagerHtml({ total, page, pageSize, action, onCollapse }) {
  const maxPage = Math.max(1, Math.ceil(total / pageSize));
  const cur = Math.max(1, Math.min(page, maxPage));
  const prev = cur > 1
    ? `<button data-action="${action}" data-dir="-1" class="text-[11px] font-semibold c-action hover:underline px-1 cursor-pointer">\u2190</button>`
    : `<span class="text-[11px] t-disabled px-1">\u2190</span>`;
  const next = cur < maxPage
    ? `<button data-action="${action}" data-dir="1" class="text-[11px] font-semibold c-action hover:underline px-1 cursor-pointer">\u2192</button>`
    : `<span class="text-[11px] t-disabled px-1">\u2192</span>`;
  const collapseBtn = onCollapse
    ? `<button data-action="${onCollapse}" class="text-[10px] t-disabled hover:t-primary cursor-pointer">\u2191 R\u00e9duire</button>`
    : `<span class="text-[10px] t-disabled">${total} items</span>`;
  return `<div class="px-4 py-2 border-t b-default flex items-center justify-between">${collapseBtn}<div class="flex items-center gap-1">${prev}<span class="text-[11px] t-secondary">Page ${cur} sur ${maxPage}</span>${next}</div><span class="text-[10px] t-disabled">${(cur - 1) * pageSize + 1}\u2013${Math.min(cur * pageSize, total)}</span></div>`;
}

// ── deltaColor — classe CSS pour ratio caHors/caPDV ─────────────
// @param {number} caHors — CA hors agence
// @param {number} caPDV  — CA PDV
// @returns {string} classe CSS (c-danger | c-caution | t-tertiary)
export function deltaColor(caHors, caPDV) {
  if (caHors > caPDV * 2) return 'c-danger';
  if (caHors > caPDV * 0.5) return 'c-caution';
  return 't-tertiary';
}
