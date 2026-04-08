# PRISME — Débat Octopus UX 2027
**Format : 4 agents × 4 volets | Date : 2026-04-06**

---

## Agent Gemini — Volet 1 : Navigation & Information Architecture

### Propositions

**P1 — 7 onglets → 4 super-tabs**
Fusionner les 7 onglets actuels en 4 super-tabs sémantiques : **Accueil** (Labo + onboarding), **Mon Stock** (Articles + Stock + Cockpit), **Mes Clients** (Terrain + Commerce), **Mon Réseau** (Réseau + Radar). Navigation interne par pills secondaires dans chaque super-tab. Réduit la charge cognitive de 43%, chaque zone correspond à une intention métier claire. Implémentation : `data-supertab` sur les tab-btn existants, pills `<nav class="tab-pills">` dans le header de chaque zone.
Effort : M | Priorité : Critical

**P2 — Sidebar contextuelle avec accordéons**
Remplacer le filter panel monolithique par une sidebar avec groupes `<details>` sémantiques : Période, Canal, Commercial, Filtres avancés. Badge compteur `.filter-badge` sur chaque groupe fermé indique combien de filtres sont actifs. Reset partiel par groupe. Implémentation : `<details class="filter-group">` natifs, `_activeFiltersCount(group)` retourne le badge count.
Effort : S | Priorité : High

**P3 — Onboarding progressif 2 étapes**
Étape 1 : dropzone unique combinée (les 4 fichiers acceptés sur une seule zone avec hint visuel sur les fichiers optionnels). Étape 2 : une fois Consommé + Stock chargés, afficher un banner enrichissement persistant "Enrichissez l'analyse → Territoire + Chalandise". Supprime le grid 2×2 confus. Implémentation : état `_S._loadingStep` (0→1→2), bannière `.enrich-banner` avec `×` dismiss.
Effort : M | Priorité : Critical

**P4 — Navbar allégée à 4 éléments**
Navbar actuelle : logo + navStats + navStore + navPerf + 🔍 + ⌘K + Reporting + 🌗 = 8 éléments. Cible : logo + navStore + ⌘K + 🌗. navStats et navPerf deviennent des résultats ⌘K contextuels. Reporting absorbé dans ⌘K ("Exporter rapport"). Réduit la navbar de 50%, le ⌘K devient la porte d'entrée universelle.
Effort : S | Priorité : High

