// © 2026 Jawad El Barkaoui — Tous droits réservés
// ═══════════════════════════════════════════════════════════════
// PRISME — diagnostic.js
// Diagnostic Cascade Adaptatif — voyants + niveaux + plan d'action
// Extrait de main.js (C5 — Sprint C)
// Dépend de : state, engine, utils, ui, constants
// ═══════════════════════════════════════════════════════════════
'use strict';

import { RADAR_LABELS } from './constants.js';
import { formatEuro, daysBetween, _median, _copyCodeBtn, _isMetierStrategique, fmtDate, escapeHtml, famLib } from './utils.js';
function _normalizeClassifLocal(c){const u=(c||'').toUpperCase().replace(/\s/g,'');if(u.includes('FID')&&u.includes('POT+'))return'FID Pot+';if(u.includes('FID')&&u.includes('POT-'))return'FID Pot-';if(u.includes('OCC')&&u.includes('POT+'))return'OCC Pot+';if(u.includes('OCC')&&u.includes('POT-'))return'OCC Pot-';return'NC';}
import { _S } from './state.js';
import { estimerCAPerdu, computeSPC, _isPDVActif, _isGlobalActif, _isPerdu, _diagClientPrio, _diagClassifPrio, _unikLink, clientMatchesDeptFilter, clientMatchesClassifFilter, clientMatchesStatutFilter, clientMatchesActivitePDVFilter, clientMatchesCommercialFilter } from './engine.js';
import { switchTab, clearCockpitFilter, renderAll } from './ui.js';


function openDiagnostic(famille,source){
  const overlay=document.getElementById('diagnosticOverlay');
  if(!overlay)return;
  overlay.classList.add('active');
  _S._diagCurrentFamille=famille;_S._diagCurrentSource=source;_S._diagMetierFilter='';
  try{renderDiagnosticPanel(famille,source);}
  catch(e){
    console.error('Diagnostic error:',e);
    const panel=document.getElementById('diagnosticPanel');
    if(panel)panel.innerHTML=`<div class="flex items-center justify-between mb-4"><h2 class="text-lg font-bold text-white">🔍 Diagnostic</h2><button onclick="closeDiagnostic()" class="t-inverse-muted hover:text-white text-3xl font-light leading-none">✕</button></div><div class="p-4 s-panel-inner border border-amber-700 rounded-xl"><p class="c-caution font-semibold text-sm mb-2">⚠️ Données insuffisantes pour cette famille.</p><p class="t-inverse text-xs">La famille <strong>${famille.replace(/&/g,'&amp;').replace(/</g,'&lt;')}</strong> n'a pas de données dans le Radar (articles non chargés ou famille sans stock).</p><p class="t-inverse-muted text-xs mt-2">Vérifiez que le fichier État du Stock contient des articles de cette famille.</p></div>`;
  }
}
function openDiagnosticMetier(metier){
  const overlay=document.getElementById('diagnosticOverlay');
  if(overlay){overlay.classList.add('active');_S._diagCurrentFamille='@metier:'+metier;_S._diagCurrentSource='territoire';_S._diagMetierFilter='';renderDiagnosticPanel('@metier:'+metier,'territoire');}
}
function closeDiagnostic(){
  const overlay=document.getElementById('diagnosticOverlay');
  if(overlay)overlay.classList.remove('active');
  document.body.style.overflow='';
  const mc=document.getElementById('mainContent');if(mc)mc.style.overflow='';
  // Reset famille filter — diagnostic is a temporary view, not a persistent filter
  const ff=document.getElementById('filterFamille');if(ff)ff.value='';
  if(mc)mc.scrollTo(0,0);else window.scrollTo(0,0);
}
function executeDiagAction(idx){if(_S._diagActions[idx]&&_S._diagActions[idx].fn)_S._diagActions[idx].fn();}

function closeArticlePanel(){document.getElementById('articlePanelOverlay')?.classList.remove('active');}

function openClient360(clientCode,source){
  const overlay=document.getElementById('articlePanelOverlay');
  const panel=document.getElementById('articlePanel');
  if(!overlay||!panel)return;
  overlay.classList.add('active');
  panel.style.maxWidth='780px';
  panel.innerHTML=_renderClient360(clientCode,source);
}

function _renderClient360(clientCode,source){
  // ── Données client ──────────────────────────────────────────────
  const info=_S.chalandiseData?.get(clientCode)||{};
  const nom=_S.clientNomLookup[clientCode]||info.nom||clientCode;
  const artMap=_S.ventesClientArticle?.get(clientCode);
  const horsMag=_S.ventesClientHorsMagasin?.get(clientCode);
  const lastOrder=_S.clientLastOrder?.get(clientCode);
  const today=new Date();
  const daysSince=lastOrder?Math.round((today-lastOrder)/86400000):null;
  const ca2025=info.ca2025||0;
  const caPDV=artMap?[...artMap.values()].reduce((s,d)=>s+(d.sumCA||0),0):0;
  const hasChal=_S.chalandiseReady;
  const hasTerr=_S.territoireReady&&_S.territoireLines?.length>0;

  // ── Classification + badge statut ───────────────────────────────
  const classif=_normalizeClassifLocal(info.classification);
  const classifColors={'FID Pot+':'bg-emerald-700 text-emerald-100','FID Pot-':'bg-gray-600 text-gray-200','OCC Pot+':'bg-blue-700 text-blue-100','OCC Pot-':'bg-blue-900 text-blue-300','NC':'bg-slate-700 text-slate-300'};
  const classifBadge=classif?`<span class="text-[10px] font-bold px-2 py-0.5 rounded-full ${classifColors[classif]||'bg-slate-700 text-slate-300'}">${classif}</span>`:'';

  // ── Statut client ────────────────────────────────────────────────
  let statusBadge='',statusBg='';
  if(!artMap&&ca2025===0){
    statusBadge='<span class="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-600 text-slate-200">PROSPECT</span>';
    statusBg='';
  }else if(!artMap&&ca2025>0){
    statusBadge='<span class="text-[10px] font-bold px-2 py-0.5 rounded-full bg-orange-700 text-orange-100">HORS AGENCE</span>';
    statusBg='border-l-4 border-orange-500';
  }else if(daysSince!==null&&daysSince>=30){
    statusBadge='<span class="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-700 text-red-100">SILENCIEUX</span>';
    statusBg='border-l-4 border-red-500';
  }else{
    statusBadge='<span class="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-700 text-emerald-100">ACTIF</span>';
    statusBg='border-l-4 border-emerald-500';
  }

  // ── Retour contextuel ────────────────────────────────────────────
  const sourceLabels={terrain:'← Le Terrain',cockpit:'← Cockpit',radar:'← Radar',reseau:'← Le Réseau',default:'← Retour'};
  const backLabel=sourceLabels[source]||sourceLabels.default;

  // ── HEADER ───────────────────────────────────────────────────────
  const header=`<div class="flex items-center gap-2 mb-3">
    <button onclick="closeArticlePanel()" class="t-disabled hover:text-white text-sm font-semibold flex items-center gap-1">${backLabel}</button>
    <div class="flex-1 mx-2">
      <div class="flex flex-wrap items-center gap-1.5 mb-0.5">
        <span class="font-mono t-disabled text-xs">${escapeHtml(clientCode)}</span>
        ${statusBadge}
        ${classifBadge}
      </div>
      <h2 class="font-extrabold text-base leading-tight text-white">${escapeHtml(nom)}${_unikLink(clientCode)}</h2>
      <p class="text-[11px] t-inverse-muted mt-0.5">${[info.ville?escapeHtml(info.ville):'',info.metier?escapeHtml(info.metier):'',info.commercial?`Commercial : ${escapeHtml(info.commercial)}`:''].filter(Boolean).join(' · ')||'Données chalandise non chargées'}</p>
    </div>
    <button onclick="closeArticlePanel()" class="t-disabled hover:text-white text-xl leading-none font-bold ml-2">✕</button>
  </div>`;

  // ── ACTION (ligne 2) ─────────────────────────────────────────────
  let actionText='',actionBg='';
  if(!artMap&&ca2025===0){
    actionText='Prospect — aucun historique d\'achat connu. À qualifier.';
    actionBg='bg-slate-700/50 border-slate-600';
  }else if(!artMap&&ca2025>0&&_isPerdu(info)){
    actionText=`Ancien client PDV — à reconquérir. ${formatEuro(ca2025)} de CA historique.`;
    actionBg='bg-orange-900/40 border-orange-700';
  }else if(!artMap&&ca2025>0){
    actionText=`Jamais venu en agence — ${formatEuro(ca2025)} chez Legallais. Opportunité directe.`;
    actionBg='bg-orange-900/40 border-orange-700';
  }else if(daysSince!==null&&daysSince>=60){
    actionText=`Client silencieux depuis ${daysSince}j — à risque de perte définitive. Appeler cette semaine.`;
    actionBg='bg-red-900/40 border-red-700';
  }else if(daysSince!==null&&daysSince>=30){
    actionText=`${daysSince}j sans commande — à relancer avant que ça devienne critique.`;
    actionBg='bg-orange-900/40 border-orange-700';
  }else if(horsMag&&horsMag.size>0){
    const nbOpp=[...horsMag.keys()].filter(c=>!artMap?.has(c)).length;
    actionText=nbOpp>0?`Client actif · ${nbOpp} article${nbOpp>1?'s':''} achetés hors agence que vous ne lui vendez pas — voir onglet Opportunités.`:'Client actif — aucune action urgente.';
    actionBg=nbOpp>0?'bg-blue-900/40 border-blue-700':'bg-emerald-900/40 border-emerald-700';
  }else{
    actionText='Client actif — aucune action urgente.';
    actionBg='bg-emerald-900/40 border-emerald-700';
  }
  const actionBar=`<div class="mb-3 px-3 py-2 rounded-lg border ${actionBg}"><p class="text-xs font-bold t-inverse">⚡ ${actionText}</p></div>`;

  // ── SUMMARY BAR ──────────────────────────────────────────────────
  const cards=[];
  if(caPDV>0||artMap){
    const mois=_S.consommeMoisCouverts||3;
    const periode=_S.consommePeriodMin&&_S.consommePeriodMax?`${fmtDate(_S.consommePeriodMin)} → ${fmtDate(_S.consommePeriodMax)}`:`${mois} mois`;
    cards.push(`<div class="flex-1 p-3 rounded-xl s-panel-inner border b-dark min-w-0"><p class="text-[10px] t-inverse-muted uppercase tracking-wide">CA Magasin</p><p class="text-lg font-extrabold t-inverse">${formatEuro(caPDV)}</p><p class="text-[10px] t-inverse-muted">${periode} · ${artMap?artMap.size:0} réf.</p></div>`);
  }
  if(hasChal&&ca2025>0){
    cards.push(`<div class="flex-1 p-3 rounded-xl s-panel-inner border b-dark min-w-0"><p class="text-[10px] t-inverse-muted uppercase tracking-wide">CA Legallais 2025</p><p class="text-lg font-extrabold t-inverse">${formatEuro(ca2025)}</p><p class="text-[10px] t-inverse-muted">Source : chalandise Qlik</p></div>`);
  }
  if(daysSince!==null){
    const silCol=daysSince>=30?'c-danger':daysSince>=15?'c-caution':'c-ok';
    const silLabel=daysSince>=30?'Silencieux':daysSince>=15?'À surveiller':'Actif récemment';
    cards.push(`<div class="flex-1 p-3 rounded-xl s-panel-inner border b-dark min-w-0"><p class="text-[10px] t-inverse-muted uppercase tracking-wide">Dernière commande</p><p class="text-lg font-extrabold ${silCol}">${daysSince}j</p><p class="text-[10px] t-inverse-muted">${silLabel}</p></div>`);
  }
  const spc=_S.chalandiseReady?computeSPC(clientCode,info):null;
  if(spc!==null){
    const spcCol=spc>=70?'c-ok':spc>=40?'c-caution':'c-danger';
    const spcLabel=spc>=70?'Potentiel élevé':spc>=40?'Potentiel moyen':'Potentiel faible';
    const spcFactor=spc>=70?'CA élevé, achat régulier':spc>=40?'CA correct, silence récent':'Fréquence faible, CA modeste';
    cards.push(`<div class="flex-1 p-3 rounded-xl s-panel-inner border b-dark min-w-0"><p class="text-[10px] t-inverse-muted uppercase tracking-wide">Potentiel</p><p class="text-lg font-extrabold ${spcCol}">${spcLabel}</p><p class="text-[10px] t-inverse-muted">${spcFactor}</p></div>`);
  }
  const summaryBar=cards.length?`<div class="flex gap-3 mb-4">${cards.join('')}</div>`:'';

  // ── ONGLETS Ici / Ailleurs / Opportunités ────────────────────────
  const iciArts=artMap?[...artMap.entries()].sort((a,b)=>b[1].sumCA-a[1].sumCA).slice(0,20):[];

  const ailleursMap=new Map();
  if(horsMag)for(const[code,d]of horsMag.entries()){if(!ailleursMap.has(code))ailleursMap.set(code,{ca:0,canal:d.canal});ailleursMap.get(code).ca+=d.ca;}
  if(hasTerr)for(const l of _S.territoireLines){if(l.clientCode!==clientCode)continue;if(!ailleursMap.has(l.code))ailleursMap.set(l.code,{ca:0,canal:l.canal||'—'});ailleursMap.get(l.code).ca+=l.ca||0;}
  const ailleursArts=[...ailleursMap.entries()].sort((a,b)=>b[1].ca-a[1].ca).slice(0,20);

  const oppArts=ailleursArts.filter(([code])=>{
    if(artMap?.has(code))return false;
    const r=_S.finalData?.find(f=>f.code===code);
    return!r||r.stockActuel===0||(r.ancienMin||0)===0;
  }).slice(0,20);

  const tabs=[];
  if(iciArts.length)tabs.push({id:'ici',label:`🏪 Ici — ${iciArts.length} réf.`});
  if(ailleursArts.length)tabs.push({id:'ailleurs',label:`🌐 Ailleurs — ${ailleursArts.length} art.`});
  if(oppArts.length)tabs.push({id:'opport',label:`💡 Opportunités — ${oppArts.length}`});

  const CANAL_LABELS={INTERNET:'🌐 Web',REPRESENTANT:'🤝 Représentant',DCS:'🏢 DCS',MAGASIN:'🏪 Comptoir'};

  let tabsHtml='';
  if(tabs.length){
    const firstTab=tabs[0].id;
    const tabBtns=tabs.map(t=>`<button id="c360tab-${t.id}" onclick="_c360SwitchTab('${escapeHtml(clientCode)}','${t.id}')" class="text-[11px] font-bold px-3 py-1.5 rounded-t-lg border-b-2 ${t.id===firstTab?'border-cyan-400 text-cyan-300':'border-transparent t-disabled hover:t-inverse'}">${t.label}</button>`).join('');

    const iciRows=iciArts.map(([code,d])=>{
      const lib=(_S.libelleLookup?.[code]||code).replace(/^\d{6} - /,'');
      const r=_S.finalData?.find(f=>f.code===code);
      const stock=r?(r.stockActuel>0?`✅ ${r.stockActuel}`:'⚠️ 0'):'❌';
      return`<tr class="border-b b-dark hover:s-panel-inner"><td class="py-1 px-2 font-mono text-[10px] t-disabled">${escapeHtml(code)}</td><td class="py-1 px-2 text-[11px] font-semibold t-inverse">${escapeHtml(lib)}</td><td class="py-1 px-2 text-center text-[10px]">${d.countBL||0}x</td><td class="py-1 px-2 text-right font-bold c-ok">${formatEuro(d.sumCA)}</td><td class="py-1 px-2 text-center text-[10px] t-inverse-muted">${stock}</td></tr>`;
    }).join('');

    const ailleursRows=ailleursArts.map(([code,d])=>{
      const lib=(_S.libelleLookup?.[code]||code).replace(/^\d{6} - /,'');
      const canalLabel=CANAL_LABELS[d.canal]||d.canal||'—';
      const alreadyHere=artMap?.has(code);
      return`<tr class="border-b b-dark hover:s-panel-inner ${alreadyHere?'opacity-50':''}"><td class="py-1 px-2 font-mono text-[10px] t-disabled">${escapeHtml(code)}</td><td class="py-1 px-2 text-[11px] font-semibold t-inverse">${escapeHtml(lib)}</td><td class="py-1 px-2 text-[10px] t-inverse-muted">${escapeHtml(canalLabel)}</td><td class="py-1 px-2 text-right font-bold c-action">${formatEuro(d.ca)}</td><td class="py-1 px-2 text-center text-[10px]">${alreadyHere?'✅ aussi ici':'⚠️ pas ici'}</td></tr>`;
    }).join('');

    const oppRows=oppArts.map(([code,d])=>{
      const lib=(_S.libelleLookup?.[code]||code).replace(/^\d{6} - /,'');
      const r=_S.finalData?.find(f=>f.code===code);
      const statut=!r?'❌ Non référencé':r.ancienMin===0?'📦 MIN = 0':'⚠️ Rupture';
      return`<tr class="border-b b-dark hover:s-panel-inner"><td class="py-1 px-2 font-mono text-[10px] t-disabled">${escapeHtml(code)}</td><td class="py-1 px-2 text-[11px] font-semibold t-inverse">${escapeHtml(lib)}</td><td class="py-1 px-2 text-right font-bold c-caution">${formatEuro(d.ca)}</td><td class="py-1 px-2 text-[10px] c-danger">${statut}</td></tr>`;
    }).join('');

    const tabContents={
      ici:`<table class="min-w-full text-xs"><thead class="s-panel-inner t-inverse font-bold"><tr><th class="py-1 px-2 text-left">Code</th><th class="py-1 px-2 text-left">Article</th><th class="py-1 px-2 text-center">Fréq.</th><th class="py-1 px-2 text-right">CA</th><th class="py-1 px-2 text-center">Stock</th></tr></thead><tbody>${iciRows}</tbody></table>`,
      ailleurs:`<table class="min-w-full text-xs"><thead class="s-panel-inner t-inverse font-bold"><tr><th class="py-1 px-2 text-left">Code</th><th class="py-1 px-2 text-left">Article</th><th class="py-1 px-2 text-left">Canal</th><th class="py-1 px-2 text-right">CA</th><th class="py-1 px-2 text-center">Statut</th></tr></thead><tbody>${ailleursRows}</tbody></table>`,
      opport:`<p class="text-[10px] t-inverse-muted mb-2">Articles que ce client achète hors agence, absents ou non référencés dans votre stock.</p><table class="min-w-full text-xs"><thead class="s-panel-inner t-inverse font-bold"><tr><th class="py-1 px-2 text-left">Code</th><th class="py-1 px-2 text-left">Article</th><th class="py-1 px-2 text-right">CA hors agence</th><th class="py-1 px-2 text-left">Statut stock</th></tr></thead><tbody>${oppRows}</tbody></table>`
    };

    tabsHtml=`<div class="flex gap-1 mb-0 border-b b-dark">${tabBtns}</div>
      <div class="overflow-x-auto" style="max-height:320px;overflow-y:auto">
        ${tabs.map(t=>`<div id="c360content-${t.id}" class="${t.id===firstTab?'':'hidden'}">${tabContents[t.id]||''}</div>`).join('')}
      </div>`;
  }else{
    tabsHtml=`<p class="t-disabled text-sm text-center py-4">Aucun historique d'achat disponible pour ce client.</p>`;
  }

  // ── COPIER RÉSUMÉ ────────────────────────────────────────────────
  const copyBtn=`<div class="mt-3 pt-3 border-t b-dark flex justify-end"><button onclick="_c360CopyResume('${escapeHtml(clientCode)}')" class="text-[10px] t-disabled hover:t-inverse border b-dark px-3 py-1 rounded font-bold">📋 Copier résumé</button></div>`;

  return header+actionBar+summaryBar+tabsHtml+copyBtn;
}

