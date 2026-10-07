'use strict';

import { _classifShort, _isMetierStrategique, escapeHtml, formatEuro } from './utils.js';
import { _clientStatusBadge, _crossBadge, _isGlobalActif, _isPerdu, _isProspect, _unikLink } from './engine.js';

function pctPair(row){
  const base=(row.total||0)-(row.prospects||0);
  return {
    pdv:base>0?Math.round((row.actifsPDV||0)/base*100):0,
    leg:base>0?Math.round((row.actifsLeg||0)/base*100):0
  };
}

const _tone=(pct)=>pct>=50?'var(--pt-high)':pct>=25?'var(--pt-mid)':'var(--pt-low)';
function capBar(pct,color){
  return `<span class="tt-cap"><span class="pt-track" style="height:6px"><span class="pt-fill" style="width:${pct}%;background:${color}"></span></span><span class="pt-num">${pct} %</span></span>`;
}
const num=(v,strong)=>`<td class="pt-num ar-r${strong?' pt-strong':''}">${v?Number(v).toLocaleString('fr-FR'):'<span class="pt-muted">—</span>'}</td>`;
const capterCell=(d,onclick)=>`<td class="ar-r"><button type="button" class="tt-capter${d.aCapter?'':' tt-zero'}" ${d.aCapter?`onclick="event.stopPropagation();${onclick}"`:'disabled'} title="Clients actifs chez Legallais, pas encore clients de l'agence">${d.aCapter?Number(d.aCapter).toLocaleString('fr-FR'):'0'}</button></td>`;
const statCols=(d,pct)=>`${num(d.total,true)}${num(d.actifsLeg)}${num(d.actifsPDV)}${num(d.prospects)}${num(d.perdus12_24)}${num(d.inactifs)}
      <td>${capBar(pct.leg,'var(--t-link)')}</td><td>${capBar(pct.pdv,_tone(pct.pdv))}</td>`;
const HEAD_STATS=(cs)=>`<th class="ar-r" title="Actifs chez Legallais, pas encore clients de l'agence — clic = la liste">À capter</th><th class="ar-r">Clients</th><th class="ar-r">Actifs Leg.</th><th class="ar-r">Clients agence${cs}</th><th class="ar-r">Prospects</th><th class="ar-r">Perdus 12-24 m</th><th class="ar-r">Inactifs</th><th>% capté Leg.</th><th>% capté agence${cs}</th>`;

export function renderOverviewHead(axisLabel,captSub=''){
  return `<tr><th>${axisLabel}</th>${HEAD_STATS(captSub)}</tr>`;
}


function renderOverviewDataRow(d,idx,{grpId='',colSpan=10,hidden=false,prio=false}={}){
  const pct=pctPair(d);
  const dirEnc=encodeURIComponent(d.dir);
  const comEntries=Object.entries(d._comCounts||{}).sort((a,b)=>b[1]-a[1]);
  const mainCom=comEntries.length?comEntries[0][0]:'';
  const style=hidden?' style="display:none"':'';
  return `<tr class="${grpId} ar-click${prio?' tt-prio':''}"${style} onclick="_toggleOverviewL2('${dirEnc}',${idx})">
      <td class="${grpId?'tt-indent':''}"><span class="pt-strong">${escapeHtml(d.dir)}</span>${mainCom?` <span class="pt-small pt-muted">· ${escapeHtml(mainCom)}</span>`:''}${prio?' <span class="ar-tag" data-tone="mid">Priorité</span>':''} <span id="overviewL1Arrow-${idx}" class="pt-muted pt-small">▼</span></td>
      ${capterCell(d,`_ttCapter('${dirEnc}')`)}
      ${statCols(d,pct)}
    </tr>
    <tr id="overviewL2-${idx}" class="${grpId} tt-sub" style="display:none"><td colspan="${colSpan}"><div id="overviewL2Inner-${idx}" class="pt-small pt-muted" style="padding:8px 12px">Chargement…</div></td></tr>`;
}

const _sum=(arr)=>arr.reduce((acc,d)=>{for(const k of ['total','actifsLeg','actifsPDV','aCapter','prospects','perdus12_24','inactifs'])acc[k]+=d[k]||0;return acc;},{total:0,actifsLeg:0,actifsPDV:0,aCapter:0,prospects:0,perdus12_24:0,inactifs:0});
const SMALL=5; // secteurs de moins de 5 clients : regroupés

