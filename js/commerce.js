'use strict';

// ── ESM imports ─────────────────────────────────────────────────────────
import { _S } from './state.js';
import { refreshContextBar } from './contexte.js';
import { DataStore } from './store.js';
import { formatEuro, escapeHtml, _normalizeClassif, _normalizeStatut, _isMetierStrategique, getSecteurDirection } from './utils.js';
import './engine.js';
import './parser.js';
import './ui.js';
import './helpers.js';
import { openClient360, closeDiagnostic } from './diagnostic.js';
import { getClientsActiveSetInPeriod, currentYearMonthRange } from './sales.js';
import { aggregateOverviewGroups, aggregateOverviewClients, aggregateOverviewMetiers, aggregateOverviewSecteurs, aggregateACapter, buildOverviewCacheKey as _buildOverviewCacheKey, getOverviewMode, invalidateFilteredChalandise, passesOverviewClient as _passesOverviewClientRaw, setOverviewMode } from './commerce-conquete.js';
import { renderOverviewHead, renderOverviewL1Rows, renderOverviewL2Table, renderOverviewL3Table, renderOverviewL4Table } from './commerce-conquete-view.js';
import { createConqueteOverviewController, installConqueteOverviewController } from './commerce-conquete-controller.js';

let _commerceRafId = 0; // rAF ID pour annuler les rAF en attente au re-render

// ── Datalist UX guards ───────────────────────────────────────────────────
// <datalist> natif : la dropdown peut prendre toute la hauteur si on injecte
// une liste énorme. On garde donc la liste vide par défaut, et on propose des
// suggestions filtrées (max N) pendant la saisie.
document.addEventListener('input', function(e) {
  const t = e.target;
  if (t && t.id === 'terrMetierFilter') _onMetierInput(t.value);
});
document.addEventListener('change', function(e) {
  const t = e.target;
  if (t && t.id === 'terrMetierFilter') _onMetierInput(t.value);
});

// ── Nav 4 sous-vues — helpers ────────────────────────────────────────────

// RÈGLE PRISME — render autonome :
// Chaque case injecte d'abord ses slots HTML, puis appelle la fonction de peuplement.
// index.html ne contient que les conteneurs d'onglets vides.
// Pour déplacer un pavé : changer le case ici, rien d'autre.


// Changement d'onglet complet (user click) — recalcule les données

// Rendu seul (pas de recalcul) — utilisé au chargement initial



// ── Drill chalandise — Vue par Direction (mode sans territoire) ──────────
const _DIR_LABELS = { '-': 'Second Œuvre', 'DVM': 'Maintenance', 'DVI': 'DVI Industrie', 'DVP': 'DVP Plomberie' };

// ── Conquête › Ton territoire : visibilité des filtres + vue d'ensemble chalandise ──
// (ex-renderTerritoireTab : la partie lignes BL Qlik a été retirée en oct. 2026)
function renderTerritoireTab(){
  const hasChal=DataStore.chalandiseReady;
  const hasData=DataStore.finalData.length>0||_S.ventesLocalMagPeriode.size>0;
  const terrFilBlk=document.getElementById('terrFiltersBlock');if(terrFilBlk)terrFilBlk.classList.toggle('hidden',!hasData);
  _buildChalandiseOverviewInner();
  const chalFilBlk=document.getElementById('terrChalandiseFiltersBlock');if(chalFilBlk)chalFilBlk.classList.toggle('hidden',!hasChal);
  const sumBar=document.getElementById('terrSummaryBar');if(sumBar&&!hasChal){sumBar.classList.add('hidden');sumBar.style.display='none';}
}

// ── Chalandise — état filtre client (fusionné depuis territoire.js) ──────
let _terrClientSearchTimer = null;

// ── Chalandise / Overview (fusionné depuis territoire.js) ──────────────────

// Memoized aggregates over chalandiseData: single pass builds all the unique-value
// sets that toggles/filters need, instead of re-iterating on every click.
// Cached by chalandiseData reference — invalidated automatically when data reloads.
let _chalAggCache=null,_chalAggRef=null;
function _getChalAgg(){
  const data=_S.chalandiseData;
  if(!data)return null;
  if(_chalAggCache&&_chalAggRef===data)return _chalAggCache;
  const classifs=new Set(),activitesPDV=new Set(),statutsDetaille=new Set();
  const statutsNorm=new Set(),directions=new Set(),commercials=new Set(),metiers=new Set();
  const deptCounts=Object.create(null);
  for(const info of data.values()){
    classifs.add(_normalizeClassif(info.classification));
    if(info.activitePDV)activitesPDV.add(info.activitePDV);
    if(info.statutDetaille)statutsDetaille.add(info.statutDetaille);
    if(info.statut)statutsNorm.add(_normalizeStatut(info.statut));
    directions.add(info.secteur?getSecteurDirection(info.secteur)||'Autre':'Autre');
    if(info.commercial)commercials.add(info.commercial);
    if(info.metier)metiers.add(info.metier);
    const d=(info.cp||'').toString().slice(0,2);
    if(d&&d.trim())deptCounts[d]=(deptCounts[d]||0)+1;
  }
  _chalAggRef=data;
  _chalAggCache={classifs,activitesPDV,statutsDetaille,statutsNorm,directions,commercials,metiers,deptCounts};
  return _chalAggCache;
}

