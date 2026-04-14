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
_S._pushedCodes = new Set();
_S.sortCol = 'caAnnuel'; // valeur par défaut alignée sur resetAppState()
_S.sortAsc = false;
_S.currentPage = 0;
_S.debounceTimer = null; // timer UI — intentionnellement absent de resetAppState() (pas de données métier)

// ── Store / ventes ──
_S.ventesParMagasin = {};
_S.ventesParMagasinByCanal = {}; // structure séparée multi-canal pour Spectre Réseau
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

// ── Cockpit ──
_S.cockpitLists = {ruptures:new Set(),fantomes:new Set(),sansemplacement:new Set(),anomalies:new Set(),saso:new Set(),dormants:new Set(),fins:new Set(),top20:new Set(),nouveautes:new Set(),colisrayon:new Set(),stockneg:new Set(),fragiles:new Set(),phantom:new Set()};
_S.ventesAnalysis = { refParBL: 0, famParBL: 0, totalBL: 0, refActives: 0, attractivite: {} };
_S.cockpitCounts = {};
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
_S._clientsPDVPage = 0; // 0=top5, >=1=page paginée (20/page)
_S._topPDVOpen = true; // état ouvert/fermé du panneau Top clients PDV
_S._showHorsAgence = false; // dérivé de _clientView
_S._showHorsZone   = false; // dérivé de _clientView
_S._horsZonePage = 0; // 0=top5, >=1=page paginée (20/page) — Clients PDV hors zone
_S._clientView = 'tous'; // 'tous' | 'potentiels' | 'captes' | 'horszone' | 'multicanaux'
_S._omniSegmentFilter = ''; // '' | 'purComptoir' | 'purHors' | 'hybride' | 'full'
_S._captationFilter = ''; // '' | 'captes' | 'potentiels' | 'fideles'
_S.terrClientsCanalFilter = 'all'; // 'all' | 'magasin' | 'preleve'
_S._clientsActiveTab = 'priorites'; // 'priorites' | 'horsagence' | 'commercial'
_S._hasStock = false; // true dès que le fichier Stock est chargé et parsé
_S._globalCanal = ''; // [Feature C] '' = Tous | 'MAGASIN' | 'INTERNET' | 'REPRESENTANT' | 'DCS' | 'AUTRE'
_S._reseauCanaux = new Set(); // Filtre canal LOCAL à Spectre Réseau (multi-sélection) — n'affecte pas _globalCanal ni finalData
_S._reseauMagasinMode = 'all'; // 'all' | 'preleve' | 'enleve' — sous-filtre MAGASIN dans Spectre Réseau
_S._globalPeriodePreset = '12M'; // [Feature A] '12M' | '6M' | 'YTD' — filtre tendance/sparklines uniquement
_S._rankSortKey = 'pdmBassin'; // [V3] tri classement agences : 'txMarge' | 'freq' | 'serv' | 'pdmBassin'
_S._rankSortDir = -1;         // [V3] -1 = DESC, 1 = ASC
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
_S._selectedStatutDetaille = '';
_S._selectedDirections = new Set();
_S._selectedUnivers = new Set();
_S._selectedCommercial = '';       // FILTRE MAÎTRE — global, pas par onglet
_S._selectedMetier = '';
_S._filterStrategiqueOnly = false;
_S._filterHorsAgence = false;    // filtre Articles : uniquement articles avec CA hors agence
_S._terrClientSearch = '';       // filtre clients Commerce : recherche nom/code
_S._distanceMaxKm = 0; // 0 = pas de filtre distance
// ── Filtres tactiques PAR ONGLET (état indépendant Conquête / Fidélisation) ──
export function _defaultTacticalFilters() {
  return { distanceMaxKm:0, selectedDepts:new Set(), selectedMetier:'', filterStrategiqueOnly:false, selectedClassifs:new Set(), selectedStatuts:new Set(), selectedActivitesPDV:new Set(), selectedStatutDetaille:'', includePerdu24m:false, selectedDirections:new Set(), selectedUnivers:new Set() };
}
_S._tabFilters = { commerce: _defaultTacticalFilters(), clients: _defaultTacticalFilters() };
_S._activeCommerceTab = '';  // 'commerce' | 'clients' — onglet tactique courant
_S._cpCoords = null; // table CP → [lat, lon], chargée au démarrage
_S._agenceCoords = null; // [lat, lon] de l'agence sélectionnée

_S._clientDominantUnivers = new Map(); // cc → univers dominant (par CA)

