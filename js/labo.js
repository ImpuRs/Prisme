// © 2026 Jawad El Barkaoui — Tous droits réservés
// PRISME — labo.js
// Onglet Labo : prototypes de croisements analytiques
// Croisement #5 : Commercial × Silencieux
// Croisement #1 : Famille × Commercial (inférence réseau)
// ═══════════════════════════════════════════════════════════════
'use strict';
import { _S } from './state.js';
import { formatEuro, famLib, _doCopyCode, _copyCodeBtn, escapeHtml } from './utils.js';
import { _unikLink, _clientPassesFilters } from './engine.js';

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
      <td class="py-2 text-center">${r.nbActifs}</td>
      <td class="py-2 text-center font-bold" style="color:var(--c-caution)">${r.nbSilencieux || '—'}</td>
      <td class="py-2 text-center font-bold" style="color:var(--c-danger)">${r.nbPerdus || '—'}</td>
      <td class="py-2 text-center t-disabled">${r.nbJamais || '—'}</td>
      <td class="py-2 text-right font-bold">${formatEuro(caRisque)}</td>
      <td class="py-2 text-center">${atRisk.length ? `<button onclick="event.stopPropagation();window._laboCopyERP(${idx})" class="text-[9px] px-1.5 py-0.5 rounded border b-light hover:bg-gray-100 dark:hover:bg-gray-700" title="Copier codes ERP">📋</button>` : ''}</td>
    </tr>
    <tr id="laboDetail${idx}" class="hidden">
      <td colspan="7" class="p-0">
        <div class="px-4 py-2 s-panel-inner">
          <table class="w-full"><thead><tr class="text-[9px] t-disabled border-b b-light">
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

function _estimerCAFamille(metier, famCode) {
  const clients = _S.clientsByMetier?.get(metier);
  if (!clients) return 0;
  let totalCA = 0, count = 0;
  for (const cc of clients) {
    const artMap = _S.ventesClientArticleFull?.get(cc) || _S.ventesClientArticle?.get(cc);
    if (!artMap) continue;
    let clientCA = 0;
    for (const [code, data] of artMap) {
      if (_getFamFromArticle(code) === famCode) clientCA += (data.sumCA || 0);
    }
    if (clientCA > 0) { totalCA += clientCA; count++; }
  }
  return count > 0 ? totalCA / count : 0;
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

    for (const cc of clientSet) {
      const artMap = _S.ventesClientArticleFull?.get(cc) || _S.ventesClientArticle?.get(cc);
      if (!artMap) continue;
      const famsVues = new Set();
      for (const code of artMap.keys()) {
        const fam = _getFamFromArticle(code);
        if (fam && fam !== 'Non Classé') famsVues.add(fam);
      }
      for (const fam of famsVues) famCount.set(fam, (famCount.get(fam) || 0) + 1);
    }

    const famillesAttendues = new Map();
    for (const [fam, count] of famCount) {
      const taux = count / totalClients;
      if (taux >= seuilPct) famillesAttendues.set(fam, { nbClients: count, totalClients, taux });
    }
    if (famillesAttendues.size > 0) metierFamillesMap.set(metier, famillesAttendues);
  }

  // Étape 2 : détection des écarts par commercial
  const resultsByCommercial = [];
  for (const [commercial, ccSet] of _S.clientsByCommercial) {
    const opportunites = [];

    for (const cc of ccSet) {
      const info = _S.chalandiseData?.get(cc);
      if (!info?.metier) continue;
      if (!_clientPassesFilters(info)) continue;

      const famillesAttendues = metierFamillesMap.get(info.metier);
      if (!famillesAttendues) continue;

      // Familles effectivement achetées
      const artMap = _S.ventesClientArticleFull?.get(cc) || _S.ventesClientArticle?.get(cc);
      const famsAchetees = new Set();
      if (artMap) {
        for (const code of artMap.keys()) {
          const fam = _getFamFromArticle(code);
          if (fam) famsAchetees.add(fam);
        }
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
            caEstime: _estimerCAFamille(info.metier, fam)
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
    const top5 = r.opportunites.slice(0, 5);
    const hasMore = r.opportunites.length > 5;

    const detailRows = r.opportunites.map(o => {
      return `<tr class="text-[10px] b-light border-b hover:bg-gray-50 dark:hover:bg-gray-800/30">
        <td class="py-1 pr-2">${_unikLink(o.cc)}</td>
        <td class="py-1 pr-2 t-primary">${escapeHtml(o.nom)}</td>
        <td class="py-1 pr-2"><span class="text-[9px] px-1.5 py-0.5 rounded-full border b-light s-panel-inner t-secondary">${escapeHtml(o.metier)}</span></td>
        <td class="py-1 pr-2 font-bold t-primary">${escapeHtml(o.famLib)}</td>
        <td class="py-1 pr-2 text-center t-disabled">${Math.round(o.tauxReseau * 100)}%</td>
        <td class="py-1 text-right font-bold t-primary">${formatEuro(o.caEstime)}</td>
      </tr>`;
    }).join('');

    return `<div class="s-card rounded-xl border mb-2">
      <div class="flex items-center justify-between px-3 py-2 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/30 rounded-t-xl" onclick="window._laboToggleFamDetail(${idx})">
        <div class="flex items-center gap-2">
          <span class="text-[11px] font-bold t-primary">${escapeHtml(r.commercial)}</span>
          <span class="text-[9px] px-2 py-0.5 rounded-full s-panel-inner border b-light font-bold" style="color:var(--c-action)">${r.opportunites.length} opportunité${r.opportunites.length > 1 ? 's' : ''}</span>
        </div>
        <span class="text-[11px] font-bold" style="color:var(--c-action)">${formatEuro(r.totalCA)} potentiel</span>
      </div>
      <div id="laboFamDetail${idx}" class="hidden px-3 pb-2">
        <div class="overflow-x-auto"><table class="w-full"><thead><tr class="text-[9px] t-disabled border-b b-light">
          <th class="text-left py-1 pr-2">Code</th><th class="text-left py-1 pr-2">Client</th><th class="text-left py-1 pr-2">Métier</th><th class="text-left py-1 pr-2">Famille manquante</th><th class="text-center py-1 pr-2">Taux réseau</th><th class="text-right py-1">CA estimé</th>
        </tr></thead><tbody>${detailRows}</tbody></table></div>
      </div>
    </div>`;
  }).join('');

  return sliderHtml + cards;
}

