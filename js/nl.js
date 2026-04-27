// © 2026 Jawad El Barkaoui — Tous droits réservés
// PRISME — nl.js
// Moteur NL : pipeline + fonctions analyses avancées
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
  // ── ERP / Qualité données ──
  if (/sans.{0,10}(min|max)|anomalie.{0,10}(min|max)/.test(raw))                        return _nlQ_AnomaliesMinMax();
  if (/incoher|erp.{0,10}(bug|erreur|probl|anomal)|min.{0,5}sup.{0,5}max|calibr.{0,10}(manqu|absent)|surstoc.{0,10}max|sur.{0,5}stoc.{0,10}(max|plafond)/.test(raw)) return _nlQ_IncoherencesERP();
  if (/derive|ecart.{0,10}(min|max|erp)|min.{0,10}(ecart|differ|faux|mauvais|trop)|erp.{0,10}(sous|sures|decal)|desynchro|reglage.{0,10}(min|max)/.test(raw)) return _nlQ_DeriveMinMax();
  if (/qualite.{0,10}(donnee|donnée|data|analys)|fiabilite|donnee.{0,10}(manquante|incomplete|absent)|taux.{0,10}(couverture|remplissage|completude)|score.{0,6}(donnee|qualite)/.test(raw)) return _nlQ_QualiteDonnees();
  // ── Stock avancé ──
  if (/rupture.{0,10}(repet|chroni|toujours|souvent|regulier)|chroni.{0,10}rupture|toujours.{0,10}(en.{0,5}rupture|rupture)|souvent.{0,10}(en.{0,5}rupture|rupture)/.test(raw)) return _nlQ_RupturesRepetees();
  if (/rupture.{0,10}(proch|bientot|futur|j.{0,4}30|dans|immin)|stock.{0,10}(j.{0,4}30|tombe|epuis|fin)|va.{0,10}(tomber|manquer|rupture)|prevision.{0,10}rupture|risque.{0,10}rupture.{0,10}(proch|court)/.test(raw)) return _nlQ_PrevisionRupture();
  if (/dormant.{0,10}(fuyant|recup|ailleur|hors|perdu|opportun)|stock.{0,10}(mort|dorm).{0,10}(recup|fuyant|ailleur)|recup.{0,10}dormant/.test(raw)) return _nlQ_DormantsRecuperables();
  if (/cross.{0,5}sell|achete.{0,10}ensemble|fam.{0,10}(associ|combin|coachete|panier)|combina.{0,6}fam|souvent.{0,8}achete.{0,8}ensemble/.test(raw)) return _nlQ_CrossSellFamilles();
  if (/solder|vieux.{0,8}stock|surplus|depreci|trop.{0,6}vieux|anciens?.{0,8}(stock|ref|article)|stock.{0,8}(age|ancien|obsolete)/.test(raw)) return _nlQ_ArticlesSolder();
  if (/stock.{0,8}securite|securite.{0,8}stock|marge.{0,8}(securite|reappro|securit)|delai.{0,8}(reappro|reassort)|seuil.{0,8}securite/.test(raw)) return _nlQ_StockSecurite();
  if (/couverture.{0,10}(fam|famille|stock)|jours?.{0,8}(stock|restant|couvert)|duree.{0,10}stock|stock.{0,10}(jours?|duree|restant)/.test(raw)) return _nlQ_CouvertureJours();
  // ── Analyses familles ──
  if (/radar.{0,10}fam|scatter.{0,10}fam|carte.{0,10}fam|nuage.{0,10}fam|position.{0,10}fam|fam.{0,10}(radar|scatter|carte|bulle|plot)/.test(raw)) return _nlQ_RadarFamilles();
  if (/evolution.{0,10}fam|variation.{0,10}fam|fam.{0,10}(evolution|variation|hausse|baisse|delta|trend|mois)|mois.{0,10}(precedent|avant|compare|vs)|delta.{0,10}(fam|ca|mois)|tendance.{0,10}fam/.test(raw)) return _nlQ_EvolutionFamille();
  if (/canal.{0,10}(par|famille|fam|repartition|dominan)|fam.{0,10}(canal|web|internet|representant)|quel.{0,8}canal|repartition.{0,8}canal|web.{0,8}(par|famille)/.test(raw)) return _nlQ_CanauxFamille();
  if (/surperform|ou.{0,8}(je.{0,5}surp|j.{0,3}excelle|gagnant)|meilleur.{0,8}(vs.{0,6}reseau|reseau)|familles?.{0,8}(gagnant|top.{0,6}reseau|forte.{0,6}reseau|excel)/.test(raw)) return _nlQ_FamillesSurperformantes();
  if (/pivot.{0,8}metier|metier.{0,8}(famille|tableau|pivot|crois)|qui.{0,8}achete.{0,8}quoi|tableau.{0,8}(metier|crois)|croisement.{0,8}metier/.test(raw)) return _nlQ_PivotMetierFamille();
  if (e.metier && /top.{0,8}fam|famille.{0,8}(top|princip|clef|cle|domin)|principale.{0,8}fam|quoi.{0,8}achete|que.{0,8}achete/.test(raw)) return _nlQ_TopFamillesMetier(e.metier);
  if (/qui.{0,8}n.{0,4}achete.{0,8}(pas|jamais).{0,10}(fam|famille)|potentiel.{0,8}(fam|famille)|client.{0,8}(manque|absent).{0,10}fam|fam.{0,10}(absent|manque).{0,8}client|n.{0,4}achete.{0,8}(pas|jamais).{0,8}cette/.test(raw)) return _nlQ_PotentielFamille(raw);
  // ── Articles ──
  if (/article.{0,10}(monte|hausse|croiss|progres|mover)|top.{0,8}mover|mover.{0,8}article|article.{0,10}(baisse|chute|declin|recul)|croissance.{0,10}article/.test(raw)) return _nlQ_TopMoversArticles();
  if (/fiche.{0,8}article|detail.{0,8}article|article.{0,8}\d{6}|\d{6}.{0,8}(fiche|detail|info)|article.{0,8}(info|synthese|resume)/.test(raw)) return _nlQ_FicheArticle(raw);
  // ── Fiches client / commercial ──
  if (/profil.{0,12}client|client.{0,12}(profil|achats?|articles?|fiche|resume|bilan)|fiche.{0,12}client|achats?.{0,12}client/.test(raw)) return _nlQ_ProfilClient(raw);
  if (e.commercial && /profil|bilan|portefeuille|resume|scorecard|fiche/.test(raw))             return _nlQ_ProfilCommercial(e.commercial);
  // ── Géographie ──
  if (/client.{0,10}(departement|dept|geograph|region|zone|cp|code.{0,5}postal)|departement.{0,8}client|repartition.{0,8}(geo|geograph|client)|ou.{0,6}(sont|habitent).{0,8}client/.test(raw)) return _nlQ_RepartitionGeo();
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

