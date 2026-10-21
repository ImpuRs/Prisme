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
                   computeClientCrossing, computeReconquestCohort,
                   computeOpportuniteNette, computeReseauHeatmap, computeOmniScores,
                   computeBenchMetier, computePriceGap, _clientPassesFilters
  parser.js      — pipeline données : parseChalandise, launchClientWorker, computeBenchmark
                   (Livraisons / Le Terrain Qlik retirés oct. 2026 : _S.ventesTerrain reste vide)
  cache.js       — persistance IndexedDB : _saveSessionToIDB, _restoreSessionFromIDB,
                   _saveExclusions, _restoreExclusions, _migrateIDB
  ui.js          — fonctions UI transverses : switchTab, renderAll, onFilterChange,
                   renderInsightsBanner, renderCockpitBriefing, renderDecisionQueue
  partie.js      — « La partie » (accueil) : score agence gamifié, computePartie,
                   renderPartieTab — score famille 4 critères squelette + Stock,
                   actions « +N pts », historique PRISME_PARTIE
  arbitrage.js   — Pilotage Stock › Arbitrage : détail du domaine Stock de La partie
                   (même score via computeStockPartie), valeur stock ventilée,
                   5 décisions chiffrées, sections emplacements / livraison / matrice
  plan-famille.js — Pilotage Stock › Plan › Par famille : familles notées comme La partie,
                   articles en 5 gestes (sortir, implanter, garder, surveiller, recalibrer) ;
                   « Pour creuser » = onglets Métiers/Analyse/Réseau de planRayon.js (bridge)
  planRayon.js   — computePlanStock (utilisé aussi par animation.js), vue Par métier,
                   onglets Métiers/Analyse/Réseau, Diagnostic + pack IA
  minmax.js      — MIN/MAX « taux de service » (minMaxService, applyMinMaxServiceLevel — le vrai calcul PRISME
                   depuis oct. 2026) sur _S.articleDemand (BL dédupliqués par jour, persisté). Le Banc d'essai qui
                   rejouait 12 mois pour valider la méthode a été retiré (oct. 2026).
  export-erp.js  — Arbitrage › « Mettre à jour l'ERP » : articles dont le MIN/MAX PRISME ≠ ERP (baisses, hausses,
                   passages à 0/0 en option), export CSV d'import ERP `ref;emplacement;min;max`
  emplacement.js — computePerfEmplacement (12MG), computeEnlevesSansRayon, rendu des 2 sections
  clients-decisions.js — Pilotage Commercial › Tes clients : score Clients (fidélité en CA :
                   CA comptoir des 6 mois précédents porté par des clients revenus sur les 6
                   derniers ; part de portefeuille en info), 5 décisions triées par enjeu
                   (relancer, reconquérir, développer, conquérir, rattacher ; silence tous canaux
                   via clientLastOrderAll) + « Pour creuser » (top clients, nouveaux/réactivés,
                   familles à proposer = opportuniteNette) ; computeClientsPartie alimente le 3e
                   domaine de La partie. Remplace l'onglet Fidélisation PDV (retiré oct. 2026 :
                   switchTab('clients') redirige ; renderMesClients n'est plus appelé)
  animation.js   — Animation › Action commerciale : « Préparer une animation » par marque (fournisseur
                   catalogue) : marques où une agence de ta taille fait mieux (médiane réseau ramenée à
                   ton CA, 12 mois tous canaux, _byMonthStoreArtCanal), rayon prêt (ruptures + trous réseau),
                   qui inviter (fidèles / sans la machine / à relancer / concurrence, export tournée)
                   (Associations, Duel agence, Banc d'essai retirés oct. 2026 — inutilisés)
  article-360.js — fiche article 360 (article de l'agence ; openArticlePanel y délègue, hors agence = kit d'implantation
                   de diagnostic.js) : verdict en une phrase, ventes 24 mois vs N-1, jauge stock ERP/PRISME + « Pourquoi ce
                   mini/maxi » (explainMinMax, minmax.js), ventes perdues (rupture seulement : ventes/jour en stock × jours depuis
                   la dernière sortie × saison, au prix de vente puis à la marge ; dateSortie/dateEntree gardées sur finalData),
                   clients, autres agences, co-achats
  diagnostic.js  — overlay diagnostic cascade adaptatif : openDiagnostic,
                   openClient360, renderDiagnosticPanel
  sources.js     — fichiers gardés (base IDB PRISME_SOURCES, non purgée) : mise à jour par fusion,
                   prepareSources() en tête de processData — consommé fusionné par (mois × agence),
                   24 mois glissants ; chalandise fusionnée client par client (absents gardés,
                   colonne « Dans le dernier export » = non → info._absentExport) ; stock remplacé
  main.js        — point d'entrée (~360 lignes depuis oct. 2026) : imports, mode mobile, exposition window.*
                   pour les onclick HTML, sélecteur agence, écouteurs, ACTION_REGISTRY
  periode.js     — filtre période global : sélecteur, applyPeriodFilter, _refilterFromByMonth
  rapport.js     — Reporting (bouton de la barre du haut) : rapport lisible sur dernier mois complet / 3 mois / 12 mois
                   vs même période N-1 (mois complets seulement) — CA tous canaux, marge, clients, canaux, rang réseau
                   (_byMonthStoreArtCanal, _byMonthClients), score La partie, stock, clients + relances notées, 3 actions ;
                   copier le texte, imprimer / PDF, copier pour une IA (consignes + mêmes chiffres, rien n'est envoyé)
  pipeline.js    — moteur de chargement : processData, worker de parsing, _hydrateStateFromParseResult,
                   _postParseMain (MIN/MAX taux de service, Vitesse Réseau), processDataFromRaw
  render-stock.js — rendus stock : renderDashboardAndCockpit, renderTable (Base articles), renderABCTab,
                   renderCurrentTab (aiguillage des onglets)
  suivi.js       — « Ton suivi » (La partie) : photo des articles à chaque chargement (PRISME_PARTIE,
                   'snap|<store>|<dataKey>', 24 max) et bilan vs le chargement précédent (MIN/MAX appliqués
                   dans l'ERP, ruptures F/M, valeur de stock, score) ; sauvegarde/restauration JSON de PRISME_PARTIE.
                   Bloc « Depuis le dernier chargement » en tête de La partie (renderSuiviHead) : nouvelles ruptures F/M,
                   clients entrés dans « Relancer » (photo `rel`, clientsARelancer sans filtre), MIN/MAX passés dans l'ERP
  contexte.js    — bandeau de contexte en tête d'écran (agence, date des ventes, fenêtre de calcul de
                   l'écran, filtres clients actifs retirables) + navigation clavier (éléments cliquables
                   focusables, Entrée/Espace) ; zones héritées habillées par la classe CSS .pt-legacy
  relances.js    — suivi des relances clients (Appelé / RDV pris / Sans suite + note, datés) : PRISME_PARTIE
                   'rel|<agence>' (survit aux purges, dans la sauvegarde JSON) ; bloc dans la fiche client,
                   colonne « Suivi » et colonnes à remplir dans les listes / CSV de Tes clients
  recherche.js   — recherche unique (barre du haut) : code/libellé article, code/nom client → fiche ;
                   « / » ou Ctrl+K pour y aller, ↑/↓ + Entrée
  scan-export.js — exports Scan mobile, rafraîchissement ZZAT018, import EAN (window.* seulement)
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
DataStore.ventesParAgence        // {store: {code: {sumPrelevee, sumCA, countBL}}}
DataStore.storesIntersection     // Set<storeCode> agences présentes dans les 2 fichiers
DataStore.selectedMyStore        // agence sélectionnée
DataStore.ventesTerrain        // lignes BL brutes — NE PAS filtrer ici
DataStore.ventesLocalMagPeriode   // Map<cc, Map<code, {sumPrelevee,sumCA,countBL}>> — MAGASIN only, period-filtered
DataStore.ventesLocalHorsMag     // Map<cc, Map<code, {sumCA,canal}>> — hors-MAGASIN
DataStore.chalandiseData         // Map<cc, {nom,commercial,metier,classification,ca2025,caPDVN,...}>
DataStore.chalandiseReady        // boolean
DataStore.benchLists             // {missed,over,storePerf,familyPerf,obsKpis,pepites,...}
```

### Point d'entrée multi-dimensions — byContext()
```js
const ctx = DataStore.byContext({ canal, periode, commercial });
// Lit par défaut : _S._globalCanal, _S._globalPeriodePreset, _S._selectedCommercial
// Retourne :
ctx.terrLines        // ventesTerrain filtré canal + commercial
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
_S.ventesLocalMagPeriode      // Map<cc, Map<code, {sumPrelevee,sumCAPrelevee,sumCA,sumCAAll,countBL}>>
                              // Source : canal MAGASIN, myStore uniquement — FILTRÉ par période
_S.ventesLocalMag12MG        // Map<cc, Map<code, {sumPrelevee,sumCAPrelevee,sumCA,sumCAAll,countBL}>>
                              // Même structure que ventesLocalMagPeriode mais PLEINE PÉRIODE (12MG)
                              // Dev: utiliser la façade `js/sales.js` (getVentesClientMagFull, getClientCAFullAllCanaux)
_S.ventesLocalHorsMag        // Map<cc, Map<code, {sumCA,sumPrelevee,sumCAPrelevee,countBL,canal}>>
                              // Source : tous canaux hors-MAGASIN
                              // ⚠ FILTRÉ PAR LA PÉRIODE AU PARSING, non recalculé si la période change
_S.ventesLocalHorsMagFull    // même structure, PLEINE PÉRIODE (oct. 2026) — analyses structurelles
                              // (fiche client, Plan, squelette, familles hors agence, opportunités…)
                              // Accès : sales.getVentesClientHorsMagFull(cc) / getVentesHorsMagFullMap()
_S.clientOmniScore           // Map<cc, {segment,score,caPDV,caHors,caTotal,nbCanaux,nbBL,silenceDays}>
                              // Score omnicanal enrichi avec ventesTerrain (Qlik)
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
_S.clientsByMetier           // Map<metier, Set<cc>> — inclut '__HORS_ZONE__' (consommé sans chalandise)
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

### Données réseau (multi-agences)
```js
_S.ventesParAgence           // {store: {code: {sumPrelevee, sumCA, countBL}}}
                              // Agrégat par agence — TOUS canaux (prélevé+enlevé)
_S.ventesReseauTousCanaux    // Map<cc, Map<code, {sumCA,countBL,...}>> — clients de TOUTES les agences confondues
                              // Ventes détaillées client×article, tout le réseau — TOUS canaux
                              // Source : consommé multi-agences, parse-worker
```

### Données territoire (Qlik — retiré oct. 2026, structures vides gardées pour rapport.js / DataStore)
```js
_S.ventesTerrain           // [{code, libelle, famille, direction, secteur, bl, ca,
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
- `computeClientCrossing()` — croisement chalandise × ventesLocalMagPeriode → crossingStats
- `computeReconquestCohort()` — anciens clients FID disparus
- `computeOpportuniteNette()` — familles manquantes par client vs métier moyen
- `computeReseauHeatmap()` — heatmap famille × agence (ratio vs médiane)
- `computeOmniScores()` — score omnicanal par client (PDV + hors-mag + ventesTerrain Qlik)
- `computeBenchMetier()` — lazy-cached médiane CA + tronc commun par segment métier (Jumeau Statistique)
- `computePriceGap(code)` — écart PU local vs Top 3 agences réseau (Alerte Prix)
- `_clientPassesFilters(info)` — filtre chalandise (dept, classif, métier, commercial...)
- `clientMatchesCommercialFilter(cc, info)` — filtre commercial spécifique

### parser.js
- `parseChalandise(file)` — CSV CP1252 ou Excel, peuple chalandiseData + clientsByCommercial
- `launchClientWorker()` — Web Worker agrégats clients → clientFamCA, metierFamBench
- `computeBenchmark()` — benchmark réseau multi-agences, peuple benchLists

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
| 3 — Gamme | Bench OU Territoire | ventesParAgence ou ventesTerrain |
| 4 — Clients métier | Chalandise | ventesLocalMagPeriode × chalandiseData |

---

## Règles métier critiques — NE PAS MODIFIER sans discussion

1. **Prélevé vs Enlevé** : seul le PRÉLEVÉ dimensionne les MIN/MAX. L'enlevé (colis) ne compte que pour la fréquence W.
2. **Écrêtage** : `dl = min(3×U, T)` puis `dl = min(dl, U×5)` — protège contre commandes exceptionnelles.
3. **Stock de sécurité** : `SECURITY_DAYS` par FMR (F=4, M=3, R=2) = 48h réappro + marge.
4. **Cas spéciaux** : W≤1 → MIN/MAX=0 ; W=2 → MIN=1/MAX=2 ; Nouveauté <35j → garde ancien MIN/MAX.
   **Depuis oct. 2026 (validé au banc d'essai, option B)** : le MIN/MAX PRISME est calculé par **taux de service**
   (`minMaxService`, minmax.js) sur les 12 derniers mois complets, après l'analyse et avant Vitesse Réseau / Bouclier :
   statut 2/3/4 → 0/0 ; ventes (BL) ≤ 1 → 0/0 ; = 2 → 1/2 ; sinon MIN = max(⌈d·L + z·σ·√L⌉, taille de commande au
   quantile visé, 1) avec d = demande/jour (corrigée SBA si intermittente), σ = écart-type journalier, L = 2 j,
   z selon service visé A 98 % / B 95 % / C 90 % ; MAX = MIN + 14 j de ventes. Ancien calcul gardé dans `r._minMaxAvant`.
   **Écrêtage (règle 2) conservé** : pour le calcul, chaque commande est plafonnée au plus grand de 3 × la commande
   médiane et de la 2e plus grosse commande (`_seriesCalc`) — seule une commande isolée est rabotée ; le banc d'essai
   rejoue, lui, les ventes réelles.
   AG22 (rejeu oct. 2025 → sept. 2026) : ERP 86,0 % / 92 k€ ; ancien PRISME 91,9 % / 225 k€ ; nouveau 91,0 % / 186 k€.
5. **Références père** : si les 3 dates toutes vides → exclure des ruptures (`isParentRef()`).
6. **Avoirs** : qté négative ignorée. Régularisations (prélevé net ≤ 0) → prélevé = 0.
7. **Dédup BL** : même N° commande + même article → quantité MAX (pas d'addition).
8. **Articles spéciaux** : code ≠ 6 chiffres exactement → non stockable, exclu du calcul MIN/MAX.
9. **Dualité PDV/hors-agence** : `ventesLocalMagPeriode` = MAGASIN only (period-filtered) ; `ventesLocalMag12MG` = MAGASIN only (pleine période 12MG) ; `ventesLocalHorsMag` = tout sauf MAGASIN, filtré période ; `ventesLocalHorsMagFull` = tout sauf MAGASIN, pleine période (structurel). Ne jamais mélanger.
10. **Reset colonne cache** : appeler `_resetColCache()` entre parsing consommé et stock (colonnes différentes).
11. **CA bug** : avoirs purs inclus dans sumCA total. Familles filtrées sur codes 6 chiffres.
12. **VMB** : Valeur de Marge Brute (€), pas Valeur Moyenne par BL. VMC = CA ÷ nb commandes uniques.
16. **caAnnuel (tableau Articles)** : `_enrichFinalDataWithCA()` utilise `ventesLocalMag12MG.sumCAPrelevee` — CA prélevé, pleine période 12MG, myStore. Cohérent avec PRÉL (qté prélevée, pleine période). NE PAS utiliser `ventesLocalMagPeriode` (period-filtered) ni `ventesParAgence` (tous canaux prélevé+enlevé).
17. **Profil canal client (ex-« score omnicanal », oct. 2026)** : `computeOmniScores()` (engine.js) classe chaque client en `comptoir` / `mixte` / `sansComptoir` / `ailleurs` (`OMNI_PROFILS`). CA comptoir et autres canaux sur 12 mois complets (`_byMonthClientCAByCanal`, repli `caClientParStore` + `ventesLocalMag12MG`), canaux = `clientLastOrderByCanal` sur 12 mois glissants, « ailleurs » = autres agences ≥ 30 % des achats réseau (`ventesClientAutresAgences`, ou lignes EXTÉRIEUR Qlik si chargé ; même fenêtre des deux côtés). Plus de score /100 (`score` = part comptoir, compat). NE PAS revenir à `ventesLocalHorsMag` : filtré par la période au parsing et non recalculé ensuite.
18. **Filtre "Sans métier renseigné"** : `clientMatchesMetierFilter(__NONE__)` matche métier vide OU ≤2 chars OU que des tirets/points. Aligné avec le bouton "Non classé" dans Associations.
13. **Règle d'Implantation — Vitesse Réseau (refaite le 20 oct. 2026)** : `_applyVitesseReseau()` (pipeline.js), après le calcul taux de service, pour les articles restés à 0/0 (hors père, code spécial, fin de série/stock/catalogue, statut 2/3/4, nouveauté). Mesure unique : n = ventes comptoir (prélevé) sur les 12 derniers mois complets. Chaque article porte `r._mmRule` :
    - n ≥ 1 → 1/1 (`vente_unique`, `r._venteUnique`) ;
    - n = 0 et **en rayon** (stock > 0) → 0/0 « à sortir » (`rayon_sans_vente`) — les ventes en colis partent de la centrale, elles ne justifient pas un rayon (ancien cas 712261 / 611276 : stock, 1 BL enlevé → rythme réseau 8/16) ;
    - n = 0, absent du rayon, **avec demande** (≥ 3 BL tous canaux sur 12 mois, `blCount12m` minmax.js, OU réseau fort ≥ 60 % des agences et ≥ 200 € CA/agence vendeuse) → implantation au rythme réseau `(CA Top 3 / PU) / nb BL Top 3` (repli médiane ERP, sinon 1/1), **plafonnée à la médiane ERP des autres agences** (`implant_colis` / `implant_reseau`, `r._vitesseReseau`, `r._implantColis`) ;
    - n = 0, absent, sans demande → 0/0 (`absent_sans_demande`).
    Le Bouclier (règle 20) passe ensuite, inchangé. La fiche article explique la règle appliquée (`_pourquoi`, article-360.js). Test AG22 : rythme réseau 594 → 4 articles, valeur MAX PRISME 187 753 → 147 463 €, score 85 → 86.
    **Exclusion invendus** (oct. 2026) : un article EN STOCK sans aucune vente locale (`isInvendu()` engine.js : W=0, stock>0, hors nouveauté/père) ne reçoit ni Vitesse Réseau ni médiane ERP — l'historique local nul prime.
22. **Lexique unique (oct. 2026)** : *client de l'agence* = « capté PDV » = achat dans l'agence, tous canaux, année en cours (`isClientAgence(cc)`, engine.js) — Conquête, fiche client, Tes clients › Conquérir ; *capté Legallais* = `isCapteLegallais` ; *sur-stock* = stock > MAX PRISME (`isSurStock`, plus le MAX ERP) — La partie, Arbitrage, liste « à dégonfler » ; *Disponibilité* (La partie, Arbitrage) = part des articles F/M en stock ≠ *taux de service* (banc d'essai, quantités servies). Statut de la fiche client aligné sur Tes clients : actif ≤ 60 j, à relancer 60-180 j, à reconquérir 180-365 j, perdu > 1 an (date des données). Gains « +N » de La partie = points du score agence (gain local × poids ÷ nb domaines) ; action Clients « faire revenir les 10 plus gros clients du semestre précédent ».
21. **Capté Legallais / capté PDV** (oct. 2026) : capté Legallais = achat dans l'année (« CA 2026 » chalandise > 0 OU achat consommé toutes agences depuis le 1er janvier) via `isCapteLegallais(cc, info)` ; capté PDV = achat dans l'agence sur l'ANNÉE EN COURS (`currentYearMonthRange()`, indépendant du sélecteur de période — Conquête ne suit plus la période). « Activité PDV Zone » recalculée depuis le consommé à date (Actif si achat agence cette année, sinon Inactif N ou N/N-1 ; original dans `_activitePDVChal`) : filtrer « Inactif PDV » donne 0 client agence. Le « Statut actuel général » Qlik ne décide plus actif/inactif (sauf Prospect). Le consommé à jour fait foi sur la chalandise : `ca2026` = max(CA 2026 chalandise d'origine `_ca2026Chal`, CA consommé de l'année toutes agences `getClientCAThisYearMap()`). Filtre distance strict (plus d'exception « a acheté ici »). Vérifié AG22 à 2 km contre les fichiers bruts : 125 clients (182 − 57 inactifs > 24 mois), 58 captés Legallais, 43 captés PDV, 15 à capter.
20. **Bouclier Squelette** (`applyVerdictOverrides`, engine.js) : un challenger (référencé, W=0) n'est « incontournable » (→ Réf Schizo) que si le réseau le vend vraiment : ≥60 % des autres agences ET ≥200 € de CA moyen par agence vendeuse (`SQ_RESEAU_FORT_*`, constants.js). Tous les challengers passent à MIN/MAX 0/0, Réf Schizo comprise (alerte gardée, pas de réappro) ; seule l'Ancre Métier (Trahison pardonnée, top 5/famille) garde 1/1. Même exigence « réseau fort » pour un article *à surveiller* étiqueté incontournable (Alerte Rouge → « Incontournable qui ralentit »), sauf incontournable local (ABC A + W≥12). Affichage : 16 verdicts internes → 9 libellés en clair (`verdictLabel()`, engine.js).
23. **Fin de vie (oct. 2026)** : `isFinDeVie(r)` (engine.js) = statut agence « 2 - Fin de stock » / « 3 - Fin de série » (ou texte fin de série/stock/catalogue) OU statut catalogue national (`_S.catalogueStatut`). Effets : MIN/MAX PRISME 0/0 posé en dernier (`applyFinDeVie()`, fin de `applyVerdictOverrides` + pipeline ; `r._finDeVie`, `r._mmRule='fin_de_vie'`) — ni Ancre Métier ni Vitesse Réseau ne les remontent ; hors disponibilité F/M et ruptures (La partie, cockpit, « Commander ») ; jamais « implanter » (squelette) ; export ERP type `fin`, toujours exporté à 0/0 ; décision Arbitrage « Liquider ou renvoyer » (liste cockpit `fins`) : encore vendu en 12 mois → écouler au comptoir, sinon renvoyer ; exclus de « Retourner » (invendus). Fiche article : verdict À liquider / À renvoyer. **Passages en fin de vie** (`trackFinDeVie`, suivi.js) : PRISME_PARTIE `fin|<agence>` = articles déjà connus en fin de vie + dernier lot de nouveaux (indépendant de la date du consommé : un ZZAT suffit) ; 1er passage = tout noté connu ; bloc en tête de La partie (`renderFinNewBlock` : à passer à 0/0 dans l'ERP + fichier, à liquider, à renvoyer) et liste cockpit `finsNew`, affichés jusqu'au lot suivant. « 4 - Promo » n'est PAS une fin de vie (mais minMaxService le met à 0/0 — à trancher).
14. **Références père (isParent)** : exclues de tous les calculs rupture, service, Plan Rayon. Détection actuelle = 3 dates vides (`isParentRef()`). Limitation connue : certains composés (ex: HARPE) ont des dates remplies et passent à travers → faux positifs possibles dans les verdicts.
15. **Filtre Fin de Vie** : un article ne peut PAS être classé "implanter" dans le squelette si (a) son statut ERP contient "fin de série"/"fin de stock", OU (b) TOUTES les agences réseau qui le vendent ont MIN/MAX = 0/0 dans `stockParMagasin` (= produit bloqué nationalement). Exception : s'il est physiquement en stock local, il reste visible (classé challenger/poids mort pour la purge).
19. **nbClientsPDV squelette — pleine période** : `computeSquelette()` utilise `_S.articleClientsFull` (Map<code, Set<cc>>, pleine période 12MG, hoisté hors filtre période) pour calculer `nbClientsPDV`. NE PAS utiliser `articleClients` (period-filtered) ni `clientsMagasin` (period-filtered). Même pattern que `ventesLocalMag12MG` pour `caAnnuel`.

---

## Onglets actuels (architecture V3)

| Onglet | Source principale | Description |
|---|---|---|
| La partie (accueil) | finalData + computeSquelette + _byMonth | Score agence /100 = moyenne Assortiment + Stock + Clients, actions « +N pts », familles notées, écart vs dernier chargement |
| Base articles | finalData | La base (hors Pilotage Stock) : tableau filtrable, MIN/MAX, dernière vente (consommé), export CSV ; bandeau de contexte quand on arrive filtré depuis une décision |
| Mon Stock | finalData | Dashboard KPIs, cockpit ruptures/dormants/saisonnalité |
| Cockpit | finalData + bench | Matrice ABC/FMR cliquable, decision queue, briefing |
| Radar | finalData + bench | Forces/faiblesses réseau, heatmap, pépites |
| Conquête Terrain (« Ton territoire ») | chalandise + consommé | 4 chiffres (zone, actifs Leg., clients agence, à capter) + tableau direction → métier → secteur → clients trié par « à capter » (actifs Leg. non clients agence, aggregateACapter) ; clic = liste + CSV |
| Animation | catalogue marques + consommé réseau | Préparer une animation (marque → rayon prêt → qui inviter) |
| Le Réseau | bench + territoire | Observatoire, heatmap réseau, nomades, orphelins |

---

## Croisements disponibles en mémoire (O(1), sans re-parsing)

Ces croisements sont **tous déjà possibles** avec les structures en mémoire :

```
ventesLocalMagPeriode × chalandiseData
  → CA PDV par client × classification × commercial × métier

ventesLocalHorsMag × chalandiseData
  → comportement omnicanal par client × zone géographique

articleCanalCA × finalData
  → quels articles sont achetés sur quel canal

clientsByCommercial × clientLastOrder × ventesLocalMagPeriode
  → portefeuille commercial : silencieux, actifs, CA

ventesTerrain × ventesLocalMagPeriode × chalandiseData
  → captation zone : qui achète ailleurs vs en agence

benchLists × finalData × chalandiseData
  → familles en retrait réseau × clients métier concernés

seasonalIndex × finalData × stockActuel
  → préconisation saisonnière : articles sous seuil ce mois

reseauHeatmapData × clientsByCommercial
  → performance commercial par famille vs réseau

crossingStats × ventesLocalHorsMag
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

### Contrôle avant mise en ligne
`controle.html` (racine) : ouvre l'appli en iframe, recharge les fichiers (`_testdata/` en local ou fichiers
choisis), passe sur les écrans + fiche client, fiche article, Plan famille, Animation marque,
relève les erreurs console et compare le score La partie à la référence (AG22 : 84 = 84 / 87 / 82).
À lancer après chaque modification. Même origine que l'appli : recharger les fichiers remplace la session.

### Conventions de code
- **Versions des modules** : une seule valeur `ASSET_V` dans `index.html` (import map générée en tête de page).
  La changer à chaque mise en ligne d'un fichier JS. Les `import` restent SANS `?v=` (sinon double instance
  du module). Nouveau fichier `js/*.js` → l'ajouter à la liste `F` de l'import map. Les Web Workers
  reprennent la version via `import.meta.url` de main.js.
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
- **Base `PRISME_PARTIE`** (séparée, v1, store `kv`) : historique des scores `hist|<store>` + actions cochées `done|<store>|<dataKey>` + photos de suivi `snaps|<store>` / `snap|<store>|<dataKey>`. Non touchée par « Purger le cache » ; sauvegarde/restauration en fichier JSON depuis « Ton suivi ».
  Séparée pour survivre aux purges de session ET pour ne pas monter la version de `PRISME` (scan.html ouvre `PRISME` en v2 sur la même origine — une montée de version casserait le Scan).
