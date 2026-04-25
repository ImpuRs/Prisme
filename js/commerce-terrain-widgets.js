'use strict';

import { _S } from './state.js';
import { DataStore } from './store.js';
import { escapeHtml, formatEuro } from './utils.js';
import { _isPDVActif, getUniversFilteredCA } from './engine.js';
import { getClientCAByCanalInPeriod, getClientsActiveSetInPeriod } from './sales.js';
import { passesOverviewClient } from './commerce-conquete.js';

const CANAL_LABELS={MAGASIN:'Magasin',INTERNET:'Internet',REPRESENTANT:'Représentant',DCS:'DCS'};

function getOverviewCapteSet(){
  const canal=_S._globalCanal||'';
  const magMode=_S._reseauMagasinMode||'all';
  const direct=getClientsActiveSetInPeriod(canal,{magasinMode:magMode});
  if(direct)return direct;

  // Fallback legacy : anciennes sessions IDB sans index mensuels client/canal.
  if(!canal){
    const set=new Set(_S.clientsMagasin||[]);
    if(_S.ventesClientHorsMagasin)for(const cc of _S.ventesClientHorsMagasin.keys())set.add(cc);
    return set;
  }
  if(canal==='MAGASIN')return _S.clientsMagasin||new Set();

  const set=new Set();
  if(_S.ventesClientHorsMagasin){
    for(const[cc,artMap]of _S.ventesClientHorsMagasin){
      for(const[,v]of artMap){if((v.canal||'')===canal){set.add(cc);break;}}
    }
  }
  return set;
}

function kpi(label,value,sub,color,title){
  return `<div class="flex flex-col items-center p-2.5 rounded-xl border s-card min-w-[100px]"${title?` title="${title}"`:''}>
      <span class="text-[9px] t-disabled font-semibold uppercase tracking-wide mb-1">${label}</span>
      <span class="text-[15px] font-extrabold" style="color:${color}">${value}</span>
      ${sub?`<span class="text-[9px] t-disabled mt-0.5">${sub}</span>`:''}
    </div>`;
}

