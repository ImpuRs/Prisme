// ═══════════════════════════════════════════════════════════════
// PRISME — plan-famille.js
// Pilotage Stock › Plan › « Par famille » : la page famille de La partie, en grand.
//   • à gauche  : les familles, notées avec LE MÊME score que La partie (computePartie)
//   • à droite  : la famille choisie — 4 critères, puis ses articles rangés en 5 gestes
//                 (garder, implanter, sortir, surveiller, recalibrer), chacun avec son « pourquoi »
//   • pour creuser : Métiers / Analyse / Réseau (rendus historiques de planRayon.js, via bridge)
// Les verdicts (Capitaine, Réf Schizo…) restent lisibles en infobulle, plus en vocabulaire principal.
// Assortiment → 12MG pleine période (finalData, articleClientsFull, squelette).
// Dépend de : state.js, utils.js, constants.js, engine.js, partie.js
// ═══════════════════════════════════════════════════════════════
'use strict';

import { _S } from './state.js';
import { escapeHtml, formatEuro } from './utils.js';
import { PARTIE_WEIGHTS, PARTIE_FAM_MIN_REFS, SQ_RESEAU_FORT_CA_AGENCE } from './constants.js';
import { computeSquelette } from './engine.js';
import { computePartie, CRIT_LABELS } from './partie.js';

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
  return { nbStores, reseau, implByFam, survByFam, famOfCode, cliFull: _S.articleClientsFull || new Map() };
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
  'La Réf Schizo': 'Le réseau le vend vraiment, toi jamais : enquête commerciale (prix, concurrence…).',
  "L'Erreur de Casting": 'Nouveauté qui n’a pas pris : on sort.',
  'La Trahison': 'Produit de clients stratégiques devenu dormant : appeler le client, puis sortir.',
  'Le Poids Mort': 'Ne se vend plus : on sort, on libère le cash et la place.',
  'Ancre Métier': 'Invendu gardé exprès à 1 exemplaire : dernier lien avec un métier clé.',
};
const _tag = (v) => v ? `<span class="ar-tag" title="${escapeHtml(VERDICT_TIP[v] || '')}">${escapeHtml(v)}</span>` : '';
const _mm = (r) => `${r.ancienMin || 0}/${r.ancienMax || 0}`;
const _age = (j) => j == null || j >= 999 ? '—' : j >= 365 ? `${(j / 365).toFixed(1).replace('.', ',')} an${j >= 730 ? 's' : ''}` : `${j} j`;

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
      why: 'En rayon sans aucune vente en 12 mois. Retour centrale ou déstockage.',
      euro: (arts) => `${formatEuro(arts.reduce((s, r) => s + val(r), 0))} immobilisés`,
      head: ['Stock', 'Valeur', 'Dernier mouv.', 'MIN/MAX ERP', 'Verdict'],
      row: (r) => [r.stockActuel, formatEuro(val(r)), _age(r.ageJours), _mm(r), _tag(r._sqVerdict)] },
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
      head: ['Stock', 'Ventes', 'Clients', 'Réseau', 'Verdict'],
      row: (r) => [r.stockActuel <= 0 ? '<span class="ar-tag" data-tone="low">Rupture</span>' : r.stockActuel, r.W || 0, cli(r.code), ag(r.code), _tag(r._sqVerdict)] },
    { key: 'surveiller', verb: 'Surveiller', arts: surv,
      why: 'Se vend, mais pas encore assez (moins de 3 clients ou 3 ventes) pour faire partie du socle.',
      euro: (arts) => `${arts.filter(r => r.stockActuel > 0).length} en stock`,
      head: ['Stock', 'Ventes', 'Clients', 'Réseau', 'Verdict'],
      row: (r) => [r.stockActuel, r.W || 0, cli(r.code), ag(r.code), _tag(r._sqVerdict)] },
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
      <td class="pt-num pt-muted">${escapeHtml(a.code)}</td><td class="pf-lib" title="${escapeHtml(a.libelle || '')}">${escapeHtml(a.libelle || '')}</td>
      ${g.row(a).map(v => `<td class="pt-num ar-r">${v}</td>`).join('')}</tr>`).join('');
  return `<details class="ar-sec pf-g" data-g="${g.key}" ${open ? 'open' : ''} ontoggle="_pfToggle('${g.key}', this.open)">
    <summary><span class="pt-row" style="gap:14px;align-items:baseline;flex-wrap:wrap">
        <span class="pt-num" style="font-size:24px;font-weight:600;min-width:44px">${_n(n)}</span>
        <span class="pt-col" style="gap:2px"><span class="pt-h3">${g.verb}</span><span class="pt-small pt-muted">${n ? g.euro(arts) : 'rien à faire'}</span></span>
      </span><span class="ar-chev" aria-hidden="true"></span></summary>
    ${n ? `<div class="ar-sec-body">
      <p class="pt-small pt-muted" style="margin:0">${g.why}</p>
      <div class="pt-list"><div class="pt-scroll"><table class="pt-table">
        <thead><tr><th>Code</th><th>Libellé</th>${g.head.map(h => `<th class="ar-r">${h}</th>`).join('')}</tr></thead>
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
            ${_bridge?.hasDiag ? `<button type="button" class="pt-link pt-small" onclick="window._prExportDiag('${escapeHtml(f.k)}')">Diagnostic</button>
            <button type="button" class="pt-link pt-small" onclick="window._prCopyForLLM('${escapeHtml(f.k)}')">Copier pour une IA</button>` : ''}
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

/** Point d'entrée — host : élément conteneur ; bridge : { deepDive(codeFam) → html, hasDiag }. */
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

/** Ouvre une famille depuis un autre écran (ex. La partie). */
window._pfOpen = (k) => { _sel = k; _sf = ''; _hl = ''; _more.clear(); window.switchTab?.('plan'); window._prSetTopView?.('famille'); };
