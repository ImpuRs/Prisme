'use strict';
import { _S } from './state.js';
import { formatEuro, escapeHtml, _copyCodeBtn, famLib } from './utils.js';
import { computeSquelette, computeMonRayon } from './engine.js';
import { FAMILLE_LOOKUP } from './constants.js';
import { getFilteredData } from './ui.js';

// ── State local ──────────────────────────────────────────────────────
let _prFilterClassif = '';
let _prOpenFam       = null;
let _prOpenSousFam   = '';
let _prDetailTab     = 'rayon';
let _prSearchIndex   = null;
let _prGridVisible   = false;
let _prSearchText    = '';
let _prRayonFilter   = '';   // 'pepite'|'challenger'|'dormant'|'socle'|''
let _prSqPage        = 50;   // nb articles affichés dans le Squelette
let _prMetierDist    = 0;    // 0 = Tous, sinon filtre km
const PAGE_SIZE = 20;

// ── Constantes visuelles ─────────────────────────────────────────────
const ACTION_BADGE = {
  socle:      { label: 'Bien couverte',  bg: '#dcfce7', color: '#166534', icon: '🟢' },
  implanter:  { label: 'À développer',   bg: '#dbeafe', color: '#1e40af', icon: '🔵' },
  challenger: { label: 'À retravailler', bg: '#fee2e2', color: '#991b1b', icon: '🔴' },
  potentiel:  { label: 'Potentiel',      bg: '#fef9c3', color: '#854d0e', icon: '🟡' },
  surveiller: { label: 'À surveiller',   bg: '#f1f5f9', color: '#475569', icon: '👁'  },
};

const CLASSIF_BADGE = {
  socle:      { label: 'Socle',      bg: 'rgba(34,197,94,0.2)',   color: '#22c55e',           icon: '🟢' },
  implanter:  { label: 'Implanter',  bg: 'rgba(59,130,246,0.2)',  color: '#3b82f6',           icon: '🔵' },
  challenger: { label: 'Challenger', bg: 'rgba(239,68,68,0.2)',   color: '#ef4444',           icon: '🔴' },
  potentiel:  { label: 'Potentiel',  bg: 'rgba(245,158,11,0.2)',  color: '#f59e0b',           icon: '🟡' },
  surveiller: { label: 'Surveiller', bg: 'rgba(148,163,184,0.2)', color: 'var(--t-secondary)', icon: '👁'  },
};

// ── computePlanStock ─────────────────────────────────────────────────
function computePlanStock() {
  // Filtrer sur critères structurels uniquement (pas l'âge/période)
  const fam  = (document.getElementById('filterFamille')?.value || '').trim().toLowerCase();
  const sFam = (document.getElementById('filterSousFamille')?.value || '').trim().toLowerCase();
  const emp  = (document.getElementById('filterEmplacement')?.value || '').trim().toLowerCase();
  const stat = document.getElementById('filterStatut')?.value || '';
  const abc  = document.getElementById('filterABC')?.value || '';
  const fmr  = document.getElementById('filterFMR')?.value || '';

  const filteredData = (_S.finalData || []).filter(r => {
    if (fam  && !famLib(r.famille || '').toLowerCase().includes(fam)
             && !(r.famille || '').toLowerCase().includes(fam)) return false;
    if (sFam && !(r.sousFamille || '').toLowerCase().includes(sFam)) return false;
    if (emp  && !(r.emplacement || '').toLowerCase().includes(emp)) return false;
    if (stat && r.statut !== stat) return false;
    if (abc  && r.abcClass !== abc) return false;
    if (fmr  && r.fmrClass !== fmr) return false;
    return true;
  });
  const filteredCodes = new Set(filteredData.map(r => r.code));

  const sqData = computeSquelette();
  if (!sqData) return null;
  _S._prSqData = sqData; // cache pour onglet squelette

  const catFam = _S.catalogueFamille;
  const catCount = new Map();
  if (catFam) for (const [, f] of catFam) {
    if (f.codeFam) catCount.set(f.codeFam, (catCount.get(f.codeFam) || 0) + 1);
  }

  const getFamInfo = (code) => {
    const cf = catFam?.get(code);
    if (cf?.codeFam) return { codeFam: cf.codeFam, libFam: cf.libFam || cf.codeFam };
    const fam = _S.articleFamille?.[code];
    if (fam) return { codeFam: fam, libFam: FAMILLE_LOOKUP[fam.slice(0, 2)] || fam };
    return null;
  };

  const famMap = new Map();
  const _ensure = (codeFam, libFam) => {
    if (!famMap.has(codeFam)) famMap.set(codeFam, {
      codeFam, libFam,
      socle: 0, implanter: 0, challenger: 0, potentiel: 0, surveiller: 0,
      srcReseau: false, srcChalandise: false, srcHorsZone: false, srcLivraisons: false,
      caAgence: 0, nbClients: 0,
      nbCatalogue: catCount.get(codeFam) || 0,
      nbEnRayon: 0, couverture: 0, classifGlobal: 'potentiel',
    });
    return famMap.get(codeFam);
  };

  const CLASSIFS = ['socle', 'implanter', 'challenger', 'potentiel', 'surveiller'];
  for (const d of sqData.directions) {
    for (const g of CLASSIFS) {
      for (const a of (d[g] || [])) {
        const fi = getFamInfo(a.code);
        if (!fi) continue;
        const f = _ensure(fi.codeFam, fi.libFam);
        const inFilter = filteredCodes.has(a.code);
        if (inFilter || g === 'implanter') {
          f[g]++;
          if (a.sources?.has('reseau'))     f.srcReseau     = true;
          if (a.sources?.has('chalandise')) f.srcChalandise = true;
          if (a.sources?.has('horsZone'))   f.srcHorsZone   = true;
          if (a.sources?.has('livraisons')) f.srcLivraisons = true;
          if (inFilter) {
            f.caAgence += a.caAgence || 0;
            if (a.enStock) f.nbEnRayon++;
          }
        }
      }
    }
  }

  // nbClients : utiliser la version full (toute période) pour cohérence structurelle
  const vcaFull = _S.ventesClientArticleFull?.size
    ? _S.ventesClientArticleFull : _S.ventesClientArticle;
  if (vcaFull) {
    for (const [, artMap] of vcaFull) {
      const seen = new Set();
      for (const code of artMap.keys()) {
        if (!filteredCodes.has(code)) continue;
        const fi = getFamInfo(code);
        if (fi && !seen.has(fi.codeFam)) {
          seen.add(fi.codeFam);
          const f = famMap.get(fi.codeFam);
          if (f) f.nbClients++;
        }
      }
    }
  }

  for (const [, f] of famMap) {
    f.couverture = f.nbCatalogue > 0 ? Math.round(f.nbEnRayon / f.nbCatalogue * 100) : 0;
    const total = f.socle + f.implanter + f.challenger + f.potentiel + f.surveiller;
    const rSocle      = total > 0 ? f.socle      / total : 0;
    const rChallenger = total > 0 ? f.challenger  / total : 0;
    const nbSrc = (f.srcReseau?1:0) + (f.srcChalandise?1:0) + (f.srcHorsZone?1:0) + (f.srcLivraisons?1:0);

    if (f.implanter >= 3 && f.challenger >= 3)
      f.classifGlobal = 'implanter';
    else if (f.implanter >= 2 && total > 0 && (f.implanter + f.potentiel) / total > 0.3)
      f.classifGlobal = 'implanter';
    else if (rSocle >= 0.4 && f.nbClients >= 5 && nbSrc >= 2)
      f.classifGlobal = 'socle';
    else if (rSocle >= 0.5 && f.nbClients >= 10)
      f.classifGlobal = 'socle';
    else if (f.socle >= 3 && f.challenger === 0)
      f.classifGlobal = 'socle';
    else if (rChallenger >= 0.4 && f.nbClients < 5)
      f.classifGlobal = 'challenger';
    else if (f.challenger >= 5 && f.challenger > f.socle * 2)
      f.classifGlobal = 'challenger';
    else if (f.implanter >= 1 || f.potentiel >= 3)
      f.classifGlobal = 'potentiel';
    else
      f.classifGlobal = 'surveiller';
  }

  // ── Enrichissement depuis filteredData (écrase les valeurs Squelette) ──
  // Garantit cohérence même quand un article n'a pas de signal externe
  const myStore = _S.selectedMyStore;
  const vpm = _S.ventesParMagasin || {};

  // S'assurer que toutes les familles de filteredData ont une entrée
  for (const r of filteredData) {
    const fi = getFamInfo(r.code);
    if (fi && !famMap.has(fi.codeFam)) _ensure(fi.codeFam, fi.libFam);
  }

  // Recalculer nbEnRayon et caAgence depuis filteredData
  for (const f of famMap.values()) { f.nbEnRayon = 0; f.caAgence = 0; }
  for (const r of filteredData) {
    const fi = getFamInfo(r.code);
    if (!fi) continue;
    const f = famMap.get(fi.codeFam);
    if (!f) continue;
    if ((r.stockActuel || 0) > 0) f.nbEnRayon++;
    f.caAgence += vpm[myStore]?.[r.code]?.sumCA || 0;
  }

  // Recalculer nbClients depuis ventesClientArticleFull × filteredCodes
  for (const f of famMap.values()) f.nbClients = 0;
  const vcaC = _S.ventesClientArticleFull?.size
    ? _S.ventesClientArticleFull : (_S.ventesClientArticle || new Map());
  for (const [, artMap] of vcaC) {
    const seen = new Set();
    for (const code of artMap.keys()) {
      if (!filteredCodes.has(code)) continue;
      const fi = getFamInfo(code);
      if (fi && !seen.has(fi.codeFam)) {
        seen.add(fi.codeFam);
        const f = famMap.get(fi.codeFam);
        if (f) f.nbClients++;
      }
    }
  }

  // Recalculer couverture après les updates
  for (const [, f] of famMap) {
    f.couverture = f.nbCatalogue > 0 ? Math.round(f.nbEnRayon / f.nbCatalogue * 100) : 0;
  }

  const families = [...famMap.values()]
    .filter(f => f.socle + f.implanter + f.challenger + f.potentiel + f.surveiller > 0)
    .sort((a, b) => (b.implanter + b.challenger) - (a.implanter + a.challenger));

  return {
    families,
    totals: {
      socle:      families.filter(f => f.classifGlobal === 'socle').length,
      implanter:  families.filter(f => f.classifGlobal === 'implanter').length,
      challenger: families.filter(f => f.classifGlobal === 'challenger').length,
      potentiel:  families.filter(f => f.classifGlobal === 'potentiel').length,
      surveiller: families.filter(f => f.classifGlobal === 'surveiller').length,
    }
  };
}

