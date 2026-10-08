// ═══════════════════════════════════════════════════════════════
// PRISME — sales.js
// Couche d'accès unifiée aux structures de ventes (anti-duplication).
// Objectif : centraliser les règles "pleine période vs filtrée",
// "MAGASIN vs hors-MAGASIN", et les fallbacks legacy.
// ═══════════════════════════════════════════════════════════════
'use strict';

import { _S } from './state.js';

/**
 * MAGASIN — pleine période (12MG), si disponible.
 * Fallback legacy : ventesLocalMagPeriode (anciennes sessions / caches).
 */
export function getVentesClientMagFull() {
  const m = _S.ventesLocalMag12MG;
  if (m && m.size) return m;
  return _S.ventesLocalMagPeriode;
}

export function hasVentesClientMagFull() {
  return !!(_S.ventesLocalMag12MG && _S.ventesLocalMag12MG.size);
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

// ── Clients actifs (période) depuis byMonthClients* ──────────────────────
// Problème : quand on restaure depuis IDB et qu'on change la période, les
// agrégats period-filtered (ex: ventesLocalHorsMag) ne sont pas
// reconstruits. Ces helpers donnent un Set<cc> exact par période/canal,
// sans re-parser les fichiers.

function _effectiveCanalKeyForClientSets(canal, magasinMode) {
  const c = (canal || '').toUpperCase();
  if (!c) return '';
  if (c !== 'MAGASIN') return c;
  const m = (magasinMode || 'all').toLowerCase();
  if (m === 'preleve') return 'MAGASIN_PREL';
  if (m === 'enleve') return 'MAGASIN_ENL';
  return 'MAGASIN';
}

export function getCurrentPeriodMonthRange() {
  const dMin = _S.periodFilterStart || _S.consommePeriodMinFull || _S.consommePeriodMin;
  const dMax = _S.periodFilterEnd || _S.consommePeriodMaxFull || _S.consommePeriodMax;
  return monthRangeFromDates(dMin, dMax);
}

let _clientsActiveCache = { src: null, key: '', value: null };

/**
 * Set<cc> des clients actifs sur la période courante, pour un canal donné.
 * canal='' => tous canaux (MAGASIN + hors MAGASIN)
 *
 * @param {string} canal ''|'MAGASIN'|'INTERNET'|'REPRESENTANT'|'DCS'|'AUTRE'|...
 * @param {{range?: {min:number,max:number}, magasinMode?: 'all'|'preleve'|'enleve'}} [opts]
 * @returns {Set<string>|null}
 */
export function getClientsActiveSetInPeriod(canal = '', opts = {}) {
  const range = opts.range || getCurrentPeriodMonthRange();
  if (!range) return null;

  const magasinMode = opts.magasinMode || 'all';
  const canalKey = _effectiveCanalKeyForClientSets(canal, magasinMode);

  // Tous canaux : réutiliser le Set pré-calculé par _refilterFromByMonth quand dispo.
  if (!canalKey) {
    if (_S._clientsTousCanaux instanceof Set && _S._clientsTousCanaux.size) return _S._clientsTousCanaux;
    const src = _S._byMonthClients;
    if (!src) return null;
    const key = range.min + '|' + range.max + '|ALL';
    if (_clientsActiveCache.src === src && _clientsActiveCache.key === key && _clientsActiveCache.value) return _clientsActiveCache.value;
    const out = new Set();
    for (const midxStr in src) {
      const midx = +midxStr;
      if (midx < range.min || midx > range.max) continue;
      const s = src[midxStr];
      if (!s) continue;
      for (const cc of s) out.add(cc);
    }
    _clientsActiveCache = { src, key, value: out };
    return out;
  }

  // Canal spécifique
  const src = _S._byMonthClientsByCanal;
  if (!src) {
    // Fallback (caches anciens) : canal MAGASIN peut être dérivé de clientsMagasin.
    if (canalKey === 'MAGASIN' && _S.clientsMagasin instanceof Set) return _S.clientsMagasin;
    return null;
  }
  const key = range.min + '|' + range.max + '|' + canalKey;
  if (_clientsActiveCache.src === src && _clientsActiveCache.key === key && _clientsActiveCache.value) return _clientsActiveCache.value;
  const out = new Set();
  for (const midxStr in src) {
    const midx = +midxStr;
    if (midx < range.min || midx > range.max) continue;
    const cm = src[midxStr];
    const s = cm ? cm[canalKey] : null;
    if (!s) continue;
    for (const cc of s) out.add(cc);
  }
  _clientsActiveCache = { src, key, value: out };
  return out;
}

// ── Dernière vente par article (MAGASIN, myStore) ─────────────
let _lastSaleCache = { bm: null, value: null };
/** Map<code, monthIdx> du dernier mois avec au moins un BL (byMonth : client → article → mois). */
export function getArticleLastSaleMonthIdx() {
  const bm = _S._byMonth;
  if (!bm) return null;
  if (_lastSaleCache.bm === bm && _lastSaleCache.value) return _lastSaleCache.value;
  const res = new Map();
  for (const cc in bm) {
    const arts = bm[cc];
    if (!arts) continue;
    for (const code in arts) {
      const months = arts[code];
      let best = res.get(code) ?? -1;
      for (const m in months) if ((months[m]?.countBL || 0) > 0 && +m > best) best = +m;
      if (best >= 0) res.set(code, best);
    }
  }
  _lastSaleCache = { bm, value: res };
  return res;
}


// ── Achats d'un client dans les autres agences du consommé ─────
// Remplace le fichier Livraisons (Qlik) quand il est absent : le consommé multi-agences voit
// les achats tous canaux des clients dans chaque agence qu'il couvre (historique chargé complet).

/** [{ store, ca }] — CA du client dans chaque autre agence, décroissant. */
export function getClientCAParAutreAgence(cc) {
  const out = [];
  const my = _S.selectedMyStore;
  for (const [store, m] of Object.entries(_S.caClientParStore || {})) {
    if (store === my || !m?.get) continue;
    const ca = m.get(cc) || 0;
    if (ca > 0) out.push({ store, ca });
  }
  return out.sort((a, b) => b.ca - a.ca);
}

/** Map<code, ca> — articles achetés ailleurs dans le réseau et jamais pris dans mon agence (tous canaux). */
export function getClientArticlesJamaisIci(cc) {
  const res = new Map();
  const net = _S.ventesReseauTousCanaux?.get(cc);
  if (!net) return res;
  const mag = _S.ventesLocalMag12MG?.get(cc);
  const hors = getVentesClientHorsMagFull(cc);
  for (const [code, d] of net) {
    if (mag?.has(code) || hors?.has(code)) continue;
    const ca = d?.sumCA || 0;
    if (ca > 0) res.set(code, ca);
  }
  return res;
}

// ── Ventes hors comptoir d'un client, pleine période ─────────────
// ventesLocalHorsMag est filtré par la période AU PARSING et n'est pas recalculé quand la période
// change : les analyses structurelles client (fiche, familles hors agence) lisent la version pleine
// période. Repli sur la version filtrée pour une session chargée avant son introduction.
export function getVentesClientHorsMagFull(cc) {
  const full = _S.ventesLocalHorsMagFull;
  if (full?.size) return full.get(cc) || null;
  return _S.ventesLocalHorsMag?.get(cc) || null;
}
export function getVentesHorsMagFullMap() {
  return _S.ventesLocalHorsMagFull?.size ? _S.ventesLocalHorsMagFull : (_S.ventesLocalHorsMag || new Map());
}

// ── Capté Legallais : a acheté depuis le 1er janvier (année des dernières données) ──
// Toutes agences du consommé, tous canaux (byMonthStoreClients). Le consommé à jour fait foi
// sur le statut de la chalandise ; la chalandise complète via son « CA 2026 » (cf. isCapteLegallais).
let _boughtYearCache = { src: null, key: '', set: null };
export function getClientsBoughtThisYear() {
  const src = _S._byMonthStoreClients;
  const maxD = _S.consommePeriodMaxFull || _S.consommePeriodMax;
  if (!src || !maxD) return null;
  const y = new Date(maxD).getFullYear();
  const key = String(y);
  if (_boughtYearCache.src === src && _boughtYearCache.key === key) return _boughtYearCache.set;
  const min = y * 12, max = y * 12 + 11;
  const out = new Set();
  for (const store in src) {
    const months = src[store];
    for (const k in months) {
      const m = +k;
      if (m < min || m > max) continue;
      for (const cc of months[k]) out.add(cc);
    }
  }
  _boughtYearCache = { src, key, set: out };
  return out;
}

/** CA consommé de l'année (année des dernières données), toutes agences, par client — Map<cc, CA>. */
let _caYearCache = { src: null, key: '', map: null };
export function getClientCAThisYearMap() {
  const src = _S._byMonthStoreClientCA;
  const maxD = _S.consommePeriodMaxFull || _S.consommePeriodMax;
  if (!src || !maxD) return null;
  const y = new Date(maxD).getFullYear();
  if (_caYearCache.src === src && _caYearCache.key === String(y)) return _caYearCache.map;
  const min = y * 12, max = y * 12 + 11;
  const out = new Map();
  for (const store in src) {
    const months = src[store];
    for (const k in months) {
      const m = +k;
      if (m < min || m > max) continue;
      const byCc = months[k];
      for (const cc in byCc) out.set(cc, (out.get(cc) || 0) + (byCc[cc] || 0));
    }
  }
  _caYearCache = { src, key: String(y), map: out };
  return out;
}