export function renderOverviewL1Rows(dirsArr,{isSecteur=false,colSpan=10}={}){
  if(!isSecteur){
    return dirsArr.map((d,idx)=>renderOverviewDataRow(d,idx,{colSpan,prio:idx===0&&(d.aCapter||0)>0})).join('');
  }
  const byParent={};
  dirsArr.forEach(d=>{const p=d.parentDir||'Autre';if(!byParent[p])byParent[p]=[];byParent[p].push(d);});
  const parentDirs=Object.keys(byParent).sort((a,b)=>_sum(byParent[b]).aCapter-_sum(byParent[a]).aCapter);
  let html='',idx=0;
  parentDirs.forEach((pDir,pIdx)=>{
    const sects=byParent[pDir];
    const summary=_sum(sects);
    const pct=pctPair(summary);
    const grpId='secGrp-'+pIdx;
    html+=`<tr class="ar-click tt-group${pIdx===0&&summary.aCapter?' tt-prio':''}" onclick="_toggleSecGrp('${grpId}')">
        <td><span class="pt-strong">${escapeHtml(pDir)}</span> <span class="pt-small pt-muted">${sects.length} secteurs</span>${pIdx===0&&summary.aCapter?' <span class="ar-tag" data-tone="mid">Priorité</span>':''} <span id="${grpId}-arrow" class="pt-muted pt-small">▶</span></td>
        <td class="ar-r"><span class="tt-capter tt-static">${summary.aCapter.toLocaleString('fr-FR')}</span></td>
        ${statCols(summary,pct)}
      </tr>`;
    const big=sects.filter(d=>d.total>=SMALL),small=sects.filter(d=>d.total<SMALL);
    big.forEach(d=>{html+=renderOverviewDataRow(d,idx,{grpId,colSpan,hidden:true});idx++;});
    if(small.length){
      const sm=_sum(small),smGrp=grpId+'-small';
      html+=`<tr class="${grpId} ar-click tt-small" style="display:none" onclick="event.stopPropagation();document.querySelectorAll('.${smGrp}').forEach(r=>r.style.display=r.style.display==='none'?'':'none')">
        <td class="tt-indent pt-muted">+ ${small.length} petits secteurs (moins de ${SMALL} clients)</td>
        <td class="ar-r pt-num pt-muted">${sm.aCapter||'—'}</td><td class="pt-num ar-r pt-muted">${sm.total}</td><td colspan="${colSpan-3}"></td></tr>`;
      small.forEach(d=>{html+=renderOverviewDataRow(d,idx,{grpId:grpId+' '+smGrp,colSpan,hidden:true});idx++;});
    }
  });
  return html;
}

export function renderOverviewL2Table(metiersArr,{direction,canalSuffix=''}){
  if(!metiersArr.length)return '<div class="pt-small pt-muted" style="padding:10px 12px">Aucun client pour ce filtre.</div>';
  const dirEnc=encodeURIComponent(direction);
  const rows=metiersArr.map((m,mIdx)=>{
    const pct=pctPair(m);
    const mEnc=encodeURIComponent(m.metier);
    const rowId=`overviewL3-${dirEnc}-${mIdx}`;
    return `<tr class="ar-click" onclick="_toggleOverviewL3('${dirEnc}','${mEnc}','${rowId}')">
      <td><span class="pt-strong">${escapeHtml(m.metier)}</span>${_isMetierStrategique(m.metier)?' <span title="Métier stratégique Legallais">⭐</span>':''} <span id="${rowId}-arrow" class="pt-muted pt-small">▼</span>
        <button type="button" class="pt-link pt-small" style="padding:0 0 0 6px" onclick="event.stopPropagation();openDiagnosticMetier(decodeURIComponent('${mEnc}'))" title="Diagnostic du métier">diagnostic</button></td>
      ${capterCell(m,`_ttCapter('${dirEnc}','${mEnc}')`)}
      ${statCols(m,pct)}
    </tr>
    <tr id="${rowId}" class="tt-sub" style="display:none"><td colspan="10"><div id="${rowId}-inner" class="pt-small pt-muted" style="padding:8px 12px">Chargement…</div></td></tr>`;
  }).join('');
  return `<div class="tt-nest"><table class="pt-table"><thead><tr><th>Métier</th>${HEAD_STATS(canalSuffix)}</tr></thead><tbody>${rows}</tbody></table></div>`;
}

export function renderOverviewL3Table(sectsArr,{direction,metier,canalSuffix=''}){
  if(!sectsArr.length)return '<div class="pt-small pt-muted" style="padding:10px 12px">Aucun secteur identifié.</div>';
  const dirEnc=encodeURIComponent(direction),mEnc=encodeURIComponent(metier);
  const rows=sectsArr.map((s,sIdx)=>{
    const pct=pctPair(s);
    const sEnc=encodeURIComponent(s.secteur);
    const rowId=`overviewL4-${dirEnc}-${mEnc}-${sIdx}`;
    return `<tr class="ar-click" onclick="_toggleOverviewL4('${dirEnc}','${mEnc}','${sEnc}','${rowId}')">
      <td><span class="pt-strong">${escapeHtml(s.secteur)}</span> <span class="pt-small pt-muted">· ${escapeHtml(s.commercial)}</span> <span id="${rowId}-arrow" class="pt-muted pt-small">▼</span></td>
      <td class="ar-r pt-num pt-strong">${s.aCapter||'<span class="pt-muted">0</span>'}</td>
      ${statCols(s,pct)}
    </tr>
    <tr id="${rowId}" class="tt-sub" style="display:none"><td colspan="10"><div id="${rowId}-inner" class="pt-small" style="padding:8px 12px">Chargement…</div></td></tr>`;
  }).join('');
  return `<div class="tt-nest"><table class="pt-table"><thead><tr><th>Secteur · commercial</th>${HEAD_STATS(canalSuffix)}</tr></thead><tbody>${rows}</tbody></table></div>`;
}

