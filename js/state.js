// ═══════════════════════════════════════════════════════════════
// PRISME — state.js
// Variables globales centralisées dans un objet mutable
// En ESM, les autres modules importent { _S } et mutent _S.varName
// Dépend de : rien
// ═══════════════════════════════════════════════════════════════
'use strict';

// Objet mutable unique : tous les modules partagent la même référence
// Les propriétés sont librement mutables depuis n'importe quel module.
export const _S = {};

// ── Core data ──
_S.finalData = [];
_S.filteredData = [];
_S.sortCol = 'caAnnuel'; // valeur par défaut alignée sur resetAppState()
_S.sortAsc = false;
_S.currentPage = 0;
_S.debounceTimer = null; // timer UI — intentionnellement absent de resetAppState() (pas de données métier)

// ── Store / ventes ──
_S.ventesParMagasin = {};
_S.stockParMagasin = {};
_S.storesIntersection = new Set();
_S.selectedMyStore = '';
_S.libelleLookup = {};
_S.articleFamille = {};
_S.articleUnivers = {};

// ── Benchmark ──
_S.benchLists = {
  missed: [], under: [], over: [], storePerf: {}, familyPerf: [],
  obsKpis: null, obsFamiliesLose: [], obsFamiliesWin: [], obsActionPlan: [], pepites: [], pepitesOther: []
};
_S.selectedBenchBassin = new Set(); // stores sélectionnés pour le bassin (vide = tous)
_S.benchFamEcarts = {};             // fam → {mean, sigma, my} — pour badge divergence
_S.reseauHeatmapData = null;        // {familles[], agences[], matrix{}} — heatmap réseau

// ── Cockpit ──
_S.cockpitLists = {};
_S.ventesAnalysis = { refParBL: 0, famParBL: 0, totalBL: 0, refActives: 0, attractivite: {} };
_S.blData = {};
_S.parentRefsExcluded = 0;
_S.globalJoursOuvres = 250;

// ── ABC/FMR ──
_S.abcMatrixData = {};

// ── Territoire ──
_S.canalAgence = {};
_S.blConsommeSet = new Set();
_S.blPreleveeSet = new Set(); // BL numbers where qteP > 0 (prélevé uniquement)
_S.clientsMagasin = new Set();
_S.clientsMagasinFreq = new Map(); // Map<clientCode, nbBL> — fréquence MAGASIN par client
_S.territoireLines = [];
_S.territoireReady = false;
_S.terrDirectionData = {};
_S.terrContribBySecteur = new Map();
_S.terrContribByDirection = new Map();
_S.pdvCanalFilter = 'all'; // 'all' | 'magasin' | 'preleve' — toggle Top clients PDV
_S.terrClientsCanalFilter = 'all'; // 'all' | 'magasin' | 'preleve'
_S._globalCanal = ''; // [Feature C] '' = Tous | 'MAGASIN' | 'INTERNET' | 'REPRESENTANT' | 'DCS'
_S._globalPeriodePreset = '12M'; // [Feature A] '12M' | '6M' | 'YTD' — filtre tendance/sparklines uniquement
_S.blCanalMap = new Map(); // BL → canal (built from consommé, passed to territoire worker)
_S.articleCanalCA = new Map(); // [F1 fix] code → Map(canal → {ca, qteP, countBL}) — tous canaux, toutes agences filtrées

// ── Agences par fichier (pour alerte stock mono-agence) ──
_S.storeCountConsomme = 0; // nb agences détectées dans le consommé
_S.storeCountStock = 0;    // nb agences détectées dans le stock

// ── Période consommé ──
_S.consommePeriodMin = null;
_S.consommePeriodMax = null;
_S.consommeMoisCouverts = 0;
_S.consommePeriodMinFull = null; // plage totale avant tout filtre période
_S.consommePeriodMaxFull = null;

// ── Filtre période global ──
_S.periodFilterStart = null; // null = pas de filtre (toute la période)
_S.periodFilterEnd = null;

// ── Insights banner ──
_S._insights = { ruptures: 0, dormants: 0, absentsTerr: 0, extClients: 0, hasTerr: false };

// ── Zone de Chalandise ──
_S.chalandiseData = new Map();
_S.chalandiseReady = false;
_S.chalandiseMetiers = [];
_S.clientsByMetier = new Map();
_S.clientsByCommercial = new Map();

