# SPEC D1 — TOKEN LAYER PRISME
*Spec stratégique pour implémentation Claude Code — 2026-03-25*

---

## 0. Résumé exécutif

**Objectif** : Remplacer toutes les couleurs hardcodées (hex, Tailwind, rgba) par un système de CSS custom properties à 3 niveaux, pour permettre le theme switching (D2) et garantir la cohérence visuelle de PRISME.

**État actuel (audit du repo)** :
- ✅ 5 tokens sémantiques existent déjà : `--c-action`, `--c-danger`, `--c-caution`, `--c-ok`, `--c-muted` (le "Color Covenant")
- ❌ **~190 hex hardcodés** dans le CSS (`index.html`)
- ❌ **~30 hex hardcodés** dans les fichiers JS (`js/*.js`)
- ❌ **~1 253 classes Tailwind couleur** dans le JS (c'est le **gros morceau**)
- ❌ **~679 classes Tailwind couleur** dans le HTML
- ❌ **~40 rgba()** hardcodés (CSS + JS)
- ✅ Les tabs ont déjà un mini-système (`--tab-color`, `--tab-bg`, `--tab-text`)

**Effort estimé** : 1-2 journées (migration mécanique, pas de changement de logique)

**Risque** : Faible — aucun changement fonctionnel, uniquement des valeurs visuelles. Réversible via git.

---

## 1. Architecture à 3 niveaux

```
Niveau 1 — PRIMITIVES (palette brute)
    ↓ jamais utilisées directement dans le code
Niveau 2 — SÉMANTIQUES (rôle fonctionnel)
    ↓ utilisées dans le CSS et le JS
Niveau 3 — COMPOSANT (override local si nécessaire)
    ↓ .diag-level, .dq-item, etc.
```

### Principe clé
Le code applicatif (JS, HTML) ne référence **jamais** une primitive.
Il utilise toujours un token sémantique (`--s-*`) ou le Color Covenant existant (`--c-*`).

---

## 2. Niveau 1 — Primitives (`:root`)

Ces variables définissent la palette brute. Elles ne sont référencées QUE par les tokens sémantiques du niveau 2.

```css
:root {
  /* ─── Gris / Slate (surfaces, textes, bordures) ─── */
  --p-slate-950: #0a0a0f;
  --p-slate-900: #0f172a;
  --p-slate-800: #1e293b;
  --p-slate-700: #334155;
  --p-slate-600: #475569;
  --p-slate-500: #64748b;
  --p-slate-400: #94a3b8;
  --p-slate-300: #cbd5e1;
  --p-slate-200: #e2e8f0;
  --p-slate-100: #f1f5f9;
  --p-slate-50:  #f8fafc;
  --p-white:     #ffffff;

  /* ─── Couleurs fonctionnelles (déjà dans Color Covenant) ─── */
  --p-blue-600:    #2563eb;
  --p-blue-500:    #3b82f6;
  --p-blue-400:    #60a5fa;
  --p-blue-50:     #eff6ff;
  --p-red-600:     #dc2626;
  --p-red-500:     #ef4444;
  --p-red-50:      #fef2f2;
  --p-amber-600:   #d97706;
  --p-amber-500:   #f59e0b;
  --p-amber-400:   #fbbf24;
  --p-amber-50:    #fffbeb;
  --p-green-600:   #16a34a;
  --p-green-500:   #22c55e;
  --p-green-400:   #4ade80;
  --p-green-50:    #f0fdf4;
  --p-orange-500:  #f97316;
  --p-orange-600:  #ea580c;

  /* ─── Spectre PRISME (identité visuelle) ─── */
  --p-prisme-red:    #E24B4A;
  --p-prisme-amber:  #EF9F27;
  --p-prisme-gold:   #FAC775;
  --p-prisme-green:  #639922;
  --p-prisme-blue:   #378ADD;
  --p-prisme-rose:   #D4537E;
  --p-prisme-violet: #534AB7;

  /* ─── Diagnostic voyants (teintes sombres spécifiques) ─── */
  --p-diag-blue-bg:   #0f2744;
  --p-diag-violet-bg: #1a0e1e;
  --p-diag-green-bg:  #061a10;
  --p-diag-amber-bg:  #1a1000;
}
```

---

## 3. Niveau 2 — Tokens sémantiques

### 3a. Color Covenant (EXISTANT — ne pas modifier)

```css
:root {
  --c-action:  #2563eb;  /* déjà en place, 7+ usages CSS, 1+ JS */
  --c-danger:  #dc2626;
  --c-caution: #d97706;
  --c-ok:      #16a34a;
  --c-muted:   #94a3b8;
}
```

> **Règle** : les helpers `.c-action`, `.bg-c-danger`, etc. restent tels quels.

### 3b. Surfaces

```css
:root {
  /* ─── Surfaces (fond de page, panneaux, cartes) ─── */
  --s-page:         var(--p-slate-100);    /* #f1f5f9 — fond principal light */
  --s-card:         var(--p-white);        /* #fff — cartes, modales */
  --s-card-alt:     var(--p-slate-50);     /* #f8fafc — cartes secondaires */
  --s-panel:        var(--p-slate-900);    /* #0f172a — panneaux sombres (exec-summary, diag) */
  --s-panel-inner:  var(--p-slate-800);    /* #1e293b — sous-blocs dans panneaux sombres */
  --s-overlay:      rgba(0, 0, 0, 0.82);  /* backdrop des overlays */
  --s-overlay-light:rgba(15, 23, 42, 0.7);/* loading overlay */

  /* ─── Surfaces interactives ─── */
  --s-hover:        var(--p-slate-100);    /* hover sur lignes de tableau */
  --s-hover-blue:   var(--p-blue-50);      /* hover bleuté (contrib, terr) */
  --s-selected:     #e0f2fe;               /* ligne/item sélectionné */
  --s-active:       #dbeafe;               /* état actif (tags, filtres) */
}
```

### 3c. Textes

```css
:root {
  /* ─── Texte ─── */
  --t-primary:   var(--p-slate-800);   /* #1e293b — titres, texte principal */
  --t-secondary: var(--p-slate-600);   /* #475569 — texte secondaire */
  --t-tertiary:  var(--p-slate-500);   /* #64748b — labels, placeholders */
  --t-disabled:  var(--p-slate-400);   /* #94a3b8 — désactivé */
  --t-inverse:   var(--p-slate-200);   /* #e2e8f0 — texte sur fond sombre */
  --t-inverse-muted: var(--p-slate-400); /* texte secondaire sur fond sombre */
  --t-link:      var(--p-blue-600);    /* liens */
}
```

### 3d. Bordures

```css
:root {
  /* ─── Bordures ─── */
  --b-default:  var(--p-slate-200);    /* #e2e8f0 — bordure standard */
  --b-light:    var(--p-slate-100);    /* #f1f5f9 — bordure légère */
  --b-dark:     var(--p-slate-700);    /* #334155 — bordure panneaux sombres */
  --b-darker:   #2d3f55;              /* bordure diag-level */
  --b-focus:    var(--c-action);       /* anneau focus (U4, déjà en place) */
}
```

### 3e. Indicateurs (fond + texte pour badges/alertes)

```css
:root {
  /* ─── Indicateurs fond léger ─── */
  --i-danger-bg:    var(--p-red-50);     /* fond alerte danger */
  --i-danger-text:  #991b1b;             /* texte sur fond danger */
  --i-caution-bg:   #fffbeb;             /* fond alerte warning */
  --i-caution-text: #92400e;
  --i-ok-bg:        var(--p-green-50);
  --i-ok-text:      #166534;
  --i-info-bg:      var(--p-blue-50);
  --i-info-text:    #1e40af;
  --i-neutral-bg:   var(--p-slate-100);
  --i-neutral-text: var(--p-slate-600);

  /* ─── Indicateurs sombres (diag badges) ─── */
  --i-ok-dark-bg:      #14532d;
  --i-ok-dark-text:    #4ade80;
  --i-warn-dark-bg:    #713f12;
  --i-warn-dark-text:  #fbbf24;
  --i-error-dark-bg:   #7f1d1d;
  --i-error-dark-text: #f87171;
  --i-lock-dark-bg:    var(--p-slate-800);
  --i-lock-dark-text:  var(--p-slate-500);
}
```

### 3f. Graphiques et barres

```css
:root {
  /* ─── Barres de progression ─── */
  --g-progress-track: rgba(255,255,255,0.15);
  --g-progress-fill:  linear-gradient(90deg, #3b82f6, #06b6d4);
  --g-bar-critical:   linear-gradient(90deg, #ef4444, #dc2626);
  --g-bar-high:       linear-gradient(90deg, #f97316, #ea580c);
  --g-bar-medium:     linear-gradient(90deg, #eab308, #ca8a04);
  --g-bar-low:        #94a3b8;

  /* ─── Shimmer exec-summary ─── */
  --g-shimmer: linear-gradient(90deg, transparent, #3b82f6, #06b6d4, transparent);
}
```

---

## 4. Niveau 3 — Tokens composant (déjà partiellement en place)

Les composants qui ont besoin de couleurs très spécifiques (spectre PRISME, voyants diagnostic) gardent leurs propres variables CSS, mais pointent vers les primitives :

```css
/* Tabs spectraux — déjà en place via style="" inline, à conserver tel quel */
/* --tab-color, --tab-bg, --tab-text : définis par onglet via style="" */

/* Diagnostic voyants — migrer les hex vers primitives */
.diag-v1 { background: var(--p-diag-blue-bg);   border-color: rgba(30,64,175,0.3); }
.diag-v2 { background: var(--p-diag-violet-bg);  border-color: rgba(124,58,237,0.3); }
.diag-v3 { background: var(--p-diag-green-bg);   border-color: rgba(21,128,61,0.3); }
```

---

## 5. Mapping Tailwind → Tokens

C'est LE sujet principal. PRISME utilise Tailwind via CDN, donc les classes Tailwind sont disponibles à l'exécution. La stratégie n'est **PAS** de remplacer chaque classe Tailwind par une CSS variable (ce serait 1900+ remplacements atomiques = cauchemar).

### Stratégie recommandée : approche hybride

#### Phase A — CSS custom (index.html) : migration directe
Tous les `#hex` dans le bloc `<style>` → remplacés par `var(--token)`.
**~190 remplacements, mécaniques.**

Exemple :
```css
/* AVANT */
th:hover { background: #374151; }
.file-loaded { border-color: #10b981 !important; background: #ecfdf5 !important; }

/* APRÈS */
th:hover { background: var(--p-slate-700); }
.file-loaded { border-color: var(--c-ok) !important; background: var(--i-ok-bg) !important; }
```

#### Phase B — JS inline styles : migration directe
Tous les `#hex` dans les fichiers JS (dans les `style="..."`) → remplacés par `var(--token)`.
**~30 remplacements.**

Exemple :
```js
// AVANT
style="position:sticky;top:0;z-index:10;background:#1e293b"

// APRÈS
style="position:sticky;top:0;z-index:10;background:var(--s-panel-inner)"
```

#### Phase C — Tailwind sémantique : créer des classes utilitaires pont

Au lieu de remplacer 1253 classes Tailwind une par une, on crée un **micro-layer CSS** qui mappe les rôles sémantiques les plus fréquents vers les tokens. Le JS continue d'utiliser des classes, mais ce sont des classes sémantiques PRISME au lieu de Tailwind.

**Top 20 classes Tailwind à remplacer** (couvrent ~60% des occurrences) :

| Tailwind actuel | Classe PRISME | Token |
|---|---|---|
| `text-gray-400` | `t-disabled` | `--t-disabled` |
| `text-gray-500` | `t-tertiary` | `--t-tertiary` |
| `text-gray-600` | `t-secondary` | `--t-secondary` |
| `text-gray-700` | `t-primary` | `--t-primary` |
| `text-gray-800` | `t-primary` | `--t-primary` |
| `text-slate-400` | `t-inverse-muted` | `--t-inverse-muted` |
| `text-slate-300` | `t-inverse` | `--t-inverse` |
| `text-slate-500` | `t-inverse-muted` | `--t-inverse-muted` |
| `bg-gray-50` | `s-card-alt` | `--s-card-alt` |
| `bg-gray-100` | `s-hover` | `--s-hover` |
| `bg-gray-200` | — | `--p-slate-200` (bordures/séparateurs) |
| `bg-slate-800` | `s-panel-inner` | `--s-panel-inner` |
| `border-gray-200` | `b-default` | `--b-default` |
| `text-red-600/700` | `c-danger` | `--c-danger` (existe déjà) |
| `text-emerald-400/700` | `c-ok` | `--c-ok` (existe déjà) |
| `text-amber-400/700` | `c-caution` | `--c-caution` (existe déjà) |
| `text-blue-600/700` | `c-action` | `--c-action` (existe déjà) |
| `bg-red-50` | `i-danger-bg` | `--i-danger-bg` |
| `bg-emerald-50` | `i-ok-bg` | `--i-ok-bg` |
| `bg-blue-50` | `i-info-bg` | `--i-info-bg` |

**Classes utilitaires pont** à ajouter au `<style>` :

```css
/* ═══ TOKEN BRIDGE — classes sémantiques PRISME ══════════ */
/* Texte */
.t-primary   { color: var(--t-primary); }
.t-secondary { color: var(--t-secondary); }
.t-tertiary  { color: var(--t-tertiary); }
.t-disabled  { color: var(--t-disabled); }
.t-inverse   { color: var(--t-inverse); }
.t-inverse-muted { color: var(--t-inverse-muted); }
.t-link      { color: var(--t-link); }

/* Surfaces */
.s-page       { background-color: var(--s-page); }
.s-card       { background-color: var(--s-card); }
.s-card-alt   { background-color: var(--s-card-alt); }
.s-panel      { background-color: var(--s-panel); }
.s-panel-inner{ background-color: var(--s-panel-inner); }
.s-hover      { background-color: var(--s-hover); }

/* Indicateurs fond */
.i-danger-bg  { background-color: var(--i-danger-bg); }
.i-caution-bg { background-color: var(--i-caution-bg); }
.i-ok-bg      { background-color: var(--i-ok-bg); }
.i-info-bg    { background-color: var(--i-info-bg); }
.i-neutral-bg { background-color: var(--i-neutral-bg); }

/* Bordures */
.b-default { border-color: var(--b-default); }
.b-light   { border-color: var(--b-light); }
.b-dark    { border-color: var(--b-dark); }
```

#### Phase D — Migration progressive du JS

La phase C est le **gros chantier**. Dans `js/main.js` (4274 lignes), faire un search-replace systématique :

**Priorité 1 — textes gris (couvre ~550 occurrences)** :
```
text-gray-400  →  t-disabled
text-gray-500  →  t-tertiary
text-gray-600  →  t-secondary
text-gray-700  →  t-primary
text-gray-800  →  t-primary
text-slate-300 →  t-inverse
text-slate-400 →  t-inverse-muted
text-slate-500 →  t-inverse-muted
text-gray-300  →  t-disabled        (contexte sombre → t-inverse)
```

**Priorité 2 — textes couleur sémantique (~200 occurrences)** :
```
text-red-600    →  c-danger      (existe déjà)
text-red-700    →  c-danger
text-emerald-400 → c-ok          (existe déjà, contexte sombre)
text-emerald-700 → c-ok          (contexte clair)
text-amber-400  →  c-caution     (contexte sombre)
text-amber-700  →  c-caution     (contexte clair)
text-blue-600   →  c-action      (existe déjà)
text-blue-700   →  c-action
text-rose-400   →  c-danger      (ou nouvelle var si distinction nécessaire)
text-cyan-400   →  (garder ou créer --c-info)
text-violet-300 →  (garder, spécifique diag)
```

**Priorité 3 — backgrounds (~150 occurrences)** :
```
bg-gray-50     →  s-card-alt
bg-gray-100    →  s-hover
bg-gray-200    →  (bordure visuelle, garder ou utiliser --p-slate-200)
bg-slate-800   →  s-panel-inner
bg-red-50      →  i-danger-bg
bg-emerald-50  →  i-ok-bg
bg-blue-50     →  i-info-bg
bg-orange-50   →  i-caution-bg
bg-amber-50    →  i-caution-bg
```

**Priorité 4 — bordures (~50 occurrences)** :
```
border-gray-200 → b-default
border-gray-100 → b-light
```

> **⚠️ ATTENTION — contexte sombre vs clair** : certaines classes comme `text-gray-400` sont utilisées en contexte clair (= `t-disabled`) ET en contexte sombre (= `t-inverse-muted`). Claude Code devra vérifier le contexte parent (`bg-slate-800`, `s-panel`, overlay, etc.) avant de choisir le bon token. C'est la partie qui demande du jugement humain/IA, pas du regex aveugle.

#### Phase E — Couleurs que l'on NE touche PAS

Certaines classes Tailwind doivent rester telles quelles :
- **Couleurs de fond colorées** pour les badges/pills spécifiques : `bg-emerald-500`, `bg-amber-500`, `bg-red-500` (sauf si mappables vers `--c-*`)
- **Spectre PRISME** : les couleurs inline des onglets (`--tab-color:#E24B4A`, etc.) — déjà propres
- **Gradients spécifiques** dans `exec-summary`, `progress-fill` — migrés vers tokens `--g-*`
- **Couleurs Tailwind utilisées < 3 fois** — pas de ROI à créer un token dédié

---

## 6. Plan de migration (ordre des fichiers)

### Étape 1 — Déclarer les tokens (15 min)
Ajouter toutes les variables `:root` au début du `<style>` dans `index.html`, **juste après** le Color Covenant existant.

### Étape 2 — Ajouter les classes pont (10 min)
Ajouter le bloc "TOKEN BRIDGE" dans le `<style>`.

### Étape 3 — Migrer le CSS de index.html (1h)
Remplacer les ~190 hex hardcodés dans le `<style>` par les tokens sémantiques appropriés.

**Regex de recherche** (pour aider Claude Code) :
```
background:#0f172a  →  background:var(--s-panel)
background:#1e293b  →  background:var(--s-panel-inner)
background:#f1f5f9  →  background:var(--s-page)
background:#fff     →  background:var(--s-card)
background:#f8fafc  →  background:var(--s-card-alt)
color:#e2e8f0       →  color:var(--t-inverse)
color:#64748b       →  color:var(--t-tertiary)
color:#475569       →  color:var(--t-secondary)
border:1px solid #334155   →  border:1px solid var(--b-dark)
border:1px solid #e2e8f0   →  border:1px solid var(--b-default)
border:1px solid #2d3f55   →  border:1px solid var(--b-darker)
```

### Étape 4 — Migrer les hex du JS (30 min)
Les ~30 occurrences dans `js/main.js`, `js/ui.js`, `js/engine.js`.

### Étape 5 — Migrer les classes Tailwind couleur du JS (3-4h)
C'est le plus long. Procéder par **fichier** et par **priorité** :
1. `js/main.js` (4274 lignes — le gros)
2. `js/ui.js` (921 lignes)
3. `js/engine.js` (537 lignes — peu de couleurs)
4. `js/parser.js` (406 lignes — peu de couleurs)

### Étape 6 — Migrer les classes Tailwind de index.html (1h)
Les ~679 occurrences dans le HTML.

### Étape 7 — Nettoyage et validation (30 min)
- Vérifier qu'aucun hex orphelin ne subsiste : `grep -rP '#[0-9a-fA-F]{6}' index.html js/`
- Vérifier visuellement chaque onglet
- Comparer un screenshot avant/après (le rendu doit être **identique pixel-perfect**)

---

## 7. Préparation D2 — Theme Switch

Une fois le Token Layer en place, le dark mode / light mode devient trivial :

```css
/* D2 — à implémenter APRÈS D1 */
:root[data-theme="light"] {
  --s-page:        var(--p-slate-100);
  --s-card:        var(--p-white);
  --s-panel:       var(--p-white);
  --s-panel-inner: var(--p-slate-50);
  --t-primary:     var(--p-slate-800);
  --t-inverse:     var(--p-slate-800);
  --b-default:     var(--p-slate-200);
  --b-dark:        var(--p-slate-300);
  /* etc. */
}

:root[data-theme="dark"] {
  --s-page:        var(--p-slate-950);
  --s-card:        var(--p-slate-900);
  --s-panel:       var(--p-slate-900);
  --s-panel-inner: var(--p-slate-800);
  --t-primary:     var(--p-slate-200);
  --t-inverse:     var(--p-slate-200);
  --b-default:     var(--p-slate-700);
  --b-dark:        var(--p-slate-700);
  /* etc. */
}
```

Et le switch via URL hash :
```js
// D2 — à implémenter APRÈS D1
const theme = location.hash.includes('light') ? 'light' : 'dark';
document.documentElement.dataset.theme = theme;
```

> **C'est exactement pourquoi D1 doit être fait en premier.** Sans tokens, D2 crée des bugs visuels car chaque couleur devrait être dupliquée manuellement.

---

## 8. Règles pour Claude Code

### FAIRE
- ✅ Remplacer TOUTES les couleurs hex du CSS par des tokens
- ✅ Remplacer les hex inline du JS par `var(--token)`
- ✅ Remplacer les classes Tailwind couleur par les classes pont PRISME
- ✅ Vérifier le **contexte** (clair vs sombre) avant de choisir le token
- ✅ Garder le rendu **pixel-perfect identique** — aucun changement visuel
- ✅ Commiter par phase (pas un seul commit géant)

### NE PAS FAIRE
- ❌ Ne pas modifier les couleurs du spectre PRISME (onglets)
- ❌ Ne pas toucher aux valeurs `--tab-color/bg/text` inline
- ❌ Ne pas créer de tokens pour des couleurs utilisées < 3 fois
- ❌ Ne pas changer la logique JS — uniquement les valeurs visuelles
- ❌ Ne pas supprimer Tailwind CSS CDN — il reste utilisé pour spacing, layout, etc.
- ❌ Ne pas modifier les règles de calcul MIN/MAX ou quoi que ce soit en dehors du visuel

### Convention de nommage

| Préfixe | Usage | Exemple |
|---|---|---|
| `--p-` | Primitive (palette brute) | `--p-slate-800` |
| `--c-` | Color Covenant (statut) | `--c-danger` (existant) |
| `--s-` | Surface (fond) | `--s-panel` |
| `--t-` | Texte | `--t-primary` |
| `--b-` | Bordure | `--b-default` |
| `--i-` | Indicateur (badge/alerte) | `--i-danger-bg` |
| `--g-` | Graphique (barres, gradients) | `--g-bar-critical` |

---

## 9. Tests de validation

Après migration, vérifier :

1. **Grep zéro hex** :
   ```bash
   # Doit retourner 0 résultats (hors CDN URLs et spectre prisme)
   grep -rP '#[0-9a-fA-F]{6}' index.html js/ | grep -v 'cdn\|tailwind\|googleapis\|cdnjs\|--tab-color\|--tab-bg\|--tab-text\|prisme-spectrum'
   ```

2. **Grep zéro Tailwind couleur** dans le JS :
   ```bash
   # Doit retourner 0 résultats (hors commentaires)
   grep -rP '(?:bg|text|border)-(?:slate|gray|red|orange|amber|emerald|blue|cyan|violet|rose|green)-\d+' js/ | grep -v '//'
   ```

3. **Test visuel** : ouvrir PRISME, charger des fichiers, naviguer chaque onglet. Le rendu doit être strictement identique.

4. **Test focus** : naviguer au clavier, vérifier que `:focus-visible` utilise bien `var(--c-action)` partout.

5. **Test D2 préparation** : ajouter temporairement `document.documentElement.style.setProperty('--s-panel', 'red')` en console → les panneaux sombres doivent devenir rouges. Si oui, le token layer fonctionne.

---

## 10. Glossaire des décisions

| Décision | Justification |
|---|---|
| Garder Tailwind CDN | Utilisé pour spacing/layout/responsive, pas seulement couleurs |
| Approche classes pont | Plus maintenable que 1253 remplacements regex, compatible avec innerHTML |
| `--p-` préfixe primitives | Empêche l'usage direct dans le code applicatif (convention d'équipe) |
| Pas de CSS-in-JS | Le projet est vanilla JS, pas de framework |
| rgba() gardés pour overlays | Opacity sur fond noir = toujours rgba, pas de token possible |
| Spectre non tokenisé | 5 couleurs fixes = identité visuelle, pas de thème alt prévu |

---

*Fin de spec. Ce document est le cahier des charges pour Claude Code. Workflow : copier ce fichier dans le repo → `claude` CLI → branche `claude/token-layer` → PR → merge.*
