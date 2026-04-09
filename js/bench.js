'use strict';

import { _S } from './state.js';
import { DataStore } from './store.js';
import { formatEuro, escapeHtml, matchQuery, famLib } from './utils.js';
import { csvCell } from './helpers.js';
import { showToast, switchTab, showCockpitInTable, closeFilterDrawer } from './ui.js';
import { computeReseauHeatmap, _clientStatusBadge, _unikLink } from './engine.js';
import { computeBenchmark } from './parser.js';
import { SECTEUR_DIR_MAP } from './constants.js';

let _pepAgTab = '';
let _renderedPepites = [];
let _pepSort = { col: 'caMe', dir: -1 };

function onBenchParamChange(){buildBenchCheckboxes();recalcBenchmarkInstant();}
function buildBenchCheckboxes(){
  const div=document.getElementById('benchPickCheckboxes');if(!div)return;
  const stores=[..._S.storesIntersection].sort().filter(s=>s!==_S.selectedMyStore);
  // Keep previous checked state if available
  const prevChecked=new Set();document.querySelectorAll('#benchPickCheckboxes input:checked').forEach(cb=>prevChecked.add(cb.value));
  const allWasEmpty=prevChecked.size===0;
  div.innerHTML=stores.map(s=>{const checked=allWasEmpty||prevChecked.has(s)?'checked':'';return `<label class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold cursor-pointer border transition-colors ${checked?'bench-pill-active':'s-hover t-tertiary b-default'} hover:opacity-80"><input type="checkbox" value="${s}" ${checked} onchange="this.closest('label').className=this.checked?'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold cursor-pointer border transition-colors bench-pill-active hover:opacity-80':'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold cursor-pointer border transition-colors s-hover t-tertiary b-default hover:opacity-80';recalcBenchmarkInstant()" class="w-3 h-3 accent-cyan-600">${s}</label>`;}).join('');
  buildObsCompareSelect();
}
function getBenchCompareStores(){
  // Always use checkboxes; fall back to all stores if none are checked yet (initial state)
  const checked=[];document.querySelectorAll('#benchPickCheckboxes input:checked').forEach(cb=>checked.push(cb.value));
  if(checked.length)return checked;
  return[..._S.storesIntersection].filter(s=>s!==_S.selectedMyStore);
}
function recalcBenchmarkInstant(){
  // Sync _S.selectedBenchBassin from checkboxes before recomputing
  const checked=[];document.querySelectorAll('#benchPickCheckboxes input:checked').forEach(cb=>checked.push(cb.value));
  const all=[..._S.storesIntersection].filter(s=>s!==_S.selectedMyStore);
  _S.selectedBenchBassin=checked.length===all.length?new Set():new Set(checked);
  _S._benchCache=null;
  const t0=performance.now();computeBenchmark(_S._globalCanal||null);renderBenchmark();const el=document.getElementById('benchRecalcTime');if(el)el.textContent=`⚡ ${Math.round(performance.now()-t0)}ms`;
}
function _refreshBenchEquation() {
  const bar = document.getElementById('benchEquationBar');
  if (!bar) return;
  const _ca_all = _S.canalAgence || {};
  const _canaux = _S._reseauCanaux || new Set();
  const _mode = _S._reseauMagasinMode || 'all';
  const _getCA = (d) => !d ? 0 : _mode === 'preleve' ? (d.caP || 0) : _mode === 'enleve' ? (d.caE || 0) : (d.ca || 0);
  const _getVMB = (d) => {
    if (!d) return 0;
    if (_mode === 'preleve') return d.sumVMBP || 0;
    if (_mode === 'enleve')  return Math.max(0, (d.sumVMB || 0) - (d.sumVMBP || 0));
    return d.sumVMB || 0;
  };
  const _LMAP = { MAGASIN: 'Magasin', INTERNET: 'Internet', REPRESENTANT: 'Représentant', DCS: 'DCS' };
  // Bornes période actuelles (filtre explicite prioritaire, sinon preset relatif)
  const _getPeriodBounds = () => {
    let _startIdx, _endIdx;
    if (_S.periodFilterStart || _S.periodFilterEnd) {
      const _ps = _S.periodFilterStart, _pe = _S.periodFilterEnd;
      _startIdx = _ps ? (_ps.getFullYear() * 12 + _ps.getMonth()) : -Infinity;
      _endIdx   = _pe ? (_pe.getFullYear() * 12 + _pe.getMonth()) : Infinity;
    } else {
      const _now = new Date();
      const _nowIdx = _now.getFullYear() * 12 + _now.getMonth();
      const _preset = _S._globalPeriodePreset || '12M';
      _startIdx = _preset === 'YTD' ? _now.getFullYear() * 12
                : _preset === '6M'  ? _nowIdx - 5
                :                     _nowIdx - 11;
      _endIdx = _nowIdx;
    }
    return { _startIdx, _endIdx };
  };
  // Compte les clients uniques sur la période, éventuellement restreint à un set de canaux
  const _countClientsByPeriode = (canauxFilter) => {
    // Cas canal-filtré : on a besoin de _byMonthClientsByCanal
    if (canauxFilter && canauxFilter.size > 0) {
      if (!_S._byMonthClientsByCanal) return null;
      const { _startIdx, _endIdx } = _getPeriodBounds();
      const _set = new Set();
      for (const midxStr in _S._byMonthClientsByCanal) {
        const midx = +midxStr;
        if (midx < _startIdx || midx > _endIdx) continue;
        const _cm = _S._byMonthClientsByCanal[midxStr];
        for (const _c of canauxFilter) {
          const _s = _cm[_c]; if (!_s) continue;
          for (const cc of _s) _set.add(cc);
        }
      }
      return _set.size;
    }
    // Cas tous-canaux
    if (!_S._byMonthClients) return null;
    const { _startIdx, _endIdx } = _getPeriodBounds();
    const _set = new Set();
    for (const midxStr in _S._byMonthClients) {
      const midx = +midxStr;
      if (midx < _startIdx || midx > _endIdx) continue;
      for (const cc of _S._byMonthClients[midxStr]) _set.add(cc);
    }
    return _set.size;
  };
  let _ca, _nbBL, _sumVMB, _nbClients, _canalLabel;
  if (_canaux.size === 0) {
    _ca = Object.values(_ca_all).reduce((s, d) => s + _getCA(d), 0);
    _nbBL = Object.values(_ca_all).reduce((s, d) => s + (d.bl || 0), 0);
    _sumVMB = Object.values(_ca_all).reduce((s, d) => s + _getVMB(d), 0);
    _nbClients = _countClientsByPeriode() ?? ((_S._clientsTousCanaux instanceof Set && _S._clientsTousCanaux.size > 0) ? _S._clientsTousCanaux.size : (_S.clientLastOrderByCanal?.size || 0));
    _canalLabel = 'Tous canaux';
  } else if (_canaux.size === 1) {
    const _canal = [..._canaux][0];
    const _d = _ca_all[_canal] || {};
    _ca = _getCA(_d);
    // BL par mode pour MAGASIN prel/enl
    if (_canal === 'MAGASIN' && _mode === 'preleve') _nbBL = _d.blP || _d.bl || 0;
    else if (_canal === 'MAGASIN' && _mode === 'enleve') _nbBL = _d.blE || _d.bl || 0;
    else _nbBL = _d.bl || 0;
    _sumVMB = _getVMB(_d);
    // Clients par mode pour MAGASIN prel/enl
    if (_canal === 'MAGASIN' && _mode === 'preleve') {
      _nbClients = _countClientsByPeriode(new Set(['MAGASIN_PREL']));
    } else if (_canal === 'MAGASIN' && _mode === 'enleve') {
      _nbClients = _countClientsByPeriode(new Set(['MAGASIN_ENL']));
    } else {
      _nbClients = _countClientsByPeriode(_canaux);
    }
    if (_nbClients == null) {
      _nbClients = _canal === 'MAGASIN' ? (_S.clientsMagasin?.size || 0) : 0;
      if (_canal !== 'MAGASIN') for (const [, cMap] of (_S.clientLastOrderByCanal || new Map())) { if (cMap.has(_canal)) _nbClients++; }
    }
    _canalLabel = _LMAP[_canal] || _canal;
  } else {
    _ca = 0; _nbBL = 0; _sumVMB = 0;
    for (const _c of _canaux) { const _d = _ca_all[_c] || {}; _ca += _getCA(_d); _nbBL += _d.bl || 0; _sumVMB += _getVMB(_d); }
    _nbClients = _countClientsByPeriode(_canaux) ?? (_S.clientLastOrderByCanal?.size || 0);
    _canalLabel = `${_canaux.size} canaux`;
  }
  if (!_ca) { bar.classList.add('hidden'); return; }
  const _caClient = _nbClients > 0 ? Math.round(_ca / _nbClients) : 0;
  const _freq = _nbClients > 0 ? (_nbBL / _nbClients).toFixed(1) : '—';
  const _txMarge = _ca > 0 ? (_sumVMB / _ca) * 100 : 0;
  const _vmc = _nbBL > 0 ? _ca / _nbBL : 0;
  const _dot = `<span class="text-white/40 text-xs">·</span>`;
  bar.innerHTML = `
    <span class="text-white/70 text-xs font-medium uppercase tracking-wide">${_canalLabel}</span>
    ${_dot}
    <span><strong class="text-white font-extrabold">${formatEuro(_ca)}</strong><span class="text-white/70 text-xs ml-1">CA</span></span>
    ${_dot}
    <span><strong class="text-white font-extrabold">${_nbClients.toLocaleString('fr-FR')}</strong><span class="text-white/70 text-xs ml-1">clients</span></span>
    ${_dot}
    <span><strong class="text-white font-extrabold">${_caClient > 0 ? formatEuro(_caClient) : '—'}</strong><span class="text-white/70 text-xs ml-1">/ client</span></span>
    ${_dot}
    <span><strong class="text-white font-extrabold">${_freq}x</strong><span class="text-white/70 text-xs ml-1">fréq.</span></span>
    ${_dot}
    <span><strong class="text-white font-extrabold">${_txMarge > 0 ? _txMarge.toFixed(1) + '%' : '—'}</strong><span class="text-white/70 text-xs ml-1">marge</span></span>
    ${_dot}
    <span><strong class="text-white font-extrabold">${_vmc > 0 ? formatEuro(Math.round(_vmc)) : '—'}</strong><span class="text-white/70 text-xs ml-1">VMC</span></span>`;
  bar.classList.remove('hidden');
}

