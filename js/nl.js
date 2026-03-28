// © 2026 Jawad El Barkaoui — Tous droits réservés
// PRISME — nl.js
// Moteur NL : pipeline + 53 fonctions _nlQ_Xxx()
// Dépend de : constants.js, utils.js, state.js, store.js, engine.js
// ═══════════════════════════════════════════════════════════════
'use strict';
import { PAGE_SIZE, AGE_BRACKETS, DORMANT_DAYS } from './constants.js';
import { fmtDate, formatEuro, _isMetierStrategique, famLib, famLabel, normalizeStr, matchQuery } from './utils.js';
import { _S } from './state.js';
import { DataStore } from './store.js';
import { calcPriorityScore } from './engine.js';

// ── NL Search — interpréteur de requêtes françaises ─────────────────────────

function _nlNorm(s) {
  return s.toLowerCase()
    .replace(/[àáâã]/g,'a').replace(/[éèêë]/g,'e').replace(/[îï]/g,'i')
    .replace(/[ôö]/g,'o').replace(/[ùûü]/g,'u').replace(/ç/g,'c');
}

function _nlEntities(raw) {
  const daysM  = raw.match(/(\d+)\s*jours?/);
  const weeksM = raw.match(/(\d+)\s*semaines?/);
  const monthsM= raw.match(/(\d+)\s*mois/);
  const eurosM = raw.match(/(\d+)\s*(?:euro|€)/);
  const topNM  = raw.match(/top\s*(\d+)/);
  const simN   = (raw.match(/\b(\d+)\b/)||[])[1];
  const days   = daysM ? +daysM[1] : weeksM ? +weeksM[1]*7 : monthsM ? +monthsM[1]*30 : 0;
  const euros  = eurosM ? +eurosM[1] : 0;
  const n      = topNM ? Math.min(+topNM[1],50) : simN ? Math.min(+simN,50) : 10;
  let commercial = null;
  if (_S.clientsByCommercial?.size) {
    for (const [c] of _S.clientsByCommercial) {
      const tokens = _nlNorm(c).split(/[\s\-_]/);
      if (tokens.some(t => t.length > 3 && raw.includes(t))) { commercial = c; break; }
    }
  }
  let metier = null;
  if (_S.clientsByMetier?.size) {
    for (const [m] of _S.clientsByMetier) {
      const mN = _nlNorm(m);
      if (mN.length >= 4 && raw.includes(mN.slice(0,Math.min(7,mN.length)))) { metier = m; break; }
    }
  }
  return { days, euros, n, commercial, metier };
}

export function _nlInterpret(q) {
  if (!q?.trim() || !_S.finalData?.length) return null;
  const raw = _nlNorm(q);
  const e   = _nlEntities(raw);
  if (/taux.{0,10}(service|serv)/.test(raw))                                              return _nlQ_TauxService();
  if (/dormant/.test(raw))                                                                return _nlQ_StockDormant(e.n);
  if (/sans.{0,10}(min|max)|anomalie.{0,10}(min|max)/.test(raw))                        return _nlQ_AnomaliesMinMax();
  if (/incoher|erp.{0,10}(bug|erreur|probl|anomal)|min.{0,5}sup.{0,5}max|calibr.{0,10}(manqu|absent)|surstoc.{0,10}max|sur.{0,5}stoc.{0,10}(max|plafond)/.test(raw)) return _nlQ_IncoherencesERP();
  if (/derive|ecart.{0,10}(min|max|erp)|min.{0,10}(ecart|differ|faux|mauvais|trop)|erp.{0,10}(sous|sures|decal)|desynchro|reglage.{0,10}(min|max)/.test(raw)) return _nlQ_DeriveMinMax();
  if (/(web|internet).{0,12}client|client.{0,12}(web|internet)/.test(raw))              return _nlQ_ClientsWeb(e.n);
  if (/representant/.test(raw) && /(unique|seule?|exclusiv|que rep|seulement)/.test(raw)) return _nlQ_ClientsRepOnly();
  if (/rupture/.test(raw) && /(top|client|principal|meilleur|gros)/.test(raw))          return _nlQ_RupturesTopClients();
  if (/concentr|icc|risque.{0,10}client|client.{0,10}(risque|50.{0,4}ca|gros|majeur|clef|cle)|top.{0,10}client.{0,10}(ca|pct|part|poids)/.test(raw)) return _nlQ_ConcentrationClient();
  if (/fidel|loyal|rfv|fls|score.{0,10}client|client.{0,10}score|meill.{0,10}client|top.{0,10}(fidel|loyal|client.{0,6}actif)/.test(raw)) return _nlQ_FideliteClients();
  if (/panier.{0,10}(metier|moyen)|vmc.{0,10}metier|metier.{0,10}(panier|vmc|ca.{0,4}client|commande)|ca.{0,6}client.{0,6}metier/.test(raw)) return _nlQ_PanierMetier();
  if (e.commercial && /(silence|absent|sans commande|perdu)/.test(raw))                 return _nlQ_CommercialSilent(e.commercial, e.days||30);
  if (e.metier && /(silence|absent|perdu|disparu)/.test(raw))                           return _nlQ_ClientsSilencieux(e.days||90, 0, e.metier);
  if (/(silence|absent|perdu|disparu)/.test(raw) && /client/.test(raw))                return _nlQ_ClientsSilencieux(e.days||45, e.euros, null);
  if (/nouveau.{0,12}client|client.{0,12}nouveau|premier.{0,12}achat/.test(raw))       return _nlQ_NouveauxClients(e.days||30);
  if (/hors.{0,10}agence/.test(raw) && e.euros>0)                                      return _nlQ_ClientsHorsAgence(e.euros);
  if (/sous.{0,10}(mediane|median)|retard.{0,10}reseau|reseau.{0,10}(mieux|meilleur)/.test(raw)) return _nlQ_FamillesSousMediane();
  if (/digital|numerique|(pass|devenu).{0,10}(web|internet|rep)|plus.{0,10}comptoir/.test(raw)) return _nlQ_ClientsDigitaux();
  if (e.commercial && /(fuyant|famille|portefeuille|hors.{0,10}agence|manque)/.test(raw))    return _nlQ_CommercialFuites(e.commercial);
  if (/(fuit|fuyant).{0,10}(par|commercial|portefeuille)|commercial.{0,10}(fuit|fuyant)/.test(raw)) return _nlQ_CommercialFuites(null);
  if (/heatmap.{0,10}(fuit|fam|metier)|fuit.{0,10}(metier|par)|famille.{0,10}metier|metier.{0,10}fuit/.test(raw)) return _nlQ_HeatmapFuites();
  if (/fuyant|famille.{0,10}hors|hors.{0,10}famille|echap|fugit/.test(raw))                  return _nlQ_FamillesHors();
  if (/hybri(de|d)/.test(raw))                                                               return _nlQ_OmniSegment('hybride');
  if (/mono.{0,10}(comptoir|pdv|magasin)|fidele.{0,10}(pdv|comptoir)|que.{0,5}comptoir/.test(raw)) return _nlQ_OmniSegment('mono');
  if (/full.{0,6}digital|100.{0,5}digital|tout.{0,6}digital/.test(raw))                     return _nlQ_OmniSegment('digital');
  if (/segment.{0,10}omni|omnicanal/.test(raw))                                              return _nlQ_OmniSegment(null);
  if (/saison.{0,15}(prochain|next|futur|mois|alerte|risque)|prochain.{0,10}mois.{0,10}saison|pic.{0,10}saison|alerte.{0,10}saison/.test(raw)) return _nlQ_SaisonProchainMois();
  if (/synthese.{0,12}commercial|commercial.{0,12}(synthese|tableau|score|bilan|recap|portrait|classement)|portefeuille.{0,10}(synthese|bilan|global|tous)|tous.{0,8}commercial/.test(raw)) return _nlQ_SyntheseCommercial();
  if (/radar.{0,10}fam|scatter.{0,10}fam|carte.{0,10}fam|nuage.{0,10}fam|position.{0,10}fam|fam.{0,10}(radar|scatter|carte|bulle|plot)/.test(raw)) return _nlQ_RadarFamilles();
  if (/evolution.{0,10}fam|variation.{0,10}fam|fam.{0,10}(evolution|variation|hausse|baisse|delta|trend|mois)|mois.{0,10}(precedent|avant|compare|vs)|delta.{0,10}(fam|ca|mois)|tendance.{0,10}fam/.test(raw)) return _nlQ_EvolutionFamille();
  if (/rupture.{0,10}(proch|bientot|futur|j.{0,4}30|dans|immin)|stock.{0,10}(j.{0,4}30|tombe|epuis|fin)|va.{0,10}(tomber|manquer|rupture)|prevision.{0,10}rupture|risque.{0,10}rupture.{0,10}(proch|court)/.test(raw)) return _nlQ_PrevisionRupture();
  if (/relance|a.{0,6}appeler|a.{0,6}contacter|clients.{0,10}(mois|semaine|priorite)|agenda.{0,6}client|priorite.{0,6}client/.test(raw)) return _nlQ_RelanceClients();
  if (/nouveaute.{0,10}(calibr|sans.{0,5}erp|sans.{0,5}min|sans.{0,5}max|regler|parametr)|calibr.{0,10}nouveaute|a.{0,6}regler.{0,6}(erp|min|max)|min.{0,10}max.{0,10}(manqu|absent).{0,10}nouv/.test(raw)) return _nlQ_NouveautesCalibrer();
  if (/comment.{0,10}(je.{0,5}me.{0,5}positio|je.{0,5}suis)|positio.{0,10}(reseau|vs|par rapport)|mon.{0,6}rang|vs.{0,6}reseau|benchmark.{0,6}(moi|mon|agence)|je.{0,6}vs/.test(raw)) return _nlQ_PositionReseau();
  if (/dormant.{0,10}(fuyant|recup|ailleur|hors|perdu|opportun)|stock.{0,10}(mort|dorm).{0,10}(recup|fuyant|ailleur)|recup.{0,10}dormant/.test(raw)) return _nlQ_DormantsRecuperables();
  if (/rupture.{0,10}(repet|chroni|toujours|souvent|regulier)|chroni.{0,10}rupture|toujours.{0,10}(en.{0,5}rupture|rupture)|souvent.{0,10}(en.{0,5}rupture|rupture)/.test(raw)) return _nlQ_RupturesRepetees();
  if (/qualite.{0,10}(donnee|donnée|data|analys)|fiabilite|donnee.{0,10}(manquante|incomplete|absent)|taux.{0,10}(couverture|remplissage|completude)|score.{0,6}(donnee|qualite)/.test(raw)) return _nlQ_QualiteDonnees();
  if (/sous.{0,8}min(?!max)|en.{0,8}dessous.{0,10}(min|seuil)|reappro.{0,10}(urgent|priorit)|reassort.{0,10}(urgent|avant|alerte)|stock.{0,10}(mini|minimum|seuil)/.test(raw)) return _nlQ_SousMinERP();
  if (/cross.{0,5}sell|achete.{0,10}ensemble|fam.{0,10}(associ|combin|coachete|panier)|combina.{0,6}fam|souvent.{0,8}achete.{0,8}ensemble/.test(raw)) return _nlQ_CrossSellFamilles();
  if (/solder|vieux.{0,8}stock|surplus|depreci|trop.{0,6}vieux|anciens?.{0,8}(stock|ref|article)|stock.{0,8}(age|ancien|obsolete)/.test(raw)) return _nlQ_ArticlesSolder();
  if (/canal.{0,10}(par|famille|fam|repartition|dominan)|fam.{0,10}(canal|web|internet|representant)|quel.{0,8}canal|repartition.{0,8}canal|web.{0,8}(par|famille)/.test(raw)) return _nlQ_CanauxFamille();
  if (/briefing|synthese.{0,8}(jour|matin|rapide)|ce.{0,5}matin.{0,8}(resume|bilan|synthese)|bilan.{0,8}rapide|resume.{0,8}(journee|jour|quotidien)/.test(raw)) return _nlQ_BriefingJour();
  if (/fiche.{0,8}article|detail.{0,8}article|article.{0,8}\d{6}|\d{6}.{0,8}(fiche|detail|info)|article.{0,8}(info|synthese|resume)/.test(raw)) return _nlQ_FicheArticle(raw);
  if (/qui.{0,8}n.{0,4}achete.{0,8}(pas|jamais).{0,10}(fam|famille)|potentiel.{0,8}(fam|famille)|client.{0,8}(manque|absent).{0,10}fam|fam.{0,10}(absent|manque).{0,8}client|n.{0,4}achete.{0,8}(pas|jamais).{0,8}cette/.test(raw)) return _nlQ_PotentielFamille(raw);
  if (e.commercial && /profil|bilan|portefeuille|resume|scorecard|fiche/.test(raw))             return _nlQ_ProfilCommercial(e.commercial);
  if (/couverture.{0,10}(fam|famille|stock)|jours?.{0,8}(stock|restant|couvert)|duree.{0,10}stock|stock.{0,10}(jours?|duree|restant)/.test(raw)) return _nlQ_CouvertureJours();
  if (/client.{0,8}(gagn|perdu|nouveaux.{0,6}vs|bilan|solde)|gagn.{0,8}vs.{0,8}perdu|solde.{0,8}client|nouveaux.{0,6}vs.{0,6}(perdu|parti|disparu)/.test(raw)) return _nlQ_ClientsGagnesPerdus();
  if (/profil.{0,12}client|client.{0,12}(profil|achats?|articles?|fiche|resume|bilan)|fiche.{0,12}client|achats?.{0,12}client/.test(raw)) return _nlQ_ProfilClient(raw);
  if (/surperform|ou.{0,8}(je.{0,5}surp|j.{0,3}excelle|gagnant)|meilleur.{0,8}(vs.{0,6}reseau|reseau)|familles?.{0,8}(gagnant|top.{0,6}reseau|forte.{0,6}reseau|excel)/.test(raw)) return _nlQ_FamillesSurperformantes();
  if (/stock.{0,8}securite|securite.{0,8}stock|marge.{0,8}(securite|reappro|securit)|delai.{0,8}(reappro|reassort)|seuil.{0,8}securite/.test(raw)) return _nlQ_StockSecurite();
  if (/pivot.{0,8}metier|metier.{0,8}(famille|tableau|pivot|crois)|qui.{0,8}achete.{0,8}quoi|tableau.{0,8}(metier|crois)|croisement.{0,8}metier/.test(raw)) return _nlQ_PivotMetierFamille();
  if (/article.{0,10}(monte|hausse|croiss|progres|mover)|top.{0,8}mover|mover.{0,8}article|article.{0,10}(baisse|chute|declin|recul)|croissance.{0,10}article/.test(raw)) return _nlQ_TopMoversArticles();
  if (/client.{0,10}(departement|dept|geograph|region|zone|cp|code.{0,5}postal)|departement.{0,8}client|repartition.{0,8}(geo|geograph|client)|ou.{0,6}(sont|habitent).{0,8}client/.test(raw)) return _nlQ_RepartitionGeo();
  if (/engage|rfm|score.{0,10}engage|client.{0,10}(engage|actif.{0,5}regulier|loyal)|les.{0,5}plus.{0,8}(engage|actif|invest|assidu)/.test(raw)) return _nlQ_EngagementClients();
  if (/sur.{0,5}stock|exces.{0,8}(stock|max)|trop.{0,8}(stock|de.{0,5}stock)|stock.{0,10}(excessif|exces|depasse.{0,5}max|sup.{0,5}max)/.test(raw)) return _nlQ_SurStockes();
  if (/prepar.{0,10}saison|stock.{0,8}vs.{0,8}saison|sous.{0,8}appro.{0,8}saison|saison.{0,10}(stock|insuffis|manque)|appro.{0,8}saison/.test(raw)) return _nlQ_SaisonVsStock();
  if (e.metier && /top.{0,8}fam|famille.{0,8}(top|princip|clef|cle|domin)|principale.{0,8}fam|quoi.{0,8}achete|que.{0,8}achete/.test(raw)) return _nlQ_TopFamillesMetier(e.metier);
  if (/vue.{0,8}macro|omnicanal.{0,8}(bilan|vue|synthese)|tous.{0,8}canaux.{0,8}(bilan|synthese|vue)|part.{0,8}(voix|canal|de.{0,5}voix)|bilan.{0,8}canaux/.test(raw)) return _nlQ_OmnicanalMacro();
  return null;
}

export function _nlRenderResults(result) {
  const el = document.getElementById('cematinResults');
  if (!el) return;
  if (!result) { el.classList.add('hidden'); return; }
  el.classList.remove('hidden');
  el.innerHTML = `<div class="s-card rounded-xl border p-3">
    <div class="flex items-center justify-between mb-2">
      <span class="text-[11px] font-bold t-primary">${result.title}</span>
      <button onclick="document.getElementById('cematinResults').classList.add('hidden');document.getElementById('cematinSearchInput').value=''" class="text-[10px] t-disabled hover:t-primary px-1">✕</button>
    </div>
    ${result.html}
    ${result.footer?`<div class="mt-2 text-[9px] t-disabled">${result.footer}</div>`:''}
  </div>`;
}

function _nlQ_TauxService() {
  const active = (_S.finalData||[]).filter(r=>r.W>=1);
  const enStock = active.filter(r=>r.stockActuel>0);
  const taux = active.length ? (enStock.length/active.length*100).toFixed(1) : '—';
  const ruptures = active.length - enStock.length;
  const obs = _S.benchLists?.obsKpis?.mine;
  const servObs = obs?.serv!=null ? `<div class="s-card rounded-xl p-3 text-center"><div class="text-lg font-bold c-caution">${(obs.serv*100).toFixed(1)}%</div><div class="text-[10px] t-disabled mt-1">taux Qlik réseau</div></div>` : '';
  return { title:'Taux de service',
    html:`<div class="grid grid-cols-${servObs?3:2} gap-2"><div class="s-card rounded-xl p-3 text-center"><div class="text-2xl font-bold c-action">${taux}%</div><div class="text-[10px] t-disabled mt-1">refs actives en stock</div></div><div class="s-card rounded-xl p-3 text-center"><div class="text-xl font-bold c-danger">${ruptures.toLocaleString('fr')}</div><div class="text-[10px] t-disabled mt-1">ruptures (W≥1)</div></div>${servObs}</div>` };
}

function _nlQ_StockDormant(n) {
  const list = (_S.finalData||[]).filter(r=>r.ageJours>=DORMANT_DAYS&&r.stockActuel>0)
    .map(r=>({ code:r.code, lib:(r.libelle||'').slice(0,35), val:Math.round((r.stockActuel||0)*(r.prixUnitaire||0)), age:r.ageJours }))
    .sort((a,b)=>b.val-a.val).slice(0,n);
  if (!list.length) return { title:'Stock dormant', html:'<p class="text-xs t-disabled">Aucun article dormant détecté.</p>' };
  const tot = list.reduce((s,r)=>s+r.val,0);
  const rows = list.map(r=>`<tr class="text-[10px] b-light border-b"><td class="py-1 pr-2 font-mono t-disabled">${r.code}</td><td class="py-1 pr-3">${r.lib}</td><td class="py-1 text-right font-bold">${formatEuro(r.val)}</td><td class="py-1 pl-2 text-right t-disabled">${r.age}j</td></tr>`).join('');
  return { title:`Dormants top ${n} — ${formatEuro(tot)} immobilisé`,
    html:`<div class="overflow-x-auto"><table class="w-full"><thead><tr class="text-[9px] t-disabled"><th class="text-left pr-2">Code</th><th class="text-left pr-3">Libellé</th><th class="text-right">Valeur</th><th class="text-right pl-2">Âge</th></tr></thead><tbody>${rows}</tbody></table></div>` };
}

function _nlQ_IncoherencesERP() {
  const d = _S.finalData || [];
  if (!d.length) return { title:'Incohérences ERP', html:'<p class="text-xs t-disabled p-2">Aucune donnée chargée.</p>' };
  const active = r => !r.isParent && !(r.V === 0 && r.enleveTotal > 0);

  const minGtMax  = d.filter(r => active(r) && r.ancienMin > 0 && r.ancienMax > 0 && r.ancienMin > r.ancienMax)
    .sort((a, b) => (b.W || 0) - (a.W || 0));
  const nouvsNoCal = d.filter(r => active(r) && r.isNouveaute && (r.W || 0) >= 2 && r.ancienMin === 0 && r.ancienMax === 0)
    .sort((a, b) => (b.W || 0) - (a.W || 0));
  const overMax   = d.filter(r => active(r) && r.ancienMax > 0 && r.stockActuel > r.ancienMax * 2 && (r.W || 0) < 3)
    .sort((a, b) => (b.stockActuel * (b.prixUnitaire || 0)) - (a.stockActuel * (a.prixUnitaire || 0)));

  if (!minGtMax.length && !nouvsNoCal.length && !overMax.length)
    return { title:'Incohérences ERP', html:'<p class="text-xs t-disabled p-2">✅ Aucune incohérence ERP détectée.</p>' };

  function _tbl(rows, cols) {
    const hdr = cols.map(c => `<th class="py-1 px-2 text-left text-[9px] t-disabled">${c}</th>`).join('');
    return `<div class="overflow-x-auto"><table class="w-full border-collapse"><thead><tr class="border-b b-light">${hdr}</tr></thead><tbody>${rows}</tbody></table></div>`;
  }

  const secMinGtMax = minGtMax.length ? (() => {
    const rows = minGtMax.slice(0, 15).map(r => `<tr class="text-[10px] border-b b-light">
      <td class="py-1.5 px-2 font-mono text-[10px]">${r.code}</td>
      <td class="py-1.5 px-2 truncate max-w-[140px]">${(r.libelle||'').substring(0,28)}</td>
      <td class="py-1.5 px-2 text-center font-bold" style="color:var(--c-danger)">${r.ancienMin}</td>
      <td class="py-1.5 px-2 text-center">${r.ancienMax}</td>
      <td class="py-1.5 px-2 text-center t-disabled">${r.W}</td>
    </tr>`).join('');
    return `<p class="text-[10px] font-bold mb-1" style="color:var(--c-danger)">🔴 MIN ERP > MAX ERP — ${minGtMax.length} article${minGtMax.length>1?'s':''}</p>
      <p class="text-[9px] t-disabled mb-2">La réappro automatique ERP est bloquée — corriger en urgence.</p>
      ${_tbl(rows, ['Code','Libellé','MIN ERP','MAX ERP','W/sem'])}`;
  })() : '';

  const secNouvs = nouvsNoCal.length ? (() => {
    const rows = nouvsNoCal.slice(0, 15).map(r => `<tr class="text-[10px] border-b b-light">
      <td class="py-1.5 px-2 font-mono text-[10px]">${r.code}</td>
      <td class="py-1.5 px-2 truncate max-w-[140px]">${(r.libelle||'').substring(0,28)}</td>
      <td class="py-1.5 px-2 text-center font-bold" style="color:var(--c-caution)">${r.W}</td>
      <td class="py-1.5 px-2 text-center">${r.ageJours}j</td>
      <td class="py-1.5 px-2 text-center">${r.stockActuel}</td>
      <td class="py-1.5 px-2 text-right font-bold">${r.nouveauMin} / ${r.nouveauMax}</td>
    </tr>`).join('');
    return `<p class="text-[10px] font-bold mb-1 mt-3" style="color:var(--c-caution)">🟠 Nouveautés W≥2 sans calibrage ERP — ${nouvsNoCal.length} article${nouvsNoCal.length>1?'s':''}</p>
      <p class="text-[9px] t-disabled mb-2">PRISME a calculé un MIN/MAX — à saisir dans l'ERP pour activer la réappro auto.</p>
      ${_tbl(rows, ['Code','Libellé','W/sem','Âge','Stock','Min/Max PRISME'])}`;
  })() : '';

  const secOver = overMax.length ? (() => {
    const rows = overMax.slice(0, 15).map(r => {
      const valExces = Math.max(0, r.stockActuel - r.ancienMax) * (r.prixUnitaire || 0);
      return `<tr class="text-[10px] border-b b-light">
        <td class="py-1.5 px-2 font-mono text-[10px]">${r.code}</td>
        <td class="py-1.5 px-2 truncate max-w-[130px]">${(r.libelle||'').substring(0,26)}</td>
        <td class="py-1.5 px-2 text-center">${r.ancienMax}</td>
        <td class="py-1.5 px-2 text-center font-bold" style="color:var(--c-caution)">${r.stockActuel}</td>
        <td class="py-1.5 px-2 text-right font-bold">${valExces > 0 ? formatEuro(valExces) : '—'}</td>
      </tr>`;
    }).join('');
    return `<p class="text-[10px] font-bold mb-1 mt-3" style="color:var(--c-caution)">🟡 Stock bloqué au-dessus du MAX ERP — ${overMax.length} article${overMax.length>1?'s':''}</p>
      <p class="text-[9px] t-disabled mb-2">W<3 et stock >2× le MAX — articles lents surstockés, à écouler ou retourner au dépôt.</p>
      ${_tbl(rows, ['Code','Libellé','MAX ERP','Stock actuel','Valeur excès'])}`;
  })() : '';

  const total = minGtMax.length + nouvsNoCal.length + overMax.length;
  return {
    title: `Incohérences ERP — ${total} article${total>1?'s':''} à corriger`,
    html: secMinGtMax + secNouvs + secOver,
    footer: 'MIN>MAX = réappro bloquée · Nouveautés = MIN/MAX PRISME calculé mais non saisi ERP · Sur-stock = excès vs plafond',
  };
}

function _nlQ_AnomaliesMinMax() {
  const list = (_S.finalData||[]).filter(r=>(r.nouveauMin===0||r.nouveauMax===0)&&r.W>=2&&!r.isParent)
    .map(r=>({ code:r.code, lib:(r.libelle||'').slice(0,35), w:r.W, ca:Math.round(r.caAnnuel||0) }))
    .sort((a,b)=>b.ca-a.ca).slice(0,15);
  if (!list.length) return { title:'Articles sans MIN/MAX', html:'<p class="text-xs t-disabled">Aucune anomalie MIN/MAX détectée.</p>' };
  const rows = list.map(r=>`<tr class="text-[10px] b-light border-b"><td class="py-1 pr-2 font-mono t-disabled">${r.code}</td><td class="py-1 pr-3">${r.lib}</td><td class="py-1 text-right">${r.w} sem</td><td class="py-1 pl-2 text-right font-bold">${formatEuro(r.ca)}</td></tr>`).join('');
  return { title:`Articles actifs sans MIN/MAX (${list.length})`,
    html:`<div class="overflow-x-auto"><table class="w-full"><thead><tr class="text-[9px] t-disabled"><th class="text-left pr-2">Code</th><th class="text-left pr-3">Libellé</th><th class="text-right">W/sem</th><th class="text-right pl-2">CA/an</th></tr></thead><tbody>${rows}</tbody></table></div>` };
}

