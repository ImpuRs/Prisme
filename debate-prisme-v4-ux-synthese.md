# Synthèse Débat — PRISME V4 : Vision UX & Intelligence Prescriptive
**Date :** 2026-03-28 | **Rounds :** 6 × 4 agents | **Participants :** Gemini (Vendeur comptoir), Codex (Data engineer), Sonnet (Chef d'agence), Opus (Expert UX + Commercial terrain)

---

## VERDICT GLOBAL

**PRISME V4 est une évolution de rendu, pas une refonte des données.**
Toutes les structures existent. Tous les calculs tournent. Ce qui manque :
1. La Decision Queue comme surface principale — pas enfouie dans l'onglet 3
2. 4 nouveaux types DQ pour couvrir clients + canal + saisonnalité
3. Une barre de recherche NL qui remplace la navigation dans 80% des cas
4. Une architecture en 4 vues par intention (pas par source de données)

**Tagline confirmée :** *"Voir juste, piloter vite."*

---

## 1. Intentions validées (consensus ≥ 3 agents)

| N° | Question (langage terrain) | Agents | Structure principale |
|----|---------------------------|--------|---------------------|
| 1 | **"Que dois-je faire là, maintenant ?"** | Tous (×4) | `decisionQueueData` |
| 2 | **"Qui dois-je appeler cette semaine ?"** | Gemini, Sonnet, Opus | `reconquestCohort`, `clientLastOrder`, `opportuniteNette` |
| 3 | **"Quel client est en train de partir ?"** | Gemini, Sonnet, Opus | `clientLastOrder` × `chalandiseData.classification` |
| 4 | **"Où est-ce que je perds du CA vs le réseau ?"** | Codex, Sonnet, Opus | `benchLists.familyPerf`, `benchFamEcarts` |
| 5 | **"Mes ruptures me coûtent combien en ce moment ?"** | Gemini, Codex, Sonnet | `finalData` × `estimerCAPerdu()` |
| 6 | **"Mon stock dormant, c'est combien de cash immobilisé ?"** | Gemini, Codex, Opus | `finalData` (ageJours × stock × prix) |
| 7 | **"Qu'est-ce que mes clients achètent ailleurs ?"** | Sonnet, Opus | `ventesClientHorsMagasin`, `articleCanalCA` |

*Intention secondaire (3 agents) :* "Quels articles saisonniers dois-je commander avant la rupture ?" → `seasonalIndex` × `finalData`

---

## 2. Top 10 insights extraordinaires priorisés

| # | Insight | Impact ★ | Taille | Structures | Dépendance |
|---|---------|----------|--------|-----------|-----------|
| 1 | **Alerte churn saisonnier** : silence client filtré par `seasonalIndex` — distingue absence anormale vs basse saison | ★★★★★ | S | `clientLastOrder` × `seasonalIndex` × `chalandiseData` | + chalandise |
| 2 | **Fuite canal articles AF** : article A/F dont la part MAGASIN baisse mais CA total stable sur WEB/REP → bascule canal détectée | ★★★★★ | M | `articleCanalCA` × `finalData` × `ventesClientArticle` | obligatoire seul |
| 3 | **CA abandonné par commercial** : classement par potentiel non capté (pas par CA réalisé) | ★★★★★ | M | `clientsByCommercial` × `opportuniteNette` × `reseauFuitesMetier` | + chalandise |
| 4 | **Clients purement-représentant captables** : CA rep élevé, jamais venus au comptoir | ★★★★☆ | S | `ventesClientHorsMagasin` (REP) × `ventesClientArticle` (absent) | obligatoire seul |
| 5 | **Alerte saisonnière préventive à 6 semaines** : stock < MIN × coeff_futur → commander maintenant | ★★★★☆ | M | `seasonalIndex` × `finalData` | obligatoire seul |
| 6 | **Taux de captation par commercial** : clients PDV actifs / clients zone actifs — révèle le performeur caché | ★★★★☆ | M | `clientsByCommercial` × `clientLastOrder` × `chalandiseData` | + chalandise |
| 7 | **Stock Otage** : articles A dont les 2 seuls acheteurs sont dans `reconquestCohort` — top vente fragilisé | ★★★★☆ | S | `_fragiliteData` × `finalData` × `reconquestCohort` | + terrain |
| 8 | **Health Score agence 0-100** : synthèse stock + clients + réseau en 1 chiffre | ★★★★☆ | M | `decisionQueueData`, `reconquestCohort`, `benchLists.obsKpis`, `finalData` | obligatoire seul |
| 9 | **Opportunités nettes dans la DQ** : `opportuniteNette[]` calculé mais jamais injecté en Decision Queue | ★★★★☆ | S | `opportuniteNette` → `decisionQueueData` type `opportunite` | + chalandise |
| 10 | **Micro-churn métier** : client "actif" en dépannage mais CA = 0 sur familles maîtresses de son métier depuis 90j | ★★★★☆ | M | `ventesClientArticle` × `chalandiseData` × `opportuniteNette` | + chalandise |

---

## 3. Architecture V4 finale (consensus ≥ 3 agents)

```
[🎯 Ce matin] [👥 Mes clients] [🌐 Mon réseau] [📦 Mon stock]
              [🔍 Recherche NL — toujours visible]
```

| Vue | Nom | Top 3 éléments au chargement | Onglets absorbés |
|-----|-----|------------------------------|-----------------|
| **1** | **"Ce matin"** *(page d'accueil)* | Decision Queue triée par €perdu (5-9 cartes) · Health Score agence · Barre NL | Cockpit (DQ, résumé, urgences) |
| **2** | **"Mes clients"** | Top 5 clients à risque (SPC + silence) · Opportunités nettes · Cohorte reconquête | Le Terrain (Clients), Promo (mode client) |
| **3** | **"Mon réseau"** | Forces & Faiblesses + bouton Diag. · Classement agences · Heatmap réseau | Radar, Le Réseau |
| **4** | **"Mon stock"** | Matrice ABC/FMR cliquable · 3 KPIs + delta session · Alertes MIN/MAX calibrage | Articles, Mon Stock |
| *(5)* | *Recherche NL universelle* | `parseIntent()` + 15+ handlers · résultat polymorphe · Cmd+K | Promo (drill uniquement) |

**Règle migration (consensus unanime) :** les 7 onglets actuels ne disparaissent pas — ils deviennent des drills. On ajoute des vues, on ne supprime pas les routes. `router.js` conservé.

---

## 4. Top 20 requêtes langage naturel

| Rang | Requête | Intent | Structure _S | Format |
|------|---------|--------|-------------|--------|
| 1 | "clients silencieux depuis 45 jours plus de 3000 euros" | CLIENTS_SILENCIEUX | `clientLastOrder` × `ventesClientArticle` | Tableau cc, jours, CA |
| 2 | "qui dois-je appeler cette semaine" | RECONQUETE | `reconquestCohort` top 5 | Liste cliquable + CA |
| 3 | "top 10 clients web" | TOP_CLIENTS_CANAL | `ventesClientHorsMagasin` (WEB) | Liste : Nom / CA web / SPC |
| 4 | "clients plombier perdus depuis 6 mois" | CLIENTS_PERDUS | `clientsByMetier` × `clientLastOrder` | Liste + CA + commercial |
| 5 | "stock dormant valeur maximum" | STOCK_DORMANT | `finalData` (ageJours>365) | Tableau trié valeur |
| 6 | "familles où je suis sous la médiane réseau" | BENCH_SOUS_MEDIANE | `benchLists.familyPerf` | Tableau famille / % médiane |
| 7 | "clients avec plus de 5000 euros hors agence" | CLIENTS_HORS_AGENCE | `ventesClientHorsMagasin` agrégé | Tableau cc, CA hors, ratio |
| 8 | "clients uniquement représentant" | CANAL_EXCLUSIF | `ventesClientHorsMagasin` × `ventesClientArticle` | Liste |
| 9 | "articles dewalt achetés ailleurs pas chez moi" | ARTICLES_HORS_MARQUE | `runPromoSearch()` section B + filtre marque | Tableau article / CA ailleurs |
| 10 | "nouveau client ce mois" | NOUVEAUX_CLIENTS | `clientLastOrder` (première occurrence) | Liste + date + métier |
| 11 | "familles en rupture achetées par mes top clients" | RUPTURES_TOP_CLIENTS | `finalData` × `ventesClientArticle` | Tableau famille / clients / CA |
| 12 | "qui vend le mieux la plomberie dans mon réseau" | BENCH_FAMILLE_RESEAU | `benchLists.familyPerf` + `storePerf` | Classement magasins |
| 13 | "clients [commercial] qui n'ont pas commandé ce mois" | COMMERCIAL_SILENCE | `clientsByCommercial` (fuzzy) × `clientLastOrder` | Liste + badge silence |
| 14 | "articles sans MIN MAX avec ventes" | ANOMALIE_MINMAX | `finalData` (MIN=0 × V>0) | Tableau code / CA / stock |
| 15 | "clients qui achètent la plomberie en web" | METIER_CANAL | `ventesClientHorsMagasin` × `clientsByMetier` | Liste + CA web |
| 16 | "quel est mon taux de service" | KPI_TAUX_SERVICE | `benchLists.obsKpis.mine.serv` | KPI card unique |
| 17 | "commandes à passer aujourd'hui" | DQ_REASSORT | `decisionQueueData` (rupture + alerte_prev) | Cartes DQ + clipERP |
| 18 | "prospects > 5000 euros potentiel" | OPPORTUNITES | `opportuniteNette` (totalPotentiel) | Liste + familles manquantes |
| 19 | "clients disparus depuis 3 mois" | CHURN | `clientLastOrder` (>90j) + `chalandiseData` actif | Liste triée CA |
| 20 | [code article 6 chiffres] | ARTICLE_DIRECT | `finalData` by code | Fiche article + diagnostic |

**Architecture parser (consensus Codex + Opus + Sonnet) :**
`_parseNLQuery(text) → {intent, params}` → dispatch vers handler spécialisé → renderer.
Extension de `runPromoSearch()` existant — même pattern, couche NL en amont.
Entités extraites : canal (WEB/REP/DCS), durée (N jours/mois), montant (>X€), commercial (fuzzy match), métier, marque, famille, N topN.

---

## 5. Éléments à supprimer / fusionner

| Élément actuel | Ce qu'il devient |
|----------------|-----------------|
| Ruptures dans Mon Stock + Cockpit + Diagnostic (×3) | DQ seule (prescriptif). Drill via `dqFocus()` |
| Onglet Cockpit (DQ enfouie après scroll) | Vue 1 "Ce matin" — DQ monte au-dessus du fold |
| Benchmark Radar + Classement Réseau sur 2 onglets | Vue 3 "Mon réseau" — distincts mais dans la même vue |
| Onglet Articles en première intention | Accessible via recherche NL ou drill uniquement |
| Filtre ABC/FMR dans Cockpit ET Radar | Un seul point : Vue 4 "Mon stock" |
| KPIs navbar statiques (taux service, nb articles) | Badges contextuels avec delta ("Serv. -3pts vs médiane") |
| Forces & Faiblesses sans bouton action | Chaque famille <50% → bouton "Diagnostiquer" → `openDiagnostic()` |
| Dormants dans `dashAgeTable` + `actionDormant` + DQ (×3) | DQ reste. Les deux autres = drill uniquement |
| KPI cards Mon Stock colorées mais non cliquables | Clic → `showCockpitInTable()` ou `openDiagnostic()` |
| `benchUnderperformBanner` descriptif | → Bouton "Diagnostiquer ces X familles" direct |

---

## 6. Sprint 1 recommandé

### Action 1 — Decision Queue en page d'accueil `[Taille S]`
Déplacer `renderDecisionQueue()` au-dessus du fold (avant `#cockpitBriefing`).
Trier par euros perdus estimés (pas seulement par `TYPE_PRIORITY`).
Marquage "traité" en mémoire session (localStorage, GAS compatible).
**Impact immédiat :** l'utilisateur voit ses urgences en 0 clic dès l'ouverture.

### Action 2 — 4 nouveaux types DQ `[Taille S]`
Ajouter dans `generateDecisionQueue()` :
- `type:'opportunite'` : `opportuniteNette` top 3 (missingFams ≥ 3, totalPotentiel > 2000€, chalandise chargée)
- `type:'client_silence'` : `reconquestCohort` top 2 (score élevé, silencieux > 45j)
- `type:'client_web_actif'` : `ventesClientHorsMagasin` (WEB) × `ventesClientArticle` absent — signal fuite canalisable
- `type:'saisonnalite_prev'` : article dont stock < MIN × coeff_M+6 de `seasonalIndex`
**Impact immédiat :** la DQ couvre stock + clients + canal + saisonnalité — vraiment prescriptive.

### Action 3 — Bouton "Diagnostiquer" systématique sur Forces & Faiblesses `[Taille S]`
Chaque famille < 50% médiane dans `benchLists.familyPerf` → bouton `openDiagnostic(famille, 'bench')`.
Ce bouton existe partiellement dans `dashFamilyTable` mais pas dans la vue Forces & Faiblesses.
**Impact immédiat :** transforme un tableau descriptif en déclencheur d'action directe.

### Action 4 — Barre recherche NL : couche `parseIntent()` `[Taille M]`
Ajouter `_parseNLQuery(q)` en amont de `runPromoSearch()`.
Couvrir les 8 intents les plus fréquents : CLIENTS_SILENCIEUX, STOCK_DORMANT, CLIENTS_PERDUS, BENCH_SOUS_MEDIANE, KPI_TAUX_SERVICE, CLIENTS_HORS_AGENCE, CANAL_EXCLUSIF, TOP_CLIENTS_CANAL.
`runPromoSearch()` conservé pour les requêtes article-centrées (section A/B/C).
**Impact immédiat :** l'utilisateur peut chercher "clients silencieux depuis 45 jours plus de 3000 euros" et obtenir un tableau immédiat, sans naviguer.

### Action 5 — Health Score agence `[Taille S]`
Score 0-100 composite : (1 - nb_ruptures_A/nb_A) × 0.3 + (clients_actifs_PDV/clients_zone) × 0.3 + (serv/100) × 0.2 + (1 - val_dormants/val_stock) × 0.2.
Badge couleur en haut de la Vue 1 "Ce matin".
**Impact immédiat :** 1 chiffre que le chef d'agence peut expliquer à sa direction en 10 secondes.

---

## Ce qui manque à generateDecisionQueue() aujourd'hui (Sonnet, lecture code réel)

Les 4 lacunes identifiées par lecture du code engine.js :
1. `computeOpportuniteNette()` calculée mais jamais injectée dans la DQ
2. `computeReconquestCohort()` peuple `_S.reconquestCohort` mais la DQ ne la lit pas
3. `computeSPC()` produit un score 0-100 par client mais aucun SPC élevé ne remonte dans la DQ
4. `concentration` identifie le risque ICC mais sans action concrète (quelle famille développer ?)

---

*Synthèse consolidée depuis 20 fichiers — 4 agents, 6 rounds, 2026-03-28.*
*Complexité totale Sprint 1 : 3 actions S + 1 action M — réalisable en 2 sessions de développement.*