function _c360SwitchTab(clientCode,tabId){
  ['ici','ailleurs','opport'].forEach(id=>{
    const el=document.getElementById(`c360content-${id}`);
    const btn=document.getElementById(`c360tab-${id}`);
    if(el)el.classList.add('hidden');
    if(btn){btn.classList.remove('border-cyan-400','text-cyan-300');btn.classList.add('border-transparent','t-disabled');}
  });
  const active=document.getElementById(`c360content-${tabId}`);
  const activeBtn=document.getElementById(`c360tab-${tabId}`);
  if(active)active.classList.remove('hidden');
  if(activeBtn){activeBtn.classList.remove('border-transparent','t-disabled');activeBtn.classList.add('border-cyan-400','text-cyan-300');}
}

function _c360CopyResume(clientCode){
  const info=_S.chalandiseData?.get(clientCode)||{};
  const nom=_S.clientNomLookup?.[clientCode]||info.nom||clientCode;
  const artMap=_S.ventesClientArticle?.get(clientCode);
  const caPDV=artMap?[...artMap.values()].reduce((s,d)=>s+(d.sumCA||0),0):0;
  const ca2025=info.ca2025||0;
  const lastOrder=_S.clientLastOrder?.get(clientCode);
  const daysSince=lastOrder?Math.round((new Date()-lastOrder)/86400000):null;
  const lines=[
    `CLIENT 360° — ${nom} (${clientCode})`,
    `Métier : ${info.metier||'—'} · Commercial : ${info.commercial||'—'} · ${info.ville||''}`,
    `CA Magasin : ${formatEuro(caPDV)}${ca2025>0?` · CA Legallais 2025 : ${formatEuro(ca2025)}`:''}`,
    daysSince!==null?`Dernière commande : il y a ${daysSince}j`:'',
  ].filter(Boolean);
  navigator.clipboard?.writeText(lines.join('\n'))
    .then(()=>showToast('📋 Résumé copié','success'))
    .catch(()=>showToast('❌ Erreur copie','error'));
}

function openArticlePanel(code,source){
  const overlay=document.getElementById('articlePanelOverlay');const panel=document.getElementById('articlePanel');
  if(!overlay||!panel)return;
  const r=_S.finalData.find(d=>d.code===code);
  if(!r){panel.innerHTML='<p class="t-disabled p-4">Article introuvable.</p>';overlay.classList.add('active');return;}
  const _today=new Date();
  // Header badges
  const abcCls=r.abcClass==='A'?'diag-ok':r.abcClass==='B'?'diag-warn':'diag-lock';
  const fmrCls=r.fmrClass==='F'?'diag-ok':r.fmrClass==='M'?'diag-warn':'diag-lock';
  const badges=[r.famille?`<span class="diag-badge diag-lock">${escapeHtml(r.famille)}</span>`:'',r.abcClass?`<span class="diag-badge ${abcCls}">ABC-${escapeHtml(r.abcClass)}</span>`:'',r.fmrClass?`<span class="diag-badge ${fmrCls}">FMR-${escapeHtml(r.fmrClass)}</span>`:''].filter(Boolean).join(' ');
  // Stock section
  const stockColor=r.stockActuel<=0?'c-danger font-extrabold':'c-ok';
  const joursRup=r.stockActuel<=0?Math.min(r.ageJours>=999?90:r.ageJours,90):0;
  const caEst=Math.round((r.V||0)*(r.prixUnitaire||0));
  const puFmt=r.prixUnitaire>0?formatEuro(r.prixUnitaire):'—';
  const newMinFmt=r.nouveauMin!=null&&r.nouveauMin!==r.ancienMin?`<span class="text-violet-300 font-bold">${r.nouveauMin}</span>`:'—';
  const newMaxFmt=r.nouveauMax!=null&&r.nouveauMax!==r.ancienMax?`<span class="text-violet-300 font-bold">${r.nouveauMax}</span>`:'—';
  // MIN/MAX Réseau (multi-agences uniquement)
  let _reseauMinMaxRow='';
  if(_S.storesIntersection.size>1&&_S.selectedMyStore){const _otherS2=[..._S.storesIntersection].filter(s=>s!==_S.selectedMyStore);const _rMins=_otherS2.map(s=>_S.stockParMagasin[s]?.[code]?.qteMin).filter(v=>v>0);const _rMaxs=_otherS2.map(s=>_S.stockParMagasin[s]?.[code]?.qteMax).filter(v=>v>0);const _nbAg=Math.max(_rMins.length,_rMaxs.length);if(_nbAg>0){const _mMin=_rMins.length?Math.round(_median(_rMins)):null;const _mMax=_rMaxs.length?Math.round(_median(_rMaxs)):null;_reseauMinMaxRow=`<span class="t-disabled">MIN / MAX Réseau</span><span class="t-disabled">${_mMin??'—'} / ${_mMax??'—'}<span class="text-[10px] t-tertiary ml-1">(méd. ${_nbAg} agence${_nbAg>1?'s':''})</span></span>`;}else{_reseauMinMaxRow=`<span class="t-disabled">MIN / MAX Réseau</span><span class="t-secondary text-[10px]">Pas de données réseau</span>`;}}
  const stockHtml=`<div class="diag-level mt-3"><div class="diag-level-hdr"><span class="font-bold text-sm">📦 Stock</span></div><div class="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs"><span class="t-disabled">Stock actuel</span><span class="${stockColor}">${r.stockActuel}${r.stockActuel<=0?` (rupture ${joursRup}j)`:''}</span><span class="t-disabled">MIN / MAX ERP</span><span>${r.ancienMin??'—'} / ${r.ancienMax??'—'}</span>${_reseauMinMaxRow}<span class="t-disabled">MIN / MAX PRISME</span><span>${newMinFmt} / ${newMaxFmt}</span><span class="t-disabled">Prix unitaire</span><span>${puFmt}</span><span class="t-disabled">CA perdu estimé</span><span class="c-danger font-bold">${caEst>0?formatEuro(caEst):'—'}</span></div>${r.nouveauMin>0?`<button onclick="navigator.clipboard.writeText('${code}').catch(()=>{});this.textContent='✅ Copié';setTimeout(()=>this.textContent='→ Commander (MIN : ${r.nouveauMin})',1500)" class="mt-3 w-full text-left text-xs bg-violet-900 hover:bg-violet-800 border border-violet-500 text-violet-200 font-bold py-2 px-3 rounded-lg transition-colors">→ Commander (MIN recalculé : ${r.nouveauMin})</button>`:''}</div>`;
  // Buyers section — compute once, reuse for plan
  const buyers=_S.articleClients.get(code);
  let buyerList=[];
  if(buyers&&buyers.size){
    for(const cc of buyers){
      const caArt=((_S.ventesClientArticle.get(cc)||new Map()).get(code)||{}).sumCA||0;
      const lastDate=_S.clientLastOrder.get(cc)||null;
      const daysSince=lastDate?daysBetween(lastDate,_today):null;
      const nom=_S.clientNomLookup[cc]||(_S.chalandiseReady?_S.chalandiseData.get(cc)?.nom:null)||cc;
      let statusBadge='';
      if(_S.chalandiseReady){const info=_S.chalandiseData.get(cc);if(info){if(_isPDVActif(cc))statusBadge='<span class="diag-badge diag-ok">Actif PDV</span>';else if(_isGlobalActif(info))statusBadge='<span class="diag-badge diag-warn">Actif Leg</span>';else statusBadge='<span class="diag-badge diag-error">Perdu</span>';}}
      buyerList.push({cc,nom,caArt,daysSince,lastDate,statusBadge});
    }
    buyerList.sort((a,b)=>b.caArt-a.caArt);
  }
  let buyersHtml='';
  if(buyerList.length){
    const totalCA=buyerList.reduce((s,b)=>s+b.caArt,0);
    const rows=buyerList.slice(0,5).map(b=>`<tr class="border-t b-dark"><td class="py-1 px-2 font-mono text-[10px] t-disabled">${escapeHtml(b.cc)}</td><td class="py-1 px-2 text-xs">${escapeHtml(b.nom)}${_unikLink(b.cc)}${b.statusBadge?' '+b.statusBadge:''}</td><td class="py-1 px-2 text-right text-xs font-bold ${b.caArt>0?'c-ok':'t-tertiary'}">${b.caArt>0?formatEuro(b.caArt):'—'}</td><td class="py-1 px-2 text-center text-[10px] ${b.daysSince!==null&&b.daysSince>30?'c-danger':'t-disabled'}">${b.daysSince!==null?b.daysSince+'j':'—'}</td></tr>`).join('');
    buyersHtml=`<div class="diag-level mt-2"><div class="diag-level-hdr"><span class="font-bold text-sm">👥 Qui achète cet article ?</span><span class="t-disabled text-xs">${buyers.size} client${buyers.size>1?'s':''} · CA total ${formatEuro(totalCA)}</span></div><div class="overflow-x-auto"><table class="w-full text-xs"><thead class="t-tertiary text-[10px]"><tr><th class="py-1 px-2 text-left">Code</th><th class="py-1 px-2 text-left">Nom</th><th class="py-1 px-2 text-right">CA</th><th class="py-1 px-2 text-center">Dernière cmd</th></tr></thead><tbody>${rows}</tbody></table></div>${buyers.size>5?`<p class="text-[10px] t-tertiary mt-1.5">… et ${buyers.size-5} autres acheteurs</p>`:''}</div>`;
  }
  // Réseau section (multi only)
  let reseauHtml='';
  if(_S.storesIntersection.size>1&&_S.selectedMyStore){
    const cs=[..._S.storesIntersection];const myFreq=(_S.ventesParMagasin[_S.selectedMyStore]||{})[code]?.countBL||0;
    const freqs=cs.map(s=>(_S.ventesParMagasin[s]||{})[code]?.countBL||0).filter(v=>v>0);
    if(freqs.length>1){
      const med=_median(freqs);const nbAg=freqs.length;const rank=[...freqs].sort((a,b)=>b-a).findIndex(f=>f<=myFreq)+1;
      const rankCls=rank<=Math.ceil(nbAg/3)?'c-ok':rank<=Math.ceil(2*nbAg/3)?'c-caution':'c-danger';
      reseauHtml=`<div class="diag-level mt-2"><div class="diag-level-hdr"><span class="font-bold text-sm">🔭 Réseau (${nbAg} agences)</span></div><div class="grid grid-cols-3 gap-3 text-xs text-center"><div><p class="t-disabled mb-0.5">Ma fréquence</p><p class="font-extrabold text-lg">${myFreq}</p></div><div><p class="t-disabled mb-0.5">Médiane réseau</p><p class="font-extrabold text-lg ${myFreq>=med?'c-ok':'c-caution'}">${med.toFixed(0)}</p></div><div><p class="t-disabled mb-0.5">Mon rang</p><p class="font-extrabold text-lg ${rankCls}">#${rank}/${nbAg}</p></div></div></div>`;
    }
  }
  // Section Canaux
  let canalHtml='';
  if(_S.chalandiseReady&&(r.caHorsMagasin||0)>0){
    const caTot=(r.caAnnuel||0)+r.caHorsMagasin;
    const pctMag=caTot>0?Math.round((r.caAnnuel||0)/caTot*100):0;
    const pctWeb=caTot>0?Math.round(r.caWeb/caTot*100):0;
    const pctRep=caTot>0?Math.round(r.caRep/caTot*100):0;
    const pctDcs=caTot>0?Math.round(r.caDcs/caTot*100):0;
    const noteWeb=r.caWeb>(r.caAnnuel||0)
      ?`<p class="text-[10px] c-caution mt-1">Cet article est principalement acheté en ligne par vos clients (zone chalandise).</p>`:'';
    canalHtml=`<div class="mt-4 p-3 s-card-alt rounded-xl border">
      <p class="text-xs font-bold t-primary mb-2">Répartition des achats
        <span class="text-[10px] font-normal t-disabled ml-1" title="Source : clients de la zone de chalandise uniquement (${_S.chalandiseData?.size||0} clients analysés).">ⓘ</span>
      </p>
      <div class="space-y-1.5 text-[11px]">
        ${[['MAGASIN',r.caAnnuel||0,pctMag,'bg-blue-500'],['INTERNET',r.caWeb,pctWeb,'bg-violet-500'],['REPRÉSENTANT',r.caRep,pctRep,'bg-green-500'],['DCS',r.caDcs,pctDcs,'bg-orange-400']]
          .filter(([,ca])=>ca>0)
          .map(([label,ca,pct,color])=>`<div class="flex items-center gap-2">
            <span class="w-24 t-tertiary shrink-0">${label}</span>
            <div class="flex-1 bg-gray-200 rounded" style="height:8px">
              <div class="${color} rounded" style="width:${pct}%;height:8px"></div>
            </div>
            <span class="w-16 text-right font-bold">${formatEuro(ca)}</span>
            <span class="w-8 text-right t-disabled">${pct}%</span>
          </div>`).join('')}
      </div>
      ${noteWeb}
    </div>`;
  }
  // Plan d'action
  const acts=[];
  if(r.stockActuel<=0&&r.nouveauMin>0)acts.push(`<div class="diag-action-row"><span class="c-ok font-bold">1.</span><span class="flex-1 ml-2 text-sm">Commander — MIN recalculé : <strong>${r.nouveauMin}</strong></span><button onclick="navigator.clipboard.writeText('${code}').catch(()=>{})" class="diag-btn bg-violet-900 text-violet-200 border border-violet-500 text-[10px]">📋 Copier</button></div>`);
  const topBuyer=buyerList.find(b=>b.caArt>0);
  if(topBuyer&&topBuyer.daysSince!==null&&topBuyer.daysSince>30)acts.push(`<div class="diag-action-row"><span class="c-caution font-bold">${acts.length+1}.</span><span class="flex-1 ml-2 text-sm">Appeler <strong>${escapeHtml(topBuyer.nom)}</strong> — plus gros acheteur, <strong class="c-danger">${topBuyer.daysSince}j</strong> sans commande</span></div>`);
  if(_S.storesIntersection.size>1&&_S.selectedMyStore){const myF=(_S.ventesParMagasin[_S.selectedMyStore]||{})[code]?.countBL||0;const fr=[..._S.storesIntersection].map(s=>(_S.ventesParMagasin[s]||{})[code]?.countBL||0).filter(v=>v>0);if(fr.length>1&&myF<_median(fr)*0.7)acts.push(`<div class="diag-action-row"><span class="text-violet-300 font-bold">${acts.length+1}.</span><span class="flex-1 ml-2 text-sm">Vérifier visibilité rayon — fréquence <strong class="c-caution">${myF}</strong> vs médiane réseau <strong>${_median(fr).toFixed(0)}</strong></span></div>`);}
  const planHtml=acts.length?`<div class="diag-level mt-2"><div class="diag-level-hdr"><span class="font-bold text-sm">⚡ Plan d'action</span></div>${acts.join('')}</div>`:'';
  // Render
  panel.innerHTML=`<div class="flex items-center gap-2 mb-4"><button onclick="closeArticlePanel()" class="t-disabled hover:text-white text-sm font-semibold flex items-center gap-1">← Retour</button><div class="flex-1 mx-3"><div class="flex flex-wrap items-center gap-1.5 mb-0.5"><span class="font-mono t-disabled text-xs">${escapeHtml(r.code)}</span>${_copyCodeBtn(r.code)}${badges}</div><h2 class="font-extrabold text-base leading-tight">${escapeHtml(r.libelle)}</h2></div><button onclick="closeArticlePanel()" class="t-disabled hover:text-white text-xl leading-none font-bold">✕</button></div>${stockHtml}${buyersHtml}${canalHtml}${reseauHtml}${planHtml}`;
  overlay.classList.add('active');
}

// B3: Season ribbon helper
// C3: Sparklines SVG inline
function _sparkline(values,opts={}){
  const w=opts.width||80,h=opts.height||20;
  const max=Math.max(...values,1);
  const points=values.map((v,i)=>{const x=(i/(values.length-1))*w;const y=h-(v/max)*(h-2);return`${x.toFixed(1)},${y.toFixed(1)}`;}).join(' ');
  const lastVal=values[values.length-1]||0;
  const avgVal=values.reduce((s,v)=>s+v,0)/values.length;
  const trend=lastVal>avgVal*1.2?'c-ok':lastVal<avgVal*0.5?'c-danger':'c-caution';
  const arrow=lastVal>avgVal*1.2?'↗':lastVal<avgVal*0.5?'↘':'→';
  return`<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" class="inline-block align-middle" style="overflow:visible"><polyline points="${points}" fill="none" stroke="var(--c-action)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><circle cx="${w}" cy="${(h-(lastVal/max)*(h-2)).toFixed(1)}" r="2" fill="var(--c-action)"/></svg><span class="text-[9px] ${trend} ml-1">${arrow}</span>`;
}
function _articleSparkline(code){
  const months=_S.articleMonthlySales[code];
  if(!months||months.every(v=>v===0))return'';
  return`<span class="inline-flex items-center gap-1 ml-2" title="Ventes mensuelles (J→D)">${_sparkline(months)}</span>`;
}
function _familySparkline(famille){
  const idx=_S.seasonalIndex[famille];
  if(!idx)return'';
  return`<span class="inline-flex items-center gap-1 ml-2" title="Saisonnalité famille">${_sparkline(idx.map(c=>Math.round(c*100)))}</span>`;
}

function _seasonRibbon(famille){
  const idx=_S.seasonalIndex[famille];if(!idx)return'';
  const MONTHS=['J','F','M','A','M','J','J','A','S','O','N','D'];
  const cells=idx.map((coeff,i)=>{const bg=coeff>=1.5?'bg-emerald-500':coeff>=1.0?'bg-emerald-300':coeff>=0.5?'bg-amber-300':'bg-red-300';return`<div class="text-center" title="${MONTHS[i]}: ×${coeff}"><div class="text-[8px] t-disabled">${MONTHS[i]}</div><div class="w-5 h-3 rounded-sm ${bg}" style="opacity:${Math.max(0.3,Math.min(1,coeff))}"></div></div>`;}).join('');
  return`<div class="flex gap-0.5 items-end mt-1" title="Saisonnalité famille">${cells}</div>`;
}