/**
 * @typedef {Object} ClientArticleFact
 * @property {number} sumPrelevee    - Quantité prélevée (prél uniquement)
 * @property {number} sumCAPrelevee  - CA sur quantités prélevées
 * @property {number} sumCA          - CA total (prél + enlev)
 * @property {number} [sumCAAll]     - CA tous canaux (ventesClientArticle uniquement)
 * @property {number} countBL        - Nb BL distincts
 * @property {string} [canal]        - Canal source (ventesClientHorsMagasin uniquement)
 */
// ── Client data ──
// Achats comptoir : cc → Map(codeArticle → ClientArticleFact) — myStore, canal MAGASIN uniquement
_S.ventesClientArticle = new Map();
// Snapshot période-invariante (toute la période consommé) — pour cockpit/silencieux/Top 5
_S.ventesClientArticleFull = new Map();
// Canaux hors MAGASIN : cc → Map(codeArticle → ClientArticleFact avec .canal) — tous canaux non-MAGASIN
_S.ventesClientHorsMagasin = new Map();
// CA MAGASIN dans d'autres agences : cc → totalCA (comptoir ailleurs)
_S.ventesClientAutresAgences = new Map();
// Canaux détectés hors MAGASIN dans le fichier
_S.cannauxHorsMagasin = new Set();
// CA agrégé par article et par canal (précalculé après chalandise)
_S.caByArticleCanal = new Map();
_S.clientLastOrder = new Map(); // Map<clientCode, Date> — dernière commande PDV
_S.clientLastOrderAll = new Map(); // Map<clientCode, {date:Date, canal:string}> — tous canaux
_S.clientLastOrderByCanal = new Map(); // Map<clientCode, Map<canal, Date>> — dernière commande par canal
_S.clientNomLookup = {};
_S.ventesClientsPerStore = {};
_S.commandesPerStoreCanal = {};
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

// ── Table de Forçage Commercial (Shadow CRM) ──
// Map<clientCode, commercialCode> — override ERP pour rattacher les hors-zone au bon commercial
_S.forcageCommercial = new Map();

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

// ── Livraisons (5ème fichier optionnel) ──
_S.livraisonsData = new Map();   // cc → { ca, vmb, bl:Set, articles:Map, lastDate }
_S.livraisonsReady = false;
_S.livraisonsClientCount = 0;
_S.livraisonsDateMin = null;  // Date — début période Livraisons (pour alignement captation)
_S.livraisonsDateMax = null;  // Date — fin période Livraisons

// ── Client aggregation (Worker B1) ──
_S.clientFamCA = {};       // cc → {fam → caTotal}
_S.metierFamBench = {};    // metier → {fam → {nbClients, totalCA}}

// ── Moteur saisonnier (B3) ──
_S.seasonalIndex = {};         // famille → [12 coefficients] — agence sélectionnée
_S.seasonalIndexReseau = {};   // famille → [12 coefficients] — toutes agences (plus stable)
_S.articleMonthlySales = {};   // code → [12 mois qtés]

// ── Opportunité nette Client×Famille (C1) ──
_S.opportuniteNette = [];      // [{cc, nom, metier, commercial, missingFams, totalPotentiel, nbMissing}]

// ── Accumulation mensuelle pour filtre période instantané ──
_S._byMonth = null;         // accumulation mensuelle cc→code→monthIdx→agg (MAGASIN)
_S._byMonthFull = null;     // accumulation mensuelle cc→code→monthIdx→{sumCA} (TOUS canaux, myStore)
_S._byMonthCanal = null;    // accumulation mensuelle store→canal→monthIdx→agg
_S._byMonthStoreArtCanal = null; // accumulation mensuelle store→canal→code→monthIdx→agg (rebuild ventesParMagasinByCanal période)
_S._byMonthStoreClients = null;  // accumulation mensuelle store→monthIdx→Set<cc> (rebuild nbClients période)
_S._byMonthClients = null;  // accumulation mensuelle monthIdx→Set<cc> — tous canaux, pleine période
_S._byMonthClientsByCanal = null;  // accumulation mensuelle monthIdx→canal→Set<cc> — clients par canal+période
_S._clientsTousCanaux = null; // Set<cc> — clients ayant au moins 1 BL dans la période sélectionnée (tous canaux)

// ── Active workers (pour annulation au re-upload) ──
_S._activeTerrWorker = null;
_S._activeClientWorker = null;

// ── Réseau worker (Sprint 2) ──────────────────────────────────
_S.reseauNomades = [];        // clients actifs dans ≥2 agences dont myStore
_S.nomadesMissedArts = [];    // { code, lib, fam, clientCodes, nbClients, caReseau }
_S.reseauOrphelins = [];      // articles ≥50% stores absents chez moi (top 50)
_S.reseauFuitesMetier = [];   // {metier, total, actifs, indiceFuite%} — si chalandise
_S._activeReseauWorker = null;

