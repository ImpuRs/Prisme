'use strict';
import { _S } from './state.js';
import { formatEuro, escapeHtml, _copyCodeBtn, famLib } from './utils.js';
import { computeSquelette, verdictLabel, VERDICT_PLAIN_ICON } from './engine.js';
import { articleLib } from './article-store.js';
import { FAMILLE_LOOKUP, metierToSegments, METIERS_STRATEGIQUES } from './constants.js';
import { getFilteredData, buildSqLookup } from './ui.js';
import { getVentesClientMagFull, hasVentesClientMagFull, getClientArticleCAFullInMonthRange } from './sales.js';
import { renderPlanFamille } from './plan-famille.js';

// ── State local ──────────────────────────────────────────────────────
let _prFilterClassif = '';
let _prOpenFam       = null;
let _prOpenSousFam   = '';
let _prDetailTab     = 'pilotage';
let _prGridVisible   = false;
let _prSearchText    = '';
let _prMetierDist    = 0;    // 0 = Tous, sinon filtre km
const _prDistOk = (cc) => {
  if (!_prMetierDist) return true;
  const info = _S.chalandiseData?.get(cc);
  if (!info || info.distanceKm == null) return true;
  return info.distanceKm <= _prMetierDist;
};
// ── Helper : ventesParAgence filtré canal MAGASIN si toggle actif ──
let _vpmMagCache = null;
let _vpmMagCacheKey = '';
function _getVpmPlan() {
  if (!_S._planCanalMagOnly) return _S.ventesParAgence || {};
  // Projeter byCanal.MAGASIN → structure plate compatible
  const key = `${Object.keys(_S.ventesParAgence||{}).length}_mag`;
  if (_vpmMagCache && _vpmMagCacheKey === key) return _vpmMagCache;
  const vpm = _S.ventesParAgence || {};
  const out = {};
  for (const store in vpm) {
    out[store] = {};
    for (const code in vpm[store]) {
      const bc = vpm[store][code].byCanal?.MAGASIN;
      if (bc && bc.countBL > 0) {
        out[store][code] = { sumPrelevee: bc.sumPrelevee, sumCA: bc.sumCA, countBL: bc.countBL, sumVMB: bc.sumVMB, sumEnleve: 0 };
      }
    }
  }
  _vpmMagCache = out;
  _vpmMagCacheKey = key;
  return out;
}
function _invalidateVpmMagCache() { _vpmMagCache = null; _vpmMagCacheKey = ''; }

// ── Handler toggle Comptoir uniquement ──
window._onPlanCanalMagToggle = function() {
  const cb = document.getElementById('planCanalMagToggle');
  _S._planCanalMagOnly = cb?.checked || false;
  _invalidateVpmMagCache();
  const st = document.getElementById('planCanalMagStatus');
  if (st) { st.classList.toggle('hidden', !_S._planCanalMagOnly); }
  renderPlanRayon();
};

// Plage de mois Livraisons pour alignement captation (monthIdx = year*12+month)
const _prLivMonthRange = () => {
  const dMin = _S.livraisonsDateMin, dMax = _S.livraisonsDateMax;
  if (!dMin || !dMax) return null;
  return { min: dMin.getFullYear() * 12 + dMin.getMonth(), max: dMax.getFullYear() * 12 + dMax.getMonth() };
};
// CA agence par client×article filtré sur la période Livraisons (via byMonthFull)
// Retourne sumCA sur les mois couverts par Livraisons ; fallback: ventesLocalMag12MG.sumCA
const _prClientArtCA = (cc, code, range) => {
  if (range) {
    const caR = getClientArticleCAFullInMonthRange(cc, code, range);
    if (typeof caR === 'number') return caR;
  }
  // Fallback: données agrégées pleine période
  const full = getVentesClientMagFull();
  const e = full?.get(cc)?.get(code);
  if (!e) return 0;
  return (typeof e.sumCAAll === 'number') ? e.sumCAAll : (e.sumCA || 0);
};
let _prConqueteMode  = false; // true when viewing an inactive family in conquest mode
let _prTopView       = 'famille'; // 'famille' | 'metier'
let _prSelectedMetier2 = '';      // selected metier in Pilotage Métier
let _prMetierIndex   = null;      // Map<code, {caZone, monCA, nbClientsZone, inStock, ...}>
let _prMetierFamBreak = null;     // [{codeFam, libFam, caZone, monCA, ...}]
let _prMetierNbClients = 0;       // nb clients after distance filter
let _prMetierTouristes = [];      // [{cc, nom, cp, dist, caReseau, monCA, captation, nbArts}]
// ── Caches métier (pre-computed once per métier, filtered by distance) ──
let _prMetierFullCache = null;    // {perClient: Map<cc, {arts: Map<code,{ca,mon}>, caRes, monCA}>, allArts: Map<code,{caZone,monCA,clients}>, enriched: Map<code,item>}
let _prMetierAllTouristes = null; // all touristes before distance filter
let _prMetierLivres  = null;      // {clients:[], topValeur:[], topFreq:[], kit:{consommables,valeur}, totals:{nb,ca}}
let _prTouristeOpen  = '';        // cc du touriste ouvert (panier détail)
let _prMFilterFam    = '';        // filter by family in metier view
let _prMFilterStock  = '';        // '' | 'oui' | 'non'
let _prMFilterRole   = '';        // '' | 'incontournable' | ...
let _prMSort         = 'caZone';
let _prMSortAsc      = false;
let _prMPage         = 60;
let _prEmpFilter     = '';   // filtre emplacement interne Mon Rayon
let _prSelectedSFs     = new Set(); // Set<codeSousFam> sélectionnées dans Analyse
let _prSelectedMarques = new Set(); // Set<marque> sélectionnées dans Analyse
let _prSelectedEmps    = new Set(); // Set<emplacement> actifs dans Mon Rayon
let _prRoleCache = null;
let _prReseauIncontAll = [];  // tous les incontournables pour pagination
let _prReseauIncontPage = 20; // Map<code, role> — cache rôles Physigamme, invalidé au changement famille
let _prSqClassifCacheRef = null;
let _prSqClassifCacheMap = null;

// ── Cached fdMap getter — avoids rebuilding Map<code, finalDataRow> in 10+ functions ──
let _prFdMapCache = null;
let _prFdMapRef = null;
function _prGetFdMap() {
  const fd = _S.finalData;
  if (_prFdMapCache && _prFdMapRef === fd) return _prFdMapCache;
  const m = new Map();
  if (fd) for (const r of fd) m.set(r.code, r);
  _prFdMapCache = m;
  _prFdMapRef = fd;
  return m;
}

// ── Memoized: does chalandiseData contain any client with a distanceKm? ──
// Replaces `[...chalandiseData.values()].some(i => i.distanceKm != null)` — 3 call sites.
// Cached by chalandiseData reference; early-exit iteration avoids the full-Map spread.
let _prHasChalDistCache = null;
let _prHasChalDistRef = null;
function _prHasChalDist() {
  const data = _S.chalandiseData;
  if (!data) return false;
  if (_prHasChalDistRef === data) return _prHasChalDistCache;
  let found = false;
  for (const i of data.values()) { if (i.distanceKm != null) { found = true; break; } }
  _prHasChalDistRef = data;
  _prHasChalDistCache = found;
  return found;
}


function _prGetSqClassifMapCached(sqData) {
  if (!sqData) return new Map();
  if (_prSqClassifCacheRef === sqData && _prSqClassifCacheMap) return _prSqClassifCacheMap;
  const sqClassif = new Map();
  for (const d of sqData.directions) {
    for (const g of ['socle', 'implanter', 'challenger', 'surveiller']) {
      for (const a of (d[g] || [])) sqClassif.set(a.code, g);
    }
  }
  _prSqClassifCacheRef = sqData;
  _prSqClassifCacheMap = sqClassif;
  return sqClassif;
}

const ACTION_BADGE = {
  socle:      { label: 'Bien couverte',  gradient: 'linear-gradient(135deg,#16a34a,#059669)', bg: '#dcfce7', color: '#166534', icon: '🟢', dot: '#34d399', cardBg: 'rgba(52,211,153,0.04)',  cardBorder: 'rgba(52,211,153,0.22)' },
  implanter:  { label: 'À développer',   gradient: 'linear-gradient(135deg,#2563eb,#4f46e5)', bg: '#dbeafe', color: '#1e40af', icon: '🔵', dot: '#60a5fa', cardBg: 'rgba(96,165,250,0.04)',  cardBorder: 'rgba(96,165,250,0.22)' },
  challenger: { label: 'À retravailler', gradient: 'linear-gradient(135deg,#dc2626,#9f1239)', bg: '#fee2e2', color: '#991b1b', icon: '🔴', dot: '#f87171', cardBg: 'rgba(248,113,113,0.04)', cardBorder: 'rgba(248,113,113,0.22)' },
  surveiller: { label: 'À surveiller',   gradient: 'linear-gradient(135deg,#7c3aed,#6d28d9)', bg: '#f1f5f9', color: '#475569', icon: '👁️', dot: '#64748b', cardBg: 'rgba(100,116,139,0.04)', cardBorder: 'rgba(100,116,139,0.22)' },
  specialiser:   { label: 'À spécialiser',   gradient: 'linear-gradient(135deg,#0d9488,#0f766e)', bg: '#ccfbf1', color: '#115e59', icon: '🎯', dot: '#2dd4bf', cardBg: 'rgba(45,212,191,0.04)',  cardBorder: 'rgba(45,212,191,0.22)' },
  specialiste:   { label: 'Spécialiste',    gradient: 'linear-gradient(135deg,#0d9488,#0f766e)', bg: '#ccfbf1', color: '#115e59', icon: '🎯', dot: '#2dd4bf', cardBg: 'rgba(45,212,191,0.04)',  cardBorder: 'rgba(45,212,191,0.22)' },
  inactive:      { label: 'Inactive',        gradient: 'linear-gradient(135deg,#374151,#1f2937)', bg: '#1f2937', color: '#6b7280', icon: '💤', dot: '#4b5563', cardBg: 'rgba(75,85,99,0.04)',    cardBorder: 'rgba(75,85,99,0.15)' },
};


// ── Matrice verdict Squelette × Physigamme ──────────────────────────
const VERDICT_MATRIX = {
  socle: {
    incontournable: { name: 'Le Capitaine',     icon: '🏆', color: '#22c55e', tip: 'Produit star. Il performe et le réseau dit qu\'il est vital. ACTION : Zéro rupture, on le protège.' },
    nouveaute:      { name: 'La Bonne Pioche',  icon: '🆕', color: '#22c55e', tip: 'Nouveauté qui a immédiatement trouvé son public. ACTION : On valide et on observe si futur Incontournable.' },
    specialiste:    { name: 'Le Lien Fort',      icon: '🎯', color: '#22c55e', tip: 'Produit de niche qui soude tes clients strat. Son CA est secondaire, sa présence primordiale. ACTION : On maintient.' },
    standard:       { name: 'Le Bon Soldat',     icon: '⚪', color: '#94a3b8', tip: 'Fond de rayon qui tourne bien. Pas de statut particulier mais il fait son chiffre. ACTION : On maintient tant qu\'il performe.' },
  },
  surveiller: {
    incontournable: { name: "L'Alerte Rouge",   icon: '🚨', color: '#f59e0b', tip: 'Incontournable qui ralentit — risque de divorce client maximal. ACTION : Vérifier prix de vente et dernière rupture. Ne pas laisser s\'endormir.' },
    nouveaute:      { name: 'Le Stagiaire',      icon: '🔰', color: '#f59e0b', tip: 'Statut normal pour toute nouveauté. 90-120j pour faire ses preuves. ACTION : On observe avant de décider : Socle ou Challenger.' },
    specialiste:    { name: 'Le Point de Rupture', icon: '⚡', color: '#f59e0b', tip: 'Si le produit de tes clients strat. ralentit, c\'est peut-être que le client s\'en va. ACTION : On contacte le client.' },
    standard:       { name: 'Le Déclinant',      icon: '📉', color: '#94a3b8', tip: 'Il a bien marché mais son heure est peut-être passée. Se dirige vers Challenger. ACTION : Réduire stock et observer.' },
  },
  challenger: {
    incontournable: { name: 'La Réf Schizo',    icon: '💀', color: '#ef4444', tip: 'Le pire des cas. Indispensable réseau, mort chez toi = divorce de confiance. ACTION : Gel commandes. Le commercial appelle 3 clients pour comprendre le boycott (prix ? rupture historique ? concurrence ?).' },
    nouveaute:      { name: "L'Erreur de Casting", icon: '🚫', color: '#ef4444', tip: 'La nouveauté n\'a pas pris. Pas d\'acharnement thérapeutique. ACTION : On sort. Le marché a parlé.' },
    specialiste:    { name: 'La Trahison',       icon: '🗡️', color: '#ef4444', tip: 'Produit de tes clients strat. dormant. Client parti ou achète ailleurs. ACTION : Alerte commerciale immédiate. Appeler le client cible. Si divorce confirmé → sortir. Dérogation : conserver (stock=1) si seule Ancre d\'un métier clé.' },
    standard:       { name: 'Le Poids Mort',     icon: '🪨', color: '#ef4444', tip: 'Cas classique d\'un produit qui ne se vend plus. Pas d\'affect. ACTION : On sort. On libère le cash et la place.' },
  },
  implanter: {
    incontournable: { name: 'Le Trou Critique',  icon: '🕳️', color: '#3b82f6', tip: 'Priorité absolue. C\'est une autoroute de CA que tu ignores. ACTION : On implante SANS DISCUTER.' },
    nouveaute:      { name: 'Le Pari du Réseau', icon: '🎲', color: '#3b82f6', tip: 'Opportunité de capter les early adopters. ACTION : On implante si ça correspond à ta clientèle cible.' },
    specialiste:    { name: 'La Conquête', icon: '🧲', color: '#8b5cf6', tip: 'Produit pour aller chercher un client strat. ou compléter la gamme de ceux que tu as déjà. ACTION : On implante pour envoyer un signal fort.' },
    standard:       { name: "L'Opportunité Locale", icon: '📡', color: '#94a3b8', tip: 'Produit standard avec forte demande prouvée sur ta zone (données livraison). ACTION : Analyser le couple produit/métier et implanter si potentiel validé.' },
  },
  bruit: {
    incontournable: { name: 'Le Bouclier',     icon: '⛔', color: '#64748b', tip: 'Produit incontournable réseau mais signal mort chez toi ET chez les autres. Pas d\'achat. Si le siège insiste, montre cet écran.' },
    nouveaute:      { name: 'Le Bouclier',     icon: '⛔', color: '#64748b', tip: 'Nouveauté sans traction réseau. Aucune agence ne la vend. Pas d\'achat.' },
    specialiste:    { name: 'Le Bouclier',     icon: '⛔', color: '#64748b', tip: 'Produit de niche sans marché local ni réseau. Pas d\'achat.' },
    standard:       { name: 'Le Bouclier',     icon: '⛔', color: '#64748b', tip: 'Aucun signal de vente — ni chez toi, ni sur ta zone, ni en réseau. Verdict : ne pas acheter. Si le siège pousse cette réf, montre cet écran.' },
  },
};
const _ANCRE_METIER = { name: 'Ancre Métier', icon: '🎯', color: '#8b5cf6', tip: 'Trahison pardonnée — dernier lien avec un métier clé. Stock de survie 1/1.' };
// Affichage : libellé en clair (9 gestes) — `name` reste le verdict interne (packs IA, tris).
for (const e of [...Object.values(VERDICT_MATRIX).flatMap(Object.values), _ANCRE_METIER]) {
  e.label = verdictLabel(e.name) || e.name;
  e.icon = VERDICT_PLAIN_ICON[e.label] || e.icon;
}

