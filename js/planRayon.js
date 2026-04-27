'use strict';
import { _S } from './state.js';
import { formatEuro, escapeHtml, _copyCodeBtn, famLib } from './utils.js';
import { computeSquelette, computeMonRayon, computeArticleZoneIndex } from './engine.js';
import { articleLib, articleZoneFiltered } from './article-store.js';
import { FAMILLE_LOOKUP, metierToSegments, METIERS_STRATEGIQUES } from './constants.js';
import { getFilteredData, buildSqLookup } from './ui.js';
import { getVentesClientMagFull, hasVentesClientMagFull, getClientArticleCAFullInMonthRange } from './sales.js';

// ── State local ──────────────────────────────────────────────────────
let _prFilterClassif = '';
let _prOpenFam       = null;
let _prOpenSousFam   = '';
let _prDetailTab     = 'pilotage';
let _prSearchIndex   = null;
let _prGridVisible   = false;
let _prSearchText    = '';
let _prRayonFilter   = '';   // 'pepite'|'challenger'|'dormant'|'socle'|''
let _prSqPage        = 50;     // nb articles affichés dans le Squelette
let _prSqSort        = 'reseau'; // 'agence'|'reseau'|'livraison'|'classif'
let _prSqSortAsc     = false;
let _prMetierDist    = 0;    // 0 = Tous, sinon filtre km
const _prDistOk = (cc) => {
  if (!_prMetierDist) return true;
  const info = _S.chalandiseData?.get(cc);
  if (!info || info.distanceKm == null) return true;
  return info.distanceKm <= _prMetierDist;
};
// Plage de mois Livraisons pour alignement captation (monthIdx = year*12+month)
const _prLivMonthRange = () => {
  const dMin = _S.livraisonsDateMin, dMax = _S.livraisonsDateMax;
  if (!dMin || !dMax) return null;
  return { min: dMin.getFullYear() * 12 + dMin.getMonth(), max: dMax.getFullYear() * 12 + dMax.getMonth() };
};
// CA agence par client×article filtré sur la période Livraisons (via byMonthFull)
// Retourne sumCA sur les mois couverts par Livraisons ; fallback: ventesClientMagFull.sumCA
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
let _prHighlightRef  = '';   // code article à highlighter dans Mon Rayon
let _prSelectedSFs     = new Set(); // Set<codeSousFam> sélectionnées dans Analyse
let _prSelectedMarques = new Set(); // Set<marque> sélectionnées dans Analyse
let _prSelectedEmps    = new Set(); // Set<emplacement> actifs dans Mon Rayon
const PAGE_SIZE = 20;
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

