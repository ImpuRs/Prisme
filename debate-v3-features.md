/octo:debate

TITRE : PRISME V3 — Architecture multi-dimensions : implémentation de 4 features dans l'ordre optimal

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CONTEXTE TECHNIQUE EXACT — ÉTAT DU CODE APRÈS ÉTAPES 1-5
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

PRISME est un outil HTML statique (zéro backend, zéro bundler, ES6 modules
via <script type="module">). Il tourne dans un iframe Google Apps Script ou
en local. localStorage est interdit (bloqué GAS).

Les 5 étapes du premier débat ont été implémentées :
- Étape 1 : assertPostParseInvariants() + contrats _S formalisés (state.js)
- Étape 2 : getKPIsByCanal(canal) exposée sur window depuis main.js
- Étape 3 : _S._terrCanalCache (Map<canal, htmlString>) + _S._selectedTerrGlobalCanal
- Étape 4 : _S._benchCache (clé sans canal) dans computeBenchmark()
- Étape 5 : DataStore proxy (store.js) — lecture seule sur _S, getters [CANAL-INVARIANT]
             et [CANAL-DÉRIVÉ] annotés, byCanal(canal) exposé

Architecture actuelle des modules :
  constants.js → utils.js → state.js → engine.js → parser.js → ui.js
  → main.js (point d'entrée, expose window.getKPIsByCanal / window.DataStore)
  → diagnostic.js / promo.js (consommateurs DataStore migrés)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STRUCTURES CLÉS ACTUELLES (état post-étapes 1-5)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

```js
// state.js — structures pertinentes pour V3

// ── Structures CANAL-INVARIANT (finalData) ──────────────────────────────
_S.finalData = [];
// Chaque entrée : {code, libelle, statut, famille, sousFamille, emplacement,
//   W, V, stockActuel, prixUnitaire, valeurStock,
//   ancienMin, ancienMax, nouveauMin, nouveauMax,
//   ageJours, isNouveaute, enleveTotal, couvertureJours, isParent}
// ⚠️ AUCUN champ .canal — finalData est invariant canal (W et V calculés
//    sur consommé agence entier, pas filtré par canal)

// ── Canal ──────────────────────────────────────────────────────────────
_S.canalAgence = {};        // canal → {bl: Set, ca, caP, caE}
_S.blCanalMap = new Map();  // BL/commande → canal (passé au Worker territoire)
_S.territoireLines = [];    // lignes brutes territoire (Web Worker) — source gardée

// byCanal() getKPIsByCanal() retourne terrLines filtré depuis territoireLines
// BUG CONNU : en mode dégradé (pas de fichier territoire), territoireLines = []
// → terrLines toujours vide → vues canal-territoire inutilisables

// ── Clients / Chalandise ────────────────────────────────────────────────
_S.ventesClientArticle = new Map();
// cc → Map(code → {sumPrelevee, sumCAPrelevee, sumCA, countBL})
// ⚠️ MAGASIN uniquement, AUCUNE dimension canal par entrée

_S.ventesClientHorsMagasin = new Map();
// cc → Map(code → {canal, ca, count})
// Canaux hors-MAGASIN seulement, UN SEUL canal par entrée (limite actuelle)

_S.chalandiseData = new Map();      // cc → {nom, metier, statut, classification, ...}
_S.clientsByCommercial = new Map(); // commercial → Set<clientCode> — déjà construit
_S.clientsByMetier = new Map();     // metier → Set<clientCode>

// ── Période ─────────────────────────────────────────────────────────────
_S.periodFilterStart = null;  // Date | null — déjà dans state, UI non exposée
_S.periodFilterEnd   = null;  // Date | null
_S.consommePeriodMin = null;  // Date : début réel du fichier consommé
_S.consommePeriodMax = null;  // Date : fin réelle du fichier consommé
_S.globalJoursOuvres = 250;  // calculé dynamiquement dans processData()

// ── Saisonnalité ────────────────────────────────────────────────────────
_S.articleMonthlySales = {};  // code → [12 qtés mensuelles] — déjà construit
_S.seasonalIndex = {};        // famille → [12 coefficients saisonniers]

// ── Cache existant ──────────────────────────────────────────────────────
_S._terrCanalCache = new Map();  // canal → htmlString (Étape 3)
_S._benchCache = null;           // {html, key} (Étape 4)
_S._tabRendered = {};            // tabId → bool (lazy render)
```

```js
// store.js — DataStore proxy (lecture seule)
export const DataStore = {
  get finalData()               { return _S.finalData; },       // [CANAL-INVARIANT]
  get filteredData()            { return _S.filteredData; },
  get abcMatrixData()           { return _S.abcMatrixData; },
  get globalJoursOuvres()       { return _S.globalJoursOuvres; },
  get benchLists()              { return _S.benchLists; },
  get benchFamEcarts()          { return _S.benchFamEcarts; },
  get ventesParMagasin()        { return _S.ventesParMagasin; },
  get storesIntersection()      { return _S.storesIntersection; },
  get selectedMyStore()         { return _S.selectedMyStore; },
  get selectedBenchBassin()     { return _S.selectedBenchBassin; },
  get territoireLines()         { return _S.territoireLines; },  // source brute totale
  get ventesClientArticle()     { return _S.ventesClientArticle; },
  get ventesClientHorsMagasin() { return _S.ventesClientHorsMagasin; },
  get chalandiseData()          { return _S.chalandiseData; },
  get chalandiseReady()         { return _S.chalandiseReady; },
  get canalAgence()             { return _S.canalAgence; },      // [CANAL-DÉRIVÉ]
  byCanal(canal) {
    if (typeof window.getKPIsByCanal === 'function') return window.getKPIsByCanal(canal);
    // fallback dégradé : filtre territoireLines seulement
    const _c = canal && canal !== 'ALL' ? canal : null;
    return {
      canal: _c || 'ALL',
      canalStats: _c ? (_S.canalAgence[_c] || {bl:0,ca:0,caP:0,caE:0}) : _S.canalAgence,
      totalCA: Object.values(_S.canalAgence).reduce((s,v) => s+(v.ca||0), 0),
      terrLines: _c ? _S.territoireLines.filter(l => l.canal === _c) : _S.territoireLines,
      finalData: _S.finalData,  // invariant — jamais filtré par canal
    };
  },
};
```

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
BUG PRÉREQUIS À CORRIGER AVANT TOUTE FEATURE V3
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

**byCanal(_canalGlobal).terrLines retourne [] en mode dégradé**

Cause racine :
- En mode dégradé (fichier territoire absent), `_S.territoireLines = []`
- `getKPIsByCanal(canal)` filtre `_S.territoireLines.filter(l => l.canal === _c)`
- Résultat : terrLines vide → toutes les vues filtrées par canal sont inutilisables
  sans fichier territoire
- `finalData` n'a pas de propriété `.canal` (invariant intentionnel), donc
  on ne peut pas construire terrLines depuis finalData

Options de fix :

**Option F1 — Canal-aware ventesParArticle (enrichissement consommé)**
Pendant le parsing consommé (boucle unique sur 200k lignes), construire :
```js
_S.articleCanalCA = new Map(); // code → Map(canal → {ca, bl, qteP})
```
→ permet à byCanal() de retourner des "pseudo-terrLines" depuis finalData
  enrichies des CA canal, même sans fichier territoire
→ coût mémoire : ~20k articles × 5 canaux × 3 champs = négligeable (~3 MB)
→ coût parsing : 0 (dans la boucle existante)
→ coût : sémantique différente de territoireLines (BL omnicanal vs consommé agence)

**Option F2 — Stub terrLines depuis canalAgence (pas de fix, workaround)**
byCanal() retourne canalStats riche + terrLines=[] explicitement marquées
→ les consommateurs vérifient `terrLines.length > 0` avant de rendre
→ fix minimal, ne résout pas les vues canal-territoire

**Option F3 — Enrich finalData avec canal dominant pendant parsing**
Pour chaque article code, accumuler Map(canal → {ca, count}) pendant parsing
puis au post-processing, assigner `row.canalDominant = max(ca)` sur finalData
→ approximation (canal majoritaire, pas exhaustif)
→ permet à byCanal() de filtrer finalData.filter(r => r.canalDominant === _c)
→ sémantique discutable : une même référence peut être vendue sur 3 canaux

Quelle option est correcte ? Laquelle implémenter en premier ?

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
4 FEATURES V3 À DÉBATTRE — ORDRE D'IMPLÉMENTATION OPTIMAL
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

**Feature A — Filtre Période Dynamique**

État actuel :
- `_S.periodFilterStart / periodFilterEnd` existent dans state.js mais sans UI
- `_S.consommePeriodMin / consommePeriodMax` = bornes réelles du fichier
- `globalJoursOuvres` est calculé une fois au parsing, utilisé par calcCouverture()
- Les BL dans le consommé ont une date (colonne "Date BL" ou "Date commande")
  mais elles ne sont pas conservées en mémoire après parsing

Problème :
- Re-filtrer sur une période nécessite soit de re-parser le fichier (File API),
  soit d'avoir conservé les dates BL par article en mémoire
- V et W (fréquence, semaines de présence) doivent être recalculés sur la
  sous-période → impact direct sur les MIN/MAX (règles métier critiques)
- Changer la période change `globalJoursOuvres` → calcCouverture() impactée

Questions :
- Faut-il stocker un résumé mensuel par article (code → mois → {V, W, CA})
  pendant le parsing pour permettre des filtres période sans re-parse ?
- Ou s'appuyer sur `_S.articleMonthlySales` existant (code → [12 mois qtés]) ?
- Quelles structures minimum sont nécessaires pour recalculer V, W, MIN/MAX
  sur une sous-période sans toucher le fichier source ?
- L'UI doit-elle exposer un date-range picker ou des presets (3M, 6M, 12M, YTD) ?

---

**Feature B — Vue Commerciale (Tableau de Bord par Commercial)**

État actuel :
- `_S.clientsByCommercial = Map<commercial, Set<clientCode>>` — déjà construit
- `_S.ventesClientArticle = Map<cc, Map<code, {sumPrelevee, sumCA, countBL}>>` — magasin only
- `_S.chalandiseData = Map<cc, {nom, metier, statut, commercial, secteur, ...}>`
- Aucune vue dédiée commercial dans l'UI actuelle

Feature demandée :
- Tableau de bord par commercial : CA généré, clients actifs vs perdus vs potentiels,
  top familles, taux de pénétration par métier
- Filtre commercial dans le Bench et le Diagnostic (niveau 4 clients métier)

Problèmes architecturaux :
- `clientsByCommercial` existe mais les ventes (ventesClientArticle) ne sont pas
  indexées par commercial → jointure nécessaire à la volée
- `ventesClientArticle` = canal MAGASIN uniquement, pas de vision hors-agence
  pour les clients du commercial
- Si on ajoute `_S.ventesParCommercial = Map<commercial, {ca, countClients, ...}>`,
  c'est une structure parallèle supplémentaire (dette de la dualité VCA/VCH)

Questions :
- Doit-on construire `ventesParCommercial` au parsing ou la dériver à la volée
  depuis ventesClientArticle × chalandiseData ?
- Comment intégrer la vue commerciale dans le Diagnostic Cascade niveau 4
  sans en faire un 5ème niveau ?
- La vue commerciale doit-elle être un onglet séparé ou un sous-filtre de la
  vue Chalandise existante ?

---

**Feature C — Filtre Canal Global (aboutissement des Étapes 1-5)**

État actuel après Étapes 1-5 :
- `getKPIsByCanal(canal)` exposé sur window — filtre territoireLines
- `_S._terrCanalCache` — cache htmlString par canal pour territoire
- `_S._benchCache` — cache benchmark indépendant du canal
- DataStore.byCanal() — point d'entrée pour consommateurs
- MAIS : uniquement Le Terrain est filtré par canal (terrLines)
  Les autres vues (Cockpit, Radar/ABC, Benchmark, Diagnostic) ignorent le canal global

Feature demandée :
- Un sélecteur canal global (chips MAGASIN | INTERNET | REPRESENTANT | DCS | Tous)
  qui impacte toutes les vues simultanément
- Cockpit : ruptures et alertes filtrées par canal
- Radar/ABC : matrice recalculée sur le canal sélectionné
- Benchmark : comparaison réseau sur CA canal sélectionné
- Diagnostic : KPIs niveau 1-2 sur le canal sélectionné

Contradiction architecturale :
- `finalData` est [CANAL-INVARIANT] par décision du premier débat
  (V et W calculés sur consommé agence entier, invariant canal)
- Mais le Cockpit affiche des ruptures basées sur finalData → comment filtrer
  le Cockpit par canal sans filtrer finalData ?
- Deux lectures possibles du "filtre canal global" :
  (a) Filtrer les KPIs de VENTES par canal (CA, fréquence) — faisable
  (b) Filtrer les ARTICLES eux-mêmes selon qu'ils ont été vendus sur ce canal
      → nécessite articleCanalCA ou canalDominant → voir bug prérequis

Questions :
- Quelle est la définition exacte du filtre canal global côté métier ?
  Filtre-t-il les articles ou seulement les métriques de ventes ?
- Peut-on implémenter une version partielle (Le Terrain + KPI canal) sans
  casser l'invariant finalData, et appeler ça V3.1 canal global ?
- Comment éviter que le filtre canal ne crée une 6ème couche de filtres
  en conflit avec : filtre secteur, filtre ABC/FMR, filtre famille,
  filtre commercial (Feature B), filtre période (Feature A) ?

---

**Feature D — Recommandations Saisonnières MIN/MAX**

État actuel :
- `_S.articleMonthlySales` : code → [12 qtés par mois] — déjà construit
- `_S.seasonalIndex` : famille → [12 coefficients 0.5–2.0] — déjà construit
- `nouveauMin / nouveauMax` dans finalData = MIN/MAX calculés sur la période
  globale (invariant)
- Règles métier critiques : écrêtage (dl = min(3×U,T)), W≤1→0/0, W=2→1/2,
  Nouveauté <35j garde ancien — NE PAS TOUCHER

Feature demandée :
- Afficher un `saisonMin / saisonMax` ajusté par le coefficient saisonnier
  du mois courant : `saisonMin = Math.ceil(nouveauMin × seasonalIndex[famille][moisCourant])`
- Widget "Préconisation du mois" dans le Cockpit : articles dont le stock
  est sous le saisonMin ce mois-ci (mais pas sous le nouveauMin annuel)
- Export CSV "Commande Saisonnière" : liste des articles à réapprovisionner
  pour le mois, avec qté recommandée

Problèmes :
- `seasonalIndex` est par FAMILLE, pas par article — approximation grossière
  pour des articles à saisonnalité propre (ex: antigel ≠ saisonnalité famille)
- `articleMonthlySales` donne les qtés historiques mais pas la variance
  → coefficients peu fiables si historique < 2 ans
- La feature crée un troisième jeu de MIN/MAX (ancienMin/Max + nouveauMin/Max
  + saisonMin/Max) → risque de confusion UI pour l'utilisateur

Questions :
- Doit-on calculer seasonalIndex par article (si ≥ N mois de données) ou
  rester au niveau famille pour éviter le bruit statistique ?
- Le saisonMin/Max doit-il être affiché dans la table principale (colonne
  supplémentaire) ou uniquement dans un widget cockpit dédié ?
- Comment exposer les recommandations saisonnières sans violer l'invariant
  "MIN/MAX = règles métier cristallisées dans engine.js" ?

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CONTRAINTES NON-NÉGOCIABLES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. Pas de backend — tout tourne dans le navigateur
2. Pas de localStorage (bloqué GAS)
3. Les 200k lignes brutes du consommé ne sont PAS conservées après parsing
4. Les règles MIN/MAX (écrêtage, W≤1/W=2/Nouveauté <35j) sont des invariants
   métier — ne jamais modifier engine.js sans validation métier
5. `finalData` reste [CANAL-INVARIANT] : W et V dépendent de l'agence, pas du canal
6. Zéro tests automatisés → Strangler Fig strict, jamais big-bang refactoring
7. Web Workers utilisés pour territoire et clients — postMessage est le seul
   canal de communication (pas de SharedArrayBuffer en GAS)
8. Chaque nouvelle structure `_S.xxx` DOIT être dans state.js ET dans resetAppState()

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
QUESTIONS DE DÉBAT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

**Round 1 — Prérequis : corriger byCanal en mode dégradé**
- Quelle option parmi F1/F2/F3 corriger en premier ?
- F1 (articleCanalCA Map) est-elle une dette ou une fondation nécessaire
  pour les features A, B, C, D ? Justifier avec les call-sites impactés.
- Y a-t-il une Option F4 qui résout le bug sans créer de nouvelle structure ?

**Round 2 — Ordre d'implémentation des 4 features**
- Proposer et défendre un ordre d'implémentation A→B→C→D (ou toute permutation)
- Quelles features ont des dépendances entre elles ?
  (ex: C (canal global) dépend-il du fix prérequis ? B dépend-il de C ?)
- Quelle feature apporte le plus de valeur métier pour le moins de risque architectural ?
- Y a-t-il des features qui NE DOIVENT PAS être implémentées en parallèle
  parce qu'elles modifient les mêmes structures ?

**Round 3 — Conflits d'architecture inter-features**
- Comment éviter que les 4 features ne créent 4 jeux de filtres orthogonaux
  incompatibles (canal × période × commercial × saisonnalité) ?
- Faut-il un `FilterContext` ou `_S._activeFilters = {}` centralisé pour
  orchestrer les filtres, ou chaque feature gère son propre état de filtre ?
- La Feature D (saisonnalité) peut-elle coexister avec la Feature A (période)
  sans contradiction ? (ex: filtre "6 derniers mois" + "saisonMin du mois courant")
- DataStore.byCanal() doit-il évoluer en DataStore.byContext({canal, periode, commercial}) ?

**Round 4 — Définition de "Done" pour chaque feature**
- Définir les critères de complétion minimaux pour chaque feature (MVP vs full)
- Identifier les régressions garanties si l'ordre recommandé n'est pas respecté
- Quel filet de validation manuel peut remplacer les tests automatisés absents ?
- Recommander explicitement ce qui NE doit PAS être implémenté en V3
  (features à reporter en V4 ou à ne jamais faire)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PARTICIPANTS ET PERSONAS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

- Architecte pragmatique : défend la stabilité de l'architecture Étapes 1-5,
  soulève les risques de régression sur finalData et les invariants métier.
  Prone le Strangler Fig strict et l'implémentation feature par feature.

- Ingénieur refactoring : pousse vers la réduction de la dette (dualité VCA/VCH,
  5 jeux de filtres divergents). Propose des abstractions réutilisables
  (FilterContext, articleCanalCA comme structure canonique, DataStore.byContext).

- Spécialiste performance front : argumente sur les coûts mémoire et latence
  de chaque structure additionnelle dans le navigateur (~100MB budgets GAS).
  Évalue la faisabilité des calculs à la volée vs cache par combinaison de filtres.
  Soulève le risque de 5 canaux × 52 semaines × 4 commerciaux = 1040 états cache.

- Gardien métier : s'assure que les règles MIN/MAX restent intactes, que la
  distinction MAGASIN/hors-MAGASIN (feature métier B2B Legallais) est préservée,
  et que les recommandations saisonnières ne se substituent pas aux MIN/MAX validés.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FORMAT DE SORTIE ATTENDU
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Durée : 4 rounds

Décision finale structurée en :
  (a) Fix prérequis retenu (F1/F2/F3/F4) avec justification et code sketch
  (b) Ordre d'implémentation des 4 features avec justification des dépendances
  (c) Structures à ajouter dans state.js + leur entrée dans resetAppState()
  (d) Structures à NE PAS créer (et pourquoi)
  (e) Critères de Done minimaux par feature
  (f) Risques identifiés et mitigations par feature
  (g) Ce qui est explicitement hors-périmètre V3
