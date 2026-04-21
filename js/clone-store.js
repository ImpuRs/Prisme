// ═══════════════════════════════════════════════════════════════
// PRISME — clone-store.js
// Scoring de similarité inter-agences pour filtrer les calculs réseau
// (blend saisonnier, Vitesse Réseau, Benchmark)
// ═══════════════════════════════════════════════════════════════
'use strict';

import { _S } from './state.js';
import { haversineKm } from './utils.js';
import { AGENCE_CP } from './constants.js';

// ── Constantes scoring ──────────────────────────────────────────
const W_MIX    = 0.60;  // poids mix famille (cosine similarity)
const W_CA     = 0.25;  // poids magnitude CA
const W_GEO    = 0.15;  // poids proximité géographique
const MIN_CLONES = 3;
const MAX_CLONES = 7;

// ── Cosine similarity entre deux vecteurs (objets clé→valeur) ──
function _cosine(a, b) {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  let dot = 0, normA = 0, normB = 0;
  for (const k of keys) {
    const va = a[k] || 0, vb = b[k] || 0;
    dot += va * vb;
    normA += va * va;
    normB += vb * vb;
  }
  if (!normA || !normB) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

// ── Distance géographique entre deux agences ────────────────────
function _geoDistance(storeA, storeB) {
  const cpA = AGENCE_CP[storeA], cpB = AGENCE_CP[storeB];
  if (!cpA || !cpB) return null;
  const coords = _S._cpCoords;
  if (!coords) return null;
  const a = coords[cpA], b = coords[cpB];
  if (!a || !b) return null;
  return haversineKm(a[0], a[1], b[0], b[1]);
}

// ═══════════════════════════════════════════════════════════════
// computeCloneStores — scoring principal
// Peuple _S._cloneStores = [{code, score, simMix, simCA, simGeo}]
// ═══════════════════════════════════════════════════════════════

export function computeCloneStores(myStore) {
  _S._cloneStores = [];
  _S._cloneSet = null;

  const vpm = _S.ventesParMagasin || {};
  const artFam = _S.articleFamille || {};
  if (!myStore || !vpm[myStore]) return;

  const stores = Object.keys(vpm).filter(s => s !== myStore);
  if (stores.length < 2) return;

  // ── 1. Profils famille par agence (vecteur CA% par famille) ──
  const profiles = {};  // store → {fam → CA%}
  const totalCA = {};   // store → CA total

  for (const store of [myStore, ...stores]) {
    const sd = vpm[store];
    if (!sd) continue;
    const famCA = {};
    let total = 0;
    for (const [code, d] of Object.entries(sd)) {
      if (!/^\d{6}$/.test(code)) continue;
      const ca = d.sumCA || 0;
      if (ca <= 0) continue;
      const fam = artFam[code] || '';
      if (!fam) continue;
      famCA[fam] = (famCA[fam] || 0) + ca;
      total += ca;
    }
    totalCA[store] = total;
    // Normaliser en pourcentages
    if (total > 0) {
      const profile = {};
      for (const [f, ca] of Object.entries(famCA)) profile[f] = ca / total;
      profiles[store] = profile;
    }
  }

  if (!profiles[myStore] || !totalCA[myStore]) return;

  const myProfile = profiles[myStore];
  const myCA = totalCA[myStore];

  // ── 2. Scoring par agence ──
  const results = [];

  for (const store of stores) {
    if (!profiles[store]) continue;

    // Mix famille — cosine similarity (0-1)
    const simMix = _cosine(myProfile, profiles[store]);

    // Magnitude CA — pénalise les écarts d'ordre de grandeur
    const otherCA = totalCA[store] || 1;
    const logRatio = Math.abs(Math.log(myCA / otherCA)) / Math.log(5);
    const simCA = Math.max(0, 1 - Math.min(1, logRatio));

    // Géographie — proximité (0-1)
    const dist = _geoDistance(myStore, store);
    const simGeo = dist != null ? Math.max(0, 1 - Math.min(1, dist / 400)) : 0.5; // 0.5 si inconnu

    // Score pondéré
    const score = Math.round((simMix * W_MIX + simCA * W_CA + simGeo * W_GEO) * 100);

    results.push({
      code: store,
      score,
      simMix: Math.round(simMix * 100),
      simCA:  Math.round(simCA * 100),
      simGeo: Math.round(simGeo * 100),
      distKm: dist != null ? Math.round(dist) : null,
      ca: Math.round(otherCA),
    });
  }

  results.sort((a, b) => b.score - a.score);

  // ── 3. Sélection : min 3, max 7 ──
  _S._cloneStores = results.slice(0, MAX_CLONES);
  _S._cloneSet = null; // invalidé, recalculé à la demande

  console.log(`[PRISME] Clones de ${myStore} :`, _S._cloneStores.map(c => `${c.code}(${c.score})`).join(', '));
}

// ── Getter : Set<storeCode> des clones (cache) ──
export function getCloneSet() {
  if (_S._cloneSet) return _S._cloneSet;
  const set = new Set();
  for (const c of (_S._cloneStores || [])) {
    if (c.score >= 50 || set.size < MIN_CLONES) set.add(c.code);
  }
  _S._cloneSet = set;
  return set;
}

// ── Helper : tableau des codes clones ──
export function getCloneCodes() {
  return [...getCloneSet()];
}
