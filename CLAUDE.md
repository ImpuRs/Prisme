# CLAUDE.md — Contexte PRISME

## Qu'est-ce que ce projet ?
PRISME (ex-Optistock PRO) est un outil d'analyse de stocks pour magasins de distribution B2B (Quincaillerie Legallais). C'est un fichier HTML unique qui tourne dans Google Apps Script ou en local, avec 2 fichiers Excel en entrée + 2 optionnels (Le Terrain, Zone de Chalandise).

## Architecture
- **Point d'entrée** : `index.html` contient la structure HTML, le CSS et le `<script>` principal
- **Modules JS** (chargés via `<script src>` avant le script principal) :
  - `js/constants.js` — PAGE_SIZE, CHUNK_SIZE, METIERS_STRATEGIQUES, AGE_BRACKETS, FAM_LETTER_UNIVERS, SECTEUR_DIR_MAP
  - `js/utils.js` — fonctions utilitaires pures (cleanCode, cleanPrice, formatEuro, parseExcelDate, readExcel, etc.)
  - `js/state.js` — toutes les variables `let` globales (finalData, filteredData, chalandiseData, etc.)
  - `js/engine.js` — moteur de calcul métier (estimerCAPerdu, enrichPrixUnitaire, calcPriorityScore, computeABCFMR, calcCouverture, etc.) — dépend de constants, utils, state
  - `js/parser.js` — pipeline données : parsing fichiers (parseChalandise, parseTerritoireFile, _terrWorker, launchTerritoireWorker), filtres secteur, computeBenchmark — dépend de constants, utils, state, engine
  - `js/ui.js` — Fonctions UI transverses (toast, tabs, filtres, export) — dépend de constants, utils, state
- **Pas de bundler/build step** — les modules JS sont chargés via `<script src>`, pas de npm/webpack
- **Pas de framework**, pas de backend
- **Dépendances CDN** : Tailwind CSS, SheetJS (xlsx.full.min.js), Google Fonts (Inter)
- **Hébergement** : Google Apps Script (iframe) ou navigateur local

## Conventions de code
- JavaScript ES6+ strict mode (`'use strict'`)
- Fonctions nommées (pas de classes)
- Variables globales déclarées en haut du script
- Nommage : camelCase pour les fonctions/variables, UPPER_CASE pour les constantes
- Pas de TypeScript, pas de modules ES — les modules sont des fichiers JS classiques chargés via `<script src>`
- DOM manipulé via innerHTML pour les tableaux (performance sur 10k+ lignes)
- Traitement par chunks (CHUNK_SIZE=5000) avec `yieldToMain()` pour ne pas bloquer l'UI
- `globalJoursOuvres` (défaut 250) : calculé dynamiquement dans `processData()` et utilisé par `calcCouverture()` pour aligner la couverture sur la période réelle du fichier Consommé
- Territoire parsé dans un Web Worker (`_terrWorker()`) pour ne jamais bloquer l'UI