function _toggleOverviewClassif(c,event){if(event)event.preventDefault();const all=_getChalAgg()?.classifs||new Set();if(!_S._selectedClassifs.size){_S._selectedClassifs=new Set(all);_S._selectedClassifs.delete(c);}else if(_S._selectedClassifs.has(c)){_S._selectedClassifs.delete(c);if(!_S._selectedClassifs.size)_S._selectedClassifs=new Set();}else{_S._selectedClassifs.add(c);if(_S._selectedClassifs.size>=all.size)_S._selectedClassifs=new Set();}_buildChalandiseOverview();}
function _toggleOverviewDirection(d,event){if(event)event.preventDefault();const all=_getChalAgg()?.directions||new Set();if(!_S._selectedDirections.size){_S._selectedDirections=new Set(all);_S._selectedDirections.delete(d);}else if(_S._selectedDirections.has(d)){_S._selectedDirections.delete(d);if(!_S._selectedDirections.size)_S._selectedDirections=new Set();}else{_S._selectedDirections.add(d);if(_S._selectedDirections.size>=all.size)_S._selectedDirections=new Set();}_buildChalandiseOverview();}
function _onActPDVSelect(v){_S._selectedActivitesPDV=v?new Set([v]):new Set();_buildChalandiseOverview();}
function _onStatutDetailleSelect(v){_S._selectedStatutDetaille=v||'';_buildChalandiseOverview();}
function _onStatutSelect(v){_S._selectedStatuts=v?new Set([v]):new Set();_buildChalandiseOverview();}
function _onUniversSelect(v){_S._selectedUnivers=v?new Set([v]):new Set();_buildChalandiseOverview();}
function _getAllDepts(){return _getChalAgg()?.deptCounts||{};}
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
function _resetChalandiseFilters(){
  // Reset TACTIQUE — ne touche JAMAIS au filtre Maître (Portefeuille = commercial)
  // Reset tous les filtres tactiques visibles (Ciblage + Activité + Organisation)
  // Ciblage
  _S._selectedDepts=new Set();_S._selectedMetier='';_S._filterStrategiqueOnly=false;_S._distanceMaxKm=0;
  const btn=document.getElementById('btnStrategiqueOnly');if(btn){btn.classList.remove('bg-amber-500','text-white');btn.classList.add('s-hover','t-secondary');}
  const btnSM=document.getElementById('btnSansMetier');if(btnSM){btnSM.classList.remove('bg-rose-500','text-white');btnSM.classList.add('s-hover','t-secondary');}
  const metSel=document.getElementById('terrMetierFilter');if(metSel){metSel.value='';metSel.disabled=false;}
  const dSlider=document.getElementById('distKmSlider');if(dSlider)dSlider.value=0;
  const dLabel=document.getElementById('distKmLabel');if(dLabel)dLabel.textContent='∞';
  _buildDeptFilter();
  // Activité
  _S._selectedClassifs=new Set();_S._selectedStatuts=new Set();_S._selectedActivitesPDV=new Set();_S._selectedStatutDetaille='';_S._includePerdu24m=false;_S._excludeActifsConsomme=false;
  const eaCb=document.getElementById('toggleExcludeActifsConsomme')?.querySelector('input');if(eaCb)eaCb.checked=false;
  const aSel=document.getElementById('terrActPDVSelect');if(aSel)aSel.value='';
  const sdSel=document.getElementById('terrStatutDetailleSelect');if(sdSel)sdSel.value='';
  const stSel=document.getElementById('terrStatutSelect');if(stSel)stSel.value='';
  const cb=document.querySelector('#togglePerdu24m input');if(cb)cb.checked=false;
  // Organisation
  _S._selectedDirections=new Set();_S._selectedUnivers=new Set();
  const uSel=document.getElementById('terrUniversSelect');if(uSel)uSel.value='';
  // Persister l'état reset dans le slot de l'onglet courant
  if(_S._activeCommerceTab&&_S._tabFilters[_S._activeCommerceTab]){
    const slot=_S._tabFilters[_S._activeCommerceTab];
    slot.distanceMaxKm=0;slot.selectedDepts=new Set();slot.selectedMetier='';slot.filterStrategiqueOnly=false;
    slot.selectedClassifs=new Set();slot.selectedStatuts=new Set();slot.selectedActivitesPDV=new Set();slot.selectedStatutDetaille='';slot.includePerdu24m=false;slot.excludeActifsConsomme=false;
    slot.selectedDirections=new Set();slot.selectedUnivers=new Set();
  }
  _buildChalandiseOverview();
}
// ── Territory overview: Direction → Métier → Secteur → Clients ──
const _closeAllDropPanels=(...except)=>{['terrDeptPanel','terrClassifPanel','terrActPDVPanel','terrStatutPanel','terrDirectionPanel'].forEach(id=>{if(!except.includes(id))document.getElementById(id)?.classList.add('hidden');});};
function _toggleDeptDropdown(){const p=document.getElementById('terrDeptPanel');if(!p)return;const closing=!p.classList.contains('hidden');_closeAllDropPanels('terrDeptPanel');p.classList.toggle('hidden',closing);}
function _toggleClassifDropdown(){const p=document.getElementById('terrClassifPanel');if(!p)return;const closing=!p.classList.contains('hidden');_closeAllDropPanels('terrClassifPanel');p.classList.toggle('hidden',closing);}
function _toggleDirectionDropdown(){const p=document.getElementById('terrDirectionPanel');if(!p)return;const closing=!p.classList.contains('hidden');_closeAllDropPanels('terrDirectionPanel');p.classList.toggle('hidden',closing);}
function _toggleStrategiqueFilter(){_S._filterStrategiqueOnly=!_S._filterStrategiqueOnly;const btn=document.getElementById('btnStrategiqueOnly');if(btn){btn.classList.toggle('bg-amber-500',_S._filterStrategiqueOnly);btn.classList.toggle('text-white',_S._filterStrategiqueOnly);btn.classList.toggle('s-hover',!_S._filterStrategiqueOnly);btn.classList.toggle('t-secondary',!_S._filterStrategiqueOnly);}if(_S._filterStrategiqueOnly&&_S._selectedMetier&&!_isMetierStrategique(_S._selectedMetier)){_S._selectedMetier='';const mi=document.getElementById('terrMetierFilter');if(mi)mi.value='';}_buildChalandiseOverview();}
function _toggleSansMetier(){
  const isActive = _S._selectedMetier === '__NONE__';
  if (isActive) { _S._selectedMetier = ''; } else { _S._selectedMetier = '__NONE__'; }
  const btn = document.getElementById('btnSansMetier');
  if (btn) { btn.classList.toggle('bg-rose-500', !isActive); btn.classList.toggle('text-white', !isActive); btn.classList.toggle('s-hover', isActive); btn.classList.toggle('t-secondary', isActive); }
  const mi = document.getElementById('terrMetierFilter');
  if (mi) { mi.value = _S._selectedMetier === '__NONE__' ? '' : (_S._selectedMetier || ''); mi.disabled = _S._selectedMetier === '__NONE__'; }
  _buildChalandiseOverview();
}
function _onCommercialFilter(val){
  const commercials=_getChalAgg()?.commercials||new Set();
  _S._selectedCommercial=(!val||commercials.has(val))?val:'';
  // Sync all commercial selects across tabs
  for(const id of ['terrCommercialSidebar']){
    const el=document.getElementById(id);
    if(el&&el.value!==_S._selectedCommercial)el.value=_S._selectedCommercial;
    if(el)el.style.borderColor=_S._selectedCommercial?'rgba(99,102,241,0.8)':'rgba(99,102,241,0.4)';
  }
  // Update KPI spans + clear buttons
  const comSect = _getCommercialSecteurs();
  for(const id of ['terrCommercialKPISidebar']){
    const el=document.getElementById(id);if(!el)continue;
    if(_S._selectedCommercial){
      const ccs=_S.clientsByCommercial?.get(_S._selectedCommercial);
      const sect=comSect.get(_S._selectedCommercial);
      el.textContent=(ccs?`${ccs.size} client${ccs.size>1?'s':''}`:'')+( sect?` · secteur ${sect}`:'');
    }else{el.textContent='';}
  }
  _syncComClearBtns();
  // Render scorecards + top articles + poches in both tabs
  _buildChalandiseOverview();
  // Re-render PDV tab if visible
}
// Input handler: resolve typed value to a commercial (exact name OR secteur code)
// Also updates datalist with max 8 filtered suggestions
let _comInputTimer = null;
function _onCommercialInput(val) {
  clearTimeout(_comInputTimer);
  _comInputTimer = setTimeout(() => {
    const v = (val || '').trim();
    if (!v) { _onCommercialFilter(''); _updateComDatalist(''); _syncComClearBtns(); return; }
    const commercials = _getChalAgg()?.commercials || new Set();
    // Exact commercial name match → apply immediately
    if (commercials.has(v)) { _onCommercialFilter(v); _updateComDatalist(''); _syncComClearBtns(); return; }
    // Search by secteur code (case-insensitive)
    const vLow = v.toLowerCase();
    const comSect = _getCommercialSecteurs();
    for (const [com, sect] of comSect) {
      if (sect && sect.toLowerCase() === vLow) { _onCommercialFilter(com); _syncComInputs(com); _updateComDatalist(''); _syncComClearBtns(); return; }
    }
    // No exact match yet — update datalist with filtered suggestions (max 8)
    _updateComDatalist(vLow);
    // Don't apply filter while user is still typing (no exact match)
  }, 200);
}
function _updateComDatalist(query) {
  const MAX = 8;
  const comSect = _getCommercialSecteurs();
  const commercials = _getChalAgg()?.commercials || new Set();
  const matches = [];
  if (query) {
    for (const c of commercials) {
      const sect = comSect.get(c) || '';
      if (c.toLowerCase().includes(query) || (sect && sect.toLowerCase().includes(query))) {
        matches.push(c);
        if (matches.length >= MAX) break;
      }
    }
  }
  // Update all datalists
  const html = matches.map(c => {
    const sect = comSect.get(c) || '';
    return `<option value="${escapeHtml(c)}"${sect ? ' label="' + escapeHtml(c) + ' — ' + escapeHtml(sect) + '"' : ''}>`;
  }).join('');
  for (const id of ['terrCommercialSidebar_list']) {
    const dl = document.getElementById(id);
    if (dl) dl.innerHTML = html;
  }
}
function _syncComInputs(resolved) {
  const el = document.getElementById('terrCommercialSidebar');
  if (el && el.value !== resolved) el.value = resolved;
}
function _syncComClearBtns() {
  const active = !!_S._selectedCommercial;
  const el = document.getElementById('terrCommercialClearSidebar');
  if (el) el.classList.toggle('hidden', !active);
}