function _prGetSqDataCached() {
  const sqData = _S._prSqData || computeSquelette();
  _S._prSqData = sqData;
  return sqData;
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

// ── Constantes visuelles ─────────────────────────────────────────────
const ROLE_BADGE = {
  incontournable: { icon: '🏆', label: 'Incont.', color: '#22c55e' },
  nouveaute:      { icon: '🆕', label: 'Nouv.',   color: '#3b82f6' },
  specialiste:    { icon: '🎯', label: 'Spéc.',   color: '#8b5cf6' },
  standard:       { icon: '',   label: '',         color: '#94a3b8' },
};
const ACTION_BADGE = {
  socle:      { label: 'Bien couverte',  gradient: 'linear-gradient(135deg,#16a34a,#059669)', bg: '#dcfce7', color: '#166534', icon: '🟢', dot: '#34d399', cardBg: 'rgba(52,211,153,0.04)',  cardBorder: 'rgba(52,211,153,0.22)' },
  implanter:  { label: 'À développer',   gradient: 'linear-gradient(135deg,#2563eb,#4f46e5)', bg: '#dbeafe', color: '#1e40af', icon: '🔵', dot: '#60a5fa', cardBg: 'rgba(96,165,250,0.04)',  cardBorder: 'rgba(96,165,250,0.22)' },
  challenger: { label: 'À retravailler', gradient: 'linear-gradient(135deg,#dc2626,#9f1239)', bg: '#fee2e2', color: '#991b1b', icon: '🔴', dot: '#f87171', cardBg: 'rgba(248,113,113,0.04)', cardBorder: 'rgba(248,113,113,0.22)' },
  surveiller: { label: 'À surveiller',   gradient: 'linear-gradient(135deg,#7c3aed,#6d28d9)', bg: '#f1f5f9', color: '#475569', icon: '👁️', dot: '#64748b', cardBg: 'rgba(100,116,139,0.04)', cardBorder: 'rgba(100,116,139,0.22)' },
  specialiser:   { label: 'À spécialiser',   gradient: 'linear-gradient(135deg,#0d9488,#0f766e)', bg: '#ccfbf1', color: '#115e59', icon: '🎯', dot: '#2dd4bf', cardBg: 'rgba(45,212,191,0.04)',  cardBorder: 'rgba(45,212,191,0.22)' },
  specialiste:   { label: 'Spécialiste',    gradient: 'linear-gradient(135deg,#0d9488,#0f766e)', bg: '#ccfbf1', color: '#115e59', icon: '🎯', dot: '#2dd4bf', cardBg: 'rgba(45,212,191,0.04)',  cardBorder: 'rgba(45,212,191,0.22)' },
  inactive:      { label: 'Inactive',        gradient: 'linear-gradient(135deg,#374151,#1f2937)', bg: '#1f2937', color: '#6b7280', icon: '💤', dot: '#4b5563', cardBg: 'rgba(75,85,99,0.04)',    cardBorder: 'rgba(75,85,99,0.15)' },
};

const CLASSIF_BADGE = {
  socle:      { label: 'Socle',      bg: 'rgba(34,197,94,0.2)',   color: '#22c55e',           icon: '🟢' },
  implanter:  { label: 'Implanter',  bg: 'rgba(59,130,246,0.2)',  color: '#3b82f6',           icon: '🔵' },
  challenger: { label: 'Challenger', bg: 'rgba(239,68,68,0.2)',   color: '#ef4444',           icon: '🔴' },
  surveiller: { label: 'Surveiller', bg: 'rgba(148,163,184,0.2)', color: 'var(--t-secondary)', icon: '👁'  },
  bruit:      { label: 'Bruit',      bg: 'rgba(100,116,139,0.15)', color: '#64748b',            icon: '⛔' },
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
    specialiste:    { name: 'La Conquête / Fidélisation', icon: '🧲', color: '#8b5cf6', tip: 'Produit pour aller chercher un client strat. ou compléter la gamme de ceux que tu as déjà. ACTION : On implante pour envoyer un signal fort.' },
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

function _prVerdict(classif, role, code) {
  // Bouclier Squelette : si le moteur central a muté ce verdict, priorité absolue
  if (code) {
    const fd = _prGetFdMap().get(code);
    if (fd?._sqVerdict === 'Ancre Métier') return _ANCRE_METIER;
  }
  return VERDICT_MATRIX[classif]?.[role] || { name: '—', icon: '', color: '#94a3b8', tip: '' };
}

// Helper : détecte si un incontournable est LOCAL (ABC-A + W≥12, détention < 60%)
const _isLocalIncont = (code, roleOrMap) => {
  const role = typeof roleOrMap === 'string' ? roleOrMap : roleOrMap?.get(code);
  if (role !== 'incontournable') return false;
  const vpm = _S.ventesParMagasin || {};
  const myStore = _S.selectedMyStore;
  const myCA = vpm[myStore]?.[code]?.sumCA || 0;
  if (!myCA) return false;
  const stores = Object.keys(vpm).filter(s => s !== myStore);
  if (stores.length < 2) return false; // pas assez de données réseau pour conclure
  // Détention réseau < 60%
  let nbSt = 0;
  const otherCAs = [];
  for (const s of stores) {
    const v = vpm[s]?.[code];
    if (v?.countBL > 0) { nbSt++; otherCAs.push(v.sumCA || 0); }
  }
  if (nbSt / stores.length >= 0.6) return false; // réseau validé → pas LOCAL
  // Surperformance locale : monCA >= 2× médiane des autres agences qui le vendent
  if (!otherCAs.length) return true; // seul à le vendre → LOCAL par définition
  otherCAs.sort((a, b) => a - b);
  const mid = otherCAs.length % 2 === 0
    ? (otherCAs[otherCAs.length / 2 - 1] + otherCAs[otherCAs.length / 2]) / 2
    : otherCAs[Math.floor(otherCAs.length / 2)];
  return mid > 0 && myCA / mid >= 2.0;
};

// ── Calcul rôles Physigamme (partagé Squelette + Physigamme + LLM) ──
function _prComputeRoles(codeFam) {
  const vpm = _S.ventesParMagasin || {};
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
  const vchm = _S.ventesClientHorsMagasin;
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

  for (const code of allCodes) {
    const fd = fdMap.get(code);
    const sf = catFam?.get(code);
    let nbSt = 0;
    for (const s of stores) { if (vpm[s]?.[code]?.countBL > 0) nbSt++; }
    const detention = nbSt / nbStores;
    const W = fd?.W || (vpm[myStore]?.[code]?.countBL || 0);

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
    if (detention >= 0.6 || (fd?.abcClass === 'A' && W >= 12)) role = 'incontournable';
    else if (nbCli >= 2 && nbCliMetierStrat / nbCli >= 0.5) role = 'specialiste';
    else if (fd?.isNouveaute || (fd?.ageJours != null && fd.ageJours < 90 && nbSt >= 2)) role = 'nouveaute';

    // Fix : un article référencé avec 0 vente locale mais de la demande réseau/zone
    // n'est ni un Poids Mort ni une Erreur de Casting — le marché parle
    // Référencé = en stock, OU emplacement, OU MIN/MAX ERP, OU Vitesse Réseau
    const _isRef = (fd?.stockActuel || 0) > 0 || !!(fd?.emplacement) || (fd?.ancienMin || 0) > 0 || !!fd?._vitesseReseau;
    if ((role === 'standard' || role === 'nouveaute') && W === 0 && _isRef) {
      if (nbSt >= 3) role = 'incontournable'; // vendu dans 3+ agences → Réf Schizo
      else if (nbCli >= 1) role = 'specialiste'; // clients zone l'achètent hors PDV → Trahison
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
function _prRoleBadge(role) {
  const r = ROLE_BADGE[role];
  if (!r || !r.icon) return '';
  return `<span class="text-[8px] px-1 py-0.5 rounded" style="background:${r.color}20;color:${r.color}" title="${role}">${r.icon} ${r.label}</span>`;
}

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
// ── computePlanStock ─────────────────────────────────────────────────
let _prPlanCache = null;
let _prPlanCacheKey = '';
function computePlanStock() {
  // Filtres structurels uniquement — PAS l'emplacement ni l'âge
  const fam_f  = (document.getElementById('filterFamille')?.value || '').trim().toLowerCase();
  const abc_f  = document.getElementById('filterABC')?.value || '';
  const fmr_f  = document.getElementById('filterFMR')?.value || '';
  const stat_f = document.getElementById('filterStatut')?.value || '';

  const _cacheKey = `${fam_f}|${abc_f}|${fmr_f}|${stat_f}|${_S.finalData?.length||0}|${_S.selectedMyStore||''}|${_S.storesIntersection?.size||0}|${_S.ventesClientArticle?.size||0}|${_S.benchLists?.obsFamiliesLose?.length||0}`;
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
  const vpmPlan = _S.ventesParMagasin || {};
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
    if (detention >= 0.6 || (fd?.abcClass === 'A' && W >= 12)) role = 'incontournable';
    else if (nbCli >= 2 && (nbCliMetierStrat / nbCli) >= 0.5) role = 'specialiste';
    else if (fd?.isNouveaute || (fd?.ageJours != null && fd.ageJours < 90 && nbSt >= 2)) role = 'nouveaute';
    const _isRef = (fd?.stockActuel || 0) > 0 || !!(fd?.emplacement) || (fd?.ancienMin || 0) > 0 || !!fd?._vitesseReseau;
    if ((role === 'standard' || role === 'nouveaute') && W === 0 && _isRef) {
      if (nbSt >= 3) role = 'incontournable';
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
  if (_S.ventesClientHorsMagasin) {
    for (const [cc, artMap] of _S.ventesClientHorsMagasin) {
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
  const vpm = _S.ventesParMagasin || {};
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
      // Médiane CA réseau calculée depuis ventesParMagasin
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

function _prSourceBar(src) {
  const seg = (active, color, label, letter) =>
    `<span title="${label}" style="display:inline-flex;align-items:center;justify-content:center;width:16px;height:14px;border-radius:3px;margin-right:1px;background:${active ? color : 'rgba(148,163,184,0.12)'};color:${active ? '#fff' : 'rgba(148,163,184,0.3)'};font-size:8px;font-weight:700;letter-spacing:0">${letter}</span>`;
  const has = (key) => src instanceof Set ? src.has(key) : !!src[key];
  return `<span class="inline-flex items-center">
    ${seg(has('reseau'),     '#3b82f6', 'Réseau',      'R')}
    ${seg(has('chalandise'), '#22c55e', 'Chalandise',   'C')}
    ${seg(has('horsZone'),   '#f59e0b', 'Hors-zone',   'H')}
    ${seg(has('livraisons'), '#8b5cf6', 'Livraisons',   'L')}
    ${seg(has('pdvClients'), '#ec4899', 'Clients PDV', 'P')}
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

// ── Liste compacte familles (panneau gauche split-screen) ─────────────
function _prBuildCompactList(data) {
  let families = _prFilterClassif === 'inactive'
    ? (data.inactiveFamilies || [])
    : data.families;
  if (_prFilterClassif && _prFilterClassif !== 'inactive') families = families.filter(f => f.classifGlobal === _prFilterClassif);
  if (_prEmpFilter) {
    const empList = _prEmpFilter.split(';').map(e => e.trim().toLowerCase()).filter(Boolean);
    const empFams = new Set();
    const catFam = _S.catalogueFamille;
    for (const r of (_S.finalData || [])) {
      const emp = (r.emplacement || '').toLowerCase();
      if (!empList.some(e => emp.includes(e))) continue;
      const cf = catFam?.get(r.code)?.codeFam || _S.articleFamille?.[r.code];
      if (cf) empFams.add(cf);
    }
    families = families.filter(f => empFams.has(f.codeFam));
  }
  let html = '';
  for (const f of families) {
    const b = ACTION_BADGE[f.classifGlobal] || ACTION_BADGE.surveiller;
    const active = _prOpenFam === f.codeFam;
    const safeCF = f.codeFam.replace(/'/g, "\\'");
    html += `<div onclick="window._prOpenDetail('${safeCF}')"
      class="px-2 py-1.5 rounded-lg cursor-pointer transition-colors text-[11px] mb-0.5 ${active ? 'font-bold' : 'hover:s-panel-inner'}"
      style="${active ? `background:${b.color}22;border-left:3px solid ${b.color}` : ''}">
      <span style="color:${b.color}">${b.icon}</span>
      <span class="t-primary">${escapeHtml(f.libFam)}</span>
      <span class="text-[9px]" style="color:#64748b;margin-left:4px">${f.socle + f.implanter + f.challenger + f.surveiller}</span>
    </div>`;
  }
  return html || '<div class="text-[10px] t-disabled p-2">Aucune famille.</div>';
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

  let families = _prFilterClassif === 'inactive'
    ? (data.inactiveFamilies || [])
    : data.families;
  if (empFamilles !== null) {
    families = families.filter(f => empFamilles.has(f.codeFam));
  }
  if (_prFilterClassif && _prFilterClassif !== 'inactive') families = families.filter(f => f.classifGlobal === _prFilterClassif);
  if (searchText) {
    // Mode multi-codes : ≥2 tokens numériques 5-7 chiffres → filtrer les familles contenant ces articles
    const _tokens = searchText.split(/[\s,;\t]+/).filter(Boolean);
    if (_tokens.length >= 2 && _tokens.every(t => /^\d{5,7}$/.test(t))) {
      const _codeSet = new Set(_tokens);
      const _cat = _S.catalogueFamille;
      const _matchFams = new Set();
      if (_cat) for (const [code, entry] of _cat) { if (_codeSet.has(code)) _matchFams.add(entry.codeFam); }
      families = families.filter(f => _matchFams.has(f.codeFam));
    } else {
      families = families.filter(f =>
        f.libFam.toLowerCase().includes(searchText) || f.codeFam.toLowerCase().includes(searchText)
      );
    }
  }
  if (!_prFilterClassif && !searchText && !_prEmpFilter && _prOpenFam) {
    families = families.filter(f => f.codeFam === _prOpenFam);
  }
  if (!families.length) return `<div class="col-span-2 text-center py-6 t-disabled text-[12px]">${_prEmpFilter ? `Aucune famille trouvée à l'emplacement "${escapeHtml(_prEmpFilter)}".` : 'Aucune famille pour ce filtre.'}</div>`;
  let out = '';
  for (const f of families) {
    const b = ACTION_BADGE[f.classifGlobal] || ACTION_BADGE.surveiller;
    const total = f.socle + f.implanter + f.challenger + f.surveiller;
    const safeCF = f.codeFam.replace(/'/g, "\\'");
    const bw = (n) => total > 0 ? Math.max(n / total * 100, n > 0 ? 3 : 0) : 0;
    const miniBar = `<div class="flex rounded overflow-hidden h-1.5 my-1.5" style="gap:1px">
      ${f.socle     ? `<div title="${f.socle} socle" style="width:${bw(f.socle)}%;background:#22c55e"></div>` : ''}
      ${f.implanter ? `<div title="${f.implanter} à implanter" style="width:${bw(f.implanter)}%;background:#3b82f6"></div>` : ''}
      ${f.challenger? `<div title="${f.challenger} challenger" style="width:${bw(f.challenger)}%;background:#ef4444"></div>` : ''}
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
        <span class="text-[9px] font-semibold shrink-0 flex items-center gap-1" style="color:${b.dot}"><span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:${b.dot};flex-shrink:0"></span>${b.label}${f.tagSpecialiste ? ' 🎯' : ''}</span>
      </div>
      ${f.needsCleaning ? `<div class="text-[9px] font-bold mb-1" style="color:#f59e0b" title="${f.nbDormants} dormants · ${f.nbFin} fin série/stock · ${f.nbRuptures} ruptures (${f.hygieneScore}%)">🧹 À nettoyer avant expansion (${f.hygieneScore}%)</div>` : ''}
      ${f.nbSchizo >= 2 ? `<div class="text-[9px] font-bold mb-1" style="color:#a855f7" title="Refs identifiées comme incontournables réseau MAIS dormantes/ruptures chez toi — signal 'rayon échantillonné', commande à la demande sans stock fiable, divorce de confiance">🌀 ${f.nbSchizo} refs schizo (échantillonné)</div>` : ''}
      ${miniBar}
      <div class="flex items-center justify-between text-[10px]">
        <span class="t-secondary">${total} articles · ${f.nbClients} clients</span>
        <span class="font-bold" style="color:${covColor}" title="${f.nbEnRayon} en rayon / ${f.nbCatalogue} au catalogue">${f.couverture}% du catalogue</span>
      </div>
      <div class="flex items-center justify-between mt-1.5 text-[10px]">
        ${f.potentielExterne >= 1000 ? `<span title="Potentiel externe (CA zone)" style="color:#3b82f6">💰 ${formatEuro(f.potentielExterne)}</span>` : '<span></span>'}
        <span class="font-bold t-secondary" title="CA agence sur cette famille — tous canaux livrés au PDV">Mon CA : ${formatEuro(f.caAgence)}</span>
      </div>
      ${f.ecartReseau != null ? `<div class="flex items-center justify-between mt-1 text-[9px]">
        <span style="color:${f.ecartReseau >= 0 ? '#22c55e' : '#ef4444'}" title="Écart CA vs médiane réseau">${f.ecartReseau >= 0 ? '▲' : '▼'} ${formatEuro(Math.abs(f.ecartReseau))} vs médiane (${f.ecartReseauPct > 0 ? '+' : ''}${f.ecartReseauPct}%)</span>
        ${f.rangReseau ? `<span class="t-disabled" title="Rang dans le réseau">#${f.rangReseau}/${f.rangReseauTotal}</span>` : ''}
      </div>` : ''}
    </div>`;
  }
  return out;
}

// ── Onglet Mon Rayon ─────────────────────────────────────────────────
function _prRenderRayon(data) {
  if (!data) return '<div class="t-disabled text-sm text-center py-6">Aucune donnée rayon pour cette famille.</div>';
  // Filtre ref directe (depuis recherche code article)
  if (_prHighlightRef) {
    const refArt = (data.monRayon || []).filter(a => a.code === _prHighlightRef);
    const lib = articleLib(_prHighlightRef);
    const pill = `<div class="flex items-center gap-2 mb-3">
      <span class="text-[11px] px-2 py-1 rounded border s-panel-inner font-bold" style="border-color:var(--c-action);background:rgba(139,92,246,0.15);color:var(--c-action,#8b5cf6)">
        🔍 ${_prHighlightRef} — ${escapeHtml(lib.slice(0, 40))}
        <button onclick="window._prClearHighlightRef()" class="ml-2 hover:t-primary" style="font-size:11px">✕</button>
      </span>
    </div>`;
    if (!refArt.length) return pill + '<div class="t-disabled text-sm text-center py-4">Article absent du rayon.</div>';
    data = { ...data, monRayon: refArt };
  }
  const { monRayon, nbCatalogue } = data;
  const displayedForHeader = [];
  const empsSet = new Set();
  const filterByEmp = _prSelectedEmps.size > 0;
  let valeurTotale = 0;
  let pepites = 0, challeng = 0, dormants = 0, ruptures = 0;
  for (const a of monRayon) {
    const emp = a.emplacement || '';
    if (emp) empsSet.add(emp);
    if (filterByEmp && !_prSelectedEmps.has(emp)) continue;
    displayedForHeader.push(a);
    valeurTotale += a.valeurStock || 0;
    if (a.status === 'pepite') pepites++;
    else if (a.status === 'challenger') challeng++;
    else if (a.status === 'dormant') dormants++;
    else if (a.status === 'rupture') ruptures++;
  }
  const couverture = nbCatalogue > 0
    ? Math.round(displayedForHeader.length / nbCatalogue * 100)
    : 0;
  const page = _S._prPageRayon || 99999;
  const standard = displayedForHeader.length - pepites - challeng - dormants - ruptures;
  // Pills emplacements
  const empsInRayon = Array.from(empsSet).sort();
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
  // Filtre statut (emplacement déjà appliqué)
  let displayed = displayedForHeader;
  if (_prRayonFilter) {
    displayed = [];
    for (const a of displayedForHeader) {
      if (a.status === _prRayonFilter) displayed.push(a);
    }
  }
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
    const cb = sq ? (CLASSIF_BADGE[sq] || CLASSIF_BADGE.surveiller) : null;
    const isCleEntree = s === 'dormant' && sq === 'socle';
    const sqBadge = cb
      ? `<span style="font-size:9px;padding:2px 6px;border-radius:4px;font-weight:600;background:${cb.bg};color:${cb.color}">${cb.icon} ${cb.label}</span>${isCleEntree ? ' <span title="Clé d\'entrée métier — dormant mais socle réseau" style="cursor:help">🔑</span>' : ''}`
      : '<span class="t-disabled text-[9px]">—</span>';
    const lib = a.libelle || articleLib(a.code);
    return `<tr class="border-b b-light hover:s-hover text-[11px] cursor-pointer${isCleEntree ? ' bg-amber-950/20' : ''}"
      onclick="if(window.openArticlePanel)window.openArticlePanel('${a.code}','planRayon')">
      <td class="py-1.5 px-2 font-mono" style="color:var(--t-primary)">${a.code} <span class="opacity-50 hover:opacity-100">🔍</span></td>
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
  ${empPills}${_prSFPills()}${marquePillsRayon}
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
const _SQ_CLASSIF_ORDER = ['socle','implanter','challenger','surveiller'];
const _SQ_SORT_FNS = {
  agence:    (a, b) => (b.W || 0) - (a.W || 0),
  reseau:    (a, b) => (b.nbAgencesReseau || 0) - (a.nbAgencesReseau || 0),
  livraison: (a, b) => (b.nbBLLivraisons  || 0) - (a.nbBLLivraisons  || 0),
  score:     (a, b) => (b.score || 0) - (a.score || 0),
  classif:   (a, b) => _SQ_CLASSIF_ORDER.indexOf(a._g) - _SQ_CLASSIF_ORDER.indexOf(b._g),
  code:      (a, b) => String(a.code).localeCompare(String(b.code)),
  potentiel: (a, b) => (b._potentielZone || 0) - (a._potentielZone || 0),
};

function _prBuildSqTable(arts) {
  // Filtre ref directe (depuis recherche code article)
  if (_prHighlightRef) {
    const refArt = arts.filter(a => a.code === _prHighlightRef);
    const lib = articleLib(_prHighlightRef);
    const pill = `<div class="flex items-center gap-2 mb-3">
      <span class="text-[11px] px-2 py-1 rounded border s-panel-inner font-bold" style="border-color:var(--c-action);background:rgba(139,92,246,0.15);color:var(--c-action,#8b5cf6)">
        🔍 ${_prHighlightRef} — ${escapeHtml(lib.slice(0, 40))}
        <button onclick="window._prClearHighlightRef()" class="ml-2 hover:t-primary" style="font-size:11px">✕</button>
      </span>
    </div>`;
    if (!refArt.length) {
      // Chercher dans les articles "bruit" exclus du squelette
      const sqData = _S._prSqData;
      const bruitArt = sqData?._allArticles?.get(_prHighlightRef);
      if (bruitArt) {
        const fd = (_S.finalData || []).find(r => r.code === _prHighlightRef);
        const _g = bruitArt.classification || 'bruit';
        refArt = [{ ...bruitArt, _g, W: fd?.W || 0 }];
      } else {
        return pill + '<div class="t-disabled text-sm text-center py-4">Article introuvable dans les données.</div>';
      }
    }
    arts = refArt;
  }
  const filter = _S._prSqFilter || '';
  const filtered = _prHighlightRef ? arts
    : filter === 'absent'
      ? arts.filter(a => !a.enStock)
      : filter
        ? arts.filter(a => a._g === filter)
        : arts;
  if (!filtered.length) return '<div class="t-disabled text-sm text-center py-4">Aucun article.</div>';

  const _sqBaseFn = _SQ_SORT_FNS[_prSqSort] || _SQ_SORT_FNS.reseau;
  const sorted = [...filtered].sort((a, b) => _prSqSortAsc ? -_sqBaseFn(a, b) : _sqBaseFn(a, b));
  const shown = sorted.slice(0, _prSqPage);

  const _thSort = (key, label, align = 'text-right', title = '') => {
    const active = _prSqSort === key;
    return `<th class="py-1.5 px-2 ${align} cursor-pointer hover:t-primary"
      style="color:${active ? 'var(--c-action,#8b5cf6)' : 'var(--t-secondary)'};font-weight:${active ? 700 : 500}"
      ${title ? `title="${title}"` : ''}
      onclick="window._prSqSortFn('${key}')">${label}${active ? (_prSqSortAsc ? ' ▲' : ' ▼') : ''}</th>`;
  };

  const _famCode = _prOpenFam || '';
  // Max agences pour barre détention proportionnelle
  let maxAg = 1;
  for (const a of filtered) {
    const n = a.nbAgencesReseau || 0;
    if (n > maxAg) maxAg = n;
  }
  const rows = shown.map(a => {
    const cb = CLASSIF_BADGE[a._g] || CLASSIF_BADGE.surveiller;
    const role = _famCode ? _prGetRole(a.code, _famCode) : 'standard';
    const rb = _prRoleBadge(role);
    const absent = !a.enStock;
    const rowBg = absent ? 'background:rgba(239,68,68,0.06)' : '';
    // Détention réseau — mini-barre
    const detPct = Math.round((a.nbAgencesReseau || 0) / maxAg * 100);
    const detColor = detPct >= 60 ? '#22c55e' : detPct >= 30 ? '#f59e0b' : '#94a3b8';
    const detBar = `<span style="display:inline-flex;align-items:center;gap:4px">
      <span style="display:inline-block;width:28px;height:5px;border-radius:3px;background:rgba(148,163,184,0.15);overflow:hidden">
        <span style="display:block;height:100%;width:${detPct}%;background:${detColor}"></span>
      </span><span>${a.nbAgencesReseau || 0}</span></span>`;
    // Stock — pastille + valeur
    const stockCell = absent
      ? '<span style="color:#ef4444;font-weight:600">✕</span>'
      : `<span style="color:#22c55e">●</span> ${a.stockActuel}`;
    return `<tr class="border-b b-light hover:s-hover text-[11px] cursor-pointer" style="${rowBg}"
      onclick="if(window.openArticlePanel)window.openArticlePanel('${a.code}','planRayon')">
      <td class="py-1.5 px-2 font-mono t-disabled">${a.code} <span class="opacity-50 hover:opacity-100">🔍</span></td>
      <td class="py-1.5 px-2 t-primary" style="max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(a.libelle || a.code)}</td>
      <td class="py-1.5 px-2"><span class="text-[8px] px-1.5 py-0.5 rounded-full font-bold" style="background:${cb.bg};color:${cb.color}">${cb.icon} ${cb.label}</span>${rb ? ' ' + rb : ''}</td>
      <td class="py-1.5 px-2">${_prSourceBar(a.sources)}</td>
      <td class="py-1.5 px-2 text-right t-secondary">${a.W || 0}</td>
      <td class="py-1.5 px-2 text-right t-secondary">${detBar}</td>
      <td class="py-1.5 px-2 text-right t-secondary">${a.nbBLLivraisons || 0}</td>
      <td class="py-1.5 px-2 text-right">${stockCell}</td>
      ${a._potentielZone ? `<td class="py-1.5 px-2 text-right font-bold" style="color:#22c55e">${formatEuro(a._potentielZone)}</td>` : (filter === 'implanter' ? '<td class="py-1.5 px-2 text-right t-disabled">—</td>' : '')}
    </tr>`;
  }).join('');

  return `<div class="overflow-x-auto" id="prSqTable" style="max-height:520px;overflow-y:auto">
    <table class="w-full text-[11px]">
      <thead style="position:sticky;top:0;z-index:2;background:var(--color-bg-primary,#0f172a)"><tr class="border-b b-light text-[10px]">
        ${_thSort('code', 'Code', 'text-left')}
        <th class="py-1.5 px-2 text-left" style="color:var(--t-secondary);font-weight:500">Libellé</th>
        <th class="py-1.5 px-2 text-left" style="color:var(--t-secondary);font-weight:500" title="Classification squelette + rôle Physigamme">Classif.</th>
        <th class="py-1.5 px-2 text-left" style="color:var(--t-secondary);font-weight:500" title="R=Réseau C=Chalandise H=Hors-zone L=Livraisons P=PDV">Sources</th>
        ${_thSort('agence',    'W', 'text-right', 'Fréquence (passages/an)')}
        ${_thSort('reseau',    'Détention', 'text-right', 'Nb agences réseau qui vendent cet article')}
        ${_thSort('livraison', 'BL zone', 'text-right', 'BL livraisons zone de chalandise')}
        ${_thSort('classif',   'Stock', 'text-right')}
        ${filter === 'implanter' ? _thSort('potentiel', '💰 Potentiel', 'text-right', 'CA médian réseau × pénétration zone — potentiel si implanté') : ''}
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

  const fdMap = _prGetFdMap();
  const CLASSIFS = ['socle', 'implanter', 'challenger', 'surveiller'];
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
          if (fdMap.get(a.code)?.isParent) continue;
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
  // Potentiel Zone : CA médian réseau article × nb clients métier dominant sur la zone
  const _benchM = _S.chalandiseReady ? (typeof computeBenchMetier === 'function' ? computeBenchMetier() : null) : null;
  const _vpm = _S.ventesParMagasin || {};
  const _myStore = _S.selectedMyStore;
  const _storeKeys = Object.keys(_vpm).filter(s => s !== _myStore);
  const artsWithW = arts.map(a => {
    const enriched = { ...a, W: _wLookup.get(a.code) || 0 };
    // Potentiel Zone = CA médian réseau (cet article, hors mon agence) × pénétration zone
    if (a._g === 'implanter' && _storeKeys.length > 0) {
      const casReseau = _storeKeys.map(s => _vpm[s]?.[a.code]?.sumCA || 0).filter(v => v > 0);
      if (casReseau.length >= 2) {
        casReseau.sort((x, y) => x - y);
        const n = casReseau.length;
        const medianCA = n % 2 === 0 ? (casReseau[n / 2 - 1] + casReseau[n / 2]) / 2 : casReseau[Math.floor(n / 2)];
        // Facteur zone : nb clients de la zone qui achètent cet article dans d'autres agences
        const nbCliZone = a.nbClientsZone || 0;
        const penFactor = nbCliZone >= 5 ? 1.5 : nbCliZone >= 2 ? 1.2 : 1;
        enriched._potentielZone = Math.round(medianCA * penFactor);
      }
    }
    return enriched;
  });
  _S._prSqArts = artsWithW;

  const sousFamLib = _prOpenSousFam
    ? (_S.catalogueFamille
        ? [..._S.catalogueFamille.values()]
            .find(f => f.codeFam === fam.codeFam && f.codeSousFam === _prOpenSousFam)
            ?.sousFam || _prOpenSousFam
        : _prOpenSousFam)
    : '';

  // Single pass over arts: classif counts + enStock/absent tallies.
  const counts = { socle: 0, implanter: 0, challenger: 0, surveiller: 0 };
  let nbEnStock = 0, nbAbsent = 0;
  for (const a of arts) {
    if (a._g in counts) counts[a._g]++;
    if (a.enStock) nbEnStock++; else nbAbsent++;
  }
  const activeFilter = _S._prSqFilter || '';

  let pills = CLASSIFS.map(g => {
    const b = CLASSIF_BADGE[g];
    const active = activeFilter === g;
    return `<button onclick="window._prSqFilterFn('${g}')"
      class="text-[10px] px-2 py-1 rounded border cursor-pointer transition-all ${active ? 's-panel-inner t-inverse' : 's-card t-secondary hover:t-primary'}"
      style="${active ? 'box-shadow:0 0 0 2px ' + b.color : ''}">${b.icon} ${b.label} <strong>${counts[g]}</strong></button>`;
  }).join('');
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

  // Résumé rapide
  const nbTotal = arts.length;
  const pctStock = nbTotal ? Math.round(nbEnStock / nbTotal * 100) : 0;
  const pctColor = pctStock >= 80 ? '#22c55e' : pctStock >= 50 ? '#f59e0b' : '#ef4444';
  const summary = `<div class="flex items-center gap-4 mb-3 text-[10px]">
    <span class="t-disabled">${nbTotal} articles squelette</span>
    <span style="display:inline-flex;align-items:center;gap:4px">
      <span style="display:inline-block;width:48px;height:6px;border-radius:3px;background:rgba(148,163,184,0.15);overflow:hidden">
        <span style="display:block;height:100%;width:${pctStock}%;background:${pctColor}"></span>
      </span>
      <span style="color:${pctColor};font-weight:700">${pctStock}% en stock</span>
    </span>
    ${nbAbsent ? `<span style="color:#ef4444;font-weight:600">✕ ${nbAbsent} absents</span>` : ''}
  </div>`;

  const srcLegend = `<div class="flex items-center gap-3 mb-2 text-[9px] t-disabled">
    <span>Sources :</span>
    <span style="color:#3b82f6">■ Réseau</span>
    <span style="color:#22c55e">■ Chalandise</span>
    <span style="color:#f59e0b">■ Hors-zone</span>
    <span style="color:#8b5cf6">■ Livraisons</span>
    <span style="color:#ec4899">■ Clients PDV</span>
  </div>`;

  return `<div class="flex flex-wrap gap-1.5 mb-3 items-center">${pills}${sousFamNote}</div>${_prSFPills()}${summary}${srcLegend}${_prBuildSqTable(artsWithW)}`;
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
  // Aussi les canaux hors-MAGASIN — seulement si ventesClientMagFull n'existe pas
  // (Full contient déjà TOUS les canaux, évite le double-comptage)
  if (!hasFull && _S.ventesClientHorsMagasin?.size) {
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

  const fdMap = _prGetFdMap();
  const _sqClassifMap = _prGetSqClassifMapCached(_S._prSqData);
  const stores = Object.keys(vpm).filter(s => s !== myStore);
  const nbStores = stores.length || 1;

  // ── Classification par rôle ──
  const artList = [];
  const bySF = new Map();

  // Index inversé hors-magasin pour cette famille
  const _hmBuyers = new Map();
  const _vchm = _S.ventesClientHorsMagasin;
  if (_vchm) {
    for (const [cc, artMap] of _vchm) {
      for (const code of artMap.keys()) {
        if (!allCodes.has(code)) continue;
        let s = _hmBuyers.get(code);
        if (!s) { s = new Set(); _hmBuyers.set(code, s); }
        s.add(cc);
      }
    }
  }

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
    // Clients métiers stratégiques — comptoir + livraisons
    const allBuyers = new Set();
    const buyersMag = _S.articleClients?.get(code);
    if (buyersMag) for (const cc of buyersMag) allBuyers.add(cc);
    const _hmSet = _hmBuyers.get(code);
    if (_hmSet) for (const cc of _hmSet) allBuyers.add(cc);
    let nbCli = 0, nbCliMetierStrat = 0;
    if (allBuyers.size && _S.chalandiseData?.size) {
      for (const cc of allBuyers) {
        nbCli++;
        const metier = (_S.chalandiseData.get(cc)?.metier || '').toLowerCase();
        if (metier && METIERS_STRATEGIQUES.some(m => metier.includes(m))) nbCliMetierStrat++;
      }
    }
    // Rôle
    let role = 'standard';
    // Priorité : le comportement d'achat écrase l'âge du produit
    if (detention >= 0.6 || (fd?.abcClass === 'A' && W >= 12)) role = 'incontournable';
    else if (nbCli >= 2 && nbCliMetierStrat / nbCli >= 0.5) role = 'specialiste';
    else if (fd?.isNouveaute || (fd?.ageJours != null && fd.ageJours < 90 && nbSt >= 2)) role = 'nouveaute';

    // Classification squelette (O(1) lookup via cached Map)
    const sqClassif = _sqClassifMap.get(code) || '';
    const a = { code, lib: articleLib(code), sf: sf?.sousFam || '', codeSF: sf?.codeSousFam || '',
      role, sqClassif, detention, nbSt, caRes, blRes, myCa, myBL, myPrel, stock, enStock, prix, W, nbCli, nbCliMetierStrat,
      abc: fd?.abcClass || '', fmr: fd?.fmrClass || '' };
    artList.push(a);
    if (a.sf && a.prix > 0) { if (!bySF.has(a.sf)) bySF.set(a.sf, []); bySF.get(a.sf).push(a); }
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

  // Détention incontournables (Capitaine + Sergent)
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
    { k: 'specialiste', i: '🎯', l: 'Spécialistes', c: '#8b5cf6' },
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


  const _artTh = `<thead><tr class="border-b b-light text-[10px]" style="color:var(--t-secondary)">
    <th class="py-1 px-2 text-left">Code</th><th class="py-1 px-2 text-left">Libellé</th>
    <th class="py-1 px-2 text-left">Rôle</th><th class="py-1 px-2 text-right">Dét. rés.</th>
    <th class="py-1 px-2 text-right">Stock</th><th class="py-1 px-2 text-right">W</th>
  </tr></thead>`;
  const _artRow = (a) => {
    const rb = ROLE_BADGE[a.role] || ROLE_BADGE.standard;
    const sqBadge = a.sqClassif ? (CLASSIF_BADGE[a.sqClassif] || null) : null;
    return `<tr class="border-b b-light text-[11px] cursor-pointer hover:s-hover"
      onclick="if(window.openArticlePanel)window.openArticlePanel('${a.code}','planRayon')">
      <td class="py-1 px-2 font-mono t-disabled">${a.code} <span class="opacity-50 hover:opacity-100">🔍</span></td>
      <td class="py-1 px-2 t-primary truncate max-w-[160px]">${escapeHtml(a.lib)}</td>
      <td class="py-1 px-2">
        <span class="text-[8px] px-1.5 py-0.5 rounded-full" style="background:${rb.color}20;color:${rb.color}">${rb.icon} ${rb.label}</span>${a.role === 'incontournable' && a.detention < 0.6 ? '<span class="text-[7px] px-1 py-0.5 rounded font-bold ml-0.5" style="background:rgba(139,92,246,0.15);color:#a78bfa">LOCAL</span>' : ''}
        ${sqBadge ? `<span class="text-[8px] px-1 py-0.5 rounded ml-0.5" style="background:${sqBadge.bg};color:${sqBadge.color}">${sqBadge.icon} ${sqBadge.label}</span>` : ''}
      </td>
      <td class="py-1 px-2 text-right t-secondary">${Math.round(a.detention * 100)}%</td>
      <td class="py-1 px-2 text-right t-secondary">${a.enStock ? a.stock : '—'}</td>
      <td class="py-1 px-2 text-right t-secondary">${a.W || 0}</td>
    </tr>`;
  };

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
  if (!aRemplir.length && !aVider.length) {
    actions = '<div class="text-[11px] t-disabled text-center py-3">✅ Gamme équilibrée — aucune action prioritaire détectée.</div>';
  }

  return `${_prSFPills()}
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

// ── Onglet Pilotage (fusion Mon Rayon + Squelette + Physigamme) ──────
let _prPilotFilter = '';   // 'socle'|'challenger'|'surveiller'|'implanter'|''
let _prPilotVerdict = '';  // verdict name filter (e.g. 'Le Poids Mort')
let _prPilotRole   = '';   // 'incontournable'|'specialiste'|'nouveaute'|'standard'|''
let _prPilotSort   = 'verdict'; // 'code'|'stock'|'w'|'cliPDV'|'caZone'|'cliZone'|'classif'|'verdict'
let _prPilotSortAsc = false;   // false = décroissant (défaut), true = croissant
let _prPilotPage   = 60;

function _prRenderPilotage(fam) {
  const sqData = _S._prSqData || computeSquelette();
  _S._prSqData = sqData;
  if (!sqData) return '<div class="t-disabled text-sm text-center py-6">Données indisponibles.</div>';

  const codeFam = fam.codeFam;
  const catFam = _S.catalogueFamille;
  const roles = _prComputeRoles(codeFam);
  _prRoleCache = roles;
  _prRoleCache._fam = codeFam;

  const fdMap = _prGetFdMap();

  // ── Filtre distance : via articleZoneFiltered (article-store.js) ──
  const _hasDist = _prMetierDist && _S.chalandiseReady && _S.chalandiseData?.size;
  const _distFn = _hasDist ? _prDistOk : null;
  // Pré-calcul index zone si nécessaire
  if (_hasDist) computeArticleZoneIndex();

  // ── Collecter articles squelette de cette famille ──
  const CLASSIFS = ['socle', 'implanter', 'challenger', 'surveiller'];
  // Vérifier si le filtre SF a des matches dans le squelette (sinon l'ignorer)
  let _sfFilterActive = _prSelectedSFs.size > 0;
  if (_sfFilterActive) {
    let hasMatch = false;
    outer: for (const d of sqData.directions) {
      for (const g of CLASSIFS) {
        for (const a of (d[g] || [])) {
          const cfCat = catFam?.get(a.code)?.codeFam;
          const cfArt = _S.articleFamille?.[a.code] || '';
          if (!(cfCat === codeFam || (!cfCat && cfArt.startsWith(codeFam)) || cfArt === codeFam)) continue;
          if (_prSelectedSFs.has(catFam?.get(a.code)?.codeSousFam || '')) { hasMatch = true; break outer; }
        }
      }
    }
    if (!hasMatch) _sfFilterActive = false;
  }
  let arts = [];
  for (const d of sqData.directions) {
    for (const g of CLASSIFS) {
      for (const a of (d[g] || [])) {
        const cfCat = catFam?.get(a.code)?.codeFam;
        const cfArt = _S.articleFamille?.[a.code] || '';
        const matches = cfCat === codeFam || (!cfCat && cfArt.startsWith(codeFam)) || cfArt === codeFam;
        if (!matches) continue;
        if (_sfFilterActive) {
          const csf = catFam?.get(a.code)?.codeSousFam || '';
          if (!_prSelectedSFs.has(csf)) continue;
        }
        if (_prSelectedMarques.size > 0) {
          if (!_prSelectedMarques.has(_S.catalogueMarques?.get(a.code) || '')) continue;
        }
        const fd = fdMap.get(a.code);
        if (fd?.isParent) continue;
        const sf = catFam?.get(a.code);
        const role = roles.get(a.code) || 'standard';
        const verdict = _prVerdict(g, role, a.code);
        const _zf = _distFn ? articleZoneFiltered(a.code, _distFn) : null;
        const _caZ = _zf ? _zf.caZone : (a.caClientsZone || 0);
        const _clZ = _zf ? _zf.cliZone : (a.nbClientsZone || 0);
        const _caAg = _zf ? _zf.caAgence : (a.caAgence || 0);
        arts.push({
          ...a, _g: g, role, verdict,
          W: fd?.W || 0,
          prix: fd?.prixUnitaire || 0,
          sf: sf?.sousFam || '',
          codeSF: sf?.codeSousFam || '',
          cliPDV: a.nbClientsPDV || 0,
          caZone: _caZ,
          cliZone: _clZ,
          pdm: _caZ > 0 ? Math.min(100, Math.round(_caAg / _caZ * 100)) : null,
        });
      }
    }
  }

  // ── Potentiel Zone pour IMPLANTER ──
  {
    const _vpm = _S.ventesParMagasin || {};
    const _myStore = _S.selectedMyStore;
    const _storeKeys = Object.keys(_vpm).filter(s => s !== _myStore);
    if (_storeKeys.length > 0) {
      for (const a of arts) {
        if (a._g !== 'implanter') continue;
        const casReseau = _storeKeys.map(s => _vpm[s]?.[a.code]?.sumCA || 0).filter(v => v > 0);
        if (casReseau.length >= 2) {
          casReseau.sort((x, y) => x - y);
          const n = casReseau.length;
          const medianCA = n % 2 === 0 ? (casReseau[n / 2 - 1] + casReseau[n / 2]) / 2 : casReseau[Math.floor(n / 2)];
          const nbCliZone = a.nbClientsZone || 0;
          const penFactor = nbCliZone >= 5 ? 1.5 : nbCliZone >= 2 ? 1.2 : 1;
          a._potentielZone = Math.round(medianCA * penFactor);
        }
      }
    }
  }

  // ── Filtre ref directe (depuis recherche code article) ──
  let _refPill = '';
  if (_prHighlightRef) {
    let refArt = arts.filter(a => a.code === _prHighlightRef);
    const lib = articleLib(_prHighlightRef);
    _refPill = `<div class="flex items-center gap-2 mb-3">
      <span class="text-[11px] px-2 py-1 rounded border s-panel-inner font-bold" style="border-color:var(--c-action);background:rgba(139,92,246,0.15);color:var(--c-action,#8b5cf6)">
        🔍 ${_prHighlightRef} — ${escapeHtml(lib.slice(0, 40))}
        <button onclick="window._prClearHighlightRef()" class="ml-2 hover:t-primary" style="font-size:11px">✕</button>
      </span>
    </div>`;
    if (!refArt.length) {
      const sqData = _S._prSqData;
      const bruitArt = sqData?._allArticles?.get(_prHighlightRef);
      if (bruitArt) {
        const fd = (_S.finalData || []).find(r => r.code === _prHighlightRef);
        const _g = bruitArt.classification || 'bruit';
        const _famCode = _prOpenFam || '';
        const role = _famCode ? _prGetRole(bruitArt.code, _famCode) : 'standard';
        const verdict = _prVerdict(_g, role, bruitArt.code);
        refArt = [{
          ...bruitArt, _g, role, verdict,
          W: fd?.W || 0,
          prix: fd?.prixUnitaire || 0,
          sf: '', codeSF: '',
          cliPDV: bruitArt.nbClientsPDV || 0,
          caZone: bruitArt.caClientsZone || 0,
          cliZone: bruitArt.nbClientsZone || 0,
          pdm: null,
        }];
      } else {
        return _refPill + '<div class="t-disabled text-sm text-center py-4">Article introuvable dans les données.</div>';
      }
    }
    arts = refArt;
  }

  // ── Counts par classif (single pass over arts, not CLASSIFS × N) ──
  const counts = {};
  for (const g of CLASSIFS) counts[g] = 0;
  for (const a of arts) { if (a._g in counts) counts[a._g]++; }

  // ── Filtre classif + verdict (bypass en recherche ciblée) ──
  let filtered = _prHighlightRef ? arts
    : _prPilotFilter
      ? arts.filter(a => a._g === _prPilotFilter)
      : arts;
  if (!_prHighlightRef && _prPilotVerdict) {
    filtered = filtered.filter(a => a.verdict.name === _prPilotVerdict);
  }
  if (!_prHighlightRef && _prPilotRole) {
    filtered = filtered.filter(a => a.role === _prPilotRole);
  }

  // ── Tri ──
  const SORT_FNS = {
    code:    (a, b) => String(a.code).localeCompare(String(b.code)),
    stock:   (a, b) => (b.stockActuel || 0) - (a.stockActuel || 0),
    w:       (a, b) => (b.W || 0) - (a.W || 0),
    cliPDV:  (a, b) => (b.cliPDV || 0) - (a.cliPDV || 0),
    caZone:  (a, b) => (b.caZone || 0) - (a.caZone || 0),
    cliZone: (a, b) => (b.cliZone || 0) - (a.cliZone || 0),
    pdm:     (a, b) => (b.pdm ?? -1) - (a.pdm ?? -1),
    potentiel: (a, b) => (b._potentielZone || 0) - (a._potentielZone || 0),
    classif: (a, b) => CLASSIFS.indexOf(a._g) - CLASSIFS.indexOf(b._g),
    verdict: (a, b) => {
      const o = CLASSIFS.indexOf(a._g) - CLASSIFS.indexOf(b._g);
      if (o !== 0) return o;
      return (b.score || 0) - (a.score || 0);
    },
  };
  const _baseFn = SORT_FNS[_prPilotSort] || SORT_FNS.verdict;
  const sorted = [...filtered].sort((a, b) => _prPilotSortAsc ? -_baseFn(a, b) : _baseFn(a, b));

  // ── Séparer en stock / implanter ──
  const inStock = sorted.filter(a => a._g !== 'implanter');
  const implanter = sorted.filter(a => a._g === 'implanter');
  const all = _prPilotFilter === 'implanter' ? implanter : [...inStock, ...implanter];
  const shown = all.slice(0, _prPilotPage);

  // ── KPIs synthèse (single pass over arts) ──
  const nbTotal = arts.length;
  let nbEnStock = 0, valStock = 0;
  for (const a of arts) {
    if (a.enStock) { nbEnStock++; valStock += (a.stockActuel || 0) * (a.prix || 0); }
  }
  const nbImplanter = counts.implanter || 0;

  // ── Pills filtre classif ──
  const pills = CLASSIFS.map(g => {
    const b = CLASSIF_BADGE[g];
    if (!b) return '';
    const active = _prPilotFilter === g;
    return `<button onclick="window._prPilotFilterFn('${g}')"
      class="text-[10px] px-2 py-1 rounded border cursor-pointer transition-all ${active ? 's-panel-inner t-inverse' : 's-card t-secondary hover:t-primary'}"
      style="${active ? 'box-shadow:0 0 0 2px ' + b.color : ''}">${b.icon} ${b.label} <strong>${counts[g] || 0}</strong></button>`;
  }).join('');

  // ── Pills filtre verdict (verdicts présents dans le filtre classif actif) ──
  const verdictSource = _prPilotFilter ? arts.filter(a => a._g === _prPilotFilter) : arts;
  const verdictCounts = {};
  for (const a of verdictSource) {
    const vn = a.verdict.name;
    if (vn && vn !== '—') verdictCounts[vn] = (verdictCounts[vn] || 0) + 1;
  }
  const verdictPills = Object.entries(verdictCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([name, cnt]) => {
      const active = _prPilotVerdict === name;
      // Find color from VERDICT_MATRIX
      let color = '#94a3b8';
      for (const classifs of Object.values(VERDICT_MATRIX)) {
        for (const v of Object.values(classifs)) {
          if (v.name === name) { color = v.color; break; }
        }
      }
      return `<button onclick="window._prPilotVerdictFn('${name.replace(/'/g, "\\'")}')"
        class="text-[10px] px-2 py-0.5 rounded border cursor-pointer transition-all ${active ? 'font-bold' : 'hover:t-primary'}"
        style="border-color:${color}40;${active ? `background:${color}20;color:${color};box-shadow:0 0 0 1px ${color}` : `color:${color}`}"
        title="${cnt} articles">${name} <strong>${cnt}</strong></button>`;
    }).join('');

  // ── Pills filtre rôle ──
  const roleSource = _prPilotFilter ? arts.filter(a => a._g === _prPilotFilter) : arts;
  const roleCounts = {};
  for (const a of roleSource) { roleCounts[a.role] = (roleCounts[a.role] || 0) + 1; }
  const ROLE_ORDER = ['incontournable', 'specialiste', 'nouveaute', 'standard'];
  const rolePills = ROLE_ORDER
    .filter(r => roleCounts[r] > 0)
    .map(r => {
      const b = ROLE_BADGE[r];
      const active = _prPilotRole === r;
      return `<button onclick="window._prPilotRoleFn('${r}')"
        class="text-[10px] px-2 py-0.5 rounded border cursor-pointer transition-all ${active ? 'font-bold' : 'hover:t-primary'}"
        style="border-color:${b.color}40;${active ? `background:${b.color}20;color:${b.color};box-shadow:0 0 0 1px ${b.color}` : `color:${b.color}`}"
        title="${roleCounts[r]} articles">${b.icon} ${b.label || 'Standard'} <strong>${roleCounts[r]}</strong></button>`;
    }).join('');

  // ── Tri header helper ──
  const _thSort = (key, label, align = 'text-right', title = '') => {
    const active = _prPilotSort === key;
    return `<th class="py-1.5 px-2 ${align} cursor-pointer hover:t-primary whitespace-nowrap"
      style="color:${active ? 'var(--c-action,#8b5cf6)' : 'var(--t-secondary)'};font-weight:${active ? 700 : 500}"
      ${title ? `title="${title}"` : ''}
      onclick="window._prPilotSortFn('${key}')">${label}${active ? (_prPilotSortAsc ? ' ▲' : ' ▼') : ''}</th>`;
  };

  // ── Table rows ──
  let lastGroup = '';
  const rows = shown.map(a => {
    // Séparateur implanter
    let sep = '';
    if (a._g === 'implanter' && lastGroup !== 'implanter' && !_prPilotFilter) {
      sep = `<tr><td colspan="9" class="py-2 px-2 text-[11px] font-bold" style="background:rgba(59,130,246,0.08);color:#3b82f6;border-top:2px solid rgba(59,130,246,0.3)">
        🔵 À implanter — ${implanter.length} réf${implanter.length > 1 ? 's' : ''} avec signal fort
      </td></tr>`;
    }
    lastGroup = a._g;

    const cb = CLASSIF_BADGE[a._g] || CLASSIF_BADGE.surveiller;
    const rb = ROLE_BADGE[a.role];
    const v = a.verdict;
    const absent = !a.enStock;
    const rowBg = absent ? 'background:rgba(239,68,68,0.04)' : '';
    const stockCell = absent
      ? '<span style="color:#ef4444;font-weight:600">✕</span>'
      : `${a.stockActuel}`;
    const lib = a.libelle || articleLib(a.code);

    return `${sep}<tr class="border-b b-light hover:s-hover text-[11px] cursor-pointer" style="${rowBg}"
      onclick="if(window.openArticlePanel)window.openArticlePanel('${a.code}','planRayon')">
      <td class="py-1.5 px-2 font-mono t-disabled">${a.code} <span class="opacity-50 hover:opacity-100">🔍</span></td>
      <td class="py-1.5 px-2 t-primary" style="max-width:260px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${escapeHtml(lib)}">${escapeHtml(lib)}</td>
      <td class="py-1.5 px-2 text-right">${stockCell}</td>
      <td class="py-1.5 px-2 text-right t-secondary">${a.cliPDV || '—'}</td>
      <td class="py-1.5 px-2 text-right t-secondary">${a.caZone ? formatEuro(a.caZone) : '—'}</td>
      <td class="py-1.5 px-2 text-right font-semibold" style="color:${a.pdm == null ? 'var(--t-disabled)' : a.pdm >= 70 ? '#22c55e' : a.pdm >= 40 ? '#f59e0b' : '#ef4444'}">${a.pdm != null ? a.pdm + '%' : '—'}</td>
      ${_prPilotFilter === 'implanter' ? `<td class="py-1.5 px-2 text-right font-bold" style="color:${a._potentielZone ? '#22c55e' : 'var(--t-disabled)'}">${a._potentielZone ? formatEuro(a._potentielZone) : '—'}</td>` : ''}
      <td class="py-1.5 px-2 whitespace-nowrap" title="${escapeHtml(v.tip)}">
        <span class="text-[9px] px-1.5 py-0.5 rounded font-semibold cursor-help" style="background:${v.color}18;color:${v.color}">${v.icon} ${v.name}</span>${_isLocalIncont(a.code, a.role) ? '<span class="text-[7px] px-1 py-0.5 rounded font-bold ml-1" style="background:rgba(139,92,246,0.15);color:#a78bfa">LOCAL</span>' : ''}
      </td>
    </tr>`;
  }).join('');

  // ── Résumé ──
  const summary = `<div class="flex items-center gap-4 mb-3 text-[10px] flex-wrap">
    <span class="t-disabled">${nbEnStock} en rayon · ${nbImplanter} à implanter</span>
    <span class="t-secondary">${formatEuro(valStock)} valeur stock</span>
  </div>`;

  const html = `${_refPill}${_prSFPills()}${summary}
  <div class="flex flex-wrap gap-1.5 mb-2 items-center">${pills}</div>
  <div class="flex flex-wrap gap-1 mb-1 items-center">${verdictPills}</div>
  <div class="flex flex-wrap gap-1 mb-3 items-center">${rolePills}</div>
  <div class="overflow-x-auto" id="prPilotTable" style="max-height:560px;overflow-y:auto">
    <table class="w-full text-[11px]">
      <thead style="position:sticky;top:0;z-index:2;background:var(--color-bg-primary,#0f172a)"><tr class="border-b b-light text-[10px]">
        ${_thSort('code', 'Code', 'text-left')}
        <th class="py-1.5 px-2 text-left" style="color:var(--t-secondary);font-weight:500">Libellé</th>
        ${_thSort('stock', 'Stock', 'text-right')}
        ${_thSort('cliPDV', 'Cli PDV', 'text-right', 'Clients distincts agence sur la période')}
        ${_thSort('caZone', 'CA Zone', 'text-right', 'CA tous canaux clients zone de chalandise')}
        ${_thSort('pdm', 'PdM%', 'text-right', 'Part de marché = CA Magasin ÷ CA Zone')}
        ${_prPilotFilter === 'implanter' ? _thSort('potentiel', '💰 Potentiel', 'text-right', 'CA médian réseau × pénétration zone') : ''}
        ${_thSort('verdict', 'Verdict', 'text-left')}
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>
    ${all.length > _prPilotPage ? `<div class="mt-2 text-center"><button onclick="window._prMorePilot()" class="text-[10px] t-secondary hover:t-primary px-3 py-1 rounded border b-light cursor-pointer">Voir plus (${all.length - _prPilotPage} restants)</button></div>` : ''}
  </div>
  <div class="mt-2">
    <button onclick="window._prExportPilotage()" class="text-[11px] t-secondary border b-light rounded px-3 py-1 hover:t-primary cursor-pointer s-card">⬇ CSV</button>
  </div>`;
  return html;
}

// ── Mode Conquête — Kit de Démarrage ─────────────────────────────────
function _prBuildConqueteKit(codeFam) {
  const vpm = _S.ventesParMagasin || {};
  const myStore = _S.selectedMyStore;
  const catFam = _S.catalogueFamille;
  const stores = Object.keys(vpm).filter(s => s !== myStore);
  const nbStores = stores.length || 1;
  const roles = _prComputeRoles(codeFam);

  // Gather all articles in this family across the network
  const matchFam = (code) => {
    const cf = catFam?.get(code)?.codeFam;
    return cf ? cf === codeFam : (_S.articleFamille?.[code] || '') === codeFam;
  };
  const allCodes = new Set();
  for (const arts of Object.values(vpm)) {
    for (const code of Object.keys(arts)) { if (/^\d{6}$/.test(code) && matchFam(code)) allCodes.add(code); }
  }
  for (const r of (_S.finalData || [])) { if (/^\d{6}$/.test(r.code) && matchFam(r.code)) allCodes.add(r.code); }

  // Get squelette data for zone metrics
  const sqData = _S._prSqData || computeSquelette();
  _S._prSqData = sqData;
  const sqMap = new Map();
  if (sqData) {
    for (const d of sqData.directions) {
      for (const g of ['socle','implanter','challenger','surveiller']) {
        for (const a of (d[g] || [])) sqMap.set(a.code, a);
      }
    }
  }

  const fdMap = _prGetFdMap();

  const articles = [];
  for (const code of allCodes) {
    const role = roles.get(code) || 'standard';
    const sq = sqMap.get(code);
    const fd = fdMap.get(code);
    const inStock = fd && (fd.stockActuel || 0) > 0;
    let nbAgences = 0, caReseau = 0;
    for (const s of stores) {
      if (vpm[s]?.[code]?.countBL > 0) { nbAgences++; caReseau += vpm[s][code].sumCA || 0; }
    }
    articles.push({
      code, role, inStock,
      libelle: articleLib(code),
      marque: _S.catalogueMarques?.get(code) || '',
      sousFam: catFam?.get(code)?.sousFam || '',
      caReseau,
      detention: Math.round(nbAgences / nbStores * 100),
      nbAgences,
      caZone: sq?.caClientsZone || 0,
      nbClientsZone: sq?.nbClientsZone || 0,
    });
  }

  // Sort into 4 priority buckets (excluding articles already in stock)
  const notInStock = articles.filter(a => !a.inStock);
  const p1 = notInStock.filter(a => a.role === 'incontournable')
    .sort((a, b) => b.caReseau - a.caReseau).slice(0, 20);
  const p1Set = new Set(p1.map(a => a.code));
  const p2 = notInStock.filter(a => a.role === 'specialiste' && !p1Set.has(a.code))
    .sort((a, b) => b.caZone - a.caZone).slice(0, 10);
  const p12Set = new Set([...p1Set, ...p2.map(a => a.code)]);
  // P3 — demande zone prouvée OU fallback réseau pour les conquêtes (famille inactive)
  const _p3zone = notInStock.filter(a => a.role === 'standard' && !p12Set.has(a.code) && (a.caZone > 0 || a.nbClientsZone > 0))
    .sort((a, b) => (b.caZone + b.nbClientsZone * 100) - (a.caZone + a.nbClientsZone * 100)).slice(0, 5);
  // Fallback réseau : si aucune demande zone (conquête), prendre les plus vendus du réseau
  const p3 = _p3zone.length > 0 ? _p3zone
    : notInStock.filter(a => a.role === 'standard' && !p12Set.has(a.code) && a.caReseau > 0)
        .sort((a, b) => b.caReseau - a.caReseau).slice(0, 10);
  const p123Set = new Set([...p12Set, ...p3.map(a => a.code)]);
  const p4 = notInStock.filter(a => a.role === 'nouveaute' && !p123Set.has(a.code))
    .sort((a, b) => b.caReseau - a.caReseau).slice(0, 3);

  const _isConquete = p1.length === 0 && _p3zone.length === 0 && p3.length > 0;
  return {
    priorities: [
      { key: 'p1', label: '🏆 Trous Critiques',     color: '#22c55e', desc: 'Incontournables réseau absents de ton stock', items: p1 },
      { key: 'p2', label: '🎯 La Conquête',          color: '#8b5cf6', desc: 'Spécialistes à forte demande zone',          items: p2 },
      { key: 'p3', label: _isConquete ? '📡 Signal Réseau' : '📦 Opportunité Locale', color: '#3b82f6', desc: _isConquete ? 'Les plus vendus du réseau — pas encore de demande locale' : 'Standards avec demande zone prouvée', items: p3 },
      { key: 'p4', label: '🆕 Pari du Réseau',       color: '#f59e0b', desc: 'Nouveautés à tester',                        items: p4 },
    ],
    totalKit: p1.length + p2.length + p3.length + p4.length,
    alreadyInStock: articles.filter(a => a.inStock),
    allArticles: articles,
  };
}

function _prRenderConquete(fam) {
  const kit = _prBuildConqueteKit(fam.codeFam);
  if (!kit.totalKit && !kit.alreadyInStock.length) {
    return `<div class="text-center py-8 t-disabled text-[12px]">Aucune donnée réseau pour construire un kit. Chargez le fichier Le Terrain ou un benchmark.</div>`;
  }

  const caTotal = kit.priorities.reduce((s, p) => s + p.items.reduce((s2, a) => s2 + a.caReseau, 0), 0);
  const caZoneTotal = kit.priorities.reduce((s, p) => s + p.items.reduce((s2, a) => s2 + a.caZone, 0), 0);

  // Header KPIs
  let html = `<div class="mb-4 p-3 rounded-xl s-panel-inner">
    <div class="flex items-center gap-2 mb-2">
      <span class="text-[18px]">🚀</span>
      <span class="text-[14px] font-extrabold t-primary">Kit de Démarrage — ${kit.totalKit} références</span>
    </div>
    <div class="flex flex-wrap gap-4 text-[11px]">
      <span class="t-secondary">CA réseau potentiel : <strong class="t-primary">${formatEuro(caTotal)}</strong></span>
      <span class="t-secondary">CA zone clients : <strong class="t-primary">${formatEuro(caZoneTotal)}</strong></span>
      <span class="t-secondary">Refs réseau total : <strong class="t-primary">${kit.allArticles.length}</strong></span>
      ${kit.alreadyInStock.length ? `<span class="t-secondary">Déjà en stock : <strong style="color:#22c55e">${kit.alreadyInStock.length}</strong></span>` : ''}
    </div>
  </div>`;

  // Priority groups
  for (const p of kit.priorities) {
    if (!p.items.length) continue;
    const caP = p.items.reduce((s, a) => s + a.caReseau, 0);
    html += `<div class="mb-4">
      <div class="flex items-center gap-2 mb-2">
        <span class="text-[12px] font-bold" style="color:${p.color}">${p.label}</span>
        <span class="text-[10px] t-disabled">— ${p.desc}</span>
        <span class="text-[10px] font-bold t-secondary">${p.items.length} refs · ${formatEuro(caP)}</span>
      </div>
      <div class="overflow-x-auto">
        <table class="w-full text-[11px]">
          <thead><tr class="border-b b-light text-[10px]">
            <th class="py-1 px-2 text-left" style="color:var(--t-secondary)">Code</th>
            <th class="py-1 px-2 text-left" style="color:var(--t-secondary)">Libellé</th>
            <th class="py-1 px-2 text-left" style="color:var(--t-secondary)">Marque</th>
            <th class="py-1 px-2 text-right" style="color:var(--t-secondary)">CA Réseau</th>
            <th class="py-1 px-2 text-right" style="color:var(--t-secondary)">CA Zone</th>
            <th class="py-1 px-2 text-right" style="color:var(--t-secondary)">Cli Zone</th>
            <th class="py-1 px-2 text-right" style="color:var(--t-secondary)">Détention</th>
          </tr></thead><tbody>`;
    for (const a of p.items) {
      const detColor = a.detention >= 60 ? '#22c55e' : a.detention >= 30 ? '#f59e0b' : '#ef4444';
      html += `<tr class="border-b b-light hover:s-panel-inner transition-colors cursor-pointer" onclick="if(window.openArticlePanel)window.openArticlePanel('${a.code}','planRayon')">
        <td class="py-1 px-2 font-mono text-[10px]">${a.code} <span class="opacity-50 hover:opacity-100">🔍</span></td>
        <td class="py-1 px-2 truncate max-w-[220px]" title="${escapeHtml(a.libelle)}">${escapeHtml(a.libelle)}</td>
        <td class="py-1 px-2 text-[10px] t-secondary">${escapeHtml(a.marque || '—')}</td>
        <td class="py-1 px-2 text-right font-bold">${formatEuro(a.caReseau)}</td>
        <td class="py-1 px-2 text-right" style="color:#3b82f6">${a.caZone ? formatEuro(a.caZone) : '—'}</td>
        <td class="py-1 px-2 text-right">${a.nbClientsZone || '—'}</td>
        <td class="py-1 px-2 text-right font-bold" style="color:${detColor}">${a.detention}%</td>
      </tr>`;
    }
    html += `</tbody></table></div></div>`;
  }

  // Already in stock
  if (kit.alreadyInStock.length) {
    html += `<details class="mb-4"><summary class="text-[11px] t-secondary cursor-pointer hover:t-primary">
      ✅ ${kit.alreadyInStock.length} refs déjà en stock — base existante
    </summary><div class="mt-2 overflow-x-auto"><table class="w-full text-[10px]">
      <thead><tr class="border-b b-light">
        <th class="py-1 px-2 text-left">Code</th><th class="py-1 px-2 text-left">Libellé</th>
        <th class="py-1 px-2 text-left">Rôle</th><th class="py-1 px-2 text-right">CA Réseau</th>
      </tr></thead><tbody>`;
    for (const a of kit.alreadyInStock.sort((x, y) => y.caReseau - x.caReseau).slice(0, 30)) {
      const rb = ROLE_BADGE[a.role];
      html += `<tr class="border-b b-light hover:s-panel-inner cursor-pointer" onclick="if(window.openArticlePanel)window.openArticlePanel('${a.code}','planRayon')">
        <td class="py-1 px-2 font-mono">${a.code} <span class="opacity-50 hover:opacity-100">🔍</span></td>
        <td class="py-1 px-2">${escapeHtml(a.libelle)}</td>
        <td class="py-1 px-2">${rb?.icon || ''} ${rb?.label || ''}</td>
        <td class="py-1 px-2 text-right">${formatEuro(a.caReseau)}</td>
      </tr>`;
    }
    html += `</tbody></table></div></details>`;
  }

  // Export buttons
  html += `<div class="flex gap-2 mt-3">
    <button onclick="window._prExportConquete('${fam.codeFam}')"
      class="text-[11px] t-secondary border b-light rounded px-3 py-1 hover:t-primary cursor-pointer s-card">⬇ CSV Kit</button>
    <button onclick="window._prCopyConqueteLLM('${fam.codeFam}')"
      class="text-[10px] px-2 py-1 rounded border"
      style="border-color:#7c3aed;color:#7c3aed;background:rgba(124,58,237,0.06)">🧠 Pour LLM</button>
  </div>`;
  return html;
}

// ── Contenu onglet détail ────────────────────────────────────────────
function _prGetTabContent(tab, fam) {
  if (tab === 'conquete') return _prRenderConquete(fam);
  if (tab === 'pilotage') return _prRenderPilotage(fam);
  if (tab === 'rayon') {
    const rayonData = computeMonRayon(fam.codeFam, _prOpenSousFam || '');
    // Index code → classification Squelette (sans écraser status Mon Rayon)
    const sqData = _prGetSqDataCached();
    const sqClassif = _prGetSqClassifMapCached(sqData);
    // Filtres structurels uniquement — ruptures (stockActuel=0) incluses
    const abc  = document.getElementById('filterABC')?.value || '';
    const fmr  = document.getElementById('filterFMR')?.value || '';
    const stat = document.getElementById('filterStatut')?.value || '';
    const empNeedles = _prEmpFilter
      ? _prEmpFilter.split(';').map(e => e.trim().toLowerCase()).filter(Boolean)
      : null;
    const hasSF = _prSelectedSFs.size > 0;
    const hasMarque = _prSelectedMarques.size > 0;
    const catFam = _S.catalogueFamille;
    const catMarques = _S.catalogueMarques;
    const filteredMonRayonFinal = [];
    for (const a of (rayonData?.monRayon || [])) {
      if (empNeedles?.length) {
        const emp = (a.emplacement || '').toLowerCase();
        let empOk = false;
        for (const needle of empNeedles) {
          if (emp.includes(needle)) { empOk = true; break; }
        }
        if (!empOk) continue;
      }
      if (abc  && a.abcClass !== abc) continue;
      if (fmr  && a.fmrClass !== fmr) continue;
      if (stat && (a.statut || '') !== stat) continue;
      if (hasSF) {
        const csf = catFam?.get(a.code)?.codeSousFam || '';
        if (!_prSelectedSFs.has(csf)) continue;
      }
      if (hasMarque) {
        const mq = catMarques?.get(a.code) || '';
        if (!_prSelectedMarques.has(mq)) continue;
      }
      a.sqClassif = sqClassif.get(a.code) || null;
      filteredMonRayonFinal.push(a);
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
  if (tab === 'reseau')     return _prRenderReseau(fam);
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
  const myV = _S.ventesParMagasin?.[myStore] || {};
  const incont = [];
  for (const code of incontCodes) {
    const myData = myV[code];
    const myFreq = myData?.countBL || 0;
    const myCA   = myData?.sumCA || 0;
    // Médiane réseau
    const csFreqs = [];
    for (const [st, arts] of Object.entries(_S.ventesParMagasin || {})) {
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

    ${!pepites.length && !boulets.length ? '<div class="py-4 text-center t-disabled text-sm italic">Aucune pépite ni boulet identifié dans cette famille — données benchmark insuffisantes.</div>' : ''}
  </div>`;
}

// ── Panel détail famille ─────────────────────────────────────────────
function _prRenderDetail(codeFam) {
  const fam = _prFindFam(codeFam);
  if (!fam) return '<div class="t-disabled text-sm text-center py-4">Famille introuvable.</div>';

  const b = ACTION_BADGE[fam.classifGlobal] || ACTION_BADGE.surveiller;
  const sousFamLib = _prOpenSousFam
    ? (_S.catalogueFamille
        ? [..._S.catalogueFamille.values()]
            .find(f => f.codeFam === codeFam && f.codeSousFam === _prOpenSousFam)
            ?.sousFam || _prOpenSousFam
        : _prOpenSousFam)
    : '';
  const _hasBenchPepites = (_S.benchLists?.pepites?.length || 0) + (_S.benchLists?.pepitesOther?.length || 0) > 0;
  const tabs = _prConqueteMode
    ? [{ key: 'conquete', label: '🚀 Kit de Démarrage' }]
    : [
        { key: 'pilotage',   label: '🧭 Pilotage'  },
        { key: 'metiers',    label: '🎯 Métiers'   },
        { key: 'analyse',    label: '📦 Analyse'   },
        ...(_hasBenchPepites ? [{ key: 'reseau', label: '🏆 Réseau' }] : []),
      ];

  const cc = ACTION_BADGE[fam.classifGlobal] || ACTION_BADGE.surveiller;
  return `<div id="prDetailPanel" class="rounded-xl p-3" style="background:${cc.cardBg};border:1px solid ${cc.cardBorder};box-shadow:0 2px 12px ${cc.cardBorder}">
    <div class="flex items-center justify-between mb-3">
      <div class="flex items-center gap-2 flex-wrap">
        <span class="text-[14px] font-extrabold t-primary">${escapeHtml(fam.libFam)}</span>
        <span class="text-[10px] t-disabled">${fam.codeFam}</span>
        ${sousFamLib ? `<span class="text-[10px] t-disabled mx-1">›</span><span class="text-[12px] t-secondary font-medium">${escapeHtml(sousFamLib)}</span>` : ''}
        <span class="text-[9px] px-2 py-0.5 rounded-full font-bold" style="background:${b.bg};color:${b.color}">${b.icon} ${b.label}</span>
      </div>
      <div class="flex items-center gap-1.5 flex-shrink-0">
        <button onclick="window._animFromFamily('${fam.codeFam}')"
          class="text-[10px] px-2 py-1 rounded font-bold flex-shrink-0"
          style="background:#f59e0b;color:#000;border:1px solid #d97706"
          title="Préparer une animation commerciale sur cette famille">
          ⚡ Animation
        </button>
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
    ${_S.chalandiseReady && _prHasChalDist() ? `
    <div class="flex items-center gap-1.5 mb-2 px-1">
      <span class="text-[10px] t-disabled">📍 Distance :</span>
      ${[{v:0,l:'Tous'},{v:2,l:'2 km'},{v:5,l:'5 km'},{v:10,l:'10 km'},{v:15,l:'15 km'},{v:30,l:'30 km'}].map(d=>
        `<button onclick="window._prMetierDistChange(${d.v||100})" data-prdist="${d.v}"
          class="dist-quick-btn text-[9px] py-0.5 px-2 rounded-full border b-default s-hover t-secondary font-bold cursor-pointer"
          style="${(!_prMetierDist&&!d.v)||(_prMetierDist===d.v)?'background:var(--c-action,#8b5cf6);color:#fff;border-color:var(--c-action,#8b5cf6)':''}">${d.l}</button>`
      ).join('')}
    </div>` : ''}
    <div class="flex flex-wrap gap-0 mb-1 border-b b-light">
      ${tabs.map(t => `<button onclick="window._prSetTab('${t.key}')" data-prtab="${t.key}"
        class="text-[11px] px-4 py-2 cursor-pointer border-b-2 transition-colors ${_prDetailTab === t.key ? 'font-bold' : 'hover:t-primary'}"
        style="${_prDetailTab === t.key ? 'border-color:var(--c-action);color:var(--t-primary)' : 'border-color:transparent;color:var(--t-secondary)'}">${t.label}</button>`).join('')}
    </div>
    <div class="text-[9px] t-disabled px-4 pb-2">
      🧭 Pilotage : historique complet · Métiers : historique complet
    </div>
    <div id="prDetailContent">${_prGetTabContent(_prDetailTab, fam)}</div>
  </div>`;
}

// ── Bandeau performance agence ───────────────────────────────────────
function _prPerfBanner() {
  const sp = _S.benchLists?.storePerf || {};
  const spSorted = Object.entries(sp).sort((a, b) => (b[1].ca || 0) - (a[1].ca || 0));
  const myRankIdx = spSorted.findIndex(([s]) => s === _S.selectedMyStore);
  const myPerf = sp[_S.selectedMyStore];
  const hasBench = spSorted.length > 1 && myPerf;
  if (!hasBench) return '';
  const medianCA = spSorted.map(([, d]) => d.ca || 0).sort((a, b) => a - b)[Math.floor(spSorted.length / 2)];
  const ecartMed = Math.round((myPerf.ca || 0) - medianCA);

  // Tableau classement agences — trouver le #1 par colonne
  const best = { ca: '', tm: '', refs: '', cli: '', caCli: '' };
  let maxCA = -1, maxTM = -1, maxRefs = -1, maxCli = -1, maxCaCli = -1;
  for (const [store, data] of spSorted) {
    const ca = data.ca || 0;
    const refs = data.ref || 0;
    const nbCli = data.nbClients || 0;
    const caCli = data.caClient || (nbCli > 0 ? Math.round(ca / nbCli) : 0);
    if (ca > maxCA)            { maxCA = ca;            best.ca    = store; }
    if ((data.txMarge||0) > maxTM) { maxTM = data.txMarge; best.tm    = store; }
    if (refs > maxRefs)        { maxRefs = refs;        best.refs  = store; }
    if (nbCli > maxCli)        { maxCli = nbCli;       best.cli   = store; }
    if (caCli > maxCaCli)      { maxCaCli = caCli;     best.caCli = store; }
  }
  const gold = 'background:linear-gradient(135deg,#fbbf24,#f59e0b);color:#000;border-radius:4px;padding:0 3px;font-weight:800';

  let rows = '';
  spSorted.forEach(([store, data], idx) => {
    const isMe = store === _S.selectedMyStore;
    const ca = data.ca || 0;
    const tm = data.txMarge > 0 ? data.txMarge.toFixed(2) + '%' : '—';
    const tmColor = data.txMarge > 0 ? (data.txMarge >= 35 ? 'c-ok' : data.txMarge >= 25 ? 'c-caution' : 'c-danger') : 't-disabled';
    const refs = data.ref || 0;
    const nbCli = data.nbClients || 0;
    const caCli = data.caClient || (nbCli > 0 ? Math.round(ca / nbCli) : 0);
    const g = (col) => store === best[col] ? ` style="${gold}"` : '';
    rows += `<tr class="border-b b-light ${isMe ? 'i-info-bg font-bold' : 'hover:s-card-alt'}">
      <td class="py-1.5 px-2 text-[11px]"><span class="${isMe ? 'font-extrabold' : ''}">${isMe ? '⭐ ' : ''}${store}</span></td>
      <td class="py-1.5 px-2 text-right text-[11px] ${isMe ? 'c-action font-extrabold' : 'font-bold'}"><span${g('ca')}>${formatEuro(ca)}</span></td>
      <td class="py-1.5 px-2 text-center text-[10px] font-bold ${tmColor}"><span${g('tm')}>${tm}</span></td>
      <td class="py-1.5 px-2 text-center text-[10px]"><span${g('refs')}>${refs.toLocaleString('fr')}</span></td>
      <td class="py-1.5 px-2 text-center text-[10px]"><span${g('cli')}>${nbCli.toLocaleString('fr')}</span></td>
      <td class="py-1.5 px-1 text-right text-[10px] font-bold whitespace-nowrap"><span${g('caCli')}>${formatEuro(caCli)}</span></td>
      <td class="py-1.5 px-2 text-center"><span class="text-[10px] font-bold ${isMe ? 'c-action' : ''}">#${idx + 1}</span></td>
    </tr>`;
  });

  // Préciseur : source du CA (tous canaux livrés au PDV + période)
  const _perLabel = (() => {
    const ps = _S.periodFilterStart, pe = _S.periodFilterEnd;
    if (!ps && !pe) return 'période complète fichier';
    const fmt = d => d ? `${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}` : '…';
    return `${fmt(ps)} → ${fmt(pe)}`;
  })();
  const _srcTip = `Source : consommé · tous canaux livrés au PDV · ${_perLabel}`;

  return `<details class="mb-3 rounded-xl overflow-hidden" style="background:linear-gradient(135deg,rgba(99,153,34,0.12),rgba(55,138,221,0.08));border:1px solid rgba(99,153,34,0.2)">
    <summary class="flex flex-wrap items-center gap-3 px-3 py-2 cursor-pointer select-none text-[11px]" style="list-style:none">
      <span class="font-extrabold text-[13px]" style="color:var(--c-action,#8b5cf6)" title="Classement CA agence dans le réseau">#${myRankIdx + 1}<span class="text-[10px] font-normal t-disabled">/${spSorted.length}</span></span>
      <span class="t-secondary" title="${_srcTip}">CA <b class="t-primary">${formatEuro(myPerf.ca || 0)}</b> <em class="info-tip" data-tip="${_srcTip}">ℹ</em></span>
      <span class="t-secondary">Tx marge <b class="${(myPerf.txMarge || 0) >= 35 ? 'c-ok' : (myPerf.txMarge || 0) >= 25 ? 'c-caution' : 'c-danger'}">${(myPerf.txMarge || 0).toFixed(2)}%</b></span>
      <span class="t-secondary">Refs <b class="t-primary">${(myPerf.ref || 0).toLocaleString('fr')}</b></span>
      <span class="t-secondary">CA/client <b class="t-primary">${formatEuro(myPerf.caClient || 0)}</b></span>
      <span style="color:${ecartMed >= 0 ? '#22c55e' : '#ef4444'}" title="Écart vs médiane réseau">${ecartMed >= 0 ? '▲' : '▼'} ${formatEuro(Math.abs(ecartMed))} vs médiane</span>
      <span class="t-disabled text-[9px] ml-auto">▶ classement</span>
    </summary>
    <div class="px-2 pb-2 overflow-x-auto">
      <table class="min-w-full text-xs">
        <thead><tr class="text-[9px] t-disabled uppercase">
          <th class="py-1 px-2 text-left">Agence</th>
          <th class="py-1 px-2 text-right">CA</th>
          <th class="py-1 px-2 text-center">Marge</th>
          <th class="py-1 px-2 text-center">Refs</th>
          <th class="py-1 px-2 text-center">Clients</th>
          <th class="py-1 px-1 text-right whitespace-nowrap">CA/cli.</th>
          <th class="py-1 px-2 text-center">Rang</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  </details>`;
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
    <div class="flex items-center gap-3 mb-2">
      <h3 class="font-extrabold text-sm t-primary">${data.families.length} familles analysées</h3>
      ${totals.specialiste ? `<span class="text-[10px] font-bold px-2 py-0.5 rounded-full" style="background:rgba(13,148,136,0.2);color:#2dd4bf">🎯 ${totals.specialiste} spé.</span>` : ''}
    </div>
    <div class="grid grid-cols-5 gap-2 mb-3" ${_prOpenFam ? 'style="display:none"' : ''}>
      ${_badge('socle', totals.socle)}
      ${_badge('implanter', totals.implanter)}
      ${_badge('challenger', totals.challenger)}
      ${_badge('surveiller', totals.surveiller)}
      ${totals.inactive ? `<button onclick="window._prSetFilter('inactive')" data-prbadge="inactive"
        class="flex flex-col items-center p-2 rounded-lg border cursor-pointer transition-all ${_prFilterClassif === 'inactive' ? 's-panel-inner' : 's-card'}"
        style="${_prFilterClassif === 'inactive' ? 'box-shadow:0 0 0 2px #4b5563' : ''}"
        title="${totals.inactive} familles CA < 500€ et < 5 refs — Mode Conquête disponible">
        <span class="text-[16px]">💤</span><span class="text-[11px] font-bold">${totals.inactive}</span><span class="text-[9px] t-disabled">Inactives</span>
      </button>` : ''}
    </div>
    <div class="relative mb-3">
      <div id="prSearchResults" class="hidden fixed s-card border rounded-xl shadow-xl max-h-[640px] overflow-y-auto z-[9999]"></div>
    </div>
    ${_prEmpFilter ? `<div class="flex items-center gap-2 mb-2"><span class="text-[11px] t-secondary">📍 ${escapeHtml(_prEmpFilter)}</span><button onclick="window._prSelectEmp('')" class="text-[10px] t-disabled hover:t-primary">✕</button></div>` : ''}
    <details class="mb-3" ${_prOpenFam ? 'style="display:none"' : ''}>
      <summary class="text-[10px] t-disabled cursor-pointer hover:t-primary select-none">📖 Glossaire — Matrice Physigamme × Squelette</summary>
      <div class="mt-2 s-card border rounded-xl p-4 text-[10px] t-secondary overflow-x-auto">
        <div class="mb-3 text-[11px] t-primary font-bold">Classification des familles</div>
        <div class="grid grid-cols-2 gap-x-4 gap-y-1 mb-4">
          <div><span style="color:#22c55e">🟢 Bien couverte (Socle)</span> — Santé ≥ 80% ET perf réseau au-dessus de la médiane</div>
          <div><span style="color:#3b82f6">🔵 À développer</span> — Fort potentiel externe (>30k€) ou faible captation sur gros marché</div>
          <div><span style="color:#ef4444">🔴 À retravailler</span> — Santé < 50% OU sous-performance réseau (< 80% médiane)</div>
          <div><span style="color:#64748b">👁️ À surveiller</span> — Santé 50-79%, ni critique ni confortable</div>
        </div>
        <div class="mb-3 text-[11px] t-primary font-bold">Rôles articles (Physigamme)</div>
        <div class="grid grid-cols-2 gap-x-4 gap-y-1 mb-4">
          <div>🏆 <strong>Incontournable</strong> — Détention réseau ≥ 60% ou ABC-A + forte fréquence</div>
          <div>🆕 <strong>Nouveauté</strong> — Article < 90 jours, adopté par 2+ agences</div>
          <div>🎯 <strong>Spécialiste</strong> — >50% des acheteurs sont des métiers stratégiques</div>
          <div>📦 <strong>Standard</strong> — Reste de la gamme, demande locale prouvée</div>
        </div>
        <div class="mb-2 text-[11px] t-primary font-bold">Matrice de décision — Squelette × Physigamme</div>
        <table class="w-full text-[10px] border-collapse" style="border:1px solid var(--color-border-secondary)">
          <thead><tr style="background:var(--color-bg-secondary)">
            <th class="p-1.5 text-left border" style="border-color:var(--color-border-secondary);width:18%">Squelette ↓ / Rôle →</th>
            <th class="p-1.5 text-center border" style="border-color:var(--color-border-secondary)">🏆 Incontournable</th>
            <th class="p-1.5 text-center border" style="border-color:var(--color-border-secondary)">🆕 Nouveauté</th>
            <th class="p-1.5 text-center border" style="border-color:var(--color-border-secondary)">🎯 Spécialiste</th>
            <th class="p-1.5 text-center border" style="border-color:var(--color-border-secondary)">📦 Standard</th>
          </tr></thead>
          <tbody>
            <tr><td class="p-1.5 font-bold border" style="border-left:3px solid #22c55e;border-color:var(--color-border-secondary)">Socle (en stock, performant)</td>
              <td class="p-1.5 border" style="border-color:var(--color-border-secondary)"><strong>Le Capitaine</strong> — Produit star. Zéro rupture.</td>
              <td class="p-1.5 border" style="border-color:var(--color-border-secondary)"><strong>La Bonne Pioche</strong> — Nouveauté qui a trouvé son public. Observer.</td>
              <td class="p-1.5 border" style="border-color:var(--color-border-secondary)"><strong>Le Lien Fort</strong> — Niche qui soude tes clients. Maintenir.</td>
              <td class="p-1.5 border" style="border-color:var(--color-border-secondary)"><strong>Le Bon Soldat</strong> — Fond de rayon qui tourne. Maintenir.</td>
            </tr>
            <tr><td class="p-1.5 font-bold border" style="border-left:3px solid #f59e0b;border-color:var(--color-border-secondary)">À surveiller (perf incertaine)</td>
              <td class="p-1.5 border" style="border-color:var(--color-border-secondary)"><strong>L'Alerte Rouge</strong> — Danger ! Analyse immédiate.</td>
              <td class="p-1.5 border" style="border-color:var(--color-border-secondary)"><strong>Le Stagiaire</strong> — Normal, 90-120j pour faire ses preuves.</td>
              <td class="p-1.5 border" style="border-color:var(--color-border-secondary)"><strong>Le Point de Rupture</strong> — Client qui s'en va ? Contacter.</td>
              <td class="p-1.5 border" style="border-color:var(--color-border-secondary)"><strong>Le Déclinant</strong> — Réduire le stock, observer.</td>
            </tr>
            <tr><td class="p-1.5 font-bold border" style="border-left:3px solid #ef4444;border-color:var(--color-border-secondary)">Challenger (en stock, dormant)</td>
              <td class="p-1.5 border" style="border-color:var(--color-border-secondary)"><strong>La Réf Schizo</strong> — Divorce de confiance. Sortir.</td>
              <td class="p-1.5 border" style="border-color:var(--color-border-secondary)"><strong>L'Erreur de Casting</strong> — N'a pas pris. Sortir.</td>
              <td class="p-1.5 border" style="border-color:var(--color-border-secondary)"><strong>La Trahison</strong> — Client parti ou achète ailleurs. Sortir + appeler.</td>
              <td class="p-1.5 border" style="border-color:var(--color-border-secondary)"><strong>Le Poids Mort</strong> — Ne se vend plus. Sortir, libérer le cash.</td>
            </tr>
            <tr><td class="p-1.5 font-bold border" style="border-left:3px solid #3b82f6;border-color:var(--color-border-secondary)">À implanter (pas en stock)</td>
              <td class="p-1.5 border" style="border-color:var(--color-border-secondary)"><strong>Le Trou Critique</strong> — Autoroute de CA ignorée. Implanter sans discuter.</td>
              <td class="p-1.5 border" style="border-color:var(--color-border-secondary)"><strong>Le Pari du Réseau</strong> — Early adopters. Implanter si clientèle cible.</td>
              <td class="p-1.5 border" style="border-color:var(--color-border-secondary)"><strong>La Conquête</strong> — Signal fort aux clients stratégiques. Implanter.</td>
              <td class="p-1.5 border" style="border-color:var(--color-border-secondary)"><strong>L'Opportunité Locale</strong> — Demande locale prouvée. Analyser puis implanter.</td>
            </tr>
          </tbody>
        </table>
      </div>
    </details>
  </div>
  ${_prOpenFam ? `<div class="grid grid-cols-[280px_1fr] gap-3" style="min-height:400px;overflow:hidden">
    <div style="max-height:calc(100vh - 200px);overflow-y:auto;min-width:0" class="border-r b-light pr-2">
      ${_prBuildCompactList(data)}
    </div>
    <div style="min-width:0">${_prRenderDetail(_prOpenFam)}</div>
  </div>` : `<div id="prFamGrid" class="grid grid-cols-1 sm:grid-cols-2 gap-3">
    ${(_prFilterClassif || _prSearchText || _prEmpFilter)
      ? _prBuildCards(data, _prSearchText)
      : '<div class="col-span-2 text-center py-8 t-disabled text-[12px]">Cliquez sur une catégorie ou recherchez une famille</div>'}
  </div>`}`;
}

// ── Rerender + search ─────────────────────────────────────────────────
function _prRerender() {
  const el = document.getElementById('planRayonBlock');
  if (!el || !_S._prData) return;
  el.innerHTML = _prPerfBanner() + _prTopTabBar() + (_prTopView === 'metier' ? _renderPilotageMetierContent() : _prTopView === 'palmares' ? _renderPalmaresContent() : _renderPlanRayonContent(_S._prData));
  if (_prTopView === 'famille') _initPrSearch();
  if (_prTopView === 'metier') _initPrMetierInput();
}

function _initPrMetierInput() {
  const input = document.getElementById('prMetierInput');
  const dl = document.getElementById('prMetierDatalist');
  if (!input || !dl) return;
  const metierOpts = [];
  for (const [metier, clients] of (_S.clientsByMetier || new Map())) {
    if (!metier || metier === '-' || metier.trim() === '') continue;
    metierOpts.push({ metier, nb: clients.size });
  }
  metierOpts.sort((a, b) => b.nb - a.nb);
  let timer;
  input.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      const q = (input.value || '').trim().toLowerCase();
      if (!q || q.length < 2) { dl.innerHTML = ''; return; }
      const exact = metierOpts.find(m => m.metier.toLowerCase() === q);
      if (exact) { dl.innerHTML = ''; window._prSelectMetier(exact.metier); return; }
      const matches = metierOpts.filter(m => m.metier.toLowerCase().includes(q)).slice(0, 12);
      dl.innerHTML = matches.map(m => `<option value="${escapeHtml(m.metier)}">`).join('');
    }, 150);
  });
  input.addEventListener('change', () => {
    const v = (input.value || '').trim();
    const match = metierOpts.find(m => m.metier === v);
    if (match) window._prSelectMetier(match.metier);
    else if (!v) window._prSelectMetier('');
  });
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
    const _clr = document.getElementById('prSearchClear');
    if (_clr) _clr.classList.toggle('hidden', !input.value);
    clearTimeout(debounce);
    debounce = setTimeout(() => {
      const q = input.value.trim().toLowerCase();
      if (q.length < 2) { results.classList.add('hidden'); return; }
      // Mode multi-codes : ≥2 tokens numériques → appliquer directement comme filtre de cartes
      const _mcTokens = q.split(/[\s,;\t]+/).filter(Boolean);
      if (_mcTokens.length >= 2 && _mcTokens.every(t => /^\d{5,7}$/.test(t))) {
        results.classList.add('hidden');
        _prSearchText = q;
        window._prRenderAll?.();
        return;
      }
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
          : e.level === 4
            ? `window._prQuickRefGo('${e.code}')`
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
      const q = input.value.trim();
      results.classList.add('hidden');
      // Si code article 6 chiffres → navigation directe
      if (/^\d{6}$/.test(q)) {
        window._prQuickRefGo(q);
        input.value = '';
        return;
      }
      _prSearchText  = q.toLowerCase();
      _prOpenFam     = null;
      const grid = document.getElementById('prFamGrid');
      if (grid && _S._prData) grid.innerHTML = _prBuildCards(_S._prData, _prSearchText);
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
  if (grid) grid.style.display = '';
  if (grid && _S._prData) grid.innerHTML = _prFilterClassif
    ? _prBuildCards(_S._prData, '')
    : '<div class="col-span-2 text-center py-8 t-disabled text-[12px]">Cliquez sur une catégorie ou recherchez une famille</div>';
  const panel = document.getElementById('prDetailPanel');
  if (panel) panel.remove();
  document.querySelectorAll('[data-prbadge]').forEach(btn => {
    const k = btn.dataset.prbadge;
    const b = ACTION_BADGE[k];
    if (!b) return;
    const active = _prFilterClassif === k;
    const isGradient = btn.style.background?.includes('gradient');
    if (isGradient) {
      btn.style.opacity = active ? '1' : '0.78';
      btn.style.boxShadow = active ? '0 0 0 3px rgba(255,255,255,0.45),0 4px 12px rgba(0,0,0,0.3)' : '0 2px 8px rgba(0,0,0,0.25)';
    } else {
      btn.className = `flex flex-col items-center p-2 rounded-lg border cursor-pointer transition-all ${active ? 's-panel-inner' : 's-card'}`;
      btn.style.boxShadow = active ? `0 0 0 2px ${b.color}` : '';
    }
  });
};

window._prOpenDetail = function(codeFam) {
  _prOpenFam = codeFam;
  _prOpenSousFam = '';
  _S._prSqFilter = '';
  _prSqPage = 50;
  _prSqSort = 'reseau'; _prSqSortAsc = false;
  _prPilotSort = 'verdict'; _prPilotSortAsc = false;
  _prMetierDist = 0;
  _prSelectedSFs.clear();
  _prSelectedEmps.clear();
  // Detect if this is an inactive family → force conquest mode
  const isInactive = _S._prData?.inactiveFamilies?.some(f => f.codeFam === codeFam);
  _prConqueteMode = !!isInactive;
  _prDetailTab = isInactive ? 'conquete' : 'pilotage';
  _prRerender();
  setTimeout(() => {
    const panel = document.getElementById('prDetailPanel');
    if (panel) panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
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
  _prConqueteMode = false;
  _prMetierDist = 0;
  _prEmpFilter = '';
  _prSelectedSFs.clear();
  _prSelectedEmps.clear();
  _prRerender();
};

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
    const active = btn.dataset.prtab === tab;
    btn.className = `text-[11px] px-4 py-2 cursor-pointer border-b-2 transition-colors ${active ? 'font-bold' : 'hover:t-primary'}`;
    btn.style.borderColor = active ? 'var(--c-action)' : 'transparent';
    btn.style.color       = active ? 'var(--t-primary)' : 'var(--t-secondary)';
  });
  const fam = _prFindFam(_prOpenFam);
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

// ── Pilotage handlers ──
window._prPilotFilterFn = function(key) {
  _prPilotFilter = _prPilotFilter === key ? '' : key;
  _prPilotVerdict = ''; // reset verdict filter on classif change
  _prPilotRole = '';    // reset role filter on classif change
  // Auto-tri par potentiel quand on filtre "implanter"
  if (_prPilotFilter === 'implanter') _prPilotSort = 'potentiel';
  _prPilotPage = 60;
  _prRerenderDetail();
};
window._prPilotVerdictFn = function(name) {
  _prPilotVerdict = _prPilotVerdict === name ? '' : name;
  _prPilotPage = 60;
  _prRerenderDetail();
};
window._prPilotRoleFn = function(role) {
  _prPilotRole = _prPilotRole === role ? '' : role;
  _prPilotPage = 60;
  _prRerenderDetail();
};
window._prPilotSortFn = function(key) {
  if (_prPilotSort === key) _prPilotSortAsc = !_prPilotSortAsc;
  else { _prPilotSort = key; _prPilotSortAsc = false; }
  _prRerenderDetail();
};
window._prMorePilot = function() {
  _prPilotPage += 60;
  _prRerenderDetail();
};
window._prExportPilotage = function() {
  const sqData = _S._prSqData;
  if (!sqData || !_prOpenFam) return;
  const codeFam = _prOpenFam;
  const catFam = _S.catalogueFamille;
  const roles = _prComputeRoles(codeFam);
  const fdMap = _prGetFdMap();
  const CLASSIFS = ['socle', 'implanter', 'challenger', 'surveiller'];
  const arts = [];
  for (const d of sqData.directions) {
    for (const g of CLASSIFS) {
      for (const a of (d[g] || [])) {
        const cfCat = catFam?.get(a.code)?.codeFam;
        const cfArt = _S.articleFamille?.[a.code] || '';
        if (cfCat !== codeFam && !((!cfCat && cfArt.startsWith(codeFam)) || cfArt === codeFam)) continue;
        const role = roles.get(a.code) || 'standard';
        const v = _prVerdict(g, role, a.code);
        arts.push({ ...a, _g: g, role, verdict: v, W: a.W || (fdMap.get(a.code)?.W || 0) });
      }
    }
  }
  // Appliquer les mêmes filtres que l'affichage
  let filtered = arts;
  if (_prPilotFilter) filtered = filtered.filter(a => a._g === _prPilotFilter);
  if (_prPilotVerdict) filtered = filtered.filter(a => a.verdict.name === _prPilotVerdict);
  if (_prPilotRole) filtered = filtered.filter(a => a.role === _prPilotRole);
  const rows = filtered.map(a => {
    const sf = catFam?.get(a.code)?.sousFam || '';
    const lib = a.libelle || articleLib(a.code);
    const caZ = +(a.caClientsZone || 0);
    const pdm = caZ > 0 ? Math.round((a.caAgence || 0) / caZ * 100) : '';
    const local = _isLocalIncont(a.code, a.role) ? 'LOCAL' : '';
    return [a.code, lib, a.emplacement || '', sf, a.stockActuel || 0, a.W,
      a.nbClientsPDV || 0, caZ.toFixed(2), a.nbClientsZone || 0, pdm, a._g, a.role, a.verdict.name, local].join(';');
  });
  const csv = ['Code;Libellé;Emplacement;SF;Stock;Vte 90J;Cli PDV;CA Zone;Cli Zone;PdM%;Classif;Rôle;Verdict;Local', ...rows].join('\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const suffix = _prPilotVerdict ? `_${_prPilotVerdict.replace(/[^a-zA-Z0-9]/g, '_')}` : (_prPilotFilter || '');
  a.href = url; a.download = `pilotage_${codeFam}${suffix ? '_' + suffix : ''}.csv`; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

// ── Mode Conquête handlers ──
window._prExportConquete = function(codeFam) {
  const kit = _prBuildConqueteKit(codeFam);
  if (!kit.totalKit) return;
  const rows = [];
  for (const p of kit.priorities) {
    for (const a of p.items) {
      rows.push([p.label, a.code, a.libelle, a.sousFam, a.marque,
        a.role, a.caReseau.toFixed(2), a.caZone.toFixed(2), a.nbClientsZone, a.detention + '%'].join(';'));
    }
  }
  const csv = ['Priorité;Code;Libellé;Sous-famille;Marque;Rôle;CA Réseau;CA Zone;Cli Zone;Détention', ...rows].join('\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `kit-conquete_${codeFam}.csv`; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

window._prCopyConqueteLLM = function(codeFam) {
  const fam = _prFindFam(codeFam);
  if (!fam) return;
  const kit = _prBuildConqueteKit(codeFam);
  const lib = (code) => articleLib(code);

  let pack = `Tu es un expert en gestion de rayon B2B spécialisé en distribution professionnelle.\n`;
  pack += `Un chef d'agence veut LANCER un nouveau rayon sur une famille qu'il ne commercialise pas encore.\n`;
  pack += `Ton rôle : analyser le Kit de Démarrage ci-dessous et produire un plan d'implantation opérationnel.\n\n`;
  pack += `STRUCTURE TA RÉPONSE EN 5 SECTIONS :\n`;
  pack += `1. LA PHRASE À RETENIR — Résume en une phrase percutante pourquoi ce rayon vaut le coup\n`;
  pack += `2. ANALYSE DU POTENTIEL — Chiffres clés : CA zone, nb clients zone, détention réseau\n`;
  pack += `3. LE PLAN D'IMPLANTATION — Priorise le kit par vagues (V1 immédiat, V2 M+1, V3 M+3)\n`;
  pack += `4. OBJECTIF CHIFFRÉ — CA cible M+3, M+6, nombre de clients à capter\n`;
  pack += `5. LA LEÇON STRATÉGIQUE — Ce que ce lancement dit de la stratégie de l'agence\n\n`;
  pack += `═══════════════════════════════════════════════════\n`;
  pack += `MODE CONQUÊTE : ${fam.libFam} (${fam.codeFam})\n`;
  pack += `Agence : ${_S.selectedMyStore || '?'}\n`;
  pack += `═══════════════════════════════════════════════════\n\n`;

  for (const p of kit.priorities) {
    if (!p.items.length) continue;
    const caP = p.items.reduce((s, a) => s + a.caReseau, 0);
    pack += `[${p.label} — ${p.items.length} refs · ${formatEuro(caP)}]\n`;
    pack += `${p.desc}\n`;
    for (const a of p.items) {
      pack += `  - ${a.code} ${lib(a.code) || a.libelle} · CA réseau ${formatEuro(a.caReseau)} · CA zone ${a.caZone ? formatEuro(a.caZone) : '—'} · ${a.nbClientsZone || 0} cli zone · détention ${a.detention}%\n`;
    }
    pack += `\n`;
  }

  if (kit.alreadyInStock.length) {
    pack += `[DÉJÀ EN STOCK — ${kit.alreadyInStock.length} refs existantes]\n`;
    for (const a of kit.alreadyInStock.sort((x, y) => y.caReseau - x.caReseau).slice(0, 15)) {
      pack += `  - ${a.code} ${lib(a.code) || a.libelle} · ${ROLE_BADGE[a.role]?.icon || ''} ${a.role}\n`;
    }
    pack += `\n`;
  }

  pack += `[CONTEXTE]\n`;
  pack += `- Refs totales dans le réseau pour cette famille : ${kit.allArticles.length}\n`;
  pack += `- Refs proposées dans le kit : ${kit.totalKit}\n`;
  pack += `- Refs déjà en stock : ${kit.alreadyInStock.length}\n`;
  pack += `═══════════════════════════════════════════════════\n`;
  pack += `Maintenant, applique les 5 sections.\n`;

  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(pack).then(() => {
      const btn = document.querySelector('[onclick*="_prCopyConqueteLLM"]');
      if (btn) { const o = btn.textContent; btn.textContent = '✅ Copié !'; setTimeout(() => { btn.textContent = o; }, 2200); }
    }).catch(() => {
      const blob = new Blob([pack], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `kit-conquete-llm_${codeFam}.txt`; a.click();
      URL.revokeObjectURL(url);
    });
  }
};

window._prSqFilterFn = function(key) {
  _S._prSqFilter = _S._prSqFilter === key ? '' : key;
  _prSqPage = 50;
  // Auto-tri par potentiel quand on filtre "implanter", sinon par réseau
  _prSqSort = (_S._prSqFilter === 'implanter') ? 'potentiel' : 'reseau';
  _prSqSortAsc = false;
  const fam = _prFindFam(_prOpenFam);
  const el  = document.getElementById('prDetailContent');
  if (el && fam) el.innerHTML = _prRenderSquelette(fam);
};

window._prSqSortFn = function(key) {
  if (_prSqSort === key) _prSqSortAsc = !_prSqSortAsc;
  else { _prSqSort = key; _prSqSortAsc = false; }
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

window._prMoreSq = function() {
  _prSqPage += 50;
  const el = document.getElementById('prDetailContent');
  if (!el || !_S._prSqArts) return;
  const fam = _prFindFam(_prOpenFam);
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
  if (!_prHighlightRef) _prDetailTab = 'pilotage';  // ne pas écraser si navigation ref
  _prGridVisible  = true;
  if (!_prHighlightRef) { _prRayonFilter = ''; _S._prSqFilter = ''; }
  // Montrer uniquement la famille sélectionnée dans la grille
  const grid = document.getElementById('prFamGrid');
  if (grid && _S._prData) {
    let onlyFam = _S._prData.families.filter(f => f.codeFam === codeFam);
    if (!onlyFam.length && _S._prData.inactiveFamilies) {
      onlyFam = _S._prData.inactiveFamilies.filter(f => f.codeFam === codeFam);
    }
    grid.innerHTML = _prBuildCards({ families: onlyFam, inactiveFamilies: [] }, '');
  }
  _prRerender();
  setTimeout(() => {
    const panel = document.getElementById('prDetailPanel');
    if (panel) panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, 50);
};

window._prQuickRefGo = function(code) {
  code = (code || '').trim();
  if (!code) return;
  // Masquer dropdown recherche
  const results = document.getElementById('prSearchResults');
  if (results) results.classList.add('hidden');
  const input = document.getElementById('prSearchInput');
  if (input) input.value = '';
  // Trouver la famille de cet article
  const catFam = _S.catalogueFamille;
  const cf = catFam?.get(code);
  const codeFam = cf?.codeFam || (_S.articleFamille?.[code] || '').slice(0, 3);
  if (!codeFam) return;
  // Basculer en vue Famille si on est en vue Métier
  if (_prTopView !== 'famille') _prTopView = 'famille';
  // Filtre article actif — les tableaux Mon Rayon / Squelette filtreront dessus
  _prHighlightRef = code;
  // Toujours ouvrir Pilotage — il contient les verdicts pour tous les articles (rayon + squelette)
  _prDetailTab = 'pilotage';
  // Naviguer vers la famille
  window._prSelectFam(codeFam, '');
};

window._prClearHighlightRef = function() {
  _prHighlightRef = '';
  // Re-render le contenu du détail
  const el = document.getElementById('prDetailContent');
  if (el) el.innerHTML = _prGetTabContent(_prDetailTab, _prOpenFam);
};

window._prMoreRayon = function() {
  if (!_S._prRayonData) return;
  _S._prPageRayon = (_S._prPageRayon || PAGE_SIZE) + PAGE_SIZE;
  const el = document.getElementById('prDetailContent');
  if (el) el.innerHTML = _prRenderRayon(_S._prRayonData);
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

window._prExportRayon = function() {
  if (!_S._prRayonData) return;
  const { monRayon, codeFam } = _S._prRayonData;
  // Appliquer les mêmes filtres que l'affichage
  let list = monRayon;
  if (_prSelectedEmps.size > 0) list = list.filter(a => _prSelectedEmps.has(a.emplacement || ''));
  if (_prRayonFilter) list = list.filter(a => a.status === _prRayonFilter);
  const headers = ['Code', 'Libellé', 'Emplacement', 'Sous-famille', 'Stock', 'W', 'ABC', 'FMR', 'CA agence', 'Statut'];
  const rows = list.map(a =>
    [a.code, a.libelle, a.emplacement || '', a.sousFam, a.stockActuel, a.W, a.abcClass, a.fmrClass, (a.caAgence || 0).toFixed(2), a.status].join(';')
  );
  const csv = [headers.join(';'), ...rows].join('\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const suffix = _prRayonFilter ? `_${_prRayonFilter}` : '';
  a.href = url; a.download = `plan_rayon_${codeFam}${suffix}.csv`; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

// ── Données communes Diag + LLM ────────────────────────────────────────
// Collecte items squelette, pathologies, métiers agence/livraisons, refs manquantes
function _prGatherFamData(codeFam, matchFn) {
  const catFam = _S.catalogueFamille;
  const sqData = _prGetSqDataCached();

  // Items squelette par classification
  const items = { socle: [], implanter: [], challenger: [], surveiller: [] };
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
    const hasFull2 = hasVentesClientMagFull();
    for (const [cc, artMap] of (getVentesClientMagFull() || new Map())) {
      if (!_prDistOk(cc)) continue;
      const info = _S.chalandiseData?.get(cc);
      const metier = info?.metier || 'Hors chalandise';
      let caFam = 0;
      for (const [code, data] of artMap) {
        if (!_match(code)) continue;
        caFam += _livRange ? _prClientArtCA(cc, code, _livRange) : (data.sumCAAll || data.sumCA || 0);
      }
      if (caFam > 0) {
        metierCA.set(metier, (metierCA.get(metier) || 0) + caFam);
        metierCli.set(metier, (metierCli.get(metier) || 0) + 1);
      }
    }
    if (!hasFull2) {
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
  const codesEnRayon = new Set();
  const emplacementsSet = new Set();
  for (const r of (_S.finalData || [])) {
    const cf = catFam?.get(r.code)?.codeFam || _S.articleFamille?.[r.code];
    if (cf !== codeFam) continue;
    if (r.stockActuel > 0) codesEnRayon.add(r.code);
    const emp = r.emplacement?.trim();
    if (emp) emplacementsSet.add(emp);
  }

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
  const emplacements = Array.from(emplacementsSet).sort();

  return { sqData, items, patho, metierCA, metierCli, metierLivCA, metierLivCli, metierArts, codesEnRayon, emplacements };
}

// ── Diagnostic ─────────────────────────────────────────────────────────
function _prBuildDiagText(codeFam) {
  const fam = _prFindFam(codeFam);
  if (!fam) return '';

  const agence = _S.selectedMyStore || 'agence';
  const catFam = _S.catalogueFamille;
  const catMarques = _S.catalogueMarques;
  const finalData = _S.finalData || [];
  const sqData = _prGetSqDataCached();

  // Calcul rayonData selon sélection sous-familles
  let rayonData;
  if (_prSelectedSFs.size === 0) {
    rayonData = _S._prRayonData || computeMonRayon(codeFam, _prOpenSousFam || '');
  } else if (_prSelectedSFs.size === 1) {
    let singleSF = '';
    for (const csf of _prSelectedSFs) { singleSF = csf; break; }
    rayonData = computeMonRayon(codeFam, singleSF);
  } else {
    rayonData = computeMonRayon(codeFam, '');
  }
  // Clone monRayon pour mutation sûre, puis filtre SF et/ou Marque si sélection active
  if (rayonData) {
    const needSfFilter = _prSelectedSFs.size > 1;
    const needMarqueFilter = _prSelectedMarques.size > 0;
    const src = rayonData.monRayon || [];
    if (needSfFilter || needMarqueFilter) {
      const filtered = [];
      for (const a of src) {
        if (needSfFilter) {
          const csf = catFam?.get(a.code)?.codeSousFam || '';
          if (!_prSelectedSFs.has(csf)) continue;
        }
        if (needMarqueFilter) {
          const mq = catMarques?.get(a.code) || '';
          if (!_prSelectedMarques.has(mq)) continue;
        }
        filtered.push(a);
      }
      rayonData = { ...rayonData, monRayon: filtered };
    } else {
      rayonData = { ...rayonData, monRayon: [...src] };
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
  const empsKnownSet = new Set();
  for (const r of finalData) {
    const cf = catFam?.get(r.code)?.codeFam || _S.articleFamille?.[r.code];
    if (cf !== codeFam) continue;
    if (sousFamFilter) {
      const csf = catFam?.get(r.code)?.codeSousFam || '';
      if (csf !== sousFamFilter) continue;
    }
    const emp = r.emplacement?.trim();
    if (emp) empsKnownSet.add(emp);
  }
  const empsKnown = Array.from(empsKnownSet).sort();

  const sfLabelByCode = new Map();
  if (catFam) {
    for (const [, f] of catFam) {
      if (f.codeFam !== codeFam) continue;
      const csf = f.codeSousFam || '';
      if (!sfLabelByCode.has(csf)) sfLabelByCode.set(csf, f.sousFam || csf);
    }
  }

  let txt = `╔══════════════════════════════════════════════╗\n`;
  txt += `  DIAGNOSTIC RAYON — ${fam.libFam.toUpperCase()}\n`;
  if (sousFamLib) txt += `  Sous-famille : ${sousFamLib}\n`;
  txt += `  Agence : ${agence}\n`;
  if (_prSelectedSFs.size > 0) {
    const sfNames = [];
    for (const csf of _prSelectedSFs) sfNames.push(sfLabelByCode.get(csf) || csf);
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
    // Dédup monRayon par code (sécurité) + valeur filtrée en une passe
    const _seen = new Set();
    let valeurFiltree = 0;
    const deduped = [];
    for (const a of rayonData.monRayon) {
      if (_seen.has(a.code)) continue;
      _seen.add(a.code);
      deduped.push(a);
      valeurFiltree += a.valeurStock || 0;
    }
    rayonData.monRayon = deduped;
    txt += `═══ MON RAYON AUJOURD'HUI ═══\n`;
    txt += `${rayonData.monRayon.length} articles en stock · `;
    txt += `${nbCat > 0 ? Math.round(rayonData.monRayon.length / nbCat * 100) : 0}% couverture`;
    txt += ` (${rayonData.monRayon.length}/${nbCat})`;
    if (_prSelectedSFs.size > 0) txt += ` sur les sous-familles sélectionnées`;
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
    const aDormants = [];
    const aFinSerie = [];
    const aFinStock = [];
    const aMaintenir = [];
    for (const a of rayonData.monRayon) {
      const finSerie = _isFinSerie(a);
      if (a.status === 'dormant' && a.sqClassif !== 'socle' && !finSerie && !_isFinStock(a)) {
        aDormants.push(a);
        continue;
      }
      if (finSerie) { aFinSerie.push(a); continue; }
      if (_isFinStock(a)) { aFinStock.push(a); continue; }
      aMaintenir.push(a);
    }
    aDormants.sort(_sortPhys);
    aFinSerie.sort(_sortPhys);
    aFinStock.sort(_sortPhys);
    aMaintenir.sort(_sortPhys);
    const aSortir = [...aDormants, ...aFinSerie, ...aFinStock];

    // ── ÉTAPE 1 ─────────────────────────────────────────────
    if (aSortir.length) {
      let valLib = 0;
      const empLib = new Set();
      for (const a of aSortir) {
        valLib += a.valeurStock || 0;
        const emp = (a.emplacement || '').trim();
        if (emp) empLib.add(emp);
      }
      const nbEmp = empLib.size;
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
      const toImplCodes = new Set();
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
          if (toImplCodes.has(a.code)) continue;
          toImplCodes.add(a.code);
          toImpl.push(a);
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
        const fdByCode = _prGetFdMap();
        // Médiane helper
        const _median = (arr) => { const s = [...arr].sort((x, y) => x - y); const n = s.length; return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2; };
        const _otherStores = [];
        for (const s of (_S.storesIntersection || [])) {
          if (s !== _S.selectedMyStore) _otherStores.push(s);
        }
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
        let totBL = 0;
        let totAg = 0;
        for (const a of toImpl) {
          totBL += a.nbBLLivraisons || 0;
          totAg += a.nbAgencesReseau || 0;
        }
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
              const libelle = articleLib(code);
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
        txt += `═══ ÉTAPE 3 — INCONTOURNABLES (${aIncont.length} refs${nbRupInc ? ` · ${nbRupInc} ruptures` : ''}) — pépites + socle réseau ═══\n`;
        txt += `⏱ Budget : ~25 min  ·  Geste : vérifier MIN/MAX, traiter les ruptures en priorité.\n`;
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
    challenger: fam.challenger, surveiller: fam.surveiller
  };
  if ((_prOpenSousFam || _prSelectedSFs.size > 0) && sqData) {
    sqTotals = { socle:0, implanter:0, challenger:0, surveiller:0 };
    for (const d of sqData.directions) {
      for (const g of ['socle','implanter','challenger','surveiller']) {
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
  txt += `🟢 Socle : ${sqTotals.socle} articles · 🔵 À implanter : ${sqTotals.implanter} · 🔴 Challenger : ${sqTotals.challenger} · 👁 Surveiller : ${sqTotals.surveiller}\n`;
  txt += `Sources actives : ${[fam.srcReseau?'Réseau':'',fam.srcChalandise?'Chalandise':'',fam.srcHorsZone?'Hors-zone':'',fam.srcLivraisons?'Livraisons':''].filter(Boolean).join(', ')}\n\n`;

  txt += `═══ CATALOGUE ═══\n`;
  if (_prSelectedSFs.size > 0) {
    txt += `${nbCat} références dans les sous-familles sélectionnées\n`;
    for (const csf of _prSelectedSFs) {
      const sfName = sfLabelByCode.get(csf) || csf;
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
            const libelle = articleLib(code);
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

[PHYSIGAMME — Rôles stratégiques]
Chaque article a un RÔLE :
🏆 Incontournable = présent chez ≥60% du réseau OU ABC-A forte rotation. OBJECTIF : 98% en stock.
🆕 Nouveauté = <90 jours, signal réseau. Renouvellement qui garde le rayon vivant.
🎯 Spécialiste = acheté par les métiers stratégiques (menuisiers, serruriers, plombiers…). Fidélisation métier.
📦 Standard = le reste.

[SQUELETTE — Statut agence]
Chaque article a un STATUT calculé :
🔴 Challenger = en stock ET 0 vente 90 jours.
🔵 Socle = en stock + ≥3 clients distincts + ≥3 BL.
🟡 À surveiller = en stock, ni Socle ni Challenger.
🟢 À implanter = pas en stock + signal fort (🏆/🆕 OU ≥5 clients zone OU ≥1000€ CA zone).

[MATRICE VERDICT — Rôle × Statut]
Le croisement donne un VERDICT actionnable :
SOCLE × 🏆 = Le Capitaine (protéger) · SOCLE × 🆕 = La Bonne Pioche (observer) · SOCLE × 🎯 = Le Lien Fort (maintenir) · SOCLE × 📦 = Le Bon Soldat (maintenir)
SURVEILLER × 🏆 = L'Alerte Rouge (agir vite) · SURVEILLER × 🆕 = Le Stagiaire (patience) · SURVEILLER × 🎯 = Le Point de Rupture (contacter client) · SURVEILLER × 📦 = Le Déclinant (réduire)
CHALLENGER × 🏆 = La Réf Schizo (divorce confiance) · CHALLENGER × 🆕 = L'Erreur de Casting (sortir) · CHALLENGER × 🎯 = La Trahison (sortir + appeler) · CHALLENGER × 📦 = Le Poids Mort (sortir)
IMPLANTER × 🏆 = Le Trou Critique (implanter sans discuter) · IMPLANTER × 🆕 = Le Pari du Réseau (tester) · IMPLANTER × 🎯 = La Conquête (signal fort) · IMPLANTER × 📦 = L'Opportunité Locale (évaluer)

[SCANNER DE RAYON V2 — KPIs famille]
Score de Santé Interne (0-100) = détention Incontournables ×50 + (100 - % pathologique) ×30 + détention Spécialistes ×20, le tout ÷100.
  ROUGE (< 50) = À retravailler — problème structurel, refonte nécessaire.
  ORANGE (50-79) = À surveiller — optimisation ciblée, réparer ce qui est cassé.
  VERT (≥ 80) = Bien couverte — maintenir l'excellence.
Indice Performance Réseau (100=médiane) = CA/ref agence vs CA/ref réseau.
Potentiel Externe (€) = CA zone total des articles À IMPLANTER.
Part de Marché famille (PdM%) = CA Magasin ÷ CA Zone Total. C'est la taille de ta part du gâteau.
  PdM > 70% = leader, défendre. PdM 40-70% = challenger, conquérir. PdM < 40% = suiveur, rattraper.
Captation famille = CA Magasin ÷ CA Zone Total (même formule que PdM, appliquée au niveau famille).
Tag Axe Spécialiste = si >30% du CA famille est porté par des clients métiers stratégiques, la famille a une vocation pro forte. Ce tag est CUMULABLE avec tout statut.

[COLONNES PILOTAGE — par article]
- Cli PDV = clients distincts dans TON agence sur la période (diffusion interne)
- CA Zone = CA total TOUS CANAUX confondus, clients zone de chalandise (taille du marché)
- Cli Zone = clients distincts zone, tous canaux (largeur du marché)
- PdM% = CA Magasin ÷ CA Zone (ta part de marché sur cet article)

[RÈGLE DE DÉROGATION : L'ANCRE MÉTIER]
Un Challenger peut être sauvé si c'est un 🎯 Spécialiste qui ancre un métier clé, stock=1, max 5 Ancres par rayon.

Analyse le rayon ci-dessous et réponds STRICTEMENT en 7 sections :

1. **La phrase à retenir** — UNE phrase qui frappe (image mentale + diagnostic + direction)
2. **Les signaux qui crient fort** — les 2-3 chiffres qui doivent alerter, et POURQUOI (utilise PdM% et captation)
3. **Le piège mental à éviter** — le réflexe à ne PAS avoir face à ces données
4. **Ce que je vois vraiment dans les données** — patterns cachés, croisements (verdicts × métiers × PdM% × benchmark)
5. **Le plan Physigamme** — "Je vide / J'optimise / Je remplis" en 5 gestes max. Chaque geste cite le RÔLE (🏆/🆕/🎯/📦) ET le VERDICT MATRICE (ex: "Le Trou Critique", "La Réf Schizo")
6. **Prédiction chiffrée** — détention incontournables, Score Santé, PdM% APRÈS le plan
7. **La leçon qui dépasse ce rayon** — ce que cette famille enseigne pour le reste du magasin

Règles dures :
- Chaque recommandation DOIT citer le VERDICT MATRICE, pas juste le rôle ou le statut isolément
- PdM% est le KPI roi : un produit avec PdM 95% = défendre, PdM 0% = opportunité pure
- Section [BENCHMARK RÉSEAU VS MOI] = ton miroir. Écart >20% = signal fort
- Si section [DEMANDE RÉELLE PAR MÉTIER] présente : c'est la donnée CLEF. Distingue :
  1. CONSOLIDER : renforcer pour les métiers qui viennent déjà (captation >20%)
  2. DÉVELOPPER : capter les métiers à 0% — qu'est-ce qu'on implante pour les attirer ?
- Refuser de réimplanter ce qui sort déjà en volume (signal "rayon échantillonné")
- Parler comme un coach autour d'un café, pas comme un consultant en costume

`;

function _prBuildLLMPack(codeFam) {
  const data = _S._prData;
  if (!data) return null;
  const fam = data.families.find(f => f.codeFam === codeFam);
  if (!fam) return null;
  const ctx = _prAgenceVocationCtx();
  // Lookup libellé multi-source : consommé → territoire
  const _tLib = {};
  if (_S.territoireLines) for (const l of _S.territoireLines) { if (l.code && l.libelle && !_tLib[l.code]) _tLib[l.code] = l.libelle; }
  const lib = (c) => articleLib(c) !== c ? articleLib(c) : (_tLib[c] || '');
  const mark = (c) => _S.catalogueMarques?.get(c) || _S.articleMarque?.[c] || '';

  const gd = _prGatherFamData(codeFam);
  if (!gd.sqData) return null;
  const { items, patho } = gd;
  const _roles = _prComputeRoles(codeFam);

  const ROLE_EMOJI = { incontournable: '🏆', nouveaute: '🆕', specialiste: '🎯', standard: '📦' };
  const fmtItem = (a, classif, withScore = false) => {
    const m = mark(a.code);
    const score = withScore && a.scoreReseau ? ` score:${a.scoreReseau}` : '';
    const role = _roles.get(a.code) || 'standard';
    const roleTag = ROLE_EMOJI[role] || '';
    const v = _prVerdict(classif, role, a.code);
    const verdictTag = v.name !== '—' ? ` → ${v.name}` : '';
    const pdmStr = a.pdm != null ? ` PdM:${a.pdm}%` : '';
    const cliStr = a.nbClientsPDV ? ` cli:${a.nbClientsPDV}` : '';
    return `  - ${a.code} ${lib(a.code)}${roleTag ? ' ' + roleTag : ''}${verdictTag}${pdmStr}${cliStr}${m ? ' · ' + m : ''}${score}`;
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
  pack += `Scanner de Rayon : ${ACTION_BADGE[fam.classifGlobal]?.label || fam.classifGlobal}\n\n`;

  const hasBench = fam.rendement != null && fam.rendement > 0;
  pack += `[SCANNER DE RAYON — KPIs]\n`;
  pack += `- ❤️ Score Santé Interne : ${fam.scoreSante}/100${fam.scoreSante < 50 ? ' 🔴 CRITIQUE' : fam.scoreSante < 80 ? ' 🟠 MOYEN' : ' ✅ BON'}\n`;
  pack += `- 📊 Indice Perf Réseau : ${hasBench ? fam.perfReseau : 'n/a'}${hasBench && fam.perfReseau < 80 ? ' ⚠ SOUS-PERFORMANT' : hasBench && fam.perfReseau >= 100 ? ' ✅' : ''} (100=médiane)\n`;
  pack += `- 💰 Potentiel Externe : ${formatEuro(fam.potentielExterne)} (CA zone des IMPLANTER)\n`;
  pack += `- 🎯 % CA strat : ${fam.pctStrat}% porté par métiers stratégiques${fam.tagSpecialiste ? ' · TAG AXE SPÉCIALISTE' : ''}\n`;
  pack += `- 📈 PdM famille : ${fam.captation != null ? fam.captation + '%' : 'n/a'} (CA agence / CA zone total)\n`;
  pack += `- 🌍 CA Zone total : ${formatEuro(fam.caZoneTotal)} (tous canaux, tous clients zone)\n\n`;

  pack += `[KPIs RAYON]\n`;
  pack += `- ${fam.nbEnRayon} refs en rayon · ${fam.nbCatalogue} catalogue · couverture ${fam.couverture}%\n`;
  pack += `- ${fam.nbClients} clients servis · CA agence ${formatEuro(fam.caAgence)}\n`;
  pack += `- Hygiène : ${fam.hygieneScore}% pathologique (${fam.nbDormants} dormants · ${fam.nbFin} fin · ${fam.nbRuptures} ruptures)\n`;
  pack += `- Incontournables : ${fam.nbIncontEnStock}/${fam.nbIncontournables} en stock (${fam.nbIncontournables > 0 ? Math.round(fam.nbIncontEnStock / fam.nbIncontournables * 100) : 100}%)\n`;
  pack += `- Spécialistes : ${fam.nbSpecEnStock}/${fam.nbSpecialistes} en stock (${fam.nbSpecialistes > 0 ? Math.round(fam.nbSpecEnStock / fam.nbSpecialistes * 100) : 100}%)\n\n`;

  // ── PHYSIGAMME ──
  const _vpm = _S.ventesParMagasin || {};
  const _spm = _S.stockParMagasin || {};
  const _myS = _S.selectedMyStore;
  const _stores = Object.keys(_vpm).filter(s => s !== _myS);
  const _nbSt = _stores.length || 1;
  const _fdMap2 = _prGetFdMap();

  // Compteurs par rôle
  const _rc = {}, _ri = {};
  for (const r of ['incontournable','nouveaute','specialiste']) { _rc[r] = 0; _ri[r] = 0; }
  for (const [code, role] of _roles) { if (_rc[role] !== undefined) { _rc[role]++; if ((_fdMap2.get(code)?.stockActuel || 0) > 0) _ri[role]++; } }
  const _tauxInc = _rc.incontournable ? Math.round(_ri.incontournable / _rc.incontournable * 100) : 100;

  pack += `[PHYSIGAMME — Rôles stratégiques]\n`;
  pack += `- 🏆 Incontournables : ${_ri.incontournable}/${_rc.incontournable} en stock (${_tauxInc}%, objectif 98%)\n`;
  pack += `- 🆕 Nouveautés : ${_ri.nouveaute}/${_rc.nouveaute} en stock\n`;
  if (_rc.specialiste) pack += `- 🎯 Spécialistes : ${_ri.specialiste}/${_rc.specialiste} en stock\n`;

  // Incontournables manquants
  const _incManq = [];
  for (const [code, role] of _roles) {
    if (role === 'incontournable' && !(_fdMap2.get(code)?.stockActuel > 0)) {
      let det = 0;
      for (const s of _stores) { if (_vpm[s]?.[code]?.countBL > 0) det++; }
      _incManq.push({ code, det: Math.round(det / _nbSt * 100) });
    }
  }
  if (_incManq.length) {
    pack += `⚠ Incontournables MANQUANTS :\n`;
    for (const a of _incManq.sort((x, y) => y.det - x.det)) {
      pack += `  - ${a.code} ${lib(a.code)} (${a.det}% détention réseau)\n`;
    }
  }
  pack += `\n`;

  // ── BENCHMARK RÉSEAU VS MOI ──
  const _stStats = _stores.map(s => {
    let nr = 0, ca = 0, bl = 0;
    for (const [code] of _roles) {
      const d = _vpm[s]?.[code]; if (d?.countBL > 0) { nr++; ca += d.sumCA || 0; bl += d.countBL || 0; }
    }
    return { nr, ca, bl };
  });
  const _med = (arr) => { if (!arr.length) return 0; const s = [...arr].sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
  let _myNR = 0, _myCA = 0, _myBL = 0;
  for (const [code] of _roles) { const d = _vpm[_myS]?.[code]; if (d?.countBL > 0) { _myNR++; _myCA += d.sumCA || 0; _myBL += d.countBL || 0; } }
  const _medNR = Math.round(_med(_stStats.map(s => s.nr)));
  const _medCA = Math.round(_med(_stStats.map(s => s.ca)));
  const _medBL = Math.round(_med(_stStats.map(s => s.bl)));
  const _ecart = (v, m) => m ? `${v >= m ? '+' : ''}${Math.round((v - m) / m * 100)}%` : 'n/a';

  pack += `[BENCHMARK RÉSEAU VS MOI — ${_stores.length} agences]\n`;
  pack += `- Réfs vendues : ${_myNR} vs ${_medNR} médiane (${_ecart(_myNR, _medNR)})\n`;
  pack += `- CA : ${formatEuro(_myCA)} vs ${formatEuro(_medCA)} (${_ecart(_myCA, _medCA)})\n`;
  pack += `- BL : ${_myBL} vs ${_medBL} (${_ecart(_myBL, _medBL)})\n\n`;

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
    for (const a of items.socle.slice(0, 25)) pack += fmtItem(a, 'socle') + '\n';
    pack += `\n`;
  }
  if (items.implanter.length) {
    pack += `[À IMPLANTER (suggéré par PRISME) — ${items.implanter.length} refs]\n`;
    for (const a of items.implanter.slice(0, 25)) pack += fmtItem(a, 'implanter', true) + '\n';
    pack += `\n`;
  }
  if (items.challenger.length) {
    pack += `[CHALLENGER — ${items.challenger.length} refs en rayon mais sous-performantes]\n`;
    for (const a of items.challenger.slice(0, 15)) pack += fmtItem(a, 'challenger') + '\n';
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

// ══════════════════════════════════════════════════════════════════════
// ── PALMARÈS RÉSEAU — Heatmap Familles × Agences ────────────────────
// ══════════════════════════════════════════════════════════════════════

let _palSort = 'ecart'; // 'fam'|'ecart'|'rang'
let _palSortAsc = false;
function _renderPalmaresContent() {
  const vpm = _S.ventesParMagasin || {};
  const myStore = _S.selectedMyStore;
  const stores = Object.keys(vpm).filter(s => s !== myStore).sort();
  if (!stores.length) return '<div class="t-disabled text-sm text-center py-12">Chargez le fichier Terrain pour activer le Palmarès Réseau.</div>';

  const catFam = _S.catalogueFamille;
  const artFam = _S.articleFamille || {};

  // Agréger CA par famille × agence
  const famCA = new Map(); // codeFam → Map<store, ca>
  const famLabels = new Map(); // codeFam → libellé
  const allStores = [myStore, ...stores];

  for (const store of allStores) {
    const sd = vpm[store];
    if (!sd) continue;
    for (const [code, data] of Object.entries(sd)) {
      if (!/^\d{6}$/.test(code)) continue;
      const ca = data.sumCA || 0;
      if (ca <= 0) continue;
      const cf = catFam?.get(code)?.codeFam || artFam[code] || '';
      if (!cf || !/^[A-Z]\d{2}$/.test(cf)) continue;
      if (!famCA.has(cf)) famCA.set(cf, new Map());
      famCA.get(cf).set(store, (famCA.get(cf).get(store) || 0) + ca);
      if (!famLabels.has(cf)) {
        const fInfo = catFam?.get(code);
        famLabels.set(cf, fInfo?.libFam || cf);
      }
    }
  }

  // Construire les rangs : pour chaque famille, classer les agences par CA décroissant
  const rows = [];
  for (const [cf, storeMap] of famCA) {
    const myCA = storeMap.get(myStore) || 0;
    const allCA = allStores.map(s => ({ store: s, ca: storeMap.get(s) || 0 }))
      .filter(s => s.ca > 0)
      .sort((a, b) => b.ca - a.ca);
    const nbActive = allCA.length;
    if (nbActive < 2) continue; // pas assez d'agences pour comparer

    // Rang de mon agence
    const myRang = allCA.findIndex(s => s.store === myStore) + 1;
    // Médiane CA
    const vals = allCA.map(s => s.ca);
    const med = vals[Math.floor(vals.length / 2)] || 0;
    const ecart = med > 0 ? Math.round((myCA - med) / med * 100) : 0;

    // Rangs par agence
    const rangs = new Map();
    allCA.forEach((s, i) => rangs.set(s.store, i + 1));

    rows.push({
      cf, lib: famLabels.get(cf) || cf,
      myCA, myRang, nbActive, ecart, med,
      storeCA: storeMap, rangs
    });
  }

  // Tri
  const sortFns = {
    fam: (a, b) => a.lib.localeCompare(b.lib),
    ecart: (a, b) => a.ecart - b.ecart,
    rang: (a, b) => a.myRang - b.myRang,
  };
  const baseFn = sortFns[_palSort] || sortFns.ecart;
  rows.sort((a, b) => _palSortAsc ? -baseFn(a, b) : baseFn(a, b));

  // KPIs globaux
  const nbRetard = rows.filter(r => r.ecart < -20).length;
  const nbAvance = rows.filter(r => r.ecart > 20).length;
  const nbMoyen = rows.length - nbRetard - nbAvance;
  const avgRang = rows.length ? (rows.reduce((s, r) => s + r.myRang, 0) / rows.length).toFixed(1) : '—';

  let html = `<div class="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
    <div class="s-card rounded-lg p-2 text-center"><div class="text-[10px] t-disabled">Familles comparées</div><div class="text-[14px] font-bold t-primary">${rows.length}</div></div>
    <div class="s-card rounded-lg p-2 text-center"><div class="text-[10px] t-disabled">Rang moyen</div><div class="text-[14px] font-bold" style="color:#f59e0b">${avgRang} / ${allStores.length}</div></div>
    <div class="s-card rounded-lg p-2 text-center"><div class="text-[10px] t-disabled">🔴 En retard (&lt;-20%)</div><div class="text-[14px] font-bold" style="color:#ef4444">${nbRetard}</div></div>
    <div class="s-card rounded-lg p-2 text-center"><div class="text-[10px] t-disabled">🟢 En avance (&gt;+20%)</div><div class="text-[14px] font-bold" style="color:#22c55e">${nbAvance}</div></div>
  </div>`;

  // Table heatmap
  const thSort = (key, label) => {
    const active = _palSort === key;
    return `<th class="py-1.5 px-2 text-left cursor-pointer hover:t-primary whitespace-nowrap"
      style="color:${active ? 'var(--c-action)' : 'var(--t-secondary)'};font-weight:${active ? 700 : 500}"
      onclick="window._palSortFn('${key}')">${label}${active ? (_palSortAsc ? ' ▲' : ' ▼') : ''}</th>`;
  };

  html += `<div class="overflow-x-auto" style="max-height:600px;overflow-y:auto">
    <table class="w-full text-[11px]">
      <thead style="position:sticky;top:0;z-index:2;background:var(--color-bg-primary,#0f172a)"><tr class="border-b b-light text-[10px]">
        ${thSort('fam', 'Famille')}
        ${thSort('ecart', 'Écart méd.')}
        ${thSort('rang', 'Mon rang')}
        <th class="py-1.5 px-2 text-right" style="color:var(--t-secondary);font-weight:500">Mon CA</th>
        ${stores.map(s => `<th class="py-1.5 px-2 text-center" style="color:var(--t-secondary);font-weight:500;min-width:50px">${s}</th>`).join('')}
      </tr></thead>
      <tbody>${rows.map(r => {
        const ecartC = r.ecart >= 20 ? '#22c55e' : r.ecart >= -20 ? '#f59e0b' : '#ef4444';
        const rangC = r.myRang <= 2 ? '#22c55e' : r.myRang <= Math.ceil(r.nbActive * 0.5) ? '#f59e0b' : '#ef4444';
        // Cells agences
        const cells = stores.map(s => {
          const ca = r.storeCA.get(s) || 0;
          const rang = r.rangs.get(s) || 0;
          if (!ca) return `<td class="py-1 px-2 text-center" style="background:rgba(100,116,139,0.05)"><span class="text-[9px] t-disabled">—</span></td>`;
          // Couleur par rang (1-3 = vert, dernier tiers = rouge)
          const bg = rang <= 2 ? 'rgba(34,197,94,0.20)' : rang <= Math.ceil(r.nbActive * 0.5) ? 'rgba(245,158,11,0.12)' : 'rgba(239,68,68,0.15)';
          const fc = rang <= 2 ? '#22c55e' : rang <= Math.ceil(r.nbActive * 0.5) ? '#f59e0b' : '#ef4444';
          return `<td class="py-1 px-2 text-center cursor-pointer hover:opacity-80" style="background:${bg}"
            onclick="window._palClickCell('${r.cf}','${s}')" title="${s} · ${r.lib} · ${formatEuro(ca)} · #${rang}/${r.nbActive}">
            <span class="text-[10px] font-bold" style="color:${fc}">#${rang}</span>
          </td>`;
        }).join('');
        return `<tr class="border-b b-light hover:s-hover">
          <td class="py-1 px-2 t-primary font-medium whitespace-nowrap cursor-pointer" onclick="window._prOpenFamily&&window._prOpenFamily('${r.cf}')" title="Ouvrir ${r.lib}">${escapeHtml(r.lib)} <span class="text-[9px] t-disabled font-mono">${r.cf}</span></td>
          <td class="py-1 px-2 font-bold" style="color:${ecartC}">${r.ecart > 0 ? '+' : ''}${r.ecart}%</td>
          <td class="py-1 px-2 font-bold" style="color:${rangC}">#${r.myRang}<span class="text-[9px] t-disabled font-normal">/${r.nbActive}</span></td>
          <td class="py-1 px-2 text-right t-secondary">${r.myCA > 0 ? formatEuro(r.myCA) : '—'}</td>
          ${cells}
        </tr>`;
      }).join('')}</tbody>
    </table>
  </div>`;

  return html;
}


window._prOpenFamily = function(codeFam) {
  _prTopView = 'famille';
  window._prOpenDetail(codeFam);
};

window._palSortFn = function(key) {
  if (_palSort === key) _palSortAsc = !_palSortAsc;
  else { _palSort = key; _palSortAsc = false; }
  const el = document.getElementById('planRayonBlock');
  if (el) el.innerHTML = _prPerfBanner() + _prTopTabBar() + _renderPalmaresContent();
};

window._palClickCell = function(fam, store) {
  // Routage intelligent : clic sur un rang agence → split-screen onglet Réseau
  _prTopView = 'famille';
  _prOpenFam = fam;
  _prOpenSousFam = '';
  _S._prSqFilter = '';
  _prSqPage = 50;
  _prSqSort = 'reseau'; _prSqSortAsc = false;
  _prPilotSort = 'verdict'; _prPilotSortAsc = false;
  _prMetierDist = 0;
  _prSelectedSFs.clear();
  _prSelectedEmps.clear();
  _prSelectedMarques.clear();
  const found = _prFindFam(fam);
  const isUnknown = !found;
  _prConqueteMode = isUnknown || found?.classifGlobal === 'inactive';
  _prDetailTab = _prConqueteMode ? 'conquete' : 'reseau';
  // Famille visible dans le réseau mais absente du plan local → créer un stub
  if (isUnknown && _S._prData) {
    const stub = { codeFam: fam, libFam: famLib(fam) || fam, classifGlobal: 'inactive',
      socle: 0, implanter: 0, challenger: 0, surveiller: 0, nbEnRayon: 0, caAgence: 0,
      caReseau: 0, nbRefsReseau: 0, nbIncontournables: 0, nbIncontEnStock: 0,
      nbSpecialistes: 0, nbSpecEnStock: 0, caZoneTotal: 0, potentielExterne: 0,
      nbClients: 0, caStratClients: 0, caTotalClients: 0, pctStrat: 0,
      nbDormants: 0, nbRuptures: 0, nbFin: 0, nbSchizo: 0, schizoItems: [],
      tagSpecialiste: false, srcReseau: false, srcChalandise: false,
      srcHorsZone: false, srcLivraisons: false, srcPdvClients: false };
    _S._prData.inactiveFamilies.push(stub);
  }
  _prRerender();
  setTimeout(() => {
    const panel = document.getElementById('prDetailPanel');
    if (panel) panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, 50);
};


// ══════════════════════════════════════════════════════════════════════
// ── PILOTAGE MÉTIER — Vue cross-famille par métier ──────────────────
// ══════════════════════════════════════════════════════════════════════

function _prTopTabBar() {
  const tab = (key, icon, label) => {
    const active = _prTopView === key;
    return `<button onclick="window._prSetTopView('${key}')"
      class="text-[12px] px-5 py-2.5 cursor-pointer border-b-2 transition-colors font-semibold ${active ? 'font-bold' : 'hover:t-primary'}"
      style="${active ? 'border-color:var(--c-action);color:var(--t-primary)' : 'border-color:transparent;color:var(--t-secondary)'}">${icon} ${label}</button>`;
  };
  return `<div style="position:sticky;top:0;z-index:20;background:var(--color-bg-primary,#0f172a);padding-top:4px">
    <div class="flex gap-0 border-b b-light">
      ${tab('famille', '📦', 'Pilotage Famille')}
      ${tab('metier', '🎯', 'Pilotage Métier')}
      ${_S.storesIntersection?.size > 1 ? tab('palmares', '🏆', 'Palmarès Réseau') : ''}
    </div>
    <div class="relative py-2">
      <input type="text" id="prSearchInput" placeholder="🔍 Famille, sous-famille, marque, code ou emplacement…"
        autocomplete="off"
        class="w-full px-3 py-2 pr-8 text-[12px] rounded-lg border b-default s-card t-primary focus:border-[var(--c-action)] focus:outline-none">
      <button id="prSearchClear" class="hidden absolute right-2 top-1/2 -translate-y-1/2 text-[14px] t-disabled hover:t-primary cursor-pointer select-none" style="line-height:1"
        onclick="const i=document.getElementById('prSearchInput');i.value='';i.focus();i.dispatchEvent(new Event('input'));this.classList.add('hidden')">✕</button>
    </div>
  </div>`;
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
    // Source 1: ventesClientArticle (MAGASIN = monCA + caZone)
    const myArts = _S.ventesClientArticle?.get(cc);
    if (myArts) {
      for (const [code, data] of myArts) {
        if (!/^\d{6}$/.test(code)) continue;
        const ca = +(data.sumCA || 0);
        arts.set(code, { ca, mon: ca });
      }
    }
    // Source 2: ventesClientHorsMagasin (hors-MAGASIN → caZone only)
    const hmArts = _S.ventesClientHorsMagasin?.get(cc);
    if (hmArts) {
      for (const [code, data] of hmArts) {
        if (!/^\d{6}$/.test(code)) continue;
        const a = arts.get(code) || { ca: 0, mon: 0 };
        a.ca += +(data.sumCA || 0);
        arts.set(code, a);
      }
    }
    if (arts.size) perClient.set(cc, arts);
  }

  // Source 3: territoireLines — index by client once (avoid O(clients × lines))
  if (_S.territoireLines?.length) {
    for (const l of _S.territoireLines) {
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
  const vpm = _S.ventesParMagasin || {};
  const myStore = _S.selectedMyStore;

  // Filtrer les familles spécifiques au métier : ne garder que celles où les clients
  // du métier représentent une part significative des acheteurs zone (≥10% ou ≥5 clients)
  const _famMetierClients = new Map(); // codeFam → Set<cc> (clients métier)
  for (const [, e] of enriched) {
    if (!e.codeFam) continue;
    if (!_famMetierClients.has(e.codeFam)) _famMetierClients.set(e.codeFam, new Set());
    const s = _famMetierClients.get(e.codeFam);
    for (const c of e._contribs) s.add(c.cc);
  }
  // Compter tous les clients zone par famille (via articleZoneIndex)
  const _zoneIdx = computeArticleZoneIndex();
  const _famAllClients = new Map(); // codeFam → Set<cc>
  for (const [code, zi] of _zoneIdx) {
    const fam = catFam?.get(code)?.codeFam || _S.articleFamille?.[code] || '';
    if (!fam || !_famMetierClients.has(fam)) continue;
    if (!_famAllClients.has(fam)) _famAllClients.set(fam, new Set());
    const s = _famAllClients.get(fam);
    if (zi.contribs) for (const c of zi.contribs) s.add(c.cc);
  }
  const metierFams = new Set();
  for (const [fam, metClients] of _famMetierClients) {
    const allClients = _famAllClients.get(fam)?.size || 1;
    const pct = metClients.size / allClients;
    // Garder si ≥10% des acheteurs zone sont du métier, OU ≥5 clients du métier
    if (pct >= 0.10 || metClients.size >= 5) metierFams.add(fam);
  }

  // Compter réseau par article (familles spécifiques au métier uniquement)
  const _resByCode = new Map(); // code → {nbAg, ca}
  for (const store in vpm) {
    if (store === myStore) continue;
    const arts = vpm[store];
    for (const code in arts) {
      const d = arts[code];
      if (!d || d.countBL <= 0 || !/^\d{6}$/.test(code)) continue;
      const _cf2 = catFam?.get(code)?.codeFam || _S.articleFamille?.[code] || '';
      if (!_cf2 || !metierFams.has(_cf2)) continue;
      let r = _resByCode.get(code);
      if (!r) { r = { nbAg: 0, ca: 0 }; _resByCode.set(code, r); }
      r.nbAg++;
      r.ca += d.sumCA || 0;
    }
  }
  // Appliquer réseau aux articles existants
  for (const [code, e] of enriched) {
    const r = _resByCode.get(code);
    e.nbAgencesReseau = r?.nbAg || 0;
    e.caReseau = r?.ca || 0;
  }
  // Ajouter articles réseau-only (≥3 agences, pas en stock local, pas déjà dans enriched)
  const _nbStoresExclMy = Math.max(1, Object.keys(vpm).filter(s => s !== myStore).length);
  const _minAgReseau = Math.max(2, Math.ceil(_nbStoresExclMy / 3));
  for (const [code, r] of _resByCode) {
    if (enriched.has(code) || r.nbAg < _minAgReseau) continue;
    const cf = catFam?.get(code);
    const codeFam = cf?.codeFam || _S.articleFamille?.[code] || '';
    if (!codeFam) continue;
    const libFam = FAMILLE_LOOKUP[codeFam] || codeFam;
    const fd = fdMap.get(code);
    const inStock = fd && (fd.stockActuel || 0) > 0;
    if (!rolesByFam.has(codeFam)) rolesByFam.set(codeFam, _prComputeRoles(codeFam));
    const role = rolesByFam.get(codeFam)?.get(code) || 'standard';
    enriched.set(code, {
      code, libelle: articleLib(code),
      marque: _S.catalogueMarques?.get(code) || '',
      codeFam, libFam, sousFam: cf?.sousFam || '',
      inStock, stockActuel: fd?.stockActuel || 0, role,
      _contribs: [],
      nbAgencesReseau: r.nbAg, caReseau: r.ca,
      _reseauOnly: true,
    });
  }

  // ── Canal de Proximité: per-client canal split ──
  const clientCanal = new Map(); // cc → {caMag, caLivre, pctLivre}
  for (const cc of clientSetRaw) {
    let caMag = 0, caLivre = 0;
    const myArts = _S.ventesClientArticle?.get(cc);
    if (myArts) for (const [, d] of myArts) caMag += +(d.sumCA || 0);
    const hmArts = _S.ventesClientHorsMagasin?.get(cc);
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
    if (nbClients === 0 && !e._reseauOnly) continue;
    const pdm = caZone > 0 ? Math.round(monCA / caZone * 100) : null;
    result.set(code, {
      code, libelle: e.libelle, marque: e.marque,
      codeFam: e.codeFam, libFam: e.libFam, sousFam: e.sousFam,
      caZone, monCA, nbClientsZone: nbClients,
      inStock: e.inStock, stockActuel: e.stockActuel,
      role: e.role, pdm,
      nbAgencesReseau: e.nbAgencesReseau || 0,
      caReseau: e.caReseau || 0,
      reseauOnly: !!e._reseauOnly,
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
      addArts(_S.ventesClientArticle?.get(cc), true);
      addArts(_S.ventesClientHorsMagasin?.get(cc), false);
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
    metierOpts.push({ metier, nb: clients.size });
  }
  metierOpts.sort((a, b) => b.nb - a.nb);

  const options = metierOpts.map(m =>
    `<option value="${escapeHtml(m.metier)}" ${m.metier === _prSelectedMetier2 ? 'selected' : ''}>${m.metier} (${m.nb} clients)</option>`
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
        value="${_prSelectedMetier2 ? escapeHtml(_prSelectedMetier2) : ''}"
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
        ${th('caZone', 'CA Zone', 'text-right', 'CA tous canaux clients zone')}
        ${th('caReseau', 'CA Réseau', 'text-right', 'CA toutes agences hors la mienne')}
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
      if (_sqA.verdict?.name && _sqA.verdict.name !== '—') verdictCell += `<br><span class="text-[8px]" style="color:${_sqA.verdict.color}" title="${escapeHtml(_sqA.verdict.tip||'')}">${_sqA.verdict.icon} ${escapeHtml(_sqA.verdict.name)}</span>`;
    }
    const _rOnly = a.reseauOnly;
    const _rowStyle = _rOnly ? 'background:rgba(59,130,246,0.06)' : '';
    const _nbAg = a.nbAgencesReseau || 0;
    const _agColor = _nbAg >= 5 ? '#22c55e' : _nbAg >= 3 ? '#f59e0b' : 'var(--t-secondary)';
    html += `<tr class="border-b b-light hover:s-panel-inner transition-colors cursor-pointer" style="${_rowStyle}" onclick="if(window.openArticlePanel)window.openArticlePanel('${a.code}','planRayon')">
      <td class="py-1 px-2 font-mono text-[10px]">${a.code} ${_copyCodeBtn(a.code)}</td>
      <td class="py-1 px-2 truncate max-w-[260px]" title="${escapeHtml(a.libelle)}">${escapeHtml(a.libelle)}${_rOnly ? ' <span class="text-[8px] px-1 py-0.5 rounded" style="background:rgba(59,130,246,0.2);color:#3b82f6">réseau</span>' : ''}</td>
      <td class="py-1 px-2 text-right" style="color:${stockColor}">${a.inStock ? a.stockActuel : '✕'}</td>
      ${!_prMFilterFam ? `<td class="py-1 px-2 text-[10px] t-secondary truncate max-w-[120px]" title="${escapeHtml(a.libFam)}">${escapeHtml(a.libFam)}</td>` : ''}
      <td class="py-1 px-2 text-right font-bold">${a.caZone ? formatEuro(a.caZone) : '—'}</td>
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

function _prRenderCanalProximite() {
  const L = _prMetierLivres;
  const { topValeur, topFreq, kit, totals } = L;
  const distLabel = _prMetierDist ? ` ≤${_prMetierDist}km` : '';

  let html = `<div class="mt-4 pt-4 border-t b-light">
    <h4 class="text-[13px] font-extrabold t-primary mb-1">🚚 Canal de Proximité — ${totals.nb} clients 100% livrés${distLabel}</h4>
    <p class="text-[10px] t-disabled mb-3">Clients dont &gt;90% du CA est en livré (web, rep, DCS), sans passage comptoir. Cibles pour devenir leur dépannage de proximité.</p>

    <div class="grid grid-cols-3 gap-2 mb-4">
      <div class="s-card rounded-lg p-2 text-center"><div class="text-[10px] t-disabled">Clients Livrés</div><div class="text-[14px] font-bold t-primary">${totals.nb}</div></div>
      <div class="s-card rounded-lg p-2 text-center"><div class="text-[10px] t-disabled">CA Livré Total</div><div class="text-[14px] font-bold" style="color:#8b5cf6">${formatEuro(totals.caLivre)}</div></div>
      <div class="s-card rounded-lg p-2 text-center"><div class="text-[10px] t-disabled">CA Moyen / Client</div><div class="text-[14px] font-bold t-primary">${totals.nb ? formatEuro(totals.caLivre / totals.nb) : '—'}</div></div>
    </div>`;

  // ── Portrait-Robot: TOP 20 Valeur + TOP 20 Fréquence ──
  html += `<div class="mb-4">
    <h5 class="text-[12px] font-bold t-primary mb-2">📊 Portrait-Robot — Ce que ces clients commandent</h5>
    <div class="grid grid-cols-1 md:grid-cols-2 gap-3">`;

  // TOP 20 Valeur
  html += `<div class="s-card rounded-lg p-2">
    <div class="text-[10px] font-bold t-secondary mb-1">💰 TOP 20 — Valeur (CA)</div>
    <div style="max-height:320px;overflow-y:auto">
    <table class="w-full text-[10px]"><thead><tr class="border-b b-light">
      <th class="py-1 px-1 text-left" style="color:var(--t-secondary)">Article</th>
      <th class="py-1 px-1 text-right" style="color:var(--t-secondary)">CA</th>
      <th class="py-1 px-1 text-right" style="color:var(--t-secondary)">Cli</th>
      <th class="py-1 px-1 text-center" style="color:var(--t-secondary)">Stock</th>
    </tr></thead><tbody>`;
  for (const a of topValeur) {
    const stockBadge = a.inStock ? '<span style="color:#22c55e">✓</span>' : '<span style="color:#ef4444">✕</span>';
    html += `<tr class="border-b b-light">
      <td class="py-0.5 px-1"><span class="font-mono text-[9px]">${a.code}</span> <span class="truncate" title="${escapeHtml(a.libelle)}">${escapeHtml(a.libelle.slice(0, 35))}</span></td>
      <td class="py-0.5 px-1 text-right font-bold">${formatEuro(a.ca)}</td>
      <td class="py-0.5 px-1 text-right">${a.nbCli}</td>
      <td class="py-0.5 px-1 text-center">${stockBadge}</td>
    </tr>`;
  }
  html += `</tbody></table></div></div>`;

  // TOP 20 Fréquence
  html += `<div class="s-card rounded-lg p-2">
    <div class="text-[10px] font-bold t-secondary mb-1">🔄 TOP 20 — Fréquence (BL)</div>
    <div style="max-height:320px;overflow-y:auto">
    <table class="w-full text-[10px]"><thead><tr class="border-b b-light">
      <th class="py-1 px-1 text-left" style="color:var(--t-secondary)">Article</th>
      <th class="py-1 px-1 text-right" style="color:var(--t-secondary)">BL</th>
      <th class="py-1 px-1 text-right" style="color:var(--t-secondary)">Cli</th>
      <th class="py-1 px-1 text-center" style="color:var(--t-secondary)">Stock</th>
    </tr></thead><tbody>`;
  for (const a of topFreq) {
    const stockBadge = a.inStock ? '<span style="color:#22c55e">✓</span>' : '<span style="color:#ef4444">✕</span>';
    html += `<tr class="border-b b-light">
      <td class="py-0.5 px-1"><span class="font-mono text-[9px]">${a.code}</span> <span class="truncate" title="${escapeHtml(a.libelle)}">${escapeHtml(a.libelle.slice(0, 35))}</span></td>
      <td class="py-0.5 px-1 text-right font-bold">${a.bl}</td>
      <td class="py-0.5 px-1 text-right">${a.nbCli}</td>
      <td class="py-0.5 px-1 text-center">${stockBadge}</td>
    </tr>`;
  }
  html += `</tbody></table></div></div>`;
  html += `</div></div>`;

  // ── Kit Dépannage Intelligent ──
  if (kit.consommables.length || kit.valeur.length) {
    html += `<div class="mt-3">
      <h5 class="text-[12px] font-bold t-primary mb-2">🔧 Kit Dépannage — Roue de Secours Premium</h5>
      <p class="text-[10px] t-disabled mb-2">Articles commandés par ces clients que tu n'as PAS en stock. Deviens leur plan B d'urgence.</p>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-3">`;

    // Consommables fréquents
    if (kit.consommables.length) {
      html += `<div class="s-card rounded-lg p-2" style="border-left:3px solid #3b82f6">
        <div class="text-[10px] font-bold mb-1" style="color:#3b82f6">JE REMPLIS — Consommables Fréquents</div>
        <div class="text-[9px] t-disabled mb-1">TOP fréquence hors stock — les oublis/urgences de chantier</div>
        <table class="w-full text-[10px]"><tbody>`;
      for (const a of kit.consommables) {
        html += `<tr class="border-b b-light">
          <td class="py-0.5 px-1 font-mono text-[9px]">${a.code}</td>
          <td class="py-0.5 px-1 truncate max-w-[150px]" title="${escapeHtml(a.libelle)}">${escapeHtml(a.libelle.slice(0, 30))}</td>
          <td class="py-0.5 px-1 text-right">${a.bl} BL</td>
          <td class="py-0.5 px-1 text-right">${a.nbCli} cli</td>
        </tr>`;
      }
      html += `</tbody></table></div>`;
    }

    // Produits valeur
    if (kit.valeur.length) {
      html += `<div class="s-card rounded-lg p-2" style="border-left:3px solid #f59e0b">
        <div class="text-[10px] font-bold mb-1" style="color:#f59e0b">JE REMPLIS — Jamais en Panne</div>
        <div class="text-[9px] t-disabled mb-1">TOP valeur hors stock — "Oui je l'ai, venez dans 10 min"</div>
        <table class="w-full text-[10px]"><tbody>`;
      for (const a of kit.valeur) {
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

  html += `</div>`;
  return html;
}

function _prRenderTouristePanier(cc) {
  // Panier : articles achetés par ce client hors de mon agence
  const sqData = _prGetSqDataCached();
  const sqClassif = _prGetSqClassifMapCached(sqData);
  const fdMap = _prGetFdMap();

  // Collect articles from hors-magasin + livraisons
  const arts = new Map(); // code → {ca, source}
  const hmArts = _S.ventesClientHorsMagasin?.get(cc);
  if (hmArts) {
    for (const [code, d] of hmArts) {
      if (!/^\d{6}$/.test(code)) continue;
      arts.set(code, { ca: +(d.sumCA || 0), source: 'hors-mag' });
    }
  }
  if (_S.territoireLines?.length) {
    for (const l of _S.territoireLines) {
      if (l.clientCode !== cc || !/^\d{6}$/.test(l.code)) continue;
      if (!arts.has(l.code)) arts.set(l.code, { ca: 0, source: 'réseau' });
      arts.get(l.code).ca += +(l.ca || 0);
    }
  }
  // Also check what they buy at my store
  const myArts = _S.ventesClientArticle?.get(cc);
  if (myArts) {
    for (const [code, d] of myArts) {
      if (!/^\d{6}$/.test(code)) continue;
      if (!arts.has(code)) arts.set(code, { ca: 0, source: 'mon-mag' });
      const a = arts.get(code);
      a.monCA = +(d.sumCA || 0);
    }
  }

  const sorted = [...arts.entries()]
    .map(([code, d]) => {
      const fd = fdMap.get(code);
      const classif = sqClassif.get(code) || null;
      const inStock = fd && (fd.stockActuel || 0) > 0;
      return { code, ca: d.ca, monCA: d.monCA || 0, classif, inStock, libelle: articleLib(code) };
    })
    .sort((a, b) => b.ca - a.ca)
    .slice(0, 15);

  if (!sorted.length) {
    return `<tr><td colspan="8" class="py-2 px-4 text-[10px] t-disabled">Aucun article trouvé pour ce client.</td></tr>`;
  }

  let html = `<tr><td colspan="8" class="p-0"><div class="px-4 py-2" style="background:rgba(139,92,246,0.04)">
    <div class="text-[10px] font-bold t-secondary mb-1">🛒 Top articles achetés ailleurs — diagnostic assortiment</div>
    <table class="w-full text-[10px]"><tbody>`;
  for (const a of sorted) {
    const badge = a.classif === 'socle' ? '<span style="color:#22c55e">🟢 Socle</span>'
      : a.classif === 'implanter' ? '<span style="color:#3b82f6">🔵 À implanter</span>'
      : a.classif === 'challenger' ? '<span style="color:#ef4444">🔴 Challenger</span>'
      : a.classif === 'surveiller' ? '<span style="color:#94a3b8">👁 Surveiller</span>'
      : '<span class="t-disabled">—</span>';
    const stockBadge = a.inStock ? '<span style="color:#22c55e">✓</span>' : '<span style="color:#ef4444">✕</span>';
    html += `<tr class="border-b b-light">
      <td class="py-0.5 px-1 font-mono">${a.code}</td>
      <td class="py-0.5 px-1 truncate max-w-[180px]" title="${escapeHtml(a.libelle)}">${escapeHtml(a.libelle)}</td>
      <td class="py-0.5 px-1 text-right">${formatEuro(a.ca)}</td>
      <td class="py-0.5 px-1 text-right" style="color:#22c55e">${a.monCA ? formatEuro(a.monCA) : '—'}</td>
      <td class="py-0.5 px-1">${badge}</td>
      <td class="py-0.5 px-1 text-center">${stockBadge}</td>
    </tr>`;
  }
  html += `</tbody></table></div></td></tr>`;
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

window._prToggleTouriste = function(cc) {
  _prTouristeOpen = _prTouristeOpen === cc ? '' : cc;
  _prRerenderMetier();
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
     a.nbClientsZone, a.monCA.toFixed(2), a.pdm != null ? a.pdm : '', a.inStock ? 'Oui' : 'Non', a.role].join(';')
  );
  const csv = ['Code;Libellé;Famille;SF;Marque;CA Zone;Cli Zone;Mon CA;PdM%;En stock;Rôle', ...rows].join('\n');
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

  if (!_S.ventesParMagasin || !Object.keys(_S.ventesParMagasin).length || !_S.finalData?.length) {
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

  el.innerHTML = _prPerfBanner() + _prTopTabBar() + (_prTopView === 'metier' ? _renderPilotageMetierContent() : _prTopView === 'palmares' ? _renderPalmaresContent() : _renderPlanRayonContent(data));
  if (_prTopView === 'famille') _initPrSearch();
  if (_prTopView === 'metier') _initPrMetierInput();
  // Exposer les lookups squelette pour les filtres sidebar
  buildSqLookup();
  // Peupler les checkboxes "Comparer avec" dans la sidebar Plan
  _buildPlanBenchCheckboxes();
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
