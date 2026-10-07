// ═══════════════════════════════════════════════════════════════
// PRISME — partie.js
// « La partie » : accueil gamifié — score agence à faire monter.
// Score agence = moyenne des parties disponibles (Assortiment, Stock ; Clients à venir).
// Assortiment = moyenne pondérée (nb refs) des scores famille, chaque score famille
// combinant 4 critères squelette (cf. PARTIE_WEIGHTS) :
//   0. Socle tenu en rayon   — socle en stock / socle
//   1. Trous comblés         — socle / (socle + trous prioritaires à implanter)
//   2. Rayon propre          — 1 − poids morts en stock / refs en stock
//   3. MIN/MAX calibrés      — ERP proche de la reco PRISME / refs en stock avec reco
// Stock = taux de service (définition cockpit) × 60% + part hors sur-stock (SASO) × 40%.
// Merchandising → 12MG pleine période : s'appuie sur finalData + computeSquelette(),
// insensibles au filtre période (cf. Doctrine temporelle).
// Dépend de : state.js, engine.js, utils.js, constants.js, cache.js
// ═══════════════════════════════════════════════════════════════
'use strict';

import { _S } from './state.js';
import { computeSquelette } from './engine.js';
import { famLib, escapeHtml, formatLocalYMD } from './utils.js';
import {
  PARTIE_WEIGHTS, PARTIE_OBJECTIF, PARTIE_FAM_MIN_REFS, PARTIE_TROU_DETENTION,
  PARTIE_TROU_CLIENTS, PARTIE_TROUS_PAR_ACTION, PARTIE_CAL_TOL_MIN, PARTIE_CAL_TOL_MAX,
  PARTIE_STOCK_W_SERVICE, PARTIE_NB_ACTIONS,
} from './constants.js';
import { _savePartieSnapshot, _loadPartieDone, _savePartieDone } from './cache.js';

const CRIT_LABELS = ['Socle tenu en rayon', 'Trous comblés', 'Rayon propre', 'MIN/MAX calibrés'];
const LIST_LIMIT = 100;

// ── Calcul ───────────────────────────────────────────────────

function _calOk(r) {
  return Math.abs((r.ancienMin || 0) - (r.nouveauMin || 0)) <= PARTIE_CAL_TOL_MIN
    && Math.abs((r.ancienMax || 0) - (r.nouveauMax || 0)) <= PARTIE_CAL_TOL_MAX;
}

/** Score famille depuis les compteurs { socle, socleKO, trous, stock, pm, reco, calKO }. */
function _famScore(c) {
  const s = [
    c.socle ? 1 - c.socleKO / c.socle : 1,
    (c.socle + c.trous) ? c.socle / (c.socle + c.trous) : 1,
    c.stock ? 1 - c.pm / c.stock : 1,
    c.reco ? 1 - c.calKO / c.reco : 1,
  ];
  return {
    crit: s.map(v => Math.round(v * 100)),
    score: Math.round(100 * s.reduce((t, v, i) => t + v * PARTIE_WEIGHTS[i], 0)),
  };
}

function _stockScore(c) {
  const service = c.serviceTotal ? c.serviceOk / c.serviceTotal : 1;
  const propre = c.stockRefs ? 1 - c.saso / c.stockRefs : 1;
  return Math.round(100 * (PARTIE_STOCK_W_SERVICE * service + (1 - PARTIE_STOCK_W_SERVICE) * propre));
}

function _dataKey() {
  const d = _S.consommePeriodMaxFull || _S.consommePeriodMax || new Date();
  return formatLocalYMD(d);
}