function _setDistanceQuick(km){_S._distanceMaxKm=km;_updateDistQuickBtns(km);_buildChalandiseOverview();}
function _updateDistQuickBtns(activeKm){document.querySelectorAll('.dist-quick-btn').forEach(b=>{const v=parseInt(b.textContent)||0;const isActive=(v===activeKm)||(activeKm===0&&b.textContent.includes('Tous'));b.style.background=isActive?'var(--c-action)':'';b.style.color=isActive?'white':'';b.style.borderColor=isActive?'var(--c-action)':'';});}
function _onTerrClientSearch(){
  clearTimeout(_terrClientSearchTimer);
  const raw=(document.getElementById('terrSearch')?.value||'').toLowerCase().trim();
  _S._terrClientSearch=raw;
  const suggestEl=document.getElementById('terrSearchSuggest');
  _terrClientSearchTimer=setTimeout(()=>{
    // Code client exact → ouvrir directement Client 360
    if(raw && /^\d{4,}$/.test(raw)){
      const cc=raw;
      const known=_S.chalandiseData?.has(cc)||_S.clientNomLookup?.[cc]||_S.clientStore?.has(cc)||_S.ventesLocalMagPeriode?.has(cc);
      if(known){
        if(suggestEl)suggestEl.classList.add('hidden');
        document.getElementById('terrSearch').value='';
        _S._terrClientSearch='';
        openClient360(cc,'terrain');
        return;
      }
    }
    // Autocomplétion à partir de 3 caractères
    if(suggestEl && raw.length>=3){
      const results=[];
      // Chercher dans chalandise + clientNomLookup
      const seen=new Set();
      if(_S.chalandiseData){
        for(const [cc,info] of _S.chalandiseData){
          if(results.length>=10)break;
          const nom=(info.nom||'').toLowerCase();
          if((cc.includes(raw)||nom.includes(raw))&&!seen.has(cc)){
            seen.add(cc);
            results.push({cc,nom:info.nom||cc,metier:info.metier||'',commercial:info.commercial||''});
          }
        }
      }
      if(results.length<10&&_S.clientNomLookup){
        for(const [cc,nom] of Object.entries(_S.clientNomLookup)){
          if(results.length>=10)break;
          if(seen.has(cc))continue;
          if(cc.includes(raw)||(nom||'').toLowerCase().includes(raw)){
            seen.add(cc);
            results.push({cc,nom:nom||cc,metier:'',commercial:''});
          }
        }
      }
      if(results.length){
        suggestEl.innerHTML=results.map(r=>`<div onclick="window._terrSelectClient('${r.cc}')" class="px-3 py-2 cursor-pointer hover:s-hover border-b b-light text-[11px]" style="border-color:rgba(148,163,184,0.15)">
          <span class="font-bold t-primary">${r.cc}</span>
          <span class="t-secondary ml-1">${r.nom}</span>
          ${r.metier?`<span class="text-[9px] t-disabled ml-1">· ${r.metier}</span>`:''}
        </div>`).join('');
        suggestEl.classList.remove('hidden');
      } else {
        suggestEl.innerHTML='<div class="px-3 py-2 text-[10px] t-disabled">Aucun client trouvé</div>';
        suggestEl.classList.remove('hidden');
      }
    } else if(suggestEl){
      suggestEl.classList.add('hidden');
    }
    if(!raw){
      _buildChalandiseOverview();window.renderTerritoireTab?.();
    }
  },250);
}
// Fermer suggestions au clic extérieur
document.addEventListener('click',e=>{
  const wrap=document.getElementById('terrSearchBlock');
  const sg=document.getElementById('terrSearchSuggest');
  if(sg&&wrap&&!wrap.contains(e.target))sg.classList.add('hidden');
});
function _terrSelectClient(cc){
  const suggestEl=document.getElementById('terrSearchSuggest');
  if(suggestEl)suggestEl.classList.add('hidden');
  const input=document.getElementById('terrSearch');
  if(input)input.value='';
  _S._terrClientSearch='';
  openClient360(cc,'terrain');
}
let _metInputTimer = null;
let _metierSortedCacheRef = null;
let _metierSortedAll = null;
let _metierSortedStrategique = null;
function _getMetiersSorted(strategiqueOnly) {
  const ref = _S.chalandiseData;
  if (_metierSortedCacheRef !== ref) { _metierSortedCacheRef = ref; _metierSortedAll = null; _metierSortedStrategique = null; }
  if (!strategiqueOnly) {
    if (!_metierSortedAll) _metierSortedAll = [...(_getChalAgg()?.metiers || new Set())].sort((a, b) => a.localeCompare(b, 'fr'));
    return _metierSortedAll;
  }
  if (!_metierSortedStrategique) _metierSortedStrategique = [...(_getChalAgg()?.metiers || new Set())].filter(_isMetierStrategique).sort((a, b) => a.localeCompare(b, 'fr'));
  return _metierSortedStrategique;
}
function _updateMetierDatalist(queryLower) {
  const dl = document.getElementById('terrMetierList');
  if (!dl) return;
  const q = (queryLower || '').trim();
  if (!q || q.length < 2 || _S._selectedMetier) { dl.innerHTML = ''; return; }
  const MAX = 12;
  const metiers = _getMetiersSorted(!!_S._filterStrategiqueOnly);
  const matches = [];
  for (const m of metiers) {
    if (m.toLowerCase().includes(q)) { matches.push(m); if (matches.length >= MAX) break; }
  }
  dl.innerHTML = matches.map(m => `<option value="${escapeHtml(m)}">`).join('');
}
function _onMetierInput(val) {
  clearTimeout(_metInputTimer);
  const _check = () => {
    const v = (val || '').trim();
    if (!v) { _updateMetierDatalist(''); _onMetierFilter(''); return; }
    const metiers = _getChalAgg()?.metiers || new Set();
    const ok = metiers.has(v) && (!_S._filterStrategiqueOnly || _isMetierStrategique(v));
    if (ok) { _updateMetierDatalist(''); _onMetierFilter(v); return; }
    _updateMetierDatalist(v.toLowerCase());
  };
  // Si la valeur matche un métier connu, appliquer immédiatement (datalist selection)
  const metiers = _getChalAgg()?.metiers || new Set();
  if (metiers.has((val || '').trim())) { _check(); return; }
  _metInputTimer = setTimeout(_check, 180);
}
function _onMetierFilter(val){
  const v = (val || '').trim();
  const metiers=_getChalAgg()?.metiers||new Set();
  const next=(!v||metiers.has(v))?v:'';
  if (next === _S._selectedMetier) return;
  _S._selectedMetier = next;
  // Désactiver le bouton "Sans métier" si on tape un vrai métier
  const btnSM=document.getElementById('btnSansMetier');
  if(btnSM){btnSM.classList.remove('bg-rose-500','text-white');btnSM.classList.add('s-hover','t-secondary');}
  // Mettre à jour le style de l'input
  const mi=document.getElementById('terrMetierFilter');
  if(mi){mi.classList.toggle('border-rose-400',!!next);mi.classList.toggle('ring-1',!!next);mi.classList.toggle('ring-rose-300',!!next);}
  _bcoiCacheKey=''; // forcer le recalcul de l'overview
  _buildChalandiseOverview();
}
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
  switchTab('commerce');
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
function _toggleExcludeActifsConsomme(checked){_S._excludeActifsConsomme=checked;_buildChalandiseOverview();}
function _togglePerdu24m(checked){_S._includePerdu24m=checked;_buildChalandiseOverview();}
// ── Shared helper: populate a commercial <select> + KPI span ───────────
// Build commercial → dominant secteur mapping (cached)
let _comSectCache = null, _comSectRef = null;
function _getCommercialSecteurs() {
  const data = _S.chalandiseData;
  if (!data) return new Map();
  if (_comSectCache && _comSectRef === data) return _comSectCache;
  const counts = new Map(); // commercial → Map<secteur, count>
  for (const info of data.values()) {
    if (!info.commercial || !info.secteur) continue;
    let sc = counts.get(info.commercial);
    if (!sc) { sc = new Map(); counts.set(info.commercial, sc); }
    sc.set(info.secteur, (sc.get(info.secteur) || 0) + 1);
  }
  const result = new Map();
  for (const [com, sc] of counts) {
    let best = '', bestN = 0;
    for (const [s, n] of sc) { if (n > bestN) { best = s; bestN = n; } }
    result.set(com, best);
  }
  _comSectRef = data;
  _comSectCache = result;
  return result;
}

