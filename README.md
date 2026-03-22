# 🛩️ PILOT PRO

**Outil d'analyse et d'optimisation des stocks** pour magasins de distribution B2B.

Anciennement Optistock PRO (V22→V24). Fichier HTML unique, zéro dépendance serveur — fonctionne dans Google Apps Script ou en local dans un navigateur.

---

## 🎯 À quoi ça sert ?

PILOT PRO analyse les **ventes** (consommé 12 mois), l'**état du stock** (photo du jour) et optionnellement les **BL territoire** (omnicanal Qlik), la **Zone de Chalandise** (clients Qlik) pour :

- **Recalculer les MIN/MAX** de chaque article selon un algorithme éprouvé (écrêtage des commandes exceptionnelles + stock de sécurité 48h)
- **Identifier les actions prioritaires** : ruptures, fantômes, dormants, SASO, anomalies, fins de série
- **Analyser le territoire** : canaux de distribution, capte agence, articles absents du rayon
- **Benchmarker** les performances entre magasins d'un même bassin
- **Diagnostiquer par famille** en 4 niveaux adaptatifs : Stock → Calibrage → Gamme → Clients métier
- **Suivre l'évolution** mois par mois (export/import JSON historique)

## 🏗️ Architecture

```
PILOT PRO 1.0
├── index.html          ← Application complète (HTML + CSS + JS)
├── README.md           ← Ce fichier
├── CLAUDE.md           ← Contexte pour Claude Code
└── docs/
    └── DOCUMENTATION.md ← Documentation technique complète
```

**Stack :** HTML5 + Tailwind CSS (CDN) + SheetJS/XLSX (CDN) + Vanilla JS. Aucun build, aucun framework, aucun backend.

## 🚀 Utilisation

### En local
Ouvrir `index.html` dans un navigateur. Charger les 2 fichiers Excel (+ territoire optionnel), cliquer "Analyser".

### Dans Google Apps Script
1. Créer un projet Apps Script
2. Copier le contenu de `index.html` dans un fichier HTML
3. Ajouter un `doGet()` qui sert la page
4. Déployer en Web App

## 📊 Les onglets

| Onglet | Rôle |
|--------|------|
| 📋 **Articles** | Tableau complet filtrable, triable, exportable CSV |
| 📊 **Stock** | KPI → Évolution historique → Accès rapide → Attractivité → Ancienneté/Statuts/Familles |
| 🎯 **COCKPIT** | Résumé exécutif + Urgences (Ruptures + Anomalies) + Préconisation (SASO + Colis) |
| 📊 **ABC** | Matrice ABC/FMR 3×3 + guides "Par où commencer ?" et "Comment progresser ?" |
| 🔗 **Territoire** *(optionnel)* | Canaux agence + Vue Direction + Top 100 articles + filtre multi-select secteur |
| 🔄 **BENCH** | Comparaison multi-magasins |

## 🧮 Algorithme MIN/MAX

```
MIN = plus gros panier écrêté + 3 jours de sécurité (48h réappro + 1j marge)
MAX = MIN + 21 jours (forte rotation) ou 10 jours (faible rotation)
```

Voir `docs/DOCUMENTATION.md` pour le détail complet des règles de calcul.

## 📋 Changelog

### V2 Phase 2 (Mars 2026) — Diagnostic Cascade Adaptatif

**Diagnostic en 4 niveaux** — s'ouvre en overlay sombre, calcul lazy au clic, s'adapte aux fichiers disponibles :

- **Niveau 1 — Stock** (toujours) : ruptures confirmées par famille, CA perdu estimé, tableau détaillé cliquable
- **Niveau 2 — Calibrage MIN/MAX** (toujours) : détecte articles sans paramétrage ERP + sous-dimensionnements + écart fréquence vs agence référence (bench)
- **Niveau 3 — Profondeur de gamme** (Bench ou Territoire) : articles présents chez la référence ou dans le territoire mais absents de votre rayon
- **Niveau 4 — Clients métier** (Chalandise) : mapping automatique famille→métier, clients perdus à reconquérir, potentiel chiffré

