# Prompt Claude Code CLI — Refactor onglet Articles
# Branche : feature/articles-refactor
# 5 fixes séquentiels — main.js + ui.js + index.html
# D4 (preset colonnes) : SKIP — localStorage bloqué GAS

---

## Vérifications préalables

```bash
git checkout -b feature/articles-refactor
```

Confirmer dans `main.js` que `renderTable` utilise `r.caAnnuel` :
```javascript
const caEst = r.caAnnuel > 0 ? ... : '—';
```
Si le champ s'appelle autrement, noter le nom exact avant de continuer.

---

## Fix 1 — D1 : Clic ligne entière → fiche article

**Fichier** : `js/main.js`
**Commit** : `feat(articles): D1 - click row opens article panel`

Dans `renderTable`, localise la ligne qui génère le `<tr>` :

```javascript
p.push(`<tr class="border-b hover:i-info-bg ${bg}">
```

Remplacer par :

```javascript
p.push(`<tr class="border-b hover:i-info-bg ${bg} cursor-pointer"
  onmouseup="(function(e){if(window.getSelection&&window.getSelection().toString().length>0)return;openArticlePanel('${r.code}','table');})(event)">
```

**Pourquoi `onmouseup` + guard sélection** : si l'utilisateur sélectionne du texte dans une cellule (code, libellé), le clic ne doit pas ouvrir le panel. `window.getSelection().toString()` renvoie le texte sélectionné — s'il est non vide, on ignore le clic.

**Ajouter `stopPropagation` sur les boutons internes** — localise le bouton `↗` dans le `<tr>` :

```javascript
<button onclick="openArticlePanel('${r.code}','table')" ...>↗</button>
```

Remplacer par :

```javascript
<button onclick="event.stopPropagation();openArticlePanel('${r.code}','table')" ...>↗</button>
```

Même chose pour `_copyCodeBtn` si elle génère un `onclick` — vérifier qu'elle appelle `event.stopPropagation()` :

```javascript
// Dans utils.js, _copyCodeBtn :
// AVANT :
onclick="event.stopPropagation();_doCopyCode(this,'${code}')"
// Déjà correct si stopPropagation est présent — ne pas modifier si c'est déjà là
```

**Validation** : cliquer sur une ligne → fiche article s'ouvre. Sélectionner le code avec la souris → fiche ne s'ouvre pas. Cliquer sur `↗` → fiche s'ouvre une seule fois.

---

## Fix 2 — D5 : Saut de page direct

**Fichier** : `js/main.js`
**Commit** : `feat(articles): D5 - direct page jump input`

Dans `renderTable`, localise où `pageInfo` est mis à jour :

```javascript
document.getElementById('pageInfo').textContent = `Articles ${_rStart}–${_rEnd} sur ${_S.filteredData.length.toLocaleString('fr')}`;
```

Remplacer par :

```javascript
const _pageInfoEl = document.getElementById('pageInfo');
if(_pageInfoEl) {
  _pageInfoEl.innerHTML = `Articles ${_rStart}–${_rEnd} sur ${_S.filteredData.length.toLocaleString('fr')}
    &nbsp;·&nbsp; Page
    <input type="number" min="1" max="${tp}" value="${_S.currentPage+1}"
      style="width:36px;text-align:center;font-size:11px;padding:1px 4px;border:1px solid var(--b-default);border-radius:4px;background:var(--s-card);color:var(--t-primary)"
      onchange="_jumpToPage(this.value)"
      onclick="event.stopPropagation()">
    / ${tp}`;
}
```

Ajouter la fonction `_jumpToPage` dans `main.js` (juste avant ou après `renderTable`) :

```javascript
function _jumpToPage(val) {
  const tp = Math.max(1, Math.ceil(_S.filteredData.length / PAGE_SIZE));
  const page = parseInt(val);
  if(isNaN(page)) return;
  _S.currentPage = Math.min(Math.max(0, page - 1), tp - 1);
  renderTable(true);
}
window._jumpToPage = _jumpToPage;
```

**Validation** : taper "15" dans l'input → saute à la page 15. Taper "999" → va à la dernière page. Taper "abc" → ne plante pas.

---

## Fix 3 — D3 : Badges filtres actifs

**Fichier** : `js/main.js` + `js/ui.js`
**Commit** : `feat(articles): D3 - active filter badges with clear`

### Étape 3a — Créer la fonction `_renderActiveFilterBadges()`

Ajouter dans `js/main.js` (ou `js/ui.js` si tu préfères — au choix, mais cohérent avec où `renderTable` est défini) :

```javascript
function _renderActiveFilterBadges() {
  const container = document.getElementById('activeFilterBadges');
  if(!container) return;

  const badges = [];

  // Filtre recherche texte
  const search = (document.getElementById('searchInput')?.value || '').trim();
  if(search) badges.push({
    label: `"${search}"`,
    clear: () => { document.getElementById('searchInput').value=''; onFilterChange(); }
  });

  // Filtre famille
  const fam = document.getElementById('filterFamille')?.value || '';
  if(fam) badges.push({
    label: `Famille : ${famLabel ? famLabel(fam) : fam}`,
    clear: () => {
      document.getElementById('filterFamille').value='';
      const sf = document.getElementById('filterSousFamille');
      if(sf) sf.value='';
      onFilterChange();
    }
  });

  // Filtre sous-famille
  const sFam = document.getElementById('filterSousFamille')?.value || '';
  if(sFam) badges.push({
    label: `S/Fam : ${sFam}`,
    clear: () => { document.getElementById('filterSousFamille').value=''; onFilterChange(); }
  });

  // Filtre statut
  const stat = document.getElementById('filterStatut')?.value || '';
  if(stat) badges.push({
    label: `Statut : ${stat}`,
    clear: () => { document.getElementById('filterStatut').value=''; onFilterChange(); }
  });

  // Filtre ABC
  const abc = document.getElementById('filterABC')?.value || '';
  if(abc) badges.push({
    label: `ABC : ${abc}`,
    clear: () => { document.getElementById('filterABC').value=''; onFilterChange(); }
  });

  // Filtre FMR
  const fmr = document.getElementById('filterFMR')?.value || '';
  if(fmr) badges.push({
    label: `FMR : ${fmr}`,
    clear: () => { document.getElementById('filterFMR').value=''; onFilterChange(); }
  });

  // Filtre âge
  const age = document.getElementById('filterAge')?.value || '';
  if(age && AGE_BRACKETS[age]) badges.push({
    label: `Âge : ${AGE_BRACKETS[age].label}`,
    clear: () => { document.getElementById('filterAge').value=''; updateActiveAgeIndicator(); onFilterChange(); }
  });

  // Filtre cockpit (ruptures, dormants...)
  const cockpit = document.getElementById('filterCockpit')?.value || '';
  if(cockpit) badges.push({
    label: document.getElementById('activeCockpitLabel')?.textContent || cockpit,
    clear: () => clearCockpitFilter()
  });

  // Filtre emplacement
  const emp = document.getElementById('filterEmplacement')?.value || '';
  if(emp) badges.push({
    label: `Empl : ${emp}`,
    clear: () => { document.getElementById('filterEmplacement').value=''; onFilterChange(); }
  });

  if(!badges.length) {
    container.innerHTML = '';
    container.style.display = 'none';
    return;
  }

  container.style.display = 'flex';
  container.innerHTML = badges.map((b, i) =>
    `<span style="display:inline-flex;align-items:center;gap:4px;font-size:10px;padding:2px 8px;border-radius:20px;background:var(--i-info-bg);color:var(--c-action);border:1px solid var(--p-blue-300)">
      ${b.label}
      <button onclick="_clearBadge(${i})" style="background:none;border:none;cursor:pointer;color:var(--c-action);font-size:12px;line-height:1;padding:0">×</button>
    </span>`
  ).join('') +
  (badges.length > 1
    ? `<button onclick="resetFilters()" style="font-size:10px;padding:2px 8px;border-radius:20px;border:1px solid var(--b-default);background:none;color:var(--t-tertiary);cursor:pointer">Tout effacer</button>`
    : '');

  // Stocker les clearFns pour _clearBadge
  container._clearFns = badges.map(b => b.clear);
}

window._clearBadge = function(i) {
  const container = document.getElementById('activeFilterBadges');
  if(container?._clearFns?.[i]) container._clearFns[i]();
};
```

### Étape 3b — Appeler `_renderActiveFilterBadges()` dans `renderTable`

Dans `renderTable`, ajouter en début de fonction (après la mise à jour du count) :

```javascript
_renderActiveFilterBadges();
```

### Étape 3c — Ajouter le conteneur dans `index.html`

Dans `index.html`, dans la section `#tabTable` (onglet Articles), localise le div qui contient `resultCount` et le bouton CSV. Ajouter juste en dessous :

```html
<div id="activeFilterBadges"
  style="display:none;flex-wrap:wrap;gap:6px;padding:6px 12px;
         position:sticky;top:44px;z-index:15;
         background:var(--s-page);border-bottom:1px solid var(--b-light)">
</div>
```

Le `top: 44px` correspond à la hauteur de la navbar. Si la navbar a une hauteur différente, ajuster. Le sticky fait que les badges restent visibles même en scrollant dans le tableau.

**Validation** : appliquer un filtre famille → badge apparaît. Cliquer × sur le badge → filtre effacé, tableau mis à jour. Appliquer 3 filtres → 3 badges + bouton "Tout effacer". Scroller → badges restent visibles.

---

## Fix 4 — D6 : Total CA filtré

**Fichier** : `js/main.js`
**Commit** : `feat(articles): D6 - filtered CA total in footer`

Dans `renderTable`, localise où `pageInfo` est mis à jour (après le Fix 2, c'est le `_pageInfoEl`).

Ajouter juste après :

```javascript
// Total CA filtré
const _totalCA = _S.filteredData.reduce((s, r) => s + (r.caAnnuel || 0), 0);
const _totalCAEl = document.getElementById('filteredCATotal');
if(_totalCAEl) {
  if(_totalCA > 0) {
    const _caStr = _totalCA >= 1000
      ? `${(_totalCA/1000).toFixed(0)}k€`
      : `${Math.round(_totalCA)}€`;
    _totalCAEl.textContent = `CA filtré : ${_caStr}`;
    _totalCAEl.classList.remove('hidden');
  } else {
    _totalCAEl.classList.add('hidden');
  }
}
```

Dans `index.html`, dans la zone footer du tableau Articles (près de `pageInfo`), ajouter :

```html
<span id="filteredCATotal"
  class="hidden text-xs font-semibold c-ok"
  style="margin-left:12px">
</span>
```

**Validation** : sans filtre → "CA filtré : 284k€" (ou équivalent). Filtrer par famille C02 → CA filtré change. 0 résultat → badge masqué.

---

## Ordre des commits

```bash
git checkout -b feature/articles-refactor

# Fix 1
git add js/main.js
git commit -m "feat(articles): D1 - click row opens article panel + stopPropagation"

# Fix 2
git add js/main.js
git commit -m "feat(articles): D5 - direct page jump input with bounds validation"

# Fix 3
git add js/main.js js/ui.js index.html
git commit -m "feat(articles): D3 - active filter badges sticky with clear buttons"

# Fix 4
git add js/main.js index.html
git commit -m "feat(articles): D6 - filtered CA total in footer"

git push origin feature/articles-refactor
# PR → merge vers main
```

---

## Ce qu'il ne faut PAS modifier

- La logique de tri `sortBy` — ne pas toucher
- La pagination `PAGE_SIZE = 200` — ne pas toucher
- `openArticlePanel` — ne pas modifier la fonction, juste l'appeler depuis la ligne
- `downloadCSV` — ne pas toucher
- Les colonnes sticky CODE + LIBELLÉ — ne pas toucher
- `getFilteredData` dans `ui.js` — ne pas modifier (D2 sera dans le sprint référentiel)
- `_copyCodeBtn` dans `utils.js` — vérifier que `stopPropagation` est déjà présent, sinon ajouter, mais ne pas restructurer la fonction

---

## Note D2 — Sprint référentiel famille

D2 (select famille avec famLabel + cascade + fix getFilteredData) sera implémenté
dans la branche `feature/famille-referentiel`, pas ici.
Les inputs texte Famille/S-Famille/Emplacement restent en l'état pour ce sprint.