function _populateCommercialSelect(inputId, kpiId) {
  const comInput = document.getElementById(inputId);
  if (!comInput) return;
  const cur = _S._selectedCommercial || '';
  // Ensure datalist element exists (empty until user types)
  const listId = inputId + '_list';
  let dl = document.getElementById(listId);
  if (!dl) { dl = document.createElement('datalist'); dl.id = listId; comInput.parentNode.appendChild(dl); comInput.setAttribute('list', listId); }
  // Only show suggestions when no commercial is selected (empty datalist otherwise)
  if (!cur) dl.innerHTML = '';
  comInput.value = cur;
  comInput.style.borderColor = cur ? 'rgba(99,102,241,0.8)' : 'rgba(99,102,241,0.4)';
  if (kpiId) {
    const kpiEl = document.getElementById(kpiId);
    if (kpiEl) {
      if (cur) {
        const ccs = _S.clientsByCommercial?.get(cur);
        const sect = _getCommercialSecteurs().get(cur);
        let nb = 0;
        if (ccs) {
          for (const cc of ccs) {
            const info = _S.chalandiseData?.get(cc);
            if (!_passesOverviewClient(info, cc)) continue;
            nb++;
          }
        }
        kpiEl.textContent = (nb ? `${nb} client${nb > 1 ? 's' : ''}` : '') + (sect ? ` · secteur ${sect}` : '');
      } else { kpiEl.textContent = ''; }
    }
  }
}

// ── Scorecard Portefeuille Commercial ───────────────────────────────────


function _buildOverviewFilterChips(){
  const CLASSIF_ORDER=['FID Pot+','OCC Pot+','FID Pot-','OCC Pot-','NC'];
  const CLASSIF_ON={'FID Pot+':'bg-emerald-600 text-white border-emerald-600','FID Pot-':'bg-gray-500 text-white border-gray-500','OCC Pot+':'bg-blue-600 text-white border-blue-600','OCC Pot-':'bg-blue-400 text-white border-blue-400','NC':'bg-slate-400 text-white border-slate-400'};
  const _agg=_getChalAgg()||{classifs:new Set(),activitesPDV:new Set(),statutsDetaille:new Set(),statutsNorm:new Set(),directions:new Set(),commercials:new Set(),metiers:new Set()};
  const availClassifs=_agg.classifs,availActPDV=_agg.activitesPDV,availStatutDetaille=_agg.statutsDetaille,availDirections=_agg.directions;
  const availStatutsNorm=_agg.statutsNorm;
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
  // Métier <datalist> : ne pas injecter la liste complète (dropdown gigantesque).
  // Les suggestions sont alimentées dynamiquement pendant la saisie via _onMetierInput().
  const metInput=document.getElementById('terrMetierFilter');
  const metList=document.getElementById('terrMetierList');
  const _isNone = _S._selectedMetier === '__NONE__';
  if(metInput&&metList){
    metList.innerHTML='';
    metInput.value=_isNone ? '' : (_S._selectedMetier||'');
    metInput.disabled=_isNone;
    metInput.classList.toggle('border-rose-400',!!_S._selectedMetier && !_isNone);
    metInput.classList.toggle('ring-1',!!_S._selectedMetier && !_isNone);
    metInput.classList.toggle('ring-rose-300',!!_S._selectedMetier && !_isNone);
  }
  const btnSM=document.getElementById('btnSansMetier');
  if(btnSM){btnSM.classList.toggle('bg-rose-500',_isNone);btnSM.classList.toggle('text-white',_isNone);btnSM.classList.toggle('s-hover',!_isNone);btnSM.classList.toggle('t-secondary',!_isNone);}
  // Populate all commercial <select> elements in main content
  _populateCommercialSelect('terrCommercialSidebar','terrCommercialKPISidebar');
}


