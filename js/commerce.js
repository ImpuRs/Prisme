'use strict';

// ── ESM imports ─────────────────────────────────────────────────────────
import { _S } from './state.js';
import { DataStore } from './store.js';
import {
  formatEuro, escapeHtml, _copyCodeBtn, fmtDate, matchQuery,
  daysBetween, famLib, famLabel,
  _normalizeClassif, _normalizeStatut,
  _isMetierStrategique, getSecteurDirection, formatLocalYMD
} from './utils.js';
import {
  _clientPassesFilters, _unikLink,
  _passesClientCrossFilter,
  _isGlobalActif, _isPerdu,
  _isPerdu24plus, _clientStatusText,
  getUniversFilteredCA
} from './engine.js';
import { getSelectedSecteurs } from './parser.js';
import { renderInsightsBanner, showToast } from './ui.js';
import { deltaColor, renderOppNetteTable, renderAnglesMortsTable } from './helpers.js';
import { openClient360, closeDiagnostic, openDiagnosticMetier } from './diagnostic.js';
import { _saveExclusions } from './cache.js';
import { getClientsActiveSetInPeriod } from './sales.js';
import {
  aggregateOverviewGroups,
  aggregateOverviewClients,
  aggregateOverviewMetiers,
  aggregateOverviewSecteurs,
  buildOverviewCacheKey as _buildOverviewCacheKey,
  getFilteredChalandiseEntries as _getFilteredChalandiseEntriesRaw,
  getOverviewMode,
  invalidateFilteredChalandise,
  passesOverviewClient as _passesOverviewClientRaw,
  setOverviewMode
} from './commerce-conquete.js';
import {
  renderOverviewHead,
  renderOverviewL1Rows,
  renderOverviewL2Table,
  renderOverviewL3Table,
  renderOverviewL4Table,
  renderTerrainFocusCoach
} from './commerce-conquete-view.js?v=20260425d';
import { createConqueteOverviewController, installConqueteOverviewController } from './commerce-conquete-controller.js';
import {
  buildPochesTerrain,
  computeCommercialScorecard,
  renderCommercialScorecard,
  renderPochesTerrain
} from './commerce-terrain-widgets.js?v=20260425f';
import { renderCommercialTopActions } from './commerce-top-actions.js?v=20260425f';

// ── Cross-module calls via window.xxx (avoid circular deps) ─────────────
// territoire.js (ex-terrain.js): buildTerrContrib, renderTerrContrib, renderTerrCroisementSummary

const buildTerrContrib = (...a) => window.buildTerrContrib?.(...a);
const renderTerrContrib = (...a) => window.renderTerrContrib?.(...a);
const renderTerrCroisementSummary = (...a) => window.renderTerrCroisementSummary?.(...a);
const getKPIsByCanal = (...a) => window.getKPIsByCanal?.(...a);

// ── Indices finalData (hot path) ─────────────────────────────────────────
// Beaucoup de renders construisaient `new Map(finalData.map(...))` à répétition.
// On garde un cache par référence d'array (finalData ne change qu'au parsing).
let _finalDataIndexSrc = null;
let _finalDataIndex = null;
function _getFinalDataIndex() {
  const src = DataStore.finalData || [];
  if (_finalDataIndex && _finalDataIndexSrc === src) return _finalDataIndex;
  const m = new Map();
  for (const r of src) { if (r && r.code) m.set(r.code, r); }
  _finalDataIndexSrc = src;
  _finalDataIndex = m;
  return m;
}

// ── Nav 4 sous-vues Commerce ─────────────────────────────────────────────
let _cmTab = 'enDanger';
let _cmShowSurveiller = false; // toggle "À surveiller" (30-60j) dans onglet En danger
let _commerceRafId = 0; // rAF ID pour annuler les rAF en attente au re-render

// ── Secteur dropdown outside click handler (migré depuis omni.js) ─────────
document.addEventListener('click',function(e){
  const dd=document.getElementById('terrSecteurDropdown');
  if(dd&&!dd.contains(e.target)){const panel=document.getElementById('terrSecteurPanel');if(panel)panel.classList.add('hidden');}
});

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
function _cmRenderNav(counts) {
  const tabs = [
    { id: 'enDanger',     label: '⚠️ En danger (60j-6m)',    n: counts.enDanger },
    { id: 'perdus',       label: '🔴 Perdus (6-12m)',        n: counts.perdus },
    { id: 'abandonnes',   label: '⚫ Abandonnés (>12m)',     n: counts.abandonnes },
    { id: 'potentiels',   label: '🎯 Potentiels',            n: counts.potentiels },
  ];
  const tabHtml = tabs.map(t => {
    const active = _cmTab === t.id;
    return `<button onclick="window._cmSwitchTab('${t.id}')"
      class="px-3 py-2 text-sm font-semibold transition-colors ${active ? 'border-b-2 c-action' : 't-secondary hover:t-primary'}"
      style="${active ? 'border-color:var(--c-action)' : ''}">${t.label}${t.n != null ? ` <span class="text-[10px] font-normal">(${t.n})</span>` : ''}</button>`;
  }).join('');
  return tabHtml;
}

// RÈGLE PRISME — render autonome :
// Chaque case injecte d'abord ses slots HTML, puis appelle la fonction de peuplement.
// index.html ne contient que les conteneurs d'onglets vides.
// Pour déplacer un pavé : changer le case ici, rien d'autre.
function _cmInjectSlot(id, content) {
  switch (id) {
    case 'enDanger':   content.innerHTML = `<div id="terrEnDanger"></div>`; break;
    case 'perdus':     content.innerHTML = `<div id="terrPerdus"></div>`; break;
    case 'abandonnes': content.innerHTML = `<div id="terrAbandonnes"></div>`; break;
    case 'potentiels': content.innerHTML = `<div id="terrACapter"></div>`; break;
    case 'canal': content.innerHTML = ''; break;
  }
}

function _cmRenderContent(id) {
  if (id === 'enDanger' || id === 'perdus' || id === 'abandonnes' || id === 'potentiels') _renderCockpitTables();
  if (id === 'canal') window.renderCanalAgence?.();
}

// Changement d'onglet complet (user click) — recalcule les données
function _cmSwitchTab(id) {
  _cmTab = id;
  _S._cmTab = id;
  _S._cmPages = {};
  const nav = document.getElementById('cm-tab-nav');
  const content = document.getElementById('cm-tab-content');
  if (!nav || !content) return;
  _cmInjectSlot(id, content);
  _buildCockpitClient();
  _cmRenderContent(id);
  nav.innerHTML = _cmRenderNav(_cmComputeCounts());
}

// Rendu seul (pas de recalcul) — utilisé au chargement initial
function _cmSwitchTabRenderOnly(id) {
  _cmTab = id;
  _S._cmTab = id;
  const nav = document.getElementById('cm-tab-nav');
  const content = document.getElementById('cm-tab-content');
  if (!nav || !content) return;
  _cmInjectSlot(id, content);
  _cmRenderContent(id);
  nav.innerHTML = _cmRenderNav(_cmComputeCounts());
}

function _cmComputeCounts() {
  return {
    enDanger: (_S._cockpitExportData?.surveiller?.length || 0) + (_S._cockpitExportData?.enDanger?.length || 0),
    perdus: _S._cockpitExportData?.perdus?.length || 0,
    abandonnes: _S._cockpitExportData?.abandonnes?.length || 0,
    potentiels: _S._cockpitExportData?.jamaisVenus?.length || 0,
  };
}


// ── Drill chalandise — Vue par Direction (mode sans territoire) ──────────
const _DIR_LABELS = { '-': 'Second Œuvre', 'DVM': 'Maintenance', 'DVI': 'DVI Industrie', 'DVP': 'DVP Plomberie' };

// ── Vue territoire en cascade (Direction → Métier → Clients, tout en DOM) ──
let _chalDirHtml = '';
let _chalDirKey = '';
let _chalDirMode = 'direction'; // 'direction' | 'secteur'
window._chalToggleMode = function(mode) {
  _chalDirMode = mode;
  _chalDirKey = ''; _chalDirHtml = ''; // invalider cache
  const blkEl = document.getElementById('terrDirectionContainer');
  if (blkEl) _buildChalDirBlock(blkEl);
};
function _buildChalDirBlock(blkEl) {
  if (!blkEl || !_S.chalandiseReady) return;
  // Cache : dépend des filtres sidebar chalandise + mode + canal
  const _key = `${_chalDirMode}|${[..._S._selectedDepts||[]].sort().join(',')}|${[..._S._selectedClassifs||[]].sort().join(',')}|${[..._S._selectedActivitesPDV||[]].sort().join(',')}|${_S._filterStrategiqueOnly?'1':'0'}|${_S._selectedMetier||''}|${_S._selectedCommercial||''}|${_S._distanceMaxKm||0}|${_S.periodFilterStart?.getTime()||0}|${_S.periodFilterEnd?.getTime()||0}|${_S._reseauMagasinMode||'all'}|${_S.clientsMagasin?.size||0}|${_S._terrClientSearch||''}|${_S._globalCanal||''}`;
  if (_chalDirKey === _key && _chalDirHtml) {
    if (blkEl.dataset.cdk === _key) return;
    blkEl.innerHTML = _chalDirHtml;
    blkEl.dataset.cdk = _key;
    return;
  }
  // Single-pass: filter + group by primary axis (direction or secteur) → métier → clients
  // Canal-aware captation set (same logic as overview)
  const _cdCanal=_S._globalCanal||'';
  let cmSet = getClientsActiveSetInPeriod(_cdCanal, { magasinMode: _S._reseauMagasinMode || 'all' });
  if (!cmSet) {
    // Fallback legacy : structures period-filtered (ne se recalculent pas sans reparse)
    if(!_cdCanal){
      cmSet=new Set(_S.clientsMagasin||[]);
      if(_S.ventesLocalHorsMag)for(const cc of _S.ventesLocalHorsMag.keys())cmSet.add(cc);
    }else if(_cdCanal==='MAGASIN'){
      cmSet=_S.clientsMagasin||new Set();
    }else{
      cmSet=new Set();
      if(_S.ventesLocalHorsMag)for(const[cc,artMap] of _S.ventesLocalHorsMag){for(const[,v] of artMap){if((v.canal||'')===_cdCanal){cmSet.add(cc);break;}}}
    }
  }
  const _cdLabel=_cdCanal?(_CANAL_LABELS_OV[_cdCanal]||_cdCanal):'PDV';
  const chalData = _S.chalandiseData || new Map();
  const byDir = new Map();
  let allLen = 0, allActifs = 0, allPDV = 0;
  for (const [cc, info] of chalData) {
    if (!_passesAllFilters(cc)) continue;
    const c = { cc, ...info };
    const d = _chalDirMode === 'secteur' ? (c.secteur || 'Autre') : (c.direction || 'Autre');
    let bm = byDir.get(d);
    if (!bm) { bm = new Map(); byDir.set(d, bm); }
    const m = c.metier || '—';
    let arr = bm.get(m);
    if (!arr) { arr = []; bm.set(m, arr); }
    arr.push(c);
    allLen++;
    if (c.statut === 'Actif') allActifs++;
    if (cmSet?.has(cc)) allPDV++;
  }
  const _lbl = d => _DIR_LABELS[d] || d || 'Autre';

  // Count statuses over a client array without allocating intermediates.
  const _grp = clients => {
    const g = {total:0,aL:0,aP:0,pro:0,per:0,ina:0};
    for (const c of clients) {
      g.total++;
      const st = c.statut;
      if (st === 'Actif') g.aL++;
      else if (st === 'Prospect') g.pro++;
      else if (st === 'Inactif') g.ina++;
      if (cmSet?.has(c.cc)) g.aP++;
      if (c.statutDetaille === 'Perdu 12-24 mois') g.per++;
    }
    return g;
  };

  // Pre-aggregate: for each direction, compute total client count and the per-métier _grp once.
  // Direction-level _grp is summed from métier-level _grp (avoids re-iterating clients).
  // This replaces 2× flatten+spread per direction in the sort comparator and the subsequent _grp call.
  const dirRows = [];
  for (const [d, bm] of byDir) {
    let dirTotal = 0;
    const metierRows = [];
    const dirG = {total:0,aL:0,aP:0,pro:0,per:0,ina:0};
    for (const [m, mc] of bm) {
      const gm = _grp(mc);
      dirTotal += mc.length;
      dirG.total += gm.total;
      dirG.aL += gm.aL;
      dirG.aP += gm.aP;
      dirG.pro += gm.pro;
      dirG.per += gm.per;
      dirG.ina += gm.ina;
      metierRows.push({ m, mc, gm });
    }
    metierRows.sort((a, b) => b.mc.length - a.mc.length);
    dirRows.push({ d, dirTotal, g: dirG, metierRows });
  }
  dirRows.sort((a, b) => b.dirTotal - a.dirTotal);

  const pctCap = allLen > 0 ? Math.round(allActifs / allLen * 100) : 0;
  const totalPDV = allPDV;
  let html='';
  let di=0;

  for (const { d, metierRows, g } of dirRows) {
    const pL=g.total>0?Math.round(g.aL/g.total*100):0, pP=g.total>0?Math.round(g.aP/g.total*100):0;
    html+=`<tr onclick="window._ccd(${di})" style="cursor:pointer" class="border-b hover:s-card-alt font-semibold">
      <td class="py-1.5 px-2">${escapeHtml(_lbl(d))} <span id="cda${di}" class="t-disabled text-[8px]">▶</span></td>
      <td class="py-1.5 px-2 text-right font-bold">${g.total}</td>
      <td class="py-1.5 px-2 text-right c-ok">${g.aL}</td>
      <td class="py-1.5 px-2 text-right c-ok">${g.aP}</td>
      <td class="py-1.5 px-2 text-right" style="color:var(--c-info)">${g.pro}</td>
      <td class="py-1.5 px-2 text-right c-caution">${g.per}</td>
      <td class="py-1.5 px-2 text-right t-disabled">${g.ina}</td>
      <td class="py-1.5 px-2 text-right t-secondary text-[10px]">${pL}%</td>
      <td class="py-1.5 px-2 text-right t-secondary text-[10px]">${pP}%</td>
    </tr>`;
    let mi=0;
    for (const { m, mc, gm } of metierRows) {
      const star=_isMetierStrategique(m)?' ⭐':'';
      const pLm=gm.total>0?Math.round(gm.aL/gm.total*100):0, pPm=gm.total>0?Math.round(gm.aP/gm.total*100):0;
      html+=`<tr id="ccm${di}_${mi}" onclick="window._ccm(${di},${mi})" style="display:none;cursor:pointer;background:rgba(139,92,246,0.05)" class="border-b hover:s-card-alt" data-d="${di}">
        <td class="py-1.5 px-2 pl-6 text-[11px]">${escapeHtml(m)}${star} <span id="cma${di}_${mi}" class="t-disabled text-[8px]">▶</span></td>
        <td class="py-1.5 px-2 text-right">${gm.total}</td>
        <td class="py-1.5 px-2 text-right c-ok">${gm.aL}</td>
        <td class="py-1.5 px-2 text-right c-ok">${gm.aP}</td>
        <td class="py-1.5 px-2 text-right" style="color:var(--c-info)">${gm.pro}</td>
        <td class="py-1.5 px-2 text-right c-caution">${gm.per}</td>
        <td class="py-1.5 px-2 text-right t-disabled">${gm.ina}</td>
        <td class="py-1.5 px-2 text-right t-secondary text-[10px]">${pLm}%</td>
        <td class="py-1.5 px-2 text-right t-secondary text-[10px]">${pPm}%</td>
      </tr>`;
      // Niveau Commercial
      const byComm=new Map();
      for(const c of mc){const com=c.commercial||'—';let a=byComm.get(com);if(!a){a=[];byComm.set(com,a);}a.push(c);}
      const commRows=[];
      for(const[com,cc_list] of byComm) commRows.push([com,cc_list]);
      commRows.sort((a,b)=>b[1].length-a[1].length);
      let ci=0;
      for(const[com,cc_list] of commRows){
        const gc=_grp(cc_list);
        const pLc=gc.total>0?Math.round(gc.aL/gc.total*100):0,pPc=gc.total>0?Math.round(gc.aP/gc.total*100):0;
        html+=`<tr id="ccc${di}_${mi}_${ci}" onclick="window._ccc(${di},${mi},${ci})" style="display:none;cursor:pointer;background:rgba(139,92,246,0.08)" class="border-b hover:s-card-alt" data-m="${di}_${mi}">
          <td class="py-1.5 px-2 pl-9 text-[10px] font-medium">${escapeHtml(com)} <span id="ccca${di}_${mi}_${ci}" class="t-disabled text-[8px]">▶</span></td>
          <td class="py-1.5 px-2 text-right text-[10px]">${gc.total}</td>
          <td class="py-1.5 px-2 text-right c-ok text-[10px]">${gc.aL}</td>
          <td class="py-1.5 px-2 text-right c-ok text-[10px]">${gc.aP}</td>
          <td class="py-1.5 px-2 text-right text-[10px]" style="color:var(--c-info)">${gc.pro}</td>
          <td class="py-1.5 px-2 text-right c-caution text-[10px]">${gc.per}</td>
          <td class="py-1.5 px-2 text-right t-disabled text-[10px]">${gc.ina}</td>
          <td class="py-1.5 px-2 text-right t-secondary text-[10px]">${pLc}%</td>
          <td class="py-1.5 px-2 text-right t-secondary text-[10px]">${pPc}%</td>
        </tr>`;
        for(const c of [...cc_list].sort((a,b)=>((b.ca2025||0)+(b.ca2026||0))-((a.ca2025||0)+(a.ca2026||0))).slice(0,20)){
          const ca=(c.ca2025||0)+(c.ca2026||0),star2=c.classification?.includes('Pot+')?'⭐ ':'';
          html+=`<tr style="display:none;cursor:pointer;background:rgba(139,92,246,0.02)" class="border-b hover:s-card-alt text-[10px]" data-c="${di}_${mi}_${ci}" onclick="openClient360('${escapeHtml(c.cc)}','territoire')">
            <td class="py-1 px-2 pl-12">${cmSet?.has(c.cc)?'✅ ':'○ '}${star2}<span class="font-medium">${escapeHtml(c.nom||c.cc)}</span><button onclick="event.stopPropagation();openClient360('${escapeHtml(c.cc)}','territoire')" class="text-[10px] t-disabled hover:text-white cursor-pointer opacity-30 hover:opacity-100 transition-opacity ml-1" title="Ouvrir la fiche 360°">🔍</button> <span class="t-disabled">${c.cc}</span></td>
            <td class="py-1 px-2 text-right" colspan="3">${escapeHtml(c.statut||'—')}</td>
            <td class="py-1 px-2 text-right">${ca>0?formatEuro(ca):'—'}</td>
            <td class="py-1 px-2 t-secondary" colspan="4">${escapeHtml(c.classification||'—')}</td>
          </tr>`;
        }
        ci++;
      }
      mi++;
    }
    di++;
  }

  const _isDir = _chalDirMode === 'direction';
  const _isSec = _chalDirMode === 'secteur';
  const _tabStyle = (active) => `cursor:pointer;padding:4px 12px;border-radius:6px;font-size:11px;font-weight:700;${active?'background:rgba(139,92,246,0.3);color:#c4b5fd':'color:rgba(167,139,250,0.5)'}`;
  const _axisLabel = _isDir ? 'Direction' : 'Secteur';
  blkEl.innerHTML=`<div style="display:flex;align-items:center;justify-content:space-between;padding:12px 16px;background:linear-gradient(135deg,rgba(139,92,246,0.2),rgba(109,40,217,0.12));border-bottom:1px solid rgba(139,92,246,0.2)">
    <div style="display:flex;align-items:center;gap:10px">
      <span style="font-weight:800;font-size:12px;color:#a78bfa">🎯 Votre territoire</span>
      <span onclick="window._chalToggleMode('direction')" style="${_tabStyle(_isDir)}">Direction</span>
      <span onclick="window._chalToggleMode('secteur')" style="${_tabStyle(_isSec)}">Secteur</span>
    </div>
    <span class="text-[10px] t-disabled">${byDir.size} ${_axisLabel.toLowerCase()}s · ${allLen} clients · ${totalPDV} actifs PDV${_cdCanal&&_cdCanal!=='MAGASIN'?' (via '+_cdLabel+')':''} · ${pctCap}% captés</span>
  </div>
  <div class="overflow-x-auto"><table class="min-w-full text-xs">
    <thead class="s-panel-inner t-inverse"><tr class="text-[10px]">
      <th class="py-1.5 px-2 text-left">${_axisLabel}</th>
      <th class="py-1.5 px-2 text-right">Total</th><th class="py-1.5 px-2 text-right">Actifs Leg.</th>
      <th class="py-1.5 px-2 text-right">Actifs PDV${_cdCanal&&_cdCanal!=='MAGASIN'?' <span class="t-disabled font-normal">(via '+_cdLabel+')</span>':''}</th><th class="py-1.5 px-2 text-right">Prospects</th>
      <th class="py-1.5 px-2 text-right">Perdus 12-24m</th><th class="py-1.5 px-2 text-right">Inactifs</th>
      <th class="py-1.5 px-2 text-right">% Capté Leg.</th><th class="py-1.5 px-2 text-right">% Capté PDV${_cdCanal&&_cdCanal!=='MAGASIN'?' <span class="t-disabled font-normal">(via '+_cdLabel+')</span>':''}</th>
    </tr></thead>
    <tbody>${html||`<tr><td colspan="9" class="text-center py-4 t-disabled">Aucune donnée</td></tr>`}</tbody>
  </table></div>`;
  _chalDirHtml = blkEl.innerHTML;
  _chalDirKey = _key;
  blkEl.dataset.cdk = _key;
}

