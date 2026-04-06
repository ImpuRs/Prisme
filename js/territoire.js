'use strict';

import { _S } from './state.js';
import { DataStore } from './store.js';
import { formatEuro, famLib, escapeHtml, fmtDate, matchQuery, getSecteurDirection, buildPctBar } from './utils.js';
import { _clientStatusBadge, _unikLink } from './engine.js';
import { showToast } from './ui.js';
import { getSelectedSecteurs } from './parser.js';

function _renderGhostArticles() {
  const el = document.getElementById('ghostArticlesBlock');
  if (!el) return;
  const fd = DataStore.finalData;
  if (!fd.length) { el.innerHTML = ''; return; }

  const ghosts = fd.filter(r => !r.abcClass && !r.fmrClass);
  if (!ghosts.length) { el.innerHTML = ''; return; }

  const total = fd.length;
  const nbGhosts = ghosts.length;
  const pctGhosts = Math.round(nbGhosts / total * 100);

  let age0_90 = 0, age90_365 = 0, age365plus = 0;
  let val0_90 = 0, val90_365 = 0, val365plus = 0;
  let stockPositif = 0, valeurTotale = 0;

  const statuts = {};
  const famCount = {};

  for (const r of ghosts) {
    const val = (r.stockActuel || 0) * (r.prixUnitaire || 0);
    if ((r.stockActuel || 0) > 0) { stockPositif++; valeurTotale += val; }
    const age = r.ageJours || 0;
    if (age <= 90) { age0_90++; val0_90 += val; }
    else if (age <= 365) { age90_365++; val90_365 += val; }
    else { age365plus++; val365plus += val; }
    const st = r.statut || 'Inconnu';
    statuts[st] = (statuts[st] || 0) + 1;
    const fam = famLib(r.famille) || 'Non classé';
    if (!famCount[fam]) famCount[fam] = { n: 0, val: 0 };
    famCount[fam].n++;
    famCount[fam].val += val;
  }

  const topFam = Object.entries(famCount).sort((a, b) => b[1].n - a[1].n).slice(0, 10);

  const ageTiles = [
    { label: '< 90 jours', sublabel: 'Nouveautés sans vente', n: age0_90, val: val0_90, color: 'var(--c-ok)', bg: '#dcfce7', ageKey: 'fresh' },
    { label: '90j — 1 an', sublabel: 'En voie de dormance', n: age90_365, val: val90_365, color: 'var(--c-caution)', bg: '#fef9c3', ageKey: '' },
    { label: '> 1 an', sublabel: 'Dormants confirmés', n: age365plus, val: val365plus, color: 'var(--c-danger)', bg: '#fee2e2', ageKey: 'critical' },
  ];

  const tilesHtml = ageTiles.map(t => {
    const ageJs = t.ageKey ? `document.getElementById('filterAge').value='${t.ageKey}';updateActiveAgeIndicator();` : '';
    return `
    <div class="flex-1 p-3 rounded-xl border text-center cursor-pointer hover:brightness-95 transition-all" style="background:${t.bg}"
      onclick="showCockpitInTable('phantom');${ageJs}_S.currentPage=0;renderTable(false);" title="→ Filtrer les articles fantômes ${t.label}">
      <div class="text-2xl font-extrabold" style="color:${t.color}">${t.n.toLocaleString('fr-FR')}</div>
      <div class="text-[10px] font-bold" style="color:${t.color}">${t.label}</div>
      <div class="text-[9px] t-disabled mt-1">${t.sublabel}</div>
      <div class="text-[10px] font-bold mt-1 t-primary">${formatEuro(t.val)}</div>
    </div>`;
  }).join('');

  const famHtml = topFam.map(([fam, d]) => {
    const safeFam = fam.replace(/'/g, "\\'").replace(/"/g, '&quot;');
    return `
    <tr class="border-b b-light hover:s-hover text-[11px] cursor-pointer" onclick="document.getElementById('filterFamille').value='${safeFam}';showCockpitInTable('phantom');" title="→ Filtrer fantômes ${escapeHtml(fam)}">
      <td class="py-1.5 px-2 font-semibold">${escapeHtml(fam)}</td>
      <td class="py-1.5 px-2 text-right font-bold">${d.n}</td>
      <td class="py-1.5 px-2 text-right">${formatEuro(d.val)}</td>
    </tr>`;
  }).join('');

  const statutsHtml = Object.entries(statuts)
    .sort((a, b) => b[1] - a[1])
    .map(([st, n]) => `<span class="text-[9px] px-2 py-0.5 rounded-full border b-light">${escapeHtml(st)} (${n})</span>`)
    .join(' ');

  const infoTip = `${nbGhosts} articles en stock sans aucune vente sur la période de calcul (W=0). Ils n'apparaissent pas dans la matrice ABC/FMR. ${stockPositif} ont du stock physique pour ${formatEuro(valeurTotale)} immobilisés.`;

  // Update inline summary
  const _ghostInline = document.getElementById('ghostCountInline');
  if (_ghostInline) _ghostInline.textContent = `${nbGhosts.toLocaleString('fr-FR')} articles · ${formatEuro(valeurTotale)}`;

  el.innerHTML = `
    <div class="flex gap-3 mb-4">${tilesHtml}</div>
    <div class="flex flex-wrap gap-1 mb-4">${statutsHtml}</div>
    <details class="border rounded-lg overflow-hidden">
      <summary class="px-3 py-2 text-[11px] font-bold t-primary cursor-pointer select-none hover:s-hover">
        📊 Top 10 familles fantomes
      </summary>
      <table class="min-w-full">
        <thead class="s-panel-inner t-inverse text-[10px]">
          <tr><th class="py-1.5 px-2 text-left">Famille</th><th class="py-1.5 px-2 text-right">Articles</th><th class="py-1.5 px-2 text-right">Valeur stock</th></tr>
        </thead>
        <tbody>${famHtml}</tbody>
      </table>
    </details>
  `;
}

// Toggle direction row — shows famille breakdown (lazy)
function toggleTerrDir(rowId,encDir){
  const row=document.getElementById(rowId);if(!row)return;
  const inner=document.getElementById(rowId+'-inner');
  const isOpen=row.style.display!=='none';
  if(isOpen&&inner&&inner.dataset.mode==='familles'){row.style.display='none';row.previousElementSibling.classList.remove('expanded');return;}
  row.style.display='table-row';row.previousElementSibling.classList.add('expanded');
  renderTerrDirFamilles(rowId,decodeURIComponent(encDir));
}

