# SPEC SPRINT 3 — D2 + D3 + D4 + D5
## Theme Switch · Spacing Scale · Surface Hiérarchique · Typography Scale
*Spec stratégique pour Claude Code — 2026-03-25*
*Prérequis : D1 Token Layer mergé (branche `claude/token-layer-spec-KWHK7`)*

---

## 0. Vue d'ensemble

| ID | Nom | Résumé | Effort | Dépendance |
|----|-----|--------|--------|------------|
| D3 | Spacing Scale | Système d'espacement en multiples de 4px | S | Aucune |
| D5 | Typography Scale | 5 tailles × 3 poids normalisés | S-M | Aucune |
| D4 | Surface Hiérarchique | 3 niveaux de profondeur (ombre + radius) | M | D1 ✅ |
| D2 | Theme Switch | Dark/Light via `data-theme` + hash URL | S | D1 ✅ + D4 |

**Ordre d'implémentation** : D3 → D5 → D4 → D2 (chaque étape dans un commit séparé).

**Règle absolue** : le rendu visuel actuel (thème sombre PRISME) doit rester le **défaut** et être **pixel-perfect identique** après chaque étape. Aucun utilisateur ne doit voir de différence tant qu'il n'active pas le theme switch.

---

## 1. D3 — Spacing Scale (multiples de 4)

### 1.1 Diagnostic actuel

L'espacement dans PRISME utilise un mix incohérent :

**CSS inline (`index.html`)** : 14 valeurs px différentes utilisées — `2px, 3px, 4px, 5px, 6px, 8px, 9px, 10px, 11px, 12px, 14px, 16px, 20px, 24px`. Problème : `9px`, `10px`, `11px`, `14px` ne sont pas sur la grille de 4.

**Tailwind dans JS** : correct par nature — Tailwind utilise déjà des multiples de 4 (`p-1`=4px, `p-2`=8px, etc.). Les 1430+ classes spacing Tailwind dans le JS sont **déjà alignées**. Pas besoin d'y toucher.

### 1.2 L'échelle

```css
:root {
  /* ═══ SPACING SCALE (multiples de 4px) ═══ */
  --sp-0:  0px;
  --sp-1:  4px;    /* micro — séparateurs internes */
  --sp-2:  8px;    /* compact — padding badges, gaps serrés */
  --sp-3:  12px;   /* standard — padding cartes, gaps normaux */
  --sp-4:  16px;   /* confortable — padding panneaux, marges sections */
  --sp-5:  20px;   /* aéré — padding overlays */
  --sp-6:  24px;   /* large — padding panneaux principaux */
  --sp-8:  32px;   /* extra — espacement entre sections */
  --sp-10: 40px;   /* jumbo — padding page sur desktop */
}
```

### 1.3 Plan de migration

**Scope : CSS de `index.html` uniquement** (~190 propriétés spacing). Le JS Tailwind ne bouge pas.

Table de remplacement pour les valeurs hors-grille :

