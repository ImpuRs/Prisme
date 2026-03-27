# /octo:debate — Filtre canal global dans la sidebar Le Terrain (PRISME)

> Généré le 2026-03-27

---

```
/octo:debate

# PRISME — Filtre canal global dans la sidebar Le Terrain

## Contexte PRISME
PRISME est un outil BI d'analyse de stocks pour distribution B2B (Quincaillerie Legallais).
C'est un fichier HTML statique + modules JS chargés via <script src>, sans bundler, sans framework,
sans backend. Il tourne en local ou dans une iframe Google Apps Script.

L'outil ingère jusqu'à 4 fichiers :
- Consommé (BL magasin) → source des ventes comptoir + canal agence
- État du Stock → référentiel articles
- Le Terrain (BL Qlik omnicanal, optionnel) → fichier BL toutes agences + tous canaux
- Zone de Chalandise (export Qlik clients, optionnel) → clients du bassin

## Architecture actuelle — données canal

### 1. `_S.canalAgence` (source : Consommé)
Agrégé à la lecture du fichier Consommé, par agence sélectionnée uniquement.
```js
// js/state.js
_S.canalAgence = {};
// Peuplé ligne par ligne dans processData() :
// canalAgence[canal] = { bl: Set(numéros BL), ca, caP, caE }
// Canaux : MAGASIN | INTERNET | REPRESENTANT | DCS | AUTRE
```

Seuls les canaux INTERNET, REPRESENTANT, DCS passent dans `_S.ventesClientHorsMagasin`
(Map clientCode → Map articleCode → {canal, ca, count}).
Le canal MAGASIN alimente `_S.finalData` (le dataset articles principal).

### 2. `_S.territoireLines` (source : BL Qlik — fichier Territoire)
Chaque ligne du BL omnicanal contient :
```js
// js/parser.js — parseTerritoireFile() via Web Worker (_terrWorker)
lines.push({
  code, libelle, direction, secteur, famille,
  bl, ca,
  canal,          // ← présent sur chaque ligne : 'MAGASIN'|'INTERNET'|'REPRESENTANT'|'DCS'
  rayonStatus,    // 'green'|'yellow'|'red'
  clientCode, clientNom, clientType,
  isSpecial       // articles non stockables (code ≠ 6 chiffres)
});
// Parser : terrDirData[dir].caMag += ln.ca si canal === 'MAGASIN', else caExt
```

### 3. Filtres existants dans la sidebar Le Terrain
```html
<!-- index.html — div#filterGroupTerritoire -->
<input id="terrSearch" oninput="renderTerritoireTab()" />         <!-- texte libre -->
<select id="terrFilterDir" onchange="renderTerritoireTab()" />    <!-- Direction commerciale -->
<select id="terrFilterRayon" onchange="renderTerritoireTab()" />  <!-- ✅/⚠️/❌ rayon status -->
<!-- + Secteur checkboxes buildSecteurCheckboxes() -->
<!-- + terrClientSearch : recherche client texte libre -->
<!-- + cross-filter buttons : fidèles / potentiels / captés (nécessite chalandise) -->
<!-- + filtre métier chalandise -->
```

**Aucun filtre canal n'existe aujourd'hui.**

### 4. Boucle de filtrage centrale dans renderTerritoireTab()
```js
// js/main.js — renderTerritoireTab()
const linesFiltered = _S.territoireLines.filter(l => {
  if (l.isSpecial) return false;
  if (filterDir && l.direction !== filterDir) return false;
  if (filterRayon && l.rayonStatus !== filterRayon) return false;
  if (selectedSecteurs && l.secteur && !selectedSecteurs.has(l.secteur)) return false;
  if (q) { const h = (l.code+' '+l.libelle+' '+l.direction).toLowerCase(); ... }
  return true;
});
// → alimente : Direction table, Top 100, Clients table, couverture rayon
```

### 5. buildTerrContrib() — Contributeurs agence (VOLET 2bis)
```js
// js/main.js — buildTerrContrib()
function buildTerrContrib() {
  _S.terrContribBySecteur = new Map();
  _S.terrContribByDirection = new Map();
  for (const l of _S.territoireLines) {   // ← itère TOUT, sans filtre canal
    if (!l.secteur) continue;
    // agrège : blTerr / blAgence (via blConsommeSet) / ca / clients
    s.blTerr.add(l.bl);
    if (_S.blConsommeSet.has(l.bl)) s.blAgence.add(l.bl);
    s.ca += l.ca;
  }
}
// Le ratio "% BL agence" = blAgence.size / blTerr.size
// C'est le % des BL Legallais qui passent par votre comptoir
```

### 6. renderCanalAgence() — bloc informatif uniquement (pas un filtre)
```js
// js/main.js — renderCanalAgence()
// Lit _S.canalAgence (source : Consommé uniquement)
// Affiche : canal | Prélevé | Enlevé | Total CA | % | barre
// Cliquable → openCanalDrill(canal) → détail par famille
// Ce bloc N'utilise PAS territoireLines
const CANAL_ORDER = ['MAGASIN','REPRESENTANT','INTERNET','DCS','AUTRE'];
const CANAL_LABELS = { MAGASIN:'🏪 Magasin', INTERNET:'🌐 Web', DCS:'🏢 DCS',
                       REPRESENTANT:'🤝 Représentant', AUTRE:'📦 Autre' };
