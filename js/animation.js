// © 2026 Jawad El Barkaoui — Tous droits réservés
// PRISME — animation.js
// Onglet Animation : préparation d'animations commerciales par marque
// + sous-onglet Associations (co-achat familial)
// + Pépites Réseau (spécialités par agence vs médiane réseau, période-filtré)
// ═══════════════════════════════════════════════════════════════
'use strict';

import { _S } from './state.js';
import { formatEuro, escapeHtml, famLib, _copyCodeBtn } from './utils.js';
import { computeAnimation } from './engine.js';
import { renderAssociationsTab } from './associations.js';

// ═══════════════════════════════════════════════════════════════
// Onglet Animation — Tab bar interne (Animation / Pépites Réseau)
// ═══════════════════════════════════════════════════════════════

let _animTopView = 'animation'; // 'animation' | 'pepites'

function _animTabBar() {
  const hasMultiStore = _S.storesIntersection?.size > 1;
  if (!hasMultiStore) return ''; // pas de tab bar si mono-agence
  const tab = (key, icon, label) => {
    const active = _animTopView === key;
    return `<button onclick="window._animSetTopView('${key}')"
      class="text-[12px] px-5 py-2.5 cursor-pointer border-b-2 transition-colors font-semibold ${active ? 'font-bold' : 'hover:t-primary'}"
      style="${active ? 'border-color:var(--c-action);color:var(--t-primary)' : 'border-color:transparent;color:var(--t-secondary)'}">${icon} ${label}</button>`;
  };
  return `<div style="position:sticky;top:0;z-index:20;background:var(--color-bg-primary,#0f172a);padding-top:4px">
    <div class="flex gap-0 border-b b-light mb-3">
      ${tab('animation', '🎯', 'Animation Marque')}
      ${tab('pepites', '💎', 'Pépites Réseau')}
    </div>
  </div>`;
}

window._animSetTopView = function(view) {
  _animTopView = view;
  _renderAnimTabBar();
  const searchWrap = document.getElementById('animSearchWrapper');
  const content = document.getElementById('animContent');
  if (view === 'pepites') {
    if (searchWrap) searchWrap.classList.add('hidden');
    if (content) { content.innerHTML = _renderPepitesReseauContent(); delete content.dataset.animActive; }
  } else {
    if (searchWrap) searchWrap.classList.remove('hidden');
    // Re-render : si une animation marque était active, la restaurer, sinon overview familles
    if (content) {
      if (_S._animationData) {
        content.innerHTML = _renderAnimation(_S._animationData);
        content.dataset.animActive = '1';
      } else if (_S._prData?.families?.length) {
        content.innerHTML = _renderFamilyOverview();
        delete content.dataset.animActive;
      }
    }
  }
};

function _renderAnimTabBar() {
  const bar = document.getElementById('animTabBar');
  if (bar) bar.innerHTML = _animTabBar();
}

// ═══════════════════════════════════════════════════════════════
// Pépites Réseau — Top articles par agence vs médiane réseau
// Utilise _byMonthStoreArtCanal pour le filtre période
// ═══════════════════════════════════════════════════════════════

let _pepStoreFilter = ''; // '' = toutes agences, 'AGxx' = filtre une agence
const _PEP_TOP = 10;

function _buildPeriodFilteredStoreCA() {
  // Pépites = comptoir (MAGASIN prélevé) uniquement
  const bmsac = _S._byMonthStoreArtCanal;
  const pStart = _S.periodFilterStart;
  const pEnd = _S.periodFilterEnd;
  const hasPeriod = !!(pStart || pEnd);

  // Fallback pleine période — ventesParMagasinByCanal MAGASIN prélevé
  if (!bmsac) {
    const vbc = _S.ventesParMagasinByCanal || {};
    const result = {};
    for (const store in vbc) {
      result[store] = {};
      const magMap = vbc[store]?.['MAGASIN'];
      if (!magMap) continue;
      for (const code in magMap) {
        if (!/^\d{6}$/.test(code)) continue;
        const d = magMap[code];
        const ca = d.sumPrelevee || 0; // CA prélevé
        if (!ca) continue;
        result[store][code] = { sumCA: ca, countBL: d.countBL || 0 };
      }
    }
    return { data: result, filtered: false };
  }

  // Via _byMonthStoreArtCanal — canal MAGASIN, sumPrelevee = CA prélevé
  const startIdx = hasPeriod && pStart ? (pStart.getFullYear() * 12 + pStart.getMonth()) : 0;
  const endIdx = hasPeriod && pEnd ? (pEnd.getFullYear() * 12 + pEnd.getMonth()) : 999999;
  const result = {};

  for (const store in bmsac) {
    result[store] = {};
    const codeMap = bmsac[store]?.['MAGASIN'];
    if (!codeMap) continue;
    for (const code in codeMap) {
      if (!/^\d{6}$/.test(code)) continue;
      const months = codeMap[code];
      let sumCA = 0, countBL = 0;
      for (const midxStr in months) {
        const midx = +midxStr;
        if (midx < startIdx || midx > endIdx) continue;
        sumCA += months[midxStr].sumPrelevee || 0; // CA prélevé
        countBL += months[midxStr].countBL || 0;
      }
      if (!sumCA) continue;
      result[store][code] = { sumCA, countBL };
    }
  }

  return { data: result, filtered: hasPeriod };
}