| Valeur actuelle | Vers | Justification |
|---|---|---|
| `3px` | `var(--sp-1)` = 4px | arrondi vers le haut, différence imperceptible |
| `5px` | `var(--sp-1)` = 4px | badges, pills — resserrer légèrement |
| `6px` | `var(--sp-2)` = 8px | padding léger → standard compact |
| `7px` | `var(--sp-2)` = 8px | |
| `9px` | `var(--sp-2)` = 8px | cmd-item padding → compact |
| `10px` | `var(--sp-3)` = 12px | padding moyen → standard |
| `11px` | `var(--sp-3)` = 12px | font-size exclus — ne toucher que les spacing |
| `14px` | `var(--sp-4)` = 16px | padding panneaux → confortable |
| `15px` | `var(--sp-4)` = 16px | info-tip width — garder tel quel (c'est une dimension, pas un spacing) |

Valeurs déjà sur la grille (ne changent pas, juste tokenisées) :

| Valeur | Token |
|---|---|
| `2px` | `2px` (garder en dur — outline-offset, border-radius tiny, trop petit pour token) |
| `4px` | `var(--sp-1)` |
| `8px` | `var(--sp-2)` |
| `12px` | `var(--sp-3)` |
| `16px` | `var(--sp-4)` |
| `20px` | `var(--sp-5)` |
| `24px` | `var(--sp-6)` |

### 1.4 Exclusions

**NE PAS tokeniser** :
- Les `px` dans `border-radius` (ce sont des dimensions, pas du spacing → traité par D4)
- Les `px` dans `width`/`height`/`min-width`/`max-width` (dimensions fixes)
- Les `px` dans `top`/`left`/`bottom`/`right` (positionnement)
- Les `px` dans `font-size` (traité par D5)
- `9999px` (border-radius pill → `var(--r-full)` dans D4)
- `1px` (border-width → garder en dur)
- `2px` (outline-offset, micro dimensions → garder en dur)

### 1.5 Règles Claude Code

```
✅ Tokeniser padding, margin, gap dans le CSS index.html
✅ Arrondir les valeurs hors-grille vers le multiple de 4 le plus proche
✅ NE PAS toucher au JS Tailwind (déjà sur la grille)
✅ NE PAS toucher aux font-size, width, height, border-radius, positions
❌ NE PAS créer de classes utilitaires spacing (Tailwind fait déjà ça)
```

---

## 2. D5 — Typography Scale

### 2.1 Diagnostic actuel

**CSS de `index.html`** — 13 tailles différentes en 2 unités :
- `rem` : `.6`, `.65`, `.7`, `.75`, `.8`, `.85`, `1` (7 valeurs)
- `px` : `9px`, `10px`, `11px`, `13px`, `15px`, `16px` (6 valeurs)

**JS Tailwind** — 7 classes text-size utilisées :
- `text-xs` (121×), `text-sm` (57×), `text-base` (5×), `text-lg` (7×), `text-xl` (8×), `text-2xl` (1×), `text-3xl` (4×)

**Font weights** — CSS + Tailwind combinés :
- `400` (normal), `500` (medium), `600` (semibold), `700` (bold), `800` (extrabold)

### 2.2 L'échelle

**5 tailles, 3 poids — suffisant pour tout PRISME.**

```css
:root {
  /* ═══ TYPOGRAPHY SCALE ═══ */
  /* -- Tailles -- */
  --fs-2xs: 0.6rem;    /* 9.6px — micro-labels, badges compteurs */
  --fs-xs:  0.7rem;    /* 11.2px — badges, tooltips, métadonnées */
  --fs-sm:  0.8rem;    /* 12.8px — texte secondaire, sous-titres */
  --fs-base: 0.875rem; /* 14px — texte courant, cellules tableau */
  --fs-lg:  1rem;      /* 16px — titres cartes, en-têtes sections */
  --fs-xl:  1.25rem;   /* 20px — titres panneaux */
  --fs-2xl: 1.5rem;    /* 24px — titres principaux, KPI */

  /* -- Poids -- */
  --fw-normal:    400;
  --fw-medium:    500;
  --fw-semibold:  600;
  --fw-bold:      700;
  --fw-extrabold: 800;

  /* -- Line-height -- */
  --lh-tight:  1.25;
  --lh-normal: 1.5;
  --lh-loose:  1.75;
}
```

### 2.3 Table de normalisation

Normalisation des tailles CSS → tokens :

| Valeur actuelle | Token | Delta |
|---|---|---|
| `.6rem` (9.6px) | `var(--fs-2xs)` | = identique |
| `.65rem` (10.4px) | `var(--fs-xs)` | +0.8px — acceptable |
| `.7rem` (11.2px) | `var(--fs-xs)` | = identique |
| `.75rem` (12px) | `var(--fs-sm)` | +0.8px |
| `.8rem` (12.8px) | `var(--fs-sm)` | = identique |
| `.85rem` (13.6px) | `var(--fs-base)` | +0.4px |
| `1rem` (16px) | `var(--fs-lg)` | = identique |
| `9px` | `var(--fs-2xs)` | +0.6px |
| `10px` | `var(--fs-xs)` | +1.2px |
| `11px` | `var(--fs-xs)` | +0.2px |
| `13px` | `var(--fs-base)` | +1px |
| `15px` | `var(--fs-lg)` | +1px |
| `16px` | `var(--fs-lg)` | = identique |

> **Note** : les deltas sont tous ≤ 1.2px — imperceptible à l'œil. La cohérence gagnée vaut largement ce micro-décalage.

### 2.4 Mapping Tailwind (JS) — classes pont

Les classes Tailwind `text-xs/sm/base/lg/xl` restent fonctionnelles (Tailwind CDN toujours chargé), mais on ajoute des **alias sémantiques** optionnels pour les cas inline-style :

```css
/* ═══ TYPOGRAPHY BRIDGE ═══ */
.fs-2xs     { font-size: var(--fs-2xs); }
.fs-xs      { font-size: var(--fs-xs); }
.fs-sm      { font-size: var(--fs-sm); }
.fs-base    { font-size: var(--fs-base); }
.fs-lg      { font-size: var(--fs-lg); }
.fs-xl      { font-size: var(--fs-xl); }
.fs-2xl     { font-size: var(--fs-2xl); }
```

**⚠️ NE PAS remplacer les classes Tailwind text-* dans le JS** — elles sont cohérentes, et la migration serait 200+ changements pour zéro bénéfice. Les tokens typo servent pour le CSS de `index.html` et les futurs composants.

### 2.5 Plan de migration

1. Déclarer les tokens dans `:root`
2. Ajouter les classes `.fs-*` au bridge
3. Remplacer les ~43 occurrences `font-size` hardcodées dans le CSS de `index.html`
4. Remplacer les ~7 occurrences `font-size:10px` inline dans `js/main.js`
5. NE PAS toucher aux classes Tailwind `text-xs/sm/base/lg/xl`
6. NE PAS toucher aux `font-weight` Tailwind (`font-bold`, etc.)
7. Tokeniser les `font-weight` hardcodés du CSS (13× `700`, 4× `600`, etc.) → `var(--fw-bold)`, `var(--fw-semibold)`

---

## 3. D4 — Surface Hiérarchique

### 3.1 Concept

3 niveaux de profondeur visuelle qui créent la hiérarchie spatiale de l'interface :

| Niveau | Rôle | Exemples dans PRISME |
|---|---|---|
| **Fond** (L0) | Arrière-plan de page | `#mainContent`, `#filterPanel`, body |
| **Carte** (L1) | Conteneurs principaux | KPI cards, shortcut cards, Decision Queue, tableaux |
| **Surélévé** (L2) | Éléments en premier plan | Overlays, diagnostics, panneaux modaux, tooltips |

### 3.2 Tokens

```css
:root {
  /* ═══ SURFACE HIERARCHY ═══ */
  /* -- Border radius -- */
  --r-sm:   4px;    /* boutons inline, inputs */
  --r-md:   8px;    /* cartes, badges, action-rows */
  --r-lg:   12px;   /* panneaux, shortcut-cards, abc-cells */
  --r-xl:   16px;   /* overlays, diagnostic panel */
  --r-full: 9999px; /* pills, badges ronds, avatars */

  /* -- Ombres (élévation) -- */
  --shadow-sm:  0 1px 3px rgba(0,0,0,0.08);   /* L1 subtil — tab bar, cartes flush */
  --shadow-md:  0 4px 15px rgba(0,0,0,0.08);   /* L1 standard — cartes, shortcut-cards */
  --shadow-lg:  0 8px 25px rgba(0,0,0,0.12);   /* L2 — panneaux, overlays, modales */
  --shadow-xl:  0 8px 28px rgba(0,0,0,0.25);   /* L2 intense — hover abc-cell, popovers */

  /* -- Élévation composée (surface + ombre + radius) -- */
  /* Pas de classe composée — chaque composant combine les tokens individuels */
}
```

### 3.3 Plan de migration

#### Border-radius (CSS `index.html`)

| Valeur actuelle | Count | Token | Notes |
|---|---|---|---|
| `9999px` | 8 | `var(--r-full)` | pills, badges |
| `16px` | 3 | `var(--r-xl)` | diagnostic panel, overlays |
| `12px` | 5 | `var(--r-lg)` | abc-cell, shortcut-card, diag-voyant |
| `10px` | 3 | `var(--r-lg)` | arrondi 10→12 (+2px, imperceptible) |
| `8px` | 3 | `var(--r-md)` | action-rows, diag-action |
| `6px` | 5 | `var(--r-md)` | arrondi 6→8 (+2px) |
| `5px` | 2 | `var(--r-md)` | diag-btn → 8px |
| `4px` | 4 | `var(--r-sm)` | scrollbar, cap-bar |
| `3px` | 2 | `var(--r-sm)` | pct-bar, perf-bar |
| `2px` | 1 | `2px` (garder — prio-bar, trop petit) |
| `50%` | 4 | `var(--r-full)` | cercles |

> **Arrondi** : 5→8, 6→8, 10→12, 3→4. Tous des ajustements ≤ 3px qui harmonisent l'ensemble sans changement perceptible.

#### Box-shadow (CSS `index.html`)

| Valeur actuelle | Vers |
|---|---|
| `0 1px 3px rgba(0,0,0,0.08)` | `var(--shadow-sm)` |
| `0 2px 6px rgba(0,0,0,0.05)` | `var(--shadow-sm)` |
| `0 2px 8px rgba(0,0,0,.05)` | `var(--shadow-sm)` |
| `0 4px 15px rgba(0,0,0,.08)` | `var(--shadow-md)` |
| `0 4px 16px rgba(0,0,0,.25)` | `var(--shadow-md)` |
| `0 8px 24px rgba(0,0,0,.12)` | `var(--shadow-lg)` |
| `0 8px 25px rgba(0,0,0,.1)` | `var(--shadow-lg)` |
| `0 8px 28px rgba(0,0,0,.25)` | `var(--shadow-xl)` |

#### Tailwind shadow dans JS

| Classe | Vers | Action |
|---|---|---|
| `shadow-sm` (3×) | garder | Tailwind shadow-sm ≈ notre `--shadow-sm` |
| `shadow-md` (7×) | garder | idem |
| `shadow-lg` (1×) | garder | idem |

> **Les classes Tailwind shadow restent** — elles sont déjà cohérentes et peu nombreuses (11 total). Pas de ROI à les migrer.

#### Tailwind rounded dans JS

| Classe | Vers | Action |
|---|---|---|
| `rounded-full` (29×) | garder | = `--r-full`, Tailwind cohérent |
| `rounded-lg` (19×) | garder | = `--r-lg` |
| `rounded-xl` (18×) | garder | = `--r-xl` |

> **Même logique** : les classes Tailwind radius dans le JS sont cohérentes. On tokenise uniquement le CSS custom.

### 3.4 Règles Claude Code

```
✅ Déclarer --r-sm/md/lg/xl/full et --shadow-sm/md/lg/xl dans :root
✅ Remplacer les ~36 border-radius hardcodés dans le CSS
✅ Remplacer les ~8 box-shadow hardcodés dans le CSS
✅ Arrondir les valeurs orphelines (5→8, 6→8, 10→12)
❌ NE PAS toucher aux classes Tailwind rounded-*/shadow-* dans le JS
❌ NE PAS créer de classes composées "elevation-1/2/3" — trop rigide
```

---

## 4. D2 — Theme Switch (dark/light via URL hash)

### 4.1 Prérequis

D1 ✅ (tokens couleur), D4 ✅ (shadows — les ombres changent entre themes)

### 4.2 Architecture

Le thème actuel de PRISME est un **dark-by-accident** : les panneaux sombres (`#0f172a`) coexistent avec des cartes blanches et un fond gris clair. Ce n'est ni un vrai dark mode ni un vrai light mode — c'est un **mixed mode**.

**Stratégie** : le mode actuel (mixed) reste le défaut. On ajoute un mode **full-dark** et un mode **full-light** en overrridant les tokens sémantiques.

```
Mode actuel (défaut) = pas de data-theme → les tokens :root s'appliquent tels quels
Mode dark            = data-theme="dark"  → panneaux + cartes + fond = tous sombres
Mode light           = data-theme="light" → panneaux + cartes + fond = tous clairs
```

### 4.3 Tokens par thème

```css
/* ═══ THEME: DARK ═══════════════════════════════════ */
:root[data-theme="dark"] {
  /* Surfaces */
  --s-page:        var(--p-slate-950);     /* fond page très sombre */
  --s-card:        var(--p-slate-900);     /* cartes = panneaux sombres */
  --s-card-alt:    var(--p-slate-800);
  --s-panel:       var(--p-slate-900);     /* inchangé */
  --s-panel-inner: var(--p-slate-800);     /* inchangé */
  --s-hover:       var(--p-slate-800);
  --s-hover-blue:  rgba(37,99,235,0.15);
  --s-selected:    rgba(37,99,235,0.2);
  --s-active:      rgba(37,99,235,0.25);

  /* Textes */
  --t-primary:       var(--p-slate-200);   /* texte clair sur fond sombre */
  --t-secondary:     var(--p-slate-400);
  --t-tertiary:      var(--p-slate-500);
  --t-disabled:      var(--p-slate-600);
  --t-inverse:       var(--p-slate-200);   /* en dark, inverse = même que primary */
  --t-inverse-muted: var(--p-slate-400);
  --t-link:          var(--p-blue-400);

  /* Bordures */
  --b-default: var(--p-slate-700);
  --b-light:   var(--p-slate-800);
  --b-dark:    var(--p-slate-700);
  --b-darker:  var(--p-slate-600);

  /* Indicateurs */
  --i-danger-bg:    rgba(220,38,38,0.15);
  --i-danger-text:  #fca5a5;
  --i-caution-bg:   rgba(217,119,6,0.15);
  --i-caution-text: var(--p-amber-400);
  --i-ok-bg:        rgba(22,163,74,0.15);
  --i-ok-text:      var(--p-green-400);
  --i-info-bg:      rgba(37,99,235,0.15);
  --i-info-text:    var(--p-blue-400);
  --i-neutral-bg:   var(--p-slate-800);
  --i-neutral-text: var(--p-slate-400);

  /* Ombres — plus subtiles en dark */
  --shadow-sm:  0 1px 3px rgba(0,0,0,0.3);
  --shadow-md:  0 4px 15px rgba(0,0,0,0.3);
  --shadow-lg:  0 8px 25px rgba(0,0,0,0.4);
  --shadow-xl:  0 8px 28px rgba(0,0,0,0.5);

  /* Graphiques */
  --g-progress-track: rgba(255,255,255,0.1);
}

/* ═══ THEME: LIGHT ══════════════════════════════════ */
:root[data-theme="light"] {
  /* Surfaces */
  --s-page:        #f8fafc;
  --s-card:        var(--p-white);
  --s-card-alt:    #f1f5f9;
  --s-panel:       var(--p-white);          /* ← LA grande diff: panneaux deviennent blancs */
  --s-panel-inner: var(--p-slate-50);       /* sous-blocs = gris très clair */
  --s-hover:       var(--p-slate-100);
  --s-hover-blue:  var(--p-blue-50);
  --s-selected:    #dbeafe;
  --s-active:      #bfdbfe;

  /* Textes */
  --t-primary:       var(--p-slate-900);
  --t-secondary:     var(--p-slate-600);
  --t-tertiary:      var(--p-slate-500);
  --t-disabled:      var(--p-slate-400);
  --t-inverse:       var(--p-slate-900);    /* en light, inverse = même que primary */
  --t-inverse-muted: var(--p-slate-500);
  --t-link:          var(--p-blue-600);

  /* Bordures */
  --b-default: var(--p-slate-200);
  --b-light:   var(--p-slate-100);
  --b-dark:    var(--p-slate-300);          /* bordures panneaux plus légères */
  --b-darker:  var(--p-slate-400);

  /* Indicateurs — fond léger classique */
  --i-danger-bg:    #fef2f2;
  --i-danger-text:  #991b1b;
  --i-caution-bg:   #fffbeb;
  --i-caution-text: #92400e;
  --i-ok-bg:        #f0fdf4;
  --i-ok-text:      #166534;
  --i-info-bg:      #eff6ff;
  --i-info-text:    #1e40af;
  --i-neutral-bg:   var(--p-slate-100);
  --i-neutral-text: var(--p-slate-600);

  /* Ombres — plus douces en light */
  --shadow-sm:  0 1px 2px rgba(0,0,0,0.05);
  --shadow-md:  0 4px 12px rgba(0,0,0,0.06);
  --shadow-lg:  0 8px 20px rgba(0,0,0,0.08);
  --shadow-xl:  0 12px 28px rgba(0,0,0,0.12);

  /* Overlay — plus transparent en light */
  --s-overlay:       rgba(0,0,0,0.5);
  --s-overlay-light: rgba(0,0,0,0.3);

  /* Graphiques */
  --g-progress-track: rgba(0,0,0,0.08);
}
```

### 4.4 Le switch : JS minimal

```js
/* ═══ D2 — THEME SWITCH ═══ */
(function initTheme() {
  // Priorité : URL hash > localStorage > défaut (pas de theme = mixed mode actuel)
  const hash = location.hash.replace('#','');
  const stored = null; // localStorage bloqué dans GAS → pas de persistence
  const theme = ['dark','light'].includes(hash) ? hash : stored || '';

  if (theme) {
    document.documentElement.setAttribute('data-theme', theme);
  }

  // Écouter les changements de hash
  window.addEventListener('hashchange', () => {
    const h = location.hash.replace('#','');
    if (['dark','light'].includes(h)) {
      document.documentElement.setAttribute('data-theme', h);
    } else {
      document.documentElement.removeAttribute('data-theme');
    }
  });
})();
```

**Usage** :
- `impurs.github.io/Prisme/` → mode mixte actuel (défaut)
- `impurs.github.io/Prisme/#dark` → full dark
- `impurs.github.io/Prisme/#light` → full light

### 4.5 Bouton toggle (optionnel — dans la navbar)

```html
<!-- À ajouter dans la navbar, à côté du store name -->
<button id="themeToggle" onclick="cycleTheme()"
  style="font-size:var(--fs-xs);padding:var(--sp-1) var(--sp-2);border-radius:var(--r-full);
         border:1px solid var(--b-dark);background:transparent;color:var(--t-inverse);cursor:pointer"
  title="Changer le thème">
  🌗
</button>
```

```js
function cycleTheme() {
  const current = document.documentElement.getAttribute('data-theme');
  const next = current === 'dark' ? 'light' : current === 'light' ? '' : 'dark';
  if (next) {
    document.documentElement.setAttribute('data-theme', next);
    location.hash = next;
  } else {
    document.documentElement.removeAttribute('data-theme');
    history.replaceState(null, '', location.pathname);
  }
}
```

### 4.6 Problème Tailwind

**⚠️ Point critique** : les classes Tailwind couleur qui n'ont PAS été migrées vers les tokens (Phase E du D1 — classes conservées comme `bg-emerald-500`, `text-cyan-400`, etc.) ne réagiront pas au theme switch. C'est acceptable pour cette V1 :

- Les badges colorés (vert, rouge, ambre sur fond blanc) fonctionnent dans les 3 modes
- Les couleurs sémantiques du Color Covenant (`--c-danger`, etc.) ne changent pas entre thèmes — elles sont lisibles sur fond clair ET sombre
- Les rares classes Tailwind orphelines dans les panneaux sombres (maintenant tokenisés) utiliseront le contexte token

**Pour la V2 du theme switch** : migrer les ~300 classes Tailwind couleur restantes vers des classes pont PRISME.

### 4.7 Classes Tailwind structurelles qui posent problème en light

Certaines classes Tailwind dans le HTML de `index.html` utilisent des couleurs hardcodées qui ne réagiront pas au switch. Les plus critiques :

```
bg-gray-800   → dans les headers de tableaux → devra devenir s-panel-inner
bg-gray-900   → navbar → devra devenir s-panel
text-white    → texte sur fond sombre → devra devenir t-inverse
```

**Action** : dans l'étape D2, Claude Code doit aussi scanner les classes Tailwind dans le **HTML statique** de `index.html` (pas le JS) et remplacer les plus visibles par les classes pont. C'est ~20 remplacements supplémentaires dans le HTML.

### 4.8 Règles Claude Code

```
✅ Ajouter les blocs :root[data-theme="dark"] et :root[data-theme="light"]
✅ Ajouter le JS initTheme() + cycleTheme() + hashchange listener
✅ Ajouter le bouton 🌗 dans la navbar
✅ Migrer les classes Tailwind couleur critiques du HTML statique (bg-gray-800/900, text-white sur fond sombre)
✅ Tester les 3 modes : défaut (pixel-perfect), dark, light
❌ NE PAS changer les valeurs :root par défaut — le mode mixte doit rester identique
❌ NE PAS essayer de rendre 100% des classes Tailwind responsives au theme — V2
❌ NE PAS utiliser localStorage (bloqué dans GAS iframe)
❌ NE PAS modifier prefers-color-scheme — le mode actuel n'est ni dark ni light, pas de détection auto
```

---

## 5. Hex restants à nettoyer (D1 complément)

L'audit montre 11 hex orphelins dans `index.html` après D1. À inclure dans ce sprint :

| Ligne | Hex | Token |
|---|---|---|
| `.contrib-dir-row:hover` | `#f5f3ff` | `var(--s-hover)` (ou nouveau `--s-hover-violet`) |
| `.contrib-dir-row.open` | `#ede9fe` | `var(--s-active)` |
| `.rayon-green` | `#dcfce7` | `var(--i-ok-bg)` |
| `.rayon-yellow` | `#fef9c3` | `var(--i-caution-bg)` |
| `.rayon-red` | `#fee2e2` | `var(--i-danger-bg)` |
| `.promo-sug-item:hover` | `#fff7ed` | `var(--i-caution-bg)` |
| `#insightsBanner` | `#111118` | `var(--p-slate-950)` |
| `#cacheBanner` | `#111118` | `var(--p-slate-950)` |
| Bouton "Annuler" | `#6b7280,#f3f4f6,#d1d5db,#e5e7eb` | `var(--t-tertiary)`, `var(--s-card-alt)`, `var(--b-default)` |
| Shortcut cards border-left | `#f87171,#818cf8,#fb923c,#facc15,#4ade80` | Garder (identité visuelle couleur par type) |

---

## 6. Plan de commits

| # | Commit | Contenu | Fichiers |
|---|---|---|---|
| 1 | `D3: spacing scale tokens` | Déclaration `--sp-*` + migration ~50 spacing CSS | `index.html` |
| 2 | `D5: typography scale tokens` | Déclaration `--fs-*`/`--fw-*` + migration ~50 font-size/weight CSS + 7 inline JS | `index.html`, `js/main.js` |
| 3 | `D4: surface hierarchy tokens` | Déclaration `--r-*`/`--shadow-*` + migration ~36 radius + ~8 shadow CSS | `index.html` |
| 4 | `D2: theme switch` | `:root[data-theme]` blocs + JS init/cycle + bouton navbar + migration ~20 classes Tailwind HTML | `index.html` |
| 5 | `cleanup: remaining hex orphans` | Les 11 hex orphelins listés section 5 | `index.html` |

---

## 7. Tests de validation

### Après chaque commit :

```bash
# 1. Vérifier que le mode par défaut est pixel-perfect
open index.html  # comparer visuellement avec main

# 2. Vérifier les hex orphelins (après commit 5)
grep -P '#[0-9a-fA-F]{6}' index.html | grep -v \
  'cdn\|tailwind\|googleapis\|cdnjs\|--p-\|--c-\|--s-\|--t-\|--b-\|--i-\|--g-\|--tab-\|--r-\|--shadow-\|--sp-\|--fs-\|--fw-\|prisme-spectrum\|border-left-color'
# → doit retourner 0 résultats (hors shortcut cards border-left)
```

### Après commit D2 :

```bash
# Test dark mode
open "index.html#dark"
# → Tout doit être sombre, lisible, pas de texte blanc sur fond blanc

# Test light mode
open "index.html#light"
# → Tout doit être clair, les panneaux exec-summary/diag deviennent blancs
# → Les textes --t-inverse doivent être sombres
# → Les badges colorés doivent rester lisibles

# Test cycle
# Cliquer 🌗 → dark → 🌗 → light → 🌗 → défaut (mixte)
```

### Test ultime :

```js
// En console, vérifier que tous les tokens répondent
['--s-panel','--t-primary','--b-default','--shadow-md','--r-lg','--sp-4','--fs-base']
  .forEach(t => console.log(t, getComputedStyle(document.documentElement).getPropertyValue(t)))
// Tous doivent retourner une valeur non-vide
```

---

## 8. Résumé des tokens ajoutés par ce sprint

| Catégorie | Préfixe | Nombre | Exemples |
|---|---|---|---|
| Spacing | `--sp-*` | 9 | `--sp-1` (4px) → `--sp-10` (40px) |
| Typography size | `--fs-*` | 7 | `--fs-2xs` → `--fs-2xl` |
| Typography weight | `--fw-*` | 5 | `--fw-normal` → `--fw-extrabold` |
| Line height | `--lh-*` | 3 | `--lh-tight/normal/loose` |
| Border radius | `--r-*` | 5 | `--r-sm` → `--r-full` |
| Shadow | `--shadow-*` | 4 | `--shadow-sm` → `--shadow-xl` |
| **Total nouveaux** | | **33** | |
| **Theme overrides** | dark | ~30 | redéfinitions dans `:root[data-theme="dark"]` |
| | light | ~30 | redéfinitions dans `:root[data-theme="light"]` |

Combiné avec D1 (~80 tokens), PRISME aura **~113 design tokens** — un design system complet pour une app single-file.

---

*Fin de spec. Copier `docs/SPEC_SPRINT3_D2D3D4D5.md` dans le repo → Claude Code CLI → branche `claude/sprint3-design-system` → PR → merge.*
