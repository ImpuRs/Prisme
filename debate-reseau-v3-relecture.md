# PRISME — Le Réseau : Relecture complète V3
## Prompt de débat — 4 rounds, 4 participants

---

## Contexte technique (à lire avant de débattre)

### Architecture actuelle du Réseau

**Source de données principale** : `_S.ventesParMagasin` — Map(store → Map(articleCode → {sumPrelevee, sumEnleve, sumCA, sumVMB, countBL}))
Peuplé pendant le parsing du fichier Consommé multi-agences. Canal-invariant par décision V3.

**`computeBenchmark()`** (parser.js:346) :
- Clé de cache : `[myStore, bassin, univers, minCA, obsMode, chalandiseReady]` — le canal global est **intentionnellement exclu** (décision V3)
- Calcule : `benchLists` (missed/under/over/storePerf/familyPerf/pepites/pepitesOther) + `benchFamEcarts`
- Dimensions de comparaison : médiane réseau OU agence spécifique (toggle `selectedObsCompare`)
- Résultat mis en cache → recalcul seulement si bassin/univers/mode changent

**`computeReseauHeatmap()`** (engine.js:654) :
- Source : `_S.ventesParMagasin` → agrégat CA par (store × famille)
- Output : `_S.reseauHeatmapData = {familles[20], agences[], matrix{fam→{store→ratio}}}`
- Ratio = caStore / médiane famille réseau. Canal-invariant.

**`launchReseauWorker()`** (parser.js:672) :
- Web Worker inline : calcule nomades, orphelins réseau, fuites par métier, nomadesMissedArts
- Outputs : `_S.reseauNomades`, `_S.reseauOrphelins`, `_S.reseauFuitesMetier`, `_S.nomadesMissedArts`
- **Limitation** : `ventesParMagasin` est indexé article→store, pas client→store directement.
  Le worker reçoit `clientsPerStore` (Set<cc> par store) séparément.

**`DataStore.byContext()`** (store.js) :
- Consolide canal (`_S._globalCanal`) + période (`_S._globalPeriodePreset`) + commercial (`_S._selectedCommercial`)
- Retourne : `{terrLines, periodeMonths, activeFilters:{canal, periode, commercial}, capabilities:{hasTerritoire, hasArticleFacts, hasCommercial, hasPeriodeFilter}}`

**`_S.articleCanalCA`** (Fix F1) :
- Map(articleCode → Map(canal → {ca, qteP, countBL}))
- Peuplé pendant le parsing consommé, source agence uniquement (pas réseau)

### Vue actuelle du Réseau (renderBenchmark + renderObservatoire)

**Pavés existants** :
1. **Observatoire** — KPI cards (CA, Réf actives, Fréquence, PDM bassin, Tx marge) comparés médiane/agence
2. **Diagnostic auto** (`generateNetworkDiagnostic`) — titre + message + actions cliquables selon écarts
3. **Plan d'action** (obsActionPlan) — top 3 familles sous-performantes avec potentiel CA
4. **Forces & Faiblesses** (familyPerf) — tableau famille × % médiane, cliquable, top 5 articles
5. **Classement agences** (storePerf) — Réf | Fréquence | Taux service | Tx marge | Clients zone | barre perf
6. **Articles manquants** (missed/under/over) — 3 sections fermées par défaut
7. **Heatmap réseau** — CSS Grid 20 familles × N agences, ratio couleur vert/orange/rouge
8. **Familles perdantes/gagnantes** (obsFamiliesLose/Win) — drilldown articles manquants/exclusifs
9. **Pépites** (pepites/pepitesOther) — articles où je surperforme / où le réseau me surpasse
10. **Nomades** — clients actifs dans ≥2 agences
11. **Orphelins** — articles vendus par ≥50% des agences, absents chez moi
12. **Fuites par métier** — indice fuite = 1 − (actifs PDV / clients zone) [nécessite chalandise]
13. **Nomades × Articles manquants** (nomadesMissedArts) — ce que mes nomades achètent ailleurs

**Sidebar gauche** : actuellement filtre Bassin (select multiple agences), filtre Univers, filtre MinCA,
toggle Mode comparaison (médiane / agence spécifique).

**Pas de filtre canal, période ou commercial dans la sidebar réseau.**

---

## Round 1 — INVERSION DU REGARD

