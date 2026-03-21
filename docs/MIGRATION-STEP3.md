# ÉTAPE 3 — Migration parser.js

## Contexte
On extrait le pipeline de données (parsing fichiers + benchmark) dans `js/parser.js`. Cela inclut aussi le nettoyage des fonctions engine.js qui n'ont pas été supprimées à l'étape 2.

## Fichier créé
`js/parser.js` (348 lignes) contient :
- `parseChalandise(file)` — parsing 4ème fichier
- `onChalandiseSelected(input)` — handler fichier chalandise
- `parseTerritoireFile(f)` — parsing 3ème fichier
- `_terrWorker()` — Web Worker territoire
- `launchTerritoireWorker(rows, progressCb)` — lancement worker
- `buildSecteurCheckboxes(secteurs)` — UI secteurs
- `toggleSecteurDropdown()`, `toggleAllSecteurs(checked)`, `onSecteurChange()`, `getSelectedSecteurs()` — filtres secteurs
- `computeBenchmark()` — benchmark multi-agences complet

**Note :** `processData()` reste dans `index.html` pour cette étape — c'est l'orchestrateur principal avec beaucoup de couplage DOM. Il sera extrait dans une étape ultérieure.

## Ce que Claude Code doit faire

### 1. Ajouter le script dans index.html
Ajouter `<script src="js/parser.js"></script>` APRÈS engine.js :
```html
<script src="js/constants.js"></script>
<script src="js/utils.js"></script>
<script src="js/state.js"></script>
<script src="js/engine.js"></script>
<script src="js/parser.js"></script>
<script>
```

### 2. Supprimer les fonctions déplacées dans parser.js
Supprimer de `index.html` :

- `async function parseChalandise(file){...}` (vers ligne ~822, ~45 lignes)
- `function onChalandiseSelected(input){...}` (vers ligne ~868, 3 lignes)
- `async function parseTerritoireFile(f){...}` (vers ligne ~1748, ~28 lignes)
- Le `function parseCSVText(text,sep){...}` vers ligne ~1778 (10 lignes) — **ATTENTION : celui-ci est dans utils.js, vérifier qu'il n'y est pas déjà avant de supprimer. S'il y est déjà, simplement supprimer le doublon de index.html.**
- Le `function cleanOmniPrice(v){...}` vers ligne ~1791 (1 ligne, celui HORS du worker) — **même vérification : s'il est dans utils.js, supprimer le doublon.**
- `function _terrWorker(){...}` (vers ligne ~1795, ~65 lignes)
- `function launchTerritoireWorker(rows,progressCb){...}` (vers ligne ~1862, ~30 lignes)
- `function buildSecteurCheckboxes(secteurs){...}` (vers ligne ~1921)
- `function toggleSecteurDropdown(){...}` (vers ligne ~1935)
- `function toggleAllSecteurs(checked){...}` (vers ligne ~1939)
- `function onSecteurChange(){...}` (vers ligne ~1943)
- `function getSelectedSecteurs(){...}` (vers ligne ~1956)
- `function computeBenchmark(){...}` (vers ligne ~2576, ~92 lignes — gros bloc)

### 3. Supprimer le doublon SECTEUR_DIR_MAP + getSecteurDirection
Ces deux sont déjà dans constants.js et utils.js mais restent encore dans index.html (vers ligne ~1919-1920) :
```js
const SECTEUR_DIR_MAP={M:'Maintenance',B:'Second Œuvre',L:'DVP Plomberie',F:'DVI Industrie'};
function getSecteurDirection(code){...}
```
Les supprimer de index.html.

### 4. ⚠️ NETTOYAGE RÉSIDUS ÉTAPE 2
Les fonctions suivantes auraient dû être supprimées à l'étape 2 mais sont encore dans index.html. Les supprimer maintenant :

- `function _isPerdu(info){...}` (vers ligne ~951)
- `function calcCouverture(stock,V){...}` (vers ligne ~1385)
- `function calcPriorityScore(freq,pu,ageJours){...}` (vers ligne ~1426)
- `function prioClass(score){...}` et `function prioLabel(score){...}` (juste après)
- `function isParentRef(row){...}` (vers ligne ~1440)
- `function computeABCFMR(data){...}` (vers ligne ~1449)
- `function _radarComputeMatrix(data){...}` (vers ligne ~3115)
- `function _diagClientPrio(info,famCA){...}` (vers ligne ~3817)
- `function _diagClassifPrio(c){...}` et `function _diagClassifBadge(c){...}` (juste après)

Vérifier avec : `grep -n "function calcPriorityScore\|function isParentRef\|function computeABCFMR\|function _radarComputeMatrix\|function calcCouverture\|function _isPerdu\b\|function _diagClientPrio\|function prioClass\|function prioLabel\|function _diagClassifPrio\|function _diagClassifBadge\|function _isGlobalActif\|function _isPDVActif\|function _isProspect\|function _isPerdu24plus\|function computeClientCrossing\|function _crossBadge\|function _passesClientCrossFilter\|function clientMatchesDeptFilter\|function clientMatchesClassifFilter\|function clientMatchesStatutFilter\|function clientMatchesActivitePDVFilter\|function clientMatchesCommercialFilter\|function clientMatchesMetierFilter\|function _clientPassesFilters\|function formatCouv\|function couvColor" index.html`

Toutes ces fonctions doivent disparaître de index.html (elles sont dans engine.js).

### 5. Garder le listener click sur secteur dropdown
Le listener `document.addEventListener('click',function(e){...})` (vers ligne ~1964) pour fermer le dropdown secteur quand on clique ailleurs — il doit rester dans index.html (c'est du DOM event binding).

### 6. NE PAS supprimer
- `processData()` — reste dans index.html pour l'instant
- `renderCanalAgence()` — c'est du rendu, pas du parsing
- Le bloc `enrichPrixUnitaire()` dans processData — c'est un appel, pas une déclaration

### 7. Test de validation
1. Ouvrir `index.html` → console → ZÉRO erreur
2. Charger Consommé + Stock → tout l'analyse doit fonctionner
3. Charger fichier Territoire → le worker doit tourner, onglet Territoire doit apparaître
4. Charger fichier Chalandise → toast de confirmation, onglet Territoire avec données clients
5. Tester benchmark (onglet Observatoire) avec des données multi-agences
6. Filtres secteur dans Territoire doivent fonctionner

### 8. CLAUDE.md
Ajouter parser.js dans la table des modules :
```
| parser.js | Pipeline données (parsing, benchmark) | constants, utils, state, engine |
```
