// © 2026 Jawad El Barkaoui — Tous droits réservés
// PRISME — associations.js
// Animation des ventes associées : benchmark réseau × familles croisées
// ═══════════════════════════════════════════════════════════════
'use strict';

import { _S } from './state.js';
import { formatEuro, escapeHtml } from './utils.js';
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
// Calcul du taux d'association par agence
// ═══════════════════════════════════════════════════════════════

/**
 * Pour une agence du réseau, calcule le poids de la famille B
 * relativement à la famille A (ratio CA B / CA A en %).
 * Ce n'est pas un taux d'association client (impossible sans croisement client par agence)
 * mais un ratio de mix produit — utile pour identifier les agences qui vendent
 * bien B quand elles vendent A.
 */
function _computeAssocForStore(store, famA, famB) {
  const vpm = _S.ventesParMagasin || {};
  const sd = vpm[store];
  if (!sd) return { caA: 0, caB: 0, refsA: 0, refsB: 0, ratio: 0 };

  const catFam = _S.catalogueFamille;
  let caA = 0, caB = 0, refsA = 0, refsB = 0;
  for (const [code, data] of Object.entries(sd)) {
    const cf = catFam?.get(code)?.codeFam || _S.articleFamille?.[code] || '';
    if (cf === famA && (data.countBL || 0) > 0) { caA += data.sumCA || 0; refsA++; }
    if (cf === famB && (data.countBL || 0) > 0) { caB += data.sumCA || 0; refsB++; }
  }

  return { caA, caB, refsA, refsB, ratio: caA > 0 ? Math.round(caB / caA * 100) : 0 };
}

/**
 * Calcul complet pour mon agence — utilise ventesClientArticle (plus fiable)
 */
