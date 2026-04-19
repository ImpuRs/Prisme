'use strict';
/**
 * direction.js — Direction Réseau (V3 Siège)
 * 3 modules : Conformité, Tribunal des Marques, Tueur de Clones
 */
import { _S } from './state.js';
import { DataStore } from './store.js';
import { formatEuro, famLib } from './utils.js';
import { FAM_LETTER_UNIVERS } from './constants.js';

// ═══════════════════════════════════════════════════════════════════
// MODULE 1 : RADAR DE CONFORMITÉ
// ═══════════════════════════════════════════════════════════════════

let _confUniversFilter = '';
let _confFamilleFilter = ''; // sous-filtre famille (ex: "Protection des pieds")
let _confThreshold = 60; // % seuil pour Labo (métiers) ET Agences (logistique)

// ═══════════════════════════════════════════════════════════════════
// SIDEBAR PARTAGÉ — Filtres Univers / Famille / Sous-famille
// ═══════════════════════════════════════════════════════════════════
let _dirUniversFilter = '';
let _dirFamilleFilter = '';
let _dirSousFamilleFilter = '';

function _buildDirectionSidebar(activeTab) {
  const univers = Object.entries(FAM_LETTER_UNIVERS);

  // Univers pills (vertical)
  const univBtns = univers.map(([letter, name]) => {
    const sel = _dirUniversFilter === letter;
    return `<button onclick="window._dirSetUnivers('${letter}')" class="text-[10px] px-2.5 py-1.5 rounded text-left font-bold cursor-pointer transition-all w-full ${sel ? 'text-white' : 't-disabled hover:t-primary'}" style="${sel ? 'background:var(--c-action)' : 'background:var(--bg-surface)'}">${name}</button>`;
  }).join('');

  // Famille pills (cascade from univers)
  // Résout le libellé famille : catalogueFamille > famLib > code brut
  function _famLabel(codeFam) {
    const catFam = _S.catalogueFamille;
    if (catFam) {
      for (const f of catFam.values()) {
        if (f.codeFam === codeFam && f.libFam) return f.libFam;
      }
    }
    return famLib(codeFam) || codeFam;
  }
  let famHtml = '';
  if (_dirUniversFilter) {
    const famSet = new Map(); // codeFam → libellé
    const fd = DataStore.finalData || [];
    for (const r of fd) {
      if (!/^\d{6}$/.test(r.code)) continue;
      const codeFam = r.famille || '';
      if (!codeFam || codeFam.charAt(0) !== _dirUniversFilter) continue;
      if (!famSet.has(codeFam)) famSet.set(codeFam, _famLabel(codeFam));
    }
    // Also check ventesParMagasin — only families that have a known label (catalogue)
    const vpm = _S.ventesParMagasin || {};
    for (const store of Object.keys(vpm)) {
      for (const code of Object.keys(vpm[store])) {
        const codeFam = _S.articleFamille?.[code] || '';
        if (!codeFam || codeFam.charAt(0) !== _dirUniversFilter) continue;
        if (famSet.has(codeFam)) continue;
        const label = _famLabel(codeFam);
        if (label !== codeFam) famSet.set(codeFam, label); // skip orphan codes (no catalogue entry)
      }
    }
    const families = [...famSet.entries()].sort((a, b) => a[1].localeCompare(b[1]));
    if (families.length) {
      famHtml = `<div class="mt-2 pt-2" style="border-top:1px solid var(--border)">
        <div class="text-[8px] t-disabled uppercase tracking-wider mb-1 font-bold">Famille</div>
        <button onclick="window._dirSetFamille('')" class="text-[9px] px-2 py-1 rounded text-left cursor-pointer w-full font-bold ${!_dirFamilleFilter ? 'text-white' : 't-disabled'}" style="${!_dirFamilleFilter ? 'background:#6366f1' : 'background:var(--bg-surface)'}">Toutes (${families.length})</button>
        <div class="max-h-[300px] overflow-y-auto space-y-0.5 mt-0.5">
        ${families.map(([code, lib]) => {
          const sel = _dirFamilleFilter === code;
          return `<button onclick="window._dirSetFamille('${code}')" class="text-[9px] px-2 py-1 rounded text-left cursor-pointer w-full truncate ${sel ? 'text-white font-bold' : 't-disabled hover:t-primary'}" style="${sel ? 'background:#6366f1' : ''}" title="${lib}">${lib}</button>`;
        }).join('')}
        </div>
      </div>`;
    }
  }

  // Sous-famille pills (cascade from famille)
  let sfHtml = '';
  if (_dirFamilleFilter) {
    const sfSet = new Set();
    const catFam = _S.catalogueFamille;
    const fd = DataStore.finalData || [];
    for (const r of fd) {
      if (!/^\d{6}$/.test(r.code)) continue;
      if ((r.famille || '') !== _dirFamilleFilter) continue;
      const sf = catFam?.get(r.code)?.sousFam || r.sousFamille || '';
      if (sf && sf.length > 1) sfSet.add(sf);
    }
    const sousFams = [...sfSet].sort();
    if (sousFams.length > 1) {
      sfHtml = `<div class="mt-2 pt-2" style="border-top:1px solid var(--border)">
        <div class="text-[8px] t-disabled uppercase tracking-wider mb-1 font-bold">Sous-famille</div>
        <button onclick="window._dirSetSousFamille('')" class="text-[9px] px-2 py-1 rounded text-left cursor-pointer w-full font-bold ${!_dirSousFamilleFilter ? 'text-white' : 't-disabled'}" style="${!_dirSousFamilleFilter ? 'background:#8B5CF6' : 'background:var(--bg-surface)'}">Toutes (${sousFams.length})</button>
        <div class="max-h-[200px] overflow-y-auto space-y-0.5 mt-0.5">
        ${sousFams.map(sf => {
          const sel = _dirSousFamilleFilter === sf;
          return `<button onclick="window._dirSetSousFamille('${sf.replace(/'/g, "\\'")}')" class="text-[9px] px-2 py-1 rounded text-left cursor-pointer w-full truncate ${sel ? 'text-white font-bold' : 't-disabled hover:t-primary'}" style="${sel ? 'background:#8B5CF6' : ''}" title="${sf}">${sf}</button>`;
        }).join('')}
        </div>
      </div>`;
    }
  }

  // Loi d'Airain toggle — visible pour Conformité (Tronc Commun)
  const loiAirainHtml = (activeTab === 'conformite') ? `<div class="mt-3 pt-2" style="border-top:1px solid var(--border)">
    <button onclick="window._troncToggleLoiAirain()" class="text-[10px] px-2.5 py-1.5 rounded font-bold cursor-pointer transition-all w-full text-left ${window._troncLoiAirainState?.() ? 'text-white' : 't-disabled'}" style="background:${window._troncLoiAirainState?.() ? '#8B5CF6' : 'var(--bg-surface)'}">
      🛡️ Loi d'Airain ${window._troncLoiAirainState?.() ? 'ON' : 'OFF'}
    </button>
    <div class="text-[8px] t-disabled mt-1 px-1">Double validation : Tronc Commun ∩ ≥60% agences</div>
  </div>` : '';

  const el = document.getElementById('dirSidebarContent');
  if (el) el.innerHTML = `<div class="space-y-1">
    ${loiAirainHtml}
    <div class="text-[8px] t-disabled uppercase tracking-wider mb-1 font-bold">Univers</div>
    ${univBtns}
    ${famHtml}
    ${sfHtml}
  </div>`;
}

// Expose filter state for associations.js Tronc Commun
window._dirGetFamilleFilter = function() { return _dirFamilleFilter; };
window._dirGetSousFamilleFilter = function() { return _dirSousFamilleFilter; };

// ── Handlers sidebar ──
window._dirSetUnivers = function(letter) {
  _dirUniversFilter = _dirUniversFilter === letter ? '' : letter;
  _dirFamilleFilter = '';
  _dirSousFamilleFilter = '';
  // Sync Tronc Commun
  if (typeof window._troncSetUniversSilent === 'function') window._troncSetUniversSilent(_dirUniversFilter);
  _renderCurrentDirectionTab();
};

window._dirSetFamille = function(code) {
  _dirFamilleFilter = _dirFamilleFilter === code ? '' : code;
  _dirSousFamilleFilter = '';
  _renderCurrentDirectionTab();
};

window._dirSetSousFamille = function(sf) {
  _dirSousFamilleFilter = _dirSousFamilleFilter === sf ? '' : sf;
  _renderCurrentDirectionTab();
};

function _renderCurrentDirectionTab() {
  // Detect which Direction sub-tab is active
  const tabs = ['Conformite', 'Marques', 'Clones'];
  for (const t of tabs) {
    const el = document.getElementById('tab' + t);
    if (el && !el.classList.contains('hidden')) {
      if (t === 'Conformite') renderConformiteTab();
      else if (t === 'Marques') renderMarquesTab();
      else if (t === 'Clones') renderClonesTab();
      return;
    }
  }
}

/**
 * Double validation Physigamme pour le Radar de Conformité :
 * - Condition A (Labo)  : acheté par ≥60% des métiers stratégiques → transversalité
 * - Condition B (Réseau) : vendu dans ≥60% des agences → preuve logistique
 * Un article doit valider LES DEUX pour entrer dans le Tronc Commun Imposé.
 *
 * Retourne { codes, totalMetiers, totalStores, laboCount, reseauCount, source }
 */
function _getRadarTroncCodes(universLetter) {
  const vpm = _S.ventesParMagasin;
  if (!vpm || !Object.keys(vpm).length) return { codes: [], totalMetiers: 0, totalStores: 0, laboCount: 0, reseauCount: 0, source: 'none' };

  const stores = Object.keys(vpm);
  const storeThreshold = Math.ceil(stores.length * _confThreshold / 100);

  // ── Set B : articles vendus dans ≥60% des agences ──
  const articleStoreCount = {};
  for (const store of stores) {
    for (const code of Object.keys(vpm[store])) {
      if (!/^\d{6}$/.test(code)) continue;
      if (universLetter) {
        const fam = _S.articleFamille?.[code] || '';
        if (!fam || fam.charAt(0) !== universLetter) continue;
      }
      articleStoreCount[code] = (articleStoreCount[code] || 0) + 1;
    }
  }
  const reseauSet = new Set();
  for (const [code, count] of Object.entries(articleStoreCount)) {
    if (count >= storeThreshold) reseauSet.add(code);
  }

  // ── Set A : Tronc Commun Labo (métiers strat) ──
  let laboSet = null;
  let totalMetiers = 0;
  if (typeof window._computeTroncCommunForRadar === 'function' && _S.chalandiseData?.size) {
    const result = window._computeTroncCommunForRadar(universLetter);
    if (result?.articles?.length) {
      laboSet = new Set(result.articles.filter(a => a.indice >= 60).map(a => a.code));
      totalMetiers = result.totalMetiers;
    }
  }

  // ── Intersection A ∩ B (double validation) ──
  if (laboSet && laboSet.size > 0) {
    const codes = [...reseauSet].filter(code => laboSet.has(code));
    return { codes, totalMetiers, totalStores: stores.length, laboCount: laboSet.size, reseauCount: reseauSet.size, source: 'intersection' };
  }

  // Fallback sans chalandise : réseau seul
  return { codes: [...reseauSet], totalMetiers: 0, totalStores: stores.length, laboCount: 0, reseauCount: reseauSet.size, source: 'agences' };
}

export function renderConformiteTab() {
  const el = document.getElementById('conformiteContent');
  if (!el) return;
  // Sync sidebar filter → Tronc Commun
  if (typeof window._troncSetUniversSilent === 'function') window._troncSetUniversSilent(_dirUniversFilter);
  _buildDirectionSidebar('conformite');
  if (typeof window._renderTroncCommun === 'function') {
    el.innerHTML = `<div class="container mx-auto">${window._renderTroncCommun()}</div>`;
  } else {
    el.innerHTML = '<div class="text-center t-disabled py-12">Chargez un consommé et une chalandise pour activer le Tronc Commun.</div>';
  }
  return;

  const stores = Object.keys(vpm).sort();

  // Univers buttons
  const univers = Object.entries(FAM_LETTER_UNIVERS);
  const univBtns = univers.map(([letter, name]) => {
    const sel = _confUniversFilter === letter;
    return `<button onclick="window._confSetUnivers('${letter}')" class="text-[10px] px-2.5 py-1 rounded-full font-bold cursor-pointer transition-all ${sel ? 'text-white' : 't-disabled hover:t-primary'}" style="${sel ? 'background:#8B5CF6' : 'background:var(--bg-card)'}">${name}</button>`;
  }).join('');

  if (!_confUniversFilter) {
    el.innerHTML = `<div class="space-y-4">
      <h2 class="text-lg font-bold t-primary">🚨 Radar de Conformité</h2>
      <p class="text-[11px] t-disabled">Sélectionnez un univers pour vérifier l'implantation du Tronc Commun dans chaque agence.</p>
      <div class="flex flex-wrap gap-1.5">${univBtns}</div>
    </div>`;
    return;
  }

  // Double validation Physigamme : Labo (métiers) ∩ Réseau (agences)
  const troncResult = _getRadarTroncCodes(_confUniversFilter);
  const troncCodesAll = troncResult.codes;
  if (!troncCodesAll.length) {
    el.innerHTML = `<div class="space-y-4">
      <h2 class="text-lg font-bold t-primary">🚨 Radar de Conformité</h2>
      <div class="flex flex-wrap gap-1.5">${univBtns}</div>
      <p class="text-center t-disabled py-8">Aucun article Tronc Commun trouvé pour cet univers. ${troncResult.source === 'none' ? 'Chargez un consommé.' : 'Vérifiez le seuil de transversalité.'}</p>
    </div>`;
    return;
  }

  // ── Sous-filtre famille ──
  const famSet = new Map(); // famLabel → count
  for (const code of troncCodesAll) {
    const fam = famLib(_S.articleFamille?.[code] || '');
    if (fam) famSet.set(fam, (famSet.get(fam) || 0) + 1);
  }
  const famSorted = [...famSet.entries()].sort((a, b) => b[1] - a[1]);
  const famBtns = famSorted.length > 1 ? `<div class="flex flex-wrap gap-1">
    <button onclick="window._confSetFamille('')" class="text-[9px] px-2 py-0.5 rounded-full cursor-pointer font-bold ${!_confFamilleFilter ? 'text-white' : 't-disabled'}" style="${!_confFamilleFilter ? 'background:#6366f1' : 'background:var(--bg-surface)'}">Toutes (${troncCodesAll.length})</button>
    ${famSorted.map(([fam, count]) => {
      const sel = _confFamilleFilter === fam;
      return `<button onclick="window._confSetFamille('${fam.replace(/'/g, "\\'")}')" class="text-[9px] px-2 py-0.5 rounded-full cursor-pointer ${sel ? 'text-white font-bold' : 't-disabled'}" style="${sel ? 'background:#6366f1' : 'background:var(--bg-surface)'}">${fam} (${count})</button>`;
    }).join('')}
  </div>` : '';

  // Apply famille filter
  const troncCodes = _confFamilleFilter
    ? troncCodesAll.filter(code => famLib(_S.articleFamille?.[code] || '') === _confFamilleFilter)
    : troncCodesAll;

  // For each store: count how many tronc articles they sell
  const storeData = [];
  for (const store of stores) {
    const sd = vpm[store];
    let implanted = 0, caTotal = 0, caMissed = 0;
    const missing = [];
    for (const code of troncCodes) {
      if (sd[code] && (sd[code].sumCA > 0 || sd[code].sumPrelevee > 0)) {
        implanted++;
        caTotal += sd[code].sumCA || 0;
      } else {
        const cas = stores.map(s => vpm[s]?.[code]?.sumCA || 0).filter(v => v > 0);
        const median = cas.length ? cas.sort((a, b) => a - b)[Math.floor(cas.length / 2)] : 0;
        caMissed += median;
        missing.push(code);
      }
    }
    const pct = troncCodes.length > 0 ? Math.round(implanted / troncCodes.length * 100) : 100;
    storeData.push({ store, implanted, total: troncCodes.length, pct, caTotal, caMissed, missing });
  }

  storeData.sort((a, b) => b.pct - a.pct);

  const myStore = _S.selectedMyStore;

  const rows = storeData.map(d => {
    const color = d.pct >= 80 ? '#22c55e' : d.pct >= 50 ? '#f59e0b' : '#ef4444';
    const barW = Math.max(d.pct, 2);
    const isMine = d.store === myStore;
    const ring = isMine ? 'outline:2px solid #8B5CF6;outline-offset:-2px;' : '';
    return `<tr class="hover:s-hover cursor-pointer" onclick="window._confShowMissing('${d.store}')" style="${ring}">
      <td class="px-3 py-2 text-[11px] font-bold ${isMine ? 'text-violet-400' : 't-primary'}">${d.store}</td>
      <td class="px-3 py-2">
        <div class="flex items-center gap-2">
          <div class="w-32 h-2 rounded-full" style="background:var(--bg-surface)">
            <div class="h-full rounded-full transition-all" style="width:${barW}%;background:${color}"></div>
          </div>
          <span class="text-[11px] font-bold" style="color:${color}">${d.pct}%</span>
        </div>
      </td>
      <td class="px-3 py-2 text-[11px] t-primary text-right">${d.implanted}/${d.total}</td>
      <td class="px-3 py-2 text-[11px] t-disabled text-right">${formatEuro(d.caTotal)}</td>
      <td class="px-3 py-2 text-[11px] font-bold text-right" style="color:${d.caMissed > 1000 ? '#ef4444' : '#f59e0b'}">${d.caMissed > 0 ? formatEuro(d.caMissed) : '-'}</td>
      <td class="px-3 py-2 text-[11px] t-disabled text-right">${d.missing.length > 0 ? d.missing.length + ' réf.' : '✓'}</td>
    </tr>`;
  }).join('');

  // Summary
  const avgPct = Math.round(storeData.reduce((s, d) => s + d.pct, 0) / storeData.length);
  const below50 = storeData.filter(d => d.pct < 50).length;
  const totalMissedCA = storeData.reduce((s, d) => s + d.caMissed, 0);
  const familleLabel = _confFamilleFilter ? ` · ${_confFamilleFilter}` : '';

  // Note de transparence
  const sourceNote = troncResult.source === 'intersection'
    ? `Double validation : ≥${_confThreshold}% métiers strat. (${troncResult.laboCount} Labo) ∩ ≥${_confThreshold}% agences (${troncResult.reseauCount} Réseau) = ${troncCodes.length} imposés`
    : `Basé sur ≥${_confThreshold}% des ${troncResult.totalStores} agences (pas de chalandise)`;

  el.innerHTML = `<div class="space-y-4">
    <div class="flex items-center justify-between flex-wrap gap-2">
      <h2 class="text-lg font-bold t-primary">🚨 Radar de Conformité</h2>
      <button onclick="window._confExport()" class="text-[10px] px-3 py-1.5 rounded-lg font-bold cursor-pointer text-white" style="background:#8B5CF6">📥 Exporter</button>
    </div>
    <div class="flex flex-wrap gap-1.5">${univBtns}</div>
    ${famBtns}
    <div class="text-[9px] t-disabled px-1">${sourceNote}</div>
    <div class="grid grid-cols-4 gap-3">
      <div class="rounded-lg p-3 text-center" style="background:var(--bg-card)">
        <div class="text-2xl font-black" style="color:#8B5CF6">${troncCodes.length}</div>
        <div class="text-[10px] t-primary font-bold">Tronc Commun Imposé${familleLabel}</div>
        <div class="text-[9px] t-disabled">${troncResult.source === 'intersection' ? `${troncResult.totalMetiers} métiers × ${troncResult.totalStores} agences` : `≥ ${_confThreshold}% des agences`}</div>
      </div>
      <div class="rounded-lg p-3 text-center" style="background:var(--bg-card)">
        <div class="text-2xl font-black" style="color:${avgPct >= 70 ? '#22c55e' : '#f59e0b'}">${avgPct}%</div>
        <div class="text-[10px] t-primary font-bold">Implantation moyenne</div>
      </div>
      <div class="rounded-lg p-3 text-center" style="background:var(--bg-card)">
        <div class="text-2xl font-black" style="color:#ef4444">${below50}</div>
        <div class="text-[10px] t-primary font-bold">Agences < 50%</div>
        <div class="text-[9px] t-disabled">à recadrer</div>
      </div>
      <div class="rounded-lg p-3 text-center" style="background:var(--bg-card)">
        <div class="text-2xl font-black" style="color:#ef4444">${formatEuro(totalMissedCA)}</div>
        <div class="text-[10px] t-primary font-bold">CA perdu estimé</div>
        <div class="text-[9px] t-disabled">réseau</div>
      </div>
    </div>
    <div id="confMissingPanel"></div>
    <div class="overflow-x-auto rounded-lg" style="background:var(--bg-card)">
      <table class="w-full">
        <thead><tr class="text-[9px] t-disabled uppercase tracking-wider">
          <th class="px-3 py-2 text-left">Agence</th>
          <th class="px-3 py-2 text-left">Implantation</th>
          <th class="px-3 py-2 text-right">Couverture</th>
          <th class="px-3 py-2 text-right">CA vendus</th>
          <th class="px-3 py-2 text-right">CA perdu est.</th>
          <th class="px-3 py-2 text-right">Manquants</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  </div>`;
}

window._confSetUnivers = function(letter) {
  _confUniversFilter = _confUniversFilter === letter ? '' : letter;
  _confFamilleFilter = ''; // reset sous-filtre
  renderConformiteTab();
};

window._confSetFamille = function(fam) {
  _confFamilleFilter = _confFamilleFilter === fam ? '' : fam;
  renderConformiteTab();
};

// Helper : regroupe les codes manquants par famille, triés par CA médian desc
function _groupMissingByFamille(missing, vpm, stores) {
  const groups = new Map(); // famLabel → [{code, lib, fam, nbStores, medianCA}]
  for (const code of missing) {
    const lib = _S.libelleLookup?.[code] || code;
    const fam = famLib(_S.articleFamille?.[code] || '') || 'Autres';
    const cas = stores.map(s => vpm[s]?.[code]?.sumCA || 0).filter(v => v > 0);
    const medianCA = cas.length ? cas.sort((a, b) => a - b)[Math.floor(cas.length / 2)] : 0;
    if (!groups.has(fam)) groups.set(fam, []);
    groups.get(fam).push({ code, lib, fam, nbStores: cas.length, medianCA });
  }
  // Sort articles within each group by CA desc
  for (const arts of groups.values()) arts.sort((a, b) => b.medianCA - a.medianCA);
  // Sort groups by total CA desc
  return [...groups.entries()].sort((a, b) => {
    const caA = a[1].reduce((s, r) => s + r.medianCA, 0);
    const caB = b[1].reduce((s, r) => s + r.medianCA, 0);
    return caB - caA;
  });
}

window._confShowMissing = function(store) {
  const panel = document.getElementById('confMissingPanel');
  if (!panel) return;
  const vpm = _S.ventesParMagasin;
  const troncCodesAll = _getRadarTroncCodes(_confUniversFilter).codes;
  // Apply famille filter
  const troncCodes = _confFamilleFilter
    ? troncCodesAll.filter(code => famLib(_S.articleFamille?.[code] || '') === _confFamilleFilter)
    : troncCodesAll;
  const sd = vpm[store] || {};
  const missing = troncCodes.filter(code => !sd[code] || (sd[code].sumCA <= 0 && sd[code].sumPrelevee <= 0));
  if (!missing.length) {
    panel.innerHTML = `<div class="rounded-lg p-3 text-[11px]" style="background:var(--bg-card);border-left:3px solid #22c55e"><strong class="text-green-400">${store}</strong> — ✅ 100% conforme, tous les articles du Tronc Commun sont implantés.</div>`;
    return;
  }
  const stores = Object.keys(vpm);
  const groups = _groupMissingByFamille(missing, vpm, stores);

  // Build grouped rows with famille headers
  let tableRows = '';
  for (const [fam, arts] of groups) {
    tableRows += `<tr><td colspan="4" class="px-2 pt-3 pb-1"><span class="text-[10px] font-black t-primary" style="color:#8B5CF6">📁 ${fam.toUpperCase()}</span> <span class="text-[9px] t-disabled">(${arts.length} manquant${arts.length > 1 ? 's' : ''})</span></td></tr>`;
    for (const r of arts) {
      tableRows += `<tr class="text-[10px]">
        <td class="px-2 py-1 font-mono t-disabled pl-5">${r.code}</td>
        <td class="px-2 py-1 t-primary">${r.lib}</td>
        <td class="px-2 py-1 text-right t-disabled">${r.nbStores} ag.</td>
        <td class="px-2 py-1 text-right font-bold" style="color:#f59e0b">${formatEuro(r.medianCA)}</td>
      </tr>`;
    }
  }

  panel.innerHTML = `<div class="rounded-lg p-3 space-y-2" style="background:var(--bg-card);border-left:3px solid #ef4444">
    <div class="flex items-center justify-between">
      <span class="text-[11px]"><strong class="text-red-400">${store}</strong> — <strong>${missing.length}</strong> articles manquants dans <strong>${groups.length}</strong> familles</span>
      <button onclick="window._confExportMissing('${store}')" class="text-[9px] px-2 py-0.5 rounded cursor-pointer" style="background:#8B5CF6;color:white">📥 Ordre d'implantation</button>
    </div>
    <table class="w-full"><thead><tr class="text-[8px] t-disabled uppercase">
      <th class="px-2 py-1 text-left">Code</th><th class="px-2 py-1 text-left">Article</th><th class="px-2 py-1 text-right">Présent dans</th><th class="px-2 py-1 text-right">CA médian</th>
    </tr></thead><tbody>${tableRows}</tbody></table>
  </div>`;
};

window._confExportMissing = function(store) {
  const vpm = _S.ventesParMagasin;
  const troncCodesAll = _getRadarTroncCodes(_confUniversFilter).codes;
  const troncCodes = _confFamilleFilter
    ? troncCodesAll.filter(code => famLib(_S.articleFamille?.[code] || '') === _confFamilleFilter)
    : troncCodesAll;
  const sd = vpm[store] || {};
  const missing = troncCodes.filter(code => !sd[code] || (sd[code].sumCA <= 0 && sd[code].sumPrelevee <= 0));
  const stores = Object.keys(vpm);

  // Group + sort by famille for structured export
  const groups = _groupMissingByFamille(missing, vpm, stores);
  let csv = 'Famille;Code;Article;Agences présentes;CA médian réseau\n';
  for (const [fam, arts] of groups) {
    for (const r of arts) {
      csv += `${fam};${r.code};${r.lib.replace(/;/g, ',')};${r.nbStores};${Math.round(r.medianCA)}\n`;
    }
  }
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
  const suffix = _confFamilleFilter ? `_${_confFamilleFilter.replace(/[^a-zA-Z0-9]/g, '_')}` : '';
  a.download = `PRISME_Ordre_Implantation_${store}_${_confUniversFilter}${suffix}.csv`;
  a.click();
};

window._confExport = function() {
  const vpm = _S.ventesParMagasin;
  const troncCodes = _getRadarTroncCodes(_confUniversFilter).codes;
  const stores = Object.keys(vpm).sort();
  let csv = 'Agence;Implantation %;Articles implantés;Total;CA vendus;CA perdu estimé;Manquants\n';
  for (const store of stores) {
    const sd = vpm[store];
    let impl = 0, ca = 0, missed = 0;
    for (const code of troncCodes) {
      if (sd[code] && (sd[code].sumCA > 0 || sd[code].sumPrelevee > 0)) { impl++; ca += sd[code].sumCA || 0; }
      else {
        const cas = stores.map(s => vpm[s]?.[code]?.sumCA || 0).filter(v => v > 0);
        missed += cas.length ? cas.sort((a, b) => a - b)[Math.floor(cas.length / 2)] : 0;
      }
    }
    csv += `${store};${Math.round(impl / troncCodes.length * 100)};${impl};${troncCodes.length};${Math.round(ca)};${Math.round(missed)};${troncCodes.length - impl}\n`;
  }
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
  a.download = `PRISME_Radar_Conformite_${_confUniversFilter}.csv`;
  a.click();
};

// ═══════════════════════════════════════════════════════════════════
// MODULE 2 : TRIBUNAL DES MARQUES
// ═══════════════════════════════════════════════════════════════════

let _marquesSearch = '';
let _marquesSelected = '';

export function renderMarquesTab() {
  const el = document.getElementById('marquesContent');
  if (!el) return;

  const catMarques = _S.catalogueMarques;
  const marqueArts = _S.marqueArticles;
  if (!catMarques?.size || !marqueArts?.size) {
    el.innerHTML = '<div class="text-center t-disabled py-12">Chargez le catalogue (catalogue.xls) pour activer le Tribunal des Marques.</div>';
    return;
  }

  // Search bar
  const searchHtml = `<div class="flex items-center gap-3">
    <input type="text" id="marqueSearchInput" value="${_marquesSearch}" placeholder="Rechercher une marque..." oninput="window._marquesOnSearch(this.value)"
      class="text-[11px] px-3 py-1.5 rounded-lg w-64" style="background:var(--bg-surface);border:1px solid var(--border);color:var(--fg)" />
  </div>`;

  if (_marquesSelected) {
    // Detailed view for one brand
    const detailContent = `<div class="space-y-4">
      <div class="flex items-center justify-between">
        <h2 class="text-lg font-bold t-primary">⚖️ Tribunal des Marques</h2>
        <button onclick="window._marquesBack()" class="text-[10px] px-3 py-1 rounded cursor-pointer" style="background:var(--bg-card);color:var(--c-action)">← Retour liste</button>
      </div>
      ${_renderMarqueDetail(_marquesSelected)}
    </div>`;
    _buildDirectionSidebar('marques');
    el.innerHTML = detailContent;
    return;
  }

  // List of all brands with quick stats
  const vpm = _S.ventesParMagasin;
  const stores = Object.keys(vpm || {});
  const fd = DataStore.finalData;
  const fdMap = new Map(); for (const r of fd) fdMap.set(r.code, r);

  const brandStats = [];
  for (const [marque, codes] of marqueArts) {
    if (_marquesSearch && !marque.toLowerCase().includes(_marquesSearch.toLowerCase())) continue;
    let caTotal = 0, nbRefs = 0, nbPoidsMorts = 0, nbSocles = 0, nbStoresTotal = 0;
    for (const code of codes) {
      const r = fdMap.get(code);
      if (!r) continue;
      // Filtre univers/famille/sous-famille depuis sidebar
      if (_dirUniversFilter) {
        const fam = _S.articleFamille?.[code] || r.famille || '';
        if (!fam || fam.charAt(0) !== _dirUniversFilter) continue;
        if (_dirFamilleFilter && fam !== _dirFamilleFilter) continue;
        if (_dirSousFamilleFilter) {
          const sf = _S.catalogueFamille?.get(code)?.sousFam || r.sousFamille || '';
          if (sf !== _dirSousFamilleFilter) continue;
        }
      }
      nbRefs++;
      // CA réseau = somme sur toutes les agences
      if (vpm) {
        for (const s of stores) {
          const v = vpm[s]?.[code];
          if (v?.sumCA > 0) { caTotal += v.sumCA; nbStoresTotal++; }
        }
      }
      // Verdict based on ABC/FMR
      if ((r.abcClass === 'C' && r.fmrClass === 'R') || (r.abcClass === 'C' && r.fmrClass === 'M')) nbPoidsMorts++;
      if (r.abcClass === 'A' || (r.abcClass === 'B' && r.fmrClass === 'F')) nbSocles++;
    }
    if (nbRefs === 0) continue;
    const pctPM = Math.round(nbPoidsMorts / nbRefs * 100);
    const pctSocle = Math.round(nbSocles / nbRefs * 100);
    brandStats.push({ marque, nbRefs, caTotal, nbPoidsMorts, pctPM, nbSocles, pctSocle, avgStores: Math.round(nbStoresTotal / nbRefs) });
  }

  brandStats.sort((a, b) => b.caTotal - a.caTotal);

  const rows = brandStats.slice(0, 100).map(b => {
    const pmColor = b.pctPM >= 50 ? '#ef4444' : b.pctPM >= 30 ? '#f59e0b' : '#22c55e';
    const socColor = b.pctSocle >= 30 ? '#22c55e' : b.pctSocle >= 15 ? '#f59e0b' : '#ef4444';
    return `<tr class="hover:s-hover cursor-pointer" onclick="window._marquesSelect('${b.marque.replace(/'/g, "\\'")}')">
      <td class="px-3 py-2 text-[11px] font-bold t-primary">${b.marque}</td>
      <td class="px-3 py-2 text-[11px] t-disabled text-right">${b.nbRefs}</td>
      <td class="px-3 py-2 text-[11px] font-bold text-right" style="color:var(--c-action)">${formatEuro(b.caTotal)}</td>
      <td class="px-3 py-2 text-right"><span class="text-[10px] font-bold px-1.5 py-0.5 rounded" style="color:${socColor};background:${socColor}22">${b.pctSocle}%</span></td>
      <td class="px-3 py-2 text-right"><span class="text-[10px] font-bold px-1.5 py-0.5 rounded" style="color:${pmColor};background:${pmColor}22">${b.pctPM}%</span></td>
      <td class="px-3 py-2 text-[11px] t-disabled text-right">${b.avgStores} ag.</td>
    </tr>`;
  }).join('');

  const filterLabel = _dirUniversFilter ? ` · ${FAM_LETTER_UNIVERS[_dirUniversFilter] || _dirUniversFilter}${_dirFamilleFilter ? ' · ' + famLib(_dirFamilleFilter) : ''}` : '';
  const listContent = `<div class="space-y-4">
    <div class="flex items-center justify-between flex-wrap gap-2">
      <h2 class="text-lg font-bold t-primary">⚖️ Tribunal des Marques</h2>
      ${searchHtml}
    </div>
    <div class="text-[10px] t-disabled">${brandStats.length} marques${filterLabel} · Top 100 par CA</div>
    <div class="overflow-x-auto rounded-lg" style="background:var(--bg-card)">
      <table class="w-full">
        <thead><tr class="text-[9px] t-disabled uppercase tracking-wider">
          <th class="px-3 py-2 text-left">Marque</th>
          <th class="px-3 py-2 text-right">Réfs</th>
          <th class="px-3 py-2 text-right">CA réseau</th>
          <th class="px-3 py-2 text-right">🔵 Socles</th>
          <th class="px-3 py-2 text-right">🔴 Poids Morts</th>
          <th class="px-3 py-2 text-right">Agences moy.</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  </div>`;
  _buildDirectionSidebar('marques');
  el.innerHTML = listContent;
}

function _renderMarqueDetail(marque) {
  const codes = _S.marqueArticles?.get(marque);
  if (!codes?.size) return '<p class="t-disabled">Aucun article trouvé.</p>';

  const fd = DataStore.finalData;
  const fdMap = new Map(); for (const r of fd) fdMap.set(r.code, r);
  const vpm = _S.ventesParMagasin || {};
  const stores = Object.keys(vpm);

  let caTotal = 0, nbRefs = 0, nbPM = 0, nbSocles = 0, nbRuptures = 0;
  const articles = [];

  for (const code of codes) {
    const r = fdMap.get(code);
    if (!r) continue;
    nbRefs++;
    const isPM = (r.abcClass === 'C' && (r.fmrClass === 'R' || r.fmrClass === 'M'));
    const isSocle = r.abcClass === 'A' || (r.abcClass === 'B' && r.fmrClass === 'F');
    if (isPM) nbPM++;
    if (isSocle) nbSocles++;
    if (r.stockActuel <= 0 && r.W >= 3) nbRuptures++;

    // CA réseau = somme sur toutes les agences
    let caReseau = 0, storeCount = 0;
    for (const s of stores) {
      const v = vpm[s]?.[code];
      if (v?.sumCA > 0) { caReseau += v.sumCA; storeCount++; }
    }
    caTotal += caReseau;

    const verdict = isSocle ? '🔵 Socle' : isPM ? '🔴 Poids Mort' : '⚪ Intermédiaire';
    const verdictColor = isSocle ? '#3b82f6' : isPM ? '#ef4444' : 'var(--fg-secondary)';
    articles.push({ code, lib: r.libelle, ca: caReseau, abc: r.abcClass, fmr: r.fmrClass, storeCount, verdict, verdictColor, stock: r.stockActuel, w: r.W });
  }

  articles.sort((a, b) => b.ca - a.ca);

  const pctPM = nbRefs > 0 ? Math.round(nbPM / nbRefs * 100) : 0;
  const pctSocle = nbRefs > 0 ? Math.round(nbSocles / nbRefs * 100) : 0;
  const pctInter = 100 - pctPM - pctSocle;

  // Donut chart via CSS conic-gradient
  const donutStyle = `background:conic-gradient(#3b82f6 0% ${pctSocle}%, #6b7280 ${pctSocle}% ${pctSocle + pctInter}%, #ef4444 ${pctSocle + pctInter}% 100%)`;

  const rows = articles.map(a => {
    return `<tr class="text-[10px]">
      <td class="px-2 py-1.5 font-mono t-disabled">${a.code}</td>
      <td class="px-2 py-1.5 t-primary">${a.lib}</td>
      <td class="px-2 py-1.5 text-center"><span class="font-bold">${a.abc}${a.fmr}</span></td>
      <td class="px-2 py-1.5 text-right font-bold" style="color:var(--c-action)">${formatEuro(a.ca)}</td>
      <td class="px-2 py-1.5 text-right t-disabled">${a.storeCount} ag.</td>
      <td class="px-2 py-1.5"><span style="color:${a.verdictColor}">${a.verdict}</span></td>
    </tr>`;
  }).join('');

  return `<div class="space-y-4">
    <div class="flex items-center gap-4">
      <h3 class="text-xl font-black t-primary">${marque}</h3>
      <button onclick="window._marquesExportPDF('${marque.replace(/'/g, "\\'")}')" class="text-[10px] px-3 py-1 rounded cursor-pointer text-white" style="background:#8B5CF6">📥 Export Bilan</button>
    </div>
    <div class="grid grid-cols-5 gap-3">
      <div class="rounded-lg p-3 text-center" style="background:var(--bg-card)">
        <div class="text-2xl font-black" style="color:var(--c-action)">${formatEuro(caTotal)}</div>
        <div class="text-[10px] t-primary font-bold">CA Réseau</div>
      </div>
      <div class="rounded-lg p-3 text-center" style="background:var(--bg-card)">
        <div class="text-2xl font-black t-primary">${nbRefs}</div>
        <div class="text-[10px] t-disabled">Références</div>
      </div>
      <div class="rounded-lg p-3 text-center" style="background:var(--bg-card)">
        <div class="text-2xl font-black" style="color:#3b82f6">${pctSocle}%</div>
        <div class="text-[10px] font-bold" style="color:#3b82f6">Socles</div>
      </div>
      <div class="rounded-lg p-3 text-center" style="background:var(--bg-card)">
        <div class="text-2xl font-black" style="color:#ef4444">${pctPM}%</div>
        <div class="text-[10px] font-bold" style="color:#ef4444">Poids Morts</div>
        <div class="text-[9px] t-disabled">Le Camembert de la Honte</div>
      </div>
      <div class="rounded-lg p-3 flex items-center justify-center" style="background:var(--bg-card)">
        <div class="w-16 h-16 rounded-full" style="${donutStyle};position:relative">
          <div class="absolute inset-2 rounded-full" style="background:var(--bg-card)"></div>
        </div>
      </div>
    </div>
    ${nbRuptures > 0 ? `<div class="rounded-lg px-3 py-2 text-[11px]" style="background:rgba(239,68,68,0.1);border-left:3px solid #ef4444">⚠️ <strong>${nbRuptures}</strong> article${nbRuptures > 1 ? 's' : ''} en rupture dans votre agence</div>` : ''}
    <div class="overflow-x-auto rounded-lg" style="background:var(--bg-card)">
      <table class="w-full"><thead><tr class="text-[8px] t-disabled uppercase tracking-wider">
        <th class="px-2 py-1.5 text-left">Code</th><th class="px-2 py-1.5 text-left">Article</th>
        <th class="px-2 py-1.5 text-center">ABC/FMR</th><th class="px-2 py-1.5 text-right">CA</th>
        <th class="px-2 py-1.5 text-right">Agences</th><th class="px-2 py-1.5 text-left">Verdict</th>
      </tr></thead><tbody>${rows}</tbody></table>
    </div>
  </div>`;
}

