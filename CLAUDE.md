# CLAUDE.md — Contexte PRISME V3
> Dernière mise à jour : avril 2026 — reflète l'état réel du codebase ESM natif

---

## Qu'est-ce que PRISME ?

PRISME est un outil d'analyse BI offline pour chef d'agence B2B (distribution quincaillerie Legallais).
Il tourne entièrement dans le navigateur — zéro serveur, zéro cloud, zéro build step.
Tagline : **"Voir juste, piloter vite."**

Déployé sur GitHub Pages : `impurs.github.io/Prisme/`
Repo : `github.com/ImpuRs/Prisme`

---

## Architecture générale

### Fichiers d'entrée (chargés par l'utilisateur)
| Fichier | Obligatoire | Description |
|---|---|---|
| Consommé | ✅ | Ventes multi-canal multi-agences (MAGASIN, REPRESENTANT, INTERNET, DCS) |
| État du Stock | ✅ | Articles avec stock, MIN/MAX ERP, statuts, emplacements |
| Le Terrain | Optionnel | BL omnicanal réseau Qlik, ~250k lignes, multi-agences |
| Zone de Chalandise | Optionnel | Clients zone : classification, commercial, métier, CP, CA |

### Modules JS (ESM natif, `<script type="module">`)
```
js/
  constants.js   — PAGE_SIZE, CHUNK_SIZE, DORMANT_DAYS, SECURITY_DAYS,
                   METIERS_STRATEGIQUES, AGE_BRACKETS, FAM_LETTER_UNIVERS,
                   SECTEUR_DIR_MAP, RADAR_LABELS
  utils.js       — fonctions pures : cleanCode, formatEuro, parseExcelDate,
                   readExcel, yieldToMain, matchQuery, famLib, famLabel,
                   extractClientCode, _resetColCache
  state.js       — _S : objet mutable unique, source de vérité de tout l'état
  store.js       — DataStore : couche lecture seule sur _S avec byContext()
  engine.js      — moteur calcul métier : computeABCFMR, calcPriorityScore,
                   computeClientCrossing, computeReconquestCohort, computeSPC,
                   computeOpportuniteNette, computeReseauHeatmap, computeOmniScores,
                   computeBenchMetier, computePriceGap, _clientPassesFilters
  parser.js      — pipeline données : parseChalandise, parseTerritoireFile,
                   launchTerritoireWorker, launchClientWorker, launchReseauWorker,
                   computeBenchmark
  cache.js       — persistance IndexedDB : _saveSessionToIDB, _restoreSessionFromIDB,
                   _saveExclusions, _restoreExclusions, _migrateIDB
  ui.js          — fonctions UI transverses : switchTab, renderAll, onFilterChange,
                   renderInsightsBanner, renderCockpitBriefing, renderDecisionQueue
  promo.js       — onglet Promo : recherche article, mode action, export tournée CSV
  diagnostic.js  — overlay diagnostic cascade adaptatif : openDiagnostic,
                   openClient360, renderDiagnosticPanel
  router.js      — initRouter (hash routing minimal)
  main.js        — point d'entrée, orchestre tous les modules (~2800 lignes)
                   contient : processData, processDataFromRaw, _initFromCache,
                   renderDashboardAndCockpit, renderTerritoireTab, renderBenchmark,
                   _buildChalandiseOverview, _buildDegradedCockpit, _buildCockpitClient
index.html       — structure HTML + CSS (198 tokens CSS, thème dark/mixed)
```

**Pas de bundler, pas de npm, pas de framework.** CDN : Tailwind CSS, SheetJS.

---

## DataStore — couche d'accès centralisée (store.js)

`DataStore` est la couche lecture seule sur `_S`. **NE JAMAIS écrire via DataStore.**
Toutes les mutations passent par `_S.xxx = ...` directement.