// ── Source bar ───────────────────────────────────────────────────────
function _prSourceBar(src) {
  const seg = (active, color, label) =>
    `<span title="${label}" style="display:inline-block;width:12px;height:8px;border-radius:2px;margin-right:2px;background:${active ? color : '#e2e8f0'};opacity:${active ? 1 : 0.25}"></span>`;
  const has = (key) => src instanceof Set ? src.has(key) : !!src[key];
  return `<span class="inline-flex items-center">
    ${seg(has('reseau'),     '#3b82f6', 'Réseau')}
    ${seg(has('chalandise'), '#22c55e', 'Chalandise')}
    ${seg(has('horsZone'),   '#f59e0b', 'Hors-zone')}
    ${seg(has('livraisons'), '#8b5cf6', 'Livraisons')}
  </span>`;
}

// ── Search Index ─────────────────────────────────────────────────────
function _buildPrSearchIndex() {
  if (_prSearchIndex) return _prSearchIndex;
  const index = [];
  const catFam = _S.catalogueFamille;
  if (!catFam?.size) return index;

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
    index.push({ codeFam: cf, codeSousFam: '', libFam: agg.libFam, sousFam: '',
      level: 1, nbArticlesCat: agg.totalCount,
      searchText: `${cf} ${agg.libFam}`.toLowerCase() });
    for (const [csf, sf] of agg.sousFams) {
      index.push({ codeFam: cf, codeSousFam: csf, libFam: agg.libFam, sousFam: sf.sousFam,
        level: 2, nbArticlesCat: sf.count,
        searchText: `${cf} ${csf} ${agg.libFam} ${sf.sousFam}`.toLowerCase() });
    }
  }

  if (_S.marqueArticles?.size) {
    for (const [marque, codes] of _S.marqueArticles) {
      if (!marque || !codes.size) continue;
      const famCount = new Map();
      for (const code of codes) {
        const cf = catFam.get(code)?.codeFam;
        if (cf) famCount.set(cf, (famCount.get(cf) || 0) + 1);
      }
      if (!famCount.size) continue;
      const [domFam] = [...famCount.entries()].sort((a, b) => b[1] - a[1])[0];
      const agg = famAgg.get(domFam);
      index.push({ codeFam: domFam, codeSousFam: '', libFam: agg?.libFam || domFam, sousFam: '',
        level: 3, nbArticlesCat: codes.size, marque,
        searchText: `${marque} ${domFam} ${agg?.libFam || ''}`.toLowerCase() });
    }
  }

  if (_S.catalogueDesignation?.size) {
    const articleCodes = new Map();
    for (const [code, desig] of _S.catalogueDesignation) {
      const cf = catFam.get(code);
      articleCodes.set(code, {
        code, libelle: desig,
        marque: _S.catalogueMarques?.get(code) || '',
        codeFam: cf?.codeFam || '', libFam: cf?.libFam || '',
        codeSousFam: cf?.codeSousFam || '', sousFam: cf?.sousFam || '',
      });
    }
    index._articleCodes = articleCodes;
  }

  index.sort((a, b) => a.level - b.level || b.nbArticlesCat - a.nbArticlesCat);
  _prSearchIndex = index;
  return index;
}

// ── Render cartes famille ────────────────────────────────────────────
function _prBuildCards(data, searchText = '') {
  let families = data.families;
  if (_prFilterClassif) families = families.filter(f => f.classifGlobal === _prFilterClassif);
  if (searchText) families = families.filter(f =>
    f.libFam.toLowerCase().includes(searchText) || f.codeFam.toLowerCase().includes(searchText)
  );
  if (!_prFilterClassif && !searchText && _prOpenFam) {
    families = families.filter(f => f.codeFam === _prOpenFam);
  }
  if (!families.length) return '<div class="col-span-2 text-center py-6 t-disabled text-[12px]">Aucune famille pour ce filtre.</div>';
  let out = '';
  for (const f of families) {
    const b = ACTION_BADGE[f.classifGlobal] || ACTION_BADGE.potentiel;
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
    const srcObj = { reseau: f.srcReseau, chalandise: f.srcChalandise, horsZone: f.srcHorsZone, livraisons: f.srcLivraisons };
    const covColor = f.couverture >= 70 ? '#22c55e' : f.couverture >= 40 ? '#f59e0b' : '#ef4444';
    out += `<div class="s-card rounded-xl border p-3 cursor-pointer hover:border-[var(--c-action)] transition-all"
      onclick="window._prOpenDetail('${safeCF}')">
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
        ${_prSourceBar(srcObj)}
        <span class="text-[10px] font-bold t-secondary">${formatEuro(f.caAgence)}</span>
      </div>
    </div>`;
  }
  return out;
}