// ── Filtres territoire / chalandise ──
_S._selectedDepts = new Set();
_S._selectedClassifs = new Set();
_S._selectedStatuts = new Set();
_S._selectedActivitesPDV = new Set();
_S._selectedCommercial = '';
_S._selectedMetier = '';
_S._filterStrategiqueOnly = false;

// ── Client data ──
_S.ventesClientArticle = new Map();
// Canaux hors MAGASIN : cc → Map(codeArticle → { canal, ca, count })
_S.ventesClientHorsMagasin = new Map();
// Canaux détectés hors MAGASIN dans le fichier
_S.cannauxHorsMagasin = new Set();
// CA agrégé par article et par canal (précalculé après chalandise)
_S.caByArticleCanal = new Map();
_S.clientLastOrder = new Map(); // Map<clientCode, Date> — dernière commande PDV
_S.clientNomLookup = {};
_S.ventesClientsPerStore = {};
_S.articleClients = new Map();
_S.clientArticles = new Map();

// ── Observatoire ──
_S.selectedObsCompare = 'median';
_S.obsFilterUnivers = '';
_S.obsFilterMinCA = 0;

// ── Croisement consommé × chalandise ──
_S.crossingStats = null;
_S._selectedCrossStatus = '';
_S._cockpitExportData = null; // {urgences, developper, fideliser} — updated on each cockpit render
_S.excludedClients = new Map(); // Map<clientCode, {reason, date, by, category, nom, clientData}>
_S._includePerdu24m = false;

// ── KPI history ──
_S.kpiHistory = [];

// ── Overview navigation state ──
_S._overviewOpenL2 = null;
_S._overviewOpenL3 = null;

// ── Lazy tab render cache ──
_S._tabRendered = {}; // tabId → true once rendered; reset on filter change

// ── Cache territoire par filtre canal ──────────────────────────────────────
// Map<cacheKey, { dirHtml, top100Html, cliHtml, contribHtml, kpi[] }>
// cacheKey = "canal|secteurs|q|filterDir|filterRayon"
// Invalidé uniquement au rechargement du fichier territoire.
// 5 canaux × quelques combos de filtres ≈ ~400–500 Ko max — négligeable.
_S._terrCanalCache = new Map();

// ── Cache Benchmark (Étape 4) ──
// { key, benchLists, benchFamEcarts } | null
// key = "myStore|bassin|univers|minCA|obsMode|chalandise"
// Invariant canal : le filtre canal ne touche pas computeBenchmark.
// Invalidé sur changement de bassin/métier/myStore/chalandise. Jamais sur canal.
_S._benchCache = null;

// ── Decision Queue (Sprint 1) ──
_S.decisionQueueData = [];

// ── Briefing data (set by renderDashboardAndCockpit, read by renderCockpitBriefing) ──
_S._briefingData = null;

// ── KPIs dynamiques — Sprint V3.2 ──
_S._iccData = null;      // Indice de Concentration Client
_S._fragiliteData = null; // Fragilité Produit (mono-client)

// ── Diagnostic cascade ──
_S._diagLevels = {};
_S._diagActions = [];
_S._diagPlanCopyText = '';
_S._diagMetierFilter = '';
_S._diagCurrentFamille = '';
_S._diagCurrentSource = '';

// ── Fantômes de rayon ──
_S.phantomArticles = [];

// ── Cohorte reconquête ──
_S.reconquestCohort = [];

// ── Client aggregation (Worker B1) ──
_S.clientFamCA = {};       // cc → {fam → caTotal}
_S.metierFamBench = {};    // metier → {fam → {nbClients, totalCA}}

// ── Moteur saisonnier (B3) ──
_S.seasonalIndex = {};         // famille → [12 coefficients]
_S.articleMonthlySales = {};   // code → [12 mois qtés]

// ── Opportunité nette Client×Famille (C1) ──
_S.opportuniteNette = [];      // [{cc, nom, metier, commercial, missingFams, totalPotentiel, nbMissing}]

// ── Active workers (pour annulation au re-upload) ──
_S._activeTerrWorker = null;
_S._activeClientWorker = null;

