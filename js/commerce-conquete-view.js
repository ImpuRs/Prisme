'use strict';

import { _classifShort, _isMetierStrategique, escapeHtml, formatEuro } from './utils.js';
import { _clientStatusBadge, _crossBadge, _isGlobalActif, _isPerdu, _unikLink } from './engine.js';

function pctPair(row){
  const base=(row.total||0)-(row.prospects||0);
  return {
    pdv:base>0?Math.round((row.actifsPDV||0)/base*100):0,
    leg:base>0?Math.round((row.actifsLeg||0)/base*100):0
  };
}

function barColor(pct){
  return pct>=50?'bg-emerald-500':pct>=25?'bg-amber-500':'bg-red-500';
}

function capBar(pct,color,extraCls='font-bold w-8'){
  return `<div class="flex items-center gap-1"><div class="flex-1 s-hover rounded-full h-1.5"><div class="cap-bar ${color}" style="width:${pct}%"></div></div><span class="text-[10px] ${extraCls} text-right">${pct}%</span></div>`;
}

function statCell(v,cls){
  return `<td class="py-1.5 px-2 text-center ${v>0?cls:'t-disabled'}">${v||'—'}</td>`;
}

export function renderOverviewHead(axisLabel,captSub=''){
  return `<tr><th class="py-1.5 px-2 text-left">${axisLabel}</th><th class="py-1.5 px-2 text-center">Total</th><th class="py-1.5 px-2 text-center">Actifs Leg.</th><th class="py-1.5 px-2 text-center">Actifs PDV${captSub}</th><th class="py-1.5 px-2 text-center">Prospects</th><th class="py-1.5 px-2 text-center">Perdus 12-24m</th><th class="py-1.5 px-2 text-center">Inactifs</th><th class="py-1.5 px-2 text-center min-w-[100px]">% capté Leg.</th><th class="py-1.5 px-2 text-center min-w-[100px]">% capté PDV${captSub}</th></tr>`;
}

export function renderTerrainFocusCoach({axisLabel,worst,totalActifsPDV,totalActifsLeg,filteredClients,pctCapte,pctCapteLeg,canalLabel}) {
  if(!worst)return '';
  const base=(worst.total||0)-(worst.prospects||0);
  const pctLeg=base>0?Math.round((worst.actifsLeg||0)/base*100):0;
  const pctPDV=base>0?Math.round((worst.actifsPDV||0)/base*100):0;
  const gap=Math.max(0,(worst.actifsLeg||0)-(worst.actifsPDV||0));
  const accent=pctLeg<10?'#f87171':pctLeg<25?'#f59e0b':'#22d3ee';
  const lever=gap>0
    ? `${gap} client${gap>1?'s':''} déjà actif${gap>1?'s':''} Leg. à ramener au PDV`
    : `${worst.perdus12_24||0} perdu${(worst.perdus12_24||0)>1?'s':''} récent${(worst.perdus12_24||0)>1?'s':''} à travailler`;
  return `<div style="position:relative;overflow:hidden;border:1px solid rgba(96,165,250,0.28);background:linear-gradient(135deg,rgba(14,165,233,0.16),rgba(15,23,42,0.72) 52%,rgba(34,197,94,0.10));border-radius:16px;margin-bottom:12px;padding:14px 16px;box-shadow:0 16px 40px rgba(2,6,23,0.22)">
    <div style="position:absolute;right:-40px;top:-60px;width:180px;height:180px;border-radius:999px;background:${accent};opacity:.10;filter:blur(6px)"></div>
    <div style="display:flex;align-items:center;gap:14px;flex-wrap:wrap;position:relative">
      <div style="min-width:220px;flex:1">
        <div style="font-size:10px;text-transform:uppercase;letter-spacing:.14em;color:rgba(255,255,255,.45);font-weight:900">🎯 Priorité terrain</div>
        <div style="font-size:16px;font-weight:950;color:#e2e8f0;margin-top:3px">${escapeHtml(axisLabel)} : <span style="color:${accent}">${escapeHtml(worst.dir||worst.secteur||'—')}</span></div>
        <div style="font-size:11px;color:rgba(226,232,240,.62);margin-top:3px">${escapeHtml(lever)}${canalLabel?' · '+escapeHtml(canalLabel):''}</div>
      </div>
      <div style="display:flex;gap:10px;align-items:stretch;flex-wrap:wrap">
        <div style="min-width:90px;border:1px solid rgba(255,255,255,.10);background:rgba(15,23,42,.45);border-radius:12px;padding:8px 11px;text-align:center">
          <div style="font-size:9px;color:rgba(255,255,255,.38);text-transform:uppercase;font-weight:800">Capté Leg.</div>
          <div style="font-size:22px;font-weight:950;color:${accent};line-height:1">${pctLeg}%</div>
          <div style="font-size:9px;color:rgba(255,255,255,.32)">${worst.actifsLeg||0}/${base}</div>
        </div>
        <div style="min-width:90px;border:1px solid rgba(255,255,255,.10);background:rgba(15,23,42,.45);border-radius:12px;padding:8px 11px;text-align:center">
          <div style="font-size:9px;color:rgba(255,255,255,.38);text-transform:uppercase;font-weight:800">Capté PDV</div>
          <div style="font-size:22px;font-weight:950;color:${pctPDV>0?'#4ade80':'#f87171'};line-height:1">${pctPDV}%</div>
          <div style="font-size:9px;color:rgba(255,255,255,.32)">${worst.actifsPDV||0}/${base}</div>
        </div>
        <div style="min-width:90px;border:1px solid rgba(255,255,255,.10);background:rgba(15,23,42,.45);border-radius:12px;padding:8px 11px;text-align:center">
          <div style="font-size:9px;color:rgba(255,255,255,.38);text-transform:uppercase;font-weight:800">Clients</div>
          <div style="font-size:22px;font-weight:950;color:#e2e8f0;line-height:1">${worst.total||0}</div>
        </div>
      </div>
    </div>
  </div>`;
}

