'use strict';
import { _S } from './state.js';
import { formatEuro, escapeHtml, _copyCodeBtn, famLib } from './utils.js';
import { computeSquelette, computeMonRayon } from './engine.js';
import { FAMILLE_LOOKUP, metierToSegments } from './constants.js';
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
let _prSqPage        = 50;     // nb articles affichés dans le Squelette
let _prSqSort        = 'reseau'; // 'agence'|'reseau'|'livraison'|'classif'
let _prMetierDist    = 0;    // 0 = Tous, sinon filtre km
const _prDistOk = (cc) => {
  if (!_prMetierDist) return true;
  const info = _S.chalandiseData?.get(cc);
  if (!info || info.distanceKm == null) return true;
  if (info.distanceKm <= _prMetierDist) return true;
  // Client PDV actif → vient déjà au comptoir, distance irrelevante
  return _S.clientsMagasin?.has(cc) || false;
};
// Plage de mois Livraisons pour alignement captation (monthIdx = year*12+month)
const _prLivMonthRange = () => {
  const dMin = _S.livraisonsDateMin, dMax = _S.livraisonsDateMax;
  if (!dMin || !dMax) return null;
  return { min: dMin.getFullYear() * 12 + dMin.getMonth(), max: dMax.getFullYear() * 12 + dMax.getMonth() };
};
// CA agence par client×article filtré sur la période Livraisons (via byMonthFull)
// Retourne sumCA sur les mois couverts par Livraisons ; fallback: ventesClientArticleFull.sumCA
const _prClientArtCA = (cc, code, range) => {
  if (range && _S._byMonthFull?.[cc]?.[code]) {
    const months = _S._byMonthFull[cc][code];
    let ca = 0;
    for (const midx in months) {
      if (+midx >= range.min && +midx <= range.max) ca += months[midx].sumCA;
    }
    return ca;
  }
  // Fallback: données agrégées pleine période
  const full = (_S.ventesClientArticleFull || _S.ventesClientArticle);
  return full?.get(cc)?.get(code)?.sumCA || 0;
};
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
  specialiser:   { label: 'À spécialiser',   gradient: 'linear-gradient(135deg,#0d9488,#0f766e)', bg: '#ccfbf1', color: '#115e59', icon: '🎯', dot: '#2dd4bf', cardBg: 'rgba(45,212,191,0.04)',  cardBorder: 'rgba(45,212,191,0.22)' },
};

const CLASSIF_BADGE = {
  socle:      { label: 'Socle',      bg: 'rgba(34,197,94,0.2)',   color: '#22c55e',           icon: '🟢' },
  implanter:  { label: 'Implanter',  bg: 'rgba(59,130,246,0.2)',  color: '#3b82f6',           icon: '🔵' },
  challenger: { label: 'Challenger', bg: 'rgba(239,68,68,0.2)',   color: '#ef4444',           icon: '🔴' },
  potentiel:  { label: 'Potentiel',  bg: 'rgba(245,158,11,0.2)',  color: '#f59e0b',           icon: '🟡' },
  surveiller: { label: 'Surveiller', bg: 'rgba(148,163,184,0.2)', color: 'var(--t-secondary)', icon: '👁'  },
};

// ── Vocation contexte agence ─────────────────────────────────────────
// Calcule la distribution segments cible des clients de l'agence pondérée
// par CA (MAGASIN + hors-MAGASIN). Cache simple invariant tant que les
// données chalandise/ventes ne changent pas.
let _prAgenceCtxCache = null;
let _prAgenceCtxStore = null;
function _prAgenceVocationCtx() {
  const currentStore = _S.selectedMyStore || '';
  if (_prAgenceCtxCache && _prAgenceCtxStore === currentStore) return _prAgenceCtxCache;
  _prAgenceCtxStore = currentStore;
  const cd = _S.chalandiseData;
  const vca = _S.ventesClientArticleFull?.size ? _S.ventesClientArticleFull : _S.ventesClientArticle;
  const vcm = _S.ventesClientHorsMagasin;
  const metierCA = new Map();   // metier → CA total
  const segCA = { chantier: 0, erp: 0, deco: 0, source: 0 };
  if (cd && (vca || vcm)) {
    const _addCA = (cc, ca) => {
      const info = cd.get(cc);
      const metier = info?.metier || 'inconnu';
      metierCA.set(metier, (metierCA.get(metier) || 0) + ca);
    };
    if (vca) for (const [cc, artMap] of vca) {
      let ca = 0;
      for (const v of artMap.values()) ca += (v.sumCA || v.sumCAAll || 0);
      if (ca > 0) _addCA(cc, ca);
    }
    if (vcm) for (const [cc, artMap] of vcm) {
      let ca = 0;
      for (const v of artMap.values()) ca += (v.sumCA || 0);
      if (ca > 0) _addCA(cc, ca);
    }
    for (const [metier, ca] of metierCA) {
      const segs = metierToSegments(metier);
      if (segs.length === 0) continue;
      const part = ca / segs.length;
      for (const s of segs) segCA[s] += part;
    }
  }
  const total = segCA.chantier + segCA.erp + segCA.deco + segCA.source;
  let dominant = 'deco', best = -1;
  for (const k of Object.keys(segCA)) if (segCA[k] > best) { best = segCA[k]; dominant = k; }
  // TOP 5 métiers triés CA desc
  const topMetiers = [...metierCA.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([m, ca]) => ({ metier: m, ca, segments: metierToSegments(m) }));
  _prAgenceCtxCache = {
    dominantSegment: dominant,
    distribution: segCA,
    share: total > 0 ? best / total : 0,
    topMetiers,
    totalCA: total,
  };
  return _prAgenceCtxCache;
}
export function _prInvalidateAgenceCtx() { _prAgenceCtxCache = null; }