### Getters [CANAL-INVARIANT] — ne changent PAS au filtre canal
```js
DataStore.finalData              // articles avec stock, MIN/MAX, ABC/FMR, saisonnalité
DataStore.filteredData           // finalData après filtres UI actifs
DataStore.abcMatrixData          // matrice ABC/FMR précalculée
DataStore.ventesParMagasin       // {store: {code: {sumPrelevee, sumCA, countBL}}}
DataStore.storesIntersection     // Set<storeCode> agences présentes dans les 2 fichiers
DataStore.selectedMyStore        // agence sélectionnée
DataStore.territoireLines        // lignes BL brutes — NE PAS filtrer ici
DataStore.ventesClientArticle    // Map<cc, Map<code, {sumPrelevee,sumCA,countBL}>> — MAGASIN only
DataStore.ventesClientHorsMagasin// Map<cc, Map<code, {sumCA,canal}>> — hors-MAGASIN
DataStore.chalandiseData         // Map<cc, {nom,commercial,metier,classification,ca2025,caPDVN,...}>
DataStore.chalandiseReady        // boolean
DataStore.benchLists             // {missed,over,storePerf,familyPerf,obsKpis,pepites,...}
```

### Point d'entrée multi-dimensions — byContext()
```js
const ctx = DataStore.byContext({ canal, periode, commercial });
// Lit par défaut : _S._globalCanal, _S._globalPeriodePreset, _S._selectedCommercial
// Retourne :
ctx.terrLines        // territoireLines filtré canal + commercial
ctx.activeFilters    // { canal, periode, commercial }
ctx.capabilities     // { hasTerritoire, hasArticleFacts, hasCommercial, hasPeriodeFilter }
ctx.periodeMonths    // indices mois actifs pour sparklines
```

**Règle d'or :** Toutes les fonctions de rendu qui ont besoin du filtre canal ou commercial
doivent appeler `DataStore.byContext()`, jamais lire `_S._globalCanal` directement.

---

## Structures de données clés dans `_S`

### Données articles
```js
_S.finalData[]               // {code, libelle, statut, famille, W, V, stockActuel,
                              //  prixUnitaire, nouveauMin, nouveauMax, ancienMin, ancienMax,
                              //  ageJours, isNouveaute, enleveTotal, couvertureJours,
                              //  isParent, abcClass, fmrClass, caAnnuel,
                              //  caWeb, caRep, caDcs, caHorsMagasin, nbClientsWeb,
                              //  medMinReseau, medMaxReseau}
_S.articleFamille            // {code → famCode}
_S.articleUnivers            // {code → univers}
_S.libelleLookup             // {code → libelle}
_S.seasonalIndex             // {famille → [12 coefficients saisonniers]}
                              // Blend local × réseau : wLocal = min(1, volumeLocal / 50)
                              // indexFinal = indexLocal × wLocal + indexRéseau × (1 - wLocal)
                              // Réseau = toutes agences du consommé, sans filtre profil
                              // Limite connue : réseau hétérogène peut diluer spécificité locale
                              // V2 prévue : filtre agences clones par scoring proximité (mix métier × CA × zone)
_S.seasonalIndexReseau       // {famille → [12 coefficients]} — toutes agences (stabilisateur)
_S.articleMonthlySales       // {code → [12 qtés mensuelles]}
_S.articleCanalCA            // Map<code, Map<canal, {ca, qteP, countBL}>>
```

### Données clients
```js
_S.ventesClientArticle       // Map<cc, Map<code, {sumPrelevee,sumCAPrelevee,sumCA,sumCAAll,countBL}>>
                              // Source : canal MAGASIN, myStore uniquement — FILTRÉ par période
_S.ventesClientMagFull   // Map<cc, Map<code, {sumPrelevee,sumCAPrelevee,sumCA,sumCAAll,countBL}>>
                              // Même structure que ventesClientArticle mais PLEINE PÉRIODE (12MG)
                              // Dev: utiliser la façade `js/sales.js` (getVentesClientMagFull, getClientCAFullAllCanaux)
_S.ventesClientHorsMagasin   // Map<cc, Map<code, {sumCA,sumPrelevee,sumCAPrelevee,countBL,canal}>>
                              // Source : tous canaux hors-MAGASIN
_S.clientOmniScore           // Map<cc, {segment,score,caPDV,caHors,caTotal,nbCanaux,nbBL,silenceDays}>
                              // Score omnicanal enrichi avec territoireLines (Qlik)
_S.clientLastOrder           // Map<cc, Date> — dernière commande PDV
_S.clientNomLookup           // {cc → nom}
_S.clientsMagasin            // Set<cc> — clients ayant acheté en MAGASIN sur la période
_S.clientsMagasinFreq        // Map<cc, nbBL> — fréquence MAGASIN par client
_S.clientArticles            // Map<cc, Set<code>> — articles achetés par client
_S.articleClients            // Map<code, Set<cc>> — clients ayant acheté cet article (period-filtered)
_S.articleClientsFull        // Map<code, Set<cc>> — pleine période 12MG, invariant UI (pour squelette)
```

