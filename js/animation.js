// © 2026 Jawad El Barkaoui — Tous droits réservés
// PRISME — animation.js
// Onglet Animation : préparation d'animations commerciales par marque
// ═══════════════════════════════════════════════════════════════
'use strict';

import { _S } from './state.js';
import { formatEuro, escapeHtml, famLib, _copyCodeBtn } from './utils.js';
import { computeAnimation } from './engine.js';

// ═══════════════════════════════════════════════════════════════
// Chargement du catalogue marques (async, non bloquant)
// ═══════════════════════════════════════════════════════════════

export async function loadCatalogueMarques() {
  try {
    const resp = await fetch('js/catalogue-marques.json');
    if (!resp.ok) { console.warn('[PRISME] catalogue-marques.json non trouvé'); return; }
    const data = await resp.json();

    _S.catalogueMarques = new Map();
    _S.marqueArticles = new Map();
    _S.catalogueDesignation = new Map();
    _S.catalogueFamille = new Map();

    // Detect format: new indexed format has M/F/A keys
    if (data.M && data.F && data.A) {
      const marques = data.M;   // string[]
      const familles = data.F;  // [libFam, sousFam][]
      const articles = data.A;  // {code: [mIdx, fIdx, designation]}

      for (const [rawCode, entry] of Object.entries(articles)) {
        const code = rawCode.replace(/^0+/, '').padStart(6, '0');
        const [mIdx, fIdx, designation] = entry;
        const marque = marques[mIdx] || 'Inconnu';

        _S.catalogueMarques.set(code, marque);
        if (!_S.marqueArticles.has(marque)) _S.marqueArticles.set(marque, new Set());
        _S.marqueArticles.get(marque).add(code);

        if (designation) _S.catalogueDesignation.set(code, designation);
        if (familles[fIdx]) {
          const [libFam, sousFam] = familles[fIdx];
          _S.catalogueFamille.set(code, { libFam: libFam || '', sousFam: sousFam || '' });
        }
      }
    } else {
      // Legacy flat format: {code: marque}
      for (const [rawCode, marque] of Object.entries(data)) {
        const code = rawCode.replace(/^0+/, '').padStart(6, '0');
        _S.catalogueMarques.set(code, marque);
        if (!_S.marqueArticles.has(marque)) _S.marqueArticles.set(marque, new Set());
        _S.marqueArticles.get(marque).add(code);
      }
    }

    _S.marquesList = [..._S.marqueArticles.keys()].filter(m => typeof m === 'string' && m.length > 0).sort();
    console.log(`[PRISME] Catalogue marques : ${_S.catalogueMarques.size} articles, ${_S.marquesList.length} marques`);
  } catch (e) {
    console.warn('[PRISME] Erreur chargement catalogue marques:', e);
  }
}

// ═══════════════════════════════════════════════════════════════
// Recherche marque — command palette
// ═══════════════════════════════════════════════════════════════

export function initAnimationSearch() {
  const input = document.getElementById('animSearchInput');
  const results = document.getElementById('animSearchResults');
  if (!input || !results) return;

  let debounce;
  input.addEventListener('input', () => {
    clearTimeout(debounce);
    debounce = setTimeout(() => {
      const q = input.value.trim().toLowerCase();
      if (q.length < 2) { results.classList.add('hidden'); return; }

      const matches = (_S.marquesList || [])
        .filter(m => m && typeof m === 'string' && m.toLowerCase().includes(q))
        .slice(0, 15);

      if (!matches.length) {
        results.innerHTML = '<div class="p-3 text-[11px] t-disabled">Aucune marque trouvée</div>';
        results.classList.remove('hidden');
        return;
      }

      results.innerHTML = matches.map(m => {
        const nbArt = _S.marqueArticles?.get(m)?.size || 0;
        const safe = m.replace(/'/g, "\\'").replace(/"/g, '&quot;');
        return `<div class="px-3 py-2 hover:s-hover cursor-pointer border-b b-light text-[12px]"
          onclick="window._selectAnimMarque('${safe}')">
          <span class="font-bold t-primary">${escapeHtml(m)}</span>
          <span class="t-disabled ml-2">${nbArt} articles</span>
        </div>`;
      }).join('');
      results.classList.remove('hidden');
    }, 200);
  });

  document.addEventListener('click', (e) => {
    if (!input.contains(e.target) && !results.contains(e.target)) {
      results.classList.add('hidden');
    }
  });
}

