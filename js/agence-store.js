// ═══════════════════════════════════════════════════════════════
// PRISME — agence-store.js
// Store agence unifié : Map<storeCode, AgenceRecord> pré-calculé
// Agrège toutes les sources par agence en un objet plat.
// Supporte le filtre canal et le mode magasin (prélevé/enlevé).
// Dépend de : state.js
// ═══════════════════════════════════════════════════════════════
'use strict';

import { _S } from './state.js';

/**
 * Construit _S.agenceStore = Map<storeCode, AgenceRecord> à partir de
 * _byMonthStoreArtCanal (période-filtrée) ou ventesParAgence (fallback).
 *
 * @param {Object} [opts]
 * @param {Set<string>}  [opts.canaux]       — canaux à inclure (vide = tous)
 * @param {string}       [opts.magasinMode]  — 'all'|'preleve'|'enleve' (défaut: 'all')
 * @param {string}       [opts.univers]      — filtre univers article
 * @param {Set<string>}  [opts.stores]       — sous-ensemble de stores (défaut: storesIntersection)
 * @returns {Map<string, Object>}
 */
export function getAgenceStoreKey(opts = {}) {
  const canaux = opts.canaux instanceof Set ? opts.canaux : new Set();
  const magMode = opts.magasinMode || 'all';
  const univFilter = opts.univers || '';
  const storesSet = opts.stores || _S.storesIntersection;
  const pStart = _S.periodFilterStart;
  const pEnd = _S.periodFilterEnd;
  const startIdx = pStart ? (pStart.getFullYear() * 12 + pStart.getMonth()) : 0;
  const endIdx = pEnd ? (pEnd.getFullYear() * 12 + pEnd.getMonth()) : 999999;
  const storesKey = storesSet?.size ? [...storesSet].sort().join(',') : '';
  const canauxKey = canaux.size ? [...canaux].sort().join(',') : '*';
  const sourceKey = _S._byMonthStoreArtCanal ? 'bmsac' : 'vpm';
  return [
    storesKey,
    canauxKey,
    magMode,
    univFilter,
    startIdx,
    endIdx,
    sourceKey,
    _S.storeCountConsomme || Object.keys(_S.ventesParAgence || {}).length || 0,
    _S.finalData?.length || 0,
  ].join('|');
}

