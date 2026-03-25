# SPRINT C — Analytique Avancée (Débat V3.1)
# Claude Code : exécuter les 5 étapes dans l'ordre. Un commit par étape.
# Branche : claude/sprint-c-analytics

---

## CONTEXTE

Sprint A (quickwins) + Sprint B (impact majeur) terminés et mergés dans main.
Disponibles en state : `clientFamCA`, `metierFamBench`, `seasonalIndex`, `articleMonthlySales`, `reconquestCohort`, `phantomArticles`, `clientsByMetier`, `clientsByCommercial`, `computeSPC()`, `_clientBadges()`, `_seasonRibbon()`, `_spcBadge()`.

Lire CLAUDE.md pour le contexte projet complet.

## RÈGLES
- Ne pas modifier l'algo MIN/MAX (la connexion saisonnalité → X est reportée, hors scope)
- Le découpage main.js (C5) est du pur refactoring — zéro changement fonctionnel
- Tester visuellement après chaque commit

---

## ÉTAPE C1 — Opportunité nette Client×Famille

### Quoi
Pour chaque client actif, identifier les familles que les clients de son métier achètent typiquement mais que LUI n'achète pas au PDV. Résultat : une liste "Client X, Métier Électricien → n'achète pas Câblage chez nous alors que 87% des électriciens le font."

### Comment

1. Dans `js/engine.js`, ajouter :

```js
export function computeOpportuniteNette() {
  // Calcule pour chaque client les familles manquantes vs benchmark métier
  // Prérequis : _S.metierFamBench (Worker B1), _S.clientFamCA (Worker B1), _S.chalandiseData
  if (!_S.metierFamBench || !Object.keys(_S.metierFamBench).length) {
    _S.opportuniteNette = [];
    return;
  }

  const results = []; // {cc, nom, metier, commercial, missingFams: [{fam, metierPct, metierCA}], totalPotentiel}

  for (const [cc, info] of _S.chalandiseData.entries()) {
    if (!info.metier) continue;
    const bench = _S.metierFamBench[info.metier];
    if (!bench) continue;
    const clientFams = _S.clientFamCA ? (_S.clientFamCA[cc] || {}) : {};
    const totalMetierClients = _S.clientsByMetier.get(info.metier)?.size || 1;

    const missing = [];
    for (const [fam, data] of Object.entries(bench)) {
      if (clientFams[fam]) continue; // client achète déjà cette famille
      const pct = Math.round((data.nbClients / totalMetierClients) * 100);
      if (pct < 30) continue; // famille achetée par moins de 30% du métier → pas significatif
      missing.push({ fam, metierPct: pct, metierCA: Math.round(data.totalCA / data.nbClients) });
    }

    if (missing.length === 0) continue;
    missing.sort((a, b) => b.metierPct - a.metierPct);
    const totalPotentiel = missing.reduce((s, m) => s + m.metierCA, 0);

    results.push({
      cc, nom: info.nom || _S.clientNomLookup[cc] || cc,
      metier: info.metier, commercial: info.commercial || '',
      missingFams: missing.slice(0, 5), // top 5 familles manquantes
      totalPotentiel, nbMissing: missing.length
    });
  }

  results.sort((a, b) => b.totalPotentiel - a.totalPotentiel);
  _S.opportuniteNette = results;
}
```

2. Dans `js/state.js`, ajouter :
```js
_S.opportuniteNette = [];
```
Et dans `resetAppState()` idem.

3. Dans `js/main.js`, appeler `computeOpportuniteNette()` dans le callback `.then()` du Worker client (après `_S.clientFamCA` et `_S.metierFamBench` sont peuplés). Chercher `showToast('📊 Agrégats clients calculés'` et ajouter juste avant :
```js
computeOpportuniteNette();
```

4. Importer `computeOpportuniteNette` dans main.js depuis engine.js.

5. Affichage : ajouter un encart dans l'onglet Le Terrain (Cockpit Client), après le bandeau "Sur votre sélection". Créer une section collapsible :

