// © 2026 Jawad El Barkaoui — Tous droits réservés
// PRISME — labo.js
// Onglet Labo : prototypes de croisements analytiques
// Tile-based UI with lazy computation
// ═══════════════════════════════════════════════════════════════
'use strict';
import { _S } from './state.js';
import { formatEuro, famLib, _doCopyCode, _copyCodeBtn, escapeHtml } from './utils.js';
import { _unikLink, _clientPassesFilters, computeMaClientele, computeMonRayon, computeRadarFamille } from './engine.js';
import { DataStore } from './store.js';

// ═══════════════════════════════════════════════════════════════
// NL Chips for "Générer mon PRISME" tile
// ═══════════════════════════════════════════════════════════════

const _NL_CHIPS = [
  { q: 'taux de service', label: 'taux de service' },
  { q: 'stock dormant', label: 'stock dormant' },
  { q: 'ruptures top clients', label: 'ruptures top clients' },
  { q: 'top 10 clients web', label: 'top 10 clients web' },
  { q: 'articles sans min max', label: 'articles sans min max' },
  { q: 'nouveau client ce mois', label: 'nouveau client' },
  { q: 'clients hors agence 3000 euros', label: 'hors agence >3000€' },
  { q: 'familles sous la mediane reseau', label: 'familles sous médiane' },
  { q: 'clients devenus digitaux', label: 'clients devenus digitaux' },
  { q: 'clients hybrides', label: 'clients hybrides' },
  { q: 'familles fuyantes hors agence', label: 'familles fuyantes' },
  { q: 'heatmap fuites par metier', label: 'heatmap fuites × métier' },
  { q: 'fuites par commercial', label: 'fuites par commercial' },
  { q: 'alerte saisonnière mois prochain', label: '🌡️ alerte saisonnière' },
  { q: 'synthèse commerciaux tous portefeuilles', label: '👥 synthèse commerciaux' },
  { q: 'radar familles scatter pdv fuyant', label: '🫧 radar familles' },
  { q: 'incohérences ERP min max calibrage', label: '⚠️ incohérences ERP' },
  { q: 'dérive min max erp écart', label: '📐 dérive MIN/MAX' },
  { q: 'concentration risque client ICC', label: '🎯 concentration client' },
  { q: 'score fidélité clients top fidèles à risque', label: '💎 fidélité clients' },
  { q: 'panier moyen VMC par métier', label: '🧺 panier par métier' },
  { q: 'évolution familles mois précédent delta tendance', label: '📈 évolution familles' },
  { q: 'prévision rupture stock J-30 va tomber', label: '⏱️ ruptures prévues' },
  { q: 'relance clients à appeler priorité', label: '📞 relance clients' },
  { q: 'nouveautés à calibrer sans ERP min max', label: '🔧 nouveautés ERP' },
  { q: 'comment je me positionne vs réseau benchmark', label: '🏆 position réseau' },
  { q: 'dormants récupérables achetés ailleurs hors PDV', label: '♻️ dormants récup.' },
  { q: 'ruptures répétées chroniques toujours en rupture', label: '🔄 ruptures chroniques' },
  { q: 'qualité données fiabilité couverture', label: '🔬 qualité données' },
  { q: 'stock sous min ERP réassort urgent', label: '📉 sous MIN ERP' },
  { q: 'cross-sell familles achetées ensemble co-achats', label: '🔗 cross-sell familles' },
  { q: 'articles à solder vieux stock surplus', label: '🗑️ à solder' },
  { q: 'répartition canal par famille web internet', label: '📡 canaux par famille' },
  { q: 'briefing du jour synthèse ce matin résumé', label: '☀️ briefing du jour' },
  { q: 'clients potentiels famille manque pas acheteurs', label: '🎯 potentiel famille' },
  { q: 'couverture famille jours de stock restant durée', label: '📅 couverture jours' },
  { q: 'clients gagnés vs perdus solde bilan', label: '⚖️ gagnés vs perdus' },
  { q: 'profil client achats articles fiche', label: '👤 profil client' },
  { q: 'où je surperforme familles gagnantes vs réseau', label: '🏅 surperformance' },
  { q: 'stock sécurité marge délai réassort', label: '🛡️ stock sécurité' },
  { q: 'pivot métiers familles qui achète quoi tableau', label: '🔢 pivot métier' },
  { q: 'articles qui montent top movers croissance article', label: '🚀 top movers' },
  { q: 'clients par département répartition géo', label: '🗺️ répartition géo' },
  { q: 'clients les plus engagés score RFM engagement', label: '💪 engagement clients' },
  { q: 'articles sur-stockés excès stock max trop', label: '📦 sur-stockés' },
  { q: 'préparation saison stock vs saisonnier sous-appro', label: '🌊 saison vs stock' },
  { q: 'vue macro omnicanal tous canaux bilan part de voix', label: '🌐 omnicanal macro' },
];

// ═══════════════════════════════════════════════════════════════
// #5 — Commercial × Silencieux
// ═══════════════════════════════════════════════════════════════

export function computeCommercialSilencieux() {
  if (!_S.clientsByCommercial?.size) return [];
  const now = Date.now();
  const results = [];

  for (const [commercial, ccSet] of _S.clientsByCommercial) {
    let nbActifs = 0, nbSilencieux = 0, nbPerdus = 0, nbJamais = 0;
    let caActifs = 0, caSilencieux = 0, caPerdus = 0;
    const clients = [];

    for (const cc of ccSet) {
      // Filtre chalandise actif
      const info = _S.chalandiseData?.get(cc);
      if (info && !_clientPassesFilters(info)) continue;

      // Dernière commande MAGASIN
      let lastDate = null;
      const canalMap = _S.clientLastOrderByCanal?.get(cc);
      if (canalMap) lastDate = canalMap.get('MAGASIN') || null;
      if (!lastDate) lastDate = _S.clientLastOrder?.get(cc) || null;

      const daysSince = lastDate ? Math.round((now - lastDate) / 86400000) : null;
      let bucket;
      if (daysSince === null) bucket = 'jamais';
      else if (daysSince <= 30) bucket = 'actif';
      else if (daysSince <= 60) bucket = 'silencieux';
      else bucket = 'perdu';

      // CA en jeu = historique complet
      let ca = 0;
      const artMap = _S.ventesClientArticleFull?.get(cc) || _S.ventesClientArticle?.get(cc);
      if (artMap) { for (const d of artMap.values()) ca += (d.sumCA || 0); }

      if (bucket === 'actif') { nbActifs++; caActifs += ca; }
      else if (bucket === 'silencieux') { nbSilencieux++; caSilencieux += ca; }
      else if (bucket === 'perdu') { nbPerdus++; caPerdus += ca; }
      else { nbJamais++; }

      clients.push({ cc, nom: info?.nom || _S.clientNomLookup?.[cc] || cc, metier: info?.metier || '', daysSince, bucket, ca });
    }

    const total = nbActifs + nbSilencieux + nbPerdus + nbJamais;
    if (total === 0) continue;

    results.push({
      commercial, nbActifs, nbSilencieux, nbPerdus, nbJamais,
      caActifs, caSilencieux, caPerdus,
      clients: clients.sort((a, b) => b.ca - a.ca)
    });
  }

  // Tri par CA à risque décroissant
  results.sort((a, b) => (b.caPerdus + b.caSilencieux) - (a.caPerdus + a.caSilencieux));
  return results;
}

function _renderCommercialSilencieux(data) {
  if (!data.length) return '<p class="text-xs t-disabled p-4">Aucune donnée chalandise chargée.</p>';

  const rows = data.map((r, idx) => {
    const total = r.nbActifs + r.nbSilencieux + r.nbPerdus + r.nbJamais;
    const perdusPct = total > 0 ? r.nbPerdus / total * 100 : 0;
    const borderColor = r.nbPerdus === 0 ? 'var(--c-ok)' : perdusPct >= 20 ? 'var(--c-danger)' : 'var(--c-caution)';
    const caRisque = r.caSilencieux + r.caPerdus;

    // Clients silencieux + perdus pour expand
    const atRisk = r.clients.filter(c => c.bucket === 'silencieux' || c.bucket === 'perdu');
    const erpCodes = atRisk.map(c => c.cc).join('\n');

    const detailRows = atRisk.map(c => {
      const bucketBadge = c.bucket === 'silencieux'
        ? '<span class="text-[9px] px-1.5 py-0.5 rounded-full s-panel-inner border b-light" style="color:var(--c-caution)">Silencieux</span>'
        : '<span class="text-[9px] px-1.5 py-0.5 rounded-full s-panel-inner border b-light" style="color:var(--c-danger)">Perdu</span>';
      return `<tr class="text-[10px] border-b" style="border-color:var(--b-dark)">
        <td class="py-1 pr-2 font-mono t-inverse-muted">${_unikLink(c.cc)}</td>
        <td class="py-1 pr-2 t-inverse">${escapeHtml(c.nom)}</td>
        <td class="py-1 pr-2 t-inverse-muted">${escapeHtml(c.metier)}</td>
        <td class="py-1 pr-2 text-center">${bucketBadge}</td>
        <td class="py-1 pr-2 text-right t-inverse-muted">${c.daysSince != null ? c.daysSince + 'j' : '—'}</td>
        <td class="py-1 text-right font-bold t-inverse">${formatEuro(c.ca)}</td>
      </tr>`;
    }).join('');

    return `<tr class="text-[11px] b-light border-b cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/30" onclick="window._laboToggleDetail(${idx})" style="border-left:3px solid ${borderColor}">
      <td class="py-2 px-2 font-bold t-primary">${escapeHtml(r.commercial)}</td>
      <td class="py-2 text-center t-primary">${r.nbActifs}</td>
      <td class="py-2 text-center font-bold" style="color:var(--c-caution)">${r.nbSilencieux || '—'}</td>
      <td class="py-2 text-center font-bold" style="color:var(--c-danger)">${r.nbPerdus || '—'}</td>
      <td class="py-2 text-center t-disabled">${r.nbJamais || '—'}</td>
      <td class="py-2 text-right font-bold t-primary">${formatEuro(caRisque)}</td>
      <td class="py-2 text-center">${atRisk.length ? `<button onclick="event.stopPropagation();window._laboCopyERP(${idx})" class="text-[9px] px-1.5 py-0.5 rounded border b-light hover:bg-gray-100 dark:hover:bg-gray-700" title="Copier codes ERP">📋</button>` : ''}</td>
    </tr>
    <tr id="laboDetail${idx}" class="hidden">
      <td colspan="7" class="p-0">
        <div class="px-4 py-2 s-panel-inner">
          <table class="w-full"><thead><tr class="text-[9px] t-inverse-muted border-b" style="border-color:var(--b-dark)">
            <th class="text-left py-1 pr-2">Code</th><th class="text-left py-1 pr-2">Nom</th><th class="text-left py-1 pr-2">Métier</th><th class="text-center py-1 pr-2">Statut</th><th class="text-right py-1 pr-2">Jours</th><th class="text-right py-1">CA</th>
          </tr></thead><tbody>${detailRows}</tbody></table>
        </div>
      </td>
    </tr>`;
  }).join('');

  return `<div class="overflow-x-auto"><table class="w-full">
    <thead><tr class="text-[9px] t-disabled border-b b-light">
      <th class="text-left py-1 px-2">Commercial</th>
      <th class="text-center py-1">Actifs</th>
      <th class="text-center py-1">Silenc. 30-60j</th>
      <th class="text-center py-1">Perdus &gt;60j</th>
      <th class="text-center py-1">Jamais</th>
      <th class="text-right py-1">CA en jeu</th>
      <th class="text-center py-1 w-8"></th>
    </tr></thead><tbody>${rows}</tbody></table></div>`;
}

// ═══════════════════════════════════════════════════════════════
// #1 — Famille × Commercial (inférence réseau)
// ═══════════════════════════════════════════════════════════════

function _getFamFromArticle(code) {
  return _S.articleFamille?.[code] || '';
}

export function computeFamilleCommercial(seuil) {
  if (!_S.clientsByCommercial?.size || !_S.clientsByMetier?.size) return { metierFamillesMap: new Map(), resultsByCommercial: [] };

  const seuilPct = seuil || _S._laboSeuilPenetration || 0.20;

  // Étape 1 : inférence métier → familles attendues
  const metierFamillesMap = new Map();
  for (const [metier, clientSet] of _S.clientsByMetier) {
    const totalClients = clientSet.size;
    if (totalClients < 3) continue; // ignore les métiers avec très peu de clients
    const famCount = new Map();
    let clientsWithArts = 0;

    for (const cc of clientSet) {
      const artMap = _S.ventesClientArticleFull?.get(cc) || _S.ventesClientArticle?.get(cc);
      if (!artMap) continue;
      clientsWithArts++;
      const famsVues = new Set();
      for (const code of artMap.keys()) {
        const fam = _getFamFromArticle(code);
        if (fam && fam !== 'Non Classé') famsVues.add(fam);
      }
      for (const fam of famsVues) famCount.set(fam, (famCount.get(fam) || 0) + 1);
    }

    if (clientsWithArts < 3) continue; // pas assez de données actives pour inférer

    const famillesAttendues = new Map();
    for (const [fam, count] of famCount) {
      const taux = count / clientsWithArts;
      if (taux >= seuilPct) famillesAttendues.set(fam, { nbClients: count, totalClients: clientsWithArts, taux });
    }
    if (famillesAttendues.size > 0) metierFamillesMap.set(metier, famillesAttendues);
  }

  // Pré-calcul du CA moyen par métier×famille (une seule passe)
  const _caCacheMF = new Map();
  for (const [metier, clientSet] of _S.clientsByMetier) {
    const famTotals = new Map();
    for (const cc of clientSet) {
      const artMap = _S.ventesClientArticleFull?.get(cc) || _S.ventesClientArticle?.get(cc);
      if (!artMap) continue;
      const famCA = new Map();
      for (const [code, data] of artMap) {
        const fam = _getFamFromArticle(code);
        if (fam && fam !== 'Non Classé') {
          famCA.set(fam, (famCA.get(fam) || 0) + (data.sumCA || 0));
        }
      }
      for (const [fam, ca] of famCA) {
        if (!famTotals.has(fam)) famTotals.set(fam, { totalCA: 0, count: 0 });
        const f = famTotals.get(fam);
        f.totalCA += ca;
        f.count++;
      }
    }
    for (const [fam, f] of famTotals) {
      _caCacheMF.set(metier + '|' + fam, f.count > 0 ? f.totalCA / f.count : 0);
    }
  }

  // Étape 2 : détection des écarts par commercial
  const resultsByCommercial = [];
  for (const [commercial, ccSet] of _S.clientsByCommercial) {
    const opportunites = [];

    for (const cc of ccSet) {
      const info = _S.chalandiseData?.get(cc);
      if (!info?.metier) continue;
      if (!_clientPassesFilters(info)) continue;

      // FIX Bug 2 : exiger que le client ait des achats
      const artMap = _S.ventesClientArticleFull?.get(cc) || _S.ventesClientArticle?.get(cc);
      if (!artMap || artMap.size === 0) continue;

      const famillesAttendues = metierFamillesMap.get(info.metier);
      if (!famillesAttendues) continue;

      // Familles effectivement achetées
      const famsAchetees = new Set();
      for (const code of artMap.keys()) {
        const fam = _getFamFromArticle(code);
        if (fam) famsAchetees.add(fam);
      }

      // Écart
      for (const [fam, stats] of famillesAttendues) {
        if (!famsAchetees.has(fam)) {
          opportunites.push({
            cc, nom: info.nom || _S.clientNomLookup?.[cc] || cc,
            metier: info.metier,
            familleManquante: fam,
            famLib: famLib(fam) || fam,
            tauxReseau: stats.taux,
            caEstime: _caCacheMF.get(info.metier + '|' + fam) || 0
          });
        }
      }
    }

    if (!opportunites.length) continue;
    opportunites.sort((a, b) => b.caEstime - a.caEstime);
    const totalCA = opportunites.reduce((s, o) => s + o.caEstime, 0);
    resultsByCommercial.push({ commercial, opportunites, totalCA });
  }

  resultsByCommercial.sort((a, b) => b.totalCA - a.totalCA);
  return { metierFamillesMap, resultsByCommercial };
}

