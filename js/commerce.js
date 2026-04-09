'use strict';

// ── ESM imports ─────────────────────────────────────────────────────────
import { _S } from './state.js';
import { DataStore } from './store.js';
import {
  formatEuro, escapeHtml, _copyCodeBtn, fmtDate, matchQuery,
  daysBetween, famLib, famLabel,
  _normalizeClassif, _classifShort, _normalizeStatut,
  _isMetierStrategique, getSecteurDirection, formatLocalYMD
} from './utils.js';
import {
  _clientPassesFilters, _unikLink,
  _passesClientCrossFilter,
  _isPDVActif, _isGlobalActif, _isPerdu, _isProspect,
  _isPerdu24plus, _clientStatusBadge, _clientStatusText,
  _crossBadge
} from './engine.js';
import { getSelectedSecteurs } from './parser.js';
import { renderInsightsBanner, showToast } from './ui.js';
import { deltaColor, renderOppNetteTable } from './helpers.js';
import { openClient360, closeDiagnostic, openDiagnosticMetier } from './diagnostic.js';
import { _saveExclusions } from './cache.js';

// ── Cross-module calls via window.xxx (avoid circular deps) ─────────────
// territoire.js (ex-terrain.js): buildTerrContrib, renderTerrContrib, renderTerrCroisementSummary

const buildTerrContrib = (...a) => window.buildTerrContrib?.(...a);
const renderTerrContrib = (...a) => window.renderTerrContrib?.(...a);
const renderTerrCroisementSummary = (...a) => window.renderTerrCroisementSummary?.(...a);
const getKPIsByCanal = (...a) => window.getKPIsByCanal?.(...a);

// ── Nav 4 sous-vues Commerce ─────────────────────────────────────────────
let _cmTab = 'silencieux';

// ── Secteur dropdown outside click handler (migré depuis omni.js) ─────────
document.addEventListener('click',function(e){
  const dd=document.getElementById('terrSecteurDropdown');
  if(dd&&!dd.contains(e.target)){const panel=document.getElementById('terrSecteurPanel');if(panel)panel.classList.add('hidden');}
});

// ── Nav 4 sous-vues — helpers ────────────────────────────────────────────
function _cmRenderNav(counts) {
  const tabs = [
    { id: 'silencieux',   label: '🟡 Silencieux',   n: counts.silencieux },
    { id: 'perdus',       label: '🔴 Perdus',        n: counts.perdus },
    { id: 'potentiels',   label: '🎯 Potentiels',    n: counts.potentiels },
    { id: 'canal',        label: '📡 Canal',          n: null },
    { id: 'omni',         label: '🔗 Omnicanal',      n: null },
  ];
  return tabs.map(t => {
    const active = _cmTab === t.id;
    return `<button onclick="window._cmSwitchTab('${t.id}')"
      class="px-3 py-2 text-sm font-semibold transition-colors ${active ? 'border-b-2 c-action' : 't-secondary hover:t-primary'}"
      style="${active ? 'border-color:var(--c-action)' : ''}">${t.label}${t.n != null ? ` <span class="text-[10px] font-normal">(${t.n})</span>` : ''}</button>`;
  }).join('');
}

// RÈGLE PRISME — render autonome :
// Chaque case injecte d'abord ses slots HTML, puis appelle la fonction de peuplement.
// index.html ne contient que les conteneurs d'onglets vides.
// Pour déplacer un pavé : changer le case ici, rien d'autre.
function _cmSwitchTab(id) {
  _cmTab = id;
  _S._cmTab = id;
  const nav = document.getElementById('cm-tab-nav');
  const content = document.getElementById('cm-tab-content');
  if (!nav || !content) return;
  switch (id) {
    case 'silencieux':
      content.innerHTML = `<div id="terrSilencieux"></div>`;
      break;
    case 'perdus':
      content.innerHTML = `<div id="terrPerdus"></div>`;
      break;
    case 'potentiels':
      content.innerHTML = `<div id="terrACapter"></div>`;
      break;
    case 'canal':
      content.innerHTML = `<div id="terrCanalBlock" style="background:linear-gradient(135deg,rgba(100,116,139,0.12),rgba(71,85,105,0.06));border:1px solid rgba(100,116,139,0.25);border-radius:14px;overflow:hidden;margin-bottom:12px">
        <div style="padding:14px 20px;background:linear-gradient(135deg,rgba(100,116,139,0.18),rgba(71,85,105,0.10));border-bottom:1px solid rgba(100,116,139,0.2)">
          <h3 style="font-weight:800;font-size:13px;color:#cbd5e1;display:flex;align-items:center;gap:6px">📡 Répartition par canal</h3>
          <p id="canalAgenceSubtitle" style="font-size:10px;color:rgba(255,255,255,0.45);margin-top:2px">CA tous canaux · Magasin = Prélevé + Enlevé · Source : consommé</p>
        </div>
        <div id="canalAgenceBlock" class="p-3"></div>
      </div>`;
      break;
    case 'omni':
      content.innerHTML = `<div style="background:linear-gradient(135deg,rgba(20,184,166,0.12),rgba(13,148,136,0.06));border:1px solid rgba(20,184,166,0.25);border-radius:14px;overflow:hidden;margin-bottom:12px">
        <div style="padding:14px 20px;background:linear-gradient(135deg,rgba(20,184,166,0.18),rgba(13,148,136,0.10));border-bottom:1px solid rgba(20,184,166,0.2)">
          <h3 style="font-weight:800;font-size:13px;color:#2dd4bf;display:flex;align-items:center;gap:6px">🔗 Segments omnicanaux</h3>
        </div>
        <div class="p-3"><div id="terrSegmentsOmni"></div></div>
      </div>`;
      break;
  }
  _buildCockpitClient(); // calcule _cockpitExportData avec les filtres actifs
  if (id === 'canal') window.renderCanalAgence?.();
  if (id === 'omni') window._renderSegmentsOmnicanaux?.();
  nav.innerHTML = _cmRenderNav(_cmComputeCounts()); // badges à jour après calcul
}

function _cmComputeCounts() {
  return {
    silencieux: _S._cockpitExportData?.silencieux?.length || 0,
    perdus: _S._cockpitExportData?.perdus?.length || 0,
    potentiels: _S._cockpitExportData?.jamaisVenus?.length || 0,
    opportunites: null
  };
}


// ── Drill chalandise — Vue par Direction (mode sans territoire) ──────────
const _DIR_LABELS = { '-': 'Second Œuvre', 'DVM': 'Maintenance', 'DVI': 'DVI Industrie', 'DVP': 'DVP Plomberie' };