function _prVerdict(classif, role, code) {
  // Bouclier Squelette : si le moteur central a muté ce verdict, priorité absolue
  // et son rôle fait foi pour les articles en catalogue (même verdict que La partie / Articles).
  if (code) {
    const fd = _prGetFdMap().get(code);
    if (fd?._sqVerdict === 'Ancre Métier') return _ANCRE_METIER;
    if (fd?._sqRole && fd._sqClassif === classif) role = fd._sqRole;
  }
  return VERDICT_MATRIX[classif]?.[role] || { name: '—', icon: '', color: '#94a3b8', tip: '' };
}


// ── Calcul rôles Physigamme (partagé Squelette + Physigamme + LLM) ──
function _prComputeRoles(codeFam) {
  const vpm = _getVpmPlan();
  const myStore = _S.selectedMyStore;
  const catFam = _S.catalogueFamille;
  const stores = Object.keys(vpm).filter(s => s !== myStore);
  const nbStores = stores.length || 1;
  const fdMap = _prGetFdMap();

  // Tous les codes de la famille
  const allCodes = new Set();
  const matchFam = (code) => {
    const cf = catFam?.get(code);
    return cf ? cf.codeFam === codeFam : (_S.articleFamille?.[code] || '') === codeFam;
  };
  for (const r of (_S.finalData || [])) { if (matchFam(r.code)) allCodes.add(r.code); }
  for (const arts of Object.values(vpm)) { for (const code of Object.keys(arts)) { if (matchFam(code)) allCodes.add(code); } }

  const roles = new Map(); // code → role
  const bySF = new Map();

  // Index inversé hors-magasin : code → Set<cc> (construit une seule fois)
  const hmBuyers = new Map();
  const vchm = _S.ventesLocalHorsMag;
  if (vchm) {
    for (const [cc, artMap] of vchm) {
      for (const code of artMap.keys()) {
        if (!allCodes.has(code)) continue;
        let s = hmBuyers.get(code);
        if (!s) { s = new Set(); hmBuyers.set(code, s); }
        s.add(cc);
      }
    }
  }

  // Pré-index clients réseau par article (toutes agences consommé)
  const _cliResMap = new Map(); // code → nb clients distincts réseau
  const _vrAll = _S.ventesReseauTousCanaux;
  if (_vrAll?.size) {
    const _sets = new Map();
    for (const [cc, artMap] of _vrAll) {
      for (const [code, d] of artMap) {
        if (!allCodes.has(code) || (d.sumCA || 0) <= 0) continue;
        let s = _sets.get(code);
        if (!s) { s = new Set(); _sets.set(code, s); }
        s.add(cc);
      }
    }
    for (const [code, s] of _sets) _cliResMap.set(code, s.size);
  }

  for (const code of allCodes) {
    const fd = fdMap.get(code);
    const sf = catFam?.get(code);
    let nbSt = 0;
    for (const s of stores) { if (vpm[s]?.[code]?.countBL > 0) nbSt++; }
    const detention = nbSt / nbStores;
    const W = fd?.W || (vpm[myStore]?.[code]?.countBL || 0);
    const nbCliReseau = _cliResMap.get(code) || 0;

    // Clients métiers stratégiques — comptoir + livraisons
    const allBuyers = new Set();
    const buyersMag = _S.articleClients?.get(code);
    if (buyersMag) for (const cc of buyersMag) allBuyers.add(cc);
    const hmSet = hmBuyers.get(code);
    if (hmSet) for (const cc of hmSet) allBuyers.add(cc);
    let nbCli = 0, nbCliMetierStrat = 0;
    if (allBuyers.size && _S.chalandiseData?.size) {
      for (const cc of allBuyers) {
        nbCli++;
        const metier = (_S.chalandiseData.get(cc)?.metier || '').toLowerCase();
        if (metier && METIERS_STRATEGIQUES.some(m => metier.includes(m))) nbCliMetierStrat++;
      }
    }

    let role = 'standard';
    // Priorité : le comportement d'achat écrase l'âge du produit
    if ((detention >= 0.6 || (fd?.abcClass === 'A' && W >= 12)) && nbCliReseau >= 3) role = 'incontournable';
    else if (nbCli >= 2 && nbCliMetierStrat / nbCli >= 0.5) role = 'specialiste';
    else if (fd?.isNouveaute) role = 'nouveaute';

    // Fix : un article référencé avec 0 vente locale mais de la demande réseau/zone
    const _isRef = (fd?.stockActuel || 0) > 0 || !!(fd?.emplacement) || (fd?.ancienMin || 0) > 0 || !!fd?._vitesseReseau;
    if ((role === 'standard' || role === 'nouveaute') && W === 0 && _isRef) {
      if (detention >= 0.5 && nbCliReseau >= 3) role = 'incontournable';
      else if (nbCli >= 1) role = 'specialiste';
    }

    roles.set(code, role);
    const sfName = sf?.sousFam || '';
    const prix = fd?.prixUnitaire || 0;
    if (sfName && prix > 0) { if (!bySF.has(sfName)) bySF.set(sfName, []); bySF.get(sfName).push({ code, role, detention, prix }); }
  }

  return roles;
}

/** Retourne le rôle Physigamme d'un article (avec cache par famille) */
function _prGetRole(code, codeFam) {
  if (!_prRoleCache || _prRoleCache._fam !== codeFam) {
    _prRoleCache = _prComputeRoles(codeFam);
    _prRoleCache._fam = codeFam;
  }
  return _prRoleCache.get(code) || 'standard';
}

/** Badge HTML compact pour le rôle */