// ── Réseau worker (Sprint 2) ──────────────────────────────────
_S.reseauNomades = [];        // clients actifs dans ≥2 agences dont myStore
_S.nomadesMissedArts = [];    // { code, lib, fam, clientCodes, nbClients, caReseau }
_S.reseauOrphelins = [];      // articles ≥50% stores absents chez moi (top 50)
_S.reseauFuitesMetier = [];   // {metier, total, actifs, indiceFuite%} — si chalandise
_S._activeReseauWorker = null;

// ── Reset session — appeler en début de processData() ──────────
// CONVENTION : toute nouvelle variable _S.xxx DOIT être déclarée ICI (init)
// ET dans resetAppState() ci-dessous. Oublier le reset = bug silencieux au re-chargement.
export function resetAppState() {
  // Annuler les workers en cours si présents
  if (_S._activeTerrWorker) { try { _S._activeTerrWorker.terminate(); } catch (_) {} _S._activeTerrWorker = null; }
  if (_S._activeClientWorker) { try { _S._activeClientWorker.terminate(); } catch (_) {} _S._activeClientWorker = null; }

  // Core data
  _S.finalData = []; _S.filteredData = []; _S.currentPage = 0;
  _S.sortCol = 'caAnnuel'; _S.sortAsc = false;

  // Store / ventes
  _S.ventesParMagasin = {}; _S.stockParMagasin = {}; _S.storesIntersection = new Set();
  _S.selectedMyStore = ''; _S.libelleLookup = {}; _S.articleFamille = {}; _S.articleUnivers = {};

  // Benchmark
  _S.benchLists = { missed: [], under: [], over: [], storePerf: {}, familyPerf: [], obsKpis: null, obsFamiliesLose: [], obsFamiliesWin: [], obsActionPlan: [], pepites: [], pepitesOther: [] };
  _S.selectedBenchBassin = new Set(); _S.benchFamEcarts = {}; _S.reseauHeatmapData = null;

  // Cockpit
  _S.cockpitLists = {}; _S.ventesAnalysis = { refParBL: 0, famParBL: 0, totalBL: 0, refActives: 0, attractivite: {} };
  _S.blData = {}; _S.parentRefsExcluded = 0; _S.globalJoursOuvres = 250;

  // ABC/FMR
  _S.abcMatrixData = {};

  // Territoire
  _S.canalAgence = {}; _S.blConsommeSet = new Set(); _S.blPreleveeSet = new Set(); _S.pdvCanalFilter = 'all'; _S.terrClientsCanalFilter = 'all'; _S._globalCanal = ''; _S._globalPeriodePreset = '12M'; _S.blCanalMap = new Map(); _S.articleCanalCA = new Map(); _S.clientsMagasin = new Set(); _S.clientsMagasinFreq = new Map();
  _S.territoireLines = []; _S.territoireReady = false; _S.terrDirectionData = {};
  _S.terrContribBySecteur = new Map(); _S.terrContribByDirection = new Map();

  // Compteurs agences
  _S.storeCountConsomme = 0; _S.storeCountStock = 0;

  // Période
  _S.consommePeriodMin = null; _S.consommePeriodMax = null; _S.consommeMoisCouverts = 0;
  _S.consommePeriodMinFull = null; _S.consommePeriodMaxFull = null;
  _S.periodFilterStart = null; _S.periodFilterEnd = null;

  // Insights
  _S._insights = { ruptures: 0, dormants: 0, absentsTerr: 0, extClients: 0, hasTerr: false };

  // Clients
  _S.ventesClientArticle = new Map(); _S.ventesClientHorsMagasin = new Map(); _S.cannauxHorsMagasin = new Set(); _S.clientLastOrder = new Map(); _S.caByArticleCanal = new Map();
  _S.clientNomLookup = {}; _S.ventesClientsPerStore = {}; _S.articleClients = new Map(); _S.clientArticles = new Map();

  // Chalandise
  _S.chalandiseData = new Map(); _S.chalandiseReady = false; _S.chalandiseMetiers = [];
  _S.clientsByMetier = new Map(); _S.clientsByCommercial = new Map();

  // Observatoire
  _S.obsFilterUnivers = ''; _S.obsFilterMinCA = 0; _S.selectedObsCompare = 'median';

  // Croisement / cockpit export / exclusions
  _S.crossingStats = null; _S._cockpitExportData = null;
  _S._selectedCrossStatus = ''; _S.excludedClients = new Map(); _S._includePerdu24m = false;
  // Filtres chalandise
  _S._selectedDepts = new Set(); _S._selectedClassifs = new Set(); _S._selectedStatuts = new Set();
  _S._selectedActivitesPDV = new Set(); _S._selectedCommercial = ''; _S._selectedMetier = ''; _S._filterStrategiqueOnly = false;

  // KPI history
  _S.kpiHistory = [];

  // Navigation overview
  _S._overviewOpenL2 = null; _S._overviewOpenL3 = null;

  // Lazy tab render cache
  _S._tabRendered = {};

  // Cache territoire canal
  _S._terrCanalCache = new Map();

  // Cache benchmark
  _S._benchCache = null;

  // Decision Queue
  _S.decisionQueueData = [];

  // Briefing data
  _S._briefingData = null;
  _S._iccData = null; _S._fragiliteData = null;

  // Fantômes de rayon
  _S.phantomArticles = [];

  // Cohorte reconquête
  _S.reconquestCohort = [];

  // Client aggregation Worker
  _S.clientFamCA = {}; _S.metierFamBench = {};

  // Moteur saisonnier
  _S.seasonalIndex = {}; _S.articleMonthlySales = {};

  // Opportunité nette
  _S.opportuniteNette = [];

  // Diagnostic cascade
  _S._diagLevels = {}; _S._diagActions = []; _S._diagPlanCopyText = '';
  _S._diagMetierFilter = ''; _S._diagCurrentFamille = ''; _S._diagCurrentSource = '';

  // Réseau worker
  if (_S._activeReseauWorker) { try { _S._activeReseauWorker.terminate(); } catch (_) {} _S._activeReseauWorker = null; }
  _S.reseauNomades = []; _S.nomadesMissedArts = []; _S.reseauOrphelins = []; _S.reseauFuitesMetier = [];
}

