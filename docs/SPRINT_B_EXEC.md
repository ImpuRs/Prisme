# SPRINT B — Impact majeur (Débat V3.1)
# Claude Code : exécuter les 4 étapes dans l'ordre. Un commit par étape.
# Branche : claude/sprint-b-impact

---

## CONTEXTE

Sprint A terminé (SECURITY_DAYS variable, index clientsByMetier, fantômes de rayon, badges inline, cohorte reconquête). Ce sprint ajoute les 4 features majeures identifiées par le débat multi-agents.

Lire CLAUDE.md pour le contexte projet.

## RÈGLES
- Garder le pipeline existant — pas de refactoring structurel
- Le Web Worker suit le pattern établi par `_terrWorker()` dans parser.js
- Le SPC réutilise la logique de `_clientUrgencyScore()` dans engine.js
- Le moteur saisonnier est un calcul O(n) dans la boucle consommé existante
- Tester visuellement après chaque commit

---

## ÉTAPE B1 — Web Worker pour agrégation ventesClientArticle

### Problème
Le peuplement de `ventesClientArticle`, `articleClients`, `clientArticles`, `clientLastOrder` et `clientNomLookup` se fait dans la boucle consommé synchrone (lignes ~1119-1165 de main.js). Sur PC bureau avec chalandise 23k, ça bloque l'UI ~30s.

### Solution
**NON — ne pas déplacer dans un Worker.** Après relecture, le peuplement de `ventesClientArticle` est DANS la boucle principale du consommé qui peuple aussi `articleRaw`, `ventesParMagasin`, `blData`, `canalAgence` etc. Extraire juste `ventesClientArticle` dans un Worker nécessiterait de reparcourir tout le consommé une 2ème fois → pas de gain.

**Alternative retenue : Pré-calcul agrégats clients en arrière-plan APRÈS processData()**

Au lieu de déplacer le parsing dans un Worker, on déplace les **calculs lourds qui en dépendent** dans un Worker post-chargement :
- `computeClientCrossing()` (croisement chalandise × PDV)
- `computeReconquestCohort()` (cohorte reconquête)
- Pré-agrégation des données Promo (CA par client×famille, clients par métier×famille)

### Comment

1. Dans `js/parser.js`, créer une nouvelle fonction Worker inline (comme `_terrWorker`) :

```js
export function _clientWorker() {
  // Ce code s'exécute dans le Worker
  self.onmessage = function(e) {
    const { ventesCA, chalandise, articleFamille, clientLastOrder } = e.data;
    // ventesCA = Map serialisé en Array : [[cc, [[code, {sumCA, countBL}], ...]], ...]
    // chalandise = Array : [[cc, {metier, statut, ...}], ...]

    // 1. Client×Famille aggregation pour SPC
    const clientFamCA = {}; // cc → {fam → caTotal}
    for (const [cc, articles] of ventesCA) {
      clientFamCA[cc] = {};
      for (const [code, data] of articles) {
        const fam = articleFamille[code] || '';
        if (fam) clientFamCA[cc][fam] = (clientFamCA[cc][fam] || 0) + (data.sumCA || 0);
      }
    }

    // 2. Métier×Famille benchmark (quelles familles achètent les clients de chaque métier)
    const metierFamBench = {}; // metier → {fam → {nbClients, totalCA}}
    for (const [cc, info] of chalandise) {
      if (!info.metier) continue;
      const fams = clientFamCA[cc];
      if (!fams) continue;
      if (!metierFamBench[info.metier]) metierFamBench[info.metier] = {};
      for (const [fam, ca] of Object.entries(fams)) {
        if (!metierFamBench[info.metier][fam]) metierFamBench[info.metier][fam] = { nbClients: 0, totalCA: 0 };
        metierFamBench[info.metier][fam].nbClients++;
        metierFamBench[info.metier][fam].totalCA += ca;
      }
    }

    self.postMessage({ clientFamCA, metierFamBench });
  };
}
```

2. Créer une fonction launcher :