// ── Propriétés anciennement non déclarées (Sprint 0 — stabilisation) ──
_S._commerceView = 'clients';       // 'clients' | 'familles' — vue commerce terrain
_S._missedSortCol = 'freq';         // tri articles manquants réseau
_S._missedSortDir = 'desc';         // direction tri missed
_S._rawDataC = null;                 // données brutes consommé COMPLET — {headers, rows} (pour benchmark réseau)
_S._rawDataCFiltered = null;        // données brutes consommé filtrées agence — {headers, rows} (pour refilter période)
_S._rawDataS = [];                  // données brutes stock (pour refilter période)
_S._fileC = null;                   // File consommé — conservé pour refilter période via parse-worker
_S._fileS = null;                   // File stock — conservé pour refilter période via parse-worker
_S._idbSaving = false;              // guard anti-sauvegardes concurrentes (_saveSessionToIDB)
_S._livraisonsLoading = false;      // guard anti-appels concurrents parseLivraisons
_S._chalandiseLoading = false;      // guard anti-appels concurrents parseChalandise
_S._parsingInProgress = false;      // guard anti-renderAll pendant parsing/restauration
_S._reseauMissedFamFilter = '';     // filtre famille missed réseau
_S._reseauMissedPage = 0;           // pagination missed réseau
_S._reseauMissedShowAll = false;    // mode "voir tout" missed
_S.clientOmniScore = new Map();     // Map<cc, {segment, score, caPDV, caHors, nbBL, silenceDays}>
_S.clientStore = new Map();          // Map<cc, ClientRecord> — store client unifié (client-store.js)
_S.agenceStore = new Map();          // Map<storeCode, AgenceRecord> — store agence unifié (agence-store.js)
_S.articleStore = null;              // Map<code, ArticleRecord> — store article unifié (article-store.js)
_S.famillesHors = [];               // [{fam, rawFam, nbClients, caHors, mainCanal, clients[]}]
_S._livraisonsDebug = {};           // debug info parsing livraisons
_S._metierStrategiques = new Set(); // Set<metier> — métiers stratégiques détectés

// ── Catalogue marques (Animation) ──
_S.catalogueMarques = null;    // Map<code, marque> — chargé une fois au boot
_S.marqueArticles = null;      // Map<marque, Set<code>>
_S.marquesList = [];           // string[] sorted — autocomplétion
_S.catalogueDesignation = null; // Map<code, designation> — libellé catalogue
_S.catalogueFamille = null;    // Map<code, {libFam, sousFam}> — famille + sous-famille catalogue
_S._animationData = null;      // cache du dernier computeAnimation
_S._rayonData = null;          // cache du dernier computeMonRayon
_S._rayonSearchIndex = null;   // cache de l'index de recherche Mon Rayon
_S._rfData = null;             // cache du dernier computeRadarFamille

// ── Invalidation centralisée des caches ──────────────────────────
// Scopes : 'all' (défaut) | 'tab' | 'terr' | 'bench'
// Combine : invalidateCache('tab', 'terr') pour invalider tab + territoire
export function invalidateCache(...scopes) {
  const all = scopes.length === 0 || scopes.includes('all');
  if (all || scopes.includes('tab'))   { _S._tabRendered = {}; _S._prDeferred = false; if (typeof window !== 'undefined') window._invalidateKpiCache?.(); }
  if (all || scopes.includes('terr'))  { _S._terrCanalCache = new Map(); _S._squeletteScan = null; _S.articleZoneIndex = null; _S.articleStore = null; }
  if (all || scopes.includes('art'))   { _S.articleStore = null; _S.articleZoneIndex = null; }
  if (all || scopes.includes('bench')) _S._benchCache = null;
}

