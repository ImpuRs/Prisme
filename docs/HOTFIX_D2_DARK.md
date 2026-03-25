# HOTFIX D2 — Dark mode : textes invisibles
# Claude Code : exécuter immédiatement après le Sprint 3

---

## PROBLÈME

En mode `#dark`, les classes Tailwind couleur dans le **HTML statique** de `index.html` ne réagissent pas aux tokens.
Résultat : texte sombre (`text-gray-800`) sur fond sombre (`bg-white` qui reste blanc au lieu de devenir sombre).

Les tokens sémantiques sont en place mais le HTML statique utilise encore des classes Tailwind directes.

## SOLUTION

Migrer les classes Tailwind couleur **dans le HTML statique** de `index.html` (les balises écrites en dur, PAS le JS).

## ÉTAPE 1 — bg-white → s-card

Chercher toutes les occurrences de `bg-white` dans les balises HTML de `index.html`.
Remplacer `bg-white` par `s-card` SAUF dans les `<input>` et `<select>` (les formulaires gardent `bg-white` pour la lisibilité).

```
Pour les div, section, button (hors inputs) :
  bg-white → s-card
```

**Cas particuliers** :
- `<input ... bg-white>` → GARDER `bg-white` (les champs de formulaire restent blancs par défaut, on les traitera en V2 avec des tokens spécifiques `--s-input`)
- `<select ... bg-white>` → GARDER idem
- `bg-blue-50` dans le bloc KPI CA COMPTOIR → remplacer par `i-info-bg`

## ÉTAPE 2 — text-gray-800 → t-primary

```
text-gray-800 → t-primary
```

Concerne ~15 occurrences. Toutes dans le HTML statique.

## ÉTAPE 3 — text-gray-500/600/700 → tokens texte

```
text-gray-500 → t-tertiary
text-gray-600 → t-secondary
text-gray-700 → t-primary
```

Concerne le HTML statique uniquement. Vérifier le contexte :
- Si le texte est sur un fond clair (carte blanche) → utiliser les tokens standard
- Si le texte est déjà sur un fond sombre (panneau s-panel) → utiliser `t-inverse` ou `t-inverse-muted`

## ÉTAPE 4 — text-gray-300/400 → tokens

```
text-gray-300 → t-disabled  (contexte clair)
text-gray-400 → t-disabled  (contexte clair)
```

Pour les `×` et `=` dans l'équation KPI, qui sont des séparateurs visuels sur fond clair.

## ÉTAPE 5 — border-gray / border-blue dans le HTML

```
border-gray-200 → b-default  (si pas déjà fait)
border-gray-300 → b-default
border-blue-200 → b-default  (ou garder si intentionnel pour la card CA COMPTOIR)
```

## ÉTAPE 6 — text-blue-500/700 dans le HTML statique

```
text-blue-500 → c-action
text-blue-700 → c-action
```

## ÉTAPE 7 — text-white dans le HTML

Pour les `text-white` qui sont sur un fond sombre via classe Tailwind (comme navbar `bg-gray-900`) :
- Si le parent utilise `s-panel` ou `s-panel-inner` → remplacer `text-white` par `t-inverse`
- Si le parent est un badge coloré (`bg-emerald-500`, `bg-red-500`, etc.) → GARDER `text-white` (le fond reste coloré dans tous les thèmes)

## NE PAS TOUCHER

- Les classes Tailwind dans les templates JS (`js/main.js`, `js/ui.js`, etc.) — trop nombreuses pour ce hotfix, V2
- Les `<input>` et `<select>` `bg-white` — ils nécessitent un token `--s-input` dédié
- Les couleurs spécifiques des badges/pills (`bg-emerald-500`, `text-rose-400`, etc.)
- Le spectre PRISME et les `--tab-*`

## COMMIT

```bash
git add -A && git commit -m "fix(D2): dark mode — migrate Tailwind color classes in static HTML for theme reactivity"
```

## TEST

1. Ouvrir `index.html` (sans hash) → doit être identique à avant
2. Ouvrir `index.html#dark` → les KPI cards doivent avoir le texte lisible, le Briefing du Matin lisible, la File de Décision lisible
3. Ouvrir `index.html#light` → tout doit être clair et lisible

Le JS (templates dans main.js) aura encore des classes Tailwind non migrées → certains éléments dynamiques ne réagiront pas parfaitement en dark. C'est la V2 du theme switch.