function _nlQ_DeriveMinMax() {
  const d = _S.finalData || [];
  if (!d.length) return { title:'Dérive MIN/MAX', html:'<p class="text-xs t-disabled p-2">Aucune donnée chargée.</p>' };

  // Articles avec MIN ERP ET MIN PRISME tous les deux > 0 → comparer
  const SEUIL = 0.50; // ±50% d'écart → dérive significative
  const candidates = d.filter(r =>
    !r.isParent && !(r.V === 0 && r.enleveTotal > 0) &&
    r.ancienMin > 0 && r.nouveauMin > 0 && r.W >= 1
  );

  if (!candidates.length)
    return { title:'Dérive MIN/MAX', html:'<p class="text-xs t-disabled p-2">Aucun article avec MIN ERP et MIN PRISME tous les deux configurés.</p>' };

  const sousEstimes = candidates
    .filter(r => r.nouveauMin > r.ancienMin * (1 + SEUIL))  // PRISME > 1.5 × ERP → ERP trop bas
    .map(r => ({ ...r, delta: Math.round((r.nouveauMin / r.ancienMin - 1) * 100) }))
    .sort((a, b) => b.delta - a.delta);

  const suresTimeS = candidates
    .filter(r => r.nouveauMin < r.ancienMin * (1 - SEUIL))  // PRISME < 0.5 × ERP → ERP trop haut
    .map(r => ({ ...r, delta: Math.round((1 - r.nouveauMin / r.ancienMin) * 100) }))
    .sort((a, b) => b.delta - a.delta);

  if (!sousEstimes.length && !suresTimeS.length)
    return {
      title: `Dérive MIN/MAX — ${candidates.length} articles comparés`,
      html: `<p class="text-xs t-disabled p-2">✅ Aucun écart >50% entre MIN ERP et MIN PRISME sur ${candidates.length} articles.</p>`,
    };

  function _tblDerive(rows) {
    return `<div class="overflow-x-auto"><table class="w-full border-collapse">
      <thead><tr class="border-b b-light text-[9px] t-disabled">
        <th class="py-1 px-2 text-left">Code</th><th class="py-1 px-2 text-left">Libellé</th>
        <th class="py-1 px-1 text-center">W/sem</th><th class="py-1 px-1 text-center">MIN ERP</th>
        <th class="py-1 px-1 text-center">MIN PRISME</th><th class="py-1 px-1 text-center">Écart</th>
      </tr></thead><tbody>${rows}</tbody></table></div>`;
  }

  const rowsSous = sousEstimes.slice(0, 12).map(r => `<tr class="text-[10px] border-b b-light">
    <td class="py-1.5 px-2 font-mono text-[10px]">${r.code}</td>
    <td class="py-1.5 px-2 truncate max-w-[130px]">${(r.libelle||'').substring(0,26)}</td>
    <td class="py-1.5 px-1 text-center t-disabled">${r.W}</td>
    <td class="py-1.5 px-1 text-center">${r.ancienMin}</td>
    <td class="py-1.5 px-1 text-center font-bold" style="color:var(--c-danger)">${r.nouveauMin}</td>
    <td class="py-1.5 px-1 text-center font-bold" style="color:var(--c-danger)">+${r.delta}%</td>
  </tr>`).join('');

  const rowsSur = suresTimeS.slice(0, 12).map(r => `<tr class="text-[10px] border-b b-light">
    <td class="py-1.5 px-2 font-mono text-[10px]">${r.code}</td>
    <td class="py-1.5 px-2 truncate max-w-[130px]">${(r.libelle||'').substring(0,26)}</td>
    <td class="py-1.5 px-1 text-center t-disabled">${r.W}</td>
    <td class="py-1.5 px-1 text-center font-bold" style="color:var(--c-caution)">${r.ancienMin}</td>
    <td class="py-1.5 px-1 text-center">${r.nouveauMin}</td>
    <td class="py-1.5 px-1 text-center font-bold" style="color:var(--c-caution)">-${r.delta}%</td>
  </tr>`).join('');

  const secSous = sousEstimes.length ? `
    <p class="text-[10px] font-bold mb-1" style="color:var(--c-danger)">🔴 MIN ERP sous-estimé — ${sousEstimes.length} article${sousEstimes.length>1?'s':''}</p>
    <p class="text-[9px] t-disabled mb-2">MIN PRISME >+50% vs ERP — risque de rupture car l'ERP commande trop tard ou trop peu.</p>
    ${_tblDerive(rowsSous)}` : '';

  const secSur = suresTimeS.length ? `
    <p class="text-[10px] font-bold mb-1 mt-3" style="color:var(--c-caution)">🟡 MIN ERP surestimé — ${suresTimeS.length} article${suresTimeS.length>1?'s':''}</p>
    <p class="text-[9px] t-disabled mb-2">MIN PRISME >50% inférieur à l'ERP — sur-commande probable, immobilisation inutile.</p>
    ${_tblDerive(rowsSur)}` : '';

  const total = sousEstimes.length + suresTimeS.length;
  return {
    title: `Dérive MIN/MAX — ${total} article${total>1?'s':''} avec écart >50% · ${candidates.length} comparés`,
    html: secSous + secSur,
    footer: `Seuil : écart >50% entre MIN ERP (ancienMin) et MIN PRISME (nouveauMin) · Scope : W≥1, ancienMin>0, nouveauMin>0`,
  };
}

function _nlQ_ClientsWeb(n) {
  if (!_S.ventesClientHorsMagasin?.size) return { title:'Top clients web', html:'<p class="text-xs t-disabled">Données hors-agence non disponibles.</p>' };
  const map = new Map();
  for (const [cc,arts] of _S.ventesClientHorsMagasin) {
    let ca=0; for (const [,v] of arts) if (v.canal==='INTERNET') ca+=v.sumCA||0;
    if (ca>0) map.set(cc,ca);
  }
  const top = [...map.entries()].sort((a,b)=>b[1]-a[1]).slice(0,n);
  if (!top.length) return { title:'Top clients web', html:'<p class="text-xs t-disabled">Aucun achat Internet détecté.</p>' };
  const gN = cc => (_S.chalandiseData?.get(cc)?.nom||_S.clientNomLookup?.[cc]||cc);
  const gM = cc => (_S.chalandiseData?.get(cc)?.metier||'');
  const rows = top.map(([cc,ca])=>`<tr class="text-[10px] b-light border-b cursor-pointer hover:s-hover" onclick="openClient360('${cc}','nl')"><td class="py-1 pr-2">${gN(cc).slice(0,25)}</td><td class="py-1 pr-3 t-disabled">${gM(cc)}</td><td class="py-1 text-right font-bold">${formatEuro(ca)}</td><td class="py-1 pl-1 text-[8px] t-disabled">360°→</td></tr>`).join('');
  return { title:`Top ${n} clients Internet`,
    html:`<div class="overflow-x-auto"><table class="w-full"><thead><tr class="text-[9px] t-disabled"><th class="text-left pr-2">Client</th><th class="text-left pr-3">Métier</th><th class="text-right">CA web</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>`,
    footer:'Cliquer sur un client pour ouvrir sa fiche 360°' };
}

function _nlQ_ClientsRepOnly() {
  if (!_S.ventesClientHorsMagasin?.size) return { title:'Clients représentant seulement', html:'<p class="text-xs t-disabled">Données hors-agence non disponibles.</p>' };
  const results = [];
  for (const [cc,arts] of _S.ventesClientHorsMagasin) {
    if (_S.ventesClientArticle?.get(cc)?.size) continue;
    let caRep=0; for (const [,v] of arts) if (v.canal==='REPRESENTANT') caRep+=v.sumCA||0;
    if (caRep>0) results.push({cc,caRep});
  }
  results.sort((a,b)=>b.caRep-a.caRep);
  const top = results.slice(0,15);
  if (!top.length) return { title:'Clients représentant seulement', html:'<p class="text-xs t-disabled">Aucun trouvé.</p>' };
  const gN = cc => (_S.chalandiseData?.get(cc)?.nom||_S.clientNomLookup?.[cc]||cc);
  const gM = cc => (_S.chalandiseData?.get(cc)?.metier||'');
  const rows = top.map(({cc,caRep})=>`<tr class="text-[10px] b-light border-b cursor-pointer hover:s-hover" onclick="openClient360('${cc}','nl')"><td class="py-1 pr-2">${gN(cc).slice(0,25)}</td><td class="py-1 pr-3 t-disabled">${gM(cc)}</td><td class="py-1 text-right font-bold">${formatEuro(caRep)}</td><td class="py-1 pl-1 text-[8px] t-disabled">360°→</td></tr>`).join('');
  return { title:`Clients sans comptoir — représentant uniquement (${results.length})`,
    html:`<div class="overflow-x-auto"><table class="w-full"><thead><tr class="text-[9px] t-disabled"><th class="text-left pr-2">Client</th><th class="text-left pr-3">Métier</th><th class="text-right">CA rep</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>`,
    footer:'Ces clients ne passent jamais au comptoir — potentiel de captation PDV.' };
}

function _nlQ_ConcentrationClient() {
  if (!_S.ventesClientArticle?.size)
    return { title:'Concentration client', html:'<p class="text-xs t-disabled p-2">Données PDV non disponibles.</p>' };

  // Build CA par client
  const caMap = [];
  for (const [cc, arts] of _S.ventesClientArticle) {
    let ca = 0; for (const [, v] of arts) ca += v.sumCA || 0;
    if (ca > 0) caMap.push({ cc, ca });
  }
  caMap.sort((a, b) => b.ca - a.ca);
  if (!caMap.length) return { title:'Concentration client', html:'<p class="text-xs t-disabled p-2">Aucun client avec CA PDV.</p>' };

  const totalCA = caMap.reduce((s, r) => s + r.ca, 0);
  const nowTs = Date.now();

  // ICC : nb clients pour 50% du CA
  let cumul = 0, icc = 0;
  for (const r of caMap) { cumul += r.ca; icc++; if (cumul >= totalCA * 0.5) break; }

  // Gini approximation : % CA du top 20%
  const top20count = Math.max(1, Math.ceil(caMap.length * 0.2));
  const top20CA = caMap.slice(0, top20count).reduce((s, r) => s + r.ca, 0);
  const top20Pct = Math.round(top20CA / totalCA * 100);

  // Top clients with enrichment
  const top = caMap.slice(0, 15).map(r => {
    const info = _S.chalandiseData?.get(r.cc);
    const nom = info?.nom || _S.clientNomLookup?.[r.cc] || r.cc;
    const metier = info?.metier || '';
    const pct = Math.round(r.ca / totalCA * 100);
    const lastOrder = _S.clientLastOrder?.get(r.cc);
    const silenceDays = lastOrder ? Math.round((nowTs - lastOrder) / 86400000) : null;
    const omni = _S.clientOmniScore?.get(r.cc);
    const segment = omni?.segment || null;
    // Risk: silence or digital drift
    let risk = 'ok';
    if (silenceDays !== null && silenceDays > 90) risk = 'silencieux';
    else if (segment === 'digital') risk = 'digital';
    else if (segment === 'dormant') risk = 'dormant';
    return { cc: r.cc, nom, metier, ca: Math.round(r.ca), pct, silenceDays, segment, risk };
  });

  const riskStyle = { ok: '', silencieux: 'color:var(--c-danger)', digital: 'color:var(--c-caution)', dormant: 'color:var(--c-danger)' };
  const riskBadge = { ok: '', silencieux: '⚠️ silencieux', digital: '📱 digital', dormant: '💤 dormant' };

  const rows = top.map(r => {
    const barW = Math.min(100, r.pct * 3) + '%'; // scale bar
    const sil = r.silenceDays !== null ? `${r.silenceDays}j` : '—';
    const rStyle = riskStyle[r.risk] || '';
    const badge = riskBadge[r.risk] ? `<span class="text-[8px] ml-1" style="${rStyle}">${riskBadge[r.risk]}</span>` : '';
    return `<tr class="text-[10px] border-b b-light cursor-pointer hover:s-hover" onclick="openClient360('${r.cc}','concentration')">
      <td class="py-1.5 px-2 font-semibold" style="${rStyle}">${r.nom.substring(0,22)}${badge}</td>
      <td class="py-1.5 px-1 text-[9px] t-disabled">${r.metier.substring(0,14)}</td>
      <td class="py-1.5 px-2 text-right font-bold">${formatEuro(r.ca)}</td>
      <td class="py-1.5 px-1 text-center">
        <div style="display:flex;align-items:center;gap:4px">
          <div style="height:5px;border-radius:3px;width:50px;background:rgba(128,128,128,0.15)"><div style="height:5px;border-radius:3px;width:${barW};background:var(--c-primary,#6366f1)"></div></div>
          <span class="font-bold text-[9px]">${r.pct}%</span>
        </div>
      </td>
      <td class="py-1.5 px-1 text-center text-[9px] ${r.silenceDays !== null && r.silenceDays > 90 ? 'font-bold' : 't-disabled'}" style="${r.silenceDays !== null && r.silenceDays > 90 ? 'color:var(--c-danger)' : ''}">${sil}</td>
    </tr>`;
  }).join('');

  const iccColor = icc <= 3 ? 'var(--c-danger)' : icc <= 6 ? 'var(--c-caution)' : 'var(--c-ok)';
  const atRisk = top.filter(r => r.risk !== 'ok');
  const atRiskCA = atRisk.reduce((s, r) => s + r.ca, 0);

  const summary = `<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px">
    <div style="padding:6px 10px;border-radius:8px;background:rgba(128,128,128,0.08);text-align:center">
      <div style="font-size:1.1rem;font-weight:900;color:${iccColor}">${icc}</div>
      <div style="font-size:0.6rem;color:var(--c-muted)">clients → 50% CA<br><span style="font-size:0.55rem;opacity:0.7">ICC (indice concentration)</span></div>
    </div>
    <div style="padding:6px 10px;border-radius:8px;background:rgba(128,128,128,0.08);text-align:center">
      <div style="font-size:1.1rem;font-weight:900;color:var(--c-primary)">${top20Pct}%</div>
      <div style="font-size:0.6rem;color:var(--c-muted)">CA par top 20%<br><span style="font-size:0.55rem;opacity:0.7">Concentration Pareto</span></div>
    </div>
    ${atRisk.length ? `<div style="padding:6px 10px;border-radius:8px;background:rgba(220,38,38,0.08);text-align:center">
      <div style="font-size:1.1rem;font-weight:900;color:var(--c-danger)">${atRisk.length}</div>
      <div style="font-size:0.6rem;color:var(--c-muted)">top clients à risque<br><span style="font-size:0.55rem;color:var(--c-danger)">${formatEuro(atRiskCA)} CA exposé</span></div>
    </div>` : ''}
  </div>`;

  return {
    title: `Concentration client — ICC ${icc} · top 20% = ${top20Pct}% du CA · ${formatEuro(totalCA)} total`,
    html: `${summary}<div class="overflow-x-auto"><table class="w-full border-collapse">
      <thead><tr class="border-b b-light text-[9px] t-disabled">
        <th class="py-1 px-2 text-left">Client</th><th class="py-1 px-1 text-left">Métier</th>
        <th class="py-1 px-2 text-right">CA PDV</th><th class="py-1 px-1 text-left">Part</th>
        <th class="py-1 px-1 text-center">Silence</th>
      </tr></thead><tbody>${rows}</tbody></table></div>`,
    footer: `ICC = nb clients pour atteindre 50% du CA · silence >90j = risque · cliquer → fiche 360°`,
  };
}

function _nlQ_RupturesTopClients() {
  const ruptures = (_S.finalData||[]).filter(r=>r.stockActuel<=0&&r.W>=2&&!r.isParent);
  if (!ruptures.length) return { title:'Ruptures × top clients', html:'<p class="text-xs t-disabled">Aucune rupture active.</p>' };
  const clientCA = new Map();
  if (_S.ventesClientArticle?.size) {
    for (const [cc,arts] of _S.ventesClientArticle) {
      let ca=0; for (const [,v] of arts) ca+=v.sumCA||0;
      clientCA.set(cc,ca);
    }
  }
  const top50 = new Set([...clientCA.entries()].sort((a,b)=>b[1]-a[1]).slice(0,50).map(([cc])=>cc));
  const impacts = ruptures.map(r=>{
    const cls = _S.articleClients?.get(r.code)||new Set();
    const nbTop = [...cls].filter(cc=>top50.has(cc)).length;
    const caRisk = [...cls].reduce((s,cc)=>s+(_S.ventesClientArticle?.get(cc)?.get(r.code)?.sumCA||0),0);
    return { lib:(r.libelle||r.code).slice(0,30), fam:r.famille||'', nbTop, caRisk };
  }).filter(r=>r.nbTop>0).sort((a,b)=>b.nbTop-a.nbTop||b.caRisk-a.caRisk).slice(0,12);
  if (!impacts.length) return { title:'Ruptures × top clients', html:'<p class="text-xs t-disabled">Aucune rupture ne touche tes top 50 clients.</p>' };
  const rows = impacts.map(r=>`<tr class="text-[10px] b-light border-b"><td class="py-1 pr-2">${r.lib}</td><td class="py-1 pr-3 t-disabled">${r.fam}</td><td class="py-1 text-right font-bold c-danger">${r.nbTop}</td><td class="py-1 pl-2 text-right">${r.caRisk>0?formatEuro(r.caRisk):'—'}</td></tr>`).join('');
  return { title:`Ruptures touchant tes top 50 clients (${impacts.length} articles)`,
    html:`<div class="overflow-x-auto"><table class="w-full"><thead><tr class="text-[9px] t-disabled"><th class="text-left pr-2">Article</th><th class="text-left pr-3">Famille</th><th class="text-right">Clients top</th><th class="text-right pl-2">CA/an</th></tr></thead><tbody>${rows}</tbody></table></div>`,
    footer:'Top 50 clients par CA PDV' };
}

function _nlQ_ClientsSilencieux(days, minEuros, metier) {
  if (!_S.clientLastOrder?.size) return { title:'Clients silencieux', html:'<p class="text-xs t-disabled">Données non disponibles.</p>' };
  const now = new Date();
  const results = [];
  for (const [cc,lastDate] of _S.clientLastOrder) {
    const daysAgo = Math.round((now-lastDate)/86400000);
    if (daysAgo < days) continue;
    const info = _S.chalandiseData?.get(cc);
    if (metier && info?.metier !== metier) continue;
    const arts = _S.ventesClientArticle?.get(cc);
    const ca = arts ? [...arts.values()].reduce((s,v)=>s+(v.sumCA||0),0) : 0;
    if (minEuros && ca < minEuros) continue;
    results.push({ cc, nom:info?.nom||_S.clientNomLookup?.[cc]||cc, metier:info?.metier||'', daysAgo, ca });
  }
  results.sort((a,b)=>b.ca-a.ca||b.daysAgo-a.daysAgo);
  const top = results.slice(0,15);
  if (!top.length) return { title:`Clients silencieux (>${days}j)`, html:'<p class="text-xs t-disabled">Aucun client correspondant.</p>' };
  const rows = top.map(r=>`<tr class="text-[10px] b-light border-b cursor-pointer hover:s-hover" onclick="openClient360('${r.cc}','nl')"><td class="py-1 pr-2">${r.nom.slice(0,25)}</td><td class="py-1 pr-2 t-disabled">${r.metier}</td><td class="py-1 text-right c-caution">${r.daysAgo}j</td><td class="py-1 pl-2 text-right font-bold">${r.ca>0?formatEuro(r.ca):'—'}</td><td class="py-1 pl-1 text-[8px] t-disabled">360°→</td></tr>`).join('');
  const titre = metier ? `Clients ${metier} silencieux (>${days}j)` : `Clients silencieux (>${days}j${minEuros?` >${formatEuro(minEuros)}`:''})`;
  return { title:`${titre} — ${results.length} résultat${results.length>1?'s':''}`,
    html:`<div class="overflow-x-auto"><table class="w-full"><thead><tr class="text-[9px] t-disabled"><th class="text-left pr-2">Client</th><th class="text-left pr-2">Métier</th><th class="text-right">Silence</th><th class="text-right pl-2">CA</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>`,
    footer:'Cliquer pour ouvrir la fiche 360°' };
}

function _nlQ_CommercialSilent(commercial, days) {
  const clients = _S.clientsByCommercial?.get(commercial);
  if (!clients?.size) return { title:`Portefeuille ${commercial}`, html:'<p class="text-xs t-disabled">Commercial non trouvé.</p>' };
  const now = new Date();
  const results = [];
  for (const cc of clients) {
    const lastDate = _S.clientLastOrder?.get(cc);
    if (!lastDate) continue;
    const daysAgo = Math.round((now-lastDate)/86400000);
    if (daysAgo < days) continue;
    const info = _S.chalandiseData?.get(cc);
    const arts = _S.ventesClientArticle?.get(cc);
    const ca = arts ? [...arts.values()].reduce((s,v)=>s+(v.sumCA||0),0) : 0;
    results.push({ cc, nom:info?.nom||_S.clientNomLookup?.[cc]||cc, metier:info?.metier||'', daysAgo, ca });
  }
  results.sort((a,b)=>b.ca-a.ca);
  const top = results.slice(0,15);
  if (!top.length) return { title:`${commercial} — clients silencieux`, html:`<p class="text-xs t-disabled">Tous les clients ont commandé dans les ${days} derniers jours.</p>` };
  const rows = top.map(r=>`<tr class="text-[10px] b-light border-b cursor-pointer hover:s-hover" onclick="openClient360('${r.cc}','nl')"><td class="py-1 pr-2">${r.nom.slice(0,25)}</td><td class="py-1 pr-2 t-disabled">${r.metier}</td><td class="py-1 text-right c-caution">${r.daysAgo}j</td><td class="py-1 pl-2 text-right font-bold">${r.ca>0?formatEuro(r.ca):'—'}</td><td class="py-1 pl-1 text-[8px] t-disabled">360°→</td></tr>`).join('');
  return { title:`${commercial} — ${results.length} client${results.length>1?'s':''} silencieux (>${days}j)`,
    html:`<div class="overflow-x-auto"><table class="w-full"><thead><tr class="text-[9px] t-disabled"><th class="text-left pr-2">Client</th><th class="text-left pr-2">Métier</th><th class="text-right">Silence</th><th class="text-right pl-2">CA</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>` };
}

function _nlQ_ClientsDigitaux() {
  if (!_S.ventesClientHorsMagasin?.size || !_S.ventesClientArticle?.size)
    return { title:'Clients devenus digitaux', html:'<p class="text-xs t-disabled">Données PDV + hors-agence requises.</p>' };
  const now = new Date();
  const results = [];
  for (const [cc,horArts] of _S.ventesClientHorsMagasin) {
    const pdvArts = _S.ventesClientArticle.get(cc);
    if (!pdvArts?.size) continue;
    const lastPDV = _S.clientLastOrder?.get(cc);
    if (!lastPDV) continue;
    const pdvSilence = Math.round((now-lastPDV)/86400000);
    if (pdvSilence < 90) continue;
    let caHors=0; const canalCA={};
    for (const [,v] of horArts) { caHors+=v.sumCA||0; canalCA[v.canal]=(canalCA[v.canal]||0)+(v.sumCA||0); }
    if (caHors < 200) continue;
    const mainCanal = Object.entries(canalCA).sort((a,b)=>b[1]-a[1])[0]?.[0]||'';
    let caPDV=0; for (const [,v] of pdvArts) caPDV+=v.sumCA||0;
    const info = _S.chalandiseData?.get(cc);
    results.push({ cc, nom:info?.nom||_S.clientNomLookup?.[cc]||cc, metier:info?.metier||'', pdvSilence, caPDV, caHors, mainCanal });
  }
  results.sort((a,b)=>b.caPDV-a.caPDV);
  const top = results.slice(0,15);
  if (!top.length) return { title:'Clients devenus digitaux', html:'<p class="text-xs t-disabled">Aucun client correspondant — PDV silence >90j + actif hors-agence.</p>' };
  const cIcon = c => c==='INTERNET'?'🌐':c==='REPRESENTANT'?'🤝':c==='DCS'?'📦':'📡';
  const rows = top.map(r=>`<tr class="text-[10px] b-light border-b cursor-pointer hover:s-hover" onclick="openClient360('${r.cc}','nl')"><td class="py-1 pr-2">${r.nom.slice(0,25)}</td><td class="py-1 pr-2 t-disabled">${r.metier}</td><td class="py-1 text-right c-caution">${r.pdvSilence}j</td><td class="py-1 pl-2 text-right">${cIcon(r.mainCanal)}\u00a0${formatEuro(r.caHors)}</td><td class="py-1 pl-2 text-right t-disabled">${formatEuro(r.caPDV)}</td><td class="py-1 pl-1 text-[8px] t-disabled">360°→</td></tr>`).join('');
  return { title:`Clients devenus digitaux — ${results.length} client${results.length>1?'s':''} (PDV silencieux, actifs en ligne)`,
    html:`<div class="overflow-x-auto"><table class="w-full"><thead><tr class="text-[9px] t-disabled"><th class="text-left pr-2">Client</th><th class="text-left pr-2">Métier</th><th class="text-right">Silence PDV</th><th class="text-right pl-2">CA digital</th><th class="text-right pl-2">CA PDV hist.</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>`,
    footer:'Silence PDV >90j + actifs sur Internet/représentant — potentiel de récupération au comptoir' };
}

function _nlQ_NouveauxClients(days) {
  if (!_S.clientLastOrder?.size) return { title:'Nouveaux clients', html:'<p class="text-xs t-disabled">Données non disponibles.</p>' };
  const now = new Date();
  const cutoff = days * 86400000;
  const results = [];
  for (const [cc, lastDate] of _S.clientLastOrder) {
    if (now - lastDate > cutoff) continue;
    const freq = _S.clientsMagasinFreq?.get(cc) || 0;
    if (freq > 3) continue; // clients établis exclus
    const arts = _S.ventesClientArticle?.get(cc);
    const ca = arts ? [...arts.values()].reduce((s,v)=>s+(v.sumCA||0),0) : 0;
    const info = _S.chalandiseData?.get(cc);
    results.push({ cc, nom:info?.nom||_S.clientNomLookup?.[cc]||cc, metier:info?.metier||'', freq, ca, daysAgo:Math.round((now-lastDate)/86400000) });
  }
  results.sort((a,b)=>a.daysAgo-b.daysAgo||b.ca-a.ca);
  if (!results.length) return { title:`Nouveaux clients (${days} derniers jours)`, html:'<p class="text-xs t-disabled">Aucun nouveau client détecté sur cette période.</p>' };
  const rows = results.slice(0,15).map(r=>`<tr class="text-[10px] b-light border-b cursor-pointer hover:s-hover" onclick="openClient360('${r.cc}','nl')"><td class="py-1 pr-2">${r.nom.slice(0,25)}</td><td class="py-1 pr-2 t-disabled">${r.metier}</td><td class="py-1 text-right">${r.daysAgo}j</td><td class="py-1 pl-2 text-right font-bold">${r.ca>0?formatEuro(r.ca):'—'}</td><td class="py-1 pl-1 text-[8px] t-disabled">360°→</td></tr>`).join('');
  return { title:`Nouveaux clients — ${results.length} dans les ${days} derniers jours`,
    html:`<div class="overflow-x-auto"><table class="w-full"><thead><tr class="text-[9px] t-disabled"><th class="text-left pr-2">Client</th><th class="text-left pr-2">Métier</th><th class="text-right">1er achat</th><th class="text-right pl-2">CA</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>`,
    footer:`Clients avec ≤3 BL sur la période — cliquer pour fiche 360°` };
}

function _nlQ_FideliteClients() {
  if (!_S.ventesClientArticle?.size)
    return { title:'Score fidélité clients', html:'<p class="text-xs t-disabled p-2">Données PDV non disponibles.</p>' };

  const nowTs = Date.now();
  // Compute RFV per client
  const clients = [];
  for (const [cc, arts] of _S.ventesClientArticle) {
    let caPDV = 0, nbBL = 0;
    for (const [, v] of arts) { caPDV += v.sumCA || 0; nbBL += v.countBL || 0; }
    if (caPDV < 50) continue;
    const lastOrder = _S.clientLastOrder?.get(cc);
    const silenceDays = lastOrder ? Math.round((nowTs - lastOrder) / 86400000) : 999;
    clients.push({ cc, caPDV: Math.round(caPDV), nbBL, silenceDays });
  }
  if (!clients.length) return { title:'Score fidélité clients', html:'<p class="text-xs t-disabled p-2">Aucun client avec CA PDV.</p>' };

  const maxCA = Math.max(...clients.map(c => c.caPDV));
  const maxBL = Math.max(...clients.map(c => c.nbBL));

  const scored = clients.map(c => {
    const recScore = c.silenceDays <= 30 ? 35 : c.silenceDays <= 60 ? 28 : c.silenceDays <= 90 ? 18 : c.silenceDays <= 180 ? 8 : 0;
    const freqScore = maxBL > 0 ? Math.round((c.nbBL / maxBL) * 35) : 0;
    const valScore  = maxCA > 0 ? Math.round(Math.sqrt(c.caPDV / maxCA) * 30) : 0;
    const fls = Math.min(100, recScore + freqScore + valScore);
    return { ...c, fls, recScore, freqScore, valScore };
  });

  // Top fidèles (high FLS, active)
  const topFideles = [...scored].sort((a, b) => b.fls - a.fls).slice(0, 10);
  // À risque : FLS élevé MAIS silence >60j (étaient très actifs, maintenant absents)
  const atRisk = [...scored]
    .filter(c => c.fls >= 40 && c.silenceDays > 60)
    .sort((a, b) => b.caPDV - a.caPDV)
    .slice(0, 10);

  const gN = cc => _S.chalandiseData?.get(cc)?.nom || _S.clientNomLookup?.[cc] || cc;
  const gM = cc => _S.chalandiseData?.get(cc)?.metier || '';

  function _scoreBar(s, color) {
    return `<div style="display:flex;align-items:center;gap:3px">
      <div style="height:4px;border-radius:2px;width:40px;background:rgba(128,128,128,0.15)"><div style="height:4px;border-radius:2px;width:${s}%;background:${color}"></div></div>
      <span style="font-size:9px;font-weight:700;color:${color}">${s}</span>
    </div>`;
  }

  function _row(c, showSilence) {
    const flsColor = c.fls >= 70 ? 'var(--c-ok,#16a34a)' : c.fls >= 40 ? 'var(--c-caution,#d97706)' : 'var(--c-danger,#dc2626)';
    const silStyle = c.silenceDays > 90 ? 'color:var(--c-danger);font-weight:700' : c.silenceDays > 60 ? 'color:var(--c-caution)' : 't-disabled';
    return `<tr class="text-[10px] border-b b-light cursor-pointer hover:s-hover" onclick="openClient360('${c.cc}','fls')">
      <td class="py-1.5 px-2 font-semibold">${gN(c.cc).substring(0,22)}</td>
      <td class="py-1.5 px-1 text-[9px] t-disabled">${gM(c.cc).substring(0,12)}</td>
      <td class="py-1.5 px-2 text-right">${formatEuro(c.caPDV)}</td>
      <td class="py-1.5 px-1 text-center t-disabled">${c.nbBL}</td>
      ${showSilence ? `<td class="py-1.5 px-1 text-center text-[9px]" style="${silStyle}">${c.silenceDays < 999 ? c.silenceDays+'j' : '—'}</td>` : ''}
      <td class="py-1.5 px-2">${_scoreBar(c.fls, flsColor)}</td>
    </tr>`;
  }

  const thBase = `<th class="py-1 px-2 text-left text-[9px] t-disabled">Client</th><th class="py-1 px-1 text-left text-[9px] t-disabled">Métier</th><th class="py-1 px-2 text-right text-[9px] t-disabled">CA PDV</th><th class="py-1 px-1 text-center text-[9px] t-disabled">BL</th>`;
  const thSilence = `<th class="py-1 px-1 text-center text-[9px] t-disabled">Silence</th>`;
  const thFLS = `<th class="py-1 px-2 text-left text-[9px] t-disabled">FLS</th>`;

  const secTop = `<p class="text-[10px] font-bold mb-1 mt-0" style="color:var(--c-ok)">🟢 Top 10 clients fidèles</p>
    <div class="overflow-x-auto mb-3"><table class="w-full border-collapse">
      <thead><tr class="border-b b-light">${thBase}${thFLS}</tr></thead>
      <tbody>${topFideles.map(c => _row(c, false)).join('')}</tbody>
    </table></div>`;

  const secRisk = atRisk.length ? `<p class="text-[10px] font-bold mb-1" style="color:var(--c-danger)">⚠️ Fidèles à risque — FLS élevé mais silencieux >60j</p>
    <p class="text-[9px] t-disabled mb-2">Ces clients étaient très actifs — leur silence est un signal d'alarme fort.</p>
    <div class="overflow-x-auto"><table class="w-full border-collapse">
      <thead><tr class="border-b b-light">${thBase}${thSilence}${thFLS}</tr></thead>
      <tbody>${atRisk.map(c => _row(c, true)).join('')}</tbody>
    </table></div>` : '';

  const atRiskCA = atRisk.reduce((s, c) => s + c.caPDV, 0);
  return {
    title: `Score fidélité — ${scored.length} clients · ${atRisk.length} fidèles à risque${atRiskCA > 0 ? ' · ' + formatEuro(atRiskCA) + ' exposé' : ''}`,
    html: secTop + secRisk,
    footer: `FLS = Récence(35) + Fréquence BL(35) + Valeur CA(30) · "À risque" = FLS≥40 & silence>60j · Cliquer → fiche 360°`,
  };
}