// ═══════════════════════════════════════════════════════════════
// Sélection marque + rendu
// ═══════════════════════════════════════════════════════════════

window._selectAnimMarque = function(marque) {
  const input = document.getElementById('animSearchInput');
  const results = document.getElementById('animSearchResults');
  if (input) input.value = marque;
  if (results) results.classList.add('hidden');

  const data = computeAnimation(marque);
  if (!data) return;
  _S._animationData = data;

  const el = document.getElementById('animContent');
  if (el) el.innerHTML = _renderAnimation(data);
};

// ═══════════════════════════════════════════════════════════════
// Rendu principal
// ═══════════════════════════════════════════════════════════════

function _stockBadge(status, qty) {
  if (status === 'enStock') return `<span class="text-[8px] px-1.5 py-0.5 rounded-full font-bold" style="background:#dcfce7;color:#166534">En stock (${qty})</span>`;
  if (status === 'rupture') return '<span class="text-[8px] px-1.5 py-0.5 rounded-full font-bold" style="background:#fef3c7;color:#92400e">Rupture</span>';
  return '<span class="text-[8px] px-1.5 py-0.5 rounded-full font-bold" style="background:#fee2e2;color:#991b1b">Absent</span>';
}

function _reseauBadge(n) {
  if (n >= 3) return `<span class="text-[8px] px-1.5 py-0.5 rounded-full font-bold" style="background:#dbeafe;color:#1e40af">${n} ag.</span>`;
  if (n > 0) return `<span class="text-[8px] px-1.5 py-0.5 rounded-full" style="background:#f1f5f9;color:#64748b">${n} ag.</span>`;
  return '';
}

