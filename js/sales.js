// ═══════════════════════════════════════════════════════════════
// PRISME — sales.js
// Couche d'accès unifiée aux structures de ventes (anti-duplication).
// Objectif : centraliser les règles "pleine période vs filtrée",
// "MAGASIN vs hors-MAGASIN", et les fallbacks legacy.
// ═══════════════════════════════════════════════════════════════
'use strict';

import { _S } from './state.js';

/**
 * MAGASIN — période filtrée (période UI).
 *
 * Note : selon le canal global actif, ventesClientArticle peut être reconstruite
 * (ex: filtre canal hors-MAGASIN), donc c'est une "vue active" et non une source brute.
 */
export function getVentesClientMagFiltered() {
  return _S.ventesClientArticle;
}

/**
 * MAGASIN — pleine période (12MG), si disponible.
 * Fallback legacy : ventesClientArticle (anciennes sessions / caches).
 */
export function getVentesClientMagFull() {
  const m = _S.ventesClientMagFull;
  if (m && m.size) return m;
  return _S.ventesClientArticle;
}

export function hasVentesClientMagFull() {
  return !!(_S.ventesClientMagFull && _S.ventesClientMagFull.size);
}

/**
 * CA full période, tous canaux, par store×client.
 * @returns {Map<string, number>|null}
 */
export function getCaClientParStoreMap(storeCode) {
  if (!storeCode) return null;
  const m = _S.caClientParStore?.[storeCode];
  return m && m instanceof Map ? m : null;
}

/**
 * CA full période, tous canaux, pour un client (store donné ou agence sélectionnée).
 */
export function getClientCAFullAllCanaux(cc, storeCode = '') {
  if (!cc) return 0;
  const sk = storeCode || _S.selectedMyStore || '';
  const m = getCaClientParStoreMap(sk);
  return m ? (m.get(cc) || 0) : 0;
}

/**
 * Helper : fact client×article.
 *
 * canal='MAGASIN' => ventesClientArticle / ventesClientMagFull
 * canal!='MAGASIN' => ventesClientHorsMagasin (agrégé; pas de découpage mensuel aujourd'hui)
 *
 * @param {string} cc
 * @param {string} code
 * @param {{canal?: string, period?: 'filtered'|'full'}} [opts]
 * @returns {Object|null}
 */
export function getClientArticleFact(cc, code, opts = {}) {
  const { canal = 'MAGASIN', period = 'filtered' } = opts || {};
  if (!cc || !code) return null;

  if (!canal || canal === 'MAGASIN') {
    const src = (period === 'full') ? getVentesClientMagFull() : getVentesClientMagFiltered();
    return src?.get(cc)?.get(code) || null;
  }

  // Hors MAGASIN : le fact porte un .canal (dernier canal vu). Filtrage best-effort.
  const hm = _S.ventesClientHorsMagasin?.get(cc);
  if (!hm) return null;
  const fact = hm.get(code) || null;
  if (!fact) return null;
  if (fact.canal && canal && fact.canal !== canal) return null;
  return fact;
}

// ── Mensuel / ranges ────────────────────────────────────────────────────

export function monthIdxFromDate(d) {
  if (!d || !(d instanceof Date) || isNaN(d.getTime())) return null;
  return d.getFullYear() * 12 + d.getMonth();
}

// Range mois inclusif (monthIdx = year*12+month)
export function monthRangeFromDates(dMin, dMax) {
  const min = monthIdxFromDate(dMin);
  const max = monthIdxFromDate(dMax);
  if (min == null || max == null) return null;
  return min <= max ? { min, max } : { min: max, max: min };
}

/**
 * CA mensuel client×article — MAGASIN (myStore), depuis _byMonth.
 * Retourne null si la source mensuelle n'est pas disponible.
 */
export function getClientArticleMagAggInMonthRange(cc, code, range, opts = {}) {
  if (!cc || !code || !range) return null;
  const months = _S._byMonth?.[cc]?.[code];
  if (!months) return null;
  const mode = opts.mode || 'all'; // 'all' | 'preleve' | 'enleve'
  let sumCA = 0, sumPrelevee = 0, sumCAPrelevee = 0, countBL = 0;
  for (const midxStr in months) {
    const midx = +midxStr;
    if (midx < range.min || midx > range.max) continue;
    const d = months[midxStr];
    if (!d) continue;
    const ca = d.sumCA || 0;
    const caP = d.sumCAPrelevee || 0;
    if (mode === 'preleve') sumCA += caP;
    else if (mode === 'enleve') sumCA += (ca - caP);
    else sumCA += ca;
    sumPrelevee += d.sumPrelevee || 0;
    sumCAPrelevee += caP;
    countBL += d.countBL || 0;
  }
  return { sumCA, sumPrelevee, sumCAPrelevee, countBL };
}

/**
 * CA mensuel client×article — "full all canaux" (myStore), depuis _byMonthFull.
 * Retourne null si la source mensuelle n'est pas disponible.
 */
