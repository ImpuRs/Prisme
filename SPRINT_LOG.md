# PRISME — Sprint Log V4
> Dernière mise à jour : mars 2026
> 63 sprints · 55 fonctions NL · ~7 500 lignes ajoutées depuis Sprint 1

---

## Vue d'ensemble

Ce log couvre **tous les sprints V4** depuis le début de la session, y compris les 21 sprints
pré-session commités dans git (1 → S) et les 42 sprints de la session courante (V → BK).

**Pipeline NL (`_nlInterpret` dans `js/ui.js`) :**
```
Saisie utilisateur
  → _nlNorm(q)          normalisation : lowercase, accents, ponctuation
  → _nlEntities(raw)    extraction : jours, euros, top N, commercial, métier
  → _nlInterpret(raw)   routage regex → 55 fonctions _nlQ_Xxx()
  → _nlRenderResults()  affichage dans #cematinResults
```
Chaque `_nlQ_Xxx()` retourne `{ title, html, footer? }` — jamais de side effect DOM direct.

---

## Sprints 1–2C — Fondations V4

| Sprint | Fichiers | Description |
|--------|----------|-------------|
| **1** | `engine.js` +131l, `ui.js` +105l, `main.js`, `index.html` | Decision Queue prescriptive + Health Score agence 0-100. 4 types DQ : `client_silence`, `opportunite`, `client_web_actif`, `saisonnalite_prev`. Dismiss par item (✓ Traité). `computeHealthScore()` exporté depuis engine.js |
| **NL Promo** | `promo.js` +428l, `index.html` | NL Search dans l'onglet Promo : `_parseNLQuery()` avec 10 intents (reconquête, silencieux, dormants, bench, hors-agence, canal exclusif, top clients, opportunités, nouveaux clients). Rendu dans `#promoNLResult`, fallback article |
| **NL Sprint 2** | `promo.js` +328l | 8 intents supplémentaires : `COMMERCIAL_SILENCE`, `CHURN_ACTIF`, `RUPTURES_TOP_CLIENTS`, `DQ_REASSORT`, `ANOMALIE_MINMAX`, `BENCH_FAMILLE_RESEAU`, `METIER_CANAL`, `ARTICLES_HORS_MARQUE`. Total 19 intents dans Promo |
| **2A** | `main.js` +99l, `index.html`, `ui.js` | Onglet **"Mes clients"** — 4 sections : ⚡ Top 5 priorités semaine · 🔄 Cohorte reconquête top 10 · 🎯 Opportunités nettes top 8 · 🌐 Actifs hors-agence top 10. Chaque carte → `openClient360` |
| **2C** | `main.js`, `index.html` | KPI cards cliquables — 9 cards dans Mon Stock/Cockpit/Réseau deviennent des déclencheurs directs (`switchTab`, `showCockpitInTable`, scroll Forces & Faiblesses) |

---

## Sprints D–G — Restructuration UX

| Sprint | Fichiers | Description |
|--------|----------|-------------|
| **D** | `index.html`, `main.js`, `ui.js` | Vue **"Ce matin"** (ex-Cockpit) — DQ + Health Score au-dessus du fold. Barre NL search en tête du tab. DQ triée par euros perdus estimés. Palette commandes : mots-clés "ce matin", "matin", "dq" |
| **E** | `cache.js`, `engine.js`, `main.js` | Fix timing DQ : `reconquestCohort` + `opportuniteNette` injectés correctement. `reconquestCohort` persisté dans IndexedDB. Score DQ pour `client_silence` et `opportunite` |
| **F** | `main.js` | Bouton "🔍 Diagnostiquer" dans `obsLoseTable` (familles réseau > moi), en cohérence avec `benchFamilyTable` |
| **G** | `engine.js`, `ui.js` | Alerte churn saisonnier : clients silencieux en DQ pondérés par `seasonalIndex` moyen de leurs familles. Badge "🌡️ Creux saisonnier" si indice < 0.85 |

