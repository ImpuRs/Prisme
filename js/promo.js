// © 2026 Jawad El Barkaoui — Tous droits réservés
// ═══════════════════════════════════════════════════════════════
// PRISME — promo.js
// Ciblage Promo — recherche, suggestions, ciblage, export tournée
// Extrait de main.js (C5 — Sprint C)
// Dépend de : state, engine, utils, ui, constants
// ═══════════════════════════════════════════════════════════════
'use strict';

import { METIERS_STRATEGIQUES } from './constants.js';
import { cleanCode, formatEuro, readExcel } from './utils.js';
import { _S } from './state.js';
import { computeSPC, _clientPassesFilters } from './engine.js';
import { showToast } from './ui.js';

// Local helper (also defined inside _buildCockpitClient in main.js for that scope)
function _spcBadge(spc){if(spc==null)return'';const color=spc>=70?'c-danger font-extrabold':spc>=40?'c-caution font-bold':'t-disabled';return`<span class="text-[10px] ${color} ml-1" title="Score Potentiel Client (SPC)">${spc}</span>`;}

// ── 🎯 Ciblage Promo ──
let _promoLastResult=null;
function resetPromo(){_promoLastResult=null;}
let _promoSuggestTimer=null;
let _promoSuggestIdx=-1;
let _promoSuggestItems=[];
let _suggestClicking=false; // flag mousedown→blur pour éviter fermeture prématurée

function _onPromoInput(){
  clearTimeout(_promoSuggestTimer);
  _promoSuggestTimer=setTimeout(()=>{
    const q=(document.getElementById('promoSearchInput')||{}).value||'';
    if(q.trim().length<2){_closePromoSuggest();return;}
    _buildPromoSuggestions(q.trim());
  },150);
}

function _buildPromoSuggestions(q){
  const ql=q.toLowerCase();
  const terms=ql.split(/[\s,;]+/).filter(Boolean);
  // Families
  const famMap=new Map();
  for(const r of _S.finalData){const f=r.famille||'';if(!f)continue;if(terms.every(t=>f.toLowerCase().includes(t))){famMap.set(f,(famMap.get(f)||0)+1);}}
  for(const[code,f] of Object.entries(_S.articleFamille)){if(!f)continue;if(terms.every(t=>f.toLowerCase().includes(t))){if(!famMap.has(f))famMap.set(f,0);famMap.set(f,famMap.get(f)+1);}}
  const famSug=[...famMap.entries()].sort((a,b)=>b[1]-a[1]).slice(0,4).map(([fam,cnt])=>({type:'famille',label:fam,sub:cnt+' article'+(cnt!==1?'s':''),value:fam}));
  // Articles
  const artSug=[];const seen=new Set();
  const tryAdd=(code,lib,fam)=>{
    if(artSug.length>=4||seen.has(code))return;
    if(terms.every(t=>code.toLowerCase().includes(t)||lib.toLowerCase().includes(t)||(fam||'').toLowerCase().includes(t))){
      seen.add(code);
      artSug.push({type:'article',label:code+' · '+lib.slice(0,50)+(lib.length>50?'…':''),sub:fam||'',value:code});
    }
  };
  for(const r of _S.finalData){if(artSug.length>=4)break;tryAdd(r.code,_S.libelleLookup[r.code]||r.libelle||r.code,_S.articleFamille[r.code]||r.famille||'');}
  for(const[code,lib] of Object.entries(_S.libelleLookup)){if(artSug.length>=4)break;tryAdd(code,lib,_S.articleFamille[code]||'');}
  _promoSuggestItems=[...famSug,...artSug];
  _renderPromoSuggestions();
}

function _renderPromoSuggestions(){
  const box=document.getElementById('promoSuggestBox');if(!box)return;
  if(!_promoSuggestItems.length){_closePromoSuggest();return;}
  _promoSuggestIdx=-1;
  const famItems=_promoSuggestItems.filter(i=>i.type==='famille');
  const artItems=_promoSuggestItems.filter(i=>i.type==='article');
  let html='';
  if(famItems.length){
    html+=`<div class="promo-sug-group">Familles</div>`;
    for(const item of famItems){
      const idx=_promoSuggestItems.indexOf(item);
      html+=`<div class="promo-sug-item" data-idx="${idx}" onmousedown="_selectPromoSuggestion(${idx})"><span class="promo-sug-icon">📁</span><div><div class="promo-sug-label">${item.label}</div><div class="promo-sug-sub">${item.sub}</div></div></div>`;
    }
  }
  if(artItems.length){
    html+=`<div class="promo-sug-group">Articles</div>`;
    for(const item of artItems){
      const idx=_promoSuggestItems.indexOf(item);
      html+=`<div class="promo-sug-item" data-idx="${idx}" onmousedown="_selectPromoSuggestion(${idx})"><span class="promo-sug-icon">🔩</span><div><div class="promo-sug-label">${item.label}</div>${item.sub?`<div class="promo-sug-sub">${item.sub}</div>`:''}</div></div>`;
    }
  }
  box.innerHTML=html;box.classList.remove('hidden');
}

function _closePromoSuggest(){
  const box=document.getElementById('promoSuggestBox');if(box)box.classList.add('hidden');
  _promoSuggestIdx=-1;_promoSuggestItems=[];
}

function _selectPromoSuggestion(idx){
  const item=_promoSuggestItems[idx];if(!item)return;
  const inp=document.getElementById('promoSearchInput');if(inp)inp.value=item.value;
  _closePromoSuggest();runPromoSearch();
}

function _promoSuggestKeydown(e){
  const box=document.getElementById('promoSuggestBox');
  const isOpen=box&&!box.classList.contains('hidden');
  if(e.key==='ArrowDown'){
    if(!isOpen)return;e.preventDefault();
    _promoSuggestIdx=Math.min(_promoSuggestIdx+1,_promoSuggestItems.length-1);
    _promoSuggestHighlight();
  }else if(e.key==='ArrowUp'){
    if(!isOpen)return;e.preventDefault();
    _promoSuggestIdx=Math.max(_promoSuggestIdx-1,-1);
    _promoSuggestHighlight();
  }else if(e.key==='Enter'){
    e.preventDefault();
    if(isOpen&&_promoSuggestIdx>=0){_selectPromoSuggestion(_promoSuggestIdx);}
    else{_closePromoSuggest();runPromoSearch();}
  }else if(e.key==='Escape'){
    _closePromoSuggest();
  }
}

function _promoSuggestHighlight(){
  const box=document.getElementById('promoSuggestBox');if(!box)return;
  box.querySelectorAll('.promo-sug-item').forEach((el,i)=>{
    el.classList.toggle('promo-sug-sel',i===_promoSuggestIdx);
    if(i===_promoSuggestIdx)el.scrollIntoView({block:'nearest'});
  });
}

// ── Pattern standard autocomplete : mousedown flag + blur handler ──────────
// mousedown sur la suggestbox → armer le flag AVANT que blur ne se déclenche
document.addEventListener('mousedown',e=>{
  const box=document.getElementById('promoSuggestBox');
  if(box&&!box.classList.contains('hidden')&&box.contains(e.target))_suggestClicking=true;
});
// blur sur l'input : ferme la box sauf si un item de la suggestbox est cliqué
document.addEventListener('blur',e=>{
  if(e.target.id!=='promoSearchInput')return;
  if(_suggestClicking){_suggestClicking=false;return;}
  _closePromoSuggest();
},true); // capture=true : blur ne bulle pas

