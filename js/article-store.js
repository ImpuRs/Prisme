// ═══════════════════════════════════════════════════════════════
// PRISME — article-store.js
// Store article unifié : Map<code, ArticleRecord> pré-calculé
// Agrège TOUTES les métadonnées article dispersées dans _S.
// Source unique — les modules piochent ici au lieu de croiser
// libelleLookup × catalogueFamille × catalogueMarques × finalData.
// Dépend de : state.js
// ═══════════════════════════════════════════════════════════════
'use strict';

import { _S } from './state.js';

/**
 * Construit _S.articleStore = Map<code, ArticleRecord>
 *
 * Sources agrégées (ordre de priorité) :
 *  1. catalogueFamille   → codeFam, codeSousFam, sousFam (libellé)
 *  2. catalogueMarques   → marque
 *  3. catalogueDesignation → libellé catalogue
 *  4. libelleLookup      → libellé consommé
 *  5. articleFamille      → famille (fallback si pas catalogue)
 *  6. articleUnivers      → univers
 *  7. finalData           → statut, emplacement, stock, W, prix, ABC/FMR, sousFamille (libellé stock)
 *  8. articleZoneIndex    → caZone, caAgence, cliZone, contribs
 *  9. ventesParMagasin    → caReseau (nb agences vendant cet article)
 * 10. articleClients      → nbClientsPDV
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

  // ── Index inversé SF : {codeFam+sousFamLibelle} → codeSousFam ──
  // Pour les articles dont le catalogue n'a pas de codeSousFam,
  // on croise la famille + le libellé sousFamille du stock
  const sfLookup = new Map(); // "codeFam|sousFamLibelle" → codeSousFam
  if (_S.catalogueFamille) {
    for (const [, f] of _S.catalogueFamille) {
      if (f.codeFam && f.sousFam && f.codeSousFam) {
        const key = f.codeFam + '|' + f.sousFam.toLowerCase().trim();
        if (!sfLookup.has(key)) sfLookup.set(key, f.codeSousFam);
      }
    }
  }

  // ── Réseau : nb agences par article ──
  const myStore = _S.selectedMyStore;
  const reseauCount = new Map(); // code → nbAgences
  if (_S.ventesParMagasin) {
    for (const [st, arts] of Object.entries(_S.ventesParMagasin)) {
      if (st === myStore) continue;
      for (const [code, data] of Object.entries(arts)) {
        if (data.countBL > 0) reseauCount.set(code, (reseauCount.get(code) || 0) + 1);
      }
    }
  }

  // ── Clients PDV par article ──
  const cliPDVMap = new Map(); // code → nbClients
  if (_S.articleClients?.size && _S.clientsMagasin?.size) {
    for (const [code, clients] of _S.articleClients) {
      let n = 0;
      for (const cc of clients) { if (_S.clientsMagasin.has(cc)) n++; }
      if (n > 0) cliPDVMap.set(code, n);
    }
  }

  // ── Construire les records ──
  for (const code of allCodes) {
    const fd = fdMap.get(code);
    const catFam = _S.catalogueFamille?.get(code);
    const zi = _S.articleZoneIndex?.get(code);

    // Famille
    const codeFam = catFam?.codeFam || _S.articleFamille?.[code] || fd?.famille || '';

    // Sous-famille : catalogue > croisement libellé stock × catalogue > vide
    let codeSousFam = catFam?.codeSousFam || '';
    let sousFamille = catFam?.sousFam || fd?.sousFamille || '';
    if (!codeSousFam && codeFam && sousFamille) {
      // Croisement : on connaît la famille et le libellé SF du stock → retrouver le code
      const key = codeFam + '|' + sousFamille.toLowerCase().trim();
      codeSousFam = sfLookup.get(key) || '';
    }

    store.set(code, {
      code,
      // Identité
      libelle: _S.libelleLookup?.[code] || _S.catalogueDesignation?.get(code) || code,
      marque: _S.catalogueMarques?.get(code) || '',
      // Classement
      codeFam,
      famille: codeFam,
      codeSousFam,
      sousFamille,
      univers: _S.articleUnivers?.[code] || '',
      // Stock & statut
      statut: fd?.statut || '',
      emplacement: fd?.emplacement || '',
      stockActuel: fd?.stockActuel || 0,
      prixUnitaire: fd?.prixUnitaire || 0,
      valeurStock: (fd?.stockActuel || 0) * (fd?.prixUnitaire || 0),
      W: fd?.W || 0,
      V: fd?.V || 0,
      enStock: fd ? (fd.stockActuel || 0) > 0 : false,
      isNouveaute: fd?.isNouveaute || false,
      ageJours: fd?.ageJours ?? null,
      // Classification
      abcClass: fd?.abcClass || '',
      fmrClass: fd?.fmrClass || '',
      // Calibrage
      nouveauMin: fd?.nouveauMin || 0,
      nouveauMax: fd?.nouveauMax || 0,
      ancienMin: fd?.ancienMin || 0,
      ancienMax: fd?.ancienMax || 0,
      couvertureJours: fd?.couvertureJours || 0,
      // Réseau
      nbAgencesReseau: reseauCount.get(code) || 0,
      nbClientsPDV: cliPDVMap.get(code) || 0,
      // Zone (depuis articleZoneIndex)
      caZone: zi?.caZone || 0,
      caAgence: zi?.caAgence || 0,
      cliZone: zi?.clis?.size || 0,
      zoneContribs: zi?.contribs || null, // [{cc, ca, mon}] pour filtre distance
    });
  }

  _S.articleStore = store;
  console.log(`[ArticleStore] ${store.size} articles, ${sfLookup.size} SF mappées en ${(performance.now() - t0).toFixed(0)}ms`);
  return store;
}

// ── Getters rapides (fonctionnent avant ET après build) ──────

/** Libellé article avec fallback catalogue */
export function articleLib(code) {
  if (_S.articleStore?.size) {
    const r = _S.articleStore.get(code);
    if (r) return r.libelle;
  }
  return _S.libelleLookup?.[code] || _S.catalogueDesignation?.get(code) || code;
}

/** Code famille article */
export function articleFam(code) {
  if (_S.articleStore?.size) {
    const r = _S.articleStore.get(code);
    if (r) return r.codeFam;
  }
  return _S.articleFamille?.[code] || _S.catalogueFamille?.get(code)?.codeFam || '';
}

/** Code sous-famille article */
export function articleSousFam(code) {
  if (_S.articleStore?.size) {
    const r = _S.articleStore.get(code);
    if (r) return r.codeSousFam;
  }
  return _S.catalogueFamille?.get(code)?.codeSousFam || '';
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