export function renderOverviewL4Table({clients,show,more,direction,metier,secteur,canal}){
  if(!clients.length)return '<div class="t-disabled text-xs py-2">Aucun client.</div>';
  let html=`<div class="overflow-x-auto" style="max-height:340px;overflow-y:auto"><table class="min-w-full text-[10px]"><thead class="i-info-bg c-action font-bold sticky top-0"><tr><th class="py-1 px-2 text-left">Client</th><th class="py-1 px-2 text-left">Commercial</th><th class="py-1 px-2 text-center">Classif.</th><th class="py-1 px-2 text-right">CA PDV</th><th class="py-1 px-2 text-right">CA Leg.</th><th class="py-1 px-2 text-right">CA N-1</th><th class="py-1 px-2 text-left">Ville</th></tr></thead><tbody>`;
  for(const c of show){
    const globActif=_isGlobalActif(c),perdu=_isPerdu(c);
    const pdvBg=globActif&&!c._pdvActif?'i-caution-bg':perdu&&!c._pdvActif?'i-danger-bg':'';
    // Badge cohérent avec capteSet (même source que L3 comptage + sort)
    const badge=c._pdvActif
      ? '<span class="text-[9px] font-bold px-1.5 py-0.5 rounded ml-1" style="background:var(--i-ok-bg);color:var(--i-ok-text)">Actif PDV</span>'
      : globActif
        ? '<span class="text-[9px] font-bold px-1.5 py-0.5 rounded ml-1" style="background:var(--i-info-bg);color:var(--i-info-text)">Actif Leg.</span>'
        : _isProspect(c)
          ? '<span class="text-[9px] font-bold px-1.5 py-0.5 rounded ml-1" style="background:var(--i-neutral-bg);color:var(--i-neutral-text)">Prospect</span>'
          : perdu&&(c.caN1||0)>0
            ? '<span class="text-[9px] font-bold px-1.5 py-0.5 rounded ml-1" style="background:var(--i-caution-bg);color:var(--i-caution-text)">Perdu 12-24m</span>'
            : '<span class="text-[9px] font-bold px-1.5 py-0.5 rounded ml-1" style="background:var(--i-danger-bg);color:var(--i-danger-text)">Inactif</span>';
    const code=escapeHtml(c.code);
    html+=`<tr class="border-t border-blue-100 ${pdvBg} hover:i-info-bg">
      <td class="py-1 px-2"><span class="font-mono t-disabled text-[9px]">${code}</span>${_crossBadge(c.code)} <span class="font-semibold">${escapeHtml(c.nom)}</span><button onclick="openClient360('${code}','reseau')" class="text-[10px] t-disabled hover:text-white cursor-pointer opacity-30 hover:opacity-100 transition-opacity ml-1" title="Ouvrir la fiche 360°">🔍</button>${_unikLink(c.code)}${badge}</td>
      <td class="py-1 px-2 text-[9px] t-tertiary">${escapeHtml(c.commercial||'—')}</td>
      <td class="py-1 px-2 text-center">${_classifShort(c.classification)}</td>
      <td class="py-1 px-2 text-right font-bold ${c.caMag>0?'c-ok':'t-disabled'}">${c.caMag>0?formatEuro(c.caMag):'—'}</td>
      <td class="py-1 px-2 text-right font-bold ${c.caLeg>0?'c-caution':'t-disabled'}">${c.caLeg>0?formatEuro(c.caLeg):'—'}</td>
      <td class="py-1 px-2 text-right text-[9px] ${c.caN1>0?(c.caLeg>0&&c.caLeg<c.caN1*0.5?'c-danger font-bold':'t-secondary'):'t-disabled'}">${c.caN1>0?formatEuro(c.caN1):'—'}</td>
      <td class="py-1 px-2 text-[9px] t-tertiary">${escapeHtml(c.ville||'—')}</td>
    </tr>`;
  }
  html+=`</tbody></table></div>`;
  if(more>0)html+=`<button class="mt-1 mb-1 ml-2 text-[10px] font-bold c-action hover:underline" onclick="_renderOverviewL4(this.parentElement,decodeURIComponent('${encodeURIComponent(direction)}'),decodeURIComponent('${encodeURIComponent(metier)}'),decodeURIComponent('${encodeURIComponent(secteur)}'),${show.length+50})">▼ Voir plus (${more} restants)</button>`;
  return html;
}
