// © 2026 Jawad El Barkaoui — Tous droits réservés
// PRISME — pepites.js
// Pépites réseau : les spécialités d'une agence (CA comptoir ≥ 2× la médiane
// des agences qui vendent l'article) et ses exclusifs (vendus nulle part ailleurs).
// Affiché dans le Duel agence pour l'agence comparée (ex-sous-onglet d'Animation).
// ═══════════════════════════════════════════════════════════════
'use strict';

import { _S } from './state.js';
import { famLib } from './utils.js';

/** CA comptoir (MAGASIN prélevé) par agence × article, sur la période active. */
function _storeCAComptoir() {
  const bmsac = _S._byMonthStoreArtCanal;
  const pStart = _S.periodFilterStart, pEnd = _S.periodFilterEnd;
  const result = {};
  if (!bmsac) {
    const vbc = _S.ventesParAgenceByCanal || {};
    for (const store in vbc) {
      result[store] = {};
      const magMap = vbc[store]?.MAGASIN;
      if (!magMap) continue;
      for (const code in magMap) {
        if (!/^\d{6}$/.test(code)) continue;
        const d = magMap[code];
        if (d.sumPrelevee) result[store][code] = { ca: d.sumPrelevee, bl: d.countBL || 0 };
      }
    }
    return { data: result, filtered: false };
  }
  const startIdx = pStart ? pStart.getFullYear() * 12 + pStart.getMonth() : 0;
  const endIdx = pEnd ? pEnd.getFullYear() * 12 + pEnd.getMonth() : 999999;
  for (const store in bmsac) {
    result[store] = {};
    const codeMap = bmsac[store]?.MAGASIN;
    if (!codeMap) continue;
    for (const code in codeMap) {
      if (!/^\d{6}$/.test(code)) continue;
      let ca = 0, bl = 0;
      for (const k in codeMap[code]) {
        const m = +k;
        if (m < startIdx || m > endIdx) continue;
        ca += codeMap[code][k].sumPrelevee || 0;
        bl += codeMap[code][k].countBL || 0;
      }
      if (ca) result[store][code] = { ca, bl };
    }
  }
  return { data: result, filtered: !!(pStart || pEnd) };
}

/**
 * Pépites d'une agence `store`, vues depuis `myStore`.
 * @returns {{specialites:Array, exclusifs:Array, filtered:boolean}|null}
 *   specialites : [{code, lib, fam, caStore, blStore, median, ratio, ecart, caMe}] triés par écart
 *   exclusifs   : [{code, lib, fam, caStore, blStore, caMe:0}] (CA > 50 €)
 */
export function computePepitesStore(store, myStore) {
  const { data, filtered } = _storeCAComptoir();
  const stores = Object.keys(data);
  if (!data[store] || stores.length < 2) return null;
  const artFam = _S.articleFamille || {};
  const catFam = _S.catalogueFamille;
  const lib = code => { const r = _S.libelleLookup?.[code] || code; return /^\d{6} - /.test(r) ? r.substring(9).trim() : r; };
  const fam = code => { const cf = catFam?.get(code)?.codeFam || artFam[code] || ''; return famLib(cf) || cf; };

  const specialites = [], exclusifs = [];
  for (const [code, d] of Object.entries(data[store])) {
    if (d.ca <= 10) continue;
    const cas = [];
    for (const s of stores) { const v = data[s][code]?.ca || 0; if (v > 0) cas.push(v); }
    const caMe = data[myStore]?.[code]?.ca || 0;
    if (cas.length === 1) {
      if (d.ca > 50) exclusifs.push({ code, lib: lib(code), fam: fam(code), caStore: d.ca, blStore: d.bl, caMe: 0 });
      continue;
    }
    cas.sort((a, b) => a - b);
    const n = cas.length;
    const med = n % 2 ? cas[(n - 1) / 2] : (cas[n / 2 - 1] + cas[n / 2]) / 2;
    if (med <= 0 || d.ca / med < 2) continue;
    specialites.push({ code, lib: lib(code), fam: fam(code), caStore: d.ca, blStore: d.bl, median: Math.round(med),
      ratio: Math.round(d.ca / med * 10) / 10, ecart: Math.round(d.ca - med), caMe });
  }
  specialites.sort((a, b) => b.ecart - a.ecart);
  exclusifs.sort((a, b) => b.caStore - a.caStore);
  return { specialites, exclusifs, filtered };
}
