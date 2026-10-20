// © 2026 Jawad El Barkaoui — Tous droits réservés
// PRISME — Outil d'analyse BI pour distribution B2B
// Développé sur initiative et temps personnel
// Contact : Jawad EL BARKAOUI
// ═══════════════════════════════════════════════════════════════
// PRISME — main.js
// Point d'entrée ESM — orchestre tous les modules
// Contient le code applicatif extrait de index.html
// ═══════════════════════════════════════════════════════════════
'use strict';

import './constants.js';
import { extractClientCode, readExcel, _doCopyCode, _copyAllCodesDirect } from './utils.js';
import { _S, invalidateCache } from './state.js';
import { computeClientCrossing, _unikLink, computeReconquestCohort, computeOpportuniteNette, computeAnglesMorts, resetBenchMetierCache, computeOmniScores } from './engine.js';
import { parseChalandise, computeBenchmark, launchClientWorker } from './parser.js';
import { showToast, ToastManager, onFileSelected, _updateAnalyserBtn, collapseImportZone, expandImportZone, switchTab, switchSuperTab, openFilterDrawer, closeFilterDrawer, renderAll, onFilterChange, debouncedRender, resetFilters, filterByAge, clearAgeFilter, filterByAbcFmr, showCockpitInTable, clearCockpitFilter, _toggleNouveautesFilter, updatePeriodAlert, sortBy, changePage, downloadCSV, wrapGlossaryTerms, renderHealthScore, renderTabBadges, focusTrap, toggleNavKpis, initDetailsAnimations } from './ui.js';
import { prepareSources } from './sources.js';
import { _clearCache, _showCacheBanner, _onPurgeCache, _saveSessionToIDB } from './cache.js';
import './sales.js';
import './helpers.js';
import { buildClientStore } from './client-store.js';
import { applyForcageCommercial as _applyForcageCommercial } from './chalandise-store.js';
import { buildAgenceStore } from './agence-store.js';
import { DataStore } from './store.js';
window._S = _S; // debug + accès console DevTools
import { openDiagnostic, openDiagnosticMetier, closeDiagnostic, executeDiagAction, closeArticlePanel, openArticlePanel, exportDiagnosticCSV, toggleReconquestFilter, openClient360, _c360SwitchTab, _c360CopyResume, _c360ExportRadio } from './diagnostic.js';
import './planRayon.js';
import './arbitrage.js';
import './minmax.js';
import './clients-decisions.js';
import './animation.js';
import './partie.js';
// ── P3 Modules — extracted from main.js ──
// bench.js démantelé — fonctions réseau supprimées
import { renderTerritoireTab, _toggleOverviewClassif, _toggleOverviewDirection, _onActPDVSelect, _onStatutDetailleSelect, _onStatutSelect, _onUniversSelect, _toggleDept, _resetChalandiseFilters, _toggleDeptDropdown, _toggleClassifDropdown, _toggleDirectionDropdown, _toggleStrategiqueFilter, _onCommercialFilter, _updateDistQuickBtns, _onTerrClientSearch, _onMetierFilter, _navigateToOverviewMetier, _togglePerdu24m, _buildChalandiseOverview, _toggleOverviewL2, _toggleOverviewL3, _toggleOverviewL4 } from './commerce.js';
// ── Modules extraits de main.js (oct. 2026) ──
import './article-360.js'; // fiche article 360
import './recherche.js'; // recherche unique (barre du haut)
import './scan-export.js'; // exports Scan / ZZAT018 / EAN — fonctions window.* uniquement
import { _refilterFromByMonth, applyPeriodFilter, toggleTabPeriodDropdown } from './periode.js';
import { processData } from './pipeline.js';
import './rapport.js'; // Reporting (window.openReporting / closeReporting)
import { _renderDataScopeBar, openDiagnosticCell, renderABCTab, renderComparison, renderCurrentTab, renderDashboardAndCockpit, renderTable } from './render-stock.js';

// Cache-buster homogène : si `js/main.js` est servi avec `?v=...`, appliquer la même
// version aux Web Workers pour éviter les mismatchs (browser cache très agressif).
const _ASSET_VER = (() => {
  try { return new URL(import.meta.url).searchParams.get('v') || ''; } catch (_) { return ''; }
})();
export const _ASSET_VER_Q = _ASSET_VER ? ('?v=' + encodeURIComponent(_ASSET_VER)) : '';