---

## Sprints H–K — NL Search engine Ce matin

| Sprint | Fonction | Chip | Description |
|--------|----------|------|-------------|
| **H** | `_nlQ_TauxService()` `_nlQ_StockDormant()` `_nlQ_AnomaliesMinMax()` `_nlQ_ClientsWeb()` `_nlQ_ClientsRepOnly()` `_nlQ_RupturesTopClients()` `_nlQ_ClientsSilencieux()` `_nlQ_CommercialSilent()` | *(initial chips)* | **Moteur NL Ce matin** — 8 fonctions, interpréteur `_nlInterpret()` initial dans `ui.js` (+219l). Résultats inline dans `#cematinResults`, cliquables → fiche 360° |
| **I** | *(main.js)* | — | **Momentum commercial** dans Mes clients : barre tricolore (actifs/risque/silencieux) par commercial, badge ⬆/➡/⬇, CA à risque, tri recul en premier. Clic → filtre Terrain |
| **J** | `_nlQ_NouveauxClients()` `_nlQ_ClientsHorsAgence()` `_nlQ_FamillesSousMediane()` | 9 chips | **Chips NL cliquables** sous barre de recherche. 3 nouvelles requêtes NL — total 11 patterns interprétés |
| **K** | *(ui.js, 13l)* | — | **Cmd+K → NL Search** : palette commandes affiche un groupe "🔍 Recherche intelligente" si la requête matche un intent NL. NL accessible depuis n'importe quel onglet |

---

## Sprints L–S — Omnicanalité & fuites

| Sprint | Fonction | Chip | Description |
|--------|----------|------|-------------|
| **L** | `_nlQ_ClientsDigitaux()` | clients digitaux | Clients avec historique PDV silencieux >90j mais actifs en ligne (≥200€). Card grid 2 colonnes avec canal dominant. Bloc dans Mes clients |
| **M** | `_nlQ_OmniSegment()` | clients hybrides | `computeOmniScores()` dans engine.js : segmente chaque client (Mono PDV / Hybride / Digital / Dormant), score 0-100. Bloc "Segments omnicanaux" dans Mes clients. DQ : type `client_digital_drift` |
| **N** | `_nlQ_FamillesHors()` | familles fuyantes | `computeFamillesHors()` dans engine.js : familles achetées hors agence par des clients PDV actifs → `_S.famillesHors`. DQ : type `famille_fuite` (priorité 3.15) |
| **O** | `_exportTourneeCSV()` | — | Export Plan de visite CSV depuis Momentum commercial : clients silencieux ≥30j, colonnes enrichies (omni score, segment, priorité URGENT/À RELANCER/SURVEILLER). UTF-8 BOM Excel |
| **P** | *(diagnostic.js, +51l)* | — | **Onglet Omni** dans fiche client 360° : gauge score, badge segment, barre CA PDV vs Digital, familles en 3 sections (fuites / omnicanal / PDV only) |
| **Q** | `_nlQ_HeatmapFuites()` | heatmap fuites × métier | Matrice familles fuyantes × top 6 métiers PDV, intensité orange ∝ nb clients fuyants. Click ligne → `openDiagnostic(famille)` |
| **R** | *(diagnostic.js, +34l)* | — | **Résumé copiable client 360°** enrichi : CA digital, priorité colorée, score omni, familles fuyantes, opportunités articles |
| **S** | `_nlQ_CommercialFuites()` | fuites par commercial | Deux modes : ranking tous commerciaux par CA fuyant / détail portefeuille commercial nommé. Réutilise `computeFuitesForClients()` (DRY) |

---

## Sprints V–Z — Infrastructure IRA + Exports

