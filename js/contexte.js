// © 2026 Jawad El Barkaoui — Tous droits réservés
// PRISME — contexte.js
// 1) Bandeau de contexte en tête de chaque écran : agence, date des ventes, fenêtre de calcul
//    propre à l'écran, filtres clients actifs (retirables d'un clic).
// 2) Accessibilité clavier : lignes et blocs cliquables atteignables au clavier (Tab), activés par Entrée/Espace.
// ═══════════════════════════════════════════════════════════════
'use strict';

import { _S } from './state.js';
import { escapeHtml } from './utils.js';

// Fenêtre de calcul de chaque écran (doctrine temporelle, cf. CLAUDE.md)
const FENETRE = {
  partie: '12 derniers mois complets',
  arbitrage: '12 derniers mois complets',
  plan: '12 derniers mois complets',
  portefeuille: 'comptoir · semestres glissants et 12 mois',
  commerce: 'année en cours',
  animation: '12 derniers mois',
  table: '12 derniers mois complets',
};
const AVEC_FILTRES = new Set(['portefeuille', 'commerce', 'plan']);

function _filtres() {
  const out = [];
  if (_S._selectedCommercial) out.push({ l: `Commercial : ${_S._selectedCommercial}`, x: "window._onCommercialInput?.('');var i=document.getElementById('terrCommercialSidebar');if(i)i.value=''" });
  if (_S._distanceMaxKm) out.push({ l: `≤ ${_S._distanceMaxKm} km`, x: 'window._setDistanceQuick?.(0)' });
  if (_S._globalCanal) out.push({ l: `Canal : ${_S._globalCanal.toLowerCase()}`, x: "window._setGlobalCanal?.('')" });
  if (_S._selectedDepts?.size) out.push({ l: `${_S._selectedDepts.size} département${_S._selectedDepts.size > 1 ? 's' : ''}` });
  if (_S._selectedMetier) out.push({ l: `Métier : ${_S._selectedMetier === '__NONE__' ? 'non renseigné' : _S._selectedMetier}` });
  if (_S._filterStrategiqueOnly) out.push({ l: 'Métiers stratégiques' });
  if (_S._selectedClassifs?.size) out.push({ l: `Classif. : ${[..._S._selectedClassifs].join(', ')}` });
  if (_S._selectedDirections?.size) out.push({ l: `${_S._selectedDirections.size} direction${_S._selectedDirections.size > 1 ? 's' : ''}` });
  if (_S._selectedActivitesPDV?.size) out.push({ l: [..._S._selectedActivitesPDV].join(', ') });
  return out;
}

let _cur = '';
/** Rafraîchit le bandeau de l'écran courant (après un changement de filtre). */
export function refreshContextBar() { if (_cur) renderContextBar(_cur); }

export function renderContextBar(id) {
  _cur = id;
  const main = document.getElementById('mainContent');
  if (!main) return;
  let bar = document.getElementById('ctxBar');
  if (!_S.finalData?.length || !FENETRE[id]) { if (bar) bar.style.display = 'none'; return; }
  if (!bar) {
    bar = document.createElement('div');
    bar.id = 'ctxBar';
    main.insertBefore(bar, main.firstChild);
  }
  const d = _S.consommePeriodMaxFull || _S.consommePeriodMax;
  const date = d ? new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
  const fen = id === 'commerce' && d ? `année ${new Date(d).getFullYear()}` : FENETRE[id];
  const f = AVEC_FILTRES.has(id) ? _filtres() : [];
  const chips = f.map(c => c.x
    ? `<button type="button" class="ar-chip ar-chip-on ctx-chip" onclick="${escapeHtml(c.x)}" title="Retirer ce filtre">${escapeHtml(c.l)} ✕</button>`
    : `<span class="ar-chip ar-chip-on ctx-chip">${escapeHtml(c.l)}</span>`).join('');
  const reset = f.length > 1 ? '<button type="button" class="pt-link pt-small" onclick="window._resetChalandiseFilters?.();window._setDistanceQuick?.(0);window._onCommercialInput?.(\'\')">Tout retirer</button>' : '';
  bar.style.display = '';
  bar.innerHTML = `<span class="ctx-item"><span class="ctx-k">Agence</span> ${escapeHtml(_S.selectedMyStore || '—')}</span>
    <span class="ctx-item"><span class="ctx-k">Ventes jusqu’au</span> ${escapeHtml(date)}</span>
    <span class="ctx-item"><span class="ctx-k">Calcul</span> ${escapeHtml(fen)}</span>
    ${f.length ? `<span class="ctx-item ctx-filters"><span class="ctx-k">Filtres</span> ${chips} ${reset}</span>` : ''}`;
}

// ── Accessibilité clavier ──
// Tout élément cliquable qui n'est pas focusable nativement (lignes, cellules, blocs avec onclick/onmouseup)
const SEL = 'tr[onclick], tr[onmouseup], td[onclick], div[onclick], span[onclick], li[onclick]';
function _tag(root) {
  if (!root?.querySelectorAll) return;
  const set = (el) => { if (!el.hasAttribute('tabindex')) { el.tabIndex = 0; if (!el.getAttribute('role')) el.setAttribute('role', 'button'); } };
  if (root.matches?.(SEL)) set(root);
  root.querySelectorAll(SEL).forEach(set);
}
if (typeof document !== 'undefined') {
  new MutationObserver(ms => { for (const m of ms) for (const n of m.addedNodes) if (n.nodeType === 1) _tag(n); })
    .observe(document.documentElement, { childList: true, subtree: true });
  document.addEventListener('keydown', (e) => {
    const el = e.target;
    if ((e.key === 'Enter' || e.key === ' ') && el?.matches?.(SEL)) {
      e.preventDefault();
      if (!el.hasAttribute('onclick') && el.hasAttribute('onmouseup')) el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, button: 0 }));
      else el.click();
    }
  });
}