export function buildAgenceStore(opts = {}) {
  const t0 = performance.now();
  const store = new Map();

  const canaux      = opts.canaux instanceof Set ? opts.canaux : new Set();
  const magMode     = opts.magasinMode || 'all';
  const univFilter  = opts.univers || '';
  const storesSet   = opts.stores || _S.storesIntersection;
  const storeKey    = getAgenceStoreKey(opts);

  if (!storesSet?.size) { _S.agenceStore = store; _S._agenceStoreKey = storeKey; return store; }

  // ── Bornes période ──
  const pStart  = _S.periodFilterStart;
  const pEnd    = _S.periodFilterEnd;
  const hasPeriod = !!(pStart || pEnd);
  const startIdx  = pStart ? (pStart.getFullYear() * 12 + pStart.getMonth()) : 0;
  const endIdx    = pEnd   ? (pEnd.getFullYear() * 12   + pEnd.getMonth())   : 999999;

  const bmsac = _S._byMonthStoreArtCanal;
  const useAllCanaux = !canaux.size;

  // ── Comptage articles bassin (union de tous les codes 6 chiffres) ──
  const bassinArticles = new Set();

  // ── Phase 1 : agréger par agence ──
  for (const agCode of storesSet) {
    const rec = {
      code: agCode,
      isMyStore: agCode === _S.selectedMyStore,
      // KPIs globaux
      ca: 0, caPrelevee: 0, vmb: 0, txMarge: null,
      refs: 0, freq: 0, serv: 0, freqClient: 0, nbCommandes: 0,
      // Clients
      nbClients: 0, clientsZone: 0,
      // Benchmark (rempli phase 2)
      pdmBassin: 0, ranking: 0,
      // Données article période-filtrées
      artMap: {},
      // Stock (référence directe)
      stockMap: _S.stockParMagasin?.[agCode] || null,
    };

    // ── Construire artMap filtré par période + canal ──
    if (hasPeriod && bmsac?.[agCode]) {
      const storeCanalMap = bmsac[agCode];
      const artMap = {};
      const canalKeys = useAllCanaux ? Object.keys(storeCanalMap) : [...canaux];
      for (const canal of canalKeys) {
        const codeMap = storeCanalMap[canal];
        if (!codeMap) continue;
        for (const code in codeMap) {
          if (univFilter && _S.articleUnivers[code] !== univFilter) continue;
          const months = codeMap[code];
          let sumCA = 0, sumPrel = 0, countBL = 0, sumVMB = 0, sumQteP = 0;
          for (const midxStr in months) {
            const midx = +midxStr;
            if (midx < startIdx || midx > endIdx) continue;
            const d = months[midxStr];
            sumCA   += d.sumCA || 0;
            sumPrel += d.sumPrelevee || 0;
            countBL += d.countBL || 0;
            sumVMB  += d.sumVMB || 0;
            sumQteP += d.sumQteP || 0;
          }
          if (!countBL && !sumCA) continue;
          // Mode magasin : ajuster CA selon prélevé/enlevé
          let lineCA = sumCA, lineVMB = sumVMB;
          if (canal === 'MAGASIN' && magMode === 'preleve') {
            lineCA = sumPrel; lineVMB = sumVMB; // sumVMB already mixed, approx
          } else if (canal === 'MAGASIN' && magMode === 'enleve') {
            lineCA = sumCA - sumPrel;
          }
          if (!artMap[code]) artMap[code] = { sumCA: 0, sumPrelevee: 0, countBL: 0, sumVMB: 0, sumQteP: 0 };
          artMap[code].sumCA       += lineCA;
          artMap[code].sumPrelevee += sumPrel;
          artMap[code].countBL     += countBL;
          artMap[code].sumVMB      += lineVMB;
          artMap[code].sumQteP     += sumQteP;
        }
      }
      rec.artMap = artMap;
    } else if (!hasPeriod && canaux.size && bmsac?.[agCode]) {
      // Pas de filtre période mais filtre canal → agréger tous les mois pour les canaux demandés
      const storeCanalMap = bmsac[agCode];
      const artMap = {};
      for (const canal of canaux) {
        const codeMap = storeCanalMap[canal];
        if (!codeMap) continue;
        for (const code in codeMap) {
          if (univFilter && _S.articleUnivers[code] !== univFilter) continue;
          const months = codeMap[code];
          let sumCA = 0, sumPrel = 0, countBL = 0, sumVMB = 0, sumQteP = 0;
          for (const midxStr in months) {
            const d = months[midxStr];
            sumCA   += d.sumCA || 0;
            sumPrel += d.sumPrelevee || 0;
            countBL += d.countBL || 0;
            sumVMB  += d.sumVMB || 0;
            sumQteP += d.sumQteP || 0;
          }
          if (!countBL && !sumCA) continue;
          let lineCA = sumCA, lineVMB = sumVMB;
          if (canal === 'MAGASIN' && magMode === 'preleve') { lineCA = sumPrel; }
          else if (canal === 'MAGASIN' && magMode === 'enleve') { lineCA = sumCA - sumPrel; }
          if (!artMap[code]) artMap[code] = { sumCA: 0, sumPrelevee: 0, countBL: 0, sumVMB: 0, sumQteP: 0 };
          artMap[code].sumCA       += lineCA;
          artMap[code].sumPrelevee += sumPrel;
          artMap[code].countBL     += countBL;
          artMap[code].sumVMB      += lineVMB;
          artMap[code].sumQteP     += sumQteP;
        }
      }
      rec.artMap = artMap;
    } else {
      // Fallback : ventesParAgence (pleine période, tous canaux)
      rec.artMap = _S.ventesParAgence?.[agCode] || {};
    }

    // ── Agréger KPIs depuis artMap ──
    let totalCA = 0, totalPrel = 0, totalVMB = 0, totalBL = 0, activeRefs = 0;
    for (const code in rec.artMap) {
      const d = rec.artMap[code];
      const ca = d.sumCA || 0;
      totalCA   += ca;
      totalPrel += d.sumPrelevee || 0;
      totalVMB  += d.sumVMB || 0;
      totalBL   += d.countBL || 0;
      // Refs & bassin : uniquement articles stockables (6 chiffres)
      if (/^\d{6}$/.test(code)) {
        if (ca > 0) activeRefs++;
        bassinArticles.add(code);
      }
    }
    rec.ca          = totalCA;
    rec.caPrelevee  = totalPrel;
    rec.vmb         = totalVMB;
    rec.txMarge     = totalCA > 0 ? Math.round(totalVMB / totalCA * 10000) / 100 : null;
    rec.refs        = activeRefs;
    rec.freq        = totalBL;

    // ── Clients (period-aware via byMonthStoreClients) ──
    const bmsc = _S._byMonthStoreClients?.[agCode];
    let clients;
    if (bmsc && hasPeriod) {
      // Collecter les clients uniques sur les mois de la période
      const periodClients = new Set();
      for (const midxStr in bmsc) {
        const midx = +midxStr;
        if (midx < startIdx || midx > endIdx) continue;
        for (const cc of bmsc[midxStr]) periodClients.add(cc);
      }
      clients = periodClients;
    } else if (bmsc) {
      // Pas de filtre période — tous les mois
      const allClients = new Set();
      for (const midxStr in bmsc) for (const cc of bmsc[midxStr]) allClients.add(cc);
      clients = allClients;
    } else {
      clients = _S.ventesClientsPerStore?.[agCode];
    }
    if (clients) {
      rec.nbClients = clients instanceof Set ? clients.size : (Array.isArray(clients) ? clients.length : 0);
      if (_S.chalandiseData?.size) {
        let cz = 0;
        const iter = clients instanceof Set ? clients : (Array.isArray(clients) ? clients : []);
        for (const cc of iter) { if (_S.chalandiseData.has(cc)) cz++; }
        rec.clientsZone = cz;
      }
    }
    rec.freqClient = rec.nbClients > 0 ? parseFloat((rec.freq / rec.nbClients).toFixed(1)) : 0;
    rec.caClient   = rec.nbClients > 0 ? Math.round(rec.ca / rec.nbClients) : 0;

    // ── Commandes uniques (N° commande distincts) ──
    const cpsc = _S.commandesPerStoreCanal?.[agCode];
    if (cpsc) {
      if (useAllCanaux) {
        // Tous canaux — union des Sets pour dédupliquer cross-canal
        const allCmds = new Set();
        for (const c in cpsc) { for (const nc of cpsc[c]) allCmds.add(nc); }
        rec.nbCommandes = allCmds.size;
      } else {
        // Canaux filtrés — union des Sets des canaux sélectionnés
        const filtCmds = new Set();
        for (const c of canaux) { if (cpsc[c]) for (const nc of cpsc[c]) filtCmds.add(nc); }
        rec.nbCommandes = filtCmds.size;
      }
    }

    store.set(agCode, rec);
  }

  // ── Phase 2 : métriques bassin (pdm, ranking, serv, médiane) ──
  const totalBassinCA = [...store.values()].reduce((s, r) => s + r.ca, 0);
  const totalBassinArts = bassinArticles.size || 1;
  const sorted = [...store.values()].sort((a, b) => b.ca - a.ca);

  for (let i = 0; i < sorted.length; i++) {
    const r = sorted[i];
    r.pdmBassin = totalBassinCA > 0 ? Math.round(r.ca / totalBassinCA * 1000) / 10 : 0;
    r.serv = Math.round(r.refs / totalBassinArts * 100);
    r.ranking = i + 1;
  }

  _S.agenceStore = store;
  _S._agenceStoreKey = storeKey;
  _S._agenceStoreBassinArts = totalBassinArts;
  console.log(`[AgenceStore] ${store.size} agences, ${canaux.size ? [...canaux].join('+') : 'tous canaux'}, build in ${(performance.now() - t0).toFixed(1)}ms`);
  return store;
}

