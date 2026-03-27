/octo:debate

TITRE : Refactoring architecture données PRISME — vers une source de vérité unique

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CONTEXTE TECHNIQUE EXACT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

PRISME est un outil HTML statique (zéro backend, zéro bundler, ES6 modules
via <script type="module">). Il fonctionne dans un iframe Google Apps Script
ou en local. localStorage est interdit (bloqué dans GAS).

Fichiers chargés par l'utilisateur :
1. Consommé — export Qlik ~200k lignes (BL, client, article, canal, qté, CA)
2. État du Stock — stock actuel + MIN/MAX existants par article
3. Territoire — BL omnicanal Legallais (3ème fichier optionnel, Web Worker)
4. Chalandise — export clients zone (4ème fichier optionnel)

Modules JS : constants.js → utils.js → state.js → engine.js → parser.js
→ ui.js → main.js (point d'entrée ESM)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ÉTAT ACTUEL DU CODE — STRUCTURES PARALLÈLES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Toutes les variables globales vivent dans _S (state.js, objet mutable unique) :

```js
// state.js — extrait des structures clés
_S.finalData = [];          // articles enrichis (MIN/MAX, ABC/FMR, prix, couverture)
_S.ventesParMagasin = {};   // store → code → {sumPrelevee, sumCA, countBL, sumVMB}
_S.canalAgence = {};        // canal → {bl, ca, caP, caE}  (MAGASIN|INTERNET|REPRESENTANT|DCS)
_S.ventesClientArticle = new Map();     // cc → Map(code → {sumPrelevee,sumCAPrelevee,sumCA,countBL})
_S.ventesClientHorsMagasin = new Map(); // cc → Map(code → {canal, ca, count})
_S.blCanalMap = new Map();  // BL → canal (construit depuis consommé, passé au worker territoire)
_S.blConsommeSet = new Set(); // BL dans le consommé
_S.territoireLines = [];    // lignes brutes parsées (Web Worker) — LA SEULE source gardée brute
_S.articleClients = new Map();  // code → Set<clientCode>
_S.clientArticles = new Map();  // cc → Set<code>
_S.clientsMagasin = new Set();  // clients ayant acheté en canal MAGASIN
_S.clientsMagasinFreq = new Map(); // cc → nbBL (fréquence MAGASIN)
```

Le pipeline de parsing (`processDataFromRaw`, main.js ~ligne 1293) fait
UN SEUL passage sur les 200k lignes et construit TOUTES ces structures
en parallèle. Les lignes brutes du consommé ne sont PAS conservées en mémoire.

```js
// main.js ~ligne 1326 — initialisation en début de boucle consommé
_S.ventesParMagasin = {}; _S.blData = {}; _S.articleFamille = {};
_S.canalAgence = {};      _S.clientsMagasin = new Set();
_S.ventesClientArticle = new Map(); _S.ventesClientHorsMagasin = new Map();
_S.articleClients = new Map(); _S.clientArticles = new Map();

// ~ligne 1337 — capture canal AVANT filtre store
if (canal) {
  const nc2 = getVal(row, 'Numéro de commande', ...).toString().trim();
  if (nc2) {
    if (!_S.canalAgence[canal]) _S.canalAgence[canal] = {bl:new Set(), ca:0, caP:0, caE:0};
    _S.canalAgence[canal].bl.add(nc2);
  }
}

// ~ligne 1362 — ventesClientArticle (myStore only, canal MAGASIN)
if (cc2 && code && (!_S.selectedMyStore || sk === _S.selectedMyStore) && (qteP>0||qteE>0)) {
  if (!_S.ventesClientArticle.has(cc2)) _S.ventesClientArticle.set(cc2, new Map());
  const artMap = _S.ventesClientArticle.get(cc2);
  // ... agrégation sumPrelevee, sumCA, countBL
}

// ~ligne 1343 — ventesClientHorsMagasin (canaux NON-MAGASIN)
// Canaux hors MAGASIN → ventesClientHorsMagasin (tous canaux)
if (canal && canal !== 'MAGASIN' && cc2 && code) { ... }
```

Filtres canal actuels : purement réactifs sur structures précalculées
```js
_S.pdvCanalFilter = 'all'; // 'all' | 'magasin' | 'preleve' — toggle Top clients PDV
_S.terrClientsCanalFilter = 'all';
_S._selectedTerrCanal = ''; // '' | 'MAGASIN' | 'INTERNET' | 'REPRESENTANT' | 'DCS'
```

Le filtre canal GLOBAL n'existe pas — chaque vue filtre ses propres structures
précalculées de manière indépendante.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
OBJECTIF DU DÉBAT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

L'équipe veut ajouter un filtre canal global qui recalcule TOUT depuis
une seule source. L'idée naïve : `getLines(filters)` + `computeKPIs(lines)`.

Features qui doivent continuer à fonctionner sans régression :
- ABC/FMR (computeABCFMR sur finalData, engine.js)
- MIN/MAX (règles métier critiques — écrêtage, W≤1, Nouveauté <35j, etc.)
- Radar (matrix 3×3 cliquable, filtre famille/emplacement)
- Benchmark réseau (ventesParMagasin × médiane par famille)
- Cockpit (ruptures, alertes prévisionnelles, dormants, anomalies)
- Le Terrain complet (territoireLines, Vue Direction, Top 100, Clients, Contrib)
- Diagnostic Cascade 4 niveaux (stock → MIN/MAX → gamme → clients métier)
- Overview Chalandise (croisement ventesClientArticle × chalandiseData)
- Decision Queue (generateDecisionQueue sur finalData)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CONTRAINTES NON-NÉGOCIABLES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. Pas de backend — tout tourne dans le navigateur
2. Pas de localStorage (bloqué dans GAS)
3. Les lignes brutes du consommé (200k) ne sont pas conservées après parsing
   (par design — contrainte mémoire)
4. territoireLines [] EST conservé en mémoire (il est la source brute du 3ème fichier)
5. Les règles MIN/MAX (écrêtage dl=min(3×U,T), cas spéciaux W≤1/W=2/Nouveauté <35j)
   sont des invariants métier — ne pas toucher
6. Web Workers utilisés pour territoire (launchTerritoireWorker) et clients (launchClientWorker)
   pour ne pas bloquer l'UI sur les gros volumes

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
QUESTIONS DE DÉBAT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

**1. Architecture — source de vérité unique : possible ou mythe ?**

Option A — getLines(filters) + computeKPIs(lines) :
  - Conserver les lignes brutes du consommé en mémoire (TypedArray ? compression ?)
  - Recalculer toutes les agrégations à la volée au changement de filtre canal
  - Avantage : cohérence garantie, une seule source
  - Problème : les lignes brutes font ~200MB non compressées en JS objects

Option B — Couche de dérivation depuis les structures actuelles :
  - Garder ventesClientArticle/ventesClientHorsMagasin/canalAgence tels quels
  - Ajouter une fonction `getKPIsByCanal(canal, struct)` qui filtre les structures existantes
  - finalData reste la source pour MIN/MAX et ABC/FMR
  - territoireLines reste la source pour Le Terrain

Option C — Re-parsing à la volée depuis le fichier (File API) :
  - Stocker la référence `File` d'origine (IDB ?)
  - Re-parse partiel selon le filtre canal sélectionné
  - Compatible avec le principe "pas de grosse structure en mémoire"

Quelle option est architecturalement cohérente avec le design existant ?
Y a-t-il une Option D que le code suggère naturellement ?

---

**2. Performance — recalcul à la volée vs cache**

Le code utilise déjà plusieurs mécanismes de perf :
```js
// constants.js
export const CHUNK_SIZE = 5000;
export const TERR_CHUNK_SIZE = 10000;

// utils.js — cache colonnes pour éviter ~1M Object.keys dans les boucles
let _CC = { gv: {}, qty: {}, ca: {}, vmb: {} };
export function _resetColCache() { _CC = { gv: {}, qty: {}, ca: {}, vmb: {} }; }

// main.js — lazy tab render
_S._tabRendered = {}; // tabId → true once rendered; reset on filter change

// engine.js — traitement chunks avec yieldToMain()
export function yieldToMain() { return new Promise(r => setTimeout(r, 0)); }
```

Questions :
- Un filtre canal change-t-il les MIN/MAX ou seulement les KPIs de ventes ?
  (réponse dans le code : MIN/MAX dépendent de V=fréquence prélevée, W=semaines
   qui sont calculés sur le consommé filtré par agence, pas par canal)
- Si oui → recalcul complet de finalData à chaque changement canal = trop lent ?
- Cache `Map<canalFilter, computedState>` : combien de combinaisons réalistes ?
  (MAGASIN | INTERNET | REPRESENTANT | DCS | ALL = 5 états max)
- Quelle granularité de cache : par onglet ? par feature ?

---

**3. Migration — ordre et stratégie**

Le code actuel a une dépendance en cascade :
```
consommé parse → ventesParMagasin
                → canalAgence
                → ventesClientArticle (myStore, MAGASIN only)
                → ventesClientHorsMagasin (canaux non-MAGASIN)
                → blCanalMap (passé au territoire worker)
                → clientsMagasin (passé au territoire worker)
finalData (stock) → enrichPrixUnitaire → computeABCFMR → generateDecisionQueue
territoireLines (worker) → terrDirectionData → terrContribBySecteur
chalandiseData → clientsByMetier → computeClientCrossing → crossingStats
launchClientWorker → clientFamCA → metierFamBench → opportuniteNette
```

Questions :
- Quel est le bon ordre de migration pour ne pas tout casser ?
- Peut-on introduire une abstraction `DataStore` avec des getters calculés
  sans changer l'API consommée par les 10+ fonctions de rendu ?
- Faut-il d'abord stabiliser les interfaces (contrats des structures _S.xxx)
  avant de changer les implémentations ?
- Comment gérer la période de transition où les deux approches coexistent ?

---

**4. Périmètre — qu'est-ce qui DOIT rester pré-calculé ?**

Candidats à garder tels quels (invariants) :
```js
// engine.js — règles métier critiques, ne pas toucher
export function computeABCFMR(data) {
  const active = data.filter(r => r.W >= 1);
  active.sort((a, b) => (b.V * b.prixUnitaire) - (a.V * a.prixUnitaire));
  // ... calcul ABC cumulatif, FMR par seuils W≥12/W≥4
  _S.abcMatrixData = mx; // effet de bord intentionnel sur _S
}

export function calcCouverture(stock, V) {
  if (V <= 0 || stock <= 0) return 999;
  return Math.round(stock / (V / _S.globalJoursOuvres));
}
```

Candidats à refactorer :
- `canalAgence` : structure plate {canal → {bl, ca}} → peut devenir
  un getter calculé depuis une structure plus riche
- `ventesClientArticle` vs `ventesClientHorsMagasin` : dualité artificielle
  créée par le filtre MAGASIN/non-MAGASIN au parsing
- `terrDirectionData` : déjà calculé dans le Worker, pourrait être
  recalculé depuis `territoireLines` avec un filtre secteur/canal

Question centrale : la dualité ventesClientArticle/ventesClientHorsMagasin
est-elle un bug architectural ou une feature qui reflète une vraie distinction
métier (achat comptoir PDV vs achat hors agence) ?

```js
// main.js ~ligne 1915 — commentaire révélateur
// soldAtPDV = articles vendus en MAGASIN uniquement
// (ventesClientArticle = canal MAGASIN)
```

---

**5. Risques — dette actuelle vs risque de régression**

Dette technique identifiée :
- ~50 variables globales dans _S sans contrats d'interface formels
- `resetAppState()` de 80 lignes qui liste toutes les variables à réinitialiser
  → toute nouvelle variable oubliée crée un bug silencieux au re-chargement
- `processDataFromRaw` : une boucle de 200+ lignes qui fait 8 choses en même temps
- Les fonctions de rendu lisent directement _S sans indirection → couplage fort
- `_terrWorker()` sérialise et désérialise les données via postMessage
  (stockArr, blConsommeArr, blCanalArr) → duplication mémoire temporaire

Risques du refactoring :
- Changer finalData impacte : Cockpit, Radar, Benchmark, Diagnostic, DecisionQueue
- Changer ventesClientArticle impacte : Overview Chalandise, Diagnostic L4,
  _clientStatusBadge, _crossBadge, computeClientCrossing, launchClientWorker
- Changer blCanalMap impacte : launchTerritoireWorker → canal assigné à chaque
  ligne territoire (MAGASIN vs EXTÉRIEUR)
- Tests automatisés : zéro — validation uniquement manuelle avec fichiers réels

Question : vaut-il mieux refactorer prudemment feature par feature
en maintenant les deux représentations en parallèle temporairement,
ou faire un big-bang refactoring sur une branche isolée ?

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PARAMÈTRES DU DÉBAT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Participants suggérés :
- Architecte pragmatique : défend les structures pré-calculées actuelles,
  soulève les contraintes mémoire/perf navigateur
- Ingénieur refactoring : pousse vers une source unique getLines(),
  propose des patterns (CQRS léger, event sourcing en mémoire)
- Spécialiste performance front : argumente sur les trade-offs
  TypedArray vs Map vs plain objects pour 200k lignes
- Gardien métier : s'assure que les règles MIN/MAX, ABC/FMR, écrêtage
  restent intactes quelle que soit l'architecture choisie

Durée : 4 rounds
Format de sortie attendu : décision architecturale actionnée avec
  (a) les structures à garder telles quelles,
  (b) les structures à unifier,
  (c) l'ordre de migration recommandé en 3-5 étapes concrètes
