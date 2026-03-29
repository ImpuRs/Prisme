// © 2026 Jawad El Barkaoui — Tous droits réservés
// ═══════════════════════════════════════════════════════════════
// PRISME — promo.js
// Ciblage Promo — recherche, suggestions, ciblage, export tournée
// Extrait de main.js (C5 — Sprint C)
// Dépend de : state, engine, utils, ui, constants
// ═══════════════════════════════════════════════════════════════
'use strict';

import { METIERS_STRATEGIQUES } from './constants.js';
import { cleanCode, formatEuro, readExcel, escapeHtml, famLib, famLabel, normalizeStr, matchQuery } from './utils.js';
import { _S } from './state.js';
import { DataStore } from './store.js'; // Strangler Fig Étape 5
import { computeSPC, _clientPassesFilters } from './engine.js';
import { showToast } from './ui.js';

// Local helper (also defined inside _buildCockpitClient in main.js for that scope)
function _spcBadge(spc){if(spc==null)return'';const color=spc>=70?'c-danger font-extrabold':spc>=40?'c-caution font-bold':'t-disabled';return`<span class="text-[10px] ${color} ml-1" title="Score Potentiel Client (SPC)">${spc}</span>`;}

// ── 🎯 Ciblage Promo ──
let _promoSearchResult=null;   // résultat recherche libre
function resetPromo(){_promoSearchResult=null;}
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
  // Families
  const famMap=new Map();
  // r.famille est maintenant un code ("C02") — chercher sur code ET libellé
  const famCodes = new Set();
  for(const r of DataStore.finalData){
    const code = r.famille||'';
    if(!code) continue;
    famCodes.add(code);
  }
  for(const code of Object.values(_S.articleFamille)){
    if(code) famCodes.add(code);
  }
  for(const famCode of famCodes){
    if(matchQuery(q, famLib(famCode), famCode, famLabel(famCode))){
      const cnt = [...DataStore.finalData].filter(r=>r.famille===famCode).length;
      famMap.set(famCode, cnt);
    }
  }
  const famSug=[...famMap.entries()].sort((a,b)=>b[1]-a[1]).slice(0,4)
    .map(([famCode,cnt])=>({
      type:'famille',
      label: famLabel(famCode),   // "C02 · Coupe" affiché
      sub: cnt+' article'+(cnt!==1?'s':''),
      value: famCode              // "C02" mis dans l'input au clic
    }));
  // Articles
  const artSug=[];const seen=new Set();
  const tryAdd=(code,lib,fam)=>{
    if(artSug.length>=4||seen.has(code))return;
    if(matchQuery(q, code, lib, fam||'')){
      seen.add(code);
      artSug.push({type:'article',label:code+' · '+lib.slice(0,50)+(lib.length>50?'…':''),sub:fam||'',value:code});
    }
  };
  for(const r of DataStore.finalData){if(artSug.length>=4)break;tryAdd(r.code,_S.libelleLookup[r.code]||r.libelle||r.code,famLib(_S.articleFamille[r.code]||r.famille||''));}
  for(const[code,lib] of Object.entries(_S.libelleLookup)){if(artSug.length>=4)break;tryAdd(code,lib,famLib(_S.articleFamille[code]||''));}
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
  // ── NL couche : détection d'intention langage naturel ──
  const nlParsed = _parseNLQuery(raw);
  if (nlParsed) { _dispatchNLQuery(nlParsed.intent, nlParsed.params, raw); return; }
  const terms=raw.split(/[\s,;]+/).map(t=>t.trim()).filter(Boolean);
  if(!terms.length){showToast('⚠️ Saisissez un code, une famille ou un mot-clé','warning');return;}
  if(!DataStore.finalData.length){showToast('⚠️ Chargez les données stock d\'abord','warning');return;}

  // 1. Match articles — DataStore.finalData first, then full _S.libelleLookup (réseau)
  const matchedCodes=new Set();
  for(const term of terms){
    const tl=normalizeStr(term);
    // a) PDV stock — use _S.libelleLookup as authoritative label source
    for(const r of DataStore.finalData){
      const lib=normalizeStr(_S.libelleLookup[r.code]||r.libelle||'');
      const famCode = _S.articleFamille[r.code]||r.famille||'';
      const famL = normalizeStr(famLib(famCode));
      const famFull = normalizeStr(famLabel(famCode));
      if(r.code===term||normalizeStr(r.code).includes(tl)||lib.includes(tl)||
         normalizeStr(famCode).includes(tl)||famL.includes(tl)||famFull.includes(tl))
        matchedCodes.add(r.code);
    }
    // b) Network articles present in _S.libelleLookup but absent from PDV stock (ex: Dewalt hors rayon)
    for(const[code,lib] of Object.entries(_S.libelleLookup)){
      if(matchedCodes.has(code))continue;
      const libL=normalizeStr(lib);
      const famCode2 = _S.articleFamille[code]||'';
      const famL2 = normalizeStr(famLib(famCode2));
      const famFull2 = normalizeStr(famLabel(famCode2));
      if(code===term||normalizeStr(code).includes(tl)||libL.includes(tl)||
         normalizeStr(famCode2).includes(tl)||famL2.includes(tl)||famFull2.includes(tl))
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
    const _fc=_S.articleFamille[c]||(DataStore.finalData.find(r=>r.code===c)||{}).famille||'';
    const f=famLib(_fc);
    if(f)matchedFamilles.add(f);
  }

  // SECTION A: acheteurs tous canaux (MAGASIN + hors magasin + territoire)
  const buyerMap=new Map(); // cc → {nom,metier,commercial,ca,lastDate,canal}

  const _gc = _S._globalCanal || '';

  // Source 1 : MAGASIN — skippé si filtre canal non-MAGASIN
  if(!_gc || _gc === 'MAGASIN'){
    for(const [cc,artMap] of DataStore.ventesClientArticle.entries()){
      for(const code of artMap.keys()){
        if(!matchedCodes.has(code))continue;
        if(!buyerMap.has(cc)){
          const info=_S.chalandiseData?.get(cc)||{};
          buyerMap.set(cc,{cc,nom:_S.clientNomLookup[cc]||info.nom||cc,metier:info.metier||'',commercial:info.commercial||'',ca:0,lastDate:_S.clientLastOrder.get(cc)||null,canal:'PDV'});
        }
        buyerMap.get(cc).ca+=(artMap.get(code)?.sumCA||0);
      }
    }
  }

  // Source 2 : hors magasin (WEB/REP/DCS) — skippé si filtre canal MAGASIN
  if(_gc !== 'MAGASIN'){
    for(const [cc,artMap] of (_S.ventesClientHorsMagasin||new Map()).entries()){
      for(const [code,data] of artMap.entries()){
        if(!matchedCodes.has(code))continue;
        if(_gc && data.canal !== _gc)continue; // filtre canal spécifique
        if(!buyerMap.has(cc)){
          const info=_S.chalandiseData?.get(cc)||{};
          buyerMap.set(cc,{cc,nom:_S.clientNomLookup[cc]||info.nom||cc,metier:info.metier||'',commercial:info.commercial||'',ca:0,lastDate:_S.clientLastOrder.get(cc)||null,canal:data.canal});
        }
        buyerMap.get(cc).ca+=(data.ca||0);
        // Marquer le canal si hors PDV
        if(buyerMap.get(cc).canal==='PDV')buyerMap.get(cc).canal='MIXTE';
        else buyerMap.get(cc).canal=data.canal;
      }
    }
  }

  // Source 3 : territoire (si chargé)
  if(_S.territoireReady){
    for(const l of DataStore.territoireLines){
      if(!matchedCodes.has(l.code))continue;
      const cc=l.clientCode;if(!cc)continue;
      if(!buyerMap.has(cc)){
        const info=_S.chalandiseData?.get(cc)||{};
        buyerMap.set(cc,{cc,nom:_S.clientNomLookup[cc]||info.nom||cc,metier:info.metier||'',commercial:info.commercial||'',ca:0,lastDate:_S.clientLastOrder.get(cc)||null,canal:'TERR'});
      }
      buyerMap.get(cc).ca+=(l.ca||0);
    }
  }

  const sectionA=[...buyerMap.values()].sort((a,b)=>b.ca-a.ca);

  // SECTION B: Achètent ailleurs (actifs Legallais, dans métier pertinent, pas en PDV)
  const buyerCodes=new Set(buyerMap.keys());
  const targetMetiers=new Set();
  for(const c of sectionA)if(c.metier)targetMetiers.add(c.metier);
  // fallback: all families matched — use chalandise metiers of anyone who bought these families via territoire
  if(!targetMetiers.size&&_S.territoireReady){
    for(const l of DataStore.territoireLines){
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
      for(const l of DataStore.territoireLines){if(matchedFamilles.has(l.famille)&&l.clientCode&&!buyerCodes.has(l.clientCode))terrBuyers.add(l.clientCode);}
    }
    for(const cc of terrBuyers){
      const info=_S.chalandiseData.get(cc)||{};
      if(!_clientPassesFilters||_clientPassesFilters(info)){
        const terrCA=DataStore.territoireLines.filter(l=>l.clientCode===cc&&matchedFamilles.has(l.famille)).reduce((s,l)=>s+l.ca,0);
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
    _promoSearchResult={matchedCodes,sectionA,sectionB,sectionC:sC.slice(0,50),sectionCTotal:sC.length,terms,matchedFamilles};
  }
  _populatePromoFilterDropdowns();
  _renderSearchResults();
}

let _promoSfMap={}; // code → {famille, sousFamille}

function _populatePromoFilterDropdowns(){
  const r=_promoSearchResult;if(!r)return;
  // Build sous-famille map from DataStore.finalData (once per search)
  _promoSfMap={};for(const row of DataStore.finalData)_promoSfMap[row.code]={famille:row.famille||'',sousFamille:row.sousFamille||''};
  const all=[...r.sectionA,...r.sectionB,...r.sectionC];
  const uniq=(key)=>[...new Set(all.map(c=>c[key]||'').filter(Boolean))].sort();
  const fill=(id,vals,labelFn)=>{
    const sel=document.getElementById(id);if(!sel)return;
    const cur=sel.value;
    const first=sel.options[0].outerHTML;
    sel.innerHTML=first+vals.map(v=>`<option value="${escapeHtml(v)}">${escapeHtml(labelFn?labelFn(v):v)}</option>`).join('');
    if(vals.includes(cur))sel.value=cur;
  };
  // Famille + Sous-famille from matchedCodes (store famLib labels as values)
  const famSet=new Set();const sfSet=new Set();
  for(const code of r.matchedCodes){
    const _fc=_S.articleFamille[code]||_promoSfMap[code]?.famille||'';
    const f=famLib(_fc);
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
}

function _onPromoFamilleChange(){
  const fam=(document.getElementById('promoFilterFamille')||{}).value||'';
  // Primary entry point: no prior search — fill search bar and trigger search
  if(fam&&!_promoSearchResult){
    const si=document.getElementById('promoSearchInput');if(si)si.value=fam;
    runPromoSearch();
    return;
  }
  // Cascade: repopulate sous-famille to only those within selected famille
  const r=_promoSearchResult;if(!r)return;
  const sfSel=document.getElementById('promoFilterSousFamille');if(!sfSel)return;
  const cur=sfSel.value;
  const sfSet=new Set();
  for(const code of r.matchedCodes){
    if(fam&&famLib(_S.articleFamille[code]||_promoSfMap[code]?.famille||'')!==fam)continue;
    const sf=_promoSfMap[code]?.sousFamille||'';if(sf)sfSet.add(sf);
  }
  const first=sfSel.options[0].outerHTML;
  const vals=[...sfSet].sort();
  sfSel.innerHTML=first+vals.map(v=>`<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`).join('');
  if(vals.includes(cur))sfSel.value=cur; else sfSel.value='';
  _applyPromoFilters();
}

function _applyPromoFilters(){_renderSearchResults();}

function exportTourneeCSV() {
  const sr = _promoSearchResult;
  const ir = _promoImportResult;
  if(!sr && !ir) { showToast('⚠️ Lancez d\'abord une recherche','warning'); return; }

  const matchedCodes = sr?.matchedCodes || ir?.promoCodes || new Set();
  const clients = sr
    ? [...(sr.sectionA||[]), ...(sr.sectionB||[]), ...(sr.sectionC||[])]
    : (ir?.sectionF||[]);

  const ranked = clients.map(c => {
    const info = _S.chalandiseData.get(c.cc) || {};
    const spc  = c.spc || computeSPC(c.cc, info);

    // Fix omnicanal : exclure les 3 canaux
    const artMapMag = DataStore.ventesClientArticle.get(c.cc)       || new Map();
    const terrCodes = new Set((DataStore.territoireLines||[]).filter(l=>l.clientCode===c.cc).map(l=>l.code));
    const horsCodes = new Set((_S.ventesClientHorsMagasin?.get(c.cc)||new Map()).keys());

    const toPitch = [];
    for(const code of matchedCodes) {
      if(artMapMag.has(code) || terrCodes.has(code) || horsCodes.has(code)) continue;
      const ref = DataStore.finalData.find(d=>d.code===code);
      if(ref && ref.stockActuel > 0) toPitch.push({ code, lib: ref.libelle||code });
      if(toPitch.length >= 3) break;
    }

    const lastOrder = _S.clientLastOrder.get(c.cc);
    return {
      cc: c.cc,
      nom: c.nom || info.nom || c.cc,
      spc,
      cp: (info.cp||'').replace(/\s/g,''),
      ville: info.ville||'',
      metier: info.metier||c.metier||'',
      commercial: info.commercial||c.commercial||'',
      lastOrderStr: lastOrder ? lastOrder.toISOString().slice(0,10) : '—',
      toPitch,
      ca: c.ca || c.famCA || 0
    };
  })
  .filter(c => c.spc >= 20)
  .sort((a,b) => a.cp.localeCompare(b.cp) || b.spc - a.spc);

  if(!ranked.length) { showToast('Aucun client qualifié (SPC ≥ 20)','warning'); return; }

  const SEP = ';';
  const label = sr ? (sr.terms||['promo'])[0] : (ir?.opName||'operation');
  const header = ['Code','Nom','SPC','CP','Ville','Métier','Commercial',
                  'Dernière cde','Article 1','Article 2','Article 3','CA'].join(SEP);
  const rows = ranked.map(c => {
    const arts = c.toPitch.map(a => `${a.code} ${a.lib}`);
    return [
      c.cc, `"${c.nom}"`, c.spc, c.cp, `"${c.ville}"`,
      `"${c.metier}"`, `"${c.commercial}"`, c.lastOrderStr,
      `"${arts[0]||''}"`, `"${arts[1]||''}"`, `"${arts[2]||''}"`,
      c.ca > 0 ? Math.round(c.ca) : ''
    ].join(SEP);
  });

  const blob = new Blob(['\uFEFF'+header+'\n'+rows.join('\n')], {type:'text/csv;charset=utf-8;'});
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `PRISME_Tournee_${label}_${new Date().toISOString().slice(0,10)}.csv`;
  document.body.appendChild(link); link.click();
  document.body.removeChild(link); URL.revokeObjectURL(link.href);
  showToast(`📄 Fiche tournée : ${ranked.length} clients`, 'success');
}

function _resetPromoFilters(){
  ['promoFilterFamille','promoFilterSousFamille','promoFilterMetier','promoFilterCommercial','promoFilterClassif','promoFilterDept'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});
  const ca=document.getElementById('promoFilterCAMin');if(ca)ca.value='';
  const st=document.getElementById('promoFilterStrat');if(st)st.checked=false;
  _renderSearchResults();
}

// ── Accordion client inline ────────────────────────────────────────────────

let _promoOpenCc = null; // cc de l'accordion actuellement ouvert

function _togglePromoClientRow(cc) {
  // Fermer le précédent
  if(_promoOpenCc && _promoOpenCc !== cc) {
    const prev = document.getElementById(`promoAcc_${_promoOpenCc}`);
    const prevChev = document.getElementById(`promoChevron_${_promoOpenCc}`);
    if(prev) { prev.classList.remove('open'); prev.innerHTML = ''; }
    if(prevChev) prevChev.style.transform = '';
  }

  const panel = document.getElementById(`promoAcc_${cc}`);
  const chev  = document.getElementById(`promoChevron_${cc}`);
  if(!panel) return;

  // Toggle : referme si même client
  if(_promoOpenCc === cc && panel.classList.contains('open')) {
    panel.classList.remove('open');
    panel.innerHTML = '';
    if(chev) chev.style.transform = '';
    _promoOpenCc = null;
    return;
  }

  // Ouvrir
  _promoOpenCc = cc;
  panel.classList.add('open');
  if(chev) chev.style.transform = 'rotate(90deg)';

  const pitchHTML  = _buildPitchHTML(cc);
  const achatsHTML = _buildAchatsHTML(cc);

  panel.innerHTML = `
    <div class="border-t b-default" style="background:var(--s-card-alt)">
      <div class="flex gap-1 px-3 py-1.5 border-b b-light">
        <button class="promo-acc-tab active"
                onclick="_switchPromoTab(this,'pitch','${cc}')">
          🎯 Ce que je propose
        </button>
        <button class="promo-acc-tab"
                onclick="_switchPromoTab(this,'achats','${cc}')">
          📋 Ses achats
        </button>
      </div>
      <div id="promoAccPitch_${cc}"  class="p-3 space-y-1">${pitchHTML}</div>
      <div id="promoAccAchats_${cc}" class="p-3 hidden">${achatsHTML}</div>
    </div>`;
}

function _switchPromoTab(btn, tab, cc) {
  const pitchEl  = document.getElementById(`promoAccPitch_${cc}`);
  const achatsEl = document.getElementById(`promoAccAchats_${cc}`);
  const tabs = btn.parentElement.querySelectorAll('.promo-acc-tab');
  tabs.forEach(t => t.classList.remove('active'));
  btn.classList.add('active');
  if(tab === 'pitch') {
    pitchEl?.classList.remove('hidden');
    achatsEl?.classList.add('hidden');
  } else {
    pitchEl?.classList.add('hidden');
    achatsEl?.classList.remove('hidden');
  }
}

function _buildPitchHTML(cc) {
  const matchedCodes = _promoSearchResult?.matchedCodes
                    || _promoImportResult?.promoCodes
                    || new Set();
  if(!matchedCodes.size) return '<p class="t-disabled text-[11px] py-1">Aucune recherche active.</p>';

  const artMap    = DataStore.ventesClientArticle.get(cc)        || new Map();
  const terrCodes = new Set((DataStore.territoireLines||[]).filter(l=>l.clientCode===cc).map(l=>l.code));
  const horsCodes = new Set((_S.ventesClientHorsMagasin?.get(cc)||new Map()).keys());

  const candidates = [...matchedCodes].filter(code =>
    !artMap.has(code) && !terrCodes.has(code) && !horsCodes.has(code)
  );

  const myStore  = _S.ventesParMagasin[_S.selectedMyStore] || {};
  const isPepite = new Set((_S.benchLists?.pepitesOther||[]).map(a=>a.code));

  candidates.sort((a,b) => {
    const pa = isPepite.has(a)?1:0, pb = isPepite.has(b)?1:0;
    if(pa !== pb) return pb - pa;
    return (myStore[b]?.countBL||0) - (myStore[a]?.countBL||0);
  });

  const enStock   = candidates.filter(c => (DataStore.finalData.find(d=>d.code===c)?.stockActuel||0) > 0);
  const enRupture = candidates.filter(c => {
    const ref = DataStore.finalData.find(d=>d.code===c);
    return ref ? ref.stockActuel <= 0 : false;
  });
  const pitch = [...enStock.slice(0,5), ...enRupture.slice(0,2)];

  if(!pitch.length) return '<p class="t-disabled text-[11px] py-1">✅ Client achète déjà tous les articles de la sélection.</p>';

  return pitch.map(code => {
    const ref   = DataStore.finalData.find(d=>d.code===code);
    const lib   = _S.libelleLookup[code] || ref?.libelle || code;
    const stock = ref?.stockActuel ?? null;
    const stockBadge = stock === null
      ? '<span class="t-disabled text-[9px]">Non réf.</span>'
      : stock > 0
        ? `<span class="c-ok text-[9px] font-bold">${stock} en stock</span>`
        : '<span class="c-danger text-[9px] font-bold">⚠️ Rupture</span>';
    const pepBadge = isPepite.has(code)
      ? '<span class="text-[8px] bg-amber-100 text-amber-700 rounded px-1 ml-1">⭐ Réseau</span>'
      : '';
    return `<div class="flex items-center gap-2 py-1 px-2 s-card rounded border b-light text-[11px]">
      <span class="font-mono t-disabled w-14 shrink-0">${code}</span>
      <span class="flex-1 truncate">${escapeHtml(lib)}${pepBadge}</span>
      ${stockBadge}
    </div>`;
  }).join('');
}

function _buildAchatsHTML(cc) {
  const artData = DataStore.ventesClientArticle.get(cc);
  if(!artData?.size) return '<p class="t-disabled text-[11px] py-1">Aucune donnée comptoir.</p>';

  const matchedCodes = _promoSearchResult?.matchedCodes;
  const rows = [...artData.entries()]
    .filter(([code]) => !matchedCodes || matchedCodes.has(code))
    .sort((a,b) => (b[1].sumCA||0) - (a[1].sumCA||0))
    .slice(0, 10);

  if(!rows.length) return '<p class="t-disabled text-[11px] py-1">Aucun achat sur cette sélection.</p>';

  return `<table class="min-w-full text-[10px]">
    <thead><tr class="t-tertiary font-bold border-b b-light">
      <th class="text-left py-0.5 px-1">Code</th>
      <th class="text-left py-0.5 px-1">Libellé</th>
      <th class="text-center py-0.5 px-1">Qté</th>
      <th class="text-right py-0.5 px-1">CA</th>
    </tr></thead>
    <tbody>${rows.map(([code,d]) => {
      const lib = _S.libelleLookup[code] || code;
      return `<tr class="border-t b-light">
        <td class="font-mono t-disabled py-0.5 px-1">${code}</td>
        <td class="py-0.5 px-1 t-primary">${escapeHtml(lib)}</td>
        <td class="text-center t-tertiary py-0.5 px-1">${d.countBL||'—'}</td>
        <td class="text-right font-bold c-ok py-0.5 px-1">${d.sumCA>0?formatEuro(d.sumCA):'—'}</td>
      </tr>`;
    }).join('')}</tbody>
  </table>`;
}

// ── Rendering recherche libre ──────────────────────────────────────────────

function _renderSearchResults() {
  const r = _promoSearchResult; if(!r) return;

  const fmtD = d => {
    if(!d) return '—';
    try { return d.toLocaleDateString('fr-FR',{day:'2-digit',month:'2-digit',year:'2-digit'}); }
    catch { return '—'; }
  };

  // Lire les filtres actifs
  const fFamille    = document.getElementById('promoFilterFamille')?.value    || '';
  const fSousFamille= document.getElementById('promoFilterSousFamille')?.value || '';
  const fMetier     = document.getElementById('promoFilterMetier')?.value     || '';
  const fComm       = document.getElementById('promoFilterCommercial')?.value || '';
  const fClassif    = document.getElementById('promoFilterClassif')?.value    || '';
  const fCAMin      = parseFloat(document.getElementById('promoFilterCAMin')?.value) || 0;
  const fDept       = document.getElementById('promoFilterDept')?.value       || '';
  const fStrat      = document.getElementById('promoFilterStrat')?.checked    || false;

  // Article-level famille/sous-famille check for section A
  const _passFamA=(cc)=>{
    if(!fFamille&&!fSousFamille)return true;
    const artData=DataStore.ventesClientArticle.get(cc);if(!artData)return false;
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
  const _passFamB=(cc)=>{
    if(!fFamille&&!fSousFamille)return true;
    if(!_S.territoireReady)return true;
    for(const l of DataStore.territoireLines){
      if(l.clientCode!==cc)continue;
      if(!r.matchedFamilles.has(l.famille))continue;
      if(fFamille&&l.famille!==fFamille)continue;
      return true;
    }
    return false;
  };
  const passBase = (c, caField, famCheck) => {
    if(famCheck && !famCheck(c.cc)) return false;
    if(fMetier  && (c.metier||'')         !== fMetier)  return false;
    if(fComm    && (c.commercial||'')     !== fComm)    return false;
    if(fClassif && (c.classification||'') !== fClassif) return false;
    if(fCAMin > 0 && (c[caField]||0) < fCAMin) return false;
    if(fDept) {
      const cp = (_S.chalandiseData.get(c.cc)?.cp||'').replace(/\s/g,'').slice(0,2);
      if(cp !== fDept) return false;
    }
    if(fStrat) {
      const m = (c.metier||'').toLowerCase();
      if(!METIERS_STRATEGIQUES.some(s => m.includes(s))) return false;
    }
    return true;
  };

  const sA = r.sectionA.filter(c => passBase(c, 'ca', _passFamA));
  const sB = r.sectionB.filter(c => passBase(c, 'ca2025', _passFamB));
  const sC = r.sectionC.filter(c => passBase(c, 'ca2025', null));

  // Section A
  document.getElementById('promoCountA').textContent =
    sA.length + (sA.length < r.sectionA.length ? ' / ' + r.sectionA.length : '');
  document.getElementById('promoBodyA').innerHTML =
    sA.length
      ? sA.slice(0,200).map(c => _renderClientCard(c, 'A', fmtD)).join('')
      : '<p class="text-[11px] t-disabled py-2 px-3">Aucun acheteur identifié.</p>';

  // Section B
  document.getElementById('promoCountB').textContent =
    sB.length + (sB.length < r.sectionB.length ? ' / ' + r.sectionB.length : '');
  document.getElementById('promoBodyB').innerHTML =
    sB.length
      ? sB.slice(0,200).map(c => _renderClientCard(c, 'B', fmtD)).join('')
      : '<p class="text-[11px] t-disabled py-2 px-3">' +
        (_S.territoireReady ? 'Aucun acheteur hors PDV identifié.'
                            : 'Chargez le fichier Terrain pour activer cette vue.') +
        '</p>';

  // Section C
  document.getElementById('promoCountC').textContent =
    sC.length + (r.sectionCTotal > 50 ? ' / ' + r.sectionCTotal : '');
  document.getElementById('promoBodyC').innerHTML =
    sC.length
      ? sC.slice(0,200).map(c => _renderClientCard(c, 'C', fmtD)).join('')
      : '<p class="text-[11px] t-disabled py-2 px-3">' +
        (_S.chalandiseReady ? 'Aucun prospect dans les métiers cibles.'
                            : 'Chargez la Chalandise pour activer cette vue.') +
        '</p>';

  document.getElementById('promoSearchResults').classList.remove('hidden');
  document.getElementById('promoExportBtn').classList.remove('hidden');
  document.getElementById('promoCopyBtn').classList.remove('hidden');

}

function _renderClientCard(c, section, fmtD) {
  const canalBadge = !c.canal || c.canal === 'PDV' ? ''
    : c.canal === 'MIXTE'
      ? '<span class="inline-flex items-center text-[8px] bg-purple-100 text-purple-700 rounded px-1 ml-1">🌐 Multi</span>'
      : `<span class="inline-flex items-center text-[8px] bg-blue-100 text-blue-700 rounded px-1 ml-1">🌐 ${c.canal}</span>`;

  const inChal = _S.chalandiseReady && _S.chalandiseData.has(c.cc);
  const horsZone = !inChal
    ? '<span class="text-[8px] t-disabled border b-default rounded px-1 ml-1">hors zone</span>'
    : '';

  const caValue = section === 'A' ? c.ca : c.ca2025 || c.terrCA || 0;
  const caColor = section === 'A' ? 'c-ok' : section === 'B' ? 'c-danger' : 'c-caution';
  const caLabel = caValue > 0 ? formatEuro(caValue) : '—';

  const lastDateStr = section === 'A' ? fmtD(c.lastDate) : '';

  return `
    <div class="promo-client-card border b-default rounded-lg s-card overflow-hidden">
      <div class="flex items-center gap-3 px-3 py-2 cursor-pointer hover:s-hover transition-colors"
           onclick="_togglePromoClientRow('${c.cc}')">
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-1 flex-wrap leading-tight">
            <span class="font-semibold text-sm t-primary">${escapeHtml(c.nom)}</span>
            ${_spcBadge(c.spc)}${canalBadge}${horsZone}
          </div>
          <div class="text-[10px] t-tertiary mt-0.5">
            ${escapeHtml(c.metier||'—')} · ${escapeHtml(c.commercial||'—')}
          </div>
        </div>
        <div class="text-right shrink-0">
          <span class="font-bold text-sm ${caColor}">${caLabel}</span>
          ${lastDateStr ? `<div class="text-[9px] t-disabled">${lastDateStr}</div>` : ''}
        </div>
        <span class="text-[10px] t-disabled ml-1 shrink-0 transition-transform"
              id="promoChevron_${c.cc}">▶</span>
      </div>
      <div id="promoAcc_${c.cc}" class="promo-client-accordion"></div>
    </div>`;
}

function _togglePromoSection(sec){
  const body=document.getElementById('promoBody'+sec);const arrow=document.getElementById('promoArrow'+sec);
  if(!body)return;const open=body.style.display==='none';body.style.display=open?'':'none';if(arrow)arrow.textContent=open?'▲':'▼';
}


function exportPromoCSV(){
  const r=_promoSearchResult;if(!r){showToast('Lancez d\'abord une recherche','warning');return;}
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
  const r=_promoSearchResult;if(!r){showToast('Lancez d\'abord une recherche','warning');return;}
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

/**
 * Retourne true si le client cc a déjà acheté l'article code sur n'importe quel canal.
 * Agrège : MAGASIN (ventesClientArticle) + WEB/REP/DCS (ventesClientHorsMagasin) + territoire.
 * Usage : promo.js uniquement — accède à _S, ne pas déplacer dans utils.js.
 */
function _isArticleAlreadyBought(cc,code){
  if((DataStore.ventesClientArticle.get(cc)||new Map()).has(code))return true;
  if((_S.ventesClientHorsMagasin?.get(cc)||new Map()).has(code))return true;
  if(_S.territoireReady){
    for(const l of DataStore.territoireLines){if(l.clientCode===cc&&l.code===code)return true;}
  }
  return false;
}


function _onPromoImportFileChange(input){
  const f=input.files[0];if(!f)return;
  document.getElementById('promoImportFileName').textContent=f.name;
}

function _clearPromoImport(){
  const fi=document.getElementById('promoImportFile');if(fi)fi.value='';
  const fn=document.getElementById('promoImportFileName');if(fn)fn.textContent='Aucun fichier';
  const on=document.getElementById('promoImportOpName');if(on)on.textContent='';
  const ir=document.getElementById('promoImportResults');if(ir)ir.classList.add('hidden');
  const eb=document.getElementById('promoImportExportBtn');if(eb)eb.classList.add('hidden');
  _promoImportResult=null;
}

async function runPromoImport(){
  if(!DataStore.finalData.length){showToast('⚠️ Chargez les données stock d\'abord','warning');return;}
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
  if(!promoCodes.size){showToast('⚠️ Aucun code article valide trouvé (format attendu : 6 chiffres)','warning');return;}

  // Display op name
  const opEl=document.getElementById('promoImportOpName');
  if(opEl)opEl.textContent=opName?'— '+opName:'— '+promoCodes.size+' articles';

  // Build article label + stock lookup
  const stockByCode=new Map();for(const r of DataStore.finalData)stockByCode.set(r.code,r);

  // ── SECTION D : Articles vendus au comptoir ─────────────────────────────
  const sectionD=[];
  for(const code of promoCodes){
    let qtyTotal=0,caTotal=0,buyers=new Set();
    for(const[cc,artMap] of DataStore.ventesClientArticle.entries()){
      const d=artMap.get(code);if(!d)continue;
      buyers.add(cc);qtyTotal+=(d.sumPrelevee||0);caTotal+=(d.sumCA||d.sumPrelevee||0);
    }
    if(buyers.size>0||caTotal>0){
      const ref=stockByCode.get(code)||{};
      const lib=_S.libelleLookup[code]||ref.libelle||code;
      sectionD.push({code,lib,qtyTotal,caTotal,nbClients:buyers.size,stock:ref.stockActuel??null,famille:famLib(ref.famille||_S.articleFamille[code]||'')});
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
    sectionE.push({code,lib,rayonStatus,stock,famille:famLib(ref.famille||_S.articleFamille[code]||'')});
  }
  sectionE.sort((a,b)=>a.lib.localeCompare(b.lib));

  // ── SECTION F : Clients à relancer ──────────────────────────────────────
  // Families covered by the promo
  const promoFams=new Set();
  for(const code of promoCodes){const f=famLib(_S.articleFamille[code]||(stockByCode.get(code)||{}).famille||'');if(f)promoFams.add(f);}
  // Helper: true si cc a déjà acheté un article promo (comptoir + territoire + hors magasin)
  const _dejaAcheteur=(cc,promoCodes)=>{
    const comptoir=DataStore.ventesClientArticle.get(cc)||new Map();
    const terr=new Set((DataStore.territoireLines||[]).filter(l=>l.clientCode===cc).map(l=>l.code));
    const hors=new Set((_S.ventesClientHorsMagasin?.get(cc)||new Map()).keys());
    return[...promoCodes].some(code=>comptoir.has(code)||terr.has(code)||hors.has(code));
  };
  // Clients who buy the family but not the promo articles (any channel)
  const sectionF=[];
  for(const[cc,artMap] of DataStore.ventesClientArticle.entries()){
    if(_dejaAcheteur(cc,promoCodes))continue;
    // Check if client buys any article in the promo families
    let famCA=0;let famStr='';
    for(const[code,d] of artMap.entries()){
      const f=famLib(_S.articleFamille[code]||(stockByCode.get(code)||{}).famille||'');
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
  showToast(`📥 Opération analysée : ${sectionD.length} vendus · ${sectionE.length} non vendus · ${sectionF.length} à relancer`,'success');
}

function _activatePromoImportAction(){
  const r=_promoImportResult;
  if(!r||!r.promoCodes.size){showToast('⚠️ Chargez d\'abord une opération promo','warning');return;}

  // Guard : recherche libre active → toast undo
  if(_promoSearchResult&&!_promoSearchResult._fromImport){
    const prevTerms=(_promoSearchResult.terms||[]).join(', ')||'précédente';
    const snapshot=_promoSearchResult;
    let undone=false;
    const toastId='promoUndoToast';
    document.getElementById(toastId)?.remove();
    const toast=document.createElement('div');
    toast.id=toastId;
    toast.className='fixed bottom-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-4 py-2 rounded-xl shadow-lg s-card border b-default text-sm font-semibold';
    toast.innerHTML=`<span>🔄 Recherche <em>${prevTerms}</em> remplacée</span><button id="promoUndoBtn" class="text-xs font-bold c-action underline">Annuler</button>`;
    document.body.appendChild(toast);
    const cleanup=()=>{toast.remove();};
    const timer=setTimeout(()=>{if(!undone)cleanup();},4000);
    document.getElementById('promoUndoBtn')?.addEventListener('click',()=>{
      undone=true;clearTimeout(timer);cleanup();
      _promoSearchResult=snapshot;
      showToast('↩️ Recherche restaurée','success');
    });
  }

  const allTargets=new Map();
  for(const c of r.sectionF){
    allTargets.set(c.cc,{cc:c.cc,nom:c.nom,metier:c.metier,commercial:c.commercial,ca2025:_S.chalandiseData.get(c.cc)?.ca2025||0,terrCA:0});
  }
  _promoSearchResult={terms:[r.opName||'Opération promo'],matchedCodes:r.promoCodes,sectionA:[],sectionB:[...allTargets.values()],sectionC:[],_fromImport:true,_opName:r.opName};
  showToast(`⚡ ${r.sectionF.length} clients chargés pour l'opération "${r.opName||'Promo'}"`, 'success');
}
window._activatePromoImportAction=_activatePromoImportAction;

function _renderPromoImportResults(){
  const r = _promoImportResult; if(!r) return;

  const sold    = r.sectionD.length;
  const unsold  = r.sectionE.length;
  const retarget = r.sectionF.length;
  const totalCA = r.sectionD.reduce((s,x)=>s+x.caTotal,0);

  // Summary bar
  const sumEl = document.getElementById('promoImportSummaryBar');
  if(sumEl) sumEl.innerHTML =
    `<strong>${r.promoCodes.size}</strong> articles · ` +
    `<span class="c-ok">${sold} vendus — ${formatEuro(totalCA)}</span> · ` +
    `<span class="c-danger">${unsold} non vendus</span> · ` +
    `<span class="c-caution">${retarget} à relancer</span>` +
    (r.opName ? ` · <em>${escapeHtml(r.opName)}</em>` : '');

  // Section D
  document.getElementById('promoImportCountD').textContent = sold;
  document.getElementById('promoImportTableD').innerHTML = r.sectionD.slice(0,200).map(x => {
    const stockCell = x.stock === null
      ? '<span class="t-disabled">Non réf.</span>'
      : x.stock > 0 ? `<span class="c-ok font-bold">${x.stock}</span>`
      : '<span class="c-danger">0</span>';
    return `<tr class="border-t b-light hover:i-ok-bg">
      <td class="py-1 px-2 font-mono t-disabled">${x.code}</td>
      <td class="py-1 px-2 font-semibold truncate max-w-[180px]">${escapeHtml(x.lib)}</td>
      <td class="py-1 px-2 text-center">${Math.round(x.qtyTotal)}</td>
      <td class="py-1 px-2 text-right font-bold c-ok">${x.caTotal>0?formatEuro(x.caTotal):'—'}</td>
      <td class="py-1 px-2 text-center">${x.nbClients}</td>
      <td class="py-1 px-2 text-center">${stockCell}</td>
    </tr>`;
  }).join('') || '<tr><td colspan="6" class="py-3 text-center t-disabled">Aucun article vendu</td></tr>';

  // Section E
  document.getElementById('promoImportCountE').textContent = unsold;
  document.getElementById('promoImportTableE').innerHTML = r.sectionE.slice(0,200).map(x =>
    `<tr class="border-t border-red-50 hover:i-danger-bg">
      <td class="py-1 px-2 font-mono t-disabled">${x.code}</td>
      <td class="py-1 px-2 font-semibold truncate max-w-[180px]">${escapeHtml(x.lib)}</td>
      <td class="py-1 px-2 text-center text-xs">${x.rayonStatus}</td>
      <td class="py-1 px-2 text-center">${x.stock===null?'—':x.stock}</td>
      <td class="py-1 px-2 t-tertiary text-[10px]">${escapeHtml(x.famille||'—')}</td>
    </tr>`
  ).join('') || '<tr><td colspan="5" class="py-3 text-center c-ok">✅ Tous les articles ont été vendus</td></tr>';

  // Section F — groupée par commercial
  document.getElementById('promoImportCountF').textContent = retarget;
  const byComm = new Map();
  for(const c of r.sectionF) {
    const comm = c.commercial || '—';
    if(!byComm.has(comm)) byComm.set(comm, []);
    byComm.get(comm).push(c);
  }
  document.getElementById('promoImportBodyF').innerHTML = [...byComm.entries()]
    .sort((a,b) => b[1].length - a[1].length)
    .map(([comm, clients]) => `
      <div class="border b-default rounded-lg overflow-hidden">
        <div class="flex items-center justify-between px-3 py-2 s-card-alt border-b b-light">
          <span class="font-semibold text-sm">${escapeHtml(comm)}</span>
          <div class="flex items-center gap-2">
            <span class="text-[10px] t-tertiary">${clients.length} client${clients.length>1?'s':''}</span>
            <button onclick="_exportCommercialCSV('${comm.replace(/'/g,"\\'")}')"
              class="text-[10px] font-bold c-action border b-default rounded px-2 py-0.5 hover:i-info-bg">
              📥 Sa liste
            </button>
          </div>
        </div>
        <table class="min-w-full text-[10px]">
          <tbody>${clients.map(c => `
            <tr class="border-t b-light hover:i-caution-bg">
              <td class="py-1 px-2 font-mono t-disabled">${c.cc}</td>
              <td class="py-1 px-2 font-semibold">${escapeHtml(c.nom)}</td>
              <td class="py-1 px-2 t-tertiary">${escapeHtml(c.metier||'—')}</td>
              <td class="py-1 px-2 text-right font-bold c-caution">${c.famCA>0?formatEuro(c.famCA):'—'}</td>
              <td class="py-1 px-2 t-disabled text-[9px]">${escapeHtml(c.raison||'')}</td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>`)
    .join('') || '<p class="text-[11px] t-disabled py-2">Aucun client à relancer.</p>';

  // Bouton préparer les appels
  const btnCont = document.getElementById('promoImportActionBtn');
  if(btnCont && retarget > 0) {
    btnCont.innerHTML = `
      <div class="flex items-center justify-between pt-3 border-t b-light">
        <p class="text-[11px] t-tertiary">${retarget} clients identifiés</p>
        <button onclick="_activatePromoImportAction()"
          class="text-sm font-bold py-2 px-4 rounded-lg text-white"
          style="background:var(--p-orange-500,#f97316)">
          ⚡ Préparer les appels →
        </button>
      </div>`;
    btnCont.classList.remove('hidden');
  }

  document.getElementById('promoImportResults').classList.remove('hidden');
  document.getElementById('promoImportExportBtn').classList.remove('hidden');
}

function _exportCommercialCSV(commercial) {
  const r = _promoImportResult; if(!r) return;
  const clients = r.sectionF.filter(c => (c.commercial||'—') === commercial);
  const SEP = ';';
  const lines = [
    `PRISME — Opération${r.opName?' '+r.opName:''} — ${commercial}`,
    ['Code','Nom','Métier','CA famille','Raison'].join(SEP),
    ...clients.map(c => [
      c.cc, `"${c.nom}"`, `"${c.metier}"`,
      c.famCA.toFixed(2).replace('.',','), `"${c.raison||''}"`
    ].join(SEP))
  ];
  const blob = new Blob(['\uFEFF'+lines.join('\n')], {type:'text/csv;charset=utf-8;'});
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `PRISME_${r.opName||'Promo'}_${commercial.replace(/[^a-z0-9]/gi,'_')}.csv`;
  document.body.appendChild(link); link.click();
  document.body.removeChild(link); URL.revokeObjectURL(link.href);
  showToast(`📥 ${clients.length} clients exportés — ${commercial}`, 'success');
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
  lines.push(['Code','Libellé','Qté PDV','CA Magasin','Nb clients','Stock'].join(SEP));
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
// ══════════════════════════════════════════════════════════════════════════
// NL SEARCH — couche parseIntent (Sprint 1 · débat V4 2026-03-28)
// Couvre 10 intents prioritaires. Branché en amont de runPromoSearch().
// Lorsqu'un intent NL est détecté, on court-circuite le pipeline article
// et on affiche un résultat tabulaire dans #promoNLResult.
// ══════════════════════════════════════════════════════════════════════════

function _normNL(s){return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');}

export function _parseNLQuery(text){
  const t=_normNL(text.trim());
  const numM=(p)=>{const m=t.match(p);return m?parseInt(m[1]):null;};
  const kEuro=(p)=>{const m=t.match(p);if(!m)return null;return parseInt(m[1])*(t.charAt(m.index+m[0].length-1)==='k'?1000:1);};

  if(/(?:qui|que)?\s*(?:dois[- ]?je|faut[- ]?il)?\s*appeler|reconqu[eê]t|relancer/.test(t))
    return{intent:'RECONQUETE',params:{}};

  // COMMERCIAL_SILENCE — clients d'un commercial nommé n'ayant pas commandé (plus spécifique que CLIENTS_SILENCIEUX)
  if(_S.clientsByCommercial?.size&&/client.*(?:silence|pas\s+command|n.?ont\s+pas\s+command|sans\s+commande|inactif)/.test(t)){
    const stopRx=/^(?:clients?|le|la|les|de|du|des|qui|ont|pas|commandes?|ce|mois|semaine|depuis|jours?|silence|sans|inactif|actif|n|ont)$/;
    const words=t.split(/\s+/).filter(w=>!stopRx.test(w)&&w.length>3);
    let bestCom=null,bestScore=0;
    for(const com of _S.clientsByCommercial.keys()){
      const cn=_normNL(com);
      for(const w of words){if(cn.includes(w)&&w.length>bestScore){bestScore=w.length;bestCom=com;}}
    }
    if(bestCom){
      const moisM=t.match(/(\d+)\s*mois/);const joursM=t.match(/(\d+)\s*j(?:ours?)?/);
      const jours=moisM?parseInt(moisM[1])*30:(joursM?parseInt(joursM[1]):30);
      return{intent:'COMMERCIAL_SILENCE',params:{commercial:bestCom,jours}};
    }
  }

  // CHURN_ACTIF — clients classifiés FID/actifs qui disparaissent (avant CLIENTS_PERDUS générique)
  if(/(?:fid[eè]le|fid\b|classif).*(?:silence|parti|dispar|plus\s+command|inactif)|(?:silence|parti|dispar).*(?:fid[eè]le|fid\b)/.test(t)){
    const moisM=t.match(/(\d+)\s*mois/);const joursM=t.match(/(\d+)\s*j(?:ours?)?/);
    const jours=moisM?parseInt(moisM[1])*30:(joursM?parseInt(joursM[1]):60);
    return{intent:'CHURN_ACTIF',params:{jours}};
  }

  if(/silencieux|sans commande|n.?ont pas command|silence/.test(t)){
    const jours=numM(/depuis\s+(\d+)\s*j/)||numM(/(\d+)\s*j(?:ours?)?/)||30;
    const caMin=kEuro(/(?:plus de|>)\s*(\d+)\s*k?(?:\s*€)?/)||0;
    return{intent:'CLIENTS_SILENCIEUX',params:{jours,caMin}};
  }

  if(/perdus?|disparus?|churn|(?:pas|plus)\s+(?:vu|venu|revu)/.test(t)){
    const moisM=t.match(/(\d+)\s*mois/);
    const jourM=t.match(/(\d+)\s*j(?:ours?)?/);
    const jours=moisM?parseInt(moisM[1])*30:(jourM?parseInt(jourM[1]):90);
    return{intent:'CLIENTS_PERDUS',params:{jours,query:text}};
  }

  if(/dormant|immobilis|invendu|longtemps en stock/.test(t)){
    const valM=t.match(/(?:>|plus de|de)\s*(\d+)\s*(k)?/);
    const valMin=valM?parseInt(valM[1])*(/k/.test(valM[0])?1000:1):0;
    const moisM=t.match(/(\d+)\s*mois/);
    const nbJours=moisM?parseInt(moisM[1])*30:365;
    return{intent:'STOCK_DORMANT',params:{valMin,nbJours}};
  }

  // RUPTURES_TOP_CLIENTS — familles en rupture chez les top clients
  if(/rupture.*(?:client|top\s*\d+)|(?:client|top\s*\d+).*rupture|familles?.*rupture.*client|rupture.*achet.*client/.test(t)){
    const nM=t.match(/top\s*(\d+)|(\d+)\s+client/);
    return{intent:'RUPTURES_TOP_CLIENTS',params:{topN:nM?parseInt(nM[1]||nM[2]):5}};
  }

  // DQ_REASSORT — commandes urgentes à passer aujourd'hui
  if(/(?:quoi|que|qu).?(?:commander|passer)|reassort|r[eé]appro|commande.*(?:passer|urgent|aujourd|lancer)|(?:passer|lancer).*commande|commander.*aujourd/.test(t))
    return{intent:'DQ_REASSORT',params:{}};

  // ANOMALIE_MINMAX — articles actifs sans MIN/MAX ERP
  if(/sans.*min.?max|min.?max.*(?:absent|manquant|vide|zero)|calibr|articles?.*sans.*param|param.*manquant/.test(t))
    return{intent:'ANOMALIE_MINMAX',params:{}};

  if(/(?:sous|dessous)\s+(?:la\s+)?mediane|mediane.*(?:sous|retard)|familles?.*(?:sous|retard)|bench/.test(t))
    return{intent:'BENCH_SOUS_MEDIANE',params:{}};

  // BENCH_FAMILLE_RESEAU — classement réseau pour une famille donnée
  if(/(?:vend|vendu|meilleur|classement|rang|performance).*r[eé]seau|r[eé]seau.*(?:classement|rang|meilleur|vend|performance|famille|mieux)/.test(t))
    return{intent:'BENCH_FAMILLE_RESEAU',params:{query:text}};

  if(/taux\s*(?:de\s*)?service|service.*taux/.test(t))
    return{intent:'KPI_TAUX_SERVICE',params:{}};

  // ARTICLES_HORS_MARQUE — articles d'une marque/type achetés ailleurs (requiert "articles" pour éviter conflit avec CLIENTS_HORS_AGENCE)
  if(/articles?.*(?:achet.*ailleurs|hors\s+agence|pas\s+chez)|marque.*ailleurs/.test(t)){
    const stop=/^(?:articles?|achet[eé]s?|achetons|achetent|ailleurs|hors|agence|pdv|chez|moi|nous|qui|sont|les|des|de|du|la|le|en|et|avec|sans|dans|pas)$/;
    const term=t.split(/\s+/).filter(w=>w.length>2&&!stop.test(w)).join(' ').trim();
    return{intent:'ARTICLES_HORS_MARQUE',params:{term:term||text}};
  }

  if(/hors[- ](?:agence|comptoir|pdv)|achet(?:ent|e).*ailleurs|ailleurs.*achet/.test(t)){
    const caMin=kEuro(/(?:plus de|>)\s*(\d+)\s*k?/)||0;
    return{intent:'CLIENTS_HORS_AGENCE',params:{caMin}};
  }

  // METIER_CANAL — clients d'un métier sur un canal précis (avant CANAL_EXCLUSIF)
  if(/(web|internet|representant|\brep\b|dcs)/.test(t)&&/(plombier|electricien|charpentier|menuisier|maconn|peintre|carreleur|serrurier|chauffagiste|couvreur|electricit|plomberie|serrurerie|menuiserie|peinture|carrelage|charpente|chauffage|climatisation|couverture)/.test(t)){
    const canal=/web|internet/.test(t)?'INTERNET':/representant|\brep\b/.test(t)?'REPRESENTANT':'DCS';
    const metM=t.match(/(plombier|electricien|charpentier|menuisier|maconn|peintre|carreleur|serrurier|chauffagiste|couvreur|electricit|plomberie|serrurerie|menuiserie|peinture|carrelage|charpente|chauffage|climatisation|couverture)/);
    return{intent:'METIER_CANAL',params:{canal,metierKw:metM?metM[1]:''}};
  }

  if(/uniquement|seulement|exclusivement/.test(t)&&/web|internet|representant|\brep\b/.test(t)){
    const canal=/web|internet/.test(t)?'INTERNET':'REPRESENTANT';
    return{intent:'CANAL_EXCLUSIF',params:{canal}};
  }

  if(/(?:top|meilleur|premier).*client.*(?:web|internet)|client.*(?:web|internet).*(?:top|plus)/.test(t)){
    const nM=t.match(/top\s*(\d+)|(\d+)\s+client/);
    return{intent:'TOP_CLIENTS_CANAL',params:{canal:'INTERNET',topN:nM?parseInt(nM[1]||nM[2]):10}};
  }
  if(/(?:top|meilleur|premier).*client.*(?:rep\b|representant)|client.*rep\b/.test(t)){
    const nM=t.match(/top\s*(\d+)|(\d+)\s+client/);
    return{intent:'TOP_CLIENTS_CANAL',params:{canal:'REPRESENTANT',topN:nM?parseInt(nM[1]||nM[2]):10}};
  }

  if(/prospect|opportunit|potentiel|famille.*manquant/.test(t)){
    const caMin=kEuro(/(?:>|plus de)\s*(\d+)\s*k?/)||1000;
    return{intent:'OPPORTUNITES',params:{caMin}};
  }

  if(/nouveau.*client|client.*nouveau|premier.*achat|1er.*achat/.test(t))
    return{intent:'NOUVEAUX_CLIENTS',params:{}};

  return null;
}

// ── Helpers de formatage ──────────────────────────────────────
const _fmtDate=(d)=>{if(!d)return'—';try{return d.toLocaleDateString('fr-FR',{day:'2-digit',month:'2-digit',year:'2-digit'});}catch{return'—';}};

// ── Rendu NL ─────────────────────────────────────────────────
// Affiche le résultat dans #promoNLResult, masque les sections A/B/C.
function _renderNLResult(intentLabel, rows, cols, meta=''){
  const el=document.getElementById('promoNLResult');
  const sr=document.getElementById('promoSearchResults');
  const mi=document.getElementById('promoMatchInfo');
  if(!el||!sr)return;
  // Masquer sections A/B/C
  ['A','B','C'].forEach(s=>{
    const b=document.getElementById('promoBody'+s);
    if(b&&b.parentElement)b.parentElement.style.display='none';
  });
  el.style.display='';
  if(mi){mi.innerHTML=`<span class="font-semibold c-action">🔍 Requête NL</span> · ${intentLabel}${meta?' · '+meta:''}`;mi.classList.remove('hidden');}
  if(!rows.length){
    el.innerHTML=`<p class="text-sm t-tertiary py-4 text-center">Aucun résultat.</p>`;
  }else{
    const ths=cols.map(c=>`<th class="py-2 px-2 text-left text-[10px] uppercase t-tertiary font-semibold sticky top-0 s-card-alt">${c.label}</th>`).join('');
    const trs=rows.map(r=>{
      const tds=cols.map(c=>`<td class="py-1.5 px-2 ${c.cls||'text-xs'}">${r[c.key]??'—'}</td>`).join('');
      return`<tr class="border-b hover:s-card-alt">${tds}</tr>`;
    }).join('');
    el.innerHTML=`<div class="list-scroll" style="max-height:400px;overflow-y:auto"><table class="min-w-full text-xs"><thead><tr>${ths}</tr></thead><tbody>${trs}</tbody></table></div>`;
  }
  sr.classList.remove('hidden');
}

function _resetNLDisplay(){
  const el=document.getElementById('promoNLResult');
  if(el){el.innerHTML='';el.style.display='none';}
  ['A','B','C'].forEach(s=>{const b=document.getElementById('promoBody'+s);if(b&&b.parentElement)b.parentElement.style.display='';});
}

// ── Handlers par intent ───────────────────────────────────────

function _nlReconquete(){
  if(!_S.reconquestCohort?.length){
    const el=document.getElementById('promoNLResult');const sr=document.getElementById('promoSearchResults');
    if(el&&sr){el.innerHTML='<p class="text-sm t-disabled py-4 text-center">Cohorte reconquête non disponible (fichier Chalandise requis).</p>';el.style.display='';sr.classList.remove('hidden');}
    const mi=document.getElementById('promoMatchInfo');if(mi){mi.innerHTML='🔍 Requête NL · Clients à reconquérir';mi.classList.remove('hidden');}
    return;
  }
  const rows=_S.reconquestCohort.slice(0,20).map(c=>({
    nom:escapeHtml(c.nom||c.cc),
    jours:c.daysAgo+'j',
    ca:formatEuro(c.totalCA),
    fams:c.nbFamilles,
    commercial:escapeHtml(c.commercial||'—'),
    metier:escapeHtml(c.metier||'—'),
    score:c.score,
  }));
  _renderNLResult('Clients à reconquérir',rows,[
    {key:'nom',label:'Client',cls:'text-xs font-semibold t-primary'},
    {key:'jours',label:'Absence',cls:'text-xs text-center font-bold c-danger'},
    {key:'ca',label:'CA historique',cls:'text-xs text-right font-bold'},
    {key:'fams',label:'Familles',cls:'text-xs text-center t-tertiary'},
    {key:'metier',label:'Métier',cls:'text-xs t-tertiary'},
    {key:'commercial',label:'Commercial',cls:'text-xs t-tertiary'},
  ],`${rows.length} client${rows.length>1?'s':''}`);
}

function _nlClientsSilencieux({jours,caMin}){
  const now=Date.now();const threshold=jours*86400000;
  const rows=[];
  for(const[cc,lastDate] of _S.clientLastOrder.entries()){
    const d=now-lastDate;if(d<threshold)continue;
    const artMap=_S.ventesClientArticle.get(cc);if(!artMap)continue;
    let ca=0;for(const v of artMap.values())ca+=(v.sumCA||0);
    if(ca<caMin)continue;
    const info=_S.chalandiseData?.get(cc)||{};
    rows.push({cc,nom:escapeHtml(_S.clientNomLookup[cc]||info.nom||cc),joursN:Math.round(d/86400000),ca,metier:escapeHtml(info.metier||'—'),commercial:escapeHtml(info.commercial||'—'),lastDate});
  }
  rows.sort((a,b)=>b.ca-a.ca);
  _renderNLResult(`Clients silencieux >${jours}j`,rows.slice(0,50).map(r=>({
    nom:r.nom,
    jours:r.joursN+'j',
    ca:formatEuro(r.ca),
    dernier:_fmtDate(r.lastDate),
    metier:r.metier,
    commercial:r.commercial,
  })),[
    {key:'nom',label:'Client',cls:'text-xs font-semibold t-primary'},
    {key:'jours',label:'Silence',cls:'text-xs text-center font-bold c-danger'},
    {key:'ca',label:'CA historique',cls:'text-xs text-right font-bold'},
    {key:'dernier',label:'Dernier achat',cls:'text-xs text-center t-tertiary'},
    {key:'metier',label:'Métier',cls:'text-xs t-tertiary'},
    {key:'commercial',label:'Commercial',cls:'text-xs t-tertiary'},
  ],`${rows.length} client${rows.length>1?'s':''}. ${caMin>0?'CA ≥ '+formatEuro(caMin):''}`);
}

function _nlClientsPerdus({jours,query}){
  const now=Date.now();const threshold=jours*86400000;
  const qNorm=_normNL(query);
  const rows=[];
  for(const[cc,lastDate] of _S.clientLastOrder.entries()){
    const d=now-lastDate;if(d<threshold)continue;
    const artMap=_S.ventesClientArticle.get(cc);if(!artMap)continue;
    let ca=0;for(const v of artMap.values())ca+=(v.sumCA||0);
    if(ca<=0)continue;
    const info=_S.chalandiseData?.get(cc)||{};
    // Filtre métier optionnel (mots du query qui matchent des métiers)
    if(_S.chalandiseReady&&info.metier){
      const metNorm=_normNL(info.metier);
      const hasMetier=/plombier|electricien|charpentier|menuisier|maconnerie|peintre|carreleur|serrurier|chauffagiste/.test(qNorm);
      if(hasMetier&&!qNorm.includes(metNorm.split(' ')[0]))continue;
    }
    rows.push({cc,nom:escapeHtml(_S.clientNomLookup[cc]||info.nom||cc),joursN:Math.round(d/86400000),ca,metier:escapeHtml(info.metier||'—'),commercial:escapeHtml(info.commercial||'—'),lastDate});
  }
  rows.sort((a,b)=>b.ca-a.ca);
  _renderNLResult(`Clients perdus (>${Math.round(jours/30)}m)`,rows.slice(0,50).map(r=>({
    nom:r.nom,
    jours:r.joursN+'j',
    ca:formatEuro(r.ca),
    dernier:_fmtDate(r.lastDate),
    metier:r.metier,
    commercial:r.commercial,
  })),[
    {key:'nom',label:'Client',cls:'text-xs font-semibold t-primary'},
    {key:'jours',label:'Absence',cls:'text-xs text-center font-bold c-danger'},
    {key:'ca',label:'CA historique',cls:'text-xs text-right font-bold'},
    {key:'dernier',label:'Dernier achat',cls:'text-xs text-center t-tertiary'},
    {key:'metier',label:'Métier',cls:'text-xs t-tertiary'},
    {key:'commercial',label:'Commercial',cls:'text-xs t-tertiary'},
  ],`${rows.length} client${rows.length>1?'s':''}`);
}

function _nlStockDormant({valMin,nbJours}){
  const rows=DataStore.finalData
    .filter(r=>(r.ageJours||0)>=nbJours&&(r.stockActuel||0)>0)
    .map(r=>({code:r.code,lib:escapeHtml((r.libelle||r.code).substring(0,40)),age:r.ageJours,val:Math.round((r.stockActuel||0)*(r.prixUnitaire||0)),fam:r.famille||'',abc:r.abcClass||'?'}))
    .filter(r=>r.val>=valMin)
    .sort((a,b)=>b.val-a.val)
    .slice(0,50);
  const total=rows.reduce((s,r)=>s+r.val,0);
  _renderNLResult(`Stock dormant ≥${nbJours}j`,rows.map(r=>({
    code:`<span class="font-mono text-[10px] t-disabled">${r.code}</span>`,
    lib:r.lib,
    age:r.age+'j',
    val:formatEuro(r.val),
    abc:`<span class="font-bold ${r.abc==='A'?'c-danger':r.abc==='B'?'c-caution':'t-disabled'}">${r.abc}</span>`,
    fam:r.fam,
  })),[
    {key:'code',label:'Code',cls:'text-xs'},
    {key:'lib',label:'Libellé',cls:'text-xs font-semibold'},
    {key:'age',label:'Age',cls:'text-xs text-center c-danger font-bold'},
    {key:'val',label:'Valeur immob.',cls:'text-xs text-right font-bold'},
    {key:'abc',label:'ABC',cls:'text-xs text-center'},
    {key:'fam',label:'Famille',cls:'text-xs t-tertiary'},
  ],`${rows.length} article${rows.length>1?'s':''} · ${formatEuro(total)} immobilisés`);
}

function _nlBenchSousMediane(){
  const fp=_S.benchLists?.familyPerf;
  if(!fp?.length){_renderNLResult('Familles sous médiane',[],[],`Benchmark non disponible`);return;}
  const sous=fp.filter(f=>f.ecart<0).sort((a,b)=>a.ecart-b.ecart);
  _renderNLResult('Familles sous médiane',sous.slice(0,30).map(f=>{
    const pct=f.med>0?Math.round(f.my/f.med*100):null;
    return{
      fam:escapeHtml(f.fam),
      moi:f.my,
      med:f.med,
      pct:pct!==null?`<span class="font-bold ${pct<50?'c-danger':pct<100?'c-caution':''}">${pct}%</span>`:'—',
      diag:pct!==null&&pct<50?`<button class="diag-btn i-danger-bg c-danger text-[9px] py-0.5 px-1.5" onclick="openDiagnostic('${escapeHtml(f.fam).replace(/'/g,"\\'")}','bench')">🔍</button>`:'',
    };
  }),[
    {key:'fam',label:'Famille',cls:'text-xs font-semibold'},
    {key:'moi',label:'Moi',cls:'text-xs text-right'},
    {key:'med',label:'Médiane',cls:'text-xs text-right t-tertiary'},
    {key:'pct',label:'% médiane',cls:'text-xs text-right'},
    {key:'diag',label:'',cls:'text-xs text-center'},
  ],`${sous.length} famille${sous.length>1?'s':''} en retard`);
}

function _nlKpiTauxService(){
  const el=document.getElementById('promoNLResult');const sr=document.getElementById('promoSearchResults');
  const mi=document.getElementById('promoMatchInfo');
  if(!el||!sr)return;
  ['A','B','C'].forEach(s=>{const b=document.getElementById('promoBody'+s);if(b&&b.parentElement)b.parentElement.style.display='none';});
  el.style.display='';sr.classList.remove('hidden');
  if(mi){mi.innerHTML='🔍 Requête NL · Taux de service';mi.classList.remove('hidden');}
  const kpis=_S.benchLists?.obsKpis;
  if(!kpis?.mine?.serv&&kpis?.mine?.serv!==0){el.innerHTML='<p class="text-sm t-tertiary py-4 text-center">Benchmark non disponible.</p>';return;}
  const s=kpis.mine.serv;const sm=kpis.compared?.serv||0;
  const color=s>=sm?'c-ok':'c-caution';
  const delta=sm>0?Math.round((s-sm)*10)/10:null;
  el.innerHTML=`<div class="flex items-center gap-6 p-6 s-card rounded-xl">
    <span class="text-5xl font-black ${color}">${s}<span class="text-2xl">%</span></span>
    <div>
      <p class="font-bold t-primary">Taux de service agence</p>
      <p class="text-sm t-tertiary">Médiane réseau\u00a0: <strong>${sm}%</strong>${delta!==null?` · Écart\u00a0: <strong class="${delta>=0?'c-ok':'c-danger'}">${delta>=0?'+':''}${delta}pts</strong>`:''}</p>
    </div>
  </div>`;
}

function _nlClientsHorsAgence({caMin}){
  const agg=new Map();
  for(const[cc,artMap] of (_S.ventesClientHorsMagasin||new Map()).entries()){
    let ca=0;for(const v of artMap.values())ca+=(v.sumCA||0);
    if(ca<(caMin||0))continue;
    const capdv=(() =>{const m=_S.ventesClientArticle?.get(cc);if(!m)return 0;let s=0;for(const v of m.values())s+=(v.sumCA||0);return s;})();
    const info=_S.chalandiseData?.get(cc)||{};
    agg.set(cc,{nom:_S.clientNomLookup[cc]||info.nom||cc,caHors:ca,caPdv:capdv,metier:info.metier||'—',commercial:info.commercial||'—'});
  }
  const rows=[...agg.values()].sort((a,b)=>b.caHors-a.caHors).slice(0,50);
  _renderNLResult(`Clients hors-agence${caMin>0?' >'+formatEuro(caMin):''}`,rows.map(r=>({
    nom:escapeHtml(r.nom),
    caHors:formatEuro(r.caHors),
    caPdv:r.caPdv>0?formatEuro(r.caPdv):'<span class="t-disabled">—</span>',
    ratio:r.caPdv>0?Math.round(r.caHors/(r.caHors+r.caPdv)*100)+'% hors':'<span class="c-caution font-bold">100% hors</span>',
    metier:escapeHtml(r.metier),
    commercial:escapeHtml(r.commercial),
  })),[
    {key:'nom',label:'Client',cls:'text-xs font-semibold t-primary'},
    {key:'caHors',label:'CA hors-PDV',cls:'text-xs text-right font-bold c-danger'},
    {key:'caPdv',label:'CA PDV',cls:'text-xs text-right'},
    {key:'ratio',label:'Ratio',cls:'text-xs text-center'},
    {key:'metier',label:'Métier',cls:'text-xs t-tertiary'},
    {key:'commercial',label:'Commercial',cls:'text-xs t-tertiary'},
  ],`${rows.length} client${rows.length>1?'s':''}`);
}

function _nlCanalExclusif({canal}){
  const rows=[];
  for(const[cc,artMap] of (_S.ventesClientHorsMagasin||new Map()).entries()){
    if(_S.ventesClientArticle?.has(cc))continue; // déjà PDV
    let ca=0;let hasCanal=false;
    for(const v of artMap.values()){
      if(v.canal===canal)hasCanal=true;
      ca+=(v.sumCA||0);
    }
    if(!hasCanal||ca<=0)continue;
    const info=_S.chalandiseData?.get(cc)||{};
    rows.push({nom:_S.clientNomLookup[cc]||info.nom||cc,ca,metier:info.metier||'—',commercial:info.commercial||'—'});
  }
  rows.sort((a,b)=>b.ca-a.ca);
  _renderNLResult(`Clients ${canal} sans PDV`,rows.slice(0,50).map(r=>({
    nom:escapeHtml(r.nom),
    ca:formatEuro(r.ca),
    metier:escapeHtml(r.metier),
    commercial:escapeHtml(r.commercial),
  })),[
    {key:'nom',label:'Client',cls:'text-xs font-semibold t-primary'},
    {key:'ca',label:`CA ${canal}`,cls:'text-xs text-right font-bold'},
    {key:'metier',label:'Métier',cls:'text-xs t-tertiary'},
    {key:'commercial',label:'Commercial',cls:'text-xs t-tertiary'},
  ],`${rows.length} client${rows.length>1?'s':''}`);
}

function _nlTopClientsCanal({canal,topN}){
  const agg=new Map();
  for(const[cc,artMap] of (_S.ventesClientHorsMagasin||new Map()).entries()){
    let ca=0;let hasC=false;
    for(const v of artMap.values()){if(v.canal===canal){hasC=true;ca+=(v.sumCA||0);}}
    if(!hasC||ca<=0)continue;
    const info=_S.chalandiseData?.get(cc)||{};
    agg.set(cc,{nom:_S.clientNomLookup[cc]||info.nom||cc,ca,metier:info.metier||'—',commercial:info.commercial||'—',spc:computeSPC(cc,info)});
  }
  const rows=[...agg.values()].sort((a,b)=>b.ca-a.ca).slice(0,topN||10);
  _renderNLResult(`Top ${topN||10} clients ${canal}`,rows.map((r,i)=>({
    rank:`<strong>#${i+1}</strong>`,
    nom:escapeHtml(r.nom),
    ca:formatEuro(r.ca),
    metier:escapeHtml(r.metier),
    commercial:escapeHtml(r.commercial),
    spc:_spcBadge(r.spc),
  })),[
    {key:'rank',label:'#',cls:'text-xs text-center'},
    {key:'nom',label:'Client',cls:'text-xs font-semibold t-primary'},
    {key:'ca',label:`CA ${canal}`,cls:'text-xs text-right font-bold'},
    {key:'metier',label:'Métier',cls:'text-xs t-tertiary'},
    {key:'commercial',label:'Commercial',cls:'text-xs t-tertiary'},
    {key:'spc',label:'SPC',cls:'text-xs text-center'},
  ],`${rows.length} client${rows.length>1?'s':''}`);
}

function _nlOpportunites({caMin}){
  if(!_S.opportuniteNette?.length){
    _renderNLResult('Opportunités nettes',[],[],`Chalandise requise`);return;
  }
  const rows=_S.opportuniteNette.filter(o=>o.totalPotentiel>=caMin).slice(0,30);
  _renderNLResult(`Opportunités ≥${formatEuro(caMin)}`,rows.map(r=>({
    nom:escapeHtml(r.nom),
    potentiel:formatEuro(r.totalPotentiel),
    nb:r.nbMissing+' fam.',
    fams:escapeHtml(r.missingFams.slice(0,3).map(m=>m.fam).join(', ')),
    metier:escapeHtml(r.metier||'—'),
    commercial:escapeHtml(r.commercial||'—'),
  })),[
    {key:'nom',label:'Client',cls:'text-xs font-semibold t-primary'},
    {key:'potentiel',label:'Potentiel',cls:'text-xs text-right font-bold c-ok'},
    {key:'nb',label:'Familles',cls:'text-xs text-center'},
    {key:'fams',label:'Top familles manquantes',cls:'text-xs t-tertiary'},
    {key:'metier',label:'Métier',cls:'text-xs t-tertiary'},
    {key:'commercial',label:'Commercial',cls:'text-xs t-tertiary'},
  ],`${rows.length} client${rows.length>1?'s':''}`);
}

function _nlNouveauxClients(){
  const now=new Date();const debut=new Date(now.getFullYear(),now.getMonth(),1);const debutTs=debut.getTime();
  // Nouveau = premier achat du client dans les données = client dont la date de premier achat est ce mois
  // Approximation : clients dont lastOrder est ce mois ET qui ont peu de BL (≤3)
  const rows=[];
  for(const[cc,lastDate] of _S.clientLastOrder.entries()){
    if(lastDate<debutTs)continue;
    const artMap=_S.ventesClientArticle?.get(cc);if(!artMap)continue;
    let ca=0,bl=0;for(const v of artMap.values()){ca+=(v.sumCA||0);bl+=(v.countBL||0);}
    if(ca<=0)continue;
    const info=_S.chalandiseData?.get(cc)||{};
    rows.push({nom:_S.clientNomLookup[cc]||info.nom||cc,ca,bl,metier:info.metier||'—',commercial:info.commercial||'—',lastDate});
  }
  rows.sort((a,b)=>b.ca-a.ca);
  _renderNLResult('Nouveaux clients ce mois',rows.slice(0,30).map(r=>({
    nom:escapeHtml(r.nom),
    date:_fmtDate(r.lastDate),
    ca:formatEuro(r.ca),
    bl:r.bl+'&nbsp;BL',
    metier:escapeHtml(r.metier),
    commercial:escapeHtml(r.commercial),
  })),[
    {key:'nom',label:'Client',cls:'text-xs font-semibold t-primary'},
    {key:'date',label:'Premier achat',cls:'text-xs text-center'},
    {key:'ca',label:'CA',cls:'text-xs text-right font-bold'},
    {key:'bl',label:'BL',cls:'text-xs text-center t-tertiary'},
    {key:'metier',label:'Métier',cls:'text-xs t-tertiary'},
    {key:'commercial',label:'Commercial',cls:'text-xs t-tertiary'},
  ],`${rows.length} client${rows.length>1?'s':''}`);
}

// ── Sprint 2 — 8 intents supplémentaires ─────────────────────

function _nlCommercialSilence({commercial,jours}){
  const clients=_S.clientsByCommercial?.get(commercial);
  if(!clients?.size){_renderNLResult('Commercial — clients silencieux',[],[],`Commercial introuvable`);return;}
  const now=Date.now();const thr=jours*86400000;
  const rows=[];
  for(const cc of clients){
    const lastDate=_S.clientLastOrder?.get(cc);if(!lastDate||now-lastDate<thr)continue;
    const artMap=_S.ventesClientArticle?.get(cc);let ca=0;if(artMap)for(const v of artMap.values())ca+=(v.sumCA||0);
    const info=_S.chalandiseData?.get(cc)||{};
    rows.push({nom:escapeHtml(_S.clientNomLookup[cc]||info.nom||cc),joursN:Math.round((now-lastDate)/86400000),ca,classif:escapeHtml(info.classification||'—'),metier:escapeHtml(info.metier||'—'),lastDate});
  }
  rows.sort((a,b)=>b.ca-a.ca);
  const comLabel=commercial.split(' - ').pop()||commercial;
  _renderNLResult(`${comLabel} — silence >${jours}j`,rows.slice(0,40).map(r=>({
    nom:r.nom,
    jours:r.joursN+'j',
    ca:r.ca>0?formatEuro(r.ca):'<span class="t-disabled">—</span>',
    dernier:_fmtDate(r.lastDate),
    classif:r.classif,
    metier:r.metier,
  })),[
    {key:'nom',label:'Client',cls:'text-xs font-semibold t-primary'},
    {key:'jours',label:'Silence',cls:'text-xs text-center font-bold c-danger'},
    {key:'ca',label:'CA historique',cls:'text-xs text-right font-bold'},
    {key:'dernier',label:'Dernier achat',cls:'text-xs text-center t-tertiary'},
    {key:'classif',label:'Classif.',cls:'text-xs t-tertiary'},
    {key:'metier',label:'Métier',cls:'text-xs t-tertiary'},
  ],`${rows.length} client${rows.length!==1?'s':''} sur ${clients.size}`);
}

function _nlChurnActif({jours}){
  if(!_S.chalandiseReady||!_S.chalandiseData?.size){
    _renderNLResult('Clients FID silencieux',[],[],`Chalandise requise`);return;
  }
  const now=Date.now();const thr=jours*86400000;const rows=[];
  for(const[cc,info] of _S.chalandiseData.entries()){
    if(!/fid|pot\+|actif/i.test(info.classification||''))continue;
    const lastDate=_S.clientLastOrder?.get(cc);if(!lastDate||now-lastDate<thr)continue;
    const artMap=_S.ventesClientArticle?.get(cc);let ca=0;if(artMap)for(const v of artMap.values())ca+=(v.sumCA||0);
    if(ca<=0)continue;
    rows.push({nom:escapeHtml(info.nom||cc),classif:escapeHtml(info.classification||''),joursN:Math.round((now-lastDate)/86400000),ca,metier:escapeHtml(info.metier||'—'),commercial:escapeHtml(info.commercial||'—')});
  }
  rows.sort((a,b)=>b.ca-a.ca);
  _renderNLResult(`Clients actifs silencieux >${jours}j`,rows.slice(0,40).map(r=>({
    nom:r.nom,
    classif:`<span class="text-[10px] c-caution font-bold">${r.classif}</span>`,
    jours:r.joursN+'j',
    ca:formatEuro(r.ca),
    metier:r.metier,
    commercial:r.commercial,
  })),[
    {key:'nom',label:'Client',cls:'text-xs font-semibold t-primary'},
    {key:'classif',label:'Classif.',cls:'text-xs text-center'},
    {key:'jours',label:'Silence',cls:'text-xs text-center font-bold c-danger'},
    {key:'ca',label:'CA historique',cls:'text-xs text-right font-bold'},
    {key:'metier',label:'Métier',cls:'text-xs t-tertiary'},
    {key:'commercial',label:'Commercial',cls:'text-xs t-tertiary'},
  ],`${rows.length} client${rows.length!==1?'s':''}`);
}

function _nlRupturesTopClients({topN}){
  if(!DataStore.finalData.length||!_S.ventesClientArticle?.size){
    _renderNLResult('Ruptures top clients',[],[],`Données insuffisantes`);return;
  }
  const clientCA=new Map();
  for(const[cc,artMap] of _S.ventesClientArticle.entries()){
    let ca=0;for(const v of artMap.values())ca+=(v.sumCA||0);clientCA.set(cc,ca);
  }
  const topSet=new Set([...clientCA.entries()].sort((a,b)=>b[1]-a[1]).slice(0,topN||5).map(([cc])=>cc));
  const rupMap=new Map();
  for(const cc of topSet){
    const artMap=_S.ventesClientArticle.get(cc)||new Map();
    for(const[code,v] of artMap.entries()){
      const art=DataStore.finalData.find(r=>r.code===code);
      if(!art||(art.stockActuel||0)>0)continue;
      if(!rupMap.has(code))rupMap.set(code,{lib:_S.libelleLookup[code]||code,fam:_S.articleFamille[code]||art.famille||'',abc:art.abcClass||'?',clients:new Set(),ca:0});
      const r=rupMap.get(code);r.clients.add(cc);r.ca+=(v.sumCA||0);
    }
  }
  const rows=[...rupMap.values()].map(r=>({
    lib:escapeHtml((r.lib||'').substring(0,35)),
    fam:r.fam,
    abc:`<span class="font-bold ${r.abc==='A'?'c-danger':r.abc==='B'?'c-caution':'t-disabled'}">${r.abc}</span>`,
    clients:r.clients.size+'/'+topN,
    ca:formatEuro(r.ca),
    diag:r.fam?`<button class="diag-btn i-danger-bg c-danger text-[9px] py-0.5 px-1.5" onclick="openDiagnostic('${escapeHtml(r.fam)}','bench')">🔍</button>`:'',
  })).sort((a,b)=>parseInt(b.clients)-parseInt(a.clients));
  _renderNLResult(`Ruptures chez top ${topN||5} clients`,rows,[
    {key:'lib',label:'Article',cls:'text-xs font-semibold'},
    {key:'fam',label:'Famille',cls:'text-xs t-tertiary'},
    {key:'abc',label:'ABC',cls:'text-xs text-center'},
    {key:'clients',label:'Clients touchés',cls:'text-xs text-center font-bold c-danger'},
    {key:'ca',label:'CA à risque',cls:'text-xs text-right font-bold'},
    {key:'diag',label:'',cls:'text-xs text-center'},
  ],`${rows.length} article${rows.length!==1?'s':''} en rupture`);
}

function _nlDqReassort(){
  const items=(_S.decisionQueueData||[]).filter(d=>d.type==='rupture'||d.type==='alerte_prev');
  if(!items.length){_renderNLResult('Commandes urgentes',[],[],`Aucune rupture ni alerte préventive dans la file`);return;}
  _renderNLResult("Commandes à passer aujourd'hui",items.slice(0,30).map(d=>({
    type:`<span class="text-[10px] font-bold ${d.type==='alerte_prev'?'c-caution':'c-danger'}">${d.type==='alerte_prev'?'⚠️ Préventif':'🔴 Rupture'}</span>`,
    label:escapeHtml(d.label||''),
    impact:d.impact>0?formatEuro(d.impact):'—',
    sugg:d.qteSugg!=null?d.qteSugg+' u.':'—',
    action:escapeHtml((d.action||'').substring(0,50)),
  })),[
    {key:'type',label:'Type',cls:'text-xs text-center'},
    {key:'label',label:'Article / Famille',cls:'text-xs font-semibold'},
    {key:'impact',label:'CA/sem',cls:'text-xs text-right font-bold'},
    {key:'sugg',label:'Qté sugg.',cls:'text-xs text-center'},
    {key:'action',label:'Action',cls:'text-xs t-tertiary'},
  ],`${items.length} article${items.length!==1?'s':''}`);
}

function _nlAnomalieMinmax(){
  const rows=DataStore.finalData
    .filter(r=>(!r.nouveauMin||r.nouveauMin===0)&&(r.V||0)>0&&!r.isParent)
    .map(r=>({code:r.code,lib:escapeHtml((r.libelle||r.code).substring(0,35)),v:r.V,ca:Math.round(r.caAnnuel||0),abc:r.abcClass||'?',fam:r.famille||'',stock:r.stockActuel||0}))
    .sort((a,b)=>b.ca-a.ca).slice(0,50);
  _renderNLResult('Articles actifs sans MIN/MAX ERP',rows.map(r=>({
    code:`<span class="font-mono text-[10px] t-disabled">${r.code}</span>`,
    lib:r.lib,
    v:r.v,
    ca:formatEuro(r.ca),
    abc:`<span class="font-bold ${r.abc==='A'?'c-danger':r.abc==='B'?'c-caution':'t-disabled'}">${r.abc}</span>`,
    stock:r.stock>0?`<span class="c-ok">${r.stock}</span>`:'<span class="c-danger font-bold">0</span>',
    fam:r.fam,
  })),[
    {key:'code',label:'Code',cls:'text-xs'},
    {key:'lib',label:'Libellé',cls:'text-xs font-semibold'},
    {key:'v',label:'W',cls:'text-xs text-center t-tertiary'},
    {key:'ca',label:'CA annuel',cls:'text-xs text-right font-bold'},
    {key:'abc',label:'ABC',cls:'text-xs text-center'},
    {key:'stock',label:'Stock',cls:'text-xs text-center'},
    {key:'fam',label:'Famille',cls:'text-xs t-tertiary'},
  ],`${rows.length} article${rows.length!==1?'s':''} sans calibrage`);
}

function _nlBenchFamilleReseau({query}){
  const hm=_S.reseauHeatmapData;const fp=_S.benchLists?.familyPerf;
  if(!hm?.familles?.length&&!fp?.length){_renderNLResult('Performance réseau',[],[],`Réseau ou Benchmark non disponible`);return;}
  const qn=_normNL(query);let matchedFam=null;
  // Fuzzy match famille dans heatmap ou familyPerf
  for(const src of[hm?.familles||[],fp?.map(f=>f.fam)||[]]){
    if(matchedFam)break;
    let best=0;
    for(const fam of src){
      for(const w of _normNL(fam).split(/\s+/)){
        if(w.length>3&&qn.includes(w)&&w.length>best){best=w.length;matchedFam=fam;}
      }
    }
  }
  if(matchedFam&&hm?.matrix?.[matchedFam]){
    const rows=Object.entries(hm.matrix[matchedFam]).map(([store,ratio])=>({store,ratio})).sort((a,b)=>b.ratio-a.ratio);
    _renderNLResult(`Réseau — ${matchedFam}`,rows.map((r,i)=>({
      rank:`<strong>#${i+1}</strong>`,
      store:escapeHtml(r.store),
      ratio:`<span class="font-bold ${r.ratio>=1.2?'c-ok':r.ratio<0.5?'c-danger':'c-caution'}">${Math.round(r.ratio*100)}%</span>`,
    })),[
      {key:'rank',label:'#',cls:'text-xs text-center'},
      {key:'store',label:'Agence',cls:'text-xs font-semibold'},
      {key:'ratio',label:'vs médiane',cls:'text-xs text-center'},
    ],`${rows.length} agences · famille "${matchedFam}"`);
    return;
  }
  // Fallback : familles triées par médiane réseau
  const rows=(fp||[]).sort((a,b)=>(b.med||0)-(a.med||0)).slice(0,20).map(f=>({
    fam:escapeHtml(f.fam),moi:f.my||0,med:f.med||0,pct:f.med>0?Math.round(f.my/f.med*100)+'%':'—',
  }));
  _renderNLResult('Performance réseau — toutes familles',rows,[
    {key:'fam',label:'Famille',cls:'text-xs font-semibold'},
    {key:'moi',label:'Moi',cls:'text-xs text-right'},
    {key:'med',label:'Médiane réseau',cls:'text-xs text-right t-tertiary'},
    {key:'pct',label:'% médiane',cls:'text-xs text-right'},
  ],matchedFam?`"${matchedFam}" non trouvé dans heatmap`:`${rows.length} familles`);
}

function _nlMetierCanal({canal,metierKw}){
  if(!_S.ventesClientHorsMagasin?.size){_renderNLResult(`Clients ${canal}`,[],[],`Données hors-agence non disponibles`);return;}
  // Cherche le libellé métier exact dans chalandise
  let metierMatch=null;
  if(_S.chalandiseReady&&metierKw){
    for(const info of _S.chalandiseData.values()){
      if(info.metier&&_normNL(info.metier).includes(metierKw)){metierMatch=info.metier;break;}
    }
  }
  const rows=[];
  for(const[cc,artMap] of _S.ventesClientHorsMagasin.entries()){
    let ca=0,hasC=false;
    for(const v of artMap.values()){if(v.canal===canal){hasC=true;ca+=(v.sumCA||0);}}
    if(!hasC||ca<=0)continue;
    const info=_S.chalandiseData?.get(cc)||{};
    if(metierKw){
      const m=_normNL(info.metier||'');
      if(!m.includes(metierKw))continue;
    }
    rows.push({nom:_S.clientNomLookup[cc]||info.nom||cc,ca,metier:info.metier||'—',commercial:info.commercial||'—',hasPdv:_S.ventesClientArticle?.has(cc)});
  }
  rows.sort((a,b)=>b.ca-a.ca);
  const label=metierMatch||metierKw||'tous métiers';
  _renderNLResult(`Clients ${label} — ${canal}`,rows.slice(0,40).map(r=>({
    nom:escapeHtml(r.nom),
    ca:formatEuro(r.ca),
    pdv:r.hasPdv?'<span class="c-ok text-[10px]">✓ PDV</span>':'<span class="c-caution text-[10px]">hors-PDV</span>',
    metier:escapeHtml(r.metier),
    commercial:escapeHtml(r.commercial),
  })),[
    {key:'nom',label:'Client',cls:'text-xs font-semibold t-primary'},
    {key:'ca',label:`CA ${canal}`,cls:'text-xs text-right font-bold'},
    {key:'pdv',label:'PDV',cls:'text-xs text-center'},
    {key:'metier',label:'Métier',cls:'text-xs t-tertiary'},
    {key:'commercial',label:'Commercial',cls:'text-xs t-tertiary'},
  ],`${rows.length} client${rows.length!==1?'s':''}`);
}

function _nlArticlesHorsMarque({term}){
  if(!_S.ventesClientHorsMagasin?.size){_renderNLResult('Articles achetés ailleurs',[],[],`Données hors-agence non disponibles`);return;}
  const tn=_normNL(term);
  const codeCA=new Map();
  for(const[cc,artMap] of _S.ventesClientHorsMagasin.entries()){
    for(const[code,v] of artMap.entries()){
      const lib=_normNL(_S.libelleLookup[code]||code);
      if(!lib.includes(tn)&&!_normNL(code).includes(tn))continue;
      if(!codeCA.has(code))codeCA.set(code,{ca:0,clients:new Set()});
      const r=codeCA.get(code);r.ca+=(v.sumCA||0);r.clients.add(cc);
    }
  }
  const rows=[...codeCA.entries()].map(([code,d])=>{
    const art=DataStore.finalData.find(r=>r.code===code);
    const inPdv=[...(_S.ventesClientArticle?.values()||[])].some(m=>m.has(code));
    return{code,lib:escapeHtml((_S.libelleLookup[code]||code).substring(0,35)),caHors:d.ca,clients:d.clients.size,inPdv,abc:art?.abcClass||'—',stock:art!=null?(art.stockActuel||0):-1};
  }).sort((a,b)=>b.caHors-a.caHors).slice(0,30);
  _renderNLResult(`"${term.substring(0,20)}" achetés ailleurs`,rows.map(r=>({
    code:`<span class="font-mono text-[10px] t-disabled">${r.code}</span>`,
    lib:r.lib,
    caHors:formatEuro(r.caHors),
    clients:r.clients,
    pdv:r.inPdv?'<span class="c-ok text-[10px]">✓ PDV</span>':'<span class="c-caution text-[10px]">absent PDV</span>',
    stock:r.stock>=0?(r.stock>0?`<span class="c-ok">${r.stock}</span>`:'<span class="c-danger">0</span>'):'—',
    abc:`<span class="${r.abc==='A'?'c-danger font-bold':r.abc==='B'?'c-caution font-bold':'t-disabled'}">${r.abc}</span>`,
  })),[
    {key:'code',label:'Code',cls:'text-xs'},
    {key:'lib',label:'Article',cls:'text-xs font-semibold'},
    {key:'caHors',label:'CA ailleurs',cls:'text-xs text-right font-bold c-danger'},
    {key:'clients',label:'Clients',cls:'text-xs text-center'},
    {key:'pdv',label:'Chez moi',cls:'text-xs text-center'},
    {key:'stock',label:'Stock',cls:'text-xs text-center'},
    {key:'abc',label:'ABC',cls:'text-xs text-center'},
  ],`${rows.length} article${rows.length!==1?'s':''} trouvés`);
}

function _dispatchNLQuery(intent,params,raw){
  _resetNLDisplay();
  switch(intent){
    case 'RECONQUETE':          _nlReconquete();break;
    case 'COMMERCIAL_SILENCE':  _nlCommercialSilence(params);break;
    case 'CHURN_ACTIF':         _nlChurnActif(params);break;
    case 'CLIENTS_SILENCIEUX':  _nlClientsSilencieux(params);break;
    case 'CLIENTS_PERDUS':      _nlClientsPerdus(params);break;
    case 'STOCK_DORMANT':       _nlStockDormant(params);break;
    case 'RUPTURES_TOP_CLIENTS':_nlRupturesTopClients(params);break;
    case 'DQ_REASSORT':         _nlDqReassort();break;
    case 'ANOMALIE_MINMAX':     _nlAnomalieMinmax();break;
    case 'BENCH_SOUS_MEDIANE':  _nlBenchSousMediane();break;
    case 'BENCH_FAMILLE_RESEAU':_nlBenchFamilleReseau(params);break;
    case 'KPI_TAUX_SERVICE':    _nlKpiTauxService();break;
    case 'ARTICLES_HORS_MARQUE':_nlArticlesHorsMarque(params);break;
    case 'CLIENTS_HORS_AGENCE': _nlClientsHorsAgence(params);break;
    case 'METIER_CANAL':        _nlMetierCanal(params);break;
    case 'CANAL_EXCLUSIF':      _nlCanalExclusif(params);break;
    case 'TOP_CLIENTS_CANAL':   _nlTopClientsCanal(params);break;
    case 'OPPORTUNITES':        _nlOpportunites(params);break;
    case 'NOUVEAUX_CLIENTS':    _nlNouveauxClients();break;
    default:break;
  }
}

// ─────────────────────────────────────────────────────────────────────────

export { _onPromoInput, _closePromoSuggest, _selectPromoSuggestion, _promoSuggestKeydown, runPromoSearch, _onPromoFamilleChange, _applyPromoFilters, _resetPromoFilters, _togglePromoSection, exportTourneeCSV, exportPromoCSV, copyPromoClipboard, _onPromoImportFileChange, _clearPromoImport, runPromoImport, _togglePromoImportSection, exportPromoImportCSV, resetPromo, _activatePromoImportAction, _togglePromoClientRow, _switchPromoTab, _exportCommercialCSV, _renderSearchResults };