// ── Toggles cascade ────────────────────────────────────────────────────────
window._ccd = di => {
  const arr=document.getElementById(`cda${di}`);
  const opening=arr&&arr.textContent==='▶';
  document.querySelectorAll(`[data-d="${di}"]`).forEach(r=>{
    r.style.display=opening?'table-row':'none';
    if(!opening){
      // fermer niveaux métier/commercial/clients enfants
      const parts=r.id.replace('ccm','').split('_'),mi=parts[1];
      document.querySelectorAll(`[data-m="${di}_${mi}"]`).forEach(cr=>{
        cr.style.display='none';
        const parts2=cr.id?.replace('ccc','').split('_'),ci2=parts2?.[2];
        if(ci2!==undefined)document.querySelectorAll(`[data-c="${di}_${mi}_${ci2}"]`).forEach(cl=>cl.style.display='none');
        const ca=document.getElementById(`ccca${di}_${mi}_${ci2}`);if(ca)ca.textContent='▶';
      });
      const ma=document.getElementById(`cma${di}_${mi}`);if(ma)ma.textContent='▶';
    }
  });
  if(arr)arr.textContent=opening?'▼':'▶';
};
window._ccm = (di,mi) => {
  const arr=document.getElementById(`cma${di}_${mi}`);
  const opening=arr&&arr.textContent==='▶';
  document.querySelectorAll(`[data-m="${di}_${mi}"]`).forEach(r=>{
    r.style.display=opening?'table-row':'none';
    if(!opening){
      // fermer niveaux commercial/clients enfants
      const parts=r.id?.replace('ccc','').split('_'),ci=parts?.[2];
      if(ci!==undefined){document.querySelectorAll(`[data-c="${di}_${mi}_${ci}"]`).forEach(cl=>cl.style.display='none');const ca=document.getElementById(`ccca${di}_${mi}_${ci}`);if(ca)ca.textContent='▶';}
    }
  });
  if(arr)arr.textContent=opening?'▼':'▶';
};
window._ccc = (di,mi,ci) => {
  const arr=document.getElementById(`ccca${di}_${mi}_${ci}`);
  const opening=arr&&arr.textContent==='▶';
  document.querySelectorAll(`[data-c="${di}_${mi}_${ci}"]`).forEach(r=>r.style.display=opening?'table-row':'none');
  if(arr)arr.textContent=opening?'▼':'▶';
};

