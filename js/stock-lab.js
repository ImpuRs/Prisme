// © 2026 Jawad El Barkaoui — Tous droits réservés
// PRISME — stock-lab.js
// Pilotage Stock › Banc d'essai : rejoue 12 mois de ventes prélevées réelles, jour par jour,
// avec les MIN/MAX ERP, PRISME ancien calcul, PRISME nouveau calcul (« taux de service ») et un essai de réglages —
// et mesure pour chacun : taux de service, ruptures, stock moyen, commandes de réappro.
// La méthode (minMaxService) est aussi le vrai calcul PRISME depuis oct. 2026 (applyMinMaxServiceLevel, main.js).
// Le rendu du banc d'essai n'écrit rien dans finalData.
// Données : _S.articleDemand { code: [jour, qté, …] } (BL dédupliqués, prélevé, myStore).
// ═══════════════════════════════════════════════════════════════
'use strict';

import { _S } from './state.js';
import { escapeHtml, formatEuro, defaultPeriodRange } from './utils.js';

// ── Paramètres de la méthode « taux de service » ──
// DEFAULTS = ceux du vrai calcul MIN/MAX (applyMinMaxServiceLevel) ; P = copie modifiable à l'écran (essais).
export const MINMAX_DEFAULTS = Object.freeze({ lead: 2, service: Object.freeze({ A: 0.98, B: 0.95, C: 0.90 }), cycle: 14 });
const P = {
  lead: 2,                                   // délai de réappro (jours calendaires) — 48 h centrale
  service: { A: 0.98, B: 0.95, C: 0.90 },    // taux de service visé par classe ABC (Variante)
  cycle: 14,                                 // jours de ventes ajoutés au MIN pour faire le MAX (Variante)
};
const Z = (p) => { // quantile loi normale (approximation d'Acklam, suffisante ici)
  const a = [-39.6968302866538, 220.946098424521, -275.928510446969, 138.357751867269, -30.6647980661472, 2.50662827745924];
  const b = [-54.4760987982241, 161.585836858041, -155.698979859887, 66.8013118877197, -13.2806815528857];
  const c = [-0.00778489400243029, -0.322396458041136, -2.40075827716184, -2.54973253934373, 4.37466414146497, 2.93816398269878];
  const d = [0.00778469570904146, 0.32246712907004, 2.445134137143, 3.75440866190742];
  const q = p < 0.5 ? Math.sqrt(-2 * Math.log(p)) : Math.sqrt(-2 * Math.log(1 - p));
  if (p > 0.02425 && p < 0.97575) {
    const r = (p - 0.5) * (p - 0.5);
    return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * (p - 0.5) / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
  }
  const x = (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  return p < 0.5 ? x : -x;
};

let _last = null;     // dernier résultat (pour la liste d'articles et l'export)
let _sort = 'gain';   // tri de la liste d'articles

/** Fenêtre de simulation : 12 derniers mois complets, en jours depuis 1970. */
function _window() {
  const maxD = _S.consommePeriodMaxFull || _S.consommePeriodMax;
  const r = defaultPeriodRange(maxD);
  if (!r) return null;
  const day = (d) => Math.floor((d.getTime() - d.getTimezoneOffset() * 60000) / 86400000);
  return { d0: day(r.start), d1: day(r.end), start: r.start, end: r.end };
}

/** MIN/MAX « taux de service » d'un article (méthode PRISME depuis oct. 2026, validée au banc d'essai).
 *  Règles métier gardées : nouveauté → MIN/MAX ERP ; statut 2/3/4 (fin de série…) → 0/0 ;
 *  vendu ≤ 1 fois sur 12 mois → 0/0 ; vendu 2 fois → 1/2.
 *  Sinon : MIN = max(demande pendant le délai + z·σ·√délai, taille de commande au quantile visé, 1),
 *  demande corrigée SBA (Croston) si intermittente ; MAX = MIN + ventes de `cycle` jours. */
export function minMaxService(r, daily, events, w, prm = MINMAX_DEFAULTS) {
  const days = w.d1 - w.d0 + 1;
  if (r.isNouveaute) return [r.ancienMin || 0, r.ancienMax || 0];
  if (['2', '3', '4'].includes(String(r.statut || '').charAt(0))) return [0, 0];
  if (events.length <= 1) return [0, 0];
  if (events.length === 2) return [1, 2];
  const tot = events.reduce((s, q) => s + q, 0);
  const mu = tot / days;
  let s2 = 0;
  for (let i = 0; i < days; i++) { const x = (daily.get(w.d0 + i) || 0) - mu; s2 += x * x; }
  const sigma = Math.sqrt(s2 / Math.max(1, days - 1));
  const sl = prm.service[r.abcClass] || prm.service.C;
  const z = Z(sl);
  const adi = days / Math.max(1, daily.size);                               // intervalle moyen entre jours de vente
  const rate = adi > 1.32 ? mu * 0.95 : mu;                                 // SBA (Croston corrigé, α = 0,1) si intermittent
  const sorted = [...events].sort((a, b) => a - b);
  const qOrder = sorted[Math.min(sorted.length - 1, Math.floor(sl * sorted.length))];
  const min = Math.max(Math.ceil(rate * prm.lead + z * sigma * Math.sqrt(prm.lead)), qOrder, 1);
  const max = min + Math.max(1, Math.round(rate * prm.cycle));
  return [min, max];
}

/** Série journalière d'un article sur la fenêtre. */
function _series(code, w) {
  const ev = (_S.articleDemand || {})[code] || [];
  const daily = new Map(), events = [];
  for (let i = 0; i < ev.length; i += 2) {
    const d = ev[i], q = ev[i + 1];
    if (d < w.d0 || d > w.d1) continue;
    daily.set(d, (daily.get(d) || 0) + q);
    events.push(q);
  }
  return { daily, events };
}

/** Nombre de ventes (BL) de l'article chez toi sur les 12 derniers mois complets. */
export function localSalesCount12m(code) {
  const w = _window();
  if (!w) return 0;
  return _series(code, w).events.length;
}

/** Applique la méthode « taux de service » au vrai MIN/MAX PRISME (finalData.nouveauMin/Max).
 *  Appelé après l'analyse, AVANT Vitesse Réseau et le Bouclier Squelette (qui s'appliquent ensuite).
 *  L'ancien calcul est gardé dans r._minMaxAvant pour le banc d'essai. Sans série journalière : rien ne change. */
export function applyMinMaxServiceLevel() {
  const w = _window();
  const dem = _S.articleDemand || {};
  if (!w || !Object.keys(dem).length) return 0;
  let n = 0;
  for (const r of _S.finalData || []) {
    if (!/^\d{6}$/.test(r.code) || r.isParent) continue;
    if (!r._minMaxAvant) r._minMaxAvant = [r.nouveauMin || 0, r.nouveauMax || 0];
    const { daily, events } = _series(r.code, w);
    const [mi, ma] = minMaxService(r, daily, events, w);
    r.nouveauMin = mi; r.nouveauMax = mi === 0 ? 0 : Math.max(mi, ma);
    n++;
  }
  return n;
}

/** Simule une politique (MIN, MAX) sur la fenêtre ; stock initial = MAX (rayon plein). */
function _simulate(min, max, daily, w, pu) {
  const days = w.d1 - w.d0 + 1;
  let stock = max, onOrder = 0, demand = 0, served = 0, rupt = 0, orders = 0, stockSum = 0;
  const arrivals = new Map();
  for (let i = 0; i < days; i++) {
    const t = w.d0 + i;
    const arr = arrivals.get(t);
    if (arr) { stock += arr; onOrder -= arr; arrivals.delete(t); }
    const d = daily.get(t) || 0;
    if (d > 0) {
      demand += d;
      const s = Math.min(stock, d);
      served += s; stock -= s;
      if (s < d) rupt++;
    }
    if (max > 0 && stock + onOrder <= min) {
      const q = max - (stock + onOrder);
      if (q > 0) { onOrder += q; orders++; arrivals.set(t + P.lead, (arrivals.get(t + P.lead) || 0) + q); }
    }
    stockSum += stock;
  }
  return { demand, served, rupt, orders, stockAvgQ: stockSum / days, stockAvgV: stockSum / days * pu };
}

export function runStockLab() {
  const w = _window();
  const dem = _S.articleDemand || {};
  if (!w || !Object.keys(dem).length) return null;
  const pols = ['erp', 'avant', 'prisme', 'var'];
  const tot = Object.fromEntries(pols.map(k => [k, { demand: 0, served: 0, ruptArts: 0, orders: 0, stockV: 0 }]));
  const byAbc = {};
  const arts = [];
  for (const r of _S.finalData || []) {
    if (!/^\d{6}$/.test(r.code) || r.isParent) continue;
    const pu = r.prixUnitaire || 0;
    const { daily, events } = _series(r.code, w);
    const mm = {
      erp: [r.ancienMin || 0, r.ancienMax || 0],
      avant: r._minMaxAvant || [r.nouveauMin || 0, r.nouveauMax || 0],
      prisme: [r.nouveauMin || 0, r.nouveauMax || 0],
    };
    if (!events.length && !mm.erp[1] && !mm.prisme[1] && !mm.avant[1]) continue; // ni vente ni stock prévu : hors périmètre
    mm.var = minMaxService(r, daily, events, w, P);
    const res = {};
    for (const k of pols) res[k] = _simulate(mm[k][0], Math.max(mm[k][0], mm[k][1]), daily, w, pu);
    const abc = r.abcClass || '—';
    if (!byAbc[abc]) byAbc[abc] = Object.fromEntries(pols.map(k => [k, { demand: 0, served: 0, stockV: 0, n: 0 }]));
    for (const k of pols) {
      const x = res[k], T = tot[k], B = byAbc[abc][k];
      T.demand += x.demand; T.served += x.served; T.orders += x.orders; T.stockV += x.stockAvgV;
      if (x.rupt > 0) T.ruptArts++;
      B.demand += x.demand; B.served += x.served; B.stockV += x.stockAvgV; B.n++;
    }
    arts.push({ code: r.code, lib: r.libelle || '', vitesse: !!r._vitesseReseau, abc, fmr: r.fmrClass || '', pu, ventes: events.length, qte: events.reduce((s, q) => s + q, 0), mm, res });
  }
  _last = { w, tot, byAbc, arts, params: JSON.parse(JSON.stringify(P)) };
  return _last;
}

// ── Rendu ──
const _pct = (a, b) => b ? (a / b * 100) : null;
const _fmtPct = (v) => v == null ? '—' : `${v.toFixed(1).replace('.', ',')} %`;
const LABEL = { erp: 'ERP (actuel)', avant: 'PRISME — ancien calcul', prisme: 'PRISME — nouveau calcul', var: 'Essai (tes réglages)' };

function _kpiTable(L) {
  const row = (k) => {
    const t = L.tot[k];
    return `<tr${k === 'prisme' ? ' class="pt-next"' : ''}><td class="pt-strong">${LABEL[k]}</td>
      <td class="pt-num ar-r">${_fmtPct(_pct(t.served, t.demand))}</td>
      <td class="pt-num ar-r">${t.ruptArts.toLocaleString('fr-FR')}</td>
      <td class="pt-num ar-r">${formatEuro(t.stockV)}</td>
      <td class="pt-num ar-r">${t.orders.toLocaleString('fr-FR')}</td></tr>`;
  };
  return `<div class="pt-list" style="margin-top:0"><div class="pt-scroll" style="max-height:none"><table class="pt-table">
    <thead><tr><th>MIN/MAX</th><th class="ar-r">Taux de service</th><th class="ar-r">Articles en rupture ≥ 1 jour</th><th class="ar-r">Stock moyen</th><th class="ar-r">Commandes de réappro</th></tr></thead>
    <tbody>${['erp', 'avant', 'prisme', 'var'].map(row).join('')}</tbody></table></div></div>`;
}

function _abcTable(L) {
  const cls = ['A', 'B', 'C'].filter(c => L.byAbc[c]);
  const rows = cls.map(c => {
    const B = L.byAbc[c];
    const cell = (k) => `<td class="pt-num ar-r">${_fmtPct(_pct(B[k].served, B[k].demand))}<br><span class="pt-small pt-muted">${formatEuro(B[k].stockV)}</span></td>`;
    return `<tr><td class="pt-strong">${c} <span class="pt-small pt-muted">· ${B.erp.n.toLocaleString('fr-FR')} art. · visé ${Math.round(L.params.service[c] * 100)} %</span></td>${cell('erp')}${cell('avant')}${cell('prisme')}</tr>`;
  }).join('');
  return `<div class="pt-list" style="margin-top:0"><div class="pt-scroll" style="max-height:none"><table class="pt-table">
    <thead><tr><th>Classe ABC</th><th class="ar-r">ERP<br><span class="pt-small">service · stock</span></th><th class="ar-r">PRISME ancien</th><th class="ar-r">PRISME nouveau</th></tr></thead>
    <tbody>${rows}</tbody></table></div></div>`;
}

function _artTable(L) {
  const key = {
    gain: (a) => (a.res.avant.stockAvgV - a.res.prisme.stockAvgV),
    service: (a) => (a.res.prisme.served - a.res.erp.served) * (a.pu || 1),
    ventes: (a) => a.ventes,
  }[_sort];
  const list = [...L.arts].sort((a, b) => key(b) - key(a)).slice(0, 60);
  const mm = (x) => `${x[0]}/${x[1]}`;
  const sv = (x) => x.demand ? _fmtPct(_pct(x.served, x.demand)) : '—';
  const rows = list.map(a => `<tr class="ar-click" onclick="window.openArticlePanel?.('${a.code}','essai')">
      <td><div class="pt-col" style="gap:2px"><span class="pt-strong">${escapeHtml(a.lib)}</span><span class="pt-small pt-muted pt-num">${a.code} · ${a.abc}${a.fmr} · ${a.ventes} vente${a.ventes > 1 ? 's' : ''} (${a.qte} u.)</span></div></td>
      <td class="pt-num ar-r">${mm(a.mm.erp)}<br><span class="pt-small pt-muted">${sv(a.res.erp)} · ${formatEuro(a.res.erp.stockAvgV)}</span></td>
      <td class="pt-num ar-r">${mm(a.mm.avant)}<br><span class="pt-small pt-muted">${sv(a.res.avant)} · ${formatEuro(a.res.avant.stockAvgV)}</span></td>
      <td class="pt-num ar-r pt-strong">${mm(a.mm.prisme)}${a.vitesse ? ' <span class="ar-tag" title="Vitesse réseau / médiane ERP réseau">réseau</span>' : ''}<br><span class="pt-small pt-muted">${sv(a.res.prisme)} · ${formatEuro(a.res.prisme.stockAvgV)}</span></td>
    </tr>`).join('');
  const chip = (k, l) => `<button type="button" class="ar-chip${_sort === k ? ' ar-chip-on' : ''}" onclick="window._labSort('${k}')">${l}</button>`;
  return `<div class="pt-row" style="gap:8px;flex-wrap:wrap">${chip('gain', 'Plus de stock économisé (vs ancien)')}${chip('service', 'Plus de service gagné (vs ERP)')}${chip('ventes', 'Plus vendus')}</div>
    <div class="pt-list" style="margin-top:0"><div class="pt-scroll"><table class="pt-table">
    <thead><tr><th>Article</th><th class="ar-r">ERP<br><span class="pt-small">MIN/MAX · service · stock</span></th><th class="ar-r">PRISME ancien</th><th class="ar-r">PRISME nouveau</th></tr></thead>
    <tbody>${rows}</tbody></table></div></div>`;
}

export function renderEssaiTab() {
  const el = document.getElementById('tabEssai');
  if (!el) return;
  const L = runStockLab();
  if (!L) {
    el.innerHTML = `<div class="pt-wrap"><section class="pt-card pt-col" style="gap:8px"><h3 class="pt-h3">Banc d'essai</h3>
      <p class="pt-muted" style="margin:0">Il faut recharger le consommé une fois : le banc d'essai a besoin des ventes jour par jour, enregistrées depuis cette version.</p></section></div>`;
    return;
  }
  const fmtD = (d) => d.toLocaleDateString('fr-FR', { month: 'short', year: 'numeric' });
  const e = L.tot.erp, v = L.tot.prisme, av = L.tot.avant;
  const dStock = v.stockV - av.stockV, dServ = _pct(v.served, v.demand) - _pct(e.served, e.demand);
  el.innerHTML = `<div class="pt-wrap" style="gap:20px">
    <section class="pt-card pt-col" style="gap:14px">
      <div class="pt-col" style="gap:4px">
        <span class="pt-eyebrow">Pilotage stock · banc d'essai</span>
        <h3 class="pt-h2">Le MIN/MAX PRISME, rejoué sur tes ventes</h3>
        <span class="pt-muted">Tes ventes prélevées réelles de ${fmtD(L.w.start)} à ${fmtD(L.w.end)}, rejouées jour par jour. PRISME calcule désormais ses MIN/MAX par taux de service (nouveau calcul) ; l'ancien calcul et l'ERP restent affichés pour comparer. La ligne « Essai » rejoue tes réglages ci-dessous sans rien modifier.</span>
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px">
        <div class="pt-col" style="gap:4px;padding:14px 16px;border-radius:14px;background:var(--s-card-alt)"><span class="pt-eyebrow" style="font-size:11px">Nouveau calcul vs ERP · service</span><span class="pt-num" style="font-size:22px;font-weight:600;color:${dServ >= 0 ? 'var(--pt-high)' : 'var(--pt-low)'}">${dServ >= 0 ? '+' : ''}${dServ.toFixed(1).replace('.', ',')} pt</span><span class="pt-small pt-muted">${_fmtPct(_pct(e.served, e.demand))} → ${_fmtPct(_pct(v.served, v.demand))} des quantités demandées servies</span></div>
        <div class="pt-col" style="gap:4px;padding:14px 16px;border-radius:14px;background:var(--s-card-alt)"><span class="pt-eyebrow" style="font-size:11px">Nouveau vs ancien calcul · stock moyen</span><span class="pt-num" style="font-size:22px;font-weight:600;color:${dStock <= 0 ? 'var(--pt-high)' : 'var(--pt-low)'}">${dStock <= 0 ? '−' : '+'}${formatEuro(Math.abs(dStock))}</span><span class="pt-small pt-muted">${formatEuro(av.stockV)} → ${formatEuro(v.stockV)} (ERP : ${formatEuro(e.stockV)})</span></div>
        <div class="pt-col" style="gap:4px;padding:14px 16px;border-radius:14px;background:var(--s-card-alt)"><span class="pt-eyebrow" style="font-size:11px">Articles simulés</span><span class="pt-num" style="font-size:22px;font-weight:600">${L.arts.length.toLocaleString('fr-FR')}</span><span class="pt-small pt-muted">vendus sur la période ou avec un MIN/MAX</span></div>
      </div>
      ${_kpiTable(L)}
    </section>
    <section class="pt-card pt-col" style="gap:12px">
      <h3 class="pt-h3">Par classe ABC</h3>
      ${_abcTable(L)}
    </section>
    <section class="pt-card pt-col" style="gap:12px">
      <div class="pt-row pt-between" style="gap:12px;flex-wrap:wrap;align-items:flex-start">
        <h3 class="pt-h3">Article par article</h3>
        <button type="button" class="pt-link" onclick="window._labCsv()">Exporter tout en CSV</button>
      </div>
      ${_artTable(L)}
    </section>
    <details class="ar-sec"><summary><span class="pt-col" style="gap:2px"><span class="pt-h3">Réglages et méthode</span><span class="pt-small pt-muted">Délai, taux de service visés, comment la variante calcule</span></span><span class="ar-chev" aria-hidden="true"></span></summary>
      <div class="ar-sec-body" style="gap:14px">
        <div class="pt-row" style="gap:16px;flex-wrap:wrap;align-items:flex-end">
          <label class="pt-col pt-small" style="gap:4px">Délai de réappro (jours)<input class="pf-select" type="number" min="1" max="15" value="${P.lead}" onchange="window._labSet('lead', this.value)"></label>
          ${['A', 'B', 'C'].map(c => `<label class="pt-col pt-small" style="gap:4px">Service visé ${c} (%)<input class="pf-select" type="number" min="50" max="99.9" step="0.5" value="${(P.service[c] * 100).toFixed(1)}" onchange="window._labSet('${c}', this.value)"></label>`).join('')}
          <label class="pt-col pt-small" style="gap:4px">Jours de ventes en plus pour le MAX<input class="pf-select" type="number" min="1" max="60" value="${P.cycle}" onchange="window._labSet('cycle', this.value)"></label>
        </div>
        <ul class="pt-small pt-muted" style="margin:0;padding-left:18px;line-height:1.6">
          <li><strong>Nouveau calcul PRISME</strong> : MIN = le plus grand de (ventes moyennes pendant le délai + stock de sécurité) et (taille de commande que le service visé doit couvrir). Stock de sécurité = z × écart-type des ventes journalières × √délai. Articles à ventes rares (en moyenne plus de 1,3 jour entre deux ventes) : demande corrigée façon Croston/SBA. MAX = MIN + ventes de ${P.cycle} jours.</li>
          <li>Règles métier gardées : vendu une seule fois → 0/0 ; nouveauté → MIN/MAX ERP ; références père exclues.</li>
          <li>Ensuite, comme avant : Vitesse Réseau pour les articles sans vente locale, invendus jamais réapprovisionnés, Bouclier Squelette (challengers 0/0, Ancre Métier 1/1).</li>
          <li>Limite : les calculs PRISME sont faits sur les mêmes 12 mois que ceux rejoués, ce qui les avantage un peu par rapport à l'ERP. Le conditionnement d'achat n'est pas connu, donc les quantités ne sont pas arrondies au colis.</li>
        </ul>
      </div>
    </details>
  </div>`;
}

window._labSort = (k) => { _sort = k; renderEssaiTab(); };
window._labSet = (k, v) => {
  const x = parseFloat(String(v).replace(',', '.'));
  if (!isFinite(x)) return;
  if (k === 'lead') P.lead = Math.max(1, Math.min(15, Math.round(x)));
  else if (k === 'cycle') P.cycle = Math.max(1, Math.min(60, Math.round(x)));
  else if (P.service[k] != null) P.service[k] = Math.max(0.5, Math.min(0.999, x / 100));
  renderEssaiTab();
};
window._labCsv = () => {
  if (!_last) return;
  const q = (s) => `"${String(s ?? '').replace(/"/g, '""')}"`;
  const pct = (x) => x.demand ? (x.served / x.demand * 100).toFixed(1) : '';
  const head = ['Code', 'Libellé', 'ABC', 'FMR', 'Ventes', 'Qté', 'PU',
    'ERP MIN', 'ERP MAX', 'ERP service %', 'ERP stock moyen €', 'ERP commandes',
    'Ancien MIN', 'Ancien MAX', 'Ancien service %', 'Ancien stock moyen €', 'Ancien commandes',
    'PRISME MIN', 'PRISME MAX', 'PRISME service %', 'PRISME stock moyen €', 'PRISME commandes',
    'Essai MIN', 'Essai MAX', 'Essai service %', 'Essai stock moyen €', 'Essai commandes'];
  const rows = _last.arts.map(a => [a.code, q(a.lib), a.abc, a.fmr, a.ventes, a.qte, a.pu.toFixed(2),
    ...['erp', 'avant', 'prisme', 'var'].flatMap(k => [a.mm[k][0], a.mm[k][1], pct(a.res[k]), a.res[k].stockAvgV.toFixed(2), a.res[k].orders])].join(';'));
  const blob = new Blob(['﻿' + head.join(';') + '\n' + rows.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob); const link = document.createElement('a');
  link.href = url; link.download = `PRISME_banc_essai_${_S.selectedMyStore || ''}.csv`; link.click(); URL.revokeObjectURL(url);
};