export function computePartie() {
  const fd = _S.finalData || [];
  if (!fd.length) return null;

  // ── Assortiment : compteurs par famille ──
  const fams = new Map();
  const famOf = (k) => {
    let f = fams.get(k);
    if (!f) { f = { k, lib: famLib(k) || k, n: 0, socleArts: [], socleKOArts: [], trousArts: [], stock: 0, pmArts: [], reco: 0, calKOArts: [] }; fams.set(k, f); }
    return f;
  };
  // ── Stock : mêmes définitions que le cockpit (renderDashboardAndCockpit) ──
  const st = { serviceTotal: 0, serviceOk: 0, stockRefs: 0, saso: 0, rupArts: [], rupInService: 0, sasoArts: [] };
  let hasSquelette = false;

  for (const r of fd) {
    if (r.isParent) continue;
    const colisOnly = r.V === 0 && r.enleveTotal > 0;
    const inService = (r.fmrClass === 'F' || r.fmrClass === 'M') && r.W >= 1 && !colisOnly;
    if (inService) { st.serviceTotal++; if (r.stockActuel > 0) st.serviceOk++; }
    if (r.W >= 3 && r.stockActuel <= 0 && !colisOnly) { st.rupArts.push(r); if (inService) st.rupInService++; }
    if (r.stockActuel > 0) st.stockRefs++;
    if (r.ancienMax > 0 && r.stockActuel > r.ancienMax) { st.saso++; st.sasoArts.push(r); }

    if (!r.famille) continue;
    if (r._sqClassif) hasSquelette = true;
    const f = famOf(r.famille);
    f.n++;
    if (r._sqClassif === 'socle') { f.socleArts.push(r); if (r.stockActuel <= 0) f.socleKOArts.push(r); }
    if (r.stockActuel > 0) {
      f.stock++;
      if (r._sqVerdict === 'Le Poids Mort') f.pmArts.push(r);
      if (r.nouveauMax > 0) { f.reco++; if (!_calOk(r)) f.calKOArts.push(r); }
    }
  }

  // ── Trous prioritaires : articles « à implanter » à signal fort ──
  let nbStores = 1;
  if (hasSquelette) {
    let sq = null;
    try { sq = computeSquelette(); } catch (e) { console.warn('[PRISME] partie : squelette indisponible', e); }
    nbStores = Math.max(1, Object.keys(_S.ventesParAgence || {}).filter(s => s !== _S.selectedMyStore).length);
    if (sq?._allArticles) {
      for (const [, a] of sq._allArticles) {
        if (a.classification !== 'implanter' || !a.famille) continue;
        const f = fams.get(a.famille);
        if (!f) continue;
        if (a.nbAgencesReseau / nbStores >= PARTIE_TROU_DETENTION || a.nbClientsZone >= PARTIE_TROU_CLIENTS) f.trousArts.push(a);
      }
    }
  }

  const counts = (f) => ({
    socle: f.socleArts.length, socleKO: f.socleKOArts.length, trous: f.trousArts.length,
    stock: f.stock, pm: f.pmArts.length, reco: f.reco, calKO: f.calKOArts.length,
  });

  const famList = [];
  if (hasSquelette) {
    for (const f of fams.values()) {
      if (f.n < PARTIE_FAM_MIN_REFS) continue;
      f.trousArts.sort((a, b) => (b.score || 0) - (a.score || 0));
      f.calKOArts.sort((a, b) => (b.W || 0) - (a.W || 0));
      f.pmArts.sort((a, b) => (b.stockActuel || 0) - (a.stockActuel || 0));
      Object.assign(f, _famScore(counts(f)));
      famList.push(f);
    }
    famList.sort((a, b) => a.score - b.score || b.n - a.n);
  }

  let num = 0, den = 0;
  for (const f of famList) { num += f.score * f.n; den += f.n; }
  const assort = den ? Math.round(num / den) : null;
  const stock = _stockScore(st);

  // ── Actions : gain = points famille (ou Stock) si l'action est menée au bout ──
  const actions = [];
  for (const f of famList) {
    const c = counts(f);
    const add = (crit, title, delta) => {
      const gain = _famScore({ ...c, ...delta }).score - f.score;
      if (gain >= 1) actions.push({ id: `${f.k}:${crit}`, fam: f.k, crit, gain, title, where: `${f.lib} · ${CRIT_LABELS[crit]}` });
    };
    if (c.socleKO) add(0, `Remettre en stock ${c.socleKO} incontournable${c.socleKO > 1 ? 's' : ''} en rupture`, { socleKO: 0 });
    if (c.trous) {
      const k = Math.min(PARTIE_TROUS_PAR_ACTION, c.trous);
      add(1, `Implanter ${k} article${k > 1 ? 's' : ''} prioritaire${k > 1 ? 's' : ''}`, { socle: c.socle + k, trous: c.trous - k });
    }
    if (c.pm) add(2, `Sortir ${c.pm} poids mort${c.pm > 1 ? 's' : ''} (retour centrale)`, { pm: 0, stock: c.stock - c.pm });
    if (c.calKO) add(3, `Aligner ${c.calKO} MIN/MAX sur la reco PRISME`, { calKO: 0 });
  }
  if (st.rupArts.length) {
    const gain = _stockScore({ ...st, serviceOk: st.serviceOk + st.rupInService }) - stock;
    if (gain >= 1) actions.push({ id: 'stock:ruptures', fam: null, cockpit: 'ruptures', gain, title: `Commander ${st.rupArts.length} articles fréquents en rupture`, where: 'Stock · Taux de service' });
  }
  if (st.saso) {
    const gain = _stockScore({ ...st, saso: 0 }) - stock;
    if (gain >= 1) actions.push({ id: 'stock:saso', fam: null, cockpit: 'saso', gain, title: `Ramener ${st.saso} articles en sur-stock sous leur MAX`, where: 'Stock · Sur-stock' });
  }
  actions.sort((a, b) => b.gain - a.gain);

  const parts = [assort, stock].filter(v => v != null);
  const global = Math.round(parts.reduce((t, v) => t + v, 0) / parts.length);

  return {
    dataKey: _dataKey(), global, assort, stock, famList, nbStores, hasSquelette,
    actions: actions.slice(0, PARTIE_NB_ACTIONS), nbActionsTotal: actions.length,
    stockDetail: { service: st.serviceTotal ? Math.round(100 * st.serviceOk / st.serviceTotal) : 100, saso: st.saso, stockRefs: st.stockRefs, ruptures: st.rupArts.length },
    nbArticles: fd.length,
  };
}