function renderBenchmark(){
  // Libellé canal dynamique dans KPI Comparatifs (basé sur _reseauCanaux)
  {const _rl=_S._reseauCanaux||new Set();const _lEl=document.getElementById('benchKpiCanalLabel');if(_lEl){const _LMAP={MAGASIN:'MAGASIN',INTERNET:'Internet',REPRESENTANT:'Représentant',DCS:'DCS',AUTRE:'Autre'};if(_rl.size===0){_lEl.textContent='📡 Tous canaux';}else if(_rl.size===1){const _c=[..._rl][0];_lEl.textContent=`📡 Canal ${_LMAP[_c]||_c} uniquement`;}else{_lEl.textContent=`📡 ${_rl.size} canaux`;}}}
  // Nettoyer l'ancienne bannière d'avertissement période (fix Option 2 déployé)
  {const _oldBanner=document.getElementById('reseauPeriodWarnBanner');if(_oldBanner)_oldBanner.remove();}
  // [Adapter Étape 5] — DataStore.benchLists : canal-invariant via cache _benchCache
  const{missed,over,storePerf,familyPerf}=DataStore.benchLists;const cs=getBenchCompareStores().filter(s=>_S.storesIntersection.has(s));const q=(document.getElementById('benchSearch')?.value||'').trim();
  // Render observatory sections
  renderObservatoire();
const fl=l=>q?l.filter(x=>matchQuery(q,x.code,x.lib)):l;const fM=fl(missed),fO=fl(over),fU=fl(DataStore.benchLists.under||[]);
  // ── Famille filter partagé Sections A + B ────────────────────────────────
  const _famFilter=_S._reseauMissedFamFilter||'';
  const _famSel=document.getElementById('benchMissedFamFilter');
  if(_famSel){const _famSet=new Set([...fM,...fU].map(x=>_S.articleFamille?.[x.code]||''));let _opts='<option value="">Toutes familles</option>';for(const f of[..._famSet].filter(Boolean).sort())_opts+=`<option value="${f}"${f===_famFilter?' selected':''}>${famLib(f)}</option>`;_famSel.innerHTML=_opts;_famSel.value=_famFilter;}
  const fMFiltered=_famFilter?fM.filter(m=>(_S.articleFamille?.[m.code]||'')===_famFilter):fM;
  const fUFiltered=_famFilter?fU.filter(u=>(_S.articleFamille?.[u.code]||'')===_famFilter):fU;
  const _MISSED_PAGE=10;const _TOP5=5;
  const _mSortCol=_S._missedSortCol||'freq';const _mSortDir=_S._missedSortDir||'desc';
  const fMSorted=[...fMFiltered].sort((a,b)=>{const va=_mSortCol==='freq'?a.bassinFreq:_mSortCol==='agences'?a.sc:a.myStock;const vb=_mSortCol==='freq'?b.bassinFreq:_mSortCol==='agences'?b.sc:b.myStock;return _mSortDir==='desc'?vb-va:va-vb;});
  const _mShowAll=!!_S._reseauMissedShowAll;const _totalMissedPages=Math.max(1,Math.ceil(fMFiltered.length/_MISSED_PAGE));if((_S._reseauMissedPage||0)>=_totalMissedPages)_S._reseauMissedPage=0;const _curMissedPage=_S._reseauMissedPage||0;
  const fMPage=_mShowAll?fMSorted.slice(_curMissedPage*_MISSED_PAGE,(_curMissedPage+1)*_MISSED_PAGE):fMSorted.slice(0,_TOP5);
  const _countEl=document.getElementById('benchMissedCountLabel');if(_countEl)_countEl.textContent=fMFiltered.length?`${fMFiltered.length} article${fMFiltered.length>1?'s':''}`:'';
  const sB=(id,n)=>{const el=document.getElementById(id);if(el)el.textContent=n;};
  sB('badgeMissed',fM.length);sB('badgeOver',fO.length);sB('badgeStores',Object.keys(storePerf).length);
  // Update sort indicators
  ['freq','agences','stock'].forEach(c=>{const el=document.getElementById('missedSort'+c.charAt(0).toUpperCase()+c.slice(1));if(el)el.textContent=c===_mSortCol?(_mSortDir==='desc'?'↓':'↑'):'';});
  // Detail tables (elements removed from DOM — render only if still present)
  const rT=(id,html)=>{const e=document.getElementById(id);if(e)e.innerHTML=html;};
  let p=[];for(const m of fMPage){const dc=m.myStock>0?'c-ok':'c-danger';const di=m.myStock>0?'🟢':'🔴';const dt=m.myStock>0?'Visibilité?':'Référencer';const mLib=escapeHtml(m.lib||'');p.push(`<tr class="border-b hover:i-danger-bg"><td class="py-1.5 px-2"><span class="font-mono t-tertiary block text-[10px]">${m.code}</span><span class="text-[11px] font-semibold leading-tight" title="${mLib}">${mLib}</span></td><td class="py-1.5 px-2 text-center font-bold c-danger">${m.bassinFreq}</td><td class="py-1.5 px-2 text-center t-tertiary">${m.sc}/${m.nbCompare}</td><td class="py-1.5 px-2 text-right font-bold ${m.myStock>0?'c-ok':'c-danger'}">${m.myStock}</td><td class="py-1.5 px-2 text-center ${dc} text-[9px] font-bold">${di} ${dt}</td></tr>`);}
  if(!_mShowAll&&fMFiltered.length>_TOP5)p.push(`<tr><td colspan="5" class="text-center py-3"><button data-action="_reseauShowAll" data-section="missed" class="text-xs s-card border b-default rounded px-3 py-1.5 font-bold hover:s-hover t-secondary">Voir les ${fMFiltered.length} articles →</button></td></tr>`);
  else if(_mShowAll&&_totalMissedPages>1)p.push(`<tr><td colspan="5" class="text-center py-2"><div class="inline-flex items-center gap-2 text-xs"><button data-action="_reseauPage" data-section="missed" data-dir="-1" ${_curMissedPage===0?'disabled':''} class="px-2 py-1 s-card border b-default rounded hover:s-hover disabled:opacity-30 disabled:cursor-not-allowed">←</button><span class="t-secondary font-semibold">Page ${_curMissedPage+1} sur ${_totalMissedPages}</span><button data-action="_reseauPage" data-section="missed" data-dir="1" ${_curMissedPage>=_totalMissedPages-1?'disabled':''} class="px-2 py-1 s-card border b-default rounded hover:s-hover disabled:opacity-30 disabled:cursor-not-allowed">→</button></div></td></tr>`);
  rT('benchMissedTable',p.join('')||'<tr><td colspan="5" class="text-center py-4 t-disabled">🎉</td></tr>');
  p=[];for(const o of fO){const oLib=escapeHtml(o.lib||'');p.push(`<tr class="border-b hover:i-ok-bg"><td class="py-1.5 px-2"><span class="font-mono t-tertiary block text-[10px]">${o.code}</span><span class="text-[11px] font-semibold leading-tight" title="${oLib}">${oLib}</span></td><td class="py-1.5 px-2 text-center font-bold c-ok">${o.myQte}</td><td class="py-1.5 px-2 text-center t-secondary">${o.avg}</td><td class="py-1.5 px-2 text-right c-ok font-extrabold text-xs">${(o.ratio*100).toFixed(0)}%🚀</td></tr>`);}
  rT('benchOverTable',p.join('')||'<tr><td colspan="4" class="text-center py-4 t-disabled">—</td></tr>');
  // Section B : benchLists.under filtré par famille, top 5 par défaut, bouton voir tout paginé
  {const _UP=10;const _uShowAll=!!_S._reseauUnderShowAll;const _tUP=Math.max(1,Math.ceil(fUFiltered.length/_UP));if((_S._reseauUnderPage||0)>=_tUP)_S._reseauUnderPage=0;const _cUP=_S._reseauUnderPage||0;const fUPage=_uShowAll?fUFiltered.slice(_cUP*_UP,(_cUP+1)*_UP):fUFiltered.slice(0,5);let _uHtml='';if(!fUFiltered.length){_uHtml='<p class="t-disabled text-sm p-4">Aucun article sous-exploité détecté.</p>';}else{const _uRows=fUPage.map(o=>{const uLib=escapeHtml(o.lib||'');return`<tr class="border-b hover:i-caution-bg"><td class="py-1.5 px-2"><span class="font-mono t-tertiary block text-[10px]">${o.code}</span><span class="text-[11px] font-semibold leading-tight" title="${uLib}">${uLib}</span></td><td class="py-1.5 px-2 text-center font-bold c-caution">${o.myQte}</td><td class="py-1.5 px-2 text-center t-secondary">${o.avg}</td><td class="py-1.5 px-2 text-right c-caution font-bold text-xs">${(o.ratio*100).toFixed(0)}%</td></tr>`;}).join('');const _uFoot=!_uShowAll&&fUFiltered.length>5?`<div class="text-center py-3"><button data-action="_reseauShowAll" data-section="under" class="text-xs s-card border b-default rounded px-3 py-1.5 font-bold hover:s-hover t-secondary">Voir les ${fUFiltered.length} articles →</button></div>`:_uShowAll&&_tUP>1?`<div class="text-center mt-2"><div class="inline-flex items-center gap-2 text-xs"><button data-action="_reseauPage" data-section="under" data-dir="-1" ${_cUP===0?'disabled':''} class="px-2 py-1 s-card border b-default rounded hover:s-hover disabled:opacity-30 disabled:cursor-not-allowed">←</button><span class="t-secondary font-semibold">Page ${_cUP+1} sur ${_tUP}</span><button data-action="_reseauPage" data-section="under" data-dir="1" ${_cUP>=_tUP-1?'disabled':''} class="px-2 py-1 s-card border b-default rounded hover:s-hover disabled:opacity-30 disabled:cursor-not-allowed">→</button></div></div>`:'';_uHtml=`<p class="text-[11px] t-tertiary mb-2"><strong>${fUFiltered.length}</strong> article${fUFiltered.length>1?'s':''} vendus par le réseau, sous-exploités ici.</p><div class="overflow-x-auto"><table class="min-w-full text-xs"><thead class="s-panel-inner t-inverse"><tr><th class="py-1 px-2 text-left">Code / Libellé</th><th class="py-1 px-2 text-center">Moi (prél.)</th><th class="py-1 px-2 text-center">Moy réseau</th><th class="py-1 px-2 text-right">Ratio</th></tr></thead><tbody>${_uRows}</tbody></table></div>${_uFoot}`;}const _uEl=document.getElementById('reseauSousExploitesContainer');if(_uEl)_uEl.innerHTML=_uHtml;}
  // Store ranking [V3] — tri dynamique par _rankSortKey / _rankSortDir
  // Sync select UI avec l'état courant
  {const sel=document.getElementById('rankSortKey');if(sel&&sel.value!==(_S._rankSortKey||'ca'))sel.value=_S._rankSortKey||'ca';}
  const _rankKey=_S._rankSortKey||'ca';const _rankDir=_S._rankSortDir===-1||_S._rankSortDir===1?_S._rankSortDir:-1;
  const sorted=Object.entries(storePerf).sort((a,b)=>{const va=a[1][_rankKey]??0;const vb=b[1][_rankKey]??0;return _rankDir*(va-vb);});
  const totalStores=sorted.length;const myRankIdx=sorted.findIndex(([s])=>s===_S.selectedMyStore);
  const rankEl=document.getElementById('benchMyRank');if(rankEl){if(myRankIdx>=0){rankEl.textContent=`#${myRankIdx+1} sur ${totalStores}`;rankEl.classList.remove('hidden');}else rankEl.classList.add('hidden');}
  const inlineRank=document.getElementById('obsMyRankInline');if(inlineRank){if(myRankIdx>=0){inlineRank.textContent=`#${myRankIdx+1}/${totalStores}`;inlineRank.classList.remove('hidden');}else inlineRank.classList.add('hidden');}
  // Sync pills canal Réseau
  {const _rcSet=_S._reseauCanaux||new Set();const _isAll=_rcSet.size===0;document.querySelectorAll('[data-reseau-canal]').forEach(b=>b.classList.toggle('active',_rcSet.has(b.dataset.reseauCanal)));document.querySelectorAll('#reseauCanalBar .reseau-tous-btn').forEach(b=>b.classList.toggle('active',_isAll));}
  p=[];sorted.forEach(([store,data],idx)=>{
    const isMe=store===_S.selectedMyStore;
    const ag=_S.agenceStore?.get(store);
    const ca=ag?.ca||0;
    const tm=data.txMarge>0?data.txMarge.toFixed(1)+'%':'—';
    const tmColor=data.txMarge>0?(data.txMarge>=35?'c-ok':data.txMarge>=25?'c-caution':'c-danger'):'t-disabled';
    const freq=data.freq||0;
    const caCl=ag?.caClient||0;
    const refs=data.ref||0;
    const serv=data.serv||0;
    const servColor=serv>25?'c-ok':serv>=10?'c-caution':'c-danger';
    p.push(`<tr class="border-b ${isMe?'i-info-bg font-bold':'hover:s-card-alt'}">
      <td class="py-2 px-2"><span class="${isMe?'store-tag store-mine':'store-tag store-other'}">${isMe?'⭐':''}${store}</span></td>
      <td class="py-2 px-2 text-right text-xs ${isMe?'c-action font-extrabold':'font-bold'}">${formatEuro(ca)}</td>
      <td class="py-2 px-2 text-center text-[11px] font-bold ${tmColor}">${tm}</td>
      <td class="py-2 px-2 text-center font-bold">${freq.toLocaleString('fr')}</td>
      <td class="py-2 px-2 text-right text-xs font-bold">${formatEuro(caCl)}</td>
      <td class="py-2 px-2 text-center">${refs.toLocaleString('fr')}</td>
      <td class="py-2 px-2 text-center ${servColor} font-bold">${serv}%</td>
      <td class="py-2 px-2 text-center"><span class="text-[10px] font-bold ${isMe?'c-action':''}">#${idx+1}/${totalStores}</span></td>
    </tr>`);});
  rT('benchStoreTable',p.join(''));
  const rtEl=document.getElementById('benchRankingTitle');if(rtEl)rtEl.textContent=_S.obsFilterUnivers?`🏆 Classement agences — Univers : ${_S.obsFilterUnivers}`:'🏆 Classement agences';
  renderHeatmapFamilleCommercial();
  renderReseauHeatmap();
  _refreshBenchEquation();
}

