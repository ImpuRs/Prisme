// © 2026 Jawad El Barkaoui — Tous droits réservés
// PRISME — associations.js
// Animation des ventes associées : benchmark réseau × familles croisées
// ═══════════════════════════════════════════════════════════════
'use strict';

import { _S } from './state.js';
import { formatEuro, escapeHtml, _isMetierStrategique } from './utils.js';
import { FAM_LETTER_UNIVERS, SECTEUR_DIR_MAP } from './constants.js';
import { computeSquelette } from './engine.js';
import { _saveSessionToIDB } from './cache.js';
import { DataStore } from './store.js';
import { PHYSIGAMME_COPY, getPhysigammeDecision } from './physigamme.js?v=20260425a';
import { computePhysigamme } from './physigamme-engine.js?v=20260425b';
import { renderPhysigammeHero, renderPhysigammeKpis, renderPhysigammePerimeterBar, renderPhysigammeOutOfScope } from './physigamme-view.js?v=20260425b';
import { renderPhysigammeArticleTable } from './physigamme-table.js?v=20260425b';
import { buildPhysigammeDeployment, renderPhysigammeDeployment } from './physigamme-deployment.js?v=20260425c';
import { renderMissingPanel, exportMissingOrder, exportStartupKit } from './physigamme-actions.js?v=20260425b';

// ═══════════════════════════════════════════════════════════════
// Données persistées : _S._associations = [{id, famA, famB, famC?, label, dateCreated}]
// ═══════════════════════════════════════════════════════════════

/** Initialise la structure si absente */
function _ensureAssoc() {
  if (!_S._associations) _S._associations = [];
}

/** Filtre métier actif pour le Labo (module-level, pas persisté) */
let _assocMetierFilter = '';
/** Filtre stratégique : '' | 'strat' | 'hors' */
let _assocStratFilter = '';
/** Filtre univers pour l'étape 2 : '' | 'E' | 'O' | ... */
let _assocUniversFilter = '';
/** Mode du Labo : 'assoc' | 'tronc' */
let _laboMode = 'assoc';
/** Filtre univers pour le Tronc Commun */
let _troncUniversFilter = '';
/** Filtre périmètre pour le Tronc Commun : 'agence' | 'territoire' | 'reseau' */
let _troncPerimetre = null; // null = auto-detect at render time
/** Filtre KPI cliquable : '' | 'tronc' | 'inter' | 'spec' */
let _troncKpiFilter = '';
/** Code article ouvert en accordéon (drill-down Rayon X) */
let _troncExpandedCode = '';
/** Cluster métiers personnalisé : null = tous strat, Set<string> = sélection custom */
let _troncCustomMetiers = null;
/** Mode sélecteur métiers ouvert */
let _troncMetierPickerOpen = false;
/** Inclure 100% des clients (ignore le filtre métier stratégique) */
let _troncIncludeAll = false;
/** Familles dépliées dans le tableau Tronc Commun */
let _troncOpenFams = new Set();
/** Vue active du Tronc Commun : 'articles' | 'carto' */
let _troncVue = 'articles';
let _troncLoiAirain = true; // Double validation : Tronc Commun ∩ ≥60% agences
/** Agences en amorçage — exclues des calculs médiane/conformité */
let _troncAmorcageStores = new Set();

/** Teste si un client passe le filtre métier + strat actif */
function _clientPassesAssocFilter(cc) {
  const mf = _assocMetierFilter;
  const sf = _assocStratFilter;
  if (!mf && !sf) return true;
  const metier = _S.chalandiseData?.get(cc)?.metier || '';
  if (mf === '__nonclasse__') {
    return !metier || metier.length <= 2 || /^[-–—\s.]+$/.test(metier);
  }
  if (mf) return metier === mf;
  // Pas de métier individuel mais filtre strat/hors actif
  if (sf === 'strat') return _isMetierStrategique(metier);
  if (sf === 'hors') return metier.length > 2 && !_isMetierStrategique(metier);
  return true;
}

/** Génère un ID court */
function _assocId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

// ═══════════════════════════════════════════════════════════════
// Calcul du taux d'association par agence (via ventesParAgence)
// ═══════════════════════════════════════════════════════════════

/**
 * Agrège ventesParAgenceByCanal pour un store (tous canaux confondus).
 * Retourne un objet {code → {sumCA, countBL}} — sensible au filtre période.
 * Fallback sur ventesParAgence (pleine période) si byCanal absent.
 */
function _vpmForStore(store) {
  const vbc = _S.ventesParAgenceByCanal;
  if (vbc && vbc[store]) {
    const merged = {};
    for (const canal in vbc[store]) {
      for (const [code, data] of Object.entries(vbc[store][canal])) {
        if (!merged[code]) merged[code] = { sumCA: 0, countBL: 0 };
        merged[code].sumCA += data.sumCA || 0;
        merged[code].countBL += data.countBL || 0;
      }
    }
    return merged;
  }
  return _S.ventesParAgence?.[store] || {};
}

function _troncStoreKeys() {
  const vbc = _S.ventesParAgenceByCanal;
  if (vbc && Object.keys(vbc).length) return Object.keys(vbc).sort();
  return Object.keys(_S.ventesParAgence || {}).sort();
}

/**
 * Pour une agence du réseau, calcule le mix A/B :
 * caA, caB, refsA, refsB, blA, blB + ratio brut caB/caA.
 * Utilise ventesParAgenceByCanal (sensible période) avec fallback ventesParAgence.
 */
function _computeAssocForStore(store, famA, famB) {
  const sd = _vpmForStore(store);
  if (!sd || !Object.keys(sd).length) return { blA: 0, blB: 0, ratioRaw: 0, caA: 0, caB: 0, refsA: 0, refsB: 0 };

  const catFam = _S.catalogueFamille;
  let caA = 0, caB = 0, blA = 0, blB = 0, refsA = 0, refsB = 0;
  for (const [code, data] of Object.entries(sd)) {
    if (!/^\d{6}$/.test(code)) continue;
    const cf = catFam?.get(code)?.codeFam || _S.articleFamille?.[code] || '';
    const bl = data.countBL || 0;
    if (bl <= 0) continue;
    if (cf === famA) { caA += data.sumCA || 0; blA += bl; refsA++; }
    if (cf === famB) { caB += data.sumCA || 0; blB += bl; refsB++; }
  }

  return {
    blA, blB, refsA, refsB,
    ratioRaw: caA > 0 ? caB / caA : 0,
    caA, caB
  };
}

/**
 * Vue omnicanale unifiée par client : merge ventesLocalMagPeriode + ventesLocalHorsMag.
 * Retourne un itérateur de [cc, Map<code, {sumCA}>] — tous canaux confondus.
 * Le BL du co-achat se mesure au niveau client (a-t-il acheté A ET B ?), pas au niveau BL,
 * donc on agrège le CA tous canaux pour chaque couple (client, article).
 */
function _omniClientArticles() {
  const merged = new Map(); // cc → Map<code, {sumCA}>
  const hasFilter = !!_assocMetierFilter || !!_assocStratFilter;
  // Source 1 : MAGASIN (ventesLocalMagPeriode)
  if (_S.ventesLocalMagPeriode?.size) {
    for (const [cc, artMap] of _S.ventesLocalMagPeriode) {
      if (hasFilter && !_clientPassesAssocFilter(cc)) continue;
      if (!merged.has(cc)) merged.set(cc, new Map());
      const m = merged.get(cc);
      for (const [code, v] of artMap) {
        if (!/^\d{6}$/.test(code)) continue;
        const prev = m.get(code);
        m.set(code, { sumCA: (prev?.sumCA || 0) + (v.sumCA || 0) });
      }
    }
  }
  // Source 2 : hors-MAGASIN (Web, Représentant, DCS)
  if (_S.ventesLocalHorsMag?.size) {
    for (const [cc, artMap] of _S.ventesLocalHorsMag) {
      if (hasFilter && !_clientPassesAssocFilter(cc)) continue;
      if (!merged.has(cc)) merged.set(cc, new Map());
      const m = merged.get(cc);
      for (const [code, v] of artMap) {
        if (!/^\d{6}$/.test(code)) continue;
        const prev = m.get(code);
        m.set(code, { sumCA: (prev?.sumCA || 0) + (v.sumCA || 0) });
      }
    }
  }
  // Source 3 : Terrain (BL Qlik multi-agences — livraisons, chantiers)
  if (_S.territoireReady && _S.territoireLines?.length) {
    for (const l of _S.territoireLines) {
      const cc = l.clientCode;
      if (!cc || !l.ca) continue;
      if (!/^\d{6}$/.test(l.code)) continue;
      if (hasFilter && !_clientPassesAssocFilter(cc)) continue;
      if (!merged.has(cc)) merged.set(cc, new Map());
      const m = merged.get(cc);
      const prev = m.get(l.code);
      m.set(l.code, { sumCA: (prev?.sumCA || 0) + l.ca });
    }
  }
  return merged;
}

/**
 * Calcul complet pour mon agence — omnicanal (MAGASIN + Web + Représentant + DCS)
 */
function _computeAssocMyStore(famA, famB) {
  const catFam = _S.catalogueFamille;
  const omni = _omniClientArticles();
  if (!omni.size) return { clientsA: new Set(), clientsAB: new Set(), taux: 0, caA: 0, caB: 0, caBdetail: new Map() };

  const clientsA = new Set();
  const clientsAB = new Set();
  let caA = 0, caB = 0;
  const caBdetail = new Map(); // code → {ca, clients: Set}

  for (const [cc, artMap] of omni) {
    let hasA = false, hasB = false;
    for (const [code, v] of artMap) {
      const cf = catFam?.get(code)?.codeFam || _S.articleFamille?.[code] || '';
      if (cf === famA) { hasA = true; caA += v.sumCA || 0; }
      if (cf === famB) {
        hasB = true;
        const ca = v.sumCA || 0;
        caB += ca;
        if (!caBdetail.has(code)) caBdetail.set(code, { ca: 0, clients: new Set() });
        const d = caBdetail.get(code);
        d.ca += ca;
        d.clients.add(cc);
      }
    }
    if (hasA) clientsA.add(cc);
    if (hasA && hasB) clientsAB.add(cc);
  }

  return {
    clientsA,
    clientsAB,
    taux: clientsA.size > 0 ? Math.round(clientsAB.size / clientsA.size * 100) : 0,
    caA, caB, caBdetail
  };
}

/**
 * Benchmark réseau : indice d'association normalisé par agence.
 * Indice = (caB/caA)_store / median(caB/caA)_réseau × 100
 * 100 = niveau médiane, >100 = vend mieux l'association, <100 = en retard.
 * Trié par indice décroissant — qui cross-sell le mieux ?
 */
