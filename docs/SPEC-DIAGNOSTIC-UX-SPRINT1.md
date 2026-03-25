# SPEC — Diagnostic UX Sprint 1 : Refonte lisibilité

**Date :** 2026-03-25  
**Fichier cible :** `js/diagnostic.js` (915 lignes actuellement)  
**Priorité :** Haute  
**Effort estimé :** 4-6h  
**Source :** Débat Octopus 4 agents, convergence 87/100  

---

## Contexte

Le diagnostic cascade fonctionne bien côté data (KPIs validés Qlik). Le problème est UX : l'utilisateur doit scroller tout le panneau avant de savoir quoi faire. Le plan d'action est en bas, les voyants sont verbeux, le Réseau (V3) est un mur de tableaux.

## Principe directeur

**Inverser la hiérarchie : action d'abord, justification ensuite.**

Le chef d'agence ouvre le diagnostic → il voit immédiatement le chiffre-clé + les 3 actions prioritaires → il scrolle s'il veut comprendre pourquoi.

---

## Action 1 — Bandeau synthèse "3 chiffres" (Codex P1)

### Quoi
Insérer une nouvelle fonction `_diagRenderSummaryBar(v1, v2, v3)` qui affiche un bandeau compact avec 3 KPIs max, AVANT les voyants et AVANT le plan.

### Données source
Les 3 voyants sont déjà calculés (L187-189). Extraire :
- **CA perdu** : `v1.caPerduTotal` (ruptures V1)
- **Clients perdus** : `v2.perdus` + potentiel `v2.potentiel` (V2, si chalandise chargée)
- **Articles réseau absents** : `v3.missing.length` + `v3.strongMissing` (V3, si multi-agences)

### Rendu HTML
```html
<div class="flex gap-3 mb-4">
  <!-- Chiffre 1 : Ruptures -->
  <div class="flex-1 p-3 rounded-xl s-panel-inner border b-dark">
    <p class="text-[10px] t-inverse-muted uppercase tracking-wide">CA perdu ruptures</p>
    <p class="text-lg font-extrabold c-danger">1 247 €</p>
    <p class="text-[10px] t-inverse-muted">5 articles en rupture</p>
  </div>
  <!-- Chiffre 2 : Clients (si chalandise) -->
  <div class="flex-1 p-3 rounded-xl s-panel-inner border b-dark">
    <p class="text-[10px] t-inverse-muted uppercase tracking-wide">Clients perdus</p>
    <p class="text-lg font-extrabold c-caution">3</p>
    <p class="text-[10px] t-inverse-muted">potentiel 860 €</p>
  </div>
  <!-- Chiffre 3 : Réseau (si multi) -->
  <div class="flex-1 p-3 rounded-xl s-panel-inner border b-dark">
    <p class="text-[10px] t-inverse-muted uppercase tracking-wide">Absents réseau</p>
    <p class="text-lg font-extrabold c-action">7</p>
    <p class="text-[10px] t-inverse-muted">dont 3 forte rotation</p>
  </div>
</div>
```

### Règles
- Si un voyant est verrouillé (`status === 'lock'`), ne pas afficher sa carte → le bandeau montre 1 ou 2 chiffres, pas 3.
- Si tous les chiffres sont à 0 / ok, afficher un bandeau vert compact : "✅ Famille bien pilotée — aucune action urgente."
- Couleur du chiffre principal : `c-danger` si erreur, `c-caution` si warn, `c-ok` si ok.
- Le chiffre principal est gros (text-lg font-extrabold), le sous-texte est discret (text-[10px]).

### Où insérer dans `renderDiagnosticPanel()`
Ligne ~203 actuelle. Le nouveau layout du mode 3-voyant (L193-207) devient :
```
HEADER (titre, bouton retour, fichiers)
→ _diagRenderSummaryBar(v1, v2, v3)        ← NOUVEAU
→ _diagRenderPlan(famille, actions)          ← REMONTÉ (était en dernier)
→ _diagRenderV1(v1, ...)
→ _diagRenderV2(v2, hasChal)
→ _diagRenderV3(v3, hasMulti)
```

### Aussi appliquer à :
- `_renderDiagnosticCellPanel()` (L210-308) — mode case Radar ABC/FMR
- Mode métier (`isMetierMode`, L161-184) — adapter avec les données L1/L2/L3/L4

---

## Action 2 — Remonter le Plan d'action (Codex P5 + Sonnet P2)

### Quoi
Déplacer `_diagRenderPlan()` juste après le bandeau synthèse, AVANT les voyants V1/V2/V3.

### Modification
Dans `renderDiagnosticPanel()` — le `panel.innerHTML` du mode 3-voyant (L193-207), changer l'ordre :

