# 📦 Optistock PRO

**Outil d'analyse et d'optimisation des stocks** pour magasins de distribution B2B.

Fichier HTML unique, zéro dépendance serveur — fonctionne dans Google Apps Script ou en local dans un navigateur.

---

## 🎯 À quoi ça sert ?

Optistock analyse les **ventes** (consommé 12 mois) et l'**état du stock** (photo du jour) pour :

- **Recalculer les MIN/MAX** de chaque article selon un algorithme éprouvé (écrêtage des commandes exceptionnelles + stock de sécurité 48h)
- **Identifier les actions prioritaires** : ruptures, fantômes, dormants, SASO, anomalies, fins de série
- **Benchmarker** les performances entre magasins d'un même bassin
- **Suivre l'évolution** mois par mois (export/import JSON historique)

## 🏗️ Architecture

```
Optistock PRO V24
├── index.html          ← Application complète (HTML + CSS + JS)
├── README.md           ← Ce fichier
├── CLAUDE.md           ← Contexte pour Claude Code
└── docs/
    └── DOCUMENTATION.md ← Documentation technique complète
```

**Stack :** HTML5 + Tailwind CSS (CDN) + SheetJS/XLSX (CDN) + Vanilla JS. Aucun build, aucun framework, aucun backend.

## 🚀 Utilisation

### En local
Ouvrir `index.html` dans un navigateur. Charger les 2 fichiers Excel, cliquer "Analyser".

### Dans Google Apps Script
1. Créer un projet Apps Script
2. Copier le contenu de `index.html` dans un fichier HTML
3. Ajouter un `doGet()` qui sert la page
4. Déployer en Web App

## 📊 Les 6 onglets

| Onglet | Rôle |
|--------|------|
| 📋 **Articles** | Tableau complet filtrable, triable, exportable CSV |
| 📊 **Santé** | KPI globaux + comparaison historique |
| 🎯 **COCKPIT** | Actions prioritaires classées par urgence avec résumé exécutif |
| 🧲 **Ventes** | Attractivité par famille, cross-sell |
| 📊 **ABC** | Matrice ABC/FMR 3×3 — segmentation analytique (V24) |
| 🔄 **BENCH** | Comparaison multi-magasins |

## 🧮 Algorithme MIN/MAX

```
MIN = plus gros panier écrêté + 3 jours de sécurité (48h réappro + 1j marge)
MAX = MIN + 21 jours (forte rotation) ou 10 jours (faible rotation)
```

Voir `docs/DOCUMENTATION.md` pour le détail complet des règles de calcul.

## 📋 Changelog

### V24.2 (Mars 2026)
- 💸 **KPI "CA Perdu"** dans l'onglet Santé (6ème carte, gradient rose) : estimation du CA perdu sur les ruptures actives
- 📐 **Formule** : `conso/j × min(joursRupture, 90) × PU` — plafond 90j pour éviter de surestimer les ruptures structurelles
- 📋 **Cockpit Ruptures** : colonne "CA perdu est." + durée de rupture affichée + ligne de total en pied de tableau
- ⚡ **Résumé exécutif** : ligne 1 reformulée avec le double KPI (CA perdu estimé + CA potentiel annuel)
- 📈 **Comparaison historique** : 7ème carte "💸 CA Perdu" (vert si amélioration)
- 📥 **CSV** : colonne `CAPerdu` ajoutée (0 pour les articles hors rupture)

### V24 (Mars 2026)
- 📊 **Matrice ABC/FMR** — nouvel onglet avec grille 3×3 cliquable (AF=Pépites → CR=Déréférencement)
- 🎯 **Calcul ABC** : classement Pareto valeur rotation (V×PU) → A=top 80%, B=15%, C=5%
- 🔢 **Calcul FMR** : fréquence W → F≥12 (Fréquent), M=4-11 (Moyen), R≤3 (Rare)
- 🔗 **Filtres ABC et FMR** dans la barre de filtres globaux
- 📋 **Colonnes ABC + FMR** dans l'onglet Articles et dans le CSV exporté
- ⚡ **Résumé exécutif** : 4ème ligne "X% du stock en C-Rare → candidat déréférencement"
- 🖱️ Clic sur une cellule de la matrice → filtre automatique l'onglet Articles

### V23 (Juillet 2025)
- ⚡ **Résumé exécutif** automatique en haut du cockpit (3 phrases d'impact)
- 📊 **Ruptures triées par CA potentiel perdu** (Fréq × PU) au lieu de la fréquence seule
- 🎯 **Score de priorité composite** (Fréq × PU × coeff ancienneté) avec barres visuelles
- 🚫 **Filtre références père** : articles sans aucune date de mouvement exclus des ruptures
- 🧹 Suppression des badges conditionnement (C24/B100) dans le cockpit

### V22 (Juillet 2025)
- Toasts animés (remplacement des alert())
- Détection conditionnements (C24, B10, LOT, PACK)
- Fix ancienneté 365j, colonnes sticky, validation en-têtes
- Benchmark forces/faiblesses par famille

## 📝 Licence

Usage interne — Quincaillerie Legallais.