function renderOverviewDataRow(d,idx,{grpId='',colSpan=9,hidden=false}={}){
  const pct=pctPair(d);
  const dirEnc=encodeURIComponent(d.dir);
  const comEntries=Object.entries(d._comCounts||{}).sort((a,b)=>b[1]-a[1]);
  const mainCom=comEntries.length?comEntries[0][0]:'';
  const comLabel=mainCom?` <span class="t-tertiary font-normal">· ${escapeHtml(mainCom)}</span>`:'';
  const rowCls=`${grpId} border-b text-[11px] hover:s-card-alt cursor-pointer${grpId?'':' font-semibold'}`;
  const style=hidden?' style="display:none"':'';
  const nameCell=grpId
    ? `<td class="py-1.5 px-2 pl-5 font-semibold">${escapeHtml(d.dir)}${comLabel} <span id="overviewL1Arrow-${idx}" class="t-disabled text-[9px]">▼</span></td>`
    : `<td class="py-1.5 px-2">${escapeHtml(d.dir)} <span id="overviewL1Arrow-${idx}" class="t-disabled text-[9px]">▼</span></td>`;
  return `<tr class="${rowCls}"${style} onclick="_toggleOverviewL2('${dirEnc}',${idx})">
      ${nameCell}
      <td class="py-1.5 px-2 text-center font-bold">${d.total}</td>
      ${statCell(d.actifsLeg,'c-ok font-bold')}
      ${statCell(d.actifsPDV,'c-ok font-bold')}
      ${statCell(d.prospects,'c-action')}
      ${statCell(d.perdus12_24,'c-caution font-bold')}
      ${statCell(d.inactifs,'t-secondary')}
      <td class="py-1.5 px-2">${capBar(pct.leg,'bg-blue-400','font-bold w-8 c-action')}</td>
      <td class="py-1.5 px-2">${capBar(pct.pdv,barColor(pct.pdv),'font-bold w-8')}</td>
    </tr>
    <tr id="overviewL2-${idx}" class="${grpId}" style="display:none"><td colspan="${colSpan}" class="p-0 i-danger-bg"><div id="overviewL2Inner-${idx}" class="text-xs t-disabled px-4 py-2">Chargement…</div></td></tr>`;
}