function _renderAnimation(data) {
  if (!data) return '<div class="text-center py-8 t-disabled">Aucune donnée pour cette marque.</div>';

  // ── Header ──
  let html = `<div class="mb-4">
    <h3 class="font-extrabold text-lg t-primary">⚡ Animation ${escapeHtml(data.marque)}</h3>
    <div class="flex flex-wrap gap-3 mt-2 text-[11px]">
      <span class="px-2 py-1 rounded-lg border b-light">${data.nbArticlesTotal} articles catalogue</span>
      <span class="px-2 py-1 rounded-lg font-bold" style="background:#dcfce7;color:#166534">${data.nbEnStock} en stock</span>
      <span class="px-2 py-1 rounded-lg font-bold" style="background:#fef3c7;color:#92400e">${data.nbRupture} ruptures</span>
      <span class="px-2 py-1 rounded-lg font-bold" style="background:#fee2e2;color:#991b1b">${data.nbAbsent} absents</span>
      <span class="px-2 py-1 rounded-lg font-bold" style="background:#dbeafe;color:#1e40af">${data.nbVendusReseau} vendus réseau</span>
    </div>
    <div class="flex flex-wrap gap-3 mt-2 text-[11px]">
      <span>${data.totalClientsActifs} clients acheteurs</span>
      <span>${data.totalProspects} prospects</span>
      <span>${data.totalReconquete} à reconquérir</span>
      <span class="font-bold c-action">${formatEuro(data.caMarqueAgence)} CA marque</span>
    </div>
  </div>`;

  // ── Bloc Clients ──
  html += `<div class="s-card rounded-xl border overflow-hidden mb-4">
    <div class="px-4 py-3 s-card-alt border-b">
      <div class="flex items-center justify-between">
        <h4 class="font-extrabold text-sm t-primary">📞 Qui appeler</h4>
        <button onclick="window._animExportTournee()" class="text-[10px] px-3 py-1.5 rounded-lg border b-light s-card t-secondary hover:t-primary">📥 Export Tournée CSV</button>
      </div>
    </div>`;

  // Acheteurs
  html += _renderClientAccordion('🟢', 'Clients acheteurs', data.clients.acheteurs, 'acheteur', true);
  // Prospects
  html += _renderClientAccordion('🔵', 'Prospects (même métier)', data.clients.prospects, 'prospect', false);
  // Reconquête
  html += _renderClientAccordion('🔴', 'À reconquérir (>60j)', data.clients.reconquete, 'reconquete', false);

  html += '</div>';

  // ── Bloc Articles par famille ──
  html += `<div class="s-card rounded-xl border overflow-hidden mb-4">
    <div class="px-4 py-3 s-card-alt border-b">
      <div class="flex items-center justify-between">
        <h4 class="font-extrabold text-sm t-primary">📦 Articles de la marque</h4>
        <button onclick="window._animExportArticles()" class="text-[10px] px-3 py-1.5 rounded-lg border b-light s-card t-secondary hover:t-primary">📥 Export CSV Articles</button>
      </div>
    </div>`;

  data.familles.forEach((f, fi) => {
    const top20 = f.articles.slice(0, 20);
    const hasMore = f.articles.length > 20;
    const hasSousFam = f.articles.some(a => a.sousFam);
    const artRows = top20.map(a => `<tr class="border-b b-light hover:s-hover text-[11px]">
      <td class="py-1.5 px-2 font-mono">${_copyCodeBtn(a.code)}</td>
      <td class="py-1.5 px-2 max-w-[200px] truncate" title="${escapeHtml(a.libelle)}">${escapeHtml(a.libelle)}</td>
      ${hasSousFam ? `<td class="py-1.5 px-2 text-[9px] t-secondary max-w-[120px] truncate" title="${escapeHtml(a.sousFam || '')}">${escapeHtml(a.sousFam || '—')}</td>` : ''}
      <td class="py-1.5 px-2 text-center">${_stockBadge(a.stockStatus, a.stockActuel)}</td>
      <td class="py-1.5 px-2 text-right font-bold c-action">${a.caAgence > 0 ? formatEuro(a.caAgence) : '—'}</td>
      <td class="py-1.5 px-2 text-right">${a.nbClients > 0 ? a.nbClients : '—'}</td>
      <td class="py-1.5 px-2 text-center">${_reseauBadge(a.nbAgencesReseau)}</td>
    </tr>`).join('');
    const moreBtn = hasMore ? `<div class="px-3 py-1.5 text-[10px] t-disabled cursor-pointer hover:underline" onclick="window._animMoreFamArts(this,${fi})">… voir les ${f.articles.length - 20} suivants</div>` : '';

    html += `<details class="border-b b-light"${fi === 0 ? ' open' : ''}>
      <summary class="flex items-center justify-between px-4 py-2.5 cursor-pointer select-none hover:s-hover">
        <div class="flex items-center gap-2">
          <span class="acc-arrow t-disabled">▶</span>
          <span class="font-bold text-[12px] t-primary">${escapeHtml(f.name)}</span>
          <span class="text-[9px] t-disabled">${f.articles.length} articles</span>
        </div>
        <div class="flex items-center gap-2 text-[9px]">
          <span class="font-bold" style="color:#166534">${f.enStock} stock</span>
          <span class="font-bold" style="color:#92400e">${f.rupture} rupt.</span>
          <span class="font-bold" style="color:#991b1b">${f.absent} abs.</span>
        </div>
      </summary>
      <div class="overflow-x-auto">
        <table class="min-w-full">
          <thead class="s-panel-inner t-inverse text-[10px]">
            <tr><th class="py-1.5 px-2 text-left">Code</th><th class="py-1.5 px-2 text-left">Libellé</th>${hasSousFam ? '<th class="py-1.5 px-2 text-left">Sous-famille</th>' : ''}<th class="py-1.5 px-2 text-center">Stock</th><th class="py-1.5 px-2 text-right">CA agence</th><th class="py-1.5 px-2 text-right">Clients</th><th class="py-1.5 px-2 text-center">Réseau</th></tr>
          </thead>
          <tbody id="animFamArts_${fi}">${artRows}</tbody>
        </table>
        ${moreBtn}
      </div>
    </details>`;
  });

  html += '</div>';
  return html;
}