**Avant :**
```
V1 → V2 → V3 → Plan
```

**Après :**
```
SummaryBar → Plan → V1 → V2 → V3
```

Le même changement s'applique à `_renderDiagnosticCellPanel()` (L304-307) et au mode métier (L179-183).

### Pas de sticky
Le plan est remonté dans le flux HTML, PAS en `position: sticky`. Le header PRISME est déjà sticky, un double sticky empilerait trop de barres en haut.

---

## Action 3 — Refonte V3 Réseau : KPI bar + pill-style (Gemini P3 + P4)

### Quoi
Remplacer les `<table>` du voyant V3 Réseau par un système KPI bar cliquable en haut + pills par article en dessous.

### KPI bar
3 boutons toggle en haut du voyant V3 :
```html
<div class="flex gap-2 mb-3">
  <button class="diag-kpi-pill active" data-filter="commander">
    🔴 <strong>7</strong> à commander
  </button>
  <button class="diag-kpi-pill" data-filter="verifier">
    🟠 <strong>3</strong> à vérifier
  </button>
  <button class="diag-kpi-pill" data-filter="exclusivites">
    ⭐ <strong>5</strong> exclusivités
  </button>
</div>
```

### Catégories
Mapper les données V3 existantes vers 3 catégories :
- **À commander** (`missing` où `abcClass === 'A' || abcClass === 'B'`) — articles absents en forte rotation réseau
- **À vérifier** (`inStockNotSold`) — en stock mais 0 vente → vérifier visibilité rayon + les `missing` qui sont C
- **Exclusivités** (`exclusives`) — articles que vous vendez et <2 autres agences vendent

### Pill-style par article
Remplacer les lignes `<tr>` par des divs compactes :
```html
<div class="flex items-center gap-2 py-1.5 px-3 mb-1 rounded-lg s-panel-inner border b-dark">
  <span class="font-mono text-[10px] t-inverse-muted">123456</span>
  <span class="text-[11px] text-white font-semibold flex-1 truncate">Robinet thermostatique</span>
  <span class="text-[10px] c-ok font-bold">5/7 ag.</span>
  <span class="text-[10px] t-inverse-muted">Fréq. 8.2</span>
</div>
```

### Toggle JS
Au clic sur un bouton KPI, montrer uniquement les articles de cette catégorie. Le JS est simple :
- Ajouter `data-category` sur chaque pill d'article
- Au clic sur un bouton KPI → toggle classe `.hidden` sur les pills non concernées
- Bouton actif = bordure colorée, fond teinté

### Affichage par défaut
- "À commander" actif par défaut (les 5 premières pills visibles)
- Reste en `<details>` : "voir N autres" si >5 articles
- Si une catégorie est vide, le bouton est grisé et non cliquable

### Appliquer aussi au mode cellPanel (Radar)
`_renderDiagnosticCellPanel` utilise les mêmes données V3 avec `isCellMode: true`. Appliquer la même refonte pill-style. Les colonnes "Stock préco." sont à inclure dans la pill si `precoMin` est défini.

---

## Action 4 — Bordure gauche colorée par voyant (Codex P6)

### Quoi
Ajouter une bordure gauche de 4px sur chaque voyant, colorée selon son `status`.

### CSS (dans index.html ou le `<style>` existant)
```css
.diag-voyant { border-left: 4px solid transparent; }
.diag-voyant:has(.diag-ok)    { border-left-color: var(--c-ok, #22c55e); }
.diag-voyant:has(.diag-warn)  { border-left-color: var(--c-caution, #f59e0b); }
.diag-voyant:has(.diag-error) { border-left-color: var(--c-danger, #ef4444); }
.diag-voyant:has(.diag-lock)  { border-left-color: var(--color-border-tertiary); }
```

### Alternative si `:has()` pas supporté
Ajouter une classe directement sur le `.diag-voyant` dans les fonctions `_diagRenderV1`, `_diagRenderV2`, `_diagRenderV3` :
```js
`<div class="diag-voyant diag-v1 diag-border-${v.status}">` 
// puis CSS : .diag-border-error { border-left-color: #ef4444; }
```

---

## Action 5 — Progressive disclosure V1 (Codex P2)

### Quoi
Envelopper les listes de détails dans V1 (ruptures, MIN/MAX) dans des `<details><summary>`.

### Dans `_diagRenderV1()` (L343-365)

**Ruptures (top5)** : si v.ruptures.length > 0, envelopper :
```html
<details open>
  <summary class="text-[10px] c-caution font-bold cursor-pointer mb-1">
    🚨 5 ruptures — détails ▾
  </summary>
  <!-- top5 pills existantes -->
</details>
```
- `open` par défaut si `v.status === 'error'` (CA perdu > 1000€)
- Fermé par défaut si `v.status === 'warn'` (ruptures mineures)

