'use strict';

import { formatEuro, famLib, famLabel, escapeHtml } from './utils.js';
import { _S } from './state.js';
import { DataStore } from './store.js';
import { _clientPassesFilters } from './engine.js';
import { closeArticlePanel } from './diagnostic.js';

// ── Helper: _passesAllFilters (delegates to _clientPassesFilters + local view/segment logic) ──
function _passesAllFilters(cc){
  const info=_S.chalandiseData?.get(cc);
  if(info){
    if(!_clientPassesFilters(info,cc))return false;
  }else{
    const _hasChalFilter=_S._selectedDepts?.size>0||_S._selectedClassifs?.size>0||_S._selectedStatuts?.size>0||_S._selectedActivitesPDV?.size>0||_S._selectedDirections?.size>0||_S._selectedUnivers?.size>0||_S._selectedCommercial||_S._selectedMetier||_S._filterStrategiqueOnly||_S._selectedStatutDetaille||(_S._distanceMaxKm>0&&_S._agenceCoords);
    if(_hasChalFilter)return false;
  }
  const view=_S._clientView||'tous';
  if(view==='potentiels'&&_S.chalandiseData?.has(cc))return false;
  if(view==='captes'&&!_S.chalandiseData?.has(cc))return false;
  if(view==='horszone'&&_S.chalandiseData?.has(cc))return false;
  if(view==='multicanaux'){let caHors=0,caMag=0;const h=_S.ventesClientHorsMagasin?.get(cc);const m2=_S.ventesClientArticle?.get(cc);if(h)for(const d of h.values())caHors+=d.sumCA||0;if(m2)for(const d of m2.values())caMag+=d.sumCA||0;if(caHors<=caMag)return false;}
  if(view==='dormants'){const lastDate=_S.clientLastOrder?.get(cc);const silence=lastDate?Math.round((Date.now()-lastDate)/86400000):999;if(silence<=180)return false;}
  if(_S._omniSegmentFilter){const seg=_S.clientOmniScore?.get(cc)?.segment;if(seg!==_S._omniSegmentFilter)return false;}
  return true;
}

  function renderCanalAgence(){
    const el=document.getElementById('canalAgenceBlock');if(!el)return;
    const wrapper=document.getElementById('terrCanalBlock');
    const CANAL_ORDER=['MAGASIN','REPRESENTANT','INTERNET','DCS','AUTRE'];
    const CANAL_LABELS={MAGASIN:'🏪 Magasin',INTERNET:'🌐 Web',DCS:'🏢 DCS',REPRESENTANT:'🤝 Représentant',AUTRE:'📦 Autre'};
    const CANAL_COLORS={MAGASIN:'#3b82f6',INTERNET:'#8b5cf6',DCS:'#f97316',REPRESENTANT:'#10b981',AUTRE:'#94a3b8'};
    const _webDisplayCA=v=>Math.max(0,(v.caP||0)+(v.caE||0));
    const _activeCanal=_S._globalCanal||'';
    // La répartition n'a de sens qu'en vue tous canaux — masquer quand filtre actif
    if(_activeCanal){if(wrapper)wrapper.classList.add('hidden');return;}
    // Filtrage client-aware : recalculer CA local si des filtres Commerce sont actifs
    const _filterActive=_S.chalandiseReady&&(_S._selectedDepts.size||_S._selectedClassifs.size||_S._selectedStatuts.size||_S._selectedActivitesPDV.size||_S._selectedDirections.size||_S._selectedUnivers.size||_S._selectedCommercial||_S._selectedMetier||_S._filterStrategiqueOnly||_S._selectedStatutDetaille||_S._omniSegmentFilter);
    let _canalData=_S.canalAgence;
    const _subtitleEl=document.getElementById('canalAgenceSubtitle');
    if(_filterActive){
      const _local={};let _nbF=0;
      for(const[cc,info] of _S.chalandiseData.entries()){
        if(!_clientPassesFilters(info,cc))continue;
        if(_S._omniSegmentFilter){const _seg=_S.clientOmniScore?.get(cc)?.segment;if(_seg!==_S._omniSegmentFilter)continue;}
        _nbF++;
        const _mag=_S.ventesClientArticle.get(cc);
        if(_mag){let _mCA=0,_mCAP=0;for(const d of _mag.values()){_mCA+=d.sumCA||0;_mCAP+=d.sumCAPrelevee||0;}if(_mCA>0){if(!_local.MAGASIN)_local.MAGASIN={ca:0,caP:0,caE:0,bl:0};_local.MAGASIN.ca+=_mCA;_local.MAGASIN.caP+=_mCAP;_local.MAGASIN.caE+=_mCA-_mCAP;}}
        const _hors=_S.ventesClientHorsMagasin.get(cc);
        if(_hors){for(const d of _hors.values()){const _c=d.canal||'AUTRE';const _ca=d.sumCA||0;if(_ca<=0)continue;if(!_local[_c])_local[_c]={ca:0,caP:0,caE:0,bl:0};_local[_c].ca+=_ca;_local[_c].caE+=_ca;}}
      }
      // Segment filter: also count clients NOT in chalandise but in clientOmniScore
      if(_S._omniSegmentFilter&&_S.clientOmniScore){for(const[cc,o]of _S.clientOmniScore){if(_S.chalandiseData.has(cc))continue;if(o.segment!==_S._omniSegmentFilter)continue;_nbF++;const _mag=_S.ventesClientArticle.get(cc);if(_mag){let _mCA=0,_mCAP=0;for(const d of _mag.values()){_mCA+=d.sumCA||0;_mCAP+=d.sumCAPrelevee||0;}if(_mCA>0){if(!_local.MAGASIN)_local.MAGASIN={ca:0,caP:0,caE:0,bl:0};_local.MAGASIN.ca+=_mCA;_local.MAGASIN.caP+=_mCAP;_local.MAGASIN.caE+=_mCA-_mCAP;}}const _hors2=_S.ventesClientHorsMagasin.get(cc);if(_hors2){for(const d of _hors2.values()){const _c=d.canal||'AUTRE';const _ca=d.sumCA||0;if(_ca<=0)continue;if(!_local[_c])_local[_c]={ca:0,caP:0,caE:0,bl:0};_local[_c].ca+=_ca;_local[_c].caE+=_ca;}}}}
      _canalData=_local;
      const _segLbl=_S._omniSegmentFilter?(SEG_LABELS[_S._omniSegmentFilter]||''):'';
      if(_subtitleEl)_subtitleEl.textContent=`Filtré sur ${_nbF.toLocaleString('fr-FR')} client${_nbF>1?'s':''}${_segLbl?' · '+_segLbl:''}`;
    }else{
      if(_subtitleEl)_subtitleEl.textContent='CA tous canaux · Magasin = Prélevé + Enlevé · Source : consommé';
    }
    const entries=CANAL_ORDER.map(c=>[c,_canalData[c]]).filter(([c,v])=>v&&(c!=='MAGASIN'?_webDisplayCA(v):(v.ca||0))>0);
    if(!entries.length){el.innerHTML='<p class="t-disabled text-sm p-4">Aucune donnée canal.</p>';if(wrapper)wrapper.classList.add('hidden');return;}
    if(wrapper)wrapper.classList.remove('hidden');
    const totalCA=entries.reduce((s,[c,v])=>s+(c!=='MAGASIN'?_webDisplayCA(v):(v.ca||0)),0)||1;
    let html='<div class="overflow-x-auto"><table class="min-w-full text-xs"><thead class="s-panel-inner t-inverse font-bold"><tr>';
    html+='<th class="py-2 px-3 text-left">Canal</th>';
    html+='<th class="py-2 px-3 text-right">Prélevé</th>';
    html+='<th class="py-2 px-3 text-right">Enlevé</th>';
    html+='<th class="py-2 px-3 text-right">Total CA</th>';
    html+='<th class="py-2 px-3 text-right">% du CA</th>';
    html+='<th class="py-2 px-3 text-center">Répartition</th>';
    html+='</tr></thead><tbody>';
    for(const[canal,data] of entries){
      const label=CANAL_LABELS[canal]||canal;
      const color=CANAL_COLORS[canal]||CANAL_COLORS.AUTRE;
      const isWeb=canal!=='MAGASIN';
      const isMag=canal==='MAGASIN';
      const dispCA=isWeb?_webDisplayCA(data):(data.ca||0);
      const pct=Math.round(dispCA/totalCA*100);
      const barW=Math.max(pct,2);
      const _caP=isWeb?0:Math.max(0,data.caP||0);const _caE=isWeb?Math.max(0,(data.caP||0)+(data.caE||0)):Math.max(0,data.caE||0);
      const prevCell=_caP>0?`<td class="py-2 px-3 text-right font-bold t-primary">${formatEuro(_caP)}</td>`:`<td class="py-2 px-3 text-right t-disabled">—</td>`;
      const enlevCell=_caE>0?`<td class="py-2 px-3 text-right t-secondary">${formatEuro(_caE)}</td>`:`<td class="py-2 px-3 text-right t-disabled">—</td>`;
      const _barTip=_caP>0?`Prélevé\u00a0: ${formatEuro(_caP)} · Enlevé\u00a0: ${formatEuro(_caE)}`:`Enlevé\u00a0: ${formatEuro(_caE)}`;
      let _barHtml;
      if(_caP>0){
        const _tot=Math.max(data.ca||0,_caP+_caE)||1;
        const _pW=(_caP/_tot*barW).toFixed(1);
        const _eW=(_caE/_tot*barW).toFixed(1);
        _barHtml=`<div class="w-32 s-hover rounded-full h-3 overflow-hidden" title="${_barTip}"><div style="display:flex;height:100%;width:${barW}%"><div style="flex:${_pW};background:${color};border-radius:9999px 0 0 9999px"></div>${parseFloat(_eW)>0?`<div style="flex:${_eW};background:${color};opacity:0.4;border-radius:0 9999px 9999px 0"></div>`:''}</div></div>`;
      }else{
        _barHtml=`<div class="w-32 s-hover rounded-full h-3 overflow-hidden" title="${_barTip}"><div style="width:${barW}%;background:${color};height:100%;border-radius:9999px"></div></div>`;
      }
      html+=`<tr class="border-b b-light cursor-pointer transition-colors hover:s-card-alt ${isMag?'font-semibold':''}" onclick="openCanalDrill('${canal}')" title="Voir le détail par famille">`;
      html+=`<td class="py-2 px-3 font-bold" style="color:${color}">${label}</td>`;
      html+=prevCell;
      html+=enlevCell;
      html+=`<td class="py-2 px-3 text-right font-extrabold" style="color:${color}">${formatEuro(dispCA)}</td>`;
      html+=`<td class="py-2 px-3 text-right font-bold t-secondary">${pct}%</td>`;
      html+=`<td class="py-2 px-3">${_barHtml}</td>`;
      html+='</tr>';
    }
    const totalP=entries.reduce((s,[c,v])=>s+(c!=='MAGASIN'?0:Math.max(0,v.caP||0)),0);
    const totalE=entries.reduce((s,[c,v])=>s+(c!=='MAGASIN'?Math.max(0,(v.caP||0)+(v.caE||0)):Math.max(0,v.caE||0)),0);
    html+=`<tr class="border-t-2 b-dark font-extrabold t-primary">`;
    html+=`<td class="py-2 px-3">TOTAL</td>`;
    html+=`<td class="py-2 px-3 text-right">${formatEuro(totalP)}</td>`;
    html+=`<td class="py-2 px-3 text-right">${formatEuro(totalE)}</td>`;
    html+=`<td class="py-2 px-3 text-right c-action">${formatEuro(totalCA)}</td>`;
    html+=`<td class="py-2 px-3 text-right">100%</td>`;
    html+=`<td></td></tr>`;
    html+='</tbody></table></div>';
    el.innerHTML=html;
  }

  let _canalDrillState={canal:null,famCode:null};

  function openCanalDrill(canal){
    const overlay=document.getElementById('articlePanelOverlay');
    const panel=document.getElementById('articlePanel');
    if(!overlay||!panel)return;
    _canalDrillState={canal,famCode:null};
    panel.style.maxWidth='560px';
    panel.innerHTML=_renderCanalDrill(canal);
    overlay.classList.add('active');
  }

  function openCanalDrillArticles(canal,famCode){
    const panel=document.getElementById('articlePanel');
    if(!panel)return;
    _canalDrillState={canal,famCode};
    panel.innerHTML=_renderCanalDrillArticles(canal,famCode);
  }

  function closeCanalDrill(){closeArticlePanel();}

  function _canalFamData(canal){
    // Returns {famCode:{ca,nbArt}} for the given canal, respecting filterFamille
    const filterFam=(document.getElementById('filterFamille')?.value||'').trim().toLowerCase();
    const famData={};
    const _matchFam=(r)=>{
      if(!filterFam)return true;
      const fc=(r.famille||'').toLowerCase();
      const fl=famLib(r.famille).toLowerCase();
      const flbl=famLabel(r.famille).toLowerCase();
      return fc.includes(filterFam)||fl.includes(filterFam)||flbl.includes(filterFam);
    };
    if(canal==='MAGASIN'){
      for(const r of DataStore.finalData){
        if(!r.famille||(r.caAnnuel||0)<=0)continue;
        if(!_matchFam(r))continue;
        if(!famData[r.famille])famData[r.famille]={ca:0,nbArt:0};
        famData[r.famille].ca+=r.caAnnuel||0;
        famData[r.famille].nbArt++;
      }
    }else if(canal==='INTERNET'||canal==='REPRESENTANT'||canal==='DCS'){
      if(!_S.chalandiseReady)return null; // data not available without chalandise
      const caField=canal==='INTERNET'?'caWeb':canal==='REPRESENTANT'?'caRep':'caDcs';
      for(const r of DataStore.finalData){
        if(!r.famille||(r[caField]||0)<=0)continue;
        if(!_matchFam(r))continue;
        if(!famData[r.famille])famData[r.famille]={ca:0,nbArt:0};
        famData[r.famille].ca+=r[caField]||0;
        famData[r.famille].nbArt++;
      }
    }else{
      // Canal sans caField pré-calculé (ex: AUTRE) — derive from articleCanalCA
      if(!_S.articleCanalCA.size)return null;
      for(const r of DataStore.finalData){
        if(!r.famille)continue;
        if(!_matchFam(r))continue;
        const ca=_S.articleCanalCA.get(r.code)?.get(canal)?.ca||0;
        if(ca<=0)continue;
        if(!famData[r.famille])famData[r.famille]={ca:0,nbArt:0};
        famData[r.famille].ca+=ca;
        famData[r.famille].nbArt++;
      }
    }
    return famData;
  }

  function _renderCanalDrill(canal){
    const CANAL_LABELS={MAGASIN:'🏪 Magasin',INTERNET:'🌐 Web',DCS:'🏢 DCS',REPRESENTANT:'🤝 Représentant',AUTRE:'📦 Autre'};
    const CANAL_COLORS={MAGASIN:'#3b82f6',INTERNET:'#8b5cf6',DCS:'#f97316',REPRESENTANT:'#10b981',AUTRE:'#94a3b8'};
    const label=CANAL_LABELS[canal]||canal;
    const color=CANAL_COLORS[canal]||'#94a3b8';
    const filterFamRaw=(document.getElementById('filterFamille')?.value||'').trim();
    const famData=_canalFamData(canal);
    const needsChalandise=(canal==='INTERNET'||canal==='REPRESENTANT'||canal==='DCS')&&!_S.chalandiseReady;
    const top10=famData?Object.entries(famData).sort((a,b)=>b[1].ca-a[1].ca).slice(0,10):[];
    const canalTotal=top10.reduce((s,[,d])=>s+d.ca,0)||1;
    const filterBadge=filterFamRaw?`<span class="text-[11px] px-2 py-0.5 rounded-full font-semibold" style="background:#7c3aed25;color:#a78bfa;border:1px solid #7c3aed40">Filtré : ${famLabel(filterFamRaw)}</span>`:'';
    let body='';
    if(needsChalandise){
      body=`<p class="text-xs t-inverse-muted py-4">Chargez la Zone de Chalandise pour le détail par famille sur ce canal.</p>`;
    }else if(!top10.length){
      body=`<p class="text-xs t-inverse-muted py-4">Aucune donnée famille pour ce canal${filterFamRaw?' avec ce filtre':''}.</p>`;
    }else{
      body=`<div class="overflow-x-auto mt-3"><table class="min-w-full text-xs"><thead><tr class="border-b" style="border-color:var(--b-darker)">`;
      body+=`<th class="py-1.5 px-3 text-left t-inverse-muted font-semibold">Famille</th>`;
      body+=`<th class="py-1.5 px-3 text-right t-inverse-muted font-semibold">CA</th>`;
      body+=`<th class="py-1.5 px-3 text-right t-inverse-muted font-semibold">% canal</th>`;
      body+=`<th class="py-1.5 px-3 text-right t-inverse-muted font-semibold">Nb art.</th>`;
      body+=`</tr></thead><tbody>`;
      for(const[fc,d] of top10){
        const pct=Math.round(d.ca/canalTotal*100);
        const barW=Math.max(pct,2);
        body+=`<tr class="border-b cursor-pointer transition-colors hover:s-card-alt" style="border-color:var(--b-darker)" onclick="openCanalDrillArticles('${canal}','${fc}')" title="Voir les articles">`;
        body+=`<td class="py-1.5 px-3 font-semibold t-inverse">${famLabel(fc)} <span class="t-disabled text-[10px]">›</span></td>`;
        body+=`<td class="py-1.5 px-3 text-right font-bold" style="color:${color}">${formatEuro(d.ca)}</td>`;
        body+=`<td class="py-1.5 px-3 text-right t-inverse-muted"><div class="flex items-center justify-end gap-1.5">${pct}%<div class="w-16 rounded-full h-1.5 overflow-hidden" style="background:var(--b-darker)"><div style="width:${barW}%;background:${color};height:100%;border-radius:9999px"></div></div></div></td>`;
        body+=`<td class="py-1.5 px-3 text-right t-inverse-muted">${d.nbArt}</td>`;
        body+=`</tr>`;
      }
      body+=`</tbody></table></div>`;
    }
    return `<div>
      <div class="flex items-center justify-between mb-4">
        <div>
          <h2 class="font-extrabold text-base text-white" style="color:${color}">Détail canal — ${label}</h2>
          ${filterBadge?`<div class="mt-1">${filterBadge}</div>`:''}
        </div>
        <div class="flex gap-2 items-center shrink-0 ml-3">
          ${(!needsChalandise&&top10.length)?`<button onclick="exportCanalDrillCSV('${canal}')" class="diag-btn" style="background:#1e3a8a30;color:#93c5fd;border:1px solid #1e40af50">📥 CSV</button>`:''}
          <button onclick="closeArticlePanel()" class="diag-btn" style="background:var(--s-panel-inner);color:var(--t-inverse-muted);border:1px solid var(--b-dark)">✕</button>
        </div>
      </div>
      ${body}
    </div>`;
  }

  function _canalArtData(canal,famCode){
    // Returns [{code,libelle,ca,freq}] for given canal+family, sorted by CA desc
    const caField=canal==='MAGASIN'?'caAnnuel':canal==='INTERNET'?'caWeb':canal==='REPRESENTANT'?'caRep':canal==='DCS'?'caDcs':null;
    if(!caField){
      // Canal sans caField pré-calculé (ex: AUTRE) — derive from articleCanalCA
      if(!_S.articleCanalCA.size)return[];
      const arts=[];
      for(const r of DataStore.finalData){
        if(r.famille!==famCode)continue;
        const ca=_S.articleCanalCA.get(r.code)?.get(canal)?.ca||0;
        if(ca<=0)continue;
        arts.push({code:r.code,libelle:_S.libelleLookup[r.code]||r.code,ca,freq:r.W||0});
      }
      return arts.sort((a,b)=>b.ca-a.ca);
    }
    if((canal==='INTERNET'||canal==='REPRESENTANT'||canal==='DCS')&&!_S.chalandiseReady)return[];
    const arts=[];
    for(const r of DataStore.finalData){
      if(r.famille!==famCode)continue;
      const ca=r[caField]||0;
      if(ca<=0)continue;
      arts.push({code:r.code,libelle:_S.libelleLookup[r.code]||r.code,ca,freq:r.W||0});
    }
    return arts.sort((a,b)=>b.ca-a.ca);
  }

  function _renderCanalDrillArticles(canal,famCode){
    const CANAL_LABELS={MAGASIN:'🏪 Magasin',INTERNET:'🌐 Web',DCS:'🏢 DCS',REPRESENTANT:'🤝 Représentant',AUTRE:'📦 Autre'};
    const CANAL_COLORS={MAGASIN:'#3b82f6',INTERNET:'#8b5cf6',DCS:'#f97316',REPRESENTANT:'#10b981',AUTRE:'#94a3b8'};
    const label=CANAL_LABELS[canal]||canal;
    const color=CANAL_COLORS[canal]||'#94a3b8';
    const famName=famLabel(famCode);
    const arts=_canalArtData(canal,famCode);
    const famTotal=arts.reduce((s,a)=>s+a.ca,0)||1;
    let body='';
    if(!arts.length){
      body=`<p class="text-xs t-inverse-muted py-4">Aucun article pour cette famille sur ce canal.</p>`;
    }else{
      body=`<div class="overflow-x-auto mt-3"><table class="min-w-full text-xs"><thead><tr class="border-b" style="border-color:var(--b-darker)">`;
      body+=`<th class="py-1.5 px-3 text-left t-inverse-muted font-semibold">Code</th>`;
      body+=`<th class="py-1.5 px-3 text-left t-inverse-muted font-semibold">Article</th>`;
      body+=`<th class="py-1.5 px-3 text-right t-inverse-muted font-semibold">CA</th>`;
      body+=`<th class="py-1.5 px-3 text-right t-inverse-muted font-semibold">Fréq.</th>`;
      body+=`<th class="py-1.5 px-3 text-right t-inverse-muted font-semibold">% famille</th>`;
      body+=`</tr></thead><tbody>`;
      for(const a of arts){
        const pct=Math.round(a.ca/famTotal*100);
        body+=`<tr class="border-b" style="border-color:var(--b-darker)">`;
        body+=`<td class="py-1.5 px-3 font-mono t-inverse-muted">${a.code}</td>`;
        body+=`<td class="py-1.5 px-3 t-inverse max-w-[180px] truncate" title="${escapeHtml(a.libelle)}">${escapeHtml(a.libelle)}</td>`;
        body+=`<td class="py-1.5 px-3 text-right font-bold" style="color:${color}">${formatEuro(a.ca)}</td>`;
        body+=`<td class="py-1.5 px-3 text-right t-inverse-muted">${a.freq}</td>`;
        body+=`<td class="py-1.5 px-3 text-right t-inverse-muted">${pct}%</td>`;
        body+=`</tr>`;
      }
      body+=`</tbody></table></div>`;
    }
    return `<div>
      <div class="flex items-center justify-between mb-4">
        <div class="flex items-center gap-2">
          <button onclick="openCanalDrill('${canal}')" class="diag-btn shrink-0" style="background:var(--s-panel-inner);color:var(--t-inverse-muted);border:1px solid var(--b-dark)" title="Retour aux familles">←</button>
          <div>
            <h2 class="font-extrabold text-base" style="color:${color}">Détail canal — ${label} › ${escapeHtml(famName)}</h2>
          </div>
        </div>
        <div class="flex gap-2 items-center shrink-0 ml-3">
          ${arts.length?`<button onclick="exportCanalDrillCSV('${canal}','${famCode}')" class="diag-btn" style="background:#1e3a8a30;color:#93c5fd;border:1px solid #1e40af50">📥 CSV</button>`:''}
          <button onclick="closeArticlePanel()" class="diag-btn" style="background:var(--s-panel-inner);color:var(--t-inverse-muted);border:1px solid var(--b-dark)">✕</button>
        </div>
      </div>
      ${body}
    </div>`;
  }

  function exportCanalDrillCSV(canal,famCode){
    const CANAL_LABELS={MAGASIN:'Magasin',INTERNET:'Web',DCS:'DCS',REPRESENTANT:'Representant',AUTRE:'Autre'};
    const canalName=CANAL_LABELS[canal]||canal;
    if(famCode){
      // Articles level
      const arts=_canalArtData(canal,famCode);
      if(!arts.length)return;
      const total=arts.reduce((s,a)=>s+a.ca,0)||1;
      let csv='Code;Article;CA;Fréq.;% famille\n';
      for(const a of arts){
        const p=Math.round(a.ca/total*100);
        csv+=`"${a.code}";"${a.libelle.replace(/"/g,'""')}";${a.ca.toFixed(2)};${a.freq};${p}%\n`;
      }
      const blob=new Blob(['\uFEFF'+csv],{type:'text/csv;charset=utf-8;'});
      const el=document.createElement('a');el.href=URL.createObjectURL(blob);
      el.download=`canal_${canalName}_${famCode}.csv`;el.click();
    }else{
      // Families level
      const famData=_canalFamData(canal);
      if(!famData)return;
      const rows=Object.entries(famData).sort((a,b)=>b[1].ca-a[1].ca);
      const total=rows.reduce((s,[,d])=>s+d.ca,0)||1;
      let csv='Famille;CA;% canal;Nb art.\n';
      for(const[fc,d] of rows){
        const p=Math.round(d.ca/total*100);
        csv+=`"${famLabel(fc)}";${d.ca.toFixed(2)};${p}%;${d.nbArt}\n`;
      }
      const filterFamRaw=(document.getElementById('filterFamille')?.value||'').trim();
      const suffix=filterFamRaw?`_fam_${filterFamRaw}`:'';
      const blob=new Blob(['\uFEFF'+csv],{type:'text/csv;charset=utf-8;'});
      const a=document.createElement('a');a.href=URL.createObjectURL(blob);
      a.download=`canal_${canalName}${suffix}.csv`;a.click();
    }
  }


  // Close secteur dropdown on outside click
  document.addEventListener('click',function(e){
    const dd=document.getElementById('terrSecteurDropdown');
    if(dd&&!dd.contains(e.target)){const panel=document.getElementById('terrSecteurPanel');if(panel)panel.classList.add('hidden');}
  });

  // A4: Fantômes de rayon — en stock mais que personne n'achète au comptoir
  function computePhantomArticles(){
    _S.phantomArticles=[];if(!_S.cockpitLists?.phantom)return;_S.cockpitLists.phantom.clear();
    if(!DataStore.finalData.length)return;
    // soldAtPDV = articles vendus en MAGASIN uniquement (ventesClientArticle = canal MAGASIN)
    // _S.articleClients agrège tous canaux — utiliser ventesClientArticle (filtré MAGASIN) à la place
    const soldAtPDV=new Set();
    for(const[,artMap]of DataStore.ventesClientArticle.entries()){for(const code of artMap.keys())soldAtPDV.add(code);}
    _S.phantomArticles=DataStore.finalData.filter(r=>r.stockActuel>0&&!r.isParent&&/^\d{6}$/.test(r.code)&&!soldAtPDV.has(r.code)).sort((a,b)=>(b.stockActuel*b.prixUnitaire)-(a.stockActuel*a.prixUnitaire));
    _S.phantomArticles.forEach(r=>_S.cockpitLists.phantom.add(r.code));
  }

  function _setTerrClientsCanalFilter(val){_S.terrClientsCanalFilter=val;window.renderTerritoireTab();}


  // ── Onglet Omnicanalité — canal, famille×canal, segments, analyse territoire ──
  function renderOmniTab(){
    renderCanalAgence();
    _renderSegmentsOmnicanaux();
    // Populate territory accordion content (Direction, Top 100, Contributeurs, etc.)
    // renderTerritoireTab also populates Commerce tab elements — harmless cross-tab render
    window.renderTerritoireTab();
    // Analyse territoire accordion visibility
    const hasTerr=_S.territoireReady&&_S.territoireLines.length>0;
    const hasChal=_S.chalandiseReady;
    const terrNeedBlock=document.getElementById('terrNeedTerrBlock');
    if(terrNeedBlock)terrNeedBlock.classList.toggle('hidden',hasTerr);
    // Show/hide territoire-dependent blocks inside accordion
    ['terrCroisementBlock','terrSpecialKPIBlock','terrKPIBlock','terrContribBlock','terrTop100Block','terrClientsBlock'].forEach(id=>{
      const el=document.getElementById(id);if(el){el.style.display=hasTerr?'':'none';el.classList.toggle('hidden',!hasTerr);}
    });
    // terrDirectionBlock : chalandise suffit (pas besoin du BL)
    const _dirBlkA=document.getElementById('terrDirectionBlock');
    if(_dirBlkA){_dirBlkA.style.display=hasChal?'':'none';_dirBlkA.classList.toggle('hidden',!hasChal);}
    const terrOverview=document.getElementById('terrChalandiseOverview');
    if(terrOverview)terrOverview.classList.toggle('hidden',!hasChal);
    const comBlock=document.getElementById('commercialSummaryBlock');
    if(comBlock)comBlock.classList.toggle('hidden',!hasTerr&&!hasChal);
  }

  // ── Couche de dérivation canal — Étape 3 ────────────────────────────────
  // Lit les structures existantes, zéro re-parsing, zéro modification de finalData.
  // Invariant : finalData (MIN/MAX, ABC/FMR, V) reste stable quelle que soit la valeur de canal.
  function getKPIsByCanal(canal) {
    const _c = canal && canal !== 'ALL' ? canal : null;
    const hasTerritoire = _S.territoireReady && _S.territoireLines.length > 0;
    const terrLines = _c ? DataStore.filteredTerritoireLines.filter(l => l.canal === _c) : DataStore.filteredTerritoireLines;
    return {
      canal: _c || 'ALL',
      // Stats canal depuis canalAgence (déjà agrégé au parsing, accès O(1))
      canalStats: _c ? (_S.canalAgence[_c] || { bl: 0, ca: 0, caP: 0, caE: 0 }) : _S.canalAgence,
      totalCA: Object.values(_S.canalAgence).reduce((s, v) => s + v.ca, 0),
      // Lignes territoire filtrées par canal (dérivées de territoireLines, source brute conservée)
      terrLines,
      // [F1 fix] En mode dégradé (pas de fichier territoire), articleFacts fournit les CA canal
      // depuis le consommé agence — source différente de territoireLines (agence ≠ omnicanal)
      articleFacts: !hasTerritoire ? _S.articleCanalCA : null,
      // finalData est un invariant canal — jamais recalculé au changement de filtre
      finalData: DataStore.finalData,
      // capabilities : permet aux consommateurs d'adapter leur rendu sans hardcoder des vérifications
      capabilities: {
        hasTerritoire,
        hasArticleFacts: _S.articleCanalCA.size > 0,
      },
    };
  }

  // ── Segments omnicanaux — affiché au-dessus de Familles à fort achat en ligne ──
  const SEG_LABELS={purComptoir:'Pur Comptoir',purHors:'Pur Hors-Magasin',hybride:'Hybride',full:'Full Omnicanal'};
  function _renderSegmentsOmnicanaux(){
    const el=document.getElementById('terrSegmentsOmni');
    if(!el)return;
    if(!_S.clientOmniScore?.size){el.innerHTML='';return;}
    // Count segments WITHOUT the segment filter itself (to show totals always)
    const savedSeg=_S._omniSegmentFilter;
    _S._omniSegmentFilter='';
    const segs={purComptoir:{n:0,ca:0},purHors:{n:0,ca:0},hybride:{n:0,ca:0},full:{n:0,ca:0}};
    for(const[cc,o]of _S.clientOmniScore){
      if(!_passesAllFilters(cc))continue;
      const s=segs[o.segment];if(s){s.n++;s.ca+=o.caTotal||0;}
    }
    _S._omniSegmentFilter=savedSeg;
    const total=Object.values(segs).reduce((s,v)=>s+v.n,0)||1;
    const pctPC=Math.round(segs.purComptoir.n/total*100),pctPH=Math.round(segs.purHors.n/total*100),pctHy=Math.round(segs.hybride.n/total*100),pctFu=Math.max(0,100-pctPC-pctPH-pctHy);
    const _totalTip=`${total} clients analysés — segmentés par nombre de canaux d'achat distincts (MAGASIN, INTERNET, REPRÉSENTANT, DCS…). Score = nb canaux.`;
    const panierMoyen=(s)=>s.n>0?formatEuro(s.ca/s.n):'—';
    const _segTips={
      'Pur Comptoir':`Uniquement MAGASIN (1 canal). ${segs.purComptoir.n} clients · panier moyen ${panierMoyen(segs.purComptoir)}.`,
      'Pur Hors-Magasin':`Jamais au comptoir — uniquement DCS, Internet, Représentant. ${segs.purHors.n} clients.`,
      'Hybride':`MAGASIN + 1 ou 2 autres canaux (2-3 canaux). ${segs.hybride.n} clients · panier moyen ${panierMoyen(segs.hybride)}.`,
      'Full Omnicanal':`4+ canaux distincts — client pleinement omnicanal. ${segs.full.n} clients · panier moyen ${panierMoyen(segs.full)}.`};
    const af=_S._omniSegmentFilter||'';
    const filterLabel=af?`<div class="mt-2 text-[10px]"><span class="cursor-pointer hover:underline" style="color:var(--c-action)" onclick="window._toggleOmniSegment('')">✕ Filtre actif : ${SEG_LABELS[af]||af}</span></div>`:'';
    const tiles=[
      ['purComptoir',segs.purComptoir,'Pur Comptoir','🏪','var(--c-ok)'],
      ['purHors',segs.purHors,'Pur Hors-Magasin','📦','var(--c-danger)'],
      ['hybride',segs.hybride,'Hybride','🔀','var(--c-info,#3b82f6)'],
      ['full',segs.full,'Full Omnicanal','⭐','var(--c-caution)']
    ];
    const tilesHtml=tiles.map(([segKey,s,label,icon,color])=>{
      if(!s.n)return'';
      const isActive=af===segKey;
      const pm=panierMoyen(s);
      return`<div class="flex flex-col items-center p-2 rounded-xl border cursor-pointer hover:brightness-95 transition-all ${isActive?'s-panel-inner':'s-card'}" style="${isActive?'box-shadow:0 0 0 2px '+color:''}" title="${_segTips[label]||''}" onclick="window._toggleOmniSegment('${segKey}')"><span class="text-base leading-none mb-1">${icon}</span><span class="text-[13px] font-extrabold ${isActive?'t-inverse':'t-primary'}">${s.n}</span><span class="text-[9px] ${isActive?'t-inverse-muted':'t-disabled'}">${label}</span><span class="text-[9px] font-bold mt-0.5" style="color:${color}">${formatEuro(s.ca)}</span><span class="text-[8px] ${isActive?'t-inverse-muted':'t-disabled'} mt-0.5">panier ${pm}</span></div>`;
    }).join('');
    el.innerHTML=`<div class="s-card rounded-xl border p-4"><h3 class="text-[11px] font-bold t-secondary uppercase tracking-wider mb-2">📡 Segments omnicanaux <span class="font-normal normal-case t-disabled cursor-help" title="${_totalTip}">${total} clients</span><span class="text-[10px] font-normal t-disabled ml-2">· ${_S._globalPeriodePreset||'période sélectionnée'}</span></h3><div class="grid grid-cols-4 gap-2 mb-2">${tilesHtml}</div><div class="flex h-1.5 rounded-full overflow-hidden"><div style="width:${pctPC}%;background:var(--c-ok)"></div><div style="width:${pctPH}%;background:var(--c-danger);opacity:0.6"></div><div style="width:${pctHy}%;background:var(--c-info,#3b82f6)"></div><div style="width:${pctFu}%;background:var(--c-caution)"></div></div>${filterLabel}</div>`;
  }

  // ── Sous-vue Omni — rendu dans cm-tab-content ────────────────────────────
  function renderOmniContent() {
    const el = document.getElementById('cm-tab-content');
    if (!el) return;
    el.innerHTML = `<div>
    <div id="terrSummaryBar" class="s-card rounded-xl border shadow-sm px-4 py-3 mb-3" style="position:sticky;top:0;z-index:10;background:var(--s-card,#fff);display:none"></div>
    <div id="terrCanalBlock" class="s-card rounded-xl shadow-md border mb-3">
      <div class="flex items-center justify-between px-4 py-3 border-b s-card-alt">
        <div>
          <h3 class="font-extrabold t-primary text-sm">📡 Répartition par canal</h3>
          <p id="canalAgenceSubtitle" class="text-[10px] t-disabled mt-0.5">CA tous canaux · Magasin = Prélevé + Enlevé · Source : consommé</p>
        </div>
      </div>
      <div id="canalAgenceBlock" class="p-3"></div>
    </div>
    <div id="terrSegmentsOmni" class="mb-3"></div>
    <div id="terrChalandiseOverview" class="hidden mb-3">
      <details class="s-card rounded-xl shadow-md border overflow-hidden">
        <summary class="px-2 py-1.5 border-b s-card-alt select-none flex items-center justify-between cursor-pointer hover:brightness-95">
          <h3 class="font-extrabold t-primary text-xs">🎯 Votre territoire en un coup d'oeil</h3>
          <div class="flex items-center gap-2">
            <span id="terrOverviewSummaryLine" class="text-[10px] t-tertiary font-normal"></span>
            <span class="acc-arrow t-disabled">▶</span>
          </div>
        </summary>
        <div class="overflow-x-auto">
          <table class="min-w-full text-xs">
            <thead id="terrOverviewL1Head" class="s-panel-inner t-inverse"></thead>
            <tbody id="terrOverviewL1Table"></tbody>
          </table>
        </div>
      </details>
    </div>
    <div id="commercialSummaryBlock" class="hidden"></div>
    <details id="terrAnalyseAccordion" open class="s-card rounded-xl shadow-md border mb-3">
      <summary class="px-4 py-2 s-card-alt border-b select-none flex items-center justify-between hover:s-hover cursor-pointer">
        <div class="flex items-center gap-2">
          <h3 class="font-extrabold t-primary text-sm">📋 Analyse territoire</h3>
          <span class="text-[10px] t-disabled">Vue Direction · Top 100 · Contributeurs · nécessite le BL Territoire</span>
        </div>
        <span class="acc-arrow t-tertiary">▶</span>
      </summary>
      <div id="terrNeedTerrBlock" class="hidden mb-2 mt-2 mx-2 p-2.5 i-info-bg border-2 border-dashed border-violet-300 rounded-xl flex items-center gap-2">
        <span class="text-lg flex-shrink-0">📊</span>
        <div><p class="text-violet-700 font-semibold text-xs">Analyse avancée Le Terrain — fichier BL requis</p><p class="text-violet-500 text-[10px] mt-0.5">Ajoutez le fichier BL Qlik pour activer : KPI CA Le Terrain · Vue par Direction · Top 100 articles · Contributeurs agence</p></div>
      </div>
      <div id="terrCroisementBlock" style="display:none" class="hidden mb-2 mt-2 mx-2">
        <div id="terrCroisementSummary" class="exec-summary rounded-xl p-3 t-inverse">
          <div class="flex items-center gap-2 mb-1"><span class="text-sm">🔗</span><h3 class="font-extrabold text-xs uppercase tracking-wide text-violet-300">Analyse du croisement territoire × agence</h3></div>
          <div id="terrCroisementText" class="text-xs leading-snug space-y-0.5"></div>
        </div>
      </div>
      <div id="terrKPIBlock" style="display:none" class="hidden mb-2 mt-2 mx-2">
        <div class="grid grid-cols-2 lg:grid-cols-5 gap-1.5">
          <div class="bg-gradient-to-br from-violet-500 to-violet-700 rounded-xl p-2.5 text-white shadow-lg"><h4 class="text-violet-100 text-[10px] font-bold uppercase mb-0.5">📋 Lignes analysées</h4><p id="terrKpiLignes" class="text-base font-extrabold leading-tight">—</p><p id="terrKpiLignesSub" class="text-violet-200 text-[10px] mt-0.5"></p></div>
          <div class="bg-gradient-to-br from-indigo-500 to-indigo-700 rounded-xl p-2.5 text-white shadow-lg"><h4 class="text-indigo-100 text-[10px] font-bold uppercase mb-0.5">💰 CA Legallais (zone)</h4><p id="terrKpiCATotal" class="text-base font-extrabold leading-tight">—</p><p id="terrKpiCATotalSub" class="text-indigo-200 text-[10px] mt-0.5 font-bold"></p></div>
          <div class="bg-gradient-to-br from-emerald-500 to-emerald-700 rounded-xl p-2.5 text-white shadow-lg"><h4 class="text-emerald-100 text-[10px] font-bold uppercase mb-0.5">📊 Couverture rayon</h4><p id="terrKpiCouverture" class="text-base font-extrabold leading-tight">—</p><p id="terrKpiCouvertureSub" class="text-emerald-200 text-[10px] mt-0.5">du Top 100 en stock</p><p id="terrKpiCouvertureInfo" class="hidden text-emerald-200 text-[9px] mt-0.5">ℹ️ stock physique indépendant du canal</p></div>
          <div class="bg-gradient-to-br from-amber-500 to-amber-700 rounded-xl p-2.5 text-white shadow-lg"><h4 class="text-amber-100 text-[10px] font-bold uppercase mb-0.5">📌 Spécial</h4><p id="terrKpiSpecialPct" class="text-base font-extrabold leading-tight">—</p><p id="terrKpiSpecialSub" class="text-amber-200 text-[10px] mt-0.5">du CA = non stockable</p></div>
          <div class="bg-gradient-to-br from-rose-500 to-rose-700 rounded-xl p-2.5 text-white shadow-lg"><h4 class="text-rose-100 text-[10px] font-bold uppercase mb-0.5">👥 Clients</h4><p id="terrKpiClients" class="text-base font-extrabold leading-tight">—</p><p id="terrKpiClientsSub" class="text-rose-200 text-[10px] mt-0.5"></p></div>
        </div>
      </div>
      <div id="terrSpecialKPIBlock" style="display:none" class="hidden mb-1.5 mx-2 px-2 py-1.5 i-caution-bg border b-light rounded-xl flex items-center gap-2">
        <span class="text-base flex-shrink-0">📌</span>
        <div><p id="terrSpecialKPIText" class="text-xs font-bold c-caution inline"></p><span class="text-[10px] c-caution ml-1">Exclus de Direction, Top 100, croisement rayon.</span></div>
      </div>
      <div id="terrDirectionBlock" style="display:none" class="hidden mb-1.5 mx-2 s-card rounded-xl shadow-md border overflow-hidden">
        <details>
          <summary class="flex items-center justify-between px-3 py-2 s-card-alt border-b cursor-pointer select-none hover:brightness-95">
            <h3 class="font-extrabold t-primary text-xs flex items-center gap-2">📋 Vue par Direction commerciale <span class="text-[10px] font-normal t-disabled">— trié par CA décroissant · cliquez pour détailler</span></h3>
            <span class="acc-arrow t-disabled">▶</span>
          </summary>
          <div class="overflow-x-auto">
            <table class="min-w-full text-xs">
              <thead class="s-panel-inner t-inverse">
                <tr>
                  <th class="py-1.5 px-2 text-left">Direction</th>
                  <th class="py-1.5 px-2 text-right">CA Le Terrain</th>
                  <th class="py-1.5 px-2 text-center">Nb articles</th>
                  <th class="py-1.5 px-2 text-center">✅ En rayon</th>
                  <th class="py-1.5 px-2 text-center">⚠️ Rupture</th>
                  <th class="py-1.5 px-2 text-center">❌ Absent</th>
                  <th class="py-1.5 px-2 text-center min-w-[110px]">% couverture</th>
                </tr>
              </thead>
              <tbody id="terrDirectionTable"></tbody>
            </table>
          </div>
        </details>
      </div>
      <div id="terrContribBlock" style="display:none" class="hidden mb-1.5 mx-2 s-card rounded-xl shadow-md border overflow-hidden">
        <details>
          <summary class="flex items-center justify-between px-3 py-2 s-card-alt border-b cursor-pointer select-none hover:brightness-95">
            <h3 id="terrContribTitle" class="font-extrabold t-primary text-xs flex items-center gap-2">🔗 Contributeurs agence</h3>
            <div class="flex items-center gap-2">
              <button onclick="event.stopPropagation();exportContribCSV()" class="bg-green-600 hover:bg-green-700 text-white font-bold py-1 px-2 rounded-lg text-xs">📥 CSV</button>
              <span class="acc-arrow t-disabled">▶</span>
            </div>
          </summary>
          <div id="terrContribSummary" class="px-3 py-1.5 text-xs t-tertiary border-b s-card-alt"></div>
          <div class="overflow-x-auto">
            <table class="min-w-full text-xs">
              <thead class="s-panel-inner t-inverse font-bold">
                <tr>
                  <th class="py-1.5 px-2 text-left">Secteur</th>
                  <th class="py-1.5 px-2 text-right">BL Terrain</th>
                  <th class="py-1.5 px-2 text-right">BL Agence</th>
                  <th class="py-1.5 px-2 text-right">CA Terrain</th>
                  <th class="py-1.5 px-2 text-center">Clients</th>
                  <th class="py-1.5 px-2 text-center min-w-[100px]">% BL capté</th>
                </tr>
              </thead>
              <tbody id="terrContribTable"></tbody>
            </table>
          </div>
        </details>
      </div>
      <div id="terrTop100Block" style="display:none" class="hidden mb-1.5 mx-2 s-card rounded-xl shadow-md border overflow-hidden">
        <details>
          <summary class="flex items-center justify-between px-3 py-2 s-card-alt border-b cursor-pointer select-none hover:brightness-95">
            <h3 class="font-extrabold t-primary text-xs flex items-center gap-2">🏆 Top 100 articles <span class="text-[10px] font-normal t-disabled">— par CA Le Terrain · cliquez pour détailler</span></h3>
            <div class="flex items-center gap-2">
              <button onclick="event.stopPropagation();exportTerritoireCSV()" class="bg-green-600 hover:bg-green-700 text-white font-bold py-1 px-2 rounded-lg text-xs">📥 CSV</button>
              <span class="acc-arrow t-disabled">▶</span>
            </div>
          </summary>
          <div class="overflow-x-auto">
            <table class="min-w-full text-xs">
              <thead class="s-panel-inner t-inverse font-bold">
                <tr>
                  <th class="py-1.5 px-2 text-left">Code</th>
                  <th class="py-1.5 px-2 text-left">Libellé</th>
                  <th class="py-1.5 px-2 text-left">Direction</th>
                  <th class="py-1.5 px-2 text-center">Nb BL</th>
                  <th class="py-1.5 px-2 text-right">CA Le Terrain</th>
                  <th class="py-1.5 px-2 text-center">En rayon</th>
                  <th class="py-1.5 px-2 text-right">Stock actuel</th>
                </tr>
              </thead>
              <tbody id="terrTop100Table"></tbody>
            </table>
          </div>
        </details>
      </div>
      <div id="terrClientsBlock" style="display:none" class="hidden mb-1.5 mx-2 s-card rounded-xl shadow-md border overflow-hidden">
        <details>
          <summary class="flex items-center justify-between px-3 py-2 s-card-alt border-b cursor-pointer select-none hover:brightness-95">
            <h3 class="font-extrabold t-primary text-xs flex items-center gap-2">👥 Clients Le Terrain <span class="text-[10px] font-normal t-disabled">— mixtes vs extérieurs purs</span></h3>
            <span class="acc-arrow t-disabled">▶</span>
          </summary>
          <div class="overflow-x-auto">
            <table class="min-w-full text-xs">
              <thead class="s-panel-inner t-inverse font-bold">
                <tr>
                  <th class="py-1.5 px-2 text-left">Code client</th>
                  <th class="py-1.5 px-2 text-left">Nom</th>
                  <th class="py-1.5 px-2 text-right">CA Le Terrain</th>
                  <th class="py-1.5 px-2 text-center">Nb réf.</th>
                  <th class="py-1.5 px-2 text-center">Type</th>
                </tr>
              </thead>
              <tbody id="terrClientsTable"></tbody>
            </table>
          </div>
        </details>
      </div>
    </details>
  </div>`;
    renderCanalAgence();
    _renderSegmentsOmnicanaux();
    window._buildChalandiseOverview?.();
    window._renderCommercialSummary?.();
    window.renderTerritoireTab?.();
    const hasTerr = _S.territoireReady && _S.territoireLines.length > 0;
    const terrNeedBlock = document.getElementById('terrNeedTerrBlock');
    if (terrNeedBlock) terrNeedBlock.classList.toggle('hidden', hasTerr);
    ['terrCroisementBlock','terrSpecialKPIBlock','terrKPIBlock','terrContribBlock','terrTop100Block','terrClientsBlock'].forEach(id => {
      const blk = document.getElementById(id);
      if (blk) { blk.style.display = hasTerr ? '' : 'none'; blk.classList.toggle('hidden', !hasTerr); }
    });
    // terrDirectionBlock : chalandise suffit (pas besoin du BL)
    const _dirBlkB=document.getElementById('terrDirectionBlock');
    if(_dirBlkB){_dirBlkB.style.display=hasChal?'':'none';_dirBlkB.classList.toggle('hidden',!hasChal);}
    // Ouvrir l'accordéon territoire (terrKPIBlock visible sans clic)
    document.getElementById('terrAnalyseAccordion')?.setAttribute('open', '');
  }

// ── Window expositions for onclick handlers ──
window.renderOmniTab     = renderOmniTab;
window.renderOmniContent = renderOmniContent;
window.renderCanalAgence = renderCanalAgence;
window.openCanalDrill = openCanalDrill;
window.openCanalDrillArticles = openCanalDrillArticles;
window.closeCanalDrill = closeCanalDrill;
window.exportCanalDrillCSV = exportCanalDrillCSV;
window.getKPIsByCanal = getKPIsByCanal;
window.computePhantomArticles = computePhantomArticles;
window._setTerrClientsCanalFilter = _setTerrClientsCanalFilter;
window.SEG_LABELS = SEG_LABELS;

// ── ESM exports ──
export {
  renderCanalAgence,
  openCanalDrill,
  openCanalDrillArticles,
  closeCanalDrill,
  exportCanalDrillCSV,
  getKPIsByCanal,
  computePhantomArticles,
  _setTerrClientsCanalFilter,
  renderOmniTab,
  renderOmniContent,
  SEG_LABELS,
};