// ── Reset session — appeler en début de processData() ──────────
// CONVENTION : toute nouvelle variable _S.xxx DOIT être déclarée ICI (init)
// ET dans resetAppState() ci-dessous. Oublier le reset = bug silencieux au re-chargement.
export function resetAppState() {
  // Annuler les workers en cours si présents
  if (_S._activeTerrWorker) { try { _S._activeTerrWorker.terminate(); } catch (_) {} _S._activeTerrWorker = null; }
  if (_S._activeClientWorker) { try { _S._activeClientWorker.terminate(); } catch (_) {} _S._activeClientWorker = null; }

  // Core data
  _S.finalData = []; _S.filteredData = []; _S.currentPage = 0; _S._pushedCodes = new Set();
  _S.sortCol = 'caAnnuel'; _S.sortAsc = false;

  // Store / ventes
  _S.ventesParMagasin = {}; _S.ventesParMagasinByCanal = {}; _S.stockParMagasin = {}; _S.storesIntersection = new Set();
  _S.selectedMyStore = ''; _S.libelleLookup = {}; _S.articleFamille = {}; _S.articleUnivers = {};

  // Benchmark
  _S.benchLists = { missed: [], under: [], over: [], storePerf: {}, familyPerf: [], obsKpis: null, obsFamiliesLose: [], obsFamiliesWin: [], obsActionPlan: [], pepites: [], pepitesOther: [] };
  _S.selectedBenchBassin = new Set(); _S.benchFamEcarts = {}; 
  // Cockpit
  _S.cockpitLists = {ruptures:new Set(),fantomes:new Set(),sansemplacement:new Set(),anomalies:new Set(),saso:new Set(),dormants:new Set(),fins:new Set(),top20:new Set(),nouveautes:new Set(),colisrayon:new Set(),stockneg:new Set(),fragiles:new Set(),phantom:new Set()}; _S.ventesAnalysis = { refParBL: 0, famParBL: 0, totalBL: 0, refActives: 0, attractivite: {} }; _S.cockpitCounts = {};
  _S.blData = {}; _S.parentRefsExcluded = 0; _S.globalJoursOuvres = 250;

  // ABC/FMR
  _S.abcMatrixData = {};

  // Territoire
  _S.canalAgence = {}; _S.blConsommeSet = new Set(); _S.blPreleveeSet = new Set(); _S.pdvCanalFilter = 'all'; _S.terrClientsCanalFilter = 'all'; _S._globalCanal = ''; _S._globalPeriodePreset = '12M'; _S._reseauCanaux = new Set(); _S._reseauMagasinMode = 'all'; _S.blCanalMap = new Map(); _S.articleCanalCA = new Map(); _S.clientsMagasin = new Set(); _S.clientsMagasinFreq = new Map(); _S._clientsPDVPage = 0; _S._showHorsAgence = false; _S._showHorsZone = false; _S._horsZonePage = 0; _S._clientView = 'tous'; _S._topPDVOpen = true;
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
  _S.ventesClientArticle = new Map(); _S.ventesClientArticleFull = new Map(); _S.ventesClientHorsMagasin = new Map(); _S.ventesClientAutresAgences = new Map(); _S.cannauxHorsMagasin = new Set(); _S.clientLastOrder = new Map(); _S.clientLastOrderAll = new Map(); _S.clientLastOrderByCanal = new Map(); _S.caByArticleCanal = new Map();
  _S.clientNomLookup = {}; _S.ventesClientsPerStore = {}; _S.commandesPerStoreCanal = {}; _S.articleClients = new Map(); _S.clientArticles = new Map();

  // Chalandise
  _S.chalandiseData = new Map(); _S.chalandiseReady = false; _S.chalandiseMetiers = [];
  _S.clientsByMetier = new Map(); _S.clientsByCommercial = new Map();

  // Observatoire
  _S.obsFilterUnivers = ''; _S.obsFilterMinCA = 0; _S.selectedObsCompare = 'median';

  // Croisement / cockpit export / exclusions
  _S.crossingStats = null; _S._cockpitExportData = null;
  _S._selectedCrossStatus = ''; _S.excludedClients = new Map(); _S._includePerdu24m = false;
  // NB: forcageCommercial n'est PAS reset ici — il persiste entre les rechargements de fichiers
  // Filtres chalandise
  _S._selectedDepts = new Set(); _S._selectedClassifs = new Set(); _S._selectedStatuts = new Set();
  _S._selectedActivitesPDV = new Set(); _S._selectedStatutDetaille = ''; _S._selectedDirections = new Set(); _S._selectedUnivers = new Set(); _S._selectedCommercial = ''; _S._selectedMetier = ''; _S._filterStrategiqueOnly = false; _S._filterHorsAgence = false; _S._terrClientSearch = ''; _S._distanceMaxKm = 0; _S._agenceCoords = null;
  _S._tabFilters = { commerce: _defaultTacticalFilters(), clients: _defaultTacticalFilters() }; _S._activeCommerceTab = '';
  _S._clientDominantUnivers = new Map();
  _S._clientsActiveTab = 'priorites';
  _S._hasStock = false;

  // KPI history
  _S.kpiHistory = [];

  // Navigation overview
  _S._overviewOpenL2 = null; _S._overviewOpenL3 = null;

  // Caches (invalidation centralisée)
  invalidateCache('all');

  // Briefing data
  _S._briefingData = null;
  _S._iccData = null; _S._fragiliteData = null;

  // Fantômes de rayon
  _S.phantomArticles = [];

  // Cohorte reconquête
  _S.reconquestCohort = [];
  _S.livraisonsSansPDV = [];

  // Livraisons
  _S.livraisonsData = new Map(); _S.livraisonsReady = false; _S.livraisonsClientCount = 0; _S.livraisonsDateMin = null; _S.livraisonsDateMax = null;
  _S._livSansPDVPage = 1;
  _S._oppNettePage = 1;

  // Client aggregation Worker
  _S.clientFamCA = {}; _S.metierFamBench = {};

  // Moteur saisonnier
  _S.seasonalIndex = {}; _S.seasonalIndexReseau = {}; _S.articleMonthlySales = {};

  // Opportunité nette
  _S.opportuniteNette = [];

  // Diagnostic cascade
  _S._diagLevels = {}; _S._diagActions = []; _S._diagPlanCopyText = '';
  _S._diagMetierFilter = ''; _S._diagCurrentFamille = ''; _S._diagCurrentSource = '';

  // Réseau worker
  if (_S._activeReseauWorker) { try { _S._activeReseauWorker.terminate(); } catch (_) {} _S._activeReseauWorker = null; }
  _S.reseauNomades = []; _S.nomadesMissedArts = []; _S.reseauOrphelins = []; _S.reseauFuitesMetier = [];

  // Ranking réseau
  _S._rankSortKey = 'pdmBassin'; _S._rankSortDir = -1;

  // Propriétés anciennement non déclarées (Sprint 0)
  _S._commerceView = 'clients'; _S._missedSortCol = 'freq'; _S._missedSortDir = 'desc';
  _S._rawDataC = null; _S._rawDataCFiltered = null; _S._rawDataS = [];
  _S._fileC = null; _S._fileS = null;
  _S._byMonth = null; _S._byMonthFull = null; _S._byMonthCanal = null; _S._byMonthStoreArtCanal = null; _S._byMonthStoreClients = null; _S._byMonthClients = null; _S._byMonthClientsByCanal = null; _S._clientsTousCanaux = null;
  _S._reseauMissedFamFilter = ''; _S._reseauMissedPage = 0; _S._reseauMissedShowAll = false;
  _S.clientOmniScore = new Map();
  _S.clientStore = new Map();
  _S.agenceStore = new Map();
  _S.famillesHors = [];
  _S._livraisonsDebug = {};
  _S._metierStrategiques = new Set();

  // Labo
  _S._laboSeuilPenetration = 0.20;
  _S._laboSilData = null;
  _S._laboFamData = null;
  _S._squeletteScan = null;
  _S._squeletteFull = null;
  _S.articleZoneIndex = null;
  _S.articleStore = null;
  _S._clienteleMetier = null;
  _S._clienteleData = null;

  // Animation
  _S._animationData = null;
  // Associations (persistées en IDB)
  if (!_S._associations) _S._associations = []; // ne PAS reset si déjà chargé
  _S._assocEditMode = false; _S._assocEditing = null; _S._assocOpenId = null;

  // Mon Rayon
  _S._rayonData = null;
  _S._rayonSearchIndex = null;

  // Radar Famille
  _S._rfData = null;
}

// ── Invariants post-parsing — appeler après computeABCFMR() ────────────────
// Ces assertions détectent les régressions silencieuses lors des refactorings.
// Elles s'activent uniquement en dev (console.assert est no-op en prod si les devtools sont fermés).
export function assertPostParseInvariants() {
  // Invariant 1 : finalData peuplé après parsing stock (ignoré en mode consommé seul)
  if (_S._hasStock) {
    console.assert(_S.finalData.length > 0,
      '[PRISME] finalData vide après parsing — vérifier le fichier État du Stock');
  }

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

  // Invariant 6 : ventesClientHorsMagasin utilise le schéma ClientArticleFact (sumCA, pas ca)
  // Si un entry contient encore l'ancien champ 'ca', la migration étape 2 n'a pas été appliquée.
  if (_S.ventesClientHorsMagasin.size > 0) {
    const _first = _S.ventesClientHorsMagasin.values().next().value;
    if (_first?.size > 0) {
      const _firstVal = _first.values().next().value;
      console.assert(typeof _firstVal?.sumCA === 'number',
        '[PRISME] ventesClientHorsMagasin utilise encore l\'ancien schema {ca} — migration étape 2 requise');
    }
  }
}