// ── BANDEAU SYNTHÈSE "3 CHIFFRES" (Action 1 — Codex P1) ──
function _diagRenderSummaryBar(v1,v2,v3){
  const cards=[];
  // Card 1 : CA perdu ruptures (toujours, sauf absent)
  if(v1&&v1.status!=='absent'){
    const ca=v1.caPerduTotal||0;const nbRup=v1.ruptures?.length||0;
    const col=ca>=1000?'c-danger':ca>0?'c-caution':'c-ok';
    cards.push(`<div class="flex-1 p-3 rounded-xl s-panel-inner border b-dark min-w-0">
      <p class="text-[10px] t-inverse-muted uppercase tracking-wide truncate">CA perdu ruptures</p>
      <p class="text-lg font-extrabold ${col}">${ca>0?formatEuro(ca):'—'}</p>
      <p class="text-[10px] t-inverse-muted">${nbRup>0?nbRup+' article'+(nbRup>1?'s':'')+' en rupture':'Pas de rupture active'}</p>
    </div>`);
  }
  // Card 2 : Clients perdus (chalandise chargée)
  if(v2&&v2.status!=='lock'){
    const nb=v2.perdus||0;const pot=v2.potentiel||0;
    const col=nb>0?'c-caution':'c-ok';
    cards.push(`<div class="flex-1 p-3 rounded-xl s-panel-inner border b-dark min-w-0">
      <p class="text-[10px] t-inverse-muted uppercase tracking-wide truncate">Clients perdus</p>
      <p class="text-lg font-extrabold ${col}">${nb>0?nb:'—'}</p>
      <p class="text-[10px] t-inverse-muted">${pot>0?'potentiel '+formatEuro(pot):nb===0?'Base client saine':'à reconquérir'}</p>
    </div>`);
  }
  // Card 3 : Absents réseau (multi-agences)
  if(v3&&v3.status!=='lock'){
    const nb=v3.missing?.length||0;const strong=v3.strongMissing||0;
    const col=nb>5?'c-danger':nb>0?'c-caution':'c-ok';
    cards.push(`<div class="flex-1 p-3 rounded-xl s-panel-inner border b-dark min-w-0">
      <p class="text-[10px] t-inverse-muted uppercase tracking-wide truncate">Absents réseau</p>
      <p class="text-lg font-extrabold ${col}">${nb>0?nb:'—'}</p>
      <p class="text-[10px] t-inverse-muted">${strong>0?'dont '+strong+' forte rotation':nb===0?'Gamme complète':'à référencer'}</p>
    </div>`);
  }
  if(!cards.length)return'';
  const v1ok=!v1||v1.status==='absent'||(v1.caPerduTotal===0&&v1.nbMM===0);
  const v2ok=!v2||v2.status==='lock'||(v2.perdus||0)===0;
  const v3ok=!v3||v3.status==='lock'||(v3.missing?.length||0)===0;
  if(v1ok&&v2ok&&v3ok)return`<div class="flex gap-2 mb-4 p-3 rounded-xl s-panel-inner border border-emerald-700/50 items-center"><span>✅</span><p class="text-xs c-ok font-semibold">Famille bien pilotée — aucune action urgente.</p></div>`;
  return`<div class="flex gap-3 mb-4">${cards.join('')}</div>`;
}
function _diagRenderSummaryBarMetier(l1,l4,l3){
  const cards=[];
  if(l1&&l1.arts>0){
    const ca=l1.caPerduTotal||0;const nbRup=l1.ruptures?.length||0;
    const col=ca>=1000?'c-danger':ca>0?'c-caution':'c-ok';
    cards.push(`<div class="flex-1 p-3 rounded-xl s-panel-inner border b-dark min-w-0">
      <p class="text-[10px] t-inverse-muted uppercase tracking-wide truncate">CA perdu ruptures</p>
      <p class="text-lg font-extrabold ${col}">${ca>0?formatEuro(ca):'—'}</p>
      <p class="text-[10px] t-inverse-muted">${nbRup>0?nbRup+' rupture'+(nbRup>1?'s':''):'Pas de rupture'}</p>
    </div>`);
  }
  if(l4&&l4.status!=='lock'){
    const nb=l4.perdus||0;const pot=l4.potentiel||0;
    const col=nb>0?'c-caution':'c-ok';
    cards.push(`<div class="flex-1 p-3 rounded-xl s-panel-inner border b-dark min-w-0">
      <p class="text-[10px] t-inverse-muted uppercase tracking-wide truncate">Clients perdus</p>
      <p class="text-lg font-extrabold ${col}">${nb>0?nb:'—'}</p>
      <p class="text-[10px] t-inverse-muted">${pot>0?'potentiel '+formatEuro(pot):nb===0?'Base client saine':'à reconquérir'}</p>
    </div>`);
  }
  if(l3&&l3.status!=='lock'&&l3.pct!=null){
    const pct=l3.pct;const col=pct>=70?'c-ok':pct>=40?'c-caution':'c-danger';
    cards.push(`<div class="flex-1 p-3 rounded-xl s-panel-inner border b-dark min-w-0">
      <p class="text-[10px] t-inverse-muted uppercase tracking-wide truncate">Couverture rayon</p>
      <p class="text-lg font-extrabold ${col}">${pct}%</p>
      <p class="text-[10px] t-inverse-muted">${l3.totalEnStock||0}/${l3.totalArts||0} articles en stock</p>
    </div>`);
  }
  if(!cards.length)return'';
  const allOk=(!l1||(l1.caPerduTotal||0)===0)&&(!l4||l4.status==='lock'||(l4.perdus||0)===0)&&(!l3||l3.status==='lock'||(l3.pct||0)>=70);
  if(allOk)return`<div class="flex gap-2 mb-4 p-3 rounded-xl s-panel-inner border border-emerald-700/50 items-center"><span>✅</span><p class="text-xs c-ok font-semibold">Métier bien couvert — aucune action urgente.</p></div>`;
  return`<div class="flex gap-3 mb-4">${cards.join('')}</div>`;
}

function renderDiagnosticPanel(famille,source){
  const panel=document.getElementById('diagnosticPanel');if(!panel)return;
  const isMetierMode=famille.startsWith('@metier:');
  const metier=isMetierMode?famille.slice(8):'';
  if(!isMetierMode){try{famille=decodeURIComponent(famille);}catch(e){/* already plain string */}}
  const hasMulti=_S.storesIntersection.size>1;
  const hasChal=_S.chalandiseReady;
  const srcLabel=source==='bench'?'Retour à Le Réseau':source==='cockpit'?'Retour au Cockpit':source==='abc'?'Retour au Radar':source==='territoire'?'Retour au Terrain':source==='stock'?'Retour au Stock':'Retour';
  const srcTab=source==='bench'?'bench':source==='cockpit'?'action':source==='abc'?'abc':source==='territoire'?'territoire':'dash';
  const agenceLabel=_S.selectedMyStore||'Votre agence';
  const nbAgences=_S.storesIntersection.size;
  const agenceCtxHtml=`<p class="text-xs text-cyan-300 font-semibold mt-1">🏪 ${agenceLabel}${hasMulti?` <span class="t-inverse-muted font-normal">(${nbAgences} agences chargées)</span>`:'<span class="t-inverse-muted font-normal"> (mono-agence)</span>'}</p>`;
  const filesHtml=[
    `<span class="c-ok">✅ Ventes</span>`,
    `<span class="c-ok">✅ Stock</span>`,
    hasMulti?`<span class="c-ok">✅ ${nbAgences} agences</span>`:`<span class="t-inverse-muted">❌ 1 agence</span>`,
    hasChal?`<span class="c-ok">✅ Chalandise</span>`:`<span class="t-inverse-muted">❌ Chalandise</span>`,
  ].join('<span class="t-secondary mx-1">·</span>');
  let v1,v2,v3,actions,titleHtml;
  if(isMetierMode){
    const l1m=_diagLevel1Metier(metier);
    const l2m=_diagLevel2Metier(l1m.topArts||[]);
    const l3m=_diagLevel3Metier(metier);
    const l4m=_diagLevel4MetierMode(metier,hasChal);
    _S._diagLevels={l1:l1m,l2:l2m,l3:l3m,l4:l4m};
    actions=_S._diagActions=_diagGenActionsMetier(metier,l1m,l2m,l3m,l4m);
    titleHtml=`🔍 Diagnostic : <span class="c-danger">${metier}</span>`;
    panel.innerHTML=`
      <div class="flex items-start justify-between mb-5">
        <div>
          <button onclick="switchTab('${srcTab}');closeDiagnostic()" class="text-[11px] t-inverse-muted hover:text-white mb-2 flex items-center gap-1">← ${srcLabel}</button>
          <h2 class="text-xl font-extrabold text-white">${titleHtml}</h2>
          ${agenceCtxHtml}
          <p class="text-[10px] t-inverse-muted mt-1 flex flex-wrap gap-1">Fichiers disponibles : ${filesHtml}</p>
        </div>
        <button onclick="closeDiagnostic()" class="t-inverse-muted hover:text-white text-3xl font-light leading-none ml-4 flex-shrink-0">✕</button>
      </div>
      ${_diagRenderSummaryBarMetier(l1m,l4m,l3m)}
      <div id="_diagPlan">${_diagRenderPlan(metier,actions)}</div>
      ${_diagRenderL1Metier(l1m)}
      ${_diagRenderL2(l2m,false,'')}
      <div id="_diagL4">${_diagRenderL4(l4m,hasChal)}</div>
      ${_diagRenderL3Metier(l3m)}`;
    return;
  }
  // ── 3-voyant mode ──
  v1=_diagVoyant1(famille);
  v2=_diagVoyant2(famille,hasChal,_S._diagMetierFilter);
  v3=_diagVoyant3(famille,hasMulti);
  _S._diagLevels={v1,v2,v3};
  actions=_S._diagActions=_diagGenActions(famille,v1,v2,v3);
  titleHtml=`🔍 Diagnostic : <span class="text-cyan-400">${famille}</span>`;
  panel.innerHTML=`
    <div class="flex items-start justify-between mb-5">
      <div>
        <button onclick="switchTab('${srcTab}');closeDiagnostic()" class="text-[11px] t-inverse-muted hover:text-white mb-2 flex items-center gap-1">← ${srcLabel}</button>
        <h2 class="text-xl font-extrabold text-white">${titleHtml}</h2>
        <div class="flex items-center gap-3 mt-1">${_seasonRibbon(famille)}${_familySparkline(famille)}</div>
        ${agenceCtxHtml}
        <p class="text-[10px] t-inverse-muted mt-1 flex flex-wrap gap-1">Fichiers disponibles : ${filesHtml}</p>
      </div>
      <button onclick="closeDiagnostic()" class="t-inverse-muted hover:text-white text-3xl font-light leading-none ml-4 flex-shrink-0">✕</button>
    </div>
    ${_diagRenderSummaryBar(v1,v2,v3)}
    <div id="_diagPlan">${_diagRenderPlan(famille,actions)}</div>
    ${_diagRenderV1(v1,hasMulti&&v3&&v3.status!=='lock'&&(v3.medCA>0||v3.missing?.length>0))}
    ${_diagRenderV2(v2,hasChal)}
    ${_diagRenderV3(v3,hasMulti)}`;
}

function _renderDiagnosticCellPanel(key,cellArts){
  const panel=document.getElementById('diagnosticPanel');if(!panel)return;
  const LABELS={AF:'Vos pépites',AM:'Surveiller',AR:'Gros paniers',BF:'Confort',BM:'Standard',BR:'Questionner',CF:'Réguliers',CM:'Réduire',CR:'Déréférencer'};
  const hasMulti=_S.storesIntersection.size>1;
  const hasChal=_S.chalandiseReady;
  const agenceLabel=_S.selectedMyStore||'Votre agence';
  const nbAgences=_S.storesIntersection.size;
  const agenceCtxHtml=`<p class="text-xs text-cyan-300 font-semibold mt-1">🏪 ${agenceLabel}${hasMulti?` <span class="t-inverse-muted font-normal">(${nbAgences} agences chargées)</span>`:'<span class="t-inverse-muted font-normal"> (mono-agence)</span>'}</p>`;
  const filesHtml=[`<span class="c-ok">✅ Ventes</span>`,`<span class="c-ok">✅ Stock</span>`,hasMulti?`<span class="c-ok">✅ ${nbAgences} agences</span>`:`<span class="t-inverse-muted">❌ 1 agence</span>`,hasChal?`<span class="c-ok">✅ Chalandise</span>`:`<span class="t-inverse-muted">❌ Chalandise</span>`].join('<span class="t-secondary mx-1">·</span>');
  // V1 — Mon Rayon (computed inline for cell articles)
  let caPerduTotal=0;
  const enStock=cellArts.filter(r=>r.stockActuel>0).length;
  const nonRef=cellArts.filter(r=>r.stockActuel<=0&&r.W<3).length;
  const ruptures=cellArts.filter(r=>r.W>=3&&r.stockActuel<=0&&!r.isParent).map(r=>{
    const jours=Math.min(r.ageJours>=999?90:r.ageJours,90);
    const ca=estimerCAPerdu(r.V,r.prixUnitaire,jours);caPerduTotal+=ca;
    return{code:r.code,lib:r.libelle,W:r.W,jours,ca};
  }).sort((a,b)=>b.ca-a.ca);
  const activeArts=cellArts.filter(r=>r.W>=1);
  const nonCal=activeArts.filter(r=>r.ancienMin===0&&r.ancienMax===0&&!r.isNouveaute);
  const sousD=activeArts.filter(r=>r.ancienMin>0&&r.nouveauMin>r.ancienMin);
  const mmDetail=sousD.map(r=>({code:r.code,lib:r.libelle,ancienMin:r.ancienMin,nouveauMin:r.nouveauMin,ecart:r.nouveauMin-r.ancienMin,myFreq:r.W})).sort((a,b)=>b.ecart-a.ecart);
  const nbMM=nonCal.length+sousD.length;
  const dormants=cellArts.filter(r=>r.stockActuel>0&&r.W<=1&&r.ancienMin>0&&!r.isNouveaute);
  const statusRup=ruptures.length===0?'ok':caPerduTotal>=1000?'error':'warn';
  const statusMM=nbMM===0?'ok':nbMM>5?'error':'warn';
  const v1={status:[statusRup,statusMM].includes('error')?'error':[statusRup,statusMM].includes('warn')?'warn':'ok',arts:cellArts.length,enStock,nonRef,ruptures,caPerduTotal,nonCal:nonCal.length,sousD:sousD.length,mmDetail,nbMM,dormants,statusRup,statusMM};
  // V2 — Mes Clients (chalandise, croisée avec les acheteurs des articles de la case)
  let v2;
  if(hasChal){
    const famArts=new Set(cellArts.map(r=>r.code));
    const cellFamSet=new Set(cellArts.map(r=>r.famille).filter(Boolean));
    const metierBuyers={};
    for(const artCode of famArts){const buyers=_S.articleClients.get(artCode);if(!buyers)continue;for(const cc of buyers){const info=_S.chalandiseData.get(cc);if(!info||!info.metier)continue;if(!metierBuyers[info.metier])metierBuyers[info.metier]=new Set();metierBuyers[info.metier].add(cc);}}
    const totalBuyers=Object.values(metierBuyers).reduce((s,set)=>s+set.size,0);
    if(!totalBuyers){v2={status:'warn',reason:'Aucun client identifié dans la chalandise pour ces articles',metiers:[],perdus:0,potentiel:0,cellMode:true,cellKey:key,nbArts:cellArts.length};}
    else{
      const top3=Object.entries(metierBuyers).sort((a,b)=>b[1].size-a[1].size).slice(0,3);
      const metiers=top3.map(([metier,buyerSet])=>{
        const pct=Math.round(buyerSet.size/totalBuyers*100);
        // Actifs : uniquement les clients qui achètent des articles de la case
        const actifClients=[];
        for(const cc of buyerSet){const info=_S.chalandiseData.get(cc);if(!info)continue;const myData=_S.ventesClientArticle.get(cc);const famCA=myData?[...myData.entries()].filter(([c])=>famArts.has(c)).reduce((s,[,d])=>s+d.sumPrelevee,0):0;actifClients.push({code:cc,nom:info.nom||'',statut:info.statut||'',ca2025:info.ca2025||0,famCA});}
        actifClients.sort((a,b)=>b.famCA-a.famCA||b.ca2025-a.ca2025);
        const caActifs=actifClients.reduce((s,c)=>s+c.famCA,0);
        // Perdus pertinents (reconquête) vs Prospects métier (conquête)
        let pertinentPerdus=0,prospectMetier=0,potentiel=0;
        for(const[cc,info] of _S.chalandiseData.entries()){if(info.metier!==metier||buyerSet.has(cc))continue;const clientData=_S.ventesClientArticle.get(cc);const hasHistory=clientData&&[...clientData.keys()].some(artCode=>{const artFam=_S.articleFamille[artCode];return artFam&&cellFamSet.has(artFam);});if(hasHistory){pertinentPerdus++;potentiel+=clientData?[...clientData.entries()].filter(([c])=>{const f=_S.articleFamille[c];return f&&cellFamSet.has(f);}).reduce((s,[,d])=>s+d.sumPrelevee,0):Math.round((info.ca2025||0)*0.05);}else{prospectMetier++;}}
        return{metier,pct,total:buyerSet.size,actifs:actifClients.filter(c=>c.famCA>0).length,caActifs,perdus:pertinentPerdus,prospects:prospectMetier,potentiel,clients:actifClients};
      });
      const totalPerdus=metiers.reduce((s,m)=>s+m.perdus,0);
      const totalProspects=metiers.reduce((s,m)=>s+(m.prospects||0),0);
      const totalPotentiel=metiers.reduce((s,m)=>s+m.potentiel,0);
      v2={status:totalPerdus>0?'warn':'ok',totalBuyers,metiers,perdus:totalPerdus,prospects:totalProspects,potentiel:totalPotentiel,cellMode:true,cellKey:key,nbArts:cellArts.length};
    }
  }else{v2={status:'lock',reason:'Chargez la Zone de Chalandise pour activer l\'analyse clients'};}
  // V3 — Le Réseau (median across stores, aggregated across cell families)
  let v3;
  if(hasMulti){
    const cellFamSet=new Set(cellArts.map(r=>r.famille).filter(Boolean));
    const myArtSet=new Set(_S.finalData.filter(r=>r.W>=1).map(r=>r.code));
    const artStoreFreqs={};const artStorePrelevee={};const storeRefCounts=[];
    const nbOtherStores=_S.storesIntersection.size-1;
    for(const store of _S.storesIntersection){
      if(store===_S.selectedMyStore)continue;
      const sv=_S.ventesParMagasin[store]||{};let cnt=0;
      for(const[code,sv2] of Object.entries(sv)){if(!cellFamSet.has(_S.articleFamille[code]))continue;if((sv2.countBL||0)>0)cnt++;if(!artStoreFreqs[code])artStoreFreqs[code]=[];artStoreFreqs[code].push(sv2.countBL||0);if(!artStorePrelevee[code])artStorePrelevee[code]=[];artStorePrelevee[code].push({sumPrelevee:sv2.sumPrelevee||0,countBL:sv2.countBL||0});}
      if(cnt>0)storeRefCounts.push(cnt);
    }
    const refMedian=storeRefCounts.length?Math.round(_median(storeRefCounts)):0;
    const missing=[],inStockNotSold=[];
    for(const[code,freqs] of Object.entries(artStoreFreqs)){if(myArtSet.has(code))continue;const medFreq=_median(freqs);if(medFreq<2)continue;const lib=_S.libelleLookup[code]||code;const d=_S.finalData.find(r=>r.code===code);const networkFmr=medFreq>=12?'F':medFreq>=4?'M':'R';const spa=artStorePrelevee[code]||[];let precoMin=0,precoMax=0,precoStores=0;if(spa.length>0){const mp=_median(spa.map(s=>s.sumPrelevee));const mf=_median(spa.map(s=>s.countBL));const U=mf>0?mp/mf:0;const X=mp/_S.globalJoursOuvres;const maxCmd=Math.max(...spa.filter(s=>s.countBL>0).map(s=>s.sumPrelevee/s.countBL),0);const dlR=maxCmd>3*U?3*U:maxCmd;const dl=Math.min(dlR,U*5);const secDays=mf>=12?4:mf>=4?3:2;precoMin=Math.max(Math.round(dl+X*secDays),1);precoMax=Math.max(Math.round(precoMin+X*(mf>12?21:10)),precoMin+1);precoStores=spa.length;}const entry={code,lib,medFreq:Math.round(medFreq*10)/10,nbStores:freqs.length,abcClass:d?.abcClass||'?',fmrClass:d?.fmrClass||'?',networkFmr,precoMin,precoMax,precoStores};if((d?.stockActuel??0)>0)inStockNotSold.push({...entry,stockActuel:d.stockActuel});else missing.push(entry);}
    missing.sort((a,b)=>b.nbStores-a.nbStores||b.medFreq-a.medFreq);
    const strong=missing.filter(a=>a.networkFmr==='F'||a.networkFmr==='M').length;
    v3={status:missing.length===0?'ok':strong>2?'error':'warn',myCount:cellArts.length,reseauCount:cellArts.length+missing.length,missing:missing.slice(0,25),inStockNotSold:inStockNotSold.slice(0,15),strongMissing:strong,nbOtherStores,exclusives:[],myCA:0,medCA:0,caEcart:0,isCellMode:true,refMedian,cellKey:key};
  }else{v3={status:'lock',reason:'Données multi-agences requises',missing:[],exclusives:[],myCA:0,medCA:0,caEcart:0,isCellMode:true,refMedian:0};}
  _S._diagLevels={v1,v2,v3};
  const acts=[];
  if(ruptures.length>0){const caLabel=caPerduTotal>0?formatEuro(caPerduTotal):formatEuro(ruptures.reduce((s,r)=>s+Math.round(r.W*(r.ca||0)),0))+' potentiel';acts.push({priority:1,src:'📦',codes:ruptures.map(r=>r.code),label:`Réassort ${ruptures.length} rupture${ruptures.length>1?'s':''} — CA récupérable : ${caLabel}`,fn:()=>{closeDiagnostic();document.getElementById('filterABC').value=key[0];document.getElementById('filterFMR').value=key[1];document.getElementById('filterCockpit').value='ruptures';document.getElementById('activeCockpitLabel').textContent='🚨 Ruptures';document.getElementById('activeCockpitFilter').classList.remove('hidden');_S.currentPage=0;switchTab('table');renderAll();}});}
  if(nbMM>0&&statusMM!=='ok'){const top5=mmDetail.slice(0,5);acts.push({priority:2,src:'📦',label:`Recalibrer MIN/MAX — ${nbMM} articles : ${top5.map(r=>r.code+' '+r.ancienMin+'→'+r.nouveauMin).join(' · ')}`,fn:()=>{closeDiagnostic();document.getElementById('filterABC').value=key[0];document.getElementById('filterFMR').value=key[1];clearCockpitFilter(true);_S.currentPage=0;switchTab('table');renderAll();}});}
  if(v2.status!=='lock'&&(v2.perdus>0||(v2.prospects||0)>0)){const cliLabel=v2.perdus>0?`${v2.perdus} perdu${v2.perdus>1?'s':''} avec historique`:`${v2.prospects} prospect${v2.prospects>1?'s':''} métier`;const potLabel=v2.potentiel>0?' — potentiel '+formatEuro(v2.potentiel):'';acts.push({priority:3,src:'👥',label:`Démarcher ${cliLabel}${potLabel}`,fn:()=>{closeDiagnostic();window.scrollTo(0,0);const _mc366=document.getElementById('mainContent');if(_mc366){_mc366.style.overflow='';_mc366.scrollTop=0;}switchTab('territoire');let _lt366=-1,_tr366=0;const _pv366=setInterval(()=>{const mc=document.getElementById('mainContent');const el=document.getElementById('terrCockpitClient');if(!mc||!el){if(++_tr366>40)clearInterval(_pv366);return;}let e=el,t=0;while(e&&e!==mc){t+=e.offsetTop;e=e.offsetParent;}if((t===_lt366&&t>0)||_tr366++>40){clearInterval(_pv366);window.scrollTo(0,0);mc.scrollTo({top:t-16,behavior:'smooth'});if(!el.classList.contains('hidden')){const b=document.createElement('div');b.className='mb-3 px-3 py-2 bg-cyan-950 border border-cyan-700 rounded-lg text-[11px] text-cyan-200 font-semibold flex items-center gap-2';b.innerHTML=`<span class="flex-1">🔍 Diagnostic <strong>${key}</strong> — ${cliLabel}${potLabel} · Voir <strong>🟠 À Développer</strong> ci-dessous</span><button onclick="this.parentElement.remove()" class="text-cyan-400 hover:text-white shrink-0 text-sm font-bold">✕</button>`;el.insertBefore(b,el.firstChild);}}else _lt366=t;},100);}});}
  if(v3.status!=='lock'&&v3.missing&&v3.missing.length>0){const displayedStrong=v3.missing.filter(a=>a.networkFmr==='F'||a.networkFmr==='M').length;const strongLabel=displayedStrong>0?` — dont ${displayedStrong} en forte rotation réseau (F/M)`:'';acts.push({priority:4,src:'🔭',codes:v3.missing.map(a=>a.code),label:`Référencer ${v3.missing.length} article${v3.missing.length>1?'s':''} vendus par le réseau — Stock préco. disponible${strongLabel}`,fn:()=>{document.querySelector('#diagnosticOverlay .diag-v3')?.scrollIntoView({behavior:'smooth',block:'start'});}});}
  _S._diagActions=acts.sort((a,b)=>a.priority-b.priority).slice(0,4);
  const titleHtml=`🔍 Diagnostic : <span class="text-cyan-400">${key}</span> — <span class="c-caution">${LABELS[key]||key}</span> <span class="t-inverse-muted font-normal text-sm">(${cellArts.length} articles)</span>`;
  panel.innerHTML=`
    <div class="flex items-start justify-between mb-5">
      <div>
        <button onclick="switchTab('abc');closeDiagnostic()" class="text-[11px] t-inverse-muted hover:text-white mb-2 flex items-center gap-1">← Retour au Radar</button>
        <h2 class="text-xl font-extrabold text-white">${titleHtml}</h2>
        ${agenceCtxHtml}
        <p class="text-[10px] t-inverse-muted mt-1 flex flex-wrap gap-1">Fichiers disponibles : ${filesHtml}</p>
      </div>
      <button onclick="closeDiagnostic()" class="t-inverse-muted hover:text-white text-3xl font-light leading-none ml-4 flex-shrink-0">✕</button>
    </div>
    ${_diagRenderSummaryBar(v1,v2,v3)}
    <div id="_diagPlan">${_diagRenderPlan(key,_S._diagActions)}</div>
    ${_diagRenderV1(v1,hasMulti&&v3&&v3.status!=='lock'&&(v3.medCA>0||v3.missing?.length>0))}
    ${_diagRenderV2(v2,hasChal)}
    ${_diagRenderV3(v3,hasMulti)}`;
}