function runPromoSearch(){
  const raw=(document.getElementById('promoSearchInput')||{}).value||'';
  const terms=raw.split(/[\s,;]+/).map(t=>t.trim()).filter(Boolean);
  if(!terms.length){showToast('⚠️ Saisissez un code, une famille ou un mot-clé','warning');return;}
  if(!_S.finalData.length){showToast('⚠️ Chargez les données stock d\'abord','warning');return;}

  // 1. Match articles — _S.finalData first, then full _S.libelleLookup (réseau)
  const matchedCodes=new Set();
  for(const term of terms){
    const tl=term.toLowerCase();
    // a) PDV stock — use _S.libelleLookup as authoritative label source
    for(const r of _S.finalData){
      const lib=(_S.libelleLookup[r.code]||r.libelle||'').toLowerCase();
      const fam=(_S.articleFamille[r.code]||r.famille||'').toLowerCase();
      if(r.code===term||r.code.includes(term)||lib.includes(tl)||fam.includes(tl))
        matchedCodes.add(r.code);
    }
    // b) Network articles present in _S.libelleLookup but absent from PDV stock (ex: Dewalt hors rayon)
    for(const[code,lib] of Object.entries(_S.libelleLookup)){
      if(matchedCodes.has(code))continue;
      const libL=lib.toLowerCase();
      const famL=(_S.articleFamille[code]||'').toLowerCase();
      if(code===term||code.includes(term)||libL.includes(tl)||famL.includes(tl))
        matchedCodes.add(code);
    }
  }

  if(!matchedCodes.size){
    const matchInfo=document.getElementById('promoMatchInfo');
    if(matchInfo){matchInfo.textContent='Aucun article trouvé — essayez un autre mot-clé.';matchInfo.classList.remove('hidden');}
    showToast('Aucun article trouvé pour cette recherche','warning');
    return;
  }

  // 2. Matched families
  const matchedFamilles=new Set();
  for(const c of matchedCodes){
    const f=_S.articleFamille[c]||(_S.finalData.find(r=>r.code===c)||{}).famille;
    if(f)matchedFamilles.add(f);
  }

  // SECTION A: Déjà acheteurs PDV
  const buyerMap=new Map(); // cc → {nom,metier,commercial,ca,lastDate}
  for(const code of matchedCodes){
    const buyers=_S.articleClients.get(code);if(!buyers)continue;
    for(const cc of buyers){
      const artData=_S.ventesClientArticle.get(cc);if(!artData)continue;
      const d=artData.get(code);if(!d)continue;
      if(!buyerMap.has(cc)){
        const info=_S.chalandiseData.get(cc)||{};
        buyerMap.set(cc,{cc,nom:_S.clientNomLookup[cc]||info.nom||cc,metier:info.metier||'',commercial:info.commercial||'',ca:0,lastDate:_S.clientLastOrder.get(cc)||null});
      }
      buyerMap.get(cc).ca+=(d.sumCA||d.sumPrelevee||0);
    }
  }
  const sectionA=[...buyerMap.values()].sort((a,b)=>b.ca-a.ca);

  // SECTION B: Achètent ailleurs (actifs Legallais, dans métier pertinent, pas en PDV)
  const buyerCodes=new Set(buyerMap.keys());
  const targetMetiers=new Set();
  for(const c of sectionA)if(c.metier)targetMetiers.add(c.metier);
  // fallback: all families matched — use chalandise metiers of anyone who bought these families via territoire
  if(!targetMetiers.size&&_S.territoireReady){
    for(const l of _S.territoireLines){
      if(matchedFamilles.has(l.famille)&&l.clientCode){
        const info=_S.chalandiseData.get(l.clientCode)||{};if(info.metier)targetMetiers.add(info.metier);
      }
    }
  }
  const sectionB=[];
  if(_S.chalandiseReady&&_S.chalandiseData.size){
    // Clients who buy these families via territoire (other canals) but not at PDV
    const terrBuyers=new Set();
    if(_S.territoireReady){
      for(const l of _S.territoireLines){if(matchedFamilles.has(l.famille)&&l.clientCode&&!buyerCodes.has(l.clientCode))terrBuyers.add(l.clientCode);}
    }
    for(const cc of terrBuyers){
      const info=_S.chalandiseData.get(cc)||{};
      if(!_clientPassesFilters||_clientPassesFilters(info)){
        const terrCA=_S.territoireLines.filter(l=>l.clientCode===cc&&matchedFamilles.has(l.famille)).reduce((s,l)=>s+l.ca,0);
        sectionB.push({cc,nom:_S.clientNomLookup[cc]||info.nom||cc,metier:info.metier||'',commercial:info.commercial||'',ca2025:info.ca2025||0,terrCA});
      }
    }
    sectionB.sort((a,b)=>b.terrCA-a.terrCA||b.ca2025-a.ca2025);
  }

  // SECTION C: Prospects métier (jamais acheteurs, dans métiers cibles)
  const sectionC=[];
  if(_S.chalandiseReady&&_S.chalandiseData.size&&targetMetiers.size){
    for(const[cc,info] of _S.chalandiseData.entries()){
      if(buyerCodes.has(cc))continue; // already buyer
      if(sectionB.find(b=>b.cc===cc))continue; // already in B
      if(!targetMetiers.has(info.metier))continue;
      if(!_clientPassesFilters||_clientPassesFilters(info)){
        sectionC.push({cc,nom:info.nom||cc,metier:info.metier||'',classification:info.classification||'',commercial:info.commercial||'',ca2025:info.ca2025||0});
      }
    }
    sectionC.sort((a,b)=>b.ca2025-a.ca2025);
  }

  // Match info summary (built after section A so buyer count is known)
  {
    const matchInfo=document.getElementById('promoMatchInfo');
    if(matchInfo){
      const artLabel=matchedCodes.size+' article'+(matchedCodes.size!==1?'s':'');
      const famLabel=matchedFamilles.size?` · ${matchedFamilles.size} famille${matchedFamilles.size!==1?'s':''} (${[...matchedFamilles].slice(0,3).join(', ')}${matchedFamilles.size>3?'…':''})`:'' ;
      let html=`${artLabel} trouvé${matchedCodes.size!==1?'s':''}${famLabel} · <strong>${sectionA.length} acheteur${sectionA.length!==1?'s':''} PDV</strong>`;
      if(sectionA.length===0&&matchedCodes.size>0)
        html+=` — <span class="c-caution font-semibold">Aucun achat comptoir sur ces articles. ${matchedFamilles.size?'Les résultats B &amp; C recherchent dans les familles correspondantes.':''}</span>`;
      matchInfo.innerHTML=html;matchInfo.classList.remove('hidden');
    }
  }

  // B2: enrich sections with SPC and sort
  if(_S.chalandiseReady){
    for(const c of sectionA){const info=_S.chalandiseData.get(c.cc)||{};c.spc=computeSPC(c.cc,info);}
    sectionA.sort((a,b)=>(b.spc||0)-(a.spc||0));
    for(const c of sectionB){const info=_S.chalandiseData.get(c.cc)||{};c.spc=computeSPC(c.cc,info);}
    sectionB.sort((a,b)=>(b.spc||0)-(a.spc||0));
    for(const c of sectionC){const info=_S.chalandiseData.get(c.cc)||{};c.spc=computeSPC(c.cc,info);}
    sectionC.sort((a,b)=>(b.spc||0)-(a.spc||0));
  }
  // Section C : exclure Inactif/Perdu, trier par ca2025, plafonner à 50
  {
    const sC=sectionC.filter(c=>{const info=_S.chalandiseData.get(c.cc)||{};const statut=(info.statut||'').toLowerCase();return!statut.includes('inactif')&&!statut.includes('perdu');});
    sC.sort((a,b)=>(b.ca2025||0)-(a.ca2025||0));
    _promoLastResult={matchedCodes,sectionA,sectionB,sectionC:sC.slice(0,50),sectionCTotal:sC.length,terms,matchedFamilles};
  }
  _populatePromoFilterDropdowns();
  _renderPromoResults();
}