// ── Mobile / Low-memory mode (iPhone Safari, petites RAM) ──────────────────
export function _detectLowMemMode() {
  try {
    const ua = navigator.userAgent || '';
    const isIOS = /iP(hone|ad|od)/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    if (isIOS) return true; // tous les navigateurs iOS = WebKit (limites mémoire similaires)
  } catch (_) {}
  return false;
}
if (!_S.lowMemMode) _S.lowMemMode = _detectLowMemMode();
if (_S.lowMemMode) console.warn('[PRISME] Mode memoire faible actif (mobile) — pipeline allege');


// ── Exposition des fonctions globales pour les onclick="" du HTML ──────────
// Phase 1 : les handlers inline dans le HTML appellent ces fonctions via window.
// Phase 2 (Vite) : nettoyer progressivement au profit d'event listeners.
window.switchTab = switchTab;
window.switchSuperTab = switchSuperTab;
window.processData = processData;
window.showToast = showToast;

window.renderAll = renderAll;
window.onFilterChange = onFilterChange;
window.debouncedRender = debouncedRender;
window.resetFilters = resetFilters;
window.filterByAge = filterByAge;
window.clearAgeFilter = clearAgeFilter;
window.filterByAbcFmr = filterByAbcFmr;
window.showCockpitInTable = showCockpitInTable;
window.clearCockpitFilter = clearCockpitFilter;
window._toggleNouveautesFilter = _toggleNouveautesFilter;
window.sortBy = sortBy;
window.changePage = changePage;
window.openFilterDrawer = openFilterDrawer;
window.closeFilterDrawer = closeFilterDrawer;
window.expandImportZone = expandImportZone;
window.onForcageSelected = async function(input) {
  onFileSelected(input, 'dropForcage');
  if (!input.files?.[0]) return;
  try {
    const file = input.files[0];
    const result = await readExcel(file);
    if (!result || !result.rows?.length) { showToast('❌ Fichier vide ou invalide', 'error'); return; }
    const headers = result.headers.map(h => (h || '').toString().toLowerCase().trim());
    const rows = result.rows;
    // Cherche colonnes : code client + commercial
    let iClient = headers.findIndex(h => h.includes('client') && (h.includes('code') || h.includes('n°') || h.includes('num')));
    if (iClient < 0) iClient = headers.findIndex(h => h.includes('client'));
    if (iClient < 0) iClient = 0;
    let iCom = headers.findIndex(h => h.includes('commercial') || h.includes('vendeur') || h.includes('rattach'));
    if (iCom < 0) iCom = headers.length > 1 ? 1 : -1;
    if (iCom < 0) { showToast('❌ Colonne Commercial introuvable', 'error'); return; }
    // Index des commerciaux existants pour matching flexible
    const _comKeys = _S.clientsByCommercial ? [..._S.clientsByCommercial.keys()] : [];
    function _matchCommercial(raw) {
      if (!raw) return '';
      // Match exact d'abord
      if (_comKeys.includes(raw)) return raw;
      // Match insensible à la casse
      const rawLow = raw.toLowerCase();
      const exact = _comKeys.find(k => k.toLowerCase() === rawLow);
      if (exact) return exact;
      // Match partiel : "laborialle" ou "laborialle fabien" → "1549 - LABORIALLE Fabien"
      // Exige au moins le nom de famille (≥3 lettres), le prénom seul ne suffit pas
      const words = rawLow.split(/[\s,]+/).filter(w => w.length >= 3);
      if (words.length) {
        const match = _comKeys.find(k => {
          const afterDash = k.includes(' - ') ? k.slice(k.indexOf(' - ') + 3).toLowerCase() : k.toLowerCase();
          return words.every(w => afterDash.includes(w));
        });
        if (match) return match;
      }
      return raw; // pas trouvé → garder tel quel
    }
    _S.forcageCommercial.clear();
    let matched = 0, unmatched = 0;
    for (const row of rows) {
      const cc = extractClientCode(row[iClient] || '');
      const comRaw = (row[iCom] || '').toString().trim();
      if (!cc || cc === '000000' || !comRaw) continue;
      const com = _matchCommercial(comRaw);
      _S.forcageCommercial.set(cc, com);
      if (_comKeys.includes(com)) matched++; else unmatched++;
    }
    // Appliquer le forçage sur chalandiseData + clientsByCommercial
    _applyForcageCommercial();
    if (_S.chalandiseReady) computeClientCrossing();
    // Rebuild clientStore si données disponibles
    if (_S.clientStore?.size) { buildClientStore(); _applyForcageCommercial(); }
    _saveSessionToIDB();
    const st = document.getElementById('statusForcage'); if (st) st.textContent = '✅';
    const _unmMsg = unmatched > 0 ? ` · ⚠️ ${unmatched} commercial${unmatched>1?'s':''} non reconnu${unmatched>1?'s':''}` : '';
    showToast(`🔗 Rattachement : ${_S.forcageCommercial.size} clients · ${matched} reconnus${_unmMsg}`, 'success', 5000);
    // Rafraîchir l'UI si on est sur l'onglet commerce/clients
    _buildChalandiseOverview();
  } catch (e) { showToast('❌ Erreur lecture fichier : ' + e.message, 'error'); }
};
window.onChalandiseSelected = async function(input) {
  onFileSelected(input, 'dropChalandise');
  if (!input.files || !input.files[0]) return;
  // Parser immédiatement seulement si les données sont déjà chargées (recalcul à chaud).
  // Sinon, _postParseMain appellera parseChalandise après Analyser — évite le double parse.
  if (DataStore.finalData.length === 0) return;
  if (_S._chalandiseLoading || _S.chalandiseReady) return;
  _S._chalandiseLoading = true;
  try { await prepareSources('chalandise'); await parseChalandise(input.files); } finally { _S._chalandiseLoading = false; }
  // parseChalandise() reconstruit _S.chalandiseData → ré-appliquer le forçage ensuite
  _applyForcageCommercial();
  computeClientCrossing();
  buildClientStore();
  renderAll();
  // Recalculer les agrégats clients en tâche de fond
  if (_S._activeClientWorker) { try { _S._activeClientWorker.terminate(); } catch (_) {} _S._activeClientWorker = null; }
  if (DataStore.ventesLocalMagPeriode.size > 0) {
    launchClientWorker().then(() => {
      resetBenchMetierCache(); computeOpportuniteNette(); computeAnglesMorts(); computeOmniScores();
      buildClientStore(); _applyForcageCommercial();
      renderTabBadges(); 
      
      if (_S.selectedMyStore) _saveSessionToIDB();
    }).catch(err => console.warn('Client worker error:', err));
  }
  if (_S.storesIntersection.size > 1) { computeBenchmark(); }
  _saveSessionToIDB();
};
window.renderTerritoireTab = renderTerritoireTab;
window.computeReconquestCohort = computeReconquestCohort;
window.computeOpportuniteNette = computeOpportuniteNette;
window.computeAnglesMorts = computeAnglesMorts;
window.computeOmniScores = computeOmniScores;
window.buildClientStore = buildClientStore;
window.buildAgenceStore = buildAgenceStore;
window.computeBenchmark = computeBenchmark;
// (moved to ACTION_REGISTRY: _topPDVExpand, _topPDVCollapse, _topPDVPage)
window._toggleHorsAgence = function() {
  _S._filterHorsAgence = !_S._filterHorsAgence;
  const btn = document.getElementById('btnHorsAgence');
  if (btn) {
    btn.classList.toggle('bg-violet-500', _S._filterHorsAgence);
    btn.classList.toggle('text-white',    _S._filterHorsAgence);
    btn.classList.toggle('t-secondary',  !_S._filterHorsAgence);
  }
  onFilterChange();
};
window._setGlobalMagasinMode = function(mode){_S._reseauMagasinMode=mode;invalidateCache('all');[['globalMagModeAll','all'],['globalMagModePrel','preleve'],['globalMagModeEnl','enleve']].forEach(([id,m])=>{const el=document.getElementById(id);if(el)el.classList.toggle('active',(mode||'all')===m);});window._refilterFromByMonth?.();if(typeof window.renderCurrentTab==='function')window.renderCurrentTab();};