function _buildChalandiseOverviewData(){
  // Partie données pure de l'overview — sans re-trigger les sous-onglets
  _buildChalandiseOverviewInner();
}
function _buildChalandiseOverview(){
  refreshContextBar(); // bandeau de contexte : filtres actifs
  // Persister les filtres tactiques dans le slot de l'onglet courant
  if(_S._activeCommerceTab&&_S._tabFilters[_S._activeCommerceTab]){
    const slot=_S._tabFilters[_S._activeCommerceTab];
    slot.distanceMaxKm=_S._distanceMaxKm;slot.selectedDepts=new Set(_S._selectedDepts);slot.selectedMetier=_S._selectedMetier;slot.filterStrategiqueOnly=_S._filterStrategiqueOnly;
    slot.selectedClassifs=new Set(_S._selectedClassifs);slot.selectedStatuts=new Set(_S._selectedStatuts);slot.selectedActivitesPDV=new Set(_S._selectedActivitesPDV);slot.selectedStatutDetaille=_S._selectedStatutDetaille;slot.includePerdu24m=_S._includePerdu24m;slot.excludeActifsConsomme=_S._excludeActifsConsomme;
    slot.selectedDirections=new Set(_S._selectedDirections);slot.selectedUnivers=new Set(_S._selectedUnivers);
  }
  // Rafraîchir le sous-onglet actif + overview data
  _buildOverviewFilterChips();
  // Fidélisation PDV retirée (remplacée par « Tes clients ») : plus de rendu en arrière-plan
  // Tes clients : mêmes filtres clients que Fidélisation / Conquête
  if (_S._activeCommerceTab === 'portefeuille') window.renderTesClients?.();
  _buildChalandiseOverviewInner();
}
// _bcoiLastRun supprimé — remplacé par cache par clé dans _buildChalandiseOverviewInner
let _bcoiCacheKey='';
const _CANAL_LABELS_OV={MAGASIN:'Magasin',INTERNET:'Internet',REPRESENTANT:'Représentant',DCS:'DCS'};
let _overviewCaptePDVSet=null; // shared with L2 renderer
window._overviewToggleMode=function(mode){setOverviewMode(mode);_bcoiCacheKey='';_buildChalandiseOverviewInner(true);const _det=document.querySelector('#terrChalandiseOverview details');if(_det)_det.open=true;};
function _passesOverviewClient(info,cc,capteSet=_overviewCaptePDVSet,opts={}){
  return _passesOverviewClientRaw(info,cc,capteSet,opts);
}
function _buildChalandiseOverviewInner(force){
  // Cache par clé de filtres (remplace le debounce temporel qui échouait quand l'exécution > 100ms)
  const _key=_buildOverviewCacheKey();
  if(!force&&_bcoiCacheKey===_key)return;
  if(force)invalidateFilteredChalandise();
  _bcoiCacheKey=_key;
  if(!_S.chalandiseReady){const _b=document.getElementById('terrChalandiseOverview');if(_b)_b.classList.add('hidden');return;}
  // Aggregate — toujours exécuté (KPI bar + badges réactifs aux filtres)
  const _isSec=getOverviewMode()==='secteur';
  // Set de clients captés PDV — canal-aware (consommé = toujours à l'agence)
  const _oCanal=_S._globalCanal||'';
  // Capté PDV = achat dans l'agence sur l'ANNÉE EN COURS (même fenêtre que « capté Legallais »,
  // règle user oct. 2026) — indépendant du sélecteur de période.
  const _yr = currentYearMonthRange();
  let _captePDVSet = getClientsActiveSetInPeriod(_oCanal, { magasinMode: _S._reseauMagasinMode || 'all', range: _yr || undefined });
  if (!_captePDVSet) {
    // Fallback legacy : structures period-filtered (ne se recalculent pas sans reparse)
    if(!_oCanal){
      // Tous canaux : clientsMagasin (period-filtered, comportement d'origine)
      _captePDVSet=new Set(_S.clientsMagasin||[]);
      // + hors-MAGASIN period-filtered
      if(_S.ventesLocalHorsMag)for(const cc of _S.ventesLocalHorsMag.keys())_captePDVSet.add(cc);
    }else if(_oCanal==='MAGASIN'){
      _captePDVSet=_S.clientsMagasin||new Set();
    }else{
      // Hors-MAGASIN : ventesLocalHorsMag filtré par canal (period-filtered comme clientsMagasin)
      _captePDVSet=new Set();
      if(_S.ventesLocalHorsMag)for(const[cc,artMap] of _S.ventesLocalHorsMag){for(const[,v] of artMap){if((v.canal||'')===_oCanal){_captePDVSet.add(cc);break;}}}
    }
  }
  _overviewCaptePDVSet=_captePDVSet; // share with L2 renderer
  const _captLabel=_oCanal?(_CANAL_LABELS_OV[_oCanal]||_oCanal):'PDV';
  const _overviewAgg=aggregateOverviewGroups(_captePDVSet);
  const dirMap=_overviewAgg.groups;
  const totalClients=_overviewAgg.stats.totalClients,filteredClients=_overviewAgg.stats.filteredClients,totalActifsPDV=_overviewAgg.totalActifsPDV,totalActifsLeg=_overviewAgg.totalActifsLeg,totalExcluded24m=_overviewAgg.stats.totalExcluded24m;
  const pctCapte=filteredClients>0?Math.round(totalActifsPDV/filteredClients*100):0;
  const pctCapteLeg=filteredClients>0?Math.round(totalActifsLeg/filteredClients*100):0;
  // Clients hors zone : acheteurs PDV absents de la chalandise
  let _horsZoneCount=0,_horsZoneCA=0;
  if(_S.clientStore?.size){for(const rec of _S.clientStore.values()){if(rec.inChalandise||((rec.caPDV||0)<200&&(rec.caTotal||0)<200))continue;_horsZoneCount++;_horsZoneCA+=rec.caTotal||rec.caPDV||0;}}
  const filterActive=_S._selectedDepts.size||_S._selectedClassifs.size||_S._selectedStatuts.size||_S._selectedActivitesPDV.size||_S._selectedDirections.size||_S._selectedUnivers.size||_S._selectedCommercial||_S._selectedMetier||_S._filterStrategiqueOnly;
  // ── Badges groupes sidebar Terrain ──
  {const _nGeo=(_S._selectedDepts.size||0)+((_S._distanceMaxKm>0)?1:0)+((_S._includePerdu24m)?1:0);
  const _bgG=document.getElementById('fgBadgeGeo');if(_bgG){_bgG.textContent=_nGeo;_bgG.classList.toggle('hidden',_nGeo===0);}
  const _nAct=(_S._selectedActivitesPDV.size||0)+((_S._selectedStatutDetaille)?1:0)+(_S._selectedStatuts.size||0)+(_S._selectedClassifs.size||0)+(_S._excludeActifsConsomme?1:0);
  const _bgA=document.getElementById('fgBadgeTerritoire');if(_bgA){_bgA.textContent=_nAct;_bgA.classList.toggle('hidden',_nAct===0);}
  const _nOrg=((_S._selectedMetier)?1:0)+((_S._selectedCommercial)?1:0)+(_S._selectedDirections.size||0)+(_S._selectedUnivers.size||0)+((_S._filterStrategiqueOnly)?1:0);
  const _bgO=document.getElementById('fgBadgeOrga');if(_bgO){_bgO.textContent=_nOrg;_bgO.classList.toggle('hidden',_nOrg===0);}}
  // ── terrSummaryBar — réactif aux filtres même sans terrChalandiseOverview ──
  {const bar=document.getElementById('terrSummaryBar');
  if(bar){
    const _canal=_S._globalCanal||'';
    const _canalLabel=_canal?(_CANAL_LABELS_OV[_canal]||_canal):'Tous canaux';
    let _aCapterTot=0;for(const d of Object.values(dirMap))_aCapterTot+=d.aCapter||0;
    const _k=(label,val,sub,color)=>`<div class="pt-card pt-col" style="gap:6px;padding:18px 20px"><span class="pt-eyebrow">${label}</span><span class="pt-num" style="font-size:32px;font-weight:600;line-height:1.05;${color?`color:${color}`:''}">${val}</span>${sub?`<span class="pt-small pt-muted">${sub}</span>`:''}</div>`;
    bar.innerHTML=`<div class="tt-kpis">
      ${_k('Clients de ta zone',filteredClients.toLocaleString('fr-FR'),filterActive?`sur ${totalClients.toLocaleString('fr-FR')} · filtrés`:'fichier chalandise')}
      ${_k('Actifs chez Legallais',pctCapteLeg+' %',`${totalActifsLeg.toLocaleString('fr-FR')} clients`, 'var(--t-link)')}
      ${_k('Clients de ton agence',pctCapte+' %',`${totalActifsPDV.toLocaleString('fr-FR')} clients${_oCanal?' · '+_canalLabel:' · tous canaux'}`,'var(--pt-high)')}
      ${_k('À capter',_aCapterTot.toLocaleString('fr-FR'),'actifs chez Legallais, pas chez toi','var(--pt-mid)')}
    </div>
    <p class="pt-small pt-muted" style="margin:8px 2px 0">${_horsZoneCount?`${_horsZoneCount.toLocaleString('fr-FR')} clients de ton comptoir hors chalandise (à rattacher dans Tes clients)`:''}${_horsZoneCount&&totalExcluded24m&&!_S._includePerdu24m?' · ':''}${(!_S._includePerdu24m&&totalExcluded24m)?`${totalExcluded24m.toLocaleString('fr-FR')} clients sans achat depuis plus de 12 mois exclus (perdus 12-24 et >24 mois)`:''}</p>`;
    bar.style.cssText='display:block;margin-bottom:20px';
    bar.classList.remove('hidden');
  }}
  // Vue direction cascade — différé (6.7MB HTML ne doit pas bloquer le rendu)
  // terrChalandiseOverview — table seulement si dans le DOM
  const blk=document.getElementById('terrChalandiseOverview');
  if(!blk)return;
  blk.classList.remove('hidden');
  _buildDeptFilter();
  // Toggle Direction / Secteur
  const _axisLabel=_isSec?'Secteur':'Direction';
  const _toggleEl=document.getElementById('terrOverviewToggle');
  if(_toggleEl){
    _toggleEl.innerHTML=`<button type="button" class="ar-chip${!_isSec?' ar-chip-on':''}" onclick="window._overviewToggleMode('direction')">Par direction</button><button type="button" class="ar-chip${_isSec?' ar-chip-on':''}" onclick="window._overviewToggleMode('secteur')">Par secteur</button>`;
  }
  // Fixed thead — axis label adapts to mode
  const colSpan=10;
  const headEl=document.getElementById('terrOverviewL1Head');
  if(headEl){
    const _captSub=_oCanal&&_oCanal!=='MAGASIN'?` <span class="t-disabled font-normal">(via ${_captLabel})</span>`:'';
    headEl.innerHTML=renderOverviewHead(_axisLabel,_captSub);
  }
  const _nbDirs=Object.keys(dirMap).length;const _axisN=_isSec?'secteur':'direction';const _sl=document.getElementById('terrOverviewSummaryLine');if(_sl)_sl.textContent=`${_nbDirs} ${_axisN}${_nbDirs>1?'s':''} · ${totalActifsPDV.toLocaleString('fr-FR')} actifs PDV${_oCanal&&_oCanal!=='MAGASIN'?' (via '+_captLabel+')':''} · ${pctCapte}% capté`;
  // Sort by % capté ascending (opportunities first)
  let dirsArr=Object.values(dirMap).filter(d=>d.total>0);
  dirsArr.sort((a,b)=>(b.aCapter||0)-(a.aCapter||0)||b.actifsLeg-a.actifsLeg||b.total-a.total);
  const _focusEl=document.getElementById('terrainFocusCoach');
  if(_focusEl){
    const _candidates=dirsArr
      .filter(d=>(d.total||0)>=5)
      .map(d=>{const base=(d.total||0)-(d.prospects||0);return{...d,_base:base,_pct:base>0?(d.actifsPDV||0)/base:1,_gap:Math.max(0,(d.actifsLeg||0)-(d.actifsPDV||0))};})
      .filter(d=>d._base>0&&((d._gap||0)>0||(d.perdus12_24||0)>0));
    _candidates.sort((a,b)=>a._pct-b._pct||b._gap-a._gap||b.perdus12_24-a.perdus12_24||b.total-a.total);
    _focusEl.innerHTML='';_focusEl.classList.add('hidden'); // priorité = 1re ligne du tableau (tri « à capter »)
  }
  let html=renderOverviewL1Rows(dirsArr,{isSecteur:_isSec,colSpan});
  const tEl=document.getElementById('terrOverviewL1Table');
  if(tEl)tEl.innerHTML=html||`<tr><td colspan="${colSpan}" class="text-center py-4 t-disabled">Aucun client dans la zone de chalandise</td></tr>`;
}
function _renderOverviewL2(el,direction){
  let metiersArr=aggregateOverviewMetiers(direction,_overviewCaptePDVSet);
  // Sort by % capté ascending (opportunities first)
  metiersArr.sort((a,b)=>(b.aCapter||0)-(a.aCapter||0)||b.perdus12_24-a.perdus12_24||b.total-a.total);
  const _cl=_S._globalCanal&&_S._globalCanal!=='MAGASIN'?` <span class="t-disabled font-normal">(via ${_CANAL_LABELS_OV[_S._globalCanal]||_S._globalCanal})</span>`:'';
  el.innerHTML=renderOverviewL2Table(metiersArr,{direction,canalSuffix:_cl});
}
function _renderOverviewL3(el,direction,metier){
  let sectsArr=aggregateOverviewSecteurs(direction,metier,_overviewCaptePDVSet);
  sectsArr.sort((a,b)=>(b.aCapter||0)-(a.aCapter||0)||b.perdus12_24-a.perdus12_24||b.total-a.total);
  const _cl3=_S._globalCanal&&_S._globalCanal!=='MAGASIN'?` <span class="t-disabled font-normal">(via ${_CANAL_LABELS_OV[_S._globalCanal]||_S._globalCanal})</span>`:'';
  el.innerHTML=renderOverviewL3Table(sectsArr,{direction,metier,canalSuffix:_cl3});
}
function _overviewClientSort(a,b){
  // Actifs globaux Inactifs PDV first, then Perdus récents FID Pot+, then rest
  const aGlobActif=!!a._capteLeg,bGlobActif=!!b._capteLeg;
  const aPDV=a._pdvActif,bPDV=b._pdvActif;
  // Priority: 1=global actif + PDV inactif, 2=perdu FID Pot+, 3=rest
  const aP=aGlobActif&&!aPDV?1:(!aGlobActif&&(a.caN1||0)>0&&_normalizeClassif(a.classification).includes('Pot+')?2:3);
  const bP=bGlobActif&&!bPDV?1:(!bGlobActif&&(b.caN1||0)>0&&_normalizeClassif(b.classification).includes('Pot+')?2:3);
  if(aP!==bP)return aP-bP;
  return(b.caLeg||b.ca2025||0)-(a.caLeg||a.ca2025||0);
}
function _renderOverviewL4(el,direction,metier,secteur,limit){
  limit=limit||20;
  // CA agence = CA tous canaux myStore sur l'année en cours (même fenêtre que capté PDV / Legallais).
  const _cy=currentYearMonthRange();
  const _ymRange=_cy?{min:_cy.min,max:_cy.max}:{min:new Date().getFullYear()*12,max:new Date().getFullYear()*12+11};
  const clients=aggregateOverviewClients({direction,metier,secteur,range:_ymRange,capteSet:_overviewCaptePDVSet});
  clients.sort(_overviewClientSort);
  const show=clients.slice(0,limit),more=clients.length-limit;
  const _l4Canal=_S._globalCanal||'';
  el.innerHTML=renderOverviewL4Table({clients,show,more,direction,metier,secteur,canal:_l4Canal});
}
const _conqueteOverviewController=createConqueteOverviewController({
  getMode:getOverviewMode,
  renderL2:_renderOverviewL2,
  renderL3:_renderOverviewL3,
  renderL4:_renderOverviewL4
});
const _toggleOverviewL2=_conqueteOverviewController.toggleOverviewL2;
const _toggleOverviewL3=_conqueteOverviewController.toggleOverviewL3;
const _toggleOverviewL4=_conqueteOverviewController.toggleOverviewL4;
installConqueteOverviewController(_conqueteOverviewController);