// ── Rendu ────────────────────────────────────────────────────

const _col = (s) => s == null ? 'var(--t-disabled)' : s < 70 ? 'var(--pt-low)' : s < 80 ? 'var(--pt-mid)' : 'var(--pt-high)';
const _fmtDate = (ymd) => { const [y, m, d] = ymd.split('-').map(Number); return new Date(y, m - 1, d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }); };

function _verdict(g) {
  if (g >= PARTIE_OBJECTIF) return 'Objectif atteint';
  if (g >= PARTIE_OBJECTIF - 5) return 'Belle agence, presque au sommet';
  if (g >= 70) return 'Solide, de la marge à prendre';
  return 'Des points faciles à aller chercher';
}

function _bar(v, h = 6) {
  return `<span class="pt-track" style="height:${h}px"><span class="pt-fill" style="width:${v ?? 0}%;background:${_col(v)}"></span></span>`;
}

function _ring(g) {
  const C = 2 * Math.PI * 52;
  return `<svg width="168" height="168" viewBox="0 0 120 120" aria-hidden="true">
    <circle cx="60" cy="60" r="52" fill="none" stroke="var(--pt-line)" stroke-width="9"></circle>
    <circle cx="60" cy="60" r="52" fill="none" stroke="${_col(g)}" stroke-width="9" stroke-linecap="round"
      stroke-dasharray="${(g / 100 * C).toFixed(1)} 400" transform="rotate(-90 60 60)"></circle>
  </svg>`;
}