window.renderTable = renderTable;
window.renderDashboardAndCockpit = renderDashboardAndCockpit;
window._renderDataScopeBar = _renderDataScopeBar;
window._toggleDataScope = function(){
  const el=document.getElementById('dataScopeGlobal');
  if(!el)return;
  const visible=el.style.display!=='none';
  el.style.display=visible?'none':'';
};
window.renderABCTab = renderABCTab;
window.renderCurrentTab = renderCurrentTab;
window._refilterFromByMonth = _refilterFromByMonth;
window.openDiagnostic = openDiagnostic;
window.openDiagnosticCell = openDiagnosticCell;
window.openDiagnosticMetier = openDiagnosticMetier;
window.closeDiagnostic = closeDiagnostic;
window.executeDiagAction = executeDiagAction;
window.exportDiagnosticCSV = exportDiagnosticCSV;
window.toggleReconquestFilter = toggleReconquestFilter;
window.openArticlePanel = openArticlePanel;
window.closeArticlePanel = closeArticlePanel;
window.focusTrap = focusTrap;
window.ToastManager = ToastManager;
window.toggleNavKpis = toggleNavKpis;
window.initDetailsAnimations = initDetailsAnimations;
window._doCopyCode = _doCopyCode;
window._copyAllCodesDirect = _copyAllCodesDirect;
window.updatePeriodAlert = updatePeriodAlert;
window.toggleTabPeriodDropdown = toggleTabPeriodDropdown;
window._onPurgeCache = _onPurgeCache;
window._clearCache = _clearCache;
window._cancelLoad = function() {
  _S._activeClientWorker?.terminate();
  _S._activeClientWorker = null;
  const dbs = ['PRISME', 'prismeDB'];
  Promise.all(dbs.map(name => new Promise(res => {
    const r = indexedDB.deleteDatabase(name);
    r.onsuccess = r.onerror = res;
  }))).then(() => location.reload());
};
window._showCacheBanner = _showCacheBanner;
window._toggleDeptDropdown = _toggleDeptDropdown;
window._toggleClassifDropdown = _toggleClassifDropdown;
window._toggleDirectionDropdown = _toggleDirectionDropdown;
window._onActPDVSelect = _onActPDVSelect;
window._onStatutDetailleSelect = _onStatutDetailleSelect;
window._onStatutSelect = _onStatutSelect;
window._onUniversSelect = _onUniversSelect;
window._toggleStrategiqueFilter = _toggleStrategiqueFilter;
window._onCommercialFilter = _onCommercialFilter;
window._updateDistQuickBtns = _updateDistQuickBtns;
window._onTerrClientSearch = _onTerrClientSearch;
window._onMetierFilter = _onMetierFilter;
window._navigateToOverviewMetier = _navigateToOverviewMetier;
window._togglePerdu24m = _togglePerdu24m;
window._resetChalandiseFilters = _resetChalandiseFilters;
window.onFileSelected = onFileSelected;
window._updateAnalyserBtn = _updateAnalyserBtn;
window._saveSessionToIDB = _saveSessionToIDB;
window.openClient360 = openClient360;
window._c360SwitchTab = _c360SwitchTab;
window._c360CopyResume = _c360CopyResume;
window._c360ExportRadio = _c360ExportRadio;
window.renderComparison = renderComparison;
window.renderHealthScore = renderHealthScore;
window.renderTabBadges = renderTabBadges;
window.applyPeriodFilter = applyPeriodFilter;