export function computeCommercialScorecard({ commercial, finalDataIndex, setRuptureClientSet }) {
  const ccs=_S.clientsByCommercial?.get(commercial);
  if(!commercial||!ccs?.size)return null;

  const hasUnivFilter=_S._selectedUnivers.size>0;
  const canal=_S._globalCanal||'';
  const magMode=_S._reseauMagasinMode||'all';
  const captePDVSet=getOverviewCapteSet();
  let caPDVTotal=0,ca2026=0,nbClients=0,nbCaptes=0,caDegraded=false;

  for(const cc of ccs){
    const info=_S.chalandiseData?.get(cc);
    if(!passesOverviewClient(info,cc,captePDVSet))continue;
    nbClients++;
    ca2026+=info.ca2026||0;
    let caPDV=0;
    if(hasUnivFilter){
      caPDV=getUniversFilteredCA(cc);
    }else if(canal==='MAGASIN'){
      caPDV=_S.clientStore?.get(cc)?.caPDV||0;
    }else{
      const caBM=getClientCAByCanalInPeriod(cc,canal,{magasinMode:magMode});
      if(typeof caBM==='number'){
        caPDV=caBM;
      }else if(!canal){
        const rec=_S.clientStore?.get(cc);
        caPDV=(rec?.caPDV||0)+(rec?.caHors||0);
        if(_S.periodFilterStart||_S.periodFilterEnd)caDegraded=true;
      }else{
        const hm=_S.ventesClientHorsMagasin?.get(cc);
        if(hm)for(const[,d]of hm){if((d.canal||'')===canal)caPDV+=d.sumCA||0;}
        if(_S.periodFilterStart||_S.periodFilterEnd)caDegraded=true;
      }
    }
    caPDVTotal+=caPDV;
    const isCapte=captePDVSet?captePDVSet.has(cc):(caPDV>0||_isPDVActif(cc));
    if(isCapte)nbCaptes++;
  }

  const partDenom=Math.max(caPDVTotal,ca2026);
  const txPartPDV=partDenom>0?Math.round(caPDVTotal/partDenom*100):0;
  const potentiel=Math.max(0,ca2026-caPDVTotal);

  let caHorsTotal=0,caHorsCompat=0;
  for(const cc of ccs){
    const info=_S.chalandiseData?.get(cc);
    if(!passesOverviewClient(info,cc,captePDVSet))continue;
    const horArts=_S.ventesClientHorsMagasin?.get(cc);
    if(!horArts)continue;
    for(const[code,d]of horArts){
      const ca=d.sumCA||0;
      if(ca<=0)continue;
      caHorsTotal+=ca;
      const r=finalDataIndex.get(code);
      if(!r)continue;
      const fmr=(r.fmrClass||'').toUpperCase();
      if(fmr==='F'||fmr==='M')caHorsCompat+=ca;
    }
  }
  const pctCompat=caHorsTotal>0?Math.round(caHorsCompat/caHorsTotal*100):0;
  const cibleComptoir=Math.round(potentiel*pctCompat/100);

  const comClientSet=new Set();
  for(const cc of ccs){
    const info=_S.chalandiseData?.get(cc);
    if(!passesOverviewClient(info,cc,captePDVSet))continue;
    if(_S.ventesClientArticle?.has(cc))comClientSet.add(cc);
  }
  let nbRupturesImpact=0,nbClientsImpactes=0;
  const ruptureClientSet=new Set();
  if(DataStore.finalData?.length&&_S.articleClients&&comClientSet.size){
    for(const r of DataStore.finalData){
      if(r.stockActuel!==0||r.W<1||r.isParent)continue;
      if(r.V===0&&r.enleveTotal>0)continue;
      const buyers=_S.articleClients.get(r.code);
      if(!buyers)continue;
      let touches=false;
      for(const cc of buyers){
        if(comClientSet.has(cc)){ruptureClientSet.add(cc);touches=true;}
      }
      if(touches)nbRupturesImpact++;
    }
    nbClientsImpactes=ruptureClientSet.size;
  }
  setRuptureClientSet?.(ruptureClientSet);

  return{commercial,canal,caPDVTotal,ca2026,nbClients,nbCaptes,caDegraded,txPartPDV,cibleComptoir,pctCompat,nbRupturesImpact,nbClientsImpactes};
}