// ── computePlanStock ─────────────────────────────────────────────────
let _prPlanCache = null;
let _prPlanCacheKey = '';
function computePlanStock() {
  // Filtres structurels uniquement — PAS l'emplacement ni l'âge
  const fam_f  = (document.getElementById('filterFamille')?.value || '').trim().toLowerCase();
  const abc_f  = document.getElementById('filterABC')?.value || '';
  const fmr_f  = document.getElementById('filterFMR')?.value || '';
  const stat_f = document.getElementById('filterStatut')?.value || '';

  const _cacheKey = `${fam_f}|${abc_f}|${fmr_f}|${stat_f}|${_S.finalData?.length||0}|${_S.selectedMyStore||''}|${_S.storesIntersection?.size||0}|${_S.ventesClientArticle?.size||0}`;
  if (_prPlanCacheKey === _cacheKey && _prPlanCache) return _prPlanCache;

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
      caAgence: 0, caReseau: 0, nbRefsReseau: 0, rendement: null,
      nbClients: 0,
      nbCatalogue: catCount.get(codeFam) || 0,
      nbEnRayon: 0, couverture: 0, classifGlobal: 'potentiel',
      nbDormants: 0, nbRuptures: 0, nbFin: 0, hygieneScore: 0, needsCleaning: false,
      // Schizophrénie : refs dans socle/réseau ET pathologiques en agence
      _incCodes: new Set(),
      schizoItems: [], nbSchizo: 0,
    });
    return famMap.get(codeFam);
  };

  // Lookup libellé robuste
  const _libOf = (code) => _S.libelleLookup?.[code] || _S.finalData?.find(r => r.code === code)?.libelle || '';

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
          if (a.sources?.has('pdvClients')) f.srcPdvClients = true;
          if (inFilter) {
            f.caAgence += a.caAgence || 0;
            if ((a.caReseau || 0) > 0) { f.caReseau += a.caReseau; f.nbRefsReseau++; }
            if (a.enStock) f.nbEnRayon++;
          }
          if (g === 'socle' || g === 'implanter') {
            f._incCodes.add(a.code);
          }
        }
      }
    }
  }

  // nbClients : MAGASIN + hors-MAGASIN (livraison, DCS, web…) — un rayon vendu en livraison compte
  const seenClientsByFam = new Map(); // codeFam → Set<cc>
  const _addClient = (cc, code) => {
    if (!filteredCodes.has(code)) return;
    const fi = getFamInfo(code);
    if (!fi) return;
    if (!seenClientsByFam.has(fi.codeFam)) seenClientsByFam.set(fi.codeFam, new Set());
    seenClientsByFam.get(fi.codeFam).add(cc);
  };
  const vcaFull = _S.ventesClientArticleFull?.size ? _S.ventesClientArticleFull : _S.ventesClientArticle;
  if (vcaFull) for (const [cc, artMap] of vcaFull) for (const code of artMap.keys()) _addClient(cc, code);
  if (_S.ventesClientHorsMagasin) for (const [cc, artMap] of _S.ventesClientHorsMagasin) for (const code of artMap.keys()) _addClient(cc, code);
  for (const [codeFam, clientsSet] of seenClientsByFam) {
    const f = famMap.get(codeFam);
    if (f) f.nbClients = clientsSet.size;
  }

  // Compteurs hygiène par famille depuis finalData (dormants/ruptures/fin)
  const DORMANT_DAYS = 180;
  for (const r of (_S.finalData || [])) {
    const fi = getFamInfo(r.code);
    if (!fi) continue;
    const f = famMap.get(fi.codeFam);
    if (!f) continue;
    const statut = (r.statut || '').toLowerCase();
    const isFin = statut.includes('fin de');
    const isDormant = r.stockActuel > 0 && (r.ageJours || 0) > DORMANT_DAYS && !isFin;
    if (isFin) f.nbFin++;
    if (isDormant) f.nbDormants++;
    if (r.stockActuel === 0 && !isFin && (r.enleveTotal || 0) > 0) f.nbRuptures++;
    // Schizophrénie : ref incontournable réseau MAIS pathologique chez nous
    // = signal "rayon échantillonné" / commande à la demande, divorce de confiance
    const isPatho = isFin || isDormant || (r.stockActuel === 0 && (r.enleveTotal || 0) > 0);
    if (isPatho && f._incCodes.has(r.code)) {
      f.schizoItems.push({
        code: r.code, libelle: r.libelle || '',
        statut: isFin ? 'fin' : isDormant ? 'dormant' : 'rupture',
        ageJours: r.ageJours || 0,
        valeur: r.stockActuel * (r.prixUnitaire || 0),
      });
    }
  }
  // Finaliser nbSchizo et nettoyer _incCodes (gros volume)
  for (const [, f] of famMap) {
    f.nbSchizo = f.schizoItems.length;
    delete f._incCodes;
  }
  // Contexte agence (segments cible des clients)
  const agenceCtx = _prAgenceVocationCtx();
  const nbOtherStores = Math.max(1, ((_S.storesIntersection?.size || 1) - 1));
  for (const [, f] of famMap) {
    f.couverture = f.nbCatalogue > 0 ? Math.round(f.nbEnRayon / f.nbCatalogue * 100) : 0;
    // Score hygiène : % de refs pathologiques (dormants + fin + ruptures) dans le rayon actuel
    const nbPatho = f.nbDormants + f.nbFin + f.nbRuptures;
    f.hygieneScore = f.nbEnRayon > 0 ? Math.round(nbPatho / Math.max(f.nbEnRayon, nbPatho) * 100) : 0;
    f.needsCleaning = f.hygieneScore >= 30;
    // Rendement : CA/ref agence comparé au CA/ref moyen du réseau (base 100)
    if (f.nbEnRayon > 0 && f.nbRefsReseau > 0 && f.caReseau > 0) {
      const caAgPerRef = f.caAgence / f.nbEnRayon;
      const caResPerRefPerStore = (f.caReseau / nbOtherStores) / f.nbRefsReseau;
      f.rendement = caResPerRefPerStore > 0 ? Math.round(caAgPerRef / caResPerRefPerStore * 100) : null;
    }
    // Vocation : segment dominant des incontournables vs sortir
    const total = f.socle + f.implanter + f.challenger + f.potentiel + f.surveiller;
    const rSocle      = total > 0 ? f.socle      / total : 0;
    const rChallenger = total > 0 ? f.challenger  / total : 0;
    const rSurveiller = total > 0 ? f.surveiller  / total : 0;
    const nbSrc = (f.srcReseau?1:0) + (f.srcChalandise?1:0) + (f.srcHorsZone?1:0) + (f.srcLivraisons?1:0);
    // Garde-fou petites familles : trop peu de signal pour conclure "à développer"
    const isSmall = f.nbCatalogue < 5;

    // À spécialiser : rayon trop large (rendement < réseau)
    if (!isSmall && f.nbEnRayon >= 20 && f.rendement !== null && f.rendement < 65)
      f.classifGlobal = 'specialiser';
    else if (!isSmall && f.implanter >= 5 && f.challenger >= 3)
      f.classifGlobal = 'implanter';
    else if (!isSmall && f.implanter >= 4 && total > 0 && (f.implanter + f.potentiel) / total > 0.4)
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
    // Rayon endormi : beaucoup de refs en stock sans signal → à retravailler
    else if (rSurveiller >= 0.4 && f.surveiller >= 5 && f.surveiller > f.socle)
      f.classifGlobal = 'challenger';
    else if (f.implanter >= 1 || f.potentiel >= 3)
      f.classifGlobal = 'potentiel';
    else
      f.classifGlobal = 'surveiller';
  }

  const families = [...famMap.values()]
    .filter(f => f.socle + f.implanter + f.challenger + f.potentiel + f.surveiller > 0)
    .sort((a, b) => (b.implanter + b.challenger) - (a.implanter + a.challenger));

  const result = {
    families,
    totals: {
      socle:      families.filter(f => f.classifGlobal === 'socle').length,
      implanter:  families.filter(f => f.classifGlobal === 'implanter').length,
      challenger: families.filter(f => f.classifGlobal === 'challenger').length,
      potentiel:  families.filter(f => f.classifGlobal === 'potentiel').length,
      surveiller: families.filter(f => f.classifGlobal === 'surveiller').length,
      specialiser:   families.filter(f => f.classifGlobal === 'specialiser').length,
    }
  };
  _prPlanCache = result;
  _prPlanCacheKey = _cacheKey;
  return result;
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
    ${seg(has('pdvClients'), '#ec4899', 'Clients PDV')}
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
    const srcObj = { reseau: f.srcReseau, chalandise: f.srcChalandise, horsZone: f.srcHorsZone, livraisons: f.srcLivraisons, pdvClients: f.srcPdvClients };
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
      ${f.needsCleaning ? `<div class="text-[9px] font-bold mb-1" style="color:#f59e0b" title="${f.nbDormants} dormants · ${f.nbFin} fin série/stock · ${f.nbRuptures} ruptures (${f.hygieneScore}%)">🧹 À nettoyer avant expansion (${f.hygieneScore}%)</div>` : ''}
      ${f.nbSchizo >= 2 ? `<div class="text-[9px] font-bold mb-1" style="color:#a855f7" title="Refs identifiées comme incontournables réseau MAIS dormantes/ruptures chez toi — signal 'rayon échantillonné', commande à la demande sans stock fiable, divorce de confiance">🌀 ${f.nbSchizo} refs schizo (échantillonné)</div>` : ''}
      ${miniBar}
      <div class="flex items-center justify-between text-[10px]">
        <span class="t-secondary">${total} articles · ${f.nbClients} clients</span>
        <span class="font-bold" style="color:${covColor}">${f.couverture}% couv.</span>
      </div>
      <div class="flex items-center justify-between text-[10px] mt-0.5">
        <span class="t-secondary">Rendement réseau</span>
        ${f.rendement != null
          ? `<span class="font-bold" style="color:${f.rendement >= 130 ? '#22c55e' : f.rendement >= 70 ? '#94a3b8' : '#ef4444'}" title="CA/ref vs médiane réseau (base 100)">${f.rendement}</span>`
          : `<span class="t-disabled">—</span>`}
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
  const page = _S._prPageRayon || 99999;
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
  let displayed = _prRayonFilter
    ? afterEmp.filter(a => a.status === _prRayonFilter)
    : afterEmp;
  if (_S._prMRSortByCode) {
    displayed = [...displayed].sort((a, b) => String(a.code).localeCompare(String(b.code)));
  }
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
      <td class="py-1.5 px-2 font-mono" style="color:var(--t-primary)">${a.code}</td>
      <td class="py-1.5 px-2 max-w-[160px] truncate" style="color:var(--t-primary)" title="${escapeHtml(lib)}">${escapeHtml(lib)}</td>
      <td class="py-1.5 px-2 text-[10px]" style="color:var(--t-secondary)">${escapeHtml(a.sousFam || '')}</td>
      <td class="py-1.5 px-2 text-right" style="color:var(--t-primary)">${a.stockActuel}</td>
      <td class="py-1.5 px-2 text-right" style="color:var(--t-secondary)">${a.W || 0}</td>
      <td class="py-1.5 px-2 text-center">
        <span style="font-size:9px;padding:2px 6px;border-radius:4px;font-weight:600;background:${sBg};color:${sC}">${sL}</span>
      </td>
      <td class="py-1.5 px-2 text-center">${sqBadge}</td>
      <td class="py-1.5 px-2 text-[10px]" style="color:var(--t-secondary)" title="${escapeHtml(a.statut || '')}">${escapeHtml(a.statut || '')}</td>
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
        <th class="py-1.5 px-2 text-left cursor-pointer hover:t-primary" style="color:var(--t-secondary);font-weight:500" onclick="window._prToggleMRSortCode()" title="Trier par code">Code${_S._prMRSortByCode ? ' ▲' : ' ⇅'}</th><th class="py-1.5 px-2 text-left" style="color:var(--t-secondary);font-weight:500">Libellé</th>
        <th class="py-1.5 px-2 text-left" style="color:var(--t-secondary);font-weight:500">Sous-fam.</th><th class="py-1.5 px-2 text-right" style="color:var(--t-secondary);font-weight:500">Stock</th>
        <th class="py-1.5 px-2 text-right" style="color:var(--t-secondary);font-weight:500">W</th><th class="py-1.5 px-2 text-left" style="color:var(--t-secondary);font-weight:500">Mon Rayon</th>
        <th class="py-1.5 px-2 text-left" style="color:var(--t-secondary);font-weight:500">Squelette</th>
        <th class="py-1.5 px-2 text-left" style="color:var(--t-secondary);font-weight:500">Statut</th>
        <th class="py-1.5 px-2 text-right" style="color:var(--t-secondary);font-weight:500">CA agence</th>
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
  score:     (a, b) => (b.score || 0) - (a.score || 0),
  classif:   (a, b) => _SQ_CLASSIF_ORDER.indexOf(a._g) - _SQ_CLASSIF_ORDER.indexOf(b._g),
  code:      (a, b) => String(a.code).localeCompare(String(b.code)),
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

  const _thSort = (key, label, align = 'text-right', title = '') => {
    const active = _prSqSort === key;
    return `<th class="py-1.5 px-2 ${align} cursor-pointer hover:t-primary"
      style="color:${active ? 'var(--c-action,#8b5cf6)' : 'var(--t-secondary)'};font-weight:${active ? 700 : 500}"
      ${title ? `title="${title}"` : ''}
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
        ${_thSort('code', 'Code', 'text-left')}
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

  const _distOk = _prDistOk;

  // CA famille par métier — 2 sources : Mon agence (consommé) + Livré zone (livraisonsData × chalandise)
  const metierPDV        = new Map(); // metier → CA famille mon agence
  const metierLivr       = new Map(); // metier → CA famille livré par d'autres agences
  const metierClientsPDV = new Map(); // metier → Set<cc> mon agence
  const metierClientsLiv = new Map(); // metier → Set<cc> livrés zone
  const metierClientsAll = new Map(); // metier → Set<cc> union

  const _matchFam = (code) => {
    const cf = catFam?.get(code);
    const cfCode = cf?.codeFam || _S.articleFamille?.[code];
    if (cfCode !== fam.codeFam) return false;
    if (_prSelectedSFs.size > 0 && !_prSelectedSFs.has(cf?.codeSousFam || '')) return false;
    if (_prSelectedMarques.size > 0 && !_prSelectedMarques.has(_S.catalogueMarques?.get(code) || '')) return false;
    return true;
  };

  const _addToMetier = (metier, cc, ca, mapCA, mapClients) => {
    mapCA.set(metier, (mapCA.get(metier) || 0) + ca);
    if (!mapClients.has(metier)) mapClients.set(metier, new Set());
    mapClients.get(metier).add(cc);
  };

  // 1) Mon agence — CA aligné sur la période Livraisons si disponible
  const _livRange = _prLivMonthRange();
  const vcaFull = _S.ventesClientArticleFull?.size
    ? _S.ventesClientArticleFull
    : _S.ventesClientArticle;
  if (vcaFull) {
    for (const [cc, artMap] of vcaFull) {
      if (!_distOk(cc)) continue;
      const info   = _S.chalandiseData.get(cc);
      const metier = info?.metier || 'Non renseigné';
      let caFam = 0;
      for (const [code, v] of artMap) {
        if (!_matchFam(code)) continue;
        caFam += _livRange ? _prClientArtCA(cc, code, _livRange) : (v.sumCA || 0);
      }
      if (caFam > 0) {
        _addToMetier(metier, cc, caFam, metierPDV, metierClientsPDV);
        // Union clients (sans re-additionner le CA)
        if (!metierClientsAll.has(metier)) metierClientsAll.set(metier, new Set());
        metierClientsAll.get(metier).add(cc);
      }
    }
  }
  // Aussi les canaux hors-MAGASIN — seulement si ventesClientArticleFull n'existe pas
  // (Full contient déjà TOUS les canaux, évite le double-comptage)
  if (!_S.ventesClientArticleFull?.size && _S.ventesClientHorsMagasin?.size) {
    for (const [cc, artMap] of _S.ventesClientHorsMagasin) {
      if (!_distOk(cc)) continue;
      const info   = _S.chalandiseData.get(cc);
      const metier = info?.metier || 'Non renseigné';
      let caFam = 0;
      for (const [code, v] of artMap) {
        if (!_matchFam(code)) continue;
        caFam += _livRange ? _prClientArtCA(cc, code, _livRange) : (v.sumCA || 0);
      }
      if (caFam > 0) {
        _addToMetier(metier, cc, caFam, metierPDV, metierClientsPDV);
        if (!metierClientsAll.has(metier)) metierClientsAll.set(metier, new Set());
        metierClientsAll.get(metier).add(cc);
      }
    }
  }

  // 2) Livraisons × chalandise — total réseau pour les clients de la zone
  if (_S.livraisonsReady && _S.livraisonsData?.size) {
    for (const [cc, livData] of _S.livraisonsData) {
      if (!_distOk(cc)) continue;
      const info   = _S.chalandiseData.get(cc);
      if (!info) continue; // pas dans la chalandise → pas de métier, on skip
      const metier = info.metier || 'Non renseigné';
      let caFam = 0;
      for (const [code, artData] of livData.articles) {
        if (!_matchFam(code)) continue;
        caFam += artData.ca || 0;
      }
      if (caFam > 0) {
        _addToMetier(metier, cc, caFam, metierLivr, metierClientsLiv);
        // Union clients (sans toucher au CA agence)
        if (!metierClientsAll.has(metier)) metierClientsAll.set(metier, new Set());
        metierClientsAll.get(metier).add(cc);
      }
    }
  }

  const hasLivr = metierLivr.size > 0;
  if (!metierPDV.size && !metierLivr.size) return sliderHtml + '<div class="t-disabled text-sm text-center py-6">Aucune donnée client × famille.</div>';

  // Trier par CA Livraisons (total) décroissant, sinon par CA agence
  const allMetiers = new Set([...metierPDV.keys(), ...metierLivr.keys()]);
  const sorted = [...allMetiers].sort((a, b) => {
    const refA = hasLivr ? (metierLivr.get(a) || 0) : (metierPDV.get(a) || 0);
    const refB = hasLivr ? (metierLivr.get(b) || 0) : (metierPDV.get(b) || 0);
    return refB - refA;
  });
  const rows = sorted.map(m => {
    const caMon   = metierPDV.get(m) || 0;
    const caLiv   = metierLivr.get(m) || 0;
    const nbMon   = metierClientsPDV.get(m)?.size || 0;
    const nbLiv   = metierClientsLiv.get(m)?.size || 0;
    // Taux de captation : CA agence / CA livraisons (si livraisons > 0)
    const captPct = caLiv > 0 ? Math.round(caMon / caLiv * 100) : null;
    const captColor = captPct === null ? '' : captPct >= 70 ? '#10b981' : captPct >= 40 ? '#f59e0b' : '#ef4444';
    return `<tr class="border-b b-light text-[11px] hover:bg-[rgba(0,0,0,0.03)]">
      <td class="py-1.5 px-2 t-primary font-medium">${escapeHtml(m || '—')}</td>
      <td class="py-1.5 px-2 text-right t-secondary">${nbMon || '—'}</td>
      <td class="py-1.5 px-2 text-right font-bold" style="color:var(--c-action)">${caMon > 0 ? formatEuro(caMon) : '—'}</td>
      ${hasLivr ? `<td class="py-1.5 px-2 text-right t-secondary">${nbLiv || '—'}</td>
      <td class="py-1.5 px-2 text-right font-bold t-primary">${caLiv > 0 ? formatEuro(caLiv) : '—'}</td>
      <td class="py-1.5 px-2 text-right font-bold" style="color:${captColor}">${captPct !== null ? captPct + '%' : '—'}</td>` : ''}
    </tr>`;
  }).join('');

  const totMon  = [...metierPDV.values()].reduce((s, v) => s + v, 0);
  const totLiv  = [...metierLivr.values()].reduce((s, v) => s + v, 0);
  const totClientsMon = new Set(); const totClientsLivSet = new Set();
  for (const s of metierClientsPDV.values()) for (const cc of s) totClientsMon.add(cc);
  for (const s of metierClientsLiv.values()) for (const cc of s) totClientsLivSet.add(cc);
  const totCaptPct = totLiv > 0 ? Math.round(totMon / totLiv * 100) : null;

  const livrLabel = hasLivr ? ' · Livraisons = total réseau (fichier Livraisons × Chalandise)' : '';
  return `${sliderHtml}<div class="text-[10px] t-disabled mb-3">Mon agence = consommé tous canaux${livrLabel} · Historique complet</div><div class="overflow-x-auto">
    <table class="w-full text-[11px]">
      <thead style="border-bottom:1px solid var(--color-border-tertiary)">
        <tr style="color:var(--t-secondary);font-size:10px;font-weight:600">
          <th class="py-1.5 px-2 text-left">Métier</th>
          <th class="py-1.5 px-2 text-right">Cl. agence</th>
          <th class="py-1.5 px-2 text-right">CA agence</th>
          ${hasLivr ? `<th class="py-1.5 px-2 text-right">Cl. livraisons</th>
          <th class="py-1.5 px-2 text-right">CA livraisons</th>
          <th class="py-1.5 px-2 text-right" title="Taux de captation : CA agence ÷ CA livraisons">Captation</th>` : ''}
        </tr>
      </thead>
      <tbody>${rows}</tbody>
      <tfoot>
        <tr class="border-t-2 font-extrabold" style="border-color:var(--color-border-secondary)">
          <td class="py-1.5 px-2 t-primary">TOTAL</td>
          <td class="py-1.5 px-2 text-right t-secondary">${totClientsMon.size}</td>
          <td class="py-1.5 px-2 text-right" style="color:var(--c-action)">${formatEuro(totMon)}</td>
          ${hasLivr ? `<td class="py-1.5 px-2 text-right t-secondary">${totClientsLivSet.size}</td>
          <td class="py-1.5 px-2 text-right t-primary">${formatEuro(totLiv)}</td>
          <td class="py-1.5 px-2 text-right font-bold" style="color:${totCaptPct >= 70 ? '#10b981' : totCaptPct >= 40 ? '#f59e0b' : '#ef4444'}">${totCaptPct !== null ? totCaptPct + '%' : '—'}</td>` : ''}
        </tr>
      </tfoot>
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

// ── Onglet Physigamme ────────────────────────────────────────────────
function _prRenderPhysigamme(fam) {
  const vpm = _S.ventesParMagasin || {};
  const spm = _S.stockParMagasin || {};
  const myStore = _S.selectedMyStore;
  const catFam = _S.catalogueFamille;
  const codeFam = fam.codeFam;

  const matchFam = (code) => {
    const cf = catFam?.get(code);
    if (cf) {
      if (cf.codeFam !== codeFam) return false;
      if (_prSelectedSFs.size > 0 && !_prSelectedSFs.has(cf.codeSousFam || '')) return false;
      return true;
    }
    return (_S.articleFamille?.[code] || '') === codeFam && _prSelectedSFs.size === 0;
  };

  // Tous les codes de la famille (finalData + réseau)
  const allCodes = new Set();
  for (const r of (_S.finalData || [])) { if (matchFam(r.code)) allCodes.add(r.code); }
  for (const arts of Object.values(vpm)) { for (const code of Object.keys(arts)) { if (matchFam(code)) allCodes.add(code); } }
  if (!allCodes.size) return '<div class="t-disabled text-sm text-center py-6">Aucun article dans cette famille.</div>';

  const fdMap = new Map();
  for (const r of (_S.finalData || [])) fdMap.set(r.code, r);
  const stores = Object.keys(vpm).filter(s => s !== myStore);
  const nbStores = stores.length || 1;

  // ── Classification par rôle ──
  const artList = [];
  const bySF = new Map(); // pour premier prix

  for (const code of allCodes) {
    const fd = fdMap.get(code);
    const sf = catFam?.get(code);
    // Détention réseau
    let nbSt = 0, caRes = 0, blRes = 0;
    for (const s of stores) { const d = vpm[s]?.[code]; if (d?.countBL > 0) { nbSt++; caRes += d.sumCA || 0; blRes += d.countBL || 0; } }
    const detention = nbSt / nbStores;
    // Mon agence
    const my = vpm[myStore]?.[code];
    const myCa = my?.sumCA || 0, myBL = my?.countBL || 0, myPrel = my?.sumPrelevee || 0;
    const stock = fd?.stockActuel || 0, enStock = stock > 0;
    const prix = fd?.prixUnitaire || 0;
    const W = fd?.W || myBL;
    // Clients stratégiques
    const buyers = _S.articleClients?.get(code);
    let nbCli = 0, nbCliFID = 0;
    if (buyers && _S.chalandiseData?.size) {
      for (const cc of buyers) {
        if (!_S.clientsMagasin?.has(cc)) continue;
        nbCli++;
        const cl = (_S.chalandiseData.get(cc)?.classification || '').toUpperCase();
        if ((cl.includes('FID') || cl.includes('OCC')) && cl.includes('POT+')) nbCliFID++;
      }
    }
    // Rôle
    let role = 'standard';
    if (detention >= 0.6 || (fd?.abcClass === 'A' && W >= 12)) role = 'incontournable';
    else if (fd?.isNouveaute || (fd?.ageJours != null && fd.ageJours < 90 && nbSt >= 2)) role = 'nouveaute';
    else if (nbCli >= 2 && nbCliFID / nbCli >= 0.5) role = 'specialiste';

    const a = { code, lib: _S.libelleLookup?.[code] || code, sf: sf?.sousFam || '', codeSF: sf?.codeSousFam || '',
      role, detention, nbSt, caRes, blRes, myCa, myBL, myPrel, stock, enStock, prix, W, nbCli, nbCliFID,
      abc: fd?.abcClass || '', fmr: fd?.fmrClass || '' };
    artList.push(a);
    if (a.sf && a.prix > 0) { if (!bySF.has(a.sf)) bySF.set(a.sf, []); bySF.get(a.sf).push(a); }
  }

  // Premier prix : 1 par SF, le moins cher vendu par le réseau (détention ≥ 30%)
  for (const [, arts] of bySF) {
    const candidate = [...arts]
      .filter(a => a.role === 'standard' && a.detention >= 0.3)
      .sort((x, y) => x.prix - y.prix)[0];
    if (candidate) candidate.role = 'premierprix';
  }

  // ── Benchmark RÉSEAU VS MOI ──
  const storeStats = stores.map(s => {
    let nr = 0, ca = 0, bl = 0, sv = 0, ns = 0;
    for (const code of allCodes) {
      const d = vpm[s]?.[code]; if (d?.countBL > 0) { nr++; ca += d.sumCA || 0; bl += d.countBL || 0; }
      const sk = spm[s]?.[code]; if (sk?.stockActuel > 0) { ns++; sv += (sk.valeurStock || 0) || ((fdMap.get(code)?.prixUnitaire || 0) * sk.stockActuel); }
    }
    return { nr, ca, bl, sv, ns };
  });
  const _med = (arr) => { if (!arr.length) return 0; const s = [...arr].sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

  let myNR = 0, myCA = 0, myBL = 0, mySV = 0, myNS = 0;
  for (const a of artList) { if (a.myBL > 0) { myNR++; myCA += a.myCa; myBL += a.myBL; } if (a.enStock) { myNS++; mySV += a.prix * a.stock; } }
  const medNR = _med(storeStats.map(s => s.nr)), medCA = _med(storeStats.map(s => s.ca));
  const medBL = _med(storeStats.map(s => s.bl)), medSV = _med(storeStats.map(s => s.sv));
  const medNS = _med(storeStats.map(s => s.ns));
  const myRot = mySV > 0 ? myCA / mySV : 0, medRot = _med(storeStats.filter(s => s.sv > 0).map(s => s.ca / s.sv));

  // Détention incontournables
  const incont = artList.filter(a => a.role === 'incontournable');
  const incontOK = incont.filter(a => a.enStock).length;
  const tauxInc = incont.length ? Math.round(incontOK / incont.length * 100) : 100;

  const _ecart = (v, m) => {
    if (!m) return '';
    const d = Math.round((v - m) / m * 100);
    const c = d >= 0 ? '#22c55e' : d >= -20 ? '#f59e0b' : '#ef4444';
    return `<span style="color:${c};font-weight:600">${d >= 0 ? '+' : ''}${d}%</span>`;
  };
  const _n = (v) => Math.round(v).toLocaleString('fr');
  const benchRows = [
    ['Réfs vendues', myNR, Math.round(medNR)],
    ['CA TTC', _n(myCA) + ' €', _n(medCA) + ' €', myCA, medCA],
    ['Nb BL', myBL, Math.round(medBL)],
    ['Réfs en stock', myNS, Math.round(medNS)],
    ['Valeur stock', _n(mySV) + ' €', _n(medSV) + ' €', mySV, medSV],
    ['Rotation', myRot.toFixed(1) + '×', medRot.toFixed(1) + '×', myRot, medRot],
  ].map(r => {
    const mine = r.length > 3 ? r[3] : r[1], med = r.length > 3 ? r[4] : r[2];
    return `<tr class="border-b b-light text-[11px]">
      <td class="py-1.5 px-2 t-secondary">${r[0]}</td>
      <td class="py-1.5 px-2 text-right font-bold t-primary">${r.length > 3 ? r[1] : r[1]}</td>
      <td class="py-1.5 px-2 text-right t-secondary">${r.length > 3 ? r[2] : r[2]}</td>
      <td class="py-1.5 px-2 text-right">${_ecart(mine, med)}</td>
    </tr>`;
  }).join('');

  // ── Rôles cards ──
  const ROLES = [
    { k: 'incontournable', i: '🏆', l: 'Incontournables', c: '#22c55e', obj: 98 },
    { k: 'nouveaute', i: '🆕', l: 'Nouveautés', c: '#3b82f6' },
    { k: 'premierprix', i: '💰', l: 'Premiers prix', c: '#f59e0b' },
    { k: 'specialiste', i: '🎯', l: 'Spécialistes', c: '#8b5cf6' },
    { k: 'standard', i: '📦', l: 'Standard', c: '#94a3b8' },
  ];
  const rc = {}, ri = {};
  for (const r of ROLES) { rc[r.k] = 0; ri[r.k] = 0; }
  for (const a of artList) { rc[a.role]++; if (a.enStock) ri[a.role]++; }

  const roleCards = ROLES.filter(r => rc[r.k] > 0).map(r => {
    const pct = Math.round(ri[r.k] / rc[r.k] * 100);
    const alert = r.obj ? (pct >= r.obj ? ' ✅' : ' ⚠️') : (pct >= 80 ? '' : '');
    return `<div class="rounded-lg p-2.5 border b-light s-card text-center min-w-[90px]">
      <div class="text-[14px]">${r.i}</div>
      <div class="text-[10px] font-bold mt-1" style="color:${r.c}">${r.l}</div>
      <div class="text-[16px] font-black t-primary mt-0.5">${ri[r.k]}<span class="text-[11px] t-disabled">/${rc[r.k]}</span></div>
      <div class="text-[10px] t-secondary">${pct}%${r.obj ? ` · obj ${r.obj}%` : ''}${alert}</div>
    </div>`;
  }).join('');

  // ── JE VIDE / JE REMPLIS ──
  const aRemplir = artList.filter(a => !a.enStock && (a.role === 'incontournable' || a.role === 'nouveaute' || a.role === 'specialiste'))
    .sort((a, b) => b.detention - a.detention).slice(0, 10);
  const aVider = artList.filter(a => a.enStock && a.W === 0 && a.role === 'standard')
    .sort((a, b) => (b.prix * b.stock) - (a.prix * a.stock)).slice(0, 10);

  // SF sans premier prix en stock — avec candidat suggéré
  const sfNoPP = [];
  for (const [sf, arts] of bySF) {
    if (!arts.some(a => a.role === 'premierprix' && a.enStock)) {
      // Candidat : le moins cher avec détention réseau, ou le PP détecté non stocké
      const candidate = arts.filter(a => a.role === 'premierprix')[0]
        || [...arts].filter(a => a.detention >= 0.2).sort((x, y) => x.prix - y.prix)[0]
        || [...arts].sort((x, y) => x.prix - y.prix)[0];
      sfNoPP.push({ sf, candidate });
    }
  }
  // Premiers prix dormants — signal d'alerte visibilité
  const ppDormants = artList.filter(a => a.enStock && a.W === 0 && a.role === 'premierprix');

  const ROLE_COLORS = { incontournable: '#22c55e', nouveaute: '#3b82f6', premierprix: '#f59e0b', specialiste: '#8b5cf6', standard: '#94a3b8' };
  const ROLE_ICONS = { incontournable: '🏆', nouveaute: '🆕', premierprix: '💰', specialiste: '🎯', standard: '📦' };
  const _artTh = `<thead><tr class="border-b b-light text-[10px]" style="color:var(--t-secondary)">
    <th class="py-1 px-2 text-left">Code</th><th class="py-1 px-2 text-left">Libellé</th>
    <th class="py-1 px-2 text-left">Rôle</th><th class="py-1 px-2 text-right">Dét. rés.</th>
    <th class="py-1 px-2 text-right">Stock</th><th class="py-1 px-2 text-right">W</th>
  </tr></thead>`;
  const _artRow = (a) => `<tr class="border-b b-light text-[11px] cursor-pointer hover:s-hover"
    onclick="if(window.openArticlePanel)window.openArticlePanel('${a.code}','planRayon')">
    <td class="py-1 px-2 font-mono t-disabled">${a.code}</td>
    <td class="py-1 px-2 t-primary truncate max-w-[160px]">${escapeHtml(a.lib)}</td>
    <td class="py-1 px-2"><span class="text-[8px] px-1.5 py-0.5 rounded-full" style="background:${ROLE_COLORS[a.role]}20;color:${ROLE_COLORS[a.role]}">${ROLE_ICONS[a.role]} ${a.role}</span></td>
    <td class="py-1 px-2 text-right t-secondary">${Math.round(a.detention * 100)}%</td>
    <td class="py-1 px-2 text-right t-secondary">${a.enStock ? a.stock : '—'}</td>
    <td class="py-1 px-2 text-right t-secondary">${a.W || 0}</td>
  </tr>`;

  let actions = '';
  if (aRemplir.length) {
    actions += `<div class="mb-4">
      <h4 class="text-[11px] font-bold mb-1.5" style="color:#22c55e">📥 Je remplis — ${aRemplir.length} réf${aRemplir.length > 1 ? 's' : ''} essentielles manquantes</h4>
      <table class="w-full">${_artTh}<tbody>${aRemplir.map(_artRow).join('')}</tbody></table>
    </div>`;
  }
  if (aVider.length) {
    const valVider = aVider.reduce((s, a) => s + a.prix * a.stock, 0);
    actions += `<div class="mb-4">
      <h4 class="text-[11px] font-bold mb-1.5" style="color:#ef4444">📤 Je vide — ${aVider.length} dormant${aVider.length > 1 ? 's' : ''} non-essentiels (${_n(valVider)} € de stock)</h4>
      <table class="w-full">${_artTh}<tbody>${aVider.map(_artRow).join('')}</tbody></table>
    </div>`;
  }
  if (ppDormants.length) {
    actions += `<div class="mb-4">
      <h4 class="text-[11px] font-bold mb-1.5" style="color:#f59e0b">👀 ${ppDormants.length} premier${ppDormants.length > 1 ? 's' : ''} prix dormant${ppDormants.length > 1 ? 's' : ''} — vérifier visibilité en rayon</h4>
      <table class="w-full">${_artTh}<tbody>${ppDormants.map(_artRow).join('')}</tbody></table>
    </div>`;
  }
  if (sfNoPP.length) {
    actions += `<div class="mb-3">
      <h4 class="text-[11px] font-bold mb-1.5" style="color:#f59e0b">⚠️ ${sfNoPP.length} sous-famille${sfNoPP.length > 1 ? 's' : ''} sans premier prix en stock</h4>
      <table class="w-full">${sfNoPP.map(({ sf, candidate: c }) => `<tr class="border-b b-light text-[11px]${c ? ' cursor-pointer hover:s-hover' : ''}"
        ${c ? `onclick="if(window.openArticlePanel)window.openArticlePanel('${c.code}','planRayon')"` : ''}>
        <td class="py-1 px-2 t-secondary">${escapeHtml(sf)}</td>
        ${c ? `<td class="py-1 px-2 font-mono t-disabled">${c.code}</td>
        <td class="py-1 px-2 t-primary truncate max-w-[140px]">${escapeHtml(c.lib)}</td>
        <td class="py-1 px-2 text-right t-secondary">${c.prix.toFixed(2)} €</td>
        <td class="py-1 px-2 text-right t-secondary">${Math.round(c.detention * 100)}%</td>` : '<td colspan="4" class="py-1 px-2 t-disabled">—</td>'}
      </tr>`).join('')}</table>
    </div>`;
  }
  if (!aRemplir.length && !aVider.length && !ppDormants.length && !sfNoPP.length) {
    actions = '<div class="text-[11px] t-disabled text-center py-3">✅ Gamme équilibrée — aucune action prioritaire détectée.</div>';
  }

  return `
    <div class="grid grid-cols-2 gap-6 mb-4">
      <div>
        <h4 class="text-[11px] font-bold t-primary mb-2">📊 Réseau vs Mon agence <span class="text-[9px] t-disabled font-normal">${stores.length} agences</span></h4>
        <table class="w-full">
          <thead><tr class="border-b b-light text-[10px]" style="color:var(--t-secondary)">
            <th class="py-1 px-2 text-left">KPI</th><th class="py-1 px-2 text-right">Moi</th>
            <th class="py-1 px-2 text-right">Méd. rés.</th><th class="py-1 px-2 text-right">Écart</th>
          </tr></thead><tbody>${benchRows}</tbody>
        </table>
        <div class="mt-3 px-2 py-2 rounded-lg border b-light flex items-center gap-2">
          <span class="text-[10px] t-secondary">🏆 Détention incontournables :</span>
          <span class="text-[13px] font-black ${tauxInc >= 98 ? 'text-green-400' : tauxInc >= 80 ? 'text-amber-400' : 'text-red-400'}">${tauxInc}%</span>
          <span class="text-[9px] t-disabled">obj. 98%</span>
          ${tauxInc >= 98 ? '<span class="text-[11px]">✅</span>' : '<span class="text-[11px]">⚠️</span>'}
        </div>
      </div>
      <div>
        <h4 class="text-[11px] font-bold t-primary mb-2">🎭 Rôles stratégiques</h4>
        <div class="flex flex-wrap gap-2">${roleCards}</div>
      </div>
    </div>
    <div class="border-t b-light pt-3">
      <h4 class="text-[12px] font-bold t-primary mb-3">⚡ Actions — Je vide, j'optimise, je remplis</h4>
      ${actions}
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
  if (tab === 'squelette')  return _prRenderSquelette(fam);
  if (tab === 'metiers')    return _prRenderMetiers(fam);
  if (tab === 'analyse')    return _prRenderAnalyse(fam);
  if (tab === 'physigamme') return _prRenderPhysigamme(fam);
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
    { key: 'rayon',      label: '📊 Mon Rayon' },
    { key: 'physigamme', label: '🎭 Physigamme' },
    { key: 'squelette',  label: '🦴 Squelette' },
    { key: 'metiers',    label: '🎯 Métiers'   },
    { key: 'analyse',    label: '📦 Analyse'   },
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
          title="Copier le diagnostic terrain">
          📋 Liste action
        </button>
        <button onclick="window._prCopyForLLM('${fam.codeFam}')"
          class="text-[10px] px-2 py-1 rounded border flex-shrink-0"
          style="border-color:#7c3aed;color:#7c3aed;background:rgba(124,58,237,0.06)"
          title="Pack données + prompt prêt à coller dans Gemini/Grok/ChatGPT">
          🧠 Pour LLM
        </button>
        <button onclick="window._prCloseDetail()" class="text-[11px] t-secondary hover:t-primary cursor-pointer border b-light px-2 py-0.5 rounded s-card shrink-0">✕</button>
      </div>
    </div>
    ${_S.chalandiseReady && [...(_S.chalandiseData?.values()||[])].some(i=>i.distanceKm!=null) ? `
    <div class="flex items-center gap-1.5 mb-2 px-1">
      <span class="text-[10px] t-disabled">📍 Distance :</span>
      ${[{v:0,l:'Off'},{v:2,l:'2 km'},{v:5,l:'5 km'},{v:10,l:'10 km'},{v:20,l:'20 km'}].map(d=>
        `<button onclick="window._prMetierDistChange(${d.v||100})" data-prdist="${d.v}"
          class="text-[9px] px-2 py-0.5 rounded-full border cursor-pointer transition-colors"
          style="${(!_prMetierDist&&!d.v)||(_prMetierDist===d.v)?'background:var(--c-action,#8b5cf6);color:#fff;border-color:var(--c-action,#8b5cf6)':'border-color:var(--b-light);color:var(--t-secondary);background:transparent'}">${d.l}</button>`
      ).join('')}
    </div>` : ''}
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
    <div class="grid grid-cols-7 gap-2 mb-3">
      ${_badge('socle', totals.socle)}
      ${_badge('implanter', totals.implanter)}
      ${_badge('specialiser', totals.specialiser || 0)}
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

window._prToggleMRSortCode = function() {
  _S._prMRSortByCode = !_S._prMRSortByCode;
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
  // Update distance slider if present
  const slider = document.querySelector('#prDetailPanel input[type="range"]');
  if (slider) slider.value = _prMetierDist || 100;
  // Re-render quick buttons active state
  const panel = document.getElementById('prDetailPanel');
  if (panel) {
    panel.querySelectorAll('[data-prdist]').forEach(b => {
      const v = parseInt(b.dataset.prdist);
      const active = (!_prMetierDist && !v) || (_prMetierDist === v);
      b.style.background = active ? 'var(--c-action,#8b5cf6)' : 'transparent';
      b.style.color = active ? '#fff' : 'var(--t-secondary)';
      b.style.borderColor = active ? 'var(--c-action,#8b5cf6)' : 'var(--b-light)';
    });
  }
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

// ── Données communes Diag + LLM ────────────────────────────────────────
// Collecte items squelette, pathologies, métiers agence/livraisons, refs manquantes
function _prGatherFamData(codeFam, matchFn) {
  const catFam = _S.catalogueFamille;
  const sqData = _S._prSqData || computeSquelette();
  _S._prSqData = sqData;

  // Items squelette par classification
  const items = { socle: [], implanter: [], challenger: [], potentiel: [], surveiller: [] };
  if (sqData) {
    for (const d of sqData.directions || []) {
      for (const g of Object.keys(items)) {
        for (const a of (d[g] || [])) {
          const cf = catFam?.get(a.code)?.codeFam || (_S.articleFamille?.[a.code] || '').slice(0, 3);
          if (cf !== codeFam) continue;
          items[g].push(a);
        }
      }
    }
  }

  // Pathologies depuis finalData
  const patho = [];
  const DORMANT_DAYS = 180;
  for (const r of (_S.finalData || [])) {
    const cf = catFam?.get(r.code)?.codeFam || (_S.articleFamille?.[r.code] || '').slice(0, 3);
    if (cf !== codeFam) continue;
    const statut = (r.statut || '').toLowerCase();
    const isFin = statut.includes('fin de');
    const isDor = r.stockActuel > 0 && (r.ageJours || 0) > DORMANT_DAYS && !isFin;
    const isRup = r.stockActuel === 0 && !isFin && (r.enleveTotal || 0) > 0;
    if (isFin || isDor || isRup) {
      patho.push({
        code: r.code, libelle: r.libelle, marque: _S.catalogueMarques?.get(r.code) || '',
        statut: isFin ? 'fin' : isDor ? 'dormant' : 'rupture',
        valeurLib: r.stockActuel * (r.prixUnitaire || 0),
        ageJours: r.ageJours || 0,
      });
    }
  }
  patho.sort((a, b) => b.valeurLib - a.valeurLib);

  // Métiers agence
  const metierCA = new Map();
  const metierCli = new Map();
  const _livRange = _prLivMonthRange();
  const _match = matchFn || ((code) => {
    const cf = catFam?.get(code)?.codeFam || (_S.articleFamille?.[code] || '').slice(0, 3);
    return cf === codeFam;
  });

  if (_S.chalandiseReady && _S.chalandiseData?.size) {
    for (const [cc, artMap] of (_S.ventesClientArticleFull || _S.ventesClientArticle || new Map())) {
      if (!_prDistOk(cc)) continue;
      const info = _S.chalandiseData?.get(cc);
      const metier = info?.metier || 'Hors chalandise';
      let caFam = 0;
      for (const [code, data] of artMap) {
        if (!_match(code)) continue;
        caFam += _livRange ? _prClientArtCA(cc, code, _livRange) : (data.sumCA || 0);
      }
      if (caFam > 0) {
        metierCA.set(metier, (metierCA.get(metier) || 0) + caFam);
        metierCli.set(metier, (metierCli.get(metier) || 0) + 1);
      }
    }
    if (!_S.ventesClientArticleFull?.size) {
      for (const [cc, artMap] of (_S.ventesClientHorsMagasin || new Map())) {
        if (!_prDistOk(cc)) continue;
        const info = _S.chalandiseData?.get(cc);
        const metier = info?.metier || 'Hors chalandise';
        let caFam = 0;
        for (const [code, data] of artMap) {
          if (!_match(code)) continue;
          caFam += _livRange ? _prClientArtCA(cc, code, _livRange) : (data.sumCA || 0);
        }
        if (caFam > 0) {
          metierCA.set(metier, (metierCA.get(metier) || 0) + caFam);
          if (!metierCli.has(metier)) metierCli.set(metier, 0);
          metierCli.set(metier, metierCli.get(metier) + 1);
        }
      }
    }
  }

  // Livraisons + refs manquantes
  const metierLivCA = new Map();
  const metierLivCli = new Map();
  const metierArts = new Map(); // metier → Map<code, {ca, qty, nbCli}>
  const codesEnRayon = new Set((_S.finalData || [])
    .filter(r => {
      const cf = catFam?.get(r.code)?.codeFam || _S.articleFamille?.[r.code];
      return cf === codeFam && r.stockActuel > 0;
    })
    .map(r => r.code));

  if (_S.livraisonsReady && _S.livraisonsData?.size && _S.chalandiseReady) {
    for (const [cc, livData] of _S.livraisonsData) {
      if (!_prDistOk(cc)) continue;
      const info = _S.chalandiseData?.get(cc);
      if (!info) continue;
      const metier = info.metier || 'Non renseigné';
      let caFam = 0;
      for (const [code, artData] of livData.articles) {
        if (!_match(code)) continue;
        caFam += artData.ca || 0;
        // Refs manquantes
        if (!codesEnRayon.has(code)) {
          if (!metierArts.has(metier)) metierArts.set(metier, new Map());
          const ma = metierArts.get(metier);
          if (!ma.has(code)) ma.set(code, { ca: 0, qty: 0, nbCli: 0 });
          const e = ma.get(code);
          e.ca += artData.ca || 0;
          e.qty += artData.qty || 0;
          e.nbCli++;
        }
      }
      if (caFam > 0) {
        metierLivCA.set(metier, (metierLivCA.get(metier) || 0) + caFam);
        metierLivCli.set(metier, (metierLivCli.get(metier) || 0) + 1);
      }
    }
  }

  // Emplacements connus
  const emplacements = [...new Set(
    (_S.finalData || [])
      .filter(r => {
        const cf = catFam?.get(r.code)?.codeFam || _S.articleFamille?.[r.code];
        return cf === codeFam && r.emplacement?.trim();
      })
      .map(r => r.emplacement.trim())
  )].sort();

  return { sqData, items, patho, metierCA, metierCli, metierLivCA, metierLivCli, metierArts, codesEnRayon, emplacements };
}

// ── Diagnostic ─────────────────────────────────────────────────────────
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
  txt += `Action recommandée par PRISME : ${ACTION_BADGE[fam.classifGlobal]?.label || fam.classifGlobal}\n`;
  if (fam.needsCleaning) {
    txt += `🧹 **PRIORITÉ HYGIÈNE** : ${fam.hygieneScore}% du rayon est pathologique (${fam.nbDormants} dormants · ${fam.nbFin} fin série/stock · ${fam.nbRuptures} ruptures). **Nettoie avant d'implanter** — le rendement remontera mécaniquement.\n`;
  }
  if (fam.nbSchizo >= 2) {
    txt += `🌀 **${fam.nbSchizo} REFS SCHIZO** : incontournables réseau MAIS dormantes/ruptures chez toi → rayon échantillonné, commande à la demande, **stock fiable manquant**.\n`;
    for (const s of fam.schizoItems.slice(0, 8)) {
      txt += `   - ${s.code} ${s.libelle} (${s.statut}, ${s.ageJours}j)\n`;
    }
  }

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

  // ── Pré-calcul signal métier (réutilisé dans ÉTAPE 2 + section MÉTIERS) ──
  const _matchFamDiag = (code) => {
    const cf = catFam?.get(code);
    if (cf?.codeFam !== codeFam) return false;
    if (_prSelectedSFs.size > 0 && !_prSelectedSFs.has(cf.codeSousFam || '')) return false;
    return true;
  };
  const gd = (_S.chalandiseReady && _S.chalandiseData?.size) ? _prGatherFamData(codeFam, _matchFamDiag) : null;
  const metierDemand = new Map();
  if (gd?.metierArts?.size) {
    for (const [met, arts] of gd.metierArts) {
      for (const [code, d] of arts) {
        if (!metierDemand.has(code)) metierDemand.set(code, { totalCA: 0, totalCli: 0, metiers: [] });
        const e = metierDemand.get(code);
        e.totalCA += d.ca;
        e.totalCli += d.nbCli;
        e.metiers.push({ name: met, ca: d.ca, nbCli: d.nbCli });
      }
    }
  }

  if (isRayonVide) {
    txt += `═══ FAMILLE NON EXPLOITÉE ═══\n`;
    txt += `0 article en stock. Cette famille n'est pas encore référencée.\n`;
    txt += `Couverture catalogue : 0/${nbCat} références disponibles.\n\n`;
  } else {
    // Dédup monRayon par code (sécurité)
    {
      const _seen = new Set();
      rayonData.monRayon = rayonData.monRayon.filter(a => {
        if (_seen.has(a.code)) return false;
        _seen.add(a.code);
        return true;
      });
    }
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
    const _sfOf = (a) => catFam?.get(a.code)?.sousFam || 'Divers / non catalogué';
    const _mqOf = (a) => _S.catalogueMarques?.get(a.code) || a.marque || 'Marque non renseignée';
    const _empOf = (a) => (a.emplacement || '').trim() || '—';

    // Tri logique : sous-famille → marque → libellé → code (regroupe les EMBASE d'une même marque)
    const _sortPhys = (a, b) => {
      const sa = _sfOf(a), sb = _sfOf(b);
      if (sa !== sb) return sa.localeCompare(sb);
      const ma = _mqOf(a), mb = _mqOf(b);
      if (ma !== mb) return ma.localeCompare(mb);
      const la = (a.libelle || '').toUpperCase(), lb = (b.libelle || '').toUpperCase();
      if (la !== lb) return la.localeCompare(lb);
      return String(a.code).localeCompare(String(b.code));
    };
    // Séparateurs visuels
    const _SEP_SF = '─'.repeat(78);
    const _SEP_MQ = '─'.repeat(40);
    // Impression groupée par sous-famille ▸ puis marque · emplacement affiché inline @
    const _printByEmp = (arr, fmt) => {
      let curSF = null, curMQ = null;
      arr.forEach(a => {
        const sf = _sfOf(a);
        const mq = _mqOf(a);
        if (sf !== curSF) {
          if (curSF !== null) txt += '\n';
          txt += `**▸ ${sf}**\n`;
          curSF = sf; curMQ = null;
        }
        if (mq !== curMQ) {
          if (curMQ !== null) txt += '\n';
          txt += `  **· ${mq}**\n`;
          curMQ = mq;
        }
        const emp = _empOf(a);
        const empTag = emp && emp !== '—' ? `@${emp} ` : '';
        txt += `      ${fmt(a, empTag)}\n`;
      });
    };

    // === CLASSIFICATION TERRAIN ===
    const _isFinSerie = (a) => { const s = (a.statut || '').toLowerCase(); return s.includes('fin de série') || s.includes('fin de serie'); };
    const _isFinStock = (a) => (a.statut || '').toLowerCase().includes('fin de stock');
    const _isFin = (a) => _isFinSerie(a) || _isFinStock(a);

    // ÉTAPE 1 — SORTIR : dormants hors socle réseau + fins de série/stock
    const aDormants = rayonData.monRayon
      .filter(a => a.status === 'dormant' && a.sqClassif !== 'socle' && !_isFin(a))
      .sort(_sortPhys);
    const aFinSerie = rayonData.monRayon.filter(a => _isFinSerie(a)).sort(_sortPhys);
    const aFinStock = rayonData.monRayon.filter(a => _isFinStock(a) && !_isFinSerie(a)).sort(_sortPhys);
    const aSortir = [...aDormants, ...aFinSerie, ...aFinStock];

    // ÉTAPE 4 — VÉRIFIER/MAINTENIR : tout le reste (socle actif + standards + ruptures)
    const seen = new Set(aSortir.map(a => a.code));
    const aMaintenir = rayonData.monRayon
      .filter(a => !seen.has(a.code))
      .sort(_sortPhys);

    // ── ÉTAPE 1 ─────────────────────────────────────────────
    if (aSortir.length) {
      const valLib = aSortir.reduce((s, a) => s + (a.valeurStock || 0), 0);
      const nbEmp = new Set(aSortir.map(a => (a.emplacement || '').trim()).filter(Boolean)).size;
      txt += `═══ ÉTAPE 1 — SORTIR DU RAYON (${aSortir.length} refs · ~${Math.round(valLib)}€ libérables · ${nbEmp} emplacements rendus) ═══\n`;
      txt += `⏱ Budget : ~20 min  ·  Geste : retire physiquement, met en retour fournisseur ou solde.\n`;
      txt += `⚠ **RÈGLE DE SÉCURITÉ** : même si dormant, ne jette JAMAIS un ⭐ (pépite) ni un 💤 (socle réseau). Ces marqueurs apparaissent à l'ÉTAPE 3.\n`;
      const _fmtSortir = (a, emp) => `☐ [${a.code}] ${a.libelle} — stock ${a.stockActuel ?? 0}, ${Math.round(a.valeurStock || 0)}€${emp ? '  ' + emp.trim() : ''}`;
      if (aDormants.length) {
        // Tri dormants par € libérable décroissant (gain visible d'abord)
        const aDormSorted = [...aDormants].sort((a, b) => (b.valeurStock || 0) - (a.valeurStock || 0));
        txt += `\n**Dormants (${aDormants.length}) — triés par € libérable**\n`;
        aDormSorted.forEach(a => {
          const emp = _empOf(a);
          const empTag = emp && emp !== '—' ? `@${emp} ` : '';
          txt += `      ${_fmtSortir(a, empTag)}\n`;
        });
      }
      if (aFinSerie.length) {
        txt += `\n**Fin de série (${aFinSerie.length}) — à dégager même si pépite**\n`;
        _printByEmp(aFinSerie, _fmtSortir);
      }
      if (aFinStock.length) {
        txt += `\n**Fin de stock (${aFinStock.length}) — à dégager même si pépite**\n`;
        _printByEmp(aFinStock, _fmtSortir);
      }
      txt += '\n';
    }

    // ── ÉTAPE 3 — IMPLANTER (calculée depuis sqData, exclut codes déjà au rayon) ──
    if (sqData) {
      const codesInRayon = new Set(rayonData.monRayon.map(a => a.code));
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
      const _sfOfImpl = (a) => catFam?.get(a.code)?.sousFam || 'Divers / non catalogué';
      const _mqOfImpl = (a) => _S.catalogueMarques?.get(a.code) || a.marque || 'Marque non renseignée';
      toImpl.sort((a, b) => {
        const sa = _sfOfImpl(a), sb = _sfOfImpl(b);
        if (sa !== sb) return sa.localeCompare(sb);
        const ma = _mqOfImpl(a), mb = _mqOfImpl(b);
        if (ma !== mb) return ma.localeCompare(mb);
        return String(a.code).localeCompare(String(b.code));
      });
      if (toImpl.length) {
        const fdByCode = new Map();
        for (const r of (_S.finalData || [])) fdByCode.set(r.code, r);
        // Médiane helper
        const _median = (arr) => { const s = [...arr].sort((x, y) => x - y); const n = s.length; return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2; };
        const _otherStores = [...(_S.storesIntersection || [])].filter(s => s !== _S.selectedMyStore);
        // Estimation MIN/MAX via formule PRISME appliquée aux ventes réseau
        const _joursOuvres = _S.globalJoursOuvres || 250;
        const _estimMinMax = (code) => {
          if (!_otherStores.length) return null;
          const computed = [];
          for (const s of _otherStores) {
            const v = _S.ventesParMagasin?.[s]?.[code];
            if (!v || !v.countBL || v.countBL <= 1) continue;
            const W = v.countBL;
            const V = v.sumPrelevee || 0;
            if (V <= 0) continue;
            const Wp = W; // approx: on n'a pas le split prélevé/enlevé par agence
            const U = V / Wp;
            const X = V / _joursOuvres;
            if (W === 2) { computed.push({ min: 1, max: 2 }); continue; }
            const dlR = Math.min(3 * U, V > 0 ? Math.max(...[V]) : U); // T ≈ max single BL, approx V (conservative)
            // On n'a pas T (max BL) par agence, on prend 3×U comme proxy d'écrêtage
            const dl = Math.min(3 * U, U * 5);
            const secDays = Wp >= 12 ? 4 : Wp >= 4 ? 3 : 2;
            let mn = Math.max(Math.min(Math.round(dl + X * secDays), Math.ceil(V / 6)), 1);
            if (mn < 0) mn = 0;
            const df = Wp > 12 ? 21 : 10;
            const me = Wp > 12 ? 3 : 1;
            const mx = Math.max(Math.round(mn + X * df), mn + me);
            computed.push({ min: mn, max: mx });
          }
          if (computed.length < 2) return null; // besoin d'au moins 2 agences pour une médiane fiable
          computed.sort((a, b) => a.min - b.min);
          const mid = Math.floor(computed.length / 2);
          return { min: computed[mid].min, max: computed[mid].max };
        };
        const _mmLine = (a) => {
          const fd = fdByCode.get(a.code);
          if (fd && fd.nouveauMin > 0 && fd.nouveauMax > 0) return `MIN ${fd.nouveauMin}/MAX ${fd.nouveauMax}`;
          let mn = fd?.medMinReseau, mx = fd?.medMaxReseau;
          // Fallback 1 : calcul direct depuis stockParMagasin (articles hors finalData)
          if ((mn == null || mx == null) && _otherStores.length) {
            const mins = _otherStores.map(s => _S.stockParMagasin?.[s]?.[a.code]?.qteMin).filter(v => v > 0);
            const maxs = _otherStores.map(s => _S.stockParMagasin?.[s]?.[a.code]?.qteMax).filter(v => v > 0);
            if (mins.length) mn = _median(mins);
            if (maxs.length) mx = _median(maxs);
          }
          if (mn != null && mx != null) return `MIN ${Math.round(mn)}/MAX ${Math.round(mx)} (méd. réseau)`;
          if (mx != null) return `MAX ${Math.round(mx)} (méd. réseau)`;
          // Fallback 2 : estimation PRISME depuis ventes réseau
          const est = _estimMinMax(a.code);
          if (est) return `MIN ${est.min}/MAX ${est.max} (estim. réseau)`;
          // Fallback 3 : heuristique depuis fréquence squelette (nbBL / nbAgences)
          if (a.nbBLLivraisons > 0 && a.nbAgencesReseau > 0) {
            const avgBL = a.nbBLLivraisons / a.nbAgencesReseau;
            let mn, mx;
            if (avgBL >= 24)     { mn = 2; mx = 5; }
            else if (avgBL >= 8) { mn = 1; mx = 3; }
            else if (avgBL >= 3) { mn = 1; mx = 2; }
            else                 { mn = 1; mx = 1; }
            return `MIN ${mn}/MAX ${mx} (estim. ${Math.round(avgBL)} BL/ag)`;
          }
          return `MIN/MAX à paramétrer`;
        };
        // Signal cumulé pour l'en-tête
        const totBL = toImpl.reduce((s, a) => s + (a.nbBLLivraisons || 0), 0);
        const totAg = toImpl.reduce((s, a) => s + (a.nbAgencesReseau || 0), 0);
        txt += `═══ ÉTAPE 2 — IMPLANTER (${toImpl.length} refs à créer · ${totBL} BL réseau cumulés · ${totAg} présences agences) ═══\n`;
        txt += `⏱ Budget : ~45 min  ·  Geste : crée un nouvel emplacement, paramètre MIN/MAX dans l'ERP, note la commande initiale.\n`;
        // TOP 3 prioritaires par score composite (réseau + demande métier zone)
        const top3 = [...toImpl].sort((a, b) => {
          const sa = (a.score || 0) + Math.min((metierDemand.get(a.code)?.totalCA || 0) * 0.1, 30);
          const sb = (b.score || 0) + Math.min((metierDemand.get(b.code)?.totalCA || 0) * 0.1, 30);
          return sb - sa;
        }).slice(0, 3);
        if (top3.length) {
          txt += `\n**🎯 TOP 3 prioritaires** (signal réseau + demande métier)\n`;
          top3.forEach(a => {
            const md = metierDemand.get(a.code);
            const mdTag = md ? ` · 🏪 ${md.totalCli} clients zone, ${Math.round(md.totalCA)}€ (${md.metiers.sort((x,y)=>y.nbCli-x.nbCli).map(m=>m.name).slice(0,2).join(', ')})` : '';
            txt += `      ☐ [${a.code}] ${a.libelle} — score ${a.score} · ${a.nbAgencesReseau} agences · ${a.nbBLLivraisons} BL · ${_mmLine(a)}${mdTag}\n`;
          });
          txt += `\n**Liste complète** (triée par sous-famille → marque)\n`;
        }
        const list = toImpl;
        let curSF = null, curMQ = null;
        list.forEach(a => {
          const sf = _sfOfImpl(a);
          const mq = _mqOfImpl(a);
          if (sf !== curSF) {
            if (curSF !== null) txt += '\n';
            txt += `**▸ ${sf}**\n`;
            curSF = sf; curMQ = null;
          }
          if (mq !== curMQ) {
            if (curMQ !== null) txt += '\n';
            txt += `  **· ${mq}**\n`;
            curMQ = mq;
          }
          const md = metierDemand.get(a.code);
          const mdTag = md ? ` 🏪 ${md.totalCli} cli, ${Math.round(md.totalCA)}€ zone` : '';
          txt += `      ☐ [${a.code}] ${a.libelle} — ${_mmLine(a)}${mdTag}\n`;
        });
        txt += '\n';
        // BONUS CAPTATION — refs à forte demande métier non détectées par le squelette
        if (metierDemand.size) {
          const codesImpl = new Set(toImpl.map(a => a.code));
          const bonus = [...metierDemand.entries()]
            .filter(([code]) => !codesInRayon.has(code) && !codesImpl.has(code))
            .sort((a, b) => b[1].totalCli - a[1].totalCli || b[1].totalCA - a[1].totalCA)
            .slice(0, 5);
          if (bonus.length && bonus[0][1].totalCli >= 2) {
            txt += `**🏪 BONUS CAPTATION MÉTIER** — refs achetées par vos clients zone via d'autres agences\n`;
            txt += `(Non détectées par le squelette réseau, mais signal commercial fort)\n`;
            for (const [code, d] of bonus) {
              if (d.totalCli < 2) break;
              const libelle = _S.libelleLookup?.[code] || '';
              const mq = _S.catalogueMarques?.get(code) || '';
              const mets = d.metiers.sort((x, y) => y.nbCli - x.nbCli).map(m => m.name).slice(0, 3).join(', ');
              txt += `      ☐ [${code}] ${libelle}${mq ? ' · ' + mq : ''} — ${d.totalCli} clients, ${Math.round(d.totalCA)}€ · métiers: ${mets}\n`;
            }
            txt += '\n';
          }
        }
      }
    }

    // ── ÉTAPE 4 ─────────────────────────────────────────────
    if (aMaintenir.length) {
      // Marqueurs ÉTAPE 4 : ⭐ pépite · 💤 dormant socle · ⚠ rupture · 🔧 MIN/MAX absent ERP
      const _markers4 = (a) => {
        let s = '';
        if (a.status === 'pepite') s += '⭐';
        if (a.sqClassif === 'socle' && a.status === 'dormant') s += '💤';
        if (a.status === 'rupture') s += '⚠';
        if (!_minMax(a)) s += '🔧';
        return s ? s + ' ' : '';
      };
      // Split : incontournables (pépite OU socle réseau) vs standards
      const isIncontournable = (a) => a.status === 'pepite' || a.sqClassif === 'socle';
      const aIncont = aMaintenir.filter(isIncontournable);
      const aStd = aMaintenir.filter(a => !isIncontournable(a));
      const _clsTag = (a) => {
        const c = a.abcClass || '', f = a.fmrClass || '';
        return (c && f) ? `[${c}${f}] ` : '';
      };
      const _fmt4 = (a, emp) => {
        const m = _minMax(a);
        let mm = '';
        if (m) mm = `MIN ${m.min}/MAX ${m.max}`;
        else if (a.medMinReseau != null && a.medMaxReseau != null) mm = `MIN ${Math.round(a.medMinReseau)}/MAX ${Math.round(a.medMaxReseau)} (méd)`;
        else if (a.medMaxReseau != null) mm = `MAX ${Math.round(a.medMaxReseau)} (méd)`;
        const body = mm ? ` — ${mm}` : '';
        return `☐ [${a.code}] ${_markers4(a)}${_clsTag(a)}${a.libelle}${body}${emp ? '  ' + emp.trim() : ''}`;
      };
      // Légende commune
      const _legende = `Légende : ⭐ pépite · 💤 dormant socle · ⚠ rupture · 🔧 MIN/MAX à paramétrer · [AF] = classe ABC/FMR (A=top CA, F=fréquent).\n`;
      if (aIncont.length) {
        const nbRupInc = aIncont.filter(a => a.status === 'rupture').length;
        txt += `═══ ÉTAPE 3 — INCONTOURNABLES (${aIncont.length} refs${nbRupInc ? ` · ${nbRupInc} ruptures` : ''}) — pépites + socle réseau, prio facing ═══\n`;
        txt += `⏱ Budget : ~25 min  ·  Geste : vérifier facing, MIN/MAX, traiter les ruptures en priorité.\n`;
        txt += _legende;
        _printByEmp(aIncont, _fmt4);
        txt += '\n';
      }
      if (aStd.length) {
        const nbRupStd = aStd.filter(a => a.status === 'rupture').length;
        txt += `═══ ÉTAPE 4 — STANDARDS (${aStd.length} refs · ${nbRupStd} ruptures à traiter) — vérification routine ═══\n`;
        txt += `⏱ Budget : ~30 min  ·  Geste : passage rapide, focus sur les ⚠ ruptures et 🔧 MIN/MAX manquants.\n`;
        txt += _legende;
        _printByEmp(aStd, _fmt4);
        txt += '\n';
      }
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

  if (gd && gd.metierCA.size) {
    const _distLabel = _prMetierDist ? ` (rayon ${_prMetierDist} km)` : '';

    txt += `═══ MÉTIERS CLIENTS ═══\n`;
    txt += `**Mon agence${_distLabel} — TOP métiers :**\n`;
    [...gd.metierCA.entries()].sort((a,b)=>b[1]-a[1]).slice(0,8).forEach(([m,ca]) => {
      txt += `  • ${m} : ${gd.metierCli.get(m)} clients, ${Math.round(ca)}€ CA famille\n`;
    });

    if (gd.metierLivCA.size) {
      txt += `\n**Livraisons zone${_distLabel} — TOP métiers :**\n`;
      [...gd.metierLivCA.entries()].sort((a,b)=>b[1]-a[1]).slice(0,10).forEach(([m,ca]) => {
        const caAgence = gd.metierCA.get(m) || 0;
        const captation = ca > 0 ? Math.round(caAgence / ca * 100) : 0;
        txt += `  • ${m} : ${gd.metierLivCli.get(m)} clients, ${Math.round(ca)}€ livré · captation ${captation}%${captation < 20 ? ' ⚠' : ''}\n`;
      });

      if (gd.metierArts.size) {
        const topMetsDiag = [...gd.metierLivCA.entries()].sort((a,b) => b[1] - a[1]).slice(0, 5);
        txt += `\n═══ REFS MANQUANTES PAR MÉTIER — achetées dans la zone mais absentes du rayon ═══\n`;
        txt += `Articles que ces métiers achètent via d'autres agences, à implanter pour capter la demande.\n\n`;
        for (const [met] of topMetsDiag) {
          const arts = gd.metierArts.get(met);
          if (!arts || arts.size === 0) continue;
          const sorted = [...arts.entries()].sort((a, b) => b[1].ca - a[1].ca).slice(0, 8);
          const caAg = gd.metierCA.get(met) || 0;
          const caLiv = gd.metierLivCA.get(met) || 0;
          const capt = caLiv > 0 ? Math.round(caAg / caLiv * 100) : 0;
          txt += `**${met}** (captation ${capt}%) — ${arts.size} refs manquantes :\n`;
          for (const [code, d] of sorted) {
            const libelle = _S.libelleLookup?.[code] || '';
            const mq = _S.catalogueMarques?.get(code) || '';
            txt += `  ☐ [${code}] ${libelle}${mq ? ' · ' + mq : ''} — ${Math.round(d.ca)}€ · ${d.nbCli} client${d.nbCli > 1 ? 's' : ''}\n`;
          }
          txt += '\n';
        }
      }
    }
    txt += '\n';
  }

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

// ── Pack LLM-ready ───────────────────────────────────────────────────
// Génère un bloc texte structuré : prompt merchandiseur + contexte agence
// + TOP métiers + demande réelle par métier + données rayon. Conçu pour être
// collé tel quel dans n'importe quel LLM (Gemini, Grok, ChatGPT, Claude).
const _LLM_PROMPT = `Tu es un merchandiseur expert en distribution B2B (quincaillerie pro).
Analyse le rayon ci-dessous et réponds STRICTEMENT en 7 sections :

1. **La phrase à retenir** — UNE phrase qui frappe (image mentale + diagnostic + direction)
2. **Les signaux qui crient fort** — les 2-3 chiffres qui doivent alerter, et POURQUOI
3. **Le piège mental à éviter** — le réflexe à ne PAS avoir face à ces données
4. **Ce que je vois vraiment dans les données** — pattern caché, croisements (marques × métiers × emplacements)
5. **Le plan que tu ferais** — 5 priorités concrètes max, avec geste physique + budget temps
6. **Prédiction chiffrée** — nb refs, stock, hygiène, rendement APRÈS le plan
7. **La leçon qui dépasse ce rayon** — ce que cette famille enseigne pour le reste du magasin

Règles dures :
- Si section [DEMANDE RÉELLE PAR MÉTIER] présente : c'est la donnée CLEF. Elle montre la demande totale dans la zone (toutes agences). Distingue 2 stratégies :
  1. CONSOLIDER : renforcer le rayon pour les métiers qui viennent déjà (captation >20%) — leur offrir leurs vrais besoins produits
  2. DÉVELOPPER : aller capter les métiers à 0% de captation — qu'est-ce qu'on implante pour les attirer ?
- Refuser de réimplanter ce qui sort déjà en volume (signal "rayon échantillonné")
- Parler comme un coach autour d'un café, pas comme un consultant en costume

`;

function _prBuildLLMPack(codeFam) {
  const data = _S._prData;
  if (!data) return null;
  const fam = data.families.find(f => f.codeFam === codeFam);
  if (!fam) return null;
  const ctx = _prAgenceVocationCtx();
  const lib = (c) => _S.libelleLookup?.[c] || '';
  const mark = (c) => _S.catalogueMarques?.get(c) || _S.articleMarque?.[c] || '';

  const gd = _prGatherFamData(codeFam);
  if (!gd.sqData) return null;
  const { items, patho } = gd;

  const fmtItem = (a, withScore = false) => {
    const m = mark(a.code);
    const score = withScore && a.scoreReseau ? ` score:${a.scoreReseau}` : '';
    return `  - ${a.code} ${lib(a.code)}${m ? ' · ' + m : ''}${score}`;
  };

  const topMetStr = ctx.topMetiers
    .map(m => `  - ${m.metier}: ${formatEuro(m.ca)} → ${m.segments.length ? m.segments.join('+') : '?'}`)
    .join('\n');

  let pack = _LLM_PROMPT;
  pack += `═══════════════════════════════════════════════════\n`;
  pack += `RAYON : ${fam.libFam} (${fam.codeFam})\n`;
  pack += `Agence : ${_S.selectedMyStore || '?'}\n`;
  pack += `═══════════════════════════════════════════════════\n\n`;

  pack += `[CONTEXTE AGENCE]\n`;
  pack += `TOP 5 métiers clients agence (toutes familles) :\n${topMetStr}\n`;
  pack += `Classification PRISME : ${ACTION_BADGE[fam.classifGlobal]?.label || fam.classifGlobal}\n\n`;

  pack += `[KPIs RAYON]\n`;
  pack += `- ${fam.nbEnRayon} refs en rayon · ${fam.nbCatalogue} catalogue · couverture ${fam.couverture}%\n`;
  pack += `- ${fam.nbClients} clients servis · CA agence ${formatEuro(fam.caAgence)}\n`;
  pack += `- Hygiène : ${fam.hygieneScore}% pathologique (${fam.nbDormants} dormants · ${fam.nbFin} fin · ${fam.nbRuptures} ruptures)\n`;
  pack += `- Rendement réseau : ${fam.rendement != null ? fam.rendement + ' (base 100)' : 'n/a'}\n\n`;

  if (fam.nbSchizo > 0) {
    pack += `[REFS SCHIZO — ${fam.nbSchizo} refs incontournables réseau MAIS dormantes/ruptures chez toi]\n`;
    pack += `(Signal 'rayon échantillonné' : commandées à la demande sans stock fiable → divorce de confiance client)\n`;
    for (const s of fam.schizoItems.slice(0, 15)) {
      pack += `  - ${s.code} ${s.libelle} (${s.statut}, ${s.ageJours}j, ${formatEuro(s.valeur)})\n`;
    }
    pack += `\n`;
  }

  if (patho.length) {
    pack += `[À SORTIR — ${patho.length} refs pathologiques, top 20 par € libérable]\n`;
    for (const p of patho.slice(0, 20)) {
      pack += `  - ${p.code} ${p.libelle}${p.marque ? ' · ' + p.marque : ''} (${p.statut}, ${formatEuro(p.valeurLib)})\n`;
    }
    pack += `\n`;
  }

  if (items.socle.length) {
    pack += `[INCONTOURNABLES — ${items.socle.length} refs qui marchent]\n`;
    for (const a of items.socle.slice(0, 25)) pack += fmtItem(a) + '\n';
    pack += `\n`;
  }
  if (items.implanter.length) {
    pack += `[À IMPLANTER (suggéré par PRISME) — ${items.implanter.length} refs]\n`;
    for (const a of items.implanter.slice(0, 25)) pack += fmtItem(a, true) + '\n';
    pack += `\n`;
  }
  if (items.challenger.length) {
    pack += `[CHALLENGER — ${items.challenger.length} refs en rayon mais sous-performantes]\n`;
    for (const a of items.challenger.slice(0, 15)) pack += fmtItem(a) + '\n';
    pack += `\n`;
  }

  // Emplacements observés
  if (gd.emplacements.length) {
    pack += `[EMPLACEMENTS OBSERVÉS] ${gd.emplacements.join(' · ')}\n\n`;
  }

  // Livraisons × Chalandise — demande réelle par métier dans la zone
  if (gd.metierLivCA.size) {
    pack += `[DEMANDE RÉELLE PAR MÉTIER — Livraisons zone × Chalandise]\n`;
    pack += `(= CA total livré pour les clients de la zone, toutes agences confondues. Captation = part captée par mon agence)\n`;
    [...gd.metierLivCA.entries()].sort((a,b)=>b[1]-a[1]).slice(0,12).forEach(([m,ca]) => {
      const caAg = gd.metierCA.get(m) || 0;
      const capt = ca > 0 ? Math.round(caAg / ca * 100) : 0;
      pack += `  - ${m}: ${gd.metierLivCli.get(m)} clients, ${formatEuro(ca)} livré, captation ${capt}%${capt < 20 ? ' ⚠ POTENTIEL NON CAPTÉ' : ''}\n`;
    });
    pack += `\n`;
  }

  // Refs manquantes par métier
  if (gd.metierArts.size) {
    const topMets = [...gd.metierLivCA.entries()].sort((a,b) => b[1] - a[1]).slice(0, 3);
    pack += `[REFS MANQUANTES PAR MÉTIER — achetées dans la zone mais absentes de ton rayon]\n`;
    pack += `(= articles que ces métiers achètent via d'autres agences, que tu pourrais implanter)\n`;
    for (const [met] of topMets) {
      const arts = gd.metierArts.get(met);
      if (!arts || arts.size === 0) continue;
      const sorted = [...arts.entries()].sort((a, b) => b[1].ca - a[1].ca).slice(0, 5);
      const caAg = gd.metierCA.get(met) || 0;
      const caLiv = gd.metierLivCA.get(met) || 0;
      const capt = caLiv > 0 ? Math.round(caAg / caLiv * 100) : 0;
      pack += `  ${met} (captation ${capt}%) :\n`;
      for (const [code, d] of sorted) {
        pack += `    - ${code} ${lib(code) || '?'} · ${formatEuro(d.ca)} · ${d.nbCli} client${d.nbCli > 1 ? 's' : ''}\n`;
      }
    }
    pack += `\n`;
  }

  pack += `═══════════════════════════════════════════════════\n`;
  pack += `Maintenant, applique le prompt en 7 sections.\n`;
  return pack;
}

window._prCopyForLLM = function(codeFam) {
  const txt = _prBuildLLMPack(codeFam);
  if (!txt) { alert('Données indisponibles pour ce rayon.'); return; }
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(txt).then(() => {
      const btn = document.querySelector('[onclick*="_prCopyForLLM"]');
      if (btn) {
        const orig = btn.textContent;
        btn.textContent = '✅ Pack copié !';
        setTimeout(() => { btn.textContent = orig; }, 2200);
      }
    }).catch(() => {
      const blob = new Blob([txt], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `pack-llm_${codeFam}.txt`; a.click();
      URL.revokeObjectURL(url);
    });
  }
};

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