**Déclencheurs** :
- 🔄 Bench : clic sur cellule rouge (< 50% médiane) dans Forces & Faiblesses
- 🎯 Cockpit : bouton 🔍 sur ruptures avec score priorité ≥ 5 000€
- 📊 ABC : boutons 🔍 sur familles CF (Rare valeur, Fréquent usage)
- 📦 Stock : boutons 🔍 dans le Top 10 Familles

**Plan d'action** : 1 à 3 actions générées automatiquement, classées par impact (⭐ immédiat → ⭐⭐⭐ moyen terme), chacune cliquable pour naviguer directement vers le bon onglet avec filtres pré-remplis. Export CSV.

### 1.0 (Mars 2026) — PILOT PRO
Première version sous le nom PILOT PRO. Récapitulatif de toutes les fonctionnalités héritées d'Optistock (V22→V24) :

**Moteur de calcul**
- Algorithme MIN/MAX avec écrêtage (`dl = min(3×U, T)` puis `dl = min(dl, U×5)`)
- Stock de sécurité 3 jours (SECURITY_DAYS)
- Cas spéciaux : W≤1 → 0/0, W=2 → 1/2, Nouveauté <35j → garde ancien
- Dédup BL (même commande + même article → quantité MAX)
- Avoirs et régularisations gérés (prélevé négatif → 0)
- Références père (3 dates vides) → exclues des ruptures
- Score de priorité composite (Fréq × PU × coeff ancienneté)
- Jours ouvrés calculés dynamiquement sur la période réelle du fichier

**Onglet Articles**
- Tableau 10k+ lignes avec pagination, tri, colonnes sticky
- Filtres globaux : famille, sous-famille, emplacement, statut, ancienneté, ABC, FMR
- Export CSV complet avec toutes les colonnes

**Onglet Stock**
- 6 KPI cards (Total, Stock mort, Surstock, CAPALIN, Taux de disponibilité, CA Perdu)
- Évolution historique vs dernière analyse (import/export JSON)
- 5 raccourcis Accès rapide (Sans emplacement, Dormants, Fins, Top 20, Nouveautés)
- Attractivité par Famille (% commandes contenant la famille)
- Tableaux ancienneté, statuts, top 10 familles

**Onglet Cockpit**
- Résumé exécutif automatique (ruptures, stock, service, C-Rare, territoire)
- Urgences : Ruptures avec CA perdu estimé + Score priorité, Anomalies
- Préconisation : SASO (CAPALIN à renvoyer), Colis à stocker (enlevé ≥5, prélevé 0)

**Onglet ABC**
- Matrice ABC/FMR 3×3 cliquable (AF=Pépites → CR=Déréférencement)
- ABC par valeur rotation (V×PU) : A=80%, B=15%, C=5%
- FMR par fréquence : F≥12, M=4-11, R≤3
- Guides "Par où commencer ?" et "Comment progresser ?"

**Onglet Territoire** *(optionnel, 3ème fichier BL omnicanal)*
- Répartition canaux agence (MAGASIN / INTERNET / DCS / REPRÉSENTANT)
- Vue par Direction commerciale avec drilldown familles
- Top 100 articles avec statut rayon (✅ En rayon / ⚠️ Rupture / ❌ Absent)
- Filtre multi-select par secteur/commercial avec checkboxes (M=Maintenance, B=Second Œuvre, L=DVP Plomberie, F=DVI Industrie)
- Articles spéciaux (code ≠ 6 chiffres) : exclus du calcul, comptés séparément (📌 X% du CA = spécial non stockable)
- % capté calculé sur CA hors spécial uniquement
- Top 50 clients avec type mixte/extérieur pur
- Web Worker pour parsing en arrière-plan (UI jamais bloquée)

**Onglet Benchmark**
- Comparaison multi-magasins (tout le bassin ou sélection)
- Articles manquées, sous-performance, sur-performance
- Forces & faiblesses par famille
- Classement des magasins

**UX / Performance**
- Single-page HTML (compatible iframe Apps Script)
- Tailwind CSS + Inter font
- Traitement par chunks avec `yieldToMain()` (UI fluide sur 10k+ articles)
- Toasts animés, loading overlay avec pipeline par fichier
- Tooltips contextuels, glossaire intégré

## 📝 Licence

Usage interne — Quincaillerie Legallais.