| Sprint | Fonction / Export | Description |
|--------|------------------|-------------|
| **V** | `renderIRABanner()` | Bandeau IRA (Indice de Risque Agence) : 3 scores (Stock F+M, Momentum clients, Captation PDV) composites /100 |
| **W** | `_nlQ_SaisonProchainMois()` | Alerte proactive : familles avec coeff saisonnier >1.10 le mois prochain, tableau détaillé |
| **X** | `_nlQ_SyntheseCommercial()` | Scorecard par commercial : actifs, silencieux, CA PDV, CA fuyant, captation%, omni score |
| **Y** | `_nlQ_RadarFamilles()` | Scatter SVG CA PDV vs CA fuyant, bulles proportionnelles nb clients, 4 quadrants, click → diagnostic |
| **Z** | `exportAgenceSnapshot()` | Export markdown clipboard : IRA + DQ top5 + KPIs + canaux + fuites |

---

## Sprints AA–AG — DQ, badges, clavier

| Sprint | Fonction | Description |
|--------|----------|-------------|
| **AA** | `_nlQ_IncoherencesERP()` + DQ `erp_incoherence` | 3 catégories : MIN>MAX, nouveautés sans calibrage, sur-stock vs MAX. DQ section dans `engine.js` |
| **AB** | `_nlQ_DeriveMinMax()` | Compare ancienMin vs nouveauMin, signale écarts ≥50% (dérive de paramétrage ERP) |
| **AC** | `_nlQ_ConcentrationClient()` | ICC + Pareto + top 15 clients avec badges silence/segment risque |
| **AD** | `_nlQ_FideliteClients()` | Score RFV (Récence 35 + Fréquence 35 + Valeur 30), top fidèles + fidèles à risque |
| **AE** | `_nlQ_PanierMetier()` | VMC et CA/client par métier, code couleur vs moyenne |
| **AF** | `renderTabBadges()` | Badges numériques sur onglets "Ce matin" et "Mes clients" |
| **AG** | Keyboard handler | Raccourcis `1`–`7` (navigation onglets), `/` (focus NL search), `Escape` (fermer overlays) |

---

## Sprints AH–AI — Historique et évolution temporelle

| Sprint | Fonction | Description |
|--------|----------|-------------|
| **AH** | `_nlQ_EvolutionFamille()` | Delta% CA par famille M vs M-1, tableau hausses/baisses, sparkline 12 mois |
| **AI** | `_saveIRASnapshot()` / `_loadIRAHistory()` / `_renderIRASparkline()` | Historique IRA dans localStorage (90 jours max), sparkline SVG sous les pills IRA |

---

## Sprints AJ–AP — Alertes opérationnelles

| Sprint | Fonction | Chip | Description |
|--------|----------|------|-------------|
| **AJ** | `_nlQ_PrevisionRupture()` | ⏱️ ruptures prévues | Stock ÷ VMJ → articles tombant en rupture dans <30j |
| **AK** | `_nlQ_RelanceClients()` | 📞 relance clients | Silencieux >45j + CA PDV >500€, dernier article acheté |
| **AL** | `_nlQ_NouveautesCalibrer()` | 🔧 nouveautés ERP | Nouveautés W≥2 sans MIN/MAX cohérent + suggestion calculée |
| **AM** | `_nlQ_PositionReseau()` | 🏆 position réseau | Score agence vs médiane réseau (taux service, CA, familles, pépites) |
| **AN** | `_nlQ_DormantsRecuperables()` | ♻️ dormants récup. | Croisement dormants (>180j) × `ventesClientHorsMagasin` |
| **AO** | `_nlQ_RupturesRepetees()` | 🔄 ruptures chroniques | W≥3, stock=0, ≥3 mois à zéro non consécutifs, sparkline zones rouges |
| **AP** | `_nlQ_QualiteDonnees()` | 🔬 qualité données | Score 5 dimensions : ERP, familles, prix, chalandise, saisonnalité → /100 |

---

## Sprints AQ–AW — Analyse stock et clients