// ── Onglet Mon Rayon ─────────────────────────────────────────────────
function _prRenderRayon(data) {
  if (!data) return '<div class="t-disabled text-sm text-center py-6">Aucune donnée rayon pour cette famille.</div>';
  const { monRayon, nbCatalogue, couverture, valeurTotale } = data;
  const page = _S._prPageRayon || PAGE_SIZE;
  const pepites  = monRayon.filter(a => a.status === 'pepite').length;
  const challeng = monRayon.filter(a => a.status === 'challenger').length;
  const dormants = monRayon.filter(a => a.status === 'dormant').length;
  const ruptures = monRayon.filter(a => a.status === 'rupture').length;
  const standard = monRayon.length - pepites - challeng - dormants - ruptures;
  // Filtre local par statut
  const displayed = _prRayonFilter
    ? monRayon.filter(a => a.status === _prRayonFilter)
    : monRayon;
  // Pills filtrables
  const _pill = (key, count, icon, label, color, bg, fw) => {
    if (!count) return '';
    const active = _prRayonFilter === key;
    const pillBg     = active ? bg.replace(/[\d.]+\)$/, m => String(Math.min(parseFloat(m) * 1.8, 0.4)) + ')') : bg;
    const pillBorder = active ? `2px solid ${color}` : '2px solid transparent';
    return `<button onclick="window._prSetRayonFilter('${key}')" style="font-size:10px;padding:2px 6px;border-radius:4px;font-weight:${fw};background:${pillBg};color:${color};border:${pillBorder};cursor:pointer">${icon} ${count} ${label}</button>`;
  };
  const rows = displayed.slice(0, page).map(a => {
    const s = a.status || 'standard';
    let sBg, sC, sL;
    if (s === 'pepite')          { sBg='rgba(34,197,94,0.2)';    sC='#22c55e';            sL='🟢 Pépite'; }
    else if (s === 'challenger') { sBg='rgba(239,68,68,0.2)';    sC='#ef4444';            sL='🔴 Challenger'; }
    else if (s === 'dormant')    { sBg='rgba(148,163,184,0.2)';  sC='var(--t-secondary)'; sL='💤 Dormant'; }
    else if (s === 'rupture')    { sBg='rgba(245,158,11,0.2)';   sC='#f59e0b';            sL='⚠️ Rupture'; }
    else                         { sBg='rgba(148,163,184,0.15)'; sC='var(--t-secondary)'; sL='⚪ Standard'; }
    const sq = a.sqClassif;
    const cb = sq ? (CLASSIF_BADGE[sq] || CLASSIF_BADGE.potentiel) : null;
    const isCleEntree = s === 'dormant' && sq === 'socle';
    const sqBadge = cb
      ? `<span style="font-size:9px;padding:2px 6px;border-radius:4px;font-weight:600;background:${cb.bg};color:${cb.color}">${cb.icon} ${cb.label}</span>${isCleEntree ? ' <span title="Clé d\'entrée métier — dormant mais socle réseau" style="cursor:help">🔑</span>' : ''}`
      : '<span class="t-disabled text-[9px]">—</span>';
    const lib = a.libelle || _S.libelleLookup?.[a.code] || a.code;
    return `<tr class="border-b b-light hover:s-hover text-[11px] cursor-pointer${isCleEntree ? ' bg-amber-950/20' : ''}"
      onclick="if(window.openArticlePanel)window.openArticlePanel('${a.code}','planRayon')">
      <td class="py-1.5 px-2 font-mono">${_copyCodeBtn(a.code)}</td>
      <td class="py-1.5 px-2 max-w-[160px] truncate" style="color:var(--t-primary)" title="${escapeHtml(lib)}">${escapeHtml(lib)}</td>
      <td class="py-1.5 px-2 text-[10px]" style="color:var(--t-secondary)">${escapeHtml(a.sousFam || '')}</td>
      <td class="py-1.5 px-2 text-right" style="color:var(--t-primary)">${a.stockActuel}</td>
      <td class="py-1.5 px-2 text-right" style="color:var(--t-secondary)">${a.W || 0}</td>
      <td class="py-1.5 px-2 text-center">
        <span style="font-size:9px;padding:2px 6px;border-radius:4px;font-weight:600;background:${sBg};color:${sC}">${sL}</span>
      </td>
      <td class="py-1.5 px-2 text-center">${sqBadge}</td>
      <td class="py-1.5 px-2 text-right font-bold" style="color:var(--t-primary)">${formatEuro(a.caAgence)}</td>
    </tr>`;
  }).join('');
  const filteredNote = _prRayonFilter
    ? `<span class="ml-2 text-[10px]" style="color:var(--t-secondary)">— filtre actif · ${displayed.length} article${displayed.length !== 1 ? 's' : ''}</span>`
    : '';
  return `<div class="mb-3 text-[11px] t-secondary">
    ${monRayon.length} articles en rayon · ${couverture}% couverture (${monRayon.length}/${nbCatalogue}) · ${formatEuro(valeurTotale)} valeur stock
  </div>
  <div class="flex flex-wrap gap-1.5 mb-3 items-center">
    ${_pill('pepite',     pepites,  '🟢', 'pépites AF',  '#22c55e', 'rgba(34,197,94,0.2)',   600)}
    ${_pill('standard',   standard, '⚪', 'standard',    '#94a3b8', 'rgba(148,163,184,0.2)', 500)}
    ${_pill('challenger', challeng, '🔴', 'challenger',  '#ef4444', 'rgba(239,68,68,0.2)',   600)}
    ${_pill('dormant',    dormants, '💤', 'dormants',    '#94a3b8', 'rgba(148,163,184,0.2)', 600)}
    ${_pill('rupture',    ruptures, '⚠️', 'ruptures',    '#f59e0b', 'rgba(245,158,11,0.2)',  600)}
    ${filteredNote}
  </div>
  <div class="overflow-x-auto">
    <table class="w-full text-[11px]">
      <thead><tr class="border-b b-light text-[10px]" style="color:var(--t-secondary)">
        <th class="py-1.5 px-2 text-left" style="color:var(--t-secondary);font-weight:500">Code</th><th class="py-1.5 px-2 text-left" style="color:var(--t-secondary);font-weight:500">Libellé</th>
        <th class="py-1.5 px-2 text-left" style="color:var(--t-secondary);font-weight:500">Sous-fam.</th><th class="py-1.5 px-2 text-right" style="color:var(--t-secondary);font-weight:500">Stock</th>
        <th class="py-1.5 px-2 text-right" style="color:var(--t-secondary);font-weight:500">W</th><th class="py-1.5 px-2 text-left" style="color:var(--t-secondary);font-weight:500">Mon Rayon</th>
        <th class="py-1.5 px-2 text-left" style="color:var(--t-secondary);font-weight:500">Squelette</th><th class="py-1.5 px-2 text-right" style="color:var(--t-secondary);font-weight:500">CA agence</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </div>
  <div class="flex gap-2 mt-2">
    ${displayed.length > page ? `<button onclick="window._prMoreRayon()" class="text-[11px] t-secondary border b-light rounded px-3 py-1 hover:t-primary cursor-pointer s-card">Voir plus (${displayed.length - page} restants)</button>` : ''}
    <button onclick="window._prExportRayon()" class="text-[11px] t-secondary border b-light rounded px-3 py-1 hover:t-primary cursor-pointer s-card">⬇ CSV</button>
  </div>`;
}

