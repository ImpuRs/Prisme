// ═══════════════════════════════════════════════════════════════
// PRISME — client-store.js
// Store client unifié : Map<cc, ClientRecord> pré-calculé
// Agrège toutes les sources éparses de _S en un objet plat par client.
// Dépend de : state.js
// ═══════════════════════════════════════════════════════════════
'use strict';

import { _S } from './state.js';
import { getClientsActiveSetInPeriod, getVentesHorsMagFullMap, getClientCAThisYearMap, currentYearMonthRange } from './sales.js';

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
    if (_S.ventesLocalMagPeriode) for (const cc of _S.ventesLocalMagPeriode.keys()) allCc.add(cc);
    if (getVentesHorsMagFullMap()) for (const cc of getVentesHorsMagFullMap().keys()) allCc.add(cc);
    if (_S.chalandiseData) for (const cc of _S.chalandiseData.keys()) allCc.add(cc);
    if (_S.clientLastOrder) for (const cc of _S.clientLastOrder.keys()) allCc.add(cc);
    if (_S.clientLastOrderAll) for (const cc of _S.clientLastOrderAll.keys()) allCc.add(cc);
    if (_S.clientsMagasin) for (const cc of _S.clientsMagasin) allCc.add(cc);
    if (_S._clientsTousCanaux instanceof Set) for (const cc of _S._clientsTousCanaux) allCc.add(cc);
    if (_S.forcageCommercial?.size) for (const cc of _S.forcageCommercial.keys()) allCc.add(cc);

    for (const cc of allCc) {
      const forcedCom = _S.forcageCommercial?.get(cc) || '';
      const chalInfo = _S.chalandiseData?.get(cc);
      const allOrder = _S.clientLastOrderAll?.get(cc);
      const lastPDV = _S.clientLastOrder?.get(cc) || null;
      const byCanal = _S.clientLastOrderByCanal?.get(cc) || null;
      const omni = _S.clientOmniScore?.get(cc);

      // Hors-MAGASIN agrégats
      const horArts = getVentesHorsMagFullMap().get(cc);
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
        inChalandise: !!chalInfo || !!forcedCom,
        metier: chalInfo?.metier || '',
        commercial: forcedCom || chalInfo?.commercial || '',
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
        caLegallaisN1: chalInfo?.ca2025 || 0,
        caPDVNChal: chalInfo?.caPDVN || 0,
        ca2026: chalInfo?.ca2026 || 0,
        // Hors-MAGASIN (agrégats legacy : period-filtered au parse, et parfois figés au refilter depuis IDB)
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
        isPDVActif: false, silenceDaysPDV: null, caTotal: 0, caAutresAgences: 0,
        artMapPDV: null,                  // Map<code, {sumCA, sumPrelevee, ...}> MAGASIN
      };

      store.set(cc, rec);
    }
  }

  // ── PDV agrégats (period-dependent, toujours recalculés) ──
  const _pdvActiveSet = getClientsActiveSetInPeriod(''); // tous canaux, période courante (si byMonthClients dispo)
  for (const [cc, rec] of store) {
    const pdvArts = _S.ventesLocalMagPeriode?.get(cc) || null;
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
    // "PDV actif" = a acheté chez nous sur la période (tous canaux).
    // Source de vérité : byMonthClients (via getClientsActiveSetInPeriod), sinon fallback sur agrégats legacy.
    rec.isPDVActif = _pdvActiveSet ? _pdvActiveSet.has(cc) : (caPDV > 0 || (rec.caHors || 0) > 0);
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

  // ── CA MAGASIN dans d'autres agences (depuis le Consommé multi-agences) ──
  if (_S.ventesClientAutresAgences?.size) {
    for (const [cc, caAutres] of _S.ventesClientAutresAgences) {
      const rec = store.get(cc);
      if (rec) {
        rec.caAutresAgences = caAutres;
        rec.caTotal += caAutres;
      }
    }
  }

  // ── CA Legallais de l'année : le consommé à jour fait foi sur la chalandise ──
  // ca2026 (chalandise) relevé au CA consommé DE L'ANNÉE, toutes agences (_byMonthStoreClientCA).
  // Valeur d'origine gardée dans _ca2026Chal ; on repart toujours d'elle (idempotent).
  // Avant oct. 2026 on comparait au CA 12 mois glissants : des ventes 2025 gonflaient le « CA 2026 ».
  const _caYear = getClientCAThisYearMap();
  if (_S.chalandiseData?.size) {
    for (const [cc, info] of _S.chalandiseData) {
      if (info._ca2026Chal == null) info._ca2026Chal = info.ca2026 || 0;
      const caY = _caYear ? (_caYear.get(cc) || 0) : 0;
      info.ca2026 = Math.max(info._ca2026Chal, caY);
      const rec = store.get(cc);
      if (rec) rec.ca2026 = info.ca2026;
    }
  }

  // ── Activité PDV recalculée avec le consommé à date (règle user oct. 2026) ──
  // La chalandise (export Qlik ponctuel) peut dire « Inactif PDV Zone 2026 » pour un client revenu
  // depuis : le consommé de l'agence fait foi. Actif = achat dans l'agence (tous canaux) cette année.
  // Libellés identiques à ceux de Qlik pour que le filtre « Activité PDV » reste le même.
  const _yr = currentYearMonthRange();
  if (_yr && _S.chalandiseData?.size) {
    const _pdvY = getClientsActiveSetInPeriod('', { range: { min: _yr.min, max: _yr.max } });
    const _pdvY1 = getClientsActiveSetInPeriod('', { range: { min: _yr.min - 12, max: _yr.max - 12 } });
    if (_pdvY) {
      const y = _yr.year, y1 = y - 1;
      for (const [cc, info] of _S.chalandiseData) {
        if (info._activitePDVChal == null) info._activitePDVChal = info.activitePDV || '';
        info.activitePDV = _pdvY.has(cc) ? `Actif PDV Zone ${y}`
          : (_pdvY1?.has(cc) ? `Inactif PDV Zone ${y}` : `Inactif PDV Zone ${y}/${y1}`);
        const rec = store.get(cc);
        if (rec) rec.activitePDV = info.activitePDV;
      }
      _S._chalandiseRev = (_S._chalandiseRev || 0) + 1; // invalide les caches Conquête
    }
  }

  // ── pdvOnly : ajouter les nouveaux clients absents du store ──
  if (pdvOnly && _S.ventesLocalMagPeriode) {
    for (const cc of _S.ventesLocalMagPeriode.keys()) {
      if (!store.has(cc)) {
        // Nouveau client apparu après refilter — full build pour lui
        buildClientStore(); // rebuild complet, sort de la boucle
        return _S.clientStore;
      }
    }
  }
  // Même logique, mais pour les clients "PDV actifs tous canaux" (ex: REPRESENTANT-only).
  if (pdvOnly && _pdvActiveSet && _pdvActiveSet.size) {
    for (const cc of _pdvActiveSet) {
      if (!store.has(cc)) {
        buildClientStore();
        return _S.clientStore;
      }
    }
  }

  _S.clientStore = store;
  console.log(`[ClientStore] ${store.size} clients, ${pdvOnly ? 'pdvOnly' : 'full'} build in ${(performance.now() - t0).toFixed(1)}ms`);
  return store;
}