let _promoSfMap={}; // code → {famille, sousFamille}

function _populatePromoFilterDropdowns(){
  const r=_promoLastResult;if(!r)return;
  // Build sous-famille map from _S.finalData (once per search)
  _promoSfMap={};for(const row of _S.finalData)_promoSfMap[row.code]={famille:row.famille||'',sousFamille:row.sousFamille||''};
  const all=[...r.sectionA,...r.sectionB,...r.sectionC];
  const uniq=(key)=>[...new Set(all.map(c=>c[key]||'').filter(Boolean))].sort();
  const fill=(id,vals)=>{
    const sel=document.getElementById(id);if(!sel)return;
    const cur=sel.value;
    const first=sel.options[0].outerHTML;
    sel.innerHTML=first+vals.map(v=>`<option value="${v}">${v}</option>`).join('');
    if(vals.includes(cur))sel.value=cur;
  };
  // Famille + Sous-famille from matchedCodes
  const famSet=new Set();const sfSet=new Set();
  for(const code of r.matchedCodes){
    const f=_S.articleFamille[code]||_promoSfMap[code]?.famille||'';
    const sf=_promoSfMap[code]?.sousFamille||'';
    if(f)famSet.add(f);if(sf)sfSet.add(sf);
  }
  fill('promoFilterFamille',[...famSet].sort());
  fill('promoFilterSousFamille',[...sfSet].sort());
  fill('promoFilterMetier',uniq('metier'));
  fill('promoFilterCommercial',uniq('commercial'));
  fill('promoFilterClassif',uniq('classification'));
  // Departments from _S.chalandiseData cp field
  const depts=new Set();
  for(const c of all){const info=_S.chalandiseData.get(c.cc)||{};const cp=(info.cp||'').replace(/\s/g,'');if(cp.length>=2)depts.add(cp.slice(0,2));}
  fill('promoFilterDept',[...depts].sort());
  // Show refinement panel
  const ph=document.getElementById('promoFiltersPlaceholder');const rf=document.getElementById('promoRefinementFilters');
  if(ph)ph.classList.add('hidden');if(rf)rf.classList.remove('hidden');
}

function _onPromoFamilleChange(){
  const fam=(document.getElementById('promoFilterFamille')||{}).value||'';
  // Primary entry point: no prior search — fill search bar and trigger search
  if(fam&&!_promoLastResult){
    const si=document.getElementById('promoSearchInput');if(si)si.value=fam;
    runPromoSearch();
    return;
  }
  // Cascade: repopulate sous-famille to only those within selected famille
  const r=_promoLastResult;if(!r)return;
  const sfSel=document.getElementById('promoFilterSousFamille');if(!sfSel)return;
  const cur=sfSel.value;
  const sfSet=new Set();
  for(const code of r.matchedCodes){
    if(fam&&(_S.articleFamille[code]||_promoSfMap[code]?.famille||'')!==fam)continue;
    const sf=_promoSfMap[code]?.sousFamille||'';if(sf)sfSet.add(sf);
  }
  const first=sfSel.options[0].outerHTML;
  const vals=[...sfSet].sort();
  sfSel.innerHTML=first+vals.map(v=>`<option value="${v}">${v}</option>`).join('');
  if(vals.includes(cur))sfSel.value=cur; else sfSel.value='';
  _applyPromoFilters();
}

function _applyPromoFilters(){_renderPromoResults();}