function _benchmarkAssoc(famA, famB) {
  // Lister les stores depuis ventesParAgenceByCanal (sensible période) ou ventesParAgence
  const vbc = _S.ventesParAgenceByCanal || {};
  const vpm = _S.ventesParAgence || {};
  const allStores = new Set([...Object.keys(vbc), ...Object.keys(vpm)]);
  const myStore = _S.selectedMyStore;
  const raw = [];

  for (const store of allStores) {
    const r = _computeAssocForStore(store, famA, famB);
    if (r.caA > 0 && r.blA >= 5) {
      raw.push({ store, ...r });
    }
  }

  if (raw.length === 0) return [];

  // Médiane du ratio brut caB/caA sur l'ensemble du réseau
  const ratios = raw.map(r => r.ratioRaw).sort((a, b) => a - b);
  const medRatio = ratios[Math.floor(ratios.length / 2)];

  // Indice normalisé pour chaque agence (100 = médiane)
  const results = [];
  for (const r of raw) {
    if (r.store === myStore) continue;
    r.indice = medRatio > 0 ? Math.round(r.ratioRaw / medRatio * 100) : 0;
    r.ratio = Math.round(r.ratioRaw * 100);
    results.push(r);
  }

  // Mon indice aussi
  const myR = raw.find(r => r.store === myStore);
  const myIndice = myR && medRatio > 0 ? Math.round(myR.ratioRaw / medRatio * 100) : 0;

  results.sort((a, b) => b.indice - a.indice || b.caB - a.caB);
  results._myIndice = myIndice;
  results._medRatio = medRatio;
  return results;
}

/**
 * Refs vendues par la meilleure agence sur famB que mon agence ne vend pas bien
 */
function _findMissingRefs(famB, bestStore) {
  const myStore = _S.selectedMyStore;
  const catFam = _S.catalogueFamille;
  const myData = _vpmForStore(myStore);
  const bestData = _vpmForStore(bestStore);

  // Lookup squelette code → classification
  const sqResult = _S._prSqData || computeSquelette();
  const sqMap = new Map();
  if (sqResult?.directions) {
    for (const dir of sqResult.directions) {
      for (const cat of ['socle', 'implanter', 'challenger', 'surveiller']) {
        if (dir[cat]) for (const a of dir[cat]) sqMap.set(a.code, a.classification || cat);
      }
    }
  }

  const refs = [];
  for (const [code, data] of Object.entries(bestData)) {
    const cf = catFam?.get(code)?.codeFam || _S.articleFamille?.[code] || '';
    if (cf !== famB) continue;
    const myCa = myData[code]?.sumCA || 0;
    const bestCa = data.sumCA || 0;
    if (bestCa > myCa * 1.5) { // l'autre vend au moins 50% de plus
      const fd = DataStore.finalData?.find(r => r.code === code);
      refs.push({
        code,
        libelle: _S.libelleLookup?.[code] || code,
        bestCa,
        myCa,
        bestBL: data.countBL || 0,
        myBL: myData[code]?.countBL || 0,
        enStock: (fd?.stockActuel || 0) > 0,
        stock: fd?.stockActuel || 0,
        sqClassif: sqMap.get(code) || null,
        ecart: bestCa > 0 ? Math.round((bestCa - myCa) / bestCa * 100) : 0
      });
    }
  }

  refs.sort((a, b) => (b.bestCa - b.myCa) - (a.bestCa - a.myCa));
  return refs.slice(0, 20);
}

/**
 * Clients cibles : achètent A mais pas B
 */
function _findClientTargets(famA, famB) {
  const catFam = _S.catalogueFamille;
  const omni = _omniClientArticles();
  if (!omni.size) return [];

  const targets = [];
  for (const [cc, artMap] of omni) {
    let hasA = false, caA = 0, hasB = false;
    for (const [code, v] of artMap) {
      const cf = catFam?.get(code)?.codeFam || _S.articleFamille?.[code] || '';
      if (cf === famA) { hasA = true; caA += v.sumCA || 0; }
      if (cf === famB) hasB = true;
    }
    if (hasA && !hasB) {
      // Uniquement clients PDV (au moins 1 achat MAGASIN)
      if (!_S.ventesLocalMag12MG?.has(cc) && !_S.ventesLocalMagPeriode?.has(cc)) continue;
      const info = _S.chalandiseData?.get(cc);
      targets.push({
        cc,
        nom: info?.nom || _S.clientNomLookup?.[cc] || cc,
        metier: info?.metier || '',
        classification: info?.classification || '',
        commercial: info?.commercial || '',
        caA
      });
    }
  }

  targets.sort((a, b) => b.caA - a.caA);
  return targets.slice(0, 30);
}

// ═══════════════════════════════════════════════════════════════
// Lookup libellé famille
// ═══════════════════════════════════════════════════════════════

function _famLabel(codeFam) {
  const catFam = _S.catalogueFamille;
  if (catFam) {
    for (const f of catFam.values()) {
      if (f.codeFam === codeFam && f.libFam) return f.libFam;
    }
  }
  return codeFam;
}

// ═══════════════════════════════════════════════════════════════
// Rendu
// ═══════════════════════════════════════════════════════════════

function _renderAssociations() {
  _ensureAssoc();
  const assocs = _S._associations;
  let html = '';

  html += `<div class="mb-4">
    <div class="flex items-center justify-between mb-3">
      <p class="text-[10px] t-disabled">Mesurez votre taux d'association vs le réseau et identifiez les actions concrètes.${_assocMetierFilter && !_S._assocEditMode ? ` <button onclick="window._assocSetMetier('')" class="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-bold cursor-pointer ml-1" style="background:var(--c-action);color:#fff">✕ ${escapeHtml(_assocMetierFilter)}</button>` : ''}</p>
      <button onclick="window._assocNew()" class="text-[11px] px-3 py-1.5 rounded-lg border-2 cursor-pointer font-bold transition-all hover:shadow-md" style="border-color:var(--c-action);color:var(--c-action)">+ Nouvelle association</button>
    </div>
  </div>`;

  if (_S._assocEditMode) {
    html += _renderAssocEditor();
  }

  if (!assocs.length && !_S._assocEditMode) {
    html += `<div class="text-center py-12 border-2 border-dashed rounded-xl" style="border-color:var(--color-border-tertiary)">
      <div class="text-3xl mb-3">🔗</div>
      <p class="t-secondary text-sm font-medium mb-2">Aucune association configurée</p>
      <p class="t-disabled text-[11px] mb-4">Créez votre première association pour commencer l'analyse.</p>
      <button onclick="window._assocNew()" class="text-[11px] px-4 py-2 rounded-lg cursor-pointer font-bold" style="background:var(--c-action);color:#fff">+ Créer une association</button>
    </div>`;
    return html;
  }

  // Cards des associations existantes
  for (const a of assocs) {
    html += _renderAssocCard(a);
  }

  return html;
}

/**
 * Calcule les stats par famille : CA, nb clients, nb refs vendues
 * @returns {Map<codeFam, {codeFam, lib, ca, nbClients, nbRefs}>}
 */
function _famStats() {
  if (_famStatsCache) return _famStatsCache;
  const catFam = _S.catalogueFamille;
  const vca = _S.ventesLocalMagPeriode;
  const stats = new Map();

  const _ensure = (cf) => {
    if (!stats.has(cf)) stats.set(cf, { codeFam: cf, lib: _famLabel(cf), ca: 0, caReseau: 0, clients: new Set(), refs: new Set() });
    return stats.get(cf);
  };

  // Source 1 : ventesLocalMagPeriode (MAGASIN) + ventesLocalHorsMag (Web, Rep, DCS)
  // Omnicanal : tous les canaux comptent pour les associations
  const hasFilter = !!_assocMetierFilter || !!_assocStratFilter;
  if (vca?.size) {
    for (const [cc, artMap] of vca) {
      if (hasFilter && !_clientPassesAssocFilter(cc)) continue;
      for (const [code, v] of artMap) {
        const cf = catFam?.get(code)?.codeFam || _S.articleFamille?.[code] || '';
        if (!cf) continue;
        const s = _ensure(cf);
        s.ca += v.sumCA || 0;
        s.clients.add(cc);
        s.refs.add(code);
      }
    }
  }

  // Source 1b : ventesLocalHorsMag (Web, Représentant, DCS) — même structure
  const vhm = _S.ventesLocalHorsMag;
  if (vhm?.size) {
    for (const [cc, artMap] of vhm) {
      if (hasFilter && !_clientPassesAssocFilter(cc)) continue;
      for (const [code, v] of artMap) {
        const cf = catFam?.get(code)?.codeFam || _S.articleFamille?.[code] || '';
        if (!cf) continue;
        const s = _ensure(cf);
        s.ca += v.sumCA || 0;
        s.clients.add(cc);
        s.refs.add(code);
      }
    }
  }

  // Source 1c : Terrain (BL Qlik multi-agences — livraisons, chantiers)
  if (_S.territoireReady && _S.territoireLines?.length) {
    for (const l of _S.territoireLines) {
      const cc = l.clientCode;
      if (!cc || !l.ca) continue;
      if (hasFilter && !_clientPassesAssocFilter(cc)) continue;
      const cf = catFam?.get(l.code)?.codeFam || _S.articleFamille?.[l.code] || '';
      if (!cf) continue;
      const s = _ensure(cf);
      s.ca += l.ca;
      s.clients.add(cc);
      s.refs.add(l.code);
    }
  }

  // Source 2 : ventesParAgence (tout le réseau) — familles absentes localement mais actives réseau
  if (_S.ventesParAgence) {
    for (const [store, arts] of Object.entries(_S.ventesParAgence)) {
      for (const [code, data] of Object.entries(arts)) {
        if ((data.countBL || 0) <= 0) continue;
        const cf = catFam?.get(code)?.codeFam || _S.articleFamille?.[code] || '';
        if (!cf) continue;
        const s = _ensure(cf);
        s.caReseau += data.sumCA || 0;
        s.refs.add(code);
      }
    }
  }

  // Convertir sets en counts
  for (const s of stats.values()) {
    s.nbClients = s.clients.size;
    s.nbRefs = s.refs.size;
    delete s.clients;
    delete s.refs;
  }

  _famStatsCache = stats;
  return stats;
}
let _famStatsCache = null;

/**
 * Détecte les meilleures familles associées pour une famille A donnée.
 * Critères : co-achat naturel (% clients A qui achètent aussi B), taille B ≤ 2× taille A.
 * @returns {Array<{codeFam, lib, coTaux, nbCoClients, ca, warning?}>}
 */
function _suggestAssociatedFams(famA) {
  const catFam = _S.catalogueFamille;
  const omni = _omniClientArticles();
  if (!omni.size) return [];

  const fStats = _famStats();
  const statsA = fStats.get(famA);
  if (!statsA || statsA.nbClients < 3) return [];

  // Pour chaque client qui achète A (tous canaux), quelles autres familles achète-t-il ?
  const coCount = new Map(); // codeFam → Set<cc>
  for (const [cc, artMap] of omni) {
    let hasA = false;
    const otherFams = new Set();
    for (const [code] of artMap) {
      const cf = catFam?.get(code)?.codeFam || _S.articleFamille?.[code] || '';
      if (cf === famA) hasA = true;
      else if (cf) otherFams.add(cf);
    }
    if (hasA) {
      for (const cf of otherFams) {
        if (!coCount.has(cf)) coCount.set(cf, new Set());
        coCount.get(cf).add(cc);
      }
    }
  }

  const results = [];
  for (const [cf, clients] of coCount) {
    const sB = fStats.get(cf);
    if (!sB || sB.nbClients < 2 || !/^[A-Z]\d{2}$/.test(cf)) continue;
    const coTaux = Math.round(clients.size / statsA.nbClients * 100);
    if (coTaux < 5) continue; // trop marginal
    const tooBig = sB.ca > statsA.ca * 2;
    results.push({
      codeFam: cf,
      lib: sB.lib,
      coTaux,
      nbCoClients: clients.size,
      ca: sB.ca,
      nbClients: sB.nbClients,
      warning: tooBig ? `CA ${_famLabel(cf)} (${formatEuro(sB.ca)}) > 2× CA ${_famLabel(famA)} (${formatEuro(statsA.ca)})` : null
    });
  }

  results.sort((a, b) => b.coTaux - a.coTaux);
  return results.slice(0, 30);
}