```js
export function launchClientWorker(progressCb) {
  return new Promise((resolve, reject) => {
    try {
      const code = `(${_clientWorker.toString()})()`;
      const blob = new Blob([code], { type: 'application/javascript' });
      const url = URL.createObjectURL(blob);
      const worker = new Worker(url);

      // Sérialiser les Maps pour le Worker
      const ventesCA = [];
      for (const [cc, artMap] of _S.ventesClientArticle.entries()) {
        const arts = [];
        for (const [code, data] of artMap.entries()) arts.push([code, data]);
        ventesCA.push([cc, arts]);
      }
      const chalandise = [];
      for (const [cc, info] of _S.chalandiseData.entries()) {
        chalandise.push([cc, { metier: info.metier, statut: info.statut, classification: info.classification, ca2025: info.ca2025 }]);
      }

      worker.onmessage = (e) => {
        _S.clientFamCA = e.data.clientFamCA;
        _S.metierFamBench = e.data.metierFamBench;
        worker.terminate();
        URL.revokeObjectURL(url);
        if (progressCb) progressCb(100);
        resolve();
      };
      worker.onerror = (err) => { worker.terminate(); URL.revokeObjectURL(url); reject(err); };
      worker.postMessage({ ventesCA, chalandise, articleFamille: _S.articleFamille, clientLastOrder: {} });
      if (progressCb) progressCb(10);
    } catch (err) { reject(err); }
  });
}
```

3. Dans `js/state.js`, ajouter :
```js
_S.clientFamCA = {};       // cc → {fam → caTotal}
_S.metierFamBench = {};    // metier → {fam → {nbClients, totalCA}}
```
Et dans `resetAppState()` idem.

4. Dans `js/main.js`, après `computeReconquestCohort()` (fin de processData), lancer le Worker si chalandise chargée :
```js
if (_S.chalandiseReady && _S.ventesClientArticle.size > 0) {
  launchClientWorker().then(() => {
    showToast('📊 Agrégats clients calculés', 'success');
  }).catch(err => console.warn('Client worker error:', err));
}
```

5. Importer `launchClientWorker, _clientWorker` dans main.js depuis parser.js.

### Commit
```bash
git add -A && git commit -m "B1: client aggregation Worker — clientFamCA + metierFamBench background calc"
```

---

## ÉTAPE B2 — Score Potentiel Client (SPC)

### Quoi
Score 0-100 par client combinant : récence PDV, CA territoire hors comptoir, familles manquantes vs benchmark métier, statut chalandise. Tri par SPC dans Promo et Cockpit Client.

### Comment

1. Dans `js/engine.js`, ajouter :

```js
export function computeSPC(cc, info) {
  // Score de Potentiel Client — 0 à 100
  // Composantes : récence (30pts), CA rapatriable (30pts), diversité (20pts), profil (20pts)
  let score = 0;

  // 1. Récence dernière commande PDV (30 pts)
  const lastOrder = _S.clientLastOrder.get(cc);
  if (lastOrder) {
    const daysAgo = Math.round((new Date() - lastOrder) / 86400000);
    if (daysAgo <= 30) score += 30;       // très récent
    else if (daysAgo <= 90) score += 20;  // récent
    else if (daysAgo <= 180) score += 10; // ancien
    // >180j = 0 pts
  }

  // 2. CA rapatriable — CA Legallais hors PDV (30 pts)
  const caLeg = info.ca2025 || info.ca2026 || 0;
  const artMap = _S.ventesClientArticle.get(cc);
  const caPDV = artMap ? [...artMap.values()].reduce((s, d) => s + (d.sumCA || 0), 0) : 0;
  const caHorsPDV = Math.max(caLeg - caPDV, 0);
  if (caHorsPDV > 10000) score += 30;
  else if (caHorsPDV > 5000) score += 25;
  else if (caHorsPDV > 2000) score += 20;
  else if (caHorsPDV > 500) score += 15;
  else if (caHorsPDV > 0) score += 5;

  // 3. Diversité familles manquantes — via metierFamBench (20 pts)
  if (_S.metierFamBench && info.metier && _S.metierFamBench[info.metier]) {
    const metierFams = _S.metierFamBench[info.metier];
    const clientFams = _S.clientFamCA ? _S.clientFamCA[cc] || {} : {};
    const totalMetierFams = Object.keys(metierFams).length;
    const missingFams = Object.keys(metierFams).filter(f => !clientFams[f]).length;
    const missingRatio = totalMetierFams > 0 ? missingFams / totalMetierFams : 0;
    score += Math.round(missingRatio * 20); // plus il manque de familles, plus le potentiel est élevé
  }

  // 4. Profil chalandise (20 pts)
  const classif = _normalizeClassif(info.classification);
  if (classif === 'FID Pot+') score += 15;
  else if (classif === 'OCC Pot+') score += 10;
  else if (classif === 'FID Pot=') score += 8;
  if (_isMetierStrategique(info.metier)) score += 5;

  return Math.min(Math.round(score), 100);
}
```

