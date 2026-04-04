'use strict';

// ── ESM imports ─────────────────────────────────────────────────────────
import { _S } from './state.js';
import { DataStore } from './store.js';
import { formatEuro, escapeHtml, _copyCodeBtn, fmtDate, matchQuery } from './utils.js';
import { _clientPassesFilters, _unikLink } from './engine.js';
import { getSelectedSecteurs } from './parser.js';
import { renderInsightsBanner } from './ui.js';
import { deltaColor, renderOppNetteTable } from './helpers.js';
import { openClient360 } from './diagnostic.js';

// ── Cross-module calls via window.xxx (avoid circular deps) ─────────────
// territoire.js: _buildChalandiseOverview, _buildDegradedCockpit
// omni.js: getKPIsByCanal
// terrain.js: buildTerrContrib, renderTerrContrib, renderTerrCroisementSummary

// Shorthand accessors for cross-module window functions used in renderTerritoireTab
const _buildChalandiseOverview = (...a) => window._buildChalandiseOverview?.(...a);
const _buildDegradedCockpit = (...a) => window._buildDegradedCockpit?.(...a);
const getKPIsByCanal = (...a) => window.getKPIsByCanal?.(...a);
const buildTerrContrib = (...a) => window.buildTerrContrib?.(...a);
const renderTerrContrib = (...a) => window.renderTerrContrib?.(...a);
const renderTerrCroisementSummary = (...a) => window.renderTerrCroisementSummary?.(...a);

