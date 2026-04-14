// ═══════════════════════════════════════════════════════════════
// PRISME — chalandise-store.js
// Helpers centralisés autour de _S.chalandiseData (+ table de forçage)
// Dépend de : state.js, utils.js
// ═══════════════════════════════════════════════════════════════
'use strict';

import { _S } from './state.js';
import { extractClientCode } from './utils.js';

function _chalInfoScore(info) {
  if (!info) return 0;
  let s = 0;
  if (info.metier) s++;
  if (info.cp) s++;
  if (info.ville) s++;
  if (info.classification) s++;
  if (info.statut) s++;
  if (info.activitePDV) s++;
  if (info.activiteGlobale || info.activite) s++;
  if (info.secteur) s++;
  if (info.direction) s++;
  if ((info.ca2025 || 0) > 0) s++;
  if ((info.ca2026 || 0) > 0) s++;
  return s;
}

function _normalizeChalandiseDataKeys() {
  if (!_S.chalandiseData?.size) return false;
  let changed = false;
  const next = new Map();
  for (const [rawCc, info] of _S.chalandiseData) {
    const cc = extractClientCode(rawCc);
    if (!cc) continue;
    if (cc !== rawCc) changed = true;
    const prev = next.get(cc);
    if (!prev || _chalInfoScore(info) > _chalInfoScore(prev)) next.set(cc, info);
  }
  if (changed) _S.chalandiseData = next;
  return changed;
}

function _rebuildChalandiseIndexes() {
  const byMetier = new Map();
  const byCommercial = new Map();
  const metiers = new Set();
  for (const [cc, info] of (_S.chalandiseData || new Map()).entries()) {
    if (info?.metier) {
      metiers.add(info.metier);
      if (!byMetier.has(info.metier)) byMetier.set(info.metier, new Set());
      byMetier.get(info.metier).add(cc);
    }
    if (info?.commercial) {
      if (!byCommercial.has(info.commercial)) byCommercial.set(info.commercial, new Set());
      byCommercial.get(info.commercial).add(cc);
    }
  }
  _S.clientsByMetier = byMetier;
  _S.clientsByCommercial = byCommercial;
  _S.chalandiseMetiers = [...metiers].sort();
}

function _normalizeForcageCommercialKeys() {
  if (!_S.forcageCommercial?.size) return;
  let changed = false;
  const next = new Map();
  for (const [rawCc, com] of _S.forcageCommercial) {
    const cc = extractClientCode(rawCc);
    if (!cc) continue;
    if (cc !== rawCc) changed = true;
    next.set(cc, com);
  }
  if (changed) _S.forcageCommercial = next;
}

/**
 * Applique _S.forcageCommercial sur :
 * - _S.chalandiseData (crée une entrée minimale si absente)
 * - _S.clientsByCommercial (index)
 * - _S.clientStore (patch inChalandise + commercial si présent)
 *
 * Idempotent : peut être appelé plusieurs fois.
 * @returns {number} nb de lignes de forçage appliquées
 */
function _looksLikeComKey(s) { return /^\d+\s*-\s*.+/.test(s); }

function _rematchCommercial(raw) {
  if (!raw || !_S.clientsByCommercial?.size) return raw;
  // Si déjà au bon format "1549 - LABORIALLE Fabien", pas besoin de re-matcher
  if (_looksLikeComKey(raw) && _S.clientsByCommercial.has(raw)) return raw;
  // Ne chercher que parmi les vraies clés "CODE - NOM" (pas les brutes créées par le forçage)
  const comKeys = [..._S.clientsByCommercial.keys()].filter(_looksLikeComKey);
  if (!comKeys.length) return raw;
  // Exact case-insensitive
  const rawLow = raw.toLowerCase();
  const exact = comKeys.find(k => k.toLowerCase() === rawLow);
  if (exact) return exact;
  // Partial match on surname (after " - ")
  const words = rawLow.split(/[\s,]+/).filter(w => w.length >= 3);
  if (words.length) {
    const match = comKeys.find(k => {
      const afterDash = k.slice(k.indexOf(' - ') + 3).toLowerCase();
      return words.every(w => afterDash.includes(w));
    });
    if (match) return match;
  }
  return raw;
}

