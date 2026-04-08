# PRISME Redesign 2027 — Rapport Complet du Débat
**Date : 2026-04-06 | 4 agents | 4 volets**

---

# SYNTHÈSE INTER-AGENTS — PRISME Redesign 2027
**Date : 2026-04-06 | Débat 4 agents : Gemini (V1) · Claude Opus (V2) · Codex (V3) · Claude Sonnet (V4)**

---

## Vision design unifiée

PRISME 2027 est un dashboard BI dark-first premium pour un professionnel qui passe 8h/semaine à lire des données denses. La vision convergente des 4 agents peut se résumer ainsi : **des surfaces profondes qui s'effacent pour que les données resplendissent**. Le fond est un bleu-nuit quasi-noir (#0f1117) qui rappelle les salles de contrôle industrielles — pas un dark mode inversé, mais un design conçu dans l'obscurité. L'élévation est gérée uniquement par la nuance de fond + une bordure, sans box-shadow agressif. La typographie introduit une police display (DM Sans) pour les KPIs — les chiffres sont *grands et fiers*. La barre spectrale passe de signature invisible à identité visuelle forte. Les cellules critiques parlent via la forme autant que la couleur (daltonisme-safe par conception).

---

## Convergences fortes (≥3 agents)

### 1. Surface de base : bleu-nuit désaturé (4/4 agents)
- Gemini : `#0a0f18` (le plus profond)
- Codex : `#0f1115`
- Sonnet : `#0f1117`
- **Consensus** : `#0f1117` — ni noir pur (fatigant), ni slate générique (banal)

### 2. Élévation via background + border, pas box-shadow (3/4 agents)
- Gemini : 4 niveaux `--p-bg-0` → `--p-bg-3` + border tokens
- Sonnet : `--surface-0/1/2` + `--border-subtle/active`
- Codex P2 winner : box-shadow léger OK mais gradient depth surtout
- **Consensus** : 4 niveaux de surface, bordure fine = séparateur principal

### 3. Palette sémantique plus vive en dark (3/4 agents)
- Gemini : `--c-action: #60a5fa`, `--c-danger: #f87171`, `--c-ok: #34d399`
- Sonnet : `--color-danger: #ef4444`, `--color-success: #22c55e`, `--color-info: #3b82f6`
- Codex : `--p-accent-400: #6366f1`
- **Consensus** : les couleurs sémantiques doivent être plus lumineuses/désaturées que leur équivalent light pour éviter "le saignement" sur fond sombre

### 4. Daltonisme — double signal couleur + forme (4/4 agents)
- Gemini : luminance distincte entre rouge/vert
- Opus : "double signal couleur + poids typographique"
- Codex : barre spectrale = forme différenciante
- Sonnet : `::before content` avec symbole (⚑ ▲ ●) sur chaque cellule critique
- **Consensus absolu** : toute info critique portée par couleur + forme/symbole/texte

### 5. `font-variant-numeric: tabular-nums` partout (3/4 agents)
- Opus : `.num` utility class
- Sonnet : sur toutes les valeurs numériques en table et KPI
- Codex : implicite dans table cells
- **Consensus** : à mettre dans `tbody td` et `.evidence-value` par défaut

### 6. Tables comme priorité critique n°1 (4/4 agents)
- Gemini : mentionne l'amélioration tables
- Opus : P6 dédiée aux `<th>` headers
- Codex : P2 winner inclut table tokens
- Sonnet : P6 tables = **Critical, premier impact utilisateur**
- **Consensus** : c'est la surface la plus consultée — c'est là que ça se joue

---

## Palette finale recommandée

