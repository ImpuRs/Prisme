# SYNTHÈSE FINALE — PRISME V3 : Architecture Multi-Dimensions
*Débat 4 rounds — 4 participants : Gemini (Architecte Pragmatique), Codex (Ingénieur Refactoring), Claude Sonnet (Spécialiste Perf Front), Claude (Gardien Métier)*
*Date : 2026-03-27*

---

## Résumé Exécutif

L'implémentation des 4 features V3 (Saisonnière, Canal Global, Commerciale, Période) est réalisable sans big-bang refactoring, à condition de respecter un ordre strict et de définir précisément ce qui est "dans le périmètre V3". Le bug byCanal() est résolvable avec une structure simple de ~10 MB. L'ordre D→C→B→A minimise les risques de régression et maximise la valeur métier incrémentale.

---

## A) Fix Prérequis — byCanal() en mode dégradé

### Décision : F1 avec capabilities enrichies (Codex F4 variant)

**Consensus 3/4** (Codex, Gardien, Sonnet — Gemini avait proposé d'ajouter .canal à finalData, rejeté car viole CANAL-INVARIANT)

```js
// state.js — À AJOUTER
_S.articleCanalCA = new Map();
// code → Map(canal → {ca: 0, qteP: 0, countBL: 0})
// Construit dans la boucle consommé existante (~0 coût CPU supplémentaire)
// Coût mémoire réel : ~10 MB (overhead V8 Maps imbriquées — pas 3 MB naïf)
// Canaux : 'MAGASIN' | 'INTERNET' | 'REPRESENTANT' | 'DCS'

// resetAppState() — AJOUTER :
_S.articleCanalCA = new Map();
```

```js
// byCanal() retourne désormais capabilities
function getKPIsByCanal(canal) {
  const _c = canal && canal !== 'ALL' ? canal : null;
  const terrLines = _c
    ? _S.territoireLines.filter(l => l.canal === _c)
    : _S.territoireLines;
  const hasTerritoire = _S.territoireLines.length > 0;
  return {
    canal: _c || 'ALL',
    canalStats: _c ? (_S.canalAgence[_c] || {bl:0,ca:0,caP:0,caE:0}) : _S.canalAgence,
    totalCA: Object.values(_S.canalAgence).reduce((s,v) => s+(v.ca||0), 0),
    terrLines,
    articleFacts: !hasTerritoire ? _S.articleCanalCA : null, // source agence ≠ territoire
    finalData: _S.finalData,
    capabilities: {
      hasTerritoire,
      hasArticleFacts: _S.articleCanalCA.size > 0,
    }
  };
}
```

**Obligation UI** : si `!capabilities.hasTerritoire && capabilities.hasArticleFacts`
→ afficher bandeau "📊 Source : ventes agence uniquement — chargez Le Terrain pour les données omnicanal"

**Rejetés définitivement** :
- F2 (stub) : violation de contrat byCanal(), données fantômes silencieuses
- F3 (canalDominant sur finalData) : mensonge métier — un article est vendu sur N canaux
- Gemini-F4 (ajouter .canal à finalData) : viole l'invariant CANAL-INVARIANT (consensus 3/4)

---

## B) Ordre d'implémentation des 4 features

### Décision : D → C → B → A

**Consensus unanime sur A en dernier** (4/4).

| Feature | Justification | Structures additionnelles | Risque |
|---|---|---|---|
| **D** — Saisonnière | Lecture pure sur finalData + seasonalIndex existants. Zéro structure nouvelle. Valeur métier immédiate. | Aucune — calcul au render | Zéro |
| **C** — Canal Global | Finalise les Étapes 1-5. Utilise articleCanalCA du fix F1. MVP = KPIs de ventes + terrLines. | _globalCanal dans state.js | Moyen — propagation render |
| **B** — Commerciale | S'appuie sur canal stabilisé (C). Jointure à la volée ventesClientArticle × chalandiseData. | Aucune — clientsByCommercial existant | Faible |
| **A** — Période | Limite structurelle : dates BL absentes. MVP scopé : presets sur articleMonthlySales uniquement. | _globalPeriodePreset dans state.js | Élevé — recalcul MIN/MAX impossible |

**Ne pas implémenter en parallèle** :
- A + C : articleMonthlySales (canal-invariant) × articleCanalCA (période-invariant) → état incohérent
- A + D : deux jeux de MIN/MAX simultanés → débogage impossible sur les règles métier critiques
- C + B : risque sur les sélecteurs de filtrage global (risque moyen, surveillance requise)

---

## C) Structures à ajouter dans state.js + resetAppState()

```js
// Fix F1 (prérequis — avant toutes les features)
_S.articleCanalCA = new Map();       // code → Map(canal → {ca, qteP, countBL})

// Feature C (Filtre Canal Global)
_S._globalCanal = '';                // '' = Tous | 'MAGASIN' | 'INTERNET' | 'REPRESENTANT' | 'DCS'

// Feature A (Période — MVP uniquement)
_S._globalPeriodePreset = '12M';     // '12M' | '6M' | 'YTD'

// Feature D (Saisonnière) — PAS dans state.js
// saisonMin/saisonMax = calculs de render, jamais stockés
// const moisCourant = new Date().getMonth();
// saisonMin = Math.ceil(nouveauMin × seasonalIndex[famille][moisCourant])

// Feature B (Commerciale) — PAS de nouvelle structure
// Jointure à la volée : cc → commercial depuis chalandiseData
// clientsByCommercial existe déjà

// resetAppState() — À AJOUTER (3 lignes) :
_S.articleCanalCA = new Map();
_S._globalCanal = '';
_S._globalPeriodePreset = '12M';
```

---

## D) Structures à NE PAS créer (et pourquoi)

| Structure | Pourquoi ne pas créer |
|---|---|
| `_S.ventesParCommercial` | Jointure à la volée suffit. Coût mémoire inutile. |
| `_S._activeFilters = {canal, periode, commercial}` | Over-engineering sans tests. Profondeurs d'impact différentes. Reporté V3.2. |
| `_S.filterContext = {global, territory, chalandise, projection}` | Correct architecturalement mais prématuré sans bundler ni tests. |
| `row.canalDominant` sur finalData | Viole l'invariant CANAL-INVARIANT. |
| `_S.articleMonthlyCanalSales` (canal × mois) | ~60-80 MB — hors budget GAS. |
| `salesCube[client][article][canal]` | ~400+ MB. Hors navigateur. Reporté V4. |

---

## E) Critères de Done minimaux par feature

**D — Saisonnière** :
- `saisonMin / saisonMax` affichés dans un widget cockpit DISTINCT (jamais dans les colonnes MIN/MAX)
- Export CSV "Commande du mois" fonctionnel
- Note visible : "Préconisation indicative — les MIN/MAX réglementaires ne changent pas"
- 3 cas manuels testés : canal complet / canal sans territoire / canal sans facts

**C — Canal Global** :
- Chips MAGASIN|INTERNET|REPRESENTANT|DCS|Tous fonctionnels
- Filtre KPIs barre canal, terrLines Terrain, articleFacts capabilities
- Bandeau dégradé si !hasTerritoire && hasArticleFacts
- Message explicite si combinaison canal + commercial = 0 résultats
- NON inclus MVP : Cockpit ruptures par canal, Radar/ABC par canal

**B — Commerciale** :
- Panneau ou onglet : CA, clients actifs/perdus/potentiels, top 5 familles par commercial
- Filtre commercial dans Diagnostic niveau 4
- Respect de _globalCanal (canal stabilisé par C d'abord)
- NON inclus MVP : drill-down multi-niveaux, export CSV commercial

**A — Période MVP** :
- Presets YTD/12M/6M filtrent articleMonthlySales pour graphiques de tendance + widget D
- Mention OBLIGATOIRE : "MIN/MAX non recalculés sur cette période"
- NON inclus V3 : recalcul V/W sur sous-période, MIN/MAX dynamiques

---

## F) Risques identifiés et mitigations

| Risque | Feature | Probabilité | Mitigation |
|---|---|---|---|
| Confusion saisonMin vs nouveauMin en UI | D | Élevée | Widget distinct + note explicite + couleur différente |
| Faux zéro silencieux (canal+commercial incompatibles) | C+B | Élevée | Count + bandeau "Aucun résultat pour cette combinaison" |
| Recalcul MIN/MAX déclenché par filtre période | A | Élevée si non scopé | Mention + lock engine.js pendant V3 |
| Régression resetAppState() | Fix F1 | Moyenne | assertPostParseInvariants() + lint resetAppState |
| Render chaîné trop lent (4-6 × 30ms) | C | Moyenne | LRU cache 20 entrées si Feature A implémentée |
| Incompatibilité A + C en même sprint | A+C | Élevée | Convention : A seulement après C validée en prod |

---

## G) Hors-périmètre V3 — DÉFINITIF

**Reporté V3.2** :
- `DataStore.byContext({canal, periode, commercial})`
- Migration des filtres-vue existants vers _globalCanal

**Reporté V4** :
- Recalcul W/V/MIN/MAX sur sous-période avec dates BL
- salesCube[client][article][canal]
- Fusion VCA/VCH
- Radar/ABC filtré par canal (finalData canal-invariant maintenu)

**Jamais** :
- localStorage (bloqué GAS)
- Big-bang refactoring (0 tests automatisés)
- Modification engine.js sans validation métier Legallais
- Ajouter .canal à finalData

---

## Total effort V3

| | Effort | Bloquant |
|---|---|---|
| Fix F1 (articleCanalCA) | ~2h | Oui — prérequis |
| D (Saisonnière MVP) | ~3h | Non |
| C (Canal Global MVP) | ~4h | Dépend F1 |
| B (Commerciale MVP) | ~4h | Dépend C |
| A (Période MVP scopé) | ~3h | En dernier |
| **Total V3** | **~16h** | |