// Render famille breakdown for a direction (lazy, called by toggleTerrDir)
function renderTerrDirFamilles(rowId,direction){
  const inner=document.getElementById(rowId+'-inner');if(!inner)return;
  const q=(document.getElementById('terrSearch')||{}).value||'';
  const selectedSecteurs=getSelectedSecteurs();
  const {activeFilters:{canal:_cg,commercial:_com}}=DataStore.byContext(); // [V3.2]
  const _comSet=_com?(_S.clientsByCommercial.get(_com)||new Set()):null;
  const familles={};
  for(const l of DataStore.filteredTerritoireLines){
    if(_cg&&l.canal!==_cg)continue;
    if(_comSet&&(!l.clientCode||!_comSet.has(l.clientCode)))continue;
    if(l.isSpecial)continue;
    if(l.direction!==direction)continue;
    if(selectedSecteurs&&l.secteur&&!selectedSecteurs.has(l.secteur))continue;
    if(q&&!matchQuery(q,l.code,l.libelle,l.direction))continue;
    const famKey=l.famille||'';
    if(!familles[famKey])familles[famKey]={caTotal:0,nb:new Set()};
    familles[famKey].caTotal+=l.ca;familles[famKey].nb.add(l.code);
  }
  const dirEnc=encodeURIComponent(direction);
  let html=`<table class="min-w-full text-[10px]"><thead class="i-info-bg c-action"><tr><th class="py-1.5 px-4 text-left">Famille</th><th class="py-1.5 px-3 text-center">Nb art.</th><th class="py-1.5 px-3 text-right">CA Le Terrain</th></tr></thead><tbody>`;
  Object.entries(familles).sort((a,b)=>b[1].caTotal-a[1].caTotal).forEach(([fam,fd])=>{
    const famLabel=fam?fam:'❓ Non référencé en agence';
    const famRowId='terr-fam-'+direction.replace(/\W/g,'_')+'-'+fam.replace(/\W/g,'_')+'_f';
    html+=`<tr class="terr-fam-row border-t border-blue-200" onclick="toggleTerrFam('${famRowId}','${dirEnc}','${encodeURIComponent(fam)}')">`+
      `<td class="py-1.5 px-4">${famLabel} <span class="t-disabled text-[9px]">▼</span></td>`+
      `<td class="py-1.5 px-3 text-center">${fd.nb.size}</td>`+
      `<td class="py-1.5 px-3 text-right">${formatEuro(fd.caTotal)}</td></tr>`+
      `<tr id="${famRowId}" style="display:none"><td colspan="3" class="p-0 s-card-alt"><div id="${famRowId}-inner" class="p-3 text-xs t-disabled">Chargement…</div></td></tr>`;
  });
  html+=`</tbody></table>`;
  inner.innerHTML=html;inner.dataset.mode='familles';
}

// Toggle status-filtered article view for a direction (✅/⚠️/❌ badge click)
function toggleTerrDirStatus(rowId,encDir,status){
  const row=document.getElementById(rowId);if(!row)return;
  const inner=document.getElementById(rowId+'-inner');
  const isOpen=row.style.display!=='none';
  if(isOpen&&inner&&inner.dataset.mode===status){row.style.display='none';row.previousElementSibling.classList.remove('expanded');return;}
  row.style.display='table-row';row.previousElementSibling.classList.add('expanded');
  renderTerrDirStatusArticles(rowId,decodeURIComponent(encDir),status);
}

// Render filtered article list for a direction + rayonStatus
function renderTerrDirStatusArticles(rowId,direction,status){
  const inner=document.getElementById(rowId+'-inner');if(!inner)return;
  const stockMap=new Map(DataStore.finalData.map(r=>[r.code,r]));
  const isStd=code=>/^\d{6}$/.test(code);
  const {activeFilters:{canal:_cg,commercial:_com}}=DataStore.byContext(); // [V3.2]
  const _comSet=_com?(_S.clientsByCommercial.get(_com)||new Set()):null;
  const artMap={};
  for(const l of DataStore.filteredTerritoireLines){
    if(_cg&&l.canal!==_cg)continue;
    if(_comSet&&(!l.clientCode||!_comSet.has(l.clientCode)))continue;
    if(l.isSpecial)continue;
    if(l.direction!==direction||l.rayonStatus!==status)continue;
    if(!artMap[l.code])artMap[l.code]={code:l.code,libelle:l.libelle,famille:l.famille||'',ca:0};
    artMap[l.code].ca+=l.ca;
  }
  const arts=Object.values(artMap).sort((a,b)=>b.ca-a.ca);
  const statusLabel=status==='green'?'✅ En rayon':status==='yellow'?'⚠️ Rupture':'❌ Absent';
  const hdrCls=status==='green'?'i-ok-bg c-ok':status==='yellow'?'i-caution-bg c-caution':'i-danger-bg c-danger';
  const LIMIT=50;
  let html=`<div class="font-semibold t-primary mb-2 text-[11px] px-3 pt-3">${statusLabel} — ${arts.length} article${arts.length>1?'s':''} dans <em>${direction}</em></div>`;
  if(!arts.length){inner.innerHTML=html+'<p class="t-disabled text-[11px] px-3 pb-3">Aucun article.</p>';inner.dataset.mode=status;return;}
  html+=`<table class="min-w-full text-[11px]"><thead class="${hdrCls}"><tr><th class="py-1.5 px-3 text-left">Code</th><th class="py-1.5 px-3 text-left">Libellé</th><th class="py-1.5 px-3 text-left">Famille</th><th class="py-1.5 px-3 text-right">CA Legallais</th><th class="py-1.5 px-3 text-right">Stock</th></tr></thead><tbody id="${rowId}-statusbody">`;
  html+=_buildTerrDirStatusRows(arts.slice(0,LIMIT),stockMap,isStd);
  html+=`</tbody></table>`;
  if(arts.length>LIMIT)html+=`<button class="mt-2 mb-2 ml-2 text-xs font-bold hover:underline t-secondary" onclick="_loadMoreTerrDirStatus(this,'${rowId}',${LIMIT},'${encodeURIComponent(direction)}','${status}')">▼ Voir plus (${arts.length-LIMIT} restants…)</button>`;
  inner.innerHTML=html;inner.dataset.mode=status;
}
function _buildTerrDirStatusRows(arts,stockMap,isStd){
  let html='';
  for(const a of arts){
    const si=stockMap.get(a.code),st=si?si.stockActuel:'—';
    const speTag=!isStd(a.code)?'<span class="ml-1 text-[9px] s-hover t-tertiary font-bold px-1 rounded">SPÉ</span>':'';
    html+=`<tr class="border-t b-light"><td class="py-1 px-3 font-mono text-[10px]">${a.code}${speTag}</td><td class="py-1 px-3 max-w-[180px] truncate">${a.libelle}</td><td class="py-1 px-3 t-tertiary text-[10px]">${famLib(a.famille)||'❓'}</td><td class="py-1 px-3 text-right font-bold">${formatEuro(a.ca)}</td><td class="py-1 px-3 text-right">${st}</td></tr>`;
  }
  return html;
}
function _loadMoreTerrDirStatus(btn,rowId,offset,encDir,status){
  const direction=decodeURIComponent(encDir);
  const LIMIT=50,newOff=offset+LIMIT;
  const stockMap=new Map(DataStore.finalData.map(r=>[r.code,r]));
  const isStd=code=>/^\d{6}$/.test(code);
  const {activeFilters:{canal:_cg,commercial:_com}}=DataStore.byContext(); // [V3.2]
  const _comSet=_com?(_S.clientsByCommercial.get(_com)||new Set()):null;
  const artMap={};
  for(const l of DataStore.filteredTerritoireLines){
    if(_cg&&l.canal!==_cg)continue;
    if(_comSet&&(!l.clientCode||!_comSet.has(l.clientCode)))continue;
    if(l.isSpecial)continue;
    if(l.direction!==direction||l.rayonStatus!==status)continue;
    if(!artMap[l.code])artMap[l.code]={code:l.code,libelle:l.libelle,famille:l.famille||'',ca:0};
    artMap[l.code].ca+=l.ca;
  }
  const arts=Object.values(artMap).sort((a,b)=>b.ca-a.ca);
  const tbody=document.getElementById(rowId+'-statusbody');
  if(tbody)tbody.insertAdjacentHTML('beforeend',_buildTerrDirStatusRows(arts.slice(offset,newOff),stockMap,isStd));
  const rem=arts.length-newOff;
  if(rem>0){btn.textContent=`▼ Voir plus (${rem} restants…)`;btn.onclick=()=>_loadMoreTerrDirStatus(btn,rowId,newOff,encDir,status);}else btn.remove();
}

