'use strict';

// ── Imports ──────────────────────────────────────────────────────────────────
import { _S } from './state.js';
import { DataStore } from './store.js';
import {
  escapeHtml, formatEuro, daysBetween, famLib, famLabel,
  _normalizeClassif, _classifShort, _normalizeStatut,
  _isMetierStrategique,
  fmtDate, getSecteurDirection, matchQuery, formatLocalYMD
} from './utils.js';
import {
  _clientPassesFilters, _passesClientCrossFilter,
  _isPDVActif, _isGlobalActif, _isPerdu, _isProspect,
  _isPerdu24plus, _clientStatusBadge, _clientStatusText,
  _unikLink, _crossBadge
} from './engine.js';
import { switchTab, showToast } from './ui.js';
import { _saveExclusions } from './cache.js';
import { closeDiagnostic, openDiagnosticMetier, openClient360 } from './diagnostic.js';

// ── Local state ──────────────────────────────────────────────────────────────
let _terrClientSearchTimer = null;

// ── Local helper: _passesAllFilters (extracted from main.js) ─────────────────
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

// ── Extracted code ───────────────────────────────────────────────────────────

function _toggleOverviewClassif(c,event){if(event)event.preventDefault();const all=new Set();for(const i of _S.chalandiseData.values())all.add(_normalizeClassif(i.classification));if(!_S._selectedClassifs.size){_S._selectedClassifs=new Set(all);_S._selectedClassifs.delete(c);}else if(_S._selectedClassifs.has(c)){_S._selectedClassifs.delete(c);if(!_S._selectedClassifs.size)_S._selectedClassifs=new Set();}else{_S._selectedClassifs.add(c);if(_S._selectedClassifs.size>=all.size)_S._selectedClassifs=new Set();}_buildChalandiseOverview();}
function _toggleOverviewActPDV(a,event){if(event)event.preventDefault();const all=new Set();for(const i of _S.chalandiseData.values())if(i.activitePDV)all.add(i.activitePDV);if(!_S._selectedActivitesPDV.size){_S._selectedActivitesPDV=new Set(all);_S._selectedActivitesPDV.delete(a);}else if(_S._selectedActivitesPDV.has(a)){_S._selectedActivitesPDV.delete(a);if(!_S._selectedActivitesPDV.size)_S._selectedActivitesPDV=new Set();}else{_S._selectedActivitesPDV.add(a);if(_S._selectedActivitesPDV.size>=all.size)_S._selectedActivitesPDV=new Set();}_buildChalandiseOverview();}
function _toggleOverviewStatut(s,event){if(event)event.preventDefault();const all=new Set();for(const i of _S.chalandiseData.values())if(i.statut)all.add(_normalizeStatut(i.statut));if(!_S._selectedStatuts.size){_S._selectedStatuts=new Set(all);_S._selectedStatuts.delete(s);}else if(_S._selectedStatuts.has(s)){_S._selectedStatuts.delete(s);if(!_S._selectedStatuts.size)_S._selectedStatuts=new Set();}else{_S._selectedStatuts.add(s);if(_S._selectedStatuts.size>=all.size)_S._selectedStatuts=new Set();}_buildChalandiseOverview();}
function _toggleOverviewDirection(d,event){if(event)event.preventDefault();const all=new Set();for(const i of _S.chalandiseData.values()){const _dir=i.secteur?getSecteurDirection(i.secteur)||'Autre':'Autre';all.add(_dir);}if(!_S._selectedDirections.size){_S._selectedDirections=new Set(all);_S._selectedDirections.delete(d);}else if(_S._selectedDirections.has(d)){_S._selectedDirections.delete(d);if(!_S._selectedDirections.size)_S._selectedDirections=new Set();}else{_S._selectedDirections.add(d);if(_S._selectedDirections.size>=all.size)_S._selectedDirections=new Set();}_buildChalandiseOverview();}
function _onActPDVSelect(v){_S._selectedActivitesPDV=v?new Set([v]):new Set();_buildChalandiseOverview();}
function _onStatutDetailleSelect(v){_S._selectedStatutDetaille=v||'';_buildChalandiseOverview();}
function _onStatutSelect(v){_S._selectedStatuts=v?new Set([v]):new Set();_buildChalandiseOverview();}
function _onUniversSelect(v){_S._selectedUnivers=v?new Set([v]):new Set();_buildChalandiseOverview();}
function _toggleOverviewUnivers(u,event){if(event)event.preventDefault();const all=new Set(_S._clientDominantUnivers.values());if(!_S._selectedUnivers.size){_S._selectedUnivers=new Set(all);_S._selectedUnivers.delete(u);}else if(_S._selectedUnivers.has(u)){_S._selectedUnivers.delete(u);if(!_S._selectedUnivers.size)_S._selectedUnivers=new Set();}else{_S._selectedUnivers.add(u);if(_S._selectedUnivers.size>=all.size)_S._selectedUnivers=new Set();}_buildChalandiseOverview();}
function _activitePDVColor(v){const l=(v||'').toLowerCase();if(!l.includes('inactif'))return'bg-emerald-600 text-white border-green-600';if(l.includes('2025'))return'bg-red-600 text-white border-red-600';return'bg-orange-500 text-white border-orange-500';}
function _getAllDepts(){const m={};for(const info of _S.chalandiseData.values()){const d=(info.cp||'').toString().slice(0,2);if(d&&d.trim())m[d]=(m[d]||0)+1;}return m;}
function _buildDeptFilter(){
  const container=document.getElementById('terrDeptCheckboxes');
  const labelEl=document.getElementById('terrDeptLabel');
  if(!container)return;
  if(!_S.chalandiseReady){return;}
  const deptMap=_getAllDepts();
  const depts=Object.entries(deptMap).sort((a,b)=>a[0].localeCompare(b[0]));
  if(!depts.length){container.innerHTML='<span class="text-xs c-danger">— aucun CP —</span>';if(labelEl)labelEl.textContent='🗺️ Dépt: —';return;}
  const allSel=!_S._selectedDepts.size;
  container.innerHTML=depts.map(([dept,cnt])=>{
    const sel=allSel||_S._selectedDepts.has(dept);
    return`<label class="flex items-center gap-1.5 text-[10px] py-0.5 px-1 rounded cursor-pointer hover:i-danger-bg"><input type="checkbox" ${sel?'checked':''} onchange="_toggleDept('${dept}')" class="rounded accent-rose-600"><span class="font-semibold">${dept}</span><span class="t-disabled">(${cnt})</span></label>`;
  }).join('');
  if(labelEl){const selCount=allSel?depts.length:_S._selectedDepts.size;labelEl.textContent=`🗺️ Dépt: ${selCount}/${depts.length}`;}
}
function _toggleDept(dept,event){
  if(event)event.preventDefault();
  const allDepts=new Set(Object.keys(_getAllDepts()));
  // If currently no explicit selection → all are shown. Click means DESELECT this one.
  if(!_S._selectedDepts.size){
    // Select all EXCEPT clicked
    _S._selectedDepts=new Set(allDepts);
    _S._selectedDepts.delete(dept);
  }else if(_S._selectedDepts.has(dept)){
    // Currently selected → deselect
    _S._selectedDepts.delete(dept);
    // If none left selected, reset to "all" (empty)
    if(!_S._selectedDepts.size)_S._selectedDepts=new Set();
  }else{
    // Currently deselected → select
    _S._selectedDepts.add(dept);
    // If all are now selected, reset to "all" (empty)
    if(_S._selectedDepts.size>=allDepts.size)_S._selectedDepts=new Set();
  }
  _buildDeptFilter();_buildChalandiseOverview();
}
function _resetChalandiseFilters(){_S._selectedDepts=new Set();_S._selectedClassifs=new Set();_S._selectedStatuts=new Set();_S._selectedActivitesPDV=new Set();_S._selectedStatutDetaille='';_S._selectedDirections=new Set();_S._selectedUnivers=new Set();_S._selectedCommercial='';_S._selectedMetier='';_S._filterStrategiqueOnly=false;_S._includePerdu24m=false;_S._distanceMaxKm=0;const btn=document.getElementById('btnStrategiqueOnly');if(btn){btn.classList.remove('bg-amber-500','text-white');btn.classList.add('s-hover','t-secondary');}const cb=document.querySelector('#togglePerdu24m input');if(cb)cb.checked=false;const comSel=document.getElementById('terrCommercialFilter');if(comSel)comSel.value='';const metSel=document.getElementById('terrMetierFilter');if(metSel)metSel.value='';const aSel=document.getElementById('terrActPDVSelect');if(aSel)aSel.value='';const sdSel=document.getElementById('terrStatutDetailleSelect');if(sdSel)sdSel.value='';const stSel=document.getElementById('terrStatutSelect');if(stSel)stSel.value='';const uSel=document.getElementById('terrUniversSelect');if(uSel)uSel.value='';const dSlider=document.getElementById('distKmSlider');if(dSlider){dSlider.value=0;}const dLabel=document.getElementById('distKmLabel');if(dLabel)dLabel.textContent='∞';_buildDeptFilter();_buildChalandiseOverview();}
// ── Territory overview: Direction → Métier → Secteur → Clients ──
const _closeAllDropPanels=(...except)=>{['terrDeptPanel','terrClassifPanel','terrActPDVPanel','terrStatutPanel','terrDirectionPanel'].forEach(id=>{if(!except.includes(id))document.getElementById(id)?.classList.add('hidden');});};
function _toggleDeptDropdown(){const p=document.getElementById('terrDeptPanel');if(!p)return;const closing=!p.classList.contains('hidden');_closeAllDropPanels('terrDeptPanel');p.classList.toggle('hidden',closing);}
function _toggleClassifDropdown(){const p=document.getElementById('terrClassifPanel');if(!p)return;const closing=!p.classList.contains('hidden');_closeAllDropPanels('terrClassifPanel');p.classList.toggle('hidden',closing);}
function _toggleActPDVDropdown(){const p=document.getElementById('terrActPDVPanel');if(!p)return;const closing=!p.classList.contains('hidden');_closeAllDropPanels('terrActPDVPanel');p.classList.toggle('hidden',closing);}
function _toggleStatutDropdown(){const p=document.getElementById('terrStatutPanel');if(!p)return;const closing=!p.classList.contains('hidden');_closeAllDropPanels('terrStatutPanel');p.classList.toggle('hidden',closing);}
function _toggleDirectionDropdown(){const p=document.getElementById('terrDirectionPanel');if(!p)return;const closing=!p.classList.contains('hidden');_closeAllDropPanels('terrDirectionPanel');p.classList.toggle('hidden',closing);}
function _toggleStrategiqueFilter(){_S._filterStrategiqueOnly=!_S._filterStrategiqueOnly;const btn=document.getElementById('btnStrategiqueOnly');if(btn){btn.classList.toggle('bg-amber-500',_S._filterStrategiqueOnly);btn.classList.toggle('text-white',_S._filterStrategiqueOnly);btn.classList.toggle('s-hover',!_S._filterStrategiqueOnly);btn.classList.toggle('t-secondary',!_S._filterStrategiqueOnly);}if(_S._filterStrategiqueOnly&&_S._selectedMetier&&!_isMetierStrategique(_S._selectedMetier)){_S._selectedMetier='';const mi=document.getElementById('terrMetierFilter');if(mi)mi.value='';}_buildChalandiseOverview();}
function _onCommercialFilter(val){const commercials=new Set();for(const info of _S.chalandiseData.values()){if(info.commercial)commercials.add(info.commercial);}_S._selectedCommercial=(!val||commercials.has(val))?val:'';if(_S._selectedCommercial===val)_buildChalandiseOverview();}
function _onDistanceSlider(val){const v=parseInt(val)||0;_S._distanceMaxKm=v;const lbl=document.getElementById('distKmLabel');if(lbl)lbl.textContent=v>0?v+'km':'∞';_buildChalandiseOverview();}
function _onTerrClientSearch(){
  clearTimeout(_terrClientSearchTimer);
  _terrClientSearchTimer=setTimeout(()=>window.renderTerritoireTab(),300);
}
function _onMetierFilter(val){const metiers=new Set();for(const info of _S.chalandiseData.values()){if(info.metier)metiers.add(info.metier);}_S._selectedMetier=(!val||metiers.has(val))?val:'';if(_S._selectedMetier===val)_buildChalandiseOverview();}
function _navigateToOverviewMetier(metier){
  closeDiagnostic();
  _S._selectedMetier=metier;
  _S._includePerdu24m=false;
  const cb=document.querySelector('#togglePerdu24m input');
  if(cb)cb.checked=false;
  // Reset les deux scroll containers avant switchTab
  window.scrollTo(0,0);
  const _mcNav=document.getElementById('mainContent');
  if(_mcNav){_mcNav.style.overflow='';_mcNav.scrollTop=0;}
  switchTab('territoire');
  // Poll position cumulative stable puis scroll + filtre métier
  let _ltNav=-1,_trNav=0;
  const _pvNav=setInterval(()=>{
    const mc=document.getElementById('mainContent');
    const cockpit=document.getElementById('terrCockpitClient');
    if(!mc||!cockpit){if(++_trNav>40)clearInterval(_pvNav);return;}
    // Force-set input métier à chaque poll jusqu'à stabilisation
    const metInput=document.getElementById('terrMetierFilter');
    if(metInput&&metInput.value!==metier){metInput.value=metier;metInput.classList.add('border-rose-400','ring-1','ring-rose-300');_onMetierFilter(metier);}
    // Position cumulative réelle relative au scroll container
    let e=cockpit,t=0;while(e&&e!==mc){t+=e.offsetTop;e=e.offsetParent;}
    if((t===_ltNav&&t>0)||_trNav++>40){
      clearInterval(_pvNav);
      window.scrollTo(0,0);
      mc.scrollTo({top:t-16,behavior:'smooth'});
    }else _ltNav=t;
  },100);
}
function _togglePerdu24m(checked){_S._includePerdu24m=checked;_buildChalandiseOverview();}
function _buildOverviewFilterChips(){
  const CLASSIF_ORDER=['FID Pot+','OCC Pot+','FID Pot-','OCC Pot-','NC'];
  const CLASSIF_ON={'FID Pot+':'bg-emerald-600 text-white border-emerald-600','FID Pot-':'bg-gray-500 text-white border-gray-500','OCC Pot+':'bg-blue-600 text-white border-blue-600','OCC Pot-':'bg-blue-400 text-white border-blue-400','NC':'bg-slate-400 text-white border-slate-400'};
  const availClassifs=new Set(),availActPDV=new Set(),availStatutDetaille=new Set(),availDirections=new Set();
  const availStatutsNorm=new Set();
  for(const info of _S.chalandiseData.values()){
    availClassifs.add(_normalizeClassif(info.classification));
    if(info.activitePDV)availActPDV.add(info.activitePDV);
    if(info.statutDetaille)availStatutDetaille.add(info.statutDetaille);
    if(info.statut)availStatutsNorm.add(_normalizeStatut(info.statut));
    const _dir=info.secteur?getSecteurDirection(info.secteur)||'Autre':'Autre';availDirections.add(_dir);
  }
  // Classif dropdown (unchanged)
  const allC=!_S._selectedClassifs.size;
  const cEl=document.getElementById('terrOverviewClassifChips');
  const availClassifList=CLASSIF_ORDER.filter(c=>availClassifs.has(c));
  if(cEl)cEl.innerHTML=availClassifList.map(c=>{const sel=allC||_S._selectedClassifs.has(c);return`<label class="flex items-center gap-1.5 text-[10px] py-0.5 px-1 rounded cursor-pointer hover:s-card-alt"><input type="checkbox" ${sel?'checked':''} onchange="_toggleOverviewClassif('${c.replace(/'/g,"\\'")}',event)" class="rounded"><span class="font-semibold">${c}</span></label>`;}).join('');
  const classifLabelEl=document.getElementById('terrClassifLabel');
  if(classifLabelEl){if(allC)classifLabelEl.textContent='Classif: toutes';else{const sel=[..._S._selectedClassifs];classifLabelEl.textContent=sel.length<=2?'Classif: '+sel.join(', '):'Classif: '+sel.length+'/'+availClassifList.length;}}
  // Group 1 — Activité PDV Zone <select>
  const sortedActPDV=[...availActPDV].sort((a,b)=>{const la=a.toLowerCase(),lb=b.toLowerCase();if(!la.includes('inactif')&&lb.includes('inactif'))return -1;if(la.includes('inactif')&&!lb.includes('inactif'))return 1;return a.localeCompare(b,'fr');});
  const curActPDV=[..._S._selectedActivitesPDV][0]||'';
  const aSel=document.getElementById('terrActPDVSelect');
  if(aSel){aSel.innerHTML=`<option value="">Activité PDV Zone: toutes</option>`+sortedActPDV.map(v=>`<option value="${escapeHtml(v)}"${v===curActPDV?' selected':''}>${escapeHtml(v)}</option>`).join('');aSel.value=curActPDV;}
  // Group 2 — Activité Client <select> (statutDetaille)
  const sortedSD=[...availStatutDetaille].sort((a,b)=>{const la=a.toLowerCase(),lb=b.toLowerCase();const order=v=>v.includes('actif ce')?0:v.includes('actif')?1:v.includes('prospect')?2:v.includes('inactif')?3:v.includes('perdu')?4:5;return order(la)-order(lb)||a.localeCompare(b,'fr');});
  const sdSel=document.getElementById('terrStatutDetailleSelect');
  if(sdSel){sdSel.innerHTML=`<option value="">Activité Client: toutes</option>`+sortedSD.map(v=>`<option value="${escapeHtml(v)}"${v===_S._selectedStatutDetaille?' selected':''}>${escapeHtml(v)}</option>`).join('');sdSel.value=_S._selectedStatutDetaille||'';}
  // Group 3 — Statut actuel <select>
  const STATUT_ORDER=['Actif','Prospect','Inactif','Perdu'];
  const sortedStatuts=[...STATUT_ORDER.filter(s=>availStatutsNorm.has(s)),...[...availStatutsNorm].filter(s=>!STATUT_ORDER.includes(s)).sort()];
  const curStatut=[..._S._selectedStatuts][0]||'';
  const stSel=document.getElementById('terrStatutSelect');
  if(stSel){stSel.innerHTML=`<option value="">Statut actuel: tous</option>`+sortedStatuts.map(v=>`<option value="${escapeHtml(v)}"${v===curStatut?' selected':''}>${escapeHtml(v)}</option>`).join('');stSel.value=curStatut;}
  // Direction dropdown (unchanged — custom checkbox panel)
  const sortedDirections=[...availDirections].sort((a,b)=>a.localeCompare(b,'fr'));
  const allDir=!_S._selectedDirections.size;
  const dirEl=document.getElementById('terrDirectionChips');
  if(dirEl)dirEl.innerHTML=sortedDirections.map(d=>{const sel=allDir||_S._selectedDirections.has(d);const dEsc=d.replace(/'/g,"\\'");return`<label class="flex items-center gap-1.5 text-[10px] py-0.5 px-1 rounded cursor-pointer hover:s-card-alt"><input type="checkbox" ${sel?'checked':''} onchange="_toggleOverviewDirection('${dEsc}',event)" class="rounded"><span class="font-semibold">${d}</span></label>`;}).join('');
  const dirLabelEl=document.getElementById('terrDirectionLabel');
  if(dirLabelEl){if(allDir)dirLabelEl.textContent='Direction: toutes';else{const sel=[..._S._selectedDirections];dirLabelEl.textContent=sel.length===1?'Direction: '+sel[0]:('Direction: '+sel.length+'/'+sortedDirections.length);}}
  // Univers <select> — source prioritaire : _clientDominantUnivers (valeurs calculées) ;
  // fallback : articleUnivers (disponible dès le chargement du consommé)
  const availUnivers=_S._clientDominantUnivers.size>0
    ?new Set(_S._clientDominantUnivers.values())
    :new Set(Object.values(_S.articleUnivers).filter(Boolean));
  const UNIVERS_ORDER=['Consommables','Bâtiment','Outillage','Plomberie','Génie climatique','Électricité','EPI','Maintenance et équipements','Agencement ameublement'];
  const sortedUnivers=[...UNIVERS_ORDER.filter(u=>availUnivers.has(u)),...[...availUnivers].filter(u=>!UNIVERS_ORDER.includes(u)).sort()];
  const curUnivers=[..._S._selectedUnivers][0]||'';
  const uSel=document.getElementById('terrUniversSelect');
  if(uSel){uSel.innerHTML=`<option value="">Univers: tous</option>`+sortedUnivers.map(v=>`<option value="${escapeHtml(v)}"${v===curUnivers?' selected':''}>${escapeHtml(v)}</option>`).join('');uSel.value=curUnivers;}
  // Populate métier filter datalist (filtered by stratégique toggle)
  const metInput=document.getElementById('terrMetierFilter');
  const metList=document.getElementById('terrMetierList');
  if(metInput&&metList){const metiers=new Set();for(const info of _S.chalandiseData.values()){if(info.metier&&(!_S._filterStrategiqueOnly||_isMetierStrategique(info.metier)))metiers.add(info.metier);}const sorted=[...metiers].sort();metList.innerHTML=sorted.map(m=>`<option value="${escapeHtml(m)}">`).join('');metInput.value=_S._selectedMetier||'';metInput.classList.toggle('border-rose-400',!!_S._selectedMetier);metInput.classList.toggle('ring-1',!!_S._selectedMetier);metInput.classList.toggle('ring-rose-300',!!_S._selectedMetier);}
  // Populate commercial filter datalist
  const comInput=document.getElementById('terrCommercialFilter');
  const comList=document.getElementById('terrCommercialList');
  if(comInput&&comList){const commercials=new Set();for(const info of _S.chalandiseData.values()){if(info.commercial)commercials.add(info.commercial);}const sorted=[...commercials].sort();comList.innerHTML=sorted.map(c=>`<option value="${escapeHtml(c)}">`).join('');if(_S._selectedCommercial)comInput.value=_S._selectedCommercial;}
}
// [Feature B / V3.2] Vue par commercial — CA agence, Nb clients
// Réactif à tous les filtres : canal, segment omnicanal, géographie, métier, classif, etc.
function _renderCommercialSummary(){
  const el=document.getElementById('commercialSummaryBlock');if(!el)return;
  if(!_S.chalandiseReady||!_S.clientsByCommercial.size){el.classList.add('hidden');return;}
  const _ctx=DataStore.byContext();
  const canal=_ctx.activeFilters.canal;
  const isHors=canal&&canal!=='MAGASIN';
  const comData={};
  for(const[cc,info] of _S.chalandiseData.entries()){
    if(!_clientPassesFilters(info,cc))continue;
    if(!_S._includePerdu24m&&_isPerdu24plus(info))continue;
    // Segment omnicanal filter
    if(_S._omniSegmentFilter){const seg=_S.clientOmniScore?.get(cc)?.segment;if(seg!==_S._omniSegmentFilter)continue;}
    const com=info.commercial||'-';
    if(!comData[com])comData[com]={ca:0,nb:0};
    const d=comData[com];
    d.nb++;
    if(isHors){
      const hm=_S.ventesClientHorsMagasin.get(cc);
      if(hm)for(const v of hm.values()){if(v.canal===canal)d.ca+=v.sumCA||0;}
    }else if(canal==='MAGASIN'||!canal){
      const am=DataStore.ventesClientArticle.get(cc);
      if(am)for(const v of am.values())d.ca+=v.sumCA||0;
    }
  }
  const unassigned=comData['-'];
  const mainList=Object.entries(comData).filter(([com,d])=>com!=='-'&&d.nb>0).sort((a,b)=>b[1].ca-a[1].ca);
  const totalCount=mainList.length+(unassigned&&unassigned.nb>0?1:0);
  if(!totalCount){el.classList.add('hidden');return;}
  el.classList.remove('hidden');
  const sel=_ctx.activeFilters.commercial;
  const canalLabel=canal?({MAGASIN:'Magasin',INTERNET:'Internet',REPRESENTANT:'Représentant',DCS:'DCS',AUTRE:'Autre'}[canal]||canal):'';
  const SEG_LABELS=(window.SEG_LABELS||{});
  const segLabel=_S._omniSegmentFilter?(SEG_LABELS[_S._omniSegmentFilter]||''):'';
  const PAGE=15;
  const isOpen=el.dataset.open==='1';
  const showAll=el.dataset.showAll==='1';
  const totalCA=mainList.reduce((s,[,d])=>s+d.ca,0)+(unassigned?unassigned.ca:0);
  const summaryLine=`${totalCount} commercial${totalCount>1?'s':''} · ${totalCA>0?formatEuro(totalCA):'—'}`;
  const visibleMain=showAll?mainList:mainList.slice(0,PAGE);
  function rowHtml(com,d,labelOverride){
    const isRowSel=sel===com;
    const label=labelOverride||com;
    return`<tr class="border-t b-light hover:s-card-alt cursor-pointer${isRowSel?' i-info-bg':''}" data-com="${escapeHtml(com)}" onclick="_onCommercialFilter(this.dataset.com)">
      <td class="py-1.5 px-2 font-semibold${isRowSel?' c-action':' t-primary'}">${escapeHtml(label)}${isRowSel?' ✓':''}</td>
      <td class="py-1.5 px-2 text-right font-bold">${d.ca>0?formatEuro(d.ca):'—'}</td>
      <td class="py-1.5 px-2 text-center font-bold t-primary">${d.nb}</td>
    </tr>`;
  }
  let rows='';
  for(const[com,d] of visibleMain)rows+=rowHtml(com,d);
  const remaining=mainList.length-PAGE;
  if(!showAll&&remaining>0)rows+=`<tr><td colspan="3" class="py-2 px-3"><button class="text-[11px] font-bold c-action hover:underline" onclick="(function(){document.getElementById('commercialSummaryBlock').dataset.showAll='1';_renderCommercialSummary();})()">... et ${remaining} autres — Voir tous</button></td></tr>`;
  if(unassigned&&unassigned.nb>0)rows+=rowHtml('-',unassigned,'Non assigné');
  const filterTags=[canalLabel,segLabel].filter(Boolean).join(' · ');
  let html=`<details ${isOpen?'open':''} class="s-card rounded-xl shadow-md border overflow-hidden mb-3" ontoggle="document.getElementById('commercialSummaryBlock').dataset.open=this.open?'1':'0'">
    <summary class="px-2 py-1.5 border-b s-card-alt select-none flex items-center justify-between cursor-pointer hover:brightness-95">
      <h3 class="font-extrabold t-primary text-xs flex items-center gap-1.5">
        👤 Vue par commercial${filterTags?` — <span class="c-action">${filterTags}</span>`:''}
        <span class="font-normal t-disabled">(${totalCount})</span>
      </h3>
      <div class="flex items-center gap-2">
        ${sel?`<button onclick="event.stopPropagation();event.preventDefault();_onCommercialFilter('')" class="text-[10px] c-danger font-semibold hover:underline">✕ ${escapeHtml(sel)}</button>`:''}
        <span class="text-[10px] t-tertiary font-normal">${summaryLine}</span>
        <span class="acc-arrow t-disabled">▶</span>
      </div>
    </summary>
    <div class="overflow-x-auto"><table class="min-w-full text-xs">
    <thead class="s-panel-inner t-inverse"><tr>
      <th class="py-1.5 px-2 text-left">Commercial</th>
      <th class="py-1.5 px-2 text-right">CA agence</th>
      <th class="py-1.5 px-2 text-center">Nb clients</th>
    </tr></thead><tbody>${rows}</tbody></table></div>
  </details>`;
  el.innerHTML=html;
}

function _buildChalandiseOverview(){
  const blk=document.getElementById('terrChalandiseOverview');
  if(!blk)return;
  if(!_S.chalandiseReady){blk.classList.add('hidden');return;}
  blk.classList.remove('hidden');
  _buildCockpitClient();
  _buildDeptFilter();
  _buildOverviewFilterChips();
  // Aggregate by direction commerciale — FIXED columns
  const dirMap={};let totalClients=0,filteredClients=0,totalActifsPDV=0,totalActifsLeg=0,totalExcluded24m=0;
  for(const[cc,info] of _S.chalandiseData.entries()){
    totalClients++;
    if(!_clientPassesFilters(info,cc))continue;
    // Exclude perdus >24m when toggle is OFF
    const is24plus=_isPerdu24plus(info);
    if(is24plus&&!_S._includePerdu24m){totalExcluded24m++;continue;}
    filteredClients++;
    const dir=info.secteur?getSecteurDirection(info.secteur)||'Autre':'Autre';
    const dirKey=dir||'Autre';
    if(!dirMap[dirKey])dirMap[dirKey]={dir:dirKey,total:0,actifsLeg:0,actifsPDV:0,prospects:0,perdus12_24:0,inactifs:0,caPDVZone:0};
    const d=dirMap[dirKey];d.total++;
    const pdvActif=_isPDVActif(cc);
    if(_isProspect(info)){d.prospects++;}
    else if(_isPerdu(info)&&!pdvActif){if((info.ca2025||0)>0)d.perdus12_24++;else d.inactifs++;}
    else{d.actifsLeg++;totalActifsLeg++;}
    if(pdvActif){d.actifsPDV++;totalActifsPDV++;}
    d.caPDVZone+=(info.caPDVN||0);
  }
  // Fixed thead — columns NEVER change
  const colSpan=9;
  const headEl=document.getElementById('terrOverviewL1Head');
  if(headEl){
    headEl.innerHTML=`<tr><th class="py-1.5 px-2 text-left">Direction</th><th class="py-1.5 px-2 text-center">Total</th><th class="py-1.5 px-2 text-center">Actifs Leg.</th><th class="py-1.5 px-2 text-center">Actifs PDV</th><th class="py-1.5 px-2 text-center">Prospects</th><th class="py-1.5 px-2 text-center">Perdus 12-24m</th><th class="py-1.5 px-2 text-center">Inactifs</th><th class="py-1.5 px-2 text-center min-w-[100px]">% capté Leg.</th><th class="py-1.5 px-2 text-center min-w-[100px]">% capté PDV</th></tr>`;
  }
  // Summary KPI bar — dénominateur = tous les clients filtrés (prospects inclus)
  const pctCapte=filteredClients>0?Math.round(totalActifsPDV/filteredClients*100):0;
  const pctCapteLeg=filteredClients>0?Math.round(totalActifsLeg/filteredClients*100):0;
  const _nbDirs=Object.keys(dirMap).length;const _sl=document.getElementById('terrOverviewSummaryLine');if(_sl)_sl.textContent=`${_nbDirs} direction${_nbDirs>1?'s':''} · ${totalActifsPDV.toLocaleString('fr-FR')} actifs PDV · ${pctCapte}% capté`;
  const filterActive=_S._selectedDepts.size||_S._selectedClassifs.size||_S._selectedStatuts.size||_S._selectedActivitesPDV.size||_S._selectedDirections.size||_S._selectedUnivers.size||_S._selectedCommercial||_S._selectedMetier||_S._filterStrategiqueOnly;
  const bar=document.getElementById('terrSummaryBar');if(bar)bar.classList.remove('hidden');
  const sumClients=document.getElementById('terrSumClients');
  if(sumClients)sumClients.innerHTML=filterActive?`<span class="c-danger">${filteredClients.toLocaleString('fr-FR')}</span><span class="text-sm font-semibold t-disabled"> / ${totalClients.toLocaleString('fr-FR')}</span>`:`${filteredClients.toLocaleString('fr-FR')}`;
  const sumLeg=document.getElementById('terrSumCapteLeg');if(sumLeg)sumLeg.textContent=pctCapteLeg+'%';
  const sumPDV=document.getElementById('terrSumCaptePDV');if(sumPDV)sumPDV.textContent=pctCapte+'%';
  const legCount=document.getElementById('terrSumCapteLegCount');
  if(legCount){if(filterActive&&filteredClients>0){legCount.textContent=totalActifsLeg.toLocaleString('fr-FR')+' / '+filteredClients.toLocaleString('fr-FR');legCount.classList.remove('hidden');}else legCount.classList.add('hidden');}
  const pdvCount=document.getElementById('terrSumCaptePDVCount');
  if(pdvCount){if(filterActive&&filteredClients>0){pdvCount.textContent=totalActifsPDV.toLocaleString('fr-FR')+' / '+filteredClients.toLocaleString('fr-FR');pdvCount.classList.remove('hidden');}else pdvCount.classList.add('hidden');}
  const excWrap=document.getElementById('terrSumExclusWrap');
  if(excWrap)excWrap.classList.toggle('hidden',_S._includePerdu24m||totalExcluded24m===0);
  const excEl=document.getElementById('terrSumExclus');if(excEl)excEl.textContent=totalExcluded24m.toLocaleString('fr-FR');
  // Sort by % capté ascending (opportunities first)
  let dirsArr=Object.values(dirMap).filter(d=>d.total>0);
  dirsArr.sort((a,b)=>b.perdus12_24-a.perdus12_24||b.total-a.total);
  let html='';
  dirsArr.forEach((d,idx)=>{
    const base=d.total-d.prospects;
    const pctC=base>0?Math.round(d.actifsPDV/base*100):0;
    const pctL=base>0?Math.round(d.actifsLeg/base*100):0;
    const barColor=pctC>=50?'bg-emerald-500':pctC>=25?'bg-amber-500':'bg-red-500';
    const dirEnc=encodeURIComponent(d.dir);
    html+=`<tr class="border-b text-[11px] hover:s-card-alt cursor-pointer font-semibold" onclick="_toggleOverviewL2('${dirEnc}',${idx})">
      <td class="py-1.5 px-2">${d.dir} <span id="overviewL1Arrow-${idx}" class="t-disabled text-[9px]">▼</span></td>
      <td class="py-1.5 px-2 text-center font-bold">${d.total}</td>
      <td class="py-1.5 px-2 text-center ${d.actifsLeg>0?'c-ok font-bold':'t-disabled'}">${d.actifsLeg||'—'}</td>
      <td class="py-1.5 px-2 text-center ${d.actifsPDV>0?'c-ok font-bold':'t-disabled'}">${d.actifsPDV||'—'}</td>
      <td class="py-1.5 px-2 text-center ${d.prospects>0?'c-action':'t-disabled'}">${d.prospects||'—'}</td>
      <td class="py-1.5 px-2 text-center ${d.perdus12_24>0?'c-caution font-bold':'t-disabled'}">${d.perdus12_24||'—'}</td>
      <td class="py-1.5 px-2 text-center ${d.inactifs>0?'t-secondary':'t-disabled'}">${d.inactifs||'—'}</td>
      <td class="py-1.5 px-2"><div class="flex items-center gap-1"><div class="flex-1 s-hover rounded-full h-1.5"><div class="cap-bar bg-blue-400" style="width:${pctL}%"></div></div><span class="text-[10px] font-bold w-8 text-right c-action">${pctL}%</span></div></td>
      <td class="py-1.5 px-2"><div class="flex items-center gap-1"><div class="flex-1 s-hover rounded-full h-1.5"><div class="cap-bar ${barColor}" style="width:${pctC}%"></div></div><span class="text-[10px] font-bold w-8 text-right">${pctC}%</span></div></td>
    </tr>
    <tr id="overviewL2-${idx}" style="display:none"><td colspan="${colSpan}" class="p-0 i-danger-bg"><div id="overviewL2Inner-${idx}" class="text-xs t-disabled px-4 py-2">Chargement…</div></td></tr>`;
  });
  const tEl=document.getElementById('terrOverviewL1Table');
  if(tEl)tEl.innerHTML=html||`<tr><td colspan="${colSpan}" class="text-center py-4 t-disabled">Aucun client dans la zone de chalandise</td></tr>`;
  // Cockpit client
  _buildCockpitClient();
  // [Feature B] Vue par commercial
  _renderCommercialSummary();
  // Mettre à jour la vue Canal avec les filtres actifs
  window.renderCanalAgence();
}
// Level 2: Métiers for a Direction
function _toggleOverviewL2(dirEnc,idx){
  const row=document.getElementById('overviewL2-'+idx);if(!row)return;
  const arrow=document.getElementById('overviewL1Arrow-'+idx);
  const isOpen=row.style.display!=='none';
  row.style.display=isOpen?'none':'table-row';if(arrow)arrow.textContent=isOpen?'▼':'▲';
  if(!isOpen){const inner=document.getElementById('overviewL2Inner-'+idx);if(inner)_renderOverviewL2(inner,decodeURIComponent(dirEnc));}
}
function _renderOverviewL2(el,direction){
  const metierMap={};
  for(const[cc,info] of _S.chalandiseData.entries()){
    if(!_clientPassesFilters(info,cc))continue;
    if(!_S._includePerdu24m&&_isPerdu24plus(info))continue;
    const dir=info.secteur?getSecteurDirection(info.secteur)||'Autre':'Autre';
    if(dir!==direction)continue;
    const m=info.metier||'Autre';
    if(!metierMap[m])metierMap[m]={metier:m,total:0,actifsLeg:0,actifsPDV:0,prospects:0,perdus12_24:0,inactifs:0,caPDVZone:0};
    const md=metierMap[m];md.total++;
    const pdvActif=_isPDVActif(cc);
    if(_isProspect(info)){md.prospects++;}
    else if(_isPerdu(info)&&!pdvActif){if((info.ca2025||0)>0)md.perdus12_24++;else md.inactifs++;}
    else{md.actifsLeg++;}
    if(pdvActif)md.actifsPDV++;
    md.caPDVZone+=(info.caPDVN||0);
  }
  let metiersArr=Object.values(metierMap).filter(m=>m.total>0);
  // Sort by % capté ascending (opportunities first)
  metiersArr.sort((a,b)=>{const aS=_isMetierStrategique(a.metier)?0:1,bS=_isMetierStrategique(b.metier)?0:1;if(aS!==bS)return aS-bS;return b.perdus12_24-a.perdus12_24||b.total-a.total;});
  if(!metiersArr.length){el.innerHTML='<div class="px-4 py-3 t-disabled text-xs">Aucun client pour ce filtre.</div>';return;}
  const dirEnc=encodeURIComponent(direction);
  const headCols='<th class="py-1.5 px-2 text-left">Métier</th><th class="py-1.5 px-2 text-center">Total</th><th class="py-1.5 px-2 text-center">Actifs Leg.</th><th class="py-1.5 px-2 text-center">Actifs PDV</th><th class="py-1.5 px-2 text-center">Prospects</th><th class="py-1.5 px-2 text-center">Perdus 12-24m</th><th class="py-1.5 px-2 text-center">Inactifs</th><th class="py-1.5 px-2 text-center min-w-[90px]">% capté Leg.</th><th class="py-1.5 px-2 text-center min-w-[90px]">% capté PDV</th><th class="py-1.5 px-2 text-center">🔍</th>';
  let html=`<div class="px-2 py-2"><table class="min-w-full text-[11px]"><thead class="i-danger-bg c-danger font-bold"><tr>${headCols}</tr></thead><tbody>`;
  metiersArr.forEach((m,mIdx)=>{
    const base=m.total-m.prospects;
    const pctC=base>0?Math.round(m.actifsPDV/base*100):0;
    const pctL=base>0?Math.round(m.actifsLeg/base*100):0;
    const barColor=pctC>=50?'bg-emerald-500':pctC>=25?'bg-amber-500':'bg-red-500';
    const mEnc=encodeURIComponent(m.metier);
    const rowId=`overviewL3-${dirEnc}-${mIdx}`;
    html+=`<tr class="border-t b-light hover:i-danger-bg cursor-pointer font-semibold" onclick="_toggleOverviewL3('${dirEnc}','${mEnc}','${rowId}')">
      <td class="py-1.5 px-2">${m.metier}${_isMetierStrategique(m.metier)?' <span class="c-caution text-[10px]" title="Métier stratégique Legallais">⭐</span>':''} <span id="${rowId}-arrow" class="t-disabled text-[9px]">▼</span></td>
      <td class="py-1.5 px-2 text-center font-bold">${m.total}</td>
      <td class="py-1.5 px-2 text-center ${m.actifsLeg>0?'c-ok font-bold':'t-disabled'}">${m.actifsLeg||'—'}</td>
      <td class="py-1.5 px-2 text-center ${m.actifsPDV>0?'c-ok font-bold':'t-disabled'}">${m.actifsPDV||'—'}</td>
      <td class="py-1.5 px-2 text-center ${m.prospects>0?'c-action':'t-disabled'}">${m.prospects||'—'}</td>
      <td class="py-1.5 px-2 text-center ${m.perdus12_24>0?'c-caution font-bold':'t-disabled'}">${m.perdus12_24||'—'}</td>
      <td class="py-1.5 px-2 text-center ${m.inactifs>0?'t-secondary':'t-disabled'}">${m.inactifs||'—'}</td>
      <td class="py-1.5 px-2"><div class="flex items-center gap-1"><div class="flex-1 s-hover rounded-full h-1.5"><div class="cap-bar bg-blue-400" style="width:${pctL}%"></div></div><span class="text-[10px] w-7 text-right c-action">${pctL}%</span></div></td>
      <td class="py-1.5 px-2"><div class="flex items-center gap-1"><div class="flex-1 s-hover rounded-full h-1.5"><div class="cap-bar ${barColor}" style="width:${pctC}%"></div></div><span class="text-[10px] w-7 text-right">${pctC}%</span></div></td>
      <td class="py-1.5 px-2 text-center"><button class="diag-btn i-danger-bg c-danger" onclick="event.stopPropagation();openDiagnosticMetier(decodeURIComponent('${mEnc}'))">🔍</button></td>
    </tr>
    <tr id="${rowId}" style="display:none"><td colspan="10" class="p-0 i-info-bg"><div id="${rowId}-inner" class="text-xs t-disabled px-4 py-2">Chargement…</div></td></tr>`;
  });
  html+=`</tbody></table></div>`;
  el.innerHTML=html;
}
// Level 3: Secteurs for a Direction+Métier
function _toggleOverviewL3(dirEnc,mEnc,rowId){
  const row=document.getElementById(rowId);if(!row)return;
  const arrow=document.getElementById(rowId+'-arrow');
  const isOpen=row.style.display!=='none';
  row.style.display=isOpen?'none':'table-row';if(arrow)arrow.textContent=isOpen?'▼':'▲';
  if(!isOpen){const inner=document.getElementById(rowId+'-inner');if(inner)_renderOverviewL3(inner,decodeURIComponent(dirEnc),decodeURIComponent(mEnc));}
}
function _renderOverviewL3(el,direction,metier){
  const sectMap={};
  for(const[cc,info] of _S.chalandiseData.entries()){
    if(!_clientPassesFilters(info,cc))continue;
    if(!_S._includePerdu24m&&_isPerdu24plus(info))continue;
    const dir=info.secteur?getSecteurDirection(info.secteur)||'Autre':'Autre';
    if(dir!==direction)continue;
    if((info.metier||'Autre')!==metier)continue;
    const sect=info.secteur||'—';
    const comm=info.commercial||'—';
    const key=sect+'||'+comm;
    if(!sectMap[key])sectMap[key]={secteur:sect,commercial:comm,total:0,actifsLeg:0,actifsPDV:0,prospects:0,perdus12_24:0,inactifs:0,caPDVZone:0};
    const sd=sectMap[key];sd.total++;
    const pdvActif=_isPDVActif(cc);
    if(_isProspect(info)){sd.prospects++;}
    else if(_isPerdu(info)&&!pdvActif){if((info.ca2025||0)>0)sd.perdus12_24++;else sd.inactifs++;}
    else{sd.actifsLeg++;}
    if(pdvActif)sd.actifsPDV++;
    sd.caPDVZone+=(info.caPDVN||0);
  }
  let sectsArr=Object.values(sectMap);
  sectsArr.sort((a,b)=>b.perdus12_24-a.perdus12_24||b.total-a.total);
  if(!sectsArr.length){el.innerHTML='<div class="px-4 py-3 t-disabled text-xs">Aucun secteur identifié.</div>';return;}
  const dirEnc=encodeURIComponent(direction),mEnc=encodeURIComponent(metier);
  const headCols='<th class="py-1.5 px-2 text-left">Secteur</th><th class="py-1.5 px-2 text-left">Commercial</th><th class="py-1.5 px-2 text-center">Total</th><th class="py-1.5 px-2 text-center">Actifs Leg.</th><th class="py-1.5 px-2 text-center">Actifs PDV</th><th class="py-1.5 px-2 text-center">Prospects</th><th class="py-1.5 px-2 text-center">Perdus 12-24m</th><th class="py-1.5 px-2 text-center">Inactifs</th><th class="py-1.5 px-2 text-center min-w-[90px]">% capté Leg.</th><th class="py-1.5 px-2 text-center min-w-[90px]">% capté PDV</th>';
  let html=`<div class="px-2 py-2"><table class="min-w-full text-[11px]"><thead class="s-hover t-primary font-bold"><tr>${headCols}</tr></thead><tbody>`;
  sectsArr.forEach((s,sIdx)=>{
    const base=s.total-s.prospects;
    const pctC=base>0?Math.round(s.actifsPDV/base*100):0;
    const pctL=base>0?Math.round(s.actifsLeg/base*100):0;
    const barColor=pctC>=50?'bg-emerald-500':pctC>=25?'bg-amber-500':'bg-red-500';
    const sEnc=encodeURIComponent(s.secteur);
    const rowId=`overviewL4-${dirEnc}-${mEnc}-${sIdx}`;
    html+=`<tr class="border-t border-violet-200 hover:i-info-bg cursor-pointer" onclick="_toggleOverviewL4('${dirEnc}','${mEnc}','${sEnc}','${rowId}')">
      <td class="py-1.5 px-2 font-semibold">${s.secteur} <span id="${rowId}-arrow" class="t-disabled text-[9px]">▼</span></td>
      <td class="py-1.5 px-2 t-secondary">${s.commercial}</td>
      <td class="py-1.5 px-2 text-center font-bold">${s.total}</td>
      <td class="py-1.5 px-2 text-center ${s.actifsLeg>0?'c-ok font-bold':'t-disabled'}">${s.actifsLeg||'—'}</td>
      <td class="py-1.5 px-2 text-center ${s.actifsPDV>0?'c-ok font-bold':'t-disabled'}">${s.actifsPDV||'—'}</td>
      <td class="py-1.5 px-2 text-center ${s.prospects>0?'c-action':'t-disabled'}">${s.prospects||'—'}</td>
      <td class="py-1.5 px-2 text-center ${s.perdus12_24>0?'c-caution font-bold':'t-disabled'}">${s.perdus12_24||'—'}</td>
      <td class="py-1.5 px-2 text-center ${s.inactifs>0?'t-secondary':'t-disabled'}">${s.inactifs||'—'}</td>
      <td class="py-1.5 px-2"><div class="flex items-center gap-1"><div class="flex-1 s-hover rounded-full h-1.5"><div class="cap-bar bg-blue-400" style="width:${pctL}%"></div></div><span class="text-[10px] w-7 text-right c-action">${pctL}%</span></div></td>
      <td class="py-1.5 px-2"><div class="flex items-center gap-1"><div class="flex-1 s-hover rounded-full h-1.5"><div class="cap-bar ${barColor}" style="width:${pctC}%"></div></div><span class="text-[10px] w-7 text-right">${pctC}%</span></div></td>
    </tr>
    <tr id="${rowId}" style="display:none"><td colspan="10" class="p-0 i-info-bg"><div id="${rowId}-inner" class="text-xs px-4 py-2">Chargement…</div></td></tr>`;
  });
  html+=`</tbody></table></div>`;
  el.innerHTML=html;
}
// Level 4: Clients for a Direction+Métier+Secteur
function _toggleOverviewL4(dirEnc,mEnc,sEnc,rowId){
  const row=document.getElementById(rowId);if(!row)return;
  const arrow=document.getElementById(rowId+'-arrow');
  const isOpen=row.style.display!=='none';
  row.style.display=isOpen?'none':'table-row';if(arrow)arrow.textContent=isOpen?'▼':'▲';
  if(!isOpen){const inner=document.getElementById(rowId+'-inner');if(inner)_renderOverviewL4(inner,decodeURIComponent(dirEnc),decodeURIComponent(mEnc),decodeURIComponent(sEnc));}
}
function _overviewClientSort(a,b){
  // Actifs globaux Inactifs PDV first, then Perdus récents FID Pot+, then rest
  const aGlobActif=_isGlobalActif(a),bGlobActif=_isGlobalActif(b);
  const aPDV=a._pdvActif,bPDV=b._pdvActif;
  // Priority: 1=global actif + PDV inactif, 2=perdu FID Pot+, 3=rest
  const aP=aGlobActif&&!aPDV?1:(_isPerdu(a)&&_normalizeClassif(a.classification).includes('Pot+')?2:3);
  const bP=bGlobActif&&!bPDV?1:(_isPerdu(b)&&_normalizeClassif(b.classification).includes('Pot+')?2:3);
  if(aP!==bP)return aP-bP;
  return(b.ca2025||0)-(a.ca2025||0);
}
function _renderOverviewL4(el,direction,metier,secteur,limit){
  limit=limit||20;
  const clients=[];
  for(const[cc,info] of _S.chalandiseData.entries()){
    if(!_clientPassesFilters(info,cc))continue;
    if(!_S._includePerdu24m&&_isPerdu24plus(info))continue;
    const dir=info.secteur?getSecteurDirection(info.secteur)||'Autre':'Autre';
    if(dir!==direction)continue;
    if((info.metier||'Autre')!==metier)continue;
    if((info.secteur||'—')!==secteur)continue;
    const pdvActif=_isPDVActif(cc);
    if(!_passesClientCrossFilter(cc))continue;
    clients.push({code:cc,nom:info.nom||'',statut:info.statut||'',classification:info.classification||'',commercial:info.commercial||'',ca2025:info.ca2025||0,caPDVN:info.caPDVN||0,ville:info.ville||'',_pdvActif:pdvActif});
  }
  clients.sort(_overviewClientSort);
  if(!clients.length){el.innerHTML='<div class="t-disabled text-xs py-2">Aucun client.</div>';return;}
  const show=clients.slice(0,limit),more=clients.length-limit;
  let html=`<div class="overflow-x-auto" style="max-height:340px;overflow-y:auto"><table class="min-w-full text-[10px]"><thead class="i-info-bg c-action font-bold sticky top-0"><tr><th class="py-1 px-2 text-left">Client</th><th class="py-1 px-2 text-left">Commercial</th><th class="py-1 px-2 text-center">Classif.</th><th class="py-1 px-2 text-right">CA Legallais</th><th class="py-1 px-2 text-right">CA Magasin Zone</th><th class="py-1 px-2 text-left">Ville</th></tr></thead><tbody>`;
  for(const c of show){
    const globActif=_isGlobalActif(c);const perdu=_isPerdu(c);
    const pdvBg=globActif&&!c._pdvActif?'i-caution-bg':perdu?'i-danger-bg':'';
    html+=`<tr class="border-t border-blue-100 ${pdvBg} cursor-pointer hover:i-info-bg" onclick="openClient360('${c.code}','reseau')">
      <td class="py-1 px-2"><span class="font-mono t-disabled text-[9px]">${c.code}</span>${_crossBadge(c.code)} <span class="font-semibold">${c.nom}</span>${_unikLink(c.code)}${_clientStatusBadge(c.code,c)}</td>
      <td class="py-1 px-2 text-[9px] t-tertiary">${c.commercial||'—'}</td>
      <td class="py-1 px-2 text-center">${_classifShort(c.classification)}</td>
      <td class="py-1 px-2 text-right font-bold ${c.ca2025>0?'c-caution':'t-disabled'}">${c.ca2025>0?formatEuro(c.ca2025):'—'}</td>
      <td class="py-1 px-2 text-right font-bold ${c.caPDVN>0?'c-ok':'t-disabled'}">${c.caPDVN>0?formatEuro(c.caPDVN):'—'}</td>
      <td class="py-1 px-2 text-[9px] t-tertiary">${c.ville||'—'}</td>
    </tr>`;
  }
  html+=`</tbody></table></div>`;
  if(more>0)html+=`<button class="mt-1 mb-1 ml-2 text-[10px] font-bold c-action hover:underline" onclick="_renderOverviewL4(this.parentElement,decodeURIComponent('${encodeURIComponent(direction)}'),decodeURIComponent('${encodeURIComponent(metier)}'),decodeURIComponent('${encodeURIComponent(secteur)}'),${limit+50})">▼ Voir plus (${more} restants)</button>`;
  el.innerHTML=html;
}
// Client article expand panel (used in L4 and cockpit)
function _toggleClientArticles(row,clientCode){
  const nextRow=row.nextElementSibling;
  if(nextRow&&nextRow.classList.contains('client-art-panel')){nextRow.remove();return;}
  // [Adapter Étape 5] — territoireLines / finalData / ventesClientArticle : canal-invariants
  const hasTerr=_S.territoireReady&&DataStore.territoireLines.length>0;
  const stockMap=new Map(DataStore.finalData.map(r=>[r.code,r]));
  // Section 1 : achats comptoir (DataStore.ventesClientArticle — MAGASIN/myStore only)
  const artData=DataStore.ventesClientArticle.get(clientCode);
  let comptoirArts=[];
  if(artData&&artData.size>0){
    comptoirArts=[...artData.entries()].sort((a,b)=>b[1].sumPrelevee-a[1].sumPrelevee).slice(0,20).map(([code,d])=>{
      const si=stockMap.get(code);
      return{code,libelle:si?si.libelle:_S.libelleLookup[code]||code,qty:d.sumPrelevee,ca:d.sumCA,rayonStatus:si?(si.stockActuel>0?'green':'yellow'):'red'};
    });
  }
  // Section 2 : achats hors comptoir (DataStore.territoireLines — tous canaux BL omnicanal)
  let terrArts=[];
  if(hasTerr){
    const artMap={};
    for(const l of DataStore.territoireLines){
      if(l.clientCode===clientCode){
        if(!artMap[l.code])artMap[l.code]={code:l.code,libelle:l.libelle,famille:l.famille||'',ca:0,canals:new Set(),rayonStatus:l.rayonStatus};
        artMap[l.code].ca+=l.ca;
        if(l.canal)artMap[l.code].canals.add(l.canal);
      }
    }
    terrArts=Object.values(artMap).sort((a,b)=>b.ca-a.ca).slice(0,20);
  }
  const hasComptoir=comptoirArts.length>0;
  const hasTerrArts=terrArts.length>0;
  let panelHtml=`<td colspan="9" class="p-0"><div class="s-card-alt border-t-2 border-sky-300 px-4 py-2">`;
  if(!hasComptoir&&!hasTerrArts){
    const _cInfo=_S.chalandiseData.get(clientCode);const _ca25=(_cInfo&&_cInfo.ca2025)||0;
    panelHtml+=_ca25>0?`<p class="text-[10px] c-action font-semibold">Ce client achète chez Legallais (${formatEuro(_ca25)}) via d'autres canaux (Internet, DCS, Commercial) — opportunité de captation PDV</p>`:`<p class="t-disabled text-[10px]">Prospect — aucun historique d'achat.</p>`;
  }else{
    if(hasComptoir){
      const nbInRayon=comptoirArts.filter(a=>a.rayonStatus==='green').length;
      const nbAbsent=comptoirArts.filter(a=>a.rayonStatus==='red').length;
      panelHtml+=`<p class="text-[10px] font-bold t-primary mb-1">🏪 Achats comptoir : ${comptoirArts.length} réf. dont ${nbInRayon} en rayon, ${nbAbsent} absentes${nbAbsent>0?' — référencez ces '+nbAbsent+' articles pour le capter':''}</p>`;
      panelHtml+=`<table class="min-w-full text-[10px]${hasTerrArts?' mb-3':''}"><thead class="s-hover t-primary"><tr><th class="py-1 px-2 text-left">Code</th><th class="py-1 px-2 text-left">Libellé</th><th class="py-1 px-2 text-center">Qté</th><th class="py-1 px-2 text-right">CA</th><th class="py-1 px-2 text-center">En rayon</th><th class="py-1 px-2 text-right">Stock</th></tr></thead><tbody>`;
      for(const a of comptoirArts){
        const si=stockMap.get(a.code);const st=si?si.stockActuel:'—';
        const ri=a.rayonStatus==='green'?'✅ En rayon':a.rayonStatus==='yellow'?'⚠️ Rupture':'❌ Absent';
        const bg=a.rayonStatus==='red'?'i-danger-bg':a.rayonStatus==='yellow'?'i-caution-bg':'';
        panelHtml+=`<tr class="border-t b-light ${bg}"><td class="py-0.5 px-2 font-mono">${a.code}</td><td class="py-0.5 px-2 max-w-[180px] truncate">${a.libelle}</td><td class="py-0.5 px-2 text-center">${a.qty}</td><td class="py-0.5 px-2 text-right font-bold">${formatEuro(a.ca)}</td><td class="py-0.5 px-2 text-center">${ri}</td><td class="py-0.5 px-2 text-right">${st}</td></tr>`;
      }
      panelHtml+=`</tbody></table>`;
    }
    if(hasTerrArts){
      const totalCA=terrArts.reduce((s,a)=>s+a.ca,0);
      panelHtml+=`<p class="text-[10px] font-bold t-primary mb-1${hasComptoir?' mt-2':''}">📦 Ce client achète chez Legallais (hors votre comptoir) — ${terrArts.length} réf. · ${formatEuro(totalCA)} CA</p>`;
      panelHtml+=`<table class="min-w-full text-[10px]"><thead class="s-hover t-primary"><tr><th class="py-1 px-2 text-left">Code</th><th class="py-1 px-2 text-left">Libellé</th><th class="py-1 px-2 text-left">Famille</th><th class="py-1 px-2 text-right">CA</th><th class="py-1 px-2 text-center">Canal</th></tr></thead><tbody>`;
      for(const a of terrArts){
        const canalStr=[...a.canals].join(' / ')||'—';
        panelHtml+=`<tr class="border-t b-light"><td class="py-0.5 px-2 font-mono">${a.code}</td><td class="py-0.5 px-2 max-w-[180px] truncate">${a.libelle}</td><td class="py-0.5 px-2 t-tertiary max-w-[120px] truncate">${famLib(a.famille)}</td><td class="py-0.5 px-2 text-right font-bold c-action">${formatEuro(a.ca)}</td><td class="py-0.5 px-2 text-center t-tertiary">${canalStr}</td></tr>`;
      }
      panelHtml+=`</tbody></table>`;
    }
  }
  panelHtml+=`</div></td>`;
  const tr=document.createElement('tr');tr.className='client-art-panel';tr.innerHTML=panelHtml;
  row.insertAdjacentElement('afterend',tr);
}
function _cockpitToggleFullList(id){
  const el=document.getElementById(id);if(!el)return;
  const hidden=el.style.display==='none'||!el.style.display;
  el.style.display=hidden?'block':'none';
  const btn=document.getElementById(id+'-btn');if(btn)btn.textContent=hidden?'▲ Masquer la liste complète':'▼ Voir tous les clients →';
}
function _cockpitToggleSection(listId){
  const body=document.getElementById(listId+'-body');const arrow=document.getElementById(listId+'-arrow');if(!body)return;
  const isOpen=body.style.display!=='none';body.style.display=isOpen?'none':'';if(arrow)arrow.textContent=isOpen?'▶':'▼';
}
function _populateTerrFamilleFilter(){
  const sel=document.getElementById('terrFamilleFilter');if(!sel||!DataStore.finalData.length)return;
  const fams=[...new Set(DataStore.finalData.map(r=>r.famille).filter(Boolean))].sort((a,b)=>famLib(a).localeCompare(famLib(b)));
  const cur=sel.value;
  sel.innerHTML='<option value="">Toutes familles</option>';
  fams.forEach(f=>{const o=document.createElement('option');o.value=f;o.textContent=famLabel(f);sel.appendChild(o);});
  if(cur)sel.value=cur;
}

function _setPDVCanalFilter(val){_S.pdvCanalFilter=val;_buildDegradedCockpit();}

function _buildDegradedCockpit(){
  const el=document.getElementById('terrDegradedBlock');if(!el)return;
  if(!DataStore.finalData.length && !_S.ventesClientArticle.size)return;
  _populateTerrFamilleFilter();
  const qClient=((document.getElementById('terrClientSearch')||{}).value||'').toLowerCase().trim();
  const selFam=((document.getElementById('terrFamilleFilter')||{}).value||'').trim();
  const _today=new Date();
  const famMap=new Map(DataStore.finalData.map(r=>[r.code,r.famille]));
  // [V3.2] Canal + commercial depuis DataStore.byContext() — API unifiée
  const {activeFilters:{canal:_terrCanalFilter,commercial:_terrComFilter}}=DataStore.byContext();
  const _terrComSet=_terrComFilter?(_S.clientsByCommercial.get(_terrComFilter)||new Set()):null;
  const _isNonMagasin=_terrCanalFilter&&_terrCanalFilter!=='MAGASIN';
  let _clientArtMap;
  if(_isNonMagasin){
    // Canaux hors MAGASIN : utiliser ventesClientHorsMagasin directement (v.sumCA = total non-MAGASIN)
    // Ne pas filtrer par articleCanalCA — ce filtre pouvait vider _clientArtMap si articleCanalCA
    // n'était pas peuplé (ex. lignes sans N° commande), ce qui faisait disparaître tout le bloc.
    _clientArtMap=new Map();
    for(const[cc,artMap] of _S.ventesClientHorsMagasin.entries()){
      const filtered=new Map();
      for(const[artCode,v] of artMap.entries()){
        if(v.sumCA>0)filtered.set(artCode,{sumCA:v.sumCA,sumCAPrelevee:v.sumCAPrelevee||0,sumCAAll:v.sumCA,sumPrelevee:v.sumPrelevee||0,countBL:v.countBL||0});
      }
      if(filtered.size>0)_clientArtMap.set(cc,filtered);
    }
  }else{
    _clientArtMap=DataStore.ventesClientArticle;
  }
  // Silencieux >30j — MAGASIN uniquement (clientLastOrder est MAGASIN-based)
  const silencieux=[];
  if(!_isNonMagasin){
    const _minC2=_S.consommePeriodMinFull||_S.consommePeriodMin;
    for(const[cc,lastDate] of _S.clientLastOrder.entries()){
      if(_minC2&&lastDate<_minC2)continue;
      const d=daysBetween(lastDate,_today);if(d<=30||d>60)continue;
      const artMap=_clientArtMap.get(cc);if(!artMap)continue;
      let ca=0;for(const[artCode,v] of artMap.entries())if(!selFam||famMap.get(artCode)===selFam)ca+=(v.sumCAAll||v.sumCA||0);
      if(ca<=0)continue;
      const nom=_S.clientNomLookup[cc]||cc;
      if(qClient&&!matchQuery(qClient,cc,nom))continue;
      silencieux.push({cc,nom,ca,d});
    }
    silencieux.sort((a,b)=>a.d-b.d);
  }
  const hasChal=_S.chalandiseReady;
  const banner=`<div class="mb-3 p-3 i-caution-bg border b-light rounded-lg text-xs c-caution">💡 <strong>Chargez la Zone de Chalandise</strong> pour débloquer l'analyse métier, la captation et les prospects.</div>`;
  let html=hasChal?'':banner;
  if(!hasChal&&silencieux.length){
    const rows=silencieux.slice(0,20).map(c=>{const cls=c.d>45?'c-danger':'c-caution';return`<tr class="border-t b-light"><td class="py-1 px-2 font-mono text-[10px] t-disabled">${c.cc}</td><td class="py-1 px-2 text-[11px] font-semibold">${c.nom}${_unikLink(c.cc)}</td><td class="py-1 px-2 text-right font-bold c-ok text-[11px]">${formatEuro(c.ca)}</td><td class="py-1 px-2 text-center font-bold text-[11px] ${cls}">${c.d}j</td></tr>`;}).join('');
    html+=`<div class="i-danger-bg rounded-xl border-t-4 border-rose-500 mb-3 overflow-hidden"><div class="flex items-center gap-2 p-3 border-b b-light"><span>🚨</span><h4 class="font-extrabold text-sm flex-1">Clients silencieux <span class="badge bg-rose-500 text-white ml-1">${silencieux.length}</span></h4></div><div class="overflow-x-auto"><table class="min-w-full text-xs"><thead class="s-card-alt t-secondary font-bold text-[10px]"><tr><th class="py-1.5 px-2 text-left">Code</th><th class="py-1.5 px-2 text-left">Nom</th><th class="py-1.5 px-2 text-right">CA Magasin</th><th class="py-1.5 px-2 text-center">Sans commande</th></tr></thead><tbody>${rows}</tbody></table>${silencieux.length>20?`<p class="text-[10px] t-disabled px-3 py-1.5">… et ${silencieux.length-20} autres</p>`:''}</div></div>`;
  }
  if(!hasChal&&!silencieux.length)html+=`<p class="text-center t-disabled text-sm py-8">Aucun client trouvé${qClient?' pour "'+qClient+'"':''}.</p>`;
  el.innerHTML=html;
}

function _buildCockpitClient(){
  const el=document.getElementById('terrCockpitClient');if(!el)return;
  const silEl=document.getElementById('terrSilencieux');
  const perduEl=document.getElementById('terrPerdus');
  const capEl=document.getElementById('terrACapter');
  if(!_S.chalandiseReady){el.classList.add('hidden');if(silEl)silEl.innerHTML='';if(perduEl)perduEl.innerHTML='';if(capEl)capEl.innerHTML='';return;}
  el.classList.remove('hidden');
  // ── Collect 3 categories from chalandise ──
  const silencieux=[],perdus=[],jamaisVenus=[];
  const _today=new Date();
  const {activeFilters:{commercial:_cockpitCom}}=DataStore.byContext();
  const _cockpitComSet=_cockpitCom?(_S.clientsByCommercial.get(_cockpitCom)||new Set()):null;
  // ── Canal-aware date source ──
  const _canal=_S._globalCanal||'';
  const _useByCanal=_canal&&_canal!=='MAGASIN'; // specific non-MAGASIN canal
  const _useMagOnly=_canal==='MAGASIN';
  // _useByCanal=false & _useMagOnly=false → '' (Tous) → clientLastOrderAll
  for(const[cc,info] of _S.chalandiseData.entries()){
    if(!_clientPassesFilters(info,cc))continue;
    if(!_S._includePerdu24m&&_isPerdu24plus(info))continue;
    if(!_passesClientCrossFilter(cc))continue;
    if(_S.excludedClients.has(cc))continue;
    if(_cockpitComSet&&!_cockpitComSet.has(cc))continue;
    if(!_passesAllFilters(cc))continue;
    const clientArtData=(_S.ventesClientArticleFull.size?_S.ventesClientArticleFull:_S.ventesClientArticle).get(cc);
    const caPDVN=clientArtData?[...clientArtData.values()].reduce((s,d)=>s+(d.sumCAAll||d.sumCA||0),0):0;
    // Pick last order date based on canal filter
    let lastOrder=null;
    if(_useMagOnly){
      lastOrder=_S.clientLastOrder.get(cc)||null;
    }else if(_useByCanal){
      const cMap=_S.clientLastOrderByCanal.get(cc);
      lastOrder=cMap?cMap.get(_canal)||null:null;
    }else{
      const allInfo=_S.clientLastOrderAll.get(cc);
      lastOrder=allInfo?allInfo.date:null;
    }
    const _minC3=_S.consommePeriodMinFull||_S.consommePeriodMin;
    const _lastOrderValid=lastOrder&&(!_minC3||lastOrder>=_minC3);
    const daysSince=_lastOrderValid?daysBetween(lastOrder,_today):null;
    const caLeg=info.ca2025||0;
    const c={code:cc,nom:info.nom||'',metier:info.metier||'',commercial:info.commercial||'',classification:info.classification||'',ca2025:caLeg,caPDVN,ville:info.ville||'',_strat:_isMetierStrategique(info.metier),_daysSince:daysSince,_lastOrderDate:lastOrder};
    // 1. Silencieux : 30-60j sans commande sur le canal filtré
    if(daysSince!==null&&daysSince>30&&daysSince<=60&&(caPDVN>0||_useByCanal)){silencieux.push(c);continue;}
    // 2. Perdus : >60j sans commande sur le canal filtré
    if(daysSince!==null&&daysSince>60&&(caPDVN>0||_useByCanal)){perdus.push(c);continue;}
    // 3. Jamais venus en PDV : client zone non capté (absent de clientsMagasin)
    if(!_useByCanal&&!_S.clientsMagasin.has(cc)){jamaisVenus.push(c);}
  }
  silencieux.sort((a,b)=>(b.caPDVN||0)-(a.caPDVN||0));
  perdus.sort((a,b)=>(a._daysSince||0)-(b._daysSince||0)||(b.caPDVN||0)-(a.caPDVN||0));
  jamaisVenus.sort((a,b)=>(b.ca2025||0)-(a.ca2025||0));
  _S._cockpitExportData={silencieux,perdus,jamaisVenus};
  // ── Helpers ──
  const filterActive=_S._selectedDepts.size||_S._selectedClassifs.size||_S._selectedStatuts.size||_S._selectedActivitesPDV.size||_S._selectedDirections.size||_S._selectedUnivers.size||_S._selectedCommercial||_S._selectedMetier||_S._filterStrategiqueOnly;
  const emptyMsg=filterActive?'Aucun client ne correspond aux filtres':'Aucun client dans cette catégorie';
  function _clientCard(c,reason,scoreColor){
    const caLeg=c.ca2025>0?formatEuro(c.ca2025):'—';
    const horsMag=_S.ventesClientHorsMagasin.get(c.code);
    const _icones=[horsMag?.size>0?'🌐':'',c._strat?'⭐':''].filter(Boolean).join(' ');
    const lastOrderFmt=c._lastOrderDate?`Dernière commande : ${fmtDate(c._lastOrderDate)}`:'';
    const daysBadge=c._daysSince>30?`<span class="text-[9px] font-bold px-1.5 py-0.5 rounded-full i-danger-bg c-danger">⏰ ${c._daysSince}j</span>`:'';
    return`<div class="relative p-3 rounded-lg border s-card hover:i-info-bg cursor-pointer" data-cc="${escapeHtml(c.code)}" onclick="openClient360(this.dataset.cc,'cockpit')"><div><div class="flex items-center flex-wrap gap-1.5"><span class="font-bold text-sm">${escapeHtml(c.nom)}</span><span class="font-bold text-[11px] t-inverse-muted">${caLeg}</span>${daysBadge}${_icones?`<span class="text-[11px]">${_icones}</span>`:''}</div><p class="text-[11px] ${scoreColor} font-bold mt-1">→ ${escapeHtml(reason)}</p><p class="text-[10px] t-tertiary mt-1">${[lastOrderFmt,c.commercial?`Commercial : ${escapeHtml(c.commercial)}`:''].filter(Boolean).join(' · ')}</p></div></div>`;
  }
  function _fullTable(clients,caField,listId){
    const usePDV=caField==='caPDVN';
    let t=`<div id="${listId}" style="display:none" class="mt-3 overflow-x-auto"><table class="min-w-full text-[11px]"><thead class="sticky top-0 s-card/90 font-bold t-secondary text-[10px]"><tr><th class="py-1.5 px-2 text-left">Client</th><th class="py-1.5 px-2 text-left">Commercial</th><th class="py-1.5 px-2 text-right">${usePDV?'CA Magasin':'CA Legallais'}</th><th class="py-1.5 px-2 text-left">Ville</th></tr></thead><tbody>`;
    for(const c of clients){const caVal=usePDV?c.caPDVN:c.ca2025;const caColor=caVal>0?(usePDV?'c-ok':'c-caution'):'t-disabled';t+=`<tr class="border-t b-default hover:s-card/50 cursor-pointer" data-cc="${escapeHtml(c.code)}" onclick="openClient360(this.dataset.cc,'cockpit')"><td class="py-1 px-2"><span class="font-mono t-disabled text-[10px]">${escapeHtml(c.code)}</span> <span class="font-semibold">${escapeHtml(c.nom)}</span>${c._strat?' <span class="c-caution text-[10px]" title="Métier stratégique">⭐</span>':''}</td><td class="py-1 px-2 text-[10px] t-tertiary">${c.commercial?escapeHtml(c.commercial):'—'}</td><td class="py-1 px-2 text-right font-bold ${caColor}">${caVal>0?formatEuro(caVal):'—'}</td><td class="py-1 px-2 text-[10px] t-tertiary">${c.ville?escapeHtml(c.ville):'—'}</td></tr>`;}
    t+=`</tbody></table></div>`;return t;
  }
  function renderBlock(title,emoji,bgColor,borderColor,scoreColor,clients,caField,raisonFn,listId,topN=10){
    const total=clients.length;
    const isOpen=listId==='cockpit-sil-full';
    const arrow=isOpen?'▼':'▶';
    const bodyDisplay=isOpen?'':'display:none';
    if(!total)return`<div class="${bgColor} rounded-xl border-t-4 ${borderColor}"><div class="flex items-center gap-2 p-4 pb-3 cursor-pointer select-none" onclick="_cockpitToggleSection('${listId}')"><span id="${listId}-arrow" class="text-[10px] t-disabled w-3">${arrow}</span><span class="text-lg">${emoji}</span><h4 class="font-extrabold text-sm">${title}</h4><span class="badge s-hover t-secondary">0</span></div><div id="${listId}-body" style="${bodyDisplay}"><p class="text-xs t-disabled px-4 pb-4">${emptyMsg}</p></div></div>`;
    let html=`<div class="${bgColor} rounded-xl border-t-4 ${borderColor}">`;
    html+=`<div class="flex items-center gap-2 p-4 pb-1 flex-wrap cursor-pointer select-none" onclick="_cockpitToggleSection('${listId}')"><span id="${listId}-arrow" class="text-[10px] t-disabled w-3">${arrow}</span><span class="text-lg">${emoji}</span><h4 class="font-extrabold text-sm">${title}</h4><span class="badge ${borderColor.replace('border-','bg-')} text-white">${total}</span><button onclick="event.stopPropagation();exportCockpitCSV('${listId}')" class="ml-auto text-[10px] s-hover hover:s-hover t-primary py-1 px-2 rounded font-bold border">📥 CSV</button></div>`;
    html+=`<div id="${listId}-body" style="${bodyDisplay}">`;
    html+=`<div class="space-y-2 px-4 py-3">`;
    for(const c of clients.slice(0,topN))html+=_clientCard(c,raisonFn(c),scoreColor);
    html+=`</div>`;
    if(total>topN){html+=`<div class="px-4 pb-2"><button id="${listId}-btn" class="mt-3 text-[11px] font-bold c-action hover:underline" onclick="_cockpitToggleFullList('${listId}')">▼ Voir tous les ${total} clients →</button></div>`;html+=_fullTable(clients,caField,listId);}
    html+=`</div></div>`;
    return html;
  }
  // ── Reason functions (canal-aware labels) ──
  const _canalLabel=_useMagOnly?'Magasin':_useByCanal?_canal:'tous canaux';
  function _silRaison(c){
    const caPDVFmt=c.caPDVN>0?formatEuro(c.caPDVN):'—';
    return c._daysSince>45?`Silencieux depuis ${c._daysSince}j — à relancer rapidement (${caPDVFmt} CA Magasin)`:`${c._daysSince}j sans commande — à surveiller (${caPDVFmt} CA Magasin)`;
  }
  function _perduRaison(c){return`${c._daysSince}j sans commande ${_canalLabel} — ${c.caPDVN>0?formatEuro(c.caPDVN)+' de CA historique':'ancien client à reconquérir'}`;}
  function _capRaison(c){return c.ca2025>0?`CA Legallais ${formatEuro(c.ca2025)} — jamais passé au comptoir`:`Client zone — jamais passé au comptoir`;}
  // ── Render into 3 separate blocks ──
  const _silTitle=`⏰ Silencieux — 30 à 60 jours sans commande ${_canalLabel}`;
  const _perduTitle=`🔴 Perdus — Plus de 60 jours sans commande ${_canalLabel}`;
  if(silEl)silEl.innerHTML=renderBlock(_silTitle,'⏰','i-caution-bg','border-amber-500','c-caution',silencieux,'caPDVN',_silRaison,'cockpit-sil-full');
  if(perduEl)perduEl.innerHTML=renderBlock(_perduTitle,'🔴','i-danger-bg','border-rose-500','c-danger',perdus,'caPDVN',_perduRaison,'cockpit-perdu-full');
  if(capEl){if(_useByCanal){capEl.innerHTML='';}else{capEl.innerHTML=renderBlock('🎯 À capter — Jamais venus en agence','🎯','i-info-bg','border-blue-500','c-action',jamaisVenus,'ca2025',_capRaison,'cockpit-cap-full');}}
  // terrCockpitClient now unused as wrapper — hide it
  el.classList.add('hidden');
}
function exportTop5CSV(){
  const top5=_S._top5Semaine||[];
  if(!top5.length){showToast('Aucun client dans le top 5','warning');return;}
  const SEP=';';
  const lines=['\uFEFFNom;CA Legallais;Dernière commande;Action;Commercial'];
  for(const c of top5){const lastFmt=c._lastOrderDate?fmtDate(c._lastOrderDate):'—';lines.push([c.nom,c.ca2025>0?c.ca2025:'—',lastFmt,c._top5reason,c.commercial||'—'].join(SEP));}
  const blob=new Blob([lines.join('\n')],{type:'text/csv;charset=utf-8;'});
  const link=document.createElement('a');link.href=URL.createObjectURL(blob);link.download=`PRISME_MaSemaine_${_S.selectedMyStore}_${new Date().toISOString().slice(0,10)}.csv`;document.body.appendChild(link);link.click();document.body.removeChild(link);
}
function _setCrossFilter(status){
  _S._selectedCrossStatus=status;
  _buildChalandiseOverview();
}

function _setClientView(view){
  _S._clientView=view;
  _S._showHorsZone=(view==='horszone');
  _S._showHorsAgence=(view==='multicanaux');
  _S._selectedCrossStatus=view==='potentiels'?'potentiel':view==='captes'?'capte':'';
  _S._clientsPDVPage=0;
  document.querySelectorAll('.client-view-btn').forEach(b=>{
    const active=b.dataset.view===view;
    b.classList.toggle('s-panel-inner',active);b.classList.toggle('t-inverse',active);b.classList.toggle('b-dark',active);
    b.classList.toggle('s-card',!active);b.classList.toggle('t-primary',!active);b.classList.toggle('b-default',!active);
  });
  // Capturer l'état ouvert/fermé du panneau Top PDV avant re-render
  const _det=document.querySelector('#terrTopPDV details');
  if(_det)_S._topPDVOpen=_det.open;
  _S._tabRendered&&(_S._tabRendered['territoire']=false);
  window.renderTerritoireTab();
}


// ── Cockpit Client CSV Export ──
function _cockpitRowCSV(cat,c,exclu,exclusionReason){
  const SEP=';';
  const caLeg=c.ca2025>0?c.ca2025.toFixed(2).replace('.',','):'—';
  const caPDV=c.caPDVN>0?c.caPDVN.toFixed(2).replace('.',','):'—';
  const dernCmd=c._lastOrderDate?c._lastOrderDate.toLocaleDateString('fr-FR'):'—';
  const jours=c._daysSince!=null?c._daysSince:'—';
  const statut=_clientStatusText(c.code,c);
  const raison=(c._reason||'').replace(/"/g,'""');
  return[cat,c.code,`"${(c.nom||'').replace(/"/g,'""')}"`,statut,`"${_normalizeClassif(c.classification)}"`,`"${(c.metier||'').replace(/"/g,'""')}"`,`"${(c.commercial||'').replace(/"/g,'""')}"`,`"${(c.ville||'').replace(/"/g,'""')}"`,caLeg,caPDV,dernCmd,jours,c._score,`"${raison}"`,exclu||'Non',`"${(exclusionReason||'').replace(/"/g,'""')}"`].join(SEP);
}
function _downloadCockpitCSV(rows,filename,label){
  const header='\uFEFFCatégorie;Code;Nom;Statut;Classification;Métier;Commercial;Ville;CA Legallais;CA Magasin;Dernière commande;Jours sans commande;Score;Raison;Exclu;Raison exclusion';
  const blob=new Blob([[header,...rows].join('\n')],{type:'text/csv;charset=utf-8;'});
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=filename;document.body.appendChild(a);a.click();document.body.removeChild(a);URL.revokeObjectURL(a.href);
  showToast(`📥 CSV ${label} — ${rows.length} clients`,'success');
}
function exportCockpitCSV(catKey){
  if(!_S._cockpitExportData){showToast('⚠️ Aucune donnée cockpit','warning');return;}
  const map={'cockpit-sil-full':['Silencieux',_S._cockpitExportData.silencieux],'cockpit-perdu-full':['Perdus',_S._cockpitExportData.perdus],'cockpit-cap-full':['À capter',_S._cockpitExportData.jamaisVenus]};
  const entry=map[catKey];if(!entry)return;
  const[catLabel,clients]=entry;
  const rows=clients.map(c=>_cockpitRowCSV(catLabel,c,'Non',''));
  // Include excluded clients for this category
  for(const[cc,v] of _S.excludedClients.entries()){if(v.category===catKey&&v.clientData)rows.push(_cockpitRowCSV(catLabel,v.clientData,'Oui',v.reason));}
  const date=new Date().toISOString().slice(0,10);
  _downloadCockpitCSV(rows,`PRISME_${_S.selectedMyStore||'AGENCE'}_Clients_${catLabel}_${date}.csv`,catLabel);
}
function exportCockpitCSVAll(){
  if(!_S._cockpitExportData){showToast('⚠️ Aucune donnée cockpit','warning');return;}
  const catMap={'cockpit-sil-full':['Silencieux',_S._cockpitExportData.silencieux],'cockpit-perdu-full':['Perdus',_S._cockpitExportData.perdus],'cockpit-cap-full':['À capter',_S._cockpitExportData.jamaisVenus]};
  const rows=[];
  for(const[catKey,[catLabel,list]] of Object.entries(catMap)){for(const c of list)rows.push(_cockpitRowCSV(catLabel,c,'Non',''));for(const[cc,v] of _S.excludedClients.entries()){if(v.category===catKey&&v.clientData)rows.push(_cockpitRowCSV(catLabel,v.clientData,'Oui',v.reason));}}
  const date=new Date().toISOString().slice(0,10);
  _downloadCockpitCSV(rows,`PRISME_${_S.selectedMyStore||'AGENCE'}_Clients_${date}.csv`,'Toutes catégories');
}

// ── Client exclusion (hide from cockpit) ──
function _showExcludePrompt(cc,encodedNom,catKey){
  const card=document.getElementById('cockpit-card-'+cc);if(!card)return;
  const existing=card.querySelector('.excl-prompt');if(existing){existing.remove();return;}
  const nom=decodeURIComponent(encodedNom);
  const div=document.createElement('div');div.className='excl-prompt mt-2 pt-2 border-t b-default flex items-center gap-2 flex-wrap';
  div.innerHTML=`<span class="text-[10px] t-tertiary">Raison :</span><select id="excl-sel-${cc}" class="text-[10px] border rounded p-1"><option value="Pas pertinent">Pas pertinent</option><option value="Hors cible">Hors cible</option><option value="Déjà traité">Déjà traité</option><option value="Autre">Autre</option></select><button onclick="_confirmExclude('${cc}','${encodeURIComponent(nom)}','${catKey}')" class="text-[10px] i-danger-bg c-danger px-2 py-1 rounded font-bold">Masquer</button><button onclick="this.closest('.excl-prompt').remove()" class="text-[10px] t-disabled hover:t-secondary px-1">Annuler</button>`;
  card.appendChild(div);
}
function _confirmExclude(cc,encodedNom,catKey){
  const nom=decodeURIComponent(encodedNom);
  const sel=document.getElementById('excl-sel-'+cc);const reason=sel?sel.value:'Pas pertinent';
  const allClients=[...(_S._cockpitExportData?.silencieux||[]),...(_S._cockpitExportData?.urgences||[]),...(_S._cockpitExportData?.developper||[]),...(_S._cockpitExportData?.fideliser||[])];
  const clientData=allClients.find(c=>c.code===cc)||{code:cc,nom};
  _S.excludedClients.set(cc,{reason,date:formatLocalYMD(new Date()),by:_S.selectedMyStore||'',category:catKey,nom,clientData});
  _saveExclusions();
  showToast(`👁️ ${nom} masqué — ${reason}`,'info');
  _buildCockpitClient();
}
function _unexcludeClient(cc){
  _S.excludedClients.delete(cc);
  _saveExclusions();
  _buildCockpitClient();
}
function _unexcludeAll(catKey){
  for(const[cc,v] of _S.excludedClients.entries()){if(v.category===catKey)_S.excludedClients.delete(cc);}
  _saveExclusions();
  _buildCockpitClient();
}
function _toggleExcludedList(id){
  const el=document.getElementById(id);if(!el)return;
  el.style.display=el.style.display==='none'?'block':'none';
}
function exportExclusionsJSON(){
  if(!_S.excludedClients.size){showToast('Aucune exclusion à exporter','info');return;}
  const data={magasin:_S.selectedMyStore||'AGENCE',date:new Date().toISOString().slice(0,10),exclusions:[..._S.excludedClients.entries()].map(([cc,v])=>({code:cc,nom:v.nom||cc,reason:v.reason,date:v.date,category:v.category}))};
  const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`PRISME_${data.magasin}_exclusions.json`;document.body.appendChild(a);a.click();document.body.removeChild(a);URL.revokeObjectURL(a.href);
  showToast(`📤 ${data.exclusions.length} exclusions exportées`,'success');
}
function importExclusionsJSON(input){
  const file=input.files[0];if(!file)return;
  const reader=new FileReader();
  reader.onload=(e)=>{
    try{
      const data=JSON.parse(e.target.result);
      if(!data.exclusions||!Array.isArray(data.exclusions))throw new Error('Format invalide');
      let count=0;
      const allClients=[...(_S._cockpitExportData?.silencieux||[]),...(_S._cockpitExportData?.urgences||[]),...(_S._cockpitExportData?.developper||[]),...(_S._cockpitExportData?.fideliser||[])];
      for(const ex of data.exclusions){
        if(!ex.code)continue;
        const clientData=allClients.find(c=>c.code===ex.code)||{code:ex.code,nom:ex.nom||ex.code};
        _S.excludedClients.set(ex.code,{reason:ex.reason||'Importé',date:ex.date||'',by:ex.by||'',category:ex.category||'cockpit-urg-full',nom:ex.nom||ex.code,clientData});
        count++;
      }
      input.value='';
      _saveExclusions();
      showToast(`✅ ${count} exclusions importées`,'success');
      _buildCockpitClient();
    }catch(err){showToast('⚠️ Erreur import : '+err.message,'error');}
  };
  reader.readAsText(file);
}

function _toggleHorsMagasin(btn, cc) {
  const existingId = `hors-mag-${cc}`;
  const existing = document.getElementById(existingId);
  if (existing) { existing.remove(); return; }

  const artMap = _S.ventesClientHorsMagasin.get(cc);
  if (!artMap || !artMap.size) return;

  const CANAL_LABELS = { INTERNET:'🌐 Web', REPRESENTANT:'🤝 Représentant', DCS:'🏢 DCS' };

  // Filtrer articles déjà vendus en MAGASIN à ce client
  const magasinArts = DataStore.ventesClientArticle.get(cc) || new Map();

  let rows = '';
  for (const [code, data] of [...artMap.entries()].sort((a,b) => b[1].sumCA - a[1].sumCA)) {
    const lib = (_S.libelleLookup[code] || code).replace(/^\d{6} - /, '');
    const dejaVendu = magasinArts.has(code);
    const canalLabel = CANAL_LABELS[data.canal] || data.canal;
    rows += `<tr class="border-b b-light ${dejaVendu ? 'opacity-50' : 'hover:i-info-bg'}">
      <td class="py-1 px-2 font-mono text-[10px] t-tertiary">${code}</td>
      <td class="py-1 px-2 text-[11px] font-semibold">${lib}</td>
      <td class="py-1 px-2 text-[10px]">${canalLabel}</td>
      <td class="py-1 px-2 text-right text-[11px] font-bold ${data.sumCA > 0 ? 'c-action' : 't-disabled'}">${data.sumCA > 0 ? formatEuro(data.sumCA) : '—'}</td>
      <td class="py-1 px-2 text-center text-[10px] ${dejaVendu ? 'c-ok' : 'c-caution'}">${dejaVendu ? '✅ En agence' : '⚠️ Pas en agence'}</td>
    </tr>`;
  }

  const panel = document.createElement('div');
  panel.id = existingId;
  panel.className = 'mt-2 s-card-alt rounded-lg border overflow-hidden';
  panel.innerHTML = `
    <div class="px-3 py-2 border-b flex items-center justify-between">
      <p class="text-[11px] font-bold t-primary">🌐 Commandes hors agence — ${artMap.size} article${artMap.size > 1 ? 's' : ''}</p>
      <span class="text-[10px] t-disabled">⚠️ = jamais vendu en comptoir · ✅ = aussi en agence</span>
    </div>
    <div class="overflow-x-auto">
      <table class="min-w-full text-xs">
        <thead class="s-panel-inner t-inverse font-bold">
          <tr>
            <th class="py-1 px-2 text-left">Code</th>
            <th class="py-1 px-2 text-left">Article</th>
            <th class="py-1 px-2 text-left">Canal</th>
            <th class="py-1 px-2 text-right">CA</th>
            <th class="py-1 px-2 text-center">Statut agence</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;

  btn.closest('.relative').appendChild(panel);
}

// ── ESM Exports ──────────────────────────────────────────────────────────────
export {
  _toggleOverviewClassif,
  _toggleOverviewActPDV,
  _toggleOverviewStatut,
  _toggleOverviewDirection,
  _onActPDVSelect,
  _onStatutDetailleSelect,
  _onStatutSelect,
  _onUniversSelect,
  _toggleOverviewUnivers,
  _activitePDVColor,
  _getAllDepts,
  _buildDeptFilter,
  _toggleDept,
  _resetChalandiseFilters,
  _closeAllDropPanels,
  _toggleDeptDropdown,
  _toggleClassifDropdown,
  _toggleActPDVDropdown,
  _toggleStatutDropdown,
  _toggleDirectionDropdown,
  _toggleStrategiqueFilter,
  _onCommercialFilter,
  _onDistanceSlider,
  _onTerrClientSearch,
  _onMetierFilter,
  _navigateToOverviewMetier,
  _togglePerdu24m,
  _buildOverviewFilterChips,
  _renderCommercialSummary,
  _buildChalandiseOverview,
  _toggleOverviewL2,
  _renderOverviewL2,
  _toggleOverviewL3,
  _renderOverviewL3,
  _toggleOverviewL4,
  _overviewClientSort,
  _renderOverviewL4,
  _toggleClientArticles,
  _cockpitToggleFullList,
  _cockpitToggleSection,
  _populateTerrFamilleFilter,
  _setPDVCanalFilter,
  _buildDegradedCockpit,
  _buildCockpitClient,
  exportTop5CSV,
  _setCrossFilter,
  _setClientView,
  _cockpitRowCSV,
  _downloadCockpitCSV,
  exportCockpitCSV,
  exportCockpitCSVAll,
  _showExcludePrompt,
  _confirmExclude,
  _unexcludeClient,
  _unexcludeAll,
  _toggleExcludedList,
  exportExclusionsJSON,
  importExclusionsJSON,
  _toggleHorsMagasin,
  _passesAllFilters
};

// ── Window exposure for inline onclick handlers ──────────────────────────────
window._toggleOverviewClassif   = _toggleOverviewClassif;
window._toggleOverviewActPDV    = _toggleOverviewActPDV;
window._toggleOverviewStatut    = _toggleOverviewStatut;
window._toggleOverviewDirection = _toggleOverviewDirection;
window._toggleOverviewUnivers   = _toggleOverviewUnivers;
window._onActPDVSelect          = _onActPDVSelect;
window._onStatutDetailleSelect  = _onStatutDetailleSelect;
window._onStatutSelect          = _onStatutSelect;
window._onUniversSelect         = _onUniversSelect;
window._toggleDept              = _toggleDept;
window._toggleDeptDropdown      = _toggleDeptDropdown;
window._toggleClassifDropdown   = _toggleClassifDropdown;
window._toggleActPDVDropdown    = _toggleActPDVDropdown;
window._toggleStatutDropdown    = _toggleStatutDropdown;
window._toggleDirectionDropdown = _toggleDirectionDropdown;
window._toggleStrategiqueFilter = _toggleStrategiqueFilter;
window._onCommercialFilter      = _onCommercialFilter;
window._onDistanceSlider        = _onDistanceSlider;
window._onTerrClientSearch      = _onTerrClientSearch;
window._onMetierFilter          = _onMetierFilter;
window._navigateToOverviewMetier= _navigateToOverviewMetier;
window._togglePerdu24m          = _togglePerdu24m;
window._resetChalandiseFilters  = _resetChalandiseFilters;
window._setPDVCanalFilter       = _setPDVCanalFilter;
window._setCrossFilter          = _setCrossFilter;
window._setClientView           = _setClientView;
window._toggleOverviewL2        = _toggleOverviewL2;
window._toggleOverviewL3        = _toggleOverviewL3;
window._toggleOverviewL4        = _toggleOverviewL4;
window._toggleClientArticles    = _toggleClientArticles;
window._cockpitToggleFullList   = _cockpitToggleFullList;
window._cockpitToggleSection    = _cockpitToggleSection;
window._renderCommercialSummary = _renderCommercialSummary;
window._buildChalandiseOverview = _buildChalandiseOverview;
window._buildDegradedCockpit    = _buildDegradedCockpit;
window._buildCockpitClient      = _buildCockpitClient;
window._renderOverviewL4        = _renderOverviewL4;
window.exportCockpitCSV         = exportCockpitCSV;
window.exportCockpitCSVAll      = exportCockpitCSVAll;
window.exportExclusionsJSON     = exportExclusionsJSON;
window.importExclusionsJSON     = importExclusionsJSON;
window.exportTop5CSV            = exportTop5CSV;
window._showExcludePrompt       = _showExcludePrompt;
window._confirmExclude          = _confirmExclude;
window._unexcludeClient         = _unexcludeClient;
window._unexcludeAll            = _unexcludeAll;
window._toggleExcludedList      = _toggleExcludedList;
window._toggleHorsMagasin       = _toggleHorsMagasin;
window.excludeClient            = _showExcludePrompt;
window.confirmExclude           = _confirmExclude;
