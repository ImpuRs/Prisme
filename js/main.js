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

import { PAGE_SIZE, CHUNK_SIZE, TERR_CHUNK_SIZE, DORMANT_DAYS, NOUVEAUTE_DAYS, SECURITY_DAYS, HIGH_PRICE, METIERS_STRATEGIQUES, AGE_BRACKETS, FAM_LETTER_UNIVERS, RADAR_LABELS, SECTEUR_DIR_MAP, AGENCE_CP } from './constants.js';
import { cleanCode, extractClientCode, cleanPrice, formatEuro, pct, parseExcelDate, daysBetween, getVal, extractStoreCode, readExcel, yieldToMain, getAgeBracket, getAgeLabel, _median, _doCopyCode, _copyCodeBtn, _copyAllCodesDirect, fmtDate, _resetColCache, escapeHtml, formatLocalYMD, extractFamCode, famLib, famLabel, sortRowsInPlace, buildSparklineSVG } from './utils.js';
import { _S, resetAppState, assertPostParseInvariants, invalidateCache } from './state.js';
import { enrichPrixUnitaire, estimerCAPerdu, calcPriorityScore, prioClass, prioLabel, isParentRef, computeABCFMR, calcCouverture, formatCouv, couvColor, computeClientCrossing, _clientUrgencyScore, _clientStatusBadge, _clientStatusText, _unikLink, _crossBadge, _passesClientCrossFilter, clientMatchesDeptFilter, clientMatchesClassifFilter, clientMatchesStatutFilter, clientMatchesActivitePDVFilter, clientMatchesStatutDetailleFilter, clientMatchesDirectionFilter, clientMatchesCommercialFilter, clientMatchesMetierFilter, clientMatchesUniversFilter, _clientPassesFilters, _diagClientPrio, _diagClassifPrio, _diagClassifBadge, _isGlobalActif, _isPDVActif, _isPerdu, _isProspect, _isPerdu24plus, _radarComputeMatrix, computeReconquestCohort, computeSPC, computeOpportuniteNette, computeAnglesMorts, resetBenchMetierCache, computeOmniScores, computeFamillesHors, applyVerdictOverrides, computeSquelette } from './engine.js';
import { parseChalandise, parseLivraisons, toggleSecteurDropdown, toggleAllSecteurs, onSecteurChange, computeBenchmark, launchClientWorker, loadCpCoords, _computeChalandiseDistances } from './parser.js';
import { showToast, ToastManager, updateProgress, updatePipeline, showLoading, hideLoading, onFileSelected, _updateAnalyserBtn, collapseImportZone, expandImportZone, switchTab, switchSuperTab, openFilterDrawer, closeFilterDrawer, populateSelect, getFilteredData, renderAll, onFilterChange, debouncedRender, resetFilters, filterByAge, clearAgeFilter, updateActiveAgeIndicator, filterByAbcFmr, showCockpitInTable, clearCockpitFilter, _toggleNouveautesFilter, updatePeriodAlert, renderInsightsBanner, openReporting, sortBy, changePage, openCmdPalette, _cmdExec, _cmdMoveSelection, _cmdRender, _cmdBuildResults, closeReporting, copyReportText, switchReportTab, clearSavedKPI, exportKPIhistory, importKPIhistory, downloadCSV, clipERP, wrapGlossaryTerms, exportCockpitResume, renderHealthScore, exportAgenceSnapshot, renderTabBadges, _cematinSearch, showSilencieux60, _loadIRAHistory, _renderNoStockPlaceholder, focusTrap, toggleNavKpis, initDetailsAnimations, renderCockpitBriefing, buildSqLookup, initColSelector, _applyColVisibility } from './ui.js';
import { _saveToCache, _restoreFromCache, _clearCache, _showCacheBanner, _onReloadFiles, _onPurgeCache, _saveExclusions, _restoreExclusions, _saveSessionToIDB, _restoreSessionFromIDB, _clearIDB, _migrateIDB, _checkFilesUnchanged, _saveFileHashes } from './cache.js';
import { getVentesClientMagFull, hasVentesClientMagFull } from './sales.js';
import { buildPagerHtml, deltaColor, csvCell, renderOppNetteTable } from './helpers.js';
import { initRouter } from './router.js';
import { buildClientStore } from './client-store.js';
import { applyForcageCommercial as _applyForcageCommercial } from './chalandise-store.js';
import { buildAgenceStore } from './agence-store.js';
import { DataStore } from './store.js';
window._S = _S; // debug + accès depuis nl.js et console DevTools
import { _onPromoInput, _closePromoSuggest, _selectPromoSuggestion, _promoSuggestKeydown, runPromoSearch, _onPromoFamilleChange, _applyPromoFilters, _resetPromoFilters, _togglePromoSection, exportTourneeCSV, exportPromoCSV, copyPromoClipboard, _onPromoImportFileChange, _clearPromoImport, runPromoImport, _togglePromoImportSection, exportPromoImportCSV, resetPromo, _togglePromoClientRow, _switchPromoTab, _exportCommercialCSV, _renderSearchResults } from './promo.js';
import { openDiagnostic, openDiagnosticMetier, closeDiagnostic, executeDiagAction, closeArticlePanel, openArticlePanel, renderDiagnosticPanel, _renderDiagnosticCellPanel, exportDiagnosticCSV, _diagV3FilterCategory, toggleReconquestFilter, openClient360, _c360SwitchTab, _c360CopyResume } from './diagnostic.js';
import { renderLaboTab, updateLaboTiles } from './labo.js';
import { renderPlanRayon, renderPlanStock } from './planRayon.js';
import { renderArbitrageRayonBlock } from './emplacement.js';
import { renderAnimationTab, loadCatalogueMarques } from './animation.js';
import { renderAssociationsTab } from './associations.js?v=20260425m';
// ── P3 Modules — extracted from main.js ──
// bench.js démantelé — fonctions réseau supprimées
import { renderCanalAgence, openCanalDrill, openCanalDrillArticles, closeCanalDrill, exportCanalDrillCSV, getKPIsByCanal, computePhantomArticles, _setTerrClientsCanalFilter, renderOmniTab, SEG_LABELS } from './omni.js';
import { _renderGhostArticles, toggleTerrDir, toggleTerrDirStatus, toggleTerrFam, buildTerrContrib, renderTerrContrib, toggleContribDirection, toggleContribSecteur, renderContribClients, toggleContribClient, renderContribArticles, resetTerrFilters, exportContribCSV, exportTerritoireCSV } from './territoire.js';
import { _renderHorsZone, _passesAllFilters, computeTerritoireKPIs, computeClientsKPIs, renderTerritoireTab, renderCockpitRupClients, renderMesClients, renderCommerceTab, _toggleOverviewClassif, _toggleOverviewActPDV, _toggleOverviewStatut, _toggleOverviewDirection, _onActPDVSelect, _onStatutDetailleSelect, _onStatutSelect, _onUniversSelect, _toggleOverviewUnivers, _buildDeptFilter, _toggleDept, _resetChalandiseFilters, _toggleDeptDropdown, _toggleClassifDropdown, _toggleActPDVDropdown, _toggleStatutDropdown, _toggleDirectionDropdown, _toggleStrategiqueFilter, _onCommercialFilter, _updateDistQuickBtns, _onTerrClientSearch, _onMetierFilter, _navigateToOverviewMetier, _togglePerdu24m, _buildOverviewFilterChips, _buildChalandiseOverview, _toggleOverviewL2, _toggleOverviewL3, _toggleOverviewL4, _toggleClientArticles, _cockpitToggleFullList, _cockpitToggleSection, _setPDVCanalFilter, _buildDegradedCockpit, _buildCockpitClient, _setCrossFilter, _setClientView, _cockpitRowCSV, _downloadCockpitCSV, exportCockpitCSV, exportCockpitCSVAll, _showExcludePrompt, _confirmExclude, _unexcludeClient, _unexcludeAll, _toggleExcludedList, exportExclusionsJSON, importExclusionsJSON, _toggleHorsMagasin } from './commerce.js?v=20260425f';

// Cache-buster homogène : si `js/main.js` est servi avec `?v=...`, appliquer la même
// version aux Web Workers pour éviter les mismatchs (browser cache très agressif).
const _ASSET_VER = (() => {
  try { return new URL(import.meta.url).searchParams.get('v') || ''; } catch (_) { return ''; }
})();
const _ASSET_VER_Q = _ASSET_VER ? ('?v=' + encodeURIComponent(_ASSET_VER)) : '';

