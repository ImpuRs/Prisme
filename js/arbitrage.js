// ═══════════════════════════════════════════════════════════════
// PRISME — arbitrage.js
// Pilotage Stock › Arbitrage : le détail du domaine Stock de « La partie ».
//   1. Score Stock — le MÊME que La partie (computeStockPartie), avec sa décomposition
//   2. Valeur du stock ventilée : se vend / rare / jamais vendu en 12 mois
//   3. Décisions : commander, implanter, dégonfler, retourner, libérer — chacune
//      chiffrée (articles, €, points gagnés quand elle fait monter le score)
//   4. Pour creuser : emplacements, vendus en livraison, matrice ABC × FMR
// Assortiment → 12MG pleine période (finalData, ventesLocalMag12MG), insensible au filtre période.
// Dépend de : state.js, utils.js, constants.js, partie.js, emplacement.js
// ═══════════════════════════════════════════════════════════════
'use strict';

import { _S } from './state.js';
import { formatEuro, escapeHtml } from './utils.js';
import { PARTIE_STOCK_W_SERVICE } from './constants.js';
import { computeStockPartie } from './partie.js';
import { isInvendu } from './engine.js';
import { computePerfEmplacement, computeEnlevesSansRayon, renderArbitrageRayonBlock, openArbitrageSection } from './emplacement.js';

const _col = (s) => s == null ? 'var(--t-disabled)' : s < 70 ? 'var(--pt-low)' : s < 80 ? 'var(--pt-mid)' : 'var(--pt-high)';
const _bar = (v, color, h = 8) => `<span class="pt-track" style="height:${h}px"><span class="pt-fill" style="width:${Math.max(0, Math.min(100, v))}%;background:${color}"></span></span>`;
const _val = (r) => r.valeurStock != null ? r.valeurStock : (r.stockActuel || 0) * (r.prixUnitaire || 0);
const _n = (v) => Number(v || 0).toLocaleString('fr-FR');
const _plural = (n, s, p) => n > 1 ? p : s;


function _compute() {
  const fd = _S.finalData || [];
  const sp = computeStockPartie(fd);
  const split = { vend: 0, rare: 0, jamais: 0, nouv: 0 };
  let total = 0, nbEnStock = 0, caRup = 0, excedent = 0, invVal = 0, invN = 0;
  for (const r of fd) {
    const v = _val(r);
    if (r.stockActuel > 0 && v > 0) {
      total += v; nbEnStock++;
      if (r.isNouveaute && !r.W) split.nouv += v;
      else if (!r.W) split.jamais += v;
      else if (r.fmrClass === 'R') split.rare += v;
      else split.vend += v;
    }
    if (isInvendu(r)) { invN++; invVal += v; }
  }
  for (const r of sp.rupArts) caRup += r.caAnnuel || 0;
  for (const r of sp.sasoArts) excedent += (r.stockActuel - r.ancienMax) * (r.prixUnitaire || 0);
  const manques = computeEnlevesSansRayon().filter(r => r.stockActuel === 0);
  const pm = computePerfEmplacement().filter(r => r.statut === 'poids_mort');
  return {
    sp, total, nbEnStock, split, nbArticles: fd.length,
    decisions: [
      { key: 'commander', verb: 'Commander', n: sp.rupArts.length, unit: _plural(sp.rupArts.length, 'article fréquent en rupture', 'articles fréquents en rupture'),
        euro: caRup, euroLabel: 'de CA sur 12 mois sur ces articles', gain: sp.gainRuptures,
        cta: 'Voir la liste', go: "showCockpitInTable('ruptures')" },
      { key: 'implanter', verb: 'Implanter', n: manques.length, unit: _plural(manques.length, 'article absent du rayon, vendu en livraison', 'articles absents du rayon, vendus en livraison'),
        euro: manques.reduce((s, r) => s + r.caEnl, 0), euroLabel: 'de CA en livraison à ramener au comptoir',
        cta: 'Voir la liste', go: "_arbOpen('enl','sansStock')" },
      { key: 'degonfler', verb: 'Dégonfler', n: sp.sasoArts.length, unit: _plural(sp.sasoArts.length, 'article au-dessus de son MAX', 'articles au-dessus de leur MAX'),
        euro: excedent, euroLabel: 'de stock en trop au-delà du MAX', gain: sp.gainSaso,
        cta: 'Voir la liste', go: "showCockpitInTable('saso')" },
      { key: 'retourner', verb: 'Retourner', n: invN, unit: _plural(invN, 'article jamais vendu en 12 mois', 'articles jamais vendus en 12 mois'),
        euro: invVal, euroLabel: 'immobilisés — retour centrale ou déstockage',
        cta: 'Voir la liste', go: "showCockpitInTable('invendus')" },
      { key: 'liberer', verb: 'Libérer', n: pm.length, unit: _plural(pm.length, 'emplacement quasi mort (moins de 3 clients en 12 mois)', 'emplacements quasi morts (moins de 3 clients en 12 mois)'),
        euro: pm.reduce((s, r) => s + r.valStock, 0), euroLabel: 'de stock sur ces emplacements',
        cta: 'Voir la liste', go: "_arbOpen('emp','poids_mort')" },
    ],
  };
}