- **Base `PRISME_SOURCES`** (séparée, v1, store `kv`, sources.js) : copies gzip des derniers fichiers
  (`consomme`, `chalandise`, `stock`) + métadonnées. Non purgée ; « Oublier les fichiers gardés » sur l'écran de chargement.
  Les fichiers restitués gardent leur date (lastModified = mise à jour) → le contrôle « fichiers inchangés » reste valide.
- `periodFilterStart/End` persisté **uniquement en IDB** (pas localStorage)

**Variables persistées importantes** (à maintenir dans _saveSessionToIDB / _restoreSessionFromIDB) :
`finalData`, `ventesLocalMagPeriode`, `ventesLocalMag12MG`, `ventesLocalHorsMag`, `ventesLocalHorsMagFull`,
`caClientParStore`, `chalandiseData`, `clientsByCommercial`, `clientLastOrder`,
`clientNomLookup`, `canalAgence`, `articleCanalCA`, `articleClientsFull`, `seasonalIndex`,
`benchLists`, `coBL`/`coBLn` (co-achats fiche article : BL de 2 à 15 articles, 12 mois, agence), `storesIntersection`, `selectedMyStore`, `_selectedCommercial`,
`_selectedMetier`, `_globalCanal`, `periodFilterStart`, `periodFilterEnd`

