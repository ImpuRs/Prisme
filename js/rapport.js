// © 2026 Jawad El Barkaoui — Tous droits réservés
// PRISME — rapport.js
// Reporting : rapport région / texte de synthèse
// Extrait de main.js (oct. 2026). Les fonctions restent exposées via window.* dans main.js.
// ═══════════════════════════════════════════════════════════════
'use strict';

import { DORMANT_DAYS, METIERS_STRATEGIQUES } from './constants.js';
import { formatEuro, pct, fmtDate } from './utils.js';
import { _S } from './state.js';
import { _clientPassesFilters } from './engine.js';
import './parser.js';
import './ui.js';
import './cache.js';
import './sales.js';
import './helpers.js';
import './client-store.js';
import './chalandise-store.js';
import './agence-store.js';
import { DataStore } from './store.js';
import './diagnostic.js';
import './planRayon.js';
import './arbitrage.js';
import './stock-lab.js';
import './clients-decisions.js';
import './animation.js';
import './associations.js';
import './partie.js';
import './omni.js';
import './territoire.js';
import './commerce.js';


  // ── Reporting ──
  export function _getActiveFiltersLabel(){
    const parts=[];
    if(_S._selectedCommercial)parts.push(`Commercial : ${_S._selectedCommercial}`);
    if(_S._selectedMetier)parts.push(`Métier : ${_S._selectedMetier}`);
    if(_S._selectedDepts?.size)parts.push(`Dept : ${[..._S._selectedDepts].join(', ')}`);
    if(_S._selectedClassifs?.size)parts.push(`Classif : ${[..._S._selectedClassifs].join(', ')}`);
    if(_S._selectedActivitesPDV?.size)parts.push(`Activité PDV : ${[..._S._selectedActivitesPDV].join(', ')}`);
    if(_S._distanceMaxKm>0)parts.push(`Distance : ≤${_S._distanceMaxKm} km`);
    if(_S._filterStrategiqueOnly)parts.push('Métiers stratégiques uniquement');
    if(_S._selectedDirections?.size)parts.push(`Direction : ${[..._S._selectedDirections].join(', ')}`);
    if(_S._selectedUnivers?.size)parts.push(`Univers : ${[..._S._selectedUnivers].join(', ')}`);
    return parts.length?parts.join(' | '):'';
  }
  export function _clientPassesReportFilter(rec){
    const info=_S.chalandiseData?.get(rec.cc);
    // Hors zone (pas dans chalandise) → toujours inclus
    if(!info)return true;
    // En zone : distance ≤ 10km uniquement (si distance connue)
    if(info.distanceKm!=null&&info.distanceKm>10)return false;
    return _clientPassesFilters(info,rec.cc);
  }

  // ── Cohortes clients (partagé entre les deux prompts LLM) ──
  // Focus FID Pot+ / OCC Pot+ — CA agence uniquement (sans caAutresAgences)
  export function _computeClientCohorts(withTop5){
    const result={silencieuxCount:0,silencieuxCA:0,silTop5:[],perdusCount:0,perdusCA:0,potentielsCount:0};
    if(!_S.clientStore?.size)return result;
    const isPotPlus=(c)=>{const cl=(c||'').toUpperCase();return cl.includes('FID')&&cl.includes('POT+')||cl.includes('OCC')&&cl.includes('POT+');};
    const arr=withTop5?[]:null;
    for(const rec of _S.clientStore.values()){
      if(!_clientPassesReportFilter(rec))continue;
      if(!isPotPlus(rec.classification))continue;
      const d=rec.silenceDaysPDV??rec.silenceDaysAll;
      const ca=(rec.caPDV||0)+(rec.caHors||0); // CA agence uniquement
      // Silencieux : 30-60j
      if(d!==null&&d>30&&d<=60&&ca>0){
        result.silencieuxCount++;result.silencieuxCA+=ca;
        if(arr)arr.push({nom:rec.nom,ca,days:d});
      }
      // Perdus : 60-180j
      if(d!==null&&d>60&&d<=180&&ca>0){
        result.perdusCount++;result.perdusCA+=ca;
      }
      // Potentiels
      if(rec.crossStatus==='potentiel'&&rec.caLegallaisN1>=500&&rec.caLegallaisN1<=50000&&rec.commercial){
        result.potentielsCount++;
      }
    }
    if(arr){arr.sort((a,b)=>b.ca-a.ca);result.silTop5=arr.slice(0,5);}
    return result;
  }

  export function generateRegionReportText(){
    const pStart=_S.periodFilterStart||_S.consommePeriodMinFull||_S.consommePeriodMin;
    const pEnd=_S.periodFilterEnd||_S.consommePeriodMaxFull||_S.consommePeriodMax;
    const agence=_S.selectedMyStore||'—';
    const MOIS=['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'];
    const periodHuman=(()=>{
      if(!pStart||!pEnd)return null;
      try{
        const s=new Date(pStart),e=new Date(pEnd);
        const sm=MOIS[s.getMonth()],em=MOIS[e.getMonth()];
        if(s.getFullYear()===e.getFullYear()) return sm===em?`${sm} ${s.getFullYear()}`:`${sm} à ${em} ${e.getFullYear()}`;
        return `${sm} ${s.getFullYear()} à ${em} ${e.getFullYear()}`;
      }catch{return null;}
    })();
    const periodLabel=periodHuman?(periodHuman.charAt(0).toUpperCase()+periodHuman.slice(1)):(pStart&&pEnd?`${fmtDate(pStart)} → ${fmtDate(pEnd)}`:'—');
    const n=v=>(v||0).toLocaleString('fr');
    const e=v=>formatEuro(v||0);
    const pct=v=>v!=null?(+v).toFixed(2)+'%':'—';

    const _ca_all=_S.canalAgence||{};
    const caMag=_ca_all['MAGASIN']?.ca||0;
    const vmbMag=_ca_all['MAGASIN']?.sumVMB||0;
    const blMag=_ca_all['MAGASIN']?.bl||0;
    const caWeb=_ca_all['INTERNET']?.ca||0;
    const caRep=_ca_all['REPRESENTANT']?.ca||0;
    const caDcs=_ca_all['DCS']?.ca||0;
    const caTotal=Object.values(_ca_all).reduce((s,d)=>s+(d.ca||0),0);
    const blTotal=Object.values(_ca_all).reduce((s,d)=>s+(d.bl||0),0);
    const vmbTotal=Object.values(_ca_all).reduce((s,d)=>s+(d.sumVMB||0),0);
    const nbClientsPDV=_S.ventesLocalMagPeriode?.size||0;
    let nbClientsAll=nbClientsPDV;
    {const _bmc=_S._byMonthClients;if(_bmc){const _pMin=_S.periodFilterStart||_S.consommePeriodMinFull||_S.consommePeriodMin;const _pMax=_S.periodFilterEnd||_S.consommePeriodMaxFull||_S.consommePeriodMax;if(_pMin&&_pMax){const _si=_pMin.getFullYear()*12+_pMin.getMonth();const _ei=_pMax.getFullYear()*12+_pMax.getMonth();const _set=new Set();for(const midxStr in _bmc){const midx=+midxStr;if(midx>=_si&&midx<=_ei)for(const cc of _bmc[midxStr])_set.add(cc);}if(_set.size>0)nbClientsAll=_set.size;}}else if(_S._clientsTousCanaux instanceof Set&&_S._clientsTousCanaux.size>0){nbClientsAll=_S._clientsTousCanaux.size;}}
    const txMarge=caTotal>0?vmbTotal/caTotal*100:0;
    const txMargeMag=caMag>0?vmbMag/caMag*100:0;

    let serviceOk=0,serviceTotal=0;
    for(const r of DataStore.finalData){if((r.fmrClass==='F'||r.fmrClass==='M')&&r.W>=1&&!r.isParent&&!(r.V===0&&r.enleveTotal>0)){serviceTotal++;if(r.stockActuel>0)serviceOk++;}}
    const txDispo=serviceTotal>0?Math.round((serviceOk/serviceTotal)*100):null;
    const ruptures=DataStore.finalData.filter(r=>(r.fmrClass==='F'||r.fmrClass==='M')&&r.W>=1&&r.stockActuel<=0&&!r.isParent&&!(r.V===0&&r.enleveTotal>0));
    const dormants=DataStore.finalData.filter(r=>!r.isNouveaute&&r.ageJours>DORMANT_DAYS&&(r.stockActuel*r.prixUnitaire)>50);
    const dormantVal=Math.round(dormants.reduce((s,r)=>s+r.stockActuel*r.prixUnitaire,0));
    const valStock=Math.round(DataStore.finalData.reduce((s,r)=>s+(r.stockActuel||0)*(r.prixUnitaire||0),0));

    const kpis=_S.benchLists.obsKpis;
    const hasBench=!!kpis;
    const lose=(_S.benchLists.obsFamiliesLose||[]).slice(0,5);
    const win=(_S.benchLists.obsFamiliesWin||[]).slice(0,5);
    const manquants=_S.benchLists.missed||[];
    const sp=_S.benchLists.storePerf||{};
    const spSorted=Object.entries(sp).sort((a,b)=>(b[1].ca||0)-(a[1].ca||0));
    const myRankIdx=spSorted.findIndex(([s])=>s===_S.selectedMyStore);

    const _coh2=_computeClientCohorts(false);
    const {silencieuxCount,silencieuxCA,perdusCount,perdusCA,potentielsCount}=_coh2;
    const nbNomades=(_S.reseauNomades||[]).length;

    // ── KPIs dérivés ──
    const vmc=blTotal>0?Math.round(caTotal/blTotal):0;
    const caParClient=nbClientsAll>0?Math.round(caTotal/nbClientsAll):0;
    const freqClient=nbClientsAll>0?(blTotal/nbClientsAll).toFixed(1):0;

    // ── Concentration commerciale (top 1 poids %) — CA agence uniquement ──
    let topComPct=0,topComName='',nbCom=0;
    if(_S.clientStore?.size && _S.chalandiseReady){
      const _comCA=new Map();
      for(const rec of _S.clientStore.values()){
        if(!_clientPassesReportFilter(rec))continue;
        const com=rec.commercial;if(!com)continue;
        const ca=(rec.caPDV||0)+(rec.caHors||0); // CA sur cette agence uniquement
        if(ca>0)_comCA.set(com,(_comCA.get(com)||0)+ca);
      }
      if(_comCA.size>0){
        nbCom=_comCA.size;
        const _sorted=[..._comCA.entries()].sort((a,b)=>b[1]-a[1]);
        topComName=_sorted[0][0];
        topComPct=caTotal>0?Math.round(_sorted[0][1]/caTotal*100):0;
      }
    }

    // ── Top 5 ruptures pour données ──
    const topRupt=ruptures.sort((a,b)=>(b.W||0)-(a.W||0)).slice(0,5);

    const filtersLabel=_getActiveFiltersLabel();
    const L=[];
    L.push(`RÔLE : Tu es chef d'agence en distribution B2B quincaillerie (réseau Legallais). Tu rédiges le reporting mensuel pour ta direction régionale.`);
    L.push(``);
    L.push(`FORMAT : Texte brut pour cellule Excel. Pas de markdown, pas de #, pas de **, pas de bullet unicode.`);
    L.push(`Titres en MAJUSCULES suivis d'un retour ligne. Tirets simples (-) pour les listes.`);
    L.push(``);
    L.push(`POSTURE : Parle au nom de l'agence et de l'équipe. Dire "l'agence", "on", "l'équipe". Jamais "je/mon/mes".`);
    L.push(`Bon : "L'agence termine à 500k€" — "On cible les silencieux de Laborialle".`);
    L.push(`Mauvais : "Je finis à 500k€" — "Mon équipe va relancer".`);
    L.push(``);
    L.push(`PRIORITÉ (identifier AVANT de rédiger) :`);
    L.push(`- 1 moteur : ce qui tire le CA ce mois`);
    L.push(`- 1 risque : ce qui peut faire perdre du CA`);
    L.push(`- 1 levier : action à fort ROI immédiat`);
    L.push(`Ces 3 éléments DOIVENT apparaître dans la synthèse ou les actions.`);
    L.push(``);
    L.push(`HIÉRARCHIE DES RÈGLES :`);
    L.push(`1. Impact business > 2. Structure du reporting > 3. Style d'écriture.`);
    L.push(`En cas de conflit, privilégier l'impact business.`);
    L.push(``);
    L.push(`RÈGLES D'ÉCRITURE :`);
    L.push(`- RÈGLE ABSOLUE : 1 phrase = 1 idée = 1 impact business. Interdiction de cumuler plusieurs idées dans une phrase.`);
    L.push(`- Phrases courtes, toujours chiffrées. Pas d'adjectifs superflus.`);
    L.push(`- Pas de dramatisation ("scandale", "naufrage", "foudroyant").`);
    L.push(`- Pas de jargon technique ("F+M" = "articles courants", jamais "ABC/FMR").`);
    L.push(`- Chaque constat DOIT conclure par son impact business — MAIS varier les transitions :`);
    L.push(`  Direct : "Marge à -1.5 pts vs médiane. Impact immédiat sur la rentabilité."`);
    L.push(`  Implicite : "Fréquence stable à 3.2 BL/client, ce qui limite la croissance."`);
    L.push(`  Décisionnel : "Priorité : activer la vente proactive."`);
    L.push(`  Tension : "Risque immédiat sur la performance."`);
    L.push(`  JAMAIS "Donc" systématique — le texte doit se lire comme un brief oral, pas un formulaire.`);
    L.push(`- Contraste forces/faiblesses — le lecteur sent l'équilibre.`);
    L.push(`- 350 mots max. Densité > exhaustivité.`);
    L.push(`- ANTI-DILUTION : si une information n'explique pas un écart et ne justifie pas une action, la supprimer.`);
    L.push(`- INTERDIT : phrase sans impact business. Phrase purement descriptive.`);
    L.push(`- INTERDIT : inventer des données, des noms de clients, des montants absents des données fournies.`);
    L.push(``);
    L.push(`GESTION DES DONNÉES :`);
    L.push(`- Donnée manquante → hypothèse prudente, signalée entre parenthèses.`);
    L.push(`- Données incohérentes → privilégier la tendance, pas la précision.`);
    L.push(`- Ne jamais arrondir un écart à zéro. Si l'écart existe, le montrer.`);
    L.push(``);
    L.push(`STRUCTURE (6 sections, dans cet ordre) :`);
    L.push(``);
    L.push(`1. SYNTHÈSE (2 phrases max)`);
    L.push(`La première phrase DOIT contenir : rang + CA + écart médiane + moteur OU risque.`);
    L.push(`Conclure : mois de conquête, consolidation, ou alerte.`);
    L.push(``);
    L.push(`2. PERFORMANCE (3-4 phrases)`);
    L.push(`CA total, VMC (${e(vmc)}), CA/client (${e(caParClient)}), fréquence (${freqClient} BL/client), marge vs médiane réseau.`);
    L.push(`Canaux en UNE phrase (répartition %). Conclure : qu'est-ce qui porte ou freine la performance ?`);
    L.push(``);
    L.push(`3. STOCK (2-3 phrases)`);
    L.push(`Dispo articles courants, ruptures (citer les 2-3 plus critiques par nom), dormants en €.`);
    L.push(`Verdict obligatoire : FREIN BUSINESS / NEUTRE / LEVIER.`);
    L.push(``);
    L.push(`4. RÉSEAU + MÉTIERS (4-5 phrases)`);
    L.push(`Position réseau en UNE phrase (rang, écart CA vs médiane).`);
    L.push(`2-3 familles fortes + 2-3 en retrait (avec gap €).`);
    L.push(`Croiser avec les métiers : quel métier stratégique est sous-capté (captation <20%) ?`);
    L.push(`Quel métier zone n'achète PAS du tout chez nous (non captés) ?`);
    L.push(`NE PAS lister — extraire les 2-3 insights qui changent une décision.`);
    L.push(``);
    L.push(`5. DYNAMIQUE COMMERCIALE (3-4 phrases)`);
    L.push(`Concentration : ${nbCom} commerciaux, top 1 = ${topComName} (${topComPct}% du CA). Réparti ou concentré ?`);
    L.push(`Silencieux + perdus en € (pas de noms). Potentiels : combien, quel levier.`);
    L.push(`Conclure : l'équipe commerciale est-elle en phase d'attaque ou en défense ?`);
    L.push(``);
    L.push(`6. NOS 3 ACTIONS (3 lignes)`);
    L.push(`Format par action : [Donnée déclencheur] → [Geste concret] → [Date butoir] → [Résultat attendu €].`);
    L.push(`Mauvais : "Relancer les potentiels".`);
    L.push(`Bon : "Phoning Laborialle sur ses 9 silencieux (>10k€ CA) — objectif 3 réactivations avant le 25/05".`);
    L.push(`Chaque action doit être traçable dans 1 mois.`);
    L.push(``);
    L.push(`CHECK FINAL (OBLIGATOIRE AVANT ENVOI) :`);
    L.push(`Vérifier mentalement avant de répondre :`);
    L.push(`- Le moteur est-il clairement identifiable ? OUI/NON`);
    L.push(`- Le risque est-il chiffré ? OUI/NON`);
    L.push(`- Le levier est-il actionnable et daté ? OUI/NON`);
    L.push(`- Chaque phrase contient-elle un impact business ? OUI/NON`);
    L.push(`- Une phrase descriptive subsiste-t-elle ? OUI/NON`);
    L.push(`Si une réponse = NON → corriger avant envoi.`);
    L.push(``);
    L.push(`OBJECTIF : Un directeur régional qui lit ce reporting en 90 secondes sait exactement où l'agence en est, ce qui va, ce qui coince, et ce qu'on fait concrètement ce mois-ci.`);
    L.push('');
    L.push(`═══════════════════════════════════════════════════`);
    L.push(`DONNÉES AGENCE ${agence} — ${periodLabel}`);
    L.push(`PÉRIMÈTRE ANALYSÉ : clients ≤10km + hors zone · classifications FID Pot+ / OCC Pot+ · métiers stratégiques uniquement`);
    if(filtersLabel)L.push(`FILTRES UI ACTIFS : ${filtersLabel}`);
    L.push(`═══════════════════════════════════════════════════`);

    L.push('');L.push('VENTES');
    L.push(`CA total : ${e(caTotal)} | BL : ${n(blTotal)} | Clients : ${n(nbClientsAll)}`);
    L.push(`Marge globale : ${pct(txMarge)} | VMB : ${e(Math.round(vmbTotal))}`);
    L.push(`VMC : ${e(vmc)} | CA/client : ${e(caParClient)} | Fréquence : ${freqClient} BL/client`);
    if(caMag>0)L.push(`Comptoir : ${e(caMag)} (${caTotal>0?Math.round(caMag/caTotal*100):0}%) marge ${pct(txMargeMag)} | ${n(nbClientsPDV)} clients`);
    if(caWeb>0)L.push(`Internet : ${e(caWeb)}`);
    if(caRep>0)L.push(`Représentant : ${e(caRep)}`);
    if(caDcs>0)L.push(`DCS : ${e(caDcs)}`);

    L.push('');L.push('STOCK');
    L.push(`Valeur : ${e(valStock)} | ${n(DataStore.finalData.length)} réf.`);
    if(txDispo!=null)L.push(`Disponibilité articles courants : ${txDispo}%`);
    L.push(`Ruptures articles courants : ${n(ruptures.length)} | Dormants : ${n(dormants.length)} (${e(dormantVal)})`);
    if(topRupt.length>0){L.push('Top ruptures :');for(const r of topRupt)L.push(`  ${r.code} ${r.libelle||''} (W=${r.W}, fam ${r.famille||''})`);}

    if(hasBench){
      L.push('');L.push('POSITION RÉSEAU');
      if(myRankIdx>=0)L.push(`Rang CA : #${myRankIdx+1}/${spSorted.length}`);
      L.push(`CA : ${e(kpis.mine?.ca||0)} vs méd. ${e(kpis.compared?.ca||0)} (${kpis.compared?.ca>0?Math.round(((kpis.mine?.ca||0)-(kpis.compared?.ca||0))/(kpis.compared?.ca)*100):0}%)`);
      L.push(`Marge : ${pct(kpis.mine?.txMarge)} vs méd. ${pct(kpis.compared?.txMarge)}`);
      L.push(`Clients : ${n(kpis.mine?.nbClients||0)} vs méd. ${n(kpis.compared?.nbClients||0)}`);
      if(manquants.length>0)L.push(`Incontournables manquants : ${n(manquants.filter(m=>(m.myFreq||0)===0).length)} absents + ${n(manquants.filter(m=>(m.myFreq||0)>0).length)} sous-exploités`);
      if(lose.length>0){L.push('');L.push('FAMILLES EN RETRAIT');for(const f of lose)L.push(`  ${f.fam} : ${e(f.caMe)} vs méd. ${e(f.caOther)} (${f.ecartPct}%)`);}
      if(win.length>0){L.push('');L.push('FAMILLES FORTES');for(const f of win)L.push(`  ${f.fam} : ${e(f.caMe)} vs méd. ${e(f.caOther)} (+${f.ecartPct}%)`);}
    }

    // Commerciaux contributeurs — CA agence uniquement (sans caAutresAgences)
    if(_S.clientStore?.size && _S.chalandiseReady){
      const comCA=new Map();
      const comCli=new Map();
      const comSil=new Map();
      for(const rec of _S.clientStore.values()){
        if(!_clientPassesReportFilter(rec))continue;
        const com=rec.commercial;
        if(!com)continue;
        const ca=(rec.caPDV||0)+(rec.caHors||0); // CA sur cette agence uniquement
        if(ca>0){
          comCA.set(com,(comCA.get(com)||0)+ca);
          comCli.set(com,(comCli.get(com)||0)+1);
        }
        const d=rec.silenceDaysPDV??rec.silenceDaysAll;
        if(d!==null&&d>30&&d<=180&&ca>0){
          comSil.set(com,(comSil.get(com)||0)+1);
        }
      }
      if(comCA.size>0){
        const sorted=[...comCA.entries()].sort((a,b)=>b[1]-a[1]);
        L.push('');L.push('COMMERCIAUX CONTRIBUTEURS');
        for(const [com,ca] of sorted){
          const cli=comCli.get(com)||0;
          const sil=comSil.get(com)||0;
          const silTag=sil>0?` | ${sil} silencieux/perdus`:'';
          L.push(`  ${com} : ${e(ca)} CA agence, ${n(cli)} clients actifs${silTag}`);
        }
      }
    }

    // Directions / Secteurs (territoire)
    if(_S.terrContribByDirection?.size>0){
      L.push('');L.push('DIRECTIONS COMMERCIALES (territoire)');
      const sorted=[..._S.terrContribByDirection.entries()].sort((a,b)=>(b[1].ca||0)-(a[1].ca||0));
      for(const [dir,d] of sorted){
        if(!d.ca)continue;
        L.push(`  ${dir} : ${e(d.ca)} CA, ${n(d.blTerr||0)} BL territoire`);
      }
    }

    // Métiers stratégiques (chalandise) — focus FID Pot+ / OCC Pot+
    if(_S.clientStore?.size && _S.chalandiseReady){
      const isStrat=(m)=>{const ml=m.toLowerCase();return METIERS_STRATEGIQUES.some(s=>ml.includes(s));};
      const isPotPlus=(c)=>{const cl=(c||'').toUpperCase();return cl.includes('FID')&&cl.includes('POT+')||cl.includes('OCC')&&cl.includes('POT+');};
      const metActifCA=new Map();
      const metActifCli=new Map();
      const metZoneCli=new Map();
      const metZoneCA=new Map();
      for(const rec of _S.clientStore.values()){
        if(!_clientPassesReportFilter(rec))continue;
        const met=rec.metier;
        if(!met||!isStrat(met))continue; // stratégiques uniquement
        // Zone : FID Pot+ / OCC Pot+ uniquement
        if(rec.inChalandise&&isPotPlus(rec.classification)){
          metZoneCli.set(met,(metZoneCli.get(met)||0)+1);
          metZoneCA.set(met,(metZoneCA.get(met)||0)+(rec.ca2026||0));
        }
        // Clients actifs à l'agence (FID Pot+ / OCC Pot+)
        const ca=(rec.caPDV||0)+(rec.caHors||0);
        if(ca>0&&isPotPlus(rec.classification)){
          metActifCA.set(met,(metActifCA.get(met)||0)+ca);
          metActifCli.set(met,(metActifCli.get(met)||0)+1);
        }
      }
      if(metActifCA.size>0||metZoneCli.size>0){
        const allMets=new Set([...metActifCA.keys(),...metZoneCli.keys()]);
        const metRows=[...allMets].map(met=>{
          const caAg=metActifCA.get(met)||0;
          const cliActifs=metActifCli.get(met)||0;
          const cliZone=metZoneCli.get(met)||0;
          const caZone=metZoneCA.get(met)||0;
          const captation=cliZone>0?Math.round(cliActifs/cliZone*100):null; // captation clients (pas CA)
          return {met,caAg,cliActifs,cliZone,caZone,captation};
        }).sort((a,b)=>b.caZone-a.caZone);

        L.push('');L.push('MÉTIERS STRATÉGIQUES (FID Pot+ / OCC Pot+ · ≤10km)');
        for(const m of metRows){
          const captStr=m.captation!=null?` captation ${m.captation}% (${n(m.cliActifs)}/${n(m.cliZone)})`:'';
          L.push(`  ${m.met} : ${e(m.caAg)} CA agence / ${e(m.caZone)} CA zone${captStr}`);
        }
        const nonCaptes=metRows.filter(m=>m.cliActifs===0&&m.cliZone>0).sort((a,b)=>b.caZone-a.caZone);
        if(nonCaptes.length>0){
          L.push('  NON CAPTÉS :');
          for(const m of nonCaptes.slice(0,5)){
            L.push(`    ${m.met} : ${e(m.caZone)} CA zone, ${n(m.cliZone)} clients — 0 captés`);
          }
        }
      }
    }

    L.push('');L.push('CLIENTS');
    if(silencieuxCount>0)L.push(`Silencieux 30-60j : ${n(silencieuxCount)} (${e(silencieuxCA)} CA en jeu)`);
    if(perdusCount>0)L.push(`Perdus 60-180j : ${n(perdusCount)} (${e(perdusCA)} CA en jeu)`);
    if(potentielsCount>0)L.push(`Potentiels jamais venus au comptoir : ${n(potentielsCount)}`);
    if(nbNomades>0)L.push(`Nomades multi-agences : ${n(nbNomades)}`);

    L.push('');L.push(`═══════════════════════════════════════════════════`);
    L.push(`Source : PRISME · ${periodLabel} · ${new Date().toLocaleDateString('fr-FR')}`);
    return L.join('\n');
  }
  // ── Cockpit Client (Urgences / Développer / Fidéliser) ──
