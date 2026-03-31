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

import { PAGE_SIZE, CHUNK_SIZE, TERR_CHUNK_SIZE, DORMANT_DAYS, NOUVEAUTE_DAYS, SECURITY_DAYS, HIGH_PRICE, METIERS_STRATEGIQUES, AGE_BRACKETS, FAM_LETTER_UNIVERS, RADAR_LABELS, SECTEUR_DIR_MAP, ONLINE_FAM_MIN_CA_HORS, ONLINE_FAM_MIN_CA_TOTAL, ONLINE_FAM_MIN_CLIENTS } from './constants.js';
import { cleanCode, extractClientCode, cleanPrice, cleanOmniPrice, formatEuro, pct, parseExcelDate, daysBetween, getVal, getQuantityColumn, getCaColumn, getVmbColumn, extractStoreCode, readExcel, yieldToMain, parseCSVText, getAgeBracket, getAgeLabel, _median, _isMetierStrategique, _normalizeClassif, _classifShort, _doCopyCode, _copyCodeBtn, _copyAllCodesDirect, _normalizeStatut, fmtDate, getSecteurDirection, _resetColCache, escapeHtml, formatLocalYMD, extractFamCode, famLib, famLabel, matchQuery } from './utils.js';
import { _S, resetAppState, assertPostParseInvariants, invalidateCache } from './state.js';
import { enrichPrixUnitaire, estimerCAPerdu, calcPriorityScore, prioClass, prioLabel, isParentRef, computeABCFMR, calcCouverture, formatCouv, couvColor, computeClientCrossing, _clientUrgencyScore, _clientStatusBadge, _clientStatusText, _unikLink, _crossBadge, _passesClientCrossFilter, clientMatchesDeptFilter, clientMatchesClassifFilter, clientMatchesStatutFilter, clientMatchesActivitePDVFilter, clientMatchesStatutDetailleFilter, clientMatchesDirectionFilter, clientMatchesCommercialFilter, clientMatchesMetierFilter, clientMatchesUniversFilter, _clientPassesFilters, _diagClientPrio, _diagClassifPrio, _diagClassifBadge, _isGlobalActif, _isPDVActif, _isPerdu, _isProspect, _isPerdu24plus, _radarComputeMatrix, generateDecisionQueue, computeReconquestCohort, computeSPC, computeOpportuniteNette, computeReseauHeatmap, computeOmniScores, computeFamillesHors } from './engine.js';
import { parseChalandise, onChalandiseSelected, parseLivraisons, onLivraisonsSelected, buildSecteurCheckboxes, toggleSecteurDropdown, toggleAllSecteurs, onSecteurChange, getSelectedSecteurs, computeBenchmark, _clientWorker, launchClientWorker, _reseauWorker, launchReseauWorker, loadCpCoords, _computeChalandiseDistances } from './parser.js';
import { showToast, updateProgress, updatePipeline, showLoading, hideLoading, onFileSelected, _updateAnalyserBtn, collapseImportZone, expandImportZone, switchTab, openFilterDrawer, closeFilterDrawer, populateSelect, getFilteredData, renderAll, onFilterChange, debouncedRender, resetFilters, filterByAge, clearAgeFilter, updateActiveAgeIndicator, filterByAbcFmr, showCockpitInTable, clearCockpitFilter, _toggleNouveautesFilter, updatePeriodAlert, renderInsightsBanner, openReporting, sortBy, changePage, openCmdPalette, _cmdExec, _cmdMoveSelection, _cmdRender, _cmdBuildResults, closeReporting, copyReportText, clearSavedKPI, exportKPIhistory, importKPIhistory, downloadCSV, clipERP, wrapGlossaryTerms, initTheme, cycleTheme, exportCockpitResume, renderHealthScore, renderIRABanner, exportAgenceSnapshot, renderTabBadges, _cematinSearch, showSilencieux60, _loadIRAHistory, _renderNoStockPlaceholder } from './ui.js';
import { _saveToCache, _restoreFromCache, _clearCache, _showCacheBanner, _onReloadFiles, _onPurgeCache, _saveExclusions, _restoreExclusions, _saveSessionToIDB, _restoreSessionFromIDB, _clearIDB, _migrateIDB } from './cache.js';
import { buildPagerHtml, deltaColor, csvCell, renderOppNetteTable } from './helpers.js';
import { initRouter } from './router.js';
import { DataStore } from './store.js';
window._S = _S; // debug + accès depuis nl.js et console DevTools
import { _onPromoInput, _closePromoSuggest, _selectPromoSuggestion, _promoSuggestKeydown, runPromoSearch, _onPromoFamilleChange, _applyPromoFilters, _resetPromoFilters, _togglePromoSection, exportTourneeCSV, exportPromoCSV, copyPromoClipboard, _onPromoImportFileChange, _clearPromoImport, runPromoImport, _togglePromoImportSection, exportPromoImportCSV, resetPromo, _togglePromoClientRow, _switchPromoTab, _exportCommercialCSV, _renderSearchResults, renderAnimationTab, _animAnalyze, _animClear, _animInputChange, _animSetCanal, _animApplyFilters, _animResetFilters, _animExportA, _animExportC } from './promo.js';
import { openDiagnostic, openDiagnosticMetier, closeDiagnostic, executeDiagAction, closeArticlePanel, openArticlePanel, renderDiagnosticPanel, _renderDiagnosticCellPanel, exportDiagnosticCSV, _diagV3FilterCategory, toggleReconquestFilter, openClient360, _c360SwitchTab, _c360CopyResume } from './diagnostic.js';
import { renderLaboTab, updateLaboTiles } from './labo.js';

  function _toggleOverviewClassif(c,event){if(event)event.preventDefault();const all=new Set();for(const i of _S.chalandiseData.values())all.add(_normalizeClassif(i.classification));if(!_S._selectedClassifs.size){_S._selectedClassifs=new Set(all);_S._selectedClassifs.delete(c);}else if(_S._selectedClassifs.has(c)){_S._selectedClassifs.delete(c);if(!_S._selectedClassifs.size)_S._selectedClassifs=new Set();}else{_S._selectedClassifs.add(c);if(_S._selectedClassifs.size>=all.size)_S._selectedClassifs=new Set();}_buildChalandiseOverview();}
  function _toggleOverviewActPDV(a,event){if(event)event.preventDefault();const all=new Set();for(const i of _S.chalandiseData.values())if(i.activitePDV)all.add(i.activitePDV);if(!_S._selectedActivitesPDV.size){_S._selectedActivitesPDV=new Set(all);_S._selectedActivitesPDV.delete(a);}else if(_S._selectedActivitesPDV.has(a)){_S._selectedActivitesPDV.delete(a);if(!_S._selectedActivitesPDV.size)_S._selectedActivitesPDV=new Set();}else{_S._selectedActivitesPDV.add(a);if(_S._selectedActivitesPDV.size>=all.size)_S._selectedActivitesPDV=new Set();}_buildChalandiseOverview();}
  function _toggleOverviewStatut(s,event){if(event)event.preventDefault();const all=new Set();for(const i of _S.chalandiseData.values())if(i.statut)all.add(_normalizeStatut(i.statut));if(!_S._selectedStatuts.size){_S._selectedStatuts=new Set(all);_S._selectedStatuts.delete(s);}else if(_S._selectedStatuts.has(s)){_S._selectedStatuts.delete(s);if(!_S._selectedStatuts.size)_S._selectedStatuts=new Set();}else{_S._selectedStatuts.add(s);if(_S._selectedStatuts.size>=all.size)_S._selectedStatuts=new Set();}_buildChalandiseOverview();}
  function _toggleOverviewDirection(d,event){if(event)event.preventDefault();const all=new Set();for(const i of _S.chalandiseData.values())if(i.direction)all.add(i.direction);if(!_S._selectedDirections.size){_S._selectedDirections=new Set(all);_S._selectedDirections.delete(d);}else if(_S._selectedDirections.has(d)){_S._selectedDirections.delete(d);if(!_S._selectedDirections.size)_S._selectedDirections=new Set();}else{_S._selectedDirections.add(d);if(_S._selectedDirections.size>=all.size)_S._selectedDirections=new Set();}_buildChalandiseOverview();}
  function _onActPDVSelect(v){_S._selectedActivitesPDV=v?new Set([v]):new Set();_buildChalandiseOverview();}
  function _onStatutDetailleSelect(v){_S._selectedStatutDetaille=v||'';_buildChalandiseOverview();}
  function _onStatutSelect(v){_S._selectedStatuts=v?new Set([v]):new Set();_buildChalandiseOverview();}
  function _onUniversSelect(v){_S._selectedUnivers=v?new Set([v]):new Set();_buildChalandiseOverview();}
  function _toggleOverviewUnivers(u,event){if(event)event.preventDefault();const all=new Set(_S._clientDominantUnivers.values());if(!_S._selectedUnivers.size){_S._selectedUnivers=new Set(all);_S._selectedUnivers.delete(u);}else if(_S._selectedUnivers.has(u)){_S._selectedUnivers.delete(u);if(!_S._selectedUnivers.size)_S._selectedUnivers=new Set();}else{_S._selectedUnivers.add(u);if(_S._selectedUnivers.size>=all.size)_S._selectedUnivers=new Set();}_buildChalandiseOverview();}
  function _activitePDVColor(v){const l=(v||'').toLowerCase();if(!l.includes('inactif'))return'bg-emerald-600 text-white border-green-600';if(l.includes('2025'))return'bg-red-600 text-white border-red-600';return'bg-orange-500 text-white border-orange-500';}
  function _getAllDepts(){const m={};for(const info of _S.chalandiseData.values()){const d=(info.cp||'').toString().slice(0,2);if(d&&d.trim())m[d]=(m[d]||0)+1;}return m;}
  function _buildDeptFilter(){
    const container=document.getElementById('terrDeptCheckboxes');
    const labelEl=document.getElementById('terrDeptLabel');
    if(!container)return;
    if(!_S.chalandiseReady){return;}
    const deptMap=_getAllDepts();
    const depts=Object.entries(deptMap).sort((a,b)=>a[0].localeCompare(b[0]));
    if(!depts.length){container.innerHTML='<span class="text-xs c-danger">— aucun CP —</span>';if(labelEl)labelEl.textContent='🗺️ Dépt: —';return;}
    const allSel=!_S._selectedDepts.size;
    container.innerHTML=depts.map(([dept,cnt])=>{
      const sel=allSel||_S._selectedDepts.has(dept);
      return`<label class="flex items-center gap-1.5 text-[10px] py-0.5 px-1 rounded cursor-pointer hover:i-danger-bg"><input type="checkbox" ${sel?'checked':''} onchange="_toggleDept('${dept}')" class="rounded accent-rose-600"><span class="font-semibold">${dept}</span><span class="t-disabled">(${cnt})</span></label>`;
    }).join('');
    if(labelEl){const selCount=allSel?depts.length:_S._selectedDepts.size;labelEl.textContent=`🗺️ Dépt: ${selCount}/${depts.length}`;}
  }
  function _toggleDept(dept,event){
    if(event)event.preventDefault();
    const allDepts=new Set(Object.keys(_getAllDepts()));
    // If currently no explicit selection → all are shown. Click means DESELECT this one.
    if(!_S._selectedDepts.size){
      // Select all EXCEPT clicked
      _S._selectedDepts=new Set(allDepts);
      _S._selectedDepts.delete(dept);
    }else if(_S._selectedDepts.has(dept)){
      // Currently selected → deselect
      _S._selectedDepts.delete(dept);
      // If none left selected, reset to "all" (empty)
      if(!_S._selectedDepts.size)_S._selectedDepts=new Set();
    }else{
      // Currently deselected → select
      _S._selectedDepts.add(dept);
      // If all are now selected, reset to "all" (empty)
      if(_S._selectedDepts.size>=allDepts.size)_S._selectedDepts=new Set();
    }
    _buildDeptFilter();_buildChalandiseOverview();
  }
  function _resetChalandiseFilters(){_S._selectedDepts=new Set();_S._selectedClassifs=new Set();_S._selectedStatuts=new Set();_S._selectedActivitesPDV=new Set();_S._selectedStatutDetaille='';_S._selectedDirections=new Set();_S._selectedUnivers=new Set();_S._selectedCommercial='';_S._selectedMetier='';_S._filterStrategiqueOnly=false;_S._includePerdu24m=false;_S._distanceMaxKm=0;const btn=document.getElementById('btnStrategiqueOnly');if(btn){btn.classList.remove('bg-amber-500','text-white');btn.classList.add('s-hover','t-secondary');}const cb=document.querySelector('#togglePerdu24m input');if(cb)cb.checked=false;const comSel=document.getElementById('terrCommercialFilter');if(comSel)comSel.value='';const metSel=document.getElementById('terrMetierFilter');if(metSel)metSel.value='';const aSel=document.getElementById('terrActPDVSelect');if(aSel)aSel.value='';const sdSel=document.getElementById('terrStatutDetailleSelect');if(sdSel)sdSel.value='';const stSel=document.getElementById('terrStatutSelect');if(stSel)stSel.value='';const uSel=document.getElementById('terrUniversSelect');if(uSel)uSel.value='';const dSlider=document.getElementById('distKmSlider');if(dSlider){dSlider.value=0;}const dLabel=document.getElementById('distKmLabel');if(dLabel)dLabel.textContent='∞';_buildDeptFilter();_buildChalandiseOverview();}
  // ── Territory overview: Direction → Métier → Secteur → Clients ──
  const _closeAllDropPanels=(...except)=>{['terrDeptPanel','terrClassifPanel','terrActPDVPanel','terrStatutPanel','terrDirectionPanel'].forEach(id=>{if(!except.includes(id))document.getElementById(id)?.classList.add('hidden');});};
  function _toggleDeptDropdown(){const p=document.getElementById('terrDeptPanel');if(!p)return;const closing=!p.classList.contains('hidden');_closeAllDropPanels('terrDeptPanel');p.classList.toggle('hidden',closing);}
  function _toggleClassifDropdown(){const p=document.getElementById('terrClassifPanel');if(!p)return;const closing=!p.classList.contains('hidden');_closeAllDropPanels('terrClassifPanel');p.classList.toggle('hidden',closing);}
  function _toggleActPDVDropdown(){const p=document.getElementById('terrActPDVPanel');if(!p)return;const closing=!p.classList.contains('hidden');_closeAllDropPanels('terrActPDVPanel');p.classList.toggle('hidden',closing);}
  function _toggleStatutDropdown(){const p=document.getElementById('terrStatutPanel');if(!p)return;const closing=!p.classList.contains('hidden');_closeAllDropPanels('terrStatutPanel');p.classList.toggle('hidden',closing);}
  function _toggleDirectionDropdown(){const p=document.getElementById('terrDirectionPanel');if(!p)return;const closing=!p.classList.contains('hidden');_closeAllDropPanels('terrDirectionPanel');p.classList.toggle('hidden',closing);}
  function _toggleStrategiqueFilter(){_S._filterStrategiqueOnly=!_S._filterStrategiqueOnly;const btn=document.getElementById('btnStrategiqueOnly');if(btn){btn.classList.toggle('bg-amber-500',_S._filterStrategiqueOnly);btn.classList.toggle('text-white',_S._filterStrategiqueOnly);btn.classList.toggle('s-hover',!_S._filterStrategiqueOnly);btn.classList.toggle('t-secondary',!_S._filterStrategiqueOnly);}if(_S._filterStrategiqueOnly&&_S._selectedMetier&&!_isMetierStrategique(_S._selectedMetier)){_S._selectedMetier='';const mi=document.getElementById('terrMetierFilter');if(mi)mi.value='';}_buildChalandiseOverview();}
  function _onCommercialFilter(val){const commercials=new Set();for(const info of _S.chalandiseData.values()){if(info.commercial)commercials.add(info.commercial);}_S._selectedCommercial=(!val||commercials.has(val))?val:'';if(_S._selectedCommercial===val)_buildChalandiseOverview();}
  function _onDistanceSlider(val){const v=parseInt(val)||0;_S._distanceMaxKm=v;const lbl=document.getElementById('distKmLabel');if(lbl)lbl.textContent=v>0?v+'km':'∞';_buildChalandiseOverview();}
  let _terrClientSearchTimer=null;
  function _onTerrClientSearch(){
    clearTimeout(_terrClientSearchTimer);
    _terrClientSearchTimer=setTimeout(()=>renderTerritoireTab(),300);
  }
  function _onMetierFilter(val){const metiers=new Set();for(const info of _S.chalandiseData.values()){if(info.metier)metiers.add(info.metier);}_S._selectedMetier=(!val||metiers.has(val))?val:'';if(_S._selectedMetier===val)_buildChalandiseOverview();}
  function _navigateToOverviewMetier(metier){
    closeDiagnostic();
    _S._selectedMetier=metier;
    _S._includePerdu24m=false;
    const cb=document.querySelector('#togglePerdu24m input');
    if(cb)cb.checked=false;
    // Reset les deux scroll containers avant switchTab
    window.scrollTo(0,0);
    const _mcNav=document.getElementById('mainContent');
    if(_mcNav){_mcNav.style.overflow='';_mcNav.scrollTop=0;}
    switchTab('territoire');
    // Poll position cumulative stable puis scroll + filtre métier
    let _ltNav=-1,_trNav=0;
    const _pvNav=setInterval(()=>{
      const mc=document.getElementById('mainContent');
      const cockpit=document.getElementById('terrCockpitClient');
      if(!mc||!cockpit){if(++_trNav>40)clearInterval(_pvNav);return;}
      // Force-set input métier à chaque poll jusqu'à stabilisation
      const metInput=document.getElementById('terrMetierFilter');
      if(metInput&&metInput.value!==metier){metInput.value=metier;metInput.classList.add('border-rose-400','ring-1','ring-rose-300');_onMetierFilter(metier);}
      // Position cumulative réelle relative au scroll container
      let e=cockpit,t=0;while(e&&e!==mc){t+=e.offsetTop;e=e.offsetParent;}
      if((t===_ltNav&&t>0)||_trNav++>40){
        clearInterval(_pvNav);
        window.scrollTo(0,0);
        mc.scrollTo({top:t-16,behavior:'smooth'});
      }else _ltNav=t;
    },100);
  }
  function _togglePerdu24m(checked){_S._includePerdu24m=checked;_buildChalandiseOverview();}
  function _buildOverviewFilterChips(){
    const CLASSIF_ORDER=['FID Pot+','OCC Pot+','FID Pot-','OCC Pot-','NC'];
    const CLASSIF_ON={'FID Pot+':'bg-emerald-600 text-white border-emerald-600','FID Pot-':'bg-gray-500 text-white border-gray-500','OCC Pot+':'bg-blue-600 text-white border-blue-600','OCC Pot-':'bg-blue-400 text-white border-blue-400','NC':'bg-slate-400 text-white border-slate-400'};
    const availClassifs=new Set(),availActPDV=new Set(),availStatutDetaille=new Set(),availDirections=new Set();
    const availStatutsNorm=new Set();
    for(const info of _S.chalandiseData.values()){
      availClassifs.add(_normalizeClassif(info.classification));
      if(info.activitePDV)availActPDV.add(info.activitePDV);
      if(info.statutDetaille)availStatutDetaille.add(info.statutDetaille);
      if(info.statut)availStatutsNorm.add(_normalizeStatut(info.statut));
      if(info.direction)availDirections.add(info.direction);
    }
    // Classif dropdown (unchanged)
    const allC=!_S._selectedClassifs.size;
    const cEl=document.getElementById('terrOverviewClassifChips');
    const availClassifList=CLASSIF_ORDER.filter(c=>availClassifs.has(c));
    if(cEl)cEl.innerHTML=availClassifList.map(c=>{const sel=allC||_S._selectedClassifs.has(c);return`<label class="flex items-center gap-1.5 text-[10px] py-0.5 px-1 rounded cursor-pointer hover:s-card-alt"><input type="checkbox" ${sel?'checked':''} onchange="_toggleOverviewClassif('${c.replace(/'/g,"\\'")}',event)" class="rounded"><span class="font-semibold">${c}</span></label>`;}).join('');
    const classifLabelEl=document.getElementById('terrClassifLabel');
    if(classifLabelEl){if(allC)classifLabelEl.textContent='Classif: toutes';else{const sel=[..._S._selectedClassifs];classifLabelEl.textContent=sel.length<=2?'Classif: '+sel.join(', '):'Classif: '+sel.length+'/'+availClassifList.length;}}
    // Group 1 — Activité PDV Zone <select>
    const sortedActPDV=[...availActPDV].sort((a,b)=>{const la=a.toLowerCase(),lb=b.toLowerCase();if(!la.includes('inactif')&&lb.includes('inactif'))return -1;if(la.includes('inactif')&&!lb.includes('inactif'))return 1;return a.localeCompare(b,'fr');});
    const curActPDV=[..._S._selectedActivitesPDV][0]||'';
    const aSel=document.getElementById('terrActPDVSelect');
    if(aSel){aSel.innerHTML=`<option value="">Activité PDV Zone: toutes</option>`+sortedActPDV.map(v=>`<option value="${escapeHtml(v)}"${v===curActPDV?' selected':''}>${escapeHtml(v)}</option>`).join('');aSel.value=curActPDV;}
    // Group 2 — Activité Client <select> (statutDetaille)
    const sortedSD=[...availStatutDetaille].sort((a,b)=>{const la=a.toLowerCase(),lb=b.toLowerCase();const order=v=>v.includes('actif ce')?0:v.includes('actif')?1:v.includes('prospect')?2:v.includes('inactif')?3:v.includes('perdu')?4:5;return order(la)-order(lb)||a.localeCompare(b,'fr');});
    const sdSel=document.getElementById('terrStatutDetailleSelect');
    if(sdSel){sdSel.innerHTML=`<option value="">Activité Client: toutes</option>`+sortedSD.map(v=>`<option value="${escapeHtml(v)}"${v===_S._selectedStatutDetaille?' selected':''}>${escapeHtml(v)}</option>`).join('');sdSel.value=_S._selectedStatutDetaille||'';}
    // Group 3 — Statut actuel <select>
    const STATUT_ORDER=['Actif','Prospect','Inactif','Perdu'];
    const sortedStatuts=[...STATUT_ORDER.filter(s=>availStatutsNorm.has(s)),...[...availStatutsNorm].filter(s=>!STATUT_ORDER.includes(s)).sort()];
    const curStatut=[..._S._selectedStatuts][0]||'';
    const stSel=document.getElementById('terrStatutSelect');
    if(stSel){stSel.innerHTML=`<option value="">Statut actuel: tous</option>`+sortedStatuts.map(v=>`<option value="${escapeHtml(v)}"${v===curStatut?' selected':''}>${escapeHtml(v)}</option>`).join('');stSel.value=curStatut;}
    // Direction dropdown (unchanged — custom checkbox panel)
    const sortedDirections=[...availDirections].sort((a,b)=>a.localeCompare(b,'fr'));
    const allDir=!_S._selectedDirections.size;
    const dirEl=document.getElementById('terrDirectionChips');
    if(dirEl)dirEl.innerHTML=sortedDirections.map(d=>{const sel=allDir||_S._selectedDirections.has(d);const dEsc=d.replace(/'/g,"\\'");return`<label class="flex items-center gap-1.5 text-[10px] py-0.5 px-1 rounded cursor-pointer hover:s-card-alt"><input type="checkbox" ${sel?'checked':''} onchange="_toggleOverviewDirection('${dEsc}',event)" class="rounded"><span class="font-semibold">${d}</span></label>`;}).join('');
    const dirLabelEl=document.getElementById('terrDirectionLabel');
    if(dirLabelEl){if(allDir)dirLabelEl.textContent='Direction: toutes';else{const sel=[..._S._selectedDirections];dirLabelEl.textContent=sel.length===1?'Direction: '+sel[0]:('Direction: '+sel.length+'/'+sortedDirections.length);}}
    // Univers <select> — source prioritaire : _clientDominantUnivers (valeurs calculées) ;
    // fallback : articleUnivers (disponible dès le chargement du consommé)
    const availUnivers=_S._clientDominantUnivers.size>0
      ?new Set(_S._clientDominantUnivers.values())
      :new Set(Object.values(_S.articleUnivers).filter(Boolean));
    const UNIVERS_ORDER=['Consommables','Bâtiment','Outillage','Plomberie','Génie climatique','Électricité','EPI','Maintenance et équipements','Agencement ameublement'];
    const sortedUnivers=[...UNIVERS_ORDER.filter(u=>availUnivers.has(u)),...[...availUnivers].filter(u=>!UNIVERS_ORDER.includes(u)).sort()];
    const curUnivers=[..._S._selectedUnivers][0]||'';
    const uSel=document.getElementById('terrUniversSelect');
    if(uSel){uSel.innerHTML=`<option value="">Univers: tous</option>`+sortedUnivers.map(v=>`<option value="${escapeHtml(v)}"${v===curUnivers?' selected':''}>${escapeHtml(v)}</option>`).join('');uSel.value=curUnivers;}
    // Populate métier filter datalist (filtered by stratégique toggle)
    const metInput=document.getElementById('terrMetierFilter');
    const metList=document.getElementById('terrMetierList');
    if(metInput&&metList){const metiers=new Set();for(const info of _S.chalandiseData.values()){if(info.metier&&(!_S._filterStrategiqueOnly||_isMetierStrategique(info.metier)))metiers.add(info.metier);}const sorted=[...metiers].sort();metList.innerHTML=sorted.map(m=>`<option value="${escapeHtml(m)}">`).join('');metInput.value=_S._selectedMetier||'';metInput.classList.toggle('border-rose-400',!!_S._selectedMetier);metInput.classList.toggle('ring-1',!!_S._selectedMetier);metInput.classList.toggle('ring-rose-300',!!_S._selectedMetier);}
    // Populate commercial filter datalist
    const comInput=document.getElementById('terrCommercialFilter');
    const comList=document.getElementById('terrCommercialList');
    if(comInput&&comList){const commercials=new Set();for(const info of _S.chalandiseData.values()){if(info.commercial)commercials.add(info.commercial);}const sorted=[...commercials].sort();comList.innerHTML=sorted.map(c=>`<option value="${escapeHtml(c)}">`).join('');if(_S._selectedCommercial)comInput.value=_S._selectedCommercial;}
  }
  // [Feature B / V3.2] Vue par commercial — CA, actifs/perdus/prospects, top 3 familles
  // Jointure à la volée : chalandiseData × ventesClientArticle (ou ventesClientHorsMagasin si canal hors-MAGASIN)
  // [V3.2] Lit canal depuis DataStore.byContext() (API unifiée)
  function _renderCommercialSummary(){
    const el=document.getElementById('commercialSummaryBlock');if(!el)return;
    if(!_S.chalandiseReady||!_S.clientsByCommercial.size){el.classList.add('hidden');return;}
    const _ctx=DataStore.byContext();
    const canal=_ctx.activeFilters.canal;
    const isHors=canal&&canal!=='MAGASIN';
    const famMap=new Map(DataStore.finalData.map(r=>[r.code,famLib(r.famille)||'Autre']));
    const comData={};
    for(const[cc,info] of _S.chalandiseData.entries()){
      const com=info.commercial||'-';
      if(!comData[com])comData[com]={ca:0,actifs:0,perdus:0,prospects:0,familles:{}};
      const d=comData[com];
      if(_isProspect(info))d.prospects++;
      else if(_isPerdu(info)&&!_isPDVActif(cc))d.perdus++;
      else d.actifs++;
      if(isHors){
        const hm=_S.ventesClientHorsMagasin.get(cc);
        if(hm)for(const[code,v] of hm.entries()){if(v.canal!==canal)continue;const ca=v.sumCA||0;d.ca+=ca;const fam=famMap.get(code)||'Autre';d.familles[fam]=(d.familles[fam]||0)+ca;}
      }else{
        const am=DataStore.ventesClientArticle.get(cc);
        if(am)for(const[code,v] of am.entries()){const ca=v.sumCA||0;d.ca+=ca;const fam=famMap.get(code)||'Autre';d.familles[fam]=(d.familles[fam]||0)+ca;}
      }
    }
    // Separate unassigned ("-") from named commercials
    const unassigned=comData['-'];
    const mainList=Object.entries(comData).filter(([com,d])=>com!=='-'&&d.actifs+d.perdus+d.prospects>0).sort((a,b)=>b[1].ca-a[1].ca);
    const totalCount=mainList.length+(unassigned&&(unassigned.actifs+unassigned.perdus+unassigned.prospects>0)?1:0);
    if(!totalCount){el.classList.add('hidden');return;}
    el.classList.remove('hidden');
    const sel=_ctx.activeFilters.commercial;
    const canalLabel=canal?({MAGASIN:'Magasin',INTERNET:'Internet',REPRESENTANT:'Représentant',DCS:'DCS',AUTRE:'Autre'}[canal]||canal):'';
    const PAGE=15;
    const isOpen=el.dataset.open==='1';
    const showAll=el.dataset.showAll==='1';
    const totalCA=mainList.reduce((s,[,d])=>s+d.ca,0)+(unassigned?unassigned.ca:0);
    const summaryLine=`${totalCount} commercial${totalCount>1?'s':''} · ${totalCA>0?formatEuro(totalCA):'—'}`;
    const visibleMain=showAll?mainList:mainList.slice(0,PAGE);
    function rowHtml(com,d,labelOverride){
      const top3=Object.entries(d.familles).filter(([,ca])=>ca>0).sort((a,b)=>b[1]-a[1]).slice(0,3).map(([f])=>f).join(' · ');
      const isRowSel=sel===com;
      const noResults=isRowSel&&d.ca===0&&d.actifs===0;
      const label=labelOverride||com;
      let r=`<tr class="border-t b-light hover:s-card-alt cursor-pointer${isRowSel?' i-info-bg':''}" data-com="${escapeHtml(com)}" onclick="_onCommercialFilter(this.dataset.com)">
        <td class="py-1.5 px-2 font-semibold${isRowSel?' c-action':' t-primary'}">${escapeHtml(label)}${isRowSel?' ✓':''}</td>
        <td class="py-1.5 px-2 text-right font-bold">${d.ca>0?formatEuro(d.ca):'—'}</td>
        <td class="py-1.5 px-2 text-center ${d.actifs>0?'c-ok font-bold':'t-disabled'}">${d.actifs||'—'}</td>
        <td class="py-1.5 px-2 text-center ${d.perdus>0?'c-caution':'t-disabled'}">${d.perdus||'—'}</td>
        <td class="py-1.5 px-2 text-center ${d.prospects>0?'c-action':'t-disabled'}">${d.prospects||'—'}</td>
        <td class="py-1.5 px-2 text-[10px] t-secondary max-w-[200px] truncate" title="${escapeHtml(top3)}">${top3||'—'}</td>
      </tr>`;
      if(noResults)r+=`<tr><td colspan="6" class="py-2 px-3 text-[11px] c-danger font-semibold">⚠️ Aucun résultat pour <strong>${escapeHtml(label)}</strong>${canalLabel?' sur canal '+canalLabel:''}.</td></tr>`;
      return r;
    }
    let rows='';
    for(const[com,d] of visibleMain)rows+=rowHtml(com,d);
    const remaining=mainList.length-PAGE;
    if(!showAll&&remaining>0)rows+=`<tr><td colspan="6" class="py-2 px-3"><button class="text-[11px] font-bold c-action hover:underline" onclick="(function(){document.getElementById('commercialSummaryBlock').dataset.showAll='1';_renderCommercialSummary();})()">... et ${remaining} autres — Voir tous</button></td></tr>`;
    if(unassigned&&(unassigned.actifs+unassigned.perdus+unassigned.prospects>0))rows+=rowHtml('-',unassigned,'Non assigné');
    let html=`<details ${isOpen?'open':''} class="s-card rounded-xl shadow-md border overflow-hidden mb-3" ontoggle="document.getElementById('commercialSummaryBlock').dataset.open=this.open?'1':'0'">
      <summary class="px-2 py-1.5 border-b s-card-alt select-none flex items-center justify-between cursor-pointer hover:brightness-95">
        <h3 class="font-extrabold t-primary text-xs flex items-center gap-1.5">
          👤 Vue par commercial${canalLabel?` — <span class="c-action">${canalLabel}</span>`:''}
          <span class="font-normal t-disabled">(${totalCount})</span>
        </h3>
        <div class="flex items-center gap-2">
          ${sel?`<button onclick="event.stopPropagation();event.preventDefault();_onCommercialFilter('')" class="text-[10px] c-danger font-semibold hover:underline">✕ ${escapeHtml(sel)}</button>`:''}
          <span class="text-[10px] t-tertiary font-normal">${summaryLine}</span>
          <span class="acc-arrow t-disabled">▶</span>
        </div>
      </summary>
      <div class="overflow-x-auto"><table class="min-w-full text-xs">
      <thead class="s-panel-inner t-inverse"><tr>
        <th class="py-1.5 px-2 text-left">Commercial</th>
        <th class="py-1.5 px-2 text-right">CA agence</th>
        <th class="py-1.5 px-2 text-center">Actifs</th>
        <th class="py-1.5 px-2 text-center">Perdus</th>
        <th class="py-1.5 px-2 text-center">Prospects</th>
        <th class="py-1.5 px-2 text-left">Top 3 familles</th>
      </tr></thead><tbody>${rows}</tbody></table></div>
    </details>`;
    el.innerHTML=html;
  }

  function _buildChalandiseOverview(){
    const blk=document.getElementById('terrChalandiseOverview');
    if(!blk)return;
    if(!_S.chalandiseReady){blk.classList.add('hidden');return;}
    blk.classList.remove('hidden');
    _buildCockpitClient();
    _buildDeptFilter();
    _buildOverviewFilterChips();
    const hasTerr=_S.territoireReady&&DataStore.territoireLines.length>0; // [Adapter Étape 5]
    // Aggregate by direction commerciale — FIXED columns
    const dirMap={};let totalClients=0,filteredClients=0,totalActifsPDV=0,totalActifsLeg=0,totalExcluded24m=0;
    for(const[cc,info] of _S.chalandiseData.entries()){
      totalClients++;
      if(!_clientPassesFilters(info,cc))continue;
      // Exclude perdus >24m when toggle is OFF
      const is24plus=_isPerdu24plus(info);
      if(is24plus&&!_S._includePerdu24m){totalExcluded24m++;continue;}
      filteredClients++;
      const dir=info.secteur?getSecteurDirection(info.secteur)||'Autre':'Autre';
      const dirKey=dir||'Autre';
      if(!dirMap[dirKey])dirMap[dirKey]={dir:dirKey,total:0,actifsLeg:0,actifsPDV:0,prospects:0,perdus12_24:0,inactifs:0,caPDVZone:0};
      const d=dirMap[dirKey];d.total++;
      const pdvActif=_isPDVActif(cc);
      if(_isProspect(info)){d.prospects++;}
      else if(_isPerdu(info)&&!pdvActif){if((info.ca2025||0)>0)d.perdus12_24++;else d.inactifs++;}
      else{d.actifsLeg++;totalActifsLeg++;}
      if(pdvActif){d.actifsPDV++;totalActifsPDV++;}
      d.caPDVZone+=(info.caPDVN||0);
    }
    // Fixed thead — columns NEVER change
    const colSpan=9;
    const headEl=document.getElementById('terrOverviewL1Head');
    if(headEl){
      headEl.innerHTML=`<tr><th class="py-1.5 px-2 text-left">Direction</th><th class="py-1.5 px-2 text-center">Total</th><th class="py-1.5 px-2 text-center">Actifs Leg.</th><th class="py-1.5 px-2 text-center">Actifs PDV</th><th class="py-1.5 px-2 text-center">Prospects</th><th class="py-1.5 px-2 text-center">Perdus 12-24m</th><th class="py-1.5 px-2 text-center">Inactifs</th><th class="py-1.5 px-2 text-center min-w-[100px]">% capté Leg.</th><th class="py-1.5 px-2 text-center min-w-[100px]">% capté PDV</th></tr>`;
    }
    // Summary KPI bar — dénominateur = tous les clients filtrés (prospects inclus)
    const pctCapte=filteredClients>0?Math.round(totalActifsPDV/filteredClients*100):0;
    const pctCapteLeg=filteredClients>0?Math.round(totalActifsLeg/filteredClients*100):0;
    const _nbDirs=Object.keys(dirMap).length;const _sl=document.getElementById('terrOverviewSummaryLine');if(_sl)_sl.textContent=`${_nbDirs} direction${_nbDirs>1?'s':''} · ${totalActifsPDV.toLocaleString('fr-FR')} actifs PDV · ${pctCapte}% capté`;
    const filterActive=_S._selectedDepts.size||_S._selectedClassifs.size||_S._selectedStatuts.size||_S._selectedActivitesPDV.size||_S._selectedDirections.size||_S._selectedUnivers.size||_S._selectedCommercial||_S._selectedMetier||_S._filterStrategiqueOnly;
    const bar=document.getElementById('terrSummaryBar');if(bar)bar.classList.remove('hidden');
    const sumClients=document.getElementById('terrSumClients');
    if(sumClients)sumClients.innerHTML=filterActive?`<span class="c-danger">${filteredClients.toLocaleString('fr-FR')}</span><span class="text-sm font-semibold t-disabled"> / ${totalClients.toLocaleString('fr-FR')}</span>`:`${filteredClients.toLocaleString('fr-FR')}`;
    const sumLeg=document.getElementById('terrSumCapteLeg');if(sumLeg)sumLeg.textContent=pctCapteLeg+'%';
    const sumPDV=document.getElementById('terrSumCaptePDV');if(sumPDV)sumPDV.textContent=pctCapte+'%';
    const legCount=document.getElementById('terrSumCapteLegCount');
    if(legCount){if(filterActive&&filteredClients>0){legCount.textContent=totalActifsLeg.toLocaleString('fr-FR')+' / '+filteredClients.toLocaleString('fr-FR');legCount.classList.remove('hidden');}else legCount.classList.add('hidden');}
    const pdvCount=document.getElementById('terrSumCaptePDVCount');
    if(pdvCount){if(filterActive&&filteredClients>0){pdvCount.textContent=totalActifsPDV.toLocaleString('fr-FR')+' / '+filteredClients.toLocaleString('fr-FR');pdvCount.classList.remove('hidden');}else pdvCount.classList.add('hidden');}
    const excWrap=document.getElementById('terrSumExclusWrap');
    if(excWrap)excWrap.classList.toggle('hidden',_S._includePerdu24m||totalExcluded24m===0);
    const excEl=document.getElementById('terrSumExclus');if(excEl)excEl.textContent=totalExcluded24m.toLocaleString('fr-FR');
    // Sort by % capté ascending (opportunities first)
    let dirsArr=Object.values(dirMap).filter(d=>d.total>0);
    dirsArr.sort((a,b)=>b.perdus12_24-a.perdus12_24||b.total-a.total);
    let html='';
    dirsArr.forEach((d,idx)=>{
      const base=d.total-d.prospects;
      const pctC=base>0?Math.round(d.actifsPDV/base*100):0;
      const pctL=base>0?Math.round(d.actifsLeg/base*100):0;
      const barColor=pctC>=50?'bg-emerald-500':pctC>=25?'bg-amber-500':'bg-red-500';
      const dirEnc=encodeURIComponent(d.dir);
      html+=`<tr class="border-b text-[11px] hover:s-card-alt cursor-pointer font-semibold" onclick="_toggleOverviewL2('${dirEnc}',${idx})">
        <td class="py-1.5 px-2">${d.dir} <span id="overviewL1Arrow-${idx}" class="t-disabled text-[9px]">▼</span></td>
        <td class="py-1.5 px-2 text-center font-bold">${d.total}</td>
        <td class="py-1.5 px-2 text-center ${d.actifsLeg>0?'c-ok font-bold':'t-disabled'}">${d.actifsLeg||'—'}</td>
        <td class="py-1.5 px-2 text-center ${d.actifsPDV>0?'c-ok font-bold':'t-disabled'}">${d.actifsPDV||'—'}</td>
        <td class="py-1.5 px-2 text-center ${d.prospects>0?'c-action':'t-disabled'}">${d.prospects||'—'}</td>
        <td class="py-1.5 px-2 text-center ${d.perdus12_24>0?'c-caution font-bold':'t-disabled'}">${d.perdus12_24||'—'}</td>
        <td class="py-1.5 px-2 text-center ${d.inactifs>0?'t-secondary':'t-disabled'}">${d.inactifs||'—'}</td>
        <td class="py-1.5 px-2"><div class="flex items-center gap-1"><div class="flex-1 s-hover rounded-full h-1.5"><div class="cap-bar bg-blue-400" style="width:${pctL}%"></div></div><span class="text-[10px] font-bold w-8 text-right c-action">${pctL}%</span></div></td>
        <td class="py-1.5 px-2"><div class="flex items-center gap-1"><div class="flex-1 s-hover rounded-full h-1.5"><div class="cap-bar ${barColor}" style="width:${pctC}%"></div></div><span class="text-[10px] font-bold w-8 text-right">${pctC}%</span></div></td>
      </tr>
      <tr id="overviewL2-${idx}" style="display:none"><td colspan="${colSpan}" class="p-0 i-danger-bg"><div id="overviewL2Inner-${idx}" class="text-xs t-disabled px-4 py-2">Chargement…</div></td></tr>`;
    });
    const tEl=document.getElementById('terrOverviewL1Table');
    if(tEl)tEl.innerHTML=html||`<tr><td colspan="${colSpan}" class="text-center py-4 t-disabled">Aucun client dans la zone de chalandise</td></tr>`;
    // Cockpit client
    _buildCockpitClient();
    // [Feature B] Vue par commercial
    _renderCommercialSummary();
    // Mettre à jour la vue Canal avec les filtres actifs
    renderCanalAgence();
  }
  // Level 2: Métiers for a Direction
  function _toggleOverviewL2(dirEnc,idx){
    const row=document.getElementById('overviewL2-'+idx);if(!row)return;
    const arrow=document.getElementById('overviewL1Arrow-'+idx);
    const isOpen=row.style.display!=='none';
    row.style.display=isOpen?'none':'table-row';if(arrow)arrow.textContent=isOpen?'▼':'▲';
    if(!isOpen){const inner=document.getElementById('overviewL2Inner-'+idx);if(inner)_renderOverviewL2(inner,decodeURIComponent(dirEnc));}
  }
  function _renderOverviewL2(el,direction){
    const metierMap={};
    for(const[cc,info] of _S.chalandiseData.entries()){
      if(!_clientPassesFilters(info,cc))continue;
      if(!_S._includePerdu24m&&_isPerdu24plus(info))continue;
      const dir=info.secteur?getSecteurDirection(info.secteur)||'Autre':'Autre';
      if(dir!==direction)continue;
      const m=info.metier||'Autre';
      if(!metierMap[m])metierMap[m]={metier:m,total:0,actifsLeg:0,actifsPDV:0,prospects:0,perdus12_24:0,inactifs:0,caPDVZone:0};
      const md=metierMap[m];md.total++;
      const pdvActif=_isPDVActif(cc);
      if(_isProspect(info)){md.prospects++;}
      else if(_isPerdu(info)&&!pdvActif){if((info.ca2025||0)>0)md.perdus12_24++;else md.inactifs++;}
      else{md.actifsLeg++;}
      if(pdvActif)md.actifsPDV++;
      md.caPDVZone+=(info.caPDVN||0);
    }
    let metiersArr=Object.values(metierMap).filter(m=>m.total>0);
    // Sort by % capté ascending (opportunities first)
    metiersArr.sort((a,b)=>{const aS=_isMetierStrategique(a.metier)?0:1,bS=_isMetierStrategique(b.metier)?0:1;if(aS!==bS)return aS-bS;return b.perdus12_24-a.perdus12_24||b.total-a.total;});
    if(!metiersArr.length){el.innerHTML='<div class="px-4 py-3 t-disabled text-xs">Aucun client pour ce filtre.</div>';return;}
    const dirEnc=encodeURIComponent(direction);
    const headCols='<th class="py-1.5 px-2 text-left">Métier</th><th class="py-1.5 px-2 text-center">Total</th><th class="py-1.5 px-2 text-center">Actifs Leg.</th><th class="py-1.5 px-2 text-center">Actifs PDV</th><th class="py-1.5 px-2 text-center">Prospects</th><th class="py-1.5 px-2 text-center">Perdus 12-24m</th><th class="py-1.5 px-2 text-center">Inactifs</th><th class="py-1.5 px-2 text-center min-w-[90px]">% capté Leg.</th><th class="py-1.5 px-2 text-center min-w-[90px]">% capté PDV</th><th class="py-1.5 px-2 text-center">🔍</th>';
    let html=`<div class="px-2 py-2"><table class="min-w-full text-[11px]"><thead class="i-danger-bg c-danger font-bold"><tr>${headCols}</tr></thead><tbody>`;
    metiersArr.forEach((m,mIdx)=>{
      const base=m.total-m.prospects;
      const pctC=base>0?Math.round(m.actifsPDV/base*100):0;
      const pctL=base>0?Math.round(m.actifsLeg/base*100):0;
      const barColor=pctC>=50?'bg-emerald-500':pctC>=25?'bg-amber-500':'bg-red-500';
      const mEnc=encodeURIComponent(m.metier);
      const rowId=`overviewL3-${dirEnc}-${mIdx}`;
      html+=`<tr class="border-t b-light hover:i-danger-bg cursor-pointer font-semibold" onclick="_toggleOverviewL3('${dirEnc}','${mEnc}','${rowId}')">
        <td class="py-1.5 px-2">${m.metier}${_isMetierStrategique(m.metier)?' <span class="c-caution text-[10px]" title="Métier stratégique Legallais">⭐</span>':''} <span id="${rowId}-arrow" class="t-disabled text-[9px]">▼</span></td>
        <td class="py-1.5 px-2 text-center font-bold">${m.total}</td>
        <td class="py-1.5 px-2 text-center ${m.actifsLeg>0?'c-ok font-bold':'t-disabled'}">${m.actifsLeg||'—'}</td>
        <td class="py-1.5 px-2 text-center ${m.actifsPDV>0?'c-ok font-bold':'t-disabled'}">${m.actifsPDV||'—'}</td>
        <td class="py-1.5 px-2 text-center ${m.prospects>0?'c-action':'t-disabled'}">${m.prospects||'—'}</td>
        <td class="py-1.5 px-2 text-center ${m.perdus12_24>0?'c-caution font-bold':'t-disabled'}">${m.perdus12_24||'—'}</td>
        <td class="py-1.5 px-2 text-center ${m.inactifs>0?'t-secondary':'t-disabled'}">${m.inactifs||'—'}</td>
        <td class="py-1.5 px-2"><div class="flex items-center gap-1"><div class="flex-1 s-hover rounded-full h-1.5"><div class="cap-bar bg-blue-400" style="width:${pctL}%"></div></div><span class="text-[10px] w-7 text-right c-action">${pctL}%</span></div></td>
        <td class="py-1.5 px-2"><div class="flex items-center gap-1"><div class="flex-1 s-hover rounded-full h-1.5"><div class="cap-bar ${barColor}" style="width:${pctC}%"></div></div><span class="text-[10px] w-7 text-right">${pctC}%</span></div></td>
        <td class="py-1.5 px-2 text-center"><button class="diag-btn i-danger-bg c-danger" onclick="event.stopPropagation();openDiagnosticMetier(decodeURIComponent('${mEnc}'))">🔍</button></td>
      </tr>
      <tr id="${rowId}" style="display:none"><td colspan="10" class="p-0 i-info-bg"><div id="${rowId}-inner" class="text-xs t-disabled px-4 py-2">Chargement…</div></td></tr>`;
    });
    html+=`</tbody></table></div>`;
    el.innerHTML=html;
  }
  // Level 3: Secteurs for a Direction+Métier
  function _toggleOverviewL3(dirEnc,mEnc,rowId){
    const row=document.getElementById(rowId);if(!row)return;
    const arrow=document.getElementById(rowId+'-arrow');
    const isOpen=row.style.display!=='none';
    row.style.display=isOpen?'none':'table-row';if(arrow)arrow.textContent=isOpen?'▼':'▲';
    if(!isOpen){const inner=document.getElementById(rowId+'-inner');if(inner)_renderOverviewL3(inner,decodeURIComponent(dirEnc),decodeURIComponent(mEnc));}
  }
  function _renderOverviewL3(el,direction,metier){
    const sectMap={};
    for(const[cc,info] of _S.chalandiseData.entries()){
      if(!_clientPassesFilters(info,cc))continue;
      if(!_S._includePerdu24m&&_isPerdu24plus(info))continue;
      const dir=info.secteur?getSecteurDirection(info.secteur)||'Autre':'Autre';
      if(dir!==direction)continue;
      if((info.metier||'Autre')!==metier)continue;
      const sect=info.secteur||'—';
      const comm=info.commercial||'—';
      const key=sect+'||'+comm;
      if(!sectMap[key])sectMap[key]={secteur:sect,commercial:comm,total:0,actifsLeg:0,actifsPDV:0,prospects:0,perdus12_24:0,inactifs:0,caPDVZone:0};
      const sd=sectMap[key];sd.total++;
      const pdvActif=_isPDVActif(cc);
      if(_isProspect(info)){sd.prospects++;}
      else if(_isPerdu(info)&&!pdvActif){if((info.ca2025||0)>0)sd.perdus12_24++;else sd.inactifs++;}
      else{sd.actifsLeg++;}
      if(pdvActif)sd.actifsPDV++;
      sd.caPDVZone+=(info.caPDVN||0);
    }
    let sectsArr=Object.values(sectMap);
    sectsArr.sort((a,b)=>b.perdus12_24-a.perdus12_24||b.total-a.total);
    if(!sectsArr.length){el.innerHTML='<div class="px-4 py-3 t-disabled text-xs">Aucun secteur identifié.</div>';return;}
    const dirEnc=encodeURIComponent(direction),mEnc=encodeURIComponent(metier);
    const headCols='<th class="py-1.5 px-2 text-left">Secteur</th><th class="py-1.5 px-2 text-left">Commercial</th><th class="py-1.5 px-2 text-center">Total</th><th class="py-1.5 px-2 text-center">Actifs Leg.</th><th class="py-1.5 px-2 text-center">Actifs PDV</th><th class="py-1.5 px-2 text-center">Prospects</th><th class="py-1.5 px-2 text-center">Perdus 12-24m</th><th class="py-1.5 px-2 text-center">Inactifs</th><th class="py-1.5 px-2 text-center min-w-[90px]">% capté Leg.</th><th class="py-1.5 px-2 text-center min-w-[90px]">% capté PDV</th>';
    let html=`<div class="px-2 py-2"><table class="min-w-full text-[11px]"><thead class="s-hover t-primary font-bold"><tr>${headCols}</tr></thead><tbody>`;
    sectsArr.forEach((s,sIdx)=>{
      const base=s.total-s.prospects;
      const pctC=base>0?Math.round(s.actifsPDV/base*100):0;
      const pctL=base>0?Math.round(s.actifsLeg/base*100):0;
      const barColor=pctC>=50?'bg-emerald-500':pctC>=25?'bg-amber-500':'bg-red-500';
      const sEnc=encodeURIComponent(s.secteur);
      const rowId=`overviewL4-${dirEnc}-${mEnc}-${sIdx}`;
      html+=`<tr class="border-t border-violet-200 hover:i-info-bg cursor-pointer" onclick="_toggleOverviewL4('${dirEnc}','${mEnc}','${sEnc}','${rowId}')">
        <td class="py-1.5 px-2 font-semibold">${s.secteur} <span id="${rowId}-arrow" class="t-disabled text-[9px]">▼</span></td>
        <td class="py-1.5 px-2 t-secondary">${s.commercial}</td>
        <td class="py-1.5 px-2 text-center font-bold">${s.total}</td>
        <td class="py-1.5 px-2 text-center ${s.actifsLeg>0?'c-ok font-bold':'t-disabled'}">${s.actifsLeg||'—'}</td>
        <td class="py-1.5 px-2 text-center ${s.actifsPDV>0?'c-ok font-bold':'t-disabled'}">${s.actifsPDV||'—'}</td>
        <td class="py-1.5 px-2 text-center ${s.prospects>0?'c-action':'t-disabled'}">${s.prospects||'—'}</td>
        <td class="py-1.5 px-2 text-center ${s.perdus12_24>0?'c-caution font-bold':'t-disabled'}">${s.perdus12_24||'—'}</td>
        <td class="py-1.5 px-2 text-center ${s.inactifs>0?'t-secondary':'t-disabled'}">${s.inactifs||'—'}</td>
        <td class="py-1.5 px-2"><div class="flex items-center gap-1"><div class="flex-1 s-hover rounded-full h-1.5"><div class="cap-bar bg-blue-400" style="width:${pctL}%"></div></div><span class="text-[10px] w-7 text-right c-action">${pctL}%</span></div></td>
        <td class="py-1.5 px-2"><div class="flex items-center gap-1"><div class="flex-1 s-hover rounded-full h-1.5"><div class="cap-bar ${barColor}" style="width:${pctC}%"></div></div><span class="text-[10px] w-7 text-right">${pctC}%</span></div></td>
      </tr>
      <tr id="${rowId}" style="display:none"><td colspan="10" class="p-0 i-info-bg"><div id="${rowId}-inner" class="text-xs px-4 py-2">Chargement…</div></td></tr>`;
    });
    html+=`</tbody></table></div>`;
    el.innerHTML=html;
  }
  // Level 4: Clients for a Direction+Métier+Secteur
  function _toggleOverviewL4(dirEnc,mEnc,sEnc,rowId){
    const row=document.getElementById(rowId);if(!row)return;
    const arrow=document.getElementById(rowId+'-arrow');
    const isOpen=row.style.display!=='none';
    row.style.display=isOpen?'none':'table-row';if(arrow)arrow.textContent=isOpen?'▼':'▲';
    if(!isOpen){const inner=document.getElementById(rowId+'-inner');if(inner)_renderOverviewL4(inner,decodeURIComponent(dirEnc),decodeURIComponent(mEnc),decodeURIComponent(sEnc));}
  }
  function _overviewClientSort(a,b){
    // Actifs globaux Inactifs PDV first, then Perdus récents FID Pot+, then rest
    const aGlobActif=_isGlobalActif(a),bGlobActif=_isGlobalActif(b);
    const aPDV=a._pdvActif,bPDV=b._pdvActif;
    // Priority: 1=global actif + PDV inactif, 2=perdu FID Pot+, 3=rest
    const aP=aGlobActif&&!aPDV?1:(_isPerdu(a)&&_normalizeClassif(a.classification).includes('Pot+')?2:3);
    const bP=bGlobActif&&!bPDV?1:(_isPerdu(b)&&_normalizeClassif(b.classification).includes('Pot+')?2:3);
    if(aP!==bP)return aP-bP;
    return(b.ca2025||0)-(a.ca2025||0);
  }
  function _renderOverviewL4(el,direction,metier,secteur,limit){
    limit=limit||20;
    const clients=[];
    for(const[cc,info] of _S.chalandiseData.entries()){
      if(!_clientPassesFilters(info,cc))continue;
      if(!_S._includePerdu24m&&_isPerdu24plus(info))continue;
      const dir=info.secteur?getSecteurDirection(info.secteur)||'Autre':'Autre';
      if(dir!==direction)continue;
      if((info.metier||'Autre')!==metier)continue;
      if((info.secteur||'—')!==secteur)continue;
      const pdvActif=_isPDVActif(cc);
      if(!_passesClientCrossFilter(cc))continue;
      clients.push({code:cc,nom:info.nom||'',statut:info.statut||'',classification:info.classification||'',commercial:info.commercial||'',ca2025:info.ca2025||0,caPDVN:info.caPDVN||0,ville:info.ville||'',_pdvActif:pdvActif});
    }
    clients.sort(_overviewClientSort);
    if(!clients.length){el.innerHTML='<div class="t-disabled text-xs py-2">Aucun client.</div>';return;}
    const show=clients.slice(0,limit),more=clients.length-limit;
    let html=`<div class="overflow-x-auto" style="max-height:340px;overflow-y:auto"><table class="min-w-full text-[10px]"><thead class="i-info-bg c-action font-bold sticky top-0"><tr><th class="py-1 px-2 text-left">Client</th><th class="py-1 px-2 text-left">Commercial</th><th class="py-1 px-2 text-center">Classif.</th><th class="py-1 px-2 text-right">CA Legallais</th><th class="py-1 px-2 text-right">CA Magasin Zone</th><th class="py-1 px-2 text-left">Ville</th></tr></thead><tbody>`;
    for(const c of show){
      const globActif=_isGlobalActif(c);const perdu=_isPerdu(c);
      const pdvBg=globActif&&!c._pdvActif?'i-caution-bg':perdu?'i-danger-bg':'';
      html+=`<tr class="border-t border-blue-100 ${pdvBg} cursor-pointer hover:i-info-bg" onclick="openClient360('${c.code}','reseau')">
        <td class="py-1 px-2"><span class="font-mono t-disabled text-[9px]">${c.code}</span>${_crossBadge(c.code)} <span class="font-semibold">${c.nom}</span>${_unikLink(c.code)}${_clientStatusBadge(c.code,c)}</td>
        <td class="py-1 px-2 text-[9px] t-tertiary">${c.commercial||'—'}</td>
        <td class="py-1 px-2 text-center">${_classifShort(c.classification)}</td>
        <td class="py-1 px-2 text-right font-bold ${c.ca2025>0?'c-caution':'t-disabled'}">${c.ca2025>0?formatEuro(c.ca2025):'—'}</td>
        <td class="py-1 px-2 text-right font-bold ${c.caPDVN>0?'c-ok':'t-disabled'}">${c.caPDVN>0?formatEuro(c.caPDVN):'—'}</td>
        <td class="py-1 px-2 text-[9px] t-tertiary">${c.ville||'—'}</td>
      </tr>`;
    }
    html+=`</tbody></table></div>`;
    if(more>0)html+=`<button class="mt-1 mb-1 ml-2 text-[10px] font-bold c-action hover:underline" onclick="_renderOverviewL4(this.parentElement,decodeURIComponent('${encodeURIComponent(direction)}'),decodeURIComponent('${encodeURIComponent(metier)}'),decodeURIComponent('${encodeURIComponent(secteur)}'),${limit+50})">▼ Voir plus (${more} restants)</button>`;
    el.innerHTML=html;
  }
  // Client article expand panel (used in L4 and cockpit)
  function _toggleClientArticles(row,clientCode){
    const nextRow=row.nextElementSibling;
    if(nextRow&&nextRow.classList.contains('client-art-panel')){nextRow.remove();return;}
    // [Adapter Étape 5] — territoireLines / finalData / ventesClientArticle : canal-invariants
    const hasTerr=_S.territoireReady&&DataStore.territoireLines.length>0;
    const stockMap=new Map(DataStore.finalData.map(r=>[r.code,r]));
    // Section 1 : achats comptoir (DataStore.ventesClientArticle — MAGASIN/myStore only)
    const artData=DataStore.ventesClientArticle.get(clientCode);
    let comptoirArts=[];
    if(artData&&artData.size>0){
      comptoirArts=[...artData.entries()].sort((a,b)=>b[1].sumPrelevee-a[1].sumPrelevee).slice(0,20).map(([code,d])=>{
        const si=stockMap.get(code);
        return{code,libelle:si?si.libelle:_S.libelleLookup[code]||code,qty:d.sumPrelevee,ca:d.sumCA,rayonStatus:si?(si.stockActuel>0?'green':'yellow'):'red'};
      });
    }
    // Section 2 : achats hors comptoir (DataStore.territoireLines — tous canaux BL omnicanal)
    let terrArts=[];
    if(hasTerr){
      const artMap={};
      for(const l of DataStore.territoireLines){
        if(l.clientCode===clientCode){
          if(!artMap[l.code])artMap[l.code]={code:l.code,libelle:l.libelle,famille:l.famille||'',ca:0,canals:new Set(),rayonStatus:l.rayonStatus};
          artMap[l.code].ca+=l.ca;
          if(l.canal)artMap[l.code].canals.add(l.canal);
        }
      }
      terrArts=Object.values(artMap).sort((a,b)=>b.ca-a.ca).slice(0,20);
    }
    const hasComptoir=comptoirArts.length>0;
    const hasTerrArts=terrArts.length>0;
    let panelHtml=`<td colspan="9" class="p-0"><div class="s-card-alt border-t-2 border-sky-300 px-4 py-2">`;
    if(!hasComptoir&&!hasTerrArts){
      const _cInfo=_S.chalandiseData.get(clientCode);const _ca25=(_cInfo&&_cInfo.ca2025)||0;
      panelHtml+=_ca25>0?`<p class="text-[10px] c-action font-semibold">Ce client achète chez Legallais (${formatEuro(_ca25)}) via d'autres canaux (Internet, DCS, Commercial) — opportunité de captation PDV</p>`:`<p class="t-disabled text-[10px]">Prospect — aucun historique d'achat.</p>`;
    }else{
      if(hasComptoir){
        const nbInRayon=comptoirArts.filter(a=>a.rayonStatus==='green').length;
        const nbAbsent=comptoirArts.filter(a=>a.rayonStatus==='red').length;
        panelHtml+=`<p class="text-[10px] font-bold t-primary mb-1">🏪 Achats comptoir : ${comptoirArts.length} réf. dont ${nbInRayon} en rayon, ${nbAbsent} absentes${nbAbsent>0?' — référencez ces '+nbAbsent+' articles pour le capter':''}</p>`;
        panelHtml+=`<table class="min-w-full text-[10px]${hasTerrArts?' mb-3':''}"><thead class="s-hover t-primary"><tr><th class="py-1 px-2 text-left">Code</th><th class="py-1 px-2 text-left">Libellé</th><th class="py-1 px-2 text-center">Qté</th><th class="py-1 px-2 text-right">CA</th><th class="py-1 px-2 text-center">En rayon</th><th class="py-1 px-2 text-right">Stock</th></tr></thead><tbody>`;
        for(const a of comptoirArts){
          const si=stockMap.get(a.code);const st=si?si.stockActuel:'—';
          const ri=a.rayonStatus==='green'?'✅ En rayon':a.rayonStatus==='yellow'?'⚠️ Rupture':'❌ Absent';
          const bg=a.rayonStatus==='red'?'i-danger-bg':a.rayonStatus==='yellow'?'i-caution-bg':'';
          panelHtml+=`<tr class="border-t b-light ${bg}"><td class="py-0.5 px-2 font-mono">${a.code}</td><td class="py-0.5 px-2 max-w-[180px] truncate">${a.libelle}</td><td class="py-0.5 px-2 text-center">${a.qty}</td><td class="py-0.5 px-2 text-right font-bold">${formatEuro(a.ca)}</td><td class="py-0.5 px-2 text-center">${ri}</td><td class="py-0.5 px-2 text-right">${st}</td></tr>`;
        }
        panelHtml+=`</tbody></table>`;
      }
      if(hasTerrArts){
        const totalCA=terrArts.reduce((s,a)=>s+a.ca,0);
        panelHtml+=`<p class="text-[10px] font-bold t-primary mb-1${hasComptoir?' mt-2':''}">📦 Ce client achète chez Legallais (hors votre comptoir) — ${terrArts.length} réf. · ${formatEuro(totalCA)} CA</p>`;
        panelHtml+=`<table class="min-w-full text-[10px]"><thead class="s-hover t-primary"><tr><th class="py-1 px-2 text-left">Code</th><th class="py-1 px-2 text-left">Libellé</th><th class="py-1 px-2 text-left">Famille</th><th class="py-1 px-2 text-right">CA</th><th class="py-1 px-2 text-center">Canal</th></tr></thead><tbody>`;
        for(const a of terrArts){
          const canalStr=[...a.canals].join(' / ')||'—';
          panelHtml+=`<tr class="border-t b-light"><td class="py-0.5 px-2 font-mono">${a.code}</td><td class="py-0.5 px-2 max-w-[180px] truncate">${a.libelle}</td><td class="py-0.5 px-2 t-tertiary max-w-[120px] truncate">${famLib(a.famille)}</td><td class="py-0.5 px-2 text-right font-bold c-action">${formatEuro(a.ca)}</td><td class="py-0.5 px-2 text-center t-tertiary">${canalStr}</td></tr>`;
        }
        panelHtml+=`</tbody></table>`;
      }
    }
    panelHtml+=`</div></td>`;
    const tr=document.createElement('tr');tr.className='client-art-panel';tr.innerHTML=panelHtml;
    row.insertAdjacentElement('afterend',tr);
  }
  // ── Filtre période global ──
  function togglePeriodDropdown(){ toggleTabPeriodDropdown(); }
  function toggleTabPeriodDropdown(){
    const dd=document.getElementById('tabPeriodDropdown');if(!dd)return;
    buildPeriodFilter(); // refresh pills avant d'ouvrir
    const open=dd.classList.toggle('hidden');
    if(!open){
      setTimeout(()=>{
        document.addEventListener('click',function _closeTpd(e){
          const container=document.getElementById('tabsFilterTitle');
          if(!container||!container.contains(e.target)){dd.classList.add('hidden');document.removeEventListener('click',_closeTpd);}
        });
      },0);
    }
  }
  function applyPeriodFilter(startTs,endTs){
    const tdd=document.getElementById('tabPeriodDropdown');if(tdd)tdd.classList.add('hidden');
    _S.periodFilterStart=startTs?new Date(+startTs):null;
    _S.periodFilterEnd=endTs?new Date(+endTs):null;
    invalidateCache('tab', 'terr');
    buildPeriodFilter(); // mettre à jour labels boutons + état pills
    if(_S._rawDataC&&_S._rawDataC.length){processDataFromRaw(_S._rawDataC,_S._rawDataS||[],{isRefilter:true});}else{
      // Données brutes non disponibles (session restaurée depuis IDB) — re-render léger
      // Les agrégats période-dépendants (ventesClientArticle, canalAgence…) restent figés à la
      // période de la dernière sauvegarde ; seul le rendu (labels, territoire, filtres) est mis à jour.
      showToast('⚠️ Agrégats figés — rechargez le fichier consommé pour recalculer sur cette période','warning');
      renderCanalAgence();renderCurrentTab();renderIRABanner();
    } // recalcul complet des agrégats sur la période filtrée
  }
  // ── Sélecteur période — helpers ──────────────────────────────────────────
  function _buildPeriodeOptions(){
    const minD=_S.consommePeriodMinFull||_S.consommePeriodMin;
    const maxD=_S.consommePeriodMaxFull||_S.consommePeriodMax;
    if(!minD||!maxD)return{mois:[],trimestres:[]};
    const mois=[];
    let cur=new Date(minD.getFullYear(),minD.getMonth(),1);
    const end=new Date(maxD.getFullYear(),maxD.getMonth(),1);
    while(cur<=end){mois.push(new Date(cur));cur=new Date(cur.getFullYear(),cur.getMonth()+1,1);}
    const qMap={};
    for(const m of mois){
      const q=Math.floor(m.getMonth()/3);const y=m.getFullYear();const qk=`${y}-Q${q+1}`;
      if(!qMap[qk])qMap[qk]={label:`Q${q+1} ${y}`,start:new Date(y,q*3,1),end:new Date(y,q*3+3,0,23,59,59),months:[]};
      qMap[qk].months.push(m);
    }
    const trimestres=Object.values(qMap).filter(q=>q.months.length>=3);
    return{mois,trimestres};
  }
  function _applyPeriode(start,end){
    applyPeriodFilter(start?start.getTime():null,end?end.getTime():null);
  }
  window._applyPeriodeTout=()=>_applyPeriode(null,null);
  window._applyPeriodeMois=(yyyy_mm)=>{
    const[y,m]=yyyy_mm.split('-').map(Number);
    _applyPeriode(new Date(y,m-1,1),new Date(y,m,0,23,59,59));
  };
  window._applyPeriodeLibre=(sfx)=>{
    const sv=document.getElementById(`pdStart_${sfx}`)?.value;
    const ev=document.getElementById(`pdEnd_${sfx}`)?.value;
    if(!sv||!ev)return;
    const[sy,sm]=sv.split('-').map(Number);const[ey,em]=ev.split('-').map(Number);
    _applyPeriode(new Date(sy,sm-1,1),new Date(ey,em,0,23,59,59));
  };
  window._applyPeriodeMoisCourant=()=>{
    const maxD=_S.consommePeriodMaxFull||_S.consommePeriodMax;if(!maxD)return;
    const y=maxD.getFullYear(),m=maxD.getMonth();
    _applyPeriode(new Date(y,m,1),new Date(y,m+1,0,23,59,59));
  };
  window._applyPeriodeMoisPrecedent=()=>{
    const maxD=_S.consommePeriodMaxFull||_S.consommePeriodMax;if(!maxD)return;
    const y=maxD.getFullYear(),m=maxD.getMonth();
    const py=m===0?y-1:y,pm=m===0?11:m-1;
    _applyPeriode(new Date(py,pm,1),new Date(py,pm+1,0,23,59,59));
  };
  window._applyPeriode3Mois=()=>{
    const maxD=_S.consommePeriodMaxFull||_S.consommePeriodMax;if(!maxD)return;
    _applyPeriode(new Date(maxD.getFullYear(),maxD.getMonth()-2,1),new Date(maxD.getFullYear(),maxD.getMonth()+1,0,23,59,59));
  };
  window._applyPeriodeQ=(sTs,eTs)=>{applyPeriodFilter(sTs,eTs);};

  function buildPeriodFilter(){
    const tabBlock=document.getElementById('tabPeriodBlock');
    const{mois,trimestres}=_buildPeriodeOptions();
    if(!mois.length){if(tabBlock)tabBlock.style.display='none';return;}
    const maxD=_S.consommePeriodMaxFull||_S.consommePeriodMax;
    const ps=_S.periodFilterStart?_S.periodFilterStart.getTime():null;
    const pe=_S.periodFilterEnd?_S.periodFilterEnd.getTime():null;
    const isTout=!ps&&!pe;
    const _fmtM=d=>d.toLocaleDateString('fr-FR',{month:'short',year:'numeric'});
    const _ym=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
    // Prédéfinies timestamps
    const mcTs=maxD?new Date(maxD.getFullYear(),maxD.getMonth(),1).getTime():null;
    const mcEts=maxD?new Date(maxD.getFullYear(),maxD.getMonth()+1,0,23,59,59).getTime():null;
    const prevM=maxD?new Date(maxD.getFullYear(),maxD.getMonth()-1,1):null;
    const mpTs=prevM?prevM.getTime():null;
    const mpEts=prevM?new Date(prevM.getFullYear(),prevM.getMonth()+1,0,23,59,59).getTime():null;
    const t3start=mois.length>=3?new Date(mois[Math.max(0,mois.length-3)].getFullYear(),mois[Math.max(0,mois.length-3)].getMonth(),1).getTime():null;
    const t3end=maxD?new Date(maxD.getFullYear(),maxD.getMonth()+1,0,23,59,59).getTime():null;
    // Warn
    const warnHtml=(ps&&pe&&Math.round((pe-ps)/86400000)<90)
      ?`<p class="text-[10px] c-caution font-bold mt-2">⚠️ Période courte — les MIN/MAX peuvent être sous-estimés</p>`:'';
    function buildHtml(sfx){
      const selS=_S.periodFilterStart?_ym(_S.periodFilterStart):_ym(mois[0]);
      const selE=_S.periodFilterEnd?_ym(_S.periodFilterEnd):_ym(mois[mois.length-1]);
      const opts=(sel)=>mois.map(m=>{const v=_ym(m);return`<option value="${v}"${v===sel?' selected':''}>${_fmtM(m)}</option>`;}).join('');
      const moisPills=mois.map(m=>{
        const sTs=new Date(m.getFullYear(),m.getMonth(),1).getTime();
        const eTs=new Date(m.getFullYear(),m.getMonth()+1,0,23,59,59).getTime();
        const act=ps===sTs&&pe===eTs;
        return`<button class="periode-btn${act?' active':''}" onclick="window._applyPeriodeMois('${_ym(m)}')">${_fmtM(m)}</button>`;
      }).join('');
      const predBtn=(label,sub,onclick,act)=>
        `<button class="periode-btn wide${act?' active':''}" onclick="${onclick}">${label}${sub?`<span class="periode-sub">${sub}</span>`:''}${act?' ✓':''}</button>`;
      const qBtns=trimestres.map(q=>{
        const sTs=q.start.getTime(),eTs=q.end.getTime();
        return predBtn(q.label,'',`window._applyPeriodeQ(${sTs},${eTs})`,ps===sTs&&pe===eTs);
      }).join('');
      return`<div class="periode-section">
  <div class="periode-label">Période libre</div>
  <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
    <select id="pdStart_${sfx}" class="periode-select" onchange="window._applyPeriodeLibre('${sfx}')">${opts(selS)}</select>
    <span class="t-muted" style="font-size:var(--fs-xs)">→</span>
    <select id="pdEnd_${sfx}" class="periode-select" onchange="window._applyPeriodeLibre('${sfx}')">${opts(selE)}</select>
  </div>
</div>
<div class="periode-section">
  <div class="periode-label">Par mois</div>
  <div style="display:flex;gap:6px;flex-wrap:wrap;">${moisPills}</div>
</div>
<div class="periode-section">
  <div class="periode-label">Périodes prédéfinies</div>
  <div style="display:flex;flex-direction:column;gap:4px;">
    ${predBtn('Toute la période','','window._applyPeriodeTout()',isTout)}
    ${mcTs?predBtn('Mois en cours',_fmtM(maxD),'window._applyPeriodeMoisCourant()',ps===mcTs&&pe===mcEts):''}
    ${prevM&&mois.length>=2?predBtn('Mois précédent',_fmtM(prevM),'window._applyPeriodeMoisPrecedent()',ps===mpTs&&pe===mpEts):''}
    ${mois.length>=3?predBtn('3 derniers mois',`${_fmtM(mois[Math.max(0,mois.length-3)])} → ${_fmtM(mois[mois.length-1])}`,'window._applyPeriode3Mois()',ps===t3start&&pe===t3end):''}
    ${qBtns}
  </div>
</div>${warnHtml}`;
    }
    const tabDd=document.getElementById('tabPeriodDropdown');if(tabDd)tabDd.innerHTML=buildHtml('tab');
    // Update sidebar period label
    const tabLabel=document.getElementById('tabPeriodLabel');
    if(ps&&pe){
      const _l=_S.periodFilterStart.getMonth()===_S.periodFilterEnd.getMonth()&&_S.periodFilterStart.getFullYear()===_S.periodFilterEnd.getFullYear()
        ?fmtDate(_S.periodFilterStart):`${fmtDate(_S.periodFilterStart)} → ${fmtDate(_S.periodFilterEnd)}`;
      if(tabLabel){tabLabel.textContent=_l+' ▼';tabLabel.classList.add('filtered');}
    }else{
      if(tabLabel){
        const minD=_S.consommePeriodMinFull||_S.consommePeriodMin;
        const maxD=_S.consommePeriodMaxFull||_S.consommePeriodMax;
        tabLabel.textContent=(minD&&maxD?`${fmtDate(minD)} → ${fmtDate(maxD)}`:'—')+' ▼';
        tabLabel.classList.remove('filtered');
      }
      updatePeriodAlert();
    }
    if(tabBlock)tabBlock.style.display='';
  }
  // ── Reporting ──
  function generateReportText(){
    const pStart=_S.periodFilterStart||_S.consommePeriodMinFull||_S.consommePeriodMin;
    const pEnd=_S.periodFilterEnd||_S.consommePeriodMaxFull||_S.consommePeriodMax;
    const agence=_S.selectedMyStore||'—';
    // Period in human form e.g. "Janvier à mars 2026"
    const MOIS=['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'];
    const periodHuman=(()=>{
      if(!pStart||!pEnd)return null;
      try{
        const s=new Date(pStart),e=new Date(pEnd);
        const sm=MOIS[s.getMonth()],em=MOIS[e.getMonth()];
        if(s.getFullYear()===e.getFullYear()){
          return sm===em?`${sm} ${s.getFullYear()}`:`${sm} à ${em} ${e.getFullYear()}`;
        }
        return `${sm} ${s.getFullYear()} à ${em} ${e.getFullYear()}`;
      }catch{return null;}
    })();
    const periodLabel=periodHuman?(periodHuman.charAt(0).toUpperCase()+periodHuman.slice(1)):(pStart&&pEnd?`${fmtDate(pStart)} → ${fmtDate(pEnd)}`:'—');
    // NaN-safe helpers
    const ok=v=>v!==null&&v!==undefined&&!isNaN(v)&&v!=='';
    const euro=v=>ok(v)&&v>0?formatEuro(v):null;
    const pct=v=>ok(v)?`${Math.round(v)}%`:null;
    // Équation commerciale — nbClients depuis ventesClientArticle (period-filtered)
    const nbClientsPDV=_S.ventesClientArticle.size;
    const storeData=_S.ventesParMagasin[_S.selectedMyStore]||{};
    const caPDVTotal=Object.values(storeData).reduce((s,v)=>s+(v.sumCA||0),0);
    const vmbPDV=Object.values(storeData).reduce((s,v)=>s+(v.sumVMB||0),0);
    const _nbPassagesExec=_S.ventesAnalysis?_S.ventesAnalysis.nbPassages:0;
    // Option A (passages) : fréq = passages/clients, panier = CA/passages — base cohérente
    const freqPDV=nbClientsPDV>0&&_nbPassagesExec>0?parseFloat((_nbPassagesExec/nbClientsPDV).toFixed(1)):null;
    const caParClient=nbClientsPDV>0?Math.round(caPDVTotal/nbClientsPDV):null;
    const txMarge=_S.ventesAnalysis?_S.ventesAnalysis.txMarge:null;
    // Taux de disponibilité
    let serviceOk=0,serviceTotal=0;
    for(const r of DataStore.finalData){if(r.W>=3&&!r.isParent&&!(r.V===0&&r.enleveTotal>0)){serviceTotal++;if(r.stockActuel>0)serviceOk++;}}
    const srNum=serviceTotal>0?Math.round((serviceOk/serviceTotal)*100):null;
    // Ruptures
    const rupturesList=DataStore.finalData.filter(r=>r.W>=3&&r.stockActuel<=0&&!r.isParent&&!(r.V===0&&r.enleveTotal>0));
    // Dormants
    const dormantsList=DataStore.finalData.filter(r=>!r.isNouveaute&&r.ageJours>DORMANT_DAYS&&(r.stockActuel*r.prixUnitaire)>50);
    const dormantVal=Math.round(dormantsList.reduce((s,r)=>s+r.stockActuel*r.prixUnitaire,0));
    // Benchmark
    const win3=(_S.benchLists.obsFamiliesWin||[]).slice(0,3);
    const lose3=(_S.benchLists.obsFamiliesLose||[]).slice(0,3);
    const kpis=_S.benchLists.obsKpis;
    const hasBench=!!kpis;
    // Articles réseau manquants
    const manquants=_S.benchLists.missed||[];
    const manquantsHF=manquants.filter(a=>(a.bassinFreq||0)>=5).length;
    // Clients silencieux >30j mais dans le périmètre du consommé (pas les anciens hors-fichier)
    const now=new Date();const silencieuxList=[];
    const _minConsomme=_S.consommePeriodMinFull||_S.consommePeriodMin;
    for(const[cc,lastDate] of _S.clientLastOrder.entries()){
      if(_minConsomme&&lastDate<_minConsomme)continue;
      const _dSil=daysBetween(lastDate,now);
      if(_dSil>30&&_dSil<=60){
        const artData=(_S.ventesClientArticleFull.size?_S.ventesClientArticleFull:_S.ventesClientArticle).get(cc);
        const caPDV=artData?[...artData.values()].reduce((s,d)=>s+(d.sumCAAll||d.sumCA||0),0):0;
        if(caPDV>0){const nom=_S.clientNomLookup[cc]||(_S.chalandiseData.get(cc)||{}).nom||cc;silencieuxList.push({cc,nom,caPDV});}
      }
    }
    silencieuxList.sort((a,b)=>{const dA=daysBetween(_S.clientLastOrder.get(a.cc),now);const dB=daysBetween(_S.clientLastOrder.get(b.cc),now);return dA-dB;});
    const silencieuxCount=silencieuxList.length;
    const silencieuxCA=silencieuxList.reduce((s,c)=>s+c.caPDV,0);
    const silencieuxTop3=silencieuxList.slice(0,3).map(c=>c.nom).join(', ');
    // Clients à capter
    let clientsACapter=0;
    if(_S.chalandiseReady){const _fullClientSet=_S.ventesClientArticleFull.size?_S.ventesClientArticleFull:_S.ventesClientArticle;for(const[cc,info] of _S.chalandiseData.entries()){if((info.ca2025||0)>0&&!_fullClientSet.has(cc)&&!(_S.clientsMagasin&&_S.clientsMagasin.has(cc)))clientsACapter++;}}
    // Fichiers
    const fichiersList=['Consommé','État du Stock'];
    if(_S.territoireReady)fichiersList.push('Le Terrain');
    if(_S.chalandiseReady)fichiersList.push('Chalandise');
    // Position réseau
    let reseauRank=null,reseauTotal=null;
    if(hasBench){const sp=_S.benchLists.storePerf||{};const spSorted=Object.entries(sp).sort((a,b)=>b[1].freq-a[1].freq);if(spSorted.length>0){reseauTotal=spSorted.length;const myIdx=spSorted.findIndex(([s])=>s===_S.selectedMyStore);if(myIdx>=0)reseauRank=myIdx+1;}}
    const pdmBassin=hasBench&&kpis&&ok(kpis.mine?.pdm)?kpis.mine.pdm:null;
    // Omnicanalité
    const caMag=_S.canalAgence['MAGASIN']?.ca||0;
    const caWeb=_S.canalAgence['INTERNET']?.ca||0;
    const caRep=_S.canalAgence['REPRESENTANT']?.ca||0;
    const caDcs=_S.canalAgence['DCS']?.ca||0;
    const caHorsAgence=caWeb+caRep+caDcs;
    const caTotalCanal=caMag+caHorsAgence;
    const pctHorsAgence=caTotalCanal>0?Math.round(caHorsAgence/caTotalCanal*100):null;
    // Nomades cross-agence
    const nbNomades=(_S.reseauNomades||[]).length;
    // Plan d'action familles
    const actionPlan=_S.benchLists.obsActionPlan||[];
    // ── Build prose ─────────────────────────────────────────────
    const hr='─'.repeat(52);
    const L=[];
    L.push(`REPORTING ${agence} — ${periodLabel}`);
    L.push(hr);L.push('');
    // ── FACTEURS DE SUCCÈS ───────────────────────────────────────
    L.push('FACTEURS DE SUCCÈS');L.push('');
    // Para 1 : équation commerciale + taux de disponibilité intégré
    {
      const parts=[];
      if(ok(caPDVTotal)&&caPDVTotal>0){
        let p=`La période se clôture avec un CA Magasin de ${formatEuro(caPDVTotal)}`;
        if(nbClientsPDV>0){
          p+=`, porté par ${nbClientsPDV.toLocaleString('fr')} client${nbClientsPDV!==1?'s':''} actifs en magasin`;
          const details=[];
          if(ok(freqPDV))details.push(`fréquence de ${freqPDV} passage${freqPDV!==1?'s':''}/client`);
          if(ok(caParClient))details.push(`CA/client ${caParClient.toLocaleString('fr')} €`);
          if(ok(txMarge)&&txMarge>0){const vmbStr=vmbPDV>0?` pour une VMB de ${formatEuro(Math.round(vmbPDV))}`:'';details.push(`taux de marge ${txMarge.toFixed(2)}%${vmbStr}`);}
          if(details.length)p+=` (${details.join(', ')})`;
        }
        p+='.';
        if(ok(srNum)){
          const qualif=srNum>=95?'excellent':'solide';
          p+=` Le taux de disponibilité est ${qualif} à ${srNum}% avec ${rupturesList.length} rupture${rupturesList.length!==1?'s':''} en cours.`;
        }
        parts.push(p);
      } else if(ok(srNum)){
        parts.push(`Taux de disponibilité : ${srNum}% — ${rupturesList.length} rupture${rupturesList.length!==1?'s':''} en cours.`);
      }
      if(parts.length)L.push(parts.join(' '));
    }
    // Para 2 : réseau / benchmark
    if(hasBench){
      const pdm=kpis.mine&&ok(kpis.mine.pdm)?kpis.mine.pdm:null;
      let p='Côté réseau';
      if(ok(pdm))p+=`, notre PDM bassin est à ${pdm}%`;
      p+='.';
      if(win3.length>0){
        const w3=win3.map(f=>`${f.fam} (+${Math.round(f.ecartPct)}% vs médiane)`).join(', ');
        p+=` Nos forces se situent sur ${w3}.`;
      } else {
        p+=' Aucune famille n\'est en sur-performance vs le bassin.';
      }
      L.push('');L.push(p);
    }
    // Position réseau
    if(reseauRank!==null&&reseauTotal!==null){
      let rp=`Nous nous classons ${reseauRank}${reseauRank===1?'er':'e'} sur ${reseauTotal} agences du réseau`;
      const mxMarge=kpis&&ok(kpis.mine?.txMarge)?kpis.mine.txMarge:null;
      const medMarge=kpis&&ok(kpis.compared?.txMarge)?kpis.compared.txMarge:null;
      if(ok(mxMarge)&&ok(medMarge)){if(mxMarge>=medMarge)rp+=`, avec un taux de marge au-dessus de la médiane (${mxMarge.toFixed(2)}% vs ${medMarge.toFixed(2)}%)`;}
      if(ok(pdmBassin))rp+=`. Notre couverture bassin est à ${Math.round(pdmBassin)}%, principal levier d'assortiment`;
      L.push(rp+'.');
    }
    L.push('');
    // ── POINTS D'AMÉLIORATION ────────────────────────────────────
    L.push("POINTS D'AMÉLIORATION");L.push('');
    // Stock
    {
      const parts=[];
      if(dormantsList.length>0){
        let s=`Stock : ${dormantsList.length.toLocaleString('fr')} dormant${dormantsList.length!==1?'s':''} à traiter`;
        if(dormantVal>0)s+=` pour ${formatEuro(dormantVal)} immobilisés`;
        s+='.';
        parts.push(s);
      }
      if(manquants.length>0){
        let m=`${manquants.length.toLocaleString('fr')} article${manquants.length!==1?'s':''} vendus par le réseau ${manquants.length>1?'sont absents':'est absent'} de notre rayon`;
        if(manquantsHF>0)m+=`, dont ${manquantsHF} en forte rotation`;
        m+=' — des opportunités de référencement à étudier.';
        parts.push(m);
      }
      if(parts.length)L.push(parts.join(' '));
    }
    // Marge sous médiane réseau
    if(hasBench&&kpis&&ok(kpis.mine&&kpis.mine.txMarge)&&ok(kpis.compared&&kpis.compared.txMarge)&&kpis.mine.txMarge<kpis.compared.txMarge){
      const potVMB=Math.round((kpis.compared.txMarge-kpis.mine.txMarge)/100*caPDVTotal);
      L.push(`Marge : taux de marge à ${kpis.mine.txMarge.toFixed(2)}% vs médiane réseau ${kpis.compared.txMarge.toFixed(2)}% — potentiel de +${formatEuro(potVMB)} de VMB.`);
    }
    // Clients silencieux
    if(silencieuxCount>0){
      let p=`Clients : ${silencieuxCount.toLocaleString('fr')} client${silencieuxCount!==1?'s':''} régulier${silencieuxCount!==1?'s':''} n'ont pas commandé depuis 30 à 60 jours`;
      if(ok(silencieuxCA)&&silencieuxCA>0)p+=` (${formatEuro(silencieuxCA)} de CA Magasin cumulé)`;
      p+='.';
      const silTop5=silencieuxList.slice(0,5);
      if(silTop5.length){const silFmt=silTop5.map(c=>`${c.nom} (${formatEuro(c.caPDV)})`).join(', ');p+=` Priorités de relance : ${silFmt}.`;}
      L.push(p);
      if(nbNomades>0){L.push(`Par ailleurs, ${nbNomades.toLocaleString('fr')} client${nbNomades!==1?'s':''} de ce portefeuille achète${nbNomades!==1?'nt':''} également dans d'autres agences du réseau — un potentiel de consolidation à exploiter.`);}
    }
    // Familles en retrait
    if(lose3.length>0){
      const l3=lose3.map(f=>`${f.fam} (${Math.round(f.ecartPct)}%)`).join(', ');
      L.push(`Familles en retrait vs le réseau : ${l3} — à investiguer avec le diagnostic Radar.`);
    }
    L.push('');
    // ── PERSPECTIVES ─────────────────────────────────────────────
    L.push('PERSPECTIVES');L.push('');
    {
      const parts=[];
      if(clientsACapter>0){
        parts.push(`${clientsACapter.toLocaleString('fr')} client${clientsACapter!==1?'s':''} actif${clientsACapter!==1?'s':''} Legallais ne passe${clientsACapter!==1?'nt':''} pas en agence — principal levier de croissance.`);
      }
      parts.push(`Période analysée : ${periodHuman||periodLabel} sur ${DataStore.finalData.length.toLocaleString('fr')} articles (${fichiersList.length} fichier${fichiersList.length!==1?'s':''} : ${fichiersList.join(', ')}).`);
      L.push(parts.join(' '));
    }
    // Omnicanalité
    if(ok(pctHorsAgence)&&pctHorsAgence>0){
      const relais=[];
      if(caWeb>0)relais.push(`Web (${formatEuro(Math.round(caWeb))})`);
      if(caRep>0)relais.push(`Représentant (${formatEuro(Math.round(caRep))})`);
      if(caDcs>0)relais.push(`DCS (${formatEuro(Math.round(caDcs))})`);
      let op=`${pctHorsAgence}% de notre CA identifié passe hors agence`;
      if(relais.length)op+=` — ${relais.join(', ')} constituent des relais à consolider`;
      L.push(op+'.');
    }
    // ── PLAN D'ACTION ─────────────────────────────────────────────
    if(actionPlan.length>0){
      L.push('');
      L.push("PLAN D'ACTION");L.push('');
      if(actionPlan.length>=3){
        const [a1,a2,a3]=actionPlan;
        L.push(`Trois familles concentrent l'essentiel du potentiel non capté : ${a1.fam} (${formatEuro(a1.caPotentiel)} identifiés), ${a2.fam} (${formatEuro(a2.caPotentiel)}) et ${a3.fam} (${formatEuro(a3.caPotentiel)}).`);
      }else if(actionPlan.length===2){
        const [a1,a2]=actionPlan;
        L.push(`Deux familles concentrent l'essentiel du potentiel non capté : ${a1.fam} (${formatEuro(a1.caPotentiel)} identifiés) et ${a2.fam} (${formatEuro(a2.caPotentiel)}).`);
      }else{
        L.push(`La famille ${actionPlan[0].fam} concentre l'essentiel du potentiel non capté avec ${formatEuro(actionPlan[0].caPotentiel)} identifiés.`);
      }
    }
    return L.join('\n');
  }
  // ── Cockpit Client (Urgences / Développer / Fidéliser) ──
  function _cockpitToggleFullList(id){
    const el=document.getElementById(id);if(!el)return;
    const hidden=el.style.display==='none'||!el.style.display;
    el.style.display=hidden?'block':'none';
    const btn=document.getElementById(id+'-btn');if(btn)btn.textContent=hidden?'▲ Masquer la liste complète':'▼ Voir tous les clients →';
  }
  function _cockpitToggleSection(listId){
    const body=document.getElementById(listId+'-body');const arrow=document.getElementById(listId+'-arrow');if(!body)return;
    const isOpen=body.style.display!=='none';body.style.display=isOpen?'none':'';if(arrow)arrow.textContent=isOpen?'▶':'▼';
  }
  function _populateTerrFamilleFilter(){
    const sel=document.getElementById('terrFamilleFilter');if(!sel||!DataStore.finalData.length)return;
    const fams=[...new Set(DataStore.finalData.map(r=>r.famille).filter(Boolean))].sort((a,b)=>famLib(a).localeCompare(famLib(b)));
    const cur=sel.value;
    sel.innerHTML='<option value="">Toutes familles</option>';
    fams.forEach(f=>{const o=document.createElement('option');o.value=f;o.textContent=famLabel(f);sel.appendChild(o);});
    if(cur)sel.value=cur;
  }

  function _setPDVCanalFilter(val){_S.pdvCanalFilter=val;_buildDegradedCockpit();}

  function _buildDegradedCockpit(){
    const el=document.getElementById('terrDegradedBlock');if(!el)return;
    if(!DataStore.finalData.length && !_S.ventesClientArticle.size)return;
    _populateTerrFamilleFilter();
    const qClient=((document.getElementById('terrClientSearch')||{}).value||'').toLowerCase().trim();
    const selFam=((document.getElementById('terrFamilleFilter')||{}).value||'').trim();
    const _today=new Date();
    const famMap=new Map(DataStore.finalData.map(r=>[r.code,r.famille]));
    // [V3.2] Canal + commercial depuis DataStore.byContext() — API unifiée
    const {activeFilters:{canal:_terrCanalFilter,commercial:_terrComFilter}}=DataStore.byContext();
    const _terrComSet=_terrComFilter?(_S.clientsByCommercial.get(_terrComFilter)||new Set()):null;
    const _isNonMagasin=_terrCanalFilter&&_terrCanalFilter!=='MAGASIN';
    let _clientArtMap;
    if(_isNonMagasin){
      // Canaux hors MAGASIN : utiliser ventesClientHorsMagasin directement (v.sumCA = total non-MAGASIN)
      // Ne pas filtrer par articleCanalCA — ce filtre pouvait vider _clientArtMap si articleCanalCA
      // n'était pas peuplé (ex. lignes sans N° commande), ce qui faisait disparaître tout le bloc.
      _clientArtMap=new Map();
      for(const[cc,artMap] of _S.ventesClientHorsMagasin.entries()){
        const filtered=new Map();
        for(const[artCode,v] of artMap.entries()){
          if(v.sumCA>0)filtered.set(artCode,{sumCA:v.sumCA,sumCAPrelevee:v.sumCAPrelevee||0,sumCAAll:v.sumCA,sumPrelevee:v.sumPrelevee||0,countBL:v.countBL||0});
        }
        if(filtered.size>0)_clientArtMap.set(cc,filtered);
      }
    }else{
      _clientArtMap=DataStore.ventesClientArticle;
    }
    // Silencieux >30j — MAGASIN uniquement (clientLastOrder est MAGASIN-based)
    const silencieux=[];
    if(!_isNonMagasin){
      const _minC2=_S.consommePeriodMinFull||_S.consommePeriodMin;
      for(const[cc,lastDate] of _S.clientLastOrder.entries()){
        if(_minC2&&lastDate<_minC2)continue;
        const d=daysBetween(lastDate,_today);if(d<=30||d>60)continue;
        const artMap=_clientArtMap.get(cc);if(!artMap)continue;
        let ca=0;for(const[artCode,v] of artMap.entries())if(!selFam||famMap.get(artCode)===selFam)ca+=(v.sumCAAll||v.sumCA||0);
        if(ca<=0)continue;
        const nom=_S.clientNomLookup[cc]||cc;
        if(qClient&&!matchQuery(qClient,cc,nom))continue;
        silencieux.push({cc,nom,ca,d});
      }
      silencieux.sort((a,b)=>a.d-b.d);
    }
    const hasChal=_S.chalandiseReady;
    const banner=`<div class="mb-3 p-3 i-caution-bg border b-light rounded-lg text-xs c-caution">💡 <strong>Chargez la Zone de Chalandise</strong> pour débloquer l'analyse métier, la captation et les prospects.</div>`;
    let html=hasChal?'':banner;
    if(!hasChal&&silencieux.length){
      const rows=silencieux.slice(0,20).map(c=>{const cls=c.d>45?'c-danger':'c-caution';return`<tr class="border-t b-light"><td class="py-1 px-2 font-mono text-[10px] t-disabled">${c.cc}</td><td class="py-1 px-2 text-[11px] font-semibold">${c.nom}${_unikLink(c.cc)}</td><td class="py-1 px-2 text-right font-bold c-ok text-[11px]">${formatEuro(c.ca)}</td><td class="py-1 px-2 text-center font-bold text-[11px] ${cls}">${c.d}j</td></tr>`;}).join('');
      html+=`<div class="i-danger-bg rounded-xl border-t-4 border-rose-500 mb-3 overflow-hidden"><div class="flex items-center gap-2 p-3 border-b b-light"><span>🚨</span><h4 class="font-extrabold text-sm flex-1">Clients silencieux <span class="badge bg-rose-500 text-white ml-1">${silencieux.length}</span></h4></div><div class="overflow-x-auto"><table class="min-w-full text-xs"><thead class="s-card-alt t-secondary font-bold text-[10px]"><tr><th class="py-1.5 px-2 text-left">Code</th><th class="py-1.5 px-2 text-left">Nom</th><th class="py-1.5 px-2 text-right">CA Magasin</th><th class="py-1.5 px-2 text-center">Sans commande</th></tr></thead><tbody>${rows}</tbody></table>${silencieux.length>20?`<p class="text-[10px] t-disabled px-3 py-1.5">… et ${silencieux.length-20} autres</p>`:''}</div></div>`;
    }
    if(!hasChal&&!silencieux.length)html+=`<p class="text-center t-disabled text-sm py-8">Aucun client trouvé${qClient?' pour "'+qClient+'"':''}.</p>`;
    el.innerHTML=html;
  }

  function _buildCockpitClient(){
    const el=document.getElementById('terrCockpitClient');if(!el)return;
    const silEl=document.getElementById('terrSilencieux');
    const perduEl=document.getElementById('terrPerdus');
    const capEl=document.getElementById('terrACapter');
    if(!_S.chalandiseReady){el.classList.add('hidden');if(silEl)silEl.innerHTML='';if(perduEl)perduEl.innerHTML='';if(capEl)capEl.innerHTML='';return;}
    el.classList.remove('hidden');
    // ── Collect 3 categories from chalandise ──
    const silencieux=[],perdus=[],jamaisVenus=[];
    const _today=new Date();
    const {activeFilters:{commercial:_cockpitCom}}=DataStore.byContext();
    const _cockpitComSet=_cockpitCom?(_S.clientsByCommercial.get(_cockpitCom)||new Set()):null;
    // ── Canal-aware date source ──
    const _canal=_S._globalCanal||'';
    const _useByCanal=_canal&&_canal!=='MAGASIN'; // specific non-MAGASIN canal
    const _useMagOnly=_canal==='MAGASIN';
    // _useByCanal=false & _useMagOnly=false → '' (Tous) → clientLastOrderAll
    for(const[cc,info] of _S.chalandiseData.entries()){
      if(!_clientPassesFilters(info,cc))continue;
      if(!_S._includePerdu24m&&_isPerdu24plus(info))continue;
      if(!_passesClientCrossFilter(cc))continue;
      if(_S.excludedClients.has(cc))continue;
      if(_cockpitComSet&&!_cockpitComSet.has(cc))continue;
      if(!_passesAllFilters(cc))continue;
      const clientArtData=(_S.ventesClientArticleFull.size?_S.ventesClientArticleFull:_S.ventesClientArticle).get(cc);
      const caPDVN=clientArtData?[...clientArtData.values()].reduce((s,d)=>s+(d.sumCAAll||d.sumCA||0),0):0;
      // Pick last order date based on canal filter
      let lastOrder=null;
      if(_useMagOnly){
        lastOrder=_S.clientLastOrder.get(cc)||null;
      }else if(_useByCanal){
        const cMap=_S.clientLastOrderByCanal.get(cc);
        lastOrder=cMap?cMap.get(_canal)||null:null;
      }else{
        const allInfo=_S.clientLastOrderAll.get(cc);
        lastOrder=allInfo?allInfo.date:null;
      }
      const _minC3=_S.consommePeriodMinFull||_S.consommePeriodMin;
      const _lastOrderValid=lastOrder&&(!_minC3||lastOrder>=_minC3);
      const daysSince=_lastOrderValid?daysBetween(lastOrder,_today):null;
      const caLeg=info.ca2025||0;
      const c={code:cc,nom:info.nom||'',metier:info.metier||'',commercial:info.commercial||'',classification:info.classification||'',ca2025:caLeg,caPDVN,ville:info.ville||'',_strat:_isMetierStrategique(info.metier),_daysSince:daysSince,_lastOrderDate:lastOrder};
      // 1. Silencieux : 30-60j sans commande sur le canal filtré
      if(daysSince!==null&&daysSince>30&&daysSince<=60&&(caPDVN>0||_useByCanal)){silencieux.push(c);continue;}
      // 2. Perdus : >60j sans commande sur le canal filtré
      if(daysSince!==null&&daysSince>60&&(caPDVN>0||_useByCanal)){perdus.push(c);continue;}
      // 3. Jamais venus en PDV : client zone non capté (absent de clientsMagasin)
      if(!_useByCanal&&!_S.clientsMagasin.has(cc)){jamaisVenus.push(c);}
    }
    silencieux.sort((a,b)=>(b.caPDVN||0)-(a.caPDVN||0));
    perdus.sort((a,b)=>(a._daysSince||0)-(b._daysSince||0)||(b.caPDVN||0)-(a.caPDVN||0));
    jamaisVenus.sort((a,b)=>(b.ca2025||0)-(a.ca2025||0));
    _S._cockpitExportData={silencieux,perdus,jamaisVenus};
    // ── Helpers ──
    const filterActive=_S._selectedDepts.size||_S._selectedClassifs.size||_S._selectedStatuts.size||_S._selectedActivitesPDV.size||_S._selectedDirections.size||_S._selectedUnivers.size||_S._selectedCommercial||_S._selectedMetier||_S._filterStrategiqueOnly;
    const emptyMsg=filterActive?'Aucun client ne correspond aux filtres':'Aucun client dans cette catégorie';
    function _clientCard(c,reason,scoreColor){
      const caLeg=c.ca2025>0?formatEuro(c.ca2025):'—';
      const horsMag=_S.ventesClientHorsMagasin.get(c.code);
      const _icones=[horsMag?.size>0?'🌐':'',c._strat?'⭐':''].filter(Boolean).join(' ');
      const lastOrderFmt=c._lastOrderDate?`Dernière commande : ${fmtDate(c._lastOrderDate)}`:'';
      const daysBadge=c._daysSince>30?`<span class="text-[9px] font-bold px-1.5 py-0.5 rounded-full i-danger-bg c-danger">⏰ ${c._daysSince}j</span>`:'';
      return`<div class="relative p-3 rounded-lg border s-card hover:i-info-bg cursor-pointer" data-cc="${escapeHtml(c.code)}" onclick="openClient360(this.dataset.cc,'cockpit')"><div><div class="flex items-center flex-wrap gap-1.5"><span class="font-bold text-sm">${escapeHtml(c.nom)}</span><span class="font-bold text-[11px] t-inverse-muted">${caLeg}</span>${daysBadge}${_icones?`<span class="text-[11px]">${_icones}</span>`:''}</div><p class="text-[11px] ${scoreColor} font-bold mt-1">→ ${escapeHtml(reason)}</p><p class="text-[10px] t-tertiary mt-1">${[lastOrderFmt,c.commercial?`Commercial : ${escapeHtml(c.commercial)}`:''].filter(Boolean).join(' · ')}</p></div></div>`;
    }
    function _fullTable(clients,caField,listId){
      const usePDV=caField==='caPDVN';
      let t=`<div id="${listId}" style="display:none" class="mt-3 overflow-x-auto"><table class="min-w-full text-[11px]"><thead class="sticky top-0 s-card/90 font-bold t-secondary text-[10px]"><tr><th class="py-1.5 px-2 text-left">Client</th><th class="py-1.5 px-2 text-left">Commercial</th><th class="py-1.5 px-2 text-right">${usePDV?'CA Magasin':'CA Legallais'}</th><th class="py-1.5 px-2 text-left">Ville</th></tr></thead><tbody>`;
      for(const c of clients){const caVal=usePDV?c.caPDVN:c.ca2025;const caColor=caVal>0?(usePDV?'c-ok':'c-caution'):'t-disabled';t+=`<tr class="border-t b-default hover:s-card/50 cursor-pointer" data-cc="${escapeHtml(c.code)}" onclick="openClient360(this.dataset.cc,'cockpit')"><td class="py-1 px-2"><span class="font-mono t-disabled text-[10px]">${escapeHtml(c.code)}</span> <span class="font-semibold">${escapeHtml(c.nom)}</span>${c._strat?' <span class="c-caution text-[10px]" title="Métier stratégique">⭐</span>':''}</td><td class="py-1 px-2 text-[10px] t-tertiary">${c.commercial?escapeHtml(c.commercial):'—'}</td><td class="py-1 px-2 text-right font-bold ${caColor}">${caVal>0?formatEuro(caVal):'—'}</td><td class="py-1 px-2 text-[10px] t-tertiary">${c.ville?escapeHtml(c.ville):'—'}</td></tr>`;}
      t+=`</tbody></table></div>`;return t;
    }
    function renderBlock(title,emoji,bgColor,borderColor,scoreColor,clients,caField,raisonFn,listId,topN=10){
      const total=clients.length;
      const isOpen=listId==='cockpit-sil-full';
      const arrow=isOpen?'▼':'▶';
      const bodyDisplay=isOpen?'':'display:none';
      if(!total)return`<div class="${bgColor} rounded-xl border-t-4 ${borderColor}"><div class="flex items-center gap-2 p-4 pb-3 cursor-pointer select-none" onclick="_cockpitToggleSection('${listId}')"><span id="${listId}-arrow" class="text-[10px] t-disabled w-3">${arrow}</span><span class="text-lg">${emoji}</span><h4 class="font-extrabold text-sm">${title}</h4><span class="badge s-hover t-secondary">0</span></div><div id="${listId}-body" style="${bodyDisplay}"><p class="text-xs t-disabled px-4 pb-4">${emptyMsg}</p></div></div>`;
      let html=`<div class="${bgColor} rounded-xl border-t-4 ${borderColor}">`;
      html+=`<div class="flex items-center gap-2 p-4 pb-1 flex-wrap cursor-pointer select-none" onclick="_cockpitToggleSection('${listId}')"><span id="${listId}-arrow" class="text-[10px] t-disabled w-3">${arrow}</span><span class="text-lg">${emoji}</span><h4 class="font-extrabold text-sm">${title}</h4><span class="badge ${borderColor.replace('border-','bg-')} text-white">${total}</span><button onclick="event.stopPropagation();exportCockpitCSV('${listId}')" class="ml-auto text-[10px] s-hover hover:s-hover t-primary py-1 px-2 rounded font-bold border">📥 CSV</button></div>`;
      html+=`<div id="${listId}-body" style="${bodyDisplay}">`;
      html+=`<div class="space-y-2 px-4 py-3">`;
      for(const c of clients.slice(0,topN))html+=_clientCard(c,raisonFn(c),scoreColor);
      html+=`</div>`;
      if(total>topN){html+=`<div class="px-4 pb-2"><button id="${listId}-btn" class="mt-3 text-[11px] font-bold c-action hover:underline" onclick="_cockpitToggleFullList('${listId}')">▼ Voir tous les ${total} clients →</button></div>`;html+=_fullTable(clients,caField,listId);}
      html+=`</div></div>`;
      return html;
    }
    // ── Reason functions (canal-aware labels) ──
    const _canalLabel=_useMagOnly?'Magasin':_useByCanal?_canal:'tous canaux';
    function _silRaison(c){
      const caPDVFmt=c.caPDVN>0?formatEuro(c.caPDVN):'—';
      return c._daysSince>45?`Silencieux depuis ${c._daysSince}j — à relancer rapidement (${caPDVFmt} CA Magasin)`:`${c._daysSince}j sans commande — à surveiller (${caPDVFmt} CA Magasin)`;
    }
    function _perduRaison(c){return`${c._daysSince}j sans commande ${_canalLabel} — ${c.caPDVN>0?formatEuro(c.caPDVN)+' de CA historique':'ancien client à reconquérir'}`;}
    function _capRaison(c){return c.ca2025>0?`CA Legallais ${formatEuro(c.ca2025)} — jamais passé au comptoir`:`Client zone — jamais passé au comptoir`;}
    // ── Render into 3 separate blocks ──
    const _silTitle=`⏰ Silencieux — 30 à 60 jours sans commande ${_canalLabel}`;
    const _perduTitle=`🔴 Perdus — Plus de 60 jours sans commande ${_canalLabel}`;
    if(silEl)silEl.innerHTML=renderBlock(_silTitle,'⏰','i-caution-bg','border-amber-500','c-caution',silencieux,'caPDVN',_silRaison,'cockpit-sil-full');
    if(perduEl)perduEl.innerHTML=renderBlock(_perduTitle,'🔴','i-danger-bg','border-rose-500','c-danger',perdus,'caPDVN',_perduRaison,'cockpit-perdu-full');
    if(capEl){if(_useByCanal){capEl.innerHTML='';}else{capEl.innerHTML=renderBlock('🎯 À capter — Jamais venus en agence','🎯','i-info-bg','border-blue-500','c-action',jamaisVenus,'ca2025',_capRaison,'cockpit-cap-full');}}
    // terrCockpitClient now unused as wrapper — hide it
    el.classList.add('hidden');
  }
  function exportTop5CSV(){
    const top5=_S._top5Semaine||[];
    if(!top5.length){showToast('Aucun client dans le top 5','warning');return;}
    const SEP=';';
    const lines=['\uFEFFNom;CA Legallais;Dernière commande;Action;Commercial'];
    for(const c of top5){const lastFmt=c._lastOrderDate?fmtDate(c._lastOrderDate):'—';lines.push([c.nom,c.ca2025>0?c.ca2025:'—',lastFmt,c._top5reason,c.commercial||'—'].join(SEP));}
    const blob=new Blob([lines.join('\n')],{type:'text/csv;charset=utf-8;'});
    const link=document.createElement('a');link.href=URL.createObjectURL(blob);link.download=`PRISME_MaSemaine_${_S.selectedMyStore}_${new Date().toISOString().slice(0,10)}.csv`;document.body.appendChild(link);link.click();document.body.removeChild(link);
  }
  window.exportTop5CSV=exportTop5CSV;
  function _setCrossFilter(status){
    _S._selectedCrossStatus=status;
    _buildChalandiseOverview();
  }

  window._setClientView=function(view){
    _S._clientView=view;
    _S._showHorsZone=(view==='horszone');
    _S._showHorsAgence=(view==='multicanaux');
    _S._selectedCrossStatus=view==='potentiels'?'potentiel':view==='captes'?'capte':'';
    _S._clientsPDVPage=0;
    document.querySelectorAll('.client-view-btn').forEach(b=>{
      const active=b.dataset.view===view;
      b.classList.toggle('s-panel-inner',active);b.classList.toggle('t-inverse',active);b.classList.toggle('b-dark',active);
      b.classList.toggle('s-card',!active);b.classList.toggle('t-primary',!active);b.classList.toggle('b-default',!active);
    });
    // Capturer l'état ouvert/fermé du panneau Top PDV avant re-render
    const _det=document.querySelector('#terrTopPDV details');
    if(_det)_S._topPDVOpen=_det.open;
    _S._tabRendered&&(_S._tabRendered['territoire']=false);
    renderTerritoireTab();
  };


  // ── Cockpit Client CSV Export ──
  function _cockpitRowCSV(cat,c,exclu,exclusionReason){
    const SEP=';';
    const caLeg=c.ca2025>0?c.ca2025.toFixed(2).replace('.',','):'—';
    const caPDV=c.caPDVN>0?c.caPDVN.toFixed(2).replace('.',','):'—';
    const dernCmd=c._lastOrderDate?c._lastOrderDate.toLocaleDateString('fr-FR'):'—';
    const jours=c._daysSince!=null?c._daysSince:'—';
    const statut=_clientStatusText(c.code,c);
    const raison=(c._reason||'').replace(/"/g,'""');
    return[cat,c.code,`"${(c.nom||'').replace(/"/g,'""')}"`,statut,`"${_normalizeClassif(c.classification)}"`,`"${(c.metier||'').replace(/"/g,'""')}"`,`"${(c.commercial||'').replace(/"/g,'""')}"`,`"${(c.ville||'').replace(/"/g,'""')}"`,caLeg,caPDV,dernCmd,jours,c._score,`"${raison}"`,exclu||'Non',`"${(exclusionReason||'').replace(/"/g,'""')}"`].join(SEP);
  }
  function _downloadCockpitCSV(rows,filename,label){
    const header='\uFEFFCatégorie;Code;Nom;Statut;Classification;Métier;Commercial;Ville;CA Legallais;CA Magasin;Dernière commande;Jours sans commande;Score;Raison;Exclu;Raison exclusion';
    const blob=new Blob([[header,...rows].join('\n')],{type:'text/csv;charset=utf-8;'});
    const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=filename;document.body.appendChild(a);a.click();document.body.removeChild(a);URL.revokeObjectURL(a.href);
    showToast(`📥 CSV ${label} — ${rows.length} clients`,'success');
  }
  function exportCockpitCSV(catKey){
    if(!_S._cockpitExportData){showToast('⚠️ Aucune donnée cockpit','warning');return;}
    const map={'cockpit-sil-full':['Silencieux',_S._cockpitExportData.silencieux],'cockpit-perdu-full':['Perdus',_S._cockpitExportData.perdus],'cockpit-cap-full':['À capter',_S._cockpitExportData.jamaisVenus]};
    const entry=map[catKey];if(!entry)return;
    const[catLabel,clients]=entry;
    const rows=clients.map(c=>_cockpitRowCSV(catLabel,c,'Non',''));
    // Include excluded clients for this category
    for(const[cc,v] of _S.excludedClients.entries()){if(v.category===catKey&&v.clientData)rows.push(_cockpitRowCSV(catLabel,v.clientData,'Oui',v.reason));}
    const date=new Date().toISOString().slice(0,10);
    _downloadCockpitCSV(rows,`PRISME_${_S.selectedMyStore||'AGENCE'}_Clients_${catLabel}_${date}.csv`,catLabel);
  }
  function exportCockpitCSVAll(){
    if(!_S._cockpitExportData){showToast('⚠️ Aucune donnée cockpit','warning');return;}
    const catMap={'cockpit-sil-full':['Silencieux',_S._cockpitExportData.silencieux],'cockpit-perdu-full':['Perdus',_S._cockpitExportData.perdus],'cockpit-cap-full':['À capter',_S._cockpitExportData.jamaisVenus]};
    const rows=[];
    for(const[catKey,[catLabel,list]] of Object.entries(catMap)){for(const c of list)rows.push(_cockpitRowCSV(catLabel,c,'Non',''));for(const[cc,v] of _S.excludedClients.entries()){if(v.category===catKey&&v.clientData)rows.push(_cockpitRowCSV(catLabel,v.clientData,'Oui',v.reason));}}
    const date=new Date().toISOString().slice(0,10);
    _downloadCockpitCSV(rows,`PRISME_${_S.selectedMyStore||'AGENCE'}_Clients_${date}.csv`,'Toutes catégories');
  }

  // ── Client exclusion (hide from cockpit) ──
  function _showExcludePrompt(cc,encodedNom,catKey){
    const card=document.getElementById('cockpit-card-'+cc);if(!card)return;
    const existing=card.querySelector('.excl-prompt');if(existing){existing.remove();return;}
    const nom=decodeURIComponent(encodedNom);
    const div=document.createElement('div');div.className='excl-prompt mt-2 pt-2 border-t b-default flex items-center gap-2 flex-wrap';
    div.innerHTML=`<span class="text-[10px] t-tertiary">Raison :</span><select id="excl-sel-${cc}" class="text-[10px] border rounded p-1"><option value="Pas pertinent">Pas pertinent</option><option value="Hors cible">Hors cible</option><option value="Déjà traité">Déjà traité</option><option value="Autre">Autre</option></select><button onclick="_confirmExclude('${cc}','${encodeURIComponent(nom)}','${catKey}')" class="text-[10px] i-danger-bg c-danger px-2 py-1 rounded font-bold">Masquer</button><button onclick="this.closest('.excl-prompt').remove()" class="text-[10px] t-disabled hover:t-secondary px-1">Annuler</button>`;
    card.appendChild(div);
  }
  function _confirmExclude(cc,encodedNom,catKey){
    const nom=decodeURIComponent(encodedNom);
    const sel=document.getElementById('excl-sel-'+cc);const reason=sel?sel.value:'Pas pertinent';
    const allClients=[...(_S._cockpitExportData?.silencieux||[]),...(_S._cockpitExportData?.urgences||[]),...(_S._cockpitExportData?.developper||[]),...(_S._cockpitExportData?.fideliser||[])];
    const clientData=allClients.find(c=>c.code===cc)||{code:cc,nom};
    _S.excludedClients.set(cc,{reason,date:formatLocalYMD(new Date()),by:_S.selectedMyStore||'',category:catKey,nom,clientData});
    _saveExclusions();
    showToast(`👁️ ${nom} masqué — ${reason}`,'info');
    _buildCockpitClient();
  }
  function _unexcludeClient(cc){
    _S.excludedClients.delete(cc);
    _saveExclusions();
    _buildCockpitClient();
  }
  function _unexcludeAll(catKey){
    for(const[cc,v] of _S.excludedClients.entries()){if(v.category===catKey)_S.excludedClients.delete(cc);}
    _saveExclusions();
    _buildCockpitClient();
  }
  function _toggleExcludedList(id){
    const el=document.getElementById(id);if(!el)return;
    el.style.display=el.style.display==='none'?'block':'none';
  }
  function exportExclusionsJSON(){
    if(!_S.excludedClients.size){showToast('Aucune exclusion à exporter','info');return;}
    const data={magasin:_S.selectedMyStore||'AGENCE',date:new Date().toISOString().slice(0,10),exclusions:[..._S.excludedClients.entries()].map(([cc,v])=>({code:cc,nom:v.nom||cc,reason:v.reason,date:v.date,category:v.category}))};
    const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});
    const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`PRISME_${data.magasin}_exclusions.json`;document.body.appendChild(a);a.click();document.body.removeChild(a);URL.revokeObjectURL(a.href);
    showToast(`📤 ${data.exclusions.length} exclusions exportées`,'success');
  }
  function importExclusionsJSON(input){
    const file=input.files[0];if(!file)return;
    const reader=new FileReader();
    reader.onload=(e)=>{
      try{
        const data=JSON.parse(e.target.result);
        if(!data.exclusions||!Array.isArray(data.exclusions))throw new Error('Format invalide');
        let count=0;
        const allClients=[...(_S._cockpitExportData?.silencieux||[]),...(_S._cockpitExportData?.urgences||[]),...(_S._cockpitExportData?.developper||[]),...(_S._cockpitExportData?.fideliser||[])];
        for(const ex of data.exclusions){
          if(!ex.code)continue;
          const clientData=allClients.find(c=>c.code===ex.code)||{code:ex.code,nom:ex.nom||ex.code};
          _S.excludedClients.set(ex.code,{reason:ex.reason||'Importé',date:ex.date||'',by:ex.by||'',category:ex.category||'cockpit-urg-full',nom:ex.nom||ex.code,clientData});
          count++;
        }
        input.value='';
        _saveExclusions();
        showToast(`✅ ${count} exclusions importées`,'success');
        _buildCockpitClient();
      }catch(err){showToast('⚠️ Erreur import : '+err.message,'error');}
    };
    reader.readAsText(file);
  }

  function _toggleHorsMagasin(btn, cc) {
    const existingId = `hors-mag-${cc}`;
    const existing = document.getElementById(existingId);
    if (existing) { existing.remove(); return; }

    const artMap = _S.ventesClientHorsMagasin.get(cc);
    if (!artMap || !artMap.size) return;

    const CANAL_LABELS = { INTERNET:'🌐 Web', REPRESENTANT:'🤝 Représentant', DCS:'🏢 DCS' };

    // Filtrer articles déjà vendus en MAGASIN à ce client
    const magasinArts = DataStore.ventesClientArticle.get(cc) || new Map();

    let rows = '';
    for (const [code, data] of [...artMap.entries()].sort((a,b) => b[1].sumCA - a[1].sumCA)) {
      const lib = (_S.libelleLookup[code] || code).replace(/^\d{6} - /, '');
      const dejaVendu = magasinArts.has(code);
      const canalLabel = CANAL_LABELS[data.canal] || data.canal;
      rows += `<tr class="border-b b-light ${dejaVendu ? 'opacity-50' : 'hover:i-info-bg'}">
        <td class="py-1 px-2 font-mono text-[10px] t-tertiary">${code}</td>
        <td class="py-1 px-2 text-[11px] font-semibold">${lib}</td>
        <td class="py-1 px-2 text-[10px]">${canalLabel}</td>
        <td class="py-1 px-2 text-right text-[11px] font-bold ${data.sumCA > 0 ? 'c-action' : 't-disabled'}">${data.sumCA > 0 ? formatEuro(data.sumCA) : '—'}</td>
        <td class="py-1 px-2 text-center text-[10px] ${dejaVendu ? 'c-ok' : 'c-caution'}">${dejaVendu ? '✅ En agence' : '⚠️ Pas en agence'}</td>
      </tr>`;
    }

    const panel = document.createElement('div');
    panel.id = existingId;
    panel.className = 'mt-2 s-card-alt rounded-lg border overflow-hidden';
    panel.innerHTML = `
      <div class="px-3 py-2 border-b flex items-center justify-between">
        <p class="text-[11px] font-bold t-primary">🌐 Commandes hors agence — ${artMap.size} article${artMap.size > 1 ? 's' : ''}</p>
        <span class="text-[10px] t-disabled">⚠️ = jamais vendu en comptoir · ✅ = aussi en agence</span>
      </div>
      <div class="overflow-x-auto">
        <table class="min-w-full text-xs">
          <thead class="s-panel-inner t-inverse font-bold">
            <tr>
              <th class="py-1 px-2 text-left">Code</th>
              <th class="py-1 px-2 text-left">Article</th>
              <th class="py-1 px-2 text-left">Canal</th>
              <th class="py-1 px-2 text-right">CA</th>
              <th class="py-1 px-2 text-center">Statut agence</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;

    btn.closest('.relative').appendChild(panel);
  }
  window._toggleHorsMagasin = _toggleHorsMagasin;

  function onBenchParamChange(){buildBenchCheckboxes();recalcBenchmarkInstant();}
  function buildBenchCheckboxes(){
    const div=document.getElementById('benchPickCheckboxes');if(!div)return;
    const stores=[..._S.storesIntersection].sort().filter(s=>s!==_S.selectedMyStore);
    // Keep previous checked state if available
    const prevChecked=new Set();document.querySelectorAll('#benchPickCheckboxes input:checked').forEach(cb=>prevChecked.add(cb.value));
    const allWasEmpty=prevChecked.size===0;
    div.innerHTML=stores.map(s=>{const checked=allWasEmpty||prevChecked.has(s)?'checked':'';return `<label class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold cursor-pointer border transition-colors ${checked?'bg-cyan-100 text-cyan-800 border-cyan-300':'s-hover t-tertiary b-default'} hover:opacity-80"><input type="checkbox" value="${s}" ${checked} onchange="this.closest('label').className=this.checked?'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold cursor-pointer border transition-colors bg-cyan-100 text-cyan-800 border-cyan-300 hover:opacity-80':'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold cursor-pointer border transition-colors s-hover t-tertiary b-default hover:opacity-80';recalcBenchmarkInstant()" class="w-3 h-3 accent-cyan-600">${s}</label>`;}).join('');
    buildObsCompareSelect();
  }
  function getBenchCompareStores(){
    // Always use checkboxes; fall back to all stores if none are checked yet (initial state)
    const checked=[];document.querySelectorAll('#benchPickCheckboxes input:checked').forEach(cb=>checked.push(cb.value));
    if(checked.length)return checked;
    return[..._S.storesIntersection].filter(s=>s!==_S.selectedMyStore);
  }
  function recalcBenchmarkInstant(){
    // Sync _S.selectedBenchBassin from checkboxes before recomputing
    const checked=[];document.querySelectorAll('#benchPickCheckboxes input:checked').forEach(cb=>checked.push(cb.value));
    const all=[..._S.storesIntersection].filter(s=>s!==_S.selectedMyStore);
    _S.selectedBenchBassin=checked.length===all.length?new Set():new Set(checked);
    _S._benchCache=null;
    const t0=performance.now();computeBenchmark(_S._globalCanal||null);renderBenchmark();const el=document.getElementById('benchRecalcTime');if(el)el.textContent=`⚡ ${Math.round(performance.now()-t0)}ms`;
  }

  // ★★★ MOTEUR PRINCIPAL ★★★
  async function processData(_storeOverride){
    const f1=document.getElementById('fileConsomme').files[0],f2=document.getElementById('fileStock').files[0];
    if(!f1){showToast('⚠️ Chargez votre fichier Consommé (ventes)','warning');return;}
    if(!f2){showToast('ℹ️ Mode commercial — chargez l\'État du Stock pour les vues Articles et Mon Stock','info',4000);}
    const btn=document.getElementById('btnCalculer');btn.disabled=true;
    // H4: reset complet de tous les globals session avant chaque re-upload
    resetAppState();
    // Gérer le sélecteur d'agence : si _storeOverride (depuis dropdown/sidebar), conserver ;
    // sinon vider pour forcer l'affichage du choix si multi-agences
    const _selStore=document.getElementById('selectMyStore');
    if(_selStore){if(_storeOverride){_selStore.value=_storeOverride;}else{_selStore.innerHTML='<option value="">—</option>';_selStore.value='';}}
    _restoreExclusions();
    resetPromo();
    showLoading('Lecture…','');await yieldToMain();
    let dataC,dataS;
    try{
      updatePipeline('consomme','active');updatePipeline('stock','active');
      updateProgress(10,100,'Lecture fichiers (parallèle)…');
      [dataC,dataS]=await Promise.all([readExcel(f1),f2?readExcel(f2):Promise.resolve([])]);
      updateProgress(40,100,'Fichiers chargés…');await yieldToMain();
    }catch(error){showToast('❌ Lecture fichiers: '+error.message,'error');console.error(error);btn.disabled=false;hideLoading();return;}
    _S._rawDataC=dataC;_S._rawDataS=dataS;
    // 1) Parse complet sur toute la période — W, V, MIN/MAX, ABC/FMR invariants
    _S.periodFilterStart=null;_S.periodFilterEnd=null;
    await processDataFromRaw(dataC,dataS,{storeOverride:_storeOverride||''});
    // Snapshot période-invariante des ventes client (avant refilter qui les écrase)
    _S.ventesClientArticleFull=new Map([..._S.ventesClientArticle].map(([cc,arts])=>[cc,new Map(arts)]));
    // 2) Positionner le filtre sur le mois le plus récent, puis re-parse léger (isRefilter)
    //    pour recalculer les agrégats d'affichage (CA, clients, marge) sur ce mois uniquement
    const _maxD=_S.consommePeriodMaxFull||_S.consommePeriodMax;
    if(_maxD){const _y=_maxD.getFullYear(),_m=_maxD.getMonth();_S.periodFilterStart=new Date(_y,_m,1);_S.periodFilterEnd=new Date(_y,_m+1,0,23,59,59);
      await processDataFromRaw(dataC,dataS,{isRefilter:true});
    }
    buildPeriodFilter();
  }

  // ── Sous-fonctions de processDataFromRaw — refactoring pur, zéro impact comportemental ──
  // Règle : chaque fonction a une seule responsabilité, paramètres explicites, pas de
  // variables locales de processDataFromRaw capturées par closure.

  function _computeSeasonalIndex(monthlySales) {
    // B3 : agrège monthlySales par famille → _S.seasonalIndex (coefficients saisonniers)
    const familyMonthly={};
    for(const[code,months] of Object.entries(monthlySales)){
      const fam=_S.articleFamille[code];if(!fam)continue;
      if(!familyMonthly[fam])familyMonthly[fam]=new Array(12).fill(0);
      for(let m=0;m<12;m++)familyMonthly[fam][m]+=months[m];
    }
    _S.seasonalIndex={};
    for(const[fam,months] of Object.entries(familyMonthly)){
      const avg=months.reduce((s,v)=>s+v,0)/12;if(avg<=0)continue;
      _S.seasonalIndex[fam]=months.map(v=>Math.round(v/avg*100)/100);
    }
    _S.articleMonthlySales=monthlySales;
  }

  function _buildSynthFromRaw(articleRaw) {
    // Transforme articleRaw (brut consommé) en synth (T, V, W, U écrêtés)
    // Pure : aucun effet de bord sur _S.
    const synth={};
    for(const[code,art] of Object.entries(articleRaw)){
      const pNet=art.tpp+art.tpn;const isReg=(art.tpp>0&&pNet<=0);
      let maxP=0,cntP=0,sumP=0;
      if(!isReg){for(const bl of Object.values(art.bls)){if(bl.p>0){if(bl.p>maxP)maxP=bl.p;sumP+=bl.p;cntP++;}}}
      if(!isReg&&sumP>0&&pNet>0&&pNet<sumP*0.5){const r=pNet/sumP;maxP=Math.round(maxP*r);sumP=pNet;}
      synth[code]={maxP,sumP:isReg?0:Math.max(pNet,0),sumE:art.te,cbl:art.cbl,cblP:isReg?0:cntP};
    }
    return synth;
  }

  function _enrichFinalDataWithCA() {
    // Injecte caAnnuel sur chaque article de DataStore.finalData depuis DataStore.ventesClientArticle
    // (canal MAGASIN, myStore uniquement — invariant dualité PDV/hors-agence)
    const _caByCode=new Map();
    for(const[,artMap] of DataStore.ventesClientArticle.entries()){
      for(const[code,data] of artMap.entries()){
        _caByCode.set(code,(_caByCode.get(code)||0)+(data.sumCA||0));
      }
    }
    for(const r of DataStore.finalData){r.caAnnuel=Math.round(_caByCode.get(r.code)||0);}
  }

  // Grise les onglets selon les fichiers chargés — appelé après chaque chargement complet
  function _syncTabAccess(){
    const hasStock=!!_S._hasStock;
    const needsStock=['table','dash','abc'];
    const needsConsomme=['territoire','promo'];
    needsStock.forEach(tab=>{
      const btn=document.querySelector(`.tab-btn[data-tab="${tab}"]`);if(!btn)return;
      if(!hasStock){btn.classList.add('tab-locked');btn.title="Chargez l'État du Stock pour activer cet onglet";}
      else{btn.classList.remove('tab-locked');if(btn.title.includes('Stock'))btn.title='';}
    });
    needsConsomme.forEach(tab=>{
      const btn=document.querySelector(`.tab-btn[data-tab="${tab}"]`);if(!btn)return;
      btn.classList.remove('tab-locked');btn.title='';
    });
    // Labo: needs consommé + chalandise
    const laboBtn=document.querySelector('.tab-btn[data-tab="labo"]');
    if(laboBtn){
      const hasChal=_S.chalandiseData?.size>0;
      if(!hasChal){laboBtn.classList.add('tab-locked');laboBtn.title='Chargez le Consommé et la Zone de Chalandise';}
      else{laboBtn.classList.remove('tab-locked');laboBtn.title='';}
    }
  }

  // Univers dominant par client — séparé pour être appelable depuis processDataFromRaw ET _initFromCache
  function _computeClientDominantUnivers(){
    const m=new Map();
    for(const[cc,artMap] of _S.ventesClientArticle.entries()){
      const univCA={};
      for(const[code,v] of artMap.entries()){const u=_S.articleUnivers[code];if(u)univCA[u]=(univCA[u]||0)+(v.sumCA||0);}
      let maxU='',maxCA=0;
      for(const[u,ca] of Object.entries(univCA)){if(ca>maxCA){maxCA=ca;maxU=u;}}
      if(maxU)m.set(cc,maxU);
    }
    _S._clientDominantUnivers=m;
  }


  // caByArticleCanal — séparé pour être appelable depuis processDataFromRaw ET _initFromCache
  function _rebuildCaByArticleCanal(){
    if(!_S.ventesClientHorsMagasin.size||!DataStore.finalData.length)return;
    _S.caByArticleCanal=new Map();
    for(const[,artMap] of _S.ventesClientHorsMagasin.entries()){
      for(const[code,data] of artMap.entries()){
        if(!_S.caByArticleCanal.has(code))_S.caByArticleCanal.set(code,{});
        const entry=_S.caByArticleCanal.get(code);
        entry[data.canal]=(entry[data.canal]||0)+data.sumCA;
      }
    }
    for(const r of DataStore.finalData){
      const c=_S.caByArticleCanal.get(r.code)||{};
      r.caWeb=c.INTERNET||0;r.caRep=c.REPRESENTANT||0;r.caDcs=c.DCS||0;
      r.caHorsMagasin=r.caWeb+r.caRep+r.caDcs;
      r.nbClientsWeb=[..._S.ventesClientHorsMagasin.entries()].filter(([,m])=>m.has(r.code)).length;
    }
  }
  // ★★★ MOTEUR CALCUL — appelé par processData() et applyPeriodFilter() ★★★
  async function processDataFromRaw(dataC,dataS,opts={}){
    const{isRefilter=false,storeOverride=''}=opts;
    const _savedStoreBeforeReset=isRefilter?(_S.selectedMyStore||localStorage.getItem('prisme_selectedStore')||''):'';
    if(isRefilter&&_savedStoreBeforeReset)_S.selectedMyStore=_savedStoreBeforeReset;
    const t0=performance.now();const btn=document.getElementById('btnCalculer');btn.disabled=true;
    if(isRefilter){showLoading('Recalcul période…','');await yieldToMain();}
    try{
      let headersC=null;
      if(!isRefilter){headersC=Object.keys(dataC[0]||{}).join(' ').toLowerCase();if(!headersC.includes('article')&&!headersC.includes('code')){showToast('⚠️ Le fichier Ventes ne semble pas contenir de colonne Article/Code.','error');btn.disabled=false;hideLoading();return;}if(dataS&&dataS.length){const headersS=Object.keys(dataS[0]||{}).join(' ').toLowerCase();if(!headersS.includes('article')&&!headersS.includes('code')){showToast('⚠️ Le fichier Stock ne semble pas contenir de colonne Article/Code.','error');btn.disabled=false;hideLoading();return;}}}

      // ── Store detection — skipped for isRefilter (storesIntersection/selectedMyStore unchanged) ──
      _resetColCache();
      let hasMulti=_S.storesIntersection.size>1,useMulti=hasMulti&&_S.selectedMyStore;
      if(!isRefilter){
        const stC=new Set(),stS=new Set();
        for(const r of dataC){const c=extractStoreCode(r);if(c)stC.add(c);}
        if(dataS&&dataS.length){for(const r of dataS){const c=extractStoreCode(r);if(c)stS.add(c);}_S.storesIntersection=new Set();for(const s of stC){if(stS.has(s))_S.storesIntersection.add(s);}}
        else{_S.storesIntersection=new Set(stC);}
        _S.storeCountConsomme=stC.size;_S.storeCountStock=stS.size;
        const _explicitStore=storeOverride==='*'?'':storeOverride||(document.getElementById('selectMyStore').value||'').toUpperCase();
        _S.selectedMyStore=_explicitStore;
        hasMulti=_S.storesIntersection.size>1;
        document.getElementById('storeSelector').classList.add('hidden');
        if(hasMulti){if(storeOverride==='*'){_S.selectedMyStore='';/* tout sélectionner */}else if(_explicitStore&&_S.storesIntersection.has(_explicitStore)){_S.selectedMyStore=_explicitStore;localStorage.setItem('prisme_selectedStore',_explicitStore);}else{const _selEl=document.getElementById('selectMyStore');if(_selEl){_selEl.innerHTML='<option value="">—</option>'+[..._S.storesIntersection].sort().map(s=>`<option value="${s}">${s}</option>`).join('');_selEl.value='';}document.getElementById('storeSelector').classList.remove('hidden');btn.disabled=false;throw new Error('NO_STORE_SELECTED');}btn.disabled=false;}
        else{if(_S.storesIntersection.size===1)_S.selectedMyStore=[..._S.storesIntersection][0];}
        useMulti=hasMulti&&_S.selectedMyStore;
      }else if(_savedStoreBeforeReset){const sel=document.getElementById('selectMyStore');if(sel)sel.value=_savedStoreBeforeReset;}

      const stockKeys=Object.keys(dataS[0]||{});
      const colFamille=stockKeys.find(k=>k.toLowerCase()==='famille')||stockKeys.find(k=>k.toLowerCase().startsWith('famille'));
      const colSousFamille=stockKeys.find(k=>{const l=k.toLowerCase();return l.includes('sous')&&l.includes('famille');})||stockKeys.find(k=>k.toLowerCase().startsWith('sous-famille'));

      updatePipeline('stock','active');updatePipeline('consomme','active');
      _resetColCache(); // colonnes consommé différentes du stock
      updateProgress(45,100,'Ventes…',dataC.length.toLocaleString('fr'));
      const articleRaw={};_S.ventesParMagasin={};_S.blData={};if(!isRefilter)_S.clientsMagasin=new Set();_S.ventesClientArticle=new Map();if(!isRefilter){_S.clientLastOrder=new Map();_S.clientLastOrderAll=new Map();}_S.ventesClientsPerStore={};_S.articleClients=new Map();_S.clientArticles=new Map();
      _S.ventesParMagasinByCanal={};
      if(!isRefilter){_S.articleFamille={};_S.articleUnivers={};_S.canalAgence={};_S.clientNomLookup={};}
      const _clientMagasinBLsTemp=new Map();
      const monthlySales={}; // B3: code → [12 mois qtés]
      let minDateVente=Infinity,maxDateVente=0;let passagesUniques=new Set(),commandesPDV=new Set();const _tempCAAll=new Map(); // accumulation sumCAAll tous canaux, fusionné après la boucle
      let _cSStk=null,_cSValS=null; // pré-détectés avant la boucle stock
      // H2: détecter la colonne N° commande avant la boucle — éviter le collapse sur clé 'C'
      let _hasCommandeCol=false;
      if(headersC){_hasCommandeCol=['numéro de commande','commande','n° commande','bl','numéro','n° bl'].some(c=>headersC.includes(c));if(!_hasCommandeCol)showToast('⚠️ Colonne "N° commande" absente du fichier Consommé — le dédoublonnage BL est désactivé.','warning');}

      for(let i=0;i<dataC.length;i+=CHUNK_SIZE){const end=Math.min(i+CHUNK_SIZE,dataC.length);for(let j=i;j<end;j++){const row=dataC[j];const canal=(getVal(row,'Canal','Canal commande','Commande')||'').toString().trim().toUpperCase();
      // V24.4: canalAgence/libelleLookup/articleCanalCA — period-independent, skip for isRefilter
      if(!isRefilter){
      if(canal){const _sk_canal=extractStoreCode(row)||'INCONNU';const _storeMatch=!_S.selectedMyStore||_sk_canal==='INCONNU'||_sk_canal===_S.selectedMyStore;if(_storeMatch){const nc2=(getVal(row,'Numéro de commande','commande','N° commande')||getVal(row,'BL','Numéro','N° BL')||'').toString().trim();const _bl2=(getVal(row,'Numéro de BL','Numéro BL','N° BL')||'').toString().trim();if(nc2||_bl2){if(!_S.canalAgence[canal])_S.canalAgence[canal]={bl:new Set(),blNums:new Set(),ca:0,caP:0,caE:0};if(nc2)_S.canalAgence[canal].bl.add(nc2);if(_bl2&&_bl2!==nc2)_S.canalAgence[canal].blNums.add(_bl2);}}}
      {const _ra0=(getVal(row,'Article','Code')||'').toString();const _c0=cleanCode(_ra0);if(_c0&&!_S.libelleLookup[_c0]){const _s0=_ra0.indexOf(' - ');if(_s0>0)_S.libelleLookup[_c0]=_ra0.substring(_s0+3).trim();}}
      // Accumulation CA par canal (prélevé + enlevé) — avant le continue pour capturer tous les canaux
      if(canal&&_S.canalAgence[canal]){const _sk_ca=extractStoreCode(row)||'INCONNU';if(!_S.selectedMyStore||_sk_ca==='INCONNU'||_sk_ca===_S.selectedMyStore){const _caP3=getCaColumn(row,'prél')||0;const _caE3=getCaColumn(row,'enlév')||getCaColumn(row,'enlev')||0;_S.canalAgence[canal].caP+=_caP3;_S.canalAgence[canal].caE+=_caE3;_S.canalAgence[canal].ca+=_caP3+_caE3;
      // [F1 fix] articleCanalCA — tous canaux, filtré par agence, construit ici dans la boucle existante
      {const _cf1=cleanCode((getVal(row,'Article','Code')||'').toString());if(_cf1){const _qteP_acc=getQuantityColumn(row,'prél')||0;if(_caP3+_caE3>0||_qteP_acc>0){if(!_S.articleCanalCA.has(_cf1))_S.articleCanalCA.set(_cf1,new Map());const _acm=_S.articleCanalCA.get(_cf1);if(!_acm.has(canal))_acm.set(canal,{ca:0,qteP:0,countBL:0});const _ace=_acm.get(canal);_ace.ca+=_caP3+_caE3;_ace.qteP+=_qteP_acc;_ace.countBL++;}}}
      }}
      } // end !isRefilter for period-independent blocks
      // Parse date une seule fois — réutilisé par sumCAAll, filtre hors-MAGASIN, et filtre MAGASIN plus bas
      const dateV=parseExcelDate(getVal(row,'Jour','Date'));
      // clientLastOrderAll — tous canaux, period-independent, avant le split canal
      if(!isRefilter&&dateV){const _ccAll=extractClientCode((getVal(row,'Code et nom client','Code client','Client')||'').toString().trim());const _skAll=extractStoreCode(row)||'INCONNU';if(_ccAll&&(!_S.selectedMyStore||_skAll==='INCONNU'||_skAll===_S.selectedMyStore)){const prev=_S.clientLastOrderAll.get(_ccAll);if(!prev||dateV>prev.date)_S.clientLastOrderAll.set(_ccAll,{date:dateV,canal:canal||'MAGASIN'});
      // clientLastOrderByCanal — dernière commande par canal
      const _cByC=canal||'MAGASIN';if(!_S.clientLastOrderByCanal.has(_ccAll))_S.clientLastOrderByCanal.set(_ccAll,new Map());const _cMap=_S.clientLastOrderByCanal.get(_ccAll);const _prevC=_cMap.get(_cByC);if(!_prevC||dateV>_prevC)_cMap.set(_cByC,dateV);}}
      // Accumulation CA tous canaux par client dans _tempCAAll (fusionné après la boucle)
      // Ne PAS créer d'entrée dans ventesClientArticle ici — seules les lignes MAGASIN (L1686) le font
      if(!(_S.periodFilterStart&&dateV&&dateV<_S.periodFilterStart)&&!(_S.periodFilterEnd&&dateV&&dateV>_S.periodFilterEnd))
      {const _ccA=extractClientCode((getVal(row,'Code et nom client','Code client','Client')||'').toString().trim());const _codeA=cleanCode((getVal(row,'Article','Code')||'').toString());const _skA=extractStoreCode(row)||'INCONNU';if(_ccA&&_codeA&&(!_S.selectedMyStore||_skA==='INCONNU'||_skA===_S.selectedMyStore)){const _caAT=(getCaColumn(row,'prél')||0)+(getCaColumn(row,'enlév')||getCaColumn(row,'enlev')||0);if(_caAT>0){if(!_tempCAAll.has(_ccA))_tempCAAll.set(_ccA,new Map());const _amA=_tempCAAll.get(_ccA);_amA.set(_codeA,(_amA.get(_codeA)||0)+_caAT);}}}
      if(_S.storesIntersection.size>0?canal!=='MAGASIN':canal!==''&&canal!=='MAGASIN'){
        // Canaux hors MAGASIN — filtre période + accumulation ventesParMagasinByCanal
        if(canal){
          if(_S.periodFilterStart&&dateV&&dateV<_S.periodFilterStart){continue;}
          if(_S.periodFilterEnd&&dateV&&dateV>_S.periodFilterEnd){continue;}
          const cc=extractClientCode((getVal(row,'Code et nom client','Code client','Client')||'').toString().trim());const codeArt=cleanCode((getVal(row,'Article','Code')||'').toString());const caLigne=(getCaColumn(row,'prél')||0)+(getCaColumn(row,'enlév')||getCaColumn(row,'enlev')||0);const qteLigne=(getQuantityColumn(row,'prél')||0)+(getQuantityColumn(row,'enlév')||getQuantityColumn(row,'enlev')||0);const skHors=extractStoreCode(row)||'INCONNU';
          // ventesClientHorsMagasin — skip for isRefilter
          if(!isRefilter&&cc&&codeArt&&(!_S.selectedMyStore||skHors==='INCONNU'||skHors===_S.selectedMyStore)){_S.cannauxHorsMagasin.add(canal);const hm=_S.ventesClientHorsMagasin.get(cc)||new Map();const ex=hm.get(codeArt)||{sumCA:0,sumPrelevee:0,sumCAPrelevee:0,countBL:0,canal};ex.sumCA+=caLigne;ex.sumPrelevee+=qteLigne;ex.sumCAPrelevee+=caLigne;ex.countBL++;hm.set(codeArt,ex);_S.ventesClientHorsMagasin.set(cc,hm);}
          // ventesParMagasinByCanal — toujours (y compris isRefilter)
          if(codeArt&&(skHors==='INCONNU'||_S.storesIntersection.has(skHors)||!_S.storesIntersection.size)){const _storeKey=skHors==='INCONNU'?(_S.selectedMyStore||skHors):skHors;if(!_S.ventesParMagasinByCanal[_storeKey])_S.ventesParMagasinByCanal[_storeKey]={};if(!_S.ventesParMagasinByCanal[_storeKey][canal])_S.ventesParMagasinByCanal[_storeKey][canal]={};if(!_S.ventesParMagasinByCanal[_storeKey][canal][codeArt])_S.ventesParMagasinByCanal[_storeKey][canal][codeArt]={sumCA:0,sumPrelevee:0,countBL:0,sumVMB:0,sumVMBPrel:0};const _vpmc=_S.ventesParMagasinByCanal[_storeKey][canal][codeArt];_vpmc.sumCA+=caLigne;_vpmc.sumPrelevee+=(getCaColumn(row,'prél')||0);_vpmc.countBL++;const _vmbPH=getVmbColumn(row,'prél');const _vmbEH=getVmbColumn(row,'enlév')||getVmbColumn(row,'enlev')||0;_vpmc.sumVMB+=_vmbPH+_vmbEH;_vpmc.sumVMBPrel+=_vmbPH;}
        }
        continue;
      }
      const rawArt=(getVal(row,'Article','Code')||'').toString();const store=extractStoreCode(row),code=cleanCode(rawArt);const qteP=getQuantityColumn(row,'prél');const qteE=getQuantityColumn(row,'enlév')||getQuantityColumn(row,'enlev');const caP=getCaColumn(row,'prél');const caE=getCaColumn(row,'enlév')||getCaColumn(row,'enlev');const sk=store||'INCONNU';
      if(code&&!_S.libelleLookup[code]){const si=rawArt.indexOf(' - ');if(si>0)_S.libelleLookup[code]=rawArt.substring(si+3).trim();}
      const famConso=(getVal(row,'Famille')||getVal(row,'Univers')||'').toString().trim();const _codeFamConso=(getVal(row,'Code famille','Code Famille')||'').toString().trim();const _famCode=_codeFamConso||extractFamCode(famConso);if(_famCode&&code)_S.articleFamille[code]=_famCode;const _uv2=(getVal(row,'Univers')||'').toString().trim();const _cf2=_codeFamConso||'';const univConso=_uv2||(_cf2?FAM_LETTER_UNIVERS[_cf2[0].toUpperCase()]||'Inconnu':'');if(univConso&&code)_S.articleUnivers[code]=univConso;
      if(dateV){const ts=dateV.getTime();if(ts<minDateVente)minDateVente=ts;if(ts>maxDateVente)maxDateVente=ts;}
      if(_S.periodFilterStart&&dateV&&dateV<_S.periodFilterStart)continue;
      if(_S.periodFilterEnd&&dateV&&dateV>_S.periodFilterEnd)continue;
      // B3: monthly sales accumulation
      if(dateV&&code&&(!_S.selectedMyStore||sk===_S.selectedMyStore)&&qteP>0){if(!monthlySales[code])monthlySales[code]=new Array(12).fill(0);monthlySales[code][dateV.getMonth()]+=qteP;}
      if(_S.storesIntersection.has(sk)||!_S.storesIntersection.size){if(!_S.ventesParMagasin[sk])_S.ventesParMagasin[sk]={};if(!_S.ventesParMagasin[sk][code])_S.ventesParMagasin[sk][code]={sumPrelevee:0,sumEnleve:0,sumCA:0,countBL:0,sumVMB:0};if(qteP>0)_S.ventesParMagasin[sk][code].sumPrelevee+=qteP;if(qteE>0)_S.ventesParMagasin[sk][code].sumEnleve+=qteE;_S.ventesParMagasin[sk][code].sumCA+=caP+caE;if(qteP>0||qteE>0)_S.ventesParMagasin[sk][code].countBL++;_S.ventesParMagasin[sk][code].sumVMB+=getVmbColumn(row,'prél')+(getVmbColumn(row,'enlév')||getVmbColumn(row,'enlev'));if(canal){const _bck=_S.ventesParMagasin[sk][code];if(!_bck.byCanal)_bck.byCanal={};if(!_bck.byCanal[canal])_bck.byCanal[canal]={sumPrelevee:0,sumCA:0,countBL:0,sumVMB:0};const _bc=_bck.byCanal[canal];if(qteP>0)_bc.sumPrelevee+=qteP;_bc.sumCA+=caP+caE;if(qteP>0||qteE>0)_bc.countBL++;_bc.sumVMB+=getVmbColumn(row,'prél')+(getVmbColumn(row,'enlév')||getVmbColumn(row,'enlev'));}if(code){const _canalKey=canal||'MAGASIN';if(!_S.ventesParMagasinByCanal[sk])_S.ventesParMagasinByCanal[sk]={};if(!_S.ventesParMagasinByCanal[sk][_canalKey])_S.ventesParMagasinByCanal[sk][_canalKey]={};if(!_S.ventesParMagasinByCanal[sk][_canalKey][code])_S.ventesParMagasinByCanal[sk][_canalKey][code]={sumCA:0,sumPrelevee:0,countBL:0,sumVMB:0,sumVMBPrel:0};const _vpmc2=_S.ventesParMagasinByCanal[sk][_canalKey][code];_vpmc2.sumCA+=caP+caE;_vpmc2.sumPrelevee+=caP;if(qteP>0||qteE>0)_vpmc2.countBL++;const _vmbP2=getVmbColumn(row,'prél');const _vmbE2=getVmbColumn(row,'enlév')||getVmbColumn(row,'enlev')||0;_vpmc2.sumVMB+=_vmbP2+_vmbE2;_vpmc2.sumVMBPrel+=_vmbP2;}}
      // V2 Phase 1: DataStore.ventesClientArticle (myStore only) + _S.ventesClientsPerStore (all stores)
      const cc2=extractClientCode((getVal(row,'Code et nom client','Code client','Client')||'').toString().trim());
      if(cc2&&code){if(!_S.ventesClientsPerStore[sk])_S.ventesClientsPerStore[sk]=new Set();_S.ventesClientsPerStore[sk].add(cc2);}
      // _S.clientsMagasin : clients du consommé de l'agence sélectionnée uniquement (après filtre canal+store)
      if(cc2&&(!_S.selectedMyStore||sk===_S.selectedMyStore)){_S.clientsMagasin.add(cc2);const _nc4m=(getVal(row,'Numéro de commande','commande','N° commande')||getVal(row,'BL','Numéro','N° BL')||'').toString().trim()||('__row_'+j);if(!_clientMagasinBLsTemp.has(cc2))_clientMagasinBLsTemp.set(cc2,new Set());_clientMagasinBLsTemp.get(cc2).add(_nc4m);}
      // _S.clientNomLookup : extrait "NOM" depuis "CODE - NOM" (première occurrence)
      if(cc2&&!_S.clientNomLookup[cc2]){const rawFull=(getVal(row,'Code et nom client','Code client','Client')||'').toString().trim();const di=rawFull.indexOf(' - ');if(di>=0)_S.clientNomLookup[cc2]=rawFull.slice(di+3).trim();}
      // ventesClientArticle = MAGASIN uniquement (garde canal déjà assuré par continue ligne 1594)
      // sumCA inclut les avoirs (qteP<0) pour refléter le CA net réel comme Qlik
      if(cc2&&code&&(!_S.selectedMyStore||sk===_S.selectedMyStore)){if(!DataStore.ventesClientArticle.has(cc2))DataStore.ventesClientArticle.set(cc2,new Map());const artMap=DataStore.ventesClientArticle.get(cc2);if(!artMap.has(code))artMap.set(code,{sumPrelevee:0,sumCAPrelevee:0,sumCA:0,sumCAAll:0,countBL:0});const e=artMap.get(code);if(qteP>0){e.sumPrelevee+=qteP;e.sumCAPrelevee+=caP;}e.sumCA+=caP+caE;if(qteP>0||qteE>0)e.countBL++;}
      if((!_S.selectedMyStore||sk===_S.selectedMyStore)){const _nc3=(getVal(row,'Numéro de commande','commande','N° commande')||'').toString().trim();if(_nc3)commandesPDV.add(_nc3);}
      if((!_S.selectedMyStore||sk===_S.selectedMyStore)&&(qteP>0||qteE>0)){if(cc2&&dateV&&!isNaN(dateV.getTime()))passagesUniques.add(cc2+'_'+formatLocalYMD(dateV));}
      if(cc2&&dateV&&(!_S.selectedMyStore||sk===_S.selectedMyStore)){const prev=_S.clientLastOrder.get(cc2);if(!prev||dateV>prev)_S.clientLastOrder.set(cc2,dateV);}
      // V2 Phase 2: _S.articleClients — sans filtre store ni quantité pour couvrir mono ET multi, prélevé ET enlevé
      const rawClient=(getVal(row,'Code et nom client','Code client','Client')||'').toString();
      const codeClient=extractClientCode(rawClient);
      if(codeClient&&code){
        if(!_S.articleClients.has(code))_S.articleClients.set(code,new Set());
        _S.articleClients.get(code).add(codeClient);
        if(!_S.clientArticles.has(codeClient))_S.clientArticles.set(codeClient,new Set());
        _S.clientArticles.get(codeClient).add(code);
      }
      if(!useMulti||sk===_S.selectedMyStore){if(!articleRaw[code])articleRaw[code]={tpp:0,tpn:0,te:0,bls:{},cbl:0};const a=articleRaw[code];if(qteP>0)a.tpp+=qteP;if(qteP<0)a.tpn+=qteP;if(qteE>0)a.te+=qteE;const nc=(_hasCommandeCol?(getVal(row,'Numéro de commande','commande','N° commande')||getVal(row,'BL','Numéro','N° BL')||''):('__r'+j)).toString().trim()||('__r'+j);if(!a.bls[nc]){a.bls[nc]={p:Math.max(qteP,0),e:Math.max(qteE,0)};a.cbl++;}else{const ex=a.bls[nc];if(Math.max(qteP,0)>ex.p)ex.p=Math.max(qteP,0);if(Math.max(qteE,0)>ex.e)ex.e=Math.max(qteE,0);}
      if(qteP>0||qteE>0){const blNum=nc;if(!_S.blData[blNum])_S.blData[blNum]={codes:new Set(),familles:new Set()};_S.blData[blNum].codes.add(code);if(_famCode)_S.blData[blNum].familles.add(famLib(_famCode));if(qteP>0)_S.blPreleveeSet.add(blNum);}}}updateProgress(45+Math.round(i/dataC.length*20),100);await yieldToMain();}
      // Fusion sumCAAll : enrichir ventesClientArticle avec les CA tous canaux (seuls les clients MAGASIN existants)
      for(const [_cc,_arts] of _tempCAAll){if(!_S.ventesClientArticle.has(_cc))continue;const _cMap=_S.ventesClientArticle.get(_cc);for(const [_code,_ca] of _arts){const _e=_cMap.get(_code);if(_e)_e.sumCAAll+=_ca;}}
      // Build blCanalMap + convert canalAgence bl sets — skipped for isRefilter (canalAgence unchanged)
      if(!isRefilter){
      _S.blCanalMap = new Map();
      for(const [canal, data] of Object.entries(_S.canalAgence)){
        if(data.bl instanceof Set){for(const bl of data.bl)_S.blCanalMap.set(bl, canal);}
        if(data.blNums instanceof Set){for(const bl of data.blNums)_S.blCanalMap.set(bl, canal);}
      }
      for(const c of Object.keys(_S.canalAgence)){_S.canalAgence[c].bl=_S.canalAgence[c].bl.size;delete _S.canalAgence[c].blNums;}
      }
      // Recalcul canalAgence période-filtré pour isRefilter
      if(isRefilter){
        _S.canalAgence={};const _tmpBLca={};
        for(const row of dataC){
          const canal=(getVal(row,'Canal','Canal commande','Commande')||'').toString().trim().toUpperCase();if(!canal)continue;
          const sk=extractStoreCode(row)||'INCONNU';if(_S.selectedMyStore&&sk!=='INCONNU'&&sk!==_S.selectedMyStore)continue;
          const dateV=parseExcelDate(getVal(row,'Jour','Date'));
          if(_S.periodFilterStart&&dateV&&dateV<_S.periodFilterStart)continue;
          if(_S.periodFilterEnd&&dateV&&dateV>_S.periodFilterEnd)continue;
          const nc=(getVal(row,'Numéro de commande','commande','N° commande')||getVal(row,'BL','Numéro','N° BL')||'').toString().trim();
          const caP=getCaColumn(row,'prél')||0;const caE=(getCaColumn(row,'enlév')||getCaColumn(row,'enlev')||0);
          if(!_S.canalAgence[canal])_S.canalAgence[canal]={bl:0,ca:0,caP:0,caE:0};
          if(nc){if(!_tmpBLca[canal])_tmpBLca[canal]=new Set();if(!_tmpBLca[canal].has(nc)){_tmpBLca[canal].add(nc);_S.canalAgence[canal].bl++;}}
          _S.canalAgence[canal].caP+=caP;_S.canalAgence[canal].caE+=caE;_S.canalAgence[canal].ca+=caP+caE;
        }
      }
      // [isRefilter] Patch obsKpis.mine depuis canalAgence (période-filtré)
      if(isRefilter&&_S.benchLists?.obsKpis){
        const _ca=Object.values(_S.canalAgence).reduce((t,v)=>t+(v.ca||0),0);
        console.log('[DEBUG obsKpis] canalAgence=',JSON.stringify(_S.canalAgence),'ca=',_ca);
        _S.benchLists.obsKpis.mine={
          ca:_ca,
          ref:_S.benchLists.obsKpis.mine?.ref||0,
          freq:Object.values(_S.canalAgence).reduce((t,v)=>t+(v.bl||0),0),
          serv:_S.benchLists.obsKpis.mine?.serv||0,
          pdm:_S.benchLists.obsKpis.mine?.pdm||0,
          txMarge:_S.benchLists.obsKpis.mine?.txMarge||0
        };
        invalidateCache('bench');
      }
      // Fidèles PDV : fréquence MAGASIN par client (nb BL distincts)
      if(!isRefilter)_S.clientsMagasinFreq=new Map([..._clientMagasinBLsTemp].map(([cc,bls])=>[cc,bls.size]));
      // Univers dominant par client : somme CA par univers → univers avec le plus de CA
      _computeClientDominantUnivers();
      // V24.4: build _S.blConsommeSet ONCE here (before territoire processing)
      _S.blConsommeSet=new Set(Object.keys(_S.blData));
      // Garde-fou canaux hors MAGASIN
      if(_S.cannauxHorsMagasin.size > 0) {
        const _labelsCanaux = {INTERNET:'🌐 Internet', REPRESENTANT:'🤝 Représentant', DCS:'🏢 DCS'};
        const _listeCanaux = [..._S.cannauxHorsMagasin].map(c => _labelsCanaux[c]||c).join(', ');
        showToast(`📡 Canaux détectés : ${_listeCanaux} — vue "Commandes hors agence" activée dans Le Terrain`, 'success', 6000);
      }
      updatePipeline('consomme','done');
      // B3: Moteur saisonnier — skipped for isRefilter (stock-derived, period-independent)
      if(!isRefilter){_computeSeasonalIndex(monthlySales);}

      const synth=_buildSynthFromRaw(articleRaw);

      updateProgress(68,100,'Analyse ventes…');
      const joursOuvres=(minDateVente<Infinity&&maxDateVente>0)?Math.max(Math.round(daysBetween(new Date(minDateVente),new Date(maxDateVente))*(5/7)),30):250;
      _S.globalJoursOuvres=joursOuvres;
      // VOLET 4: Period detection
      let _autoYTD=false;
      if(minDateVente<Infinity&&maxDateVente>0){
        _S.consommePeriodMin=new Date(minDateVente);_S.consommePeriodMax=new Date(maxDateVente);
        const calJours=daysBetween(_S.consommePeriodMin,_S.consommePeriodMax);
        _S.consommeMoisCouverts=Math.round(calJours/30.5);
        // [AUTO-YTD] consommé < 6 mois → forcer YTD pour éviter sparklines vides sur données courtes
        if(!isRefilter&&_S.consommeMoisCouverts<6&&(_S._globalPeriodePreset||'12M')==='12M'){_S._globalPeriodePreset='YTD';_autoYTD=true;}
        if(!_S.periodFilterStart&&!_S.periodFilterEnd){_S.consommePeriodMinFull=_S.consommePeriodMin;_S.consommePeriodMaxFull=_S.consommePeriodMax;}
        updatePeriodAlert();
        buildPeriodFilter();
      }
      const totalBLs=Object.keys(_S.blData).length;let sumRefParBL=0,sumFamParBL=0;const famBLcount={};
      for(const bl of Object.values(_S.blData)){sumRefParBL+=bl.codes.size;sumFamParBL+=bl.familles.size;for(const fam of bl.familles)famBLcount[fam]=(famBLcount[fam]||0)+1;}
      const _sd0=_S.ventesParMagasin[_S.selectedMyStore]||{};const _caCalc=Object.values(_sd0).reduce((s,v)=>s+(v.sumCA||0),0);const _vmbCalc=Object.values(_sd0).reduce((s,v)=>s+(v.sumVMB||0),0);
      _S.ventesAnalysis={refParBL:totalBLs>0?(sumRefParBL/totalBLs).toFixed(1):0,famParBL:totalBLs>0?(sumFamParBL/totalBLs).toFixed(1):0,totalBL:totalBLs,refActives:Object.values(synth).filter(s=>s.sumP>0||s.sumE>0).length,attractivite:famBLcount,nbPassages:passagesUniques.size,txMarge:_caCalc>0?_vmbCalc/_caCalc*100:null,vmc:commandesPDV.size>0?_caCalc/commandesPDV.size:null};

      let familles=new Set(),sousFamilles=new Set(),emplacements=new Set(),statuts=new Set();
      if(!isRefilter && dataS && dataS.length){ // ── bloc stock — skipped for isRefilter (stock unchanged) ──
      updatePipeline('stock','active');
      _resetColCache(); // colonnes stock différentes du consommé
      // Pré-détection colonnes stock qty / valeur — évite Object.keys par ligne
      {const _ks0=Object.keys(dataS[0]||{});_cSStk=_ks0.find(k=>{const lk=k.toLowerCase();return(lk.includes('stock')||lk.includes('qt')||lk.includes('quant'))&&!lk.includes('min')&&!lk.includes('max')&&!lk.includes('valeur')&&!lk.includes('alerte')&&!lk.includes('statut');});_cSValS=_ks0.find(k=>{const lk=k.toLowerCase().replace(/[\r\n]/g,' ');return lk.includes('valeur')&&lk.includes('stock');});}
      updateProgress(70,100,'Min/Max…',dataS.length.toLocaleString('fr'));
      // C1: snapshot des libellés bâtis depuis le consommé avant le reset — merger après la boucle stock
      const _libelleFromConsomme = Object.assign({}, _S.libelleLookup);
      _S.finalData=[];_S.libelleLookup={}; // producteur — _S direct_S.stockParMagasin={};_S.cockpitLists={ruptures:new Set(),fantomes:new Set(),sansemplacement:new Set(),anomalies:new Set(),saso:new Set(),dormants:new Set(),fins:new Set(),top20:new Set(),nouveautes:new Set(),colisrayon:new Set(),stockneg:new Set(),fragiles:new Set(),phantom:new Set()};
      _S.parentRefsExcluded=0;
      const NOW=new Date();

      for(let i=0;i<dataS.length;i+=CHUNK_SIZE){const end=Math.min(i+CHUNK_SIZE,dataS.length);for(let j=i;j<end;j++){const row=dataS[j];const rawCode=getVal(row,'Article','Code');if(!rawCode)continue;const storeCode=extractStoreCode(row),code=cleanCode(rawCode);
      if(storeCode&&(_S.storesIntersection.has(storeCode)||!_S.storesIntersection.size)){if(!_S.stockParMagasin[storeCode])_S.stockParMagasin[storeCode]={};const _stkVal=_cSValS?cleanPrice(row[_cSValS]):null;const _kMin=parseFloat(getVal(row,'min')||0)||0;const _kMax=parseFloat(getVal(row,'max')||0)||0;_S.stockParMagasin[storeCode][code]={stockActuel:cleanPrice(_cSStk?row[_cSStk]:0),valeurStock:_stkVal,qteMin:_kMin,qteMax:_kMax};}
      if(!_S.libelleLookup[code]){const lib=rawCode.toString().substring(code.length+3).trim()||(getVal(row,'Libellé','Designation')||'').toString().trim();if(lib)_S.libelleLookup[code]=lib;}
      if(_S.selectedMyStore&&storeCode&&storeCode!==_S.selectedMyStore)continue;
      const libelle=_S.libelleLookup[code]||code;const statut=(getVal(row,'Statut')||'Inconnu').toString().trim();
      const _rawFamille=colFamille?(row[colFamille]||'').toString().trim():'';const famille=(_rawFamille?extractFamCode(_rawFamille):null)||_S.articleFamille[code]||'Non Classé';
      const sousFamille=colSousFamille?(row[colSousFamille]||'').toString().trim():'';
      const rawEmp=(getVal(row,'Emplacement')||'').toString().trim();const emplacement=(rawEmp===''||rawEmp==='-')?'':rawEmp;
      if(famille&&famille!=='Non Classé')familles.add(famille);if(sousFamille)sousFamilles.add(sousFamille);if(emplacement)emplacements.add(emplacement);if(statut)statuts.add(statut);
      const keyStock=_cSStk;const keyValeurStock=_cSValS;
      const stockActuel=cleanPrice(keyStock?row[keyStock]:0);const valeurStock=keyValeurStock?cleanPrice(row[keyValeurStock]):null;const prixUnitaire=(valeurStock!==null&&stockActuel!==0)?Math.abs(valeurStock/stockActuel):(Math.abs(cleanPrice(getVal(row,'Valeur','Prix')))/(Math.abs(stockActuel)||1));
      const dateSortie=parseExcelDate(getVal(row,'dernière sortie','sortie'));const date1ereEntree=parseExcelDate(getVal(row,'première entrée','premiere entree','première réception'));const dateEntree=parseExcelDate(getVal(row,'dernière entrée','entrée'));const dateRef=parseExcelDate(getVal(row,'référencement','réf'));
      const dateInactivite=dateSortie||dateEntree||dateRef;const ageJours=dateInactivite?daysBetween(dateInactivite,NOW):999;const age1ereEntree=date1ereEntree?daysBetween(date1ereEntree,NOW):999;const isNouveaute=(age1ereEntree<NOUVEAUTE_DAYS)&&(!dateSortie||ageJours<90);
      const ancienMin=parseFloat(getVal(row,'min')||0);const ancienMax=parseFloat(getVal(row,'max')||0);

      // ★ V23: Detect parent reference
      const isParent=isParentRef(row);

      const stats=synth[code]||{maxP:0,sumP:0,sumE:0,cbl:0,cblP:0};
      const T=stats.maxP,V=stats.sumP,W=stats.cbl,Wp=stats.cblP;const U=Wp>0?(V/Wp):0;
      const X=V/joursOuvres;
      const enleveTotal=stats.sumE;
      let nouveauMin=0,nouveauMax=0;const cs=statut.charAt(0);
      if(isNouveaute){nouveauMin=ancienMin;nouveauMax=ancienMax;}
      else if(['2','3','4'].includes(cs)){nouveauMin=0;nouveauMax=0;}
      else if(W<=1){nouveauMin=0;nouveauMax=0;}
      else if(W===2&&V>0){nouveauMin=1;nouveauMax=2;}
      else if(V===0){nouveauMin=0;nouveauMax=0;}
      else if(Wp===0){nouveauMin=0;nouveauMax=0;} // H1: guard — Wp=0 ne doit jamais atteindre l'écretage
      else{const dlR=(T>3*U)?3*U:T;const dl=Math.min(dlR,U*5);const secDays=Wp>=12?4:Wp>=4?3:(prixUnitaire>HIGH_PRICE?1:2);nouveauMin=Math.max(Math.min(Math.round(dl+(X*secDays)),Math.ceil(V/6)),1);if(nouveauMin<0)nouveauMin=0;if(nouveauMin===0)nouveauMax=0;else{const df=Wp>12?21:10;const me=prixUnitaire>HIGH_PRICE?0:(Wp>12?3:1);nouveauMax=Math.max(Math.round(nouveauMin+(X*df)),nouveauMin+me);}}
      const couvertureJours=calcCouverture(stockActuel,V);
      DataStore.finalData.push({code,libelle,statut,famille,sousFamille,emplacement,W,V,stockActuel,prixUnitaire,valeurStock,ancienMin,ancienMax,nouveauMin,nouveauMax,ageJours,isNouveaute,enleveTotal,couvertureJours,isParent});
      }updateProgress(70+Math.round(i/dataS.length*20),100);await yieldToMain();}
      // C1: enrichir _S.libelleLookup avec les libellés consommé pour les codes absents du stock
      for(const k in _libelleFromConsomme){if(!_S.libelleLookup[k])_S.libelleLookup[k]=_libelleFromConsomme[k];}
      updatePipeline('stock','done');

      // ★ Médiane réseau MIN/MAX par article (multi-agences uniquement)
      if(useMulti&&DataStore.finalData.length){const _otherS=[..._S.storesIntersection].filter(s=>s!==_S.selectedMyStore);if(_otherS.length){for(const r of DataStore.finalData){const _mins=_otherS.map(s=>_S.stockParMagasin[s]?.[r.code]?.qteMin).filter(v=>v>0);const _maxs=_otherS.map(s=>_S.stockParMagasin[s]?.[r.code]?.qteMax).filter(v=>v>0);r.medMinReseau=_mins.length?_median(_mins):null;r.medMaxReseau=_maxs.length?_median(_maxs):null;}}}

      enrichPrixUnitaire();
      _enrichFinalDataWithCA(); // CA réel depuis ventesClientArticle (MAGASIN, myStore)

      // Fix: align _S.articleFamille with stock famille (stock is master)
      for (const r of DataStore.finalData) { if (r.famille && r.famille !== 'Non Classé') _S.articleFamille[r.code] = r.famille; }
      // B3b: Recalcul moteur saisonnier après enrichissement articleFamille (stock est master des familles)
      _computeSeasonalIndex(monthlySales);
      _S._hasStock = _S.finalData.length > 0;
      }else{updatePipeline('stock','skip');} // ── fin bloc stock ──────────────────────

      // Re-parse chalandise/livraisons + benchmark — skipped for isRefilter (period-independent)
      if(!isRefilter){
        {const f4=document.getElementById('fileChalandise').files[0];if(f4&&!_S.chalandiseReady)await parseChalandise(f4);}
        {const fL=document.getElementById('fileLivraisons').files[0];if(fL&&!_S.livraisonsReady)await parseLivraisons(fL);}
        if(useMulti){updateProgress(92,100,'Benchmark…');await yieldToMain();computeBenchmark(_S._globalCanal || null);}
      }
      // ABC/FMR, selects — skipped for isRefilter (finalData unchanged)
      if(!isRefilter){
        if(DataStore.finalData.length>0&&DataStore.finalData.every(r=>r.stockActuel===0)){showToast('⚠️ Attention : toutes les valeurs de stock sont à 0 dans le fichier. Vérifiez votre export.','warning');}
        updateProgress(93,100,'Radar ABC/FMR…');await yieldToMain();computeABCFMR(DataStore.finalData);assertPostParseInvariants();
        updateProgress(95,100,'Affichage…');await yieldToMain();
        populateSelect('filterFamille',familles,famLabel);populateSelect('filterSousFamille',sousFamilles);populateSelect('filterEmplacement',emplacements);populateSelect('filterStatut',statuts);
      }
      const elapsed=((performance.now()-t0)/1000).toFixed(1);
      document.getElementById('navStats').textContent=DataStore.finalData.length.toLocaleString('fr')+' art.';document.getElementById('navStats').classList.remove('hidden');
      document.getElementById('navPerf').textContent=elapsed+'s';document.getElementById('navPerf').classList.remove('hidden');
      const _navSt=document.getElementById('navStore');if(_navSt){_navSt.textContent=_S.selectedMyStore||'';_navSt.classList.toggle('hidden',!_S.selectedMyStore);}
      document.getElementById('navReportingBtn').classList.remove('hidden');
      document.getElementById('globalFilters').classList.remove('hidden');
      document.body.classList.add('pilot-loaded');
      if(!isRefilter){
        if(useMulti){document.getElementById('btnTabBench').classList.remove('hidden');buildBenchCheckboxes();}else document.getElementById('btnTabBench').classList.add('hidden');
        const _terrBtn=document.getElementById('btnTabTerritoire');_terrBtn.classList.remove('hidden');
        const _clientsBtn=document.getElementById('btnTabClients');if(_clientsBtn)_clientsBtn.classList.remove('hidden');
        const terrNoC=document.getElementById('terrNoChalandise');if(terrNoC)terrNoC.classList.toggle('hidden',_S.chalandiseReady);
      }
      // Render main UI immediately — don't wait for territoire
      computeClientCrossing();computeReconquestCohort();
      if(!isRefilter&&_S.chalandiseReady)_computeChalandiseDistances();
      // caByArticleCanal — skipped for isRefilter (ventesClientHorsMagasin unchanged)
      if (!isRefilter && _S.chalandiseReady) _rebuildCaByArticleCanal();
      if(_S.chalandiseReady&&DataStore.ventesClientArticle.size>0){launchClientWorker().then(()=>{computeOpportuniteNette();computeOmniScores();computeFamillesHors();generateDecisionQueue();renderIRABanner();renderTabBadges();updateLaboTiles();showToast('📊 Agrégats clients calculés','success');if(!isRefilter&&_S.selectedMyStore)_saveSessionToIDB();}).catch(err=>console.warn('Client worker error:',err));}
      _S.currentPage=0;if(isRefilter&&useMulti){invalidateCache('bench');const _rcp=(_S._reseauCanaux||new Set()).size===1?[...(_S._reseauCanaux||new Set())][0]:null;computeBenchmark(_rcp);}if(isRefilter){renderCanalAgence();renderCurrentTab();renderIRABanner();}else{renderAll();}if(useMulti){_buildObsUniversDropdown();buildBenchBassinSelect();renderBenchmark();launchReseauWorker().then(()=>{renderNomadesMissedArts();renderReseauOrphelins();}).catch(err=>console.warn('Réseau worker error:',err));}
      if(!isRefilter){_syncTabAccess();}
      if(_autoYTD){setPeriodePreset('YTD');}
      updateProgress(100,100,'✅ Prêt !',elapsed+'s');await new Promise(r=>setTimeout(r,400));
      renderSidebarAgenceSelector();
      if(!isRefilter){switchTab('labo');btn.textContent='✅ '+elapsed+'s';btn.classList.replace('s-panel-inner','bg-emerald-600');const _nbF=2+(document.getElementById('fileLivraisons')?.files[0]?1:0)+(document.getElementById('fileChalandise').files[0]?1:0);collapseImportZone(_nbF,_S.selectedMyStore,DataStore.finalData.length,elapsed);const btnR=document.getElementById('btnRecalculer');if(btnR)btnR.classList.remove('hidden');}else{btn.textContent='✅ '+elapsed+'s';btn.classList.replace('s-panel-inner','bg-emerald-600');}
      // IDB save — skipped for isRefilter (only saves on full load)
      if (!isRefilter && _S.selectedMyStore) { localStorage.setItem('prisme_selectedStore', _S.selectedMyStore); _saveToCache(); _saveSessionToIDB(); }
    }catch(error){if(error.message==='NO_STORE_SELECTED')return;showToast('❌ '+error.message,'error');console.error(error);btn.textContent='❌';btn.classList.replace('s-panel-inner','bg-red-600');}
    finally{btn.disabled=false;hideLoading();}
    if(isRefilter&&_S.territoireReady){renderTerritoireTab();}
  }


  // V24.4+: Render canal distribution block — enriched with prélevé/enlevé CA
  function renderCanalAgence(){
    const el=document.getElementById('canalAgenceBlock');if(!el)return;
    const wrapper=document.getElementById('terrCanalBlock');
    const CANAL_ORDER=['MAGASIN','REPRESENTANT','INTERNET','DCS','AUTRE'];
    const CANAL_LABELS={MAGASIN:'🏪 Magasin',INTERNET:'🌐 Web',DCS:'🏢 DCS',REPRESENTANT:'🤝 Représentant',AUTRE:'📦 Autre'};
    const CANAL_COLORS={MAGASIN:'#3b82f6',INTERNET:'#8b5cf6',DCS:'#f97316',REPRESENTANT:'#10b981',AUTRE:'#94a3b8'};
    const _webDisplayCA=v=>Math.max(0,(v.caP||0)+(v.caE||0));
    const _activeCanal=_S._globalCanal||'';
    // La répartition n'a de sens qu'en vue tous canaux — masquer quand filtre actif
    if(_activeCanal){if(wrapper)wrapper.classList.add('hidden');return;}
    // Filtrage client-aware : recalculer CA local si des filtres Commerce sont actifs
    const _filterActive=_S.chalandiseReady&&(_S._selectedDepts.size||_S._selectedClassifs.size||_S._selectedStatuts.size||_S._selectedActivitesPDV.size||_S._selectedDirections.size||_S._selectedUnivers.size||_S._selectedCommercial||_S._selectedMetier||_S._filterStrategiqueOnly||_S._selectedStatutDetaille);
    let _canalData=_S.canalAgence;
    const _subtitleEl=document.getElementById('canalAgenceSubtitle');
    if(_filterActive){
      const _local={};let _nbF=0;
      for(const[cc,info] of _S.chalandiseData.entries()){
        if(!_clientPassesFilters(info,cc))continue;
        _nbF++;
        const _mag=_S.ventesClientArticle.get(cc);
        if(_mag){let _mCA=0,_mCAP=0;for(const d of _mag.values()){_mCA+=d.sumCA||0;_mCAP+=d.sumCAPrelevee||0;}if(_mCA>0){if(!_local.MAGASIN)_local.MAGASIN={ca:0,caP:0,caE:0,bl:0};_local.MAGASIN.ca+=_mCA;_local.MAGASIN.caP+=_mCAP;_local.MAGASIN.caE+=_mCA-_mCAP;}}
        const _hors=_S.ventesClientHorsMagasin.get(cc);
        if(_hors){for(const d of _hors.values()){const _c=d.canal||'AUTRE';const _ca=d.sumCA||0;if(_ca<=0)continue;if(!_local[_c])_local[_c]={ca:0,caP:0,caE:0,bl:0};_local[_c].ca+=_ca;_local[_c].caE+=_ca;}}
      }
      _canalData=_local;
      if(_subtitleEl)_subtitleEl.textContent=`Filtré sur ${_nbF.toLocaleString('fr-FR')} client${_nbF>1?'s':''}`;
    }else{
      if(_subtitleEl)_subtitleEl.textContent='CA tous canaux · Magasin = Prélevé + Enlevé · Source : consommé';
    }
    const entries=CANAL_ORDER.map(c=>[c,_canalData[c]]).filter(([c,v])=>v&&(c!=='MAGASIN'?_webDisplayCA(v):(v.ca||0))>0);
    if(!entries.length){el.innerHTML='<p class="t-disabled text-sm p-4">Aucune donnée canal.</p>';if(wrapper)wrapper.classList.add('hidden');return;}
    if(wrapper)wrapper.classList.remove('hidden');
    const totalCA=entries.reduce((s,[c,v])=>s+(c!=='MAGASIN'?_webDisplayCA(v):(v.ca||0)),0)||1;
    let html='<div class="overflow-x-auto"><table class="min-w-full text-xs"><thead class="s-panel-inner t-inverse font-bold"><tr>';
    html+='<th class="py-2 px-3 text-left">Canal</th>';
    html+='<th class="py-2 px-3 text-right">Prélevé</th>';
    html+='<th class="py-2 px-3 text-right">Enlevé</th>';
    html+='<th class="py-2 px-3 text-right">Total CA</th>';
    html+='<th class="py-2 px-3 text-right">% du CA</th>';
    html+='<th class="py-2 px-3 text-center">Répartition</th>';
    html+='</tr></thead><tbody>';
    for(const[canal,data] of entries){
      const label=CANAL_LABELS[canal]||canal;
      const color=CANAL_COLORS[canal]||CANAL_COLORS.AUTRE;
      const isWeb=canal!=='MAGASIN';
      const isMag=canal==='MAGASIN';
      const dispCA=isWeb?_webDisplayCA(data):(data.ca||0);
      const pct=Math.round(dispCA/totalCA*100);
      const barW=Math.max(pct,2);
      const _caP=isWeb?0:Math.max(0,data.caP||0);const _caE=isWeb?Math.max(0,(data.caP||0)+(data.caE||0)):Math.max(0,data.caE||0);
      const prevCell=_caP>0?`<td class="py-2 px-3 text-right font-bold t-primary">${formatEuro(_caP)}</td>`:`<td class="py-2 px-3 text-right t-disabled">—</td>`;
      const enlevCell=_caE>0?`<td class="py-2 px-3 text-right t-secondary">${formatEuro(_caE)}</td>`:`<td class="py-2 px-3 text-right t-disabled">—</td>`;
      const _barTip=_caP>0?`Prélevé\u00a0: ${formatEuro(_caP)} · Enlevé\u00a0: ${formatEuro(_caE)}`:`Enlevé\u00a0: ${formatEuro(_caE)}`;
      let _barHtml;
      if(_caP>0){
        const _tot=Math.max(data.ca||0,_caP+_caE)||1;
        const _pW=(_caP/_tot*barW).toFixed(1);
        const _eW=(_caE/_tot*barW).toFixed(1);
        _barHtml=`<div class="w-32 s-hover rounded-full h-3 overflow-hidden" title="${_barTip}"><div style="display:flex;height:100%;width:${barW}%"><div style="flex:${_pW};background:${color};border-radius:9999px 0 0 9999px"></div>${parseFloat(_eW)>0?`<div style="flex:${_eW};background:${color};opacity:0.4;border-radius:0 9999px 9999px 0"></div>`:''}</div></div>`;
      }else{
        _barHtml=`<div class="w-32 s-hover rounded-full h-3 overflow-hidden" title="${_barTip}"><div style="width:${barW}%;background:${color};height:100%;border-radius:9999px"></div></div>`;
      }
      html+=`<tr class="border-b b-light cursor-pointer transition-colors hover:s-card-alt ${isMag?'font-semibold':''}" onclick="openCanalDrill('${canal}')" title="Voir le détail par famille">`;
      html+=`<td class="py-2 px-3 font-bold" style="color:${color}">${label}</td>`;
      html+=prevCell;
      html+=enlevCell;
      html+=`<td class="py-2 px-3 text-right font-extrabold" style="color:${color}">${formatEuro(dispCA)}</td>`;
      html+=`<td class="py-2 px-3 text-right font-bold t-secondary">${pct}%</td>`;
      html+=`<td class="py-2 px-3">${_barHtml}</td>`;
      html+='</tr>';
    }
    const totalP=entries.reduce((s,[c,v])=>s+(c!=='MAGASIN'?0:Math.max(0,v.caP||0)),0);
    const totalE=entries.reduce((s,[c,v])=>s+(c!=='MAGASIN'?Math.max(0,(v.caP||0)+(v.caE||0)):Math.max(0,v.caE||0)),0);
    html+=`<tr class="border-t-2 b-dark font-extrabold t-primary">`;
    html+=`<td class="py-2 px-3">TOTAL</td>`;
    html+=`<td class="py-2 px-3 text-right">${formatEuro(totalP)}</td>`;
    html+=`<td class="py-2 px-3 text-right">${formatEuro(totalE)}</td>`;
    html+=`<td class="py-2 px-3 text-right c-action">${formatEuro(totalCA)}</td>`;
    html+=`<td class="py-2 px-3 text-right">100%</td>`;
    html+=`<td></td></tr>`;
    html+='</tbody></table></div>';
    el.innerHTML=html;
  }

  let _canalDrillState={canal:null,famCode:null};

  function openCanalDrill(canal){
    const overlay=document.getElementById('articlePanelOverlay');
    const panel=document.getElementById('articlePanel');
    if(!overlay||!panel)return;
    _canalDrillState={canal,famCode:null};
    panel.style.maxWidth='560px';
    panel.innerHTML=_renderCanalDrill(canal);
    overlay.classList.add('active');
  }

  function openCanalDrillArticles(canal,famCode){
    const panel=document.getElementById('articlePanel');
    if(!panel)return;
    _canalDrillState={canal,famCode};
    panel.innerHTML=_renderCanalDrillArticles(canal,famCode);
  }

  function closeCanalDrill(){closeArticlePanel();}

  function _canalFamData(canal){
    // Returns {famCode:{ca,nbArt}} for the given canal, respecting filterFamille
    const filterFam=(document.getElementById('filterFamille')?.value||'').trim().toLowerCase();
    const famData={};
    const _matchFam=(r)=>{
      if(!filterFam)return true;
      const fc=(r.famille||'').toLowerCase();
      const fl=famLib(r.famille).toLowerCase();
      const flbl=famLabel(r.famille).toLowerCase();
      return fc.includes(filterFam)||fl.includes(filterFam)||flbl.includes(filterFam);
    };
    if(canal==='MAGASIN'){
      for(const r of DataStore.finalData){
        if(!r.famille||(r.caAnnuel||0)<=0)continue;
        if(!_matchFam(r))continue;
        if(!famData[r.famille])famData[r.famille]={ca:0,nbArt:0};
        famData[r.famille].ca+=r.caAnnuel||0;
        famData[r.famille].nbArt++;
      }
    }else if(canal==='INTERNET'||canal==='REPRESENTANT'||canal==='DCS'){
      if(!_S.chalandiseReady)return null; // data not available without chalandise
      const caField=canal==='INTERNET'?'caWeb':canal==='REPRESENTANT'?'caRep':'caDcs';
      for(const r of DataStore.finalData){
        if(!r.famille||(r[caField]||0)<=0)continue;
        if(!_matchFam(r))continue;
        if(!famData[r.famille])famData[r.famille]={ca:0,nbArt:0};
        famData[r.famille].ca+=r[caField]||0;
        famData[r.famille].nbArt++;
      }
    }else{
      // Canal sans caField pré-calculé (ex: AUTRE) — derive from articleCanalCA
      if(!_S.articleCanalCA.size)return null;
      for(const r of DataStore.finalData){
        if(!r.famille)continue;
        if(!_matchFam(r))continue;
        const ca=_S.articleCanalCA.get(r.code)?.get(canal)?.ca||0;
        if(ca<=0)continue;
        if(!famData[r.famille])famData[r.famille]={ca:0,nbArt:0};
        famData[r.famille].ca+=ca;
        famData[r.famille].nbArt++;
      }
    }
    return famData;
  }

  function _renderCanalDrill(canal){
    const CANAL_LABELS={MAGASIN:'🏪 Magasin',INTERNET:'🌐 Web',DCS:'🏢 DCS',REPRESENTANT:'🤝 Représentant',AUTRE:'📦 Autre'};
    const CANAL_COLORS={MAGASIN:'#3b82f6',INTERNET:'#8b5cf6',DCS:'#f97316',REPRESENTANT:'#10b981',AUTRE:'#94a3b8'};
    const label=CANAL_LABELS[canal]||canal;
    const color=CANAL_COLORS[canal]||'#94a3b8';
    const filterFamRaw=(document.getElementById('filterFamille')?.value||'').trim();
    const famData=_canalFamData(canal);
    const needsChalandise=(canal==='INTERNET'||canal==='REPRESENTANT'||canal==='DCS')&&!_S.chalandiseReady;
    const top10=famData?Object.entries(famData).sort((a,b)=>b[1].ca-a[1].ca).slice(0,10):[];
    const canalTotal=top10.reduce((s,[,d])=>s+d.ca,0)||1;
    const filterBadge=filterFamRaw?`<span class="text-[11px] px-2 py-0.5 rounded-full font-semibold" style="background:#7c3aed25;color:#a78bfa;border:1px solid #7c3aed40">Filtré : ${famLabel(filterFamRaw)}</span>`:'';
    let body='';
    if(needsChalandise){
      body=`<p class="text-xs t-inverse-muted py-4">Chargez la Zone de Chalandise pour le détail par famille sur ce canal.</p>`;
    }else if(!top10.length){
      body=`<p class="text-xs t-inverse-muted py-4">Aucune donnée famille pour ce canal${filterFamRaw?' avec ce filtre':''}.</p>`;
    }else{
      body=`<div class="overflow-x-auto mt-3"><table class="min-w-full text-xs"><thead><tr class="border-b" style="border-color:var(--b-darker)">`;
      body+=`<th class="py-1.5 px-3 text-left t-inverse-muted font-semibold">Famille</th>`;
      body+=`<th class="py-1.5 px-3 text-right t-inverse-muted font-semibold">CA</th>`;
      body+=`<th class="py-1.5 px-3 text-right t-inverse-muted font-semibold">% canal</th>`;
      body+=`<th class="py-1.5 px-3 text-right t-inverse-muted font-semibold">Nb art.</th>`;
      body+=`</tr></thead><tbody>`;
      for(const[fc,d] of top10){
        const pct=Math.round(d.ca/canalTotal*100);
        const barW=Math.max(pct,2);
        body+=`<tr class="border-b cursor-pointer transition-colors hover:s-card-alt" style="border-color:var(--b-darker)" onclick="openCanalDrillArticles('${canal}','${fc}')" title="Voir les articles">`;
        body+=`<td class="py-1.5 px-3 font-semibold t-inverse">${famLabel(fc)} <span class="t-disabled text-[10px]">›</span></td>`;
        body+=`<td class="py-1.5 px-3 text-right font-bold" style="color:${color}">${formatEuro(d.ca)}</td>`;
        body+=`<td class="py-1.5 px-3 text-right t-inverse-muted"><div class="flex items-center justify-end gap-1.5">${pct}%<div class="w-16 rounded-full h-1.5 overflow-hidden" style="background:var(--b-darker)"><div style="width:${barW}%;background:${color};height:100%;border-radius:9999px"></div></div></div></td>`;
        body+=`<td class="py-1.5 px-3 text-right t-inverse-muted">${d.nbArt}</td>`;
        body+=`</tr>`;
      }
      body+=`</tbody></table></div>`;
    }
    return `<div>
      <div class="flex items-center justify-between mb-4">
        <div>
          <h2 class="font-extrabold text-base text-white" style="color:${color}">Détail canal — ${label}</h2>
          ${filterBadge?`<div class="mt-1">${filterBadge}</div>`:''}
        </div>
        <div class="flex gap-2 items-center shrink-0 ml-3">
          ${(!needsChalandise&&top10.length)?`<button onclick="exportCanalDrillCSV('${canal}')" class="diag-btn" style="background:#1e3a8a30;color:#93c5fd;border:1px solid #1e40af50">📥 CSV</button>`:''}
          <button onclick="closeArticlePanel()" class="diag-btn" style="background:var(--s-panel-inner);color:var(--t-inverse-muted);border:1px solid var(--b-dark)">✕</button>
        </div>
      </div>
      ${body}
    </div>`;
  }

  function _canalArtData(canal,famCode){
    // Returns [{code,libelle,ca,freq}] for given canal+family, sorted by CA desc
    const caField=canal==='MAGASIN'?'caAnnuel':canal==='INTERNET'?'caWeb':canal==='REPRESENTANT'?'caRep':canal==='DCS'?'caDcs':null;
    if(!caField){
      // Canal sans caField pré-calculé (ex: AUTRE) — derive from articleCanalCA
      if(!_S.articleCanalCA.size)return[];
      const arts=[];
      for(const r of DataStore.finalData){
        if(r.famille!==famCode)continue;
        const ca=_S.articleCanalCA.get(r.code)?.get(canal)?.ca||0;
        if(ca<=0)continue;
        arts.push({code:r.code,libelle:_S.libelleLookup[r.code]||r.code,ca,freq:r.W||0});
      }
      return arts.sort((a,b)=>b.ca-a.ca);
    }
    if((canal==='INTERNET'||canal==='REPRESENTANT'||canal==='DCS')&&!_S.chalandiseReady)return[];
    const arts=[];
    for(const r of DataStore.finalData){
      if(r.famille!==famCode)continue;
      const ca=r[caField]||0;
      if(ca<=0)continue;
      arts.push({code:r.code,libelle:_S.libelleLookup[r.code]||r.code,ca,freq:r.W||0});
    }
    return arts.sort((a,b)=>b.ca-a.ca);
  }

  function _renderCanalDrillArticles(canal,famCode){
    const CANAL_LABELS={MAGASIN:'🏪 Magasin',INTERNET:'🌐 Web',DCS:'🏢 DCS',REPRESENTANT:'🤝 Représentant',AUTRE:'📦 Autre'};
    const CANAL_COLORS={MAGASIN:'#3b82f6',INTERNET:'#8b5cf6',DCS:'#f97316',REPRESENTANT:'#10b981',AUTRE:'#94a3b8'};
    const label=CANAL_LABELS[canal]||canal;
    const color=CANAL_COLORS[canal]||'#94a3b8';
    const famName=famLabel(famCode);
    const arts=_canalArtData(canal,famCode);
    const famTotal=arts.reduce((s,a)=>s+a.ca,0)||1;
    let body='';
    if(!arts.length){
      body=`<p class="text-xs t-inverse-muted py-4">Aucun article pour cette famille sur ce canal.</p>`;
    }else{
      body=`<div class="overflow-x-auto mt-3"><table class="min-w-full text-xs"><thead><tr class="border-b" style="border-color:var(--b-darker)">`;
      body+=`<th class="py-1.5 px-3 text-left t-inverse-muted font-semibold">Code</th>`;
      body+=`<th class="py-1.5 px-3 text-left t-inverse-muted font-semibold">Article</th>`;
      body+=`<th class="py-1.5 px-3 text-right t-inverse-muted font-semibold">CA</th>`;
      body+=`<th class="py-1.5 px-3 text-right t-inverse-muted font-semibold">Fréq.</th>`;
      body+=`<th class="py-1.5 px-3 text-right t-inverse-muted font-semibold">% famille</th>`;
      body+=`</tr></thead><tbody>`;
      for(const a of arts){
        const pct=Math.round(a.ca/famTotal*100);
        body+=`<tr class="border-b" style="border-color:var(--b-darker)">`;
        body+=`<td class="py-1.5 px-3 font-mono t-inverse-muted">${a.code}</td>`;
        body+=`<td class="py-1.5 px-3 t-inverse max-w-[180px] truncate" title="${escapeHtml(a.libelle)}">${escapeHtml(a.libelle)}</td>`;
        body+=`<td class="py-1.5 px-3 text-right font-bold" style="color:${color}">${formatEuro(a.ca)}</td>`;
        body+=`<td class="py-1.5 px-3 text-right t-inverse-muted">${a.freq}</td>`;
        body+=`<td class="py-1.5 px-3 text-right t-inverse-muted">${pct}%</td>`;
        body+=`</tr>`;
      }
      body+=`</tbody></table></div>`;
    }
    return `<div>
      <div class="flex items-center justify-between mb-4">
        <div class="flex items-center gap-2">
          <button onclick="openCanalDrill('${canal}')" class="diag-btn shrink-0" style="background:var(--s-panel-inner);color:var(--t-inverse-muted);border:1px solid var(--b-dark)" title="Retour aux familles">←</button>
          <div>
            <h2 class="font-extrabold text-base" style="color:${color}">Détail canal — ${label} › ${escapeHtml(famName)}</h2>
          </div>
        </div>
        <div class="flex gap-2 items-center shrink-0 ml-3">
          ${arts.length?`<button onclick="exportCanalDrillCSV('${canal}','${famCode}')" class="diag-btn" style="background:#1e3a8a30;color:#93c5fd;border:1px solid #1e40af50">📥 CSV</button>`:''}
          <button onclick="closeArticlePanel()" class="diag-btn" style="background:var(--s-panel-inner);color:var(--t-inverse-muted);border:1px solid var(--b-dark)">✕</button>
        </div>
      </div>
      ${body}
    </div>`;
  }

  function exportCanalDrillCSV(canal,famCode){
    const CANAL_LABELS={MAGASIN:'Magasin',INTERNET:'Web',DCS:'DCS',REPRESENTANT:'Representant',AUTRE:'Autre'};
    const canalName=CANAL_LABELS[canal]||canal;
    if(famCode){
      // Articles level
      const arts=_canalArtData(canal,famCode);
      if(!arts.length)return;
      const total=arts.reduce((s,a)=>s+a.ca,0)||1;
      let csv='Code;Article;CA;Fréq.;% famille\n';
      for(const a of arts){
        const p=Math.round(a.ca/total*100);
        csv+=`"${a.code}";"${a.libelle.replace(/"/g,'""')}";${a.ca.toFixed(2)};${a.freq};${p}%\n`;
      }
      const blob=new Blob(['\uFEFF'+csv],{type:'text/csv;charset=utf-8;'});
      const el=document.createElement('a');el.href=URL.createObjectURL(blob);
      el.download=`canal_${canalName}_${famCode}.csv`;el.click();
    }else{
      // Families level
      const famData=_canalFamData(canal);
      if(!famData)return;
      const rows=Object.entries(famData).sort((a,b)=>b[1].ca-a[1].ca);
      const total=rows.reduce((s,[,d])=>s+d.ca,0)||1;
      let csv='Famille;CA;% canal;Nb art.\n';
      for(const[fc,d] of rows){
        const p=Math.round(d.ca/total*100);
        csv+=`"${famLabel(fc)}";${d.ca.toFixed(2)};${p}%;${d.nbArt}\n`;
      }
      const filterFamRaw=(document.getElementById('filterFamille')?.value||'').trim();
      const suffix=filterFamRaw?`_fam_${filterFamRaw}`:'';
      const blob=new Blob(['\uFEFF'+csv],{type:'text/csv;charset=utf-8;'});
      const a=document.createElement('a');a.href=URL.createObjectURL(blob);
      a.download=`canal_${canalName}${suffix}.csv`;a.click();
    }
  }

  function _renderFamilleCanal(){
    const el=document.getElementById('terrFamilleCanal');if(!el)return;
    const caMag=_S.canalAgence['MAGASIN']?.ca||0;
    const caWeb=_S.canalAgence['INTERNET']?.ca||0;
    const caRep=_S.canalAgence['REPRESENTANT']?.ca||0;
    const caDcs=_S.canalAgence['DCS']?.ca||0;
    const caAutre=_S.canalAgence['AUTRE']?.ca||0;
    const caHors=caWeb+caRep+caDcs+caAutre;
    const caTotal=caMag+caHors;
    const tauxObs=caTotal>0?Math.round(caHors/caTotal*100):0;
    const _rfCanal=_S._globalCanal||'';
    let html;
    if(_rfCanal){
      // [Feature C] filtre canal actif : afficher uniquement la ligne du canal sélectionné
      const _canalLabels={MAGASIN:'Magasin',INTERNET:'Web',REPRESENTANT:'Représentant',DCS:'DCS',AUTRE:'Autre'};
      const _canalData=_S.canalAgence[_rfCanal]||{ca:0,caP:0,caE:0};
      const _canalCA=_rfCanal==='MAGASIN'?(_canalData.ca||0):Math.max(0,_canalData.caE||0);
      const _canalLabel=_canalLabels[_rfCanal]||_rfCanal;
      let _subHtml='';
      if(_rfCanal==='MAGASIN'&&_canalCA>0){
        const _caP=Math.max(0,_canalData.caP||0);const _caE=Math.max(0,_canalData.caE||0);
        const _pctP=Math.round(_caP/_canalCA*100);const _pctE=Math.round(_caE/_canalCA*100);
        _subHtml=`<div class="flex gap-4 mt-2 text-xs"><span class="t-secondary">Prélevé : <strong class="t-primary">${formatEuro(_caP)}</strong> <span class="t-disabled">(${_pctP}%)</span></span><span class="t-secondary">Enlevé : <strong class="t-primary">${formatEuro(_caE)}</strong> <span class="t-disabled">(${_pctE}%)</span></span></div>`;
      }
      html=`<div class="mb-3 p-3 s-card rounded-xl border">
        <p class="text-sm font-bold t-primary mb-1">🔵 Canal filtré : ${_canalLabel}</p>
        <p class="text-2xl font-extrabold c-action">${formatEuro(_canalCA)} <span class="text-sm font-normal t-tertiary">CA ${_canalLabel} total</span></p>
        ${_subHtml}
        <p class="text-[10px] t-disabled mt-1">Filtre actif — seul le canal <strong>${_canalLabel}</strong> est affiché · <button class="underline cursor-pointer" onclick="_setGlobalCanal('')">Voir tous les canaux</button></p>
      </div>`;
    }else{
      html=`<div class="mb-3 p-3 s-card rounded-xl border">
        <p class="text-sm font-bold t-primary mb-1">📡 Omnicanalité zone
          <span class="text-[10px] font-normal t-disabled ml-1" title="Calculé sur les clients identifiés dans votre chalandise. Le taux réel peut être inférieur si des clients importants sont hors zone.">ⓘ</span>
        </p>
        <p class="text-2xl font-extrabold c-action">${tauxObs}% <span class="text-sm font-normal t-tertiary">du CA identifié passe hors agence</span></p>
        <p class="text-[10px] t-disabled mt-1">MAGASIN ${formatEuro(caMag)} · WEB ${formatEuro(caWeb)} · REP ${formatEuro(caRep)} · DCS ${formatEuro(caDcs)}${caAutre>0?' · AUTRE '+formatEuro(caAutre):''}</p>
      </div>`;
    }
    if(_S.chalandiseReady&&_S.caByArticleCanal.size){
      const famCanal={};
      for(const r of DataStore.finalData){
        if(!r.famille)continue;
        const _fk=famLib(r.famille);
        if(!famCanal[_fk])famCanal[_fk]={mag:0,hors:0};
        famCanal[_fk].mag+=r.caAnnuel||0;
        famCanal[_fk].hors+=r.caHorsMagasin||0;
      }
      // Compter les clients distincts par famille (via ventesClientHorsMagasin)
      const artFamMap=new Map();
      for(const r of DataStore.finalData){if(r.famille&&r.code)artFamMap.set(r.code,famLib(r.famille));}
      const famClients={};
      for(const[cc,artMap] of _S.ventesClientHorsMagasin.entries()){
        const famsSeen=new Set();
        for(const code of artMap.keys()){
          const fk=artFamMap.get(code);
          if(fk&&!famsSeen.has(fk)){famsSeen.add(fk);if(!famClients[fk])famClients[fk]=new Set();famClients[fk].add(cc);}
        }
      }
      const rows=Object.entries(famCanal)
        .filter(([fk,d])=>d.hors>=ONLINE_FAM_MIN_CA_HORS&&(d.mag+d.hors)>=ONLINE_FAM_MIN_CA_TOTAL&&(famClients[fk]?.size||0)>=ONLINE_FAM_MIN_CLIENTS)
        .sort((a,b)=>{
          const ta=a[1].mag+a[1].hors>0?a[1].hors/(a[1].mag+a[1].hors):0;
          const tb=b[1].mag+b[1].hors>0?b[1].hors/(b[1].mag+b[1].hors):0;
          return tb-ta;
        })
        .slice(0,5);
      if(rows.length){
        html+=`<div class="s-card rounded-xl border overflow-hidden">
          <div class="px-3 py-2 border-b s-card-alt flex items-center gap-2">
            <span class="font-bold text-sm t-primary">Familles à fort achat en ligne</span>
            <span class="text-[10px] t-disabled" title="Source : clients de la zone de chalandise uniquement.">ⓘ</span>
          </div>
          <table class="min-w-full text-xs">
            <thead class="s-panel-inner t-inverse">
              <tr>
                <th class="py-1.5 px-3 text-left">Famille</th>
                <th class="py-1.5 px-3 text-right">CA Magasin</th>
                <th class="py-1.5 px-3 text-right">CA Hors agence</th>
                <th class="py-1.5 px-3 text-right">Taux observé <span class="font-normal t-disabled" title="Part du CA hors agence sur le total identifié (zone chalandise)">ⓘ</span></th>
                <th class="py-1.5 px-3"></th>
              </tr>
            </thead>
            <tbody>
              ${rows.map(([fam,d])=>{
                const taux=d.mag+d.hors>0?Math.round(d.hors/(d.mag+d.hors)*100):0;
                const col=taux>=50?'c-danger':taux>=30?'c-caution':'t-primary';
                return`<tr class="border-t b-light hover:s-card"><td class="py-1.5 px-3 font-semibold">${fam}</td><td class="py-1.5 px-3 text-right">${formatEuro(d.mag)}</td><td class="py-1.5 px-3 text-right">${formatEuro(d.hors)}</td><td class="py-1.5 px-3 text-right font-bold ${col}">${taux}%</td><td class="py-1.5 px-3 text-right"><button class="btn-xs s-hover" onclick="openDiagnostic('${fam.replace(/'/g,"\\'")}','terrain')">🔍 Diagnostiquer</button></td></tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>`;
      }
    }else if(!_S.chalandiseReady){
      html+=`<p class="text-[10px] t-disabled mt-2">Chargez la chalandise pour le détail par famille et par client.</p>`;
    }
    el.innerHTML=html;
  }

  // Close secteur dropdown on outside click
  document.addEventListener('click',function(e){
    const dd=document.getElementById('terrSecteurDropdown');
    if(dd&&!dd.contains(e.target)){const panel=document.getElementById('terrSecteurPanel');if(panel)panel.classList.add('hidden');}
  });

  // A4: Fantômes de rayon — en stock mais que personne n'achète au comptoir
  function computePhantomArticles(){
    _S.phantomArticles=[];if(!_S.cockpitLists?.phantom)return;_S.cockpitLists.phantom.clear();
    if(!DataStore.finalData.length)return;
    // soldAtPDV = articles vendus en MAGASIN uniquement (ventesClientArticle = canal MAGASIN)
    // _S.articleClients agrège tous canaux — utiliser ventesClientArticle (filtré MAGASIN) à la place
    const soldAtPDV=new Set();
    for(const[,artMap]of DataStore.ventesClientArticle.entries()){for(const code of artMap.keys())soldAtPDV.add(code);}
    _S.phantomArticles=DataStore.finalData.filter(r=>r.stockActuel>0&&!r.isParent&&/^\d{6}$/.test(r.code)&&!soldAtPDV.has(r.code)).sort((a,b)=>(b.stockActuel*b.prixUnitaire)-(a.stockActuel*a.prixUnitaire));
    _S.phantomArticles.forEach(r=>_S.cockpitLists.phantom.add(r.code));
  }

  function _setTerrClientsCanalFilter(val){_S.terrClientsCanalFilter=val;renderTerritoireTab();}


  // ── Onglet Omnicanalité — canal, famille×canal, segments, analyse territoire ──
  function renderOmniTab(){
    renderCanalAgence();
    _renderFamilleCanal();
    _buildTerrOmniBlock();
    // Populate territory accordion content (Direction, Top 100, Contributeurs, etc.)
    // renderTerritoireTab also populates Commerce tab elements — harmless cross-tab render
    renderTerritoireTab();
    // Analyse territoire accordion visibility
    const hasTerr=_S.territoireReady&&_S.territoireLines.length>0;
    const hasChal=_S.chalandiseReady;
    const terrNeedBlock=document.getElementById('terrNeedTerrBlock');
    if(terrNeedBlock)terrNeedBlock.classList.toggle('hidden',hasTerr);
    // Show/hide territoire-dependent blocks inside accordion
    ['terrCroisementBlock','terrKPIBlock','terrSpecialKPIBlock','terrDirectionBlock','terrContribBlock','terrTop100Block','terrClientsBlock'].forEach(id=>{
      const el=document.getElementById(id);if(el){el.style.display=hasTerr?'':'none';el.classList.toggle('hidden',!hasTerr);}
    });
    const terrOverview=document.getElementById('terrChalandiseOverview');
    if(terrOverview)terrOverview.classList.toggle('hidden',!hasChal||!hasTerr);
    const comBlock=document.getElementById('commercialSummaryBlock');
    if(comBlock)comBlock.classList.toggle('hidden',!hasTerr);
  }

  // ── Couche de dérivation canal — Étape 3 ────────────────────────────────
  // Lit les structures existantes, zéro re-parsing, zéro modification de finalData.
  // Invariant : finalData (MIN/MAX, ABC/FMR, V) reste stable quelle que soit la valeur de canal.
  function getKPIsByCanal(canal) {
    const _c = canal && canal !== 'ALL' ? canal : null;
    const hasTerritoire = _S.territoireReady && _S.territoireLines.length > 0;
    const terrLines = _c ? DataStore.filteredTerritoireLines.filter(l => l.canal === _c) : DataStore.filteredTerritoireLines;
    return {
      canal: _c || 'ALL',
      // Stats canal depuis canalAgence (déjà agrégé au parsing, accès O(1))
      canalStats: _c ? (_S.canalAgence[_c] || { bl: 0, ca: 0, caP: 0, caE: 0 }) : _S.canalAgence,
      totalCA: Object.values(_S.canalAgence).reduce((s, v) => s + v.ca, 0),
      // Lignes territoire filtrées par canal (dérivées de territoireLines, source brute conservée)
      terrLines,
      // [F1 fix] En mode dégradé (pas de fichier territoire), articleFacts fournit les CA canal
      // depuis le consommé agence — source différente de territoireLines (agence ≠ omnicanal)
      articleFacts: !hasTerritoire ? _S.articleCanalCA : null,
      // finalData est un invariant canal — jamais recalculé au changement de filtre
      finalData: DataStore.finalData,
      // capabilities : permet aux consommateurs d'adapter leur rendu sans hardcoder des vérifications
      capabilities: {
        hasTerritoire,
        hasArticleFacts: _S.articleCanalCA.size > 0,
      },
    };
  }

  // ── Omnicanalité & Momentum — Le Terrain Sprint 5 ────────────────────────
  function _buildTerrOmniBlock(){
    const el=document.getElementById('terrOmniBlock');
    if(!el)return;
    const hasHors=_S.ventesClientHorsMagasin?.size>0;
    const hasCom=_S.clientsByCommercial?.size>1;
    const hasOmni=_S.clientOmniScore?.size>0;
    if(!hasHors&&!hasCom&&!hasOmni){el.innerHTML='';return;}
    let inner='';
    // ── Segments omnicanaux ───────────────────────────────────────────────
    if(hasOmni){
      let nMono=0,nHybride=0,nDigital=0,nDormant=0,caMono=0,caHybride=0,caDigital=0,caDormant=0;
      for(const[cc,o]of _S.clientOmniScore){
        if(!_passesAllFilters(cc))continue;
        if(o.segment==='mono'){nMono++;caMono+=o.caPDV||0;}
        else if(o.segment==='hybride'){nHybride++;caHybride+=(o.caPDV||0)+(o.caHors||0);}
        else if(o.segment==='digital'){nDigital++;caDigital+=o.caPDV||0;}
        else{nDormant++;}
      }
      const total=nMono+nHybride+nDigital+nDormant||1;
      const pctM=Math.round(nMono/total*100),pctH=Math.round(nHybride/total*100),pctD=Math.round(nDigital/total*100),pctDor=Math.max(0,100-pctM-pctH-pctD);
      const _nExclMag=[..._S.ventesClientArticle.keys()].filter(c=>!_S.ventesClientHorsMagasin.has(c)).length;
      const _totalTip=`${total} clients analysés = union MAGASIN (${_S.ventesClientArticle.size}) + hors-agence, après filtres actifs. Clients exclusivement PDV (caHors = 0 €) : ${_nExclMag}. Mono PDV = caHors strict = 0 €, actifs ≤ 180 j — aligné sur le tableau Top PDV (seuil 100 €).`;
      const _segTips={'Mono PDV':`Aucun achat hors-agence (caHors = 0 €) ET actifs ≤ 180 j de silence. Critère strict aligné sur le tableau Top PDV (seuil 100 €). (${nMono} sur ${total} analysés)`,'Hybrides':`CA PDV > 0 ET CA hors-agence > 0 € et non dominant (caHors ≤ caPDV × 1,5). Acheteurs mixtes PDV + digital.`,'Digital':`CA hors-agence > 0 € et dominant (caHors > caPDV × 1,5 ou CA PDV < 50 €). Acheteurs principalement en ligne ou via rep.`,'Dormants':`Silence > 180 jours ET aucun achat hors-agence (caHors = 0 €). Clients inactifs sur tous les canaux.`};
      inner+=`<div class="s-card rounded-xl border p-4"><h3 class="text-[11px] font-bold t-secondary uppercase tracking-wider mb-2">📡 Segments omnicanaux <span class="font-normal normal-case t-disabled cursor-help" title="${_totalTip}">${total} clients</span></h3><div class="grid grid-cols-4 gap-2 mb-2">${[
        [nMono,caMono,'Mono PDV','🏪','var(--c-ok)',"window._setClientView('tous')",''],[nHybride,caHybride,'Hybrides','🔀','var(--c-info,#3b82f6)',"window._toggleHorsAgence()","multicanaux"],[nDigital,caDigital,'Digital','📱','var(--c-caution)',"window._toggleHorsAgence()","multicanaux"],[nDormant,0,'Dormants','💤','var(--c-danger)',"window._toggleDormants()","dormants"]
      ].map(([n,ca,label,icon,color,onclick,viewKey])=>{if(!n)return'';const isActive=viewKey&&_S._clientView===viewKey;return`<div class="flex flex-col items-center p-2 rounded-xl border cursor-pointer hover:brightness-95 transition-all ${isActive?'s-panel-inner':'s-card'}" style="${isActive?'box-shadow:0 0 0 2px '+color:''}" title="${_segTips[label]||''}" onclick="${onclick}"><span class="text-base leading-none mb-1">${icon}</span><span class="text-[13px] font-extrabold t-primary">${n}</span><span class="text-[9px] t-disabled">${label}</span>${ca>0?`<span class="text-[9px] font-bold mt-0.5" style="color:${color}">${formatEuro(ca)}</span>`:''}</div>`;}).join('')}</div><div class="flex h-1.5 rounded-full overflow-hidden"><div style="width:${pctM}%;background:var(--c-ok)"></div><div style="width:${pctH}%;background:var(--c-info,#3b82f6)"></div><div style="width:${pctD}%;background:var(--c-caution)"></div><div style="width:${pctDor}%;background:var(--c-danger);opacity:0.4"></div></div></div>`;
    }
    // ── Momentum commercial ───────────────────────────────────────────────
    if(hasCom){
      const now=new Date();
      const rows=[];
      for(const[com,ccs]of _S.clientsByCommercial){
        if(!com||!ccs.size)continue;
        if(_S._selectedCommercial&&com!==_S._selectedCommercial)continue;
        let nbRecent=0,nbAtRisk=0,nbSilent=0,nbUnknown=0,caActif=0,caRisque=0;
        for(const cc of ccs){
          if(!_passesAllFilters(cc))continue;
          const lastDate=_S.clientLastOrder?.get(cc);
          const arts=_S.ventesClientArticle?.get(cc);
          const ca=arts?[...arts.values()].reduce((s,v)=>s+(v.sumCA||0),0):0;
          if(!lastDate){nbUnknown++;continue;}
          const d=Math.round((now-lastDate)/86400000);
          if(d<30){nbRecent++;caActif+=ca;}
          else if(d<90){nbAtRisk++;caActif+=ca;}
          else{nbSilent++;caRisque+=ca;}
        }
        const nbTotal=ccs.size-nbUnknown;if(nbTotal===0)continue;
        const momentum=Math.round((nbRecent*2+nbAtRisk)/(nbTotal*2)*100);
        rows.push({com,nbRecent,nbAtRisk,nbSilent,nbTotal,caActif,caRisque,momentum});
      }
      rows.sort((a,b)=>a.momentum-b.momentum||b.caRisque-a.caRisque);
      if(rows.length){
        const cards=rows.map(r=>{
          const pctR=Math.round(r.nbRecent/r.nbTotal*100),pctA=Math.round(r.nbAtRisk/r.nbTotal*100),pctS=Math.max(0,100-pctR-pctA);
          const mColor=r.momentum>=65?'var(--c-ok)':r.momentum>=35?'var(--c-caution)':'var(--c-danger)';
          const mLabel=r.momentum>=65?'⬆ Dynamique':r.momentum>=35?'➡ Stable':'⬇ En recul';
          const comShort=r.com.includes(' - ')?r.com.split(' - ').slice(1).join(' '):r.com;
          const safeQ=r.com.replace(/\\/g,'\\\\').replace(/'/g,"\\'");
          return`<div class="s-card rounded-xl border p-3 cursor-pointer hover:s-hover transition-all" onclick="_goCommercial('${safeQ}')"><div class="flex items-start justify-between mb-2"><div><div class="text-[11px] font-bold t-primary">${comShort}</div><div class="text-[9px] t-disabled">${r.nbTotal} clients · score\u00a0${r.momentum}</div></div><span class="text-[9px] font-bold shrink-0" style="color:${mColor}">${mLabel}</span></div><div class="flex h-1.5 rounded-full overflow-hidden mb-1.5"><div style="width:${pctR}%;background:var(--c-ok)"></div><div style="width:${pctA}%;background:var(--c-caution)"></div><div style="width:${pctS}%;background:var(--c-danger);opacity:0.5"></div></div><div class="flex justify-between text-[9px]"><span class="text-emerald-500">${r.nbRecent}\u00a0actifs</span><span class="text-amber-500">${r.nbAtRisk}\u00a0à\u00a0risque</span><span style="color:var(--c-danger)">${r.nbSilent}\u00a0silencieux</span></div>${r.caRisque>500?`<div class="mt-1 text-[9px] t-disabled">CA\u00a0à\u00a0risque\u00a0: <strong style="color:var(--c-danger)">${formatEuro(r.caRisque)}</strong></div>`:''}</div>`;
        }).join('');
        inner+=`<div class="s-card rounded-xl border p-4"><div class="flex items-center justify-between mb-2"><h3 class="text-[11px] font-bold t-secondary uppercase tracking-wider">📈 Momentum commercial</h3><button onclick="_exportTourneeCSV()" class="text-[9px] px-2.5 py-1 rounded-lg s-card border b-light t-disabled hover:t-primary transition-colors">📥 Plan de visite CSV</button></div><div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">${cards}</div><p class="text-[9px] t-disabled mt-2">Cliquer sur un commercial pour filtrer · 🟢\u00a0&lt;30j · 🟡\u00a030-90j · 🔴\u00a0&gt;90j</p></div>`;
      }
    }
    el.innerHTML=`<details class="s-card rounded-xl shadow-md border overflow-hidden mb-3"><summary class="px-2 py-1.5 border-b s-card-alt select-none flex items-center justify-between cursor-pointer hover:brightness-95"><h3 class="font-extrabold t-primary text-xs">📡 Omnicanalité &amp; Momentum</h3><span class="acc-arrow t-disabled">▶</span></summary><div class="p-3 space-y-3">${inner}</div></details>`;
  }

  // ── Clients PDV hors zone — paginé, colonnes alignées sur _renderTopClientsPDV ──
  function _renderHorsZone(){
    const el=document.getElementById('terrHorsZone');if(!el)return;
    if(!_S.chalandiseReady||!_S.ventesClientArticle.size){el.innerHTML='';return;}
    const page=_S._horsZonePage||0;
    const HZ_PAGE=20;
    const nowMs=Date.now();
    const hors=[];
    for(const[cc,artMap]of _S.ventesClientArticle){
      if(_S.chalandiseData.has(cc))continue;
      if(!_passesAllFilters(cc))continue;
      const caPDV=[...artMap.values()].reduce((s,v)=>s+(v.sumCA||0),0);
      if(caPDV<200)continue;
      const horsMap=_S.ventesClientHorsMagasin.get(cc);
      const caHors=horsMap?[...horsMap.values()].reduce((s,v)=>s+(v.sumCA||0),0):0;
      const caTotal=caPDV+caHors;
      const lastDate=_S.clientLastOrder?.get(cc);
      const nom=_S.clientNomLookup?.[cc]||cc;
      hors.push({cc,nom,caPDV,caHors,caTotal,lastDate});
    }
    hors.sort((a,b)=>b.caPDV-a.caPDV);
    if(!hors.length){el.innerHTML='';return;}
    let displayRows,pagerHtml='';
    if(page===0){
      displayRows=hors.slice(0,5);
      if(hors.length>5)pagerHtml=`<div class="px-4 py-2 border-t b-default text-center"><button data-action="_horsZoneExpand" class="text-[11px] font-semibold c-action hover:underline cursor-pointer">Voir les ${hors.length} clients →</button></div>`;
    }else{
      const maxPage=Math.ceil(hors.length/HZ_PAGE);
      const cur=Math.max(1,Math.min(page,maxPage));
      if(_S._horsZonePage!==cur)_S._horsZonePage=cur;
      displayRows=hors.slice((cur-1)*HZ_PAGE,cur*HZ_PAGE);
      const prev=cur>1?`<button data-action="_horsZonePage" data-dir="-1" class="text-[11px] font-semibold c-action hover:underline px-1 cursor-pointer">←</button>`:`<span class="text-[11px] t-disabled px-1">←</span>`;
      const next=cur<maxPage?`<button data-action="_horsZonePage" data-dir="1" class="text-[11px] font-semibold c-action hover:underline px-1 cursor-pointer">→</button>`:`<span class="text-[11px] t-disabled px-1">→</span>`;
      pagerHtml=`<div class="px-4 py-2 border-t b-default flex items-center justify-between"><button data-action="_horsZoneCollapse" class="text-[10px] t-disabled hover:t-primary cursor-pointer">↑ Réduire</button><div class="flex items-center gap-1">${prev}<span class="text-[11px] t-secondary">Page ${cur} sur ${maxPage}</span>${next}</div><span class="text-[10px] t-disabled">${hors.length} clients</span></div>`;
    }
    const rows=displayRows.map(r=>{
      const daysSince=r.lastDate?Math.round((nowMs-r.lastDate)/86400000):null;
      const silence=daysSince!==null?`${daysSince}j`:'—';
      const silColor=daysSince===null?'t-disabled':daysSince<30?'c-ok':daysSince<90?'c-caution':'c-danger';
      const _dc=deltaColor(r.caHors,r.caPDV);
      return`<tr class="border-b b-light hover:s-hover cursor-pointer transition-colors" data-cc="${escapeHtml(r.cc)}" onclick="openClient360(this.dataset.cc,'territoire')"><td class="py-1.5 px-2 font-bold text-[11px]">${escapeHtml(r.nom)}</td><td class="py-1.5 px-2 text-right font-bold c-action text-[11px]">${formatEuro(r.caPDV)}</td><td class="py-1.5 px-2 text-right text-[11px]">${formatEuro(r.caTotal)}</td><td class="py-1.5 px-2 text-right text-[10px] ${_dc}">${r.caHors>0?'+'+formatEuro(r.caHors):'—'}</td><td class="py-1.5 px-2 text-center text-[10px] ${silColor}">${silence}</td></tr>`;
    }).join('');
    el.innerHTML=`<div class="mb-5 s-card rounded-xl border overflow-hidden"><div class="flex items-center gap-2 px-4 py-3 s-card-alt border-b"><h3 class="font-extrabold text-sm c-caution">⚠️ Clients PDV hors zone <span class="text-[10px] font-normal t-disabled ml-1">${hors.length} client${hors.length>1?'s':''} absents de la chalandise</span></h3></div><p class="text-[10px] t-tertiary px-4 py-2 border-b b-light">Clients actifs au comptoir mais non référencés dans la zone de chalandise — vérifier s'ils doivent être ajoutés.</p><div class="overflow-x-auto"><table class="min-w-full text-xs"><thead class="s-panel-inner t-inverse font-bold"><tr><th class="py-2 px-2 text-left">Client</th><th class="py-2 px-2 text-right">CA PDV</th><th class="py-2 px-2 text-right">CA Total</th><th class="py-2 px-2 text-right">Delta hors</th><th class="py-2 px-2 text-center">Silence</th></tr></thead><tbody>${rows}</tbody></table></div>${pagerHtml}</div>`;
  }

  function _passesAllFilters(cc){
    // 1. Commercial
    if(_S._selectedCommercial){const s=_S.clientsByCommercial?.get(_S._selectedCommercial);if(s&&!s.has(cc))return false;}
    // 2. Métier
    if(_S._selectedMetier){const m=_S.chalandiseData?.get(cc)?.metier;if(m!==_S._selectedMetier)return false;}
    // 3. Vue clients
    const view=_S._clientView||'tous';
    if(view==='potentiels'&&_S.chalandiseData?.has(cc))return false;
    if(view==='captes'&&!_S.chalandiseData?.has(cc))return false;
    if(view==='horszone'&&_S.chalandiseData?.has(cc))return false;
    if(view==='multicanaux'){let caHors=0,caMag=0;const h=_S.ventesClientHorsMagasin?.get(cc);const m2=_S.ventesClientArticle?.get(cc);if(h)for(const d of h.values())caHors+=d.sumCA||0;if(m2)for(const d of m2.values())caMag+=d.sumCA||0;if(caHors<=caMag)return false;}
    if(view==='dormants'){const lastDate=_S.clientLastOrder?.get(cc);const silence=lastDate?Math.round((Date.now()-lastDate)/86400000):999;if(silence<=180)return false;}
    // 4. Département
    if(_S._selectedDepts?.size>0){const cp=_S.chalandiseData?.get(cc)?.cp;if(cp&&!_S._selectedDepts.has(cp.slice(0,2)))return false;}
    // 5. Classification
    if(_S._selectedClassifs?.size>0){const classif=_S.chalandiseData?.get(cc)?.classif;if(classif&&!_S._selectedClassifs.has(classif))return false;}
    // 6. Stratégique uniquement
    if(_S._filterStrategiqueOnly){const met=_S.chalandiseData?.get(cc)?.metier;if(!METIERS_STRATEGIQUES.includes(met))return false;}
    // 7. Distance km
    if(_S._distanceMaxKm>0&&_S._agenceCoords){const info2=_S.chalandiseData?.get(cc);if(info2){const d=info2.distanceKm;if(d!=null&&d>_S._distanceMaxKm)return false;}}
    return true;
  }

  function _syncPDVToggles(){
    const view=_S._clientView||'tous';
    document.querySelectorAll('.client-view-btn').forEach(b=>{
      const active=b.dataset.view===view;
      b.classList.toggle('s-panel-inner',active);b.classList.toggle('t-inverse',active);b.classList.toggle('b-dark',active);
      b.classList.toggle('s-card',!active);b.classList.toggle('t-primary',!active);b.classList.toggle('b-default',!active);
    });
  }

  // ── Top clients PDV — canal-aware, paginé, toggle hors agence ───────────
  function _renderTopClientsPDV(){
    const canal=_S._globalCanal||'';
    const page=_S._clientsPDVPage||0; // 0=top5, >=1=paginated
    const showHors=!!_S._showHorsAgence;
    const showHorsZone=!!_S._showHorsZone;
    const PDV_PAGE=20;
    const nowMs=Date.now();
    const canalNames={MAGASIN:'Magasin',INTERNET:'Internet',REPRESENTANT:'Représentant',DCS:'DCS',AUTRE:'Autre'};
    const el=document.getElementById('terrTopPDV');if(!el)return;
    // Capturer l'état ouvert/fermé avant re-render
    const _detCur=el.querySelector('details');
    if(_detCur)_S._topPDVOpen=_detCur.open;
    const _openAttr=_S._topPDVOpen!==false?' open':'';
    _syncPDVToggles();

    if(showHors){
      // ── Vue hors agence : clients avec CA hors-MAGASIN > 0, triés par CA hors DESC ──
      const horsRows=[];
      for(const[cc,artMap]of _S.ventesClientHorsMagasin){
        if(!_passesAllFilters(cc))continue;
        const caHors=[...artMap.values()].reduce((s,v)=>s+(v.sumCA||0),0);
        if(caHors<100)continue;
        const magMap=_S.ventesClientArticle.get(cc);
        const caMag=magMap?[...magMap.values()].reduce((s,v)=>s+(v.sumCA||0),0):0;
        const canaux=new Set([...artMap.values()].map(v=>v.canal).filter(Boolean));
        const info=_S.chalandiseData?.get(cc);
        const nom=info?.nom||_S.clientNomLookup?.[cc]||cc;
        horsRows.push({cc,nom,metier:info?.metier||'',caHors,caMag,canaux:[...canaux].join('/')});
      }
      horsRows.sort((a,b)=>b.caHors-a.caHors);
      if(!horsRows.length){el.innerHTML=`<details${_openAttr} class="mb-3 s-card rounded-xl border overflow-hidden"><summary class="flex items-center justify-between px-4 py-3 s-card-alt border-b cursor-pointer select-none hover:brightness-95"><h3 class="font-extrabold text-sm t-primary">🌐 Clients hors agence</h3><span class="acc-arrow t-disabled">▶</span></summary><p class="text-[11px] t-tertiary px-4 py-3">Aucun client hors agence détecté (CA&gt;100€).</p></details>`;return;}
      let displayRows,pagerHtml='';
      if(page===0){
        displayRows=horsRows.slice(0,5);
        if(horsRows.length>5)pagerHtml=`<div class="px-4 py-2 border-t b-default text-center"><button data-action="_topPDVExpand" class="text-[11px] font-semibold c-action hover:underline cursor-pointer">Voir les ${horsRows.length} clients →</button></div>`;
      }else{
        const maxPage=Math.ceil(horsRows.length/PDV_PAGE);
        const cur=Math.max(1,Math.min(page,maxPage));
        if(_S._clientsPDVPage!==cur)_S._clientsPDVPage=cur;
        displayRows=horsRows.slice((cur-1)*PDV_PAGE,cur*PDV_PAGE);
        const prev=cur>1?`<button data-action="_topPDVPage" data-dir="-1" class="text-[11px] font-semibold c-action hover:underline px-1 cursor-pointer">←</button>`:`<span class="text-[11px] t-disabled px-1">←</span>`;
        const next=cur<maxPage?`<button data-action="_topPDVPage" data-dir="1" class="text-[11px] font-semibold c-action hover:underline px-1 cursor-pointer">→</button>`:`<span class="text-[11px] t-disabled px-1">→</span>`;
        pagerHtml=`<div class="px-4 py-2 border-t b-default flex items-center justify-between"><button data-action="_topPDVCollapse" class="text-[10px] t-disabled hover:t-primary cursor-pointer">↑ Réduire</button><div class="flex items-center gap-1">${prev}<span class="text-[11px] t-secondary">Page ${cur} sur ${maxPage}</span>${next}</div><span class="text-[10px] t-disabled">${horsRows.length} clients</span></div>`;
      }
      const rows=displayRows.map(r=>`<tr class="border-b b-light hover:s-hover cursor-pointer transition-colors" onclick="openClient360('${r.cc}','territoire')"><td class="py-1.5 px-2 font-bold text-[11px]">${r.nom}<span class="text-[9px] t-disabled font-normal ml-1">${r.metier||''}</span></td><td class="py-1.5 px-2 text-right font-bold c-danger text-[11px]">${formatEuro(r.caHors)}</td><td class="py-1.5 px-2 text-right text-[11px] t-tertiary">${r.caMag>0?formatEuro(r.caMag):'—'}</td><td class="py-1.5 px-2 text-right text-[10px] t-disabled">${r.canaux||'—'}</td></tr>`).join('');
      el.innerHTML=`<details${_openAttr} class="mb-3 s-card rounded-xl border overflow-hidden"><summary class="flex items-center justify-between px-4 py-3 s-card-alt border-b cursor-pointer select-none hover:brightness-95"><h3 class="font-extrabold text-sm t-primary">🌐 Clients hors agence <span class="text-[10px] font-normal t-disabled ml-1">${horsRows.length} clients avec CA hors&gt;0</span></h3><span class="acc-arrow t-disabled">▶</span></summary><div class="overflow-x-auto"><table class="min-w-full text-xs"><thead class="s-panel-inner t-inverse font-bold"><tr><th class="py-2 px-2 text-left">Client</th><th class="py-2 px-2 text-right">CA Hors agence</th><th class="py-2 px-2 text-right">CA Magasin</th><th class="py-2 px-2 text-right">Canal</th></tr></thead><tbody>${rows}</tbody></table></div>${pagerHtml}</details>`;
      return;
    }

    if(showHorsZone){
      // ── Vue hors zone : clients PDV absents de la chalandise ──────────────
      const hzRows=[];
      for(const[cc,artMap]of _S.ventesClientArticle){
        if(_S.chalandiseData.has(cc))continue;
        if(!_passesAllFilters(cc))continue;
        const caPDV=[...artMap.values()].reduce((s,v)=>s+(v.sumCA||0),0);
        if(caPDV<200)continue;
        const nom=_S.clientNomLookup?.[cc]||cc;
        hzRows.push({cc,nom,caPDV});
      }
      hzRows.sort((a,b)=>b.caPDV-a.caPDV);
      if(!hzRows.length){el.innerHTML=`<details${_openAttr} class="mb-3 s-card rounded-xl border overflow-hidden"><summary class="flex items-center justify-between px-4 py-3 s-card-alt border-b cursor-pointer select-none hover:brightness-95"><h3 class="font-extrabold text-sm c-caution">⚠️ Clients PDV hors zone</h3><span class="acc-arrow t-disabled">▶</span></summary><p class="text-[11px] t-tertiary px-4 py-3">Aucun client hors zone détecté (CA PDV&gt;200€ absent de la chalandise).</p></details>`;return;}
      let displayRows,pagerHtml='';
      if(page===0){
        displayRows=hzRows.slice(0,5);
        if(hzRows.length>5)pagerHtml=`<div class="px-4 py-2 border-t b-default text-center"><button data-action="_topPDVExpand" class="text-[11px] font-semibold c-action hover:underline cursor-pointer">Voir les ${hzRows.length} clients →</button></div>`;
      }else{
        const maxPage=Math.ceil(hzRows.length/PDV_PAGE);
        const cur=Math.max(1,Math.min(page,maxPage));
        if(_S._clientsPDVPage!==cur)_S._clientsPDVPage=cur;
        displayRows=hzRows.slice((cur-1)*PDV_PAGE,cur*PDV_PAGE);
        const prev=cur>1?`<button data-action="_topPDVPage" data-dir="-1" class="text-[11px] font-semibold c-action hover:underline px-1 cursor-pointer">←</button>`:`<span class="text-[11px] t-disabled px-1">←</span>`;
        const next=cur<maxPage?`<button data-action="_topPDVPage" data-dir="1" class="text-[11px] font-semibold c-action hover:underline px-1 cursor-pointer">→</button>`:`<span class="text-[11px] t-disabled px-1">→</span>`;
        pagerHtml=`<div class="px-4 py-2 border-t b-default flex items-center justify-between"><button data-action="_topPDVCollapse" class="text-[10px] t-disabled hover:t-primary cursor-pointer">↑ Réduire</button><div class="flex items-center gap-1">${prev}<span class="text-[11px] t-secondary">Page ${cur} sur ${maxPage}</span>${next}</div><span class="text-[10px] t-disabled">${hzRows.length} clients</span></div>`;
      }
      const rows=displayRows.map(r=>`<tr class="border-b b-light hover:s-hover cursor-pointer transition-colors" onclick="openClient360('${r.cc}','territoire')"><td class="py-1.5 px-2 font-bold text-[11px]">${r.nom}</td><td class="py-1.5 px-2 text-right font-bold c-action text-[11px]">${formatEuro(r.caPDV)}</td><td class="py-1.5 px-2 text-right text-[10px] t-disabled font-mono">${r.cc}</td></tr>`).join('');
      el.innerHTML=`<details${_openAttr} class="mb-3 s-card rounded-xl border overflow-hidden"><summary class="flex items-center justify-between px-4 py-3 s-card-alt border-b cursor-pointer select-none hover:brightness-95"><h3 class="font-extrabold text-sm c-caution">⚠️ Clients PDV hors zone <span class="text-[10px] font-normal t-disabled ml-1">${hzRows.length} client${hzRows.length>1?'s':''} absents de la chalandise</span></h3><span class="acc-arrow t-disabled">▶</span></summary><div class="overflow-x-auto"><table class="min-w-full text-xs"><thead class="s-panel-inner t-inverse font-bold"><tr><th class="py-2 px-2 text-left">Client</th><th class="py-2 px-2 text-right">CA PDV</th><th class="py-2 px-2 text-right">Code client</th></tr></thead><tbody>${rows}</tbody></table></div>${pagerHtml}</details>`;
      return;
    }

    // ── Vue normale : top clients PDV canal-aware ─────────────────────────
    const topRows=[];
    if(!canal||canal==='MAGASIN'){
      for(const[cc,artMap]of _S.ventesClientArticle){
        if(!_passesAllFilters(cc))continue;
        const caPDV=[...artMap.values()].reduce((s,v)=>s+(v.sumCA||0),0);
        if(caPDV<100)continue;
        const horsMap=_S.ventesClientHorsMagasin.get(cc);
        const caHors=horsMap?[...horsMap.values()].reduce((s,v)=>s+(v.sumCA||0),0):0;
        const caTotal=caPDV+caHors;
        const lastDate=_S.clientLastOrder?.get(cc);
        const info=_S.chalandiseData?.get(cc);
        const nom=info?.nom||_S.clientNomLookup?.[cc]||cc;
        topRows.push({cc,nom,metier:info?.metier||'',caPrimary:caPDV,caDelta:caHors,caTotal,lastDate});
      }
      if(!canal){
        for(const[cc,artMap]of _S.ventesClientHorsMagasin){
          if(_S.ventesClientArticle.has(cc))continue;
          if(!_passesAllFilters(cc))continue;
          const caHors=[...artMap.values()].reduce((s,v)=>s+(v.sumCA||0),0);
          if(caHors<100)continue;
          const info=_S.chalandiseData?.get(cc);
          const nom=info?.nom||_S.clientNomLookup?.[cc]||cc;
          topRows.push({cc,nom,metier:info?.metier||'',caPrimary:caHors,caDelta:0,caTotal:caHors,lastDate:null});
        }
        topRows.sort((a,b)=>b.caTotal-a.caTotal);
      }else{
        topRows.sort((a,b)=>b.caPrimary-a.caPrimary);
      }
    }else{
      for(const[cc,artMap]of _S.ventesClientHorsMagasin){
        if(!_passesAllFilters(cc))continue;
        let caCanal=0;
        for(const v of artMap.values()){if((v.canal||'')==canal)caCanal+=(v.sumCA||0);}
        if(caCanal<100)continue;
        const magMap=_S.ventesClientArticle.get(cc);
        const caMag=magMap?[...magMap.values()].reduce((s,v)=>s+(v.sumCA||0),0):0;
        const info=_S.chalandiseData?.get(cc);
        const nom=info?.nom||_S.clientNomLookup?.[cc]||cc;
        const lastDate=_S.clientLastOrder?.get(cc);
        topRows.push({cc,nom,metier:info?.metier||'',caPrimary:caCanal,caDelta:caMag,caTotal:caCanal+caMag,lastDate});
      }
      topRows.sort((a,b)=>b.caPrimary-a.caPrimary);
    }
    const isMagCanal=!canal||canal==='MAGASIN';
    const colPrimary=isMagCanal?'CA PDV':`CA ${canalNames[canal]||canal}`;
    const colDelta=isMagCanal?'Delta hors':'Delta mag';
    const subtitle=canal?`${topRows.length} clients · canal ${canalNames[canal]||canal}`:`${topRows.length} clients · tous canaux`;
    const _subtitleTip=isMagCanal
      ?`Clients PDV avec CA ≥ 100 €, après tous les filtres actifs (commercial, métier, vue…). Total brut MAGASIN : ${_S.ventesClientArticle.size} clients. Clients exclusivement PDV (sans hors-agence) : ${[..._S.ventesClientArticle.keys()].filter(c=>!_S.ventesClientHorsMagasin.has(c)).length}.`
      :`Clients avec CA ≥ 100 € sur ce canal, après tous les filtres actifs.`;
    if(!topRows.length){el.innerHTML=`<details${_openAttr} class="mb-3 s-card rounded-xl border overflow-hidden"><summary class="flex items-center justify-between px-4 py-3 s-card-alt border-b cursor-pointer select-none hover:brightness-95"><h3 class="font-extrabold text-sm t-primary">🏆 Top clients PDV</h3><span class="acc-arrow t-disabled">▶</span></summary><p class="text-[11px] t-tertiary px-4 py-3">Aucun client trouvé pour ce canal.</p></details>`;return;}
    let displayRows,pagerHtml='';
    if(page===0){
      displayRows=topRows.slice(0,5);
      if(topRows.length>5)pagerHtml=`<div class="px-4 py-2 border-t b-default text-center"><button data-action="_topPDVExpand" class="text-[11px] font-semibold c-action hover:underline cursor-pointer">Voir les ${topRows.length} clients →</button></div>`;
    }else{
      const maxPage=Math.ceil(topRows.length/PDV_PAGE);
      const cur=Math.max(1,Math.min(page,maxPage));
      if(_S._clientsPDVPage!==cur)_S._clientsPDVPage=cur;
      displayRows=topRows.slice((cur-1)*PDV_PAGE,cur*PDV_PAGE);
      const prev=cur>1?`<button data-action="_topPDVPage" data-dir="-1" class="text-[11px] font-semibold c-action hover:underline px-1 cursor-pointer">←</button>`:`<span class="text-[11px] t-disabled px-1">←</span>`;
      const next=cur<maxPage?`<button data-action="_topPDVPage" data-dir="1" class="text-[11px] font-semibold c-action hover:underline px-1 cursor-pointer">→</button>`:`<span class="text-[11px] t-disabled px-1">→</span>`;
      pagerHtml=`<div class="px-4 py-2 border-t b-default flex items-center justify-between"><button data-action="_topPDVCollapse" class="text-[10px] t-disabled hover:t-primary cursor-pointer">↑ Réduire</button><div class="flex items-center gap-1">${prev}<span class="text-[11px] t-secondary">Page ${cur} sur ${maxPage}</span>${next}</div><span class="text-[10px] t-disabled">${topRows.length} clients</span></div>`;
    }
    const rows=displayRows.map(r=>{
      const daysSince=r.lastDate?Math.round((nowMs-r.lastDate)/86400000):null;
      const silence=daysSince!==null?`${daysSince}j`:'—';
      const silColor=daysSince===null?'t-disabled':daysSince<30?'c-ok':daysSince<90?'c-caution':'c-danger';
      const _dc=r.caDelta>r.caPrimary*0.5?'c-caution':r.caDelta>r.caPrimary*2?'c-danger':'t-tertiary';
      return`<tr class="border-b b-light hover:s-hover cursor-pointer transition-colors" onclick="openClient360('${r.cc}','territoire')"><td class="py-1.5 px-2 font-bold text-[11px]">${r.nom}<span class="text-[9px] t-disabled font-normal ml-1">${r.metier||''}</span></td><td class="py-1.5 px-2 text-right font-bold c-action text-[11px]">${formatEuro(r.caPrimary)}</td><td class="py-1.5 px-2 text-right text-[11px]">${formatEuro(r.caTotal)}</td><td class="py-1.5 px-2 text-right text-[10px] ${_dc}">${r.caDelta>0?'+'+formatEuro(r.caDelta):'—'}</td><td class="py-1.5 px-2 text-center text-[10px] ${silColor}">${silence}</td></tr>`;
    }).join('');
    el.innerHTML=`<details${_openAttr} class="mb-3 s-card rounded-xl border overflow-hidden"><summary class="flex items-center justify-between px-4 py-3 s-card-alt border-b cursor-pointer select-none hover:brightness-95"><h3 class="font-extrabold text-sm t-primary">🏆 Top clients PDV <span class="text-[10px] font-normal t-disabled ml-1 cursor-help" title="${_subtitleTip}">${subtitle}</span></h3><span class="acc-arrow t-disabled">▶</span></summary><div class="overflow-x-auto"><table class="min-w-full text-xs"><thead class="s-panel-inner t-inverse font-bold"><tr><th class="py-2 px-2 text-left">Client</th><th class="py-2 px-2 text-right">${colPrimary}</th><th class="py-2 px-2 text-right">CA Total</th><th class="py-2 px-2 text-right">${colDelta}</th><th class="py-2 px-2 text-center">Silence</th></tr></thead><tbody>${rows}</tbody></table></div>${pagerHtml}</details>`;
  }

  // ── _computeTop5Reconq — scored reconquest priority list (shared) ────
  function _computeTop5Reconq(){
    const fideles=_S.crossingStats?.fideles;
    if(!fideles?.size||!_S.clientLastOrder?.size)return[];
    const today=new Date();
    const scored=[];
    for(const cc of fideles){
      const lastOrder=_S.clientLastOrder.get(cc);
      if(!lastOrder)continue;
      const daysAgo=Math.floor((today-lastOrder)/864e5);
      if(daysAgo<=30)continue;
      const arts=_S.ventesClientArticle?.get(cc);
      if(!arts?.size)continue;
      let caPDV=0;
      for(const d of arts.values())caPDV+=d.sumCA||0;
      if(caPDV<=0)continue;
      const score=Math.round(caPDV*daysAgo);
      const cc6=cc.padStart(6,'0');
      const info=_S.chalandiseData?.get(cc)||_S.chalandiseData?.get(cc6)||{};
      const nom=info.nom||_S.clientNomLookup?.[cc]||_S.clientNomLookup?.[cc6]||cc;
      scored.push({cc,nom,commercial:info.commercial||'',metier:info.metier||'',caPDV,daysAgo,score});
    }
    scored.sort((a,b)=>b.score-a.score);
    return scored.slice(0,5);
  }

  // ── computeTerritoireKPIs — pure data for renderTerritoireTab ────────
  function computeTerritoireKPIs(){
    const top5Reconq=_computeTop5Reconq();
    const reconqFull=(_S.reconquestCohort||[]).filter(r=>_passesAllFilters(r.cc));
    const reconq=reconqFull.slice(0,10);
    const livSansPDV=_S.livraisonsSansPDV||[];
    const hasTerr=_S.territoireReady&&DataStore.territoireLines.length>0;
    const hasChal=DataStore.chalandiseReady;
    const hasData=DataStore.finalData.length>0;
    const hasConsomme=_S.ventesClientArticle.size>0;
    const degraded=!hasTerr&&!hasChal&&(hasData||hasConsomme);
    let crossCaptes=0,crossFideles=0,crossPotentiels=0;
    const hasCross=!!_S.crossingStats;
    if(hasCross){
      const _hasF=_S._selectedDepts.size||_S._selectedClassifs.size||_S._selectedStatuts.size||_S._selectedActivitesPDV.size||_S._selectedDirections.size||_S._selectedUnivers.size||_S._selectedCommercial||_S._selectedMetier||_S._filterStrategiqueOnly||_S._selectedStatutDetaille;
      if(_hasF){
        for(const cc of _S.crossingStats.captes){const info=_S.chalandiseData.get(cc);if(info&&_clientPassesFilters(info,cc))crossCaptes++;}
        for(const cc of _S.crossingStats.fideles){const info=_S.chalandiseData.get(cc);if(!info||_clientPassesFilters(info,cc))crossFideles++;}
      }else{crossCaptes=_S.crossingStats.captes.size;crossFideles=_S.crossingStats.fideles.size;}
      crossPotentiels=_S.crossingStats.potentiels.size;
    }
    return{top5Reconq,reconqFull,reconq,livSansPDV,hasTerr,hasChal,hasData,hasConsomme,degraded,hasCross,crossCaptes,crossFideles,crossPotentiels};
  }

  // ── computeClientsKPIs — pure data for renderMesClients ──────────────
  function computeClientsKPIs(){
    const now=new Date();
    let top5=[];
    if(_S._top5Semaine?.length){
      top5=_S._top5Semaine;
    }else if(_S.clientLastOrder.size){
      const cands=[];
      for(const [cc,lastDate] of _S.clientLastOrder.entries()){
        const daysSince=Math.round((now-lastDate)/86400000);
        if(daysSince<30)continue;
        const info=_S.chalandiseData.get(cc);
        if(!info)continue;
        const artMap=_S.ventesClientArticle.get(cc);
        const caPDV=artMap?[...artMap.values()].reduce((s,d)=>s+(d.sumCA||0),0):0;
        const ca=Math.max((info.ca2025||0)+caPDV,1);
        const score=(daysSince/30)*Math.sqrt(ca);
        const hmCount=(_S.ventesClientHorsMagasin.get(cc)||new Map()).size;
        const parts=[];
        if(daysSince>0)parts.push(`${daysSince}j silence`);
        if(info.ca2025>0)parts.push(`CA ${formatEuro(info.ca2025)}/an`);
        else if(caPDV>0)parts.push(`CA PDV ${formatEuro(caPDV)}/an`);
        if(hmCount>0)parts.push(`${hmCount} art. hors agence`);
        cands.push({cc,nom:info.nom||cc,commercial:info.commercial||'',metier:info.metier||'',score:Math.round(score),reason:parts.join(' · ')||'À contacter'});
      }
      cands.sort((a,b)=>b.score-a.score);
      top5=cands.slice(0,5);
    }
    const top5Reconq=_computeTop5Reconq();
    const reconqAll=_S.reconquestCohort||[];
    const reconq=reconqAll.slice(0,10);
    const reconqTotal=reconqAll.length;
    const livSansPDV=_S.livraisonsSansPDV||[];
    const topPDVRows=[];
    if(_S.ventesClientArticle.size){
      for(const[cc,artMap]of _S.ventesClientArticle){
        const caPDV=[...artMap.values()].reduce((s,v)=>s+(v.sumCA||0),0);
        if(caPDV<100)continue;
        const horsMap=_S.ventesClientHorsMagasin.get(cc);
        const caHors=horsMap?[...horsMap.values()].reduce((s,v)=>s+(v.sumCA||0),0):0;
        const caTotal=caPDV+caHors;
        const lastDate=_S.clientLastOrder?.get(cc);
        const info=_S.chalandiseData?.get(cc);
        const nom=info?.nom||_S.clientNomLookup?.[cc]||cc;
        topPDVRows.push({cc,nom,metier:info?.metier||'',commercial:info?.commercial||'',caPDV,caHors,caTotal,lastDate});
      }
      topPDVRows.sort((a,b)=>b.caPDV-a.caPDV);
    }
    const horsZone=[];
    if(_S.chalandiseReady&&_S.ventesClientArticle.size){
      for(const[cc,artMap]of _S.ventesClientArticle){
        if(_S.chalandiseData.has(cc))continue;
        const caPDV=[...artMap.values()].reduce((s,v)=>s+(v.sumCA||0),0);
        if(caPDV<200)continue;
        const horsMap=_S.ventesClientHorsMagasin.get(cc);
        const caHors=horsMap?[...horsMap.values()].reduce((s,v)=>s+(v.sumCA||0),0):0;
        const caTotal=caPDV+caHors;
        const lastDate=_S.clientLastOrder?.get(cc);
        const nom=_S.clientNomLookup?.[cc]||cc;
        horsZone.push({cc,nom,caPDV,caHors,caTotal,lastDate});
      }
      horsZone.sort((a,b)=>b.caPDV-a.caPDV);
    }
    const digitaux=[];
    if(_S.ventesClientHorsMagasin?.size&&_S.ventesClientArticle?.size){
      for(const[cc,horArts]of _S.ventesClientHorsMagasin){
        const pdvArts=_S.ventesClientArticle.get(cc);
        if(!pdvArts?.size)continue;
        const lastPDV=_S.clientLastOrder?.get(cc);
        if(!lastPDV)continue;
        const pdvSilence=Math.round((now-lastPDV)/86400000);
        if(pdvSilence<90)continue;
        let caHors=0;const canalCA={};
        for(const[,v]of horArts){caHors+=v.sumCA||0;canalCA[v.canal]=(canalCA[v.canal]||0)+(v.sumCA||0);}
        if(caHors<200)continue;
        const mainCanal=Object.entries(canalCA).sort((a,b)=>b[1]-a[1])[0]?.[0]||'';
        let caPDV=0;for(const[,v]of pdvArts)caPDV+=v.sumCA||0;
        const info=_S.chalandiseData?.get(cc);
        digitaux.push({cc,nom:info?.nom||_S.clientNomLookup?.[cc]||cc,metier:info?.metier||'',commercial:info?.commercial||'',pdvSilence,caPDV,caHors,mainCanal});
      }
      digitaux.sort((a,b)=>b.caPDV-a.caPDV);
    }
    return{top5,top5Reconq,reconq,reconqTotal,livSansPDV,topPDVRows,horsZone,digitaux};
  }

  function renderTerritoireTab(){
    const k=computeTerritoireKPIs();
    // ── Blocs Clients PDV (Top 5, Top PDV, Hors zone, Reconquête, Opportunités) ──
    {
      const _setEl=(id,html)=>{const e=document.getElementById(id);if(e)e.innerHTML=html;};

      // ── Top 5 priorités reconquête ──
      const top5ReconqHtml=k.top5Reconq.length?(()=>{
        const cards=k.top5Reconq.map(c=>`<div class="p-2.5 s-card rounded-lg border cursor-pointer hover:i-info-bg transition-colors" data-cc="${escapeHtml(c.cc)}" onclick="openClient360(this.dataset.cc,'reconquete')"><div class="flex items-center gap-2 flex-wrap"><span class="font-bold text-sm">${escapeHtml(c.nom)}</span><span class="text-[9px] px-1.5 py-0.5 rounded-full font-bold" style="background:#4c0519;color:#fda4af">🔴 ${c.daysAgo}j</span><button data-cc="${escapeHtml(c.cc)}" onclick="event.stopPropagation();openClient360(this.dataset.cc,'reconquete')" class="ml-auto text-[9px] px-2 py-0.5 rounded-full font-semibold" style="background:#be123c;color:#fff">📞 Appeler</button></div><div class="flex gap-3 mt-1 text-[10px] t-tertiary"><span>${escapeHtml(c.metier||'—')}</span><span>CA PDV <strong class="t-primary">${formatEuro(c.caPDV)}</strong></span><span class="c-action">${escapeHtml(c.commercial||'—')}</span><span class="t-disabled" title="Score priorité">⚡${c.score.toLocaleString('fr-FR')}</span></div></div>`).join('');
        return`<details open class="mb-3 s-card rounded-xl border overflow-hidden" style="border-color:#e11d48"><summary class="flex items-center justify-between px-4 py-3 s-card-alt border-b cursor-pointer select-none hover:brightness-95"><h3 class="font-extrabold text-sm" style="color:#e11d48">🔴 À reconquérir — Top 5 priorités <span class="text-[10px] font-normal t-disabled ml-1">cette semaine</span></h3><span class="acc-arrow t-disabled">▶</span></summary><div class="p-4"><div class="grid grid-cols-1 sm:grid-cols-2 gap-2">${cards}</div></div></details>`;
      })():'';

      // ── Section 1 : À reconquérir (anciens fidèles silencieux) ──
      const _reconqFull=k.reconqFull;
      const reconq=k.reconq;
      const _reconqCard=r=>`<div class="p-2.5 s-card rounded-lg border cursor-pointer hover:i-info-bg transition-colors" data-cc="${escapeHtml(r.cc)}" onclick="openClient360(this.dataset.cc,'territoire')"><div class="flex items-center gap-2 flex-wrap"><span class="font-bold text-sm">${escapeHtml(r.nom)}</span><span class="text-[9px] px-1.5 py-0.5 rounded-full bg-cyan-900 text-cyan-300 font-bold">🔄 ${r.daysAgo}j</span></div><div class="flex gap-3 mt-1 text-[10px] t-tertiary"><span>${escapeHtml(r.metier||'—')}</span><span>CA <strong class="t-primary">${formatEuro(r.totalCA)}</strong></span><span>${r.nbFamilles} fam.</span><span class="c-action">${escapeHtml(r.commercial||'—')}</span></div></div>`;
      const reconqHtml=`<details class="mb-3 s-card rounded-xl border overflow-hidden"><summary class="flex items-center justify-between px-4 py-3 s-card-alt border-b cursor-pointer select-none hover:brightness-95"><h3 class="font-extrabold text-sm t-primary">🔄 À reconquérir <span class="text-[10px] font-normal t-disabled ml-1">${_reconqFull.length} anciens fidèles</span></h3><span class="acc-arrow t-disabled">▶</span></summary>${reconq.length?`<div class="p-4"><div class="grid grid-cols-1 sm:grid-cols-2 gap-2">${reconq.map(_reconqCard).join('')}${_reconqFull.length>10?`<p class="text-[10px] t-disabled col-span-full mt-1">… et ${_reconqFull.length-10} autres</p>`:''}</div></div>`:`<div class="p-4 text-[12px] t-secondary">${_S.chalandiseReady?'Aucun ancien fidèle silencieux détecté.':'Chargez la zone de chalandise.'}</div>`}</details>`;

      // ── Section 2 : Livrés sans PDV — accordéon, top 10 + "Voir tous" ──
      const _livAll=k.livSansPDV;
      const livSansPDVHtml=(()=>{
        if(!_livAll.length)return _S.livraisonsReady?`<details class="mb-3 s-card rounded-xl border overflow-hidden"><summary class="flex items-center justify-between px-4 py-3 s-card-alt border-b cursor-pointer select-none hover:brightness-95"><h3 class="font-extrabold text-sm t-primary">📦 Livrés sans PDV <span class="text-[10px] font-normal t-disabled ml-1">0 clients</span></h3><span class="acc-arrow t-disabled">▶</span></summary><div class="p-4 text-[12px] t-secondary">Tous les clients livrés ont déjà acheté au comptoir.</div></details>`:'';
        const _mkRow=r=>`<tr class="border-b b-light hover:s-hover cursor-pointer transition-colors" data-cc="${escapeHtml(r.cc)}" onclick="openClient360(this.dataset.cc,'territoire')"><td class="py-1.5 px-2 font-bold text-[11px]">${escapeHtml(r.nom)}</td><td class="py-1.5 px-2 text-[11px] t-tertiary">${escapeHtml(r.metier||'—')}</td><td class="py-1.5 px-2 text-right font-bold c-action text-[11px]">${formatEuro(r.caLivraison)}</td><td class="py-1.5 px-2 text-right text-[11px] t-tertiary">${r.nbBL}</td><td class="py-1.5 px-2 text-[11px] c-action">${escapeHtml(r.commercial||'—')}</td></tr>`;
        const thStr=`<thead class="s-panel-inner t-inverse font-bold"><tr><th class="py-2 px-2 text-left">Nom client</th><th class="py-2 px-2 text-left">Métier</th><th class="py-2 px-2 text-right">CA livraison</th><th class="py-2 px-2 text-right">Nb BL</th><th class="py-2 px-2 text-left">Commercial</th></tr></thead>`;
        const top10=_livAll.slice(0,10).map(_mkRow).join('');
        const moreHtml=_livAll.length>10?`<details class="border-t b-default"><summary class="px-4 py-2 text-[11px] c-action cursor-pointer select-none hover:underline">Voir tous → (${_livAll.length-10} de plus)</summary><div class="overflow-x-auto"><table class="min-w-full text-xs">${thStr}<tbody>${_livAll.slice(10).map(_mkRow).join('')}</tbody></table></div></details>`:'';
        return`<details class="mb-3 s-card rounded-xl border overflow-hidden"><summary class="flex items-center justify-between px-4 py-3 s-card-alt border-b cursor-pointer select-none hover:brightness-95"><h3 class="font-extrabold text-sm t-primary">📦 Livrés sans PDV <span class="text-[10px] font-normal t-disabled ml-1">${_livAll.length} clients</span></h3><span class="acc-arrow t-disabled">▶</span></summary><div class="overflow-x-auto"><table class="min-w-full text-xs">${thStr}<tbody>${top10}</tbody></table></div>${moreHtml}</details>`;
      })();
      _setEl('terrTop5', top5ReconqHtml);
      _setEl('terrReconquete', reconqHtml);
      _setEl('terrLivSansPDV', livSansPDVHtml);

      // Opportunités nettes — accordéon + tableau paginé (factorisé dans helpers.js)
      _setEl('terrOpportunites', renderOppNetteTable());

      // Top clients PDV — canal-aware, paginé
      _renderTopClientsPDV();

    }

    // Commerce tab always shows clients view (canal moved to Omnicanalité tab)

    // [Adapter Étape 5] — DataStore.territoireLines / .finalData : canal-invariants
    const{hasTerr,hasChal,hasData,hasConsomme,degraded}=k;
    // terrNoChalandise: only when truly nothing loaded
    const terrNoC=document.getElementById('terrNoChalandise');if(terrNoC)terrNoC.classList.toggle('hidden',hasData||hasConsomme);
    // terrDegradedBlock: degraded mode only
    const terrDeg=document.getElementById('terrDegradedBlock');if(terrDeg)terrDeg.classList.toggle('hidden',hasTerr||(!hasData&&!hasConsomme));
    // terrFiltersBlock (search/direction/secteur/rayon) masqué — ces filtres article BL
    // n'ont pas leur place dans le sidebar Commerce (livraisons remplace territoire)
    const terrFilBlk=document.getElementById('terrFiltersBlock');if(terrFilBlk)terrFilBlk.classList.add('hidden');
    const terrFamFil=document.getElementById('terrFamilleFilter');if(terrFamFil)terrFamFil.classList.toggle('hidden',!degraded);

    // [Feature C] Bandeau dégradé : filtre canal actif mais pas de territoire (données agence uniquement)
    {const _cg=_S._globalCanal||'';const _kpi=getKPIsByCanal(_cg);const _degBanner=document.getElementById('canalDegradedBanner');
    if(_degBanner){const _showBanner=!!_cg&&!_kpi.capabilities.hasTerritoire&&hasData;_degBanner.classList.toggle('hidden',!_showBanner);}}

    // Show chalandise overview + left panel filters if chalandise loaded
    _buildChalandiseOverview();
    const chalFilBlk=document.getElementById('terrChalandiseFiltersBlock');
    if(chalFilBlk)chalFilBlk.classList.toggle('hidden',!hasChal);
    const sumBar=document.getElementById('terrSummaryBar');if(sumBar&&!hasChal)sumBar.classList.add('hidden');
    // Crossing KPI summary bar + filter buttons — updated regardless of hasTerr
    {const _sv=(id,v)=>{const e=document.getElementById(id);if(e)e.textContent=v;};const _sh=(id,show)=>{const e=document.getElementById(id);if(e)e.classList.toggle('hidden',!show);};if(k.hasCross){
      _sv('terrSumFideles',k.crossFideles.toLocaleString('fr-FR'));_sv('terrSumPotentiels',k.crossPotentiels.toLocaleString('fr-FR'));
    }_sh('terrSumSubPotentiel',k.hasCross&&k.crossPotentiels>0);_sh('terrSumSubFideles',k.hasCross&&k.crossFideles>0);}
    if(!hasData&&!hasTerr&&!hasChal&&!hasConsomme)return;
    if(degraded){_buildDegradedCockpit();return;}
    if(!hasTerr){
      _buildDegradedCockpit();
      return;
    }
    const q=(document.getElementById('terrSearch')||{}).value||'';
    const filterDir=(document.getElementById('terrFilterDir')||{}).value||'';
    const filterRayon=(document.getElementById('terrFilterRayon')||{}).value||'';

    const stockMap=new Map(DataStore.finalData.map(r=>[r.code,r]));
    // [V3.2] Point d'entrée multi-dimensions — lit _globalCanal + _globalPeriodePreset + _selectedCommercial
    const _ctx=DataStore.byContext();
    const _canalGlobal=_ctx.activeFilters.canal;
    const _canalGlobalLabels={MAGASIN:'Magasin',INTERNET:'Internet',REPRÉSENTANT:'Représentant',DCS:'DCS',AUTRE:'Autre'};
    const _canalGlobalLabel=_canalGlobalLabels[_canalGlobal]||_canalGlobal;

    // ── Garde de cache territoire ─────────────────────────────────────────────
    // Clé inclut commercial (V3.2) : terrLines differ si commercial actif
    const _secteurKey=[...(getSelectedSecteurs()||[])].sort().join(',');
    const _terrCacheKey=`${_canalGlobal||'ALL'}|${_ctx.activeFilters.commercial||''}|${_secteurKey}|${q}|${filterDir}|${filterRayon}`;
    if(_S._terrCanalCache.has(_terrCacheKey)){
      const _cached=_S._terrCanalCache.get(_terrCacheKey);
      const _sg=(id,v)=>{const e=document.getElementById(id);if(e)e.textContent=v;};
      const _si=(id,h)=>{const e=document.getElementById(id);if(e)e.innerHTML=h;};
      _si('terrDirectionTable',_cached.dirHtml);
      _si('terrTop100Table',_cached.top100Html);
      _si('terrClientsTable',_cached.cliHtml);
      if(_cached.contribHtml)_si('terrContribTable',_cached.contribHtml);
      _cached.kpi.forEach(([id,v])=>_sg(id,v));
      // Éléments non-texte
      const _ccEl=document.getElementById('terrKpiCouvertureInfo');if(_ccEl)_ccEl.classList.toggle('hidden',!_canalGlobal);
      const _ctEl=document.getElementById('terrContribTitle');if(_ctEl){if(_canalGlobal)_ctEl.innerHTML='🔗 Contributeurs agence <span class="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700 ml-1">🌐 tous canaux</span>';else _ctEl.textContent='🔗 Contributeurs agence';}
      renderInsightsBanner();
      return; // ← cache hit : ~0ms vs ~15-80ms pour un re-rendu complet
    }

    // Global KPI stats — always from ALL lines (for croisement summary, lignes KPI)
    let caTotal=0,specialCA=0;
    const blSetAll=new Set();
    const clientsMap={};
    const dirSet=new Set();
    for(const l of DataStore.filteredTerritoireLines){ // [Adapter Étape 5] — canal-invariant total, période filtrée
      caTotal+=l.ca;blSetAll.add(l.bl);
      if(l.isSpecial)specialCA+=l.ca;
      else dirSet.add(l.direction);
      if(l.clientCode){if(!clientsMap[l.clientCode])clientsMap[l.clientCode]={code:l.clientCode,type:l.clientType,nom:l.clientNom,ca:0,refs:new Set()};clientsMap[l.clientCode].ca+=l.ca;clientsMap[l.clientCode].refs.add(l.code);}
    }
    const pctSpecial=caTotal>0?((specialCA/caTotal)*100).toFixed(1):'0';

    // Canal-filtered stats for CA KPI + couverture rayon KPI
    // [V3.2] terrLines déjà filtré canal + commercial par DataStore.byContext()
    const _linesForKPI=_ctx.terrLines;
    let caTotalFiltered=0;for(const l of _linesForKPI)caTotalFiltered+=l.ca;
    const artMapAll={};
    for(const l of _linesForKPI){if(!l.isSpecial){if(!artMapAll[l.code])artMapAll[l.code]={code:l.code,ca:0,rayonStatus:l.rayonStatus};artMapAll[l.code].ca+=l.ca;}}
    const top100All=Object.values(artMapAll).sort((a,b)=>b.ca-a.ca).slice(0,100);
    const top100InStock=top100All.filter(a=>a.rayonStatus==='green').length;
    const pctCouverture=top100All.length>0?Math.round(top100InStock/top100All.length*100):0;

    // Canal-filtered: special CA + clients — via getKPIsByCanal(_S._globalCanal)
    // _linesForKPI already holds DataStore.byCanal(_canalGlobal).terrLines
    let specialCAFiltered=0;const _clientsKPI={};
    for(const l of _linesForKPI){if(l.isSpecial)specialCAFiltered+=l.ca;if(l.clientCode&&!_clientsKPI[l.clientCode])_clientsKPI[l.clientCode]={type:l.clientType};}
    const pctSpecialFiltered=caTotalFiltered>0?((specialCAFiltered/caTotalFiltered)*100).toFixed(1):'0';
    const mixteCountKPI=Object.values(_clientsKPI).filter(c=>c.type==='mixte').length;
    const extCountKPI=Object.values(_clientsKPI).filter(c=>c.type==='exterieur').length;

    // VOLET 3: Résumé croisement (always from ALL lines)
    renderTerrCroisementSummary(blSetAll,dirSet,clientsMap,top100All,top100InStock);

    // VOLET 2bis: Build secteur aggregates + contributeurs (always ALL lines — no canal filter)
    buildTerrContrib();
    renderTerrContrib();

    // Update contrib title with "tous canaux" badge when canal filter active
    const _contribTitleEl=document.getElementById('terrContribTitle');
    if(_contribTitleEl){if(_canalGlobal)_contribTitleEl.innerHTML='🔗 Contributeurs agence <span class="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700 ml-1">🌐 tous canaux</span>';else _contribTitleEl.textContent='🔗 Contributeurs agence';}

    const setSafe=(id,v)=>{const el=document.getElementById(id);if(el)el.textContent=v;};
    setSafe('terrKpiLignes',DataStore.filteredTerritoireLines.length.toLocaleString('fr')); // filtrées par période
    setSafe('terrKpiLignesSub',blSetAll.size.toLocaleString('fr')+' BL');
    // CA Total KPI: show canal-filtered value + note when filter active
    setSafe('terrKpiCATotal',formatEuro(caTotalFiltered));
    const _caTotalSubEl=document.getElementById('terrKpiCATotalSub');
    if(_caTotalSubEl)_caTotalSubEl.textContent=_canalGlobal?`canal ${_canalGlobalLabel} uniquement`:'';
    setSafe('terrKpiCouverture',pctCouverture+'%');
    const t100Rupture=top100All.filter(a=>a.rayonStatus==='yellow').length;
    setSafe('terrKpiCouvertureSub',`${top100InStock} en rayon · ${t100Rupture} rupture · ${top100All.length-top100InStock-t100Rupture} absents`);
    // Couverture rayon badge: remind that stock is physical (independent of canal)
    const _couvertureInfoEl=document.getElementById('terrKpiCouvertureInfo');
    if(_couvertureInfoEl)_couvertureInfoEl.classList.toggle('hidden',!_canalGlobal);
    setSafe('terrKpiSpecialPct',pctSpecialFiltered+'%');
    setSafe('terrKpiSpecialSub',formatEuro(specialCAFiltered)+' non stockable');
    setSafe('terrKpiClients',Object.keys(_clientsKPI).length.toLocaleString('fr'));
    setSafe('terrKpiClientsSub',`✅ ${mixteCountKPI} mixtes · ❌ ${extCountKPI} ext. purs`);

    // Special KPI banner
    const spEl=document.getElementById('terrSpecialKPIText');
    if(spEl)spEl.textContent=`${pctSpecialFiltered}% du CA Legallais est du spécial non stockable — ${formatEuro(specialCAFiltered)} (hors de la vue Direction, Top 100 et croisement rayon)`;

    // Local filter — specials always excluded from direction/top100/rayon views
    const selectedSecteurs=getSelectedSecteurs();
    const linesFiltered=DataStore.filteredTerritoireLines.filter(l=>{
      if(_canalGlobal&&l.canal!==_canalGlobal)return false;
      if(l.isSpecial)return false;
      if(filterDir&&l.direction!==filterDir)return false;
      if(filterRayon&&l.rayonStatus!==filterRayon)return false;
      if(selectedSecteurs&&l.secteur&&!selectedSecteurs.has(l.secteur))return false;
      if(q&&!matchQuery(q,l.code,l.libelle,l.direction))return false;
      return true;
    });

    // Clients filtered by the same direction/rayon/secteur/search filters (for clients table)
    const clientsMapFiltered={};
    for(const l of linesFiltered){
      if(l.clientCode){
        if(!clientsMapFiltered[l.clientCode])clientsMapFiltered[l.clientCode]={code:l.clientCode,type:l.clientType,nom:l.clientNom,ca:0,refs:new Set()};
        clientsMapFiltered[l.clientCode].ca+=l.ca;clientsMapFiltered[l.clientCode].refs.add(l.code);
      }
    }

    // Direction table — new columns: CA Le Terrain | Nb articles | ✅ | ⚠️ | ❌ | % couverture
    const dirs={};
    for(const l of linesFiltered){
      if(!dirs[l.direction])dirs[l.direction]={dir:l.direction,caTotal:0,refSet:new Set(),greenSet:new Set(),yellowSet:new Set(),redSet:new Set(),familles:{}};
      const d=dirs[l.direction];d.caTotal+=l.ca;d.refSet.add(l.code);
      if(l.rayonStatus==='green')d.greenSet.add(l.code);
      else if(l.rayonStatus==='yellow')d.yellowSet.add(l.code);
      else d.redSet.add(l.code);
      const famKey=l.famille||'';
      if(!d.familles[famKey])d.familles[famKey]={caTotal:0,nb:new Set()};
      d.familles[famKey].caTotal+=l.ca;d.familles[famKey].nb.add(l.code);
    }
    const dirsSorted=Object.values(dirs).sort((a,b)=>b.caTotal-a.caTotal);
    let tbody='';
    for(const d of dirsSorted){
      const nbTotal=d.refSet.size,nbGreen=d.greenSet.size,nbYellow=d.yellowSet.size,nbRed=d.redSet.size;
      const pctCouv=nbTotal>0?Math.round(nbGreen/nbTotal*100):0;
      const barColor=pctCouv>=70?'bg-emerald-500':pctCouv>=40?'bg-amber-500':'bg-red-500';
      const rowId='terr-dir-'+d.dir.replace(/\W/g,'_');
      const dirEnc=encodeURIComponent(d.dir);
      tbody+=`<tr class="terr-row border-b font-semibold text-xs" onclick="toggleTerrDir('${rowId}','${dirEnc}')">
        <td class="py-2 px-3 font-bold">${d.dir} <span class="t-disabled font-normal text-[9px]">▼</span></td>
        <td class="py-2 px-3 text-right">${formatEuro(d.caTotal)}</td>
        <td class="py-2 px-3 text-center">${nbTotal}</td>
        <td class="py-2 px-3 text-center"><span class="terr-status-badge c-ok" title="Voir les ${nbGreen} articles en rayon" onclick="event.stopPropagation();toggleTerrDirStatus('${rowId}','${dirEnc}','green')">✅ ${nbGreen}</span></td>
        <td class="py-2 px-3 text-center"><span class="terr-status-badge c-caution" title="Voir les ${nbYellow} articles en rupture" onclick="event.stopPropagation();toggleTerrDirStatus('${rowId}','${dirEnc}','yellow')">⚠️ ${nbYellow}</span></td>
        <td class="py-2 px-3 text-center"><span class="terr-status-badge c-danger" title="Voir les ${nbRed} articles absents" onclick="event.stopPropagation();toggleTerrDirStatus('${rowId}','${dirEnc}','red')">❌ ${nbRed}</span></td>
        <td class="py-2 px-3"><div class="flex items-center gap-1"><div class="flex-1 s-hover rounded-full h-2"><div class="cap-bar ${barColor}" style="width:${pctCouv}%"></div></div><span class="text-[10px] font-bold w-10 text-right">${pctCouv}%</span></div></td>
      </tr><tr id="${rowId}" style="display:none"><td colspan="7" class="p-0 i-info-bg"><div id="${rowId}-inner" class="text-xs"></div></td></tr>`;
    }
    const dtEl=document.getElementById('terrDirectionTable');if(dtEl)dtEl.innerHTML=tbody||'<tr><td colspan="7" class="text-center py-4 t-disabled">Aucune donnée</td></tr>';

    // Top 100 standard articles only — columns: Code | Libellé | Direction | BL | CA Le Terrain | Rayon | Stock actuel
    const artMap={};
    for(const l of linesFiltered){
      if(!artMap[l.code])artMap[l.code]={code:l.code,libelle:l.libelle,direction:l.direction,bl:new Set(),caTotal:0,rayonStatus:l.rayonStatus};
      artMap[l.code].caTotal+=l.ca;artMap[l.code].bl.add(l.bl);
    }
    const top100=Object.values(artMap).sort((a,b)=>b.caTotal-a.caTotal).slice(0,100);
    let p100='';
    for(const a of top100){
      const stockItem=stockMap.get(a.code);
      const stockQty=stockItem?stockItem.stockActuel:'—';
      const rayonIcon=a.rayonStatus==='green'?'✅ En rayon':a.rayonStatus==='yellow'?'⚠️ Rupture':'❌ Absent';
      const rowBg=a.rayonStatus==='red'?'rayon-red':a.rayonStatus==='yellow'?'rayon-yellow':'';
      p100+=`<tr class="border-b text-[11px] ${rowBg}"><td class="py-1.5 px-2 font-mono">${a.code}${_copyCodeBtn(a.code)}</td><td class="py-1.5 px-2 max-w-[200px] truncate" title="${a.libelle}">${a.libelle}</td><td class="py-1.5 px-2">${a.direction}</td><td class="py-1.5 px-2 text-center">${a.bl.size}</td><td class="py-1.5 px-2 text-right font-bold">${formatEuro(a.caTotal)}</td><td class="py-1.5 px-2 text-center">${rayonIcon}</td><td class="py-1.5 px-2 text-right">${stockQty}</td></tr>`;
    }
    const t100El=document.getElementById('terrTop100Table');if(t100El)t100El.innerHTML=p100||'<tr><td colspan="7" class="text-center py-4 t-disabled">Aucun article</td></tr>';

    // Clients top 50 — filtered by same filters as direction/top100 views + client search
    const qCli=((document.getElementById('terrClientSearch')||{}).value||'').toLowerCase().trim();
    const clientsList=Object.values(clientsMapFiltered).filter(c=>!qCli||c.code.toLowerCase().includes(qCli)||(c.nom||'').toLowerCase().includes(qCli)).sort((a,b)=>b.ca-a.ca).slice(0,50);
    let pCli='';
    for(const c of clientsList){
      const typeIcon=c.type==='mixte'?'✅ Mixte':'❌ Ext. pur';
      const rowBg=c.type==='exterieur'?'i-danger-bg':'';
      pCli+=`<tr class="border-b text-[11px] ${rowBg}"><td class="py-1.5 px-2 font-mono">${c.code}</td><td class="py-1.5 px-2 max-w-[180px] truncate">${c.nom}${_unikLink(c.code)}</td><td class="py-1.5 px-2 text-right font-bold">${formatEuro(c.ca)}</td><td class="py-1.5 px-2 text-center">${c.refs.size}</td><td class="py-1.5 px-2 text-center font-bold">${typeIcon}</td></tr>`;
    }
    const cliEl=document.getElementById('terrClientsTable');if(cliEl)cliEl.innerHTML=pCli||'<tr><td colspan="5" class="text-center py-4 t-disabled">Aucun client</td></tr>';

    // Update insights banner — territory data (standard articles absents + clients ext purs)
    const absentsTerr=Object.values(artMapAll).filter(a=>a.rayonStatus==='red').length;
    const extClients=Object.values(clientsMap).filter(c=>c.type==='exterieur').length;
    _S._insights.absentsTerr=absentsTerr;_S._insights.extClients=extClients;_S._insights.hasTerr=true;
    renderInsightsBanner();

    // ── Stockage cache territoire ─────────────────────────────────────────
    // Captures les innerHTML APRÈS le rendu complet, avant _renderFamilleCanal()
    const _gi=(id)=>(document.getElementById(id)||{}).innerHTML||'';
    const _gt=(id)=>(document.getElementById(id)||{}).textContent||'';
    _S._terrCanalCache.set(_terrCacheKey,{
      dirHtml: _gi('terrDirectionTable'),
      top100Html: _gi('terrTop100Table'),
      cliHtml: _gi('terrClientsTable'),
      contribHtml: _gi('terrContribTable'),
      kpi: ['terrKpiLignes','terrKpiLignesSub','terrKpiCATotal','terrKpiCATotalSub',
            'terrKpiCouverture','terrKpiCouvertureSub','terrKpiSpecialPct','terrKpiSpecialSub',
            'terrKpiClients','terrKpiClientsSub','terrSpecialKPIText'].map(id=>[id,_gt(id)]),
    });

  }

  // Toggle direction row — shows famille breakdown (lazy)
  function toggleTerrDir(rowId,encDir){
    const row=document.getElementById(rowId);if(!row)return;
    const inner=document.getElementById(rowId+'-inner');
    const isOpen=row.style.display!=='none';
    if(isOpen&&inner&&inner.dataset.mode==='familles'){row.style.display='none';row.previousElementSibling.classList.remove('expanded');return;}
    row.style.display='table-row';row.previousElementSibling.classList.add('expanded');
    renderTerrDirFamilles(rowId,decodeURIComponent(encDir));
  }

  // Render famille breakdown for a direction (lazy, called by toggleTerrDir)
  function renderTerrDirFamilles(rowId,direction){
    const inner=document.getElementById(rowId+'-inner');if(!inner)return;
    const filterRayon=(document.getElementById('terrFilterRayon')||{}).value||'';
    const q=(document.getElementById('terrSearch')||{}).value||'';
    const selectedSecteurs=getSelectedSecteurs();
    const {activeFilters:{canal:_cg,commercial:_com}}=DataStore.byContext(); // [V3.2]
    const _comSet=_com?(_S.clientsByCommercial.get(_com)||new Set()):null;
    const familles={};
    for(const l of DataStore.filteredTerritoireLines){
      if(_cg&&l.canal!==_cg)continue;
      if(_comSet&&(!l.clientCode||!_comSet.has(l.clientCode)))continue;
      if(l.isSpecial)continue;
      if(l.direction!==direction)continue;
      if(filterRayon&&l.rayonStatus!==filterRayon)continue;
      if(selectedSecteurs&&l.secteur&&!selectedSecteurs.has(l.secteur))continue;
      if(q&&!matchQuery(q,l.code,l.libelle,l.direction))continue;
      const famKey=l.famille||'';
      if(!familles[famKey])familles[famKey]={caTotal:0,nb:new Set()};
      familles[famKey].caTotal+=l.ca;familles[famKey].nb.add(l.code);
    }
    const dirEnc=encodeURIComponent(direction);
    let html=`<table class="min-w-full text-[10px]"><thead class="i-info-bg c-action"><tr><th class="py-1.5 px-4 text-left">Famille</th><th class="py-1.5 px-3 text-center">Nb art.</th><th class="py-1.5 px-3 text-right">CA Le Terrain</th></tr></thead><tbody>`;
    Object.entries(familles).sort((a,b)=>b[1].caTotal-a[1].caTotal).forEach(([fam,fd])=>{
      const famLabel=fam?fam:'❓ Non référencé en agence';
      const famRowId='terr-fam-'+direction.replace(/\W/g,'_')+'-'+fam.replace(/\W/g,'_')+'_f';
      html+=`<tr class="terr-fam-row border-t border-blue-200" onclick="toggleTerrFam('${famRowId}','${dirEnc}','${encodeURIComponent(fam)}')">`+
        `<td class="py-1.5 px-4">${famLabel} <span class="t-disabled text-[9px]">▼</span></td>`+
        `<td class="py-1.5 px-3 text-center">${fd.nb.size}</td>`+
        `<td class="py-1.5 px-3 text-right">${formatEuro(fd.caTotal)}</td></tr>`+
        `<tr id="${famRowId}" style="display:none"><td colspan="3" class="p-0 s-card-alt"><div id="${famRowId}-inner" class="p-3 text-xs t-disabled">Chargement…</div></td></tr>`;
    });
    html+=`</tbody></table>`;
    inner.innerHTML=html;inner.dataset.mode='familles';
  }

  // Toggle status-filtered article view for a direction (✅/⚠️/❌ badge click)
  function toggleTerrDirStatus(rowId,encDir,status){
    const row=document.getElementById(rowId);if(!row)return;
    const inner=document.getElementById(rowId+'-inner');
    const isOpen=row.style.display!=='none';
    if(isOpen&&inner&&inner.dataset.mode===status){row.style.display='none';row.previousElementSibling.classList.remove('expanded');return;}
    row.style.display='table-row';row.previousElementSibling.classList.add('expanded');
    renderTerrDirStatusArticles(rowId,decodeURIComponent(encDir),status);
  }

  // Render filtered article list for a direction + rayonStatus
  function renderTerrDirStatusArticles(rowId,direction,status){
    const inner=document.getElementById(rowId+'-inner');if(!inner)return;
    const stockMap=new Map(DataStore.finalData.map(r=>[r.code,r]));
    const isStd=code=>/^\d{6}$/.test(code);
    const {activeFilters:{canal:_cg,commercial:_com}}=DataStore.byContext(); // [V3.2]
    const _comSet=_com?(_S.clientsByCommercial.get(_com)||new Set()):null;
    const artMap={};
    for(const l of DataStore.filteredTerritoireLines){
      if(_cg&&l.canal!==_cg)continue;
      if(_comSet&&(!l.clientCode||!_comSet.has(l.clientCode)))continue;
      if(l.isSpecial)continue;
      if(l.direction!==direction||l.rayonStatus!==status)continue;
      if(!artMap[l.code])artMap[l.code]={code:l.code,libelle:l.libelle,famille:l.famille||'',ca:0};
      artMap[l.code].ca+=l.ca;
    }
    const arts=Object.values(artMap).sort((a,b)=>b.ca-a.ca);
    const statusLabel=status==='green'?'✅ En rayon':status==='yellow'?'⚠️ Rupture':'❌ Absent';
    const hdrCls=status==='green'?'i-ok-bg c-ok':status==='yellow'?'i-caution-bg c-caution':'i-danger-bg c-danger';
    const LIMIT=50;
    let html=`<div class="font-semibold t-primary mb-2 text-[11px] px-3 pt-3">${statusLabel} — ${arts.length} article${arts.length>1?'s':''} dans <em>${direction}</em></div>`;
    if(!arts.length){inner.innerHTML=html+'<p class="t-disabled text-[11px] px-3 pb-3">Aucun article.</p>';inner.dataset.mode=status;return;}
    html+=`<table class="min-w-full text-[11px]"><thead class="${hdrCls}"><tr><th class="py-1.5 px-3 text-left">Code</th><th class="py-1.5 px-3 text-left">Libellé</th><th class="py-1.5 px-3 text-left">Famille</th><th class="py-1.5 px-3 text-right">CA Legallais</th><th class="py-1.5 px-3 text-right">Stock</th></tr></thead><tbody id="${rowId}-statusbody">`;
    html+=_buildTerrDirStatusRows(arts.slice(0,LIMIT),stockMap,isStd);
    html+=`</tbody></table>`;
    if(arts.length>LIMIT)html+=`<button class="mt-2 mb-2 ml-2 text-xs font-bold hover:underline t-secondary" onclick="_loadMoreTerrDirStatus(this,'${rowId}',${LIMIT},'${encodeURIComponent(direction)}','${status}')">▼ Voir plus (${arts.length-LIMIT} restants…)</button>`;
    inner.innerHTML=html;inner.dataset.mode=status;
  }
  function _buildTerrDirStatusRows(arts,stockMap,isStd){
    let html='';
    for(const a of arts){
      const si=stockMap.get(a.code),st=si?si.stockActuel:'—';
      const speTag=!isStd(a.code)?'<span class="ml-1 text-[9px] s-hover t-tertiary font-bold px-1 rounded">SPÉ</span>':'';
      html+=`<tr class="border-t b-light"><td class="py-1 px-3 font-mono text-[10px]">${a.code}${speTag}</td><td class="py-1 px-3 max-w-[180px] truncate">${a.libelle}</td><td class="py-1 px-3 t-tertiary text-[10px]">${famLib(a.famille)||'❓'}</td><td class="py-1 px-3 text-right font-bold">${formatEuro(a.ca)}</td><td class="py-1 px-3 text-right">${st}</td></tr>`;
    }
    return html;
  }
  function _loadMoreTerrDirStatus(btn,rowId,offset,encDir,status){
    const direction=decodeURIComponent(encDir);
    const LIMIT=50,newOff=offset+LIMIT;
    const stockMap=new Map(DataStore.finalData.map(r=>[r.code,r]));
    const isStd=code=>/^\d{6}$/.test(code);
    const {activeFilters:{canal:_cg,commercial:_com}}=DataStore.byContext(); // [V3.2]
    const _comSet=_com?(_S.clientsByCommercial.get(_com)||new Set()):null;
    const artMap={};
    for(const l of DataStore.filteredTerritoireLines){
      if(_cg&&l.canal!==_cg)continue;
      if(_comSet&&(!l.clientCode||!_comSet.has(l.clientCode)))continue;
      if(l.isSpecial)continue;
      if(l.direction!==direction||l.rayonStatus!==status)continue;
      if(!artMap[l.code])artMap[l.code]={code:l.code,libelle:l.libelle,famille:l.famille||'',ca:0};
      artMap[l.code].ca+=l.ca;
    }
    const arts=Object.values(artMap).sort((a,b)=>b.ca-a.ca);
    const tbody=document.getElementById(rowId+'-statusbody');
    if(tbody)tbody.insertAdjacentHTML('beforeend',_buildTerrDirStatusRows(arts.slice(offset,newOff),stockMap,isStd));
    const rem=arts.length-newOff;
    if(rem>0){btn.textContent=`▼ Voir plus (${rem} restants…)`;btn.onclick=()=>_loadMoreTerrDirStatus(btn,rowId,newOff,encDir,status);}else btn.remove();
  }

  // Toggle famille row inside direction detail (lazy load articles)
  function toggleTerrFam(rowId,encDir,encFam){
    const row=document.getElementById(rowId);if(!row)return;
    const isOpen=row.style.display!=='none';
    if(isOpen){row.style.display='none';if(row.previousElementSibling)row.previousElementSibling.classList.remove('open');return;}
    row.style.display='table-row';if(row.previousElementSibling)row.previousElementSibling.classList.add('open');
    const inner=document.getElementById(rowId+'-inner');
    if(inner&&inner.textContent.trim()==='Chargement…')renderTerrFamArticles(rowId,decodeURIComponent(encDir),decodeURIComponent(encFam));
  }

  // Render article list for a direction+famille combination, with optional rayonStatus filter
  function renderTerrFamArticles(rowId,direction,famille,statusFilter){
    statusFilter=statusFilter||'';
    const inner=document.getElementById(rowId+'-inner');if(!inner)return;
    const stockMap=new Map(DataStore.finalData.map(r=>[r.code,r]));
    const {activeFilters:{canal:_cg,commercial:_com}}=DataStore.byContext(); // [V3.2]
    const _comSet=_com?(_S.clientsByCommercial.get(_com)||new Set()):null;
    const artMap={};
    for(const l of DataStore.filteredTerritoireLines){
      if(_cg&&l.canal!==_cg)continue;
      if(_comSet&&(!l.clientCode||!_comSet.has(l.clientCode)))continue;
      if(l.direction!==direction)continue;
      if((l.famille||'')!==famille)continue;
      if(!artMap[l.code])artMap[l.code]={code:l.code,libelle:l.libelle,ca:0,qty:0,rayonStatus:l.rayonStatus};
      artMap[l.code].ca+=l.ca;artMap[l.code].qty+=1;
    }
    const allArts=Object.values(artMap).sort((a,b)=>b.ca-a.ca);
    const arts=statusFilter?allArts.filter(a=>a.rayonStatus===statusFilter):allArts;
    const nbGreen=allArts.filter(a=>a.rayonStatus==='green').length;
    const nbYellow=allArts.filter(a=>a.rayonStatus==='yellow').length;
    const nbRed=allArts.filter(a=>a.rayonStatus==='red').length;
    const LIMIT=50;
    const encDir=encodeURIComponent(direction),encFam=encodeURIComponent(famille);
    const tgGreen=statusFilter==='green'?"''":"'green'";
    const tgYellow=statusFilter==='yellow'?"''":"'yellow'";
    const tgRed=statusFilter==='red'?"''":"'red'";
    const resetBtn=statusFilter?` · <span class="terr-status-badge t-disabled text-[10px]" onclick="renderTerrFamArticles('${rowId}','${encDir}','${encFam}','')">↺ Tout</span>`:'';
    let html=`<div class="font-semibold t-primary mb-2 text-[11px] px-2 pt-2">${allArts.length} art. · `+
      `<span class="terr-status-badge c-ok${statusFilter==='green'?' underline':''}" title="Filtrer En rayon" onclick="renderTerrFamArticles('${rowId}','${encDir}','${encFam}',${tgGreen})">✅ ${nbGreen}</span> · `+
      `<span class="terr-status-badge c-caution${statusFilter==='yellow'?' underline':''}" title="Filtrer Rupture" onclick="renderTerrFamArticles('${rowId}','${encDir}','${encFam}',${tgYellow})">⚠️ ${nbYellow}</span> · `+
      `<span class="terr-status-badge c-danger${statusFilter==='red'?' underline':''}" title="Filtrer Absent" onclick="renderTerrFamArticles('${rowId}','${encDir}','${encFam}',${tgRed})">❌ ${nbRed}</span>${resetBtn}</div>`;
    if(!arts.length){inner.innerHTML=html+'<p class="t-disabled text-[11px] px-2 pb-2">Aucun article pour ce filtre.</p>';return;}
    html+=`<table class="min-w-full text-[11px]"><thead class="s-hover t-primary"><tr><th class="py-1.5 px-3 text-left">Code</th><th class="py-1.5 px-3 text-left">Libellé</th><th class="py-1.5 px-3 text-right">CA Legallais</th><th class="py-1.5 px-3 text-center">Qté BL</th><th class="py-1.5 px-3 text-center">En rayon</th><th class="py-1.5 px-3 text-right">Stock actuel</th></tr></thead><tbody id="${rowId}-artbody">`;
    html+=_buildTerrFamArtRows(arts.slice(0,LIMIT),stockMap);
    html+=`</tbody></table>`;
    if(arts.length>LIMIT)html+=`<button class="mt-2 mb-2 ml-2 text-xs c-action font-bold hover:underline" onclick="_loadMoreTerrFamArt(this,'${rowId}',${LIMIT},'${encDir}','${encFam}','${statusFilter}')">▼ Voir plus (${arts.length-LIMIT} restants…)</button>`;
    inner.innerHTML=html;
  }
  function _buildTerrFamArtRows(arts,stockMap){
    const isStd=code=>/^\d{6}$/.test(code);
    let html='';
    for(const a of arts){
      const si=stockMap.get(a.code),st=si?si.stockActuel:'—';
      const ri=a.rayonStatus==='green'?'✅ En rayon':a.rayonStatus==='yellow'?'⚠️ Rupture':'❌ Absent';
      const rowBg=a.rayonStatus==='red'?'i-danger-bg':a.rayonStatus==='yellow'?'i-caution-bg':'';
      const speTag=!isStd(a.code)?'<span class="ml-1 text-[9px] s-hover t-tertiary font-bold px-1 rounded">SPÉ</span>':'';
      html+=`<tr class="border-t border-sky-100 ${rowBg}"><td class="py-1 px-3 font-mono text-[10px]">${a.code}${speTag}</td><td class="py-1 px-3 max-w-[200px] truncate">${a.libelle}</td><td class="py-1 px-3 text-right font-bold">${formatEuro(a.ca)}</td><td class="py-1 px-3 text-center">${a.qty}</td><td class="py-1 px-3 text-center">${ri}</td><td class="py-1 px-3 text-right">${st}</td></tr>`;
    }
    return html;
  }
  function _loadMoreTerrFamArt(btn,rowId,offset,encDir,encFam,statusFilter){
    statusFilter=statusFilter||'';
    const direction=decodeURIComponent(encDir),famille=decodeURIComponent(encFam);
    const LIMIT=50,newOff=offset+LIMIT;
    const stockMap=new Map(DataStore.finalData.map(r=>[r.code,r]));
    const {activeFilters:{canal:_cg,commercial:_com}}=DataStore.byContext(); // [V3.2]
    const _comSet=_com?(_S.clientsByCommercial.get(_com)||new Set()):null;
    const artMap={};
    for(const l of DataStore.filteredTerritoireLines){
      if(_cg&&l.canal!==_cg)continue;
      if(_comSet&&(!l.clientCode||!_comSet.has(l.clientCode)))continue;
      if(l.direction!==direction)continue;
      if((l.famille||'')!==famille)continue;
      if(!artMap[l.code])artMap[l.code]={code:l.code,libelle:l.libelle,ca:0,qty:0,rayonStatus:l.rayonStatus};
      artMap[l.code].ca+=l.ca;artMap[l.code].qty+=1;
    }
    let arts=Object.values(artMap).sort((a,b)=>b.ca-a.ca);
    if(statusFilter)arts=arts.filter(a=>a.rayonStatus===statusFilter);
    const tbody=document.getElementById(rowId+'-artbody');
    if(tbody)tbody.insertAdjacentHTML('beforeend',_buildTerrFamArtRows(arts.slice(offset,newOff),stockMap));
    const rem=arts.length-newOff;
    if(rem>0){btn.textContent=`▼ Voir plus (${rem} restants…)`;btn.onclick=()=>_loadMoreTerrFamArt(btn,rowId,newOff,encDir,encFam,statusFilter);}else btn.remove();
  }

  // VOLET 3: Résumé exécutif du croisement
  function renderTerrCroisementSummary(blSetAll,dirSet,clientsMap,top100All,top100InStock){
    const el=document.getElementById('terrCroisementText');if(!el)return;
    const nbLignes=DataStore.territoireLines.length;
    const nbBL=blSetAll.size;
    const nbDirs=dirSet.size;
    const nbClients=Object.keys(clientsMap).length;
    const nbRefStock=DataStore.finalData.length;
    const nbMois=_S.consommeMoisCouverts||'?';
    const nbBLConso=Object.keys(_S.blData).length;
    const pctTop100=top100All.length>0?Math.round(top100InStock/top100All.length*100):0;
    let terrPeriodStr='';
    // Detect territory period from lines
    let tMin=null,tMax=null;
    for(const l of DataStore.territoireLines){if(l.dateExp){if(!tMin||l.dateExp<tMin)tMin=l.dateExp;if(!tMax||l.dateExp>tMax)tMax=l.dateExp;}}
    if(tMin&&tMax)terrPeriodStr=`, ${fmtDate(new Date(tMin))}–${fmtDate(new Date(tMax))}`;
    else if(_S.consommePeriodMin)terrPeriodStr='';
    el.innerHTML=`<p>🔗 PRISME a croisé <strong class="text-violet-300">${nbLignes.toLocaleString('fr')} lignes territoire</strong> (<span class="c-action">${nbBL.toLocaleString('fr')} BL${terrPeriodStr}</span>, <strong>${nbDirs} Direction${nbDirs>1?'s':''}</strong>, <strong>${nbClients} client${nbClients>1?'s':''}</strong>) avec votre stock agence (<strong class="c-ok">${nbRefStock.toLocaleString('fr')} réf.</strong>) et votre consommé (<strong>${nbMois} mois</strong>, <strong>${nbBLConso.toLocaleString('fr')} BL</strong>).</p><p class="mt-2">→ <strong class="text-yellow-300">${pctTop100}%</strong> des articles du Top 100 territoire sont en rayon.</p>`;
  }

  // VOLET 2bis: Build secteur + direction contributeurs aggregate maps
  function buildTerrContrib(){
    _S.terrContribBySecteur=new Map();_S.terrContribByDirection=new Map();
    for(const l of DataStore.filteredTerritoireLines){
      if(!l.secteur)continue;
      const dir=getSecteurDirection(l.secteur)||l.direction||'—';
      // Per-secteur
      if(!_S.terrContribBySecteur.has(l.secteur))_S.terrContribBySecteur.set(l.secteur,{secteur:l.secteur,direction:dir,blTerr:new Set(),blAgence:new Set(),ca:0,clients:new Map()});
      const s=_S.terrContribBySecteur.get(l.secteur);
      s.blTerr.add(l.bl);if(_S.blConsommeSet.has(l.bl))s.blAgence.add(l.bl);s.ca+=l.ca;
      if(l.clientCode){
        if(!s.clients.has(l.clientCode))s.clients.set(l.clientCode,{code:l.clientCode,nom:l.clientNom,ca:0,refs:new Set(),blTerr:new Set(),blAgence:new Set()});
        const c=s.clients.get(l.clientCode);c.ca+=l.ca;c.refs.add(l.code);c.blTerr.add(l.bl);if(_S.blConsommeSet.has(l.bl))c.blAgence.add(l.bl);
      }
      // Per-direction
      if(!_S.terrContribByDirection.has(dir))_S.terrContribByDirection.set(dir,{direction:dir,blTerr:new Set(),blAgence:new Set(),ca:0});
      const d=_S.terrContribByDirection.get(dir);
      d.blTerr.add(l.bl);if(_S.blConsommeSet.has(l.bl))d.blAgence.add(l.bl);d.ca+=l.ca;
    }
  }

  // VOLET 2bis: Vue 1 — par Direction (5-6 lignes max, triées par CA desc)
  function renderTerrContrib(){
    const el=document.getElementById('terrContribTable');if(!el)return;
    if(!_S.terrContribByDirection.size){el.innerHTML='<tr><td colspan="5" class="text-center py-4 t-disabled text-xs">Aucune donnée contributeurs trouvée dans le fichier territoire</td></tr>';return;}
    const filterDir=(document.getElementById('terrFilterDir')||{}).value||'';
    let rows=[..._S.terrContribByDirection.values()].map(d=>{
      const blT=d.blTerr.size,blA=d.blAgence.size,pct=blT>0?Math.round(blA/blT*100):0;return{...d,blT,blA,pct};
    }).sort((a,b)=>b.ca-a.ca);
    if(filterDir)rows=rows.filter(r=>r.direction===filterDir);
    let tbody='';
    for(const r of rows){
      const barColor=r.pct>=30?'bg-emerald-500':r.pct>=10?'bg-amber-500':'bg-red-500';
      const rowId='contrib-dir-'+r.direction.replace(/\W/g,'_');
      tbody+=`<tr class="contrib-dir-row border-b text-xs" onclick="toggleContribDirection('${rowId}','${encodeURIComponent(r.direction)}')">
        <td class="py-2 px-3 font-bold">${r.direction} <span class="t-disabled font-normal text-[9px]">▼</span></td>
        <td class="py-2 px-3 text-center font-semibold">${r.blT.toLocaleString('fr')}</td>
        <td class="py-2 px-3 text-center font-semibold c-action">${r.blA.toLocaleString('fr')}</td>
        <td class="py-2 px-3"><div class="flex items-center gap-1"><div class="flex-1 s-hover rounded-full h-1.5"><div class="pct-bar-terr ${barColor}" style="width:${r.pct}%"></div></div><span class="text-[10px] font-bold w-10 text-right">${r.pct}%</span></div></td>
        <td class="py-2 px-3 text-right font-bold">${formatEuro(r.ca)}</td>
      </tr><tr id="${rowId}" class="contrib-dir-detail"><td colspan="5" class="p-0 i-info-bg border-b border-violet-100"><div id="${rowId}-inner" class="p-4 text-xs t-disabled">Chargement…</div></td></tr>`;
    }
    el.innerHTML=tbody||'<tr><td colspan="5" class="text-center py-4 t-disabled text-xs">Aucune direction</td></tr>';
    const sumEl=document.getElementById('terrContribSummary');
    if(sumEl){
      const nbDir=rows.length,nbSect=_S.terrContribBySecteur.size;
      const oppo=[..._S.terrContribBySecteur.values()].filter(s=>s.blTerr.size>0&&Math.round(s.blAgence.size/s.blTerr.size*100)<10).length;
      sumEl.textContent=`${nbDir} Direction${nbDir>1?'s':''}, ${nbSect} secteurs — ${oppo} opportunité${oppo>1?'s':''} (<10% BL agence). Cliquez une Direction pour voir ses secteurs.`;
    }
  }

  // Toggle Vue 1 → Vue 2 (secteurs d'une direction)
  function toggleContribDirection(rowId,encDir){
    const row=document.getElementById(rowId);if(!row)return;
    const isOpen=row.classList.contains('open');
    document.querySelectorAll('.contrib-dir-detail.open').forEach(r=>r.classList.remove('open'));
    document.querySelectorAll('.contrib-dir-row.open').forEach(r=>r.classList.remove('open'));
    if(isOpen)return;
    row.classList.add('open');row.previousElementSibling.classList.add('open');
    renderContribSecteurs(rowId,decodeURIComponent(encDir));
  }

  // Vue 2 — Secteurs d'une Direction (lazy, triés % agence ASC = opportunités en haut)
  function renderContribSecteurs(rowId,direction){
    const inner=document.getElementById(rowId+'-inner');if(!inner)return;
    const LIMIT=50;
    const secteurs=[..._S.terrContribBySecteur.values()]
      .filter(s=>s.direction===direction)
      .map(s=>{const blT=s.blTerr.size,blA=s.blAgence.size,pct=blT>0?Math.round(blA/blT*100):0;return{...s,blT,blA,pct};})
      .sort((a,b)=>a.pct-b.pct);
    if(!secteurs.length){inner.innerHTML='<p class="t-disabled text-[11px]">Aucun secteur pour cette direction.</p>';return;}
    const oppo=secteurs.filter(s=>s.pct<10).length;
    let html=`<div class="text-[11px] font-bold t-primary mb-2">${secteurs.length} secteur${secteurs.length>1?'s':''} · ${oppo} opportunité${oppo>1?'s':''} (&lt;10% agence) — trié par % BL agence croissant</div>`;
    html+=`<table class="min-w-full text-[11px]"><thead class="s-hover t-primary"><tr><th class="py-1.5 px-3 text-left">Secteur</th><th class="py-1.5 px-3 text-center">BL territoire</th><th class="py-1.5 px-3 text-center">BL agence</th><th class="py-1.5 px-3 text-center min-w-[130px]">% agence</th><th class="py-1.5 px-3 text-right">CA Legallais</th></tr></thead><tbody id="${rowId}-sectbody">`;
    html+=_buildSecteurRows(secteurs.slice(0,LIMIT));
    html+=`</tbody></table>`;
    if(secteurs.length>LIMIT)html+=`<button class="mt-2 text-xs c-action font-bold hover:underline" onclick="_loadMoreSecteurs(this,'${rowId}',${LIMIT},'${encodeURIComponent(direction)}')">▼ Voir plus (${secteurs.length-LIMIT} restants…)</button>`;
    inner.innerHTML=html;
  }
  function _buildSecteurRows(secteurs){
    let html='';
    for(const r of secteurs){
      const barColor=r.pct>=30?'bg-emerald-500':r.pct>=10?'bg-amber-500':'bg-red-500';
      const rowId='contrib-sect-'+r.secteur.replace(/\W/g,'_');
      html+=`<tr class="contrib-sect-row border-t border-violet-100" onclick="toggleContribSecteur('${rowId}','${encodeURIComponent(r.secteur)}')">
        <td class="py-1.5 px-3 font-bold">${r.secteur} <span class="t-disabled text-[9px]">▼</span></td>
        <td class="py-1.5 px-3 text-center">${r.blT.toLocaleString('fr')}</td>
        <td class="py-1.5 px-3 text-center c-action font-semibold">${r.blA.toLocaleString('fr')}</td>
        <td class="py-1.5 px-3"><div class="flex items-center gap-1"><div class="flex-1 s-hover rounded-full h-1.5"><div class="pct-bar-terr ${barColor}" style="width:${r.pct}%"></div></div><span class="text-[10px] font-bold w-10 text-right">${r.pct}%</span></div></td>
        <td class="py-1.5 px-3 text-right font-bold">${formatEuro(r.ca)}</td>
      </tr><tr id="${rowId}" class="contrib-sect-detail"><td colspan="5" class="p-0 i-ok-bg"><div id="${rowId}-inner" class="p-3 text-xs t-disabled">Chargement…</div></td></tr>`;
    }
    return html;
  }
  function _loadMoreSecteurs(btn,parentRowId,offset,encDir){
    const direction=decodeURIComponent(encDir);
    const LIMIT=50,newOff=offset+LIMIT;
    const secteurs=[..._S.terrContribBySecteur.values()].filter(s=>s.direction===direction).map(s=>{const blT=s.blTerr.size,blA=s.blAgence.size,pct=blT>0?Math.round(blA/blT*100):0;return{...s,blT,blA,pct};}).sort((a,b)=>a.pct-b.pct);
    const tbody=document.getElementById(parentRowId+'-sectbody');
    if(tbody)tbody.insertAdjacentHTML('beforeend',_buildSecteurRows(secteurs.slice(offset,newOff)));
    const rem=secteurs.length-newOff;
    if(rem>0){btn.textContent=`▼ Voir plus (${rem} restants…)`;btn.onclick=()=>_loadMoreSecteurs(btn,parentRowId,newOff,encDir);}else btn.remove();
  }

  // Toggle Vue 2 → Vue 3 (clients d'un secteur)
  function toggleContribSecteur(rowId,encSect){
    const row=document.getElementById(rowId);if(!row)return;
    const isOpen=row.classList.contains('open');
    document.querySelectorAll('.contrib-sect-detail.open').forEach(r=>r.classList.remove('open'));
    document.querySelectorAll('.contrib-sect-row.open').forEach(r=>r.classList.remove('open'));
    if(isOpen)return;
    row.classList.add('open');row.previousElementSibling.classList.add('open');
    renderContribClients(rowId,decodeURIComponent(encSect));
  }

  // Vue 3 — Clients d'un secteur (lazy, triés CA desc, limite 50)
  function renderContribClients(rowId,secteur){
    const inner=document.getElementById(rowId+'-inner');if(!inner)return;
    const s=_S.terrContribBySecteur.get(secteur);if(!s){inner.textContent='Données introuvables';return;}
    const clients=[...s.clients.values()].sort((a,b)=>b.ca-a.ca);
    const LIMIT=50;
    const mixte=clients.filter(c=>c.blAgence.size>0).length,jamais=clients.filter(c=>c.blAgence.size===0).length;
    let html=`<div class="font-bold t-primary mb-2 text-[11px]">✅ ${mixte} client${mixte>1?'s':''} viennent en agence · ❌ ${jamais} ne viennent jamais</div>`;
    html+=`<table class="min-w-full text-[11px]"><thead class="i-ok-bg c-ok"><tr><th class="py-1.5 px-3 text-left">Code</th><th class="py-1.5 px-3 text-left">Nom</th><th class="py-1.5 px-3 text-right">CA Legallais</th><th class="py-1.5 px-3 text-center">Agence</th><th class="py-1.5 px-3 text-center">BL agence</th></tr></thead><tbody id="${rowId}-clibody">`;
    html+=_buildClientRows(clients.slice(0,LIMIT));
    html+=`</tbody></table>`;
    if(clients.length>LIMIT)html+=`<button class="mt-2 text-xs c-ok font-bold hover:underline" onclick="_loadMoreClients(this,'${rowId}',${LIMIT},'${encodeURIComponent(secteur)}')">▼ Voir plus (${clients.length-LIMIT} restants…)</button>`;
    inner.innerHTML=html;
  }
  function _buildClientRows(clients){
    let html='';
    for(const c of clients){
      const vient=c.blAgence.size>0;
      const rowBg=!vient?'i-danger-bg':'';
      const cliRowId='contrib-cli-'+c.code;
      html+=`<tr class="contrib-client-row border-t border-emerald-200 ${rowBg}" onclick="toggleContribClient('${cliRowId}','${c.code}')">
        <td class="py-1.5 px-3 font-mono">${c.code} <span class="t-disabled text-[9px]">▼</span></td>
        <td class="py-1.5 px-3 max-w-[160px] truncate">${c.nom}${_unikLink(c.code)}${_S.chalandiseReady?_clientStatusBadge(c.code,_S.chalandiseData.get(c.code)||{}):''}</td>
        <td class="py-1.5 px-3 text-right font-bold">${formatEuro(c.ca)}</td>
        <td class="py-1.5 px-3 text-center font-bold">${vient?'✅ Oui':'❌ Jamais'}</td>
        <td class="py-1.5 px-3 text-center">${c.blAgence.size}</td>
      </tr><tr id="${cliRowId}" class="contrib-client-detail"><td colspan="5" class="p-0 s-card border-t b-light"><div id="${cliRowId}-inner" class="p-3 text-xs t-disabled">Chargement…</div></td></tr>`;
    }
    return html;
  }
  function _loadMoreClients(btn,parentRowId,offset,encSect){
    const secteur=decodeURIComponent(encSect);
    const LIMIT=50,newOff=offset+LIMIT;
    const s=_S.terrContribBySecteur.get(secteur);if(!s)return;
    const clients=[...s.clients.values()].sort((a,b)=>b.ca-a.ca);
    const tbody=document.getElementById(parentRowId+'-clibody');
    if(tbody)tbody.insertAdjacentHTML('beforeend',_buildClientRows(clients.slice(offset,newOff)));
    const rem=clients.length-newOff;
    if(rem>0){btn.textContent=`▼ Voir plus (${rem} restants…)`;btn.onclick=()=>_loadMoreClients(btn,parentRowId,newOff,encSect);}else btn.remove();
  }

  // Toggle Vue 3 → Vue 4 (articles d'un client)
  function toggleContribClient(rowId,clientCode){
    const row=document.getElementById(rowId);if(!row)return;
    const isOpen=row.classList.contains('open');
    document.querySelectorAll('.contrib-client-detail.open').forEach(r=>r.classList.remove('open'));
    document.querySelectorAll('.contrib-client-row.open').forEach(r=>r.classList.remove('open'));
    if(isOpen)return;
    row.classList.add('open');row.previousElementSibling.classList.add('open');
    renderContribArticles(rowId,clientCode);
  }

  // Vue 4 — Articles d'un client (lazy, triés CA desc, limite 50) — inclut spéciaux avec tag SPÉ
  function renderContribArticles(rowId,clientCode){
    const inner=document.getElementById(rowId+'-inner');if(!inner)return;
    const stockMap=new Map(DataStore.finalData.map(r=>[r.code,r]));
    const isStd=code=>/^\d{6}$/.test(code);
    const artMap={};
    for(const l of DataStore.filteredTerritoireLines){
      if(l.clientCode!==clientCode)continue;
      if(!artMap[l.code])artMap[l.code]={code:l.code,libelle:l.libelle,ca:0,qty:0,rayonStatus:l.rayonStatus,isSpecial:l.isSpecial||!isStd(l.code)};
      artMap[l.code].ca+=l.ca;artMap[l.code].qty+=1;
    }
    const arts=Object.values(artMap).sort((a,b)=>b.ca-a.ca);
    const LIMIT=50;
    const stdArts=arts.filter(a=>!a.isSpecial);
    const nbEnRayon=stdArts.filter(a=>a.rayonStatus==='green').length,nbAbsent=stdArts.filter(a=>a.rayonStatus==='red').length;
    const nbSpe=arts.length-stdArts.length;
    let html=`<div class="font-semibold t-primary mb-2 text-[11px]">Ce client achète <strong>${arts.length}</strong> réf. dont <strong class="c-ok">${nbEnRayon} en rayon</strong>, <strong class="c-danger">${nbAbsent} absentes</strong>${nbSpe>0?`, <span class="t-disabled">${nbSpe} SPÉ</span>`:''}</div>`;
    if(!arts.length){inner.innerHTML=html+'<p class="t-disabled text-xs">Aucun article trouvé.</p>';return;}
    html+=`<table class="min-w-full text-[11px]"><thead class="s-hover t-primary"><tr><th class="py-1.5 px-3 text-left">Code</th><th class="py-1.5 px-3 text-left">Libellé</th><th class="py-1.5 px-3 text-right">CA Legallais</th><th class="py-1.5 px-3 text-center">Qté BL</th><th class="py-1.5 px-3 text-center">En rayon</th><th class="py-1.5 px-3 text-right">Stock</th></tr></thead><tbody>`;
    for(const a of arts.slice(0,LIMIT)){
      const si=stockMap.get(a.code),st=si?si.stockActuel:'—';
      const ri=a.rayonStatus==='green'?'✅ En rayon':a.rayonStatus==='yellow'?'⚠️ Rupture':'❌ Absent';
      const rowBg=a.isSpecial?'s-card-alt':a.rayonStatus==='red'?'i-danger-bg':a.rayonStatus==='yellow'?'i-caution-bg':'';
      const speTag=a.isSpecial?'<span class="ml-1 text-[9px] s-hover t-tertiary font-bold px-1 rounded">SPÉ</span>':'';
      html+=`<tr class="border-t b-light ${rowBg}"><td class="py-1 px-3 font-mono text-[10px]">${a.code}${speTag}</td><td class="py-1 px-3 max-w-[200px] truncate">${a.libelle}</td><td class="py-1 px-3 text-right font-bold">${formatEuro(a.ca)}</td><td class="py-1 px-3 text-center">${a.qty}</td><td class="py-1 px-3 text-center">${a.isSpecial?'<span class="t-disabled text-[10px]">— spécial</span>':ri}</td><td class="py-1 px-3 text-right">${a.isSpecial?'—':st}</td></tr>`;
    }
    html+=`</tbody></table>`;
    if(arts.length>LIMIT)html+=`<p class="text-[10px] t-disabled mt-1 italic">… et ${arts.length-LIMIT} article${arts.length-LIMIT>1?'s':''} supplémentaires.</p>`;
    inner.innerHTML=html;
  }

  // Reset all territoire local filters + close all accordions
  function resetTerrFilters(){
    const s=document.getElementById('terrSearch');if(s)s.value='';
    const cs=document.getElementById('terrClientSearch');if(cs)cs.value='';
    const d=document.getElementById('terrFilterDir');if(d)d.value='';
    const r=document.getElementById('terrFilterRayon');if(r)r.value='';
    // Reset secteur multi-select
    document.querySelectorAll('#terrSecteurCheckboxes input[type=checkbox]').forEach(cb=>cb.checked=true);
    const allCb=document.getElementById('terrSecteurAll');if(allCb)allCb.checked=true;
    const label=document.getElementById('terrSecteurLabel');if(label)label.textContent='Tous Secteurs';
    // Close all direction/famille detail rows
    document.querySelectorAll('[id^="terr-dir-"]').forEach(el=>{if(el.tagName==='TR'&&el.style)el.style.display='none';});
    document.querySelectorAll('[id^="terr-fam-"]').forEach(el=>{if(el.tagName==='TR'&&el.style)el.style.display='none';});
    document.querySelectorAll('.terr-row.expanded').forEach(el=>el.classList.remove('expanded'));
    document.querySelectorAll('.terr-fam-row.open').forEach(el=>el.classList.remove('open'));
    // Close contrib accordions
    document.querySelectorAll('.contrib-dir-detail.open,.contrib-sect-detail.open,.contrib-client-detail.open').forEach(el=>el.classList.remove('open'));
    document.querySelectorAll('.contrib-dir-row.open,.contrib-sect-row.open,.contrib-client-row.open').forEach(el=>el.classList.remove('open'));
    renderTerritoireTab();
  }

  // VOLET 2bis: Export CSV — tous les secteurs avec leurs métriques
  function exportContribCSV(){
    if(!_S.terrContribBySecteur.size){showToast('⚠️ Aucune donnée contributeurs','warning');return;}
    const SEP=';';
    const h=['Direction','Secteur','BL territoire','BL agence','% agence','CA Legallais'];
    const lines=['\uFEFF'+h.join(SEP)];
    const rows=[..._S.terrContribBySecteur.values()].map(s=>({dir:s.direction,secteur:s.secteur,blT:s.blTerr.size,blA:s.blAgence.size,pct:s.blTerr.size>0?Math.round(s.blAgence.size/s.blTerr.size*100):0,ca:s.ca})).sort((a,b)=>a.dir.localeCompare(b.dir)||a.pct-b.pct);
    for(const r of rows)lines.push([r.dir,r.secteur,r.blT,r.blA,r.pct+'%',r.ca.toFixed(2).replace('.',',')].join(SEP));
    const blob=new Blob([lines.join('\n')],{type:'text/csv;charset=utf-8;'});
    const link=document.createElement('a');link.href=URL.createObjectURL(blob);link.download=`PRISME_Contributeurs_${new Date().toISOString().slice(0,10)}.csv`;document.body.appendChild(link);link.click();document.body.removeChild(link);URL.revokeObjectURL(link.href);showToast('📥 CSV Contributeurs téléchargé','success');
  }

  function exportTerritoireCSV(){
    if(!DataStore.territoireLines.length){showToast('⚠️ Aucune donnée territoire','warning');return;}
    const SEP=';';const h=['Code','Libelle','Direction','Secteur','Famille','BL','CA','Canal','Rayon','Client','Nom Client','Type'];
    const lines=['\uFEFF'+h.join(SEP)];
    const q=(document.getElementById('terrSearch')||{}).value||'';
    const filterDir=(document.getElementById('terrFilterDir')||{}).value||'';
    const filterRayon=(document.getElementById('terrFilterRayon')||{}).value||'';
    const selectedSecteursCSV=getSelectedSecteurs();
    const {activeFilters:{canal:_canalGlobalExp,commercial:_comExp}}=DataStore.byContext(); // [V3.2]
    const _comSetExp=_comExp?(_S.clientsByCommercial.get(_comExp)||new Set()):null;
    const filtered=DataStore.filteredTerritoireLines.filter(l=>{
      if(_canalGlobalExp&&l.canal!==_canalGlobalExp)return false;
      if(_comSetExp&&(!l.clientCode||!_comSetExp.has(l.clientCode)))return false; // [V3.2]
      if(filterDir&&l.direction!==filterDir)return false;
      if(filterRayon&&l.rayonStatus!==filterRayon)return false;
      if(selectedSecteursCSV&&l.secteur&&!selectedSecteursCSV.has(l.secteur))return false;
      if(q&&!matchQuery(q,l.code,l.libelle,l.direction))return false;
      return true;
    });
    const rayonLabels={green:'En rayon',yellow:'Rupture',red:'Absent'};
    for(const l of filtered){lines.push([l.code,`"${l.libelle}"`,`"${l.direction}"`,`"${l.secteur||''}"`,`"${famLib(l.famille)||l.famille}"`,l.bl,l.ca.toFixed(2).replace('.',','),l.canal,rayonLabels[l.rayonStatus]||l.rayonStatus,l.clientCode,`"${l.clientNom}"`,l.clientType].join(SEP));}
    const blob=new Blob([lines.join('\n')],{type:'text/csv;charset=utf-8;'});
    const _store=(_S.selectedMyStore||'').replace(/[^A-Z0-9]/gi,'');
    const _canalSuffix=_canalGlobalExp?`_${_canalGlobalExp}`:'';
    const _dateStr=new Date().toISOString().slice(0,7);
    const link=document.createElement('a');link.href=URL.createObjectURL(blob);link.download=`terrain${_store?'_'+_store:''}${_canalSuffix}_${_dateStr}.csv`;document.body.appendChild(link);link.click();document.body.removeChild(link);URL.revokeObjectURL(link.href);showToast('📥 CSV Le Terrain téléchargé','success');
  }



  function renderBenchmark(){
    // Libellé canal dynamique dans KPI Comparatifs (basé sur _reseauCanaux)
    {const _rl=_S._reseauCanaux||new Set();const _lEl=document.getElementById('benchKpiCanalLabel');if(_lEl){const _LMAP={MAGASIN:'MAGASIN',INTERNET:'Internet',REPRESENTANT:'Représentant',DCS:'DCS',AUTRE:'Autre'};if(_rl.size===0){_lEl.textContent='📡 Tous canaux';}else if(_rl.size===1){const _c=[..._rl][0];_lEl.textContent=`📡 Canal ${_LMAP[_c]||_c} uniquement`;}else{_lEl.textContent=`📡 ${_rl.size} canaux`;}}}
    // [Adapter Étape 5] — DataStore.benchLists : canal-invariant via cache _benchCache
    const{missed,over,storePerf,familyPerf}=DataStore.benchLists;const cs=getBenchCompareStores().filter(s=>_S.storesIntersection.has(s));const q=(document.getElementById('benchSearch')?.value||'').trim();
    // Render observatory sections
    renderObservatoire();
const fl=l=>q?l.filter(x=>matchQuery(q,x.code,x.lib)):l;const fM=fl(missed),fO=fl(over),fU=fl(DataStore.benchLists.under||[]);
    // ── Famille filter partagé Sections A + B ────────────────────────────────
    const _famFilter=_S._reseauMissedFamFilter||'';
    const _famSel=document.getElementById('benchMissedFamFilter');
    if(_famSel){const _famSet=new Set([...fM,...fU].map(x=>_S.articleFamille?.[x.code]||''));let _opts='<option value="">Toutes familles</option>';for(const f of[..._famSet].filter(Boolean).sort())_opts+=`<option value="${f}"${f===_famFilter?' selected':''}>${famLib(f)}</option>`;_famSel.innerHTML=_opts;_famSel.value=_famFilter;}
    const fMFiltered=_famFilter?fM.filter(m=>(_S.articleFamille?.[m.code]||'')===_famFilter):fM;
    const fUFiltered=_famFilter?fU.filter(u=>(_S.articleFamille?.[u.code]||'')===_famFilter):fU;
    const _MISSED_PAGE=10;const _TOP5=5;
    const _mSortCol=_S._missedSortCol||'freq';const _mSortDir=_S._missedSortDir||'desc';
    const fMSorted=[...fMFiltered].sort((a,b)=>{const va=_mSortCol==='freq'?a.bassinFreq:_mSortCol==='agences'?a.sc:a.myStock;const vb=_mSortCol==='freq'?b.bassinFreq:_mSortCol==='agences'?b.sc:b.myStock;return _mSortDir==='desc'?vb-va:va-vb;});
    const _mShowAll=!!_S._reseauMissedShowAll;const _totalMissedPages=Math.max(1,Math.ceil(fMFiltered.length/_MISSED_PAGE));if((_S._reseauMissedPage||0)>=_totalMissedPages)_S._reseauMissedPage=0;const _curMissedPage=_S._reseauMissedPage||0;
    const fMPage=_mShowAll?fMSorted.slice(_curMissedPage*_MISSED_PAGE,(_curMissedPage+1)*_MISSED_PAGE):fMSorted.slice(0,_TOP5);
    const _countEl=document.getElementById('benchMissedCountLabel');if(_countEl)_countEl.textContent=fMFiltered.length?`${fMFiltered.length} article${fMFiltered.length>1?'s':''}`:'';
    const sB=(id,n)=>{const el=document.getElementById(id);if(el)el.textContent=n;};
    sB('badgeMissed',fM.length);sB('badgeOver',fO.length);sB('badgeStores',Object.keys(storePerf).length);
    // Update sort indicators
    ['freq','agences','stock'].forEach(c=>{const el=document.getElementById('missedSort'+c.charAt(0).toUpperCase()+c.slice(1));if(el)el.textContent=c===_mSortCol?(_mSortDir==='desc'?'↓':'↑'):'';});
    // Detail tables (elements removed from DOM — render only if still present)
    const rT=(id,html)=>{const e=document.getElementById(id);if(e)e.innerHTML=html;};
    let p=[];for(const m of fMPage){const dc=m.myStock>0?'c-ok':'c-danger';const di=m.myStock>0?'🟢':'🔴';const dt=m.myStock>0?'Visibilité?':'Référencer';const mLib=escapeHtml(m.lib||'');p.push(`<tr class="border-b hover:i-danger-bg"><td class="py-1.5 px-2"><span class="font-mono t-tertiary block text-[10px]">${m.code}</span><span class="text-[11px] font-semibold leading-tight" title="${mLib}">${mLib}</span></td><td class="py-1.5 px-2 text-center font-bold c-danger">${m.bassinFreq}</td><td class="py-1.5 px-2 text-center t-tertiary">${m.sc}/${m.nbCompare}</td><td class="py-1.5 px-2 text-right font-bold ${m.myStock>0?'c-ok':'c-danger'}">${m.myStock}</td><td class="py-1.5 px-2 text-center ${dc} text-[9px] font-bold">${di} ${dt}</td></tr>`);}
    if(!_mShowAll&&fMFiltered.length>_TOP5)p.push(`<tr><td colspan="5" class="text-center py-3"><button data-action="_reseauShowAll" data-section="missed" class="text-xs s-card border b-default rounded px-3 py-1.5 font-bold hover:s-hover t-secondary">Voir les ${fMFiltered.length} articles →</button></td></tr>`);
    else if(_mShowAll&&_totalMissedPages>1)p.push(`<tr><td colspan="5" class="text-center py-2"><div class="inline-flex items-center gap-2 text-xs"><button data-action="_reseauPage" data-section="missed" data-dir="-1" ${_curMissedPage===0?'disabled':''} class="px-2 py-1 s-card border b-default rounded hover:s-hover disabled:opacity-30 disabled:cursor-not-allowed">←</button><span class="t-secondary font-semibold">Page ${_curMissedPage+1} sur ${_totalMissedPages}</span><button data-action="_reseauPage" data-section="missed" data-dir="1" ${_curMissedPage>=_totalMissedPages-1?'disabled':''} class="px-2 py-1 s-card border b-default rounded hover:s-hover disabled:opacity-30 disabled:cursor-not-allowed">→</button></div></td></tr>`);
    rT('benchMissedTable',p.join('')||'<tr><td colspan="5" class="text-center py-4 t-disabled">🎉</td></tr>');
    p=[];for(const o of fO){const oLib=escapeHtml(o.lib||'');p.push(`<tr class="border-b hover:i-ok-bg"><td class="py-1.5 px-2"><span class="font-mono t-tertiary block text-[10px]">${o.code}</span><span class="text-[11px] font-semibold leading-tight" title="${oLib}">${oLib}</span></td><td class="py-1.5 px-2 text-center font-bold c-ok">${o.myQte}</td><td class="py-1.5 px-2 text-center t-secondary">${o.avg}</td><td class="py-1.5 px-2 text-right c-ok font-extrabold text-xs">${(o.ratio*100).toFixed(0)}%🚀</td></tr>`);}
    rT('benchOverTable',p.join('')||'<tr><td colspan="4" class="text-center py-4 t-disabled">—</td></tr>');
    // Section B : benchLists.under filtré par famille, top 5 par défaut, bouton voir tout paginé
    {const _UP=10;const _uShowAll=!!_S._reseauUnderShowAll;const _tUP=Math.max(1,Math.ceil(fUFiltered.length/_UP));if((_S._reseauUnderPage||0)>=_tUP)_S._reseauUnderPage=0;const _cUP=_S._reseauUnderPage||0;const fUPage=_uShowAll?fUFiltered.slice(_cUP*_UP,(_cUP+1)*_UP):fUFiltered.slice(0,5);let _uHtml='';if(!fUFiltered.length){_uHtml='<p class="t-disabled text-sm p-4">Aucun article sous-exploité détecté.</p>';}else{const _uRows=fUPage.map(o=>{const uLib=escapeHtml(o.lib||'');return`<tr class="border-b hover:i-caution-bg"><td class="py-1.5 px-2"><span class="font-mono t-tertiary block text-[10px]">${o.code}</span><span class="text-[11px] font-semibold leading-tight" title="${uLib}">${uLib}</span></td><td class="py-1.5 px-2 text-center font-bold c-caution">${o.myQte}</td><td class="py-1.5 px-2 text-center t-secondary">${o.avg}</td><td class="py-1.5 px-2 text-right c-caution font-bold text-xs">${(o.ratio*100).toFixed(0)}%</td></tr>`;}).join('');const _uFoot=!_uShowAll&&fUFiltered.length>5?`<div class="text-center py-3"><button data-action="_reseauShowAll" data-section="under" class="text-xs s-card border b-default rounded px-3 py-1.5 font-bold hover:s-hover t-secondary">Voir les ${fUFiltered.length} articles →</button></div>`:_uShowAll&&_tUP>1?`<div class="text-center mt-2"><div class="inline-flex items-center gap-2 text-xs"><button data-action="_reseauPage" data-section="under" data-dir="-1" ${_cUP===0?'disabled':''} class="px-2 py-1 s-card border b-default rounded hover:s-hover disabled:opacity-30 disabled:cursor-not-allowed">←</button><span class="t-secondary font-semibold">Page ${_cUP+1} sur ${_tUP}</span><button data-action="_reseauPage" data-section="under" data-dir="1" ${_cUP>=_tUP-1?'disabled':''} class="px-2 py-1 s-card border b-default rounded hover:s-hover disabled:opacity-30 disabled:cursor-not-allowed">→</button></div></div>`:'';_uHtml=`<p class="text-[11px] t-tertiary mb-2"><strong>${fUFiltered.length}</strong> article${fUFiltered.length>1?'s':''} vendus par le réseau, sous-exploités ici.</p><div class="overflow-x-auto"><table class="min-w-full text-xs"><thead class="s-panel-inner t-inverse"><tr><th class="py-1 px-2 text-left">Code / Libellé</th><th class="py-1 px-2 text-center">Moi (prél.)</th><th class="py-1 px-2 text-center">Moy réseau</th><th class="py-1 px-2 text-right">Ratio</th></tr></thead><tbody>${_uRows}</tbody></table></div>${_uFoot}`;}const _uEl=document.getElementById('reseauSousExploitesContainer');if(_uEl)_uEl.innerHTML=_uHtml;}
    // Forces & Faiblesses
    const _obsMode=_S.selectedObsCompare||'median';const _isMedian=_obsMode==='median';const _obsLabel=_isMedian?'méd.':_obsMode;
    p=[];let sousPerf=0;if(familyPerf&&familyPerf.length){const _fpSorted=[...familyPerf].sort((a,b)=>b.ecart-a.ecart);for(let fpi=0;fpi<_fpSorted.length;fpi++){const fp=_fpSorted[fpi];const compVal=_isMedian?fp.med:(()=>{const sv=_S.ventesParMagasin[_obsMode]||{};let freq=0;for(const[code,data]of Object.entries(sv)){if(!/^\d{6}$/.test(code))continue;if(_S.obsFilterUnivers&&_S.articleUnivers[code]!==_S.obsFilterUnivers)continue;if(famLib(_S.articleFamille[code]||'')===fp.fam)freq+=data.countBL;}return freq;})();const compEcart=_isMedian?fp.ecart:(compVal>0?Math.round((fp.my-compVal)/compVal*100):fp.ecart);const pctMed=compVal>0?Math.round((fp.my/compVal)*100):null;const isS=fp.ecart>20,isW=fp.ecart<-20,isCrit=pctMed!==null&&pctMed<50;const icon=isS?'💪':isW?'⚠️':'➡️';const bg=isS?'i-ok-bg':isCrit?'i-danger-bg':isW?'i-caution-bg':'';const medColor=pctMed===null?'t-disabled':pctMed>=100?'c-ok font-extrabold':pctMed>=50?'c-caution font-bold':'c-danger font-extrabold';const medStr=pctMed!==null?pctMed+'%':'—';if(isCrit)sousPerf++;const perfDot=pctMed===null?'<span class="t-disabled font-bold" aria-label="non disponible">—</span>':pctMed>=100?'<span class="c-ok font-extrabold text-base" title="Au-dessus de la médiane" aria-label="au-dessus de la médiane">▲</span>':'<span class="c-danger font-extrabold text-base" title="En-dessous de la médiane" aria-label="en-dessous de la médiane">▼</span>';const famHtml=escapeHtml(fp.fam);const famAttr=fp.fam.replace(/&/g,'&amp;').replace(/"/g,'&quot;');const fpId='fp_'+fpi;const diagBtn=isCrit?`<button class="diag-btn i-danger-bg c-danger hover:i-danger-bg mt-2" data-fam="${famAttr}" onclick="event.stopPropagation();openDiagnostic(this.dataset.fam,'bench')">🔍 Diag.</button>`:'';const diagBtnRow=isCrit?`<button class="diag-btn i-danger-bg c-danger hover:i-danger-bg text-[9px] py-0.5 px-1.5" data-fam="${famAttr}" onclick="event.stopPropagation();openDiagnostic(this.dataset.fam,'bench')" title="Diagnostiquer cette famille">🔍</button>`:perfDot;const top5Html=fp.topArticles&&fp.topArticles.length?`<table class="w-full text-[11px] mt-2 border-t b-default pt-1"><thead><tr><th class="text-left py-1 px-1 t-tertiary font-semibold">Article</th><th class="text-right py-1 px-1 t-tertiary font-semibold">Moi</th><th class="text-right py-1 px-1 t-tertiary font-semibold">${_obsLabel}</th><th class="text-right py-1 px-1 t-tertiary font-semibold">% ${_obsLabel}</th></tr></thead><tbody>${fp.topArticles.map(a=>{const compBL=_isMedian?a.med:((_S.ventesParMagasin[_obsMode]||{})[a.code]?.countBL||0);const compPct=compBL>0?Math.round(a.my/compBL*100):null;const pc=compPct===null?'t-disabled':compPct>=100?'c-ok font-bold':compPct>=50?'c-caution font-bold':'c-danger font-bold';return`<tr class="border-b b-light"><td class="py-1 px-1 t-primary max-w-0 truncate"><span class="font-mono t-disabled text-[10px] mr-1">${a.code}</span>${escapeHtml(a.lib||'')}</td><td class="py-1 px-1 text-right font-bold whitespace-nowrap">${a.my}</td><td class="py-1 px-1 text-right t-tertiary whitespace-nowrap">${compBL||'—'}</td><td class="py-1 px-1 text-right whitespace-nowrap ${pc}">${compPct!==null?compPct+'%':'—'}</td></tr>`;}).join('')}</tbody></table>`:'';const _fpCaTheo=Math.round((_S.benchLists._myPoids||0)*((_S.benchLists._bassinFamCATot||{})[fp.fam]||0));const _fpCaMe=Math.round((_S.benchLists._myFamCA||{})[fp.fam]||0);const _fpEcartTheo=_fpCaMe-_fpCaTheo;const _fpEcartColor=_fpEcartTheo>=0?'c-ok':'c-danger';const _fpCaMedBase=Math.round((_S.benchLists._bassinFamCAMed||{})[fp.fam]||0);const _fpCaEcart=_fpCaMe-_fpCaMedBase;const _fpEcartCaColor=_fpCaEcart>=0?'c-ok':'c-danger';const _fpEcartCaStr=_fpCaMedBase>0?((_fpCaEcart>=0?'+':'')+formatEuro(_fpCaEcart)):'—';const detailHtml=`<div class="flex flex-wrap gap-4 text-[11px]"><span class="t-tertiary">Nb ventes Moi : <strong>${fp.my}</strong></span><span class="t-tertiary">Nb ventes ${_obsLabel} : <strong>${compVal}</strong></span><span class="t-tertiary">Écart vs ${_obsLabel} : <span class="${medColor}">${compEcart>0?'+':''}${compEcart.toFixed(0)}%</span></span><span class="t-tertiary">% ${_obsLabel} : <span class="${medColor}">${medStr}</span></span>${_fpCaTheo>0?`<span class="t-tertiary">CA Moi : <strong class="c-action">${formatEuro(_fpCaMe)}</strong> · CA Théo. : <strong>${formatEuro(_fpCaTheo)}</strong> · Écart : <strong class="${_fpEcartColor}">${_fpEcartTheo>=0?'+':''}${formatEuro(_fpEcartTheo)}</strong></span>`:''}</div>${top5Html}${diagBtn}`;const _fpPdm=fp.pdm!=null?`<td class="py-1.5 px-2 text-center text-xs font-bold ${fp.pdm>=20?'c-ok':fp.pdm>=10?'c-caution':'c-danger'}">${fp.pdm}%</td>`:`<td class="py-1.5 px-2 text-center text-xs t-disabled">—</td>`;p.push(`<tr class="border-b ${bg} cursor-pointer hover:opacity-90 transition-colors" onclick="toggleObsFamily('${fpId}')"><td class="py-1.5 px-2 text-[11px] font-semibold"><span class="obs-expand-icon t-disabled mr-1 text-[9px]">▶</span>${icon} ${famHtml}</td><td class="py-1.5 px-2 text-right ${medColor} text-xs">${medStr}</td>${_fpPdm}<td class="py-1.5 px-2 text-center text-xs font-bold ${_fpEcartCaColor} whitespace-nowrap">${_fpEcartCaStr}</td></tr><tr id="${fpId}" class="hidden ${bg}"><td colspan="4"><div class="px-3 py-2">${detailHtml}</div></td></tr>`);}}
    rT('benchFamilyTable',p.join('')||'<tr><td colspan="3" class="text-center py-4 t-disabled">—</td></tr>');
    const fNote=document.getElementById('benchFamilyNote');if(fNote){const m=_S.benchLists.familyPerfMasked||0;if(m>0){fNote.textContent=`${m} famille${m>1?'s':''} marginale${m>1?'s':''} masquée${m>1?'s':''} (CA médiane < 1 000 €).`;fNote.classList.remove('hidden');}else fNote.classList.add('hidden');}
    const upBanner=document.getElementById('benchUnderperformBanner');if(upBanner){if(sousPerf>0){upBanner.innerHTML=`⚠️ ${sousPerf} famille${sousPerf>1?'s':''} en sous-performance vs bassin (< 50% médiane) — les lignes 🔍 ci-dessous déclenchent le diagnostic direct.`;upBanner.classList.remove('hidden');}else{upBanner.classList.add('hidden');}}
    const fbadge=document.getElementById('obsFamilyBadge');if(fbadge){if(sousPerf>0){fbadge.textContent=sousPerf+' sous la médiane';fbadge.classList.remove('hidden');}else fbadge.classList.add('hidden');}
    // Store ranking [V3] — tri dynamique par _rankSortKey / _rankSortDir
    const showClientsZone=true;const chHdr=document.getElementById('benchClientsZoneHeader');if(chHdr)chHdr.style.display='';
    // Sync select UI avec l'état courant
    {const sel=document.getElementById('rankSortKey');if(sel&&sel.value!==(_S._rankSortKey||'pdmBassin'))sel.value=_S._rankSortKey||'pdmBassin';}
    const _rankKey=_S._rankSortKey||'pdmBassin';const _rankDir=_S._rankSortDir===-1||_S._rankSortDir===1?_S._rankSortDir:-1;
    const _nbCanauxActifs=(store)=>{const ca=_S.canalAgence[store]||{};return Math.max(1,Object.values(ca).filter(v=>(v.ca||0)>500).length);};
    const sorted=Object.entries(storePerf).sort((a,b)=>{let va=a[1][_rankKey]??0;let vb=b[1][_rankKey]??0;if(_rankKey==='freq'){va/=_nbCanauxActifs(a[0]);vb/=_nbCanauxActifs(b[0]);}return _rankDir*(va-vb);});
    const totalStores=sorted.length;const myRankIdx=sorted.findIndex(([s])=>s===_S.selectedMyStore);
    const rankEl=document.getElementById('benchMyRank');if(rankEl){if(myRankIdx>=0){rankEl.textContent=`#${myRankIdx+1} sur ${totalStores}`;rankEl.classList.remove('hidden');}else rankEl.classList.add('hidden');}
    const inlineRank=document.getElementById('obsMyRankInline');if(inlineRank){if(myRankIdx>=0){inlineRank.textContent=`#${myRankIdx+1}/${totalStores}`;inlineRank.classList.remove('hidden');}else inlineRank.classList.add('hidden');}
    // ── Colonne "Canal actif" — visible uniquement si filtre canal actif ─────
    const _rcSet=_S._reseauCanaux||new Set();
    // Sync pills canal Réseau
    {const _isAll=_rcSet.size===0;document.querySelectorAll('[data-reseau-canal]').forEach(b=>b.classList.toggle('active',_rcSet.has(b.dataset.reseauCanal)));document.querySelectorAll('#reseauCanalBar .reseau-tous-btn').forEach(b=>b.classList.toggle('active',_isAll));}
    const _hasCanalActif=_rcSet.size>0;
    {const _ch=document.getElementById('benchCanalActifHeader');if(_ch){const _LM={MAGASIN:'MAGASIN',INTERNET:'Internet',REPRESENTANT:'Représentant',DCS:'DCS',AUTRE:'Autre'};_ch.classList.toggle('hidden',!_hasCanalActif);if(_hasCanalActif)_ch.textContent=_rcSet.size===1?(_LM[[..._rcSet][0]]||[..._rcSet][0]):'Canaux actifs';}}
    const _canalActifCA=(store)=>{if(!_S.ventesParMagasinByCanal)return 0;const _cMap=_S.ventesParMagasinByCanal[store]||{};let _s=0;for(const c of _rcSet){const _arts=_cMap[c]||{};for(const code of Object.keys(_arts))_s+=(_arts[code]?.sumCA||0);}return _s;};
    const _storeTotalCA=(store)=>{if(!_S.ventesParMagasin)return 0;const _arts=_S.ventesParMagasin[store]||{};let _s=0;for(const code of Object.keys(_arts)){for(const v of Object.values(_arts[code].byCanal||{}))_s+=(v?.sumCA||0);}return _s;};
    const _fmtCA=v=>v>=1000?`${(v/1000).toFixed(1)}k€`:v>0?`${Math.round(v)}€`:'—';
    p=[];const maxF=Math.max(...Object.values(storePerf).map(s=>s.freq),1);sorted.forEach(([store,data],idx)=>{const isMe=store===_S.selectedMyStore,bw=(data.freq/maxF*100).toFixed(0);const servTxt=data.serv+'%';const servColor=data.serv>25?'c-ok':data.serv>=10?'c-caution':'c-danger';const tmTxt=data.txMarge>0?data.txMarge.toFixed(2)+'%':'—';const tmColor=data.txMarge>0?(data.txMarge>=35?'c-ok':data.txMarge>=25?'c-caution':'c-danger'):'t-disabled';const pdmB=data.pdmBassin!=null?data.pdmBassin+'%':'—';const pdmBColor=data.pdmBassin==null?'t-disabled':data.pdmBassin>=30?'c-ok':data.pdmBassin>=15?'c-caution':'c-danger';const cz=showClientsZone?`<td class="py-2 px-2 text-center text-xs font-bold ${pdmBColor}" title="Part du CA total du bassin réalisée par cette agence">${pdmB}</td>`:'';let czCanal='';if(_hasCanalActif){const _ca=_canalActifCA(store);const _tot=_storeTotalCA(store);const _pct=_tot>0?(_ca/_tot*100).toFixed(1):'0.0';czCanal=`<td class="py-2 px-2 text-center text-xs font-bold t-primary" title="${_pct}% du CA total de ${store}">${_fmtCA(_ca)}</td>`;}p.push(`<tr class="border-b ${isMe?'i-info-bg font-bold':'hover:s-card-alt'}"><td class="py-2 px-2"><span class="${isMe?'store-tag store-mine':'store-tag store-other'}">${isMe?'⭐':''}${store}</span></td><td class="py-2 px-2 text-center">${data.ref}</td><td class="py-2 px-2 text-center ${isMe?'text-cyan-700 font-extrabold':'font-bold'}">${data.freq.toLocaleString('fr')}</td><td class="py-2 px-2 text-center ${servColor} text-[10px] font-bold">${servTxt}</td><td class="py-2 px-2 text-center text-[11px] font-bold ${tmColor}">${tmTxt}</td>${cz}${czCanal}<td class="py-2 px-2 text-right"><div class="flex items-center gap-1 justify-end"><div class="w-16 s-hover rounded-full h-2"><div class="perf-bar ${isMe?'bg-cyan-500':'bg-gray-400'} rounded-full" style="width:${bw}%"></div></div><span class="text-[10px] font-bold ${isMe?'text-cyan-700':''}">#${idx+1}/${totalStores}</span></div></td></tr>`);});
    rT('benchStoreTable',p.join(''));
    const rtEl=document.getElementById('benchRankingTitle');if(rtEl)rtEl.textContent=_S.obsFilterUnivers?`🏆 Classement agences — Univers : ${_S.obsFilterUnivers}`:'🏆 Classement agences';
    renderHeatmapFamilleCommercial();
    renderReseauHeatmap();
  }

  // ── Bassin select : peuple <select multiple id="benchBassinSelect"> ───────
  function buildBenchBassinSelect() {
    const sel = document.getElementById('benchBassinSelect');
    if (!sel) return;
    const stores = [..._S.storesIntersection].filter(s => s !== _S.selectedMyStore).sort();
    if (!stores.length) { sel.innerHTML = '<option disabled>Aucune autre agence</option>'; return; }
    let html = '';
    for (const s of stores) {
      const selected = _S.selectedBenchBassin.size === 0 || _S.selectedBenchBassin.has(s) ? 'selected' : '';
      html += `<option value="${escapeHtml(s)}" ${selected}>${escapeHtml(s)}</option>`;
    }
    sel.innerHTML = html;
  }

  // Appelé quand la sélection change
  function onBenchBassinChange() {
    const sel = document.getElementById('benchBassinSelect');
    if (!sel) return;
    _S.selectedBenchBassin = new Set([...sel.selectedOptions].map(o => o.value));
    // Si tout est sélectionné = équivalent "vide" (fallback getBenchCompareStores)
    const all = [..._S.storesIntersection].filter(s => s !== _S.selectedMyStore);
    if (_S.selectedBenchBassin.size === all.length) _S.selectedBenchBassin = new Set();
    recalcBenchmarkInstant();
  }
  window.onBenchBassinChange = onBenchBassinChange;
  window.recalcBenchmarkInstant = recalcBenchmarkInstant;

  // ── Heatmap réseau : CSS Grid 20 familles × N agences ─────────────────────
  function renderReseauHeatmap() {
    const container = document.getElementById('reseauHeatmapContainer');
    if (!container) return;
    computeReseauHeatmap();
    const d = _S.reseauHeatmapData;
    if (!d || !d.familles.length) {
      container.innerHTML = '<p class="t-disabled text-sm p-4">Pas assez de données réseau pour la heatmap (nécessite ≥ 2 agences).</p>';
      return;
    }
    const { familles, agences, matrix } = d;
    const myStore = _S.selectedMyStore;
    // Ratio → classe CSS couleur
    const ratioClass = r => r >= 1 ? 'rayon-green' : r >= 0.5 ? 'rayon-yellow' : 'rayon-red';
    const ratioLabel = r => r === 0 ? '—' : (r * 100).toFixed(0) + '%';

    let html = '<div class="overflow-x-auto"><table class="min-w-full text-[10px]">';
    // Header : familles en colonnes, agences en lignes
    html += '<thead class="sticky top-0 s-panel-inner"><tr>';
    html += '<th class="py-1 px-2 text-left t-inverse font-bold sticky left-0 s-panel-inner z-10">Agence</th>';
    for (const fam of familles) {
      html += `<th class="py-1 px-1 t-inverse-muted font-semibold text-center" style="writing-mode:vertical-rl;white-space:nowrap;max-height:100px;padding:6px 3px" title="${escapeHtml(fam)}">${escapeHtml(fam.length > 18 ? fam.slice(0,16)+'…' : fam)}</th>`;
    }
    html += '</tr></thead><tbody>';
    // [V3] Canal filter — myStore only via articleCanalCA, réseau reste tous canaux
    const _heatmapCanal = _S._globalCanal || '';
    const _myFamCACanal = {}; // CA par famille filtré canal pour myStore
    if (_heatmapCanal && _S.articleCanalCA.size) {
      for (const [code, cmap] of _S.articleCanalCA) {
        const ca = cmap.get(_heatmapCanal)?.ca || 0;
        if (!ca) continue;
        const fam = famLib(_S.articleFamille[code] || '');
        if (fam) _myFamCACanal[fam] = (_myFamCACanal[fam] || 0) + ca;
      }
    }
    // Note de lecture si canal actif
    if (_heatmapCanal) {
      html += `<tr><td colspan="${familles.length + 1}" class="py-1 px-2 text-[10px] t-disabled italic i-caution-bg/40">⚠️ Mon agence : canal ${_heatmapCanal} · Réseau : tous canaux — ne pas comparer directement</td></tr>`;
    }
    for (const store of agences) {
      const isMe = store === myStore;
      const rowCls = isMe ? 'i-info-bg font-bold ring-2 ring-cyan-400' : 'hover:s-card-alt';
      html += `<tr class="border-b b-light ${rowCls}">`;
      html += `<td class="py-1 px-2 font-semibold sticky left-0 s-card z-10 whitespace-nowrap">${isMe ? '⭐ ' : ''}${store}</td>`;
      for (const fam of familles) {
        let r;
        if (isMe && _heatmapCanal && Object.keys(_myFamCACanal).length) {
          // Pour myStore : utiliser CA canal filtré ÷ médiane réseau tous canaux
          const famMedianCA = d.famMedianCA?.[fam] || 0;
          r = famMedianCA > 0 ? (_myFamCACanal[fam] || 0) / famMedianCA : 0;
        } else {
          r = (matrix[fam] || {})[store] || 0;
        }
        const cls = ratioClass(r);
        html += `<td class="py-1 px-1 text-center font-bold ${cls}" title="${store} · ${fam} : ${ratioLabel(r)}">${ratioLabel(r)}</td>`;
      }
      html += '</tr>';
    }
    html += '</tbody></table></div>';
    container.innerHTML = html;
  }

  // ── Sprint 2 — Réseau : Nomades, Orphelins, Fuites ────────────────────────
  function renderReseauNomades() {
    const el = document.getElementById('reseauNomadesContainer');
    if (!el) return;
    const list = _S.reseauNomades || [];
    if (!list.length) { el.innerHTML = '<p class="t-disabled text-sm p-4">Aucun nomade détecté (clients actifs dans ≥ 2 agences).</p>'; return; }
    let html = `<p class="text-[11px] t-tertiary mb-2">${list.length} client${list.length > 1 ? 's' : ''} actif${list.length > 1 ? 's' : ''} dans cette agence <strong>et dans ≥ 1 autre agence du réseau</strong>.</p>`;
    html += '<div class="overflow-x-auto"><table class="min-w-full text-xs"><thead class="s-panel-inner t-inverse"><tr><th class="py-1 px-2 text-left">Code</th><th class="py-1 px-2 text-left">Nom</th><th class="py-1 px-2 text-center">Statut</th></tr></thead><tbody>';
    for (const cc of list.slice(0, 100)) {
      const nom = _S.clientNomLookup[cc] || '—';
      const info = _S.chalandiseData.get(cc) || {};
      html += `<tr class="border-b b-light hover:i-info-bg"><td class="py-1 px-2 font-mono text-[10px]">${escapeHtml(cc)}</td><td class="py-1 px-2 font-semibold">${escapeHtml(nom)}${_unikLink(cc)}</td><td class="py-1 px-2 text-center">${_clientStatusBadge(cc, info)}</td></tr>`;
    }
    if (list.length > 100) html += `<tr><td colspan="3" class="py-2 px-2 text-center t-disabled text-[10px]">… et ${list.length - 100} autres</td></tr>`;
    html += '</tbody></table></div>';
    el.innerHTML = html;
  }

  function renderReseauOrphelins() {
    const el = document.getElementById('reseauOrphelinsContainer');
    if (!el) return;
    const list = _S.reseauOrphelins || [];
    if (!list.length) { el.innerHTML = '<p class="t-disabled text-sm p-4">Aucun orphelin réseau (articles vendus par ≥ 50% des agences, absents chez moi).</p>'; return; }
    let html = `<p class="text-[11px] t-tertiary mb-2">Top <strong>${list.length}</strong> articles vendus par ≥ 50% des agences du réseau, absents dans cette agence.</p>`;
    html += '<div class="overflow-x-auto"><table class="min-w-full text-xs"><thead class="s-panel-inner t-inverse"><tr><th class="py-1 px-2 text-left">Code</th><th class="py-1 px-2 text-left">Libellé</th><th class="py-1 px-2 text-left">Famille</th><th class="py-1 px-2 text-center">Nb agences</th><th class="py-1 px-2 text-center">Fréq. réseau</th></tr></thead><tbody>';
    for (const art of list) {
      const lib = (_S.libelleLookup[art.code] || art.code).replace(/^\d{6} - /, '');
      html += `<tr class="border-b b-light hover:i-caution-bg"><td class="py-1 px-2 font-mono text-[10px]">${art.code}</td><td class="py-1 px-2 font-semibold max-w-[200px] truncate" title="${escapeHtml(lib)}">${escapeHtml(lib)}</td><td class="py-1 px-2 text-[10px] t-tertiary">${escapeHtml(art.fam || '—')}</td><td class="py-1 px-2 text-center font-bold c-danger">${art.nbStores}</td><td class="py-1 px-2 text-center t-secondary">${art.totalFreq}</td></tr>`;
    }
    html += '</tbody></table></div>';
    el.innerHTML = html;
  }

  function renderReseauFuites() {
    const el = document.getElementById('reseauFuitesContainer');
    if (!el) return;
    const list = _S.reseauFuitesMetier || [];
    if (!list.length) {
      if (!_S.chalandiseReady) { el.innerHTML = '<p class="t-disabled text-sm p-4">Chargez la Zone de Chalandise pour analyser les fuites par métier.</p>'; }
      else { el.innerHTML = '<p class="t-disabled text-sm p-4">Aucune fuite détectée (données insuffisantes).</p>'; }
      return;
    }
    let html = `<p class="text-[11px] t-tertiary mb-2">Indice de fuite = 1 − (clients actifs PDV / clients zone). Plus l'indice est élevé, plus le métier achète ailleurs.</p>`;
    html += '<div class="overflow-x-auto"><table class="min-w-full text-xs"><thead class="s-panel-inner t-inverse"><tr><th class="py-1 px-2 text-left">Métier</th><th class="py-1 px-2 text-center">Clients zone</th><th class="py-1 px-2 text-center">Actifs PDV</th><th class="py-1 px-2 text-center">Indice fuite</th></tr></thead><tbody>';
    for (const f of list) {
      const cls = f.indiceFuite >= 70 ? 'c-danger font-extrabold' : f.indiceFuite >= 40 ? 'c-caution font-bold' : 'c-ok';
      html += `<tr class="border-b b-light hover:i-danger-bg"><td class="py-1 px-2 font-semibold">${escapeHtml(f.metier)}</td><td class="py-1 px-2 text-center">${f.total}</td><td class="py-1 px-2 text-center">${f.actifs}</td><td class="py-1 px-2 text-center ${cls}">${f.indiceFuite}%</td></tr>`;
    }
    html += '</tbody></table></div>';
    el.innerHTML = html;
  }

  function renderNomadesMissedArts() {
    const el = document.getElementById('nomadesMissedArtsContainer');
    if (!el) return;
    const list = _S.nomadesMissedArts || [];
    const badge = document.getElementById('nomadesMissedBadge');
    if (badge) {
      if (list.length) { badge.textContent = list.length; badge.classList.remove('hidden'); }
      else badge.classList.add('hidden');
    }
    if (!list.length) {
      const isMulti = _S.storesIntersection && _S.storesIntersection.size > 1;
      el.innerHTML = `<p class="t-disabled text-sm p-4">${isMulti ? 'Aucune opportunité cross-agence significative détectée sur la période.' : 'Aucune donnée — nécessite un fichier multi-agences avec clients communs.'}</p>`;
      return;
    }
    let html = `<p class="text-[11px] t-tertiary mb-3 px-1">Top ${list.length} articles achetés par vos clients <strong>dans d'autres agences</strong> mais jamais chez vous — filtrés ≥ 150 € et ≥ 2 BL chez l'autre agence, triés par CA autre agence.</p>`;
    html += '<div class="overflow-x-auto"><table class="min-w-full text-xs"><thead class="s-panel-inner t-inverse font-bold sticky top-0"><tr>';
    html += '<th class="py-2 px-3 text-left">Code</th>';
    html += '<th class="py-2 px-3 text-left">Libellé</th>';
    html += '<th class="py-2 px-3 text-left">Famille</th>';
    html += '<th class="py-2 px-3 text-center">Clients</th>';
    html += '<th class="py-2 px-3 text-right">CA autre agence</th>';
    html += '<th class="py-2 px-3 text-right">BL autre agence</th>';
    html += '</tr></thead><tbody>';
    for (const art of list) {
      const lib = (_S.libelleLookup[art.code] || art.code).replace(/^\d{6} - /, '');
      html += `<tr class="border-b hover:i-caution-bg/40 cursor-pointer" onclick="openNomadeArticleModal('${art.code}')" title="Voir le détail clients">`;
      html += `<td class="py-1.5 px-3 font-mono t-tertiary whitespace-nowrap">${art.code}</td>`;
      html += `<td class="py-1.5 px-3 font-semibold t-primary">${escapeHtml(lib)}</td>`;
      html += `<td class="py-1.5 px-3 t-tertiary text-[11px]">${escapeHtml(art.fam || '—')}</td>`;
      html += `<td class="py-1.5 px-3 text-center font-extrabold c-danger">${art.nbClients}</td>`;
      html += `<td class="py-1.5 px-3 text-right font-bold c-caution">${art.totalCaOther > 0 ? formatEuro(art.totalCaOther) : '—'}</td>`;
      html += `<td class="py-1.5 px-3 text-right t-secondary">${art.totalBLOther || '—'}</td>`;
      html += '</tr>';
    }
    html += '</tbody></table></div>';
    el.innerHTML = html;
  }

  // C4: Heatmap Famille × Commercial
  function renderHeatmapFamilleCommercial(){
    const container=document.getElementById('heatmapContainer');if(!container)return;
    if(!_S.chalandiseReady||!DataStore.ventesClientArticle.size){container.innerHTML='<p class="t-disabled text-sm p-4">Chargez la chalandise pour voir la heatmap.</p>';return;}
    const matrix={},famTotals={},comTotals={};const commercials=new Set();
    const clientComLookup={};
    for(const[cc,info]of _S.chalandiseData.entries()){if(info.commercial)clientComLookup[cc]=info.commercial;}
    if(_S.territoireReady){for(const l of DataStore.territoireLines){if(l.clientCode&&!clientComLookup[l.clientCode]&&l.secteur)clientComLookup[l.clientCode]=SECTEUR_DIR_MAP[l.secteur]||l.secteur;}}
    for(const[cc,artMap]of DataStore.ventesClientArticle.entries()){
      const com=clientComLookup[cc]||(_S.territoireReady?(DataStore.territoireLines.find(l=>l.clientCode===cc)?.commercial||null):null)||'⚠️ Sans commercial';
      commercials.add(com);if(!matrix[com])matrix[com]={};
      for(const[code,data]of artMap.entries()){
        const fam=famLib(_S.articleFamille[code]||(DataStore.finalData.find(d=>d.code===code)?.famille)||'')||'Non classé';const ca=data.sumCA||0;
        matrix[com][fam]=(matrix[com][fam]||0)+ca;
        famTotals[fam]=(famTotals[fam]||0)+ca;
        comTotals[com]=(comTotals[com]||0)+ca;
      }
    }
    const topFams=Object.entries(famTotals).filter(([fam])=>fam!=='Non classé').sort((a,b)=>b[1]-a[1]).slice(0,20).map(([fam])=>fam);
    const comList=[...commercials].sort((a,b)=>{if(a==='⚠️ Sans commercial')return 1;if(b==='⚠️ Sans commercial')return -1;return(comTotals[b]||0)-(comTotals[a]||0);});
    if(!comList.length||!topFams.length){container.innerHTML='<p class="t-disabled text-sm p-4">Pas assez de données pour la heatmap.</p>';return;}
    let maxCell=0;for(const com of comList)for(const fam of topFams){const v=(matrix[com]||{})[fam]||0;if(v>maxCell)maxCell=v;}
    let html='<div class="overflow-x-auto"><table class="min-w-full text-[10px]">';
    html+='<thead class="sticky top-0 s-panel-inner"><tr><th class="py-1 px-2 text-left t-inverse font-bold sticky left-0 s-panel-inner z-10">Famille</th>';
    for(const com of comList){html+=`<th class="py-1 px-2 text-center t-inverse-muted font-semibold" title="${com}" style="writing-mode:vertical-rl;text-orientation:mixed;white-space:nowrap;max-height:120px;overflow:hidden;padding:8px 4px">${com}</th>`;}
    html+='<th class="py-1 px-2 text-right t-inverse font-bold">Total</th></tr></thead><tbody>';
    for(const fam of topFams){
      html+=`<tr class="border-t b-dark"><td class="py-1 px-2 font-semibold t-primary sticky left-0 s-card z-10 truncate max-w-[160px]" title="${fam}">${fam}</td>`;
      for(const com of comList){const val=(matrix[com]||{})[fam]||0;const intensity=maxCell>0?val/maxCell:0;const bg=val===0?'transparent':`rgba(22,163,74,${(0.1+intensity*0.8).toFixed(2)})`;const textColor=intensity>0.5?'color:#fff':'';html+=`<td class="py-1 px-2 text-center font-bold" style="background:${bg};${textColor}" title="${com}: ${fam} = ${formatEuro(val)}">${val>0?formatEuro(val):'—'}</td>`;}
      html+=`<td class="py-1 px-2 text-right font-bold t-primary">${formatEuro(famTotals[fam])}</td></tr>`;
    }
    html+='<tr class="border-t-2 b-dark font-extrabold"><td class="py-1 px-2 sticky left-0 s-card z-10 t-primary">TOTAL</td>';
    for(const com of comList)html+=`<td class="py-1 px-2 text-center c-action">${formatEuro(comTotals[com]||0)}</td>`;
    html+=`<td class="py-1 px-2 text-right c-action">${formatEuro(Object.values(famTotals).reduce((s,v)=>s+v,0))}</td>`;
    html+='</tr></tbody></table></div>';
    container.innerHTML=html;
  }

  // === OBSERVATOIRE HELPERS ===
  function _obsNav(t){
    if(t==='silencieux'){
      switchTab('territoire');
      setTimeout(()=>{
        const sil=document.getElementById('cockpit-sil-full-body');
        if(sil&&sil.style.display==='none')_cockpitToggleSection('cockpit-sil-full');
        const el=document.getElementById('cockpit-sil-full');
        if(el)el.scrollIntoView({behavior:'smooth'});
      },300);
      return;
    }
    if(t==='terrain'){switchTab('territoire');return;}
    if(t==='plan'){const d=document.getElementById('obsActionPlanDiv');if(d){const det=d.closest('details');if(det)det.open=true;d.scrollIntoView({behavior:'smooth'});}return;}
    if(t==='lose'){const d=document.getElementById('obsLoseTable');if(d){const det=d.closest('details');if(det)det.open=true;d.scrollIntoView({behavior:'smooth'});}return;}
    if(t==='dormants'){showCockpitInTable('dormants');switchTab('table');}
  }

  function generateNetworkDiagnostic(caE,refE,freqE){
    const caUp=caE>0,refUp=refE>0,freqUp=freqE>0;
    if(refUp&&!freqUp&&!caUp) return{icon:'🔍',title:'Assortiment large mais sous-exploité',border:'border-amber-400',bg:'i-caution-bg/60',
      message:`Vous avez ${Math.abs(refE)}% de références en plus que la médiane réseau, mais ${Math.abs(freqE)}% de fréquence en moins. Vos clients viennent moins souvent. Leviers : relancer les clients silencieux, animer le rayon, mettre en avant les articles peu vendus.`,
      actions:[{label:'Voir les clients silencieux dans Le Terrain',nav:'silencieux'},{label:'Vérifier les articles en stock jamais vendus',nav:'dormants'}]};
    if(!refUp&&freqUp) return{icon:'🎯',title:'Clients fidèles, gamme à élargir',border:'border-blue-400',bg:'i-info-bg/60',
      message:`Vos clients achètent ${Math.abs(freqE)}% plus souvent que la médiane, mais vous avez ${Math.abs(refE)}% de références en moins. Levier : référencer les articles vendus par le réseau.`,
      actions:[{label:'Voir les articles manquants du réseau',nav:'plan'}]};
    if(!caUp&&!refUp&&!freqUp) return{icon:'⚠️',title:"Agence en retrait — plan d'action prioritaire",border:'border-red-400',bg:'i-danger-bg',
      message:`CA, références et fréquence sont en dessous de la médiane réseau. Concentrez-vous sur les familles avec le plus grand écart de CA et sur la captation de nouveaux clients.`,
      actions:[{label:"Voir le plan d'action prioritaire",nav:'plan'},{label:'Voir les clients à capter dans Le Terrain',nav:'terrain'}]};
    if(caUp&&refUp&&freqUp) return{icon:'🏆',title:'Surperformance — consolidez vos forces',border:'border-emerald-400',bg:'i-ok-bg',
      message:`Votre agence dépasse la médiane sur tous les indicateurs. Surveillez les familles en baisse et fidélisez vos top clients.`,
      actions:[{label:'Voir les familles sous la médiane',nav:'lose'},{label:'Voir les clients à fidéliser',nav:'terrain'}]};
    if(caUp&&!freqUp) return{icon:'💰',title:'Bon CA mais fréquence en baisse',border:'border-yellow-400',bg:'i-caution-bg',
      message:`Votre CA est ${Math.abs(caE)}% au-dessus de la médiane mais la fréquence est en retrait de ${Math.abs(freqE)}%. Risque : dépendance à quelques gros clients. Levier : diversifier la base clients.`,
      actions:[{label:'Voir les clients silencieux',nav:'silencieux'}]};
    if(!caUp&&freqUp&&refUp) return{icon:'📊',title:'Bonne dynamique, CA à développer',border:'border-blue-400',bg:'i-info-bg/60',
      message:`Fréquence et références sont au-dessus de la médiane — vos fondamentaux sont bons. Le CA suivra en développant le panier moyen et en ciblant les familles à fort écart.`,
      actions:[{label:"Voir le plan d'action prioritaire",nav:'plan'}]};
    return{icon:'📋',title:'Analyse mixte',border:'b-default',bg:'s-card-alt',
      message:`Résultats contrastés vs médiane réseau. Consultez le plan d'action ci-dessous pour les familles prioritaires.`,
      actions:[{label:"Voir le plan d'action prioritaire",nav:'plan'}]};
  }

  function renderObservatoire(){
    // [Adapter Étape 5] — DataStore.benchLists : canal-invariant via cache _benchCache
    const{obsKpis,obsFamiliesLose,obsFamiliesWin,obsActionPlan}=DataStore.benchLists;
    const obsMode=_S.selectedObsCompare||'median';
    const obsLabel=obsMode==='median'?'Médiane réseau':obsMode;
    const isMedian=obsMode==='median';
    const el=id=>document.getElementById(id);
    if(el('obsMyStore'))el('obsMyStore').textContent=_S.selectedMyStore||'—';
    if(el('obsCompareLabel'))el('obsCompareLabel').textContent=obsLabel;
    if(el('obsKpiMyLabel'))el('obsKpiMyLabel').textContent=_S.selectedMyStore||'—';
    if(el('obsKpiCompLabel'))el('obsKpiCompLabel').textContent=obsLabel;
    // Dynamic section titles & column headers
    if(el('obsLoseTitle'))el('obsLoseTitle').textContent=isMedian?'📉 Familles sous la médiane réseau':`📉 Familles où ${obsLabel} me bat`;
    if(el('obsWinTitle'))el('obsWinTitle').textContent=isMedian?'💪 Familles au-dessus de la médiane':`💪 Familles où je bats ${obsLabel}`;
    if(el('obsLoseTh1'))el('obsLoseTh1').textContent=isMedian?'Écart CA (bassin) vs médiane':`CA ${obsLabel}`;
    if(el('obsWinTh1'))el('obsWinTh1').textContent=isMedian?'Avance CA (bassin) vs médiane':`Avance sur ${obsLabel}`;
    // KPI CARDS
    const kpis=obsKpis||{mine:{ca:0,ref:0,serv:0,freq:0,pdm:0},compared:{ca:0,ref:0,serv:0,freq:0,pdm:0}};
    const fmtVal=(v,fmt)=>fmt==='euro'?formatEuro(v):fmt==='pct2'?(v!==null&&v>0?parseFloat(v).toFixed(2)+'%':'—'):fmt==='pct'?v+'%':v.toLocaleString('fr');
    const _kpiRcSet=_S._reseauCanaux||new Set();
    const _kpiCanalNames={MAGASIN:'en prélevé comptoir',INTERNET:'sur Internet',REPRESENTANT:'par représentant',DCS:'en DCS',AUTRE:'sur autre canal'};
    const _refTip=_kpiRcSet.size===0?'Nombre d\'articles différents vendus au moins 1 fois sur la période.':_kpiRcSet.size===1?`Nombre d\'articles différents vendus au moins 1 fois ${_kpiCanalNames[[..._kpiRcSet][0]]||'sur le canal sélectionné'} sur la période.`:`Nombre d\'articles différents vendus au moins 1 fois sur les canaux sélectionnés sur la période.`;
    const kpiDefs=[
      {label:'💰 CA vendu',key:'ca',fmt:'euro',tip:'CA canal MAGASIN (Prélevé + Enlevé) sur la période du consommé. Avoirs déduits.'},
      {label:'📦 Réf actives',key:'ref',fmt:'num',tip:_refTip},
      {label:'🔄 Fréquence',key:'freq',fmt:'num',tip:'Nombre total de lignes de vente (BL) sur la période. Mesure l\'activité comptoir.'},
      {label:'🎯 PDM bassin',key:'pdm',fmt:'pct',tip:'Part de marché dans le bassin de comparaison. Mon CA total ÷ CA total bassin × 100. Indique votre poids relatif dans le réseau sélectionné.'},
      {label:'📈 Tx marge',key:'txMarge',fmt:'pct2',tip:'Taux de marge brute = VMB total ÷ CA total × 100. Source : colonnes VMB Prélevé / VMB Enlevé du consommé. Indique qui vend le mieux, pas seulement le plus.'}
    ];
    const cardsHtml=kpiDefs.map(r=>{
      const me=kpis.mine[r.key]||0,comp=kpis.compared[r.key]||0;
      const pct=comp>0?Math.round((me-comp)/comp*100):(me>0?100:0);
      const ecartIcon=pct>=0?'🟢':pct>=-10?'🟡':pct>=-30?'🟠':'🔴';
      const ecartColor=pct>=0?'c-ok font-extrabold':pct>=-10?'c-caution font-bold':pct>=-30?'c-caution font-bold':'c-danger font-extrabold';
      const cardBorder=pct>=0?'border-emerald-200':pct>=-10?'border-yellow-200':pct>=-30?'b-light':'border-red-300';
      const cardBg=pct>=0?'i-ok-bg/40':pct>=-10?'i-caution-bg/40':pct>=-30?'i-caution-bg/40':'i-danger-bg/40';
      const isLagging=pct<0;
      const clickCls=isLagging?'cursor-pointer hover:opacity-90 active:scale-[0.98] transition-all select-none':'';
      const onclk=isLagging?`onclick="document.getElementById('benchUnderperformBanner')?.scrollIntoView({behavior:'smooth'})"` :'';
      const drillHint=isLagging?`<p class="text-[9px] c-action font-semibold">→ Familles en retard</p>`:'';
      return `<div class="s-card rounded-xl border-2 ${cardBorder} ${cardBg} ${clickCls} p-3 flex flex-col gap-1 shadow-sm" ${onclk}>
        <p class="text-[10px] font-bold t-tertiary uppercase tracking-wide flex items-center gap-1">${r.label}<em class="info-tip" data-tip="${r.tip}">ℹ</em></p>
        <div class="flex items-end justify-between gap-1">
          <div><p class="text-sm font-extrabold c-action">${fmtVal(me,r.fmt)}</p><p class="text-[9px] t-disabled">${_S.selectedMyStore||'Moi'}</p></div>
          <div class="text-right"><p class="text-xs t-tertiary">${fmtVal(comp,r.fmt)}</p><p class="text-[9px] t-disabled">${obsLabel}</p></div>
        </div>
        <p class="text-xs ${ecartColor} border-t pt-1 mt-0.5">${ecartIcon} ${pct>0?'+':''}${pct}%</p>
        ${drillHint}
      </div>`;
    }).join('');
    if(el('obsKpiCards'))el('obsKpiCards').innerHTML=cardsHtml;
    // Tooltip ℹ sur "KPI Comparatifs" — diagnostic réseau condensé
    const _tipEl=el('kpiDiagTip');
    if(_tipEl&&kpis){
      const _pct=(key)=>{const me=kpis.mine[key]||0,c=kpis.compared[key]||0;return c>0?Math.round((me-c)/c*100):(me>0?100:0);};
      const diag=generateNetworkDiagnostic(_pct('ca'),_pct('ref'),_pct('freq'));
      _tipEl.dataset.tip=`${diag.icon} ${diag.title} — ${diag.message}`;
    }
    const diagEl=el('obsNetworkDiag');if(diagEl)diagEl.innerHTML='';
    // Families where I lose — apply min CA filter
    const minCA=_S.obsFilterMinCA||0;
    const loseFiltered=(obsFamiliesLose||[]).filter(f=>!minCA||Math.abs(f.caOther-(f.caMe||0))>=minCA);
    const winFiltered=(obsFamiliesWin||[]).filter(f=>!minCA||Math.abs((f.caMe||0)-(f.caOther||0))>=minCA);
    if(el('obsLoseBadge'))el('obsLoseBadge').textContent=loseFiltered.length;
    const loseRows=loseFiltered.map((f,i)=>{
      const famId='obsLose_'+i;
      const caGap=f.caMe-f.caOther;
      const arts=f.missingArts||[];
      const artsToRef=arts.filter(a=>a.statutMe!=='✅ En stock');
      const artsVisi=arts.filter(a=>a.statutMe==='✅ En stock');
      const ecGapCell=`<span class="font-extrabold c-danger">${formatEuro(caGap)}</span>`;
      const trueMissing=artsToRef.length||Math.max(0,f.refOther-f.refMe);
      const refBadge=trueMissing>0?`<span class="badge bg-red-500 text-white">${trueMissing}</span>`:'<span class="t-disabled">—</span>';
      const ecText=f.caMe===0?'<span class="c-danger font-extrabold">Absent</span>':`<span class="${f.ecartPct<-30?'c-danger font-extrabold':f.ecartPct<-10?'c-caution font-bold':'t-primary'}">${f.ecartPct}%</span>`;
      const artFreqLabel=isMedian?'Nb agences':`Nb ventes (${obsLabel})`;
      const artCALabel=isMedian?'CA médiane réseau':`CA chez ${obsLabel}`;
      const artRow=a=>`<tr class="border-b border-red-100"><td class="py-0.5 px-2 font-mono t-tertiary">${a.code}</td><td class="py-0.5 px-2">${a.lib}</td><td class="py-0.5 px-2 text-center font-bold">${isMedian?(a.nbStores??a.freqOther):a.freqOther}</td><td class="py-0.5 px-2 text-right t-secondary">${a.caOther>0?formatEuro(a.caOther):'—'}</td></tr>`;
      const artThead=`<thead class="t-secondary font-bold"><tr><th class="py-1 px-2 text-left">Code</th><th class="py-1 px-2 text-left">Libellé</th><th class="py-1 px-2 text-center">${artFreqLabel}</th><th class="py-1 px-2 text-right">${artCALabel}</th></tr></thead>`;
      const famAbsent=f.refMe===0;const list1Label=famAbsent?`📋 Articles vendus par le réseau dans cette famille (${artsToRef.length})`:`❌ ${artsToRef.length} article${artsToRef.length>1?'s':''} à référencer (non stockés)`;const list1Html=artsToRef.length?`<div class="mb-3" id="obsLose_${i}_arts"><p class="text-[10px] font-bold ${famAbsent?'c-action':'c-danger'} mb-1">${list1Label} :</p><table class="min-w-full text-[10px]">${artThead}<tbody>${artsToRef.slice(0,famAbsent?50:20).map(artRow).join('')}</tbody></table></div>`:'';
      const list2Html=artsVisi.length?`<div class="mb-2"><p class="text-[10px] font-bold c-caution mb-1">⚠️ ${artsVisi.length} article${artsVisi.length>1?'s':''} en stock non vendus — vérifier visibilité/emplacement :</p><table class="min-w-full text-[10px]">${artThead}<tbody>${artsVisi.slice(0,20).map(artRow).join('')}</tbody></table></div>`:'';
      const copyBtn=artsToRef.length?`<button onclick="event.stopPropagation();copyObsArticleList('obsLose_${i}_arts')" class="text-[9px] s-card border border-red-200 c-danger px-1.5 py-0.5 rounded hover:i-danger-bg font-bold">📋 Copier liste 1</button>`:'';
      const caAutreLabel=isMedian?'CA médiane réseau':`CA ${obsLabel}`;const refAutreLabel=isMedian?'Réf méd.':`Réf ${obsLabel}`;
      const detailGrid=`<div class="flex flex-wrap gap-4 text-[11px] mb-2 pt-2 px-3"><span class="t-tertiary">CA Moi : <strong class="c-action">${formatEuro(f.caMe)}</strong></span><span class="t-tertiary">${caAutreLabel} : <strong>${formatEuro(f.caOther)}</strong></span><span class="t-tertiary">Écart : ${ecText}</span><span class="t-tertiary">Réf Moi : <strong>${f.refMe}</strong></span><span class="t-tertiary">${refAutreLabel} : <strong>${f.refOther}</strong></span>${f.caTheorique!=null?`<span class="t-tertiary">CA Théo. : <strong>${formatEuro(f.caTheorique)}</strong></span><span class="t-tertiary">Écart théo. : <strong class="${f.ecartTheorique>=0?'c-ok':'c-danger'}">${f.ecartTheorique>=0?'+':''}${formatEuro(f.ecartTheorique)}</strong></span>`:''}</div>`;
      const ecBg=f.ecartPct<-30?'i-danger-bg/80':'i-caution-bg/70';
      const noArts=!artsToRef.length&&!artsVisi.length?'<p class="t-disabled text-[10px] py-2">Aucun article identifié.</p>':'';
      const specs=f.specialArts||[];const specCA=specs.reduce((s,a)=>s+a.caOther,0);
      const specEncart=specs.length?`<div class="mx-3 mt-3 p-2 s-hover rounded border b-default text-[10px] t-tertiary"><p class="font-bold t-secondary mb-1">⚠️ ${specs.length} article${specs.length>1?'s':''} spéciaux détectés chez ${obsLabel}${specCA>0?' (CA : '+formatEuro(specCA)+')':''}</p><p class="font-mono t-disabled text-[9px] mb-1">${specs.slice(0,15).map(a=>a.code).join(' · ')}</p><p class="italic t-disabled">Vérifiez si ces commandes spéciales sont récurrentes.</p></div>`:'';
      const _loseFamAttr=f.fam.replace(/&/g,'&amp;').replace(/"/g,'&quot;');
      const loseDiagBtn=`<button class="diag-btn i-danger-bg c-danger hover:i-danger-bg" data-fam="${_loseFamAttr}" onclick="event.stopPropagation();openDiagnostic(this.dataset.fam,'bench')" title="Diagnostiquer cette famille">🔍 Diagnostiquer</button>`;
      const _losePdmCell=f.pdm!=null?`<td class="py-2 px-3 text-center text-xs font-bold ${f.pdm>=20?'c-ok':f.pdm>=10?'c-caution':'c-danger'}">${f.pdm}%</td>`:`<td class="py-2 px-3 text-center text-xs t-disabled">—</td>`;return `<tr class="border-b cursor-pointer hover:i-danger-bg/40 transition-colors" onclick="toggleObsFamily('${famId}')"><td class="py-2 px-3 font-semibold t-primary"><span class="obs-expand-icon t-disabled mr-1 text-[9px]">▶</span>${f.fam}</td><td class="py-2 px-3 text-right">${ecGapCell}</td>${_losePdmCell}<td class="py-2 px-3 text-center">${refBadge}</td></tr><tr id="${famId}" class="hidden ${ecBg}"><td colspan="4"><div class="pb-3">${detailGrid}<div class="px-3 mb-2 flex gap-2 flex-wrap">${copyBtn||''}${loseDiagBtn}</div>${`<div class="px-3 pb-1">${noArts}${list1Html}${list2Html}</div>`}${specEncart}</div></td></tr>`;
    }).join('');
    if(el('obsLoseTable'))el('obsLoseTable').innerHTML=loseRows||'<tr><td colspan="4" class="py-4 text-center t-disabled">🎉 Aucune famille où l\'autre vous dépasse.</td></tr>';
    // Families where I win
    if(el('obsWinBadge'))el('obsWinBadge').textContent=winFiltered.length;
    const winRows=winFiltered.map((f,i)=>{
      const winId='obsWin_'+i;
      const caAdv=f.caMe-f.caOther;
      const refAdv=Math.max(0,f.refMe-f.refOther);
      const advCell=`<span class="font-extrabold c-ok">+${formatEuro(caAdv)}</span>`;
      const refBadge=refAdv>0?`<span class="badge bg-emerald-500 text-white">+${refAdv}</span>`:'<span class="t-disabled">—</span>';
      const caAutreWin=isMedian?'CA médiane réseau':`CA ${obsLabel}`;const refAutreWin=isMedian?'Réf méd.':`Réf ${obsLabel}`;
      const detailGrid=`<div class="flex flex-wrap gap-4 text-[11px] pt-2 px-3 pb-3"><span class="t-tertiary">CA Moi : <strong class="c-action">${formatEuro(f.caMe)}</strong></span><span class="t-tertiary">${caAutreWin} : <strong>${formatEuro(f.caOther)}</strong></span><span class="t-tertiary">Écart : <strong class="c-ok">+${f.ecartPct}%</strong></span><span class="t-tertiary">Réf Moi : <strong class="c-action">${f.refMe}</strong></span><span class="t-tertiary">${refAutreWin} : <strong>${f.refOther}</strong></span>${f.caTheorique!=null?`<span class="t-tertiary">CA Théo. : <strong>${formatEuro(f.caTheorique)}</strong></span><span class="t-tertiary">Écart théo. : <strong class="${f.ecartTheorique>=0?'c-ok':'c-danger'}">${f.ecartTheorique>=0?'+':''}${formatEuro(f.ecartTheorique)}</strong></span>`:''}</div>`;
      const excl=f.exclusiveArts||[];
      const exclHtml=excl.length?`<div class="mb-3 px-3"><p class="text-[10px] font-bold c-ok mb-1">🏆 ${excl.length} article${excl.length>1?'s':''} exclusifs — vous les vendez, pas ${isMedian?'la médiane':obsLabel} :</p><table class="min-w-full text-[10px]"><thead class="t-secondary font-bold"><tr><th class="py-1 px-2 text-left">Code</th><th class="py-1 px-2 text-left">Libellé</th><th class="py-1 px-2 text-center">Fréq</th><th class="py-1 px-2 text-right">CA</th></tr></thead><tbody>${excl.slice(0,20).map(a=>`<tr class="border-b b-light"><td class="py-0.5 px-2 font-mono t-tertiary">${a.code}</td><td class="py-0.5 px-2">${a.lib}</td><td class="py-0.5 px-2 text-center font-bold">${a.freq}</td><td class="py-0.5 px-2 text-right font-bold c-ok">${formatEuro(a.ca)}</td></tr>`).join('')}</tbody></table></div>`:'';
      const noArts=!excl.length?'<p class="t-disabled text-[10px] py-2">Aucun article exclusif identifié.</p>':'';
      const _winPdmCell=f.pdm!=null?`<td class="py-2 px-3 text-center text-xs font-bold ${f.pdm>=20?'c-ok':f.pdm>=10?'c-caution':'c-danger'}">${f.pdm}%</td>`:`<td class="py-2 px-3 text-center text-xs t-disabled">—</td>`;return `<tr class="border-b cursor-pointer hover:i-ok-bg/40 transition-colors" onclick="toggleObsFamily('${winId}')"><td class="py-2 px-3 font-semibold t-primary"><span class="obs-expand-icon t-disabled mr-1 text-[9px]">▶</span>${f.fam}</td><td class="py-2 px-3 text-right">${advCell}</td>${_winPdmCell}<td class="py-2 px-3 text-center">${refBadge}</td></tr><tr id="${winId}" class="hidden i-ok-bg/70"><td colspan="4"><div class="pb-3">${detailGrid}${exclHtml}<div class="px-3 pb-1">${noArts}</div></div></td></tr>`;
    }).join('');
    if(el('obsWinTable'))el('obsWinTable').innerHTML=winRows||'<tr><td colspan="4" class="py-4 text-center t-disabled">—</td></tr>';
    // [V3] Bandeau biais canal — sections soft : pépites filtrées agence vs réseau brut
    const _obsCanal=_S._globalCanal||'';
    const biasBanner=el('benchCanalBias');
    if(biasBanner){if(_obsCanal){const lb=el('benchCanalBiasLabel');if(lb)lb.textContent=_obsCanal;biasBanner.classList.remove('hidden');}else biasBanner.classList.add('hidden');}
    // 💎 Mes pépites [V3] — filtrage par canal articleCanalCA si actif
    const pepitesAll=_S.benchLists.pepites||[];
    const pepites=_obsCanal
      ? pepitesAll.filter(p=>(_S.articleCanalCA.get(p.code)?.has(_obsCanal)))
      : pepitesAll;
    const pepBadge=el('pepitesBadge');if(pepBadge){if(pepites.length){pepBadge.textContent=pepites.length;pepBadge.classList.remove('hidden');}else pepBadge.classList.add('hidden');}
    if(el('pepitesMeLabel'))el('pepitesMeLabel').textContent=`Fréq Moi (${_S.selectedMyStore||'Moi'})`;
    if(el('pepitesCompLabel'))el('pepitesCompLabel').textContent=isMedian?'Fréq médiane réseau':`Fréq ${obsLabel}`;
    const pepRows=pepites.map(p=>{
      const ecartStr=`<span class="c-ok font-extrabold">+${p.ecartPct}%</span>`;
      return`<tr class="border-b hover:i-caution-bg/40"><td class="py-1.5 px-3 font-mono t-tertiary whitespace-nowrap">${p.code}</td><td class="py-1.5 px-3 font-semibold t-primary">${p.lib}</td><td class="py-1.5 px-3 t-tertiary text-[11px]">${p.fam||'—'}</td><td class="py-1.5 px-3 text-center font-extrabold c-ok">${p.myFreq}</td><td class="py-1.5 px-3 text-center t-tertiary">${p.compFreq}</td><td class="py-1.5 px-3 text-center">${ecartStr}</td><td class="py-1.5 px-3 text-right t-secondary whitespace-nowrap">${p.caMe>0?formatEuro(p.caMe):'—'}</td></tr>`;
    }).join('');
    if(el('pepitesTable'))el('pepitesTable').innerHTML=pepRows||'<tr><td colspan="7" class="py-4 text-center t-disabled italic">Aucune pépite identifiée — fréquence insuffisante ou réseau similaire.</td></tr>';
    // 🔥 Pépites réseau
    const pepOther=_S.benchLists.pepitesOther||[];
    const pepOtherBadge=el('pepitesOtherBadge');if(pepOtherBadge){if(pepOther.length){pepOtherBadge.textContent=pepOther.length;pepOtherBadge.classList.remove('hidden');}else pepOtherBadge.classList.add('hidden');}
    if(el('pepitesOtherTitle'))el('pepitesOtherTitle').textContent=isMedian?'🔥 Pépites réseau — articles que le réseau vend mieux':`🔥 Pépites ${obsLabel} — articles où ${obsLabel} me surpasse`;
    if(el('pepitesOtherMeLabel'))el('pepitesOtherMeLabel').textContent=`Fréq Moi (${_S.selectedMyStore||'Moi'})`;
    if(el('pepitesOtherCompLabel'))el('pepitesOtherCompLabel').textContent=isMedian?'Fréq médiane réseau':`Fréq ${obsLabel}`;
    if(el('pepitesOtherCALabel'))el('pepitesOtherCALabel').textContent=isMedian?'CA médiane réseau':`CA ${obsLabel}`;
    // Pré-calcul clients zone par famille (si chalandise dispo)
    const _famCZ={};
    if(_S.chalandiseReady&&DataStore.ventesClientArticle.size){for(const[cc,artMap]of DataStore.ventesClientArticle.entries()){if(!_S.chalandiseData.has(cc))continue;const seen=new Set();for(const code of artMap.keys()){const f=_S.articleFamille[code];if(f&&!seen.has(f)){seen.add(f);_famCZ[f]=(_famCZ[f]||0)+1;}}}}
    const pepOtherRows=pepOther.map(p=>{
      const ecartStr=p.ecartPct!==null?`<span class="c-caution font-extrabold">+${p.ecartPct}%</span>`:'<span class="c-danger font-extrabold">Absent</span>';
      const myFreqStr=p.myFreq>0?`<span class="t-primary">${p.myFreq}</span>`:'<span class="c-danger font-semibold">0</span>';
      const czCount=_S.chalandiseReady?(_famCZ[p.fam]??0):null;
      const czCell=czCount===null?'<td class="py-1.5 px-3 text-center t-disabled">—</td>':`<td class="py-1.5 px-3 text-center text-xs font-bold ${czCount>0?'c-ok':'t-disabled'}">${czCount>0?czCount:'0'}</td>`;
      return`<tr class="border-b hover:i-caution-bg/40"><td class="py-1.5 px-3 font-mono t-tertiary whitespace-nowrap">${p.code}</td><td class="py-1.5 px-3 font-semibold t-primary">${p.lib}</td><td class="py-1.5 px-3 t-tertiary text-[11px]">${p.fam||'—'}</td><td class="py-1.5 px-3 text-center">${myFreqStr}</td><td class="py-1.5 px-3 text-center font-extrabold c-caution">${p.compFreq}</td><td class="py-1.5 px-3 text-center">${ecartStr}</td>${czCell}<td class="py-1.5 px-3 text-right t-secondary whitespace-nowrap">${p.caComp>0?formatEuro(p.caComp):'—'}</td></tr>`;
    }).join('');
    if(el('pepitesOtherTable'))el('pepitesOtherTable').innerHTML=pepOtherRows||'<tr><td colspan="8" class="py-4 text-center t-disabled italic">Aucune pépite réseau identifiée.</td></tr>';
  }

  function buildObsCompareSelect(){
    const sel=document.getElementById('obsCompareSelect');if(!sel)return;
    const current=_S.selectedObsCompare||'median';
    sel.innerHTML='<option value="median">📊 Médiane réseau</option>';
    [..._S.storesIntersection].sort().filter(s=>s!==_S.selectedMyStore).forEach(s=>{const o=document.createElement('option');o.value=s;o.textContent='🏪 '+s;if(s===current)o.selected=true;sel.appendChild(o);});
    if(current==='median')sel.value='median';
    _updateObsCheckboxVisibility();
  }

  function _updateObsCheckboxVisibility(){
    const isMedian=(_S.selectedObsCompare||'median')==='median';
    const pickDiv=document.getElementById('benchPickDiv');
    if(pickDiv)pickDiv.classList.toggle('hidden',!isMedian);
  }

  function onObsCompareChange(){
    _S.selectedObsCompare=document.getElementById('obsCompareSelect')?.value||'median';
    _updateObsCheckboxVisibility();
    const t0=performance.now();
    computeBenchmark(_S._globalCanal || null);renderBenchmark();
    document.getElementById('benchRecalcTime').textContent=`⚡ ${Math.round(performance.now()-t0)}ms`;
    closeFilterDrawer();
  }

  function onObsFilterChange(){
    _S.obsFilterUnivers=document.getElementById('obsFilterUnivers')?.value||'';
    _S.obsFilterMinCA=parseFloat(document.getElementById('obsMinCAInput')?.value||'0')||0;
    const t0=performance.now();computeBenchmark(_S._globalCanal || null);renderBenchmark();
    document.getElementById('benchRecalcTime').textContent=`⚡ ${Math.round(performance.now()-t0)}ms`;
  }

  function resetObsFilters(){
    _S.obsFilterUnivers='';_S.obsFilterMinCA=0;
    const u=document.getElementById('obsFilterUnivers');if(u)u.value='';
    const m=document.getElementById('obsMinCAInput');if(m)m.value='0';
    _buildObsUniversDropdown();
    _setBenchPeriode('12M');
    const t0=performance.now();computeBenchmark(_S._globalCanal || null);renderBenchmark();
    document.getElementById('benchRecalcTime').textContent=`⚡ ${Math.round(performance.now()-t0)}ms`;
    closeFilterDrawer();
  }

  // [V3] Filtre période réseau — active _getFilteredMonths via _S._globalPeriodePreset
  function _setBenchPeriode(preset) {
    _S._globalPeriodePreset = preset;
    const t0=performance.now();renderBenchmark();
    const el=document.getElementById('benchRecalcTime');if(el)el.textContent=`⚡ ${Math.round(performance.now()-t0)}ms`;
  }

  function _buildObsUniversDropdown(){
    const sel=document.getElementById('obsFilterUnivers');if(!sel||sel.tagName!=='SELECT')return;
    const univs=new Set();
    for(const v of Object.values(_S.articleUnivers))if(v)univs.add(v);
    const cur=_S.obsFilterUnivers||'';
    sel.innerHTML='<option value="">🌐 Univers…</option>'+[...univs].sort().map(u=>`<option value="${u}"${u===cur?' selected':''}>${u}</option>`).join('');
  }

  function renderObsArticleSearch(){
    const q=(document.getElementById('obsArtSearch')?.value||'').trim();
    const res=document.getElementById('obsArtSearchResult');if(!res)return;
    if(!q){res.innerHTML='';return;}
    const{missed,over}=_S.benchLists;const rows=[];
    for(const m of(missed||[])){if(matchQuery(q,m.code,m.lib)){const s=m.myStock>0?'🟢 En stock':'🔴 Stock 0';rows.push(`<div class="flex flex-wrap items-center gap-2 p-2 border-b hover:i-danger-bg cursor-pointer" onclick="openArticlePanel('${m.code}','bench')"><span class="font-mono text-[10px] t-tertiary w-16 shrink-0">${m.code}</span><span class="flex-1 text-xs min-w-0">${m.lib}</span><span class="badge bg-red-500 text-white text-[9px] shrink-0">🚫 Manquée</span><span class="text-[10px] t-tertiary shrink-0">${m.sc}/${m.nbCompare} agences · ${m.bassinFreq} ventes · ${s}</span></div>`);}}
    for(const o of(over||[])){if(matchQuery(q,o.code,o.lib)){rows.push(`<div class="flex flex-wrap items-center gap-2 p-2 border-b hover:i-ok-bg cursor-pointer" onclick="openArticlePanel('${o.code}','bench')"><span class="font-mono text-[10px] t-tertiary w-16 shrink-0">${o.code}</span><span class="flex-1 text-xs min-w-0">${o.lib}</span><span class="badge bg-emerald-500 text-white text-[9px] shrink-0">🏆 Sur-perf</span><span class="text-[10px] t-tertiary shrink-0">Moi: ${o.myQte} · Méd: ${o.avg} · ${(o.ratio*100).toFixed(0)}%</span></div>`);}}
    if(!rows.length){
      const agenceData={};
      for(const[store,arts]of Object.entries(_S.ventesParMagasin||{})){
        for(const[code,data]of Object.entries(arts)){
          if(!matchQuery(q,code,_S.libelleLookup[code]||''))continue;
          if(!agenceData[code])agenceData[code]={lib:_S.libelleLookup[code]||code,agences:[]};
          agenceData[code].agences.push({store,countBL:data.countBL||0});
        }
      }
      for(const[code,d]of Object.entries(agenceData)){
        const myData=(_S.ventesParMagasin[_S.selectedMyStore]||{})[code];
        const myBL=myData?.countBL||0;
        const totalReseau=d.agences.reduce((s,a)=>s+a.countBL,0);
        const nbAgences=d.agences.filter(a=>a.countBL>0).length;
        const mediane=nbAgences>0?Math.round(totalReseau/nbAgences):0;
        const myStock=DataStore.finalData.find(r=>r.code===code)?.stockActuel??null;
        const stockBadge=myStock===null?'<span class="t-disabled text-[9px]">Non réf.</span>':myStock>0?`<span class="c-ok text-[9px] font-bold">${myStock} en stock</span>`:'<span class="c-danger text-[9px] font-bold">Rupture</span>';
        const ratio=mediane>0?Math.round(myBL/mediane*100):null;
        const perfBadge=ratio===null?'<span class="badge bg-slate-400 text-white text-[9px]">Médiane 0</span>':ratio>=100?'<span class="badge bg-emerald-500 text-white text-[9px]">🏆 Sur-perf</span>':ratio>=50?'<span class="badge bg-amber-500 text-white text-[9px]">📉 Sous-perf</span>':'<span class="badge bg-red-500 text-white text-[9px]">🚫 Faible</span>';
        rows.push(`<div class="flex flex-wrap items-center gap-2 p-2 border-b hover:s-card cursor-pointer" onclick="openArticlePanel('${code}','bench')"><span class="font-mono text-[10px] t-tertiary w-16 shrink-0">${code}</span><span class="flex-1 text-xs min-w-0">${d.lib}</span>${perfBadge}<span class="text-[10px] t-tertiary shrink-0">Moi: ${myBL} · Méd: ${mediane} · ${nbAgences} agences · ${stockBadge}</span></div>`);
      }
    }
    res.innerHTML=rows.length?`<div class="s-card border rounded-xl overflow-hidden shadow-sm mt-1">${rows.join('')}</div>`:'<p class="text-sm t-disabled mt-2 text-center py-2">Article inconnu du réseau — aucune vente dans les données chargées.</p>';
  }

  function copyObsActionPlan(){
    const plan=_S.benchLists.obsActionPlan||[];
    if(!plan.length){showToast('Aucun plan à copier','warning');return;}
    const obsLabel=(_S.selectedObsCompare||'median')==='median'?'Médiane réseau':_S.selectedObsCompare;
    const lines=[`Plan d'action Le Réseau — ${_S.selectedMyStore||'Moi'} vs ${obsLabel}`,''];
    plan.forEach((a,i)=>{
      const potLabel=a.caPotentiel>0?`${a.caPotentiel.toLocaleString('fr')}€`:'N/A';
      const txt=a.nbToRef>0
        ?`${i+1}. → Référencer ${a.nbToRef} article${a.nbToRef>1?'s':''} en ${a.fam} (potentiel ${potLabel})`
        :`${i+1}. → Améliorer la performance en ${a.fam} (écart ${a.ecartPct}% vs ${obsLabel})`;
      lines.push(txt);
    });
    navigator.clipboard?.writeText(lines.join('\n')).then(()=>showToast('📋 Plan copié dans le presse-papier','success')).catch(()=>showToast('❌ Erreur copie','error'));
  }

  function copyObsArticleList(containerId){
    const container=document.getElementById(containerId);if(!container)return;
    const rows=[...container.querySelectorAll('tbody tr')];
    if(!rows.length){showToast('Aucun article à copier','warning');return;}
    const lines=['Code\tLibellé\tFréq autre\tStatut chez moi'];
    for(const row of rows){const cells=[...row.querySelectorAll('td')].map(td=>td.textContent.trim());lines.push(cells.join('\t'));}
    navigator.clipboard?.writeText(lines.join('\n')).then(()=>showToast('📋 Liste copiée dans le presse-papier','success')).catch(()=>showToast('❌ Erreur copie','error'));
  }

  function toggleObsFamily(id){
    const row=document.getElementById(id);if(!row)return;
    const nowHidden=row.classList.toggle('hidden');
    const prevRow=row.previousElementSibling;if(!prevRow)return;
    const icon=prevRow.querySelector('.obs-expand-icon');if(icon)icon.textContent=nowHidden?'▶':'▼';
  }

  function copyObsSection(type){
    const rows=type==='lose'?_S.benchLists.obsFamiliesLose:_S.benchLists.obsFamiliesWin;
    if(!rows||!rows.length){showToast('Aucune donnée à copier','warning');return;}
    const lines=['Famille\tCA Moi\tCA Autre\tÉcart %\tRéf Moi\tRéf Autre'];
    for(const f of rows)lines.push(`${f.fam}\t${Math.round(f.caMe)}\t${Math.round(f.caOther)}\t${f.ecartPct}%\t${f.refMe}\t${f.refOther}`);
    navigator.clipboard?.writeText(lines.join('\n')).then(()=>showToast('📋 Copié dans le presse-papier','success')).catch(()=>showToast('❌ Erreur copie','error'));
  }

  function copyPepitesList(){
    const pepites=_S.benchLists.pepites||[];
    if(!pepites.length){showToast('Aucune pépite à copier','warning');return;}
    const obsMode=_S.selectedObsCompare||'median';const isMedian=obsMode==='median';
    const compLabel=isMedian?'Fréq médiane réseau':`Fréq ${obsMode}`;
    const lines=[`Code\tLibellé\tFamille\tFréq Moi\t${compLabel}\tÉcart %\tCA Moi`];
    for(const p of pepites)lines.push(`${p.code}\t${p.lib}\t${p.fam}\t${p.myFreq}\t${p.compFreq}\t+${p.ecartPct}%\t${p.caMe}`);
    navigator.clipboard?.writeText(lines.join('\n')).then(()=>showToast(`📋 ${pepites.length} pépite${pepites.length>1?'s':''} copiée${pepites.length>1?'s':''} dans le presse-papier`,'success')).catch(()=>showToast('❌ Erreur copie','error'));
  }

  function copyPepitesOtherList(){
    const pepOther=_S.benchLists.pepitesOther||[];
    if(!pepOther.length){showToast('Aucune pépite réseau à copier','warning');return;}
    const obsMode=_S.selectedObsCompare||'median';const isMedian=obsMode==='median';
    const compLabel=isMedian?'Fréq médiane réseau':`Fréq ${obsMode}`;
    const caLabel=isMedian?'CA médiane réseau':`CA ${obsMode}`;
    const lines=[`Code\tLibellé\tFamille\tFréq Moi\t${compLabel}\tÉcart %\t${caLabel}`];
    for(const p of pepOther)lines.push(`${p.code}\t${p.lib}\t${p.fam}\t${p.myFreq}\t${p.compFreq}\t${p.ecartPct!==null?'+'+p.ecartPct+'%':'Absent'}\t${p.caComp}`);
    navigator.clipboard?.writeText(lines.join('\n')).then(()=>showToast(`📋 ${pepOther.length} pépite${pepOther.length>1?'s':''} réseau copiée${pepOther.length>1?'s':''} dans le presse-papier`,'success')).catch(()=>showToast('❌ Erreur copie','error'));
  }

  function openNomadeArticleModal(code) {
    const art = (_S.nomadesMissedArts || []).find(a => a.code === code);
    if (!art) return;
    const overlay = document.getElementById('nomadeArticleOverlay');
    const panel = document.getElementById('nomadeArticlePanel');
    if (!overlay || !panel) return;
    const lib = (_S.libelleLookup[code] || code).replace(/^\d{6} - /, '');
    const myStoreCA = (_S.ventesParMagasin[_S.selectedMyStore] || {})[code]?.sumCA || 0;
    const opportunite = Math.max(0, art.totalCaOther - myStoreCA);
    const caParClient = art.nbClients > 0 ? Math.round(art.totalCaOther / art.nbClients) : 0;
    const artInfo = DataStore.finalData.find(d => d.code === code);
    const stockHtml = artInfo
      ? `<span class="ml-2 text-[11px]" style="color:var(--t-secondary,#cbd5e1)">Stock : <strong>${artInfo.stockActuel ?? '—'}</strong>${artInfo.abcClass ? ` · <span style="color:var(--c-action)">${artInfo.abcClass}${artInfo.fmrClass || ''}</span>` : ''}</span>`
      : '';
    // Per-client rows
    let clientRows = '';
    for (const cc of art.clientCodes) {
      const nom = _S.clientNomLookup[cc] || (_S.chalandiseData?.get(cc)?.nom) || cc;
      const caMe = _S.ventesClientArticle?.get(cc)?.get(code)?.sumCA || 0;
      clientRows += `<tr class="border-b b-light hover:i-caution-bg/30">
        <td class="py-1.5 px-3 font-mono text-[11px] whitespace-nowrap" style="color:var(--t-secondary,#94a3b8)">${cc}</td>
        <td class="py-1.5 px-3 text-[12px] font-semibold max-w-[200px] truncate" style="color:var(--t-primary,#fff)" title="${nom.replace(/"/g,'&quot;')}">${nom}</td>
        <td class="py-1.5 px-3 text-right font-bold c-caution whitespace-nowrap">${formatEuro(caParClient)}</td>
        <td class="py-1.5 px-3 text-right font-semibold whitespace-nowrap ${caMe > 0 ? 'c-ok' : ''}" style="${caMe <= 0 ? 'color:var(--t-secondary,#94a3b8)' : ''}">${caMe > 0 ? formatEuro(caMe) : '—'}</td>
        <td class="py-1.5 px-3 text-center"><button class="diag-btn text-[11px] py-0.5 px-2" onclick="closeNomadeArticleModal();openClient360('${cc}')" title="Fiche client 360°">📞</button></td>
      </tr>`;
    }
    panel.innerHTML = `
      <button class="absolute top-3 right-4 text-2xl hover:t-primary" style="color:var(--t-secondary,#94a3b8)" onclick="closeNomadeArticleModal()" title="Fermer">✕</button>
      <h2 class="text-base font-extrabold pr-8" style="color:var(--t-primary,#fff)">${lib}</h2>
      <p class="text-[11px] mb-4 flex items-center flex-wrap gap-1" style="color:var(--t-secondary,#94a3b8)"><span class="font-mono c-action">${code}</span> · ${art.fam || '—'}${stockHtml}</p>
      <div class="grid grid-cols-3 gap-3 mb-4">
        <div class="s-panel-inner rounded-lg p-3 text-center">
          <p class="text-[10px] mb-1" style="color:var(--t-secondary,#94a3b8)">💰 CA chez toi</p>
          <p class="text-base font-extrabold ${myStoreCA > 0 ? 'c-ok' : ''}" style="${myStoreCA <= 0 ? 'color:var(--t-secondary,#94a3b8)' : ''}">${myStoreCA > 0 ? formatEuro(myStoreCA) : '—'}</p>
        </div>
        <div class="s-panel-inner rounded-lg p-3 text-center">
          <p class="text-[10px] mb-1" style="color:var(--t-secondary,#94a3b8)">💸 CA chez les autres</p>
          <p class="text-base font-extrabold c-caution">${formatEuro(art.totalCaOther)} <span class="text-[10px] font-normal" style="color:var(--t-secondary,#94a3b8)">(${art.totalBLOther} BL)</span></p>
        </div>
        <div class="s-panel-inner rounded-lg p-3 text-center">
          <p class="text-[10px] mb-1" style="color:var(--t-secondary,#94a3b8)">🎯 Opportunité</p>
          <p class="text-base font-extrabold c-danger">${formatEuro(opportunite)}</p>
        </div>
      </div>
      <h3 class="text-sm font-bold mb-2" style="color:var(--t-primary,#fff)">👥 ${art.nbClients} client${art.nbClients > 1 ? 's' : ''} concerné${art.nbClients > 1 ? 's' : ''} <span class="text-[10px] font-normal" style="color:var(--t-secondary,#94a3b8)">(CA ailleurs estimé par client)</span></h3>
      <div class="overflow-x-auto mb-4">
        <table class="min-w-full text-xs">
          <thead class="s-panel-inner t-inverse font-bold">
            <tr>
              <th class="py-1.5 px-3 text-left">Code</th>
              <th class="py-1.5 px-3 text-left">Nom</th>
              <th class="py-1.5 px-3 text-right">CA ailleurs</th>
              <th class="py-1.5 px-3 text-right">CA chez moi</th>
              <th class="py-1.5 px-3 text-center"></th>
            </tr>
          </thead>
          <tbody>${clientRows}</tbody>
        </table>
      </div>
      <div class="flex gap-3 flex-wrap justify-end pt-3 border-t b-default">
        <button class="btn-secondary text-xs px-3 py-1.5" onclick="closeNomadeArticleModal();openDiagnostic('${art.fam?.replace(/'/g,"\\'") || ''}','bench')">Diagnostic famille</button>
        <button class="btn-secondary text-xs px-3 py-1.5" onclick="_copyNomadeClientsClipboard('${code}')">Copier liste clients</button>
        <button class="btn-primary text-xs px-3 py-1.5" onclick="closeNomadeArticleModal()">Fermer</button>
      </div>`;
    overlay.classList.add('active');
  }

  function closeNomadeArticleModal() {
    document.getElementById('nomadeArticleOverlay')?.classList.remove('active');
  }

  function _copyNomadeClientsClipboard(code) {
    const art = (_S.nomadesMissedArts || []).find(a => a.code === code);
    if (!art) return;
    const lines = ['Code client\tNom\tCA ailleurs (estimé)\tCA chez moi'];
    const caParClient = art.nbClients > 0 ? Math.round(art.totalCaOther / art.nbClients) : 0;
    for (const cc of art.clientCodes) {
      const nom = _S.clientNomLookup[cc] || _S.chalandiseData?.get(cc)?.nom || cc;
      const caMe = _S.ventesClientArticle?.get(cc)?.get(code)?.sumCA || 0;
      lines.push(`${cc}\t${nom}\t${caParClient}\t${caMe}`);
    }
    navigator.clipboard?.writeText(lines.join('\n'))
      .then(() => showToast('📋 Clients copiés', 'success'))
      .catch(() => showToast('❌ Erreur copie', 'error'));
  }

  function copyNomadesMissedArts() {
    const list = _S.nomadesMissedArts || [];
    if (!list.length) { showToast('Aucune donnée à copier', 'warning'); return; }
    const lines = ['Code\tLibellé\tFamille\tClients concernés\tCA réseau estimé'];
    for (const art of list) {
      const lib = (_S.libelleLookup[art.code] || art.code).replace(/^\d{6} - /, '');
      lines.push(`${art.code}\t${lib}\t${art.fam}\t${art.nbClients}\t${art.caReseau}`);
    }
    navigator.clipboard?.writeText(lines.join('\n'))
      .then(() => showToast(`📋 ${list.length} articles copiés`, 'success'))
      .catch(() => showToast('❌ Erreur copie', 'error'));
  }

  function exportBenchList(type){const SEP=';';let h,rows;if(type==='missed'){h=['Code','Libelle','Freq','Mag','Stock','Diagnostic'];rows=_S.benchLists.missed.map(m=>[m.code,csvCell(m.lib),m.bassinFreq,m.sc+'/'+m.nbCompare,m.myStock,csvCell(m.diagnostic)]);}else if(type==='under'){h=['Code','Libelle','Moi','Moy','Ratio'];rows=(_S.benchLists.under||[]).map(u=>[u.code,csvCell(u.lib),u.myQte,u.avg,(u.ratio*100).toFixed(0)+'%']);}else{h=['Code','Libelle','Moi','Moy','Ratio'];rows=(_S.benchLists.over||[]).map(o=>[o.code,csvCell(o.lib),o.myQte,o.avg,(o.ratio*100).toFixed(0)+'%']);}const lines=['\uFEFF'+h.join(SEP),...rows.map(r=>r.join(SEP))];const blob=new Blob([lines.join('\n')],{type:'text/csv;charset=utf-8;'});const link=document.createElement('a');link.href=URL.createObjectURL(blob);link.download=`PRISME_Bench_${type}_${_S.selectedMyStore}_${new Date().toISOString().slice(0,10)}.csv`;document.body.appendChild(link);link.click();document.body.removeChild(link);URL.revokeObjectURL(link.href);}

  // ★ DASHBOARD + COCKPIT
  function renderComparison(currentKPI){const prev=_S.kpiHistory.length>0?_S.kpiHistory[_S.kpiHistory.length-1]:null;_S.kpiHistory.push(currentKPI);while(_S.kpiHistory.length>12)_S.kpiHistory.shift();if(!prev){document.getElementById('compareBlock').classList.add('hidden');return;}document.getElementById('compareBlock').classList.remove('hidden');document.getElementById('compareDate').textContent='(réf: '+prev.date+')';const metrics=[{label:'💰 Stock',cur:currentKPI.totalValue,old:prev.totalValue,fmt:'euro',better:'down'},{label:'☠️ Dormant',cur:currentKPI.dormant,old:prev.dormant,fmt:'euro',better:'down'},{label:'📊 Surstock',cur:currentKPI.surstock,old:prev.surstock,fmt:'euro',better:'down'},{label:'🚨 Ruptures',cur:currentKPI.ruptures,old:prev.ruptures,fmt:'num',better:'down'},{label:'✅ Dispo.',cur:currentKPI.serviceRate,old:prev.serviceRate,fmt:'pct',better:'up'},{label:'👁️ Excédent ERP',cur:currentKPI.capalin,old:prev.capalin,fmt:'euro',better:'down'},{label:'💸 CA Perdu',cur:currentKPI.caPerdu||0,old:prev.caPerdu||0,fmt:'euro',better:'down'}];const p=[];for(const m of metrics){const diff=m.cur-m.old;const isGood=(m.better==='down'&&diff<=0)||(m.better==='up'&&diff>=0);const arrow=diff>0?'▲':diff<0?'▼':'■';const color=diff===0?'t-tertiary':isGood?'c-ok':'c-danger';const bg=diff===0?'s-card-alt':isGood?'i-ok-bg':'i-danger-bg';let diffStr='';if(m.fmt==='euro')diffStr=(diff>0?'+':'')+formatEuro(diff);else if(m.fmt==='pct')diffStr=(diff>0?'+':'')+diff.toFixed(1)+'%';else diffStr=(diff>0?'+':'')+diff;let curStr='';if(m.fmt==='euro')curStr=formatEuro(m.cur);else if(m.fmt==='pct')curStr=m.cur.toFixed(1)+'%';else curStr=m.cur;p.push('<div class="'+bg+' rounded-lg p-3 text-center border"><p class="text-[10px] font-bold t-secondary mb-1">'+m.label+'</p><p class="text-sm font-extrabold t-primary">'+curStr+'</p><p class="text-xs font-bold '+color+'">'+arrow+' '+diffStr+'</p></div>');}document.getElementById('compareCards').innerHTML=p.join('');}

  // ── Feature D — Recommandations Saisonnières ──────────────────────────────
  // Projection du mois courant depuis seasonalIndex (famille → [12 coefficients]).
  // Zéro structure _S ajoutée — calcul au render uniquement.
  // Les MIN/MAX réglementaires (ancienMin/nouveauMin) NE SONT PAS modifiés.
  // [Feature A] Retourne les mois filtrés selon _globalPeriodePreset
  // Utilisé par sparklines (diagnostic) et saisonnier widget
  function _getFilteredMonths(code) {
    const months = _S.articleMonthlySales[code];
    if (!months) return null;
    const preset = _S._globalPeriodePreset || '12M';
    if (preset === '12M') return months;
    const mois = new Date().getMonth();
    if (preset === '6M') return Array.from({length: 6}, (_, i) => months[(mois - 5 + i + 12) % 12]);
    if (preset === 'YTD') return months.slice(0, mois + 1); // mois 0..currentMonth = depuis new Date(year,0,1)
    return months;
  }
  window._getFilteredMonths = _getFilteredMonths;

  function setPeriodePreset(val) {
    _S._globalPeriodePreset = val || '12M';
    const note = document.getElementById('saisonPeriodeNote');
    if (note) note.classList.toggle('hidden', _S._globalPeriodePreset === '12M');
    renderSaisonWidget();
  }
  window.setPeriodePreset = setPeriodePreset;

  function _getSaisonCandidats() {
    const mois = new Date().getMonth();
    const candidats = [];
    for (const r of DataStore.finalData) {
      if (r.nouveauMin <= 0 || r.W < 1 || r.isParent) continue;
      const coeff = _S.seasonalIndex[r.famille]?.[mois];
      // Seulement les mois à forte saisonnalité (coeff > 1) — évite le bruit en basse saison
      if (!coeff || coeff <= 1.05) continue;
      let saisonMin = Math.ceil(r.nouveauMin * coeff);
      // Plafonnement articles chers — évite recommandations absurdes (8 Kärcher à 300€)
      const px=r.prixUnitaire||0;
      if(px>HIGH_PRICE){saisonMin=Math.min(saisonMin,Math.max(r.stockActuel+1,2));}
      else if(px>50){saisonMin=Math.min(saisonMin,Math.max(Math.ceil(r.nouveauMin*1.5),3));}
      if (r.stockActuel < saisonMin) {
        const qteCde = saisonMin - r.stockActuel;
        candidats.push({
          code: r.code, libelle: r.libelle, famille: r.famille,
          nouveauMin: r.nouveauMin, saisonMin,
          stockActuel: r.stockActuel, coeff, prixUnitaire: px,
          qteCde, vaEuro: qteCde * px,
        });
      }
    }
    candidats.sort((a, b) => b.vaEuro - a.vaEuro);
    return candidats;
  }

  function renderSaisonWidget() {
    const el = document.getElementById('saisonWidget');
    if (!el) return;
    const hasColis = (_S.cockpitLists?.colisrayon?.size || 0) > 0;
    const hasSeason = Object.keys(_S.seasonalIndex).length > 0;
    if (!hasSeason && !hasColis) { el.classList.add('hidden'); return; }

    const mois = new Date().getMonth();
    const nomsMois = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];
    const moisLbl = document.getElementById('saisonMoisLabel');
    if (moisLbl) moisLbl.textContent = nomsMois[mois];

    const candidats = hasSeason ? _getSaisonCandidats() : [];
    const badge = document.getElementById('badgeSaison');
    if (badge) badge.textContent = candidats.length;
    // Sprint 2: chip saisonnalité dans Mon Stock
    const chipSaison = document.getElementById('dashChipSaison');
    if (chipSaison) chipSaison.textContent = candidats.length > 0 ? candidats.length : '0';
    {const chipSaisonCont=document.getElementById('chipSaison');if(chipSaisonCont)chipSaisonCont.title=candidats.length>0?`${candidats.length} articles sous seuil saisonnier ce mois de ${nomsMois[mois]}`:'Aucun article sous seuil ce mois';}
    el.classList.remove('hidden');
    // Section articles saisonniers — masquée si aucun candidat
    const artSection = document.getElementById('saisonArtSection');
    if (artSection) artSection.classList.toggle('hidden', candidats.length === 0);

    const tbody = document.getElementById('saisonTableBody');
    if (!tbody) return;
    if (candidats.length === 0) {
      return;
    }
    tbody.innerHTML = candidats.slice(0, 30).map(r => {
      const coeffPct = '+' + Math.round((r.coeff - 1) * 100) + '%';
      return `<tr class="hover:bg-amber-50 text-xs">
        <td class="py-2 px-2 font-mono text-[11px]">${escapeHtml(r.code)}</td>
        <td class="py-2 px-2 truncate max-w-[180px]" title="${escapeHtml(r.libelle)}">${escapeHtml(r.libelle)}</td>
        <td class="py-2 px-2 text-center t-secondary">${r.stockActuel}</td>
        <td class="py-2 px-2 text-center font-bold text-amber-700">${r.saisonMin} <span class="text-[9px] font-normal text-amber-500">(${coeffPct})</span></td>
        <td class="py-2 px-2 text-center font-bold text-amber-600">+${r.qteCde}</td>
        <td class="py-2 px-2 text-right font-bold">${r.vaEuro > 0 ? formatEuro(r.vaEuro) : '—'}</td>
      </tr>`;
    }).join('');
  }

  function exportSaisonCSV() {
    if (!Object.keys(_S.seasonalIndex).length) return;
    const mois = new Date().getMonth();
    const nomsMois = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];
    const candidats = _getSaisonCandidats();
    if (!candidats.length) { showToast('Aucun article à exporter', 'info'); return; }
    const SEP = ';';
    const header = ['Code','Libellé','Famille','Stock actuel','MIN annuel','Seuil saisonnier','Coefficient','À commander','Valeur estimée (€)'];
    const rows = candidats.map(r => [
      r.code, `"${r.libelle.replace(/"/g, '""')}"`, `"${r.famille}"`,
      r.stockActuel, r.nouveauMin, r.saisonMin,
      r.coeff.toFixed(2), r.qteCde,
      r.vaEuro.toFixed(2).replace('.', ','),
    ]);
    const csv = '\uFEFF' + [header, ...rows].map(r => r.join(SEP)).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `PRISME_Saison_${nomsMois[mois]}_${_S.selectedMyStore || 'agence'}_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(link.href);
  }

  // ── Performance par emplacement ──
  function renderPerfEmplacement(){
    const el=document.getElementById('perfEmplacementBlock');if(!el)return;
    const data=DataStore.finalData;if(!data.length){el.classList.add('hidden');return;}
    const map={};
    for(const r of data){
      const emp=r.emplacement||'(vide)';
      if(!map[emp])map[emp]={ca:0,valStock:0,nbRef:0,clients:new Set(),sumW:0};
      const e=map[emp];e.ca+=(r.caAnnuel||0);e.valStock+=(r.valeurStock||0);e.nbRef++;e.sumW+=(r.W||0);
      const buyers=_S.articleClients?.get(r.code);if(buyers)for(const cc of buyers)e.clients.add(cc);
    }
    const rows=Object.entries(map).map(([emp,e])=>({emp,ca:e.ca,valStock:e.valStock,nbRef:e.nbRef,nbClients:e.clients.size,rotMoy:e.nbRef>0?e.sumW/e.nbRef:0,rendement:e.valStock>0?e.ca/e.valStock:0}));
    if(!rows.length){el.classList.add('hidden');return;}
    el.classList.remove('hidden');
    _S._perfEmpData=rows;_S._perfEmpSort={col:'ca',asc:false};
    _renderPerfEmpTable();
  }
  function _renderPerfEmpTable(){
    const el=document.getElementById('perfEmplacementBlock');if(!el)return;
    const rows=_S._perfEmpData;if(!rows||!rows.length)return;
    const {col,asc}=_S._perfEmpSort||{col:'ca',asc:false};
    const sorted=[...rows].sort((a,b)=>{const va=a[col],vb=b[col];if(typeof va==='string')return asc?va.localeCompare(vb):vb.localeCompare(va);return asc?va-vb:vb-va;});
    const arrow=(c)=>col===c?(asc?'▲':'▼'):'';
    const th=(label,key,align)=>`<th class="py-2 px-3 ${align} text-[10px] cursor-pointer select-none hover:c-action" onclick="_sortPerfEmp('${key}')">${label} ${arrow(key)}</th>`;
    let html=`<div class="s-card p-5 rounded-xl shadow-md border">
      <h3 class="font-bold mb-4 border-b pb-2 flex items-center gap-2">📍 Performance par emplacement <span class="text-[10px] t-disabled font-normal">${sorted.length} emplacements</span></h3>
      <div class="list-scroll" style="max-height:400px"><table class="min-w-full text-xs">
      <thead class="s-card-alt t-tertiary uppercase sticky top-0"><tr>
        ${th('Emplacement','emp','text-left')}${th('CA','ca','text-right')}${th('Val. stock','valStock','text-right')}${th('Réf.','nbRef','text-center')}${th('Clients','nbClients','text-center')}${th('Rotation','rotMoy','text-center')}${th('Rendement','rendement','text-center')}
      </tr></thead><tbody class="divide-y font-semibold">`;
    for(const r of sorted){
      const rdCol=r.rendement>=2?'c-ok':r.rendement>=1?'c-caution':'c-danger';
      const rdFmt=r.rendement>=10?r.rendement.toFixed(0)+'×':r.rendement.toFixed(1)+'×';
      html+=`<tr class="hover:i-info-bg cursor-pointer" onclick="_filterByEmplacement('${escapeHtml(r.emp)}')">
        <td class="py-2 px-3 font-semibold">${escapeHtml(r.emp)}</td>
        <td class="py-2 px-3 text-right">${r.ca>0?formatEuro(r.ca):'—'}</td>
        <td class="py-2 px-3 text-right t-secondary">${r.valStock>0?formatEuro(r.valStock):'—'}</td>
        <td class="py-2 px-3 text-center">${r.nbRef}</td>
        <td class="py-2 px-3 text-center">${r.nbClients||'—'}</td>
        <td class="py-2 px-3 text-center t-secondary">${r.rotMoy.toFixed(1)}</td>
        <td class="py-2 px-3 text-center font-bold ${rdCol}">${rdFmt}</td>
      </tr>`;
    }
    html+=`</tbody></table></div></div>`;
    el.innerHTML=html;
  }
  window._sortPerfEmp=function(col){
    if(!_S._perfEmpSort)return;
    if(_S._perfEmpSort.col===col)_S._perfEmpSort.asc=!_S._perfEmpSort.asc;
    else{_S._perfEmpSort.col=col;_S._perfEmpSort.asc=col==='emp';}
    _renderPerfEmpTable();
  };
  window._filterByEmplacement=function(emp){
    const sel=document.getElementById('filterEmplacement');
    if(sel){sel.value=emp==='(vide)'?'':emp;onFilterChange();switchTab('table');}
  };

  function renderCockpitEquation(){
    const el=document.getElementById('cockpitEquation');if(!el)return;
    const canal=_S._globalCanal||'';
    const CANAL_ICONS={MAGASIN:'🏪',INTERNET:'🌐',REPRESENTANT:'🤝',DCS:'📦'};
    const CANAL_LABELS={MAGASIN:'Magasin',INTERNET:'Internet',REPRESENTANT:'Représentant',DCS:'DCS'};
    let nbClients=0,ca=0,nbBL=0,canalLabel='tous canaux',canalIcon='📊';
    if(!canal){
      // Tous canaux — somme de tous les canaux
      for(const c of Object.values(_S.canalAgence||{})){ca+=c.ca||0;nbBL+=c.bl||0;}
      // Clients distincts tous canaux = union de clientLastOrderByCanal keys + clientsMagasin
      const allClients=new Set(_S.clientsMagasin||[]);
      if(_S.clientLastOrderByCanal)for(const[cc,cMap]of _S.clientLastOrderByCanal)if(cMap.size>0)allClients.add(cc);
      nbClients=allClients.size;
    }else{
      // Canal spécifique
      const cData=_S.canalAgence?.[canal];
      ca=cData?.ca||0;nbBL=cData?.bl||0;
      canalLabel=CANAL_LABELS[canal]||canal;canalIcon=CANAL_ICONS[canal]||'📊';
      if(canal==='MAGASIN'){nbClients=_S.ventesClientArticle.size;}
      else{
        let cnt=0;if(_S.clientLastOrderByCanal)for(const[,cMap]of _S.clientLastOrderByCanal)if(cMap.has(canal))cnt++;
        nbClients=cnt;
      }
    }
    if(!nbClients&&!ca){el.classList.add('hidden');return;}
    el.classList.remove('hidden');
    const freq=nbClients>0?(nbBL/nbClients).toFixed(1):'—';
    const caClient=nbClients>0?Math.round(ca/nbClients):0;
    const txMarge=_S.ventesAnalysis?.txMarge;const vmc=_S.ventesAnalysis?.vmc;
    const extraParts=[];if(txMarge>0)extraParts.push(`Tx\u00a0marge\u00a0: <strong>${txMarge.toFixed(2)}%</strong>`);if(vmc>0)extraParts.push(`VMC\u00a0: <strong>${Math.round(vmc).toLocaleString('fr')}\u00a0€</strong>`);
    const pS=_S.periodFilterStart||_S.consommePeriodMin;const pE=_S.periodFilterEnd||_S.consommePeriodMax;
    const periodStr=(pS&&pE)?((pS.getMonth()===pE.getMonth()&&pS.getFullYear()===pE.getFullYear())?fmtDate(pS):`${fmtDate(pS)} → ${fmtDate(pE)}`):'';
    const caLabel=canal?`💰 CA ${canalLabel}`:'💰 CA Total';
    el.innerHTML=`<div class="flex items-center justify-center gap-3 py-3 s-card rounded-xl border shadow-sm flex-wrap">
      <div class="text-center px-4 py-2 s-card-alt rounded-lg">
        <p class="text-[10px] font-bold t-tertiary uppercase">${canalIcon} Clients ${canalLabel}</p>
        <p class="text-xl font-extrabold t-primary">${nbClients.toLocaleString('fr')}</p>
      </div>
      <span class="text-2xl t-disabled font-light">×</span>
      <div class="flex items-center gap-2 px-4 py-2 s-card-alt rounded-lg">
        <div class="text-center"><p class="text-[10px] font-bold t-tertiary uppercase">📊 Passages/client</p><p class="text-xl font-extrabold t-primary">${freq}</p></div>
        <span class="text-lg t-disabled">×</span>
        <div class="text-center"><p class="text-[10px] font-bold t-tertiary uppercase">🛒 CA / client</p><p class="text-xl font-extrabold t-primary">${caClient>0?caClient.toLocaleString('fr')+' €':'—'}</p></div>
      </div>
      <span class="text-2xl t-disabled font-light">=</span>
      <div class="text-center px-4 py-2 i-info-bg rounded-lg b-light">
        <p class="text-[10px] font-bold c-action uppercase">${caLabel}</p>
        <p class="text-xl font-extrabold c-action">${ca>0?formatEuro(ca):'—'}</p>
      </div>
    </div>
    ${extraParts.length?`<p class="text-[11px] t-tertiary text-center mt-0.5">${extraParts.join('\u00a0\u00a0·\u00a0\u00a0')}</p>`:''}
    <p class="text-[10px] t-disabled text-center mt-1">Source : Consommé ${canal?'canal '+canalLabel:'tous canaux'}${periodStr?' · '+periodStr:''}</p>`;
  }

  function renderDashboardAndCockpit(){
    if(!_S._hasStock){
      const el=document.getElementById('tabDash');
      if(el){
        let slot=document.getElementById('dashNoStockSlot');
        if(!slot){slot=document.createElement('div');slot.id='dashNoStockSlot';el.prepend(slot);}
        slot.innerHTML=_renderNoStockPlaceholder('Mon Stock');
        slot.style.display='';
        [...el.children].forEach(c=>{if(c.id!=='dashNoStockSlot')c.style.display='none';});
      }
      // Sans stock — rendu minimal
      renderHealthScore();
      renderIRABanner();
      renderTabBadges();
      return;
    }
    const _noStockSlot=document.getElementById('dashNoStockSlot');
    if(_noStockSlot){_noStockSlot.style.display='none';[..._noStockSlot.parentElement.children].forEach(c=>c.style.display='');}
    let totalValue=0,totalArt=0,dormantStock=0,activeSurstock=0,capalinOverflow=0,capalinCount=0,serviceOk=0,serviceTotal=0,totalCAPerdu=0;const byStatus={},byFamily={};const ageBuckets={fresh:{val:0,count:0},warm:{val:0,count:0},hot:{val:0,count:0},critical:{val:0,count:0}};
    const lstR=[],lstFa=[],lstA=[],lstS=[],lstD=[],lstFi=[],lstB=[],lstN=[],lstColis=[],lstStockNeg=[];const finCodes=new Set();
    _S.cockpitLists={ruptures:new Set(),fantomes:new Set(),sansemplacement:new Set(),anomalies:new Set(),saso:new Set(),dormants:new Set(),fins:new Set(),top20:new Set(),nouveautes:new Set(),colisrayon:new Set(),stockneg:new Set(),fragiles:new Set(),phantom:new Set()};
    _S.parentRefsExcluded=0;
    // [Adapter Étape 5] — DataStore.finalData / .filteredData : canaux-invariants
    const dataSource=(DataStore.filteredData.length>0&&DataStore.filteredData.length<DataStore.finalData.length)?DataStore.filteredData:DataStore.finalData;
    // CA perdu — contexte multi vs mono agence
    const hasMulti=_S.storesIntersection.size>1;
    const medianCAByCode={};
    if(hasMulti&&_S.selectedMyStore){const cs=[..._S.storesIntersection];const myV=_S.ventesParMagasin[_S.selectedMyStore]||{};for(const code of Object.keys(myV)){const cas=cs.map(s=>_S.ventesParMagasin[s]?.[code]?.sumCA||0).filter(v=>v>0);if(cas.length>0)medianCAByCode[code]=_median(cas);}}

    for(const r of dataSource){const lv=r.valeurStock!=null?r.valeurStock:r.stockActuel*(r.prixUnitaire||0);totalValue+=lv;
    if(r.W>=3&&!r.isParent&&!(r.V===0&&r.enleveTotal>0)){serviceTotal++;if(r.stockActuel>0)serviceOk++;}

    // ★ V23: Ruptures — exclude parent refs (no dates) + colis-only (enlevé sans prélevé) + sort by CA potentiel
    if(r.W>=3&&r.stockActuel<=0){
      if(!r.isParent&&!(r.V===0&&r.enleveTotal>0)){ // skip parent refs & colis-only
        const caPotentiel=Math.round(r.W*r.prixUnitaire);
        const prioScore=calcPriorityScore(r.W,r.prixUnitaire,r.ageJours);
        // CA perdu : médiane réseau par article (multi) ou CA historique période (mono)
        const joursRupture=Math.min(r.ageJours>=999?90:r.ageJours,90);
        const caPerdu=hasMulti?Math.round(medianCAByCode[r.code]||0):Math.round(r.V*r.prixUnitaire);
        if(caPerdu>0)totalCAPerdu+=caPerdu;
        lstR.push({code:r.code,lib:r.libelle,fmrClass:r.fmrClass,i1:r.W,i2:r.stockActuel,sv:caPotentiel,caPot:caPotentiel,prioScore,joursRupture,caPerdu,condit:null,stockActuel:r.stockActuel,ancienMin:r.ancienMin,ancienMax:r.ancienMax,nouveauMin:r.nouveauMin,nouveauMax:r.nouveauMax,ageJours:r.ageJours});
        _S.cockpitLists.ruptures.add(r.code);
      } else {
        _S.parentRefsExcluded++;
      }
    }

    if(r.stockActuel>0&&r.emplacement===''){lstFa.push({code:r.code,lib:r.libelle,i1:r.stockActuel,i2:formatEuro(lv),sv:lv,condit:null});_S.cockpitLists.fantomes.add(r.code);_S.cockpitLists.sansemplacement.add(r.code);}
    if(r.stockActuel>0&&r.ancienMin===0&&r.ancienMax===0&&!r.isNouveaute&&r.V>0){lstA.push({code:r.code,lib:r.libelle,i1:r.stockActuel,i2:formatEuro(lv),sv:lv,condit:null});_S.cockpitLists.anomalies.add(r.code);}
    if(r.W>0)lstB.push({code:r.code,lib:r.libelle,i1:r.W,i2:r.stockActuel,sv:r.W,condit:null});
    if(r.isNouveaute&&r.stockActuel>0)lstN.push({code:r.code,lib:r.libelle,i1:r.stockActuel,i2:formatEuro(lv),sv:lv,condit:null});
    if(r.enleveTotal>=5&&r.V===0)lstColis.push({code:r.code,lib:r.libelle,i1:r.enleveTotal,i2:r.stockActuel,sv:r.enleveTotal,condit:null});
    if(r.stockActuel<0){lstStockNeg.push({code:r.code,lib:r.libelle,i1:r.stockActuel,i2:formatEuro(lv),sv:lv,condit:null});_S.cockpitLists.stockneg.add(r.code);}
    if(r.stockActuel>0&&r.prixUnitaire>0){totalArt++;byStatus[r.statut]=(byStatus[r.statut]||0)+lv;const _fLib=famLib(r.famille);byFamily[_fLib]=(byFamily[_fLib]||0)+lv;const isDormant=!r.isNouveaute&&r.ageJours>DORMANT_DAYS;const sl=r.statut.toLowerCase();const isFS=sl.includes('fin de série')||sl.includes('fin de serie');const iFSt=sl.includes('fin de stock');const isFin=isFS||iFSt;
    if(!r.isNouveaute&&r.ageJours>DORMANT_DAYS){dormantStock+=lv;if(lv>50){lstD.push({code:r.code,lib:r.libelle,i1:r.stockActuel,i2:formatEuro(lv),sv:lv,condit:null});_S.cockpitLists.dormants.add(r.code);}}
    if(!isDormant&&!isFin&&!r.isNouveaute&&r.stockActuel>r.nouveauMax&&r.nouveauMax>0)activeSurstock+=(r.stockActuel-r.nouveauMax)*r.prixUnitaire;
    if(r.ancienMax>0&&r.stockActuel>r.ancienMax){const exc=r.stockActuel-r.ancienMax,vs=exc*r.prixUnitaire;capalinOverflow+=vs;capalinCount++;lstS.push({code:r.code,lib:r.libelle,i1:exc,i2:formatEuro(vs),sv:vs,condit:null});_S.cockpitLists.saso.add(r.code);}
    const br=(r.isNouveaute&&r.ageJours>DORMANT_DAYS)?'fresh':getAgeBracket(r.ageJours);ageBuckets[br].val+=lv;ageBuckets[br].count++;
    if(isFin&&!finCodes.has(r.code)){finCodes.add(r.code);lstFi.push({code:r.code,lib:r.libelle,i1:r.stockActuel,i2:formatEuro(lv),sv:lv,condit:null});_S.cockpitLists.fins.add(r.code);}}
    // Fins de stock avec min=0/max=0 (déréférencés sans prix) — hors du garde prixUnitaire>0
    if(r.stockActuel>0&&!finCodes.has(r.code)){const _sl=r.statut.toLowerCase();if(_sl.includes('fin de stock')||_sl.includes('fin de série')||_sl.includes('fin de serie')){finCodes.add(r.code);lstFi.push({code:r.code,lib:r.libelle,i1:r.stockActuel,i2:formatEuro(lv),sv:lv,condit:null});_S.cockpitLists.fins.add(r.code);}}}

    document.getElementById('dashTotalValue').textContent=formatEuro(totalValue);document.getElementById('dashTotalCount').textContent=dataSource.length.toLocaleString('fr')+' réf.';
    document.getElementById('dashDeadStock').textContent=formatEuro(dormantStock);document.getElementById('dashDeadPct').textContent=pct(dormantStock,totalValue);
    document.getElementById('dashSurstock').textContent=formatEuro(activeSurstock);document.getElementById('dashSurstockPct').textContent=pct(activeSurstock,totalValue);
    document.getElementById('dashCapalin').textContent=formatEuro(capalinOverflow);document.getElementById('dashCapalinCount').textContent=capalinCount+' art.';
    const sr=serviceTotal>0?((serviceOk/serviceTotal)*100).toFixed(1):0;document.getElementById('dashServiceRate').textContent=sr+'%';document.getElementById('dashServiceDetail').textContent=`${serviceOk}/${serviceTotal} fréquentes en stock`;
    document.getElementById('dashCAPerdu').textContent=formatEuro(totalCAPerdu);document.getElementById('dashCAPerduCount').textContent=lstR.length+' art. en rupture';
    renderComparison({date:new Date().toLocaleDateString('fr-FR'),totalValue,dormant:dormantStock,surstock:activeSurstock,ruptures:lstR.length,serviceRate:parseFloat(sr),capalin:capalinOverflow,caPerdu:totalCAPerdu});
    let p;p=[];Object.keys(byStatus).sort((a,b)=>byStatus[b]-byStatus[a]).forEach(s=>{p.push(`<tr class="hover:s-card-alt"><td class="py-2">${escapeHtml(s)}</td><td class="py-2 text-right c-action font-bold">${formatEuro(byStatus[s])}</td></tr>`);});document.getElementById('dashStatusTable').innerHTML=p.join('');
    p=[];Object.keys(byFamily).sort((a,b)=>byFamily[b]-byFamily[a]).slice(0,10).forEach(f=>{const fEsc=escapeHtml(f);p.push(`<tr class="hover:s-card-alt"><td class="py-2 truncate max-w-[160px]" title="${fEsc}">${fEsc}</td><td class="py-2 text-right c-caution font-bold">${formatEuro(byFamily[f])}</td><td class="py-2 text-center"><button class="diag-btn i-info-bg c-action" data-fam="${fEsc}" onclick="openDiagnostic(this.dataset.fam,'stock')">🔍</button></td></tr>`);});document.getElementById('dashFamilyTable').innerHTML=p.join('');
    p=[];for(const[k,br] of Object.entries(AGE_BRACKETS)){const d=ageBuckets[k];p.push(`<tr class="age-row-clickable ${k==='critical'?br.bg:'hover:s-card-alt'}" onclick="filterByAge('${k}')"><td class="py-2.5 px-3 ${br.color} font-bold text-sm">${br.label}</td><td class="py-2.5 px-3 text-right font-bold">${formatEuro(d.val)}</td><td class="py-2.5 px-3 text-right t-tertiary text-xs">${d.count}</td></tr>`);}document.getElementById('dashAgeTable').innerHTML=p.join('');

    const sB=(id,n)=>{const el=document.getElementById(id);if(el)el.textContent=n>0?n:'0';};
    sB('badgeRuptures',lstR.length);sB('badgeAnomalies',lstA.length);sB('badgeUrgTotal',lstR.length+lstA.length);sB('badgeSaso',lstS.length);sB('badgeColisRayon',lstColis.length);
    // Tooltips sections badges
    {const _bT=(id,t)=>{const e=document.getElementById(id);if(e)e.title=t;};
    _bT('badgeUrgTotal',`${lstR.length} article${lstR.length!==1?'s':''} en rupture stock zéro + ${lstA.length} article${lstA.length!==1?'s':''} actif${lstA.length!==1?'s':''} sans paramétrage MIN/MAX ERP`);}
    // Sprint 2: chips Mon Stock V2
    sB('dashChipRuptures',lstR.length);sB('dashChipDormants',lstD.length);sB('dashChipAnomalies',lstA.length);sB('dashChipStockneg',lstStockNeg.length);
    {const dh=document.getElementById('dashDispoHero');if(dh){dh.textContent=`✅ Dispo. ${sr}%`;dh.title=`${serviceOk}/${serviceTotal} articles F+M en stock`;}}
    // Tooltips dynamiques chips
    {const _setT=(id,t)=>{const e=document.getElementById(id);if(e)e.title=t;};
    const _crit=lstR.filter(r=>r.prioScore>=70).length;
    const _snVal=Math.abs(lstStockNeg.reduce((s,i)=>s+i.sv,0));
    _setT('chipRuptures',lstR.length>0?`${lstR.length} article${lstR.length!==1?'s':''} en rupture${_crit>0?` dont ${_crit} critique${_crit!==1?'s':''}`:''} — cliquez pour voir`:'Aucune rupture');
    _setT('chipDormants',`${lstD.length} article${lstD.length!==1?'s':''} dormant${lstD.length!==1?'s':''} — ${formatEuro(dormantStock)} immobilisé${dormantStock>1?'s':''} (>50€ unitaire)`);
    _setT('chipAnomalies',`${lstA.length} article${lstA.length!==1?'s':''} actif${lstA.length!==1?'s':''} sans MIN ou MAX ERP`);
    _setT('chipStockneg',lstStockNeg.length>0?`${lstStockNeg.length} article${lstStockNeg.length!==1?'s':''} en stock négatif — ${formatEuro(_snVal)} de valeur négative`:'Aucun stock négatif');
    const _faVal=lstFa.reduce((s,i)=>s+i.sv,0);const _fiVal=lstFi.reduce((s,i)=>s+i.sv,0);
    sB('dashChipSansEmplacement',lstFa.length);_setT('chipSansEmplacement',lstFa.length>0?`${lstFa.length} article${lstFa.length!==1?'s':''} actif${lstFa.length!==1?'s':''} sans emplacement rayon — ${formatEuro(_faVal)} de valeur`:'Aucun article sans emplacement');
    sB('dashChipFins',lstFi.length);_setT('chipFins',lstFi.length>0?`${lstFi.length} article${lstFi.length!==1?'s':''} fins de série — ${formatEuro(_fiVal)} de valeur résiduelle`:'Aucun article fin de série');
    const _sasoVal=lstS.reduce((s,i)=>s+i.sv,0);sB('dashChipSaso',lstS.length);_setT('chipSaso',lstS.length>0?`${lstS.length} article${lstS.length!==1?'s':''} en excédent par rapport au MAX ERP — ${formatEuro(_sasoVal)} à solder`:'Aucun excédent ERP');}
    // V24.3: populate new _S.cockpitLists
    lstB.sort((a,b)=>b.sv-a.sv).slice(0,20).forEach(i=>_S.cockpitLists.top20.add(i.code));
    lstN.forEach(i=>_S.cockpitLists.nouveautes.add(i.code));
    lstColis.forEach(i=>_S.cockpitLists.colisrayon.add(i.code));
    // V24.3: update Stock tab shortcuts
    const scFaVal=lstFa.reduce((s,i)=>s+i.sv,0),scDVal=lstD.reduce((s,i)=>s+i.sv,0),scFiVal=lstFi.reduce((s,i)=>s+i.sv,0);
    const setSc=(id,v)=>{const el=document.getElementById(id);if(el)el.textContent=v;};
    setSc('scFantomesCount',lstFa.length);setSc('scFantomesVal',scFaVal>0?formatEuro(scFaVal):'—');
    setSc('scDormantsCount',lstD.length);setSc('scDormantsVal',scDVal>0?formatEuro(scDVal):'—');
    setSc('scFinsCount',lstFi.length);setSc('scFinsVal',scFiVal>0?formatEuro(scFiVal):'—');
    const scSnVal=Math.abs(lstStockNeg.reduce((s,i)=>s+i.sv,0));setSc('scStocknegCount',lstStockNeg.length);setSc('scStocknegVal',scSnVal>0?formatEuro(scSnVal):'—');
    // A4: update phantom shortcut counter
    {const phantomEl=document.getElementById('shortcutPhantomCount');if(phantomEl&&_S.phantomArticles.length>0){phantomEl.textContent=_S.phantomArticles.length+' art. · '+formatEuro(_S.phantomArticles.reduce((s,r)=>s+r.stockActuel*r.prixUnitaire,0));}}

    // ★ V23/V24.2: Ruptures sorted by CA potentiel
    lstR.sort((a,b)=>b.sv-a.sv);;

    // Other lists — no condit badges (V23: removed C24/B100 badges)
    function pL(l,id,lim=50){const el=document.getElementById(id);if(!el)return;const sorted=l.sort((a,b)=>b.sv-a.sv).slice(0,lim);const p=[];sorted.forEach(i=>{p.push(`<tr class="border-b hover:s-card/60"><td class="py-2 px-2 text-[11px] font-semibold"><div class="flex items-center gap-0.5"><span class="font-mono t-tertiary text-[10px]">${i.code}</span>${_copyCodeBtn(i.code)}</div><span class="leading-tight" title="${i.lib}">${i.lib}</span></td><td class="py-2 px-2 text-center font-bold text-xs">${i.i1}</td><td class="py-2 px-2 text-right font-extrabold text-xs">${i.i2}</td></tr>`);});el.innerHTML=p.join('')||'<tr><td colspan="3" class="text-center py-4 t-disabled text-xs">🎉</td></tr>';if(sorted.length>1){const table=el.closest('table');if(table){let tf=table.querySelector('tfoot');if(!tf){tf=document.createElement('tfoot');table.appendChild(tf);}tf.innerHTML=`<tr><td colspan="3" class="py-1 px-2 text-right"><button onclick="event.stopPropagation();_copyAllCodesDirect(this,this.dataset.codes)" data-codes="${sorted.map(i=>i.code).join(',')}" class="text-[10px] t-disabled hover:t-primary s-card border b-default rounded px-1.5 py-0.5">📋 Copier ${sorted.length} codes</button></td></tr>`;}}}
    pL(lstFa,'actionFantomes');pL(lstA,'actionAnomalies');pL(lstS,'actionSaso');pL(lstD,'actionDormant');pL(lstFi,'actionFin');pL(lstB,'actionBestSellers',20);pL(lstN,'actionNouveaute');pL(lstStockNeg,'actionStockneg');
    // Custom renderer for Colis à stocker: stock=0 → 📦 Mettre en rayon, stock>0 → 👁️ Vérifier visibilité
    (function(){
      const el=document.getElementById('actionColisRayon');if(!el)return;
      const sorted=[...lstColis].sort((a,b)=>(a.i2>0?1:0)-(b.i2>0?1:0)||b.sv-a.sv).slice(0,50);
      const rows=sorted.map(i=>{
        const actionLbl=i.i2===0?'<span class="text-cyan-700 font-bold">📦 Mettre en rayon</span>':'<span class="c-caution font-bold">👁️ Vérifier visibilité</span>';
        return `<tr class="border-b hover:s-card/60"><td class="py-2 px-2 text-[11px] font-semibold"><div class="flex items-center gap-0.5"><span class="font-mono t-tertiary text-[10px]">${i.code}</span>${_copyCodeBtn(i.code)}</div><span class="leading-tight" title="${i.lib}">${i.lib}</span></td><td class="py-2 px-2 text-center font-bold text-xs">${i.i1}</td><td class="py-2 px-2 text-right font-extrabold text-xs">${i.i2}</td><td class="py-2 px-2 text-center text-[10px] whitespace-nowrap">${actionLbl}</td></tr>`;
      });
      el.innerHTML=rows.join('')||'<tr><td colspan="4" class="text-center py-4 t-disabled text-xs">🎉</td></tr>';
      if(sorted.length>1){const table=el.closest('table');if(table){let tf=table.querySelector('tfoot');if(!tf){tf=document.createElement('tfoot');table.appendChild(tf);}tf.innerHTML=`<tr><td colspan="4" class="py-1 px-2 text-right"><button onclick="event.stopPropagation();_copyAllCodesDirect(this,this.dataset.codes)" data-codes="${sorted.map(i=>i.code).join(',')}" class="text-[10px] t-disabled hover:t-primary s-card border b-default rounded px-1.5 py-0.5">📋 Copier ${sorted.length} codes</button></td></tr>`;}}
    })();

    renderCockpitEquation();
    // Feature D — Préconisation saisonnière (projection du mois courant, zéro structure _S)
    renderSaisonWidget();
    renderPerfEmplacement();
    // ★★★ V23/V24.2: RÉSUMÉ EXÉCUTIF ★★★
    if(dataSource===DataStore.finalData){_S._insights.ruptures=lstR.length;_S._insights.dormants=lstD.length;renderInsightsBanner();}
    // ★ SPRINT 1: Decision Queue + Briefing (absorbe le résumé exécutif) ★
    _S._briefingData={lstR,totalCAPerdu,dormantStock,capalinOverflow,sr,hasMulti,caComptoir:_S.canalAgence?.['MAGASIN']?.ca||0};
    generateDecisionQueue();
    renderHealthScore();
    renderIRABanner();
    renderTabBadges();
    renderCockpitRupClients();
  }

  function renderCockpitRupClients(){
    const el=document.getElementById('cockpitRupClients');if(!el)return;
    const ruptureArts=DataStore.finalData.filter(r=>r.stockActuel<=0&&r.W>=3&&!r.isParent&&!(r.V===0&&r.enleveTotal>0));
    const rupClients=[];
    if(ruptureArts.length){
      const clientRupMap=new Map();
      for(const art of ruptureArts){
        const buyers=_S.articleClients.get(art.code);if(!buyers)continue;
        for(const cc of buyers){
          const nom=_S.clientNomLookup[cc]||cc;
          const caArt=(DataStore.ventesClientArticle.get(cc)||new Map()).get(art.code);
          if(!clientRupMap.has(cc))clientRupMap.set(cc,{cc,nom,nbRup:0,caRup:0});
          const e=clientRupMap.get(cc);e.nbRup++;e.caRup+=(caArt?.sumCA||0);
        }
      }
      rupClients.push(...clientRupMap.values());
      rupClients.sort((a,b)=>b.caRup-a.caRup);
    }
    if(!rupClients.length){el.innerHTML='';return;}
    const rows=rupClients.slice(0,10).map(c=>`<tr class="border-t b-light"><td class="py-1 px-2 font-mono text-[10px] t-disabled">${c.cc}</td><td class="py-1 px-2 text-[11px] font-semibold">${c.nom}</td><td class="py-1 px-2 text-center font-bold c-danger text-[11px]">${c.nbRup}</td><td class="py-1 px-2 text-right text-[11px] ${c.caRup>0?'c-caution font-bold':'t-disabled'}">${c.caRup>0?formatEuro(c.caRup):'—'}</td></tr>`).join('');
    const _rupTable=`<div class="overflow-x-auto"><table class="min-w-full text-xs"><thead class="s-card-alt t-secondary font-bold text-[10px]"><tr><th class="py-1.5 px-2 text-left">Code</th><th class="py-1.5 px-2 text-left">Nom</th><th class="py-1.5 px-2 text-center">Articles en rupture</th><th class="py-1.5 px-2 text-right">CA impacté</th></tr></thead><tbody>${rows}</tbody></table>${rupClients.length>10?`<p class="text-[10px] t-disabled px-3 py-1.5">… et ${rupClients.length-10} autres</p>`:''}</div>`;
    el.innerHTML=`<details class="i-caution-bg rounded-xl border-t-4 border-orange-400 overflow-hidden"><summary class="flex items-center gap-2 p-3 border-b b-light cursor-pointer list-none"><span>🔴</span><h4 class="font-extrabold text-sm flex-1">Clients impactés par ruptures <span class="badge bg-orange-400 text-white ml-1">${rupClients.length}</span></h4><span class="text-[10px] t-disabled">▼</span></summary>${_rupTable}</details>`;
  }

  // ★ BADGES FILTRES ACTIFS
  function _renderActiveFilterBadges(){
    const container=document.getElementById('activeFilterBadges');
    if(!container)return;
    const badges=[];
    const search=(document.getElementById('searchInput')?.value||'').trim();
    if(search)badges.push({label:`"${search}"`,clear:()=>{document.getElementById('searchInput').value='';onFilterChange();}});
    const fam=document.getElementById('filterFamille')?.value||'';
    if(fam)badges.push({label:`Famille : ${famLabel?famLabel(fam):fam}`,clear:()=>{document.getElementById('filterFamille').value='';const sf=document.getElementById('filterSousFamille');if(sf)sf.value='';onFilterChange();}});
    const sFam=document.getElementById('filterSousFamille')?.value||'';
    if(sFam)badges.push({label:`S/Fam : ${sFam}`,clear:()=>{document.getElementById('filterSousFamille').value='';onFilterChange();}});
    const stat=document.getElementById('filterStatut')?.value||'';
    if(stat)badges.push({label:`Statut : ${stat}`,clear:()=>{document.getElementById('filterStatut').value='';onFilterChange();}});
    const abc=document.getElementById('filterABC')?.value||'';
    if(abc)badges.push({label:`ABC : ${abc}`,clear:()=>{document.getElementById('filterABC').value='';onFilterChange();}});
    const fmr=document.getElementById('filterFMR')?.value||'';
    if(fmr)badges.push({label:`FMR : ${fmr}`,clear:()=>{document.getElementById('filterFMR').value='';onFilterChange();}});
    const age=document.getElementById('filterAge')?.value||'';
    if(age&&AGE_BRACKETS[age])badges.push({label:`Âge : ${AGE_BRACKETS[age].label}`,clear:()=>{document.getElementById('filterAge').value='';updateActiveAgeIndicator();onFilterChange();}});
    const cockpit=document.getElementById('filterCockpit')?.value||'';
    if(cockpit)badges.push({label:document.getElementById('activeCockpitLabel')?.textContent||cockpit,clear:()=>clearCockpitFilter()});
    const emp=document.getElementById('filterEmplacement')?.value||'';
    if(emp)badges.push({label:`Empl : ${emp}`,clear:()=>{document.getElementById('filterEmplacement').value='';onFilterChange();}});
    if(!badges.length){container.innerHTML='';container.style.display='none';return;}
    container.style.display='flex';
    container.innerHTML=badges.map((b,i)=>
      `<span style="display:inline-flex;align-items:center;gap:4px;font-size:10px;padding:2px 8px;border-radius:20px;background:var(--i-info-bg);color:var(--c-action);border:1px solid var(--p-blue-300)">${escapeHtml(b.label)}<button onclick="_clearBadge(${i})" style="background:none;border:none;cursor:pointer;color:var(--c-action);font-size:12px;line-height:1;padding:0">×</button></span>`
    ).join('')+(badges.length>1?`<button onclick="resetFilters()" style="font-size:10px;padding:2px 8px;border-radius:20px;border:1px solid var(--b-default);background:none;color:var(--t-tertiary);cursor:pointer">Tout effacer</button>`:'');
    container._clearFns=badges.map(b=>b.clear);
  }
  window._clearBadge=function(i){const container=document.getElementById('activeFilterBadges');if(container?._clearFns?.[i])container._clearFns[i]();};

  // ★ TABLEAU
  function renderTable(pageOnly){
    if(!_S._hasStock){const el=document.getElementById('tabTable');if(el&&!pageOnly)el.innerHTML=_renderNoStockPlaceholder('Articles');return;}
    if(!pageOnly){
      _S.filteredData=getFilteredData(); // producteur — _S direct
      DataStore.filteredData.sort((a,b)=>{let vA=a[_S.sortCol],vB=b[_S.sortCol];if(typeof vA==='string')vA=vA.toLowerCase();if(typeof vB==='string')vB=vB.toLowerCase();if(vA<vB)return _S.sortAsc?-1:1;if(vA>vB)return _S.sortAsc?1:-1;return 0;});
      updateActiveAgeIndicator();
    }
    const tp=Math.max(1,Math.ceil(DataStore.filteredData.length/PAGE_SIZE));if(_S.currentPage>=tp)_S.currentPage=tp-1;const start=_S.currentPage*PAGE_SIZE,pd=DataStore.filteredData.slice(start,start+PAGE_SIZE);
    document.getElementById('resultCount').textContent=DataStore.filteredData.length.toLocaleString('fr')+' article'+(DataStore.filteredData.length>1?'s':'');const _rStart=start+1,_rEnd=Math.min(start+PAGE_SIZE,DataStore.filteredData.length);const _pageInfoEl=document.getElementById('pageInfo');if(_pageInfoEl){_pageInfoEl.innerHTML=`Articles ${_rStart}–${_rEnd} sur ${DataStore.filteredData.length.toLocaleString('fr')}&nbsp;·&nbsp; Page <input type="number" min="1" max="${tp}" value="${_S.currentPage+1}" style="width:36px;text-align:center;font-size:11px;padding:1px 4px;border:1px solid var(--b-default);border-radius:4px;background:var(--s-card);color:var(--t-primary)" onchange="_jumpToPage(this.value)" onclick="event.stopPropagation()"> / ${tp}`;}document.getElementById('btnPrev').disabled=_S.currentPage<=0;document.getElementById('btnNext').disabled=_S.currentPage>=tp-1;
    _renderActiveFilterBadges();
    const _totalCA=DataStore.filteredData.reduce((s,r)=>s+(r.caAnnuel||0),0);const _totalCAEl=document.getElementById('filteredCATotal');if(_totalCAEl){if(_totalCA>0){const _caStr=_totalCA>=1000?`${(_totalCA/1000).toFixed(0)}k€`:`${Math.round(_totalCA)}€`;_totalCAEl.textContent=`CA filtré : ${_caStr}`;_totalCAEl.classList.remove('hidden');}else{_totalCAEl.classList.add('hidden');}}
    const p=[];
    const showMed=_S.storesIntersection.size>1;
    {const _thMn=document.getElementById('thMedMin'),_thMx=document.getElementById('thMedMax');if(_thMn)_thMn.style.display=showMed?'':'none';if(_thMx)_thMx.style.display=showMed?'':'none';}
    for(const r of pd){
      const bg=r.isNouveaute?'i-ok-bg':(r.nouveauMin>0?'s-card':'s-card-alt t-disabled');
      const sc=(() => { if(r.nouveauMin===0&&r.nouveauMax===0)return 't-disabled'; if(r.stockActuel<0)return 'c-danger font-extrabold i-danger-bg'; if(r.stockActuel===0)return 'c-danger font-bold i-danger-bg'; if(r.stockActuel<=r.nouveauMin)return 'c-caution font-bold i-caution-bg'; if(r.stockActuel>r.nouveauMax)return 'c-info font-bold i-info-bg'; return 'c-ok font-bold i-ok-bg'; })();
      const br=getAgeBracket(r.ageJours);
      const _medMinCell=showMed?(r.medMinReseau!=null?`<td class="px-2 py-2 text-center text-xs ${r.nouveauMin>2*r.medMinReseau?'c-caution i-caution-bg font-bold':r.nouveauMin>r.medMinReseau?'c-caution font-semibold':'t-disabled'}" title="Méd. réseau MIN = ${Math.round(r.medMinReseau)}">${Math.round(r.medMinReseau)}</td>`:'<td class="px-2 py-2 text-center text-xs t-disabled">—</td>'):'';
      const _medMaxCell=showMed?(r.medMaxReseau!=null?`<td class="px-2 py-2 text-center text-xs ${r.nouveauMax>2*r.medMaxReseau?'c-caution i-caution-bg font-bold':r.nouveauMax>r.medMaxReseau?'c-caution font-semibold':'t-disabled'}" title="Méd. réseau MAX = ${Math.round(r.medMaxReseau)}">${Math.round(r.medMaxReseau)}</td>`:'<td class="px-2 py-2 text-center text-xs t-disabled">—</td>'):'';
      const caEst=r.caAnnuel>0?(r.caAnnuel>=1000?`${(r.caAnnuel/1000).toFixed(1)}k€`:`${r.caAnnuel}€`):'—';
      const ancStr=(r.ancienMin===0&&r.ancienMax===0)?`<span class="t-disabled" title="Pas de MIN/MAX dans l'ERP">—</span>`:(r.ancienMin>0&&r.ancienMax===0)?`<span class="c-caution" title="MAX absent — anomalie ERP">${r.ancienMin}/0</span>`:`${r.ancienMin}/${r.ancienMax}`;
    p.push(`<tr class="border-b hover:i-info-bg ${bg} cursor-pointer"
      onmouseup="(function(e){if(window.getSelection&&window.getSelection().toString().length>0)return;if(e.target.closest('button,a,input,select'))return;openArticlePanel('${r.code}','table');})(event)">
      <td class="px-2 py-2 font-mono text-xs whitespace-nowrap sticky left-0 bg-inherit z-[5]">${r.code}${_copyCodeBtn(r.code)}${r.isNouveaute?' ✨':''}</td>
      <td class="px-2 py-2 text-xs font-semibold max-w-[220px] sticky left-[80px] bg-inherit z-[5]"><div class="truncate" title="${escapeHtml(r.libelle)}">${escapeHtml(r.libelle)}</div></td>
      <td class="px-2 py-2 text-xs t-tertiary truncate max-w-[100px]" title="${escapeHtml(famLib(r.famille||''))}">${r.famille?escapeHtml(famLib(r.famille)):'—'}</td>
      <td class="px-2 py-2 text-center font-bold text-xs">${r.V}</td>
      <td class="px-2 py-2 text-center text-xs font-bold c-ok">${caEst}</td>
      <td class="px-2 py-2 text-center text-cyan-600 text-xs">${r.enleveTotal||0}</td>
      <td class="px-2 py-2 text-center c-action font-bold text-xs">${r.W}</td>
      <td class="px-2 py-2 text-center ${sc} text-xs">${r.stockActuel}</td>
      <td class="px-2 py-2 text-center text-xs ${couvColor(r.couvertureJours)}">${formatCouv(r.couvertureJours)}</td>
      <td class="px-2 py-2 text-center text-xs whitespace-nowrap"><span class="age-dot ${AGE_BRACKETS[br].dotClass}"></span>${getAgeLabel(r.ageJours)}</td>
      <td class="px-2 py-2 text-center text-xs t-disabled">${ancStr}</td>
      <td class="px-2 py-2 text-center font-extrabold c-action i-info-bg text-xs">${r.nouveauMin}</td>
      <td class="px-2 py-2 text-center font-extrabold c-action i-info-bg text-xs">${r.nouveauMax}</td>
      ${_medMinCell}${_medMaxCell}
      <td class="px-2 py-2 text-center font-extrabold text-xs ${r.abcClass==='A'?'c-ok i-ok-bg':r.abcClass==='B'?'c-action i-info-bg':r.abcClass==='C'?'c-caution i-caution-bg':'t-disabled'}">${r.abcClass||'—'}</td>
      <td class="px-2 py-2 text-center font-extrabold text-xs ${r.fmrClass==='F'?'c-ok i-ok-bg':r.fmrClass==='M'?'c-action i-info-bg':r.fmrClass==='R'?'c-danger i-danger-bg':'t-disabled'}">${r.fmrClass||'—'}</td>
      ${_S.chalandiseReady&&(r.caHorsMagasin||0)>=100&&(r.nbClientsWeb||0)>=2?`<td class="px-2 py-2 text-center text-[10px] text-violet-600 font-bold">${r.nbClientsWeb}c · ${r.caHorsMagasin>=1000?(r.caHorsMagasin/1000).toFixed(1)+'k€':Math.round(r.caHorsMagasin)+'€'}</td>`:`<td class="px-2 py-2 text-center t-disabled text-[10px]">—</td>`}
    </tr>`);}
    document.getElementById('tableBody').innerHTML=p.join('')||`<tr><td colspan="${14+(showMed?2:0)}" class="text-center py-8 t-tertiary">Aucun.</td></tr>`;
    if(document.getElementById('thCanalWeb')?.classList.contains('hidden')){document.querySelectorAll('#tableBody tr td:nth-last-child(1)').forEach(td=>td.classList.add('hidden'));}
  }

  function _jumpToPage(val){
    const tp=Math.max(1,Math.ceil(DataStore.filteredData.length/PAGE_SIZE));
    const page=parseInt(val);
    if(isNaN(page))return;
    _S.currentPage=Math.min(Math.max(0,page-1),tp-1);
    renderTable(true);
  }
  window._jumpToPage=_jumpToPage;

  // ★ V24: Render Radar (ABC/FMR matrix) tab — supports Famille/Emplacement filters
  function _radarFilteredData(){
    const fam=document.getElementById('filterFamille')?.value||'';
    const sFam=document.getElementById('filterSousFamille')?.value||'';
    const emp=document.getElementById('filterEmplacement')?.value||'';
    const stat=document.getElementById('filterStatut')?.value||'';
    const abc=document.getElementById('filterABC')?.value||'';
    const fmr=document.getElementById('filterFMR')?.value||'';
    let data=DataStore.finalData.filter(r=>r.W>=1);
    if(fam)data=data.filter(r=>r.famille===fam);
    if(sFam)data=data.filter(r=>r.sousFamille===sFam);
    if(emp)data=data.filter(r=>r.emplacement===emp);
    if(stat)data=data.filter(r=>r.statut===stat);
    if(abc)data=data.filter(r=>r.abcClass===abc);
    if(fmr)data=data.filter(r=>r.fmrClass===fmr);
    return data;
  }
  function renderABCTab(){
    // [Adapter Étape 5] — DataStore.finalData / .abcMatrixData : canaux-invariants
    if(!DataStore.finalData.length||!Object.keys(DataStore.abcMatrixData).length)return;
    const radarData=_radarFilteredData();
    const mx=_radarComputeMatrix(radarData);
    const globalFilters=[document.getElementById('filterFamille')?.value,document.getElementById('filterSousFamille')?.value,document.getElementById('filterEmplacement')?.value,document.getElementById('filterStatut')?.value,document.getElementById('filterABC')?.value,document.getElementById('filterFMR')?.value].filter(Boolean);
    const isFiltered=globalFilters.length>0;
    const badge=document.getElementById('radarFilterBadge');
    if(badge){if(isFiltered){badge.classList.remove('hidden');badge.textContent=`Périmètre filtré : ${globalFilters.join(' + ')} — ${radarData.length} articles`;}else badge.classList.add('hidden');}
    const CELL_BG={AF:'#166534',AM:'#15803d',AR:'#0f766e',BF:'#1d4ed8',BM:'#64748b',BR:'#a16207',CF:'#c2410c',CM:'#b91c1c',CR:'#7f1d1d'};
    const LABELS={AF:'🌟 Pépites',AM:'👁️ Surveiller',AR:'💰 Gros paniers',BF:'👍 Confort',BM:'➡️ Standard',BR:'❓ Questionner',CF:'🔁 Réguliers',CM:'📉 Réduire',CR:'❌ Déréférencer'};
    const RECOS={AF:'Pépites — ne jamais rompre, chaque rupture = 2j de CA perdus',AM:'Surveiller — réassort manuel si rupture',AR:'Gros paniers ponctuels — stock sécurité OK',BF:'Confort — bien géré',BM:'Standard',BR:'Questionner le MIN',CF:'Consommable fréquent — indispensable comptoir, vérifier MIN',CM:'Fréquence moyenne, petit prix — ajuster le MIN',CR:'Candidat déréférencement ou passage colis'};
    // Matrix table
    let html='<table class="w-full border-collapse" style="max-width:720px;margin:0 auto"><thead><tr>';
    html+='<th class="p-3 text-xs font-bold t-disabled text-center w-16"></th>';
    html+='<th class="p-3 text-sm font-extrabold text-center c-ok">F<br><span class="text-[10px] font-normal t-disabled">Fréquent ≥12</span></th>';
    html+='<th class="p-3 text-sm font-extrabold text-center c-action">M<br><span class="text-[10px] font-normal t-disabled">Moyen 4-11</span></th>';
    html+='<th class="p-3 text-sm font-extrabold text-center c-danger">R<br><span class="text-[10px] font-normal t-disabled">Rare ≤3</span></th>';
    html+='</tr></thead><tbody>';
    const rowLabels={A:'<div class="font-extrabold text-xl text-indigo-900">A</div><div class="text-[9px] t-tertiary font-semibold">Top 80%</div>',B:'<div class="font-extrabold text-xl text-indigo-600">B</div><div class="text-[9px] t-tertiary font-semibold">15%</div>',C:'<div class="font-extrabold text-xl text-indigo-400">C</div><div class="text-[9px] t-tertiary font-semibold">5%</div>'};
    for(const abc of['A','B','C']){
      html+=`<tr><td class="p-3 text-center">${rowLabels[abc]}</td>`;
      for(const fmr of['F','M','R']){
        const key=abc+fmr,d=mx[key]||{count:0,stockVal:0,pctTotal:0};
        const bg=CELL_BG[key];
        const diagBtn=d.count>0?`<button class="mt-2 text-[9px] font-bold px-2 py-0.5 rounded bg-black/30 text-white hover:bg-black/50 border border-white/30 transition-colors shadow-sm" onclick="event.stopPropagation();openDiagnosticCell('${abc}','${fmr}')" title="Diagnostic ${key} (${d.count} articles)">🔍 Diag.</button>`:'';
        html+=`<td class="p-2"><div class="abc-cell${abc==='A'?' abc-top':''}" style="background:${bg};color:#fff" onclick="filterByAbcFmr('${abc}','${fmr}')">
          <em class="info-tip" data-tip="${key} — ${RECOS[key]}" style="position:absolute;top:6px;right:6px;background:rgba(255,255,255,0.22);color:#fff;margin:0">ℹ</em>
          <div class="font-extrabold text-2xl">${d.count}</div>
          <div class="text-[10px] opacity-80">articles</div>
          <div class="font-bold text-sm mt-2">${formatEuro(d.stockVal)}</div>
          <div class="text-[10px] opacity-70 mt-0.5">${d.pctTotal.toFixed(1)}% du stock</div>
          <div class="mt-2 text-[9px] opacity-90 font-semibold uppercase tracking-wide">${key}</div>
          ${diagBtn}
        </div></td>`;
      }
      html+='</tr>';
    }
    html+='</tbody></table>';
    html+='<p class="text-center text-[10px] t-disabled mt-3">Cliquer sur une case → filtre l\'onglet Articles · Survoler → recommandation</p>';
    const mc=document.getElementById('abcMatrixContainer');if(mc)mc.innerHTML=html;
    // Legend grid
    let leg='<div class="p-4 s-card-alt rounded-xl border"><h4 class="font-bold text-sm t-primary mb-3 flex items-center gap-2">💡 Recommandations par segment <span class="text-[10px] font-normal t-disabled">— cliquer sur un segment pour filtrer</span></h4>';
    leg+='<div class="grid grid-cols-1 sm:grid-cols-3 gap-2">';
    for(const key of['AF','AM','AR','BF','BM','BR','CF','CM','CR']){
      const d=mx[key]||{count:0,stockVal:0};const bg=CELL_BG[key];
      leg+=`<div class="flex items-start gap-2 p-3 rounded-lg s-card border shadow-sm cursor-pointer hover:shadow-md transition-shadow" onclick="filterByAbcFmr('${key[0]}','${key[1]}')">
        <div class="w-7 h-7 rounded-lg flex-shrink-0 flex items-center justify-center font-extrabold text-[11px] text-white" style="background:${bg}">${key}</div>
        <div class="min-w-0"><div class="text-xs font-bold t-primary">${LABELS[key]}</div><div class="text-[10px] t-tertiary mt-0.5">${RECOS[key]}</div><div class="text-[10px] text-indigo-600 font-bold mt-1">${d.count} art. · ${formatEuro(d.stockVal)}</div></div>
      </div>`;
    }
    leg+='</div></div>';
    const lc=document.getElementById('abcMatrixLegend');if(lc)lc.innerHTML=leg;
    // Attractivité par Famille (migrée depuis Mon Stock)
    const atEl=document.getElementById('dashAttractTable');if(atEl){const va=_S.ventesAnalysis;const totalBL2=va.totalBL||1;const p2=[];Object.entries(va.attractivite).sort((a,b)=>b[1]-a[1]).forEach(([fam,count])=>{const rate=((count/totalBL2)*100).toFixed(1);const barW=Math.min(parseFloat(rate),100);p2.push(`<tr class="border-b hover:bg-pink-50"><td class="py-2 px-3 text-[11px] font-semibold truncate max-w-[200px]" title="${escapeHtml(fam)}">${escapeHtml(fam)}</td><td class="py-2 px-3 text-center t-secondary text-xs">${count.toLocaleString('fr')}</td><td class="py-2 px-3 text-right"><div class="flex items-center gap-1 justify-end"><div class="w-16 s-hover rounded-full h-1.5"><div class="perf-bar bg-pink-500 rounded-full" style="width:${barW}%"></div></div><span class="text-pink-700 font-bold text-[10px] min-w-[35px] text-right">${rate}%</span></div></td></tr>`);});atEl.innerHTML=p2.join('')||'<tr><td colspan="3" class="text-center py-4 t-disabled text-xs">Aucune donnée famille</td></tr>';}
  }

  // ── Vue "Clients PDV" (V4) ─────────────────────────────────────────
  function renderMesClients(){
    const el=document.getElementById('tabClients');
    if(!el)return;
    if(!_S.ventesClientArticle.size && !_S.finalData.length){
      el.innerHTML='<div class="p-8 text-center t-disabled">Chargez d\'abord le fichier consommé.</div>';
      return;
    }
    const k=computeClientsKPIs();
    const top5=k.top5;
    const top5Html=top5.length?`<div class="mb-5 s-card rounded-xl border-2 overflow-hidden" style="border-color:#0891b2">
      <div class="flex items-center justify-between px-4 py-3" style="background:#06b6d41F;border-bottom:1px solid #0891b233">
        <div><h3 class="font-extrabold text-sm" style="color:#0891b2">⚡ Top 5 — Priorités cette semaine</h3>
        <p class="text-[10px] t-tertiary mt-0.5">Clients silencieux (30–60j), classés par CA × durée de silence</p></div>
        ${_S.chalandiseReady?'':`<span class="text-[10px] c-caution font-semibold">Chargez la zone de chalandise pour plus de précision</span>`}
      </div>
      <div class="divide-y b-light">${top5.map(c=>`<div class="flex items-center gap-3 px-4 py-2.5 s-hover cursor-pointer transition-colors hover:i-info-bg" data-cc="${escapeHtml(c.cc)}" onclick="openClient360(this.dataset.cc,'clients')"><span class="font-bold text-sm flex-1">${escapeHtml(c.nom)}</span><span class="text-[10px] t-tertiary flex-shrink-0 text-right max-w-[200px]">${escapeHtml(c.reason)}</span><span class="text-[10px] font-mono t-disabled ml-2" title="Score priorité">⚡${c.score}</span><span class="text-[10px] font-semibold ml-2 flex-shrink-0" style="color:#0891b2">${escapeHtml(c.commercial||'—')}</span></div>`).join('')}</div>
    </div>`:`<div class="mb-5 p-4 s-card rounded-xl border text-[12px] t-secondary">⚡ <strong>Top 5</strong> : ${_S.chalandiseReady?'Aucun client silencieux trouvé.':'Chargez la zone de chalandise pour voir les priorités.'}</div>`;

    // ── Top 5 priorités reconquête ──
    const top5ReconqHtml=k.top5Reconq.length?(()=>{
      const cards=k.top5Reconq.map(c=>`<div class="p-2.5 s-card rounded-lg border cursor-pointer hover:i-info-bg transition-colors" data-cc="${escapeHtml(c.cc)}" onclick="openClient360(this.dataset.cc,'reconquete')"><div class="flex items-center gap-2 flex-wrap"><span class="font-bold text-sm">${escapeHtml(c.nom)}</span><span class="text-[9px] px-1.5 py-0.5 rounded-full font-bold" style="background:#4c0519;color:#fda4af">🔴 ${c.daysAgo}j</span><button data-cc="${escapeHtml(c.cc)}" onclick="event.stopPropagation();openClient360(this.dataset.cc,'reconquete')" class="ml-auto text-[9px] px-2 py-0.5 rounded-full font-semibold" style="background:#be123c;color:#fff">📞 Appeler</button></div><div class="flex gap-3 mt-1 text-[10px] t-tertiary"><span>${escapeHtml(c.metier||'—')}</span><span>CA PDV <strong class="t-primary">${formatEuro(c.caPDV)}</strong></span><span class="c-action">${escapeHtml(c.commercial||'—')}</span><span class="t-disabled" title="Score priorité">⚡${c.score.toLocaleString('fr-FR')}</span></div></div>`).join('');
      return`<details class="mb-3 s-card rounded-xl border overflow-hidden" style="border-color:#e11d48"><summary class="flex items-center justify-between px-4 py-3 s-card-alt border-b cursor-pointer select-none hover:brightness-95"><h3 class="font-extrabold text-sm" style="color:#e11d48">🔴 À reconquérir — Top 5 priorités <span class="text-[10px] font-normal t-disabled ml-1">cette semaine</span></h3><span class="acc-arrow t-disabled">▶</span></summary><div class="p-4"><div class="grid grid-cols-1 sm:grid-cols-2 gap-2">${cards}</div></div></details>`;
    })():'';

    // ── S2a: Reconquête — anciens fidèles silencieux ──────────────────
    const reconq=k.reconq;
    const reconqHtml=`<details class="mb-3 s-card rounded-xl border overflow-hidden"><summary class="flex items-center justify-between px-4 py-3 s-card-alt border-b cursor-pointer select-none hover:brightness-95"><h3 class="font-extrabold text-sm t-primary">🔄 À reconquérir <span class="text-[10px] font-normal t-disabled ml-1">${k.reconqTotal} anciens fidèles</span></h3><span class="acc-arrow t-disabled">▶</span></summary>${reconq.length?`<div class="p-4"><div class="grid grid-cols-1 sm:grid-cols-2 gap-2">${reconq.map(r=>`<div class="p-2.5 s-card rounded-lg border cursor-pointer hover:i-info-bg transition-colors" data-cc="${escapeHtml(r.cc)}" onclick="openClient360(this.dataset.cc,'clients')"><div class="flex items-center gap-2 flex-wrap"><span class="font-bold text-sm">${escapeHtml(r.nom)}</span><span class="text-[9px] px-1.5 py-0.5 rounded-full bg-cyan-900 text-cyan-300 font-bold">🔄 ${r.daysAgo}j</span></div><div class="flex gap-3 mt-1 text-[10px] t-tertiary"><span>${escapeHtml(r.metier||'—')}</span><span>CA <strong class="t-primary">${formatEuro(r.totalCA)}</strong></span><span>${r.nbFamilles} fam.</span><span class="c-action">${escapeHtml(r.commercial||'—')}</span></div></div>`).join('')}${k.reconqTotal>10?`<p class="text-[10px] t-disabled col-span-full mt-1">… et ${k.reconqTotal-10} autres</p>`:''}</div></div>`:`<div class="p-4 text-[12px] t-secondary">${_S.chalandiseReady?'Aucun ancien fidèle silencieux détecté.':'Chargez la zone de chalandise pour calculer la cohorte.'}</div>`}</details>`;
    // ── S2b: Livrés sans PDV — accordéon, top 10 + "Voir tous" ────────────────
    const _livAllB=k.livSansPDV;
    const livSPDVHtml=(()=>{
      if(!_livAllB.length)return _S.livraisonsReady?`<details class="mb-3 s-card rounded-xl border overflow-hidden"><summary class="flex items-center justify-between px-4 py-3 s-card-alt border-b cursor-pointer select-none hover:brightness-95"><h3 class="font-extrabold text-sm t-primary">📦 Livrés sans PDV <span class="text-[10px] font-normal t-disabled ml-1">0 clients</span></h3><span class="acc-arrow t-disabled">▶</span></summary><div class="p-4 text-[12px] t-secondary">Tous les clients livrés ont déjà acheté au comptoir.</div></details>`:'';
      const _mkRow=r=>`<tr class="border-b b-light hover:s-hover cursor-pointer transition-colors" data-cc="${escapeHtml(r.cc)}" onclick="openClient360(this.dataset.cc,'clients')"><td class="py-1.5 px-2 font-bold text-[11px]">${escapeHtml(r.nom)}</td><td class="py-1.5 px-2 text-[11px] t-tertiary">${escapeHtml(r.metier||'—')}</td><td class="py-1.5 px-2 text-right font-bold c-action text-[11px]">${formatEuro(r.caLivraison)}</td><td class="py-1.5 px-2 text-right text-[11px] t-tertiary">${r.nbBL}</td><td class="py-1.5 px-2 text-[11px] c-action">${escapeHtml(r.commercial||'—')}</td></tr>`;
      const thStr=`<thead class="s-panel-inner t-inverse font-bold"><tr><th class="py-2 px-2 text-left">Nom client</th><th class="py-2 px-2 text-left">Métier</th><th class="py-2 px-2 text-right">CA livraison</th><th class="py-2 px-2 text-right">Nb BL</th><th class="py-2 px-2 text-left">Commercial</th></tr></thead>`;
      const top10=_livAllB.slice(0,10).map(_mkRow).join('');
      const moreHtml=_livAllB.length>10?`<details class="border-t b-default"><summary class="px-4 py-2 text-[11px] c-action cursor-pointer select-none hover:underline">Voir tous → (${_livAllB.length-10} de plus)</summary><div class="overflow-x-auto"><table class="min-w-full text-xs">${thStr}<tbody>${_livAllB.slice(10).map(_mkRow).join('')}</tbody></table></div></details>`:'';
      return`<details class="mb-3 s-card rounded-xl border overflow-hidden"><summary class="flex items-center justify-between px-4 py-3 s-card-alt border-b cursor-pointer select-none hover:brightness-95"><h3 class="font-extrabold text-sm t-primary">📦 Livrés sans PDV <span class="text-[10px] font-normal t-disabled ml-1">${_livAllB.length} clients</span></h3><span class="acc-arrow t-disabled">▶</span></summary><div class="overflow-x-auto"><table class="min-w-full text-xs">${thStr}<tbody>${top10}</tbody></table></div>${moreHtml}</details>`;
    })();

    // ── S3: Opportunités nettes — accordéon + tableau paginé (factorisé dans helpers.js)
    const oppsHtml = renderOppNetteTable();

    // ── S3b : Segments omnicanaux → déplacé vers Le Terrain (Sprint 5) ─────
    let omniHtml='';
    if(false&&_S.clientOmniScore?.size){
      let nMono=0,nHybride=0,nDigital=0,nDormant=0,caMono=0,caHybride=0,caDigital=0,caDormant=0;
      for(const[,o]of _S.clientOmniScore){
        if(o.segment==='mono'){nMono++;caMono+=o.caPDV;}
        else if(o.segment==='hybride'){nHybride++;caHybride+=o.caPDV+o.caHors;}
        else if(o.segment==='digital'){nDigital++;caDigital+=o.caPDV;}
        else if(o.segment==='dormant'){nDormant++;caDormant+=o.caPDV;}
      }
      const total=nMono+nHybride+nDigital+nDormant||1;
      const pill=(n,ca,label,icon,color)=>n>0?`<div class="flex flex-col items-center p-2.5 s-card rounded-xl border cursor-pointer hover:s-hover transition-all" onclick="_cematinSearch('clients ${label.toLowerCase().replace(' ','+')}')">
  <span class="text-[16px] leading-none mb-1">${icon}</span>
  <span class="text-[13px] font-extrabold t-primary">${n}</span>
  <span class="text-[9px] t-disabled">${label}</span>
  ${ca>0?`<span class="text-[9px] font-bold mt-0.5" style="color:${color}">${formatEuro(ca)}</span>`:''}
</div>`:'';
      const pills=[
        pill(nMono,caMono,'Mono PDV','🏪','var(--c-ok)'),
        pill(nHybride,caHybride,'Hybrides','🔀','var(--c-info,#3b82f6)'),
        pill(nDigital,caDigital,'Digital','📱','var(--c-caution)'),
        pill(nDormant,caDormant,'Dormants','💤','var(--c-danger)'),
      ].filter(Boolean).join('');
      if(pills){
        const pctMono=Math.round(nMono/total*100);
        const pctH=Math.round(nHybride/total*100);
        const pctD=Math.round(nDigital/total*100);
        const pctDor=Math.max(0,100-pctMono-pctH-pctD);
        omniHtml=`<div class="mb-5">
  <h3 class="text-[11px] font-bold t-secondary uppercase tracking-wider mb-2">📡 Segments omnicanaux <span class="font-normal normal-case t-disabled">${total} clients analysés</span></h3>
  <div class="grid grid-cols-4 gap-2 mb-2">${pills}</div>
  <div class="flex h-1.5 rounded-full overflow-hidden">
    <div style="width:${pctMono}%;background:var(--c-ok)" title="Mono PDV ${pctMono}%"></div>
    <div style="width:${pctH}%;background:var(--c-info,#3b82f6)" title="Hybrides ${pctH}%"></div>
    <div style="width:${pctD}%;background:var(--c-caution)" title="Digital ${pctD}%"></div>
    <div style="width:${pctDor}%;background:var(--c-danger);opacity:0.4" title="Dormants"></div>
  </div>
  <p class="text-[9px] t-disabled mt-1.5">Cliquer sur un segment pour filtrer dans Ce matin · 🏪\u00a0PDV seul · 🔀\u00a0PDV+digital · 📱\u00a0digital dominant · 💤\u00a0silence &gt;180j</p>
</div>`;
      }
    }

    // ── S4: Actifs hors agence → déplacé vers Le Terrain (Sprint 5) ─────────
    const horsAgence=[];
    if(false)for(const [cc,artMap] of _S.ventesClientHorsMagasin.entries()){
      const totalHors=[...artMap.values()].reduce((s,d)=>s+(d.sumCA||0),0);
      if(totalHors<500)continue;
      const pdvMap=_S.ventesClientArticle.get(cc);
      const totalPDV=pdvMap?[...pdvMap.values()].reduce((s,d)=>s+(d.sumCA||0),0):0;
      if(totalPDV>totalHors)continue; // déjà bien capté
      const info=_S.chalandiseData.get(cc);
      const nom=info?.nom||_S.clientNomLookup[cc]||cc;
      const canaux=new Set([...artMap.values()].map(d=>d.canal).filter(Boolean));
      horsAgence.push({cc,nom,metier:info?.metier||'',commercial:info?.commercial||'',totalHors,totalPDV,canaux:[...canaux].join('/')});
    }
    horsAgence.sort((a,b)=>b.totalHors-a.totalHors);
    const ha10=horsAgence.slice(0,10);
    const haHtml=ha10.length?`<div class="mb-5 s-card rounded-xl border overflow-hidden">
      <div class="flex items-center gap-2 px-4 py-3 s-card-alt border-b"><h3 class="font-extrabold text-sm t-primary">🌐 Actifs hors agence <span class="text-[10px] font-normal t-disabled ml-1">${horsAgence.length} clients avec CA hors&gt;PDV</span></h3></div>
      <div class="p-4"><p class="text-[10px] t-tertiary mb-3">Clients dont le CA hors-agence dépasse le CA en magasin — signal de captation partielle à convertir.</p>
      <table class="w-full text-xs"><thead><tr class="t-tertiary text-left"><th class="pb-1 font-semibold">Client</th><th class="pb-1 font-semibold text-right">Hors agence</th><th class="pb-1 font-semibold text-right">Magasin</th><th class="pb-1 font-semibold text-right">Canal</th><th class="pb-1 font-semibold text-right">Commercial</th></tr></thead><tbody class="divide-y b-light">${ha10.map(c=>`<tr class="s-hover cursor-pointer hover:i-info-bg transition-colors" data-cc="${escapeHtml(c.cc)}" onclick="openClient360(this.dataset.cc,'clients')"><td class="py-1.5 font-bold">${escapeHtml(c.nom)}<span class="text-[9px] t-disabled font-normal ml-1">${escapeHtml(c.metier||'')}</span></td><td class="py-1.5 text-right font-bold c-danger">${formatEuro(c.totalHors)}</td><td class="py-1.5 text-right t-tertiary">${c.totalPDV>0?formatEuro(c.totalPDV):'—'}</td><td class="py-1.5 text-right t-disabled">${escapeHtml(c.canaux)}</td><td class="py-1.5 text-right c-action font-semibold">${escapeHtml(c.commercial||'—')}</td></tr>`).join('')}</tbody></table></div>
    </div>`:`<div class="mb-5 p-4 s-card rounded-xl border text-[12px] t-secondary">🌐 <strong>Hors agence</strong> : ${_S.ventesClientHorsMagasin.size?'Aucun client avec CA hors agence dépassant le PDV.':'Chargez le fichier Terrain pour détecter les achats hors agence.'}</div>`;

    // ── Top clients PDV (CA PDV / CA Total / Delta) ──────────────────────
    let topPDVHtml='';
    {const topRows=k.topPDVRows;
      const top=topRows.slice(0,20);
      if(top.length){
        const now=Date.now();
        const rows=top.map(r=>{
          const daysSince=r.lastDate?Math.round((now-r.lastDate)/86400000):null;
          const silence=daysSince!==null?`${daysSince}j`:'—';
          const silColor=daysSince===null?'t-disabled':daysSince<30?'c-ok':daysSince<90?'c-caution':'c-danger';
          const _dc=deltaColor(r.caHors,r.caPDV);
          return`<tr class="border-b b-light hover:s-hover cursor-pointer transition-colors" data-cc="${escapeHtml(r.cc)}" onclick="openClient360(this.dataset.cc,'clients')"><td class="py-1.5 px-2 font-bold text-[11px]">${escapeHtml(r.nom)}<span class="text-[9px] t-disabled font-normal ml-1">${escapeHtml(r.metier||'')}</span></td><td class="py-1.5 px-2 text-right font-bold c-action text-[11px]">${formatEuro(r.caPDV)}</td><td class="py-1.5 px-2 text-right text-[11px]">${formatEuro(r.caTotal)}</td><td class="py-1.5 px-2 text-right text-[10px] ${_dc}">${r.caHors>0?'+'+formatEuro(r.caHors):'—'}</td><td class="py-1.5 px-2 text-center text-[10px] ${silColor}">${silence}</td></tr>`;
        }).join('');
        const _nBelow100=_S.ventesClientArticle.size-topRows.length;
        const _pdvTip=`${topRows.length} clients avec CA PDV ≥ 100 €, sur ${_S.ventesClientArticle.size} clients MAGASIN totaux (${_nBelow100} exclus car CA PDV < 100 €). Source : consommé canal MAGASIN, agence sélectionnée uniquement. Aucun filtre actif appliqué ici.`;
        topPDVHtml=`<div class="mb-5 s-card rounded-xl border overflow-hidden"><div class="flex items-center gap-2 px-4 py-3 s-card-alt border-b"><h3 class="font-extrabold text-sm t-primary">🏆 Top clients PDV <span class="text-[10px] font-normal t-disabled ml-1 cursor-help" title="${_pdvTip}">${topRows.length} clients · canal MAGASIN</span></h3></div><div class="overflow-x-auto"><table class="min-w-full text-xs"><thead class="s-panel-inner t-inverse font-bold"><tr><th class="py-2 px-2 text-left">Client</th><th class="py-2 px-2 text-right">CA PDV</th><th class="py-2 px-2 text-right">CA Total</th><th class="py-2 px-2 text-right">Delta hors</th><th class="py-2 px-2 text-center">Silence</th></tr></thead><tbody>${rows}</tbody></table></div></div>`;
      }
    }

    // ── Clients PDV hors zone (PDV mais absents chalandise) ───────────────
    let horsZoneHtml='';
    {const hors=k.horsZone;
      const nowMs=Date.now();
      if(hors.length){
        const rows=hors.slice(0,20).map(r=>{
          const daysSince=r.lastDate?Math.round((nowMs-r.lastDate)/86400000):null;
          const silence=daysSince!==null?`${daysSince}j`:'—';
          const silColor=daysSince===null?'t-disabled':daysSince<30?'c-ok':daysSince<90?'c-caution':'c-danger';
          const _dc=deltaColor(r.caHors,r.caPDV);
          return`<tr class="border-b b-light hover:s-hover cursor-pointer transition-colors" data-cc="${escapeHtml(r.cc)}" onclick="openClient360(this.dataset.cc,'clients')"><td class="py-1.5 px-2 font-bold text-[11px]">${escapeHtml(r.nom)}</td><td class="py-1.5 px-2 text-right font-bold c-action text-[11px]">${formatEuro(r.caPDV)}</td><td class="py-1.5 px-2 text-right text-[11px]">${formatEuro(r.caTotal)}</td><td class="py-1.5 px-2 text-right text-[10px] ${_dc}">${r.caHors>0?'+'+formatEuro(r.caHors):'—'}</td><td class="py-1.5 px-2 text-center text-[10px] ${silColor}">${silence}</td></tr>`;
        }).join('');
        horsZoneHtml=`<div class="mb-5 s-card rounded-xl border overflow-hidden"><div class="flex items-center gap-2 px-4 py-3 s-card-alt border-b"><h3 class="font-extrabold text-sm c-caution">⚠️ Clients PDV hors zone <span class="text-[10px] font-normal t-disabled ml-1">${hors.length} client${hors.length>1?'s':''} absents de la chalandise</span></h3></div><p class="text-[10px] t-tertiary px-4 py-2 border-b b-light">Clients actifs au comptoir mais non référencés dans la zone de chalandise — vérifier s'ils doivent être ajoutés.</p><div class="overflow-x-auto"><table class="min-w-full text-xs"><thead class="s-panel-inner t-inverse font-bold"><tr><th class="py-2 px-2 text-left">Client</th><th class="py-2 px-2 text-right">CA PDV</th><th class="py-2 px-2 text-right">CA Total</th><th class="py-2 px-2 text-right">Delta hors</th><th class="py-2 px-2 text-center">Silence</th></tr></thead><tbody>${rows}</tbody></table></div></div>`;
      }
    }

    // ── Section 4b : Clients devenus digitaux ────────────────────────────
    let digitauxHtml='';
    {const digitaux=k.digitaux;
      const _digTop=digitaux.slice(0,8);
      if(_digTop.length){
        const cIcon=c=>c==='INTERNET'?'🌐':c==='REPRESENTANT'?'🤝':c==='DCS'?'📦':'📡';
        const cards=_digTop.map(r=>`<div class="s-card rounded-xl border p-3 cursor-pointer hover:s-hover transition-all" onclick="openClient360('${r.cc}','digitaux')">
  <div class="flex items-start justify-between mb-1">
    <div class="min-w-0"><div class="text-[11px] font-bold t-primary truncate">${r.nom}</div><div class="text-[9px] t-disabled">${r.metier||'—'}</div></div>
    <span class="text-[9px] shrink-0 ml-2" style="color:var(--c-caution)">${r.pdvSilence}j sans PDV</span>
  </div>
  <div class="flex gap-3 mt-1.5 text-[9px]">
    <span>${cIcon(r.mainCanal)}\u00a0<strong>${formatEuro(r.caHors)}</strong> <span class="t-disabled">digital</span></span>
    <span class="t-disabled">vs ${formatEuro(r.caPDV)} PDV hist.</span>
  </div>
</div>`).join('');
        digitauxHtml=`<div class="mb-5">
  <h3 class="text-[11px] font-bold t-secondary uppercase tracking-wider mb-2">📱 Clients devenus digitaux <span class="font-normal normal-case">(${digitaux.length})</span></h3>
  <div class="grid grid-cols-1 md:grid-cols-2 gap-3">${cards}</div>
  <p class="text-[9px] t-disabled mt-2">PDV silencieux depuis &gt;90j mais actifs en ligne ou par représentant — potentiel de récupération au comptoir</p>
</div>`;
      }
    }

    // ── Section 5 : Momentum commercial → déplacé vers Le Terrain (Sprint 5) ─
    let momentumHtml='';
    if(false&&_S.clientsByCommercial?.size>1){
      const now=new Date();
      const rows=[];
      for(const[com,ccs]of _S.clientsByCommercial){
        if(!com||!ccs.size)continue;
        let nbRecent=0,nbAtRisk=0,nbSilent=0,nbUnknown=0,caActif=0,caRisque=0;
        for(const cc of ccs){
          const lastDate=_S.clientLastOrder?.get(cc);
          const arts=_S.ventesClientArticle?.get(cc);
          const ca=arts?[...arts.values()].reduce((s,v)=>s+(v.sumCA||0),0):0;
          if(!lastDate){nbUnknown++;continue;}
          const d=Math.round((now-lastDate)/86400000);
          if(d<30){nbRecent++;caActif+=ca;}
          else if(d<90){nbAtRisk++;caActif+=ca;}
          else{nbSilent++;caRisque+=ca;}
        }
        const nbTotal=ccs.size-nbUnknown;
        if(nbTotal===0)continue;
        const momentum=Math.round((nbRecent*2+nbAtRisk)/(nbTotal*2)*100);
        rows.push({com,nbRecent,nbAtRisk,nbSilent,nbTotal,caActif,caRisque,momentum});
      }
      rows.sort((a,b)=>a.momentum-b.momentum||b.caRisque-a.caRisque);// croissant : les en recul en premier
      const cards=rows.map(r=>{
        const pctR=Math.round(r.nbRecent/r.nbTotal*100);
        const pctA=Math.round(r.nbAtRisk/r.nbTotal*100);
        const pctS=Math.max(0,100-pctR-pctA);
        const mColor=r.momentum>=65?'var(--c-ok)':r.momentum>=35?'var(--c-caution)':'var(--c-danger)';
        const mLabel=r.momentum>=65?'⬆\uFE0F Dynamique':r.momentum>=35?'➡\uFE0F Stable':'⬇\uFE0F En recul';
        const comShort=r.com.includes(' - ')?r.com.split(' - ').slice(1).join(' '):r.com;
        const safeQ=r.com.replace(/\\/g,'\\\\').replace(/'/g,"\\'");
        return `<div class="s-card rounded-xl border p-3 cursor-pointer hover:s-hover transition-all" onclick="_goCommercial('${safeQ}')">
  <div class="flex items-start justify-between mb-2">
    <div><div class="text-[11px] font-bold t-primary">${comShort}</div><div class="text-[9px] t-disabled">${r.nbTotal} clients · score\u00a0${r.momentum}</div></div>
    <span class="text-[9px] font-bold shrink-0" style="color:${mColor}">${mLabel}</span>
  </div>
  <div class="flex h-1.5 rounded-full overflow-hidden mb-1.5">
    <div style="width:${pctR}%;background:var(--c-ok)"></div>
    <div style="width:${pctA}%;background:var(--c-caution)"></div>
    <div style="width:${pctS}%;background:var(--c-danger);opacity:0.5"></div>
  </div>
  <div class="flex justify-between text-[9px]">
    <span class="text-emerald-500">${r.nbRecent}\u00a0actifs</span>
    <span class="text-amber-500">${r.nbAtRisk}\u00a0à\u00a0risque</span>
    <span style="color:var(--c-danger)">${r.nbSilent}\u00a0silencieux</span>
  </div>
  ${r.caRisque>500?`<div class="mt-1 text-[9px] t-disabled">CA\u00a0à\u00a0risque\u00a0: <strong style="color:var(--c-danger)">${formatEuro(r.caRisque)}</strong></div>`:''}
</div>`;
      }).join('');
      if(cards)momentumHtml=`<div class="mb-5">
  <div class="flex items-center justify-between mb-2">
    <h3 class="text-[11px] font-bold t-secondary uppercase tracking-wider">📈 Momentum commercial</h3>
    <button onclick="_exportTourneeCSV()" class="text-[9px] px-2.5 py-1 rounded-lg s-card border b-light t-disabled hover:t-primary transition-colors">📥 Plan de visite CSV</button>
  </div>
  <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">${cards}</div>
  <p class="text-[9px] t-disabled mt-2">Cliquer sur un commercial pour filtrer dans Le Terrain · 🟢\u00a0&lt;30j · 🟡\u00a030-90j · 🔴\u00a0&gt;90j sans commande PDV</p>
</div>`;
    }

    const _setEl=(id,html)=>{const e=document.getElementById(id);if(e)e.innerHTML=html;};
    _setEl('clientsTop5',top5Html);
    _setEl('clientsTopPDV',topPDVHtml);
    _setEl('clientsHorsZone',horsZoneHtml);
    _setEl('clientsDigitaux',digitauxHtml);
    _setEl('clientsReconquete', top5ReconqHtml + reconqHtml + livSPDVHtml);
    _setEl('clientsOpportunites',oppsHtml);
  }

  function _goCommercial(commercial){
    _S._selectedCommercial=commercial;
    const inp=document.getElementById('terrCommercialFilter');
    if(inp)inp.value=commercial;
    switchTab('territoire');
    if(typeof renderTerritoireTab==='function')renderTerritoireTab();
  }

  function _exportTourneeCSV(){
    const now=new Date();
    const rows=[];
    for(const[cc,arts]of(_S.ventesClientArticle||new Map())){
      const lastPDV=_S.clientLastOrder?.get(cc);
      const silenceDays=lastPDV?Math.round((now-lastPDV)/86400000):999;
      if(silenceDays<30)continue; // actifs récents : pas besoin de visite urgente
      let caPDV=0;for(const[,v]of arts)caPDV+=v.sumCA||0;
      if(caPDV<100)continue;
      const omni=_S.clientOmniScore?.get(cc);
      const caHors=omni?.caHors||0;
      const info=_S.chalandiseData?.get(cc);
      const nom=info?.nom||_S.clientNomLookup?.[cc]||cc;
      const priorite=silenceDays>90?'URGENT':silenceDays>60?'À RELANCER':'SURVEILLER';
      rows.push({
        code:cc,nom,metier:info?.metier||'',commercial:info?.commercial||'',
        dernierPDV:lastPDV?lastPDV.toLocaleDateString('fr-FR'):'',
        silenceDays,caPDV:Math.round(caPDV),caHors:Math.round(caHors),
        omniScore:omni?.score||0,segment:omni?.segment||'',priorite
      });
    }
    rows.sort((a,b)=>{
      const p={'URGENT':0,'À RELANCER':1,'SURVEILLER':2};
      const pa=p[a.priorite]??3,pb=p[b.priorite]??3;
      if(pa!==pb)return pa-pb;
      return(b.caPDV+b.caHors)-(a.caPDV+a.caHors);
    });
    const header=['Code','Nom','Métier','Commercial','Dernier PDV','Silence (j)','CA PDV','CA Digital','Score Omni','Segment','Priorité'];
    const escape=v=>`"${String(v===null||v===undefined?'':v).replace(/"/g,'""')}"`;
    const csv=[header,...rows.map(r=>[r.code,r.nom,r.metier,r.commercial,r.dernierPDV,r.silenceDays,r.caPDV,r.caHors,r.omniScore,r.segment,r.priorite])].map(row=>row.map(escape).join(';')).join('\n');
    const blob=new Blob(['\uFEFF'+csv],{type:'text/csv;charset=utf-8;'});
    const a=document.createElement('a');a.href=URL.createObjectURL(blob);
    a.download=`plan-visite-${(_S.selectedMyStore||'agence').replace(/\s+/g,'-')}-${now.toISOString().slice(0,10)}.csv`;
    document.body.appendChild(a);a.click();document.body.removeChild(a);URL.revokeObjectURL(a.href);
  }
  window._exportTourneeCSV=_exportTourneeCSV;

  // ── Sous-onglet Clients PDV (vue unique) ─────────────────────────────────
  function _switchClientsTab(){
    // Vue unique — pas de sous-onglets depuis Sprint 4
    const pane=document.getElementById('clientsPane-priorites');
    if(pane)pane.classList.remove('hidden');
  }
  window._switchClientsTab=_switchClientsTab;

  // ── Lazy tab renderer — renders only the currently active tab ──
  function renderCurrentTab(){
    const activeBtn=document.querySelector('.tab-btn.active');
    const id=activeBtn?activeBtn.getAttribute('data-tab'):'table';
    switch(id){
      case 'table':
        renderTable(true); // articles always re-renders; no cache flag
        return;
      case 'dash':
        renderDashboardAndCockpit();
        renderHealthScore();
        renderTabBadges();
        break;
      case 'abc':
        renderABCTab();
        break;
      case 'territoire':
        renderTerritoireTab();
        break;
      case 'omni':
        renderCockpitEquation();
        renderOmniTab();
        break;
      case 'bench':
        renderBenchmark();
        break;
      case 'clients':
        renderMesClients();
        break;
      case 'promo':
        renderAnimationTab();
        break;
      case 'labo':
        renderLaboTab();
        break;
    }
    _S._tabRendered[id]=true;
  }

  // ★★★ V2 Phase 2: Diagnostic Cascade ★★★

  // Strip "O05 - " style prefix from family names for consistent matching across data sources
  function openDiagnosticCell(abc,fmr){
    const overlay=document.getElementById('diagnosticOverlay');
    if(!overlay)return;
    const key=abc+fmr;
    // Gather articles in this cell, respecting Radar filters
    const radarData=_radarFilteredData();
    const cellArts=radarData.filter(r=>r.abcClass===abc&&r.fmrClass===fmr);
    if(!cellArts.length)return;
    overlay.classList.add('active');
    _S._diagCurrentFamille='@cell:'+key;_S._diagCurrentSource='abc';_S._diagMetierFilter='';
    _renderDiagnosticCellPanel(key,cellArts);
  }

  // ── Restauration de session au démarrage ─────────────────────
  // Charger la table CP → coordonnées GPS en arrière-plan (non bloquant)
  loadCpCoords();

  (async function _initFromCache() {
    // Pré-remplir le sélecteur d'agence depuis localStorage si une valeur est sauvegardée
    const _savedStore = localStorage.getItem('prisme_selectedStore');
    if (_savedStore) {
      const sel = document.getElementById('selectMyStore');
      if (sel) {
        if (sel.options.length <= 1) {
          const o = document.createElement('option');
          o.value = _savedStore; o.textContent = _savedStore; o.selected = true;
          sel.appendChild(o);
        }
        sel.value = _savedStore;
      }
    }
    // 1. Toujours restaurer les exclusions (pas de TTL)
    _restoreExclusions();
    // 2. Migration transparente PILOT_PRO → PRISME (si ancienne base présente)
    await _migrateIDB();
    // 3. Tenter la restauration complète depuis IndexedDB
    const restored = await _restoreSessionFromIDB();
    if (restored && DataStore.finalData.length > 0) {
      // ── 0. Gardes-fous AVANT tout code UI — _S.storesIntersection et _S.selectedMyStore ──
      // Doit s'exécuter immédiatement après await _restoreSessionFromIDB(),
      // avant toute référence à _S.selectedMyStore ou _S.storesIntersection dans l'UI.
      if(!_S.storesIntersection.size&&Object.keys(_S.ventesParMagasin).length>0&&Object.keys(_S.stockParMagasin).length>0){
        const vKeys=new Set(Object.keys(_S.ventesParMagasin)),sKeys=new Set(Object.keys(_S.stockParMagasin));
        _S.storesIntersection=new Set([...vKeys].filter(k=>sKeys.has(k)));
        if(_S.storesIntersection.size)console.log('[PRISME] _S.storesIntersection reconstruite depuis IDB :',[..._S.storesIntersection]);
      }
      // Fallback compteurs : si non persistés dans l'ancien cache, recalculer depuis les maps
      if(!_S.storeCountConsomme)_S.storeCountConsomme=Object.keys(_S.ventesParMagasin).length;
      if(!_S.storeCountStock)_S.storeCountStock=Object.keys(_S.stockParMagasin).length;
      if(!_S.selectedMyStore&&_S.storesIntersection.size>0){
        const _saved2=localStorage.getItem('prisme_selectedStore');_S.selectedMyStore=(_saved2&&_S.storesIntersection.has(_saved2))?_saved2:[..._S.storesIntersection][0];
        console.log('[PRISME] _S.selectedMyStore sélectionné automatiquement :', _S.selectedMyStore);
      }
      // ── Vérification de cohérence : DataStore.finalData contaminé ? ──
      // Un DataStore.finalData multi-agences sauvé par erreur (_S.storesIntersection vide lors de la session
      // précédente → useMulti=false → pas de filtre agence) aurait N×storeCount articles.
      // On utilise _S.storeCountConsomme (fiable même quand _S.storesIntersection est encore vide)
      // plutôt que _S.storesIntersection.size qui peut être 0 dans un cache corrompu.
      if(_S.storeCountConsomme>1&&_S.selectedMyStore){
        const _myStockCount=Object.keys(_S.stockParMagasin[_S.selectedMyStore]||{}).length;
        if(_myStockCount>0&&DataStore.finalData.length>_myStockCount*2.5){
          console.warn('[PRISME] cache contaminé — DataStore.finalData='+DataStore.finalData.length+' articles mais '+_S.selectedMyStore+' en a '+_myStockCount+' en stock. Cache invalidé.');
          await _clearIDB();
          showToast('⚠️ Cache obsolète détecté et purgé — rechargez vos fichiers.','warning');
          _restoreFromCache();
          return;
        }
      }

      // ── Reproduit exactement la séquence de fin de processData() L2462-2488 ──

      // 1. Peupler les filtres depuis DataStore.finalData (équivalent populateSelect L2470)
      const _rFam=new Set(),_rSFam=new Set(),_rEmp=new Set(),_rStat=new Set();
      for(const r of DataStore.finalData){
        if(r.famille&&r.famille!=='Non Classé')_rFam.add(r.famille);
        if(r.sousFamille)_rSFam.add(r.sousFamille);
        if(r.emplacement)_rEmp.add(r.emplacement);
        if(r.statut)_rStat.add(r.statut);
      }
      populateSelect('filterFamille',_rFam,famLabel);populateSelect('filterSousFamille',_rSFam);
      populateSelect('filterEmplacement',_rEmp);populateSelect('filterStatut',_rStat);

      // 2. Navbar (L2472-2476)
      document.getElementById('navStats').textContent=DataStore.finalData.length.toLocaleString('fr')+' art.';
      document.getElementById('navStats').classList.remove('hidden');
      const _navSt2=document.getElementById('navStore');if(_navSt2){_navSt2.textContent=_S.selectedMyStore||'';_navSt2.classList.toggle('hidden',!_S.selectedMyStore);}
      document.getElementById('navReportingBtn').classList.remove('hidden');
      document.getElementById('globalFilters').classList.remove('hidden');

      // 3. UI state (L2477-2483)
      document.body.classList.add('pilot-loaded');
      document.getElementById('storeSelector').classList.add('hidden');
      const useMulti = _S.storesIntersection.size > 1;
      if(useMulti){document.getElementById('btnTabBench').classList.remove('hidden');buildBenchCheckboxes();}
      else{document.getElementById('btnTabBench').classList.add('hidden');}
      document.getElementById('btnTabTerritoire').classList.remove('hidden');
      const terrNoC=document.getElementById('terrNoChalandise');
      if(terrNoC)terrNoC.classList.toggle('hidden',_S.chalandiseReady);

      // 4. Période + render (L2485)
      updatePeriodAlert();
      buildPeriodFilter();
      computeClientCrossing();
      if (_S.chalandiseReady) _computeChalandiseDistances();
      // Reconquête : non persistée → recalculer depuis les données IDB restaurées
      if (_S.clientLastOrder.size || _S.livraisonsReady) computeReconquestCohort();
      if (_S.chalandiseReady && DataStore.ventesClientArticle.size) { computeOmniScores(); computeFamillesHors(); }
      generateDecisionQueue();
      if (_S.ventesClientHorsMagasin.size) _rebuildCaByArticleCanal();
      // Univers dominant : non persisté → recomputer depuis ventesClientArticle × articleUnivers
      if(_S.ventesClientArticle.size) _computeClientDominantUnivers();
      // Synchroniser l'input commercial filter depuis _S (restauré depuis IDB)
      const _comInput = document.getElementById('terrCommercialFilter');
      if (_comInput && _S._selectedCommercial) _comInput.value = _S._selectedCommercial;
      // Synchroniser le sous-onglet actif Clients
      const _tab = _S._clientsActiveTab || 'priorites';
      document.querySelectorAll('.clients-tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === _tab));
      renderSidebarAgenceSelector();
      _S.currentPage=0;
      // Sprint 0 fix: ne pas appeler renderAll() ici — le render sera fait par
      // processDataFromRaw(isRefilter) ou le else-branch ci-dessous.
      // On prépare juste filteredData pour _syncTabAccess et benchmark.
      _S.filteredData = getFilteredData();
      _syncTabAccess();
      if(useMulti){
        _buildObsUniversDropdown();
        buildBenchBassinSelect();
        renderBenchmark();
        launchReseauWorker().then(()=>{
          renderNomadesMissedArts();
          renderReseauOrphelins();
        }).catch(err=>console.warn('Réseau worker error (IDB restore):',err));
      }
      if(_S.territoireReady){renderTerritoireTab();}

      // 5. Activer PRISME + replier l'import
      switchTab('labo');
      collapseImportZone();
      // Positionner le filtre période sur le mois courant des données puis recalculer les agrégats
      {const _maxD=_S.consommePeriodMaxFull||_S.consommePeriodMax;if(_maxD&&!_S.periodFilterStart&&!_S.periodFilterEnd){const _y=_maxD.getFullYear(),_m=_maxD.getMonth();_S.periodFilterStart=new Date(_y,_m,1);_S.periodFilterEnd=new Date(_y,_m+1,0,23,59,59);}
      invalidateCache('tab', 'terr');buildPeriodFilter();
      // ── Recalcul complet des agrégats période-dépendants (canalAgence, ventesParMagasin, etc.) ──
      // Snapshot full-period ventesClientArticle avant refilter (IDB contient la version complète)
      if(!_S.ventesClientArticleFull.size&&_S.ventesClientArticle.size){
        _S.ventesClientArticleFull=new Map([..._S.ventesClientArticle].map(([cc,arts])=>[cc,new Map(arts)]));
      }
      if(_S._rawDataC&&_S._rawDataC.length&&(_S.periodFilterStart||_S.periodFilterEnd)){
        await processDataFromRaw(_S._rawDataC,_S._rawDataS||[],{isRefilter:true});
      }else{
        renderCanalAgence();renderCurrentTab();renderIRABanner();
      }}

      // 6. Bandeau cache par-dessus l'insightsBanner
      _showCacheBanner();
    } else {
      // Pas de session IDB — restaurer seulement les préférences (localStorage)
      _restoreFromCache();
    }
  })();

  // ── Global JS tooltip — position:fixed escapes overflow:auto clipping ──
  (function(){
    const tt=document.createElement('div');
    tt.id='g-tooltip';
    Object.assign(tt.style,{display:'none',position:'fixed',zIndex:'9999',background:'var(--s-card)',color:'var(--t-primary)',border:'1px solid var(--b-default)',boxShadow:'0 4px 14px rgba(0,0,0,0.15)',padding:'8px 12px',borderRadius:'6px',fontSize:'12px',maxWidth:'250px',lineHeight:'1.5',pointerEvents:'none',whiteSpace:'normal',textAlign:'left'});
    document.body.appendChild(tt);
    function showTip(el){
      const text=el.getAttribute('data-tip')||el.getAttribute('data-tooltip');
      if(!text)return;
      tt.textContent=text;
      tt.style.display='block';
      const r=el.getBoundingClientRect(),ttW=tt.offsetWidth,ttH=tt.offsetHeight;
      let top=r.top-ttH-8;
      if(top<8)top=r.bottom+8;// flip below if no room above
      let left=r.left+r.width/2-ttW/2;
      left=Math.max(8,Math.min(left,window.innerWidth-ttW-8));
      tt.style.top=top+'px';tt.style.left=left+'px';
    }
    document.addEventListener('mouseover',function(e){
      const el=e.target.closest('.info-tip[data-tip],[data-tooltip]');
      if(el)showTip(el);
    });
    document.addEventListener('mouseout',function(e){
      const el=e.target.closest('.info-tip[data-tip],[data-tooltip]');
      if(el&&!el.contains(e.relatedTarget))tt.style.display='none';
    });
  })();

  // ── Fix scroll blocking after focus change (Safari/Chrome desktop + mobile) ──
  // position:sticky elements can desync the scroll container when the page loses
  // and regains focus. Nudging scrollTop by 1px forces a layout recalc.
  (function(){
    function _fixScroll(){
      const mc=document.getElementById('mainContent');
      if(!mc)return;
      const s=mc.scrollTop;
      mc.scrollTop=s+1;
      requestAnimationFrame(function(){mc.scrollTop=s;});
    }
    document.addEventListener('visibilitychange',function(){
      if(document.visibilityState==='visible')_fixScroll();
    });
    window.addEventListener('focus',_fixScroll,true);
  })();

// ── Exposition des fonctions globales pour les onclick="" du HTML ──────────
// Phase 1 : les handlers inline dans le HTML appellent ces fonctions via window.
// Phase 2 (Vite) : nettoyer progressivement au profit d'event listeners.
window.switchTab = switchTab;
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
window.toggleSecteurDropdown = toggleSecteurDropdown;
window.toggleAllSecteurs = toggleAllSecteurs;
window.onSecteurChange = onSecteurChange;
window.onLivraisonsSelected = async function(input) {
  onFileSelected(input, 'dropLivraisons');
  if (!input.files?.[0]) return;
  await parseLivraisons(input.files[0]);
  // territoireLines, territoireReady, computeReconquestCohort et computeOpportuniteNette
  // sont déjà gérés dans parseLivraisons() — pas de post-traitement nécessaire ici
};
window.onConsommeReseauSelected = function(input) {
  onFileSelected(input, 'dropConsommeReseau');
  // Parsing réseau — sera implémenté dans une prochaine version
  if (input.files?.[0]) showToast('📂 Fichier réseau chargé — traitement disponible dans la prochaine version', 'info', 4000);
};
window.onChalandiseSelected = async function(input) {
  onFileSelected(input, 'dropChalandise');
  if (!input.files || !input.files[0]) return;
  await parseChalandise(input.files[0]);
  // Si les données sont déjà chargées, recalculer le benchmark avec la chalandise
  if (DataStore.finalData.length > 0 && _S.storesIntersection.size > 1) {
    computeBenchmark(_S._globalCanal || null);
    renderBenchmark();
  }
};
window.exportSaisonCSV = exportSaisonCSV;
window.exportTerritoireCSV = exportTerritoireCSV;
window.renderTerritoireTab = renderTerritoireTab;
window._setPDVCanalFilter = _setPDVCanalFilter;
window._setTerrClientsCanalFilter = _setTerrClientsCanalFilter;
window.getKPIsByCanal = getKPIsByCanal;
window.computePhantomArticles = computePhantomArticles;
window.computeReconquestCohort = computeReconquestCohort;
window.computeSPC = computeSPC;
window.computeOpportuniteNette = computeOpportuniteNette;
window.computeOmniScores = computeOmniScores;
window.computeFamillesHors = computeFamillesHors;
window.renderHeatmapFamilleCommercial = renderHeatmapFamilleCommercial;
window.exportTourneeCSV = exportTourneeCSV;
window._togglePromoClientRow = _togglePromoClientRow;
window._switchPromoTab = _switchPromoTab;
window._exportCommercialCSV = _exportCommercialCSV;
window._renderSearchResults = _renderSearchResults;
window.renderBenchmark = renderBenchmark;
window.computeBenchmark = computeBenchmark;

window._setReseauCanalFilter = function(val){
  if(!val){_S._reseauCanaux=new Set();}
  else{
    if(!_S._reseauCanaux)_S._reseauCanaux=new Set();
    if(_S._reseauCanaux.has(val))_S._reseauCanaux.delete(val);
    else _S._reseauCanaux.add(val);
  }
  invalidateCache('bench');
  computeBenchmark(_S._reseauCanaux);
  renderBenchmark();
};
// (moved to ACTION_REGISTRY: _topPDVExpand, _topPDVCollapse, _topPDVPage, _oppNettePage)
window._toggleHorsAgence = function(){window._setClientView(_S._clientView==='multicanaux'?'tous':'multicanaux');};
window._toggleHorsZone   = function(){window._setClientView(_S._clientView==='horszone'?'tous':'horszone');};
window._toggleDormants   = function(){window._setClientView(_S._clientView==='dormants'?'tous':'dormants');};
// (moved to ACTION_REGISTRY: _horsZoneExpand, _horsZoneCollapse, _horsZonePage)
window._toggleReseauCanal = function(canal) {
  if (!canal) { _S._reseauCanaux = new Set(); }
  else {
    if (!_S._reseauCanaux) _S._reseauCanaux = new Set();
    if (_S._reseauCanaux.has(canal)) _S._reseauCanaux.delete(canal);
    else _S._reseauCanaux.add(canal);
  }
  // Afficher #reseauMagasinModeBar uniquement si MAGASIN est le seul canal sélectionné
  const _rmb = document.getElementById('reseauMagasinModeBar');
  if (_rmb) _rmb.classList.toggle('hidden', !(_S._reseauCanaux.size === 1 && _S._reseauCanaux.has('MAGASIN')));
  invalidateCache('bench');
  computeBenchmark(_S._reseauCanaux);
  renderBenchmark();
};
window._setReseauMagasinMode = function(mode){_S._reseauMagasinMode=mode;invalidateCache('bench');[['resMagModeAll','all'],['resMagModePrel','preleve'],['resMagModeEnl','enleve']].forEach(([id,m])=>{const el=document.getElementById(id);if(el)el.classList.toggle('active',(mode||'all')===m);});computeBenchmark(_S._reseauCanaux||new Set());renderBenchmark();};
window._setGlobalMagasinMode = function(mode){_S._reseauMagasinMode=mode;invalidateCache('all');[['globalMagModeAll','all'],['globalMagModePrel','preleve'],['globalMagModeEnl','enleve']].forEach(([id,m])=>{const el=document.getElementById(id);if(el)el.classList.toggle('active',(mode||'all')===m);});if(typeof window.renderCurrentTab==='function')window.renderCurrentTab();};
window._setReseauFamFilter = function(fam){_S._reseauMissedFamFilter=fam;_S._reseauMissedPage=0;_S._reseauUnderPage=0;_S._reseauMissedShowAll=false;_S._reseauUnderShowAll=false;renderBenchmark();};
// (moved to ACTION_REGISTRY: _reseauShowAll, _reseauPage)
window.benchMissedSort = function(col){const cur=_S._missedSortCol||'freq';_S._missedSortDir=cur===col&&_S._missedSortDir!=='asc'?'asc':'desc';_S._missedSortCol=col;_S._reseauMissedPage=0;_S._reseauMissedShowAll=false;renderBenchmark();};
window.setRankSortKey = function(val){_S._rankSortKey=val;renderBenchmark();};
window.buildBenchBassinSelect = buildBenchBassinSelect;
window.renderReseauHeatmap = renderReseauHeatmap;
window.renderReseauNomades = renderReseauNomades;
window.renderReseauOrphelins = renderReseauOrphelins;
window.renderReseauFuites = renderReseauFuites;
window.renderNomadesMissedArts = renderNomadesMissedArts;
window.renderTable = renderTable;
window.renderDashboardAndCockpit = renderDashboardAndCockpit;
window.renderABCTab = renderABCTab;
window.renderCanalAgence = renderCanalAgence;
window.openCanalDrill = openCanalDrill;
window.openCanalDrillArticles = openCanalDrillArticles;
window.closeCanalDrill = closeCanalDrill;
window.exportCanalDrillCSV = exportCanalDrillCSV;
window.toggleWebColumn = function(){window._setClientView(_S._clientView==='multicanaux'?'tous':'multicanaux');};
window._cematinSearch = _cematinSearch;
window.showSilencieux60 = showSilencieux60;
window.renderMesClients = renderMesClients;
window._goCommercial = _goCommercial;
window.renderCurrentTab = renderCurrentTab;
window.openDiagnostic = openDiagnostic;
window.openDiagnosticCell = openDiagnosticCell;
window.openDiagnosticMetier = openDiagnosticMetier;
window.closeDiagnostic = closeDiagnostic;
window.executeDiagAction = executeDiagAction;
window.exportDiagnosticCSV = exportDiagnosticCSV;
window._diagV3FilterCategory = _diagV3FilterCategory;
window.toggleReconquestFilter = toggleReconquestFilter;
window.openArticlePanel = openArticlePanel;
window.closeArticlePanel = closeArticlePanel;
window.openNomadeArticleModal = openNomadeArticleModal;
window.closeNomadeArticleModal = closeNomadeArticleModal;
window._copyNomadeClientsClipboard = _copyNomadeClientsClipboard;
window.openCmdPalette = openCmdPalette;
window._cmdExec = _cmdExec;
window._cmdMoveSelection = _cmdMoveSelection;
window._cmdRender = _cmdRender;
window._cmdBuildResults = _cmdBuildResults;
window.closeCmdPalette = () => { const p=document.getElementById('cmdPalette'); if(p)p.classList.add('hidden'); };
window.openReporting = openReporting;
window.closeReporting = closeReporting;
window.copyReportText = copyReportText;
window.generateReportText = generateReportText;
window.importExclusionsJSON = importExclusionsJSON;
window._doCopyCode = _doCopyCode;
window._copyAllCodesDirect = _copyAllCodesDirect;
window.updatePeriodAlert = updatePeriodAlert;
window.togglePeriodDropdown = togglePeriodDropdown;
window.toggleTabPeriodDropdown = toggleTabPeriodDropdown;
window._onPurgeCache = _onPurgeCache;
window._onReloadFiles = _onReloadFiles;
window._clearCache = _clearCache;
window._showCacheBanner = _showCacheBanner;
window.resetTerrFilters = resetTerrFilters;
window.exportContribCSV = exportContribCSV;
window.toggleContribSecteur = toggleContribSecteur;
window.toggleContribClient = toggleContribClient;
window._setCrossFilter = _setCrossFilter;
window._toggleDeptDropdown = _toggleDeptDropdown;
window._toggleClassifDropdown = _toggleClassifDropdown;
window._toggleActPDVDropdown = _toggleActPDVDropdown;
window._toggleStatutDropdown = _toggleStatutDropdown;
window._toggleDirectionDropdown = _toggleDirectionDropdown;
window._onActPDVSelect = _onActPDVSelect;
window._onStatutDetailleSelect = _onStatutDetailleSelect;
window._onStatutSelect = _onStatutSelect;
window._onUniversSelect = _onUniversSelect;
window._toggleStrategiqueFilter = _toggleStrategiqueFilter;
window._onCommercialFilter = _onCommercialFilter;
window._onDistanceSlider = _onDistanceSlider;
window._onTerrClientSearch = _onTerrClientSearch;
window._onMetierFilter = _onMetierFilter;
window._navigateToOverviewMetier = _navigateToOverviewMetier;
window._togglePerdu24m = _togglePerdu24m;
window._resetChalandiseFilters = _resetChalandiseFilters;
window.onFileSelected = onFileSelected;
window._updateAnalyserBtn = _updateAnalyserBtn;
window._saveSessionToIDB = _saveSessionToIDB;
window.onObsCompareChange = onObsCompareChange;
window.onObsFilterChange = onObsFilterChange;
window.resetObsFilters = resetObsFilters;
window._setBenchPeriode = _setBenchPeriode;
window._onPromoFamilleChange = _onPromoFamilleChange;
window._applyPromoFilters = _applyPromoFilters;
window.buildTerrContrib = buildTerrContrib;
window.renderTerrContrib = renderTerrContrib;
window.renderContribClients = renderContribClients;
window.renderContribArticles = renderContribArticles;
window._toggleClientArticles = _toggleClientArticles;
window.openClient360 = openClient360;
window._c360SwitchTab = _c360SwitchTab;
window._c360CopyResume = _c360CopyResume;
window.excludeClient = _showExcludePrompt;
window.confirmExclude = _confirmExclude;
window._showExcludePrompt = _showExcludePrompt;
window._confirmExclude = _confirmExclude;
window._unexcludeClient = _unexcludeClient;
window.renderComparison = renderComparison;
window.generateDecisionQueue = generateDecisionQueue;
window.renderHealthScore = renderHealthScore;
window.renderIRABanner = renderIRABanner;
window.exportAgenceSnapshot = exportAgenceSnapshot;
window._loadIRAHistory = _loadIRAHistory;
window.renderTabBadges = renderTabBadges;
window.clipERP = clipERP;
window.exportCockpitResume = exportCockpitResume;
window.applyPeriodFilter = applyPeriodFilter;
window.resetPeriodFilter = function(){applyPeriodFilter(null,null);};
function renderSidebarAgenceSelector() {
  // Navbar: static agence code display (no dropdown)
  const navSt = document.getElementById('navStore');
  if (navSt) { navSt.textContent = _S.selectedMyStore || ''; navSt.classList.toggle('hidden', !_S.selectedMyStore); }
}
window.updateNavStore = renderSidebarAgenceSelector;
window.renderSidebarAgenceSelector = renderSidebarAgenceSelector;
// Animation tab — fonctions HTML onclick
window._animAnalyze = _animAnalyze;
window._animClear = _animClear;
window._animInputChange = _animInputChange;
window._animSetCanal = _animSetCanal;
window._animApplyFilters = _animApplyFilters;
window._animResetFilters = _animResetFilters;
window._animExportA = _animExportA;
window._animExportC = _animExportC;
// Promo / Obs / Bench — fonctions HTML onclick non encore exposées
window._clearPromoImport = _clearPromoImport;
window._closePromoSuggest = _closePromoSuggest;
window._onPromoImportFileChange = _onPromoImportFileChange;
window._onPromoInput = _onPromoInput;
window._promoSuggestKeydown = _promoSuggestKeydown;
window._selectPromoSuggestion = _selectPromoSuggestion;
window._resetPromoFilters = _resetPromoFilters;
window._togglePromoImportSection = _togglePromoImportSection;
window._togglePromoSection = _togglePromoSection;
window._obsNav = _obsNav;
window.copyObsActionPlan = copyObsActionPlan;
window.copyObsSection = copyObsSection;
window.copyPepitesList = copyPepitesList;
window.copyPromoClipboard = copyPromoClipboard;
window.exportPromoCSV = exportPromoCSV;
window.getBenchCompareStores = getBenchCompareStores;
window.runPromoImport = runPromoImport;
window.runPromoSearch = runPromoSearch;
// ui.js — fonctions HTML onclick non encore exposées
window.clearSavedKPI = clearSavedKPI;
window.collapseImportZone = collapseImportZone;
window.downloadCSV = downloadCSV;
window.exportKPIhistory = exportKPIhistory;
window.importKPIhistory = importKPIhistory;
window.renderObsArticleSearch = renderObsArticleSearch;
window.copyPepitesOtherList = copyPepitesOtherList;
window.copyNomadesMissedArts = copyNomadesMissedArts;
window.exportPromoImportCSV = exportPromoImportCSV;
window.wrapGlossaryTerms = wrapGlossaryTerms;
// Cockpit Client territoire — toggle sections & exports (appelés via onclick dans le HTML généré)
window._cockpitToggleSection    = _cockpitToggleSection;
window._cockpitToggleFullList   = _cockpitToggleFullList;
window.exportCockpitCSV         = exportCockpitCSV;
window.exportCockpitCSVAll      = exportCockpitCSVAll;
window.exportExclusionsJSON     = exportExclusionsJSON;
// Territoire / Vue Terrain — toggles direction/métier/secteur/famille (onclick HTML généré)
window._toggleOverviewL2        = _toggleOverviewL2;
window._toggleOverviewL3        = _toggleOverviewL3;
window._toggleOverviewL4        = _toggleOverviewL4;
window._toggleOverviewClassif   = _toggleOverviewClassif;
window._toggleOverviewActPDV    = _toggleOverviewActPDV;
window._toggleOverviewStatut    = _toggleOverviewStatut;
window._toggleOverviewDirection = _toggleOverviewDirection;
window._toggleOverviewUnivers   = _toggleOverviewUnivers;
window._toggleDept              = _toggleDept;
window.toggleTerrDir            = toggleTerrDir;
window.toggleTerrDirStatus      = toggleTerrDirStatus;
window.toggleTerrFam            = toggleTerrFam;
window.toggleContribDirection   = toggleContribDirection;
// Cockpit Client — exclusions & liste masquée
window._toggleExcludedList      = _toggleExcludedList;
window._unexcludeAll            = _unexcludeAll;
// Benchmark Obs — expand famille
window.toggleObsFamily          = toggleObsFamily;
// Promo — accordion inline (also wired at processData)

// Wrap glossary terms on static headers at load time (before any file is loaded)
wrapGlossaryTerms(document);
// D2 — Theme Switch
initTheme();
window.cycleTheme = cycleTheme;

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
  // Pagination — Top clients PDV
  _topPDVExpand:   ()=>{_S._clientsPDVPage=1;_renderTopClientsPDV();},
  _topPDVCollapse: ()=>{_S._clientsPDVPage=0;_renderTopClientsPDV();},
  _topPDVPage:     (el)=>{_S._clientsPDVPage=Math.max(1,(_S._clientsPDVPage||1)+parseInt(el.dataset.dir));_renderTopClientsPDV();},
  // Pagination — Hors zone
  _horsZoneExpand:   ()=>{_S._horsZonePage=1;_renderHorsZone();},
  _horsZoneCollapse: ()=>{_S._horsZonePage=0;_renderHorsZone();},
  _horsZonePage:     (el)=>{_S._horsZonePage=Math.max(1,(_S._horsZonePage||1)+parseInt(el.dataset.dir));_renderHorsZone();},
  // Pagination — Opportunités nettes
  _oppNettePage: (el)=>{_S._oppNettePage=Math.max(1,(_S._oppNettePage||1)+parseInt(el.dataset.dir));renderTerritoireTab();},
  // Pagination — Réseau (missed / under)
  _reseauShowAll: (el)=>{const s=el.dataset.section;if(s==='missed'){_S._reseauMissedShowAll=true;_S._reseauMissedPage=0;}else{_S._reseauUnderShowAll=true;_S._reseauUnderPage=0;}renderBenchmark();},
  _reseauPage: (el)=>{const s=el.dataset.section,dir=parseInt(el.dataset.dir);if(s==='missed'){const t=Math.max(1,Math.ceil((DataStore.benchLists.missed?.length||0)/10));_S._reseauMissedPage=Math.max(0,Math.min((_S._reseauMissedPage||0)+dir,t-1));}else{const t=Math.max(1,Math.ceil((DataStore.benchLists.under?.length||0)/10));_S._reseauUnderPage=Math.max(0,Math.min((_S._reseauUnderPage||0)+dir,t-1));}renderBenchmark();},
};

document.addEventListener('click', (e)=>{
  const el=e.target.closest('[data-action]');
  if(!el)return;
  const handler=ACTION_REGISTRY[el.dataset.action];
  if(handler){e.preventDefault();handler(el,e);}
});