**Question** : Aujourd'hui la vue est centrée "AG22 vs réseau" (mon écart à la médiane).
Il manque la lecture inverse : "le réseau vs AG22" (est-ce que la médiane réseau progresse
pendant que je stagne ?). Comment implémenter cette double lecture dans le contexte
technique actuel (ventesParMagasin canal-invariant, pas de dimension temporelle dans le cache) ?

**Positions à défendre** :
- **Gemini (Architecte Pragmatique)** : toggle UI simple "Vue AG22" / "Vue Réseau" — même données,
  direction de l'écart inversée. Zéro nouveau calcul. Implémentable en 30 lignes.
- **Codex (Ingénieur Refactoring)** : deux colonnes côte à côte dans Forces & Faiblesses —
  colonne gauche "Ce que le réseau fait mieux que toi" (obsFamiliesLose existant),
  colonne droite "Ce que tu fais mieux" (obsFamiliesWin existant). Réorganisation pure, pas de calcul.
- **Claude Sonnet (Spécialiste Perf Front)** : enrichir obsKpis avec une flèche de tendance
  fictive basée sur l'écart PDM (ma PDM vs médiane PDM). Montre si je converge ou diverge.
  Coût : 3 lignes dans computeBenchmark, 0 nouveau calcul réseau.
- **Claude Gardien Métier** : la vraie inversion nécessite 2 périodes (N vs N-1).
  Sans `ventesParMagasinN1`, toute "tendance" est un mensonge métier. Bloquer jusqu'à
  que le fichier Consommé inclue des dates BL exploitables (même limitation que Feature A).

**Critères d'évaluation** : vérité métier, coût implémentation, UX (clarté pour le chef de rayon).

---

## Round 2 — SIMPLIFICATION / REGROUPEMENT

**Question** : Avec byContext() et articleCanalCA disponibles, certains pavés du Réseau
sont-ils redondants ou mal positionnés ? Proposer une réorganisation concrète
(fusion, suppression, déplacement) + quels filtres ajouter dans la sidebar gauche.

**Positions à défendre** :
- **Gemini** : fusionner "Orphelins réseau" + "Articles manquants" (missed) en un seul pavé
  "Articles réseau non référencés" trié par priorité composite (nb agences × fréquence réseau × stock=0).
  Supprimer "Articles sous-performants" (under) — redondant avec Forces & Faiblesses.
  Sidebar : ajouter filtre canal (chips) + filtre commercial (dropdown).
