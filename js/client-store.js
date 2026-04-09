// ═══════════════════════════════════════════════════════════════
// PRISME — client-store.js
// Store client unifié : Map<cc, ClientRecord> pré-calculé
// Agrège toutes les sources éparses de _S en un objet plat par client.
// Dépend de : state.js
// ═══════════════════════════════════════════════════════════════
'use strict';

import { _S } from './state.js';

/**
 * Construit _S.clientStore = Map<cc, ClientRecord> à partir de toutes les
 * sources client dispersées dans _S.
 *
 * @param {Object} [opts]
 * @param {boolean} [opts.pdvOnly=false] — Si true, ne recalcule que les champs
 *   dépendants de la période (caPDV, nbBL, silenceDaysPDV…). Optimisation
 *   pour le refilter période.
 * @returns {Map<string, Object>}
 */
export function buildClientStore({ pdvOnly = false } = {}) {
  const t0 = performance.now();
  const now = new Date();
  const store = pdvOnly ? (_S.clientStore || new Map()) : new Map();
  const _minC = _S.consommePeriodMinFull || _S.consommePeriodMin;

  // ── Univers de tous les codes client connus ──
  if (!pdvOnly) {
    const allCc = new Set();
    if (_S.ventesClientArticle) for (const cc of _S.ventesClientArticle.keys()) allCc.add(cc);
    if (_S.ventesClientHorsMagasin) for (const cc of _S.ventesClientHorsMagasin.keys()) allCc.add(cc);
    if (_S.chalandiseData) for (const cc of _S.chalandiseData.keys()) allCc.add(cc);
    if (_S.clientLastOrder) for (const cc of _S.clientLastOrder.keys()) allCc.add(cc);
    if (_S.clientLastOrderAll) for (const cc of _S.clientLastOrderAll.keys()) allCc.add(cc);
    if (_S.clientsMagasin) for (const cc of _S.clientsMagasin) allCc.add(cc);

    for (const cc of allCc) {
      const chalInfo = _S.chalandiseData?.get(cc);
      const allOrder = _S.clientLastOrderAll?.get(cc);
      const lastPDV = _S.clientLastOrder?.get(cc) || null;
      const byCanal = _S.clientLastOrderByCanal?.get(cc) || null;
      const omni = _S.clientOmniScore?.get(cc);

      // Hors-MAGASIN agrégats
      const horArts = _S.ventesClientHorsMagasin?.get(cc);
      let caHors = 0;
      const canaux = new Set();
      if (horArts) {
        for (const d of horArts.values()) {
          caHors += d.sumCA || 0;
          if (d.canal) canaux.add(d.canal);
        }
      }

      // Cross status
      let crossStatus = null;
      if (_S.crossingStats) {
        if (_S.crossingStats.captes?.has(cc)) crossStatus = 'capte';
        else if (_S.crossingStats.fideles?.has(cc)) crossStatus = 'fidele';
        else if (_S.crossingStats.potentiels?.has(cc)) crossStatus = 'potentiel';
      }

      const rec = {
        cc,
        nom: chalInfo?.nom || _S.clientNomLookup?.[cc] || cc,
        // Chalandise
        inChalandise: !!chalInfo,
        metier: chalInfo?.metier || '',
        commercial: chalInfo?.commercial || '',
        classification: chalInfo?.classification || '',
        statut: chalInfo?.statut || '',
        activite: chalInfo?.activite || '',
        activitePDV: chalInfo?.activitePDV || '',
        activiteGlobale: chalInfo?.activiteGlobale || '',
        secteur: chalInfo?.secteur || '',
        cp: chalInfo?.cp || '',
        ville: chalInfo?.ville || '',
        distanceKm: chalInfo?.distanceKm ?? null,
        dept: (chalInfo?.cp || '').slice(0, 2),
        caLegallais: chalInfo?.ca2025 || 0,
        caPDVNChal: chalInfo?.caPDVN || 0,
        ca2026: chalInfo?.ca2026 || 0,
        // Hors-MAGASIN (period-invariant)
        caHors,
        canaux,
        // Récence
        lastOrderPDV: lastPDV,
        lastOrderAll: allOrder?.date || null,
        lastOrderCanal: allOrder?.canal || null,
        lastOrderByCanal: byCanal,
        // Omni
        omniSegment: omni?.segment || null,
        omniScore: omni?.score || 0,
        // Cross
        crossStatus,
        // Détail articles (références directes — zéro copie)
        artMapHors: horArts || null,      // Map<code, {sumCA, canal, ...}> hors-MAGASIN
        articles: _S.clientArticles?.get(cc) || null, // Set<code> tous articles achetés
        // PDV — remplis ci-dessous
        caPDV: 0, caPDVPrelevee: 0, nbArticlesPDV: 0, nbBLPDV: 0,
        isPDVActif: false, silenceDaysPDV: null, caTotal: 0,
        artMapPDV: null,                  // Map<code, {sumCA, sumPrelevee, ...}> MAGASIN
      };

      store.set(cc, rec);
    }
  }

  // ── PDV agrégats (period-dependent, toujours recalculés) ──
  for (const [cc, rec] of store) {
    const pdvArts = _S.ventesClientArticle?.get(cc) || null;
    rec.artMapPDV = pdvArts; // référence directe, mise à jour au refilter
    let caPDV = 0, caPDVPrel = 0, nbArts = 0;
    if (pdvArts) {
      for (const d of pdvArts.values()) {
        caPDV += d.sumCA || 0;
        caPDVPrel += d.sumCAPrelevee || 0;
      }
      nbArts = pdvArts.size;
    }
    rec.caPDV = caPDV;
    rec.caPDVPrelevee = caPDVPrel;
    rec.nbArticlesPDV = nbArts;
    rec.nbBLPDV = _S.clientsMagasinFreq?.get(cc) || 0;
    rec.isPDVActif = caPDV > 0;
    // silenceDaysPDV
    const lastPDV = rec.lastOrderPDV;
    const lastValid = lastPDV && (!_minC || lastPDV >= _minC);
    rec.silenceDaysPDV = lastValid ? Math.round((now - lastPDV) / 86400000) : null;
    // silenceDays tous canaux (fallback quand pas de PDV)
    const lastAll = rec.lastOrderAll;
    const lastAllValid = lastAll && (!_minC || lastAll >= _minC);
    rec.silenceDaysAll = lastAllValid ? Math.round((now - lastAll) / 86400000) : null;
    rec.caTotal = caPDV + (rec.caHors || 0);
    if (caPDV > 0 && rec.canaux) rec.canaux.add('MAGASIN');
  }

  // ── pdvOnly : ajouter les nouveaux clients absents du store ──
  if (pdvOnly && _S.ventesClientArticle) {
    for (const cc of _S.ventesClientArticle.keys()) {
      if (!store.has(cc)) {
        // Nouveau client apparu après refilter — full build pour lui
        buildClientStore(); // rebuild complet, sort de la boucle
        return _S.clientStore;
      }
    }
  }

  _S.clientStore = store;
  console.log(`[ClientStore] ${store.size} clients, ${pdvOnly ? 'pdvOnly' : 'full'} build in ${(performance.now() - t0).toFixed(1)}ms`);
  return store;
}