function _diagBadge(s){
  const m={ok:{cls:'diag-ok',txt:'✅ Bon'},warn:{cls:'diag-warn',txt:'⚠️ À corriger'},error:{cls:'diag-error',txt:'🔴 Problème'},lock:{cls:'diag-lock',txt:'🔒 Non disponible'},absent:{cls:'diag-lock',txt:'⚪ Absent'},na:{cls:'diag-lock',txt:'⚪ Non applicable'}};
  const d=m[s]||m.lock;return`<span class="diag-badge ${d.cls}">${d.txt}</span>`;
}

// ── VOYANT 1 : 📦 MON RAYON (toujours actif) ──
function _diagVoyant1(famille){
  const arts=_S.finalData.filter(r=>famLib(r.famille)===famille);
  if(!arts.length)return{status:'absent',arts:0,enStock:0,nonRef:0,ruptures:[],caPerduTotal:0,nbMM:0,dormants:[],mmDetail:[],nonCal:0,sousD:0,statusRup:'ok',statusMM:'ok'};
  // Stock / ruptures
  const enStock=arts.filter(r=>r.stockActuel>0).length;
  const nonRef=arts.filter(r=>r.stockActuel<=0&&r.W<3).length;
  let caPerduTotal=0;
  const ruptures=arts.filter(r=>r.W>=3&&r.stockActuel<=0&&!r.isParent).map(r=>{
    const jours=Math.min(r.ageJours>=999?90:r.ageJours,90);
    const ca=estimerCAPerdu(r.V,r.prixUnitaire,jours);
    caPerduTotal+=ca;return{code:r.code,lib:r.libelle,W:r.W,jours,ca};
  }).sort((a,b)=>b.ca-a.ca);
  // Calibrage MIN/MAX
  const activeArts=arts.filter(r=>r.W>=1);
  const nonCal=activeArts.filter(r=>r.ancienMin===0&&r.ancienMax===0&&!r.isNouveaute);
  const sousD=activeArts.filter(r=>r.ancienMin>0&&r.nouveauMin>r.ancienMin);
  const mmDetail=sousD.map(r=>({code:r.code,lib:r.libelle,ancienMin:r.ancienMin,nouveauMin:r.nouveauMin,ecart:r.nouveauMin-r.ancienMin,myFreq:r.W})).sort((a,b)=>b.ecart-a.ecart);
  const nbMM=nonCal.length+sousD.length;
  // Dormants : en stock mais pas vendu depuis longtemps (W<=1 et stock>0 et ancienMin>0)
  const dormants=arts.filter(r=>r.stockActuel>0&&r.W<=1&&r.ancienMin>0&&!r.isNouveaute);
  const statusRup=ruptures.length===0?'ok':caPerduTotal>=1000?'error':'warn';
  const statusMM=nbMM===0?'ok':nbMM>5?'error':'warn';
  const statusDorm=dormants.length===0?'ok':dormants.length>5?'warn':'ok';
  const worstStatus=[statusRup,statusMM,statusDorm].includes('error')?'error':[statusRup,statusMM,statusDorm].includes('warn')?'warn':'ok';
  return{status:worstStatus,arts:arts.length,enStock,nonRef,ruptures,caPerduTotal,nonCal:nonCal.length,sousD:sousD.length,mmDetail,nbMM,dormants,statusRup,statusMM};
}
function _diagRenderV1(v,hasNetworkData){
  if(v.status==='absent')return`<div class="diag-voyant diag-v1 diag-border-lock"><div class="diag-voyant-hdr"><span class="font-extrabold text-sm c-action">📦 Mon Agence</span>${_diagBadge('absent')}</div><p class="text-xs t-inverse-muted mt-1">Vous ne stockez aucun article dans cette famille.</p>${hasNetworkData?'<p class="text-[10px] c-ok mt-1">→ Consultez Le Réseau ci-dessous — d\'autres agences vendent dans cette famille.</p>':''}</div>`;
  const rupIcon=v.ruptures.length===0?'✅':v.ruptures.length<=3?'⚠️':'🚨';
  const rupClass=v.ruptures.length===0?'c-ok':v.ruptures.length<=3?'c-caution':'c-danger';
  const _gap347=v.arts-v.enStock;
  const rupText=v.ruptures.length===0?(_gap347>0?`Pas de rupture active · ${_gap347} article${_gap347>1?'s':''} sans stock exclu${_gap347>1?'s':''} du comptage (référence père, colis-only, ou fréquence < 3)`:'Pas de rupture sur cette famille'):`${v.ruptures.length} rupture${v.ruptures.length>1?'s':''} — CA perdu estimé : <strong>${v.caPerduTotal>0?formatEuro(v.caPerduTotal):'<1€'}</strong>`;
  const top5=v.ruptures.slice(0,5);
  const actionLabel=r=>r.jours>=25?'vérifier si déréférencé':'commander';
  const mmIcon=v.nbMM===0?'✅':v.nbMM<=5?'⚠️':'🚨';
  const mmClass=v.nbMM===0?'c-ok':v.nbMM<=5?'c-caution':'c-danger';
  const mmText=v.nbMM===0?'Calibrage correct — tous les articles actifs ont un MIN/MAX bien dimensionné':`${v.nbMM} article${v.nbMM>1?'s':''} mal calibré${v.nbMM>1?'s':''}${v.nonCal>0?' (dont '+v.nonCal+' sans MIN/MAX)':''}`;
  const top5MM=v.mmDetail.slice(0,5);
  const dormHtml=v.dormants.length>0?`<p class="text-[11px] c-caution mt-1">💤 <strong>${v.dormants.length}</strong> article${v.dormants.length>1?'s':''} en stock sans vente récente (dormants) → envisager déstockage</p>`:'';
  return`<div class="diag-voyant diag-v1 diag-border-${v.status}">
    <div class="diag-voyant-hdr"><span class="font-extrabold text-sm c-action">📦 Mon Agence</span>${_diagBadge(v.status)}</div>
    <p class="text-[10px] t-inverse-muted mb-3"><strong class="text-white">${v.arts}</strong> articles · <strong class="text-white">${v.enStock}</strong> en stock${v.nonRef>0?' · <span class="t-inverse-muted">'+v.nonRef+' non référencés</span>':''}</p>
    <p class="text-xs ${rupClass} font-bold mb-1">${rupIcon} ${rupText}</p>
    ${top5.length?`<details${v.statusRup==='error'?' open':''}><summary class="text-[10px] ${rupClass} font-bold cursor-pointer mb-1 list-none">🚨 ${v.ruptures.length} rupture${v.ruptures.length>1?'s':''} — détails ▾</summary><div class="mb-2">${top5.map(r=>`<div class="flex items-start gap-2 py-1 px-2 mb-0.5 rounded s-panel-inner/60 text-[11px]"><span class="t-inverse-muted">·</span><span class="flex-1"><span class="font-mono t-inverse-muted">${r.code}</span> <span class="text-white font-semibold">${r.lib}</span> — Fréq ${r.W}, rupture ${r.jours}j → <span class="font-bold ${r.jours>=25?'c-caution':'text-cyan-400'}">${actionLabel(r)}</span>${r.ca>0?' <span class="c-danger text-[10px]">('+formatEuro(r.ca)+')</span>':''}</span></div>`).join('')}${v.ruptures.length>5?`<p class="text-[10px] t-inverse-muted ml-4">… et ${v.ruptures.length-5} autre${v.ruptures.length-5>1?'s':''}</p>`:''}</div></details>`:''}
    <p class="text-xs ${mmClass} font-bold mb-1 mt-2">${mmIcon} ${mmText}</p>
    ${top5MM.length?`<details><summary class="text-[10px] ${mmClass} font-bold cursor-pointer mb-1 list-none">⚠️ ${v.nbMM} article${v.nbMM>1?'s':''} mal calibré${v.nbMM>1?'s':''} — détails ▾</summary><div class="mb-1">${top5MM.map(r=>`<div class="flex items-start gap-2 py-0.5 px-2 mb-0.5 rounded s-panel-inner/60 text-[11px]"><span class="t-inverse-muted">·</span><span class="flex-1"><span class="font-mono t-inverse-muted">${r.code}</span> ${r.lib} — MIN <span class="c-caution">${r.ancienMin}</span> → <span class="c-ok font-bold">${r.nouveauMin}</span> <span class="c-danger text-[10px]">(+${r.ecart})</span></span></div>`).join('')}${v.mmDetail.length>5?`<p class="text-[10px] t-inverse-muted ml-4">… et ${v.mmDetail.length-5} autre${v.mmDetail.length-5>1?'s':''}</p>`:''}</div></details>`:''}
    ${dormHtml}
  </div>`;
}

// ── Level 1: Stock (kept for métier mode) ──
function _diagLevel1(famille){
  const arts=_S.finalData.filter(r=>r.famille===famille);
  const enStock=arts.filter(r=>r.stockActuel>0).length;
  const nonRef=arts.filter(r=>r.stockActuel<=0&&r.W<3).length;
  let caPerduTotal=0;
  const ruptures=arts.filter(r=>r.W>=3&&r.stockActuel<=0&&!r.isParent).map(r=>{
    const jours=Math.min(r.ageJours>=999?90:r.ageJours,90);
    const ca=estimerCAPerdu(r.V,r.prixUnitaire,jours);
    caPerduTotal+=ca;
    return{code:r.code,lib:r.libelle,W:r.W,jours,ca};
  }).sort((a,b)=>b.ca-a.ca);
  const status=ruptures.length===0?'ok':caPerduTotal>=1000?'error':'warn';
  return{arts:arts.length,enStock,nonRef,ruptures,caPerduTotal,status};
}
function _diagRenderL1(l){
  const verdictClass=l.ruptures.length===0?'c-ok':l.ruptures.length<=3?'c-caution':'c-danger';
  const verdictIcon=l.ruptures.length===0?'✅':l.ruptures.length<=3?'⚠️':'🚨';
  const _gap=l.arts-l.enStock;
  const verdictText=l.ruptures.length===0?(_gap>0?`Pas de rupture active · ${_gap} article${_gap>1?'s':''} sans stock exclu${_gap>1?'s':''} du comptage (référence père, colis-only, ou fréquence < 3)`:'Pas de rupture sur cette famille'):`${l.ruptures.length} rupture${l.ruptures.length>1?'s':''} sur cette famille${l.caPerduTotal>0?' — CA perdu estimé : <strong>'+formatEuro(l.caPerduTotal)+'</strong>':''}`;
  const top5=l.ruptures.slice(0,5);
  const actionLabel=r=>r.jours>=25?'vérifier si déréférencé':'commander';
  return`<div class="diag-level">
    <div class="diag-level-hdr"><span class="font-bold text-sm c-action">📦 Niveau 1 — Stock</span>${_diagBadge(l.status)}</div>
    <p class="text-xs ${verdictClass} font-bold mb-2">${verdictIcon} ${verdictText}</p>
    ${top5.length?`<div class="mb-2"><p class="text-[10px] t-inverse-muted font-bold uppercase tracking-wide mb-1.5">🚨 Actions immédiates :</p>${top5.map(r=>`<div class="flex items-start gap-2 py-1 px-2 mb-0.5 rounded s-panel-inner/60 text-[11px]"><span class="t-inverse-muted shrink-0">·</span><span class="flex-1"><span class="font-mono t-inverse-muted">${r.code}</span> <span class="text-white font-semibold">${r.lib}</span>${_articleSparkline(r.code)} — <span class="t-inverse">Fréq ${r.W}, rupture depuis ${r.jours}j</span> → <span class="font-bold ${r.jours>=25?'c-caution':'text-cyan-400'}">${actionLabel(r)}</span>${r.ca>0?' <span class="c-danger text-[10px]">('+formatEuro(r.ca)+' perdu)</span>':''}</span></div>`).join('')}${l.ruptures.length>5?`<p class="text-[10px] t-inverse-muted mt-1 ml-4">… et ${l.ruptures.length-5} autre${l.ruptures.length-5>1?'s':''}</p>`:''}</div>`:''}
    ${l.nonRef>0?`<p class="text-[11px] t-inverse-muted mt-1">💡 <strong class="t-inverse">${l.nonRef}</strong> article${l.nonRef>1?'s':''} ni en stock ni en rupture = non référencés en agence</p>`:''}
  </div>`;
}