window._marquesOnSearch = function(val) {
  _marquesSearch = val;
  renderMarquesTab();
};

window._marquesSelect = function(marque) {
  _marquesSelected = marque;
  renderMarquesTab();
};

window._marquesBack = function() {
  _marquesSelected = '';
  renderMarquesTab();
};

window._marquesExportPDF = function(marque) {
  // Export CSV bilan fournisseur
  const codes = _S.marqueArticles?.get(marque);
  if (!codes?.size) return;
  const fd = DataStore.finalData;
  const fdMap = new Map(); for (const r of fd) fdMap.set(r.code, r);
  const vpm = _S.ventesParMagasin || {};
  const stores = Object.keys(vpm);

  let csv = 'Code;Article;ABC;FMR;CA Réseau;Agences;Verdict\n';
  for (const code of codes) {
    const r = fdMap.get(code);
    if (!r) continue;
    const isPM = (r.abcClass === 'C' && (r.fmrClass === 'R' || r.fmrClass === 'M'));
    const isSocle = r.abcClass === 'A' || (r.abcClass === 'B' && r.fmrClass === 'F');
    let sc = 0, caR = 0; for (const s of stores) { const v = vpm[s]?.[code]; if (v?.sumCA > 0) { sc++; caR += v.sumCA; } }
    const verdict = isSocle ? 'Socle' : isPM ? 'Poids Mort' : 'Intermédiaire';
    csv += `${code};${(r.libelle || '').replace(/;/g, ',')};${r.abcClass};${r.fmrClass};${Math.round(caR)};${sc};${verdict}\n`;
  }
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
  a.download = `PRISME_Bilan_${marque.replace(/[^a-zA-Z0-9]/g, '_')}.csv`;
  a.click();
};

