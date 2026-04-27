'use strict';

import { _S } from './state.js';
import { escapeHtml, formatEuro } from './utils.js';
import { getUniversFilteredCA } from './engine.js';
import { getClientCAMagasinInMonthRange } from './sales.js';

function hasTopContext({selectedTopClient,pocheActive}) {
  return !!(_S._selectedCommercial&&(_S.chalandiseReady||_S.forcageCommercial?.size)&&
    (selectedTopClient||pocheActive||_S._selectedMetier||(_S._distanceMaxKm>0&&_S._agenceCoords)));
}

function renderEmptyArticles() {
  return `<div style="background:linear-gradient(135deg,rgba(99,102,241,0.08),rgba(79,70,229,0.04));border:1px solid rgba(99,102,241,0.2);border-radius:14px;padding:24px;text-align:center;margin-bottom:12px">
    <span style="font-size:24px;opacity:0.3">📦</span>
    <p style="font-size:12px;color:rgba(255,255,255,0.35);margin-top:8px">Sélectionnez un client pour voir ses opportunités articles</p>
  </div>`;
}

function renderSqBadge(code) {
  const sq=window._getArticleSqInfo?.(code);
  if(!sq)return '<span class="t-disabled">—</span>';
  const colors={socle:'#22c55e',implanter:'#3b82f6',challenger:'#ef4444',surveiller:'#94a3b8'};
  const labels={socle:'Socle',implanter:'Implanter',challenger:'Challenger',surveiller:'Surveiller'};
  const cBadge=`<span class="text-[8px] px-1 py-0.5 rounded font-bold" style="background:${colors[sq.classif]}20;color:${colors[sq.classif]}">${labels[sq.classif]}</span>`;
  const vBadge=sq.verdict?.name&&sq.verdict.name!=='—'?`<br><span class="text-[8px] t-inverse-muted" title="${escapeHtml(sq.verdict.tip||'')}">${sq.verdict.icon} ${escapeHtml(sq.verdict.name)}</span>`:'';
  return cBadge+vBadge;
}

function buildArticleEntries({selectedTopClient,mode,finalDataIndex}) {
  const com=_S._selectedCommercial;
  const targetCcs=selectedTopClient?[selectedTopClient]:[...(_S.clientsByCommercial?.get(com)||[])];
  const iciMap=new Map();
  const ailMap=new Map();

  for(const cc of targetCcs){
    const pdv=_S.ventesLocalMagPeriode?.get(cc);
    if(pdv)for(const[code,d]of pdv){
      if(!iciMap.has(code))iciMap.set(code,{ca:0,nbClients:0,nbBL:0});
      const a=iciMap.get(code);a.ca+=d.sumCA||0;a.nbClients++;a.nbBL+=d.countBL||0;
    }
    const hors=_S.ventesLocalHorsMag?.get(cc);
    if(hors)for(const[code,d]of hors){
      if(!ailMap.has(code))ailMap.set(code,{ca:0,nbClients:0,nbBL:0});
      const a=ailMap.get(code);a.ca+=d.sumCA||0;a.nbClients++;a.nbBL+=d.countBL||0;
    }
  }

  let resolvedMode=mode;
  if(resolvedMode==='ici'&&!iciMap.size&&ailMap.size)resolvedMode='ailleurs';
  else if(resolvedMode==='ailleurs'&&!ailMap.size&&iciMap.size)resolvedMode='ici';

  let entries=[];
  if(resolvedMode==='subies'){
    const allCodes=new Set([...iciMap.keys(),...ailMap.keys()]);
    for(const code of allCodes){
      const r=finalDataIndex?.get(code);
      if(!r||r.stockActuel>0||r.W<1||r.isParent)continue;
      const caIci=iciMap.get(code)?.ca||0;
      const caAil=ailMap.get(code)?.ca||0;
      const totalCA=caIci+caAil;
      if(totalCA<=0)continue;
      entries.push([code,{ca:totalCA,caIci,caAil,nbClients:1,nbBL:(iciMap.get(code)?.nbBL||0)+(ailMap.get(code)?.nbBL||0)}]);
    }
  }else if(resolvedMode==='ici'){
    entries=[...iciMap.entries()].map(([code,d])=>[code,{...d,caIci:d.ca,caAil:ailMap.get(code)?.ca||0}]);
  }else if(resolvedMode==='ailleurs'){
    entries=[...ailMap.entries()].map(([code,d])=>[code,{...d,caIci:iciMap.get(code)?.ca||0,caAil:d.ca}]);
  }else{
    for(const[code,ail]of ailMap){
      const caIci=iciMap.get(code)?.ca||0;
      const gap=ail.ca-caIci;
      if(gap>0)entries.push([code,{ca:gap,caIci,caAil:ail.ca,nbClients:ail.nbClients,nbBL:ail.nbBL}]);
    }
  }
  entries.sort((a,b)=>b[1].ca-a[1].ca);
  return{mode:resolvedMode,entries};
}

