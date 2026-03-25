# SPRINT A — Quick Wins Débat V3.1
# Claude Code : exécuter les 5 étapes dans l'ordre. Un commit par étape.
# Branche : claude/sprint-a-quickwins

---

## CONTEXTE

Résultat du débat multi-agents PRISME V3.1. Ce sprint contient les 5 quick wins (effort S chacun) identifiés par consensus.
Lire CLAUDE.md pour le contexte projet complet.

## RÈGLE ABSOLUE
- Ne JAMAIS modifier les règles métier existantes sauf indication explicite
- Le garde-fou `ceil(V/6)` existant dans MIN/MAX est CONSERVÉ
- Tester visuellement après chaque commit

---

## ÉTAPE A1 — Debounce 300ms filtres texte

### Quoi
Les filtres texte de recherche (recherche article, recherche client Promo, recherche client Terrain) déclenchent un render complet à chaque frappe. Ajouter un debounce de 300ms.

### Comment
Dans `js/ui.js`, il existe déjà `debouncedRender()` avec un timer de 250ms pour le tableau Articles. Appliquer le même pattern aux autres inputs texte :

1. Chercher dans `index.html` les `oninput` liés à des recherches texte :
   - `promoSearchInput` → `_onPromoInput()` (déjà debounced 300ms dans main.js via `_promoSuggestTimer` — VÉRIFIER, ne pas doubler)
   - `terrClientSearch` → `_onTerrClientSearch()` — AJOUTER debounce
   - `cmdInput` → command palette — GARDER sans debounce (besoin de réactivité immédiate)

2. Dans `js/main.js`, chercher `_onTerrClientSearch` et ajouter un debounce :
   ```js
   let _terrSearchTimer = null;
   function _onTerrClientSearch() {
     clearTimeout(_terrSearchTimer);
     _terrSearchTimer = setTimeout(() => { /* logique existante */ }, 300);
   }
   ```

3. Vérifier que `_onPromoInput` dans main.js a déjà un timer (il devrait via `_promoSuggestTimer`). Si oui, ne rien changer.

### Commit
```bash
git add -A && git commit -m "A1: debounce 300ms on terrain client search input"
```

---

## ÉTAPE A2 — Matrice Service ABC/FMR → SECURITY_DAYS variable

### Quoi
Remplacer `SECURITY_DAYS = 3` (fixe) par un SECURITY_DAYS dynamique selon la catégorie ABC/FMR de l'article. Les pépites (AF) ont plus de stock de sécurité, les candidats déréf (CR) ont moins.

### Problème d'ordre
ABC/FMR est calculé APRÈS les MIN/MAX dans le pipeline actuel (`computeABCFMR` en ligne ~1236, MIN/MAX en ligne ~1217). On ne peut pas utiliser `r.abcClass` au moment du calcul MIN/MAX car il n'existe pas encore.

### Solution
Au moment du calcul MIN/MAX, on connaît déjà `W` (fréquence = proxy FMR) et `V * prixUnitaire` (valeur rotation = proxy ABC). On peut faire un pré-calcul FMR inline et utiliser un proxy ABC simplifié.