// ═══════════════════════════════════════════════════════════════════
// MODULE 3 : TUEUR DE CLONES
// ═══════════════════════════════════════════════════════════════════

let _clonesSearch = '';
let _clonesSousFamille = '';

// ── Détection tailles/pointures ──────────────────────────────────
// Nettoie le libellé pour regrouper les déclinaisons (tailles, pointures)
// "CHAUSSURES BASSES MATT S3 43" → "CHAUSSURES BASSES MATT S3"
// "GANT NITRILE XL"              → "GANT NITRILE"
// "PANTALON GENOUILLERE 44"      → "PANTALON GENOUILLERE"
const _SIZE_SUFFIXES = /\s+(?:\d{2,3}(?:[.,\/]\d{1,2})?|XXS|XS|XXL|XL|[SML]|T[0-9]+|P[0-9]+|UN(?:I(?:QUE)?)?)\s*$/i;
function _stripSize(lib) {
  if (!lib) return '';
  let base = lib.trim();
  // Strip iteratively (handles "CHAUSSURE MATT S3 SRC 43")
  for (let i = 0; i < 3; i++) {
    const m = base.match(_SIZE_SUFFIXES);
    if (!m) break;
    base = base.substring(0, m.index).trim();
  }
  return base || lib.trim();
}

function _buildProductLines(articles) {
  // Regroupe les articles par ligne de produit (libellé sans taille × marque)
  const lineMap = new Map(); // key → { baseName, marque, codes[], totalCA, bestABC, storeSet, skus[] }
  for (const a of articles) {
    const base = _stripSize(a.lib);
    const key = (a.marque || '??') + '|||' + base;
    if (!lineMap.has(key)) {
      lineMap.set(key, { baseName: base, marque: a.marque, codes: [], totalCA: 0, storeSet: new Set(), skus: [] });
    }
    const line = lineMap.get(key);
    line.codes.push(a.code);
    line.totalCA += a.ca;
    line.skus.push(a);
    // Merge ABC — garde le meilleur
    for (let s = 0; s < a.storeCount; s++) line.storeSet.add(a.code + '_' + s); // approx store count
  }
  // Compute line-level verdict : une ligne est PM si TOUS ses SKUs sont PM
  const lines = [];
  for (const [, line] of lineMap) {
    const nbSkus = line.skus.length;
    const nbPM = line.skus.filter(a => a.abc === 'C' && (a.fmr === 'R' || a.fmr === 'M')).length;
    const nbSocle = line.skus.filter(a => a.abc === 'A' || (a.abc === 'B' && a.fmr === 'F')).length;
    const isTaille = line.skus.length > 1 && line.skus.some(a => a.lib !== line.skus[0].lib);
    // Best ABC/FMR across SKUs
    const abcOrder = { A: 3, B: 2, C: 1 };
    const fmrOrder = { F: 3, M: 2, R: 1 };
    let bestABC = 'C', bestFMR = 'R';
    for (const a of line.skus) {
      if ((abcOrder[a.abc] || 0) > (abcOrder[bestABC] || 0)) bestABC = a.abc;
      if ((fmrOrder[a.fmr] || 0) > (fmrOrder[bestFMR] || 0)) bestFMR = a.fmr;
    }
    // Max store count across SKUs (pas additionnel — un magasin peut vendre plusieurs tailles)
    const maxStores = Math.max(...line.skus.map(a => a.storeCount), 0);
    lines.push({
      baseName: line.baseName, marque: line.marque, codes: line.codes,
      ca: line.totalCA, abc: bestABC, fmr: bestFMR,
      storeCount: maxStores, nbSkus, nbPM, nbSocle, isTaille,
      isPM: nbPM === nbSkus && nbSkus > 0,
      isSocle: nbSocle > 0,
      skus: line.skus.sort((a, b) => b.ca - a.ca)
    });
  }
  return lines.sort((a, b) => b.ca - a.ca);
}