function _renderFamilleCommercial(data) {
  const { resultsByCommercial } = data;
  if (!resultsByCommercial.length) return '<p class="text-xs t-disabled p-4">Aucune opportunité détectée. Vérifiez que la chalandise et le consommé sont chargés.</p>';

  const seuil = (_S._laboSeuilPenetration || 0.20) * 100;
  const sliderHtml = `<div class="flex items-center gap-3 mb-3 px-1">
    <label class="text-[10px] t-secondary font-bold whitespace-nowrap">Seuil pénétration :</label>
    <input type="range" min="10" max="50" step="5" value="${seuil}" id="laboSeuilSlider" oninput="window._laboUpdateSeuil(this.value)" class="flex-1" style="max-width:200px">
    <span id="laboSeuilVal" class="text-[11px] font-bold t-primary" style="min-width:32px">${seuil}%</span>
  </div>`;

  const cards = resultsByCommercial.map((r, idx) => {
    const detailRows = r.opportunites.map(o => {
      return `<tr class="text-[10px] b-light border-b hover:bg-gray-50 dark:hover:bg-gray-800/30">
        <td class="py-1 pr-2">${_unikLink(o.cc)}</td>
        <td class="py-1 pr-2 t-primary">${escapeHtml(o.nom)}</td>
        <td class="py-1 pr-2"><span class="text-[9px] px-1.5 py-0.5 rounded-full border b-light s-panel-inner t-inverse-muted">${escapeHtml(o.metier)}</span></td>
        <td class="py-1 pr-2 font-bold t-primary">${escapeHtml(o.famLib)}</td>
        <td class="py-1 pr-2 text-center t-disabled">${Math.round(o.tauxReseau * 100)}%</td>
        <td class="py-1 text-right font-bold t-primary">${formatEuro(o.caEstime)}</td>
      </tr>`;
    }).join('');

    return `<div class="s-card rounded-xl border mb-2">
      <div class="flex items-center justify-between px-3 py-2 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/30 rounded-t-xl" onclick="window._laboToggleFamDetail(${idx})">
        <div class="flex items-center gap-2">
          <span class="text-[11px] font-bold">${escapeHtml(r.commercial)}</span>
          <span class="text-[9px] px-2 py-0.5 rounded-full s-panel-inner border b-light font-bold" style="color:var(--c-action)">${r.opportunites.length} opportunité${r.opportunites.length > 1 ? 's' : ''}</span>
        </div>
        <span class="text-[11px] font-bold" style="color:var(--c-action)">${formatEuro(r.totalCA)} potentiel</span>
      </div>
      <div id="laboFamDetail${idx}" class="hidden px-3 pb-2">
        <div class="overflow-x-auto"><table class="w-full"><thead><tr class="text-[9px] t-disabled border-b b-light">
          <th class="text-left py-1 pr-2">Code</th><th class="text-left py-1 pr-2">Client</th><th class="text-left py-1 pr-2">Métier</th><th class="text-left py-1 pr-2">Famille manquante</th><th class="text-center py-1 pr-2">Pénétration métier</th><th class="text-right py-1">CA estimé</th>
        </tr></thead><tbody>${detailRows}</tbody></table></div>
      </div>
    </div>`;
  }).join('');

  return sliderHtml + cards;
}

// ═══════════════════════════════════════════════════════════════
// Quick scan for tile subtitles (lightweight)
// ═══════════════════════════════════════════════════════════════

function _quickScanSilencieux() {
  if (!_S.clientsByCommercial?.size) return { n: 0, ca: 0 };
  const now = Date.now();
  let n = 0, ca = 0;
  for (const [, ccSet] of _S.clientsByCommercial) {
    for (const cc of ccSet) {
      const info = _S.chalandiseData?.get(cc);
      if (info && !_clientPassesFilters(info)) continue;
      let lastDate = null;
      const canalMap = _S.clientLastOrderByCanal?.get(cc);
      if (canalMap) lastDate = canalMap.get('MAGASIN') || null;
      if (!lastDate) lastDate = _S.clientLastOrder?.get(cc) || null;
      const daysSince = lastDate ? Math.round((now - lastDate) / 86400000) : null;
      if (daysSince !== null && daysSince > 30) {
        n++;
        const artMap = _S.ventesClientArticleFull?.get(cc) || _S.ventesClientArticle?.get(cc);
        if (artMap) { for (const d of artMap.values()) ca += (d.sumCA || 0); }
      }
    }
  }
  return { n, ca };
}

function _quickScanFamille() {
  // Use cached data if available, else return placeholder
  if (_S._laboFamData) {
    const { resultsByCommercial } = _S._laboFamData;
    const totalOpp = resultsByCommercial.reduce((s, r) => s + r.opportunites.length, 0);
    const totalCA = resultsByCommercial.reduce((s, r) => s + r.totalCA, 0);
    return { n: totalOpp, ca: totalCA };
  }
  return { n: '?', ca: 0 };
}

// ═══════════════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════════
// #7 — Client × Saisonnalité
// ═══════════════════════════════════════════════════════════════

const SAISON_TOP_N = 5; // un mois est "haut" s'il est dans le top 5 des 12 mois
let _saisonData = null, _saisonMonth = null, _saisonSearch = '', _saisonPage = 20;

function _getSaisonTargetMonth(offset) {
  return (new Date().getMonth() + (offset || 0)) % 12;
}

/** Retourne les indices des top N mois pour un profil saisonnier [12] */
function _topMonths(profile) {
  return profile.map((v, i) => ({ v, i })).sort((a, b) => b.v - a.v).slice(0, SAISON_TOP_N).map(x => x.i);
}

/** Détecte si l'historique couvre 12 mois (saisonnalité fiable) */
function _hasFullYear() {
  const ms = _S.articleMonthlySales;
  if (!ms) return false;
  const monthsSeen = new Set();
  for (const months of Object.values(ms)) {
    for (let i = 0; i < 12; i++) { if (months[i] > 0) monthsSeen.add(i); }
    if (monthsSeen.size >= 12) return true;
  }
  return monthsSeen.size >= 10; // tolérance : 10 mois suffisent
}

function _clientBadge(cc) {
  const now = Date.now();
  let lastDate = null;
  const canalMap = _S.clientLastOrderByCanal?.get(cc);
  if (canalMap) lastDate = canalMap.get('MAGASIN') || null;
  if (!lastDate) lastDate = _S.clientLastOrder?.get(cc) || null;
  const daysSince = lastDate ? Math.round((now - lastDate) / 86400000) : null;
  let badge = 'perdu';
  if (daysSince !== null && daysSince <= 30) badge = 'actif';
  else if (daysSince !== null && daysSince <= 60) badge = 'silencieux';
  return { lastDate, daysSince, badge };
}

function _passesGlobalFilters(cc) {
  const info = _S.chalandiseData?.get(cc);
  if (info) return _clientPassesFilters(info, cc) ? info : null;
  const _hasChalFilter = _S._selectedDepts?.size > 0 || _S._selectedClassifs?.size > 0 || _S._selectedStatuts?.size > 0 || _S._selectedActivitesPDV?.size > 0 || _S._selectedDirections?.size > 0 || _S._selectedUnivers?.size > 0 || _S._selectedCommercial || _S._selectedMetier || _S._filterStrategiqueOnly || _S._selectedStatutDetaille;
  if (_hasChalFilter) return null;
  return false; // no info but passes (false = no chalandise)
}

export function computeClientSaisonnier(monthOffset) {
  const mois = _getSaisonTargetMonth(monthOffset || 0);
  const fd = DataStore.finalData;
  if (!fd.length) return [];

  const _fullPDV = _S.ventesClientArticleFull?.size ? _S.ventesClientArticleFull : _S.ventesClientArticle;
  const _currentPDV = _S.ventesClientArticle;
  if (!_fullPDV?.size) return [];

  // Lookup rapide des articles en stock
  const articleLookup = new Map();
  for (const r of fd) { if (r.code) articleLookup.set(r.code, r); }

  const fullYear = _hasFullYear();
  // Préférer l'index réseau (plus stable, plus de données)
  const seasonIdx = _S.seasonalIndexReseau || _S.seasonalIndex;

  // ── Mode A : historique >= 12 mois → saisonnalité vraie ──
  if (fullYear && seasonIdx && Object.keys(seasonIdx).length) {
    const seasonalArticles = new Map();
    for (const r of fd) {
      if (!r.code || !r.famille) continue;
      const profile = seasonIdx[r.famille];
      if (!profile) continue;
      // Ignorer les familles avec plus de 6 mois à 0 (données insuffisantes)
      const moisActifs = profile.filter(v => v > 0).length;
      if (moisActifs < 6) continue; // profil trop creux
      const tops = _topMonths(profile);
      if (!tops.includes(mois)) continue;
      seasonalArticles.set(r.code, r);
    }
    if (!seasonalArticles.size) return [];

    const opps = [];
    for (const [code, article] of seasonalArticles) {
      const clientsForArt = _S.articleClients?.get(code);
      if (!clientsForArt?.size) continue;
      for (const cc of clientsForArt) {
        const filterResult = _passesGlobalFilters(cc);
        if (filterResult === null) continue;
        const info = filterResult || undefined;
        if (_currentPDV?.get(cc)?.has(code)) continue;
        const artData = _fullPDV?.get(cc)?.get(code);
        if (!artData || (artData.sumCA || 0) <= 0) continue;
        const { lastDate, daysSince, badge } = _clientBadge(cc);
        opps.push({
          cc, nom: info?.nom || _S.clientNomLookup?.[cc] || cc,
          code, libelle: article.libelle || _S.libelleLookup?.[code] || code,
          famille: famLib(article.famille) || article.famille,
          profile: seasonIdx[article.famille],
          montantPotentiel: artData.sumCA || 0,
          lastDate, daysSince, badge, mode: 'saison'
        });
      }
    }
    opps.sort((a, b) => b.montantPotentiel - a.montantPotentiel);
    return opps;
  }

  // ── Mode B : historique < 12 mois → réachat potentiel ──
  // Articles achetés par le client dans l'historique mais pas ce mois
  const opps = [];
  const seen = new Set(); // éviter doublons cc|code
  for (const [cc, fullArts] of _fullPDV) {
    const filterResult = _passesGlobalFilters(cc);
    if (filterResult === null) continue;
    const info = filterResult || undefined;
    const currentArts = _currentPDV?.get(cc);
    const { lastDate, daysSince, badge } = _clientBadge(cc);

    for (const [code, artData] of fullArts) {
      if (currentArts?.has(code)) continue; // déjà commandé ce mois
      const ca = artData.sumCA || 0;
      if (ca <= 0) continue;
      const article = articleLookup.get(code);
      if (!article) continue;
      const key = cc + '|' + code;
      if (seen.has(key)) continue;
      seen.add(key);

      // Profil saisonnier si disponible (même partiel)
      const profile = seasonIdx?.[article.famille] || null;

      opps.push({
        cc, nom: info?.nom || _S.clientNomLookup?.[cc] || cc,
        code, libelle: article.libelle || _S.libelleLookup?.[code] || code,
        famille: famLib(article.famille) || article.famille,
        profile,
        montantPotentiel: ca,
        lastDate, daysSince, badge, mode: 'reachat'
      });
    }
  }
  opps.sort((a, b) => b.montantPotentiel - a.montantPotentiel);
  return opps.slice(0, 500); // cap pour perf
}

function _miniRibbon(profile, highlightMonth) {
  if (!profile || profile.length !== 12) return '';
  const max = Math.max(...profile);
  const MOIS = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];
  const bars = profile.map((v, i) => {
    const h = max > 0 ? Math.round(v / max * 18) : 0;
    const fill = i === highlightMonth ? 'var(--c-action)' : 'var(--t-disabled)';
    return `<rect x="${i * 6}" y="${18 - h}" width="4" height="${h}" rx="0.5" fill="${fill}"/>`;
  }).join('');
  const labels = MOIS.map((l, i) => {
    const fill = i === highlightMonth ? 'var(--c-action)' : 'var(--t-disabled)';
    return `<text x="${i * 6 + 2}" y="26" text-anchor="middle" font-size="3.5" fill="${fill}">${l}</text>`;
  }).join('');
  return `<svg width="72" height="28" viewBox="0 0 72 28" class="inline-block">${bars}${labels}</svg>`;
}

function _renderClientSaisonnier(opps, monthOffset) {
  const mois = _getSaisonTargetMonth(monthOffset || 0);
  const MOIS_NOMS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
  const moisLabel = MOIS_NOMS[mois];
  const isThis = (monthOffset || 0) === 0;

  // Filtre recherche locale
  let filtered = opps;
  if (_saisonSearch) {
    const q = _saisonSearch.toLowerCase();
    filtered = opps.filter(o => o.cc.toLowerCase().includes(q) || o.nom.toLowerCase().includes(q) || o.code.toLowerCase().includes(q) || o.libelle.toLowerCase().includes(q));
  }

  const totalMontant = filtered.reduce((s, o) => s + o.montantPotentiel, 0);
  const isReachat = !_hasFullYear();

  // Toggle — masqué en mode réachat (pas de données full-year pour naviguer)
  const toggleHtml = isReachat
    ? `<div class="flex items-center gap-2 mb-3">
    <span class="text-sm font-bold t-inverse">📅 Opportunités de réachat</span>
    <span class="text-[10px] t-disabled ml-2">${filtered.length} opportunités · ${formatEuro(totalMontant)} potentiel</span>
   </div>`
    : `<div class="flex items-center gap-2 mb-3">
    <button onclick="window._laboSaisonToggle(0)" class="text-[10px] px-3 py-1 rounded-full border ${isThis ? 's-panel-inner font-bold t-inverse b-dark' : 's-card t-secondary b-light'}">${MOIS_NOMS[new Date().getMonth()]}</button>
    <button onclick="window._laboSaisonToggle(1)" class="text-[10px] px-3 py-1 rounded-full border ${!isThis ? 's-panel-inner font-bold t-inverse b-dark' : 's-card t-secondary b-light'}">${MOIS_NOMS[(new Date().getMonth() + 1) % 12]}</button>
    <span class="text-[10px] t-disabled ml-2">${filtered.length} opportunités · ${formatEuro(totalMontant)} potentiel</span>
  </div>`;

  // Search
  const searchHtml = `<div class="mb-3">
    <input type="text" value="${escapeHtml(_saisonSearch)}" oninput="window._laboSaisonFilter(this.value)" placeholder="Rechercher client ou article…" class="text-[11px] px-3 py-1.5 rounded-lg border b-light s-card t-primary w-full" style="max-width:320px">
  </div>`;

  // Mode label
  const modeLabel = isReachat
    ? `<div class="text-[9px] t-disabled mb-2 px-1">📊 Historique &lt; 12 mois — mode réachat : articles achetés précédemment mais pas ce mois-ci</div>`
    : '';

  if (!filtered.length) {
    return toggleHtml + searchHtml + '<p class="text-xs t-disabled p-4">Aucune opportunité détectée pour ce mois.</p>';
  }

  // Pagination
  const shown = filtered.slice(0, _saisonPage);
  const hasMore = filtered.length > _saisonPage;

  const rows = shown.map(o => {
    const badgeHtml = o.badge === 'actif'
      ? '<span class="text-[9px] px-1.5 py-0.5 rounded-full s-panel-inner border b-light" style="color:var(--c-ok)">Actif</span>'
      : o.badge === 'silencieux'
        ? '<span class="text-[9px] px-1.5 py-0.5 rounded-full s-panel-inner border b-light" style="color:var(--c-caution)">Silencieux</span>'
        : '<span class="text-[9px] px-1.5 py-0.5 rounded-full s-panel-inner border b-light" style="color:var(--c-danger)">Perdu</span>';
    const lastStr = o.daysSince != null ? o.daysSince + 'j' : '—';
    return `<tr class="text-[10px] b-light border-b hover:bg-gray-50 dark:hover:bg-gray-800/30">
      <td class="py-1.5 pr-2 font-mono t-inverse-muted">${_unikLink(o.cc)}</td>
      <td class="py-1.5 pr-2 t-primary">${escapeHtml(o.nom)}</td>
      <td class="py-1.5 pr-2 font-mono t-secondary">${escapeHtml(o.code)}</td>
      <td class="py-1.5 pr-2 t-primary">${escapeHtml(o.libelle)}</td>
      <td class="py-1.5 pr-2 t-secondary text-[10px]">${escapeHtml(o.famille)}</td>
      <td class="py-1.5 pr-2">${_miniRibbon(o.profile, mois)}</td>
      <td class="py-1.5 pr-2 text-right font-bold t-primary">${formatEuro(o.montantPotentiel)}</td>
      <td class="py-1.5 pr-2 text-right t-inverse-muted">${lastStr}</td>
      <td class="py-1.5 text-center">${badgeHtml}</td>
    </tr>`;
  }).join('');

  const table = `<div class="overflow-x-auto"><table class="w-full">
    <thead><tr class="text-[9px] t-disabled border-b b-light">
      <th class="text-left py-1 pr-2">Code client</th>
      <th class="text-left py-1 pr-2">Nom</th>
      <th class="text-left py-1 pr-2">Code article</th>
      <th class="text-left py-1 pr-2">Désignation</th>
      <th class="text-left py-1 pr-2">Famille</th>
      <th class="text-left py-1 pr-2">Saisonnalité</th>
      <th class="text-right py-1 pr-2">CA potentiel</th>
      <th class="text-right py-1 pr-2">Dernière cde</th>
      <th class="text-center py-1">Statut</th>
    </tr></thead><tbody>${rows}</tbody></table></div>`;

  const moreBtn = hasMore ? `<div class="text-center mt-2"><button onclick="window._laboSaisonMore()" class="text-[10px] px-4 py-1.5 rounded-lg border b-light s-card t-secondary hover:t-primary">Voir plus (${filtered.length - _saisonPage} restantes)</button></div>` : '';

  // Export buttons
  const exportHtml = `<div class="flex items-center gap-2 mt-3">
    <button onclick="window._laboSaisonCopyERP()" class="text-[10px] px-3 py-1.5 rounded-lg border b-light s-card t-secondary hover:t-primary">📋 Copier codes ERP</button>
    <button onclick="window._laboSaisonExportCSV()" class="text-[10px] px-3 py-1.5 rounded-lg border b-light s-card t-secondary hover:t-primary">📥 Export CSV</button>
  </div>`;

  return toggleHtml + searchHtml + modeLabel + table + moreBtn + exportHtml;
}