function _renderPepitesReseauContent() {
  const myStore = _S.selectedMyStore;
  const { data: storeCA, filtered: isPeriodFiltered } = _buildPeriodFilteredStoreCA();
  const stores = Object.keys(storeCA).filter(s => s !== myStore).sort();
  if (!stores.length) return '<div class="t-disabled text-sm text-center py-12">Chargez un consommé multi-agences pour activer les Pépites Réseau.</div>';

  const artFam = _S.articleFamille || {};
  const catFam = _S.catalogueFamille;
  const allStores = [myStore, ...stores];

  // Pré-calcul : médiane CA réseau par article
  const articleMedian = new Map();
  const allCodes = new Set();
  for (const store of allStores) {
    const sd = storeCA[store];
    if (!sd) continue;
    for (const code of Object.keys(sd)) allCodes.add(code);
  }
  for (const code of allCodes) {
    const cas = allStores.map(s => storeCA[s]?.[code]?.sumCA || 0).filter(v => v > 0).sort((a, b) => a - b);
    if (!cas.length) continue;
    const mid = cas.length % 2 === 0 ? (cas[cas.length / 2 - 1] + cas[cas.length / 2]) / 2 : cas[Math.floor(cas.length / 2)];
    articleMedian.set(code, mid);
  }

  // Pour chaque agence, top articles vs médiane réseau
  const storeList = _pepStoreFilter ? allStores.filter(s => s === _pepStoreFilter) : allStores;
  const sections = [];

  for (const store of storeList) {
    const sd = storeCA[store];
    if (!sd) continue;
    const candidates = [];
    for (const [code, data] of Object.entries(sd)) {
      const caStore = data.sumCA || 0;
      if (caStore <= 10) continue;
      const blStore = data.countBL || 0;
      const med = articleMedian.get(code) || 0;
      if (med <= 0) continue;
      const ratio = caStore / med;
      if (ratio < 2.0) continue;
      const cf = catFam?.get(code)?.codeFam || artFam[code] || '';
      const lib = _S.libelleLookup?.[code] || code;
      const fam = famLib(cf) || cf;
      candidates.push({ code, lib, fam, caStore, blStore, median: Math.round(med), ratio: Math.round(ratio * 10) / 10, ecart: Math.round(caStore - med) });
    }
    candidates.sort((a, b) => b.ecart - a.ecart);
    const top = candidates.slice(0, _PEP_TOP);
    if (top.length) {
      const totalEcart = top.reduce((s, a) => s + a.ecart, 0);
      sections.push({ store, top, totalEcart, totalCandidates: candidates.length, isMe: store === myStore });
    }
  }

  sections.sort((a, b) => b.totalEcart - a.totalEcart);

  // Période label
  const pStart = _S.periodFilterStart;
  const pEnd = _S.periodFilterEnd;
  const fmtD = d => d ? d.toLocaleDateString('fr-FR', { month: 'short', year: 'numeric' }) : '';
  const periodLabel = isPeriodFiltered && pStart && pEnd
    ? `<span class="text-[10px] px-2 py-0.5 rounded font-bold" style="background:rgba(59,130,246,0.15);color:#60a5fa">${fmtD(pStart)} → ${fmtD(pEnd)}</span>`
    : '<span class="text-[10px] px-2 py-0.5 rounded" style="background:rgba(100,116,139,0.15);color:var(--t-secondary)">12 mois glissants</span>';

  // Filtre agence
  const filterBtns = allStores.map(s => {
    const active = _pepStoreFilter === s;
    const isMe = s === myStore;
    return `<button onclick="window._pepFilterStore('${s}')"
      class="text-[10px] px-2 py-0.5 rounded border cursor-pointer transition-all ${active ? 'font-bold' : 'hover:t-primary'}"
      style="border-color:${active ? 'var(--c-action)' : 'var(--b-default)'};${active ? 'background:rgba(139,92,246,0.15);color:var(--c-action)' : ''}">${s}${isMe ? ' (moi)' : ''}</button>`;
  }).join('');
  const allActive = !_pepStoreFilter;
  const allBtn = `<button onclick="window._pepFilterStore('')"
    class="text-[10px] px-2 py-0.5 rounded border cursor-pointer transition-all ${allActive ? 'font-bold' : 'hover:t-primary'}"
    style="border-color:${allActive ? 'var(--c-action)' : 'var(--b-default)'};${allActive ? 'background:rgba(139,92,246,0.15);color:var(--c-action)' : ''}">Toutes</button>`;

  let html = `<div class="mb-3">
    <div class="flex items-center gap-2 mb-2 flex-wrap">
      <span class="text-[11px] t-secondary font-semibold">Agence :</span>
      ${allBtn} ${filterBtns}
      <span class="ml-2">${periodLabel}</span>
    </div>
    <p class="text-[10px] t-disabled">Spécialités de chaque agence : articles où le CA dépasse ≥ 2× la médiane réseau. ${isPeriodFiltered ? 'Filtré par la période sélectionnée.' : 'Utilisez le filtre période pour cibler un mois.'}</p>
  </div>`;

  if (!sections.length) {
    html += '<div class="py-8 text-center t-disabled text-sm italic">Aucune pépite identifiée pour cette sélection.</div>';
    return html;
  }

  for (const sec of sections) {
    const storeColor = sec.isMe ? '#3b82f6' : '#22c55e';
    const storeLabel = sec.isMe ? `${sec.store} (moi)` : sec.store;
    html += `<details class="mb-3 s-card rounded-lg overflow-hidden" ${_pepStoreFilter ? 'open' : ''}>
      <summary class="px-4 py-3 cursor-pointer select-none flex items-center justify-between hover:s-hover" style="background:${storeColor}0a">
        <div class="flex items-center gap-2">
          <span class="font-bold text-[13px]" style="color:${storeColor}">💎 ${storeLabel}</span>
          <span class="text-[10px] t-disabled">${sec.totalCandidates} spécialités · ${formatEuro(sec.totalEcart)} au-dessus de la médiane</span>
        </div>
        <span class="acc-arrow" style="color:${storeColor}">▶</span>
      </summary>
      <div class="overflow-x-auto">
        <table class="w-full text-[11px] border-collapse">
          <thead><tr class="border-b b-light text-[10px]" style="color:var(--t-secondary)">
            <th class="py-1.5 px-3 text-left">Code</th>
            <th class="py-1.5 px-3 text-left">Libellé</th>
            <th class="py-1.5 px-3 text-left">Famille</th>
            <th class="py-1.5 px-3 text-right">CA ${sec.store}</th>
            <th class="py-1.5 px-3 text-right">BL</th>
            <th class="py-1.5 px-3 text-right">Méd. réseau</th>
            <th class="py-1.5 px-3 text-right">×</th>
          </tr></thead>
          <tbody>${sec.top.map(a => {
            return `<tr class="border-b b-light hover:s-hover cursor-pointer" onclick="if(window.openArticlePanel)window.openArticlePanel('${a.code}','animation')">
              <td class="py-1.5 px-3 font-mono t-disabled">${a.code} <span class="opacity-50 hover:opacity-100">🔍</span></td>
              <td class="py-1.5 px-3 t-primary" style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(a.lib)}</td>
              <td class="py-1.5 px-3 t-secondary text-[10px]">${escapeHtml(a.fam)}</td>
              <td class="py-1.5 px-3 text-right font-bold" style="color:${storeColor}">${formatEuro(a.caStore)}</td>
              <td class="py-1.5 px-3 text-right t-secondary">${a.blStore}</td>
              <td class="py-1.5 px-3 text-right t-disabled">${formatEuro(a.median)}</td>
              <td class="py-1.5 px-3 text-right font-bold" style="color:#f59e0b">${a.ratio}×</td>
            </tr>`;
          }).join('')}</tbody>
        </table>
      </div>
    </details>`;
  }

  return html;
}

