// © 2026 Jawad El Barkaoui — Tous droits réservés
// PRISME — store.js
// Couche d'accès en lecture seule sur _S (DataStore)
// ─────────────────────────────────────────────────────────────
// Étape 5 — Strangler Fig : les fonctions de rendu migrent
// progressivement de `_S.xxx` vers `DataStore.xxx`.
// Convention :
//   • Getters marqués [CANAL-INVARIANT] → ne changent PAS au filtre canal
//   • Getters marqués [CANAL-DÉRIVÉ]   → dépendent du filtre canal actif
//   • byCanal(canal)                   → point d'entrée unique pour les vues filtrées
//
// NE PAS ÉCRIRE via DataStore — toutes les mutations passent par _S.
// ─────────────────────────────────────────────────────────────
'use strict';

import { _S } from './state.js';

export const DataStore = {

  // ── [CANAL-INVARIANT] Données enrichies stock + MIN/MAX + ABC/FMR ──────────
  // V et W sont calculés sur le consommé filtré par agence, pas par canal.
  // Ne jamais recalculer finalData au changement de canal.
  get finalData()             { return _S.finalData; },
  get filteredData()          { return _S.filteredData; },
  get abcMatrixData()         { return _S.abcMatrixData; },
  get globalJoursOuvres()     { return _S.globalJoursOuvres; },

  // ── [CANAL-INVARIANT] Benchmark (cache Étape 4 — clé sans canal) ──────────
  get benchLists()            { return _S.benchLists; },
  get benchFamEcarts()        { return _S.benchFamEcarts; },

  // ── [CANAL-INVARIANT] Agrégats magasin (source Benchmark, stable) ─────────
  get ventesParMagasin()      { return _S.ventesParMagasin; },
  get storesIntersection()    { return _S.storesIntersection; },
  get selectedMyStore()       { return _S.selectedMyStore; },
  get selectedBenchBassin()   { return _S.selectedBenchBassin; },

  // ── [CANAL-INVARIANT] Territoire (source brute gardée intentionnellement) ──
  // Ne pas filtrer territoireLines ici — passer par byCanal() pour les vues filtrées.
  get territoireLines()       { return _S.territoireLines; },

  // ── [CANAL-INVARIANT] Clients / Chalandise ────────────────────────────────
  // Dualité PDV/hors-agence = feature métier (voir synthèse débat 2026-03-27)
  get ventesClientArticle()   { return _S.ventesClientArticle; },         // MAGASIN/myStore only
  get ventesClientHorsMagasin() { return _S.ventesClientHorsMagasin; },   // canaux hors-MAGASIN
  get chalandiseData()        { return _S.chalandiseData; },
  get chalandiseReady()       { return _S.chalandiseReady; },

  // ── [CANAL-DÉRIVÉ] Statistiques canal agence ──────────────────────────────
  // 5 clés max (MAGASIN|INTERNET|REPRESENTANT|DCS + total), accès O(1).
  get canalAgence()           { return _S.canalAgence; },

  // ── Point d'entrée multi-dimensions (V3.2) ──────────────────────────────
  // Consolide canal + période + commercial en une seule dérivation.
  // Paramètres optionnels : lit _S._globalCanal / _globalPeriodePreset /
  // _selectedCommercial par défaut. Ne modifie JAMAIS finalData.
  byContext({ canal, periode, commercial } = {}) {
    const _canal   = canal      !== undefined ? canal      : (_S._globalCanal        || '');
    const _periode = periode    !== undefined ? periode    : (_S._globalPeriodePreset || '12M');
    const _com     = commercial !== undefined ? commercial : (_S._selectedCommercial  || '');

    // Dimension canal — délègue à byCanal() (terrLines filtré par canal)
    const kpis = this.byCanal(_canal);

    // Dimension commercial — filtre terrLines par-dessus le filtre canal
    const terrLines = _com
      ? kpis.terrLines.filter(l => (l.commercial || '') === _com)
      : kpis.terrLines;

    // Dimension période — indices des mois actifs (pour sparklines / _getFilteredMonths)
    const mois = new Date().getMonth();
    let periodeMonths;
    if      (_periode === '6M')  periodeMonths = Array.from({ length: 6 },       (_, i) => (mois - 5 + i + 12) % 12);
    else if (_periode === 'YTD') periodeMonths = Array.from({ length: mois + 1 }, (_, i) => i);
    else                         periodeMonths = Array.from({ length: 12 },       (_, i) => i);

    return {
      ...kpis,            // canal, canalStats, totalCA, articleFacts, finalData, capabilities
      terrLines,          // override : commercial appliqué par-dessus filtre canal
      periodeMonths,      // indices mois actifs pour sparklines
      activeFilters: {
        canal:   _canal,
        periode: _periode,
        commercial: _com,
      },
      capabilities: {
        ...kpis.capabilities,
        hasCommercial:    !!_com,
        hasPeriodeFilter: _periode !== '12M',
      },
    };
  },

  // ── Méthode de dérivation canal ───────────────────────────────────────────
  // Point d'entrée unique pour les vues filtrées par canal.
  // Délègue à getKPIsByCanal() exposée sur window par main.js (Étape 3).
  byCanal(canal) {
    if (typeof window !== 'undefined' && typeof window.getKPIsByCanal === 'function') {
      return window.getKPIsByCanal(canal);
    }
    // Fallback si appelé avant initialisation main.js (ex: tests unitaires)
    const _c = canal && canal !== 'ALL' ? canal : null;
    const hasTerritoire = _S.territoireLines.length > 0;
    return {
      canal: _c || 'ALL',
      canalStats: _c ? (_S.canalAgence[_c] || { bl: 0, ca: 0, caP: 0, caE: 0 }) : _S.canalAgence,
      totalCA: Object.values(_S.canalAgence).reduce((s, v) => s + (v.ca || 0), 0),
      terrLines: _c ? _S.territoireLines.filter(l => l.canal === _c) : _S.territoireLines,
      articleFacts: !hasTerritoire ? _S.articleCanalCA : null,
      finalData: _S.finalData,
      capabilities: {
        hasTerritoire,
        hasArticleFacts: _S.articleCanalCA.size > 0,
      },
    };
  },
};

// Exposer pour migration progressive depuis l'extérieur et debug console
if (typeof window !== 'undefined') window.DataStore = DataStore;