function renderTopArticles({selectedTopClient,topArtMode,topArtLimit,ruptureClientSet,finalDataIndex}) {
  if(!selectedTopClient)return renderEmptyArticles();
  if(!hasTopContext({selectedTopClient,pocheActive:''}))return '';

  const {mode,entries}=buildArticleEntries({selectedTopClient,mode:topArtMode,finalDataIndex});
  if(!entries.length){
    const emptyMsg={ici:'acheté ici',ailleurs:'acheté ailleurs',manquants:'manquant',subies:'en rupture pour ce client'};
    return `<div class="p-3 text-[11px] t-disabled italic mb-3">Aucun article ${emptyMsg[mode]||''} pour ce client.</div>`;
  }

  const sorted=entries.slice(0,topArtLimit);
  const mkRow=([code,d])=>{
    const lib=(_S.libelleLookup?.[code]||code).replace(/^\d{6} - /,'');
    const r=finalDataIndex?.get(code);
    const stock=r?(r.stockActuel>0?`<span class="c-ok">${r.stockActuel}</span>`:'<span class="c-danger">0</span>'):'<span class="t-disabled">—</span>';
    const caCol=mode==='subies'||mode==='manquants'?'c-danger':mode==='ailleurs'?'c-caution':'c-action';
    const vsCol=mode==='subies'?`<span class="c-ok">${formatEuro(d.caIci)}</span> / <span class="c-caution">${formatEuro(d.caAil)}</span>`
      :mode==='ici'?(d.caAil>0?`<span class="c-caution">${formatEuro(d.caAil)}</span>`:'<span class="t-disabled">—</span>')
      :mode==='ailleurs'?(d.caIci>0?`<span class="c-ok">${formatEuro(d.caIci)}</span>`:'<span class="t-disabled">—</span>')
      :`<span class="t-disabled">${formatEuro(d.caIci)}</span> → <span class="c-caution">${formatEuro(d.caAil)}</span>`;
    return `<tr class="border-b b-light hover:s-hover">
      <td class="py-1.5 px-2 font-mono text-[10px] t-tertiary">${code}</td>
      <td class="py-1.5 px-2 text-[11px] font-semibold t-primary truncate max-w-[180px]">${escapeHtml(lib)}</td>
      <td class="py-1.5 px-2 text-right font-bold ${caCol}">${formatEuro(d.ca)}</td>
      <td class="py-1.5 px-2 text-center text-[10px] whitespace-nowrap">${vsCol}</td>
      <td class="py-1.5 px-2 text-center text-[10px] t-secondary">${d.nbClients}</td>
      <td class="py-1.5 px-2 text-center">${stock}</td>
      <td class="py-1.5 px-2 text-center text-[10px]">${renderSqBadge(code)}</td>
    </tr>`;
  };

  const canExpand=entries.length>20&&topArtLimit<=20;
  const canCollapse=topArtLimit>20;
  const toggleBtn=canExpand
    ?`<button onclick="window._comTopArtToggle()" class="text-[10px] c-action hover:underline cursor-pointer font-semibold px-3 py-2 border-t b-default block w-full text-left">Voir le top 100 → (${Math.min(entries.length,100)-20} de plus)</button>`
    :canCollapse
    ?`<button onclick="window._comTopArtToggle()" class="text-[10px] c-action hover:underline cursor-pointer font-semibold px-3 py-2 border-t b-default block w-full text-left">← Revenir au top 20</button>`
    :'';

  const modeLabels={ici:'🏪 Ici',ailleurs:'📡 Ailleurs',manquants:'🎯 Manquants',subies:'💔 Subies'};
  const caHeaders={ici:'CA PDV',ailleurs:'CA Ailleurs',manquants:'Écart',subies:'CA Total'};
  const vsHeaders={ici:'Ailleurs',ailleurs:'PDV',manquants:'PDV → Ailleurs',subies:'PDV / Ailleurs'};
  const hasSubies=ruptureClientSet?.has(selectedTopClient);
  const tabModes=hasSubies?['ici','ailleurs','manquants','subies']:['ici','ailleurs','manquants'];
  const modeTabs=tabModes.map(m=>`<button onclick="window._comTopArtMode('${m}')" class="text-[10px] px-2 py-1 rounded-full font-semibold cursor-pointer transition-colors ${m===mode?'bg-indigo-500/30 text-indigo-300':'t-disabled hover:text-white'}">${modeLabels[m]}</button>`).join('');
  const clientName=escapeHtml(_S.clientStore?.get(selectedTopClient)?.nom||selectedTopClient);

  return `<details open style="background:linear-gradient(135deg,rgba(99,102,241,0.12),rgba(79,70,229,0.06));border:1px solid rgba(99,102,241,0.25);border-radius:14px;margin-bottom:12px">
    <summary style="padding:14px 20px;cursor:pointer;display:flex;align-items:center;justify-content:space-between;background:linear-gradient(135deg,rgba(99,102,241,0.18),rgba(79,70,229,0.10));border-bottom:1px solid rgba(99,102,241,0.2);list-style:none;position:sticky;top:0;z-index:2" class="select-none">
      <h3 style="font-weight:800;font-size:13px;color:#a5b4fc;display:flex;align-items:center;gap:6px">📦 ${clientName} — Top ${topArtLimit>20?topArtLimit:20} articles <span style="font-size:10px;font-weight:400;color:rgba(255,255,255,0.45)">${entries.length} réf.</span></h3>
      <span class="acc-arrow" style="color:#a5b4fc">▶</span>
    </summary>
    <div class="flex gap-1 px-4 py-2 border-b b-default">${modeTabs}</div>
    <div class="overflow-x-auto"><table class="min-w-full text-xs">
      <thead class="s-panel-inner t-inverse font-bold"><tr>
        <th class="py-2 px-2 text-left">Code</th>
        <th class="py-2 px-2 text-left">Article</th>
        <th class="py-2 px-2 text-right">${caHeaders[mode]}</th>
        <th class="py-2 px-2 text-center">${vsHeaders[mode]}</th>
        <th class="py-2 px-2 text-center">Clients</th>
        <th class="py-2 px-2 text-center">Stock</th>
        <th class="py-2 px-2 text-center">Statut Sq.</th>
      </tr></thead>
      <tbody>${sorted.map(mkRow).join('')}</tbody>
    </table></div>
    ${toggleBtn}
  </details>`;
}