## Règles métier critiques — NE PAS MODIFIER sans discussion
1. **Prélevé vs Enlevé** : seul le PRÉLEVÉ dimensionne les MIN/MAX. L'enlevé (colis) ne compte que pour la fréquence.
2. **Écrêtage** : `dl = min(3×U, T)` puis `dl = min(dl, U×5)` — protège contre les commandes industrielles exceptionnelles
3. **Stock de sécurité** : 3 jours (SECURITY_DAYS) = 48h réappro + 1j marge
4. **Cas spéciaux** : W≤1 → MIN/MAX=0, W=2 → MIN=1/MAX=2, Nouveauté <35j → garde ancien
5. **Références père** : si les 3 dates (dernière sortie, première entrée, dernière entrée) sont toutes vides → exclure des ruptures
6. **Avoirs** : qté négative → ignorée. Régularisations (prélevé net ≤ 0) → prélevé = 0
7. **Dédup BL** : même N° commande + même article → on garde la quantité MAX (pas d'addition)
8. **Articles spéciaux** : code != 6 chiffres exactement (regex `/^\d{6}$/`) → non stockable, exclu du calcul principal territoire

## Tests
Pas de tests automatisés pour l'instant. Tester manuellement avec les fichiers Excel du magasin (Consommé + État du Stock + Territoire optionnel).

## Structure du code (dans index.html)
- **Lignes 1-~200** : HTML structure + CSS (`.abc-cell`, `.shortcut-card`, `.info-tip`, `.canal-bar`, `.terr-row`, `.rayon-green/yellow/red`, `.cap-bar`, `.contrib-row`, `.pct-bar-terr`)
- **Section `<script>`** :
  - Constantes et variables globales (dont `abcMatrixData`, `canalAgence`, `blConsommeSet`, `clientsMagasin`, `territoireLines`, `terrDirectionData`, `terrContribBySecteur`, `consommePeriodMin/Max/MoisCouverts`)
  - Fonctions utilitaires (cleanCode, cleanPrice, parseExcelDate, etc.)
  - `processData()` : moteur principal, lit les 2 Excel + 3ème optionnel (territoire) + détecte période consommé (VOLET 4)
  - `updatePeriodAlert()` : affiche bandeau orange sticky si consommé < 10 mois, sinon période dans navbar (VOLET 4)
  - `_terrWorker()` / `launchTerritoireWorker()` : Web Worker pour le parsing territoire en background
  - `buildSecteurCheckboxes()` / `toggleSecteurDropdown()` / `getSelectedSecteurs()` : filtre multi-select secteur
  - `computeABCFMR(data)` : calcul ABC (80/15/5% valeur rotation) + FMR (F≥12, M4-11, R≤3)
  - `filterByAbcFmr(abc,fmr)` : clic cellule matrice → filtre Articles
  - `renderAll()` / `renderTable()` / `renderDashboardAndCockpit()` : affichage
  - `renderABCTab()` : onglet Radar — matrice 3×3 ABC/FMR cliquable + filtres Famille/Emplacement + guides
  - `computeBenchmark()` / `renderBenchmark()` : module benchmark
  - `renderCanalAgence()` / `renderTerritoireTab()` / `exportTerritoireCSV()` : onglet Le Terrain
  - `renderTerrCroisementSummary()` : bloc résumé auto-détecté (VOLET 3)
  - `buildTerrContrib()` / `renderTerrContrib()` / `toggleContribSecteur()` / `renderContribClients()` / `toggleContribClient()` / `renderContribArticles()` / `exportContribCSV()` : drilldown contributeurs agence (VOLET 2bis)
  - `renderExecSummary()` : résumé exécutif (ruptures, stock, service, C-Rare, territoire couverture rayon)
  - `calcPriorityScore()` / `isParentRef()` : fonctions priorité
  - `renderComparison()` : comparaison historique
  - **V2 Phase 2 — Diagnostic Cascade** :
    - `openDiagnostic(famille, source)` / `closeDiagnostic()` : ouvre/ferme l'overlay
    - `renderDiagnosticPanel(famille, source)` : construit le panneau complet (header + 4 niveaux + plan)
    - `_diagLevel1(famille)` → stock, ruptures, CA perdu estimé
    - `_diagLevel2(famille, hasBench, refStore)` → calibrage MIN/MAX, sous-dimensionnement, sousPerf vs ref
    - `_diagLevel3(famille, hasBench, hasTerr, refStore)` → profondeur de gamme (bench ou territoire)
    - `_diagLevel4(famille, hasChal)` → clients métier, perdus, potentiel reconquête
    - `_diagGenActions()` / `_diagRenderPlan()` : plan d'action 1-3 actions cliquables
    - `executeDiagAction(idx)` : exécute l'action stockée dans `_diagActions[idx]`
    - `exportDiagnosticCSV(famille)` : export CSV plan d'action

## Cockpit — structure
- **🔴 Urgences** : Ruptures + Anomalies (2 cartes)
- **📦 Préconisation de stock** : SASO + Colis à stocker (2 cartes)
- **Onglet Stock** : 6 KPI cards → Évolution historique → Accès rapide (5 shortcuts) → Attractivité par Famille → Ancienneté/Statuts/Familles
- `cockpitLists.{fantomes,dormants,fins,top20,nouveautes,colisrayon}` peuplés pour `showCockpitInTable()`

## Zone de Chalandise — 4ème fichier optionnel (V2 Phase 1)
- **4ème fichier** : `fileChalandise` — export Qlik clients de la zone de chalandise
- **Parsing** : CSV (CP1252 ou UTF-8) ou Excel, colonnes matchées case-insensitive : Code client, Nom client, Libellé court métier, Statut actuel général, etc.
- **`chalandiseData`** : `Map<clientCode, {nom,metier,statut,classification,activite,secteur,commercial,cp,ville}>`
- **`chalandiseReady`** : booléen, true si fichier chargé et parsé avec succès
- **`chalandiseMetiers`** : liste triée des métiers distincts (pour le filtre du Bench)
- **`ventesClientArticle`** : `Map<clientCode, Map<articleCode, {sumPrelevee,countBL}>>` — peuplé pendant le parsing consommé pour le magasin sélectionné uniquement
- **`ventesClientsPerStore`** : `{store: Set<clientCode>}` — peuplé pour tous les magasins, pour la colonne "Clients zone" du classement bench
- **Résumé navbar** : `📋 Chalandise chargée` affiché en rose dans la navbar
- **Toast de confirmation** : `📋 Chalandise : X clients · Y métiers · Z actifs · W perdus`

## Benchmark V2 — Filtre Métier + Écart Médiane (V2 Phase 1)
- **Filtre métier** (`selectedBenchMetier`) : si renseigné et chalandise chargée, `computeBenchmark()` filtre `myV` depuis `ventesClientArticle` (clients du métier seulement)
- **Médiane** : `computeBenchmark()` calcule la médiane par famille (agrégeant par magasin, puis médiane sur les magasins du bassin) au lieu de la moyenne — via `_median(arr)`
- **Forces & Faiblesses** : colonnes Moi | Méd. | % méd. (coloré : ≥100% vert, 50–99% orange, <50% rouge)
- **Bandeau sous-performance** : `benchUnderperformBanner` affiche "⚠️ X familles en sous-performance vs bassin (< 50% médiane)"
- **Classement magasins** : colonnes Réf | Fréq | Serv. (taux de service = réf vendues / total articles bassin) | Clients zone (si chalandise, clients de la zone actifs dans ce magasin) | Perf

## Le Terrain — onglet optionnel
- **3ème fichier** : `fileTerritoire` — BL omnicanal exporté depuis Qlik
- **Articles spéciaux** : codes non standard exclus des vues Direction/Top 100/rayon. KPI `📌 X% du CA = spécial non stockable`
- **Statut rayon** : ✅ En rayon (stock > 0), ⚠️ Rupture (référencé, stock = 0), ❌ Absent (non référencé) — toujours avec texte (accessible daltoniens)
- **Filtre multi-select secteur** : checkboxes par code secteur avec direction (M=Maintenance, B=Second Œuvre, L=DVP Plomberie, F=DVI Industrie)
- **KPI : 5 cartes** : Lignes | CA Total (source unique) | Couverture rayon Top 100 | % Spécial | Clients — **JAMAIS de ratio entre 2 fichiers différents**
- **Vue Direction** : CA Le Terrain | Nb articles | ✅ En rayon | ⚠️ Rupture | ❌ Absent | % couverture (nb en rayon / nb total) — pas de CA croisé
- **Top 100** : Code | Libellé | Direction | BL | CA Le Terrain | Rayon (✅/⚠️/❌ + texte) | Stock actuel — pas de CA Magasin/Extérieur
- **Clients** : Code | Nom | CA Le Terrain | Nb réf | Type (✅ Mixte / ❌ Ext. pur) — pas de CA croisé
- **Résumé croisement** (VOLET 3) : bloc sombre auto-généré au-dessus des KPIs avec toutes les métriques auto-détectées
- **Contributeurs agence** (VOLET 2bis) : drilldown 3 niveaux — Secteurs (trié % agence asc = opportunités) → Clients → Articles. Lazy loading au clic. Export CSV Vue 1.
- **Résumé exécutif** cockpit, 5ème ligne : % couverture rayon Top 100 (source unique Le Terrain, pas de CA croisé)
- **`_toggleClientArticles`** : affiche 2 sections quand les 2 sources sont dispo — 🏪 Achats comptoir (ventesClientArticle) + 📦 Achats chez Legallais hors comptoir (territoireLines, tous canaux BL omnicanal)

## Diagnostic Cascade Adaptatif — V2 Phase 2

Le diagnostic s'ouvre en **overlay sombre** (`#diagnosticOverlay`) sur n'importe quel onglet. Il est déclenché depuis :
- **Bench** : clic sur une cellule rouge (< 50% médiane) dans Forces & Faiblesses
- **Cockpit** : bouton 🔍 sur les ruptures avec score priorité ≥ 5 000€
- **Radar (ex-ABC)** : bouton 🔍 Diag. sur chaque case de la matrice → diagnostic de TOUS les articles de la case, pas une seule famille. Bouton 🔍 sur les familles CF (section sous la matrice)
- **Stock** : bouton 🔍 dans le Top 10 Familles

**Principe d'adaptation** : chaque fichier chargé débloque un niveau. Les niveaux 1 et 2 sont toujours disponibles.

| Niveau | Disponible | Données utilisées |
|--------|-----------|-------------------|
| 1 — Stock | Toujours | `finalData` (ruptures, stock, CA perdu) |
| 2 — Calibrage MIN/MAX | Toujours | `finalData` (ancienMin vs nouveauMin) + bench si dispo |
| 3 — Gamme | Bench OU Territoire | `ventesParMagasin[refStore]` ou `territoireLines` |
| 4 — Clients métier | Chalandise | `ventesClientArticle` × `chalandiseData` |

**Variables globales ajoutées** : `_diagLevels` (résultats des 4 niveaux), `_diagActions` (plan d'action cliquable).

**CSS** : `.diag-level`, `.diag-badge`, `.diag-ok/warn/error/lock`, `.diag-action-row`, `.diag-btn` + overlay `#diagnosticOverlay` / `#diagnosticPanel`.

## Commandes utiles
```bash
# Ouvrir en local pour tester
open index.html

# Vérifier la syntaxe HTML
npx html-validate index.html
```

## Ce qu'il NE FAUT PAS faire
- Ajouter un bundler/build step — les modules JS sont chargés via `<script src>` directement
- Utiliser localStorage (bloqué dans l'iframe GAS)
- Modifier les règles de calcul MIN/MAX sans comprendre la doc technique