export function renderOverviewL1Rows(dirsArr,{isSecteur=false,colSpan=9}={}){
  if(!isSecteur){
    return dirsArr.map((d,idx)=>renderOverviewDataRow(d,idx,{colSpan})).join('');
  }
  const byParent={};
  dirsArr.forEach(d=>{const p=d.parentDir||'Autre';if(!byParent[p])byParent[p]=[];byParent[p].push(d);});
  const parentDirs=Object.keys(byParent).sort((a,b)=>{
    const sa=byParent[a].reduce((s,d)=>s+d.actifsLeg,0);
    const sb=byParent[b].reduce((s,d)=>s+d.actifsLeg,0);
    return sb-sa;
  });
  let html='',idx=0;
  parentDirs.forEach((pDir,pIdx)=>{
    const sects=byParent[pDir];
    const summary=sects.reduce((acc,d)=>{acc.total+=d.total;acc.actifsLeg+=d.actifsLeg;acc.actifsPDV+=d.actifsPDV;acc.prospects+=d.prospects;acc.perdus12_24+=d.perdus12_24;acc.inactifs+=d.inactifs;return acc;},{total:0,actifsLeg:0,actifsPDV:0,prospects:0,perdus12_24:0,inactifs:0});
    const pct=pctPair(summary);
    const grpId='secGrp-'+pIdx;
    html+=`<tr class="border-b text-[11px] font-black hover:s-card-alt cursor-pointer" style="background:rgba(139,92,246,0.08)" onclick="_toggleSecGrp('${grpId}')">
        <td class="py-1.5 px-2 text-xs font-black">${escapeHtml(pDir)} <span class="t-disabled text-[10px]">(${sects.length})</span> <span id="${grpId}-arrow" class="t-disabled text-[9px]">▶</span></td>
        <td class="py-1.5 px-2 text-center font-bold">${summary.total}</td>
        <td class="py-1.5 px-2 text-center c-ok font-bold">${summary.actifsLeg||'—'}</td>
        <td class="py-1.5 px-2 text-center c-ok font-bold">${summary.actifsPDV||'—'}</td>
        <td class="py-1.5 px-2 text-center">${summary.prospects||'—'}</td>
        <td class="py-1.5 px-2 text-center">${summary.perdus12_24||'—'}</td>
        <td class="py-1.5 px-2 text-center">${summary.inactifs||'—'}</td>
        <td class="py-1.5 px-2">${capBar(pct.leg,'bg-blue-400','font-bold w-8 c-action')}</td>
        <td class="py-1.5 px-2">${capBar(pct.pdv,barColor(pct.pdv),'font-bold w-8')}</td>
      </tr>`;
    sects.forEach(d=>{html+=renderOverviewDataRow(d,idx,{grpId,colSpan,hidden:true});idx++;});
  });
  return html;
}

