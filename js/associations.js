// © 2026 Jawad El Barkaoui — Tous droits réservés
// PRISME — associations.js
// Animation des ventes associées : benchmark réseau × familles croisées
// ═══════════════════════════════════════════════════════════════
'use strict';

import { _S } from './state.js';
import { formatEuro, escapeHtml } from './utils.js';
import { computeSquelette } from './engine.js';
import { _saveSessionToIDB } from './cache.js';

// ═══════════════════════════════════════════════════════════════
// Données persistées : _S._associations = [{id, famA, famB, famC?, label, dateCreated}]
// ═══════════════════════════════════════════════════════════════

/** Initialise la structure si absente */
function _ensureAssoc() {
  if (!_S._associations) _S._associations = [];
}

/** Génère un ID court */
function _assocId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

// ═══════════════════════════════════════════════════════════════
// Calcul du taux d'association par agence (via ventesParMagasin)
// ═══════════════════════════════════════════════════════════════

/**
 * Agrège ventesParMagasinByCanal pour un store (tous canaux confondus).
 * Retourne un objet {code → {sumCA, countBL}} — sensible au filtre période.
 * Fallback sur ventesParMagasin (pleine période) si byCanal absent.
 */
function _vpmForStore(store) {
  const vbc = _S.ventesParMagasinByCanal;
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
  return _S.ventesParMagasin?.[store] || {};
}

/**
 * Pour une agence du réseau, calcule le mix A/B :
 * caA, caB, refsA, refsB, blA, blB + ratio brut caB/caA.
 * Utilise ventesParMagasinByCanal (sensible période) avec fallback ventesParMagasin.
 */
