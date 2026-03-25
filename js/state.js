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
_S.sortCol = 'V';
_S.sortAsc = false;
_S.currentPage = 0;
_S.debounceTimer = null;

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
_S.clientsMagasin = new Set();
_S.territoireLines = [];
_S.territoireReady = false;
_S.terrDirectionData = {};
_S.terrContribBySecteur = new Map();
_S.terrContribByDirection = new Map();

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

// ── Active territoire worker (pour annulation au re-upload) ──
_S._activeTerrWorker = null;

// ── Reset session — appeler en début de processData() ──────────
export function resetAppState() {
  // Annuler le worker territoire en cours si présent
  if (_S._activeTerrWorker) { try { _S._activeTerrWorker.terminate(); } catch (_) {} _S._activeTerrWorker = null; }

  // Core data
  _S.finalData = []; _S.filteredData = []; _S.currentPage = 0;

  // Store / ventes
  _S.ventesParMagasin = {}; _S.stockParMagasin = {}; _S.storesIntersection = new Set();
  _S.selectedMyStore = ''; _S.libelleLookup = {}; _S.articleFamille = {}; _S.articleUnivers = {};

  // Benchmark
  _S.benchLists = { missed: [], under: [], over: [], storePerf: {}, familyPerf: [], obsKpis: null, obsFamiliesLose: [], obsFamiliesWin: [], obsActionPlan: [], pepites: [], pepitesOther: [] };

  // Cockpit
  _S.cockpitLists = {}; _S.ventesAnalysis = { refParBL: 0, famParBL: 0, totalBL: 0, refActives: 0, attractivite: {} };
  _S.blData = {}; _S.parentRefsExcluded = 0; _S.globalJoursOuvres = 250;

  // ABC/FMR
  _S.abcMatrixData = {};

  // Territoire
  _S.canalAgence = {}; _S.blConsommeSet = new Set(); _S.clientsMagasin = new Set();
  _S.territoireLines = []; _S.territoireReady = false; _S.terrDirectionData = {};
  _S.terrContribBySecteur = new Map(); _S.terrContribByDirection = new Map();

  // Compteurs agences
  _S.storeCountConsomme = 0; _S.storeCountStock = 0;

  // Période
  _S.consommePeriodMin = null; _S.consommePeriodMax = null; _S.consommeMoisCouverts = 0;
  _S.consommePeriodMinFull = null; _S.consommePeriodMaxFull = null;

  // Insights
  _S._insights = { ruptures: 0, dormants: 0, absentsTerr: 0, extClients: 0, hasTerr: false };

  // Clients
  _S.ventesClientArticle = new Map(); _S.clientLastOrder = new Map();
  _S.clientNomLookup = {}; _S.ventesClientsPerStore = {}; _S.articleClients = new Map(); _S.clientArticles = new Map();

  // Chalandise
  _S.chalandiseData = new Map(); _S.chalandiseReady = false; _S.chalandiseMetiers = [];
  _S.clientsByMetier = new Map(); _S.clientsByCommercial = new Map();

  // Croisement / cockpit export
  _S.crossingStats = null; _S._cockpitExportData = null;

  // KPI history
  _S.kpiHistory = [];

  // Navigation overview
  _S._overviewOpenL2 = null; _S._overviewOpenL3 = null;

  // Decision Queue
  _S.decisionQueueData = [];

  // Briefing data
  _S._briefingData = null;
  _S._iccData = null; _S._fragiliteData = null;

  // Fantômes de rayon
  _S.phantomArticles = [];

  // Diagnostic cascade
  _S._diagLevels = {}; _S._diagActions = []; _S._diagPlanCopyText = '';
  _S._diagMetierFilter = ''; _S._diagCurrentFamille = ''; _S._diagCurrentSource = '';
}