// ── Extracted code (unchanged) ──────────────────────────────────────────

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
    // Delegate all chalandise filters to _clientPassesFilters (engine.js)
    // which handles: dept, classif, statut, statutDetaillé, activitéPDV,
    // direction, commercial, métier, stratégique, univers, distance
    const info=_S.chalandiseData?.get(cc);
    if(info){
      if(!_clientPassesFilters(info,cc))return false;
    }else{
      // Client not in chalandise — exclude if any chalandise filter is active
      const _hasChalFilter=_S._selectedDepts?.size>0||_S._selectedClassifs?.size>0||_S._selectedStatuts?.size>0||_S._selectedActivitesPDV?.size>0||_S._selectedDirections?.size>0||_S._selectedUnivers?.size>0||_S._selectedCommercial||_S._selectedMetier||_S._filterStrategiqueOnly||_S._selectedStatutDetaille||(_S._distanceMaxKm>0&&_S._agenceCoords);
      if(_hasChalFilter)return false;
    }
    // Vue clients (specific to _passesAllFilters, not in _clientPassesFilters)
    const view=_S._clientView||'tous';
    if(view==='potentiels'&&_S.chalandiseData?.has(cc))return false;
    if(view==='captes'&&!_S.chalandiseData?.has(cc))return false;
    if(view==='horszone'&&_S.chalandiseData?.has(cc))return false;
    if(view==='multicanaux'){let caHors=0,caMag=0;const h=_S.ventesClientHorsMagasin?.get(cc);const m2=_S.ventesClientArticle?.get(cc);if(h)for(const d of h.values())caHors+=d.sumCA||0;if(m2)for(const d of m2.values())caMag+=d.sumCA||0;if(caHors<=caMag)return false;}
    if(view==='dormants'){const lastDate=_S.clientLastOrder?.get(cc);const silence=lastDate?Math.round((Date.now()-lastDate)/86400000):999;if(silence<=180)return false;}
    // Segment omnicanal (specific to _passesAllFilters)
    if(_S._omniSegmentFilter){const seg=_S.clientOmniScore?.get(cc)?.segment;if(seg!==_S._omniSegmentFilter)return false;}
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
        let caPDV=0,caPrelevee=0;
        for(const v of artMap.values()){caPDV+=(v.sumCA||0);caPrelevee+=(v.sumCAPrelevee||0);}
        if(caPDV<100)continue;
        const horsMap=_S.ventesClientHorsMagasin.get(cc);
        const caHors=horsMap?[...horsMap.values()].reduce((s,v)=>s+(v.sumCA||0),0):0;
        const caTotal=caPDV+caHors;
        const lastDate=_S.clientLastOrder?.get(cc);
        const info=_S.chalandiseData?.get(cc);
        const nom=info?.nom||_S.clientNomLookup?.[cc]||cc;
        topRows.push({cc,nom,metier:info?.metier||'',caPrimary:caPDV,caPrelevee,caDelta:caHors,caTotal,lastDate});
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
      const _prevColor=isMagCanal?(r.caPrelevee<r.caPrimary*0.5?'c-caution':'c-ok'):'';
      return`<tr class="border-b b-light hover:s-hover cursor-pointer transition-colors" onclick="openClient360('${r.cc}','territoire')"><td class="py-1.5 px-2 font-bold text-[11px]">${r.nom}<span class="text-[9px] t-disabled font-normal ml-1">${r.metier||''}</span></td><td class="py-1.5 px-2 text-right font-bold c-action text-[11px]">${formatEuro(r.caPrimary)}</td>${isMagCanal?`<td class="py-1.5 px-2 text-right text-[11px] ${_prevColor}">${formatEuro(r.caPrelevee)}</td>`:''}<td class="py-1.5 px-2 text-right text-[11px]">${formatEuro(r.caTotal)}</td><td class="py-1.5 px-2 text-right text-[10px] ${_dc}">${r.caDelta>0?'+'+formatEuro(r.caDelta):'—'}</td><td class="py-1.5 px-2 text-center text-[10px] ${silColor}">${silence}</td></tr>`;
    }).join('');
    el.innerHTML=`<details${_openAttr} class="mb-3 s-card rounded-xl border overflow-hidden"><summary class="flex items-center justify-between px-4 py-3 s-card-alt border-b cursor-pointer select-none hover:brightness-95"><h3 class="font-extrabold text-sm t-primary">🏆 Top clients PDV <span class="text-[10px] font-normal t-disabled ml-1 cursor-help" title="${_subtitleTip}">${subtitle}</span></h3><span class="acc-arrow t-disabled">▶</span></summary><div class="overflow-x-auto"><table class="min-w-full text-xs"><thead class="s-panel-inner t-inverse font-bold"><tr><th class="py-2 px-2 text-left">Client</th><th class="py-2 px-2 text-right">${colPrimary}</th>${isMagCanal?'<th class="py-2 px-2 text-right">CA Prélevé</th>':''}<th class="py-2 px-2 text-right">CA Total</th><th class="py-2 px-2 text-right">${colDelta}</th><th class="py-2 px-2 text-center">Silence</th></tr></thead><tbody>${rows}</tbody></table></div>${pagerHtml}</details>`;
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
    // terrFiltersBlock (search/direction/secteur/rayon) — visible si fichier territoire chargé
    const terrFilBlk=document.getElementById('terrFiltersBlock');if(terrFilBlk)terrFilBlk.classList.toggle('hidden',!hasData&&!hasConsomme);
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
    // Captures les innerHTML APRÈS le rendu complet
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

  function renderCockpitEquation(){
    const el=document.getElementById('cockpitEquation');if(!el)return;
    const canal=_S._globalCanal||'';
    const CANAL_ICONS={MAGASIN:'🏪',INTERNET:'🌐',REPRESENTANT:'🤝',DCS:'📦'};
    const CANAL_LABELS={MAGASIN:'Magasin',INTERNET:'Internet',REPRESENTANT:'Représentant',DCS:'DCS'};
    let nbClients=0,ca=0,nbBL=0,canalLabel='tous canaux',canalIcon='📊';
    if(!canal){
      // Tous canaux — somme de tous les canaux
      for(const c of Object.values(_S.canalAgence||{})){ca+=c.ca||0;nbBL+=c.bl||0;}
      // Clients distincts tous canaux = union VCA + VCHM
      const allClients=new Set();
      if(_S.ventesClientArticle)for(const cc of _S.ventesClientArticle.keys())allClients.add(cc);
      if(_S.ventesClientHorsMagasin)for(const cc of _S.ventesClientHorsMagasin.keys())allClients.add(cc);
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
    let txMarge,vmc;
    if(canal){
      txMarge=_S.ventesAnalysis?.txMarge;vmc=_S.ventesAnalysis?.vmc;
    }else{
      // Tx marge tous canaux — VMB depuis canalAgence (recalculé par _refilterFromByMonth)
      let _vmbTC=0;
      for(const d of Object.values(_S.canalAgence||{}))_vmbTC+=d.sumVMB||0;
      txMarge=ca>0?(_vmbTC/ca*100):null;
      vmc=nbBL>0?ca/nbBL:null;
    }
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
    el.innerHTML=`<div class="overflow-x-auto"><table class="min-w-full text-xs"><thead class="s-card-alt t-secondary font-bold text-[10px]"><tr><th class="py-1.5 px-2 text-left">Code</th><th class="py-1.5 px-2 text-left">Nom</th><th class="py-1.5 px-2 text-center">Articles en rupture</th><th class="py-1.5 px-2 text-right">CA impacte</th></tr></thead><tbody>${rows}</tbody></table>${rupClients.length>10?`<p class="text-[10px] t-disabled px-3 py-1.5">… et ${rupClients.length-10} autres</p>`:''}</div>`;
  }

  // ★ COCKPIT HELPERS — Clients PDV

  function _cockpitAvatar(nom, bg, color) {
    const s = nom.split(' ').slice(0,2).map(w=>w[0]||'').join('').toUpperCase();
    return `<div style="width:32px;height:32px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:500;flex-shrink:0;background:${bg};color:${color}">${s}</div>`;
  }

  function _renderCockpitKPIBand(ov) {
    const pctLeg = ov.nbZone>0 ? Math.round(ov.nbCaptesLeg/ov.nbZone*100) : 0;
    const pctPDV = ov.nbZone>0 ? Math.round(ov.nbCaptesPDV/ov.nbZone*100) : 0;
    const _c = (lbl, val, sub, color) =>
      `<div style="background:var(--color-background-secondary);border-radius:var(--border-radius-md);padding:14px 16px;border:1px solid var(--color-border)">
        <div style="font-size:9px;text-transform:uppercase;letter-spacing:.06em;color:var(--color-text-tertiary);margin-bottom:6px">${lbl}</div>
        <div style="font-size:22px;font-weight:800;${color?`color:${color}`:''}">${val}</div>
        <div style="font-size:10px;color:var(--color-text-tertiary);margin-top:2px">${sub}</div>
      </div>`;
    return `<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:20px">
      ${_c('Clients zone', ov.nbZone.toLocaleString('fr-FR'), _S.chalandiseReady?'dans la zone de chalandise':'Chargez la chalandise')}
      ${_c('Captés Leg.', ov.nbCaptesLeg.toLocaleString('fr-FR'), pctLeg+'% de la zone', '#378ADD')}
      ${_c('Captés PDV', ov.nbCaptesPDV.toLocaleString('fr-FR'), pctPDV+'% de la zone', '#22c55e')}
      ${_c('Exclus >24m', ov.nbExclus.toLocaleString('fr-FR'), 'sans activité détectée', '#94a3b8')}
    </div>`;
  }

  function _renderCockpitColumns(k) {
    const nowMs = Date.now();
    const _ds = r => r.lastDate ? Math.round((nowMs - r.lastDate) / 86400000) : null;
    const withDays = k.topPDVRows.map(r => ({...r, days: _ds(r)}));
    const silencieux = withDays.filter(r => r.days !== null && r.days >= 30 && r.days <= 60).slice(0, 6);
    const perdus = withDays.filter(r => r.days !== null && r.days > 60).slice(0, 6);
    const totalSil = withDays.filter(r => r.days !== null && r.days >= 30 && r.days <= 60).length;
    const totalPerd = withDays.filter(r => r.days !== null && r.days > 60).length;
    const acapter = [];
    if (_S.crossingStats?.potentiels?.size) {
      for (const cc of _S.crossingStats.potentiels) {
        const info = _S.chalandiseData?.get(cc);
        if (!info) continue;
        acapter.push({cc, nom: info.nom||cc, metier: info.metier||'', ca2025: info.ca2025||0});
      }
      acapter.sort((a,b) => b.ca2025 - a.ca2025);
    }
    const acapterTop = acapter.slice(0, 4);
    const totalPot = _S.crossingStats?.potentiels?.size || 0;
    const _rowSil = r => {
      const pct = Math.min(100, Math.round((r.days-30)/30*100));
      const barColor = r.days > 50 ? '#ef4444' : '#EF9F27';
      return `<div style="display:flex;align-items:center;gap:8px;padding:7px 0;border-bottom:1px solid rgba(128,128,128,.12);cursor:pointer" onclick="openClient360('${escapeHtml(r.cc)}','clients')">
        ${_cockpitAvatar(r.nom, 'rgba(239,159,39,.18)', '#EF9F27')}
        <div style="flex:1;min-width:0">
          <div style="font-size:11px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(r.nom)}</div>
          <div style="font-size:9px;color:var(--color-text-tertiary)">${escapeHtml(r.metier||'—')}</div>
          <div style="display:flex;align-items:center;gap:4px;margin-top:3px">
            <div style="flex:1;background:rgba(128,128,128,.12);border-radius:3px;height:4px"><div style="width:${pct}%;background:${barColor};height:4px;border-radius:3px"></div></div>
            <span style="font-size:9px;color:${barColor};flex-shrink:0">${r.days}j</span>
          </div>
        </div>
        <span style="font-size:10px;font-weight:700;color:var(--color-text-secondary);white-space:nowrap">${formatEuro(r.caPDV)}</span>
      </div>`;
    };
    const _rowPerdu = r => `<div style="display:flex;align-items:center;gap:8px;padding:7px 0;border-bottom:1px solid rgba(128,128,128,.12);cursor:pointer" onclick="openClient360('${escapeHtml(r.cc)}','clients')">
      ${_cockpitAvatar(r.nom, 'rgba(226,75,74,.18)', '#E24B4A')}
      <div style="flex:1;min-width:0">
        <div style="font-size:11px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(r.nom)}</div>
        <div style="font-size:9px;color:var(--color-text-tertiary)">${escapeHtml(r.metier||'—')}</div>
        <div style="display:flex;align-items:center;gap:4px;margin-top:3px">
          <div style="flex:1;background:rgba(226,75,74,.12);border-radius:3px;height:4px"><div style="width:100%;background:#E24B4A;height:4px;border-radius:3px"></div></div>
          <span style="font-size:9px;color:#E24B4A;flex-shrink:0">${r.days}j</span>
        </div>
      </div>
      <span style="font-size:10px;font-weight:700;color:var(--color-text-secondary);white-space:nowrap">${formatEuro(r.caPDV)}</span>
    </div>`;
    const _rowCapter = r => `<div style="display:flex;align-items:center;gap:8px;padding:7px 0;border-bottom:1px solid rgba(128,128,128,.12);cursor:pointer" onclick="openClient360('${escapeHtml(r.cc)}','clients')">
      ${_cockpitAvatar(r.nom, 'rgba(55,138,221,.18)', '#378ADD')}
      <div style="flex:1;min-width:0">
        <div style="font-size:11px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(r.nom)}</div>
        <div style="font-size:9px;color:var(--color-text-tertiary)">${escapeHtml(r.metier||'—')}</div>
      </div>
      <span style="font-size:10px;font-weight:700;color:#378ADD;white-space:nowrap">${r.ca2025>0?formatEuro(r.ca2025):'—'}</span>
    </div>`;
    const _col = (title, color, rows, badge, scrollTarget) => {
      const empty = `<div style="padding:16px 0;text-align:center;font-size:11px;color:var(--color-text-tertiary)">Aucun client</div>`;
      const vPlus = rows.length > 0 && scrollTarget ? `<div style="padding-top:8px;text-align:right;border-top:1px solid rgba(128,128,128,.1);margin-top:4px"><button style="font-size:10px;color:${color};cursor:pointer;background:none;border:none;padding:0" onclick="document.getElementById('${scrollTarget}')?.scrollIntoView({behavior:'smooth'})">Voir tous →</button></div>` : '';
      return `<div style="background:var(--color-background-secondary);border-radius:var(--border-radius-md);padding:14px 16px;border:1px solid var(--color-border);border-top:2px solid ${color}">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
          <span style="font-size:10px;font-weight:700;color:${color};text-transform:uppercase;letter-spacing:.06em">${title}</span>
          ${badge?`<span style="font-size:9px;font-weight:700;background:${color}22;color:${color};border-radius:100px;padding:1px 7px">${badge}</span>`:''}
        </div>
        ${rows.length ? rows.join('') : empty}
        ${vPlus}
      </div>`;
    };
    return `<div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin-bottom:16px">
      ${_col('Silencieux 30–60j', '#EF9F27', silencieux.map(_rowSil), totalSil?String(totalSil):'', totalSil > silencieux.length ? 'clientsTopPDV' : '')}
      ${_col('Perdus >60j', '#E24B4A', perdus.map(_rowPerdu), totalPerd?String(totalPerd):'', totalPerd > perdus.length ? 'clientsReconquete' : '')}
      ${_col('À capter', '#378ADD', acapterTop.map(_rowCapter), totalPot?`${totalPot} potentiels`:'', '')}
    </div>`;
  }

  function _renderCockpitBottomGrid(k) {
    const oppFamMap = new Map();
    for (const o of (_S.opportuniteNette||[])) {
      const fam = o.missingFams?.[0]?.fam || '?';
      if (!oppFamMap.has(fam)) oppFamMap.set(fam, {fam, nb: 0, pot: 0});
      const b = oppFamMap.get(fam); b.nb++; b.pot += o.totalPotentiel || 0;
    }
    const oppFams = [...oppFamMap.values()].sort((a,b) => b.nb - a.nb).slice(0, 5);
    const oppRows = oppFams.map(f =>
      `<div style="display:flex;align-items:center;gap:8px;padding:5px 0;border-bottom:1px solid rgba(128,128,128,.1)">
        <div style="flex:1;font-size:11px">${escapeHtml(f.fam)}</div>
        <span style="font-size:9px;font-weight:700;background:rgba(55,138,221,.12);color:#378ADD;border-radius:100px;padding:1px 6px">${f.nb} clients</span>
        ${f.pot>0?`<span style="font-size:10px;color:var(--color-text-tertiary)">${formatEuro(f.pot)}</span>`:''}
      </div>`).join('');
    const totalOpp = _S.opportuniteNette?.length || 0;
    const oppSection = `<div style="background:var(--color-background-secondary);border-radius:var(--border-radius-md);padding:14px 16px;border:1px solid var(--color-border)">
      <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--color-text-secondary);margin-bottom:10px">Opportunités nettes <span style="font-weight:400;text-transform:none;font-size:9px;color:var(--color-text-tertiary)">${totalOpp>0?'top 5 familles':''}</span></div>
      ${oppRows || `<div style="padding:12px 0;text-align:center;font-size:11px;color:var(--color-text-tertiary)">${_S.chalandiseReady?'Aucune opportunité':'Chargez la chalandise'}</div>`}
      ${totalOpp>5?`<div style="padding-top:8px;text-align:right"><button style="font-size:10px;color:#378ADD;cursor:pointer;background:none;border:none;padding:0" onclick="document.getElementById('clientsOpportunites')?.scrollIntoView({behavior:'smooth'})">Voir toutes (${totalOpp}) →</button></div>`:''}
    </div>`;
    const topRows = k.topPDVRows.slice(0, 5);
    const maxCA = topRows.length ? topRows[0].caPDV : 1;
    const pdvBars = topRows.map(r =>
      `<div style="display:flex;align-items:center;gap:8px;padding:5px 0">
        <div style="width:110px;font-size:10px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex-shrink:0;cursor:pointer" onclick="openClient360('${escapeHtml(r.cc)}','clients')">${escapeHtml(r.nom)}</div>
        <div style="flex:1;height:6px;background:rgba(128,128,128,.12);border-radius:3px">
          <div style="width:${Math.round(r.caPDV/maxCA*100)}%;background:#378ADD;height:6px;border-radius:3px"></div>
        </div>
        <div style="font-size:10px;font-weight:700;color:#378ADD;white-space:nowrap;min-width:54px;text-align:right">${formatEuro(r.caPDV)}</div>
      </div>`).join('');
    const pdvSection = `<div style="background:var(--color-background-secondary);border-radius:var(--border-radius-md);padding:14px 16px;border:1px solid var(--color-border)">
      <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--color-text-secondary);margin-bottom:10px">Top clients PDV</div>
      ${pdvBars || `<div style="padding:12px 0;text-align:center;font-size:11px;color:var(--color-text-tertiary)">Aucun client PDV</div>`}
      ${k.topPDVRows.length>5?`<div style="padding-top:8px;text-align:right"><button style="font-size:10px;color:#378ADD;cursor:pointer;background:none;border:none;padding:0" onclick="document.getElementById('clientsTopPDV')?.scrollIntoView({behavior:'smooth'})">Voir tous (${k.topPDVRows.length}) →</button></div>`:''}
    </div>`;
    return `<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:20px">
      ${oppSection}
      ${pdvSection}
    </div>`;
  }

  function renderMesClients(){
    const el=document.getElementById('tabCommerce');
    if(!el)return;
    const pane=document.getElementById('clientsPane-priorites');
    if(!pane)return;
    if(!_S.ventesClientArticle.size && !_S.finalData.length){
      pane.innerHTML='<div class="p-8 text-center t-disabled">Chargez d\'abord le fichier consommé.</div>';
      return;
    }
    const k=computeClientsKPIs();

    // KPI band stats — inline compute
    let nbZone=_S.chalandiseData?.size||0, nbCaptesLeg=0, nbCaptesPDV=0, nbExclus=0;
    if(_S.chalandiseReady){
      for(const[cc,info] of _S.chalandiseData){
        const hasPDV=_S.ventesClientArticle.has(cc);
        const hasHors=!!_S.ventesClientHorsMagasin?.get(cc)?.size;
        if(hasPDV||hasHors)nbCaptesLeg++;
        if(hasPDV)nbCaptesPDV++;
        if(!hasPDV&&!hasHors&&!(info.ca2025>0)&&!info.activiteGlobale)nbExclus++;
      }
    }
    const ovStats={nbZone,nbCaptesLeg,nbCaptesPDV,nbExclus};

    // ── Accordéons détail (conservés) ───────────────────────────────────
    const top5=k.top5;
    const top5Html=top5.length?`<div class="mb-5 s-card rounded-xl border-2 overflow-hidden" style="border-color:#0891b2">
      <div class="flex items-center justify-between px-4 py-3" style="background:#06b6d41F;border-bottom:1px solid #0891b233">
        <div><h3 class="font-extrabold text-sm" style="color:#0891b2">⚡ Top 5 — Priorités cette semaine</h3>
        <p class="text-[10px] t-tertiary mt-0.5">Clients silencieux (30–60j), classés par CA × durée de silence</p></div>
        ${_S.chalandiseReady?'':`<span class="text-[10px] c-caution font-semibold">Chargez la zone de chalandise pour plus de précision</span>`}
      </div>
      <div class="divide-y b-light">${top5.map(c=>`<div class="flex items-center gap-3 px-4 py-2.5 s-hover cursor-pointer transition-colors hover:i-info-bg" data-cc="${escapeHtml(c.cc)}" onclick="openClient360(this.dataset.cc,'clients')"><span class="font-bold text-sm flex-1">${escapeHtml(c.nom)}</span><span class="text-[10px] t-tertiary flex-shrink-0 text-right max-w-[200px]">${escapeHtml(c.reason)}</span><span class="text-[10px] font-mono t-disabled ml-2" title="Score priorité">⚡${c.score}</span><span class="text-[10px] font-semibold ml-2 flex-shrink-0" style="color:#0891b2">${escapeHtml(c.commercial||'—')}</span></div>`).join('')}</div>
    </div>`:`<div class="mb-5 p-4 s-card rounded-xl border text-[12px] t-secondary">⚡ <strong>Top 5</strong> : ${_S.chalandiseReady?'Aucun client silencieux trouvé.':'Chargez la zone de chalandise pour voir les priorités.'}</div>`;

    const top5ReconqHtml=k.top5Reconq.length?(()=>{
      const cards=k.top5Reconq.map(c=>`<div class="p-2.5 s-card rounded-lg border cursor-pointer hover:i-info-bg transition-colors" data-cc="${escapeHtml(c.cc)}" onclick="openClient360(this.dataset.cc,'reconquete')"><div class="flex items-center gap-2 flex-wrap"><span class="font-bold text-sm">${escapeHtml(c.nom)}</span><span class="text-[9px] px-1.5 py-0.5 rounded-full font-bold" style="background:#4c0519;color:#fda4af">🔴 ${c.daysAgo}j</span><button data-cc="${escapeHtml(c.cc)}" onclick="event.stopPropagation();openClient360(this.dataset.cc,'reconquete')" class="ml-auto text-[9px] px-2 py-0.5 rounded-full font-semibold" style="background:#be123c;color:#fff">📞 Appeler</button></div><div class="flex gap-3 mt-1 text-[10px] t-tertiary"><span>${escapeHtml(c.metier||'—')}</span><span>CA PDV <strong class="t-primary">${formatEuro(c.caPDV)}</strong></span><span class="c-action">${escapeHtml(c.commercial||'—')}</span><span class="t-disabled" title="Score priorité">⚡${c.score.toLocaleString('fr-FR')}</span></div></div>`).join('');
      return`<details class="mb-3 s-card rounded-xl border overflow-hidden" style="border-color:#e11d48"><summary class="flex items-center justify-between px-4 py-3 s-card-alt border-b cursor-pointer select-none hover:brightness-95"><h3 class="font-extrabold text-sm" style="color:#e11d48">🔴 À reconquérir — Top 5 priorités <span class="text-[10px] font-normal t-disabled ml-1">cette semaine</span></h3><span class="acc-arrow t-disabled">▶</span></summary><div class="p-4"><div class="grid grid-cols-1 sm:grid-cols-2 gap-2">${cards}</div></div></details>`;
    })():'';

    const reconq=k.reconq;
    const reconqHtml=`<details id="clientsReconquete" class="mb-3 s-card rounded-xl border overflow-hidden"><summary class="flex items-center justify-between px-4 py-3 s-card-alt border-b cursor-pointer select-none hover:brightness-95"><h3 class="font-extrabold text-sm t-primary">🔄 À reconquérir <span class="text-[10px] font-normal t-disabled ml-1">${k.reconqTotal} anciens fidèles</span></h3><span class="acc-arrow t-disabled">▶</span></summary>${reconq.length?`<div class="p-4"><div class="grid grid-cols-1 sm:grid-cols-2 gap-2">${reconq.map(r=>`<div class="p-2.5 s-card rounded-lg border cursor-pointer hover:i-info-bg transition-colors" data-cc="${escapeHtml(r.cc)}" onclick="openClient360(this.dataset.cc,'clients')"><div class="flex items-center gap-2 flex-wrap"><span class="font-bold text-sm">${escapeHtml(r.nom)}</span><span class="text-[9px] px-1.5 py-0.5 rounded-full bg-cyan-900 text-cyan-300 font-bold">🔄 ${r.daysAgo}j</span></div><div class="flex gap-3 mt-1 text-[10px] t-tertiary"><span>${escapeHtml(r.metier||'—')}</span><span>CA <strong class="t-primary">${formatEuro(r.totalCA)}</strong></span><span>${r.nbFamilles} fam.</span><span class="c-action">${escapeHtml(r.commercial||'—')}</span></div></div>`).join('')}${k.reconqTotal>10?`<p class="text-[10px] t-disabled col-span-full mt-1">… et ${k.reconqTotal-10} autres</p>`:''}</div></div>`:`<div class="p-4 text-[12px] t-secondary">${_S.chalandiseReady?'Aucun ancien fidèle silencieux détecté.':'Chargez la zone de chalandise pour calculer la cohorte.'}</div>`}</details>`;

    const _livAllB=k.livSansPDV;
    const livSPDVHtml=(()=>{
      if(!_livAllB.length)return _S.livraisonsReady?`<details class="mb-3 s-card rounded-xl border overflow-hidden"><summary class="flex items-center justify-between px-4 py-3 s-card-alt border-b cursor-pointer select-none hover:brightness-95"><h3 class="font-extrabold text-sm t-primary">📦 Livrés sans PDV <span class="text-[10px] font-normal t-disabled ml-1">0 clients</span></h3><span class="acc-arrow t-disabled">▶</span></summary><div class="p-4 text-[12px] t-secondary">Tous les clients livrés ont déjà acheté au comptoir.</div></details>`:'';
      const _mkRow=r=>`<tr class="border-b b-light hover:s-hover cursor-pointer transition-colors" data-cc="${escapeHtml(r.cc)}" onclick="openClient360(this.dataset.cc,'clients')"><td class="py-1.5 px-2 font-bold text-[11px]">${escapeHtml(r.nom)}</td><td class="py-1.5 px-2 text-[11px] t-tertiary">${escapeHtml(r.metier||'—')}</td><td class="py-1.5 px-2 text-right font-bold c-action text-[11px]">${formatEuro(r.caLivraison)}</td><td class="py-1.5 px-2 text-right text-[11px] t-tertiary">${r.nbBL}</td><td class="py-1.5 px-2 text-[11px] c-action">${escapeHtml(r.commercial||'—')}</td></tr>`;
      const thStr=`<thead class="s-panel-inner t-inverse font-bold"><tr><th class="py-2 px-2 text-left">Nom client</th><th class="py-2 px-2 text-left">Métier</th><th class="py-2 px-2 text-right">CA livraison</th><th class="py-2 px-2 text-right">Nb BL</th><th class="py-2 px-2 text-left">Commercial</th></tr></thead>`;
      const top10=_livAllB.slice(0,10).map(_mkRow).join('');
      const moreHtml=_livAllB.length>10?`<details class="border-t b-default"><summary class="px-4 py-2 text-[11px] c-action cursor-pointer select-none hover:underline">Voir tous → (${_livAllB.length-10} de plus)</summary><div class="overflow-x-auto"><table class="min-w-full text-xs">${thStr}<tbody>${_livAllB.slice(10).map(_mkRow).join('')}</tbody></table></div></details>`:'';
      return`<details class="mb-3 s-card rounded-xl border overflow-hidden"><summary class="flex items-center justify-between px-4 py-3 s-card-alt border-b cursor-pointer select-none hover:brightness-95"><h3 class="font-extrabold text-sm t-primary">📦 Livrés sans PDV <span class="text-[10px] font-normal t-disabled ml-1">${_livAllB.length} clients</span></h3><span class="acc-arrow t-disabled">▶</span></summary><div class="overflow-x-auto"><table class="min-w-full text-xs">${thStr}<tbody>${top10}</tbody></table></div>${moreHtml}</details>`;
    })();

    const oppsHtml = renderOppNetteTable();

    let topPDVHtml='';
    {const topRows=k.topPDVRows;
      const top=topRows.slice(0,20);
      if(top.length){
        const nowMs=Date.now();
        const rows=top.map(r=>{
          const daysSince=r.lastDate?Math.round((nowMs-r.lastDate)/86400000):null;
          const silence=daysSince!==null?`${daysSince}j`:'—';
          const silColor=daysSince===null?'t-disabled':daysSince<30?'c-ok':daysSince<90?'c-caution':'c-danger';
          const _dc=deltaColor(r.caHors,r.caPDV);
          return`<tr class="border-b b-light hover:s-hover cursor-pointer transition-colors" data-cc="${escapeHtml(r.cc)}" onclick="openClient360(this.dataset.cc,'clients')"><td class="py-1.5 px-2 font-bold text-[11px]">${escapeHtml(r.nom)}<span class="text-[9px] t-disabled font-normal ml-1">${escapeHtml(r.metier||'')}</span></td><td class="py-1.5 px-2 text-right font-bold c-action text-[11px]">${formatEuro(r.caPDV)}</td><td class="py-1.5 px-2 text-right text-[11px]">${formatEuro(r.caTotal)}</td><td class="py-1.5 px-2 text-right text-[10px] ${_dc}">${r.caHors>0?'+'+formatEuro(r.caHors):'—'}</td><td class="py-1.5 px-2 text-center text-[10px] ${silColor}">${silence}</td></tr>`;
        }).join('');
        const _nBelow100=_S.ventesClientArticle.size-topRows.length;
        const _pdvTip=`${topRows.length} clients avec CA PDV ≥ 100 €, sur ${_S.ventesClientArticle.size} clients MAGASIN totaux (${_nBelow100} exclus car CA PDV < 100 €). Source : consommé canal MAGASIN, agence sélectionnée uniquement. Aucun filtre actif appliqué ici.`;
        topPDVHtml=`<div id="clientsTopPDV" class="mb-5 s-card rounded-xl border overflow-hidden"><div class="flex items-center gap-2 px-4 py-3 s-card-alt border-b"><h3 class="font-extrabold text-sm t-primary">🏆 Top clients PDV <span class="text-[10px] font-normal t-disabled ml-1 cursor-help" title="${_pdvTip}">${topRows.length} clients · canal MAGASIN</span></h3></div><div class="overflow-x-auto"><table class="min-w-full text-xs"><thead class="s-panel-inner t-inverse font-bold"><tr><th class="py-2 px-2 text-left">Client</th><th class="py-2 px-2 text-right">CA PDV</th><th class="py-2 px-2 text-right">CA Total</th><th class="py-2 px-2 text-right">Delta hors</th><th class="py-2 px-2 text-center">Silence</th></tr></thead><tbody>${rows}</tbody></table></div></div>`;
      }
    }

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

    pane.innerHTML = `
      ${_renderCockpitKPIBand(ovStats)}
      ${_renderCockpitColumns(k)}
      ${_renderCockpitBottomGrid(k)}
      <div class="mt-6 border-t b-default pt-4">
        ${top5Html}
        ${top5ReconqHtml}
        ${reconqHtml}
        ${livSPDVHtml}
        ${oppsHtml}
        ${topPDVHtml}
        ${horsZoneHtml}
        ${digitauxHtml}
      </div>
    `;
  }


  // ── Sous-onglet Clients PDV (vue unique) ─────────────────────────────────
  function _switchClientsTab(){
    // Vue unique — pas de sous-onglets depuis Sprint 4
    const pane=document.getElementById('clientsPane-priorites');
    if(pane)pane.classList.remove('hidden');
  }
  window._switchClientsTab=_switchClientsTab;

// ── ESM exports ─────────────────────────────────────────────────────────
export {
  _renderHorsZone,
  _passesAllFilters,
  _syncPDVToggles,
  _renderTopClientsPDV,
  _computeTop5Reconq,
  computeTerritoireKPIs,
  computeClientsKPIs,
  renderTerritoireTab,
  renderCockpitEquation,
  renderCockpitRupClients,
  renderMesClients,
  _switchClientsTab,
};

// ── Window expositions ──────────────────────────────────────────────────
window.renderTerritoireTab = renderTerritoireTab;
window.renderMesClients = renderMesClients;
window.renderCockpitEquation = renderCockpitEquation;
window._renderTopClientsPDV = _renderTopClientsPDV;
window._renderHorsZone = _renderHorsZone;
window._setPDVCanalFilter = window._setPDVCanalFilter; // already set in territoire
window._setTerrClientsCanalFilter = window._setTerrClientsCanalFilter; // already set in omni
window.computeTerritoireKPIs = computeTerritoireKPIs;
window.computeClientsKPIs = computeClientsKPIs;