// B4: Mode Action Promo
let _promoMode='analyse';
function _setPromoMode(mode){
  _promoMode=mode;
  const accueil=document.getElementById('promoAccueil');if(accueil)accueil.classList.add('hidden');
  const aBtn=document.getElementById('promoModeAnalyse');
  const xBtn=document.getElementById('promoModeAction');
  const actionView=document.getElementById('promoActionView');
  if(aBtn)aBtn.className=mode==='analyse'?'text-xs font-bold py-1 px-3 rounded-full border c-action border-blue-300':'text-xs font-bold py-1 px-3 rounded-full border t-disabled b-default';
  if(aBtn&&mode==='analyse')aBtn.style.background='rgba(59,130,246,.1)';else if(aBtn)aBtn.style.background='';
  if(xBtn)xBtn.className=mode==='action'?'text-xs font-bold py-1 px-3 rounded-full border c-danger border-red-300':'text-xs font-bold py-1 px-3 rounded-full border t-disabled b-default';
  if(xBtn&&mode==='action')xBtn.style.background='rgba(239,68,68,.1)';else if(xBtn)xBtn.style.background='';
  if(actionView)actionView.classList.toggle('hidden',mode!=='action');
  document.querySelectorAll('#tabPromo .tab-content-section').forEach(el=>el.classList.toggle('hidden',mode==='action'));
  if(mode==='action')_renderPromoActionView();
}
function exportTourneeCSV(){
  const r=_promoLastResult;
  if(!r){showToast('⚠️ Lancez une recherche Promo d\'abord','warning');return;}
  const allClients=new Map();
  for(const c of[...(r.sectionA||[]),...(r.sectionB||[]),...(r.sectionC||[])]){if(!allClients.has(c.cc))allClients.set(c.cc,c);}
  const ranked=[...allClients.values()].map(c=>{
    const info=_S.chalandiseData.get(c.cc)||{};
    const spc=c.spc||computeSPC(c.cc,info);
    const lastOrder=_S.clientLastOrder.get(c.cc);
    const lastOrderStr=lastOrder?lastOrder.toISOString().slice(0,10):'—';
    const cp=(info.cp||'').replace(/\s/g,'');
    const ville=info.ville||'';
    const artMap=_S.ventesClientArticle.get(c.cc)||new Map();
    const toPitch=[];
    for(const code of r.matchedCodes){
      if(artMap.has(code))continue;
      const ref=_S.finalData.find(d=>d.code===code);
      if(ref&&ref.stockActuel>0)toPitch.push({code,lib:ref.libelle||code});
      if(toPitch.length>=3)break;
    }
    return{cc:c.cc,nom:c.nom||info.nom||c.cc,spc,cp,ville,metier:info.metier||'',commercial:info.commercial||'',lastOrderStr,toPitch,ca:c.ca||0};
  }).filter(c=>c.spc>=20).sort((a,b)=>a.cp.localeCompare(b.cp)||b.spc-a.spc);
  if(!ranked.length){showToast('Aucun client qualifié pour la tournée','warning');return;}
  const SEP=';';
  const header=['Code','Nom','SPC','CP','Ville','Métier','Commercial','Dernière cde','Article 1','Article 2','Article 3','CA'].join(SEP);
  const rows=ranked.map(c=>{
    const arts=c.toPitch.map(a=>`${a.code} ${a.lib}`);
    return[c.cc,`"${c.nom}"`,c.spc,c.cp,`"${c.ville}"`,`"${c.metier}"`,`"${c.commercial}"`,c.lastOrderStr,`"${arts[0]||''}"`,`"${arts[1]||''}"`,`"${arts[2]||''}"`,c.ca>0?Math.round(c.ca):''].join(SEP);
  });
  const content='\uFEFF'+header+'\n'+rows.join('\n');
  const blob=new Blob([content],{type:'text/csv;charset=utf-8;'});
  const link=document.createElement('a');
  link.href=URL.createObjectURL(blob);
  link.download=`PRISME_Tournee_${(r.terms||['promo'])[0]}_${new Date().toISOString().slice(0,10)}.csv`;
  document.body.appendChild(link);link.click();document.body.removeChild(link);
  URL.revokeObjectURL(link.href);
  showToast(`📄 Fiche tournée : ${ranked.length} clients exportés`,'success');
}
function _renderPromoActionView(){
  const r=_promoLastResult;
  if(!r){const el=document.getElementById('promoActionClients');if(el)el.innerHTML='<p class="t-tertiary text-sm">Lancez d\'abord une recherche Promo.</p>';return;}
  const allClients=new Map();
  for(const c of[...r.sectionA,...r.sectionB,...r.sectionC]){if(!allClients.has(c.cc))allClients.set(c.cc,c);}
  const ranked=[...allClients.values()].map(c=>({...c,spc:c.spc!=null?c.spc:computeSPC(c.cc,_S.chalandiseData.get(c.cc)||{})})).sort((a,b)=>(b.spc||0)-(a.spc||0)).slice(0,10);
  const titre=r._fromImport?`📋 ${r._opName||'Opération promo'} — Clients à relancer`:'Top 10 — Qui appeler';
  const clientsEl=document.getElementById('promoActionClients');
  if(clientsEl)clientsEl.innerHTML=`<div class="flex items-center justify-between mb-2"><span class="text-[10px] font-bold t-tertiary uppercase">${titre}</span><button onclick="exportTourneeCSV()" class="text-[10px] font-bold py-1 px-2 rounded c-action i-info-bg border">📄 Fiche tournée CSV</button></div>`+ranked.map((c,i)=>{const info=_S.chalandiseData.get(c.cc)||{};return`<div class="p-2 s-card rounded-lg border cursor-pointer hover:shadow-md transition-shadow" onclick="_showActionArticles('${c.cc}')"><div class="flex items-center gap-2"><span class="font-extrabold text-sm c-action">#${i+1}</span><div class="flex-1 min-w-0"><div class="flex items-center gap-1 flex-wrap"><span class="font-bold text-sm">${c.nom||c.cc}</span>${_spcBadge(c.spc)}</div><div class="text-[10px] t-tertiary">${info.metier||''} ${info.commercial?'· '+info.commercial:''}</div></div></div></div>`;}).join('');
  if(ranked.length>0)_showActionArticles(ranked[0].cc);
}
function _showActionArticles(cc){
  const el=document.getElementById('promoActionArticles');if(!el)return;
  const r=_promoLastResult;if(!r){el.innerHTML='<p class="t-tertiary text-sm">Aucune recherche active.</p>';return;}
  const info=_S.chalandiseData.get(cc)||{};
  const artMap=_S.ventesClientArticle.get(cc)||new Map();
  const terrCodes=new Set((_S.territoireLines||[]).filter(l=>l.clientCode===cc).map(l=>l.code));
  const horsMagCodes=new Set((_S.ventesClientHorsMagasin?.get(cc)||new Map()).keys());
  const candidates=[...r.matchedCodes].filter(code=>!artMap.has(code)&&!terrCodes.has(code)&&!horsMagCodes.has(code));
  const myStore=_S.ventesParMagasin[_S.selectedMyStore]||{};
  const isPepite=new Set((_S.benchLists?.pepitesOther||[]).map(a=>a.code));
  candidates.sort((a,b)=>{const pa=isPepite.has(a)?1:0,pb=isPepite.has(b)?1:0;if(pa!==pb)return pb-pa;return(myStore[b]?.countBL||0)-(myStore[a]?.countBL||0);});
  const enStock=candidates.filter(c=>{const ref=_S.finalData.find(d=>d.code===c);return ref?ref.stockActuel>0:false;});
  const enRupture=candidates.filter(c=>{const ref=_S.finalData.find(d=>d.code===c);return ref?ref.stockActuel<=0:false;});
  const pitchCodes=[...enStock.slice(0,5),...enRupture.slice(0,2)];
  const toPitch=pitchCodes.map(code=>{const ref=_S.finalData.find(d=>d.code===code);const lib=_S.libelleLookup[code]||(ref?ref.libelle:code);const stock=ref?ref.stockActuel:null;return{code,lib,stock};});
  const nom=info.nom||_S.clientNomLookup[cc]||cc;
  el.innerHTML=`<p class="text-[10px] t-tertiary mb-2">Articles pour <strong>${nom}</strong> :</p>`+(toPitch.length===0?'<p class="t-disabled text-sm">Client achète déjà tous les articles promo au PDV.</p>':`<div class="space-y-1">${toPitch.slice(0,15).map(a=>{const sb=a.stock===null?'<span class="t-disabled text-[9px]">Non réf.</span>':a.stock>0?`<span class="c-ok text-[9px] font-bold">${a.stock} en stock</span>`:'<span class="c-danger text-[9px] font-bold">⚠️ Rupture — à commander</span>';return`<div class="flex items-center gap-2 py-1 px-2 s-card-alt rounded text-[11px]"><span class="font-mono t-disabled">${a.code}</span><span class="flex-1 truncate">${a.lib}</span>${sb}</div>`;}).join('')}${toPitch.length>15?`<p class="text-[10px] t-disabled mt-1">+ ${toPitch.length-15} articles</p>`:''}</div>`);
}

function _resetPromoFilters(){
  ['promoFilterFamille','promoFilterSousFamille','promoFilterMetier','promoFilterCommercial','promoFilterClassif','promoFilterDept'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});
  const ca=document.getElementById('promoFilterCAMin');if(ca)ca.value='';
  const st=document.getElementById('promoFilterStrat');if(st)st.checked=false;
  _renderPromoResults();
}

