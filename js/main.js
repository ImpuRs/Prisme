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
import { cleanCode, extractClientCode, cleanPrice, cleanOmniPrice, formatEuro, pct, parseExcelDate, daysBetween, getVal, getQuantityColumn, getCaColumn, getVmbColumn, extractStoreCode, readExcel, readExcelAsObjects, yieldToMain, parseCSVText, getAgeBracket, getAgeLabel, _median, _isMetierStrategique, _normalizeClassif, _classifShort, _doCopyCode, _copyCodeBtn, _copyAllCodesDirect, _normalizeStatut, fmtDate, getSecteurDirection, _resetColCache, escapeHtml, formatLocalYMD, extractFamCode, famLib, famLabel, matchQuery } from './utils.js';
import { _S, resetAppState, assertPostParseInvariants, invalidateCache } from './state.js';
import { enrichPrixUnitaire, estimerCAPerdu, calcPriorityScore, prioClass, prioLabel, isParentRef, computeABCFMR, calcCouverture, formatCouv, couvColor, computeClientCrossing, _clientUrgencyScore, _clientStatusBadge, _clientStatusText, _unikLink, _crossBadge, _passesClientCrossFilter, clientMatchesDeptFilter, clientMatchesClassifFilter, clientMatchesStatutFilter, clientMatchesActivitePDVFilter, clientMatchesStatutDetailleFilter, clientMatchesDirectionFilter, clientMatchesCommercialFilter, clientMatchesMetierFilter, clientMatchesUniversFilter, _clientPassesFilters, _diagClientPrio, _diagClassifPrio, _diagClassifBadge, _isGlobalActif, _isPDVActif, _isPerdu, _isProspect, _isPerdu24plus, _radarComputeMatrix, generateDecisionQueue, computeReconquestCohort, computeSPC, computeOpportuniteNette, computeReseauHeatmap, computeOmniScores, computeFamillesHors } from './engine.js';
import { parseChalandise, onChalandiseSelected, parseLivraisons, onLivraisonsSelected, buildSecteurCheckboxes, toggleSecteurDropdown, toggleAllSecteurs, onSecteurChange, getSelectedSecteurs, computeBenchmark, _clientWorker, launchClientWorker, _reseauWorker, launchReseauWorker, loadCpCoords, _computeChalandiseDistances } from './parser.js';
import { showToast, updateProgress, updatePipeline, showLoading, hideLoading, onFileSelected, _updateAnalyserBtn, collapseImportZone, expandImportZone, switchTab, openFilterDrawer, closeFilterDrawer, populateSelect, getFilteredData, renderAll, onFilterChange, debouncedRender, resetFilters, filterByAge, clearAgeFilter, updateActiveAgeIndicator, filterByAbcFmr, showCockpitInTable, clearCockpitFilter, _toggleNouveautesFilter, updatePeriodAlert, renderInsightsBanner, openReporting, sortBy, changePage, openCmdPalette, _cmdExec, _cmdMoveSelection, _cmdRender, _cmdBuildResults, closeReporting, copyReportText, clearSavedKPI, exportKPIhistory, importKPIhistory, downloadCSV, clipERP, wrapGlossaryTerms, initTheme, cycleTheme, exportCockpitResume, renderHealthScore, renderIRABanner, exportAgenceSnapshot, renderTabBadges, _cematinSearch, showSilencieux60, _loadIRAHistory, _renderNoStockPlaceholder } from './ui.js';
import { _saveToCache, _restoreFromCache, _clearCache, _showCacheBanner, _onReloadFiles, _onPurgeCache, _saveExclusions, _restoreExclusions, _saveSessionToIDB, _restoreSessionFromIDB, _clearIDB, _migrateIDB, _getFileHash, _checkFilesUnchanged, _saveFileHashes } from './cache.js';
import { buildPagerHtml, deltaColor, csvCell, renderOppNetteTable } from './helpers.js';
import { initRouter } from './router.js';
import { DataStore } from './store.js';
window._S = _S; // debug + accès depuis nl.js et console DevTools
import { _onPromoInput, _closePromoSuggest, _selectPromoSuggestion, _promoSuggestKeydown, runPromoSearch, _onPromoFamilleChange, _applyPromoFilters, _resetPromoFilters, _togglePromoSection, exportTourneeCSV, exportPromoCSV, copyPromoClipboard, _onPromoImportFileChange, _clearPromoImport, runPromoImport, _togglePromoImportSection, exportPromoImportCSV, resetPromo, _togglePromoClientRow, _switchPromoTab, _exportCommercialCSV, _renderSearchResults } from './promo.js';
import { openDiagnostic, openDiagnosticMetier, closeDiagnostic, executeDiagAction, closeArticlePanel, openArticlePanel, renderDiagnosticPanel, _renderDiagnosticCellPanel, exportDiagnosticCSV, _diagV3FilterCategory, toggleReconquestFilter, openClient360, _c360SwitchTab, _c360CopyResume } from './diagnostic.js';
import { renderLaboTab, updateLaboTiles } from './labo.js';
import { renderPlanRayon, renderPlanStock } from './planRayon.js';
import { renderArbitrageRayonBlock } from './emplacement.js';
import { renderAnimationTab, loadCatalogueMarques } from './animation.js';
// ── P3 Modules — extracted from main.js ──
import { onBenchParamChange, buildBenchCheckboxes, getBenchCompareStores, recalcBenchmarkInstant, renderBenchmark, buildBenchBassinSelect, renderReseauHeatmap, renderReseauNomades, renderReseauFuites, renderNomadesMissedArts, renderHeatmapFamilleCommercial, _obsNav, renderObservatoire, buildObsCompareSelect, _buildObsUniversDropdown, onObsCompareChange, onObsFilterChange, resetObsFilters, _setBenchPeriode, renderObsArticleSearch, copyObsActionPlan, copyObsArticleList, toggleObsFamily, copyObsSection, copyPepitesList, copyPepitesOtherList, openNomadeArticleModal, closeNomadeArticleModal, _copyNomadeClientsClipboard, copyNomadesMissedArts, exportBenchList } from './bench.js';
import { renderCanalAgence, openCanalDrill, openCanalDrillArticles, closeCanalDrill, exportCanalDrillCSV, getKPIsByCanal, computePhantomArticles, _setTerrClientsCanalFilter, renderOmniTab, SEG_LABELS } from './omni.js';
import { _renderGhostArticles, toggleTerrDir, toggleTerrDirStatus, toggleTerrFam, buildTerrContrib, renderTerrContrib, toggleContribDirection, toggleContribSecteur, renderContribClients, toggleContribClient, renderContribArticles, resetTerrFilters, exportContribCSV, exportTerritoireCSV } from './territoire.js';
import { _renderHorsZone, _passesAllFilters, _renderTopClientsPDV, computeTerritoireKPIs, computeClientsKPIs, renderTerritoireTab, renderCockpitEquation, renderCockpitRupClients, renderMesClients, renderCommerceTab, _switchClientsTab, _toggleOverviewClassif, _toggleOverviewActPDV, _toggleOverviewStatut, _toggleOverviewDirection, _onActPDVSelect, _onStatutDetailleSelect, _onStatutSelect, _onUniversSelect, _toggleOverviewUnivers, _buildDeptFilter, _toggleDept, _resetChalandiseFilters, _toggleDeptDropdown, _toggleClassifDropdown, _toggleActPDVDropdown, _toggleStatutDropdown, _toggleDirectionDropdown, _toggleStrategiqueFilter, _onCommercialFilter, _onDistanceSlider, _onTerrClientSearch, _onMetierFilter, _navigateToOverviewMetier, _togglePerdu24m, _buildOverviewFilterChips, _renderCommercialSummary, _buildChalandiseOverview, _toggleOverviewL2, _toggleOverviewL3, _toggleOverviewL4, _toggleClientArticles, _cockpitToggleFullList, _cockpitToggleSection, _setPDVCanalFilter, _buildDegradedCockpit, _buildCockpitClient, exportTop5CSV, _setCrossFilter, _setClientView, _cockpitRowCSV, _downloadCockpitCSV, exportCockpitCSV, exportCockpitCSVAll, _showExcludePrompt, _confirmExclude, _unexcludeClient, _unexcludeAll, _toggleExcludedList, exportExclusionsJSON, importExclusionsJSON, _toggleHorsMagasin } from './commerce.js';

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

    // Chemin rapide — byMonth disponible (nouveau worker) → refilter <100ms
    if(_S._byMonth){
      _refilterFromByMonth();
      buildPeriodFilter();
      computeClientCrossing();_computeClientDominantUnivers();
      renderCanalAgence();renderCurrentTab();renderIRABanner?.();
      return;
    }

    buildPeriodFilter(); // mettre à jour labels boutons + état pills
    const _refilterDataC=(_S._rawDataCFiltered?.rows?.length)?_S._rawDataCFiltered:_S._rawDataC;
    if(_refilterDataC?.rows?.length){
      // Données brutes disponibles (ancienne session) — re-parser via processDataFromRaw
      processDataFromRaw(_refilterDataC,_S._rawDataS||[],{isRefilter:true});
    }else if(_S._bufC){
      // Fallback — buffers disponibles mais byMonth absent (edge case IDB ancien cache)
      (async()=>{
        showLoading('Recalcul période…','');
        try{
          const parseResult=await launchParseWorker(_S._bufC.slice(0),_S._bufS?_S._bufS.slice(0):null,{
            selectedStore:_S.selectedMyStore||'',
            storesIntersection:[..._S.storesIntersection],
            periodStart:_S.periodFilterStart?_S.periodFilterStart.getTime():null,
            periodEnd:_S.periodFilterEnd?_S.periodFilterEnd.getTime():null,
            isRefilter:true,
          });
          // Sauvegarder les données période-invariantes avant hydratation
          const _savedFull=_S.ventesClientArticleFull.size?_S.ventesClientArticleFull:new Map([..._S.ventesClientArticle].map(([cc,arts])=>[cc,new Map(arts)]));
          const _savedHors=_S.ventesClientHorsMagasin;
          const _savedLastOrderAll=_S.clientLastOrderAll;
          const _savedLastOrderByCanal=_S.clientLastOrderByCanal;
          _hydrateStateFromParseResult(parseResult,_S.selectedMyStore);
          // Restaurer les invariants période (hors-MAGASIN ne change pas au refilter)
          if(!_S.ventesClientArticleFull.size&&_savedFull.size)_S.ventesClientArticleFull=_savedFull;
          if(!_S.ventesClientHorsMagasin.size&&_savedHors.size)_S.ventesClientHorsMagasin=_savedHors;
          if(!_S.clientLastOrderAll.size&&_savedLastOrderAll.size)_S.clientLastOrderAll=_savedLastOrderAll;
          if(!_S.clientLastOrderByCanal.size&&_savedLastOrderByCanal.size)_S.clientLastOrderByCanal=_savedLastOrderByCanal;
          enrichPrixUnitaire();_enrichFinalDataWithCA();
          if(_S.storesIntersection.size>1&&_S.selectedMyStore){invalidateCache('bench');const _rcp=(_S._reseauCanaux||new Set()).size===1?[...(_S._reseauCanaux||new Set())][0]:null;computeBenchmark(_rcp);}
          computeClientCrossing();_computeClientDominantUnivers();
          renderCanalAgence();renderCurrentTab();renderIRABanner();
        }catch(err){showToast('⚠️ Erreur refilter: '+err.message,'warning');renderCanalAgence();renderCurrentTab();renderIRABanner();}
        finally{hideLoading();}
      })();
    }else{
      // Données brutes non disponibles (session restaurée depuis IDB) — re-render léger
      showToast('⚠️ Agrégats figés — rechargez le fichier consommé pour recalculer sur cette période','warning');
      renderCanalAgence();renderCurrentTab();renderIRABanner();
    }
  }

  // ── _refilterFromByMonth — reconstruction instantanée ventesClientArticle + canalAgence ──
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

    // ── Reconstruire ventesClientArticle ──
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
              e.sumPrelevee+=d.sumPrelevee;
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
      // Chemin hors-MAGASIN — ventesClientHorsMagasin filtré par canal
      // Pas de filtrage période au niveau client (byMonth n'existe que pour MAGASIN)
      const vchm=_S.ventesClientHorsMagasin;
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
            e.sumPrelevee+=d.sumPrelevee||0;
            e.sumCAPrelevee+=_caP;
            e.countBL+=d.countBL||0;
          }
        }
      }
    }

    // sumCAAll : copier depuis ventesClientArticleFull (pleine période) — MAGASIN uniquement
    if((!activeCanal||activeCanal==='MAGASIN')&&_S.ventesClientArticleFull?.size){
      for(const[cc,artMap]of newVCA){
        const fullMap=_S.ventesClientArticleFull.get(cc);
        if(!fullMap)continue;
        for(const[code,e]of artMap){
          const ef=fullMap.get(code);
          if(ef)e.sumCAAll=ef.sumCAAll||0;
        }
      }
    }

    _S.ventesClientArticle=newVCA;
    _S.clientsMagasin=newClientsMagasin;
    _S.clientsMagasinFreq=newClientsMagasinFreq;

    // ── Reconstruire canalAgence depuis byMonthCanal ──
    const bmc=_S._byMonthCanal;
    if(bmc){
      const newCanalAgence={};
      for(const store in bmc){
        if(_S.selectedMyStore&&store!=='INCONNU'&&store!==_S.selectedMyStore)continue;
        for(const canal in bmc[store]){
          const months=bmc[store][canal];
          for(const midxStr in months){
            const midx=+midxStr;
            if(midx<startIdx||midx>endIdx)continue;
            const d=months[midxStr];
            if(!newCanalAgence[canal])newCanalAgence[canal]={bl:0,ca:0,caP:0,caE:0,sumVMB:0,sumVMBP:0};
            newCanalAgence[canal].bl+=d.countBL;
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

    // ── Recalculer consommePeriodMin/Max ──
    if(pStart)_S.consommePeriodMin=pStart;
    if(pEnd)_S.consommePeriodMax=pEnd;

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

    invalidateCache('tab','terr');
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


  // ★★★ MOTEUR PRINCIPAL ★★★

  // Helper : détecte la colonne code agence dans une ligne
  function _detectStoreColumn(row){
    if(!row)return null;
    return Object.keys(row).find(k=>{
      const kl=k.toLowerCase().replace(/[\r\n]/g,' ').trim();
      return kl==='code pdv'||kl==='pdv'||kl==='code agence'||kl==='agence'||kl==='code depot'||kl==='dépôt'||kl==='depot';
    })||null;
  }
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
    const f1=document.getElementById('fileConsomme').files[0],f2=document.getElementById('fileStock').files[0];
    if(!f1){showToast('⚠️ Chargez votre fichier Consommé (ventes)','warning');return;}
    if(!f2){showToast('ℹ️ Mode commercial — chargez l\'État du Stock pour les vues Articles et Mon Stock','info',4000);}
    const btn=document.getElementById('btnCalculer');btn.disabled=true;
    // ── OPT1 : Hash-check IDB — même fichier → skip parse complet ──
    {
      const _hashes = localStorage.getItem('prisme_fileHashes');
      if (_hashes) {
        const _idbOk = DataStore.finalData.length > 0 || await _restoreSessionFromIDB();
        if (_idbOk && DataStore.finalData.length > 0) {
          const _unchanged = await _checkFilesUnchanged(f1, f2 || null, document.getElementById('fileChalandise').files[0] || null);
          const _fTerr = document.getElementById('fileLivraisons').files[0];
          const _hasNewTerr = !!(_fTerr && _fTerr.size > 0);
          if (_unchanged && !(_hasNewTerr && !_S.territoireReady)) {
            showToast('⚡ Fichiers inchangés — session restaurée depuis le cache', 'success', 3000);
            btn.disabled = false;
            hideLoading();
            renderAll();
            buildPeriodFilter();
            return;
          }
        }
      }
    }
    // H4: reset complet de tous les globals session avant chaque re-upload
    resetAppState();
    const _selStore=document.getElementById('selectMyStore');
    if(_selStore){if(_storeOverride){_selStore.value=_storeOverride;}else{_selStore.innerHTML='<option value="">—</option>';_selStore.value='';}}
    _restoreExclusions();
    resetPromo();

    // Agence pré-remplie si mémorisée — le Worker validera et demandera si besoin
    let selectedStore=_storeOverride||localStorage.getItem('prisme_selectedStore')||'';

    showLoading('Lecture…','');await yieldToMain();

    // ── Lecture parallèle des ArrayBuffers ──
    let bufC, bufS;
    try{
      updatePipeline('consomme','active');updatePipeline('stock','active');
      updateProgress(10,100,'Lecture fichiers…');
      [bufC, bufS] = await Promise.all([
        f1.arrayBuffer(),
        f2 ? f2.arrayBuffer() : Promise.resolve(null)
      ]);
      updateProgress(18,100,'Buffers prêts…');await yieldToMain();
    }catch(error){showToast('❌ Lecture fichiers: '+error.message,'error');console.error(error);btn.disabled=false;hideLoading();return;}

    // Stocker les buffers pour refilter période ultérieur
    // Note: slice() pour ne pas transférer l'original (il sera transféré au worker)
    _S._bufC = bufC.slice(0);
    _S._bufS = bufS ? bufS.slice(0) : null;
    _S._rawDataC = null; _S._rawDataS = [];

    // ── Lancement du worker de parsing ──
    updateProgress(20,100,'Parsing en cours (Worker)…');
    let parseResult;
    try{
      parseResult = await launchParseWorker(bufC, bufS, {
        selectedStore: selectedStore || '',
        storesIntersection: [],  // worker va détecter lui-même
        filenameC: f1 ? f1.name : '',
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
    await _postParseMain({storeOverride: selectedStore||'', _f1: f1, _f2: f2||null});
    buildPeriodFilter();
  }

  // ── launchParseWorker — lance parse-worker.js et retourne le payload ──
  function launchParseWorker(bufC, bufS, opts) {
    return new Promise(function(resolve, reject) {
      const worker = new Worker('js/parse-worker.js');
      worker.onmessage = async function(ev) {
        const msg = ev.data;
        if (msg.type === 'progress') {
          updateProgress(msg.pct, 100, msg.msg);
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
          opts._resolvedStore = store;
          worker.postMessage({ type: 'continue', selectedStore: store });
        } else if (msg.type === 'done') {
          worker.terminate();
          resolve(msg.payload);
        } else if (msg.type === 'error') {
          worker.terminate();
          reject(new Error(msg.msg));
        }
      };
      worker.onerror = function(err) { worker.terminate(); reject(new Error('ParseWorker: ' + (err.message||'erreur'))); };
      const transferables = [bufC];
      if (bufS) transferables.push(bufS);
      worker.postMessage(Object.assign({ bufC: bufC, bufS: bufS || null }, opts), transferables);
    });
  }

  // ── _hydrateStateFromParseResult — reconstruit _S depuis le payload worker ──
  function _hydrateStateFromParseResult(r, selectedStore) {
    // Objets plain
    _S.articleRaw         = r.articleRaw || {};
    _S.articleMonthlySales    = r.monthlySales || {};
    _S.seasonalIndexReseau    = r.seasonalIndexReseau || {};
    _S.ventesParMagasin   = r.ventesParMagasin || {};
    _S.ventesParMagasinByCanal = r.ventesParMagasinByCanal || {};
    _S.clientNomLookup    = r.clientNomLookup || {};
    _S.articleFamille     = r.articleFamille || {};
    _S.articleUnivers     = r.articleUnivers || {};
    _S.libelleLookup      = r.libelleLookup || {};
    _S.canalAgence        = r.canalAgence || {};
    _S._byMonth           = r.byMonth      || null;
    _S._byMonthCanal      = r.byMonthCanal || null;
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
    // Période complète par défaut — l'utilisateur choisit son mois via le filtre (refilter instantané)
    _S.periodFilterStart = null;
    _S.periodFilterEnd   = null;

    // Maps imbriquées
    _S.ventesClientArticle     = new Map((r.ventesClientArticle||[]).map(([k,v]) => [k, new Map(v)]));
    _S.ventesClientArticleFull = new Map((r.ventesClientArticleFull||[]).map(([k,v]) => [k, new Map(v)]));
    _S.ventesClientHorsMagasin = new Map((r.ventesClientHorsMagasin||[]).map(([k,v]) => [k, new Map(v)]));
    _S.clientLastOrder         = new Map((r.clientLastOrder||[]).map(([k,v]) => [k, typeof v==='number'?new Date(v):v]));
    _S.clientLastOrderAll      = new Map((r.clientLastOrderAll||[]).map(([k,v]) => [k, {date:new Date(v.date),canal:v.canal}]));
    _S.clientLastOrderByCanal  = new Map((r.clientLastOrderByCanal||[]).map(([k,v]) => [k, new Map(v)]));
    _S.clientArticles          = new Map((r.clientArticles||[]).map(([k,v]) => [k, new Set(v)]));
    _S.articleClients          = new Map((r.articleClients||[]).map(([k,v]) => [k, new Set(v)]));
    _S.articleCanalCA          = new Map((r.articleCanalCA||[]).map(([k,v]) => [k, new Map(v)]));
    _S.blCanalMap              = new Map(r.blCanalMap||[]);
    _S.clientsMagasin          = new Set(r.clientsMagasin||[]);
    _S.clientsMagasinFreq      = new Map(r.clientsMagasinFreq||[]);
    _S.cannauxHorsMagasin      = new Set(r.cannauxHorsMagasin||[]);
    _S.blPreleveeSet           = new Set(r.blPreleveeSet||[]);

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

  // ── _postParseMain — étapes post-hydratation côté main thread ────────────
  // Equivalent à la fin de processDataFromRaw() mais sans re-parser les fichiers.
  async function _postParseMain(opts) {
    const {storeOverride='', _f1=null, _f2=null} = opts;
    const t0 = performance.now();
    const btn = document.getElementById('btnCalculer'); btn.disabled = true;
    try {
      const useMulti = _S.storesIntersection.size > 1 && _S.selectedMyStore;

      // Enrichissement prix unitaire depuis ventes (main thread, accès _S)
      enrichPrixUnitaire();
      _enrichFinalDataWithCA();

      // Positionner sur le mois le plus récent par défaut
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
      {const f4=document.getElementById('fileChalandise').files[0];if(f4&&!_S.chalandiseReady&&!_S._chalandiseLoading){_S._chalandiseLoading=true;try{await parseChalandise(f4);}finally{_S._chalandiseLoading=false;}}}
      {const fL=document.getElementById('fileLivraisons').files[0];if(fL&&!_S.livraisonsReady&&!_S._livraisonsLoading){_S._livraisonsLoading=true;try{await parseLivraisons(fL);}finally{_S._livraisonsLoading=false;}}}
      if(useMulti){updateProgress(92,100,'Benchmark…');await yieldToMain();computeBenchmark(_S._globalCanal||null);}

      // ABC/FMR + selects
      if(DataStore.finalData.length>0&&DataStore.finalData.every(r=>r.stockActuel===0)){showToast('⚠️ Attention : toutes les valeurs de stock sont à 0 dans le fichier. Vérifiez votre export.','warning');}
      updateProgress(93,100,'Radar ABC/FMR…');await yieldToMain();
      assertPostParseInvariants();
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

      const elapsed=((performance.now()-t0)/1000).toFixed(1);
      document.getElementById('navStats').textContent=DataStore.finalData.length.toLocaleString('fr')+' art.';document.getElementById('navStats').classList.remove('hidden');
      document.getElementById('navPerf').textContent=elapsed+'s';document.getElementById('navPerf').classList.remove('hidden');
      const _navSt=document.getElementById('navStore');if(_navSt){_navSt.textContent=_S.selectedMyStore||'';_navSt.classList.toggle('hidden',!_S.selectedMyStore);}
      document.getElementById('navReportingBtn').classList.remove('hidden');
      document.getElementById('globalFilters').classList.remove('hidden');
      document.body.classList.add('pilot-loaded');
      if(useMulti){document.getElementById('btnTabReseau').classList.remove('hidden');buildBenchCheckboxes();}else document.getElementById('btnTabReseau').classList.add('hidden');
      const _terrBtn=document.getElementById('btnTabCommerce');_terrBtn.classList.remove('hidden');
      const _clientsBtn=document.getElementById('btnTabClients');if(_clientsBtn)_clientsBtn.classList.remove('hidden');
      const terrNoC=document.getElementById('terrNoChalandise');if(terrNoC)terrNoC.classList.toggle('hidden',_S.chalandiseReady);

      computeClientCrossing();computeReconquestCohort();
      if(!_S.chalandiseReady)_rebuildCaByArticleCanal();
      // launchClientWorker — toujours lancé (gère chalandise vide en interne)
      // IDB sauvegardée uniquement ici — évite double save avec chalandise partielle
      launchClientWorker().then(async()=>{
        if(_S.chalandiseReady&&DataStore.ventesClientArticle.size>0){computeOpportuniteNette();computeOmniScores();computeFamillesHors();generateDecisionQueue();renderIRABanner();renderTabBadges();updateLaboTiles();showToast('📊 Agrégats clients calculés','success');}
        if(_S.selectedMyStore){localStorage.setItem('prisme_selectedStore',_S.selectedMyStore);_saveToCache();await _saveSessionToIDB();const f1=document.getElementById('fileConsomme').files[0];const f2=document.getElementById('fileStock').files[0]||null;const f3=document.getElementById('fileChalandise').files[0]||null;if(f1)await _saveFileHashes(f1,f2,f3);}
      }).catch(err=>console.warn('Client worker error:',err));
      _S.currentPage=0;
      if(useMulti){_buildObsUniversDropdown();buildBenchBassinSelect();renderBenchmark();launchReseauWorker().then(()=>{renderNomadesMissedArts();}).catch(err=>console.warn('Réseau worker error:',err));}
      renderAll();
      _syncTabAccess();

      // Auto-YTD si consommé court
      if(_S.consommeMoisCouverts<6&&(_S._globalPeriodePreset||'12M')==='12M'){_S._globalPeriodePreset='YTD';setPeriodePreset('YTD');}

      if(_S.cannauxHorsMagasin.size>0){const _labelsCanaux={INTERNET:'🌐 Internet',REPRESENTANT:'🤝 Représentant',DCS:'🏢 DCS'};const _listeCanaux=[..._S.cannauxHorsMagasin].map(c=>_labelsCanaux[c]||c).join(', ');showToast(`📡 Canaux détectés : ${_listeCanaux} — vue "Commandes hors agence" activée dans Le Terrain`,'success',6000);}

      updateProgress(100,100,'✅ Prêt !',elapsed+'s');await new Promise(r=>setTimeout(r,400));
      renderSidebarAgenceSelector();
      switchTab('omni');btn.textContent='✅ '+elapsed+'s';btn.classList.replace('s-panel-inner','bg-emerald-600');
      const _nbF=2+(document.getElementById('fileLivraisons')?.files[0]?1:0)+(document.getElementById('fileChalandise').files[0]?1:0);
      collapseImportZone(_nbF,_S.selectedMyStore,DataStore.finalData.length,elapsed);
      const btnR=document.getElementById('btnRecalculer');if(btnR)btnR.classList.remove('hidden');

    }catch(error){if(error.message==='NO_STORE_SELECTED')return;showToast('❌ '+error.message,'error');console.error(error);btn.textContent='❌';btn.classList.replace('s-panel-inner','bg-red-600');}
    finally{btn.disabled=false;hideLoading();}
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
    // Compléter avec le baseline 2025 pour les familles absentes du consommé courant
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
    const needsStock=['table','stock'];
    const needsConsomme=['commerce'];
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
    const{isRefilter=false,storeOverride='',_f1=null,_f2=null}=opts;
    const _savedStoreBeforeReset=isRefilter?(_S.selectedMyStore||localStorage.getItem('prisme_selectedStore')||''):'';
    if(isRefilter&&_savedStoreBeforeReset)_S.selectedMyStore=_savedStoreBeforeReset;
    const t0=performance.now();const btn=document.getElementById('btnCalculer');btn.disabled=true;
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
      updateProgress(45,100,'Ventes…',dataC.rows.length.toLocaleString('fr'));
      const articleRaw={};_S.ventesParMagasin={};_S.blData={};if(!isRefilter)_S.clientsMagasin=new Set();_S.ventesClientArticle=new Map();if(!isRefilter){_S.clientLastOrder=new Map();_S.clientLastOrderAll=new Map();}_S.ventesClientsPerStore={};_S.articleClients=new Map();_S.clientArticles=new Map();
      _S.ventesParMagasinByCanal={};
      if(!isRefilter){_S.articleFamille={};_S.articleUnivers={};_S.canalAgence={};_S.clientNomLookup={};}
      const _clientMagasinBLsTemp=new Map();
      const monthlySales={}; // B3: code → [12 mois qtés]
      let minDateVente=Infinity,maxDateVente=0;let passagesUniques=new Set(),commandesPDV=new Set();const _tempCAAll=new Map(); // accumulation sumCAAll tous canaux, filtré période, fusionné après la boucle
      const _tempCAAllFull=new Map(); // accumulation sumCAAll tous canaux, pleine période, pour ventesClientArticleFull
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
      // clientLastOrderAll — tous canaux, period-independent, avant le split canal
      if(!isRefilter&&dateV){const _ccAll=extractClientCode(_rc);const _skAll=_rs;if(_ccAll&&(!_S.selectedMyStore||_skAll==='INCONNU'||_skAll===_S.selectedMyStore)){const prev=_S.clientLastOrderAll.get(_ccAll);if(!prev||dateV>prev.date)_S.clientLastOrderAll.set(_ccAll,{date:dateV,canal:canal||'MAGASIN'});
      // clientLastOrderByCanal — dernière commande par canal
      const _cByC=canal||'MAGASIN';if(!_S.clientLastOrderByCanal.has(_ccAll))_S.clientLastOrderByCanal.set(_ccAll,new Map());const _cMap=_S.clientLastOrderByCanal.get(_ccAll);const _prevC=_cMap.get(_cByC);if(!_prevC||dateV>_prevC)_cMap.set(_cByC,dateV);}}
      // Accumulation CA tous canaux par client dans _tempCAAll (fusionné après la boucle)
      // Ne PAS créer d'entrée dans ventesClientArticle ici — seules les lignes MAGASIN (L1686) le font
      if(!(_S.periodFilterStart&&dateV&&dateV<_S.periodFilterStart)&&!(_S.periodFilterEnd&&dateV&&dateV>_S.periodFilterEnd))
      {const _ccA=extractClientCode(_rc);const _codeA=cleanCode(_ra);const _skA=_rs;if(_ccA&&_codeA&&(!_S.selectedMyStore||_skA==='INCONNU'||_skA===_S.selectedMyStore)){const _caAT=_rcp+_rce;if(_caAT>0){if(!_tempCAAll.has(_ccA))_tempCAAll.set(_ccA,new Map());const _amA=_tempCAAll.get(_ccA);_amA.set(_codeA,(_amA.get(_codeA)||0)+_caAT);}}}
      // _tempCAAllFull — tous canaux, pleine période (sans filtre), pour ventesClientArticleFull.sumCAAll
      if(!isRefilter){const _ccAF=extractClientCode(_rc);const _codeAF=cleanCode(_ra);if(_ccAF&&_codeAF&&(!_S.selectedMyStore||_rs==='INCONNU'||_rs===_S.selectedMyStore)){const _caAF=_rcp+_rce;if(_caAF>0){if(!_tempCAAllFull.has(_ccAF))_tempCAAllFull.set(_ccAF,new Map());const _amAF=_tempCAAllFull.get(_ccAF);_amAF.set(_codeAF,(_amAF.get(_codeAF)||0)+_caAF);}}}
      // clientNomLookup — ALL canals, before the canal split, so hors-MAGASIN clients get named too
      if(!isRefilter){const _ccNom=extractClientCode(_rc);if(_ccNom&&!_S.clientNomLookup[_ccNom]){const _rawFull=_rc;const _di=_rawFull.indexOf(' - ');if(_di>=0)_S.clientNomLookup[_ccNom]=_rawFull.slice(_di+3).trim();}}
      if(_S.storesIntersection.size>0?canal!=='MAGASIN':canal!==''&&canal!=='MAGASIN'){
        // Canaux hors MAGASIN — filtre période + accumulation ventesParMagasinByCanal
        if(canal){
          if(_S.periodFilterStart&&dateV&&dateV<_S.periodFilterStart){continue;}
          if(_S.periodFilterEnd&&dateV&&dateV>_S.periodFilterEnd){continue;}
          const cc=extractClientCode(_rc);const codeArt=cleanCode(_ra);const caLigne=_rcp+_rce;const qteLigne=_rqp+_rqe;const skHors=_rs;
          // ventesClientHorsMagasin — skip for isRefilter
          if(!isRefilter&&cc&&codeArt&&(!_S.selectedMyStore||skHors==='INCONNU'||skHors===_S.selectedMyStore)){_S.cannauxHorsMagasin.add(canal);const hm=_S.ventesClientHorsMagasin.get(cc)||new Map();const ex=hm.get(codeArt)||{sumCA:0,sumPrelevee:0,sumCAPrelevee:0,countBL:0,canal};ex.sumCA+=caLigne;ex.sumPrelevee+=qteLigne;ex.sumCAPrelevee+=caLigne;ex.countBL++;hm.set(codeArt,ex);_S.ventesClientHorsMagasin.set(cc,hm);}
          // ventesParMagasinByCanal — toujours (y compris isRefilter)
          if(codeArt&&(skHors==='INCONNU'||_S.storesIntersection.has(skHors)||!_S.storesIntersection.size)){const _storeKey=skHors==='INCONNU'?(_S.selectedMyStore||skHors):skHors;if(!_S.ventesParMagasinByCanal[_storeKey])_S.ventesParMagasinByCanal[_storeKey]={};if(!_S.ventesParMagasinByCanal[_storeKey][canal])_S.ventesParMagasinByCanal[_storeKey][canal]={};if(!_S.ventesParMagasinByCanal[_storeKey][canal][codeArt])_S.ventesParMagasinByCanal[_storeKey][canal][codeArt]={sumCA:0,sumPrelevee:0,countBL:0,sumVMB:0,sumVMBPrel:0};const _vpmc=_S.ventesParMagasinByCanal[_storeKey][canal][codeArt];_vpmc.sumCA+=caLigne;_vpmc.sumPrelevee+=_rcp;_vpmc.countBL++;const _vmbPH=_rvp;const _vmbEH=_rve;_vpmc.sumVMB+=_vmbPH+_vmbEH;_vpmc.sumVMBPrel+=_vmbPH;}
        }
        continue;
      }
      const rawArt=_ra;const code=cleanCode(rawArt);const qteP=_rqp;const qteE=_rqe;const caP=_rcp;const caE=_rce;const sk=_rs;
      if(code&&!_S.libelleLookup[code]){const si=rawArt.indexOf(' - ');if(si>0)_S.libelleLookup[code]=rawArt.substring(si+3).trim();}
      const famConso=((CI.famille!==null?(row[CI.famille]??''):'')||(CI.univers!==null?(row[CI.univers]??''):'')||'').toString().trim();const _codeFamConso=(CI.codeFam!==null?(row[CI.codeFam]??''):'').toString().trim();const _famCode=_codeFamConso||extractFamCode(famConso);if(_famCode&&code)_S.articleFamille[code]=_famCode;const _uv2=(CI.univers!==null?(row[CI.univers]??''):'').toString().trim();const _cf2=_codeFamConso||'';const univConso=_uv2||(_cf2?FAM_LETTER_UNIVERS[_cf2[0].toUpperCase()]||'Inconnu':'');if(univConso&&code)_S.articleUnivers[code]=univConso;
      if(dateV){const ts=dateV.getTime();if(ts<minDateVente)minDateVente=ts;if(ts>maxDateVente)maxDateVente=ts;}
      // Hoistés avant le filtre période : invariants (W/V/MIN/MAX), ventesClientArticleFull
      const cc2=extractClientCode(_rc);const nc=(_hasCommandeCol?(_rncb||''):('__r'+j)).toString().trim()||('__r'+j);
      if(!isRefilter&&dateV&&code&&(!_S.selectedMyStore||sk===_S.selectedMyStore)&&qteP>0){if(!monthlySales[code])monthlySales[code]=new Array(12).fill(0);monthlySales[code][dateV.getMonth()]+=qteP;}
      if(!isRefilter&&(!useMulti||sk===_S.selectedMyStore)){if(!articleRaw[code])articleRaw[code]={tpp:0,tpn:0,te:0,bls:{},cbl:0};const a=articleRaw[code];if(qteP>0)a.tpp+=qteP;if(qteP<0)a.tpn+=qteP;if(qteE>0)a.te+=qteE;if(!a.bls[nc]){a.bls[nc]={p:Math.max(qteP,0),e:Math.max(qteE,0)};a.cbl++;}else{const ex=a.bls[nc];if(Math.max(qteP,0)>ex.p)ex.p=Math.max(qteP,0);if(Math.max(qteE,0)>ex.e)ex.e=Math.max(qteE,0);}}
      if(!isRefilter&&cc2&&code&&(!_S.selectedMyStore||sk===_S.selectedMyStore)){if(!_S.ventesClientArticleFull.has(cc2))_S.ventesClientArticleFull.set(cc2,new Map());const _artF=_S.ventesClientArticleFull.get(cc2);if(!_artF.has(code))_artF.set(code,{sumPrelevee:0,sumCAPrelevee:0,sumCA:0,sumCAAll:0,countBL:0});const _eF=_artF.get(code);if(qteP>0){_eF.sumPrelevee+=qteP;_eF.sumCAPrelevee+=caP;}_eF.sumCA+=caP+caE;if(qteP>0||qteE>0)_eF.countBL++;}
      if(_S.periodFilterStart&&dateV&&dateV<_S.periodFilterStart)continue;
      if(_S.periodFilterEnd&&dateV&&dateV>_S.periodFilterEnd)continue;
      if(_S.storesIntersection.has(sk)||!_S.storesIntersection.size){if(!_S.ventesParMagasin[sk])_S.ventesParMagasin[sk]={};if(!_S.ventesParMagasin[sk][code])_S.ventesParMagasin[sk][code]={sumPrelevee:0,sumEnleve:0,sumCA:0,countBL:0,sumVMB:0};if(qteP>0)_S.ventesParMagasin[sk][code].sumPrelevee+=qteP;if(qteE>0)_S.ventesParMagasin[sk][code].sumEnleve+=qteE;_S.ventesParMagasin[sk][code].sumCA+=caP+caE;if(qteP>0||qteE>0)_S.ventesParMagasin[sk][code].countBL++;_S.ventesParMagasin[sk][code].sumVMB+=_rvp+_rve;if(canal){const _bck=_S.ventesParMagasin[sk][code];if(!_bck.byCanal)_bck.byCanal={};if(!_bck.byCanal[canal])_bck.byCanal[canal]={sumPrelevee:0,sumCA:0,countBL:0,sumVMB:0};const _bc=_bck.byCanal[canal];if(qteP>0)_bc.sumPrelevee+=qteP;_bc.sumCA+=caP+caE;if(qteP>0||qteE>0)_bc.countBL++;_bc.sumVMB+=_rvp+_rve;}if(code&&(!canal||canal==='MAGASIN')){const _canalKey='MAGASIN';if(!_S.ventesParMagasinByCanal[sk])_S.ventesParMagasinByCanal[sk]={};if(!_S.ventesParMagasinByCanal[sk][_canalKey])_S.ventesParMagasinByCanal[sk][_canalKey]={};if(!_S.ventesParMagasinByCanal[sk][_canalKey][code])_S.ventesParMagasinByCanal[sk][_canalKey][code]={sumCA:0,sumPrelevee:0,countBL:0,sumVMB:0,sumVMBPrel:0};const _vpmc2=_S.ventesParMagasinByCanal[sk][_canalKey][code];_vpmc2.sumCA+=caP+caE;_vpmc2.sumPrelevee+=caP;if(qteP>0||qteE>0)_vpmc2.countBL++;const _vmbP2=_rvp;const _vmbE2=_rve;_vpmc2.sumVMB+=_vmbP2+_vmbE2;_vpmc2.sumVMBPrel+=_vmbP2;}}
      // V2 Phase 1: DataStore.ventesClientArticle (myStore only) + _S.ventesClientsPerStore (all stores)
      // cc2 et nc déclarés avant le filtre période (hoistés pour W/V/MIN/MAX et ventesClientArticleFull)
      if(cc2&&code){if(!_S.ventesClientsPerStore[sk])_S.ventesClientsPerStore[sk]=new Set();_S.ventesClientsPerStore[sk].add(cc2);}
      // _S.clientsMagasin : clients du consommé de l'agence sélectionnée uniquement (après filtre canal+store)
      if(cc2&&(!_S.selectedMyStore||sk===_S.selectedMyStore)){_S.clientsMagasin.add(cc2);const _nc4m=_rncb||('__row_'+j);if(!_clientMagasinBLsTemp.has(cc2))_clientMagasinBLsTemp.set(cc2,new Set());_clientMagasinBLsTemp.get(cc2).add(_nc4m);}
      // clientNomLookup already populated above (before canal split) for ALL canals
      // ventesClientArticle = MAGASIN uniquement (garde canal déjà assuré par continue ligne 1594)
      // sumCA inclut les avoirs (qteP<0) pour refléter le CA net réel comme Qlik
      if(cc2&&code&&(!_S.selectedMyStore||sk===_S.selectedMyStore)){if(!DataStore.ventesClientArticle.has(cc2))DataStore.ventesClientArticle.set(cc2,new Map());const artMap=DataStore.ventesClientArticle.get(cc2);if(!artMap.has(code))artMap.set(code,{sumPrelevee:0,sumCAPrelevee:0,sumCA:0,sumCAAll:0,countBL:0});const e=artMap.get(code);if(qteP>0){e.sumPrelevee+=qteP;e.sumCAPrelevee+=caP;}e.sumCA+=caP+caE;if(qteP>0||qteE>0)e.countBL++;}
      if((!_S.selectedMyStore||sk===_S.selectedMyStore)){const _nc3=_rnc;if(_nc3)commandesPDV.add(_nc3);}
      if((!_S.selectedMyStore||sk===_S.selectedMyStore)&&(qteP>0||qteE>0)){if(cc2&&dateV&&!isNaN(dateV.getTime()))passagesUniques.add(cc2+'_'+formatLocalYMD(dateV));}
      if(cc2&&dateV&&(!_S.selectedMyStore||sk===_S.selectedMyStore)){const prev=_S.clientLastOrder.get(cc2);if(!prev||dateV>prev)_S.clientLastOrder.set(cc2,dateV);}
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
      // Fusion sumCAAll : enrichir ventesClientArticle avec les CA tous canaux (seuls les clients MAGASIN existants)
      for(const [_cc,_arts] of _tempCAAll){if(!_S.ventesClientArticle.has(_cc))continue;const _cMap=_S.ventesClientArticle.get(_cc);for(const [_code,_ca] of _arts){const _e=_cMap.get(_code);if(_e)_e.sumCAAll+=_ca;}}
      // Fusion sumCAAll pleine période dans ventesClientArticleFull
      if(!isRefilter){for(const [_cc,_arts] of _tempCAAllFull){if(!_S.ventesClientArticleFull.has(_cc))continue;const _cMap=_S.ventesClientArticleFull.get(_cc);for(const [_code,_ca] of _arts){const _e=_cMap.get(_code);if(_e)_e.sumCAAll+=_ca;}}}
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
      const _sd0=_S.ventesParMagasin[_S.selectedMyStore]||{};const _caCalc=Object.values(_sd0).reduce((s,v)=>s+(v.sumCA||0),0);const _vmbCalc=Object.values(_sd0).reduce((s,v)=>s+(v.sumVMB||0),0);
      _S.ventesAnalysis={refParBL:totalBLs>0?(sumRefParBL/totalBLs).toFixed(1):0,famParBL:totalBLs>0?(sumFamParBL/totalBLs).toFixed(1):0,totalBL:totalBLs,refActives:Object.values(synth).filter(s=>s.sumP>0||s.sumE>0).length,attractivite:famBLcount,nbPassages:passagesUniques.size,txMarge:_caCalc>0?_vmbCalc/_caCalc*100:null,vmc:commandesPDV.size>0?_caCalc/commandesPDV.size:null};

      let familles=new Set(),sousFamilles=new Set(),emplacements=new Set(),statuts=new Set();
      if(!isRefilter) _S._pushedCodes=new Set(); // reset dédup avant le bloc stock (interdit le double-push inter-appels)
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
      if(_S._pushedCodes.has(code))continue; _S._pushedCodes.add(code);
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

      // Re-parse livraisons + benchmark — skipped for isRefilter (period-independent)
      // Chalandise : géré dans _postParseMain (point d'entrée principal)
      if(!isRefilter){
        {const fL=document.getElementById('fileLivraisons').files[0];if(fL&&!_S.livraisonsReady&&!_S._livraisonsLoading){_S._livraisonsLoading=true;try{await parseLivraisons(fL);}finally{_S._livraisonsLoading=false;}}}
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
        if(useMulti){document.getElementById('btnTabReseau').classList.remove('hidden');buildBenchCheckboxes();}else document.getElementById('btnTabReseau').classList.add('hidden');
        const _terrBtn=document.getElementById('btnTabCommerce');_terrBtn.classList.remove('hidden');
        const _clientsBtn=document.getElementById('btnTabClients');if(_clientsBtn)_clientsBtn.classList.remove('hidden');
        const terrNoC=document.getElementById('terrNoChalandise');if(terrNoC)terrNoC.classList.toggle('hidden',_S.chalandiseReady);
      }
      // Render main UI immediately — don't wait for territoire
      computeClientCrossing();computeReconquestCohort();
      if(!isRefilter&&_S.chalandiseReady)_computeChalandiseDistances();
      // caByArticleCanal — skipped for isRefilter (ventesClientHorsMagasin unchanged)
      if (!isRefilter && _S.chalandiseReady) _rebuildCaByArticleCanal();
      if(_S.chalandiseReady&&DataStore.ventesClientArticle.size>0){launchClientWorker().then(()=>{computeOpportuniteNette();computeOmniScores();computeFamillesHors();generateDecisionQueue();renderIRABanner();renderTabBadges();updateLaboTiles();showToast('📊 Agrégats clients calculés','success');if(!isRefilter&&_S.selectedMyStore)_saveSessionToIDB();}).catch(err=>console.warn('Client worker error:',err));}
      _S.currentPage=0;if(isRefilter&&useMulti){invalidateCache('bench');const _rcp=(_S._reseauCanaux||new Set()).size===1?[...(_S._reseauCanaux||new Set())][0]:null;computeBenchmark(_rcp);}if(isRefilter){renderCanalAgence();renderCurrentTab();renderIRABanner();}else{renderAll();}if(useMulti){_buildObsUniversDropdown();buildBenchBassinSelect();renderBenchmark();launchReseauWorker().then(()=>{renderNomadesMissedArts();}).catch(err=>console.warn('Réseau worker error:',err));}
      if(!isRefilter){_syncTabAccess();}
      if(_autoYTD){setPeriodePreset('YTD');}
      updateProgress(100,100,'✅ Prêt !',elapsed+'s');await new Promise(r=>setTimeout(r,400));
      renderSidebarAgenceSelector();
      if(!isRefilter){switchTab('labo');btn.textContent='✅ '+elapsed+'s';btn.classList.replace('s-panel-inner','bg-emerald-600');const _nbF=2+(document.getElementById('fileLivraisons')?.files[0]?1:0)+(document.getElementById('fileChalandise').files[0]?1:0);collapseImportZone(_nbF,_S.selectedMyStore,DataStore.finalData.length,elapsed);const btnR=document.getElementById('btnRecalculer');if(btnR)btnR.classList.remove('hidden');}else{btn.textContent='✅ '+elapsed+'s';btn.classList.replace('s-panel-inner','bg-emerald-600');}
      // IDB save — skipped for isRefilter (only saves on full load)
      if (!isRefilter && _S.selectedMyStore) { localStorage.setItem('prisme_selectedStore', _S.selectedMyStore); _saveToCache(); _saveSessionToIDB(); if(_f1)_saveFileHashes(_f1,_f2,document.getElementById('fileChalandise').files[0]||null); }
    }catch(error){if(error.message==='NO_STORE_SELECTED')return;showToast('❌ '+error.message,'error');console.error(error);btn.textContent='❌';btn.classList.replace('s-panel-inner','bg-red-600');}
    finally{btn.disabled=false;hideLoading();}
    if(isRefilter&&_S.territoireReady){renderTerritoireTab();}
  }



  // V24.4+: Render canal distribution block — enriched with prélevé/enlevé CA

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
    // Update cockpitCounts + pills
    if(_S.cockpitCounts){_S.cockpitCounts.saison=candidats.length;_renderStockPills();}
    el.classList.remove('hidden');
    // Section articles saisonniers
    const artSection = document.getElementById('saisonArtSection');
    if (artSection) {
      if (candidats.length === 0) { artSection.innerHTML = ''; }
      else {
        const _isPeriodFiltered = _S.periodFilterStart || _S.periodFilterEnd;
        const saisonRows = candidats.slice(0, 30).map(r => {
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
        artSection.innerHTML = `
          <p class="text-[11px] text-amber-600 mb-1 italic">Indicatif uniquement — stock sous le seuil saisonnier pour ce mois.</p>
          ${_isPeriodFiltered?'<p class="text-[11px] text-orange-600 font-semibold mb-3">⚠️ MIN/MAX non recalcules sur cette periode.</p>':''}
          <div class="bg-amber-50 p-5 rounded-xl border-t-4 border-amber-400">
            <div class="flex items-center justify-between mb-3">
              <h3 class="font-bold text-amber-800 flex items-center gap-1">📅 ${nomsMois[mois]} — Articles sous seuil saisonnier</h3>
              <button onclick="exportSaisonCSV()" class="text-[11px] bg-amber-200 text-amber-800 font-bold px-3 py-1 rounded hover:bg-amber-300 transition-colors">⬇️ Export CSV</button>
            </div>
            <div class="list-scroll"><table class="min-w-full text-xs"><thead class="bg-amber-100 text-amber-800 sticky top-0"><tr><th class="py-2 px-2 text-left">Code</th><th class="py-2 px-2 text-left">Libelle</th><th class="py-2 px-2 text-center">Stock</th><th class="py-2 px-2 text-center">Seuil mois</th><th class="py-2 px-2 text-center">A commander</th><th class="py-2 px-2 text-right">Valeur est.</th></tr></thead><tbody class="divide-y divide-amber-100">${saisonRows}</tbody></table></div>
          </div>`;
      }
    }
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

    {const _dtv=document.getElementById('dashTotalValue');if(_dtv)_dtv.textContent=formatEuro(totalValue);const _dtc=document.getElementById('dashTotalCount');if(_dtc)_dtc.textContent=dataSource.length.toLocaleString('fr')+' réf.';}
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
        colisContainer.innerHTML=`<div class="i-info-bg rounded-xl border-t-4 border-cyan-500">
          <div class="flex items-center justify-between px-4 py-3">
            <span class="font-bold t-primary flex items-center gap-2">📦→🏪 Colis a stocker <span class="badge bg-cyan-500 text-white">${sorted.length}</span></span>
            <span class="cockpit-link bg-cyan-200 text-cyan-800 cursor-pointer" onclick="showCockpitInTable('colisrayon');switchTab('table')">📋 Voir dans Articles</span>
          </div>
          <div class="px-5 pb-5"><p class="text-[11px] t-secondary mb-3">≥5 enleves, 0 preleve — 📦 stock=0 a mettre en rayon · 👁️ stock>0 a rendre visible.</p>
            <div class="list-scroll"><table class="min-w-full text-xs"><thead class="i-info-bg t-secondary sticky top-0"><tr><th class="py-2 px-2">Code / Libelle</th><th class="py-2 px-2 text-center">Colis</th><th class="py-2 px-2 text-right">Stock</th><th class="py-2 px-2 text-center">Action</th></tr></thead><tbody id="actionColisRayon" class="divide-y b-light">${rows.join('')}</tbody></table></div>
          </div>
        </div>`;
      } else if(colisContainer){colisContainer.innerHTML='';}
    })();

    renderCockpitEquation();
    // ★★★ V23/V24.2: RÉSUMÉ EXÉCUTIF ★★★
    if(dataSource===DataStore.finalData){_S._insights.ruptures=lstR.length;_S._insights.dormants=lstD.length;renderInsightsBanner();}
    // ★ SPRINT 1: Decision Queue + Briefing (absorbe le résumé exécutif) ★
    _S._briefingData={lstR,totalCAPerdu,dormantStock,capalinOverflow,sr,hasMulti,caComptoir:_S.canalAgence?.['MAGASIN']?.ca||0};
    generateDecisionQueue();
    renderHealthScore();
    renderIRABanner();
    renderTabBadges();

    // ── Bandeau hero Santé + Valeur Stock ──
    {const heroEl=document.getElementById('stockHeroContent');
    if(heroEl){
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
      const _pills=_dims.map(d=>`<span class="text-[10px] px-2 py-0.5 rounded-full border ${d.ok?'border-emerald-300 text-emerald-700 bg-emerald-50':'border-orange-300 text-orange-700 bg-orange-50'}">${d.label} : <strong>${typeof d.val==='number'?d.val.toLocaleString('fr'):d.val}</strong></span>`).join('');
      heroEl.innerHTML=`
        <div class="flex flex-wrap items-center gap-6">
          <div class="flex items-center gap-3 min-w-[200px]">
            <span class="text-3xl">${_ico}</span>
            <div>
              <p class="text-[10px] font-bold t-tertiary uppercase tracking-wide">Sante Stock</p>
              <p class="text-2xl font-extrabold" style="color:${_col}">${_score}<span class="text-sm font-normal t-disabled">/100</span></p>
            </div>
            <div class="flex flex-col items-center gap-0.5 ml-1">
              <div class="w-20 h-2.5 rounded-full bg-gray-200 overflow-hidden">
                <div class="h-full rounded-full" style="width:${_score}%;background:${_col}"></div>
              </div>
              <span class="text-[9px] font-bold" style="color:${_col}">${_lbl}</span>
            </div>
          </div>
          <div class="flex items-center gap-4 cursor-pointer select-none hover:opacity-80" onclick="switchTab('table')" title="→ Voir tous les articles">
            <div class="bg-gradient-to-br from-blue-600 to-blue-800 rounded-xl px-5 py-3 text-white shadow-lg">
              <p class="text-[9px] font-bold uppercase text-blue-200 mb-0.5">Valeur stock</p>
              <p class="text-xl font-extrabold tracking-tight">${formatEuro(totalValue)}</p>
              <p class="text-blue-200 text-[10px] mt-0.5">${dataSource.length.toLocaleString('fr')} réf. · ✅ Dispo. ${sr}%</p>
            </div>
          </div>
        </div>
        <div class="flex flex-wrap gap-1.5 mt-3">${_pills}</div>`;
    }}

    // ── Sidebar pills ──
    const _saisonCount=Object.keys(_S.seasonalIndex).length>0?_getSaisonCandidats().length:0;
    _S.cockpitCounts={ruptures:lstR.length,stockneg:lstStockNeg.length,sansemplacement:lstFa.length,anomalies:lstA.length,dormants:lstD.length,fins:lstFi.length,saison:_saisonCount,saso:lstS.length,colis:lstColis.length,rupClients:0};
    {const ruptureArts=dataSource.filter(r=>r.stockActuel<=0&&r.W>=3&&!r.isParent&&!(r.V===0&&r.enleveTotal>0));const _rcSet=new Set();for(const art of ruptureArts){const buyers=_S.articleClients.get(art.code);if(buyers)for(const cc of buyers)_rcSet.add(cc);}_S.cockpitCounts.rupClients=_rcSet.size;}
    _renderStockPills();
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
      {icon:'🌸',label:'Saisonnalite',count:c.saison||0,color:'#d97706',cockpit:null},
      {icon:'📦',label:'Excedent ERP',count:c.saso||0,color:'#7c3aed',cockpit:'saso'},
      {icon:'📦→🏪',label:'Colis a stocker',count:c.colis||0,color:'#0891b2',cockpit:'colisrayon'},
      {icon:'👥',label:'Clients impactes',count:c.rupClients||0,color:'#dc2626',cockpit:null},
    ];
    el.innerHTML=pills.map(p=>{
      const grayed=p.count===0?'opacity-40':'';
      const onclick=p.cockpit?`onclick="showCockpitInTable('${p.cockpit}');switchTab('table')"`:'';
      return `<div class="flex items-center justify-between px-2 py-1.5 rounded-lg cursor-pointer hover:s-hover transition-colors ${grayed}" ${onclick}>
        <span class="text-[10px] flex items-center gap-1.5"><span>${p.icon}</span><span class="font-semibold" style="color:${p.color}">${p.label}</span></span>
        <span class="text-[11px] font-extrabold" style="color:${p.color}">${p.count}</span>
      </div>`;
    }).join('');
  }


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
    // Count badge: classified vs total
    const _allFd=DataStore.finalData;const _nbClassified=_allFd.filter(r=>r.abcClass&&r.fmrClass).length;
    const _countBadge=document.getElementById('abcCountBadge');
    if(_countBadge){if(_nbClassified<_allFd.length)_countBadge.textContent=`${_nbClassified.toLocaleString('fr-FR')} / ${_allFd.length.toLocaleString('fr-FR')} articles classés`;else _countBadge.textContent='';}
    _renderGhostArticles();
    renderPlanRayon();
    renderArbitrageRayonBlock();
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
    // Attractivité par Famille (migrée depuis Mon Stock)
    const atEl=document.getElementById('dashAttractTable');if(atEl){const va=_S.ventesAnalysis;const totalBL2=va.totalBL||1;const p2=[];Object.entries(va.attractivite).sort((a,b)=>b[1]-a[1]).forEach(([fam,count])=>{const rate=((count/totalBL2)*100).toFixed(1);const barW=Math.min(parseFloat(rate),100);p2.push(`<tr class="border-b hover:bg-pink-50"><td class="py-2 px-3 text-[11px] font-semibold truncate max-w-[200px]" title="${escapeHtml(fam)}">${escapeHtml(fam)}</td><td class="py-2 px-3 text-center t-secondary text-xs">${count.toLocaleString('fr')}</td><td class="py-2 px-3 text-right"><div class="flex items-center gap-1 justify-end"><div class="w-16 s-hover rounded-full h-1.5"><div class="perf-bar bg-pink-500 rounded-full" style="width:${barW}%"></div></div><span class="text-pink-700 font-bold text-[10px] min-w-[35px] text-right">${rate}%</span></div></td></tr>`);});atEl.innerHTML=p2.join('')||'<tr><td colspan="3" class="text-center py-4 t-disabled text-xs">Aucune donnée famille</td></tr>';}
  }

  // ── Vue "Clients PDV" (V4) ─────────────────────────────────────────

  async function renderCurrentTab(){
    const activeBtn=document.querySelector('.tab-btn.active');
    const id=activeBtn?activeBtn.getAttribute('data-tab'):'table';
    switch(id){
      case 'table':
        renderTable(true); // articles always re-renders; no cache flag
        return;
      case 'stock':
        renderDashboardAndCockpit();
        renderABCTab();
        renderHealthScore();
        renderTabBadges();
        break;
      case 'commerce':
        renderTerritoireTab();
        break;
      case 'omni':
        renderCockpitEquation();
        renderOmniTab();
        break;
      case 'reseau':
        renderBenchmark();
        break;
      case 'clients':
        renderCommerceTab();
        break;
      case 'animation':
        await renderAnimationTab();
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
  // Chargement catalogue en arrière-plan (marques, familles, désignations)
  loadCatalogueMarques().catch(e => console.warn('[PRISME] Catalogue non chargé:', e));

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
      if(useMulti){document.getElementById('btnTabReseau').classList.remove('hidden');buildBenchCheckboxes();}
      else{document.getElementById('btnTabReseau').classList.add('hidden');}
      document.getElementById('btnTabCommerce').classList.remove('hidden');
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
        }).catch(err=>console.warn('Réseau worker error (IDB restore):',err));
      }
      if(_S.territoireReady){renderTerritoireTab();}

      // 5. Activer PRISME + replier l'import
      switchTab('labo');
      collapseImportZone();
      // Période complète par défaut — refilter instantané via byMonth si l'utilisateur change
      _S.periodFilterStart = null;
      _S.periodFilterEnd   = null;
      if(!_S.ventesClientArticleFull.size&&_S.ventesClientArticle.size){
        _S.ventesClientArticleFull=new Map([..._S.ventesClientArticle].map(([cc,arts])=>[cc,new Map(arts)]));
      }
      invalidateCache('tab','terr');buildPeriodFilter();
      renderCanalAgence();renderCurrentTab();renderIRABanner();

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
  // Parser immédiatement seulement si les données sont déjà chargées (recalcul à chaud).
  // Sinon, _postParseMain appellera parseChalandise après Analyser — évite le double parse.
  if (DataStore.finalData.length === 0) return;
  if (_S._chalandiseLoading || _S.chalandiseReady) return;
  _S._chalandiseLoading = true;
  try { await parseChalandise(input.files[0]); } finally { _S._chalandiseLoading = false; }
  if (_S.storesIntersection.size > 1) { computeBenchmark(_S._globalCanal || null); renderBenchmark(); }
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
window._toggleHorsAgence = function() {
  _S._filterHorsAgence = !_S._filterHorsAgence;
  const btn = document.querySelector('[onclick*="_toggleHorsAgence"]');
  if (btn) btn.classList.toggle('active', _S._filterHorsAgence);
  onFilterChange();
};
window._toggleHorsZone   = function(){window._setClientView(_S._clientView==='horszone'?'tous':'horszone');};
window._toggleDormants   = function(){window._setClientView(_S._clientView==='dormants'?'tous':'dormants');};
window._toggleOmniSegment = function(seg){_S._omniSegmentFilter=(_S._omniSegmentFilter===seg)?'':seg;renderCurrentTab();};
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
window._setGlobalMagasinMode = function(mode){_S._reseauMagasinMode=mode;invalidateCache('all');[['globalMagModeAll','all'],['globalMagModePrel','preleve'],['globalMagModeEnl','enleve']].forEach(([id,m])=>{const el=document.getElementById(id);if(el)el.classList.toggle('active',(mode||'all')===m);});window._refilterFromByMonth?.();if(typeof window.renderCurrentTab==='function')window.renderCurrentTab();};
window._setReseauFamFilter = function(fam){_S._reseauMissedFamFilter=fam;_S._reseauMissedPage=0;_S._reseauUnderPage=0;_S._reseauMissedShowAll=false;_S._reseauUnderShowAll=false;renderBenchmark();};
// (moved to ACTION_REGISTRY: _reseauShowAll, _reseauPage)
window.benchMissedSort = function(col){const cur=_S._missedSortCol||'freq';_S._missedSortDir=cur===col&&_S._missedSortDir!=='asc'?'asc':'desc';_S._missedSortCol=col;_S._reseauMissedPage=0;_S._reseauMissedShowAll=false;renderBenchmark();};
window.setRankSortKey = function(val){_S._rankSortKey=val;renderBenchmark();};
window.buildBenchBassinSelect = buildBenchBassinSelect;
window.renderReseauHeatmap = renderReseauHeatmap;
window.renderReseauNomades = renderReseauNomades;

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
window.renderMesClients = renderCommerceTab;
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