Mais en pratique, **FMR seul suffit** pour moduler SECURITY_DAYS (c'est la fréquence qui détermine le risque de rupture, pas la valeur) :

```
F (W ≥ 12) → SECURITY_DAYS = 4  (fréquent = risque de rupture élevé)
M (W 4-11) → SECURITY_DAYS = 3  (standard, inchangé)
R (W ≤ 3)  → SECURITY_DAYS = 2  (rare = stock minimum suffit)
```

Pour les articles à prix élevé (HIGH_PRICE), on réduit encore : R + prix élevé → SECURITY_DAYS = 1.

### Comment

1. Dans `js/constants.js`, garder `SECURITY_DAYS = 3` comme valeur par défaut (backward compat).

2. Dans `js/main.js`, dans le bloc `else{` du calcul MIN/MAX (ligne ~1217), remplacer la référence fixe `SECURITY_DAYS` par un calcul inline :

Chercher la ligne :
```js
else{const dlR=(T>3*U)?3*U:T;const dl=Math.min(dlR,U*5);nouveauMin=Math.max(Math.min(Math.round(dl+(X*SECURITY_DAYS)),Math.ceil(V/6)),1);
```

Remplacer par :
```js
else{const dlR=(T>3*U)?3*U:T;const dl=Math.min(dlR,U*5);const secDays=Wp>=12?4:Wp>=4?3:(prixUnitaire>HIGH_PRICE?1:2);nouveauMin=Math.max(Math.min(Math.round(dl+(X*secDays)),Math.ceil(V/6)),1);
```

C'est une seule ligne modifiée. `Wp` (nombre de BL prélevé) est le proxy direct de FMR.

3. **Garde-fou critique** (contre-argument Opus) : le `Math.max(..., Math.ceil(V/6), 1)` existant garantit déjà qu'un article actif n'aura jamais un MIN à 0. NE PAS supprimer ce garde-fou.

4. Ajouter le même calcul `secDays` dans la ligne ~3354 de main.js (préconisation MIN/MAX réseau dans le diagnostic benchmark) :
Chercher `X*SECURITY_DAYS` dans cette zone et remplacer par le même `secDays` inline.

5. **NE PAS** modifier le `SECURITY_DAYS` dans constants.js — il reste comme constante legacy. Le nouveau calcul inline le remplace dans les 2 endroits où il est utilisé.

### Commit
```bash
git add -A && git commit -m "A2: P2.1 — SECURITY_DAYS variable by FMR frequency (F=4d, M=3d, R=2d)"
```

---

## ÉTAPE A3 — Index clientsByMetier dans processData()

### Quoi
Créer un index `Map<metier, Set<clientCode>>` construit une fois après le parsing chalandise. Évite les O(n) scans sur `chalandiseData` à chaque filtre métier.

### Comment

1. Dans `js/state.js`, ajouter dans la section des déclarations :
```js
_S.clientsByMetier = new Map();
```

Et dans `resetAppState()` :
```js
_S.clientsByMetier = new Map();
```

2. Dans `js/main.js`, chercher l'endroit où `chalandiseData` est peuplé — c'est dans `parseChalandise()` dans `js/parser.js`. Après le parsing complet de la chalandise, ajouter la construction de l'index.

Chercher dans `js/parser.js` la fin de `parseChalandise` (là où `_S.chalandiseReady = true`). Juste avant cette ligne, ajouter :

```js
// Build metier index
_S.clientsByMetier.clear();
for (const [cc, info] of _S.chalandiseData.entries()) {
  if (!info.metier) continue;
  if (!_S.clientsByMetier.has(info.metier)) _S.clientsByMetier.set(info.metier, new Set());
  _S.clientsByMetier.get(info.metier).add(cc);
}
```

3. Aussi construire `clientsByCommercial` tant qu'on y est (prérequis pour la future heatmap P4.2) :

Dans `js/state.js` :
```js
_S.clientsByCommercial = new Map();
```

Et dans `resetAppState()` idem.

Dans `parser.js` au même endroit :
```js
_S.clientsByCommercial.clear();
for (const [cc, info] of _S.chalandiseData.entries()) {
  if (!info.commercial) continue;
  if (!_S.clientsByCommercial.has(info.commercial)) _S.clientsByCommercial.set(info.commercial, new Set());
  _S.clientsByCommercial.get(info.commercial).add(cc);
}
```

### Commit
```bash
git add -A && git commit -m "A3: index clientsByMetier + clientsByCommercial in chalandise parsing"
```

---

## ÉTAPE A4 — Fantômes de rayon (croisement Set)

### Quoi
Articles en stock (stockActuel > 0, ancienMin > 0) mais JAMAIS commandés par aucun client du territoire. Ce sont les "fantômes de rayon" — ils occupent de la place et du capital pour rien.

### Comment

1. Dans `js/main.js`, après le parsing territoire (chercher `renderTerritoireTab` ou la fin de `launchTerritoireWorker`), ajouter le calcul :

```js
// A4: Fantômes de rayon — en stock mais absents du territoire
function computePhantomArticles() {
  if (!_S.territoireReady || !_S.finalData.length) return;
  const terrCodes = new Set(_S.territoireLines.map(l => l.code));
  _S.phantomArticles = _S.finalData.filter(r =>
    r.stockActuel > 0 && r.ancienMin > 0 && !r.isParent && /^\d{6}$/.test(r.code) && !terrCodes.has(r.code)
  ).sort((a, b) => (b.stockActuel * b.prixUnitaire) - (a.stockActuel * a.prixUnitaire));
}
```

2. Dans `js/state.js`, ajouter :
```js
_S.phantomArticles = [];
```

3. Appeler `computePhantomArticles()` à la fin du chargement territoire (après `renderTerritoireTab()` dans main.js).

4. Afficher dans l'onglet Stock ou Cockpit — ajouter un raccourci "Accès rapide" dans la section shortcuts du cockpit ou du stock. Créer une card :

Chercher les shortcut-cards existantes dans `index.html` (fantômes, dormants, fins, top20, etc.). Ajouter une 6ème card après la dernière :

```html
<div class="shortcut-card" onclick="showCockpitInTable('phantom')" style="border-left-color:#a78bfa">
  <div class="flex items-center gap-2">
    <span class="text-lg">👻</span>
    <div>
      <p class="font-bold text-sm t-primary">Fantômes de rayon</p>
      <p class="text-[10px] t-tertiary">En stock, jamais vendus sur le territoire</p>
    </div>
  </div>
  <p id="shortcutPhantomCount" class="font-extrabold text-sm mt-1" style="color:#a78bfa">—</p>
</div>
```

5. Dans la fonction qui peuple les compteurs des shortcuts (chercher `shortcutDormantCount` ou similaire), ajouter :
```js
const phantomEl = document.getElementById('shortcutPhantomCount');
if (phantomEl) phantomEl.textContent = _S.phantomArticles.length + ' art. · ' + formatEuro(_S.phantomArticles.reduce((s,r) => s + r.stockActuel * r.prixUnitaire, 0));
```

6. Dans `showCockpitInTable`, ajouter le cas `'phantom'` :
```js
if (type === 'phantom') { codes = new Set(_S.phantomArticles.map(r => r.code)); label = '👻 Fantômes de rayon'; }
```

### Commit
```bash
git add -A && git commit -m "A4: P4.5 — phantom articles (in stock but never sold on territory)"
```

---

## ÉTAPE A5 — Alertes inline clients + Cohorte reconquête

### Quoi
Deux mini-features complémentaires :
1. **Badges alertes inline** : dans le cockpit client (Le Terrain), ajouter jusqu'à 2 badges contextuels par client : `⏰ Inactif Xj` et `📦 Rupture famille`
2. **Cohorte reconquête** : identifier les clients perdus (>6 mois sans commande) ayant un historique CA significatif, avec un score de priorité

### Comment — Badges inline

1. Dans `js/main.js`, chercher la fonction qui rend les cartes client dans le cockpit client (Le Terrain). C'est probablement `renderBlock` ou la boucle qui génère les `cockpit-card-{code}`.

2. Pour chaque client rendu, calculer les badges :

```js
function _clientBadges(cc) {
  let badges = '';
  // Badge inactif
  const lastOrder = _S.clientLastOrder.get(cc);
  if (lastOrder) {
    const daysAgo = Math.round((new Date() - lastOrder) / 86400000);
    if (daysAgo > 60) badges += `<span class="text-[9px] font-bold px-1.5 py-0.5 rounded-full i-caution-bg c-caution">⏰ ${daysAgo}j</span> `;
  }
  // Badge rupture famille
  const artMap = _S.ventesClientArticle.get(cc);
  if (artMap && _S.cockpitLists.ruptures.size > 0) {
    for (const code of artMap.keys()) {
      if (_S.cockpitLists.ruptures.has(code)) {
        badges += `<span class="text-[9px] font-bold px-1.5 py-0.5 rounded-full i-danger-bg c-danger">📦 Rupture</span> `;
        break;
      }
    }
  }
  return badges;
}
```

3. Insérer `${_clientBadges(c.code)}` ou `${_clientBadges(c.cc)}` dans le template HTML de chaque carte client, après le nom du client.

### Comment — Cohorte reconquête

1. Dans `js/engine.js`, ajouter :

```js
export function computeReconquestCohort() {
  if (!_S.chalandiseReady || !_S.clientLastOrder.size) { _S.reconquestCohort = []; return; }
  const now = new Date();
  const SIX_MONTHS = 180 * 86400000;
  const cohort = [];
  for (const [cc, lastDate] of _S.clientLastOrder.entries()) {
    if ((now - lastDate) < SIX_MONTHS) continue;
    const info = _S.chalandiseData.get(cc);
    if (!info) continue;
    const artMap = _S.ventesClientArticle.get(cc);
    if (!artMap || artMap.size === 0) continue;
    const totalCA = [...artMap.values()].reduce((s, d) => s + (d.sumCA || 0), 0);
    if (totalCA < 500) continue; // seuil minimum : 500€ de CA historique
    const nbFamilles = new Set([...artMap.keys()].map(code => _S.articleFamille[code]).filter(Boolean)).size;
    const daysAgo = Math.round((now - lastDate) / 86400000);
    const score = Math.round(totalCA * (nbFamilles / 5) * (180 / daysAgo)); // CA × diversité × recence inversée
    cohort.push({ cc, nom: info.nom || cc, metier: info.metier || '', commercial: info.commercial || '', totalCA, nbFamilles, daysAgo, score });
  }
  cohort.sort((a, b) => b.score - a.score);
  _S.reconquestCohort = cohort;
}
```

2. Dans `js/state.js`, ajouter :
```js
_S.reconquestCohort = [];
```

3. Appeler `computeReconquestCohort()` après `computeClientCrossing()` dans `processData()`.

4. Importer `computeReconquestCohort` dans main.js depuis engine.js.

5. Ajouter à `window` exports : `window.computeReconquestCohort = computeReconquestCohort;`

6. Affichage : pour cette V1, la cohorte reconquête enrichit les badges P3.5 (un client de la cohorte reçoit un badge `🔄 Reconquête` dans le cockpit client). L'affichage dédié viendra en Sprint B.

### Commit
```bash
git add -A && git commit -m "A5: P3.5+P4.6 — client inline badges (inactive/rupture) + reconquest cohort scoring"
```

---

## VÉRIFICATION FINALE

```bash
# Vérifier que SECURITY_DAYS est maintenant variable
grep -n 'secDays\|SECURITY_DAYS' js/main.js js/constants.js

# Vérifier les nouveaux index
grep -n 'clientsByMetier\|clientsByCommercial\|phantomArticles\|reconquestCohort' js/state.js

# Vérifier les badges
grep -n '_clientBadges' js/main.js

# Ouvrir PRISME, charger les fichiers, vérifier :
# 1. Onglet Cockpit → les MIN/MAX ont changé pour certains articles (AF avec plus, CR avec moins)
# 2. Onglet Stock → nouvelle card "Fantômes de rayon" dans les raccourcis
# 3. Le Terrain → badges ⏰ et 📦 sur les clients concernés
```

---

## RAPPELS
- NE PAS modifier la logique de parseChalandise au-delà de l'ajout des index
- NE PAS toucher aux calculs de benchmark
- Le garde-fou ceil(V/6) dans MIN/MAX est SACRÉ — ne jamais le retirer
- Les fantômes de rayon ne s'affichent que si le territoire est chargé
- La cohorte reconquête ne s'affiche que si la chalandise est chargée
