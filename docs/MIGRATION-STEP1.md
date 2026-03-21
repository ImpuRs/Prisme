# ÉTAPE 1 — Migration constants.js + utils.js + state.js

## Contexte
On split index.html (4000 lignes) en modules JS. L'étape 1 extrait les constantes, utilitaires purs et variables globales dans 3 fichiers séparés. Voir `docs/ARCHITECTURE-SPLIT.md` pour la vision complète.

## Fichiers déjà créés
Les 3 fichiers sont prêts dans `js/` :
- `js/constants.js` — PAGE_SIZE, CHUNK_SIZE, METIERS_STRATEGIQUES, AGE_BRACKETS, FAM_LETTER_UNIVERS, SECTEUR_DIR_MAP
- `js/utils.js` — cleanCode, cleanPrice, extractClientCode, formatEuro, pct, parseExcelDate, daysBetween, getVal, getQuantityColumn, getCaColumn, extractStoreCode, readExcel, yieldToMain, parseCSVText, cleanOmniPrice, getAgeBracket, getAgeLabel, _median, _isMetierStrategique, _normalizeClassif, _classifShort, _normalizeStatut, fmtDate, getSecteurDirection
- `js/state.js` — toutes les variables `let` globales (finalData, filteredData, ventesParMagasin, chalandiseData, etc.)

## Ce que Claude Code doit faire dans index.html

### 1. Ajouter les imports de scripts
Juste AVANT le `<script>` principal existant (ligne ~744), ajouter :
```html
<script src="js/constants.js"></script>
<script src="js/utils.js"></script>
<script src="js/state.js"></script>
```

### 2. Supprimer les définitions extraites du `<script>` principal
Dans le bloc `<script>` (après `'use strict';`), SUPPRIMER les lignes suivantes qui sont maintenant dans les modules externes :

**Constants (maintenant dans constants.js) :**
- La ligne `const PAGE_SIZE=200,CHUNK_SIZE=5000,...`
- La ligne `const METIERS_STRATEGIQUES=[...]`
- La ligne `const AGE_BRACKETS={...}`
- La ligne `const FAM_LETTER_UNIVERS={...}`
- La ligne `const SECTEUR_DIR_MAP={...}` (vers ligne 1934) ET la fonction `getSecteurDirection` juste après

**Utils (maintenant dans utils.js) :**
- `function cleanCode(s){...}`
- `function extractClientCode(val){...}` ET `function cleanPrice(v){...}` (elles sont sur la même ligne 809)
- `function formatEuro(n){...}`
- `function pct(p,t){...}`
- `function parseExcelDate(v){...}`
- `function daysBetween(a,b){...}`
- `function getVal(r,...k){...}`
- `function getQuantityColumn(r,t){...}`
- `function getCaColumn(r,t){...}`
- `function extractStoreCode(row){...}`
- `function readExcel(f){...}`
- `function yieldToMain(){...}`
- `function getAgeBracket(d){...}`
- `function getAgeLabel(d){...}`
- `function _isMetierStrategique(metier){...}`
- `function _normalizeClassif(c){...}`
- `function _classifShort(c){...}`
- `function _normalizeStatut(s){...}`
- `function fmtDate(d){...}` (vers ligne 1354)
- `function _median(arr){...}` (vers ligne 2590)
- `function parseCSVText(text,sep){...}` (vers ligne 1793)
- `function cleanOmniPrice(v){...}` (vers ligne 1806 — attention, il y a un DOUBLON vers 1812 dans le worker, ne pas toucher celui du worker)

**State (maintenant dans state.js) :**
- Toutes les lignes `let ...` entre les lignes 756-804 (de `let finalData=[]...` jusqu'à `let _includePerdu24m=false`)
- La ligne `let kpiHistory=[]` (vers ligne 2914)
- Les lignes `let _diagLevels={};let _diagActions=[];let _diagPlanCopyText='';` et `let _diagMetierFilter='';let _diagCurrentFamille='';let _diagCurrentSource='';` (vers ligne 3211-3212)
- La ligne `let _overviewOpenL2=null,_overviewOpenL3=null;` (vers ligne 928)
- Garder les commentaires qui séparent les sections si tu veux, mais les `let` déclarations doivent être retirées

### 3. Attention : NE PAS supprimer
- La fonction `cleanOmniPrice` qui est DANS le web worker `_terrWorker` (vers ligne 1812) — c'est un scope séparé, elle doit rester là
- Les réassignations de variables (ex: `cockpitLists={...}` dans `processData()` ou `renderDashboardAndCockpit()`) — ce ne sont pas des déclarations, ce sont des resets
- Le `let territoireReady=false;` sur la ligne 775 — déjà dans state.js
- Les variables `let` locales à des fonctions

### 4. Test de validation
Après les modifications :
1. Ouvrir `index.html` dans le navigateur
2. Ouvrir la console — vérifier ZÉRO erreur
3. Charger les fichiers Consommé + Stock de Massy
4. Vérifier que le cockpit, le Radar, et les chiffres sont identiques
5. Tester le diagnostic d'une case Radar

### 5. CLAUDE.md
Mettre à jour la section Architecture pour refléter le split. Retirer la ligne "Ne pas séparer le fichier en plusieurs fichiers" et la remplacer par "Ne pas ajouter de bundler/build step — les modules JS sont chargés via <script src>".