function _renderPromoResults(){
  const r=_promoLastResult;if(!r)return;
  const fmtD=d=>{if(!d)return'—';try{return d.toLocaleDateString('fr-FR',{day:'2-digit',month:'2-digit',year:'2-digit'});}catch{return'—';}};
  // Read refinement filters
  const fFamille=(document.getElementById('promoFilterFamille')||{}).value||'';
  const fSousFamille=(document.getElementById('promoFilterSousFamille')||{}).value||'';
  const fMetier=(document.getElementById('promoFilterMetier')||{}).value||'';
  const fComm=(document.getElementById('promoFilterCommercial')||{}).value||'';
  const fClassif=(document.getElementById('promoFilterClassif')||{}).value||'';
  const fCAMin=parseFloat((document.getElementById('promoFilterCAMin')||{}).value)||0;
  const fDept=(document.getElementById('promoFilterDept')||{}).value||'';
  const fStrat=(document.getElementById('promoFilterStrat')||{}).checked||false;
  // Article-level famille/sous-famille check for section A
  const _passFamA=(cc)=>{
    if(!fFamille&&!fSousFamille)return true;
    const artData=_S.ventesClientArticle.get(cc);if(!artData)return false;
    for(const code of artData.keys()){
      if(!r.matchedCodes.has(code))continue;
      const f=_S.articleFamille[code]||_promoSfMap[code]?.famille||'';
      const sf=_promoSfMap[code]?.sousFamille||'';
      if(fFamille&&f!==fFamille)continue;
      if(fSousFamille&&sf!==fSousFamille)continue;
      return true;
    }
    return false;
  };
  // Famille check for section B (via _S.territoireLines, sous-famille not available)
  const _passFamB=(cc)=>{
    if(!fFamille&&!fSousFamille)return true;
    if(!_S.territoireReady)return true;
    for(const l of _S.territoireLines){
      if(l.clientCode!==cc)continue;
      if(!r.matchedFamilles.has(l.famille))continue;
      if(fFamille&&l.famille!==fFamille)continue;
      return true;
    }
    return false;
  };
  const pass=(c,caField,famCheck)=>{
    if(famCheck&&!famCheck(c.cc))return false;
    if(fMetier&&(c.metier||'')!==fMetier)return false;
    if(fComm&&(c.commercial||'')!==fComm)return false;
    if(fClassif&&(c.classification||'')!==fClassif)return false;
    if(fCAMin>0&&((c[caField]||0))<fCAMin)return false;
    if(fDept){const info=_S.chalandiseData.get(c.cc)||{};const cp=(info.cp||'').replace(/\s/g,'').slice(0,2);if(cp!==fDept)return false;}
    if(fStrat){const info=_S.chalandiseData.get(c.cc)||{};const m=(info.metier||c.metier||'').toLowerCase();if(!METIERS_STRATEGIQUES.some(s=>m===s||m.includes(s)))return false;}
    return true;
  };
  const sA=r.sectionA.filter(c=>pass(c,'ca',_passFamA));
  const sB=r.sectionB.filter(c=>pass(c,'ca2025',_passFamB));
  const sC=r.sectionC.filter(c=>pass(c,'ca2025',null));
  // Section A
  document.getElementById('promoCountA').textContent=sA.length+(sA.length<r.sectionA.length?' / '+r.sectionA.length:'');
  document.getElementById('promoTableA').innerHTML=sA.slice(0,200).map(c=>{
    const inChal=_S.chalandiseReady&&_S.chalandiseData.has(c.cc);
    const horsZoneBadge=!inChal?'<span class="ml-1 text-[9px] s-hover t-disabled border b-default rounded px-1 py-0.5 font-normal">hors zone</span>':'';
    const metierCell=c.metier||(!inChal?'<span class="t-disabled text-[9px]">hors zone</span>':'—');
    const commCell=c.commercial||(!inChal?'<span class="t-disabled text-[9px]">hors zone</span>':'—');
    return`<tr class="border-t b-light hover:i-ok-bg cursor-pointer" onclick="_togglePromoClientArts(this,'${c.cc}')"><td class="py-1 px-2 font-mono t-disabled text-[9px]">${c.cc}</td><td class="py-1 px-2 font-semibold">${c.nom}${horsZoneBadge}${_spcBadge(c.spc)}</td><td class="py-1 px-2 t-tertiary">${metierCell}</td><td class="py-1 px-2 text-right font-bold c-ok">${c.ca>0?formatEuro(c.ca):'—'}</td><td class="py-1 px-2 text-center t-tertiary">${fmtD(c.lastDate)}</td><td class="py-1 px-2 t-tertiary">${commCell}</td></tr>`;
  }).join('');
  // Section B
  document.getElementById('promoCountB').textContent=sB.length+(sB.length<r.sectionB.length?' / '+r.sectionB.length:'');
  document.getElementById('promoTableB').innerHTML=sB.length?sB.slice(0,200).map(c=>`<tr class="border-t border-red-50 hover:i-danger-bg"><td class="py-1 px-2 font-mono t-tertiary">${c.cc}</td><td class="py-1 px-2 font-semibold">${c.nom}${_spcBadge(c.spc)}</td><td class="py-1 px-2 t-tertiary">${c.metier||'—'}</td><td class="py-1 px-2 text-right font-bold c-danger">${c.ca2025>0?formatEuro(c.ca2025):'—'}</td><td class="py-1 px-2 t-tertiary">${c.commercial||'—'}</td></tr>`).join(''):'<tr><td colspan="5" class="py-3 text-center t-disabled">'+(_S.territoireReady?'Aucun acheteur hors PDV identifié':'Chargez le fichier Le Terrain pour activer cette vue')+'</td></tr>';
  // Section C
  document.getElementById('promoCountC').textContent=sC.length+(r.sectionCTotal>sC.length?' / '+r.sectionCTotal:'');
  {const extraNote=(r.sectionCTotal||0)>50?`<tr><td colspan="6" class="py-2 text-center text-[10px] t-tertiary italic">${(r.sectionCTotal)-50} autres prospects — filtrer par métier ou secteur pour les voir</td></tr>`:'';
  document.getElementById('promoTableC').innerHTML=sC.length?sC.slice(0,200).map(c=>`<tr class="border-t border-orange-50 hover:i-caution-bg"><td class="py-1 px-2 font-mono t-tertiary">${c.cc}</td><td class="py-1 px-2 font-semibold">${c.nom}${_spcBadge(c.spc)}</td><td class="py-1 px-2 t-tertiary">${c.metier||'—'}</td><td class="py-1 px-2 text-right font-bold c-caution">${c.ca2025>0?formatEuro(c.ca2025):'—'}</td><td class="py-1 px-2 t-tertiary">${c.classification||'—'}</td><td class="py-1 px-2 t-tertiary">${c.commercial||'—'}</td></tr>`).join('')+extraNote:'<tr><td colspan="6" class="py-3 text-center t-disabled">'+(_S.chalandiseReady?'Aucun prospect identifié dans les métiers cibles':'Chargez la Zone de Chalandise pour activer cette vue')+'</td></tr>';}
  document.getElementById('promoResults').classList.remove('hidden');
  document.getElementById('promoExportBtn').classList.remove('hidden');
  document.getElementById('promoCopyBtn').classList.remove('hidden');
  _setPromoMode(_promoMode);
}

function _togglePromoSection(sec){
  const body=document.getElementById('promoBody'+sec);const arrow=document.getElementById('promoArrow'+sec);
  if(!body)return;const open=body.style.display==='none';body.style.display=open?'':'none';if(arrow)arrow.textContent=open?'▲':'▼';
}