// ── Onglet Squelette ─────────────────────────────────────────────────
function _prBuildSqTable(arts) {
  const filter = _S._prSqFilter || '';
  const filtered = filter === 'absent'
    ? arts.filter(a => !a.enStock)
    : filter
      ? arts.filter(a => a._g === filter)
      : arts;
  if (!filtered.length) return '<div class="t-disabled text-sm text-center py-4">Aucun article.</div>';
  const shown = filtered.slice(0, _prSqPage);
  const rows = shown.map(a => {
    const cb = CLASSIF_BADGE[a._g] || CLASSIF_BADGE.potentiel;
    return `<tr class="border-b b-light hover:s-hover text-[11px] cursor-pointer"
      onclick="if(window.openArticlePanel)window.openArticlePanel('${a.code}','planRayon')">
      <td class="py-1.5 px-2 font-mono t-disabled">${a.code}</td>
      <td class="py-1.5 px-2 t-primary">${escapeHtml(a.libelle || a.code)}</td>
      <td class="py-1.5 px-2"><span class="text-[8px] px-1.5 py-0.5 rounded-full font-bold" style="background:${cb.bg};color:${cb.color}">${cb.icon} ${cb.label}</span></td>
      <td class="py-1.5 px-2">${_prSourceBar(a.sources)}</td>
      <td class="py-1.5 px-2 text-right t-secondary">${a.enStock ? a.stockActuel : '—'}</td>
      <td class="py-1.5 px-2 text-right font-bold t-primary">${a.caAgence > 0 ? formatEuro(a.caAgence) : '—'}</td>
    </tr>`;
  }).join('');
  return `<div class="overflow-x-auto" id="prSqTable">
    <table class="w-full text-[11px]">
      <thead><tr class="border-b b-light text-[10px]" style="color:var(--t-secondary)">
        <th class="py-1.5 px-2 text-left" style="color:var(--t-secondary);font-weight:500">Code</th><th class="py-1.5 px-2 text-left" style="color:var(--t-secondary);font-weight:500">Libellé</th>
        <th class="py-1.5 px-2 text-left" style="color:var(--t-secondary);font-weight:500">Classif.</th><th class="py-1.5 px-2 text-left" style="color:var(--t-secondary);font-weight:500">Sources</th>
        <th class="py-1.5 px-2 text-right" style="color:var(--t-secondary);font-weight:500">Stock</th><th class="py-1.5 px-2 text-right" style="color:var(--t-secondary);font-weight:500">CA agence</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>
    ${filtered.length > _prSqPage ? `<div class="mt-2 text-center"><button onclick="window._prMoreSq()" class="text-[10px] t-secondary hover:t-primary px-3 py-1 rounded border b-light">Voir plus (${filtered.length - _prSqPage} restants)</button></div>` : ''}
  </div>`;
}

function _prRenderSquelette(fam) {
  const sqData = _S._prSqData || computeSquelette();
  _S._prSqData = sqData;
  if (!sqData) return '<div class="t-disabled text-sm text-center py-6">Données squelette indisponibles.</div>';

  const CLASSIFS = ['socle', 'implanter', 'challenger', 'potentiel', 'surveiller'];
  const arts = [];
  for (const d of sqData.directions) {
    for (const g of CLASSIFS) {
      for (const a of (d[g] || [])) {
        const cf = _S.catalogueFamille?.get(a.code)?.codeFam || _S.articleFamille?.[a.code];
        if (cf === fam.codeFam) {
          if (_prOpenSousFam) {
            const csf = _S.catalogueFamille?.get(a.code)?.codeSousFam || '';
            if (csf !== _prOpenSousFam) continue;
          }
          arts.push({ ...a, _g: g });
        }
      }
    }
  }
  _S._prSqArts = arts;

  const sousFamLib = _prOpenSousFam
    ? (_S.catalogueFamille
        ? [..._S.catalogueFamille.values()]
            .find(f => f.codeFam === fam.codeFam && f.codeSousFam === _prOpenSousFam)
            ?.sousFam || _prOpenSousFam
        : _prOpenSousFam)
    : '';

  const counts = {};
  for (const g of CLASSIFS) counts[g] = arts.filter(a => a._g === g).length;
  const activeFilter = _S._prSqFilter || '';

  let pills = CLASSIFS.map(g => {
    const b = CLASSIF_BADGE[g];
    const active = activeFilter === g;
    return `<button onclick="window._prSqFilterFn('${g}')"
      class="text-[10px] px-2 py-1 rounded border cursor-pointer transition-all ${active ? 's-panel-inner t-inverse' : 's-card t-secondary hover:t-primary'}"
      style="${active ? 'box-shadow:0 0 0 2px ' + b.color : ''}">${b.icon} ${b.label} <strong>${counts[g]}</strong></button>`;
  }).join('');
  const nbAbsent = arts.filter(a => !a.enStock).length;
  if (nbAbsent) {
    const active = activeFilter === 'absent';
    pills += `<button onclick="window._prSqFilterFn('absent')"
      class="text-[10px] px-2 py-1 rounded border cursor-pointer transition-all ${active ? 's-panel-inner t-inverse' : 's-card'}"
      style="${active ? 'box-shadow:0 0 0 2px #ef4444' : ''}">
      📦 Absent du rayon <span class="${active ? 't-inverse-muted' : 't-disabled'}">${nbAbsent}</span>
    </button>`;
  }

  const sousFamNote = sousFamLib
    ? `<span class="ml-2 text-[10px]" style="color:var(--t-secondary)">· filtré sur <em>${escapeHtml(sousFamLib)}</em></span>`
    : '';

  return `<div class="flex flex-wrap gap-1.5 mb-3 items-center">${pills}${sousFamNote}</div>${_prBuildSqTable(arts)}`;
}

// ── Onglet Métiers ───────────────────────────────────────────────────
function _prCouvertureBar(pct) {
  const color = pct >= 70 ? '#22c55e' : pct >= 40 ? '#f59e0b' : '#ef4444';
  return `<span style="display:inline-flex;align-items:center;gap:4px">
    <span style="display:inline-block;width:40px;height:6px;border-radius:3px;background:var(--color-border-tertiary,#e2e8f0);overflow:hidden">
      <span style="display:block;height:100%;width:${pct}%;background:${color}"></span>
    </span>
    <span style="font-size:10px;font-weight:700;color:${color}">${pct}%</span>
  </span>`;
}

function _prRenderMetiers(fam) {
  if (!_S.chalandiseReady || !_S.chalandiseData?.size) {
    return '<div class="t-disabled text-sm text-center py-6">Chargez la Zone de Chalandise pour cette analyse.</div>';
  }
  const catFam = _S.catalogueFamille;

  // Slider distance
  const hasDist = [..._S.chalandiseData.values()].some(i => i.distanceKm != null);
  const sliderHtml = hasDist ? `
    <div class="flex items-center gap-3 mb-4">
      <span class="text-[11px] font-bold" style="color:var(--t-primary)">📍 Rayon :</span>
      <input type="range" min="5" max="100" step="5"
        value="${_prMetierDist || 100}"
        oninput="window._prMetierDistChange(this.value)"
        style="flex:1;max-width:200px;accent-color:var(--c-action,#8b5cf6)">
      <span class="text-[11px] font-bold" style="color:var(--c-action,#8b5cf6);min-width:40px"
        id="prMetierDistLabel">${!_prMetierDist || _prMetierDist >= 100 ? 'Tous' : _prMetierDist + ' km'}</span>
    </div>` : '';

  const _distOk = (cc) => {
    if (!_prMetierDist) return true;
    const info = _S.chalandiseData.get(cc);
    if (!info || info.distanceKm == null) return true;
    return info.distanceKm <= _prMetierDist;
  };

  // CA famille par métier (ventesClientArticle × chalandise, filtré distance)
  const metierCA      = new Map(); // metier → CA famille
  const metierClients = new Map(); // metier → Set<cc>
  // Utiliser la version full (toute période du consommé) pour cohérence structurelle
  const vcaFull = _S.ventesClientArticleFull?.size
    ? _S.ventesClientArticleFull
    : _S.ventesClientArticle;
  if (vcaFull) {
    for (const [cc, artMap] of vcaFull) {
      if (!_distOk(cc)) continue;
      const info   = _S.chalandiseData.get(cc);
      const metier = info?.metier || '';
      let caFam = 0;
      for (const [code, v] of artMap) {
        const cf = catFam?.get(code)?.codeFam || _S.articleFamille?.[code];
        if (cf === fam.codeFam) caFam += v.sumCA || 0;
      }
      if (caFam > 0) {
        metierCA.set(metier, (metierCA.get(metier) || 0) + caFam);
        if (!metierClients.has(metier)) metierClients.set(metier, new Set());
        metierClients.get(metier).add(cc);
      }
    }
  }

  if (!metierCA.size) return sliderHtml + '<div class="t-disabled text-sm text-center py-6">Aucune donnée client × famille.</div>';

  const sorted = [...metierCA.entries()].sort((a, b) => b[1] - a[1]);
  const rows = sorted.map(([m, ca]) => {
    const nbClients = metierClients.get(m)?.size || 0;
    const panier    = nbClients > 0 ? ca / nbClients : 0;
    return `<tr class="border-b b-light text-[11px] hover:bg-[rgba(0,0,0,0.03)]">
      <td class="py-1.5 px-2 t-primary font-medium">${escapeHtml(m || '—')}</td>
      <td class="py-1.5 px-2 text-right t-secondary">${nbClients}</td>
      <td class="py-1.5 px-2 text-right font-bold" style="color:var(--c-action)">${formatEuro(ca)}</td>
      <td class="py-1.5 px-2 text-right t-secondary">${panier > 0 ? formatEuro(panier) : '—'}</td>
    </tr>`;
  }).join('');

  return `${sliderHtml}<div class="overflow-x-auto">
    <table class="w-full text-[11px]">
      <thead style="border-bottom:1px solid var(--color-border-tertiary)">
        <tr style="color:var(--t-secondary);font-size:10px;font-weight:600">
          <th class="py-1.5 px-2 text-left">Métier</th>
          <th class="py-1.5 px-2 text-right">Clients</th>
          <th class="py-1.5 px-2 text-right">CA famille</th>
          <th class="py-1.5 px-2 text-right">Panier moyen</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  </div>`;
}