### Données chalandise
```js
_S.chalandiseData            // Map<cc, {nom, commercial, metier, classification,
                              //          statut, activite, activiteGlobale, activitePDV,
                              //          secteur, cp, ville, ca2025, caPDVN, ca2026}>
_S.clientsByCommercial       // Map<commercial, Set<cc>>
_S.clientsByMetier           // Map<metier, Set<cc>>
_S.crossingStats             // {fideles: Set, potentiels: Set, captes: Set}
_S.opportuniteNette          // [{cc, nom, metier, commercial, missingFams, totalPotentiel}]
_S.reconquestCohort          // [{cc, nom, ...}] — anciens clients FID à reconquérir
```

### Données canal & omnicanalité
```js
_S.canalAgence               // {MAGASIN:{bl,ca,caP,caE}, INTERNET:{...}, REPRESENTANT:{...}, DCS:{...}}
_S.cannauxHorsMagasin        // Set<canal> — canaux détectés hors MAGASIN
_S.blCanalMap                // Map<bl, canal>
_S.caByArticleCanal          // Map<code, {INTERNET:ca, REPRESENTANT:ca, DCS:ca}>
_S.caClientParStore          // {store → Map<cc, totalCA>} — TOUS canaux, PLEINE PÉRIODE 12MG
                              // Accumulé AVANT filtre période dans parse-worker
                              // Usage : CA PDV tous canaux (commerce L4, duel agence)
```

### Données territoire & réseau
```js
_S.territoireLines           // [{code, libelle, famille, direction, secteur, bl, ca,
                              //   canal, clientCode, clientNom, clientType, rayonStatus,
                              //   isSpecial, commercial, dateExp}]
_S.terrContribBySecteur      // Map<secteur, {blTerr, blAgence, ca, clients}>
_S.terrContribByDirection    // Map<direction, {blTerr, blAgence, ca}>
_S.reseauNomades             // [cc] — clients actifs dans ≥2 agences
_S.nomadesMissedArts         // [{code, fam, nbClients, totalCaOther, totalBLOther}]
_S.reseauOrphelins           // [{code, fam, nbStores, totalFreq}]
_S.reseauFuitesMetier        // [{metier, total, actifs, indiceFuite%}]
_S.reseauHeatmapData         // {familles[], agences[], matrix{fam→{store→ratio}}}
```

### Filtres actifs UI
```js
_S._globalCanal              // '' | 'MAGASIN' | 'INTERNET' | 'REPRESENTANT' | 'DCS'
_S._globalPeriodePreset      // '12M' | '6M' | 'YTD'
_S._selectedCommercial       // '' | 'CODE - NOM' — filtre commercial terrain/cockpit
_S._selectedMetier           // '' | 'Plomberie' etc
_S._selectedDepts            // Set<dept> — filtre départements
_S._selectedClassifs         // Set<classif> — FID Pot+, OCC Pot+, etc
_S._selectedActivitesPDV     // Set<activite>
_S._filterStrategiqueOnly    // boolean
_S._includePerdu24m          // boolean
_S.periodFilterStart/End     // Date | null — filtre période global
_S.pdvCanalFilter            // 'all' | 'magasin' | 'preleve' — toggle Top clients PDV
```

---

## Modules JS — résumé des responsabilités