export function renderSidebarAgenceSelector() {
  // Navbar: static agence code display (no dropdown)
  const navSt = document.getElementById('navStore');
  if (navSt) { navSt.textContent = _S.selectedMyStore || ''; navSt.classList.toggle('hidden', !_S.selectedMyStore); }
}
window.updateNavStore = renderSidebarAgenceSelector;
window.renderSidebarAgenceSelector = renderSidebarAgenceSelector;
// ui.js — fonctions HTML onclick non encore exposées
window.collapseImportZone = collapseImportZone;
window.downloadCSV = downloadCSV;
window.wrapGlossaryTerms = wrapGlossaryTerms;
// Cockpit Client territoire — toggle sections & exports (appelés via onclick dans le HTML généré)
// Territoire / Vue Terrain — toggles direction/métier/secteur/famille (onclick HTML généré)
window._toggleOverviewL2        = _toggleOverviewL2;
window._toggleOverviewL3        = _toggleOverviewL3;
window._toggleOverviewL4        = _toggleOverviewL4;
window._toggleOverviewClassif   = _toggleOverviewClassif;
window._toggleOverviewDirection = _toggleOverviewDirection;
window._toggleDept              = _toggleDept;
// Cockpit Client — exclusions & liste masquée

// Wrap glossary terms on static headers at load time (before any file is loaded)
wrapGlossaryTerms(document);

// ── P0 — Event delegation pour les liens Unik (data-unik-client) ──────────
// Remplace les onclick inline générés par _unikLink() qui cassaient
// après les innerHTML batch (event handlers non persistés).
function initBenchListeners() {
  document.addEventListener('click', function(e) {
    const a = e.target.closest('[data-unik-client]');
    if (!a) return;
    e.stopPropagation();
    // Le lien est déjà un <a href> — laisser le comportement natif se produire
  }, true);
}
initBenchListeners();

// ── ACTION_REGISTRY — delegated click handler ─────────────────────────
// Remplace les onclick="window.xxx()" inline par data-action="xxx".
// Les handlers reçoivent (el, event) et lisent data-* pour les arguments.
const ACTION_REGISTRY = {
  // Pagination — Hors zone
  // Pagination — Opportunités nettes
  // Pagination — Angles Morts
};

document.addEventListener('click', (e)=>{
  const el=e.target.closest('[data-action]');
  if(!el)return;
  const handler=ACTION_REGISTRY[el.dataset.action];
  if(handler){e.preventDefault();handler(el,e);}
});
