# CLAUDE.md — Contexte Optistock PRO

## Qu'est-ce que ce projet ?
Optistock PRO est un outil d'analyse de stocks pour magasins de distribution B2B (Quincaillerie Legallais). C'est un fichier HTML unique qui tourne dans Google Apps Script ou en local, avec 2 fichiers Excel en entrée.

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

## Règles métier critiques — NE PAS MODIFIER sans discussion
1. **Prélevé vs Enlevé** : seul le PRÉLEVÉ dimensionne les MIN/MAX. L'enlevé (colis) ne compte que pour la fréquence.
2. **Écrêtage** : `dl = min(3×U, T)` puis `dl = min(dl, U×5)` — protège contre les commandes industrielles exceptionnelles
3. **Stock de sécurité** : 3 jours (SECURITY_DAYS) = 48h réappro + 1j marge
4. **Cas spéciaux** : W≤1 → MIN/MAX=0, W=2 → MIN=1/MAX=2, Nouveauté <35j → garde ancien
5. **Références père** (V23) : si les 3 dates (dernière sortie, première entrée, dernière entrée) sont toutes vides → exclure des ruptures
6. **Avoirs** : qté négative → ignorée. Régularisations (prélevé net ≤ 0) → prélevé = 0
7. **Dédup BL** : même N° commande + même article → on garde la quantité MAX (pas d'addition)

## Tests
Pas de tests automatisés pour l'instant. Tester manuellement avec les fichiers Excel du magasin (Consommé + État du Stock).

## Structure du code (dans index.html)
- **Lignes 1-130** : HTML structure + CSS (V24 : styles `.abc-cell`)
- **Section `<script>`** :
  - Constantes et variables globales (dont `abcMatrixData` — V24)
  - Fonctions utilitaires (cleanCode, cleanPrice, parseExcelDate, etc.)
  - `processData()` : moteur principal, lit les 2 Excel, calcule tout
  - `computeABCFMR(data)` : calcul ABC (80/15/5% valeur rotation) + FMR (F≥12, M4-11, R≤3) — V24
  - `filterByAbcFmr(abc,fmr)` : clic cellule matrice → filtre Articles — V24
  - `renderAll()` / `renderTable()` / `renderDashboardAndCockpit()` : affichage
  - `renderABCTab()` : onglet matrice 3×3 ABC/FMR cliquable — V24
  - `computeBenchmark()` / `renderBenchmark()` : module benchmark
  - `renderVentesTab()` : onglet ventes
  - `renderExecSummary()` : résumé exécutif (V23 + ligne C-Rare V24 + CA Perdu V24.2)
  - `calcPriorityScore()` / `isParentRef()` : fonctions V23
  - `renderComparison()` : comparaison historique (V23 + caPerdu V24.2)

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