### engine.js
- `computeABCFMR(data)` — classification ABC (80/15/5%) × FMR (F≥12, M4-11, R≤3)
- `calcPriorityScore(W, prix, age)` — score rupture 0-100
- `computeClientCrossing()` — croisement chalandise × ventesClientArticle → crossingStats
- `computeReconquestCohort()` — anciens clients FID disparus
- `computeSPC(cc, info)` — Score Potentiel Client 0-100
- `computeOpportuniteNette()` — familles manquantes par client vs métier moyen
- `computeReseauHeatmap()` — heatmap famille × agence (ratio vs médiane)
- `computeOmniScores()` — score omnicanal par client (PDV + hors-mag + territoireLines Qlik)
- `computeBenchMetier()` — lazy-cached médiane CA + tronc commun par segment métier (Jumeau Statistique)
- `computePriceGap(code)` — écart PU local vs Top 3 agences réseau (Alerte Prix)
- `_clientPassesFilters(info)` — filtre chalandise (dept, classif, métier, commercial...)
- `clientMatchesCommercialFilter(cc, info)` — filtre commercial spécifique

### parser.js
- `parseChalandise(file)` — CSV CP1252 ou Excel, peuple chalandiseData + clientsByCommercial
- `parseTerritoireFile(file)` — lecture brute territoire (retourne raw data)
- `launchTerritoireWorker(raw, onProgress)` — Web Worker territoire → territoireLines
- `launchClientWorker()` — Web Worker agrégats clients → clientFamCA, metierFamBench
- `launchReseauWorker()` — Web Worker réseau → nomades, orphelins, fuites, heatmap
- `computeBenchmark()` — benchmark réseau multi-agences, peuple benchLists
- `buildSecteurCheckboxes()` / `getSelectedSecteurs()` — filtre multi-select secteurs

### cache.js
- `_saveSessionToIDB()` — sauvegarde complète session dans IndexedDB (base PRISME)
- `_restoreSessionFromIDB()` — restauration complète au démarrage
- `_saveExclusions()` / `_restoreExclusions()` — exclusions cockpit persistées séparément
- `_migrateIDB()` — migration transparente PILOT_PRO → PRISME
- `_clearIDB()` — purge complète base IndexedDB

### diagnostic.js
- `openDiagnostic(famille, source)` — overlay diagnostic cascade adaptatif
- `openDiagnosticMetier(metier)` — diagnostic depuis onglet Terrain
- `openClient360(cc, source)` — fiche client 360° avec onglets Ici/Livré MAG/Ailleurs/Omni
- `renderDiagnosticPanel(famille, source)` — construit les 4 niveaux adaptatifs
- `executeDiagAction(idx)` — exécute une action du plan
- `exportDiagnosticCSV(famille)` — export plan d'action

Niveaux du diagnostic :
| Niveau | Disponible | Source |
|---|---|---|
| 1 — Stock | Toujours | finalData |
| 2 — Calibrage MIN/MAX | Toujours | finalData + bench si dispo |
| 3 — Gamme | Bench OU Territoire | ventesParMagasin ou territoireLines |
| 4 — Clients métier | Chalandise | ventesClientArticle × chalandiseData |

---

## Règles métier critiques — NE PAS MODIFIER sans discussion