// ── Rendu pur (séparé du calcul) — rapide, utilisé aussi par pagination ──



// ── Cockpit Client CSV Export ──

// ── Export CSV Hors Zone → Table de Forçage prête à remplir ──
export { renderTerritoireTab, _toggleOverviewClassif, _toggleOverviewDirection, _onActPDVSelect, _onStatutDetailleSelect, _onStatutSelect, _onUniversSelect, _getAllDepts, _buildDeptFilter, _toggleDept, _resetChalandiseFilters, _closeAllDropPanels, _toggleDeptDropdown, _toggleClassifDropdown, _toggleDirectionDropdown, _toggleStrategiqueFilter, _onCommercialFilter, _updateDistQuickBtns, _onTerrClientSearch, _onMetierFilter, _navigateToOverviewMetier, _toggleExcludeActifsConsomme, _togglePerdu24m, _buildOverviewFilterChips, _buildChalandiseOverview, _toggleOverviewL2, _renderOverviewL2, _toggleOverviewL3, _renderOverviewL3, _toggleOverviewL4, _overviewClientSort, _renderOverviewL4, renderCommerceTab };

// ── Orchestrateur principal Commerce 5 sous-vues ─────────────────────────
// ── Squelette de la vue d'ensemble chalandise (ex-omni.js) ──
function renderOmniContent() {
  const s = window._S || {};
  const hasChal     = !!s.chalandiseData?.size;
  const hasConsomme = !!s.finalData?.length;
  const el = document.getElementById('terrOmniBlock') || document.getElementById('cm-tab-content');
  if (!el) return;
  el.innerHTML = `<div>
  <section id="terrChalandiseOverview" class="hidden"><div class="pt-card pt-col" style="gap:14px;padding:20px">
    <div class="pt-row pt-between" style="gap:12px;flex-wrap:wrap;align-items:baseline">
      <h3 class="pt-h2">Ton territoire en un coup d’œil</h3>
      <div class="pt-row" style="gap:12px;flex-wrap:wrap"><span id="terrOverviewToggle" class="pt-row" style="gap:6px"></span><span id="terrOverviewSummaryLine" class="pt-small pt-muted"></span></div>
    </div>
    <div class="pt-list"><div class="tt-scroll"><table class="pt-table tt-table"><thead id="terrOverviewL1Head"></thead><tbody id="terrOverviewL1Table"></tbody></table></div></div>
  </div></section>
</div>`;
  const terrOverview=document.getElementById('terrChalandiseOverview');
  if(terrOverview)terrOverview.classList.toggle('hidden',!hasChal);
}

