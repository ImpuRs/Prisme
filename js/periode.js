// © 2026 Jawad El Barkaoui — Tous droits réservés
// PRISME — periode.js
// Filtre période global : sélecteur, applyPeriodFilter, refilter depuis _byMonth
// Extrait de main.js (oct. 2026). Les fonctions restent exposées via window.* dans main.js.
// ═══════════════════════════════════════════════════════════════
'use strict';

import './constants.js';
import { fmtDate } from './utils.js';
import { _S, invalidateCache } from './state.js';
import { enrichPrixUnitaire, computeClientCrossing } from './engine.js';
import { computeBenchmark } from './parser.js';
import { showToast, showLoading, hideLoading, updatePeriodAlert } from './ui.js';
import { _saveSessionToIDB } from './cache.js';
import { getVentesClientMagFull, hasVentesClientMagFull } from './sales.js';
import './helpers.js';
import { buildClientStore } from './client-store.js';
import './chalandise-store.js';
import './agence-store.js';
import './store.js';
import './diagnostic.js';
import './planRayon.js';
import './arbitrage.js';
import './minmax.js';
import './clients-decisions.js';
import './animation.js';
import './partie.js';
import './commerce.js';
import { _computeClientDominantUnivers, _enrichFinalDataWithCA, _hydrateStateFromParseResult, launchParseWorkerFromFiles, processDataFromRaw } from './pipeline.js';
import { renderCurrentTab } from './render-stock.js';

  // ── Filtre période global ──
  export function toggleTabPeriodDropdown(){
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
  export function applyPeriodFilter(startTs,endTs){
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
      renderCurrentTab();
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
          const _savedHorsFull=_S.ventesLocalHorsMagFull;
          const _savedLastOrderAll=_S.clientLastOrderAll;
          const _savedLastOrderByCanal=_S.clientLastOrderByCanal;
          _hydrateStateFromParseResult(parseResult,_S.selectedMyStore);
          // Restaurer les invariants période (hors-MAGASIN ne change pas au refilter)
          if(!_S.ventesLocalMag12MG.size&&_savedFull.size)_S.ventesLocalMag12MG=_savedFull;
          if(!_S.ventesLocalHorsMag.size&&_savedHors.size)_S.ventesLocalHorsMag=_savedHors;
          if(!_S.ventesLocalHorsMagFull?.size&&_savedHorsFull?.size)_S.ventesLocalHorsMagFull=_savedHorsFull;
          if(!_S.clientLastOrderAll.size&&_savedLastOrderAll.size)_S.clientLastOrderAll=_savedLastOrderAll;
          if(!_S.clientLastOrderByCanal.size&&_savedLastOrderByCanal.size)_S.clientLastOrderByCanal=_savedLastOrderByCanal;
          enrichPrixUnitaire();_enrichFinalDataWithCA();
          if(!_S.lowMemMode&&_S.storesIntersection.size>1&&_S.selectedMyStore){invalidateCache('bench');computeBenchmark();}
          if(!_S.lowMemMode){computeClientCrossing();_computeClientDominantUnivers();}
          renderCurrentTab();

        }catch(err){showToast('⚠️ Erreur refilter: '+err.message,'warning');renderCurrentTab();}
        finally{hideLoading();}
      })();
    }else{
      // Données brutes non disponibles (session restaurée depuis IDB) — re-render léger
      showToast('⚠️ Agrégats figés — rechargez le fichier consommé pour recalculer sur cette période','warning');
      renderCurrentTab();
    }
  }

  // ── _refilterFromByMonth — reconstruction instantanée ventesLocalMagPeriode + canalAgence ──
  // Appelé quand _S._byMonth est disponible. Opère en <100ms sans re-lancer le Worker.
  let _refilterRunning=false;
  export function _refilterFromByMonth(){
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
  export function _buildPeriodeOptions(){
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
  export function _applyPeriode(start,end){
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

  export function buildPeriodFilter(){
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