// Toggle famille row inside direction detail (lazy load articles)
function toggleTerrFam(rowId,encDir,encFam){
  const row=document.getElementById(rowId);if(!row)return;
  const isOpen=row.style.display!=='none';
  if(isOpen){row.style.display='none';if(row.previousElementSibling)row.previousElementSibling.classList.remove('open');return;}
  row.style.display='table-row';if(row.previousElementSibling)row.previousElementSibling.classList.add('open');
  const inner=document.getElementById(rowId+'-inner');
  if(inner&&inner.textContent.trim()==='Chargement…')renderTerrFamArticles(rowId,decodeURIComponent(encDir),decodeURIComponent(encFam));
}

// Render article list for a direction+famille combination, with optional rayonStatus filter
function renderTerrFamArticles(rowId,direction,famille,statusFilter){
  statusFilter=statusFilter||'';
  const inner=document.getElementById(rowId+'-inner');if(!inner)return;
  const stockMap=new Map(DataStore.finalData.map(r=>[r.code,r]));
  const {activeFilters:{canal:_cg,commercial:_com}}=DataStore.byContext(); // [V3.2]
  const _comSet=_com?(_S.clientsByCommercial.get(_com)||new Set()):null;
  const artMap={};
  for(const l of DataStore.filteredTerritoireLines){
    if(_cg&&l.canal!==_cg)continue;
    if(_comSet&&(!l.clientCode||!_comSet.has(l.clientCode)))continue;
    if(l.direction!==direction)continue;
    if((l.famille||'')!==famille)continue;
    if(!artMap[l.code])artMap[l.code]={code:l.code,libelle:l.libelle,ca:0,qty:0,rayonStatus:l.rayonStatus};
    artMap[l.code].ca+=l.ca;artMap[l.code].qty+=1;
  }
  const allArts=Object.values(artMap).sort((a,b)=>b.ca-a.ca);
  const arts=statusFilter?allArts.filter(a=>a.rayonStatus===statusFilter):allArts;
  const nbGreen=allArts.filter(a=>a.rayonStatus==='green').length;
  const nbYellow=allArts.filter(a=>a.rayonStatus==='yellow').length;
  const nbRed=allArts.filter(a=>a.rayonStatus==='red').length;
  const LIMIT=50;
  const encDir=encodeURIComponent(direction),encFam=encodeURIComponent(famille);
  const tgGreen=statusFilter==='green'?"''":"'green'";
  const tgYellow=statusFilter==='yellow'?"''":"'yellow'";
  const tgRed=statusFilter==='red'?"''":"'red'";
  const resetBtn=statusFilter?` · <span class="terr-status-badge t-disabled text-[10px]" onclick="renderTerrFamArticles('${rowId}','${encDir}','${encFam}','')">↺ Tout</span>`:'';
  let html=`<div class="font-semibold t-primary mb-2 text-[11px] px-2 pt-2">${allArts.length} art. · `+
    `<span class="terr-status-badge c-ok${statusFilter==='green'?' underline':''}" title="Filtrer En rayon" onclick="renderTerrFamArticles('${rowId}','${encDir}','${encFam}',${tgGreen})">✅ ${nbGreen}</span> · `+
    `<span class="terr-status-badge c-caution${statusFilter==='yellow'?' underline':''}" title="Filtrer Rupture" onclick="renderTerrFamArticles('${rowId}','${encDir}','${encFam}',${tgYellow})">⚠️ ${nbYellow}</span> · `+
    `<span class="terr-status-badge c-danger${statusFilter==='red'?' underline':''}" title="Filtrer Absent" onclick="renderTerrFamArticles('${rowId}','${encDir}','${encFam}',${tgRed})">❌ ${nbRed}</span>${resetBtn}</div>`;
  if(!arts.length){inner.innerHTML=html+'<p class="t-disabled text-[11px] px-2 pb-2">Aucun article pour ce filtre.</p>';return;}
  html+=`<table class="min-w-full text-[11px]"><thead class="s-hover t-primary"><tr><th class="py-1.5 px-3 text-left">Code</th><th class="py-1.5 px-3 text-left">Libellé</th><th class="py-1.5 px-3 text-right">CA Legallais</th><th class="py-1.5 px-3 text-center">Qté BL</th><th class="py-1.5 px-3 text-center">En rayon</th><th class="py-1.5 px-3 text-right">Stock actuel</th></tr></thead><tbody id="${rowId}-artbody">`;
  html+=_buildTerrFamArtRows(arts.slice(0,LIMIT),stockMap);
  html+=`</tbody></table>`;
  if(arts.length>LIMIT)html+=`<button class="mt-2 mb-2 ml-2 text-xs c-action font-bold hover:underline" onclick="_loadMoreTerrFamArt(this,'${rowId}',${LIMIT},'${encDir}','${encFam}','${statusFilter}')">▼ Voir plus (${arts.length-LIMIT} restants…)</button>`;
  inner.innerHTML=html;
}
function _buildTerrFamArtRows(arts,stockMap){
  const isStd=code=>/^\d{6}$/.test(code);
  let html='';
  for(const a of arts){
    const si=stockMap.get(a.code),st=si?si.stockActuel:'—';
    const ri=a.rayonStatus==='green'?'✅ En rayon':a.rayonStatus==='yellow'?'⚠️ Rupture':'❌ Absent';
    const rowBg=a.rayonStatus==='red'?'i-danger-bg':a.rayonStatus==='yellow'?'i-caution-bg':'';
    const speTag=!isStd(a.code)?'<span class="ml-1 text-[9px] s-hover t-tertiary font-bold px-1 rounded">SPÉ</span>':'';
    html+=`<tr class="border-t border-sky-100 ${rowBg}"><td class="py-1 px-3 font-mono text-[10px]">${a.code}${speTag}</td><td class="py-1 px-3 max-w-[200px] truncate">${a.libelle}</td><td class="py-1 px-3 text-right font-bold">${formatEuro(a.ca)}</td><td class="py-1 px-3 text-center">${a.qty}</td><td class="py-1 px-3 text-center">${ri}</td><td class="py-1 px-3 text-right">${st}</td></tr>`;
  }
  return html;
}
function _loadMoreTerrFamArt(btn,rowId,offset,encDir,encFam,statusFilter){
  statusFilter=statusFilter||'';
  const direction=decodeURIComponent(encDir),famille=decodeURIComponent(encFam);
  const LIMIT=50,newOff=offset+LIMIT;
  const stockMap=new Map(DataStore.finalData.map(r=>[r.code,r]));
  const {activeFilters:{canal:_cg,commercial:_com}}=DataStore.byContext(); // [V3.2]
  const _comSet=_com?(_S.clientsByCommercial.get(_com)||new Set()):null;
  const artMap={};
  for(const l of DataStore.filteredTerritoireLines){
    if(_cg&&l.canal!==_cg)continue;
    if(_comSet&&(!l.clientCode||!_comSet.has(l.clientCode)))continue;
    if(l.direction!==direction)continue;
    if((l.famille||'')!==famille)continue;
    if(!artMap[l.code])artMap[l.code]={code:l.code,libelle:l.libelle,ca:0,qty:0,rayonStatus:l.rayonStatus};
    artMap[l.code].ca+=l.ca;artMap[l.code].qty+=1;
  }
  let arts=Object.values(artMap).sort((a,b)=>b.ca-a.ca);
  if(statusFilter)arts=arts.filter(a=>a.rayonStatus===statusFilter);
  const tbody=document.getElementById(rowId+'-artbody');
  if(tbody)tbody.insertAdjacentHTML('beforeend',_buildTerrFamArtRows(arts.slice(offset,newOff),stockMap));
  const rem=arts.length-newOff;
  if(rem>0){btn.textContent=`▼ Voir plus (${rem} restants…)`;btn.onclick=()=>_loadMoreTerrFamArt(btn,rowId,newOff,encDir,encFam,statusFilter);}else btn.remove();
}