// ── Bassin select : peuple <select multiple id="benchBassinSelect"> ───────
function buildBenchBassinSelect() {
  const sel = document.getElementById('benchBassinSelect');
  if (!sel) return;
  const stores = [..._S.storesIntersection].filter(s => s !== _S.selectedMyStore).sort();
  if (!stores.length) { sel.innerHTML = '<option disabled>Aucune autre agence</option>'; return; }
  let html = '';
  for (const s of stores) {
    const selected = _S.selectedBenchBassin.size === 0 || _S.selectedBenchBassin.has(s) ? 'selected' : '';
    html += `<option value="${escapeHtml(s)}" ${selected}>${escapeHtml(s)}</option>`;
  }
  sel.innerHTML = html;
}

// Appelé quand la sélection change
function onBenchBassinChange() {
  const sel = document.getElementById('benchBassinSelect');
  if (!sel) return;
  _S.selectedBenchBassin = new Set([...sel.selectedOptions].map(o => o.value));
  // Si tout est sélectionné = équivalent "vide" (fallback getBenchCompareStores)
  const all = [..._S.storesIntersection].filter(s => s !== _S.selectedMyStore);
  if (_S.selectedBenchBassin.size === all.length) _S.selectedBenchBassin = new Set();
  recalcBenchmarkInstant();
}

// ── Heatmap réseau : remplacé par onglets agences dans renderBenchmark ─────
function renderReseauPepites() {
  // Remplacé par onglets agences dans renderBenchmark
}

const renderReseauHeatmap = renderReseauPepites;

// ── Sprint 2 — Réseau : Nomades, Orphelins, Fuites ────────────────────────
function renderReseauNomades() {
  const el = document.getElementById('reseauNomadesContainer');
  if (!el) return;
  const list = _S.reseauNomades || [];
  if (!list.length) { el.innerHTML = '<p class="t-disabled text-sm p-4">Aucun nomade détecté (clients actifs dans ≥ 2 agences).</p>'; return; }
  let html = `<p class="text-[11px] t-tertiary mb-2">${list.length} client${list.length > 1 ? 's' : ''} actif${list.length > 1 ? 's' : ''} dans cette agence <strong>et dans ≥ 1 autre agence du réseau</strong>.</p>`;
  html += '<div class="overflow-x-auto"><table class="min-w-full text-xs"><thead class="s-panel-inner t-inverse"><tr><th class="py-1 px-2 text-left">Code</th><th class="py-1 px-2 text-left">Nom</th><th class="py-1 px-2 text-center">Statut</th></tr></thead><tbody>';
  for (const cc of list.slice(0, 100)) {
    const _rec = _S.clientStore?.get(cc);
    const nom = _rec?.nom || '—';
    const info = _rec || _S.chalandiseData.get(cc) || {};
    html += `<tr class="border-b b-light hover:i-info-bg"><td class="py-1 px-2 font-mono text-[10px]">${escapeHtml(cc)}</td><td class="py-1 px-2 font-semibold">${escapeHtml(nom)}${_unikLink(cc)}</td><td class="py-1 px-2 text-center">${_clientStatusBadge(cc, info)}</td></tr>`;
  }
  if (list.length > 100) html += `<tr><td colspan="3" class="py-2 px-2 text-center t-disabled text-[10px]">… et ${list.length - 100} autres</td></tr>`;
  html += '</tbody></table></div>';
  el.innerHTML = html;
}


function renderReseauFuites() {
  const el = document.getElementById('reseauFuitesContainer');
  if (!el) return;
  const list = _S.reseauFuitesMetier || [];
  if (!list.length) {
    if (!_S.chalandiseReady) { el.innerHTML = '<p class="t-disabled text-sm p-4">Chargez la Zone de Chalandise pour analyser les fuites par métier.</p>'; }
    else { el.innerHTML = '<p class="t-disabled text-sm p-4">Aucune fuite détectée (données insuffisantes).</p>'; }
    return;
  }
  let html = `<p class="text-[11px] t-tertiary mb-2">Indice de fuite = 1 − (clients actifs PDV / clients zone). Plus l'indice est élevé, plus le métier achète ailleurs.</p>`;
  html += '<div class="overflow-x-auto"><table class="min-w-full text-xs"><thead class="s-panel-inner t-inverse"><tr><th class="py-1 px-2 text-left">Métier</th><th class="py-1 px-2 text-center">Clients zone</th><th class="py-1 px-2 text-center">Actifs PDV</th><th class="py-1 px-2 text-center">Indice fuite</th></tr></thead><tbody>';
  for (const f of list) {
    const cls = f.indiceFuite >= 70 ? 'c-danger font-extrabold' : f.indiceFuite >= 40 ? 'c-caution font-bold' : 'c-ok';
    html += `<tr class="border-b b-light hover:i-danger-bg"><td class="py-1 px-2 font-semibold">${escapeHtml(f.metier)}</td><td class="py-1 px-2 text-center">${f.total}</td><td class="py-1 px-2 text-center">${f.actifs}</td><td class="py-1 px-2 text-center ${cls}">${f.indiceFuite}%</td></tr>`;
  }
  html += '</tbody></table></div>';
  el.innerHTML = html;
}

function renderNomadesMissedArts() {
  const el = document.getElementById('nomadesMissedArtsContainer');
  if (!el) return;
  const list = _S.nomadesMissedArts || [];
  const badge = document.getElementById('nomadesMissedBadge');
  if (badge) {
    if (list.length) { badge.textContent = list.length; badge.classList.remove('hidden'); }
    else badge.classList.add('hidden');
  }
  if (!list.length) {
    const isMulti = _S.storesIntersection && _S.storesIntersection.size > 1;
    el.innerHTML = `<p class="t-disabled text-sm p-4">${isMulti ? 'Aucune opportunité cross-agence significative détectée sur la période.' : 'Aucune donnée — nécessite un fichier multi-agences avec clients communs.'}</p>`;
    return;
  }
  let html = `<p class="text-[11px] t-tertiary mb-3 px-1">Top ${list.length} articles achetés par vos clients <strong>dans d'autres agences</strong> mais jamais chez vous — filtrés ≥ 150 € et ≥ 2 BL chez l'autre agence, triés par CA autre agence.</p>`;
  html += '<div class="overflow-x-auto"><table class="min-w-full text-xs"><thead class="s-panel-inner t-inverse font-bold sticky top-0"><tr>';
  html += '<th class="py-2 px-3 text-left">Code</th>';
  html += '<th class="py-2 px-3 text-left">Libellé</th>';
  html += '<th class="py-2 px-3 text-left">Famille</th>';
  html += '<th class="py-2 px-3 text-center">Clients</th>';
  html += '<th class="py-2 px-3 text-right">CA autre agence</th>';
  html += '<th class="py-2 px-3 text-right">BL autre agence</th>';
  html += '</tr></thead><tbody>';
  for (const art of list) {
    const lib = (_S.libelleLookup[art.code] || art.code).replace(/^\d{6} - /, '');
    html += `<tr class="border-b hover:i-caution-bg/40 cursor-pointer" onclick="openNomadeArticleModal('${art.code}')" title="Voir le détail clients">`;
    html += `<td class="py-1.5 px-3 font-mono t-tertiary whitespace-nowrap">${art.code}</td>`;
    html += `<td class="py-1.5 px-3 font-semibold t-primary">${escapeHtml(lib)}</td>`;
    html += `<td class="py-1.5 px-3 t-tertiary text-[11px]">${escapeHtml(art.fam || '—')}</td>`;
    html += `<td class="py-1.5 px-3 text-center font-extrabold c-danger">${art.nbClients}</td>`;
    html += `<td class="py-1.5 px-3 text-right font-bold c-caution">${art.totalCaOther > 0 ? formatEuro(art.totalCaOther) : '—'}</td>`;
    html += `<td class="py-1.5 px-3 text-right t-secondary">${art.totalBLOther || '—'}</td>`;
    html += '</tr>';
  }
  html += '</tbody></table></div>';
  el.innerHTML = html;
}

// C4: Heatmap Famille × Commercial
function renderHeatmapFamilleCommercial(){
  const container=document.getElementById('heatmapContainer');if(!container)return;
  if(!_S.chalandiseReady||!DataStore.ventesClientArticle.size){container.innerHTML='<p class="t-disabled text-sm p-4">Chargez la chalandise pour voir la heatmap.</p>';return;}
  const matrix={},famTotals={},comTotals={};const commercials=new Set();
  const clientComLookup={};
  for(const[cc,info]of _S.chalandiseData.entries()){if(info.commercial)clientComLookup[cc]=info.commercial;}
  if(_S.territoireReady){for(const l of DataStore.territoireLines){if(l.clientCode&&!clientComLookup[l.clientCode]&&l.secteur)clientComLookup[l.clientCode]=SECTEUR_DIR_MAP[l.secteur]||l.secteur;}}
  for(const[cc,artMap]of DataStore.ventesClientArticle.entries()){
    const com=clientComLookup[cc]||(_S.territoireReady?(DataStore.territoireLines.find(l=>l.clientCode===cc)?.commercial||null):null)||'⚠️ Sans commercial';
    commercials.add(com);if(!matrix[com])matrix[com]={};
    for(const[code,data]of artMap.entries()){
      const fam=famLib(_S.articleFamille[code]||(DataStore.finalData.find(d=>d.code===code)?.famille)||'')||'Non classé';const ca=data.sumCA||0;
      matrix[com][fam]=(matrix[com][fam]||0)+ca;
      famTotals[fam]=(famTotals[fam]||0)+ca;
      comTotals[com]=(comTotals[com]||0)+ca;
    }
  }
  const topFams=Object.entries(famTotals).filter(([fam])=>fam!=='Non classé').sort((a,b)=>b[1]-a[1]).slice(0,20).map(([fam])=>fam);
  const comList=[...commercials].sort((a,b)=>{if(a==='⚠️ Sans commercial')return 1;if(b==='⚠️ Sans commercial')return -1;return(comTotals[b]||0)-(comTotals[a]||0);});
  if(!comList.length||!topFams.length){container.innerHTML='<p class="t-disabled text-sm p-4">Pas assez de données pour la heatmap.</p>';return;}
  let maxCell=0;for(const com of comList)for(const fam of topFams){const v=(matrix[com]||{})[fam]||0;if(v>maxCell)maxCell=v;}
  let html='<div class="overflow-x-auto"><table class="min-w-full text-[10px]">';
  html+='<thead class="sticky top-0 s-panel-inner"><tr><th class="py-1 px-2 text-left t-inverse font-bold sticky left-0 s-panel-inner z-10">Famille</th>';
  for(const com of comList){html+=`<th class="py-1 px-2 text-center t-inverse-muted font-semibold" title="${com}" style="writing-mode:vertical-rl;text-orientation:mixed;white-space:nowrap;max-height:120px;overflow:hidden;padding:8px 4px">${com}</th>`;}
  html+='<th class="py-1 px-2 text-right t-inverse font-bold">Total</th></tr></thead><tbody>';
  for(const fam of topFams){
    html+=`<tr class="border-t b-dark"><td class="py-1 px-2 font-semibold t-primary sticky left-0 s-card z-10 truncate max-w-[160px]" title="${fam}">${fam}</td>`;
    for(const com of comList){const val=(matrix[com]||{})[fam]||0;const intensity=maxCell>0?val/maxCell:0;const bg=val===0?'transparent':`rgba(22,163,74,${(0.1+intensity*0.8).toFixed(2)})`;const textColor=intensity>0.5?'color:#fff':'';html+=`<td class="py-1 px-2 text-center font-bold" style="background:${bg};${textColor}" title="${com}: ${fam} = ${formatEuro(val)}">${val>0?formatEuro(val):'—'}</td>`;}
    html+=`<td class="py-1 px-2 text-right font-bold t-primary">${formatEuro(famTotals[fam])}</td></tr>`;
  }
  html+='<tr class="border-t-2 b-dark font-extrabold"><td class="py-1 px-2 sticky left-0 s-card z-10 t-primary">TOTAL</td>';
  for(const com of comList)html+=`<td class="py-1 px-2 text-center c-action">${formatEuro(comTotals[com]||0)}</td>`;
  html+=`<td class="py-1 px-2 text-right c-action">${formatEuro(Object.values(famTotals).reduce((s,v)=>s+v,0))}</td>`;
  html+='</tr></tbody></table></div>';
  container.innerHTML=html;
}