/** Retourne {classif, role, verdict} pour un article donné — utilisé par commerce.js top articles */
window._getArticleSqInfo = function(code) {
  const sqData = _S._prSqData || computeSquelette();
  _S._prSqData = sqData;
  const sqMap = _prGetSqClassifMapCached(sqData);
  const classif = sqMap.get(code);
  if (!classif) return null;
  const codeFam = _S.catalogueFamille?.get(code)?.codeFam || _S.articleFamille?.[code] || '';
  const role = codeFam ? _prGetRole(code, codeFam) : 'standard';
  const verdict = _prVerdict(classif, role, code);
  return { classif, role, verdict };
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
  const vca = getVentesClientMagFull();
  const vcm = _S.ventesLocalHorsMag;
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
// ── computePlanStock ─────────────────────────────────────────────────
let _prPlanCache = null;
let _prPlanCacheKey = '';
function computePlanStock() {
  // Filtres structurels uniquement — PAS l'emplacement ni l'âge
  const fam_f  = (document.getElementById('filterFamille')?.value || '').trim().toLowerCase();
  const abc_f  = document.getElementById('filterABC')?.value || '';
  const fmr_f  = document.getElementById('filterFMR')?.value || '';
  const stat_f = document.getElementById('filterStatut')?.value || '';

  const _cacheKey = `${fam_f}|${abc_f}|${fmr_f}|${stat_f}|${_S.finalData?.length||0}|${_S.selectedMyStore||''}|${_S.storesIntersection?.size||0}|${_S.ventesLocalMagPeriode?.size||0}|${_S.benchLists?.obsFamiliesLose?.length||0}`;
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

  const sqData = _S._prSqData || computeSquelette();
  if (!sqData) return null;
  _S._prSqData = sqData;

  const catFam = _S.catalogueFamille;
  const catCount = new Map();
  if (catFam) for (const [, f] of catFam) {
    if (f.codeFam) catCount.set(f.codeFam, (catCount.get(f.codeFam) || 0) + 1);
  }

  const _famInfoCache = new Map();
  const getFamInfo = (code) => {
    if (_famInfoCache.has(code)) return _famInfoCache.get(code);
    let result = null;
    const cf = catFam?.get(code);
    if (cf?.codeFam) result = { codeFam: cf.codeFam, libFam: cf.libFam || cf.codeFam };
    else {
      const fam = _S.articleFamille?.[code];
      if (fam) {
        const codeFam = fam.length > 3 ? fam.slice(0, 3) : fam;
        result = { codeFam, libFam: FAMILLE_LOOKUP[codeFam.slice(0, 2)] || codeFam };
      }
    }
    _famInfoCache.set(code, result);
    return result;
  };

  const famMap = new Map();
  const _ensure = (codeFam, libFam) => {
    if (!famMap.has(codeFam)) famMap.set(codeFam, {
      codeFam, libFam,
      socle: 0, implanter: 0, challenger: 0, surveiller: 0,
      srcReseau: false, srcChalandise: false, srcHorsZone: false, srcLivraisons: false,
      caAgence: 0, caReseau: 0, nbRefsReseau: 0, rendement: null,
      nbClients: 0,
      nbCatalogue: catCount.get(codeFam) || 0,
      nbEnRayon: 0, couverture: 0, classifGlobal: 'surveiller',
      nbDormants: 0, nbRuptures: 0, nbFin: 0, hygieneScore: 0, needsCleaning: false,
      // Schizophrénie : refs dans socle/réseau ET pathologiques en agence
      _incCodes: new Set(),
      schizoItems: [], nbSchizo: 0,
      // KPIs Scanner de Rayon
      nbIncontournables: 0, nbIncontEnStock: 0,
      nbSpecialistes: 0, nbSpecEnStock: 0,
      potentielExterne: 0, // CA zone des IMPLANTER
      caZoneTotal: 0,     // CA zone TOUS articles (pour captation famille)
      caStratClients: 0, caTotalClients: 0, // pour signal spécialiste
      scoreSante: 0, perfReseau: 0, pctStrat: 0, captation: null,
      tagSpecialiste: false,
    });
    return famMap.get(codeFam);
  };

  const fdMap = _prGetFdMap();
  const vpmPlan = _getVpmPlan();
  const myStorePlan = _S.selectedMyStore;
  let nbStoresPlan = 0;
  for (const s in vpmPlan) if (s !== myStorePlan) nbStoresPlan++;
  if (!nbStoresPlan) nbStoresPlan = 1;

  // Pré-calcule Set<cc> des clients "métier stratégique" (utilisé par _getRole + boucle clients)
  const stratClients = new Set();
  if (_S.chalandiseData?.size) {
    for (const [cc, info] of _S.chalandiseData) {
      const metier = (info?.metier || '').toLowerCase();
      if (!metier) continue;
      for (let i = 0; i < METIERS_STRATEGIQUES.length; i++) {
        if (metier.includes(METIERS_STRATEGIQUES[i])) { stratClients.add(cc); break; }
      }
    }
  }

  // Pré-index : nbClients réseau par code article (une seule passe O(clients×articles))
  // ventesReseauTousCanaux = Map<cc, Map<code, {sumCA, countBL}>>
  const _nbCliReseauByCode = new Map();
  const _vr2g = _S.ventesReseauTousCanaux;
  if (_vr2g?.size) {
    for (const [, artMap] of _vr2g) {
      for (const [code2, d2] of artMap) {
        if ((d2.sumCA || 0) > 0) _nbCliReseauByCode.set(code2, (_nbCliReseauByCode.get(code2) || 0) + 1);
      }
    }
  }

  // Rôle Physigamme par code — priorité au bouclier (fd._sqRole), fallback léger pour codes hors finalData
  const _roleCache = new Map();
  const _getRole = (a) => {
    const code = a?.code;
    if (!code) return 'standard';
    const fd = fdMap.get(code);
    if (fd?._sqRole) return fd._sqRole;
    const cached = _roleCache.get(code);
    if (cached) return cached;

    const nbSt = a.nbAgencesReseau || 0;
    const detention = nbSt / nbStoresPlan;
    const W = fd?.W || vpmPlan?.[myStorePlan]?.[code]?.countBL || 0;

    let role = 'standard';
    // Priorité : le comportement d'achat écrase l'âge du produit
    const buyersMag = _S.articleClients?.get(code);
    let nbCli = 0, nbCliMetierStrat = 0;
    if (buyersMag?.size) {
      for (const cc of buyersMag) {
        nbCli++;
        if (stratClients.has(cc)) nbCliMetierStrat++;
      }
    }
    // Clients réseau pour ce code (pré-indexé)
    const _nbCliRes2 = _nbCliReseauByCode.get(code) || 0;
    if ((detention >= 0.6 || (fd?.abcClass === 'A' && W >= 12)) && _nbCliRes2 >= 3) role = 'incontournable';
    else if (nbCli >= 2 && (nbCliMetierStrat / nbCli) >= 0.5) role = 'specialiste';
    else if (fd?.isNouveaute) role = 'nouveaute';
    const _isRef = (fd?.stockActuel || 0) > 0 || !!(fd?.emplacement) || (fd?.ancienMin || 0) > 0 || !!fd?._vitesseReseau;
    if ((role === 'standard' || role === 'nouveaute') && W === 0 && _isRef) {
      if (detention >= 0.5 && _nbCliRes2 >= 3) role = 'incontournable';
      else if (nbCli >= 1) role = 'specialiste';
    }

    _roleCache.set(code, role);
    return role;
  };

  const CLASSIFS = ['socle', 'implanter', 'challenger', 'surveiller'];
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
            f.caAgence += +(a.caAgence || 0);
            if ((a.caReseau || 0) > 0) { f.caReseau += +(a.caReseau); f.nbRefsReseau++; }
            if (a.enStock) f.nbEnRayon++;
          }
          if (g === 'socle' || g === 'implanter') {
            f._incCodes.add(a.code);
          }
          // KPIs Scanner : incontournables (Capitaine + Sergent) + potentiel externe
          const role = _getRole(a);
          if (role === 'incontournable') {
            f.nbIncontournables++;
            if (a.enStock) f.nbIncontEnStock++;
          }
          if (role === 'specialiste') {
            f.nbSpecialistes++;
            if (a.enStock) f.nbSpecEnStock++;
          }
          // CA Zone : potentiel externe (IMPLANTER only) + total famille (tous)
          f.caZoneTotal += +(a.caClientsZone || 0);
          if (g === 'implanter') {
            f.potentielExterne += +(a.caClientsZone || 0);
          }
        }
      }
    }
  }

  // nbClients + signal spécialiste (CA clients métiers strat vs CA total)
  const seenClientsByFam = new Map(); // codeFam → Set<cc>
  const caByFamClient = new Map(); // codeFam → { total, strat }
  const vcaFull = getVentesClientMagFull();
  if (vcaFull) {
    for (const [cc, artMap] of vcaFull) {
      const isStrat = stratClients.has(cc);
      for (const [code, data] of artMap) {
        if (!filteredCodes.has(code)) continue;
        const fi = getFamInfo(code);
        if (!fi) continue;
        const codeFam = fi.codeFam;
        if (!famMap.has(codeFam)) continue;
        let s = seenClientsByFam.get(codeFam);
        if (!s) { s = new Set(); seenClientsByFam.set(codeFam, s); }
        s.add(cc);
        let entry = caByFamClient.get(codeFam);
        if (!entry) { entry = { total: 0, strat: 0 }; caByFamClient.set(codeFam, entry); }
        const numCA = +(data.sumCA || data.sumCAAll || 0);
        entry.total += numCA;
        if (isStrat) entry.strat += numCA;
      }
    }
  }
  if (_S.ventesLocalHorsMag) {
    for (const [cc, artMap] of _S.ventesLocalHorsMag) {
      const isStrat = stratClients.has(cc);
      for (const [code, data] of artMap) {
        if (!filteredCodes.has(code)) continue;
        const fi = getFamInfo(code);
        if (!fi) continue;
        const codeFam = fi.codeFam;
        if (!famMap.has(codeFam)) continue;
        let s = seenClientsByFam.get(codeFam);
        if (!s) { s = new Set(); seenClientsByFam.set(codeFam, s); }
        s.add(cc);
        let entry = caByFamClient.get(codeFam);
        if (!entry) { entry = { total: 0, strat: 0 }; caByFamClient.set(codeFam, entry); }
        const numCA = +(data.sumCA || 0);
        entry.total += numCA;
        if (isStrat) entry.strat += numCA;
      }
    }
  }
  for (const [codeFam, clientsSet] of seenClientsByFam) {
    const f = famMap.get(codeFam);
    if (f) f.nbClients = clientsSet.size;
  }
  for (const [codeFam, entry] of caByFamClient) {
    const f = famMap.get(codeFam);
    if (f) { f.caStratClients = entry.strat; f.caTotalClients = entry.total; }
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
    // ── Scanner de Rayon : 3 KPIs + signal spécialiste ──
    // 1. Score de Santé Interne V2 (0-100)
    //    = (détention Incont. % × 50 + (100 - patho%) × 30 + détention Spé. % × 20) / 100
    const pctIncEnStock = f.nbIncontournables > 0
      ? (f.nbIncontEnStock / f.nbIncontournables) * 100 : 100;
    const total = f.socle + f.implanter + f.challenger + f.surveiller;
    const nbEnStockTotal = f.nbEnRayon || 1;
    const pctPatho = Math.min((f.nbDormants / nbEnStockTotal) * 100, 100);
    const pctSpecEnStock = f.nbSpecialistes > 0
      ? (f.nbSpecEnStock / f.nbSpecialistes) * 100 : 100;
    f.scoreSante = Math.round(
      (pctIncEnStock * 50 + (100 - pctPatho) * 30 + pctSpecEnStock * 20) / 100
    );

    // 2. Indice Performance Réseau (100 = médiane)
    f.perfReseau = f.rendement || 0;

    // 3. Potentiel Externe déjà calculé (somme CA Zone des IMPLANTER)

    // 4. Signal spécialiste : % CA porté par clients métiers stratégiques
    f.pctStrat = f.caTotalClients > 0
      ? Math.round(f.caStratClients / f.caTotalClients * 100) : 0;

    // ── Captation famille = CA Magasin / CA Zone Total ──
    f.captation = f.caZoneTotal > 0 ? Math.round((f.caAgence || 0) / f.caZoneTotal * 100) : null;

    // ── Classification Scanner (cascade exclusive) ──
    const hasBench = f.rendement != null && f.rendement > 0;

    // 0. INACTIVE : CA < 500€ ET refs actives < 5 → hors scanner
    if (f.caAgence < 500 && f.nbEnRayon < 5)
      f.classifGlobal = 'inactive';
    // 1. À retravailler (ROUGE) : santé < 50 OU sous-perf réseau < 80
    else if (f.scoreSante < 50 || (hasBench && f.perfReseau < 80))
      f.classifGlobal = 'challenger';    // À retravailler
    // 2. Bien couverte (VERT) : santé ≥ 80 ET perf réseau au-dessus médiane (ou pas de bench)
    //    Garde-fou : au moins 1 article socle ET du CA — sinon score artificiellement gonflé
    else if (f.scoreSante >= 80 && f.socle > 0 && f.caAgence > 0 && (!hasBench || f.perfReseau > 100))
      f.classifGlobal = 'socle';         // Bien couverte
    // 3. À développer : gros potentiel externe OU captation faible sur gros marché
    else if (f.potentielExterne > 30000 || (f.captation !== null && f.captation < 10 && f.caZoneTotal > 50000))
      f.classifGlobal = 'implanter';     // À développer
    // 4. À surveiller (ORANGE) : santé 50-79, tout le reste
    else
      f.classifGlobal = 'surveiller';    // À surveiller

    // ── Tag Spécialiste (cumulable avec tout statut) ──
    f.tagSpecialiste = f.pctStrat > 30;
  }

  // ── Enrichissement réseau : écart médiane + rang agence par famille ──
  const obsLose = _S.benchLists?.obsFamiliesLose || [];
  const obsWin  = _S.benchLists?.obsFamiliesWin  || [];
  const obsIdx  = new Map();
  for (const o of [...obsLose, ...obsWin]) obsIdx.set(o.fam, o);

  // Rang agence par famille : CA par store par codeFam → classement
  const vpm = _getVpmPlan();
  const bassin = _S.selectedBenchBassin?.size > 0 ? _S.selectedBenchBassin : null;
  const stores = [...(_S.storesIntersection || [])].filter(s => !bassin || s === _S.selectedMyStore || bassin.has(s));
  const myStore = _S.selectedMyStore;
  if (stores.length > 1 && myStore) {
    // CA par store par codeFam
    const storeFamCA = new Map(); // codeFam → Map<store, ca>
    for (const store of stores) {
      const arts = vpm[store] || {};
      for (const code in arts) {
        const data = arts[code];
        if (!data || !data.sumCA) continue;
        const fi = getFamInfo(code);
        if (!fi) continue;
        const codeFam = fi.codeFam;
        if (!famMap.has(codeFam)) continue;
        let m = storeFamCA.get(codeFam);
        if (!m) { m = new Map(); storeFamCA.set(codeFam, m); }
        m.set(store, (m.get(store) || 0) + data.sumCA);
      }
    }
    for (const [codeFam, storeMap] of storeFamCA) {
      const f = famMap.get(codeFam);
      if (!f) continue;
      const sorted = [...storeMap.entries()].sort((a, b) => b[1] - a[1]);
      const myIdx = sorted.findIndex(([s]) => s === myStore);
      f.rangReseau = myIdx >= 0 ? myIdx + 1 : null;
      f.rangReseauTotal = sorted.length;
      // Médiane CA réseau calculée depuis ventesParAgence
      const cas = sorted.map(([, ca]) => ca);
      const mid = Math.floor(cas.length / 2);
      const medianCA = cas.length % 2 === 0 ? (cas[mid - 1] + cas[mid]) / 2 : cas[mid];
      const myCA = storeMap.get(myStore) || 0;
      f.ecartReseau = Math.round(myCA - medianCA);
      f.ecartReseauPct = medianCA > 0 ? Math.round((myCA - medianCA) / medianCA * 100) : 0;
    }
  }

  for (const [, f] of famMap) {
    if (!f.rangReseau) { f.rangReseau = null; f.rangReseauTotal = null; f.ecartReseau = null; f.ecartReseauPct = null; }
  }

  const allFamilies = [...famMap.values()]
    .filter(f => f.socle + f.implanter + f.challenger + f.surveiller > 0);
  const families = allFamilies
    .filter(f => f.classifGlobal !== 'inactive')
    .sort((a, b) => (b.implanter + b.challenger) - (a.implanter + a.challenger));
  const nbInactive = allFamilies.filter(f => f.classifGlobal === 'inactive').length;

  const inactiveFamilies = allFamilies
    .filter(f => f.classifGlobal === 'inactive')
    .sort((a, b) => (b.caAgence || 0) - (a.caAgence || 0));
  // Single-pass counting (replaces 5 separate .filter() calls)
  const _totals = { socle: 0, implanter: 0, challenger: 0, surveiller: 0, specialiste: 0 };
  for (const f of families) {
    if (f.classifGlobal in _totals) _totals[f.classifGlobal]++;
    if (f.tagSpecialiste) _totals.specialiste++;
  }
  const result = {
    families,
    inactiveFamilies,
    totals: { ..._totals, inactive: nbInactive }
  };
  _prPlanCache = result;
  _prPlanCacheKey = _cacheKey;
  return result;
}

// ── Source bar ───────────────────────────────────────────────────────
/** Résout le libellé d'un codeSousFam depuis le catalogue */
function _prSFLabel(csf) {
  if (!csf) return csf;
  const catFam = _S.catalogueFamille;
  if (!catFam) return csf;
  // Priorité : match dans la famille ouverte
  const openFam = _prOpenFam || '';
  for (const f of catFam.values()) {
    if (f.codeSousFam === csf && f.sousFam && f.codeFam === openFam) return f.sousFam;
  }
  // Fallback : premier match
  for (const f of catFam.values()) {
    if (f.codeSousFam === csf && f.sousFam) return f.sousFam;
  }
  return csf;
}

/** Pilules SF sélectionnées — à insérer dans chaque onglet */
function _prSFPills() {
  if (!_prSelectedSFs.size) return '';
  return `<div class="flex gap-1.5 flex-wrap mb-3 items-center">
    <span class="text-[10px] t-disabled">📂 SF :</span>
    ${[..._prSelectedSFs].map(csf => `<span class="text-[10px] px-2 py-0.5 rounded border s-panel-inner t-inverse flex items-center gap-1" style="box-shadow:0 0 0 1.5px #f59e0b">
      ${escapeHtml(_prSFLabel(csf))}
      <button onclick="window._prToggleSF('${csf.replace(/\\/g,'\\\\').replace(/'/g,"\\'")}')" class="t-disabled hover:t-primary leading-none" style="font-size:10px">✕</button>
    </span>`).join('')}
  </div>`;
}