function _togglePromoClientArts(row,cc){
  const next=row.nextElementSibling;
  if(next&&next.classList.contains('promo-art-panel')){next.remove();return;}
  const r=_promoLastResult;if(!r)return;
  const artData=_S.ventesClientArticle.get(cc);
  if(!artData||!artData.size){
    const tr=document.createElement('tr');tr.className='promo-art-panel';
    tr.innerHTML=`<td colspan="6" class="py-2 px-4 i-ok-bg text-[10px] t-disabled italic">Aucune donnée article disponible pour ce client.</td>`;
    row.after(tr);return;
  }
  // Filter to matchedCodes only, sort by CA desc, top 10
  const rows=[...artData.entries()]
    .filter(([code])=>r.matchedCodes.has(code))
    .sort((a,b)=>(b[1].sumCA||b[1].sumPrelevee||0)-(a[1].sumCA||a[1].sumPrelevee||0))
    .slice(0,10);
  const allRows=rows.length?rows:[...artData.entries()].sort((a,b)=>(b[1].sumCA||b[1].sumPrelevee||0)-(a[1].sumCA||a[1].sumPrelevee||0)).slice(0,10);
  const note=!rows.length?'<p class="text-[9px] c-caution mb-1">Aucun achat direct sur la sélection — top articles tous codes confondus :</p>':'';
  const fmtD=d=>{try{return d?d.toLocaleDateString('fr-FR',{day:'2-digit',month:'2-digit',year:'2-digit'}):'—';}catch{return'—';}};
  const lastDate=_S.clientLastOrder.get(cc);
  const trs=allRows.map(([code,d])=>{
    const lib=_S.libelleLookup[code]||(_S.finalData.find(x=>x.code===code)||{}).libelle||code;
    const ca=d.sumCA||d.sumPrelevee||0;
    return`<tr class="border-t b-light"><td class="py-0.5 px-2 font-mono t-disabled text-[9px]">${code}</td><td class="py-0.5 px-2 t-primary">${lib}</td><td class="py-0.5 px-2 text-center t-tertiary">${d.countBL||'—'}</td><td class="py-0.5 px-2 text-right font-bold c-ok">${ca>0?formatEuro(ca):'—'}</td><td class="py-0.5 px-2 text-center t-disabled">${fmtD(lastDate)}</td></tr>`;
  }).join('');
  const tr=document.createElement('tr');tr.className='promo-art-panel';
  tr.innerHTML=`<td colspan="6" class="py-2 px-4 i-ok-bg border-b b-light">${note}<table class="min-w-full text-[10px]"><thead class="i-ok-bg c-ok font-bold"><tr><th class="py-0.5 px-2 text-left">Code</th><th class="py-0.5 px-2 text-left">Libellé</th><th class="py-0.5 px-2 text-center">Qté</th><th class="py-0.5 px-2 text-right">CA</th><th class="py-0.5 px-2 text-center">Dernier achat</th></tr></thead><tbody>${trs}</tbody></table></td>`;
  row.after(tr);
}

function exportPromoCSV(){
  const r=_promoLastResult;if(!r){showToast('Lancez d\'abord une recherche','warning');return;}
  const SEP=';';const lines=['CIBLAGE PROMO — '+r.terms.join(' '),''];
  lines.push('=== A. ACHETEURS PDV ===');
  lines.push(['Code','Nom','Métier','CA sélection','Dernier achat','Commercial'].join(SEP));
  const fmtD=d=>{try{return d?d.toLocaleDateString('fr-FR'):''}catch{return '';}};
  for(const c of r.sectionA)lines.push([c.cc,`"${c.nom}"`,`"${c.metier}"`,c.ca.toFixed(2).replace('.',','),fmtD(c.lastDate),`"${c.commercial}"`].join(SEP));
  lines.push('');lines.push('=== B. ACHÈTENT AILLEURS ===');
  lines.push(['Code','Nom','Métier','CA Legallais','Commercial'].join(SEP));
  for(const c of r.sectionB)lines.push([c.cc,`"${c.nom}"`,`"${c.metier}"`,c.ca2025.toFixed(2).replace('.',','),`"${c.commercial}"`].join(SEP));
  lines.push('');lines.push('=== C. PROSPECTS MÉTIER ===');
  lines.push(['Code','Nom','Métier','CA Legallais','Classification','Commercial'].join(SEP));
  for(const c of r.sectionC)lines.push([c.cc,`"${c.nom}"`,`"${c.metier}"`,c.ca2025.toFixed(2).replace('.',','),`"${c.classification}"`,`"${c.commercial}"`].join(SEP));
  const blob=new Blob([lines.join('\n')],{type:'text/csv;charset=utf-8;'});
  const link=document.createElement('a');link.href=URL.createObjectURL(blob);link.download=`PRISME_Promo_${r.terms[0]||'ciblage'}_${new Date().toISOString().slice(0,10)}.csv`;document.body.appendChild(link);link.click();document.body.removeChild(link);URL.revokeObjectURL(link.href);showToast('📥 CSV Ciblage téléchargé','success');
}

function copyPromoClipboard(){
  const r=_promoLastResult;if(!r){showToast('Lancez d\'abord une recherche','warning');return;}
  const fmtD=d=>{try{return d?d.toLocaleDateString('fr-FR'):''}catch{return '';}};
  const lines=['🎯 Ciblage promo : '+r.terms.join(' '),''];
  lines.push(`🟢 Acheteurs PDV (${r.sectionA.length}) :`);
  r.sectionA.slice(0,20).forEach(c=>lines.push(`  ${c.nom} | ${c.metier||'—'} | ${c.ca>0?formatEuro(c.ca):'—'} | dernier achat: ${fmtD(c.lastDate)}`));
  if(r.sectionA.length>20)lines.push(`  … et ${r.sectionA.length-20} autres`);
  lines.push('');
  lines.push(`🔴 Achètent ailleurs (${r.sectionB.length}) :`);
  r.sectionB.slice(0,10).forEach(c=>lines.push(`  ${c.nom} | ${c.metier||'—'} | CA Leg: ${c.ca2025>0?formatEuro(c.ca2025):'—'}`));
  if(r.sectionB.length>10)lines.push(`  … et ${r.sectionB.length-10} autres`);
  lines.push('');
  lines.push(`🟠 Prospects métier (${r.sectionC.length}) :`);
  r.sectionC.slice(0,10).forEach(c=>lines.push(`  ${c.nom} | ${c.metier||'—'} | ${c.classification||'—'} | CA Leg: ${c.ca2025>0?formatEuro(c.ca2025):'—'}`));
  if(r.sectionC.length>10)lines.push(`  … et ${r.sectionC.length-10} autres`);
  navigator.clipboard.writeText(lines.join('\n')).then(()=>showToast('📋 Liste copiée dans le presse-papier','success')).catch(()=>showToast('Échec de la copie','error'));
}


// ─── PROMO V2 — Import opération ─────────────────────────────────────────
let _promoImportResult=null; // {opName, promoCodes, sectionD, sectionE, sectionF}

function _onPromoImportFileChange(input){
  const f=input.files[0];if(!f)return;
  document.getElementById('promoImportFileName').textContent=f.name;
}

function _clearPromoImport(){
  document.getElementById('promoCodesInput').value='';
  document.getElementById('promoImportFile').value='';
  document.getElementById('promoImportFileName').textContent='Aucun fichier sélectionné';
  document.getElementById('promoImportOpName').textContent='';
  document.getElementById('promoImportBlock').classList.add('hidden');
  document.getElementById('promoImportExportBtn').classList.add('hidden');
  _promoImportResult=null;
}

