// © 2026 Jawad El Barkaoui — Tous droits réservés
// PRISME — labo.js
// Onglet Labo : prototypes de croisements analytiques
// Tile-based UI with lazy computation
// ═══════════════════════════════════════════════════════════════
'use strict';
import { _S } from './state.js';
import { formatEuro, famLib, _doCopyCode, _copyCodeBtn, escapeHtml } from './utils.js';
import { _unikLink, _clientPassesFilters } from './engine.js';

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
      return `<tr class="text-[10px] b-light border-b hover:bg-gray-50 dark:hover:bg-gray-800/30">
        <td class="py-1 pr-2 font-mono t-disabled">${_unikLink(c.cc)}</td>
        <td class="py-1 pr-2 t-primary">${escapeHtml(c.nom)}</td>
        <td class="py-1 pr-2 t-secondary">${escapeHtml(c.metier)}</td>
        <td class="py-1 pr-2 text-center">${bucketBadge}</td>
        <td class="py-1 pr-2 text-right t-disabled">${c.daysSince != null ? c.daysSince + 'j' : '—'}</td>
        <td class="py-1 text-right font-bold t-primary">${formatEuro(c.ca)}</td>
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
        <td class="py-1 pr-2"><span class="text-[9px] px-1.5 py-0.5 rounded-full border b-light s-panel-inner">${escapeHtml(o.metier)}</span></td>
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

function _renderTileGrid(el) {
  const silScan = _quickScanSilencieux();
  const famScan = _quickScanFamille();

  const silSubtitle = `${silScan.n} clients à risque · ${formatEuro(silScan.ca)} en jeu`;
  const famSubtitle = famScan.n === '?' ? 'Cliquez pour analyser' : `${famScan.n} opportunités · ${formatEuro(famScan.ca)} potentiel`;

  el.innerHTML = `<div id="laboTileGrid" class="grid grid-cols-1 sm:grid-cols-2 gap-3">
    <div class="s-card rounded-xl border p-4 cursor-pointer hover:border-[var(--c-action)] transition-all" onclick="window._laboOpenTile('sil')">
      <div class="text-lg mb-1">🔀</div>
      <div class="text-[13px] font-bold t-primary mb-1">Commercial × Silencieux</div>
      <div class="text-[10px] t-secondary" id="laboTileSilSub">${silSubtitle}</div>
    </div>
    <div class="s-card rounded-xl border p-4 cursor-pointer hover:border-[var(--c-action)] transition-all" onclick="window._laboOpenTile('fam')">
      <div class="text-lg mb-1">🧬</div>
      <div class="text-[13px] font-bold t-primary mb-1">Famille × Commercial</div>
      <div class="text-[10px] t-secondary" id="laboTileFamSub">${famSubtitle}</div>
    </div>
    <div class="s-card rounded-xl border p-4 cursor-pointer hover:border-[var(--c-action)] transition-all" onclick="window._laboOpenTile('prisme')">
      <div class="text-lg mb-1">🎲</div>
      <div class="text-[13px] font-bold t-primary mb-1">Générer mon PRISME</div>
      <div class="text-[10px] t-secondary">6 analyses aléatoires</div>
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
  } else if (tile === 'prisme') {
    const picked = _shuffleArray(_NL_CHIPS).slice(0, 6);
    const chips = picked.map(c => {
      const safeQ = c.q.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
      return `<button onclick="window._laboRunChip('${safeQ}')" class="text-[10px] px-3 py-1.5 rounded-full s-card border b-light t-secondary hover:t-primary hover:border-[var(--c-action)] transition-colors">${escapeHtml(c.label)}</button>`;
    }).join('');
    content.innerHTML = backBtn +
      `<div class="flex flex-wrap gap-2 mb-4">${chips}</div>` +
      `<div id="laboPrismeResults"></div>`;
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