// ── Client accordion helper ──
function _renderClientAccordion(icon, title, clients, type, openByDefault) {
  if (!clients.length) return `<details class="border-b b-light">
    <summary class="px-4 py-2.5 cursor-pointer select-none hover:s-hover text-[12px] t-disabled">
      <span class="acc-arrow t-disabled">▶</span> ${icon} 0 ${escapeHtml(title)}
    </summary></details>`;

  const top20 = clients.slice(0, 20);
  const hasMore = clients.length > 20;

  const rows = top20.map(c => {
    const ccSafe = (c.cc || '').replace(/'/g, "\\'");
    const caCol = type === 'prospect'
      ? `<td class="py-1.5 px-2 text-right t-disabled">${c.caTotalPDV > 0 ? formatEuro(c.caTotalPDV) : '—'}</td>`
      : `<td class="py-1.5 px-2 text-right font-bold c-action">${formatEuro(c.caMarque || 0)}</td>`;
    const extraCol = type === 'reconquete'
      ? `<td class="py-1.5 px-2 text-center text-[9px] c-danger font-bold">${c.daysSince}j</td>`
      : type === 'acheteur'
        ? `<td class="py-1.5 px-2 text-center text-[9px]">${c.nbArticlesMarque || 0} art.</td>`
        : '<td class="py-1.5 px-2"></td>';
    return `<tr class="border-b b-light hover:s-hover text-[11px] cursor-pointer" onclick="if(window.openClient360)window.openClient360('${ccSafe}','animation')">
      <td class="py-1.5 px-2 max-w-[180px] truncate font-bold" title="${escapeHtml(c.nom)}">${escapeHtml(c.nom)}</td>
      <td class="py-1.5 px-2">${escapeHtml(c.metier)}</td>
      <td class="py-1.5 px-2">${escapeHtml(c.cp)}</td>
      <td class="py-1.5 px-2">${escapeHtml(c.commercial)}</td>
      ${caCol}${extraCol}
    </tr>`;
  }).join('');

  const moreRow = hasMore ? `<div class="px-3 py-2 text-[10px] t-disabled">… et ${clients.length - 20} autres</div>` : '';
  const caHeader = type === 'prospect' ? 'CA PDV' : 'CA marque';
  const extraHeader = type === 'reconquete' ? 'Silence' : type === 'acheteur' ? 'Articles' : '';

  return `<details class="border-b b-light"${openByDefault ? ' open' : ''}>
    <summary class="flex items-center justify-between px-4 py-2.5 cursor-pointer select-none hover:s-hover">
      <div class="flex items-center gap-2">
        <span class="acc-arrow t-disabled">▶</span>
        <span class="font-bold text-[12px] t-primary">${icon} ${clients.length} ${escapeHtml(title)}</span>
      </div>
    </summary>
    <div class="overflow-x-auto">
      <table class="min-w-full">
        <thead class="s-panel-inner t-inverse text-[10px]">
          <tr><th class="py-1.5 px-2 text-left">Nom</th><th class="py-1.5 px-2">Métier</th><th class="py-1.5 px-2">CP</th><th class="py-1.5 px-2">Commercial</th><th class="py-1.5 px-2 text-right">${caHeader}</th><th class="py-1.5 px-2 text-center">${extraHeader}</th></tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
      ${moreRow}
    </div>
  </details>`;
}

// ═══════════════════════════════════════════════════════════════
// Voir plus articles par famille
// ═══════════════════════════════════════════════════════════════

window._animMoreFamArts = function(el, fi) {
  const data = _S._animationData;
  if (!data) return;
  const f = data.familles[fi];
  if (!f) return;
  const tbody = document.getElementById(`animFamArts_${fi}`);
  if (!tbody) return;
  const hasSousFam = f.articles.some(a => a.sousFam);
  tbody.innerHTML = f.articles.map(a => `<tr class="border-b b-light hover:s-hover text-[11px]">
    <td class="py-1.5 px-2 font-mono">${_copyCodeBtn(a.code)}</td>
    <td class="py-1.5 px-2 max-w-[200px] truncate" title="${escapeHtml(a.libelle)}">${escapeHtml(a.libelle)}</td>
    ${hasSousFam ? `<td class="py-1.5 px-2 text-[9px] t-secondary max-w-[120px] truncate" title="${escapeHtml(a.sousFam || '')}">${escapeHtml(a.sousFam || '—')}</td>` : ''}
    <td class="py-1.5 px-2 text-center">${_stockBadge(a.stockStatus, a.stockActuel)}</td>
    <td class="py-1.5 px-2 text-right font-bold c-action">${a.caAgence > 0 ? formatEuro(a.caAgence) : '—'}</td>
    <td class="py-1.5 px-2 text-right">${a.nbClients > 0 ? a.nbClients : '—'}</td>
    <td class="py-1.5 px-2 text-center">${_reseauBadge(a.nbAgencesReseau)}</td>
  </tr>`).join('');
  if (el && el.parentNode) el.parentNode.removeChild(el);
};

// ═══════════════════════════════════════════════════════════════
// Exports CSV
// ═══════════════════════════════════════════════════════════════

window._animExportTournee = function() {
  const data = _S._animationData;
  if (!data) return;
  const sep = ';';
  const header = ['Code client', 'Nom', 'Métier', 'CP', 'Commercial', 'Type', 'CA marque'].join(sep);
  const all = [
    ...data.clients.acheteurs.map(c => ({ ...c, type: 'Acheteur', ca: c.caMarque || 0 })),
    ...data.clients.prospects.map(c => ({ ...c, type: 'Prospect', ca: c.caTotalPDV || 0 })),
    ...data.clients.reconquete.map(c => ({ ...c, type: 'Reconquête', ca: c.caMarque || 0 })),
  ].sort((a, b) => (a.cp || '').localeCompare(b.cp || ''));

  const rows = all.map(c => [
    c.cc, `"${(c.nom || '').replace(/"/g, '""')}"`, `"${c.metier}"`, c.cp, `"${c.commercial}"`, c.type, c.ca.toFixed(2)
  ].join(sep));
  const csv = '\uFEFF' + header + '\n' + rows.join('\n');
  _downloadCSV(csv, `PRISME_Tournee_${_safeName(data.marque)}_${_today()}.csv`);
};

window._animExportArticles = function() {
  const data = _S._animationData;
  if (!data) return;
  const sep = ';';
  const header = ['Code', 'Libellé', 'Famille', 'Sous-famille', 'Stock', 'Stock actuel', 'CA agence', 'Agences réseau'].join(sep);
  const rows = data.articles.map(a => [
    a.code, `"${(a.libelle || '').replace(/"/g, '""')}"`, `"${a.famLabel}"`, `"${a.sousFam || ''}"`,
    a.stockStatus === 'enStock' ? 'En stock' : a.stockStatus === 'rupture' ? 'Rupture' : 'Absent',
    a.stockActuel ?? '', a.caAgence.toFixed(2), a.nbAgencesReseau
  ].join(sep));
  const csv = '\uFEFF' + header + '\n' + rows.join('\n');
  _downloadCSV(csv, `PRISME_Articles_${_safeName(data.marque)}_${_today()}.csv`);
};

function _downloadCSV(csv, filename) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  document.body.appendChild(link); link.click(); document.body.removeChild(link);
  URL.revokeObjectURL(link.href);
}

function _safeName(s) { return (s || '').replace(/[^a-zA-Z0-9]/g, '_').slice(0, 30); }
function _today() { return new Date().toISOString().slice(0, 10); }

// ═══════════════════════════════════════════════════════════════
// Render tab (appelé depuis renderAll)
// ═══════════════════════════════════════════════════════════════

export function renderAnimationTab() {
  const el = document.getElementById('tabAnimation');
  if (!el) return;

  if (!_S.catalogueMarques?.size) {
    const msg = _S.catalogueMarques === null
      ? 'Catalogue marques en cours de chargement…'
      : 'Catalogue marques non disponible (js/catalogue-marques.json manquant).';
    document.getElementById('animContent').innerHTML =
      `<div class="text-center py-8 t-disabled text-sm">${msg}</div>`;
    return;
  }

  // Init search si pas encore fait
  initAnimationSearch();
}
