'use strict';

import { _S } from './state.js';
import { _clientPassesFilters, _isPDVActif, _isPerdu, _isPerdu24plus, _isProspect, _passesClientCrossFilter } from './engine.js';
import { getClientCAFullInMonthRange } from './sales.js';
import { getSecteurDirection } from './utils.js';

let overviewMode='direction'; // 'direction' | 'secteur'
let filteredKey='';
let filteredEntries=null;
let filteredStats=null;

function stableSetValues(setLike){
  return [...(setLike||[])].sort();
}

export function getOverviewMode(){
  return overviewMode;
}

export function setOverviewMode(mode){
  overviewMode=mode==='secteur'?'secteur':'direction';
  invalidateFilteredChalandise();
}

export function invalidateFilteredChalandise(){
  filteredKey='';
  filteredEntries=null;
  filteredStats=null;
}

export function buildOverviewCacheKey(){
  return JSON.stringify({
    mode:overviewMode,
    depts:stableSetValues(_S._selectedDepts),
    classifs:stableSetValues(_S._selectedClassifs),
    activitesPDV:stableSetValues(_S._selectedActivitesPDV),
    statuts:stableSetValues(_S._selectedStatuts),
    directions:stableSetValues(_S._selectedDirections),
    univers:stableSetValues(_S._selectedUnivers),
    strategique:!!_S._filterStrategiqueOnly,
    metier:_S._selectedMetier||'',
    commercial:_S._selectedCommercial||'',
    statutDetaille:_S._selectedStatutDetaille||'',
    distanceMaxKm:_S._distanceMaxKm||0,
    includePerdu24m:!!_S._includePerdu24m,
    excludeActifsConsomme:!!_S._excludeActifsConsomme,
    periodStart:_S.periodFilterStart?.getTime()||0,
    periodEnd:_S.periodFilterEnd?.getTime()||0,
    reseauMagasinMode:_S._reseauMagasinMode||'all',
    chalandiseSize:_S.chalandiseData?.size||0,
    clientsMagasinSize:_S.clientsMagasin?.size||0,
    ventesHorsMagasinSize:_S.ventesLocalHorsMag?.size||0,
    globalCanal:_S._globalCanal||''
  });
}

export function passesOverviewClient(info,cc,capteSet=null,opts={}){
  if(!info)return !!opts.allowMissing;
  if(!_clientPassesFilters(info,cc))return false;
  if(_S._excludeActifsConsomme&&capteSet?.has(cc))return false;
  if(!_S._includePerdu24m&&_isPerdu24plus(info)){
    if(opts.countExcluded)opts.countExcluded.value++;
    return false;
  }
  return true;
}

export function getFilteredChalandiseEntries(capteSet=null){
  const key=buildOverviewCacheKey();
  if(filteredEntries&&filteredKey===key){
    return{entries:filteredEntries,stats:filteredStats};
  }
  const entries=[];
  const excluded24m={value:0};
  let totalClients=0;
  for(const[cc,info] of (_S.chalandiseData||new Map()).entries()){
    totalClients++;
    if(!passesOverviewClient(info,cc,capteSet,{countExcluded:excluded24m}))continue;
    entries.push([cc,info]);
  }
  filteredKey=key;
  filteredEntries=entries;
  filteredStats={totalClients,filteredClients:entries.length,totalExcluded24m:excluded24m.value};
  return{entries,stats:filteredStats};
}

export function getOverviewDirection(info){
  if(overviewMode==='secteur')return info.secteur||'Autre';
  return info.secteur?getSecteurDirection(info.secteur)||'Autre':'Autre';
}

function addClientBucketStats(bucket,info,cc,capteSet){
  bucket.total++;
  const pdvActif=capteSet?capteSet.has(cc):false;
  if(_isProspect(info)){
    bucket.prospects++;
  }else if(_isPerdu(info)&&!pdvActif){
    if((info.ca2025||0)>0)bucket.perdus12_24++;
    else bucket.inactifs++;
  }else{
    bucket.actifsLeg++;
  }
  if(pdvActif)bucket.actifsPDV++;
  bucket.caPDVZone+=(info.caPDVN||0);
  return pdvActif;
}

function baseBucket(extra={}){
  return Object.assign({total:0,actifsLeg:0,actifsPDV:0,prospects:0,perdus12_24:0,inactifs:0,caPDVZone:0},extra);
}

export function aggregateOverviewGroups(capteSet=null){
  const {entries,stats}=getFilteredChalandiseEntries(capteSet);
  const groups={};
  let totalActifsPDV=0,totalActifsLeg=0;
  const isSecteurMode=overviewMode==='secteur';
  for(const[cc,info] of entries){
    const parentDir=info.secteur?getSecteurDirection(info.secteur)||'Autre':'Autre';
    const dir=isSecteurMode?(info.secteur||'Autre'):parentDir;
    const dirKey=dir||'Autre';
    if(!groups[dirKey])groups[dirKey]=baseBucket({dir:dirKey,parentDir,_comCounts:{}});
    const bucket=groups[dirKey];
    if(isSecteurMode&&info.commercial)bucket._comCounts[info.commercial]=(bucket._comCounts[info.commercial]||0)+1;
    const wasActifLeg=bucket.actifsLeg;
    const pdvActif=addClientBucketStats(bucket,info,cc,capteSet);
    if(bucket.actifsLeg>wasActifLeg)totalActifsLeg++;
    if(pdvActif)totalActifsPDV++;
  }
  return{groups,stats,totalActifsPDV,totalActifsLeg};
}

export function aggregateOverviewMetiers(direction,capteSet=null){
  const metiers={};
  for(const[cc,info] of getFilteredChalandiseEntries(capteSet).entries){
    if(getOverviewDirection(info)!==direction)continue;
    const metier=info.metier||'Autre';
    if(!metiers[metier])metiers[metier]=baseBucket({metier});
    addClientBucketStats(metiers[metier],info,cc,capteSet);
  }
  return Object.values(metiers).filter(m=>m.total>0);
}

export function aggregateOverviewSecteurs(direction,metier,capteSet=null){
  const secteurs={};
  for(const[cc,info] of getFilteredChalandiseEntries(capteSet).entries){
    if(getOverviewDirection(info)!==direction)continue;
    if((info.metier||'Autre')!==metier)continue;
    const secteur=info.secteur||'—';
    const commercial=info.commercial||'—';
    const key=secteur+'||'+commercial;
    if(!secteurs[key])secteurs[key]=baseBucket({secteur,commercial});
    addClientBucketStats(secteurs[key],info,cc,capteSet);
  }
  return Object.values(secteurs);
}

export function aggregateOverviewClients({direction,metier,secteur,range,capteSet=null}){
  const clients=[];
  for(const[cc,info] of getFilteredChalandiseEntries(capteSet).entries){
    if(getOverviewDirection(info)!==direction)continue;
    if((info.metier||'Autre')!==metier)continue;
    if((info.secteur||'—')!==secteur)continue;
    if(!_passesClientCrossFilter(cc))continue;
    clients.push({
      code:cc,
      nom:info.nom||'',
      statut:info.statut||'',
      classification:info.classification||'',
      commercial:info.commercial||'',
      caLeg:info.ca2026||0,
      caMag:getClientCAFullInMonthRange(cc,range)||0,
      ville:info.ville||'',
      _pdvActif:capteSet?capteSet.has(cc):_isPDVActif(cc),
      _pdvActifGlobal:_isPDVActif(cc)
    });
  }
  return clients;
}