// ── Level 2: Calibrage MIN/MAX ──
function _diagLevel2(famille,hasBench,refStore){
  const arts=_S.finalData.filter(r=>r.famille===famille&&r.W>=1);
  const nonCal=arts.filter(r=>r.ancienMin===0&&r.ancienMax===0&&!r.isNouveaute);
  const sousD=arts.filter(r=>r.ancienMin>0&&r.nouveauMin>r.ancienMin);
  let sousPerf=[];
  if(hasBench&&refStore){
    const myV=_S.ventesParMagasin[_S.selectedMyStore]||{};
    const refV=_S.ventesParMagasin[refStore]||{};
    for(const a of arts){const myF=(myV[a.code]?.countBL)||0,refF=(refV[a.code]?.countBL)||0;if(refF>2*myF&&refF>=3)sousPerf.push({code:a.code,lib:a.libelle,ancienMin:a.ancienMin,nouveauMin:a.nouveauMin,myFreq:myF,refFreq:refF});}
  }
  const detail=sousD.map(r=>{const ecart=r.nouveauMin-r.ancienMin;return{code:r.code,lib:r.libelle,ancienMin:r.ancienMin,nouveauMin:r.nouveauMin,ecart,myFreq:r.W,refFreq:hasBench&&refStore?(_S.ventesParMagasin[refStore]?.[r.code]?.countBL||0):null};}).sort((a,b)=>b.ecart-a.ecart);
  const nb=nonCal.length+sousD.length;
  return{status:nb===0?'ok':nb>5?'error':'warn',nonCal:nonCal.length,sousD:sousD.length,sousPerf,detail};
}
function _diagRenderL2(l,hasBench,refStore){
  const nbTotal=l.nonCal+l.sousD;
  const verdictClass=nbTotal===0?'c-ok':nbTotal<=5?'c-caution':'c-danger';
  const verdictIcon=nbTotal===0?'✅':nbTotal<=5?'⚠️':'🚨';
  const verdictText=nbTotal===0?'Calibrage correct — tous les articles actifs ont un MIN/MAX bien dimensionné':`${nbTotal} article${nbTotal>1?'s':''} mal calibré${nbTotal>1?'s':''}${l.nonCal>0?' (dont '+l.nonCal+' sans MIN/MAX dans l\'ERP)':''}`;
  const top5=l.detail.slice(0,5);
  return`<div class="diag-level">
    <div class="diag-level-hdr"><span class="font-bold text-sm c-caution">🎚️ Niveau 2 — Calibrage MIN/MAX</span>${_diagBadge(l.status)}</div>
    <p class="text-xs ${verdictClass} font-bold mb-2">${verdictIcon} ${verdictText}</p>
    ${top5.length?`<div class="mb-2"><p class="text-[10px] t-inverse-muted font-bold uppercase tracking-wide mb-1.5">🔧 Plus gros écarts à corriger :</p>${top5.map(r=>`<div class="flex items-start gap-2 py-1 px-2 mb-0.5 rounded s-panel-inner/60 text-[11px]"><span class="t-inverse-muted shrink-0">·</span><span class="flex-1"><span class="font-mono t-inverse-muted">${r.code}</span> <span class="text-white font-semibold">${r.lib}</span> — <span class="t-inverse">MIN actuel <span class="c-caution">${r.ancienMin}</span> → recommandé <span class="c-ok font-bold">${r.nouveauMin}</span></span> <span class="c-danger text-[10px]">(+${r.ecart})</span>${hasBench&&r.refFreq>0?' <span class="t-inverse-muted text-[10px]">· réf. vend '+r.refFreq+'×</span>':''}</span></div>`).join('')}${l.detail.length>5?`<p class="text-[10px] t-inverse-muted mt-1 ml-4">… et ${l.detail.length-5} autre${l.detail.length-5>1?'s':''} à recalibrer</p>`:''}</div>`:''}
    ${hasBench&&l.sousPerf.length?`<p class="text-[11px] c-caution mt-1">📊 <strong>${l.sousPerf.length}</strong> article${l.sousPerf.length>1?'s':''} où <em class="c-caution">${refStore}</em> vend 2× plus que vous → vérifier la visibilité rayon</p>`:''}
  </div>`;
}

// ── VOYANT 2 : 👥 MES CLIENTS (Chalandise) ──
function _diagVoyant2(famille,hasChal,metierFilter){
  if(!hasChal)return{status:'lock',reason:'Chargez la Zone de Chalandise pour activer l\'analyse clients'};
  const famArts=new Set(_S.finalData.filter(r=>famLib(r.famille)===famille).map(r=>r.code));
  if(!famArts.size)return{status:'warn',reason:'Aucun article trouvé pour cette famille',metiers:[]};
  const metierBuyers={};
  for(const artCode of famArts){const buyers=_S.articleClients.get(artCode);if(!buyers)continue;for(const cc of buyers){const info=_S.chalandiseData.get(cc);if(!info||!info.metier)continue;if(!clientMatchesDeptFilter(info)||!clientMatchesClassifFilter(info)||!clientMatchesStatutFilter(info)||!clientMatchesActivitePDVFilter(info)||!clientMatchesCommercialFilter(info))continue;if(!metierBuyers[info.metier])metierBuyers[info.metier]=new Set();metierBuyers[info.metier].add(cc);}}
  const totalBuyers=Object.values(metierBuyers).reduce((s,set)=>s+set.size,0);
  if(!totalBuyers)return{status:'warn',reason:'Aucun acheteur de cette famille identifié dans la chalandise',metiers:[]};
  let top3;
  if(metierFilter){const bs=metierBuyers[metierFilter];top3=bs?[[metierFilter,bs]]:[];}
  else{top3=Object.entries(metierBuyers).sort((a,b)=>b[1].size-a[1].size).slice(0,3);}
  const metiers=top3.map(([metier,buyerSet])=>{
    const pct=Math.round(buyerSet.size/totalBuyers*100);
    const clients=[];
    for(const[cc,info] of _S.chalandiseData.entries()){
      if(info.metier!==metier)continue;
      if(!clientMatchesDeptFilter(info)||!clientMatchesClassifFilter(info)||!clientMatchesStatutFilter(info)||!clientMatchesActivitePDVFilter(info)||!clientMatchesCommercialFilter(info))continue;
      const myData=_S.ventesClientArticle.get(cc);
      const famCA=myData?[...myData.entries()].filter(([c])=>famArts.has(c)).reduce((s,[,d])=>s+d.sumPrelevee,0):0;
      const prio=_diagClientPrio(info,famCA);
      clients.push({code:cc,nom:info.nom||'',statut:info.statut||'',activiteGlobale:info.activiteGlobale||info.activite||'',activitePDV:info.activitePDV||'',classification:info.classification||'',ca2025:info.ca2025||0,famCA,ville:info.ville||'',prio});
    }
    clients.sort((a,b)=>{if(a.prio!==b.prio)return a.prio-b.prio;const cp=_diagClassifPrio(a.classification)-_diagClassifPrio(b.classification);if(a.prio===1||a.prio===5)return b.ca2025-a.ca2025;return cp||b.ca2025-a.ca2025;});
    const p1=clients.filter(c=>c.prio===1).length,p2=clients.filter(c=>c.prio===2).length,p3=clients.filter(c=>c.prio===3).length,p4=clients.filter(c=>c.prio===4).length;
    const potentiel=clients.filter(c=>c.prio===2||c.prio===3).reduce((s,c)=>s+(c.famCA>0?c.famCA:Math.round((c.ca2025||0)*0.05)),0);
    return{metier,pct,total:clients.length,p1,p2,p3,p4,p5:clients.filter(c=>c.prio===5).length,potentiel,clients};
  });
  const totalPerdus=metiers.reduce((s,m)=>s+m.p2+m.p3,0);
  const totalPotentiel=metiers.reduce((s,m)=>s+m.potentiel,0);
  return{status:totalPerdus>2?'warn':'ok',totalBuyers,metiers,perdus:totalPerdus,potentiel:totalPotentiel};
}
// ── Toggle badge reconquête (Action 3 Sprint 2) ──
function toggleReconquestFilter(metier,btn){
  const isActive=btn.classList.contains('diag-reconquest-active');
  document.querySelectorAll('.diag-reconquest-badge').forEach(b=>b.classList.remove('diag-reconquest-active'));
  const block=btn.closest('.diag-metier-block');if(!block)return;
  const rows=block.querySelectorAll('.diag-client-row');
  if(isActive){rows.forEach(r=>r.classList.remove('hidden'));}
  else{rows.forEach(r=>{const p=parseInt(r.dataset.prio||'0');r.classList.toggle('hidden',p!==2&&p!==3);});btn.classList.add('diag-reconquest-active');}
}
function _diagRenderV2(v,hasChal){
  if(!hasChal||v.status==='lock')return`<div class="diag-voyant diag-v2 diag-voyant-locked diag-border-lock"><div class="diag-voyant-hdr"><span class="font-extrabold text-sm t-inverse-muted">👥 Mes Clients</span>${_diagBadge('lock')}</div><p class="text-xs t-inverse-muted">🔒 ${v.reason||'Chargez la Zone de Chalandise pour activer l\'analyse clients'}</p><p class="text-[10px] text-purple-400 mt-1">→ Ajoutez le fichier Chalandise (export Qlik) pour débloquer ce voyant</p></div>`;
  if(!v.metiers?.length){const msg=v.cellMode?'Aucun client identifié dans la chalandise pour ces articles.':(v.reason||'Aucun métier identifié dans la chalandise pour cette famille');return`<div class="diag-voyant diag-v2 diag-border-warn"><div class="diag-voyant-hdr"><span class="font-extrabold text-sm text-purple-300">👥 Mes Clients</span>${_diagBadge('warn')}</div><p class="text-xs t-inverse-muted">⚠️ ${msg}</p></div>`;}

  // ── Helper : carte métier enrichie (Actions 1-4) ──
  // Mode famille (m a p1/p2/p3/p4/p5/total/potentiel)
  const _cardFamille=(m,isFirst)=>{
    const metierEsc=m.metier.replace(/'/g,"\\'").replace(/"/g,'&quot;');
    // Action 2 — Jauge pénétration PDV
    const penPDV=m.total>0?Math.round(m.p5/m.total*100):0;
    const jCol=penPDV>=60?'#22c55e':penPDV>=40?'#f59e0b':'#ef4444';
    const jTxt=penPDV>=60?'c-ok':penPDV>=40?'c-caution':'c-danger';
    const jaugeHtml=`<div class="mt-1.5 mb-2"><div class="flex items-center gap-2"><span class="text-[10px] t-inverse-muted w-24 shrink-0">Pénétration PDV</span><div class="flex-1 h-2 rounded-full bg-slate-700/50 overflow-hidden"><div class="h-full rounded-full" style="width:${penPDV}%;background:${jCol}"></div></div><span class="text-[10px] font-bold ${jTxt} w-10 text-right">${penPDV}%</span></div><p class="text-[10px] t-inverse-muted mt-0.5">${m.p5} actifs / ${m.total} dans votre zone</p></div>`;
    // Action 3 — Badge reconquête
    const nbPerdus=m.p2+m.p3;
    const reconBadge=nbPerdus>0?`<button onclick="toggleReconquestFilter('${metierEsc}',this)" class="diag-reconquest-badge text-[9px] font-bold px-2 py-0.5 rounded-full bg-red-900/40 text-red-400 border border-red-800/50 hover:bg-red-900/60 transition-colors cursor-pointer" title="Filtrer les ${nbPerdus} client${nbPerdus>1?'s':''} perdus">⚠️ ${nbPerdus} perdu${nbPerdus>1?'s':''}${m.potentiel>500?' · '+formatEuro(m.potentiel):''}</button>`:'';
    // Action 4 — Montant potentiel en tête
    const potentielHtml=m.potentiel>0
      ?`<p class="text-base font-extrabold c-caution mb-1">💶 ${formatEuro(m.potentiel)} potentiel récupérable</p><p class="text-[10px] t-inverse-muted mb-1">${m.total} clients zone · ${m.p5} actifs PDV · ${m.p1} sans achat · ${nbPerdus} perdu${nbPerdus>1?'s':''}</p>`
      :`<p class="text-[11px] t-inverse mb-1">→ <strong class="text-white">${m.total}</strong> clients · <span class="c-ok">${m.p5} actifs PDV (${penPDV}%)</span>${m.p1?` · <span class="c-caution">${m.p1} sans achat PDV</span>`:''}</p>`;
    return`<div class="diag-metier-block${isFirst?'':' mt-3 pt-3 border-t b-dark'} s-panel-inner/50 rounded-lg p-3">
      <div class="flex flex-wrap items-center gap-2 mb-1.5">
        <span class="text-xs font-extrabold c-danger">${m.metier}${_isMetierStrategique(m.metier)?' <span class="c-caution text-[10px]">⭐</span>':''}</span>
        <span class="text-[10px] font-bold c-caution bg-amber-900/30 px-2 py-0.5 rounded-full">${m.pct}% des acheteurs</span>
        ${reconBadge}
      </div>
      ${jaugeHtml}
      ${potentielHtml}
      <button class="mt-1 text-[10px] text-cyan-400 hover:text-cyan-300 border border-cyan-800 hover:border-cyan-600 px-3 py-1 rounded" onclick="_navigateToOverviewMetier('${metierEsc}')">🔗 Voir dans Le Terrain → (périmètre global métier)</button>
    </div>`;
  };
  // Mode cellMode (m a actifs/perdus/prospects/potentiel mais pas p1-p5)
  const _cardCell=(m,isFirst)=>{
    const metierEsc=m.metier.replace(/'/g,"\\'").replace(/"/g,'&quot;');
    const penActifs=m.total>0?Math.round(m.actifs/m.total*100):0;
    const jCol=penActifs>=60?'#22c55e':penActifs>=40?'#f59e0b':'#ef4444';
    const jTxt=penActifs>=60?'c-ok':penActifs>=40?'c-caution':'c-danger';
    const jaugeHtml=`<div class="mt-1.5 mb-2"><div class="flex items-center gap-2"><span class="text-[10px] t-inverse-muted w-24 shrink-0">Actifs / zone</span><div class="flex-1 h-2 rounded-full bg-slate-700/50 overflow-hidden"><div class="h-full rounded-full" style="width:${penActifs}%;background:${jCol}"></div></div><span class="text-[10px] font-bold ${jTxt} w-10 text-right">${penActifs}%</span></div><p class="text-[10px] t-inverse-muted mt-0.5">${m.actifs} actifs sur ces articles / ${m.total} dans votre zone (métier)</p></div>`;
    const nbPerdus=m.perdus||0;
    const reconBadge=nbPerdus>0?`<button onclick="toggleReconquestFilter('${metierEsc}',this)" class="diag-reconquest-badge text-[9px] font-bold px-2 py-0.5 rounded-full bg-red-900/40 text-red-400 border border-red-800/50 hover:bg-red-900/60 transition-colors cursor-pointer" title="Filtrer les ${nbPerdus} client${nbPerdus>1?'s':''} perdus">⚠️ ${nbPerdus} perdu${nbPerdus>1?'s':''}${m.potentiel>500?' · '+formatEuro(m.potentiel):''}</button>`:'';
    const caHtml=m.caActifs>0?` · CA : <strong class="c-ok">${formatEuro(m.caActifs)}</strong>`:'';
    const potentielHtml=m.potentiel>0
      ?`<p class="text-base font-extrabold c-caution mb-1">💶 ${formatEuro(m.potentiel)} potentiel récupérable</p>`
      :`<p class="text-[11px] t-inverse mb-1">→ <strong class="text-white">${m.actifs}</strong> client${m.actifs>1?'s':''} actif${m.actifs>1?'s':''}${caHtml}</p>`;
    const perduLine=(nbPerdus>0||m.prospects>0)?`<p class="text-[11px] mb-1">${nbPerdus>0?`<span class="c-danger">→ <strong>${nbPerdus}</strong> perdu${nbPerdus>1?'s':''} (reconquête)</span>`:'' }${nbPerdus>0&&m.prospects>0?' · ':''}${m.prospects>0?`<span class="c-caution">${m.prospects} prospect${m.prospects>1?'s':''} (conquête)</span>`:''}</p>`:'';
    return`<div class="diag-metier-block${isFirst?'':' mt-3 pt-3 border-t b-dark'} s-panel-inner/50 rounded-lg p-3">
      <div class="flex flex-wrap items-center gap-2 mb-1.5">
        <span class="text-xs font-extrabold c-danger">${m.metier}${_isMetierStrategique(m.metier)?' <span class="c-caution text-[10px]">⭐</span>':''}</span>
        <span class="text-[10px] font-bold c-caution bg-amber-900/30 px-2 py-0.5 rounded-full">${m.pct}% des acheteurs</span>
        ${reconBadge}
      </div>
      ${jaugeHtml}
      ${potentielHtml}
      ${perduLine}
      <button class="mt-1 text-[10px] text-cyan-400 hover:text-cyan-300 border border-cyan-800 hover:border-cyan-600 px-3 py-1 rounded transition-colors" onclick="_navigateToOverviewMetier('${metierEsc}')">🔗 Voir dans Le Terrain → (périmètre global métier)</button>
    </div>`;
  };

  // ── Mode cellPanel (case Radar ABC/FMR) ──
  if(v.cellMode){
    // Action 1 — split urgents/secondaires (cell mode : pen < 40% ou perdus ≥ 3)
    const sorted=[...v.metiers].sort((a,b)=>{const pa=a.total>0?a.actifs/a.total:1;const pb=b.total>0?b.actifs/b.total:1;return pa-pb;});
    const urgents=sorted.filter(m=>{const pen=m.total>0?m.actifs/m.total:0;return pen<0.4||(m.perdus||0)>=3;});
    const secondaires=sorted.filter(m=>!urgents.includes(m));
    const urgentsHtml=urgents.map((m,i)=>_cardCell(m,i===0)).join('');
    const secondairesHtml=secondaires.length?`<details><summary class="text-[10px] t-inverse-muted cursor-pointer mt-3 list-none">▸ ${secondaires.length} autre${secondaires.length>1?'s':''} métier${secondaires.length>1?'s':''} — situation saine</summary>${secondaires.map((m,i)=>_cardCell(m,i===0)).join('')}</details>`:'';
    const allUrgents=urgents.length===sorted.length;
    const totalProspects=v.metiers.reduce((s,m)=>s+(m.prospects||0),0);
    const perdusTxt=[v.perdus>0?`<span class="c-danger">${v.perdus} perdu${v.perdus>1?'s':''} avec historique (reconquête)</span>`:'',totalProspects>0?`<span class="c-caution">${totalProspects} prospect${totalProspects>1?'s':''} métier (conquête)</span>`:''].filter(Boolean).join(' · ');
    return`<div class="diag-voyant diag-v2 diag-border-${v.status}">
      <div class="diag-voyant-hdr"><span class="font-extrabold text-sm text-purple-300">👥 Mes Clients</span>${_diagBadge(v.status)}</div>
      <p class="text-[10px] t-inverse-muted mb-3">Sur vos <strong class="text-white">${v.nbArts}</strong> articles <strong class="text-cyan-300">${v.cellKey}</strong>, <strong class="text-white">${v.totalBuyers}</strong> client${v.totalBuyers>1?'s':''} identifié${v.totalBuyers>1?'s':''} dans la chalandise${perdusTxt?' · '+perdusTxt:''} :</p>
      ${urgentsHtml||sorted.map((m,i)=>_cardCell(m,i===0)).join('')}
      ${allUrgents?'':secondairesHtml}
    </div>`;
  }

  // ── Mode famille (normal) ──
  // Action 2 — Tri pénétration croissante
  const sorted=[...v.metiers].sort((a,b)=>{const pa=a.total>0?a.p5/a.total:1;const pb=b.total>0?b.p5/b.total:1;return pa-pb;});
  // Action 1 — Split urgents/secondaires
  const urgents=sorted.filter(m=>{const pen=m.total>0?m.p5/m.total:0;return pen<0.4||(m.p2+m.p3)>=3;});
  const secondaires=sorted.filter(m=>!urgents.includes(m));
  const allUrgents=urgents.length===sorted.length;
  const noneUrgent=urgents.length===0;
  let urgentsHtml,secondairesHtml;
  if(noneUrgent){
    // Aucun urgent → afficher le premier métier + replier le reste
    urgentsHtml=_cardFamille(sorted[0],true);
    const rest=sorted.slice(1);
    secondairesHtml=rest.length?`<details><summary class="text-[10px] t-inverse-muted cursor-pointer mt-3 list-none">▸ ${rest.length} autre${rest.length>1?'s':''} métier${rest.length>1?'s':''} — situation saine</summary>${rest.map((m,i)=>_cardFamille(m,i===0)).join('')}</details>`:'';
  }else if(allUrgents){
    // Tous urgents → tout afficher
    urgentsHtml=sorted.map((m,i)=>_cardFamille(m,i===0)).join('');
    secondairesHtml='';
  }else{
    urgentsHtml=urgents.map((m,i)=>_cardFamille(m,i===0)).join('');
    secondairesHtml=secondaires.length?`<details><summary class="text-[10px] t-inverse-muted cursor-pointer mt-3 list-none">▸ ${secondaires.length} autre${secondaires.length>1?'s':''} métier${secondaires.length>1?'s':''} — situation saine</summary>${secondaires.map((m,i)=>_cardFamille(m,i===0)).join('')}</details>`:'';
  }
  return`<div class="diag-voyant diag-v2 diag-border-${v.status}">
    <div class="diag-voyant-hdr"><span class="font-extrabold text-sm text-purple-300">👥 Mes Clients</span>${_diagBadge(v.status)}</div>
    <p class="text-[10px] t-inverse-muted mb-3">Top ${v.metiers.length} métier${v.metiers.length>1?'s':''} acheteurs · <strong class="text-white">${v.totalBuyers}</strong> identifié${v.totalBuyers>1?'s':''} dans la chalandise${v.perdus>0?' · <span class="c-danger">'+v.perdus+' perdus</span>':''}</p>
    ${urgentsHtml}
    ${allUrgents?'':secondairesHtml}
  </div>`;
}