1. **Prélevé vs Enlevé** : seul le PRÉLEVÉ dimensionne les MIN/MAX. L'enlevé (colis) ne compte que pour la fréquence W.
2. **Écrêtage** : `dl = min(3×U, T)` puis `dl = min(dl, U×5)` — protège contre commandes exceptionnelles.
3. **Stock de sécurité** : `SECURITY_DAYS` par FMR (F=4, M=3, R=2) = 48h réappro + marge.
4. **Cas spéciaux** : W≤1 → MIN/MAX=0 ; W=2 → MIN=1/MAX=2 ; Nouveauté <35j → garde ancien MIN/MAX.
5. **Références père** : si les 3 dates toutes vides → exclure des ruptures (`isParentRef()`).
6. **Avoirs** : qté négative ignorée. Régularisations (prélevé net ≤ 0) → prélevé = 0.
7. **Dédup BL** : même N° commande + même article → quantité MAX (pas d'addition).
8. **Articles spéciaux** : code ≠ 6 chiffres exactement → non stockable, exclu du calcul MIN/MAX.
9. **Dualité PDV/hors-agence** : `ventesClientArticle` = MAGASIN only (period-filtered) ; `ventesClientMagFull` = MAGASIN only (pleine période 12MG) ; `ventesClientHorsMagasin` = tout sauf MAGASIN. Ne jamais mélanger.
10. **Reset colonne cache** : appeler `_resetColCache()` entre parsing consommé et stock (colonnes différentes).
11. **CA bug** : avoirs purs inclus dans sumCA total. Familles filtrées sur codes 6 chiffres.
12. **VMB** : Valeur de Marge Brute (€), pas Valeur Moyenne par BL. VMC = CA ÷ nb commandes uniques.
16. **caAnnuel (tableau Articles)** : `_enrichFinalDataWithCA()` utilise `ventesClientMagFull.sumCAPrelevee` — CA prélevé, pleine période 12MG, myStore. Cohérent avec PRÉL (qté prélevée, pleine période). NE PAS utiliser `ventesClientArticle` (period-filtered) ni `ventesParMagasin` (tous canaux prélevé+enlevé).
17. **Omni enrichi Qlik** : `computeOmniScores()` croise `ventesClientArticle` + `ventesClientHorsMagasin` + `territoireLines`. Un client avec des lignes EXTÉRIEUR dans Qlik ne peut PAS être "Pur Comptoir". Index `_terrByClient` construit en une passe pour la perf (250k lignes).
18. **Filtre "Sans métier renseigné"** : `clientMatchesMetierFilter(__NONE__)` matche métier vide OU ≤2 chars OU que des tirets/points. Aligné avec le bouton "Non classé" dans Associations.
13. **Règle d'Implantation — Vitesse Réseau** : appliquée **à la source** dans `processData()` (main.js) juste après le calcul MIN/MAX standard. Si PRISME local donne 0/0 ET l'article n'est pas fin de série ET au moins 1 agence réseau a un MIN/MAX > 0 (Filtre de la Mort) → calcul Vitesse : `(CA Top 3 agences / PU) / nb BL Top 3`. MIN = ceil(vitesse), MAX = ceil(vitesse × 2). Flag `r._vitesseReseau = true` posé sur `finalData` pour affichage "(Vitesse)" en violet dans l'UI. L'historique local reste prioritaire (si `nouveauMin > 0` déjà, pas d'override).
14. **Références père (isParent)** : exclues de tous les calculs rupture, service, Plan Rayon. Détection actuelle = 3 dates vides (`isParentRef()`). Limitation connue : certains composés (ex: HARPE) ont des dates remplies et passent à travers → faux positifs possibles dans les verdicts.
15. **Filtre Fin de Vie** : un article ne peut PAS être classé "implanter" dans le squelette si (a) son statut ERP contient "fin de série"/"fin de stock", OU (b) TOUTES les agences réseau qui le vendent ont MIN/MAX = 0/0 dans `stockParMagasin` (= produit bloqué nationalement). Exception : s'il est physiquement en stock local, il reste visible (classé challenger/poids mort pour la purge).
19. **nbClientsPDV squelette — pleine période** : `computeSquelette()` utilise `_S.articleClientsFull` (Map<code, Set<cc>>, pleine période 12MG, hoisté hors filtre période) pour calculer `nbClientsPDV`. NE PAS utiliser `articleClients` (period-filtered) ni `clientsMagasin` (period-filtered). Même pattern que `ventesClientMagFull` pour `caAnnuel`.

---

## Onglets actuels (architecture V3)

| Onglet | Source principale | Description |
|---|---|---|
| Articles | finalData | Tableau filtrable, MIN/MAX, ABC/FMR, export CSV |
| Mon Stock | finalData | Dashboard KPIs, cockpit ruptures/dormants/saisonnalité |
| Cockpit | finalData + bench | Matrice ABC/FMR cliquable, decision queue, briefing |
| Radar | finalData + bench | Forces/faiblesses réseau, heatmap, pépites |
| Le Terrain | Tous fichiers | Canal, chalandise, cockpit client, benchmark commercial |
| Le Réseau | bench + territoire | Observatoire, heatmap réseau, nomades, orphelins |
| Promo | consommé | Recherche article multi-agences, mode action, tournée |