export function renderOverviewL2Table(metiersArr,{direction,canalSuffix=''}){
  if(!metiersArr.length)return '<div class="px-4 py-3 t-disabled text-xs">Aucun client pour ce filtre.</div>';
  const dirEnc=encodeURIComponent(direction);
  const headCols=`<th class="py-1.5 px-2 text-left">Métier</th><th class="py-1.5 px-2 text-center">Total</th><th class="py-1.5 px-2 text-center">Actifs Leg.</th><th class="py-1.5 px-2 text-center">Actifs PDV${canalSuffix}</th><th class="py-1.5 px-2 text-center">Prospects</th><th class="py-1.5 px-2 text-center">Perdus 12-24m</th><th class="py-1.5 px-2 text-center">Inactifs</th><th class="py-1.5 px-2 text-center min-w-[90px]">% capté Leg.</th><th class="py-1.5 px-2 text-center min-w-[90px]">% capté PDV${canalSuffix}</th><th class="py-1.5 px-2 text-center">🔍</th>`;
  const rows=metiersArr.map((m,mIdx)=>{
    const pct=pctPair(m);
    const mEnc=encodeURIComponent(m.metier);
    const rowId=`overviewL3-${dirEnc}-${mIdx}`;
    return `<tr class="border-t b-light hover:i-danger-bg cursor-pointer font-semibold" onclick="_toggleOverviewL3('${dirEnc}','${mEnc}','${rowId}')">
      <td class="py-1.5 px-2">${escapeHtml(m.metier)}${_isMetierStrategique(m.metier)?' <span class="c-caution text-[10px]" title="Métier stratégique Legallais">⭐</span>':''} <span id="${rowId}-arrow" class="t-disabled text-[9px]">▼</span></td>
      <td class="py-1.5 px-2 text-center font-bold">${m.total}</td>
      ${statCell(m.actifsLeg,'c-ok font-bold')}
      ${statCell(m.actifsPDV,'c-ok font-bold')}
      ${statCell(m.prospects,'c-action')}
      ${statCell(m.perdus12_24,'c-caution font-bold')}
      ${statCell(m.inactifs,'t-secondary')}
      <td class="py-1.5 px-2">${capBar(pct.leg,'bg-blue-400','w-7 c-action')}</td>
      <td class="py-1.5 px-2">${capBar(pct.pdv,barColor(pct.pdv),'w-7')}</td>
      <td class="py-1.5 px-2 text-center"><button class="diag-btn i-danger-bg c-danger" onclick="event.stopPropagation();openDiagnosticMetier(decodeURIComponent('${mEnc}'))">🔍</button></td>
    </tr>
    <tr id="${rowId}" style="display:none"><td colspan="10" class="p-0 i-info-bg"><div id="${rowId}-inner" class="text-xs t-disabled px-4 py-2">Chargement…</div></td></tr>`;
  }).join('');
  return `<div class="px-2 py-2"><table class="min-w-full text-[11px]"><thead class="i-danger-bg c-danger font-bold"><tr>${headCols}</tr></thead><tbody>${rows}</tbody></table></div>`;
}

export function renderOverviewL3Table(sectsArr,{direction,metier,canalSuffix=''}){
  if(!sectsArr.length)return '<div class="px-4 py-3 t-disabled text-xs">Aucun secteur identifié.</div>';
  const dirEnc=encodeURIComponent(direction),mEnc=encodeURIComponent(metier);
  const headCols=`<th class="py-1.5 px-2 text-left">Secteur</th><th class="py-1.5 px-2 text-left">Commercial</th><th class="py-1.5 px-2 text-center">Total</th><th class="py-1.5 px-2 text-center">Actifs Leg.</th><th class="py-1.5 px-2 text-center">Actifs PDV${canalSuffix}</th><th class="py-1.5 px-2 text-center">Prospects</th><th class="py-1.5 px-2 text-center">Perdus 12-24m</th><th class="py-1.5 px-2 text-center">Inactifs</th><th class="py-1.5 px-2 text-center min-w-[90px]">% capté Leg.</th><th class="py-1.5 px-2 text-center min-w-[90px]">% capté PDV${canalSuffix}</th>`;
  const rows=sectsArr.map((s,sIdx)=>{
    const pct=pctPair(s);
    const sEnc=encodeURIComponent(s.secteur);
    const rowId=`overviewL4-${dirEnc}-${mEnc}-${sIdx}`;
    return `<tr class="border-t border-violet-200 hover:i-info-bg cursor-pointer" onclick="_toggleOverviewL4('${dirEnc}','${mEnc}','${sEnc}','${rowId}')">
      <td class="py-1.5 px-2 font-semibold">${escapeHtml(s.secteur)} <span id="${rowId}-arrow" class="t-disabled text-[9px]">▼</span></td>
      <td class="py-1.5 px-2 t-secondary">${escapeHtml(s.commercial)}</td>
      <td class="py-1.5 px-2 text-center font-bold">${s.total}</td>
      ${statCell(s.actifsLeg,'c-ok font-bold')}
      ${statCell(s.actifsPDV,'c-ok font-bold')}
      ${statCell(s.prospects,'c-action')}
      ${statCell(s.perdus12_24,'c-caution font-bold')}
      ${statCell(s.inactifs,'t-secondary')}
      <td class="py-1.5 px-2">${capBar(pct.leg,'bg-blue-400','w-7 c-action')}</td>
      <td class="py-1.5 px-2">${capBar(pct.pdv,barColor(pct.pdv),'w-7')}</td>
    </tr>
    <tr id="${rowId}" style="display:none"><td colspan="10" class="p-0 i-info-bg"><div id="${rowId}-inner" class="text-xs px-4 py-2">Chargement…</div></td></tr>`;
  }).join('');
  return `<div class="px-2 py-2"><table class="min-w-full text-[11px]"><thead class="s-hover t-primary font-bold"><tr>${headCols}</tr></thead><tbody>${rows}</tbody></table></div>`;
}

