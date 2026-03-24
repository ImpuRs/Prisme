// ═══════════════════════════════════════════════════════════════
// PILOT PRO — state.js
// Variables globales centralisées
// Dépend de : rien
// ═══════════════════════════════════════════════════════════════
'use strict';

// ── Core data ──
let finalData = [];
let filteredData = [];
let sortCol = 'V';
let sortAsc = false;
let currentPage = 0;
let debounceTimer = null;

// ── Store / ventes ──
let ventesParMagasin = {};
let stockParMagasin = {};
let storesIntersection = new Set();
let selectedMyStore = '';
let libelleLookup = {};
let articleFamille = {};
let articleUnivers = {};

// ── Benchmark ──
let benchLists = {
  missed: [], under: [], over: [], storePerf: {}, familyPerf: [],
  obsKpis: null, obsFamiliesLose: [], obsFamiliesWin: [], obsActionPlan: [], pepites: [], pepitesOther: []
};

// ── Cockpit ──
let cockpitLists = {};
let ventesAnalysis = { refParBL: 0, famParBL: 0, totalBL: 0, refActives: 0, attractivite: {} };
let blData = {};
let parentRefsExcluded = 0;
let globalJoursOuvres = 250;

// ── ABC/FMR ──
let abcMatrixData = {};

// ── Territoire ──
let canalAgence = {};
let blConsommeSet = new Set();
let clientsMagasin = new Set();
let territoireLines = [];
let territoireReady = false;
let terrDirectionData = {};
let terrContribBySecteur = new Map();
let terrContribByDirection = new Map();

// ── Agences par fichier (pour alerte stock mono-agence) ──
let storeCountConsomme = 0; // nb agences détectées dans le consommé
let storeCountStock = 0;    // nb agences détectées dans le stock

// ── Période consommé ──
let consommePeriodMin = null;
let consommePeriodMax = null;
let consommeMoisCouverts = 0;
let consommePeriodMinFull = null; // plage totale avant tout filtre période
let consommePeriodMaxFull = null;

// ── Filtre période global ──
let periodFilterStart = null; // null = pas de filtre (toute la période)
let periodFilterEnd = null;

// ── Insights banner ──
let _insights = { ruptures: 0, dormants: 0, absentsTerr: 0, extClients: 0, hasTerr: false };

// ── Zone de Chalandise ──
let chalandiseData = new Map();
let chalandiseReady = false;
let chalandiseMetiers = [];

// ── Filtres territoire / chalandise ──
let _selectedDepts = new Set();
let _selectedClassifs = new Set();
let _selectedStatuts = new Set();
let _selectedActivitesPDV = new Set();
let _selectedCommercial = '';
let _selectedMetier = '';
let _filterStrategiqueOnly = false;

// ── Client data ──
let ventesClientArticle = new Map();
let clientLastOrder = new Map(); // Map<clientCode, Date> — dernière commande PDV
let clientNomLookup = {};
let ventesClientsPerStore = {};
let articleClients = new Map();
let clientArticles = new Map();

// ── Observatoire ──
let selectedObsCompare = 'median';
let obsFilterUnivers = '';
let obsFilterMinCA = 0;

// ── Croisement consommé × chalandise ──
let crossingStats = null;
let _selectedCrossStatus = '';
let _cockpitExportData = null; // {urgences, developper, fideliser} — updated on each cockpit render
let excludedClients = new Map(); // Map<clientCode, {reason, date, by, category, nom, clientData}>
let _includePerdu24m = false;

// ── KPI history ──
let kpiHistory = [];

// ── Overview navigation state ──
let _overviewOpenL2 = null;
let _overviewOpenL3 = null;

// ── Diagnostic cascade ──
let _diagLevels = {};
let _diagActions = [];
let _diagPlanCopyText = '';
let _diagMetierFilter = '';
let _diagCurrentFamille = '';
let _diagCurrentSource = '';

// ── Active territoire worker (pour annulation au re-upload) ──
let _activeTerrWorker = null;

// ── Reset session — appeler en début de processData() ──────────
function resetAppState() {
  // Annuler le worker territoire en cours si présent
  if (_activeTerrWorker) { try { _activeTerrWorker.terminate(); } catch (_) {} _activeTerrWorker = null; }

  // Core data
  finalData = []; filteredData = []; currentPage = 0;

  // Store / ventes
  ventesParMagasin = {}; stockParMagasin = {}; storesIntersection = new Set();
  selectedMyStore = ''; libelleLookup = {}; articleFamille = {}; articleUnivers = {};

  // Benchmark
  benchLists = { missed: [], under: [], over: [], storePerf: {}, familyPerf: [], obsKpis: null, obsFamiliesLose: [], obsFamiliesWin: [], obsActionPlan: [], pepites: [], pepitesOther: [] };

  // Cockpit
  cockpitLists = {}; ventesAnalysis = { refParBL: 0, famParBL: 0, totalBL: 0, refActives: 0, attractivite: {} };
  blData = {}; parentRefsExcluded = 0; globalJoursOuvres = 250;

  // ABC/FMR
  abcMatrixData = {};

  // Territoire
  canalAgence = {}; blConsommeSet = new Set(); clientsMagasin = new Set();
  territoireLines = []; territoireReady = false; terrDirectionData = {};
  terrContribBySecteur = new Map(); terrContribByDirection = new Map();

  // Compteurs agences
  storeCountConsomme = 0; storeCountStock = 0;

  // Période
  consommePeriodMin = null; consommePeriodMax = null; consommeMoisCouverts = 0;
  consommePeriodMinFull = null; consommePeriodMaxFull = null;

  // Insights
  _insights = { ruptures: 0, dormants: 0, absentsTerr: 0, extClients: 0, hasTerr: false };

  // Clients
  ventesClientArticle = new Map(); clientLastOrder = new Map();
  clientNomLookup = {}; ventesClientsPerStore = {}; articleClients = new Map(); clientArticles = new Map();

  // Chalandise
  chalandiseData = new Map(); chalandiseReady = false; chalandiseMetiers = [];

  // Croisement / cockpit export
  crossingStats = null; _cockpitExportData = null;

  // KPI history
  kpiHistory = [];

  // Navigation overview
  _overviewOpenL2 = null; _overviewOpenL3 = null;

  // Diagnostic cascade
  _diagLevels = {}; _diagActions = []; _diagPlanCopyText = '';
  _diagMetierFilter = ''; _diagCurrentFamille = ''; _diagCurrentSource = '';
}