2. Dans `js/main.js`, section Promo, dans `runPromoSearch()` — après la construction de `sectionA`, `sectionB`, `sectionC`, ajouter le SPC pour chaque client :

Pour chaque section, enrichir chaque élément avec le SPC :
```js
for (const c of sectionA) {
  const info = _S.chalandiseData.get(c.cc) || {};
  c.spc = computeSPC(c.cc, info);
}
// idem pour sectionB et sectionC
```

3. Dans `_renderPromoResults()`, trier par SPC décroissant par défaut au lieu de CA :
Chercher les `.sort((a,b) => b.ca - a.ca)` dans les sections → ajouter un tri par SPC si disponible :
```js
sectionA.sort((a, b) => (b.spc || 0) - (a.spc || 0));
```

4. Afficher le badge SPC dans chaque ligne client Promo :
Créer une fonction helper :
```js
function _spcBadge(spc) {
  if (spc == null) return '';
  const color = spc >= 70 ? 'c-danger font-extrabold' : spc >= 40 ? 'c-caution font-bold' : 't-disabled';
  return `<span class="text-[10px] ${color} ml-1" title="Score Potentiel Client">${spc}</span>`;
}
```

Injecter `${_spcBadge(c.spc)}` dans les templates HTML des cartes client Promo, après le nom du client.

5. Dans le Cockpit Client (Le Terrain), calculer et afficher aussi le SPC dans les cartes :
Dans la boucle de rendu des cartes client (`cockpit-card-{code}`), ajouter :
```js
const spc = computeSPC(c.code || c.cc, _S.chalandiseData.get(c.code || c.cc) || {});
```
Et afficher `${_spcBadge(spc)}` après le nom.

6. Importer `computeSPC` dans main.js depuis engine.js.
7. Ajouter `window.computeSPC = computeSPC;` aux exports.

### Commit
```bash
git add -A && git commit -m "B2: P3.1 — Score Potentiel Client (SPC) — scoring 0-100 + badges + tri Promo"
```

---

## ÉTAPE B3 — Moteur saisonnier unifié

### Quoi
Calculer un index de saisonnalité par article/famille à partir des dates BL du consommé. 2 usages : affichage ruban 12 cases (UI) + pondération X dans le calcul MIN/MAX (algo).

### Comment

1. **Collecte dans la boucle consommé** : dans `js/main.js`, dans la boucle consommé (lignes ~1125-1165), ajouter un compteur mensuel par article.

Avant la boucle, ajouter :
```js
const monthlySales = {}; // code → [0,0,0,...,0] (12 mois, index 0=jan)
```

Dans la boucle, après `if(dateV)` (vers ligne 1134), ajouter :
```js
if (dateV && code && (!_S.selectedMyStore || sk === _S.selectedMyStore) && qteP > 0) {
  if (!monthlySales[code]) monthlySales[code] = new Array(12).fill(0);
  monthlySales[code][dateV.getMonth()] += qteP;
}
```

2. **Agrégation par famille** : après la boucle consommé (après `updatePipeline('consomme','done')`), calculer l'index saisonnier par famille :

```js
// Moteur saisonnier — index par famille
const familyMonthly = {}; // famille → [12 mois somme quantités]
for (const [code, months] of Object.entries(monthlySales)) {
  const fam = _S.articleFamille[code];
  if (!fam) continue;
  if (!familyMonthly[fam]) familyMonthly[fam] = new Array(12).fill(0);
  for (let m = 0; m < 12; m++) familyMonthly[fam][m] += months[m];
}

_S.seasonalIndex = {}; // famille → [12 coefficients, moyenne = 1.0]
for (const [fam, months] of Object.entries(familyMonthly)) {
  const avg = months.reduce((s, v) => s + v, 0) / 12;
  if (avg <= 0) continue;
  _S.seasonalIndex[fam] = months.map(v => Math.round((v / avg) * 100) / 100);
}
_S.articleMonthlySales = monthlySales;
```