// ── Onglet Squelette ─────────────────────────────────────────────────



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
  const hasDist = _prHasChalDist();
  const sliderHtml = hasDist ? `
    <div class="flex items-center gap-1.5 mb-4">
      <span class="text-[10px] t-disabled">📍 Distance :</span>
      ${[{v:0,l:'Tous'},{v:2,l:'2 km'},{v:5,l:'5 km'},{v:10,l:'10 km'},{v:15,l:'15 km'},{v:30,l:'30 km'}].map(d =>
        `<button onclick="window._prMetierDistChange(${d.v||100})"
          class="dist-quick-btn text-[9px] py-0.5 px-2 rounded-full border b-default s-hover t-secondary font-bold cursor-pointer"
          style="${(!_prMetierDist&&!d.v)||(_prMetierDist===d.v)?'background:var(--c-action,#8b5cf6);color:#fff;border-color:var(--c-action,#8b5cf6)':''}">${d.l}</button>`
      ).join('')}
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
  const hasFull = hasVentesClientMagFull();
  const vcaFull = getVentesClientMagFull();
  if (vcaFull) {
    for (const [cc, artMap] of vcaFull) {
      if (!_distOk(cc)) continue;
      const info   = _S.chalandiseData.get(cc);
      const metier = info?.metier || 'Non renseigné';
      let caFam = 0;
      for (const [code, v] of artMap) {
        if (!_matchFam(code)) continue;
        caFam += _livRange ? _prClientArtCA(cc, code, _livRange) : (v.sumCAAll || v.sumCA || 0);
      }
      if (caFam > 0) {
        _addToMetier(metier, cc, caFam, metierPDV, metierClientsPDV);
        // Union clients (sans re-additionner le CA)
        if (!metierClientsAll.has(metier)) metierClientsAll.set(metier, new Set());
        metierClientsAll.get(metier).add(cc);
      }
    }
  }
  // Aussi les canaux hors-MAGASIN — seulement si ventesLocalMag12MG n'existe pas
  // (Full contient déjà TOUS les canaux, évite le double-comptage)
  if (!hasFull && _S.ventesLocalHorsMag?.size) {
    for (const [cc, artMap] of _S.ventesLocalHorsMag) {
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
  return `${sliderHtml}${_prSFPills()}<div class="text-[10px] t-disabled mb-3">Mon agence = consommé tous canaux${livrLabel} · Historique complet</div><div class="overflow-x-auto">
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

  // nbCat par codeSousFam — catalogue INVARIANT (pas de filtre emplacement)
  const sfCatCount = new Map(); // codeSousFam → { nbCat, sf (libellé) }
  if (catFam) for (const [, f] of catFam) {
    if (f.codeFam !== fam.codeFam || !f.sousFam || !f.codeSousFam) continue;
    const entry = sfCatCount.get(f.codeSousFam);
    if (entry) entry.nbCat++;
    else sfCatCount.set(f.codeSousFam, { nbCat: 1, sf: f.sousFam });
  }

  // nbStock par codeSousFam — filtré sur emplacements si actif
  const sfStockCount = new Map(); // codeSousFam → nbStock
  const empList = _prSelectedEmps.size > 0 ? _prSelectedEmps : null;
  for (const r of (_S.finalData || [])) {
    const cf = catFam?.get(r.code);
    if (!cf || cf.codeFam !== fam.codeFam || !cf.codeSousFam) continue;
    if (empList && !empList.has(r.emplacement || '')) continue;
    if ((r.stockActuel || 0) > 0)
      sfStockCount.set(cf.codeSousFam, (sfStockCount.get(cf.codeSousFam) || 0) + 1);
  }

  // Liste finale : toutes les SFs du catalogue, triées par nbCat desc
  const sfSorted = [...sfCatCount.entries()]
    .sort((a, b) => b[1].nbCat - a[1].nbCat)
    .map(([codeSousFam, { nbCat, sf }]) => ({
      sf,
      nbCat,
      nbStock: sfStockCount.get(codeSousFam) || 0,
      codeSousFam,
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

  return `${empPillsAnalyse}${_prSFPills()}${marquePills}<div class="grid grid-cols-2 gap-6">
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
  if (tab === 'metiers') return _prRenderMetiers(fam);
  if (tab === 'analyse') return _prRenderAnalyse(fam);
  if (tab === 'reseau')  return _prRenderReseau(fam);
  return '';
}

// ── Onglet Réseau (pépites / boulets / incontournables) ──────────────
function _prRenderReseau(fam) {
  const famLabel = fam.libFam;

  // Filtre sous-famille / marque — même logique que Squelette et Mon Rayon
  const _matchesSF = (code) => {
    if (!_prOpenSousFam && !_prSelectedSFs.size) return true;
    const csf = _S.catalogueFamille?.get(code)?.codeSousFam || '';
    if (_prOpenSousFam && csf !== _prOpenSousFam) return false;
    if (_prSelectedSFs.size > 0 && !_prSelectedSFs.has(csf)) return false;
    return true;
  };
  const _matchesMarque = (code) => {
    if (!_prSelectedMarques.size) return true;
    return _prSelectedMarques.has(_S.catalogueMarques?.get(code) || '');
  };
  const _passFilters = (code) => _matchesSF(code) && _matchesMarque(code);

  const pepites = (_S.benchLists?.pepites || []).filter(p => p.fam === famLabel && _passFilters(p.code));
  const boulets = (_S.benchLists?.pepitesOther || []).filter(p => p.fam === famLabel && _passFilters(p.code));

  // Incontournables : articles squelette socle/implanter de cette famille
  const sqData = _S._prSqData || computeSquelette();
  _S._prSqData = sqData;
  const incontCodes = new Set();
  if (sqData) {
    for (const d of sqData.directions) {
      for (const g of ['socle', 'implanter']) {
        for (const a of (d[g] || [])) {
          const cfCat = _S.catalogueFamille?.get(a.code)?.codeFam;
          const cfArt = _S.articleFamille?.[a.code] || '';
          if (cfCat === fam.codeFam || (!cfCat && cfArt.startsWith(fam.codeFam)) || cfArt === fam.codeFam) {
            if (_passFilters(a.code)) incontCodes.add(a.code);
          }
        }
      }
    }
  }
  // Enrichir incontournables avec données réseau
  const myStore = _S.selectedMyStore;
  const _vpmInc = _getVpmPlan();
  const myV = _vpmInc[myStore] || {};
  const incont = [];
  for (const code of incontCodes) {
    const myData = myV[code];
    const myFreq = myData?.countBL || 0;
    const myCA   = myData?.sumCA || 0;
    // Médiane réseau
    const csFreqs = [];
    for (const [st, arts] of Object.entries(_vpmInc)) {
      if (st === myStore || !_S.storesIntersection?.has(st)) continue;
      if (arts[code]) csFreqs.push(arts[code].countBL || 0);
    }
    csFreqs.sort((a, b) => a - b);
    const medFreq = csFreqs.length ? csFreqs[Math.floor(csFreqs.length / 2)] : 0;
    const lib = _S.libelleLookup?.[code] || _S.catalogueDesignation?.get(code) || code;
    const shortLib = /^\d{6} - /.test(lib) ? lib.substring(9).trim() : lib;
    if (!myFreq && !medFreq && !myCA) continue; // aucune activité nulle part → pas pertinent
    incont.push({ code, lib: shortLib, myFreq, medFreq: Math.round(medFreq), myCA: Math.round(myCA) });
  }
  incont.sort((a, b) => b.myCA - a.myCA);
  _prReseauIncontAll = incont;
  _prReseauIncontPage = 20;

  const _row = (items, cols) => {
    if (!items.length) return `<tr><td colspan="${cols}" class="py-3 text-center t-disabled text-xs italic">Aucun article identifié dans cette famille.</td></tr>`;
    const _loupe = (code) => `<span class="opacity-50 hover:opacity-100 cursor-pointer" onclick="event.stopPropagation();if(window.openArticlePanel)window.openArticlePanel('${code}','planRayon')">🔍</span>`;
    return items.map(p => cols === 6
      ? `<tr class="border-b border-white/5 hover:bg-white/5">
          <td class="py-1.5 px-2 text-[11px] font-mono">${p.code} ${_loupe(p.code)}</td>
          <td class="py-1.5 px-2 text-[11px] max-w-[200px] truncate">${escapeHtml(p.lib)}</td>
          <td class="py-1.5 px-2 text-[11px] text-right">${p.myFreq}</td>
          <td class="py-1.5 px-2 text-[11px] text-right">${p.compFreq ?? p.medFreq}</td>
          <td class="py-1.5 px-2 text-[11px] text-right ${(p.ecartPct != null && p.ecartPct > 0) ? 'text-green-400' : (p.ecartPct != null && p.ecartPct < 0) ? 'text-red-400' : ''}">${p.ecartPct != null ? (p.ecartPct > 0 ? '+' : '') + p.ecartPct + '%' : '—'}</td>
          <td class="py-1.5 px-2 text-[11px] text-right">${formatEuro(p.caMe ?? p.caComp ?? p.myCA)}</td>
        </tr>`
      : `<tr class="border-b border-white/5 hover:bg-white/5">
          <td class="py-1.5 px-2 text-[11px] font-mono">${p.code} ${_loupe(p.code)}</td>
          <td class="py-1.5 px-2 text-[11px] max-w-[200px] truncate">${escapeHtml(p.lib)}</td>
          <td class="py-1.5 px-2 text-[11px] text-right">${p.myFreq}</td>
          <td class="py-1.5 px-2 text-[11px] text-right">${p.medFreq}</td>
          <td class="py-1.5 px-2 text-[11px] text-right">${formatEuro(p.myCA)}</td>
        </tr>`
    ).join('');
  };

  // Marque pills (même pattern que les autres onglets)
  const marquePillsReseau = _prSelectedMarques.size > 0
    ? `<div class="flex gap-1.5 flex-wrap mb-3 items-center">
        <span class="text-[10px] t-disabled">🏷️</span>
        ${[..._prSelectedMarques].sort().map(m => `<span class="text-[10px] px-2 py-0.5 rounded border s-panel-inner t-inverse flex items-center gap-1" style="box-shadow:0 0 0 1.5px var(--c-action)">
          ${escapeHtml(m)}
          <button onclick="window._prToggleMarque('${escJs(m)}')" class="t-disabled hover:t-primary leading-none" style="font-size:10px">✕</button>
        </span>`).join('')}
      </div>`
    : '';

  return `
  ${_prSFPills()}${marquePillsReseau}
  <div class="space-y-5">
    ${pepites.length ? `
    <div>
      <h4 class="text-sm font-semibold mb-2" style="color:#22c55e">💎 Mes Pépites <span class="text-xs font-normal t-disabled">(${pepites.length} articles où je surperforme le réseau)</span></h4>
      <div class="overflow-x-auto"><table class="w-full text-left">
        <thead><tr class="text-[10px] t-disabled uppercase tracking-wide">
          <th class="pb-1 px-2">Code</th><th class="pb-1 px-2">Libellé</th>
          <th class="pb-1 px-2 text-right">Fréq moi</th><th class="pb-1 px-2 text-right">Fréq réseau</th>
          <th class="pb-1 px-2 text-right">Écart</th><th class="pb-1 px-2 text-right">CA moi</th>
        </tr></thead>
        <tbody>${_row(pepites, 6)}</tbody>
      </table></div>
    </div>` : ''}

    ${boulets.length ? `
    <div>
      <h4 class="text-sm font-semibold mb-2" style="color:#ef4444">🔥 Boulets <span class="text-xs font-normal t-disabled">(${boulets.length} articles où le réseau me surpasse)</span></h4>
      <div class="overflow-x-auto"><table class="w-full text-left">
        <thead><tr class="text-[10px] t-disabled uppercase tracking-wide">
          <th class="pb-1 px-2">Code</th><th class="pb-1 px-2">Libellé</th>
          <th class="pb-1 px-2 text-right">Fréq moi</th><th class="pb-1 px-2 text-right">Fréq réseau</th>
          <th class="pb-1 px-2 text-right">Écart</th><th class="pb-1 px-2 text-right">CA réseau</th>
        </tr></thead>
        <tbody>${_row(boulets, 6)}</tbody>
      </table></div>
    </div>` : ''}

    <div>
      <h4 class="text-sm font-semibold mb-2" style="color:#3b82f6">🏆 Incontournables réseau <span class="text-xs font-normal t-disabled">(${incont.length} articles socle/implanter de cette famille)</span></h4>
      ${incont.length ? `<div class="overflow-x-auto"><table class="w-full text-left">
        <thead><tr class="text-[10px] t-disabled uppercase tracking-wide">
          <th class="pb-1 px-2">Code</th><th class="pb-1 px-2">Libellé</th>
          <th class="pb-1 px-2 text-right">Fréq moi</th><th class="pb-1 px-2 text-right">Fréq méd. réseau</th>
          <th class="pb-1 px-2 text-right">CA moi</th>
        </tr></thead>
        <tbody id="prReseauIncontBody">${_row(incont.slice(0, 20), 5)}</tbody>
      </table></div>
      ${incont.length > 20 ? `<button id="prReseauIncontMore" onclick="window._prReseauShowMoreIncont()" class="text-[11px] t-secondary border b-light rounded px-3 py-1 mt-2 hover:t-primary cursor-pointer s-card">Voir plus (${incont.length - 20} restants)</button>` : ''}` : `<div class="py-3 text-center t-disabled text-xs italic">Aucun article socle/implanter identifié — squelette indisponible.</div>`}
    </div>

    ${(() => {
      // Étoiles Montantes : détention < 40%, CA/agence > médiane, BL/agence > médiane, pas en stock
      const _vpm = _getVpmPlan();
      const _myS = _S.selectedMyStore;
      const _sts = Object.keys(_vpm).filter(s => s !== _myS);
      const _nbSt = _sts.length;
      if (_nbSt < 2) return '';
      const _localCodes = new Set((_S.finalData || []).filter(r => (r.stockActuel || 0) > 0).map(r => r.code));
      const cands = [];
      for (const code of incontCodes) { /* incontournables déjà affichés */ }
      // Tous les articles de cette famille vendus dans le réseau
      const famCodes = new Set();
      for (const s of _sts) {
        for (const code in _vpm[s]) {
          if (!/^\d{6}$/.test(code)) continue;
          const cf = _S.catalogueFamille?.get(code)?.codeFam || _S.articleFamille?.[code] || '';
          if (cf === fam.codeFam && !_localCodes.has(code) && _passFilters(code)) famCodes.add(code);
        }
      }
      const enriched = [];
      for (const code of famCodes) {
        let nb = 0, ca = 0, bl = 0;
        for (const s of _sts) {
          const d = _vpm[s]?.[code];
          if (d && d.countBL > 0) { nb++; ca += d.sumCA || 0; bl += d.countBL || 0; }
        }
        if (nb < 2) continue;
        const det = Math.round(nb / _nbSt * 100);
        if (det >= 40) continue;
        enriched.push({ code, caAg: ca / nb, blAg: bl / nb, det, caTot: ca, blTot: bl, nb });
      }
      if (enriched.length < 3) return '';
      const sortedCA = enriched.map(a => a.caAg).sort((a, b) => a - b);
      const medCA = sortedCA[Math.floor(sortedCA.length / 2)];
      const sortedBL = enriched.map(a => a.blAg).sort((a, b) => a - b);
      const medBL = sortedBL[Math.floor(sortedBL.length / 2)];
      const stars = enriched.filter(a => a.caAg > medCA && a.blAg > medBL).sort((a, b) => b.caAg - a.caAg).slice(0, 15);
      if (!stars.length) return '';
      const _loupe = (code) => `<span class="opacity-50 hover:opacity-100 cursor-pointer" onclick="event.stopPropagation();if(window.openArticlePanel)window.openArticlePanel('${code}','planRayon')">🔍</span>`;
      const rows = stars.map(a => {
        const lib = _S.libelleLookup?.[a.code] || _S.catalogueDesignation?.get(a.code) || a.code;
        const shortLib = /^\d{6} - /.test(lib) ? lib.substring(9).trim() : lib;
        return `<tr class="border-b border-white/5 hover:bg-white/5">
          <td class="py-1.5 px-2 text-[11px] font-mono">${a.code} ${_loupe(a.code)}</td>
          <td class="py-1.5 px-2 text-[11px] max-w-[200px] truncate">${escapeHtml(shortLib)}</td>
          <td class="py-1.5 px-2 text-[11px] text-right">${a.nb}</td>
          <td class="py-1.5 px-2 text-[11px] text-right font-bold" style="color:#ff6b35">${a.det}%</td>
          <td class="py-1.5 px-2 text-[11px] text-right">${Math.round(a.blAg)}</td>
          <td class="py-1.5 px-2 text-[11px] text-right font-bold" style="color:#ff6b35">${formatEuro(Math.round(a.caAg))}</td>
        </tr>`;
      }).join('');
      return `<div>
        <h4 class="text-sm font-semibold mb-2" style="color:#ff6b35">🚀 Étoiles Montantes <span class="text-xs font-normal t-disabled">(${stars.length} articles — faible détention × fort CA × forte rotation)</span></h4>
        <div class="overflow-x-auto"><table class="w-full text-left">
          <thead><tr class="text-[10px] t-disabled uppercase tracking-wide">
            <th class="pb-1 px-2">Code</th><th class="pb-1 px-2">Libellé</th>
            <th class="pb-1 px-2 text-right">Agences</th><th class="pb-1 px-2 text-right">Détention</th>
            <th class="pb-1 px-2 text-right">BL/Ag</th><th class="pb-1 px-2 text-right">CA/Ag</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table></div>
      </div>`;
    })()}

    ${!pepites.length && !boulets.length ? '<div class="py-4 text-center t-disabled text-sm italic">Aucune pépite ni boulet identifié dans cette famille — données benchmark insuffisantes.</div>' : ''}
  </div>`;
}




// ── Rerender + search ─────────────────────────────────────────────────
function _prRerender() {
  const el = document.getElementById('planRayonBlock');
  if (!el || !_S._prData) return;
  const listEl = document.getElementById('prCompactList');
  const savedScroll = listEl ? listEl.scrollTop : 0;
  el.innerHTML = _prTopTabBar() + (_prTopView === 'metier' ? _renderPilotageMetierContent() : _prFamilleHost());
  if (_prTopView === 'famille') _prMountFamille();
  if (_prTopView === 'metier') _initPrMetierInput();
  const newListEl = document.getElementById('prCompactList');
  if (newListEl && savedScroll) newListEl.scrollTop = savedScroll;
}

function _initPrMetierInput() {
  const input = document.getElementById('prMetierInput');
  const dl = document.getElementById('prMetierDatalist');
  if (!input || !dl) return;
  const metierOpts = [];
  for (const [metier, clients] of (_S.clientsByMetier || new Map())) {
    if (!metier || metier === '-' || metier.trim() === '') continue;
    metierOpts.push({ metier, nb: clients.size, label: metier === '__NON_RENSEIGNE__' ? '⚠ Non renseigné' : metier === '__HORS_ZONE__' ? '📍 Hors chalandise' : metier });
  }
  metierOpts.sort((a, b) => {
    const aSpecial = a.metier === '__HORS_ZONE__' ? 2 : a.metier === '__NON_RENSEIGNE__' ? 1 : 0;
    const bSpecial = b.metier === '__HORS_ZONE__' ? 2 : b.metier === '__NON_RENSEIGNE__' ? 1 : 0;
    if (aSpecial !== bSpecial) return aSpecial - bSpecial;
    return b.nb - a.nb;
  });
  let timer;
  input.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      const q = (input.value || '').trim().toLowerCase();
      if (!q || q.length < 2) { dl.innerHTML = ''; return; }
      const exact = metierOpts.find(m => m.metier.toLowerCase() === q || m.label.toLowerCase() === q);
      if (exact) { dl.innerHTML = ''; window._prSelectMetier(exact.metier); return; }
      const matches = metierOpts.filter(m => m.label.toLowerCase().includes(q) || m.metier.toLowerCase().includes(q)).slice(0, 12);
      dl.innerHTML = matches.map(m => `<option value="${escapeHtml(m.metier)}" label="${escapeHtml(m.label)} (${m.nb})">`).join('');
    }, 150);
  });
  input.addEventListener('change', () => {
    const v = (input.value || '').trim();
    const match = metierOpts.find(m => m.metier === v || m.label === v);
    if (match) window._prSelectMetier(match.metier);
    else if (!v) window._prSelectMetier('');
  });
}







function _prFindFam(codeFam) {
  return _S._prData?.families.find(f => f.codeFam === codeFam)
      || _S._prData?.inactiveFamilies?.find(f => f.codeFam === codeFam);
}
function _prRerenderDetail() {
  const el = document.getElementById('prDetailContent');
  if (!el || !_S._prData || !_prOpenFam) return;
  const fam = _prFindFam(_prOpenFam);
  if (fam) el.innerHTML = _prGetTabContent(_prDetailTab, fam);
}

window._prToggleEmp = function(emp) {
  const catFam = _S.catalogueFamille;
  if (_prSelectedEmps.has(emp)) {
    _prSelectedEmps.delete(emp);
    _prSelectedSFs.clear();
    if (_prSelectedEmps.size > 0) {
      for (const r of (_S.finalData || [])) {
        const cf = catFam?.get(r.code);
        if (!cf || cf.codeFam !== _prOpenFam) continue;
        if (!_prSelectedEmps.has(r.emplacement || '')) continue;
        if (cf.codeSousFam) _prSelectedSFs.add(cf.codeSousFam);
      }
    }
  } else {
    _prSelectedEmps.add(emp);
    for (const r of (_S.finalData || [])) {
      const cf = catFam?.get(r.code);
      if (!cf || cf.codeFam !== _prOpenFam) continue;
      if ((r.emplacement || '') !== emp) continue;
      if (cf.codeSousFam) _prSelectedSFs.add(cf.codeSousFam);
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
  // Sync _prSelectedEmps depuis les SFs sélectionnées (filtrées par famille ouverte)
  _prSelectedEmps.clear();
  if (_prSelectedSFs.size > 0) {
    const catFam = _S.catalogueFamille;
    // Utiliser finalData (toujours dispo) plutôt que _prRayonData (dépend de l'onglet)
    for (const r of (_S.finalData || [])) {
      const cf = catFam?.get(r.code);
      if (!cf || cf.codeFam !== _prOpenFam) continue;
      if (_prSelectedSFs.has(cf.codeSousFam || '') && r.emplacement) _prSelectedEmps.add(r.emplacement);
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
    const catFam = _S.catalogueFamille;
    for (const r of (_S.finalData || [])) {
      const cf = catFam?.get(r.code);
      if (!cf || cf.codeFam !== _prOpenFam) continue;
      const m = _S.catalogueMarques?.get(r.code) || '';
      if (_prSelectedMarques.has(m) && r.emplacement) _prSelectedEmps.add(r.emplacement);
    }
  }
  _prRerenderDetail();
};

window._prApplyAnalyseFilter = function() {
  _prDetailTab = 'pilotage';
  const el = document.getElementById('prDetailContent');
  if (el && _S._prData && _prOpenFam) {
    const fam = _S._prData.families.find(f => f.codeFam === _prOpenFam);
    if (fam) el.innerHTML = _prGetTabContent('pilotage', fam);
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
    btn.classList.toggle('ar-chip-on', btn.dataset.prtab === tab);
  });
  const fam = _prFindFam(_prOpenFam);
  const el  = document.getElementById('prDetailContent');
  if (el && fam) el.innerHTML = _prGetTabContent(tab, fam);
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
  // Re-render Pilotage Métier if active (use fast path if cache available)
  if (_prTopView === 'metier' && _prSelectedMetier2) {
    if (_prMetierFullCache) _prApplyMetierDist();
    else _prComputeMetierIndex(_prSelectedMetier2);
    const el = document.getElementById('planRayonBlock');
    if (el) { el.innerHTML = _prTopTabBar() + _renderPilotageMetierContent(); _initPrMetierInput(); }
    return;
  }
  const el = document.getElementById('prDetailContent');
  if (!el || !_S._prData || !_prOpenFam) return;
  const fam = _prFindFam(_prOpenFam);
  if (fam) el.innerHTML = _prGetTabContent(_prDetailTab, fam);
};






window._prReseauShowMoreIncont = function() {
  _prReseauIncontPage += 20;
  const tbody = document.getElementById('prReseauIncontBody');
  const btn = document.getElementById('prReseauIncontMore');
  if (!tbody) return;
  const shown = _prReseauIncontAll.slice(0, _prReseauIncontPage);
  tbody.innerHTML = shown.map(p => `<tr class="border-b border-white/5 hover:bg-white/5">
    <td class="py-1.5 px-2 text-[11px] font-mono">${p.code} <span class="opacity-50 hover:opacity-100 cursor-pointer" onclick="event.stopPropagation();if(window.openArticlePanel)window.openArticlePanel('${p.code}','planRayon')">🔍</span></td>
    <td class="py-1.5 px-2 text-[11px] max-w-[200px] truncate">${escapeHtml(p.lib)}</td>
    <td class="py-1.5 px-2 text-[11px] text-right">${p.myFreq}</td>
    <td class="py-1.5 px-2 text-[11px] text-right">${p.medFreq}</td>
    <td class="py-1.5 px-2 text-[11px] text-right">${formatEuro(p.myCA)}</td>
  </tr>`).join('');
  const remaining = _prReseauIncontAll.length - _prReseauIncontPage;
  if (btn) {
    if (remaining <= 0) btn.style.display = 'none';
    else btn.textContent = `Voir plus (${remaining} restants)`;
  }
};









// ══════════════════════════════════════════════════════════════════════
// ── PALMARÈS RÉSEAU — Heatmap Familles × Agences ────────────────────
// ══════════════════════════════════════════════════════════════════════








// ══════════════════════════════════════════════════════════════════════
// ── PILOTAGE MÉTIER — Vue cross-famille par métier ──────────────────
// ══════════════════════════════════════════════════════════════════════

function _prTopTabBar() {
  const tab = (key, label) => `<button type="button" class="ar-chip${_prTopView === key ? ' ar-chip-on' : ''}" onclick="window._prSetTopView('${key}')" aria-pressed="${_prTopView === key}">${label}</button>`;
  return `<div class="pt-row" style="gap:8px;padding:16px 16px 0;max-width:1320px;margin:0 auto">${tab('famille', 'Par famille')}${tab('metier', 'Par métier')}</div>`;
}

// Pont vers plan-famille.js : la section « Pour creuser » réutilise les onglets historiques
// Métiers / Analyse / Réseau (contenu rempli à l'ouverture, via _prSetTab).
const _prBridge = {
  deepDive(codeFam) {
    const fam = _prFindFam(codeFam);
    if (!fam) return '';
    _prOpenFam = codeFam; _prOpenSousFam = ''; _prConqueteMode = false; _prMetierDist = 0;
    _prSelectedSFs.clear(); _prSelectedEmps.clear();
    if (!['metiers', 'analyse', 'reseau'].includes(_prDetailTab)) _prDetailTab = 'metiers';
    const hasReseau = (_S.benchLists?.pepites?.length || 0) + (_S.benchLists?.pepitesOther?.length || 0) > 0;
    const tabs = [['metiers', 'Métiers acheteurs'], ['analyse', 'Analyse de la gamme'], ...(hasReseau ? [['reseau', 'Réseau']] : [])];
    return `<div class="pt-row" style="gap:8px;flex-wrap:wrap">${tabs.map(([k, l]) =>
      `<button type="button" class="ar-chip${_prDetailTab === k ? ' ar-chip-on' : ''}" data-prtab="${k}" onclick="window._prSetTab('${k}')">${l}</button>`).join('')}</div>
      <div id="prDetailContent" class="pf-legacy"></div>`;
  },
};

function _prFamilleHost() {
  return '<div id="pfHost"></div>';
}
function _prMountFamille() {
  const host = document.getElementById('pfHost');
  if (host) renderPlanFamille(host, _prBridge);
}

window._prSetTopView = function(view) {
  _prTopView = view;
  _prRerender();
};

// ── Phase 1: Full computation (once per métier selection) ──
// Pre-computes ALL data for ALL clients of this métier, no distance filter.
// Stores results in _prMetierFullCache for fast distance re-filtering.
function _prComputeMetierFull(metier) {
  _prMetierFullCache = null;
  _prMetierAllTouristes = null;
  _prMetierLivres = null;
  const clientSetRaw = _S.clientsByMetier?.get(metier);
  if (!clientSetRaw?.size) { _prMetierNbClients = 0; _prMetierIndex = new Map(); _prMetierFamBreak = []; return; }

  // Per-client article aggregation (no distance filter)
  // perClient: Map<cc, Map<code, {ca, mon}>>  — ca = total zone CA, mon = MAGASIN CA
  const perClient = new Map();
  for (const cc of clientSetRaw) {
    const arts = new Map();
    // Source 1: ventesLocalMagPeriode (MAGASIN = monCA + caZone)
    const myArts = _S.ventesLocalMagPeriode?.get(cc);
    if (myArts) {
      for (const [code, data] of myArts) {
        if (!/^\d{6}$/.test(code)) continue;
        const ca = +(data.sumCA || 0);
        arts.set(code, { ca, mon: ca });
      }
    }
    // Source 2: ventesLocalHorsMag (hors-MAGASIN → caZone only)
    const hmArts = _S.ventesLocalHorsMag?.get(cc);
    if (hmArts) {
      for (const [code, data] of hmArts) {
        if (!/^\d{6}$/.test(code)) continue;
        const a = arts.get(code) || { ca: 0, mon: 0 };
        a.ca += +(data.sumCA || 0);
        arts.set(code, a);
      }
    }
    // Source 3: ventesReseauTousCanaux (toutes agences, tous canaux → caZone)
    const resArts = _S.ventesReseauTousCanaux?.get(cc);
    if (resArts) {
      for (const [code, data] of resArts) {
        if (!/^\d{6}$/.test(code)) continue;
        const a = arts.get(code) || { ca: 0, mon: 0 };
        // Ne pas double-compter : ventesReseauTousCanaux inclut myStore MAGASIN
        // On ajoute uniquement le delta réseau (CA réseau - CA déjà compté)
        const caRes = +(data.sumCA || 0);
        if (caRes > a.ca) {
          a.ca = caRes; // réseau est le total toutes agences
          arts.set(code, a);
        }
      }
    }
    if (arts.size) perClient.set(cc, arts);
  }

  // Source 4: ventesTerrain — index by client once (avoid O(clients × lines))
  if (_S.ventesTerrain?.length) {
    for (const l of _S.ventesTerrain) {
      if (!l.clientCode || !clientSetRaw.has(l.clientCode)) continue;
      if (!/^\d{6}$/.test(l.code)) continue;
      let arts = perClient.get(l.clientCode);
      if (!arts) { arts = new Map(); perClient.set(l.clientCode, arts); }
      if (!arts.has(l.code)) {
        arts.set(l.code, { ca: +(l.ca || 0), mon: 0 });
      }
      // If already counted from ventes sources, skip (dedup)
    }
  }

  // Pre-compute touristes for ALL clients (no distance filter)
  // Per-client réseau CA = sum of all sources
  const allTouristes = [];
  for (const cc of clientSetRaw) {
    const info = _S.chalandiseData?.get(cc);
    if (!info) continue;
    const arts = perClient.get(cc);
    let monCA = 0, caReseau = 0, nbArtsMoi = 0;
    if (arts) {
      for (const [, d] of arts) {
        caReseau += d.ca;
        monCA += d.mon;
        if (d.mon > 0) nbArtsMoi++;
      }
    }
    if (caReseau < 100) continue;
    const captation = caReseau > 0 ? Math.round(monCA / caReseau * 100) : 0;
    if (captation >= 10) continue;
    allTouristes.push({
      cc, nom: info.nom || _S.clientNomLookup?.[cc] || cc,
      cp: info.cp || '', ville: info.ville || '',
      dist: info.distanceKm ?? null,
      classification: info.classification || '',
      caReseau, monCA, captation, nbArts: nbArtsMoi,
    });
  }
  allTouristes.sort((a, b) => (a.dist ?? 999) - (b.dist ?? 999));
  _prMetierAllTouristes = allTouristes;

  // Enrich articles metadata (once, shared across distance filters)
  const catFam = _S.catalogueFamille;
  const fdMap = _prGetFdMap();
  const rolesByFam = new Map();

  // Build enriched per-article map with per-client contribution tracking
  const enriched = new Map();
  for (const [cc, arts] of perClient) {
    for (const [code, d] of arts) {
      if (!enriched.has(code)) {
        const fd = fdMap.get(code);
        const inStock = fd && (fd.stockActuel || 0) > 0;
        const cf = catFam?.get(code);
        const codeFam = cf?.codeFam || _S.articleFamille?.[code] || '';
        if (!codeFam) continue;
        const libFam = FAMILLE_LOOKUP[codeFam] || codeFam;
        if (!rolesByFam.has(codeFam)) rolesByFam.set(codeFam, _prComputeRoles(codeFam));
        const role = rolesByFam.get(codeFam)?.get(code) || 'standard';
        enriched.set(code, {
          code, libelle: articleLib(code),
          marque: _S.catalogueMarques?.get(code) || '',
          codeFam, libFam, sousFam: cf?.sousFam || '',
          inStock, stockActuel: fd?.stockActuel || 0, role,
          // Per-client contributions stored for distance re-aggregation
          _contribs: [], // [{cc, ca, mon}]
        });
      }
      const e = enriched.get(code);
      if (e) e._contribs.push({ cc, ca: d.ca, mon: d.mon });
    }
  }

  // ── Enrichir avec données réseau (articles vendus par d'autres agences, mêmes familles) ──
  const vpm = _getVpmPlan();
  const myStore = _S.selectedMyStore;

  // Enrichir articles existants avec données réseau (nb agences + CA réseau filtré métier)
  for (const [code, e] of enriched) {
    // nbAgences = combien d'agences vendent cet article (tous clients)
    let nbAg = 0;
    for (const store in vpm) {
      if (store === myStore) continue;
      const d = vpm[store]?.[code];
      if (d && d.countBL > 0) nbAg++;
    }
    e.nbAgencesReseau = nbAg;
    // caMetier = CA de cet article par les clients du MÊME MÉTIER (toutes distances)
    let caMet = 0;
    for (const c of e._contribs) caMet += c.ca;
    e.caMetier = caMet;
    // caReseau = CA toutes agences, tous clients, tous métiers
    let caRes = 0;
    for (const store in vpm) {
      if (store === myStore) continue;
      const d = vpm[store]?.[code];
      if (d && d.countBL > 0) caRes += d.sumCA || 0;
    }
    e.caReseau = caRes;
  }

  // ── Canal de Proximité: per-client canal split ──
  const clientCanal = new Map(); // cc → {caMag, caLivre, pctLivre}
  for (const cc of clientSetRaw) {
    let caMag = 0, caLivre = 0;
    const myArts = _S.ventesLocalMagPeriode?.get(cc);
    if (myArts) for (const [, d] of myArts) caMag += +(d.sumCA || 0);
    const hmArts = _S.ventesLocalHorsMag?.get(cc);
    if (hmArts) for (const [, d] of hmArts) caLivre += +(d.sumCA || 0);
    const total = caMag + caLivre;
    if (total > 100) clientCanal.set(cc, { caMag, caLivre, pctLivre: Math.round(caLivre / total * 100) });
  }

  _prMetierFullCache = { perClient, enriched, clientSetRaw, clientCanal };
  // Now apply current distance filter
  _prApplyMetierDist();
}

// ── Phase 2: Distance filtering (fast, uses cached data) ──
function _prApplyMetierDist() {
  if (!_prMetierFullCache) { _prMetierIndex = new Map(); _prMetierFamBreak = []; _prMetierNbClients = 0; return; }
  const { enriched, clientSetRaw } = _prMetierFullCache;

  // Filter clients by distance (strict mode = no clientsMagasin fallback)
  const distOk = new Set();
  for (const cc of clientSetRaw) {
    if (_prDistOk(cc)) distOk.add(cc);
  }
  _prMetierNbClients = distOk.size;

  // Re-aggregate articles from cached contributions (fast — just summing)
  const result = new Map();
  const famAgg = new Map();

  for (const [code, e] of enriched) {
    let caZone = 0, monCA = 0, nbClients = 0;
    for (const c of e._contribs) {
      if (!distOk.has(c.cc)) continue;
      caZone += c.ca;
      monCA += c.mon;
      nbClients++;
    }
    if (nbClients === 0) continue;
    const pdm = caZone > 0 ? Math.round(monCA / caZone * 100) : null;
    result.set(code, {
      code, libelle: e.libelle, marque: e.marque,
      codeFam: e.codeFam, libFam: e.libFam, sousFam: e.sousFam,
      caZone, monCA, nbClientsZone: nbClients,
      inStock: e.inStock, stockActuel: e.stockActuel,
      role: e.role, pdm,
      nbAgencesReseau: e.nbAgencesReseau || 0,
      caMetier: e.caMetier || 0,
      caReseau: e.caReseau || 0,
    });

    if (!famAgg.has(e.codeFam)) famAgg.set(e.codeFam, { codeFam: e.codeFam, libFam: e.libFam, caZone: 0, monCA: 0, nbArts: 0, nbEnStock: 0 });
    const fb = famAgg.get(e.codeFam);
    fb.caZone += caZone;
    fb.monCA += monCA;
    fb.nbArts++;
    if (e.inStock) fb.nbEnStock++;
  }

  _prMetierIndex = result;
  _prMetierFamBreak = [...famAgg.values()]
    .map(f => ({ ...f, pdm: f.caZone > 0 ? Math.round(f.monCA / f.caZone * 100) : null }))
    .sort((a, b) => b.caZone - a.caZone);

  // Filter touristes by distance (already pre-computed)
  _prMetierTouristes = (_prMetierAllTouristes || []).filter(t => distOk.has(t.cc));
  _prTouristeOpen = '';

  // ── Canal de Proximité: clients >90% livrés dans la zone ──
  const { clientCanal } = _prMetierFullCache;
  _prMetierLivres = null;
  if (clientCanal?.size) {
    const fdMap2 = _prGetFdMap();
    const livresClients = [];
    const artAgg = new Map(); // code → {ca, bl, nbCli}

    for (const [cc, canal] of clientCanal) {
      if (!distOk.has(cc)) continue;
      if (canal.pctLivre < 90) continue;
      const info = _S.chalandiseData?.get(cc);
      livresClients.push({
        cc, nom: info?.nom || _S.clientNomLookup?.[cc] || cc,
        cp: info?.cp || '', dist: info?.distanceKm ?? null,
        classification: info?.classification || '',
        caLivre: canal.caLivre, caMag: canal.caMag, pctLivre: canal.pctLivre,
      });
      // Aggregate their full article basket
      const seen = new Set();
      const addArts = (map, isMon) => {
        if (!map) return;
        for (const [code, d] of map) {
          if (!/^\d{6}$/.test(code)) continue;
          if (!artAgg.has(code)) artAgg.set(code, { ca: 0, bl: 0, nbCli: 0 });
          const a = artAgg.get(code);
          a.ca += +(d.sumCA || 0);
          a.bl += +(d.countBL || 0);
          if (!seen.has(code)) { a.nbCli++; seen.add(code); }
        }
      };
      addArts(_S.ventesLocalMagPeriode?.get(cc), true);
      addArts(_S.ventesLocalHorsMag?.get(cc), false);
    }

    if (livresClients.length) {
      // Enrich articles
      const allArts = [...artAgg.entries()].map(([code, d]) => {
        const fd = fdMap2.get(code);
        const inStock = fd && (fd.stockActuel || 0) > 0;
        return {
          code, ca: d.ca, bl: d.bl, nbCli: d.nbCli, inStock,
          libelle: articleLib(code),
          abcClass: fd?.abcClass || '', fmrClass: fd?.fmrClass || '',
          stockActuel: fd?.stockActuel || 0,
        };
      });
      // Single sort by CA (reused for topValeur + kitValeur) and single sort by BL (reused for topFreq + kitConsommables)
      // Replaces 4× full array sorts (was spread+sort each time).
      const byCa = allArts.slice().sort((a, b) => b.ca - a.ca);
      const byBl = allArts.slice().sort((a, b) => b.bl - a.bl || b.nbCli - a.nbCli);
      const topValeur = byCa.slice(0, 20);
      const topFreq   = byBl.slice(0, 20);
      // Kit Dépannage: consommables fréquents PAS en stock + valeur ABC-A PAS en stock
      const kitConsommables = [];
      for (const a of byBl) { if (!a.inStock) { kitConsommables.push(a); if (kitConsommables.length === 10) break; } }
      const kitValeur = [];
      for (const a of byCa) { if (!a.inStock) { kitValeur.push(a); if (kitValeur.length === 5) break; } }

      _prMetierLivres = {
        clients: livresClients.sort((a, b) => (a.dist ?? 999) - (b.dist ?? 999)),
        topValeur, topFreq,
        kit: { consommables: kitConsommables, valeur: kitValeur },
        totals: { nb: livresClients.length, caLivre: livresClients.reduce((s, c) => s + c.caLivre, 0) },
      };
    }
  }
}

// Backward-compatible wrapper
function _prComputeMetierIndex(metier) {
  _prComputeMetierFull(metier);
}

function _renderPilotageMetierContent() {
  if (!_S.chalandiseReady || !_S.clientsByMetier?.size) {
    return `<div class="text-center py-8 t-disabled text-[12px]">Chargez la Zone de Chalandise pour activer le Pilotage Métier.</div>`;
  }

  // Build metier options
  const metierOpts = [];
  for (const [metier, clients] of _S.clientsByMetier) {
    if (!metier || metier === '-' || metier.trim() === '') continue;
    metierOpts.push({ metier, nb: clients.size, label: metier === '__NON_RENSEIGNE__' ? '⚠ Non renseigné' : metier === '__HORS_ZONE__' ? '📍 Hors chalandise' : metier });
  }
  metierOpts.sort((a, b) => {
    const aSpecial = a.metier === '__HORS_ZONE__' ? 2 : a.metier === '__NON_RENSEIGNE__' ? 1 : 0;
    const bSpecial = b.metier === '__HORS_ZONE__' ? 2 : b.metier === '__NON_RENSEIGNE__' ? 1 : 0;
    if (aSpecial !== bSpecial) return aSpecial - bSpecial;
    return b.nb - a.nb;
  });

  const options = metierOpts.map(m =>
    `<option value="${escapeHtml(m.metier)}" ${m.metier === _prSelectedMetier2 ? 'selected' : ''}>${m.label} (${m.nb} clients)</option>`
  ).join('');

  const hasDist = _S.chalandiseReady && _prHasChalDist();
  const distBtns = hasDist ? `<div class="flex items-center gap-1.5 mt-2">
    <span class="text-[10px] t-disabled">📍 Distance :</span>
    ${[{v:0,l:'Tous'},{v:2,l:'2 km'},{v:5,l:'5 km'},{v:10,l:'10 km'},{v:15,l:'15 km'},{v:30,l:'30 km'}].map(d => {
      const active = (!_prMetierDist && !d.v) || (_prMetierDist === d.v);
      return `<button onclick="window._prMetierViewDist(${d.v})"
        class="dist-quick-btn text-[9px] py-0.5 px-2 rounded-full border b-default s-hover t-secondary font-bold cursor-pointer"
        style="${active ? 'background:var(--c-action,#8b5cf6);color:#fff;border-color:var(--c-action,#8b5cf6)' : ''}">${d.l}</button>`;
    }).join('')}
  </div>` : '';

  let html = `<div class="mb-4">
    <h3 class="font-extrabold text-sm t-primary mb-3">🎯 Pilotage Métier — Vue cross-famille</h3>
    <div class="flex flex-wrap items-center gap-2">
      <input type="text" id="prMetierInput" list="prMetierDatalist" placeholder="Tapez un métier…"
        value="${_prSelectedMetier2 ? escapeHtml(_prSelectedMetier2 === '__NON_RENSEIGNE__' ? '⚠ Non renseigné' : _prSelectedMetier2) : ''}"
        class="px-3 py-1.5 text-[12px] rounded-lg border b-default s-card t-primary focus:outline-none" style="width:260px;${_prSelectedMetier2 ? 'border-color:var(--c-action,#8b5cf6)' : ''}">
      <datalist id="prMetierDatalist"></datalist>
      ${_prSelectedMetier2 ? `<button onclick="window._prSelectMetier('')" class="text-[10px] px-2 py-1 rounded border b-light t-secondary hover:t-primary cursor-pointer">✕ Reset</button>` : ''}
    </div>
    ${distBtns}
  </div>`;

  if (!_prSelectedMetier2 || !_prMetierIndex) {
    html += `<div class="text-center py-8 t-disabled text-[12px]">Sélectionnez un métier pour voir les produits achetés dans votre zone.</div>`;
    return html;
  }

  html += `<div id="prMetierBody">${_renderMetierBody()}</div>`;
  return html;
}

function _renderMetierBody() {
  if (!_prMetierIndex?.size) {
    return `<div class="text-center py-6 t-disabled text-[12px]">Aucun article trouvé pour ce métier dans la zone.</div>`;
  }

  const articles = [..._prMetierIndex.values()];
  const famBreak = _prMetierFamBreak || [];

  // Global KPIs
  const totalCaZone = articles.reduce((s, a) => s + a.caZone, 0);
  const totalMonCA = articles.reduce((s, a) => s + a.monCA, 0);
  const globalPdm = totalCaZone > 0 ? Math.round(totalMonCA / totalCaZone * 100) : 0;
  const nbEnStock = articles.filter(a => a.inStock).length;
  const nbClients = _prMetierNbClients || 0;

  let html = `<div class="grid grid-cols-2 sm:grid-cols-5 gap-2 mb-4">
    <div class="s-card rounded-lg p-2 text-center" title="CA zone = CA tous canaux, clients zone de chalandise"><div class="text-[10px] t-disabled">CA Zone</div><div class="text-[14px] font-bold t-primary">${formatEuro(totalCaZone)}</div></div>
    <div class="s-card rounded-lg p-2 text-center" title="CA agence = canal MAGASIN, clients zone"><div class="text-[10px] t-disabled">Mon CA <span class="text-[8px]">(MAG)</span></div><div class="text-[14px] font-bold" style="color:#22c55e">${formatEuro(totalMonCA)}</div></div>
    <div class="s-card rounded-lg p-2 text-center"><div class="text-[10px] t-disabled">PdM globale</div><div class="text-[14px] font-bold" style="color:${globalPdm >= 40 ? '#22c55e' : globalPdm >= 15 ? '#f59e0b' : '#ef4444'}">${globalPdm}%</div></div>
    <div class="s-card rounded-lg p-2 text-center"><div class="text-[10px] t-disabled">Articles</div><div class="text-[14px] font-bold t-primary">${nbEnStock}<span class="text-[10px] t-disabled">/${articles.length}</span></div><div class="text-[9px] t-disabled">en stock</div></div>
    <div class="s-card rounded-lg p-2 text-center"><div class="text-[10px] t-disabled">Clients zone${_prMetierDist ? ' ≤' + _prMetierDist + 'km' : ''}</div><div class="text-[14px] font-bold t-primary">${nbClients}</div></div>
  </div>`;

  // ── Geste 2 : Kit Dépannage remonté en tête ──
  const _kit = _prMetierLivres?.kit;
  if (_kit && (_kit.consommables.length || _kit.valeur.length)) {
    html += `<div class="mb-4 p-3 rounded-xl border" style="background:linear-gradient(135deg,rgba(59,130,246,0.08),rgba(245,158,11,0.06));border-color:rgba(59,130,246,0.25)">
      <h4 class="text-[13px] font-extrabold t-primary mb-2">🔧 Kit Dépannage — Roue de Secours Premium</h4>
      <p class="text-[10px] t-disabled mb-2">Articles commandés par les clients du métier que tu n'as PAS en stock. Deviens leur plan B d'urgence.</p>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-3">`;
    if (_kit.consommables.length) {
      html += `<div class="s-card rounded-lg p-2" style="border-left:3px solid #3b82f6">
        <div class="text-[10px] font-bold mb-1" style="color:#3b82f6">JE REMPLIS — Consommables Fréquents</div>
        <table class="w-full text-[10px]"><tbody>`;
      for (const a of _kit.consommables) {
        html += `<tr class="border-b b-light">
          <td class="py-0.5 px-1 font-mono text-[9px]">${a.code}</td>
          <td class="py-0.5 px-1 truncate max-w-[150px]" title="${escapeHtml(a.libelle)}">${escapeHtml(a.libelle.slice(0, 30))}</td>
          <td class="py-0.5 px-1 text-right">${a.bl} BL</td>
          <td class="py-0.5 px-1 text-right">${a.nbCli} cli</td>
        </tr>`;
      }
      html += `</tbody></table></div>`;
    }
    if (_kit.valeur.length) {
      html += `<div class="s-card rounded-lg p-2" style="border-left:3px solid #f59e0b">
        <div class="text-[10px] font-bold mb-1" style="color:#f59e0b">JE REMPLIS — Jamais en Panne</div>
        <table class="w-full text-[10px]"><tbody>`;
      for (const a of _kit.valeur) {
        html += `<tr class="border-b b-light">
          <td class="py-0.5 px-1 font-mono text-[9px]">${a.code}</td>
          <td class="py-0.5 px-1 truncate max-w-[150px]" title="${escapeHtml(a.libelle)}">${escapeHtml(a.libelle.slice(0, 30))}</td>
          <td class="py-0.5 px-1 text-right font-bold">${formatEuro(a.ca)}</td>
          <td class="py-0.5 px-1 text-right">${a.nbCli} cli</td>
        </tr>`;
      }
      html += `</tbody></table></div>`;
    }
    html += `</div></div>`;
  }

  // ── Squelette classif map (needed by both family list and article pills) ──
  const _sqFamClassifPills = new Map();
  const _sqDP = _S._prSqData;
  if (_sqDP) {
    for (const f of (_sqDP.families || [])) _sqFamClassifPills.set(f.codeFam, f.classifGlobal);
    for (const f of (_sqDP.inactiveFamilies || [])) _sqFamClassifPills.set(f.codeFam, f.classifGlobal);
  }

  // ── Geste 3 : Split-screen Familles | Articles ──
  html += `<div class="grid grid-cols-[280px_1fr] gap-3 mb-4" style="overflow:hidden">`;

  // LEFT: Family breakdown — compact list style
  html += `<div style="max-height:480px;overflow-y:auto">`;
  if (famBreak.length) {
    html += `<div class="text-[11px] font-bold t-primary mb-2">📊 Familles — ${famBreak.length}</div>`;
    for (const f of famBreak.slice(0, 30)) {
      const active = _prMFilterFam === f.codeFam;
      const pdmColor = f.pdm == null ? '#64748b' : f.pdm >= 40 ? '#22c55e' : f.pdm >= 15 ? '#f59e0b' : '#ef4444';
      // Use ACTION_BADGE color based on family classif from squelette
      const famClassif = _sqFamClassifPills.get(f.codeFam) || 'surveiller';
      const b = ACTION_BADGE[famClassif] || ACTION_BADGE.surveiller;
      html += `<div onclick="window._prMFilterFamFn('${f.codeFam}')"
        class="px-2 py-1.5 rounded-lg cursor-pointer transition-colors text-[11px] mb-0.5 flex items-center gap-1 ${active ? 'font-bold' : 'hover:s-panel-inner'}"
        style="${active ? `background:${b.color}22;border-left:3px solid ${b.color}` : ''}">
        <span style="color:${b.color}">${b.icon}</span>
        <span class="t-primary">${escapeHtml(f.libFam)}</span>
        <span class="text-[9px]" style="color:#64748b;margin-left:4px">${f.nbEnStock}/${f.nbArts}</span>
      </div>`;
    }
  }
  html += `</div>`;

  // RIGHT: Articles (will be built below and injected)
  html += `<div style="min-width:0">`;

  // ── Bandeau KPI famille sélectionnée ──
  if (_prMFilterFam) {
    const selFam = famBreak.find(f => f.codeFam === _prMFilterFam);
    if (selFam) {
      const famClassif = _sqFamClassifPills.get(selFam.codeFam) || 'surveiller';
      const fb = ACTION_BADGE[famClassif] || ACTION_BADGE.surveiller;
      const pdmC = selFam.pdm == null ? '#64748b' : selFam.pdm >= 40 ? '#22c55e' : selFam.pdm >= 15 ? '#f59e0b' : '#ef4444';
      const monCA = articles.filter(a => a.codeFam === _prMFilterFam).reduce((s, a) => s + (a.monCA || 0), 0);
      html += `<div class="flex flex-wrap gap-2 mb-3 items-center p-2 rounded-lg" style="background:${fb.color}10;border:1px solid ${fb.color}30">
        <span class="text-[12px] font-extrabold t-primary">${fb.icon} ${escapeHtml(selFam.libFam)}</span>
        <span class="text-[10px] s-card rounded px-2 py-0.5" title="CA tous canaux, clients zone de chalandise"><span class="t-disabled">CA Zone</span> <strong class="t-primary">${formatEuro(selFam.caZone)}</strong></span>
        <span class="text-[10px] s-card rounded px-2 py-0.5" title="CA canal MAGASIN, clients zone de chalandise"><span class="t-disabled">Mon CA <span class="text-[7px]">(MAG)</span></span> <strong style="color:#22c55e">${formatEuro(monCA)}</strong></span>
        <span class="text-[10px] s-card rounded px-2 py-0.5"><span class="t-disabled">PdM</span> <strong style="color:${pdmC}">${selFam.pdm != null ? selFam.pdm + '%' : '—'}</strong></span>
        <span class="text-[10px] s-card rounded px-2 py-0.5"><span class="t-disabled">Stock</span> <strong class="t-primary">${selFam.nbEnStock}/${selFam.nbArts}</strong></span>
      </div>`;
    }
  }

  // Filters — compteurs basés sur les articles filtrés par famille si sélectionnée
  const pillSource = _prMFilterFam ? articles.filter(a => a.codeFam === _prMFilterFam) : articles;
  const ACTION_LIST = ['socle', 'implanter', 'challenger', 'surveiller'];
  const actionCounts = {};
  for (const a of pillSource) {
    const ac = _sqFamClassifPills.get(a.codeFam) || 'surveiller';
    actionCounts[ac] = (actionCounts[ac] || 0) + 1;
  }
  const stockOui = pillSource.filter(a => a.inStock).length;
  const stockNon = pillSource.length - stockOui;

  html += `<div class="flex flex-wrap gap-1.5 mb-3 items-center">`;
  // Stock filter pills
  for (const [val, label, cnt] of [['oui', '✅ En stock', stockOui], ['non', '❌ Pas en stock', stockNon]]) {
    const active = _prMFilterStock === val;
    html += `<button onclick="window._prMFilterStockFn('${val}')"
      class="text-[10px] px-2 py-0.5 rounded border cursor-pointer transition-all ${active ? 'font-bold s-panel-inner' : 'hover:t-primary s-card'}">${label} <strong>${cnt}</strong></button>`;
  }
  if (!_prMFilterFam) {
    html += `<span class="mx-1 text-[10px] t-disabled">|</span>`;
    // Action famille filter pills — only when no family selected
    for (const ac of ACTION_LIST) {
      if (!actionCounts[ac]) continue;
      const b = ACTION_BADGE[ac];
      const active = _prMFilterRole === ac;
      html += `<button onclick="window._prMFilterRoleFn('${ac}')"
        class="text-[10px] px-2 py-0.5 rounded border cursor-pointer transition-all ${active ? 'font-bold' : 'hover:t-primary'}"
        style="border-color:${b.dot}40;${active ? `background:${b.bg};color:${b.color};box-shadow:0 0 0 1px ${b.dot}` : `color:${b.color}`}">${b.icon} ${b.label} <strong>${actionCounts[ac]}</strong></button>`;
    }
  }
  html += `</div>`;

  // Filter + sort articles
  let filtered = articles;
  if (_prMFilterFam) filtered = filtered.filter(a => a.codeFam === _prMFilterFam);
  if (_prMFilterStock === 'oui') filtered = filtered.filter(a => a.inStock);
  if (_prMFilterStock === 'non') filtered = filtered.filter(a => !a.inStock);
  if (_prMFilterRole) filtered = filtered.filter(a => (_sqFamClassifPills.get(a.codeFam) || 'surveiller') === _prMFilterRole);

  const sortFns = {
    code: (a, b) => String(a.code).localeCompare(String(b.code)),
    caZone: (a, b) => b.caZone - a.caZone,
    caMetier: (a, b) => (b.caMetier || 0) - (a.caMetier || 0),
    caReseau: (a, b) => (b.caReseau || 0) - (a.caReseau || 0),
    monCA: (a, b) => b.monCA - a.monCA,
    pdm: (a, b) => (b.pdm ?? -1) - (a.pdm ?? -1),
    cliZone: (a, b) => b.nbClientsZone - a.nbClientsZone,
    stock: (a, b) => (b.stockActuel || 0) - (a.stockActuel || 0),
    reseau: (a, b) => (b.nbAgencesReseau || 0) - (a.nbAgencesReseau || 0),
  };
  const _mBaseFn = sortFns[_prMSort] || sortFns.caZone;
  const sorted = [...filtered].sort((a, b) => _prMSortAsc ? -_mBaseFn(a, b) : _mBaseFn(a, b));
  const shown = sorted.slice(0, _prMPage);

  // Sort header helper
  const th = (key, label, align = 'text-right', title = '') => {
    const active = _prMSort === key;
    return `<th class="py-1.5 px-2 ${align} cursor-pointer hover:t-primary whitespace-nowrap"
      style="color:${active ? 'var(--c-action,#8b5cf6)' : 'var(--t-secondary)'};font-weight:${active ? 700 : 500}"
      ${title ? `title="${title}"` : ''}
      onclick="window._prMSortFn('${key}')">${label}${active ? (_prMSortAsc ? ' ▲' : ' ▼') : ''}</th>`;
  };

  html += `<div class="overflow-x-auto" style="max-height:560px;overflow-y:auto">
    <table class="w-full text-[11px]">
      <thead style="position:sticky;top:0;z-index:2;background:var(--color-bg-primary,#0f172a)"><tr class="border-b b-light text-[10px]">
        ${th('code', 'Code', 'text-left')}
        <th class="py-1.5 px-2 text-left" style="color:var(--t-secondary);font-weight:500">Libellé</th>
        ${th('stock', 'Stock')}
        ${!_prMFilterFam ? `<th class="py-1.5 px-2 text-left" style="color:var(--t-secondary);font-weight:500">Famille</th>` : ''}
        ${th('caZone', 'CA Zone', 'text-right', 'CA clients du métier dans la zone (filtre distance)')}
        ${th('caMetier', 'CA Métier', 'text-right', 'CA de cet article par tous les clients du métier (toutes distances)')}
        ${th('caReseau', 'CA Réseau', 'text-right', 'CA toutes agences, tous clients, tous métiers')}
        ${th('reseau', 'Agences', 'text-right', 'Nb agences réseau vendant cet article')}
        ${th('pdm', 'PdM%', 'text-right', 'Part de marché = Mon CA ÷ CA Zone')}
        <th class="py-1.5 px-2 text-center" style="color:var(--t-secondary);font-weight:500" title="Verdict Squelette">Verdict</th>
      </tr></thead><tbody>`;

  for (const a of shown) {
    const pdmColor = a.pdm == null ? 'var(--t-disabled)' : a.pdm >= 40 ? '#22c55e' : a.pdm >= 15 ? '#f59e0b' : '#ef4444';
    const stockColor = a.inStock ? '#22c55e' : '#ef4444';
    // Geste 4 : verdict au lieu de Action
    const _sqA = window._getArticleSqInfo?.(a.code);
    let verdictCell = '<span class="t-disabled text-[9px]">—</span>';
    if (_sqA) {
      const _vc = { socle:'#22c55e', implanter:'#3b82f6', challenger:'#ef4444', surveiller:'#94a3b8' };
      const _vl = { socle:'Socle', implanter:'Implanter', challenger:'Challenger', surveiller:'Surveiller' };
      verdictCell = `<span class="text-[8px] px-1.5 py-0.5 rounded font-bold" style="background:${_vc[_sqA.classif]}20;color:${_vc[_sqA.classif]}">${_vl[_sqA.classif]}</span>`;
      if (_sqA.verdict?.name && _sqA.verdict.name !== '—') verdictCell += `<br><span class="text-[8px]" style="color:${_sqA.verdict.color}" title="${escapeHtml(_sqA.verdict.tip||'')}">${_sqA.verdict.icon} ${escapeHtml(_sqA.verdict.label || _sqA.verdict.name)}</span>`;
    }
    const _nbAg = a.nbAgencesReseau || 0;
    const _agColor = _nbAg >= 5 ? '#22c55e' : _nbAg >= 3 ? '#f59e0b' : 'var(--t-secondary)';
    html += `<tr class="border-b b-light hover:s-panel-inner transition-colors cursor-pointer" onclick="if(window.openArticlePanel)window.openArticlePanel('${a.code}','planRayon')">
      <td class="py-1 px-2 font-mono text-[10px]">${a.code} ${_copyCodeBtn(a.code)}</td>
      <td class="py-1 px-2 truncate max-w-[260px]" title="${escapeHtml(a.libelle)}">${escapeHtml(a.libelle)}</td>
      <td class="py-1 px-2 text-right" style="color:${stockColor}">${a.inStock ? a.stockActuel : '✕'}</td>
      ${!_prMFilterFam ? `<td class="py-1 px-2 text-[10px] t-secondary truncate max-w-[120px]" title="${escapeHtml(a.libFam)}">${escapeHtml(a.libFam)}</td>` : ''}
      <td class="py-1 px-2 text-right font-bold">${a.caZone ? formatEuro(a.caZone) : '—'}</td>
      <td class="py-1 px-2 text-right" style="color:#a78bfa">${a.caMetier ? formatEuro(a.caMetier) : '—'}</td>
      <td class="py-1 px-2 text-right" style="color:#3b82f6">${a.caReseau ? formatEuro(a.caReseau) : '—'}</td>
      <td class="py-1 px-2 text-right" style="color:${_agColor}">${_nbAg || '—'}</td>
      <td class="py-1 px-2 text-right font-bold" style="color:${pdmColor}">${a.pdm != null ? a.pdm + '%' : '—'}</td>
      <td class="py-1 px-2 text-center">${verdictCell}</td>
    </tr>`;
  }
  html += `</tbody></table></div>`;

  if (shown.length < sorted.length) {
    html += `<div class="text-center py-2"><button onclick="window._prMoreMetierArts()"
      class="text-[11px] t-secondary hover:t-primary cursor-pointer">▼ Voir plus (${shown.length}/${sorted.length})</button></div>`;
  }

  html += `<div class="flex gap-2 mt-2">
    <button onclick="window._prExportMetierCSV()"
      class="text-[11px] t-secondary border b-light rounded px-3 py-1 hover:t-primary cursor-pointer s-card">⬇ CSV</button>
    <span class="text-[10px] t-disabled self-center">${filtered.length} articles${_prMFilterFam || _prMFilterStock || _prMFilterRole ? ' (filtré)' : ''}</span>
  </div>`;

  // Fermer le right panel et le grid split-screen
  html += `</div></div>`;

  // ── Geste 5 : Portrait-Robot en accordéon fermé ──
  const _topV = _prMetierLivres?.topValeur;
  const _topF = _prMetierLivres?.topFreq;
  if (_topV?.length || _topF?.length) {
    html += `<details class="mt-4 border-t b-light pt-3"><summary class="text-[11px] font-bold t-primary cursor-pointer mb-2">📊 Portrait-Robot — Top 20 Valeur & Fréquence</summary>
    <div class="grid grid-cols-1 md:grid-cols-2 gap-3">`;
    if (_topV?.length) {
      html += `<div class="s-card rounded-lg p-2"><div class="text-[10px] font-bold t-secondary mb-1">💰 TOP 20 — Valeur (CA)</div><div style="max-height:320px;overflow-y:auto"><table class="w-full text-[10px]"><thead><tr class="border-b b-light"><th class="py-1 px-1 text-left" style="color:var(--t-secondary)">Article</th><th class="py-1 px-1 text-right" style="color:var(--t-secondary)">CA</th><th class="py-1 px-1 text-right" style="color:var(--t-secondary)">Cli</th><th class="py-1 px-1 text-center" style="color:var(--t-secondary)">Stock</th></tr></thead><tbody>`;
      for (const a of _topV) {
        const sb = a.inStock ? '<span style="color:#22c55e">✓</span>' : '<span style="color:#ef4444">✕</span>';
        html += `<tr class="border-b b-light"><td class="py-0.5 px-1"><span class="font-mono text-[9px]">${a.code}</span> ${escapeHtml(a.libelle.slice(0, 35))}</td><td class="py-0.5 px-1 text-right font-bold">${formatEuro(a.ca)}</td><td class="py-0.5 px-1 text-right">${a.nbCli}</td><td class="py-0.5 px-1 text-center">${sb}</td></tr>`;
      }
      html += `</tbody></table></div></div>`;
    }
    if (_topF?.length) {
      html += `<div class="s-card rounded-lg p-2"><div class="text-[10px] font-bold t-secondary mb-1">🔄 TOP 20 — Fréquence (BL)</div><div style="max-height:320px;overflow-y:auto"><table class="w-full text-[10px]"><thead><tr class="border-b b-light"><th class="py-1 px-1 text-left" style="color:var(--t-secondary)">Article</th><th class="py-1 px-1 text-right" style="color:var(--t-secondary)">BL</th><th class="py-1 px-1 text-right" style="color:var(--t-secondary)">Cli</th><th class="py-1 px-1 text-center" style="color:var(--t-secondary)">Stock</th></tr></thead><tbody>`;
      for (const a of _topF) {
        const sb = a.inStock ? '<span style="color:#22c55e">✓</span>' : '<span style="color:#ef4444">✕</span>';
        html += `<tr class="border-b b-light"><td class="py-0.5 px-1"><span class="font-mono text-[9px]">${a.code}</span> ${escapeHtml(a.libelle.slice(0, 35))}</td><td class="py-0.5 px-1 text-right font-bold">${a.bl}</td><td class="py-0.5 px-1 text-right">${a.nbCli}</td><td class="py-0.5 px-1 text-center">${sb}</td></tr>`;
      }
      html += `</tbody></table></div></div>`;
    }
    html += `</div></details>`;
  }

  return html;
}



// ── Pilotage Métier handlers ──
window._prSelectMetier = function(metier) {
  _prSelectedMetier2 = metier;
  _prMetierIndex = null;
  _prMetierFamBreak = null;
  _prMFilterFam = '';
  _prMFilterStock = '';
  _prMFilterRole = '';
  _prTouristeOpen = '';
  _prMPage = 60;
  if (metier) {
    _prComputeMetierIndex(metier);
    const el = document.getElementById('prMetierBody');
    if (el) { el.innerHTML = _renderMetierBody(); return; }
  }
  _prRerender();
};

window._prMetierViewDist = function(val) {
  _prMetierDist = val || 0;
  // Fast path: only re-filter cached data, no full recompute
  if (_prMetierFullCache) {
    _prApplyMetierDist();
  } else if (_prSelectedMetier2) {
    _prComputeMetierIndex(_prSelectedMetier2);
  }
  const el = document.getElementById('planRayonBlock');
  if (el) { el.innerHTML = _prTopTabBar() + _renderPilotageMetierContent(); _initPrMetierInput(); }
};


window._prMFilterFamFn = function(codeFam) {
  _prMFilterFam = _prMFilterFam === codeFam ? '' : codeFam;
  _prMPage = 60;
  _prRerenderMetier();
};
window._prMFilterStockFn = function(val) {
  _prMFilterStock = _prMFilterStock === val ? '' : val;
  _prMPage = 60;
  _prRerenderMetier();
};
window._prMFilterRoleFn = function(role) {
  _prMFilterRole = _prMFilterRole === role ? '' : role;
  _prMPage = 60;
  _prRerenderMetier();
};
window._prMSortFn = function(key) {
  if (_prMSort === key) _prMSortAsc = !_prMSortAsc;
  else { _prMSort = key; _prMSortAsc = false; }
  _prRerenderMetier();
};
window._prMoreMetierArts = function() {
  _prMPage += 60;
  _prRerenderMetier();
};

function _prRerenderMetier() {
  const el = document.getElementById('prMetierBody');
  if (el) {
    // Préserver l'état open/close du panneau familles + position scroll
    const detailsEl = document.getElementById('prMetierFamDetails');
    const wasOpen = detailsEl ? detailsEl.open : true;
    const scrollParent = el.closest('.overflow-y-auto') || el.closest('[class*="mainContent"]') || document.getElementById('mainContent');
    const scrollTop = scrollParent?.scrollTop || 0;
    el.innerHTML = _renderMetierBody();
    const newDetails = document.getElementById('prMetierFamDetails');
    if (newDetails && !wasOpen) newDetails.open = false;
    if (scrollParent) scrollParent.scrollTop = scrollTop;
    return;
  }
  _prRerender();
}

window._prExportMetierCSV = function() {
  if (!_prMetierIndex?.size) return;
  const articles = [..._prMetierIndex.values()].sort((a, b) => b.caZone - a.caZone);
  const rows = articles.map(a =>
    [a.code, a.libelle, a.libFam, a.sousFam, a.marque, a.caZone.toFixed(2),
     (a.caMetier || 0).toFixed(2), (a.caReseau || 0).toFixed(2),
     a.nbClientsZone, a.monCA.toFixed(2), a.pdm != null ? a.pdm : '', a.inStock ? 'Oui' : 'Non', a.role].join(';')
  );
  const csv = ['Code;Libellé;Famille;SF;Marque;CA Zone;CA Métier;CA Réseau;Cli Zone;Mon CA;PdM%;En stock;Rôle', ...rows].join('\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `pilotage-metier_${_prSelectedMetier2.replace(/[^a-zA-Z0-9]/g, '_')}.csv`; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

// ── Export ─────────────────────────────────────────────────────────────
export function renderPlanRayon() {
  const el = document.getElementById('planRayonBlock');
  if (!el) return;
  _prMetierDist = 0;
  _prEmpFilter = '';
  _prMetierFullCache = null;
  _prMetierAllTouristes = null;
  _prMetierLivres = null;
  _prFdMapCache = null;

  if (!_S.ventesParAgence || !Object.keys(_S.ventesParAgence).length || !_S.finalData?.length) {
    el.innerHTML = '<div class="text-[11px] t-disabled py-3 text-center">Chargez un Consommé + Stock pour activer le Plan de rayon.</div>';
    return;
  }

  const _t0 = performance.now();
  const data = computePlanStock();
  console.log('[PERF plan] computePlanStock', (performance.now() - _t0 | 0) + 'ms');
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
  _prDetailTab     = 'pilotage';
  _prConqueteMode  = false;
  _prGridVisible   = false;
  _prSearchText    = '';
  _S._prSqFilter   = '';
  // Reset metier view (preserve _prTopView to keep user's tab choice)
  _prSelectedMetier2 = '';
  _prMetierIndex   = null;
  _prMetierFamBreak = null;
  _prMFilterFam = ''; _prMFilterStock = ''; _prMFilterRole = '';
  _prMPage = 60;
  // _S._prSqData déjà peuplé par computePlanStock() → on garde le cache

  el.innerHTML = _prTopTabBar() + (_prTopView === 'metier' ? _renderPilotageMetierContent() : _prFamilleHost());
  if (_prTopView === 'famille') _prMountFamille();
  if (_prTopView === 'metier') _initPrMetierInput();
  // Exposer les lookups squelette pour les filtres sidebar
  buildSqLookup();
  // Peupler les checkboxes "Comparer avec" dans la sidebar Plan
  _buildPlanBenchCheckboxes();
  // Synchroniser toggle Comptoir uniquement
  const _mcb = document.getElementById('planCanalMagToggle');
  if (_mcb) _mcb.checked = !!_S._planCanalMagOnly;
  const _mst = document.getElementById('planCanalMagStatus');
  if (_mst) _mst.classList.toggle('hidden', !_S._planCanalMagOnly);
}

function _updatePlanBenchStatus(nbChecked, nbTotal) {
  const el = document.getElementById('planBenchStatus');
  if (!el) return;
  if (!nbTotal) { el.classList.add('hidden'); return; }
  el.classList.remove('hidden');
  const isFiltered = nbChecked < nbTotal;
  el.innerHTML = isFiltered
    ? `<span class="c-caution font-semibold">⚠ Médiane sur ${nbChecked}/${nbTotal} agences</span>`
    : `<span class="t-disabled">✓ Toutes les agences (${nbTotal})</span>`;
}

function _buildPlanBenchCheckboxes() {
  const container = document.getElementById('planBenchCheckboxes');
  if (!container) return;
  const stores = [...(_S.storesIntersection || [])].filter(s => s !== _S.selectedMyStore).sort();
  if (!stores.length) { container.innerHTML = '<span class="text-[10px] t-disabled">Chargez un Consommé multi-agences</span>'; _updatePlanBenchStatus(0, 0); return; }
  const selected = _S.selectedBenchBassin || new Set();
  const nbChecked = selected.size === 0 ? stores.length : [...selected].filter(s => stores.includes(s)).length;
  container.innerHTML = stores.map(s => {
    const checked = selected.size === 0 || selected.has(s) ? 'checked' : '';
    return `<label class="flex items-center gap-1.5 text-[10px] t-secondary cursor-pointer hover:t-primary">
      <input type="checkbox" value="${s}" ${checked} onchange="window._onPlanBenchChange()"> ${s}
    </label>`;
  }).join('');
  _updatePlanBenchStatus(nbChecked, stores.length);
}

window._onPlanBenchChange = function() {
  const container = document.getElementById('planBenchCheckboxes');
  if (!container) return;
  const all = container.querySelectorAll('input[type=checkbox]');
  const checked = [...all].filter(c => c.checked).map(c => c.value);
  _S.selectedBenchBassin = checked.length === all.length ? new Set() : new Set(checked);
  _updatePlanBenchStatus(checked.length, all.length);
  if (checked.length < all.length) {
    if (typeof showToast === 'function') showToast(`Plan recalculé — médiane sur ${checked.length}/${all.length} agences`, 'info');
  }
  // Recalculer le plan avec le nouveau bassin
  renderPlanRayon();
};

export const renderPlanStock = renderPlanRayon;