function _computeAssocMyStore(famA, famB) {
  const catFam = _S.catalogueFamille;
  const vca = _S.ventesClientArticle;
  if (!vca?.size) return { clientsA: new Set(), clientsAB: new Set(), taux: 0, caA: 0, caB: 0, caBdetail: new Map() };

  const clientsA = new Set();
  const clientsAB = new Set();
  let caA = 0, caB = 0;
  const caBdetail = new Map(); // code → {ca, clients: Set}

  for (const [cc, artMap] of vca) {
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
 * Benchmark réseau : ratio mix produit B/A pour chaque agence
 */
function _benchmarkAssoc(famA, famB) {
  const vpm = _S.ventesParMagasin || {};
  const myStore = _S.selectedMyStore;
  const stores = Object.keys(vpm).filter(s => s !== myStore);
  const results = [];

  for (const store of stores) {
    const r = _computeAssocForStore(store, famA, famB);
    if (r.caA > 0) { // l'agence vend au moins famille A
      results.push({ store, ...r });
    }
  }

  results.sort((a, b) => b.refsB - a.refsB || b.caB - a.caB);
  return results;
}

/**
 * Refs vendues par la meilleure agence sur famB que mon agence ne vend pas bien
 */
function _findMissingRefs(famB, bestStore) {
  const vpm = _S.ventesParMagasin || {};
  const myStore = _S.selectedMyStore;
  const catFam = _S.catalogueFamille;
  const myData = vpm[myStore] || {};
  const bestData = vpm[bestStore] || {};

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
  const vca = _S.ventesClientArticle;
  if (!vca?.size) return [];

  const targets = [];
  for (const [cc, artMap] of vca) {
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
    <p class="text-[10px] t-disabled mb-4">Sélectionnez des familles à associer, mesurez votre taux d'association vs le réseau, et identifiez les actions concrètes pour progresser.</p>
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
    if (!stats.has(cf)) stats.set(cf, { codeFam: cf, lib: _famLabel(cf), ca: 0, clients: new Set(), refs: new Set() });
    return stats.get(cf);
  };

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
  const vca = _S.ventesClientArticle;
  if (!vca?.size) return [];

  const fStats = _famStats();
  const statsA = fStats.get(famA);
  if (!statsA || statsA.nbClients < 3) return [];

  // Pour chaque client qui achète A, quelles autres familles achète-t-il ?
  const coCount = new Map(); // codeFam → Set<cc>
  for (const [cc, artMap] of vca) {
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
    if (!sB || sB.nbClients < 2) continue;
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
    .filter(f => f.nbClients >= 5)
    .sort((a, b) => b.ca - a.ca);

  const optsA = eligible.map(f =>
    `<option value="${f.codeFam}">${escapeHtml(f.lib)} · ${f.nbClients} cl. · ${formatEuro(f.ca)}</option>`
  ).join('');

  const famA = _S._assocEditing?.famA || '';
  const famB = _S._assocEditing?.famB || '';

  // Suggestions pour B si A est choisi
  let suggestionsHtml = '';
  if (famA) {
    const suggestions = _suggestAssociatedFams(famA);
    if (suggestions.length) {
      suggestionsHtml = `<div class="mt-3">
        <h5 class="text-[10px] font-bold t-secondary mb-2">Familles associées suggérées <span class="font-normal t-disabled">— triées par taux de co-achat naturel</span></h5>
        <div class="grid grid-cols-2 gap-2">
          ${suggestions.map(s => {
            const selected = famB === s.codeFam;
            const tauxColor = s.coTaux >= 40 ? '#22c55e' : s.coTaux >= 20 ? '#f59e0b' : '#94a3b8';
            return `<div onclick="window._assocPickB('${s.codeFam}')"
              class="p-2 rounded-lg border cursor-pointer transition-all ${selected ? 'border-2' : 'hover:s-hover'}"
              style="${selected ? 'border-color:var(--c-action);background:rgba(139,92,246,0.08)' : 'border-color:var(--color-border-tertiary)'}">
              <div class="flex items-center justify-between mb-1">
                <span class="text-[11px] font-medium t-primary">${escapeHtml(s.lib)}</span>
                <span class="text-[11px] font-black" style="color:${tauxColor}">${s.coTaux}%</span>
              </div>
              <div class="text-[9px] t-disabled">${s.nbCoClients} clients communs · ${formatEuro(s.ca)} CA · ${s.nbClients} cl.</div>
              ${s.warning ? `<div class="text-[9px] mt-1" style="color:#f59e0b">⚠️ ${s.warning}</div>` : ''}
            </div>`;
          }).join('')}
        </div>
      </div>`;
    } else {
      suggestionsHtml = '<div class="mt-3 text-[11px] t-disabled text-center py-3">Aucune association significative détectée pour cette famille.</div>';
    }
  }

  return `<div class="s-card rounded-xl border p-4 mb-4">
    <h4 class="font-bold text-sm t-primary mb-3">Nouvelle association</h4>
    <div>
      <label class="text-[10px] font-bold t-secondary mb-1 block">① Famille principale <span class="font-normal t-disabled">— le moteur d'achat</span></label>
      <select id="assocSelA" class="w-full text-[11px] px-2 py-1.5 rounded border b-default s-card t-primary" onchange="window._assocSelectA(this.value)" style="max-width:400px">
        <option value="">— Choisir une famille —</option>${optsA}
      </select>
    </div>
    ${famA ? `<div class="mt-3">
      <label class="text-[10px] font-bold t-secondary mb-1 block">② Famille associée <span class="font-normal t-disabled">— le cross-sell à développer</span></label>
    </div>` : ''}
    ${suggestionsHtml}
    <div id="assocPreview" class="mt-3"></div>
    <div class="flex gap-2 mt-3">
      <button onclick="window._assocSave()" class="text-[11px] px-4 py-1.5 rounded-lg font-bold cursor-pointer ${famA && famB ? '' : 'opacity-50 pointer-events-none'}" style="background:var(--c-action);color:#fff">✓ Enregistrer</button>
      <button onclick="window._assocCancel()" class="text-[11px] px-3 py-1.5 t-disabled hover:t-primary cursor-pointer">Annuler</button>
    </div>
  </div>`;
}

function _renderAssocCard(assoc) {
  const { famA, famB, famC, id } = assoc;
  const labelA = _famLabel(famA);
  const labelB = _famLabel(famB);
  const labelC = famC ? _famLabel(famC) : '';

  // Calcul mon agence (taux client)
  const my = _computeAssocMyStore(famA, famB);
  // Benchmark réseau (refs B vendues par agence, trié par nbRefs)
  const bench = _benchmarkAssoc(famA, famB);
  const best = bench[0] || null;
  // Mon nombre de refs B vs médiane réseau
  const vpmMy = _S.ventesParMagasin?.[_S.selectedMyStore] || {};
  let myRefsB = 0;
  for (const [code, d] of Object.entries(vpmMy)) {
    const cf = _S.catalogueFamille?.get(code)?.codeFam || _S.articleFamille?.[code] || '';
    if (cf === famB && (d.countBL || 0) > 0) myRefsB++;
  }
  const medianRefsB = bench.length > 0
    ? bench[Math.floor(bench.length / 2)].refsB
    : 0;
  const targets = _findClientTargets(famA, famB);
  const missingRefs = best ? _findMissingRefs(famB, best.store) : [];

  // Taux couleur
  const tauxColor = my.taux >= 50 ? '#22c55e' : my.taux >= 25 ? '#f59e0b' : '#ef4444';
  const ecartRefs = myRefsB - medianRefsB;
  const ecartColor = ecartRefs >= 0 ? '#22c55e' : '#ef4444';

  // Association tertiaire (A→B→C)
  let blockC = '';
  if (famC) {
    const myBC = _computeAssocMyStore(famB, famC);
    blockC = `<div class="mt-3 pt-3 border-t b-light">
      <div class="text-[10px] t-disabled mb-1">Association chaînée : ${escapeHtml(labelB)} → ${escapeHtml(labelC)}</div>
      <div class="flex gap-4 text-[11px]">
        <span>Taux : <strong style="color:${myBC.taux >= 50 ? '#22c55e' : myBC.taux >= 25 ? '#f59e0b' : '#ef4444'}">${myBC.taux}%</strong></span>
        <span class="t-secondary">${myBC.clientsA.size} clients ${escapeHtml(labelB)} · ${myBC.clientsAB.size} achètent aussi ${escapeHtml(labelC)}</span>
      </div>
    </div>`;
  }

  const isOpen = _S._assocOpenId === id;

  return `<div class="s-card rounded-xl border overflow-hidden mb-3">
    <div class="px-4 py-3 cursor-pointer hover:s-hover flex items-center justify-between" onclick="window._assocToggle('${id}')">
      <div class="flex items-center gap-2">
        <span class="text-[10px] font-mono px-2 py-0.5 rounded" style="background:rgba(139,92,246,0.15);color:#8b5cf6">${escapeHtml(famA)}</span>
        <span class="t-disabled">→</span>
        <span class="text-[10px] font-mono px-2 py-0.5 rounded" style="background:rgba(59,130,246,0.15);color:#3b82f6">${escapeHtml(famB)}</span>
        ${famC ? `<span class="t-disabled">→</span><span class="text-[10px] font-mono px-2 py-0.5 rounded" style="background:rgba(34,197,94,0.15);color:#22c55e">${escapeHtml(famC)}</span>` : ''}
        <span class="text-[11px] t-primary font-medium ml-2">${escapeHtml(labelA)} × ${escapeHtml(labelB)}</span>
      </div>
      <div class="flex items-center gap-3">
        <span class="text-lg font-black" style="color:${tauxColor}">${my.taux}%</span>
        <span class="text-[10px]" style="color:${ecartColor}">${ecartRefs >= 0 ? '+' : ''}${ecartRefs} refs vs méd.</span>
        <button onclick="event.stopPropagation();window._assocDelete('${id}')" class="text-[10px] t-disabled hover:text-red-400 ml-2" title="Supprimer">🗑️</button>
      </div>
    </div>
    ${isOpen ? `<div class="border-t b-light px-4 py-3">
      <!-- KPIs -->
      <div class="grid grid-cols-4 gap-3 mb-4">
        <div class="text-center p-3 rounded-lg" style="background:rgba(139,92,246,0.12)">
          <div class="text-[11px] font-semibold t-secondary mb-1">Mon taux</div>
          <div class="text-2xl font-black" style="color:${tauxColor}">${my.taux}%</div>
          <div class="text-[11px] t-secondary mt-0.5">${my.clientsAB.size} / ${my.clientsA.size} clients</div>
        </div>
        <div class="text-center p-3 rounded-lg" style="background:rgba(59,130,246,0.12)">
          <div class="text-[11px] font-semibold t-secondary mb-1">Méd. réseau refs B</div>
          <div class="text-2xl font-black t-primary">${medianRefsB}</div>
          <div class="text-[11px] t-secondary mt-0.5">${bench.length} agences · moi : ${myRefsB}</div>
        </div>
        <div class="text-center p-3 rounded-lg" style="background:rgba(34,197,94,0.12)">
          <div class="text-[11px] font-semibold t-secondary mb-1">Top agence</div>
          <div class="text-2xl font-black" style="color:#22c55e">${best ? best.refsB + ' refs' : '—'}</div>
          <div class="text-[11px] t-secondary mt-0.5">${best ? best.store + ' · ' + formatEuro(best.caB) : '—'}</div>
        </div>
        <div class="text-center p-3 rounded-lg" style="background:rgba(245,158,11,0.12)">
          <div class="text-[11px] font-semibold t-secondary mb-1">Clients cibles</div>
          <div class="text-2xl font-black" style="color:#f59e0b">${targets.length}</div>
          <div class="text-[11px] t-secondary mt-0.5">achètent A pas B</div>
        </div>
      </div>

      ${blockC}

      <!-- Refs manquantes -->
      ${missingRefs.length ? `<div class="mb-4">
        <h4 class="text-[11px] font-bold t-primary mb-2">📦 Refs à développer <span class="text-[9px] t-disabled font-normal">— vendues par ${best?.store || '?'}, pas/peu par moi</span></h4>
        <div style="max-height:300px;overflow-y:auto">
        <table class="w-full text-[11px]">
          <thead style="position:sticky;top:0;background:var(--color-bg-primary)"><tr class="border-b b-light text-[10px]" style="color:var(--t-secondary)">
            <th class="py-1 px-2 text-left">Code</th>
            <th class="py-1 px-2 text-left">Libellé</th>
            <th class="py-1 px-2 text-right">CA ${best?.store || '?'}</th>
            <th class="py-1 px-2 text-right">CA moi</th>
            <th class="py-1 px-2 text-right">Écart</th>
            <th class="py-1 px-2 text-center">Stock</th>
          </tr></thead>
          <tbody>${missingRefs.map(r => `<tr class="border-b b-light hover:s-hover cursor-pointer" onclick="if(window.openArticlePanel)window.openArticlePanel('${r.code}','associations')">
            <td class="py-1 px-2 font-mono t-disabled">${r.code}</td>
            <td class="py-1 px-2 t-primary truncate max-w-[180px]">${escapeHtml(r.libelle)}</td>
            <td class="py-1 px-2 text-right font-bold" style="color:#22c55e">${formatEuro(r.bestCa)}</td>
            <td class="py-1 px-2 text-right t-secondary">${r.myCa > 0 ? formatEuro(r.myCa) : '—'}</td>
            <td class="py-1 px-2 text-right font-bold" style="color:#ef4444">${r.ecart}%</td>
            <td class="py-1 px-2 text-center">${r.enStock ? '<span style="color:#22c55e">●</span>' : '<span style="color:#ef4444">✕</span>'}</td>
          </tr>`).join('')}</tbody>
        </table>
        </div>
      </div>` : ''}

      <!-- Clients cibles -->
      ${targets.length ? `<div class="mb-3">
        <h4 class="text-[11px] font-bold t-primary mb-2">🎯 Clients cibles <span class="text-[9px] t-disabled font-normal">— achètent ${escapeHtml(labelA)} mais pas ${escapeHtml(labelB)}</span></h4>
        <div style="max-height:250px;overflow-y:auto">
        <table class="w-full text-[11px]">
          <thead style="position:sticky;top:0;background:var(--color-bg-primary)"><tr class="border-b b-light text-[10px]" style="color:var(--t-secondary)">
            <th class="py-1 px-2 text-left">Client</th>
            <th class="py-1 px-2 text-left">Métier</th>
            <th class="py-1 px-2 text-left">Classif.</th>
            <th class="py-1 px-2 text-left">Commercial</th>
            <th class="py-1 px-2 text-right">CA ${escapeHtml(labelA)}</th>
          </tr></thead>
          <tbody>${targets.map(c => `<tr class="border-b b-light hover:s-hover cursor-pointer" onclick="if(window.openClient360)window.openClient360('${c.cc}','associations')">
            <td class="py-1 px-2 t-primary">${escapeHtml(c.nom)}</td>
            <td class="py-1 px-2 t-secondary text-[10px]">${escapeHtml(c.metier)}</td>
            <td class="py-1 px-2 t-secondary text-[10px]">${escapeHtml(c.classification)}</td>
            <td class="py-1 px-2 t-secondary text-[10px]">${escapeHtml(c.commercial)}</td>
            <td class="py-1 px-2 text-right font-bold" style="color:var(--c-action)">${formatEuro(c.caA)}</td>
          </tr>`).join('')}</tbody>
        </table>
        </div>
      </div>` : ''}

      <!-- Benchmark réseau -->
      ${bench.length ? `<details class="mb-2">
        <summary class="text-[11px] font-bold t-primary cursor-pointer py-1">📊 Benchmark réseau — ${bench.length} agences · ratio mix CA ${escapeHtml(labelB)} / CA ${escapeHtml(labelA)}</summary>
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
    </div>` : ''}
  </div>`;
}

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
    famC: null,
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