function _quickScanSaisonnier() {
  const mois = new Date().getMonth();

  // Use cached data if available
  if (_saisonData && _saisonMonth === mois) {
    return { n: _saisonData.length, ca: _saisonData.reduce((s, o) => s + o.montantPotentiel, 0) };
  }

  const _fullPDV = _S.ventesClientArticleFull?.size ? _S.ventesClientArticleFull : _S.ventesClientArticle;
  if (!_fullPDV?.size) return { n: 0, ca: 0 };

  // Estimation rapide avant premier clic — nb clients avec historique
  const n = Math.min(_fullPDV.size, 999);
  return { n: n > 0 ? n + '+' : 0, ca: 0 };
}

function _rerenderSaisonView() {
  const content = document.getElementById('laboTileContent');
  if (!content || content.classList.contains('hidden') || !_saisonData) return;
  const offset = _saisonMonth === _getSaisonTargetMonth(1) ? 1 : 0;
  const backBtn = '<span onclick="window._laboBackToTiles()" class="t-secondary text-[11px] cursor-pointer hover:underline mb-3 inline-block">\u2190 Tuiles</span>';
  content.innerHTML = backBtn + `<div class="s-card rounded-xl border p-3">${_renderClientSaisonnier(_saisonData, offset)}</div>`;
}

window._laboSaisonToggle = function(offset) {
  _saisonData = computeClientSaisonnier(offset);
  _saisonMonth = _getSaisonTargetMonth(offset);
  _saisonPage = 20;
  _saisonSearch = '';
  const content = document.getElementById('laboTileContent');
  if (!content) return;
  const backBtn = '<span onclick="window._laboBackToTiles()" class="t-secondary text-[11px] cursor-pointer hover:underline mb-3 inline-block">\u2190 Tuiles</span>';
  content.innerHTML = backBtn + `<div class="s-card rounded-xl border p-3">${_renderClientSaisonnier(_saisonData, offset)}</div>`;
};

window._laboSaisonFilter = function(val) {
  _saisonSearch = val || '';
  _saisonPage = 20;
  _rerenderSaisonView();
};

window._laboSaisonMore = function() {
  _saisonPage += 20;
  _rerenderSaisonView();
};

window._laboSaisonCopyERP = function() {
  if (!_saisonData?.length) return;
  let filtered = _saisonData;
  if (_saisonSearch) {
    const q = _saisonSearch.toLowerCase();
    filtered = _saisonData.filter(o => o.cc.toLowerCase().includes(q) || o.nom.toLowerCase().includes(q) || o.code.toLowerCase().includes(q) || o.libelle.toLowerCase().includes(q));
  }
  const codes = [...new Set(filtered.map(o => o.code))].join('\n');
  navigator.clipboard.writeText(codes).then(() => {
    const btn = document.querySelector('[onclick*="laboSaisonCopyERP"]');
    if (btn) { const orig = btn.textContent; btn.textContent = '✓ Copié'; setTimeout(() => btn.textContent = orig, 1500); }
  });
};