// ── Onglet Analyse ───────────────────────────────────────────────────
function _prRenderAnalyse(fam) {
  const catFam = _S.catalogueFamille;
  const filteredData = (typeof getFilteredData === 'function') ? getFilteredData() : (_S.finalData || []);

  // Sous-familles — catalogue + stock
  const sfCount = new Map();
  if (catFam) for (const [, f] of catFam) {
    if (f.codeFam === fam.codeFam && f.sousFam)
      sfCount.set(f.sousFam, (sfCount.get(f.sousFam) || 0) + 1);
  }
  const stockBySF = new Map();
  for (const r of filteredData) {
    const cf = catFam?.get(r.code);
    if (cf?.codeFam !== fam.codeFam || !cf.sousFam) continue;
    if (r.stockActuel > 0) stockBySF.set(cf.sousFam, (stockBySF.get(cf.sousFam) || 0) + 1);
  }
  const thSF = `<thead style="border-bottom:1px solid var(--color-border-tertiary)">
    <tr style="color:var(--t-secondary);font-size:10px;font-weight:600">
      <th class="py-1.5 px-2 text-left">Sous-famille</th>
      <th class="py-1.5 px-2 text-right">En stock</th>
      <th class="py-1.5 px-2 text-right">Réf. cat.</th>
      <th class="py-1.5 px-2">Couverture</th>
    </tr></thead>`;
  const sfRows = [...sfCount.entries()].sort((a, b) => b[1] - a[1]).map(([sf, nbCat]) => {
    const nbStock = stockBySF.get(sf) || 0;
    const pct = Math.round(nbStock / nbCat * 100);
    return `<tr class="border-b b-light text-[11px]">
      <td class="py-1.5 px-2 t-primary truncate max-w-[140px]" title="${escapeHtml(sf)}">${escapeHtml(sf)}</td>
      <td class="py-1.5 px-2 text-right font-semibold t-primary">${nbStock}</td>
      <td class="py-1.5 px-2 text-right t-secondary">${nbCat}</td>
      <td class="py-1.5 px-2">${_prCouvertureBar(pct)}</td>
    </tr>`;
  }).join('') || `<tr><td colspan="4" class="py-2 text-center t-disabled text-[11px]">Aucune sous-famille.</td></tr>`;

  // Marques — catalogue + stock
  const marqueCount = new Map();
  if (_S.marqueArticles) for (const [marque, codes] of _S.marqueArticles) {
    let n = 0;
    for (const code of codes) {
      if ((catFam?.get(code)?.codeFam || _S.articleFamille?.[code]) === fam.codeFam) n++;
    }
    if (n > 0) marqueCount.set(marque, n);
  }
  const stockByMarque = new Map();
  for (const r of filteredData) {
    const cf = catFam?.get(r.code);
    if (cf?.codeFam !== fam.codeFam) continue;
    if (r.stockActuel <= 0) continue;
    const marque = _S.catalogueMarques?.get(r.code) || '';
    if (marque) stockByMarque.set(marque, (stockByMarque.get(marque) || 0) + 1);
  }
  const thM = `<thead style="border-bottom:1px solid var(--color-border-tertiary)">
    <tr style="color:var(--t-secondary);font-size:10px;font-weight:600">
      <th class="py-1.5 px-2 text-left">Marque</th>
      <th class="py-1.5 px-2 text-right">En stock</th>
      <th class="py-1.5 px-2 text-right">Réf. cat.</th>
      <th class="py-1.5 px-2">Couverture</th>
    </tr></thead>`;
  const marqueRows = [...marqueCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15).map(([m, nbCat]) => {
    const nbStock = stockByMarque.get(m) || 0;
    const pct = Math.round(nbStock / nbCat * 100);
    return `<tr class="border-b b-light text-[11px]">
      <td class="py-1.5 px-2 t-primary truncate max-w-[140px]" title="${escapeHtml(m)}">${escapeHtml(m)}</td>
      <td class="py-1.5 px-2 text-right font-semibold t-primary">${nbStock}</td>
      <td class="py-1.5 px-2 text-right t-secondary">${nbCat}</td>
      <td class="py-1.5 px-2">${_prCouvertureBar(pct)}</td>
    </tr>`;
  }).join('') || `<tr><td colspan="4" class="py-2 text-center t-disabled text-[11px]">Aucune marque détectée.</td></tr>`;

  return `<div class="grid grid-cols-2 gap-6">
    <div>
      <h4 class="text-[11px] font-bold t-primary mb-2">Sous-familles</h4>
      <div class="overflow-x-auto"><table class="w-full text-[11px]">${thSF}<tbody>${sfRows}</tbody></table></div>
    </div>
    <div>
      <h4 class="text-[11px] font-bold t-primary mb-2">Marques (top 15)</h4>
      <div class="overflow-x-auto"><table class="w-full text-[11px]">${thM}<tbody>${marqueRows}</tbody></table></div>
    </div>
  </div>`;
}

// ── Contenu onglet détail ────────────────────────────────────────────
function _prGetTabContent(tab, fam) {
  if (tab === 'rayon') {
    const rayonData = computeMonRayon(fam.codeFam, _prOpenSousFam || '');
    // Index code → classification Squelette (sans écraser status Mon Rayon)
    const sqData = _S._prSqData || computeSquelette();
    _S._prSqData = sqData;
    const sqClassif = new Map();
    if (sqData) {
      for (const d of sqData.directions) {
        for (const g of ['socle', 'implanter', 'challenger', 'potentiel', 'surveiller']) {
          for (const a of (d[g] || [])) sqClassif.set(a.code, g);
        }
      }
    }
    // Filtres structurels uniquement — ruptures (stockActuel=0) incluses
    const emp  = (document.getElementById('filterEmplacement')?.value || '').trim().toLowerCase();
    const abc  = document.getElementById('filterABC')?.value || '';
    const fmr  = document.getElementById('filterFMR')?.value || '';
    const stat = document.getElementById('filterStatut')?.value || '';
    const filteredMonRayon = (rayonData?.monRayon || []).filter(r => {
      if (emp  && !(r.emplacement || '').toLowerCase().includes(emp)) return false;
      if (abc  && r.abcClass !== abc) return false;
      if (fmr  && r.fmrClass !== fmr) return false;
      if (stat && r.statut  !== stat) return false;
      return true;
    });
    // Annoter sqClassif sans toucher à status
    for (const a of filteredMonRayon) {
      a.sqClassif = sqClassif.get(a.code) || null;
    }
    const filtered = rayonData ? { ...rayonData, monRayon: filteredMonRayon } : null;
    _S._prRayonData = filtered;
    _S._prPageRayon = PAGE_SIZE;
    _prRayonFilter  = '';
    return _prRenderRayon(filtered);
  }
  if (tab === 'squelette') return _prRenderSquelette(fam);
  if (tab === 'metiers')   return _prRenderMetiers(fam);
  if (tab === 'analyse')   return _prRenderAnalyse(fam);
  return '';
}