// ── Vue territoire en cascade (Direction → Métier → Clients, tout en DOM) ──
function _buildChalDirBlock(blkEl) {
  if (!blkEl || !_S.chalandiseReady) return;
  const all = [...(_S.chalandiseData||new Map()).entries()]
    .filter(([cc]) => _passesAllFilters(cc))
    .map(([cc, info]) => ({ cc, ...info }));
  const _lbl = d => _DIR_LABELS[d] || d || 'Autre';

  const _grp = clients => {
    const g = {total:0,aL:0,aP:0,pro:0,per:0,ina:0};
    for (const c of clients) {
      g.total++;
      if(c.statut==='Actif') g.aL++;
      if(_S.clientsMagasin?.has(c.cc)) g.aP++;
      if(c.statut==='Prospect') g.pro++;
      if(c.statutDetaille==='Perdu 12-24 mois') g.per++;
      if(c.statut==='Inactif') g.ina++;
    }
    return g;
  };

  // Groupement direction → métier → clients
  const byDir = new Map();
  for (const c of all) {
    const d = c.direction||'Autre';
    if (!byDir.has(d)) byDir.set(d, new Map());
    const bm = byDir.get(d);
    const m = c.metier||'—';
    if (!bm.has(m)) bm.set(m, []);
    bm.get(m).push(c);
  }

  const pctCap = all.length>0 ? Math.round(all.filter(c=>c.statut==='Actif').length/all.length*100) : 0;
  const totalPDV = all.filter(c=>_S.clientsMagasin?.has(c.cc)).length;
  let html='';
  let di=0;

  for (const [d, bm] of [...byDir.entries()].sort((a,b)=>[...b[1].values()].flat().length-[...a[1].values()].flat().length)) {
    const dc=[...bm.values()].flat(), g=_grp(dc);
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
    for (const [m, mc] of [...bm.entries()].sort((a,b)=>b[1].length-a[1].length)) {
      const gm=_grp(mc), star=_isMetierStrategique(m)?' ⭐':'';
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
      for(const c of mc){const com=c.commercial||'—';if(!byComm.has(com))byComm.set(com,[]);byComm.get(com).push(c);}
      let ci=0;
      for(const[com,cc_list] of [...byComm.entries()].sort((a,b)=>b[1].length-a[1].length)){
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
            <td class="py-1 px-2 pl-12">${_S.clientsMagasin?.has(c.cc)?'✅ ':'○ '}${star2}<span class="font-medium">${escapeHtml(c.nom||c.cc)}</span> <span class="t-disabled">${c.cc}</span></td>
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

  blkEl.innerHTML=`<div style="display:flex;align-items:center;justify-content:space-between;padding:12px 16px;background:linear-gradient(135deg,rgba(139,92,246,0.2),rgba(109,40,217,0.12));border-bottom:1px solid rgba(139,92,246,0.2)">
    <span style="font-weight:800;font-size:12px;color:#a78bfa">🎯 Votre territoire en un coup d'œil</span>
    <span class="text-[10px] t-disabled">${byDir.size} dir. · ${all.length} clients · ${totalPDV} actifs PDV · ${pctCap}% captés</span>
  </div>
  <div class="overflow-x-auto"><table class="min-w-full text-xs">
    <thead class="s-panel-inner t-inverse"><tr class="text-[10px]">
      <th class="py-1.5 px-2 text-left">Direction / Métier / Client</th>
      <th class="py-1.5 px-2 text-right">Total</th><th class="py-1.5 px-2 text-right">Captés Leg.</th>
      <th class="py-1.5 px-2 text-right">Captés PDV</th><th class="py-1.5 px-2 text-right">Prospects</th>
      <th class="py-1.5 px-2 text-right">Perdus 12-24m</th><th class="py-1.5 px-2 text-right">Inactifs</th>
      <th class="py-1.5 px-2 text-right">% Leg.</th><th class="py-1.5 px-2 text-right">% PDV</th>
    </tr></thead>
    <tbody>${html||`<tr><td colspan="9" class="text-center py-4 t-disabled">Aucune donnée</td></tr>`}</tbody>
  </table></div>`;
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
    if(!_S.chalandiseReady||!_S.ventesClientArticle.size){el.innerHTML='';return;}
    const page=_S._horsZonePage||0;
    const HZ_PAGE=20;
    const nowMs=Date.now();
    const _tcsHz=(_S._terrClientSearch||'').toLowerCase();const _mHz=cc=>!_tcsHz||(cc||'').includes(_tcsHz)||(_S.clientNomLookup?.[cc]||_S.chalandiseData?.get(cc)?.nom||'').toLowerCase().includes(_tcsHz);
    const hors=[];
    for(const[cc,artMap]of _S.ventesClientArticle){
      if(_S.chalandiseData.has(cc))continue;
      if(!_passesAllFilters(cc))continue;
      if(!_mHz(cc))continue;
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
    return{livSansPDV,hasTerr,hasChal,hasData,hasConsomme,degraded,hasCross,crossCaptes,crossFideles,crossPotentiels};
  }

  // ── computeClientsKPIs — pure data for renderMesClients ──────────────
  function computeClientsKPIs(){
    const now=new Date();
    const livSansPDV=_S.livraisonsSansPDV||[];
    // Top clients — CA selon le canal sélectionné
    const _gCanal=_S._globalCanal||'';
    const topPDVRows=[];
    const _seenCC=new Set();
    if(!_gCanal||_gCanal==='MAGASIN'){
      // Tous ou MAGASIN — source : ventesClientArticle (MAGASIN)
      for(const[cc,artMap]of _S.ventesClientArticle){
        _seenCC.add(cc);
        const caMag=[...artMap.values()].reduce((s,v)=>s+(v.sumCA||0),0);
        if(caMag<100)continue;
        const horsMap=_S.ventesClientHorsMagasin.get(cc);
        const caHorsTot=horsMap?[...horsMap.values()].reduce((s,v)=>s+(v.sumCA||0),0):0;
        const caTotal=caMag+caHorsTot;
        // Canal Tous → caPDV = total tous canaux ; Canal MAGASIN → caPDV = MAGASIN + caHors séparé
        const caPDV=_gCanal==='MAGASIN'?caMag:caTotal;
        const caHors=_gCanal==='MAGASIN'?caHorsTot:0;
        const lastDate=_S.clientLastOrder?.get(cc);
        const info=_S.chalandiseData?.get(cc);
        const nom=info?.nom||_S.clientNomLookup?.[cc]||cc;
        topPDVRows.push({cc,nom,metier:info?.metier||'',commercial:info?.commercial||'',caPDV,caHors,caTotal,lastDate});
      }
      // Canal Tous : inclure aussi les clients hors-MAGASIN purs
      if(!_gCanal){
        for(const[cc,horsMap]of _S.ventesClientHorsMagasin){
          if(_seenCC.has(cc))continue;
          const caHorsTot=[...horsMap.values()].reduce((s,v)=>s+(v.sumCA||0),0);
          if(caHorsTot<100)continue;
          const lastDate=_S.clientLastOrder?.get(cc);
          const info=_S.chalandiseData?.get(cc);
          const nom=info?.nom||_S.clientNomLookup?.[cc]||cc;
          topPDVRows.push({cc,nom,metier:info?.metier||'',commercial:info?.commercial||'',caPDV:caHorsTot,caHors:0,caTotal:caHorsTot,lastDate});
        }
      }
    }else{
      // Canal spécifique non-MAGASIN — filtrer ventesClientHorsMagasin par canal
      for(const[cc,horsMap]of _S.ventesClientHorsMagasin){
        const entries=[...horsMap.values()].filter(v=>v.canal===_gCanal);
        const caCanal=entries.reduce((s,v)=>s+(v.sumCA||0),0);
        if(caCanal<100)continue;
        const lastDate=_S.clientLastOrder?.get(cc);
        const info=_S.chalandiseData?.get(cc);
        const nom=info?.nom||_S.clientNomLookup?.[cc]||cc;
        topPDVRows.push({cc,nom,metier:info?.metier||'',commercial:info?.commercial||'',caPDV:caCanal,caHors:0,caTotal:caCanal,lastDate});
      }
    }
    topPDVRows.sort((a,b)=>b.caPDV-a.caPDV);
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
    return{livSansPDV,topPDVRows,horsZone,digitaux};
  }

  function renderTerritoireTab(){
    const k=computeTerritoireKPIs();
    // ── Blocs Clients PDV (Top 5, Top PDV, Hors zone, Reconquête, Opportunités) ──
    {
      const _setEl=(id,html)=>{const e=document.getElementById(id);if(e)e.innerHTML=html;};

      // Opportunités nettes — accordéon + tableau paginé (factorisé dans helpers.js)
      _setEl('terrOpportunites', renderOppNetteTable());

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
    const sumBar=document.getElementById('terrSummaryBar');if(sumBar&&!hasChal){sumBar.classList.add('hidden');sumBar.style.display='none';}

    // Blocs accordion analyse territoire — conditions précises hasTerr / hasChal
    {const _tb=(id,show)=>document.getElementById(id)?.classList.toggle('hidden',!show);
    // terrDirectionContainer : injecté dynamiquement si territoire OU chalandise chargé
    // Territoire seul → vue CA/articles/couverture (terrDirectionTable rempli ligne 631)
    // Chalandise chargée → _buildChalDirBlock remplace par vue drill client
    {const _dc=document.getElementById('terrDirectionContainer');if(_dc){if(hasChal||hasTerr){
      if(!_dc.querySelector('#terrDirectionTable')){_dc.innerHTML=`<div style="background:linear-gradient(135deg,rgba(139,92,246,0.13),rgba(109,40,217,0.06));border:1px solid rgba(139,92,246,0.3);border-radius:14px;overflow:hidden;margin-bottom:6px;margin-left:8px;margin-right:8px"><details><summary style="padding:12px 16px;cursor:pointer;display:flex;align-items:center;justify-content:space-between;background:linear-gradient(135deg,rgba(139,92,246,0.2),rgba(109,40,217,0.12));border-bottom:1px solid rgba(139,92,246,0.2);list-style:none" class="select-none"><h3 style="font-weight:800;font-size:12px;color:#a78bfa;display:flex;align-items:center;gap:6px">🎯 Vue par Direction commerciale</h3></summary><div class="overflow-x-auto"><table class="min-w-full text-xs"><thead class="s-panel-inner t-inverse"><tr class="text-[10px]"><th class="py-1.5 px-3 text-left">Direction</th><th class="py-1.5 px-3 text-right">CA Le Terrain</th><th class="py-1.5 px-3 text-center">Nb articles</th><th class="py-1.5 px-3 text-center">✅</th><th class="py-1.5 px-3 text-center">⚠️</th><th class="py-1.5 px-3 text-center">❌</th><th class="py-1.5 px-3">Couverture</th></tr></thead><tbody id="terrDirectionTable"></tbody></table></div></details></div>`;}
      if(hasChal)_buildChalDirBlock(_dc);
    }else{_dc.innerHTML='';}}}

    _tb('terrKPIBlock',        hasTerr);   // BL Livraisons requis
    _tb('terrCroisementBlock', hasTerr);
    _tb('terrSpecialKPIBlock', hasTerr);
    _tb('terrContribBlock',    hasTerr);
    _tb('terrTop100Block',     hasTerr);
    _tb('terrClientsBlock',    hasTerr);
    _tb('terrNeedTerrBlock',   !hasTerr);} // message "BL requis" si !hasTerr

    if(!hasData&&!hasTerr&&!hasChal&&!hasConsomme)return;
    if(degraded){_buildDegradedCockpit();return;}
    if(!hasTerr){
      _buildDegradedCockpit();
      // terrDirectionContainer already handled above (hasChal path)
      return;
    }
    const q=(document.getElementById('terrSearch')||{}).value||'';
    const stockMap=new Map(DataStore.finalData.map(r=>[r.code,r]));
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

    // _buildChalDirBlock réactif aux filtres sidebar (hasTerr path)
    if(_S.chalandiseReady){const _dc=document.getElementById('terrDirectionContainer');if(_dc)_buildChalDirBlock(_dc);}

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

  // ★ BADGES FILTRES ACTIFS
  function renderMesClients(){
    const el=document.getElementById('tabClients');
    if(!el)return;
    if(!_S.ventesClientArticle.size && !_S.finalData.length){
      el.innerHTML='<div class="p-8 text-center t-disabled">Chargez d\'abord le fichier consommé.</div>';
      return;
    }
    if(_S.chalandiseReady) _buildOverviewFilterChips();
    const k=computeClientsKPIs();
    // ── Filtre recherche client (_terrClientSearch) — appliqué à toutes les sections ──
    const _qSrch=(_S._terrClientSearch||'').toLowerCase();
    if(_qSrch){
      const _matchC=(cc,nom)=>cc.toLowerCase().includes(_qSrch)||(nom||'').toLowerCase().includes(_qSrch)||(_S.clientNomLookup?.[cc]||'').toLowerCase().includes(_qSrch)||(_S.chalandiseData?.get(cc)?.nom||'').toLowerCase().includes(_qSrch);
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
        return`<tr class="border-b b-light hover:s-hover cursor-pointer transition-colors" data-cc="${escapeHtml(r.cc)}" onclick="openClient360(this.dataset.cc,'clients')"><td class="py-1.5 px-2 font-bold text-[11px]">${escapeHtml(r.nom)}</td><td class="py-1.5 px-2 text-[11px] t-tertiary">${escapeHtml(r.metier||'—')}</td><td class="py-1.5 px-2 text-right font-bold c-action text-[11px]">${formatEuro(r.caPDV)}</td>${_horsCell}<td class="py-1.5 px-2 text-center text-[10px] ${silCls}">${silTxt}</td><td class="py-1.5 px-2 text-[11px] c-action">${escapeHtml(r.commercial||'—')}</td></tr>`;
      };
      const top20=rows.slice(0,20);
      const _gc=_S._globalCanal||'';
      const _caLbl=_gc===''?'CA Total':_gc==='MAGASIN'?'CA PDV':_gc==='INTERNET'?'CA Internet':_gc==='REPRESENTANT'?'CA Représentant':_gc==='DCS'?'CA DCS':'CA';
      const _horsLbl=_gc==='MAGASIN'?'Hors agence':'';
      const _thRow=`<tr><th class="py-2 px-2 text-left">Client</th><th class="py-2 px-2 text-left">Métier</th><th class="py-2 px-2 text-right">${_caLbl}</th>${_horsLbl?`<th class="py-2 px-2 text-right">${_horsLbl}</th>`:''}<th class="py-2 px-2 text-center">Silence</th><th class="py-2 px-2 text-left">Commercial</th></tr>`;
      const moreHtml=rows.length>20?`<details class="border-t b-default"><summary class="px-4 py-2 text-[11px] c-action cursor-pointer select-none hover:underline">Voir tous → (${rows.length-20} de plus)</summary><div class="overflow-x-auto"><table class="min-w-full text-xs"><thead class="s-panel-inner t-inverse font-bold">${_thRow}</thead><tbody>${rows.slice(20).map(_mkRow).join('')}</tbody></table></div></details>`:'';
      const thStr=`<thead class="s-panel-inner t-inverse font-bold">${_thRow}</thead>`;
      return`<details open style="background:linear-gradient(135deg,rgba(234,179,8,0.13),rgba(202,138,4,0.06));border:1px solid rgba(234,179,8,0.3);border-radius:14px;overflow:hidden;margin-bottom:12px"><summary style="padding:14px 20px;cursor:pointer;display:flex;align-items:center;justify-content:space-between;background:linear-gradient(135deg,rgba(234,179,8,0.2),rgba(202,138,4,0.12));border-bottom:1px solid rgba(234,179,8,0.2);list-style:none" class="select-none"><h3 style="font-weight:800;font-size:13px;color:#fde047;display:flex;align-items:center;gap:6px">🏆 Top clients <span style="font-size:10px;font-weight:400;color:rgba(255,255,255,0.45)">${rows.length} clients · ${_caLbl}</span></h3><span class="acc-arrow" style="color:#fde047">▶</span></summary><div class="overflow-x-auto"><table class="min-w-full text-xs">${thStr}<tbody>${top20.map(_mkRow).join('')}</tbody></table></div>${moreHtml}</details>`;
    })();
    // ── S2b: Livrés sans PDV — accordéon, top 10 + "Voir tous" ────────────────
    const _livAllB=k.livSansPDV;
    const livSPDVHtml=(()=>{
      if(!_livAllB.length)return _S.livraisonsReady?`<details style="background:linear-gradient(135deg,rgba(100,116,139,0.15),rgba(51,65,85,0.08));border:1px solid rgba(100,116,139,0.25);border-radius:14px;overflow:hidden;margin-bottom:12px"><summary style="padding:14px 20px;cursor:pointer;display:flex;align-items:center;justify-content:space-between;background:linear-gradient(135deg,rgba(100,116,139,0.22),rgba(51,65,85,0.14));border-bottom:1px solid rgba(100,116,139,0.2);list-style:none" class="select-none"><h3 style="font-weight:800;font-size:13px;color:#cbd5e1;display:flex;align-items:center;gap:6px">📦 Livrés sans PDV <span style="font-size:10px;font-weight:400;color:rgba(255,255,255,0.45)">0 clients</span></h3><span class="acc-arrow" style="color:#cbd5e1">▶</span></summary><div class="p-4 text-[12px] t-secondary">Tous les clients livrés ont déjà acheté au comptoir.</div></details>`:'';
      const _mkRow=r=>`<tr class="border-b b-light hover:s-hover cursor-pointer transition-colors" data-cc="${escapeHtml(r.cc)}" onclick="openClient360(this.dataset.cc,'clients')"><td class="py-1.5 px-2 font-bold text-[11px]">${escapeHtml(r.nom)}</td><td class="py-1.5 px-2 text-[11px] t-tertiary">${escapeHtml(r.metier||'—')}</td><td class="py-1.5 px-2 text-right font-bold c-action text-[11px]">${formatEuro(r.caLivraison)}</td><td class="py-1.5 px-2 text-right text-[11px] t-tertiary">${r.nbBL}</td><td class="py-1.5 px-2 text-[11px] c-action">${escapeHtml(r.commercial||'—')}</td></tr>`;
      const thStr=`<thead class="s-panel-inner t-inverse font-bold"><tr><th class="py-2 px-2 text-left">Nom client</th><th class="py-2 px-2 text-left">Métier</th><th class="py-2 px-2 text-right">CA livraison</th><th class="py-2 px-2 text-right">Nb BL</th><th class="py-2 px-2 text-left">Commercial</th></tr></thead>`;
      const top10=_livAllB.slice(0,10).map(_mkRow).join('');
      const moreHtml=_livAllB.length>10?`<details class="border-t b-default"><summary class="px-4 py-2 text-[11px] c-action cursor-pointer select-none hover:underline">Voir tous → (${_livAllB.length-10} de plus)</summary><div class="overflow-x-auto"><table class="min-w-full text-xs">${thStr}<tbody>${_livAllB.slice(10).map(_mkRow).join('')}</tbody></table></div></details>`:'';
      return`<details style="background:linear-gradient(135deg,rgba(100,116,139,0.15),rgba(51,65,85,0.08));border:1px solid rgba(100,116,139,0.25);border-radius:14px;overflow:hidden;margin-bottom:12px"><summary style="padding:14px 20px;cursor:pointer;display:flex;align-items:center;justify-content:space-between;background:linear-gradient(135deg,rgba(100,116,139,0.22),rgba(51,65,85,0.14));border-bottom:1px solid rgba(100,116,139,0.2);list-style:none" class="select-none"><h3 style="font-weight:800;font-size:13px;color:#cbd5e1;display:flex;align-items:center;gap:6px">📦 Livrés sans PDV <span style="font-size:10px;font-weight:400;color:rgba(255,255,255,0.45)">${_livAllB.length} clients</span></h3><span class="acc-arrow" style="color:#cbd5e1">▶</span></summary><div class="overflow-x-auto"><table class="min-w-full text-xs">${thStr}<tbody>${top10}</tbody></table></div>${moreHtml}</details>`;
    })();

    // ── S3: Opportunités nettes — accordéon + tableau paginé (factorisé dans helpers.js)
    const oppsHtml = renderOppNetteTable();

    // ── Clients PDV hors zone (PDV mais absents chalandise) ───────────────
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
        horsZoneHtml=`<div style="background:linear-gradient(135deg,rgba(217,119,6,0.15),rgba(180,83,9,0.08));border:1px solid rgba(217,119,6,0.3);border-radius:14px;overflow:hidden;margin-bottom:20px"><div style="padding:14px 20px;background:linear-gradient(135deg,rgba(217,119,6,0.2),rgba(180,83,9,0.12));border-bottom:1px solid rgba(217,119,6,0.2)"><h3 style="font-weight:800;font-size:13px;color:#fbbf24">⚠️ Clients PDV hors zone <span style="font-size:10px;font-weight:400;color:rgba(255,255,255,0.45)">${hors.length} client${hors.length>1?'s':''} absents de la chalandise</span></h3></div><p style="font-size:11px;color:rgba(255,255,255,0.45);padding:8px 20px;border-bottom:1px solid rgba(217,119,6,0.15)">Clients actifs au comptoir mais non référencés dans la zone de chalandise — vérifier s'ils doivent être ajoutés.</p><div class="overflow-x-auto"><table class="min-w-full text-xs"><thead class="s-panel-inner t-inverse font-bold"><tr><th class="py-2 px-2 text-left">Client</th><th class="py-2 px-2 text-right">CA PDV</th><th class="py-2 px-2 text-right">CA Total</th><th class="py-2 px-2 text-right">Delta hors</th><th class="py-2 px-2 text-center">Silence</th></tr></thead><tbody>${rows}</tbody></table></div></div>`;
      }
    }

    // ── Section 4b : Clients devenus digitaux ────────────────────────────
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

    el.innerHTML = topPDVHtml + livSPDVHtml + oppsHtml + horsZoneHtml + digitauxHtml;
  }



// ── Chalandise — état filtre client (fusionné depuis territoire.js) ──────
let _terrClientSearchTimer = null;

// ── Chalandise / Overview (fusionné depuis territoire.js) ──────────────────

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
  const raw=(document.getElementById('terrSearch')?.value||'').toLowerCase().trim();
  _S._terrClientSearch=raw;
  _terrClientSearchTimer=setTimeout(()=>{renderMesClients();window.renderTerritoireTab?.();},300);
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
  if(_S._omniSegmentFilter&&_S.clientOmniScore?.size){
    // Segment filter active: iterate clientOmniScore, CA from ventesClientArticleFull
    const _vcaFull=_S.ventesClientArticleFull?.size?_S.ventesClientArticleFull:_S.ventesClientArticle;
    for(const[cc,o]of _S.clientOmniScore){
      if(o.segment!==_S._omniSegmentFilter)continue;
      const info=_S.chalandiseData?.get(cc);
      if(info&&!_clientPassesFilters(info,cc))continue;
      if(info&&!_S._includePerdu24m&&_isPerdu24plus(info))continue;
      const com=(info?.commercial)||'-';
      if(!comData[com])comData[com]={ca:0,nb:0};
      const d=comData[com];d.nb++;
      const am=_vcaFull?.get(cc);
      if(am)for(const v of am.values())d.ca+=v.sumCA||0;
    }
  }else{
    const _tcsCom=(_S._terrClientSearch||'').toLowerCase();const _mCom=cc=>!_tcsCom||(cc||'').includes(_tcsCom)||(_S.clientNomLookup?.[cc]||_S.chalandiseData?.get(cc)?.nom||'').toLowerCase().includes(_tcsCom);
    for(const[cc,info] of _S.chalandiseData.entries()){
      if(!_clientPassesFilters(info,cc))continue;
      if(!_S._includePerdu24m&&_isPerdu24plus(info))continue;
      if(!_mCom(cc))continue;
      const com=info.commercial||'-';
      if(!comData[com])comData[com]={ca:0,nb:0};
      const d=comData[com];d.nb++;
      if(isHors){
        const hm=_S.ventesClientHorsMagasin.get(cc);
        if(hm)for(const v of hm.values()){if(v.canal===canal)d.ca+=v.sumCA||0;}
      }else if(canal==='MAGASIN'||!canal){
        const am=DataStore.ventesClientArticle.get(cc);
        if(am)for(const v of am.values())d.ca+=v.sumCA||0;
      }
    }
  }
  const unassigned=comData['-'];
  const mainList=Object.entries(comData).filter(([com,d])=>com!=='-'&&d.nb>0).sort((a,b)=>b[1].ca-a[1].ca);
  const totalCount=mainList.length+(unassigned&&unassigned.nb>0?1:0);
  const segClientCount=_S._omniSegmentFilter&&_S.clientOmniScore?[..._S.clientOmniScore.values()].filter(o=>o.segment===_S._omniSegmentFilter).length:null;
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
  let html=`<details ${isOpen?'open':''} style="background:linear-gradient(135deg,rgba(100,116,139,0.13),rgba(51,65,85,0.06));border:1px solid rgba(100,116,139,0.3);border-radius:14px;overflow:hidden;margin-bottom:12px" ontoggle="document.getElementById('commercialSummaryBlock').dataset.open=this.open?'1':'0'">
    <summary style="padding:12px 16px;cursor:pointer;display:flex;align-items:center;justify-content:space-between;background:linear-gradient(135deg,rgba(100,116,139,0.2),rgba(51,65,85,0.12));border-bottom:1px solid rgba(100,116,139,0.2);list-style:none" class="select-none">
      <h3 style="font-weight:800;font-size:12px;color:#cbd5e1;display:flex;align-items:center;gap:6px">
        👤 Vue par commercial${filterTags?` — <span style="color:#67e8f9">${filterTags}</span>`:''}
        <span style="font-size:10px;font-weight:400;color:rgba(255,255,255,0.45)">(${segClientCount!=null?segClientCount:totalCount})</span>
      </h3>
      <div class="flex items-center gap-2">
        ${sel?`<button onclick="event.stopPropagation();event.preventDefault();_onCommercialFilter('')" class="text-[10px] c-danger font-semibold hover:underline">✕ ${escapeHtml(sel)}</button>`:''}
        <span class="text-[10px] t-tertiary font-normal">${summaryLine}</span>
        <span class="acc-arrow" style="color:#cbd5e1">▶</span>
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

function _renderOmniSegmentClients(){
  const el=document.getElementById('omniSegmentClientsBlock');if(!el)return;
  const seg=_S._omniSegmentFilter;
  if(!seg||!_S.clientOmniScore?.size){el.classList.add('hidden');el.innerHTML='';return;}
  const SEG_LABELS=(window.SEG_LABELS||{purComptoir:'Pur Comptoir',purHors:'Pur Hors-Magasin',hybride:'Hybride',full:'Full Omnicanal'});
  const segLabel=SEG_LABELS[seg]||seg;
  const _tcsOmni=(_S._terrClientSearch||'').toLowerCase();const _mOmni=cc=>!_tcsOmni||(cc||'').includes(_tcsOmni)||(_S.clientNomLookup?.[cc]||_S.chalandiseData?.get(cc)?.nom||'').toLowerCase().includes(_tcsOmni);
  const clients=[];
  for(const[cc,o]of _S.clientOmniScore){
    if(o.segment!==seg)continue;
    if(!_mOmni(cc))continue;
    const info=_S.chalandiseData?.get(cc);
    const nom=info?.nom||_S.clientNomLookup?.[cc]||cc;
    const com=info?.commercial||'—';
    clients.push({cc,nom,com,caPDV:o.caPDV||0,caHors:o.caHors||0,nbCanaux:o.nbCanaux||0});
  }
  clients.sort((a,b)=>b.caPDV-a.caPDV);
  if(!clients.length){el.classList.add('hidden');el.innerHTML='';return;}
  el.classList.remove('hidden');
  const isOpen=el.dataset.open==='1';
  let rows='';
  for(const c of clients){
    rows+=`<tr class="border-t b-light hover:s-card-alt">
      <td class="py-1.5 px-2 font-semibold t-primary max-w-[160px] truncate" title="${escapeHtml(c.nom)}">${escapeHtml(c.nom)}</td>
      <td class="py-1.5 px-2 t-secondary text-[11px] max-w-[120px] truncate" title="${escapeHtml(c.com)}">${escapeHtml(c.com)}</td>
      <td class="py-1.5 px-2 text-right font-bold">${c.caPDV>0?formatEuro(c.caPDV):'—'}</td>
      <td class="py-1.5 px-2 text-right t-secondary">${c.caHors>0?formatEuro(c.caHors):'—'}</td>
      <td class="py-1.5 px-2 text-center t-secondary">${c.nbCanaux}</td>
      <td class="py-1.5 px-2 text-center"><button class="text-[10px] c-action hover:underline font-semibold" onclick="openClient360('${escapeHtml(c.cc)}')">360°</button></td>
    </tr>`;
  }
  el.innerHTML=`<details ${isOpen?'open':''} style="background:linear-gradient(135deg,rgba(6,182,212,0.12),rgba(8,145,178,0.06));border:1px solid rgba(6,182,212,0.25);border-radius:14px;overflow:hidden;margin-bottom:12px" ontoggle="document.getElementById('omniSegmentClientsBlock').dataset.open=this.open?'1':'0'">
    <summary style="padding:12px 16px;cursor:pointer;display:flex;align-items:center;justify-content:space-between;background:linear-gradient(135deg,rgba(6,182,212,0.18),rgba(8,145,178,0.10));border-bottom:1px solid rgba(6,182,212,0.2);list-style:none" class="select-none">
      <h3 style="font-weight:800;font-size:12px;color:#22d3ee">👤 Clients — ${escapeHtml(segLabel)} <span style="font-size:10px;font-weight:400;color:rgba(255,255,255,0.45)">(${clients.length})</span></h3>
      <span class="acc-arrow" style="color:#22d3ee">▶</span>
    </summary>
    <div class="overflow-x-auto"><table class="min-w-full text-xs">
      <thead class="s-panel-inner t-inverse"><tr>
        <th class="py-1.5 px-2 text-left">Client</th>
        <th class="py-1.5 px-2 text-left">Commercial</th>
        <th class="py-1.5 px-2 text-right">CA PDV</th>
        <th class="py-1.5 px-2 text-right">CA hors agence</th>
        <th class="py-1.5 px-2 text-center">Canaux</th>
        <th class="py-1.5 px-2 text-center">Fiche</th>
      </tr></thead><tbody>${rows}</tbody>
    </table></div>
  </details>`;
}

function _buildChalandiseOverview(){
  // Toujours rafraîchir le sous-onglet actif, même si terrChalandiseOverview absent
  _buildOverviewFilterChips();
  if (document.getElementById('cm-tab-nav')) {
    window._cmSwitchTab?.(_cmTab);
  } else if (document.getElementById('tabClients')) {
    renderMesClients();
  }
  if(!_S.chalandiseReady){const _b=document.getElementById('terrChalandiseOverview');if(_b)_b.classList.add('hidden');return;}
  // Aggregate — toujours exécuté (KPI bar + badges réactifs aux filtres)
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
    const pdvActif=!!_S.clientsMagasin?.has(cc);
    if(_isProspect(info)){d.prospects++;}
    else if(_isPerdu(info)&&!pdvActif){if((info.ca2025||0)>0)d.perdus12_24++;else d.inactifs++;}
    else{d.actifsLeg++;totalActifsLeg++;}
    if(pdvActif){d.actifsPDV++;totalActifsPDV++;}
    d.caPDVZone+=(info.caPDVN||0);
  }
  const pctCapte=filteredClients>0?Math.round(totalActifsPDV/filteredClients*100):0;
  const pctCapteLeg=filteredClients>0?Math.round(totalActifsLeg/filteredClients*100):0;
  // Clients hors zone : acheteurs PDV absents de la chalandise
  let _horsZoneCount=0,_horsZoneCA=0;
  if(_S.ventesClientArticle?.size){for(const[cc,artMap]of _S.ventesClientArticle){if(_S.chalandiseData?.has(cc))continue;_horsZoneCount++;for(const d of artMap.values())_horsZoneCA+=(d.sumCA||0);}}
  const filterActive=_S._selectedDepts.size||_S._selectedClassifs.size||_S._selectedStatuts.size||_S._selectedActivitesPDV.size||_S._selectedDirections.size||_S._selectedUnivers.size||_S._selectedCommercial||_S._selectedMetier||_S._filterStrategiqueOnly;
  // ── Badges groupes sidebar Terrain ──
  {const _nGeo=(_S._selectedDepts.size||0)+((_S._distanceMaxKm>0)?1:0)+((_S._includePerdu24m)?1:0);
  const _bgG=document.getElementById('fgBadgeGeo');if(_bgG){_bgG.textContent=_nGeo;_bgG.classList.toggle('hidden',_nGeo===0);}
  const _nAct=(_S._selectedActivitesPDV.size||0)+((_S._selectedStatutDetaille)?1:0)+(_S._selectedStatuts.size||0)+(_S._selectedClassifs.size||0);
  const _bgA=document.getElementById('fgBadgeTerritoire');if(_bgA){_bgA.textContent=_nAct;_bgA.classList.toggle('hidden',_nAct===0);}
  const _nOrg=((_S._selectedMetier)?1:0)+((_S._selectedCommercial)?1:0)+(_S._selectedDirections.size||0)+(_S._selectedUnivers.size||0)+((_S._filterStrategiqueOnly)?1:0);
  const _bgO=document.getElementById('fgBadgeOrga');if(_bgO){_bgO.textContent=_nOrg;_bgO.classList.toggle('hidden',_nOrg===0);}}
  // ── terrSummaryBar — réactif aux filtres même sans terrChalandiseOverview ──
  {const bar=document.getElementById('terrSummaryBar');
  if(bar){
    const _canal=_S._globalCanal||'';
    const CANAL_LABELS={MAGASIN:'Magasin',INTERNET:'Internet',REPRESENTANT:'Représentant',DCS:'DCS'};
    const _ca_all=_S.canalAgence||{};
    let _ca,_nbBL,_sumVMB,_nbClients,_canalLabel;
    if(!_canal){
      _ca=Object.values(_ca_all).reduce((s,d)=>s+(d.ca||0),0);
      _nbBL=Object.values(_ca_all).reduce((s,d)=>s+(d.bl||0),0);
      _sumVMB=Object.values(_ca_all).reduce((s,d)=>s+(d.sumVMB||0),0);
      _nbClients=_S.clientLastOrderByCanal?.size||0;
      _canalLabel='Tous canaux';
    }else{
      const _d=_ca_all[_canal]||{};
      _ca=_d.ca||0;_nbBL=_d.bl||0;_sumVMB=_d.sumVMB||0;
      if(_canal==='MAGASIN'){
        _nbClients=_S.clientsMagasin?.size||0;
      }else{
        _nbClients=0;
        for(const[,cMap] of (_S.clientLastOrderByCanal||new Map())){if(cMap.has(_canal))_nbClients++;}
      }
      _canalLabel=CANAL_LABELS[_canal]||_canal;
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
    const _filterBadge=filterActive?`<div style="position:absolute;top:8px;right:12px;font-size:9px;background:rgba(234,179,8,0.2);color:#fde047;padding:2px 8px;border-radius:99px;font-weight:700;letter-spacing:.05em">FILTRÉ</div>`:'';
    bar.innerHTML=`<div style="position:relative;display:flex;align-items:stretch;overflow:hidden">
      ${_filterBadge}
      ${_tile('👥',filterActive?`<span style="color:#f87171">${filteredClients.toLocaleString('fr-FR')}</span><span style="font-size:13px;color:rgba(255,255,255,0.3)"> / ${totalClients.toLocaleString('fr-FR')}</span>`:filteredClients.toLocaleString('fr-FR'),'Clients zone',_canalLabel,'#e2e8f0')}
      ${_tile('📊',pctCapteLeg+'%','Captés Leg.',`${totalActifsLeg.toLocaleString('fr-FR')} / ${filteredClients.toLocaleString('fr-FR')}`,'#93c5fd')}
      ${_tile('🏪',pctCapte+'%','Captés PDV',`${totalActifsPDV.toLocaleString('fr-FR')} / ${filteredClients.toLocaleString('fr-FR')}`,'#4ade80')}
      ${(()=>{const _hz=_S._clientView==='horszone';const _hzBg=_hz?'background:rgba(251,146,60,0.18);border-right:1px solid rgba(251,146,60,0.4);':'border-right:1px solid rgba(255,255,255,0.07);';return`<div onclick="window._toggleHorsZone()" style="display:flex;flex-direction:column;align-items:center;padding:10px 18px;${_hzBg}min-width:100px;cursor:pointer;transition:background .15s" title="Cliquer pour filtrer sur les clients hors zone de chalandise">
        <span style="font-size:11px;color:${_hz?'#fb923c':'rgba(255,255,255,0.4)'};margin-bottom:2px;letter-spacing:.04em;text-transform:uppercase">⚠️ Hors zone</span>
        <span style="font-size:22px;font-weight:900;line-height:1.1;color:${_hz?'#fb923c':'#fcd34d'}">${_horsZoneCount.toLocaleString('fr-FR')}</span>
        ${_horsZoneCA>0?`<span style="font-size:10px;color:${_hz?'rgba(251,146,60,0.7)':'rgba(255,255,255,0.35)'};margin-top:1px">${formatEuro(_horsZoneCA)} CA PDV</span>`:''}
      </div>`;})()}
      ${_exclusBadge}
    </div>`;
    bar.style.cssText='display:block;position:sticky;top:0;z-index:10;background:linear-gradient(135deg,rgba(15,23,42,0.97),rgba(30,27,75,0.95));border:1px solid rgba(139,92,246,0.3);border-radius:14px;margin-bottom:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.35),0 0 0 1px rgba(139,92,246,0.08)';
    bar.classList.remove('hidden');
  }}
  // Vue direction cascade — toujours mise à jour avant le return terrChalandiseOverview
  {const _dc=document.getElementById('terrDirectionContainer');if(_dc)_buildChalDirBlock(_dc);}
  // terrChalandiseOverview — table seulement si dans le DOM
  const blk=document.getElementById('terrChalandiseOverview');
  if(!blk)return;
  blk.classList.remove('hidden');
  _buildDeptFilter();
  // Fixed thead — columns NEVER change
  const colSpan=9;
  const headEl=document.getElementById('terrOverviewL1Head');
  if(headEl){
    headEl.innerHTML=`<tr><th class="py-1.5 px-2 text-left">Direction</th><th class="py-1.5 px-2 text-center">Total</th><th class="py-1.5 px-2 text-center">Actifs Leg.</th><th class="py-1.5 px-2 text-center">Actifs PDV</th><th class="py-1.5 px-2 text-center">Prospects</th><th class="py-1.5 px-2 text-center">Perdus 12-24m</th><th class="py-1.5 px-2 text-center">Inactifs</th><th class="py-1.5 px-2 text-center min-w-[100px]">% capté Leg.</th><th class="py-1.5 px-2 text-center min-w-[100px]">% capté PDV</th></tr>`;
  }
  const _nbDirs=Object.keys(dirMap).length;const _sl=document.getElementById('terrOverviewSummaryLine');if(_sl)_sl.textContent=`${_nbDirs} direction${_nbDirs>1?'s':''} · ${totalActifsPDV.toLocaleString('fr-FR')} actifs PDV · ${pctCapte}% capté`;
  // Sort by % capté ascending (opportunities first)
  let dirsArr=Object.values(dirMap).filter(d=>d.total>0);
  dirsArr.sort((a,b)=>b.actifsLeg-a.actifsLeg||b.total-a.total);
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
  // [Feature B] Vue par commercial
  _renderCommercialSummary();
  _renderOmniSegmentClients();
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
    const pdvActif=!!_S.clientsMagasin?.has(cc);
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
    const pdvActif=!!_S.clientsMagasin?.has(cc);
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
    const pdvActif=!!_S.clientsMagasin?.has(cc);
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
  const hasTerr=_hasTerritoire();
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

function _setPDVCanalFilter(val){
  _S.pdvCanalFilter=(val==='tous'||val==='all'||!val)?null:val;
  _buildDegradedCockpit();
  window._renderPDVTab?.();
}

function _buildDegradedCockpit(){
  const el=document.getElementById('terrDegradedBlock');if(!el)return;
  if(!DataStore.finalData.length && !_S.ventesClientArticle.size)return;
  _populateTerrFamilleFilter();
  const qClient=_S._terrClientSearch||'';
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
  const silEl=document.getElementById('terrSilencieux');
  const perduEl=document.getElementById('terrPerdus');
  const capEl=document.getElementById('terrACapter');
  if(!_S.chalandiseReady){
    // Mode dégradé — pas de chalandise, utiliser clientLastOrder directement
    if(!_S.clientLastOrder?.size){if(silEl)silEl.innerHTML='';if(perduEl)perduEl.innerHTML='';if(capEl)capEl.innerHTML='';return;}
    const _todayDeg=new Date();
    const silDeg=[],perduDeg=[];
    for(const[cc,lastOrder]of _S.clientLastOrder.entries()){
      const artMap=_S.ventesClientArticle?.get(cc);
      const caPDVN=artMap?[...artMap.values()].reduce((s,d)=>s+(d.sumCA||0),0):0;
      if(!caPDVN)continue;
      const daysSince=Math.round((_todayDeg-lastOrder)/86400000);
      const nom=_S.clientNomLookup?.[cc]||cc;
      const c={code:cc,nom,metier:'',commercial:'',classification:'',ca2025:0,caPDVN,ville:'',_strat:false,_daysSince:daysSince,_lastOrderDate:lastOrder};
      if(daysSince>30&&daysSince<=60)silDeg.push(c);
      else if(daysSince>60)perduDeg.push(c);
    }
    silDeg.sort((a,b)=>(b.caPDVN||0)-(a.caPDVN||0));
    perduDeg.sort((a,b)=>(a._daysSince||0)-(b._daysSince||0)||(b.caPDVN||0)-(a.caPDVN||0));
    _S._cockpitExportData={silencieux:silDeg,perdus:perduDeg,jamaisVenus:[]};
    const emptyMsgDeg='Aucun client dans cette catégorie';
    function _clientCardDeg(c,reason,scoreColor){const lastOrderFmt=c._lastOrderDate?`Dernière commande : ${fmtDate(c._lastOrderDate)}`:'';const daysBadge=c._daysSince>30?`<span style="font-size:var(--fs-2xs);font-weight:700;padding:2px 6px;border-radius:9999px;background:rgba(248,113,113,0.12);color:var(--c-danger)">⏰ ${c._daysSince}j</span>`:'';const caMag=c.caPDVN>0?formatEuro(c.caPDVN):'—';return`<div class="rounded-lg border s-card hover:i-info-bg cursor-pointer" style="padding:10px var(--sp-3,12px);border-bottom:1px solid var(--b-light)" data-cc="${escapeHtml(c.code)}" onclick="openClient360(this.dataset.cc,'cockpit')"><div class="flex items-center justify-between gap-2"><span style="font-size:var(--fs-base);font-weight:600;color:var(--t-primary)">${escapeHtml(c.nom)}</span>${daysBadge}</div><div class="flex items-center gap-3 mt-1"><span style="font-size:var(--fs-sm);font-weight:700;color:var(--c-ok)">${caMag}</span>${lastOrderFmt?`<span style="font-size:var(--fs-xs);color:var(--t-disabled)">${lastOrderFmt}</span>`:''}</div></div>`;}
    const _GDEG={amber:{bg:'background:linear-gradient(135deg,rgba(217,119,6,0.13),rgba(180,83,9,0.06))',hdr:'background:linear-gradient(135deg,rgba(217,119,6,0.2),rgba(180,83,9,0.12))',border:'border:1px solid rgba(217,119,6,0.3)',color:'#fbbf24',badgeBg:'rgba(217,119,6,0.7)'},rouge:{bg:'background:linear-gradient(135deg,rgba(220,38,38,0.13),rgba(185,28,28,0.06))',hdr:'background:linear-gradient(135deg,rgba(220,38,38,0.2),rgba(185,28,28,0.12))',border:'border:1px solid rgba(220,38,38,0.3)',color:'#f87171',badgeBg:'rgba(220,38,38,0.7)'}};
    function renderBlockDeg(title,emoji,gradKey,scoreColor,clients,raisonFn){const g=_GDEG[gradKey]||_GDEG.amber;if(!clients.length)return`<div style="${g.bg};${g.border};border-radius:14px;overflow:hidden;margin-bottom:12px"><div style="${g.hdr};padding:14px 20px;display:flex;align-items:center;gap:8px"><span class="text-lg">${emoji}</span><h4 style="font-weight:800;font-size:13px;color:${g.color}">${title}</h4><span style="font-size:10px;padding:2px 8px;border-radius:9999px;background:rgba(255,255,255,0.12);color:rgba(255,255,255,0.5)">0</span></div><p class="text-xs t-disabled px-4 pb-4 pt-3">${emptyMsgDeg}</p></div>`;let html=`<div style="${g.bg};${g.border};border-radius:14px;overflow:hidden;margin-bottom:12px"><div style="${g.hdr};padding:14px 20px;display:flex;align-items:center;gap:8px"><span class="text-lg">${emoji}</span><h4 style="font-weight:800;font-size:13px;color:${g.color}">${title}</h4><span style="font-size:11px;font-weight:700;padding:2px 8px;border-radius:9999px;background:${g.badgeBg};color:white">${clients.length}</span></div><div class="space-y-2 px-4 py-3">`;for(const c of clients.slice(0,10))html+=_clientCardDeg(c,raisonFn(c),scoreColor);html+=`</div></div>`;return html;}
    if(silEl)silEl.innerHTML=renderBlockDeg(`Silencieux — 30 à 60 jours sans commande Magasin`,'⏰','amber','c-caution',silDeg,c=>`${c._daysSince}j sans commande — ${formatEuro(c.caPDVN)} CA Magasin`);
    if(perduEl)perduEl.innerHTML=renderBlockDeg(`Perdus — Plus de 60 jours sans commande Magasin`,'🔴','rouge','c-danger',perduDeg,c=>`${c._daysSince}j sans commande — ${formatEuro(c.caPDVN)} CA historique`);
    if(capEl)capEl.innerHTML='';
    return;
  }
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
  const _tcsCK=(_S._terrClientSearch||'').toLowerCase();const _mCK=cc=>!_tcsCK||(cc||'').includes(_tcsCK)||(_S.clientNomLookup?.[cc]||_S.chalandiseData?.get(cc)?.nom||'').toLowerCase().includes(_tcsCK);
  for(const[cc,info] of _S.chalandiseData.entries()){
    if(!_clientPassesFilters(info,cc))continue;
    if(!_S._includePerdu24m&&_isPerdu24plus(info))continue;
    if(!_passesClientCrossFilter(cc))continue;
    if(_S.excludedClients.has(cc))continue;
    if(_cockpitComSet&&!_cockpitComSet.has(cc))continue;
    if(!_passesAllFilters(cc))continue;
    if(!_mCK(cc))continue;
    // CA MAG = ventesClientArticle (MAGASIN, prélevé) — chiffre visible sur la fiche client
    const _magArtData=_S.ventesClientArticle?.get(cc);
    const caMagR=_magArtData?[..._magArtData.values()].reduce((s,d)=>s+(d.sumCA||0),0):0;
    const caPDVN=caMagR;
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
    // 3. Potentiels : dans crossingStats.potentiels (zone chalandise, jamais venus au comptoir)
    if(!_useByCanal&&_S.crossingStats?.potentiels?.has(cc)){jamaisVenus.push(c);}
  }
  silencieux.sort((a,b)=>(b._daysSince||0)-(a._daysSince||0)||(b.ca2025||0)-(a.ca2025||0));
  perdus.sort((a,b)=>(a._daysSince||0)-(b._daysSince||0)||(b.ca2025||0)-(a.ca2025||0));
  jamaisVenus.sort((a,b)=>(b.ca2025||0)-(a.ca2025||0));
  _S._cockpitExportData={silencieux,perdus,jamaisVenus};
  // ── Helpers ──
  const filterActive=_S._selectedDepts.size||_S._selectedClassifs.size||_S._selectedStatuts.size||_S._selectedActivitesPDV.size||_S._selectedDirections.size||_S._selectedUnivers.size||_S._selectedCommercial||_S._selectedMetier||_S._filterStrategiqueOnly;
  const emptyMsg=filterActive?'Aucun client ne correspond aux filtres':'Aucun client dans cette catégorie';
  function _clientCard(c,reason,scoreColor){
    const lastOrderFmt=c._lastOrderDate?`Dernière commande : ${fmtDate(c._lastOrderDate)}`:'';
    const daysBadge=c._daysSince>30?`<span style="font-size:var(--fs-2xs);font-weight:700;padding:2px 6px;border-radius:9999px;background:rgba(248,113,113,0.12);color:var(--c-danger)">⏰ ${c._daysSince}j</span>`:'';
    const caMagFmt=c.caPDVN>0?`${formatEuro(c.caPDVN)} MAG`:'—';
    const caLegFmt=c.ca2025>0?`<span style="font-size:var(--fs-xs);font-weight:600;color:var(--c-caution)">${formatEuro(c.ca2025)} Legallais</span>`:'';
    const meta=[c.commercial?`<span style="font-size:var(--fs-xs);color:var(--t-disabled)">${escapeHtml(c.commercial)}</span>`:'',lastOrderFmt?`<span style="font-size:var(--fs-xs);color:var(--t-disabled)">${lastOrderFmt}</span>`:''].filter(Boolean).join('<span style="color:var(--b-default);margin:0 4px">·</span>');
    return`<div class="rounded-lg border s-card hover:i-info-bg cursor-pointer" style="padding:10px var(--sp-3,12px);border-bottom:1px solid var(--b-light)" data-cc="${escapeHtml(c.code)}" onclick="openClient360(this.dataset.cc,'cockpit')"><div class="flex items-center justify-between gap-2"><span style="font-size:var(--fs-base);font-weight:600;color:var(--t-primary)">${escapeHtml(c.nom)}</span>${daysBadge}</div><div class="flex items-center gap-3 mt-1 flex-wrap"><span style="font-size:var(--fs-sm);font-weight:700;color:var(--c-ok)">${caMagFmt}</span>${caLegFmt}${meta?`<span>${meta}</span>`:''}</div></div>`;
  }
  function _fullTable(clients,caField,listId){
    let t=`<div id="${listId}" style="display:none" class="mt-3 overflow-x-auto"><table class="min-w-full text-[11px]"><thead class="sticky top-0 s-card/90 font-bold t-secondary text-[10px]"><tr><th class="py-1.5 px-2 text-left">Client</th><th class="py-1.5 px-2 text-left">Commercial</th><th class="py-1.5 px-2 text-right">CA MAG</th><th class="py-1.5 px-2 text-right">CA Legallais</th><th class="py-1.5 px-2 text-left">Ville</th></tr></thead><tbody>`;
    for(const c of clients){t+=`<tr class="border-t b-default hover:s-card/50 cursor-pointer" data-cc="${escapeHtml(c.code)}" onclick="openClient360(this.dataset.cc,'cockpit')"><td class="py-1 px-2"><span class="font-mono t-disabled text-[10px]">${escapeHtml(c.code)}</span> <span class="font-semibold">${escapeHtml(c.nom)}</span>${c._strat?' <span class="c-caution text-[10px]" title="Métier stratégique">⭐</span>':''}</td><td class="py-1 px-2 text-[10px] t-tertiary">${c.commercial?escapeHtml(c.commercial):'—'}</td><td class="py-1 px-2 text-right font-bold c-ok">${c.caPDVN>0?formatEuro(c.caPDVN):'—'}</td><td class="py-1 px-2 text-right font-bold c-caution">${c.ca2025>0?formatEuro(c.ca2025):'—'}</td><td class="py-1 px-2 text-[10px] t-tertiary">${c.ville?escapeHtml(c.ville):'—'}</td></tr>`;}
    t+=`</tbody></table></div>`;return t;
  }
  // gradSpec : {bg, hdr, border, color, badgeBg}
  const _GRAD={
    amber:{bg:'background:linear-gradient(135deg,rgba(217,119,6,0.13),rgba(180,83,9,0.06))',hdr:'background:linear-gradient(135deg,rgba(217,119,6,0.2),rgba(180,83,9,0.12))',border:'border:1px solid rgba(217,119,6,0.3);border-bottom:1px solid rgba(217,119,6,0.2)',color:'#fbbf24',badgeBg:'rgba(217,119,6,0.7)'},
    rouge:{bg:'background:linear-gradient(135deg,rgba(220,38,38,0.13),rgba(185,28,28,0.06))',hdr:'background:linear-gradient(135deg,rgba(220,38,38,0.2),rgba(185,28,28,0.12))',border:'border:1px solid rgba(220,38,38,0.3);border-bottom:1px solid rgba(220,38,38,0.2)',color:'#f87171',badgeBg:'rgba(220,38,38,0.7)'},
    blue:{bg:'background:linear-gradient(135deg,rgba(59,130,246,0.13),rgba(37,99,235,0.06))',hdr:'background:linear-gradient(135deg,rgba(59,130,246,0.2),rgba(37,99,235,0.12))',border:'border:1px solid rgba(59,130,246,0.3);border-bottom:1px solid rgba(59,130,246,0.2)',color:'#60a5fa',badgeBg:'rgba(59,130,246,0.7)'},
  };
  function renderBlock(title,emoji,gradKey,_unused,scoreColor,clients,caField,raisonFn,listId,topN=10){
    const g=_GRAD[gradKey]||_GRAD.blue;
    const total=clients.length;
    const arrow='▼';
    if(!total)return`<div style="${g.bg};${g.border};border-radius:14px;overflow:hidden;margin-bottom:12px"><div style="${g.hdr};padding:14px 20px;display:flex;align-items:center;gap:8px;cursor:pointer" class="select-none" onclick="_cockpitToggleSection('${listId}')"><span id="${listId}-arrow" style="font-size:10px;color:rgba(255,255,255,0.4);width:12px">${arrow}</span><span class="text-lg">${emoji}</span><h4 style="font-weight:800;font-size:13px;color:${g.color}">${title}</h4><span style="font-size:10px;font-weight:600;padding:2px 8px;border-radius:9999px;background:rgba(255,255,255,0.12);color:rgba(255,255,255,0.5)">0</span></div><div id="${listId}-body"><p class="text-xs t-disabled px-4 pb-4 pt-3">${emptyMsg}</p></div></div>`;
    let html=`<div style="${g.bg};${g.border};border-radius:14px;overflow:hidden;margin-bottom:12px">`;
    html+=`<div style="${g.hdr};padding:14px 20px;display:flex;align-items:center;gap:8px;flex-wrap:wrap;cursor:pointer" class="select-none" onclick="_cockpitToggleSection('${listId}')"><span id="${listId}-arrow" style="font-size:10px;color:rgba(255,255,255,0.4);width:12px">${arrow}</span><span class="text-lg">${emoji}</span><h4 style="font-weight:800;font-size:13px;color:${g.color}">${title}</h4><span style="font-size:11px;font-weight:700;padding:2px 8px;border-radius:9999px;background:${g.badgeBg};color:white">${total}</span><button onclick="event.stopPropagation();exportCockpitCSV('${listId}')" class="ml-auto text-[10px] s-hover t-primary py-1 px-2 rounded font-bold border">📥 CSV</button></div>`;
    html+=`<div id="${listId}-body">`;
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
    const parts=[];if(c.caPDVN>0)parts.push(formatEuro(c.caPDVN)+' MAG');if(c.ca2025>0)parts.push(formatEuro(c.ca2025)+' Legallais');
    const caStr=parts.length?parts.join(' · '):'—';
    return c._daysSince>45?`Silencieux depuis ${c._daysSince}j — à relancer rapidement (${caStr})`:`${c._daysSince}j sans commande — à surveiller (${caStr})`;
  }
  function _perduRaison(c){const parts=[];if(c.caPDVN>0)parts.push(formatEuro(c.caPDVN)+' MAG');if(c.ca2025>0)parts.push(formatEuro(c.ca2025)+' Legallais');return`${c._daysSince}j sans commande ${_canalLabel} — ${parts.length?parts.join(' · '):'ancien client à reconquérir'}`;}
  function _capRaison(c){return c.ca2025>0?`CA Legallais ${formatEuro(c.ca2025)} — jamais passé au comptoir`:`Client zone — jamais passé au comptoir`;}
  // ── Render into 3 separate blocks ──
  const _silTitle=`Silencieux — 30 à 60 jours sans commande ${_canalLabel}`;
  const _perduTitle=`Perdus — Plus de 60 jours sans commande ${_canalLabel}`;
  if(silEl)silEl.innerHTML=renderBlock(_silTitle,'⏰','amber','','c-caution',silencieux,'ca2025',_silRaison,'cockpit-sil-full');
  if(perduEl)perduEl.innerHTML=renderBlock(_perduTitle,'🔴','rouge','','c-danger',perdus,'ca2025',_perduRaison,'cockpit-perdu-full');
  if(capEl){if(_useByCanal){capEl.innerHTML='';}else{capEl.innerHTML=renderBlock('Potentiels — Jamais venus au comptoir','🎯','blue','','c-action',jamaisVenus,'ca2025',_capRaison,'cockpit-cap-full');}}
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
  const map={'cockpit-sil-full':['Silencieux',_S._cockpitExportData.silencieux],'cockpit-perdu-full':['Perdus',_S._cockpitExportData.perdus],'cockpit-cap-full':['Potentiels',_S._cockpitExportData.jamaisVenus]};
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
  const catMap={'cockpit-sil-full':['Silencieux',_S._cockpitExportData.silencieux],'cockpit-perdu-full':['Perdus',_S._cockpitExportData.perdus],'cockpit-cap-full':['Potentiels',_S._cockpitExportData.jamaisVenus]};
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
  _onDistanceSlider,
  _onTerrClientSearch,
  _onMetierFilter,
  _navigateToOverviewMetier,
  _togglePerdu24m,
  _buildOverviewFilterChips,
  _renderCommercialSummary,
  _renderOmniSegmentClients,
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

// ── Orchestrateur principal Commerce 5 sous-vues ─────────────────────────
function renderCommerceTab() {
  // Garder la sous-vue active si déjà dans Commerce, sinon démarrer sur silencieux
  const keepTab = document.getElementById('cm-tab-nav') ? _cmTab : 'silencieux';
  _cmTab = keepTab;
  // Sidebar : chips canal toujours visibles sur Commerce, terrFamilleFilter masqué
  document.getElementById('globalCanalFilter')?.classList.remove('hidden');
  document.getElementById('terrFamilleFilter')?.classList.add('hidden');
  const counts = _cmComputeCounts();
  const el = document.getElementById('tabCommerce');
  if (!el) return;
  el.innerHTML = `
    <div id="terrSummaryBar" class="s-card rounded-xl border shadow-sm px-4 py-3 mb-3" style="position:sticky;top:0;z-index:10;background:var(--s-card,#fff);display:none"></div>
    <div class="flex gap-1 border-b b-default mb-0 overflow-x-auto" id="cm-tab-nav">${_cmRenderNav(counts)}</div>
    <div id="cm-tab-content" class="pt-3"></div>
    <div id="terrOmniBlock" class="mt-4">
      <div id="terrChalandiseOverview" class="hidden mb-3"><details class="s-card rounded-xl shadow-md border overflow-hidden"><summary class="px-2 py-1.5 border-b s-card-alt select-none flex items-center justify-between cursor-pointer hover:brightness-95"><h3 class="font-extrabold t-primary text-xs">🎯 Votre territoire en un coup d'oeil</h3><div class="flex items-center gap-2"><span id="terrOverviewSummaryLine" class="text-[10px] t-tertiary font-normal"></span><span class="acc-arrow t-disabled">▶</span></div></summary><div class="overflow-x-auto"><table class="min-w-full text-xs"><thead id="terrOverviewL1Head" class="s-panel-inner t-inverse"></thead><tbody id="terrOverviewL1Table"></tbody></table></div></details></div>
    </div>`;
  _buildChalandiseOverview();
  window.renderOmniContent?.();
  renderTerritoireTab();
}

// ── Window expositions ──────────────────────────────────────────────────
window.renderTerritoireTab        = renderTerritoireTab;
window._renderPDVTab              = renderMesClients;
window.renderCommerceTab          = renderCommerceTab;
window._cmSwitchTab               = _cmSwitchTab;
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
window._onCommercialFilter        = _onCommercialFilter;
window._onDistanceSlider          = _onDistanceSlider;
window._onTerrClientSearch        = _onTerrClientSearch;
window._onMetierFilter            = _onMetierFilter;
window._navigateToOverviewMetier  = _navigateToOverviewMetier;
window._togglePerdu24m            = _togglePerdu24m;
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
window._renderCommercialSummary   = _renderCommercialSummary;
window._renderOmniSegmentClients  = _renderOmniSegmentClients;
window._buildChalDirBlock         = _buildChalDirBlock;
window._buildChalandiseOverview   = _buildChalandiseOverview;
window._buildDegradedCockpit      = _buildDegradedCockpit;
window._buildCockpitClient        = _buildCockpitClient;
window._renderOverviewL4          = _renderOverviewL4;
window.exportCockpitCSV           = exportCockpitCSV;
window.exportCockpitCSVAll        = exportCockpitCSVAll;
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