function renderCommerceTab() {
  // Tabs cockpit maintenant dans Fidélisation PDV — garder l'état actif
  // Sidebar : chips canal toujours visibles sur Commerce
  document.getElementById('globalCanalFilter')?.classList.remove('hidden');
  const el = document.getElementById('tabCommerce');
  if (!el) return;
  // 1. Layout squelette — rapide
  el.innerHTML = `<div class="pt-wrap tt-wrap">
    <header class="pt-col" style="gap:6px">
      <span class="pt-eyebrow">Pilotage commercial</span>
      <h2 class="pt-h2" style="font-size:28px">Ton territoire</h2>
      <span class="pt-small pt-muted">Zone de chalandise par direction, métier, secteur · trié par clients à capter · clic sur « À capter » = la liste</span>
    </header>
    <div id="terrSummaryBar" style="display:none"></div>
    <div id="terrainFocusCoach" class="hidden"></div>
    <div id="terrOmniBlock"></div>
    <div id="ttCapterPanel"></div>
  </div>`;
  // (4 « poches » / angles de captation retirés : montants additionnés non captables)
  // 4. KPI bar chalandise + territoire (différé pour ne pas bloquer)
  if (_commerceRafId) cancelAnimationFrame(_commerceRafId);
  _commerceRafId = requestAnimationFrame(() => {
    _commerceRafId = 0;
    _buildOverviewFilterChips();
    renderOmniContent();
    _buildChalandiseOverviewData();
  });
}