---

## Croisements disponibles en mémoire (O(1), sans re-parsing)

Ces croisements sont **tous déjà possibles** avec les structures en mémoire :

```
ventesClientArticle × chalandiseData
  → CA PDV par client × classification × commercial × métier

ventesClientHorsMagasin × chalandiseData
  → comportement omnicanal par client × zone géographique

articleCanalCA × finalData
  → quels articles sont achetés sur quel canal

clientsByCommercial × clientLastOrder × ventesClientArticle
  → portefeuille commercial : silencieux, actifs, CA

territoireLines × ventesClientArticle × chalandiseData
  → captation zone : qui achète ailleurs vs en agence

benchLists × finalData × chalandiseData
  → familles en retrait réseau × clients métier concernés

seasonalIndex × finalData × stockActuel
  → préconisation saisonnière : articles sous seuil ce mois

reseauHeatmapData × clientsByCommercial
  → performance commercial par famille vs réseau

crossingStats × ventesClientHorsMagasin
  → fidèles hors zone avec comportement omnicanal
```

---

## Workflow de développement

```
Réflexion stratégique sur claude.ai
  → Débat Octopus multi-agents (/octo:debate)
  → Prompt exécutable Claude Code CLI
  → Push branche claude/<feature>-<hash>
  → Merge PR → GitHub Pages auto-deploy
```

### Conventions de code
- ESM natif strict mode (`'use strict'`)
- Pas de classes, fonctions nommées
- Mutations uniquement via `_S.xxx` — jamais via DataStore
- DOM manipulé via `innerHTML` pour les tableaux (performance 10k+ lignes)
- Traitement par chunks (`CHUNK_SIZE=5000`) avec `yieldToMain()` pour ne pas bloquer l'UI
- Territoire parsé en Web Worker — jamais bloquer l'UI
- `_S._terrCanalCache` : cache territoire invalidé uniquement au rechargement fichier
- `_S._benchCache` : cache benchmark, invariant canal
- Scroll fix : `switchTab` scrolle `mainContent`, pas `window`
- Navigation cockpit : pattern poll `offsetParent` pour scroll stable

### Nommage
- `_S.xxx` — variable d'état
- `_buildXxx()` — construction HTML inline (render)
- `renderXxx()` — rendu complet d'un onglet ou bloc
- `_onXxx()` — handler événement UI
- `computeXxx()` — calcul pur sans effet de bord sur le DOM
- `launchXxxWorker()` — lance un Web Worker en background

---

## Persistance IndexedDB

Base : `PRISME` (migrée depuis `PILOT_PRO`)
- Session complète sauvegardée après chaque `processData()` et après le territoire
- Restaurée au démarrage via `_initFromCache()` dans main.js
- Exclue si `_S.selectedMyStore` est vide (évite contamination)
- Exclusions cockpit sauvegardées séparément (pas de TTL)
- `periodFilterStart/End` persisté **uniquement en IDB** (pas localStorage)

**Variables persistées importantes** (à maintenir dans _saveSessionToIDB / _restoreSessionFromIDB) :
`finalData`, `ventesClientArticle`, `ventesClientMagFull`, `ventesClientHorsMagasin`,
`caClientParStore`, `chalandiseData`, `territoireLines`, `clientsByCommercial`, `clientLastOrder`,
`clientNomLookup`, `canalAgence`, `articleCanalCA`, `articleClientsFull`, `seasonalIndex`,
`benchLists`, `storesIntersection`, `selectedMyStore`, `_selectedCommercial`,
`_selectedMetier`, `_globalCanal`, `periodFilterStart`, `periodFilterEnd`

### Règle de mutation `periodFilterStart/End`