function _curve(hist) {
  if (hist.length < 2) {
    return `<div class="pt-curve-empty"><span class="pt-dot"></span></div>
      <p class="pt-muted pt-small">Ta courbe démarre avec ces données. Chaque nouveau chargement ajoute un point.</p>`;
  }
  const W = 300, H = 90, vals = hist.map(h => h.global);
  const lo = Math.min(...vals, PARTIE_OBJECTIF) - 3, hi = Math.max(...vals, PARTIE_OBJECTIF) + 3;
  const x = (i) => (i / (hist.length - 1)) * W, y = (v) => H - ((v - lo) / (hi - lo)) * H;
  const pts = vals.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const delta = vals[vals.length - 1] - vals[0];
  return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" class="pt-curve" role="img" aria-label="Évolution du score : ${vals.join(', ')}">
      <line x1="0" x2="${W}" y1="${y(PARTIE_OBJECTIF).toFixed(1)}" y2="${y(PARTIE_OBJECTIF).toFixed(1)}" stroke="var(--pt-line)" stroke-dasharray="4 4"></line>
      <polyline points="${pts}" fill="none" stroke="${_col(vals[vals.length - 1])}" stroke-width="2.5" vector-effect="non-scaling-stroke" stroke-linejoin="round"></polyline>
    </svg>
    <div class="pt-row pt-between pt-small pt-muted"><span>${escapeHtml(_fmtDate(hist[0].date))}</span><span>${escapeHtml(_fmtDate(hist[hist.length - 1].date))}</span></div>
    <p class="pt-small pt-muted">${delta >= 0 ? '+' : ''}${delta} pts depuis le premier point · ${hist.length} chargements</p>`;
}

function _domainRow(label, sub, v, dashed) {
  return `<div class="pt-domain${dashed ? ' pt-dashed' : ''}">
    <div class="pt-grow"><div class="pt-strong">${label}</div><div class="pt-small pt-muted">${sub}</div></div>
    ${v != null ? `<span style="width:96px">${_bar(v)}</span>` : ''}
    <div class="pt-num pt-domain-val" style="color:${v != null ? 'var(--t-primary)' : 'var(--t-disabled)'}">${v ?? '—'}</div>
  </div>`;
}

function _actionRow(a, done) {
  const d = !!done[a.id];
  return `<div class="pt-action${d ? ' pt-done' : ''}">
    <span class="pt-gain">+${a.gain}</span>
    <button type="button" class="pt-action-main" onclick="_partieOpenAction('${a.id}')">
      <span class="pt-action-title">${escapeHtml(a.title)}</span>
      <span class="pt-small pt-muted">${escapeHtml(a.where)} · ${a.fam ? 'voir les articles' : 'ouvrir dans Articles'}</span>
    </button>
    <button type="button" class="pt-btn${d ? ' pt-btn-done' : ''}" onclick="_partieToggleDone('${a.id}')" aria-pressed="${d}">${d ? 'Fait ✓' : 'C’est fait'}</button>
  </div>`;
}

function _critArticles(f, i) {
  const ag = (a) => `${a.nbAgencesReseau}/${_S._partie?.nbStores || 1} agences`;
  const mm = (r) => `${r.ancienMin || 0}/${r.ancienMax || 0}`;
  const cols = [
    { arts: f.socleKOArts, head: ['Stock', 'MIN/MAX ERP', 'Empl.'], row: r => [r.stockActuel, mm(r), r.emplacement || '—'] },
    { arts: f.trousArts, head: ['Réseau', 'Clients zone', 'Score'], row: a => [ag(a), a.nbClientsZone || 0, a.score || 0] },
    { arts: f.pmArts, head: ['Stock', 'MIN/MAX ERP', 'Empl.'], row: r => [r.stockActuel, mm(r), r.emplacement || '—'] },
    { arts: f.calKOArts, head: ['Stock', 'ERP → reco', 'Empl.'], row: r => [r.stockActuel, `${mm(r)} → ${r.nouveauMin}/${r.nouveauMax}`, r.emplacement || '—'] },
  ][i];
  return cols;
}

function _critBlock(f, i, open) {
  const c = f.crit[i];
  const n = [f.socleKOArts.length, f.trousArts.length, f.pmArts.length, f.calKOArts.length][i];
  const detail = [
    n ? `${n} incontournable${n > 1 ? 's' : ''} en rupture` : 'Tous les incontournables sont en stock',
    n ? `${n} article${n > 1 ? 's' : ''} prioritaire${n > 1 ? 's' : ''} à implanter (≥${Math.round(PARTIE_TROU_DETENTION * 100)} % du réseau ou ≥${PARTIE_TROU_CLIENTS} clients de ta zone)` : 'Aucun trou prioritaire',
    n ? `${n} poids mort${n > 1 ? 's' : ''} encore en rayon` : 'Aucun poids mort en rayon',
    n ? `${n} MIN/MAX éloigné${n > 1 ? 's' : ''} de la reco PRISME` : 'MIN/MAX alignés',
  ][i];
  let list = '';
  if (open && n) {
    const spec = _critArticles(f, i);
    const rows = spec.arts.slice(0, LIST_LIMIT).map(a => {
      const cells = spec.row(a);
      return `<tr><td class="pt-num pt-muted">${escapeHtml(a.code)}</td><td>${escapeHtml(a.libelle || '')}</td>${cells.map(v => `<td class="pt-num">${escapeHtml(String(v))}</td>`).join('')}</tr>`;
    }).join('');
    list = `<div class="pt-list">
      <div class="pt-scroll"><table class="pt-table"><thead><tr><th>Code</th><th>Libellé</th>${spec.head.map(h => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table></div>
      <div class="pt-row pt-between pt-small pt-muted" style="padding:10px 12px">
        <span>${n > LIST_LIMIT ? `${LIST_LIMIT} premiers sur ${n}` : `${n} article${n > 1 ? 's' : ''}`}</span>
        <button type="button" class="pt-link" onclick="_partieExportCrit(${i})">Exporter en CSV</button>
      </div>
    </div>`;
  }
  return `<div class="pt-crit">
    <button type="button" class="pt-crit-head" onclick="_partieToggleCrit(${i})" aria-expanded="${open}" ${n ? '' : 'disabled'}>
      <span class="pt-row pt-between" style="gap:12px">
        <span>${CRIT_LABELS[i]} <span class="pt-small pt-muted">· compte pour ${Math.round(PARTIE_WEIGHTS[i] * 100)} %</span></span>
        <span class="pt-num pt-strong">${c} %</span>
      </span>
      ${_bar(c, 8)}
      <span class="pt-small pt-muted">${detail}${n ? (open ? ' · masquer' : ' · voir les articles') : ''}</span>
    </button>
    ${list}
  </div>`;
}

function _famPanel(p, done) {
  const f = p.famList.find(x => x.k === _S._partieSel) || p.famList[0];
  if (!f) return '';
  const acts = p.actions.filter(a => a.fam === f.k);
  return `<div class="pt-card pt-detail" id="partieFamPanel">
    <div class="pt-row pt-between" style="align-items:flex-start;gap:16px;flex-wrap:wrap">
      <div><div class="pt-small pt-muted pt-num">${escapeHtml(f.k)} · ${f.n} articles</div><h3 class="pt-h2" style="margin-top:4px">${escapeHtml(f.lib)}</h3></div>
      <div class="pt-num pt-big" style="color:${_col(f.score)}">${f.score}</div>
    </div>
    <div class="pt-col" style="gap:14px">${[0, 1, 2, 3].map(i => _critBlock(f, i, _S._partieCrit === i)).join('')}</div>
    ${acts.length ? `<div class="pt-col" style="gap:8px"><div class="pt-eyebrow">Pour monter cette famille</div>
      ${acts.map(a => `<div class="pt-mini-action${done[a.id] ? ' pt-done' : ''}"><span class="pt-gain">+${a.gain}</span><span class="pt-action-title">${escapeHtml(a.title)}</span></div>`).join('')}</div>` : ''}
  </div>`;
}

function _render() {
  const tab = document.getElementById('tabPartie');
  if (!tab) return;
  const p = _S._partie;
  if (!p) {
    tab.innerHTML = `<div class="pt-wrap"><div class="pt-card pt-muted">Charge un consommé et un état du stock pour lancer la partie.</div></div>`;
    return;
  }
  const done = _S._partieDone || {};
  const hist = _S._partieHist?.length ? _S._partieHist : [];
  const prev = hist.length >= 2 ? hist[hist.length - 2] : null;
  const delta = prev ? p.global - prev.global : 0;
  const doneCount = p.actions.filter(a => done[a.id]).length;
  const famRows = p.famList.map(f => `<button type="button" class="pt-fam${f.k === (_S._partieSel || p.famList[0]?.k) ? ' pt-sel' : ''}" onclick="_partiePickFam('${escapeHtml(f.k)}')">
      <span class="pt-grow pt-ellipsis">${escapeHtml(f.lib)}</span>
      <span style="width:110px;flex-shrink:0">${_bar(f.score)}</span>
      <span class="pt-num pt-strong" style="width:32px;text-align:right;color:${_col(f.score)}">${f.score}</span>
    </button>`).join('');

  tab.innerHTML = `<div class="pt-wrap">
    <div class="pt-small pt-muted">Données au ${escapeHtml(_fmtDate(p.dataKey))} · ${p.nbArticles.toLocaleString('fr-FR')} articles analysés</div>

    <section class="pt-grid3">
      <div class="pt-card pt-row" style="gap:28px;flex-wrap:wrap">
        <div class="pt-ring">${_ring(p.global)}<div class="pt-ring-label"><div class="pt-num" style="font-size:52px;font-weight:600;line-height:1">${p.global}</div><div class="pt-small pt-muted">sur 100</div></div></div>
        <div class="pt-col" style="gap:10px;min-width:0">
          <div class="pt-eyebrow">Ton score agence</div>
          <div class="pt-h2">${_verdict(p.global)}</div>
          ${delta ? `<span class="pt-delta${delta < 0 ? ' pt-delta-neg' : ''}">${delta > 0 ? '+' : ''}${delta} depuis le dernier chargement</span>` : ''}
          <div class="pt-muted">Objectif <span class="pt-num pt-strong" style="color:var(--t-primary)">${PARTIE_OBJECTIF}</span>${p.global < PARTIE_OBJECTIF ? ` · encore ${PARTIE_OBJECTIF - p.global} pts` : ''}</div>
        </div>
      </div>
      <div class="pt-card pt-col" style="gap:10px">
        <div class="pt-eyebrow">Tes trois parties</div>
        ${p.hasSquelette
          ? _domainRow('Assortiment', `Squelette · ${p.famList.length} familles`, p.assort)
          : _domainRow('Assortiment', 'Charge un consommé multi-agences pour activer le squelette', null, true)}
        ${_domainRow('Stock', `Service ${p.stockDetail.service} % · ${p.stockDetail.saso} sur-stocks`, p.stock)}
        ${_domainRow('Clients', 'Arrive dans la prochaine étape de la refonte', null, true)}
      </div>
      <div class="pt-card pt-col" style="gap:12px">
        <div class="pt-eyebrow">Ta progression</div>
        ${_curve(hist)}
      </div>
    </section>

    <section class="pt-col" style="gap:12px">
      <div class="pt-row pt-between" style="flex-wrap:wrap;gap:12px;align-items:baseline">
        <h2 class="pt-h2">Ce que tu peux faire maintenant</h2>
        <span class="pt-muted"><span class="pt-num" style="color:var(--t-primary)">${doneCount}</span> / ${p.actions.length} faites</span>
      </div>
      ${p.actions.length ? p.actions.map(a => _actionRow(a, done)).join('') : '<div class="pt-card pt-muted">Rien à gagner rapidement : ton rayon est au carré.</div>'}
      <p class="pt-small pt-muted">Le gain est en points de la famille (ou du Stock) une fois l'action menée au bout. Le score se met à jour au prochain chargement de données.</p>
    </section>

    ${p.famList.length ? `<section class="pt-row" style="flex-wrap:wrap;gap:20px;align-items:flex-start">
      <div class="pt-card pt-col pt-famlist">
        <div class="pt-row pt-between" style="padding:4px 8px 10px;align-items:baseline"><h2 class="pt-h3">Tes familles</h2><span class="pt-small pt-muted">de la plus faible à la plus forte</span></div>
        ${famRows}
      </div>
      ${_famPanel(p, done)}
    </section>` : ''}
  </div>`;
}

let _persistedKey = '';

async function _persist(p) {
  const store = _S.selectedMyStore;
  if (!store) return;
  const key = `${store}|${p.dataKey}`;
  if (key === _persistedKey) return;
  _persistedKey = key;
  const fams = {};
  for (const f of p.famList) fams[f.k] = f.score;
  const [hist, done] = await Promise.all([
    _savePartieSnapshot(store, { key: p.dataKey, date: p.dataKey, global: p.global, assort: p.assort, stock: p.stock, fams }),
    _loadPartieDone(store, p.dataKey),
  ]);
  _S._partieHist = hist;
  _S._partieDone = done;
  if (_S._partie === p) _render();
}

export function renderPartieTab() {
  const t0 = performance.now();
  const p = computePartie();
  _S._partie = p;
  if (p && !p.famList.some(f => f.k === _S._partieSel)) { _S._partieSel = p.famList[0]?.k || ''; _S._partieCrit = -1; }
  _render();
  if (p) _persist(p);
  console.log('[PERF partie]', (performance.now() - t0 | 0) + 'ms');
}

// ── Handlers ─────────────────────────────────────────────────

function _scrollToPanel() {
  requestAnimationFrame(() => document.getElementById('partieFamPanel')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
}

window._partiePickFam = (k) => { _S._partieSel = k; _S._partieCrit = -1; _render(); };
window._partieToggleCrit = (i) => { _S._partieCrit = _S._partieCrit === i ? -1 : i; _render(); };
window._partieToggleDone = (id) => {
  const p = _S._partie;
  if (!p) return;
  _S._partieDone = { ..._S._partieDone, [id]: !_S._partieDone[id] };
  _render();
  _savePartieDone(_S.selectedMyStore, p.dataKey, _S._partieDone);
};
window._partieOpenAction = (id) => {
  const a = _S._partie?.actions.find(x => x.id === id);
  if (!a) return;
  if (a.cockpit) { window.showCockpitInTable?.(a.cockpit); return; }
  _S._partieSel = a.fam; _S._partieCrit = a.crit;
  _render(); _scrollToPanel();
};
window._partieExportCrit = (i) => {
  const p = _S._partie;
  const f = p?.famList.find(x => x.k === _S._partieSel);
  if (!f) return;
  const spec = _critArticles(f, i);
  const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lines = [['Code', 'Libellé', ...spec.head].map(q).join(';'),
    ...spec.arts.map(a => [a.code, a.libelle || '', ...spec.row(a)].map(q).join(';'))];
  const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const el = document.createElement('a');
  el.href = url;
  el.download = `PRISME_${_S.selectedMyStore}_${f.k}_${CRIT_LABELS[i].replace(/[^\p{L}\p{N}]+/gu, '-')}.csv`;
  el.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