// ── VOYANT 3 : 🔭 LE RÉSEAU (multi-agences) ──
function _diagVoyant3(famille,hasMulti){
  if(!hasMulti)return{status:'lock',reason:'Données multi-agences requises — chargez un fichier Consommé incluant plusieurs agences'};
  const cs=[..._S.storesIntersection].filter(s=>s!==_S.selectedMyStore);
  const nbOtherStores=cs.length;
  if(!nbOtherStores)return{status:'lock',reason:'Un seul magasin dans le fichier'};
  // Price lookup (my _S.finalData)
  const prixLookup={};for(const r of _S.finalData)prixLookup[r.code]=r.prixUnitaire||0;
  // My arts + my CA for this famille
  const myV=_S.ventesParMagasin[_S.selectedMyStore]||{};
  const myArts=new Set();let myCA=0;
  for(const[code,data] of Object.entries(myV)){
    if(famLib(_S.articleFamille[code]||'')!==famille)continue;
    if((data.sumPrelevee||0)>0||(data.sumEnleve||0)>0)myArts.add(code);
    myCA+=(data.sumCA>0?data.sumCA:(data.sumPrelevee||0)*(prixLookup[code]||0));
  }
  // Per-store CA + article presence counts
  const artStoreCnt={},artStoreFreqs={},artStoreCAs={},storeCAs=[];
  for(const store of cs){
    const sv=_S.ventesParMagasin[store]||{};let storeCA=0;
    for(const[code,data] of Object.entries(sv)){
      if(famLib(_S.articleFamille[code]||'')!==famille)continue;
      const codeCA=data.sumCA>0?data.sumCA:(data.sumPrelevee||0)*(prixLookup[code]||0);
      if((data.sumPrelevee||0)>0||(data.sumEnleve||0)>0){artStoreCnt[code]=(artStoreCnt[code]||0)+1;if(!artStoreFreqs[code])artStoreFreqs[code]=[];artStoreFreqs[code].push(data.countBL||0);if(!artStoreCAs[code])artStoreCAs[code]=[];artStoreCAs[code].push(codeCA);}
      storeCA+=codeCA;
    }
    if(storeCA>0)storeCAs.push(storeCA);
  }
  const medCA=storeCAs.length?_median(storeCAs):0;
  const caEcart=medCA>0?Math.round((myCA-medCA)/medCA*100):(myCA>0?100:0);
  // Missing: absent family → ≥2 stores (all network articles), present → ≥50%
  const isFamilyAbsent=myArts.size===0;
  const threshold=isFamilyAbsent?2:Math.max(1,Math.ceil(nbOtherStores*0.5));
  const byCode={};for(const r of _S.finalData)byCode[r.code]=r;
  const missing=[],inStockNotSold=[];
  for(const[code,cnt] of Object.entries(artStoreCnt)){
    if(myArts.has(code)||cnt<threshold)continue;
    const rawLib=_S.libelleLookup[code]||code;const lib=/^\d{6} - /.test(rawLib)?rawLib.substring(9).trim():rawLib;
    const d=byCode[code];
    const medFreq=artStoreFreqs[code]?.length?_median(artStoreFreqs[code]):0;
    const medCA=artStoreCAs[code]?.length?Math.round(_median(artStoreCAs[code])):0;
    const entry={code,lib,nbStores:cnt,medFreq:Math.round(medFreq*10)/10,medCA,abcClass:d?.abcClass||'?',fmrClass:d?.fmrClass||'?'};
    if((d?.stockActuel??0)>0)inStockNotSold.push({...entry,stockActuel:d.stockActuel});
    else missing.push(entry);
  }
  if(isFamilyAbsent){missing.sort((a,b)=>b.medCA-a.medCA||b.nbStores-a.nbStores);}
  else{missing.sort((a,b)=>b.nbStores-a.nbStores||b.medFreq-a.medFreq);}
  // Exclusives: I sell, < 2 other stores sell
  const exclusives=[];
  for(const code of myArts){
    if((artStoreCnt[code]||0)>=2)continue;
    const rawLib=_S.libelleLookup[code]||code;const lib=/^\d{6} - /.test(rawLib)?rawLib.substring(9).trim():rawLib;
    const d=_S.finalData.find(r=>r.code===code);
    exclusives.push({code,lib,nbStores:artStoreCnt[code]||0,myFreq:d?.W||0});
  }
  exclusives.sort((a,b)=>b.myFreq-a.myFreq);
  const status=medCA<=0?'ok':caEcart>=0?'ok':caEcart>=-50?'warn':'error';
  const strongMissing=missing.filter(a=>a.abcClass==='A'||a.abcClass==='B').length;
  return{status,myCA:Math.round(myCA),medCA:Math.round(medCA),caEcart,nbOtherStores,missing:isFamilyAbsent?missing:missing.slice(0,25),inStockNotSold:inStockNotSold.slice(0,15),strongMissing,exclusives:exclusives.slice(0,15),myCount:myArts.size,isFamilyAbsent};
}
function _diagV3FilterCategory(containerId,cat){
  const container=document.getElementById(containerId);if(!container)return;
  const kpisBar=container.previousElementSibling;
  if(kpisBar)kpisBar.querySelectorAll('.diag-kpi-pill[data-cat]').forEach(btn=>{btn.classList.toggle('active',btn.dataset.cat===cat);});
  container.querySelectorAll('[data-v3cat]').forEach(sec=>{sec.style.display=sec.dataset.v3cat===cat?'':'none';});
}
function _diagRenderV3(v,hasMulti){
  if(!hasMulti||v.status==='lock')return`<div class="diag-voyant diag-v3 diag-voyant-locked diag-border-lock"><div class="diag-voyant-hdr"><span class="font-extrabold text-sm t-inverse-muted">🔭 Le Réseau</span>${_diagBadge('lock')}</div><p class="text-xs t-inverse-muted">🔒 ${v.reason||'Données multi-agences non disponibles'}</p><p class="text-[10px] c-ok mt-1">→ Chargez un Consommé multi-agences pour comparer votre gamme au réseau</p></div>`;
  // ── Catégorisation des articles pour KPI bar
  const isCellMode=v.isCellMode;
  const commander=[];const verifier=[];const exclusivites=v.exclusives||[];
  for(const a of(v.missing||[])){
    const isStrong=isCellMode?(a.networkFmr==='F'||a.networkFmr==='M'):(a.abcClass==='A'||a.abcClass==='B');
    if(isStrong)commander.push(a);else verifier.push({...a,_vtype:'missing'});
  }
  for(const a of(v.inStockNotSold||[]))verifier.push({...a,_vtype:'instock'});
  const nbCmd=commander.length,nbVerif=verifier.length,nbExcl=exclusivites.length;
  const defaultCat=nbCmd>0?'commander':nbVerif>0?'verifier':'exclusivites';
  // ── Pill helper
  const _pill=(a,type)=>{
    const agStr=v.nbOtherStores?`${a.nbStores}/${v.nbOtherStores} ag.`:'';
    const freqVal=a.medFreq??a.myFreq??0;
    const precoStr=(isCellMode&&a.precoMin)?`<span class="text-[10px] text-cyan-300 flex-shrink-0">MIN:${a.precoMin}/MAX:${a.precoMax}</span>`:'';
    const stockStr=type==='instock'?`<span class="text-[10px] c-caution flex-shrink-0">Stock:${a.stockActuel}</span>`:'';
    const medCAStr=v.isFamilyAbsent&&a.medCA?`<span class="text-[10px] c-ok flex-shrink-0">${formatEuro(a.medCA)}</span>`:'';
    return`<div class="flex items-center gap-2 py-1.5 px-3 mb-1 rounded-lg s-panel-inner border b-dark"><span class="font-mono text-[10px] t-inverse-muted flex-shrink-0">${a.code}</span><span class="text-[11px] text-white font-semibold flex-1 truncate">${a.lib}</span>${precoStr}${stockStr}${medCAStr}<span class="text-[10px] c-ok font-bold flex-shrink-0">${agStr}</span><span class="text-[10px] t-inverse-muted flex-shrink-0">Fréq.${freqVal}</span></div>`;
  };
  const _exclPill=a=>`<div class="flex items-center gap-2 py-1.5 px-3 mb-1 rounded-lg s-panel-inner border b-dark"><span class="font-mono text-[10px] t-inverse-muted flex-shrink-0">${a.code}</span><span class="text-[11px] text-white font-semibold flex-1 truncate">${a.lib}</span><span class="text-[10px] c-action font-bold flex-shrink-0">Excl.</span><span class="text-[10px] t-inverse-muted flex-shrink-0">Fréq.${a.myFreq||0}</span></div>`;
  const _pillsSection=(items,pillFn,emptyMsg)=>{
    if(!items.length)return`<p class="text-[10px] t-inverse-muted">${emptyMsg}</p>`;
    const first5=items.slice(0,5).map(a=>pillFn(a)).join('');
    const rest=items.slice(5);
    if(!rest.length)return first5;
    return`${first5}<details><summary class="text-[10px] t-inverse-muted hover:text-white mt-1">▶ Voir ${rest.length} autre${rest.length>1?'s':''}</summary><div class="mt-1">${rest.map(a=>pillFn(a)).join('')}</div></details>`;
  };
  // ── Ligne CA (mode famille) ou référence (mode cellule)
  let introLine='';
  if(!isCellMode){
    const caIcon=v.caEcart>=0?'🟢':v.caEcart>=-50?'🟠':'🔴';
    const ecartStr=(v.caEcart>=0?'+':'')+v.caEcart+'%';
    const ecartColor=v.caEcart>=0?'c-ok':v.caEcart>=-50?'c-caution':'c-danger';
    introLine=v.medCA>0
      ?`<p class="text-xs mb-3">${caIcon} Votre CA : <strong class="text-white">${formatEuro(v.myCA)}</strong> vs médiane réseau <strong class="text-white">${formatEuro(v.medCA)}</strong> <span class="${ecartColor}">(${ecartStr})</span></p>`
      :`<p class="text-xs mb-3">Votre CA : <strong class="text-white">${formatEuro(v.myCA)}</strong> <span class="t-inverse-muted">(médiane non calculable)</span></p>`;
  }else{
    const cellLabel=v.cellKey?(v.cellKey+(RADAR_LABELS[v.cellKey]?' — '+RADAR_LABELS[v.cellKey]:'')):'' ;
    introLine=`<p class="text-xs mb-3">${cellLabel} : <strong class="text-white">${v.myCount}</strong> articles · ${(v.missing||[]).length>0?`<span class="c-caution">${v.missing.length} absent${v.missing.length>1?'s':''} chez vous</span>`:'<span class="c-ok">gamme complète</span>'}${nbVerif>0?` · <span class="c-caution">${nbVerif} à vérifier</span>`:''}</p>`;
  }
  // ── Badge status
  const badgeStatus=isCellMode?v.status:(v.caEcart>=0?'ok':v.caEcart>=-50?'warn':'error');
  const borderStatus=badgeStatus==='error'?'error':badgeStatus==='warn'?'warn':'ok';
  // ── Container ID unique
  const v3cId='diagV3Container';
  return`<div class="diag-voyant diag-v3 diag-border-${borderStatus}">
    <div class="diag-voyant-hdr"><span class="font-extrabold text-sm c-ok">🔭 Le Réseau</span>${_diagBadge(badgeStatus)}</div>
    ${introLine}
    <div class="flex gap-2 mb-3 flex-wrap" id="diagV3Kpis">
      <button class="diag-kpi-pill${defaultCat==='commander'?' active':''}" data-cat="commander" onclick="_diagV3FilterCategory('${v3cId}','commander')"${nbCmd===0?' disabled':''}>🔴 <strong>${nbCmd}</strong> à commander</button>
      <button class="diag-kpi-pill${defaultCat==='verifier'?' active':''}" data-cat="verifier" onclick="_diagV3FilterCategory('${v3cId}','verifier')"${nbVerif===0?' disabled':''}>🟠 <strong>${nbVerif}</strong> à vérifier</button>
      <button class="diag-kpi-pill${defaultCat==='exclusivites'?' active':''}" data-cat="exclusivites" onclick="_diagV3FilterCategory('${v3cId}','exclusivites')"${nbExcl===0?' disabled':''}>⭐ <strong>${nbExcl}</strong> exclusivité${nbExcl>1?'s':''}</button>
    </div>
    <div id="${v3cId}">
      <div data-v3cat="commander"${defaultCat!=='commander'?' style="display:none"':''}>
        ${nbCmd>0?`<p class="text-[10px] c-danger font-bold mb-1.5">Articles absents en forte rotation réseau — à commander :</p>${_pillsSection(commander,a=>_pill(a,'missing'),'')}`:`<p class="text-[10px] c-ok">✅ Tous les articles forte rotation réseau sont dans votre rayon.</p>`}
      </div>
      <div data-v3cat="verifier"${defaultCat!=='verifier'?' style="display:none"':''}>
        ${nbVerif>0?`<p class="text-[10px] c-caution font-bold mb-1.5">${verifier.some(a=>a._vtype==='instock')?'En stock sans vente · ':''}Articles à vérifier (gamme, visibilité rayon) :</p>${_pillsSection(verifier,a=>_pill(a,a._vtype||'missing'),'')}`:`<p class="text-[10px] c-ok">✅ Aucun article à vérifier.</p>`}
      </div>
      <div data-v3cat="exclusivites"${defaultCat!=='exclusivites'?' style="display:none"':''}>
        ${nbExcl>0?`<p class="text-[10px] c-action font-bold mb-1.5">Articles que vous vendez et &lt;2 autres agences vendent :</p>${_pillsSection(exclusivites,_exclPill,'')}`:`<p class="text-[10px] t-inverse-muted">Aucune exclusivité dans cette famille.</p>`}
      </div>
    </div>
  </div>`;
}

// ── Level 3: Gamme ──
function _diagLevel3(famille,hasBench,hasTerr,refStore){
  if(!hasBench&&!hasTerr)return{status:'lock',reason:'Chargez le fichier Le Terrain ou des données multi-agences pour activer l\'analyse de gamme'};
  const myArts=new Set(_S.finalData.filter(r=>famLib(r.famille)===famille).map(r=>r.code));
  if(hasBench&&refStore){
    const refV=_S.ventesParMagasin[refStore]||{};
    const refArts=Object.keys(refV).filter(c=>famLib(_S.articleFamille[c])===famille);
    const missing=refArts.filter(c=>!myArts.has(c)).map(c=>{
      const refF=refV[c]?.countBL||0;const lib=_S.libelleLookup[c]||c;
      const d=_S.finalData.find(r=>r.code===c);
      return{code:c,lib,refFreq:refF,abcClass:d?.abcClass||'?',fmrClass:d?.fmrClass||'?'};
    }).sort((a,b)=>b.refFreq-a.refFreq);
    const strong=missing.filter(a=>a.abcClass==='A'||a.abcClass==='B').length;
    return{status:missing.length===0?'ok':strong>2?'error':'warn',mode:'bench',myCount:myArts.size,refCount:refArts.length,refStore,missing:missing.slice(0,25),strongMissing:strong};
  }
  if(hasTerr){
    const tMap={};
    for(const l of _S.territoireLines){if(l.isSpecial||(famLib(l.famille||''))!==famille)continue;if(!tMap[l.code])tMap[l.code]={code:l.code,lib:l.libelle,ca:0,rayonStatus:l.rayonStatus};tMap[l.code].ca+=l.ca;}
    const tArts=Object.values(tMap).sort((a,b)=>b.ca-a.ca);
    const missing=tArts.filter(a=>!myArts.has(a.code)).map(a=>({...a,abcClass:_S.finalData.find(r=>r.code===a.code)?.abcClass||'?',fmrClass:_S.finalData.find(r=>r.code===a.code)?.fmrClass||'?'}));
    return{status:missing.length===0?'ok':missing.length>5?'error':'warn',mode:'territoire',myCount:myArts.size,terrCount:tArts.length,missing:missing.slice(0,25),strongMissing:0};
  }
  return{status:'lock',reason:'Pas de données de comparaison disponibles'};
}
function _diagRenderL3(l,hasBench,hasTerr){
  if(l.status==='lock')return`<div class="diag-level" style="opacity:.55"><div class="diag-level-hdr"><span class="font-bold text-sm t-inverse-muted">📋 Niveau 4 — Profondeur de gamme</span>${_diagBadge('lock')}</div><p class="text-xs t-inverse-muted">🔒 ${l.reason}</p></div>`;
  const srcLabel=l.mode==='bench'?`<em class="c-caution">${l.refStore}</em> a <strong class="text-white">${l.refCount}</strong> réf., vous en avez <strong class="text-white">${l.myCount}</strong>`:`Le Terrain : <strong class="text-white">${l.terrCount}</strong> réf., vous en avez <strong class="text-white">${l.myCount}</strong> en stock`;
  const colHeaders=l.mode==='bench'?`<th class="py-1.5 px-2 text-center">Fréq réf.</th><th class="py-1.5 px-2 text-center">ABC</th><th class="py-1.5 px-2 text-center">FMR</th>`:`<th class="py-1.5 px-2 text-right">CA Legallais</th>`;
  const rows=(l.missing||[]).map(a=>{
    const abcColor=a.abcClass==='A'?'c-ok':a.abcClass==='B'?'c-action':'t-inverse-muted';
    const fmrColor=a.fmrClass==='F'?'c-ok':a.fmrClass==='M'?'c-action':'c-danger';
    if(l.mode==='bench')return`<tr class="border-t border-violet-900/30"><td class="py-1 px-2 font-mono t-inverse-muted">${a.code}</td><td class="py-1 px-2 max-w-[150px] truncate">${a.lib}</td><td class="py-1 px-2 text-center font-bold">${a.refFreq}</td><td class="py-1 px-2 text-center font-bold ${abcColor}">${a.abcClass}</td><td class="py-1 px-2 text-center font-bold ${fmrColor}">${a.fmrClass}</td></tr>`;
    return`<tr class="border-t border-violet-900/30"><td class="py-1 px-2 font-mono t-inverse-muted">${a.code}</td><td class="py-1 px-2 max-w-[180px] truncate">${a.lib}</td><td class="py-1 px-2 text-right font-bold">${formatEuro(a.ca)}</td></tr>`;
  }).join('');
  return`<div class="diag-level">
    <div class="diag-level-hdr"><span class="font-bold text-sm text-violet-300">📋 Niveau 4 — Profondeur de gamme</span>${_diagBadge(l.status)}</div>
    <p class="text-xs t-inverse-muted mb-2">${srcLabel}</p>
    ${l.missing?.length?`<p class="text-xs c-caution font-bold mb-2">${l.missing.length} article${l.missing.length>1?'s':''} absents de votre rayon${l.strongMissing>0?' — dont <strong>'+l.strongMissing+'</strong> classés A ou B':''}</p><div class="overflow-x-auto" style="max-height:300px;overflow-y:auto"><table class="min-w-full text-[11px]"><thead class="text-violet-300 border-b border-violet-900/50" style="position:sticky;top:0;z-index:10;background:#1e293b"><tr><th class="py-1.5 px-2 text-left">Code</th><th class="py-1.5 px-2 text-left">Libellé</th>${colHeaders}</tr></thead><tbody>${rows}</tbody></table></div>`:`<p class="text-xs c-ok">✅ Gamme complète — tous les articles de référence sont dans votre rayon</p>`}
  </div>`;
}