export function renderOverviewL4Table({clients,show,more,direction,metier,secteur,canal}){
  if(!clients.length)return '<div class="t-disabled text-xs py-2">Aucun client.</div>';
  let html=`<div class="overflow-x-auto" style="max-height:340px;overflow-y:auto"><table class="min-w-full text-[10px]"><thead class="i-info-bg c-action font-bold sticky top-0"><tr><th class="py-1 px-2 text-left">Client</th><th class="py-1 px-2 text-left">Commercial</th><th class="py-1 px-2 text-center">Classif.</th><th class="py-1 px-2 text-right">CA PDV</th><th class="py-1 px-2 text-right">CA Leg.</th><th class="py-1 px-2 text-left">Ville</th></tr></thead><tbody>`;
  for(const c of show){
    const globActif=_isGlobalActif(c),perdu=_isPerdu(c);
    const pdvBg=globActif&&!c._pdvActif?'i-caution-bg':perdu?'i-danger-bg':'';
    const badge=(canal&&c._pdvActifGlobal&&!c._pdvActif)
      ? '<span class="text-[9px] font-bold px-1.5 py-0.5 rounded ml-1" style="background:rgba(255,255,255,0.08);color:rgba(255,255,255,0.35)">Actif PDV</span>'
      : _clientStatusBadge(c.code,c);
    const code=escapeHtml(c.code);
    html+=`<tr class="border-t border-blue-100 ${pdvBg} cursor-pointer hover:i-info-bg" onclick="openClient360('${code}','reseau')">
      <td class="py-1 px-2"><span class="font-mono t-disabled text-[9px]">${code}</span>${_crossBadge(c.code)} <span class="font-semibold">${escapeHtml(c.nom)}</span><button onclick="event.stopPropagation();openClient360('${code}','reseau')" class="text-[10px] t-disabled hover:text-white cursor-pointer opacity-30 hover:opacity-100 transition-opacity ml-1" title="Ouvrir la fiche 360°">🔍</button>${_unikLink(c.code)}${badge}</td>
      <td class="py-1 px-2 text-[9px] t-tertiary">${escapeHtml(c.commercial||'—')}</td>
      <td class="py-1 px-2 text-center">${_classifShort(c.classification)}</td>
      <td class="py-1 px-2 text-right font-bold ${c.caMag>0?'c-ok':'t-disabled'}">${c.caMag>0?formatEuro(c.caMag):'—'}</td>
      <td class="py-1 px-2 text-right font-bold ${c.caLeg>0?'c-caution':'t-disabled'}">${c.caLeg>0?formatEuro(c.caLeg):'—'}</td>
      <td class="py-1 px-2 text-[9px] t-tertiary">${escapeHtml(c.ville||'—')}</td>
    </tr>`;
  }
  html+=`</tbody></table></div>`;
  if(more>0)html+=`<button class="mt-1 mb-1 ml-2 text-[10px] font-bold c-action hover:underline" onclick="_renderOverviewL4(this.parentElement,decodeURIComponent('${encodeURIComponent(direction)}'),decodeURIComponent('${encodeURIComponent(metier)}'),decodeURIComponent('${encodeURIComponent(secteur)}'),${show.length+50})">▼ Voir plus (${more} restants)</button>`;
  return html;
}