function renderTopClients({selectedTopClient,pocheActive,pocheData,ruptureClientSet,passesClient}) {
  const com=_S._selectedCommercial;
  const ccs=_S.clientsByCommercial?.get(com);
  if(!ccs?.size)return '';

  const pocheCcs=pocheActive
    ?(pocheActive==='E'?(ruptureClientSet?.size?ruptureClientSet:null):new Set((pocheData?.[pocheActive]||[]).map(c=>c.cc)))
    :null;
  const curYear=new Date().getFullYear();
  const ymRange={min:curYear*12,max:curYear*12+11};
  const clients=[];

  for(const cc of ccs){
    if(pocheCcs&&!pocheCcs.has(cc))continue;
    const info=_S.chalandiseData?.get(cc);
    if(!passesClient(info,cc))continue;
    const rec=_S.clientStore?.get(cc);
    const caPDV=_S._selectedUnivers.size?getUniversFilteredCA(cc):(rec?.caPDV||0);
    const caPDV26=getClientCAMagasinInMonthRange(cc,ymRange)??caPDV;
    const caZone=info.ca2026||rec?.caTotal||caPDV26||0;
    const gap=Math.max(0,caZone-caPDV26);
    const silence=rec?.silenceDaysPDV??999;
    const caAutres=rec?.caAutresAgences||0;
    let score=gap;
    if(silence>=30&&caPDV26>0)score+=caPDV26*0.5;
    if(caAutres>0)score+=caAutres*0.3;
    if(score<=0&&caPDV26<=0)continue;
    clients.push({cc,nom:rec?.nom||info.nom||cc,metier:rec?.metier||info.metier||'',classification:info.classification||'',caPDV,caZone,gap,silence,caAutres,score});
  }

  clients.sort((a,b)=>b.score-a.score);
  const top=clients.slice(0,20);
  if(!top.length)return '<div class="p-3 text-[11px] t-disabled italic mb-3">Aucun client avec signal pour ce filtre.</div>';

  const labels={A:'Vivier non PDV',B:'Proches agence',C:'Livrés hors PDV',D:'Vu ailleurs',E:'Ruptures / Irritants'};
  const colors={A:'var(--c-danger)',B:'#f59e0b',C:'#8b5cf6',D:'var(--c-ok)',E:'#f87171'};
  const titleColor=pocheActive?colors[pocheActive]:'#fde047';
  const titleLabel=pocheActive?labels[pocheActive]+' — ':'';

  const mkRow=c=>{
    const isSelected=c.cc===selectedTopClient;
    const clCls=c.classification?.startsWith('FID')?'c-ok':c.classification?.startsWith('OCC')?'c-caution':'t-disabled';
    const silTxt=c.silence<999?`${c.silence}j`:'—';
    const silCls=c.silence>=60?'c-danger':c.silence>=30?'c-caution':'c-ok';
    const gapTxt=c.gap>0?`<span class="c-danger">${formatEuro(c.gap)}</span>`:'<span class="t-disabled">—</span>';
    let tag='';
    const impacted=ruptureClientSet?.has(c.cc);
    if(c.silence>=60&&c.caPDV>0)tag='<span class="text-[8px] px-1 py-0.5 rounded bg-red-900/40 text-red-300 font-bold">Silence</span>';
    else if(c.gap>c.caPDV&&c.caZone>500)tag='<span class="text-[8px] px-1 py-0.5 rounded bg-blue-900/40 text-blue-300 font-bold">Potentiel</span>';
    else if(c.caAutres>0)tag='<span class="text-[8px] px-1 py-0.5 rounded bg-amber-900/40 text-amber-300 font-bold">Multi-PDV</span>';
    else if(c.silence>=30&&c.caPDV>0)tag='<span class="text-[8px] px-1 py-0.5 rounded bg-orange-900/40 text-orange-300 font-bold">À relancer</span>';
    if(impacted)tag+=' <span class="text-[8px] px-1 py-0.5 rounded font-bold" style="background:rgba(239,68,68,0.25);color:#fca5a5" title="Client impacté par des ruptures">⚠️ Subies</span>';
    const selStyle=isSelected?'background:rgba(234,179,8,0.15);box-shadow:inset 3px 0 0 #fde047':'';
    return `<tr class="border-b b-light hover:s-hover cursor-pointer transition-colors" style="${selStyle}" onclick="window._selectTopClient('${escapeHtml(c.cc)}')">
      <td class="py-1.5 px-2 text-[11px] font-semibold t-primary">
        <span class="inline-flex items-center gap-1">${escapeHtml(c.nom)}<button onclick="event.stopPropagation();openClient360('${escapeHtml(c.cc)}','terrain')" class="text-[10px] t-disabled hover:text-white cursor-pointer opacity-30 hover:opacity-100 transition-opacity" title="Ouvrir la fiche 360°">🔍</button>${tag}</span>
      </td>
      <td class="py-1.5 px-2 text-[10px] t-tertiary">${escapeHtml(c.metier||'—')}</td>
      <td class="py-1.5 px-2 text-center text-[10px] ${clCls}">${escapeHtml(c.classification||'—')}</td>
      <td class="py-1.5 px-2 text-right font-bold c-action text-[11px]">${formatEuro(c.caPDV)}</td>
      <td class="py-1.5 px-2 text-right text-[11px]">${gapTxt}</td>
      <td class="py-1.5 px-2 text-center text-[10px] ${silCls}">${silTxt}</td>
    </tr>`;
  };

  return `<details open style="background:linear-gradient(135deg,rgba(234,179,8,0.10),rgba(202,138,4,0.05));border:1px solid rgba(234,179,8,0.25);border-radius:14px;overflow:hidden;margin-bottom:12px">
    <summary style="padding:14px 20px;cursor:pointer;display:flex;align-items:center;justify-content:space-between;background:linear-gradient(135deg,rgba(234,179,8,0.15),rgba(202,138,4,0.08));border-bottom:1px solid rgba(234,179,8,0.2);list-style:none" class="select-none">
      <h3 style="font-weight:800;font-size:13px;color:${titleColor};display:flex;align-items:center;gap:6px">⚡ ${titleLabel}Top 20 clients <span style="font-size:10px;font-weight:400;color:rgba(255,255,255,0.45)">${clients.length} clients avec signal</span></h3>
      <span class="acc-arrow" style="color:${titleColor}">▶</span>
    </summary>
    <div style="max-height:280px;overflow-y:auto"><table class="min-w-full text-xs">
      <thead class="s-panel-inner t-inverse font-bold sticky top-0" style="z-index:1"><tr>
        <th class="py-2 px-2 text-left">Client</th>
        <th class="py-2 px-2 text-left">Métier</th>
        <th class="py-2 px-2 text-center">Classif</th>
        <th class="py-2 px-2 text-right">CA PDV</th>
        <th class="py-2 px-2 text-right">Écart zone</th>
        <th class="py-2 px-2 text-center">Silence</th>
      </tr></thead>
      <tbody>${top.map(mkRow).join('')}</tbody>
    </table></div>
  </details>`;
}

export function renderCommercialTopActions({
  selectedTopClient='',
  pocheActive='',
  pocheData={A:[],B:[],C:[],D:[]},
  ruptureClientSet=new Set(),
  topArtMode='ici',
  topArtLimit=20,
  finalDataIndex=new Map(),
  passesClient=()=>true
}={}) {
  const com=_S._selectedCommercial;
  const hasForcage=!!_S.forcageCommercial?.size;
  if(!com||(!_S.chalandiseReady&&!hasForcage))return '';

  const clientsHtml=renderTopClients({selectedTopClient,pocheActive,pocheData,ruptureClientSet,passesClient});
  if(!selectedTopClient)return clientsHtml+renderEmptyArticles();
  if(!hasTopContext({selectedTopClient,pocheActive}))return clientsHtml;
  return clientsHtml+renderTopArticles({selectedTopClient,topArtMode,topArtLimit,ruptureClientSet,finalDataIndex});
}