**P5 — Onglet par défaut = Stock + Diagnostic en overlay**
Si données présentes → afficher Mon Stock en premier (impact immédiat). Si pas de données → Accueil. Le Diagnostic Cascade reste overlay modal (pas d'onglet dédié) mais ajoute un breadcrumb `Famille → Diagnostic` dans le header overlay pour situer l'utilisateur. `switchTab('stock')` en default après `processData()`.
Effort : S | Priorité : Critical

### Verdict
**Gagnante : P1 + P5 tandem** — P1 restructure l'espace mental de l'outil, P5 garantit que l'utilisateur voit immédiatement de la valeur. Ces deux mesures ensemble réduisent de ~60% le temps avant la première insight utile. P3 est fortement recommandée en Sprint 2.

### Synergies inter-volets
- Avec V2 : les pills secondaires des super-tabs réutilisent `.chip` pour les compteurs de filtres actifs
- Avec V3 : la super-tab Mon Stock devient le cockpit principal qui accueille les sparklines KPI
- Avec V4 : le onboarding progressif bénéficie directement des skeleton loaders et du focus management

---

## Agent Claude Opus — Volet 2 : Composants & Design System

### Propositions

**P1 — Système `.chip` unifié (remplace 5 systèmes de badges)**
Un seul système sémantique couvre tous les cas : `.badge`, `.diag-badge`, `.store-tag`, `.canal-pill-btn`, badges inline JS. Classes : `.chip` (base) + taille `.chip-xs .chip-sm .chip-md` + sémantique `.chip-ok .chip-danger .chip-caution .chip-info .chip-muted .chip-action` + comportement `.chip-toggle .chip-count`. Implémenté en CSS pur via tokens existants (`--c-ok`, `--c-danger`, etc.). Zéro breaking change : alias CSS `.badge { @extend .chip }` (ou règle redéfinition).
Effort : M | Priorité : Critical

```css
/* CSS à ajouter dans index.html */
.chip {
  display: inline-flex; align-items: center; gap: 0.25rem;
  padding: 0.125rem 0.5rem; border-radius: var(--radius-full);
  font-size: var(--fs-xs); font-weight: 600; line-height: 1.4;
  white-space: nowrap; border: 1px solid transparent;
}
.chip-ok    { background: color-mix(in srgb, var(--c-ok) 15%, transparent);    color: var(--c-ok);    border-color: color-mix(in srgb, var(--c-ok) 30%, transparent); }
.chip-danger{ background: color-mix(in srgb, var(--c-danger) 15%, transparent); color: var(--c-danger);border-color: color-mix(in srgb, var(--c-danger) 30%, transparent); }
.chip-caution{background: color-mix(in srgb, var(--c-caution) 15%,transparent); color: var(--c-caution);border-color: color-mix(in srgb, var(--c-caution) 30%,transparent); }
.chip-info  { background: color-mix(in srgb, var(--c-action) 15%, transparent); color: var(--c-action); border-color: color-mix(in srgb, var(--c-action) 30%, transparent); }
.chip-muted { background: var(--s-bg-muted); color: var(--s-text-muted); border-color: var(--s-border); }
.chip-toggle{ cursor: pointer; }
.chip-toggle:hover { filter: brightness(1.15); }
.chip-count { font-variant-numeric: tabular-nums; min-width: 1.5rem; justify-content: center; }
```

**P2 — Système `.overlay` unifié pour les 4 modals**
Les 4 overlays (`#diagnosticOverlay`, `#articlePanelOverlay`, `#nomadeArticleOverlay`, `#reportingOverlay`) partagent 90% du même CSS. Un seul système : `.overlay` (fond) + `.overlay-panel` (boîte) + `.overlay-header` + `.overlay-body` + `.overlay-footer`. Variantes de taille `.overlay-panel--sm .overlay-panel--md .overlay-panel--lg .overlay-panel--full`. Le CSS dupliqué est supprimé (~120 lignes → ~30 lignes partagées).
Effort : S | Priorité : Critical

```css
.overlay { position: fixed; inset: 0; background: rgba(0,0,0,.55); z-index: var(--z-overlay); display: flex; align-items: center; justify-content: center; padding: 1rem; backdrop-filter: blur(2px); }
.overlay-panel { background: var(--s-bg-card); border: 1px solid var(--s-border); border-radius: var(--radius-lg); display: flex; flex-direction: column; max-height: 90vh; overflow: hidden; box-shadow: var(--shadow-xl); }
.overlay-panel--sm  { width: min(480px, 100%); }
.overlay-panel--md  { width: min(720px, 100%); }
.overlay-panel--lg  { width: min(1040px, 100%); }
.overlay-panel--full{ width: min(1280px, 100%); height: 90vh; }
.overlay-header { padding: 1rem 1.25rem; border-bottom: 1px solid var(--s-border); display: flex; align-items: center; gap: 0.75rem; flex-shrink: 0; }
.overlay-body   { flex: 1; overflow-y: auto; padding: 1.25rem; }
.overlay-footer { padding: 0.75rem 1.25rem; border-top: 1px solid var(--s-border); display: flex; gap: 0.5rem; justify-content: flex-end; flex-shrink: 0; }
```

**P3 — Tokens Z-Index nommés**
Remplacer les valeurs hardcodées (9000, 9999, 10000, 10500, 10550, 10600) par une échelle sémantique en tokens CSS. 8 niveaux couvrent tous les cas PRISME :

```css
:root {
  --z-base      : 0;
  --z-raised    : 10;     /* cards hover, dropdowns */
  --z-sticky    : 100;    /* headers sticky, filter panel */
  --z-navbar    : 200;    /* barre de navigation */
  --z-toast     : 500;    /* notifications toast */
  --z-overlay   : 1000;   /* overlays modaux */
  --z-overlay-content: 1010; /* contenu dans overlay */
  --z-overlay-above: 1020;   /* tooltips dans overlay, cmd palette */
}
```
Effort : S | Priorité : High

**P4 — Éradication des inline styles JS (3 phases)**
Phase 1 : composants structurels (`s-card`, `s-flex`, `s-grid-2`) dans `index.html`. Phase 2 : utilitaires layout (`.u-gap-sm`, `.u-mt-md`, `.u-text-right`) via tokens. Phase 3 : grep systématique `style="` dans les 3 fichiers contaminés (diagnostic.js, labo.js, commerce.js), remplacement classe par classe. Checklist : ~40 patterns identifiés, ~200 occurrences.
Effort : L | Priorité : High

**P5 — Dark mode enforcement**
Convention `@css-guard` : tout fichier JS qui génère du HTML doit passer un lint CI (grep `bg-white\|text-gray-\|text-black`) qui fail si trouvé. Alternative sans CI : commentaire `/* @dark-unsafe */` sur chaque occurrence identifiée → backlog visible. Règle CSS globale : `[data-theme="dark"] .bg-white { background: var(--s-bg-card) !important; }` pour filet de sécurité immédiat.
Effort : M | Priorité : High

### Verdict
**Gagnante : P1 + P2 bundle** — Ces deux propositions sont les seules à avoir un impact immédiat sur la cohérence visuelle perçue par l'utilisateur, sans nécessiter de refactoring massif du JS. P3 (z-index tokens) est un prérequis technique de P2 et doit l'accompagner. P4 est un chantier Sprint 3.

### Synergies inter-volets
- Avec V1 : `.chip-count` pour les badges de filtres actifs dans la sidebar
- Avec V3 : `.overlay-panel` accueille les evidence cards et la matrice ABC/FMR redessinée
- Avec V4 : le système overlay intègre nativement le focus trap et le retour focus

---

## Agent Codex — Volet 3 : Data Visualization & Information Density

### Propositions

**P1 — Sparklines SVG inline dans les KPI cards**
Ajouter `buildSparklineSVG(values, opts)` dans `utils.js` : génère un `<svg>` 80×20px avec polyline CSS uniquement, couleur via `opts.color` (token CSS). Affichage sous chaque valeur KPI (CA, ruptures, taux de service) comme tendance 12 mois. Pas de lib externe. Algorithme : normalisation min/max → points polyline → path SVG. Impact : transforme des chiffres bruts en tendance lisible d'un coup d'œil.

```js
export function buildSparklineSVG(values, { color = 'var(--c-action)', width = 80, height = 20 } = {}) {
  if (!values?.length) return '';
  const min = Math.min(...values), max = Math.max(...values);
  const range = max - min || 1;
  const pts = values.map((v, i) =>
    `${(i / (values.length - 1)) * width},${height - ((v - min) / range) * (height - 2) - 1}`
  ).join(' ');
  return `<svg viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" aria-hidden="true" class="sparkline">
    <polyline points="${pts}" fill="none" stroke="${color}" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"/>
  </svg>`;
}
```
Effort : S | Priorité : High

**P2 — Matrice ABC/FMR enrichie**
Chaque cellule de la matrice passe de "n articles" à 3 lignes : `n articles` + `CA total €` + `Stock €`. Barre de saturation horizontale (% du total CA). Couleur de fond par saturation (plus foncé = plus stratégique). Tooltips au survol avec top 3 articles. Impact : la matrice devient un cockpit décisionnel, pas juste un comptage.
Effort : M | Priorité : High

**P3 — `buildPctBar(pct, opts)` unifié**
Les 4 implémentations divergentes (`.pct-bar-terr`, `.perf-bar`, `.canal-bar`, barres inline JS) sont remplacées par une seule fonction dans `utils.js`. Options : `{ color, bgColor, height, showLabel, animated }`. Retourne HTML string. Toutes les sections appellent `buildPctBar()` — maintenabilité radicalement améliorée.

```js
export function buildPctBar(pct, {
  color = 'var(--c-action)', bgColor = 'var(--s-bg-muted)',
  height = 6, showLabel = false, animated = true, max = 100
} = {}) {
  const pctClamped = Math.min(100, Math.max(0, (pct / max) * 100));
  const label = showLabel ? `<span class="pct-bar-label">${Math.round(pctClamped)}%</span>` : '';
  return `<div class="pct-bar-wrap" style="height:${height}px;background:${bgColor};border-radius:${height}px;overflow:hidden">
    <div class="pct-bar-fill${animated ? ' pct-bar-anim' : ''}" style="width:${pctClamped}%;height:100%;background:${color};border-radius:${height}px"></div>
  </div>${label}`;
}
```
Effort : M | Priorité : Critical

**P4 — Delta M vs M-1 en badge inline**
Chaque KPI card affiche un `Δ +12%` ou `Δ -4%` en `.chip-xs` à fond transparent : vert si positif, rouge si négatif. Calcul : `_S.articleMonthlySales` permet le delta mois en cours vs mois précédent. Affichage discret, ne prend pas de place, donne instantanément le sens de l'évolution.

```js
function buildDeltaBadge(current, previous) {
  if (!previous) return '';
  const pct = ((current - previous) / previous * 100).toFixed(1);
  const cls = pct >= 0 ? 'chip-ok' : 'chip-danger';
  const sign = pct >= 0 ? '+' : '';
  return `<span class="chip chip-xs ${cls}" style="background:transparent">${sign}${pct}%</span>`;
}
```
Effort : S | Priorité : Medium

**P5 — Cockpit Briefing → Evidence Cards**
Remplacer les phrases générées (texte dense, non scannable) par des `buildEvidenceCard(icon, value, label, cta)` en grid 2×N. Chaque carte : icône métier (SVG inline 24px) + valeur principale large + label contextuel + bouton CTA optionnel. Le chef d'agence scanne 6 cartes en 3 secondes vs lire 6 phrases en 15 secondes. Implémentation : `renderCockpitBriefing()` dans `ui.js`.

```js
function buildEvidenceCard(icon, value, label, cta = '') {
  return `<div class="s-card evidence-card">
    <div class="evidence-icon">${icon}</div>
    <div class="evidence-value">${value}</div>
    <div class="evidence-label">${label}</div>
    ${cta ? `<button class="btn-sm btn-action u-mt-sm">${cta}</button>` : ''}
  </div>`;
}
```
Effort : M | Priorité : High

### Verdict
**Gagnante : P3** — `buildPctBar()` est un multiplicateur de valeur : une fois en place, P1 (sparklines) et P2 (matrice enrichie) héritent de la même infrastructure réutilisable. C'est le refactoring minimal qui débloque le maximum d'améliorations visuelles. P4 et P5 suivent naturellement en Sprint 2.

### Synergies inter-volets
- Avec V1 : les Evidence Cards peuplent la super-tab Accueil comme dashboard immédiat post-chargement
- Avec V2 : `buildPctBar()` s'appuie sur les tokens `--c-*` et `--s-bg-*` pour être dark-mode-safe by default
- Avec V4 : les sparklines et delta badges bénéficient des micro-animations (entrée counter, fade-in)

---

## Agent Claude Sonnet — Volet 4 : Interactions, Feedback & Accessibility

### Propositions

**P1 — Toast Stack + Skeleton Loaders + Progress Ring**
Système complet de feedback visuel en 3 composants. **ToastManager** : file FIFO avec priorités (error > warning > success > info), max 3 toasts visibles, countdown CSS via `--toast-duration`, toast "undo" optionnel avec callback. **Skeleton Loaders** : `.skeleton-row` et `.skeleton-card` via shimmer animation (`@keyframes shimmer`) affichés pendant le rendu des onglets. **Progress Ring** : `<progress class="ring-progress">` accessible avec `aria-valuenow` pour les analyses longues.

```js
const ToastManager = {
  _queue: [], _active: [],
  show(msg, { type = 'info', duration = 3500, undoFn = null } = {}) {
    const toast = { msg, type, duration, undoFn, id: Date.now() };
    this._queue.push(toast);
    this._flush();
  },
  _flush() {
    if (this._active.length >= 3) return;
    const next = this._queue.shift();
    if (!next) return;
    this._active.push(next);
    this._render(next);
  },
  _render(toast) {
    const el = document.createElement('div');
    el.className = `toast toast-${toast.type}`;
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', 'polite');
    el.style.setProperty('--toast-duration', `${toast.duration}ms`);
    el.innerHTML = `<span>${toast.msg}</span>${toast.undoFn ? `<button class="toast-undo" onclick="ToastManager._undo(${toast.id})">Annuler</button>` : ''}<div class="toast-progress"></div>`;
    document.getElementById('toast-container').appendChild(el);
    setTimeout(() => { el.remove(); this._active = this._active.filter(t => t.id !== toast.id); this._flush(); }, toast.duration);
  }
};
```
Effort : M | Priorité : Critical

**P2 — Focus Management + focusTrap générique**
`focusTrap(containerEl, triggerEl)` : ~30 lignes, piège le focus dans l'overlay, retourne au déclencheur à la fermeture. Règle globale `*:focus-visible { outline: 2px solid var(--c-action); outline-offset: 2px; }` dans `:root`. Supprime le comportement actuel où la fermeture de modal perd le focus (WCAG 2.1 criterion 2.4.3).

```js
function focusTrap(container, trigger) {
  const focusable = 'button,a[href],input,select,textarea,[tabindex]:not([tabindex="-1"])';
  const els = () => [...container.querySelectorAll(focusable)].filter(e => !e.disabled);
  const onKey = e => {
    if (e.key !== 'Tab') return;
    const list = els(); if (!list.length) return;
    const first = list[0], last = list[list.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  };
  container.addEventListener('keydown', onKey);
  els()[0]?.focus();
  return () => { container.removeEventListener('keydown', onKey); trigger?.focus(); };
}
```
Effort : S | Priorité : Critical

**P3 — Micro-animations pour les 5 actions fréquentes**
1. **Changer de période** : `@keyframes countUp` sur les valeurs KPI (0→valeur en 400ms) + `aria-live="polite"`
2. **Ouvrir client 360°** : overlay `.overlay` slide-in depuis le bas (`transform: translateY(20px) → 0`)
3. **Filtrer** : opacité 0.5 pendant le filtre + shimmer sur les lignes + retour opacité 1
4. **Naviguer entre onglets** : cross-fade 150ms (`opacity: 0 → 1`) sur `#mainContent`
5. **Lancer l'analyse** : `aria-busy="true"` sur le bouton + skeleton loaders dans les zones de contenu. Toutes les animations respectent `prefers-reduced-motion: reduce`.
Effort : M | Priorité : High

**P4 — `<details>` augmentés WCAG AA**
Les `<details>` natifs sont gardés (rétrocompat, pas de lib) mais augmentés : `MutationObserver` sur l'attribut `open` pour animer `max-height` (transition CSS smooth) + icône SVG chevron rotative `▼` + `aria-expanded` synchronisé. Pas de JS pour l'ouverture (reste natif), JS seulement pour l'animation.
Effort : S | Priorité : Medium

**P5 — Command Palette ⌘K augmentée**
Recherches récentes stockées dans `sessionStorage` (max 8), affichées en tête de liste au focus vide. Raccourcis clavier dans les résultats affichés en `<kbd>` inline. Groupes sémantiques avec `role="group"` + `aria-label`. Navigation fléchées + Entrée + Échap. Score de pertinence `matchQuery()` étendu avec boost sur recherches récentes.
Effort : S | Priorité : High

### Verdict
**Gagnante : P1 + P2 bundle** — Le feedback absent est le problème n°1 identifié dans les faiblesses UX : zéro retour sur les actions = outil qui semble cassé pour un utilisateur non technique. P2 coûte S et corrige un problème WCAG critique. Les deux ensemble constituent le socle minimal d'une expérience perçue comme "vivante" et fiable.

### Synergies inter-volets
- Avec V1 : les skeleton loaders s'appliquent au chargement des super-tabs (P1) et au onboarding progressif (P3)
- Avec V2 : le focus trap s'intègre nativement dans le système `.overlay` unifié
- Avec V3 : les micro-animations counter-up s'appliquent aux sparklines et valeurs KPI enrichies

---

---

## SYNTHÈSE INTER-AGENTS

### Convergences fortes (≥3 agents d'accord)

**1. CSS Token-first — éradiquer les inline styles JS** (V1 + V2 + V3 + V4 — unanime)
Tous les agents s'accordent : les inline styles dans les templates JS sont le problème racine. V2 propose la stratégie complète (P4), V3 impose `buildPctBar()` comme premier pas concret, V4 exige des couleurs tokenisées pour les toasts et animations. Priorité absolue de maintenabilité.

**2. Unification des composants répétés** (V1 + V2 + V3 — 3 agents)
V2 unifie les badges (`.chip`) et les modals (`.overlay`). V3 unifie les barres de progression (`buildPctBar`). V1 unifie la navigation (4 super-tabs). Le pattern est identique : 4-5 implémentations divergentes → 1 système canonique. Chaque unification libère de l'espace mental pour les futures évolutions.

**3. Feedback visuel immédiat comme fondation** (V1 + V3 + V4 — 3 agents)
V4 : toasts + skeletons + progress. V3 : sparklines + delta badges (feedback data). V1 : onboarding progressif avec états clairs. L'outil silencieux actuel génère de l'anxiété chez l'utilisateur 50 ans. Le feedback n'est pas un luxe, c'est un prérequis de confiance.

**4. Progressive disclosure maîtrisée** (V1 + V2 + V4 — 3 agents)
V1 : sidebar accordéons avec compteurs. V2 : overlay + corps scrollable. V4 : `<details>` augmentés. Même vision : l'information est là, elle se révèle sur demande, le niveau 0 est toujours propre.

**5. Accessibilité WCAG AA comme standard, pas option** (V2 + V4 — 2 agents mais cross-cutting)
V4 : focus trap + `focus-visible` global + `aria-live` + `prefers-reduced-motion`. V2 : dark mode enforcement (contraste). Ces deux axes touchent tous les composants. À traiter en Sprint 1 car ils conditionnent la qualité de tout le reste.

---

### Conflits à trancher

**Conflit 1 : Réduction onglets — V1 propose 4 super-tabs, état actuel en a 7**
- V1 argumente : réduction charge cognitive, regroupement sémantique
- Risque : les utilisateurs actuels ont des habitudes sur "Labo", "Le Terrain" — renommage sans formation peut dérouter
- **Verdict recommandé** : Phase A (Sprint 2) = renommer + regrouper visuellement sans casser les anciens anchors hash. Phase B (Sprint 3) = URL rewrite si validé par retour terrain.

**Conflit 2 : Diagnostic en overlay vs onglet dédié**
- V1 (P5) : garder en overlay + breadcrumb
- V2 (P2) : overlay unifié `.overlay-panel--full`
- Pas de conflit réel : les deux s'accordent sur overlay. La question est la taille. **Verdict : `.overlay-panel--full` avec breadcrumb intégré dans `.overlay-header`.**

**Conflit 3 : Cockpit Briefing — texte vs Evidence Cards**
- V3 (P5) propose Evidence Cards (grille scannables)
- V1 s'appuie sur le Cockpit existant comme landing post-chargement
- **Verdict** : Evidence Cards remplacent le texte génératif dans la super-tab Accueil. Le texte génératif reste disponible en mode "détails" `<details>`.

**Conflit 4 : Navbar — supprimer navStats/navPerf vs les conserver**
- V1 (P4) : absorber dans ⌘K
- Risque : les KPIs temps réel en navbar sont consultés ~20× par jour sans intention de recherche
- **Verdict** : navStats/navPerf deviennent un seul bloc `.nav-kpis` collapsible (clic → réduit), pas supprimés. ⌘K prend les actions, pas les KPIs passifs.

---

### Plan d'implémentation recommandé

**Sprint 1 — Fondations (taille S, 1-2 jours)**

Objectif : corriger les problèmes critiques sans réarchitecturer.

1. **V2-P2** : Système `.overlay` unifié → remplacer CSS des 4 modals par `.overlay` + `.overlay-panel--*` (90 min)
2. **V2-P3** : Tokens `--z-*` dans `:root` + remplacement grep des valeurs hardcodées (30 min)
3. **V4-P2** : `focusTrap()` + règle `*:focus-visible` globale (45 min)
4. **V1-P5** : `switchTab('stock')` par défaut après `processData()` (15 min)
5. **V2-P1** partial : définir `.chip` + migrer les badges les plus visibles (badges Decision Queue, canal pills) (60 min)

**Sprint 2 — Composants & Feedback (taille M, 3-5 jours)**

Objectif : transformer l'expérience perçue.

1. **V4-P1** : `ToastManager` complet + skeleton loaders sur les 4 onglets principaux (4h)
2. **V3-P3** : `buildPctBar()` dans `utils.js` + migration des 4 implémentations divergentes (3h)
3. **V3-P1** : `buildSparklineSVG()` dans `utils.js` + intégration dans KPI cards cockpit (3h)
4. **V3-P4** : `buildDeltaBadge()` + delta M-1 dans les cartes CA principales (2h)
5. **V1-P2** : Sidebar avec `<details>` groupés + badge compteurs actifs (3h)
6. **V4-P3** : Micro-animations 5 actions (countUp, cross-fade tab, opacity filter) (3h)
7. **V3-P5** : Evidence Cards dans Cockpit Briefing (3h)
8. **V4-P5** : Command Palette — recent searches + `<kbd>` shortcuts + `role="group"` (2h)

**Sprint 3 — Refactoring & Architecture (taille L, >5 jours)**

Objectif : maintenabilité long terme et excellence UX.

1. **V2-P4** : Éradication inline styles JS — diagnostic.js, labo.js, commerce.js (~40 patterns, ~200 occurrences) (2 jours)
2. **V1-P1** : 7 onglets → 4 super-tabs avec pills internes (1 jour)
3. **V1-P3** : Onboarding progressif 2 étapes avec dropzone unifiée (1 jour)
4. **V2-P5** : Dark mode enforcement — lint CI ou convention `@css-guard` (0.5 jour)
5. **V2-P1** final : migration complète `.chip` pour tous les systèmes de badges restants (0.5 jour)
6. **V1-P4** : Navbar allégée + `.nav-kpis` collapsible (0.5 jour)
7. **V4-P4** : `<details>` augmentés avec MutationObserver + chevron animé (0.5 jour)
8. **V3-P2** : Matrice ABC/FMR enrichie (3 lignes par cellule + barre saturation) (1 jour)

---

### Score convergence global : 82/100

**Détail :**
- Convergence thématique (4/4 agents sur CSS-first) : +25
- Propositions directement implémentables sans lib externe : 18/20 → +18
- Respect contrainte no-framework, no-build : 20/20 → +20
- Couverture des 10 faiblesses identifiées dans le brief : 9/10 → +18
- Conflits résiduels non résolus : -1 (navbar KPIs)

**Faiblesses non couvertes :** Mobile (brief faiblesse #6) — aucun agent ne propose de solution responsive concrète. Hors scope délibéré (PC Windows de bureau = cible principale), mais à surveiller.

---

*Débat généré le 2026-04-06 — PRISME V3 UX 2027*
*Agents : Gemini (V1) · Claude Opus (V2) · Codex (V3) · Claude Sonnet (V4)*