async function runPromoImport(){
  if(!_S.finalData.length){showToast('⚠️ Chargez les données stock d\'abord','warning');return;}
  let promoCodes=new Set();let opName='';
  // 1. Try XLSX file first
  const fileInput=document.getElementById('promoImportFile');
  if(fileInput&&fileInput.files[0]){
    try{
      const data=await readExcel(fileInput.files[0]);
      // Detect Qlik promo format
      const colMap={};if(data[0]){for(const k of Object.keys(data[0])){const kl=k.toLowerCase().trim();if(kl.includes('code article')||kl==='code')colMap.code=k;else if(kl.includes('opération')||kl.includes('operation'))colMap.op=k;}}
      for(const row of data){
        const raw0=String(row[colMap.code]||'').trim().split('_')[0].trim();
        const code=cleanCode(raw0).replace(/^0+/,'');
        if(/^\d{6}$/.test(code))promoCodes.add(code);
        if(!opName&&colMap.op&&row[colMap.op])opName=String(row[colMap.op]).trim();
      }
    }catch(e){showToast('⚠️ Erreur lecture fichier : '+e.message,'error');return;}
  }
  // 2. Fallback to textarea
  if(!promoCodes.size){
    const raw=(document.getElementById('promoCodesInput')||{}).value||'';
    for(const line of raw.split(/[\r\n,;]+/)){const c=cleanCode(line.trim().split('_')[0].trim()).replace(/^0+/,'');if(/^\d{6}$/.test(c))promoCodes.add(c);}
  }
  if(!promoCodes.size){showToast('⚠️ Aucun code article valide trouvé (format attendu : 6 chiffres)','warning');return;}

  // Display op name
  const opEl=document.getElementById('promoImportOpName');
  if(opEl)opEl.textContent=opName?'— '+opName:'— '+promoCodes.size+' articles';

  // Build article label + stock lookup
  const stockByCode=new Map();for(const r of _S.finalData)stockByCode.set(r.code,r);

  // ── SECTION D : Articles vendus au comptoir ─────────────────────────────
  const sectionD=[];
  for(const code of promoCodes){
    let qtyTotal=0,caTotal=0,buyers=new Set();
    for(const[cc,artMap] of _S.ventesClientArticle.entries()){
      const d=artMap.get(code);if(!d)continue;
      buyers.add(cc);qtyTotal+=(d.sumPrelevee||0);caTotal+=(d.sumCA||d.sumPrelevee||0);
    }
    if(buyers.size>0||caTotal>0){
      const ref=stockByCode.get(code)||{};
      const lib=_S.libelleLookup[code]||ref.libelle||code;
      sectionD.push({code,lib,qtyTotal,caTotal,nbClients:buyers.size,stock:ref.stockActuel??null,famille:ref.famille||_S.articleFamille[code]||''});
    }
  }
  sectionD.sort((a,b)=>b.caTotal-a.caTotal);

  // ── SECTION E : Articles NON vendus ─────────────────────────────────────
  const soldCodes=new Set(sectionD.map(x=>x.code));
  const sectionE=[];
  for(const code of promoCodes){
    if(soldCodes.has(code))continue;
    const ref=stockByCode.get(code)||{};
    const lib=_S.libelleLookup[code]||ref.libelle||code;
    const stock=ref.stockActuel??null;
    const inRayon=ref.ancienMin>0||ref.ancienMax>0;
    const rayonStatus=stock===null?'❌ Absent':stock>0?'✅ En rayon':inRayon?'⚠️ Rupture':'❌ Absent';
    sectionE.push({code,lib,rayonStatus,stock,famille:ref.famille||_S.articleFamille[code]||''});
  }
  sectionE.sort((a,b)=>a.lib.localeCompare(b.lib));

  // ── SECTION F : Clients à relancer ──────────────────────────────────────
  // Families covered by the promo
  const promoFams=new Set();
  for(const code of promoCodes){const f=_S.articleFamille[code]||(stockByCode.get(code)||{}).famille||'';if(f)promoFams.add(f);}
  // Helper: true si cc a déjà acheté un article promo (comptoir + territoire + hors magasin)
  const _dejaAcheteur=(cc,promoCodes)=>{
    const comptoir=_S.ventesClientArticle.get(cc)||new Map();
    const terr=new Set((_S.territoireLines||[]).filter(l=>l.clientCode===cc).map(l=>l.code));
    const hors=new Set((_S.ventesClientHorsMagasin?.get(cc)||new Map()).keys());
    return[...promoCodes].some(code=>comptoir.has(code)||terr.has(code)||hors.has(code));
  };
  // Clients who buy the family but not the promo articles (any channel)
  const sectionF=[];
  for(const[cc,artMap] of _S.ventesClientArticle.entries()){
    if(_dejaAcheteur(cc,promoCodes))continue;
    // Check if client buys any article in the promo families
    let famCA=0;let famStr='';
    for(const[code,d] of artMap.entries()){
      const f=_S.articleFamille[code]||(stockByCode.get(code)||{}).famille||'';
      if(promoFams.has(f)){famCA+=(d.sumCA||d.sumPrelevee||0);if(!famStr)famStr=f;}
    }
    if(famCA>0){
      const info=_S.chalandiseData.get(cc)||{};
      const nom=_S.clientNomLookup[cc]||info.nom||cc;
      const raison=`Achète ${famStr||[...promoFams][0]||'la famille'} mais pas la promo`;
      sectionF.push({cc,nom,metier:info.metier||'',commercial:info.commercial||'',famCA,raison,statut:info.statut||''});
    }
  }
  sectionF.sort((a,b)=>b.famCA-a.famCA);

  _promoImportResult={opName,promoCodes,sectionD,sectionE,sectionF};
  _renderPromoImportResults();
  // Auto-open the details block
  const zone=document.getElementById('promoImportZone');if(zone)zone.open=true;
  showToast(`📥 Opération analysée : ${sectionD.length} vendus · ${sectionE.length} non vendus · ${sectionF.length} à relancer`,'success');
}

function _activatePromoImportAction(){
  const r=_promoImportResult;
  if(!r||!r.promoCodes.size){showToast('⚠️ Chargez d\'abord une opération promo','warning');return;}
  const allTargets=new Map();
  for(const c of r.sectionF){
    allTargets.set(c.cc,{cc:c.cc,nom:c.nom,metier:c.metier,commercial:c.commercial,ca2025:_S.chalandiseData.get(c.cc)?.ca2025||0,terrCA:0});
  }
  _promoLastResult={terms:[r.opName||'Opération promo'],matchedCodes:r.promoCodes,sectionA:[],sectionB:[...allTargets.values()],sectionC:[],_fromImport:true,_opName:r.opName};
  _setPromoMode('action');
  _renderPromoActionView();
  showToast(`⚡ ${r.sectionF.length} clients chargés pour l'opération "${r.opName||'Promo'}"`, 'success');
}
window._activatePromoImportAction=_activatePromoImportAction;