window._laboSaisonExportCSV = function() {
  if (!_saisonData?.length) return;
  let filtered = _saisonData;
  if (_saisonSearch) {
    const q = _saisonSearch.toLowerCase();
    filtered = _saisonData.filter(o => o.cc.toLowerCase().includes(q) || o.nom.toLowerCase().includes(q) || o.code.toLowerCase().includes(q) || o.libelle.toLowerCase().includes(q));
  }
  const sep = ';';
  const header = ['Code client', 'Nom client', 'Code article', 'Désignation', 'Famille', 'CA potentiel', 'Dernière cde (j)', 'Statut'].join(sep);
  const rows = filtered.map(o => [
    o.cc, `"${(o.nom || '').replace(/"/g, '""')}"`, o.code, `"${(o.libelle || '').replace(/"/g, '""')}"`,
    `"${(o.famille || '').replace(/"/g, '""')}"`, (o.montantPotentiel || 0).toFixed(2),
    o.daysSince != null ? o.daysSince : '', o.badge
  ].join(sep));
  const csv = '\uFEFF' + header + '\n' + rows.join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `PRISME_Saisonnalite_${_S.selectedMyStore || 'AG'}_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link); link.click(); document.body.removeChild(link);
  URL.revokeObjectURL(link.href);
};

// ═══════════════════════════════════════════════════════════════
// #8 — Squelette (badges + helpers pour rfSearch)
// ═══════════════════════════════════════════════════════════════

const CLASSIF_BADGE = {
  socle:      { label: 'Socle',      bg: '#dcfce7', color: '#166534', icon: '🟢' },
  implanter:  { label: 'Implanter',  bg: '#dbeafe', color: '#1e40af', icon: '🔵' },
  challenger: { label: 'Challenger', bg: '#fee2e2', color: '#991b1b', icon: '🔴' },
  potentiel:  { label: 'Potentiel',  bg: '#fef9c3', color: '#854d0e', icon: '🟡' },
  surveiller: { label: 'Surveiller', bg: '#f1f5f9', color: '#475569', icon: '👁' }
};

// Labels orientés action pour le Radar Famille (classifGlobal par famille)
const CLASSIF_BADGE_FAMILLE = {
  socle:      { label: 'Bien couverte',  bg: '#dcfce7', color: '#166534', icon: '🟢' },
  implanter:  { label: 'À développer',   bg: '#dbeafe', color: '#1e40af', icon: '🔵' },
  challenger: { label: 'À retravailler', bg: '#fee2e2', color: '#991b1b', icon: '🔴' },
  potentiel:  { label: 'Potentiel',      bg: '#fef9c3', color: '#854d0e', icon: '🟡' },
  surveiller: { label: 'À surveiller',   bg: '#f1f5f9', color: '#475569', icon: '👁'  }
};

function _sourceBar(a) {
  const s = a.sources;
  const seg = (key, color, label) =>
    `<span title="${label}" style="display:inline-block;width:14px;height:10px;border-radius:2px;margin-right:1px;background:${s.has(key) ? color : 'var(--s-muted,#e2e8f0)'};opacity:${s.has(key) ? 1 : 0.2}"></span>`;
  return `<span class="inline-flex items-center">
    ${seg('reseau', 'var(--c-info,#3b82f6)', 'Réseau')}
    ${seg('chalandise', 'var(--c-ok,#22c55e)', 'Chalandise')}
    ${seg('horsZone', 'var(--c-caution,#f59e0b)', 'Hors-zone')}
    ${seg('livraisons', 'var(--c-action,#8b5cf6)', 'Livraisons')}
  </span>`;
}

function _classifBadge(classif) {
  const b = CLASSIF_BADGE[classif];
  if (!b) return '';
  return `<span class="text-[8px] px-1.5 py-0.5 rounded-full font-bold" style="background:${b.bg};color:${b.color}">${b.icon} ${b.label}</span>`;
}



// ═══════════════════════════════════════════════════════════════
// MA CLIENTÈLE — Cartographie métiers + drill-down
// ═══════════════════════════════════════════════════════════════

let _clPage = 20;
let _clDistKm = null; // null = no filter

function _quickScanClientele() {
  if (!_S.chalandiseReady || !_S.clientsByMetier?.size) return { n: '?', top: '', nbClients: 0 };
  const topMetier = [..._S.clientsByMetier.entries()]
    .filter(([m]) => !!m)
    .sort((a, b) => b[1].size - a[1].size)[0];
  return {
    n: [..._S.clientsByMetier.keys()].filter(m => !!m).length,
    top: topMetier ? topMetier[0] : '',
    nbClients: _S.chalandiseData.size
  };
}

function _couvertureBar(pct) {
  const color = pct >= 70 ? 'var(--c-ok,#22c55e)' : pct >= 40 ? 'var(--c-caution,#f59e0b)' : 'var(--c-danger,#ef4444)';
  return `<div class="flex items-center gap-1"><div style="width:40px;height:6px;border-radius:3px;background:var(--s-muted,#e2e8f0)"><div style="width:${Math.min(pct,100)}%;height:100%;border-radius:3px;background:${color}"></div></div><span class="text-[10px] font-bold" style="color:${color}">${pct}%</span></div>`;
}

function _renderMaClientele(data) {
  if (!data) return '<div class="text-center py-8 t-disabled text-sm">Chargez la Zone de Chalandise pour activer cette analyse.</div>';

  if (data.level === 1) return _renderClienteleL1(data);
  return _renderClienteleL2(data);
}

function _distSliderHtml() {
  const hasDist = _S.chalandiseData && [..._S.chalandiseData.values()].some(i => i.distanceKm != null);
  if (!hasDist) return '';
  const val = _clDistKm || 100;
  const label = (!_clDistKm || _clDistKm >= 100) ? 'Tous' : _clDistKm + ' km';
  return `<div class="flex items-center gap-3 mb-4 px-1">
    <span class="text-[11px] font-bold t-primary">📍 Rayon :</span>
    <input type="range" min="5" max="100" step="5" value="${val}" oninput="window._laboClienteleDistChange(this.value)" class="flex-1" style="max-width:200px;accent-color:var(--c-action,#8b5cf6)">
    <span class="text-[11px] font-bold c-action min-w-[40px]" id="clDistLabel">${label}</span>
  </div>`;
}

function _renderClienteleL1(data) {
  // Répartition bar
  const totalCA = data.totalCA || 1;
  const COLORS = ['#3b82f6','#22c55e','#f59e0b','#ef4444','#8b5cf6','#06b6d4','#ec4899','#84cc16','#f97316','#6366f1'];
  const top8 = data.metiers.slice(0, 8);
  const otherCA = data.metiers.slice(8).reduce((s, m) => s + m.caTotal, 0);
  let barHtml = '<div class="flex rounded-lg overflow-hidden h-5 mb-4">';
  top8.forEach((m, i) => {
    const w = Math.max((m.caTotal / totalCA * 100), 0.5);
    barHtml += `<div title="${escapeHtml(m.metier)} — ${formatEuro(m.caTotal)}" style="width:${w}%;background:${COLORS[i % COLORS.length]};min-width:2px" class="hover:opacity-80 cursor-pointer" onclick="window._laboClienteleDrill('${escapeHtml(m.metier)}')"></div>`;
  });
  if (otherCA > 0) barHtml += `<div title="Autres — ${formatEuro(otherCA)}" style="width:${Math.max(otherCA/totalCA*100,0.5)}%;background:#94a3b8;min-width:2px"></div>`;
  barHtml += '</div>';

  // Table
  const rows = data.metiers.map((m, i) => {
    const color = COLORS[i % COLORS.length];
    const pctCA = totalCA > 0 ? (m.caTotal / totalCA * 100).toFixed(1) : '0.0';
    return `<tr class="border-b b-light hover:s-hover text-[11px] cursor-pointer" onclick="window._laboClienteleDrill('${escapeHtml(m.metier)}')">
      <td class="py-2 px-2"><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${i < 8 ? color : '#94a3b8'};margin-right:4px"></span>${escapeHtml(m.metier)}</td>
      <td class="py-2 px-2 text-right">${m.nbClients}</td>
      <td class="py-2 px-2 text-right font-bold">${m.nbActifs}</td>
      <td class="py-2 px-2 text-right t-disabled">${m.nbProspects}</td>
      <td class="py-2 px-2 text-right font-bold c-action">${formatEuro(m.caTotal)}</td>
      <td class="py-2 px-2 text-right t-disabled">${pctCA}%</td>
      <td class="py-2 px-2">${_couvertureBar(m.couverture)}</td>
    </tr>`;
  }).join('');

  const csvBtn = `<button onclick="event.stopPropagation();window._laboClienteleExportL1()" class="text-[10px] px-3 py-1.5 rounded-lg border b-light s-card t-secondary hover:t-primary">📥 CSV</button>`;

  return `<div class="flex items-center justify-between mb-3">
    <div>
      <h3 class="font-extrabold text-sm t-primary">🎯 Ma Clientèle${_clDistKm && _clDistKm < 100 ? ' — ' + _clDistKm + ' km' : ''} — ${data.nbMetiers} métiers · ${data.totalClients} clients · ${formatEuro(data.totalCA)}</h3>
      <p class="text-[10px] t-disabled mt-0.5">${data.totalActifs} actifs · ${data.totalClients - data.totalActifs} prospects · Cliquez sur un métier pour explorer</p>
    </div>
    ${csvBtn}
  </div>
  ${_distSliderHtml()}
  ${barHtml}
  <div class="overflow-x-auto">
    <table class="min-w-full">
      <thead class="s-panel-inner t-inverse text-[10px]">
        <tr>
          <th class="py-1.5 px-2 text-left">Métier</th>
          <th class="py-1.5 px-2 text-right">Clients</th>
          <th class="py-1.5 px-2 text-right">Actifs</th>
          <th class="py-1.5 px-2 text-right">Prospects</th>
          <th class="py-1.5 px-2 text-right">CA</th>
          <th class="py-1.5 px-2 text-right">% CA</th>
          <th class="py-1.5 px-2">Couverture</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  </div>`;
}

function _renderClienteleL2(data) {
  const backMetier = `<span onclick="window._laboClienteleBack()" class="t-secondary text-[11px] cursor-pointer hover:underline mb-2 inline-block">← Tous les métiers</span>`;

  // Header
  let hdr = `${backMetier}
  <div class="flex items-center justify-between mb-3">
    <div>
      <h3 class="font-extrabold text-sm t-primary">🎯 ${escapeHtml(data.metier)} — ${data.nbClients} clients · ${data.nbActifs} actifs · ${data.nbProspects} prospects</h3>
      <p class="text-[10px] t-disabled mt-0.5">Couverture stock : ${_couvertureBar(data.couvertureGlobale)} (${data.nbArticlesEnStock}/${data.nbArticlesDistincts} articles en rayon)</p>
    </div>
    <button onclick="window._laboClienteleExportL2()" class="text-[10px] px-3 py-1.5 rounded-lg border b-light s-card t-secondary hover:t-primary">📥 CSV</button>
  </div>
  ${_distSliderHtml()}`;

  // Univers accordions
  let univHtml = '';
  data.univers.forEach((u, ui) => {
    const pctCA = data.caTotal > 0 ? (u.ca / data.caTotal * 100).toFixed(0) : '0';
    let famHtml = '';
    u.familles.forEach((f, fi) => {
      // Articles table (top 20 + voir plus)
      const shown = f.articles.slice(0, 20);
      const hasMoreArt = f.articles.length > 20;
      const artRows = shown.map(a => {
        let stockBadge;
        if (a.enStock) stockBadge = `<span class="text-[8px] px-1.5 py-0.5 rounded-full font-bold" style="background:#dcfce7;color:#166534">En stock (${a.stockActuel})</span>`;
        else if (a.rupture) stockBadge = '<span class="text-[8px] px-1.5 py-0.5 rounded-full font-bold" style="background:#fef3c7;color:#92400e">Rupture (0)</span>';
        else stockBadge = '<span class="text-[8px] px-1.5 py-0.5 rounded-full font-bold" style="background:#fee2e2;color:#991b1b">Absent</span>';
        return `<tr class="border-b b-light hover:s-hover text-[11px]">
          <td class="py-1 px-2 font-mono">${_copyCodeBtn(a.code)}</td>
          <td class="py-1 px-2 max-w-[200px] truncate" title="${escapeHtml(a.libelle)}">${escapeHtml(a.libelle)}</td>
          <td class="py-1 px-2 text-right font-bold c-action">${formatEuro(a.ca)}</td>
          <td class="py-1 px-2 text-right">${a.nbClients}</td>
          <td class="py-1 px-2 text-center">${stockBadge}</td>
        </tr>`;
      }).join('');
      const moreArt = hasMoreArt ? `<div class="px-3 py-1.5 text-[10px] t-disabled cursor-pointer hover:underline" onclick="window._laboClienteleMoreArt(this, '${escapeHtml(data.metier)}', ${ui}, ${fi})">… voir les ${f.articles.length - 20} suivants</div>` : '';

      famHtml += `<details class="border-b b-light ml-4"${fi === 0 ? ' open' : ''}>
        <summary class="flex items-center justify-between px-3 py-2 cursor-pointer select-none hover:s-hover text-[11px]">
          <div class="flex items-center gap-2">
            <span class="acc-arrow t-disabled text-[9px]">▶</span>
            <span class="font-bold t-primary">${escapeHtml(f.famName)} (${escapeHtml(f.famCode)})</span>
            <span class="t-disabled">${formatEuro(f.ca)}</span>
          </div>
          <div class="flex items-center gap-2">
            <span class="text-[9px] t-disabled">${f.nbEnStock}/${f.nbTotal} en stock</span>
            ${_couvertureBar(f.couverture)}
          </div>
        </summary>
        <div class="overflow-x-auto">
          <table class="min-w-full">
            <thead class="text-[9px] t-disabled">
              <tr><th class="py-1 px-2 text-left">Code</th><th class="py-1 px-2 text-left">Libellé</th><th class="py-1 px-2 text-right">CA</th><th class="py-1 px-2 text-right">Clients</th><th class="py-1 px-2 text-center">Stock</th></tr>
            </thead>
            <tbody id="clFamArts_${ui}_${fi}">${artRows}</tbody>
          </table>
          ${moreArt}
        </div>
      </details>`;
    });

    univHtml += `<details class="border-b b-light"${ui === 0 ? ' open' : ''}>
      <summary class="flex items-center justify-between px-4 py-3 cursor-pointer select-none hover:s-hover">
        <div class="flex items-center gap-2">
          <span class="acc-arrow t-disabled">▶</span>
          <span class="font-bold text-[12px] t-primary">${escapeHtml(u.name)}</span>
          <span class="text-[9px] t-disabled">${pctCA}% du CA · ${u.familles.length} familles</span>
        </div>
        <span class="text-[11px] font-bold t-primary">${formatEuro(u.ca)}</span>
      </summary>
      <div>${famHtml}</div>
    </details>`;
  });

  // Clients block
  const top20 = data.clients.slice(0, _clPage);
  const hasMoreCli = data.clients.length > _clPage;
  const cliRows = top20.map(c => {
    const statusBadge = c.isActif
      ? '<span class="text-[8px] px-1 py-0.5 rounded-full" style="background:#dcfce7;color:#166534">Actif</span>'
      : '<span class="text-[8px] px-1 py-0.5 rounded-full" style="background:#f1f5f9;color:#64748b">Prospect</span>';
    const ccSafe = (c.cc || '').replace(/'/g, "\\'");
    return `<tr class="border-b b-light hover:s-hover text-[11px] cursor-pointer" onclick="if(window.openClient360)window.openClient360('${ccSafe}','labo')">
      <td class="py-1.5 px-2 max-w-[180px] truncate font-bold" title="${escapeHtml(c.nom)}">${escapeHtml(c.nom)}</td>
      <td class="py-1.5 px-2 text-right font-bold c-action">${formatEuro(c.ca)}</td>
      <td class="py-1.5 px-2">${escapeHtml(c.cp)}</td>
      <td class="py-1.5 px-2">${escapeHtml(c.commercial)}</td>
      <td class="py-1.5 px-2 text-center">${statusBadge}</td>
      <td class="py-1.5 px-2 text-right">${c.nbFamilles > 0 ? c.nbFamilles + ' fam.' : '—'}</td>
    </tr>`;
  }).join('');
  const moreCli = hasMoreCli ? `<div class="px-3 py-2 text-[10px] t-disabled cursor-pointer hover:underline" onclick="window._laboClienteleMoreCli()">… voir les ${data.clients.length - _clPage} suivants</div>` : '';

  const cliBlock = `<details class="border-b b-light mt-4">
    <summary class="flex items-center justify-between px-4 py-3 cursor-pointer select-none hover:s-hover">
      <div class="flex items-center gap-2">
        <span class="acc-arrow t-disabled">▶</span>
        <span class="font-bold text-[12px] t-primary">👥 ${data.nbClients} clients ${escapeHtml(data.metier)}</span>
        <span class="text-[9px] t-disabled">Top ${Math.min(_clPage, data.clients.length)} par CA</span>
      </div>
    </summary>
    <div class="overflow-x-auto">
      <table class="min-w-full">
        <thead class="s-panel-inner t-inverse text-[10px]">
          <tr><th class="py-1.5 px-2 text-left">Nom</th><th class="py-1.5 px-2 text-right">CA</th><th class="py-1.5 px-2">CP</th><th class="py-1.5 px-2">Commercial</th><th class="py-1.5 px-2 text-center">Statut</th><th class="py-1.5 px-2 text-right">Familles</th></tr>
        </thead>
        <tbody id="clClientRows">${cliRows}</tbody>
      </table>
      <div id="clClientMore">${moreCli}</div>
    </div>
  </details>`;

  return hdr + univHtml + cliBlock;
}

// ── Handlers Ma Clientèle ──

window._laboClienteleDrill = function(metier) {
  _clPage = 20;
  const data = computeMaClientele(metier, _clDistKm);
  _S._clienteleMetier = metier;
  _S._clienteleData = data;
  const content = document.getElementById('laboTileContent');
  if (!content) return;
  const backBtn = '<span onclick="window._laboBackToTiles()" class="t-secondary text-[11px] cursor-pointer hover:underline mb-3 inline-block">\u2190 Tuiles</span>';
  content.innerHTML = backBtn + `<div class="s-card rounded-xl border p-3">${_renderMaClientele(data)}</div>`;
};

window._laboClienteleBack = function() {
  _S._clienteleMetier = null;
  const data = computeMaClientele(null, _clDistKm);
  _S._clienteleData = data;
  const content = document.getElementById('laboTileContent');
  if (!content) return;
  const backBtn = '<span onclick="window._laboBackToTiles()" class="t-secondary text-[11px] cursor-pointer hover:underline mb-3 inline-block">\u2190 Tuiles</span>';
  content.innerHTML = backBtn + `<div class="s-card rounded-xl border p-3">${_renderMaClientele(data)}</div>`;
};

window._laboClienteleDistChange = function(val) {
  const v = parseInt(val) || 100;
  _clDistKm = v >= 100 ? null : v;
  const lbl = document.getElementById('clDistLabel');
  if (lbl) lbl.textContent = _clDistKm ? _clDistKm + ' km' : 'Tous';
  // Re-render current view
  const metier = _S._clienteleMetier;
  const data = computeMaClientele(metier || null, _clDistKm);
  _S._clienteleData = data;
  const content = document.getElementById('laboTileContent');
  if (!content) return;
  const backBtn = '<span onclick="window._laboBackToTiles()" class="t-secondary text-[11px] cursor-pointer hover:underline mb-3 inline-block">\u2190 Tuiles</span>';
  content.innerHTML = backBtn + `<div class="s-card rounded-xl border p-3">${_renderMaClientele(data)}</div>`;
};

window._laboClienteleMoreCli = function() {
  _clPage += 20;
  const data = _S._clienteleData;
  if (!data || data.level !== 2) return;
  const top = data.clients.slice(0, _clPage);
  const hasMore = data.clients.length > _clPage;
  const tbody = document.getElementById('clClientRows');
  const moreEl = document.getElementById('clClientMore');
  if (!tbody) return;
  // Re-render rows
  tbody.innerHTML = top.map(c => {
    const statusBadge = c.isActif
      ? '<span class="text-[8px] px-1 py-0.5 rounded-full" style="background:#dcfce7;color:#166534">Actif</span>'
      : '<span class="text-[8px] px-1 py-0.5 rounded-full" style="background:#f1f5f9;color:#64748b">Prospect</span>';
    const ccSafe = (c.cc || '').replace(/'/g, "\\'");
    return `<tr class="border-b b-light hover:s-hover text-[11px] cursor-pointer" onclick="if(window.openClient360)window.openClient360('${ccSafe}','labo')">
      <td class="py-1.5 px-2 max-w-[180px] truncate font-bold" title="${escapeHtml(c.nom)}">${escapeHtml(c.nom)}</td>
      <td class="py-1.5 px-2 text-right font-bold c-action">${formatEuro(c.ca)}</td>
      <td class="py-1.5 px-2">${escapeHtml(c.cp)}</td>
      <td class="py-1.5 px-2">${escapeHtml(c.commercial)}</td>
      <td class="py-1.5 px-2 text-center">${statusBadge}</td>
      <td class="py-1.5 px-2 text-right">${c.nbFamilles > 0 ? c.nbFamilles + ' fam.' : '—'}</td>
    </tr>`;
  }).join('');
  if (moreEl) moreEl.innerHTML = hasMore ? `<div class="px-3 py-2 text-[10px] t-disabled cursor-pointer hover:underline" onclick="window._laboClienteleMoreCli()">… voir les ${data.clients.length - _clPage} suivants</div>` : '';
};

window._laboClienteleMoreArt = function(el, metier, ui, fi) {
  const data = _S._clienteleData;
  if (!data || data.level !== 2) return;
  const u = data.univers[ui];
  if (!u) return;
  const f = u.familles[fi];
  if (!f) return;
  const tbody = document.getElementById(`clFamArts_${ui}_${fi}`);
  if (!tbody) return;
  // Render all articles
  tbody.innerHTML = f.articles.map(a => {
    let stockBadge;
    if (a.enStock) stockBadge = `<span class="text-[8px] px-1.5 py-0.5 rounded-full font-bold" style="background:#dcfce7;color:#166534">En stock (${a.stockActuel})</span>`;
    else if (a.rupture) stockBadge = '<span class="text-[8px] px-1.5 py-0.5 rounded-full font-bold" style="background:#fef3c7;color:#92400e">Rupture (0)</span>';
    else stockBadge = '<span class="text-[8px] px-1.5 py-0.5 rounded-full font-bold" style="background:#fee2e2;color:#991b1b">Absent</span>';
    return `<tr class="border-b b-light hover:s-hover text-[11px]">
      <td class="py-1 px-2 font-mono">${_copyCodeBtn(a.code)}</td>
      <td class="py-1 px-2 max-w-[200px] truncate" title="${escapeHtml(a.libelle)}">${escapeHtml(a.libelle)}</td>
      <td class="py-1 px-2 text-right font-bold c-action">${formatEuro(a.ca)}</td>
      <td class="py-1 px-2 text-right">${a.nbClients}</td>
      <td class="py-1 px-2 text-center">${stockBadge}</td>
    </tr>`;
  }).join('');
  if (el && el.parentNode) el.parentNode.removeChild(el);
};

window._laboClienteleExportL1 = function() {
  const data = _S._clienteleData;
  if (!data || data.level !== 1) return;
  const sep = ';';
  const header = ['Métier','Clients','Actifs','Prospects','CA','Couverture %'].join(sep);
  const rows = data.metiers.map(m => [
    `"${m.metier}"`, m.nbClients, m.nbActifs, m.nbProspects, m.caTotal.toFixed(2), m.couverture
  ].join(sep));
  const csv = '\uFEFF' + header + '\n' + rows.join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `PRISME_Clientele_${_S.selectedMyStore || 'AG'}_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link); link.click(); document.body.removeChild(link);
  URL.revokeObjectURL(link.href);
};

window._laboClienteleExportL2 = function() {
  const data = _S._clienteleData;
  if (!data || data.level !== 2) return;
  const sep = ';';
  const header = ['Univers','Famille','Code','Libellé','CA','Nb Clients','En Stock','Stock Actuel'].join(sep);
  const rows = [];
  for (const u of data.univers) {
    for (const f of u.familles) {
      for (const a of f.articles) {
        rows.push([
          `"${u.name}"`, `"${f.famName}"`, a.code, `"${(a.libelle || '').replace(/"/g, '""')}"`,
          a.ca.toFixed(2), a.nbClients, a.enStock ? 'Oui' : a.rupture ? 'Rupture' : 'Non',
          a.stockActuel ?? ''
        ].join(sep));
      }
    }
  }
  const csv = '\uFEFF' + header + '\n' + rows.join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `PRISME_Clientele_${escapeHtml(data.metier)}_${_S.selectedMyStore || 'AG'}_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link); link.click(); document.body.removeChild(link);
  URL.revokeObjectURL(link.href);
};

// ═══════════════════════════════════════════════════════════════
// Shuffle helper
// ═══════════════════════════════════════════════════════════════

function _shuffleArray(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ═══════════════════════════════════════════════════════════════
// Render Labo Tab — Tile-based UI
// ═══════════════════════════════════════════════════════════════

export function renderLaboTab() {
  const el = document.getElementById('tabLabo');
  if (!el) return;

  const hasChalandise = _S.chalandiseData?.size > 0;
  const hasConsomme = _S.ventesClientArticle?.size > 0 || _S.ventesClientArticleFull?.size > 0;

  if (!hasChalandise || !hasConsomme) {
    el.innerHTML = `<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:300px;gap:16px;color:var(--t-muted)">
      <div style="font-size:2rem">🧪</div>
      <div style="font-size:1.1rem;font-weight:600">Labo — données insuffisantes</div>
      <div style="font-size:0.9rem;max-width:400px;text-align:center">Chargez le fichier <strong>Consommé</strong> et la <strong>Zone de Chalandise</strong> pour accéder aux croisements.</div>
    </div>`;
    return;
  }

  // Render tile grid
  _renderTileGrid(el);
}

// ── Tooltip definitions ──
const LABO_TOOLTIPS = {
  sil: `<strong>Commercial × Silencieux</strong><br>
    Croise la liste des commerciaux (chalandise) avec les clients silencieux (30-60j) et perdus (&gt;60j).<br>
    <em>Source :</em> chalandise.commercial + clientLastOrder (consommé MAGASIN).<br>
    <em>CA en jeu :</em> somme du CA PDV historique des clients concernés.`,
  fam: `<strong>Famille × Commercial</strong><br>
    Pour chaque commercial, identifie les familles achetées par ses clients vs. les familles attendues (inférées depuis le réseau).<br>
    <em>Source :</em> chalandise.metier × ventesClientArticle × FAMILLE_LOOKUP.<br>
    <em>Opportunité :</em> nb clients du métier sans achat dans la famille attendue.`,
  saison: `<strong>Client × Saisonnalité</strong><br>
    Croise l'historique d'achat de chaque client avec le calendrier saisonnier des familles.<br>
    <em>Source :</em> articleMonthlySales × seasonalIndex × ventesClientArticle.<br>
    <em>Opportunité :</em> clients qui achètent habituellement ce mois mais pas encore cette année.`,
  clientele: `<strong>Ma Clientèle — Cartographie métiers</strong><br>
    Visualise la répartition de vos clients par métier et leur poids dans votre CA.<br>
    <em>Cliquez sur un métier</em> pour descendre : Univers → Famille → Articles.<br>
    Pour chaque article : est-il en stock ? En rupture ? Absent ?<br><br>
    <em>Source :</em> chalandise (métier, CP) × consommé (achats) × stock (rayon).<br>
    <em>Objectif :</em> adapter votre rayon à votre clientèle locale.`,
  prisme: `<strong>Générer mon PRISME</strong><br>
    Affiche 6 analyses aléatoires parmi les requêtes en langage naturel disponibles.<br>
    Chaque puce est cliquable et lance l'analyse correspondante.`,
  rayon: `<strong>Mon Rayon — Diagnostic famille</strong><br>
    Tapez un nom de famille, sous-famille, ou code famille.<br>
    PRISME affiche en un écran :<br>
    📊 Votre rayon (stock, ABC/FMR, couverture)<br>
    🔵 À implanter (vendus par le réseau, absents chez vous)<br>
    🔴 À challenger (dormants, surstock)<br>
    👥 Vos clients (qui achète cette famille)<br>
    📋 Le catalogue complet (par sous-famille, par marque)<br><br>
    <em>Source :</em> stock × catalogue × consommé × chalandise × réseau.`,
  radar: `<strong>Radar Famille — Vue 360° par famille</strong><br>
    Fusionne Arbitrage rayon + Ma Clientèle + Mon Rayon, organisé par famille.<br>
    Pour chaque famille :<br>
    🟢 Socle · 🔵 À implanter · 🔴 Challenger · 🟡 Potentiel<br>
    📊 Couverture catalogue · 👥 Clients · Sources actives<br><br>
    Cliquez sur une famille pour le diagnostic complet en 4 onglets.<br>
    <em>Source :</em> Arbitrage rayon (4 sources) × consommé × catalogue × chalandise.`
};