/**
 * Récupère une agence par code. O(1).
 */
export function getAgence(code) {
  if (!_S.agenceStore?.size && _hasAgenceSources()) buildAgenceStore();
  return _S.agenceStore?.get(code);
}

/**
 * Raccourci pour l'agence sélectionnée (myStore).
 */
export function getMyAgence() {
  return getAgence(_S.selectedMyStore);
}

/**
 * Filtre les agences avec un prédicat.
 */
export function filterAgences(predicate) {
  if (!_S.agenceStore?.size && _hasAgenceSources()) buildAgenceStore();
  const result = [];
  for (const rec of (_S.agenceStore || new Map()).values()) {
    if (predicate(rec)) result.push(rec);
  }
  return result;
}

/**
 * Stats globales du bassin.
 */
export function getBassinStats() {
  if (!_S.agenceStore?.size && _hasAgenceSources()) buildAgenceStore();
  const recs = [...(_S.agenceStore || new Map()).values()];
  const cas = recs.map(r => r.ca).filter(v => v > 0).sort((a, b) => a - b);
  const mid = Math.floor(cas.length / 2);
  return {
    totalCA:    recs.reduce((s, r) => s + r.ca, 0),
    totalRefs:  recs.reduce((s, r) => s + r.refs, 0),
    totalFreq:  recs.reduce((s, r) => s + r.freq, 0),
    storeCount: recs.length,
    medianCA:   cas.length % 2 ? cas[mid] : ((cas[mid - 1] || 0) + (cas[mid] || 0)) / 2,
  };
}

/**
 * Médiane d'un tableau de nombres.
 */
export function agenceMedian(arr) {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** @returns {boolean} true si au moins une source agence est peuplée */
function _hasAgenceSources() {
  return !!(_S.storesIntersection?.size && (
    Object.keys(_S.ventesParAgence || {}).length ||
    Object.keys(_S._byMonthStoreArtCanal || {}).length
  ));
}