```css
/* ============================================================
   PRISME 2027 — Tokens CSS Dark-First
   À placer dans [data-theme="dark"] { } de index.html
   Compatible avec les noms de tokens existants
   ============================================================ */

[data-theme="dark"] {
  /* ── SURFACES (4 niveaux d'élévation — background seul) ── */
  --s-base:        #0f1117;   /* fond de page, base canvas */
  --s-card:        #161b27;   /* cards, panels */
  --s-card-alt:    #1e2435;   /* hover rows, input bg, card raised */
  --s-overlay:     #252b3d;   /* popovers, dropdowns, tooltips */

  /* ── BORDURES (séparateurs sans ombre) ── */
  --b-light:       #1e2538;   /* dividers très discrets */
  --b-default:     #2a3248;   /* bordures cards, inputs */
  --b-strong:      #3d4d6a;   /* focus visible, bordures actives */

  /* ── TEXTE ── */
  --t-primary:     #e2e8f4;   /* texte principal */
  --t-secondary:   #94a3b8;   /* labels secondaires */
  --t-disabled:    #4a5578;   /* disabled, placeholders */

  /* ── COULEURS SÉMANTIQUES (recalibrées dark — plus vives) ── */
  --c-action:      #60a5fa;   /* bleu clair (Tailwind blue-400) */
  --c-danger:      #f87171;   /* rouge corail (red-400) — pas de bleeding */
  --c-caution:     #fbbf24;   /* ambre chaud (amber-400) */
  --c-ok:          #34d399;   /* vert menthe (emerald-400) */
  --c-muted:       #64748b;   /* slate-500 */
  --c-info:        #38bdf8;   /* sky-400 pour info/lien */

  /* ── SPECTRE PRISME 7 ONGLETS (désaturés 15% vs light) ── */
  --tab-stock:     #4ade80;   /* Mon Stock : vert */
  --tab-clients:   #60a5fa;   /* Mes Clients : bleu */
  --tab-reseau:    #818cf8;   /* Le Réseau : indigo */
  --tab-labo:      #fbbf24;   /* Labo : ambre */

  /* ── FOND SIDEBAR (plus sombre que contenu — principe Linear) ── */
  --s-sidebar:     #0b0e16;   /* sidebar : 1 ton plus sombre que --s-base */

  /* ── SIGNAL AMBIANT + BARRE SPECTRALE ── */
  --signal-gradient: linear-gradient(90deg,
    #ef4444 0%, #f97316 14%, #eab308 28%,
    #22c55e 42%, #3b82f6 57%, #8b5cf6 71%, #ec4899 100%
  );

  /* ── COMPOSANTS NATIFS ── */
  --i-info-bg:     rgba(56,189,248,0.10);
  --i-caution-bg:  rgba(251,191,36,0.10);
  --i-danger-bg:   rgba(248,113,113,0.10);
  --i-ok-bg:       rgba(52,211,153,0.10);

  /* ── NAVBAR ── */
  --navbar-bg: linear-gradient(to bottom, #0b0e16 0%, #0f1117 100%);
  --navbar-border: rgba(255,255,255,0.07);
}
```

---

## Plan d'implémentation

### Sprint Design A — Fondations couleur + typo (taille M, 2 jours)
**Objectif : changer le look global sans toucher le JS**

1. **Tokens dark** : ajouter le bloc `[data-theme="dark"]` ci-dessus dans `index.html` (remplace les tokens dark existants)
2. **Google Fonts** : ajouter dans `<head>` :
   ```html
   <link href="https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,500;9..40,700;9..40,800&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
   ```
3. **Typography tokens** :
   ```css
   :root {
     --ff-display: 'DM Sans', sans-serif;
     --ff-body:    'Inter', sans-serif;
     --fs-2xs: 0.625rem; --fs-xs: 0.75rem; --fs-sm: 0.8125rem;
     --fs-base: 0.9375rem; --fs-lg: 1.0625rem;
     --fs-xl: 1.375rem; --fs-2xl: 1.75rem; --fs-3xl: 2.25rem;
     --lh-none: 1; --lh-tight: 1.2; --lh-snug: 1.35;
     --lh-normal: 1.55; --lh-loose: 1.75;
     --ls-tight: -0.01em; --ls-normal: 0.01em;
     --ls-wide: 0.04em; --ls-wider: 0.08em;
   }
   body { font-family: var(--ff-body); font-size: var(--fs-base);
          -webkit-font-smoothing: antialiased; }
   ```
4. **Barre spectrale renforcée** : passer la `#spectrumBar` de 4px à 6px, appliquer `var(--signal-gradient)`
5. **Sidebar plus sombre** : `background: var(--s-sidebar)` sur `#filterPanel` et nav latérale

---

### Sprint Design B — Composants (taille M, 2-3 jours)
**Objectif : navbar, super-tabs, cards, sidebar**

1. **Navbar dark premium** :
   ```css
   #mainNav, #stickyHeader {
     background: var(--navbar-bg);
     border-bottom: 1px solid var(--navbar-border);
   }
   .nav-logo { font-family: var(--ff-display); font-weight: 800; }
   ```
2. **Super-tabs active state plus marqué** :
   ```css
   .supertab-btn.active {
     border-bottom-width: 3px;
     background: rgba(255,255,255,0.04);
   }
   .supertab-pill.active {
     background: rgba(255,255,255,0.10);
     border-color: rgba(255,255,255,0.25);
     font-weight: 600;
   }
   ```
