// ═══════════════════════════════════════════════════════════════
// PRISME — plan-famille.js
// Pilotage Stock › Plan › « Par famille » : la page famille de La partie, en grand.
//   • à gauche  : les familles, notées avec LE MÊME score que La partie (computePartie)
//   • à droite  : la famille choisie — 4 critères, puis ses articles rangés en 5 gestes
//                 (garder, implanter, sortir, surveiller, recalibrer), chacun avec son « pourquoi »
//   • pour creuser : Métiers / Analyse / Réseau (rendus historiques de planRayon.js, via bridge)
// Verdicts affichés en clair (verdictLabel : 9 gestes) ; le détail du verdict interne passe en infobulle.
// Assortiment → 12MG pleine période (finalData, articleClientsFull, squelette).
// Dépend de : state.js, utils.js, constants.js, engine.js, partie.js
// ═══════════════════════════════════════════════════════════════
'use strict';

import { _S } from './state.js';
import { escapeHtml, formatEuro } from './utils.js';
import { PARTIE_WEIGHTS, PARTIE_FAM_MIN_REFS, SQ_RESEAU_FORT_CA_AGENCE } from './constants.js';
import { computeSquelette, verdictLabel } from './engine.js';
import { computePartie, CRIT_LABELS } from './partie.js';
import { getArticleLastSaleMonthIdx, monthIdxFromDate, getVentesHorsMagFullMap } from './sales.js';

const ROW_LIMIT = 60;

// État de la vue (module) — survit aux re-rendus, réinitialisé au chargement de données
let _host = null, _bridge = null;
let _p = null;          // computePartie({ minRefs: 1 })
let _ctx = null;        // index partagés (réseau, clients, implanter par famille…)
let _sel = '';          // famille ouverte
let _sf = '';           // sous-famille filtrée ('' = toutes)
let _q = '';            // recherche famille
let _hl = '';           // article mis en évidence (recherche par code)
let _open = new Set(['sortir', 'implanter']); // groupes dépliés
let _more = new Set();  // groupes affichés en entier

const _col = (s) => s == null ? 'var(--t-disabled)' : s < 70 ? 'var(--pt-low)' : s < 80 ? 'var(--pt-mid)' : 'var(--pt-high)';
const _bar = (v, h = 6) => `<span class="pt-track" style="height:${h}px"><span class="pt-fill" style="width:${Math.max(0, Math.min(100, v))}%;background:${_col(v)}"></span></span>`;
const _n = (v) => Number(v || 0).toLocaleString('fr-FR');
const _s = (n, one, many) => n > 1 ? many : one;

function _buildCtx() {
  const vpm = _S.ventesParAgence || {};
  const my = _S.selectedMyStore;
  const stores = Object.keys(vpm).filter(s => s !== my);
  const nbStores = Math.max(1, stores.length);
  const reseau = (code) => {
    let n = 0, ca = 0;
    for (const s of stores) { const d = vpm[s]?.[code]; if (d && d.countBL > 0) { n++; ca += d.sumCA || 0; } }
    return { n, ca };
  };
  const implByFam = new Map();
  let sq = null;
  try { sq = computeSquelette(); } catch (_) { /* squelette indisponible : pas de groupe Implanter */ }
  if (sq?._allArticles) {
    for (const [, a] of sq._allArticles) {
      if (a.classification !== 'implanter' || !a.famille) continue;
      if (!implByFam.has(a.famille)) implByFam.set(a.famille, []);
      implByFam.get(a.famille).push(a);
    }
  }
  const survByFam = new Map();
  const famOfCode = new Map();
  for (const r of _S.finalData || []) {
    if (r.famille) famOfCode.set(r.code, r.famille);
    if (r.isParent || r._sqClassif !== 'surveiller' || !r.famille) continue;
    if (!survByFam.has(r.famille)) survByFam.set(r.famille, []);
    survByFam.get(r.famille).push(r);
  }
  for (const [f, arr] of implByFam) for (const a of arr) if (!famOfCode.has(a.code)) famOfCode.set(a.code, f);
  // Acheteurs hors comptoir (web, livraison, représentant) par article — pour « Acheté hors comptoir »
  const horsBuyers = new Map();
  for (const [cc, arts] of getVentesHorsMagFullMap()) for (const [code, v] of arts) {
    if (!(v.sumCA > 0)) continue;
    let a = horsBuyers.get(code); if (!a) horsBuyers.set(code, a = []);
    a.push({ cc, ca: v.sumCA });
  }
  return { nbStores, reseau, implByFam, survByFam, famOfCode, horsBuyers, cliFull: _S.articleClientsFull || new Map() };
}