function _renderAssocEditor() {
  const famA = _S._assocEditing?.famA || '';
  const famB = _S._assocEditing?.famB || '';
  const _mf = _assocMetierFilter;

  // ── Étape 0 : Métiers disponibles (exclure tirets, vides, trop courts) ──
  const _metiers = new Set();
  let _nonClasseCount = 0;
  if (_S.chalandiseData?.size) {
    for (const info of _S.chalandiseData.values()) {
      const m = info.metier;
      if (m && m.length > 2 && !/^[-–—\s.]+$/.test(m)) _metiers.add(m);
      else _nonClasseCount++;
    }
  }
  const _metiersSorted = [..._metiers].sort();
  // Sécurité : si le filtre actif est un métier junk (sauf notre pseudo-filtre), le reset
  if (_mf && _mf !== '__nonclasse__' && !_metiers.has(_mf)) { _assocMetierFilter = ''; }

  // ── Étape 1 : Familles éligibles (filtrées par métier) ──
  const fStats = _famStats(); // déjà filtré par _assocMetierFilter / _assocStratFilter
  const _hasAnyFilter = !!_assocMetierFilter || !!_assocStratFilter;
  const eligible = [...fStats.values()]
    .filter(f => {
      if (!/^[A-Z]\d{2}$/.test(f.codeFam)) return false;
      // Si filtre actif, exiger des clients locaux (pas juste caReseau)
      if (_hasAnyFilter) return f.nbClients >= 1;
      return f.nbClients >= 3 || f.caReseau >= 1000;
    })
    .sort((a, b) => (b.ca || b.caReseau) - (a.ca || a.caReseau));

  // CA réseau pour comparaison (via ventesParAgence, non filtré métier)
  const _caReseau = {};
  if (_S.ventesParAgence) {
    const myStore = _S.selectedMyStore;
    for (const [store, arts] of Object.entries(_S.ventesParAgence)) {
      if (store === myStore) continue;
      for (const [code, data] of Object.entries(arts)) {
        if ((data.countBL || 0) <= 0) continue;
        const cf = _S.catalogueFamille?.get(code)?.codeFam || _S.articleFamille?.[code] || '';
        if (cf) _caReseau[cf] = (_caReseau[cf] || 0) + (data.sumCA || 0);
      }
    }
  }

  // Recherche texte
  const _searchQ = _S._assocSearchA || '';

  // Filtrer par recherche
  const filtered = _searchQ
    ? eligible.filter(f => (f.lib + ' ' + f.codeFam).toLowerCase().includes(_searchQ.toLowerCase()))
    : eligible;

  // ── Étape 0 : Sélection métier (pilules) avec filtre strat/hors ──
  let step0Html = '';
  if (_metiersSorted.length) {
    const sf = _assocStratFilter;
    // Filtrer les pilules par stratégique/hors
    const visibleMetiers = sf === 'strat'
      ? _metiersSorted.filter(m => _isMetierStrategique(m))
      : sf === 'hors'
        ? _metiersSorted.filter(m => !_isMetierStrategique(m))
        : _metiersSorted;

    const _stratBtn = (id, label) => {
      const sel = sf === id;
      return `<button onclick="window._assocSetStrat('${id}')" class="text-[10px] px-2.5 py-1 rounded-lg border cursor-pointer font-medium transition-all ${sel ? 'font-bold' : 'hover:s-hover'}" style="${sel ? 'background:var(--c-action);color:#fff;border-color:var(--c-action)' : 'border-color:var(--color-border-tertiary);color:var(--t-secondary)'}">${sel ? '✕ ' : ''}${label}</button>`;
    };

    const pills = visibleMetiers.map(m => {
      const sel = m === _mf;
      const mSafe = m.replace(/'/g, "\\'");
      return `<button onclick="window._assocSetMetier(${sel ? "''" : `'${mSafe}'`})" class="text-[10px] px-2.5 py-1 rounded-full border cursor-pointer font-medium transition-all whitespace-nowrap ${sel ? 'font-bold' : 'hover:s-hover'}" style="${sel ? 'background:var(--c-action);color:#fff;border-color:var(--c-action)' : 'border-color:var(--color-border-tertiary);color:var(--t-secondary)'}">${sel ? '✕ ' : ''}${escapeHtml(m)}</button>`;
    }).join('');
    // Bouton "Non classé" en premier — clients sans métier valide
    const _ncSel = _mf === '__nonclasse__';
    const nonClasseBtn = _nonClasseCount > 0
      ? `<button onclick="window._assocSetMetier(${_ncSel ? "''" : "'__nonclasse__'"})" class="text-[10px] px-2.5 py-1 rounded-full border cursor-pointer font-medium transition-all whitespace-nowrap ${_ncSel ? 'font-bold' : 'hover:s-hover'}" style="${_ncSel ? 'background:#a855f7;color:#fff;border-color:#a855f7' : 'border-color:var(--color-border-tertiary);color:#a855f7'}">${_ncSel ? '✕ ' : ''}Non classé (${_nonClasseCount})</button>`
      : '';
    step0Html = `<div class="mb-4">
      <label class="text-[10px] font-bold t-secondary mb-2 block">⓪ Métier <span class="font-normal t-disabled">— filtre les familles et les clients</span></label>
      <div class="flex items-center gap-2 mb-2">${_stratBtn('strat', 'Stratégiques')}${_stratBtn('hors', 'Hors stratégiques')}<span class="text-[9px] t-disabled">${visibleMetiers.length} métier${visibleMetiers.length > 1 ? 's' : ''}</span></div>
      <div class="flex flex-wrap gap-1.5">${nonClasseBtn}${pills}</div>
    </div>`;
  }

  // ── Étape 1 : Tuiles Famille A groupées par Univers ──
  const _uIcons = { A:'🏠', B:'🧱', C:'🧴', R:'⚡', E:'🛡️', G:'🌡️', M:'🔧', O:'🧰', L:'🚰' };
  let step1Html = '';
  if (!famA) {
    const searchBar = `<input id="assocSearchA" type="text" value="${escapeHtml(_searchQ)}" placeholder="Rechercher une famille…" class="w-full text-[11px] px-3 py-1.5 rounded-lg border b-default s-card t-primary mb-3" oninput="window._assocFilterA(this.value)">`;

    const _renderTileA = (f) => {
      const caMe = f.ca > 0 ? formatEuro(f.ca) : '—';
      const caRes = _caReseau[f.codeFam] ? formatEuro(_caReseau[f.codeFam]) : '';
      return `<div onclick="window._assocSelectA('${f.codeFam}')" class="p-2.5 rounded-lg border cursor-pointer transition-all hover:shadow-md hover:s-hover" style="border-color:var(--color-border-tertiary)">
        <div class="flex items-center justify-between mb-1">
          <span class="text-[11px] font-bold t-primary truncate">${escapeHtml(f.lib)}</span>
          <span class="text-[9px] font-mono t-disabled ml-1">${escapeHtml(f.codeFam)}</span>
        </div>
        <div class="flex items-center justify-between text-[10px]">
          <span class="t-secondary">${f.nbClients} cl. · <strong class="t-primary">${caMe}</strong></span>
          ${caRes ? `<span class="t-disabled">Rés. ${caRes}</span>` : ''}
        </div>
      </div>`;
    };

    // Grouper par univers
    const _univA = new Map();
    for (const f of filtered) {
      const letter = (f.codeFam || '?')[0].toUpperCase();
      if (!_univA.has(letter)) _univA.set(letter, { label: FAM_LETTER_UNIVERS[letter] || letter, items: [] });
      _univA.get(letter).items.push(f);
    }

    // Boutons filtre univers A
    const ufA = _assocUniversFilter;
    const univBtnsA = [
      `<button onclick="window._assocSetUnivers('')" class="text-[10px] px-2 py-0.5 rounded-lg border cursor-pointer font-medium transition-all ${!ufA ? 'font-bold' : 'hover:s-hover'}" style="${!ufA ? 'background:var(--c-action);color:#fff;border-color:var(--c-action)' : 'border-color:var(--color-border-tertiary);color:var(--t-secondary)'}">Tous</button>`,
      ...[..._univA.entries()].sort((a, b) => a[1].label.localeCompare(b[1].label)).map(([letter, u]) => {
        const sel = ufA === letter;
        return `<button onclick="window._assocSetUnivers('${letter}')" class="text-[10px] px-2 py-0.5 rounded-lg border cursor-pointer font-medium transition-all whitespace-nowrap ${sel ? 'font-bold' : 'hover:s-hover'}" style="${sel ? 'background:var(--c-action);color:#fff;border-color:var(--c-action)' : 'border-color:var(--color-border-tertiary);color:var(--t-secondary)'}">${_uIcons[letter] || '📦'} ${escapeHtml(u.label)} (${u.items.length})</button>`;
      })
    ].join('');

    // Sections par univers
    const sortedUnivsA = [..._univA.entries()]
      .filter(([letter]) => !ufA || letter === ufA)
      .sort((a, b) => {
        const caA = a[1].items.reduce((s, f) => s + (f.ca || 0), 0);
        const caB = b[1].items.reduce((s, f) => s + (f.ca || 0), 0);
        return caB - caA;
      });

    let sectionsA = '';
    for (const [letter, u] of sortedUnivsA) {
      const icon = _uIcons[letter] || '📦';
      const caUniv = u.items.reduce((s, f) => s + (f.ca || 0), 0);
      sectionsA += `<div class="mb-3">
        <div class="flex items-center gap-2 mb-1.5 pb-1 border-b b-light">
          <span class="text-[11px] font-bold t-primary">${icon} ${escapeHtml(u.label)}</span>
          <span class="text-[9px] t-disabled">${u.items.length} fam.${caUniv > 0 ? ' · ' + formatEuro(caUniv) : ''}</span>
        </div>
        <div class="grid grid-cols-2 lg:grid-cols-3 gap-2">${u.items.map(_renderTileA).join('')}</div>
      </div>`;
    }

    step1Html = `<div>
      <label class="text-[10px] font-bold t-secondary mb-2 block">① Moteur d'achat <span class="font-normal t-disabled">— la famille principale${_mf ? ` (${escapeHtml(_mf)})` : ''}</span></label>
      ${searchBar}
      <div class="flex flex-wrap items-center gap-1.5 mb-3">${univBtnsA}</div>
      <div style="max-height:400px;overflow-y:auto">${sectionsA || '<p class="text-[11px] t-disabled text-center py-4">Aucune famille trouvée.</p>'}</div>
    </div>`;
  } else {
    // Famille A sélectionnée — afficher comme badge compact avec CA réseau
    const labelA = _famLabel(famA);
    const statsA = fStats.get(famA);
    const caResA = _caReseau[famA] ? formatEuro(_caReseau[famA]) : '';
    step1Html = `<div class="mb-3">
      <label class="text-[10px] font-bold t-secondary mb-1.5 block">① Moteur d'achat</label>
      <div class="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border-2" style="border-color:var(--c-action);background:rgba(139,92,246,0.08)">
        <span class="text-[11px] font-bold" style="color:var(--c-action)">${escapeHtml(famA)} ${escapeHtml(labelA)}</span>
        ${statsA ? `<span class="text-[10px] t-secondary">${statsA.nbClients} cl. · ${formatEuro(statsA.ca)}</span>` : ''}
        ${caResA ? `<span class="text-[10px] t-disabled">Rés. ${caResA}</span>` : ''}
        <button onclick="window._assocSelectA('')" class="text-[10px] t-disabled hover:t-primary cursor-pointer ml-1" title="Changer">✕</button>
      </div>
    </div>`;
  }

  // ── Étape 2 : Tuiles Famille B regroupées par Univers ──
  let step2Html = '';
  if (famA && !famB) {
    const sugB = _suggestAssociatedFams(famA);
    if (sugB.length) {
      // Icônes par lettre d'univers
      const _uIcons = { A:'🏠', B:'🧱', C:'🧴', R:'⚡', E:'🛡️', G:'🌡️', M:'🔧', O:'🧰', L:'🚰' };

      // Collecter les univers présents
      const _univPresents = new Map(); // letter → {label, items[]}
      for (const s of sugB) {
        const letter = (s.codeFam || '?')[0].toUpperCase();
        if (!_univPresents.has(letter)) {
          _univPresents.set(letter, { label: FAM_LETTER_UNIVERS[letter] || letter, items: [] });
        }
        _univPresents.get(letter).items.push(s);
      }

      // Boutons filtre univers
      const uf = _assocUniversFilter;
      const univBtns = [
        `<button onclick="window._assocSetUnivers('')" class="text-[10px] px-2 py-0.5 rounded-lg border cursor-pointer font-medium transition-all ${!uf ? 'font-bold' : 'hover:s-hover'}" style="${!uf ? 'background:var(--c-action);color:#fff;border-color:var(--c-action)' : 'border-color:var(--color-border-tertiary);color:var(--t-secondary)'}">Tous</button>`,
        ...[..._univPresents.entries()].sort((a, b) => a[1].label.localeCompare(b[1].label)).map(([letter, u]) => {
          const sel = uf === letter;
          return `<button onclick="window._assocSetUnivers('${letter}')" class="text-[10px] px-2 py-0.5 rounded-lg border cursor-pointer font-medium transition-all whitespace-nowrap ${sel ? 'font-bold' : 'hover:s-hover'}" style="${sel ? 'background:var(--c-action);color:#fff;border-color:var(--c-action)' : 'border-color:var(--color-border-tertiary);color:var(--t-secondary)'}">${_uIcons[letter] || '📦'} ${escapeHtml(u.label)} (${u.items.length})</button>`;
        })
      ].join('');

      // Construire les sections par univers
      const _renderTileB = (s) => {
        const tauxColor = s.coTaux >= 40 ? '#22c55e' : s.coTaux >= 20 ? '#f59e0b' : '#94a3b8';
        const barW = Math.min(s.coTaux, 100);
        const caResB = _caReseau[s.codeFam] ? formatEuro(_caReseau[s.codeFam]) : '';
        return `<div onclick="window._assocPickB('${s.codeFam}')" class="p-2.5 rounded-lg border cursor-pointer transition-all hover:shadow-md hover:s-hover" style="border-color:var(--color-border-tertiary)">
          <div class="flex items-center justify-between mb-1">
            <span class="text-[11px] font-bold t-primary truncate">${escapeHtml(s.lib)}</span>
            <span class="text-sm font-black" style="color:${tauxColor}">${s.coTaux}%</span>
          </div>
          <div class="w-full h-1 rounded-full mb-1.5" style="background:var(--color-border-tertiary)"><div class="h-full rounded-full" style="width:${barW}%;background:${tauxColor}"></div></div>
          <div class="flex items-center justify-between text-[9px] t-disabled">
            <span>${s.nbCoClients} communs / ${s.nbClients} cl. · ${formatEuro(s.ca)}</span>
            ${caResB ? `<span>Rés. ${caResB}</span>` : ''}
          </div>
        </div>`;
      };

      // Trier les univers : même univers que famA en premier, puis par nb items desc
      const famALetter = (famA || '?')[0].toUpperCase();
      const sortedUnivs = [..._univPresents.entries()]
        .filter(([letter]) => !uf || letter === uf)
        .sort((a, b) => {
          if (a[0] === famALetter && b[0] !== famALetter) return 1; // propre univers en dernier (moins intéressant)
          if (b[0] === famALetter && a[0] !== famALetter) return -1;
          return b[1].items.length - a[1].items.length;
        });

      let sectionsHtml = '';
      for (const [letter, u] of sortedUnivs) {
        const icon = _uIcons[letter] || '📦';
        const bestTaux = Math.max(...u.items.map(s => s.coTaux));
        sectionsHtml += `<div class="mb-3">
          <div class="flex items-center gap-2 mb-1.5 pb-1 border-b b-light">
            <span class="text-[11px] font-bold t-primary">${icon} ${escapeHtml(u.label)}</span>
            <span class="text-[9px] t-disabled">${u.items.length} fam. · max ${bestTaux}%</span>
          </div>
          <div class="grid grid-cols-2 lg:grid-cols-3 gap-2">${u.items.map(_renderTileB).join('')}</div>
        </div>`;
      }

      step2Html = `<div>
        <label class="text-[10px] font-bold t-secondary mb-2 block">② Accessoire <span class="font-normal t-disabled">— par univers, triées par co-achat</span></label>
        <div class="flex flex-wrap items-center gap-1.5 mb-3">${univBtns}</div>
        ${sectionsHtml}
      </div>`;
    } else {
      step2Html = '<div class="text-[11px] t-disabled text-center py-4 border-2 border-dashed rounded-lg" style="border-color:var(--color-border-tertiary)">Aucune famille associée significative détectée.</div>';
    }
  }

  return `<div class="s-card rounded-xl border p-4 mb-4">
    <div class="flex items-center justify-between mb-3">
      <h4 class="font-bold text-sm t-primary">Nouvelle association</h4>
      <button onclick="window._assocCancel()" class="text-[10px] t-disabled hover:t-primary cursor-pointer">✕ Fermer</button>
    </div>
    ${step0Html}
    ${step1Html}
    ${step2Html}
  </div>`;
}

function _renderAssocCard(assoc) {
  const { famA, famB, id } = assoc;
  const labelA = _famLabel(famA);
  const labelB = _famLabel(famB);

  // Calcul mon agence (taux client)
  const my = _computeAssocMyStore(famA, famB);
  // Benchmark réseau : indice normalisé (100 = médiane)
  const bench = _benchmarkAssoc(famA, famB);
  const best = bench[0] || null;
  const myIndice = bench._myIndice || 0;
  const targets = _findClientTargets(famA, famB);
  const missingRefs = best ? _findMissingRefs(famB, best.store) : [];
  // Stocker pour export
  if (!_S._assocMissingRefs) _S._assocMissingRefs = {};
  _S._assocMissingRefs[id] = { refs: missingRefs, famA: labelA, famB: labelB, bestStore: best?.store || '?' };

  // Taux couleur
  const tauxColor = my.taux >= 50 ? '#22c55e' : my.taux >= 25 ? '#f59e0b' : '#ef4444';
  const ecartIndice = myIndice - 100; // vs médiane (100)
  const ecartColor = ecartIndice >= 0 ? '#22c55e' : '#ef4444';

  const isOpen = _S._assocOpenId === id;

  return `<div class="s-card rounded-xl border overflow-hidden mb-3">
    <div class="px-4 py-3 cursor-pointer hover:s-hover flex items-center justify-between" onclick="window._assocToggle('${id}')">
      <div class="flex items-center gap-2">
        <span class="text-[10px] font-mono px-2 py-0.5 rounded" style="background:rgba(139,92,246,0.15);color:#8b5cf6">${escapeHtml(famA)}</span>
        <span class="t-disabled">→</span>
        <span class="text-[10px] font-mono px-2 py-0.5 rounded" style="background:rgba(59,130,246,0.15);color:#3b82f6">${escapeHtml(famB)}</span>
        <span class="text-[11px] t-primary font-medium ml-2">${escapeHtml(labelA)} × ${escapeHtml(labelB)}</span>
      </div>
      <div class="flex items-center gap-3">
        <span class="text-lg font-black" style="color:${tauxColor}">${my.taux}%</span>
        <span class="text-[10px]" style="color:${ecartColor}">indice ${myIndice} <span class="t-disabled">(méd. 100)</span></span>
        <button onclick="event.stopPropagation();window._assocDelete('${id}')" class="text-[10px] t-disabled hover:text-red-400 ml-2" title="Supprimer">🗑️</button>
      </div>
    </div>
    ${isOpen ? `<div class="border-t b-light px-4 py-3">
      <!-- KPIs -->
      <div class="grid grid-cols-4 gap-3 mb-3">
        <div class="text-center p-3 rounded-lg" style="background:rgba(139,92,246,0.12)">
          <div class="text-[10px] font-semibold t-secondary mb-1">Mon taux</div>
          <div class="text-2xl font-black" style="color:${tauxColor}">${my.taux}%</div>
          <div class="text-[10px] t-secondary mt-0.5">${my.clientsAB.size} / ${my.clientsA.size} clients</div>
        </div>
        <div class="text-center p-3 rounded-lg" style="background:rgba(59,130,246,0.12)">
          <div class="text-[10px] font-semibold t-secondary mb-1">Mon indice réseau</div>
          <div class="text-2xl font-black" style="color:${ecartColor}">${myIndice}</div>
          <div class="text-[10px] t-secondary mt-0.5">${bench.length} agences · méd. = 100</div>
        </div>
        <div class="text-center p-3 rounded-lg" style="background:rgba(34,197,94,0.12)">
          <div class="text-[10px] font-semibold t-secondary mb-1">Meilleure agence</div>
          <div class="text-2xl font-black" style="color:#22c55e">${best ? 'indice ' + best.indice : '—'}</div>
          <div class="text-[10px] t-secondary mt-0.5">${best ? best.store + ' · ' + formatEuro(best.caB) + ' CA B' : '—'}</div>
        </div>
        <div class="text-center p-3 rounded-lg" style="background:rgba(245,158,11,0.12)">
          <div class="text-[10px] font-semibold t-secondary mb-1">Clients cibles</div>
          <div class="text-2xl font-black" style="color:#f59e0b">${targets.length}</div>
          <div class="text-[10px] t-secondary mt-0.5">achètent A pas B</div>
        </div>
      </div>

      <!-- Geste 1 — Benchmark remonté sous les KPIs, accordéon fermé -->
      ${bench.length ? `<details class="mb-3">
        <summary class="text-[11px] font-bold t-primary cursor-pointer py-1.5">📊 Classement ${bench.length} agences · ratio mix CA ${escapeHtml(labelB)} / CA ${escapeHtml(labelA)}${_assocMetierFilter ? ' <span class="font-normal t-disabled">(benchmark non filtré par métier)</span>' : ''}</summary>
        <table class="w-full text-[11px] mt-1">
          <thead><tr class="border-b b-light text-[10px]" style="color:var(--t-secondary)">
            <th class="py-1 px-2 text-left">Agence</th>
            <th class="py-1 px-2 text-right">Ratio B/A</th>
            <th class="py-1 px-2 text-right">CA ${escapeHtml(labelA)}</th>
            <th class="py-1 px-2 text-right">CA ${escapeHtml(labelB)}</th>
            <th class="py-1 px-2 text-right">Refs B</th>
          </tr></thead>
          <tbody>${bench.slice(0, 15).map(r => {
            const c = r.ratio >= 50 ? '#22c55e' : r.ratio >= 25 ? '#f59e0b' : '#ef4444';
            return `<tr class="border-b b-light text-[11px]">
              <td class="py-1 px-2 t-primary">${r.store}</td>
              <td class="py-1 px-2 text-right font-bold" style="color:${c}">${r.ratio}%</td>
              <td class="py-1 px-2 text-right t-secondary">${formatEuro(r.caA)}</td>
              <td class="py-1 px-2 text-right t-secondary">${formatEuro(r.caB)}</td>
              <td class="py-1 px-2 text-right t-secondary">${r.refsB}</td>
            </tr>`;
          }).join('')}</tbody>
        </table>
      </details>` : ''}

      <!-- Geste 2 — Split-Screen : Refs (gauche) + Clients (droite) -->
      <div class="grid grid-cols-1 ${missingRefs.length && targets.length ? 'lg:grid-cols-2' : ''} gap-4">
      <!-- Refs manquantes (Geste 3 — triées par verdict) -->
      ${missingRefs.length ? `<div>
        <div class="flex items-center justify-between mb-2">
          <h4 class="text-[11px] font-bold t-primary">📦 Refs à développer <span class="text-[9px] t-disabled font-normal">— vs ${best?.store || '?'} (ratio ${best?.ratio || 0}%)</span></h4>
          <button onclick="window._assocExportTrous('${id}')" class="text-[10px] px-3 py-1 rounded-lg font-bold cursor-pointer" style="background:var(--c-action);color:#fff" title="Exporter Trous + Socles en CSV">📥 Export Action</button>
        </div>
        <div style="max-height:350px;overflow-y:auto">
        <table class="w-full text-[11px]">
          <thead style="position:sticky;top:0;background:var(--color-bg-primary)"><tr class="border-b b-light text-[10px]" style="color:var(--t-secondary)">
            <th class="py-1 px-2 text-left">Code</th>
            <th class="py-1 px-2 text-left">Libellé</th>
            <th class="py-1 px-2 text-right">CA ${best?.store || '?'}</th>
            <th class="py-1 px-2 text-right">CA moi</th>
            <th class="py-1 px-2 text-center">Verdict</th>
          </tr></thead>
          <tbody>${[...missingRefs].sort((a,b) => {
            const _vo = {implanter:0,socle:1,challenger:2,surveiller:3};
            const va = a.sqClassif ? (_vo[a.sqClassif] ?? 4) : (a.enStock ? 4 : 5);
            const vb = b.sqClassif ? (_vo[b.sqClassif] ?? 4) : (b.enStock ? 4 : 5);
            return va - vb || b.bestCa - a.bestCa;
          }).map(r => {
            const _sqI = window._getArticleSqInfo?.(r.code);
            const isBruit = !_sqI && !r.enStock;
            const verdict = _sqI ? `<span title="${_sqI.verdict.tip}" style="color:${_sqI.verdict.color}">${_sqI.verdict.icon} ${_sqI.verdict.name}</span>`
              : r.enStock ? '<span title="En stock — hors squelette" style="color:#22c55e">● Stock</span>' : '<span title="Hors squelette" style="color:var(--t-disabled)">⚪ Bruit</span>';
            return `<tr class="border-b b-light${isBruit ? ' opacity-40' : ''}">
            <td class="py-1 px-2 font-mono t-disabled">${r.code}<span class="ml-1 cursor-pointer opacity-50 hover:opacity-100" onclick="event.stopPropagation();if(window.openArticlePanel)window.openArticlePanel('${r.code}','associations')" title="Voir détail article">🔍</span></td>
            <td class="py-1 px-2 t-primary truncate max-w-[160px]">${escapeHtml(r.libelle)}</td>
            <td class="py-1 px-2 text-right font-bold" style="color:#22c55e">${formatEuro(r.bestCa)}</td>
            <td class="py-1 px-2 text-right t-secondary">${r.myCa > 0 ? formatEuro(r.myCa) : '—'}</td>
            <td class="py-1 px-2 text-center text-[10px] font-bold whitespace-nowrap">${verdict}</td>
          </tr>`;}).join('')}</tbody>
        </table>
        </div>
      </div>` : ''}

      <!-- Clients cibles -->
      ${targets.length ? `<div>
        <h4 class="text-[11px] font-bold t-primary mb-2">🎯 Clients cibles <span class="text-[9px] t-disabled font-normal">— achètent ${escapeHtml(labelA)} pas ${escapeHtml(labelB)}</span></h4>
        <div style="max-height:350px;overflow-y:auto">
        <table class="w-full text-[11px]">
          <thead style="position:sticky;top:0;background:var(--color-bg-primary)"><tr class="border-b b-light text-[10px]" style="color:var(--t-secondary)">
            <th class="py-1 px-2 text-left">Client</th>
            <th class="py-1 px-2 text-left">Métier</th>
            <th class="py-1 px-2 text-left">Classif.</th>
            <th class="py-1 px-2 text-right">CA ${escapeHtml(labelA)}</th>
          </tr></thead>
          <tbody>${targets.map(c => `<tr class="border-b b-light hover:s-hover cursor-pointer" onclick="if(window.openClient360)window.openClient360('${c.cc}','associations')">
            <td class="py-1 px-2 t-primary">${escapeHtml(c.nom)} <button onclick="event.stopPropagation();if(window.openClient360)window.openClient360('${c.cc}','associations')" class="text-[10px] t-disabled hover:text-white cursor-pointer opacity-30 hover:opacity-100 ml-0.5" title="Fiche 360°">🔍</button></td>
            <td class="py-1 px-2 t-secondary text-[10px]">${escapeHtml(c.metier)}</td>
            <td class="py-1 px-2 t-secondary text-[10px]">${escapeHtml(c.classification)}</td>
            <td class="py-1 px-2 text-right font-bold" style="color:var(--c-action)">${formatEuro(c.caA)}</td>
          </tr>`).join('')}</tbody>
        </table>
        </div>
      </div>` : ''}
      </div>
    </div>` : ''}
  </div>`;
}

// ═══════════════════════════════════════════════════════════════
// Export CSV des 🔴 Trous
// ═══════════════════════════════════════════════════════════════

function _exportTrous(assocId) {
  const data = _S._assocMissingRefs?.[assocId];
  if (!data) return;
  const trous = data.refs.filter(r => r.sqClassif === 'implanter');
  if (!trous.length) { if (window.showToast) window.showToast('Aucun 🔴 Trou dans cette association', 'warning'); return; }
  const sep = ';';
  const header = ['Code', 'Libelle', 'CA ' + data.bestStore, 'CA moi', 'Ecart %', 'Verdict'].join(sep);
  const rows = trous.map(r => [r.code, `"${(r.libelle || '').replace(/"/g, '""')}"`, Math.round(r.bestCa), Math.round(r.myCa), r.ecart + '%', 'Trou critique'].join(sep));
  const csv = '\uFEFF' + header + '\n' + rows.join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `trous_${data.famA.replace(/\s+/g, '_')}_x_${data.famB.replace(/\s+/g, '_')}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  if (window.showToast) window.showToast(`📥 ${trous.length} ref(s) 🔴 Trou exportées`, 'success');
}
window._assocExportTrous = _exportTrous;

// ═══════════════════════════════════════════════════════════════
// Physigamme — couverture métiers
// ═══════════════════════════════════════════════════════════════

/**
 * Calcule la couverture métiers pour chaque article d'un univers.
 * @param {string} universLetter — lettre univers ('E','O',...) ou '' pour tout
 * @param {Set<string>|null} metiersSet — métiers à analyser, null = tous stratégiques
 * @returns {{ articles: Array, totalMetiers: number, troncCount: number, interCount: number, specCount: number }}
 */
function _getEffectivePerimetre() {
  if (_troncPerimetre) return _troncPerimetre;
  // Auto-detect : réseau si consommé multi-agences, sinon agence
  const si = _S.storesIntersection;
  return (si?.size > 1 || Object.keys(_S.ventesParAgence || {}).length > 1) ? 'reseau' : 'agence';
}

function _computeTroncCommun(universLetter, metiersSet) {
  return computePhysigamme({
    universLetter,
    metiersSet,
    includeAll: _troncIncludeAll,
    perimetre: _getEffectivePerimetre()
  });
}

function _troncEffectiveMetiers() {
  const chal = _S.chalandiseData;
  const allStrat = new Set();
  const allMetiers = new Set();
  if (!chal?.size) return { effectiveMetiers: allStrat, allStrat, allMetiers, isCustom: false };
  for (const info of chal.values()) {
    if (info.metier && info.metier.length > 2) {
      allMetiers.add(info.metier);
      if (_isMetierStrategique(info.metier)) allStrat.add(info.metier);
    }
  }
  const isCustom = _troncCustomMetiers !== null;
  const effectiveMetiers = isCustom ? _troncCustomMetiers : (_troncIncludeAll ? allMetiers : allStrat);
  return { effectiveMetiers, allStrat, allMetiers, isCustom };
}

function _troncActionContext(store, { excludeStore = false } = {}) {
  const storesAll = _troncStoreKeys();
  const stores = excludeStore ? storesAll.filter(s => s !== store) : storesAll;
  const storeSnapshots = new Map(storesAll.map(s => [s, _vpmForStore(s)]));
  const { effectiveMetiers } = _troncEffectiveMetiers();
  const data = _computeTroncCommun(_troncUniversFilter, effectiveMetiers);
  let troncArts = data.articles.filter(a => a.indice >= 60);

  if (_troncLoiAirain && stores.length > 1) {
    const storeThreshold = Math.ceil(stores.length * 60 / 100);
    troncArts = troncArts.filter(a => {
      let sc = 0;
      for (const s of stores) {
        const d = storeSnapshots.get(s)?.[a.code];
        if ((d?.sumCA || 0) > 0 || (d?.sumPrelevee || 0) > 0) sc++;
      }
      return sc >= storeThreshold;
    });
  }

  return { storesAll, stores, storeSnapshots, troncArts };
}

function _renderTroncCommun() {
  const chal = _S.chalandiseData;
  if (!chal?.size) {
    return `<div class="text-center t-disabled py-8">Chargez la zone de chalandise pour activer la Physigamme.</div>`;
  }

  // ── All métiers available ──
  const allStratMetiers = new Set();
  const allMetiers = new Set();
  for (const info of chal.values()) {
    if (info.metier && info.metier.length > 2) {
      allMetiers.add(info.metier);
      if (_isMetierStrategique(info.metier)) allStratMetiers.add(info.metier);
    }
  }
  // Le picker montre tous les métiers, pas seulement les strat
  const pickerMetiers = allMetiers;

  // Univers buttons supprimés — pilotés par le sidebar Direction

  // ── Périmètre : PDV omnicanal agence, réseau consommé, territoire Qlik ──
  const hasTerrain = _S.territoireReady && _S.territoireLines?.length > 0;
  const _perimTooltips = {
    agence: 'Consommé de mon agence, tous canaux PDV (MAGASIN/Web/Rep/DCS)',
    reseau: 'Ventes de toutes les agences du fichier consommé',
    territoire: 'Tous canaux du fichier Qlik (PDV + Réseau + Livraisons DCS/Web)'
  };
  const _perimBtn = (id, icon, label, needsTerrain) => {
    const sel = _getEffectivePerimetre() === id;
    const disabled = needsTerrain && !hasTerrain;
    const tip = _perimTooltips[id] || '';
    if (disabled) {
      return `<button disabled class="text-[10px] px-2.5 py-1 rounded font-bold transition-all opacity-40 cursor-not-allowed" style="background:var(--bg-card)" title="⚠️ Chargez le fichier Territoire (Qlik) pour débloquer">${icon} ${label}</button>`;
    }
    return `<button onclick="window._troncSetPerimetre('${id}')" class="text-[10px] px-2.5 py-1 rounded font-bold cursor-pointer transition-all ${sel ? 'text-white' : 't-disabled hover:t-primary'}" style="${sel ? 'background:var(--c-action)' : 'background:var(--bg-card)'}" title="${tip}">${icon} ${label}</button>`;
  };

  // ── Effective métiers set ──
  // null + 100% → tous les métiers ; null → strat seulement ; Set = sélection custom
  const isCustom = _troncCustomMetiers !== null;
  const effectiveMetiers = isCustom
    ? _troncCustomMetiers
    : (_troncIncludeAll ? allMetiers : allStratMetiers);

  const data = _computeTroncCommun(_troncUniversFilter, effectiveMetiers, isCustom);

  if (!_troncUniversFilter) {
    return `<div class="text-center t-disabled py-8 text-[11px]">← Sélectionnez un univers dans le panneau de gauche</div>`;
  }

  // ── Loi d'Airain globale : filtre ≥60% agences sur TOUT le Tronc Commun ──
  let _airainApplied = false;
  let _airainTotal = data.articles.length;
  if (_troncLoiAirain) {
    const stores = _troncStoreKeys();
    const storeData = new Map(stores.map(s => [s, _vpmForStore(s)]));
    if (stores.length > 1) {
      const storeThreshold = Math.ceil(stores.length * 60 / 100);
      data.articles = data.articles.filter(a => {
        let sc = 0;
        for (const s of stores) {
          const d = storeData.get(s)?.[a.code];
          if ((d?.sumCA || 0) > 0 || (d?.sumPrelevee || 0) > 0) sc++;
        }
        return sc >= storeThreshold;
      });
      _airainApplied = true;
      // Recount KPI categories
      data.troncCount = data.articles.filter(a => a.indice >= 60).length;
      data.interCount = data.articles.filter(a => a.indice >= 30 && a.indice < 60).length;
      data.specCount = data.articles.filter(a => a.indice < 30).length;
    }
  }

  // ── Filtre famille/sous-famille depuis sidebar Direction ──
  const _dirFam = typeof window._dirGetFamilleFilter === 'function' ? window._dirGetFamilleFilter() : '';
  const _dirSF = typeof window._dirGetSousFamilleFilter === 'function' ? window._dirGetSousFamilleFilter() : '';
  if (_dirFam) {
    data.articles = data.articles.filter(a => (a.famille || '') === _dirFam);
    if (_dirSF) {
      data.articles = data.articles.filter(a => {
        const sf = _S.catalogueFamille?.get(a.code)?.sousFam || '';
        return sf === _dirSF;
      });
    }
    data.troncCount = data.articles.filter(a => a.indice >= 60).length;
    data.interCount = data.articles.filter(a => a.indice >= 30 && a.indice < 60).length;
    data.specCount = data.articles.filter(a => a.indice < 30).length;
  }

  // ── Geste 2 : KPI cards cliquables (filtrent le tableau) ──
  const _kpiBtn = (filterId, label, value, color, sub) => {
    const sel = _troncKpiFilter === filterId;
    const ring = sel ? `outline:2px solid ${color};outline-offset:2px;` : '';
    return `<button onclick="window._troncSetKpiFilter('${filterId}')" class="rounded-lg p-3 text-center cursor-pointer transition-all w-full" style="background:var(--bg-card);${ring}">
      <div class="text-2xl font-black" style="color:${color}">${value}</div>
      <div class="text-[10px] font-bold t-primary">${label}</div>
      ${sub ? `<div class="text-[9px] t-disabled mt-0.5">${sub}</div>` : ''}
    </button>`;
  };

  // ── Geste 3 : Cluster métier picker ──
  const defaultLabel = _troncIncludeAll ? `${allMetiers.size} métiers` : `${allStratMetiers.size} strat.`;
  const clusterLabel = isCustom ? `${_troncCustomMetiers.size} métier${_troncCustomMetiers.size > 1 ? 's' : ''}` : defaultLabel;
  let metierPickerHtml = '';
  if (_troncMetierPickerOpen) {
    // Build direction → métiers mapping from chalandise
    const dirMetiers = new Map(); // direction → Set<metier>
    for (const info of chal.values()) {
      if (!info.metier) continue;
      const metier = info.metier;
      if (!pickerMetiers.has(metier)) continue;
      const sectCode = info.secteur || '';
      const dir = sectCode ? (SECTEUR_DIR_MAP[sectCode.charAt(0).toUpperCase()] || 'Non classé') : 'Non classé';
      if (!dirMetiers.has(dir)) dirMetiers.set(dir, new Set());
      dirMetiers.get(dir).add(metier);
    }
    // Also add métiers not found in chalandise secteurs to "Non classé"
    for (const m of pickerMetiers) {
      let found = false;
      for (const s of dirMetiers.values()) { if (s.has(m)) { found = true; break; } }
      if (!found) {
        if (!dirMetiers.has('Non classé')) dirMetiers.set('Non classé', new Set());
        dirMetiers.get('Non classé').add(m);
      }
    }
    // Sort directions (Non classé last)
    const dirOrder = [...dirMetiers.keys()].sort((a, b) => {
      if (a === 'Non classé') return 1;
      if (b === 'Non classé') return -1;
      return a.localeCompare(b);
    });

    let groupsHtml = '';
    for (const dir of dirOrder) {
      const metiers = [...dirMetiers.get(dir)].sort();
      const allChecked = metiers.every(m => effectiveMetiers.has(m));
      const someChecked = metiers.some(m => effectiveMetiers.has(m));
      const dirColor = allChecked ? '#22c55e' : someChecked ? '#f59e0b' : 'var(--border)';
      const checks = metiers.map(m => {
        const checked = effectiveMetiers.has(m);
        return `<label class="flex items-center gap-1.5 text-[10px] cursor-pointer py-0.5 ${checked ? 't-primary font-bold' : 't-disabled'}">
          <input type="checkbox" ${checked ? 'checked' : ''} onchange="window._troncToggleMetier('${escapeHtml(m)}')" class="cursor-pointer accent-cyan-500" />
          ${escapeHtml(m)}
        </label>`;
      }).join('');
      groupsHtml += `<div class="rounded px-2 py-1.5" style="background:var(--bg-surface);border-left:3px solid ${dirColor}">
        <div class="flex items-center justify-between mb-1">
          <button onclick="window._troncToggleDirection('${escapeHtml(dir)}')" class="text-[10px] font-bold cursor-pointer hover:brightness-110 ${allChecked ? 't-primary' : someChecked ? '' : 't-disabled'}" style="${allChecked ? 'color:#22c55e' : someChecked ? 'color:#f59e0b' : ''}" title="Cliquer pour (dé)sélectionner tout le groupe">
            ${allChecked ? '✅' : someChecked ? '◐' : '○'} ${escapeHtml(dir)} <span class="text-[8px] t-disabled">(${metiers.length})</span>
          </button>
        </div>
        <div class="grid grid-cols-2 gap-x-3">${checks}</div>
      </div>`;
    }

    metierPickerHtml = `<div class="rounded-lg p-3 mt-2 space-y-2" style="background:var(--bg-card);border:1px solid var(--border)">
      <div class="flex items-center justify-between mb-1">
        <span class="text-[10px] font-bold t-primary">👥 Cluster de métiers par Direction</span>
        <div class="flex gap-1">
          <button onclick="window._troncSelectAllMetiers()" class="text-[9px] px-2 py-0.5 rounded cursor-pointer" style="background:var(--bg-surface);color:var(--c-action)">Tous</button>
          <button onclick="window._troncClearMetiers()" class="text-[9px] px-2 py-0.5 rounded cursor-pointer" style="background:var(--bg-surface);color:#ef4444">Aucun</button>
        </div>
      </div>
      <div class="space-y-1.5">${groupsHtml}</div>
    </div>`;
  }

  const perimLabels = PHYSIGAMME_COPY.perimeters;

  let html = `<div class="space-y-3">
    ${renderPhysigammeHero({ articleCount: data.articles.length, perimLabel: perimLabels[_getEffectivePerimetre()] })}
    <div class="flex items-center justify-between flex-wrap gap-2">
      <div class="flex gap-1">
        <button onclick="window._troncToggleMetierPicker()" class="text-[10px] px-2.5 py-1 rounded font-bold cursor-pointer transition-all ${_troncMetierPickerOpen ? 'text-white' : 'text-white hover:brightness-110'}" style="background:${_troncMetierPickerOpen ? 'var(--c-action)' : '#6366f1'};${_troncMetierPickerOpen ? 'outline:2px solid var(--c-action);outline-offset:1px' : ''}" title="Cliquer pour choisir les métiers du cluster">👥 ${isCustom ? _troncCustomMetiers.size + ' métiers' : clusterLabel} ▾</button>
        <button onclick="window._troncToggleIncludeAll()" class="text-[10px] px-2.5 py-1 rounded font-bold cursor-pointer transition-all ${_troncIncludeAll ? 'text-white' : 't-disabled hover:t-primary'}" style="${_troncIncludeAll ? 'background:#22c55e' : 'background:var(--bg-card)'}" title="Inclure 100% des clients du fichier, même sans métier stratégique">📂 100%</button>
        <span class="text-[8px] t-disabled mx-1">│</span>
        ${_perimBtn('agence', '🏢', 'PDV', false)}${_perimBtn('reseau', '🏪', 'Réseau', false)}${_perimBtn('territoire', '🌍', 'Territoire', true)}
      </div>
    </div>
    ${metierPickerHtml}
    ${renderPhysigammeKpis({ data, includeAll: _troncIncludeAll, isCustom, renderKpi: _kpiBtn })}`;

  // ── Bandeau périmètre actif + "Hors radar" ──
  html += renderPhysigammePerimeterBar({ perimLabel: perimLabels[_getEffectivePerimetre()], articleCount: data.articles.length, totalMetiers: data.totalMetiers });
  html += renderPhysigammeOutOfScope({ clients: data.clientsHorsMetier, ca: data.caHorsMetier });

  if (!data.articles.length) {
    html += `<div class="text-center t-disabled py-4">Aucun article trouvé pour cet univers.</div></div>`;
    return html;
  }

  // ── Toggle vue Articles / Cartographie ──
  const _vueBtn = (id, icon, label) => {
    const sel = _troncVue === id;
    return `<button onclick="window._troncSetVue('${id}')" class="text-[10px] px-3 py-1 rounded font-bold cursor-pointer transition-all ${sel ? 'text-white' : 't-disabled hover:t-primary'}" style="${sel ? 'background:var(--c-action)' : 'background:var(--bg-card)'}">${icon} ${label}</button>`;
  };
  const hasVpm = _S.ventesParAgence && Object.keys(_S.ventesParAgence).length > 1;
  html += `<div class="flex gap-1">${_vueBtn('articles', '📋', 'Décisions articles')}${_vueBtn('carto', '🗺️', 'Cartographie Métiers')}${hasVpm ? _vueBtn('conformite', '🚨', 'Déploiement agences') : ''}</div>`;

  // ══════════════ VUE CARTOGRAPHIE (Heatmap Famille × Métier) ══════════════
  if (_troncVue === 'carto') {
    // Agréger : Famille → Métier → { ca, clients }
    const famMetierMatrix = new Map(); // famCode → Map<metier, {ca, clients: Set}>
    const allMetiersInData = new Set();
    const famCATotals = new Map(); // famCode → total CA
    for (const art of data.articles) {
      const cf = art.famille;
      if (!cf) continue;
      if (!famMetierMatrix.has(cf)) famMetierMatrix.set(cf, new Map());
      const mm = famMetierMatrix.get(cf);
      for (const [metier, d] of art.metierDetail) {
        allMetiersInData.add(metier);
        if (!mm.has(metier)) mm.set(metier, { ca: 0, clients: new Set() });
        const e = mm.get(metier);
        e.ca += d.ca;
        for (const c of d.clients) e.clients.add(c);
      }
      famCATotals.set(cf, (famCATotals.get(cf) || 0) + art.caTotal);
    }

    // Trier métiers par CA total desc
    const metierTotals = new Map();
    for (const [, mm] of famMetierMatrix) {
      for (const [m, d] of mm) metierTotals.set(m, (metierTotals.get(m) || 0) + d.ca);
    }
    const metiersOrdered = [...allMetiersInData].sort((a, b) => (metierTotals.get(b) || 0) - (metierTotals.get(a) || 0));

    // Trier familles par CA total desc
    const famsOrdered = [...famMetierMatrix.keys()].sort((a, b) => (famCATotals.get(b) || 0) - (famCATotals.get(a) || 0));

    // Max CA pour la heatmap (échelle)
    let maxCellCA = 0;
    for (const [, mm] of famMetierMatrix) {
      for (const [, d] of mm) { if (d.ca > maxCellCA) maxCellCA = d.ca; }
    }

    // Render heatmap
    html += `<div class="overflow-x-auto" style="max-height:70vh;overflow-y:auto">
      <table class="w-full text-[10px]" style="border-collapse:collapse">
      <thead><tr>
        <th class="text-left py-1 px-2 sticky left-0" style="background:var(--bg-base);z-index:2;min-width:100px">Famille</th>
        ${metiersOrdered.map(m => `<th class="py-1 px-1 text-center" style="writing-mode:vertical-lr;text-orientation:mixed;min-width:28px;max-width:32px;height:120px;font-size:9px;font-weight:600" title="${escapeHtml(m)}">${escapeHtml(m.length > 18 ? m.slice(0, 16) + '…' : m)}</th>`).join('')}
        <th class="text-right py-1 px-2 text-[9px] t-disabled">Total</th>
      </tr></thead><tbody>`;

    for (const cf of famsOrdered) {
      const mm = famMetierMatrix.get(cf);
      const famTotal = famCATotals.get(cf) || 0;
      html += `<tr style="border-bottom:1px solid var(--border)">
        <td class="py-1 px-2 font-bold t-primary sticky left-0 text-[9px]" style="background:var(--bg-base);z-index:1;white-space:nowrap">${_famLabel(cf)}</td>`;
      for (const m of metiersOrdered) {
        const cell = mm?.get(m);
        if (cell && cell.ca > 0) {
          const intensity = Math.round((cell.ca / maxCellCA) * 100);
          // Couleur : du transparent au cyan vif
          const alpha = Math.max(0.08, intensity / 100);
          const bg = `rgba(34,211,238,${alpha.toFixed(2)})`;
          const textColor = intensity > 50 ? '#fff' : 'var(--t-primary)';
          html += `<td class="py-0.5 px-0.5 text-center cursor-default" style="background:${bg};color:${textColor}" title="${escapeHtml(m)} × ${_famLabel(cf)}\nCA: ${formatEuro(cell.ca)}\nClients: ${cell.clients.size}">
            <div class="text-[8px] font-bold">${cell.ca >= 1000 ? Math.round(cell.ca / 1000) + 'k' : Math.round(cell.ca)}</div>
          </td>`;
        } else {
          html += `<td class="py-0.5 px-0.5"></td>`;
        }
      }
      html += `<td class="text-right py-1 px-2 text-[9px] t-disabled font-bold">${formatEuro(famTotal)}</td></tr>`;
    }

    // Ligne total métier
    html += `<tr style="border-top:2px solid var(--border)">
      <td class="py-1 px-2 font-bold text-[9px] sticky left-0" style="background:var(--bg-base);z-index:1">Total</td>`;
    for (const m of metiersOrdered) {
      const total = metierTotals.get(m) || 0;
      html += `<td class="py-1 px-0.5 text-center text-[8px] font-bold t-disabled">${total >= 1000 ? Math.round(total / 1000) + 'k' : Math.round(total)}</td>`;
    }
    const grandTotal = [...famCATotals.values()].reduce((s, v) => s + v, 0);
    html += `<td class="text-right py-1 px-2 text-[9px] font-bold t-primary">${formatEuro(grandTotal)}</td></tr>`;

    html += `</tbody></table></div></div>`;
    return html;
  }

  // ══════════════ VUE DÉPLOIEMENT AGENCES ══════════════
  if (_troncVue === 'conformite') {
    const stores = _troncStoreKeys();
    const storeSnapshots = new Map(stores.map(s => [s, _vpmForStore(s)]));
    const deployment = buildPhysigammeDeployment({
      articles: data.articles,
      stores,
      storeSnapshots,
      amorcageStores: _troncAmorcageStores,
      airainApplied: _airainApplied,
      airainTotal: _airainTotal,
      totalMetiers: data.totalMetiers
    });
    html += renderPhysigammeDeployment({ deployment, myStore: _S.selectedMyStore });
    return html;
  }

  // ══════════════ VUE ARTICLES / DÉCISIONS PHYSIGAMME ══════════════
  const verdictMap = new Map();
  for (const r of (DataStore.finalData || [])) {
    if (r?._sqClassif) verdictMap.set(r.code, { classif: r._sqClassif, verdict: r._sqVerdict || '', stock: (r.stockActuel || 0) > 0 });
  }

  html += renderPhysigammeArticleTable({
    data,
    kpiFilter: _troncKpiFilter,
    effectiveMetiers,
    verdictMap,
    openFams: _troncOpenFams,
    expandedCode: _troncExpandedCode,
    famLabel: _famLabel
  });
  return html;
}

// ═══════════════════════════════════════════════════════════════
// Rendu onglet complet
// ═══════════════════════════════════════════════════════════════

export function renderAssociationsTab() {
  _famStatsCache = null; // Invalider le cache stats à chaque rendu

  // Si l'onglet Direction > Physigamme (conformite) est actif, rendre là-bas
  const confEl = document.getElementById('conformiteContent');
  const confTab = document.getElementById('tabConformite');
  if (confEl && confTab && !confTab.classList.contains('hidden')) {
    confEl.innerHTML = `<div class="container mx-auto">${_renderTroncCommun()}</div>`;
    return;
  }

  const el = document.getElementById('assocContent');
  if (el) el.innerHTML = _renderAssociations();

  // Restore sélection famille A dans l'éditeur
  if (_S._assocEditMode && _S._assocEditing?.famA) {
    const sA = document.getElementById('assocSelA');
    if (sA) sA.value = _S._assocEditing.famA;
  }
}

// ═══════════════════════════════════════════════════════════════
// Handlers globaux
// ═══════════════════════════════════════════════════════════════

window._assocNew = function() {
  _S._assocEditMode = true;
  _S._assocEditing = { famA: '', famB: '' };
  _S._assocSearchA = '';
  _assocUniversFilter = '';
  _famStatsCache = null;
  renderAssociationsTab();
};

window._assocSelectA = function(famA) {
  if (!_S._assocEditing) _S._assocEditing = { famA: '', famB: '' };
  _S._assocEditing.famA = famA;
  _S._assocEditing.famB = '';
  _S._assocSearchA = '';
  _assocUniversFilter = '';
  _famStatsCache = null;
  renderAssociationsTab();
};

window._assocFilterA = function(query) {
  _S._assocSearchA = query;
  _famStatsCache = null;
  renderAssociationsTab();
};

window._assocPickB = function(famB) {
  // Geste 5 — Clic final : auto-save et ouverture directe
  if (!_S._assocEditing) return;
  const famA = _S._assocEditing.famA;
  if (!famA || !famB || famA === famB) return;

  _ensureAssoc();
  // Vérifier doublon
  if (_S._associations.some(a => a.famA === famA && a.famB === famB)) {
    // Existe déjà : fermer l'éditeur et ouvrir la card
    const existing = _S._associations.find(a => a.famA === famA && a.famB === famB);
    _S._assocEditMode = false;
    _S._assocEditing = null;
    _S._assocOpenId = existing.id;
    renderAssociationsTab();
    return;
  }

  _S._associations.push({
    id: _assocId(),
    famA,
    famB,
    label: `${_famLabel(famA)} × ${_famLabel(famB)}`,
    dateCreated: new Date().toISOString()
  });

  _S._assocEditMode = false;
  _S._assocEditing = null;
  _S._assocSearchA = '';
  _S._assocOpenId = _S._associations[_S._associations.length - 1].id;

  _saveSessionToIDB();
  renderAssociationsTab();
};

window._assocCancel = function() {
  _S._assocEditMode = false;
  _S._assocEditing = null;
  _S._assocSearchA = '';
  renderAssociationsTab();
};

window._assocDelete = function(id) {
  _ensureAssoc();
  _S._associations = _S._associations.filter(a => a.id !== id);
  _saveSessionToIDB();
  renderAssociationsTab();
};

window._assocToggle = function(id) {
  _S._assocOpenId = _S._assocOpenId === id ? null : id;
  renderAssociationsTab();
};

window._assocSetMetier = function(metier) {
  _assocMetierFilter = metier || '';
  _famStatsCache = null;
  renderAssociationsTab();
};

window._assocSetStrat = function(mode) {
  _assocStratFilter = _assocStratFilter === mode ? '' : mode;
  // Si le métier actif n'est plus visible après le filtre, le reset
  if (_assocMetierFilter) {
    if (_assocMetierFilter === '__nonclasse__') {
      // Non classé n'est ni strat ni hors → reset si un filtre strat est actif
      if (_assocStratFilter) _assocMetierFilter = '';
    } else {
      const isStrat = _isMetierStrategique(_assocMetierFilter);
      if ((_assocStratFilter === 'strat' && !isStrat) || (_assocStratFilter === 'hors' && isStrat)) {
        _assocMetierFilter = '';
      }
    }
  }
  _famStatsCache = null;
  renderAssociationsTab();
};

window._assocSetUnivers = function(letter) {
  _assocUniversFilter = _assocUniversFilter === letter ? '' : letter;
  renderAssociationsTab();
};

window._laboSetMode = function(mode) {
  _laboMode = mode || 'assoc';
  renderAssociationsTab();
};

window._troncSetUnivers = function(letter) {
  _troncUniversFilter = _troncUniversFilter === letter ? '' : letter;
  renderAssociationsTab();
};

// Silent setter — direction.js syncs its sidebar filter without triggering re-render
window._troncSetUniversSilent = function(letter) { _troncUniversFilter = letter; };

// State getter for Loi d'Airain — used by direction.js sidebar
window._troncLoiAirainState = function() { return _troncLoiAirain; };

window._troncSetPerimetre = function(perim) {
  // Sécurité : seul Territoire nécessite le fichier Qlik
  const hasTerr = _S.territoireReady && _S.territoireLines?.length > 0;
  if (perim === 'territoire' && !hasTerr) return;
  _troncPerimetre = (perim === 'agence' || perim === 'reseau' || perim === 'territoire') ? perim : 'agence';
  renderAssociationsTab();
};

// Geste 1 : Accordéon drill-down
window._troncToggleRow = function(code) {
  _troncExpandedCode = _troncExpandedCode === code ? '' : code;
  renderAssociationsTab();
};

// Toggle famille ouverte/fermée dans le tableau Tronc Commun
window._troncToggleFam = function(fam) {
  if (_troncOpenFams.has(fam)) _troncOpenFams.delete(fam);
  else _troncOpenFams.add(fam);
  renderAssociationsTab();
};

// Toggle vue Articles / Cartographie
window._troncSetVue = function(vue) {
  _troncVue = (vue === 'carto' || vue === 'conformite') ? vue : 'articles';
  renderAssociationsTab();
};

// ── Actions Déploiement Physigamme ─────────────────────────────
window._troncConfShowMissing = function(store) {
  const panel = document.getElementById('troncConfMissingPanel');
  if (!panel) return;
  const ctx = _troncActionContext(store);
  panel.innerHTML = renderMissingPanel({
    store,
    stores: ctx.stores,
    storeSnapshots: ctx.storeSnapshots,
    troncArts: ctx.troncArts,
    famLabel: _famLabel,
    libelleLookup: _S.libelleLookup,
    articleFamille: _S.articleFamille
  });
};

window._troncConfExport = function(store) {
  const ctx = _troncActionContext(store);
  exportMissingOrder({
    store,
    stores: ctx.stores,
    storeSnapshots: ctx.storeSnapshots,
    troncArts: ctx.troncArts,
    famLabel: _famLabel,
    libelleLookup: _S.libelleLookup,
    articleFamille: _S.articleFamille
  });
};

// Geste 2 : KPI filter cliquable
window._troncSetKpiFilter = function(filterId) {
  _troncKpiFilter = _troncKpiFilter === filterId ? '' : filterId;
  renderAssociationsTab();
};

// Geste 3 : Cluster métier picker
window._troncToggleMetierPicker = function() {
  _troncMetierPickerOpen = !_troncMetierPickerOpen;
  // Initialise le custom set si premier usage
  if (_troncMetierPickerOpen && !_troncCustomMetiers) {
    const chal = _S.chalandiseData;
    _troncCustomMetiers = new Set();
    if (chal?.size) {
      for (const info of chal.values()) {
        if (info.metier && _isMetierStrategique(info.metier)) _troncCustomMetiers.add(info.metier);
      }
    }
  }
  renderAssociationsTab();
};

window._troncToggleMetier = function(metier) {
  if (!_troncCustomMetiers) _troncCustomMetiers = new Set();
  if (_troncCustomMetiers.has(metier)) _troncCustomMetiers.delete(metier);
  else _troncCustomMetiers.add(metier);
  renderAssociationsTab();
};

// Toggle direction entière (sélectionne/désélectionne tous les métiers d'une direction)
window._troncToggleDirection = function(dir) {
  const chal = _S.chalandiseData;
  if (!chal?.size) return;
  // Build métiers de cette direction
  const dirMetiers = new Set();
  for (const info of chal.values()) {
    if (!info.metier || info.metier.length <= 2) continue;
    const sectCode = info.secteur || '';
    const d = sectCode ? (SECTEUR_DIR_MAP[sectCode.charAt(0).toUpperCase()] || 'Non classé') : 'Non classé';
    if (d === dir) dirMetiers.add(info.metier);
  }
  if (!dirMetiers.size) return;
  if (!_troncCustomMetiers) _troncCustomMetiers = new Set();
  // Si tous sont déjà cochés → décocher, sinon → cocher
  const allIn = [...dirMetiers].every(m => _troncCustomMetiers.has(m));
  if (allIn) {
    for (const m of dirMetiers) _troncCustomMetiers.delete(m);
  } else {
    for (const m of dirMetiers) _troncCustomMetiers.add(m);
  }
  renderAssociationsTab();
};

window._troncSelectAllMetiers = function() {
  _troncCustomMetiers = null; // null = tous les strat cochés par défaut
  renderAssociationsTab();
};

window._troncClearMetiers = function() {
  _troncCustomMetiers = new Set();
  renderAssociationsTab();
};

window._troncToggleIncludeAll = function() {
  _troncIncludeAll = !_troncIncludeAll;
  renderAssociationsTab();
};

// Expose Tronc Commun engine for Direction → Radar de Conformité
window._computeTroncCommunForRadar = function(universLetter) {
  // Calcul identique au Labo avec métiers stratégiques par défaut
  const chal = _S.chalandiseData;
  if (!chal?.size) return { articles: [], totalMetiers: 0, troncCount: 0 };
  const stratMetiers = new Set();
  for (const info of chal.values()) {
    if (info.metier && _isMetierStrategique(info.metier)) stratMetiers.add(info.metier);
  }
  return _computeTroncCommun(universLetter, stratMetiers, false);
};

// Expose Tronc Commun render for Direction > Conformité
window._renderTroncCommun = _renderTroncCommun;

window._troncToggleLoiAirain = function() {
  _troncLoiAirain = !_troncLoiAirain;
  // Re-render : si on est dans Direction > Conformité, re-render là-bas
  const confEl = document.getElementById('conformiteContent');
  const confTab = document.getElementById('tabConformite');
  if (confEl && confTab && !confTab.classList.contains('hidden')) {
    if (typeof window.renderConformiteTab === 'function') window.renderConformiteTab();
  } else {
    renderAssociationsTab();
  }
};

// ── Mode Implantation Initiale ──────────────────────────────────

window._troncToggleAmorcage = function(store) {
  if (_troncAmorcageStores.has(store)) _troncAmorcageStores.delete(store);
  else _troncAmorcageStores.add(store);
  // Re-render conformité
  const confTab = document.getElementById('tabConformite');
  if (confTab && !confTab.classList.contains('hidden') && typeof window.renderConformiteTab === 'function') {
    window.renderConformiteTab();
  } else {
    renderAssociationsTab();
  }
};

window._troncKitDemarrage = function(store) {
  const ctx = _troncActionContext(store, { excludeStore: true });
  if (!ctx.stores.length) return;
  if (!ctx.troncArts.length) {
    if (window.showToast) window.showToast('Aucun article Socle PDV à exporter', 'warning');
    return;
  }
  const result = exportStartupKit({
    store,
    stores: ctx.stores,
    storeSnapshots: ctx.storeSnapshots,
    troncArts: ctx.troncArts,
    finalData: DataStore.finalData
  });
  if (window.showToast) window.showToast(`Kit de Démarrage ${store} : ${result.totalRefs} réf. · ${formatEuro(result.totalVal)} BFR`, 'success');
};

// Geste 5 : Export CSV
window._troncExport = function() {
  const chal = _S.chalandiseData;
  if (!chal?.size || !_troncUniversFilter) return;
  const allStrat = new Set();
  const allMetiers = new Set();
  for (const info of chal.values()) {
    if (info.metier && info.metier.length > 2) {
      allMetiers.add(info.metier);
      if (_isMetierStrategique(info.metier)) allStrat.add(info.metier);
    }
  }
  const isCustom = _troncCustomMetiers !== null;
  const effectiveMetiers = isCustom
    ? _troncCustomMetiers : (_troncIncludeAll ? allMetiers : allStrat);
  const data = _computeTroncCommun(_troncUniversFilter, effectiveMetiers, isCustom);
  if (!data.articles.length) { if (window.showToast) window.showToast('Aucun article à exporter', 'warning'); return; }

  let filtered = data.articles;
  if (_troncKpiFilter === 'tronc') filtered = filtered.filter(a => a.indice >= 60);
  else if (_troncKpiFilter === 'inter') filtered = filtered.filter(a => a.indice >= 30 && a.indice < 60);
  else if (_troncKpiFilter === 'spec') filtered = filtered.filter(a => a.indice < 30);

  const verdictMap = new Map();
  for (const r of (DataStore.finalData || [])) {
    if (r?._sqClassif) verdictMap.set(r.code, { classif: r._sqClassif, verdict: r._sqVerdict || '', stock: (r.stockActuel || 0) > 0 });
  }

  const sep = ';';
  const header = ['Code', 'Article', 'Famille', 'Métiers', 'Couverture métiers %', 'CA', 'Clients', 'Décision Physigamme', 'Signal stock', 'Métiers achètent', 'Métiers ignorent'].join(sep);
  const rows = filtered.map(a => {
    const metiersQui = [...a.metierDetail.keys()].sort().join(', ');
    const metiersNon = [...effectiveMetiers].filter(m => !a.metierDetail.has(m)).sort().join(', ');
    const vd = verdictMap.get(a.code);
    const decision = getPhysigammeDecision(a, vd);
    const signalStock = vd ? (vd.classif || '') : '';
    return [a.code, `"${(a.libelle||'').replace(/"/g,'""')}"`, `"${a.famLib}"`, `${a.nbMetiers}/${data.totalMetiers}`, a.indice, Math.round(a.caTotal), a.nbClients, `"${decision.label}"`, signalStock, `"${metiersQui}"`, `"${metiersNon}"`].join(sep);
  });
  const csv = '\uFEFF' + header + '\n' + rows.join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const univName = FAM_LETTER_UNIVERS[_troncUniversFilter] || _troncUniversFilter;
  a.download = `physigamme_${univName.replace(/\s+/g, '_')}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  if (window.showToast) window.showToast(`📥 ${filtered.length} articles Physigamme exportés`, 'success');
};