export function applyForcageCommercial() {
  if (!_S.forcageCommercial?.size) return 0;
  _normalizeForcageCommercialKeys();

  if (!_S.chalandiseData) _S.chalandiseData = new Map();
  const chalKeysChanged = _normalizeChalandiseDataKeys();
  if (chalKeysChanged) _rebuildChalandiseIndexes();
  if (!_S.clientsByCommercial) _S.clientsByCommercial = new Map();

  // Re-match des commerciaux non reconnus (cas chargement initial : fichier rattachement
  // parsé avant chalandise → _comKeys était vide → stocké en brut)
  for (const [cc, com] of _S.forcageCommercial) {
    if (!_looksLikeComKey(com)) {
      const matched = _rematchCommercial(com);
      if (matched !== com) _S.forcageCommercial.set(cc, matched);
    }
  }

  let applied = 0;
  for (const [cc, com] of _S.forcageCommercial) {
    if (!cc || !com) continue;
    const info = _S.chalandiseData.get(cc);
    if (info) {
      const oldCom = info.commercial;
      if (oldCom && oldCom !== com && _S.clientsByCommercial.has(oldCom)) {
        _S.clientsByCommercial.get(oldCom).delete(cc);
      }
      info.commercial = com;
      info._forcage = true;
    } else {
      const _rec = _S.clientStore?.get(cc);
      const nom = _rec?.nom || _S.clientNomLookup?.[cc] || cc;
      const caPDV = _rec?.caPDV || 0;
      const caTotal = _rec?.caTotal || 0;
      const silenceDays = _rec?.silenceDaysPDV ?? _rec?.silenceDaysAll ?? null;
      // Statut déduit du consommé : actif si CA, sinon silence-based
      let statut = '';
      if (caPDV > 0 || caTotal > 0) {
        statut = silenceDays !== null && silenceDays > 365 ? 'Inactif' : 'Actif';
      }
      // activitePDV cohérente avec les données de vente
      const activitePDV = caPDV > 0 ? 'Actif' : '';
      const activiteGlobale = caTotal > 0 ? 'Actif' : '';
      _S.chalandiseData.set(cc, {
        nom, commercial: com, classification: '', metier: '',
        statut, activite: activiteGlobale, activiteGlobale, activitePDV,
        secteur: '', cp: '', ville: '',
        ca2025: caTotal, caPDVN: caPDV, ca2026: caTotal, _forcage: true,
      });
    }
    if (!_S.clientsByCommercial.has(com)) _S.clientsByCommercial.set(com, new Set());
    _S.clientsByCommercial.get(com).add(cc);

    const rec = _S.clientStore?.get(cc);
    if (rec) { rec.commercial = com; rec.inChalandise = true; }
    applied++;
  }
  return applied;
}

/**
 * Point d'entrée "store" (symétrique des autres *-store.js) :
 * garantit que chalandiseData est une Map et que le forçage est appliqué.
 * @returns {Map<string, Object>}
 */
export function buildChalandiseStore() {
  if (!_S.chalandiseData) _S.chalandiseData = new Map();
  const chalKeysChanged = _normalizeChalandiseDataKeys();
  if (chalKeysChanged) _rebuildChalandiseIndexes();
  // Si index manquants mais chalandise présente (cas caches anciens), reconstruire.
  if (_S.chalandiseData.size && (!_S.clientsByCommercial?.size || !_S.clientsByMetier?.size)) {
    _rebuildChalandiseIndexes();
  }
  applyForcageCommercial(); // forçage par-dessus (idempotent)
  return _S.chalandiseData;
}

/** Récupère une fiche chalandise par code client. */
export function getChalandise(cc) {
  buildChalandiseStore();
  const key = extractClientCode(cc);
  return key ? _S.chalandiseData.get(key) : undefined;
}

/** @returns {boolean} true si chalandise complète OU forçage présent */
export function hasChalandiseOrForcage() {
  return !!(_S.chalandiseReady || _S.chalandiseData?.size || _S.forcageCommercial?.size);
}