// ── Gestes ───────────────────────────────────────────────────
const VERDICT_TIP = {
  'Le Capitaine': 'Incontournable qui tourne chez toi : zéro rupture.',
  'Le Lien Fort': 'Acheté par tes clients de métiers stratégiques : à garder.',
  'La Bonne Pioche': 'Nouveauté qui a trouvé son public.',
  'Le Bon Soldat': 'Fond de rayon qui tourne.',
  "L'Alerte Rouge": 'Incontournable réseau qui ralentit chez toi : vérifier prix, ruptures passées.',
  'Le Stagiaire': 'Nouveauté encore en observation.',
  'Le Point de Rupture': 'Ralentit chez tes clients stratégiques : un client s’en va ?',
  'Le Déclinant': 'Vend peu : réduire le stock et observer.',
  'La Réf Schizo': 'Les autres agences le vendent vraiment, toi jamais en 12 mois : vérifie prix, emplacement, visibilité avant de le sortir.',
  "L'Erreur de Casting": 'Nouveauté qui n’a pas pris : on sort.',
  'La Trahison': 'Rien au comptoir en 12 mois, mais un client de métier stratégique l’achète par un autre canal (web, livraison) : vois avec lui avant de sortir.',
  'Le Poids Mort': 'Ne se vend plus : on sort, on libère le cash et la place.',
  'Ancre Métier': 'Invendu gardé exprès à 1 exemplaire : dernier lien avec un métier clé.',
};
const TAG_TONE = { 'À garder': 'high', 'Gardé à 1 · métier clé': 'high', 'Incontournable qui ralentit': 'mid', 'Client stratégique qui ralentit': 'mid', 'À surveiller': '', 'À sortir': 'low', 'Vendu en réseau, jamais ici': 'low', 'Acheté hors comptoir': 'low' };
const _tag = (v, sameAs = '') => { const l = verdictLabel(v); return l && l !== sameAs ? `<span class="ar-tag" data-tone="${TAG_TONE[l] || ''}" title="${escapeHtml(VERDICT_TIP[v] || '')}">${escapeHtml(l)}</span>` : ''; };
const _mm = (r) => `${r.ancienMin || 0}/${r.ancienMax || 0}`;
const _age = (j) => j == null || j >= 999 ? '—' : j >= 365 ? `${(j / 365).toFixed(1).replace('.', ',')} an${j >= 730 ? 's' : ''}` : `${j} j`;

/** Ce qu'il faut vérifier avant de sortir un invendu (vide = rien, on sort). */
function _avantSortir(r) {
  if (r._sqVerdict === 'La Réf Schizo') {
    const x = _ctx.reseau(r.code);
    return `<span title="${escapeHtml(VERDICT_TIP['La Réf Schizo'])} (${formatEuro(x.n ? x.ca / x.n : 0)}/an par agence)"><span class="ar-tag" data-tone="mid">Vérifier</span> <span class="pt-small">${x.n}/${_ctx.nbStores} agences le vendent</span></span>`;
  }
  if (r._sqVerdict === 'La Trahison') {
    const b = [...(_ctx.horsBuyers.get(r.code) || [])].sort((p, q) => q.ca - p.ca)[0];
    const nom = b ? (_S.chalandiseData?.get(b.cc)?.nom || _S.clientNomLookup?.[b.cc] || b.cc) : '';
    return `<span title="${escapeHtml(VERDICT_TIP['La Trahison'])}"><span class="ar-tag" data-tone="mid">Prévenir</span> <span class="pt-small">${nom ? escapeHtml(nom) : 'un client'} l’achète hors comptoir</span></span>`;
  }
  return '';
}