// VOLET 3: Résumé exécutif du croisement
function renderTerrCroisementSummary(blSetAll,dirSet,clientsMap,top100All,top100InStock){
  const el=document.getElementById('terrCroisementText');if(!el)return;
  const nbLignes=DataStore.territoireLines.length;
  const nbBL=blSetAll.size;
  const nbDirs=dirSet.size;
  const nbClients=Object.keys(clientsMap).length;
  const nbRefStock=DataStore.finalData.length;
  const nbMois=_S.consommeMoisCouverts||'?';
  const nbBLConso=Object.keys(_S.blData).length;
  const pctTop100=top100All.length>0?Math.round(top100InStock/top100All.length*100):0;
  let terrPeriodStr='';
  // Detect territory period from lines
  let tMin=null,tMax=null;
  for(const l of DataStore.territoireLines){if(l.dateExp){if(!tMin||l.dateExp<tMin)tMin=l.dateExp;if(!tMax||l.dateExp>tMax)tMax=l.dateExp;}}
  if(tMin&&tMax)terrPeriodStr=`, ${fmtDate(new Date(tMin))}–${fmtDate(new Date(tMax))}`;
  else if(_S.consommePeriodMin)terrPeriodStr='';
  el.innerHTML=`<p>🔗 PRISME a croisé <strong class="text-violet-300">${nbLignes.toLocaleString('fr')} lignes territoire</strong> (<span class="c-action">${nbBL.toLocaleString('fr')} BL${terrPeriodStr}</span>, <strong>${nbDirs} Direction${nbDirs>1?'s':''}</strong>, <strong>${nbClients} client${nbClients>1?'s':''}</strong>) avec votre stock agence (<strong class="c-ok">${nbRefStock.toLocaleString('fr')} réf.</strong>) et votre consommé (<strong>${nbMois} mois</strong>, <strong>${nbBLConso.toLocaleString('fr')} BL</strong>).</p><p class="mt-2">→ <strong class="text-yellow-300">${pctTop100}%</strong> des articles du Top 100 territoire sont en rayon.</p>`;
}