export function renderClonesTab() {
  const el = document.getElementById('clonesContent');
  if (!el) return;

  const fd = DataStore.finalData;
  if (!fd?.length) {
    el.innerHTML = '<div class="text-center t-disabled py-12">Chargez un consommé + stock pour activer le Tueur de Clones.</div>';
    return;
  }

  // Build sous-famille index
  const sfMap = new Map();
  const vpm = _S.ventesParMagasin || {};
  const stores = Object.keys(vpm);
  const catFam = _S.catalogueFamille;

  for (const r of fd) {
    if (!/^\d{6}$/.test(r.code)) continue;
    // Filtre univers/famille/sous-famille depuis sidebar
    if (_dirUniversFilter) {
      const fam = _S.articleFamille?.[r.code] || r.famille || '';
      if (!fam || fam.charAt(0) !== _dirUniversFilter) continue;
      if (_dirFamilleFilter && fam !== _dirFamilleFilter) continue;
      if (_dirSousFamilleFilter) {
        const sfCheck = catFam?.get(r.code)?.sousFam || r.sousFamille || '';
        if (sfCheck !== _dirSousFamilleFilter) continue;
      }
    }
    const sf = (catFam?.get(r.code)?.sousFam) || r.sousFamille || '';
    const sfCode = (catFam?.get(r.code)?.codeSousFam) || '';
    const sfLabel = sf || sfCode || famLib(r.famille);
    if (!sfLabel || sfLabel.length < 2) continue;
    if (!sfMap.has(sfLabel)) sfMap.set(sfLabel, []);
    let caReseau = 0, storeCount = 0;
    for (const s of stores) {
      const v = vpm[s]?.[r.code];
      if (v?.sumCA > 0) { caReseau += v.sumCA; storeCount++; }
    }
    const marque = _S.catalogueMarques?.get(r.code) || '';
    sfMap.get(sfLabel).push({
      code: r.code, lib: r.libelle, ca: caReseau, abc: r.abcClass, fmr: r.fmrClass,
      storeCount, stock: r.stockActuel, w: r.W, marque, famille: famLib(r.famille)
    });
  }

  const searchHtml = `<input type="text" value="${_clonesSearch}" placeholder="Rechercher une sous-famille..." oninput="window._clonesOnSearch(this.value)"
    class="text-[11px] px-3 py-1.5 rounded-lg w-72" style="background:var(--bg-surface);border:1px solid var(--border);color:var(--fg)" />`;

  if (_clonesSousFamille && sfMap.has(_clonesSousFamille)) {
    // ── Détail d'une sous-famille ──
    const articles = sfMap.get(_clonesSousFamille);
    const lines = _buildProductLines(articles);
    const totalCA = lines.reduce((s, l) => s + l.ca, 0);
    const leader = lines[0];
    const nbLines = lines.length;
    const hasSizeVariants = lines.some(l => l.isTaille);

    // Verdicts par ligne
    const lineRows = lines.map((l, i) => {
      const icon = i === 0 ? '🏆' : l.isPM ? '☠️' : '⚪';
      const verdictLabel = i === 0 ? 'Leader' : l.isPM ? 'Clone toxique' : 'Challenger';
      const verdictColor = i === 0 ? '#22c55e' : l.isPM ? '#ef4444' : '#f59e0b';
      const pctCA = totalCA > 0 ? Math.round(l.ca / totalCA * 100) : 0;
      const sizeTag = l.isTaille ? `<span class="text-[8px] px-1 py-0.5 rounded" style="background:#8B5CF622;color:#8B5CF6">${l.nbSkus} tailles</span>` : '';
      const skuList = l.nbSkus > 1
        ? `<div class="text-[8px] t-disabled mt-0.5">${l.skus.map(s => s.lib.replace(l.baseName, '').trim() || s.code).join(' · ')}</div>`
        : '';
      return `<tr class="text-[10px] ${l.isPM && i > 0 ? 'bg-red-500/5' : ''}">
        <td class="px-2 py-1.5">${icon}</td>
        <td class="px-2 py-1.5 t-primary">${l.baseName} ${sizeTag}${skuList}</td>
        <td class="px-2 py-1.5 t-disabled">${l.marque}</td>
        <td class="px-2 py-1.5 text-center font-bold">${l.abc}${l.fmr}</td>
        <td class="px-2 py-1.5 text-right t-disabled">${l.nbSkus}</td>
        <td class="px-2 py-1.5 text-right font-bold" style="color:var(--c-action)">${formatEuro(l.ca)}</td>
        <td class="px-2 py-1.5 text-right t-disabled">${pctCA}%</td>
        <td class="px-2 py-1.5 text-right t-disabled">${l.storeCount} ag.</td>
        <td class="px-2 py-1.5"><span style="color:${verdictColor}" class="font-bold">${verdictLabel}</span></td>
      </tr>`;
    }).join('');

    const cloneCA = lines.slice(1).reduce((s, l) => s + l.ca, 0);
    const pctClone = totalCA > 0 ? Math.round(cloneCA / totalCA * 100) : 0;
    const sizeNote = hasSizeVariants
      ? `<div class="text-[9px] px-3 py-1.5 rounded-lg flex items-center gap-1.5" style="background:#8B5CF615;color:#8B5CF6">
          <span>👟</span> Les déclinaisons tailles/pointures sont regroupées en une seule ligne produit. Seules les marques concurrentes sont comparées.
        </div>`
      : '';

    const detailContent = `<div class="space-y-4">
      <div class="flex items-center justify-between flex-wrap gap-2">
        <h2 class="text-lg font-bold t-primary">☠️ Tueur de Clones</h2>
        <button onclick="window._clonesBack()" class="text-[10px] px-3 py-1 rounded cursor-pointer" style="background:var(--bg-card);color:var(--c-action)">← Retour</button>
      </div>
      <h3 class="text-base font-bold t-primary">${_clonesSousFamille}</h3>
      ${sizeNote}
      <div class="grid grid-cols-4 gap-3">
        <div class="rounded-lg p-3 text-center" style="background:var(--bg-card)">
          <div class="text-2xl font-black t-primary">${nbLines}</div>
          <div class="text-[10px] t-disabled">Lignes produit</div>
          <div class="text-[8px] t-disabled">${articles.length} SKUs</div>
        </div>
        <div class="rounded-lg p-3 text-center" style="background:var(--bg-card)">
          <div class="text-2xl font-black" style="color:var(--c-action)">${formatEuro(totalCA)}</div>
          <div class="text-[10px] t-disabled">CA total</div>
        </div>
        <div class="rounded-lg p-3 text-center" style="background:var(--bg-card)">
          <div class="text-2xl font-black" style="color:#22c55e">${formatEuro(leader.ca)}</div>
          <div class="text-[10px] font-bold" style="color:#22c55e">🏆 Leader</div>
        </div>
        <div class="rounded-lg p-3 text-center" style="background:var(--bg-card)">
          <div class="text-2xl font-black" style="color:${pctClone >= 40 ? '#ef4444' : '#f59e0b'}">${pctClone}%</div>
          <div class="text-[10px] font-bold" style="color:#ef4444">CA dilué (clones)</div>
        </div>
      </div>
      <div class="overflow-x-auto rounded-lg" style="background:var(--bg-card)">
        <table class="w-full"><thead><tr class="text-[8px] t-disabled uppercase tracking-wider">
          <th class="px-2 py-1.5"></th><th class="px-2 py-1.5 text-left">Ligne produit</th>
          <th class="px-2 py-1.5 text-left">Marque</th><th class="px-2 py-1.5 text-center">Classe</th>
          <th class="px-2 py-1.5 text-right">SKUs</th>
          <th class="px-2 py-1.5 text-right">CA</th><th class="px-2 py-1.5 text-right">% CA</th>
          <th class="px-2 py-1.5 text-right">Agences</th><th class="px-2 py-1.5 text-left">Verdict</th>
        </tr></thead><tbody>${lineRows}</tbody></table>
      </div>
      <button onclick="window._clonesExport('${_clonesSousFamille.replace(/'/g, "\\'")}')" class="text-[10px] px-3 py-1.5 rounded-lg font-bold cursor-pointer text-white" style="background:#ef4444">🗑️ Export déréférencement clones</button>
    </div>`;
    _buildDirectionSidebar('clones');
    el.innerHTML = detailContent;
    return;
  }

  // ── Liste des sous-familles avec potentiel de rationalisation ──
  const sfStats = [];
  for (const [sf, arts] of sfMap) {
    if (_clonesSearch && !sf.toLowerCase().includes(_clonesSearch.toLowerCase())) continue;
    const lines = _buildProductLines(arts);
    if (lines.length < 2) continue; // Pas de clone possible (1 seule ligne produit)
    const totalCA = lines.reduce((s, l) => s + l.ca, 0);
    const leaderPct = totalCA > 0 ? Math.round(lines[0].ca / totalCA * 100) : 0;
    const nbPMLines = lines.filter(l => l.isPM).length;
    const hasSizes = lines.some(l => l.isTaille);
    sfStats.push({ sf, nbLines: lines.length, nbSkus: arts.length, totalCA, leaderPct, nbPMLines, leader: lines[0].baseName, hasSizes });
  }

  sfStats.sort((a, b) => b.nbLines - a.nbLines);

  const rows = sfStats.slice(0, 100).map(s => {
    const danger = s.nbPMLines >= 3 ? '#ef4444' : s.nbPMLines >= 1 ? '#f59e0b' : '#22c55e';
    const sizeIcon = s.hasSizes ? ' 👟' : '';
    return `<tr class="hover:s-hover cursor-pointer" onclick="window._clonesSelect('${s.sf.replace(/'/g, "\\'")}')">
      <td class="px-3 py-2 text-[11px] font-bold t-primary">${s.sf}${sizeIcon}</td>
      <td class="px-3 py-2 text-[11px] text-center font-bold" style="color:${s.nbLines >= 5 ? '#ef4444' : s.nbLines >= 3 ? '#f59e0b' : 'var(--fg)'}">${s.nbLines}</td>
      <td class="px-3 py-2 text-[11px] text-right t-disabled">${s.nbSkus}</td>
      <td class="px-3 py-2 text-[11px] text-right" style="color:var(--c-action)">${formatEuro(s.totalCA)}</td>
      <td class="px-3 py-2 text-[11px] text-right t-disabled">${s.leaderPct}%</td>
      <td class="px-3 py-2 text-[11px] text-right"><span class="font-bold" style="color:${danger}">${s.nbPMLines}</span></td>
      <td class="px-3 py-2 text-[10px] t-disabled truncate max-w-[200px]">${s.leader}</td>
    </tr>`;
  }).join('');

  const filterLabel = _dirUniversFilter ? ` · ${FAM_LETTER_UNIVERS[_dirUniversFilter] || _dirUniversFilter}${_dirFamilleFilter ? ' · ' + famLib(_dirFamilleFilter) : ''}` : '';
  const listContent = `<div class="space-y-4">
    <div class="flex items-center justify-between flex-wrap gap-2">
      <h2 class="text-lg font-bold t-primary">☠️ Tueur de Clones</h2>
      ${searchHtml}
    </div>
    <div class="text-[10px] t-disabled">${sfStats.length} sous-familles avec doublons potentiels${filterLabel} · Top 100 · 👟 = contient des tailles</div>
    <div class="overflow-x-auto rounded-lg" style="background:var(--bg-card)">
      <table class="w-full"><thead><tr class="text-[9px] t-disabled uppercase tracking-wider">
        <th class="px-3 py-2 text-left">Sous-famille</th>
        <th class="px-3 py-2 text-center">Lignes</th>
        <th class="px-3 py-2 text-right">SKUs</th>
        <th class="px-3 py-2 text-right">CA total</th>
        <th class="px-3 py-2 text-right">Leader %</th>
        <th class="px-3 py-2 text-right">🔴 Clones PM</th>
        <th class="px-3 py-2 text-left">Leader</th>
      </tr></thead><tbody>${rows}</tbody></table>
    </div>
  </div>`;
  _buildDirectionSidebar('clones');
  el.innerHTML = listContent;
}