// ── Métier-mode level functions (diagnostic opened from a métier, not a famille) ──
function _diagLevel1Metier(metier){
  const metierClients=new Set();
  for(const[cc,info] of _S.chalandiseData.entries()){if(info.metier===metier)metierClients.add(cc);}
  if(!metierClients.size)return{status:'warn',reason:'Aucun client '+metier+' dans la chalandise',arts:0,enStock:0,ruptures:[],caPerduTotal:0,topArts:[]};
  const artFreq={};
  for(const cc of metierClients){const arts=_S.clientArticles.get(cc);if(!arts)continue;for(const code of arts)artFreq[code]=(artFreq[code]||0)+1;}
  const topArts=Object.entries(artFreq).sort((a,b)=>b[1]-a[1]).slice(0,50).map(([code,freq])=>{
    const r=_S.finalData.find(d=>d.code===code);
    return{code,freq,lib:r?r.libelle:(_S.libelleLookup[code]||code),stockActuel:r?r.stockActuel:null,famille:r?r.famille:'',W:r?r.W:0,prixUnitaire:r?r.prixUnitaire:0,V:r?r.V:0,isParent:r?r.isParent:false,ancienMin:r?r.ancienMin:0,ancienMax:r?r.ancienMax:0,nouveauMin:r?r.nouveauMin:0,isNouveaute:r?r.isNouveaute:false};
  });
  const enStock=topArts.filter(a=>a.stockActuel!==null&&a.stockActuel>0).length;
  let caPerduTotal=0;
  const ruptures=topArts.filter(a=>a.W>=3&&a.stockActuel!==null&&a.stockActuel<=0&&!a.isParent).map(a=>{
    const jours=90;const ca=estimerCAPerdu(a.V,a.prixUnitaire,jours);caPerduTotal+=ca;
    return{code:a.code,lib:a.lib,W:a.W,jours,ca,freq:a.freq};
  }).sort((a,b)=>b.ca-a.ca);
  return{status:ruptures.length===0?'ok':caPerduTotal>=1000?'error':'warn',metier,metierClients:metierClients.size,arts:topArts.length,enStock,ruptures,caPerduTotal,topArts};
}
function _diagRenderL1Metier(l){
  if(l.reason&&l.arts===0)return`<div class="diag-level"><div class="diag-level-hdr"><span class="font-bold text-sm c-action">📦 Niveau 1 — Articles achetés</span>${_diagBadge('warn')}</div><p class="text-xs t-inverse-muted">${l.reason}</p></div>`;
  const verdictClass=l.ruptures.length===0?'c-ok':l.ruptures.length<=3?'c-caution':'c-danger';
  const verdictIcon=l.ruptures.length===0?'✅':l.ruptures.length<=3?'⚠️':'🚨';
  const verdictText=l.ruptures.length===0?'Pas de rupture sur les articles achetés par les '+l.metier+'s':`${l.ruptures.length} rupture${l.ruptures.length>1?'s':''} sur les articles achetés par les ${l.metier}s${l.caPerduTotal>0?' — CA perdu estimé : <strong>'+formatEuro(l.caPerduTotal)+'</strong>':''}`;
  const top5=l.ruptures.slice(0,5);
  const actionLabel=r=>r.jours>=25?'vérifier si déréférencé':'commander';
  return`<div class="diag-level">
    <div class="diag-level-hdr"><span class="font-bold text-sm c-action">📦 Niveau 1 — Articles achetés par les ${l.metier}s</span>${_diagBadge(l.status)}</div>
    <p class="text-xs t-inverse-muted mb-1"><strong class="text-white">${l.metierClients}</strong> client${l.metierClients>1?'s':''} · Top <strong class="text-white">${l.arts}</strong> articles les plus achetés</p>
    <p class="text-xs ${verdictClass} font-bold mb-2">${verdictIcon} ${verdictText}</p>
    ${top5.length?`<div class="mb-2"><p class="text-[10px] t-inverse-muted font-bold uppercase tracking-wide mb-1.5">🚨 Actions immédiates :</p>${top5.map(r=>`<div class="flex items-start gap-2 py-1 px-2 mb-0.5 rounded s-panel-inner/60 text-[11px]"><span class="t-inverse-muted shrink-0">·</span><span class="flex-1"><span class="font-mono t-inverse-muted">${r.code}</span> <span class="text-white font-semibold">${r.lib}</span> — <span class="t-inverse">Fréq ${r.W} (${r.freq} clients), rupture depuis ${r.jours}j</span> → <span class="font-bold ${r.jours>=25?'c-caution':'text-cyan-400'}">${actionLabel(r)}</span>${r.ca>0?' <span class="c-danger text-[10px]">('+formatEuro(r.ca)+' perdu)</span>':''}</span></div>`).join('')}${l.ruptures.length>5?`<p class="text-[10px] t-inverse-muted mt-1 ml-4">… et ${l.ruptures.length-5} autre${l.ruptures.length-5>1?'s':''}</p>`:''}</div>`:''}
  </div>`;
}
function _diagLevel2Metier(topArts){
  if(!topArts||!topArts.length)return{status:'ok',nonCal:0,sousD:0,sousPerf:[],detail:[]};
  const arts=topArts.filter(a=>a.W>=1);
  const nonCal=arts.filter(a=>a.ancienMin===0&&a.ancienMax===0&&!a.isNouveaute);
  const sousD=arts.filter(a=>a.ancienMin>0&&a.nouveauMin>a.ancienMin);
  const detail=sousD.map(a=>{const ecart=a.nouveauMin-a.ancienMin;return{code:a.code,lib:a.lib,ancienMin:a.ancienMin,nouveauMin:a.nouveauMin,ecart,myFreq:a.W,refFreq:null};}).sort((a,b)=>b.ecart-a.ecart);
  const nb=nonCal.length+sousD.length;
  return{status:nb===0?'ok':nb>5?'error':'warn',nonCal:nonCal.length,sousD:sousD.length,sousPerf:[],detail};
}
function _diagLevel3Metier(metier){
  const metierClients=new Set();
  for(const[cc,info] of _S.chalandiseData.entries()){if(info.metier===metier)metierClients.add(cc);}
  if(!metierClients.size)return{status:'lock',reason:'Aucun client identifié',familles:[]};
  const artFreq={};
  for(const cc of metierClients){const arts=_S.clientArticles.get(cc);if(!arts)continue;for(const code of arts)artFreq[code]=(artFreq[code]||0)+1;}
  const famMap={};
  for(const[code,freq] of Object.entries(artFreq)){
    const r=_S.finalData.find(d=>d.code===code);
    const fam=r?famLib(r.famille):'❓ Inconnue';
    if(!famMap[fam])famMap[fam]={fam,nbArts:0,enStock:0,rupture:0,absent:0,freq:0};
    famMap[fam].nbArts++;famMap[fam].freq+=freq;
    if(r){if(r.stockActuel>0)famMap[fam].enStock++;else if(r.W>=1)famMap[fam].rupture++;else famMap[fam].absent++;}
    else famMap[fam].absent++;
  }
  const familles=Object.values(famMap).sort((a,b)=>b.freq-a.freq);
  const totalArts=familles.reduce((s,f)=>s+f.nbArts,0);
  const totalEnStock=familles.reduce((s,f)=>s+f.enStock,0);
  const pct=totalArts>0?Math.round(totalEnStock/totalArts*100):0;
  return{status:pct>=70?'ok':pct>=40?'warn':'error',familles,totalArts,totalEnStock,pct,metierClients:metierClients.size};
}
function _diagRenderL3Metier(l){
  if(l.status==='lock')return`<div class="diag-level" style="opacity:.55"><div class="diag-level-hdr"><span class="font-bold text-sm t-inverse-muted">📋 Niveau 4 — Familles achetées</span>${_diagBadge('lock')}</div><p class="text-xs t-inverse-muted">🔒 ${l.reason}</p></div>`;
  const rows=(l.familles||[]).map(f=>{
    const pctCov=f.nbArts>0?Math.round(f.enStock/f.nbArts*100):0;
    const barColor=pctCov>=70?'bg-emerald-500':pctCov>=40?'bg-amber-500':'bg-red-500';
    const textColor=pctCov>=70?'c-ok':pctCov>=40?'c-caution':'c-danger';
    const famAttr=f.fam.replace(/&/g,'&amp;').replace(/"/g,'&quot;');
    const diagBtn=`<button class="diag-btn ml-1 s-card-alt t-secondary text-[9px]" data-fam="${famAttr}" onclick="openDiagnostic(this.dataset.fam,'territoire')">🔍</button>`;
    return`<tr class="border-t b-dark"><td class="py-1 px-2 max-w-[160px] truncate text-[11px]">${f.fam}${diagBtn}</td><td class="py-1 px-2 text-center">${f.nbArts}</td><td class="py-1 px-2 text-center c-ok">${f.enStock}</td><td class="py-1 px-2 text-center c-caution">${f.rupture}</td><td class="py-1 px-2 text-center c-danger">${f.absent}</td><td class="py-1 px-2 text-right"><div class="flex items-center justify-end gap-1"><div class="w-10 s-panel-inner rounded-full h-1.5 overflow-hidden"><div class="${barColor} h-1.5 rounded-full" style="width:${pctCov}%"></div></div><span class="text-[10px] ${textColor}">${pctCov}%</span></div></td></tr>`;
  }).join('');
  return`<div class="diag-level">
    <div class="diag-level-hdr"><span class="font-bold text-sm text-violet-300">📋 Niveau 4 — Familles achetées</span>${_diagBadge(l.status)}</div>
    <p class="text-xs t-inverse-muted mb-2">${l.totalArts} articles achetés · couverture rayon : <strong class="${l.pct>=70?'c-ok':l.pct>=40?'c-caution':'c-danger'}">${l.pct}%</strong></p>
    <div class="overflow-x-auto" style="max-height:300px;overflow-y:auto"><table class="min-w-full text-[11px]"><thead class="text-violet-300 border-b border-violet-900/50" style="position:sticky;top:0;z-index:10;background:#1e293b"><tr><th class="py-1.5 px-2 text-left">Famille</th><th class="py-1.5 px-2 text-center">Nb art.</th><th class="py-1.5 px-2 text-center">✅</th><th class="py-1.5 px-2 text-center">⚠️</th><th class="py-1.5 px-2 text-center">❌</th><th class="py-1.5 px-2 text-right">Couverture</th></tr></thead><tbody>${rows}</tbody></table></div>
  </div>`;
}
function _diagLevel4MetierMode(metier,hasChal){
  if(!hasChal)return{status:'lock',reason:'Chargez la Zone de Chalandise pour activer l\'analyse clients'};
  const clients=[];
  for(const[cc,info] of _S.chalandiseData.entries()){
    if(info.metier!==metier)continue;
    if(!clientMatchesDeptFilter(info)||!clientMatchesClassifFilter(info)||!clientMatchesStatutFilter(info)||!clientMatchesActivitePDVFilter(info)||!clientMatchesCommercialFilter(info))continue;
    const myData=_S.ventesClientArticle.get(cc);
    const famCA=myData?[...myData.values()].reduce((s,d)=>s+d.sumPrelevee,0):0;
    const prio=_diagClientPrio(info,famCA);
    clients.push({code:cc,nom:info.nom||'',statut:info.statut||'',activiteGlobale:info.activiteGlobale||info.activite||'',activitePDV:info.activitePDV||'',classification:info.classification||'',ca2025:info.ca2025||0,famCA,ville:info.ville||'',prio});
  }
  clients.sort((a,b)=>{if(a.prio!==b.prio)return a.prio-b.prio;const cp=_diagClassifPrio(a.classification)-_diagClassifPrio(b.classification);if(a.prio===1||a.prio===5)return b.ca2025-a.ca2025;return cp||b.ca2025-a.ca2025;});
  const p1=clients.filter(c=>c.prio===1).length,p2=clients.filter(c=>c.prio===2).length;
  const p3=clients.filter(c=>c.prio===3).length,p4=clients.filter(c=>c.prio===4).length,p5=clients.filter(c=>c.prio===5).length;
  const potentiel=clients.filter(c=>c.prio===2||c.prio===3).reduce((s,c)=>s+(c.famCA>0?c.famCA:Math.round((c.ca2025||0)*0.05)),0);
  const perdus=p2+p3;
  return{status:perdus>2?'warn':'ok',totalBuyers:clients.length,metiers:[{metier,pct:100,total:clients.length,p1,p2,p3,p4,p5,potentiel,clients}],perdus,potentiel,isMetierMode:true};
}
function _diagGenActionsMetier(metier,l1,l2,l3,l4){
  const acts=[];
  if(l1&&l1.ruptures&&l1.ruptures.length>0){
    const caVal=l1.caPerduTotal||0;
    const caLabel=caVal>0?formatEuro(caVal):formatEuro(l1.ruptures.reduce((s,r)=>s+Math.round(r.W*(r.prixUnitaire||0)),0))+' potentiel annuel';
    acts.push({priority:1,star:'⭐',codes:l1.ruptures.map(r=>r.code),label:`Réassort ${l1.ruptures.length} article${l1.ruptures.length>1?'s':''} en rupture clés pour les ${metier}s — CA récupérable : ${caLabel}`,fn:()=>{closeDiagnostic();clearCockpitFilter(true);_S.currentPage=0;switchTab('table');renderAll();}});
  }
  const nbMM=(l2?(l2.nonCal||0)+(l2.sousD||0):0);
  if(nbMM>0){
    const top5=(l2.detail||[]).slice(0,5);
    const detailHtml=top5.map(r=>`<span class="font-mono t-inverse-muted">${r.code}</span> ${r.lib} : ${r.ancienMin}→${r.nouveauMin}`).join(' · ');
    acts.push({priority:2,star:'⭐',label:`Recalibrer MIN/MAX — ${nbMM} au total, les 5 prioritaires : ${detailHtml}`,fn:()=>{closeDiagnostic();clearCockpitFilter(true);_S.currentPage=0;switchTab('table');renderAll();}});
  }
  if(l3&&l3.status!=='lock'&&l3.pct<70)acts.push({priority:3,star:'⭐⭐',label:`Améliorer la couverture rayon pour les ${metier}s (${l3.pct}% actuellement)`,fn:()=>{closeDiagnostic();if(_S.territoireReady)switchTab('territoire');}});
  if(l4&&l4.perdus>0){
    const potLabel=l4.potentiel>0?formatEuro(l4.potentiel):null;
    acts.push({priority:4,star:'⭐⭐⭐',label:`Démarcher ${l4.perdus} ${metier}${l4.perdus>1?'s':''} perdus${potLabel?' — potentiel '+potLabel:''}`,fn:()=>{
      // --- FIX SCROLL TERRITOIRE (Radar→Territoire + Diagnostic→Territoire) ---
      // 1. Fermer overlay inline
      const overlay=document.getElementById('diagnosticOverlay');
      overlay.classList.remove('active');
      document.body.style.overflow='';
      const _mc=document.getElementById('mainContent');
      if(_mc){_mc.style.overflow='';_mc.style.overflowY='';}
      const _ff=document.getElementById('filterFamille');
      if(_ff)_ff.value='';
      void overlay.offsetHeight; // reflow synchrone
      // 2. Reset les DEUX scroll containers (window scrolle aussi selon onglet source)
      window.scrollTo(0,0);
      if(_mc)_mc.scrollTop=0;
      // 3. Naviguer
      switchTab('territoire');
      // 4. Poll position cumulative stable, puis scroll
      let _lastTop=-1,_tries=0;
      const _poll=setInterval(()=>{
        const mc=document.getElementById('mainContent');
        const terr=document.getElementById('terrCockpitClient');
        if(!mc||!terr){if(++_tries>40)clearInterval(_poll);return;}
        // Position réelle relative au scroll container (pas juste offsetTop direct)
        let el=terr,top=0;
        while(el&&el!==mc){top+=el.offsetTop;el=el.offsetParent;}
        if((top===_lastTop&&top>0)||_tries++>40){
          clearInterval(_poll);
          window.scrollTo(0,0); // sécurité si window a re-scrollé
          mc.scrollTo({top:top-16,behavior:'smooth'});
        }else{_lastTop=top;}
      },100);
      // --- FIN FIX ---
    }});
  }
  return acts.sort((a,b)=>a.priority-b.priority);
}

// ── Level 4: Clients métier ──
function _diagLevel4(famille,hasChal,metierFilter){
  metierFilter=metierFilter||'';
  if(!hasChal)return{status:'lock',reason:'Chargez la Zone de Chalandise pour activer l\'analyse clients'};
  const famArts=new Set(_S.finalData.filter(r=>r.famille===famille).map(r=>r.code));
  if(!famArts.size)return{status:'warn',reason:'Aucun article trouvé pour cette famille dans les données stock',metiers:[]};
  // article → clients → métier
  const metierBuyers={};
  for(const artCode of famArts){const buyers=_S.articleClients.get(artCode);if(!buyers)continue;for(const cc of buyers){const info=_S.chalandiseData.get(cc);if(!info||!info.metier)continue;if(!clientMatchesDeptFilter(info)||!clientMatchesClassifFilter(info)||!clientMatchesStatutFilter(info)||!clientMatchesActivitePDVFilter(info)||!clientMatchesCommercialFilter(info))continue;if(!metierBuyers[info.metier])metierBuyers[info.metier]=new Set();metierBuyers[info.metier].add(cc);}}
  const totalBuyers=Object.values(metierBuyers).reduce((s,set)=>s+set.size,0);
  if(!totalBuyers)return{status:'warn',reason:'Aucun acheteur de cette famille identifié dans la chalandise — vérifiez que les codes clients correspondent entre Consommé et Chalandise',metiers:[]};
  let top3;
  if(metierFilter){const bs=metierBuyers[metierFilter];top3=bs?[[metierFilter,bs]]:[];}
  else{top3=Object.entries(metierBuyers).sort((a,b)=>b[1].size-a[1].size).slice(0,3);}
  const metiers=top3.map(([metier,buyerSet])=>{
    const pct=Math.round(buyerSet.size/totalBuyers*100);
    const clients=[];
    for(const[cc,info] of _S.chalandiseData.entries()){
      if(info.metier!==metier)continue;
      if(!clientMatchesDeptFilter(info)||!clientMatchesClassifFilter(info)||!clientMatchesStatutFilter(info)||!clientMatchesActivitePDVFilter(info)||!clientMatchesCommercialFilter(info))continue;
      const myData=_S.ventesClientArticle.get(cc);
      const famCA=myData?[...myData.entries()].filter(([c])=>famArts.has(c)).reduce((s,[,d])=>s+d.sumPrelevee,0):0;
      const prio=_diagClientPrio(info,famCA);
      clients.push({code:cc,nom:info.nom||'',statut:info.statut||'',activiteGlobale:info.activiteGlobale||info.activite||'',activitePDV:info.activitePDV||'',classification:info.classification||'',ca2025:info.ca2025||0,famCA,ville:info.ville||'',prio});
    }
    // sort: prio asc, then within prio: P1→ca2025 desc, P2/P3→classif prio then ca2025, P4→classif prio, P5→ca2025
    clients.sort((a,b)=>{
      if(a.prio!==b.prio)return a.prio-b.prio;
      const cp=_diagClassifPrio(a.classification)-_diagClassifPrio(b.classification);
      if(a.prio===1||a.prio===5)return b.ca2025-a.ca2025;
      return cp||b.ca2025-a.ca2025;
    });
    const p1=clients.filter(c=>c.prio===1);
    const p2=clients.filter(c=>c.prio===2);
    const p3=clients.filter(c=>c.prio===3);
    const p4=clients.filter(c=>c.prio===4);
    const potentiel=p2.reduce((s,c)=>s+(c.famCA>0?c.famCA:Math.round((c.ca2025||0)*0.05)),0)+p3.reduce((s,c)=>s+(c.famCA>0?c.famCA:Math.round((c.ca2025||0)*0.05)),0);
    return{metier,pct,total:clients.length,p1:p1.length,p2:p2.length,p3:p3.length,p4:p4.length,p5:clients.filter(c=>c.prio===5).length,potentiel,clients};
  });
  const totalPerdus=metiers.reduce((s,m)=>s+m.p2+m.p3,0);
  const totalPotentiel=metiers.reduce((s,m)=>s+m.potentiel,0);
  let crossCaptes=0,crossPot=0;
  if(_S.crossingStats){
    const famBuyerSet=new Set();for(const a of famArts){const b=_S.articleClients.get(a);if(b)for(const c of b)famBuyerSet.add(c);}
    crossCaptes=[...famBuyerSet].filter(c=>_S.crossingStats.captes.has(c)).length;
    for(const m of metiers)for(const c of m.clients){if(_S.crossingStats.potentiels.has(c.code))crossPot++;}
  }
  return{status:totalPerdus>2?'warn':'ok',totalBuyers,metiers,perdus:totalPerdus,potentiel:totalPotentiel,crossCaptes,crossPot};
}
function _diagRenderL4(l,hasChal){
  if(!hasChal||l.status==='lock')return`<div class="diag-level" style="opacity:.55"><div class="diag-level-hdr"><span class="font-bold text-sm t-inverse-muted">👥 Niveau 3 — Clients métier</span>${_diagBadge('lock')}</div><p class="text-xs t-inverse-muted">🔒 ${l.reason||'Chargez la Zone de Chalandise pour activer l\'analyse clients'}</p></div>`;
  if(!l.metiers?.length)return`<div class="diag-level"><div class="diag-level-hdr"><span class="font-bold text-sm c-danger">👥 Niveau 3 — Clients métier</span>${_diagBadge('warn')}</div><p class="text-xs t-inverse-muted">⚠️ ${l.reason||'Aucun métier identifié dans la chalandise pour cette famille'}</p></div>`;
  const metiersHtml=l.metiers.map((m,mIdx)=>{
    const pctActifPDV=m.total>0?Math.round(m.p5/m.total*100):0;
    const counters=[m.p5?`<span class="c-ok font-bold">${m.p5} actifs PDV (${pctActifPDV}%)</span>`:'',m.p1?`<span class="c-caution">${m.p1} Legallais sans PDV</span>`:'',(m.p2+m.p3)?`<span class="c-danger">${m.p2+m.p3} perdus</span>`:''].filter(Boolean).join(' · ');
    const metierEsc=m.metier.replace(/'/g,"\\'").replace(/"/g,'&quot;');
    return`<div class="${mIdx>0?'mt-3 pt-3 border-t b-dark':''} s-panel-inner/50 rounded-lg p-3">
      <div class="flex flex-wrap items-center gap-2 mb-1.5">
        <span class="text-xs font-extrabold c-danger">${m.metier}${_isMetierStrategique(m.metier)?' <span class="c-caution text-[10px]" title="Métier stratégique Legallais">⭐</span>':''}</span>
        <span class="text-[10px] font-bold c-caution bg-amber-900/30 px-2 py-0.5 rounded-full">${m.pct}% des acheteurs</span>
      </div>
      <p class="text-[11px] t-inverse mb-1">→ <strong class="text-white">${m.total}</strong> clients dans votre zone → ${counters}</p>
      ${m.potentiel>0?`<p class="text-[11px] c-caution font-bold mb-1.5">→ Potentiel récupérable : ${formatEuro(m.potentiel)}</p>`:''}
      <button class="mt-1 text-[10px] text-cyan-400 hover:text-cyan-300 border border-cyan-800 hover:border-cyan-600 px-3 py-1 rounded transition-colors" onclick="_navigateToOverviewMetier('${metierEsc}')">🔗 Voir le détail dans l'onglet Le Terrain →</button>
    </div>`;
  }).join('');
  return`<div class="diag-level">
    <div class="diag-level-hdr"><span class="font-bold text-sm c-danger">👥 Niveau 3 — Clients métier</span>${_diagBadge(l.status)}</div>
    <p class="text-xs t-inverse-muted mb-3">${l.isMetierMode?`<strong class="text-white">${l.totalBuyers}</strong> client${l.totalBuyers>1?'s':''} dans la zone`:`Top ${l.metiers.length} métier${l.metiers.length>1?'s':''} acheteurs · <strong class="text-white">${l.totalBuyers}</strong> identifié${l.totalBuyers>1?'s':''} dans la chalandise`}</p>
    ${metiersHtml}
    ${(l.crossCaptes||l.crossPot)?`<p class="text-[11px] t-inverse-muted mt-3 pt-2 border-t b-dark">🔀 Croisement zone : <span class="c-ok font-bold">🟢 ${l.crossCaptes||0} captés</span> · <span class="c-danger font-bold">🔴 ${l.crossPot||0} potentiels non captés</span></p>`:''}
  </div>`;
}

// ── Action Plan (3-voyant) ──
function _diagGenActions(famille,v1,v2,v3){
  const acts=[];
  // 📦 MON RAYON actions
  if(v1.ruptures&&v1.ruptures.length>0){
    const caLabel=v1.caPerduTotal>0?formatEuro(v1.caPerduTotal):formatEuro(v1.ruptures.reduce((s,r)=>s+Math.round(r.W*(_S.finalData.find(d=>d.code===r.code)?.prixUnitaire||0)),0))+' potentiel annuel';
    acts.push({priority:1,src:'📦',codes:v1.ruptures.map(r=>r.code),label:`Réassort ${v1.ruptures.length} article${v1.ruptures.length>1?'s':''} en rupture — CA récupérable : ${caLabel}`,fn:()=>{closeDiagnostic();document.getElementById('filterFamille').value=famille;document.getElementById('filterCockpit').value='ruptures';document.getElementById('activeCockpitLabel').textContent='🚨 Ruptures';document.getElementById('activeCockpitFilter').classList.remove('hidden');_S.currentPage=0;switchTab('table');renderAll();}});
  }
  if(v1.nbMM>0&&v1.statusMM!=='ok'){
    const top5=(v1.mmDetail||[]).slice(0,5);
    const detailHtml=top5.map(r=>`${r.code} ${r.lib} : ${r.ancienMin}→${r.nouveauMin}`).join(' · ');
    acts.push({priority:2,src:'📦',label:`Recalibrer MIN/MAX — ${v1.nbMM} au total : ${detailHtml}`,fn:()=>{closeDiagnostic();document.getElementById('filterFamille').value=famille;document.getElementById('filterCockpit').value='';document.getElementById('activeCockpitFilter').classList.add('hidden');_S.currentPage=0;switchTab('table');renderAll();}});
  }
  // 👥 MES CLIENTS actions
  if(v2&&v2.status!=='lock'&&v2.perdus>0){
    const potLabel=v2.potentiel>0?formatEuro(v2.potentiel):null;
    acts.push({priority:3,src:'👥',label:`Démarcher ${v2.perdus} client${v2.perdus>1?'s':''} perdus${potLabel?' — potentiel '+potLabel:''}`,fn:()=>{closeDiagnostic();window.scrollTo(0,0);const _mc1069=document.getElementById('mainContent');if(_mc1069){_mc1069.style.overflow='';_mc1069.scrollTop=0;}switchTab('territoire');let _lt1069=-1,_tr1069=0;const _pv1069=setInterval(()=>{const mc=document.getElementById('mainContent');const el=document.getElementById('terrCockpitClient');if(!mc||!el){if(++_tr1069>40)clearInterval(_pv1069);return;}let e=el,t=0;while(e&&e!==mc){t+=e.offsetTop;e=e.offsetParent;}if((t===_lt1069&&t>0)||_tr1069++>40){clearInterval(_pv1069);window.scrollTo(0,0);mc.scrollTo({top:t-16,behavior:'smooth'});if(!el.classList.contains('hidden')){const b=document.createElement('div');b.className='mb-3 px-3 py-2 bg-cyan-950 border border-cyan-700 rounded-lg text-[11px] text-cyan-200 font-semibold flex items-center gap-2';b.innerHTML=`<span class="flex-1">🔍 Diagnostic <strong>${famille}</strong> — ${v2.perdus} client${v2.perdus>1?'s':''} perdu${v2.perdus>1?'s':''}${potLabel?' · potentiel '+potLabel:''} · Voir <strong>🟠 À Développer</strong> ci-dessous</span><button onclick="this.parentElement.remove()" class="text-cyan-400 hover:text-white shrink-0 text-sm font-bold">✕</button>`;el.insertBefore(b,el.firstChild);}}else _lt1069=t;},100);}});
  }
  // 🔭 LE RÉSEAU actions
  if(v3&&v3.status!=='lock'){
    if(v3.missing?.length>0){
      acts.push({priority:4,src:'🔭',codes:v3.missing.map(a=>a.code),label:`Référencer ${v3.missing.length} article${v3.missing.length>1?'s':''} absents de votre rayon${v3.strongMissing>0?' — dont '+v3.strongMissing+' en forte rotation (A/B)':''}`,fn:()=>{closeDiagnostic();switchTab('bench');}});
    }
    // Famille marginale — CA médiane < 1000€ dans le réseau : pas d'action réseau exploitable
    if(v3.medCA>0&&v3.medCA<1000){
      if(v3.myCA===0)return [{priority:0,src:'✅',label:`Famille non pertinente — volume réseau insuffisant (médiane ${formatEuro(v3.medCA)}).`,fn:null,isInfo:true}];
      if(acts.length===0)acts.push({priority:99,src:'ℹ️',label:`Famille marginale dans le réseau (médiane ${formatEuro(v3.medCA)}). Pas d'action prioritaire.`,fn:null,isInfo:true});
    }
    // Famille absente chez moi mais réseau actif (CA médiane ≥ 1000€) → évaluer opportunité, sans lien cliquable
    if(v3.myCA===0&&v3.medCA>=1000&&acts.length===0){
      acts.push({priority:99,src:'⚠️',label:`Famille absente de votre rayon. Le réseau fait ${formatEuro(v3.medCA)} en médiane. Évaluez l'opportunité dans Le Réseau.`,fn:null,isInfo:true});
    }
  }
  // Sort by priority and limit to 3
  return acts.sort((a,b)=>a.priority-b.priority).slice(0,3);
}
function _copyDiagPlan(){
  if(!_S._diagPlanCopyText)return;
  navigator.clipboard.writeText(_S._diagPlanCopyText).then(()=>{
    const b=document.getElementById('_diagCopyBtn');
    if(b){b.textContent='✅ Copié';setTimeout(()=>{b.textContent='📋 Copier';},1500);}
  });
}
function _diagRenderPlan(famille,actions){
  if(!actions.length)return`<div class="mt-4 p-4 s-panel-inner border b-dark rounded-xl"><p class="text-xs c-ok">✅ Aucune action prioritaire — votre agence est bien calibrée pour cette famille.</p></div>`;
  // Conclusion pure (famille non pertinente / marginale sans action)
  if(actions.length===1&&actions[0].isInfo)return`<div class="mt-4 p-4 s-panel-inner border b-dark rounded-xl flex items-start gap-2"><span class="text-lg flex-shrink-0">${actions[0].src||'ℹ️'}</span><p class="text-xs t-inverse">${actions[0].label}</p></div>`;
  const realActs=actions.filter(a=>!a.isInfo);
  _S._diagPlanCopyText=realActs.map((a,i)=>`${i+1}. [${a.src||'📦'}] ${a.label}`).join('\n');
  return`<div class="mt-4 p-4 s-panel-inner border b-dark rounded-xl">
    <div class="flex items-center justify-between mb-3">
      <h3 class="font-extrabold text-sm text-white">📋 Plan d'action — <span class="text-cyan-400">${famille}</span></h3>
      <div class="flex items-center gap-2">
        <button id="_diagCopyBtn" onclick="_copyDiagPlan()" class="text-[10px] s-panel-inner hover:s-panel-inner t-inverse py-1 px-3 rounded font-bold">📋 Copier</button>
        <button onclick="exportDiagnosticCSV('${famille.replace(/'/g,"\\'")}')" class="text-[10px] s-panel-inner hover:s-panel-inner t-inverse py-1 px-3 rounded font-bold">📥 CSV</button>
      </div>
    </div>
    ${actions.map((a,i)=>a.isInfo?`<div class="px-3 py-2 rounded-lg s-panel-inner/50 border b-dark flex items-center gap-2 text-xs t-inverse mt-1"><span class="flex-shrink-0">${a.src||'ℹ️'}</span><span>${a.label}</span></div>`:`<div class="diag-action-row" onclick="executeDiagAction(${i})"><div class="flex items-center gap-2 min-w-0"><span class="diag-src-tag flex-shrink-0">${a.src||'📦'}</span><span class="text-xs font-semibold truncate">${i+1}. ${a.label}</span></div><div class="flex items-center gap-1 ml-3 flex-shrink-0">${(a.codes&&a.codes.length>0)?`<button onclick="event.stopPropagation();navigator.clipboard.writeText('${a.codes.join('\\n').replace(/'/g,"\\'")}').then(()=>{this.textContent='✅';setTimeout(()=>{this.textContent='📋'},1500)})" class="text-[10px] s-panel-inner py-0.5 px-2 rounded font-bold border b-dark" title="Copier ${a.codes.length} code${a.codes.length>1?'s':''}">📋</button>`:''}<span class="t-inverse-muted text-[10px]">→ Voir</span></div></div>`).join('')}
  </div>`;
}
function exportDiagnosticCSV(famille){
  const{v1,v2,v3,l1,l2,l3,l4}=_S._diagLevels;const SEP=';';
  const lines=['\uFEFF'+['Voyant','Type','Code','Libellé','Détail','Valeur'].join(SEP)];
  // V1 / L1 ruptures
  for(const r of((v1||l1)?.ruptures||[]))lines.push(['📦 Mon Agence - Rupture','Rupture',r.code,`"${r.lib}"`,`${r.jours}j rupture · Fréq:${r.W}`,r.ca||0].join(SEP));
  // V1 / L2 calibrage
  for(const r of((v1?.mmDetail)||(l2?.detail)||[]))lines.push(['📦 Mon Agence - Calibrage','MIN/MAX sous-dimensionné',r.code,`"${r.lib}"`,`Ancien MIN:${r.ancienMin} Nouveau MIN:${r.nouveauMin}`,''].join(SEP));
  // V2 / L4 clients perdus
  const v2metiers=(v2||l4)?.metiers||[];for(const m of v2metiers){for(const c of(m.clients||[]).filter(c=>c.prio===2||c.prio===3))lines.push(['👥 Mes Clients','Perdu à reconquérir',c.code,`"${c.nom}"`,c.statut,c.ca2025||0].join(SEP));}
  // V3 / L3 missing articles
  for(const a of((v3||l3)?.missing||[]))lines.push(['🔭 Le Réseau','Article manquant réseau',a.code,`"${a.lib}"`,`ABC:${a.abcClass} FMR:${a.fmrClass}`,a.medFreq||a.refFreq||''].join(SEP));
  for(const a of(v3?.inStockNotSold||[]))lines.push(['🔭 Le Réseau','En stock — 0 vente (vérifier visibilité rayon)',a.code,`"${a.lib}"`,`Stock:${a.stockActuel} ABC:${a.abcClass} FMR:${a.fmrClass}`,a.medFreq||''].join(SEP));
  const blob=new Blob([lines.join('\n')],{type:'text/csv;charset=utf-8;'});
  const link=document.createElement('a');link.href=URL.createObjectURL(blob);link.download=`PRISME_Diag_${famille.replace(/\W/g,'_')}_${new Date().toISOString().slice(0,10)}.csv`;document.body.appendChild(link);link.click();document.body.removeChild(link);URL.revokeObjectURL(link.href);
  showToast('📥 Plan de vol exporté','success');
}



export { openDiagnostic, openDiagnosticMetier, closeDiagnostic, executeDiagAction, closeArticlePanel, openArticlePanel, renderDiagnosticPanel, _renderDiagnosticCellPanel, exportDiagnosticCSV, _diagV3FilterCategory, toggleReconquestFilter, openClient360, _c360SwitchTab, _c360CopyResume };
