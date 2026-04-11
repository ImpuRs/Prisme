// ═══════════════════════════════════════════════════════════════
// PRISME — article-store.js
// Store article unifié : Map<code, ArticleRecord> pré-calculé
// Agrège toutes les métadonnées article dispersées dans _S.
// Getters rapides pour libellé, famille, marque, univers, zone, etc.
// Dépend de : state.js
// ═══════════════════════════════════════════════════════════════
'use strict';

import { _S } from './state.js';

/**
 * Construit _S.articleStore = Map<code, ArticleRecord>
 * Agrège : libelleLookup, catalogueDesignation, articleFamille,
 *          catalogueFamille, catalogueMarques, articleUnivers,
 *          articleZoneIndex, finalData.
 *
 * Lazy-cached dans _S.articleStore. Invalidé par invalidateCache('art').
 * @returns {Map<string, Object>}
 */
export function buildArticleStore() {
  if (_S.articleStore?.size) return _S.articleStore;
  const t0 = performance.now();
  const store = new Map();

  // ── Collecter tous les codes article connus ──
  const allCodes = new Set();
  if (_S.libelleLookup) for (const c of Object.keys(_S.libelleLookup)) allCodes.add(c);
  if (_S.catalogueDesignation) for (const c of _S.catalogueDesignation.keys()) allCodes.add(c);
  if (_S.articleFamille) for (const c of Object.keys(_S.articleFamille)) allCodes.add(c);
  if (_S.catalogueFamille) for (const c of _S.catalogueFamille.keys()) allCodes.add(c);
  if (_S.catalogueMarques) for (const c of _S.catalogueMarques.keys()) allCodes.add(c);
  if (_S.finalData) for (const r of _S.finalData) allCodes.add(r.code);

  // ── Lookup rapide finalData ──
  const fdMap = new Map();
  if (_S.finalData) for (const r of _S.finalData) fdMap.set(r.code, r);

  // ── Construire les records ──
  for (const code of allCodes) {
    const fd = fdMap.get(code);
    const catFam = _S.catalogueFamille?.get(code);
    const zi = _S.articleZoneIndex?.get(code);

    store.set(code, {
      code,
      libelle: _S.libelleLookup?.[code] || _S.catalogueDesignation?.get(code) || code,
      famille: _S.articleFamille?.[code] || catFam?.codeFam || '',
      sousFamille: catFam?.sousFam || '',
      codeSousFam: catFam?.codeSousFam || '',
      univers: _S.articleUnivers?.[code] || '',
      marque: _S.catalogueMarques?.get(code) || '',
      statut: fd?.statut || '',
      emplacement: fd?.emplacement || '',
      abcClass: fd?.abcClass || '',
      fmrClass: fd?.fmrClass || '',
      stockActuel: fd?.stockActuel || 0,
      prixUnitaire: fd?.prixUnitaire || 0,
      W: fd?.W || 0,
      enStock: fd ? (fd.stockActuel || 0) > 0 : false,
      // Zone (depuis articleZoneIndex)
      caZone: zi?.caZone || 0,
      caAgence: zi?.caAgence || 0,
      cliZone: zi?.clis?.size || 0,
      zoneContribs: zi?.contribs || null, // [{cc, ca, mon}] pour filtre distance
    });
  }

  _S.articleStore = store;
  console.log(`[ArticleStore] ${store.size} articles en ${(performance.now() - t0).toFixed(0)}ms`);
  return store;
}

// ── Getters rapides (pas besoin de buildArticleStore complet) ──

/** Libellé article avec fallback catalogue */
export function articleLib(code) {
  // Fast path : store déjà construit
  if (_S.articleStore?.size) {
    const r = _S.articleStore.get(code);
    if (r) return r.libelle;
  }
  // Fallback direct (avant construction du store)
  return _S.libelleLookup?.[code] || _S.catalogueDesignation?.get(code) || code;
}

/** Famille article */
export function articleFam(code) {
  if (_S.articleStore?.size) {
    const r = _S.articleStore.get(code);
    if (r) return r.famille;
  }
  return _S.articleFamille?.[code] || _S.catalogueFamille?.get(code)?.codeFam || '';
}

/** Marque article */
export function articleMarque(code) {
  if (_S.articleStore?.size) {
    const r = _S.articleStore.get(code);
    if (r) return r.marque;
  }
  return _S.catalogueMarques?.get(code) || '';
}

/** Record complet (retourne undefined si pas trouvé) */
export function articleGet(code) {
  if (_S.articleStore?.size) return _S.articleStore.get(code);
  return undefined;
}

/**
 * CA Zone / Cli Zone filtré par distance.
 * Utilise articleZoneIndex.contribs pour re-filtrer sans tout rescanner.
 * @param {string} code
 * @param {function} distOkFn — (cc) => boolean, filtre distance
 * @returns {{caZone: number, caAgence: number, cliZone: number}}
 */
export function articleZoneFiltered(code, distOkFn) {
  const zi = _S.articleZoneIndex?.get(code);
  if (!zi?.contribs) return { caZone: 0, caAgence: 0, cliZone: 0 };
  if (!distOkFn) return { caZone: zi.caZone, caAgence: zi.caAgence, cliZone: zi.clis.size };
  let caZone = 0, caAgence = 0;
  const clis = new Set();
  for (const c of zi.contribs) {
    if (!distOkFn(c.cc)) continue;
    caZone += c.ca;
    caAgence += c.mon;
    clis.add(c.cc);
  }
  return { caZone, caAgence, cliZone: clis.size };
}