**MIN/MAX (top5MM)** : même pattern :
```html
<details>
  <summary class="text-[10px] c-caution font-bold cursor-pointer mb-1">
    ⚠️ 8 articles mal calibrés — détails ▾
  </summary>
  <!-- top5MM pills existantes -->
</details>
```
- Toujours fermé par défaut (c'est le 2e niveau de priorité après les ruptures)

### Style `<details>` global
Ajouter dans le CSS :
```css
details > summary { list-style: none; }
details > summary::-webkit-details-marker { display: none; }
details[open] > summary .chevron { transform: rotate(90deg); }
```

---

## Action 6 — Bouton 📋 copier codes ERP (Sonnet P3)

### Quoi
Ajouter un bouton "Copier codes" sur chaque action du plan qui concerne un réassort (ruptures ou référencement réseau).

### Dans `_diagRenderPlan()` (L879-895)

Pour chaque action de type réassort (où `a.src === '📦'` ou `a.src === '🔭'`), extraire les codes articles et ajouter un bouton copier :

```js
const codes = a.codes || []; // il faut passer les codes dans l'objet action
const copyBtn = codes.length > 0 
  ? `<button onclick="event.stopPropagation();navigator.clipboard.writeText('${codes.join('\\n')}').then(()=>{this.textContent='✅';setTimeout(()=>{this.textContent='📋'},1500)})" class="text-[10px] s-panel-inner py-0.5 px-2 rounded font-bold ml-2 flex-shrink-0" title="Copier ${codes.length} codes articles">📋</button>` 
  : '';
```

### Passer les codes dans les actions
Dans `_diagGenActions()` (L837-871) et `_diagGenActionsMetier()` (L741-762), enrichir chaque action avec un champ `codes` :

```js
// Pour les ruptures (L841-843) :
acts.push({
  priority: 1,
  src: '📦',
  codes: v1.ruptures.map(r => r.code),  // ← AJOUTER
  label: `Réassort ${v1.ruptures.length} ...`,
  fn: () => { ... }
});

// Pour le réseau manquants (L856-858) :
acts.push({
  priority: 4,
  src: '🔭',
  codes: v3.missing.map(a => a.code),  // ← AJOUTER
  label: `Référencer ${v3.missing.length} ...`,
  fn: () => { ... }
});
```

Même enrichissement dans `_renderDiagnosticCellPanel()` (L288-291).

### Feedback
Au clic : le bouton passe à "✅" pendant 1.5s puis revient à "📋". Le `event.stopPropagation()` est crucial pour ne pas déclencher le `onclick` de la ligne d'action (executeDiagAction).

---

## Checklist de validation

Après implémentation, vérifier sur ces 3 scénarios :

1. **Mode famille** (ouvrir le diagnostic depuis Cockpit ou Radar sur une famille)
   - [ ] Bandeau 3 chiffres visible en haut
   - [ ] Plan d'action avant les voyants
   - [ ] V1 avec `<details>` sur ruptures et MIN/MAX
   - [ ] V3 avec KPI bar 3 boutons + pills
   - [ ] Bordure gauche colorée sur chaque voyant
   - [ ] Boutons copier codes sur les actions réassort

2. **Mode case Radar** (ouvrir le diagnostic depuis une case ABC/FMR)
   - [ ] Même layout : bandeau → plan → V1 → V2 → V3
   - [ ] KPI bar pills V3 avec stock préco. si applicable

3. **Mode métier** (ouvrir le diagnostic depuis Le Terrain sur un métier)
   - [ ] Bandeau adapté aux données L1/L2/L3/L4
   - [ ] Plan remonté avant les niveaux

4. **Cas limites**
   - [ ] Famille absente (V1.status === 'absent') → bandeau vert, pas de plan
   - [ ] Chalandise non chargée (V2 locked) → bandeau 2 chiffres seulement
   - [ ] Mono-agence (V3 locked) → bandeau 1 chiffre seulement
   - [ ] Famille marginale (medCA < 1000€) → message info, pas d'action réseau

---

## Ce qui NE change PAS dans ce sprint

- Les fonctions `_diagVoyant1()`, `_diagVoyant2()`, `_diagVoyant3()` — la logique data reste identique
- Les fonctions level (`_diagLevel1`, `_diagLevel2`, etc.) — utilisées en mode métier
- `exportDiagnosticCSV()` — l'export CSV reste tel quel
- Les imports/exports en fin de fichier
- Le CSS `.diag-voyant`, `.diag-action-row` — on les enrichit, on ne les casse pas