// VOLET 2bis: Build secteur + direction contributeurs aggregate maps
function buildTerrContrib(){
  _S.terrContribBySecteur=new Map();_S.terrContribByDirection=new Map();
  for(const l of DataStore.filteredTerritoireLines){
    if(!l.secteur)continue;
    const dir=getSecteurDirection(l.secteur)||l.direction||'—';
    // Per-secteur
    if(!_S.terrContribBySecteur.has(l.secteur))_S.terrContribBySecteur.set(l.secteur,{secteur:l.secteur,direction:dir,blTerr:new Set(),blAgence:new Set(),ca:0,clients:new Map()});
    const s=_S.terrContribBySecteur.get(l.secteur);
    s.blTerr.add(l.bl);if(_S.blConsommeSet.has(l.bl))s.blAgence.add(l.bl);s.ca+=l.ca;
    if(l.clientCode){
      if(!s.clients.has(l.clientCode))s.clients.set(l.clientCode,{code:l.clientCode,nom:l.clientNom,ca:0,refs:new Set(),blTerr:new Set(),blAgence:new Set()});
      const c=s.clients.get(l.clientCode);c.ca+=l.ca;c.refs.add(l.code);c.blTerr.add(l.bl);if(_S.blConsommeSet.has(l.bl))c.blAgence.add(l.bl);
    }
    // Per-direction
    if(!_S.terrContribByDirection.has(dir))_S.terrContribByDirection.set(dir,{direction:dir,blTerr:new Set(),blAgence:new Set(),ca:0});
    const d=_S.terrContribByDirection.get(dir);
    d.blTerr.add(l.bl);if(_S.blConsommeSet.has(l.bl))d.blAgence.add(l.bl);d.ca+=l.ca;
  }
}

// VOLET 2bis: Vue 1 — par Direction (5-6 lignes max, triées par CA desc)
function renderTerrContrib(){
  const el=document.getElementById('terrContribTable');if(!el)return;
  if(!_S.terrContribByDirection.size){el.innerHTML='<tr><td colspan="5" class="text-center py-4 t-disabled text-xs">Aucune donnée contributeurs trouvée dans le fichier territoire</td></tr>';return;}
  let rows=[..._S.terrContribByDirection.values()].map(d=>{
    const blT=d.blTerr.size,blA=d.blAgence.size,pct=blT>0?Math.round(blA/blT*100):0;return{...d,blT,blA,pct};
  }).sort((a,b)=>b.ca-a.ca);
  let tbody='';
  for(const r of rows){
    const barColor=r.pct>=30?'var(--c-ok)':r.pct>=10?'var(--c-caution)':'var(--c-danger)';
    const rowId='contrib-dir-'+r.direction.replace(/\W/g,'_');
    tbody+=`<tr class="contrib-dir-row border-b text-xs" onclick="toggleContribDirection('${rowId}','${encodeURIComponent(r.direction)}')">
      <td class="py-2 px-3 font-bold">${r.direction} <span class="t-disabled font-normal text-[9px]">▼</span></td>
      <td class="py-2 px-3 text-center font-semibold">${r.blT.toLocaleString('fr')}</td>
      <td class="py-2 px-3 text-center font-semibold c-action">${r.blA.toLocaleString('fr')}</td>
      <td class="py-2 px-3">${buildPctBar(r.pct, { color: barColor, height: 6, showLabel: true })}</td>
      <td class="py-2 px-3 text-right font-bold">${formatEuro(r.ca)}</td>
    </tr><tr id="${rowId}" class="contrib-dir-detail"><td colspan="5" class="p-0 i-info-bg border-b border-violet-100"><div id="${rowId}-inner" class="p-4 text-xs t-disabled">Chargement…</div></td></tr>`;
  }
  el.innerHTML=tbody||'<tr><td colspan="5" class="text-center py-4 t-disabled text-xs">Aucune direction</td></tr>';
  const sumEl=document.getElementById('terrContribSummary');
  if(sumEl){
    const nbDir=rows.length,nbSect=_S.terrContribBySecteur.size;
    const oppo=[..._S.terrContribBySecteur.values()].filter(s=>s.blTerr.size>0&&Math.round(s.blAgence.size/s.blTerr.size*100)<10).length;
    sumEl.textContent=`${nbDir} Direction${nbDir>1?'s':''}, ${nbSect} secteurs — ${oppo} opportunité${oppo>1?'s':''} (<10% BL agence). Cliquez une Direction pour voir ses secteurs.`;
  }
}

// Toggle Vue 1 → Vue 2 (secteurs d'une direction)
function toggleContribDirection(rowId,encDir){
  const row=document.getElementById(rowId);if(!row)return;
  const isOpen=row.classList.contains('open');
  document.querySelectorAll('.contrib-dir-detail.open').forEach(r=>r.classList.remove('open'));
  document.querySelectorAll('.contrib-dir-row.open').forEach(r=>r.classList.remove('open'));
  if(isOpen)return;
  row.classList.add('open');row.previousElementSibling.classList.add('open');
  renderContribSecteurs(rowId,decodeURIComponent(encDir));
}