- **Codex** : les 13 pavés actuels sont trop granulaires — proposer 4 sections :
  (1) Positionnement (KPIs + classement), (2) Gamme (manquants + orphelins + F&F),
  (3) Clients (nomades + fuites + chalandise), (4) Opportunités (pépites + plan d'action).
  Sidebar : ajouter filtre période (chips 12M/6M/YTD) qui réactive _getFilteredMonths.
- **Claude Sonnet** : ne pas fusionner — chaque pavé répond à une question métier différente.
  Mais rendre 8 pavés sur 13 fermés par défaut (accordion), avec badges de comptage.
  La sidebar doit rester légère : uniquement bassin + univers. Canal = filtre global déjà en navbar.
- **Claude Gardien Métier** : le vrai problème n'est pas le nombre de pavés mais l'absence
  de score de priorité global. Ajouter un `priorityScore` réseau par famille
  (écart × PDM × CA potentiel) et trier TOUS les pavés par ce score.
  Canal dans la sidebar uniquement si articleCanalCA couvre le réseau (aujourd'hui : source agence uniquement).

**Contrainte technique** : articleCanalCA est source agence, pas réseau.
ventesParMagasin est canal-invariant. Tout filtre canal dans le Réseau sera partiel.

---

## Round 3 — FILTRE CANAL DANS LE RÉSEAU

**Question** : Le benchmark est canal-invariant (décision V3, clé cache sans canal).
Faut-il réviser cette décision ? Ou peut-on filtrer certaines sections du Réseau
par canal **sans refactorer computeBenchmark()** ?

**Contexte technique précis** :
- `_S.ventesParMagasin[store][code]` = agrégat TOUS canaux (Prélevé+Enlevé)
- `_S.articleCanalCA.get(code)?.get(canal)` = CA par canal, AGENCE uniquement (pas les autres stores)
- Si on filtre Forces & Faiblesses par canal via articleCanalCA : on compare
  ma vision filtrée-canal vs la médiane réseau tous-canaux → biais de lecture garanti.

**Positions à défendre** :
- **Gemini** : créer `_S.ventesParMagasinCanal` = Map(store → Map(canal → Map(code → {ca, freq})))
  peuplé pendant le parsing (coût ~40 MB). Permet un benchmark canal-aware complet.
  Clé cache enrichie. Coût acceptable si GAS 2026 (v8 modernes, 512 MB heap).
- **Codex** : approche hybride — filtrer uniquement les sections "soft" (heatmap, pépites, nomades)
  via `activeFilters.canal` sans recalculer computeBenchmark. Afficher bandeau
  "⚠️ Filtrage partiel — comparaison réseau reste tous canaux". Coût : ~50 lignes.
- **Claude Sonnet** : la décision V3 (canal-invariant) est correcte pour le benchmark comparatif.
  Mais la heatmap et les orphelins peuvent être filtrés côté render sans nouveau calcul :
  `matrix[fam][store]` × filtre canal sur `_S.articleCanalCA` pour mon agence uniquement.
  C'est honnête : "ma performance sur ce canal vs la médiane réseau tous canaux".
- **Claude Gardien Métier** : BLOQUER tout filtre canal dans le Réseau tant que
  ventesParMagasin reste canal-invariant. Un filtre partiel (agence filtrée vs réseau brut)
  est un mensonge métier pire que l'absence de filtre. Exception unique :
  afficher dans les KPI cards la décomposition canal de MON agence en overlay, sans comparer.

**Décision à produire** : quelle section peut légitimement filtrer par canal ?
Avec quel bandeau d'avertissement ? Impact sur la clé de cache ?

---

## Round 4 — RANKING DYNAMIQUE

**Question** : Le classement agences (storePerf) est actuellement trié par fréquence uniquement.
Peut-on avoir un ranking dynamique par dimension (fréquence, marge, taux service, PDM, CA) ?
Comment implémenter sans recalcul coûteux ?

**Contexte technique** :
- `storePerf` = `{ [store]: {ref, freq, serv, clientsZone, txMarge} }` — déjà en mémoire
- `obsKpis.mine` vs `obsKpis.compared` — déjà calculé
- Le tri actuel est dans renderBenchmark() : `Object.entries(storePerf).sort((a,b)=>b[1].freq-a[1].freq)`
- Recalcul computeBenchmark() = ~50-200ms selon bassin — à éviter pour un simple sort

**Positions à défendre** :
- **Gemini** : ajouter un `<select id="rankSortKey">` (Fréquence | CA | Tx marge | Taux service | PDM)
  + bouton ASC/DESC. Le tri se fait dans renderBenchmark() sur l'objet storePerf existant.
  Zéro recalcul, ~10 lignes JS. Persister le choix dans `_S._rankSortKey`.
- **Codex** : ranking multi-critères avec score composite pondéré
  (ex: 40% freq + 30% txMarge + 20% serv + 10% PDM). Toggle "Score composite" vs critère unique.
  Score normalisé 0-100 sur les valeurs du bassin. Coût : 20 lignes. Stocker dans `_S._rankWeights`.
- **Claude Sonnet** : ranking dynamique côté render uniquement (pas de state `_S`).
  Les headers du tableau sont cliquables (pattern habituel). Click header → sort in-place
  sur la NodeList DOM sans toucher storePerf. Zéro state, zéro re-render complet.
  Limitation : perdre le tri quand renderBenchmark() est rappelé.
- **Claude Gardien Métier** : le ranking dynamique est inutile si on ne résout pas d'abord
  la question des périmètres comparables. AG15 avec 3 canaux vs AG22 avec 1 canal :
  le tri par fréquence est biaisé. Avant d'ajouter des axes de tri, normaliser storePerf
  par canal (nombre de canaux actifs) ou ajouter une note d'avertissement.
  Priorité : fiabilité > ergonomie.

**Décision à produire** : quelle approche de tri retenir ? Quelle dimension par défaut ?
Est-ce que txMarge (colonne existante) doit devenir le tri par défaut ?

---

## Format attendu

4 rounds de débat, 4 participants, consensus ou dissensus documenté.
Synthèse finale avec :
- Décision par question (1 à 4)
- Structures `_S` à ajouter / ne pas ajouter
- Sections du Réseau pouvant légitimement filtrer par canal
- Ordre d'implémentation recommandé
- Ce qui est définitivement hors-périmètre

Contexte projet : pas de bundler, pas de tests automatisés, hébergement GAS iframe,
contrainte mémoire ~100-150 MB heap effectif, fichier unique index.html + modules JS.
