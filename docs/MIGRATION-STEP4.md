# ÉTAPE 4 — Migration ui.js (fonctions UI transverses)

## Contexte
On extrait les fonctions UI transverses (toast, tabs, filtres, table pagination, export CSV). Pas les rendus spécifiques d'onglets — ceux-ci restent dans index.html pour l'instant.

## Fichier créé
`js/ui.js` (240 lignes) contient :

**Toast / Loading :**
`showToast`, `updateProgress`, `updatePipeline`, `showLoading`, `hideLoading`, `showTerritoireLoading`, `updateTerrProgress`

**Import zone :**
`onFileSelected`, `collapseImportZone`, `expandImportZone`

**Tab navigation :**
`switchTab`, `populateSelect`

**Filtres :**
`getFilteredData`, `renderAll`, `onFilterChange`, `debouncedRender`, `resetFilters`, `filterByAge`, `clearAgeFilter`, `updateActiveAgeIndicator`, `filterByAbcFmr`

**Cockpit filter :**
`showCockpitInTable`, `clearCockpitFilter`

**Period / Insights :**
`updatePeriodAlert`, `renderInsightsBanner`

**Table :**
`sortBy`, `changePage`

**KPI history :**
`clearSavedKPI`, `exportKPIhistory`, `importKPIhistory`

**CSV export :**
`downloadCSV`

**Note :** `renderTable()` reste dans index.html car il est gros (30 lignes) et contient le HTML template des lignes d'articles. Il sera extrait quand on fera cockpit.js.

## Ce que Claude Code doit faire

### 1. Ajouter le script
```html
<script src="js/constants.js"></script>
<script src="js/utils.js"></script>
<script src="js/state.js"></script>
<script src="js/engine.js"></script>
<script src="js/parser.js"></script>
<script src="js/ui.js"></script>
<script>
```

### 2. Supprimer les fonctions déplacées de index.html

**Vérifier d'abord les résidus parser (étape 3)** — exécuter :
```bash
grep -n "function parseChalandise\|function computeBenchmark\|function _terrWorker\b\|function launchTerritoireWorker\|function onChalandiseSelected\|function buildSecteurCheckboxes\|function toggleSecteurDropdown\|function toggleAllSecteurs\|function onSecteurChange\|function getSelectedSecteurs\|function parseTerritoireFile" index.html
```
Si des résultats apparaissent → ces fonctions sont des doublons, les supprimer (elles sont dans parser.js).

Également vérifier et supprimer si présent :
```bash
grep -n "const SECTEUR_DIR_MAP\|function getSecteurDirection\|function parseCSVText\|function cleanOmniPrice" index.html
```
**ATTENTION : ne PAS supprimer le `cleanOmniPrice` qui est DANS `_terrWorker` (scope isolé du worker) — seulement celui qui est en dehors.**

**Ensuite supprimer les fonctions ui.js :**
- `function showToast(message,type=...` (vers ligne ~751)
- `function updateProgress(c,t,txt,step){...}` (vers ligne ~807)
- `function updatePipeline(step,status){...}` (vers ligne ~809)
- `function showTerritoireLoading(show){...}` (vers ligne ~1268)
- `function updateTerrProgress(cur,total){...}` (vers ligne ~1301)
- `function onFileSelected(i,id){...}` (vers ligne ~1322)
- `function showLoading(t,s){...}` et `function hideLoading(){...}` (vers ligne ~1323-1324)
- `function collapseImportZone(nbFiles,...){...}` (vers ligne ~1325)
- `function expandImportZone(){...}` (vers ligne ~1330)
- `function switchTab(id){...}` (vers ligne ~1334, gros bloc ~4 lignes)
- `function populateSelect(id,vals){...}` (vers ligne ~1338)
- `function getFilteredData(){...}` (vers ligne ~1340, ~20 lignes)
- `function renderAll(){...}` (vers ligne ~1362, ~10 lignes)
- `function onFilterChange(){...}` (vers ligne ~1374)
- `function debouncedRender(){...}` (vers ligne ~1375)
- `function resetFilters(){...}` (vers ligne ~1376)
- `function filterByAge(b){...}` (vers ligne ~1377)
- `function clearAgeFilter(){...}` (vers ligne ~1378)
- `function updateActiveAgeIndicator(){...}` (vers ligne ~1379)
- `function showCockpitInTable(type){...}` (vers ligne ~1380, ~4 lignes)
- `function clearCockpitFilter(silent){...}` (vers ligne ~1384)
- `function filterByAbcFmr(abc,fmr){...}` (vers ligne ~1316)
- `function updatePeriodAlert(){...}` (vers ligne ~1272)
- `function renderInsightsBanner(){...}` (vers ligne ~1284)
- `function sortBy(c){...}` (vers ligne ~2878)
- `function changePage(d){...}` (vers ligne ~2879)
- `function clearSavedKPI(){...}` (vers ligne ~2713)
- `function exportKPIhistory(){...}` (vers ligne ~2714)
- `function importKPIhistory(input){...}` (vers ligne ~2715)
- `function downloadCSV(){...}` (vers ligne ~3766, gros bloc)

### 3. Grep de vérification APRÈS
```bash
grep -n "function showToast\|function updateProgress\b\|function updatePipeline\b\|function showLoading\b\|function hideLoading\b\|function switchTab\b\|function getFilteredData\b\|function renderAll\b\|function onFilterChange\b\|function downloadCSV\b\|function populateSelect\b\|function sortBy\b\|function changePage\b\|function renderInsightsBanner\b\|function updatePeriodAlert\b" index.html
```
Doit retourner ZÉRO résultat.

### 4. Test de validation
1. Console → ZÉRO erreur
2. Charger fichiers → toast de confirmation ✅
3. Filtres famille/statut/âge → articles filtrés ✅
4. Tri colonnes → fonctionne ✅
5. Pagination → fonctionne ✅
6. Export CSV → fichier téléchargé ✅
7. Changement d'onglet → pas d'erreur ✅
8. Bandeau d'alerte période → s'affiche si < 10 mois ✅

### 5. CLAUDE.md
Ajouter ui.js dans la table :
```
| ui.js | Fonctions UI transverses (toast, tabs, filtres, export) | constants, utils, state |
```