// Vue 2 — Secteurs d'une Direction (lazy, triés % agence ASC = opportunités en haut)
function renderContribSecteurs(rowId,direction){
  const inner=document.getElementById(rowId+'-inner');if(!inner)return;
  const LIMIT=50;
  const secteurs=[..._S.terrContribBySecteur.values()]
    .filter(s=>s.direction===direction)
    .map(s=>{const blT=s.blTerr.size,blA=s.blAgence.size,pct=blT>0?Math.round(blA/blT*100):0;return{...s,blT,blA,pct};})
    .sort((a,b)=>a.pct-b.pct);
  if(!secteurs.length){inner.innerHTML='<p class="t-disabled text-[11px]">Aucun secteur pour cette direction.</p>';return;}
  const oppo=secteurs.filter(s=>s.pct<10).length;
  let html=`<div class="text-[11px] font-bold t-primary mb-2">${secteurs.length} secteur${secteurs.length>1?'s':''} · ${oppo} opportunité${oppo>1?'s':''} (&lt;10% agence) — trié par % BL agence croissant</div>`;
  html+=`<table class="min-w-full text-[11px]"><thead class="s-hover t-primary"><tr><th class="py-1.5 px-3 text-left">Secteur</th><th class="py-1.5 px-3 text-center">BL territoire</th><th class="py-1.5 px-3 text-center">BL agence</th><th class="py-1.5 px-3 text-center min-w-[130px]">% agence</th><th class="py-1.5 px-3 text-right">CA Legallais</th></tr></thead><tbody id="${rowId}-sectbody">`;
  html+=_buildSecteurRows(secteurs.slice(0,LIMIT));
  html+=`</tbody></table>`;
  if(secteurs.length>LIMIT)html+=`<button class="mt-2 text-xs c-action font-bold hover:underline" onclick="_loadMoreSecteurs(this,'${rowId}',${LIMIT},'${encodeURIComponent(direction)}')">▼ Voir plus (${secteurs.length-LIMIT} restants…)</button>`;
  inner.innerHTML=html;
}
function _buildSecteurRows(secteurs){
  let html='';
  for(const r of secteurs){
    const barColor=r.pct>=30?'var(--c-ok)':r.pct>=10?'var(--c-caution)':'var(--c-danger)';
    const rowId='contrib-sect-'+r.secteur.replace(/\W/g,'_');
    html+=`<tr class="contrib-sect-row border-t border-violet-100" onclick="toggleContribSecteur('${rowId}','${encodeURIComponent(r.secteur)}')">
      <td class="py-1.5 px-3 font-bold">${r.secteur} <span class="t-disabled text-[9px]">▼</span></td>
      <td class="py-1.5 px-3 text-center">${r.blT.toLocaleString('fr')}</td>
      <td class="py-1.5 px-3 text-center c-action font-semibold">${r.blA.toLocaleString('fr')}</td>
      <td class="py-1.5 px-3">${buildPctBar(r.pct, { color: barColor, height: 6, showLabel: true })}</td>
      <td class="py-1.5 px-3 text-right font-bold">${formatEuro(r.ca)}</td>
    </tr><tr id="${rowId}" class="contrib-sect-detail"><td colspan="5" class="p-0 i-ok-bg"><div id="${rowId}-inner" class="p-3 text-xs t-disabled">Chargement…</div></td></tr>`;
  }
  return html;
}
function _loadMoreSecteurs(btn,parentRowId,offset,encDir){
  const direction=decodeURIComponent(encDir);
  const LIMIT=50,newOff=offset+LIMIT;
  const secteurs=[..._S.terrContribBySecteur.values()].filter(s=>s.direction===direction).map(s=>{const blT=s.blTerr.size,blA=s.blAgence.size,pct=blT>0?Math.round(blA/blT*100):0;return{...s,blT,blA,pct};}).sort((a,b)=>a.pct-b.pct);
  const tbody=document.getElementById(parentRowId+'-sectbody');
  if(tbody)tbody.insertAdjacentHTML('beforeend',_buildSecteurRows(secteurs.slice(offset,newOff)));
  const rem=secteurs.length-newOff;
  if(rem>0){btn.textContent=`▼ Voir plus (${rem} restants…)`;btn.onclick=()=>_loadMoreSecteurs(btn,parentRowId,newOff,encDir);}else btn.remove();
}

// Toggle Vue 2 → Vue 3 (clients d'un secteur)
function toggleContribSecteur(rowId,encSect){
  const row=document.getElementById(rowId);if(!row)return;
  const isOpen=row.classList.contains('open');
  document.querySelectorAll('.contrib-sect-detail.open').forEach(r=>r.classList.remove('open'));
  document.querySelectorAll('.contrib-sect-row.open').forEach(r=>r.classList.remove('open'));
  if(isOpen)return;
  row.classList.add('open');row.previousElementSibling.classList.add('open');
  renderContribClients(rowId,decodeURIComponent(encSect));
}

// Vue 3 — Clients d'un secteur (lazy, triés CA desc, limite 50)
function renderContribClients(rowId,secteur){
  const inner=document.getElementById(rowId+'-inner');if(!inner)return;
  const s=_S.terrContribBySecteur.get(secteur);if(!s){inner.textContent='Données introuvables';return;}
  const clients=[...s.clients.values()].sort((a,b)=>b.ca-a.ca);
  const LIMIT=50;
  const mixte=clients.filter(c=>c.blAgence.size>0).length,jamais=clients.filter(c=>c.blAgence.size===0).length;
  let html=`<div class="font-bold t-primary mb-2 text-[11px]">✅ ${mixte} client${mixte>1?'s':''} viennent en agence · ❌ ${jamais} ne viennent jamais</div>`;
  html+=`<table class="min-w-full text-[11px]"><thead class="i-ok-bg c-ok"><tr><th class="py-1.5 px-3 text-left">Code</th><th class="py-1.5 px-3 text-left">Nom</th><th class="py-1.5 px-3 text-right">CA Legallais</th><th class="py-1.5 px-3 text-center">Agence</th><th class="py-1.5 px-3 text-center">BL agence</th></tr></thead><tbody id="${rowId}-clibody">`;
  html+=_buildClientRows(clients.slice(0,LIMIT));
  html+=`</tbody></table>`;
  if(clients.length>LIMIT)html+=`<button class="mt-2 text-xs c-ok font-bold hover:underline" onclick="_loadMoreClients(this,'${rowId}',${LIMIT},'${encodeURIComponent(secteur)}')">▼ Voir plus (${clients.length-LIMIT} restants…)</button>`;
  inner.innerHTML=html;
}
function _buildClientRows(clients){
  let html='';
  for(const c of clients){
    const vient=c.blAgence.size>0;
    const rowBg=!vient?'i-danger-bg':'';
    const cliRowId='contrib-cli-'+c.code;
    html+=`<tr class="contrib-client-row border-t border-emerald-200 ${rowBg}" onclick="toggleContribClient('${cliRowId}','${c.code}')">
      <td class="py-1.5 px-3 font-mono">${c.code} <span class="t-disabled text-[9px]">▼</span></td>
      <td class="py-1.5 px-3 max-w-[160px] truncate">${c.nom}${_unikLink(c.code)}${_S.chalandiseReady?_clientStatusBadge(c.code,_S.chalandiseData.get(c.code)||{}):''}</td>
      <td class="py-1.5 px-3 text-right font-bold">${formatEuro(c.ca)}</td>
      <td class="py-1.5 px-3 text-center font-bold">${vient?'✅ Oui':'❌ Jamais'}</td>
      <td class="py-1.5 px-3 text-center">${c.blAgence.size}</td>
    </tr><tr id="${cliRowId}" class="contrib-client-detail"><td colspan="5" class="p-0 s-card border-t b-light"><div id="${cliRowId}-inner" class="p-3 text-xs t-disabled">Chargement…</div></td></tr>`;
  }
  return html;
}
function _loadMoreClients(btn,parentRowId,offset,encSect){
  const secteur=decodeURIComponent(encSect);
  const LIMIT=50,newOff=offset+LIMIT;
  const s=_S.terrContribBySecteur.get(secteur);if(!s)return;
  const clients=[...s.clients.values()].sort((a,b)=>b.ca-a.ca);
  const tbody=document.getElementById(parentRowId+'-clibody');
  if(tbody)tbody.insertAdjacentHTML('beforeend',_buildClientRows(clients.slice(offset,newOff)));
  const rem=clients.length-newOff;
  if(rem>0){btn.textContent=`▼ Voir plus (${rem} restants…)`;btn.onclick=()=>_loadMoreClients(btn,parentRowId,newOff,encSect);}else btn.remove();
}