function _head(d) {
  const { sp } = d;
  const wS = Math.round(PARTIE_STOCK_W_SERVICE * 100);
  const score = sp.score == null
    ? `<div class="pt-col" style="gap:10px"><span class="pt-eyebrow">Score Stock</span>
        <p class="pt-muted" style="margin:0">Pas de score : aucun article fréquent mesurable. Vérifie que le consommé et l’état du stock portent sur la même agence.</p></div>`
    : `<div class="pt-col" style="gap:18px">
        <div class="pt-row pt-between" style="align-items:flex-start;gap:12px">
          <div class="pt-col" style="gap:4px"><span class="pt-eyebrow">Score Stock</span>
            <button type="button" class="pt-link pt-small" style="padding:0;text-align:left" onclick="switchTab('partie')">Le même que dans La partie →</button></div>
          <div class="pt-num pt-big" style="color:${_col(sp.score)}">${sp.score}<span class="pt-muted" style="font-size:20px">/100</span></div>
        </div>
        <div class="pt-col" style="gap:6px">
          <div class="pt-row pt-between pt-small"><span>Taux de service <span class="pt-muted">· compte pour ${wS} %</span></span><span class="pt-num pt-strong">${sp.service} %</span></div>
          ${_bar(sp.service, _col(sp.service))}
          <span class="pt-small pt-muted">Articles fréquents (F, M) en stock</span>
        </div>
        <div class="pt-col" style="gap:6px">
          <div class="pt-row pt-between pt-small"><span>Hors sur-stock <span class="pt-muted">· compte pour ${100 - wS} %</span></span><span class="pt-num pt-strong">${sp.propre} %</span></div>
          ${_bar(sp.propre, _col(sp.propre))}
          <span class="pt-small pt-muted">Références en stock sous leur MAX ERP</span>
        </div>
      </div>`;

  const segs = [
    { k: 'vend', label: 'Se vend', sub: 'vendu ≥4 fois en 12 mois', color: 'var(--pt-high)' },
    { k: 'rare', label: 'Rare', sub: 'vendu 1 à 3 fois', color: 'var(--pt-mid)' },
    { k: 'jamais', label: 'Jamais vendu', sub: 'aucune vente en 12 mois', color: 'var(--pt-low)' },
    { k: 'nouv', label: 'Nouveautés', sub: 'pas encore de vente', color: 'var(--t-disabled)' },
  ].filter(s => d.split[s.k] > 0);
  const pct = (v) => d.total ? v / d.total * 100 : 0;
  const stack = segs.map(s => `<span style="width:${pct(d.split[s.k]).toFixed(2)}%;background:${s.color}" title="${s.label} : ${formatEuro(d.split[s.k])}"></span>`).join('');
  const legend = segs.map(s => `<div class="pt-row" style="gap:10px;align-items:flex-start">
      <span class="ar-dot" style="background:${s.color}"></span>
      <span class="pt-grow pt-col"><span class="pt-small">${s.label}</span><span class="pt-small pt-muted">${s.sub}</span></span>
      <span class="pt-col" style="align-items:flex-end"><span class="pt-num pt-strong pt-small">${formatEuro(d.split[s.k])}</span><span class="pt-num pt-small pt-muted">${Math.round(pct(d.split[s.k]))} %</span></span>
    </div>`).join('');

  return `<section class="ar-head">
    <div class="pt-card">${score}</div>
    <div class="pt-card pt-col" style="gap:18px">
      <div class="pt-row pt-between" style="align-items:flex-start;gap:12px;flex-wrap:wrap">
        <div class="pt-col" style="gap:4px"><span class="pt-eyebrow">Valeur du stock</span>
          <span class="pt-small pt-muted">${_n(d.nbEnStock)} références en stock</span></div>
        <div class="pt-num" style="font-size:40px;font-weight:600;line-height:1">${formatEuro(d.total)}</div>
      </div>
      <div class="ar-stack" role="img" aria-label="Répartition de la valeur du stock">${stack}</div>
      <div class="ar-legend">${legend}</div>
    </div>
  </section>`;
}