| Sprint | Fonction | Chip | Description |
|--------|----------|------|-------------|
| **AQ** | `_nlQ_SousMinERP()` | 📉 sous MIN ERP | Stock > 0 mais < MIN ERP, barre de remplissage, triés par ratio |
| **AR** | `_nlQ_CrossSellFamilles()` | 🔗 cross-sell familles | Co-achats PDV : paires de familles achetées par ≥3 clients communs |
| **AS** | `_nlQ_ArticlesSolder()` | 🗑️ à solder | >365j + W≤1 + stock > 0, valeur immobilisée totale |
| **AT** | `_nlQ_CanauxFamille()` | 📡 canaux par famille | `articleCanalCA` agrégé par famille, barre multicanal colorée |
| **AU** | `_nlQ_BriefingJour()` | ☀️ briefing du jour | Synthèse auto des alertes prioritaires (ruptures, saison, relance, ERP) |
| **AV** | `_nlQ_FicheArticle()` | *(NL)* | Fiche article par code 6 chiffres ou mots-clés, bouton diagnostic famille |
| **AW** | `_nlQ_PotentielFamille()` | 🎯 potentiel famille | Clients n'ayant jamais acheté une famille donnée (ou top familles non couvertes) |

---

## Sprints AX–BD — Profils et benchmarks

| Sprint | Fonction | Chip | Description |
|--------|----------|------|-------------|
| **AX** | `_nlQ_ProfilCommercial()` | *(NL, détection entité)* | Profil complet d'un commercial : CA PDV/hors, actifs/silencieux, top métiers |
| **AY** | `_nlQ_CouvertureJours()` | 📅 couverture jours | VMJ famille → jours de stock restant, critique <15j |
| **AZ** | `_nlQ_ClientsGagnesPerdus()` | ⚖️ gagnés vs perdus | 1er achat <90j = gagné, silence >180j = perdu, solde CA |
| **BA** | `_nlQ_ProfilClient()` | 👤 profil client | Détection par nom dans la requête, CA PDV/hors, top familles/articles, bouton 360° |
| **BB** | `_nlQ_FamillesSurperformantes()` | 🏅 surperformance | `storePerf` bench → familles ≥+20% (surperf) / ≤-20% (sous-perf) vs médiane |
| **BC** | `_nlQ_StockSecurite()` | 🛡️ stock sécurité | Marge = couverture ÷ seuil FMR (F=4j, M=3j, R=2j), critique si <50% |
| **BD** | `_nlQ_PivotMetierFamille()` | 🔢 pivot métier | Heatmap CA par métier × top 8 familles, intensité bleue proportionnelle |

---

## Sprints BE–BK — Analyse avancée

| Sprint | Fonction | Chip | Description |
|--------|----------|------|-------------|
| **BE** | `_nlQ_TopMoversArticles()` | 🚀 top movers | `articleMonthlySales` M vs M-1, variation ≥±15%, badge ⚠️ si en rupture |
| **BF** | `_nlQ_RepartitionGeo()` | 🗺️ répartition géo | CP chalandise → département, CA PDV + % clients par zone |
| **BG** | `_nlQ_EngagementClients()` | 💪 engagement clients | Score RFM /100 : Récence 35 + Fréquence 35 + Montant 30, top engagés + à risque |
| **BH** | `_nlQ_SurStockes()` | 📦 sur-stockés | Stock > 2× MAX ERP, valorisation excédent, ratio coloré |
| **BI** | `_nlQ_SaisonVsStock()` | 🌊 saison vs stock | Couverture ajustée ×coeff saison, impact en jours perdus vs base |
| **BJ** | `_nlQ_TopFamillesMetier()` | *(NL, détection métier)* | Top familles CA PDV pour un métier nommé dans la requête |
| **BK** | `_nlQ_OmnicanalMacro()` | 🌐 omnicanal macro | Donut SVG + barres par canal (CA, BL, VMC, part de voix) |