window._pepFilterStore = function(store) {
  _pepStoreFilter = store;
  const content = document.getElementById('animContent');
  if (content) content.innerHTML = _renderPepitesReseauContent();
};

// Aliases marques commerciales → fournisseur catalogue
const MARQUE_ALIASES = {
  'dewalt': 'STANLEY BLACK & DECKER FRANCE',
  'facom': 'STANLEY BLACK & DECKER FRANCE',
  'black+decker': 'STANLEY BLACK & DECKER FRANCE',
  'black decker': 'STANLEY BLACK & DECKER FRANCE',
  'milwaukee': 'TECHTRONIC INDUSTRIES FRANCE',
  'ryobi': 'TECHTRONIC INDUSTRIES FRANCE',
  'hikoki': 'KOKI HOLDINGS (EUROPE)',
  'metabo': 'KOKI HOLDINGS (EUROPE)',
};

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
    _S.catalogueStatut = new Map();
    _S.catalogueEAN = new Map(); // EAN → code article

    // Detect format: new indexed format has M/F/A keys
    if (data.M && data.F && data.A) {
      const marques = data.M;
      const familles = data.F;
      const articles = data.A;

      for (const [rawCode, entry] of Object.entries(articles)) {
        const code = rawCode.replace(/^0+/, '').padStart(6, '0');
        const [mIdx, fIdx, designation, sIdx] = entry;
        const marque = marques[mIdx] || 'Inconnu';

        _S.catalogueMarques.set(code, marque);
        if (!_S.marqueArticles.has(marque)) _S.marqueArticles.set(marque, new Set());
        _S.marqueArticles.get(marque).add(code);

        if (designation) _S.catalogueDesignation.set(code, designation);
        // Statut catalogue national (Fin de stock, Fin de série, etc.)
        if (data.S && sIdx > 0) _S.catalogueStatut.set(code, data.S[sIdx] || '');
        if (familles[fIdx]) {
          const fam = familles[fIdx];
          _S.catalogueFamille.set(code, {
            codeFam: fam[0] || '', libFam: fam[1] || '',
            codeSousFam: fam[2] || '', sousFam: fam[3] || ''
          });
        }
      }
    } else {
      for (const [rawCode, marque] of Object.entries(data)) {
        const code = rawCode.replace(/^0+/, '').padStart(6, '0');
        _S.catalogueMarques.set(code, marque);
        if (!_S.marqueArticles.has(marque)) _S.marqueArticles.set(marque, new Set());
        _S.marqueArticles.get(marque).add(code);
      }
    }

    // EAN → code article
    if (data.E) {
      for (const [ean, code] of Object.entries(data.E)) _S.catalogueEAN.set(ean, code);
    }

    _S.marquesList = [..._S.marqueArticles.keys()].filter(m => typeof m === 'string' && m.length > 0).sort();
    console.log(`[PRISME] Catalogue marques : ${_S.catalogueMarques.size} articles, ${_S.marquesList.length} marques, ${_S.catalogueEAN.size} EAN`);
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
  if (input._animBound) return; // éviter double-bind
  input._animBound = true;

  let debounce;
  input.addEventListener('input', () => {
    clearTimeout(debounce);
    debounce = setTimeout(() => {
      const q = input.value.trim().toLowerCase();
      if (q.length < 2) { results.classList.add('hidden'); return; }

      const directMatches = (_S.marquesList || [])
        .filter(m => m && typeof m === 'string' && m.toLowerCase().includes(q));

      const aliasHits = [];
      const directSet = new Set(directMatches);
      for (const [alias, marque] of Object.entries(MARQUE_ALIASES)) {
        if (alias.includes(q) && !directSet.has(marque)) {
          directSet.add(marque);
          aliasHits.push({ alias, marque });
        }
      }

      const combined = [
        ...aliasHits.map(h => ({ marque: h.marque, alias: h.alias })),
        ...directMatches.map(m => ({ marque: m, alias: null })),
      ].slice(0, 15);

      if (!combined.length) {
        results.innerHTML = '<div class="p-3 text-[11px] t-disabled">Aucune marque trouvée</div>';
        results.classList.remove('hidden');
        return;
      }

      results.innerHTML = combined.map(({ marque: m, alias }) => {
        const nbArt = _S.marqueArticles?.get(m)?.size || 0;
        const safe = m.replace(/'/g, "\\'").replace(/"/g, '&quot;');
        const label = alias
          ? `<span class="font-bold t-primary">${escapeHtml(alias.toUpperCase())}</span> <span class="t-disabled">→</span> <span class="t-secondary">${escapeHtml(m)}</span>`
          : `<span class="font-bold t-primary">${escapeHtml(m)}</span>`;
        return `<div class="px-3 py-2 hover:s-hover cursor-pointer border-b b-light text-[12px]"
          onclick="window._selectAnimMarque('${safe}')">
          ${label}
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
  if (el) { el.innerHTML = _renderAnimation(data); el.dataset.animActive = '1'; }
};

// ═══════════════════════════════════════════════════════════════
// Entrée par famille — depuis Plan Rayon ou vue par défaut
// ═══════════════════════════════════════════════════════════════

const CLASSIF_ORIENTATION = {
  challenger:  { icon: '🔴', label: 'En décalage', conseil: 'Animation de Découverte / Conquête — négociez un stock de lancement avec le fournisseur', style: 'background:#fef2f2;color:#991b1b;border-color:#fecaca' },
  implanter:   { icon: '🟡', label: 'À développer', conseil: 'Animation de Développement — misez sur les best-sellers réseau absents de votre rayon', style: 'background:#fffbeb;color:#92400e;border-color:#fde68a' },
  socle:       { icon: '🟢', label: 'Performante', conseil: 'Animation Expert / VIP — ciblez les nouveautés et les machines premium', style: 'background:#f0fdf4;color:#166534;border-color:#bbf7d0' },
  surveiller:  { icon: '🔵', label: 'À surveiller', conseil: 'Animation ciblée — identifiez les références clés du réseau à tester', style: 'background:#eff6ff;color:#1e40af;border-color:#bfdbfe' },
  inactive:    { icon: '⚪', label: 'Inactive', conseil: 'Animation de Lancement — territoire vierge, commencez par les incontournables réseau', style: 'background:#f8fafc;color:#475569;border-color:#e2e8f0' },
};

/** Trouve le top marques d'une famille par CA réseau */
function _topBrandsForFamily(codeFam) {
  if (!_S.catalogueMarques?.size || !_S.catalogueFamille?.size) return [];
  const vpm = _S.ventesParMagasin || {};
  const myStore = _S.selectedMyStore;

  // Articles de cette famille dans le catalogue
  const famCodes = new Set();
  for (const [code, fam] of _S.catalogueFamille) {
    if (fam.codeFam === codeFam) famCodes.add(code);
  }

  // Agréger CA par marque (réseau + agence)
  const brandCA = new Map(); // marque → {caReseau, caAgence, nbArts}
  for (const [store, arts] of Object.entries(vpm)) {
    for (const code in arts) {
      if (!famCodes.has(code)) continue;
      const marque = _S.catalogueMarques.get(code);
      if (!marque) continue;
      const d = arts[code];
      if (!d || !d.sumCA) continue;
      if (!brandCA.has(marque)) brandCA.set(marque, { caReseau: 0, caAgence: 0, nbArts: 0 });
      const b = brandCA.get(marque);
      if (store === myStore) { b.caAgence += d.sumCA; }
      else { b.caReseau += d.sumCA; }
    }
  }
  // Compter articles par marque
  for (const code of famCodes) {
    const m = _S.catalogueMarques.get(code);
    if (m && brandCA.has(m)) brandCA.get(m).nbArts++;
  }

  return [...brandCA.entries()]
    .map(([marque, d]) => ({ marque, ...d, total: d.caReseau + d.caAgence }))
    .sort((a, b) => b.total - a.total);
}

/** Entrée depuis Plan Rayon : switch vers Animation + affiche les marques de la famille */
window._animFromFamily = function(codeFam) {
  // Switch vers l'onglet Animation
  if (window.switchTab) window.switchTab('animation');
  _S._animFamilyFocus = codeFam;

  // Attendre que le catalogue soit chargé
  const _render = () => {
    const el = document.getElementById('animContent');
    if (!el) return;
    el.innerHTML = _renderFamilyBrands(codeFam);
    el.dataset.animActive = '1';
  };

  if (_S.catalogueMarques?.size) {
    _render();
  } else {
    loadCatalogueMarques().then(_render);
  }
};

function _renderFamilyBrands(codeFam) {
  // Chercher la famille dans Plan Rayon pour le diagnostic
  const prFam = _S._prData?.families?.find(f => f.codeFam === codeFam)
    || _S._prData?.inactiveFamilies?.find(f => f.codeFam === codeFam);
  const classif = prFam?.classifGlobal || 'surveiller';
  const orient = CLASSIF_ORIENTATION[classif] || CLASSIF_ORIENTATION.surveiller;
  const famLib = prFam?.libFam || codeFam;

  const brands = _topBrandsForFamily(codeFam);

  let html = `<div class="mb-4">
    <div class="flex items-center gap-2 mb-3">
      <button onclick="window._animShowFamilies()" class="text-[11px] t-secondary hover:t-primary cursor-pointer">← Familles</button>
      <span class="text-[14px] font-extrabold t-primary">${escapeHtml(famLib)}</span>
      <span class="text-[10px] t-disabled">${codeFam}</span>
    </div>
    <div class="rounded-lg p-3 mb-4 border" style="${orient.style}">
      <div class="font-bold text-[12px]">${orient.icon} Famille ${orient.label}</div>
      <div class="text-[11px] mt-1">${orient.conseil}</div>
    </div>`;

  if (!brands.length) {
    html += '<div class="text-center py-8 t-disabled">Aucune marque identifiée pour cette famille dans le catalogue.</div>';
    html += '</div>';
    return html;
  }

  html += `<h4 class="font-bold text-[13px] t-primary mb-3">Choisissez la marque à animer</h4>
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">`;

  const top = brands.slice(0, 12);
  for (let i = 0; i < top.length; i++) {
    const b = top[i];
    const safe = b.marque.replace(/'/g, "\\'").replace(/"/g, '&quot;');
    const isFirst = i < 3;
    const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : '';
    html += `<div onclick="window._selectAnimMarque('${safe}')"
      class="s-card rounded-xl border p-3 cursor-pointer hover:s-hover transition-all ${isFirst ? 'border-2' : ''}"
      style="${isFirst ? 'border-color:var(--c-action)' : ''}">
      <div class="flex items-center justify-between mb-2">
        <span class="font-extrabold text-[12px] t-primary">${medal} ${escapeHtml(b.marque)}</span>
        <span class="text-[10px] t-disabled">${b.nbArts} art.</span>
      </div>
      <div class="flex gap-3 text-[10px]">
        <div><span class="t-disabled">CA agence</span> <span class="font-bold c-action">${formatEuro(b.caAgence)}</span></div>
        <div><span class="t-disabled">CA réseau</span> <span class="font-bold" style="color:#1e40af">${formatEuro(b.caReseau)}</span></div>
      </div>
    </div>`;
  }

  html += '</div>';
  if (brands.length > 12) {
    html += `<div class="text-[10px] t-disabled mt-2 text-center">… et ${brands.length - 12} autres marques</div>`;
  }
  html += '</div>';
  return html;
}

// ═══════════════════════════════════════════════════════════════
// Vue par défaut : familles prioritaires (remplace la recherche brute)
// ═══════════════════════════════════════════════════════════════

window._animShowFamilies = function() {
  _S._animFamilyFocus = null;
  const el = document.getElementById('animContent');
  if (el) { el.innerHTML = _renderFamilyOverview(); delete el.dataset.animActive; }
};

function _renderFamilyOverview() {
  const families = _S._prData?.families;
  if (!families?.length) {
    return `<div class="text-center py-8 t-disabled text-sm">
      Lancez d'abord l'analyse Plan Rayon pour voir les familles à animer.<br>
      <span class="text-[10px]">Ou utilisez la recherche directe par marque ci-dessus.</span>
    </div>`;
  }

  // Trier : challenger/implanter en premier (familles qui ont besoin d'animation)
  const priority = { challenger: 0, implanter: 1, surveiller: 2, socle: 3, inactive: 4 };
  const sorted = [...families]
    .filter(f => f.classifGlobal !== 'inactive')
    .sort((a, b) => (priority[a.classifGlobal] ?? 5) - (priority[b.classifGlobal] ?? 5) || (b.caReseau || 0) - (a.caReseau || 0));

  let html = `<h4 class="font-bold text-[13px] t-primary mb-1">Familles à animer — par priorité</h4>
    <p class="text-[10px] t-disabled mb-3">Les familles en décalage sont celles qui ont le plus besoin d'une animation commerciale</p>
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">`;

  for (const f of sorted.slice(0, 18)) {
    const o = CLASSIF_ORIENTATION[f.classifGlobal] || CLASSIF_ORIENTATION.surveiller;
    const safe = f.codeFam.replace(/'/g, "\\'");
    html += `<div onclick="window._animFromFamily('${safe}')"
      class="rounded-lg border p-2.5 cursor-pointer hover:s-hover transition-all"
      style="${o.style}">
      <div class="flex items-center justify-between">
        <span class="font-bold text-[11px]">${o.icon} ${escapeHtml(f.libFam)}</span>
        <span class="text-[9px] font-bold">${o.label}</span>
      </div>
      <div class="flex gap-3 text-[9px] mt-1 opacity-75">
        <span>CA réseau ${formatEuro(f.caReseau || 0)}</span>
        <span>${f.nbEnRayon || 0} refs rayon</span>
      </div>
    </div>`;
  }

  html += '</div>';
  if (sorted.length > 18) {
    html += `<div class="text-[10px] t-disabled mt-2 text-center">… et ${sorted.length - 18} autres familles</div>`;
  }
  return html;
}

// ═══════════════════════════════════════════════════════════════
// Rendu principal — 3 Gestes événementiels
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

  // ── Header KPIs ──
  let html = `<div class="mb-4">
    <h3 class="font-extrabold text-lg t-primary">⚡ Animation ${escapeHtml(data.marque)}</h3>
    <div class="flex flex-wrap gap-3 mt-2 text-[11px]">
      <span class="px-2 py-1 rounded-lg border b-light">${data.nbArticlesTotal} articles catalogue</span>
      <span class="px-2 py-1 rounded-lg font-bold" style="background:#dcfce7;color:#166534">${data.nbEnStock} en stock</span>
      <span class="px-2 py-1 rounded-lg font-bold" style="background:#dbeafe;color:#1e40af">${data.nbVendusReseau} vendus réseau</span>
      <span class="font-bold c-action px-2 py-1">${formatEuro(data.caMarqueAgence)} CA marque</span>
    </div>
  </div>`;

  // ═══════════════════════════════════════════════════════════════
  // GESTE 1 — 🚨 URGENCE : Ruptures marque
  // ═══════════════════════════════════════════════════════════════
  if (data.nbRupture > 0) {
    const ruptures = data.articles.filter(a => a.stockStatus === 'rupture');
    html += `<div class="s-card rounded-xl border overflow-hidden mb-4" style="border-color:#f59e0b">
      <div class="px-4 py-3 border-b" style="background:linear-gradient(135deg,#fef3c7,#fde68a);border-color:#f59e0b">
        <div class="flex items-center justify-between">
          <h4 class="font-extrabold text-sm" style="color:#92400e">🚨 ${data.nbRupture} RUPTURES — à commander AVANT l'animation</h4>
          <button onclick="window._animExportRuptures()" class="text-[10px] px-3 py-1.5 rounded-lg font-bold" style="background:#92400e;color:white">📥 Export commande</button>
        </div>
        <p class="text-[10px] mt-1" style="color:#78350f">Le rayon ${escapeHtml(data.marque)} doit être plein à craquer le Jour J</p>
      </div>
      <div class="overflow-x-auto">
        <table class="min-w-full">
          <thead class="s-panel-inner t-inverse text-[10px]">
            <tr><th class="py-1.5 px-2 text-left">Code</th><th class="py-1.5 px-2 text-left">Libellé</th><th class="py-1.5 px-2 text-left">Famille</th><th class="py-1.5 px-2 text-right">CA agence</th><th class="py-1.5 px-2 text-center">Réseau</th></tr>
          </thead>
          <tbody>${ruptures.map(a => `<tr class="border-b b-light hover:s-hover text-[11px]">
            <td class="py-1.5 px-2 font-mono">${_copyCodeBtn(a.code)}</td>
            <td class="py-1.5 px-2 max-w-[200px] truncate" title="${escapeHtml(a.libelle)}">${escapeHtml(a.libelle)}</td>
            <td class="py-1.5 px-2 text-[9px] t-secondary">${escapeHtml(a.famLabel)}</td>
            <td class="py-1.5 px-2 text-right font-bold c-action">${a.caAgence > 0 ? formatEuro(a.caAgence) : '—'}</td>
            <td class="py-1.5 px-2 text-center">${_reseauBadge(a.nbAgencesReseau)}</td>
          </tr>`).join('')}</tbody>
        </table>
      </div>
    </div>`;
  }

  // ═══════════════════════════════════════════════════════════════
  // GESTE 2 — 🎯 INVITÉS VIP : qui appeler
  // ═══════════════════════════════════════════════════════════════
  html += `<div class="s-card rounded-xl border overflow-hidden mb-4">
    <div class="px-4 py-3 s-card-alt border-b">
      <div class="flex items-center justify-between">
        <h4 class="font-extrabold text-sm t-primary">🎯 Invités VIP — ${data.totalClientsActifs + data.totalConquete + data.totalLabo} cibles qualifiées</h4>
        <button onclick="window._animExportTournee()" class="text-[10px] px-3 py-1.5 rounded-lg border b-light s-card t-secondary hover:t-primary">📥 Export Tournée CSV</button>
      </div>
    </div>`;

  // 🟢 Fidèles — chouchouter + cross-sell
  html += _renderClientAccordion('🟢', `Fidèles (achètent ${escapeHtml(data.marque)})`, data.clients.acheteurs, 'acheteur', true);

  // 🔴 Conquête — achètent la concurrence !
  html += _renderClientAccordion('🔴', 'Conquête (achètent la concurrence)', data.clients.conquete || [], 'conquete', data.clients.acheteurs.length < 5);

  // 🧪 Labo — consommable sans machine
  html += _renderClientAccordion('🧪', 'Labo (consommable sans machine)', data.clients.labo || [], 'labo', false);

  // 🔵 Prospects restants (même métier)
  html += _renderClientAccordion('🔵', 'Prospects (même métier)', data.clients.prospects, 'prospect', false);

  // 🔄 Reconquête (>60j silence)
  html += _renderClientAccordion('🔄', 'À reconquérir (>60j silence)', data.clients.reconquete, 'reconquete', false);

  html += '</div>';

  // ═══════════════════════════════════════════════════════════════
  // GESTE 4 — 📦 ASSORTIMENT : quoi empiler le Jour J
  // ═══════════════════════════════════════════════════════════════
  html += `<div class="s-card rounded-xl border overflow-hidden mb-4">
    <div class="px-4 py-3 s-card-alt border-b">
      <div class="flex items-center justify-between">
        <h4 class="font-extrabold text-sm t-primary">📦 Assortiment Jour J</h4>
        <button onclick="window._animExportArticles()" class="text-[10px] px-3 py-1.5 rounded-lg border b-light s-card t-secondary hover:t-primary">📥 Export CSV Articles</button>
      </div>
    </div>`;

  // Trous critiques en premier (articles vendus réseau, absents chez moi)
  const trous = data.trousCritiques || [];
  if (trous.length > 0) {
    html += `<div class="px-4 py-3 border-b" style="background:rgba(239,68,68,0.08)">
      <h5 class="font-extrabold text-[12px] c-danger mb-2">🕳️ ${trous.length} Trous Critiques — articles à commander pour le Jour J</h5>
      <p class="text-[9px] t-secondary mb-2">Articles non référencés chez vous mais vendus par ${_S.storesIntersection?.size > 1 ? 'le réseau' : 'd\'autres agences'} — à implanter avant l'animation</p>
      <div class="overflow-x-auto">
        <table class="min-w-full">
          <thead class="text-[9px] t-disabled">
            <tr><th class="py-1 px-2 text-left">Code</th><th class="py-1 px-2 text-left">Libellé</th><th class="py-1 px-2 text-left">Famille</th><th class="py-1 px-2 text-center">Statut</th><th class="py-1 px-2 text-right">CA réseau</th><th class="py-1 px-2 text-center">Agences</th></tr>
          </thead>
          <tbody>${trous.slice(0, 30).map(a => `<tr class="border-b b-light hover:s-hover text-[11px]">
            <td class="py-1.5 px-2 font-mono">${_copyCodeBtn(a.code)}</td>
            <td class="py-1.5 px-2 max-w-[200px] truncate" title="${escapeHtml(a.libelle)}">${escapeHtml(a.libelle)}</td>
            <td class="py-1.5 px-2 text-[9px] t-secondary">${escapeHtml(a.famLabel)}</td>
            <td class="py-1.5 px-2 text-center">${_stockBadge(a.stockStatus, a.stockActuel)}</td>
            <td class="py-1.5 px-2 text-right font-bold" style="color:#1e40af">${formatEuro(a.caReseau)}</td>
            <td class="py-1.5 px-2 text-center">${_reseauBadge(a.nbAgencesReseau)}</td>
          </tr>`).join('')}</tbody>
        </table>
        ${trous.length > 30 ? `<div class="px-3 py-2 text-[10px] t-disabled">… et ${trous.length - 30} autres trous</div>` : ''}
      </div>
    </div>`;
  }

  // Articles par famille
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

    html += `<details class="border-b b-light"${fi === 0 && !trous.length ? ' open' : ''}>
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

// ── Client accordion helper — adapté pour les 5 types d'invités ──
function _renderClientAccordion(icon, title, clients, type, openByDefault) {
  if (!clients || !clients.length) return `<details class="border-b b-light">
    <summary class="px-4 py-2.5 cursor-pointer select-none hover:s-hover text-[12px] t-disabled">
      <span class="acc-arrow t-disabled">▶</span> ${icon} 0 ${title}
    </summary></details>`;

  const top30 = clients.slice(0, 30);
  const hasMore = clients.length > 30;

  const rows = top30.map(c => {
    const ccSafe = (c.cc || '').replace(/'/g, "\\'");
    let caCol, extraCol;
    if (type === 'prospect') {
      caCol = `<td class="py-1.5 px-2 text-right t-disabled">${c.caTotalPDV > 0 ? formatEuro(c.caTotalPDV) : '—'}</td>`;
      extraCol = '<td class="py-1.5 px-2"></td>';
    } else if (type === 'conquete') {
      caCol = `<td class="py-1.5 px-2 text-right font-bold c-danger">${formatEuro(c.caConcurrence || 0)}</td>`;
      extraCol = `<td class="py-1.5 px-2 text-[9px] t-secondary max-w-[120px] truncate" title="${escapeHtml(c.marquesConcurrentes || '')}">${escapeHtml(c.marquesConcurrentes || '')}</td>`;
    } else if (type === 'labo') {
      caCol = `<td class="py-1.5 px-2 text-right font-bold" style="color:#7c3aed">${formatEuro(c.caConso || 0)}</td>`;
      extraCol = `<td class="py-1.5 px-2 text-[9px]" style="color:#7c3aed">consommable</td>`;
    } else if (type === 'reconquete') {
      caCol = `<td class="py-1.5 px-2 text-right font-bold c-action">${formatEuro(c.caMarque || 0)}</td>`;
      extraCol = `<td class="py-1.5 px-2 text-center text-[9px] c-danger font-bold">${c.daysSince}j</td>`;
    } else {
      caCol = `<td class="py-1.5 px-2 text-right font-bold c-action">${formatEuro(c.caMarque || 0)}</td>`;
      extraCol = `<td class="py-1.5 px-2 text-center text-[9px]">${c.nbArticlesMarque || 0} art.</td>`;
    }
    return `<tr class="border-b b-light hover:s-hover text-[11px] cursor-pointer" onclick="if(window.openClient360)window.openClient360('${ccSafe}','animation')">
      <td class="py-1.5 px-2 max-w-[180px] truncate font-bold" title="${escapeHtml(c.nom)}">${escapeHtml(c.nom)}<button onclick="event.stopPropagation();if(window.openClient360)window.openClient360('${ccSafe}','animation')" class="text-[10px] t-disabled hover:text-white cursor-pointer opacity-30 hover:opacity-100 transition-opacity ml-1" title="Fiche 360°">🔍</button></td>
      <td class="py-1.5 px-2">${escapeHtml(c.metier)}</td>
      <td class="py-1.5 px-2">${escapeHtml(c.cp)}</td>
      <td class="py-1.5 px-2">${escapeHtml(c.commercial)}</td>
      ${caCol}${extraCol}
    </tr>`;
  }).join('');

  const moreRow = hasMore ? `<div class="px-3 py-2 text-[10px] t-disabled">… et ${clients.length - 30} autres</div>` : '';
  const caHeaders = { prospect: 'CA PDV', conquete: 'CA concurrence', labo: 'CA conso', reconquete: 'CA marque', acheteur: 'CA marque' };
  const extraHeaders = { prospect: '', conquete: 'Marques', labo: 'Type', reconquete: 'Silence', acheteur: 'Articles' };

  return `<details class="border-b b-light"${openByDefault ? ' open' : ''}>
    <summary class="flex items-center justify-between px-4 py-2.5 cursor-pointer select-none hover:s-hover">
      <div class="flex items-center gap-2">
        <span class="acc-arrow t-disabled">▶</span>
        <span class="font-bold text-[12px] t-primary">${icon} ${clients.length} ${title}</span>
      </div>
    </summary>
    <div class="overflow-x-auto">
      <table class="min-w-full">
        <thead class="s-panel-inner t-inverse text-[10px]">
          <tr><th class="py-1.5 px-2 text-left">Nom</th><th class="py-1.5 px-2">Métier</th><th class="py-1.5 px-2">CP</th><th class="py-1.5 px-2">Commercial</th><th class="py-1.5 px-2 text-right">${caHeaders[type] || 'CA'}</th><th class="py-1.5 px-2 text-center">${extraHeaders[type] || ''}</th></tr>
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
  const header = ['Code client', 'Nom', 'Métier', 'CP', 'Commercial', 'Type', 'CA', 'Présence confirmée'].join(sep);
  const all = [
    ...data.clients.acheteurs.map(c => ({ ...c, type: 'Fidèle', ca: c.caMarque || 0 })),
    ...(data.clients.conquete || []).map(c => ({ ...c, type: 'Conquête', ca: c.caConcurrence || 0 })),
    ...(data.clients.labo || []).map(c => ({ ...c, type: 'Labo', ca: c.caConso || 0 })),
    ...data.clients.prospects.map(c => ({ ...c, type: 'Prospect', ca: c.caTotalPDV || 0 })),
    ...data.clients.reconquete.map(c => ({ ...c, type: 'Reconquête', ca: c.caMarque || 0 })),
  ].sort((a, b) => (a.cp || '').localeCompare(b.cp || ''));

  const rows = all.map(c => [
    c.cc, `"${(c.nom || '').replace(/"/g, '""')}"`, `"${c.metier}"`, c.cp, `"${c.commercial}"`, c.type, c.ca.toFixed(2), ''
  ].join(sep));
  const csv = '\uFEFF' + header + '\n' + rows.join('\n');
  _downloadCSV(csv, `PRISME_Tournee_${_safeName(data.marque)}_${_today()}.csv`);
};

window._animExportRuptures = function() {
  const data = _S._animationData;
  if (!data) return;
  const sep = ';';
  const header = ['Code', 'Libellé', 'Famille', 'CA agence', 'Agences réseau', 'CA réseau'].join(sep);
  const ruptures = data.articles.filter(a => a.stockStatus === 'rupture');
  const rows = ruptures.map(a => [
    a.code, `"${(a.libelle || '').replace(/"/g, '""')}"`, `"${a.famLabel}"`,
    a.caAgence.toFixed(2), a.nbAgencesReseau, (a.caReseau || 0).toFixed(2)
  ].join(sep));
  const csv = '\uFEFF' + header + '\n' + rows.join('\n');
  _downloadCSV(csv, `PRISME_Ruptures_${_safeName(data.marque)}_${_today()}.csv`);
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

export async function renderAnimationTab() {
  const el = document.getElementById('tabAnimation');
  if (!el) return;

  // Render tab bar (Animation / Pépites)
  _renderAnimTabBar();

  // Lazy load : charger le catalogue au premier accès
  if (!_S.catalogueMarques) {
    const content = document.getElementById('animContent');
    if (content) content.innerHTML = '<div class="text-center py-8 t-disabled text-sm">Catalogue en cours de chargement…</div>';
    if (!_S.catalogueMarques?.size) await loadCatalogueMarques();
  }

  if (!_S.catalogueMarques?.size && _animTopView === 'animation') {
    document.getElementById('animContent').innerHTML =
      '<div class="text-center py-8 t-disabled text-sm">Catalogue marques non disponible (js/catalogue-marques.json manquant).</div>';
    return;
  }

  const searchWrap = document.getElementById('animSearchWrapper');
  const content = document.getElementById('animContent');

  if (_animTopView === 'pepites') {
    if (searchWrap) searchWrap.classList.add('hidden');
    if (content) { content.innerHTML = _renderPepitesReseauContent(); delete content.dataset.animActive; }
  } else {
    if (searchWrap) searchWrap.classList.remove('hidden');
    // Init search si pas encore fait
    initAnimationSearch();
    // Si Plan Rayon chargé → afficher l'overview familles par défaut
    if (content && _S._prData?.families?.length && !content.dataset.animActive) {
      content.innerHTML = _renderFamilyOverview();
    }
  }
}

// Proxy pour rendre les associations depuis le supertab Animation
export { renderAssociationsTab };