function _nlQ_RadarFamilles() {
  if (!_S.ventesLocalMagPeriode?.size)
    return { title:'Radar familles', html:'<p class="text-xs t-disabled p-2">Chargez les données PDV pour calculer le radar familles.</p>' };

  // ── 1. CA PDV par famille ──
  const famPDV = new Map();
  for (const [cc, arts] of _S.ventesLocalMagPeriode) {
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
  } else if (_S.ventesLocalHorsMag?.size) {
    for (const [cc, arts] of _S.ventesLocalHorsMag) {
      const pdvFams = new Set();
      const pdvArts = _S.ventesLocalMagPeriode?.get(cc);
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
    const score = calcPriorityScore(r.W, r.prixUnitaire, r.ageJours, r.code);
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
function _nlQ_DormantsRecuperables() {
  if (!_S.finalData?.length)
    return { title:'Dormants récupérables', html:'<p class="text-xs t-disabled p-2">Chargez les données articles.</p>' };
  if (!_S.ventesLocalHorsMag?.size)
    return { title:'Dormants récupérables', html:'<p class="text-xs t-disabled p-2">Aucune donnée hors-MAGASIN disponible. Chargez un fichier multi-canal.</p>' };

  // Dormants : ageJours > DORMANT_DAYS (défini dans constants.js, ici on utilise 180 comme proxy)
  const DORMANT = 180;
  const dormants = new Map(_S.finalData
    .filter(r => !r.isParent && r.ageJours > DORMANT && r.stockActuel > 0 && r.W >= 1 && !(r.V === 0 && r.enleveTotal > 0))
    .map(r => [r.code, r])
  );

  // Croiser avec ventesLocalHorsMag — trouver dormants achetés hors PDV
  const recup = [];
  const codeHors = new Map(); // code → {caHors, nbClients}
  for (const [cc, arts] of _S.ventesLocalHorsMag) {
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
    const score = calcPriorityScore(r.W, r.prixUnitaire, r.ageJours, r.code);
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
  const nClients = _S.ventesLocalMagPeriode?.size || 0;
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
  if (!_S.ventesLocalMagPeriode?.size)
    return { title:'Cross-sell familles', html:'<p class="text-xs t-disabled p-2">Chargez les données clients (consommé requis).</p>' };

  // Pour chaque client, collecter les familles achetées
  const famPairs = new Map(); // "FAM1|FAM2" → count
  for (const [, arts] of _S.ventesLocalMagPeriode) {
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
    const arts = _S.articleClients?.has(art.code) ? _S.ventesLocalMagPeriode : null;
    if (_S.ventesLocalMagPeriode) {
      for (const [, clientArts] of _S.ventesLocalMagPeriode) {
        const v = clientArts.get(art.code);
        if (v) ca += (v.sumCA || 0);
      }
    }
    return ca;
  })();
  const nbCliPDV = _S.articleClients?.get(art.code)?.size || 0;
  const canalData = _S.articleCanalCA?.get(art.code);

  const score = calcPriorityScore(art.W, art.prixUnitaire, art.ageJours, art.code);
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
  if (!_S.ventesLocalMagPeriode?.size || !_S.chalandiseData?.size)
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
    for (const [cc, arts] of _S.ventesLocalMagPeriode) {
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
  for (const [cc, arts] of _S.ventesLocalMagPeriode) {
    for (const [code] of arts) {
      if (_S.articleFamille?.[code] === targetFam) { acheteurs.add(cc); break; }
    }
  }

  const potentiels = [];
  for (const [cc, info] of _S.chalandiseData) {
    if (acheteurs.has(cc)) continue;
    let caPDV = 0;
    const arts = _S.ventesLocalMagPeriode?.get(cc);
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
    const arts = _S.ventesLocalMagPeriode?.get(cc);
    if (arts) for (const [, v] of arts) { ccCAPDV += (v.sumCA || 0); ccBL += (v.countBL || 0); }
    caPDV += ccCAPDV; nbBL += ccBL;

    // CA hors
    const artsH = _S.ventesLocalHorsMag?.get(cc);
    if (artsH) for (const [, v] of artsH) caHors += (v.sumCA || 0);

    // Silence
    const _csRC = _S.clientStore?.get(cc);
    if (_csRC?.silenceDaysPDV !== undefined && _csRC?.silenceDaysPDV !== null) {
      if (_csRC.silenceDaysPDV < SILENCE / 86400000) nbActifs++; else nbSilencieux++;
    } else {
      const lastDt = _S.clientLastOrder?.get(cc);
      if (lastDt) {
        const age = nowTs - (lastDt instanceof Date ? lastDt.getTime() : lastDt);
        if (age < SILENCE) nbActifs++; else nbSilencieux++;
      }
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
function _nlQ_ProfilClient(raw) {
  if (!_S.ventesLocalMagPeriode?.size)
    return { title:'Profil client', html:'<p class="text-xs t-disabled p-2">Chargez les données clients.</p>' };

  // Recherche client par nom (3+ tokens dans la requête) ou code
  let targetCC = null, targetNom = '';
  const stopwords = new Set(['profil','client','achats','articles','fiche','resume','bilan','detail','de','du','le','la','les','un','une','pour']);
  const words = raw.split(/\s+/).filter(w => w.length >= 3 && !stopwords.has(w));

  // Chercher dans clientStore
  if (words.length > 0 && _S.clientStore?.size) {
    let bestScore = 0;
    const source = [..._S.clientStore.values()].map(r => [r.cc, r.nom]);
    for (const [cc, nom] of source) {
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
  const arts = _S.ventesLocalMagPeriode?.get(targetCC) || new Map();
  const artsH = _S.ventesLocalHorsMag?.get(targetCC) || new Map();

  let caPDV = 0, nbBL = 0, nbArts = arts.size;
  for (const [, v] of arts) { caPDV += (v.sumCA || 0); nbBL += (v.countBL || 0); }
  let caHors = 0;
  for (const [, v] of artsH) caHors += (v.sumCA || 0);

  const _csRP = _S.clientStore?.get(targetCC);
  const silence = _csRP?.silenceDaysPDV ?? (()=>{ const ld=_S.clientLastOrder?.get(targetCC); return ld?Math.round((Date.now()-ld)/86400000):null; })();

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
  if (!_S.ventesLocalMagPeriode?.size || !_S.chalandiseData?.size)
    return { title:'Pivot métiers × familles', html:'<p class="text-xs t-disabled p-2">Chargez les données clients et chalandise.</p>' };

  // Agréger CA PDV par métier × famille
  const pivot = new Map(); // metier → Map<fam, ca>
  const allFams = new Set();

  for (const [cc, arts] of _S.ventesLocalMagPeriode) {
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
    const arts = _S.ventesLocalMagPeriode?.get(cc);
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
function _nlQ_TopFamillesMetier(metier) {
  if (!_S.ventesLocalMagPeriode?.size || !_S.chalandiseData?.size)
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
    const arts = _S.ventesLocalMagPeriode?.get(cc); if (!arts) continue;
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