const _infoIcon = (key) => LABO_TOOLTIPS[key]
  ? `<span class="labo-info-tip" onclick="event.stopPropagation()">ⓘ<span class="labo-info-bubble">${LABO_TOOLTIPS[key]}</span></span>`
  : '';

function _renderTileGrid(el) {
  const silScan = _quickScanSilencieux();
  const famScan = _quickScanFamille();
  const saisonScan = _quickScanSaisonnier();

  const silSubtitle = `${silScan.n} clients à risque · ${formatEuro(silScan.ca)} en jeu`;
  const famSubtitle = famScan.n === '?' ? 'Cliquez pour analyser' : `${famScan.n} opportunités · ${formatEuro(famScan.ca)} potentiel`;
  const saisonSubtitle = saisonScan.n !== 0 ? `${saisonScan.n} opportunités ce mois` : 'Aucune opportunité ce mois';
  const clScan = _quickScanClientele();
  const clSubtitle = clScan.n === '?' ? 'Nécessite la chalandise' : `${clScan.n} métiers · ${clScan.nbClients} clients`;

  el.innerHTML = `<div id="laboTileGrid" class="grid grid-cols-1 sm:grid-cols-2 gap-3">
    <div class="s-card rounded-xl border p-4 cursor-pointer hover:border-[var(--c-action)] transition-all relative" onclick="window._laboOpenTile('sil')">
      ${_infoIcon('sil')}
      <div class="text-lg mb-1">🔀</div>
      <div class="text-[13px] font-bold t-primary mb-1">Commercial × Silencieux</div>
      <div class="text-[10px] t-secondary" id="laboTileSilSub">${silSubtitle}</div>
    </div>
    <div class="s-card rounded-xl border p-4 cursor-pointer hover:border-[var(--c-action)] transition-all relative" onclick="window._laboOpenTile('fam')">
      ${_infoIcon('fam')}
      <div class="text-lg mb-1">🧬</div>
      <div class="text-[13px] font-bold t-primary mb-1">Famille × Commercial</div>
      <div class="text-[10px] t-secondary" id="laboTileFamSub">${famSubtitle}</div>
    </div>
    <div class="s-card rounded-xl border p-4 cursor-pointer hover:border-[var(--c-action)] transition-all relative" onclick="window._laboOpenTile('saison')">
      ${_infoIcon('saison')}
      <div class="text-lg mb-1">🌡️</div>
      <div class="text-[13px] font-bold t-primary mb-0.5">Client × Saisonnalité</div>
      <div class="text-[10px] t-disabled mb-1">Familles × Saisons</div>
      <div class="text-[10px] t-secondary" id="laboTileSaisonSub">${saisonSubtitle}</div>
    </div>
    <div class="s-card rounded-xl border p-4 cursor-pointer hover:border-[var(--c-action)] transition-all relative" onclick="window._laboOpenTile('clientele')">
      ${_infoIcon('clientele')}
      <div class="text-lg mb-1">🎯</div>
      <div class="text-[13px] font-bold t-primary mb-1">Ma Clientèle</div>
      <div class="text-[10px] t-secondary" id="laboTileClSub">${clSubtitle}</div>
    </div>
    <div class="s-card rounded-xl border p-4 cursor-pointer hover:border-[var(--c-action)] transition-all relative" onclick="window._laboOpenTile('prisme')">
      ${_infoIcon('prisme')}
      <div class="text-lg mb-1">🎲</div>
      <div class="text-[13px] font-bold t-primary mb-1">Générer mon PRISME</div>
      <div class="text-[10px] t-secondary">6 analyses aléatoires</div>
    </div>
    <div class="s-card rounded-xl border p-4 cursor-pointer hover:border-[var(--c-action)] transition-all relative" onclick="window._laboOpenTile('rayon')">
      ${_infoIcon('rayon')}
      <div class="text-lg mb-1">🔍</div>
      <div class="text-[13px] font-bold t-primary mb-1">Mon Rayon</div>
      <div class="text-[10px] t-secondary">Diagnostic complet par famille</div>
    </div>
    <div class="s-card rounded-xl border p-4 cursor-pointer hover:border-[var(--c-action)] transition-all relative" onclick="window._laboOpenTile('radar')">
      ${_infoIcon('radar')}
      <div class="text-lg mb-1">🔭</div>
      <div class="text-[13px] font-bold t-primary mb-1">Radar Famille</div>
      <div class="text-[10px] t-secondary">Vue 360° par famille</div>
    </div>
  </div>
  <div id="laboTileContent" class="hidden"></div>`;
}

// ═══════════════════════════════════════════════════════════════
// Tile open / back handlers
// ═══════════════════════════════════════════════════════════════

window._laboOpenTile = function(tile) {
  const grid = document.getElementById('laboTileGrid');
  const content = document.getElementById('laboTileContent');
  if (!grid || !content) return;

  grid.classList.add('hidden');
  content.classList.remove('hidden');

  const backBtn = '<span onclick="window._laboBackToTiles()" class="t-secondary text-[11px] cursor-pointer hover:underline mb-3 inline-block">\u2190 Tuiles</span>';

  if (tile === 'sil') {
    const silencieuxData = computeCommercialSilencieux();
    _S._laboSilData = silencieuxData;
    content.innerHTML = backBtn + `<div class="s-card rounded-xl border p-3">${_renderCommercialSilencieux(silencieuxData)}</div>`;
  } else if (tile === 'fam') {
    const familleData = computeFamilleCommercial();
    _S._laboFamData = familleData;
    content.innerHTML = backBtn + `<div class="s-card rounded-xl border p-3">${_renderFamilleCommercial(familleData)}</div>`;
  } else if (tile === 'saison') {
    _saisonData = computeClientSaisonnier(0);
    _saisonMonth = _getSaisonTargetMonth(0);
    _saisonPage = 20;
    _saisonSearch = '';
    content.innerHTML = backBtn + `<div class="s-card rounded-xl border p-3">${_renderClientSaisonnier(_saisonData, 0)}</div>`;
  } else if (tile === 'clientele') {
    _S._clienteleMetier = null;
    _clDistKm = null;
    const data = computeMaClientele(null, _clDistKm);
    _S._clienteleData = data;
    content.innerHTML = backBtn + `<div class="s-card rounded-xl border p-3">${_renderMaClientele(data)}</div>`;
  } else if (tile === 'rayon') {
    content.innerHTML = backBtn + `<div class="s-card rounded-xl border p-3">
      <div class="relative max-w-lg mx-auto mb-4">
        <input type="text" id="rayonSearchInput"
          placeholder="🔍 Famille, sous-famille ou code… (ex: lunettes, E07, fixation)"
          class="w-full px-4 py-3 text-sm rounded-xl border-2 b-default s-card t-primary focus:border-[var(--c-action)] focus:outline-none"
          autocomplete="off">
        <div id="rayonSearchResults" class="hidden absolute left-0 right-0 top-full mt-1 s-card border rounded-xl shadow-xl overflow-y-auto z-50" style="max-height:320px"></div>
      </div>
      <div id="rayonContent"></div>
    </div>`;
    _initRayonSearch();
  } else if (tile === 'prisme') {
    const picked = _shuffleArray(_NL_CHIPS).slice(0, 6);
    const chips = picked.map(c => {
      const safeQ = c.q.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
      return `<button onclick="window._laboRunChip('${safeQ}')" class="text-[10px] px-3 py-1.5 rounded-full s-card border b-light t-secondary hover:t-primary hover:border-[var(--c-action)] transition-colors">${escapeHtml(c.label)}</button>`;
    }).join('');
    content.innerHTML = backBtn +
      `<div class="flex flex-wrap gap-2 mb-4">${chips}</div>` +
      `<div id="laboPrismeResults"></div>`;
  } else if (tile === 'radar') {
    _rfFilterClassif = '';
    _rfOpenFam = null;
    _rfDetailTab = 'rayon';
    const data = computeRadarFamille();
    _S._rfData = data;
    content.innerHTML = backBtn + `<div class="s-card rounded-xl border p-3">${_renderRadarFamille(data)}</div>`;
    _initRfSearch();
  }
};

window._laboBackToTiles = function() {
  const el = document.getElementById('tabLabo');
  if (!el) return;
  _renderTileGrid(el);
};

window._laboRunChip = function(q) {
  const resultsEl = document.getElementById('laboPrismeResults');
  if (!resultsEl) return;
  // Import _nlInterpret via window (exposed by ui.js)
  let result = null;
  if (typeof window._nlInterpret === 'function') {
    result = window._nlInterpret(q);
  } else if (typeof window._cematinSearch === 'function') {
    window._cematinSearch(q);
    return;
  }
  if (!result) { resultsEl.innerHTML = '<p class="text-xs t-disabled p-2">Aucun résultat pour cette requête.</p>'; return; }
  resultsEl.innerHTML = `<div class="s-card rounded-xl border p-3 mt-2">
    <div class="flex items-center justify-between mb-2">
      <span class="text-[11px] font-bold t-primary">${result.title}</span>
    </div>
    ${result.html}
    ${result.footer ? `<div class="mt-2 text-[9px] t-disabled">${result.footer}</div>` : ''}
  </div>`;
};

// ═══════════════════════════════════════════════════════════════
// Update tile subtitles (called after data parse)
// ═══════════════════════════════════════════════════════════════

export function updateLaboTiles() {
  const grid = document.getElementById('laboTileGrid');
  if (!grid) return; // tiles not visible

  const silScan = _quickScanSilencieux();
  const famScan = _quickScanFamille();

  const silSub = document.getElementById('laboTileSilSub');
  if (silSub) silSub.textContent = `${silScan.n} clients à risque · ${formatEuro(silScan.ca)} en jeu`;

  const famSub = document.getElementById('laboTileFamSub');
  if (famSub) famSub.textContent = famScan.n === '?' ? 'Cliquez pour analyser' : `${famScan.n} opportunités · ${formatEuro(famScan.ca)} potentiel`;

  const saisonScan = _quickScanSaisonnier();
  const saisonSub = document.getElementById('laboTileSaisonSub');
  if (saisonSub) saisonSub.textContent = saisonScan.n !== 0 ? `${saisonScan.n} opportunités ce mois` : 'Aucune opportunité ce mois';

  const clScan = _quickScanClientele();
  const clSub = document.getElementById('laboTileClSub');
  if (clSub) clSub.textContent = clScan.n === '?' ? 'Nécessite la chalandise' : `${clScan.n} métiers · ${clScan.nbClients} clients`;
}

// ═══════════════════════════════════════════════════════════════
// Global handlers
// ═══════════════════════════════════════════════════════════════

window._laboToggleDetail = function(idx) {
  const row = document.getElementById('laboDetail' + idx);
  if (row) row.classList.toggle('hidden');
};

window._laboToggleFamDetail = function(idx) {
  const row = document.getElementById('laboFamDetail' + idx);
  if (row) row.classList.toggle('hidden');
};

window._laboCopyERP = function(idx) {
  const data = _S._laboSilData;
  if (!data || !data[idx]) return;
  const atRisk = data[idx].clients.filter(c => c.bucket === 'silencieux' || c.bucket === 'perdu');
  const codes = atRisk.map(c => c.cc).join('\n');
  navigator.clipboard.writeText(codes).then(() => {
    const btn = document.querySelector(`#laboDetail${idx}`)?.previousElementSibling?.querySelector('button');
    if (btn) { const orig = btn.textContent; btn.textContent = '✓'; setTimeout(() => btn.textContent = orig, 1500); }
  });
};

window._laboUpdateSeuil = function(val) {
  _S._laboSeuilPenetration = val / 100;
  const label = document.getElementById('laboSeuilVal');
  if (label) label.textContent = val + '%';
  // Re-compute famille section
  const famData = computeFamilleCommercial(_S._laboSeuilPenetration);
  _S._laboFamData = famData;
  const famContent = document.getElementById('laboTileContent');
  if (famContent && !famContent.classList.contains('hidden')) {
    const backBtn = '<span onclick="window._laboBackToTiles()" class="t-secondary text-[11px] cursor-pointer hover:underline mb-3 inline-block">\u2190 Tuiles</span>';
    famContent.innerHTML = backBtn + `<div class="s-card rounded-xl border p-3">${_renderFamilleCommercial(famData)}</div>`;
  }
};

// ═══════════════════════════════════════════════════════════════
// Mon Rayon — recherche, rendu, handlers
// ═══════════════════════════════════════════════════════════════

function _buildRayonSearchIndex() {
  if (_S._rayonSearchIndex) return _S._rayonSearchIndex;
  const index = [];
  const catFam = _S.catalogueFamille;
  if (!catFam?.size) return index; // Ne PAS assigner _S._rayonSearchIndex ici

  const famAgg = new Map();
  for (const [code, f] of catFam) {
    const cf = f.codeFam || '';
    if (!cf) continue;
    if (!famAgg.has(cf)) famAgg.set(cf, { codeFam: cf, libFam: f.libFam || cf, sousFams: new Map(), totalCount: 0 });
    const agg = famAgg.get(cf);
    agg.totalCount++;
    const csf = f.codeSousFam || '';
    if (csf) {
      if (!agg.sousFams.has(csf)) agg.sousFams.set(csf, { codeSousFam: csf, sousFam: f.sousFam || csf, count: 0 });
      agg.sousFams.get(csf).count++;
    }
  }

  for (const [cf, agg] of famAgg) {
    index.push({
      codeFam: cf, codeSousFam: '', libFam: agg.libFam, sousFam: '',
      level: 1, nbArticlesCat: agg.totalCount,
      searchText: `${cf} ${agg.libFam}`.toLowerCase()
    });
    for (const [csf, sf] of agg.sousFams) {
      index.push({
        codeFam: cf, codeSousFam: csf, libFam: agg.libFam, sousFam: sf.sousFam,
        level: 2, nbArticlesCat: sf.count,
        searchText: `${cf} ${csf} ${agg.libFam} ${sf.sousFam}`.toLowerCase()
      });
    }
  }
  // ── Level 3 : Marques ──
  if (_S.marqueArticles?.size) {
    for (const [marque, codes] of _S.marqueArticles) {
      if (!marque || codes.size === 0) continue;
      const famCount = new Map();
      for (const code of codes) {
        const cf = catFam.get(code)?.codeFam;
        if (cf) famCount.set(cf, (famCount.get(cf) || 0) + 1);
      }
      if (!famCount.size) continue;
      const [domFam] = [...famCount.entries()].sort((a, b) => b[1] - a[1])[0];
      const agg = famAgg.get(domFam);
      index.push({
        codeFam: domFam, codeSousFam: '', libFam: agg?.libFam || domFam, sousFam: '',
        level: 3, nbArticlesCat: codes.size,
        marque,
        searchText: `${marque} ${domFam} ${agg?.libFam || ''}`.toLowerCase()
      });
    }
  }

  // ── Level 4 : Codes articles (lookup rapide au moment de la recherche) ──
  if (_S.catalogueDesignation?.size) {
    const articleCodes = new Map();
    for (const [code, desig] of _S.catalogueDesignation) {
      const cf = catFam.get(code);
      articleCodes.set(code, {
        code,
        libelle: desig,
        marque: _S.catalogueMarques?.get(code) || '',
        codeFam: cf?.codeFam || '',
        libFam: cf?.libFam || '',
        codeSousFam: cf?.codeSousFam || '',
        sousFam: cf?.sousFam || '',
      });
    }
    index._articleCodes = articleCodes;
  }

  index.sort((a, b) => a.level - b.level || b.nbArticlesCat - a.nbArticlesCat);
  _S._rayonSearchIndex = index;
  return index;
}