// ── Panel détail famille ─────────────────────────────────────────────
function _prRenderDetail(codeFam) {
  const fam = _S._prData?.families.find(f => f.codeFam === codeFam);
  if (!fam) return '<div class="t-disabled text-sm text-center py-4">Famille introuvable.</div>';

  const b = ACTION_BADGE[fam.classifGlobal] || ACTION_BADGE.potentiel;
  const sousFamLib = _prOpenSousFam
    ? (_S.catalogueFamille
        ? [..._S.catalogueFamille.values()]
            .find(f => f.codeFam === codeFam && f.codeSousFam === _prOpenSousFam)
            ?.sousFam || _prOpenSousFam
        : _prOpenSousFam)
    : '';
  const tabs = [
    { key: 'rayon',     label: '📊 Mon Rayon' },
    { key: 'squelette', label: '🦴 Squelette' },
    { key: 'metiers',   label: '🎯 Métiers'   },
    { key: 'analyse',   label: '📦 Analyse'   },
  ];

  return `<div id="prDetailPanel" class="mt-4 rounded-xl border b-light p-3">
    <div class="flex items-center justify-between mb-3">
      <div class="flex items-center gap-2 flex-wrap">
        <span class="text-[14px] font-extrabold t-primary">${escapeHtml(fam.libFam)}</span>
        <span class="text-[10px] t-disabled">${fam.codeFam}</span>
        ${sousFamLib ? `<span class="text-[10px] t-disabled mx-1">›</span><span class="text-[12px] t-secondary font-medium">${escapeHtml(sousFamLib)}</span>` : ''}
        <span class="text-[9px] px-2 py-0.5 rounded-full font-bold" style="background:${b.bg};color:${b.color}">${b.icon} ${b.label}</span>
      </div>
      <div class="flex items-center gap-1.5 flex-shrink-0">
        <button onclick="window._prExportDiag('${fam.codeFam}')"
          class="text-[10px] px-2 py-1 rounded border b-light t-secondary hover:t-primary flex-shrink-0"
          title="Copier le diagnostic pour IA">
          🤖 Diagnostic IA
        </button>
        <button onclick="window._prCloseDetail()" class="text-[11px] t-secondary hover:t-primary cursor-pointer border b-light px-2 py-0.5 rounded s-card shrink-0">✕</button>
      </div>
    </div>
    <div class="flex flex-wrap gap-1.5 mb-3">
      ${tabs.map(t => `<button onclick="window._prSetTab('${t.key}')" data-prtab="${t.key}"
        class="text-[11px] px-3 py-1.5 cursor-pointer border-b-2 ${_prDetailTab === t.key ? 'font-bold' : 't-secondary'}"
        style="${_prDetailTab === t.key ? 'border-color:var(--c-action);color:var(--t-primary)' : 'border-color:transparent'}">${t.label}</button>`).join('')}
    </div>
    <div id="prDetailContent">${_prGetTabContent(_prDetailTab, fam)}</div>
  </div>`;
}

// ── Render principal ─────────────────────────────────────────────────
function _renderPlanRayonContent(data) {
  const { totals } = data;
  const _badge = (key, n) => {
    const b = ACTION_BADGE[key];
    const active = _prFilterClassif === key;
    return `<button onclick="window._prSetFilter('${key}')" data-prbadge="${key}"
      class="flex flex-col items-center p-2 rounded-lg border cursor-pointer transition-all ${active ? 's-panel-inner' : 's-card'}"
      style="${active ? 'box-shadow:0 0 0 2px ' + b.color : ''}">
      <span class="text-base leading-none">${b.icon}</span>
      <span class="text-[13px] font-extrabold ${active ? 't-inverse' : 't-primary'}">${n}</span>
      <span class="text-[9px] ${active ? 't-inverse-muted' : 't-disabled'}">${b.label}</span>
    </button>`;
  };

  const legend = `<div class="flex items-center gap-3 text-[10px] t-disabled mb-3">
    <span><span style="display:inline-block;width:10px;height:8px;border-radius:2px;background:#3b82f6;margin-right:3px;vertical-align:middle"></span>Réseau</span>
    <span><span style="display:inline-block;width:10px;height:8px;border-radius:2px;background:#22c55e;margin-right:3px;vertical-align:middle"></span>Chalandise</span>
    <span><span style="display:inline-block;width:10px;height:8px;border-radius:2px;background:#f59e0b;margin-right:3px;vertical-align:middle"></span>Hors-zone</span>
    <span><span style="display:inline-block;width:10px;height:8px;border-radius:2px;background:#8b5cf6;margin-right:3px;vertical-align:middle"></span>Livraisons</span>
  </div>`;

  return `<div class="mb-3">
    <div class="flex items-center justify-between mb-2">
      <h3 class="font-extrabold text-sm t-primary">🔭 Plan de rayon — ${data.families.length} familles analysées</h3>
    </div>
    <div class="grid grid-cols-5 gap-2 mb-3">
      ${_badge('socle', totals.socle)}
      ${_badge('implanter', totals.implanter)}
      ${_badge('challenger', totals.challenger)}
      ${_badge('potentiel', totals.potentiel)}
      ${_badge('surveiller', totals.surveiller)}
    </div>
    <div class="relative mb-3">
      <input type="text" id="prSearchInput" placeholder="🔍 Rechercher une famille, marque ou code article…"
        autocomplete="off"
        class="w-full px-3 py-2 text-[12px] rounded-lg border b-default s-card t-primary focus:border-[var(--c-action)] focus:outline-none">
      <div id="prSearchResults" class="hidden absolute left-0 right-0 top-full mt-1 s-card border rounded-xl shadow-xl max-h-64 overflow-y-auto z-50"></div>
    </div>
    ${legend}
  </div>
  <div id="prFamGrid" class="grid grid-cols-1 sm:grid-cols-2 gap-3">
    ${(_prFilterClassif || _prSearchText || _prOpenFam)
      ? _prBuildCards(data, _prSearchText)
      : '<div class="col-span-2 text-center py-8 t-disabled text-[12px]">Cliquez sur une catégorie ou recherchez une famille</div>'}
  </div>
  ${_prOpenFam ? _prRenderDetail(_prOpenFam) : ''}`;
}

// ── Rerender + search ─────────────────────────────────────────────────
function _prRerender() {
  const el = document.getElementById('planRayonBlock');
  if (!el || !_S._prData) return;
  el.innerHTML = _renderPlanRayonContent(_S._prData);
  _initPrSearch();
}

function _initPrSearch() {
  const input = document.getElementById('prSearchInput');
  const results = document.getElementById('prSearchResults');
  if (!input || !results) return;

  _prSearchIndex = null; // forcer rebuild
  const searchIndex = _buildPrSearchIndex();

  let debounce;
  input.addEventListener('input', () => {
    clearTimeout(debounce);
    debounce = setTimeout(() => {
      const q = input.value.trim().toLowerCase();
      if (q.length < 2) { results.classList.add('hidden'); return; }
      if (!searchIndex.length) {
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
        return `<div class="px-3 py-2 hover:s-hover cursor-pointer border-b b-light text-[12px]"
          onclick="window._prSelectFam('${safeCF}','${safeCSF}')">
          ${label}${refsLabel}
        </div>`;
      }).join('');
      results.classList.remove('hidden');
    }, 200);
  });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const q = input.value.trim().toLowerCase();
      results.classList.add('hidden');
      _prSearchText  = q;
      _prOpenFam     = null;
      const grid = document.getElementById('prFamGrid');
      if (grid && _S._prData) grid.innerHTML = _prBuildCards(_S._prData, q);
    }
  });

  document.addEventListener('click', function _prOutside(e) {
    if (!input.contains(e.target) && !results.contains(e.target)) {
      results.classList.add('hidden');
      if (!document.getElementById('prSearchInput')) document.removeEventListener('click', _prOutside);
    }
  });
}