// ═══════════════════════════════════════════════════════════════
// Render Labo Tab
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

  // Compute
  const silencieuxData = computeCommercialSilencieux();
  const familleData = computeFamilleCommercial();

  // Summary stats
  const totalSil = silencieuxData.reduce((s, r) => s + r.nbSilencieux, 0);
  const totalPerdus = silencieuxData.reduce((s, r) => s + r.nbPerdus, 0);
  const totalCaRisque = silencieuxData.reduce((s, r) => s + r.caSilencieux + r.caPerdus, 0);
  const totalOpp = familleData.resultsByCommercial.reduce((s, r) => s + r.opportunites.length, 0);
  const totalCaPotentiel = familleData.resultsByCommercial.reduce((s, r) => s + r.totalCA, 0);

  el.innerHTML = `
    <!-- Sub-tab navigation -->
    <div class="flex gap-1 mb-3 border-b b-light pb-1">
      <button id="laboSubSil" onclick="window._laboSwitchSub('sil')" class="text-[11px] px-3 py-1.5 rounded-t font-bold border-b-2 border-transparent hover:bg-gray-100 dark:hover:bg-gray-800/40 transition-colors">
        Commercial × Silencieux
        ${totalSil + totalPerdus > 0 ? `<span class="ml-1 text-[9px] px-1.5 py-0.5 rounded-full bg-red-100 text-red-700 border border-red-200">${totalSil + totalPerdus}</span>` : ''}
      </button>
      <button id="laboSubFam" onclick="window._laboSwitchSub('fam')" class="text-[11px] px-3 py-1.5 rounded-t font-bold border-b-2 border-transparent hover:bg-gray-100 dark:hover:bg-gray-800/40 transition-colors">
        Famille × Commercial
        ${totalOpp > 0 ? `<span class="ml-1 text-[9px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 border border-amber-200">${totalOpp}</span>` : ''}
      </button>
    </div>

    <!-- KPI banner -->
    <div id="laboKpiBanner" class="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
      <div class="s-card rounded-xl p-2 text-center"><div class="text-lg font-bold" style="color:var(--c-caution)">${totalSil}</div><div class="text-[9px] t-disabled">Silencieux 30-60j</div></div>
      <div class="s-card rounded-xl p-2 text-center"><div class="text-lg font-bold" style="color:var(--c-danger)">${totalPerdus}</div><div class="text-[9px] t-disabled">Perdus &gt;60j</div></div>
      <div class="s-card rounded-xl p-2 text-center"><div class="text-lg font-bold c-danger">${formatEuro(totalCaRisque)}</div><div class="text-[9px] t-disabled">CA en jeu</div></div>
      <div class="s-card rounded-xl p-2 text-center"><div class="text-lg font-bold" style="color:var(--c-action)">${formatEuro(totalCaPotentiel)}</div><div class="text-[9px] t-disabled">Potentiel familles</div></div>
    </div>

    <!-- Content panels -->
    <div id="laboContentSil" class="s-card rounded-xl border p-3">${_renderCommercialSilencieux(silencieuxData)}</div>
    <div id="laboContentFam" class="s-card rounded-xl border p-3 hidden">${_renderFamilleCommercial(familleData)}</div>
  `;

  // Cache computed data for clipboard
  _S._laboSilData = silencieuxData;
  _S._laboFamData = familleData;

  // Activate first sub-tab
  window._laboSwitchSub('sil');
}

// ═══════════════════════════════════════════════════════════════
// Global handlers
// ═══════════════════════════════════════════════════════════════

window._laboSwitchSub = function(sub) {
  const silBtn = document.getElementById('laboSubSil');
  const famBtn = document.getElementById('laboSubFam');
  const silContent = document.getElementById('laboContentSil');
  const famContent = document.getElementById('laboContentFam');
  if (!silBtn || !famBtn) return;

  const activeClass = 'border-amber-500 text-amber-600';
  const inactiveClass = 'border-transparent';

  if (sub === 'sil') {
    silBtn.className = silBtn.className.replace(inactiveClass, activeClass);
    famBtn.className = famBtn.className.replace(activeClass, inactiveClass);
    if (silContent) silContent.classList.remove('hidden');
    if (famContent) famContent.classList.add('hidden');
  } else {
    famBtn.className = famBtn.className.replace(inactiveClass, activeClass);
    silBtn.className = silBtn.className.replace(activeClass, inactiveClass);
    if (famContent) famContent.classList.remove('hidden');
    if (silContent) silContent.classList.add('hidden');
  }
};

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
  const famContent = document.getElementById('laboContentFam');
  if (famContent) famContent.innerHTML = _renderFamilleCommercial(famData);
};