export function renderCommercialScorecard(score,{secteur='',pocheActive=''}) {
  if(!score)return '';
  const canalLabel=CANAL_LABELS[score.canal]||score.canal;
  return `<div class="flex flex-wrap items-stretch gap-2 mb-3 p-3 rounded-xl border" style="background:linear-gradient(135deg,rgba(99,102,241,0.08),rgba(79,70,229,0.03));border-color:rgba(99,102,241,0.25)">
    <div class="flex flex-col justify-center mr-2">
      <span class="text-[11px] font-extrabold t-primary">${escapeHtml(score.commercial)}</span>
      ${secteur?`<span class="text-[9px] t-disabled">Secteur ${escapeHtml(secteur)}</span>`:''}
      <span class="text-[9px] t-disabled">${score.nbClients} clients zone</span>
      <button onclick="window._comToggleMixCanal()" class="text-[9px] c-action hover:underline cursor-pointer mt-1 text-left font-semibold">📡 Mix canal</button>
    </div>
    ${kpi('CA PDV',formatEuro(score.caPDVTotal),score.nbCaptes+' / '+score.nbClients+' captés'+(score.canal&&score.canal!=='MAGASIN'?' · via '+canalLabel:'')+(score.caDegraded?' · CA figé (cache ancien)':''),'var(--c-action)',score.canal&&score.canal!=='MAGASIN'?'CA via '+canalLabel+' par les clients du portefeuille sur la période filtrée':'CA réalisé en agence (canal MAGASIN) par les clients du portefeuille sur la période filtrée')}
    ${kpi('CA Zone',formatEuro(score.ca2026),score.nbClients+' clients · source Qlik','#c4b5fd','CA total Legallais (source Chalandise/Qlik). Ne varie pas avec la période PRISME, seulement avec le fichier Chalandise et les filtres clients.')}
    ${kpi('Part PDV',score.txPartPDV+'%','PDV / zone',score.txPartPDV>30?'var(--c-ok)':score.txPartPDV>15?'var(--c-caution)':'var(--c-danger)','Part de marché PDV = CA PDV ÷ CA Zone. Objectif : capter le max du potentiel en agence')}
    ${score.cibleComptoir>0?kpi('Cible Comptoir',formatEuro(score.cibleComptoir),score.pctCompat+'% compatible','#22d3ee','Potentiel récupérable au comptoir = Potentiel × % PDV-compatible. Articles F/M (rotatifs, dépannage) dans le CA hors-agence des clients'):''}
    <div class="flex flex-col items-center p-2.5 rounded-xl border min-w-[100px] cursor-pointer transition-all hover:brightness-110 ${pocheActive==='E'?'s-panel-inner':'s-card'}" style="${pocheActive==='E'?'box-shadow:0 0 0 2px var(--c-danger)':''}" onclick="window._togglePoche('E')" title="${score.nbRupturesImpact} articles en rupture impactant ${score.nbClientsImpactes} clients">
      <span class="text-[9px] t-disabled font-semibold uppercase tracking-wide mb-1">Ruptures / irritants</span>
      <span class="text-[15px] font-extrabold" style="color:${score.nbRupturesImpact>0?'var(--c-danger)':'var(--c-ok)'}">${score.nbRupturesImpact}</span>
      <span class="text-[9px] t-disabled mt-0.5">${score.nbClientsImpactes} client${score.nbClientsImpactes>1?'s':''} impacté${score.nbClientsImpactes>1?'s':''}</span>
    </div>
  </div>
  <div id="comMixCanalInline" class="hidden" style="background:linear-gradient(135deg,rgba(100,116,139,0.12),rgba(71,85,105,0.06));border:1px solid rgba(100,116,139,0.25);border-radius:14px;overflow:hidden;margin-bottom:12px">
    <div style="padding:10px 16px;background:linear-gradient(135deg,rgba(100,116,139,0.18),rgba(71,85,105,0.10));border-bottom:1px solid rgba(100,116,139,0.2);display:flex;align-items:center;justify-content:space-between">
      <h3 style="font-weight:800;font-size:12px;color:#cbd5e1">📡 Répartition par canal</h3>
      <button onclick="window._comToggleMixCanal()" class="text-[10px] t-disabled hover:text-white cursor-pointer font-bold">✕</button>
    </div>
    <div id="canalAgenceBlock" class="p-3"></div>
  </div>`;
}

