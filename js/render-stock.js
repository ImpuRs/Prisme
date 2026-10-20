// © 2026 Jawad El Barkaoui — Tous droits réservés
// PRISME — render-stock.js
// Rendus stock : tableau de bord, Base articles (renderTable), ABC, renderCurrentTab
// Extrait de main.js (oct. 2026). Les fonctions restent exposées via window.* dans main.js.
// ═══════════════════════════════════════════════════════════════
'use strict';

import { PAGE_SIZE, DORMANT_DAYS, AGE_BRACKETS } from './constants.js';
import { formatEuro, pct, getAgeBracket, getAgeLabel, _median, _copyCodeBtn, _copyAllCodesDirect, escapeHtml, defaultPeriodRange, isShortAutoPeriod, famLib, famLabel, sortRowsInPlace } from './utils.js';
import { _S, invalidateCache } from './state.js';
import { calcPriorityScore, formatCouv, computeClientCrossing, _radarComputeMatrix, computeReconquestCohort, computeOpportuniteNette, computeAnglesMorts, resetBenchMetierCache, computeOmniScores, computeSquelette, isInvendu, isSurStock, excedentSurStock } from './engine.js';
import { loadCpCoords, _computeChalandiseDistances } from './parser.js';
import { showToast, collapseImportZone, switchTab, populateSelect, getFilteredData, onFilterChange, resetFilters, filterByAge, updateActiveAgeIndicator, filterByAbcFmr, showCockpitInTable, clearCockpitFilter, updatePeriodAlert, renderInsightsBanner, renderTableContext, renderHealthScore, renderTabBadges, _renderNoStockPlaceholder, renderCockpitBriefing, buildSqLookup, initColSelector, _applyColVisibility } from './ui.js';
import { _restoreFromCache, _showCacheBanner, _restoreExclusions, _restoreSessionFromIDB, _clearIDB, _migrateIDB } from './cache.js';
import { getArticleLastSaleMonthIdx, monthIdxFromDate } from './sales.js';
import './helpers.js';
import { buildClientStore } from './client-store.js';
import { applyForcageCommercial as _applyForcageCommercial } from './chalandise-store.js';
import { buildAgenceStore } from './agence-store.js';
import { DataStore } from './store.js';
import { openDiagnostic, openArticlePanel, _renderDiagnosticCellPanel } from './diagnostic.js';
import { renderPlanRayon } from './planRayon.js';
import { renderArbitrageTab } from './arbitrage.js';
import { renderEssaiTab } from './stock-lab.js';
import { renderTesClients } from './clients-decisions.js';
import { renderAnimationTab, loadCatalogueMarques } from './animation.js';
import { renderAssociationsTab } from './associations.js';
import { renderPartieTab } from './partie.js';
import { renderCanalAgence, renderOmniTab } from './omni.js';
import { _renderGhostArticles } from './territoire.js';
import './commerce.js';
import { renderSidebarAgenceSelector } from './main.js';
import { applyPeriodFilter, buildPeriodFilter } from './periode.js';
import { _computeClientDominantUnivers, _enrichPullIndex, _rebuildCaByArticleCanal, _syncTabAccess } from './pipeline.js';

  export function renderComparison(currentKPI){const prev=_S.kpiHistory.length>0?_S.kpiHistory[_S.kpiHistory.length-1]:null;_S.kpiHistory.push(currentKPI);while(_S.kpiHistory.length>12)_S.kpiHistory.shift();if(!prev){document.getElementById('compareBlock').classList.add('hidden');return;}document.getElementById('compareBlock').classList.remove('hidden');document.getElementById('compareDate').textContent='(réf: '+prev.date+')';const metrics=[{label:'💰 Stock',cur:currentKPI.totalValue,old:prev.totalValue,fmt:'euro',better:'down'},{label:'☠️ Dormant',cur:currentKPI.dormant,old:prev.dormant,fmt:'euro',better:'down'},{label:'📊 Surstock',cur:currentKPI.surstock,old:prev.surstock,fmt:'euro',better:'down'},{label:'🚨 Ruptures',cur:currentKPI.ruptures,old:prev.ruptures,fmt:'num',better:'down'},{label:'✅ Dispo.',cur:currentKPI.serviceRate,old:prev.serviceRate,fmt:'pct',better:'up'},{label:'👁️ Excédent ERP',cur:currentKPI.capalin,old:prev.capalin,fmt:'euro',better:'down'},{label:'💸 CA Perdu',cur:currentKPI.caPerdu||0,old:prev.caPerdu||0,fmt:'euro',better:'down'}];const p=[];for(const m of metrics){const diff=m.cur-m.old;const isGood=(m.better==='down'&&diff<=0)||(m.better==='up'&&diff>=0);const arrow=diff>0?'▲':diff<0?'▼':'■';const color=diff===0?'t-tertiary':isGood?'c-ok':'c-danger';const bg=diff===0?'s-card-alt':isGood?'i-ok-bg':'i-danger-bg';let diffStr='';if(m.fmt==='euro')diffStr=(diff>0?'+':'')+formatEuro(diff);else if(m.fmt==='pct')diffStr=(diff>0?'+':'')+diff.toFixed(1)+'%';else diffStr=(diff>0?'+':'')+diff;let curStr='';if(m.fmt==='euro')curStr=formatEuro(m.cur);else if(m.fmt==='pct')curStr=m.cur.toFixed(1)+'%';else curStr=m.cur;p.push('<div class="'+bg+' rounded-lg p-3 text-center border"><p class="text-[10px] font-bold t-secondary mb-1">'+m.label+'</p><p class="text-sm font-extrabold t-primary">'+curStr+'</p><p class="text-xs font-bold '+color+'">'+arrow+' '+diffStr+'</p></div>');}document.getElementById('compareCards').innerHTML=p.join('');}

  // ── Pré-calcul squelette en idle ──────────────────────────────────────────
  export function _scheduleIdleSquelette(){
    if(_S.lowMemMode)return; // mobile : éviter computeSquelette() (RAM/CPU), pas nécessaire pour Scan
    if(_S._prSqData)return; // déjà calculé
    const fn=()=>{
      if(_S._prSqData)return;
      const t0=performance.now();
      try{
        const sq=computeSquelette();
        _S._prSqData=sq;
        console.log(`[IDLE] computeSquelette ${performance.now()-t0|0}ms`);
      }catch(e){console.warn('[IDLE] computeSquelette error:',e);}
    };
    setTimeout(fn,100);
  }

  // ── Feature D — Recommandations Saisonnières ──────────────────────────────
  // Projection du mois courant depuis seasonalIndex (famille → [12 coefficients]).
  // Zéro structure _S ajoutée — calcul au render uniquement.
  // Les MIN/MAX réglementaires (ancienMin/nouveauMin) NE SONT PAS modifiés.
  // [Feature A] Retourne les mois filtrés selon _globalPeriodePreset
  // Utilisé par sparklines (diagnostic) et saisonnier widget
  export function _getFilteredMonths(code) {
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

  export function setPeriodePreset(val) {
    _S._globalPeriodePreset = val || '12M';
    const note = document.getElementById('saisonPeriodeNote');
    if (note) note.classList.toggle('hidden', _S._globalPeriodePreset === '12M');
  }
  window.setPeriodePreset = setPeriodePreset;


  export function renderDashboardAndCockpit(){
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
    _S.cockpitLists={ruptures:new Set(),fantomes:new Set(),sansemplacement:new Set(),anomalies:new Set(),saso:new Set(),dormants:new Set(),fins:new Set(),top20:new Set(),nouveautes:new Set(),colisrayon:new Set(),stockneg:new Set(),fragiles:new Set(),phantom:new Set(),invendus:new Set()};
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
    if(isInvendu(r))_S.cockpitLists.invendus.add(r.code);
    if(r.stockActuel<0){lstStockNeg.push({code:r.code,lib:r.libelle,i1:r.stockActuel,i2:formatEuro(lv),sv:lv,condit:null});_S.cockpitLists.stockneg.add(r.code);}
    if(r.stockActuel>0&&r.prixUnitaire>0){totalArt++;byStatus[r.statut]=(byStatus[r.statut]||0)+lv;const _fLib=famLib(r.famille);byFamily[_fLib]=(byFamily[_fLib]||0)+lv;const isDormant=!r.isNouveaute&&r.ageJours>DORMANT_DAYS;const sl=r.statut.toLowerCase();const isFS=sl.includes('fin de série')||sl.includes('fin de serie')||sl.includes('fin de catalogue');const iFSt=sl.includes('fin de stock');const isFin=isFS||iFSt;
    if(!r.isNouveaute&&r.ageJours>DORMANT_DAYS){dormantStock+=lv;if(lv>50){lstD.push({code:r.code,lib:r.libelle,i1:r.stockActuel,i2:formatEuro(lv),sv:lv,condit:null});_S.cockpitLists.dormants.add(r.code);}}
    if(!isDormant&&!isFin&&!r.isNouveaute&&r.stockActuel>r.nouveauMax&&r.nouveauMax>0)activeSurstock+=(r.stockActuel-r.nouveauMax)*r.prixUnitaire;
    if(isSurStock(r)){const exc=excedentSurStock(r),vs=exc*r.prixUnitaire;capalinOverflow+=vs;capalinCount++;lstS.push({code:r.code,lib:r.libelle,i1:exc,i2:formatEuro(vs),sv:vs,condit:null});_S.cockpitLists.saso.add(r.code);}
    const br=(r.isNouveaute&&r.ageJours>DORMANT_DAYS)?'fresh':getAgeBracket(r.ageJours);ageBuckets[br].val+=lv;ageBuckets[br].count++;
    if(isFin&&!finCodes.has(r.code)){finCodes.add(r.code);lstFi.push({code:r.code,lib:r.libelle,i1:r.stockActuel,i2:formatEuro(lv),sv:lv,condit:null});_S.cockpitLists.fins.add(r.code);}}
    // Fins de stock avec min=0/max=0 (déréférencés sans prix) — hors du garde prixUnitaire>0
    if(r.stockActuel>0&&!finCodes.has(r.code)){const _sl=r.statut.toLowerCase();if(_sl.includes('fin de stock')||_sl.includes('fin de série')||_sl.includes('fin de serie')||_sl.includes('fin de catalogue')){finCodes.add(r.code);lstFi.push({code:r.code,lib:r.libelle,i1:r.stockActuel,i2:formatEuro(lv),sv:lv,condit:null});_S.cockpitLists.fins.add(r.code);}}}

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

    // ── Sidebar pills ──
    _S.cockpitCounts={ruptures:lstR.length,stockneg:lstStockNeg.length,sansemplacement:lstFa.length,anomalies:lstA.length,dormants:lstD.length,fins:lstFi.length,saso:lstS.length,colis:lstColis.length,rupClients:0};
    {const ruptureArts=dataSource.filter(r=>r.stockActuel<=0&&r.W>=3&&!r.isParent&&!(r.V===0&&r.enleveTotal>0));const _rcSet=new Set();for(const art of ruptureArts){const buyers=_S.articleClients.get(art.code);if(buyers)for(const cc of buyers)_rcSet.add(cc);}_S.cockpitCounts.rupClients=_rcSet.size;}
    _renderStockPills();
    _renderDataScopeBar();
    renderCockpitBriefing();
  }


  export function _renderDataScopeBar(){
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
    if(_S.territoireReady&&_S.ventesTerrain?.length){
      let tMin=null,tMax=null;
      for(const l of _S.ventesTerrain){if(l.dateExp){if(!tMin||l.dateExp<tMin)tMin=l.dateExp;if(!tMax||l.dateExp>tMax)tMax=l.dateExp;}}
      const nbClients=new Set(_S.ventesTerrain.map(l=>l.clientCode).filter(Boolean)).size;
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

  export function _renderStockPills(){
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
      {icon:'📦',label:'Au-dessus du MAX PRISME',count:c.saso||0,color:'#7c3aed',cockpit:'saso'},
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


  export function _renderActiveFilterBadges(){
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
  export function _getFilteredCATotal(){
    const arr=DataStore.filteredData||[];
    if(arr===_lastFilteredCARef&&arr.length===_lastFilteredCALen)return _lastFilteredCATotal;
    let sum=0;
    for(let i=0;i<arr.length;i++)sum+=(arr[i].caAnnuel||0);
    _lastFilteredCARef=arr;_lastFilteredCALen=arr.length;_lastFilteredCATotal=sum;
    return sum;
  }

  // ★ TABLEAU
  // Dernière vente MAGASIN (mois écoulés) — recalculée quand l'historique change ; 999 = aucune vente
  let _lastSaleBM=null;
  export function _ensureLastSale(){
    if(_lastSaleBM===_S._byMonth&&_lastSaleBM)return;
    const last=getArticleLastSaleMonthIdx();const _d=_S.consommePeriodMaxFull||_S.consommePeriodMax;const ref=_d?monthIdxFromDate(new Date(_d)):null;
    for(const r of DataStore.finalData){const m=last?.get(r.code);r.moisSansVente=(m!=null&&ref!=null)?Math.max(0,ref-m):999;}
    _lastSaleBM=_S._byMonth;
  }
  export function _lastSaleCell(m){
    if(m>=999)return '<span class="age-dot" style="background:var(--pt-low)"></span><span title="Aucune vente MAGASIN dans tout l’historique du consommé chargé">jamais</span>';
    const c=m<=1?'var(--pt-high)':m<=5?'var(--pt-mid)':'var(--pt-low)';
    return `<span class="age-dot" style="background:${c}"></span>${m===0?'ce mois':m+' mois'}`;
  }
  export function renderTable(pageOnly){
    if(!_S._hasStock){const el=document.getElementById('tabTable');if(el&&!pageOnly)el.innerHTML=_renderNoStockPlaceholder('Articles');return;}
    _ensureLastSale();
    if(!pageOnly){
      _S.filteredData=getFilteredData(); // producteur — _S direct
      sortRowsInPlace(DataStore.filteredData,_S.sortCol,_S.sortAsc);
      updateActiveAgeIndicator();
    }
    const tp=Math.max(1,Math.ceil(DataStore.filteredData.length/PAGE_SIZE));if(_S.currentPage>=tp)_S.currentPage=tp-1;const start=_S.currentPage*PAGE_SIZE,pd=DataStore.filteredData.slice(start,start+PAGE_SIZE);
    document.getElementById('resultCount').textContent=DataStore.filteredData.length.toLocaleString('fr')+' article'+(DataStore.filteredData.length>1?'s':'');const _rStart=start+1,_rEnd=Math.min(start+PAGE_SIZE,DataStore.filteredData.length);const _pageInfoEl=document.getElementById('pageInfo');if(_pageInfoEl){_pageInfoEl.innerHTML=`Articles ${_rStart}–${_rEnd} sur ${DataStore.filteredData.length.toLocaleString('fr')}&nbsp;·&nbsp; Page <input type="number" min="1" max="${tp}" value="${_S.currentPage+1}" style="width:36px;text-align:center;font-size:11px;padding:1px 4px;border:1px solid var(--b-default);border-radius:4px;background:var(--s-card);color:var(--t-primary)" onchange="_jumpToPage(this.value)" onclick="event.stopPropagation()"> / ${tp}`;}document.getElementById('btnPrev').disabled=_S.currentPage<=0;document.getElementById('btnNext').disabled=_S.currentPage>=tp-1;
    _renderActiveFilterBadges();renderTableContext();
    // Colonne 🌐 (clients zone hors agence) : masquée tant qu'aucun article n'a de signal
    _S._webColEmpty=!(_S.chalandiseReady&&DataStore.finalData.some(r=>(r.caHorsMagasin||0)>=100&&(r.nbClientsWeb||0)>=2)); // appliqué par _applyColVisibility
    const _totalCA=_getFilteredCATotal();const _totalCAEl=document.getElementById('filteredCATotal');if(_totalCAEl){if(_totalCA>0){const _caStr=_totalCA>=1000?`${(_totalCA/1000).toFixed(0)}k€`:`${Math.round(_totalCA)}€`;_totalCAEl.textContent=`CA filtré : ${_caStr}`;_totalCAEl.classList.remove('hidden');}else{_totalCAEl.classList.add('hidden');}}
    const p=[];
    for(const r of pd){
      const isUncalib=r.nouveauMin===0&&r.nouveauMax===0;
      const isDormant=r.W===0&&r.stockActuel>0;
      const bg=isDormant?'':isUncalib?'s-card-alt':'';
      const sc=(() => { if(isUncalib)return 't-disabled'; if(r.stockActuel<=0)return 'c-danger font-bold'; if(r.nouveauMax>0&&r.stockActuel>r.nouveauMax)return 'c-caution font-bold'; return ''; })();
      const caEst=r.caAnnuel>0?(r.caAnnuel>=1000?`${(r.caAnnuel/1000).toFixed(1)}k€`:`${r.caAnnuel}€`):'—';
      const ancStr=(r.ancienMin===0&&r.ancienMax===0)?`<span class="t-disabled" title="Pas de MIN/MAX dans l'ERP">—</span>`:(r.ancienMin>0&&r.ancienMax===0)?`<span class="c-caution" title="MAX absent — anomalie ERP">${r.ancienMin}/0</span>`:`${r.ancienMin}/${r.ancienMax}`;
    p.push(`<tr class="border-b hover:i-info-bg ${bg} cursor-pointer"${isDormant?' style="background:color-mix(in srgb, var(--pt-low) 10%, transparent)"':isUncalib?' style="opacity:0.48"':''}
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
      <td class="px-2 py-2 text-center text-xs whitespace-nowrap" title="Dernier mouvement ERP : ${getAgeLabel(r.ageJours)}">${_lastSaleCell(r.moisSansVente)}</td>
      <td class="px-2 py-2 text-center text-xs t-disabled">${ancStr}</td>
      <td class="px-2 py-2 text-center font-bold text-xs">${r.nouveauMin}</td>
      <td class="px-2 py-2 text-center font-bold text-xs">${r.nouveauMax}</td>
      ${_S.chalandiseReady&&(r.caHorsMagasin||0)>=100&&(r.nbClientsWeb||0)>=2?`<td class="px-2 py-2 text-center text-[10px] text-violet-600 font-bold">${r.nbClientsWeb}c · ${r.caHorsMagasin>=1000?(r.caHorsMagasin/1000).toFixed(1)+'k€':Math.round(r.caHorsMagasin)+'€'}</td>`:`<td class="px-2 py-2 text-center t-disabled text-[10px]">—</td>`}
      <td class="px-2 py-2 text-center text-[10px] ${r.pullIndex!=null?(r.pullIndex>=80?'text-sky-400 font-bold':r.pullIndex>=40?'t-primary font-semibold':'text-amber-500 font-semibold'):'t-disabled'}">${r.pullIndex!=null?r.pullIndex+'%':'—'}</td>
    </tr>`);}
    document.getElementById('tableBody').innerHTML=p.join('')||`<tr><td colspan="16" class="text-center py-8 t-tertiary">Aucun.</td></tr>`;
    _applyColVisibility();
  }

  export function _jumpToPage(val){
    const tp=Math.max(1,Math.ceil(DataStore.filteredData.length/PAGE_SIZE));
    const page=parseInt(val);
    if(isNaN(page))return;
    _S.currentPage=Math.min(Math.max(0,page-1),tp-1);
    renderTable(true);
  }
  window._jumpToPage=_jumpToPage;

  // ★ V24: Render Radar (ABC/FMR matrix) tab — supports Famille/Emplacement filters
  export function _radarFilteredData(){
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
  export function renderABCTab(){
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
    // Ton = décision attendue (cf. RECOS) : à tenir / standard / à revoir / à sortir
    const TONE={AF:'high',AM:'high',BF:'high',CF:'high',BM:'base',AR:'mid',BR:'mid',CM:'mid',CR:'low'};
    const TONE_LBL={high:'À tenir',base:'Standard',mid:'À revoir',low:'À sortir'};
    const RECOS={
      AF:'Capitaines — zéro rupture. Stock de sécurité, commande auto, emplacement premium.',
      AM:'Gros CA à cycle long — stock tampon faible, réappro maîtrisée.',
      AR:'Forte valeur, vente rare — viser zéro stock physique, commande spéciale.',
      BF:'Petits prix qui tournent — automatiser (2 bacs), le moins de temps possible à gérer.',
      BM:'Réappro standard — surveiller pour ne pas glisser vers BR ou CM.',
      BR:'Déclinant qui s’ignore — 1 unité max, pas de réappro auto, en revue de sortie.',
      CF:'Incontournable comptoir — doit toujours être là : son absence frustre plus que son stock ne coûte.',
      CM:'Zone de simplification — remplacer plusieurs références par une seule ?',
      CR:'Poids mort — on sort, sauf article d’appel métier (garder 1 unité).'
    };
    const FMR_LBL={F:'Fréquent<br><span class="pt-muted pt-small">≥12 ventes</span>',M:'Moyen<br><span class="pt-muted pt-small">4 à 11</span>',R:'Rare<br><span class="pt-muted pt-small">≤3</span>'};
    const ABC_LBL={A:'A<br><span class="pt-muted pt-small">80 % du CA</span>',B:'B<br><span class="pt-muted pt-small">15 %</span>',C:'C<br><span class="pt-muted pt-small">5 %</span>'};
    let html='<div class="ar-mx"><span></span>'+['F','M','R'].map(f=>`<div class="ar-mx-h">${FMR_LBL[f]}</div>`).join('');
    for(const abc of['A','B','C']){
      html+=`<div class="ar-mx-h ar-mx-row">${ABC_LBL[abc]}</div>`;
      for(const fmr of['F','M','R']){
        const key=abc+fmr,d=mx[key]||{count:0,stockVal:0,pctTotal:0},tone=TONE[key];
        html+=`<div class="ar-cell" data-tone="${tone}" role="button" tabindex="0" title="${key} — ${RECOS[key]}" onclick="filterByAbcFmr('${abc}','${fmr}')" onkeydown="if(event.key==='Enter')filterByAbcFmr('${abc}','${fmr}')">
          <div class="pt-row pt-between"><span class="pt-num pt-small pt-muted">${key}</span><span class="ar-tag" data-tone="${tone==='base'?'':tone}">${TONE_LBL[tone]}</span></div>
          <div class="pt-num" style="font-size:28px;font-weight:600;line-height:1.1">${d.count.toLocaleString('fr-FR')}<span class="pt-small pt-muted" style="font-weight:400"> art.</span></div>
          <div class="pt-row pt-between pt-small"><span class="pt-num pt-strong">${formatEuro(d.stockVal)}</span><span class="pt-num pt-muted">${d.pctTotal.toFixed(0)} % du stock</span></div>
          ${d.count>0?`<button type="button" class="pt-link pt-small" style="padding:0;text-align:left" onclick="event.stopPropagation();openDiagnosticCell('${abc}','${fmr}')">Diagnostic →</button>`:''}
        </div>`;
      }
    }
    html+='</div><p class="pt-small pt-muted" style="margin:12px 0 0">Clic sur une case : ses articles dans l’onglet Articles. Survol : la règle de gestion.</p>';
    const mc=document.getElementById('abcMatrixContainer');if(mc)mc.innerHTML=html;
    // Attractivité par Famille (migrée depuis Mon Stock)
    const atEl=document.getElementById('dashAttractTable');if(atEl){const va=_S.ventesAnalysis;const totalBL2=va.totalBL||1;const p2=[];Object.entries(va.attractivite).sort((a,b)=>b[1]-a[1]).forEach(([fam,count])=>{const rate=((count/totalBL2)*100).toFixed(1);const barW=Math.min(parseFloat(rate),100);p2.push(`<tr class="border-b hover:i-danger-bg"><td class="py-2 px-3 text-[11px] font-semibold truncate max-w-[200px]" title="${escapeHtml(fam)}">${escapeHtml(fam)}</td><td class="py-2 px-3 text-center t-secondary text-xs">${count.toLocaleString('fr')}</td><td class="py-2 px-3 text-right"><div class="flex items-center gap-1 justify-end"><div class="w-16 s-hover rounded-full h-1.5"><div class="perf-bar bg-c-danger rounded-full" style="width:${barW}%"></div></div><span class="c-danger font-bold text-[10px] min-w-[35px] text-right">${rate}%</span></div></td></tr>`);});atEl.innerHTML=p2.join('')||'<tr><td colspan="3" class="text-center py-4 t-disabled text-xs">Aucune donnée famille</td></tr>';}
  }

  // ── Vue "Clients PDV" (V4) ─────────────────────────────────────────

  export async function renderCurrentTab(){
    // Pastille active du super-onglet affiché (les autres groupes gardent leur pastille par défaut)
    const activePill=document.querySelector('.supertab-group.active .supertab-pill.active[data-subtab]');
    const activeBtn=document.querySelector('.tab-btn.active');
    const id=(activePill?.dataset.subtab)||(activeBtn?activeBtn.getAttribute('data-tab'):'table');
    switch(id){
      case 'partie':
        renderPartieTab();
        break;
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
        renderArbitrageTab();
        renderABCTab();
        renderHealthScore();
        renderTabBadges();
        console.log('[PERF arbitrage]',(performance.now()-_ts0|0)+'ms');
        break;}
      case 'essai':{
        const _ts0=performance.now();
        renderEssaiTab();
        console.log('[PERF essai]',(performance.now()-_ts0|0)+'ms');
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
      case 'portefeuille':
        renderTesClients();
        break;
      case 'animation':
        await renderAnimationTab();
        break;
      case 'associations':
        renderAssociationsTab();
        break;
      case 'duel':
        window.renderDuelTab?.();
        break;
    }
    if (id !== 'conformite') _S._tabRendered[id]=true;
  }

  // ★★★ V2 Phase 2: Diagnostic Cascade ★★★

  // Strip "O05 - " style prefix from family names for consistent matching across data sources
  export function openDiagnosticCell(abc,fmr){
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
      if (_S.chalandiseReady && DataStore.ventesLocalMagPeriode.size) { resetBenchMetierCache(); computeOpportuniteNette(); computeAnglesMorts(); computeOmniScores(); }
      buildClientStore();_applyForcageCommercial();_mc('buildClientStore');
      if (_S.ventesLocalHorsMag.size) _rebuildCaByArticleCanal();
      if(_S.ventesLocalMagPeriode.size) _computeClientDominantUnivers();
      _enrichPullIndex();
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
      switchTab('partie');_mc('switchTab partie');
      collapseImportZone();
      // Sessions enregistrées avec l'ancien défaut « mois en cours » sur un mois quasi vide → 12 mois
      {const _mx=_S.consommePeriodMaxFull||_S.consommePeriodMax;
       if(_S._byMonth&&isShortAutoPeriod(_S.periodFilterStart,_S.periodFilterEnd,_mx)){const _r=defaultPeriodRange(_mx);if(_r)applyPeriodFilter(_r.start.getTime(),_r.end.getTime());}}
      // Période : respecter le filtre persisté dans IDB (restauré par _restoreSessionFromIDB).
      // Si aucun filtre n'était actif, _S.periodFilterStart/End sont déjà null.
      if(!_S.ventesLocalMag12MG.size&&_S.ventesLocalMagPeriode.size){
        _S.ventesLocalMag12MG=new Map([..._S.ventesLocalMagPeriode].map(([cc,arts])=>[cc,new Map(arts)]));
      }
      invalidateCache('tab','terr');buildPeriodFilter();
      _mc('pré-render');
      renderCanalAgence();
      _mc('renderCurrentTab');

      initColSelector();
      _mc('Prêt');console.table(_pc);
      // Pré-calcul squelette en idle — alimente Plan Rayon + badges
      _scheduleIdleSquelette();
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
