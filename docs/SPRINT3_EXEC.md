# SPRINT 3 — INSTRUCTIONS CLAUDE CODE
# Copier ce fichier dans docs/SPRINT3_EXEC.md puis lancer :
# claude "Lis docs/SPRINT3_EXEC.md et exécute les 5 étapes dans l'ordre. Un commit par étape."

---

## CONTEXTE

Tu travailles sur PRISME (index.html + js/*.js), un outil BI single-page.
D1 (Token Layer) est déjà mergé : ~80 CSS custom properties existent dans `:root` (préfixes `--p-`, `--c-`, `--s-`, `--t-`, `--b-`, `--i-`, `--g-`), plus des classes pont (`.t-primary`, `.s-panel`, etc.).

Tu vas ajouter D3 (Spacing), D5 (Typography), D4 (Surfaces), D2 (Theme Switch) + nettoyer les hex orphelins.

## RÈGLE ABSOLUE

Le rendu visuel par défaut (sans hash URL) doit rester **strictement identique** après chaque commit. Tu ne changes que la plomberie CSS, jamais l'apparence. Ouvre `index.html` dans le navigateur et vérifie visuellement après chaque étape.

---

## ÉTAPE 1 — D3 Spacing Scale

### 1a. Ajouter les tokens dans `:root` (dans le bloc "NIVEAU 2 — TOKENS SÉMANTIQUES", après les `--g-*`)

```css
/* ═══ SPACING SCALE (multiples de 4px) ═══ */
--sp-0:  0px;
--sp-1:  4px;
--sp-2:  8px;
--sp-3:  12px;
--sp-4:  16px;
--sp-5:  20px;
--sp-6:  24px;
--sp-8:  32px;
--sp-10: 40px;
```

### 1b. Dans le bloc `<style>` de index.html UNIQUEMENT, remplacer les valeurs padding/margin/gap hardcodées

Table de remplacement :

```
padding:4px   → padding:var(--sp-1)
padding:8px   → padding:var(--sp-2)
padding:12px  → padding:var(--sp-3)
padding:16px  → padding:var(--sp-4)
padding:20px  → padding:var(--sp-5)
padding:24px  → padding:var(--sp-6)
margin-top:8px   → margin-top:var(--sp-2)
margin-top:12px  → margin-top:var(--sp-3)
margin-bottom:10px → margin-bottom:var(--sp-3)
margin-bottom:6px  → margin-bottom:var(--sp-2)
margin-left:5px    → margin-left:var(--sp-1)
gap:3px  → gap:var(--sp-1)
gap:2px  → gap:var(--sp-1) (seulement si c'est un gap entre items, pas un border ou dimension)
```

Pour les valeurs composées `padding:Xpx Ypx`, remplace chaque composante :
```
padding:8px 16px   → padding:var(--sp-2) var(--sp-4)
padding:14px 16px  → padding:var(--sp-4) var(--sp-4)
padding:14px 10px  → padding:var(--sp-4) var(--sp-3)
padding:10px 14px  → padding:var(--sp-3) var(--sp-4)
padding:2px 8px    → padding:2px var(--sp-2)
padding:2px 7px    → padding:2px var(--sp-2)
padding:2px 6px    → padding:2px var(--sp-2)
padding:6px 12px   → padding:var(--sp-2) var(--sp-3)
padding:9px 10px   → padding:var(--sp-2) var(--sp-3)
padding:12px 16px  → padding:var(--sp-3) var(--sp-4)
padding:16px 8px   → padding:var(--sp-4) var(--sp-2)
padding:9px 14px   → padding:var(--sp-2) var(--sp-4)
padding:1px 6px    → padding:1px var(--sp-2)
padding:1px 5px    → padding:1px var(--sp-1)
padding:0 5px      → padding:0 var(--sp-1)
padding:0 8px      → padding:0 var(--sp-2)
padding:3px 12px   → padding:var(--sp-1) var(--sp-3)
padding:5px 14px   → padding:var(--sp-1) var(--sp-4)
padding:4px 12px   → padding:var(--sp-1) var(--sp-3)
```

### NE PAS TOUCHER
- Valeurs `1px`, `2px` isolées (border-width, outline-offset)
- Tout ce qui est `width`, `height`, `min-width`, `max-width`, `top`, `left`, `right`, `bottom`
- `font-size` (étape 2)
- `border-radius` (étape 3)
- Tout le JS (Tailwind spacing déjà sur la grille)

### Commit
```bash
git add -A && git commit -m "D3: spacing scale — 9 tokens --sp-* + migration CSS padding/margin/gap"
```

---

## ÉTAPE 2 — D5 Typography Scale

### 2a. Ajouter les tokens dans `:root` (après les `--sp-*`)

```css
/* ═══ TYPOGRAPHY SCALE ═══ */
--fs-2xs: 0.6rem;
--fs-xs:  0.7rem;
--fs-sm:  0.8rem;
--fs-base: 0.875rem;
--fs-lg:  1rem;
--fs-xl:  1.25rem;
--fs-2xl: 1.5rem;
--fw-normal:    400;
--fw-medium:    500;
--fw-semibold:  600;
--fw-bold:      700;
--fw-extrabold: 800;
--lh-tight:  1.25;
--lh-normal: 1.5;
--lh-loose:  1.75;
```

### 2b. Ajouter les classes bridge (après le TOKEN BRIDGE existant)

```css
/* Typography bridge */
.fs-2xs  { font-size: var(--fs-2xs); }
.fs-xs   { font-size: var(--fs-xs); }
.fs-sm   { font-size: var(--fs-sm); }
.fs-base { font-size: var(--fs-base); }
.fs-lg   { font-size: var(--fs-lg); }
.fs-xl   { font-size: var(--fs-xl); }
.fs-2xl  { font-size: var(--fs-2xl); }
```

### 2c. Remplacer dans le CSS de index.html

```
font-size:.6rem   → font-size:var(--fs-2xs)
font-size:.65rem  → font-size:var(--fs-xs)
font-size:.7rem   → font-size:var(--fs-xs)
font-size:.75rem  → font-size:var(--fs-sm)
font-size:.8rem   → font-size:var(--fs-sm)
font-size:.85rem  → font-size:var(--fs-base)
font-size:1rem    → font-size:var(--fs-lg)
font-size:9px     → font-size:var(--fs-2xs)
font-size:10px    → font-size:var(--fs-xs)
font-size:11px    → font-size:var(--fs-xs)
font-size:13px    → font-size:var(--fs-base)
font-size:15px    → font-size:var(--fs-lg)
font-size:16px    → font-size:var(--fs-lg)
```

**EXCEPTION** : `font-size:16px!important` dans le `@media(max-width:640px)` pour iOS zoom — **garder tel quel** (c'est un fix technique, pas un choix typo).

### 2d. Remplacer font-weight dans le CSS de index.html

```
font-weight:400  → font-weight:var(--fw-normal)
font-weight:500  → font-weight:var(--fw-medium)
font-weight:600  → font-weight:var(--fw-semibold)
font-weight:700  → font-weight:var(--fw-bold)
font-weight:800  → font-weight:var(--fw-extrabold)
```

### 2e. Remplacer dans js/main.js les inline font-size

Chercher `font-size:10px` dans js/main.js (~7 occurrences) → remplacer par `font-size:var(--fs-xs)`.

### NE PAS TOUCHER
- Classes Tailwind `text-xs`, `text-sm`, `text-base`, `text-lg`, `text-xl` dans le JS
- Classes Tailwind `font-bold`, `font-semibold`, `font-extrabold` dans le JS
- `font-family` (reste Inter)

### Commit
```bash
git add -A && git commit -m "D5: typography scale — 7 tailles + 5 poids + migration CSS/JS font-size/weight"
```

---

## ÉTAPE 3 — D4 Surface Hiérarchique

### 3a. Ajouter les tokens dans `:root` (après les `--fw-*`/`--lh-*`)

```css
/* ═══ SURFACE HIERARCHY ═══ */
--r-sm:   4px;
--r-md:   8px;
--r-lg:   12px;
--r-xl:   16px;
--r-full: 9999px;
--shadow-sm:  0 1px 3px rgba(0,0,0,0.08);
--shadow-md:  0 4px 15px rgba(0,0,0,0.08);
--shadow-lg:  0 8px 25px rgba(0,0,0,0.12);
--shadow-xl:  0 8px 28px rgba(0,0,0,0.25);
```

### 3b. Remplacer border-radius dans le CSS de index.html

```
border-radius:9999px → border-radius:var(--r-full)
border-radius:16px   → border-radius:var(--r-xl)
border-radius:12px   → border-radius:var(--r-lg)
border-radius:10px   → border-radius:var(--r-lg)
border-radius:8px    → border-radius:var(--r-md)
border-radius:6px    → border-radius:var(--r-md)
border-radius:5px    → border-radius:var(--r-md)
border-radius:4px    → border-radius:var(--r-sm)
border-radius:3px    → border-radius:var(--r-sm)
border-radius:2px    → 2px (garder tel quel)
border-radius:50%    → border-radius:var(--r-full)
```

**CAS SPÉCIAL** : `border-radius:6px 6px 0 0` → `border-radius:var(--r-md) var(--r-md) 0 0`

### 3c. Remplacer box-shadow dans le CSS de index.html

```
box-shadow:0 1px 3px rgba(0,0,0,0.08)  → box-shadow:var(--shadow-sm)
box-shadow:0 2px 6px rgba(0,0,0,0.05)  → box-shadow:var(--shadow-sm)
box-shadow:0 2px 8px rgba(0,0,0,.05)   → box-shadow:var(--shadow-sm)
box-shadow:0 4px 15px rgba(0,0,0,.08)  → box-shadow:var(--shadow-md)
box-shadow:0 4px 16px rgba(0,0,0,.25)  → box-shadow:var(--shadow-md)
box-shadow:0 8px 24px rgba(0,0,0,.12)  → box-shadow:var(--shadow-lg)
box-shadow:0 8px 25px rgba(0,0,0,.1)   → box-shadow:var(--shadow-lg)
box-shadow:0 8px 28px rgba(0,0,0,.25)  → box-shadow:var(--shadow-xl)
```

### NE PAS TOUCHER
- Classes Tailwind `rounded-*` et `shadow-*` dans le JS (déjà cohérentes)
- `border-radius:2px` (trop petit pour tokeniser)

### Commit
```bash
git add -A && git commit -m "D4: surface hierarchy — 5 radius + 4 shadows tokens + migration CSS"
```

---

## ÉTAPE 4 — D2 Theme Switch

### 4a. Ajouter les blocs theme dans `<style>`, APRÈS le TOKEN BRIDGE et AVANT le premier sélecteur CSS (avant `#periodBanner`)

```css
/* ═══ THEME: DARK ═══════════════════════════════════ */
:root[data-theme="dark"] {
  --s-page:        var(--p-slate-950);
  --s-card:        var(--p-slate-900);
  --s-card-alt:    var(--p-slate-800);
  --s-panel:       var(--p-slate-900);
  --s-panel-inner: var(--p-slate-800);
  --s-hover:       var(--p-slate-800);
  --s-hover-blue:  rgba(37,99,235,0.15);
  --s-selected:    rgba(37,99,235,0.2);
  --s-active:      rgba(37,99,235,0.25);
  --t-primary:       var(--p-slate-200);
  --t-secondary:     var(--p-slate-400);
  --t-tertiary:      var(--p-slate-500);
  --t-disabled:      var(--p-slate-600);
  --t-inverse:       var(--p-slate-200);
  --t-inverse-muted: var(--p-slate-400);
  --t-link:          var(--p-blue-400);
  --b-default: var(--p-slate-700);
  --b-light:   var(--p-slate-800);
  --b-dark:    var(--p-slate-700);
  --b-darker:  var(--p-slate-600);
  --i-danger-bg:    rgba(220,38,38,0.15);
  --i-danger-text:  #fca5a5;
  --i-caution-bg:   rgba(217,119,6,0.15);
  --i-caution-text: #fbbf24;
  --i-ok-bg:        rgba(22,163,74,0.15);
  --i-ok-text:      #4ade80;
  --i-info-bg:      rgba(37,99,235,0.15);
  --i-info-text:    #60a5fa;
  --i-neutral-bg:   var(--p-slate-800);
  --i-neutral-text: var(--p-slate-400);
  --shadow-sm:  0 1px 3px rgba(0,0,0,0.3);
  --shadow-md:  0 4px 15px rgba(0,0,0,0.3);
  --shadow-lg:  0 8px 25px rgba(0,0,0,0.4);
  --shadow-xl:  0 8px 28px rgba(0,0,0,0.5);
  --g-progress-track: rgba(255,255,255,0.1);
}

/* ═══ THEME: LIGHT ══════════════════════════════════ */
:root[data-theme="light"] {
  --s-page:        #f8fafc;
  --s-card:        #ffffff;
  --s-card-alt:    #f1f5f9;
  --s-panel:       #ffffff;
  --s-panel-inner: var(--p-slate-50);
  --s-hover:       var(--p-slate-100);
  --s-hover-blue:  var(--p-blue-50);
  --s-selected:    #dbeafe;
  --s-active:      #bfdbfe;
  --t-primary:       var(--p-slate-900);
  --t-secondary:     var(--p-slate-600);
  --t-tertiary:      var(--p-slate-500);
  --t-disabled:      var(--p-slate-400);
  --t-inverse:       var(--p-slate-900);
  --t-inverse-muted: var(--p-slate-500);
  --t-link:          var(--p-blue-600);
  --b-default: var(--p-slate-200);
  --b-light:   var(--p-slate-100);
  --b-dark:    var(--p-slate-300);
  --b-darker:  var(--p-slate-400);
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
  --shadow-sm:  0 1px 2px rgba(0,0,0,0.05);
  --shadow-md:  0 4px 12px rgba(0,0,0,0.06);
  --shadow-lg:  0 8px 20px rgba(0,0,0,0.08);
  --shadow-xl:  0 12px 28px rgba(0,0,0,0.12);
  --s-overlay:       rgba(0,0,0,0.5);
  --s-overlay-light: rgba(0,0,0,0.3);
  --g-progress-track: rgba(0,0,0,0.08);
}
```

### 4b. Ajouter le JS theme switch

Dans `js/ui.js`, ajouter en fin de fichier et EXPORTER les fonctions :

```js
// ═══ D2 — THEME SWITCH ═══
export function initTheme() {
  const hash = location.hash.replace('#','');
  const theme = ['dark','light'].includes(hash) ? hash : '';
  if (theme) document.documentElement.setAttribute('data-theme', theme);
  window.addEventListener('hashchange', () => {
    const h = location.hash.replace('#','');
    if (['dark','light'].includes(h)) {
      document.documentElement.setAttribute('data-theme', h);
    } else {
      document.documentElement.removeAttribute('data-theme');
    }
  });
}

export function cycleTheme() {
  const current = document.documentElement.getAttribute('data-theme');
  const next = current === 'dark' ? 'light' : current === 'light' ? '' : 'dark';
  if (next) {
    document.documentElement.setAttribute('data-theme', next);
    location.hash = next;
  } else {
    document.documentElement.removeAttribute('data-theme');
    history.replaceState(null, '', location.pathname + location.search);
  }
  // Update button icon
  const btn = document.getElementById('themeToggle');
  if (btn) btn.textContent = next === 'dark' ? '🌙' : next === 'light' ? '☀️' : '🌗';
}
```

Dans `js/main.js`, ajouter à l'import de ui.js : `initTheme, cycleTheme`
Puis appeler `initTheme()` au tout début de l'initialisation (avant DOMContentLoaded ou tout en haut du flow).
Ajouter `window.cycleTheme = cycleTheme;` dans le bloc window exports.

### 4c. Ajouter le bouton dans la navbar

Chercher dans `index.html` la zone navbar (le `<nav>` ou le header avec le nom du magasin). Ajouter juste avant la fermeture du conteneur navbar :

```html
<button id="themeToggle" onclick="cycleTheme()" title="Thème : mixte → sombre → clair"
  style="font-size:var(--fs-xs);padding:var(--sp-1) var(--sp-2);border-radius:var(--r-full);border:1px solid var(--b-dark);background:transparent;color:var(--t-inverse);cursor:pointer;transition:opacity .15s"
  onmouseover="this.style.opacity='0.7'" onmouseout="this.style.opacity='1'">🌗</button>
```

### 4d. Migrer les classes Tailwind couleur critiques dans le HTML STATIQUE de index.html

Chercher dans le HTML (pas le `<style>`, pas le JS) et remplacer :

```
class="... bg-gray-900 ..."  → ajouter s-panel, retirer bg-gray-900
class="... bg-gray-800 ..."  → ajouter s-panel-inner, retirer bg-gray-800  
```

Pour `text-white` sur fond sombre : remplacer par `t-inverse`.
Pour `bg-gray-50` : remplacer par `s-card-alt`.
Pour `border-gray-200` dans le HTML statique : remplacer par `b-default`.

**Attention** : ne toucher que les classes dans le HTML STATIQUE de index.html (les balises écrites en dur), PAS les templates JS dans js/main.js ou js/ui.js.

### Commit
```bash
git add -A && git commit -m "D2: theme switch — dark/light modes + bouton navbar + hash URL"
```

---

## ÉTAPE 5 — Nettoyage hex orphelins

Remplacer les derniers hex hardcodés dans le CSS de index.html :

```css
/* contrib-dir hover/open */
.contrib-dir-row:hover{background:var(--s-hover)}
.contrib-dir-row.open{background:var(--s-active)}

/* rayon status → utiliser les tokens indicateurs */
.rayon-green{background:var(--i-ok-bg)}
.rayon-yellow{background:var(--i-caution-bg)}
.rayon-red{background:var(--i-danger-bg)}

/* promo suggest hover */
.promo-sug-item:hover,.promo-sug-item.promo-sug-sel{background:var(--i-caution-bg)}

/* insights/cache banners */
#insightsBanner → background:var(--p-slate-950)
#cacheBanner → background:var(--p-slate-950)

/* Bouton Annuler inline styles → remplacer les hex par tokens */
color:#6b7280 → color:var(--t-tertiary)
background:#f3f4f6 → background:var(--s-card-alt)
border:1px solid #d1d5db → border:1px solid var(--b-default)
onmouseover background #e5e7eb → var(--s-hover)  (garder le onmouseover, juste changer la valeur)
onmouseout background #f3f4f6 → var(--s-card-alt)
```

Les `border-left-color` des shortcut-cards (`#f87171`, `#818cf8`, `#fb923c`, `#facc15`, `#4ade80`) → **GARDER** (couleurs d'identité par type de raccourci).

### Commit
```bash
git add -A && git commit -m "cleanup: remaining hex orphans migrated to tokens"
```

---

## VÉRIFICATION FINALE

Exécuter :

```bash
# Hex orphelins (doit retourner seulement les border-left shortcut-cards + CDN URLs)
grep -rP '#[0-9a-fA-F]{6}' index.html js/ | grep -v 'cdn\|tailwind\|googleapis\|cdnjs\|\/\/' | grep -v '\-\-p-\|--c-\|--s-\|--t-\|--b-\|--i-\|--g-\|--tab-\|--r-\|--shadow-\|--sp-\|--fs-\|--fw-\|--lh-' | grep -v 'border-left-color\|prisme-spectrum'
```

Ouvrir `index.html` sans hash → le rendu doit être IDENTIQUE à avant le sprint.
Ouvrir `index.html#dark` → tout sombre, lisible.
Ouvrir `index.html#light` → tout clair, panneaux blancs.
Cliquer le bouton 🌗 → cycle entre les 3 modes.

---

## RAPPELS

- Ne JAMAIS modifier les règles de calcul MIN/MAX ou la logique métier
- Ne JAMAIS toucher aux classes Tailwind spacing/layout dans le JS
- Ne JAMAIS utiliser localStorage (bloqué dans iframe GAS)
- Les classes Tailwind couleur dans le JS qui n'ont PAS été migrées par D1 ne réagiront pas au theme switch → c'est OK pour cette V1
- Toujours vérifier visuellement après chaque commit
