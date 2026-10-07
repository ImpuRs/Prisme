// © 2026 Jawad El Barkaoui — Tous droits réservés
// PRISME — associations.js
// Animation des ventes associées : benchmark réseau × familles croisées
// ═══════════════════════════════════════════════════════════════
'use strict';

import { _S } from './state.js';
import { formatEuro, escapeHtml, _isMetierStrategique } from './utils.js';
import { FAM_LETTER_UNIVERS } from './constants.js';
import { computeSquelette } from './engine.js';
import { _saveSessionToIDB } from './cache.js';
import { DataStore } from './store.js';
import { getVentesHorsMagFullMap } from './sales.js';

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
 * Vue omnicanale unifiée par client : merge ventesLocalMag12MG + ventesLocalHorsMag.
 * Retourne un itérateur de [cc, Map<code, {sumCA}>] — tous canaux confondus.
 * Le BL du co-achat se mesure au niveau client (a-t-il acheté A ET B ?), pas au niveau BL,
 * donc on agrège le CA tous canaux pour chaque couple (client, article).
 */
function _omniClientArticles() {
  const merged = new Map(); // cc → Map<code, {sumCA}>
  const hasFilter = !!_assocMetierFilter || !!_assocStratFilter;
  // Source 1 : MAGASIN (ventesLocalMag12MG — pleine période, structurel)
  if (_S.ventesLocalMag12MG?.size) {
    for (const [cc, artMap] of _S.ventesLocalMag12MG) {
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
  if (getVentesHorsMagFullMap().size) {
    for (const [cc, artMap] of getVentesHorsMagFullMap()) {
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
  if (_S.territoireReady && _S.ventesTerrain?.length) {
    for (const l of _S.ventesTerrain) {
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
      if (!_S.ventesLocalMag12MG?.has(cc)) continue;
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
  const head = `<section class="pt-card pt-col" style="gap:14px">
    <div class="pt-row pt-between" style="gap:16px;flex-wrap:wrap;align-items:flex-start">
      <div class="pt-col" style="gap:4px;flex:1;min-width:260px">
        <span class="pt-eyebrow">Associations</span>
        <h3 class="pt-h2">Vendre la famille qui va avec</h3>
        <span class="pt-muted">Choisis une famille « moteur » (ex. robinetterie) et celle qui devrait suivre (ex. raccords). PRISME mesure combien de tes clients achètent les deux, te compare au réseau et sort les clients et les articles à travailler.</span>
      </div>
      ${_S._assocEditMode ? '' : '<button type="button" class="pt-btn" onclick="window._assocNew()">Nouvelle association</button>'}
    </div>
    ${_assocMetierFilter && !_S._assocEditMode ? `<div><button type="button" class="ar-chip ar-chip-on" onclick="window._assocSetMetier('')">Métier : ${escapeHtml(_assocMetierFilter === '__nonclasse__' ? 'non classé' : _assocMetierFilter)} ✕</button></div>` : ''}
  </section>`;
  let html = head;
  if (_S._assocEditMode) html += `<div class="assoc-legacy">${_renderAssocEditor()}</div>`;
  if (!assocs.length && !_S._assocEditMode) {
    html += `<section class="pt-card pt-col" style="gap:10px;align-items:flex-start;border-style:dashed">
      <h3 class="pt-h3">Aucune association pour l’instant</h3>
      <span class="pt-small pt-muted">Exemples qui marchent souvent : perçage → fixation, robinetterie → raccords, électroportatif → consommables.</span>
      <button type="button" class="pt-btn" onclick="window._assocNew()">Créer la première</button>
    </section>`;
    return `<div class="pt-wrap" style="gap:20px;padding-top:8px">${html}</div>`;
  }
  html += assocs.map(_renderAssocCard).join('');
  return `<div class="pt-wrap" style="gap:20px;padding-top:8px">${html}</div>`;
}

/**
 * Calcule les stats par famille : CA, nb clients, nb refs vendues
 * @returns {Map<codeFam, {codeFam, lib, ca, nbClients, nbRefs}>}
 */
function _famStats() {
  if (_famStatsCache) return _famStatsCache;
  const catFam = _S.catalogueFamille;
  const vca = _S.ventesLocalMag12MG;
  const stats = new Map();

  const _ensure = (cf) => {
    if (!stats.has(cf)) stats.set(cf, { codeFam: cf, lib: _famLabel(cf), ca: 0, caReseau: 0, clients: new Set(), refs: new Set() });
    return stats.get(cf);
  };

  // Source 1 : ventesLocalMag12MG (MAGASIN, pleine période) + ventesLocalHorsMag (Web, Rep, DCS)
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
  const vhm = getVentesHorsMagFullMap();
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
  if (_S.territoireReady && _S.ventesTerrain?.length) {
    for (const l of _S.ventesTerrain) {
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
  const my = _computeAssocMyStore(famA, famB);
  const bench = _benchmarkAssoc(famA, famB);
  const best = bench[0] || null;
  const myIndice = bench._myIndice || 0;
  const targets = _findClientTargets(famA, famB);
  const missingRefs = best ? _findMissingRefs(famB, best.store) : [];
  if (!_S._assocMissingRefs) _S._assocMissingRefs = {};
  _S._assocMissingRefs[id] = { refs: missingRefs, famA: labelA, famB: labelB, bestStore: best?.store || '?' };

  const tone = v => v >= 0 ? 'var(--pt-high)' : 'var(--pt-low)';
  const tauxTone = my.taux >= 50 ? 'var(--pt-high)' : my.taux >= 25 ? 'var(--pt-mid)' : 'var(--pt-low)';
  const isOpen = _S._assocOpenId === id;
  const tile = (label, value, hint, color) => `<div class="pt-col" style="gap:4px;padding:14px 16px;border-radius:14px;background:var(--s-card-alt);min-width:0">
      <span class="pt-eyebrow" style="font-size:11px">${label}</span>
      <span class="pt-num" style="font-size:22px;font-weight:600;color:${color || 'var(--t-primary)'}">${value}</span>
      <span class="pt-small pt-muted" style="line-height:1.35">${hint}</span>
    </div>`;

  const sortedRefs = [...missingRefs].sort((a, b) => {
    const _vo = { implanter: 0, socle: 1, challenger: 2, surveiller: 3 };
    const va = a.sqClassif ? (_vo[a.sqClassif] ?? 4) : (a.enStock ? 4 : 5);
    const vb = b.sqClassif ? (_vo[b.sqClassif] ?? 4) : (b.enStock ? 4 : 5);
    return va - vb || b.bestCa - a.bestCa;
  });
  const refRows = sortedRefs.map(r => {
    const sq = window._getArticleSqInfo?.(r.code);
    const verdict = sq ? `<span class="ar-tag" title="${escapeHtml(sq.verdict.tip || '')}">${escapeHtml(sq.verdict.label || sq.verdict.name)}</span>`
      : r.enStock ? '<span class="ar-tag" data-tone="high">En stock</span>' : '<span class="ar-tag">Hors squelette</span>';
    return `<tr class="ar-click${!sq && !r.enStock ? ' pt-muted' : ''}" onclick="window.openArticlePanel?.('${r.code}','associations')">
      <td><div class="pt-col" style="gap:2px"><span class="pt-strong">${escapeHtml(r.libelle)}</span><span class="pt-small pt-muted pt-num">${r.code}</span></div></td>
      <td class="pt-num ar-r">${formatEuro(r.bestCa)}</td>
      <td class="pt-num ar-r">${r.myCa > 0 ? formatEuro(r.myCa) : '—'}</td>
      <td>${verdict}</td>
    </tr>`;
  }).join('');
  const cliRows = targets.map(c => `<tr class="ar-click" onclick="window.openClient360?.('${c.cc}','associations')">
      <td><div class="pt-col" style="gap:2px"><span class="pt-strong">${escapeHtml(c.nom)}</span><span class="pt-small pt-muted">${escapeHtml(c.metier || '—')}${c.classification ? ' · ' + escapeHtml(c.classification) : ''}</span></div></td>
      <td class="pt-num ar-r">${formatEuro(c.caA)}</td>
    </tr>`).join('');
  const benchRows = bench.slice(0, 15).map(r => `<tr${r.store === _S.selectedMyStore ? ' class="pt-next"' : ''}>
      <td class="pt-strong">${escapeHtml(r.store)}</td>
      <td class="pt-num ar-r">${r.ratio} %</td>
      <td class="pt-num ar-r">${formatEuro(r.caA)}</td>
      <td class="pt-num ar-r">${formatEuro(r.caB)}</td>
      <td class="pt-num ar-r">${r.refsB}</td>
    </tr>`).join('');

  return `<details class="ar-sec"${isOpen ? ' open' : ''}>
    <summary onclick="event.preventDefault();window._assocToggle('${id}')">
      <span class="pt-col" style="gap:2px;min-width:0">
        <span class="pt-h3">${escapeHtml(labelA)} → ${escapeHtml(labelB)}</span>
        <span class="pt-small pt-muted">${my.clientsAB.size} de tes ${my.clientsA.size} clients ${escapeHtml(labelA)} prennent aussi ${escapeHtml(labelB)} · ${targets.length} à travailler</span>
      </span>
      <span class="pt-row" style="gap:16px">
        <span class="pt-num pt-strong" style="font-size:22px;color:${tauxTone}">${my.taux} %</span>
        <button type="button" class="pt-link pt-small" style="color:var(--t-tertiary)" onclick="event.preventDefault();event.stopPropagation();window._assocDelete('${id}')">Supprimer</button>
        <span class="ar-chev" aria-hidden="true"></span>
      </span>
    </summary>
    ${isOpen ? `<div class="ar-sec-body" style="gap:18px">
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:12px">
        ${tile('Ton taux', `${my.taux} %`, `${my.clientsAB.size} / ${my.clientsA.size} clients achètent les deux`, tauxTone)}
        ${tile('Indice réseau', String(myIndice), `100 = médiane des ${bench.length} agences`, tone(myIndice - 100))}
        ${tile('Meilleure agence', best ? best.store : '—', best ? `ratio ${best.ratio} % · ${formatEuro(best.caB)} en ${escapeHtml(labelB)}` : '')}
        ${tile('Clients à travailler', String(targets.length), `achètent ${escapeHtml(labelA)}, pas ${escapeHtml(labelB)}`, 'var(--pt-mid)')}
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(380px,1fr));gap:16px">
        ${targets.length ? `<div class="pt-col" style="gap:8px">
          <h4 class="pt-h3" style="font-size:16px">Clients à travailler</h4>
          <div class="pt-list" style="margin-top:0"><div class="pt-scroll"><table class="pt-table">
            <thead><tr><th>Client</th><th class="ar-r">CA ${escapeHtml(labelA)}</th></tr></thead><tbody>${cliRows}</tbody></table></div></div>
        </div>` : ''}
        ${missingRefs.length ? `<div class="pt-col" style="gap:8px">
          <div class="pt-row pt-between" style="gap:8px"><h4 class="pt-h3" style="font-size:16px">Articles à développer <span class="pt-small pt-muted" style="font-weight:400">vs ${escapeHtml(best?.store || '?')}</span></h4>
          <button type="button" class="pt-link pt-small" onclick="window._assocExportTrous('${id}')">Exporter</button></div>
          <div class="pt-list" style="margin-top:0"><div class="pt-scroll"><table class="pt-table">
            <thead><tr><th>Article</th><th class="ar-r">Chez ${escapeHtml(best?.store || '?')}</th><th class="ar-r">Chez toi</th><th>Verdict</th></tr></thead><tbody>${refRows}</tbody></table></div></div>
        </div>` : ''}
      </div>
      ${bench.length ? `<details class="pt-col"><summary class="pt-link pt-small" style="cursor:pointer">Classement des ${bench.length} agences (CA ${escapeHtml(labelB)} / CA ${escapeHtml(labelA)})${_assocMetierFilter ? ' — non filtré par métier' : ''}</summary>
        <div class="pt-list"><div class="pt-scroll"><table class="pt-table">
          <thead><tr><th>Agence</th><th class="ar-r">Ratio B/A</th><th class="ar-r">CA ${escapeHtml(labelA)}</th><th class="ar-r">CA ${escapeHtml(labelB)}</th><th class="ar-r">Réf. B</th></tr></thead>
          <tbody>${benchRows}</tbody></table></div></div></details>` : ''}
    </div>` : ''}
  </details>`;
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
// Rendu onglet complet
// ═══════════════════════════════════════════════════════════════

export function renderAssociationsTab() {
  _famStatsCache = null; // Invalider le cache stats à chaque rendu

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