export function getClientArticleCAFullInMonthRange(cc, code, range) {
  if (!cc || !code || !range) return null;
  const months = _S._byMonthFull?.[cc]?.[code];
  if (!months) return null;
  let ca = 0;
  for (const midxStr in months) {
    const midx = +midxStr;
    if (midx < range.min || midx > range.max) continue;
    ca += months[midxStr]?.sumCA || 0;
  }
  return ca;
}

/**
 * CA client (MAGASIN/myStore) dans une plage de mois, depuis _byMonth.
 * Retourne null si la source mensuelle n'est pas disponible.
 */
export function getClientCAMagasinInMonthRange(cc, range) {
  if (!cc || !range) return null;
  const articles = _S._byMonth?.[cc];
  if (!articles) return null;
  let ca = 0;
  for (const code in articles) {
    const months = articles[code];
    for (const midxStr in months) {
      const midx = +midxStr;
      if (midx < range.min || midx > range.max) continue;
      ca += months[midxStr]?.sumCA || 0;
    }
  }
  return ca;
}

/**
 * CA client (TOUS canaux, myStore) dans une plage de mois, depuis _byMonthFull.
 * Retourne null si la source mensuelle n'est pas disponible.
 * Fallback: _byMonth (MAGASIN only) si _byMonthFull absent.
 */
export function getClientCAFullInMonthRange(cc, range) {
  if (!cc || !range) return null;
  const src = _S._byMonthFull?.[cc] || _S._byMonth?.[cc];
  if (!src) return null;
  let ca = 0;
  for (const code in src) {
    const months = src[code];
    for (const midxStr in months) {
      const midx = +midxStr;
      if (midx < range.min || midx > range.max) continue;
      ca += months[midxStr]?.sumCA || 0;
    }
  }
  return ca;
}

// ── Agrégations article depuis byMonth (hot path Benchmark/Arbitrage) ─────

function _isSixDigitCode(code) {
  if (code == null) return false;
  const s = typeof code === 'string' ? code : String(code);
  if (s.length !== 6) return false;
  for (let i = 0; i < 6; i++) {
    const c = s.charCodeAt(i);
    if (c < 48 || c > 57) return false;
  }
  return true;
}

let _artAggCache = { bm: null, key: '', value: null };

/**
 * Agrège byMonth (MAGASIN/myStore) en article → {sumCA,sumPrelevee,sumCAPrelevee,countBL} sur une plage de mois.
 * Utile quand on veut des stats par article sans re-parser ni reconstruire des Maps multiples.
 *
 * @param {{min:number, max:number}} range monthIdx inclusif
 * @param {{onlySixDigit?: boolean, preleveePositiveOnly?: boolean, fields?: {sumCA?: boolean, sumPrelevee?: boolean, sumCAPrelevee?: boolean, countBL?: boolean}}} [opts]
 * @returns {Map<string, Object>|null}
 */
export function buildArticleAggFromByMonth(range, opts = {}) {
  if (!range) return null;
  const bm = _S._byMonth;
  if (!bm) return null;

  const onlySixDigit = opts.onlySixDigit !== false;
  const preleveePositiveOnly = opts.preleveePositiveOnly !== false;
  const fields = opts.fields || { sumCA: true, sumPrelevee: true, sumCAPrelevee: true, countBL: true };
  const wantCA = !!fields.sumCA;
  const wantQteP = !!fields.sumPrelevee;
  const wantCAP = !!fields.sumCAPrelevee;
  const wantBL = !!fields.countBL;
  const key = [
    range.min, range.max,
    onlySixDigit ? 1 : 0,
    preleveePositiveOnly ? 1 : 0,
    wantCA ? 1 : 0,
    wantQteP ? 1 : 0,
    wantCAP ? 1 : 0,
    wantBL ? 1 : 0,
  ].join('|');

  if (_artAggCache.bm === bm && _artAggCache.key === key && _artAggCache.value) return _artAggCache.value;

  const res = new Map();

  for (const cc in bm) {
    const arts = bm[cc];
    if (!arts) continue;
    for (const code in arts) {
      if (onlySixDigit && !_isSixDigitCode(code)) continue;
      const months = arts[code];
      if (!months) continue;
      for (const midxStr in months) {
        const midx = +midxStr;
        if (midx < range.min || midx > range.max) continue;
        const d = months[midxStr];
        if (!d) continue;

        let e = res.get(code);
        if (!e) {
          e = {};
          if (wantCA) e.sumCA = 0;
          if (wantQteP) e.sumPrelevee = 0;
          if (wantCAP) e.sumCAPrelevee = 0;
          if (wantBL) e.countBL = 0;
          res.set(code, e);
        }

        if (wantCA) e.sumCA += d.sumCA || 0;
        if (wantQteP) {
          const q = d.sumPrelevee || 0;
          if (!preleveePositiveOnly) e.sumPrelevee += q;
          else if (q > 0) e.sumPrelevee += q;
        }
        if (wantCAP) e.sumCAPrelevee += d.sumCAPrelevee || 0;
        if (wantBL) e.countBL += d.countBL || 0;
      }
    }
  }

  _artAggCache = { bm, key, value: res };
  return res;
}