// ── Extracted code (unchanged) ──────────────────────────────────────────

  function _renderHorsZone(){
    const el=document.getElementById('terrHorsZone');if(!el)return;
    if(!_S.chalandiseReady||!_S.clientStore?.size){el.innerHTML='';return;}
    const page=_S._horsZonePage||0;
    const HZ_PAGE=20;
    const _tcsHz=(_S._terrClientSearch||'').toLowerCase();const _mHz=rec=>!_tcsHz||rec.cc.includes(_tcsHz)||rec.nom.toLowerCase().includes(_tcsHz);
    const hors=[];
    for(const rec of _S.clientStore.values()){
      if(rec.inChalandise)continue;
      if((rec.caPDV||0)<200)continue;
      if(!_passesAllFilters(rec.cc))continue;
      if(!_mHz(rec))continue;
      hors.push({cc:rec.cc,nom:rec.nom,caPDV:rec.caPDV,caHors:rec.caHors||0,caTotal:rec.caTotal||0,lastDate:rec.lastOrderPDV});
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
      return`<tr class="border-b b-light hover:s-hover cursor-pointer transition-colors" data-cc="${escapeHtml(r.cc)}" onclick="openClient360(this.dataset.cc,'territoire')"><td class="py-1.5 px-2 font-bold text-[11px]">${escapeHtml(r.nom)}<button onclick="event.stopPropagation();openClient360('${escapeHtml(r.cc)}','territoire')" class="text-[10px] t-disabled hover:text-white cursor-pointer opacity-30 hover:opacity-100 transition-opacity ml-1" title="Ouvrir la fiche 360°">🔍</button></td><td class="py-1.5 px-2 text-right font-bold c-action text-[11px]">${formatEuro(r.caPDV)}</td><td class="py-1.5 px-2 text-right text-[11px]">${formatEuro(r.caTotal)}</td><td class="py-1.5 px-2 text-right text-[10px] ${_dc}">${r.caHors>0?'+'+formatEuro(r.caHors):'—'}</td><td class="py-1.5 px-2 text-center text-[10px] ${silColor}">${silence}</td></tr>`;
    }).join('');
    el.innerHTML=`<div class="mb-5 s-card rounded-xl border overflow-hidden"><div class="flex items-center gap-2 px-4 py-3 s-card-alt border-b"><h3 class="font-extrabold text-sm c-caution">⚠️ Clients PDV hors zone <span class="text-[10px] font-normal t-disabled ml-1">${hors.length} client${hors.length>1?'s':''} absents de la chalandise</span></h3></div><p class="text-[10px] t-tertiary px-4 py-2 border-b b-light">Clients livrés au PDV mais absents de la zone de chalandise — vérifier s'ils doivent être ajoutés.</p><div class="overflow-x-auto"><table class="min-w-full text-xs"><thead class="s-panel-inner t-inverse font-bold"><tr><th class="py-2 px-2 text-left">Client</th><th class="py-2 px-2 text-right">CA PDV</th><th class="py-2 px-2 text-right">CA Total</th><th class="py-2 px-2 text-right">Delta hors</th><th class="py-2 px-2 text-center">Silence</th></tr></thead><tbody>${rows}</tbody></table></div>${pagerHtml}</div>`;
  }

  function _passesAllFilters(cc){
    // Filtre recherche client (terrSearch)
    const _qCli=(_S._terrClientSearch||'').toLowerCase();
    if(_qCli){
      const info0=_S.chalandiseData?.get(cc);
      const nom0=(info0?.nom||_S.clientNomLookup?.[cc]||'').toLowerCase();
      if(!cc.includes(_qCli)&&!nom0.includes(_qCli))return false;
    }
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
    if(view==='multicanaux'){const _r=_S.clientStore?.get(cc);if(!_r||(_r.caHors||0)<=(_r.caPDV||0))return false;}
    if(view==='dormants'){const _r=_S.clientStore?.get(cc);const silence=_r?.silenceDaysPDV??999;if(silence<=180)return false;}
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

  // ── Helper hasTerr — vérifie les vraies données territoire disponibles ──
  // territoireReady peut rester false après restauration cache (bug connu),
  // mais terrDirectionData et terrContribByDirection sont toujours peuplés.
  const _hasTerritoire = () =>
    _S.territoireReady
    || Object.keys(_S.terrDirectionData||{}).length > 0
    || (_S.terrContribByDirection?.size > 0);

  // ── computeTerritoireKPIs — pure data for renderTerritoireTab ────────
  function computeTerritoireKPIs(){
    const livSansPDV=_S.livraisonsSansPDV||[];
    const hasTerr=_hasTerritoire();
    const hasChal=DataStore.chalandiseReady;
    const hasData=DataStore.finalData.length>0;
    const hasConsomme=_S.ventesLocalMagPeriode.size>0;
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
    return{livSansPDV,hasTerr,hasChal,hasData,hasConsomme,degraded,hasCross,crossCaptes,crossFideles,crossPotentiels};
  }

  // ── computeClientsKPIs — pure data for renderMesClients ──────────────
  function computeClientsKPIs(){
    let livSansPDV=_S.livraisonsSansPDV||[];
    const _gCanal=_S._globalCanal||'';
    const topPDVRows=[];
    const nouveaux=[];
    const horsZone=[];
    const digitaux=[];

    // ── Filtre Portefeuille (commercial) — se propage à TOUS les accordéons ──
    const _com=_S._selectedCommercial||'';
    const _comSet=_com?(_S.clientsByCommercial?.get(_com)||new Set()):null;
    const _hasChal=_S.chalandiseReady;
    // Filtre livSansPDV par commercial
    if(_comSet)livSansPDV=livSansPDV.filter(r=>_comSet.has(r.cc));

    if(_S.clientStore?.size){
      for(const rec of _S.clientStore.values()){
        // Filtre commercial (Portefeuille) — strict
        if(_comSet&&!_comSet.has(rec.cc))continue;
        // Filtres chalandise tactiques
        if(_hasChal&&rec.inChalandise){
          const info=_S.chalandiseData.get(rec.cc);
          if(info&&!_clientPassesFilters(info,rec.cc))continue;
          if(_S._excludeActifsConsomme&&_overviewCaptePDVSet?.has(rec.cc))continue;
          if(!_S._includePerdu24m&&info&&_isPerdu24plus(info))continue;
        }
        // ── Top clients par canal ──
        let caPDV=0,caHors=0,caTotal=rec.caTotal||0;
        if(!_gCanal){
          // Tous canaux
          caPDV=caTotal;caHors=0;
        }else if(_gCanal==='MAGASIN'){
          caPDV=rec.caPDV||0;caHors=rec.caHors||0;
        }else{
          // Canal spécifique hors-MAGASIN — besoin du détail par canal
          const horsMap=_S.ventesLocalHorsMag?.get(rec.cc);
          if(horsMap){let ca=0;for(const v of horsMap.values())if(v.canal===_gCanal)ca+=v.sumCA||0;caPDV=ca;}
          caHors=0;caTotal=caPDV;
        }
        if(caPDV>=100){
          topPDVRows.push({cc:rec.cc,nom:rec.nom,metier:rec.metier,classification:rec.classification,caLeg:rec.caTotal||0,commercial:rec.commercial,caPDV,caHors,caTotal,lastDate:rec.lastOrderPDV});
        }
        // ── Nouveaux / Réactivés (≤3 BL, dernière commande <60j) ──
        if(rec.isPDVActif&&(rec.nbBLPDV||0)<=3&&(rec.caPDV||0)>=100){
          const daysSince=rec.lastOrderPDV?Math.round((Date.now()-rec.lastOrderPDV)/86400000):null;
          if(daysSince!==null&&daysSince<60){
            const isReactive=(rec.caLegallaisN1||0)>0;
            nouveaux.push({cc:rec.cc,nom:rec.nom,metier:rec.metier,classification:rec.classification,caLeg:rec.caTotal||0,commercial:rec.commercial,caPDV,nbBL:rec.nbBLPDV||0,lastDate:rec.lastOrderPDV,type:isReactive?'reactive':'nouveau'});
          }
        }
        // ── Hors zone (PDV sans chalandise) ──
        if(_S.chalandiseReady&&!rec.inChalandise&&(rec.caPDV||0)>=200){
          horsZone.push({cc:rec.cc,nom:rec.nom,caPDV:rec.caPDV,caHors:rec.caHors||0,caTotal:rec.caTotal||0,lastDate:rec.lastOrderPDV});
        }
        // ── Digitaux en fuite (acheteurs hors-magasin silencieux PDV) ──
        if((rec.caHors||0)>=200&&rec.isPDVActif&&(rec.silenceDaysPDV||0)>=90){
          // Besoin du détail canal pour mainCanal
          const horsMap=_S.ventesLocalHorsMag?.get(rec.cc);
          if(horsMap){
            const canalCA={};for(const v of horsMap.values()){canalCA[v.canal]=(canalCA[v.canal]||0)+(v.sumCA||0);}
            const mainCanal=Object.entries(canalCA).sort((a,b)=>b[1]-a[1])[0]?.[0]||'';
            digitaux.push({cc:rec.cc,nom:rec.nom,metier:rec.metier,commercial:rec.commercial,pdvSilence:rec.silenceDaysPDV,caPDV:rec.caPDV,caHors:rec.caHors,mainCanal});
          }
        }
      }
    }

    topPDVRows.sort((a,b)=>b.caPDV-a.caPDV);
    nouveaux.sort((a,b)=>b.caPDV-a.caPDV);
    horsZone.sort((a,b)=>b.caPDV-a.caPDV);
    digitaux.sort((a,b)=>b.caPDV-a.caPDV);
    return{livSansPDV,topPDVRows,nouveaux,horsZone,digitaux};
  }

  function renderTerritoireTab(){
    const k=computeTerritoireKPIs();
    // ── Blocs Clients PDV (Top 5, Top PDV, Hors zone, Reconquête, Opportunités) ──
    {
      const _setEl=(id,html)=>{const e=document.getElementById(id);if(e)e.innerHTML=html;};

      // Opportunités nettes — accordéon + tableau paginé (factorisé dans helpers.js)
      _setEl('terrOpportunites', renderOppNetteTable());

      // Angles Morts — familles tronc commun métier absentes chez le client
      _setEl('terrAnglesMorts', renderAnglesMortsTable());

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
    // NB: _buildChalandiseOverview() n'est PAS appelé ici — c'est le caller qui l'orchestre
    _buildChalandiseOverviewInner();
    const chalFilBlk=document.getElementById('terrChalandiseFiltersBlock');
    if(chalFilBlk)chalFilBlk.classList.toggle('hidden',!hasChal);
    const sumBar=document.getElementById('terrSummaryBar');if(sumBar&&!hasChal){sumBar.classList.add('hidden');sumBar.style.display='none';}


    if(!hasData&&!hasTerr&&!hasChal&&!hasConsomme)return;
    if(degraded){_buildDegradedCockpit();return;}
    if(!hasTerr){
      _buildDegradedCockpit();
      // terrDirectionContainer already handled above (hasChal path)
      return;
    }
    const q=(document.getElementById('terrSearch')||{}).value||'';
    const stockMap=_getFinalDataIndex();
    // [V3.2] Point d'entrée multi-dimensions — lit _globalCanal + _globalPeriodePreset + _selectedCommercial
    const _ctx=DataStore.byContext();
    const _canalGlobal=_ctx.activeFilters.canal;
    const _canalGlobalLabels={MAGASIN:'Magasin',INTERNET:'Internet',REPRÉSENTANT:'Représentant',DCS:'DCS',AUTRE:'Autre'};
    const _canalGlobalLabel=_canalGlobalLabels[_canalGlobal]||_canalGlobal;

    // ── Garde de cache territoire ─────────────────────────────────────────────
    // Clé inclut commercial (V3.2) : terrLines differ si commercial actif
    const _secteurKey=[...(getSelectedSecteurs()||[])].sort().join(',');
    const _periodeKey=`${_S.periodFilterStart?.getTime()||0}-${_S.periodFilterEnd?.getTime()||0}`;
    const _terrCacheKey=`${_canalGlobal||'ALL'}|${_ctx.activeFilters.commercial||''}|${_secteurKey}|${q}|${_periodeKey}`;
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

    // Cache local : évite 3× _filterByPeriode sur ~250k lignes
    const _allFilteredLines = DataStore.filteredTerritoireLines;

    // Global KPI stats — always from ALL lines (for croisement summary, lignes KPI)
    let caTotal=0,specialCA=0;
    const blSetAll=new Set();
    const clientsMap={};
    const dirSet=new Set();
    for(const l of _allFilteredLines){
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
    setSafe('terrKpiLignes',_allFilteredLines.length.toLocaleString('fr')); // filtrées par période
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
    const linesFiltered=_allFilteredLines.filter(l=>{
      if(_canalGlobal&&l.canal!==_canalGlobal)return false;
      if(l.isSpecial)return false;
      if(selectedSecteurs&&l.secteur&&!selectedSecteurs.has(l.secteur))return false;
      if(q&&!matchQuery(q,l.code,l.libelle,l.direction,l.clientCode,l.clientNom))return false;
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
    const qCli=_S._terrClientSearch||'';
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

    // _buildChalDirBlock réactif aux filtres sidebar (hasTerr path) — différé (6.7MB HTML)
    if(_S.chalandiseReady) setTimeout(()=>{const _dc=document.getElementById('terrDirectionContainer');if(_dc)_buildChalDirBlock(_dc);},0);

    // ── Stockage cache territoire ─────────────────────────────────────────
    // Captures les innerHTML APRÈS le rendu complet
    // Guard : ne pas stocker si les éléments DOM n'existent pas encore (appel depuis _initFromCache)
    if(!document.getElementById('terrTop100Table'))return;
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

  function renderCockpitRupClients(){
    const el=document.getElementById('cockpitRupClients');if(!el)return;
    const ruptureArts=DataStore.finalData.filter(r=>r.stockActuel<=0&&r.W>=3&&!r.isParent&&!(r.V===0&&r.enleveTotal>0));
    const rupClients=[];
    if(ruptureArts.length){
      const clientRupMap=new Map();
      for(const art of ruptureArts){
        const buyers=_S.articleClients.get(art.code);if(!buyers)continue;
        for(const cc of buyers){
          const nom=_S.clientStore?.get(cc)?.nom||cc;
          const caArt=(DataStore.ventesLocalMagPeriode.get(cc)||new Map()).get(art.code);
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

  // ★ BADGES FILTRES ACTIFS
  function renderMesClients(){
    const el=document.getElementById('tabClients');
    if(!el)return;
    if(!_S.ventesLocalMagPeriode.size && !_S.finalData.length){
      el.innerHTML='<div class="p-8 text-center t-disabled">Chargez d\'abord le fichier consommé.</div>';
      return;
    }
    if(_S.chalandiseReady) _buildOverviewFilterChips();
    const k=computeClientsKPIs();
    // ── Filtre recherche client (_terrClientSearch) — appliqué à toutes les sections ──
    const _qSrch=(_S._terrClientSearch||'').toLowerCase();
    if(_qSrch){
      const _matchC=(cc,nom)=>cc.toLowerCase().includes(_qSrch)||(nom||'').toLowerCase().includes(_qSrch)||(_S.clientStore?.get(cc)?.nom||'').toLowerCase().includes(_qSrch);
      k.topPDVRows=(k.topPDVRows||[]).filter(c=>_matchC(c.cc,c.nom));
      k.livSansPDV=k.livSansPDV.filter(c=>_matchC(c.cc,c.nom));
      k.horsZone=k.horsZone.filter(c=>_matchC(c.cc,c.nom));
      k.digitaux=(k.digitaux||[]).filter(c=>_matchC(c.cc,c.nom));
    }
    // ── S1: Top PDV ──────────────────────────────────────────────────────────
    const topPDVHtml=(()=>{
      const rows=k.topPDVRows||[];
      if(!rows.length)return'';
      const nowMs=Date.now();
      const _mkRow=r=>{
        const daysSince=r.lastDate?Math.round((nowMs-r.lastDate)/86400000):null;
        const silTxt=daysSince!==null?`${daysSince}j`:'—';
        const silCls=daysSince===null?'t-disabled':daysSince<30?'c-ok':daysSince<90?'c-caution':'c-danger';
        const hasHors=r.caHors>0;
        const _gcRow=_S._globalCanal||'';
        const _horsCell=_gcRow==='MAGASIN'?`<td class="py-1.5 px-2 text-right text-[10px] ${hasHors?'c-ok':'t-disabled'}">${hasHors?'+'+formatEuro(r.caHors):'—'}</td>`:'';
        const _classifCls=r.classification?.startsWith('FID')?'c-ok':r.classification?.startsWith('OCC')?'c-caution':'t-disabled';
        const _caLegCls=r.caLeg>0?(r.caLeg>r.caPDV*3?'c-caution':'t-secondary'):'t-disabled';
        return`<tr class="border-b b-light hover:s-hover cursor-pointer transition-colors" data-cc="${escapeHtml(r.cc)}" onclick="openClient360(this.dataset.cc,'clients')"><td class="py-1.5 px-2 font-bold text-[11px]">${escapeHtml(r.nom)}<button onclick="event.stopPropagation();openClient360('${escapeHtml(r.cc)}','clients')" class="text-[10px] t-disabled hover:text-white cursor-pointer opacity-30 hover:opacity-100 transition-opacity ml-1" title="Ouvrir la fiche 360°">🔍</button></td><td class="py-1.5 px-2 text-[11px] t-tertiary">${escapeHtml(r.metier||'—')}</td><td class="py-1.5 px-2 text-center text-[10px] ${_classifCls}">${escapeHtml(r.classification||'—')}</td><td class="py-1.5 px-2 text-right font-bold c-action text-[11px]">${formatEuro(r.caPDV)}</td><td class="py-1.5 px-2 text-right text-[10px] ${_caLegCls}">${r.caLeg>0?formatEuro(r.caLeg):'—'}</td>${_horsCell}<td class="py-1.5 px-2 text-center text-[10px] ${silCls}">${silTxt}</td><td class="py-1.5 px-2 text-[11px] c-action">${escapeHtml(r.commercial||'—')}</td></tr>`;
      };
      const top20=rows.slice(0,20);
      const _gc=_S._globalCanal||'';
      const _caLbl=_gc===''?'CA Total':_gc==='MAGASIN'?'CA PDV':_gc==='INTERNET'?'CA Internet':_gc==='REPRESENTANT'?'CA Représentant':_gc==='DCS'?'CA DCS':'CA';
      const _horsLbl=_gc==='MAGASIN'?'Hors agence':'';
      const _thRow=`<tr><th class="py-2 px-2 text-left">Client</th><th class="py-2 px-2 text-left">Métier</th><th class="py-2 px-2 text-center">Classif</th><th class="py-2 px-2 text-right">${_caLbl}</th><th class="py-2 px-2 text-right">CA Zone</th>${_horsLbl?`<th class="py-2 px-2 text-right">${_horsLbl}</th>`:''}<th class="py-2 px-2 text-center">Silence</th><th class="py-2 px-2 text-left">Commercial</th></tr>`;
      const moreHtml=rows.length>20?`<details class="border-t b-default"><summary class="px-4 py-2 text-[11px] c-action cursor-pointer select-none hover:underline">Voir tous → (${rows.length-20} de plus)</summary><div class="overflow-x-auto"><table class="min-w-full text-xs"><thead class="s-panel-inner t-inverse font-bold">${_thRow}</thead><tbody>${rows.slice(20).map(_mkRow).join('')}</tbody></table></div></details>`:'';
      const thStr=`<thead class="s-panel-inner t-inverse font-bold">${_thRow}</thead>`;
      return`<details style="background:linear-gradient(135deg,rgba(234,179,8,0.13),rgba(202,138,4,0.06));border:1px solid rgba(234,179,8,0.3);border-radius:14px;overflow:hidden;margin-bottom:12px"><summary style="padding:14px 20px;cursor:pointer;display:flex;align-items:center;justify-content:space-between;background:linear-gradient(135deg,rgba(234,179,8,0.2),rgba(202,138,4,0.12));border-bottom:1px solid rgba(234,179,8,0.2);list-style:none" class="select-none"><h3 style="font-weight:800;font-size:13px;color:#fde047;display:flex;align-items:center;gap:6px">🏆 Top clients <span style="font-size:10px;font-weight:400;color:rgba(255,255,255,0.45)">${rows.length} clients · ${_caLbl}</span></h3><span class="acc-arrow" style="color:#fde047">▶</span></summary><div class="overflow-x-auto"><table class="min-w-full text-xs">${thStr}<tbody>${top20.map(_mkRow).join('')}</tbody></table></div>${moreHtml}</details>`;
    })();
    // ── S1b: Nouveaux clients (≤3 BL, <60j) ──────────────────────────────────
    const nouveauxHtml=(()=>{
      const nv=k.nouveaux||[];
      if(!nv.length)return'';
      const nowMs=Date.now();
      const nbNouv=nv.filter(r=>r.type==='nouveau').length;
      const nbReact=nv.filter(r=>r.type==='reactive').length;
      const _mkRow=r=>{
        const daysSince=r.lastDate?Math.round((nowMs-r.lastDate)/86400000):null;
        const silTxt=daysSince!==null?`${daysSince}j`:'—';
        const _clCls=r.classification?.startsWith('FID')?'c-ok':r.classification?.startsWith('OCC')?'c-caution':'t-disabled';
        const typeBadge=r.type==='reactive'?'<span class="text-[8px] px-1.5 py-0.5 rounded-full font-semibold" style="background:rgba(59,130,246,0.2);color:#60a5fa">🔄 Réactivé</span>':'<span class="text-[8px] px-1.5 py-0.5 rounded-full font-semibold" style="background:rgba(34,197,94,0.2);color:#4ade80">🆕 Nouveau</span>';
        return`<tr class="border-b b-light hover:s-hover cursor-pointer transition-colors" data-cc="${escapeHtml(r.cc)}" onclick="openClient360(this.dataset.cc,'clients')"><td class="py-1.5 px-2 font-bold text-[11px]">${escapeHtml(r.nom)}<button onclick="event.stopPropagation();openClient360('${escapeHtml(r.cc)}','clients')" class="text-[10px] t-disabled hover:text-white cursor-pointer opacity-30 hover:opacity-100 transition-opacity ml-1" title="Ouvrir la fiche 360°">🔍</button> ${typeBadge}</td><td class="py-1.5 px-2 text-[11px] t-tertiary">${escapeHtml(r.metier||'—')}</td><td class="py-1.5 px-2 text-center text-[10px] ${_clCls}">${escapeHtml(r.classification||'—')}</td><td class="py-1.5 px-2 text-right font-bold c-ok text-[11px]">${formatEuro(r.caPDV)}</td><td class="py-1.5 px-2 text-center text-[10px] t-secondary">${r.nbBL} BL</td><td class="py-1.5 px-2 text-center text-[10px] c-ok">${silTxt}</td><td class="py-1.5 px-2 text-[11px] c-action">${escapeHtml(r.commercial||'—')}</td></tr>`;
      };
      const _subLabel=[nbNouv?`${nbNouv} nouveaux`:'',(nbReact?`${nbReact} réactivés`:'')].filter(Boolean).join(' · ');
      const _thRow=`<tr><th class="py-2 px-2 text-left">Client</th><th class="py-2 px-2 text-left">Métier</th><th class="py-2 px-2 text-center">Classif</th><th class="py-2 px-2 text-right">CA PDV</th><th class="py-2 px-2 text-center">Fréq.</th><th class="py-2 px-2 text-center">Dernier</th><th class="py-2 px-2 text-left">Commercial</th></tr>`;
      const top20=nv.slice(0,20);
      const moreHtml=nv.length>20?`<details class="border-t b-default"><summary class="px-4 py-2 text-[11px] c-action cursor-pointer select-none hover:underline">Voir tous → (${nv.length-20} de plus)</summary><div class="overflow-x-auto"><table class="min-w-full text-xs"><thead class="s-panel-inner t-inverse font-bold">${_thRow}</thead><tbody>${nv.slice(20).map(_mkRow).join('')}</tbody></table></div></details>`:'';
      return`<details style="background:linear-gradient(135deg,rgba(34,197,94,0.12),rgba(22,163,74,0.06));border:1px solid rgba(34,197,94,0.25);border-radius:14px;overflow:hidden;margin-bottom:12px"><summary style="padding:14px 20px;cursor:pointer;display:flex;align-items:center;justify-content:space-between;background:linear-gradient(135deg,rgba(34,197,94,0.18),rgba(22,163,74,0.10));border-bottom:1px solid rgba(34,197,94,0.2);list-style:none" class="select-none"><h3 style="font-weight:800;font-size:13px;color:#4ade80;display:flex;align-items:center;gap:6px">🆕 Nouveaux / Réactivés <span style="font-size:10px;font-weight:400;color:rgba(255,255,255,0.45)">${nv.length} clients · ${_subLabel}</span></h3><span class="acc-arrow" style="color:#4ade80">▶</span></summary><div class="overflow-x-auto"><table class="min-w-full text-xs"><thead class="s-panel-inner t-inverse font-bold">${_thRow}</thead><tbody>${top20.map(_mkRow).join('')}</tbody></table></div>${moreHtml}</details>`;
    })();

    // ── S2b: Livrés sans PDV — DÉPLACÉ dans Conquête Terrain (livSansPDVBlock) ──

    // ── S3: Opportunités nettes — accordéon + tableau paginé (factorisé dans helpers.js)
    const oppsHtml = renderOppNetteTable();

    // ── S3a: Angles Morts — familles tronc commun métier absentes
    const anglesMortsHtml = renderAnglesMortsTable();

    // ── S3b: Ce que mes clients achètent ailleurs (nomadesMissedArts) ─────
    const nomadesMissedHtml = (()=>{
      const _rawNM = _S.nomadesMissedArts || [];
      // Filtre Portefeuille sur le badge aussi
      const _comNM = _S._selectedCommercial || '';
      const _comSetNM = _comNM ? (_S.clientsByCommercial?.get(_comNM) || new Set()) : null;
      const list = _comSetNM ? _rawNM.filter(a => (a.clientCodes || []).some(cc => _comSetNM.has(cc))) : _rawNM;
      if (!list.length) return '';
      return `<details style="background:linear-gradient(135deg,rgba(217,119,6,0.15),rgba(180,83,9,0.08));border:1px solid rgba(217,119,6,0.3);border-radius:14px;overflow:hidden;margin-bottom:12px">
        <summary style="padding:14px 20px;cursor:pointer;display:flex;align-items:center;justify-content:space-between;background:linear-gradient(135deg,rgba(217,119,6,0.2),rgba(180,83,9,0.12));border-bottom:1px solid rgba(217,119,6,0.2);list-style:none" class="select-none">
          <div>
            <h3 style="font-weight:800;font-size:13px;display:flex;align-items:center;gap:8px;color:#fbbf24">
              🎯 Ce que mes clients achètent ailleurs
              <span style="background:rgba(251,191,36,0.15);color:#fbbf24;border-radius:999px;padding:2px 10px;font-size:11px;font-weight:700">${list.length}</span>
            </h3>
            <p style="font-size:11px;color:rgba(255,255,255,0.45);margin-top:2px">Articles achetés par vos clients dans d'autres agences · jamais vendus chez vous</p>
          </div>
          <div class="flex items-center gap-2">
            <button onclick="event.preventDefault();copyNomadesMissedArts()" style="font-size:10px;color:#fbbf24;background:rgba(251,191,36,0.12);border:1px solid rgba(251,191,36,0.3);padding:3px 8px;border-radius:6px;font-weight:700;cursor:pointer">📋 Copier</button>
            <span class="acc-arrow" style="color:#fbbf24">▶</span>
          </div>
        </summary>
        <div id="nomadesMissedArtsContainer" class="p-3"><p class="t-disabled text-sm">Chargement…</p></div>
      </details>`;
    })();

    // ── Clients PDV hors zone (PDV mais absents chalandise) ───────────────
    let horsZoneHtml='';
    {const hors=k.horsZone;
      _S._horsZoneExport=hors; // pour export CSV rattachement
      const nowMs=Date.now();
      if(hors.length){
        const rows=hors.slice(0,20).map(r=>{
          const daysSince=r.lastDate?Math.round((nowMs-r.lastDate)/86400000):null;
          const silence=daysSince!==null?`${daysSince}j`:'—';
          const silColor=daysSince===null?'t-disabled':daysSince<30?'c-ok':daysSince<90?'c-caution':'c-danger';
          const _dc=deltaColor(r.caHors,r.caPDV);
          return`<tr class="border-b b-light hover:s-hover cursor-pointer transition-colors" data-cc="${escapeHtml(r.cc)}" onclick="openClient360(this.dataset.cc,'clients')"><td class="py-1.5 px-2 font-bold text-[11px]">${escapeHtml(r.nom)}<button onclick="event.stopPropagation();openClient360('${escapeHtml(r.cc)}','clients')" class="text-[10px] t-disabled hover:text-white cursor-pointer opacity-30 hover:opacity-100 transition-opacity ml-1" title="Ouvrir la fiche 360°">🔍</button></td><td class="py-1.5 px-2 text-right font-bold c-action text-[11px]">${formatEuro(r.caPDV)}</td><td class="py-1.5 px-2 text-right text-[11px]">${formatEuro(r.caTotal)}</td><td class="py-1.5 px-2 text-right text-[10px] ${_dc}">${r.caHors>0?'+'+formatEuro(r.caHors):'—'}</td><td class="py-1.5 px-2 text-center text-[10px] ${silColor}">${silence}</td></tr>`;
        }).join('');
        const moreHtml=hors.length>20?`<details class="border-t b-default"><summary class="px-4 py-2 text-[11px] c-action cursor-pointer select-none hover:underline">Voir tous → (${hors.length-20} de plus)</summary><div class="overflow-x-auto"><table class="min-w-full text-xs"><thead class="s-panel-inner t-inverse font-bold"><tr><th class="py-2 px-2 text-left">Client</th><th class="py-2 px-2 text-right">CA PDV</th><th class="py-2 px-2 text-right">CA Total</th><th class="py-2 px-2 text-right">Delta hors</th><th class="py-2 px-2 text-center">Silence</th></tr></thead><tbody>${hors.slice(20).map(r=>{const ds2=r.lastDate?Math.round((nowMs-r.lastDate)/86400000):null;const s2=ds2!==null?`${ds2}j`:'—';const sc2=ds2===null?'t-disabled':ds2<30?'c-ok':ds2<90?'c-caution':'c-danger';const dc2=deltaColor(r.caHors,r.caPDV);return`<tr class="border-b b-light hover:s-hover cursor-pointer transition-colors" data-cc="${escapeHtml(r.cc)}" onclick="openClient360(this.dataset.cc,'clients')"><td class="py-1.5 px-2 font-bold text-[11px]">${escapeHtml(r.nom)}<button onclick="event.stopPropagation();openClient360('${escapeHtml(r.cc)}','clients')" class="text-[10px] t-disabled hover:text-white cursor-pointer opacity-30 hover:opacity-100 transition-opacity ml-1" title="Ouvrir la fiche 360°">🔍</button></td><td class="py-1.5 px-2 text-right font-bold c-action text-[11px]">${formatEuro(r.caPDV)}</td><td class="py-1.5 px-2 text-right text-[11px]">${formatEuro(r.caTotal)}</td><td class="py-1.5 px-2 text-right text-[10px] ${dc2}">${r.caHors>0?'+'+formatEuro(r.caHors):'—'}</td><td class="py-1.5 px-2 text-center text-[10px] ${sc2}">${s2}</td></tr>`;}).join('')}</tbody></table></div></details>`:'';
        horsZoneHtml=`<details style="background:linear-gradient(135deg,rgba(217,119,6,0.15),rgba(180,83,9,0.08));border:1px solid rgba(217,119,6,0.3);border-radius:14px;overflow:hidden;margin-bottom:12px"><summary style="padding:14px 20px;cursor:pointer;display:flex;align-items:center;justify-content:space-between;background:linear-gradient(135deg,rgba(217,119,6,0.2),rgba(180,83,9,0.12));border-bottom:1px solid rgba(217,119,6,0.2);list-style:none" class="select-none"><h3 style="font-weight:800;font-size:13px;color:#fbbf24;display:flex;align-items:center;gap:6px">⚠️ Clients PDV hors zone <span style="font-size:10px;font-weight:400;color:rgba(255,255,255,0.45)">${hors.length} client${hors.length>1?'s':''} absents de la chalandise</span></h3><div class="flex items-center gap-2"><button onclick="event.preventDefault();event.stopPropagation();exportHorsZoneCSV()" style="font-size:10px;color:#fbbf24;background:rgba(251,191,36,0.12);border:1px solid rgba(251,191,36,0.3);padding:3px 8px;border-radius:6px;font-weight:700;cursor:pointer">📥 CSV Rattachement</button><span class="acc-arrow" style="color:#fbbf24">▶</span></div></summary><p style="font-size:11px;color:rgba(255,255,255,0.45);padding:8px 20px;border-bottom:1px solid rgba(217,119,6,0.15)">Clients livrés au PDV mais absents de la zone de chalandise — remplissez la colonne "Commercial" et réimportez dans 🔗 Rattachement.</p><div class="overflow-x-auto"><table class="min-w-full text-xs"><thead class="s-panel-inner t-inverse font-bold"><tr><th class="py-2 px-2 text-left">Client</th><th class="py-2 px-2 text-right">CA PDV</th><th class="py-2 px-2 text-right">CA Total</th><th class="py-2 px-2 text-right">Delta hors</th><th class="py-2 px-2 text-center">Silence</th></tr></thead><tbody>${rows}</tbody></table></div>${moreHtml}</details>`;
      }
    }

    // ── Section 4b : Clients devenus digitaux ────────────────────────────
    let digitauxHtml='';
    {const digitaux=k.digitaux;
      const _digTop=digitaux.slice(0,8);
      if(_digTop.length){
        const cIcon=c=>c==='INTERNET'?'🌐':c==='REPRESENTANT'?'🤝':c==='DCS'?'📦':'📡';
        const cards=_digTop.map(r=>`<div class="s-card rounded-xl border p-3 cursor-pointer hover:s-hover transition-all" onclick="openClient360('${escapeHtml(r.cc)}','digitaux')">
  <div class="flex items-start justify-between mb-1">
    <div class="min-w-0"><div class="text-[11px] font-bold t-primary truncate">${escapeHtml(r.nom)}<button onclick="event.stopPropagation();openClient360('${escapeHtml(r.cc)}','digitaux')" class="text-[10px] t-disabled hover:text-white cursor-pointer opacity-30 hover:opacity-100 transition-opacity ml-1" title="Ouvrir la fiche 360°">🔍</button></div><div class="text-[9px] t-disabled">${r.metier||'—'}</div></div>
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

    // Scorecard portefeuille au-dessus du contenu
    const comScorecardHtml = _S.chalandiseReady && _S._selectedCommercial ? '<div id="comScorecardPDV"></div>' : '';
    // Tabs En danger/Perdus/Abandonnés/Potentiels (déplacés depuis Conquête Terrain)
    const tabNavHtml = `<div class="flex items-center gap-1 border-b b-default mb-0 overflow-x-auto mt-3" id="cm-tab-nav">${_cmRenderNav(_cmComputeCounts())}</div><div id="cm-tab-content" class="pt-3"></div>`;
    el.innerHTML = comScorecardHtml + tabNavHtml + oppsHtml + anglesMortsHtml + nomadesMissedHtml + nouveauxHtml + topPDVHtml + horsZoneHtml + digitauxHtml;
    // Peuple les tableaux cockpit dans les slots
    _buildCockpitClient();
    _cmSwitchTabRenderOnly(_cmTab);
    if (nomadesMissedHtml && typeof renderNomadesMissedArts === 'function') renderNomadesMissedArts();
    if(_S.chalandiseReady){ _populateCommercialSelect('terrCommercialSidebar','terrCommercialKPISidebar'); _renderCommercialScorecard('comScorecardPDV'); }
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
function _toggleOverviewActPDV(a,event){if(event)event.preventDefault();const all=_getChalAgg()?.activitesPDV||new Set();if(!_S._selectedActivitesPDV.size){_S._selectedActivitesPDV=new Set(all);_S._selectedActivitesPDV.delete(a);}else if(_S._selectedActivitesPDV.has(a)){_S._selectedActivitesPDV.delete(a);if(!_S._selectedActivitesPDV.size)_S._selectedActivitesPDV=new Set();}else{_S._selectedActivitesPDV.add(a);if(_S._selectedActivitesPDV.size>=all.size)_S._selectedActivitesPDV=new Set();}_buildChalandiseOverview();}
function _toggleOverviewStatut(s,event){if(event)event.preventDefault();const all=_getChalAgg()?.statutsNorm||new Set();if(!_S._selectedStatuts.size){_S._selectedStatuts=new Set(all);_S._selectedStatuts.delete(s);}else if(_S._selectedStatuts.has(s)){_S._selectedStatuts.delete(s);if(!_S._selectedStatuts.size)_S._selectedStatuts=new Set();}else{_S._selectedStatuts.add(s);if(_S._selectedStatuts.size>=all.size)_S._selectedStatuts=new Set();}_buildChalandiseOverview();}
function _toggleOverviewDirection(d,event){if(event)event.preventDefault();const all=_getChalAgg()?.directions||new Set();if(!_S._selectedDirections.size){_S._selectedDirections=new Set(all);_S._selectedDirections.delete(d);}else if(_S._selectedDirections.has(d)){_S._selectedDirections.delete(d);if(!_S._selectedDirections.size)_S._selectedDirections=new Set();}else{_S._selectedDirections.add(d);if(_S._selectedDirections.size>=all.size)_S._selectedDirections=new Set();}_buildChalandiseOverview();}
function _onActPDVSelect(v){_S._selectedActivitesPDV=v?new Set([v]):new Set();_buildChalandiseOverview();}
function _onStatutDetailleSelect(v){_S._selectedStatutDetaille=v||'';_buildChalandiseOverview();}
function _onStatutSelect(v){_S._selectedStatuts=v?new Set([v]):new Set();_buildChalandiseOverview();}
function _onUniversSelect(v){_S._selectedUnivers=v?new Set([v]):new Set();_buildChalandiseOverview();}
function _toggleOverviewUnivers(u,event){if(event)event.preventDefault();const all=new Set(_S._clientDominantUnivers.values());if(!_S._selectedUnivers.size){_S._selectedUnivers=new Set(all);_S._selectedUnivers.delete(u);}else if(_S._selectedUnivers.has(u)){_S._selectedUnivers.delete(u);if(!_S._selectedUnivers.size)_S._selectedUnivers=new Set();}else{_S._selectedUnivers.add(u);if(_S._selectedUnivers.size>=all.size)_S._selectedUnivers=new Set();}_buildChalandiseOverview();}
function _activitePDVColor(v){const l=(v||'').toLowerCase();if(!l.includes('inactif'))return'bg-emerald-600 text-white border-green-600';if(l.includes('2025'))return'bg-red-600 text-white border-red-600';return'bg-orange-500 text-white border-orange-500';}
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
function _toggleActPDVDropdown(){const p=document.getElementById('terrActPDVPanel');if(!p)return;const closing=!p.classList.contains('hidden');_closeAllDropPanels('terrActPDVPanel');p.classList.toggle('hidden',closing);}
function _toggleStatutDropdown(){const p=document.getElementById('terrStatutPanel');if(!p)return;const closing=!p.classList.contains('hidden');_closeAllDropPanels('terrStatutPanel');p.classList.toggle('hidden',closing);}
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
  _renderCommercialScorecard('comScorecard');
  _renderCommercialScorecard('comScorecardPDV');
  _renderComTopArticles('comTopArticles');
  _renderPochesTerrain('pochesTerrain');
  _renderPochesTerrain('pochesTerrain2');
  _buildChalandiseOverview();
  // Re-render PDV tab if visible
  if(document.getElementById('tabClients')&&!document.getElementById('tabClients').classList.contains('hidden'))renderMesClients();
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
  _terrClientSearchTimer=setTimeout(()=>{
    // Si c'est un code client connu → ouvrir directement Client 360
    if(raw && /^\d{4,}$/.test(raw)){
      const cc=raw;
      const known=_S.chalandiseData?.has(cc)||_S.clientNomLookup?.[cc]||_S.clientStore?.has(cc)||_S.ventesLocalMagPeriode?.has(cc);
      if(known){
        document.getElementById('terrSearch').value='';
        _S._terrClientSearch='';
        openClient360(cc,'terrain');
        return;
      }
    }
    _buildChalandiseOverview();renderMesClients();window.renderTerritoireTab?.();
  },300);
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
function _toggleAlerteCapitaines(){
  const next=!_S._alerteCapitaines;
  if(next){
    // Pré-requis : une source de "socle" doit exister (Verdicts Squelette ou squelette complet).
    const hasSocleVerdicts=!!(DataStore.finalData||[]).some(r=>r&&r._sqClassif==='socle');
    const hasSocleSq=!!(_S._prSqData?.directions||[]).some(d=>(d.socle||[]).length>0);
    if(!hasSocleVerdicts&&!hasSocleSq){
      showToast('🚨 Capitaines indisponibles : Squelette non calculé (ou session mono-agence). Laissez finir "Verdicts Squelette" puis réessayez.','warning',6000);
      return;
    }
  }
  _S._alerteCapitaines=next;
  _buildCockpitClient(true);
}
function _cmToggleSurveiller(){
  _cmShowSurveiller=!_cmShowSurveiller;
  _renderCockpitTables();
}
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
function _renderCommercialScorecard(containerId) {
  const el = document.getElementById(containerId);
  if (!el) return;
  const com = _S._selectedCommercial;
  const _hasForcage = !!_S.forcageCommercial?.size;
  if (!com || (!_S.chalandiseReady && !_hasForcage)) { el.innerHTML = ''; return; }
  const score=computeCommercialScorecard({
    commercial:com,
    finalDataIndex:_getFinalDataIndex(),
    setRuptureClientSet:set=>{_ruptureClientSet=set;}
  });
  if(!score){el.innerHTML='';return;}
  const sect=_getCommercialSecteurs().get(com)||'';
  el.innerHTML=renderCommercialScorecard(score,{secteur:sect,pocheActive:_pocheActive});
}

window._comToggleMixCanal = function() {
  const el = document.getElementById('comMixCanalInline');
  if (!el) return;
  el.classList.toggle('hidden');
  if (!el.classList.contains('hidden') && window.renderCanalAgence) window.renderCanalAgence();
};

// ── Top clients/articles du commercial — rendu extrait ────────────────
let _comTopArtLimit = 20;
let _comTopArtMode = 'ici'; // 'ici' | 'ailleurs' | 'manquants' | 'subies'

function _renderComTopArticles(containerId) {
  const el = document.getElementById(containerId);
  if (!el) return;
  el.innerHTML = renderCommercialTopActions({
    selectedTopClient:_selectedTopClient,
    pocheActive:_pocheActive,
    pocheData:_pocheData,
    ruptureClientSet:_ruptureClientSet,
    topArtMode:_comTopArtMode,
    topArtLimit:_comTopArtLimit,
    finalDataIndex:_getFinalDataIndex(),
    passesClient:_passesOverviewClient
  });
}
window._comTopArtMode = function(m) {
  _comTopArtMode = m;
  _comTopArtLimit = 20;
  _renderComTopArticles('comTopArticles');
};
window._comTopArtToggle = function() {
  _comTopArtLimit = _comTopArtLimit <= 20 ? 100 : 20;
  _renderComTopArticles('comTopArticles');
};

// ── 4 Poches Terrain — leviers d'action portefeuille ─────────────────
let _pocheActive = '';
let _selectedTopClient = '';  // cc du client sélectionné pour le detail articles
let _ruptureClientSet = new Set(); // clients impactés par des ruptures (poche E)
function _renderPochesTerrain(containerId) {
  const el = document.getElementById(containerId);
  if (!el) return;
  if (!_S.chalandiseReady && !_S.forcageCommercial?.size) { el.innerHTML = ''; return; }
  const poches=buildPochesTerrain({commercial:_S._selectedCommercial,finalDataIndex:_getFinalDataIndex()});
  if(!poches){el.innerHTML='';return;}
  _pocheData=poches.data;
  el.innerHTML=renderPochesTerrain(poches,{activeKey:_pocheActive});
}
let _pocheData = { A: [], B: [], C: [], D: [] };

window._togglePoche = function(key) {
  _pocheActive = (_pocheActive === key) ? '' : key;
  _selectedTopClient = ''; // reset sélection client
  _renderPochesTerrain('pochesTerrain');
  _renderPochesTerrain('pochesTerrain2');
  // Re-render KPI scorecard pour refléter l'état actif du badge Ruptures
  if (key === 'E') { _renderCommercialScorecard('comScorecard'); _renderCommercialScorecard('comScorecardPDV'); }
  _renderComTopArticles('comTopArticles');
};
window._selectTopClient = function(cc) {
  _selectedTopClient = (_selectedTopClient === cc) ? '' : cc;
  _renderComTopArticles('comTopArticles');
  // Geste 2 : smooth scroll vers les articles pour rester sur un seul écran
  if (_selectedTopClient) {
    const artEl = document.getElementById('comTopArticles');
    if (artEl) setTimeout(() => artEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 50);
  }
};

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
  // Persister les filtres tactiques dans le slot de l'onglet courant
  if(_S._activeCommerceTab&&_S._tabFilters[_S._activeCommerceTab]){
    const slot=_S._tabFilters[_S._activeCommerceTab];
    slot.distanceMaxKm=_S._distanceMaxKm;slot.selectedDepts=new Set(_S._selectedDepts);slot.selectedMetier=_S._selectedMetier;slot.filterStrategiqueOnly=_S._filterStrategiqueOnly;
    slot.selectedClassifs=new Set(_S._selectedClassifs);slot.selectedStatuts=new Set(_S._selectedStatuts);slot.selectedActivitesPDV=new Set(_S._selectedActivitesPDV);slot.selectedStatutDetaille=_S._selectedStatutDetaille;slot.includePerdu24m=_S._includePerdu24m;slot.excludeActifsConsomme=_S._excludeActifsConsomme;
    slot.selectedDirections=new Set(_S._selectedDirections);slot.selectedUnivers=new Set(_S._selectedUnivers);
  }
  // Rafraîchir le sous-onglet actif + overview data
  _buildOverviewFilterChips();
  // Scorecard + poches Conquête Terrain (si visible)
  if (document.getElementById('comScorecard')) {
    _renderCommercialScorecard('comScorecard');
    _renderComTopArticles('comTopArticles');
    _renderPochesTerrain('pochesTerrain');
    _renderLivSansPDV('livSansPDVBlock');
  }
  // Fidélisation PDV : tabs cockpit + listes clients (renderMesClients gère tout)
  if (document.getElementById('tabClients')) {
    renderMesClients();
  }
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
function _getFilteredChalandiseEntries(capteSet=_overviewCaptePDVSet){
  return _getFilteredChalandiseEntriesRaw(capteSet);
}
function _computeOverviewUniversKpi(capteSet){
  const selected=[...(_S._selectedUnivers||new Set())];
  if(!selected.length)return null;
  const {entries}=_getFilteredChalandiseEntries(capteSet);
  let caUnivers=0,captes=0,acheteurs=0;
  for(const[cc]of entries){
    if(!capteSet?.has(cc))continue;
    captes++;
    const ca=getUniversFilteredCA(cc)||0;
    caUnivers+=ca;
    if(ca>0)acheteurs++;
  }
  const avg=captes>0?caUnivers/captes:0;
  const avgBuyer=acheteurs>0?caUnivers/acheteurs:0;
  const label=selected.length===1?selected[0]:'univers';
  return{label,caUnivers,captes,acheteurs,avg,avgBuyer};
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
  let _captePDVSet = getClientsActiveSetInPeriod(_oCanal, { magasinMode: _S._reseauMagasinMode || 'all' });
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
  const _universKpi=_computeOverviewUniversKpi(_captePDVSet);
  const pctCapte=filteredClients>0?Math.round(totalActifsPDV/filteredClients*100):0;
  const pctCapteLeg=filteredClients>0?Math.round(totalActifsLeg/filteredClients*100):0;
  // Clients hors zone : acheteurs PDV absents de la chalandise
  let _horsZoneCount=0,_horsZoneCA=0;
  if(_S.clientStore?.size){for(const rec of _S.clientStore.values()){if(rec.inChalandise||(rec.caPDV||0)<200)continue;_horsZoneCount++;_horsZoneCA+=rec.caPDV;}}
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
    const _ca_all=_S.canalAgence||{};
    let _ca,_nbBL,_sumVMB,_nbClients,_canalLabel;
    if(!_canal){
      _ca=Object.values(_ca_all).reduce((s,d)=>s+(d.ca||0),0);
      _nbBL=Object.values(_ca_all).reduce((s,d)=>s+(d.bl||0),0);
      _sumVMB=Object.values(_ca_all).reduce((s,d)=>s+(d.sumVMB||0),0);
      // Period-aware : réutiliser le set capté PDV déjà calculé (tous canaux)
      _nbClients=_captePDVSet?.size||0;
      _canalLabel='Tous canaux';
    }else{
      const _d=_ca_all[_canal]||{};
      _ca=_d.ca||0;_nbBL=_d.bl||0;_sumVMB=_d.sumVMB||0;
      // Period-aware : réutiliser le set capté PDV déjà calculé (canal courant)
      _nbClients=_captePDVSet?.size||0;
      _canalLabel=_CANAL_LABELS_OV[_canal]||_canal;
    }
    const _caClient=_nbClients>0?Math.round(_ca/_nbClients):0;
    const _freq=_nbClients>0?(_nbBL/_nbClients).toFixed(1):'—';
    const _txMarge=_ca>0?(_sumVMB/_ca)*100:0;
    const _vmc=_nbBL>0?_ca/_nbBL:0;
    const _fmt=v=>v>0?formatEuro(v):'—';
    const _dot=`<span class="t-disabled text-xs">·</span>`;
    const _clientsHtml=filterActive
      ?`<span class="c-danger font-extrabold">${filteredClients.toLocaleString('fr-FR')}</span><span class="text-xs t-disabled"> / ${totalClients.toLocaleString('fr-FR')}</span>`
      :`<span class="font-extrabold t-primary">${filteredClients.toLocaleString('fr-FR')}</span>`;
    const _exclusHtml=(!_S._includePerdu24m&&totalExcluded24m>0)
      ?`${_dot}<div class="flex items-center gap-1"><span class="text-xs">🚫</span><span class="font-semibold t-disabled">${totalExcluded24m.toLocaleString('fr-FR')}</span><span class="text-xs t-disabled">exclus &gt;24m</span></div>`:'';
    const _tile=(icon,val,label,sub,color)=>`<div style="display:flex;flex-direction:column;align-items:center;padding:10px 18px;border-right:1px solid rgba(255,255,255,0.07);min-width:100px">
        <span style="font-size:11px;color:rgba(255,255,255,0.4);margin-bottom:2px;letter-spacing:.04em;text-transform:uppercase">${icon} ${label}</span>
        <span style="font-size:22px;font-weight:900;line-height:1.1;color:${color}">${val}</span>
        ${sub?`<span style="font-size:10px;color:rgba(255,255,255,0.35);margin-top:1px">${sub}</span>`:''}
      </div>`;
    const _exclusBadge=(!_S._includePerdu24m&&totalExcluded24m>0)
      ?`<div style="display:flex;flex-direction:column;align-items:center;padding:10px 18px;min-width:80px"><span style="font-size:11px;color:rgba(255,255,255,0.4);margin-bottom:2px;text-transform:uppercase">🚫 Exclus</span><span style="font-size:18px;font-weight:800;color:rgba(251,191,36,0.7)">${totalExcluded24m}</span><span style="font-size:10px;color:rgba(255,255,255,0.3);margin-top:1px">&gt;24 mois</span></div>`:'' ;
    const _universTile=_universKpi?`${_tile('🧾',formatEuro(_universKpi.avg),`CA MAG ${escapeHtml(_universKpi.label)} / capté`,`${formatEuro(_universKpi.caUnivers)} · ${_universKpi.acheteurs}/${_universKpi.captes} acheteurs · ${formatEuro(_universKpi.avgBuyer)}/acheteur`,'#22d3ee')}`:'';
    const _filterBadge=filterActive?`<div style="position:absolute;top:8px;right:12px;font-size:9px;background:rgba(234,179,8,0.2);color:#fde047;padding:2px 8px;border-radius:99px;font-weight:700;letter-spacing:.05em">FILTRÉ</div>`:'';
    bar.innerHTML=`<div style="position:relative;display:flex;align-items:stretch;overflow:hidden">
      ${_filterBadge}
      ${_tile('👥',filterActive?`<span style="color:#f87171">${filteredClients.toLocaleString('fr-FR')}</span><span style="font-size:13px;color:rgba(255,255,255,0.3)"> / ${totalClients.toLocaleString('fr-FR')}</span>`:filteredClients.toLocaleString('fr-FR'),'Clients zone',_canalLabel,'#e2e8f0')}
      ${_tile('📊',pctCapteLeg+'%','Captés Leg.',`${totalActifsLeg.toLocaleString('fr-FR')} / ${filteredClients.toLocaleString('fr-FR')}`,'#93c5fd')}
      ${_tile('🏪',pctCapte+'%','Captés PDV',`${totalActifsPDV.toLocaleString('fr-FR')} / ${filteredClients.toLocaleString('fr-FR')}${_oCanal&&_oCanal!=='MAGASIN'?' · via '+_canalLabel:''}`,'#4ade80')}
      ${_universTile}
      ${_tile('⚠️',_horsZoneCount.toLocaleString('fr-FR'),'Hors zone',_horsZoneCA>0?formatEuro(_horsZoneCA)+' CA PDV':'','#fcd34d')}
      ${_exclusBadge}
    </div>`;
    bar.style.cssText='display:block;position:sticky;top:0;z-index:10;background:linear-gradient(135deg,rgba(15,23,42,0.97),rgba(30,27,75,0.95));border:1px solid rgba(139,92,246,0.3);border-radius:14px;margin-bottom:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.35),0 0 0 1px rgba(139,92,246,0.08)';
    bar.classList.remove('hidden');
  }}
  // Vue direction cascade — différé (6.7MB HTML ne doit pas bloquer le rendu)
  setTimeout(()=>{const _dc=document.getElementById('terrDirectionContainer');if(_dc)_buildChalDirBlock(_dc);},0);
  // terrChalandiseOverview — table seulement si dans le DOM
  const blk=document.getElementById('terrChalandiseOverview');
  if(!blk)return;
  blk.classList.remove('hidden');
  _buildDeptFilter();
  // Toggle Direction / Secteur
  const _axisLabel=_isSec?'Secteur':'Direction';
  const _toggleEl=document.getElementById('terrOverviewToggle');
  if(_toggleEl){
    const _ts=on=>`padding:3px 10px;border-radius:6px;cursor:pointer;font-weight:700;${on?'background:rgba(139,92,246,0.3);color:#c4b5fd':'color:rgba(255,255,255,0.35)'}`;
    _toggleEl.innerHTML=`<span onclick="event.preventDefault();event.stopPropagation();window._overviewToggleMode('direction')" style="${_ts(!_isSec)}">Direction</span><span onclick="event.preventDefault();event.stopPropagation();window._overviewToggleMode('secteur')" style="${_ts(_isSec)}">Secteur</span>`;
  }
  // Fixed thead — axis label adapts to mode
  const colSpan=9;
  const headEl=document.getElementById('terrOverviewL1Head');
  if(headEl){
    const _captSub=_oCanal&&_oCanal!=='MAGASIN'?` <span class="t-disabled font-normal">(via ${_captLabel})</span>`:'';
    headEl.innerHTML=renderOverviewHead(_axisLabel,_captSub);
  }
  const _nbDirs=Object.keys(dirMap).length;const _axisN=_isSec?'secteur':'direction';const _sl=document.getElementById('terrOverviewSummaryLine');if(_sl)_sl.textContent=`${_nbDirs} ${_axisN}${_nbDirs>1?'s':''} · ${totalActifsPDV.toLocaleString('fr-FR')} actifs PDV${_oCanal&&_oCanal!=='MAGASIN'?' (via '+_captLabel+')':''} · ${pctCapte}% capté`;
  // Sort by % capté ascending (opportunities first)
  let dirsArr=Object.values(dirMap).filter(d=>d.total>0);
  dirsArr.sort((a,b)=>b.actifsLeg-a.actifsLeg||b.total-a.total);
  const _focusEl=document.getElementById('terrainFocusCoach');
  if(_focusEl){
    const _candidates=dirsArr
      .filter(d=>(d.total||0)>=5)
      .map(d=>{const base=(d.total||0)-(d.prospects||0);return{...d,_base:base,_pct:base>0?(d.actifsPDV||0)/base:1,_gap:Math.max(0,(d.actifsLeg||0)-(d.actifsPDV||0))};})
      .filter(d=>d._base>0&&((d._gap||0)>0||(d.perdus12_24||0)>0));
    _candidates.sort((a,b)=>a._pct-b._pct||b._gap-a._gap||b.perdus12_24-a.perdus12_24||b.total-a.total);
    _focusEl.innerHTML=renderTerrainFocusCoach({axisLabel:_axisLabel,worst:_candidates[0],totalActifsPDV,filteredClients,pctCapte,canalLabel:_oCanal&&_oCanal!=='MAGASIN'?_captLabel:''});
    _focusEl.classList.toggle('hidden',!_candidates.length);
  }
  let html=renderOverviewL1Rows(dirsArr,{isSecteur:_isSec,colSpan});
  const tEl=document.getElementById('terrOverviewL1Table');
  if(tEl)tEl.innerHTML=html||`<tr><td colspan="${colSpan}" class="text-center py-4 t-disabled">Aucun client dans la zone de chalandise</td></tr>`;
  // Mettre à jour la vue Canal avec les filtres actifs
  window.renderCanalAgence();
}
function _renderOverviewL2(el,direction){
  let metiersArr=aggregateOverviewMetiers(direction,_overviewCaptePDVSet);
  // Sort by % capté ascending (opportunities first)
  metiersArr.sort((a,b)=>{const aS=_isMetierStrategique(a.metier)?0:1,bS=_isMetierStrategique(b.metier)?0:1;if(aS!==bS)return aS-bS;return b.perdus12_24-a.perdus12_24||b.total-a.total;});
  const _cl=_S._globalCanal&&_S._globalCanal!=='MAGASIN'?` <span class="t-disabled font-normal">(via ${_CANAL_LABELS_OV[_S._globalCanal]||_S._globalCanal})</span>`:'';
  el.innerHTML=renderOverviewL2Table(metiersArr,{direction,canalSuffix:_cl});
}
function _renderOverviewL3(el,direction,metier){
  let sectsArr=aggregateOverviewSecteurs(direction,metier,_overviewCaptePDVSet);
  sectsArr.sort((a,b)=>b.perdus12_24-a.perdus12_24||b.total-a.total);
  const _cl3=_S._globalCanal&&_S._globalCanal!=='MAGASIN'?` <span class="t-disabled font-normal">(via ${_CANAL_LABELS_OV[_S._globalCanal]||_S._globalCanal})</span>`:'';
  el.innerHTML=renderOverviewL3Table(sectsArr,{direction,metier,canalSuffix:_cl3});
}
function _overviewClientSort(a,b){
  // Actifs globaux Inactifs PDV first, then Perdus récents FID Pot+, then rest
  const aGlobActif=_isGlobalActif(a),bGlobActif=_isGlobalActif(b);
  const aPDV=a._pdvActif,bPDV=b._pdvActif;
  // Priority: 1=global actif + PDV inactif, 2=perdu FID Pot+, 3=rest
  const aP=aGlobActif&&!aPDV?1:(_isPerdu(a)&&_normalizeClassif(a.classification).includes('Pot+')?2:3);
  const bP=bGlobActif&&!bPDV?1:(_isPerdu(b)&&_normalizeClassif(b.classification).includes('Pot+')?2:3);
  if(aP!==bP)return aP-bP;
  return(b.caLeg||b.ca2025||0)-(a.caLeg||a.ca2025||0);
}
function _renderOverviewL4(el,direction,metier,secteur,limit){
  limit=limit||20;
  // CA PDV : respecte le filtre période UI si actif, sinon année civile en cours
  const _pStart=_S.periodFilterStart, _pEnd=_S.periodFilterEnd;
  const _curYear=new Date().getFullYear();
  const _ymRange=(_pStart&&_pEnd)
    ? {min:_pStart.getFullYear()*12+_pStart.getMonth(), max:_pEnd.getFullYear()*12+_pEnd.getMonth()}
    : {min:_curYear*12, max:_curYear*12+11};
  const _periodLabel=(_pStart&&_pEnd)?'période':'année';
  // CA PDV = CA tous canaux myStore sur la période sélectionnée (ou année civile).
  // CA LEG = ca2026 chalandise (full year — source externe, pas filtrable).
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
const _toggleSecGrp=_conqueteOverviewController.toggleSecGrp;
const _toggleOverviewL2=_conqueteOverviewController.toggleOverviewL2;
const _toggleOverviewL3=_conqueteOverviewController.toggleOverviewL3;
const _toggleOverviewL4=_conqueteOverviewController.toggleOverviewL4;
installConqueteOverviewController(_conqueteOverviewController);
// Client article expand panel (used in L4 and cockpit)
function _toggleClientArticles(row,clientCode){
  const nextRow=row.nextElementSibling;
  if(nextRow&&nextRow.classList.contains('client-art-panel')){nextRow.remove();return;}
  // [Adapter Étape 5] — territoireLines / finalData / ventesLocalMagPeriode : canal-invariants
  const hasTerr=_hasTerritoire();
  const stockMap=_getFinalDataIndex();
  // Section 1 : achats comptoir (DataStore.ventesLocalMagPeriode — MAGASIN/myStore only)
  const artData=DataStore.ventesLocalMagPeriode.get(clientCode);
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
      let nbInRayon=0,nbAbsent=0;
      for(const a of comptoirArts){if(a.rayonStatus==='green')nbInRayon++;else if(a.rayonStatus==='red')nbAbsent++;}
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

function _setPDVCanalFilter(val){
  _S.pdvCanalFilter=(val==='tous'||val==='all'||!val)?null:val;
  _buildDegradedCockpit();
  window._renderPDVTab?.();
}

function _buildDegradedCockpit(){
  const el=document.getElementById('terrDegradedBlock');if(!el)return;
  if(!DataStore.finalData.length && !_S.ventesLocalMagPeriode.size)return;
  _populateTerrFamilleFilter();
  const qClient=_S._terrClientSearch||'';
  const selFam=((document.getElementById('terrFamilleFilter')||{}).value||'').trim();
  const _today=new Date();
  const fdIndex=_getFinalDataIndex();
  // [V3.2] Canal + commercial depuis DataStore.byContext() — API unifiée
  const {activeFilters:{canal:_terrCanalFilter,commercial:_terrComFilter}}=DataStore.byContext();
  const _terrComSet=_terrComFilter?(_S.clientsByCommercial.get(_terrComFilter)||new Set()):null;
  const _isNonMagasin=_terrCanalFilter&&_terrCanalFilter!=='MAGASIN';
  let _clientArtMap;
  if(_isNonMagasin){
    // Canaux hors MAGASIN : utiliser ventesLocalHorsMag directement (v.sumCA = total non-MAGASIN)
    // Ne pas filtrer par articleCanalCA — ce filtre pouvait vider _clientArtMap si articleCanalCA
    // n'était pas peuplé (ex. lignes sans N° commande), ce qui faisait disparaître tout le bloc.
    _clientArtMap=new Map();
    for(const[cc,artMap] of _S.ventesLocalHorsMag.entries()){
      const filtered=new Map();
      for(const[artCode,v] of artMap.entries()){
        if(v.sumCA>0)filtered.set(artCode,{sumCA:v.sumCA,sumCAPrelevee:v.sumCAPrelevee||0,sumCAAll:v.sumCA,sumPrelevee:v.sumPrelevee||0,countBL:v.countBL||0});
      }
      if(filtered.size>0)_clientArtMap.set(cc,filtered);
    }
  }else{
    _clientArtMap=DataStore.ventesLocalMagPeriode;
  }
  // Silencieux >30j — MAGASIN uniquement (via clientStore.silenceDaysPDV)
  const silencieux=[];
  if(!_isNonMagasin&&_S.clientStore?.size){
    for(const rec of _S.clientStore.values()){
      const d=rec.silenceDaysPDV;if(d===null||d<=30||d>90)continue;
      const artMap=_clientArtMap.get(rec.cc);if(!artMap)continue;
      let ca=0;for(const[artCode,v] of artMap.entries())if(!selFam||(fdIndex.get(artCode)?.famille||'')===selFam)ca+=(v.sumCAAll||v.sumCA||0);
      if(ca<=0)continue;
      if(qClient&&!matchQuery(qClient,rec.cc,rec.nom))continue;
      silencieux.push({cc:rec.cc,nom:rec.nom,ca,d});
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

let _bccLastRun=0;
function _buildCockpitClient(force){
  const now=performance.now();
  if(!force&&now-_bccLastRun<100){_renderCockpitTables();return;} // debounce 100ms — rendu seul
  _bccLastRun=now;
  const dangerEl=document.getElementById('terrEnDanger');
  const perduEl=document.getElementById('terrPerdus');
  const abandEl=document.getElementById('terrAbandonnes');
  const capEl=document.getElementById('terrACapter');
  if(!_S.clientStore?.size&&!_S.clientLastOrder?.size){if(dangerEl)dangerEl.innerHTML='';if(perduEl)perduEl.innerHTML='';if(abandEl)abandEl.innerHTML='';if(capEl)capEl.innerHTML='';return;}

  // ── Canal-aware date picking ──
  const _canal=_S._globalCanal||'';
  const _useByCanal=_canal&&_canal!=='MAGASIN';
  const _useMagOnly=_canal==='MAGASIN';
  const _minC3=_S.consommePeriodMinFull||_S.consommePeriodMin;
  const _today=new Date();

  function _pickLastOrder(rec){
    if(_useMagOnly) return rec.lastOrderPDV||(rec.lastOrderByCanal?.get('MAGASIN'))||null;
    if(_useByCanal) return rec.lastOrderByCanal?.get(_canal)||null;
    return rec.lastOrderAll||null;
  }

  // ── Filtres ──
  const {activeFilters:{commercial:_cockpitCom}}=DataStore.byContext();
  const _cockpitComSet=_cockpitCom?(_S.clientsByCommercial.get(_cockpitCom)||new Set()):null;
  const _tcsCK=(_S._terrClientSearch||'').toLowerCase();
  const _mCK=rec=>!_tcsCK||rec.cc.includes(_tcsCK)||rec.nom.toLowerCase().includes(_tcsCK);

  // ── Alerte Capitaines Perdus : client qui achetait un Socle/Capitaine ──
  const _alerteCap=_S._alerteCapitaines;
  // Pré-calcul Set<code> des articles Socle — une seule passe O(n), lookup O(1) par client
  let _socleCodes=null;
  if(_alerteCap){
    // 1) Chemin rapide : verdicts (Bouclier Squelette) => pas de computeSquelette() synchrone.
    const _socleFromVerdicts=new Set();
    for(const r of (DataStore.finalData||[])){
      if(r&&r._sqClassif==='socle')_socleFromVerdicts.add(r.code);
    }
    if(_socleFromVerdicts.size){
      _socleCodes=_socleFromVerdicts;
    }else if(_S._prSqData){
      // 2) Fallback : squelette complet déjà calculé (idle ou Plan Rayon)
      _socleCodes=new Set();
      for(const d of _S._prSqData.directions){for(const a of(d.socle||[]))_socleCodes.add(a.code);}
    }else{
      // Squelette pas prêt : on ne bloque pas l'UI (le filtre ne peut pas s'appliquer).
      _socleCodes=null;
    }
  }
  function _hasLostCapitaine(cc){
    if(!_socleCodes)return false;
    const fullArts=_S.ventesLocalMag12MG?.get(cc);
    if(!fullArts)return false;
    for(const[code] of fullArts){if(_socleCodes.has(code))return true;}
    return false;
  }

  // ── Collect 4 categories + potentiels ──
  const surveiller=[],enDanger=[],perdus=[],abandonnes=[],jamaisVenus=[];
  const hasChal=_S.chalandiseReady;

  for(const rec of _S.clientStore.values()){
    // Filtres chalandise (si chargée)
    // Éligibilité : le client doit avoir une activité connue (immunisé du filtre période)
    const _hasActivity = rec.isPDVActif || rec.caHors > 0 || rec.caPDVNChal > 0 || rec.caLegallaisN1 > 0
      || rec.lastOrderPDV || rec.lastOrderAll;
    if(hasChal){
      if(!rec.inChalandise&&!_hasActivity)continue;
      if(rec.inChalandise){
        const info=_S.chalandiseData.get(rec.cc);
        if(!_passesOverviewClient(info,rec.cc,_overviewCaptePDVSet,{allowMissing:true}))continue;
        if(!_passesClientCrossFilter(rec.cc))continue;
      }
    }else{
      // Mode dégradé : clients avec activité (tous canaux)
      if(!_hasActivity)continue;
    }
    if(_S.excludedClients.has(rec.cc))continue;
    if(_cockpitComSet&&!_cockpitComSet.has(rec.cc))continue;
    if(hasChal&&!_passesAllFilters(rec.cc))continue;
    if(!_mCK(rec))continue;

    // Date + jours de silence
    const lastOrder=_pickLastOrder(rec);
    const lastOrderValid=lastOrder&&(!_minC3||lastOrder>=_minC3);
    const daysSince=lastOrderValid?daysBetween(lastOrder,_today):null;
    const caPDVN=rec.caPDV;
    const caPDVFull=rec.caPDV||rec.caPDVNChal||0; // CA PDV (période ou chalandise N) — pour affichage silencieux
    const caLeg=rec.caLegallaisN1||0;
    const caZone=rec.caTotal||0; // vrai CA zone sur la période (PDV + hors-magasin)

    const c={code:rec.cc,nom:rec.nom,metier:rec.metier,commercial:rec.commercial,classification:rec.classification,caZone:caZone||caPDVFull||caLeg,caPDVN:caPDVN||caPDVFull,ville:rec.ville,_strat:_isMetierStrategique(rec.metier),_daysSince:daysSince,_lastOrderDate:lastOrder};

    // _caOk : daysSince valide = le client A commandé dans la période consommé → éligible
    const _caOk=daysSince!==null||(caPDVN>0||caLeg>0||caZone>0);
    if(daysSince!==null&&_caOk){
      if(_alerteCap) c._capitainPerdu=_hasLostCapitaine(rec.cc);
      if(_alerteCap&&!c._capitainPerdu){/* skip — filtre actif, pas de capitaine perdu */}
      // 1. À surveiller : 30-60j (watch list, replié par défaut)
      else if(daysSince>30&&daysSince<=60){surveiller.push(c);continue;}
      // 2. En danger : 60-180j (appel cette semaine)
      else if(daysSince>60&&daysSince<=180){enDanger.push(c);continue;}
      // 3. Perdus : 6-12m (campagne reconquête)
      else if(daysSince>180&&daysSince<=365){perdus.push(c);continue;}
      // 4. Abandonnés : >12m (filtrés CA > 500€)
      else if(daysSince>365){
        const caHist=(caPDVFull||0)+(caLeg||0);
        if(caHist>=500){abandonnes.push(c);continue;}
      }
    }
    // 5. Potentiels : jamais venus au comptoir
    if(hasChal&&!_useByCanal&&rec.crossStatus==='potentiel'&&caLeg>=500&&caLeg<=50000&&rec.commercial){jamaisVenus.push(c);}
  }

  surveiller.sort((a,b)=>(b._daysSince||0)-(a._daysSince||0)||(b.caZone||0)-(a.caZone||0));
  enDanger.sort((a,b)=>(a._daysSince||0)-(b._daysSince||0)||(b.caZone||0)-(a.caZone||0));
  perdus.sort((a,b)=>(a._daysSince||0)-(b._daysSince||0)||(b.caZone||0)-(a.caZone||0));
  abandonnes.sort((a,b)=>(b.caZone||0)-(a.caZone||0));
  const _classifPrio={'FID Pot+':0,'OCC Pot+':1,'FID Pot-':2,'OCC Pot-':3,'NC':4};
  jamaisVenus.sort((a,b)=>(_classifPrio[a.classification]??5)-(_classifPrio[b.classification]??5)||(b.caZone||0)-(a.caZone||0));
  _S._cockpitExportData={surveiller,enDanger,perdus,abandonnes,jamaisVenus};
  _renderCockpitTables();
}

// ── Rendu pur (séparé du calcul) — rapide, utilisé aussi par pagination ──
const _CM_PAGE_SIZE=20;

const _classifBadge=cl=>{
  const m={'FID Pot+':'background:rgba(16,185,129,0.2);color:#34d399','OCC Pot+':'background:rgba(59,130,246,0.2);color:#60a5fa','FID Pot-':'background:rgba(107,114,128,0.2);color:#9ca3af','OCC Pot-':'background:rgba(107,114,128,0.15);color:#9ca3af'};
  return cl&&m[cl]?`<span style="font-size:9px;font-weight:700;padding:1px 5px;border-radius:9999px;${m[cl]}">${cl}</span>`:'<span class="t-disabled text-[9px]">—</span>';
};
const _daysBadge=(d,threshold)=>{
  if(d==null)return'<span class="t-disabled">—</span>';
  const danger=d>threshold;
  return`<span style="font-size:10px;font-weight:700;padding:1px 6px;border-radius:9999px;${danger?'background:rgba(248,113,113,0.15);color:#f87171':'background:rgba(251,191,36,0.12);color:#fbbf24'}">${d}j</span>`;
};

function _directTable(clients,listId,dayThreshold){
  if(!_S._cmPages)_S._cmPages={};
  const filterActive=_S._selectedDepts.size||_S._selectedClassifs.size||_S._selectedStatuts.size||_S._selectedActivitesPDV.size||_S._selectedDirections.size||_S._selectedUnivers.size||_S._selectedCommercial||_S._selectedMetier||_S._filterStrategiqueOnly;
  const emptyMsg=filterActive?'Aucun client ne correspond aux filtres':'Aucun client dans cette catégorie';
  const total=clients.length;
  const totalCALeg=clients.reduce((s,c)=>s+(c.caZone||0),0);
  const totalCAMag=clients.reduce((s,c)=>s+(c.caPDVN||0),0);
  const nbFid=clients.filter(c=>(c.classification||'').startsWith('FID')).length;
  const nbStrat=clients.filter(c=>c._strat).length;
  const page=_S._cmPages[listId]||0;
  const totalPages=Math.ceil(total/_CM_PAGE_SIZE)||1;
  const start=page*_CM_PAGE_SIZE;
  const slice=clients.slice(start,start+_CM_PAGE_SIZE);

  // ── Summary bandeau ──
  let html=`<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:6px 0;margin-bottom:6px">`;
  if(totalCALeg>0)html+=`<span class="text-[11px] font-bold c-caution">${formatEuro(totalCALeg)} CA Zone</span><span class="t-disabled text-[9px]">·</span>`;
  if(totalCAMag>0)html+=`<span class="text-[11px] font-bold c-ok">${formatEuro(totalCAMag)} CA MAG</span><span class="t-disabled text-[9px]">·</span>`;
  if(nbFid)html+=`<span class="text-[11px] font-bold" style="color:#34d399">${nbFid} FID</span><span class="t-disabled text-[9px]">·</span>`;
  if(nbStrat)html+=`<span class="text-[11px] font-bold c-caution">${nbStrat} ⭐ stratégiques</span>`;
  // Alerte Capitaines perdus — visible uniquement sur silencieux/perdus, requiert Plan Rayon
  if((listId==='cockpit-danger-full'||listId==='cockpit-perdu-full')&&typeof window._getArticleSqInfo==='function'){
    const _acActive=_S._alerteCapitaines;
    html+=`<button onclick="_toggleAlerteCapitaines()" style="font-size:11px;font-weight:700;padding:3px 10px;border-radius:6px;cursor:pointer;${_acActive?'background:#dc2626;color:#fff;border:1px solid #dc2626':'background:transparent;color:var(--t-primary);border:1px solid var(--b-default)'}" title="Filtrer : clients ayant perdu un article Capitaine (Socle)">🚨 Capitaines${_acActive?' ✕':''}</button>`;
  }
  html+=`<button onclick="exportCockpitCSV('${listId}')" class="ml-auto text-[10px] s-hover t-primary py-1 px-2 rounded font-bold border">📥 CSV</button>`;
  html+=`</div>`;

  if(!total){html+=`<p class="text-xs t-disabled py-6 text-center">${emptyMsg}</p>`;return html;}

  // ── Table directe ──
  html+=`<div class="overflow-x-auto"><table class="min-w-full text-[11px]">`;
  html+=`<thead class="sticky top-0 s-card" style="z-index:1"><tr class="text-[10px] font-bold t-secondary">`;
  html+=`<th class="py-1.5 px-2 text-left">Client</th>`;
  html+=`<th class="py-1.5 px-2 text-left">Métier</th>`;
  html+=`<th class="py-1.5 px-2 text-center">Classif</th>`;
  html+=`<th class="py-1.5 px-2 text-right">CA MAG</th>`;
  html+=`<th class="py-1.5 px-2 text-right">CA Zone</th>`;
  html+=`<th class="py-1.5 px-2 text-center">Silence</th>`;
  html+=`<th class="py-1.5 px-2 text-left">Commercial</th>`;
  html+=`<th class="py-1.5 px-2 text-left">Ville</th>`;
  html+=`</tr></thead><tbody>`;

  for(const c of slice){
    const rowBg=c._daysSince!=null&&c._daysSince>dayThreshold?'background:rgba(248,113,113,0.06)':'';
    html+=`<tr class="border-t b-default hover:s-card/50 cursor-pointer" style="${rowBg}" data-cc="${escapeHtml(c.code)}" onclick="openClient360(this.dataset.cc,'cockpit')">`;
    html+=`<td class="py-1.5 px-2"><span class="font-semibold">${escapeHtml(c.nom)}</span><button onclick="event.stopPropagation();openClient360('${escapeHtml(c.code)}','cockpit')" class="text-[10px] t-disabled hover:text-white cursor-pointer opacity-30 hover:opacity-100 transition-opacity ml-1" title="Ouvrir la fiche 360°">🔍</button>${c._capitainPerdu?' <span class="text-[9px]" style="color:#ef4444" title="Achetait un article Socle/Capitaine — alerte perte critique">🚨</span>':''}${c._strat?' <span class="c-caution text-[9px]" title="Métier stratégique">⭐</span>':''}</td>`;
    html+=`<td class="py-1.5 px-2 text-[10px] t-tertiary">${c.metier?escapeHtml(c.metier):'—'}</td>`;
    html+=`<td class="py-1.5 px-2 text-center">${_classifBadge(c.classification)}</td>`;
    html+=`<td class="py-1.5 px-2 text-right font-bold c-ok">${c.caPDVN>0?formatEuro(c.caPDVN):'—'}</td>`;
    html+=`<td class="py-1.5 px-2 text-right font-bold c-caution">${c.caZone>0?formatEuro(c.caZone):'—'}</td>`;
    html+=`<td class="py-1.5 px-2 text-center">${_daysBadge(c._daysSince,dayThreshold)}</td>`;
    html+=`<td class="py-1.5 px-2 text-[10px] t-tertiary">${c.commercial?escapeHtml(c.commercial):'—'}</td>`;
    html+=`<td class="py-1.5 px-2 text-[10px] t-tertiary">${c.ville?escapeHtml(c.ville):'—'}</td>`;
    html+=`</tr>`;
  }
  html+=`</tbody></table></div>`;

  // ── Pagination ──
  if(totalPages>1){
    html+=`<div style="display:flex;align-items:center;justify-content:center;gap:8px;padding:8px 0;margin-top:4px">`;
    html+=`<button onclick="_cmPage('${listId}',-1)" class="text-[11px] font-bold py-1 px-3 rounded border b-default s-hover t-primary${page<=0?' opacity-30 pointer-events-none':''}">&larr; Préc</button>`;
    html+=`<span class="text-[10px] t-secondary">${start+1}–${Math.min(start+_CM_PAGE_SIZE,total)} sur ${total}</span>`;
    html+=`<button onclick="_cmPage('${listId}',1)" class="text-[11px] font-bold py-1 px-3 rounded border b-default s-hover t-primary${page>=totalPages-1?' opacity-30 pointer-events-none':''}">Suiv &rarr;</button>`;
    html+=`</div>`;
  }
  return html;
}

function _renderCockpitTables(){
  const d=_S._cockpitExportData;if(!d)return;
  // Refresh nav (counts + toggle Alerte Capitaines)
  const nav=document.getElementById('cm-tab-nav');
  if(nav)nav.innerHTML=_cmRenderNav(_cmComputeCounts());
  const dangerEl=document.getElementById('terrEnDanger');
  const perduEl=document.getElementById('terrPerdus');
  const abandEl=document.getElementById('terrAbandonnes');
  const capEl=document.getElementById('terrACapter');
  const _canal=_S._globalCanal||'';
  const _useByCanal=_canal&&_canal!=='MAGASIN';
  if(dangerEl){
    // Toggle "À surveiller" (30-60j) — bouton comme Capitaines
    const surv=d.surveiller||[];
    const danger=d.enDanger||[];
    const combined=_cmShowSurveiller?[...surv,...danger]:danger;
    // Bouton toggle À surveiller
    let survBtn='';
    if(surv.length){
      survBtn=`<div style="margin-bottom:6px"><button onclick="_cmToggleSurveiller()" style="font-size:11px;font-weight:700;padding:3px 10px;border-radius:6px;cursor:pointer;${_cmShowSurveiller?'background:#eab308;color:#000;border:1px solid #eab308':'background:transparent;color:var(--t-primary);border:1px solid var(--b-default)'}" title="Inclure les clients 30-60j (watch list)">👀 À surveiller (${surv.length})${_cmShowSurveiller?' ✕':''}</button></div>`;
    }
    dangerEl.innerHTML=survBtn+_directTable(combined,'cockpit-danger-full',90);
  }
  if(perduEl)perduEl.innerHTML=_directTable(d.perdus||[],'cockpit-perdu-full',270);
  if(abandEl)abandEl.innerHTML=_directTable(d.abandonnes||[],'cockpit-abandon-full',999);
  if(capEl){if(_useByCanal){capEl.innerHTML='';}else{capEl.innerHTML=_directTable(d.jamaisVenus||[],'cockpit-cap-full',999);}}
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
  const caLeg=c.caZone>0?c.caZone.toFixed(2).replace('.',','):'—';
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
  const map={'cockpit-danger-full':['En danger',[...(_S._cockpitExportData.surveiller||[]),...(_S._cockpitExportData.enDanger||[])]],'cockpit-perdu-full':['Perdus',_S._cockpitExportData.perdus],'cockpit-abandon-full':['Abandonnés',_S._cockpitExportData.abandonnes],'cockpit-cap-full':['Potentiels',_S._cockpitExportData.jamaisVenus]};
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
  const catMap={'cockpit-danger-full':['En danger',[...(_S._cockpitExportData.surveiller||[]),...(_S._cockpitExportData.enDanger||[])]],'cockpit-perdu-full':['Perdus',_S._cockpitExportData.perdus],'cockpit-abandon-full':['Abandonnés',_S._cockpitExportData.abandonnes],'cockpit-cap-full':['Potentiels',_S._cockpitExportData.jamaisVenus]};
  const rows=[];
  for(const[catKey,[catLabel,list]] of Object.entries(catMap)){for(const c of list)rows.push(_cockpitRowCSV(catLabel,c,'Non',''));for(const[cc,v] of _S.excludedClients.entries()){if(v.category===catKey&&v.clientData)rows.push(_cockpitRowCSV(catLabel,v.clientData,'Oui',v.reason));}}
  const date=new Date().toISOString().slice(0,10);
  _downloadCockpitCSV(rows,`PRISME_${_S.selectedMyStore||'AGENCE'}_Clients_${date}.csv`,'Toutes catégories');
}

// ── Export CSV Hors Zone → Table de Forçage prête à remplir ──
function exportHorsZoneCSV(){
  const hors=_S._horsZoneExport||[];
  if(!hors.length){showToast('⚠️ Aucun client hors zone','warning');return;}
  const sep=';';
  const lines=['Code Client'+sep+'Nom'+sep+'CA PDV'+sep+'CA Total'+sep+'Commercial (à remplir)'];
  for(const r of hors){
    lines.push([r.cc,'"'+(r.nom||'').replace(/"/g,'""')+'"',Math.round(r.caPDV||0),Math.round(r.caTotal||0),''].join(sep));
  }
  const bom='\uFEFF';
  const blob=new Blob([bom+lines.join('\n')],{type:'text/csv;charset=utf-8'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');a.href=url;
  const date=new Date().toISOString().slice(0,10);
  a.download=`PRISME_${_S.selectedMyStore||'AGENCE'}_HorsZone_Rattachement_${date}.csv`;
  a.click();URL.revokeObjectURL(url);
  showToast(`📥 ${hors.length} clients exportés — remplissez la colonne "Commercial" et réimportez dans 🔗 Rattachement`,'success',5000);
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
  const allClients=[...(_S._cockpitExportData?.surveiller||[]),...(_S._cockpitExportData?.enDanger||[]),...(_S._cockpitExportData?.perdus||[]),...(_S._cockpitExportData?.abandonnes||[])];
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
      const allClients=[...(_S._cockpitExportData?.surveiller||[]),...(_S._cockpitExportData?.enDanger||[]),...(_S._cockpitExportData?.perdus||[]),...(_S._cockpitExportData?.abandonnes||[])];
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

  const artMap = _S.ventesLocalHorsMag.get(cc);
  if (!artMap || !artMap.size) return;

  const CANAL_LABELS = { INTERNET:'🌐 Web', REPRESENTANT:'🤝 Représentant', DCS:'🏢 DCS' };

  // Filtrer articles déjà vendus en MAGASIN à ce client
  const magasinArts = DataStore.ventesLocalMagPeriode.get(cc) || new Map();

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


export {
  // commerce.js originals
  _renderHorsZone,
  _passesAllFilters,
  _syncPDVToggles,
  computeTerritoireKPIs,
  computeClientsKPIs,
  renderTerritoireTab,
  renderCockpitRupClients,
  renderMesClients,
  // depuis territoire.js
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
  _updateDistQuickBtns,
  _onTerrClientSearch,
  _onMetierFilter,
  _navigateToOverviewMetier,
  _toggleExcludeActifsConsomme,
  _togglePerdu24m,
  _buildOverviewFilterChips,
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
  renderCommerceTab,
};

// ── Livrés sans PDV — accordéon Conquête Terrain ─────────────────────────
function _renderLivSansPDV(containerId) {
  const el = document.getElementById(containerId);
  if (!el) return;
  const raw = _S.livraisonsSansPDV || [];
  const _com = _S._selectedCommercial || '';
  const _comSet = _com ? (_S.clientsByCommercial?.get(_com) || new Set()) : null;
  const filtered = _comSet ? raw.filter(r => _comSet.has(r.cc)) : raw;
  const list = filtered.filter(r => r.caLivraison >= 500 && r.metier && _isMetierStrategique(r.metier));
  if (!list.length) {
    el.innerHTML = _S.livraisonsReady ? `<details style="background:linear-gradient(135deg,rgba(100,116,139,0.15),rgba(51,65,85,0.08));border:1px solid rgba(100,116,139,0.25);border-radius:14px;overflow:hidden;margin-bottom:12px"><summary style="padding:14px 20px;cursor:pointer;display:flex;align-items:center;justify-content:space-between;background:linear-gradient(135deg,rgba(100,116,139,0.22),rgba(51,65,85,0.14));border-bottom:1px solid rgba(100,116,139,0.2);list-style:none" class="select-none"><h3 style="font-weight:800;font-size:13px;color:#cbd5e1;display:flex;align-items:center;gap:6px">📦 Livrés sans PDV <span style="font-size:10px;font-weight:400;color:rgba(255,255,255,0.45)">0 clients</span></h3><span class="acc-arrow" style="color:#cbd5e1">▶</span></summary><div class="p-4 text-[12px] t-secondary">Tous les clients livrés ont déjà acheté au comptoir.</div></details>` : '';
    return;
  }
  const _mkRow = r => {
    const _clCls = r.classification?.startsWith('FID') ? 'c-ok' : r.classification?.startsWith('OCC') ? 'c-caution' : 't-disabled';
    return `<tr class="border-b b-light hover:s-hover cursor-pointer transition-colors" data-cc="${escapeHtml(r.cc)}" onclick="openClient360(this.dataset.cc,'clients')"><td class="py-1.5 px-2 font-bold text-[11px]">${escapeHtml(r.nom)}<button onclick="event.stopPropagation();openClient360('${escapeHtml(r.cc)}','clients')" class="text-[10px] t-disabled hover:text-white cursor-pointer opacity-30 hover:opacity-100 transition-opacity ml-1" title="Ouvrir la fiche 360°">🔍</button></td><td class="py-1.5 px-2 text-[11px] t-tertiary">${escapeHtml(r.metier || '—')}</td><td class="py-1.5 px-2 text-center text-[10px] ${_clCls}">${escapeHtml(r.classification || '—')}</td><td class="py-1.5 px-2 text-right font-bold c-action text-[11px]">${formatEuro(r.caLivraison)}</td><td class="py-1.5 px-2 text-right text-[11px] t-tertiary">${r.nbBL}</td><td class="py-1.5 px-2 text-[11px] c-action">${escapeHtml(r.commercial || '—')}</td></tr>`;
  };
  const thStr = `<thead class="s-panel-inner t-inverse font-bold"><tr><th class="py-2 px-2 text-left">Client</th><th class="py-2 px-2 text-left">Métier</th><th class="py-2 px-2 text-center">Classif</th><th class="py-2 px-2 text-right">CA livraison</th><th class="py-2 px-2 text-right">Nb BL</th><th class="py-2 px-2 text-left">Commercial</th></tr></thead>`;
  const top10 = list.slice(0, 10).map(_mkRow).join('');
  const moreHtml = list.length > 10 ? `<details class="border-t b-default"><summary class="px-4 py-2 text-[11px] c-action cursor-pointer select-none hover:underline">Voir tous → (${list.length - 10} de plus)</summary><div class="overflow-x-auto"><table class="min-w-full text-xs">${thStr}<tbody>${list.slice(10).map(_mkRow).join('')}</tbody></table></div></details>` : '';
  el.innerHTML = `<details style="background:linear-gradient(135deg,rgba(100,116,139,0.15),rgba(51,65,85,0.08));border:1px solid rgba(100,116,139,0.25);border-radius:14px;overflow:hidden;margin-bottom:12px"><summary style="padding:14px 20px;cursor:pointer;display:flex;align-items:center;justify-content:space-between;background:linear-gradient(135deg,rgba(100,116,139,0.22),rgba(51,65,85,0.14));border-bottom:1px solid rgba(100,116,139,0.2);list-style:none" class="select-none"><h3 style="font-weight:800;font-size:13px;color:#cbd5e1;display:flex;align-items:center;gap:6px">📦 Livrés sans PDV <span style="font-size:10px;font-weight:400;color:rgba(255,255,255,0.45)">${list.length} clients · Prospects à conquérir</span></h3><span class="acc-arrow" style="color:#cbd5e1">▶</span></summary><div class="overflow-x-auto"><table class="min-w-full text-xs">${thStr}<tbody>${top10}</tbody></table></div>${moreHtml}</details>`;
}

// ── Orchestrateur principal Commerce 5 sous-vues ─────────────────────────
function renderCommerceTab() {
  // Tabs cockpit maintenant dans Fidélisation PDV — garder l'état actif
  // Sidebar : chips canal toujours visibles sur Commerce, terrFamilleFilter masqué
  document.getElementById('globalCanalFilter')?.classList.remove('hidden');
  document.getElementById('terrFamilleFilter')?.classList.add('hidden');
  const el = document.getElementById('tabCommerce');
  if (!el) return;
  // 1. Layout squelette — rapide
  el.innerHTML = `
    <div id="terrSummaryBar" class="s-card rounded-xl border shadow-sm px-4 py-3 mb-3" style="position:sticky;top:0;z-index:10;background:var(--s-card,#fff);display:none"></div>
    <div id="terrainFocusCoach" class="hidden"></div>
    <div id="comScorecard"></div>
    <div id="pochesTerrain"></div>
    <div id="comTopArticles"></div>
    <div id="livSansPDVBlock"></div>
    <div id="terrOmniBlock" class="mt-4"></div>`;
  // 2b. Scorecard portefeuille si commercial sélectionné
  _renderCommercialScorecard('comScorecard');
  // 2b2. Top 20 articles du commercial
  _renderComTopArticles('comTopArticles');
  // 2c. 4 poches Terrain
  _renderPochesTerrain('pochesTerrain');
  // 2d. Livrés sans PDV (conquête — déplacé depuis Fidélisation)
  _renderLivSansPDV('livSansPDVBlock');
  // 4. KPI bar chalandise + territoire (différé pour ne pas bloquer)
  if (_commerceRafId) cancelAnimationFrame(_commerceRafId);
  _commerceRafId = requestAnimationFrame(() => {
    _commerceRafId = 0;
    _buildOverviewFilterChips();
    window.renderOmniContent?.();
    _buildChalandiseOverviewData();
    // renderTerritoireTab seulement si les blocs territoire sont visibles (fichier BL chargé)
    if(_S.territoireLines?.length) renderTerritoireTab();
  });
}

// ── Window expositions ──────────────────────────────────────────────────
window.renderTerritoireTab        = renderTerritoireTab;
window._renderPDVTab              = renderMesClients;
window.renderCommerceTab          = renderCommerceTab;
window._cmSwitchTab               = _cmSwitchTab;
window._cmPage = function(listId, dir) {
  if (!_S._cmPages) _S._cmPages = {};
  _S._cmPages[listId] = (_S._cmPages[listId] || 0) + dir;
  if (_S._cmPages[listId] < 0) _S._cmPages[listId] = 0;
  _renderCockpitTables(); // rendu seul, pas de recalcul
};
window._renderHorsZone            = _renderHorsZone;
window.computeTerritoireKPIs      = computeTerritoireKPIs;
window.computeClientsKPIs         = computeClientsKPIs;
window._toggleOverviewClassif     = _toggleOverviewClassif;
window._toggleOverviewActPDV      = _toggleOverviewActPDV;
window._toggleOverviewStatut      = _toggleOverviewStatut;
window._toggleOverviewDirection   = _toggleOverviewDirection;
window._toggleOverviewUnivers     = _toggleOverviewUnivers;
window._onActPDVSelect            = _onActPDVSelect;
window._onStatutDetailleSelect    = _onStatutDetailleSelect;
window._onStatutSelect            = _onStatutSelect;
window._onUniversSelect           = _onUniversSelect;
window._toggleDept                = _toggleDept;
window._toggleDeptDropdown        = _toggleDeptDropdown;
window._toggleClassifDropdown     = _toggleClassifDropdown;
window._toggleActPDVDropdown      = _toggleActPDVDropdown;
window._toggleStatutDropdown      = _toggleStatutDropdown;
window._toggleDirectionDropdown   = _toggleDirectionDropdown;
window._toggleStrategiqueFilter   = _toggleStrategiqueFilter;
window._toggleSansMetier          = _toggleSansMetier;
window._onCommercialFilter        = _onCommercialFilter;
window._onCommercialInput         = _onCommercialInput;
window._setDistanceQuick          = _setDistanceQuick;
window._updateDistQuickBtns       = _updateDistQuickBtns;
window._onTerrClientSearch        = _onTerrClientSearch;
window._onMetierFilter            = _onMetierFilter;
window._navigateToOverviewMetier  = _navigateToOverviewMetier;
window._toggleExcludeActifsConsomme = _toggleExcludeActifsConsomme;
window._togglePerdu24m            = _togglePerdu24m;
window._toggleAlerteCapitaines   = _toggleAlerteCapitaines;
window._cmToggleSurveiller       = _cmToggleSurveiller;
window._resetChalandiseFilters    = _resetChalandiseFilters;
window._setPDVCanalFilter         = _setPDVCanalFilter;
window._setCrossFilter            = _setCrossFilter;
window._setClientView             = _setClientView;
window._toggleOverviewL2          = _toggleOverviewL2;
window._toggleOverviewL3          = _toggleOverviewL3;
window._toggleOverviewL4          = _toggleOverviewL4;
window._toggleClientArticles      = _toggleClientArticles;
window._cockpitToggleFullList     = _cockpitToggleFullList;
window._cockpitToggleSection      = _cockpitToggleSection;
window._buildChalDirBlock         = _buildChalDirBlock;
window._buildChalandiseOverview   = _buildChalandiseOverview;
window._buildDegradedCockpit      = _buildDegradedCockpit;
window._buildCockpitClient        = _buildCockpitClient;
window._renderOverviewL4          = _renderOverviewL4;
window.exportCockpitCSV           = exportCockpitCSV;
window.exportCockpitCSVAll        = exportCockpitCSVAll;
window.exportHorsZoneCSV          = exportHorsZoneCSV;
window.exportExclusionsJSON       = exportExclusionsJSON;
window.importExclusionsJSON       = importExclusionsJSON;
window._showExcludePrompt         = _showExcludePrompt;
window._confirmExclude            = _confirmExclude;
window._unexcludeClient           = _unexcludeClient;
window._unexcludeAll              = _unexcludeAll;
window._toggleExcludedList        = _toggleExcludedList;
window._toggleHorsMagasin         = _toggleHorsMagasin;
window.excludeClient              = _showExcludePrompt;
window.confirmExclude             = _confirmExclude;