3. **Dans `js/state.js`**, ajouter :
```js
_S.seasonalIndex = {};          // famille → [12 coefficients]
_S.articleMonthlySales = {};    // code → [12 mois qtés]
```
Et dans `resetAppState()` idem.

4. **Affichage ruban saisonnier** : dans le rendu de la fiche article (si elle existe) ou dans le diagnostic famille, ajouter un helper :

```js
function _seasonRibbon(famille) {
  const idx = _S.seasonalIndex[famille];
  if (!idx) return '';
  const MONTHS = ['J','F','M','A','M','J','J','A','S','O','N','D'];
  const cells = idx.map((coeff, i) => {
    const bg = coeff >= 1.5 ? 'bg-emerald-500' : coeff >= 1.0 ? 'bg-emerald-300' : coeff >= 0.5 ? 'bg-amber-300' : 'bg-red-300';
    return `<div class="text-center" title="${MONTHS[i]}: ×${coeff}"><div class="text-[8px] t-disabled">${MONTHS[i]}</div><div class="w-5 h-3 rounded-sm ${bg}" style="opacity:${Math.max(0.3, Math.min(1, coeff))}"></div></div>`;
  }).join('');
  return `<div class="flex gap-0.5 items-end mt-1" title="Saisonnalité famille">${cells}</div>`;
}
```

5. **Intégrer dans le diagnostic** : dans `_diagLevel1` ou `_diagLevel2` (le diagnostic famille), ajouter le ruban saisonnier en en-tête du panneau si disponible. Chercher l'endroit où le nom de la famille est affiché dans le diagnostic et ajouter `${_seasonRibbon(famille)}` juste après.

6. **Intégrer dans le Radar** : dans les cartes recommandations par segment (la boucle `for(const key of['AF','AM','AR'...`), ne PAS ajouter le ruban ici (trop dense). Le garder pour le diagnostic et la fiche article seulement.

7. **NE PAS encore connecter à l'algo MIN/MAX** — la pondération de X par l'index saisonnier est un changement d'algo qui nécessite validation métier. Le moteur de calcul est prêt, la connexion viendra en Sprint C après validation.

### Commit
```bash
git add -A && git commit -m "B3: seasonal engine — monthly sales aggregation + family seasonal index + ribbon display"
```

---

## ÉTAPE B4 — Mode Action Promo

### Quoi
Toggle en haut de l'onglet Promo : "Mode Analyse" (layout actuel A→F) vs "Mode Action" (vue condensée : colonne gauche = top 10 clients triés par SPC + badges, colonne droite = articles à pitcher pour le client sélectionné).

### Comment

1. Dans `index.html`, dans le bloc `tabPromo` (ligne ~1554), ajouter un toggle au-dessus du header existant :

Chercher la div qui contient le titre "Promo — Ciblage et animation commerciale". Juste AVANT ce div, ajouter :

```html
<div class="flex items-center gap-3 mb-3">
  <button id="promoModeAnalyse" onclick="_setPromoMode('analyse')" class="text-xs font-bold py-1 px-3 rounded-full border transition-all">📊 Analyse</button>
  <button id="promoModeAction" onclick="_setPromoMode('action')" class="text-xs font-bold py-1 px-3 rounded-full border transition-all">⚡ Action</button>
</div>
<div id="promoActionView" class="hidden mb-4">
  <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
    <div>
      <h4 class="font-bold text-sm t-primary mb-2">📞 Top 10 — Qui appeler</h4>
      <div id="promoActionClients" class="space-y-2"></div>
    </div>
    <div>
      <h4 class="font-bold text-sm t-primary mb-2">🎯 Ce que j'emmène</h4>
      <div id="promoActionArticles" class="space-y-2"></div>
    </div>
  </div>
</div>
```

2. Dans `js/main.js`, ajouter les fonctions :

