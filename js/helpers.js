// ═══════════════════════════════════════════════════════════════
// PRISME — helpers.js
// Fonctions de rendu transverses factorisées depuis main.js
// Dépend de : state.js, utils.js
// ═══════════════════════════════════════════════════════════════
'use strict';

import { _S } from './state.js';
import { formatEuro, escapeHtml } from './utils.js';

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

// ── csvCell — échappement cellule CSV ────────────────────────────
export function csvCell(v) {
  if (v == null) return '';
  const s = String(v).replace(/\r\n|\r|\n/g, ' ');
  if (/[";,\n]/.test(s) || s.includes('"')) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

// ── renderOppNetteTable — tableau Opportunités nettes paginé ─────
// Utilisé identiquement dans renderTerritoireTab et _buildCockpitClient.
// @returns {string} HTML <details> complet
export function renderOppNetteTable() {
  const _OPP_PAGE = 20;
  const _oppAll = _S.opportuniteNette || [];
  const _oppMaxP = Math.max(1, Math.ceil(_oppAll.length / _OPP_PAGE));
  const _oppCur = Math.max(1, Math.min(_S._oppNettePage || 1, _oppMaxP));
  if (_S._oppNettePage !== _oppCur) _S._oppNettePage = _oppCur;
  const _oppSlice = _oppAll.slice((_oppCur - 1) * _OPP_PAGE, _oppCur * _OPP_PAGE);
  const _oppPager = buildPagerHtml({
    total: _oppAll.length, page: _oppCur, pageSize: _OPP_PAGE,
    action: '_oppNettePage',
  });
  const _oppTotalCA = _oppAll.reduce((s, o) => s + o.totalPotentiel, 0);
  const _oppInner = _oppAll.length
    ? `<div class="overflow-x-auto"><table class="w-full text-[11px] border-collapse"><thead><tr class="s-card-alt border-b"><th class="text-left px-3 py-2 font-semibold t-secondary">Client</th><th class="text-left px-3 py-2 font-semibold t-secondary">M\u00e9tier</th><th class="text-left px-3 py-2 font-semibold t-secondary">Familles manquantes</th><th class="text-right px-3 py-2 font-semibold t-secondary">CA potentiel</th><th class="text-left px-3 py-2 font-semibold t-secondary">Canal</th></tr></thead><tbody>${_oppSlice.map(o => {
        const cp = Object.entries(o.canalBreakdown || {}).sort((a, b) => b[1] - a[1])[0]?.[0] || '\u2014';
        const arts = o.missingFams.slice(0, 3).map(f => `<span class="text-[9px] px-1.5 py-0.5 rounded-full i-info-bg c-action font-semibold">${escapeHtml(f.fam)} \u00b7 ${formatEuro(f.ca)}</span>`).join(' ') + (o.missingFams.length > 3 ? ` <span class="text-[9px] t-disabled">+${o.missingFams.length - 3}</span>` : '');
        return `<tr class="border-b b-default hover:i-info-bg cursor-pointer transition-colors" data-cc="${escapeHtml(o.cc)}" onclick="openClient360(this.dataset.cc,'clients')"><td class="px-3 py-2 font-semibold t-primary">${escapeHtml(o.nom)}</td><td class="px-3 py-2 t-secondary">${escapeHtml(o.metier || '\u2014')}</td><td class="px-3 py-2">${arts}</td><td class="px-3 py-2 text-right font-bold c-action">${formatEuro(o.totalPotentiel)}</td><td class="px-3 py-2 t-secondary text-[10px]">${escapeHtml(cp)}</td></tr>`;
      }).join('')}</tbody></table></div>${_oppPager}`
    : `<div class="p-4 text-[12px] t-secondary">\ud83c\udfaf <strong>Opportunit\u00e9s</strong> : Donn\u00e9es insuffisantes pour calculer les opportunit\u00e9s.</div>`;
  return `<details class="mb-3 s-card rounded-xl border overflow-hidden"><summary class="flex items-center justify-between px-4 py-3 s-card-alt border-b cursor-pointer select-none hover:brightness-95"><h3 class="font-extrabold text-sm t-primary">\ud83c\udfaf Opportunit\u00e9s nettes <span class="text-[10px] font-normal t-disabled ml-1">${_oppAll.length} clients \u00b7 ${formatEuro(_oppTotalCA)} rapatriable</span></h3><span class="acc-arrow t-disabled">\u25b6</span></summary>${_oppInner}</details>`;
}
