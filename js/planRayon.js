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
let _prSqSort        = 'reseau'; // 'agence'|'reseau'|'livraison'|'classif'
let _prMetierDist    = 0;    // 0 = Tous, sinon filtre km
let _prEmpFilter     = '';   // filtre emplacement interne Mon Rayon
let _prSelectedSFs     = new Set(); // Set<codeSousFam> sélectionnées dans Analyse
let _prSelectedMarques = new Set(); // Set<marque> sélectionnées dans Analyse
let _prSelectedEmps    = new Set(); // Set<emplacement> actifs dans Mon Rayon
const PAGE_SIZE = 20;

// ── Constantes visuelles ─────────────────────────────────────────────
const ACTION_BADGE = {
  socle:      { label: 'Bien couverte',  gradient: 'linear-gradient(135deg,#16a34a,#059669)', bg: '#dcfce7', color: '#166534', icon: '🟢', dot: '#34d399', cardBg: 'rgba(52,211,153,0.04)',  cardBorder: 'rgba(52,211,153,0.22)' },
  implanter:  { label: 'À développer',   gradient: 'linear-gradient(135deg,#2563eb,#4f46e5)', bg: '#dbeafe', color: '#1e40af', icon: '🔵', dot: '#60a5fa', cardBg: 'rgba(96,165,250,0.04)',  cardBorder: 'rgba(96,165,250,0.22)' },
  challenger: { label: 'À retravailler', gradient: 'linear-gradient(135deg,#dc2626,#9f1239)', bg: '#fee2e2', color: '#991b1b', icon: '🔴', dot: '#f87171', cardBg: 'rgba(248,113,113,0.04)', cardBorder: 'rgba(248,113,113,0.22)' },
  potentiel:  { label: 'Potentiel',      gradient: 'linear-gradient(135deg,#d97706,#b45309)', bg: '#fef9c3', color: '#854d0e', icon: '🟡', dot: '#fbbf24', cardBg: 'rgba(251,191,36,0.04)',  cardBorder: 'rgba(251,191,36,0.22)' },
  surveiller: { label: 'À surveiller',   gradient: 'linear-gradient(135deg,#7c3aed,#6d28d9)', bg: '#f1f5f9', color: '#475569', icon: '👁️', dot: '#64748b', cardBg: 'rgba(100,116,139,0.04)', cardBorder: 'rgba(100,116,139,0.22)' },
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
  // Filtres structurels uniquement — PAS l'emplacement ni l'âge
  const fam_f  = (document.getElementById('filterFamille')?.value || '').trim().toLowerCase();
  const abc_f  = document.getElementById('filterABC')?.value || '';
  const fmr_f  = document.getElementById('filterFMR')?.value || '';
  const stat_f = document.getElementById('filterStatut')?.value || '';

  const filteredData = (_S.finalData || []).filter(r => {
    if (fam_f  && !(r.famille||'').toLowerCase().includes(fam_f)
               && !famLib(r.famille||'').toLowerCase().includes(fam_f)) return false;
    if (abc_f  && r.abcClass !== abc_f) return false;
    if (fmr_f  && r.fmrClass !== fmr_f) return false;
    if (stat_f && r.statut   !== stat_f) return false;
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
    if (fam) {
      // Normaliser : prendre les 3 premiers chars si articleFamille est plus long
      const codeFam = fam.length > 3 ? fam.slice(0, 3) : fam;
      return { codeFam, libFam: FAMILLE_LOOKUP[codeFam.slice(0, 2)] || codeFam };
    }
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
  if (!catFam?.size) {
    // Fallback : catalogue non chargé (ex: refresh depuis IDB) → index basique depuis _prData
    const families = _S._prData?.families;
    if (families?.length) {
      for (const f of families) {
        index.push({ codeFam: f.codeFam, codeSousFam: '', libFam: f.libFam || f.codeFam, sousFam: '',
          level: 1, nbArticlesCat: f.nbCatalogue || 0,
          searchText: `${f.codeFam} ${(f.libFam || '')}`.toLowerCase() });
      }
      _prSearchIndex = index;
    }
    return index;
  }

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

  // Index libellés par sous-famille pour enrichir la search
  const sfLibelles = new Map(); // "codeFam|codeSousFam" → Set<mot>
  if (_S.catalogueDesignation?.size) {
    for (const [code, desig] of _S.catalogueDesignation) {
      const cf = catFam?.get(code);
      if (!cf?.codeFam || !cf?.codeSousFam) continue;
      const key = `${cf.codeFam}|${cf.codeSousFam}`;
      if (!sfLibelles.has(key)) sfLibelles.set(key, new Set());
      // Extraire les mots du libellé (≥4 lettres pour éviter le bruit)
      const mots = desig.toLowerCase().split(/\W+/).filter(m => m.length >= 4);
      for (const mot of mots) sfLibelles.get(key).add(mot);
    }
  }

  for (const [cf, agg] of famAgg) {
    const famMots = new Set();
    for (const [key, mots] of sfLibelles) {
      if (key.startsWith(cf + '|')) for (const m of mots) famMots.add(m);
    }
    const famMotsStr = famMots.size ? ' ' + [...famMots].slice(0, 100).join(' ') : '';
    index.push({ codeFam: cf, codeSousFam: '', libFam: agg.libFam, sousFam: '',
      level: 1, nbArticlesCat: agg.totalCount,
      searchText: `${cf} ${agg.libFam}${famMotsStr}`.toLowerCase() });
    for (const [csf, sf] of agg.sousFams) {
      const sfKey = `${cf}|${csf}`;
      const sfMots = sfLibelles.has(sfKey)
        ? ' ' + [...sfLibelles.get(sfKey)].slice(0, 50).join(' ')
        : '';
      index.push({ codeFam: cf, codeSousFam: csf, libFam: agg.libFam, sousFam: sf.sousFam,
        level: 2, nbArticlesCat: sf.count,
        searchText: `${cf} ${csf} ${agg.libFam} ${sf.sousFam}${sfMots}`.toLowerCase() });
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

  // Level 5 : emplacements
  const empCount = new Map();
  for (const r of (_S.finalData || [])) {
    if (!r.emplacement?.trim()) continue;
    const emp = r.emplacement.trim();
    empCount.set(emp, (empCount.get(emp) || 0) + 1);
  }
  for (const [emp, cnt] of empCount) {
    index.push({
      level: 5,
      codeFam: '', codeSousFam: '', libFam: '', sousFam: '',
      emplacement: emp,
      nbArticlesCat: cnt,
      searchText: emp.toLowerCase(),
    });
  }

  const empEntries = index.filter(e => e.level === 5);
  console.log('[PrSearch] Emplacements indexés:', empEntries.length, empEntries.slice(0, 5));

  index.sort((a, b) => a.level - b.level || b.nbArticlesCat - a.nbArticlesCat);
  _prSearchIndex = index;
  return index;
}

// ── Render cartes famille ────────────────────────────────────────────
function _prBuildCards(data, searchText = '') {
  // Si filtre emplacement actif → ne montrer que les familles
  // qui ont au moins 1 article à cet emplacement
  let empFamilles = null;
  if (_prEmpFilter) {
    const empList = _prEmpFilter.split(';').map(e => e.trim().toLowerCase()).filter(Boolean);
    empFamilles = new Set();
    const catFam = _S.catalogueFamille;
    for (const r of (_S.finalData || [])) {
      const emp = (r.emplacement || '').toLowerCase();
      if (!empList.some(e => emp.includes(e))) continue;
      const cf = catFam?.get(r.code)?.codeFam || _S.articleFamille?.[r.code];
      if (cf) empFamilles.add(cf);
    }
  }

  let families = data.families;
  if (empFamilles !== null) {
    families = families.filter(f => empFamilles.has(f.codeFam));
  }
  if (_prFilterClassif) families = families.filter(f => f.classifGlobal === _prFilterClassif);
  if (searchText) families = families.filter(f =>
    f.libFam.toLowerCase().includes(searchText) || f.codeFam.toLowerCase().includes(searchText)
  );
  if (!_prFilterClassif && !searchText && !_prEmpFilter && _prOpenFam) {
    families = families.filter(f => f.codeFam === _prOpenFam);
  }
  if (!families.length) return `<div class="col-span-2 text-center py-6 t-disabled text-[12px]">${_prEmpFilter ? `Aucune famille trouvée à l'emplacement "${escapeHtml(_prEmpFilter)}".` : 'Aucune famille pour ce filtre.'}</div>`;
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
    out += `<div class="s-card rounded-xl border p-3 cursor-pointer transition-all"
      style="background:${b.cardBg};border-color:${b.cardBorder}"
      onclick="window._prOpenDetail('${safeCF}')">
      <div class="flex items-start justify-between mb-0.5">
        <div class="flex-1 min-w-0 mr-2">
          <div class="text-[12px] font-bold t-primary truncate">${escapeHtml(f.libFam)}</div>
          <div class="text-[10px] t-disabled">${f.codeFam}</div>
        </div>
        <span class="text-[9px] font-semibold shrink-0 flex items-center gap-1" style="color:${b.dot}"><span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:${b.dot};flex-shrink:0"></span>${b.label}</span>
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
  const { monRayon, nbCatalogue } = data;
  const displayedForHeader = _prSelectedEmps.size > 0
    ? monRayon.filter(a => _prSelectedEmps.has(a.emplacement || ''))
    : monRayon;
  const valeurTotale = displayedForHeader.reduce((s, a) => s + (a.valeurStock || 0), 0);
  const couverture = nbCatalogue > 0
    ? Math.round(displayedForHeader.length / nbCatalogue * 100)
    : 0;
  const page = _S._prPageRayon || PAGE_SIZE;
  const pepites  = displayedForHeader.filter(a => a.status === 'pepite').length;
  const challeng = displayedForHeader.filter(a => a.status === 'challenger').length;
  const dormants = displayedForHeader.filter(a => a.status === 'dormant').length;
  const ruptures = displayedForHeader.filter(a => a.status === 'rupture').length;
  const standard = displayedForHeader.length - pepites - challeng - dormants - ruptures;
  // Pills emplacements
  const empsInRayon = [...new Set(monRayon.map(a => a.emplacement).filter(Boolean))].sort();
  const empPills = empsInRayon.length > 1
    ? `<div class="flex gap-1.5 flex-wrap mb-3 items-center">
        <span class="text-[10px] t-disabled">📍</span>
        ${empsInRayon.map(emp => {
          const active = _prSelectedEmps.has(emp);
          return `<button onclick="window._prToggleEmp('${emp.replace(/'/g, "\\'")}')"
            class="text-[10px] px-2 py-0.5 rounded border cursor-pointer transition-all ${active ? 's-panel-inner t-inverse' : 's-card t-secondary'}"
            style="${active ? 'box-shadow:0 0 0 1.5px var(--c-action)' : ''}">${escapeHtml(emp)}</button>`;
        }).join('')}
        ${_prSelectedEmps.size ? `<button onclick="window._prClearEmps()" class="text-[10px] t-disabled hover:t-primary ml-1">✕</button>` : ''}
      </div>`
    : '';
  const marquePillsRayon = _prSelectedMarques.size > 0
    ? `<div class="flex gap-1.5 flex-wrap mb-3 items-center">
        <span class="text-[10px] t-disabled">🏷️</span>
        ${[..._prSelectedMarques].sort().map(m => `<span class="text-[10px] px-2 py-0.5 rounded border s-panel-inner t-inverse flex items-center gap-1" style="box-shadow:0 0 0 1.5px var(--c-action)">
          ${escapeHtml(m)}
          <button onclick="window._prToggleMarque('${m.replace(/\\/g,'\\\\').replace(/'/g,"\\'")}')" class="t-disabled hover:t-primary leading-none" style="font-size:10px">✕</button>
        </span>`).join('')}
      </div>`
    : '';
  // Filtre emplacement puis statut (réutilise displayedForHeader, déjà filtré)
  const afterEmp = displayedForHeader;
  const displayed = _prRayonFilter
    ? afterEmp.filter(a => a.status === _prRayonFilter)
    : afterEmp;
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
    ${displayedForHeader.length} articles en rayon · ${couverture}% couverture (${displayedForHeader.length}/${nbCatalogue}) · ${formatEuro(valeurTotale)} valeur stock
  </div>
  ${empPills}${marquePillsRayon}
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
const _SQ_CLASSIF_ORDER = ['socle','implanter','challenger','potentiel','surveiller'];
const _SQ_SORT_FNS = {
  agence:    (a, b) => (b.W || 0) - (a.W || 0),
  reseau:    (a, b) => (b.nbAgencesReseau || 0) - (a.nbAgencesReseau || 0),
  livraison: (a, b) => (b.nbBLLivraisons  || 0) - (a.nbBLLivraisons  || 0),
  classif:   (a, b) => _SQ_CLASSIF_ORDER.indexOf(a._g) - _SQ_CLASSIF_ORDER.indexOf(b._g),
};

function _prBuildSqTable(arts) {
  const filter = _S._prSqFilter || '';
  const filtered = filter === 'absent'
    ? arts.filter(a => !a.enStock)
    : filter
      ? arts.filter(a => a._g === filter)
      : arts;
  if (!filtered.length) return '<div class="t-disabled text-sm text-center py-4">Aucun article.</div>';

  const sorted = [...filtered].sort(_SQ_SORT_FNS[_prSqSort] || _SQ_SORT_FNS.reseau);
  const shown = sorted.slice(0, _prSqPage);

  const _thSort = (key, label, align = 'text-right') => {
    const active = _prSqSort === key;
    return `<th class="py-1.5 px-2 ${align} cursor-pointer hover:t-primary select-none"
      style="color:${active ? 'var(--c-action,#8b5cf6)' : 'var(--t-secondary)'};font-weight:${active ? 700 : 500}"
      onclick="window._prSqSortFn('${key}')">${label}${active ? ' ▼' : ''}</th>`;
  };

  const rows = shown.map(a => {
    const cb = CLASSIF_BADGE[a._g] || CLASSIF_BADGE.potentiel;
    return `<tr class="border-b b-light hover:s-hover text-[11px] cursor-pointer"
      onclick="if(window.openArticlePanel)window.openArticlePanel('${a.code}','planRayon')">
      <td class="py-1.5 px-2 font-mono t-disabled">${a.code}</td>
      <td class="py-1.5 px-2 t-primary">${escapeHtml(a.libelle || a.code)}</td>
      <td class="py-1.5 px-2"><span class="text-[8px] px-1.5 py-0.5 rounded-full font-bold" style="background:${cb.bg};color:${cb.color}">${cb.icon} ${cb.label}</span></td>
      <td class="py-1.5 px-2">${_prSourceBar(a.sources)}</td>
      <td class="py-1.5 px-2 text-right t-secondary">${a.W || 0}</td>
      <td class="py-1.5 px-2 text-right t-secondary">${a.nbAgencesReseau || 0}</td>
      <td class="py-1.5 px-2 text-right t-secondary">${a.nbBLLivraisons || 0}</td>
      <td class="py-1.5 px-2 text-right t-secondary">${a.enStock ? a.stockActuel : '—'}</td>
    </tr>`;
  }).join('');

  return `<div class="overflow-x-auto" id="prSqTable">
    <table class="w-full text-[11px]">
      <thead><tr class="border-b b-light text-[10px]">
        <th class="py-1.5 px-2 text-left" style="color:var(--t-secondary);font-weight:500">Code</th>
        <th class="py-1.5 px-2 text-left" style="color:var(--t-secondary);font-weight:500">Libellé</th>
        <th class="py-1.5 px-2 text-left" style="color:var(--t-secondary);font-weight:500">Classif.</th>
        <th class="py-1.5 px-2 text-left" style="color:var(--t-secondary);font-weight:500">Sources</th>
        ${_thSort('agence',    'Ventes ag.')}
        ${_thSort('reseau',    'Nb agences')}
        ${_thSort('livraison', 'BL Livr.')}
        ${_thSort('classif',   'Stock', 'text-right')}
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>
    ${sorted.length > _prSqPage ? `<div class="mt-2 text-center"><button onclick="window._prMoreSq()" class="text-[10px] t-secondary hover:t-primary px-3 py-1 rounded border b-light">Voir plus (${sorted.length - _prSqPage} restants)</button></div>` : ''}
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
        const cfCat = _S.catalogueFamille?.get(a.code)?.codeFam;
        const cfArt = _S.articleFamille?.[a.code] || '';
        // Match si catalogue exact OU si articleFamille commence par codeFam (ex: B10 dans B10X)
        const matches = cfCat === fam.codeFam
          || (!cfCat && cfArt.startsWith(fam.codeFam))
          || cfArt === fam.codeFam;
        if (matches) {
          if (_prOpenSousFam) {
            const csf = _S.catalogueFamille?.get(a.code)?.codeSousFam || '';
            if (csf !== _prOpenSousFam) continue;
          }
          if (_prSelectedSFs.size > 0) {
            const csf = _S.catalogueFamille?.get(a.code)?.codeSousFam || '';
            if (!_prSelectedSFs.has(csf)) continue;
          }
          if (_prSelectedMarques.size > 0) {
            if (!_prSelectedMarques.has(_S.catalogueMarques?.get(a.code) || '')) continue;
          }
          arts.push({ ...a, _g: g });
        }
      }
    }
  }
  // Enrichir avec W depuis finalData (computeSquelette ne porte pas W)
  const _wLookup = new Map();
  for (const r of (_S.finalData || [])) {
    if (r.code && r.W) _wLookup.set(r.code, r.W);
  }
  const artsWithW = arts.map(a => ({ ...a, W: _wLookup.get(a.code) || 0 }));
  _S._prSqArts = artsWithW;

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

  return `<div class="flex flex-wrap gap-1.5 mb-3 items-center">${pills}${sousFamNote}</div>${_prBuildSqTable(artsWithW)}`;
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
      const metier = info?.metier || 'Hors agence';
      let caFam = 0;
      for (const [code, v] of artMap) {
        const cf = catFam?.get(code);
        const cfCode = cf?.codeFam || _S.articleFamille?.[code];
        if (cfCode !== fam.codeFam) continue;
        if (_prSelectedSFs.size > 0 && !_prSelectedSFs.has(cf?.codeSousFam || '')) continue;
        if (_prSelectedMarques.size > 0 && !_prSelectedMarques.has(_S.catalogueMarques?.get(code) || '')) continue;
        caFam += v.sumCA || 0;
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

  return `${sliderHtml}<div class="text-[10px] t-disabled mb-3">📅 Calculé sur l'historique complet (ventesClientArticleFull)</div><div class="overflow-x-auto">
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

  // Pills emplacements
  const empsInFam = [...new Set(
    (_S.finalData || [])
      .filter(r => {
        const cf = catFam?.get(r.code)?.codeFam || _S.articleFamille?.[r.code];
        return cf === fam.codeFam && r.emplacement?.trim();
      })
      .map(r => r.emplacement.trim())
  )].sort();
  const empPillsAnalyse = empsInFam.length > 0
    ? `<div class="flex gap-1.5 flex-wrap mb-4 items-center">
        <span class="text-[10px] t-disabled">📍</span>
        ${empsInFam.map(emp => {
          const active = _prSelectedEmps.has(emp);
          return `<button onclick="window._prToggleEmp('${emp.replace(/'/g, "\\'")}')"
            class="text-[10px] px-2 py-0.5 rounded border cursor-pointer transition-all ${active ? 's-panel-inner t-inverse' : 's-card t-secondary'}"
            style="${active ? 'box-shadow:0 0 0 1.5px var(--c-action)' : ''}">${escapeHtml(emp)}</button>`;
        }).join('')}
        ${_prSelectedEmps.size ? `<button onclick="window._prClearEmps()" class="text-[10px] t-disabled hover:t-primary ml-1">✕</button>` : ''}
      </div>`
    : '';

  const marquePills = _prSelectedMarques.size > 0
    ? `<div class="flex gap-1.5 flex-wrap mb-4 items-center">
        <span class="text-[10px] t-disabled">🏷️</span>
        ${[..._prSelectedMarques].sort().map(m => `<span class="text-[10px] px-2 py-0.5 rounded border s-panel-inner t-inverse flex items-center gap-1" style="box-shadow:0 0 0 1.5px var(--c-action)">
          ${escapeHtml(m)}
          <button onclick="window._prToggleMarque('${m.replace(/\\/g,'\\\\').replace(/'/g,"\\'")}')" class="t-disabled hover:t-primary leading-none" style="font-size:10px">✕</button>
        </span>`).join('')}
      </div>`
    : '';

  // nbCat par sousFam — catalogue INVARIANT (pas de filtre emplacement)
  const sfCatCount = new Map(); // sousFam → nbCat
  if (catFam) for (const [, f] of catFam) {
    if (f.codeFam !== fam.codeFam || !f.sousFam) continue;
    sfCatCount.set(f.sousFam, (sfCatCount.get(f.sousFam) || 0) + 1);
  }

  // nbStock par sousFam — filtré sur emplacements si actif
  const sfStockCount = new Map(); // sousFam → nbStock
  const empList = _prSelectedEmps.size > 0 ? _prSelectedEmps : null;
  for (const r of (_S.finalData || [])) {
    const cf = catFam?.get(r.code);
    if (!cf || cf.codeFam !== fam.codeFam || !cf.sousFam) continue;
    if (empList && !empList.has(r.emplacement || '')) continue;
    if ((r.stockActuel || 0) > 0)
      sfStockCount.set(cf.sousFam, (sfStockCount.get(cf.sousFam) || 0) + 1);
  }

  // Liste finale : toutes les SFs du catalogue, triées par nbCat desc
  const sfSorted = [...sfCatCount.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([sf, nbCat]) => ({
      sf,
      nbCat,
      nbStock: sfStockCount.get(sf) || 0,
      codeSousFam: [...(catFam?.values() || [])].find(f =>
        f.codeFam === fam.codeFam && f.sousFam === sf
      )?.codeSousFam || '',
    }));

  // Quand filtre emplacement actif, masquer (opacity) les SFs sans stock dans ces emplacements
  const thSF = `<thead style="border-bottom:1px solid var(--color-border-tertiary)">
    <tr style="color:var(--t-secondary);font-size:10px;font-weight:600">
      <th class="py-1.5 px-2 text-left">Sous-famille</th>
      <th class="py-1.5 px-2 text-right">En stock</th>
      <th class="py-1.5 px-2 text-right">Réf. cat.</th>
      <th class="py-1.5 px-2">Couverture</th>
    </tr></thead>`;
  const sfRows = sfSorted.map(({ sf, nbCat, nbStock, codeSousFam }) => {
    const pct = nbCat > 0 ? Math.round(nbStock / nbCat * 100) : 0;
    const sel = _prSelectedSFs.has(codeSousFam);
    const dimmed = empList && nbStock === 0 && !_prSelectedSFs.has(codeSousFam) ? 'style="opacity:0.45"' : '';
    const csf = codeSousFam;
    return `<tr onclick="window._prToggleSF('${csf.replace(/'/g, "\\'")}')"
      class="border-b b-light hover:s-hover cursor-pointer text-[11px] ${sel ? 's-hover' : ''}" ${dimmed}>
      <td class="py-1.5 px-2 t-primary truncate max-w-[140px]" title="${escapeHtml(sf)}">
        <input type="checkbox" ${sel ? 'checked' : ''} style="pointer-events:none;margin-right:6px">
        ${escapeHtml(sf)}
      </td>
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
    const sel = _prSelectedMarques.has(m);
    return `<tr onclick="window._prToggleMarque('${m.replace(/\\/g,'\\\\').replace(/'/g,"\\'")}')"
      class="border-b b-light hover:s-hover cursor-pointer text-[11px] ${sel ? 's-hover' : ''}">
      <td class="py-1.5 px-2 t-primary truncate max-w-[140px]" title="${escapeHtml(m)}">
        <input type="checkbox" ${sel ? 'checked' : ''} style="pointer-events:none;margin-right:6px">
        ${escapeHtml(m)}
      </td>
      <td class="py-1.5 px-2 text-right font-semibold t-primary">${nbStock}</td>
      <td class="py-1.5 px-2 text-right t-secondary">${nbCat}</td>
      <td class="py-1.5 px-2">${_prCouvertureBar(pct)}</td>
    </tr>`;
  }).join('') || `<tr><td colspan="4" class="py-2 text-center t-disabled text-[11px]">Aucune marque détectée.</td></tr>`;

  const nbSel = _prSelectedSFs.size + _prSelectedMarques.size;
  const selBar = nbSel ? `<div class="mt-3 flex items-center gap-2">
    <button onclick="window._prApplyAnalyseFilter()"
      class="text-[11px] px-3 py-1.5 rounded-lg s-panel-inner t-inverse cursor-pointer">
      📊 Voir dans Mon Rayon (${nbSel} filtre${nbSel > 1 ? 's' : ''})
    </button>
    <button onclick="window._prClearAnalyseFilter()"
      class="text-[11px] px-2 py-1.5 t-disabled hover:t-primary">✕ Reset</button>
  </div>` : '';

  return `${empPillsAnalyse}${marquePills}<div class="grid grid-cols-2 gap-6">
    <div>
      <h4 class="text-[11px] font-bold t-primary mb-2">Sous-familles</h4>
      <div class="overflow-x-auto"><table class="w-full text-[11px]">${thSF}<tbody>${sfRows}</tbody></table></div>
    </div>
    <div>
      <h4 class="text-[11px] font-bold t-primary mb-2">Marques (top 15)</h4>
      <div class="overflow-x-auto"><table class="w-full text-[11px]">${thM}<tbody>${marqueRows}</tbody></table></div>
    </div>
  </div>${selBar}`;
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
    const abc  = document.getElementById('filterABC')?.value || '';
    const fmr  = document.getElementById('filterFMR')?.value || '';
    const stat = document.getElementById('filterStatut')?.value || '';
    const filteredMonRayon = (rayonData?.monRayon || []).filter(a => {
      if (_prEmpFilter) {
        const empList = _prEmpFilter.split(';').map(e => e.trim().toLowerCase()).filter(Boolean);
        if (!empList.some(e => (a.emplacement || '').toLowerCase().includes(e))) return false;
      }
      if (abc  && a.abcClass !== abc) return false;
      if (fmr  && a.fmrClass !== fmr) return false;
      if (stat && (a.statut  || '') !== stat) return false;
      return true;
    });
    // Filtres Analyse SF + Marque
    let filteredMonRayon2 = filteredMonRayon;
    if (_prSelectedSFs.size) {
      filteredMonRayon2 = filteredMonRayon2.filter(a =>
        _prSelectedSFs.has(_S.catalogueFamille?.get(a.code)?.codeSousFam || '')
      );
    }
    if (_prSelectedMarques.size) {
      filteredMonRayon2 = filteredMonRayon2.filter(a =>
        _prSelectedMarques.has(_S.catalogueMarques?.get(a.code) || '')
      );
    }
    const filteredMonRayonFinal = filteredMonRayon2;
    // Annoter sqClassif sans toucher à status
    for (const a of filteredMonRayonFinal) {
      a.sqClassif = sqClassif.get(a.code) || null;
    }
    const filtered = rayonData ? { ...rayonData, monRayon: filteredMonRayonFinal } : null;
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

  const cc = ACTION_BADGE[fam.classifGlobal] || ACTION_BADGE.potentiel;
  return `<div id="prDetailPanel" class="mt-4 rounded-xl p-3" style="background:${cc.cardBg};border:1px solid ${cc.cardBorder};box-shadow:0 2px 12px ${cc.cardBorder}">
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
    <div class="flex flex-wrap gap-0 mb-1 border-b b-light">
      ${tabs.map(t => `<button onclick="window._prSetTab('${t.key}')" data-prtab="${t.key}"
        class="text-[11px] px-4 py-2 cursor-pointer border-b-2 transition-colors ${_prDetailTab === t.key ? 'font-bold' : 'hover:t-primary'}"
        style="${_prDetailTab === t.key ? 'border-color:var(--c-action);color:var(--t-primary)' : 'border-color:transparent;color:var(--t-secondary)'}">${t.label}</button>`).join('')}
    </div>
    <div class="text-[9px] t-disabled px-4 pb-2">
      📊 Classif. famille : historique complet
      · Mon Rayon : ${_S._globalPeriodePreset || 'historique complet'}
      · Métiers : historique complet
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
    const _grad = b.gradient || 'linear-gradient(135deg,#334155,#1e293b)';
    const _opacity = active ? '1' : '0.78';
    const _shadow = active ? 'box-shadow:0 0 0 3px rgba(255,255,255,0.45),0 4px 12px rgba(0,0,0,0.3)' : 'box-shadow:0 2px 8px rgba(0,0,0,0.25)';
    return `<button onclick="window._prSetFilter('${key}')" data-prbadge="${key}"
      class="flex flex-col items-center p-3 cursor-pointer select-none"
      style="background:${_grad};border-radius:12px;opacity:${_opacity};${_shadow};transition:opacity .15s,transform .1s"
      onmouseover="this.style.opacity='0.92'" onmouseout="this.style.opacity='${_opacity}'">
      <span style="font-size:1.3rem;margin-bottom:6px;line-height:1">${b.icon}</span>
      <span style="font-size:1.75rem;font-weight:700;color:#fff;line-height:1.1;letter-spacing:-0.02em">${n}</span>
      <span style="font-size:10px;font-weight:600;color:rgba(255,255,255,0.82);margin-top:6px;letter-spacing:0.07em;text-transform:uppercase;text-align:center">${b.label}</span>
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
      <h3 class="font-extrabold text-sm t-primary">🦴 Plan de rayon stratégique — ${data.families.length} familles analysées</h3>
    </div>
    <div class="grid grid-cols-5 gap-2 mb-3">
      ${_badge('socle', totals.socle)}
      ${_badge('implanter', totals.implanter)}
      ${_badge('challenger', totals.challenger)}
      ${_badge('potentiel', totals.potentiel)}
      ${_badge('surveiller', totals.surveiller)}
    </div>
    <div class="relative mb-3">
      <input type="text" id="prSearchInput" placeholder="🔍 Famille, sous-famille, marque, code ou emplacement…"
        autocomplete="off"
        class="w-full px-3 py-2 text-[12px] rounded-lg border b-default s-card t-primary focus:border-[var(--c-action)] focus:outline-none">
      <div id="prSearchResults" class="hidden fixed s-card border rounded-xl shadow-xl max-h-[640px] overflow-y-auto z-[9999]"></div>
    </div>
    ${_prEmpFilter ? `<div class="flex items-center gap-2 mb-2"><span class="text-[11px] t-secondary">📍 ${escapeHtml(_prEmpFilter)}</span><button onclick="window._prSelectEmp('')" class="text-[10px] t-disabled hover:t-primary">✕</button></div>` : ''}
    ${legend}
  </div>
  <div id="prFamGrid" class="grid grid-cols-1 sm:grid-cols-2 gap-3">
    ${(_prFilterClassif || _prSearchText || _prOpenFam || _prEmpFilter)
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
  console.log('[PrSearch] Index total:', searchIndex.length,
    'dont level5:', searchIndex.filter(e => e.level === 5).length);
  if (!searchIndex.length && _S.catalogueFamille?.size) {
    // Catalogue présent mais index vide — retry après micro-délai
    setTimeout(() => {
      _prSearchIndex = null;
      _buildPrSearchIndex();
    }, 500);
  }

  const _posResults = () => {
    const r = input.getBoundingClientRect();
    results.style.left  = r.left + 'px';
    results.style.top   = (r.bottom + 4) + 'px';
    results.style.width = r.width + 'px';
  };

  let debounce;
  input.addEventListener('input', () => {
    clearTimeout(debounce);
    debounce = setTimeout(() => {
      const q = input.value.trim().toLowerCase();
      if (q.length < 2) { results.classList.add('hidden'); return; }
      if (!searchIndex.length) {
        // Tenter un rebuild tardif
        const retryIndex = _buildPrSearchIndex();
        if (!retryIndex.length) {
          results.innerHTML = '<div class="p-3 text-[11px] t-disabled">Catalogue non chargé — réessayez dans un instant</div>';
          _posResults();results.classList.remove('hidden');
          return;
        }
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
        const allMatches = searchIndex.filter(e => e.level <= 5 && e.searchText.includes(q));
        const empMatches = allMatches.filter(e => e.level === 5);
        const otherMatches = allMatches.filter(e => e.level < 5).sort((a, b) => a.level - b.level);
        const exactEmp = empMatches.filter(e => e.searchText === q);
        const partialEmp = empMatches.filter(e => e.searchText !== q);
        matches = [...exactEmp, ...otherMatches.slice(0, 10), ...partialEmp].slice(0, 15);
      }
      if (!matches.length) {
        results.innerHTML = '<div class="p-3 text-[11px] t-disabled">Aucune famille trouvée</div>';
        _posResults();results.classList.remove('hidden');
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
        } else if (e.level === 5) {
          label = `<span class="font-bold t-primary">📍 ${escapeHtml(e.emplacement)}</span>
                   <span class="t-disabled ml-2">${e.nbArticlesCat} articles</span>`;
        } else {
          label = `<span class="font-mono font-bold t-primary">${escapeHtml(e.code)}</span> <span class="t-primary ml-1">${escapeHtml((e.libelle || '').slice(0, 40))}</span> <span class="t-disabled ml-1">${escapeHtml(e.marque)}</span>`;
        }
        const refsLabel = e.level < 4 ? `<span class="t-disabled ml-2">${e.nbArticlesCat} réf.</span>` : '';
        const onclick = e.level === 5
          ? `window._prSelectEmp('${e.emplacement.replace(/'/g, "\\'")}')`
          : `window._prSelectFam('${safeCF}','${safeCSF}')`;
        return `<div class="px-3 py-2 hover:s-hover cursor-pointer border-b b-light text-[13px]"
          onclick="${onclick}">
          ${label}${e.level < 4 ? refsLabel : ''}
        </div>`;
      }).join('');
      _posResults();results.classList.remove('hidden');
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
  _prSqSort = 'reseau';
  _prMetierDist = 0;
  _prSelectedSFs.clear();
  _prSelectedEmps.clear();
  _prRerender();
  setTimeout(() => {
    const panel = document.getElementById('prDetailPanel');
    if (panel) panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, 50);
};

window._prSelectEmp = function(emp) {
  const results = document.getElementById('prSearchResults');
  if (results) results.classList.add('hidden');
  const input = document.getElementById('prSearchInput');
  if (input) input.value = '';
  _prEmpFilter = emp;
  _prRerender();
};

window._prCloseDetail = function() {
  _prOpenFam = null;
  _prMetierDist = 0;
  _prEmpFilter = '';
  _prSelectedSFs.clear();
  _prSelectedEmps.clear();
  _prRerender();
};

function _prRerenderDetail() {
  const el = document.getElementById('prDetailContent');
  if (!el || !_S._prData || !_prOpenFam) return;
  const fam = _S._prData.families.find(f => f.codeFam === _prOpenFam);
  if (fam) el.innerHTML = _prGetTabContent(_prDetailTab, fam);
}

window._prToggleEmp = function(emp) {
  const catFam = _S.catalogueFamille;
  if (_prSelectedEmps.has(emp)) {
    _prSelectedEmps.delete(emp);
    _prSelectedSFs.clear();
    if (_prSelectedEmps.size > 0) {
      for (const r of (_S._prRayonData?.monRayon || [])) {
        if (!_prSelectedEmps.has(r.emplacement || '')) continue;
        const csf = catFam?.get(r.code)?.codeSousFam || '';
        if (csf) _prSelectedSFs.add(csf);
      }
    }
  } else {
    _prSelectedEmps.add(emp);
    for (const r of (_S._prRayonData?.monRayon || [])) {
      if ((r.emplacement || '') !== emp) continue;
      const csf = catFam?.get(r.code)?.codeSousFam || '';
      if (csf) _prSelectedSFs.add(csf);
    }
  }
  _prRerenderDetail();
};

window._prClearEmps = function() {
  _prSelectedEmps.clear();
  _prSelectedSFs.clear();
  _prRerenderDetail();
};

window._prToggleSF = function(csf) {
  if (_prSelectedSFs.has(csf)) _prSelectedSFs.delete(csf);
  else _prSelectedSFs.add(csf);
  // Sync _prSelectedEmps depuis les SFs sélectionnées
  _prSelectedEmps.clear();
  if (_prSelectedSFs.size > 0) {
    const catFam = _S.catalogueFamille;
    for (const r of (_S._prRayonData?.monRayon || [])) {
      const rcsf = catFam?.get(r.code)?.codeSousFam || '';
      if (_prSelectedSFs.has(rcsf) && r.emplacement) _prSelectedEmps.add(r.emplacement);
    }
    _prOpenSousFam = '';
  }
  _prRerenderDetail();
};

window._prToggleMarque = function(marque) {
  if (_prSelectedMarques.has(marque)) _prSelectedMarques.delete(marque);
  else _prSelectedMarques.add(marque);
  // Sync _prSelectedEmps depuis les marques sélectionnées (comme _prToggleSF)
  _prSelectedEmps.clear();
  if (_prSelectedMarques.size > 0) {
    for (const r of (_S._prRayonData?.monRayon || [])) {
      const m = _S.catalogueMarques?.get(r.code) || '';
      if (_prSelectedMarques.has(m) && r.emplacement) _prSelectedEmps.add(r.emplacement);
    }
  }
  _prRerenderDetail();
};

window._prApplyAnalyseFilter = function() {
  _prDetailTab = 'rayon';
  const el = document.getElementById('prDetailContent');
  if (el && _S._prData && _prOpenFam) {
    const fam = _S._prData.families.find(f => f.codeFam === _prOpenFam);
    if (fam) el.innerHTML = _prGetTabContent('rayon', fam);
  }
};

window._prClearAnalyseFilter = function() {
  _prSelectedSFs.clear();
  _prSelectedMarques.clear();
  _prSelectedEmps.clear();
  _prOpenSousFam = '';
  _prRerenderDetail();
};

window._prSetTab = function(tab) {
  _prDetailTab = tab;
  document.querySelectorAll('[data-prtab]').forEach(btn => {
    const active = btn.dataset.prtab === tab;
    btn.className = `text-[11px] px-4 py-2 cursor-pointer border-b-2 transition-colors ${active ? 'font-bold' : 'hover:t-primary'}`;
    btn.style.borderColor = active ? 'var(--c-action)' : 'transparent';
    btn.style.color       = active ? 'var(--t-primary)' : 'var(--t-secondary)';
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
  _prSqSort = 'reseau';
  const fam = _S._prData?.families.find(f => f.codeFam === _prOpenFam);
  const el  = document.getElementById('prDetailContent');
  if (el && fam) el.innerHTML = _prRenderSquelette(fam);
};

window._prSqSortFn = function(key) {
  _prSqSort = key;
  const wrap = document.getElementById('prSqTable');
  if (!wrap || !_S._prSqArts) return;
  wrap.outerHTML = _prBuildSqTable(_S._prSqArts);
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
  const catFam = _S.catalogueFamille;
  const sqData = computeSquelette();

  // Calcul rayonData selon sélection sous-familles
  let rayonData;
  if (_prSelectedSFs.size === 0) {
    rayonData = _S._prRayonData || computeMonRayon(codeFam, _prOpenSousFam || '');
  } else if (_prSelectedSFs.size === 1) {
    rayonData = computeMonRayon(codeFam, [..._prSelectedSFs][0]);
  } else {
    rayonData = computeMonRayon(codeFam, '');
  }
  // Clone monRayon pour mutation sûre, puis filtre SF et/ou Marque si sélection active
  if (rayonData) {
    rayonData = { ...rayonData, monRayon: [...rayonData.monRayon] };
    if (_prSelectedSFs.size > 1) {
      rayonData.monRayon = rayonData.monRayon.filter(a => {
        const csf = catFam?.get(a.code)?.codeSousFam || '';
        return _prSelectedSFs.has(csf);
      });
    }
    if (_prSelectedMarques.size > 0) {
      rayonData.monRayon = rayonData.monRayon.filter(a =>
        _prSelectedMarques.has(_S.catalogueMarques?.get(a.code) || '')
      );
    }
  }

  // Label contexte : sous-famille si active
  let sousFamLib = '';
  if (_prOpenSousFam && catFam) {
    for (const [, f] of catFam) {
      if (f.codeFam === codeFam && f.codeSousFam === _prOpenSousFam) {
        sousFamLib = f.sousFam || _prOpenSousFam;
        break;
      }
    }
  }
  const sousFamFilter = _prOpenSousFam || '';
  const contexteLabel = sousFamFilter
    ? `${fam.libFam} (${codeFam}) › ${sousFamLib}`
    : `${fam.libFam} (${codeFam})`;

  // Emplacements connus pour cette famille / sous-famille
  const empsKnown = [...new Set(
    (_S.finalData || [])
      .filter(r => {
        const cf = catFam?.get(r.code)?.codeFam || _S.articleFamille?.[r.code];
        if (cf !== codeFam) return false;
        if (sousFamFilter) {
          const csf = catFam?.get(r.code)?.codeSousFam || '';
          if (csf !== sousFamFilter) return false;
        }
        return r.emplacement?.trim();
      })
      .map(r => r.emplacement.trim())
  )].sort();

  let txt = `╔══════════════════════════════════════════════╗\n`;
  txt += `  DIAGNOSTIC RAYON — ${fam.libFam.toUpperCase()}\n`;
  if (sousFamLib) txt += `  Sous-famille : ${sousFamLib}\n`;
  txt += `  Agence : ${agence}\n`;
  if (_prSelectedSFs.size > 0) {
    const sfNames = [..._prSelectedSFs].map(csf =>
      [...(catFam?.values() || [])].find(f => f.codeFam === codeFam && f.codeSousFam === csf)?.sousFam || csf
    );
    txt += `  Sous-familles sélectionnées : ${sfNames.join(', ')}\n`;
  }
  if (_prSelectedEmps.size > 0) {
    txt += `  Emplacements : ${[..._prSelectedEmps].sort().join(', ')}\n`;
  } else if (empsKnown.length) {
    txt += `  Emplacements : ${empsKnown.join(', ')}\n`;
  }
  txt += `╚══════════════════════════════════════════════╝\n\n`;
  txt += `[CONTEXTE PRISME — Diagnostic rayon à analyser]\n`;
  txt += `Tu es consultant rayon expert pour une agence Legallais (distributeur B2B quincaillerie pro).\n`;
  txt += `Agence : ${agence}. Famille analysée : ${contexteLabel}\n`;
  txt += `Action recommandée par PRISME : ${ACTION_BADGE[fam.classifGlobal]?.label || fam.classifGlobal}\n`;
  const isRayonVide = !rayonData || rayonData.monRayon.length === 0;
  const _sortCode = (a, b) => String(a.code).localeCompare(String(b.code));
  if (isRayonVide) txt += `Mode : RÉFÉRENCEMENT INITIAL (famille non exploitée)\n`;
  txt += '\n';

  // nbCat filtré sur SFs sélectionnées (déclaré ici pour être accessible dans CATALOGUE)
  let nbCatalogueFiltered = 0;
  if (_prSelectedSFs.size > 0 && _S.catalogueFamille) {
    for (const [, f] of _S.catalogueFamille) {
      if (f.codeFam !== codeFam) continue;
      if (!_prSelectedSFs.has(f.codeSousFam || '')) continue;
      nbCatalogueFiltered++;
    }
  }
  const nbCat = nbCatalogueFiltered > 0 ? nbCatalogueFiltered : (rayonData?.nbCatalogue ?? fam.nbCatalogue);

  if (isRayonVide) {
    txt += `═══ FAMILLE NON EXPLOITÉE ═══\n`;
    txt += `0 article en stock. Cette famille n'est pas encore référencée.\n`;
    txt += `Couverture catalogue : 0/${nbCat} références disponibles.\n\n`;
  } else {
    txt += `═══ MON RAYON AUJOURD'HUI ═══\n`;
    txt += `${rayonData.monRayon.length} articles en stock · `;
    txt += `${nbCat > 0 ? Math.round(rayonData.monRayon.length / nbCat * 100) : 0}% couverture`;
    txt += ` (${rayonData.monRayon.length}/${nbCat})`;
    if (_prSelectedSFs.size > 0) txt += ` sur les sous-familles sélectionnées`;
    const valeurFiltree = rayonData.monRayon.reduce((s, a) => s + (a.valeurStock || 0), 0);
    txt += ` · ${Math.round(valeurFiltree)}€ valeur stock\n\n`;

      const _minMax = (a) => {
      if (a.nouveauMax > 0) return { min: a.nouveauMin, max: a.nouveauMax, src: 'PRISME' };
      if (a.ancienMax  > 0) return { min: a.ancienMin,  max: a.ancienMax,  src: 'ERP'   };
      return null;
    };
    const _cmdLine = (a) => {
      const mm = _minMax(a);
      if (!mm) return ` → stock ${a.stockActuel ?? 0} (⚠️ aucun MAX configuré — paramétrer dans l'ERP)`;
      const qte = Math.max(0, mm.max - (a.stockActuel || 0));
      if (qte > 0)
        return ` → stock ${a.stockActuel ?? 0}, MAX ${mm.src} ${mm.max} → Commander ${qte} unité${qte > 1 ? 's' : ''}`;
      return ` → stock ${a.stockActuel ?? 0}, MAX ${mm.src} ${mm.max} → Stock OK`;
    };

    const _sfOf = (a) => catFam?.get(a.code)?.sousFam || '—';
    const _mqOf = (a) => _S.catalogueMarques?.get(a.code) || a.marque || '—';
    const _sortSF = (a, b) => {
      const sa = _sfOf(a), sb = _sfOf(b);
      if (sa !== sb) return sa.localeCompare(sb);
      const ma = _mqOf(a), mb = _mqOf(b);
      if (ma !== mb) return ma.localeCompare(mb);
      return String(a.code).localeCompare(String(b.code));
    };
    const _printBySF = (arr, fmt) => {
      let curSF = null, curMQ = null;
      arr.forEach(a => {
        const sf = _sfOf(a);
        const mq = _mqOf(a);
        if (sf !== curSF) { txt += `  ▸ ${sf}\n`; curSF = sf; curMQ = null; }
        if (mq !== curMQ) { txt += `     · ${mq}\n`; curMQ = mq; }
        txt += `        ${fmt(a)}\n`;
      });
    };

    // Socle inclut : articles sqClassif=socle + pépites (même hors socle réseau, marquées ⭐)
    const socles           = rayonData.monRayon.filter(a => a.sqClassif === 'socle' || a.status === 'pepite').sort(_sortSF);
    const challengers      = rayonData.monRayon.filter(a => (a.status === 'challenger' || a.sqClassif === 'challenger') && a.sqClassif !== 'socle').sort(_sortSF);
    // Dormants À VIRER = dormants qui NE sont PAS dans le socle réseau
    const dormantsHorsSocle = rayonData.monRayon.filter(a => a.status === 'dormant' && a.sqClassif !== 'socle').sort(_sortSF);

    // Format MIN/MAX compact : PRISME > ERP > médiane réseau
    const _mm = (a) => {
      const m = _minMax(a);
      if (m) return `MIN ${m.min}/MAX ${m.max} (${m.src})`;
      const mn = a.medMinReseau, mx = a.medMaxReseau;
      if (mn != null && mx != null) return `MIN ${Math.round(mn)}/MAX ${Math.round(mx)} (méd. réseau)`;
      if (mx != null) return `MAX ${Math.round(mx)} (méd. réseau)`;
      return 'MIN/MAX à paramétrer';
    };
    // Format quantité à commander compact : "cmd N" ou "OK"
    const _cmd = (a) => {
      const m = _minMax(a);
      if (!m) return '⚠ pas de MAX';
      const q = Math.max(0, m.max - (a.stockActuel || 0));
      return q > 0 ? `cmd ${q}` : 'OK';
    };

    // Marqueurs : ⭐ pépite, ⚠ rupture
    const _mk = (a) => {
      const s = (a.status === 'pepite' ? '⭐' : '') + (a.status === 'rupture' ? '⚠' : '');
      return s ? s + ' ' : '';
    };

    if (socles.length) {
      txt += `🟢 SOCLE RÉSEAU (⭐ = pépite AF · ⚠ = rupture à réappro d'urgence) :\n`;
      _printBySF(socles, a => {
        const tag = a.status === 'dormant' ? ' 💤 Dormant chez moi' : '';
        return `☐ ${_mk(a)}[${a.code}] ${a.libelle} — ${_mm(a)}${tag}`;
      });
      txt += '\n';
    }
    if (challengers.length) {
      txt += `🔶 CHALLENGERS (⚠ = rupture) :\n`;
      _printBySF(challengers, a => `☐ ${_mk(a)}[${a.code}] ${a.libelle} — ${_mm(a)}`);
      txt += '\n';
    }
    if (dormantsHorsSocle.length) {
      txt += `🗑 DORMANTS À VIRER :\n`;
      _printBySF(dormantsHorsSocle, a => `☐ [${a.code}] ${a.libelle} — ${_mm(a)}`);
      txt += '\n';
    }
    // CATCH-ALL : tout article en rayon non encore listé (standards + ruptures sans classif)
    const seen = new Set([
      ...socles, ...challengers, ...dormantsHorsSocle
    ].map(a => a.code));
    const autres = rayonData.monRayon.filter(a => !seen.has(a.code)).sort(_sortSF);
    if (autres.length) {
      txt += `⚪ AUTRES EN RAYON (standards sans classification réseau · ⚠ = rupture) :\n`;
      _printBySF(autres, a => `☐ ${_mk(a)}[${a.code}] ${a.libelle} — ${_mm(a)}`);
      txt += '\n';
    }
  }

  // Totaux Squelette filtrés sur sous-famille et/ou _prSelectedSFs si actifs
  let sqTotals = {
    socle: fam.socle, implanter: fam.implanter,
    challenger: fam.challenger, potentiel: fam.potentiel, surveiller: fam.surveiller
  };
  if ((_prOpenSousFam || _prSelectedSFs.size > 0) && sqData) {
    sqTotals = { socle:0, implanter:0, challenger:0, potentiel:0, surveiller:0 };
    for (const d of sqData.directions) {
      for (const g of ['socle','implanter','challenger','potentiel','surveiller']) {
        for (const a of (d[g] || [])) {
          const cf = catFam?.get(a.code);
          if (cf?.codeFam !== codeFam) continue;
          if (_prOpenSousFam && cf?.codeSousFam !== _prOpenSousFam) continue;
          if (_prSelectedSFs.size > 0 && !_prSelectedSFs.has(cf?.codeSousFam || '')) continue;
          sqTotals[g]++;
        }
      }
    }
  }

  txt += `═══ SQUELETTE RÉSEAU (4 sources croisées) ═══\n`;
  txt += `🟢 Socle : ${sqTotals.socle} articles · 🔵 À implanter : ${sqTotals.implanter} · 🔴 Challenger : ${sqTotals.challenger} · 🟡 Potentiel : ${sqTotals.potentiel} · 👁 Surveiller : ${sqTotals.surveiller}\n`;
  txt += `Sources actives : ${[fam.srcReseau?'Réseau':'',fam.srcChalandise?'Chalandise':'',fam.srcHorsZone?'Hors-zone':'',fam.srcLivraisons?'Livraisons':''].filter(Boolean).join(', ')}\n\n`;

  if (sqData) {
    // Codes déjà présents au rayon (y compris ruptures) — à exclure de "à implanter"
    const codesInRayon = new Set((rayonData?.monRayon || []).map(a => a.code));
    const toImpl = [];
    for (const d of sqData.directions) {
      for (const a of (d.implanter || [])) {
        if (codesInRayon.has(a.code)) continue;
        const cf = catFam?.get(a.code)?.codeFam || _S.articleFamille?.[a.code];
        if (cf !== codeFam) continue;
        if (sousFamFilter) {
          const csf = catFam?.get(a.code)?.codeSousFam || '';
          if (csf !== sousFamFilter) continue;
        }
        if (_prSelectedSFs.size > 0) {
          const csf = catFam?.get(a.code)?.codeSousFam || '';
          if (!_prSelectedSFs.has(csf)) continue;
        }
        if (!toImpl.some(x => x.code === a.code)) toImpl.push(a);
      }
    }
    // Tri par sous-famille → marque → code
    const _sfOfImpl = (a) => catFam?.get(a.code)?.sousFam || '—';
    const _mqOfImpl = (a) => _S.catalogueMarques?.get(a.code) || a.marque || '—';
    toImpl.sort((a, b) => {
      const sa = _sfOfImpl(a), sb = _sfOfImpl(b);
      if (sa !== sb) return sa.localeCompare(sb);
      const ma = _mqOfImpl(a), mb = _mqOfImpl(b);
      if (ma !== mb) return ma.localeCompare(mb);
      return String(a.code).localeCompare(String(b.code));
    });
    if (toImpl.length) {
      // Lookup MIN/MAX médiane réseau depuis finalData si dispo
      const fdByCode = new Map();
      for (const r of (_S.finalData || [])) fdByCode.set(r.code, r);
      const _mmLine = (a) => {
        const fd = fdByCode.get(a.code);
        const mn = fd?.medMinReseau, mx = fd?.medMaxReseau;
        if (mn != null && mx != null) return `MIN ${Math.round(mn)}/MAX ${Math.round(mx)} (méd. réseau)`;
        if (mx != null) return `MAX ${Math.round(mx)} (méd. réseau)`;
        return `MIN/MAX à paramétrer`;
      };

      txt += `═══ À IMPLANTER ═══\n`;
      txt += `Articles absents du rayon, signal réseau fort — à cocher pour référencement :\n`;
      const list = isRayonVide ? toImpl : toImpl.slice(0, 15);
      let curSF = null, curMQ = null;
      list.forEach(a => {
        const sf = _sfOfImpl(a);
        const mq = _mqOfImpl(a);
        if (sf !== curSF) { txt += `  ▸ ${sf}\n`; curSF = sf; curMQ = null; }
        if (mq !== curMQ) { txt += `     · ${mq}\n`; curMQ = mq; }
        txt += `        ☐ [${a.code}] ${a.libelle} — ${_mmLine(a)}\n`;
      });
      if (!isRayonVide && toImpl.length > 15) txt += `  ... et ${toImpl.length - 15} autres\n`;
      txt += '\n';
    }
  }

  txt += `═══ CATALOGUE ═══\n`;
  if (_prSelectedSFs.size > 0) {
    txt += `${nbCat} références dans les sous-familles sélectionnées\n`;
    for (const csf of _prSelectedSFs) {
      const sfName = [...(catFam?.values() || [])].find(f => f.codeFam === codeFam && f.codeSousFam === csf)?.sousFam || csf;
      let cnt = 0;
      for (const [, f] of (catFam || new Map()))
        if (f.codeFam === codeFam && f.codeSousFam === csf) cnt++;
      txt += `  · ${sfName} : ${cnt} réf.\n`;
    }
  } else {
    txt += `${fam.nbCatalogue} références disponibles chez Legallais dans cette famille (couverture actuelle ${fam.couverture}%)\n`;
    const sfCount = new Map();
    if (catFam) for (const [, f] of catFam) {
      if (f.codeFam === codeFam && f.sousFam) sfCount.set(f.sousFam, (sfCount.get(f.sousFam) || 0) + 1);
    }
    if (sfCount.size) {
      txt += `Sous-familles : ${[...sfCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([sf, n]) => `${sf} (${n})`).join(', ')}\n`;
    }
    const marCount = new Map();
    if (_S.marqueArticles) for (const [m, codes] of _S.marqueArticles) {
      let cnt = 0;
      for (const c of codes) if (catFam?.get(c)?.codeFam === codeFam) cnt++;
      if (cnt > 0) marCount.set(m, cnt);
    }
    if (marCount.size) {
      txt += `Marques principales : ${[...marCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([m, n]) => `${m} (${n} réf)`).join(', ')}\n`;
    }
  }
  txt += '\n';

  if (_S.chalandiseReady && _S.chalandiseData?.size) {
    txt += `═══ MÉTIERS CLIENTS (chalandise) ═══\n`;
    const metierCA = new Map();
    const metierCli = new Map();
    for (const [cc, artMap] of (_S.ventesClientArticleFull || _S.ventesClientArticle || new Map())) {
      const metier = _S.chalandiseData?.get(cc)?.metier || 'Hors chalandise';
      let caFam = 0;
      for (const [code, data] of artMap) {
        const cf = catFam?.get(code);
        if (cf?.codeFam !== codeFam) continue;
        if (_prSelectedSFs.size > 0 && !_prSelectedSFs.has(cf.codeSousFam || '')) continue;
        caFam += data.sumCA || 0;
      }
      if (caFam > 0) {
        metierCA.set(metier, (metierCA.get(metier) || 0) + caFam);
        metierCli.set(metier, (metierCli.get(metier) || 0) + 1);
      }
    }
    [...metierCA.entries()].sort((a,b)=>b[1]-a[1]).slice(0,6).forEach(([m,ca]) => {
      txt += `  • ${m} : ${metierCli.get(m)} clients, ${Math.round(ca)}€ CA famille\n`;
    });
    txt += '\n';
  }

  txt += `═══ INSTRUCTION ═══\n`;
  txt += `Tu es merchandiseur expert rayon quincaillerie pro (Legallais B2B). Toutes les données ci-dessus sont exploitables — utilise-les toutes.\n`;
  txt += `Réponds en français, style synthétique. Pas d'intro, pas de conclusion, pas de définitions.\n`;
  txt += `ORDRE ABSOLU des blocs (ne JAMAIS dévier) : 1) À implanter → 2) Socle → 3) Challengers → 4) Finition. Marqueurs in-line : ⭐=pépite AF · ⚠=rupture à réappro · 💤=dormant chez moi.\n`;
  txt += `TRI INTERNE ABSOLU : dans chaque bloc, groupe par SOUS-FAMILLE (▸) puis par MARQUE (·) puis par code croissant. Conserve ces en-têtes de groupe dans ta sortie — c'est pour que l'utilisateur retrouve les articles devant son rayon.\n\n`;

  txt += `─── 0. RAYON EN UN COUP D'ŒIL ───\n`;
  txt += `En-tête obligatoire : rappelle la FAMILLE (nom + code), les SOUS-FAMILLES concernées, et les EMPLACEMENTS IMPACTÉS (depuis le bloc DIAGNOSTIC RAYON en haut du prompt).\n`;
  txt += `Puis 1 phrase : nb articles en stock, % couverture catalogue, valeur stock, signal global (développer / consolider / désengager).\n`;
  txt += `Cite les 2-3 métiers clients dominants (section MÉTIERS CLIENTS) et ce que ça implique pour le rayon.\n\n`;

  txt += `─── 1. À IMPLANTER — articles à référencer ───\n`;
  txt += `Utilise la section "À IMPLANTER". Conserve la structure à cocher groupée par sous-famille puis marque. Format exact par ligne : ☐ [CODE] Libellé — MIN/MAX réseau. Ces articles entrent en rayon AVANT tout arbitrage socle/challenger. NE répète PAS la famille ni les emplacements (déjà en bloc 0).\n\n`;

  txt += `─── 2. SOCLE — maintenir absolument ───\n`;
  txt += `Utilise la section "SOCLE RÉSEAU". Conserve TOUS les marqueurs in-line : ⭐ (pépite AF), ⚠ (rupture), 💤 (dormant chez moi).\n`;
  txt += `⚠️ RÈGLES ABSOLUES :\n`;
  txt += `  - ⭐ pépite AF : ne doit JAMAIS sortir du rayon, priorité réappro absolue.\n`;
  txt += `  - ⚠ rupture : réappro immédiate (signaler en priorité dans le bloc).\n`;
  txt += `  - 💤 dormant chez moi : NE DOIT JAMAIS être proposé à la suppression. Socle réseau temporairement silencieux → à conserver et surveiller.\n\n`;

  txt += `─── 3. CHALLENGERS — arbitrage si place limitée ───\n`;
  txt += `Utilise les sections "CHALLENGERS" ET "AUTRES EN RAYON" (même traitement : en stock sans justification réseau). Conserve les marqueurs ⚠ (rupture). Ne les garder que s'il reste de la place au rayon APRÈS à implanter + socle. Sinon, proposer leur sortie et les basculer en bloc 4 (à virer). Les articles ⚠ en rupture méritent une décision explicite : réappro ou sortie.\n\n`;

  txt += `─── 4. FINITION — à virer & ajustements catalogue ───\n`;
  txt += `À VIRER : utilise UNIQUEMENT la section "DORMANTS À VIRER" (déjà filtrée : hors socle réseau). Format : [CODE] Libellé — stock N, valeur Xe libérable. Ajoute les challengers sans justification si place nécessaire. Calcule la valeur totale libérable.\n`;
  txt += `🚫 INTERDICTION ABSOLUE : ne JAMAIS proposer de virer un article du bloc SOCLE, même marqué 💤 DORMANT CHEZ MOI.\n`;
  txt += `INSIGHTS CATALOGUE & MARQUES : quelle sous-famille est sur- ou sous-représentée ? Marque trop concentrée ou absente ? 1-2 ajustements précis.\n\n`;

  txt += `RÈGLE W : W = ventes hebdo moyennes sur la période analysée. W élevé + stock=0 = urgence maximale.\n`;

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
  _prEmpFilter = '';

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