```js
let _promoMode = 'analyse';

function _setPromoMode(mode) {
  _promoMode = mode;
  const analyseBtn = document.getElementById('promoModeAnalyse');
  const actionBtn = document.getElementById('promoModeAction');
  const actionView = document.getElementById('promoActionView');

  // Toggle button styles
  if (analyseBtn) {
    analyseBtn.className = mode === 'analyse'
      ? 'text-xs font-bold py-1 px-3 rounded-full border c-action bg-c-action/10 border-blue-300'
      : 'text-xs font-bold py-1 px-3 rounded-full border t-disabled b-default';
  }
  if (actionBtn) {
    actionBtn.className = mode === 'action'
      ? 'text-xs font-bold py-1 px-3 rounded-full border c-danger bg-c-danger/10 border-red-300'
      : 'text-xs font-bold py-1 px-3 rounded-full border t-disabled b-default';
  }

  // Show/hide views
  if (actionView) actionView.classList.toggle('hidden', mode !== 'action');

  // Hide/show existing promo sections
  const existingSections = document.querySelectorAll('#tabPromo > div:not(:first-child):not(#promoActionView)');
  // Mieux : cibler les sections connues
  const promoHeader = document.querySelector('#tabPromo .bg-gradient-to-r'); // le header gradient
  const promoBody = promoHeader ? promoHeader.parentElement : null;
  // En mode action, cacher tout sauf le toggle et actionView
  document.querySelectorAll('#tabPromo .tab-content-section').forEach(el => {
    el.classList.toggle('hidden', mode === 'action');
  });

  if (mode === 'action') _renderPromoActionView();
}

function _renderPromoActionView() {
  const r = _promoLastResult;
  if (!r) {
    const el = document.getElementById('promoActionClients');
    if (el) el.innerHTML = '<p class="t-tertiary text-sm">Lancez d\'abord une recherche Promo pour voir les résultats en mode Action.</p>';
    return;
  }

  // Top 10 clients par SPC (merge sections A+B+C, dédoublonner)
  const allClients = new Map();
  for (const c of [...r.sectionA, ...r.sectionB, ...r.sectionC]) {
    if (!allClients.has(c.cc)) allClients.set(c.cc, c);
  }
  const ranked = [...allClients.values()]
    .map(c => ({ ...c, spc: c.spc || computeSPC(c.cc, _S.chalandiseData.get(c.cc) || {}) }))
    .sort((a, b) => b.spc - a.spc)
    .slice(0, 10);

  const clientsEl = document.getElementById('promoActionClients');
  if (clientsEl) {
    clientsEl.innerHTML = ranked.map((c, i) => {
      const info = _S.chalandiseData.get(c.cc) || {};
      const badges = typeof _clientBadges === 'function' ? _clientBadges(c.cc) : '';
      return `<div class="p-2 s-card rounded-lg border cursor-pointer hover:shadow-md transition-shadow" onclick="_showActionArticles('${c.cc}')">
        <div class="flex items-center gap-2">
          <span class="font-extrabold text-sm c-action">#${i + 1}</span>
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-1 flex-wrap">
              <span class="font-bold text-sm">${c.nom}</span>
              ${_spcBadge(c.spc)}
              ${badges}
            </div>
            <div class="text-[10px] t-tertiary">${info.metier || ''} ${info.commercial ? '· ' + info.commercial : ''} ${c.ca ? '· CA ' + formatEuro(c.ca) : ''}</div>
          </div>
        </div>
      </div>`;
    }).join('');
  }

  // Par défaut, montrer les articles du premier client
  if (ranked.length > 0) _showActionArticles(ranked[0].cc);
}

function _showActionArticles(cc) {
  const el = document.getElementById('promoActionArticles');
  if (!el) return;
  const r = _promoLastResult;
  if (!r) return;

  const info = _S.chalandiseData.get(cc) || {};
  const artMap = _S.ventesClientArticle.get(cc) || new Map();
  const clientFams = _S.clientFamCA ? _S.clientFamCA[cc] || {} : {};

  // Articles à pitcher : articles promo que ce client N'achète PAS encore au PDV
  const toPitch = [];
  for (const code of r.matchedCodes) {
    if (artMap.has(code)) continue; // déjà acheteur
    const ref = _S.finalData.find(d => d.code === code);
    const lib = _S.libelleLookup[code] || (ref ? ref.libelle : code);
    const stock = ref ? ref.stockActuel : null;
    const fam = _S.articleFamille[code] || '';
    toPitch.push({ code, lib, stock, fam });
  }

  // Trier : en stock d'abord, puis par famille pertinente pour le métier client
  toPitch.sort((a, b) => {
    if ((a.stock > 0) !== (b.stock > 0)) return (b.stock > 0) - (a.stock > 0);
    return a.lib.localeCompare(b.lib);
  });

  const nom = info.nom || _S.clientNomLookup[cc] || cc;
  el.innerHTML = `<p class="text-[10px] t-tertiary mb-2">Articles promo que <strong>${nom}</strong> n'achète pas encore :</p>` +
    (toPitch.length === 0 ? '<p class="t-disabled text-sm">Ce client achète déjà tous les articles promo au PDV.</p>' :
    `<div class="space-y-1">${toPitch.slice(0, 15).map(a => {
      const stockBadge = a.stock === null ? '<span class="t-disabled text-[9px]">Non réf.</span>' :
        a.stock > 0 ? `<span class="c-ok text-[9px] font-bold">${a.stock} en stock</span>` :
        '<span class="c-danger text-[9px] font-bold">Rupture</span>';
      return `<div class="flex items-center gap-2 py-1 px-2 s-card-alt rounded text-[11px]">
        <span class="font-mono t-disabled">${a.code}</span>
        <span class="flex-1 truncate">${a.lib}</span>
        ${stockBadge}
      </div>`;
    }).join('')}${toPitch.length > 15 ? `<p class="text-[10px] t-disabled mt-1">+ ${toPitch.length - 15} articles supplémentaires</p>` : ''}</div>`);
}
```

3. Pour que les sections existantes soient masquables en mode Action, ajouter la classe `tab-content-section` aux containers principaux dans `index.html` (le header gradient Promo, le bloc recherche, le bloc résultats, le bloc import). Chercher les divs enfants directs de `#tabPromo` et ajouter `tab-content-section` à leur className.