// Toggle Vue 3 → Vue 4 (articles d'un client)
function toggleContribClient(rowId,clientCode){
  const row=document.getElementById(rowId);if(!row)return;
  const isOpen=row.classList.contains('open');
  document.querySelectorAll('.contrib-client-detail.open').forEach(r=>r.classList.remove('open'));
  document.querySelectorAll('.contrib-client-row.open').forEach(r=>r.classList.remove('open'));
  if(isOpen)return;
  row.classList.add('open');row.previousElementSibling.classList.add('open');
  renderContribArticles(rowId,clientCode);
}

// Vue 4 — Articles d'un client (lazy, triés CA desc, limite 50) — inclut spéciaux avec tag SPÉ
function renderContribArticles(rowId,clientCode){
  const inner=document.getElementById(rowId+'-inner');if(!inner)return;
  const stockMap=new Map(DataStore.finalData.map(r=>[r.code,r]));
  const isStd=code=>/^\d{6}$/.test(code);
  const artMap={};
  for(const l of DataStore.filteredTerritoireLines){
    if(l.clientCode!==clientCode)continue;
    if(!artMap[l.code])artMap[l.code]={code:l.code,libelle:l.libelle,ca:0,qty:0,rayonStatus:l.rayonStatus,isSpecial:l.isSpecial||!isStd(l.code)};
    artMap[l.code].ca+=l.ca;artMap[l.code].qty+=1;
  }
  const arts=Object.values(artMap).sort((a,b)=>b.ca-a.ca);
  const LIMIT=50;
  const stdArts=arts.filter(a=>!a.isSpecial);
  const nbEnRayon=stdArts.filter(a=>a.rayonStatus==='green').length,nbAbsent=stdArts.filter(a=>a.rayonStatus==='red').length;
  const nbSpe=arts.length-stdArts.length;
  let html=`<div class="font-semibold t-primary mb-2 text-[11px]">Ce client achète <strong>${arts.length}</strong> réf. dont <strong class="c-ok">${nbEnRayon} en rayon</strong>, <strong class="c-danger">${nbAbsent} absentes</strong>${nbSpe>0?`, <span class="t-disabled">${nbSpe} SPÉ</span>`:''}</div>`;
  if(!arts.length){inner.innerHTML=html+'<p class="t-disabled text-xs">Aucun article trouvé.</p>';return;}
  html+=`<table class="min-w-full text-[11px]"><thead class="s-hover t-primary"><tr><th class="py-1.5 px-3 text-left">Code</th><th class="py-1.5 px-3 text-left">Libellé</th><th class="py-1.5 px-3 text-right">CA Legallais</th><th class="py-1.5 px-3 text-center">Qté BL</th><th class="py-1.5 px-3 text-center">En rayon</th><th class="py-1.5 px-3 text-right">Stock</th></tr></thead><tbody>`;
  for(const a of arts.slice(0,LIMIT)){
    const si=stockMap.get(a.code),st=si?si.stockActuel:'—';
    const ri=a.rayonStatus==='green'?'✅ En rayon':a.rayonStatus==='yellow'?'⚠️ Rupture':'❌ Absent';
    const rowBg=a.isSpecial?'s-card-alt':a.rayonStatus==='red'?'i-danger-bg':a.rayonStatus==='yellow'?'i-caution-bg':'';
    const speTag=a.isSpecial?'<span class="ml-1 text-[9px] s-hover t-tertiary font-bold px-1 rounded">SPÉ</span>':'';
    html+=`<tr class="border-t b-light ${rowBg}"><td class="py-1 px-3 font-mono text-[10px]">${a.code}${speTag}</td><td class="py-1 px-3 max-w-[200px] truncate">${a.libelle}</td><td class="py-1 px-3 text-right font-bold">${formatEuro(a.ca)}</td><td class="py-1 px-3 text-center">${a.qty}</td><td class="py-1 px-3 text-center">${a.isSpecial?'<span class="t-disabled text-[10px]">— spécial</span>':ri}</td><td class="py-1 px-3 text-right">${a.isSpecial?'—':st}</td></tr>`;
  }
  html+=`</tbody></table>`;
  if(arts.length>LIMIT)html+=`<p class="text-[10px] t-disabled mt-1 italic">… et ${arts.length-LIMIT} article${arts.length-LIMIT>1?'s':''} supplémentaires.</p>`;
  inner.innerHTML=html;
}

// Reset all territoire local filters + close all accordions
function resetTerrFilters(){
  const s=document.getElementById('terrSearch');if(s)s.value='';
  _S._terrClientSearch='';
  // Close all direction/famille detail rows
  document.querySelectorAll('[id^="terr-dir-"]').forEach(el=>{if(el.tagName==='TR'&&el.style)el.style.display='none';});
  document.querySelectorAll('[id^="terr-fam-"]').forEach(el=>{if(el.tagName==='TR'&&el.style)el.style.display='none';});
  document.querySelectorAll('.terr-row.expanded').forEach(el=>el.classList.remove('expanded'));
  document.querySelectorAll('.terr-fam-row.open').forEach(el=>el.classList.remove('open'));
  // Close contrib accordions
  document.querySelectorAll('.contrib-dir-detail.open,.contrib-sect-detail.open,.contrib-client-detail.open').forEach(el=>el.classList.remove('open'));
  document.querySelectorAll('.contrib-dir-row.open,.contrib-sect-row.open,.contrib-client-row.open').forEach(el=>el.classList.remove('open'));
  window.renderTerritoireTab();
  window.renderMesClients?.();
}