function _renderPromoImportResults(){
  const r=_promoImportResult;if(!r)return;
  const block=document.getElementById('promoImportBlock');if(block)block.classList.remove('hidden');
  // Summary
  const sold=r.sectionD.length,unsold=r.sectionE.length,retarget=r.sectionF.length;
  const totalCA=r.sectionD.reduce((s,x)=>s+x.caTotal,0);
  const sumEl=document.getElementById('promoImportSummary');
  if(sumEl)sumEl.innerHTML=`<strong>${r.promoCodes.size}</strong> articles opération · <span class="c-ok">${sold} vendus (${formatEuro(totalCA)} CA Comptoir)</span> · <span class="c-danger">${unsold} non vendus</span> · <span class="c-caution">${retarget} clients à relancer</span>${r.opName?` · <em>${r.opName}</em>`:''}`;
  // Section D
  document.getElementById('promoImportCountD').textContent=sold;
  document.getElementById('promoImportTableD').innerHTML=r.sectionD.slice(0,200).map(x=>{
    const stockCell=x.stock===null?'<span class="t-disabled">Non référencé</span>':x.stock>0?`<span class="c-ok font-bold">${x.stock}</span>`:'<span class="c-danger">0</span>';
    return`<tr class="border-t b-light hover:i-ok-bg"><td class="py-1 px-2 font-mono t-disabled">${x.code}</td><td class="py-1 px-2 font-semibold truncate max-w-[180px]" title="${x.lib}">${x.lib}</td><td class="py-1 px-2 text-center">${Math.round(x.qtyTotal)}</td><td class="py-1 px-2 text-right font-bold c-ok">${x.caTotal>0?formatEuro(x.caTotal):'—'}</td><td class="py-1 px-2 text-center">${x.nbClients}</td><td class="py-1 px-2 text-center">${stockCell}</td></tr>`;
  }).join('')||'<tr><td colspan="6" class="py-3 text-center t-disabled">Aucun article vendu</td></tr>';
  // Section E
  document.getElementById('promoImportCountE').textContent=unsold;
  document.getElementById('promoImportTableE').innerHTML=r.sectionE.slice(0,200).map(x=>{
    const stockCell=x.stock===null?'—':`${x.stock}`;
    return`<tr class="border-t border-red-50 hover:i-danger-bg"><td class="py-1 px-2 font-mono t-disabled">${x.code}</td><td class="py-1 px-2 font-semibold truncate max-w-[180px]" title="${x.lib}">${x.lib}</td><td class="py-1 px-2 text-center text-xs">${x.rayonStatus}</td><td class="py-1 px-2 text-center">${stockCell}</td><td class="py-1 px-2 t-tertiary text-[10px] truncate max-w-[120px]">${x.famille||'—'}</td></tr>`;
  }).join('')||'<tr><td colspan="5" class="py-3 text-center c-ok font-semibold">✅ Tous les articles promo ont été vendus au comptoir</td></tr>';
  // Section F
  document.getElementById('promoImportCountF').textContent=retarget;
  document.getElementById('promoImportTableF').innerHTML=r.sectionF.slice(0,200).map(x=>{
    const statutBadge=x.statut?`<span class="text-[9px] s-hover t-disabled border b-default rounded px-1 font-normal ml-1">${x.statut}</span>`:'';
    return`<tr class="border-t border-orange-50 hover:i-caution-bg"><td class="py-1 px-2 font-mono t-disabled">${x.cc}</td><td class="py-1 px-2 font-semibold">${x.nom}${statutBadge}</td><td class="py-1 px-2 t-tertiary">${x.metier||'—'}</td><td class="py-1 px-2 text-right font-bold c-caution">${x.famCA>0?formatEuro(x.famCA):'—'}</td><td class="py-1 px-2 t-tertiary text-[10px]">${x.raison}</td><td class="py-1 px-2 t-tertiary">${x.commercial||'—'}</td></tr>`;
  }).join('')||'<tr><td colspan="6" class="py-3 text-center t-disabled">'+(_S.ventesClientArticle.size?'Aucun client à relancer identifié':'Données comptoir non disponibles')+'</td></tr>';
  // Show export button
  document.getElementById('promoImportExportBtn').classList.remove('hidden');
  // Bouton "Préparer les appels"
  const btnContainer=document.getElementById('promoImportActionBtn');
  if(btnContainer){
    const btnHtml=`<div class="mt-3 pt-3 border-t b-light flex items-center justify-between"><p class="text-[11px] t-tertiary">Section F : ${r.sectionF.length} clients à relancer</p><button onclick="_activatePromoImportAction()" class="text-sm font-bold py-2 px-4 rounded-lg bg-orange-500 hover:bg-orange-600 text-white">⚡ Préparer les appels →</button></div>`;
    btnContainer.innerHTML=btnHtml;
    btnContainer.classList.remove('hidden');
  }
}

function _togglePromoImportSection(sec){
  const body=document.getElementById('promoImportBody'+sec);const arrow=document.getElementById('promoImportArrow'+sec);
  if(!body)return;
  const isHidden=body.dataset.collapsed==='1';
  body.dataset.collapsed=isHidden?'0':'1';
  body.style.display=isHidden?'':'none';
  if(arrow)arrow.textContent=isHidden?'▼':'▶';
}

function exportPromoImportCSV(){
  const r=_promoImportResult;if(!r){showToast('Lancez d\'abord l\'analyse','warning');return;}
  const SEP=';';const lines=[`ANALYSE OPÉRATION PROMO${r.opName?' — '+r.opName:''} — ${r.promoCodes.size} articles`,''];
  lines.push('=== D. ARTICLES VENDUS AU COMPTOIR ===');
  lines.push(['Code','Libellé','Qté PDV','CA Comptoir','Nb clients','Stock'].join(SEP));
  for(const x of r.sectionD)lines.push([x.code,`"${x.lib}"`,Math.round(x.qtyTotal),x.caTotal.toFixed(2).replace('.',','),x.nbClients,x.stock===null?'non référencé':x.stock].join(SEP));
  lines.push('');lines.push('=== E. ARTICLES NON VENDUS ===');
  lines.push(['Code','Libellé','Rayon','Stock','Famille'].join(SEP));
  for(const x of r.sectionE)lines.push([x.code,`"${x.lib}"`,x.rayonStatus,x.stock===null?'':x.stock,`"${x.famille}"`].join(SEP));
  lines.push('');lines.push('=== F. CLIENTS À RELANCER ===');
  lines.push(['Code','Nom','Métier','CA famille','Raison','Commercial'].join(SEP));
  for(const x of r.sectionF)lines.push([x.cc,`"${x.nom}"`,`"${x.metier}"`,x.famCA.toFixed(2).replace('.',','),`"${x.raison}"`,`"${x.commercial}"`].join(SEP));
  const blob=new Blob([lines.join('\n')],{type:'text/csv;charset=utf-8;'});
  const nm=`PRISME_PromoImport${r.opName?'_'+r.opName.replace(/[^a-z0-9]/gi,'_'):'_operation'}_${new Date().toISOString().slice(0,10)}.csv`;
  const link=document.createElement('a');link.href=URL.createObjectURL(blob);link.download=nm;document.body.appendChild(link);link.click();document.body.removeChild(link);URL.revokeObjectURL(link.href);showToast('📥 CSV opération téléchargé','success');
}
// ─────────────────────────────────────────────────────────────────────────

export { _onPromoInput, _closePromoSuggest, _selectPromoSuggestion, _promoSuggestKeydown, runPromoSearch, _onPromoFamilleChange, _applyPromoFilters, _setPromoMode, exportTourneeCSV, _showActionArticles, _resetPromoFilters, _togglePromoSection, _togglePromoClientArts, exportPromoCSV, copyPromoClipboard, _onPromoImportFileChange, _clearPromoImport, runPromoImport, _togglePromoImportSection, exportPromoImportCSV, resetPromo, _activatePromoImportAction };