### Règle de mutation `periodFilterStart/End`

| Qui écrit | Où | Quand |
|---|---|---|
| `resetAppState()` | state.js | Reset complet → `null` |
| `applyPeriodFilter(start,end)` | main.js | **Setter unique runtime** — refilter + render + save IDB |
| `_postParseMain()` | main.js | Init post-parse → 12 mois glissants complets (`defaultPeriodRange`, utils.js) si pas déjà set |
| `_initFromCache()` | main.js | Session à l'ancien défaut « mois en cours » < 15 j de données → `applyPeriodFilter(12 mois)` |
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

**Source obligatoire** : `ventesLocalMag12MG` (+ `articleClientsFull` pour nbClientsPDV).
NE JAMAIS utiliser `ventesLocalMagPeriode` dans un moteur de calcul structurel.

### Règle Commerce — filtre période actif
Cockpit commercial, relances, KPIs bandeau client, CA client sur période,
tableau "Clients PDV" → filtre période appliqué.
Ce sont des **décisions d'animation commerciale**, pas de structure de rayon.

**Source** : `ventesLocalMagPeriode` (period-filtered) — correct ici.

### Fonctions concernées (engine.js)
| Fonction | Source correcte | Raison |
|---|---|---|
| `computeArticleZoneIndex()` | `ventesLocalMag12MG` | PdM% assortiment |
| `computeSquelette()` | `ventesLocalMag12MG` / `articleClientsFull` | Classification structurelle |
| `computeAnglesMorts()` | via `clientFamCA` (Full) | Tronc commun métier |
| `computeOpportuniteNette()` | `ventesLocalMag12MG` | Familles manquantes |
| `computeOmniScores()` | `ventesLocalMag12MG` | Segmentation client |
| `computeReconquestCohort()` | `ventesLocalMag12MG` | Historique complet |
| `computeAnimation()` | `ventesLocalMag12MG` | Ciblage marque/conquête |
| `computeFamillesHors()` | `ventesLocalMag12MG` | Fuite par famille |
| `computeMonRayon()` | `ventesLocalMag12MG` | Clients par famille |
| `computePerfEmplacement()` (emplacement.js) | `ventesLocalMag12MG` / `articleClientsFull` | Garder / libérer un emplacement |