// VOLET 2bis: Export CSV — tous les secteurs avec leurs métriques
function exportContribCSV(){
  if(!_S.terrContribBySecteur.size){showToast('⚠️ Aucune donnée contributeurs','warning');return;}
  const SEP=';';
  const h=['Direction','Secteur','BL territoire','BL agence','% agence','CA Legallais'];
  const lines=['\uFEFF'+h.join(SEP)];
  const rows=[..._S.terrContribBySecteur.values()].map(s=>({dir:s.direction,secteur:s.secteur,blT:s.blTerr.size,blA:s.blAgence.size,pct:s.blTerr.size>0?Math.round(s.blAgence.size/s.blTerr.size*100):0,ca:s.ca})).sort((a,b)=>a.dir.localeCompare(b.dir)||a.pct-b.pct);
  for(const r of rows)lines.push([r.dir,r.secteur,r.blT,r.blA,r.pct+'%',r.ca.toFixed(2).replace('.',',')].join(SEP));
  const blob=new Blob([lines.join('\n')],{type:'text/csv;charset=utf-8;'});
  const link=document.createElement('a');link.href=URL.createObjectURL(blob);link.download=`PRISME_Contributeurs_${new Date().toISOString().slice(0,10)}.csv`;document.body.appendChild(link);link.click();document.body.removeChild(link);URL.revokeObjectURL(link.href);showToast('📥 CSV Contributeurs téléchargé','success');
}

function exportTerritoireCSV(){
  if(!DataStore.territoireLines.length){showToast('⚠️ Aucune donnée territoire','warning');return;}
  const SEP=';';const h=['Code','Libelle','Direction','Secteur','Famille','BL','CA','Canal','Rayon','Client','Nom Client','Type'];
  const lines=['\uFEFF'+h.join(SEP)];
  const q=(document.getElementById('terrSearch')||{}).value||'';
  const selectedSecteursCSV=getSelectedSecteurs();
  const {activeFilters:{canal:_canalGlobalExp,commercial:_comExp}}=DataStore.byContext(); // [V3.2]
  const _comSetExp=_comExp?(_S.clientsByCommercial.get(_comExp)||new Set()):null;
  const filtered=DataStore.filteredTerritoireLines.filter(l=>{
    if(_canalGlobalExp&&l.canal!==_canalGlobalExp)return false;
    if(_comSetExp&&(!l.clientCode||!_comSetExp.has(l.clientCode)))return false; // [V3.2]
    if(selectedSecteursCSV&&l.secteur&&!selectedSecteursCSV.has(l.secteur))return false;
    if(q&&!matchQuery(q,l.code,l.libelle,l.direction))return false;
    return true;
  });
  const rayonLabels={green:'En rayon',yellow:'Rupture',red:'Absent'};
  for(const l of filtered){lines.push([l.code,`"${l.libelle}"`,`"${l.direction}"`,`"${l.secteur||''}"`,`"${famLib(l.famille)||l.famille}"`,l.bl,l.ca.toFixed(2).replace('.',','),l.canal,rayonLabels[l.rayonStatus]||l.rayonStatus,l.clientCode,`"${l.clientNom}"`,l.clientType].join(SEP));}
  const blob=new Blob([lines.join('\n')],{type:'text/csv;charset=utf-8;'});
  const _store=(_S.selectedMyStore||'').replace(/[^A-Z0-9]/gi,'');
  const _canalSuffix=_canalGlobalExp?`_${_canalGlobalExp}`:'';
  const _dateStr=new Date().toISOString().slice(0,7);
  const link=document.createElement('a');link.href=URL.createObjectURL(blob);link.download=`terrain${_store?'_'+_store:''}${_canalSuffix}_${_dateStr}.csv`;document.body.appendChild(link);link.click();document.body.removeChild(link);URL.revokeObjectURL(link.href);showToast('📥 CSV Le Terrain téléchargé','success');
}

// ── Exports ──────────────────────────────────────────────────────
export {
  _renderGhostArticles,
  toggleTerrDir,
  renderTerrDirFamilles,
  toggleTerrDirStatus,
  renderTerrDirStatusArticles,
  _buildTerrDirStatusRows,
  _loadMoreTerrDirStatus,
  toggleTerrFam,
  renderTerrFamArticles,
  _buildTerrFamArtRows,
  _loadMoreTerrFamArt,
  renderTerrCroisementSummary,
  buildTerrContrib,
  renderTerrContrib,
  toggleContribDirection,
  renderContribSecteurs,
  _buildSecteurRows,
  _loadMoreSecteurs,
  toggleContribSecteur,
  renderContribClients,
  _buildClientRows,
  _loadMoreClients,
  toggleContribClient,
  renderContribArticles,
  resetTerrFilters,
  exportContribCSV,
  exportTerritoireCSV,
};

// ── Window expositions (called from inline HTML onclick handlers) ──
window.resetTerrFilters = resetTerrFilters;
window.exportContribCSV = exportContribCSV;
window.exportTerritoireCSV = exportTerritoireCSV;
window.toggleTerrDir = toggleTerrDir;
window.toggleTerrDirStatus = toggleTerrDirStatus;
window.toggleTerrFam = toggleTerrFam;
window.toggleContribDirection = toggleContribDirection;
window.toggleContribSecteur = toggleContribSecteur;
window.toggleContribClient = toggleContribClient;
window.renderTerrCroisementSummary = renderTerrCroisementSummary;
window.renderTerrContrib = renderTerrContrib;
window.renderContribClients = renderContribClients;
window.renderContribArticles = renderContribArticles;
window.buildTerrContrib = buildTerrContrib;
window.renderTerrFamArticles = renderTerrFamArticles;
window._loadMoreTerrDirStatus = _loadMoreTerrDirStatus;
window._loadMoreTerrFamArt = _loadMoreTerrFamArt;
window._loadMoreSecteurs = _loadMoreSecteurs;
window._loadMoreClients = _loadMoreClients;
window._renderGhostArticles = _renderGhostArticles;