// === OBSERVATOIRE HELPERS ===
function _obsNav(t){
  if(t==='silencieux'){
    switchTab('commerce');
    setTimeout(()=>{
      const el=document.getElementById('cockpit-sil-full');
      if(el)el.scrollIntoView({behavior:'smooth'});
    },300);
    return;
  }
  if(t==='terrain'){switchTab('commerce');return;}
  if(t==='plan'){const d=document.getElementById('obsActionPlanDiv');if(d){const det=d.closest('details');if(det)det.open=true;d.scrollIntoView({behavior:'smooth'});}return;}
  if(t==='lose'){const d=document.getElementById('obsLoseTable');if(d){const det=d.closest('details');if(det)det.open=true;d.scrollIntoView({behavior:'smooth'});}return;}
  if(t==='dormants'){showCockpitInTable('dormants');switchTab('table');}
}

function generateNetworkDiagnostic(caE,refE,freqE){
  const caUp=caE>0,refUp=refE>0,freqUp=freqE>0;
  if(refUp&&!freqUp&&!caUp) return{icon:'🔍',title:'Assortiment large mais sous-exploité',border:'border-amber-400',bg:'i-caution-bg/60',
    message:`Vous avez ${Math.abs(refE)}% de références en plus que la médiane réseau, mais ${Math.abs(freqE)}% de fréquence en moins. Vos clients viennent moins souvent. Leviers : relancer les clients silencieux, animer le rayon, mettre en avant les articles peu vendus.`,
    actions:[{label:'Voir les clients silencieux dans Le Terrain',nav:'silencieux'},{label:'Vérifier les articles en stock jamais vendus',nav:'dormants'}]};
  if(!refUp&&freqUp) return{icon:'🎯',title:'Clients fidèles, gamme à élargir',border:'border-blue-400',bg:'i-info-bg/60',
    message:`Vos clients achètent ${Math.abs(freqE)}% plus souvent que la médiane, mais vous avez ${Math.abs(refE)}% de références en moins. Levier : référencer les articles vendus par le réseau.`,
    actions:[{label:'Voir les articles manquants du réseau',nav:'plan'}]};
  if(!caUp&&!refUp&&!freqUp) return{icon:'⚠️',title:"Agence en retrait — plan d'action prioritaire",border:'border-red-400',bg:'i-danger-bg',
    message:`CA, références et fréquence sont en dessous de la médiane réseau. Concentrez-vous sur les familles avec le plus grand écart de CA et sur la captation de nouveaux clients.`,
    actions:[{label:"Voir le plan d'action prioritaire",nav:'plan'},{label:'Voir les clients à capter dans Le Terrain',nav:'terrain'}]};
  if(caUp&&refUp&&freqUp) return{icon:'🏆',title:'Surperformance — consolidez vos forces',border:'border-emerald-400',bg:'i-ok-bg',
    message:`Votre agence dépasse la médiane sur tous les indicateurs. Surveillez les familles en baisse et fidélisez vos top clients.`,
    actions:[{label:'Voir les familles sous la médiane',nav:'lose'},{label:'Voir les clients à fidéliser',nav:'terrain'}]};
  if(caUp&&!freqUp) return{icon:'💰',title:'Bon CA mais fréquence en baisse',border:'border-yellow-400',bg:'i-caution-bg',
    message:`Votre CA est ${Math.abs(caE)}% au-dessus de la médiane mais la fréquence est en retrait de ${Math.abs(freqE)}%. Risque : dépendance à quelques gros clients. Levier : diversifier la base clients.`,
    actions:[{label:'Voir les clients silencieux',nav:'silencieux'}]};
  if(!caUp&&freqUp&&refUp) return{icon:'📊',title:'Bonne dynamique, CA à développer',border:'border-blue-400',bg:'i-info-bg/60',
    message:`Fréquence et références sont au-dessus de la médiane — vos fondamentaux sont bons. Le CA suivra en développant le panier moyen et en ciblant les familles à fort écart.`,
    actions:[{label:"Voir le plan d'action prioritaire",nav:'plan'}]};
  return{icon:'📋',title:'Analyse mixte',border:'b-default',bg:'s-card-alt',
    message:`Résultats contrastés vs médiane réseau. Consultez le plan d'action ci-dessous pour les familles prioritaires.`,
    actions:[{label:"Voir le plan d'action prioritaire",nav:'plan'}]};
}

