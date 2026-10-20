// © 2026 Jawad El Barkaoui — Tous droits réservés
// PRISME — minmax.js
// MIN/MAX PRISME « taux de service » (depuis oct. 2026) : minMaxService par article,
// applyMinMaxServiceLevel sur finalData après l'analyse (pipeline.js), avant Vitesse Réseau et le Bouclier.
// (Le banc d'essai qui a validé la méthode a été retiré en oct. 2026.)
// Données : _S.articleDemand { code: [jour, qté, …] } (BL dédupliqués, prélevé, myStore).
// ═══════════════════════════════════════════════════════════════
'use strict';

import { _S } from './state.js';
import { defaultPeriodRange } from './utils.js';

// ── Paramètres de la méthode « taux de service » ──
export const MINMAX_DEFAULTS = Object.freeze({ lead: 2, service: Object.freeze({ A: 0.98, B: 0.95, C: 0.90 }), cycle: 14 });
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

/** Fenêtre de calcul : 12 derniers mois complets, en jours depuis 1970. */
function _window() {
  const maxD = _S.consommePeriodMaxFull || _S.consommePeriodMax;
  const r = defaultPeriodRange(maxD);
  if (!r) return null;
  const day = (d) => Math.floor((d.getTime() - d.getTimezoneOffset() * 60000) / 86400000);
  return { d0: day(r.start), d1: day(r.end), start: r.start, end: r.end };
}

/** MIN/MAX « taux de service » d'un article (méthode PRISME depuis oct. 2026).
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

/** Série journalière d'un article sur la fenêtre (ventes réelles). */
function _series(code, w) {
  const ev = (_S.articleDemand || {})[code] || [];
  const daily = new Map(), events = [], pairs = [];
  for (let i = 0; i < ev.length; i += 2) {
    const d = ev[i], q = ev[i + 1];
    if (d < w.d0 || d > w.d1) continue;
    daily.set(d, (daily.get(d) || 0) + q);
    events.push(q); pairs.push(d, q);
  }
  return { daily, events, pairs };
}

/** Série ÉCRÊTÉE pour le calcul du MIN/MAX (règle métier n°2, protège des commandes exceptionnelles) :
 *  chaque commande est plafonnée au plus grand de 3 × la commande médiane et de la 2e plus grosse commande. */
function _seriesCalc(code, w) {
  const raw = _series(code, w);
  if (raw.events.length < 3) return raw;
  const sorted = [...raw.events].sort((a, b) => a - b);
  const med = sorted[Math.floor(sorted.length / 2)];
  // Plafond = le plus grand de (3 × médiane, 2e plus grosse commande) : seule une commande ISOLÉE est rabotée,
  // des grosses commandes qui se répètent restent couvertes.
  const cap = Math.max(1, Math.ceil(3 * med), sorted[sorted.length - 2]);
  if (sorted[sorted.length - 1] <= cap) return raw;
  const daily = new Map(), events = [];
  for (let i = 0; i < raw.pairs.length; i += 2) {
    const d = raw.pairs[i], q = Math.min(raw.pairs[i + 1], cap);
    daily.set(d, (daily.get(d) || 0) + q);
    events.push(q);
  }
  return { daily, events, pairs: raw.pairs };
}

/** Détail du calcul « taux de service » d'un article, pour la fiche article (« Pourquoi ce mini / maxi ? »).
 *  Mêmes étapes que minMaxService ; ne modifie rien. Retourne { rule, … } où rule ∈
 *  'nouveaute' | 'statut' | 'une_vente' | 'deux_ventes' | 'calcul' | 'sans_donnees'. */
export function explainMinMax(r, prm = MINMAX_DEFAULTS) {
  const w = _window();
  if (!w || !r) return { rule: 'sans_donnees' };
  const { daily, events } = _seriesCalc(r.code, w);
  const raw = _series(r.code, w);
  const base = { nbVentes: events.length, lead: prm.lead, cycle: prm.cycle, fenetre: w };
  if (r.isNouveaute) return { ...base, rule: 'nouveaute', min: r.ancienMin || 0, max: r.ancienMax || 0 };
  if (['2', '3', '4'].includes(String(r.statut || '').charAt(0))) return { ...base, rule: 'statut', min: 0, max: 0 };
  if (events.length <= 1) return { ...base, rule: 'une_vente', min: 0, max: 0 };
  if (events.length === 2) return { ...base, rule: 'deux_ventes', min: 1, max: 2 };
  const days = w.d1 - w.d0 + 1;
  const tot = events.reduce((t, q) => t + q, 0);
  const mu = tot / days;
  let s2 = 0;
  for (let i = 0; i < days; i++) { const x = (daily.get(w.d0 + i) || 0) - mu; s2 += x * x; }
  const sigma = Math.sqrt(s2 / Math.max(1, days - 1));
  const sl = prm.service[r.abcClass] || prm.service.C;
  const z = Z(sl);
  const adi = days / Math.max(1, daily.size);
  const intermittent = adi > 1.32;
  const rate = intermittent ? mu * 0.95 : mu;
  const sorted = [...events].sort((a, b) => a - b);
  const qOrder = sorted[Math.min(sorted.length - 1, Math.floor(sl * sorted.length))];
  const besoinDelai = rate * prm.lead, securite = z * sigma * Math.sqrt(prm.lead);
  const parRythme = Math.ceil(besoinDelai + securite);
  const min = Math.max(parRythme, qOrder, 1);
  const cycleQte = Math.max(1, Math.round(rate * prm.cycle));
  const rawMax = raw.events.length ? Math.max(...raw.events) : 0;
  return { ...base, rule: 'calcul', days, tot, rate, intermittent, sigma, service: sl, z, besoinDelai, securite,
    parRythme, qOrder, min, cycleQte, max: min + cycleQte,
    rabote: rawMax > (events.length ? Math.max(...events) : 0) ? rawMax : 0 };
}

/** Nombre de ventes (BL) de l'article chez toi sur les 12 derniers mois complets. */
export function localSalesCount12m(code) {
  const w = _window();
  if (!w) return 0;
  return _series(code, w).events.length;
}

/** Applique la méthode « taux de service » au vrai MIN/MAX PRISME (finalData.nouveauMin/Max).
 *  Appelé après l'analyse, AVANT Vitesse Réseau et le Bouclier Squelette (qui s'appliquent ensuite).
 *  L'ancien calcul est gardé dans r._minMaxAvant. Sans série journalière : rien ne change. */
export function applyMinMaxServiceLevel() {
  const w = _window();
  const dem = _S.articleDemand || {};
  if (!w || !Object.keys(dem).length) return 0;
  let n = 0;
  for (const r of _S.finalData || []) {
    if (!/^\d{6}$/.test(r.code) || r.isParent) continue;
    if (!r._minMaxAvant) r._minMaxAvant = [r.nouveauMin || 0, r.nouveauMax || 0];
    const { daily, events } = _seriesCalc(r.code, w);
    const [mi, ma] = minMaxService(r, daily, events, w);
    r.nouveauMin = mi; r.nouveauMax = mi === 0 ? 0 : Math.max(mi, ma);
    n++;
  }
  return n;
}
