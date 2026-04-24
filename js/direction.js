'use strict';
/**
 * direction.js — Direction Réseau (V3 Siège)
 * Module : Radar de Conformité (Tronc Commun Physigamme)
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
  const el = document.getElementById('tabConformite');
  if (el && !el.classList.contains('hidden')) {
    renderConformiteTab();
    return;
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
        <td class="px-2 py-1 font-mono t-disabled pl-5">${r.code}<span class="ml-1 cursor-pointer opacity-50 hover:opacity-100" onclick="event.stopPropagation();if(window.openArticlePanel)window.openArticlePanel('${r.code}','conformite')" title="Voir détail article">🔍</span></td>
        <td class="px-2 py-1 t-primary">${r.lib}</td>
        <td class="px-2 py-1 text-right t-disabled">${r.nbStores} ag.</td>
        <td class="px-2 py-1 text-right font-bold" style="color:#f59e0b">${formatEuro(r.medianCA)}</td>
      </tr>`;
    }
  }

  panel.innerHTML = `<div class="rounded-lg p-3 space-y-2" style="background:var(--bg-card);border-left:3px solid #ef4444">
    <div class="flex items-center justify-between">
      <span class="text-[11px]"><strong class="text-red-400">${store}</strong> — <strong>${missing.length}</strong> articles manquants dans <strong>${groups.length}</strong> familles</span>
      <div class="flex items-center gap-2">
        <button onclick="window._confExportMissing('${store}')" class="text-[9px] px-2 py-0.5 rounded cursor-pointer" style="background:#8B5CF6;color:white">📥 Ordre d'implantation</button>
        <button onclick="document.getElementById('confMissingPanel').innerHTML=''" class="text-[11px] t-disabled hover:text-white cursor-pointer font-bold px-1" title="Fermer">✕</button>
      </div>
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

// Expose render functions for main.js switchTab
window.renderConformiteTab = renderConformiteTab;