function _nlQ_ClientsHorsAgence(minEuros) {
  if (!_S.ventesClientHorsMagasin?.size) return { title:'Clients hors agence', html:'<p class="text-xs t-disabled">Données hors-agence non disponibles.</p>' };
  const map = new Map();
  for (const [cc,arts] of _S.ventesClientHorsMagasin) {
    let ca=0; for (const [,v] of arts) ca+=v.sumCA||0;
    if (ca>=minEuros) map.set(cc,ca);
  }
  const top = [...map.entries()].sort((a,b)=>b[1]-a[1]).slice(0,15);
  if (!top.length) return { title:`Clients hors agence >${formatEuro(minEuros)}`, html:'<p class="text-xs t-disabled">Aucun client correspondant.</p>' };
  const gN = cc => (_S.chalandiseData?.get(cc)?.nom||_S.clientNomLookup?.[cc]||cc);
  const gM = cc => (_S.chalandiseData?.get(cc)?.metier||'');
  const hasPDV = cc => !!(_S.ventesClientArticle?.get(cc)?.size);
  const rows = top.map(([cc,ca])=>`<tr class="text-[10px] b-light border-b cursor-pointer hover:s-hover" onclick="openClient360('${cc}','nl')"><td class="py-1 pr-2">${gN(cc).slice(0,25)}</td><td class="py-1 pr-2 t-disabled">${gM(cc)}</td><td class="py-1 text-right font-bold">${formatEuro(ca)}</td><td class="py-1 pl-2 text-[8px]">${hasPDV(cc)?'<span class="text-emerald-500">+PDV</span>':'<span style="color:var(--c-danger)">PDV absent</span>'}</td><td class="py-1 pl-1 text-[8px] t-disabled">360°→</td></tr>`).join('');
  return { title:`Clients hors agence >${formatEuro(minEuros)} — ${map.size} trouvés`,
    html:`<div class="overflow-x-auto"><table class="w-full"><thead><tr class="text-[9px] t-disabled"><th class="text-left pr-2">Client</th><th class="text-left pr-2">Métier</th><th class="text-right">CA hors agence</th><th class="text-right pl-2">PDV</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>`,
    footer:'PDV absent = potentiel de captation au comptoir' };
}

function _nlQ_PanierMetier() {
  if (!_S.chalandiseData?.size || !_S.ventesClientArticle?.size)
    return { title:'Panier moyen par métier', html:'<p class="text-xs t-disabled p-2">Chargez PDV + zone de chalandise.</p>' };

  // Aggregate CA PDV + nb BL per métier
  const metierStats = new Map(); // metier → {ca, nbBL, nbClients}
  for (const [cc, arts] of _S.ventesClientArticle) {
    const info = _S.chalandiseData?.get(cc);
    if (!info?.metier) continue;
    let caPDV = 0, nbBL = 0;
    for (const [, v] of arts) { caPDV += v.sumCA || 0; nbBL += v.countBL || 0; }
    if (caPDV < 50) continue;
    if (!metierStats.has(info.metier)) metierStats.set(info.metier, { ca: 0, nbBL: 0, nbClients: 0 });
    const s = metierStats.get(info.metier);
    s.ca += caPDV;
    s.nbBL += nbBL;
    s.nbClients++;
  }
  if (!metierStats.size)
    return { title:'Panier moyen par métier', html:'<p class="text-xs t-disabled p-2">Aucune donnée croisée métier × PDV.</p>' };

  const rows = [...metierStats.entries()]
    .map(([metier, s]) => ({
      metier,
      ca: Math.round(s.ca),
      nbClients: s.nbClients,
      nbBL: s.nbBL,
      vmc: s.nbBL > 0 ? Math.round(s.ca / s.nbBL) : 0, // valeur moyenne commande
      caPerClient: s.nbClients > 0 ? Math.round(s.ca / s.nbClients) : 0,
    }))
    .filter(r => r.nbClients >= 2)
    .sort((a, b) => b.caPerClient - a.caPerClient);

  if (!rows.length)
    return { title:'Panier moyen par métier', html:'<p class="text-xs t-disabled p-2">Aucun métier avec ≥2 clients PDV.</p>' };

  const maxVMC = Math.max(...rows.map(r => r.vmc));
  const maxCaPerClient = Math.max(...rows.map(r => r.caPerClient));
  const avgVMC = Math.round(rows.reduce((s, r) => s + r.vmc, 0) / rows.length);

  const tableRows = rows.slice(0, 20).map(r => {
    const vmcColor = r.vmc >= avgVMC * 1.3 ? 'var(--c-ok,#16a34a)' : r.vmc < avgVMC * 0.7 ? 'var(--c-danger,#dc2626)' : 'var(--c-primary)';
    const barW = maxCaPerClient > 0 ? Math.round(r.caPerClient / maxCaPerClient * 50) + 'px' : '0px';
    const isStrat = _S._metierStrategiques?.has?.(r.metier) || false;
    return `<tr class="text-[10px] border-b b-light">
      <td class="py-1.5 px-2 font-semibold">${r.metier.substring(0,20)}${isStrat ? ' ★' : ''}</td>
      <td class="py-1.5 px-1 text-center t-disabled">${r.nbClients}</td>
      <td class="py-1.5 px-2 text-right">${formatEuro(r.ca)}</td>
      <td class="py-1.5 px-2 text-right">
        <div style="display:flex;align-items:center;justify-content:flex-end;gap:4px">
          <div style="height:4px;border-radius:2px;width:${barW};background:var(--c-primary);opacity:0.5"></div>
          <span class="font-bold">${formatEuro(r.caPerClient)}</span>
        </div>
      </td>
      <td class="py-1.5 px-2 text-right font-bold" style="color:${vmcColor}">${formatEuro(r.vmc)}</td>
      <td class="py-1.5 px-1 text-center t-disabled">${r.nbBL}</td>
    </tr>`;
  }).join('');

  return {
    title: `Panier moyen par métier — ${rows.length} métiers · VMC moy. ${formatEuro(avgVMC)}`,
    html: `<div class="overflow-x-auto"><table class="w-full border-collapse">
      <thead><tr class="border-b b-light text-[9px] t-disabled">
        <th class="py-1 px-2 text-left">Métier</th>
        <th class="py-1 px-1 text-center">Clients</th>
        <th class="py-1 px-2 text-right">CA PDV</th>
        <th class="py-1 px-2 text-right">CA/client</th>
        <th class="py-1 px-2 text-right">VMC</th>
        <th class="py-1 px-1 text-center">BL</th>
      </tr></thead>
      <tbody>${tableRows}</tbody>
    </table></div>`,
    footer: `VMC = valeur moyenne commande (CA ÷ nb BL) · CA/client = CA annuel moyen · vert = VMC >130% moy · rouge <70%`,
  };
}

function _nlQ_FamillesSousMediane() {
  const lose = _S.benchLists?.obsFamiliesLose;
  if (!lose?.length) return { title:'Familles sous la médiane réseau', html:'<p class="text-xs t-disabled">Chargez le fichier Terrain pour comparer avec le réseau.</p>' };
  const rows = lose.slice(0,12).map(f=>{
    const ecartStr = `${f.ecartPct>0?'+':''}${f.ecartPct}%`;
    const potStr = f.caTheorique>0 ? `<span class="text-[8px] t-disabled">(théorique\u00a0${formatEuro(f.caTheorique)})</span>` : '';
    return `<tr class="text-[10px] b-light border-b cursor-pointer hover:s-hover" onclick="openDiagnostic('${f.fam.replace(/'/g,"\\'")}','bench')"><td class="py-1 pr-2 font-semibold">${f.fam}</td><td class="py-1 pr-3 text-right font-bold">${formatEuro(f.caMe)}</td><td class="py-1 pr-3 text-right t-disabled">${formatEuro(f.caOther)}</td><td class="py-1 text-right font-bold" style="color:var(--c-danger)">${ecartStr} ${potStr}</td><td class="py-1 pl-1 text-[8px] t-disabled">🔍</td></tr>`;
  }).join('');
  const totalEcart = lose.reduce((s,f)=>s+Math.max(0,(f.caOther||0)-(f.caMe||0)),0);
  return { title:`Familles sous la médiane réseau — ${lose.length} familles (potentiel\u00a0${formatEuro(totalEcart)})`,
    html:`<div class="overflow-x-auto"><table class="w-full"><thead><tr class="text-[9px] t-disabled"><th class="text-left pr-2">Famille</th><th class="text-right pr-3">Moi</th><th class="text-right pr-3">Réseau</th><th class="text-right">Écart</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>`,
    footer:'Cliquer sur une famille pour ouvrir le diagnostic complet' };
}

function _nlQ_OmniSegment(segment) {
  const scores = _S.clientOmniScore;
  if (!scores?.size) return { title:'Segments omnicanaux', html:'<p class="text-xs t-disabled">Chargez la chalandise + fichiers ventes pour calculer les segments omnicanaux.</p>' };
  const LABELS = { mono:'Mono PDV 🏪', hybride:'Hybrides 🔀', digital:'Digital 📱', dormant:'Dormants 💤' };
  const COLOR = { mono:'var(--c-ok)', hybride:'var(--c-info,#3b82f6)', digital:'var(--c-caution)', dormant:'var(--c-danger)' };
  const segs = segment ? [segment] : ['mono','hybride','digital','dormant'];
  const rows = [];
  for (const seg of segs) {
    const list = [];
    for (const [cc, o] of scores) {
      if (o.segment !== seg) continue;
      const info = _S.chalandiseData?.get(cc);
      list.push({ cc, nom: info?.nom || _S.clientNomLookup?.[cc] || cc, metier: info?.metier||'', o });
    }
    list.sort((a,b)=>(b.o.caPDV+b.o.caHors)-(a.o.caPDV+a.o.caHors));
    if (!list.length) continue;
    const top = list.slice(0, segment ? 10 : 5);
    const headerRow = `<tr><td colspan="5" class="pt-3 pb-1 text-[10px] font-bold" style="color:${COLOR[seg]}">${LABELS[seg]} (${list.length})</td></tr>`;
    const dataRows = top.map(({cc,nom,metier,o})=>`<tr class="text-[10px] b-light border-b cursor-pointer hover:s-hover" onclick="openClient360('${cc}','nl')">
<td class="py-1 pr-2 font-semibold">${nom}<span class="text-[8px] t-disabled ml-1">${metier}</span></td>
<td class="py-1 pr-2 text-right">${o.caPDV>0?formatEuro(o.caPDV):'—'}</td>
<td class="py-1 pr-2 text-right">${o.caHors>0?formatEuro(o.caHors):'—'}</td>
<td class="py-1 pr-2 text-right t-disabled">${o.silenceDays<999?o.silenceDays+'j':'—'}</td>
<td class="py-1 text-right font-bold">${o.score}</td>
</tr>`).join('');
    rows.push(headerRow + dataRows);
  }
  const title = segment ? `${LABELS[segment]} — ${[...scores.values()].filter(o=>o.segment===segment).length} clients` : `Segments omnicanaux — ${scores.size} clients`;
  return { title,
    html:`<div class="overflow-x-auto"><table class="w-full"><thead><tr class="text-[9px] t-disabled"><th class="text-left pr-2">Client</th><th class="text-right pr-2">CA PDV</th><th class="text-right pr-2">CA digital</th><th class="text-right pr-2">Silence</th><th class="text-right">Score</th></tr></thead><tbody>${rows.join('')}</tbody></table></div>`,
    footer:'Score = ancrage PDV (40) + fréquence (30) + récence (30) · Cliquer pour fiche client 360°' };
}

