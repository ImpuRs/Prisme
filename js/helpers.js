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
  // Filtre Portefeuille — propagation stricte aux opportunités
  const _comOpp = _S._selectedCommercial || '';
  const _comSetOpp = _comOpp ? (_S.clientsByCommercial?.get(_comOpp) || new Set()) : null;
  const _oppAll = _comSetOpp ? (_S.opportuniteNette || []).filter(o => _comSetOpp.has(o.cc)) : (_S.opportuniteNette || []);
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
        return `<tr class="border-b b-default hover:i-info-bg cursor-pointer transition-colors" data-cc="${escapeHtml(o.cc)}" onclick="openClient360(this.dataset.cc,'clients')"><td class="px-3 py-2 font-semibold t-primary">${escapeHtml(o.nom)}<button onclick="event.stopPropagation();openClient360('${escapeHtml(o.cc)}','clients')" class="text-[10px] t-disabled hover:text-white cursor-pointer opacity-30 hover:opacity-100 transition-opacity ml-1" title="Ouvrir la fiche 360°">🔍</button></td><td class="px-3 py-2 t-secondary">${escapeHtml(o.metier || '\u2014')}</td><td class="px-3 py-2">${arts}</td><td class="px-3 py-2 text-right font-bold c-action">${formatEuro(o.totalPotentiel)}</td><td class="px-3 py-2 t-secondary text-[10px]">${escapeHtml(cp)}</td></tr>`;
      }).join('')}</tbody></table></div>${_oppPager}`
    : `<div class="p-4 text-[12px] t-secondary">💡 <strong>Opportunit\u00e9s</strong> : Donn\u00e9es insuffisantes pour calculer les opportunit\u00e9s.</div>`;
  return `<details style="background:linear-gradient(135deg,rgba(6,182,212,0.12),rgba(8,145,178,0.06));border:1px solid rgba(6,182,212,0.25);border-radius:14px;overflow:hidden;margin-bottom:12px"><summary style="padding:14px 20px;cursor:pointer;display:flex;align-items:center;justify-content:space-between;background:linear-gradient(135deg,rgba(6,182,212,0.18),rgba(8,145,178,0.10));border-bottom:1px solid rgba(6,182,212,0.2);list-style:none" class="select-none"><h3 style="font-weight:800;font-size:13px;color:#22d3ee;display:flex;align-items:center;gap:6px">🎯 Cross-Sell : Opportunités sur clients actifs <span style="font-size:10px;font-weight:400;color:rgba(255,255,255,0.45)">${_oppAll.length} clients · ${formatEuro(_oppTotalCA)} rapatriable</span></h3><span class="acc-arrow" style="color:#22d3ee">▶</span></summary>${_oppInner}</details>`;
}

// ── renderAnglesMortsTable — Angles Morts agence (tronc commun métier) ──
// Familles que les confrères métier achètent chez Legallais mais pas ce client.
// @returns {string} HTML <details> complet
export function renderAnglesMortsTable() {
  const _AM_PAGE = 20;
  const _comAM = _S._selectedCommercial || '';
  const _comSetAM = _comAM ? (_S.clientsByCommercial?.get(_comAM) || new Set()) : null;
  const _amAll = _comSetAM ? (_S.anglesMorts || []).filter(o => _comSetAM.has(o.cc)) : (_S.anglesMorts || []);
  const _amMaxP = Math.max(1, Math.ceil(_amAll.length / _AM_PAGE));
  const _amCur = Math.max(1, Math.min(_S._anglesMortsPage || 1, _amMaxP));
  if (_S._anglesMortsPage !== _amCur) _S._anglesMortsPage = _amCur;
  const _amSlice = _amAll.slice((_amCur - 1) * _AM_PAGE, _amCur * _AM_PAGE);
  const _amPager = buildPagerHtml({
    total: _amAll.length, page: _amCur, pageSize: _AM_PAGE,
    action: '_anglesMortsPage',
  });
  const _amTotalCA = _amAll.reduce((s, o) => s + o.totalPotentiel, 0);
  const _amInner = _amAll.length
    ? `<div class="overflow-x-auto"><table class="w-full text-[11px] border-collapse"><thead><tr class="s-card-alt border-b"><th class="text-left px-3 py-2 font-semibold t-secondary">Client</th><th class="text-left px-3 py-2 font-semibold t-secondary">M\u00e9tier</th><th class="text-left px-3 py-2 font-semibold t-secondary">Familles absentes (tronc commun)</th><th class="text-right px-3 py-2 font-semibold t-secondary">Potentiel</th></tr></thead><tbody>${_amSlice.map(o => {
        const fams = o.missing.slice(0, 3).map(f =>
          `<span class="text-[9px] px-1.5 py-0.5 rounded-full font-semibold" style="background:rgba(248,113,113,0.15);color:#f87171">${escapeHtml(f.fam)} <span style="opacity:0.6">${f.pctClients}%</span> \u00b7 ${formatEuro(f.potentiel)}</span>`
        ).join(' ') + (o.missing.length > 3 ? ` <span class="text-[9px] t-disabled">+${o.missing.length - 3}</span>` : '');
        return `<tr class="border-b b-default hover:i-info-bg cursor-pointer transition-colors" data-cc="${escapeHtml(o.cc)}" onclick="openClient360(this.dataset.cc,'clients')"><td class="px-3 py-2 font-semibold t-primary">${escapeHtml(o.nom)}<button onclick="event.stopPropagation();openClient360('${escapeHtml(o.cc)}','clients')" class="text-[10px] t-disabled hover:text-white cursor-pointer opacity-30 hover:opacity-100 transition-opacity ml-1" title="Ouvrir fiche 360\u00b0">🔍</button></td><td class="px-3 py-2 t-secondary">${escapeHtml(o.metier || '\u2014')}</td><td class="px-3 py-2">${fams}</td><td class="px-3 py-2 text-right font-bold" style="color:#f87171">${formatEuro(o.totalPotentiel)}</td></tr>`;
      }).join('')}</tbody></table></div>${_amPager}`
    : `<div class="p-4 text-[12px] t-secondary">\ud83d\udca1 <strong>Angles Morts</strong> : N\u00e9cessite Zone de Chalandise + agr\u00e9gats clients (m\u00e9tier renseign\u00e9).</div>`;
  return `<details style="background:linear-gradient(135deg,rgba(248,113,113,0.12),rgba(220,38,38,0.06));border:1px solid rgba(248,113,113,0.25);border-radius:14px;overflow:hidden;margin-bottom:12px"><summary style="padding:14px 20px;cursor:pointer;display:flex;align-items:center;justify-content:space-between;background:linear-gradient(135deg,rgba(248,113,113,0.18),rgba(220,38,38,0.10));border-bottom:1px solid rgba(248,113,113,0.2);list-style:none" class="select-none"><h3 style="font-weight:800;font-size:13px;color:#f87171;display:flex;align-items:center;gap:6px">\ud83d\udd75\ufe0f Angles Morts \u2014 Achats probables chez la concurrence <span style="font-size:10px;font-weight:400;color:rgba(255,255,255,0.45)">${_amAll.length} clients \u00b7 ${formatEuro(_amTotalCA)} potentiel</span></h3><span class="acc-arrow" style="color:#f87171">\u25b6</span></summary>${_amInner}</details>`;
}