Dans `js/main.js`, dans la fonction qui rend le cockpit client (chercher l'endroit où `silencieux`, `urgences`, `developper`, `fideliser` sont rendus), ajouter une 5ème section AVANT les sections existantes :

```js
// Opportunités nettes — top 10
if (_S.opportuniteNette.length > 0) {
  const top10 = _S.opportuniteNette.slice(0, 10);
  const opHtml = top10.map(o => {
    const fams = o.missingFams.map(f => `<span class="text-[9px] px-1.5 py-0.5 rounded-full i-info-bg c-action font-semibold">${f.fam} (${f.metierPct}%)</span>`).join(' ');
    return `<div class="p-2 s-card rounded-lg border mb-1">
      <div class="flex items-center gap-2 flex-wrap">
        <span class="font-mono t-disabled text-[10px]">${o.cc}</span>
        <span class="font-bold text-sm">${o.nom}</span>
        ${_spcBadge(computeSPC(o.cc, _S.chalandiseData.get(o.cc) || {}))}
        <span class="text-[10px] t-tertiary">${o.metier}</span>
      </div>
      <div class="flex flex-wrap gap-1 mt-1">${fams}</div>
      <div class="text-[10px] t-tertiary mt-1">Potentiel estimé : <strong class="c-action">${formatEuro(o.totalPotentiel)}</strong>/an · ${o.nbMissing} famille${o.nbMissing > 1 ? 's' : ''} manquante${o.nbMissing > 1 ? 's' : ''}</div>
    </div>`;
  }).join('');

  // Injecter dans le cockpit client comme un bloc details collapsible
  const opBlock = `<details class="mb-4 s-card rounded-xl shadow-md border overflow-hidden">
    <summary class="p-4 cursor-pointer flex items-center justify-between">
      <h3 class="font-extrabold t-primary flex items-center gap-2">🎯 Opportunités nettes <span class="text-[10px] font-normal t-disabled">${_S.opportuniteNette.length} clients avec familles manquantes</span></h3>
      <span class="acc-arrow t-disabled">▶</span>
    </summary>
    <div class="p-4 pt-0">${opHtml}</div>
  </details>`;
  // Insérer avant le premier renderBlock du cockpit client
}
```

Trouver l'endroit exact d'insertion : chercher `renderBlock('ALERTE` dans main.js et insérer le bloc `opBlock` juste avant dans le HTML généré.

### Commit
```bash
git add -A && git commit -m "C1: P4.4 — opportunité nette Client×Famille — familles manquantes vs benchmark métier"
```

---

## ÉTAPE C2 — Export Panier de Tournée

### Quoi
Bouton dans Promo Mode Action : "📄 Fiche tournée" qui génère un CSV prêt-à-imprimer avec : client, SPC, ville, CP, dernière commande, top 3 articles à pitcher, trié par CP (géographie).

### Comment

1. Dans `js/main.js`, ajouter la fonction :

```js
function exportTourneeCSV() {
  const r = _promoLastResult;
  if (!r) { showToast('⚠️ Lancez une recherche Promo d\'abord', 'warning'); return; }

  // Merge all clients with SPC
  const allClients = new Map();
  for (const c of [...(r.sectionA || []), ...(r.sectionB || []), ...(r.sectionC || [])]) {
    if (!allClients.has(c.cc)) allClients.set(c.cc, c);
  }

  const ranked = [...allClients.values()]
    .map(c => {
      const info = _S.chalandiseData.get(c.cc) || {};
      const spc = c.spc || computeSPC(c.cc, info);
      const lastOrder = _S.clientLastOrder.get(c.cc);
      const lastOrderStr = lastOrder ? lastOrder.toISOString().slice(0, 10) : '—';
      const cp = (info.cp || '').replace(/\s/g, '');
      const ville = info.ville || '';

      // Top 3 articles à pitcher (promo articles not bought by this client)
      const artMap = _S.ventesClientArticle.get(c.cc) || new Map();
      const toPitch = [];
      for (const code of r.matchedCodes) {
        if (artMap.has(code)) continue;
        const ref = _S.finalData.find(d => d.code === code);
        if (ref && ref.stockActuel > 0) toPitch.push({ code, lib: ref.libelle || code });
        if (toPitch.length >= 3) break;
      }

      return { cc: c.cc, nom: c.nom || info.nom || c.cc, spc, cp, ville, metier: info.metier || '', commercial: info.commercial || '', lastOrderStr, toPitch, ca: c.ca || 0 };
    })
    .filter(c => c.spc >= 20) // seuil minimum pour la tournée
    .sort((a, b) => a.cp.localeCompare(b.cp) || b.spc - a.spc); // tri géographique puis SPC

  if (!ranked.length) { showToast('Aucun client qualifié pour la tournée', 'warning'); return; }

  const SEP = ';';
  const header = ['Code', 'Nom', 'SPC', 'CP', 'Ville', 'Métier', 'Commercial', 'Dernière cde', 'Article 1', 'Article 2', 'Article 3', 'CA'].join(SEP);
  const rows = ranked.map(c => {
    const arts = c.toPitch.map(a => `${a.code} ${a.lib}`);
    return [c.cc, `"${c.nom}"`, c.spc, c.cp, `"${c.ville}"`, `"${c.metier}"`, `"${c.commercial}"`, c.lastOrderStr, `"${arts[0] || ''}"`, `"${arts[1] || ''}"`, `"${arts[2] || ''}"`, c.ca > 0 ? Math.round(c.ca) : ''].join(SEP);
  });

  const content = '\uFEFF' + header + '\n' + rows.join('\n');
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `PRISME_Tournee_${r.terms[0] || 'promo'}_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link); link.click(); document.body.removeChild(link);
  URL.revokeObjectURL(link.href);
  showToast(`📄 Fiche tournée : ${ranked.length} clients exportés`, 'success');
}
```

2. Ajouter le bouton dans le Mode Action Promo. Dans `_renderPromoActionView()` dans main.js, ajouter un bouton export après le titre "Top 10 — Qui appeler" :
Chercher le HTML qui rend le titre de la colonne gauche et ajouter :
```html
<button onclick="exportTourneeCSV()" class="text-[10px] font-bold py-1 px-2 rounded c-action i-info-bg border">📄 Fiche tournée CSV</button>
```

3. Ajouter `window.exportTourneeCSV = exportTourneeCSV;` aux exports.

### Commit
```bash
git add -A && git commit -m "C2: P3.2 — export Panier de Tournée CSV — clients triés par CP + top 3 articles"
```

---

## ÉTAPE C3 — Sparklines CA mensuel + Momentum

### Quoi
Mini sparkline SVG inline montrant le CA mensuel d'un article ou d'un client sur 12 mois. Affiché dans les diagnostics famille et dans les fiches client du cockpit.

### Comment

1. Dans `js/main.js`, ajouter le helper SVG :

```js
function _sparkline(values, opts = {}) {
  // values = array de 12 nombres (mois)
  // Retourne un SVG inline de 80×20px
  const w = opts.width || 80, h = opts.height || 20;
  const max = Math.max(...values, 1);
  const points = values.map((v, i) => {
    const x = (i / (values.length - 1)) * w;
    const y = h - (v / max) * (h - 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');

  const lastVal = values[values.length - 1] || 0;
  const avgVal = values.reduce((s, v) => s + v, 0) / values.length;
  const trend = lastVal > avgVal * 1.2 ? 'c-ok' : lastVal < avgVal * 0.5 ? 'c-danger' : 'c-caution';

  return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" class="inline-block align-middle" style="overflow:visible">
    <polyline points="${points}" fill="none" stroke="var(--c-action)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
    <circle cx="${w}" cy="${h - (lastVal / max) * (h - 2)}" r="2" fill="var(--c-action)"/>
  </svg><span class="text-[9px] ${trend} ml-1">${lastVal > avgVal * 1.2 ? '↗' : lastVal < avgVal * 0.5 ? '↘' : '→'}</span>`;
}
```

2. **Sparkline article** : dans le diagnostic `_diagLevel1` ou dans la fiche article (si overlay article existe), ajouter la sparkline pour l'article diagnostiqué :

```js
function _articleSparkline(code) {
  const months = _S.articleMonthlySales[code];
  if (!months || months.every(v => v === 0)) return '';
  return `<div class="inline-flex items-center gap-1 ml-2" title="Ventes mensuelles (J→D)">${_sparkline(months)}</div>`;
}
```

Injecter `${_articleSparkline(code)}` dans les lignes d'articles du diagnostic (à côté du libellé ou du code), là où c'est pertinent (top 5 écarts calibrage, ruptures niveau 1).

3. **Sparkline famille** : dans les cartes recommandations du Radar ou dans le diagnostic famille, agréger les sparklines par famille :

```js
function _familySparkline(famille) {
  const idx = _S.seasonalIndex[famille];
  if (!idx) return '';
  // Convertir les coefficients en valeurs relatives pour la sparkline
  return `<div class="inline-flex items-center gap-1 ml-2" title="Saisonnalité famille">${_sparkline(idx.map(c => Math.round(c * 100)))}</div>`;
}
```

4. **NE PAS** ajouter de sparkline dans les tableaux de grande taille (Articles 10k+, Promo clients) — uniquement dans les diagnostics, fiches et vues détaillées. Les sparklines SVG dans un tableau de 200+ lignes degraderaient les performances.

### Commit
```bash
git add -A && git commit -m "C3: sparklines SVG — article monthly sales + family seasonality + momentum arrow"
```

---

## ÉTAPE C4 — Heatmap Famille×Commercial

### Quoi
Matrice croisée : lignes = familles (top 20 par CA), colonnes = commerciaux de l'agence. Chaque cellule = CA réalisé. Affichée dans l'onglet Le Réseau ou comme nouvelle section dans Le Terrain.

### Comment

1. Dans `js/main.js`, ajouter la fonction de calcul + rendu :

```js
function renderHeatmapFamilleCommercial() {
  const container = document.getElementById('heatmapContainer');
  if (!container) return;
  if (!_S.chalandiseReady || !_S.ventesClientArticle.size) {
    container.innerHTML = '<p class="t-disabled text-sm p-4">Chargez la chalandise pour voir la heatmap.</p>';
    return;
  }

  // 1. Agréger CA par commercial × famille
  const matrix = {}; // commercial → {famille → ca}
  const famTotals = {}; // famille → ca total
  const comTotals = {}; // commercial → ca total
  const commercials = new Set();

  for (const [cc, artMap] of _S.ventesClientArticle.entries()) {
    const info = _S.chalandiseData.get(cc);
    const com = info?.commercial || 'Sans commercial';
    commercials.add(com);
    if (!matrix[com]) matrix[com] = {};

    for (const [code, data] of artMap.entries()) {
      const fam = _S.articleFamille[code] || 'Non classé';
      const ca = data.sumCA || 0;
      matrix[com][fam] = (matrix[com][fam] || 0) + ca;
      famTotals[fam] = (famTotals[fam] || 0) + ca;
      comTotals[com] = (comTotals[com] || 0) + ca;
    }
  }

  // 2. Top 20 familles par CA
  const topFams = Object.entries(famTotals)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([fam]) => fam);

  const comList = [...commercials].sort((a, b) => (comTotals[b] || 0) - (comTotals[a] || 0));

  if (comList.length === 0 || topFams.length === 0) {
    container.innerHTML = '<p class="t-disabled text-sm p-4">Pas assez de données pour la heatmap.</p>';
    return;
  }

  // 3. Trouver le max pour le gradient
  let maxCell = 0;
  for (const com of comList) {
    for (const fam of topFams) {
      const val = (matrix[com] || {})[fam] || 0;
      if (val > maxCell) maxCell = val;
    }
  }

  // 4. Render
  let html = '<div class="overflow-x-auto"><table class="min-w-full text-[10px]">';
  html += '<thead class="sticky top-0 s-panel-inner"><tr><th class="py-1 px-2 text-left t-inverse font-bold sticky left-0 s-panel-inner z-10">Famille</th>';
  for (const com of comList) {
    const short = com.length > 12 ? com.slice(0, 12) + '…' : com;
    html += `<th class="py-1 px-2 text-center t-inverse-muted font-semibold" title="${com}">${short}</th>`;
  }
  html += '<th class="py-1 px-2 text-right t-inverse font-bold">Total</th></tr></thead><tbody>';

  for (const fam of topFams) {
    html += `<tr class="border-t b-dark">`;
    html += `<td class="py-1 px-2 font-semibold t-primary sticky left-0 s-card z-10 truncate max-w-[160px]" title="${fam}">${fam}</td>`;
    for (const com of comList) {
      const val = (matrix[com] || {})[fam] || 0;
      const intensity = maxCell > 0 ? val / maxCell : 0;
      const bg = val === 0 ? 'transparent' : `rgba(22,163,74,${(0.1 + intensity * 0.8).toFixed(2)})`;
      const textColor = intensity > 0.5 ? 'color:#fff' : '';
      html += `<td class="py-1 px-2 text-center font-bold" style="background:${bg};${textColor}" title="${com}: ${fam} = ${formatEuro(val)}">${val > 0 ? formatEuro(val) : '—'}</td>`;
    }
    html += `<td class="py-1 px-2 text-right font-bold t-primary">${formatEuro(famTotals[fam])}</td>`;
    html += '</tr>';
  }

  // Ligne totaux
  html += '<tr class="border-t-2 b-dark font-extrabold"><td class="py-1 px-2 sticky left-0 s-card z-10 t-primary">TOTAL</td>';
  for (const com of comList) {
    html += `<td class="py-1 px-2 text-center c-action">${formatEuro(comTotals[com] || 0)}</td>`;
  }
  html += `<td class="py-1 px-2 text-right c-action">${formatEuro(Object.values(famTotals).reduce((s, v) => s + v, 0))}</td>`;
  html += '</tr></tbody></table></div>';

  container.innerHTML = html;
}
```

2. Dans `index.html`, dans l'onglet Le Réseau (`tabBench`), ajouter un conteneur APRÈS le benchmark existant. Chercher la fin de `tabBench` (avant le prochain `tab-content`) et ajouter :

```html
<!-- Heatmap Famille × Commercial -->
<details class="mt-6">
  <summary class="cursor-pointer flex items-center gap-2 mb-2">
    <span class="acc-arrow t-disabled">▶</span>
    <h3 class="font-extrabold text-sm t-primary">🗺️ Carte de chaleur — Famille × Commercial</h3>
    <span class="text-[10px] t-disabled">CA comptoir par commercial et famille (top 20)</span>
  </summary>
  <div id="heatmapContainer" class="s-card rounded-xl border shadow-sm p-3"></div>
</details>
```

3. Appeler `renderHeatmapFamilleCommercial()` dans `renderAll()` ou dans le rendering du bench — chercher `renderBenchmark()` call et ajouter `renderHeatmapFamilleCommercial()` juste après.

4. Ajouter `window.renderHeatmapFamilleCommercial = renderHeatmapFamilleCommercial;` aux exports.

### Commit
```bash
git add -A && git commit -m "C4: P4.2 — heatmap Famille×Commercial — carte de chaleur CA par commercial et famille"
```

---

## ÉTAPE C5 — Découpage main.js → modules

### Quoi
Extraire les fonctions Promo (~600 lignes) et Diagnostic (~400 lignes) de main.js dans des modules séparés. Pur refactoring structurel, zéro changement fonctionnel.

### Comment

**C'est le commit le plus risqué du sprint — procéder avec prudence.**

1. **Identifier les fonctions Promo** dans main.js : tout entre `// ── 🎯 Ciblage Promo ──` et la prochaine section majeure. Inclut :
   - `_onPromoInput`, `_buildPromoSuggestions`, `_renderPromoSuggestions`, `_closePromoSuggest`, `_selectPromoSuggestion`, `_promoSuggestKeydown`, `_promoSuggestHighlight`
   - `runPromoSearch`, `_populatePromoFilterDropdowns`, `_onPromoFamilleChange`, `_onPromoSousFamilleChange`, `_onPromoFilterChange`, `_applyPromoFilters`, `_resetPromoFilters`, `_renderPromoResults`, `exportPromoCSV`
   - `_setPromoMode`, `_renderPromoActionView`, `_showActionArticles`, `exportTourneeCSV`
   - `_importPromoOperation`, `_renderPromoImportResults`, `exportPromoImportCSV`

2. **Créer `js/promo.js`** : copier ces fonctions, ajouter les imports nécessaires (`_S` depuis state.js, fonctions depuis engine.js, utils.js, ui.js), et `export` chaque fonction publique.

3. **Créer `js/diagnostic.js`** : identifier les fonctions diagnostic dans main.js :
   - `openDiagnostic`, `openDiagnosticCell`, `closeDiagnostic`, `renderDiagnosticPanel`
   - `_diagLevel1`, `_diagLevel2`, `_diagLevel3`, `_diagLevel4`
   - `_diagLevel1Metier`, `_diagLevel2Metier`
   - `_diagGenActions`, `_diagRenderPlan`, `executeDiagAction`, `exportDiagnosticCSV`

4. **Dans main.js** : remplacer les fonctions extraites par des imports :
```js
import { runPromoSearch, _onPromoInput, ... } from './promo.js';
import { openDiagnostic, closeDiagnostic, ... } from './diagnostic.js';
```

5. **Variables partagées** : les fonctions Promo et Diagnostic utilisent des variables locales comme `_promoLastResult`, `_promoSuggestItems`, `_diagLevels`, `_diagActions`. Ces variables doivent soit :
   - Être déplacées dans `state.js` (préféré si utilisées par plusieurs modules)
   - Rester dans le module qui les utilise (si locales à un seul module)

6. **Exports window** : les fonctions exposées sur `window` restent dans main.js comme wrappers :
```js
window.runPromoSearch = runPromoSearch;
window.openDiagnostic = openDiagnostic;
// etc.
```

7. **index.html** : PAS de changement — main.js est le seul `<script type="module">`, les nouveaux modules sont importés par main.js.

8. **⚠️ ATTENTION** : de nombreuses fonctions Promo et Diagnostic font référence à des fonctions d'autres parties de main.js (ex: `formatEuro`, `filterByAbcFmr`, `switchTab`, `showCockpitInTable`). Ces fonctions doivent être importées depuis leurs modules respectifs (utils.js, ui.js) ou passées en paramètre. **VÉRIFIER chaque référence externe avant de couper/coller.**

9. **Test crucial** : après le refactoring, TOUTES les fonctionnalités doivent marcher exactement comme avant :
   - Promo : recherche, suggestions, sections A-F, mode Action, export CSV
   - Diagnostic : ouverture depuis Bench/Cockpit/Radar/Stock, 4 niveaux, plan d'action, export CSV

### Commit
```bash
git add -A && git commit -m "C5: refactor — extract promo.js + diagnostic.js from main.js (~1000 lines moved)"
```

---

## VÉRIFICATION FINALE

```bash
# Vérifier les nouvelles structures
grep -n 'opportuniteNette' js/state.js js/engine.js js/main.js

# Vérifier l'export tournée
grep -n 'exportTourneeCSV' js/main.js

# Vérifier les sparklines
grep -n '_sparkline\|_articleSparkline\|_familySparkline' js/main.js

# Vérifier la heatmap
grep -n 'renderHeatmapFamilleCommercial\|heatmapContainer' js/main.js index.html

# Vérifier le découpage
wc -l js/*.js
# main.js devrait avoir perdu ~1000 lignes
# promo.js devrait avoir ~600 lignes
# diagnostic.js devrait avoir ~400 lignes

# Test fonctionnel complet :
# 1. Charger 4 fichiers (Consommé + Stock + Territoire + Chalandise)
# 2. Onglet Le Terrain → section "Opportunités nettes" visible dans le cockpit client
# 3. Onglet Promo → rechercher "dewalt" → Mode Action → bouton "Fiche tournée CSV"
# 4. Diagnostic famille → sparklines visibles sur les articles
# 5. Onglet Le Réseau → section "Carte de chaleur" collapsible
# 6. Toutes les fonctionnalités Promo et Diagnostic marchent comme avant
```

---

## RAPPELS
- C5 (découpage) est le plus risqué — si des erreurs d'import/export apparaissent, corriger avant de commiter
- Les sparklines ne vont PAS dans les tableaux de grande taille (Articles, Promo listes)
- La heatmap s'affiche uniquement si chalandise est chargée
- L'opportunité nette dépend du Worker B1 — si le Worker n'a pas fini, la section est masquée
- Aucun changement à l'algo MIN/MAX dans ce sprint