function _nlQ_FamillesHors() {
  const list = _S.famillesHors;
  if (!list?.length) return { title:'Familles fuyantes', html:'<p class="text-xs t-disabled p-2">Chargez PDV + Terrain pour détecter les familles achetées hors agence.</p>' };
  const cIcon = c => c==='INTERNET'?'🌐':c==='REPRESENTANT'?'🤝':c==='DCS'?'📦':'📡';
  const rows = list.slice(0, 15).map(f => {
    const sub = f.clients.slice(0, 3).map(c => c.nom).join(', ');
    const safeFam = f.fam.replace(/\\/g,'\\\\').replace(/'/g,"\\'");
    return `<tr class="text-[10px] b-light border-b cursor-pointer hover:s-hover" onclick="openDiagnostic('${safeFam}','hors')">
<td class="py-1 pr-2 font-semibold">${f.fam}</td>
<td class="py-1 pr-2 text-right font-bold" style="color:var(--c-caution)">${formatEuro(f.caHors)}</td>
<td class="py-1 pr-2 text-center t-secondary">${f.nbClients}</td>
<td class="py-1 pr-2 text-center">${cIcon(f.mainCanal)}</td>
<td class="py-1 text-[8px] t-disabled truncate max-w-[120px]">${sub}</td>
</tr>`;
  }).join('');
  const total = list.reduce((s, f) => s + f.caHors, 0);
  return {
    title: `Familles fuyantes — ${list.length}\u00a0familles\u00a0·\u00a0${formatEuro(total)} hors agence`,
    html: `<div class="overflow-x-auto"><table class="w-full"><thead><tr class="text-[9px] t-disabled"><th class="text-left pr-2">Famille</th><th class="text-right pr-2">CA hors</th><th class="text-center pr-2">Clients</th><th class="text-center pr-2">Canal</th><th class="text-left">Exemples</th></tr></thead><tbody>${rows}</tbody></table></div>`,
    footer: 'Cliquer sur une famille pour ouvrir le diagnostic · Familles achetées hors agence par des clients PDV actifs' };
}

function _nlQ_CommercialFuites(commercial) {
  if (!_S.ventesClientArticle?.size || !_S.ventesClientHorsMagasin?.size)
    return { title:'Fuites portefeuille', html:'<p class="text-xs t-disabled p-2">Données PDV + Terrain requises.</p>' };
  const comShort = c => c.includes(' - ') ? c.split(' - ').slice(1).join(' ') : c;
  // Helper: compute fuite CA for one set of clients
  const computeFuitesForClients = ccs => {
    const famData = {};
    for (const cc of ccs) {
      const pdvArts = _S.ventesClientArticle.get(cc);
      const horArts = _S.ventesClientHorsMagasin.get(cc);
      if (!pdvArts || !horArts) continue;
      const famsPDV = new Set();
      for (const [code] of pdvArts) { const r = _S.articleFamille?.[code]; if (r) famsPDV.add(r); }
      for (const [code, v] of horArts) {
        const r = _S.articleFamille?.[code];
        if (!r || famsPDV.has(r)) continue;
        const ca = v.sumCA || 0;
        if (!famData[r]) famData[r] = { ca: 0, clients: [] };
        famData[r].ca += ca;
        const info = _S.chalandiseData?.get(cc);
        famData[r].clients.push({ cc, nom: info?.nom || _S.clientNomLookup?.[cc] || cc, ca });
      }
    }
    return Object.entries(famData)
      .filter(([, d]) => d.ca >= 50)
      .map(([r, d]) => ({ fam: famLib(r) || r, rawFam: r, ca: Math.round(d.ca), clients: d.clients.sort((a,b)=>b.ca-a.ca).slice(0,3) }))
      .sort((a, b) => b.ca - a.ca);
  };
  // ── Mode ranking : pas de commercial précisé ──────────────────
  if (!commercial) {
    if (!_S.clientsByCommercial?.size) return { title:'Fuites par commercial', html:'<p class="text-xs t-disabled p-2">Chargez la zone de chalandise pour voir les commerciaux.</p>' };
    const ranking = [];
    for (const [com, ccs] of _S.clientsByCommercial) {
      if (!com || !ccs.size) continue;
      const fams = computeFuitesForClients(ccs);
      const caTotal = fams.reduce((s, f) => s + f.ca, 0);
      if (caTotal < 100) continue;
      ranking.push({ com, caTotal, nFams: fams.length, nClients: [...ccs].filter(cc => _S.ventesClientHorsMagasin.has(cc)).length });
    }
    ranking.sort((a, b) => b.caTotal - a.caTotal);
    if (!ranking.length) return { title:'Fuites par commercial', html:'<p class="text-xs t-disabled p-2">Aucune fuite détectée dans les portefeuilles.</p>' };
    const totalFuite = ranking.reduce((s, r) => s + r.caTotal, 0);
    const rows = ranking.map(r => {
      const safeQ = r.com.replace(/\\/g,'\\\\').replace(/'/g,"\\'");
      return `<tr class="text-[10px] b-light border-b cursor-pointer hover:s-hover" onclick="_cematinSearch('commercial+${safeQ}+familles+fuyantes')">
<td class="py-1.5 pr-2 font-semibold">${comShort(r.com)}</td>
<td class="py-1.5 pr-2 text-right font-bold" style="color:var(--c-caution)">${formatEuro(r.caTotal)}</td>
<td class="py-1.5 pr-2 text-center">${r.nFams}</td>
<td class="py-1.5 text-center t-disabled">${r.nClients}</td>
</tr>`;
    }).join('');
    return { title:`Fuites par commercial — ${formatEuro(totalFuite)} total`,
      html:`<div class="overflow-x-auto"><table class="w-full"><thead><tr class="text-[9px] t-disabled"><th class="text-left pr-2">Commercial</th><th class="text-right pr-2">CA fuyant</th><th class="text-center pr-2">Familles</th><th class="text-center">Clients digital</th></tr></thead><tbody>${rows}</tbody></table></div>`,
      footer:'Cliquer sur un commercial pour voir ses familles fuyantes en détail' };
  }
  // ── Mode détail : commercial spécifique ───────────────────────
  const ccs = _S.clientsByCommercial?.get(commercial);
  if (!ccs?.size) return { title:`Fuites — ${comShort(commercial)}`, html:`<p class="text-xs t-disabled p-2">Commercial "${comShort(commercial)}" non trouvé dans la chalandise.</p>` };
  const famList = computeFuitesForClients(ccs);
  if (!famList.length) return { title:`Fuites portefeuille — ${comShort(commercial)}`, html:'<p class="text-xs t-disabled p-2">Aucune fuite détectée pour ce portefeuille.</p>' };
  const totalCA = famList.reduce((s, f) => s + f.ca, 0);
  const rows = famList.slice(0, 12).map(f => {
    const sub = f.clients.map(c => `${c.nom}\u00a0${formatEuro(c.ca)}`).join(', ');
    const safeFam = f.fam.replace(/\\/g,'\\\\').replace(/'/g,"\\'");
    return `<tr class="text-[10px] b-light border-b cursor-pointer hover:s-hover" onclick="openDiagnostic('${safeFam}','hors')">
<td class="py-1.5 pr-2 font-semibold">${f.fam}</td>
<td class="py-1.5 pr-2 text-right font-bold" style="color:var(--c-caution)">${formatEuro(f.ca)}</td>
<td class="py-1.5 pr-2 text-center">${f.clients.length}</td>
<td class="py-1.5 text-[8px] t-disabled truncate max-w-[140px]">${sub}</td>
</tr>`;
  }).join('');
  return { title:`Fuites portefeuille ${comShort(commercial)} — ${famList.length}\u00a0familles\u00a0·\u00a0${formatEuro(totalCA)}`,
    html:`<div class="overflow-x-auto"><table class="w-full"><thead><tr class="text-[9px] t-disabled"><th class="text-left pr-2">Famille</th><th class="text-right pr-2">CA fuyant</th><th class="text-center pr-2">Clients</th><th class="text-left">Exemples</th></tr></thead><tbody>${rows}</tbody></table></div>`,
    footer:`Familles que les clients de ${comShort(commercial)} achètent hors agence · Cliquer → diagnostic` };
}

function _nlQ_HeatmapFuites() {
  if (!_S.ventesClientArticle?.size || !_S.ventesClientHorsMagasin?.size)
    return { title:'Heatmap familles × métier', html:'<p class="text-xs t-disabled p-2">Chargez PDV + Terrain + chalandise pour calculer la heatmap.</p>' };
  const famList = (_S.famillesHors || []).slice(0, 8);
  if (!famList.length)
    return { title:'Heatmap familles × métier', html:'<p class="text-xs t-disabled p-2">Aucune famille fuyante détectée. Les familles hors agence n\'ont pas encore été calculées.</p>' };
  if (!_S.clientsByMetier?.size)
    return { title:'Heatmap familles × métier', html:'<p class="text-xs t-disabled p-2">Chargez la zone de chalandise pour afficher les métiers.</p>' };
  // Top métiers by PDV client count (exclude empty)
  const metierList = [..._S.clientsByMetier.entries()]
    .filter(([m]) => m)
    .map(([m, ccs]) => ({ m, n: [...ccs].filter(cc => _S.ventesClientArticle.has(cc)).length }))
    .filter(e => e.n >= 3)
    .sort((a, b) => b.n - a.n)
    .slice(0, 6)
    .map(e => e.m);
  if (!metierList.length)
    return { title:'Heatmap familles × métier', html:'<p class="text-xs t-disabled p-2">Pas assez de clients par métier (minimum 3).</p>' };
  // Build matrix: rawFam → metier → nb clients fuyants
  const matrix = {};
  for (const f of famList) { matrix[f.rawFam] = {}; for (const m of metierList) matrix[f.rawFam][m] = 0; }
  for (const [cc, horArts] of _S.ventesClientHorsMagasin) {
    const pdvArts = _S.ventesClientArticle.get(cc);
    if (!pdvArts) continue;
    const metier = _S.chalandiseData?.get(cc)?.metier;
    if (!metier || !metierList.includes(metier)) continue;
    const famsPDV = new Set();
    for (const [code] of pdvArts) { const r = _S.articleFamille?.[code]; if (r) famsPDV.add(r); }
    for (const [code] of horArts) {
      const r = _S.articleFamille?.[code];
      if (r && !famsPDV.has(r) && matrix[r]) matrix[r][metier]++;
    }
  }
  // Max value for color scaling
  const allVals = famList.flatMap(f => metierList.map(m => matrix[f.rawFam][m]));
  const maxVal = Math.max(...allVals, 1);
  // Metier totals (nb PDV clients)
  const metierTotals = {};
  for (const m of metierList) metierTotals[m] = [...(_S.clientsByMetier.get(m)||[])].filter(cc => _S.ventesClientArticle.has(cc)).length;
  // Shorten metier labels
  const mLabel = m => m.length > 12 ? m.slice(0,11)+'…' : m;
  // Render
  const headerCols = metierList.map(m => `<th class="py-1 px-1.5 text-center text-[8px] t-disabled font-semibold" title="${m}">${mLabel(m)}<br><span class="font-normal opacity-60">${metierTotals[m]}cl</span></th>`).join('');
  const rows = famList.map(f => {
    const cells = metierList.map(m => {
      const v = matrix[f.rawFam][m];
      const pct = metierTotals[m] > 0 ? Math.round(v / metierTotals[m] * 100) : 0;
      const alpha = maxVal > 0 ? v / maxVal : 0;
      const bg = alpha > 0 ? `rgba(251,146,60,${Math.max(0.1, alpha * 0.85)})` : 'transparent';
      const textCol = alpha > 0.5 ? '#fff' : alpha > 0.2 ? 'var(--c-caution)' : 'var(--t-disabled,#888)';
      return `<td class="py-1.5 px-1 text-center text-[9px] font-bold" style="background:${bg};color:${textCol}">${v > 0 ? `${v}<span style="font-weight:normal;font-size:7px;opacity:0.8"> (${pct}%)</span>` : '<span style="opacity:0.2">·</span>'}</td>`;
    }).join('');
    const safeFam = f.fam.replace(/\\/g,'\\\\').replace(/'/g,"\\'");
    return `<tr class="border-b b-light cursor-pointer hover:s-hover" onclick="openDiagnostic('${safeFam}','hors')">
<td class="py-1.5 px-2 text-[10px] font-semibold t-primary whitespace-nowrap">${f.fam}<span class="text-[8px] t-disabled font-normal ml-1">${formatEuro(f.caHors)}</span></td>${cells}</tr>`;
  }).join('');
  const totalFuites = famList.reduce((s, f) => s + f.caHors, 0);
  return {
    title: `Heatmap familles fuyantes × métier — ${famList.length} familles · ${formatEuro(totalFuites)}`,
    html: `<div class="overflow-x-auto"><table class="w-full border-collapse"><thead><tr class="border-b b-light"><th class="py-1 px-2 text-left text-[9px] t-disabled">Famille fuyante</th>${headerCols}</tr></thead><tbody>${rows}</tbody></table><p class="text-[8px] t-disabled mt-2">Nb clients du métier achetant cette famille hors agence (jamais au PDV) · intensité ∝ nb clients · cliquer → diagnostic</p></div>`,
  };
}

// ── NL: Alerte saisonnière proactive (mois prochain) ─────────
function _nlQ_SaisonProchainMois() {
  const nomsMois = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];
  const d = _S.finalData;
  if (!d.length)
    return { title: 'Alerte saisonnière', html: '<p class="text-xs t-disabled p-2">Chargez les données de ventes pour calculer les alertes saisonnières.</p>' };
  if (!Object.keys(_S.seasonalIndex || {}).length)
    return { title: 'Alerte saisonnière', html: '<p class="text-xs t-disabled p-2">Aucun index saisonnier disponible (nécessite ≥12 mois de données).</p>' };

  const nowMonth = new Date().getMonth();
  const nextMonth = (nowMonth + 1) % 12;
  const nextLabel = nomsMois[nextMonth];

  const alertes = [];
  for (const r of d) {
    if (r.nouveauMin <= 0 || r.W < 1 || r.isParent || (r.V === 0 && r.enleveTotal > 0)) continue;
    const coeffs = _S.seasonalIndex[r.famille];
    if (!coeffs || coeffs.length < 12) continue;
    const coeff = coeffs[nextMonth];
    if (!coeff || coeff <= 1.1) continue;
    const seuil = Math.ceil(r.nouveauMin * coeff);
    if (r.stockActuel >= seuil) continue;
    const qteCde = seuil - r.stockActuel;
    alertes.push({
      code: r.code, libelle: r.libelle || r.code, famille: r.famille,
      stockActuel: r.stockActuel, nouveauMin: r.nouveauMin, seuil, coeff,
      qteCde, valeur: qteCde * (r.prixUnitaire || 0),
      abcClass: r.abcClass, fmrClass: r.fmrClass,
    });
  }
  alertes.sort((a, b) => b.valeur - a.valeur);

  if (!alertes.length)
    return {
      title: `Alerte saisonnière — ${nextLabel}`,
      html: `<p class="text-xs t-disabled p-2">✅ Aucun article sous seuil saisonnier pour ${nextLabel}. Le stock couvre les pics attendus.</p>`,
    };

  // Grouper par famille pour résumé
  const byFam = {};
  for (const a of alertes) {
    if (!byFam[a.famille]) byFam[a.famille] = { nb: 0, valeur: 0, coeff: 0 };
    byFam[a.famille].nb++;
    byFam[a.famille].valeur += a.valeur;
    byFam[a.famille].coeff = Math.max(byFam[a.famille].coeff, a.coeff);
  }
  const topFams = Object.entries(byFam).sort((a, b) => b[1].valeur - a[1].valeur).slice(0, 4);
  const famSummary = topFams.map(([fam, v]) =>
    `<span class="inline-flex items-center gap-1 text-[9px] px-2 py-0.5 rounded-full" style="background:rgba(251,146,60,0.15);color:var(--c-caution)">${fam} <span class="font-bold">${v.nb}</span> art · <span class="font-bold">${formatEuro(v.valeur)}</span></span>`
  ).join(' ');

  const totalVal = alertes.reduce((s, a) => s + a.valeur, 0);
  const rows = alertes.slice(0, 25).map(a => {
    const coeffPct = '+' + Math.round((a.coeff - 1) * 100) + '%';
    const abc = a.abcClass || '?', fmr = a.fmrClass || '?';
    const safeFam = a.famille.replace(/\\/g,'\\\\').replace(/'/g,"\\'");
    return `<tr class="border-b b-light text-xs hover:s-hover cursor-pointer" onclick="openDiagnostic('${safeFam}','saison')">
      <td class="py-1.5 px-2 font-mono text-[10px]">${a.code}</td>
      <td class="py-1.5 px-2 truncate max-w-[160px] t-primary" title="${a.libelle}">${a.libelle.substring(0,28)}</td>
      <td class="py-1.5 px-1 text-center text-[9px] t-disabled">${abc}${fmr}</td>
      <td class="py-1.5 px-1 text-center">${a.stockActuel}</td>
      <td class="py-1.5 px-1 text-center font-bold" style="color:var(--c-caution)">${a.seuil} <span class="text-[8px] font-normal" style="color:var(--c-caution);opacity:0.7">(${coeffPct})</span></td>
      <td class="py-1.5 px-1 text-center font-bold" style="color:var(--c-danger)">+${a.qteCde}</td>
      <td class="py-1.5 px-2 text-right font-bold t-primary">${a.valeur > 0 ? formatEuro(a.valeur) : '—'}</td>
    </tr>`;
  }).join('');

  const html = `<div class="flex flex-wrap gap-1 mb-2">${famSummary}</div>
    <div class="overflow-x-auto">
      <table class="w-full border-collapse">
        <thead><tr class="border-b b-light">
          <th class="py-1 px-2 text-left text-[9px] t-disabled">Code</th>
          <th class="py-1 px-2 text-left text-[9px] t-disabled">Libellé</th>
          <th class="py-1 px-1 text-center text-[9px] t-disabled">Cl</th>
          <th class="py-1 px-1 text-center text-[9px] t-disabled">Stock</th>
          <th class="py-1 px-1 text-center text-[9px] t-disabled">Seuil ${nextLabel}</th>
          <th class="py-1 px-1 text-center text-[9px] t-disabled">À cder</th>
          <th class="py-1 px-2 text-right text-[9px] t-disabled">Valeur</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
    ${alertes.length > 25 ? `<p class="text-[9px] t-disabled mt-1">+${alertes.length - 25} articles supplémentaires · voir onglet Mon Stock → Saisonnier</p>` : ''}`;

  return {
    title: `🌡️ Alerte saisonnière ${nextLabel} — ${alertes.length} article${alertes.length > 1 ? 's' : ''} · ${formatEuro(totalVal)} à risque`,
    html,
    footer: `Seuil = MIN annuel × coefficient saisonnier ${nextLabel} (coeff > 1.10 uniquement) · cliquer → diagnostic famille`,
  };
}

// ── NL: Synthèse scorecard par commercial ────────────────────
function _nlQ_SyntheseCommercial() {
  if (!_S.clientsByCommercial?.size)
    return { title:'Synthèse par commercial', html:'<p class="text-xs t-disabled p-2">Chargez la zone de chalandise pour voir les portefeuilles commerciaux.</p>' };

  const nowTs = Date.now();
  const SILENCE_DAYS = 90;
  const comShort = c => c.includes(' - ') ? c.split(' - ').slice(1).join(' - ') : c;

  const rows = [];
  for (const [com, ccs] of _S.clientsByCommercial) {
    if (!com || !ccs.size) continue;

    let caPDV = 0, caFuyant = 0, nbActifs = 0, nbSilencieux = 0, nbDigital = 0;
    let scoreSum = 0, scoreCount = 0;

    for (const cc of ccs) {
      // CA PDV
      const pdvArts = _S.ventesClientArticle?.get(cc);
      if (pdvArts) for (const [, v] of pdvArts) caPDV += (v.sumCA || 0);

      // Actif / silencieux
      const lastOrder = _S.clientLastOrder?.get(cc);
      if (lastOrder) {
        const ageDays = (nowTs - lastOrder) / 86400000;
        if (ageDays < SILENCE_DAYS) nbActifs++;
        else if (pdvArts?.size > 0) nbSilencieux++;
      }

      // Omni
      const omni = _S.clientOmniScore?.get(cc);
      if (omni) {
        caFuyant += (omni.caHors || 0);
        if (omni.segment === 'digital') nbDigital++;
        scoreSum += omni.score;
        scoreCount++;
      }
    }

    const total = ccs.size;
    if (caPDV < 50 && caFuyant < 50) continue; // skip commerciaux sans données
    const captation = (caPDV + caFuyant) > 0 ? caPDV / (caPDV + caFuyant) : 1;
    const omniMoyen = scoreCount > 0 ? Math.round(scoreSum / scoreCount) : null;

    rows.push({ com, total, nbActifs, nbSilencieux, nbDigital, caPDV, caFuyant, captation, omniMoyen });
  }

  if (!rows.length)
    return { title:'Synthèse par commercial', html:'<p class="text-xs t-disabled p-2">Aucun commercial avec données de ventes.</p>' };

  rows.sort((a, b) => b.caPDV - a.caPDV);

  const totalCA = rows.reduce((s, r) => s + r.caPDV, 0);
  const totalFuite = rows.reduce((s, r) => s + r.caFuyant, 0);

  function _captColor(c) {
    if (c >= 0.8) return 'var(--c-ok,#16a34a)';
    if (c >= 0.6) return 'var(--c-caution,#d97706)';
    return 'var(--c-danger,#dc2626)';
  }
  function _scoreBar(s) {
    if (s === null) return '<span class="t-disabled text-[9px]">—</span>';
    const c = s >= 65 ? 'var(--c-ok,#16a34a)' : s >= 40 ? 'var(--c-caution,#d97706)' : 'var(--c-danger,#dc2626)';
    return `<span style="color:${c};font-weight:700">${s}</span><div style="height:2px;border-radius:1px;background:rgba(128,128,128,0.15);width:36px;display:inline-block;margin-left:4px;vertical-align:middle"><div style="height:2px;border-radius:1px;width:${s}%;background:${c}"></div></div>`;
  }

  const tableRows = rows.map(r => {
    const safeQ = r.com.replace(/\\/g,'\\\\').replace(/'/g,"\\'");
    const actifPct = r.total > 0 ? Math.round(r.nbActifs / r.total * 100) : 0;
    const captPct = Math.round(r.captation * 100);
    const captC = _captColor(r.captation);
    const hasFuite = r.caFuyant >= 100;
    return `<tr class="text-[10px] border-b b-light cursor-pointer hover:s-hover" onclick="_cematinSearch('commercial+${safeQ}+familles+fuyantes')">
      <td class="py-1.5 px-2 font-semibold t-primary whitespace-nowrap">${comShort(r.com)}</td>
      <td class="py-1.5 px-1 text-center t-secondary">${r.total}</td>
      <td class="py-1.5 px-1 text-center"><span style="color:var(--c-ok,#16a34a);font-weight:700">${r.nbActifs}</span><span class="t-disabled text-[9px]"> (${actifPct}%)</span></td>
      <td class="py-1.5 px-1 text-center ${r.nbSilencieux > 0 ? '' : 't-disabled'}" style="${r.nbSilencieux > 3 ? 'color:var(--c-caution)' : ''}">${r.nbSilencieux || '—'}</td>
      <td class="py-1.5 px-2 text-right font-bold t-primary">${formatEuro(r.caPDV)}</td>
      <td class="py-1.5 px-2 text-right ${hasFuite ? 'font-bold' : 't-disabled'}" style="${hasFuite ? 'color:var(--c-caution)' : ''}">${hasFuite ? formatEuro(r.caFuyant) : '—'}</td>
      <td class="py-1.5 px-1 text-center font-bold" style="color:${captC}">${captPct}%</td>
      <td class="py-1.5 px-2">${_scoreBar(r.omniMoyen)}</td>
    </tr>`;
  }).join('');

  const html = `<div class="overflow-x-auto">
    <table class="w-full border-collapse">
      <thead><tr class="border-b b-light text-[9px] t-disabled">
        <th class="py-1 px-2 text-left">Commercial</th>
        <th class="py-1 px-1 text-center">Clients</th>
        <th class="py-1 px-1 text-center">Actifs</th>
        <th class="py-1 px-1 text-center">Silenc.</th>
        <th class="py-1 px-2 text-right">CA PDV</th>
        <th class="py-1 px-2 text-right">CA fuyant</th>
        <th class="py-1 px-1 text-center">Capt.</th>
        <th class="py-1 px-2 text-left">Omni</th>
      </tr></thead>
      <tbody>${tableRows}</tbody>
    </table>
  </div>`;

  return {
    title: `Synthèse commerciaux — ${rows.length} portefeuilles · ${formatEuro(totalCA)} PDV · ${formatEuro(totalFuite)} fuyant`,
    html,
    footer: `Actifs = commande PDV <90j · Captation = CA PDV / (PDV + fuyant) · Score omni = ancrage PDV (40) + fréq (30) + récence (30) · Cliquer → fuites du commercial`,
  };
}

// ── NL: Radar familles — scatter CA PDV vs CA fuyant ─────────
function _nlQ_RadarFamilles() {
  if (!_S.ventesClientArticle?.size)
    return { title:'Radar familles', html:'<p class="text-xs t-disabled p-2">Chargez les données PDV pour calculer le radar familles.</p>' };

  // ── 1. CA PDV par famille ──
  const famPDV = new Map();
  for (const [cc, arts] of _S.ventesClientArticle) {
    for (const [code, v] of arts) {
      const fam = _S.articleFamille?.[code];
      if (!fam) continue;
      if (!famPDV.has(fam)) famPDV.set(fam, { ca: 0, clients: new Set() });
      const d = famPDV.get(fam);
      d.ca += v.sumCA || 0;
      d.clients.add(cc);
    }
  }

  // ── 2. CA fuyant par famille ──
  const famHors = new Map();
  if (_S.famillesHors?.length) {
    for (const f of _S.famillesHors) famHors.set(f.rawFam, f.caHors || 0);
  } else if (_S.ventesClientHorsMagasin?.size) {
    for (const [cc, arts] of _S.ventesClientHorsMagasin) {
      const pdvFams = new Set();
      const pdvArts = _S.ventesClientArticle?.get(cc);
      if (pdvArts) for (const [code] of pdvArts) { const f = _S.articleFamille?.[code]; if (f) pdvFams.add(f); }
      for (const [code, v] of arts) {
        const fam = _S.articleFamille?.[code];
        if (!fam || pdvFams.has(fam)) continue;
        famHors.set(fam, (famHors.get(fam) || 0) + (v.sumCA || 0));
      }
    }
  }

  // ── 3. Merge — seuil min pour réduire le bruit ──
  const points = [];
  const allFams = new Set([...famPDV.keys(), ...famHors.keys()]);
  for (const rawFam of allFams) {
    const pdv = famPDV.get(rawFam) || { ca: 0, clients: new Set() };
    const caHors = famHors.get(rawFam) || 0;
    if (pdv.ca < 500 && caHors < 200) continue;
    points.push({ rawFam, fam: famLib(rawFam) || rawFam, caPDV: Math.round(pdv.ca), caHors: Math.round(caHors), nbClients: pdv.clients.size });
  }

  if (!points.length)
    return { title:'Radar familles', html:'<p class="text-xs t-disabled p-2">Aucune famille avec données suffisantes (seuil PDV >500€ ou fuyant >200€).</p>' };

  // ── 4. SVG scatter ──
  const W = 380, H = 260, mL = 50, mB = 32, mR = 14, mT = 18;
  const pw = W - mL - mR, ph = H - mT - mB;
  const maxPDV = Math.max(...points.map(p => p.caPDV), 1);
  const maxHors = Math.max(...points.map(p => p.caHors), 1);
  const qThX = maxPDV * 0.25, qThY = maxHors * 0.25;

  // sqrt scale for visual spread
  const xPos = v => mL + Math.sqrt(Math.max(0, v) / maxPDV) * pw;
  const yPos = v => mT + ph - Math.sqrt(Math.max(0, v) / maxHors) * ph;
  const qX = xPos(qThX), qY = yPos(qThY);

  // Axis tick labels
  function fmtK(v) { return v >= 1000 ? Math.round(v / 1000) + 'k' : Math.round(v) + ''; }
  const xTicks = [0.1, 0.25, 0.5, 1.0].map(f => ({ v: maxPDV * f, x: xPos(maxPDV * f) }));
  const yTicks = [0.1, 0.25, 0.5, 1.0].map(f => ({ v: maxHors * f, y: yPos(maxHors * f) }));

  const ticksHtml = [
    ...xTicks.map(t => `<text x="${t.x.toFixed(1)}" y="${H - mB + 10}" font-size="6.5" text-anchor="middle" fill="rgba(128,128,128,0.55)">${fmtK(t.v)}</text>`),
    ...yTicks.map(t => `<text x="${mL - 3}" y="${t.y.toFixed(1) - 0 + 2}" font-size="6.5" text-anchor="end" fill="rgba(128,128,128,0.55)">${fmtK(t.v)}</text>`),
  ].join('');

  const bgQ = `
    <rect x="${mL}" y="${mT}" width="${qX - mL}" height="${qY - mT}" fill="rgba(220,38,38,0.04)"/>
    <rect x="${qX}" y="${mT}" width="${W - mR - qX}" height="${qY - mT}" fill="rgba(251,146,60,0.05)"/>
    <rect x="${mL}" y="${qY}" width="${qX - mL}" height="${H - mB - qY}" fill="rgba(156,163,175,0.04)"/>
    <rect x="${qX}" y="${qY}" width="${W - mR - qX}" height="${H - mB - qY}" fill="rgba(22,163,74,0.05)"/>
    <line x1="${qX.toFixed(1)}" y1="${mT}" x2="${qX.toFixed(1)}" y2="${H - mB}" stroke="rgba(128,128,128,0.18)" stroke-dasharray="3,3"/>
    <line x1="${mL}" y1="${qY.toFixed(1)}" x2="${W - mR}" y2="${qY.toFixed(1)}" stroke="rgba(128,128,128,0.18)" stroke-dasharray="3,3"/>`;

  const qLabels = `
    <text x="${mL + 3}" y="${mT + 9}" font-size="6.5" fill="rgba(220,38,38,0.45)" font-style="italic">perdu</text>
    <text x="${qX + 3}" y="${mT + 9}" font-size="6.5" fill="rgba(217,119,6,0.55)" font-style="italic">à défendre</text>
    <text x="${mL + 3}" y="${H - mB - 4}" font-size="6.5" fill="rgba(128,128,128,0.4)" font-style="italic">marginal</text>
    <text x="${qX + 3}" y="${H - mB - 4}" font-size="6.5" fill="rgba(22,163,74,0.55)" font-style="italic">solide</text>`;

  const axes = `
    <line x1="${mL}" y1="${mT}" x2="${mL}" y2="${H - mB}" stroke="rgba(128,128,128,0.3)" stroke-width="1"/>
    <line x1="${mL}" y1="${H - mB}" x2="${W - mR}" y2="${H - mB}" stroke="rgba(128,128,128,0.3)" stroke-width="1"/>
    <text x="${mL + pw / 2}" y="${H - 3}" font-size="7.5" text-anchor="middle" fill="rgba(128,128,128,0.65)">CA PDV (€) →</text>
    <text x="10" y="${mT + ph / 2}" font-size="7.5" text-anchor="middle" fill="rgba(128,128,128,0.65)" transform="rotate(-90,10,${mT + ph / 2})">↑ CA fuyant (€)</text>`;

  const sorted = [...points].sort((a, b) => (b.caPDV + b.caHors) - (a.caPDV + a.caHors));
  const topLabel = new Set(sorted.slice(0, 9).map(p => p.rawFam));

  const bubbles = points.map(p => {
    const cx = xPos(p.caPDV), cy = yPos(p.caHors);
    const r = Math.max(3.5, Math.min(15, Math.sqrt(p.nbClients + 1) * 1.9));
    let fill;
    if (p.caPDV < qThX && p.caHors >= qThY) fill = 'rgba(220,38,38,0.62)';
    else if (p.caPDV >= qThX && p.caHors >= qThY) fill = 'rgba(251,146,60,0.68)';
    else if (p.caPDV >= qThX && p.caHors < qThY) fill = 'rgba(22,163,74,0.58)';
    else fill = 'rgba(156,163,175,0.38)';
    const safeFam = p.fam.replace(/'/g, "\\'");
    const lbl = topLabel.has(p.rawFam)
      ? `<text x="${cx.toFixed(1)}" y="${(cy - r - 2).toFixed(1)}" font-size="6" text-anchor="middle" fill="var(--t-secondary,#94a3b8)" opacity="0.9">${p.fam.substring(0, 11)}</text>`
      : '';
    return `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${r.toFixed(1)}" fill="${fill}" stroke="rgba(255,255,255,0.15)" stroke-width="0.5" style="cursor:pointer" onclick="openDiagnostic('${safeFam}','hors')"><title>${p.fam}: PDV ${formatEuro(p.caPDV)} · fuyant ${formatEuro(p.caHors)} · ${p.nbClients} clients</title></circle>${lbl}`;
  }).join('');

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" style="width:100%;max-height:270px;display:block;overflow:visible">${bgQ}${qLabels}${axes}${ticksHtml}${bubbles}</svg>`;

  const legend = `<div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:5px;font-size:9px;color:var(--t-secondary,#94a3b8)">
    <span style="display:flex;align-items:center;gap:3px"><span style="width:7px;height:7px;border-radius:50%;background:rgba(22,163,74,0.58);flex-shrink:0"></span>Solide</span>
    <span style="display:flex;align-items:center;gap:3px"><span style="width:7px;height:7px;border-radius:50%;background:rgba(251,146,60,0.68);flex-shrink:0"></span>À défendre</span>
    <span style="display:flex;align-items:center;gap:3px"><span style="width:7px;height:7px;border-radius:50%;background:rgba(220,38,38,0.62);flex-shrink:0"></span>Perdu</span>
    <span style="display:flex;align-items:center;gap:3px"><span style="width:7px;height:7px;border-radius:50%;background:rgba(156,163,175,0.38);flex-shrink:0"></span>Marginal</span>
    <span style="opacity:0.6">· Taille bulle = nb clients · Cliquer → diagnostic</span>
  </div>`;

  const perdu = points.filter(p => p.caPDV < qThX && p.caHors >= qThY).length;
  const aDefendre = points.filter(p => p.caPDV >= qThX && p.caHors >= qThY).length;

  return {
    title: `Radar familles — ${points.length} familles · ${perdu} perdues · ${aDefendre} à défendre`,
    html: svg + legend,
    footer: `Échelle √ · Quadrants à 25% du max · PDV >${formatEuro(500)} ou fuyant >${formatEuro(200)}`,
  };
}

function _nlQ_EvolutionFamille() {
  if (!_S.articleMonthlySales || !Object.keys(_S.articleMonthlySales).length)
    return { title:'Évolution familles', html:'<p class="text-xs t-disabled p-2">Chargez le fichier consommé pour accéder aux ventes mensuelles par famille.</p>' };

  // ── 1. Agréger quantités mensuelles par famille ──
  const now = new Date();
  const curM = now.getMonth();           // 0-11
  const prevM = (curM + 11) % 12;       // mois précédent
  const famMonthly = {};
  for (const [code, months] of Object.entries(_S.articleMonthlySales)) {
    const fam = _S.articleFamille?.[code]; if (!fam) continue;
    if (!famMonthly[fam]) famMonthly[fam] = new Array(12).fill(0);
    for (let m = 0; m < 12; m++) famMonthly[fam][m] += months[m] || 0;
  }

  // ── 2. Calculer delta% mois courant vs mois précédent ──
  const MONTH_FR = ['Janv','Févr','Mars','Avr','Mai','Juin','Juil','Août','Sept','Oct','Nov','Déc'];
  const rows = [];
  for (const [rawFam, months] of Object.entries(famMonthly)) {
    const cur = months[curM], prev = months[prevM];
    if (prev <= 0 && cur <= 0) continue;
    if (cur < 5 && prev < 5) continue; // filtre bruit unités
    const delta = prev > 0 ? (cur - prev) / prev : (cur > 0 ? 1 : 0);
    rows.push({ rawFam, fam: famLib(rawFam) || rawFam, cur, prev, delta, months });
  }
  rows.sort((a, b) => b.delta - a.delta);

  if (!rows.length)
    return { title:'Évolution familles', html:'<p class="text-xs t-disabled p-2">Aucune donnée mensuelle disponible.</p>' };

  // ── 3. Séparer top hausses / top baisses ──
  const hausses = rows.filter(r => r.delta >= 0).slice(0, 8);
  const baisses = rows.filter(r => r.delta < 0).slice(-8).reverse();

  function badge(delta) {
    const pct = (delta * 100).toFixed(0);
    if (delta >= 0.3) return `<span class="text-xs font-bold" style="color:var(--c-ok)">▲ +${pct}%</span>`;
    if (delta > 0)    return `<span class="text-xs font-bold" style="color:var(--c-ok)">▲ +${pct}%</span>`;
    if (delta > -0.3) return `<span class="text-xs font-bold" style="color:var(--c-caution)">▼ ${pct}%</span>`;
    return `<span class="text-xs font-bold" style="color:var(--c-danger)">▼ ${pct}%</span>`;
  }

  function sparkline(months) {
    const max = Math.max(...months, 1);
    const pts = months.map((v, i) => {
      const x = (i / 11 * 60).toFixed(1);
      const y = (12 - v / max * 12).toFixed(1);
      return `${x},${y}`;
    }).join(' ');
    const curX = (curM / 11 * 60).toFixed(1);
    const curY = (12 - months[curM] / max * 12).toFixed(1);
    return `<svg width="62" height="14" viewBox="0 0 62 14" style="display:inline-block;vertical-align:middle">
      <polyline points="${pts}" fill="none" stroke="rgba(100,130,200,0.5)" stroke-width="1.2"/>
      <circle cx="${curX}" cy="${curY}" r="2" fill="var(--c-action)"/>
    </svg>`;
  }

  function tableRows(list) {
    return list.map(r => `<tr class="border-b" style="border-color:rgba(255,255,255,0.04)">
      <td class="py-1 pr-2 text-xs t-primary font-medium whitespace-nowrap">${r.fam}</td>
      <td class="py-1 px-2 text-xs t-secondary text-right">${r.prev.toLocaleString('fr-FR')}</td>
      <td class="py-1 px-2 text-xs t-secondary text-right">${r.cur.toLocaleString('fr-FR')}</td>
      <td class="py-1 pl-2 text-right">${badge(r.delta)}</td>
      <td class="py-1 pl-3">${sparkline(r.months)}</td>
    </tr>`).join('');
  }

  const head = `<thead><tr class="t-disabled text-[10px]">
    <th class="py-1 pr-2 text-left font-normal">Famille</th>
    <th class="py-1 px-2 text-right font-normal">${MONTH_FR[prevM]}</th>
    <th class="py-1 px-2 text-right font-normal">${MONTH_FR[curM]}</th>
    <th class="py-1 pl-2 text-right font-normal">Δ%</th>
    <th class="py-1 pl-3 text-left font-normal">12 mois</th>
  </tr></thead>`;

  const html = `<div class="grid grid-cols-2 gap-3">
    <div>
      <div class="text-xs font-semibold mb-1" style="color:var(--c-ok)">▲ En hausse (${hausses.length})</div>
      <table class="w-full">${head}<tbody>${tableRows(hausses)}</tbody></table>
    </div>
    <div>
      <div class="text-xs font-semibold mb-1" style="color:var(--c-danger)">▼ En baisse (${baisses.length})</div>
      <table class="w-full">${head}<tbody>${tableRows(baisses)}</tbody></table>
    </div>
  </div>`;

  return {
    title: `Évolution familles — ${MONTH_FR[prevM]} → ${MONTH_FR[curM]} · ${rows.length} familles analysées`,
    html,
    footer: `Quantités prélevées · Filtre bruit <5 unités · Sparkline 12 mois`,
  };
}

// ── Sprint AJ : Prévision rupture <30j ────────────────────────
function _nlQ_PrevisionRupture() {
  if (!_S.finalData?.length)
    return { title:'Prévision ruptures', html:'<p class="text-xs t-disabled p-2">Chargez les données articles.</p>' };

  const now = new Date();
  const HORIZON = 30; // jours

  // VMJ = enleveTotal / globalJoursOuvres (ou 250j fallback)
  const jours = _S.globalJoursOuvres > 0 ? _S.globalJoursOuvres : 250;

  const rows = [];
  for (const r of _S.finalData) {
    if (r.isParent || (r.V === 0 && r.enleveTotal > 0)) continue;
    if (r.W < 2 || r.stockActuel <= 0) continue; // déjà en rupture ou trop rare
    const vmj = r.enleveTotal / jours; // qté/jour
    if (vmj <= 0) continue;
    const joursRestants = r.stockActuel / vmj;
    if (joursRestants > HORIZON) continue;
    const score = calcPriorityScore(r.W, r.prixUnitaire, r.ageJours);
    rows.push({ r, joursRestants: Math.round(joursRestants), vmj, score });
  }
  rows.sort((a, b) => a.joursRestants - b.joursRestants);

  if (!rows.length)
    return { title:'Prévision ruptures', html:`<p class="text-xs t-disabled p-2">Aucun article à risque de rupture dans les ${HORIZON} jours.</p>` };

  function urgColor(j) {
    if (j <= 7)  return 'var(--c-danger)';
    if (j <= 14) return 'var(--c-caution)';
    return 'var(--c-muted)';
  }

  const tbody = rows.slice(0, 25).map(({ r, joursRestants, vmj }) => {
    const c = urgColor(joursRestants);
    const fam = famLib(_S.articleFamille?.[r.code] || '') || '';
    return `<tr class="border-b" style="border-color:rgba(255,255,255,0.04)">
      <td class="py-1 pr-2 text-xs font-mono t-secondary">${r.code}</td>
      <td class="py-1 pr-2 text-xs t-primary" style="max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${r.libelle}</td>
      <td class="py-1 pr-2 text-xs t-disabled text-center">${fam}</td>
      <td class="py-1 px-1 text-xs text-right t-secondary">${r.stockActuel.toLocaleString('fr-FR')}</td>
      <td class="py-1 px-1 text-xs text-right t-secondary">${vmj.toFixed(2)}/j</td>
      <td class="py-1 pl-2 text-xs text-right font-bold" style="color:${c}">${joursRestants}j</td>
    </tr>`;
  }).join('');

  const crit = rows.filter(r => r.joursRestants <= 7).length;
  const warn = rows.filter(r => r.joursRestants > 7 && r.joursRestants <= 14).length;

  const html = `<div class="text-xs t-disabled mb-2">VMJ calculée sur ${jours} jours ouvrés · horizon ${HORIZON}j</div>
  <table class="w-full">
    <thead><tr class="t-disabled text-[10px]">
      <th class="py-1 pr-2 text-left font-normal">Code</th>
      <th class="py-1 pr-2 text-left font-normal">Article</th>
      <th class="py-1 pr-2 text-center font-normal">Famille</th>
      <th class="py-1 px-1 text-right font-normal">Stock</th>
      <th class="py-1 px-1 text-right font-normal">VMJ</th>
      <th class="py-1 pl-2 text-right font-normal">Rupture dans</th>
    </tr></thead>
    <tbody>${tbody}</tbody>
  </table>`;

  return {
    title: `Prévision ruptures <${HORIZON}j — ${rows.length} articles à risque`,
    html,
    footer: `🔴 ≤7j : ${crit} articles · 🟠 ≤14j : ${warn} articles · Triés par urgence`,
  };
}

// ── Sprint AK : Relance clients ce mois ──────────────────────
function _nlQ_RelanceClients() {
  if (!_S.clientLastOrder?.size)
    return { title:'Relance clients', html:'<p class="text-xs t-disabled p-2">Chargez les données clients (consommé + stock).</p>' };

  const nowTs = Date.now();
  const MIN_SILENCE = 45; // jours
  const MIN_CA = 500;     // €

  const rows = [];
  for (const [cc, lastDt] of _S.clientLastOrder) {
    const silence = Math.round((nowTs - (lastDt instanceof Date ? lastDt.getTime() : lastDt)) / 86400000);
    if (silence < MIN_SILENCE) continue;
    // CA PDV total du client
    let caPDV = 0;
    const arts = _S.ventesClientArticle?.get(cc);
    if (arts) for (const [, v] of arts) caPDV += (v.sumCA || 0);
    if (caPDV < MIN_CA) continue;
    const info = _S.chalandiseData?.get(cc);
    const nom = info?.nom || _S.clientNomLookup?.[cc] || cc;
    const commercial = info?.commercial || '';
    const metier = info?.metier || '';
    const classif = info?.classification || '';
    const lastArt = arts ? [...arts.entries()].sort((a, b) => (b[1].sumCA || 0) - (a[1].sumCA || 0))[0] : null;
    const lastArtLib = lastArt ? (_S.libelleLookup?.[lastArt[0]] || lastArt[0]) : '';
    rows.push({ cc, nom, silence, caPDV, commercial, metier, classif, lastArtLib });
  }
  rows.sort((a, b) => b.caPDV - a.caPDV);

  if (!rows.length)
    return { title:'Relance clients', html:`<p class="text-xs t-disabled p-2">Aucun client silencieux >${MIN_SILENCE}j avec CA PDV >${formatEuro(MIN_CA)}.</p>` };

  function silenceBadge(j) {
    if (j > 180) return `<span class="text-[9px] px-1.5 py-0.5 rounded" style="background:rgba(220,38,38,0.15);color:var(--c-danger)">${j}j</span>`;
    if (j > 90)  return `<span class="text-[9px] px-1.5 py-0.5 rounded" style="background:rgba(217,119,6,0.15);color:var(--c-caution)">${j}j</span>`;
    return `<span class="text-[9px] px-1.5 py-0.5 rounded" style="background:rgba(128,128,128,0.12);color:var(--c-muted)">${j}j</span>`;
  }

  const tbody = rows.slice(0, 20).map(r => `<tr class="border-b" style="border-color:rgba(255,255,255,0.04)">
    <td class="py-1 pr-2 text-xs t-primary font-medium">${r.nom}</td>
    <td class="py-1 pr-1 text-xs t-disabled">${r.metier}</td>
    <td class="py-1 pr-1 text-xs t-disabled">${r.commercial}</td>
    <td class="py-1 px-1 text-xs text-right font-semibold" style="color:var(--c-action)">${formatEuro(r.caPDV)}</td>
    <td class="py-1 px-1 text-center">${silenceBadge(r.silence)}</td>
    <td class="py-1 pl-1 text-[10px] t-disabled" style="max-width:130px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${r.lastArtLib}</td>
  </tr>`).join('');

  const html = `<table class="w-full">
    <thead><tr class="t-disabled text-[10px]">
      <th class="py-1 pr-2 text-left font-normal">Client</th>
      <th class="py-1 pr-1 text-left font-normal">Métier</th>
      <th class="py-1 pr-1 text-left font-normal">Commercial</th>
      <th class="py-1 px-1 text-right font-normal">CA PDV</th>
      <th class="py-1 px-1 text-center font-normal">Silence</th>
      <th class="py-1 pl-1 text-left font-normal">Dernier article</th>
    </tr></thead>
    <tbody>${tbody}</tbody>
  </table>`;

  return {
    title: `Relance clients — ${rows.length} clients à contacter`,
    html,
    footer: `Silencieux >${MIN_SILENCE}j · CA PDV >${formatEuro(MIN_CA)} · Triés par CA décroissant`,
  };
}

// ── Sprint AL : Nouveautés à calibrer ────────────────────────
function _nlQ_NouveautesCalibrer() {
  if (!_S.finalData?.length)
    return { title:'Nouveautés à calibrer', html:'<p class="text-xs t-disabled p-2">Chargez les données articles.</p>' };

  const active = r => !r.isParent && !(r.V === 0 && r.enleveTotal > 0);
  const rows = _S.finalData.filter(r =>
    active(r) && r.isNouveaute && r.W >= 2 &&
    (r.ancienMin === 0 || r.ancienMax === 0 || r.ancienMin > r.ancienMax)
  );

  if (!rows.length)
    return { title:'Nouveautés à calibrer', html:'<p class="text-xs t-disabled p-2">Aucune nouveauté nécessitant calibrage ERP (toutes ont déjà un MIN/MAX cohérent).</p>' };

  rows.sort((a, b) => b.W - a.W || b.prixUnitaire - a.prixUnitaire);

  function suggestion(r) {
    // Utiliser nouveauMin/nouveauMax calculés par engine si disponibles
    if (r.nouveauMin > 0 && r.nouveauMax > 0)
      return `<span style="color:var(--c-ok)">MIN=${r.nouveauMin} MAX=${r.nouveauMax}</span>`;
    // Estimation simple : W × 1.5 / W × 3
    const minEst = Math.max(1, Math.round(r.W * 1.5));
    const maxEst = Math.max(minEst + 1, Math.round(r.W * 3));
    return `<span style="color:var(--c-caution)">~MIN=${minEst} MAX=${maxEst}</span>`;
  }

  function issue(r) {
    if (r.ancienMin > r.ancienMax && r.ancienMin > 0) return `<span style="color:var(--c-danger)">MIN>MAX</span>`;
    if (r.ancienMin === 0 && r.ancienMax === 0) return `<span style="color:var(--c-caution)">Non calibré</span>`;
    if (r.ancienMin === 0) return `<span style="color:var(--c-caution)">MIN=0</span>`;
    return `<span style="color:var(--c-caution)">MAX=0</span>`;
  }

  const tbody = rows.slice(0, 25).map(r => {
    const fam = famLib(_S.articleFamille?.[r.code] || '') || '';
    return `<tr class="border-b" style="border-color:rgba(255,255,255,0.04)">
      <td class="py-1 pr-2 text-xs font-mono t-secondary">${r.code}</td>
      <td class="py-1 pr-2 text-xs t-primary" style="max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${r.libelle}</td>
      <td class="py-1 pr-2 text-xs t-disabled">${fam}</td>
      <td class="py-1 px-1 text-xs text-center font-bold" style="color:var(--c-action)">${r.W}</td>
      <td class="py-1 px-1 text-xs text-center">${issue(r)}</td>
      <td class="py-1 pl-2 text-xs">${suggestion(r)}</td>
    </tr>`;
  }).join('');

  const html = `<table class="w-full">
    <thead><tr class="t-disabled text-[10px]">
      <th class="py-1 pr-2 text-left font-normal">Code</th>
      <th class="py-1 pr-2 text-left font-normal">Article</th>
      <th class="py-1 pr-2 text-left font-normal">Famille</th>
      <th class="py-1 px-1 text-center font-normal">W</th>
      <th class="py-1 px-1 text-center font-normal">Problème ERP</th>
      <th class="py-1 pl-2 text-left font-normal">Suggestion</th>
    </tr></thead>
    <tbody>${tbody}</tbody>
  </table>`;

  return {
    title: `Nouveautés à calibrer — ${rows.length} articles`,
    html,
    footer: `Nouveautés W≥2 sans MIN/MAX cohérent · Suggestion basée sur l'historique calculé`,
  };
}

// ── Sprint AM : Position agence vs réseau ────────────────────
function _nlQ_PositionReseau() {
  const bench = _S.benchLists;
  if (!bench || !_S.finalData?.length)
    return { title:'Position vs réseau', html:'<p class="text-xs t-disabled p-2">Chargez les données Territoire (benchmark réseau requis).</p>' };

  const myStore = _S.selectedMyStore;
  const storesInt = _S.storesIntersection;

  // ── Taux de service local ──
  const fmArts = _S.finalData.filter(r => (r.fmrClass === 'F' || r.fmrClass === 'M') && r.W >= 1 && !r.isParent && !(r.V === 0 && r.enleveTotal > 0));
  const fmRup = fmArts.filter(r => r.stockActuel <= 0).length;
  const srLocal = fmArts.length > 0 ? Math.round(100 * (1 - fmRup / fmArts.length)) : null;

  // ── CA agence vs ventes réseau ──
  const vpm = _S.ventesParMagasin;
  let caLocal = 0, caReseau = 0, nbStores = 0;
  if (vpm && myStore && vpm[myStore]) {
    for (const [code, v] of Object.entries(vpm[myStore])) {
      caLocal += v.sumCA || 0;
    }
    // Réseau : toutes agences sauf la nôtre
    for (const [store, arts] of Object.entries(vpm)) {
      if (store === myStore) continue;
      nbStores++;
      for (const [, v] of Object.entries(arts)) caReseau += (v.sumCA || 0);
    }
  }
  const caMediane = nbStores > 0 ? caReseau / nbStores : 0;
  const caRatio = caMediane > 0 ? (caLocal / caMediane) : null;

  // ── Familles sous médiane réseau (storePerf) ──
  const famsSous = bench.storePerf?.filter(p => p.store === myStore && p.ratio < 0.75).length || 0;
  const famsTotal = bench.storePerf?.filter(p => p.store === myStore).length || 0;

  // ── Pépites non exploitées ──
  const pepites = bench.pepites?.length || 0;

  // ── Score position (synthèse) ──
  const scores = [];
  let scoreHtml = '';

  function _scoreRow(label, value, unit, benchVal, higherIsBetter = true) {
    if (value === null || value === undefined) return '';
    const ratio = benchVal > 0 ? value / benchVal : 1;
    const pct = Math.round(ratio * 100);
    const c = (higherIsBetter ? ratio >= 1 : ratio <= 1) ? 'var(--c-ok)' : ratio >= 0.8 ? 'var(--c-caution)' : 'var(--c-danger)';
    const bar = Math.min(100, pct);
    scores.push(pct);
    return `<div style="margin-bottom:8px">
      <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:2px">
        <span class="text-xs t-secondary">${label}</span>
        <span class="text-xs font-bold" style="color:${c}">${typeof value === 'number' && value > 1000 ? formatEuro(value) : value}${unit}</span>
      </div>
      <div style="height:4px;background:rgba(128,128,128,0.12);border-radius:2px">
        <div style="height:4px;width:${bar}%;background:${c};border-radius:2px;transition:width .4s"></div>
      </div>
      ${benchVal > 0 ? `<div class="text-[10px] t-disabled mt-0.5">Médiane réseau : ${typeof benchVal === 'number' && benchVal > 1000 ? formatEuro(benchVal) : Math.round(benchVal)}${unit}</div>` : ''}
    </div>`;
  }

  scoreHtml += _scoreRow('Taux de service F+M', srLocal !== null ? srLocal + '%' : null, '', 90, true);
  if (caLocal > 0) scoreHtml += _scoreRow('CA PDV', caLocal, '', caMediane, true);
  if (famsTotal > 0) scoreHtml += `<div style="margin-bottom:8px">
    <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:2px">
      <span class="text-xs t-secondary">Familles sous médiane réseau</span>
      <span class="text-xs font-bold" style="color:${famsSous > famsTotal * 0.3 ? 'var(--c-caution)' : 'var(--c-ok)'}">${famsSous} / ${famsTotal}</span>
    </div>
  </div>`;
  if (pepites > 0) scoreHtml += `<div style="margin-bottom:8px">
    <div style="display:flex;justify-content:space-between;align-items:baseline">
      <span class="text-xs t-secondary">Pépites réseau non exploitées</span>
      <span class="text-xs font-bold" style="color:var(--c-action)">${pepites} articles</span>
    </div>
  </div>`;

  // Score synthèse
  const avgScore = scores.length > 0 ? Math.round(scores.filter(Boolean).reduce((s, v) => s + v, 0) / scores.filter(Boolean).length) : null;
  const scoreLabel = avgScore === null ? '' : avgScore >= 100 ? 'Au-dessus de la médiane' : avgScore >= 80 ? 'Dans la norme' : 'En retrait';
  const scoreColor = avgScore === null ? 'var(--c-muted)' : avgScore >= 100 ? 'var(--c-ok)' : avgScore >= 80 ? 'var(--c-caution)' : 'var(--c-danger)';

  const html = `${avgScore !== null ? `<div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;padding:8px;border-radius:8px;background:rgba(128,128,128,0.06)">
    <span class="text-xs t-disabled">Positionnement réseau</span>
    <span style="margin-left:auto;font-size:1.1rem;font-weight:900;color:${scoreColor}">${avgScore}%</span>
    <span class="text-xs font-semibold" style="color:${scoreColor}">${scoreLabel}</span>
  </div>` : ''}${scoreHtml}
  <p class="text-[10px] t-disabled mt-2">${myStore ? `Agence ${myStore} · ` : ''}${nbStores} agences dans le réseau</p>`;

  return {
    title: `Position vs réseau${myStore ? ` — ${myStore}` : ''}`,
    html,
    footer: `Benchmark réseau multi-agences · Médiane des ventes réseau`,
  };
}

// ── Sprint AN : Dormants récupérables (achetés ailleurs) ─────
function _nlQ_DormantsRecuperables() {
  if (!_S.finalData?.length)
    return { title:'Dormants récupérables', html:'<p class="text-xs t-disabled p-2">Chargez les données articles.</p>' };
  if (!_S.ventesClientHorsMagasin?.size)
    return { title:'Dormants récupérables', html:'<p class="text-xs t-disabled p-2">Aucune donnée hors-MAGASIN disponible. Chargez un fichier multi-canal.</p>' };

  // Dormants : ageJours > DORMANT_DAYS (défini dans constants.js, ici on utilise 180 comme proxy)
  const DORMANT = 180;
  const dormants = new Map(_S.finalData
    .filter(r => !r.isParent && r.ageJours > DORMANT && r.stockActuel > 0 && r.W >= 1 && !(r.V === 0 && r.enleveTotal > 0))
    .map(r => [r.code, r])
  );

  // Croiser avec ventesClientHorsMagasin — trouver dormants achetés hors PDV
  const recup = [];
  const codeHors = new Map(); // code → {caHors, nbClients}
  for (const [cc, arts] of _S.ventesClientHorsMagasin) {
    for (const [code, v] of arts) {
      if (!dormants.has(code)) continue;
      if (!codeHors.has(code)) codeHors.set(code, { caHors: 0, clients: new Set() });
      const d = codeHors.get(code);
      d.caHors += (v.sumCA || 0);
      d.clients.add(cc);
    }
  }

  for (const [code, d] of codeHors) {
    const r = dormants.get(code);
    if (!r) continue;
    const valeurStock = r.stockActuel * (r.prixUnitaire || 0);
    recup.push({ r, caHors: d.caHors, nbClients: d.clients.size, valeurStock });
  }
  recup.sort((a, b) => b.caHors - a.caHors);

  if (!recup.length)
    return { title:'Dormants récupérables', html:`<p class="text-xs t-disabled p-2">Aucun article dormant (>${DORMANT}j) détecté comme acheté via d'autres canaux.</p>` };

  const totalValeur = recup.reduce((s, r) => s + r.valeurStock, 0);
  const totalCA = recup.reduce((s, r) => s + r.caHors, 0);

  const tbody = recup.slice(0, 20).map(({ r, caHors, nbClients, valeurStock }) => {
    const fam = famLib(_S.articleFamille?.[r.code] || '') || '';
    return `<tr class="border-b" style="border-color:rgba(255,255,255,0.04)">
      <td class="py-1 pr-2 text-xs font-mono t-secondary">${r.code}</td>
      <td class="py-1 pr-2 text-xs t-primary" style="max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${r.libelle}</td>
      <td class="py-1 pr-1 text-xs t-disabled text-center">${fam}</td>
      <td class="py-1 px-1 text-xs text-right t-secondary">${r.stockActuel}</td>
      <td class="py-1 px-1 text-xs text-right" style="color:var(--c-caution)">${formatEuro(valeurStock)}</td>
      <td class="py-1 px-1 text-xs text-center t-disabled">${nbClients}</td>
      <td class="py-1 pl-2 text-xs text-right font-semibold" style="color:var(--c-action)">${formatEuro(caHors)}</td>
    </tr>`;
  }).join('');

  const html = `<div class="text-xs t-disabled mb-2">Stock dormant (>${DORMANT}j) mais acheté hors PDV — opportunité de réactivation</div>
  <table class="w-full">
    <thead><tr class="t-disabled text-[10px]">
      <th class="py-1 pr-2 text-left font-normal">Code</th>
      <th class="py-1 pr-2 text-left font-normal">Article</th>
      <th class="py-1 pr-1 text-center font-normal">Famille</th>
      <th class="py-1 px-1 text-right font-normal">Stock</th>
      <th class="py-1 px-1 text-right font-normal">Val. stock</th>
      <th class="py-1 px-1 text-center font-normal">Clients</th>
      <th class="py-1 pl-2 text-right font-normal">CA hors PDV</th>
    </tr></thead>
    <tbody>${tbody}</tbody>
  </table>`;

  return {
    title: `Dormants récupérables — ${recup.length} articles · ${formatEuro(totalValeur)} de stock`,
    html,
    footer: `CA hors PDV visible : ${formatEuro(totalCA)} · Ces clients achètent ces articles ailleurs`,
  };
}

// ── Sprint AO : Ruptures répétées (chroniques) ───────────────
function _nlQ_RupturesRepetees() {
  if (!_S.articleMonthlySales || !_S.finalData?.length)
    return { title:'Ruptures répétées', html:'<p class="text-xs t-disabled p-2">Chargez les données articles (consommé + stock requis).</p>' };

  // Un article est en "rupture répétée" si :
  // - stockActuel <= 0
  // - dans l'historique mensuel : au moins 3 mois avec qté > 0 mais absents dans des mois intercalaires (proxy : écart-type sur les 12 mois élevé + mois à 0 non consécutifs)
  // Proxy simple : W >= 3, stock = 0, et dans articleMonthlySales : ≥ 3 mois à 0 malgré ventes régulières
  const SEUIL_MOIS_ZERO = 3;
  const rows = [];

  for (const r of _S.finalData) {
    if (r.isParent || r.stockActuel > 0 || r.W < 3) continue;
    if (r.V === 0 && r.enleveTotal > 0) continue;
    const months = _S.articleMonthlySales[r.code];
    if (!months) continue;
    const nbZero = months.filter(v => v === 0).length;
    const nbPos  = months.filter(v => v > 0).length;
    // Au moins 3 mois à 0 intercalés avec des mois avec ventes
    if (nbZero < SEUIL_MOIS_ZERO || nbPos < 3) continue;
    // Vérifier que les mois 0 ne sont pas tous consécutifs en début (nouveauté) ou fin (arrêt)
    // Compter transitions 0→pos ou pos→0
    let transitions = 0;
    for (let i = 1; i < 12; i++) {
      if ((months[i] === 0) !== (months[i - 1] === 0)) transitions++;
    }
    if (transitions < 4) continue; // ruptures chroniques = transitions fréquentes
    const score = calcPriorityScore(r.W, r.prixUnitaire, r.ageJours);
    rows.push({ r, nbZero, nbPos, transitions, score, months });
  }
  rows.sort((a, b) => b.score - a.score || b.transitions - a.transitions);

  if (!rows.length)
    return { title:'Ruptures répétées', html:'<p class="text-xs t-disabled p-2">Aucun article en rupture chronique détecté (critère : W≥3, stock=0, ≥3 mois à zéro non consécutifs).</p>' };

  function miniSparkline(months) {
    const max = Math.max(...months, 1);
    const pts = months.map((v, i) => `${(i / 11 * 44).toFixed(1)},${(10 - v / max * 10).toFixed(1)}`).join(' ');
    const bars = months.map((v, i) => v === 0
      ? `<rect x="${(i / 11 * 44).toFixed(1)}" y="0" width="2.5" height="12" fill="rgba(220,38,38,0.18)"/>`
      : '').join('');
    return `<svg width="46" height="12" viewBox="0 0 46 12" style="display:inline-block;vertical-align:middle">
      ${bars}
      <polyline points="${pts}" fill="none" stroke="rgba(100,130,200,0.6)" stroke-width="1.2"/>
    </svg>`;
  }

  const tbody = rows.slice(0, 20).map(({ r, nbZero, transitions, months }) => {
    const fam = famLib(_S.articleFamille?.[r.code] || '') || '';
    return `<tr class="border-b" style="border-color:rgba(255,255,255,0.04)">
      <td class="py-1 pr-2 text-xs font-mono t-secondary">${r.code}</td>
      <td class="py-1 pr-2 text-xs t-primary" style="max-width:150px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${r.libelle}</td>
      <td class="py-1 pr-2 text-xs t-disabled">${fam}</td>
      <td class="py-1 px-1 text-xs text-center font-bold" style="color:var(--c-action)">${r.W}</td>
      <td class="py-1 px-1 text-xs text-center" style="color:var(--c-danger)">${nbZero}/12 mois</td>
      <td class="py-1 pl-2">${miniSparkline(months)}</td>
    </tr>`;
  }).join('');

  const html = `<div class="text-xs t-disabled mb-2">Ruptures récurrentes (zones rouges = mois sans stock alors qu'il y a eu des ventes)</div>
  <table class="w-full">
    <thead><tr class="t-disabled text-[10px]">
      <th class="py-1 pr-2 text-left font-normal">Code</th>
      <th class="py-1 pr-2 text-left font-normal">Article</th>
      <th class="py-1 pr-2 text-left font-normal">Famille</th>
      <th class="py-1 px-1 text-center font-normal">W</th>
      <th class="py-1 px-1 text-center font-normal">Mois à zéro</th>
      <th class="py-1 pl-2 text-left font-normal">12 mois</th>
    </tr></thead>
    <tbody>${tbody}</tbody>
  </table>`;

  return {
    title: `Ruptures répétées — ${rows.length} articles chroniques`,
    html,
    footer: `Critère : W≥3, stock=0, ≥3 mois à 0 non consécutifs · Triés par score priorité`,
  };
}

// ── Sprint AP : Score qualité données ────────────────────────
function _nlQ_QualiteDonnees() {
  const d = _S.finalData;
  if (!d?.length)
    return { title:'Qualité données', html:'<p class="text-xs t-disabled p-2">Aucune donnée chargée.</p>' };

  const active = d.filter(r => !r.isParent && !(r.V === 0 && r.enleveTotal > 0));
  const n = active.length;
  if (!n) return { title:'Qualité données', html:'<p class="text-xs t-disabled p-2">Aucun article actif.</p>' };

  // ── Articles ──
  const sansMinMax = active.filter(r => r.ancienMin === 0 && r.ancienMax === 0 && r.W >= 2).length;
  const minGtMax   = active.filter(r => r.ancienMin > 0 && r.ancienMax > 0 && r.ancienMin > r.ancienMax).length;
  const sansPrix   = active.filter(r => !r.prixUnitaire || r.prixUnitaire === 0).length;
  const sansFam    = active.filter(r => !_S.articleFamille?.[r.code]).length;
  const pctOkArt   = Math.round(100 * (1 - (sansMinMax + minGtMax + sansPrix) / (n * 2)));

  // ── Clients ──
  const nClients = _S.ventesClientArticle?.size || 0;
  const nChaland = _S.chalandiseData?.size || 0;
  const nSansInfo = nClients > 0 ? Math.max(0, nClients - nChaland) : 0;
  const pctChaland = nClients > 0 ? Math.round(100 * Math.min(nChaland, nClients) / nClients) : 0;

  // ── Territoire ──
  const hasTerr  = (_S.territoireLines?.length || 0) > 0;
  const nTerrLines = _S.territoireLines?.length || 0;

  // ── Saisonnalité ──
  const nFamsSaison = Object.keys(_S.seasonalIndex || {}).length;
  const nFamsTotal  = new Set(active.map(r => _S.articleFamille?.[r.code]).filter(Boolean)).size;
  const pctSaison   = nFamsTotal > 0 ? Math.round(100 * nFamsSaison / nFamsTotal) : 0;

  // ── Score global ──
  const scores = {
    'ERP (MIN/MAX)': Math.max(0, 100 - Math.round(100 * (sansMinMax + minGtMax) / n)),
    'Familles': Math.max(0, 100 - Math.round(100 * sansFam / n)),
    'Prix unitaires': Math.max(0, 100 - Math.round(100 * sansPrix / n)),
    'Couverture clients': pctChaland,
    'Saisonnalité': pctSaison,
  };
  const globalScore = Math.round(Object.values(scores).reduce((s, v) => s + v, 0) / Object.keys(scores).length);

  function scoreRow(label, score, detail) {
    const c = score >= 90 ? 'var(--c-ok)' : score >= 70 ? 'var(--c-caution)' : 'var(--c-danger)';
    return `<tr class="border-b" style="border-color:rgba(255,255,255,0.04)">
      <td class="py-1.5 pr-3 text-xs t-secondary">${label}</td>
      <td class="py-1.5 px-2" style="width:100px">
        <div style="height:4px;background:rgba(128,128,128,0.12);border-radius:2px">
          <div style="height:4px;width:${score}%;background:${c};border-radius:2px"></div>
        </div>
      </td>
      <td class="py-1.5 px-1 text-xs font-bold text-right" style="color:${c}">${score}%</td>
      <td class="py-1.5 pl-2 text-[10px] t-disabled">${detail}</td>
    </tr>`;
  }

  const rows = [
    scoreRow('ERP MIN/MAX',        scores['ERP (MIN/MAX)'],   `${sansMinMax} sans calibrage · ${minGtMax} MIN>MAX`),
    scoreRow('Familles articles',  scores['Familles'],         `${sansFam} articles sans famille`),
    scoreRow('Prix unitaires',     scores['Prix unitaires'],   `${sansPrix} articles sans prix`),
    scoreRow('Couverture chalandise', scores['Couverture clients'], nClients ? `${nChaland}/${nClients} clients identifiés` : 'Chalandise non chargée'),
    scoreRow('Saisonnalité',       scores['Saisonnalité'],     `${nFamsSaison}/${nFamsTotal} familles indexées`),
  ].join('');

  const gcol = globalScore >= 85 ? 'var(--c-ok)' : globalScore >= 65 ? 'var(--c-caution)' : 'var(--c-danger)';

  const html = `<div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;padding:8px 10px;border-radius:8px;background:rgba(128,128,128,0.06)">
    <span class="text-xs t-disabled font-semibold">Score qualité global</span>
    <span style="margin-left:auto;font-size:1.2rem;font-weight:900;color:${gcol}">${globalScore}<span style="font-size:0.6rem">/100</span></span>
  </div>
  <table class="w-full">
    <tbody>${rows}</tbody>
  </table>
  <div class="text-[10px] t-disabled mt-2">${n.toLocaleString('fr-FR')} articles actifs · ${nTerrLines.toLocaleString('fr-FR')} lignes territoire · ${hasTerr ? 'Territoire chargé' : 'Sans territoire'}</div>`;

  return {
    title: `Qualité données — score ${globalScore}/100`,
    html,
    footer: `Analyse complète de la couverture des données disponibles`,
  };
}

// ── Sprint AQ : Stock sous MIN ERP ───────────────────────────
function _nlQ_SousMinERP() {
  if (!_S.finalData?.length)
    return { title:'Sous MIN ERP', html:'<p class="text-xs t-disabled p-2">Chargez les données articles.</p>' };

  const active = r => !r.isParent && !(r.V === 0 && r.enleveTotal > 0);
  const rows = _S.finalData.filter(r =>
    active(r) && r.ancienMin > 0 && r.stockActuel > 0 && r.stockActuel < r.ancienMin
  );
  rows.sort((a, b) => {
    const rA = a.stockActuel / a.ancienMin;
    const rB = b.stockActuel / b.ancienMin;
    return rA - rB || b.W - a.W;
  });

  if (!rows.length)
    return { title:'Sous MIN ERP', html:'<p class="text-xs t-disabled p-2">Aucun article avec stock entre 0 et MIN ERP. Tous les articles stockables sont au-dessus de leur seuil minimum.</p>' };

  const crit = rows.filter(r => r.stockActuel <= Math.ceil(r.ancienMin * 0.5)).length;

  const tbody = rows.slice(0, 30).map(r => {
    const ratio = r.stockActuel / r.ancienMin;
    const pct = Math.round(ratio * 100);
    const c = pct <= 50 ? 'var(--c-danger)' : pct <= 75 ? 'var(--c-caution)' : 'var(--c-muted)';
    const manque = r.ancienMin - r.stockActuel;
    const fam = famLib(_S.articleFamille?.[r.code] || '') || '';
    return `<tr class="border-b" style="border-color:rgba(255,255,255,0.04)">
      <td class="py-1 pr-2 text-xs font-mono t-secondary">${r.code}</td>
      <td class="py-1 pr-2 text-xs t-primary" style="max-width:170px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${r.libelle}</td>
      <td class="py-1 pr-1 text-xs t-disabled">${fam}</td>
      <td class="py-1 px-1 text-xs text-center font-bold" style="color:var(--c-action)">${r.W}</td>
      <td class="py-1 px-1 text-xs text-right t-secondary">${r.stockActuel}</td>
      <td class="py-1 px-1 text-xs text-right t-disabled">${r.ancienMin}</td>
      <td class="py-1 px-1 text-xs text-right font-semibold" style="color:${c}">−${manque}</td>
      <td class="py-1 pl-2" style="width:52px">
        <div style="height:4px;background:rgba(128,128,128,0.12);border-radius:2px">
          <div style="height:4px;width:${pct}%;background:${c};border-radius:2px"></div>
        </div>
      </td>
    </tr>`;
  }).join('');

  const html = `<table class="w-full">
    <thead><tr class="t-disabled text-[10px]">
      <th class="py-1 pr-2 text-left font-normal">Code</th>
      <th class="py-1 pr-2 text-left font-normal">Article</th>
      <th class="py-1 pr-1 text-left font-normal">Famille</th>
      <th class="py-1 px-1 text-center font-normal">W</th>
      <th class="py-1 px-1 text-right font-normal">Stock</th>
      <th class="py-1 px-1 text-right font-normal">MIN ERP</th>
      <th class="py-1 px-1 text-right font-normal">Manque</th>
      <th class="py-1 pl-2 font-normal">Remplissage</th>
    </tr></thead>
    <tbody>${tbody}</tbody>
  </table>`;

  return {
    title: `Sous MIN ERP — ${rows.length} articles · ${crit} critiques (≤50% du MIN)`,
    html,
    footer: `Stock > 0 mais < MIN ERP · Réassort à lancer avant rupture · Triés par ratio`,
  };
}

// ── Sprint AR : Cross-sell familles ──────────────────────────
function _nlQ_CrossSellFamilles() {
  if (!_S.ventesClientArticle?.size)
    return { title:'Cross-sell familles', html:'<p class="text-xs t-disabled p-2">Chargez les données clients (consommé requis).</p>' };

  // Pour chaque client, collecter les familles achetées
  const famPairs = new Map(); // "FAM1|FAM2" → count
  for (const [, arts] of _S.ventesClientArticle) {
    const fams = new Set();
    for (const [code] of arts) {
      const f = _S.articleFamille?.[code]; if (f) fams.add(f);
    }
    const arr = [...fams].sort();
    for (let i = 0; i < arr.length; i++) {
      for (let j = i + 1; j < arr.length; j++) {
        const key = `${arr[i]}|${arr[j]}`;
        famPairs.set(key, (famPairs.get(key) || 0) + 1);
      }
    }
  }

  const pairs = [...famPairs.entries()]
    .filter(([, c]) => c >= 3)
    .map(([key, count]) => {
      const [a, b] = key.split('|');
      return { a, b, labA: famLib(a) || a, labB: famLib(b) || b, count };
    })
    .sort((x, y) => y.count - x.count)
    .slice(0, 25);

  if (!pairs.length)
    return { title:'Cross-sell familles', html:'<p class="text-xs t-disabled p-2">Pas assez de co-achats détectés (seuil ≥3 clients).</p>' };

  const maxCount = pairs[0].count;

  const tbody = pairs.map(p => {
    const bar = Math.round(p.count / maxCount * 100);
    return `<tr class="border-b" style="border-color:rgba(255,255,255,0.04)">
      <td class="py-1 pr-2 text-xs t-primary font-medium">${p.labA}</td>
      <td class="py-1 px-1 text-xs t-disabled text-center">↔</td>
      <td class="py-1 px-2 text-xs t-primary font-medium">${p.labB}</td>
      <td class="py-1 px-2 text-xs text-right font-bold" style="color:var(--c-action)">${p.count}</td>
      <td class="py-1 pl-2" style="width:70px">
        <div style="height:4px;background:rgba(128,128,128,0.12);border-radius:2px">
          <div style="height:4px;width:${bar}%;background:var(--c-action);border-radius:2px"></div>
        </div>
      </td>
    </tr>`;
  }).join('');

  const html = `<div class="text-xs t-disabled mb-2">Familles achetées par les mêmes clients (co-achats PDV)</div>
  <table class="w-full">
    <thead><tr class="t-disabled text-[10px]">
      <th class="py-1 pr-2 text-left font-normal">Famille A</th>
      <th class="py-1 px-1"></th>
      <th class="py-1 px-2 text-left font-normal">Famille B</th>
      <th class="py-1 px-2 text-right font-normal">Nb clients</th>
      <th class="py-1 pl-2 font-normal">Force</th>
    </tr></thead>
    <tbody>${tbody}</tbody>
  </table>`;

  return {
    title: `Cross-sell familles — ${pairs.length} paires détectées`,
    html,
    footer: `Co-achats PDV · Seuil ≥3 clients · Levier pour bundling et relance ciblée`,
  };
}

// ── Sprint AS : Articles à solder ────────────────────────────
function _nlQ_ArticlesSolder() {
  if (!_S.finalData?.length)
    return { title:'Articles à solder', html:'<p class="text-xs t-disabled p-2">Chargez les données articles.</p>' };

  const SEUIL_AGE = 365;
  const rows = _S.finalData.filter(r =>
    !r.isParent && r.stockActuel > 0 && r.ageJours > SEUIL_AGE && r.W <= 1 &&
    !(r.V === 0 && r.enleveTotal > 0)
  );
  rows.sort((a, b) => (b.stockActuel * b.prixUnitaire) - (a.stockActuel * a.prixUnitaire));

  if (!rows.length)
    return { title:'Articles à solder', html:`<p class="text-xs t-disabled p-2">Aucun article dormant >1 an avec W≤1. Stock sain.</p>` };

  const totalVal = rows.reduce((s, r) => s + r.stockActuel * (r.prixUnitaire || 0), 0);
  const totalQte = rows.reduce((s, r) => s + r.stockActuel, 0);

  const tbody = rows.slice(0, 25).map(r => {
    const valStock = r.stockActuel * (r.prixUnitaire || 0);
    const ageMois = Math.round(r.ageJours / 30);
    const ageCol = r.ageJours > 730 ? 'var(--c-danger)' : r.ageJours > 540 ? 'var(--c-caution)' : 'var(--c-muted)';
    const fam = famLib(_S.articleFamille?.[r.code] || '') || '';
    return `<tr class="border-b" style="border-color:rgba(255,255,255,0.04)">
      <td class="py-1 pr-2 text-xs font-mono t-secondary">${r.code}</td>
      <td class="py-1 pr-2 text-xs t-primary" style="max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${r.libelle}</td>
      <td class="py-1 pr-1 text-xs t-disabled">${fam}</td>
      <td class="py-1 px-1 text-xs text-right t-secondary">${r.stockActuel}</td>
      <td class="py-1 px-1 text-xs text-right font-semibold" style="color:var(--c-action)">${formatEuro(valStock)}</td>
      <td class="py-1 pl-2 text-xs text-right font-bold" style="color:${ageCol}">${ageMois} mois</td>
    </tr>`;
  }).join('');

  const html = `<div class="flex gap-4 text-xs t-disabled mb-2">
    <span>${rows.length} articles · Valeur totale : <strong class="t-primary">${formatEuro(totalVal)}</strong></span>
    <span>Qté totale : <strong class="t-primary">${totalQte.toLocaleString('fr-FR')}</strong></span>
  </div>
  <table class="w-full">
    <thead><tr class="t-disabled text-[10px]">
      <th class="py-1 pr-2 text-left font-normal">Code</th>
      <th class="py-1 pr-2 text-left font-normal">Article</th>
      <th class="py-1 pr-1 text-left font-normal">Famille</th>
      <th class="py-1 px-1 text-right font-normal">Stock</th>
      <th class="py-1 px-1 text-right font-normal">Valeur</th>
      <th class="py-1 pl-2 text-right font-normal">Âge</th>
    </tr></thead>
    <tbody>${tbody}</tbody>
  </table>`;

  return {
    title: `Articles à solder — ${rows.length} refs · ${formatEuro(totalVal)} immobilisé`,
    html,
    footer: `Dormants >1 an, W≤1, stock>0 · Triés par valeur décroissante`,
  };
}

// ── Sprint AT : Répartition canaux par famille ───────────────
function _nlQ_CanauxFamille() {
  if (!_S.articleCanalCA?.size)
    return { title:'Canaux par famille', html:'<p class="text-xs t-disabled p-2">Aucune donnée multi-canal disponible. Chargez un fichier consommé multi-canal.</p>' };

  // Agréger CA par famille × canal
  const famCanal = new Map(); // fam → {MAGASIN:0, INTERNET:0, REPRESENTANT:0, DCS:0}
  const CANAUX = ['MAGASIN','INTERNET','REPRESENTANT','DCS'];
  for (const [code, canalMap] of _S.articleCanalCA) {
    const fam = _S.articleFamille?.[code]; if (!fam) continue;
    if (!famCanal.has(fam)) famCanal.set(fam, {MAGASIN:0,INTERNET:0,REPRESENTANT:0,DCS:0});
    const d = famCanal.get(fam);
    for (const [canal, v] of canalMap) {
      if (d[canal] !== undefined) d[canal] += (v.ca || 0);
    }
  }

  const rows = [];
  for (const [rawFam, cMap] of famCanal) {
    const total = CANAUX.reduce((s, c) => s + (cMap[c] || 0), 0);
    if (total < 500) continue;
    const dominant = CANAUX.reduce((best, c) => (cMap[c] || 0) > (cMap[best] || 0) ? c : best, 'MAGASIN');
    rows.push({ rawFam, fam: famLib(rawFam) || rawFam, total, dominant, ...cMap });
  }
  rows.sort((a, b) => b.total - a.total);

  if (!rows.length)
    return { title:'Canaux par famille', html:'<p class="text-xs t-disabled p-2">Pas assez de données (seuil CA >500€ par famille).</p>' };

  const CANAL_COLOR = { MAGASIN:'#3b82f6', INTERNET:'#10b981', REPRESENTANT:'#f59e0b', DCS:'#8b5cf6' };
  const CANAL_ICON  = { MAGASIN:'🏪', INTERNET:'🌐', REPRESENTANT:'🤝', DCS:'📦' };

  function canalBar(row) {
    return CANAUX.map(c => {
      const pct = row.total > 0 ? Math.round((row[c] || 0) / row.total * 100) : 0;
      if (pct === 0) return '';
      return `<div title="${c}: ${pct}%" style="height:5px;width:${pct}%;background:${CANAL_COLOR[c]};display:inline-block"></div>`;
    }).join('');
  }

  const tbody = rows.slice(0, 25).map(row => {
    const domPct = row.total > 0 ? Math.round((row[row.dominant] || 0) / row.total * 100) : 0;
    return `<tr class="border-b" style="border-color:rgba(255,255,255,0.04)">
      <td class="py-1 pr-2 text-xs t-primary font-medium">${row.fam}</td>
      <td class="py-1 px-1 text-xs text-right font-semibold" style="color:var(--c-action)">${formatEuro(row.total)}</td>
      <td class="py-1 px-1 text-xs text-center">${CANAL_ICON[row.dominant]} <span class="t-disabled">${domPct}%</span></td>
      <td class="py-1 pl-2" style="width:100px"><div style="border-radius:2px;overflow:hidden;display:flex">${canalBar(row)}</div></td>
    </tr>`;
  }).join('');

  const legendHtml = CANAUX.map(c => `<span style="display:inline-flex;align-items:center;gap:3px"><span style="display:inline-block;width:8px;height:8px;border-radius:1px;background:${CANAL_COLOR[c]}"></span><span class="text-[9px] t-disabled">${c}</span></span>`).join('  ');

  const html = `<div class="flex gap-3 mb-2 flex-wrap">${legendHtml}</div>
  <table class="w-full">
    <thead><tr class="t-disabled text-[10px]">
      <th class="py-1 pr-2 text-left font-normal">Famille</th>
      <th class="py-1 px-1 text-right font-normal">CA total</th>
      <th class="py-1 px-1 text-center font-normal">Canal dominant</th>
      <th class="py-1 pl-2 text-left font-normal">Répartition</th>
    </tr></thead>
    <tbody>${tbody}</tbody>
  </table>`;

  return {
    title: `Canaux par famille — ${rows.length} familles analysées`,
    html,
    footer: `CA multicanal · Seuil >500€ par famille · Triées par CA total`,
  };
}

// ── Sprint AU : Briefing du jour ─────────────────────────────
function _nlQ_BriefingJour() {
  if (!_S.finalData?.length)
    return { title:'Briefing du jour', html:'<p class="text-xs t-disabled p-2">Chargez les données articles pour générer le briefing.</p>' };

  const items = [];

  // ── 1. Ruptures critiques (W≥4, stock=0) ──
  const rupCrit = _S.finalData.filter(r =>
    !r.isParent && r.stockActuel <= 0 && r.W >= 4 && !(r.V === 0 && r.enleveTotal > 0)
  );
  if (rupCrit.length > 0) {
    items.push({
      icon: '🔴', priority: 1,
      title: `${rupCrit.length} rupture${rupCrit.length > 1 ? 's' : ''} critiques (W≥4)`,
      detail: rupCrit.slice(0, 3).map(r => r.libelle).join(', ') + (rupCrit.length > 3 ? '…' : ''),
      action: 'Passer commandes urgentes',
      color: 'var(--c-danger)',
    });
  }

  // ── 2. Alerte saisonnière mois prochain ──
  if (_S.seasonalIndex) {
    const nextM = (new Date().getMonth() + 1) % 12;
    const alerted = Object.entries(_S.seasonalIndex)
      .filter(([, v]) => (v[nextM] || 1) > 1.15).length;
    if (alerted > 0) {
      items.push({
        icon: '🌡️', priority: 2,
        title: `${alerted} famille${alerted > 1 ? 's' : ''} en pic saisonnier le mois prochain`,
        detail: 'Anticiper les approvisionnements avant la hausse',
        action: 'Vérifier les stocks saisonniers',
        color: 'var(--c-caution)',
      });
    }
  }

  // ── 3. Clients à relancer (silencieux >60j, CA>1k) ──
  if (_S.clientLastOrder?.size) {
    const nowTs = Date.now();
    let relanceCount = 0;
    for (const [cc, dt] of _S.clientLastOrder) {
      const silence = (nowTs - (dt instanceof Date ? dt.getTime() : dt)) / 86400000;
      if (silence < 60) continue;
      let ca = 0;
      const arts = _S.ventesClientArticle?.get(cc);
      if (arts) for (const [, v] of arts) ca += (v.sumCA || 0);
      if (ca >= 1000) relanceCount++;
    }
    if (relanceCount > 0) {
      items.push({
        icon: '📞', priority: 3,
        title: `${relanceCount} client${relanceCount > 1 ? 's' : ''} à relancer (>60j, CA>1k€)`,
        detail: 'Clients actifs silencieux depuis plus de 2 mois',
        action: 'Contacter en priorité',
        color: 'var(--c-action)',
      });
    }
  }

  // ── 4. Sous MIN ERP ──
  const sousMin = _S.finalData.filter(r =>
    !r.isParent && r.ancienMin > 0 && r.stockActuel > 0 && r.stockActuel < r.ancienMin &&
    r.W >= 3 && !(r.V === 0 && r.enleveTotal > 0)
  ).length;
  if (sousMin > 0) {
    items.push({
      icon: '⚠️', priority: 4,
      title: `${sousMin} article${sousMin > 1 ? 's' : ''} sous MIN ERP (W≥3)`,
      detail: 'Stock positif mais en dessous du seuil minimum',
      action: 'Préparer les ordres de réassort',
      color: 'var(--c-caution)',
    });
  }

  // ── 5. Incohérences ERP ──
  const incoher = _S.finalData.filter(r =>
    !r.isParent && !(r.V === 0 && r.enleveTotal > 0) && (
      (r.ancienMin > 0 && r.ancienMax > 0 && r.ancienMin > r.ancienMax) ||
      (r.isNouveaute && r.W >= 2 && r.ancienMin === 0 && r.ancienMax === 0)
    )
  ).length;
  if (incoher > 0) {
    items.push({
      icon: '🔧', priority: 5,
      title: `${incoher} incohérence${incoher > 1 ? 's' : ''} ERP à corriger`,
      detail: 'MIN>MAX ou nouveautés sans calibrage',
      action: 'Corriger dans le système ERP',
      color: 'rgba(128,128,128,0.7)',
    });
  }

  if (!items.length) {
    items.push({
      icon: '✅', priority: 99,
      title: 'Tout est nominal',
      detail: 'Aucune alerte critique détectée',
      action: 'Bonne journée !',
      color: 'var(--c-ok)',
    });
  }

  const now = new Date();
  const dateStr = now.toLocaleDateString('fr-FR', { weekday:'long', day:'2-digit', month:'long' });

  const rows = items.map(it => `<div style="display:flex;align-items:flex-start;gap:10px;padding:8px 0;border-bottom:1px solid rgba(255,255,255,0.05)">
    <span style="font-size:1.2rem;line-height:1;flex-shrink:0">${it.icon}</span>
    <div style="flex:1;min-width:0">
      <p style="font-size:0.75rem;font-weight:700;color:${it.color};margin:0 0 2px">${it.title}</p>
      <p style="font-size:0.65rem;color:var(--c-muted);margin:0 0 2px">${it.detail}</p>
      <p style="font-size:0.65rem;font-weight:600;color:var(--c-action);margin:0">→ ${it.action}</p>
    </div>
    <span style="font-size:0.6rem;font-weight:700;color:var(--c-muted);flex-shrink:0">#${it.priority}</span>
  </div>`).join('');

  const html = `<p style="font-size:0.65rem;color:var(--c-muted);margin:0 0 8px;text-transform:capitalize">${dateStr} · ${_S.selectedMyStore || 'Agence'}</p>
  ${rows}`;

  return {
    title: `Briefing du jour — ${items.length} point${items.length > 1 ? 's' : ''}`,
    html,
    footer: `Synthèse automatique · Triée par priorité · Rafraîchir pour mise à jour`,
  };
}

// ── Sprint AV : Fiche article rapide ─────────────────────────
function _nlQ_FicheArticle(raw) {
  // Extraire code 6 chiffres ou libellé
  const codeMatch = raw.match(/\b(\d{6})\b/);
  let art = null;

  if (codeMatch) {
    art = _S.finalData?.find(r => r.code === codeMatch[1]);
  }
  if (!art && _S.finalData?.length) {
    // Recherche par libellé (mots clés dans la requête, hors stopwords)
    const stopwords = /^(fiche|article|detail|info|synthese|resume|sur|le|la|les|un|une|des|de|du|ce|pour)$/;
    const words = raw.split(/\s+/).filter(w => w.length >= 4 && !stopwords.test(w));
    if (words.length > 0) {
      art = _S.finalData.find(r =>
        words.every(w => r.libelle?.toLowerCase().includes(w) || r.code?.includes(w))
      );
    }
  }

  if (!art)
    return { title:'Fiche article', html:'<p class="text-xs t-disabled p-2">Article non trouvé. Tapez un code à 6 chiffres ou des mots-clés du libellé.</p>' };

  const fam = famLib(_S.articleFamille?.[art.code] || '') || '—';
  const caPDV = (() => {
    let ca = 0;
    const arts = _S.articleClients?.has(art.code) ? _S.ventesClientArticle : null;
    if (_S.ventesClientArticle) {
      for (const [, clientArts] of _S.ventesClientArticle) {
        const v = clientArts.get(art.code);
        if (v) ca += (v.sumCA || 0);
      }
    }
    return ca;
  })();
  const nbCliPDV = _S.articleClients?.get(art.code)?.size || 0;
  const canalData = _S.articleCanalCA?.get(art.code);

  const score = calcPriorityScore(art.W, art.prixUnitaire, art.ageJours);
  const abcFmr = `${art.abcClass || '?'}/${art.fmrClass || '?'}`;

  const infoRows = [
    ['Code', art.code],
    ['Libellé', art.libelle],
    ['Famille', fam],
    ['ABC/FMR', abcFmr],
    ['W (fréquence annuelle)', art.W?.toString()],
    ['Stock actuel', art.stockActuel?.toLocaleString('fr-FR')],
    ['MIN ERP', art.ancienMin?.toString()],
    ['MAX ERP', art.ancienMax?.toString()],
    ['MIN calculé', art.nouveauMin?.toString()],
    ['MAX calculé', art.nouveauMax?.toString()],
    ['Prix unitaire', art.prixUnitaire ? formatEuro(art.prixUnitaire) : '—'],
    ['Âge (jours)', art.ageJours?.toString()],
    ['CA PDV', formatEuro(caPDV)],
    ['Clients PDV', nbCliPDV.toString()],
    ['Score priorité', Math.round(score).toString()],
  ].filter(([, v]) => v && v !== 'undefined').map(([k, v]) => `<tr class="border-b" style="border-color:rgba(255,255,255,0.04)">
    <td class="py-1 pr-3 text-xs t-disabled">${k}</td>
    <td class="py-1 text-xs t-primary font-medium">${v}</td>
  </tr>`).join('');

  // Canal breakdown
  let canalHtml = '';
  if (canalData?.size > 0) {
    const canalRows = [...canalData.entries()].map(([c, v]) =>
      `<span class="text-[10px] t-disabled">${c} : <strong class="t-primary">${formatEuro(v.ca || 0)}</strong></span>`
    ).join('  ·  ');
    canalHtml = `<div class="mt-2 text-[10px] t-disabled">Canaux : ${canalRows}</div>`;
  }

  const html = `<table class="w-full"><tbody>${infoRows}</tbody></table>${canalHtml}
    <div class="mt-2 flex gap-2">
      <button onclick="openDiagnostic('${_S.articleFamille?.[art.code] || ''}','nl')" class="text-[9px] px-2 py-1 rounded s-card border b-light t-disabled hover:t-primary transition-colors">📊 Diagnostic famille</button>
    </div>`;

  return {
    title: `Fiche article — ${art.code} · ${art.libelle?.substring(0, 40)}`,
    html,
    footer: `Données en temps réel · ${art.isNouveaute ? '🆕 Nouveauté' : ''} ${art.isParent ? '📦 Référence parent' : ''}`.trim(),
  };
}

// ── Sprint AW : Clients potentiels par famille ───────────────
function _nlQ_PotentielFamille(raw) {
  if (!_S.ventesClientArticle?.size || !_S.chalandiseData?.size)
    return { title:'Potentiel famille', html:'<p class="text-xs t-disabled p-2">Chargez les données clients et chalandise.</p>' };

  // Extraire une famille cible de la requête
  let targetFam = null;
  const famNames = [...new Set(Object.values(_S.articleFamille || {}))]
    .filter(f => f && f.length >= 3);
  for (const f of famNames) {
    const lib = (famLib(f) || f).toLowerCase();
    if (raw.includes(lib.toLowerCase()) || raw.includes(f.toLowerCase())) {
      targetFam = f; break;
    }
  }

  // Si aucune famille trouvée : montrer les top familles avec le plus grand potentiel
  if (!targetFam) {
    // Trouver la famille avec le plus de clients métier qui n'achètent pas
    const famAcheteurs = new Map();
    for (const [cc, arts] of _S.ventesClientArticle) {
      for (const [code] of arts) {
        const f = _S.articleFamille?.[code]; if (!f) continue;
        if (!famAcheteurs.has(f)) famAcheteurs.set(f, new Set());
        famAcheteurs.get(f).add(cc);
      }
    }
    const totalClients = _S.chalandiseData.size;
    const famPotentiel = [...famAcheteurs.entries()]
      .map(([f, buyers]) => ({
        f, labF: famLib(f) || f,
        nAcheteurs: buyers.size,
        nPotentiel: totalClients - buyers.size,
        ratio: Math.round((totalClients - buyers.size) / totalClients * 100),
      }))
      .filter(r => r.nPotentiel > 0 && r.nAcheteurs >= 3)
      .sort((a, b) => b.nPotentiel - a.nPotentiel)
      .slice(0, 15);

    if (!famPotentiel.length)
      return { title:'Potentiel famille', html:'<p class="text-xs t-disabled p-2">Aucune donnée suffisante.</p>' };

    const tbody = famPotentiel.map(r => `<tr class="border-b" style="border-color:rgba(255,255,255,0.04)">
      <td class="py-1 pr-2 text-xs t-primary font-medium">${r.labF}</td>
      <td class="py-1 px-2 text-xs text-right font-bold" style="color:var(--c-action)">${r.nPotentiel}</td>
      <td class="py-1 px-2 text-xs text-right t-secondary">${r.nAcheteurs}</td>
      <td class="py-1 pl-2" style="width:70px">
        <div style="height:4px;background:rgba(128,128,128,0.12);border-radius:2px">
          <div style="height:4px;width:${r.ratio}%;background:var(--c-action);border-radius:2px"></div>
        </div>
        <span class="text-[9px] t-disabled">${r.ratio}% non-acheteurs</span>
      </td>
    </tr>`).join('');

    return {
      title: `Potentiel famille — top ${famPotentiel.length} familles non couvertes`,
      html: `<div class="text-xs t-disabled mb-2">Précisez une famille dans la requête pour voir les clients ciblés.</div>
      <table class="w-full">
        <thead><tr class="t-disabled text-[10px]">
          <th class="py-1 pr-2 text-left font-normal">Famille</th>
          <th class="py-1 px-2 text-right font-normal">Clients potentiels</th>
          <th class="py-1 px-2 text-right font-normal">Acheteurs actuels</th>
          <th class="py-1 pl-2 font-normal">Taux non-couverture</th>
        </tr></thead>
        <tbody>${tbody}</tbody>
      </table>`,
      footer: `Clients chalandise n'ayant jamais acheté cette famille en PDV`,
    };
  }

  // Famille ciblée : lister les clients qui n'achètent pas cette famille
  const acheteurs = new Set();
  for (const [cc, arts] of _S.ventesClientArticle) {
    for (const [code] of arts) {
      if (_S.articleFamille?.[code] === targetFam) { acheteurs.add(cc); break; }
    }
  }

  const potentiels = [];
  for (const [cc, info] of _S.chalandiseData) {
    if (acheteurs.has(cc)) continue;
    let caPDV = 0;
    const arts = _S.ventesClientArticle?.get(cc);
    if (arts) for (const [, v] of arts) caPDV += (v.sumCA || 0);
    if (caPDV < 200) continue; // filtre bruit
    potentiels.push({ cc, nom: info.nom || cc, metier: info.metier || '', commercial: info.commercial || '', caPDV });
  }
  potentiels.sort((a, b) => b.caPDV - a.caPDV);

  if (!potentiels.length)
    return { title:`Potentiel ${famLib(targetFam) || targetFam}`, html:`<p class="text-xs t-disabled p-2">Tous les clients actifs (CA PDV >200€) achètent déjà la famille ${famLib(targetFam) || targetFam}.</p>` };

  const tbody = potentiels.slice(0, 20).map(r => `<tr class="border-b" style="border-color:rgba(255,255,255,0.04)">
    <td class="py-1 pr-2 text-xs t-primary font-medium">${r.nom}</td>
    <td class="py-1 pr-2 text-xs t-disabled">${r.metier}</td>
    <td class="py-1 pr-2 text-xs t-disabled">${r.commercial}</td>
    <td class="py-1 pl-2 text-xs text-right font-semibold" style="color:var(--c-action)">${formatEuro(r.caPDV)}</td>
  </tr>`).join('');

  const labF = famLib(targetFam) || targetFam;
  return {
    title: `Potentiel ${labF} — ${potentiels.length} clients à convertir`,
    html: `<div class="text-xs t-disabled mb-2">Clients actifs (CA PDV >200€) n'ayant jamais acheté la famille <strong class="t-primary">${labF}</strong></div>
    <table class="w-full">
      <thead><tr class="t-disabled text-[10px]">
        <th class="py-1 pr-2 text-left font-normal">Client</th>
        <th class="py-1 pr-2 text-left font-normal">Métier</th>
        <th class="py-1 pr-2 text-left font-normal">Commercial</th>
        <th class="py-1 pl-2 text-right font-normal">CA PDV total</th>
      </tr></thead>
      <tbody>${tbody}</tbody>
    </table>`,
    footer: `Triés par CA PDV total · Opportunité de développement commercial`,
  };
}

// ── Sprint AX : Profil commercial nommé ──────────────────────
function _nlQ_ProfilCommercial(commercial) {
  if (!_S.clientsByCommercial?.has(commercial))
    return { title:`Profil ${commercial}`, html:`<p class="text-xs t-disabled p-2">Commercial "${commercial}" introuvable dans les données.</p>` };

  const clients = [...(_S.clientsByCommercial.get(commercial) || [])];
  const nowTs = Date.now();
  const SILENCE = 90 * 86400000;

  let caPDV = 0, caHors = 0, nbActifs = 0, nbSilencieux = 0, nbBL = 0;
  const metierMap = new Map();

  for (const cc of clients) {
    // CA PDV
    let ccCAPDV = 0, ccBL = 0;
    const arts = _S.ventesClientArticle?.get(cc);
    if (arts) for (const [, v] of arts) { ccCAPDV += (v.sumCA || 0); ccBL += (v.countBL || 0); }
    caPDV += ccCAPDV; nbBL += ccBL;

    // CA hors
    const artsH = _S.ventesClientHorsMagasin?.get(cc);
    if (artsH) for (const [, v] of artsH) caHors += (v.sumCA || 0);

    // Silence
    const lastDt = _S.clientLastOrder?.get(cc);
    if (lastDt) {
      const age = nowTs - (lastDt instanceof Date ? lastDt.getTime() : lastDt);
      if (age < SILENCE) nbActifs++; else nbSilencieux++;
    }

    // Métiers
    const info = _S.chalandiseData?.get(cc);
    const m = info?.metier || 'Non renseigné';
    metierMap.set(m, (metierMap.get(m) || 0) + 1);
  }

  const top3Metiers = [...metierMap.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
  const captation = (caPDV + caHors) > 0 ? Math.round(caPDV / (caPDV + caHors) * 100) : null;
  const vmcMoyen = nbBL > 0 ? caPDV / nbBL : 0;

  function kpi(label, val, sub = '') {
    return `<div style="flex:1;min-width:0;padding:8px;border-radius:8px;background:rgba(128,128,128,0.06);outline:1px solid rgba(128,128,128,0.1)">
      <p style="font-size:0.6rem;color:var(--c-muted);margin:0 0 2px;text-transform:uppercase;letter-spacing:.04em">${label}</p>
      <p style="font-size:0.95rem;font-weight:900;color:var(--c-action);margin:0">${val}</p>
      ${sub ? `<p style="font-size:0.6rem;color:var(--c-muted);margin:2px 0 0;opacity:.7">${sub}</p>` : ''}
    </div>`;
  }

  const metierHtml = top3Metiers.map(([m, n]) =>
    `<span class="text-[10px] t-disabled">${m} <strong class="t-primary">${n}</strong></span>`
  ).join('  ·  ');

  const html = `<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px">
    ${kpi('Clients', clients.length.toString())}
    ${kpi('CA PDV', formatEuro(caPDV), `${nbBL} BL · VMC ${formatEuro(vmcMoyen)}`)}
    ${kpi('CA fuyant', caHors > 0 ? formatEuro(caHors) : '—', captation !== null ? `Captation ${captation}%` : '')}
    ${kpi('Actifs <90j', nbActifs.toString(), `${nbSilencieux} silencieux`)}
  </div>
  <div class="text-xs t-disabled mt-1">Top métiers : ${metierHtml}</div>`;

  return {
    title: `Profil commercial — ${commercial} · ${clients.length} clients`,
    html,
    footer: `Source : chalandise × consommé PDV · Silence défini à 90 jours`,
  };
}

// ── Sprint AY : Couverture stock en jours par famille ─────────
function _nlQ_CouvertureJours() {
  if (!_S.finalData?.length)
    return { title:'Couverture stock', html:'<p class="text-xs t-disabled p-2">Chargez les données articles.</p>' };

  const jours = _S.globalJoursOuvres > 0 ? _S.globalJoursOuvres : 250;
  const famData = new Map(); // fam → {stockTotal, enlTotal, nArts, nRup}

  for (const r of _S.finalData) {
    if (r.isParent || (r.V === 0 && r.enleveTotal > 0) || r.W < 1) continue;
    const fam = _S.articleFamille?.[r.code]; if (!fam) continue;
    if (!famData.has(fam)) famData.set(fam, { stockTotal: 0, enlTotal: 0, nArts: 0, nRup: 0, valStock: 0 });
    const d = famData.get(fam);
    d.stockTotal += r.stockActuel;
    d.enlTotal   += r.enleveTotal || 0;
    d.nArts++;
    if (r.stockActuel <= 0) d.nRup++;
    d.valStock   += r.stockActuel * (r.prixUnitaire || 0);
  }

  const rows = [];
  for (const [rawFam, d] of famData) {
    if (d.nArts < 2) continue;
    const vmjFam = d.enlTotal / jours;
    const couverture = vmjFam > 0 ? Math.round(d.stockTotal / vmjFam) : null;
    rows.push({ rawFam, fam: famLib(rawFam) || rawFam, couverture, vmjFam, valStock: d.valStock, nArts: d.nArts, nRup: d.nRup, txRup: Math.round(d.nRup / d.nArts * 100) });
  }
  rows.sort((a, b) => (a.couverture ?? 9999) - (b.couverture ?? 9999));

  if (!rows.length)
    return { title:'Couverture stock', html:'<p class="text-xs t-disabled p-2">Aucune donnée de couverture calculable.</p>' };

  function covColor(j) {
    if (j === null) return 'var(--c-muted)';
    if (j < 15)    return 'var(--c-danger)';
    if (j < 30)    return 'var(--c-caution)';
    return 'var(--c-ok)';
  }

  const tbody = rows.slice(0, 25).map(r => {
    const c = covColor(r.couverture);
    const covDisplay = r.couverture !== null ? `${r.couverture}j` : '∞';
    const bar = r.couverture !== null ? Math.min(100, Math.round(r.couverture / 90 * 100)) : 100;
    return `<tr class="border-b" style="border-color:rgba(255,255,255,0.04)">
      <td class="py-1 pr-2 text-xs t-primary font-medium">${r.fam}</td>
      <td class="py-1 px-1 text-xs text-right font-bold" style="color:${c}">${covDisplay}</td>
      <td class="py-1 px-2" style="width:70px">
        <div style="height:4px;background:rgba(128,128,128,0.12);border-radius:2px">
          <div style="height:4px;width:${bar}%;background:${c};border-radius:2px"></div>
        </div>
      </td>
      <td class="py-1 px-1 text-xs text-right t-secondary">${formatEuro(r.valStock)}</td>
      <td class="py-1 pl-2 text-xs text-right t-disabled">${r.txRup}% rupt.</td>
    </tr>`;
  }).join('');

  const critique = rows.filter(r => r.couverture !== null && r.couverture < 15).length;

  const html = `<div class="text-xs t-disabled mb-2">Jours de stock restant au rythme actuel (VMJ = enlevé ÷ ${jours}j ouvrés)</div>
  <table class="w-full">
    <thead><tr class="t-disabled text-[10px]">
      <th class="py-1 pr-2 text-left font-normal">Famille</th>
      <th class="py-1 px-1 text-right font-normal">Couverture</th>
      <th class="py-1 px-2 font-normal">Niveau</th>
      <th class="py-1 px-1 text-right font-normal">Val. stock</th>
      <th class="py-1 pl-2 text-right font-normal">Taux rupt.</th>
    </tr></thead>
    <tbody>${tbody}</tbody>
  </table>`;

  return {
    title: `Couverture stock par famille — ${critique} famille${critique > 1 ? 's' : ''} critique${critique > 1 ? 's' : ''} (<15j)`,
    html,
    footer: `Triées par couverture croissante · 🔴 <15j · 🟠 <30j · 🟢 ≥30j`,
  };
}

// ── Sprint AZ : Clients gagnés vs perdus ─────────────────────
function _nlQ_ClientsGagnesPerdus() {
  if (!_S.clientLastOrder?.size)
    return { title:'Gagnés vs perdus', html:'<p class="text-xs t-disabled p-2">Chargez les données clients.</p>' };

  const nowTs = Date.now();
  const NOUVEAU = 90  * 86400000; // < 90j = nouveau/gagné
  const PERDU   = 180 * 86400000; // > 180j = perdu

  const gagnes = [], perdus = [], actifs = [];

  for (const [cc, dt] of _S.clientLastOrder) {
    const age = nowTs - (dt instanceof Date ? dt.getTime() : dt);
    let caPDV = 0;
    const arts = _S.ventesClientArticle?.get(cc);
    if (arts) for (const [, v] of arts) caPDV += (v.sumCA || 0);
    if (caPDV < 100) continue; // filtrer bruit

    const info = _S.chalandiseData?.get(cc);
    const nom = info?.nom || _S.clientNomLookup?.[cc] || cc;
    const metier = info?.metier || '';
    const row = { cc, nom, metier, caPDV, ageDays: Math.round(age / 86400000) };

    if (age < NOUVEAU) gagnes.push(row);
    else if (age > PERDU) perdus.push(row);
    else actifs.push(row);
  }

  gagnes.sort((a, b) => b.caPDV - a.caPDV);
  perdus.sort((a, b) => b.caPDV - a.caPDV);

  const caGagnes = gagnes.reduce((s, r) => s + r.caPDV, 0);
  const caPerdus = perdus.reduce((s, r) => s + r.caPDV, 0);
  const solde = caGagnes - caPerdus;
  const soldeColor = solde >= 0 ? 'var(--c-ok)' : 'var(--c-danger)';

  function miniTable(list, colorFn) {
    if (!list.length) return '<p class="text-xs t-disabled">Aucun</p>';
    return list.slice(0, 8).map(r => `<div style="display:flex;justify-content:space-between;align-items:center;padding:3px 0;border-bottom:1px solid rgba(255,255,255,0.04)">
      <span class="text-xs t-primary" style="max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${r.nom}</span>
      <span class="text-[10px] t-disabled">${r.metier}</span>
      <span class="text-xs font-semibold" style="color:${colorFn(r)}">${formatEuro(r.caPDV)}</span>
    </div>`).join('');
  }

  const html = `<div style="display:flex;gap:6px;margin-bottom:10px">
    <div style="flex:1;padding:8px;border-radius:8px;background:rgba(22,163,74,0.08);outline:1px solid rgba(22,163,74,0.2)">
      <p style="font-size:0.6rem;color:var(--c-ok);margin:0 0 2px;text-transform:uppercase">Gagnés <90j</p>
      <p style="font-size:1rem;font-weight:900;color:var(--c-ok);margin:0">${gagnes.length} clients</p>
      <p style="font-size:0.65rem;color:var(--c-muted);margin:2px 0 0">${formatEuro(caGagnes)}</p>
    </div>
    <div style="flex:1;padding:8px;border-radius:8px;background:rgba(220,38,38,0.08);outline:1px solid rgba(220,38,38,0.2)">
      <p style="font-size:0.6rem;color:var(--c-danger);margin:0 0 2px;text-transform:uppercase">Perdus >180j</p>
      <p style="font-size:1rem;font-weight:900;color:var(--c-danger);margin:0">${perdus.length} clients</p>
      <p style="font-size:0.65rem;color:var(--c-muted);margin:2px 0 0">${formatEuro(caPerdus)}</p>
    </div>
    <div style="flex:1;padding:8px;border-radius:8px;background:rgba(128,128,128,0.06);outline:1px solid rgba(128,128,128,0.1)">
      <p style="font-size:0.6rem;color:var(--c-muted);margin:0 0 2px;text-transform:uppercase">Solde CA</p>
      <p style="font-size:1rem;font-weight:900;margin:0;color:${soldeColor}">${solde >= 0 ? '+' : ''}${formatEuro(solde)}</p>
      <p style="font-size:0.65rem;color:var(--c-muted);margin:2px 0 0">${actifs.length} clients stables</p>
    </div>
  </div>
  <div class="grid grid-cols-2 gap-3">
    <div>
      <p class="text-xs font-semibold mb-1" style="color:var(--c-ok)">▲ Nouveaux clients</p>
      ${miniTable(gagnes, () => 'var(--c-ok)')}
    </div>
    <div>
      <p class="text-xs font-semibold mb-1" style="color:var(--c-danger)">▼ Clients perdus</p>
      ${miniTable(perdus, () => 'var(--c-danger)')}
    </div>
  </div>`;

  return {
    title: `Clients gagnés vs perdus — solde ${solde >= 0 ? '+' : ''}${formatEuro(solde)}`,
    html,
    footer: `Gagné = 1er achat <90j · Perdu = silence >180j · Filtre CA >100€`,
  };
}

// ── Sprint BA : Profil achat d'un client ─────────────────────
function _nlQ_ProfilClient(raw) {
  if (!_S.ventesClientArticle?.size)
    return { title:'Profil client', html:'<p class="text-xs t-disabled p-2">Chargez les données clients.</p>' };

  // Recherche client par nom (3+ tokens dans la requête) ou code
  let targetCC = null, targetNom = '';
  const stopwords = new Set(['profil','client','achats','articles','fiche','resume','bilan','detail','de','du','le','la','les','un','une','pour']);
  const words = raw.split(/\s+/).filter(w => w.length >= 3 && !stopwords.has(w));

  // Chercher dans clientNomLookup
  if (words.length > 0 && _S.clientNomLookup) {
    let bestScore = 0;
    for (const [cc, nom] of Object.entries(_S.clientNomLookup)) {
      const nomN = _nlNorm(nom);
      const score = words.filter(w => nomN.includes(w)).length;
      if (score > bestScore) { bestScore = score; targetCC = cc; targetNom = nom; }
    }
    if (bestScore === 0) targetCC = null;
  }
  // Fallback : chercher dans chalandiseData
  if (!targetCC && _S.chalandiseData?.size && words.length > 0) {
    let bestScore = 0;
    for (const [cc, info] of _S.chalandiseData) {
      if (!info.nom) continue;
      const nomN = _nlNorm(info.nom);
      const score = words.filter(w => nomN.includes(w)).length;
      if (score > bestScore) { bestScore = score; targetCC = cc; targetNom = info.nom; }
    }
    if (bestScore === 0) targetCC = null;
  }

  if (!targetCC)
    return { title:'Profil client', html:'<p class="text-xs t-disabled p-2">Client non trouvé. Tapez le nom du client (ex : "profil client dupont plomberie").</p>' };

  const info = _S.chalandiseData?.get(targetCC) || {};
  const arts = _S.ventesClientArticle?.get(targetCC) || new Map();
  const artsH = _S.ventesClientHorsMagasin?.get(targetCC) || new Map();

  let caPDV = 0, nbBL = 0, nbArts = arts.size;
  for (const [, v] of arts) { caPDV += (v.sumCA || 0); nbBL += (v.countBL || 0); }
  let caHors = 0;
  for (const [, v] of artsH) caHors += (v.sumCA || 0);

  const lastDt = _S.clientLastOrder?.get(targetCC);
  const silence = lastDt ? Math.round((Date.now() - (lastDt instanceof Date ? lastDt.getTime() : lastDt)) / 86400000) : null;

  // Top 5 articles PDV
  const topArts = [...arts.entries()]
    .map(([code, v]) => ({ code, lib: _S.libelleLookup?.[code] || code, ca: v.sumCA || 0 }))
    .sort((a, b) => b.ca - a.ca).slice(0, 5);

  // Top familles
  const famCA = new Map();
  for (const [code, v] of arts) {
    const f = _S.articleFamille?.[code]; if (!f) continue;
    famCA.set(f, (famCA.get(f) || 0) + (v.sumCA || 0));
  }
  const topFams = [...famCA.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);

  const silenceHtml = silence !== null
    ? `<span class="text-[10px] px-1.5 py-0.5 rounded ml-1" style="background:${silence > 90 ? 'rgba(220,38,38,0.15)' : 'rgba(22,163,74,0.12)'};color:${silence > 90 ? 'var(--c-danger)' : 'var(--c-ok)'}">${silence}j</span>`
    : '';

  const artsHtml = topArts.map(a => `<div style="display:flex;justify-content:space-between;padding:2px 0">
    <span class="text-xs t-secondary" style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${a.lib}</span>
    <span class="text-xs font-semibold" style="color:var(--c-action)">${formatEuro(a.ca)}</span>
  </div>`).join('');

  const famsHtml = topFams.map(([f, ca]) => `<span class="text-[10px] t-disabled">${famLib(f) || f} <strong class="t-primary">${formatEuro(ca)}</strong></span>`).join('  ·  ');

  const html = `<div style="display:flex;align-items:baseline;gap:8px;margin-bottom:8px">
    <span class="text-sm font-bold t-primary">${targetNom || targetCC}</span>
    <span class="text-xs t-disabled">${info.metier || ''}</span>
    <span class="text-xs t-disabled">${info.commercial || ''}</span>
    ${silenceHtml}
  </div>
  <div style="display:flex;gap:6px;margin-bottom:8px">
    <div style="flex:1;padding:6px 8px;border-radius:6px;background:rgba(128,128,128,0.06)">
      <p class="text-[9px] t-disabled mb-0.5">CA PDV</p>
      <p class="text-sm font-bold" style="color:var(--c-action)">${formatEuro(caPDV)}</p>
      <p class="text-[9px] t-disabled">${nbBL} BL · ${nbArts} articles</p>
    </div>
    <div style="flex:1;padding:6px 8px;border-radius:6px;background:rgba(128,128,128,0.06)">
      <p class="text-[9px] t-disabled mb-0.5">CA hors PDV</p>
      <p class="text-sm font-bold" style="color:${caHors > 0 ? 'var(--c-caution)' : 'var(--c-ok)'}">${caHors > 0 ? formatEuro(caHors) : '—'}</p>
      <p class="text-[9px] t-disabled">${info.classification || ''}</p>
    </div>
  </div>
  <div class="mb-2"><p class="text-[10px] t-disabled mb-1">Top familles</p>${famsHtml}</div>
  <div><p class="text-[10px] t-disabled mb-1">Top 5 articles PDV</p>${artsHtml}</div>
  <div class="mt-2 flex gap-2">
    <button onclick="openClient360('${targetCC}','nl')" class="text-[9px] px-2 py-1 rounded s-card border b-light t-disabled hover:t-primary transition-colors">📋 Fiche 360°</button>
  </div>`;

  return {
    title: `Profil client — ${targetNom || targetCC}`,
    html,
    footer: `CA PDV = MAGASIN only · CA hors = autres canaux`,
  };
}

// ── Sprint BB : Familles surperformantes vs réseau ───────────
function _nlQ_FamillesSurperformantes() {
  const bench = _S.benchLists;
  if (!bench?.storePerf?.length || !_S.selectedMyStore)
    return { title:'Surperformance réseau', html:'<p class="text-xs t-disabled p-2">Données réseau requises. Chargez le fichier Territoire pour activer le benchmark.</p>' };

  const myStore = _S.selectedMyStore;

  // storePerf contient {store, fam, ratio, caStore, caMedian}
  const myPerf = bench.storePerf.filter(p => p.store === myStore);
  if (!myPerf.length)
    return { title:'Surperformance réseau', html:`<p class="text-xs t-disabled p-2">Aucune donnée de benchmark pour l'agence ${myStore}.</p>` };

  const surperf = myPerf.filter(p => p.ratio >= 1.2).sort((a, b) => b.ratio - a.ratio);
  const sousperf = myPerf.filter(p => p.ratio < 0.8).sort((a, b) => a.ratio - b.ratio);

  function perfRow(p, isGood) {
    const pct = Math.round((p.ratio - 1) * 100);
    const sign = isGood ? '+' : '';
    const c = isGood ? 'var(--c-ok)' : 'var(--c-danger)';
    const bar = Math.min(100, Math.abs(pct));
    const fam = famLib(p.fam) || p.fam;
    return `<tr class="border-b" style="border-color:rgba(255,255,255,0.04)">
      <td class="py-1 pr-2 text-xs t-primary font-medium">${fam}</td>
      <td class="py-1 px-1 text-xs text-right font-bold" style="color:${c}">${sign}${pct}%</td>
      <td class="py-1 px-1 text-xs text-right t-secondary">${formatEuro(p.caStore || 0)}</td>
      <td class="py-1 pl-2" style="width:60px">
        <div style="height:4px;background:rgba(128,128,128,0.12);border-radius:2px">
          <div style="height:4px;width:${bar}%;background:${c};border-radius:2px"></div>
        </div>
      </td>
    </tr>`;
  }

  const html = `<div class="grid grid-cols-2 gap-3">
    <div>
      <p class="text-xs font-semibold mb-1" style="color:var(--c-ok)">▲ Surperformance (${surperf.length})</p>
      ${surperf.length ? `<table class="w-full"><thead><tr class="t-disabled text-[9px]"><th class="pr-2 text-left font-normal">Famille</th><th class="px-1 text-right font-normal">vs méd.</th><th class="px-1 text-right font-normal">CA</th><th class="pl-2"></th></tr></thead><tbody>${surperf.slice(0, 8).map(p => perfRow(p, true)).join('')}</tbody></table>` : '<p class="text-xs t-disabled">Aucune surperformance ≥+20%</p>'}
    </div>
    <div>
      <p class="text-xs font-semibold mb-1" style="color:var(--c-danger)">▼ Sous-performance (${sousperf.length})</p>
      ${sousperf.length ? `<table class="w-full"><thead><tr class="t-disabled text-[9px]"><th class="pr-2 text-left font-normal">Famille</th><th class="px-1 text-right font-normal">vs méd.</th><th class="px-1 text-right font-normal">CA</th><th class="pl-2"></th></tr></thead><tbody>${sousperf.slice(0, 8).map(p => perfRow(p, false)).join('')}</tbody></table>` : '<p class="text-xs t-disabled">Aucune sous-performance ≥-20%</p>'}
    </div>
  </div>`;

  return {
    title: `Surperformance réseau — ${myStore} · ${surperf.length} familles en avance`,
    html,
    footer: `Ratio vs médiane réseau · ≥+20% = surperformance · ≤-20% = sous-performance`,
  };
}

// ── Sprint BC : Alerte stock de sécurité ─────────────────────
function _nlQ_StockSecurite() {
  if (!_S.finalData?.length)
    return { title:'Stock de sécurité', html:'<p class="text-xs t-disabled p-2">Chargez les données articles.</p>' };

  // Sécurité = stock couvrant < SECURITY_DAYS jours selon FMR
  // F→4j, M→3j, R→2j (proxy)
  const SECUDAYS = { F: 4, M: 3, R: 2 };
  const jours = _S.globalJoursOuvres > 0 ? _S.globalJoursOuvres : 250;

  const rows = [];
  for (const r of _S.finalData) {
    if (r.isParent || r.W < 2 || (r.V === 0 && r.enleveTotal > 0)) continue;
    const secu = SECUDAYS[r.fmrClass] || 3;
    const vmj = r.enleveTotal / jours;
    if (vmj <= 0) continue;
    const joursStock = r.stockActuel / vmj;
    if (joursStock >= secu * 2) continue; // bien au-dessus du seuil
    const ratio = joursStock / secu; // <1 = en dessous de la marge
    if (ratio >= 1.5) continue;
    rows.push({ r, joursStock: Math.round(joursStock * 10) / 10, secu, ratio, vmj });
  }
  rows.sort((a, b) => a.ratio - b.ratio);

  if (!rows.length)
    return { title:'Stock de sécurité', html:'<p class="text-xs t-disabled p-2">Tous les articles actifs ont une marge de sécurité suffisante (>1.5× le seuil FMR).</p>' };

  const critique = rows.filter(r => r.ratio < 0.5).length;

  const tbody = rows.slice(0, 25).map(({ r, joursStock, secu, ratio }) => {
    const c = ratio < 0.5 ? 'var(--c-danger)' : ratio < 1 ? 'var(--c-caution)' : 'var(--c-muted)';
    const fam = famLib(_S.articleFamille?.[r.code] || '') || '';
    return `<tr class="border-b" style="border-color:rgba(255,255,255,0.04)">
      <td class="py-1 pr-2 text-xs font-mono t-secondary">${r.code}</td>
      <td class="py-1 pr-2 text-xs t-primary" style="max-width:150px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${r.libelle}</td>
      <td class="py-1 px-1 text-xs text-center t-disabled">${r.fmrClass}</td>
      <td class="py-1 px-1 text-xs text-right t-secondary">${r.stockActuel}</td>
      <td class="py-1 px-1 text-xs text-right t-disabled">${joursStock}j</td>
      <td class="py-1 px-1 text-xs text-right t-disabled">${secu}j</td>
      <td class="py-1 pl-2 text-xs text-right font-bold" style="color:${c}">${Math.round(ratio * 100)}%</td>
    </tr>`;
  }).join('');

  const html = `<div class="text-xs t-disabled mb-2">Marge de sécurité = jours de couverture ÷ seuil FMR (F=4j · M=3j · R=2j)</div>
  <table class="w-full">
    <thead><tr class="t-disabled text-[10px]">
      <th class="py-1 pr-2 text-left font-normal">Code</th>
      <th class="py-1 pr-2 text-left font-normal">Article</th>
      <th class="py-1 px-1 text-center font-normal">FMR</th>
      <th class="py-1 px-1 text-right font-normal">Stock</th>
      <th class="py-1 px-1 text-right font-normal">Couv.</th>
      <th class="py-1 px-1 text-right font-normal">Seuil</th>
      <th class="py-1 pl-2 text-right font-normal">Marge</th>
    </tr></thead>
    <tbody>${tbody}</tbody>
  </table>`;

  return {
    title: `Stock de sécurité — ${rows.length} articles · ${critique} critiques (<50%)`,
    html,
    footer: `Marge <50% = critique · <100% = insuffisant · Seuil défini par classe FMR`,
  };
}

// ── Sprint BD : Pivot métiers × familles ─────────────────────
function _nlQ_PivotMetierFamille() {
  if (!_S.ventesClientArticle?.size || !_S.chalandiseData?.size)
    return { title:'Pivot métiers × familles', html:'<p class="text-xs t-disabled p-2">Chargez les données clients et chalandise.</p>' };

  // Agréger CA PDV par métier × famille
  const pivot = new Map(); // metier → Map<fam, ca>
  const allFams = new Set();

  for (const [cc, arts] of _S.ventesClientArticle) {
    const info = _S.chalandiseData?.get(cc);
    const metier = info?.metier || 'Non renseigné';
    if (!pivot.has(metier)) pivot.set(metier, new Map());
    const mMap = pivot.get(metier);
    for (const [code, v] of arts) {
      const fam = _S.articleFamille?.[code]; if (!fam) continue;
      allFams.add(fam);
      mMap.set(fam, (mMap.get(fam) || 0) + (v.sumCA || 0));
    }
  }

  if (!pivot.size)
    return { title:'Pivot métiers × familles', html:'<p class="text-xs t-disabled p-2">Aucune donnée croisable.</p>' };

  // Top familles par CA global (max 8 colonnes)
  const famTotals = new Map();
  for (const [, mMap] of pivot) for (const [f, ca] of mMap) famTotals.set(f, (famTotals.get(f) || 0) + ca);
  const topFams = [...famTotals.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([f]) => f);

  // Top métiers par CA global (max 10 lignes)
  const metierTotals = new Map();
  for (const [m, mMap] of pivot) {
    const tot = [...mMap.values()].reduce((s, v) => s + v, 0);
    metierTotals.set(m, tot);
  }
  const topMetiers = [...metierTotals.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([m]) => m);

  // Valeur max pour normalisation
  let globalMax = 0;
  for (const m of topMetiers) {
    const mMap = pivot.get(m) || new Map();
    for (const f of topFams) globalMax = Math.max(globalMax, mMap.get(f) || 0);
  }
  if (globalMax === 0) globalMax = 1;

  function heatCell(ca) {
    if (!ca) return `<td class="py-1 px-1 text-center" style="font-size:9px;color:rgba(128,128,128,0.2)">—</td>`;
    const intensity = ca / globalMax;
    const alpha = 0.1 + intensity * 0.65;
    const textColor = intensity > 0.5 ? 'rgba(255,255,255,0.9)' : 'var(--c-action)';
    const k = ca >= 1000 ? Math.round(ca / 1000) + 'k' : Math.round(ca);
    return `<td class="py-1 px-1 text-center" style="font-size:9px;font-weight:600;color:${textColor};background:rgba(59,130,246,${alpha.toFixed(2)});border-radius:3px">${k}</td>`;
  }

  const famHeaders = topFams.map(f => `<th class="py-1 px-1 text-center font-normal" style="font-size:9px;max-width:55px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${famLib(f) || f}</th>`).join('');

  const trows = topMetiers.map(m => {
    const mMap = pivot.get(m) || new Map();
    const cells = topFams.map(f => heatCell(mMap.get(f) || 0)).join('');
    const tot = metierTotals.get(m) || 0;
    return `<tr class="border-b" style="border-color:rgba(255,255,255,0.04)">
      <td class="py-1 pr-2 text-xs t-primary font-medium whitespace-nowrap" style="max-width:110px;overflow:hidden;text-overflow:ellipsis">${m}</td>
      ${cells}
      <td class="py-1 pl-2 text-xs font-semibold" style="color:var(--c-action)">${formatEuro(tot)}</td>
    </tr>`;
  }).join('');

  const html = `<div class="text-xs t-disabled mb-2">CA PDV (€) par métier × famille · Intensité = chaleur bleue</div>
  <div style="overflow-x:auto">
  <table class="w-full" style="border-collapse:separate;border-spacing:2px 0">
    <thead><tr class="t-disabled">
      <th class="py-1 pr-2 text-left font-normal text-xs">Métier</th>
      ${famHeaders}
      <th class="py-1 pl-2 text-left font-normal" style="font-size:9px">Total</th>
    </tr></thead>
    <tbody>${trows}</tbody>
  </table>
  </div>`;

  return {
    title: `Pivot métiers × familles — top ${topMetiers.length} métiers · top ${topFams.length} familles`,
    html,
    footer: `Valeurs en CA PDV MAGASIN · Intensité proportionnelle au max de la grille`,
  };
}

// ── Sprint BE : Top movers articles ──────────────────────────
function _nlQ_TopMoversArticles() {
  if (!_S.articleMonthlySales || !Object.keys(_S.articleMonthlySales).length)
    return { title:'Top movers articles', html:'<p class="text-xs t-disabled p-2">Chargez le fichier consommé pour accéder aux ventes mensuelles.</p>' };

  const curM  = new Date().getMonth();
  const prevM = (curM + 11) % 12;
  const MONTH_FR = ['Janv','Févr','Mars','Avr','Mai','Juin','Juil','Août','Sept','Oct','Nov','Déc'];

  const rows = [];
  for (const [code, months] of Object.entries(_S.articleMonthlySales)) {
    const cur = months[curM] || 0, prev = months[prevM] || 0;
    if (cur < 3 && prev < 3) continue;
    if (prev === 0 && cur === 0) continue;
    const delta = prev > 0 ? (cur - prev) / prev : (cur > 0 ? 1 : 0);
    if (Math.abs(delta) < 0.15) continue; // filtrer bruit <15%
    const lib = _S.libelleLookup?.[code] || code;
    const fam = famLib(_S.articleFamille?.[code] || '') || '';
    const r = _S.finalData?.find(a => a.code === code);
    rows.push({ code, lib, fam, cur, prev, delta, W: r?.W || 0, stock: r?.stockActuel ?? null });
  }
  rows.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));

  if (!rows.length)
    return { title:'Top movers articles', html:'<p class="text-xs t-disabled p-2">Pas de variation significative détectée (seuil ±15%).</p>' };

  const hausse = rows.filter(r => r.delta > 0).slice(0, 10);
  const baisse = rows.filter(r => r.delta < 0).slice(0, 10);

  function artRow(r) {
    const pct = (r.delta * 100).toFixed(0);
    const sign = r.delta > 0 ? '+' : '';
    const c = r.delta > 0 ? 'var(--c-ok)' : 'var(--c-danger)';
    const stockBadge = r.stock !== null && r.stock <= 0
      ? `<span style="font-size:8px;color:var(--c-danger);margin-left:3px">⚠️</span>` : '';
    return `<tr class="border-b" style="border-color:rgba(255,255,255,0.04)">
      <td class="py-1 pr-1 text-xs font-mono t-secondary" style="font-size:9px">${r.code}</td>
      <td class="py-1 pr-1 text-xs t-primary" style="max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${r.lib}${stockBadge}</td>
      <td class="py-1 px-1 text-[9px] t-disabled">${r.fam}</td>
      <td class="py-1 px-1 text-[10px] text-right t-secondary">${r.prev}→${r.cur}</td>
      <td class="py-1 pl-1 text-xs font-bold text-right" style="color:${c}">${sign}${pct}%</td>
    </tr>`;
  }

  const html = `<div class="grid grid-cols-2 gap-3">
    <div>
      <p class="text-xs font-semibold mb-1" style="color:var(--c-ok)">▲ En hausse (${hausse.length})</p>
      <table class="w-full"><thead><tr class="t-disabled" style="font-size:9px"><th class="pr-1 text-left font-normal">Code</th><th class="pr-1 text-left font-normal">Article</th><th class="px-1 text-left font-normal">Fam.</th><th class="px-1 text-right font-normal">${MONTH_FR[prevM]}→${MONTH_FR[curM]}</th><th class="pl-1 text-right font-normal">Δ%</th></tr></thead><tbody>${hausse.map(artRow).join('')}</tbody></table>
    </div>
    <div>
      <p class="text-xs font-semibold mb-1" style="color:var(--c-danger)">▼ En baisse (${baisse.length})</p>
      <table class="w-full"><thead><tr class="t-disabled" style="font-size:9px"><th class="pr-1 text-left font-normal">Code</th><th class="pr-1 text-left font-normal">Article</th><th class="px-1 text-left font-normal">Fam.</th><th class="px-1 text-right font-normal">${MONTH_FR[prevM]}→${MONTH_FR[curM]}</th><th class="pl-1 text-right font-normal">Δ%</th></tr></thead><tbody>${baisse.map(artRow).join('')}</tbody></table>
    </div>
  </div>`;

  return {
    title: `Top movers articles — ${MONTH_FR[prevM]} → ${MONTH_FR[curM]}`,
    html,
    footer: `Variation ≥±15% · ⚠️ = article en rupture · Triés par amplitude`,
  };
}

// ── Sprint BF : Répartition géo par département ───────────────
function _nlQ_RepartitionGeo() {
  if (!_S.chalandiseData?.size)
    return { title:'Répartition géographique', html:'<p class="text-xs t-disabled p-2">Chargez le fichier Zone de Chalandise pour la répartition géographique.</p>' };

  const deptMap = new Map(); // dept → {nClients, caPDV, noms: []}
  for (const [cc, info] of _S.chalandiseData) {
    const cp = info.cp || '';
    const dept = cp.length >= 2 ? cp.slice(0, 2) : '??';
    if (!deptMap.has(dept)) deptMap.set(dept, { nClients: 0, caPDV: 0 });
    const d = deptMap.get(dept);
    d.nClients++;
    // CA PDV si disponible
    const arts = _S.ventesClientArticle?.get(cc);
    if (arts) for (const [, v] of arts) d.caPDV += (v.sumCA || 0);
  }

  const rows = [...deptMap.entries()]
    .map(([dept, d]) => ({ dept, ...d }))
    .sort((a, b) => b.caPDV > 0 ? b.caPDV - a.caPDV : b.nClients - a.nClients);

  if (!rows.length)
    return { title:'Répartition géographique', html:'<p class="text-xs t-disabled p-2">Aucun code postal disponible dans la chalandise.</p>' };

  const totalClients = rows.reduce((s, r) => s + r.nClients, 0);
  const totalCA = rows.reduce((s, r) => s + r.caPDV, 0);
  const maxCA = Math.max(...rows.map(r => r.caPDV), 1);

  const tbody = rows.slice(0, 20).map(r => {
    const pctCli = Math.round(r.nClients / totalClients * 100);
    const pctCA  = totalCA > 0 ? Math.round(r.caPDV / totalCA * 100) : 0;
    const bar = Math.round(r.caPDV / maxCA * 100);
    return `<tr class="border-b" style="border-color:rgba(255,255,255,0.04)">
      <td class="py-1 pr-2 text-sm font-bold t-primary">${r.dept}</td>
      <td class="py-1 px-2 text-xs text-right font-semibold" style="color:var(--c-action)">${r.nClients} <span class="t-disabled font-normal">(${pctCli}%)</span></td>
      <td class="py-1 px-2 text-xs text-right">${totalCA > 0 ? formatEuro(r.caPDV) : '—'}</td>
      <td class="py-1 pl-2" style="width:80px">
        <div style="height:4px;background:rgba(128,128,128,0.12);border-radius:2px">
          <div style="height:4px;width:${bar}%;background:var(--c-action);border-radius:2px"></div>
        </div>
        ${totalCA > 0 ? `<span style="font-size:9px;color:var(--c-muted)">${pctCA}% du CA</span>` : ''}
      </td>
    </tr>`;
  }).join('');

  const html = `<table class="w-full">
    <thead><tr class="t-disabled text-[10px]">
      <th class="py-1 pr-2 text-left font-normal">Dept.</th>
      <th class="py-1 px-2 text-right font-normal">Clients</th>
      <th class="py-1 px-2 text-right font-normal">CA PDV</th>
      <th class="py-1 pl-2 font-normal">Part</th>
    </tr></thead>
    <tbody>${tbody}</tbody>
  </table>
  <p class="text-[10px] t-disabled mt-2">${rows.length} départements · ${totalClients} clients · ${totalCA > 0 ? formatEuro(totalCA) + ' CA PDV' : 'CA non disponible sans consommé'}</p>`;

  return {
    title: `Répartition géographique — ${rows.length} départements · ${totalClients} clients`,
    html,
    footer: `Source : Code postal chalandise → 2 premiers chiffres = département`,
  };
}

// ── Sprint BG : Score engagement clients ─────────────────────
function _nlQ_EngagementClients() {
  if (!_S.clientLastOrder?.size || !_S.ventesClientArticle?.size)
    return { title:'Engagement clients', html:'<p class="text-xs t-disabled p-2">Chargez les données clients.</p>' };

  const nowTs = Date.now();
  const MAX_SILENCE = 365 * 86400000; // 1 an max pour la note
  const rows = [];

  for (const [cc, lastDt] of _S.clientLastOrder) {
    const arts = _S.ventesClientArticle.get(cc);
    if (!arts) continue;
    let caPDV = 0, nbBL = 0;
    for (const [, v] of arts) { caPDV += (v.sumCA || 0); nbBL += (v.countBL || 0); }
    if (caPDV < 200) continue;

    const silence = (nowTs - (lastDt instanceof Date ? lastDt.getTime() : lastDt)) / 86400000;
    // Score RFM simplifié (0-100)
    // R : récence (silence) — 35 pts : 0j=35, 365j=0
    const rScore = Math.max(0, Math.round(35 * (1 - Math.min(silence, 365) / 365)));
    // F : fréquence (nbBL) — 35 pts : 20+ BL = max
    const fScore = Math.min(35, Math.round(nbBL / 20 * 35));
    // M : montant (caPDV) — 30 pts : log scale, 10k€ = max
    const mScore = Math.min(30, Math.round(Math.log(caPDV + 1) / Math.log(10001) * 30));
    const total  = rScore + fScore + mScore;

    const info = _S.chalandiseData?.get(cc);
    rows.push({
      cc, nom: info?.nom || _S.clientNomLookup?.[cc] || cc,
      metier: info?.metier || '', commercial: info?.commercial || '',
      caPDV, nbBL, silence: Math.round(silence),
      rScore, fScore, mScore, total,
    });
  }
  rows.sort((a, b) => b.total - a.total);

  if (!rows.length)
    return { title:'Engagement clients', html:'<p class="text-xs t-disabled p-2">Aucun client avec données suffisantes (CA PDV >200€).</p>' };

  const topN = rows.slice(0, 15);
  const atRisk = rows.filter(r => r.total >= 40 && r.silence > 90).slice(0, 8);

  function engRow(r, showDetails = false) {
    const c = r.total >= 70 ? 'var(--c-ok)' : r.total >= 40 ? 'var(--c-action)' : 'var(--c-caution)';
    const bar = r.total;
    return `<tr class="border-b" style="border-color:rgba(255,255,255,0.04)">
      <td class="py-1 pr-2 text-xs t-primary font-medium" style="max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${r.nom}</td>
      ${showDetails ? `<td class="py-1 pr-1 text-[9px] t-disabled">${r.metier}</td>` : ''}
      <td class="py-1 px-1 text-xs text-right font-semibold" style="color:var(--c-action)">${formatEuro(r.caPDV)}</td>
      <td class="py-1 px-1 text-[10px] text-right t-disabled">${r.nbBL}BL · ${r.silence}j</td>
      <td class="py-1 px-1" style="width:55px">
        <div style="height:4px;background:rgba(128,128,128,0.12);border-radius:2px">
          <div style="height:4px;width:${bar}%;background:${c};border-radius:2px"></div>
        </div>
      </td>
      <td class="py-1 pl-1 text-xs font-bold text-right" style="color:${c}">${r.total}</td>
    </tr>`;
  }

  const html = `<div class="grid grid-cols-2 gap-3">
    <div>
      <p class="text-xs font-semibold mb-1" style="color:var(--c-ok)">💎 Top engagés (${topN.length})</p>
      <table class="w-full">
        <thead><tr class="t-disabled" style="font-size:9px"><th class="pr-2 text-left font-normal">Client</th><th class="px-1 text-right font-normal">CA</th><th class="px-1 text-right font-normal">BL·Silence</th><th class="px-1"></th><th class="pl-1 text-right font-normal">Score</th></tr></thead>
        <tbody>${topN.map(r => engRow(r)).join('')}</tbody>
      </table>
    </div>
    <div>
      <p class="text-xs font-semibold mb-1" style="color:var(--c-caution)">⚠️ Engagés à risque (${atRisk.length})</p>
      ${atRisk.length ? `<table class="w-full"><thead><tr class="t-disabled" style="font-size:9px"><th class="pr-2 text-left font-normal">Client</th><th class="px-1 text-right font-normal">CA</th><th class="px-1 text-right font-normal">BL·Silence</th><th class="px-1"></th><th class="pl-1 text-right font-normal">Score</th></tr></thead><tbody>${atRisk.map(r => engRow(r)).join('')}</tbody></table>` : '<p class="text-xs t-disabled">Aucun</p>'}
    </div>
  </div>`;

  return {
    title: `Score engagement clients — ${rows.length} clients analysés`,
    html,
    footer: `RFM simplifié : Récence 35pts · Fréquence 35pts · Montant 30pts · Total /100`,
  };
}

// ── Sprint BH : Articles sur-stockés (stock > 2×MAX) ─────────
function _nlQ_SurStockes() {
  if (!_S.finalData?.length)
    return { title:'Articles sur-stockés', html:'<p class="text-xs t-disabled p-2">Chargez les données articles.</p>' };

  const active = r => !r.isParent && !(r.V === 0 && r.enleveTotal > 0);
  const rows = _S.finalData.filter(r =>
    active(r) && r.ancienMax > 0 && r.stockActuel > r.ancienMax * 2 && r.W >= 1
  );
  rows.sort((a, b) => {
    const exA = a.stockActuel - a.ancienMax;
    const exB = b.stockActuel - b.ancienMax;
    const valA = exA * (a.prixUnitaire || 0);
    const valB = exB * (b.prixUnitaire || 0);
    return valB - valA;
  });

  if (!rows.length)
    return { title:'Articles sur-stockés', html:'<p class="text-xs t-disabled p-2">Aucun article avec stock > 2× MAX ERP détecté.</p>' };

  const totalExces = rows.reduce((s, r) => {
    const exces = Math.max(0, r.stockActuel - r.ancienMax);
    return s + exces * (r.prixUnitaire || 0);
  }, 0);

  const tbody = rows.slice(0, 25).map(r => {
    const ratio = Math.round(r.stockActuel / r.ancienMax * 10) / 10;
    const exces = r.stockActuel - r.ancienMax;
    const valExces = exces * (r.prixUnitaire || 0);
    const c = ratio >= 5 ? 'var(--c-danger)' : ratio >= 3 ? 'var(--c-caution)' : 'var(--c-muted)';
    const fam = famLib(_S.articleFamille?.[r.code] || '') || '';
    return `<tr class="border-b" style="border-color:rgba(255,255,255,0.04)">
      <td class="py-1 pr-2 text-xs font-mono t-secondary">${r.code}</td>
      <td class="py-1 pr-2 text-xs t-primary" style="max-width:150px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${r.libelle}</td>
      <td class="py-1 pr-1 text-xs t-disabled">${fam}</td>
      <td class="py-1 px-1 text-xs text-right t-secondary">${r.stockActuel}</td>
      <td class="py-1 px-1 text-xs text-right t-disabled">${r.ancienMax}</td>
      <td class="py-1 px-1 text-xs text-right font-bold" style="color:${c}">${ratio}×</td>
      <td class="py-1 pl-2 text-xs text-right font-semibold" style="color:var(--c-caution)">+${formatEuro(valExces)}</td>
    </tr>`;
  }).join('');

  const html = `<div class="text-xs t-disabled mb-2">Excédent valorisé total : <strong class="t-primary">${formatEuro(totalExces)}</strong> immobilisés au-dessus du MAX ERP</div>
  <table class="w-full">
    <thead><tr class="t-disabled text-[10px]">
      <th class="py-1 pr-2 text-left font-normal">Code</th>
      <th class="py-1 pr-2 text-left font-normal">Article</th>
      <th class="py-1 pr-1 text-left font-normal">Famille</th>
      <th class="py-1 px-1 text-right font-normal">Stock</th>
      <th class="py-1 px-1 text-right font-normal">MAX ERP</th>
      <th class="py-1 px-1 text-right font-normal">Ratio</th>
      <th class="py-1 pl-2 text-right font-normal">Excédent €</th>
    </tr></thead>
    <tbody>${tbody}</tbody>
  </table>`;

  return {
    title: `Sur-stockés — ${rows.length} articles · ${formatEuro(totalExces)} excédent`,
    html,
    footer: `Stock > 2× MAX ERP · Triés par valeur d'excédent décroissante`,
  };
}

// ── Sprint BI : Saison vs stock actuel ───────────────────────
function _nlQ_SaisonVsStock() {
  if (!_S.seasonalIndex || !_S.finalData?.length)
    return { title:'Saison vs stock', html:'<p class="text-xs t-disabled p-2">Chargez le fichier consommé pour accéder aux indices saisonniers.</p>' };

  const curM = new Date().getMonth();
  const MONTH_FR = ['Janv','Févr','Mars','Avr','Mai','Juin','Juil','Août','Sept','Oct','Nov','Déc'];
  const jours = _S.globalJoursOuvres > 0 ? _S.globalJoursOuvres : 250;

  // Pour chaque famille, vérifier si stock < besoin saisonnier
  const famStock = new Map(); // fam → {stockTotal, vmjBase, coeff}
  for (const r of _S.finalData) {
    if (r.isParent || r.W < 1 || (r.V === 0 && r.enleveTotal > 0)) continue;
    const fam = _S.articleFamille?.[r.code]; if (!fam) continue;
    const coeff = (_S.seasonalIndex[fam] || [])[curM] || 1;
    if (!famStock.has(fam)) famStock.set(fam, { stockTotal: 0, vmjBase: 0, coeff, nArts: 0 });
    const d = famStock.get(fam);
    d.stockTotal += r.stockActuel;
    d.vmjBase += (r.enleveTotal || 0) / jours;
    d.nArts++;
  }

  const rows = [];
  for (const [rawFam, d] of famStock) {
    if (d.nArts < 2 || d.vmjBase <= 0) continue;
    const vmjSaison = d.vmjBase * d.coeff; // VMJ ajustée pour la saison
    const couvertureBase = d.stockTotal / d.vmjBase;
    const couvertureSaison = d.stockTotal / vmjSaison;
    const delta = couvertureBase - couvertureSaison; // jours de couverture perdus à cause de la saison
    if (d.coeff < 1.1 || delta < 3) continue; // filtre : seulement si hausse saison >10% et impact >3j
    rows.push({
      rawFam, fam: famLib(rawFam) || rawFam,
      coeff: d.coeff, couvertureBase: Math.round(couvertureBase),
      couvertureSaison: Math.round(couvertureSaison),
      delta: Math.round(delta),
      vmjSaison,
    });
  }
  rows.sort((a, b) => b.coeff - a.coeff || a.couvertureSaison - b.couvertureSaison);

  if (!rows.length)
    return { title:'Saison vs stock', html:`<p class="text-xs t-disabled p-2">Aucune famille avec pic saisonnier significatif ce mois-ci (${MONTH_FR[curM]}).</p>` };

  const critique = rows.filter(r => r.couvertureSaison < 15).length;

  const tbody = rows.slice(0, 20).map(r => {
    const c = r.couvertureSaison < 15 ? 'var(--c-danger)' : r.couvertureSaison < 30 ? 'var(--c-caution)' : 'var(--c-ok)';
    return `<tr class="border-b" style="border-color:rgba(255,255,255,0.04)">
      <td class="py-1 pr-2 text-xs t-primary font-medium">${r.fam}</td>
      <td class="py-1 px-1 text-xs text-center font-bold" style="color:var(--c-caution)">×${r.coeff.toFixed(2)}</td>
      <td class="py-1 px-1 text-xs text-right t-secondary">${r.couvertureBase}j</td>
      <td class="py-1 px-1 text-xs text-right font-bold" style="color:${c}">${r.couvertureSaison}j</td>
      <td class="py-1 pl-2 text-xs text-right" style="color:var(--c-danger)">−${r.delta}j</td>
    </tr>`;
  }).join('');

  const html = `<div class="text-xs t-disabled mb-2">Pic saisonnier ${MONTH_FR[curM]} : couverture effective réduite par la hausse de demande</div>
  <table class="w-full">
    <thead><tr class="t-disabled text-[10px]">
      <th class="py-1 pr-2 text-left font-normal">Famille</th>
      <th class="py-1 px-1 text-center font-normal">Coeff.</th>
      <th class="py-1 px-1 text-right font-normal">Couv. base</th>
      <th class="py-1 px-1 text-right font-normal">Couv. saison</th>
      <th class="py-1 pl-2 text-right font-normal">Impact</th>
    </tr></thead>
    <tbody>${tbody}</tbody>
  </table>`;

  return {
    title: `Saison vs stock — ${MONTH_FR[curM]} · ${critique} famille${critique > 1 ? 's' : ''} critique${critique > 1 ? 's' : ''}`,
    html,
    footer: `Couverture saisonnière = stock ÷ VMJ×coeff · Impact = jours perdus par la saison`,
  };
}

// ── Sprint BJ : Top familles d'un métier ─────────────────────
function _nlQ_TopFamillesMetier(metier) {
  if (!_S.ventesClientArticle?.size || !_S.chalandiseData?.size)
    return { title:`Top familles ${metier}`, html:'<p class="text-xs t-disabled p-2">Chargez les données clients et chalandise.</p>' };

  // Clients du métier
  const clients = _S.clientsByMetier?.get(metier) || new Set(
    [...(_S.chalandiseData || new Map()).entries()]
      .filter(([, i]) => i.metier === metier).map(([cc]) => cc)
  );

  if (!clients.size)
    return { title:`Top familles ${metier}`, html:`<p class="text-xs t-disabled p-2">Aucun client trouvé pour le métier "${metier}".</p>` };

  // Agréger CA par famille pour ces clients
  const famCA = new Map();
  let totalCA = 0, nClients = 0;
  for (const cc of clients) {
    const arts = _S.ventesClientArticle?.get(cc); if (!arts) continue;
    let hasCA = false;
    for (const [code, v] of arts) {
      const fam = _S.articleFamille?.[code]; if (!fam) continue;
      const ca = v.sumCA || 0;
      famCA.set(fam, (famCA.get(fam) || 0) + ca);
      totalCA += ca;
      hasCA = true;
    }
    if (hasCA) nClients++;
  }

  if (!famCA.size)
    return { title:`Top familles ${metier}`, html:`<p class="text-xs t-disabled p-2">Aucune vente PDV trouvée pour le métier "${metier}".</p>` };

  const rows = [...famCA.entries()]
    .map(([f, ca]) => ({ f, fam: famLib(f) || f, ca, pct: Math.round(ca / totalCA * 100) }))
    .sort((a, b) => b.ca - a.ca).slice(0, 15);

  const maxCA = rows[0].ca;

  const tbody = rows.map(r => `<tr class="border-b" style="border-color:rgba(255,255,255,0.04)">
    <td class="py-1 pr-2 text-xs t-primary font-medium">${r.fam}</td>
    <td class="py-1 px-2 text-xs text-right font-semibold" style="color:var(--c-action)">${formatEuro(r.ca)}</td>
    <td class="py-1 px-1 text-xs text-right t-disabled">${r.pct}%</td>
    <td class="py-1 pl-2" style="width:80px">
      <div style="height:4px;background:rgba(128,128,128,0.12);border-radius:2px">
        <div style="height:4px;width:${Math.round(r.ca/maxCA*100)}%;background:var(--c-action);border-radius:2px"></div>
      </div>
    </td>
  </tr>`).join('');

  const html = `<div class="text-xs t-disabled mb-2">${nClients} clients actifs PDV · CA total ${formatEuro(totalCA)}</div>
  <table class="w-full">
    <thead><tr class="t-disabled text-[10px]">
      <th class="py-1 pr-2 text-left font-normal">Famille</th>
      <th class="py-1 px-2 text-right font-normal">CA PDV</th>
      <th class="py-1 px-1 text-right font-normal">Part</th>
      <th class="py-1 pl-2 font-normal"></th>
    </tr></thead>
    <tbody>${tbody}</tbody>
  </table>`;

  return {
    title: `Top familles — ${metier} · ${rows.length} familles`,
    html,
    footer: `CA PDV MAGASIN · Triées par CA décroissant · ${clients.size} clients dans ce métier`,
  };
}

// ── Sprint BK : Vue macro omnicanal ──────────────────────────
function _nlQ_OmnicanalMacro() {
  const canal = _S.canalAgence;
  if (!canal || !Object.keys(canal).length)
    return { title:'Vue macro omnicanal', html:'<p class="text-xs t-disabled p-2">Chargez un fichier consommé multi-canal.</p>' };

  const CANAUX = ['MAGASIN','INTERNET','REPRESENTANT','DCS'];
  const ICONS  = { MAGASIN:'🏪', INTERNET:'🌐', REPRESENTANT:'🤝', DCS:'📦' };
  const COLORS = { MAGASIN:'#3b82f6', INTERNET:'#10b981', REPRESENTANT:'#f59e0b', DCS:'#8b5cf6' };

  const data = CANAUX.map(c => ({
    c, icon: ICONS[c], color: COLORS[c],
    ca: canal[c]?.ca || 0,
    bl: canal[c]?.bl || 0,
    caP: canal[c]?.caP || 0,
  })).filter(d => d.ca > 0 || d.bl > 0);

  if (!data.length)
    return { title:'Vue macro omnicanal', html:'<p class="text-xs t-disabled p-2">Aucune donnée canal détectée.</p>' };

  const totalCA = data.reduce((s, d) => s + d.ca, 0);
  const totalBL = data.reduce((s, d) => s + d.bl, 0);
  const maxCA = Math.max(...data.map(d => d.ca), 1);

  // Donut SVG simple
  const W = 100, cx = 50, cy = 50, r = 38, r2 = 24;
  let angle = -Math.PI / 2;
  const slices = data.map(d => {
    const frac = d.ca / totalCA;
    const start = angle;
    angle += frac * 2 * Math.PI;
    return { ...d, frac, start, end: angle };
  });
  function arc(d) {
    const x1 = cx + r * Math.cos(d.start), y1 = cy + r * Math.sin(d.start);
    const x2 = cx + r * Math.cos(d.end),   y2 = cy + r * Math.sin(d.end);
    const xi1 = cx + r2 * Math.cos(d.start), yi1 = cy + r2 * Math.sin(d.start);
    const xi2 = cx + r2 * Math.cos(d.end),   yi2 = cy + r2 * Math.sin(d.end);
    const large = d.frac > 0.5 ? 1 : 0;
    return `<path d="M${xi1.toFixed(1)},${yi1.toFixed(1)} L${x1.toFixed(1)},${y1.toFixed(1)} A${r},${r} 0 ${large},1 ${x2.toFixed(1)},${y2.toFixed(1)} L${xi2.toFixed(1)},${yi2.toFixed(1)} A${r2},${r2} 0 ${large},0 ${xi1.toFixed(1)},${yi1.toFixed(1)} Z" fill="${d.color}" opacity="0.85"/>`;
  }

  const donut = `<svg width="${W}" height="${W}" viewBox="0 0 ${W} ${W}" style="display:block">
    ${slices.map(arc).join('')}
    <text x="${cx}" y="${cy - 4}" text-anchor="middle" font-size="8" font-weight="700" fill="rgba(255,255,255,0.6)">${data.length} canaux</text>
    <text x="${cx}" y="${cy + 6}" text-anchor="middle" font-size="7" fill="rgba(255,255,255,0.4)">${totalBL.toLocaleString('fr-FR')} BL</text>
  </svg>`;

  const kpiRows = data.map(d => {
    const pct = Math.round(d.ca / totalCA * 100);
    const vmc = d.bl > 0 ? d.ca / d.bl : 0;
    const bar = Math.round(d.ca / maxCA * 100);
    return `<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
      <span style="width:8px;height:8px;border-radius:50%;background:${d.color};display:inline-block;flex-shrink:0"></span>
      <span class="text-xs t-primary font-semibold" style="width:100px">${d.icon} ${d.c}</span>
      <div style="flex:1;height:4px;background:rgba(128,128,128,0.12);border-radius:2px">
        <div style="height:4px;width:${bar}%;background:${d.color};border-radius:2px"></div>
      </div>
      <span class="text-xs font-bold" style="color:${d.color};width:55px;text-align:right">${formatEuro(d.ca)}</span>
      <span class="text-[10px] t-disabled" style="width:32px;text-align:right">${pct}%</span>
      <span class="text-[9px] t-disabled" style="width:60px;text-align:right">${d.bl} BL · ${formatEuro(vmc)}/BL</span>
    </div>`;
  }).join('');

  const html = `<div style="display:flex;gap:16px;align-items:flex-start">
    <div style="flex-shrink:0">${donut}</div>
    <div style="flex:1;padding-top:4px">
      <p class="text-xs font-bold t-primary mb-3">CA total : ${formatEuro(totalCA)} · ${totalBL.toLocaleString('fr-FR')} BL</p>
      ${kpiRows}
    </div>
  </div>`;

  return {
    title: `Vue macro omnicanal — ${data.length} canaux actifs`,
    html,
    footer: `Source : fichier consommé multi-canal · VMC = CA ÷ nb BL par canal`,
  };
}

export function generatePrismeChips() {
  const allChips = [...document.querySelectorAll('.nl-chip')];
  if (!allChips.length) return;
  for (let i = allChips.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [allChips[i], allChips[j]] = [allChips[j], allChips[i]];
  }
  allChips.forEach(c => c.style.display = 'none');
  allChips.slice(0, 6).forEach(c => c.style.display = '');
}
window.generatePrismeChips = generatePrismeChips;

export function runBriefingJour() {
  _nlRenderResults(_nlQ_BriefingJour());
}
window.runBriefingJour = runBriefingJour;

// Pré-afficher 6 chips dès le chargement initial
document.addEventListener('DOMContentLoaded', () => generatePrismeChips());