function renderObservatoire(){
  // [Adapter Étape 5] — DataStore.benchLists : canal-invariant via cache _benchCache
  const{obsKpis,obsFamiliesLose,obsFamiliesWin,obsActionPlan}=DataStore.benchLists;
  const obsMode=_S.selectedObsCompare||'median';
  const obsLabel=obsMode==='median'?'Médiane réseau':obsMode;
  const isMedian=obsMode==='median';
  const el=id=>document.getElementById(id);
  if(el('obsMyStore'))el('obsMyStore').textContent=_S.selectedMyStore||'—';
  if(el('obsCompareLabel'))el('obsCompareLabel').textContent=obsLabel;
  if(el('obsKpiMyLabel'))el('obsKpiMyLabel').textContent=_S.selectedMyStore||'—';
  if(el('obsKpiCompLabel'))el('obsKpiCompLabel').textContent=obsLabel;
  // Dynamic section titles & column headers
  if(el('obsLoseTitle'))el('obsLoseTitle').textContent=isMedian?'📉 Familles sous la médiane réseau':`📉 Familles où ${obsLabel} me bat`;
  if(el('obsWinTitle'))el('obsWinTitle').textContent=isMedian?'💪 Familles au-dessus de la médiane':`💪 Familles où je bats ${obsLabel}`;
  if(el('obsLoseTh1'))el('obsLoseTh1').textContent=isMedian?'Écart CA (bassin) vs médiane':`CA ${obsLabel}`;
  if(el('obsWinTh1'))el('obsWinTh1').textContent=isMedian?'Avance CA (bassin) vs médiane':`Avance sur ${obsLabel}`;
  // KPI CARDS
  const kpis=obsKpis||{mine:{ca:0,ref:0,serv:0,freq:0,pdm:0},compared:{ca:0,ref:0,serv:0,freq:0,pdm:0}};
  const fmtVal=(v,fmt)=>fmt==='euro'?formatEuro(v):fmt==='pct2'?(v!==null&&v>0?parseFloat(v).toFixed(2)+'%':'—'):fmt==='pct'?v+'%':fmt==='freq'?(v+'x'):v.toLocaleString('fr');
  const _kpiRcSet=_S._reseauCanaux||new Set();
  const _kpiCanalNames={MAGASIN:'en prélevé comptoir',INTERNET:'sur Internet',REPRESENTANT:'par représentant',DCS:'en DCS',AUTRE:'sur autre canal'};
  const _refTip=_kpiRcSet.size===0?'Nombre d\'articles différents vendus au moins 1 fois sur la période.':_kpiRcSet.size===1?`Nombre d\'articles différents vendus au moins 1 fois ${_kpiCanalNames[[..._kpiRcSet][0]]||'sur le canal sélectionné'} sur la période.`:`Nombre d\'articles différents vendus au moins 1 fois sur les canaux sélectionnés sur la période.`;
  const kpiDefs=[
    {label:'💰 CA vendu',        key:'ca',          fmt:'euro', tip:'CA tous canaux (Prélevé + Enlevé) sur la période. Avoirs déduits.',                                                                                            g1:'#7c3aed',g2:'#4f46e5'},
    {label:'📈 Tx marge',        key:'txMarge',     fmt:'pct2', tip:'Taux de marge brute = VMB total ÷ CA total × 100. Indique la qualité du mix vendu.',                                                                           g1:'#dc2626',g2:'#b91c1c'},
    {label:'🛒 Qté / client',    key:'freqClient',  fmt:'freq', tip:'Nombre moyen de commandes (BL) par client actif. Mesure l\'intensité d\'achat par client.',                                                                    g1:'#059669',g2:'#047857'},
    {label:'💶 CA / client',     key:'caClient',    fmt:'euro', tip:'CA total ÷ nombre de clients actifs. Mesure la valeur moyenne générée par client.',                                                                             g1:'#0891b2',g2:'#0e7490'},
    {label:'🎯 Taux de service', key:'serv',        fmt:'pct',  tip:'% des articles vendus par le réseau que vous vendez aussi. 100% = vous couvrez toute la gamme réseau.',                                                        g1:'#d97706',g2:'#b45309'}
  ];
  const cardsHtml=kpiDefs.map(r=>{
    const me=kpis.mine[r.key]||0,comp=kpis.compared[r.key]||0;
    const isPctKpi=r.fmt==='pct'||r.fmt==='pct2';
    const ecartVal=isPctKpi
      ? parseFloat((me-comp).toFixed(1))
      : (comp>0?Math.round((me-comp)/comp*100):(me>0?100:0));
    const ecartLabel=isPctKpi?`${ecartVal>0?'+':''}${ecartVal} pts`:`${ecartVal>0?'+':''}${ecartVal}%`;
    const ecartIcon=ecartVal>=0?'🟢':ecartVal>=-10?'🟡':ecartVal>=-20?'🟠':'🔴';
    const ecartColor=ecartVal>=0?'#4ade80':ecartVal>=-20?'#fbbf24':'#f87171';
    const isLagging=ecartVal<0;
    const onclk=isLagging?`onclick="document.getElementById('benchUnderperformBanner')?.scrollIntoView({behavior:'smooth'})"` :'';
    const drillHint=isLagging?`<div style="font-size:10px;color:rgba(255,255,255,0.5);margin-top:2px">→ Familles en retard</div>`:'';
    return `<div style="background:linear-gradient(135deg,${r.g1},${r.g2});border-radius:14px;padding:16px 20px;min-width:160px;flex:1${isLagging?';cursor:pointer':''}" ${onclk}>
      <div style="color:rgba(255,255,255,0.75);font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;margin-bottom:4px">${r.label} <em class="info-tip" data-tip="${r.tip}" style="font-style:normal">ℹ</em></div>
      <div style="color:#fff;font-size:22px;font-weight:800;line-height:1.1">${fmtVal(me,r.fmt)}</div>
      <div style="color:rgba(255,255,255,0.6);font-size:11px;margin-top:2px">${fmtVal(comp,r.fmt)} · ${obsLabel}</div>
      <div style="margin-top:8px;font-size:12px;font-weight:700;color:${ecartColor}">${ecartIcon} ${ecartLabel}</div>
      ${drillHint}
    </div>`;
  }).join('');
  if(el('obsKpiCards'))el('obsKpiCards').innerHTML=cardsHtml;
  // Tooltip ℹ sur "KPI Comparatifs" — diagnostic réseau condensé
  const _tipEl=el('kpiDiagTip');
  if(_tipEl&&kpis){
    const _pct=(key)=>{const me=kpis.mine[key]||0,c=kpis.compared[key]||0;return c>0?Math.round((me-c)/c*100):(me>0?100:0);};
    const diag=generateNetworkDiagnostic(_pct('ca'),_pct('freqClient'),_pct('serv'));
    _tipEl.dataset.tip=`${diag.icon} ${diag.title} — ${diag.message}`;
  }
  const diagEl=el('obsNetworkDiag');if(diagEl)diagEl.innerHTML='';
  // Families where I lose — apply min CA filter
  const minCA=_S.obsFilterMinCA||0;
  const loseFiltered=(obsFamiliesLose||[]).filter(f=>!minCA||Math.abs(f.caOther-(f.caMe||0))>=minCA);
  const winFiltered=(obsFamiliesWin||[]).filter(f=>!minCA||Math.abs((f.caMe||0)-(f.caOther||0))>=minCA);
  if(el('obsLoseBadge'))el('obsLoseBadge').textContent=loseFiltered.length;
  const loseRows=loseFiltered.map((f,i)=>{
    const famId='obsLose_'+i;
    const caGap=f.caMe-f.caOther;
    const arts=f.missingArts||[];
    const artsToRef=arts.filter(a=>a.statutMe!=='✅ En stock');
    const artsVisi=arts.filter(a=>a.statutMe==='✅ En stock');
    const ecGapCell=`<span class="font-extrabold c-danger">${formatEuro(caGap)}</span>`;
    const trueMissing=artsToRef.length||Math.max(0,f.refOther-f.refMe);
    const refBadge=trueMissing>0?`<span class="chip chip-sm chip-danger">${trueMissing}</span>`:'<span class="t-disabled">—</span>';
    const ecText=f.caMe===0?'<span class="c-danger font-extrabold">Absent</span>':`<span class="${f.ecartPct<-30?'c-danger font-extrabold':f.ecartPct<-10?'c-caution font-bold':'t-primary'}">${f.ecartPct}%</span>`;
    const artFreqLabel=isMedian?'Nb agences':`Nb ventes (${obsLabel})`;
    const artCALabel=isMedian?'CA médiane réseau':`CA chez ${obsLabel}`;
    const artRow=a=>`<tr class="border-b" style="border-color:var(--b-light)"><td class="py-0.5 px-2 font-mono t-tertiary">${a.code}</td><td class="py-0.5 px-2">${a.lib}</td><td class="py-0.5 px-2 text-center font-bold">${isMedian?(a.nbStores??a.freqOther):a.freqOther}</td><td class="py-0.5 px-2 text-right t-secondary">${a.caOther>0?formatEuro(a.caOther):'—'}</td></tr>`;
    const artThead=`<thead class="t-secondary font-bold"><tr><th class="py-1 px-2 text-left">Code</th><th class="py-1 px-2 text-left">Libellé</th><th class="py-1 px-2 text-center">${artFreqLabel}</th><th class="py-1 px-2 text-right">${artCALabel}</th></tr></thead>`;
    const famAbsent=f.refMe===0;const list1Label=famAbsent?`📋 Articles vendus par le réseau dans cette famille (${artsToRef.length})`:`❌ ${artsToRef.length} article${artsToRef.length>1?'s':''} à référencer (non stockés)`;const list1Html=artsToRef.length?`<div class="mb-3" id="obsLose_${i}_arts"><p class="text-[10px] font-bold ${famAbsent?'c-action':'c-danger'} mb-1">${list1Label} :</p><table class="min-w-full text-[10px]">${artThead}<tbody>${artsToRef.slice(0,famAbsent?50:20).map(artRow).join('')}</tbody></table></div>`:'';
    const list2Html=artsVisi.length?`<div class="mb-2"><p class="text-[10px] font-bold c-caution mb-1">⚠️ ${artsVisi.length} article${artsVisi.length>1?'s':''} en stock non vendus — vérifier visibilité/emplacement :</p><table class="min-w-full text-[10px]">${artThead}<tbody>${artsVisi.slice(0,20).map(artRow).join('')}</tbody></table></div>`:'';
    const copyBtn=artsToRef.length?`<button onclick="event.stopPropagation();copyObsArticleList('obsLose_${i}_arts')" class="text-[9px] s-card border c-danger px-1.5 py-0.5 rounded hover:i-danger-bg font-bold" style="border-color:var(--c-danger);opacity:0.8">📋 Copier liste 1</button>`:'';
    const caAutreLabel=isMedian?'CA médiane réseau':`CA ${obsLabel}`;const refAutreLabel=isMedian?'Réf méd.':`Réf ${obsLabel}`;
    const detailGrid=`<div class="flex flex-wrap gap-4 text-[11px] mb-2 pt-2 px-3"><span class="t-tertiary">CA Moi : <strong class="c-action">${formatEuro(f.caMe)}</strong></span><span class="t-tertiary">${caAutreLabel} : <strong>${formatEuro(f.caOther)}</strong></span><span class="t-tertiary">Écart : ${ecText}</span><span class="t-tertiary">Réf Moi : <strong>${f.refMe}</strong></span><span class="t-tertiary">${refAutreLabel} : <strong>${f.refOther}</strong></span>${f.caTheorique!=null?`<span class="t-tertiary">CA Théo. : <strong>${formatEuro(f.caTheorique)}</strong></span><span class="t-tertiary">Écart théo. : <strong class="${f.ecartTheorique>=0?'c-ok':'c-danger'}">${f.ecartTheorique>=0?'+':''}${formatEuro(f.ecartTheorique)}</strong></span>`:''}</div>`;
    const ecBg=f.ecartPct<-30?'i-danger-bg/80':'i-caution-bg/70';
    const noArts=!artsToRef.length&&!artsVisi.length?'<p class="t-disabled text-[10px] py-2">Aucun article identifié.</p>':'';
    const specs=f.specialArts||[];const specCA=specs.reduce((s,a)=>s+a.caOther,0);
    const specEncart=specs.length?`<div class="mx-3 mt-3 p-2 s-hover rounded border b-default text-[10px] t-tertiary"><p class="font-bold t-secondary mb-1">⚠️ ${specs.length} article${specs.length>1?'s':''} spéciaux détectés chez ${obsLabel}${specCA>0?' (CA : '+formatEuro(specCA)+')':''}</p><p class="font-mono t-disabled text-[9px] mb-1">${specs.slice(0,15).map(a=>a.code).join(' · ')}</p><p class="italic t-disabled">Vérifiez si ces commandes spéciales sont récurrentes.</p></div>`:'';
    const _loseFamAttr=f.fam.replace(/&/g,'&amp;').replace(/"/g,'&quot;');
    const loseDiagBtn=`<button class="diag-btn i-danger-bg c-danger hover:i-danger-bg" data-fam="${_loseFamAttr}" onclick="event.stopPropagation();openDiagnostic(this.dataset.fam,'reseau')" title="Diagnostiquer cette famille">🔍 Diagnostiquer</button>`;
    const _losePdmCell=f.pdm!=null?`<td class="py-2 px-3 text-center text-xs font-bold ${f.pdm>=20?'c-ok':f.pdm>=10?'c-caution':'c-danger'}">${f.pdm}%</td>`:`<td class="py-2 px-3 text-center text-xs t-disabled">—</td>`;return `<tr class="border-b cursor-pointer hover:i-danger-bg/40 transition-colors" onclick="toggleObsFamily('${famId}')"><td class="py-2 px-3 font-semibold t-primary"><span class="obs-expand-icon t-disabled mr-1 text-[9px]">▶</span>${f.fam}</td><td class="py-2 px-3 text-right">${ecGapCell}</td>${_losePdmCell}<td class="py-2 px-3 text-center">${refBadge}</td></tr><tr id="${famId}" class="hidden ${ecBg}"><td colspan="4"><div class="pb-3">${detailGrid}<div class="px-3 mb-2 flex gap-2 flex-wrap">${copyBtn||''}${loseDiagBtn}</div>${`<div class="px-3 pb-1">${noArts}${list1Html}${list2Html}</div>`}${specEncart}</div></td></tr>`;
  }).join('');
  if(el('obsLoseTable'))el('obsLoseTable').innerHTML=loseRows||'<tr><td colspan="4" class="py-4 text-center t-disabled">🎉 Aucune famille où l\'autre vous dépasse.</td></tr>';
  // Families where I win
  if(el('obsWinBadge'))el('obsWinBadge').textContent=winFiltered.length;
  const winRows=winFiltered.map((f,i)=>{
    const winId='obsWin_'+i;
    const caAdv=f.caMe-f.caOther;
    const refAdv=Math.max(0,f.refMe-f.refOther);
    const advCell=`<span class="font-extrabold c-ok">+${formatEuro(caAdv)}</span>`;
    const refBadge=refAdv>0?`<span class="chip chip-sm chip-ok">+${refAdv}</span>`:'<span class="t-disabled">—</span>';
    const caAutreWin=isMedian?'CA médiane réseau':`CA ${obsLabel}`;const refAutreWin=isMedian?'Réf méd.':`Réf ${obsLabel}`;
    const detailGrid=`<div class="flex flex-wrap gap-4 text-[11px] pt-2 px-3 pb-3"><span class="t-tertiary">CA Moi : <strong class="c-action">${formatEuro(f.caMe)}</strong></span><span class="t-tertiary">${caAutreWin} : <strong>${formatEuro(f.caOther)}</strong></span><span class="t-tertiary">Écart : <strong class="c-ok">+${f.ecartPct}%</strong></span><span class="t-tertiary">Réf Moi : <strong class="c-action">${f.refMe}</strong></span><span class="t-tertiary">${refAutreWin} : <strong>${f.refOther}</strong></span>${f.caTheorique!=null?`<span class="t-tertiary">CA Théo. : <strong>${formatEuro(f.caTheorique)}</strong></span><span class="t-tertiary">Écart théo. : <strong class="${f.ecartTheorique>=0?'c-ok':'c-danger'}">${f.ecartTheorique>=0?'+':''}${formatEuro(f.ecartTheorique)}</strong></span>`:''}</div>`;
    const excl=f.exclusiveArts||[];
    const exclHtml=excl.length?`<div class="mb-3 px-3"><p class="text-[10px] font-bold c-ok mb-1">🏆 ${excl.length} article${excl.length>1?'s':''} exclusifs — vous les vendez, pas ${isMedian?'la médiane':obsLabel} :</p><table class="min-w-full text-[10px]"><thead class="t-secondary font-bold"><tr><th class="py-1 px-2 text-left">Code</th><th class="py-1 px-2 text-left">Libellé</th><th class="py-1 px-2 text-center">Fréq</th><th class="py-1 px-2 text-right">CA</th></tr></thead><tbody>${excl.slice(0,20).map(a=>`<tr class="border-b b-light"><td class="py-0.5 px-2 font-mono t-tertiary">${a.code}</td><td class="py-0.5 px-2">${a.lib}</td><td class="py-0.5 px-2 text-center font-bold">${a.freq}</td><td class="py-0.5 px-2 text-right font-bold c-ok">${formatEuro(a.ca)}</td></tr>`).join('')}</tbody></table></div>`:'';
    const noArts=!excl.length?'<p class="t-disabled text-[10px] py-2">Aucun article exclusif identifié.</p>':'';
    const _winPdmCell=f.pdm!=null?`<td class="py-2 px-3 text-center text-xs font-bold ${f.pdm>=20?'c-ok':f.pdm>=10?'c-caution':'c-danger'}">${f.pdm}%</td>`:`<td class="py-2 px-3 text-center text-xs t-disabled">—</td>`;return `<tr class="border-b cursor-pointer hover:i-ok-bg/40 transition-colors" onclick="toggleObsFamily('${winId}')"><td class="py-2 px-3 font-semibold t-primary"><span class="obs-expand-icon t-disabled mr-1 text-[9px]">▶</span>${f.fam}</td><td class="py-2 px-3 text-right">${advCell}</td>${_winPdmCell}<td class="py-2 px-3 text-center">${refBadge}</td></tr><tr id="${winId}" class="hidden i-ok-bg/70"><td colspan="4"><div class="pb-3">${detailGrid}${exclHtml}<div class="px-3 pb-1">${noArts}</div></div></td></tr>`;
  }).join('');
  if(el('obsWinTable'))el('obsWinTable').innerHTML=winRows||'<tr><td colspan="4" class="py-4 text-center t-disabled">—</td></tr>';
  // [V3] Bandeau biais canal — sections soft : pépites filtrées agence vs réseau brut
  const _obsCanal=_S._globalCanal||'';
  const biasBanner=el('benchCanalBias');
  if(biasBanner){if(_obsCanal){const lb=el('benchCanalBiasLabel');if(lb)lb.textContent=_obsCanal;biasBanner.classList.remove('hidden');}else biasBanner.classList.add('hidden');}
  // 💎 Pépites — onglets agences (multi) ou mon agence seule
  const myAg2 = _S.selectedMyStore || '';
  const isMulti = _S.storesIntersection?.size > 1;
  // Initialiser/valider l'onglet sélectionné
  if (!_pepAgTab || !_S.storesIntersection?.has(_pepAgTab)) _pepAgTab = myAg2;
  // Injecter les pills agences
  const tabsEl = el('pepitesAgTabs');
  if (tabsEl) {
    if (isMulti) {
      const agList = [myAg2, ...[..._S.storesIntersection].filter(a=>a!==myAg2).sort()];
      tabsEl.innerHTML = agList.map(ag=>
        `<button onclick="window._setPepAgTab('${ag}')" class="px-3 py-1 text-xs font-semibold rounded-full border transition-colors ${ag===_pepAgTab?'c-ok border-green-500 bg-green-900/30':'t-disabled b-dark hover:t-primary'}">${ag}${ag===myAg2?' ★':''}</button>`
      ).join('');
      tabsEl.classList.remove('hidden');
    } else {
      tabsEl.classList.add('hidden');
    }
  }
  // Helpers locaux
  const _libOf = code => { const r = _S.libelleLookup[code]||code; return /^\d{6} - /.test(r)?r.substring(9).trim():r; };
  const _famOf = code => famLib(_S.articleFamille[code])||'—';
  const _med = arr => { if(!arr.length)return 0; const s=[...arr].sort((a,b)=>a-b),m=Math.floor(s.length/2); return s.length%2?s[m]:(s[m-1]+s[m])/2; };
  const _curAg = _pepAgTab || myAg2;
  // ── Source période-filtrée : agenceStore.artMap (déjà construit) ──
  const _vpmSrc = store => _S.agenceStore?.get(store)?.artMap || _S.ventesParMagasin?.[store] || {};
  // Médiane réseau par article — excluant l'agence active
  const _netBL = {};
  const _otherAgs = [...(_S.storesIntersection || [])].filter(a => a !== _curAg);
  for (const ag of _otherAgs) {
    const artMap = _vpmSrc(ag);
    for (const [code, d] of Object.entries(artMap)) {
      if (!/^\d{6}$/.test(code)) continue;
      (_netBL[code]||(_netBL[code]=[])).push(d.countBL||0);
    }
  }
  // Construction pépites — fréquence BL (période-filtrée, fiable pour toutes agences)
  const agVpm = _vpmSrc(_curAg);
  const rawPep = [];
  for (const [code, vpmD] of Object.entries(agVpm)) {
    if (!/^\d{6}$/.test(code)) continue;
    const myFreq = vpmD.countBL || 0;
    if (myFreq < 2) continue;
    const medFreq = _med(_netBL[code]||[]);
    if (medFreq <= 0 || myFreq <= medFreq * 1.5) continue;
    if (_obsCanal && !_S.articleCanalCA.get(code)?.has(_obsCanal)) continue;
    const caMe     = Math.round(vpmD.sumCA || 0);
    const ecartPct = Math.round((myFreq / medFreq - 1) * 100);
    rawPep.push({ code, lib: _libOf(code), fam: _famOf(code), myFreq, compFreq: Math.round(medFreq), myQte: myFreq, compQte: Math.round(medFreq), ecartPct, caMe });
  }
  _renderedPepites = rawPep;
  const pepBadge=el('pepitesBadge');if(pepBadge){if(rawPep.length){pepBadge.textContent=rawPep.length;pepBadge.classList.remove('hidden');}else pepBadge.classList.add('hidden');}
  if(el('pepitesMeLabel'))el('pepitesMeLabel').textContent=`Fréq BL (${_curAg||'Moi'})`;
  if(el('pepitesCompLabel'))el('pepitesCompLabel').textContent='Fréq méd. réseau';
  if(el('pepitesCaLabel'))el('pepitesCaLabel').textContent=`CA (${_curAg||'Moi'})`;
  _renderPepitesRows();
  // 🔥 Pépites réseau
  const pepOther=_S.benchLists.pepitesOther||[];
  const pepOtherBadge=el('pepitesOtherBadge');if(pepOtherBadge){if(pepOther.length){pepOtherBadge.textContent=pepOther.length;pepOtherBadge.classList.remove('hidden');}else pepOtherBadge.classList.add('hidden');}
  if(el('pepitesOtherTitle'))el('pepitesOtherTitle').textContent=isMedian?'🔥 Pépites réseau — articles que le réseau vend mieux':`🔥 Pépites ${obsLabel} — articles où ${obsLabel} me surpasse`;
  if(el('pepitesOtherMeLabel'))el('pepitesOtherMeLabel').textContent=`Fréq Moi (${_S.selectedMyStore||'Moi'})`;
  if(el('pepitesOtherCompLabel'))el('pepitesOtherCompLabel').textContent=isMedian?'Fréq médiane réseau':`Fréq ${obsLabel}`;
  if(el('pepitesOtherCALabel'))el('pepitesOtherCALabel').textContent=isMedian?'CA médiane réseau':`CA ${obsLabel}`;
  // Pré-calcul clients zone par famille (si chalandise dispo)
  const _famCZ={};
  if(_S.chalandiseReady&&DataStore.ventesClientArticle.size){for(const[cc,artMap]of DataStore.ventesClientArticle.entries()){if(!_S.chalandiseData.has(cc))continue;const seen=new Set();for(const code of artMap.keys()){const f=_S.articleFamille[code];if(f&&!seen.has(f)){seen.add(f);_famCZ[f]=(_famCZ[f]||0)+1;}}}}
  const pepOtherRows=pepOther.map(p=>{
    const ecartStr=p.ecartPct!==null?`<span class="c-caution font-extrabold">+${p.ecartPct}%</span>`:'<span class="c-danger font-extrabold">Absent</span>';
    const myFreqStr=p.myFreq>0?`<span class="t-primary">${p.myFreq}</span>`:'<span class="c-danger font-semibold">0</span>';
    const czCount=_S.chalandiseReady?(_famCZ[p.fam]??0):null;
    const czCell=czCount===null?'<td class="py-1.5 px-3 text-center t-disabled">—</td>':`<td class="py-1.5 px-3 text-center text-xs font-bold ${czCount>0?'c-ok':'t-disabled'}">${czCount>0?czCount:'0'}</td>`;
    return`<tr class="border-b hover:i-caution-bg/40"><td class="py-1.5 px-3 font-mono t-tertiary whitespace-nowrap">${p.code}</td><td class="py-1.5 px-3 font-semibold t-primary">${p.lib}</td><td class="py-1.5 px-3 t-tertiary text-[11px]">${p.fam||'—'}</td><td class="py-1.5 px-3 text-center">${myFreqStr}</td><td class="py-1.5 px-3 text-center font-extrabold c-caution">${p.compFreq}</td><td class="py-1.5 px-3 text-center">${ecartStr}</td>${czCell}<td class="py-1.5 px-3 text-right t-secondary whitespace-nowrap">${p.caComp>0?formatEuro(p.caComp):'—'}</td></tr>`;
  }).join('');
  if(el('pepitesOtherTable'))el('pepitesOtherTable').innerHTML=pepOtherRows||'<tr><td colspan="8" class="py-4 text-center t-disabled italic">Aucune pépite réseau identifiée.</td></tr>';
}

function buildObsCompareSelect(){
  const sel=document.getElementById('obsCompareSelect');if(!sel)return;
  const current=_S.selectedObsCompare||'median';
  sel.innerHTML='<option value="median">📊 Médiane réseau</option>';
  [..._S.storesIntersection].sort().filter(s=>s!==_S.selectedMyStore).forEach(s=>{const o=document.createElement('option');o.value=s;o.textContent='🏪 '+s;if(s===current)o.selected=true;sel.appendChild(o);});
  if(current==='median')sel.value='median';
  _updateObsCheckboxVisibility();
}

function _updateObsCheckboxVisibility(){
  const isMedian=(_S.selectedObsCompare||'median')==='median';
  const pickDiv=document.getElementById('benchPickDiv');
  if(pickDiv)pickDiv.classList.toggle('hidden',!isMedian);
}

function onObsCompareChange(){
  _S.selectedObsCompare=document.getElementById('obsCompareSelect')?.value||'median';
  _updateObsCheckboxVisibility();
  const t0=performance.now();
  computeBenchmark(_S._globalCanal || null);renderBenchmark();
  document.getElementById('benchRecalcTime').textContent=`⚡ ${Math.round(performance.now()-t0)}ms`;
  closeFilterDrawer();
}

function onObsFilterChange(){
  _S.obsFilterUnivers=document.getElementById('obsFilterUnivers')?.value||'';
  _S.obsFilterMinCA=parseFloat(document.getElementById('obsMinCAInput')?.value||'0')||0;
  const t0=performance.now();computeBenchmark(_S._globalCanal || null);renderBenchmark();
  // Refresh top10 sans recalculer tout le DOM si panel déjà ouvert
  const activePill=document.querySelector('.pepite-pill.active');
  if(activePill&&_S._showReseauTop10)_S._showReseauTop10(activePill.dataset.ag);
  document.getElementById('benchRecalcTime').textContent=`⚡ ${Math.round(performance.now()-t0)}ms`;
}

function resetObsFilters(){
  _S.obsFilterUnivers='';_S.obsFilterMinCA=0;delete _S._artMedianCA;delete _S._artMedianBL;delete _S._artMedianQte;
  const u=document.getElementById('obsFilterUnivers');if(u)u.value='';
  const m=document.getElementById('obsMinCAInput');if(m)m.value='0';
  _buildObsUniversDropdown();
  _setBenchPeriode('12M');
  const t0=performance.now();computeBenchmark(_S._globalCanal || null);renderBenchmark();
  document.getElementById('benchRecalcTime').textContent=`⚡ ${Math.round(performance.now()-t0)}ms`;
  closeFilterDrawer();
}

// [V3] Filtre période réseau — active _getFilteredMonths via _S._globalPeriodePreset
function _setBenchPeriode(preset) {
  _S._globalPeriodePreset = preset;
  _S._benchCache = null; // invalider le cache (période dans la clé)
  delete _S._artMedianBL; delete _S._artMedianQte; delete _S._artMedianCA;
  const t0=performance.now();computeBenchmark(_S._globalCanal||null);renderBenchmark();
  const el=document.getElementById('benchRecalcTime');if(el)el.textContent=`⚡ ${Math.round(performance.now()-t0)}ms`;
}

function _buildObsUniversDropdown(){
  const sel=document.getElementById('obsFilterUnivers');if(!sel||sel.tagName!=='SELECT')return;
  const univs=new Set();
  for(const v of Object.values(_S.articleUnivers))if(v)univs.add(v);
  const cur=_S.obsFilterUnivers||'';
  sel.innerHTML='<option value="">🌐 Univers…</option>'+[...univs].sort().map(u=>`<option value="${u}"${u===cur?' selected':''}>${u}</option>`).join('');
}

function renderObsArticleSearch(){
  const q=(document.getElementById('obsArtSearch')?.value||'').trim();
  const res=document.getElementById('obsArtSearchResult');if(!res)return;
  if(!q){res.innerHTML='';return;}
  const{missed,over}=_S.benchLists;const rows=[];
  for(const m of(missed||[])){if(matchQuery(q,m.code,m.lib)){const s=m.myStock>0?'🟢 En stock':'🔴 Stock 0';rows.push(`<div class="flex flex-wrap items-center gap-2 p-2 border-b hover:i-danger-bg cursor-pointer" onclick="openArticlePanel('${m.code}','bench')"><span class="font-mono text-[10px] t-tertiary w-16 shrink-0">${m.code}</span><span class="flex-1 text-xs min-w-0">${m.lib}</span><span class="chip chip-sm chip-danger shrink-0">🚫 Manquée</span><span class="text-[10px] t-tertiary shrink-0">${m.sc}/${m.nbCompare} agences · ${m.bassinFreq} ventes · ${s}</span></div>`);}}
  for(const o of(over||[])){if(matchQuery(q,o.code,o.lib)){rows.push(`<div class="flex flex-wrap items-center gap-2 p-2 border-b hover:i-ok-bg cursor-pointer" onclick="openArticlePanel('${o.code}','bench')"><span class="font-mono text-[10px] t-tertiary w-16 shrink-0">${o.code}</span><span class="flex-1 text-xs min-w-0">${o.lib}</span><span class="chip chip-sm chip-ok shrink-0">🏆 Sur-perf</span><span class="text-[10px] t-tertiary shrink-0">Moi: ${o.myQte} · Méd: ${o.avg} · ${(o.ratio*100).toFixed(0)}%</span></div>`);}}
  if(!rows.length){
    const agenceData={};
    for(const[store,arts]of Object.entries(_S.ventesParMagasin||{})){
      for(const[code,data]of Object.entries(arts)){
        if(!matchQuery(q,code,_S.libelleLookup[code]||''))continue;
        if(!agenceData[code])agenceData[code]={lib:_S.libelleLookup[code]||code,agences:[]};
        agenceData[code].agences.push({store,countBL:data.countBL||0});
      }
    }
    for(const[code,d]of Object.entries(agenceData)){
      const myData=(_S.ventesParMagasin[_S.selectedMyStore]||{})[code];
      const myBL=myData?.countBL||0;
      const totalReseau=d.agences.reduce((s,a)=>s+a.countBL,0);
      const nbAgences=d.agences.filter(a=>a.countBL>0).length;
      const mediane=nbAgences>0?Math.round(totalReseau/nbAgences):0;
      const myStock=DataStore.finalData.find(r=>r.code===code)?.stockActuel??null;
      const stockBadge=myStock===null?'<span class="t-disabled text-[9px]">Non réf.</span>':myStock>0?`<span class="c-ok text-[9px] font-bold">${myStock} en stock</span>`:'<span class="c-danger text-[9px] font-bold">Rupture</span>';
      const ratio=mediane>0?Math.round(myBL/mediane*100):null;
      const perfBadge=ratio===null?'<span class="chip chip-xs chip-muted">Médiane 0</span>':ratio>=100?'<span class="chip chip-xs chip-ok">🏆 Sur-perf</span>':ratio>=50?'<span class="chip chip-xs chip-caution">📉 Sous-perf</span>':'<span class="chip chip-xs chip-danger">🚫 Faible</span>';
      rows.push(`<div class="flex flex-wrap items-center gap-2 p-2 border-b hover:s-card cursor-pointer" onclick="openArticlePanel('${code}','bench')"><span class="font-mono text-[10px] t-tertiary w-16 shrink-0">${code}</span><span class="flex-1 text-xs min-w-0">${d.lib}</span>${perfBadge}<span class="text-[10px] t-tertiary shrink-0">Moi: ${myBL} · Méd: ${mediane} · ${nbAgences} agences · ${stockBadge}</span></div>`);
    }
  }
  res.innerHTML=rows.length?`<div class="s-card border rounded-xl overflow-hidden shadow-sm mt-1">${rows.join('')}</div>`:'<p class="text-sm t-disabled mt-2 text-center py-2">Article inconnu du réseau — aucune vente dans les données chargées.</p>';
}

function copyObsActionPlan(){
  const plan=_S.benchLists.obsActionPlan||[];
  if(!plan.length){showToast('Aucun plan à copier','warning');return;}
  const obsLabel=(_S.selectedObsCompare||'median')==='median'?'Médiane réseau':_S.selectedObsCompare;
  const lines=[`Plan d'action Le Réseau — ${_S.selectedMyStore||'Moi'} vs ${obsLabel}`,''];
  plan.forEach((a,i)=>{
    const potLabel=a.caPotentiel>0?`${a.caPotentiel.toLocaleString('fr')}€`:'N/A';
    const txt=a.nbToRef>0
      ?`${i+1}. → Référencer ${a.nbToRef} article${a.nbToRef>1?'s':''} en ${a.fam} (potentiel ${potLabel})`
      :`${i+1}. → Améliorer la performance en ${a.fam} (écart ${a.ecartPct}% vs ${obsLabel})`;
    lines.push(txt);
  });
  navigator.clipboard?.writeText(lines.join('\n')).then(()=>showToast('📋 Plan copié dans le presse-papier','success')).catch(()=>showToast('❌ Erreur copie','error'));
}

function copyObsArticleList(containerId){
  const container=document.getElementById(containerId);if(!container)return;
  const rows=[...container.querySelectorAll('tbody tr')];
  if(!rows.length){showToast('Aucun article à copier','warning');return;}
  const lines=['Code\tLibellé\tFréq autre\tStatut chez moi'];
  for(const row of rows){const cells=[...row.querySelectorAll('td')].map(td=>td.textContent.trim());lines.push(cells.join('\t'));}
  navigator.clipboard?.writeText(lines.join('\n')).then(()=>showToast('📋 Liste copiée dans le presse-papier','success')).catch(()=>showToast('❌ Erreur copie','error'));
}

function toggleObsFamily(id){
  const row=document.getElementById(id);if(!row)return;
  const nowHidden=row.classList.toggle('hidden');
  const prevRow=row.previousElementSibling;if(!prevRow)return;
  const icon=prevRow.querySelector('.obs-expand-icon');if(icon)icon.textContent=nowHidden?'▶':'▼';
}

function copyObsSection(type){
  const rows=type==='lose'?_S.benchLists.obsFamiliesLose:_S.benchLists.obsFamiliesWin;
  if(!rows||!rows.length){showToast('Aucune donnée à copier','warning');return;}
  const lines=['Famille\tCA Moi\tCA Autre\tÉcart %\tRéf Moi\tRéf Autre'];
  for(const f of rows)lines.push(`${f.fam}\t${Math.round(f.caMe)}\t${Math.round(f.caOther)}\t${f.ecartPct}%\t${f.refMe}\t${f.refOther}`);
  navigator.clipboard?.writeText(lines.join('\n')).then(()=>showToast('📋 Copié dans le presse-papier','success')).catch(()=>showToast('❌ Erreur copie','error'));
}

function _buildPepitesRows() {
  const { col, dir } = _pepSort;
  const sorted = [..._renderedPepites].sort((a, b) => {
    const av = a[col] ?? 0;
    const bv = b[col] ?? 0;
    if (typeof av === 'string') return dir * av.localeCompare(bv);
    return dir * (av - bv);
  });
  // Indicateur de tri dans les en-têtes
  ['code','lib','fam','myQte','compQte','caMe'].forEach(c => {
    const thId = c === 'myQte' ? 'pepitesMeLabel' : c === 'compQte' ? 'pepitesCompLabel' : c === 'caMe' ? 'pepitesCaLabel' : `pepTh_${c}`;
    const th = document.getElementById(thId);
    if (!th) return;
    const base = th.textContent.replace(/ [▲▼]$/, '');
    th.textContent = base + (col === c ? (dir === -1 ? ' ▼' : ' ▲') : '');
  });
  return sorted.slice(0, 50).map(p =>
    `<tr class="border-b hover:i-caution-bg/40"><td class="py-1.5 px-3 font-mono t-tertiary whitespace-nowrap">${p.code}</td><td class="py-1.5 px-3 font-semibold t-primary">${p.lib}</td><td class="py-1.5 px-3 t-tertiary text-[11px]">${p.fam||'—'}</td><td class="py-1.5 px-3 text-center font-extrabold c-ok">${p.myQte}</td><td class="py-1.5 px-3 text-center t-tertiary">${p.compQte}</td><td class="py-1.5 px-3 text-right font-bold c-ok whitespace-nowrap">${p.caMe>0?formatEuro(p.caMe):'—'}</td></tr>`
  ).join('');
}

function _renderPepitesRows() {
  const tbody = document.getElementById('pepitesTable');
  if (tbody) tbody.innerHTML = _buildPepitesRows() || '<tr><td colspan="6" class="py-4 text-center t-disabled italic">Aucune pépite identifiée.</td></tr>';
}

window._pepSortBy = col => {
  if (_pepSort.col === col) _pepSort.dir *= -1;
  else { _pepSort.col = col; _pepSort.dir = -1; }
  _renderPepitesRows();
};

function copyPepitesList(){
  if(!_renderedPepites.length){showToast('Aucune pépite à copier','warning');return;}
  const agLabel=_pepAgTab||_S.selectedMyStore||'Moi';
  const lines=[`Code\tLibellé\tFamille\tQté vendue (${agLabel})\tQté médiane réseau\tCA`];
  for(const p of _renderedPepites)lines.push(`${p.code}\t${p.lib}\t${p.fam||'—'}\t${p.myQte??p.myFreq}\t${p.compQte??p.compFreq}\t${p.caMe||0}`);
  navigator.clipboard?.writeText(lines.join('\n')).then(()=>showToast(`📋 ${_renderedPepites.length} pépite${_renderedPepites.length>1?'s':''} copiée${_renderedPepites.length>1?'s':''} dans le presse-papier`,'success')).catch(()=>showToast('❌ Erreur copie','error'));
}

function copyPepitesOtherList(){
  const pepOther=_S.benchLists.pepitesOther||[];
  if(!pepOther.length){showToast('Aucune pépite réseau à copier','warning');return;}
  const obsMode=_S.selectedObsCompare||'median';const isMedian=obsMode==='median';
  const compLabel=isMedian?'Fréq médiane réseau':`Fréq ${obsMode}`;
  const caLabel=isMedian?'CA médiane réseau':`CA ${obsMode}`;
  const lines=[`Code\tLibellé\tFamille\tFréq Moi\t${compLabel}\tÉcart %\t${caLabel}`];
  for(const p of pepOther)lines.push(`${p.code}\t${p.lib}\t${p.fam}\t${p.myFreq}\t${p.compFreq}\t${p.ecartPct!==null?'+'+p.ecartPct+'%':'Absent'}\t${p.caComp}`);
  navigator.clipboard?.writeText(lines.join('\n')).then(()=>showToast(`📋 ${pepOther.length} pépite${pepOther.length>1?'s':''} réseau copiée${pepOther.length>1?'s':''} dans le presse-papier`,'success')).catch(()=>showToast('❌ Erreur copie','error'));
}

function openNomadeArticleModal(code) {
  const art = (_S.nomadesMissedArts || []).find(a => a.code === code);
  if (!art) return;
  const overlay = document.getElementById('nomadeArticleOverlay');
  const panel = document.getElementById('nomadeArticlePanel');
  if (!overlay || !panel) return;
  const lib = (_S.libelleLookup[code] || code).replace(/^\d{6} - /, '');
  const myStoreCA = (_S.ventesParMagasin[_S.selectedMyStore] || {})[code]?.sumCA || 0;
  const opportunite = Math.max(0, art.totalCaOther - myStoreCA);
  const caParClient = art.nbClients > 0 ? Math.round(art.totalCaOther / art.nbClients) : 0;
  const artInfo = DataStore.finalData.find(d => d.code === code);
  const stockHtml = artInfo
    ? `<span class="ml-2 text-[11px]" style="color:var(--t-secondary,#cbd5e1)">Stock : <strong>${artInfo.stockActuel ?? '—'}</strong>${artInfo.abcClass ? ` · <span style="color:var(--c-action)">${artInfo.abcClass}${artInfo.fmrClass || ''}</span>` : ''}</span>`
    : '';
  // Per-client rows
  let clientRows = '';
  for (const cc of art.clientCodes) {
    const nom = _S.clientStore?.get(cc)?.nom || cc;
    const caMe = _S.ventesClientArticle?.get(cc)?.get(code)?.sumCA || 0;
    clientRows += `<tr class="border-b b-light hover:i-caution-bg/30">
      <td class="py-1.5 px-3 font-mono text-[11px] whitespace-nowrap" style="color:var(--t-secondary,#94a3b8)">${cc}</td>
      <td class="py-1.5 px-3 text-[12px] font-semibold max-w-[200px] truncate" style="color:var(--t-primary,#fff)" title="${nom.replace(/"/g,'&quot;')}">${nom}</td>
      <td class="py-1.5 px-3 text-right font-bold c-caution whitespace-nowrap">${formatEuro(caParClient)}</td>
      <td class="py-1.5 px-3 text-right font-semibold whitespace-nowrap ${caMe > 0 ? 'c-ok' : ''}" style="${caMe <= 0 ? 'color:var(--t-secondary,#94a3b8)' : ''}">${caMe > 0 ? formatEuro(caMe) : '—'}</td>
      <td class="py-1.5 px-3 text-center"><button class="diag-btn text-[11px] py-0.5 px-2" onclick="closeNomadeArticleModal();openClient360('${cc}')" title="Fiche client 360°">📞</button></td>
    </tr>`;
  }
  panel.innerHTML = `
    <button class="absolute top-3 right-4 text-2xl hover:t-primary" style="color:var(--t-secondary,#94a3b8)" onclick="closeNomadeArticleModal()" title="Fermer">✕</button>
    <h2 class="text-base font-extrabold pr-8" style="color:var(--t-primary,#fff)">${lib}</h2>
    <p class="text-[11px] mb-4 flex items-center flex-wrap gap-1" style="color:var(--t-secondary,#94a3b8)"><span class="font-mono c-action">${code}</span> · ${art.fam || '—'}${stockHtml}</p>
    <div class="grid grid-cols-3 gap-3 mb-4">
      <div class="s-panel-inner rounded-lg p-3 text-center">
        <p class="text-[10px] mb-1" style="color:var(--t-secondary,#94a3b8)">💰 CA chez toi</p>
        <p class="text-base font-extrabold ${myStoreCA > 0 ? 'c-ok' : ''}" style="${myStoreCA <= 0 ? 'color:var(--t-secondary,#94a3b8)' : ''}">${myStoreCA > 0 ? formatEuro(myStoreCA) : '—'}</p>
      </div>
      <div class="s-panel-inner rounded-lg p-3 text-center">
        <p class="text-[10px] mb-1" style="color:var(--t-secondary,#94a3b8)">💸 CA chez les autres</p>
        <p class="text-base font-extrabold c-caution">${formatEuro(art.totalCaOther)} <span class="text-[10px] font-normal" style="color:var(--t-secondary,#94a3b8)">(${art.totalBLOther} BL)</span></p>
      </div>
      <div class="s-panel-inner rounded-lg p-3 text-center">
        <p class="text-[10px] mb-1" style="color:var(--t-secondary,#94a3b8)">🎯 Opportunité</p>
        <p class="text-base font-extrabold c-danger">${formatEuro(opportunite)}</p>
      </div>
    </div>
    <h3 class="text-sm font-bold mb-2" style="color:var(--t-primary,#fff)">👥 ${art.nbClients} client${art.nbClients > 1 ? 's' : ''} concerné${art.nbClients > 1 ? 's' : ''} <span class="text-[10px] font-normal" style="color:var(--t-secondary,#94a3b8)">(CA ailleurs estimé par client)</span></h3>
    <div class="overflow-x-auto mb-4">
      <table class="min-w-full text-xs">
        <thead class="s-panel-inner t-inverse font-bold">
          <tr>
            <th class="py-1.5 px-3 text-left">Code</th>
            <th class="py-1.5 px-3 text-left">Nom</th>
            <th class="py-1.5 px-3 text-right">CA ailleurs</th>
            <th class="py-1.5 px-3 text-right">CA chez moi</th>
            <th class="py-1.5 px-3 text-center"></th>
          </tr>
        </thead>
        <tbody>${clientRows}</tbody>
      </table>
    </div>
    <div class="flex gap-3 flex-wrap justify-end pt-3 border-t b-default">
      <button class="btn-secondary text-xs px-3 py-1.5" onclick="closeNomadeArticleModal();openDiagnostic('${art.fam?.replace(/'/g,"\\'") || ''}','reseau')">Diagnostic famille</button>
      <button class="btn-secondary text-xs px-3 py-1.5" onclick="_copyNomadeClientsClipboard('${code}')">Copier liste clients</button>
      <button class="btn-primary text-xs px-3 py-1.5" onclick="closeNomadeArticleModal()">Fermer</button>
    </div>`;
  const _namTrigger=document.activeElement;
  overlay.classList.add('active');
  overlay._cleanupFocusTrap=window.focusTrap?.(panel,_namTrigger);
}

function closeNomadeArticleModal() {
  const o=document.getElementById('nomadeArticleOverlay');if(o){o._cleanupFocusTrap?.();o.classList.remove('active');}
}

function _copyNomadeClientsClipboard(code) {
  const art = (_S.nomadesMissedArts || []).find(a => a.code === code);
  if (!art) return;
  const lines = ['Code client\tNom\tCA ailleurs (estimé)\tCA chez moi'];
  const caParClient = art.nbClients > 0 ? Math.round(art.totalCaOther / art.nbClients) : 0;
  for (const cc of art.clientCodes) {
    const nom = _S.clientStore?.get(cc)?.nom || cc;
    const caMe = _S.ventesClientArticle?.get(cc)?.get(code)?.sumCA || 0;
    lines.push(`${cc}\t${nom}\t${caParClient}\t${caMe}`);
  }
  navigator.clipboard?.writeText(lines.join('\n'))
    .then(() => showToast('📋 Clients copiés', 'success'))
    .catch(() => showToast('❌ Erreur copie', 'error'));
}

function copyNomadesMissedArts() {
  const list = _S.nomadesMissedArts || [];
  if (!list.length) { showToast('Aucune donnée à copier', 'warning'); return; }
  const lines = ['Code\tLibellé\tFamille\tClients concernés\tCA réseau estimé'];
  for (const art of list) {
    const lib = (_S.libelleLookup[art.code] || art.code).replace(/^\d{6} - /, '');
    lines.push(`${art.code}\t${lib}\t${art.fam}\t${art.nbClients}\t${art.caReseau}`);
  }
  navigator.clipboard?.writeText(lines.join('\n'))
    .then(() => showToast(`📋 ${list.length} articles copiés`, 'success'))
    .catch(() => showToast('❌ Erreur copie', 'error'));
}

function exportBenchList(type){const SEP=';';let h,rows;if(type==='missed'){h=['Code','Libelle','Freq','Mag','Stock','Diagnostic'];rows=_S.benchLists.missed.map(m=>[m.code,csvCell(m.lib),m.bassinFreq,m.sc+'/'+m.nbCompare,m.myStock,csvCell(m.diagnostic)]);}else if(type==='under'){h=['Code','Libelle','Moi','Moy','Ratio'];rows=(_S.benchLists.under||[]).map(u=>[u.code,csvCell(u.lib),u.myQte,u.avg,(u.ratio*100).toFixed(0)+'%']);}else{h=['Code','Libelle','Moi','Moy','Ratio'];rows=(_S.benchLists.over||[]).map(o=>[o.code,csvCell(o.lib),o.myQte,o.avg,(o.ratio*100).toFixed(0)+'%']);}const lines=['\uFEFF'+h.join(SEP),...rows.map(r=>r.join(SEP))];const blob=new Blob([lines.join('\n')],{type:'text/csv;charset=utf-8;'});const link=document.createElement('a');link.href=URL.createObjectURL(blob);link.download=`PRISME_Bench_${type}_${_S.selectedMyStore}_${new Date().toISOString().slice(0,10)}.csv`;document.body.appendChild(link);link.click();document.body.removeChild(link);URL.revokeObjectURL(link.href);}

// ── Exports ──────────────────────────────────────────────────────────────────
export {
  onBenchParamChange,
  buildBenchCheckboxes,
  getBenchCompareStores,
  recalcBenchmarkInstant,
  renderBenchmark,
  buildBenchBassinSelect,
  onBenchBassinChange,
  renderReseauPepites,
  renderReseauHeatmap,
  renderReseauNomades,

  renderReseauFuites,
  renderNomadesMissedArts,
  renderHeatmapFamilleCommercial,
  _obsNav,
  generateNetworkDiagnostic,
  renderObservatoire,
  buildObsCompareSelect,
  _updateObsCheckboxVisibility,
  onObsCompareChange,
  onObsFilterChange,
  resetObsFilters,
  _setBenchPeriode,
  _buildObsUniversDropdown,
  renderObsArticleSearch,
  copyObsActionPlan,
  copyObsArticleList,
  toggleObsFamily,
  copyObsSection,
  copyPepitesList,
  copyPepitesOtherList,
  openNomadeArticleModal,
  closeNomadeArticleModal,
  _copyNomadeClientsClipboard,
  copyNomadesMissedArts,
  exportBenchList,
};

// ── Window expositions ───────────────────────────────────────────────────────
window.renderBenchmark = renderBenchmark;
window._refreshBenchEquation = _refreshBenchEquation;
window.buildBenchBassinSelect = buildBenchBassinSelect;
window.renderReseauPepites = renderReseauPepites;
window.renderReseauHeatmap = renderReseauHeatmap;
window._setPepAgTab = function(ag) { _pepAgTab = ag; renderBenchmark(); };
window.renderReseauNomades = renderReseauNomades;

window.renderReseauFuites = renderReseauFuites;
window.renderNomadesMissedArts = renderNomadesMissedArts;
window.onObsCompareChange = onObsCompareChange;
window.onObsFilterChange = onObsFilterChange;
window.resetObsFilters = resetObsFilters;
window._setBenchPeriode = _setBenchPeriode;
window.renderObsArticleSearch = renderObsArticleSearch;
window.copyObsActionPlan = copyObsActionPlan;
window.copyObsArticleList = copyObsArticleList;
window.toggleObsFamily = toggleObsFamily;
window.copyObsSection = copyObsSection;
window.copyPepitesList = copyPepitesList;
window.copyPepitesOtherList = copyPepitesOtherList;
window.openNomadeArticleModal = openNomadeArticleModal;
window.closeNomadeArticleModal = closeNomadeArticleModal;
window._copyNomadeClientsClipboard = _copyNomadeClientsClipboard;
window.copyNomadesMissedArts = copyNomadesMissedArts;
window.exportBenchList = exportBenchList;
window.getBenchCompareStores = getBenchCompareStores;
window.renderHeatmapFamilleCommercial = renderHeatmapFamilleCommercial;
window._obsNav = _obsNav;
window.generateNetworkDiagnostic = generateNetworkDiagnostic;
window.onBenchParamChange = onBenchParamChange;
window.buildBenchCheckboxes = buildBenchCheckboxes;
window.recalcBenchmarkInstant = recalcBenchmarkInstant;
window.onBenchBassinChange = onBenchBassinChange;