---

## Toutes les fonctions NL (55 total)

### Fonctions Ce matin — `_nlInterpret()` dans `ui.js`

| Fonction | Sprint | Description courte |
|----------|--------|--------------------|
| `_nlQ_TauxService()` | H | Taux de service articles F+M |
| `_nlQ_StockDormant()` | H | Stock dormant depuis N jours |
| `_nlQ_AnomaliesMinMax()` | H | Articles sans MIN ou sans MAX |
| `_nlQ_ClientsWeb()` | H | Clients internet uniquement |
| `_nlQ_ClientsRepOnly()` | H | Clients représentant exclusif |
| `_nlQ_RupturesTopClients()` | H | Ruptures impactant les meilleurs clients |
| `_nlQ_ClientsSilencieux()` | H | Clients silencieux depuis N jours |
| `_nlQ_CommercialSilent()` | H | Silencieux d'un commercial donné |
| `_nlQ_NouveauxClients()` | J | Nouveaux clients depuis N jours |
| `_nlQ_ClientsHorsAgence()` | J | Clients avec CA hors agence > N€ |
| `_nlQ_FamillesSousMediane()` | J | Familles sous médiane réseau |
| `_nlQ_ClientsDigitaux()` | L | Clients passés au digital |
| `_nlQ_OmniSegment()` | M | Segmentation omnicanale (hybride/mono/digital) |
| `_nlQ_FamillesHors()` | N | Familles avec CA fuyant détecté |
| `_nlQ_HeatmapFuites()` | Q | Heatmap fuites métier × famille |
| `_nlQ_CommercialFuites()` | S | Fuites par commercial |
| `_nlQ_SaisonProchainMois()` | W | Familles à coeff saisonnier >1.10 le mois prochain |
| `_nlQ_SyntheseCommercial()` | X | Scorecard par commercial |
| `_nlQ_RadarFamilles()` | Y | Scatter SVG CA PDV vs CA fuyant |
| `_nlQ_IncoherencesERP()` | AA | Incohérences MIN/MAX dans l'ERP |
| `_nlQ_DeriveMinMax()` | AB | Dérive de paramétrage ERP ≥50% |
| `_nlQ_ConcentrationClient()` | AC | ICC + Pareto + top 15 clients |
| `_nlQ_FideliteClients()` | AD | Score RFV fidélité clients |
| `_nlQ_PanierMetier()` | AE | VMC et CA/client par métier |
| `_nlQ_EvolutionFamille()` | AH | Delta% CA famille M vs M-1 |
| `_nlQ_PrevisionRupture()` | AJ | Ruptures prévues dans <30j |
| `_nlQ_RelanceClients()` | AK | Silencieux >45j + CA PDV >500€ |
| `_nlQ_NouveautesCalibrer()` | AL | Nouveautés sans MIN/MAX cohérent |
| `_nlQ_PositionReseau()` | AM | Score agence vs médiane réseau |
| `_nlQ_DormantsRecuperables()` | AN | Dormants × achats hors-agence |
| `_nlQ_RupturesRepetees()` | AO | Ruptures chroniques ≥3 mois |
| `_nlQ_QualiteDonnees()` | AP | Score qualité données 5 dimensions |
| `_nlQ_SousMinERP()` | AQ | Stock > 0 mais < MIN ERP |
| `_nlQ_CrossSellFamilles()` | AR | Co-achats PDV ≥3 clients communs |
| `_nlQ_ArticlesSolder()` | AS | >365j + W≤1 + stock > 0 |
| `_nlQ_CanauxFamille()` | AT | Barre multicanal par famille |
| `_nlQ_BriefingJour()` | AU | Synthèse alertes prioritaires |
| `_nlQ_FicheArticle()` | AV | Fiche article par code ou mots-clés |
| `_nlQ_PotentielFamille()` | AW | Clients sans famille donnée |
| `_nlQ_ProfilCommercial()` | AX | Profil complet d'un commercial |
| `_nlQ_CouvertureJours()` | AY | Jours de stock par famille |
| `_nlQ_ClientsGagnesPerdus()` | AZ | Nouveaux gagnés vs perdus récents |
| `_nlQ_ProfilClient()` | BA | Profil client par nom |
| `_nlQ_FamillesSurperformantes()` | BB | Familles ≥+20% vs médiane réseau |
| `_nlQ_StockSecurite()` | BC | Marge vs seuil FMR |
| `_nlQ_PivotMetierFamille()` | BD | Heatmap CA métier × famille |
| `_nlQ_TopMoversArticles()` | BE | Articles variation ≥±15% M vs M-1 |
| `_nlQ_RepartitionGeo()` | BF | CA PDV + clients par département |
| `_nlQ_EngagementClients()` | BG | Score RFM /100 |
| `_nlQ_SurStockes()` | BH | Stock > 2× MAX ERP |
| `_nlQ_SaisonVsStock()` | BI | Couverture ajustée × coeff saison |
| `_nlQ_TopFamillesMetier()` | BJ | Top familles d'un métier nommé |
| `_nlQ_OmnicanalMacro()` | BK | Donut + barres canaux macro |

