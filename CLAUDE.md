# CLAUDE.md — Contexte PILOT PRO

## Qu'est-ce que ce projet ?
PILOT PRO (ex-Optistock PRO) est un outil d'analyse de stocks pour magasins de distribution B2B (Quincaillerie Legallais). C'est un fichier HTML unique qui tourne dans Google Apps Script ou en local, avec 2 fichiers Excel en entrée + 1 optionnel (Territoire).

## Architecture
- **Un seul fichier** : `index.html` contient tout (HTML + CSS + JS)
- **Pas de build**, pas de framework, pas de backend
- **Dépendances CDN** : Tailwind CSS, SheetJS (xlsx.full.min.js), Google Fonts (Inter)
- **Hébergement** : Google Apps Script (iframe) ou navigateur local

## Conventions de code
- JavaScript ES6+ strict mode (`'use strict'`)
- Fonctions nommées (pas de classes)
- Variables globales déclarées en haut du script
- Nommage : camelCase pour les fonctions/variables, UPPER_CASE pour les constantes
- Pas de TypeScript, pas de modules — tout est dans un seul `<script>`
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
  - `renderABCTab()` : onglet matrice 3×3 ABC/FMR cliquable + guides
  - `computeBenchmark()` / `renderBenchmark()` : module benchmark
  - `renderCanalAgence()` / `renderTerritoireTab()` / `exportTerritoireCSV()` : onglet Territoire
  - `renderTerrCroisementSummary()` : bloc résumé auto-détecté (VOLET 3)
  - `buildTerrContrib()` / `renderTerrContrib()` / `toggleContribSecteur()` / `renderContribClients()` / `toggleContribClient()` / `renderContribArticles()` / `exportContribCSV()` : drilldown contributeurs agence (VOLET 2bis)
  - `renderExecSummary()` : résumé exécutif (ruptures, stock, service, C-Rare, territoire couverture rayon)
  - `calcPriorityScore()` / `isParentRef()` : fonctions priorité
  - `renderComparison()` : comparaison historique

## Cockpit — structure
- **🔴 Urgences** : Ruptures + Anomalies (2 cartes)
- **📦 Préconisation de stock** : SASO + Colis à stocker (2 cartes)
- **Onglet Stock** : 6 KPI cards → Évolution historique → Accès rapide (5 shortcuts) → Attractivité par Famille → Ancienneté/Statuts/Familles
- `cockpitLists.{fantomes,dormants,fins,top20,nouveautes,colisrayon}` peuplés pour `showCockpitInTable()`

## Territoire — onglet optionnel
- **3ème fichier** : `fileTerritoire` — BL omnicanal exporté depuis Qlik
- **Articles spéciaux** : codes non standard exclus des vues Direction/Top 100/rayon. KPI `📌 X% du CA = spécial non stockable`
- **Statut rayon** : ✅ En rayon (stock > 0), ⚠️ Rupture (référencé, stock = 0), ❌ Absent (non référencé) — toujours avec texte (accessible daltoniens)
- **Filtre multi-select secteur** : checkboxes par code secteur avec direction (M=Maintenance, B=Second Œuvre, L=DVP Plomberie, F=DVI Industrie)
- **KPI : 5 cartes** : Lignes | CA Total (source unique) | Couverture rayon Top 100 | % Spécial | Clients — **JAMAIS de ratio entre 2 fichiers différents**
- **Vue Direction** : CA Territoire | Nb articles | ✅ En rayon | ⚠️ Rupture | ❌ Absent | % couverture (nb en rayon / nb total) — pas de CA croisé
- **Top 100** : Code | Libellé | Direction | BL | CA Territoire | Rayon (✅/⚠️/❌ + texte) | Stock actuel — pas de CA Magasin/Extérieur
- **Clients** : Code | Nom | CA Territoire | Nb réf | Type (✅ Mixte / ❌ Ext. pur) — pas de CA croisé
- **Résumé croisement** (VOLET 3) : bloc sombre auto-généré au-dessus des KPIs avec toutes les métriques auto-détectées
- **Contributeurs agence** (VOLET 2bis) : drilldown 3 niveaux — Secteurs (trié % agence asc = opportunités) → Clients → Articles. Lazy loading au clic. Export CSV Vue 1.
- **Résumé exécutif** cockpit, 5ème ligne : % couverture rayon Top 100 (source unique territoire, pas de CA croisé)

## Commandes utiles
```bash
# Ouvrir en local pour tester
open index.html

# Vérifier la syntaxe HTML
npx html-validate index.html
```

## Ce qu'il NE FAUT PAS faire
- Séparer le fichier en plusieurs fichiers (contrainte Apps Script iframe)
- Ajouter un bundler/build step
- Utiliser localStorage (bloqué dans l'iframe GAS)
- Modifier les règles de calcul MIN/MAX sans comprendre la doc technique