function _groups(f) {
  const { reseau, nbStores, implByFam, survByFam, cliFull } = _ctx;
  const cli = (code) => cliFull.get(code)?.size || 0;
  const ag = (code) => { const x = reseau(code); return `${x.n}/${nbStores}`; };
  const prio = new Set(f.trousArts.map(a => a.code));
  const impl = [...(implByFam.get(f.k) || [])].sort((a, b) => (prio.has(b.code) - prio.has(a.code)) || (b.score || 0) - (a.score || 0));
  const socle = [...f.socleArts].sort((a, b) => ((a.stockActuel > 0) - (b.stockActuel > 0)) || (b.W || 0) - (a.W || 0));
  const surv = [...(survByFam.get(f.k) || [])].sort((a, b) => (b.W || 0) - (a.W || 0));
  const val = (r) => r.valeurStock != null ? r.valeurStock : (r.stockActuel || 0) * (r.prixUnitaire || 0);

  return [
    { key: 'sortir', verb: 'Sortir', arts: [...f.pmArts].sort((a, b) => val(b) - val(a)),
      why: 'En rayon sans aucune vente au comptoir en 12 mois. Retour centrale ou déstockage. « Vérifier » / « Prévenir » : un dernier contrôle avant de sortir.',
      euro: (arts) => `${formatEuro(arts.reduce((s, r) => s + val(r), 0))} immobilisés`,
      head: ['Stock', 'Valeur', 'Dernier mouv.', 'MIN/MAX ERP'],
      note: _avantSortir,
      row: (r) => [r.stockActuel, formatEuro(val(r)), _age(r.ageJours), _mm(r)] },
    { key: 'implanter', verb: 'Implanter', arts: impl,
      why: `Absents de ton rayon, demandés ailleurs. <span class="ar-tag" data-tone="high">Prioritaire</span> = ≥60 % du réseau à ≥${SQ_RESEAU_FORT_CA_AGENCE} €/an par agence, ou ≥5 clients de ta zone.`,
      euro: (arts) => `${arts.filter(a => prio.has(a.code)).length} prioritaire${arts.filter(a => prio.has(a.code)).length > 1 ? 's' : ''}`,
      head: ['Réseau', 'CA / agence', 'Clients zone', ''],
      row: (a) => {
        const x = reseau(a.code);
        return [`${x.n}/${nbStores}`, x.n ? formatEuro(x.ca / x.n) : '—', a.nbClientsZone || 0, prio.has(a.code) ? '<span class="ar-tag" data-tone="high">Prioritaire</span>' : ''];
      } },
    { key: 'garder', verb: 'Garder en rayon', arts: socle,
      why: 'Le socle : ≥3 clients et ≥3 ventes en 12 mois. Ceux en rupture remontent en tête.',
      euro: (arts) => { const k = arts.filter(r => r.stockActuel <= 0).length; return k ? `${k} en rupture` : 'tous en stock'; },
      head: ['Stock', 'Ventes', 'Clients', 'Réseau', 'Précision'],
      row: (r) => [r.stockActuel <= 0 ? '<span class="ar-tag" data-tone="low">Rupture</span>' : r.stockActuel, r.W || 0, cli(r.code), ag(r.code), _tag(r._sqVerdict, 'À garder')] },
    { key: 'surveiller', verb: 'Surveiller', arts: surv,
      why: 'Se vend, mais pas encore assez (moins de 3 clients ou 3 ventes) pour faire partie du socle.',
      euro: (arts) => `${arts.filter(r => r.stockActuel > 0).length} en stock`,
      head: ['Stock', 'Ventes', 'Clients', 'Réseau', 'Précision'],
      row: (r) => [r.stockActuel, r.W || 0, cli(r.code), ag(r.code), _tag(r._sqVerdict, 'À surveiller')] },
    { key: 'recalibrer', verb: 'Recalibrer le MIN/MAX', arts: [...f.calKOArts],
      why: 'MIN/MAX ERP éloigné de la reco PRISME (écart > 1 sur le MIN ou > 2 sur le MAX).',
      euro: () => 'ERP → reco',
      head: ['Stock', 'Ventes', 'ERP', 'Reco PRISME'],
      row: (r) => [r.stockActuel, r.W || 0, _mm(r), `<strong>${r.nouveauMin}/${r.nouveauMax}</strong>`] },
  ];
}

// ── Rendu ────────────────────────────────────────────────────
function _famList() {
  const q = _q.trim().toLowerCase();
  const match = (f) => !q || f.k.toLowerCase().includes(q) || f.lib.toLowerCase().includes(q);
  const big = _p.famList.filter(f => f.n >= PARTIE_FAM_MIN_REFS && match(f));
  const small = _p.famList.filter(f => f.n < PARTIE_FAM_MIN_REFS && match(f));
  const row = (f) => `<button type="button" class="pt-fam${f.k === _sel ? ' pt-sel' : ''}" onclick="_pfPick('${escapeHtml(f.k)}')">
      <span class="pt-grow pt-col" style="gap:2px;text-align:left"><span class="pt-ellipsis">${escapeHtml(f.lib)}</span><span class="pt-small pt-muted pt-num">${escapeHtml(f.k)} · ${f.n} réf.</span></span>
      <span style="width:64px">${_bar(f.score, 6)}</span>
      <span class="pt-num pt-strong" style="width:28px;text-align:right;color:${_col(f.score)}">${f.score}</span>
    </button>`;
  return `${big.map(row).join('')}
    ${small.length ? `<div class="pt-eyebrow" style="padding:14px 10px 6px">Petites familles · moins de ${PARTIE_FAM_MIN_REFS} réf.</div>${small.map(row).join('')}` : ''}
    ${!big.length && !small.length ? '<p class="pt-small pt-muted" style="padding:10px">Aucune famille ne correspond.</p>' : ''}`;
}