### Fonctions Promo — `_parseNLQuery()` dans `promo.js`
10 intents initiaux (NL Promo) + 8 ajoutés (NL Sprint 2) = **18 intents** dans Promo NL

---

## Fichiers modifiés (cumulé V4)

| Fichier | Modifications principales |
|---------|--------------------------|
| `js/ui.js` | +~5 000 lignes : 53 fonctions NL Ce matin, `renderIRABanner`, `exportAgenceSnapshot`, `renderTabBadges`, IRA history helpers |
| `js/engine.js` | +section DQ, `computeHealthScore`, `computeOmniScores`, `computeFamillesHors`, alerte churn saisonnier, DQ types enrichis |
| `js/main.js` | +onglet Mes clients, Momentum commercial, KPI cliquables, Export CSV, intégration reconquête/DQ |
| `js/promo.js` | +`_parseNLQuery()` 18 intents NL, remplacement recherche simple |
| `js/cache.js` | +persistance `reconquestCohort` |
| `js/diagnostic.js` | +onglet Omni client 360°, résumé copiable enrichi |
| `index.html` | +`#iraBanner`, badges onglets, ~55 chips NL Ce matin, onglet Mes clients |

---

## Données utilisées par les fonctions NL Ce matin

| Source `_S` | Utilisée par |
|-------------|-------------|
| `finalData` | AJ, AL, AM, AO, AP, AQ, AS, AT, AY, BC, BH, BI + alertes stock |
| `articleMonthlySales` | AH, AO, BE, BI |
| `seasonalIndex` | W, BI |
| `ventesClientArticle` | AC, AD, AE, AK, AN, AR, AW, AX, AZ, BA, BD, BF, BG, H, J, L, M, N, Q, S |
| `ventesClientHorsMagasin` | AN, AX, AZ, BA, L, M, N, Q, S |
| `chalandiseData` | AK, AW, AX, AZ, BA, BD, BF, BG, BJ, H, I, L, M, N, O, Q, S |
| `clientLastOrder` | AK, AX, AZ, BA, BG, H, L |
| `articleCanalCA` | AT, AV, BK |
| `canalAgence` | BK |
| `benchLists` | AM, BB |
| `ventesParMagasin` | AM |
| `articleFamille` | AH, AJ, AN, AR, AT, AW, BA, BD, BE, BG, BJ |
| `clientsByCommercial` | AX, X, S |
| `clientsByMetier` | BJ |
| `libelleLookup` | AJ, AK, BA, BE |
| `famillesHors` | N, Q, S |
| `clientOmniScore` | M, O, P |
| `iraHistory` (localStorage) | AI |