export function buildPochesTerrain({commercial,finalDataIndex}) {
  const store=_S.clientStore;
  if(!store?.size)return null;
  const captePDVSet=getOverviewCapteSet();
  const pool=[];
  const comCcs=commercial?_S.clientsByCommercial?.get(commercial):null;
  for(const[cc,rec]of store){
    if(comCcs&&!comCcs.has(cc))continue;
    const info=_S.chalandiseData?.get(cc);
    if(!passesOverviewClient(info,cc,captePDVSet))continue;
    pool.push({cc,rec,info});
  }

  const hasUnivFilter=_S._selectedUnivers.size>0;
  const pocheA=[],pocheB=[],pocheC=[],pocheD=[];
  let potA=0,potB=0,potC=0;
  for(const{cc,rec,info}of pool){
    const caSoc=info.ca2026||rec.caTotal||0;
    const caPDV=hasUnivFilter?getUniversFilteredCA(cc):(rec.caPDV||0);
    const gap=caSoc-caPDV;
    if(gap>0&&caSoc>0){potA+=gap;pocheA.push({cc,nom:rec.nom,metier:rec.metier,commercial:rec.commercial,caSoc,caPDV,gap,dist:rec.distanceKm,silence:rec.silenceDaysPDV});}

    const caAutres=rec.caAutresAgences||0;
    if(caAutres>0){potB+=caAutres;pocheB.push({cc,nom:rec.nom,metier:rec.metier,commercial:rec.commercial,caAutres,caPDV:rec.caPDV||0,nbBL:rec.nbBLPDV||0});}

    const dist=rec.distanceKm;
    const hors=rec.artMapHors;
    if(dist!=null&&dist<=5&&hors){
      let caLivre=0;
      const canauxLivre=new Set();
      for(const d of hors.values()){
        const c=(d.canal||'').toUpperCase();
        if(c==='DCS'||c==='REPRESENTANT'||c==='INTERNET'){caLivre+=d.sumCA||0;canauxLivre.add(c);}
      }
      if(caLivre>0){potC+=caLivre;pocheC.push({cc,nom:rec.nom,metier:rec.metier,commercial:rec.commercial,caLivre,canaux:[...canauxLivre].join('+'),caPDV:rec.caPDV||0,dist});}
    }

    if((rec.caPDV||0)>0){
      const nbBL=rec.nbBLPDV||1;
      const panier=rec.caPDV/nbBL;
      const arts=rec.artMapPDV;
      const fams=new Set();
      if(arts)for(const code of arts.keys()){const f=_S.articleFamille?.[code]||finalDataIndex?.get(code)?.famille;if(f)fams.add(f);}
      pocheD.push({cc,nom:rec.nom,metier:rec.metier,commercial:rec.commercial,caPDV:rec.caPDV,nbBL,panier,nbFam:fams.size,silence:rec.silenceDaysPDV});
    }
  }
  pocheA.sort((a,b)=>b.gap-a.gap||(a.dist??999)-(b.dist??999)||(a.silence??999)-(b.silence??999));
  pocheB.sort((a,b)=>b.caAutres-a.caAutres);
  pocheC.sort((a,b)=>b.caLivre-a.caLivre);
  pocheD.sort((a,b)=>a.nbBL-b.nbBL||a.panier-b.panier);
  return{data:{A:pocheA,B:pocheB,C:pocheC,D:pocheD},potA,potB,potC};
}

export function renderPochesTerrain(poches,{activeKey=''}) {
  if(!poches)return '';
  const cards=[
    {key:'A',icon:'🎯',label:'Écart Zone',value:formatEuro(poches.potA),sub:`${poches.data.A.length} clients`,color:'var(--c-danger)',tip:'CA total société − CA PDV = livraisons EXTÉRIEUR + achats autres agences. Aucun centime passé en agence.'},
    {key:'B',icon:'🏪',label:'Inter-agences',value:formatEuro(poches.potB),sub:`${poches.data.B.length} clients`,color:'#f59e0b',tip:"CA dans d'autres agences Legallais — sous-partie de l'Écart Zone"},
    {key:'C',icon:'🚚',label:'Livré → Proximité',value:formatEuro(poches.potC),sub:`${poches.data.C.length} clients`,color:'#8b5cf6',tip:"Livraisons Web/DCS/Rep pour clients à < 5 km de l'agence — absurdité logistique convertible en retrait comptoir"},
    {key:'D',icon:'📈',label:'Activation',value:poches.data.D.length.toString(),sub:'clients actifs PDV',color:'var(--c-ok)',tip:'Montée en panier / fréquence'}
  ];
  const tiles=cards.map(p=>{
    const isActive=activeKey===p.key;
    return `<div class="flex flex-col items-center p-3 rounded-xl border cursor-pointer transition-all ${isActive?'s-panel-inner':'s-card'} hover:brightness-95" style="${isActive?'box-shadow:0 0 0 2px '+p.color:''}" title="${p.tip}" onclick="window._togglePoche('${p.key}')">
      <span class="text-lg leading-none mb-1">${p.icon}</span>
      <span class="text-[15px] font-extrabold" style="color:${p.color}">${p.value}</span>
      <span class="text-[9px] ${isActive?'t-inverse':'t-disabled'} font-semibold mt-0.5">${p.label}</span>
      <span class="text-[8px] ${isActive?'t-inverse-muted':'t-disabled'} mt-0.5">${p.sub}</span>
    </div>`;
  }).join('');
  return `<div class="s-card rounded-xl border p-4 mb-3">
    <h3 class="text-[11px] font-bold t-secondary uppercase tracking-wider mb-3">4 leviers d'action Terrain</h3>
    <div class="grid grid-cols-4 gap-2 mb-1">${tiles}</div>
  </div>`;
}
