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
 *  9. ventesParAgence    → caReseau (nb agences vendant cet article)
 * 10. articleClients      → nbClientsPDV
 *
 * Lazy-cached dans _S.articleStore. Invalidé par invalidateCache('art').
 * @returns {Map<string, Object>}
 */
// ── Getters rapides (fonctionnent avant ET après build) ──────

/** Libellé article avec fallback catalogue */
export function articleLib(code) {
  if (_S.articleStore?.size) {
    const r = _S.articleStore.get(code);
    if (r) return r.libelle;
  }
  return _S.libelleLookup?.[code] || _S.catalogueDesignation?.get(code) || code;
}

// articleFam, articleSousFam, articleMarque, articleGet — dead code supprimé.
// Le code accède directement _S.articleFamille, _S.catalogueFamille, _S.catalogueMarques.