function _computeAssocForStore(store, famA, famB) {
  const sd = _vpmForStore(store);
  if (!sd || !Object.keys(sd).length) return { blA: 0, blB: 0, ratioRaw: 0, caA: 0, caB: 0, refsA: 0, refsB: 0 };

  const catFam = _S.catalogueFamille;
  let caA = 0, caB = 0, blA = 0, blB = 0, refsA = 0, refsB = 0;
  for (const [code, data] of Object.entries(sd)) {
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
 * Vue omnicanale unifiée par client : merge ventesClientArticle + ventesClientHorsMagasin.
 * Retourne un itérateur de [cc, Map<code, {sumCA}>] — tous canaux confondus.
 * Le BL du co-achat se mesure au niveau client (a-t-il acheté A ET B ?), pas au niveau BL,
 * donc on agrège le CA tous canaux pour chaque couple (client, article).
 */
function _omniClientArticles() {
  const merged = new Map(); // cc → Map<code, {sumCA}>
  // Source 1 : MAGASIN (ventesClientArticle)
  if (_S.ventesClientArticle?.size) {
    for (const [cc, artMap] of _S.ventesClientArticle) {
      if (!merged.has(cc)) merged.set(cc, new Map());
      const m = merged.get(cc);
      for (const [code, v] of artMap) {
        const prev = m.get(code);
        m.set(code, { sumCA: (prev?.sumCA || 0) + (v.sumCA || 0) });
      }
    }
  }
  // Source 2 : hors-MAGASIN (Web, Représentant, DCS)
  if (_S.ventesClientHorsMagasin?.size) {
    for (const [cc, artMap] of _S.ventesClientHorsMagasin) {
      if (!merged.has(cc)) merged.set(cc, new Map());
      const m = merged.get(cc);
      for (const [code, v] of artMap) {
        const prev = m.get(code);
        m.set(code, { sumCA: (prev?.sumCA || 0) + (v.sumCA || 0) });
      }
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
  // Lister les stores depuis ventesParMagasinByCanal (sensible période) ou ventesParMagasin
  const vbc = _S.ventesParMagasinByCanal || {};
  const vpm = _S.ventesParMagasin || {};
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
      const fd = _S.finalData?.find(r => r.code === code);
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

  let html = `<div class="mb-4">
    <div class="flex items-center justify-between mb-3">
      <h3 class="font-extrabold text-lg t-primary">🔗 Associations de ventes</h3>
      <button onclick="window._assocNew()" class="text-[11px] px-3 py-1.5 rounded-lg border-2 cursor-pointer font-bold transition-all hover:shadow-md" style="border-color:var(--c-action);color:var(--c-action)">+ Nouvelle association</button>
    </div>
    <p class="text-[10px] t-disabled mb-4">Analyse omnicanale — Magasin, Web, Terrain : mesurez votre taux d'association vs le réseau et identifiez les actions concrètes.</p>
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
  const vca = _S.ventesClientArticle;
  const stats = new Map();

  const _ensure = (cf) => {
    if (!stats.has(cf)) stats.set(cf, { codeFam: cf, lib: _famLabel(cf), ca: 0, caReseau: 0, clients: new Set(), refs: new Set() });
    return stats.get(cf);
  };

  // Source 1 : ventesClientArticle (MAGASIN) + ventesClientHorsMagasin (Web, Rep, DCS)
  // Omnicanal : tous les canaux comptent pour les associations
  if (vca?.size) {
    for (const [cc, artMap] of vca) {
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

  // Source 1b : ventesClientHorsMagasin (Web, Représentant, DCS) — même structure
  const vhm = _S.ventesClientHorsMagasin;
  if (vhm?.size) {
    for (const [cc, artMap] of vhm) {
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

  // Source 2 : ventesParMagasin (tout le réseau) — familles absentes localement mais actives réseau
  if (_S.ventesParMagasin) {
    for (const [store, arts] of Object.entries(_S.ventesParMagasin)) {
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
  return results.slice(0, 12);
}

function _renderAssocEditor() {
  const fStats = _famStats();
  // Familles éligibles comme A : ≥5 clients actifs, triées par CA décroissant
  const eligible = [...fStats.values()]
    .filter(f => (f.nbClients >= 5 || f.caReseau >= 1000) && /^[A-Z]\d{2}$/.test(f.codeFam))
    .sort((a, b) => (b.ca || b.caReseau) - (a.ca || a.caReseau));

  const optsA = eligible.map(f => {
    const caLabel = f.ca > 0 ? formatEuro(f.ca) : `réseau ${formatEuro(f.caReseau)}`;
    const clLabel = f.nbClients > 0 ? `${f.nbClients} cl.` : 'réseau';
    return `<option value="${f.codeFam}">${escapeHtml(f.lib)} · ${clLabel} · ${caLabel}</option>`;
  }).join('');

  const famA = _S._assocEditing?.famA || '';
  const famB = _S._assocEditing?.famB || '';

  // Suggestions pour B si A est choisi
  let suggestBHtml = '';
  if (famA) {
    const sugB = _suggestAssociatedFams(famA);
    suggestBHtml = sugB.length
      ? `<div class="mt-3">
          <h5 class="text-[10px] font-bold t-secondary mb-2">② Famille associée <span class="font-normal t-disabled">— triées par taux de co-achat naturel</span></h5>
          <div class="grid grid-cols-2 gap-2">${sugB.map(s => {
            const sel = famB === s.codeFam;
            const tauxColor = s.coTaux >= 40 ? '#22c55e' : s.coTaux >= 20 ? '#f59e0b' : '#94a3b8';
            return `<div onclick="window._assocPickB('${s.codeFam}')"
              class="p-2 rounded-lg border cursor-pointer transition-all ${sel ? 'border-2' : 'hover:s-hover'}"
              style="${sel ? 'border-color:var(--c-action);background:rgba(139,92,246,0.08)' : 'border-color:var(--color-border-tertiary)'}">
              <div class="flex items-center justify-between mb-1">
                <span class="text-[11px] font-medium t-primary">${escapeHtml(s.lib)}</span>
                <span class="text-[11px] font-black" style="color:${tauxColor}">${s.coTaux}%</span>
              </div>
              <div class="text-[9px] t-disabled">${s.nbCoClients} clients communs · ${formatEuro(s.ca)} CA · ${s.nbClients} cl.</div>
              ${s.warning ? `<div class="text-[9px] mt-1" style="color:#f59e0b">⚠️ ${s.warning}</div>` : ''}
            </div>`;
          }).join('')}</div>
        </div>`
      : '<div class="mt-3 text-[11px] t-disabled text-center py-3">Aucune association significative détectée pour cette famille.</div>';
  }

  // Résumé
  let chainPreview = '';
  if (famA && famB) {
    const my = _computeAssocMyStore(famA, famB);
    const tauxColor = my.taux >= 50 ? '#22c55e' : my.taux >= 25 ? '#f59e0b' : '#ef4444';
    chainPreview = `<div class="flex items-center gap-3 p-2 rounded-lg border b-light text-[11px] mt-3">
      <span class="font-mono px-1.5 py-0.5 rounded" style="background:rgba(139,92,246,0.15);color:#8b5cf6">${escapeHtml(famA)}</span>
      <span class="t-disabled">→</span>
      <span class="font-mono px-1.5 py-0.5 rounded" style="background:rgba(59,130,246,0.15);color:#3b82f6">${escapeHtml(famB)}</span>
      <span class="ml-2">Taux : <strong style="color:${tauxColor}">${my.taux}%</strong></span>
      <span class="t-disabled">${my.clientsAB.size} / ${my.clientsA.size} clients</span>
    </div>`;
  }

  return `<div class="s-card rounded-xl border p-4 mb-4">
    <h4 class="font-bold text-sm t-primary mb-3">Nouvelle association</h4>
    <div>
      <label class="text-[10px] font-bold t-secondary mb-1 block">① Famille principale <span class="font-normal t-disabled">— le moteur d'achat</span></label>
      <input id="assocSearchA" type="text" placeholder="🔍 Rechercher une famille…" class="w-full text-[11px] px-2 py-1.5 rounded border b-default s-card t-primary mb-1" style="max-width:400px" oninput="window._assocFilterA(this.value)">
      <select id="assocSelA" class="w-full text-[11px] px-2 py-1.5 rounded border b-default s-card t-primary" onchange="window._assocSelectA(this.value)" style="max-width:400px;overflow:hidden" size="6">
        <option value="">— Choisir une famille —</option>${optsA}
      </select>
    </div>
    ${suggestBHtml}
    ${chainPreview}
    <div class="flex gap-2 mt-3">
      <button onclick="window._assocSave()" class="text-[11px] px-4 py-1.5 rounded-lg font-bold cursor-pointer ${famA && famB ? '' : 'opacity-50 pointer-events-none'}" style="background:var(--c-action);color:#fff">✓ Enregistrer</button>
      <button onclick="window._assocCancel()" class="text-[11px] px-3 py-1.5 t-disabled hover:t-primary cursor-pointer">Annuler</button>
    </div>
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
        <summary class="text-[11px] font-bold t-primary cursor-pointer py-1.5">📊 Classement ${bench.length} agences · ratio mix CA ${escapeHtml(labelB)} / CA ${escapeHtml(labelA)}</summary>
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
  renderAssociationsTab();
};

window._assocSelectA = function(famA) {
  _S._assocEditing = { famA, famB: '' };
  renderAssociationsTab();
};

window._assocFilterA = function(query) {
  const sel = document.getElementById('assocSelA');
  if (!sel) return;
  const q = query.toLowerCase().trim();
  for (const opt of sel.options) {
    if (!opt.value) { opt.hidden = false; continue; }
    opt.hidden = q ? !opt.textContent.toLowerCase().includes(q) : false;
  }
};

window._assocPickB = function(famB) {
  if (!_S._assocEditing) return;
  _S._assocEditing.famB = _S._assocEditing.famB === famB ? '' : famB; // toggle
  renderAssociationsTab();
};

window._assocCancel = function() {
  _S._assocEditMode = false;
  _S._assocEditing = null;
  renderAssociationsTab();
};

window._assocSave = function() {
  _ensureAssoc();
  const famA = _S._assocEditing?.famA || '';
  const famB = _S._assocEditing?.famB || '';

  if (!famA || !famB) return;
  if (famA === famB) { alert('Les familles doivent être différentes.'); return; }

  // Vérifier doublon
  if (_S._associations.some(a => a.famA === famA && a.famB === famB)) {
    alert('Cette association existe déjà.');
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
  _S._assocOpenId = _S._associations[_S._associations.length - 1].id;

  _saveSessionToIDB();
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