function _sfChips(f, arts) {
  const cat = _S.catalogueFamille;
  if (!cat) return '';
  const counts = new Map();
  for (const a of arts) {
    const c = cat.get(a.code);
    if (!c?.codeSousFam) continue;
    const e = counts.get(c.codeSousFam) || { lib: c.sousFam || c.codeSousFam, n: 0 };
    e.n++; counts.set(c.codeSousFam, e);
  }
  if (counts.size < 2) return '';
  const sorted = [...counts].sort((a, b) => b[1].n - a[1].n);
  const opt = (k, lib, n) => `<option value="${escapeHtml(k)}"${_sf === k ? ' selected' : ''}>${escapeHtml(lib)} (${n})</option>`;
  return `<label class="pt-row pt-small" style="gap:10px;flex-wrap:wrap"><span class="pt-muted">Sous-famille</span>
    <select class="pf-select" onchange="_pfSf(this.value)">${opt('', 'Toutes', arts.length)}${sorted.map(([k, e]) => opt(k, e.lib, e.n)).join('')}</select></label>`;
}

function _group(g) {
  const cat = _S.catalogueFamille;
  const arts = _sf ? g.arts.filter(a => cat?.get(a.code)?.codeSousFam === _sf) : g.arts;
  const n = arts.length;
  const open = _open.has(g.key) || (_hl && arts.some(a => a.code === _hl));
  const shown = _more.has(g.key) ? arts : arts.slice(0, ROW_LIMIT);
  const rows = shown.map(a => `<tr${a.code === _hl ? ' class="pt-next" id="pfHl"' : ''}>
      <td class="pf-lib" title="${escapeHtml(a.libelle || '')}"><span class="pt-strong">${escapeHtml(a.libelle || '')}</span><br><span class="pt-small pt-muted pt-num">${escapeHtml(a.code)}</span>${g.note ? ((x) => x ? `<div style="margin-top:4px">${x}</div>` : '')(g.note(a)) : ''}</td>
      ${g.row(a).map(v => `<td class="pt-num ar-r">${v}</td>`).join('')}</tr>`).join('');
  return `<details class="ar-sec pf-g" data-g="${g.key}" ${open ? 'open' : ''} ontoggle="_pfToggle('${g.key}', this.open)">
    <summary><span class="pt-row" style="gap:14px;align-items:baseline;flex-wrap:wrap">
        <span class="pt-num" style="font-size:24px;font-weight:600;min-width:44px">${_n(n)}</span>
        <span class="pt-col" style="gap:2px"><span class="pt-h3">${g.verb}</span><span class="pt-small pt-muted">${n ? g.euro(arts) : 'rien à faire'}</span></span>
      </span><span class="ar-chev" aria-hidden="true"></span></summary>
    ${n ? `<div class="ar-sec-body">
      <p class="pt-small pt-muted" style="margin:0">${g.why}</p>
      <div class="pt-list"><div class="pt-scroll"><table class="pt-table">
        <thead><tr><th>Article</th>${g.head.map(h => `<th class="ar-r">${h}</th>`).join('')}</tr></thead>
        <tbody>${rows}</tbody></table></div>
        <div class="pt-row pt-between pt-small pt-muted" style="padding:10px 12px;gap:12px;flex-wrap:wrap">
          <span>${n > shown.length ? `${shown.length} sur ${n} · <button type="button" class="pt-link" onclick="_pfMore('${g.key}')">tout afficher</button>` : `${n} article${n > 1 ? 's' : ''}`}</span>
          <button type="button" class="pt-link" onclick="_pfCsv('${g.key}')">Exporter en CSV</button>
        </div></div>
    </div>` : ''}
  </details>`;
}