// ── Liste des clients à capter d'un périmètre (clic sur « À capter ») ──
let _ttCapterRows=[],_ttCapterTitle='';
window._ttCapter=function(dirEnc,mEnc){
  const direction=decodeURIComponent(dirEnc||''),metier=mEnc?decodeURIComponent(mEnc):null;
  _ttCapterRows=aggregateACapter({direction,metier,capteSet:_overviewCaptePDVSet});
  _ttCapterTitle=metier?`${direction} · ${metier}`:direction;
  const el=document.getElementById('ttCapterPanel');if(!el)return;
  const rows=_ttCapterRows.slice(0,100).map(r=>`<tr class="ar-click" onclick="openClient360('${escapeHtml(r.cc)}','territoire')">
    <td><span class="pt-strong">${escapeHtml(r.nom)}</span><br><span class="pt-small pt-muted">${escapeHtml(r.ville||'')}</span></td>
    <td class="pt-small">${escapeHtml(r.metier||'—')}</td><td class="pt-small pt-muted">${escapeHtml(r.commercial||'—')}</td><td class="pt-small pt-muted">${escapeHtml(r.classification||'—')}</td>
    <td class="pt-num ar-r">${r.caN1?formatEuro(r.caN1):'—'}</td><td class="pt-num ar-r">${r.caN?formatEuro(r.caN):'—'}</td><td class="pt-num ar-r">${r.dist!=null?r.dist+' km':'—'}</td></tr>`).join('');
  el.innerHTML=`<section class="pt-card pt-col" style="gap:14px;margin-top:20px;scroll-margin-top:120px" id="ttCapterCard">
    <div class="pt-row pt-between" style="gap:12px;flex-wrap:wrap;align-items:flex-start">
      <div class="pt-col" style="gap:4px"><span class="pt-eyebrow">À capter</span><h3 class="pt-h3">${escapeHtml(_ttCapterTitle)}</h3>
        <span class="pt-small pt-muted">${_ttCapterRows.length.toLocaleString('fr-FR')} clients actifs chez Legallais, pas encore clients de l'agence · triés par CA Legallais</span></div>
      <div class="pt-row" style="gap:16px"><button type="button" class="pt-link" onclick="_ttCapterCsv()">Exporter en CSV</button><button type="button" class="pt-link" onclick="document.getElementById('ttCapterPanel').innerHTML=''">Fermer</button></div>
    </div>
    <div class="pt-list"><div class="pt-scroll"><table class="pt-table"><thead><tr><th>Client</th><th>Métier</th><th>Commercial</th><th>Classif.</th><th class="ar-r">CA Leg. ${(currentYearMonthRange()?.year||new Date().getFullYear())-1}</th><th class="ar-r">CA Leg. ${currentYearMonthRange()?.year||new Date().getFullYear()} à date</th><th class="ar-r">Distance</th></tr></thead><tbody>${rows}</tbody></table></div>
      <div class="pt-small pt-muted" style="padding:10px 12px">${_ttCapterRows.length>100?`100 premiers sur ${_ttCapterRows.length.toLocaleString('fr-FR')} · tout est dans l'export`:''} clic = fiche client</div></div>
  </section>`;
  document.getElementById('ttCapterCard')?.scrollIntoView({behavior:'smooth',block:'start'});
};
window._ttCapterCsv=function(){
  const q=v=>`"${String(v??'').replace(/"/g,'""')}"`;
  const lines=[['Code client','Nom','Ville','Métier','Commercial','Secteur','Classification',`CA Legallais ${(currentYearMonthRange()?.year||new Date().getFullYear())-1}`,`CA Legallais ${currentYearMonthRange()?.year||new Date().getFullYear()} à date`,'Distance km'].map(q).join(';'),
    ..._ttCapterRows.map(r=>[r.cc,r.nom,r.ville,r.metier,r.commercial,r.secteur,r.classification,Math.round(r.caN1),Math.round(r.caN),r.dist??''].map(q).join(';'))];
  const url=URL.createObjectURL(new Blob(['\uFEFF'+lines.join('\r\n')],{type:'text/csv;charset=utf-8'}));
  const a=document.createElement('a');a.href=url;a.download=`PRISME_${_S.selectedMyStore}_a-capter_${_ttCapterTitle.replace(/[^\p{L}\p{N}]+/gu,'-')}.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
};

// ── Window expositions ──────────────────────────────────────────────────
window.renderTerritoireTab        = renderTerritoireTab;
window.renderCommerceTab          = renderCommerceTab;
window._toggleOverviewClassif     = _toggleOverviewClassif;
window._toggleOverviewDirection   = _toggleOverviewDirection;
window._onActPDVSelect            = _onActPDVSelect;
window._onStatutDetailleSelect    = _onStatutDetailleSelect;
window._onStatutSelect            = _onStatutSelect;
window._onUniversSelect           = _onUniversSelect;
window._toggleDept                = _toggleDept;
window._toggleDeptDropdown        = _toggleDeptDropdown;
window._toggleClassifDropdown     = _toggleClassifDropdown;
window._toggleDirectionDropdown   = _toggleDirectionDropdown;
window._toggleStrategiqueFilter   = _toggleStrategiqueFilter;
window._toggleSansMetier          = _toggleSansMetier;
window._onCommercialFilter        = _onCommercialFilter;
window._onCommercialInput         = _onCommercialInput;
window._setDistanceQuick          = _setDistanceQuick;
window._updateDistQuickBtns       = _updateDistQuickBtns;
window._onTerrClientSearch        = _onTerrClientSearch;
window._terrSelectClient          = _terrSelectClient;
window._onMetierFilter            = _onMetierFilter;
window._navigateToOverviewMetier  = _navigateToOverviewMetier;
window._toggleExcludeActifsConsomme = _toggleExcludeActifsConsomme;
window._togglePerdu24m            = _togglePerdu24m;
window._resetChalandiseFilters    = _resetChalandiseFilters;
window._toggleOverviewL2          = _toggleOverviewL2;
window._toggleOverviewL3          = _toggleOverviewL3;
window._toggleOverviewL4          = _toggleOverviewL4;
window._buildChalandiseOverview   = _buildChalandiseOverview;
window._renderOverviewL4          = _renderOverviewL4;