// ── Invariants post-parsing — appeler après computeABCFMR() ────────────────
// Ces assertions détectent les régressions silencieuses lors des refactorings.
// Elles s'activent uniquement en dev (console.assert est no-op en prod si les devtools sont fermés).
export function assertPostParseInvariants() {
  // Invariant 1 : finalData peuplé après parsing stock
  console.assert(_S.finalData.length > 0,
    '[PRISME] finalData vide après parsing — vérifier le fichier État du Stock');

  // Invariant 2 : globalJoursOuvres dans une plage cohérente (non-bloquant — période variable)
  // < 40 j : données insuffisantes pour des MIN/MAX fiables
  // 40–90 j : période courte, MIN/MAX approximatifs (ex: consommé 3 mois)
  // 90–365 j : nominal — silencieux
  // > 365 j : période anormalement longue, probable anomalie de date
  {const _jj=_S.globalJoursOuvres;
  if(_jj<40)console.error('[PRISME] globalJoursOuvres='+_jj+' — données insuffisantes (<40 j), MIN/MAX non fiables');
  else if(_jj<90)console.warn('[PRISME] globalJoursOuvres='+_jj+' — période courte (40–90 j), MIN/MAX approximatifs');
  else if(_jj>365)console.warn('[PRISME] globalJoursOuvres='+_jj+' — période anormalement longue (>365 j), vérifier les dates du consommé');}

  // Invariant 3 : ventesClientArticle peuplé si un magasin est sélectionné
  // (MIN/MAX calculés sur agence sélectionnée — si vide, V=0 pour tous les articles)
  if (_S.selectedMyStore) {
    console.assert(_S.ventesClientArticle.size > 0,
      '[PRISME] ventesClientArticle vide avec magasin sélectionné : ' + _S.selectedMyStore);
  }

  // Invariant 4 : dualité ventesClientArticle/HorsMagasin — MAGASIN ne doit pas être dans cannauxHorsMagasin
  // (feature métier : PDV comptoir ≠ hors-agence — si cassé, les 2 structures se chevauchent)
  console.assert(!_S.cannauxHorsMagasin.has('MAGASIN'),
    '[PRISME] cannauxHorsMagasin contient MAGASIN — dualité PDV/hors-agence corrompue');

  // Invariant 5 : finalData stable par rapport au filtre canal (V calculé par agence, pas canal)
  // On vérifie que tous les articles ont un W et V numériques
  const _broken = _S.finalData.filter(r => typeof r.V !== 'number' || typeof r.W !== 'number').length;
  console.assert(_broken === 0,
    '[PRISME] ' + _broken + ' articles avec V ou W non-numériques dans finalData');
}