---

## Ce qu'il NE FAUT PAS faire

- Ajouter un bundler/build step
- Écrire via `DataStore` (lecture seule — mutations via `_S` uniquement)
- Utiliser `localStorage` directement (utiliser IndexedDB via cache.js)
- Modifier les règles de calcul MIN/MAX sans discussion
- Recalculer `finalData` au changement de canal (invariant canal)
- Appeler `getVal()` sans avoir appelé `_resetColCache()` entre consommé et stock
- Mélanger `ventesLocalMagPeriode` (MAGASIN) et `ventesLocalHorsMag` (hors-MAGASIN)
- Utiliser `ventesLocalMagPeriode` dans un moteur de calcul structurel (voir Doctrine temporelle) — utiliser `ventesLocalMag12MG`
- Utiliser `ventesLocalMagPeriode` pour caAnnuel (period-filtered) — utiliser `ventesLocalMag12MG`
- Utiliser `articleClients` ou `clientsMagasin` pour nbClientsPDV squelette (period-filtered) — utiliser `articleClientsFull`
- Utiliser `ventesParAgence.sumCA` pour caAnnuel (inclut enlevé tous canaux) — utiliser `ventesLocalMag12MG.sumCAPrelevee`
- Réintroduire une dépendance au fichier Livraisons / Terrain Qlik (retiré oct. 2026) — les achats ailleurs viennent du consommé multi-agences (`ventesClientAutresAgences`)
- Créer de nouvelles variables `_S.xxx` sans les ajouter dans `resetAppState()`
- Mettre du `await` sans `yieldToMain()` dans les boucles de parsing (bloque l'UI)