4. Exporter `_setPromoMode`, `_showActionArticles` sur window :
```js
window._setPromoMode = _setPromoMode;
window._showActionArticles = _showActionArticles;
```

5. Initialiser le mode par défaut au rendu : dans `_renderPromoResults()`, à la fin, appeler `_setPromoMode(_promoMode)` pour mettre à jour les boutons.

### Commit
```bash
git add -A && git commit -m "B4: P3.6 — Promo Mode Action — top 10 clients SPC + articles to pitch per client"
```

---

## VÉRIFICATION FINALE

```bash
# Vérifier les nouvelles structures en state
grep -n 'clientFamCA\|metierFamBench\|seasonalIndex\|articleMonthlySales' js/state.js

# Vérifier le SPC
grep -n 'computeSPC\|_spcBadge' js/engine.js js/main.js

# Vérifier le moteur saisonnier
grep -n 'monthlySales\|seasonalIndex\|_seasonRibbon' js/main.js

# Vérifier le mode Action Promo
grep -n 'promoModeAction\|promoActionView\|_setPromoMode\|_showActionArticles' js/main.js index.html

# Test fonctionnel :
# 1. Charger Consommé + Stock → les MIN/MAX sont inchangés (la saisonnalité n'est pas encore connectée à l'algo)
# 2. Charger Chalandise → après quelques secondes, toast "Agrégats clients calculés"
# 3. Onglet Promo → rechercher "coupe" → les clients sont triés par SPC, badge score visible
# 4. Cliquer ⚡ Action → vue condensée top 10 + articles à pitcher
# 5. Diagnostic famille → ruban saisonnier visible (12 cases colorées)
```

---

## RAPPELS
- NE PAS connecter la saisonnalité au calcul MIN/MAX dans ce sprint — c'est Sprint C après validation métier
- Le Worker client est lancé en background APRÈS processData(), il ne bloque pas
- Le SPC dépend de `metierFamBench` (Worker) — si le Worker n'a pas fini, le SPC fonctionne quand même mais sans la composante "familles manquantes" (score partiel)
- Le Mode Action ne détruit pas les données — il masque/affiche des sections
- Les classes `tab-content-section` doivent être ajoutées soigneusement pour ne pas casser le layout existant