// Expose render functions for main.js switchTab
window.renderConformiteTab = renderConformiteTab;
window.renderMarquesTab = renderMarquesTab;
window.renderClonesTab = renderClonesTab;

window._clonesOnSearch = function(val) { _clonesSearch = val; renderClonesTab(); };
window._clonesSelect = function(sf) { _clonesSousFamille = sf; renderClonesTab(); };
window._clonesBack = function() { _clonesSousFamille = ''; renderClonesTab(); };

window._clonesExport = function(sf) {
  const fd = DataStore.finalData;
  const catFam = _S.catalogueFamille;
  const vpm = _S.ventesParMagasin || {};
  const stores = Object.keys(vpm);
  const articles = fd.filter(r => {
    if (!/^\d{6}$/.test(r.code)) return false;
    const sfLabel = (catFam?.get(r.code)?.sousFam) || r.sousFamille || famLib(r.famille);
    return sfLabel === sf;
  }).map(r => {
    let caR = 0, sc = 0;
    for (const s of stores) { const v = vpm[s]?.[r.code]; if (v?.sumCA > 0) { caR += v.sumCA; sc++; } }
    return { ...r, _caReseau: caR, _storeCount: sc, marque: _S.catalogueMarques?.get(r.code) || '' };
  });

  // Regrouper par ligne produit
  const lines = _buildProductLines(articles.map(r => ({
    code: r.code, lib: r.libelle, ca: r._caReseau, abc: r.abcClass, fmr: r.fmrClass,
    storeCount: r._storeCount, stock: r.stockActuel, w: r.W, marque: r.marque
  })));

  let csv = 'Ligne Produit;Marque;Codes;SKUs;ABC;FMR;CA Réseau;Agences;Verdict;Action\n';
  lines.forEach((l, i) => {
    const verdict = i === 0 ? 'Leader' : l.isPM ? 'Clone toxique' : 'Challenger';
    const action = i === 0 ? 'Conserver' : l.isPM ? 'DÉRÉFÉRENCER' : 'Surveiller';
    csv += `${l.baseName.replace(/;/g, ',')};${l.marque};${l.codes.join('+')};${l.nbSkus};${l.abc};${l.fmr};${Math.round(l.ca)};${l.storeCount};${verdict};${action}\n`;
  });
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
  a.download = `PRISME_Clones_${sf.replace(/[^a-zA-Z0-9]/g, '_')}.csv`;
  a.click();
};