// ── Mobile / Low-memory mode (iPhone Safari, petites RAM) ──────────────────
function _detectLowMemMode() {
  try {
    const ua = navigator.userAgent || '';
    const isIOS = /iP(hone|ad|od)/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    if (isIOS) return true; // tous les navigateurs iOS = WebKit (limites mémoire similaires)
  } catch (_) {}
  return false;
}
if (!_S.lowMemMode) _S.lowMemMode = _detectLowMemMode();
if (_S.lowMemMode) console.warn('[PRISME] Mode memoire faible actif (mobile) — pipeline allege');

  // ── Filtre période global ──
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
  let _warnedByMonthClientsMissing = false;
  function applyPeriodFilter(startTs,endTs){
    const tdd=document.getElementById('tabPeriodDropdown');if(tdd)tdd.classList.add('hidden');
    _S.periodFilterStart=startTs?new Date(+startTs):null;
    _S.periodFilterEnd=endTs?new Date(+endTs):null;
    invalidateCache('tab', 'terr');

    // Chemin rapide — byMonth disponible (nouveau worker) → refilter <100ms
    if(_S._byMonth){
      _refilterFromByMonth();
      if((!_S._byMonthClients||!_S._byMonthClientsByCanal||!_S._byMonthClientCAByCanal)&&!_warnedByMonthClientsMissing){
        showToast('⚠️ Cache ancien : refilter tous canaux partiel (clients/CA par canal). Rechargez le fichier consommé une fois pour recalculer correctement INTERNET/REPRÉSENTANT/DCS sur une nouvelle période.','warning',7000);
        _warnedByMonthClientsMissing=true;
      }
      buildPeriodFilter();
      computeClientCrossing();_computeClientDominantUnivers();
      renderCanalAgence();renderCurrentTab();
      if(_S.selectedMyStore)_saveSessionToIDB().catch(err=>console.warn('[applyPeriodFilter] IDB save error:',err));
      return;
    }

    buildPeriodFilter(); // mettre à jour labels boutons + état pills
    const _refilterDataC=(_S._rawDataCFiltered?.rows?.length)?_S._rawDataCFiltered:_S._rawDataC;
    if(_refilterDataC?.rows?.length){
      // Données brutes disponibles (ancienne session) — re-parser via processDataFromRaw
      processDataFromRaw(_refilterDataC,_S._rawDataS||[],{isRefilter:true});
    }else if(_S._fileC){
      // Fallback — fichiers disponibles mais byMonth absent (edge case IDB ancien cache)
      (async()=>{
        showLoading('Recalcul période…','');
        try{
          // IMPORTANT : éviter Promise.all(arrayBuffer) qui double le pic mémoire (iOS / PC low-RAM).
          const _allFilesC = _S._filesC || [_S._fileC];
          const parseResult=await launchParseWorkerFromFiles(_allFilesC,_S._fileS||null,{
            selectedStore:_S.selectedMyStore||'',
            periodStart:_S.periodFilterStart?_S.periodFilterStart.getTime():null,
            periodEnd:_S.periodFilterEnd?_S.periodFilterEnd.getTime():null,
            isRefilter:true,
            lowMem: !!_S.lowMemMode,
          });
          // Sauvegarder les données période-invariantes avant hydratation
          const _savedFull=_S.ventesLocalMag12MG.size?_S.ventesLocalMag12MG:new Map([..._S.ventesLocalMagPeriode].map(([cc,arts])=>[cc,new Map(arts)]));
          const _savedHors=_S.ventesLocalHorsMag;
          const _savedLastOrderAll=_S.clientLastOrderAll;
          const _savedLastOrderByCanal=_S.clientLastOrderByCanal;
          _hydrateStateFromParseResult(parseResult,_S.selectedMyStore);
          // Restaurer les invariants période (hors-MAGASIN ne change pas au refilter)
          if(!_S.ventesLocalMag12MG.size&&_savedFull.size)_S.ventesLocalMag12MG=_savedFull;
          if(!_S.ventesLocalHorsMag.size&&_savedHors.size)_S.ventesLocalHorsMag=_savedHors;
          if(!_S.clientLastOrderAll.size&&_savedLastOrderAll.size)_S.clientLastOrderAll=_savedLastOrderAll;
          if(!_S.clientLastOrderByCanal.size&&_savedLastOrderByCanal.size)_S.clientLastOrderByCanal=_savedLastOrderByCanal;
          enrichPrixUnitaire();_enrichFinalDataWithCA();
          if(!_S.lowMemMode&&_S.storesIntersection.size>1&&_S.selectedMyStore){invalidateCache('bench');computeBenchmark();}
          if(!_S.lowMemMode){computeClientCrossing();_computeClientDominantUnivers();}
          renderCanalAgence();renderCurrentTab();

        }catch(err){showToast('⚠️ Erreur refilter: '+err.message,'warning');renderCanalAgence();renderCurrentTab();}
        finally{hideLoading();}
      })();
    }else{
      // Données brutes non disponibles (session restaurée depuis IDB) — re-render léger
      showToast('⚠️ Agrégats figés — rechargez le fichier consommé pour recalculer sur cette période','warning');
      renderCanalAgence();renderCurrentTab();
    }
  }

  // ── _refilterFromByMonth — reconstruction instantanée ventesLocalMagPeriode + canalAgence ──
  // Appelé quand _S._byMonth est disponible. Opère en <100ms sans re-lancer le Worker.
  let _refilterRunning=false;
  function _refilterFromByMonth(){
    if(!_S._byMonth){
      applyPeriodFilter(_S.periodFilterStart?.getTime()||null,_S.periodFilterEnd?.getTime()||null);
      return;
    }
    if(_refilterRunning){console.warn('[refilter] appel concurrent bloqué');return;}
    _refilterRunning=true;
    try{
    const pStart=_S.periodFilterStart;
    const pEnd=_S.periodFilterEnd;
    const startIdx=pStart?(pStart.getFullYear()*12+pStart.getMonth()):0;
    const endIdx=pEnd?(pEnd.getFullYear()*12+pEnd.getMonth()):999999;
    const activeCanal=_S._globalCanal||'';
    const mode=_S._reseauMagasinMode||'all';

    // ── Reconstruire ventesLocalMagPeriode ──
    const newVCA=new Map();
    const newClientsMagasin=new Set();
    const newClientsMagasinFreq=new Map();

    if(!activeCanal||activeCanal==='MAGASIN'){
      // Chemin MAGASIN — byMonth avec filtrage période + mode prélevé/enlevé
      const bm=_S._byMonth;
      if(bm){
        for(const cc in bm){
          const articles=bm[cc];
          for(const code in articles){
            const months=articles[code];
            for(const midxStr in months){
              const midx=+midxStr;
              if(midx<startIdx||midx>endIdx)continue;
              const d=months[midxStr];
              if(!d.sumCA&&!d.sumPrelevee)continue;
              if(!newVCA.has(cc))newVCA.set(cc,new Map());
              const artMap=newVCA.get(cc);
              if(!artMap.has(code))artMap.set(code,{sumPrelevee:0,sumCAPrelevee:0,sumCA:0,sumCAAll:0,countBL:0});
              const e=artMap.get(code);
              const _caP=d.sumCAPrelevee||0;
              const _caMode=mode==='preleve'?_caP:mode==='enleve'?(d.sumCA-_caP):d.sumCA;
              e.sumCA+=_caMode;
              if((d.sumPrelevee||0)>0)e.sumPrelevee+=d.sumPrelevee;
              e.sumCAPrelevee+=_caP;
              e.countBL+=d.countBL;
              if(d.sumPrelevee>0||d.sumCA>0){
                newClientsMagasin.add(cc);
                newClientsMagasinFreq.set(cc,(newClientsMagasinFreq.get(cc)||0)+d.countBL);
              }
            }
          }
        }
      }
    } else {
      // Chemin hors-MAGASIN — ventesLocalHorsMag filtré par canal
      // Pas de filtrage période au niveau client (byMonth n'existe que pour MAGASIN)
      const vchm=_S.ventesLocalHorsMag;
      if(vchm){
        for(const[cc,artMap]of vchm){
          for(const[code,d]of artMap){
            if(d.canal!==activeCanal)continue;
            if(!newVCA.has(cc))newVCA.set(cc,new Map());
            const artMapNew=newVCA.get(cc);
            if(!artMapNew.has(code))artMapNew.set(code,{sumPrelevee:0,sumCAPrelevee:0,sumCA:0,sumCAAll:0,countBL:0});
            const e=artMapNew.get(code);
            const _caP=d.sumCAPrelevee||0;
            const _caMode=mode==='preleve'?_caP:mode==='enleve'?((d.sumCA||0)-_caP):(d.sumCA||0);
            e.sumCA+=_caMode;
            if((d.sumPrelevee||0)>0)e.sumPrelevee+=d.sumPrelevee||0;
            e.sumCAPrelevee+=_caP;
            e.countBL+=d.countBL||0;
          }
        }
      }
    }

    // sumCAAll : copier depuis ventesLocalMag12MG (pleine période) — MAGASIN uniquement
    if((!activeCanal||activeCanal==='MAGASIN')&&hasVentesClientMagFull()){
      const _fullVCA = getVentesClientMagFull();
      for(const[cc,artMap]of newVCA){
        const fullMap=_fullVCA.get(cc);
        if(!fullMap)continue;
        for(const[code,e]of artMap){
          const ef=fullMap.get(code);
          if(ef)e.sumCAAll=ef.sumCAAll||0;
        }
      }
    }

    _S.ventesLocalMagPeriode=newVCA;
    _S.clientsMagasin=newClientsMagasin;
    _S.clientsMagasinFreq=newClientsMagasinFreq;

    // ── Reconstruire _clientsTousCanaux : clients uniques dans la période (tous canaux) ──
    if(_S._byMonthClients){
      const allClients=new Set();
      for(const midxStr in _S._byMonthClients){
        const midx=+midxStr;
        if(midx<startIdx||midx>endIdx)continue;
        for(const cc of _S._byMonthClients[midxStr])allClients.add(cc);
      }
      _S._clientsTousCanaux=allClients;
    }else{
      _S._clientsTousCanaux=null;
    }

    // ── Reconstruire canalAgence depuis byMonthCanal ──
    const bmc=_S._byMonthCanal;
    if(bmc){
      const newCanalAgence={};
      for(const store in bmc){
        if(_S.selectedMyStore&&store!==_S.selectedMyStore)continue;
        for(const canal in bmc[store]){
          const months=bmc[store][canal];
          for(const midxStr in months){
            const midx=+midxStr;
            if(midx<startIdx||midx>endIdx)continue;
            const d=months[midxStr];
            if(!newCanalAgence[canal])newCanalAgence[canal]={bl:0,blP:0,blE:0,ca:0,caP:0,caE:0,sumVMB:0,sumVMBP:0};
            newCanalAgence[canal].bl+=d.countBL;
            newCanalAgence[canal].blP+=(d.countBLP||0);
            newCanalAgence[canal].blE+=(d.countBLE||0);
            const _caP_c=(canal==='MAGASIN')?(d.sumPrelevee||0):0;
            const _caMode_c=(canal==='MAGASIN'&&mode==='preleve')?_caP_c:(canal==='MAGASIN'&&mode==='enleve')?(d.sumCA-_caP_c):d.sumCA;
            newCanalAgence[canal].ca+=_caMode_c;
            newCanalAgence[canal].caP+=d.sumPrelevee||0;
            newCanalAgence[canal].caE+=(d.sumCA-(d.sumCAPrelevee||d.sumPrelevee||0));
            newCanalAgence[canal].sumVMB+=d.sumVMB||0;
            newCanalAgence[canal].sumVMBP+=d.sumVMBP||0;
          }
        }
      }
_S.canalAgence=newCanalAgence;
    }

    // ── Reconstruire ventesParAgenceByCanal depuis _byMonthStoreArtCanal ──
    // Fix bug Réseau : KPI Comparatifs, storePerf, familyPerf tournaient sur pleine période
    // peu importe le filtre. vbc alimente computeBenchmark en mode multi-canal via parser.js.
    // On ne reconstruit PAS _S.ventesParAgence car son sumPrelevee (qté) n'est pas stockable
    // dans bmsac (où sumPrelevee = CA prélevé). Autres onglets restent sur vpm pleine période.
    const bmsac=_S._byMonthStoreArtCanal;
    if(bmsac){
      const newVpmByCanal={};
      for(const store in bmsac){
        const canalMap=bmsac[store];
        for(const canal in canalMap){
          const codeMap=canalMap[canal];
          for(const code in codeMap){
            const months=codeMap[code];
            let sumCA=0,sumPrel=0,countBL=0,sumVMB=0,sumVMBPrel=0;
            for(const midxStr in months){
              const midx=+midxStr;
              if(midx<startIdx||midx>endIdx)continue;
              const d=months[midxStr];
              sumCA+=d.sumCA||0;
              sumPrel+=d.sumPrelevee||0;
              countBL+=d.countBL||0;
              sumVMB+=d.sumVMB||0;
              sumVMBPrel+=d.sumVMBPrel||0;
            }
            if(!countBL&&!sumCA)continue;
            if(!newVpmByCanal[store])newVpmByCanal[store]={};
            if(!newVpmByCanal[store][canal])newVpmByCanal[store][canal]={};
            newVpmByCanal[store][canal][code]={sumCA,sumPrelevee:sumPrel,countBL,sumVMB,sumVMBPrel};
          }
        }
      }
      _S.ventesParAgenceByCanal=newVpmByCanal;
      // Invalider cache bench + recomputeBenchmark pour que benchLists reflète la période
      _S._benchCache=null;
      if(_S.storesIntersection.size>1&&_S.selectedMyStore){
        try{
          computeBenchmark();
        }catch(err){console.warn('[refilter] computeBenchmark error:',err);}
      }
    }

    // ── Recalculer ventesAnalysis depuis canalAgence reconstruit ──
    const _magData=_S.canalAgence?.['MAGASIN']||{};
    const _caMag=_magData.ca||0;
    const _vmbMag=_magData.sumVMB||0;
    const _blMag=_magData.bl||0;
    _S.ventesAnalysis=Object.assign({},_S.ventesAnalysis,{
      txMarge:_caMag>0?_vmbMag/_caMag*100:null,
      vmc:_blMag>0?_caMag/_blMag:null,
      totalBL:_blMag,
    });

    buildClientStore({ pdvOnly: true });
    // agenceStore déjà rebuilt par computeBenchmark (ligne 283)
    invalidateCache('tab'); // 'terr' invalidé par le caller si besoin (applyPeriodFilter le fait déjà)
    }finally{_refilterRunning=false;}
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
  window._applyPeriode6Mois=()=>{
    const maxD=_S.consommePeriodMaxFull||_S.consommePeriodMax;if(!maxD)return;
    _applyPeriode(new Date(maxD.getFullYear(),maxD.getMonth()-5,1),new Date(maxD.getFullYear(),maxD.getMonth()+1,0,23,59,59));
  };
  window._applyPeriode12MG=()=>{
    const maxD=_S.consommePeriodMaxFull||_S.consommePeriodMax;if(!maxD)return;
    _applyPeriode(new Date(maxD.getFullYear(),maxD.getMonth()-11,1),new Date(maxD.getFullYear(),maxD.getMonth()+1,0,23,59,59));
  };
  window._applyPeriodeAnneeEnCours=()=>{
    const maxD=_S.consommePeriodMaxFull||_S.consommePeriodMax;if(!maxD)return;
    const minD=_S.consommePeriodMinFull||_S.consommePeriodMin;
    const y=maxD.getFullYear();
    const janv=new Date(y,0,1);
    // Si les données ne couvrent pas janvier, on prend le 1er mois dispo de cette année
    const start=minD&&minD>janv?minD:janv;
    _applyPeriode(new Date(start.getFullYear(),start.getMonth(),1),new Date(maxD.getFullYear(),maxD.getMonth()+1,0,23,59,59));
  };

  function buildPeriodFilter(){
    const tabBlock=document.getElementById('tabPeriodBlock');
    const{mois}=_buildPeriodeOptions();
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
    // 6 derniers mois
    const t6start=mois.length>=6?new Date(mois[Math.max(0,mois.length-6)].getFullYear(),mois[Math.max(0,mois.length-6)].getMonth(),1).getTime():null;
    const t6end=t3end;
    // 12MG (12 mois glissants) — utile quand le consommé couvre >12 mois
    const t12start=mois.length>12?new Date(mois[mois.length-12].getFullYear(),mois[mois.length-12].getMonth(),1).getTime():null;
    const t12end=t3end;
    // Année en cours
    const minD=_S.consommePeriodMinFull||_S.consommePeriodMin;
    const yCur=maxD?maxD.getFullYear():null;
    const janvCur=yCur?new Date(yCur,0,1):null;
    const aeStart=janvCur&&minD?(minD>janvCur?new Date(minD.getFullYear(),minD.getMonth(),1).getTime():janvCur.getTime()):null;
    const aeEnd=t3end;
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
    ${t12start?predBtn('12 mois glissants',`${_fmtM(mois[mois.length-12])} → ${_fmtM(mois[mois.length-1])}`,'window._applyPeriode12MG()',ps===t12start&&pe===t12end):''}
    ${aeStart?predBtn('Année en cours',yCur,`window._applyPeriodeAnneeEnCours()`,ps===aeStart&&pe===aeEnd):''}
    ${t6start&&mois.length>=6?predBtn('6 derniers mois',`${_fmtM(mois[Math.max(0,mois.length-6)])} → ${_fmtM(mois[mois.length-1])}`,'window._applyPeriode6Mois()',ps===t6start&&pe===t6end):''}
    ${mois.length>=3?predBtn('3 derniers mois',`${_fmtM(mois[Math.max(0,mois.length-3)])} → ${_fmtM(mois[mois.length-1])}`,'window._applyPeriode3Mois()',ps===t3start&&pe===t3end):''}
    ${mcTs?predBtn('Mois en cours',_fmtM(maxD),'window._applyPeriodeMoisCourant()',ps===mcTs&&pe===mcEts):''}
    ${prevM&&mois.length>=2?predBtn('Mois précédent',_fmtM(prevM),'window._applyPeriodeMoisPrecedent()',ps===mpTs&&pe===mpEts):''}
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
        const sameMonth=minD&&maxD&&minD.getMonth()===maxD.getMonth()&&minD.getFullYear()===maxD.getFullYear();
        tabLabel.textContent=(minD&&maxD?(sameMonth?fmtDate(minD):`${fmtDate(minD)} → ${fmtDate(maxD)}`):'—')+' ▼';
        tabLabel.classList.remove('filtered');
      }
      updatePeriodAlert();
    }
    if(tabBlock)tabBlock.style.display='';
  }
  // ── Reporting ──
  function _getActiveFiltersLabel(){
    const parts=[];
    if(_S._selectedCommercial)parts.push(`Commercial : ${_S._selectedCommercial}`);
    if(_S._selectedMetier)parts.push(`Métier : ${_S._selectedMetier}`);
    if(_S._selectedDepts?.size)parts.push(`Dept : ${[..._S._selectedDepts].join(', ')}`);
    if(_S._selectedClassifs?.size)parts.push(`Classif : ${[..._S._selectedClassifs].join(', ')}`);
    if(_S._selectedActivitesPDV?.size)parts.push(`Activité PDV : ${[..._S._selectedActivitesPDV].join(', ')}`);
    if(_S._distanceMaxKm>0)parts.push(`Distance : ≤${_S._distanceMaxKm} km`);
    if(_S._filterStrategiqueOnly)parts.push('Métiers stratégiques uniquement');
    if(_S._selectedDirections?.size)parts.push(`Direction : ${[..._S._selectedDirections].join(', ')}`);
    if(_S._selectedUnivers?.size)parts.push(`Univers : ${[..._S._selectedUnivers].join(', ')}`);
    return parts.length?parts.join(' | '):'';
  }
  function _clientPassesReportFilter(rec){
    const info=_S.chalandiseData?.get(rec.cc);
    if(!info)return !_getActiveFiltersLabel();
    if(_S._distanceMaxKm>0&&info.distanceKm==null)return false;
    return _clientPassesFilters(info,rec.cc);
  }

  // ── Cohortes clients (partagé entre les deux prompts LLM) ──
  function _computeClientCohorts(withTop5){
    const result={silencieuxCount:0,silencieuxCA:0,silTop5:[],perdusCount:0,perdusCA:0,potentielsCount:0};
    if(!_S.clientStore?.size)return result;
    const arr=withTop5?[]:null;
    for(const rec of _S.clientStore.values()){
      if(!_clientPassesReportFilter(rec))continue;
      const d=rec.silenceDaysPDV??rec.silenceDaysAll;
      // Silencieux : 30-60j
      if(d!==null&&d>30&&d<=60&&(rec.caPDV>0||rec.caTotal>0)){
        const ca=rec.caTotal||rec.caPDV||0;
        result.silencieuxCount++;result.silencieuxCA+=ca;
        if(arr)arr.push({nom:rec.nom,ca,days:d});
      }
      // Perdus : 60-180j
      if(d!==null&&d>60&&d<=180&&(rec.caPDV>0||rec.caTotal>0)){
        result.perdusCount++;result.perdusCA+=(rec.caTotal||rec.caPDV||0);
      }
      // Potentiels
      if(rec.crossStatus==='potentiel'&&rec.caLegallaisN1>=500&&rec.caLegallaisN1<=50000&&rec.commercial){
        result.potentielsCount++;
      }
    }
    if(arr){arr.sort((a,b)=>b.ca-a.ca);result.silTop5=arr.slice(0,5);}
    return result;
  }

  function generateReportText(){
    const pStart=_S.periodFilterStart||_S.consommePeriodMinFull||_S.consommePeriodMin;
    const pEnd=_S.periodFilterEnd||_S.consommePeriodMaxFull||_S.consommePeriodMax;
    const agence=_S.selectedMyStore||'—';
    const MOIS=['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'];
    const periodHuman=(()=>{
      if(!pStart||!pEnd)return null;
      try{
        const s=new Date(pStart),e=new Date(pEnd);
        const sm=MOIS[s.getMonth()],em=MOIS[e.getMonth()];
        if(s.getFullYear()===e.getFullYear()) return sm===em?`${sm} ${s.getFullYear()}`:`${sm} à ${em} ${e.getFullYear()}`;
        return `${sm} ${s.getFullYear()} à ${em} ${e.getFullYear()}`;
      }catch{return null;}
    })();
    const periodLabel=periodHuman?(periodHuman.charAt(0).toUpperCase()+periodHuman.slice(1)):(pStart&&pEnd?`${fmtDate(pStart)} → ${fmtDate(pEnd)}`:'—');
    const ok=v=>v!==null&&v!==undefined&&!isNaN(v)&&v!=='';
    const n=v=>(v||0).toLocaleString('fr');
    const e=v=>formatEuro(v||0);
    const pct=v=>v!=null?(+v).toFixed(2)+'%':'—';

    // ── Collecte données ──
    const _ca_all=_S.canalAgence||{};
    const caMag=_ca_all['MAGASIN']?.ca||0;
    const blMag=_ca_all['MAGASIN']?.bl||0;
    const vmbMag=_ca_all['MAGASIN']?.sumVMB||0;
    const caWeb=_ca_all['INTERNET']?.ca||0;
    const caRep=_ca_all['REPRESENTANT']?.ca||0;
    const caDcs=_ca_all['DCS']?.ca||0;
    const caTotal=Object.values(_ca_all).reduce((s,d)=>s+(d.ca||0),0);
    const blTotal=Object.values(_ca_all).reduce((s,d)=>s+(d.bl||0),0);
    const vmbTotal=Object.values(_ca_all).reduce((s,d)=>s+(d.sumVMB||0),0);

    const nbClientsPDV=_S.ventesLocalMagPeriode?.size||0;
    let nbClientsAll=nbClientsPDV;
    {const _bmc=_S._byMonthClients;if(_bmc){const _pMin=_S.periodFilterStart||_S.consommePeriodMinFull||_S.consommePeriodMin;const _pMax=_S.periodFilterEnd||_S.consommePeriodMaxFull||_S.consommePeriodMax;if(_pMin&&_pMax){const _si=_pMin.getFullYear()*12+_pMin.getMonth();const _ei=_pMax.getFullYear()*12+_pMax.getMonth();const _set=new Set();for(const midxStr in _bmc){const midx=+midxStr;if(midx>=_si&&midx<=_ei)for(const cc of _bmc[midxStr])_set.add(cc);}if(_set.size>0)nbClientsAll=_set.size;}}else if(_S._clientsTousCanaux instanceof Set&&_S._clientsTousCanaux.size>0){nbClientsAll=_S._clientsTousCanaux.size;}}

    const txMarge=caTotal>0?vmbTotal/caTotal*100:0;
    const txMargeMag=caMag>0?vmbMag/caMag*100:0;

    // Stock
    let serviceOk=0,serviceTotal=0;
    for(const r of DataStore.finalData){if((r.fmrClass==='F'||r.fmrClass==='M')&&r.W>=1&&!r.isParent&&!(r.V===0&&r.enleveTotal>0)){serviceTotal++;if(r.stockActuel>0)serviceOk++;}}
    const txDispo=serviceTotal>0?Math.round((serviceOk/serviceTotal)*100):null;
    const ruptures=DataStore.finalData.filter(r=>(r.fmrClass==='F'||r.fmrClass==='M')&&r.W>=1&&r.stockActuel<=0&&!r.isParent&&!(r.V===0&&r.enleveTotal>0));
    const dormants=DataStore.finalData.filter(r=>!r.isNouveaute&&r.ageJours>DORMANT_DAYS&&(r.stockActuel*r.prixUnitaire)>50);
    const dormantVal=Math.round(dormants.reduce((s,r)=>s+r.stockActuel*r.prixUnitaire,0));
    const valStock=Math.round(DataStore.finalData.reduce((s,r)=>s+(r.stockActuel||0)*(r.prixUnitaire||0),0));

    // Benchmark
    const kpis=_S.benchLists.obsKpis;
    const hasBench=!!kpis;
    const lose=(_S.benchLists.obsFamiliesLose||[]).slice(0,10);
    const win=(_S.benchLists.obsFamiliesWin||[]).slice(0,10);
    const manquants=_S.benchLists.missed||[];
    const sp=_S.benchLists.storePerf||{};
    const spSorted=Object.entries(sp).sort((a,b)=>(b[1].ca||0)-(a[1].ca||0));
    const myRankIdx=spSorted.findIndex(([s])=>s===_S.selectedMyStore);

    // Clients (filtrés par les filtres chalandise actifs)
    const _coh1=_computeClientCohorts(true);
    const {silencieuxCount,silencieuxCA,silTop5}=_coh1;
    const {potentielsCount,perdusCount,perdusCA}=_coh1;
    const nbNomades=(_S.reseauNomades||[]).length;
    const nomadesMissed=(_S.nomadesMissedArts||[]).slice(0,10);

    // Pépites
    const pepites=(_S.benchLists.pepites||[]).slice(0,5);

    // ── Build prompt LLM ──
    const filtersLabel=_getActiveFiltersLabel();
    const L=[];
    L.push(`INSTRUCTIONS`);
    L.push(`Tu es un analyste BI pour un chef d'agence en distribution B2B quincaillerie (réseau Legallais).`);
    L.push(`Rédige un reporting synthétique et actionnable à partir des données ci-dessous.`);
    L.push(`Format : prose fluide, 1 page max, pas de bullet points, pas de langue de bois.`);
    L.push(`Structure : accroche chiffrée → forces/faiblesses → 3 priorités concrètes.`);
    L.push(`Ton : direct, professionnel, orienté action. Tu parles à un opérationnel, pas à un comité.`);
    L.push(`Termine par les 3 actions prioritaires numérotées, avec les chiffres associés.`);
    L.push('');
    L.push(`═══════════════════════════════════════════════════`);
    L.push(`DONNÉES AGENCE ${agence} — ${periodLabel}`);
    if(filtersLabel)L.push(`FILTRES ACTIFS : ${filtersLabel}`);
    L.push(`═══════════════════════════════════════════════════`);

    // Ventes
    L.push('');L.push('VENTES');
    L.push(`CA total tous canaux : ${e(caTotal)}`);
    L.push(`Clients actifs tous canaux : ${n(nbClientsAll)}`);
    L.push(`VMB totale : ${e(Math.round(vmbTotal))}`);
    L.push(`Taux de marge global : ${pct(txMarge)}`);
    L.push(`BL total : ${n(blTotal)}`);
    L.push(`VMC (CA/commande) : ${e(blTotal>0?Math.round(caTotal/blTotal):0)}`);
    L.push(`CA/client : ${e(nbClientsAll>0?Math.round(caTotal/nbClientsAll):0)}`);
    L.push(`Fréquence/client : ${nbClientsAll>0?(blTotal/nbClientsAll).toFixed(1)+'x':'—'}`);
    if(caMag>0){
      L.push('');L.push('CANAL MAGASIN (comptoir)');
      L.push(`CA Magasin : ${e(caMag)} (${caTotal>0?Math.round(caMag/caTotal*100):0}% du total)`);
      L.push(`Clients Magasin : ${n(nbClientsPDV)}`);
      L.push(`Marge Magasin : ${pct(txMargeMag)}`);
      L.push(`VMC Magasin : ${e(blMag>0?Math.round(caMag/blMag):0)}`);
    }
    if(caWeb>0||caRep>0||caDcs>0){
      L.push('');L.push('CANAUX HORS AGENCE');
      if(caWeb>0)L.push(`Internet : ${e(caWeb)}`);
      if(caRep>0)L.push(`Représentant : ${e(caRep)}`);
      if(caDcs>0)L.push(`DCS : ${e(caDcs)}`);
    }

    // Stock
    L.push('');L.push('STOCK');
    L.push(`Valeur stock : ${e(valStock)}`);
    L.push(`Références en stock : ${n(DataStore.finalData.length)}`);
    if(ok(txDispo))L.push(`Taux de disponibilité (articles courants) : ${txDispo}%`);
    L.push(`Ruptures actives (articles courants) : ${n(ruptures.length)}`);
    if(ruptures.length>0){
      const topRupt=ruptures.sort((a,b)=>(b.W||0)-(a.W||0)).slice(0,5);
      L.push(`Top 5 ruptures : ${topRupt.map(r=>`${r.code} ${(r.libelle||'').substring(0,30)} (W=${r.W}, ${r.abcClass}/${r.fmrClass})`).join(' | ')}`);
    }
    L.push(`Dormants (>${DORMANT_DAYS}j, >50€) : ${n(dormants.length)} articles, ${e(dormantVal)} immobilisés`);

    // Réseau
    if(hasBench){
      L.push('');L.push('POSITION RÉSEAU');
      if(myRankIdx>=0)L.push(`Rang : #${myRankIdx+1} sur ${spSorted.length} agences (trié par CA)`);
      if(ok(kpis.mine?.pdm))L.push(`Part de marché bassin : ${Math.round(kpis.mine.pdm)}%`);
      L.push(`Mon CA vs médiane : ${e(kpis.mine?.ca||0)} vs ${e(kpis.compared?.ca||0)} (${kpis.compared?.ca>0?Math.round(((kpis.mine?.ca||0)-(kpis.compared?.ca||0))/(kpis.compared?.ca)*100):0}%)`);
      L.push(`Ma marge vs médiane : ${pct(kpis.mine?.txMarge)} vs ${pct(kpis.compared?.txMarge)}`);
      L.push(`Part de marché stock réseau : ${kpis.mine?.serv||0}% vs méd. ${kpis.compared?.serv||0}%`);
      L.push(`Mes clients vs médiane : ${n(kpis.mine?.nbClients||0)} vs ${n(kpis.compared?.nbClients||0)}`);

      if(lose.length>0){
        L.push('');L.push('FAMILLES EN RETRAIT (vs médiane réseau)');
        for(const f of lose)L.push(`  ${f.fam} : mon CA ${e(f.caMe)} vs méd. ${e(f.caOther)} (${f.ecartPct}%), ${Math.max(0,f.refOther-f.refMe)} réf manquantes`);
      }
      if(win.length>0){
        L.push('');L.push('FAMILLES FORTES (vs médiane réseau)');
        for(const f of win)L.push(`  ${f.fam} : mon CA ${e(f.caMe)} vs méd. ${e(f.caOther)} (+${f.ecartPct}%)`);
      }
      if(manquants.length>0){
        const absents=manquants.filter(m=>(m.myFreq||0)===0).length;
        const sousExpl=manquants.length-absents;
        L.push('');L.push('ARTICLES INCONTOURNABLES RÉSEAU');
        L.push(`${n(manquants.length)} articles vendus par 50%+ des agences où je suis absent ou sous-exploité`);
        L.push(`  Absents de mes ventes : ${n(absents)}`);
        L.push(`  Sous-exploités (<80% moy) : ${n(sousExpl)}`);
      }
      if(pepites.length>0){
        L.push('');L.push('MES PÉPITES (articles où je surperforme)');
        for(const p of pepites)L.push(`  ${p.code} ${(p.lib||'').substring(0,30)} : moi ${p.myQte} vs réseau ${p.compQte} (+${p.ecartPct}%)`);
      }
    }

    // Commerciaux contributeurs
    if(_S.clientStore?.size && _S.chalandiseReady){
      const comCA=new Map();
      const comCli=new Map();
      const comSil=new Map();
      for(const rec of _S.clientStore.values()){
        if(!_clientPassesReportFilter(rec))continue;
        const com=rec.commercial;
        if(!com)continue;
        const ca=rec.caPDV||0;
        if(ca>0){
          comCA.set(com,(comCA.get(com)||0)+ca);
          comCli.set(com,(comCli.get(com)||0)+1);
        }
        const d=rec.silenceDaysPDV??rec.silenceDaysAll;
        if(d!==null&&d>30&&d<=180&&ca>0){
          comSil.set(com,(comSil.get(com)||0)+1);
        }
      }
      if(comCA.size>0){
        const sorted=[...comCA.entries()].sort((a,b)=>b[1]-a[1]);
        L.push('');L.push('COMMERCIAUX CONTRIBUTEURS');
        for(const [com,ca] of sorted){
          const cli=comCli.get(com)||0;
          const sil=comSil.get(com)||0;
          const silTag=sil>0?` | ${sil} silencieux/perdus`:'';
          L.push(`  ${com} : CA PDV ${e(ca)}, ${n(cli)} clients actifs${silTag}`);
        }
      }
    }

    // Directions / Secteurs (territoire)
    if(_S.terrContribByDirection?.size>0){
      L.push('');L.push('DIRECTIONS COMMERCIALES (territoire)');
      const sorted=[..._S.terrContribByDirection.entries()].sort((a,b)=>(b[1].ca||0)-(a[1].ca||0));
      for(const [dir,d] of sorted){
        if(!d.ca)continue;
        L.push(`  ${dir} : ${e(d.ca)} CA, ${n(d.blTerr||0)} BL`);
      }
    }

    // Métiers clients (chalandise)
    if(_S.clientStore?.size && _S.chalandiseReady){
      const metCA=new Map();
      const metCli=new Map();
      for(const rec of _S.clientStore.values()){
        if(!_clientPassesReportFilter(rec))continue;
        const met=rec.metier;
        if(!met)continue;
        const ca=rec.caTotal||rec.caPDV||0;
        if(ca>0){
          metCA.set(met,(metCA.get(met)||0)+ca);
          metCli.set(met,(metCli.get(met)||0)+1);
        }
      }
      if(metCA.size>0){
        const sorted=[...metCA.entries()].sort((a,b)=>b[1]-a[1]);
        const isStrat=(m)=>{const ml=m.toLowerCase();return METIERS_STRATEGIQUES.some(s=>ml.includes(s));};
        L.push('');L.push('MÉTIERS CLIENTS');
        for(const [met,ca] of sorted.slice(0,15)){
          const cli=metCli.get(met)||0;
          const tag=isStrat(met)?'⭐ ':'';
          L.push(`  ${tag}${met} : ${e(ca)}, ${n(cli)} clients`);
        }
        const nbStrat=sorted.filter(([m])=>isStrat(m)).length;
        const caStrat=sorted.filter(([m])=>isStrat(m)).reduce((s,[,ca])=>s+ca,0);
        if(nbStrat>0)L.push(`  → ${n(nbStrat)} métiers stratégiques (⭐) = ${e(caStrat)} (${caTotal>0?Math.round(caStrat/caTotal*100):0}% du CA)`);
      }
    }

    // Clients
    const hasClients=silencieuxCount>0||potentielsCount>0||perdusCount>0||nbNomades>0||nomadesMissed.length>0;
    if(hasClients){
      L.push('');L.push('DYNAMIQUE CLIENTS');
      if(silencieuxCount>0){
        L.push(`Clients silencieux (30-60j) : ${n(silencieuxCount)} clients, ${e(silencieuxCA)} de CA en jeu`);
        if(silTop5.length)L.push(`  Top 5 : ${silTop5.map(c=>`${c.nom} (${c.days}j, ${e(c.ca)})`).join(', ')}`);
      }
      if(perdusCount>0)L.push(`Clients perdus (60-180j) : ${n(perdusCount)} clients, ${e(perdusCA)} de CA en jeu`);
      if(potentielsCount>0)L.push(`Potentiels jamais venus au comptoir : ${n(potentielsCount)} clients`);
      if(nbNomades>0)L.push(`Clients nomades (achètent dans ≥2 agences) : ${n(nbNomades)}`);
      if(nomadesMissed.length>0){
        L.push(`Articles achetés par mes clients ailleurs (≥2 clients) : ${n(nomadesMissed.length)}`);
        for(const a of nomadesMissed.slice(0,5))L.push(`  ${a.code} ${(a.fam||'')} : ${a.nbClients} clients, ${e(a.totalCaOther)} CA autre agence`);
      }
    }

    // Pied
    L.push('');L.push(`═══════════════════════════════════════════════════`);
    L.push(`Source : PRISME · ${periodLabel} · ${new Date().toLocaleDateString('fr-FR')}`);

    return L.join('\n');
  }

  function generateRegionReportText(){
    const pStart=_S.periodFilterStart||_S.consommePeriodMinFull||_S.consommePeriodMin;
    const pEnd=_S.periodFilterEnd||_S.consommePeriodMaxFull||_S.consommePeriodMax;
    const agence=_S.selectedMyStore||'—';
    const MOIS=['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'];
    const periodHuman=(()=>{
      if(!pStart||!pEnd)return null;
      try{
        const s=new Date(pStart),e=new Date(pEnd);
        const sm=MOIS[s.getMonth()],em=MOIS[e.getMonth()];
        if(s.getFullYear()===e.getFullYear()) return sm===em?`${sm} ${s.getFullYear()}`:`${sm} à ${em} ${e.getFullYear()}`;
        return `${sm} ${s.getFullYear()} à ${em} ${e.getFullYear()}`;
      }catch{return null;}
    })();
    const periodLabel=periodHuman?(periodHuman.charAt(0).toUpperCase()+periodHuman.slice(1)):(pStart&&pEnd?`${fmtDate(pStart)} → ${fmtDate(pEnd)}`:'—');
    const n=v=>(v||0).toLocaleString('fr');
    const e=v=>formatEuro(v||0);
    const pct=v=>v!=null?(+v).toFixed(2)+'%':'—';

    const _ca_all=_S.canalAgence||{};
    const caMag=_ca_all['MAGASIN']?.ca||0;
    const vmbMag=_ca_all['MAGASIN']?.sumVMB||0;
    const blMag=_ca_all['MAGASIN']?.bl||0;
    const caWeb=_ca_all['INTERNET']?.ca||0;
    const caRep=_ca_all['REPRESENTANT']?.ca||0;
    const caDcs=_ca_all['DCS']?.ca||0;
    const caTotal=Object.values(_ca_all).reduce((s,d)=>s+(d.ca||0),0);
    const blTotal=Object.values(_ca_all).reduce((s,d)=>s+(d.bl||0),0);
    const vmbTotal=Object.values(_ca_all).reduce((s,d)=>s+(d.sumVMB||0),0);
    const nbClientsPDV=_S.ventesLocalMagPeriode?.size||0;
    let nbClientsAll=nbClientsPDV;
    {const _bmc=_S._byMonthClients;if(_bmc){const _pMin=_S.periodFilterStart||_S.consommePeriodMinFull||_S.consommePeriodMin;const _pMax=_S.periodFilterEnd||_S.consommePeriodMaxFull||_S.consommePeriodMax;if(_pMin&&_pMax){const _si=_pMin.getFullYear()*12+_pMin.getMonth();const _ei=_pMax.getFullYear()*12+_pMax.getMonth();const _set=new Set();for(const midxStr in _bmc){const midx=+midxStr;if(midx>=_si&&midx<=_ei)for(const cc of _bmc[midxStr])_set.add(cc);}if(_set.size>0)nbClientsAll=_set.size;}}else if(_S._clientsTousCanaux instanceof Set&&_S._clientsTousCanaux.size>0){nbClientsAll=_S._clientsTousCanaux.size;}}
    const txMarge=caTotal>0?vmbTotal/caTotal*100:0;
    const txMargeMag=caMag>0?vmbMag/caMag*100:0;

    let serviceOk=0,serviceTotal=0;
    for(const r of DataStore.finalData){if((r.fmrClass==='F'||r.fmrClass==='M')&&r.W>=1&&!r.isParent&&!(r.V===0&&r.enleveTotal>0)){serviceTotal++;if(r.stockActuel>0)serviceOk++;}}
    const txDispo=serviceTotal>0?Math.round((serviceOk/serviceTotal)*100):null;
    const ruptures=DataStore.finalData.filter(r=>(r.fmrClass==='F'||r.fmrClass==='M')&&r.W>=1&&r.stockActuel<=0&&!r.isParent&&!(r.V===0&&r.enleveTotal>0));
    const dormants=DataStore.finalData.filter(r=>!r.isNouveaute&&r.ageJours>DORMANT_DAYS&&(r.stockActuel*r.prixUnitaire)>50);
    const dormantVal=Math.round(dormants.reduce((s,r)=>s+r.stockActuel*r.prixUnitaire,0));
    const valStock=Math.round(DataStore.finalData.reduce((s,r)=>s+(r.stockActuel||0)*(r.prixUnitaire||0),0));

    const kpis=_S.benchLists.obsKpis;
    const hasBench=!!kpis;
    const lose=(_S.benchLists.obsFamiliesLose||[]).slice(0,5);
    const win=(_S.benchLists.obsFamiliesWin||[]).slice(0,5);
    const manquants=_S.benchLists.missed||[];
    const sp=_S.benchLists.storePerf||{};
    const spSorted=Object.entries(sp).sort((a,b)=>(b[1].ca||0)-(a[1].ca||0));
    const myRankIdx=spSorted.findIndex(([s])=>s===_S.selectedMyStore);

    const _coh2=_computeClientCohorts(false);
    const {silencieuxCount,silencieuxCA,perdusCount,perdusCA,potentielsCount}=_coh2;
    const nbNomades=(_S.reseauNomades||[]).length;

    const filtersLabel=_getActiveFiltersLabel();
    const L=[];
    L.push(`INSTRUCTIONS`);
    L.push(`Tu es un chef d'agence en distribution B2B quincaillerie (réseau Legallais).`);
    L.push(`Rédige ton reporting mensuel pour ta direction régionale, à la première personne.`);
    L.push(`Ce texte sera collé dans une cellule Excel — il doit être compact et agréable à lire.`);
    L.push(``);
    L.push(`RÈGLES D'ÉCRITURE (non négociables) :`);
    L.push(`  - Phrases courtes, toujours chiffrées. Pas d'adjectifs superflus.`);
    L.push(`  - Pas de dramatisation : pas de "scandale", "naufrage", "foudroyant", "intolérable"`);
    L.push(`  - Pas de jargon technique : "F+M" → "articles courants", "ABC/FMR" → ne pas mentionner`);
    L.push(`  - SYNTHÉTISE : ne recrache jamais une liste brute. Extrais le signal, pas le bruit.`);
    L.push(`  - Chaque phrase doit CONCLURE quelque chose, pas juste constater un chiffre.`);
    L.push(`  - Mets en contraste forces et faiblesses — le lecteur doit sentir l'équilibre.`);
    L.push(`  - Longueur totale : 350 mots max. La densité prime sur l'exhaustivité.`);
    L.push(``);
    L.push(`STRUCTURE (6 sections obligatoires) :`);
    L.push(``);
    L.push(`1. SYNTHÈSE (2 phrases max)`);
    L.push(`   Position, CA, le SEUL fait marquant qui résume le mois.`);
    L.push(``);
    L.push(`2. PERFORMANCE (3-4 phrases)`);
    L.push(`   CA total, rang, marge vs médiane. Ventilation canaux en UNE phrase.`);
    L.push(`   Ne pas lister les canaux un par un — donner la répartition en %.`);
    L.push(``);
    L.push(`3. STOCK (2-3 phrases)`);
    L.push(`   Dispo, ruptures, dormants. Conclure : est-ce un frein ou non ?`);
    L.push(``);
    L.push(`4. RÉSEAU + MÉTIERS (4-5 phrases)`);
    L.push(`   Position vs médiane en UNE phrase. Puis : les 2-3 familles fortes (regrouper si possible),`);
    L.push(`   les 2-3 familles en retrait (avec le gap €). Croiser avec les métiers stratégiques (⭐) :`);
    L.push(`   quels métiers portent la croissance ? Quels métiers sont sous-exploités ?`);
    L.push(`   NE PAS lister tous les métiers — identifier les 2-3 insights clés.`);
    L.push(``);
    L.push(`5. DYNAMIQUE COMMERCIALE + CLIENTS (3-4 phrases)`);
    L.push(`   Identifier le commercial principal et son poids. Alerter sur les silencieux/perdus`);
    L.push(`   en €, pas en liste de noms. Potentiels : combien, quel levier.`);
    L.push(`   NE PAS lister tous les commerciaux — donner la concentration et les alertes.`);
    L.push(``);
    L.push(`6. MES 3 ACTIONS (3 lignes max)`);
    L.push(`   Chaque action doit citer : la donnée qui déclenche (famille, commercial, ou segment client),`);
    L.push(`   le geste concret, la date butoir, le résultat attendu en €.`);
    L.push(`   Mauvais : "Lancer une campagne d'appels sur les potentiels".`);
    L.push(`   Bon : "Phoning avec Laborialle sur ses 9 silencieux (>10k€ CA) — objectif 3 réactivations avant le 25/04".`);
    L.push(``);
    L.push(`Ton : professionnel, lucide, posé. Tu présentes ton agence avec clarté, pas avec des effets de manche.`);
    L.push('');
    L.push(`═══════════════════════════════════════════════════`);
    L.push(`DONNÉES AGENCE ${agence} — ${periodLabel}`);
    if(filtersLabel)L.push(`FILTRES ACTIFS : ${filtersLabel}`);
    L.push(`═══════════════════════════════════════════════════`);

    L.push('');L.push('VENTES');
    L.push(`CA total : ${e(caTotal)} | BL : ${n(blTotal)} | Clients : ${n(nbClientsAll)}`);
    L.push(`Marge globale : ${pct(txMarge)} | VMB : ${e(Math.round(vmbTotal))}`);
    if(caMag>0)L.push(`Comptoir : ${e(caMag)} (${caTotal>0?Math.round(caMag/caTotal*100):0}%) marge ${pct(txMargeMag)} | ${n(nbClientsPDV)} clients`);
    if(caWeb>0)L.push(`Internet : ${e(caWeb)}`);
    if(caRep>0)L.push(`Représentant : ${e(caRep)}`);
    if(caDcs>0)L.push(`DCS : ${e(caDcs)}`);

    L.push('');L.push('STOCK');
    L.push(`Valeur : ${e(valStock)} | ${n(DataStore.finalData.length)} réf.`);
    if(txDispo!=null)L.push(`Disponibilité articles courants : ${txDispo}%`);
    L.push(`Ruptures articles courants : ${n(ruptures.length)} | Dormants : ${n(dormants.length)} (${e(dormantVal)})`);

    if(hasBench){
      L.push('');L.push('POSITION RÉSEAU');
      if(myRankIdx>=0)L.push(`Rang CA : #${myRankIdx+1}/${spSorted.length}`);
      L.push(`CA : ${e(kpis.mine?.ca||0)} vs méd. ${e(kpis.compared?.ca||0)} (${kpis.compared?.ca>0?Math.round(((kpis.mine?.ca||0)-(kpis.compared?.ca||0))/(kpis.compared?.ca)*100):0}%)`);
      L.push(`Marge : ${pct(kpis.mine?.txMarge)} vs méd. ${pct(kpis.compared?.txMarge)}`);
      L.push(`Part de marché stock réseau : ${kpis.mine?.serv||0}% vs méd. ${kpis.compared?.serv||0}%`);
      L.push(`Clients : ${n(kpis.mine?.nbClients||0)} vs méd. ${n(kpis.compared?.nbClients||0)}`);
      if(manquants.length>0)L.push(`Incontournables manquants : ${n(manquants.filter(m=>(m.myFreq||0)===0).length)} absents + ${n(manquants.filter(m=>(m.myFreq||0)>0).length)} sous-exploités`);
      if(lose.length>0){L.push('');L.push('FAMILLES EN RETRAIT');for(const f of lose)L.push(`  ${f.fam} : ${e(f.caMe)} vs méd. ${e(f.caOther)} (${f.ecartPct}%)`);}
      if(win.length>0){L.push('');L.push('FAMILLES FORTES');for(const f of win)L.push(`  ${f.fam} : ${e(f.caMe)} vs méd. ${e(f.caOther)} (+${f.ecartPct}%)`);}
    }

    // Commerciaux contributeurs
    if(_S.clientStore?.size && _S.chalandiseReady){
      const comCA=new Map();
      const comCli=new Map();
      const comSil=new Map(); // silencieux par commercial
      for(const rec of _S.clientStore.values()){
        if(!_clientPassesReportFilter(rec))continue;
        const com=rec.commercial;
        if(!com)continue;
        const ca=rec.caPDV||0;
        if(ca>0){
          comCA.set(com,(comCA.get(com)||0)+ca);
          comCli.set(com,(comCli.get(com)||0)+1);
        }
        const d=rec.silenceDaysPDV??rec.silenceDaysAll;
        if(d!==null&&d>30&&d<=180&&ca>0){
          comSil.set(com,(comSil.get(com)||0)+1);
        }
      }
      if(comCA.size>0){
        const sorted=[...comCA.entries()].sort((a,b)=>b[1]-a[1]);
        L.push('');L.push('COMMERCIAUX CONTRIBUTEURS');
        for(const [com,ca] of sorted){
          const cli=comCli.get(com)||0;
          const sil=comSil.get(com)||0;
          const silTag=sil>0?` | ${sil} silencieux/perdus`:'';
          L.push(`  ${com} : ${e(ca)} CA PDV, ${n(cli)} clients actifs${silTag}`);
        }
      }
    }

    // Directions / Secteurs (territoire)
    if(_S.terrContribByDirection?.size>0){
      L.push('');L.push('DIRECTIONS COMMERCIALES (territoire)');
      const sorted=[..._S.terrContribByDirection.entries()].sort((a,b)=>(b[1].ca||0)-(a[1].ca||0));
      for(const [dir,d] of sorted){
        if(!d.ca)continue;
        L.push(`  ${dir} : ${e(d.ca)} CA, ${n(d.blTerr||0)} BL territoire`);
      }
    }

    // Métiers clients (chalandise)
    if(_S.clientStore?.size && _S.chalandiseReady){
      const metCA=new Map();
      const metCli=new Map();
      for(const rec of _S.clientStore.values()){
        if(!_clientPassesReportFilter(rec))continue;
        const met=rec.metier;
        if(!met)continue;
        const ca=rec.caTotal||rec.caPDV||0;
        if(ca>0){
          metCA.set(met,(metCA.get(met)||0)+ca);
          metCli.set(met,(metCli.get(met)||0)+1);
        }
      }
      if(metCA.size>0){
        const sorted=[...metCA.entries()].sort((a,b)=>b[1]-a[1]);
        L.push('');L.push('MÉTIERS CLIENTS');
        const isStrat=(m)=>{const ml=m.toLowerCase();return METIERS_STRATEGIQUES.some(s=>ml.includes(s));};
        for(const [met,ca] of sorted.slice(0,12)){
          const cli=metCli.get(met)||0;
          const tag=isStrat(met)?'⭐ ':'';
          L.push(`  ${tag}${met} : ${e(ca)}, ${n(cli)} clients`);
        }
        const nbStrat=sorted.filter(([m])=>isStrat(m)).length;
        const caStrat=sorted.filter(([m])=>isStrat(m)).reduce((s,[,ca])=>s+ca,0);
        if(nbStrat>0)L.push(`  → ${n(nbStrat)} métiers stratégiques (⭐) = ${e(caStrat)} (${caTotal>0?Math.round(caStrat/caTotal*100):0}% du CA)`);
      }
    }

    L.push('');L.push('CLIENTS');
    if(silencieuxCount>0)L.push(`Silencieux 30-60j : ${n(silencieuxCount)} (${e(silencieuxCA)} CA en jeu)`);
    if(perdusCount>0)L.push(`Perdus 60-180j : ${n(perdusCount)} (${e(perdusCA)} CA en jeu)`);
    if(potentielsCount>0)L.push(`Potentiels jamais venus au comptoir : ${n(potentielsCount)}`);
    if(nbNomades>0)L.push(`Nomades multi-agences : ${n(nbNomades)}`);

    L.push('');L.push(`═══════════════════════════════════════════════════`);
    L.push(`Source : PRISME · ${periodLabel} · ${new Date().toLocaleDateString('fr-FR')}`);
    return L.join('\n');
  }
  // ── Cockpit Client (Urgences / Développer / Fidéliser) ──


  // ★★★ MOTEUR PRINCIPAL ★★★

  function _detectStoreColumnIdx(headers){
    if(!headers||!headers.length)return -1;
    return headers.findIndex(k=>{
      const kl=k.toLowerCase().replace(/[\r\n]/g,' ').trim();
      return kl==='code pdv'||kl==='pdv'||kl==='code agence'||kl==='agence'||kl==='code depot'||kl==='dépôt'||kl==='depot';
    });
  }

  // Helper : affiche le sélecteur d'agence et attend le choix (Promise-based)
  function _showStoreSelector(stores){
    return new Promise(resolve=>{
      const sel=document.getElementById('selectMyStore');
      if(!sel){resolve('');return;}
      sel.innerHTML='<option value="">— Choisir votre agence —</option>'+
        [...stores].sort().map(s=>'<option value="'+s+'">'+s+'</option>').join('');
      sel.value='';
      document.getElementById('storeSelector').classList.remove('hidden');
      hideLoading();
      const handler=()=>{
        const v=sel.value.toUpperCase();
        if(v&&stores.has(v)){
          sel.removeEventListener('change',handler);
          document.getElementById('storeSelector').classList.add('hidden');
          showLoading('Analyse '+v+'…','');
          resolve(v);
        }
      };
      sel.addEventListener('change',handler);
    });
  }

  async function processData(_storeOverride){
    const filesC=document.getElementById('fileConsomme').files,f2=document.getElementById('fileStock').files[0];
    if(!filesC||!filesC.length){showToast('⚠️ Chargez votre fichier Consommé (ventes)','warning');return;}
    if(filesC.length>1){showToast('📊 '+filesC.length+' fichiers consommé — fusion automatique','info',3000);}
    if(!f2){showToast('ℹ️ Mode commercial — chargez l\'État du Stock pour les vues Articles et Mon Stock','info',4000);}
    const btn=document.getElementById('btnCalculer');

    // iPhone/Safari : gros fichiers (CSV/XLSX) => pic RAM énorme (ArrayBuffer + decode + structures).
    // On préfère un avertissement + opt-in plutôt qu'un crash du navigateur.
    if(_S.lowMemMode){
      try{
        const totalBytes = Array.from(filesC||[]).reduce((s,f)=>s+(f?.size||0),0) + (f2?.size||0);
        const totalMB = totalBytes / (1024*1024);
        // Seuil "hard stop" : au-delà, Safari iOS tue souvent l'onglet (OOM) pendant arrayBuffer()+XLSX.
        if (totalMB >= 80) {
          showToast(`📱 Mode mobile : ${totalMB.toFixed(1)} Mo — trop volumineux pour Safari iOS. Faites l'analyse sur PC puis "📱 Exporter pour Scan" (scan.html → Import .json).`,'error',8000);
          return;
        }
        if(totalMB >= 25){
          showToast(`📱 Mode mobile : ${totalMB.toFixed(1)} Mo à analyser — risque élevé de crash. Conseil: faites l'analyse sur PC puis "📱 Exporter pour Scan".`,'warning',7000);
          const ok = confirm(`Mode mobile: ${totalMB.toFixed(1)} Mo à analyser.\nSafari iOS peut planter sur ce volume.\n\nOK = continuer quand même\nAnnuler = arrêter`);
          if(!ok) return;
        }
      }catch(_){}
    }

    btn.disabled=true;
    // ── OPT1 : Hash-check IDB — même fichier → skip parse complet ──
    {
      const _hashes = localStorage.getItem('prisme_fileHashes');
      if (_hashes) {
        const _storeBeforeRestore = _S.selectedMyStore;
        const _idbOk = DataStore.finalData.length > 0 || await _restoreSessionFromIDB();
        if (_storeBeforeRestore) _S.selectedMyStore = _storeBeforeRestore;
        // Vérifier si l'agence a changé dans le dropdown
        const _newStore = (document.getElementById('selectMyStore')?.value || '').toUpperCase();
        const _storeChanged = _newStore && _newStore !== _S.selectedMyStore;
        if (_idbOk && DataStore.finalData.length > 0 && !_storeChanged) {
          const _fLiv = document.getElementById('fileLivraisons').files[0] || null;
          const _unchanged = await _checkFilesUnchanged(filesC, f2 || null, document.getElementById('fileChalandise').files[0] || null, _fLiv);
          if (_unchanged) {
            // Cache "schema upgrade" : certaines features (clients actifs tous canaux par mois)
            // nécessitent _byMonthClients/_byMonthClientsByCanal. Les vieux caches ont _byMonth
            // mais pas ces sets → refilter période peut perdre des clients (ex: REPRESENTANT-only).
            const _needsUpgrade = !_S.lowMemMode && _S._byMonth && (!_S._byMonthClients || !_S._byMonthClientsByCanal || !_S._byMonthClientCAByCanal);
            if (!_needsUpgrade) {
              showToast('⚡ Fichiers inchangés — session restaurée depuis le cache', 'success', 3000);
              btn.disabled = false;
              hideLoading();
              if (!_S.clientStore?.size) buildClientStore();
              _applyForcageCommercial();
              if (_S.storesIntersection.size > 1 && !_S.agenceStore?.size) buildAgenceStore();
              renderAll();
              buildPeriodFilter();
              return;
            }
            showToast('⚠️ Cache ancien — mise à jour nécessaire pour un refilter tous canaux correct. Analyse en cours…', 'warning', 6000);
          }
        }
      }
    }
    // H4: reset complet de tous les globals session avant chaque re-upload
    resetAppState();
    // Le reset conserve _S.lowMemMode (flag environnement). Re-détecter au cas où.
    if (!_S.lowMemMode) _S.lowMemMode = _detectLowMemMode();
    const _selStore=document.getElementById('selectMyStore');
    if(_selStore){if(_storeOverride){_selStore.value=_storeOverride;}else{_selStore.innerHTML='<option value="">—</option>';_selStore.value='';}}
    _restoreExclusions();
    resetPromo();

    // Agence pré-remplie si mémorisée — le Worker validera et demandera si besoin
    let selectedStore=_storeOverride||localStorage.getItem('prisme_selectedStore')||'';

    showLoading('Lecture…','');await yieldToMain();

    // Stocker les File pour refilter période ultérieur (léger, pas de copie buffer)
    _S._fileC = filesC[0];
    _S._filesC = filesC;
    _S._fileS = f2 || null;
    _S._rawDataC = null; _S._rawDataS = [];

    // ── Lancement du worker de parsing (stream ArrayBuffers) ──
    updatePipeline('consomme','active');updatePipeline('stock','active');
    updateProgress(10,100,'Lecture fichiers…');
    let parseResult;
    try{
      parseResult = await launchParseWorkerFromFiles(filesC, f2 || null, {
        selectedStore: selectedStore || '',
        lowMem: !!_S.lowMemMode,
      });
    }catch(error){showToast('❌ Parsing: '+error.message,'error');console.error(error);btn.disabled=false;hideLoading();return;}

    // ── Agence sélectionnée — résolue dans launchParseWorker (message 'stores') ──
    selectedStore = parseResult._resolvedStore || selectedStore;

    // ── Hydrater _S depuis le résultat du worker ──
    _hydrateStateFromParseResult(parseResult, selectedStore);

    _S.selectedMyStore = selectedStore;
    if(selectedStore)localStorage.setItem('prisme_selectedStore',selectedStore);
    if(_selStore&&selectedStore){_selStore.innerHTML='<option value="">—</option>'+[..._S.storesIntersection].sort().map(s=>`<option value="${s}">${s}</option>`).join('');_selStore.value=selectedStore;}
    document.getElementById('storeSelector').classList.add('hidden');

    // ── Suite du pipeline (enrichissement, chalandise, benchmark, render) ──
    // Étapes post-hydratation côté main thread : enrichPrixUnitaire, chalandise, benchmark, render
    await _postParseMain({storeOverride: selectedStore||'', _f1: filesC, _f2: f2||null});
    buildPeriodFilter();
  }

  // ── launchParseWorkerFromFiles — stream File → Worker (faible pic mémoire) ──
  // Sur certaines configs (PC 4Go / iOS), accumuler plusieurs gros ArrayBuffer avant transfert
  // peut faire planter le navigateur. Ici, on envoie les buffers un par un (transferable).
  async function launchParseWorkerFromFiles(filesC, fileS, opts) {
    const _filesC = Array.from(filesC || []);
    const filenamesC = _filesC.map(f => f.name);
    const worker = new Worker('js/parse-worker.js' + _ASSET_VER_Q);
    const serialStream = !!opts?.lowMem || (function(){
      try{
        const dm = navigator.deviceMemory;
        if (typeof dm === 'number' && dm > 0 && dm <= 4) return true;
      }catch(_){}
      // Heuristique taille : si on poste plusieurs gros buffers sans backpressure,
      // le Worker peut accumuler en queue et exploser la RAM.
      try{
        const totalBytes = _filesC.reduce((s,f)=>s+(f.size||0),0) + (fileS? (fileS.size||0) : 0);
        if (totalBytes >= 64*1024*1024) return true;
      }catch(_){}
      return false;
    })();
    let _pendingAck = null;

    const resultP = new Promise((resolve, reject) => {
      worker.onmessage = async function(ev) {
        const msg = ev.data;
        if (msg.type === 'progress') {
          updateProgress(msg.pct, 100, msg.msg);
        } else if (msg.type === 'consomme_ack' || msg.type === 'stock_ack') {
          if (_pendingAck && _pendingAck.type === msg.type && (_pendingAck.index === undefined || _pendingAck.index === msg.index)) {
            const r = _pendingAck.resolve;
            _pendingAck = null;
            r();
          }
        } else if (msg.type === 'stores') {
          // Le Worker a détecté les agences — sélectionner et répondre
          const storesI = new Set(msg.storesIntersection || []);
          _S.storesIntersection = storesI;
          _S.storeCountConsomme = (msg.storesFoundC || []).length;
          _S.storeCountStock = (msg.storesFoundS || []).length;
          let store = (opts.selectedStore || '').toUpperCase();
          if (storesI.size === 1) {
            store = [...storesI][0];
          } else if (storesI.size > 1 && (!store || !storesI.has(store))) {
            store = await _showStoreSelector(storesI) || '';
          }
          if (store) localStorage.setItem('prisme_selectedStore', store);
          // Mettre à jour le dropdown agence
          const _selStore = document.getElementById('selectMyStore');
          if (_selStore && storesI.size) {
            _selStore.innerHTML = '<option value="">—</option>' + [...storesI].sort().map(s => `<option value="${s}">${s}</option>`).join('');
            if (store) _selStore.value = store;
          }
          document.getElementById('storeSelector')?.classList.add('hidden');
          // Confirmer au Worker — il peut continuer le parse complet
          worker.postMessage({ type: 'continue', selectedStore: store });
        } else if (msg.type === 'done') {
          worker.terminate();
          resolve(msg.payload);
        } else if (msg.type === 'error') {
          if (_pendingAck) {
            const rj = _pendingAck.reject;
            _pendingAck = null;
            rj(new Error(msg.msg));
          }
          worker.terminate();
          reject(new Error(msg.msg));
        }
      };
      worker.onerror = function(err) { worker.terminate(); reject(new Error('ParseWorker: ' + (err.message||'erreur'))); };
    });

    // Init (sans buffers)
    worker.postMessage(Object.assign({ type: 'init', filenamesC: filenamesC }, opts));

    // Envoyer consommé (1 par 1) pour réduire le pic mémoire
    try {
      for (let i = 0; i < _filesC.length; i++) {
        const f = _filesC[i];
        updateProgress(10 + Math.round(6 * (i / Math.max(_filesC.length, 1))), 100, 'Lecture ' + f.name + '…');
        const buf = await f.arrayBuffer();
        worker.postMessage({ type: 'consomme', buf, filename: f.name, index: i, total: _filesC.length }, [buf]);
        if (serialStream) {
          await new Promise((resolve, reject) => { _pendingAck = { type: 'consomme_ack', index: i, resolve, reject }; });
        }
        await yieldToMain();
      }
      if (fileS) {
        updateProgress(16, 100, 'Lecture ' + fileS.name + '…');
        const bufS = await fileS.arrayBuffer();
        worker.postMessage({ type: 'stock', buf: bufS, filename: fileS.name }, [bufS]);
        if (serialStream) {
          await new Promise((resolve, reject) => { _pendingAck = { type: 'stock_ack', resolve, reject }; });
        }
        await yieldToMain();
      }
      updateProgress(20, 100, 'Parsing en cours (Worker)…');
      worker.postMessage({ type: 'start' });
    } catch (e) {
      worker.terminate();
      throw e;
    }

    return await resultP;
  }

  // ── _hydrateStateFromParseResult — reconstruit _S depuis le payload worker ──
  function _hydrateStateFromParseResult(r, selectedStore) {
    // Objets plain
    _S.articleRaw         = r.articleRaw || {};
    _S.articleMonthlySales    = r.monthlySales || {};
    _S.seasonalIndexReseau    = r.seasonalIndexReseau || {};
    _S.ventesParAgence   = r.ventesParAgence || {};
    _S.ventesParAgenceByCanal = r.ventesParAgenceByCanal || {};
    _S.clientNomLookup    = r.clientNomLookup || {};
    _S.articleFamille     = r.articleFamille || {};
    _S.articleUnivers     = r.articleUnivers || {};
    _S.libelleLookup      = r.libelleLookup || {};
    _S.canalAgence        = r.canalAgence || {};
    _S._byMonth           = r.byMonth      || null;
    _S._byMonthFull       = r.byMonthFull  || null;
    _S._byMonthCanal      = r.byMonthCanal || null;
    _S._byMonthStoreArtCanal = r.byMonthStoreArtCanal || null;
    // Hydrater byMonthStoreClients (Arrays → Sets)
    if (r.byMonthStoreClients) {
      const _bmsc = {};
      for (const sk in r.byMonthStoreClients) { _bmsc[sk] = {}; for (const mi in r.byMonthStoreClients[sk]) _bmsc[sk][mi] = new Set(r.byMonthStoreClients[sk][mi]); }
      _S._byMonthStoreClients = _bmsc;
    } else { _S._byMonthStoreClients = null; }
    _S._byMonthStoreClientCA = r.byMonthStoreClientCA || null;
    if (r.byMonthClients) {
      const _bmc = {};
      for (const k in r.byMonthClients) _bmc[k] = new Set(r.byMonthClients[k]);
      _S._byMonthClients = _bmc;
    } else { _S._byMonthClients = null; }
    _S._byMonthClientsByCanal = r.byMonthClientsByCanal
      ? Object.fromEntries(Object.entries(r.byMonthClientsByCanal).map(([k, cm]) => {
          const _out = {};
          for (const _c in cm) _out[_c] = new Set(cm[_c]);
          return [k, _out];
        }))
      : null;
    _S._byMonthClientCAByCanal = r.byMonthClientCAByCanal || null;
    _S.finalData          = r.finalData || [];
    _S.abcMatrixData      = r.abcMatrixData || {};
    _S.stockParMagasin    = r.stockParMagasin || {};
    _S.ventesAnalysis     = r.ventesAnalysis || { refParBL:0, famParBL:0, totalBL:0, refActives:0, attractivite:{}, nbPassages:0, txMarge:null, vmc:null };
    _S.globalJoursOuvres  = r.joursOuvres || 250;
    _S.consommeMoisCouverts = r.consommeMoisCouverts || 0;
    _S._hasStock = _S.finalData.length > 0;

    // Reconstruire ventesClientsPerStore (Sets)
    const vcps = r.ventesClientsPerStore || {};
    _S.ventesClientsPerStore = {};
    for (const sk in vcps) { _S.ventesClientsPerStore[sk] = new Set(vcps[sk]); }
    // Reconstruire clientsByStoreUnivers (Sets)
    _S.clientsByStoreUnivers = {};
    for (const sk in (r.clientsByStoreUnivers || {})) {
      _S.clientsByStoreUnivers[sk] = {};
      for (const u in r.clientsByStoreUnivers[sk]) {
        _S.clientsByStoreUnivers[sk][u] = new Set(r.clientsByStoreUnivers[sk][u]);
      }
    }

    // Reconstruire caClientParStore (Maps)
    const ccps = r.caClientParStore || {};
    _S.caClientParStore = {};
    for (const sk in ccps) { _S.caClientParStore[sk] = new Map(ccps[sk]); }
    // Reconstruire commandesPerStoreCanal (Sets)
    const cpsc = r.commandesPerStoreCanal || {};
    _S.commandesPerStoreCanal = {};
    for (const sk in cpsc) {
      _S.commandesPerStoreCanal[sk] = {};
      for (const c in cpsc[sk]) { _S.commandesPerStoreCanal[sk][c] = new Set(cpsc[sk][c]); }
    }

    // blData — worker retourne { codesSize, famillesSize } uniquement (Sets non sérialisables)
    // On recrée une structure allégée compatible avec le reste du code
    _S.blData = {};
    const blDataSer = r.blData || {};
    for (const blk in blDataSer) {
      _S.blData[blk] = { codes: new Set(), familles: new Set() };
      // On ne peut pas reconstruire les sets exacts, mais blConsommeSet est recalculé ci-dessous
    }
    _S.blConsommeSet = new Set(Object.keys(_S.blData));

    // Dates
    _S.consommePeriodMin = r.minDateVente ? new Date(r.minDateVente) : null;
    _S.consommePeriodMax = r.maxDateVente ? new Date(r.maxDateVente) : null;
    _S.consommePeriodMinFull = _S.consommePeriodMin;
    _S.consommePeriodMaxFull = _S.consommePeriodMax;
    // periodFilterStart/End : NE PAS toucher ici — déjà null via resetAppState(),
    // ou déjà set par applyPeriodFilter() avant un refilter.

    // Maps imbriquées
    _S.ventesLocalMagPeriode     = new Map((r.ventesLocalMagPeriode||[]).map(([k,v]) => [k, new Map(v)]));
    _S.ventesLocalMag12MG = new Map((r.ventesLocalMag12MG||[]).map(([k,v]) => [k, new Map(v)]));
    _S.ventesReseauTousCanaux = new Map((r.ventesReseauTousCanaux||[]).map(([k,v]) => [k, new Map(v)]));
    _S.ventesLocalHorsMag = new Map((r.ventesLocalHorsMag||[]).map(([k,v]) => [k, new Map(v)]));
    _S.clientLastOrder         = new Map((r.clientLastOrder||[]).map(([k,v]) => [k, typeof v==='number'?new Date(v):v]));
    _S.clientLastOrderAll      = new Map((r.clientLastOrderAll||[]).map(([k,v]) => [k, {date:new Date(v.date),canal:v.canal}]));
    _S.clientLastOrderByCanal  = new Map((r.clientLastOrderByCanal||[]).map(([k,v]) => [k, new Map(v)]));
    _S.clientArticles          = new Map((r.clientArticles||[]).map(([k,v]) => [k, new Set(v)]));
    _S.articleClients          = new Map((r.articleClients||[]).map(([k,v]) => [k, new Set(v)]));
    _S.articleClientsFull      = new Map((r.articleClientsFull||[]).map(([k,v]) => [k, new Set(v)]));
    _S.articleCanalCA          = new Map((r.articleCanalCA||[]).map(([k,v]) => [k, new Map(v)]));
    _S.blCanalMap              = new Map(r.blCanalMap||[]);
    _S.clientsMagasin          = new Set(r.clientsMagasin||[]);
    _S.clientsMagasinFreq      = new Map(r.clientsMagasinFreq||[]);
    _S.cannauxHorsMagasin      = new Set(r.cannauxHorsMagasin||[]);
    _S.blPreleveeSet           = new Set(r.blPreleveeSet||[]);
    _S.enleveSingleBL          = r.enleveSingleBL || {};
    _S.ventesClientAutresAgences = new Map(r.ventesClientAutresAgences||[]);

    // Recalcul seasonalIndex depuis monthlySales (B3)
    _computeSeasonalIndex(_S.articleMonthlySales);

    // storesIntersection (si pas déjà set par processData)
    if (r.storesIntersection && r.storesIntersection.length) {
      _S.storesIntersection = new Set(r.storesIntersection);
    }
    _S.storeCountConsomme = (r.storesFoundC||[]).length;
    _S.storeCountStock    = (r.storesFoundS||[]).length;

    // hasCommandeCol — stocker pour info
    _S._hasCommandeCol = r.hasCommandeCol;

    // selectedMyStore
    _S.selectedMyStore = selectedStore || '';
    if (selectedStore) localStorage.setItem('prisme_selectedStore', selectedStore);
  }

  window._applyForcageCommercial = _applyForcageCommercial;

  // ── Juge de Paix — Vitesse Réseau (fonction partagée) ──────────────────
  // Cascade : Ventes locales > 0 → calcul local (déjà fait en amont)
  //           Ventes locales = 0, réseau > 0 → Vitesse Réseau (Top 3)
  //           Ventes locales = 0, réseau = 0, stocké réseau → médiane ERP
  function _applyVitesseReseau(){
    if(!DataStore.finalData.length)return;
    const _myS=_S.selectedMyStore;
    const _vpm=_S.ventesParAgence||{};
    const _allStoresFull=Object.keys(_vpm).filter(s=>s!==_myS);
    if(_allStoresFull.length<2)return;
    let _applied=0;
    for(const r of DataStore.finalData){
      if(r.nouveauMin>0||r.nouveauMax>0)continue;
      if(r.isParent)continue;
      const _sl=(r.statut||'').toLowerCase();
      if(_sl.includes('fin de série')||_sl.includes('fin de serie')||_sl.includes('fin de stock'))continue;
      // Top 3 agences par CA — sélection en un passage (pas de sort/slice)
      let _t1ca=0,_t1bl=0,_t2ca=0,_t2bl=0,_t3ca=0,_t3bl=0,_any=false;
      for(const s of _allStoresFull){const v=_vpm[s]?.[r.code];if(!v||v.countBL<=0)continue;const ca=v.sumCA||0;const bl=v.countBL;_any=true;if(ca>_t1ca){_t3ca=_t2ca;_t3bl=_t2bl;_t2ca=_t1ca;_t2bl=_t1bl;_t1ca=ca;_t1bl=bl;}else if(ca>_t2ca){_t3ca=_t2ca;_t3bl=_t2bl;_t2ca=ca;_t2bl=bl;}else if(ca>_t3ca){_t3ca=ca;_t3bl=bl;}}
      if(!_any)continue;
      let _tCA=_t1ca+_t2ca+_t3ca,_tBL=_t1bl+_t2bl+_t3bl;
      const _pu=r.prixUnitaire||0;
      if(_pu<=0||_tBL<=0)continue;
      let _vit=(_tCA/_pu)/_tBL;
      if(_vit<=0)continue;
      // Plafond : si la médiane réseau ERP est dispo, ne pas dépasser 2× la médiane MIN
      // Sinon plafond absolu à 20 pour éviter les MIN/MAX délirants sur petits prix
      const _capMed=r.medMinReseau>0?r.medMinReseau*2:20;
      _vit=Math.min(_vit,_capMed);
      r.nouveauMin=Math.max(Math.ceil(_vit),1);
      r.nouveauMax=Math.max(Math.ceil(_vit*2),r.nouveauMin+1);
      r._vitesseReseau=true;
      _applied++;
    }
    // Fallback 3 : pas de ventes réseau, mais stocké réseau → médiane ERP
    for(const r of DataStore.finalData){
      if(r.nouveauMin>0||r.nouveauMax>0)continue;
      if(r.isParent)continue;
      const _sl=(r.statut||'').toLowerCase();
      if(_sl.includes('fin de série')||_sl.includes('fin de serie')||_sl.includes('fin de stock'))continue;
      if(r.medMinReseau>0||r.medMaxReseau>0){
        r.nouveauMin=Math.max(Math.round(r.medMinReseau),1);
        r.nouveauMax=Math.max(Math.round(r.medMaxReseau),r.nouveauMin+1);
        r._vitesseReseau=true;
        r._fallbackERP=true;
        _applied++;
      }
    }
    console.log('[VR] Juge de Paix — applied:', _applied, 'stores:', _allStoresFull.length);
  }

  // ── _postParseMain — étapes post-hydratation côté main thread ────────────
  // Equivalent à la fin de processDataFromRaw() mais sans re-parser les fichiers.
  async function _postParseMain(opts) {
    const {storeOverride='', _f1=null, _f2=null} = opts;
    const t0 = performance.now();
    const _perf=[];const _mark=(label)=>{_perf.push({etape:label,ms:Math.round(performance.now()-t0)});};
    const btn = document.getElementById('btnCalculer'); btn.disabled = true;
    try {
      const useMulti = _S.storesIntersection.size > 1 && _S.selectedMyStore;
      const lowMem = !!_S.lowMemMode;

      // Enrichissement prix unitaire depuis ventes (main thread, accès _S)
      enrichPrixUnitaire();
      _enrichFinalDataWithCA();
      if(useMulti) _applyVitesseReseau();
      _mark('Enrichissement prix/CA');

      // Positionner sur le mois le plus récent par défaut (INIT ONLY — pas de render ici)
      // C'est le SEUL endroit hors applyPeriodFilter() qui écrit periodFilterStart/End,
      // justifié car les données ne sont pas encore prêtes pour un render complet.
      if (_S._byMonth && !_S.periodFilterStart) {
        const _maxD = _S.consommePeriodMaxFull || _S.consommePeriodMax;
        if (_maxD) {
          const _y = _maxD.getFullYear(), _m = _maxD.getMonth();
          _S.periodFilterStart = new Date(_y, _m, 1);
          _S.periodFilterEnd = new Date(_y, _m+1, 0, 23, 59, 59);
        }
      }
      // Initialiser canalAgence depuis byMonthCanal (pleine période ou filtre actif)
      if (_S._byMonth) _refilterFromByMonth();

      // Fix articleFamille depuis stock (stock est master)
      for (const r of DataStore.finalData) { if (r.famille && r.famille !== 'Non Classé') _S.articleFamille[r.code] = r.famille; }
      // Recalcul seasonalIndex après enrichissement articleFamille
      _computeSeasonalIndex(_S.articleMonthlySales);

      // Patch obsKpis.mine depuis canalAgence (si benchmark déjà présent)
      if (_S.periodFilterStart || _S.periodFilterEnd) {
        if (_S.benchLists?.obsKpis) {
          const _ca = Object.values(_S.canalAgence).reduce((t,v)=>t+(v.ca||0),0);
          _S.benchLists.obsKpis.mine = {
            ca: _ca,
            ref: _S.benchLists.obsKpis.mine?.ref||0,
            freq: Object.values(_S.canalAgence).reduce((t,v)=>t+(v.bl||0),0),
            serv: _S.benchLists.obsKpis.mine?.serv||0,
            pdm: _S.benchLists.obsKpis.mine?.pdm||0,
            txMarge: _S.benchLists.obsKpis.mine?.txMarge||0
          };
          invalidateCache('bench');
        }
      }

      updatePipeline('consomme','done');
      updatePipeline('stock','done');

      // Chalandise + livraisons (si fichiers chargés)
      _mark('Avant chalandise');
      console.log('[PERF] avant parsing optionnels — chalFiles=',document.getElementById('fileChalandise').files?.length||0,'livFile=',!!document.getElementById('fileLivraisons').files[0]);
      if (!lowMem) {
        {const _chalFiles=document.getElementById('fileChalandise').files;if(_chalFiles?.length&&!_S.chalandiseReady&&!_S._chalandiseLoading){_S._chalandiseLoading=true;try{await parseChalandise(_chalFiles);}finally{_S._chalandiseLoading=false;}}}
      } else {
        const _chalFiles=document.getElementById('fileChalandise').files;
        if (_chalFiles?.length) showToast('📱 Mode mobile: Chalandise ignorée (risque crash mémoire). Faites-le sur PC/Zebra.', 'info', 6000);
      }
      _mark('Après chalandise');
      if (!lowMem) {
        {const fL=document.getElementById('fileLivraisons').files[0];if(fL&&!_S.livraisonsReady&&!_S._livraisonsLoading){_S._livraisonsLoading=true;try{await parseLivraisons(fL);}finally{_S._livraisonsLoading=false;}}}
      } else {
        const fL=document.getElementById('fileLivraisons').files[0];
        if (fL) showToast('📱 Mode mobile: Livraisons/Terrain ignorés (risque crash mémoire). Faites-le sur PC.', 'info', 6000);
      }
      _mark('Après livraisons');
      if(!lowMem && useMulti){updateProgress(92,100,'Benchmark…');await yieldToMain();computeBenchmark();_mark('Benchmark');}

      // ABC/FMR + selects
      if(DataStore.finalData.length>0&&DataStore.finalData.every(r=>r.stockActuel===0)){showToast('⚠️ Attention : toutes les valeurs de stock sont à 0 dans le fichier. Vérifiez votre export.','warning');}
      updateProgress(93,100,'Radar ABC/FMR…');await yieldToMain();
      if (!lowMem) assertPostParseInvariants();
      if(useMulti){updateProgress(94,100,'Verdicts Squelette…');await yieldToMain();try{const _vr=applyVerdictOverrides();console.log('[PRISME] Bouclier Squelette:',_vr);}catch(e){console.error('[PRISME] Bouclier Squelette ERREUR:',e);}_mark('Verdicts');}
      updateProgress(95,100,'Affichage…');await yieldToMain();

      // Repeupler les selects depuis finalData
      const familles=new Set(),sousFamilles=new Set(),emplacements=new Set(),statuts=new Set();
      for(const r of DataStore.finalData){
        if(r.famille&&r.famille!=='Non Classé')familles.add(r.famille);
        if(r.sousFamille)sousFamilles.add(r.sousFamille);
        if(r.emplacement)emplacements.add(r.emplacement);
        if(r.statut)statuts.add(r.statut);
      }
      populateSelect('filterFamille',familles,famLabel);populateSelect('filterSousFamille',sousFamilles);populateSelect('filterEmplacement',emplacements);populateSelect('filterStatut',statuts);
      buildSqLookup();

      const elapsed=((performance.now()-t0)/1000).toFixed(1);
      document.getElementById('navStats').textContent=DataStore.finalData.length.toLocaleString('fr')+' art.';document.getElementById('navStats').classList.remove('hidden');
      document.getElementById('navPerf').textContent=elapsed+'s';document.getElementById('navPerf').classList.remove('hidden');
      const _navSt=document.getElementById('navStore');if(_navSt){_navSt.textContent=_S.selectedMyStore||'';_navSt.classList.toggle('hidden',!_S.selectedMyStore);}
      document.getElementById('navReportingBtn').classList.remove('hidden');
      document.getElementById('globalFilters').classList.remove('hidden');
      document.body.classList.add('pilot-loaded');
      const _terrBtn=document.getElementById('btnTabCommerce');_terrBtn.classList.remove('hidden');
      const _clientsBtn=document.getElementById('btnTabClients');if(_clientsBtn)_clientsBtn.classList.remove('hidden');
      const terrNoC=document.getElementById('terrNoChalandise');if(terrNoC)terrNoC.classList.toggle('hidden',_S.chalandiseReady);

      if (!lowMem) {
        computeClientCrossing();computeReconquestCohort();
        buildClientStore();_applyForcageCommercial();_mark('ClientStore + crossing');
        if(!_S.chalandiseReady)_rebuildCaByArticleCanal();
        // launchClientWorker — toujours lancé (gère chalandise vide en interne)
        // IDB sauvegardée uniquement ici — évite double save avec chalandise partielle
        launchClientWorker().then(async()=>{
          if(_S.chalandiseReady&&DataStore.ventesLocalMagPeriode.size>0){resetBenchMetierCache();computeOpportuniteNette();computeAnglesMorts();computeOmniScores();computeFamillesHors();buildClientStore();_applyForcageCommercial();renderTabBadges();updateLaboTiles();showToast('📊 Agrégats clients calculés','success');}
          if(_S.selectedMyStore){localStorage.setItem('prisme_selectedStore',_S.selectedMyStore);_saveToCache();await _saveSessionToIDB();const _fc=document.getElementById('fileConsomme').files;const f2h=document.getElementById('fileStock').files[0]||null;const f3h=document.getElementById('fileChalandise').files[0]||null;const f4h=document.getElementById('fileLivraisons').files[0]||null;if(_fc&&_fc.length)await _saveFileHashes(_fc,f2h,f3h,f4h);}
        }).catch(err=>console.warn('Client worker error:',err));
      } else {
        // Mode mobile: on évite les agrégats clients (gros Map/Set) et on sauvegarde directement pour Scan.
        if(_S.selectedMyStore){
          localStorage.setItem('prisme_selectedStore',_S.selectedMyStore);
          _saveToCache();
          await _saveSessionToIDB();
          const _fc=document.getElementById('fileConsomme').files;
          const f2h=document.getElementById('fileStock').files[0]||null;
          if(_fc&&_fc.length) await _saveFileHashes(_fc,f2h,null,null);
        }
        showToast('📱 Mode mobile: cache Scan prêt (IndexedDB) — ouvrez scan.html', 'success', 5000);
      }
      _S.currentPage=0;
      renderAll();_mark('renderAll');
      initDetailsAnimations();
      initColSelector();
      _syncTabAccess();

      // Auto-YTD si consommé court
      if(_S.consommeMoisCouverts<6&&(_S._globalPeriodePreset||'12M')==='12M'){_S._globalPeriodePreset='YTD';setPeriodePreset('YTD');}

      if(_S.cannauxHorsMagasin.size>0){const _labelsCanaux={INTERNET:'🌐 Internet',REPRESENTANT:'🤝 Représentant',DCS:'🏢 DCS'};const _listeCanaux=[..._S.cannauxHorsMagasin].map(c=>_labelsCanaux[c]||c).join(', ');showToast(`📡 Canaux détectés : ${_listeCanaux} — vue "Commandes hors agence" activée dans Le Terrain`,'success',6000);}

      _mark('Prêt');console.table(_perf);
      updateProgress(100,100,'✅ Prêt !',elapsed+'s');await new Promise(r=>setTimeout(r,400));
      renderSidebarAgenceSelector();
      switchTab('omni');btn.textContent='✅ '+elapsed+'s';btn.classList.replace('s-panel-inner','bg-emerald-600');
      // Pré-calcul squelette en idle — alimente SOCLE badges + 🚨 Capitaines
      _scheduleIdleSquelette();
      const _nbFC=document.getElementById('fileConsomme')?.files?.length||1;
      const _nbF=_nbFC+1+(document.getElementById('fileLivraisons')?.files[0]?1:0)+(document.getElementById('fileChalandise').files[0]?1:0);
      collapseImportZone(_nbF,_S.selectedMyStore,DataStore.finalData.length,elapsed);
      const btnR=document.getElementById('btnRecalculer');if(btnR)btnR.classList.remove('hidden');

    }catch(error){if(error.message==='NO_STORE_SELECTED')return;showToast('❌ '+error.message,'error');console.error(error);btn.textContent='❌';btn.classList.replace('s-panel-inner','bg-red-600');}
    finally{btn.disabled=false;btn.classList.remove('loading');hideLoading();}
  }


  // ── Sous-fonctions de processDataFromRaw — refactoring pur, zéro impact comportemental ──
  // Règle : chaque fonction a une seule responsabilité, paramètres explicites, pas de
  // variables locales de processDataFromRaw capturées par closure.

  function _computeSeasonalIndex(monthlySales) {
    // B3 : agrège monthlySales par famille → coefficients saisonniers
    // Blend local × réseau : poids local = min(1, volumeLocal / 50)
    // Plus l'historique local est riche, plus il pèse. Sinon le réseau stabilise.
    const familyMonthly={};
    const familyVolume={}; // volume total par famille (12 mois)
    for(const[code,months] of Object.entries(monthlySales)){
      const fam=_S.articleFamille[code];if(!fam)continue;
      if(!familyMonthly[fam])familyMonthly[fam]=new Array(12).fill(0);
      for(let m=0;m<12;m++)familyMonthly[fam][m]+=months[m];
    }
    for(const[fam,months] of Object.entries(familyMonthly)){
      familyVolume[fam]=months.reduce((s,v)=>s+v,0);
    }

    // Index local pur
    const localIndex={};
    for(const[fam,months] of Object.entries(familyMonthly)){
      const avg=familyVolume[fam]/12;if(avg<=0)continue;
      localIndex[fam]=months.map(v=>Math.round(v/avg*100)/100);
    }

    // Blend avec réseau
    const reseauIndex=_S.seasonalIndexReseau||{};
    _S.seasonalIndex={};
    const allFams=new Set([...Object.keys(localIndex),...Object.keys(reseauIndex)]);
    for(const fam of allFams){
      const loc=localIndex[fam];
      const res=reseauIndex[fam];
      if(loc&&res){
        // Poids local proportionnel au volume — seuil 50 ventes pour confiance max
        const vol=familyVolume[fam]||0;
        const wLocal=Math.min(1,vol/50);
        const wReseau=1-wLocal;
        _S.seasonalIndex[fam]=loc.map((v,i)=>Math.round((v*wLocal+res[i]*wReseau)*100)/100);
      }else if(loc){
        _S.seasonalIndex[fam]=loc;
      }else if(res){
        _S.seasonalIndex[fam]=res;
      }
    }

    // Compléter avec le baseline 2025 pour les familles absentes
    const _baseline = _S._seasonalBaseline;
    if (_baseline) {
      for (const [fam, coefs] of Object.entries(_baseline)) {
        if (!_S.seasonalIndex[fam]) _S.seasonalIndex[fam] = coefs;
      }
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
    // Injecte caAnnuel sur chaque article depuis ventesLocalMag12MG (12 mois glissants, myStore)
    // Pleine période comme PRÉL/ENL/FRÉQ — invariant au filtre période UI
    const _full=_S.ventesLocalMag12MG;
    if(_full?.size){
      const _caByCode=new Map();
      for(const[,artMap] of _full){
        for(const[code,data] of artMap){
          _caByCode.set(code,(_caByCode.get(code)||0)+(data.sumCAPrelevee||0));
        }
      }
      for(const r of DataStore.finalData){r.caAnnuel=Math.round(_caByCode.get(r.code)||0);}
      return;
    }
    // Fallback VPM si ventesLocalMag12MG pas encore peuplé
    const _myStore=_S.selectedMyStore;
    const _vpmStore=_myStore?(_S.ventesParAgence?.[_myStore]||null):null;
    if(_vpmStore){
      for(const r of DataStore.finalData){r.caAnnuel=Math.round(_vpmStore?.[r.code]?.sumCA||0);}
    }
  }

  // Grise les onglets selon les fichiers chargés — appelé après chaque chargement complet
  function _syncTabAccess(){
    const hasStock=!!_S._hasStock;
    // Griser les pills Mon Stock si pas de fichier stock
    ['stock','table'].forEach(tabId=>{
      const pill=document.querySelector(`.supertab-pill[data-subtab="${tabId}"]`);if(!pill)return;
      if(!hasStock){pill.style.opacity='0.45';pill.title="Nécessite le fichier stock";pill.style.pointerEvents='none';}
      else{pill.style.opacity='';pill.title='';pill.style.pointerEvents='';}
    });
    // Labo pill — pas de verrouillage (espace réservé)
  }

  // Univers dominant par client — séparé pour être appelable depuis processDataFromRaw ET _initFromCache
  function _computeClientDominantUnivers(){
    const m=new Map();
    const au=_S.articleUnivers||{};
    for(const[cc,artMap] of _S.ventesLocalMagPeriode.entries()){
      const sums=Object.create(null);
      let maxU='',maxCA=0;
      for(const[code,v] of artMap.entries()){
        const u=au[code];if(!u)continue;
        const ca=v?.sumCA||0;if(!ca)continue;
        const next=(sums[u]||0)+ca;
        sums[u]=next;
        if(next>maxCA){maxCA=next;maxU=u;}
      }
      if(maxU)m.set(cc,maxU);
    }
    _S._clientDominantUnivers=m;
  }


  // caByArticleCanal — séparé pour être appelable depuis processDataFromRaw ET _initFromCache
  function _rebuildCaByArticleCanal(){
    const vh=_S.ventesLocalHorsMag;
    const fd=DataStore.finalData;
    if(!vh?.size||!fd?.length)return;

    // O(total edges) au lieu de O(articles × clients)
    const caByCode=new Map();
    const nbClientsByCode=new Map();
    for(const[,artMap] of vh.entries()){
      for(const[code,data] of artMap.entries()){
        let entry=caByCode.get(code);
        if(!entry){entry=Object.create(null);caByCode.set(code,entry);}
        const canal=data?.canal||'';
        if(canal) entry[canal]=(entry[canal]||0)+(data?.sumCA||0);
        nbClientsByCode.set(code,(nbClientsByCode.get(code)||0)+1);
      }
    }
    _S.caByArticleCanal=caByCode;
    for(const r of fd){
      const c=caByCode.get(r.code);
      const web=c?.INTERNET||0,rep=c?.REPRESENTANT||0,dcs=c?.DCS||0;
      r.caWeb=web;r.caRep=rep;r.caDcs=dcs;
      r.caHorsMagasin=web+rep+dcs;
      r.nbClientsWeb=nbClientsByCode.get(r.code)||0;
    }
  }
  // ★★★ LEGACY / REFILTER ONLY ★★★
  // ⚠️  Le parsing initial des fichiers consommé+stock passe par parse-worker.js (Web Worker)
  //     puis _hydrateStateFromParseResult() + _postParseMain().
  //     processDataFromRaw() n'est appelé QUE dans 2 cas :
  //       1. applyPeriodFilter → isRefilter=true (re-calcul depuis _rawDataC en mémoire)
  //       2. _initFromCache → isRefilter=true (restauration IDB au démarrage)
  //     ➜ NE PAS ajouter de nouvelles structures ici sans les ajouter aussi dans parse-worker.js !
  async function processDataFromRaw(dataC,dataS,opts={}){
    const{isRefilter=false,storeOverride='',_f1=null,_f2=null}=opts;
    if(!isRefilter)console.warn('[PRISME] processDataFromRaw called with isRefilter:false — legacy path?',new Error().stack);
    const _savedStoreBeforeReset=isRefilter?(_S.selectedMyStore||localStorage.getItem('prisme_selectedStore')||''):'';
    if(isRefilter&&_savedStoreBeforeReset)_S.selectedMyStore=_savedStoreBeforeReset;
    const t0=performance.now();const _perf=[];const _mark=(label)=>{_perf.push({etape:label,ms:Math.round(performance.now()-t0)});};
    const btn=document.getElementById('btnCalculer');btn.disabled=true;btn.classList.add('loading');
    _S._parsingInProgress=true; // bloque les renderAll parasites pendant le parsing
    if(isRefilter){showLoading('Recalcul période…','');await yieldToMain();}
    try{
      let headersC=null;
      if(!isRefilter){headersC=(dataC.headers||[]).join(' ').toLowerCase();if(!headersC.includes('article')&&!headersC.includes('code')){showToast('⚠️ Le fichier Ventes ne semble pas contenir de colonne Article/Code.','error');btn.disabled=false;hideLoading();return;}if(dataS&&dataS.length){const headersS=Object.keys(dataS[0]||{}).join(' ').toLowerCase();if(!headersS.includes('article')&&!headersS.includes('code')){showToast('⚠️ Le fichier Stock ne semble pas contenir de colonne Article/Code.','error');btn.disabled=false;hideLoading();return;}}}

      // ── Store detection — skipped for isRefilter (storesIntersection/selectedMyStore unchanged) ──
      _resetColCache();
      let hasMulti=_S.storesIntersection.size>1,useMulti=hasMulti&&_S.selectedMyStore;
      if(!isRefilter){
        const stC=new Set(),stS=new Set();
        const _stIdx=_detectStoreColumnIdx(dataC.headers);
        for(const r of dataC.rows){const c=_stIdx>=0?(r[_stIdx]??'').toString().trim().toUpperCase():'';if(c)stC.add(c);}
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
      _mark('Init + détection agences');
      updateProgress(45,100,'Ventes…',dataC.rows.length.toLocaleString('fr'));
      const articleRaw={};_S.ventesParAgence={};_S.blData={};if(!isRefilter)_S.clientsMagasin=new Set();_S.ventesLocalMagPeriode=new Map();_S.ventesReseauTousCanaux=new Map();_S.ventesClientsPerStore={};_S.caClientParStore={};_S.clientsByStoreUnivers={};_S.commandesPerStoreCanal={};_S.articleClients=new Map();_S.clientArticles=new Map();if(!isRefilter){_S.clientLastOrder=new Map();_S.clientLastOrderAll=new Map();_S.articleClientsFull=new Map();}
      _S.ventesParAgenceByCanal={};
      if(!isRefilter){_S.articleFamille={};_S.articleUnivers={};_S.canalAgence={};_S.clientNomLookup={};}
      const _clientMagasinBLsTemp=new Map();
      const monthlySales={}; // B3: code → [12 mois qtés]
      let minDateVente=Infinity,maxDateVente=0;let passagesUniques=new Set(),commandesPDV=new Set();const _tempCAAll=new Map(); // accumulation sumCAAll tous canaux, filtré période, fusionné après la boucle
      const _tempCAAllFull=new Map(); // accumulation sumCAAll tous canaux, pleine période, pour ventesLocalMag12MG
      const _storeUniverseBuyerRows=[]; // store × client × article, rebâti en univers après enrichissement familles
      let _cSStk=null,_cSValS=null; // pré-détectés avant la boucle stock
      // H2 / OPT3 : pré-mapper les colonnes UNE FOIS avant la boucle (évite findKey par row)
      let _hasCommandeCol=false;
      const _hC_ci=dataC.headers||[];const _nrm_ci=s=>(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();const _fc_ci=(...t)=>{const _i=_hC_ci.findIndex(h=>t.some(s=>_nrm_ci(h).includes(_nrm_ci(s))));return _i>=0?_i:null;};
      const _famIdx=_hC_ci.findIndex(h=>_nrm_ci(h)==='famille');const _uvIdx=_hC_ci.findIndex(h=>_nrm_ci(h)==='univers');
      const CI={store:_fc_ci('code pdv','pdv','code agence','agence','code depot','depot'),article:_fc_ci('code - désignation','code et nom article','article'),client:_fc_ci('code et nom client','code client','client'),canal:_fc_ci('canal commande','canal'),jour:_fc_ci('jour','date'),bl:_fc_ci('n° bl','numéro de bl','numero bl'),commande:_fc_ci('numéro de commande','n° commande'),caE:_fc_ci('ca enlevé','ca enleve'),caP:_fc_ci('ca prélevé','ca preleve'),vmbE:_fc_ci('vmb enlevé','vmb enleve'),vmbP:_fc_ci('vmb prélevé','vmb preleve'),qteE:_fc_ci('qté enlevée','qte enlevee'),qteP:_fc_ci('qté prélevée','qte prelevee'),famille:_famIdx>=0?_famIdx:null,codeFam:_fc_ci('code famille'),univers:_uvIdx>=0?_uvIdx:null};
      _hasCommandeCol=!!(CI.commande!==null||CI.bl!==null);if(!_hasCommandeCol&&headersC)showToast('⚠️ Colonne "N° commande" absente du fichier Consommé — le dédoublonnage BL est désactivé.','warning');

      for(let i=0;i<dataC.rows.length;i+=CHUNK_SIZE){const end=Math.min(i+CHUNK_SIZE,dataC.rows.length);for(let j=i;j<end;j++){const row=dataC.rows[j];const _rs=(CI.store!==null?(row[CI.store]??'').toString().trim().toUpperCase():'')||'INCONNU';const _ra=(CI.article!==null?(row[CI.article]??''):'').toString();const _rc=(CI.client!==null?(row[CI.client]??''):'').toString().trim();const _rcp=CI.caP!==null?+row[CI.caP]||0:0;const _rce=CI.caE!==null?+row[CI.caE]||0:0;const _rqp=CI.qteP!==null?+row[CI.qteP]||0:0;const _rqe=CI.qteE!==null?+row[CI.qteE]||0:0;const _rvp=CI.vmbP!==null?+row[CI.vmbP]||0:0;const _rve=CI.vmbE!==null?+row[CI.vmbE]||0:0;const _rnc=(CI.commande!==null?(row[CI.commande]??'').toString():'').trim();const _rbl2=(CI.bl!==null?(row[CI.bl]??'').toString():'').trim();const _rncb=_rnc||_rbl2;const _rj=CI.jour!==null?row[CI.jour]:null;const canal=(CI.canal!==null?(row[CI.canal]??''):'').toString().trim().toUpperCase();
      // V24.4: canalAgence/libelleLookup/articleCanalCA — period-independent, skip for isRefilter
      if(!isRefilter){
      if(canal){const _sk_canal=_rs;const _storeMatch=!_S.selectedMyStore||_sk_canal==='INCONNU'||_sk_canal===_S.selectedMyStore;if(_storeMatch){const nc2=_rncb;const _bl2=_rbl2;if(nc2||_bl2){if(!_S.canalAgence[canal])_S.canalAgence[canal]={bl:new Set(),blNums:new Set(),ca:0,caP:0,caE:0};if(nc2)_S.canalAgence[canal].bl.add(nc2);if(_bl2&&_bl2!==nc2)_S.canalAgence[canal].blNums.add(_bl2);}}}
      {const _ra0=_ra;const _c0=cleanCode(_ra0);if(_c0&&!_S.libelleLookup[_c0]){const _s0=_ra0.indexOf(' - ');if(_s0>0)_S.libelleLookup[_c0]=_ra0.substring(_s0+3).trim();}}
      // Accumulation CA par canal (prélevé + enlevé) — avant le continue pour capturer tous les canaux
      if(canal&&_S.canalAgence[canal]){const _sk_ca=_rs;if(!_S.selectedMyStore||_sk_ca==='INCONNU'||_sk_ca===_S.selectedMyStore){const _caP3=_rcp;const _caE3=_rce;_S.canalAgence[canal].caP+=_caP3;_S.canalAgence[canal].caE+=_caE3;_S.canalAgence[canal].ca+=_caP3+_caE3;
      // [F1 fix] articleCanalCA — tous canaux, filtré par agence, construit ici dans la boucle existante
      {const _cf1=cleanCode(_ra);if(_cf1){const _qteP_acc=_rqp;if(_caP3+_caE3>0||_qteP_acc>0){if(!_S.articleCanalCA.has(_cf1))_S.articleCanalCA.set(_cf1,new Map());const _acm=_S.articleCanalCA.get(_cf1);if(!_acm.has(canal))_acm.set(canal,{ca:0,qteP:0,countBL:0});const _ace=_acm.get(canal);_ace.ca+=_caP3+_caE3;_ace.qteP+=_qteP_acc;_ace.countBL++;}}}
      }}
      } // end !isRefilter for period-independent blocks
      // Parse date une seule fois — réutilisé par sumCAAll, filtre hors-MAGASIN, et filtre MAGASIN plus bas
      const dateV=parseExcelDate(_rj);
      // Acheteurs par agence × univers — pleine période, on résout l'univers après le stock.
      if(!isRefilter){const _ccBU=extractClientCode(_rc);const _codeBU=cleanCode(_ra);if(_ccBU&&_codeBU){
        const _storeBU=_rs==='INCONNU'?(_S.selectedMyStore||_rs):_rs;
        const _caBU=_rcp+_rce;const _qBU=_rqp+_rqe;
        const _uvBU=(CI.univers!==null?(row[CI.univers]??''):'').toString().trim();
        const _cfBU=(CI.codeFam!==null?(row[CI.codeFam]??''):'').toString().trim()||extractFamCode(((CI.famille!==null?(row[CI.famille]??''):'')||'').toString().trim());
        if((_caBU>0||_qBU>0))_storeUniverseBuyerRows.push({store:_storeBU,cc:_ccBU,code:_codeBU,univ:_uvBU,fam:_cfBU});
      }}
      // clientLastOrderAll — tous canaux, period-independent, avant le split canal
      if(!isRefilter&&dateV){const _ccAll=extractClientCode(_rc);const _skAll=_rs;if(_ccAll&&(!_S.selectedMyStore||_skAll==='INCONNU'||_skAll===_S.selectedMyStore)){const prev=_S.clientLastOrderAll.get(_ccAll);if(!prev||dateV>prev.date)_S.clientLastOrderAll.set(_ccAll,{date:dateV,canal:canal||'MAGASIN'});
      // clientLastOrderByCanal — dernière commande par canal
      const _cByC=canal||'MAGASIN';if(!_S.clientLastOrderByCanal.has(_ccAll))_S.clientLastOrderByCanal.set(_ccAll,new Map());const _cMap=_S.clientLastOrderByCanal.get(_ccAll);const _prevC=_cMap.get(_cByC);if(!_prevC||dateV>_prevC)_cMap.set(_cByC,dateV);
      // clientLastOrder — MAGASIN uniquement, period-independent (comme clientLastOrderAll)
      if(!canal||canal==='MAGASIN'){const _prevMag=_S.clientLastOrder.get(_ccAll);if(!_prevMag||dateV>_prevMag)_S.clientLastOrder.set(_ccAll,dateV);}}}
      // Accumulation CA tous canaux par client dans _tempCAAll (fusionné après la boucle)
      // Ne PAS créer d'entrée dans ventesLocalMagPeriode ici — seules les lignes MAGASIN (L1686) le font
      if(!(_S.periodFilterStart&&dateV&&dateV<_S.periodFilterStart)&&!(_S.periodFilterEnd&&dateV&&dateV>_S.periodFilterEnd))
      {const _ccA=extractClientCode(_rc);const _codeA=cleanCode(_ra);const _skA=_rs;if(_ccA&&_codeA&&(!_S.selectedMyStore||_skA==='INCONNU'||_skA===_S.selectedMyStore)){const _caAT=_rcp+_rce;if(_caAT>0){if(!_tempCAAll.has(_ccA))_tempCAAll.set(_ccA,new Map());const _amA=_tempCAAll.get(_ccA);_amA.set(_codeA,(_amA.get(_codeA)||0)+_caAT);}}}
      // _tempCAAllFull — tous canaux, pleine période (sans filtre), pour ventesLocalMag12MG.sumCAAll
      if(!isRefilter){const _ccAF=extractClientCode(_rc);const _codeAF=cleanCode(_ra);if(_ccAF&&_codeAF&&(!_S.selectedMyStore||_rs==='INCONNU'||_rs===_S.selectedMyStore)){const _caAF=_rcp+_rce;if(_caAF>0){if(!_tempCAAllFull.has(_ccAF))_tempCAAllFull.set(_ccAF,new Map());const _amAF=_tempCAAllFull.get(_ccAF);_amAF.set(_codeAF,(_amAF.get(_codeAF)||0)+_caAF);}}}
      // clientNomLookup — ALL canals, before the canal split, so hors-MAGASIN clients get named too
      if(!isRefilter){const _ccNom=extractClientCode(_rc);if(_ccNom&&!_S.clientNomLookup[_ccNom]){const _rawFull=_rc;const _di=_rawFull.indexOf(' - ');if(_di>=0)_S.clientNomLookup[_ccNom]=_rawFull.slice(_di+3).trim();}}
      if(_S.storesIntersection.size>0?canal!=='MAGASIN':canal!==''&&canal!=='MAGASIN'){
        // Canaux hors MAGASIN — filtre période + accumulation ventesParAgenceByCanal
        if(canal){
          if(_S.periodFilterStart&&dateV&&dateV<_S.periodFilterStart){continue;}
          if(_S.periodFilterEnd&&dateV&&dateV>_S.periodFilterEnd){continue;}
          const cc=extractClientCode(_rc);const codeArt=cleanCode(_ra);const caLigne=_rcp+_rce;const qteLigne=_rqp+_rqe;const skHors=_rs;
          // ventesLocalHorsMag — skip for isRefilter
          if(!isRefilter&&cc&&codeArt&&(!_S.selectedMyStore||skHors==='INCONNU'||skHors===_S.selectedMyStore)){_S.cannauxHorsMagasin.add(canal);const hm=_S.ventesLocalHorsMag.get(cc)||new Map();const ex=hm.get(codeArt)||{sumCA:0,sumPrelevee:0,sumCAPrelevee:0,sumCAP:0,sumCAE:0,countBL:0,canal};ex.sumCA+=caLigne;ex.sumPrelevee+=qteLigne;ex.sumCAPrelevee+=caLigne;ex.sumCAP+=_rcp;ex.sumCAE+=_rce;ex.countBL++;hm.set(codeArt,ex);_S.ventesLocalHorsMag.set(cc,hm);}
          // ventesParAgenceByCanal — toujours (y compris isRefilter)
          if(codeArt&&(skHors==='INCONNU'||_S.storesIntersection.has(skHors)||!_S.storesIntersection.size)){const _storeKey=skHors==='INCONNU'?(_S.selectedMyStore||skHors):skHors;if(!_S.ventesParAgenceByCanal[_storeKey])_S.ventesParAgenceByCanal[_storeKey]={};if(!_S.ventesParAgenceByCanal[_storeKey][canal])_S.ventesParAgenceByCanal[_storeKey][canal]={};if(!_S.ventesParAgenceByCanal[_storeKey][canal][codeArt])_S.ventesParAgenceByCanal[_storeKey][canal][codeArt]={sumCA:0,sumPrelevee:0,countBL:0,sumVMB:0,sumVMBPrel:0};const _vpmc=_S.ventesParAgenceByCanal[_storeKey][canal][codeArt];_vpmc.sumCA+=caLigne;_vpmc.sumPrelevee+=_rcp;_vpmc.countBL++;const _vmbPH=_rvp;const _vmbEH=_rve;_vpmc.sumVMB+=_vmbPH+_vmbEH;_vpmc.sumVMBPrel+=_vmbPH;}
          // commandesPerStoreCanal — hors-MAGASIN
          if(_rncb){if(!_S.commandesPerStoreCanal[skHors])_S.commandesPerStoreCanal[skHors]={};if(!_S.commandesPerStoreCanal[skHors][canal])_S.commandesPerStoreCanal[skHors][canal]=new Set();_S.commandesPerStoreCanal[skHors][canal].add(_rncb);}
          // CA tous canaux dans d'autres agences (sk ≠ myStore)
          if(!isRefilter&&cc&&codeArt&&_S.selectedMyStore&&skHors!=='INCONNU'&&skHors!==_S.selectedMyStore){const _caAut2=_rcp+_rce;if(_caAut2>0){_S.ventesClientAutresAgences.set(cc,(_S.ventesClientAutresAgences.get(cc)||0)+_caAut2);}}
        }
        continue;
      }
      const rawArt=_ra;const code=cleanCode(rawArt);const qteP=_rqp;const qteE=_rqe;const caP=_rcp;const caE=_rce;const sk=_rs;
      if(code&&!_S.libelleLookup[code]){const si=rawArt.indexOf(' - ');if(si>0)_S.libelleLookup[code]=rawArt.substring(si+3).trim();}
      const famConso=((CI.famille!==null?(row[CI.famille]??''):'')||(CI.univers!==null?(row[CI.univers]??''):'')||'').toString().trim();const _codeFamConso=(CI.codeFam!==null?(row[CI.codeFam]??''):'').toString().trim();const _famCode=_codeFamConso||extractFamCode(famConso);if(_famCode&&code)_S.articleFamille[code]=_famCode;const _uv2=(CI.univers!==null?(row[CI.univers]??''):'').toString().trim();const _cf2=_codeFamConso||'';const univConso=_uv2||(_cf2?FAM_LETTER_UNIVERS[_cf2[0].toUpperCase()]||'Inconnu':'');if(univConso&&code)_S.articleUnivers[code]=univConso;
      if(dateV){const ts=dateV.getTime();if(ts<minDateVente)minDateVente=ts;if(ts>maxDateVente)maxDateVente=ts;}
      // Hoistés avant le filtre période : invariants (W/V/MIN/MAX), ventesLocalMag12MG
      const cc2=extractClientCode(_rc);const nc=(_hasCommandeCol?(_rncb||''):('__r'+j)).toString().trim()||('__r'+j);
      if(!isRefilter&&dateV&&code&&(!_S.selectedMyStore||sk===_S.selectedMyStore)&&qteP>0){if(!monthlySales[code])monthlySales[code]=new Array(12).fill(0);monthlySales[code][dateV.getMonth()]+=qteP;}
      if(!isRefilter&&(!useMulti||sk===_S.selectedMyStore)){if(!articleRaw[code])articleRaw[code]={tpp:0,tpn:0,te:0,bls:{},cbl:0};const a=articleRaw[code];if(qteP>0)a.tpp+=qteP;if(qteP<0)a.tpn+=qteP;if(qteE>0)a.te+=qteE;if(!a.bls[nc]){a.bls[nc]={p:Math.max(qteP,0),e:Math.max(qteE,0)};a.cbl++;}else{const ex=a.bls[nc];if(Math.max(qteP,0)>ex.p)ex.p=Math.max(qteP,0);if(Math.max(qteE,0)>ex.e)ex.e=Math.max(qteE,0);}}
      if(!isRefilter&&cc2&&code&&(!_S.selectedMyStore||sk===_S.selectedMyStore)){if(!_S.ventesLocalMag12MG.has(cc2))_S.ventesLocalMag12MG.set(cc2,new Map());const _artF=_S.ventesLocalMag12MG.get(cc2);if(!_artF.has(code))_artF.set(code,{sumPrelevee:0,sumCAPrelevee:0,sumCA:0,sumCAAll:0,countBL:0});const _eF=_artF.get(code);if(qteP>0){_eF.sumPrelevee+=qteP;_eF.sumCAPrelevee+=caP;}_eF.sumCA+=caP+caE;if(qteP>0||qteE>0)_eF.countBL++;}
      // articleClientsFull — pleine période, hoisté hors filtre période (pour squelette invariant)
      if(!isRefilter&&cc2&&code&&(!_S.selectedMyStore||sk===_S.selectedMyStore)){const _ccFull=extractClientCode(_rc);if(_ccFull){if(!_S.articleClientsFull.has(code))_S.articleClientsFull.set(code,new Set());_S.articleClientsFull.get(code).add(_ccFull);}}
      if(_S.periodFilterStart&&dateV&&dateV<_S.periodFilterStart)continue;
      if(_S.periodFilterEnd&&dateV&&dateV>_S.periodFilterEnd)continue;
      if(_S.storesIntersection.has(sk)||!_S.storesIntersection.size){if(!_S.ventesParAgence[sk])_S.ventesParAgence[sk]={};if(!_S.ventesParAgence[sk][code])_S.ventesParAgence[sk][code]={sumPrelevee:0,sumEnleve:0,sumCA:0,countBL:0,sumVMB:0};if(qteP>0)_S.ventesParAgence[sk][code].sumPrelevee+=qteP;if(qteE>0)_S.ventesParAgence[sk][code].sumEnleve+=qteE;_S.ventesParAgence[sk][code].sumCA+=caP+caE;if(qteP>0||qteE>0)_S.ventesParAgence[sk][code].countBL++;_S.ventesParAgence[sk][code].sumVMB+=_rvp+_rve;if(canal){const _bck=_S.ventesParAgence[sk][code];if(!_bck.byCanal)_bck.byCanal={};if(!_bck.byCanal[canal])_bck.byCanal[canal]={sumPrelevee:0,sumCA:0,countBL:0,sumVMB:0};const _bc=_bck.byCanal[canal];if(qteP>0)_bc.sumPrelevee+=qteP;_bc.sumCA+=caP+caE;if(qteP>0||qteE>0)_bc.countBL++;_bc.sumVMB+=_rvp+_rve;}if(code&&(!canal||canal==='MAGASIN')){const _canalKey='MAGASIN';if(!_S.ventesParAgenceByCanal[sk])_S.ventesParAgenceByCanal[sk]={};if(!_S.ventesParAgenceByCanal[sk][_canalKey])_S.ventesParAgenceByCanal[sk][_canalKey]={};if(!_S.ventesParAgenceByCanal[sk][_canalKey][code])_S.ventesParAgenceByCanal[sk][_canalKey][code]={sumCA:0,sumPrelevee:0,countBL:0,sumVMB:0,sumVMBPrel:0};const _vpmc2=_S.ventesParAgenceByCanal[sk][_canalKey][code];_vpmc2.sumCA+=caP+caE;_vpmc2.sumPrelevee+=caP;if(qteP>0||qteE>0)_vpmc2.countBL++;const _vmbP2=_rvp;const _vmbE2=_rve;_vpmc2.sumVMB+=_vmbP2+_vmbE2;_vpmc2.sumVMBPrel+=_vmbP2;}}
      // V2 Phase 1: DataStore.ventesLocalMagPeriode (myStore only) + _S.ventesClientsPerStore (all stores)
      // cc2 et nc déclarés avant le filtre période (hoistés pour W/V/MIN/MAX et ventesLocalMag12MG)
      if(cc2&&code){if(!_S.ventesClientsPerStore[sk])_S.ventesClientsPerStore[sk]=new Set();_S.ventesClientsPerStore[sk].add(cc2);{const _cca=caP+caE;if(_cca>0){if(!_S.caClientParStore[sk])_S.caClientParStore[sk]=new Map();_S.caClientParStore[sk].set(cc2,(_S.caClientParStore[sk].get(cc2)||0)+_cca);}}}
      // commandesPerStoreCanal : N° commande (ou BL) uniques par store × canal (pour nbCommandes dans agenceStore)
      {const _ncCmd=_rncb;if(_ncCmd){const _canalCmd=canal||'MAGASIN';if(!_S.commandesPerStoreCanal[sk])_S.commandesPerStoreCanal[sk]={};if(!_S.commandesPerStoreCanal[sk][_canalCmd])_S.commandesPerStoreCanal[sk][_canalCmd]=new Set();_S.commandesPerStoreCanal[sk][_canalCmd].add(_ncCmd);}}
      // _S.clientsMagasin : clients du consommé de l'agence sélectionnée uniquement (après filtre canal+store)
      if(cc2&&(!_S.selectedMyStore||sk===_S.selectedMyStore)){_S.clientsMagasin.add(cc2);const _nc4m=_rncb||('__row_'+j);if(!_clientMagasinBLsTemp.has(cc2))_clientMagasinBLsTemp.set(cc2,new Set());_clientMagasinBLsTemp.get(cc2).add(_nc4m);}
      // clientNomLookup already populated above (before canal split) for ALL canals
      // ventesLocalMagPeriode = MAGASIN uniquement (garde canal déjà assuré par continue ligne 1594)
      // sumCA inclut les avoirs (qteP<0) pour refléter le CA net réel comme Qlik
      // ventesLocalMagPeriode (myStore) + ventesReseauTousCanaux (ALL stores)
      if(cc2&&code){if(!_S.ventesReseauTousCanaux.has(cc2))_S.ventesReseauTousCanaux.set(cc2,new Map());const artMapR=_S.ventesReseauTousCanaux.get(cc2);if(!artMapR.has(code))artMapR.set(code,{sumCA:0,countBL:0});const eR=artMapR.get(code);eR.sumCA+=caP+caE;if(qteP>0||qteE>0)eR.countBL++;if(!_S.selectedMyStore||sk===_S.selectedMyStore){if(!DataStore.ventesLocalMagPeriode.has(cc2))DataStore.ventesLocalMagPeriode.set(cc2,new Map());const artMap=DataStore.ventesLocalMagPeriode.get(cc2);if(!artMap.has(code))artMap.set(code,{sumPrelevee:0,sumCAPrelevee:0,sumCA:0,sumCAAll:0,countBL:0});const e=artMap.get(code);if(qteP>0){e.sumPrelevee+=qteP;e.sumCAPrelevee+=caP;}e.sumCA+=caP+caE;if(qteP>0||qteE>0)e.countBL++;}}
      // CA MAGASIN dans d'autres agences (sk ≠ myStore)
      if(!isRefilter&&cc2&&code&&_S.selectedMyStore&&sk!=='INCONNU'&&sk!==_S.selectedMyStore){const _caAut=caP+caE;if(_caAut>0){_S.ventesClientAutresAgences.set(cc2,(_S.ventesClientAutresAgences.get(cc2)||0)+_caAut);}}
      if((!_S.selectedMyStore||sk===_S.selectedMyStore)){const _nc3=_rnc;if(_nc3)commandesPDV.add(_nc3);}
      if((!_S.selectedMyStore||sk===_S.selectedMyStore)&&(qteP>0||qteE>0)){if(cc2&&dateV&&!isNaN(dateV.getTime()))passagesUniques.add(cc2+'_'+formatLocalYMD(dateV));}
      // clientLastOrder peuplé avant le filtre période (ligne ~1273) — period-independent
      // V2 Phase 2: _S.articleClients — sans filtre store ni quantité pour couvrir mono ET multi, prélevé ET enlevé
      const rawClient=_rc;
      const codeClient=extractClientCode(_rc);
      if(codeClient&&code){
        if(!_S.articleClients.has(code))_S.articleClients.set(code,new Set());
        _S.articleClients.get(code).add(codeClient);
        if(!_S.clientArticles.has(codeClient))_S.clientArticles.set(codeClient,new Set());
        _S.clientArticles.get(codeClient).add(code);
      }
      if(!useMulti||sk===_S.selectedMyStore){if(qteP>0||qteE>0){const blNum=nc;if(!_S.blData[blNum])_S.blData[blNum]={codes:new Set(),familles:new Set()};_S.blData[blNum].codes.add(code);if(_famCode)_S.blData[blNum].familles.add(famLib(_famCode));if(qteP>0)_S.blPreleveeSet.add(blNum);}}}updateProgress(45+Math.round(i/dataC.rows.length*20),100);await yieldToMain();}
      // Fusion sumCAAll : enrichir ventesLocalMagPeriode avec les CA tous canaux (seuls les clients MAGASIN existants)
      for(const [_cc,_arts] of _tempCAAll){if(!_S.ventesLocalMagPeriode.has(_cc))continue;const _cMap=_S.ventesLocalMagPeriode.get(_cc);for(const [_code,_ca] of _arts){const _e=_cMap.get(_code);if(_e)_e.sumCAAll+=_ca;}}
      // Fusion sumCAAll pleine période dans ventesLocalMag12MG
      if(!isRefilter){for(const [_cc,_arts] of _tempCAAllFull){if(!_S.ventesLocalMag12MG.has(_cc))continue;const _cMap=_S.ventesLocalMag12MG.get(_cc);for(const [_code,_ca] of _arts){const _e=_cMap.get(_code);if(_e)_e.sumCAAll+=_ca;}}}
      // Build blCanalMap + convert canalAgence bl sets — skipped for isRefilter (canalAgence unchanged)
      if(!isRefilter){
      _S.blCanalMap = new Map();
      for(const [canal, data] of Object.entries(_S.canalAgence)){
        if(data.bl instanceof Set){for(const bl of data.bl)_S.blCanalMap.set(bl, canal);}
        if(data.blNums instanceof Set){for(const bl of data.blNums)_S.blCanalMap.set(bl, canal);}
      }
      for(const c of Object.keys(_S.canalAgence)){_S.canalAgence[c].bl=_S.canalAgence[c].bl.size;delete _S.canalAgence[c].blNums;}
      }
      // Recalcul canalAgence période-filtré (isRefilter OU premier parse avec filtre déjà positionné)
      if(isRefilter||(_S.periodFilterStart||_S.periodFilterEnd)){
        _S.canalAgence={};const _tmpBLca={};
        for(const row of dataC.rows){
          const canal=(CI.canal!==null?(row[CI.canal]??''):'').toString().trim().toUpperCase();if(!canal)continue;
          const sk=(CI.store!==null?(row[CI.store]??'').toString().trim().toUpperCase():'')||'INCONNU';if(_S.selectedMyStore&&sk!=='INCONNU'&&sk!==_S.selectedMyStore)continue;
          const dateV=parseExcelDate(CI.jour!==null?row[CI.jour]:null);
          if(_S.periodFilterStart&&dateV&&dateV<_S.periodFilterStart)continue;
          if(_S.periodFilterEnd&&dateV&&dateV>_S.periodFilterEnd)continue;
          const nc=((CI.commande!==null?(row[CI.commande]??'').toString():CI.bl!==null?(row[CI.bl]??'').toString():'')).trim();
          const caP=CI.caP!==null?+row[CI.caP]||0:0;const caE=CI.caE!==null?+row[CI.caE]||0:0;
          if(!_S.canalAgence[canal])_S.canalAgence[canal]={bl:0,ca:0,caP:0,caE:0};
          if(nc){if(!_tmpBLca[canal])_tmpBLca[canal]=new Set();if(!_tmpBLca[canal].has(nc)){_tmpBLca[canal].add(nc);_S.canalAgence[canal].bl++;}}
          _S.canalAgence[canal].caP+=caP;_S.canalAgence[canal].caE+=caE;_S.canalAgence[canal].ca+=caP+caE;
        }
      }
      // Patch obsKpis.mine depuis canalAgence (période-filtré — isRefilter ou premier parse avec filtre)
      if((isRefilter||(_S.periodFilterStart||_S.periodFilterEnd))&&_S.benchLists?.obsKpis){
        const _ca=Object.values(_S.canalAgence).reduce((t,v)=>t+(v.ca||0),0);

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
      _mark('Boucle consommé');

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
        // MinFull/MaxFull = plage totale : on les définit sur le parse complet (!isRefilter)
        // minDateVente/maxDateVente sont trackés AVANT le filtre période → toujours pleine plage
        if(!isRefilter){_S.consommePeriodMinFull=_S.consommePeriodMin;_S.consommePeriodMaxFull=_S.consommePeriodMax;}
        updatePeriodAlert();
        buildPeriodFilter();
      }
      const totalBLs=Object.keys(_S.blData).length;let sumRefParBL=0,sumFamParBL=0;const famBLcount={};
      for(const bl of Object.values(_S.blData)){sumRefParBL+=bl.codes.size;sumFamParBL+=bl.familles.size;for(const fam of bl.familles)famBLcount[fam]=(famBLcount[fam]||0)+1;}
      const _sd0=_S.ventesParAgence[_S.selectedMyStore]||{};const _caCalc=Object.values(_sd0).reduce((s,v)=>s+(v.sumCA||0),0);const _vmbCalc=Object.values(_sd0).reduce((s,v)=>s+(v.sumVMB||0),0);
      _S.ventesAnalysis={refParBL:totalBLs>0?(sumRefParBL/totalBLs).toFixed(1):0,famParBL:totalBLs>0?(sumFamParBL/totalBLs).toFixed(1):0,totalBL:totalBLs,refActives:Object.values(synth).filter(s=>s.sumP>0||s.sumE>0).length,attractivite:famBLcount,nbPassages:passagesUniques.size,txMarge:_caCalc>0?_vmbCalc/_caCalc*100:null,vmc:commandesPDV.size>0?_caCalc/commandesPDV.size:null};

      let familles=new Set(),sousFamilles=new Set(),emplacements=new Set(),statuts=new Set();
      if(!isRefilter) _S._pushedCodes=new Set(); // reset dédup avant le bloc stock (interdit le double-push inter-appels)
      if(!isRefilter && dataS && dataS.length){ // ── bloc stock — skipped for isRefilter (stock unchanged) ──
      updatePipeline('stock','active');
      _resetColCache(); // colonnes stock différentes du consommé
      // Pré-détection colonnes stock qty / valeur — évite Object.keys par ligne
      {const _ks0=Object.keys(dataS[0]||{});_cSStk=_ks0.find(k=>{const lk=k.toLowerCase();return(lk.includes('stock')||lk.includes('qt')||lk.includes('quant'))&&!lk.includes('min')&&!lk.includes('max')&&!lk.includes('valeur')&&!lk.includes('alerte')&&!lk.includes('statut');});_cSValS=_ks0.find(k=>{const lk=k.toLowerCase().replace(/[\r\n]/g,' ');return lk.includes('valeur')&&lk.includes('stock');});}
      _mark('Analyse ventes');
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
      else{const dlR=(T>3*U)?3*U:T;const dl=Math.min(dlR,U*5);const secDays=Wp>=12?4:Wp>=4?3:(prixUnitaire>HIGH_PRICE?1:2);nouveauMin=Math.max(Math.min(Math.round(dl+(X*secDays)),Math.ceil(V/6)),1);if(nouveauMin<0)nouveauMin=0;if(nouveauMin===0)nouveauMax=0;else{const df=Wp>12?21:10;const me=prixUnitaire>HIGH_PRICE?(Wp>12?1:0):(Wp>12?3:1);nouveauMax=Math.max(Math.round(nouveauMin+(X*df)),nouveauMin+me);}}
      const couvertureJours=calcCouverture(stockActuel,V);
      if(_S._pushedCodes.has(code))continue; _S._pushedCodes.add(code);
      DataStore.finalData.push({code,libelle,statut,famille,sousFamille,emplacement,W,V,stockActuel,prixUnitaire,valeurStock,ancienMin,ancienMax,nouveauMin,nouveauMax,ageJours,isNouveaute,enleveTotal,couvertureJours,isParent});
      }updateProgress(70+Math.round(i/dataS.length*20),100);await yieldToMain();}
      // C1: enrichir _S.libelleLookup avec les libellés consommé pour les codes absents du stock
      for(const k in _libelleFromConsomme){if(!_S.libelleLookup[k])_S.libelleLookup[k]=_libelleFromConsomme[k];}
      _mark('Boucle stock');
      updatePipeline('stock','done');

      // ★ Médiane réseau MIN/MAX par article (multi-agences uniquement)
      if(useMulti&&DataStore.finalData.length){const _otherS=[..._S.storesIntersection].filter(s=>s!==_S.selectedMyStore);if(_otherS.length){for(const r of DataStore.finalData){const _mins=_otherS.map(s=>_S.stockParMagasin[s]?.[r.code]?.qteMin).filter(v=>v>0);const _maxs=_otherS.map(s=>_S.stockParMagasin[s]?.[r.code]?.qteMax).filter(v=>v>0);r.medMinReseau=_mins.length?_median(_mins):null;r.medMaxReseau=_maxs.length?_median(_maxs):null;}}}

      enrichPrixUnitaire();
      _enrichFinalDataWithCA(); // CA réel depuis ventesLocalMagPeriode (MAGASIN, myStore)

      // ★ Juge de Paix — Vitesse Réseau (fallback adaptatif pour TOUS les 0/0)
      if(useMulti) _applyVitesseReseau();

      // Fix: align _S.articleFamille with stock famille (stock is master)
      for (const r of DataStore.finalData) { if (r.famille && r.famille !== 'Non Classé') _S.articleFamille[r.code] = r.famille; }
      // B3b: Recalcul moteur saisonnier après enrichissement articleFamille (stock est master des familles)
      _computeSeasonalIndex(monthlySales);
      _S._hasStock = _S.finalData.length > 0;
      }else{updatePipeline('stock','skip');} // ── fin bloc stock ──────────────────────

      // Acheteurs par agence × univers : résolution après stock (certains consommés n'ont pas l'univers/famille).
      // clientsByStoreUnivers = pleine période 12MG (structurel, pas filtré par période).
      if (!Object.keys(_S.clientsByStoreUnivers || {}).length) {
        _S.clientsByStoreUnivers={};
        for(const row of _storeUniverseBuyerRows){
          const fam=row.fam||_S.articleFamille?.[row.code]||'';
          const univ=(fam&&fam!=='Non Classé')?(FAM_LETTER_UNIVERS[fam[0].toUpperCase()]||row.univ||'Inconnu'):(row.univ||_S.articleUnivers?.[row.code]||'');
          if(!univ)continue;
          if(!_S.clientsByStoreUnivers[row.store])_S.clientsByStoreUnivers[row.store]={};
          if(!_S.clientsByStoreUnivers[row.store][univ])_S.clientsByStoreUnivers[row.store][univ]=new Set();
          _S.clientsByStoreUnivers[row.store][univ].add(row.cc);
        }
      }

      // Re-parse livraisons + benchmark — skipped for isRefilter (period-independent)
      // Chalandise : géré dans _postParseMain (point d'entrée principal)
      if(!isRefilter){
        {const fL=document.getElementById('fileLivraisons').files[0];if(fL&&!_S.livraisonsReady&&!_S._livraisonsLoading){_S._livraisonsLoading=true;try{await parseLivraisons(fL);}finally{_S._livraisonsLoading=false;}}}
        if(useMulti){updateProgress(92,100,'Benchmark…');await yieldToMain();computeBenchmark();_mark('Benchmark');}
      }
      // ABC/FMR, selects — skipped for isRefilter (finalData unchanged)
      if(!isRefilter){
        if(DataStore.finalData.length>0&&DataStore.finalData.every(r=>r.stockActuel===0)){showToast('⚠️ Attention : toutes les valeurs de stock sont à 0 dans le fichier. Vérifiez votre export.','warning');}
        updateProgress(93,100,'Radar ABC/FMR…');await yieldToMain();computeABCFMR(DataStore.finalData);_mark('ABC/FMR');assertPostParseInvariants();
        if(useMulti){updateProgress(94,100,'Verdicts Squelette…');await yieldToMain();try{const _vr=applyVerdictOverrides();console.log('[PRISME] Bouclier Squelette:',_vr);}catch(e){console.error('[PRISME] Bouclier Squelette ERREUR:',e);}_mark('Verdicts');}
        updateProgress(95,100,'Affichage…');await yieldToMain();
        populateSelect('filterFamille',familles,famLabel);populateSelect('filterSousFamille',sousFamilles);populateSelect('filterEmplacement',emplacements);populateSelect('filterStatut',statuts);
        buildSqLookup();
      }
      const elapsed=((performance.now()-t0)/1000).toFixed(1);
      document.getElementById('navStats').textContent=DataStore.finalData.length.toLocaleString('fr')+' art.';document.getElementById('navStats').classList.remove('hidden');
      document.getElementById('navPerf').textContent=elapsed+'s';document.getElementById('navPerf').classList.remove('hidden');
      const _navSt=document.getElementById('navStore');if(_navSt){_navSt.textContent=_S.selectedMyStore||'';_navSt.classList.toggle('hidden',!_S.selectedMyStore);}
      document.getElementById('navReportingBtn').classList.remove('hidden');
      document.getElementById('globalFilters').classList.remove('hidden');
      document.body.classList.add('pilot-loaded');
      if(!isRefilter){
        const _terrBtn=document.getElementById('btnTabCommerce');_terrBtn.classList.remove('hidden');
        const _clientsBtn=document.getElementById('btnTabClients');if(_clientsBtn)_clientsBtn.classList.remove('hidden');
        const terrNoC=document.getElementById('terrNoChalandise');if(terrNoC)terrNoC.classList.toggle('hidden',_S.chalandiseReady);
      }
      // Render main UI immediately — don't wait for territoire
      computeClientCrossing();computeReconquestCohort();
      buildClientStore();_applyForcageCommercial();_mark('ClientStore + crossing');
      if(!isRefilter&&_S.chalandiseReady)_computeChalandiseDistances();
      // caByArticleCanal — skipped for isRefilter (ventesLocalHorsMag unchanged)
      if (!isRefilter && _S.chalandiseReady) _rebuildCaByArticleCanal();
      if(_S.chalandiseReady&&DataStore.ventesLocalMagPeriode.size>0){launchClientWorker().then(()=>{resetBenchMetierCache();computeOpportuniteNette();computeAnglesMorts();computeOmniScores();computeFamillesHors();buildClientStore();_applyForcageCommercial();renderTabBadges();updateLaboTiles();showToast('📊 Agrégats clients calculés','success');if(!isRefilter&&_S.selectedMyStore)_saveSessionToIDB();}).catch(err=>console.warn('Client worker error:',err));}
      _S.currentPage=0;_S._parsingInProgress=false; // libère les renders
      if(isRefilter&&useMulti){invalidateCache('bench');computeBenchmark();}if(isRefilter){renderCanalAgence();renderCurrentTab();}else{renderAll();}_mark('renderAll');
      if(!isRefilter){_syncTabAccess();}
      if(_autoYTD){setPeriodePreset('YTD');}
      _mark('Prêt');console.table(_perf);
      updateProgress(100,100,'✅ Prêt !',elapsed+'s');await new Promise(r=>setTimeout(r,400));
      renderSidebarAgenceSelector();
      if(!isRefilter){switchTab('stock');btn.textContent='✅ '+elapsed+'s';btn.classList.replace('s-panel-inner','bg-emerald-600');const _nbF=2+(document.getElementById('fileLivraisons')?.files[0]?1:0)+(document.getElementById('fileChalandise').files[0]?1:0);collapseImportZone(_nbF,_S.selectedMyStore,DataStore.finalData.length,elapsed);const btnR=document.getElementById('btnRecalculer');if(btnR)btnR.classList.remove('hidden');}else{btn.textContent='✅ '+elapsed+'s';btn.classList.replace('s-panel-inner','bg-emerald-600');}
      // IDB save — skipped for isRefilter (only saves on full load)
      if (!isRefilter && _S.selectedMyStore) { localStorage.setItem('prisme_selectedStore', _S.selectedMyStore); _saveToCache(); _saveSessionToIDB(); if(_f1)_saveFileHashes(_f1,_f2,document.getElementById('fileChalandise').files[0]||null,document.getElementById('fileLivraisons').files[0]||null); }
      // Pré-calcul squelette en idle — alimente SOCLE badges + 🚨 Capitaines
      _scheduleIdleSquelette();
    }catch(error){if(error.message==='NO_STORE_SELECTED')return;showToast('❌ '+error.message,'error');console.error(error);btn.textContent='❌';btn.classList.replace('s-panel-inner','bg-red-600');}
    finally{btn.disabled=false;btn.classList.remove('loading');hideLoading();}
    if(isRefilter&&_S.territoireReady){renderTerritoireTab();}
  }



  // V24.4+: Render canal distribution block — enriched with prélevé/enlevé CA

  function renderComparison(currentKPI){const prev=_S.kpiHistory.length>0?_S.kpiHistory[_S.kpiHistory.length-1]:null;_S.kpiHistory.push(currentKPI);while(_S.kpiHistory.length>12)_S.kpiHistory.shift();if(!prev){document.getElementById('compareBlock').classList.add('hidden');return;}document.getElementById('compareBlock').classList.remove('hidden');document.getElementById('compareDate').textContent='(réf: '+prev.date+')';const metrics=[{label:'💰 Stock',cur:currentKPI.totalValue,old:prev.totalValue,fmt:'euro',better:'down'},{label:'☠️ Dormant',cur:currentKPI.dormant,old:prev.dormant,fmt:'euro',better:'down'},{label:'📊 Surstock',cur:currentKPI.surstock,old:prev.surstock,fmt:'euro',better:'down'},{label:'🚨 Ruptures',cur:currentKPI.ruptures,old:prev.ruptures,fmt:'num',better:'down'},{label:'✅ Dispo.',cur:currentKPI.serviceRate,old:prev.serviceRate,fmt:'pct',better:'up'},{label:'👁️ Excédent ERP',cur:currentKPI.capalin,old:prev.capalin,fmt:'euro',better:'down'},{label:'💸 CA Perdu',cur:currentKPI.caPerdu||0,old:prev.caPerdu||0,fmt:'euro',better:'down'}];const p=[];for(const m of metrics){const diff=m.cur-m.old;const isGood=(m.better==='down'&&diff<=0)||(m.better==='up'&&diff>=0);const arrow=diff>0?'▲':diff<0?'▼':'■';const color=diff===0?'t-tertiary':isGood?'c-ok':'c-danger';const bg=diff===0?'s-card-alt':isGood?'i-ok-bg':'i-danger-bg';let diffStr='';if(m.fmt==='euro')diffStr=(diff>0?'+':'')+formatEuro(diff);else if(m.fmt==='pct')diffStr=(diff>0?'+':'')+diff.toFixed(1)+'%';else diffStr=(diff>0?'+':'')+diff;let curStr='';if(m.fmt==='euro')curStr=formatEuro(m.cur);else if(m.fmt==='pct')curStr=m.cur.toFixed(1)+'%';else curStr=m.cur;p.push('<div class="'+bg+' rounded-lg p-3 text-center border"><p class="text-[10px] font-bold t-secondary mb-1">'+m.label+'</p><p class="text-sm font-extrabold t-primary">'+curStr+'</p><p class="text-xs font-bold '+color+'">'+arrow+' '+diffStr+'</p></div>');}document.getElementById('compareCards').innerHTML=p.join('');}

  // ── Pré-calcul squelette en idle ──────────────────────────────────────────
  function _scheduleIdleSquelette(){
    if(_S.lowMemMode)return; // mobile : éviter computeSquelette() (RAM/CPU), pas nécessaire pour Scan
    if(_S._prSqData)return; // déjà calculé
    const fn=()=>{
      if(_S._prSqData)return;
      const t0=performance.now();
      try{
        const sq=computeSquelette();
        _S._prSqData=sq;
        // Re-render alerte anticipée avec badges SOCLE
        _renderSaisonAnticipe();
        console.log(`[IDLE] computeSquelette ${performance.now()-t0|0}ms`);
      }catch(e){console.warn('[IDLE] computeSquelette error:',e);}
    };
    if(typeof requestIdleCallback==='function')requestIdleCallback(fn,{timeout:5000});
    else setTimeout(fn,2000);
  }

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

  // ── Alerte Saisonnière Anticipée (M+1 / M+2) × Tronc Commun ──
  function _getAlerteSaisonAnticipee() {
    const now = new Date();
    const m1 = (now.getMonth() + 1) % 12; // mois M+1
    const m2 = (now.getMonth() + 2) % 12; // mois M+2
    // Set des articles Socle (Tronc Commun) — via squelette
    let socleCodes = null;
    if (_S._prSqData) {
      socleCodes = new Set();
      for (const d of _S._prSqData.directions) { for (const a of (d.socle || [])) socleCodes.add(a.code); }
    }
    // Pré-calcul : qté vendue par famille sur chaque mois pic (contexte utilisateur)
    const _ms = _S.articleMonthlySales || {};
    const _famQteMois = {}; // {fam → {mois → qté totale}}
    for (const [code, months] of Object.entries(_ms)) {
      const fam = _S.articleFamille[code]; if (!fam) continue;
      if (!_famQteMois[fam]) _famQteMois[fam] = {};
      for (const m of [m1, m2]) {
        _famQteMois[fam][m] = (_famQteMois[fam][m] || 0) + (months[m] || 0);
      }
    }
    const alertes = [];
    for (const r of DataStore.finalData) {
      if (r.nouveauMin <= 0 || r.W < 1 || r.isParent) continue;
      const fam = r.famille;
      const si = _S.seasonalIndex[fam];
      if (!si) continue;
      // Coeff max sur M+1 et M+2
      const c1 = si[m1] || 1, c2 = si[m2] || 1;
      const coeffPic = Math.max(c1, c2);
      const moisPic = c1 >= c2 ? m1 : m2;
      if (coeffPic <= 1.2) continue; // pas de pic significatif
      // Besoin anticipé = MIN × coeff pic
      let saisonMin = Math.ceil(r.nouveauMin * coeffPic);
      const px = r.prixUnitaire || 0;
      if (px > HIGH_PRICE) saisonMin = Math.min(saisonMin, Math.max(r.stockActuel + 2, 3));
      else if (px > 50) saisonMin = Math.min(saisonMin, Math.max(Math.ceil(r.nouveauMin * 1.5), 3));
      if (r.stockActuel >= saisonMin) continue; // stock suffisant
      const qteCde = saisonMin - r.stockActuel;
      const isSocle = socleCodes ? socleCodes.has(r.code) : false;
      // Contexte : qté article vendue sur le mois pic + qté famille
      const artQte = (_ms[r.code] || [])[moisPic] || 0;
      const famQte = _famQteMois[fam]?.[moisPic] || 0;
      alertes.push({
        code: r.code, libelle: r.libelle, famille: fam,
        nouveauMin: r.nouveauMin, saisonMin, coeffPic,
        moisPic, stockActuel: r.stockActuel, prixUnitaire: px,
        qteCde, vaEuro: qteCde * px, isSocle,
        qteArticlePic: artQte, qteFamillePic: famQte,
      });
    }
    // Tri : Socle d'abord, puis par valeur à commander décroissante
    alertes.sort((a, b) => (b.isSocle ? 1 : 0) - (a.isSocle ? 1 : 0) || b.vaEuro - a.vaEuro);
    return alertes;
  }

  function renderDashboardAndCockpit(){
    if(!_S._hasStock){
      const el=document.getElementById('tabDash');
      if(el){
        let slot=document.getElementById('dashNoStockSlot');
        if(!slot){slot=document.createElement('div');slot.id='dashNoStockSlot';el.prepend(slot);}
        slot.innerHTML=_renderNoStockPlaceholder('Le Stock');
        slot.style.display='';
        [...el.children].forEach(c=>{if(c.id!=='dashNoStockSlot')c.style.display='none';});
      }
      // Sans stock — rendu minimal
      renderHealthScore();
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
    if(hasMulti&&_S.selectedMyStore){const cs=[..._S.storesIntersection];const myV=_S.ventesParAgence[_S.selectedMyStore]||{};for(const code of Object.keys(myV)){const cas=cs.map(s=>_S.ventesParAgence[s]?.[code]?.sumCA||0).filter(v=>v>0);if(cas.length>0)medianCAByCode[code]=_median(cas);}}

    for(const r of dataSource){const lv=r.valeurStock!=null?r.valeurStock:r.stockActuel*(r.prixUnitaire||0);totalValue+=lv;
    if((r.fmrClass==='F'||r.fmrClass==='M')&&r.W>=1&&!r.isParent&&!(r.V===0&&r.enleveTotal>0)){serviceTotal++;if(r.stockActuel>0)serviceOk++;}

    // ★ V23: Ruptures — exclude parent refs (no dates) + colis-only (enlevé sans prélevé) + sort by CA potentiel
    if(r.W>=3&&r.stockActuel<=0){
      if(!r.isParent&&!(r.V===0&&r.enleveTotal>0)){ // skip parent refs & colis-only
        const caPotentiel=Math.round(r.W*r.prixUnitaire);
        const prioScore=calcPriorityScore(r.W,r.prixUnitaire,r.ageJours,r.code);
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

    {const _dtv=document.getElementById('dashTotalValue');if(_dtv)_dtv.textContent=formatEuro(totalValue);const _dtc=document.getElementById('dashTotalCount');if(_dtc)_dtc.textContent=dataSource.length.toLocaleString('fr')+' réf.';}
    document.getElementById('dashDeadStock').textContent=formatEuro(dormantStock);document.getElementById('dashDeadPct').textContent=pct(dormantStock,totalValue);
    document.getElementById('dashSurstock').textContent=formatEuro(activeSurstock);document.getElementById('dashSurstockPct').textContent=pct(activeSurstock,totalValue);
    document.getElementById('dashCapalin').textContent=formatEuro(capalinOverflow);document.getElementById('dashCapalinCount').textContent=capalinCount+' art.';
    const sr=serviceTotal>0?((serviceOk/serviceTotal)*100).toFixed(1):0;document.getElementById('dashServiceRate').textContent=sr+'%';document.getElementById('dashServiceDetail').textContent=`${serviceOk}/${serviceTotal} F+M en stock`;
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
      const colisContainer=document.getElementById('colisDetail');
      const sorted=[...lstColis].sort((a,b)=>(a.i2>0?1:0)-(b.i2>0?1:0)||b.sv-a.sv).slice(0,50);
      if(colisContainer&&sorted.length>0){
        const rows=sorted.map(i=>{
          const actionLbl=i.i2===0?'<span class="text-cyan-700 font-bold">📦 Mettre en rayon</span>':'<span class="c-caution font-bold">👁️ Vérifier visibilite</span>';
          return `<tr class="border-b hover:s-card/60"><td class="py-2 px-2 text-[11px] font-semibold"><div class="flex items-center gap-0.5"><span class="font-mono t-tertiary text-[10px]">${i.code}</span>${_copyCodeBtn(i.code)}</div><span class="leading-tight" title="${i.lib}">${i.lib}</span></td><td class="py-2 px-2 text-center font-bold text-xs">${i.i1}</td><td class="py-2 px-2 text-right font-extrabold text-xs">${i.i2}</td><td class="py-2 px-2 text-center text-[10px] whitespace-nowrap">${actionLbl}</td></tr>`;
        });
        colisContainer.innerHTML=`<div class="i-info-bg rounded-xl border-t-4" style="border-top-color:var(--c-action)">
          <div class="flex items-center justify-between px-4 py-3">
            <span class="font-bold t-primary flex items-center gap-2">📦→🏪 Colis a stocker <span class="badge bg-c-action t-inverse">${sorted.length}</span></span>
            <span class="cockpit-link i-info-bg t-secondary cursor-pointer" onclick="showCockpitInTable('colisrayon');switchTab('table')">📋 Voir dans Articles</span>
          </div>
          <div class="px-5 pb-5"><p class="text-[11px] t-secondary mb-3">≥5 enleves, 0 preleve — 📦 stock=0 a mettre en rayon · 👁️ stock>0 a rendre visible.</p>
            <div class="list-scroll"><table class="min-w-full text-xs"><thead class="i-info-bg t-secondary sticky top-0"><tr><th class="py-2 px-2">Code / Libelle</th><th class="py-2 px-2 text-center">Colis</th><th class="py-2 px-2 text-right">Stock</th><th class="py-2 px-2 text-center">Action</th></tr></thead><tbody id="actionColisRayon" class="divide-y b-light">${rows.join('')}</tbody></table></div>
          </div>
        </div>`;
      } else if(colisContainer){colisContainer.innerHTML='';}
    })();

    // ★★★ V23/V24.2: RÉSUMÉ EXÉCUTIF ★★★
    if(dataSource===DataStore.finalData){_S._insights.ruptures=lstR.length;_S._insights.dormants=lstD.length;renderInsightsBanner();}
    // ★ SPRINT 1: Briefing ★
    _S._briefingData={lstR,totalCAPerdu,dormantStock,capalinOverflow,sr,hasMulti,caComptoir:_S.canalAgence?.['MAGASIN']?.ca||0};
    renderHealthScore();
    renderTabBadges();

    // ── Bandeau hero Santé + Valeur Stock ──
    {const heroEl=document.getElementById('stockHeroContent');
    if(heroEl){
      // Sparkline CA mensuel
      const _monthlyCA=Array(12).fill(0);
      for(const [code,months] of Object.entries(_S.articleMonthlySales||{})){
        if(DataStore.finalData.some(r=>r.code===code))months.forEach((v,i)=>{_monthlyCA[i]+=v;});
      }
      const _sparklineCA=buildSparklineSVG(_monthlyCA,{color:'rgba(255,255,255,0.7)',width:100,height:24,filled:true});
      // Read health score data from renderHealthScore (already computed)
      const fd=dataSource;const _totalRefs=fd.length;
      const _rup=fd.filter(r=>r.stockActuel<=0&&r.W>=3&&!r.isParent).length;
      const _dorm=fd.filter(r=>r.ageJours>=(_S.DORMANT_DAYS||180)&&r.stockActuel>0&&r.W<=1).length;
      const _sansMin=fd.filter(r=>r.ancienMin===0&&r.W>=3).length;
      const _surst=fd.filter(r=>r.ancienMax>0&&r.stockActuel>r.ancienMax*2).length;
      const _actives=fd.filter(r=>r.W>=1&&!r.isParent);
      const _activesOk=_actives.filter(r=>r.stockActuel>0).length;
      const _txSvc=_actives.length>0?Math.round(_activesOk/_actives.length*100):100;
      const _rupPct=_totalRefs>0?_rup/_totalRefs*100:0;
      const _dormPct=_totalRefs>0?_dorm/_totalRefs*100:0;
      const _sansMinPct=_actives.length>0?_sansMin/_actives.length*100:0;
      const _surstPct=_totalRefs>0?_surst/_totalRefs*100:0;
      const _score=Math.max(0,Math.min(100,Math.round(_txSvc*0.4+Math.max(0,100-_rupPct*10)*0.25+Math.max(0,100-_dormPct*3)*0.15+Math.max(0,100-_sansMinPct*5)*0.1+Math.max(0,100-_surstPct*5)*0.1)));
      const _col=_score>=75?'var(--c-ok)':_score>=50?'var(--c-caution)':'var(--c-danger)';
      const _lbl=_score>=75?'Bonne santé':_score>=50?'À surveiller':'Critique';
      const _ico=_score>=75?'💚':_score>=50?'🟡':'🔴';
      const _dims=[
        {label:'Taux de service',val:_txSvc+'%',ok:_txSvc>=95},
        {label:'Ruptures',val:_rup,ok:_rup<=5},
        {label:'Dormants',val:_dorm,ok:_dorm<=_totalRefs*0.05},
        {label:'Sans MIN',val:_sansMin,ok:_sansMin<=3},
        {label:'Surstock',val:_surst,ok:_surst<=_totalRefs*0.03},
      ];
      const _heroPills = [
        { label: `Taux service : ${sr}%`,    cls: parseFloat(sr) >= 95 ? 'ok' : parseFloat(sr) >= 85 ? 'caution' : 'danger', fn: `showCockpitInTable('ruptures')` },
        { label: `Ruptures : ${lstR.length}`, cls: lstR.length === 0 ? 'ok' : 'danger',                                        fn: `showCockpitInTable('ruptures');switchTab('table')` },
        { label: `Dormants : ${lstD.length}`, cls: lstD.length > 50 ? 'caution' : 'muted',                                     fn: `showCockpitInTable('dormants');switchTab('table')` },
        { label: `Sans MIN : ${lstA.length}`, cls: 'muted',                                                                     fn: `showCockpitInTable('anomalies');switchTab('table')` },
        { label: `Surstock : ${lstS.length}`, cls: 'muted',                                                                     fn: `showCockpitInTable('saso');switchTab('table')` },
      ].map(p => `<button class="hero-pill hero-pill--${p.cls}" onclick="${p.fn}">${p.label}</button>`).join('');
      heroEl.innerHTML = `
<div class="hero-layout">
  <div class="hero-score-block">
    <div class="hero-score-num" style="color:${_col}">${_score}</div>
    <div class="hero-score-bar">
      <div class="hero-score-fill" style="width:${_score}%;background:${_col}"></div>
    </div>
    <div class="hero-score-label">Santé stock</div>
  </div>
  <div class="hero-divider"></div>
  <div class="hero-value-block">
    <div class="hero-value-label">Valeur stock</div>
    <div class="hero-value-num kpi-update">${formatEuro(totalValue)}</div>
    <div class="hero-value-sub">
      <span>${DataStore.finalData.length.toLocaleString('fr')} réf.</span>
    </div>
  </div>
  <div class="hero-divider"></div>
  <div class="hero-pills">${_heroPills}</div>
</div>`;
    }}

    // ── Sidebar pills ──
    const _saisonCount=Object.keys(_S.seasonalIndex).length>0?_getSaisonCandidats().length:0;
    _S.cockpitCounts={ruptures:lstR.length,stockneg:lstStockNeg.length,sansemplacement:lstFa.length,anomalies:lstA.length,dormants:lstD.length,fins:lstFi.length,saison:_saisonCount,saso:lstS.length,colis:lstColis.length,rupClients:0};
    {const ruptureArts=dataSource.filter(r=>r.stockActuel<=0&&r.W>=3&&!r.isParent&&!(r.V===0&&r.enleveTotal>0));const _rcSet=new Set();for(const art of ruptureArts){const buyers=_S.articleClients.get(art.code);if(buyers)for(const cc of buyers)_rcSet.add(cc);}_S.cockpitCounts.rupClients=_rcSet.size;}
    _renderStockPills();
    _renderSaisonAnticipe();
    _renderDataScopeBar();
    renderCockpitBriefing();
  }

  function _renderSaisonAnticipe(){
    const el=document.getElementById('saisonAnticipeWidget');
    if(!el)return;
    if(!Object.keys(_S.seasonalIndex).length){el.classList.add('hidden');return;}
    const alertes=_getAlerteSaisonAnticipee();
    if(!alertes.length){el.classList.add('hidden');return;}
    el.classList.remove('hidden');
    const nomsMois=['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];
    const nbSocle=alertes.filter(a=>a.isSocle).length;
    const totalVa=alertes.reduce((s,a)=>s+a.vaEuro,0);
    const moisPicLabel=nomsMois[alertes[0]?.moisPic??0];
    const nomsMoisCourt=['janv','fév','mars','avr','mai','juin','juil','août','sept','oct','nov','déc'];
    const rows=alertes.slice(0,30).map(r=>{
      const coeffPct='+'+Math.round((r.coeffPic-1)*100)+'%';
      const socleBadge='';
      // Contexte factuel : volume réel du mois pic
      const moisLabel=nomsMoisCourt[r.moisPic]||'';
      const qteRef=r.qteArticlePic>0?r.qteArticlePic:r.qteFamillePic;
      const isFamFallback=r.qteArticlePic<=0;
      const lowConfidence=qteRef>0&&qteRef<10;
      let ctxLabel='';
      if(r.qteArticlePic>0)ctxLabel=r.qteArticlePic+' vendus en '+moisLabel;
      else if(r.qteFamillePic>0)ctxLabel=r.qteFamillePic+' fam. en '+moisLabel;
      const ctxStyle=lowConfidence?'color:#f59e0b;font-style:italic':'';
      const ctxTitle=lowConfidence?'Volume faible — index saisonnier peu fiable':'Volume réel constaté sur l\'historique local';
      const ctxHtml=ctxLabel?'<span class="text-[9px]" style="'+ctxStyle+'" title="'+ctxTitle+'"> · '+ctxLabel+'</span>':'';
      return`<tr class="border-b b-light hover:s-hover text-[11px] cursor-pointer" onclick="if(window.openArticlePanel)window.openArticlePanel('${r.code}','planRayon')">
        <td class="py-1.5 px-2 font-mono t-disabled">${escapeHtml(r.code)}</td>
        <td class="py-1.5 px-2 t-primary truncate" style="max-width:220px" title="${escapeHtml(r.libelle)}">${escapeHtml(r.libelle)} ${socleBadge}</td>
        <td class="py-1.5 px-2 text-center">${r.stockActuel}</td>
        <td class="py-1.5 px-2 text-center font-bold c-caution">${r.saisonMin} <span class="text-[9px] font-normal t-disabled">(${coeffPct})</span>${ctxHtml}</td>
        <td class="py-1.5 px-2 text-center font-bold" style="color:#f97316">+${r.qteCde}</td>
        <td class="py-1.5 px-2 text-right font-bold t-primary">${r.vaEuro>0?formatEuro(r.vaEuro):'—'}</td>
      </tr>`;
    }).join('');
    el.innerHTML=`<div class="s-card rounded-xl p-4 mb-4" style="border-left:4px solid #f97316">
      <div class="flex items-center justify-between mb-2 flex-wrap gap-2">
        <h3 class="text-[12px] font-bold" style="color:#f97316">⏰ Alerte anticipée — pic ${moisPicLabel}</h3>
        <span class="text-[10px] t-secondary">${alertes.length} articles · ${formatEuro(totalVa)} à commander</span>
      </div>
      <p class="text-[10px] t-disabled mb-3">Stock insuffisant pour le pic saisonnier dans 30-60 jours. Index basé sur l'historique local — volumes réels affichés pour chaque article.</p>
      <div class="overflow-x-auto" style="max-height:350px;overflow-y:auto">
        <table class="w-full text-[11px]">
          <thead class="sticky top-0" style="background:var(--color-bg-primary,#0f172a);z-index:1">
            <tr class="text-[10px] t-secondary border-b b-light">
              <th class="py-1.5 px-2 text-left">Code</th>
              <th class="py-1.5 px-2 text-left">Libellé</th>
              <th class="py-1.5 px-2 text-center">Stock</th>
              <th class="py-1.5 px-2 text-center">Seuil pic</th>
              <th class="py-1.5 px-2 text-center">À cder</th>
              <th class="py-1.5 px-2 text-right">Valeur</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      ${alertes.length>30?'<p class="text-[9px] t-disabled mt-2 text-center">'+alertes.length+' articles au total — top 30 affichés</p>':''}
    </div>`;
  }

  function _renderDataScopeBar(){
    const el=document.getElementById('dataScopeGlobal')||document.getElementById('dataScopeBar');
    if(!el)return;
    const fmtD=d=>d instanceof Date?d.toLocaleDateString('fr-FR',{day:'2-digit',month:'short',year:'numeric'}):'?';
    const pills=[];
    // Consommé
    const cMin=_S.consommePeriodMinFull||_S.consommePeriodMin;
    const cMax=_S.consommePeriodMaxFull||_S.consommePeriodMax;
    if(cMin&&cMax){
      const stores=_S.storesIntersection?.size||Object.keys(_S.ventesParAgence||{}).length||0;
      const clientsMAG=_S.ventesLocalMagPeriode?.size||0;
      const clientsHM=_S.ventesLocalHorsMag?.size||0;
      const allClients=new Set([...(_S.ventesLocalMagPeriode?.keys()||[]),...(_S.ventesLocalHorsMag?.keys()||[])]);
      const totalClients=allClients.size||clientsMAG;
      const nbUniv=new Set(Object.values(_S.articleUnivers||{})).size;
      const univLabel=nbUniv>0?` · ${nbUniv} univers`:'';
      pills.push(`<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded" style="background:rgba(59,130,246,0.15);border:1px solid rgba(59,130,246,0.3)"><span style="color:#60a5fa">📦 Consommé</span> <span class="t-disabled">${fmtD(cMin)} → ${fmtD(cMax)}</span> <span class="t-disabled">· ${stores} agence${stores>1?'s':''}${univLabel} · ${totalClients} clients${clientsHM>0?' ('+clientsMAG+' comptoir)':''}</span></span>`);
    }
    // Territoire
    if(_S.territoireReady&&_S.territoireLines?.length){
      let tMin=null,tMax=null;
      for(const l of _S.territoireLines){if(l.dateExp){if(!tMin||l.dateExp<tMin)tMin=l.dateExp;if(!tMax||l.dateExp>tMax)tMax=l.dateExp;}}
      const nbClients=new Set(_S.territoireLines.map(l=>l.clientCode).filter(Boolean)).size;
      if(tMin&&tMax)pills.push(`<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded" style="background:rgba(34,197,94,0.15);border:1px solid rgba(34,197,94,0.3)"><span style="color:#4ade80">🌍 Territoire</span> <span class="t-disabled">${fmtD(new Date(tMin))} → ${fmtD(new Date(tMax))}</span> <span class="t-disabled">· ${nbClients} clients</span></span>`);
    }
    // Chalandise
    if(_S.chalandiseReady&&_S.chalandiseData?.size){
      const total=_S.chalandiseData.size;
      const nbMetiers=new Set([..._S.chalandiseData.values()].map(i=>i.metier).filter(m=>m&&m.length>2)).size;
      // Taux de couverture vs consommé
      let matchCount=0;
      if(_S.ventesLocalMagPeriode?.size){
        for(const cc of _S.ventesLocalMagPeriode.keys()){if(_S.chalandiseData.has(cc))matchCount++;}
      }
      const pctMatch=_S.ventesLocalMagPeriode?.size>0?Math.round(matchCount/_S.ventesLocalMagPeriode.size*100):0;
      const matchColor=pctMatch>=70?'#4ade80':pctMatch>=30?'#fbbf24':'#f87171';
      pills.push(`<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded" style="background:rgba(251,191,36,0.15);border:1px solid rgba(251,191,36,0.3)"><span style="color:#fbbf24">📋 Chalandise</span> <span class="t-disabled">${total.toLocaleString('fr')} clients · ${nbMetiers} métiers</span> <span style="color:${matchColor}" title="${matchCount} clients PDV retrouvés dans la chalandise sur ${_S.ventesLocalMagPeriode?.size||0}">· couverture ${pctMatch}%</span></span>`);
    }
    if(!pills.length){el.innerHTML='';return;}
    pills.push(`<a href="conv.html" target="_blank" class="inline-flex items-center gap-1 px-2 py-0.5 rounded no-underline" style="background:rgba(139,92,246,0.15);border:1px solid rgba(139,92,246,0.3);cursor:pointer"><span style="color:#a78bfa">🔄 Convertisseur XLSX → CSV</span></a>`);
    el.innerHTML=`<div class="flex flex-wrap gap-2 px-4 py-2 text-[10px]">${pills.join('')}</div>`;
  }

  function _renderStockPills(){
    const el=document.getElementById('stockPillsContainer');
    if(!el)return;
    const c=_S.cockpitCounts||{};
    const pills=[
      {icon:'🔴',label:'Ruptures',count:c.ruptures||0,color:'#dc2626',cockpit:'ruptures'},
      {icon:'📉',label:'Stock negatif',count:c.stockneg||0,color:'#4f46e5',cockpit:'stockneg'},
      {icon:'📍',label:'Sans emplacement',count:c.sansemplacement||0,color:'#4f46e5',cockpit:'sansemplacement'},
      {icon:'⚠️',label:'Anomalies',count:c.anomalies||0,color:'#ea580c',cockpit:'anomalies'},
      {icon:'💤',label:'Dormants',count:c.dormants||0,color:'#ea580c',cockpit:'dormants'},
      {icon:'📁',label:'Fins de serie',count:c.fins||0,color:'#6b7280',cockpit:'fins'},
      {icon:'🌸',label:'Saisonnalite',count:c.saison||0,color:'#d97706',cockpit:null,onclick:'document.getElementById("saisonAnticipeWidget")?.scrollIntoView({behavior:"smooth"})'},
      {icon:'📦',label:'Excedent ERP',count:c.saso||0,color:'#7c3aed',cockpit:'saso'},
      {icon:'📦→🏪',label:'Colis a stocker',count:c.colis||0,color:'#0891b2',cockpit:'colisrayon'},
      {icon:'👥',label:'Clients impactes',count:c.rupClients||0,color:'#dc2626',cockpit:null},
    ];
    el.innerHTML=pills.map(p=>{
      const grayed=p.count===0?'opacity-40':'';
      const onclick=p.cockpit?`onclick="showCockpitInTable('${p.cockpit}');switchTab('table')"`:p.onclick?`onclick="${p.onclick}"`:'';
      return `<div class="flex items-center justify-between px-2 py-1.5 rounded-lg cursor-pointer hover:s-hover transition-colors ${grayed}" ${onclick}>
        <span class="text-[10px] flex items-center gap-1.5"><span>${p.icon}</span><span class="font-semibold" style="color:${p.color}">${p.label}</span></span>
        <span class="text-[11px] font-extrabold" style="color:${p.color}">${p.count}</span>
      </div>`;
    }).join('');
  }


  function _renderActiveFilterBadges(){
    const container=document.getElementById('activeFilterBadges');
    if(!container)return;
    const search=(document.getElementById('searchInput')?.value||'').trim();
    const fam=document.getElementById('filterFamille')?.value||'';
    const sFam=document.getElementById('filterSousFamille')?.value||'';
    const stat=document.getElementById('filterStatut')?.value||'';
    const abc=document.getElementById('filterABC')?.value||'';
    const fmr=document.getElementById('filterFMR')?.value||'';
    const age=document.getElementById('filterAge')?.value||'';
    const cockpit=document.getElementById('filterCockpit')?.value||'';
    const cockpitLabel=document.getElementById('activeCockpitLabel')?.textContent||'';
    const emp=document.getElementById('filterEmplacement')?.value||'';
    const univers=document.getElementById('filterMetier')?.value||'';
    const verdict=document.getElementById('filterVerdict')?.value||'';
    const key=[search,fam,sFam,stat,abc,fmr,age,cockpit,cockpitLabel,emp,univers,verdict].join('\x1f');
    if(container._lastKey===key)return;
    container._lastKey=key;
    const badges=[];
    if(search)badges.push({label:`"${search}"`,clear:()=>{document.getElementById('searchInput').value='';onFilterChange();}});
    if(fam)badges.push({label:`Famille : ${famLabel?famLabel(fam):fam}`,clear:()=>{document.getElementById('filterFamille').value='';const sf=document.getElementById('filterSousFamille');if(sf)sf.value='';onFilterChange();}});
    if(sFam)badges.push({label:`S/Fam : ${sFam}`,clear:()=>{document.getElementById('filterSousFamille').value='';onFilterChange();}});
    if(stat)badges.push({label:`Statut : ${stat}`,clear:()=>{document.getElementById('filterStatut').value='';onFilterChange();}});
    if(abc)badges.push({label:`ABC : ${abc}`,clear:()=>{document.getElementById('filterABC').value='';onFilterChange();}});
    if(fmr)badges.push({label:`FMR : ${fmr}`,clear:()=>{document.getElementById('filterFMR').value='';onFilterChange();}});
    if(age&&AGE_BRACKETS[age])badges.push({label:`Âge : ${AGE_BRACKETS[age].label}`,clear:()=>{document.getElementById('filterAge').value='';updateActiveAgeIndicator();onFilterChange();}});
    if(cockpit)badges.push({label:cockpitLabel||cockpit,clear:()=>clearCockpitFilter()});
    if(emp)badges.push({label:`Empl : ${emp}`,clear:()=>{document.getElementById('filterEmplacement').value='';onFilterChange();}});
    if(univers)badges.push({label:`Univers : ${univers}`,clear:()=>{document.getElementById('filterMetier').value='';onFilterChange();}});
    if(verdict){const vLabels={socle:'🟢 Socle',implanter:'🔴 Trou critique',challenger:'🟡 Challenger',surveiller:'🔵 Surveiller'};badges.push({label:`Verdict : ${vLabels[verdict]||verdict}`,clear:()=>{document.getElementById('filterVerdict').value='';onFilterChange();}});}
    if(!badges.length){container.innerHTML='';container.style.display='none';container._clearFns=[];return;}
    container.style.display='flex';
    container.innerHTML=badges.map((b,i)=>
      `<span style="display:inline-flex;align-items:center;gap:4px;font-size:10px;padding:2px 8px;border-radius:20px;background:var(--i-info-bg);color:var(--c-action);border:1px solid var(--p-blue-300)">${escapeHtml(b.label)}<button onclick="_clearBadge(${i})" style="background:none;border:none;cursor:pointer;color:var(--c-action);font-size:12px;line-height:1;padding:0">×</button></span>`
    ).join('')+(badges.length>1?`<button onclick="resetFilters()" style="font-size:10px;padding:2px 8px;border-radius:20px;border:1px solid var(--b-default);background:none;color:var(--t-tertiary);cursor:pointer">Tout effacer</button>`:'');
    container._clearFns=badges.map(b=>b.clear);
  }
  window._clearBadge=function(i){const container=document.getElementById('activeFilterBadges');if(container?._clearFns?.[i])container._clearFns[i]();};

  // Cache filtered CA total — recalcul uniquement quand la liste filtree change
  let _lastFilteredCARef=null;
  let _lastFilteredCALen=-1;
  let _lastFilteredCATotal=0;
  function _getFilteredCATotal(){
    const arr=DataStore.filteredData||[];
    if(arr===_lastFilteredCARef&&arr.length===_lastFilteredCALen)return _lastFilteredCATotal;
    let sum=0;
    for(let i=0;i<arr.length;i++)sum+=(arr[i].caAnnuel||0);
    _lastFilteredCARef=arr;_lastFilteredCALen=arr.length;_lastFilteredCATotal=sum;
    return sum;
  }

  // ★ TABLEAU
  function renderTable(pageOnly){
    if(!_S._hasStock){const el=document.getElementById('tabTable');if(el&&!pageOnly)el.innerHTML=_renderNoStockPlaceholder('Articles');return;}
    if(!pageOnly){
      _S.filteredData=getFilteredData(); // producteur — _S direct
      sortRowsInPlace(DataStore.filteredData,_S.sortCol,_S.sortAsc);
      updateActiveAgeIndicator();
    }
    const tp=Math.max(1,Math.ceil(DataStore.filteredData.length/PAGE_SIZE));if(_S.currentPage>=tp)_S.currentPage=tp-1;const start=_S.currentPage*PAGE_SIZE,pd=DataStore.filteredData.slice(start,start+PAGE_SIZE);
    document.getElementById('resultCount').textContent=DataStore.filteredData.length.toLocaleString('fr')+' article'+(DataStore.filteredData.length>1?'s':'');const _rStart=start+1,_rEnd=Math.min(start+PAGE_SIZE,DataStore.filteredData.length);const _pageInfoEl=document.getElementById('pageInfo');if(_pageInfoEl){_pageInfoEl.innerHTML=`Articles ${_rStart}–${_rEnd} sur ${DataStore.filteredData.length.toLocaleString('fr')}&nbsp;·&nbsp; Page <input type="number" min="1" max="${tp}" value="${_S.currentPage+1}" style="width:36px;text-align:center;font-size:11px;padding:1px 4px;border:1px solid var(--b-default);border-radius:4px;background:var(--s-card);color:var(--t-primary)" onchange="_jumpToPage(this.value)" onclick="event.stopPropagation()"> / ${tp}`;}document.getElementById('btnPrev').disabled=_S.currentPage<=0;document.getElementById('btnNext').disabled=_S.currentPage>=tp-1;
    _renderActiveFilterBadges();
    const _totalCA=_getFilteredCATotal();const _totalCAEl=document.getElementById('filteredCATotal');if(_totalCAEl){if(_totalCA>0){const _caStr=_totalCA>=1000?`${(_totalCA/1000).toFixed(0)}k€`:`${Math.round(_totalCA)}€`;_totalCAEl.textContent=`CA filtré : ${_caStr}`;_totalCAEl.classList.remove('hidden');}else{_totalCAEl.classList.add('hidden');}}
    const p=[];
    for(const r of pd){
      const isUncalib=r.nouveauMin===0&&r.nouveauMax===0;
      const isDormant=r.W===0&&r.stockActuel>0;
      const bg=isDormant?'':isUncalib?'s-card-alt':'';
      const sc=(() => { if(isUncalib)return 't-disabled'; if(r.stockActuel<=0)return 'c-danger font-bold'; if(r.nouveauMax>0&&r.stockActuel>r.nouveauMax)return 'c-caution font-bold'; return ''; })();
      const br=getAgeBracket(r.ageJours);
      const caEst=r.caAnnuel>0?(r.caAnnuel>=1000?`${(r.caAnnuel/1000).toFixed(1)}k€`:`${r.caAnnuel}€`):'—';
      const ancStr=(r.ancienMin===0&&r.ancienMax===0)?`<span class="t-disabled" title="Pas de MIN/MAX dans l'ERP">—</span>`:(r.ancienMin>0&&r.ancienMax===0)?`<span class="c-caution" title="MAX absent — anomalie ERP">${r.ancienMin}/0</span>`:`${r.ancienMin}/${r.ancienMax}`;
    p.push(`<tr class="border-b hover:i-info-bg ${bg} cursor-pointer"${isDormant?' style="background:rgba(239,68,68,0.25)"':isUncalib?' style="opacity:0.48"':''}
      onmouseup="(function(e){if(window.getSelection&&window.getSelection().toString().length>0)return;if(e.target.closest('button,a,input,select'))return;openArticlePanel('${r.code}','table');})(event)">
      <td class="px-2 py-2 font-mono text-xs whitespace-nowrap sticky left-0 bg-inherit z-[5]">${r.code}${_copyCodeBtn(r.code)}${r.isNouveaute?' ✨':''}</td>
      <td class="px-2 py-2 text-xs font-semibold max-w-[220px] sticky left-[80px] bg-inherit z-[5]"><div class="truncate" title="${escapeHtml(r.libelle)}">${escapeHtml(r.libelle)}</div></td>
      <td class="px-2 py-2 text-xs t-tertiary truncate max-w-[100px]" title="${escapeHtml(famLib(r.famille||''))}">${r.famille?escapeHtml(famLib(r.famille)):'—'}</td>
      <td class="px-2 py-2 text-xs t-disabled truncate max-w-[80px]" data-col="emplacement" title="${escapeHtml(r.emplacement||'')}">${r.emplacement?escapeHtml(r.emplacement):'—'}</td>
      <td class="px-2 py-2 text-center font-bold text-xs">${r.V}</td>
      <td class="px-2 py-2 text-center text-xs font-bold">${caEst}</td>
      <td class="px-2 py-2 text-center text-xs">${r.enleveTotal||0}</td>
      <td class="px-2 py-2 text-center font-bold text-xs">${r.W}</td>
      <td class="px-2 py-2 text-center ${sc} text-xs">${r.stockActuel}</td>
      <td class="px-2 py-2 text-center text-xs">${formatCouv(r.couvertureJours)}</td>
      <td class="px-2 py-2 text-center text-xs whitespace-nowrap"><span class="age-dot ${AGE_BRACKETS[br].dotClass}"></span>${getAgeLabel(r.ageJours)}</td>
      <td class="px-2 py-2 text-center text-xs t-disabled">${ancStr}</td>
      <td class="px-2 py-2 text-center font-bold text-xs">${r.nouveauMin}</td>
      <td class="px-2 py-2 text-center font-bold text-xs">${r.nouveauMax}</td>
      ${_S.chalandiseReady&&(r.caHorsMagasin||0)>=100&&(r.nbClientsWeb||0)>=2?`<td class="px-2 py-2 text-center text-[10px] text-violet-600 font-bold">${r.nbClientsWeb}c · ${r.caHorsMagasin>=1000?(r.caHorsMagasin/1000).toFixed(1)+'k€':Math.round(r.caHorsMagasin)+'€'}</td>`:`<td class="px-2 py-2 text-center t-disabled text-[10px]">—</td>`}
    </tr>`);}
    document.getElementById('tableBody').innerHTML=p.join('')||`<tr><td colspan="14" class="text-center py-8 t-tertiary">Aucun.</td></tr>`;
    if(document.getElementById('thCanalWeb')?.classList.contains('hidden')){document.querySelectorAll('#tableBody tr td:nth-last-child(1)').forEach(td=>td.classList.add('hidden'));}
    _applyColVisibility();
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
    const globalFilters=[document.getElementById('filterFamille')?.value,document.getElementById('filterSousFamille')?.value,document.getElementById('filterEmplacement')?.value,document.getElementById('filterStatut')?.value,document.getElementById('filterABC')?.value,document.getElementById('filterFMR')?.value,document.getElementById('filterVerdict')?.value].filter(Boolean);
    const isFiltered=globalFilters.length>0;
    const badge=document.getElementById('radarFilterBadge');
    if(badge){if(isFiltered){badge.classList.remove('hidden');badge.textContent=`Périmètre filtré : ${globalFilters.join(' + ')} — ${radarData.length} articles`;}else badge.classList.add('hidden');}
    // Count badge: classified vs total
    const _allFd=DataStore.finalData;const _nbClassified=_allFd.filter(r=>r.abcClass&&r.fmrClass).length;
    const _countBadge=document.getElementById('abcCountBadge');
    if(_countBadge){if(_nbClassified<_allFd.length)_countBadge.textContent=`${_nbClassified.toLocaleString('fr-FR')} / ${_allFd.length.toLocaleString('fr-FR')} articles classés`;else _countBadge.textContent='';}
    _renderGhostArticles();
    const CELL_BG={AF:'linear-gradient(135deg,#14532d,#166534)',AM:'linear-gradient(135deg,#166534,#15803d)',AR:'linear-gradient(135deg,#1a5c2a,#3d6b2c)',BF:'linear-gradient(135deg,#1e3a5f,#1e3a8a)',BM:'linear-gradient(135deg,#1e3a8a,#1d4ed8)',BR:'linear-gradient(135deg,#3b3000,#713f12)',CF:'linear-gradient(135deg,#3b0a0a,#7f1d1d)',CM:'linear-gradient(135deg,#7f1d1d,#991b1b)',CR:'linear-gradient(135deg,#78350f,#92400e)'};
    const LABELS={AF:'🌟 Pépites',AM:'👁️ Piliers',AR:'💰 Projets',BF:'⚙️ Moteur',BM:'➡️ Standard',BR:'❓ Poids Faible',CF:'🔁 Trafic',CM:'📉 Poussière',CR:'❌ Boulet'};
    const RECOS={
      AF:'🏆 Capitaines — Zéro rupture. Stock sécurité max, commande auto, emplacement premium. Si AF mais pas Capitaine → problème de classif.',
      AM:'🏆 Capitaines à cycle long ou 🎯 Lien Fort — Stock tampon faible, supply chain parfaite. Gestion à flux tendu maîtrisé.',
      AR:'🎯 Spécialistes forte valeur — Zéro stock physique, 100% commande spéciale. Ta force = ta relation fournisseur.',
      BF:'🏆 Capitaines petit prix + 📦 Bons Soldats — Automatisation Kanban (2 bacs). Objectif : le moins de temps possible à gérer.',
      BM:'📦 Bons Soldats + 🟡 À Surveiller — Réappro standard. Garder un œil pour ne pas glisser vers BR ou CM.',
      BR:'🟡 Déclinant qui s\'ignore — Stock min 1 unité, pas de réappro auto. En revue pour sortie potentielle.',
      CF:'🏆 Incontournable comptoir — Ça doit être là, toujours, en quantité. Son absence crée plus de frustration que son stock ne coûte.',
      CM:'Zone de simplification — Peut-on remplacer 3 CM par 1 BM ? Vendre en plus grande quantité pour passer en CF ?',
      CR:'🔴 Poids Mort — Tolérance zéro, on sort. SAUF Ancre Métier : appât pour le gros poisson, garder à 1 unité.'
    };
    // Matrix table
    let html='<table class="w-full border-collapse" style="max-width:720px;margin:0 auto"><thead><tr>';
    html+='<th style="width:64px"></th>';
    html+='<th><div style="padding:10px 12px;text-align:center;font-weight:800;font-size:14px;color:#4ade80">F<br><span style="font-size:10px;font-weight:400;color:rgba(255,255,255,0.4)">Fréquent ≥12</span></div></th>';
    html+='<th><div style="padding:10px 12px;text-align:center;font-weight:800;font-size:14px;color:#93c5fd">M<br><span style="font-size:10px;font-weight:400;color:rgba(255,255,255,0.4)">Moyen 4-11</span></div></th>';
    html+='<th><div style="padding:10px 12px;text-align:center;font-weight:800;font-size:14px;color:#fbbf24">R<br><span style="font-size:10px;font-weight:400;color:rgba(255,255,255,0.4)">Rare ≤3</span></div></th>';
    html+='</tr></thead><tbody>';
    const rowLabels={A:'<div class="font-extrabold text-xl text-indigo-900">A</div><div class="text-[9px] t-tertiary font-semibold">Top 80%</div>',B:'<div class="font-extrabold text-xl text-indigo-600">B</div><div class="text-[9px] t-tertiary font-semibold">15%</div>',C:'<div class="font-extrabold text-xl text-indigo-400">C</div><div class="text-[9px] t-tertiary font-semibold">5%</div>'};
    for(const abc of['A','B','C']){
      html+=`<tr><td class="p-3 text-center">${rowLabels[abc]}</td>`;
      for(const fmr of['F','M','R']){
        const key=abc+fmr,d=mx[key]||{count:0,stockVal:0,pctTotal:0};
        const bg=CELL_BG[key];
        html+=`<td class="p-2"><div class="abc-cell${abc==='A'?' abc-top':''}" style="background:${bg};color:#fff" onclick="filterByAbcFmr('${abc}','${fmr}')">
          <em class="info-tip" data-tip="${key} — ${RECOS[key]}" style="position:absolute;top:6px;right:6px;background:rgba(255,255,255,0.12);color:rgba(255,255,255,0.5);margin:0;width:14px;height:14px;font-size:9px">ℹ</em>
          <div style="font-family:var(--ff-display,'DM Sans','Inter',sans-serif);font-size:var(--fs-2xl);font-weight:800;line-height:1;letter-spacing:-0.02em">${d.count}</div>
          <div style="font-size:var(--fs-xs);opacity:0.6;margin-top:3px">articles</div>
          <div style="font-family:var(--ff-display,'DM Sans','Inter',sans-serif);font-size:var(--fs-sm);font-weight:700;margin-top:var(--sp-2)">${formatEuro(d.stockVal)}</div>
          <div style="font-size:var(--fs-2xs);opacity:0.5;margin-top:2px">${d.pctTotal.toFixed(1)}% du stock</div>
          <div style="font-size:var(--fs-2xs);font-weight:700;letter-spacing:0.08em;text-transform:uppercase;opacity:0.5;margin-top:var(--sp-2)">${key}</div>
          ${d.count>0?`<button onclick="event.stopPropagation();openDiagnosticCell('${abc}','${fmr}')" style="margin-top:6px;font-size:9px;font-weight:700;padding:2px 8px;border-radius:4px;background:rgba(0,0,0,0.25);color:rgba(255,255,255,0.6);border:1px solid rgba(255,255,255,0.12);cursor:pointer;transition:background .15s" onmouseover="this.style.background='rgba(0,0,0,0.4)'" onmouseout="this.style.background='rgba(0,0,0,0.25)'">🔍 Diag.</button>`:''}
        </div></td>`;
      }
      html+='</tr>';
    }
    html+='</tbody></table>';
    html+='<p class="text-center text-[10px] t-disabled mt-3">Cliquer sur une case → filtre l\'onglet Articles · Survoler → recommandation</p>';
    const mc=document.getElementById('abcMatrixContainer');if(mc)mc.innerHTML=html;
    // Attractivité par Famille (migrée depuis Mon Stock)
    const atEl=document.getElementById('dashAttractTable');if(atEl){const va=_S.ventesAnalysis;const totalBL2=va.totalBL||1;const p2=[];Object.entries(va.attractivite).sort((a,b)=>b[1]-a[1]).forEach(([fam,count])=>{const rate=((count/totalBL2)*100).toFixed(1);const barW=Math.min(parseFloat(rate),100);p2.push(`<tr class="border-b hover:i-danger-bg"><td class="py-2 px-3 text-[11px] font-semibold truncate max-w-[200px]" title="${escapeHtml(fam)}">${escapeHtml(fam)}</td><td class="py-2 px-3 text-center t-secondary text-xs">${count.toLocaleString('fr')}</td><td class="py-2 px-3 text-right"><div class="flex items-center gap-1 justify-end"><div class="w-16 s-hover rounded-full h-1.5"><div class="perf-bar bg-c-danger rounded-full" style="width:${barW}%"></div></div><span class="c-danger font-bold text-[10px] min-w-[35px] text-right">${rate}%</span></div></td></tr>`);});atEl.innerHTML=p2.join('')||'<tr><td colspan="3" class="text-center py-4 t-disabled text-xs">Aucune donnée famille</td></tr>';}
  }

  // ── Vue "Clients PDV" (V4) ─────────────────────────────────────────

  async function renderCurrentTab(){
    const activePill=document.querySelector('.supertab-pill.active[data-subtab]');
    const activeBtn=document.querySelector('.tab-btn.active');
    const id=(activePill?.dataset.subtab)||(activeBtn?activeBtn.getAttribute('data-tab'):'table');
    switch(id){
      case 'table':
        renderTable(true);
        return;
      case 'plan':{
        const _ts0=performance.now();
        renderPlanRayon();
        console.log('[PERF plan]',(performance.now()-_ts0|0)+'ms');
        break;}
      case 'arbitrage':{
        const _ts0=performance.now();
        renderDashboardAndCockpit();
        renderArbitrageRayonBlock();
        renderABCTab();
        renderHealthScore();
        renderTabBadges();
        console.log('[PERF arbitrage]',(performance.now()-_ts0|0)+'ms');
        break;}
      case 'stock':{ // compat — redirige vers plan
        renderPlanRayon();
        break;}
      case 'commerce':
        window.renderCommerceTab && window.renderCommerceTab();
        break;
      case 'omni':
        renderOmniTab();
        break;
      case 'clients':
        window._renderPDVTab?.();
        break;
      case 'animation':
        await renderAnimationTab();
        break;
      case 'associations':
        renderAssociationsTab();
        break;
      case 'conformite':
        window.renderConformiteTab?.();
        break;
      case 'duel':
        window.renderDuelTab?.();
        break;
    }
    if (id !== 'conformite') _S._tabRendered[id]=true;
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
  // Chargement catalogue en arrière-plan (marques, familles, désignations)
  if (!_S.lowMemMode) {
    loadCatalogueMarques().catch(e => console.warn('[PRISME] Catalogue non chargé:', e));
  }

  // Baseline saisonnalité 2025 — embarquée dans le repo, aucune donnée client
  fetch('./data/seasonal_index_2025.json')
    .then(r => r.json())
    .then(baseline => {
      _S._seasonalBaseline = baseline;
      // Appliquer immédiatement si pas encore de consommé chargé
      if (!_S.seasonalIndex || !Object.keys(_S.seasonalIndex).length) {
        _S.seasonalIndex = { ...baseline };
      }
    })
    .catch(() => {}); // silencieux si fichier absent ou réseau indisponible

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
    // 0. Catalogue marques chargé en lazy (au premier accès onglet Animation)
    // 1. Toujours restaurer les exclusions (pas de TTL)
    _restoreExclusions();
    // 2. Migration transparente PILOT_PRO → PRISME (si ancienne base présente)
    await _migrateIDB();
    // 3. Tenter la restauration complète depuis IndexedDB
    const restored = await _restoreSessionFromIDB();
    if (restored && DataStore.finalData.length > 0) {
      const _t0c=performance.now();const _pc=[];const _mc=(l)=>{_pc.push({etape:l,ms:Math.round(performance.now()-_t0c)});};
      _mc('IDB restore');
      // ── 0. Gardes-fous AVANT tout code UI — _S.storesIntersection et _S.selectedMyStore ──
      // Doit s'exécuter immédiatement après await _restoreSessionFromIDB(),
      // avant toute référence à _S.selectedMyStore ou _S.storesIntersection dans l'UI.
      if(!_S.storesIntersection.size&&Object.keys(_S.ventesParAgence).length>0&&Object.keys(_S.stockParMagasin).length>0){
        const vKeys=new Set(Object.keys(_S.ventesParAgence)),sKeys=new Set(Object.keys(_S.stockParMagasin));
        _S.storesIntersection=new Set([...vKeys].filter(k=>sKeys.has(k)));
      }
      // Fallback compteurs : si non persistés dans l'ancien cache, recalculer depuis les maps
      if(!_S.storeCountConsomme)_S.storeCountConsomme=Object.keys(_S.ventesParAgence).length;
      if(!_S.storeCountStock)_S.storeCountStock=Object.keys(_S.stockParMagasin).length;
      if(!_S.selectedMyStore&&_S.storesIntersection.size>0){
        const _saved2=localStorage.getItem('prisme_selectedStore');_S.selectedMyStore=(_saved2&&_S.storesIntersection.has(_saved2))?_saved2:[..._S.storesIntersection][0];
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
      buildSqLookup();

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
      document.getElementById('btnTabCommerce').classList.remove('hidden');
      const terrNoC=document.getElementById('terrNoChalandise');
      if(terrNoC)terrNoC.classList.toggle('hidden',_S.chalandiseReady);

      // 4. Période + render (L2485)
      _mc('UI init');
      _S._parsingInProgress=true; // bloque renders parasites pendant la restauration
      updatePeriodAlert();
      buildPeriodFilter();
      computeClientCrossing();
      if (_S.chalandiseReady) _computeChalandiseDistances();
      _mc('crossing + distances');
      // Reconquête : non persistée → recalculer depuis les données IDB restaurées
      if (_S.clientLastOrder.size || _S.livraisonsReady) computeReconquestCohort();
      if (_S.chalandiseReady && DataStore.ventesLocalMagPeriode.size) { resetBenchMetierCache(); computeOpportuniteNette(); computeAnglesMorts(); computeOmniScores(); computeFamillesHors(); }
      buildClientStore();_applyForcageCommercial();_mc('buildClientStore');
      if (_S.ventesLocalHorsMag.size) _rebuildCaByArticleCanal();
      if(_S.ventesLocalMagPeriode.size) _computeClientDominantUnivers();
      // Sync commercial input after data reload
      const _comSb=document.getElementById('terrCommercialSidebar');
      if(_comSb&&_S._selectedCommercial)_comSb.value=_S._selectedCommercial;
      const _tab = _S._clientsActiveTab || 'priorites';
      document.querySelectorAll('.clients-tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === _tab));
      renderSidebarAgenceSelector();
      // Restaurer l'indicateur de la table de forçage
      if (_S.forcageCommercial.size) { const _stF = document.getElementById('statusForcage'); if (_stF) _stF.textContent = '✅'; }
      _S.currentPage=0;
      _S.filteredData = getFilteredData();
      _syncTabAccess();
      _mc('filteredData + sync');
      if(useMulti){
        buildAgenceStore();
      }

      _S._parsingInProgress=false;
      switchTab('stock');_mc('switchTab stock');
      collapseImportZone();
      // Période : respecter le filtre persisté dans IDB (restauré par _restoreSessionFromIDB).
      // Si aucun filtre n'était actif, _S.periodFilterStart/End sont déjà null.
      if(!_S.ventesLocalMag12MG.size&&_S.ventesLocalMagPeriode.size){
        _S.ventesLocalMag12MG=new Map([..._S.ventesLocalMagPeriode].map(([cc,arts])=>[cc,new Map(arts)]));
      }
      invalidateCache('tab','terr');buildPeriodFilter();
      _mc('pré-render');
      renderCanalAgence();renderCurrentTab();
      _mc('renderCurrentTab');

      initColSelector();
      _mc('Prêt');console.table(_pc);
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
window.toggleSecteurDropdown = toggleSecteurDropdown;
window.toggleAllSecteurs = toggleAllSecteurs;
window.onSecteurChange = onSecteurChange;
window.onLivraisonsSelected = async function(input) {
  onFileSelected(input, 'dropLivraisons');
  if (!input.files?.[0]) return;
  // Parser immédiatement seulement si les données sont déjà chargées (recalcul à chaud).
  // Sinon, _postParseMain appellera parseLivraisons après Analyser — évite le double parse.
  if (DataStore.finalData.length === 0) return;
  if (_S._livraisonsLoading || _S.livraisonsReady) return;
  _S._livraisonsLoading = true;
  try { await parseLivraisons(input.files[0]); } finally { _S._livraisonsLoading = false; }
};
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
  try { await parseChalandise(input.files); } finally { _S._chalandiseLoading = false; }
  // parseChalandise() reconstruit _S.chalandiseData → ré-appliquer le forçage ensuite
  _applyForcageCommercial();
  computeClientCrossing();
  buildClientStore();
  renderAll();
  // Recalculer les agrégats clients en tâche de fond
  if (_S._activeClientWorker) { try { _S._activeClientWorker.terminate(); } catch (_) {} _S._activeClientWorker = null; }
  if (DataStore.ventesLocalMagPeriode.size > 0) {
    launchClientWorker().then(() => {
      resetBenchMetierCache(); computeOpportuniteNette(); computeAnglesMorts(); computeOmniScores(); computeFamillesHors();
      buildClientStore(); _applyForcageCommercial();
      renderTabBadges(); updateLaboTiles();
      showToast('📊 Agrégats clients calculés', 'success');
      if (_S.selectedMyStore) _saveSessionToIDB();
    }).catch(err => console.warn('Client worker error:', err));
  }
  if (_S.storesIntersection.size > 1) { computeBenchmark(); }
  _saveSessionToIDB();
};
window.exportTerritoireCSV = exportTerritoireCSV;
window.renderTerritoireTab = renderTerritoireTab;
window._setPDVCanalFilter = _setPDVCanalFilter;
window._setTerrClientsCanalFilter = _setTerrClientsCanalFilter;
window.getKPIsByCanal = getKPIsByCanal;
window.computePhantomArticles = computePhantomArticles;
window.computeReconquestCohort = computeReconquestCohort;
window.computeSPC = computeSPC;
window.computeOpportuniteNette = computeOpportuniteNette;
window.computeAnglesMorts = computeAnglesMorts;
window.computeOmniScores = computeOmniScores;
window.buildClientStore = buildClientStore;
window.buildAgenceStore = buildAgenceStore;
window.computeFamillesHors = computeFamillesHors;
window.exportTourneeCSV = exportTourneeCSV;
window._togglePromoClientRow = _togglePromoClientRow;
window._switchPromoTab = _switchPromoTab;
window._exportCommercialCSV = _exportCommercialCSV;
window._renderSearchResults = _renderSearchResults;
window.computeBenchmark = computeBenchmark;
// (moved to ACTION_REGISTRY: _topPDVExpand, _topPDVCollapse, _topPDVPage, _oppNettePage)
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
window._toggleHorsZone   = function(){window._setClientView(_S._clientView==='horszone'?'tous':'horszone');};
window._toggleDormants   = function(){window._setClientView(_S._clientView==='dormants'?'tous':'dormants');};
window._toggleOmniSegment = function(seg){_S._omniSegmentFilter=(_S._omniSegmentFilter===seg)?'':seg;window._renderSegmentsOmnicanaux?.();};
// (moved to ACTION_REGISTRY: _horsZoneExpand, _horsZoneCollapse, _horsZonePage)
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
window.renderCanalAgence = renderCanalAgence;
window.openCanalDrill = openCanalDrill;
window.openCanalDrillArticles = openCanalDrillArticles;
window.closeCanalDrill = closeCanalDrill;
window.exportCanalDrillCSV = exportCanalDrillCSV;
window.toggleWebColumn = function(){window._setClientView(_S._clientView==='multicanaux'?'tous':'multicanaux');};
window._cematinSearch = _cematinSearch;
window.showSilencieux60 = showSilencieux60;
window.renderMesClients = renderMesClients;
window.renderCurrentTab = renderCurrentTab;
window._refilterFromByMonth = _refilterFromByMonth;
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
window.openCmdPalette = openCmdPalette;
window._cmdExec = _cmdExec;
window._cmdMoveSelection = _cmdMoveSelection;
window._cmdRender = _cmdRender;
window._cmdBuildResults = _cmdBuildResults;
window.closeCmdPalette = () => { const p=document.getElementById('cmdPalette'); if(p)p.classList.add('hidden'); };
window.focusTrap = focusTrap;
window.ToastManager = ToastManager;
window.toggleNavKpis = toggleNavKpis;
window.initDetailsAnimations = initDetailsAnimations;
window.openReporting = openReporting;
window.closeReporting = closeReporting;
window.copyReportText = copyReportText;
window.switchReportTab = switchReportTab;
window.generateReportText = generateReportText;
window.generateRegionReportText = generateRegionReportText;
window.importExclusionsJSON = importExclusionsJSON;
window._doCopyCode = _doCopyCode;
window._copyAllCodesDirect = _copyAllCodesDirect;
window.updatePeriodAlert = updatePeriodAlert;
window.toggleTabPeriodDropdown = toggleTabPeriodDropdown;
window._onPurgeCache = _onPurgeCache;
window._onReloadFiles = _onReloadFiles;
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
window._updateDistQuickBtns = _updateDistQuickBtns;
window._onTerrClientSearch = _onTerrClientSearch;
window._onMetierFilter = _onMetierFilter;
window._navigateToOverviewMetier = _navigateToOverviewMetier;
window._togglePerdu24m = _togglePerdu24m;
window._resetChalandiseFilters = _resetChalandiseFilters;
window.onFileSelected = onFileSelected;
window._updateAnalyserBtn = _updateAnalyserBtn;
window._saveSessionToIDB = _saveSessionToIDB;
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
window.renderHealthScore = renderHealthScore;
window.exportAgenceSnapshot = exportAgenceSnapshot;
window._loadIRAHistory = _loadIRAHistory;
window.renderTabBadges = renderTabBadges;
window.clipERP = clipERP;
window.exportCockpitResume = exportCockpitResume;
window.applyPeriodFilter = applyPeriodFilter;

// ── Export Scan — fichier léger pour mobile ──────────────────────────
window.exportScanData = function() {
  if (!DataStore.finalData.length) { showToast('Aucune donnée à exporter', 'warning'); return; }
  const myStore = _S.selectedMyStore || '';
  const vpm = _S.ventesParAgence || {};
  const otherStores = Object.keys(vpm).filter(s => s !== myStore);
  const _mLabels = {AF:'Pépites',AM:'Surveiller',AR:'Gros paniers',BF:'Confort',BM:'Standard',BR:'Questionner',CF:'Réguliers',CM:'Réduire',CR:'Déréférencer'};
  const articles = DataStore.finalData.map(r => {
    let reseauAgences = 0, totalCA = 0, totalQte = 0, totalVMB = 0;
    const allStores = Object.keys(vpm);
    for (const s of allStores) {
      const v = vpm[s]?.[r.code];
      if (!v || v.countBL <= 0) continue;
      if (s !== myStore) reseauAgences++;
      totalCA += v.sumCA || 0;
      totalQte += (v.sumPrelevee || 0) + (v.sumEnleve || 0);
      totalVMB += v.sumVMB || 0;
    }
    const prixMoyenReseau = totalQte > 0 ? Math.round(totalCA / totalQte * 100) / 100 : null;
    const txMargeReseau = totalQte > 0 ? (totalCA > 0 ? Math.round(totalVMB / totalCA * 10000) / 100 : 0) : null;
    const mKey = (r.abcClass || '') + (r.fmrClass || '');
    return {
      code: r.code, libelle: r.libelle, famille: r.famille, sousFamille: r.sousFamille,
      emplacement: r.emplacement, statut: r.statut, stockActuel: r.stockActuel,
      prixMoyenReseau, txMargeReseau, prixUnitaire: r.prixUnitaire, W: r.W, V: r.V,
      ancienMin: r.ancienMin, ancienMax: r.ancienMax,
      nouveauMin: r.nouveauMin, nouveauMax: r.nouveauMax,
      couvertureJours: r.couvertureJours, abcClass: r.abcClass, fmrClass: r.fmrClass,
      matriceVerdict: _mLabels[mKey] || '',
      _sqClassif: r._sqClassif || '', _sqRole: r._sqRole || '', _sqVerdict: r._sqVerdict || '',
      medMinReseau: r.medMinReseau, medMaxReseau: r.medMaxReseau,
      _vitesseReseau: r._vitesseReseau || false, _fallbackERP: r._fallbackERP || false,
      _reseauAgences: reseauAgences, isParent: r.isParent
    };
  });
  // ── Ajouter les articles squelette "implanter" absents de finalData ──
  const fdCodes = new Set(DataStore.finalData.map(r => r.code));
  const sqData = _S._prSqData || computeSquelette();
  if (sqData?.directions) {
    for (const d of sqData.directions) {
      for (const a of (d.implanter || [])) {
        if (fdCodes.has(a.code)) continue; // déjà dans finalData
        let reseauAgences = 0, totalCA = 0, totalQte = 0, totalVMB = 0;
        for (const s of otherStores) {
          const v = vpm[s]?.[a.code];
          if (!v || v.countBL <= 0) continue;
          reseauAgences++;
          totalCA += v.sumCA || 0;
          totalQte += (v.sumPrelevee || 0) + (v.sumEnleve || 0);
          totalVMB += v.sumVMB || 0;
        }
        const prixMoyenReseau = totalQte > 0 ? Math.round(totalCA / totalQte * 100) / 100 : null;
        const txMargeReseau = totalQte > 0 ? (totalCA > 0 ? Math.round(totalVMB / totalCA * 10000) / 100 : 0) : null;
        // Médiane réseau ERP depuis stockParMagasin
        const _spMins=otherStores.map(s=>_S.stockParMagasin?.[s]?.[a.code]?.qteMin).filter(v=>v>0);
        const _spMaxs=otherStores.map(s=>_S.stockParMagasin?.[s]?.[a.code]?.qteMax).filter(v=>v>0);
        const _median=arr=>{const s=[...arr].sort((x,y)=>x-y);return s[Math.floor(s.length/2)];};
        const medMin=_spMins.length?Math.round(_median(_spMins)):0;
        const medMax=_spMaxs.length?Math.round(_median(_spMaxs)):0;
        let sugMin=Math.max(medMin,1);
        let sugMax=Math.max(medMax,sugMin+1);
        if(!_spMins.length&&!_spMaxs.length){sugMin=0;sugMax=0;} // aucune donnée réseau
        articles.push({
          code: a.code, libelle: a.libelle || '', famille: a.famille || '', sousFamille: '',
          emplacement: '', statut: '', stockActuel: 0,
          prixMoyenReseau, txMargeReseau, prixUnitaire: prixMoyenReseau||0, W: 0, V: 0,
          ancienMin: 0, ancienMax: 0,
          nouveauMin: sugMin, nouveauMax: sugMax,
          couvertureJours: 0, abcClass: '', fmrClass: '',
          matriceVerdict: '',
          _sqClassif: 'implanter', _sqRole: '', _sqVerdict: a.classification || 'implanter',
          medMinReseau: medMin||null, medMaxReseau: medMax||null,
          _vitesseReseau: sugMin > 0, _fallbackERP: true,
          _reseauAgences: reseauAgences, isParent: false
        });
        fdCodes.add(a.code); // éviter les doublons cross-directions
      }
    }
  }
  // EAN → code (inverse map pour lookup scanner)
  const eanMap = {};
  if (_S.catalogueEAN?.size) {
    for (const [ean, code] of _S.catalogueEAN) eanMap[ean] = code;
  }
  const payload = { version: 2, store: myStore, timestamp: Date.now(), count: articles.length, articles, ean: eanMap };
  const json = JSON.stringify(payload);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'prisme-scan-' + myStore + '.json'; a.click();
  URL.revokeObjectURL(url);
  showToast('📱 Fichier Scan exporté — ' + articles.length + ' refs (' + (json.length / 1024 / 1024).toFixed(1) + ' Mo)', 'success');
};
window.resetPeriodFilter = function(){applyPeriodFilter(null,null);};
function renderSidebarAgenceSelector() {
  // Navbar: static agence code display (no dropdown)
  const navSt = document.getElementById('navStore');
  if (navSt) { navSt.textContent = _S.selectedMyStore || ''; navSt.classList.toggle('hidden', !_S.selectedMyStore); }
}
window.updateNavStore = renderSidebarAgenceSelector;
window.renderSidebarAgenceSelector = renderSidebarAgenceSelector;
// Promo — fonctions HTML onclick non encore exposées
window._clearPromoImport = _clearPromoImport;
window._closePromoSuggest = _closePromoSuggest;
window._onPromoImportFileChange = _onPromoImportFileChange;
window._onPromoInput = _onPromoInput;
window._promoSuggestKeydown = _promoSuggestKeydown;
window._selectPromoSuggestion = _selectPromoSuggestion;
window._resetPromoFilters = _resetPromoFilters;
window._togglePromoImportSection = _togglePromoImportSection;
window._togglePromoSection = _togglePromoSection;
window.copyPromoClipboard = copyPromoClipboard;
window.exportPromoCSV = exportPromoCSV;
window.runPromoImport = runPromoImport;
window.runPromoSearch = runPromoSearch;
// ui.js — fonctions HTML onclick non encore exposées
window.clearSavedKPI = clearSavedKPI;
window.collapseImportZone = collapseImportZone;
window.downloadCSV = downloadCSV;
window.exportKPIhistory = exportKPIhistory;
window.importKPIhistory = importKPIhistory;
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
// Promo — accordion inline (also wired at processData)

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
  _horsZoneExpand:   ()=>{_S._horsZonePage=1;_renderHorsZone();},
  _horsZoneCollapse: ()=>{_S._horsZonePage=0;_renderHorsZone();},
  _horsZonePage:     (el)=>{_S._horsZonePage=Math.max(1,(_S._horsZonePage||1)+parseInt(el.dataset.dir));_renderHorsZone();},
  // Pagination — Opportunités nettes
  _oppNettePage: (el)=>{_S._oppNettePage=Math.max(1,(_S._oppNettePage||1)+parseInt(el.dataset.dir));renderTerritoireTab();},
  // Pagination — Angles Morts
  _anglesMortsPage: (el)=>{_S._anglesMortsPage=Math.max(1,(_S._anglesMortsPage||1)+parseInt(el.dataset.dir));renderTerritoireTab();},
};

document.addEventListener('click', (e)=>{
  const el=e.target.closest('[data-action]');
  if(!el)return;
  const handler=ACTION_REGISTRY[el.dataset.action];
  if(handler){e.preventDefault();handler(el,e);}
});