```

### 7. Résumé omnicanalité dans le cockpit
```js
// js/main.js — section cockpit
const caMag  = _S.canalAgence['MAGASIN']?.ca || 0;
const caWeb  = _S.canalAgence['INTERNET']?.ca || 0;
const caRep  = _S.canalAgence['REPRESENTANT']?.ca || 0;
const caDcs  = _S.canalAgence['DCS']?.ca || 0;
// → calcule pctHorsAgence pour l'exec summary
// Source : Consommé uniquement (pas Le Terrain)
```

---

## QUESTION CENTRALE DU DÉBAT

**Faut-il ajouter un filtre canal global dans la sidebar Le Terrain de PRISME,
et si oui, comment l'implémenter sans créer de confusion métier ni de régressions
sur les métriques qui ne doivent pas être filtrées par canal ?**

---

## Les 4 axes à débattre

### AXE 1 — ARCHITECTURE : propagation du filtre

Le terrain a 2 sources de données distinctes :
- `territoireLines` (BL Qlik) → possède `.canal` sur chaque ligne → **filtrable**
- `canalAgence` (Consommé) → agrégé AVANT le rendu → **non re-filtrable à chaud**

Questions ouvertes :
- Un filtre canal sur `linesFiltered` suffit-il, ou faut-il aussi filtrer `buildTerrContrib()` ?
- Si on filtre `buildTerrContrib()` par canal, le ratio `blAgence/blTerr` change de sens :
  on mesure "% BL comptoir parmi les BL WEB" — est-ce encore pertinent ?
- Quel état global ? `_S._selectedTerrCanal` dans state.js ? Param URL ? Cookie ?
  (localStorage interdit dans l'iframe GAS)
- Faut-il recalculer `buildTerrContrib()` à chaque changement de filtre canal
  (coûteux sur 50k+ lignes) ou pré-agréger par canal ?
- Les sections suivantes doivent-elles respecter le filtre ou l'ignorer ?
  - `renderCanalAgence()` → bloc INFORMATIONNEL sur répartition canal, le filtrer serait circulaire
  - `renderTerrCroisementSummary()` → métriques croisées territoire × agence
  - `renderExecSummary()` cockpit → résumé exécutif multi-sources
  - `computeBenchmark()` → compare magasins réseau, source Consommé, pas territoireLines
  - Cross-filter fidèles/potentiels/captés → basé sur ventesClientArticle (MAGASIN only)
  - `_toggleClientArticles()` → drilldown client → section "achats hors comptoir" filtrée ou non ?

### AXE 2 — UX : placement et signal visuel

La sidebar Le Terrain contient déjà 6 types de filtres (texte, direction, rayon, secteur,
client, métier) + les boutons cross-filter (fidèles/potentiels/captés).

Questions ouvertes :
- Où placer le filtre canal dans `#terrFiltersBlock` ? En haut (impact fort) ou en bas
  (contexte secondaire) ? Sous forme de select, de boutons radio, ou de chips cliquables ?
- Comment signaler qu'un filtre canal est actif sur TOUTE la vue ?
  Badge dans le titre de l'onglet ? Bandeau sticky orange (comme l'alerte période < 10 mois) ?
  Pastille sur le bouton de l'onglet Le Terrain ?
- Quand l'utilisateur filtre sur INTERNET, les KPI affichent un CA Terrain réduit,
  la couverture rayon change, le Top 100 change — comment éviter qu'il pense
  que ce sont les vraies métriques de l'agence ?
- Gestion des combinaisons : filtre canal INTERNET + filtre client "Potentiels"
  (clients hors zone qui achètent en ligne) — est-ce une combinaison cohérente
  ou un piège analytique ?
- Faut-il désactiver certains filtres quand un canal incompatible est sélectionné
  (ex : filtre MAGASIN + cross-filter "Ext. pur" = zéro résultat garanti) ?

### AXE 3 — VALEUR MÉTIER

Cas d'usage identifiés :
- **Représentant commercial** : voir uniquement son canal REPRESENTANT → quels clients
  dans sa zone achètent via lui, quelles familles manquent en rayon pour son portefeuille
- **Responsable web** : canal INTERNET → identifier les articles TOP web absents du rayon
  (rayonStatus = red/yellow pour les top CA web)
- **Chef de rayon** : canal MAGASIN uniquement → vue "pure comptoir" sans bruit des
  commandes web ou représentant → couverture rayon et top 100 plus représentatifs
  de l'activité physique

Questions ouvertes :
- Le cas "représentant" est-il réaliste ? Le filtre secteur couvre déjà le portefeuille
  géographique — le filtre canal REPRESENTANT ajoute-t-il vraiment de la valeur ?