function _decisionCard(x) {
  const empty = !x.n;
  // Seules les décisions qui font bouger le score Stock portent des points ; les autres se lisent en €.
  const badge = x.gain >= 1 ? `<span class="pt-gain">+${x.gain} pts</span>` : '';
  return `<article class="pt-card ar-dec${empty ? ' ar-dec-empty' : ''}">
    <div class="pt-row pt-between" style="gap:10px;min-height:32px"><span class="pt-eyebrow">${x.verb}</span>${empty ? '' : badge}</div>
    ${empty ? `<p class="pt-muted" style="margin:0">Rien à faire ici.</p>` : `
    <div class="pt-col" style="gap:4px">
      <span class="pt-num" style="font-size:36px;font-weight:600;line-height:1.05">${_n(x.n)}</span>
      <span class="ar-dec-unit">${escapeHtml(x.unit)}</span>
    </div>
    <p class="pt-small pt-muted" style="margin:0"><span class="pt-num pt-strong" style="color:var(--t-primary)">${formatEuro(x.euro)}</span> ${escapeHtml(x.euroLabel)}</p>
    <button type="button" class="pt-btn ar-dec-cta" onclick="${x.go}">${x.cta} →</button>`}
  </article>`;
}

function _decisions(d) {
  return `<section class="pt-col" style="gap:16px">
    <div class="pt-row pt-between" style="gap:12px;flex-wrap:wrap;align-items:baseline">
      <h3 class="pt-h2">Tes décisions stock</h3>
      <span class="pt-small pt-muted">Les points s’ajoutent au score Stock une fois l’action menée au bout</span>
    </div>
    <div class="ar-decs">${d.decisions.map(_decisionCard).join('')}</div>
  </section>`;
}

function _layout() {
  return `<div class="pt-wrap" id="arbitrageView">
    <header class="pt-col" style="gap:6px">
      <span class="pt-eyebrow">Pilotage stock</span>
      <h2 class="pt-h2" style="font-size:28px">Ce que ton stock te demande</h2>
      <span class="pt-small pt-muted" id="arSub"></span>
    </header>
    <div id="arHead"></div>
    <div id="arDecisions"></div>
    <section class="pt-col" style="gap:12px">
      <h3 class="pt-h2">Pour creuser</h3>
      <div id="arbitrageRayonBlock"></div>
      <div id="arbitrageEnlBlock"></div>
      <details class="ar-sec" id="arSecMatrix">
        <summary><span class="pt-col" style="gap:2px"><span class="pt-h3">Matrice ABC × FMR</span>
          <span class="pt-small pt-muted" id="arMatrixSub">Poids dans le CA × fréquence de vente</span></span>
          <span class="ar-chev" aria-hidden="true"></span></summary>
        <div class="ar-sec-body"><div id="abcMatrixContainer" style="overflow-x:auto"></div></div>
      </details>
    </section>
  </div>`;
}

export function renderArbitrageTab() {
  const host = document.getElementById('tabArbitrage');
  if (!host) return;
  if (!document.getElementById('arbitrageView')) host.insertAdjacentHTML('beforeend', _layout());
  if (!(_S.finalData || []).length) return;
  const d = _compute();
  const dt = _S.consommePeriodMaxFull || _S.consommePeriodMax;
  document.getElementById('arSub').textContent =
    `${dt ? `Données au ${new Date(dt).toLocaleDateString('fr-FR')} · ` : ''}${_n(d.nbArticles)} articles · ${_S.selectedMyStore || ''}`;
  document.getElementById('arHead').innerHTML = _head(d);
  document.getElementById('arDecisions').innerHTML = _decisions(d);
  const inv = d.decisions.find(x => x.key === 'retourner');
  document.getElementById('arMatrixSub').textContent =
    `Poids dans le CA × fréquence de vente · ${_n(inv.n)} ${_plural(inv.n, 'article jamais vendu', 'articles jamais vendus')} (${formatEuro(inv.euro)}) hors matrice`;
  renderArbitrageRayonBlock();
}

window._arbOpen = (which, filter) => openArbitrageSection(which, filter);