function _detail() {
  const f = _p.famList.find(x => x.k === _sel);
  if (!f) return '<div class="pt-card pt-muted">Choisis une famille.</div>';
  const groups = _groups(f);
  const allCodes = groups.flatMap(g => g.arts);
  const deep = _bridge?.deepDive?.(f.k) || '';
  const crit = f.crit.map((c, i) => `<div class="pt-col" style="gap:6px">
      <div class="pt-row pt-between pt-small"><span>${CRIT_LABELS[i]} <span class="pt-muted">· ${Math.round(PARTIE_WEIGHTS[i] * 100)} %</span></span><span class="pt-num pt-strong">${c} %</span></div>
      ${_bar(c, 6)}</div>`).join('');
  return `<div class="pt-col" style="gap:16px">
    <div class="pt-card pt-col" style="gap:20px">
      <div class="pt-row pt-between" style="align-items:flex-start;gap:16px;flex-wrap:wrap">
        <div class="pt-col" style="gap:4px"><span class="pt-small pt-muted pt-num">${escapeHtml(f.k)} · ${f.n} articles en catalogue · ${f.stock} en stock</span>
          <h3 class="pt-h2">${escapeHtml(f.lib)}</h3>
          ${f.n < PARTIE_FAM_MIN_REFS ? `<span class="pt-small pt-muted">Petite famille : notée ici, mais hors classement de La partie</span>` : ''}</div>
        <div class="pt-col" style="align-items:flex-end;gap:6px">
          <div class="pt-num pt-big" style="color:${_col(f.score)}">${f.score}</div>
          <span class="pt-row" style="gap:12px">
            <button type="button" class="pt-link pt-small" id="pfAiBtn" onclick="_pfCopyAI()" title="Copie un prompt + les données de cette famille, à coller dans ChatGPT, Claude, Gemini…">Préparer pour une IA</button>
          </span>
        </div>
      </div>
      <div class="pf-crit">${crit}</div>
    </div>
    ${_sfChips(f, allCodes)}
    ${groups.map(_group).join('')}
    ${deep ? `<details class="ar-sec" id="pfDeep"><summary><span class="pt-col" style="gap:2px"><span class="pt-h3">Pour creuser</span>
        <span class="pt-small pt-muted">Métiers acheteurs, analyse de la gamme, comparaison réseau</span></span><span class="ar-chev" aria-hidden="true"></span></summary>
      <div class="ar-sec-body">${deep}</div></details>` : ''}
  </div>`;
}

function _render() {
  if (!_host) return;
  const listScroll = document.getElementById('pfList')?.scrollTop || 0;
  _host.innerHTML = `<div class="pt-wrap" style="padding-top:8px">
    <header class="pt-col" style="gap:6px">
      <span class="pt-eyebrow">Plan de rayon</span>
      <h2 class="pt-h2" style="font-size:28px">Ton rayon, famille par famille</h2>
      <span class="pt-small pt-muted">Même note que dans La partie · ventes MAGASIN 12 mois · ${_p.famList.length} familles</span>
    </header>
    <section class="pt-row" style="flex-wrap:wrap;gap:20px;align-items:flex-start">
      <div class="pt-card pt-famlist pt-col" style="flex:1 1 320px;max-width:380px;position:sticky;top:8px">
        <input id="pfSearch" type="search" class="pf-search" placeholder="Famille ou code article (6 chiffres)" value="${escapeHtml(_q)}"
          oninput="_pfSearch(this.value)" onkeydown="if(event.key==='Enter')_pfSearch(this.value,true)" autocomplete="off">
        <div id="pfList" class="pt-col" style="gap:2px;max-height:calc(100vh - 260px);overflow-y:auto">${_famList()}</div>
      </div>
      <div style="flex:999 1 560px;min-width:0">${_detail()}</div>
    </section>
  </div>`;
  const l = document.getElementById('pfList');
  if (l) l.scrollTop = listScroll;
}

function _renderListOnly() {
  const l = document.getElementById('pfList');
  if (l) l.innerHTML = _famList();
}

/** Point d'entrée — host : élément conteneur ; bridge : { deepDive(codeFam) → html }. */
export function renderPlanFamille(host, bridge) {
  _host = host; _bridge = bridge;
  _p = computePartie({ minRefs: 1 });
  if (!_p || !_p.famList.length) {
    host.innerHTML = '<div class="pt-wrap"><div class="pt-card pt-muted">Pas encore de squelette : charge un consommé multi-agences et l’état du stock.</div></div>';
    return;
  }
  _ctx = _buildCtx();
  if (!_p.famList.some(f => f.k === _sel)) {
    _sel = (_p.famList.find(f => f.n >= PARTIE_FAM_MIN_REFS) || _p.famList[0]).k; _sf = ''; _hl = '';
  }
  _render();
}