- La couverture rayon Top 100 filtrée par INTERNET a-t-elle un sens ?
  (rayonStatus vient du stock physique, pas du canal d'achat)
- Quelles sections perdent totalement leur sens avec un filtre canal ?
  - Contributeurs agence (% BL agence / territoire = métrique canal-agnostique)
  - Résumé croisement (compte les BL qui passent en agence — filtrer par canal
    revient à compter les BL d'un seul canal qui passent aussi en agence... confusion assurée)
- Risque de double-comptage ou de confusion : si l'utilisateur filtre MAGASIN
  sur Le Terrain ET regarde le bloc "Canal agence" (source Consommé), il voit
  deux définitions de "MAGASIN" provenant de deux fichiers distincts

### AXE 4 — IMPLÉMENTATION : complexité et risques

Estimation actuelle :
- `territoireLines` contient `.canal` → le filtre dans `linesFiltered` est **trivial** (1 ligne)
- `buildTerrContrib()` itère `_S.territoireLines` directement → il faudrait le refactoriser
  pour accepter un sous-ensemble filtré, ou le rappeler à chaque changement de filtre
- `renderTerritoireTab()` appelle `buildTerrContrib()` puis `renderTerrContrib()` → OK
- Risque principal : `buildTerrContrib()` peuple `_S.terrContribBySecteur` et
  `_S.terrContribByDirection` (état global mutable) — si on filtre ici, le lazy-load
  des secteurs/clients utilise ces Maps filtrées → comportement cohérent
  MAIS si l'utilisateur change le filtre sans re-render, les Maps sont périmées

```js
// Exemple : filtre canal dans linesFiltered (trivial)
const selectedCanal = _S._selectedTerrCanal || '';
const linesFiltered = _S.territoireLines.filter(l => {
  if (l.isSpecial) return false;
  if (selectedCanal && l.canal !== selectedCanal) return false;  // ← 1 ligne
  // ... filtres existants
  return true;
});

// Problème : buildTerrContrib() n'utilise PAS linesFiltered
// Il re-itère _S.territoireLines entier
// → Il faudrait lui passer linesFiltered en paramètre
function buildTerrContrib(lines = _S.territoireLines) { ... }
```

Questions ouvertes :
- Ordre d'implémentation recommandé : commencer par le filtre dans `linesFiltered` seul
  (impact visible immédiat sur Direction/Top100/Clients) avant de toucher `buildTerrContrib` ?
- Faut-il un feature flag (`_S._terrCanalFilterEnabled`) pour pouvoir rollback facilement ?
- Tests manuels minimaux à prévoir :
  1. Filtre INTERNET → Top 100 articles web, KPI CA, couverture rayon cohérente ?
  2. Filtre MAGASIN → même résultat qu'avant l'intro du filtre (régression zéro) ?
  3. Filtre canal + filtre secteur → combinaison fonctionnelle ?
  4. Reset filtre canal → retour état initial exact ?
  5. Changement d'onglet et retour → filtre canal préservé ou réinitialisé ?
- Quel impact sur `exportTerritoireCSV()` ?
  Doit-il exporter les données filtrées ou toujours toutes les lignes ?

---

## Contraintes techniques à respecter

1. Pas de localStorage (bloqué dans l'iframe GAS) → état en mémoire uniquement (`_S`)
2. Pas de rebuild/bundler → le filtre doit fonctionner avec `<script src>` classique
3. DOM manipulé via innerHTML sur 50k+ lignes → pas de re-render complet à chaque tick
4. Web Worker territoire (`_terrWorker`) parse le fichier une seule fois au chargement —
   le filtre canal est côté rendu, pas côté parsing
5. `yieldToMain()` doit être utilisé si le re-filtrage est coûteux (CHUNK_SIZE = 5000)

---

## Résumé des tensions architecturales

| Section | Source données | `.canal` dispo ? | Doit être filtrée ? |
|---------|---------------|-----------------|---------------------|
| Direction table | territoireLines | ✅ | Débat |
| Top 100 | territoireLines | ✅ | Débat |
| Clients table | territoireLines | ✅ | Débat |
| KPI CA Total | territoireLines | ✅ | Débat (KPI change de sens) |
| Couverture rayon | territoireLines | ✅ | ⚠️ Risque confusion (rayon ≠ canal) |
| Contributeurs agence | territoireLines | ✅ | ❌ Ratio blAgence/blTerr perd son sens |
| Résumé croisement | blSetAll/territoireLines | ✅ | ❌ Métriques croisées canal-agnostiques |
| Canal agence block | canalAgence (Consommé) | ❌ agrégé | ❌ Circulaire |
| Benchmark réseau | ventesParMagasin | ❌ | ❌ Source différente |
| Cross-filter fidèles | ventesClientArticle | ❌ MAGASIN only | ❌ Déjà canal-specific |
| Cockpit exec summary | multi-sources | partiel | ❌ Vue synthétique globale |
```