/**
 * Récupère un client par code. O(1).
 * @param {string} cc
 * @returns {Object|undefined}
 */
export function getClient(cc) {
  if (!_S.clientStore?.size && _hasClientSources()) buildClientStore();
  return _S.clientStore?.get(cc);
}

/** @returns {boolean} true si au moins une source client est peuplée */
function _hasClientSources() {
  return !!(_S.ventesClientArticle?.size || _S.ventesClientHorsMagasin?.size
    || _S.chalandiseData?.size || _S.clientLastOrder?.size || _S.clientsMagasin?.size);
}

/**
 * Filtre le clientStore avec un prédicat.
 * @param {function(Object): boolean} predicate
 * @returns {Object[]}
 */
export function filterClients(predicate) {
  const result = [];
  if (!_S.clientStore?.size) { if (_hasClientSources()) buildClientStore(); else return result; }
  for (const rec of _S.clientStore.values()) {
    if (predicate(rec)) result.push(rec);
  }
  return result;
}

/**
 * Groupe le clientStore par clé extraite.
 * @param {function(Object): string} keyFn
 * @returns {Map<string, Object[]>}
 */
export function groupClientsBy(keyFn) {
  const groups = new Map();
  if (!_S.clientStore?.size) { if (_hasClientSources()) buildClientStore(); else return groups; }
  for (const rec of _S.clientStore.values()) {
    const key = keyFn(rec);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(rec);
  }
  return groups;
}