// ── Handlers window.* ─────────────────────────────────────────────────
window._prSetFilter = function(key) {
  _prFilterClassif = _prFilterClassif === key ? '' : key;
  _prGridVisible   = _prFilterClassif !== '';
  _prSearchText    = '';
  _prOpenFam = null;
  const grid = document.getElementById('prFamGrid');
  if (grid && _S._prData) grid.innerHTML = _prFilterClassif
    ? _prBuildCards(_S._prData, '')
    : '<div class="col-span-2 text-center py-8 t-disabled text-[12px]">Cliquez sur une catégorie ou recherchez une famille</div>';
  const panel = document.getElementById('prDetailPanel');
  if (panel) panel.remove();
  document.querySelectorAll('[data-prbadge]').forEach(btn => {
    const k = btn.dataset.prbadge;
    const b = ACTION_BADGE[k];
    const active = _prFilterClassif === k;
    btn.className = `flex flex-col items-center p-2 rounded-lg border cursor-pointer transition-all ${active ? 's-panel-inner' : 's-card'}`;
    btn.style.boxShadow = active ? `0 0 0 2px ${b.color}` : '';
  });
};

window._prOpenDetail = function(codeFam) {
  _prOpenFam = codeFam;
  _prOpenSousFam = '';
  _prDetailTab = 'rayon';
  _S._prSqFilter = '';
  _S._prSqData = null;
  _prSqPage = 50;
  _prMetierDist = 0;
  _prRerender();
  setTimeout(() => {
    const panel = document.getElementById('prDetailPanel');
    if (panel) panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, 50);
};

window._prCloseDetail = function() {
  _prOpenFam = null;
  _prMetierDist = 0;
  _prRerender();
};

window._prSetTab = function(tab) {
  _prDetailTab = tab;
  document.querySelectorAll('[data-prtab]').forEach(btn => {
    const active = btn.dataset.prtab === tab;
    btn.className = `text-[11px] px-3 py-1.5 cursor-pointer border-b-2 ${active ? 'font-bold' : 't-secondary'}`;
    btn.style.borderColor = active ? 'var(--c-action)' : 'transparent';
    btn.style.color       = active ? 'var(--t-primary)' : '';
  });
  const fam = _S._prData?.families.find(f => f.codeFam === _prOpenFam);
  const el  = document.getElementById('prDetailContent');
  if (el && fam) el.innerHTML = _prGetTabContent(tab, fam);
};

window._prSetRayonFilter = function(key) {
  _prRayonFilter  = _prRayonFilter === key ? '' : key;
  _S._prPageRayon = PAGE_SIZE;
  const el = document.getElementById('prDetailContent');
  if (el && _S._prRayonData) el.innerHTML = _prRenderRayon(_S._prRayonData);
};

window._prSqFilterFn = function(key) {
  _S._prSqFilter = _S._prSqFilter === key ? '' : key;
  _prSqPage = 50;
  const fam = _S._prData?.families.find(f => f.codeFam === _prOpenFam);
  const el  = document.getElementById('prDetailContent');
  if (el && fam) el.innerHTML = _prRenderSquelette(fam);
};

window._prMetierDistChange = function(val) {
  _prMetierDist = parseInt(val) >= 100 ? 0 : parseInt(val);
  const label = document.getElementById('prMetierDistLabel');
  if (label) label.textContent = !_prMetierDist ? 'Tous' : _prMetierDist + ' km';
  const el = document.getElementById('prDetailContent');
  if (!el || !_S._prData || !_prOpenFam) return;
  const fam = _S._prData.families.find(f => f.codeFam === _prOpenFam);
  if (fam) el.innerHTML = _prRenderMetiers(fam);
};

window._prMoreSq = function() {
  _prSqPage += 50;
  const el = document.getElementById('prDetailContent');
  if (!el || !_S._prSqArts) return;
  const fam = _S._prData?.families.find(f => f.codeFam === _prOpenFam);
  if (fam) el.innerHTML = _prRenderSquelette(fam);
};

window._prSelectFam = function(codeFam, codeSousFam) {
  const results = document.getElementById('prSearchResults');
  if (results) results.classList.add('hidden');
  const input = document.getElementById('prSearchInput');
  if (input) input.value = '';
  _prSearchText  = '';
  _prOpenFam     = codeFam;
  _prOpenSousFam = codeSousFam || '';
  _prDetailTab    = 'rayon';
  _prGridVisible  = true;
  _prRayonFilter  = '';
  _S._prSqFilter  = '';
  _S._prSqData    = null;
  // Montrer uniquement la famille sélectionnée dans la grille
  const grid = document.getElementById('prFamGrid');
  if (grid && _S._prData) {
    const onlyFam = _S._prData.families.filter(f => f.codeFam === codeFam);
    grid.innerHTML = _prBuildCards({ families: onlyFam }, '');
  }
  _prRerender();
};

window._prMoreRayon = function() {
  if (!_S._prRayonData) return;
  _S._prPageRayon = (_S._prPageRayon || PAGE_SIZE) + PAGE_SIZE;
  const el = document.getElementById('prDetailContent');
  if (el) el.innerHTML = _prRenderRayon(_S._prRayonData);
};

window._prExportRayon = function() {
  if (!_S._prRayonData) return;
  const { monRayon, codeFam } = _S._prRayonData;
  const headers = ['Code', 'Libellé', 'Sous-famille', 'Stock', 'W', 'ABC', 'FMR', 'CA agence', 'Statut'];
  const rows = monRayon.map(a =>
    [a.code, a.libelle, a.sousFam, a.stockActuel, a.W, a.abcClass, a.fmrClass, (a.caAgence || 0).toFixed(2), a.status].join(';')
  );
  const csv = [headers.join(';'), ...rows].join('\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `plan_rayon_${codeFam}.csv`; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

// ── Diagnostic IA ──────────────────────────────────────────────────────
function _prBuildDiagText(codeFam) {
  const fam = _S._prData?.families.find(f => f.codeFam === codeFam);
  if (!fam) return '';

  const agence = _S.selectedMyStore || 'agence';
  const rayonData = _S._prRayonData || computeMonRayon(codeFam, '');
  const sqData = computeSquelette();
  const catFam = _S.catalogueFamille;

  let txt = `[CONTEXTE PRISME — Diagnostic rayon à analyser]\n`;
  txt += `Tu es consultant rayon expert pour une agence Legallais (distributeur B2B quincaillerie pro).\n`;
  txt += `Agence : ${agence}. Famille analysée : ${fam.libFam} (${fam.codeFam})\n`;
  txt += `Action recommandée par PRISME : ${ACTION_BADGE[fam.classifGlobal]?.label || fam.classifGlobal}\n\n`;

  txt += `═══ MON RAYON AUJOURD'HUI ═══\n`;
  if (rayonData) {
    txt += `${rayonData.monRayon.length} articles en stock · ${rayonData.couverture}% couverture catalogue (${rayonData.monRayon.length}/${rayonData.nbCatalogue}) · ${Math.round(rayonData.valeurTotale)}€ valeur stock\n\n`;

    const pepites     = rayonData.monRayon.filter(a => a.status === 'pepite');
    const socles      = rayonData.monRayon.filter(a => a.sqClassif === 'socle' && a.status !== 'pepite');
    const challengers = rayonData.monRayon.filter(a => a.status === 'challenger' || a.sqClassif === 'challenger');
    const dormants    = rayonData.monRayon.filter(a => a.status === 'dormant');
    const ruptures    = rayonData.monRayon.filter(a => a.status === 'rupture');

    if (pepites.length) {
      txt += `Pépites AF (ne jamais rompre) :\n`;
      pepites.forEach(a => txt += `  • ${a.libelle} (${a.marque || '?'}) — W=${a.W}, stock ${a.stockActuel}, CA ${Math.round(a.caAgence)}€\n`);
      txt += '\n';
    }
    if (socles.length) {
      txt += `Socle réseau (justifiés par les sources) :\n`;
      socles.slice(0, 10).forEach(a => txt += `  • ${a.libelle} — W=${a.W}, stock ${a.stockActuel}\n`);
      if (socles.length > 10) txt += `  ... et ${socles.length - 10} autres\n`;
      txt += '\n';
    }
    if (challengers.length) {
      txt += `Challengers (en stock mais non justifiés) :\n`;
      challengers.slice(0, 10).forEach(a => txt += `  • ${a.libelle} — W=${a.W}, stock ${a.stockActuel}\n`);
      txt += '\n';
    }
    if (dormants.length) {
      txt += `Dormants (W=0, stock immobilisé) :\n`;
      dormants.slice(0, 5).forEach(a => txt += `  • ${a.libelle} — stock ${a.stockActuel}, valeur ${Math.round(a.valeurStock || 0)}€\n`);
      if (dormants.length > 5) txt += `  ... et ${dormants.length - 5} autres dormants\n`;
      txt += '\n';
    }
    if (ruptures.length) {
      txt += `Ruptures (référencés mais stock=0) :\n`;
      ruptures.slice(0, 5).forEach(a => txt += `  • ${a.libelle} — W=${a.W} (à réapprovisionner)\n`);
      txt += '\n';
    }
  }

  txt += `═══ SQUELETTE RÉSEAU (4 sources croisées) ═══\n`;
  txt += `🟢 Socle : ${fam.socle} articles · 🔵 À implanter : ${fam.implanter} · 🔴 Challenger : ${fam.challenger} · 🟡 Potentiel : ${fam.potentiel} · 👁 Surveiller : ${fam.surveiller}\n`;
  txt += `Sources actives : ${[fam.srcReseau?'Réseau':'',fam.srcChalandise?'Chalandise':'',fam.srcHorsZone?'Hors-zone':'',fam.srcLivraisons?'Livraisons':''].filter(Boolean).join(', ')}\n\n`;

  if (sqData) {
    const toImpl = [];
    for (const d of sqData.directions) {
      for (const a of (d.implanter || [])) {
        const cf = catFam?.get(a.code)?.codeFam || _S.articleFamille?.[a.code];
        if (cf === codeFam) toImpl.push(a);
      }
    }
    if (toImpl.length) {
      txt += `Top articles à implanter (absents, signal réseau fort) :\n`;
      toImpl.slice(0, 8).forEach(a => txt += `  • ${a.libelle} — ${a.nbAgencesReseau || 0} agences réseau, ${a.nbClientsZone || 0} clients zone\n`);
      if (toImpl.length > 8) txt += `  ... et ${toImpl.length - 8} autres\n`;
      txt += '\n';
    }
  }

  txt += `═══ CATALOGUE ═══\n`;
  txt += `${fam.nbCatalogue} références disponibles chez Legallais dans cette famille (couverture actuelle ${fam.couverture}%)\n`;

  const sfCount = new Map();
  if (catFam) for (const [,f] of catFam) {
    if (f.codeFam === codeFam && f.sousFam) sfCount.set(f.sousFam, (sfCount.get(f.sousFam)||0)+1);
  }
  if (sfCount.size) {
    txt += `Sous-familles : ${[...sfCount.entries()].sort((a,b)=>b[1]-a[1]).slice(0,6).map(([sf,n])=>`${sf} (${n})`).join(', ')}\n`;
  }

  const marCount = new Map();
  if (_S.marqueArticles) for (const [m,codes] of _S.marqueArticles) {
    let cnt = 0;
    for (const c of codes) if (catFam?.get(c)?.codeFam === codeFam) cnt++;
    if (cnt > 0) marCount.set(m, cnt);
  }
  if (marCount.size) {
    txt += `Marques principales : ${[...marCount.entries()].sort((a,b)=>b[1]-a[1]).slice(0,5).map(([m,n])=>`${m} (${n} réf)`).join(', ')}\n`;
  }
  txt += '\n';

  if (_S.chalandiseReady && _S.chalandiseData?.size) {
    txt += `═══ MÉTIERS CLIENTS (chalandise) ═══\n`;
    const metierCA = new Map();
    const metierCli = new Map();
    for (const [cc, artMap] of (_S.ventesClientArticle || new Map())) {
      const metier = _S.chalandiseData.get(cc)?.metier || 'Non classifié';
      let caFam = 0;
      for (const [code, data] of artMap) {
        const cf = catFam?.get(code)?.codeFam || _S.articleFamille?.[code];
        if (cf === codeFam) caFam += data.sumCA || 0;
      }
      if (caFam > 0) {
        metierCA.set(metier, (metierCA.get(metier)||0) + caFam);
        metierCli.set(metier, (metierCli.get(metier)||0) + 1);
      }
    }
    [...metierCA.entries()].sort((a,b)=>b[1]-a[1]).slice(0,6).forEach(([m,ca]) => {
      txt += `  • ${m} : ${metierCli.get(m)} clients, ${Math.round(ca)}€ CA famille\n`;
    });
    txt += '\n';
  }

  txt += `═══ INSTRUCTION ═══\n`;
  txt += `Génère un diagnostic actionnable en français pour le chef de rayon de cette agence.\n`;
  txt += `Structure : 1) État du rayon 2) Ce que le réseau dit 3) Actions prioritaires (garder/implanter/challenger/réappro)\n`;
  txt += `Sois direct, concret, sans jargon inutile. Max 400 mots.\n`;

  return txt;
}

function _prDownloadDiag(txt, codeFam) {
  const blob = new Blob([txt], { type: 'text/plain;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `diagnostic_${codeFam}.txt`;
  a.click();
  URL.revokeObjectURL(url);
}

window._prExportDiag = function(codeFam) {
  const txt = _prBuildDiagText(codeFam);
  if (!txt) return;
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(txt).then(() => {
      const btn = document.querySelector('[onclick*="_prExportDiag"]');
      if (btn) {
        const orig = btn.textContent;
        btn.textContent = '✅ Copié !';
        btn.style.color = '#22c55e';
        setTimeout(() => { btn.textContent = orig; btn.style.color = ''; }, 2000);
      }
    }).catch(() => _prDownloadDiag(txt, codeFam));
  } else {
    _prDownloadDiag(txt, codeFam);
  }
};

// ── Export ─────────────────────────────────────────────────────────────
export function renderPlanRayon() {
  const el = document.getElementById('planRayonBlock');
  if (!el) return;
  _prMetierDist = 0;

  if (!_S.ventesParMagasin || !Object.keys(_S.ventesParMagasin).length || !_S.finalData?.length) {
    el.innerHTML = '<div class="text-[11px] t-disabled py-3 text-center">Chargez un Consommé + Stock pour activer le Plan de rayon.</div>';
    return;
  }

  const data = computePlanStock();
  if (!data || !data.families.length) {
    el.innerHTML = '<div class="text-[11px] t-disabled py-3 text-center">Aucune famille détectée.</div>';
    return;
  }

  const badge = document.getElementById('planRayonInline');
  if (badge) badge.textContent = `${data.families.length} familles · ${data.totals.implanter} à développer · ${data.totals.challenger} à retravailler`;

  _S._prData = data;
  _prFilterClassif = '';
  _prOpenFam       = null;
  _prOpenSousFam   = '';
  _prDetailTab     = 'rayon';
  _prGridVisible   = false;
  _prSearchText    = '';
  _S._prSqFilter   = '';
  _S._prSqData     = null;

  el.innerHTML = _renderPlanRayonContent(data);
  _initPrSearch();
}

export const renderPlanStock = renderPlanRayon;