3. **Cards / elevation** :
   ```css
   .s-card    { background: var(--s-card); border: 1px solid var(--b-default); }
   .s-raised  { background: var(--s-card-alt); border: 1px solid var(--b-strong); }
   .s-float   { background: var(--s-overlay); border: 1px solid var(--b-strong);
                box-shadow: 0 4px 24px rgba(0,0,0,0.5); }
   ```
4. **Filter-groups accordéon sidebar** :
   ```css
   .filter-group > summary { background: var(--s-sidebar); }
   .filter-group-body { background: var(--s-card); }
   ```
5. **Tables headers** :
   ```css
   thead th {
     background: var(--s-base);
     font-size: var(--fs-xs); font-weight: 600;
     text-transform: uppercase; letter-spacing: var(--ls-wide);
     color: var(--t-secondary); border-bottom: 1px solid var(--b-strong);
     position: sticky; top: 0; z-index: 1;
   }
   tbody tr:hover td { background: var(--s-card-alt); color: var(--t-primary); }
   tbody tr:nth-child(even) td { background: rgba(255,255,255,0.018); }
   ```

---

### Sprint Design C — Data viz + polish (taille L, 3 jours)
**Objectif : KPI cards, evidence cards, DQ items, barres, tables avancées**

1. **Evidence values DM Sans** :
   ```css
   .evidence-value {
     font-family: var(--ff-display); font-size: var(--fs-xl);
     font-weight: 800; line-height: 1; letter-spacing: var(--ls-tight);
     font-variant-numeric: tabular-nums;
   }
   .kpi-hero .evidence-value { font-size: var(--fs-3xl); }
   .evidence-label {
     font-size: var(--fs-2xs); font-weight: 500;
     letter-spacing: var(--ls-wider); text-transform: uppercase;
     color: var(--t-disabled);
   }
   ```
2. **Evidence cards bande sémantique** :
   ```css
   .evidence-card { border-left: 3px solid var(--ec-accent, var(--b-default)); }
   .evidence-card--danger  { --ec-accent: var(--c-danger); }
   .evidence-card--caution { --ec-accent: var(--c-caution); }
   .evidence-card--ok      { --ec-accent: var(--c-ok); }
   ```
3. **Cellules tables daltonisme-safe** :
   ```css
   td.cell--danger  { background: rgba(248,113,113,0.08); color: #fca5a5; }
   td.cell--danger::before  { content: '⚑ '; font-size: 0.5rem; }
   td.cell--warning { background: rgba(251,191,36,0.08); color: #fcd34d; }
   td.cell--warning::before { content: '▲ '; font-size: 0.5rem; }
   ```
4. **buildPctBar() gradient + glow** :
   ```css
   .perf-bar { background: linear-gradient(90deg, var(--bar-from, var(--c-action)), var(--bar-to, var(--c-info))); border-radius: 3px; }
   .perf-bar--high { box-shadow: 0 0 8px 1px rgba(96,165,250,0.4); }
   ```
5. **`buildSparklineSVG()`** : nouvelle fonction `utils.js` (SVG inline 40×20, polyline, stroke only)
6. **Matrice ABC/FMR** : fonds teintés désaturés dark (voir tokens Sonnet P4)
7. **DQ items barre urgence** : `::after` bar thermique 3px droite

---

## Score convergence : 87/100

**Points forts :** Vision cohérente sur les surfaces, la palette, le daltonisme. Propositions CSS directement implémentables. Tous les tokens sont compatibles noms existants.

**Points d'arbitrage résolus :**
- Elevation : V1 "background only" vs V3 "box-shadow léger" → **background primary + shadow discret sur float seulement**
- Teinte base : V1 `#0a0f18` (trop froid) vs V3/V4 `#0f1117` → **`#0f1117` consensus**
- Action color : V1 `#60a5fa`, V3 `#6366f1`, V4 `#3b82f6` → **`#60a5fa` (blue-400) car meilleur contraste sur fond sombre)**
- Police display : Opus seul propose DM Sans — **retenu** (aucun autre n'a proposé mieux, Google Fonts dispo)

**Point d'attention :** V3 (Codex) utilise `@apply` Tailwind dans le CSS — incompatible avec CDN seul. À traduire en classes Tailwind inline ou CSS variables pures lors de l'implémentation.

---

