// © 2026 Jawad El Barkaoui — Tous droits réservés
// PRISME — relances.js
// Suivi des relances clients : « Appelé », « RDV pris », « Sans suite » + note libre (l'info terrain),
// avec la date. Gardé dans PRISME_PARTIE ('rel|<agence>') : survit à « Purger le cache » et part dans
// la sauvegarde JSON de « Ton suivi ». Affiché dans la fiche client et dans les listes de Tes clients.
// ═══════════════════════════════════════════════════════════════
'use strict';

import { _S } from './state.js';
import { escapeHtml } from './utils.js';
import { _loadRelances, _saveRelances } from './cache.js';

export const RELANCE_STATUTS = {
  appele: { label: 'Appelé', tone: 'mid' },
  rdv: { label: 'RDV pris', tone: 'high' },
  sans_suite: { label: 'Sans suite', tone: 'low' },
  note: { label: 'Note', tone: '' },
};

let _store = '', _data = {}, _loading = null;

/** Charge les relances de l'agence courante (une fois par agence). */
export async function ensureRelances() {
  const store = _S.selectedMyStore || '';
  if (store === _store && !_loading) return _data;
  if (_loading && store === _store) return _loading;
  _store = store;
  _loading = _loadRelances(store).then(d => { _data = d || {}; _loading = null; return _data; });
  return _loading;
}

const _today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const _fmt = (ymd) => { const [y, m, d] = String(ymd).split('-').map(Number); return new Date(y, m - 1, d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }); };

/** Toutes les relances de l'agence (après ensureRelances) : { cc: [{ d, s, n }] }. */
export function relancesData() { return _data; }

/** Dernier statut (hors simple note) d'un client : { s, d, n } ou null. */
export function relanceLast(cc) {
  const h = _data[cc];
  if (!h?.length) return null;
  for (let i = h.length - 1; i >= 0; i--) if (h[i].s !== 'note') return h[i];
  return null;
}

/** Pastille de suivi pour une liste (vide si jamais relancé). */
export function relanceBadge(cc) {
  const l = relanceLast(cc);
  if (!l) return '';
  const st = RELANCE_STATUTS[l.s] || RELANCE_STATUTS.note;
  return `<span class="ar-tag" data-tone="${st.tone}" title="${escapeHtml(l.n || '')}">${st.label} · ${_fmt(l.d)}</span>`;
}

/** Texte de suivi pour un export CSV. */
export function relanceText(cc) {
  const l = relanceLast(cc);
  if (!l) return '';
  return `${(RELANCE_STATUTS[l.s] || RELANCE_STATUTS.note).label} ${l.d}${l.n ? ' — ' + l.n : ''}`;
}

async function _add(cc, s, n) {
  await ensureRelances();
  const h = _data[cc] || (_data[cc] = []);
  h.push({ d: _today(), s, ...(n ? { n } : {}) });
  if (h.length > 30) h.splice(0, h.length - 30);
  await _saveRelances(_store, _data);
}

function _box(cc) {
  const h = _data[cc] || [];
  const btn = (s) => `<button type="button" class="pt-btn rl-btn" onclick="window._relanceAdd('${escapeHtml(cc)}','${s}')">${RELANCE_STATUTS[s].label}</button>`;
  const hist = h.slice().reverse().slice(0, 6).map(e => {
    const st = RELANCE_STATUTS[e.s] || RELANCE_STATUTS.note;
    return `<li><span class="pt-num pt-muted">${_fmt(e.d)}</span> ${e.s === 'note' ? '' : `<span class="ar-tag" data-tone="${st.tone}">${st.label}</span>`} ${escapeHtml(e.n || '')}</li>`;
  }).join('');
  return `<div class="rl-box">
    <div class="pt-row" style="gap:8px;flex-wrap:wrap;align-items:center">
      <span class="pt-eyebrow" style="margin-right:4px">Suivi de relance</span>
      ${btn('appele')}${btn('rdv')}${btn('sans_suite')}
      <input id="rlNote" class="rl-note" type="text" maxlength="200" placeholder="Note (chantier, concurrent, besoin…) puis Entrée"
        onkeydown="if(event.key==='Enter'){event.preventDefault();window._relanceAdd('${escapeHtml(cc)}', 'note', this.value)}">
    </div>
    ${hist ? `<ul class="rl-hist">${hist}</ul>` : '<p class="pt-small pt-muted" style="margin:6px 0 0">Pas encore de relance notée pour ce client.</p>'}
  </div>`;
}

/** Remplit le bloc « Suivi de relance » de la fiche client. */
async function _mount(cc) {
  await ensureRelances();
  const el = document.getElementById('c360Relance');
  if (el && el.dataset.cc === cc) el.innerHTML = _box(cc);
}

window._relanceMount = (cc) => { _mount(cc); };
window._relanceAdd = async (cc, s, note) => {
  const noteInput = document.getElementById('rlNote');
  const n = (note ?? noteInput?.value ?? '').trim();
  if (s === 'note' && !n) return;
  await _add(cc, s, n);
  await _mount(cc);
  window.showToast?.(`${RELANCE_STATUTS[s].label} noté pour ce client`, 'success', 2000);
  if (document.getElementById('tabPortefeuille') && !document.getElementById('tabPortefeuille').classList.contains('hidden')) window._tcRefresh?.();
};