| Qui écrit | Où | Quand |
|---|---|---|
| `resetAppState()` | state.js | Reset complet → `null` |
| `applyPeriodFilter(start,end)` | main.js | **Setter unique runtime** — refilter + render + save IDB |
| `_postParseMain()` | main.js | Init post-parse → mois récent si pas déjà set |
| `_restoreSessionFromIDB()` | cache.js | Hydratation au démarrage |

**NE PAS écrire `_S.periodFilterStart/End` ailleurs.** Toute mutation user doit passer par `applyPeriodFilter()`.

---

## KPIs validés (AG22 Q1 2026, référence)

- CA PDV : 158 911 € (487 clients, tx marge 37.02%, panier 107 €)
- Valeur stock : 243 293 € (6 665 refs)
- CA Réseau AG93 : 69 997 € (tx marge 32.18%)

---

## Doctrine temporelle — Merchandising vs Commerce

### Règle Merchandising — immunité temporelle totale
Squelette, Physigamme, Tronc Commun, Associations, PdM%, Angles Morts, Facing,
MIN/MAX, ABC/FMR, OmniScores, Reconquête, Opportunités Nettes, Animation marque
→ **toujours 12MG pleine période**, filtre période ignoré.
Ce sont des **décisions d'assortiment**, pas de performance commerciale.

**Source obligatoire** : `ventesClientMagFull` (+ `articleClientsFull` pour nbClientsPDV).
NE JAMAIS utiliser `ventesClientArticle` dans un moteur de calcul structurel.

### Règle Commerce — filtre période actif
Cockpit commercial, relances, KPIs bandeau client, CA client sur période,
tableau "Clients PDV" → filtre période appliqué.
Ce sont des **décisions d'animation commerciale**, pas de structure de rayon.

**Source** : `ventesClientArticle` (period-filtered) — correct ici.

### Fonctions concernées (engine.js)
| Fonction | Source correcte | Raison |
|---|---|---|
| `computeArticleZoneIndex()` | `ventesClientMagFull` | PdM% assortiment |
| `computeSquelette()` | `ventesClientMagFull` / `articleClientsFull` | Classification structurelle |
| `computeAnglesMorts()` | via `clientFamCA` (Full) | Tronc commun métier |
| `computeOpportuniteNette()` | `ventesClientMagFull` | Familles manquantes |
| `computeOmniScores()` | `ventesClientMagFull` | Segmentation client |
| `computeReconquestCohort()` | `ventesClientMagFull` | Historique complet |
| `computeAnimation()` | `ventesClientMagFull` | Ciblage marque/conquête |
| `computeFamillesHors()` | `ventesClientMagFull` | Fuite par famille |
| `computeMonRayon()` | `ventesClientMagFull` | Clients par famille |

---

## Ce qu'il NE FAUT PAS faire

- Ajouter un bundler/build step
- Écrire via `DataStore` (lecture seule — mutations via `_S` uniquement)
- Utiliser `localStorage` directement (utiliser IndexedDB via cache.js)
- Modifier les règles de calcul MIN/MAX sans discussion
- Recalculer `finalData` au changement de canal (invariant canal)
- Appeler `getVal()` sans avoir appelé `_resetColCache()` entre consommé et stock
- Mélanger `ventesClientArticle` (MAGASIN) et `ventesClientHorsMagasin` (hors-MAGASIN)
- Utiliser `ventesClientArticle` dans un moteur de calcul structurel (voir Doctrine temporelle) — utiliser `ventesClientMagFull`
- Utiliser `ventesClientArticle` pour caAnnuel (period-filtered) — utiliser `ventesClientMagFull`
- Utiliser `articleClients` ou `clientsMagasin` pour nbClientsPDV squelette (period-filtered) — utiliser `articleClientsFull`
- Utiliser `ventesParMagasin.sumCA` pour caAnnuel (inclut enlevé tous canaux) — utiliser `ventesClientMagFull.sumCAPrelevee`
- Calculer l'omnicanalité sans `territoireLines` — le consommé local ne voit pas les ventes dans d'autres agences
- Créer de nouvelles variables `_S.xxx` sans les ajouter dans `resetAppState()`
- Mettre du `await` sans `yieldToMain()` dans les boucles de parsing (bloque l'UI)
