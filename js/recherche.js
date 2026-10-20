// © 2026 Jawad El Barkaoui — Tous droits réservés
// PRISME — recherche.js
// Recherche unique dans la barre du haut : code article (6 chiffres), libellé, code ou nom client.
// Entrée = premier résultat ; ↑/↓ pour choisir ; « / » ou Ctrl+K pour y aller ; Échap pour fermer.
// Ouvre la fiche article (openArticlePanel) ou la fiche client (openClient360).
// ═══════════════════════════════════════════════════════════════
'use strict';

import { _S } from './state.js';
import { escapeHtml, normalizeStr } from './utils.js';

const MAX_PER_KIND = 6;
let _idx = null, _idxKey = '', _sel = 0, _hits = [];

function _key() {
  return `${_S.selectedMyStore || ''}|${_S.finalData?.length || 0}|${Object.keys(_S.libelleLookup || {}).length}|${_S.chalandiseData?.size || 0}|${Object.keys(_S.clientNomLookup || {}).length}`;
}

/** Index : articles (finalData + libellés du consommé) et clients (consommé + chalandise). */
function _index() {
  const k = _key();
  if (_idx && k === _idxKey) return _idx;
  const arts = new Map();
  for (const r of _S.finalData || []) {
    if (!r?.code) continue;
    arts.set(r.code, { kind: 'a', id: r.code, mine: 1, lib: r.libelle || '', sub: `${r.code} · stock ${r.stockActuel ?? 0}${r.emplacement ? ' · ' + r.emplacement : ''}` });
  }
  for (const [code, lib] of Object.entries(_S.libelleLookup || {})) {
    if (!arts.has(code) && /^\d{6}$/.test(code)) arts.set(code, { kind: 'a', id: code, lib: lib || '', sub: `${code} · pas dans ton stock` });
  }
  const clis = new Map();
  for (const [cc, nom] of Object.entries(_S.clientNomLookup || {})) clis.set(cc, { kind: 'c', id: cc, lib: nom || cc, sub: cc });
  for (const [cc, info] of _S.chalandiseData || []) {
    const e = clis.get(cc) || { kind: 'c', id: cc, lib: info.nom || cc, sub: cc };
    if (!e.lib || e.lib === cc) e.lib = info.nom || cc;
    e.sub = [cc, info.metier, info.ville].filter(Boolean).join(' · ');
    clis.set(cc, e);
  }
  const prep = (e) => ({ ...e, hay: normalizeStr(`${e.id} ${e.lib}`) });
  _idx = { arts: [...arts.values()].map(prep), clis: [...clis.values()].map(prep) };
  _idxKey = k;
  return _idx;
}

function _search(q) {
  const nq = normalizeStr(q).trim();
  if (nq.length < 2) return [];
  const terms = nq.split(/\s+/);
  const idx = _index();
  const rank = (e) => (e.id === nq ? 0 : e.id.startsWith(nq) ? 1 : normalizeStr(e.lib).startsWith(nq) ? 2 : 3);
  const pick = (list) => {
    const out = [];
    for (const e of list) {
      if (!terms.every(t => e.hay.includes(t))) continue;
      out.push(e);
      if (out.length > 200) break;
    }
    return out.sort((a, b) => rank(a) - rank(b) || (b.mine || 0) - (a.mine || 0) || a.lib.localeCompare(b.lib, 'fr')).slice(0, MAX_PER_KIND);
  };
  // Articles (ceux de ton stock d'abord) puis clients
  return [...pick(idx.arts), ...pick(idx.clis)];
}

function _render() {
  const box = document.getElementById('gsResults');
  if (!box) return;
  const q = document.getElementById('gsInput')?.value || '';
  if (!q.trim()) { box.hidden = true; box.innerHTML = ''; return; }
  _hits = _search(q);
  if (_sel >= _hits.length) _sel = 0;
  if (!_hits.length) {
    box.innerHTML = `<div class="gs-empty">${normalizeStr(q).trim().length < 2 ? 'Tape au moins 2 caractères' : 'Aucun article ni client'}</div>`;
    box.hidden = false; return;
  }
  let last = '';
  box.innerHTML = _hits.map((h, i) => {
    const head = h.kind !== last ? `<div class="gs-head">${h.kind === 'a' ? 'Articles' : 'Clients'}</div>` : '';
    last = h.kind;
    return `${head}<button type="button" class="gs-item${i === _sel ? ' gs-on' : ''}" role="option" aria-selected="${i === _sel}" onmousedown="event.preventDefault();window._gsOpen(${i})">
      <span class="gs-lib">${escapeHtml(h.lib)}</span><span class="gs-sub">${escapeHtml(h.sub)}</span></button>`;
  }).join('');
  box.hidden = false;
}

function _open(i) {
  const h = _hits[i];
  if (!h) return;
  const inp = document.getElementById('gsInput');
  if (inp) { inp.value = ''; inp.blur(); }
  _render();
  if (h.kind === 'a') window.openArticlePanel?.(h.id, 'recherche');
  else window.openClient360?.(h.id, 'recherche');
}
window._gsOpen = _open;

function _mount() {
  if (document.getElementById('gsWrap')) return;
  const anchor = document.getElementById('navKpis');
  if (!anchor?.parentElement) return;
  const wrap = document.createElement('div');
  wrap.id = 'gsWrap';
  wrap.className = 'gs-wrap';
  wrap.innerHTML = `<input id="gsInput" class="gs-input" type="search" autocomplete="off" spellcheck="false"
      placeholder="Article ou client…  ( / )" aria-label="Rechercher un article ou un client" role="combobox" aria-controls="gsResults" aria-expanded="false">
    <div id="gsResults" class="gs-results" role="listbox" hidden></div>`;
  anchor.parentElement.insertBefore(wrap, anchor);
  const inp = wrap.querySelector('#gsInput');
  inp.addEventListener('input', () => { _sel = 0; _render(); inp.setAttribute('aria-expanded', String(!document.getElementById('gsResults').hidden)); });
  inp.addEventListener('focus', _render);
  inp.addEventListener('blur', () => setTimeout(() => { const b = document.getElementById('gsResults'); if (b) b.hidden = true; inp.setAttribute('aria-expanded', 'false'); }, 120));
  inp.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); if (_hits.length) { _sel = (_sel + 1) % _hits.length; _render(); } }
    else if (e.key === 'ArrowUp') { e.preventDefault(); if (_hits.length) { _sel = (_sel - 1 + _hits.length) % _hits.length; _render(); } }
    else if (e.key === 'Enter') { e.preventDefault(); _open(_sel); }
    else if (e.key === 'Escape') { inp.value = ''; _render(); inp.blur(); }
  });
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', _mount); else _mount();
  // « / » ou Ctrl/Cmd+K : aller à la recherche (hors champs de saisie)
  document.addEventListener('keydown', (e) => {
    const tag = document.activeElement?.tagName;
    const typing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || document.activeElement?.isContentEditable;
    if ((e.key === '/' && !typing) || ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k')) {
      const inp = document.getElementById('gsInput');
      if (inp && document.body.classList.contains('pilot-loaded')) { e.preventDefault(); inp.focus(); inp.select(); }
    }
  });
}