function _initRayonSearch() {
  const input = document.getElementById('rayonSearchInput');
  const results = document.getElementById('rayonSearchResults');
  if (!input || !results) return;

  _S._rayonSearchIndex = null; // Forcer rebuild à chaque ouverture de tuile
  const searchIndex = _buildRayonSearchIndex();

  let debounce;
  input.addEventListener('input', () => {
    clearTimeout(debounce);
    debounce = setTimeout(() => {
      const q = input.value.trim().toLowerCase();
      if (q.length < 2) { results.classList.add('hidden'); return; }

      if (searchIndex.length === 0) {
        results.innerHTML = '<div class="p-3 text-[11px] t-disabled">Catalogue non chargé — réessayez dans un instant</div>';
        results.classList.remove('hidden');
        return;
      }

      let matches = [];
      const isCodeQuery = /^\d{3,}$/.test(q);
      if (isCodeQuery && searchIndex._articleCodes) {
        for (const [code, art] of searchIndex._articleCodes) {
          if (code.includes(q)) {
            matches.push({ level: 4, codeFam: art.codeFam, codeSousFam: art.codeSousFam,
                           libFam: art.libFam, sousFam: art.sousFam,
                           code: art.code, libelle: art.libelle, marque: art.marque,
                           nbArticlesCat: 1, searchText: '' });
            if (matches.length >= 15) break;
          }
        }
      } else {
        matches = searchIndex.filter(e => e.level <= 3 && e.searchText.includes(q)).slice(0, 15);
      }

      if (!matches.length) {
        results.innerHTML = '<div class="p-3 text-[11px] t-disabled">Aucune famille trouvée</div>';
        results.classList.remove('hidden');
        return;
      }

      results.innerHTML = matches.map(e => {
        let safeCF = e.codeFam.replace(/'/g, "\\'");
        let safeCSF = (e.codeSousFam || '').replace(/'/g, "\\'");
        let label;
        if (e.level === 1) {
          label = `<span class="font-bold t-primary">${escapeHtml(e.libFam)}</span> <span class="t-disabled">(${e.codeFam})</span>`;
        } else if (e.level === 2) {
          label = `<span class="t-secondary ml-2">└ ${escapeHtml(e.sousFam)}</span> <span class="t-disabled">dans ${e.libFam}</span>`;
        } else if (e.level === 3) {
          label = `<span class="font-bold t-primary">🏷 ${escapeHtml(e.marque)}</span> <span class="t-disabled ml-1">dans ${escapeHtml(e.libFam)}</span>`;
          safeCSF = '';
        } else {
          label = `<span class="font-mono font-bold t-primary">${escapeHtml(e.code)}</span> <span class="t-primary ml-1">${escapeHtml((e.libelle || '').slice(0, 40))}</span> <span class="t-disabled ml-1">${escapeHtml(e.marque)}</span>`;
        }
        const refsLabel = e.level < 4 ? `<span class="t-disabled ml-2">${e.nbArticlesCat} réf.</span>` : '';
        return `<div class="hover:s-hover cursor-pointer border-b b-light text-[12px]" style="padding:10px 14px"
          onclick="window._selectRayon('${safeCF}','${safeCSF}')">
          ${label}${refsLabel}
        </div>`;
      }).join('');
      results.classList.remove('hidden');
    }, 200);
  });

  document.addEventListener('click', function _rayonOutside(e) {
    if (!input.contains(e.target) && !results.contains(e.target)) {
      results.classList.add('hidden');
      // Remove listener once tile is gone
      if (!document.getElementById('rayonSearchInput')) document.removeEventListener('click', _rayonOutside);
    }
  });
}

function _initRfSearch() {
  const input = document.getElementById('rfSearchInput');
  const results = document.getElementById('rfSearchResults');
  if (!input || !results) return;

  // Réutiliser le même index catalogue que Mon Rayon (familles + sous-familles)
  _S._rayonSearchIndex = null; // forcer rebuild
  const searchIndex = _buildRayonSearchIndex();

  let debounce;
  input.addEventListener('input', () => {
    clearTimeout(debounce);
    debounce = setTimeout(() => {
      const q = input.value.trim().toLowerCase();
      if (q.length < 2) { results.classList.add('hidden'); return; }

      if (searchIndex.length === 0) {
        results.innerHTML = '<div class="p-3 text-[11px] t-disabled">Catalogue non chargé — réessayez dans un instant</div>';
        results.classList.remove('hidden');
        return;
      }

      let matches = [];
      const isCodeQuery = /^\d{3,}$/.test(q);
      if (isCodeQuery && searchIndex._articleCodes) {
        for (const [code, art] of searchIndex._articleCodes) {
          if (code.includes(q)) {
            matches.push({ level: 4, codeFam: art.codeFam, codeSousFam: art.codeSousFam,
                           libFam: art.libFam, sousFam: art.sousFam,
                           code: art.code, libelle: art.libelle, marque: art.marque,
                           nbArticlesCat: 1, searchText: '' });
            if (matches.length >= 15) break;
          }
        }
      } else {
        matches = searchIndex.filter(e => e.level <= 3 && e.searchText.includes(q)).slice(0, 15);
      }

      if (!matches.length) {
        results.innerHTML = '<div class="p-3 text-[11px] t-disabled">Aucune famille trouvée</div>';
        results.classList.remove('hidden');
        return;
      }

      results.innerHTML = matches.map(e => {
        let safeCF = e.codeFam.replace(/'/g, "\\'");
        let safeCSF = (e.codeSousFam || '').replace(/'/g, "\\'");
        let label;
        if (e.level === 1) {
          label = `<span class="font-bold t-primary">${escapeHtml(e.libFam)}</span> <span class="t-disabled">(${e.codeFam})</span>`;
        } else if (e.level === 2) {
          label = `<span class="t-secondary ml-2">└ ${escapeHtml(e.sousFam)}</span> <span class="t-disabled">dans ${e.libFam}</span>`;
        } else if (e.level === 3) {
          label = `<span class="font-bold t-primary">🏷 ${escapeHtml(e.marque)}</span> <span class="t-disabled ml-1">dans ${escapeHtml(e.libFam)}</span>`;
          safeCSF = '';
        } else {
          label = `<span class="font-mono font-bold t-primary">${escapeHtml(e.code)}</span> <span class="t-primary ml-1">${escapeHtml((e.libelle || '').slice(0, 40))}</span> <span class="t-disabled ml-1">${escapeHtml(e.marque)}</span>`;
        }
        const refsLabel = e.level < 4 ? `<span class="t-disabled ml-2">${e.nbArticlesCat} réf.</span>` : '';
        return `<div class="hover:s-hover cursor-pointer border-b b-light text-[12px]" style="padding:10px 14px"
          onclick="window._rfSelectFam('${safeCF}','${safeCSF}')">
          ${label}${refsLabel}
        </div>`;
      }).join('');
      results.classList.remove('hidden');
    }, 200);
  });

  document.addEventListener('click', function _rfOutside(e) {
    if (!input.contains(e.target) && !results.contains(e.target)) {
      results.classList.add('hidden');
      if (!document.getElementById('rfSearchInput')) document.removeEventListener('click', _rfOutside);
    }
  });
}

const _RAYON_PAGE_SIZE = 20;
let _rayonPageRayon = _RAYON_PAGE_SIZE;
let _rayonPageImpl = _RAYON_PAGE_SIZE;
let _rayonPageCli = _RAYON_PAGE_SIZE;

function _statusBadge(status) {
  if (status === 'pepite')
    return '<span style="font-size:10px;padding:2px 6px;border-radius:4px;background:#dcfce7;color:#166534;font-weight:600">🟢 Pépite</span>';
  if (status === 'dormant')
    return '<span style="font-size:10px;padding:2px 6px;border-radius:4px;background:#f1f5f9;color:#475569;font-weight:600">💤 Dormant</span>';
  if (status === 'challenger')
    return '<span style="font-size:10px;padding:2px 6px;border-radius:4px;background:#fee2e2;color:#991b1b;font-weight:600">🔴 Challenger</span>';
  if (status === 'rupture')
    return '<span style="font-size:10px;padding:2px 6px;border-radius:4px;background:#fef9c3;color:#854d0e;font-weight:600">⚠️ Surveiller</span>';
  // Standard → Socle
  return '<span style="font-size:10px;padding:2px 6px;border-radius:4px;background:#dcfce7;color:#166534;font-weight:500">✅ Socle</span>';
}

function _renderRayonContent(data, prefix = 'rayon') {
  const { codeFam, codeSousFam, libFam, sousFam, monRayon, nbEnStock, nbPepites, nbChallenger, nbDormants, nbRuptures, valeurTotale, aImplanter, clients, topMetiers, nbCatalogue, couverture, sousFamilles, marques } = data;

  const title = sousFam ? `${libFam} → ${sousFam}` : libFam;
  const codeLabel = codeSousFam ? `${codeFam} / ${codeSousFam}` : codeFam;

  const _pageRayon = _S[`_${prefix}PageRayon`] || _RAYON_PAGE_SIZE;
  const _pageImpl  = _S[`_${prefix}PageImpl`]  || _RAYON_PAGE_SIZE;
  const _pageCli   = _S[`_${prefix}PageCli`]   || _RAYON_PAGE_SIZE;

  // Header
  let html = `<div class="mb-4">
    <div class="text-[15px] font-bold t-primary mb-1">🔍 ${escapeHtml(title)} <span class="text-[11px] t-disabled font-normal">(${codeLabel})</span></div>
    <div class="text-[11px] t-secondary mb-1">${monRayon.length} articles en rayon · ${couverture}% couverture catalogue (${monRayon.length}/${nbCatalogue}) · ${formatEuro(valeurTotale)} valeur stock</div>
    <div class="flex flex-wrap gap-2">
      ${nbPepites   ? `<span style="font-size:10px;padding:2px 6px;border-radius:4px;background:#dcfce7;color:#166534;font-weight:600">🟢 ${nbPepites} pépites AF</span>` : ''}
      <span style="font-size:10px;padding:2px 6px;border-radius:4px;background:#dcfce7;color:#166534;font-weight:500">✅ ${monRayon.length - nbPepites - nbChallenger - nbDormants - nbRuptures} socle</span>
      ${nbChallenger ? `<span style="font-size:10px;padding:2px 6px;border-radius:4px;background:#fee2e2;color:#991b1b;font-weight:600">🔴 ${nbChallenger} à challenger</span>` : ''}
      ${nbDormants   ? `<span style="font-size:10px;padding:2px 6px;border-radius:4px;background:#f1f5f9;color:#475569;font-weight:600">💤 ${nbDormants} dormants</span>` : ''}
      ${nbRuptures   ? `<span style="font-size:10px;padding:2px 6px;border-radius:4px;background:#fef9c3;color:#854d0e;font-weight:600">⚠️ ${nbRuptures} à surveiller</span>` : ''}
    </div>
  </div>`;

  // ── Bloc 1 : Mon rayon (ouvert par défaut) ──
  const rayonRows = monRayon.slice(0, _pageRayon);
  html += `<div class="mb-3">
    <div class="flex items-center justify-between cursor-pointer py-1 border-b b-light" onclick="window['_${prefix}ToggleSection']('rayon')">
      <span class="text-[12px] font-bold t-primary">📊 Mon rayon aujourd'hui <span class="t-disabled font-normal">(${monRayon.length})</span></span>
      <span id="${prefix}SectionIcon_rayon" class="t-disabled text-[11px]">▲</span>
    </div>
    <div id="${prefix}Section_rayon">
      <div class="overflow-x-auto mt-2">
        <table class="w-full text-[11px]">
          <thead><tr class="t-disabled border-b b-light">
            <th class="text-left pb-1 pr-2">Code</th>
            <th class="text-left pb-1 pr-2">Libellé</th>
            <th class="text-left pb-1 pr-2">Marque</th>
            <th class="text-left pb-1 pr-2">Sous-fam.</th>
            <th class="text-right pb-1 pr-2">Stock</th>
            <th class="text-right pb-1 pr-2">W</th>
            <th class="text-center pb-1 pr-2">ABC/FMR</th>
            <th class="text-right pb-1 pr-2">CA agence</th>
            <th class="text-left pb-1">Statut</th>
          </tr></thead>
          <tbody>
            ${rayonRows.map(a => `<tr class="border-b b-light hover:s-hover">
              <td class="py-1 pr-2 font-mono t-secondary">${escapeHtml(a.code)}</td>
              <td class="py-1 pr-2 t-primary max-w-[160px] truncate">${escapeHtml(a.libelle)}</td>
              <td class="py-1 pr-2 t-secondary">${escapeHtml(a.marque)}</td>
              <td class="py-1 pr-2 t-secondary">${escapeHtml(a.sousFam)}</td>
              <td class="py-1 pr-2 text-right">${a.stockActuel}</td>
              <td class="py-1 pr-2 text-right">${a.W}</td>
              <td class="py-1 pr-2 text-center font-mono">${a.abcClass}${a.fmrClass}</td>
              <td class="py-1 pr-2 text-right">${formatEuro(a.caAgence)}</td>
              <td class="py-1">${_statusBadge(a.status)}</td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>
      ${monRayon.length > _pageRayon ? `<div class="mt-2 text-center"><button onclick="window['_${prefix}MoreRayon']()" class="text-[10px] t-secondary hover:t-primary px-3 py-1 rounded border b-light">Voir plus (${monRayon.length - _pageRayon} restants)</button></div>` : ''}
      <div class="mt-2 text-right"><button onclick="window['_${prefix}ExportRayon']()" class="text-[10px] px-3 py-1 rounded border b-light t-secondary hover:t-primary">⬇ CSV rayon</button></div>
    </div>
  </div>`;

  // ── Bloc 2 : À implanter (fermé) ──
  const implRows = aImplanter.slice(0, _pageImpl);
  html += `<div class="mb-3">
    <div class="flex items-center justify-between cursor-pointer py-1 border-b b-light" onclick="window['_${prefix}ToggleSection']('impl')">
      <span class="text-[12px] font-bold t-primary">🔵 À implanter <span class="t-disabled font-normal">(${aImplanter.length})</span></span>
      <span id="${prefix}SectionIcon_impl" class="t-disabled text-[11px]">▼</span>
    </div>
    <div id="${prefix}Section_impl" class="hidden">
      ${aImplanter.length === 0 ? '<div class="py-3 text-[11px] t-disabled text-center">Aucun article vendus par le réseau et absent de votre stock</div>' : `
      <div class="overflow-x-auto mt-2">
        <table class="w-full text-[11px]">
          <thead><tr class="t-disabled border-b b-light">
            <th class="text-left pb-1 pr-2">Code</th>
            <th class="text-left pb-1 pr-2">Libellé</th>
            <th class="text-left pb-1 pr-2">Marque</th>
            <th class="text-left pb-1 pr-2">Sous-fam.</th>
            <th class="text-right pb-1 pr-2">Agences</th>
            <th class="text-right pb-1">CA réseau</th>
          </tr></thead>
          <tbody>
            ${implRows.map(a => `<tr class="border-b b-light hover:s-hover">
              <td class="py-1 pr-2 font-mono t-secondary">${escapeHtml(a.code)}</td>
              <td class="py-1 pr-2 t-primary max-w-[160px] truncate">${escapeHtml(a.libelle)}</td>
              <td class="py-1 pr-2 t-secondary">${escapeHtml(a.marque)}</td>
              <td class="py-1 pr-2 t-secondary">${escapeHtml(a.sousFam)}</td>
              <td class="py-1 pr-2 text-right"><span class="px-1.5 py-0.5 rounded bg-blue-900/30 text-blue-400">🏪 ${a.nbAgences} ag.</span></td>
              <td class="py-1 text-right">${formatEuro(a.caReseau)}</td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>
      ${aImplanter.length > _pageImpl ? `<div class="mt-2 text-center"><button onclick="window['_${prefix}MoreImpl']()" class="text-[10px] t-secondary hover:t-primary px-3 py-1 rounded border b-light">Voir plus (${aImplanter.length - _pageImpl} restants)</button></div>` : ''}
      <div class="mt-2 text-right"><button onclick="window['_${prefix}ExportImpl']()" class="text-[10px] px-3 py-1 rounded border b-light t-secondary hover:t-primary">⬇ CSV à implanter</button></div>`}
    </div>
  </div>`;

  // ── Bloc 3 : Mes clients (fermé) ──
  const cliRows = clients.slice(0, _pageCli);
  const metiersLabel = topMetiers.slice(0, 3).map(([m, n]) => `${m} (${n})`).join(', ');
  html += `<div class="mb-3">
    <div class="flex items-center justify-between cursor-pointer py-1 border-b b-light" onclick="window['_${prefix}ToggleSection']('cli')">
      <span class="text-[12px] font-bold t-primary">👥 Mes clients <span class="t-disabled font-normal">(${clients.length})</span></span>
      <span id="${prefix}SectionIcon_cli" class="t-disabled text-[11px]">▼</span>
    </div>
    <div id="${prefix}Section_cli" class="hidden">
      ${clients.length === 0 ? '<div class="py-3 text-[11px] t-disabled text-center">Aucun client avec achat dans cette famille</div>' : `
      ${metiersLabel ? `<div class="mt-2 text-[10px] t-secondary">Top métiers : ${escapeHtml(metiersLabel)}</div>` : ''}
      <div class="overflow-x-auto mt-2">
        <table class="w-full text-[11px]">
          <thead><tr class="t-disabled border-b b-light">
            <th class="text-left pb-1 pr-2">Client</th>
            <th class="text-left pb-1 pr-2">Métier</th>
            <th class="text-left pb-1 pr-2">Commercial</th>
            <th class="text-right pb-1 pr-2">CA famille</th>
            <th class="text-right pb-1">Articles</th>
          </tr></thead>
          <tbody>
            ${cliRows.map(c => `<tr class="border-b b-light hover:s-hover cursor-pointer" onclick="openClient360('${escapeHtml(c.cc)}','labo')">
              <td class="py-1 pr-2 t-primary">${escapeHtml(c.nom)}</td>
              <td class="py-1 pr-2 t-secondary">${escapeHtml(c.metier)}</td>
              <td class="py-1 pr-2 t-secondary">${escapeHtml(c.commercial)}</td>
              <td class="py-1 pr-2 text-right">${formatEuro(c.ca)}</td>
              <td class="py-1 text-right">${c.nbArticles}</td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>
      ${clients.length > _pageCli ? `<div class="mt-2 text-center"><button onclick="window['_${prefix}MoreCli']()" class="text-[10px] t-secondary hover:t-primary px-3 py-1 rounded border b-light">Voir plus (${clients.length - _pageCli} restants)</button></div>` : ''}
      <div class="mt-2 text-right"><button onclick="window['_${prefix}ExportCli']()" class="text-[10px] px-3 py-1 rounded border b-light t-secondary hover:t-primary">⬇ CSV clients</button></div>`}
    </div>
  </div>`;

  // ── Bloc 4 : Catalogue (fermé) ──
  html += `<div class="mb-3">
    <div class="flex items-center justify-between cursor-pointer py-1 border-b b-light" onclick="window['_${prefix}ToggleSection']('cat')">
      <span class="text-[12px] font-bold t-primary">📋 Catalogue <span class="t-disabled font-normal">(${nbCatalogue} réf.)</span></span>
      <span id="${prefix}SectionIcon_cat" class="t-disabled text-[11px]">▼</span>
    </div>
    <div id="${prefix}Section_cat" class="hidden">
      <div class="mt-2 text-[11px] t-secondary mb-2">${nbCatalogue} références disponibles chez Legallais</div>
      ${sousFamilles.length ? `<div class="mb-2">
        <div class="text-[10px] t-disabled mb-1">Par sous-famille :</div>
        <div class="flex flex-wrap gap-2">
          ${sousFamilles.map(([sf, n]) => {
            const safeSF = (sf === 'Non classé' ? '' : sf).replace(/'/g, "\\'");
            return `<span class="text-[10px] px-2 py-0.5 rounded border b-light t-secondary cursor-pointer hover:t-primary" onclick="window['_${prefix}SelectSousFam']('${codeFam.replace(/'/g,"\\'")}','${safeSF}')">${escapeHtml(sf)} (${n})</span>`;
          }).join('')}
        </div>
      </div>` : ''}
      ${marques.length ? `<div>
        <div class="text-[10px] t-disabled mb-1">Par marque :</div>
        <div class="flex flex-wrap gap-2">
          ${marques.map(([m, n]) => `<span class="text-[10px] px-2 py-0.5 rounded border b-light t-secondary">${escapeHtml(m)} (${n})</span>`).join('')}
        </div>
      </div>` : ''}
    </div>
  </div>`;

  return html;
}

function _renderMonRayon(data) { return _renderRayonContent(data, 'rayon'); }

window._selectRayon = function(codeFam, codeSousFam) {
  const input = document.getElementById('rayonSearchInput');
  const results = document.getElementById('rayonSearchResults');
  if (results) results.classList.add('hidden');

  _rayonPageRayon = _RAYON_PAGE_SIZE;
  _rayonPageImpl  = _RAYON_PAGE_SIZE;
  _rayonPageCli   = _RAYON_PAGE_SIZE;
  _S._rayonPageRayon = _RAYON_PAGE_SIZE;
  _S._rayonPageImpl  = _RAYON_PAGE_SIZE;
  _S._rayonPageCli   = _RAYON_PAGE_SIZE;

  const data = computeMonRayon(codeFam, codeSousFam || '');
  if (!data) return;
  _S._rayonData = data;

  if (input) input.value = data.sousFam ? `${data.libFam} → ${data.sousFam}` : data.libFam;

  const el = document.getElementById('rayonContent');
  if (el) el.innerHTML = _renderMonRayon(data);
};

window._rayonSelectSousFam = window._selectRayon;

window._rayonToggleSection = function(key) {
  const section = document.getElementById('rayonSection_' + key);
  const icon    = document.getElementById('rayonSectionIcon_' + key);
  if (!section) return;
  const hidden = section.classList.toggle('hidden');
  if (icon) icon.textContent = hidden ? '▼' : '▲';
};

window._rayonMoreRayon = function() {
  if (!_S._rayonData) return;
  _rayonPageRayon += _RAYON_PAGE_SIZE;
  _S._rayonPageRayon = _rayonPageRayon;
  const el = document.getElementById('rayonContent');
  if (el) el.innerHTML = _renderMonRayon(_S._rayonData);
  // Re-open rayon section
  const s = document.getElementById('rayonSection_rayon');
  const ic = document.getElementById('rayonSectionIcon_rayon');
  if (s) s.classList.remove('hidden');
  if (ic) ic.textContent = '▲';
};

window._rayonMoreImpl = function() {
  if (!_S._rayonData) return;
  _rayonPageImpl += _RAYON_PAGE_SIZE;
  _S._rayonPageImpl = _rayonPageImpl;
  const el = document.getElementById('rayonContent');
  if (el) el.innerHTML = _renderMonRayon(_S._rayonData);
  const s = document.getElementById('rayonSection_impl');
  const ic = document.getElementById('rayonSectionIcon_impl');
  if (s) s.classList.remove('hidden');
  if (ic) ic.textContent = '▲';
};

window._rayonMoreCli = function() {
  if (!_S._rayonData) return;
  _rayonPageCli += _RAYON_PAGE_SIZE;
  _S._rayonPageCli = _rayonPageCli;
  const el = document.getElementById('rayonContent');
  if (el) el.innerHTML = _renderMonRayon(_S._rayonData);
  const s = document.getElementById('rayonSection_cli');
  const ic = document.getElementById('rayonSectionIcon_cli');
  if (s) s.classList.remove('hidden');
  if (ic) ic.textContent = '▲';
};

function _rayonToCSV(rows, headers, rowFn) {
  return [headers.join(';'), ...rows.map(rowFn)].join('\n');
}

window._rayonExportRayon = function() {
  if (!_S._rayonData) return;
  const csv = _rayonToCSV(
    _S._rayonData.monRayon,
    ['Code','Libellé','Marque','Sous-famille','Stock','W','ABC','FMR','CA agence','Valeur stock','Statut'],
    a => [a.code, a.libelle, a.marque, a.sousFam, a.stockActuel, a.W, a.abcClass, a.fmrClass, a.caAgence.toFixed(2), a.valeurStock.toFixed(2), a.status].join(';')
  );
  _downloadCSV(csv, `rayon_${_S._rayonData.codeFam}.csv`);
};

window._rayonExportImpl = function() {
  if (!_S._rayonData) return;
  const csv = _rayonToCSV(
    _S._rayonData.aImplanter,
    ['Code','Libellé','Marque','Sous-famille','Nb agences','CA réseau'],
    a => [a.code, a.libelle, a.marque, a.sousFam, a.nbAgences, a.caReseau.toFixed(2)].join(';')
  );
  _downloadCSV(csv, `implanter_${_S._rayonData.codeFam}.csv`);
};

window._rayonExportCli = function() {
  if (!_S._rayonData) return;
  const csv = _rayonToCSV(
    _S._rayonData.clients,
    ['Code client','Nom','Métier','Commercial','CA famille','Nb articles'],
    c => [c.cc, c.nom, c.metier, c.commercial, c.ca.toFixed(2), c.nbArticles].join(';')
  );
  _downloadCSV(csv, `clients_rayon_${_S._rayonData.codeFam}.csv`);
};

function _downloadCSV(csv, filename) {
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ── Handlers prefixés rf (Radar Famille détail) ─────────────────
window._rfToggleSection = function(key) {
  const section = document.getElementById('rfSection_' + key);
  const icon    = document.getElementById('rfSectionIcon_' + key);
  if (!section) return;
  const hidden = section.classList.toggle('hidden');
  if (icon) icon.textContent = hidden ? '▼' : '▲';
};

window._rfMoreRayon = function() {
  if (!_S._rfRayonData) return;
  _S._rfPageRayon = (_S._rfPageRayon || _RAYON_PAGE_SIZE) + _RAYON_PAGE_SIZE;
  const el = document.getElementById('rfContent');
  if (el) el.innerHTML = _renderRayonContent(_S._rfRayonData, 'rf');
  const s = document.getElementById('rfSection_rayon');
  const ic = document.getElementById('rfSectionIcon_rayon');
  if (s) s.classList.remove('hidden');
  if (ic) ic.textContent = '▲';
};

window._rfMoreImpl = function() {
  if (!_S._rfRayonData) return;
  _S._rfPageImpl = (_S._rfPageImpl || _RAYON_PAGE_SIZE) + _RAYON_PAGE_SIZE;
  const el = document.getElementById('rfContent');
  if (el) el.innerHTML = _renderRayonContent(_S._rfRayonData, 'rf');
  const s = document.getElementById('rfSection_impl');
  const ic = document.getElementById('rfSectionIcon_impl');
  if (s) s.classList.remove('hidden');
  if (ic) ic.textContent = '▲';
};

window._rfMoreCli = function() {
  if (!_S._rfRayonData) return;
  _S._rfPageCli = (_S._rfPageCli || _RAYON_PAGE_SIZE) + _RAYON_PAGE_SIZE;
  const el = document.getElementById('rfContent');
  if (el) el.innerHTML = _renderRayonContent(_S._rfRayonData, 'rf');
  const s = document.getElementById('rfSection_cli');
  const ic = document.getElementById('rfSectionIcon_cli');
  if (s) s.classList.remove('hidden');
  if (ic) ic.textContent = '▲';
};

window._rfExportRayon = function() {
  if (!_S._rfRayonData) return;
  const csv = _rayonToCSV(
    _S._rfRayonData.monRayon,
    ['Code','Libellé','Marque','Sous-famille','Stock','W','ABC','FMR','CA agence','Valeur stock','Statut'],
    a => [a.code, a.libelle, a.marque, a.sousFam, a.stockActuel, a.W, a.abcClass, a.fmrClass, a.caAgence.toFixed(2), a.valeurStock.toFixed(2), a.status].join(';')
  );
  _downloadCSV(csv, `rayon_${_S._rfRayonData.codeFam}.csv`);
};

window._rfExportImpl = function() {
  if (!_S._rfRayonData) return;
  const csv = _rayonToCSV(
    _S._rfRayonData.aImplanter,
    ['Code','Libellé','Marque','Sous-famille','Nb agences','CA réseau'],
    a => [a.code, a.libelle, a.marque, a.sousFam, a.nbAgences, a.caReseau.toFixed(2)].join(';')
  );
  _downloadCSV(csv, `implanter_${_S._rfRayonData.codeFam}.csv`);
};

window._rfExportCli = function() {
  if (!_S._rfRayonData) return;
  const csv = _rayonToCSV(
    _S._rfRayonData.clients,
    ['Code client','Nom','Métier','Commercial','CA famille','Nb articles'],
    c => [c.cc, c.nom, c.metier, c.commercial, c.ca.toFixed(2), c.nbArticles].join(';')
  );
  _downloadCSV(csv, `clients_rayon_${_S._rfRayonData.codeFam}.csv`);
};

window._rfSelectSousFam = function(codeFam, codeSousFam) {
  _rfOpenSousFam = codeSousFam || '';
  _S._rfPageRayon = _RAYON_PAGE_SIZE;
  _S._rfPageImpl  = _RAYON_PAGE_SIZE;
  _S._rfPageCli   = _RAYON_PAGE_SIZE;
  const rayonData = computeMonRayon(codeFam, _rfOpenSousFam);
  _S._rfRayonData = rayonData;
  const el = document.getElementById('rfContent');
  if (el) el.innerHTML = rayonData
    ? _renderRayonContent(rayonData, 'rf')
    : '<div class="t-disabled text-sm text-center py-6">Aucune donnée rayon pour cette sous-famille.</div>';
};

// ═══════════════════════════════════════════════════════════════
// Radar Famille — Vue 360° par famille (fusion Squelette + Mon Rayon)
// ═══════════════════════════════════════════════════════════════

let _rfFilterClassif = '';
let _rfOpenFam = null;
let _rfOpenSousFam = '';
let _rfDetailTab = 'rayon';

function _rfRerender() {
  const content = document.getElementById('laboTileContent');
  if (!content || content.classList.contains('hidden') || !_S._rfData) return;
  const backBtn = '<span onclick="window._laboBackToTiles()" class="t-secondary text-[11px] cursor-pointer hover:underline mb-3 inline-block">\u2190 Tuiles</span>';
  content.innerHTML = backBtn + `<div class="s-card rounded-xl border p-3">${_renderRadarFamille(_S._rfData)}</div>`;
  _initRfSearch();
}

function _renderRadarFamille(data) {
  if (!data || !data.families.length) {
    return '<div class="text-center py-8 t-disabled text-sm">Chargez au moins le fichier Consommé pour activer cette analyse.</div>';
  }

  if (_rfOpenFam) {
    return _renderRadarFamilleDetail(_rfOpenFam, data);
  }

  // ── Badges totaux + filtres ──
  const { totals } = data;
  const _badge = (key, n) => {
    const b = CLASSIF_BADGE_FAMILLE[key];
    const active = _rfFilterClassif === key;
    return `<button onclick="window._rfSetFilter('${key}')" data-rfbadge="${key}" class="flex flex-col items-center p-2 rounded-lg border cursor-pointer transition-all ${active ? 's-panel-inner' : 's-card'}" style="${active ? 'box-shadow:0 0 0 2px ' + b.color : ''}">
      <span class="text-base leading-none">${b.icon}</span>
      <span class="text-[13px] font-extrabold ${active ? 't-inverse' : 't-primary'}">${n}</span>
      <span class="text-[9px] ${active ? 't-inverse-muted' : 't-disabled'}">${b.label}</span>
    </button>`;
  };

  let html = `<div class="mb-3">
    <div class="flex items-center justify-between mb-2">
      <h3 class="font-extrabold text-sm t-primary">🔭 Radar Famille — ${data.families.length} familles analysées</h3>
    </div>
    <div class="grid grid-cols-5 gap-2 mb-3">
      ${_badge('socle', totals.socle)}
      ${_badge('implanter', totals.implanter)}
      ${_badge('challenger', totals.challenger)}
      ${_badge('potentiel', totals.potentiel)}
      ${_badge('surveiller', totals.surveiller)}
    </div>
    <div class="relative mb-3">
      <input type="text" id="rfSearchInput" placeholder="🔍 Rechercher une famille… (ex: protection, fixation)"
        autocomplete="off"
        class="w-full px-3 py-2 text-[12px] rounded-lg border b-default s-card t-primary focus:border-[var(--c-action)] focus:outline-none">
      <div id="rfSearchResults" class="hidden absolute left-0 right-0 top-full mt-1 s-card border rounded-xl shadow-xl overflow-y-auto z-50" style="max-height:320px"></div>
    </div>
  </div>`;

  html += `<div id="rfFamGrid" class="grid grid-cols-1 sm:grid-cols-2 gap-3">${_rfBuildCards(data)}</div>`;
  return html;
}

function _rfBuildCards(data) {
  let families = data.families;
  if (_rfFilterClassif) families = families.filter(f => f.classifGlobal === _rfFilterClassif);
  if (!families.length) return '<div class="col-span-2 text-center py-6 t-disabled text-[12px]">Aucune famille pour ce filtre.</div>';
  let out = '';
  for (const f of families) {
    const b = CLASSIF_BADGE_FAMILLE[f.classifGlobal] || CLASSIF_BADGE_FAMILLE.potentiel;
    const total = f.socle + f.implanter + f.challenger + f.potentiel + f.surveiller;
    const safeCF = f.codeFam.replace(/'/g, "\\'");
    const bw = (n) => total > 0 ? Math.max(n / total * 100, n > 0 ? 3 : 0) : 0;
    const miniBar = `<div class="flex rounded overflow-hidden h-1.5 my-1.5" style="gap:1px">
      ${f.socle     ? `<div title="${f.socle} socle" style="width:${bw(f.socle)}%;background:#22c55e"></div>` : ''}
      ${f.implanter ? `<div title="${f.implanter} à implanter" style="width:${bw(f.implanter)}%;background:#3b82f6"></div>` : ''}
      ${f.challenger? `<div title="${f.challenger} challenger" style="width:${bw(f.challenger)}%;background:#ef4444"></div>` : ''}
      ${f.potentiel ? `<div title="${f.potentiel} potentiel" style="width:${bw(f.potentiel)}%;background:#f59e0b"></div>` : ''}
      ${f.surveiller? `<div title="${f.surveiller} surveiller" style="width:${bw(f.surveiller)}%;background:#94a3b8"></div>` : ''}
    </div>`;
    const srcSet = new Set();
    if (f.srcReseau)     srcSet.add('reseau');
    if (f.srcChalandise) srcSet.add('chalandise');
    if (f.srcHorsZone)   srcSet.add('horsZone');
    if (f.srcLivraisons) srcSet.add('livraisons');
    const covColor = f.couverture >= 70 ? '#22c55e' : f.couverture >= 40 ? '#f59e0b' : '#ef4444';
    out += `<div class="s-card rounded-xl border p-3 cursor-pointer hover:border-[var(--c-action)] transition-all"
      onclick="window._rfOpenDetail('${safeCF}')">
      <div class="flex items-start justify-between mb-0.5">
        <div class="flex-1 min-w-0 mr-2">
          <div class="text-[12px] font-bold t-primary truncate">${escapeHtml(f.libFam)}</div>
          <div class="text-[10px] t-disabled">${f.codeFam}</div>
        </div>
        <span class="text-[9px] px-2 py-0.5 rounded-full font-bold shrink-0" style="background:${b.bg};color:${b.color}">${b.icon} ${b.label}</span>
      </div>
      ${miniBar}
      <div class="flex items-center justify-between text-[10px]">
        <span class="t-secondary">${total} articles · ${f.nbClients} clients</span>
        <span class="font-bold" style="color:${covColor}">${f.couverture}% couv.</span>
      </div>
      <div class="flex items-center justify-between mt-1.5">
        ${_sourceBar({ sources: srcSet })}
        <span class="text-[10px] font-bold t-secondary">${formatEuro(f.caAgence)}</span>
      </div>
    </div>`;
  }
  return out;
}

function _renderRadarFamilleDetail(codeFam, data) {
  const fam = data.families.find(f => f.codeFam === codeFam);
  if (!fam) return '<div class="t-disabled text-sm text-center py-4">Famille introuvable.</div>';

  const b = CLASSIF_BADGE_FAMILLE[fam.classifGlobal] || CLASSIF_BADGE_FAMILLE.potentiel;
  const tabs = [
    { key: 'rayon',     label: '📊 Mon Rayon' },
    { key: 'squelette', label: '🦴 Squelette' },
    { key: 'clients',   label: '👥 Clients'   },
    { key: 'analyse',   label: '🏷 Analyse'   },
  ];

  let html = `<div class="mb-3">
    <div class="flex items-center gap-2 mb-2">
      <button onclick="window._rfCloseDetail()" class="text-[11px] t-secondary hover:t-primary cursor-pointer border b-light px-2 py-0.5 rounded s-card">← Retour</button>
      <span class="text-[14px] font-bold t-primary">${escapeHtml(fam.libFam)}</span>
      <span class="text-[10px] px-2 py-0.5 rounded-full font-bold" style="background:${b.bg};color:${b.color}">${b.icon} ${b.label}</span>
      <span class="text-[10px] t-disabled">${fam.codeFam}</span>
    </div>
    <div class="flex gap-2 flex-wrap mb-3">
      ${tabs.map(t => `<button onclick="window._rfSetTab('${t.key}')" data-rftab="${t.key}"
        class="text-[11px] px-3 py-1.5 rounded-lg border cursor-pointer transition-all ${_rfDetailTab === t.key ? 's-panel-inner t-inverse' : 's-card t-secondary hover:t-primary'}">${t.label}</button>`).join('')}
    </div>
  </div>
  <div id="rfDetailContent">${_getRfTabContent(_rfDetailTab, fam)}</div>`;
  return html;
}

function _getRfTabContent(tab, fam) {
  if (tab === 'rayon') {
    const rayonData = computeMonRayon(fam.codeFam, _rfOpenSousFam || '');
    _S._rfRayonData = rayonData;
    _S._rfPageRayon = _RAYON_PAGE_SIZE;
    _S._rfPageImpl  = _RAYON_PAGE_SIZE;
    _S._rfPageCli   = _RAYON_PAGE_SIZE;
    if (!rayonData || (!rayonData.monRayon.length && !rayonData.aImplanter.length)) {
      return '<div class="t-disabled text-sm text-center py-6">Aucune donnée rayon pour cette famille.</div>';
    }
    return `<div id="rfContent">${_renderRayonContent(rayonData, 'rf')}</div>`;
  }

  if (tab === 'squelette') {
    const CLASSIFS = ['socle', 'implanter', 'challenger', 'potentiel', 'surveiller'];
    const allArts = CLASSIFS.flatMap(g => (fam.articles[g] || []).map(a => ({ ...a, _g: g })));
    if (!allArts.length) return '<div class="t-disabled text-sm text-center py-6">Aucun article squelette pour cette famille.</div>';
    const rows = allArts.map(a => `<tr class="border-b b-light text-[11px]">
      <td class="py-1.5 px-2 font-mono t-disabled">${a.code}</td>
      <td class="py-1.5 px-2 t-primary">${escapeHtml(a.libelle || a.code)}</td>
      <td class="py-1.5 px-2">${_classifBadge(a.classification)}</td>
      <td class="py-1.5 px-2">${_sourceBar(a)}</td>
      <td class="py-1.5 px-2 text-right t-secondary">${a.enStock ? a.stockActuel : '—'}</td>
      <td class="py-1.5 px-2 text-right font-bold t-primary">${a.caAgence > 0 ? formatEuro(a.caAgence) : '—'}</td>
    </tr>`).join('');
    return `<div class="overflow-x-auto">
      <table class="w-full text-[11px]">
        <thead><tr class="border-b b-light text-[10px] t-disabled">
          <th class="py-1.5 px-2 text-left">Code</th><th class="py-1.5 px-2 text-left">Libellé</th>
          <th class="py-1.5 px-2 text-left">Classif.</th><th class="py-1.5 px-2 text-left">Sources</th>
          <th class="py-1.5 px-2 text-right">Stock</th><th class="py-1.5 px-2 text-right">CA agence</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
  }

  if (tab === 'clients') {
    const clientsMap = new Map();
    if (_S.ventesClientArticle) {
      for (const [cc, artMap] of _S.ventesClientArticle) {
        let caFam = 0, nbArt = 0;
        for (const [code, data] of artMap) {
          const cf = _S.catalogueFamille?.get(code);
          const match = cf ? cf.codeFam === fam.codeFam : (_S.articleFamille?.[code] === fam.codeFam);
          if (match) { caFam += data.sumCA || 0; nbArt++; }
        }
        if (nbArt > 0) {
          const chal = _S.chalandiseData?.get(cc);
          clientsMap.set(cc, {
            cc,
            nom: chal?.nom || _S.clientNomLookup?.[cc] || cc,
            metier: chal?.metier || '',
            commercial: chal?.commercial || '',
            ca: caFam, nbArticles: nbArt
          });
        }
      }
    }
    const clients = [...clientsMap.values()].sort((a, b) => b.ca - a.ca);
    if (!clients.length) return '<div class="t-disabled text-sm text-center py-6">Aucun client pour cette famille sur la période.</div>';
    const metiersCount = {};
    for (const c of clients) if (c.metier) metiersCount[c.metier] = (metiersCount[c.metier] || 0) + 1;
    const topMetiers = Object.entries(metiersCount).sort((a, b) => b[1] - a[1]).slice(0, 8);
    const pills = topMetiers.map(([m, n]) => `<span class="text-[10px] px-2 py-0.5 rounded-full s-panel-inner t-secondary">${escapeHtml(m)} <strong class="t-primary">${n}</strong></span>`).join('');
    const rows = clients.slice(0, 50).map(c => `<tr class="border-b b-light text-[11px] hover:s-hover">
      <td class="py-1.5 px-2 font-mono t-disabled">${c.cc}</td>
      <td class="py-1.5 px-2 t-primary">${escapeHtml(c.nom)}</td>
      <td class="py-1.5 px-2 t-secondary">${escapeHtml(c.metier)}</td>
      <td class="py-1.5 px-2 t-disabled">${escapeHtml(c.commercial)}</td>
      <td class="py-1.5 px-2 text-right font-bold t-primary">${formatEuro(c.ca)}</td>
      <td class="py-1.5 px-2 text-right t-disabled">${c.nbArticles}</td>
    </tr>`).join('');
    return `<div class="flex flex-wrap gap-1.5 mb-3">${pills}</div>
      <div class="overflow-x-auto">
        <table class="w-full text-[11px]">
          <thead><tr class="border-b b-light text-[10px] t-disabled">
            <th class="py-1.5 px-2 text-left">Code</th><th class="py-1.5 px-2 text-left">Nom</th>
            <th class="py-1.5 px-2 text-left">Métier</th><th class="py-1.5 px-2 text-left">Commercial</th>
            <th class="py-1.5 px-2 text-right">CA famille</th><th class="py-1.5 px-2 text-right">Articles</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
        ${clients.length > 50 ? `<div class="text-[10px] t-disabled text-center py-2">+${clients.length - 50} autres clients</div>` : ''}
      </div>`;
  }

  // Tab analyse
  const rayonData = computeMonRayon(fam.codeFam, _rfOpenSousFam || '');
  if (!rayonData) return '<div class="t-disabled text-sm text-center py-6">Aucune donnée catalogue pour cette famille.</div>';
  const sfRows = rayonData.sousFamilles.map(([sf, n]) => `<tr class="border-b b-light text-[11px]">
    <td class="py-1.5 px-2 t-primary">${escapeHtml(sf)}</td>
    <td class="py-1.5 px-2 text-right font-bold t-primary">${n}</td>
  </tr>`).join('');
  const mqRows = rayonData.marques.map(([m, n]) => `<tr class="border-b b-light text-[11px]">
    <td class="py-1.5 px-2 t-primary">${escapeHtml(m)}</td>
    <td class="py-1.5 px-2 text-right font-bold t-primary">${n}</td>
  </tr>`).join('');
  return `<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
    <div>
      <div class="text-[12px] font-bold t-primary mb-2">📂 Sous-familles (${rayonData.sousFamilles.length})</div>
      <table class="w-full text-[11px]"><thead><tr class="border-b b-light text-[10px] t-disabled">
        <th class="py-1.5 px-2 text-left">Sous-famille</th><th class="py-1.5 px-2 text-right">Réf.</th>
      </tr></thead><tbody>${sfRows || '<tr><td colspan="2" class="py-3 text-center t-disabled">—</td></tr>'}</tbody></table>
    </div>
    <div>
      <div class="text-[12px] font-bold t-primary mb-2">🏷 Marques (top 15)</div>
      <table class="w-full text-[11px]"><thead><tr class="border-b b-light text-[10px] t-disabled">
        <th class="py-1.5 px-2 text-left">Marque</th><th class="py-1.5 px-2 text-right">Réf.</th>
      </tr></thead><tbody>${mqRows || '<tr><td colspan="2" class="py-3 text-center t-disabled">—</td></tr>'}</tbody></table>
    </div>
  </div>`;
}

window._rfSetFilter = function(key) {
  _rfFilterClassif = _rfFilterClassif === key ? '' : key;
  _rfOpenFam = null;
  _rfOpenSousFam = '';
  _rfRerender();
};

window._rfSelectFam = function(codeFam, codeSousFam) {
  const results = document.getElementById('rfSearchResults');
  if (results) results.classList.add('hidden');
  const input = document.getElementById('rfSearchInput');
  if (input) input.value = '';
  _rfOpenFam = codeFam;
  _rfOpenSousFam = codeSousFam || '';
  _rfDetailTab = 'rayon';
  _rfRerender();
};

window._rfOpenDetail = function(codeFam) {
  _rfOpenFam = codeFam;
  _rfOpenSousFam = '';
  _rfDetailTab = 'rayon';
  _rfRerender();
};

window._rfCloseDetail = function() {
  _rfOpenFam = null;
  _rfOpenSousFam = '';
  _rfDetailTab = 'rayon';
  _rfRerender();
};

window._rfSetTab = function(tab) {
  _rfDetailTab = tab;
  // Update tab button styles
  document.querySelectorAll('[data-rftab]').forEach(btn => {
    const isActive = btn.dataset.rftab === tab;
    btn.className = `text-[11px] px-3 py-1.5 rounded-lg border cursor-pointer transition-all ${isActive ? 's-panel-inner t-inverse' : 's-card t-secondary hover:t-primary'}`;
  });
  // Swap tab content only
  const el = document.getElementById('rfDetailContent');
  if (el && _S._rfData && _rfOpenFam) {
    const fam = _S._rfData.families.find(f => f.codeFam === _rfOpenFam);
    if (fam) el.innerHTML = _getRfTabContent(tab, fam);
  }
};