// ── Handlers ─────────────────────────────────────────────────
window._pfPick = (k) => {
  _sel = k; _sf = ''; _hl = ''; _more.clear();
  _render();
  document.querySelector('#tabPlan .pt-wrap')?.scrollIntoView({ block: 'start' });
};
window._pfSf = (k) => { _sf = k; _render(); };
window._pfMore = (k) => { _more.add(k); _render(); };
window._pfToggle = (k, open) => { if (open) _open.add(k); else _open.delete(k); };
window._pfSearch = (v, enter) => {
  _q = v;
  const code = v.trim();
  if (/^\d{6}$/.test(code)) {
    const fam = _ctx.famOfCode.get(code);
    if (fam && _p.famList.some(f => f.k === fam)) {
      _sel = fam; _sf = ''; _hl = code; _q = '';
      _render();
      document.getElementById('pfHl')?.scrollIntoView({ block: 'center' });
      return;
    }
  }
  if (enter) {
    const first = _p.famList.find(f => !_q || f.k.toLowerCase().includes(_q.toLowerCase()) || f.lib.toLowerCase().includes(_q.toLowerCase()));
    if (first) { window._pfPick(first.k); return; }
  }
  _renderListOnly();
};
window._pfCsv = (key) => {
  const f = _p?.famList.find(x => x.k === _sel);
  if (!f) return;
  const g = _groups(f).find(x => x.key === key);
  if (!g) return;
  const strip = (v) => String(v ?? '').replace(/<[^>]+>/g, '').trim();
  const q = (v) => `"${strip(v).replace(/"/g, '""')}"`;
  const arts = _sf ? g.arts.filter(a => _S.catalogueFamille?.get(a.code)?.codeSousFam === _sf) : g.arts;
  const lines = [['Code', 'Libellé', ...g.head].map(q).join(';'), ...arts.map(a => [a.code, a.libelle || '', ...g.row(a)].map(q).join(';'))];
  const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const el = document.createElement('a');
  el.href = url;
  el.download = `PRISME_${_S.selectedMyStore}_${f.k}_${g.verb.replace(/[^\p{L}\p{N}]+/gu, '-')}.csv`;
  el.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

// ── Préparer pour une IA ─────────────────────────────────────
// Un prompt court + les données exactes de l'écran (note, 4 critères, 5 gestes), à coller
// dans n'importe quelle IA. Aucune donnée Qlik : la demande « ailleurs » vient du consommé.
const AI_PROMPT = `Tu es chef de rayon dans une agence de distribution B2B (quincaillerie et fournitures pour artisans et entreprises du bâtiment). Tu prépares ce que l'équipe fait en rayon dès lundi.

RÈGLES
- Utilise uniquement les données ci-dessous. Si une information manque, écris « à vérifier » (conditionnement, quantité, emplacement…). N'invente aucun chiffre, aucune prévision.
- Cite chaque article par son code et son libellé, avec le lien https://www.legallais.com/article/CODE
- Chaque action dit : quoi faire physiquement ou commercialement, sur quels articles, et la raison chiffrée tirée des données.
- Les gestes viennent de l'outil PRISME : « Sortir » = en rayon sans vente depuis 12 mois ; « Implanter » = absent du rayon mais demandé ailleurs (prioritaire = vendu par ≥60 % des agences à ≥200 €/an chacune, ou ≥5 clients de la zone) ; « Garder » = socle (≥3 clients et ≥3 ventes) ; « Surveiller » = se vend mais pas assez pour le socle ; « Recalibrer » = MIN/MAX de l'ERP éloigné de la reco PRISME.
- Tu peux contester un geste si les données le justifient (ex. un invendu récent, une référence de dépannage indispensable) : dis-le en une ligne.

FORMAT DE RÉPONSE
1. Diagnostic — 3 lignes maximum : ce qui va, ce qui coince, le levier principal.
2. Plan d'action — 10 actions maximum, réparties en « Cette semaine » / « Ce mois-ci » / « À surveiller ». Pour chaque action : le geste, les articles (code + libellé + lien), la raison chiffrée.
3. À vérifier en rayon — 3 à 5 questions concrètes que seules l'équipe peut trancher.

Style : direct, phrases courtes, pas de tableau si une liste suffit.

DONNÉES
`;

function _aiPack(f) {
  const cat = _S.catalogueFamille;
  const inSf = (code) => !_sf || cat?.get(code)?.codeSousFam === _sf;
  const sfLib = _sf ? (cat ? [...cat.values()].find(c => c.codeSousFam === _sf)?.sousFam : '') || _sf : '';
  const { reseau, nbStores, cliFull } = _ctx;
  const last = getArticleLastSaleMonthIdx();
  const _d = _S.consommePeriodMaxFull || _S.consommePeriodMax;
  const ref = _d ? monthIdxFromDate(new Date(_d)) : null;
  const lastSale = (code) => { const m = last?.get(code); return m == null || ref == null ? 'jamais' : ref - m === 0 ? 'ce mois' : `il y a ${ref - m} mois`; };
  const val = (r) => r.valeurStock != null ? r.valeurStock : (r.stockActuel || 0) * (r.prixUnitaire || 0);
  const eur = (v) => formatEuro(Math.round(v || 0));
  const res = (code) => { const x = reseau(code); return `réseau ${x.n}/${nbStores}${x.n ? ` · ${eur(x.ca / x.n)}/agence` : ''}`; };
  const L = [];
  const famCodes = new Set();
  for (const r of _S.finalData || []) if (r.famille === f.k) famCodes.add(r.code);

  // ── Contexte ──
  L.push(`Agence : ${_S.selectedMyStore || '?'} · Famille : ${f.lib} (${f.k})${sfLib ? ` · Sous-famille : ${sfLib}` : ''}`);
  L.push(`Période : ventes au comptoir (MAGASIN) sur l'historique chargé${_d ? `, jusqu'au ${new Date(_d).toLocaleDateString('fr-FR')}` : ''}`);
  L.push('');
  L.push(`NOTE DE LA FAMILLE : ${f.score}/100 (même note que l'écran La partie)`);
  f.crit.forEach((c, i) => L.push(`- ${CRIT_LABELS[i]} (${Math.round(PARTIE_WEIGHTS[i] * 100)} % de la note) : ${c} %`));
  let ca = 0, stockVal = 0, inv = 0;
  for (const r of _S.finalData || []) {
    if (r.famille !== f.k || !inSf(r.code)) continue;
    ca += r.caAnnuel || 0; if (r.stockActuel > 0) stockVal += val(r);
  }
  for (const r of f.pmArts) if (inSf(r.code)) inv += val(r);
  L.push(`- ${f.n} articles en catalogue, ${f.stock} en stock · valeur du stock ${eur(stockVal)} · CA comptoir ${eur(ca)} · invendus ${eur(inv)}`);

  // ── Benchmark réseau (famille entière) ──
  const vpm = _S.ventesParAgence || {};
  const my = _S.selectedMyStore;
  const caStore = (s) => { let t = 0; const a = vpm[s] || {}; for (const c of famCodes) t += a[c]?.sumCA || 0; return t; };
  const others = Object.keys(vpm).filter(s => s !== my).map(caStore).sort((a, b) => a - b);
  if (others.length) {
    const med = others[others.length >> 1], mine = caStore(my);
    L.push(`- CA famille tous canaux : ${eur(mine)} chez toi vs ${eur(med)} médiane des ${others.length} autres agences (${med ? `${mine >= med ? '+' : ''}${Math.round((mine - med) / med * 100)} %` : 'n/a'})`);
  }

  // ── Métiers acheteurs (comptoir) ──
  const chal = _S.chalandiseData;
  if (chal?.size) {
    const byMet = new Map();
    for (const [cc, arts] of _S.ventesLocalMag12MG || []) {
      let t = 0; for (const [code, d] of arts) if (famCodes.has(code) && inSf(code)) t += d.sumCA || 0;
      if (t <= 0) continue;
      const m = chal.get(cc)?.metier || 'Hors zone / non renseigné';
      const e = byMet.get(m) || { ca: 0, n: 0 }; e.ca += t; e.n++; byMet.set(m, e);
    }
    const top = [...byMet].sort((a, b) => b[1].ca - a[1].ca).slice(0, 6);
    if (top.length) { L.push(''); L.push('MÉTIERS QUI ACHÈTENT CETTE FAMILLE CHEZ TOI'); top.forEach(([m, e]) => L.push(`- ${m} : ${e.n} clients, ${eur(e.ca)}`)); }
  }

  // ── Les 5 gestes (mêmes listes que l'écran, plafonnées) ──
  const groups = _groups(f);
  const CAP = { sortir: 25, implanter: 15, garder: 15, surveiller: 10, recalibrer: 15 };
  const line = {
    sortir: (r) => `${r.code} | ${r.libelle} | stock ${r.stockActuel} (${eur(val(r))}) | dernière vente : ${lastSale(r.code)} | MIN/MAX ERP ${r.ancienMin || 0}/${r.ancienMax || 0} | ${res(r.code)}${r.emplacement ? ` | empl. ${r.emplacement}` : ''}${verdictLabel(r._sqVerdict) && verdictLabel(r._sqVerdict) !== 'À sortir' ? ` | ${verdictLabel(r._sqVerdict)}` : ''}`,
    implanter: (a) => `${a.code} | ${a.libelle || ''} | ${res(a.code)} | ${a.nbClientsZone || 0} clients de la zone${f.trousArts.some(t => t.code === a.code) ? ' | PRIORITAIRE' : ''}`,
    garder: (r) => `${r.code} | ${r.libelle} | stock ${r.stockActuel}${r.stockActuel <= 0 ? ' (RUPTURE)' : ''} | ${r.W || 0} ventes · ${cliFull.get(r.code)?.size || 0} clients | MIN/MAX ERP ${r.ancienMin || 0}/${r.ancienMax || 0}${r.emplacement ? ` | empl. ${r.emplacement}` : ''}`,
    surveiller: (r) => `${r.code} | ${r.libelle} | stock ${r.stockActuel} | ${r.W || 0} ventes · ${cliFull.get(r.code)?.size || 0} clients | dernière vente : ${lastSale(r.code)}${verdictLabel(r._sqVerdict) !== 'À surveiller' ? ` | ${verdictLabel(r._sqVerdict)}` : ''}`,
    recalibrer: (r) => `${r.code} | ${r.libelle} | stock ${r.stockActuel} | ${r.W || 0} ventes | MIN/MAX ERP ${r.ancienMin || 0}/${r.ancienMax || 0} → reco PRISME ${r.nouveauMin}/${r.nouveauMax}`,
  };
  for (const g of groups) {
    const arts = g.arts.filter(a => inSf(a.code));
    // « Garder » : on n'envoie que ce qui demande une action (ruptures) puis les plus vendus
    const list = g.key === 'garder' ? [...arts.filter(r => r.stockActuel <= 0), ...arts.filter(r => r.stockActuel > 0)] : arts;
    L.push('');
    L.push(`${g.verb.toUpperCase()} — ${arts.length} article${arts.length > 1 ? 's' : ''}${arts.length > CAP[g.key] ? ` (les ${CAP[g.key]} plus importants ci-dessous)` : ''}`);
    if (!arts.length) { L.push('- rien'); continue; }
    list.slice(0, CAP[g.key]).forEach(a => L.push(`- ${line[g.key](a)}`));
  }

  // ── Ce que les clients de la zone achètent ailleurs (consommé multi-agences) ──
  const net = _S.ventesReseauTousCanaux;
  if (chal?.size && net?.size) {
    const inStock = new Set((_S.finalData || []).filter(r => r.stockActuel > 0).map(r => r.code));
    const agg = new Map();
    for (const [cc] of chal) {
      const arts = net.get(cc); if (!arts) continue;
      const mag = _S.ventesLocalMag12MG?.get(cc), hors = getVentesHorsMagFullMap().get(cc);
      for (const [code, d] of arts) {
        if ((_S.articleFamille?.[code] || '') !== f.k || !inSf(code) || inStock.has(code)) continue;
        if (mag?.has(code) || hors?.has(code)) continue;
        const e = agg.get(code) || { ca: 0, n: 0 }; e.ca += d.sumCA || 0; e.n++; agg.set(code, e);
      }
    }
    const top = [...agg].filter(([, e]) => e.n >= 2).sort((a, b) => b[1].n - a[1].n || b[1].ca - a[1].ca).slice(0, 12);
    if (top.length) {
      L.push('');
      L.push(`ACHETÉ AILLEURS PAR LES CLIENTS DE TA ZONE — absent de ton stock (consommé des ${nbStores + 1} agences, tous canaux)`);
      top.forEach(([code, e]) => L.push(`- ${code} | ${_S.libelleLookup?.[code] || ''} | ${e.n} clients de ta zone · ${eur(e.ca)} dans les autres agences`));
    }
  }
  return AI_PROMPT + L.join('\n') + '\n';
}

window._pfCopyAI = () => {
  const f = _p?.famList.find(x => x.k === _sel);
  if (!f) return;
  const txt = _aiPack(f);
  const btn = document.getElementById('pfAiBtn');
  const done = (msg) => { if (!btn) return; const o = btn.textContent; btn.textContent = msg; setTimeout(() => { btn.textContent = o; }, 2200); };
  const download = () => {
    const url = URL.createObjectURL(new Blob([txt], { type: 'text/plain;charset=utf-8' }));
    const a = document.createElement('a'); a.href = url; a.download = `PRISME_${_S.selectedMyStore}_${f.k}_pour-IA.txt`; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000); done('Fichier téléchargé');
  };
  if (navigator.clipboard?.writeText) navigator.clipboard.writeText(txt).then(() => done('Copié ✓ — colle-le dans ton IA'), download);
  else download();
};
window._pfAIText = () => { const f = _p?.famList.find(x => x.k === _sel); return f ? _aiPack(f) : ''; };

/** Ouvre une famille depuis un autre écran (ex. La partie). */
window._pfOpen = (k) => { _sel = k; _sf = ''; _hl = ''; _more.clear(); window.switchTab?.('plan'); window._prSetTopView?.('famille'); };
