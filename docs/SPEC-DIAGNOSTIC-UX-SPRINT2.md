# SPEC — Diagnostic UX Sprint 2 : Voyant Clients (V2) enrichi

**Date :** 2026-03-25  
**Fichier cible :** `js/diagnostic.js` (principalement `_diagRenderV2`, L459-505)  
**Prérequis :** Sprint 1 terminé (bandeau, plan remonté, pills V3, disclosure V1)  
**Effort estimé :** ~1 journée (S+M)  
**Source :** Débat Octopus — Volet 4 (Opus P1, P2, P3, P5)  

---

## Contexte

Le voyant V2 "Mes Clients" affiche actuellement les top 3 métiers avec des compteurs bruts (actifs PDV, actifs sans achat, perdus). C'est informatif mais pas prescriptif. Le commercial ne sait pas *quel métier traiter en priorité* ni *combien de terrain il couvre*.

Sprint 2 transforme V2 en tableau de bord prescriptif : jauges visuelles de pénétration, badges reconquête cliquables, et focus automatique sur les urgences.

---

## Action 1 — Focus urgences par défaut (Opus P5)

### Quoi
À l'ouverture du diagnostic, seuls les métiers urgents sont visibles. Le reste est replié dans un `<details>`.

### Critères d'urgence
Un métier est "urgent" si l'une de ces conditions est vraie :
- **Pénétration PDV < 40%** : `m.p5 / m.total < 0.4` (moins de 40% des clients du métier achètent chez nous sur cette famille)
- **Perdus ≥ 3** : `(m.p2 + m.p3) >= 3`

### Modification dans `_diagRenderV2()` (L486-504, mode famille)

Séparer les métiers en deux groupes :
```js
const urgents = v.metiers.filter(m => {
  const penPDV = m.total > 0 ? m.p5 / m.total : 0;
  return penPDV < 0.4 || (m.p2 + m.p3) >= 3;
});
const secondaires = v.metiers.filter(m => !urgents.includes(m));
```

### Rendu
```
[Métiers urgents : affichés directement, avec carte enrichie]

<details>
  <summary class="text-[10px] t-inverse-muted cursor-pointer mt-2">
    ▸ {secondaires.length} autre(s) métier(s) — situation saine
  </summary>
  [Métiers secondaires : cartes simples, style actuel]
</details>
```

Si TOUS les métiers sont urgents → pas de `<details>`, tout est affiché.  
Si AUCUN métier n'est urgent → afficher le premier métier + replier le reste.

### Aussi appliquer au mode cellPanel
Dans `_diagRenderV2()` mode `v.cellMode` (L463-484), appliquer la même logique de split urgent/secondaire.

---

## Action 2 — Jauges de pénétration par métier (Opus P1)

### Quoi
Ajouter une barre de progression CSS inline par métier, montrant le taux de pénétration PDV. Triée par taux croissant (les plus faibles = les urgences en haut).

### Calcul
La donnée existe déjà dans V2. Pour chaque métier `m` :
```js
const penPDV = m.total > 0 ? Math.round(m.p5 / m.total * 100) : 0;
```

Où `m.p5` = clients actifs PDV (prio 5) et `m.total` = total clients du métier dans la zone.

### Tri
Avant de rendre les cartes métier, trier par pénétration croissante :
```js
v.metiers.sort((a, b) => {
  const penA = a.total > 0 ? a.p5 / a.total : 1;
  const penB = b.total > 0 ? b.p5 / b.total : 1;
  return penA - penB; // plus faible pénétration en premier
});
```

### Rendu HTML (dans chaque carte métier)
Insérer après le header du métier (nom + % acheteurs) :
```html
<div class="mt-1.5 mb-2">
  <div class="flex items-center gap-2">
    <span class="text-[10px] t-inverse-muted w-24 shrink-0">Pénétration PDV</span>
    <div class="flex-1 h-2 rounded-full bg-slate-700/50 overflow-hidden">
      <div class="h-full rounded-full transition-all" 
           style="width: {penPDV}%; background: {couleur}"></div>
    </div>
    <span class="text-[10px] font-bold {couleurTexte} w-10 text-right">{penPDV}%</span>
  </div>
</div>
```

### Couleur de la jauge
```js
const couleur = penPDV >= 60 ? '#22c55e'   // vert — bonne pénétration
              : penPDV >= 40 ? '#f59e0b'   // orange — attention
              :                '#ef4444';  // rouge — urgence
const couleurTexte = penPDV >= 60 ? 'c-ok' : penPDV >= 40 ? 'c-caution' : 'c-danger';
```

### Légende compacte sous la jauge (optionnel mais utile)
```html
<p class="text-[10px] t-inverse-muted mt-0.5">
  {m.p5} actifs / {m.total} dans votre zone
</p>
```

---

## Action 3 — Badges reconquête cliquables (Opus P2)

### Quoi
Ajouter un badge inline "⚠️ N perdus" sur chaque carte métier qui a des clients perdus (prio 2 ou 3). Au clic, le badge filtre la liste des clients du métier pour ne montrer que les perdus.

### Source de données
La donnée existe déjà. Chaque métier `m` dans `v.metiers` contient :
- `m.p2` : inactifs récents (inactif 2026 mais pas 2025)
- `m.p3` : perdus/inactifs durables  
- `m.clients` : tableau complet avec champ `prio` par client
- `m.potentiel` : potentiel € calculé

Aussi, la cohorte reconquête est dans `_S.reconquestCohort` (calculée dans engine.js L542-562). On peut croiser : un client est dans la cohorte reconquête s'il apparaît dans `_S.reconquestCohort.find(r => r.cc === client.code)`.

### Rendu du badge
Insérer dans le header de la carte métier, à côté du nom :
```html
<!-- Si m.p2 + m.p3 > 0 -->
<button onclick="toggleReconquestFilter('{metierEsc}', this)" 
        class="diag-reconquest-badge text-[9px] font-bold px-2 py-0.5 rounded-full 
               bg-red-900/40 text-red-400 border border-red-800/50 
               hover:bg-red-900/60 hover:text-red-300 transition-colors cursor-pointer"
        title="Cliquer pour voir les {m.p2 + m.p3} clients perdus">
  ⚠️ {m.p2 + m.p3} perdu{(m.p2+m.p3)>1?'s':''}
</button>
```

Si le potentiel est significatif (> 500€), ajouter le montant dans le badge :
```
⚠️ 3 perdus · 860 €
```

### Toggle JS
Créer une fonction `toggleReconquestFilter(metier, btn)` (exposée globalement via window) :

```js
function toggleReconquestFilter(metier, btn) {
  const isActive = btn.classList.contains('diag-reconquest-active');
  // Reset tous les badges
  document.querySelectorAll('.diag-reconquest-badge').forEach(b => {
    b.classList.remove('diag-reconquest-active');
  });
  // Toggle les lignes clients
  const metierBlock = btn.closest('.diag-metier-block');
  if (!metierBlock) return;
  const clientRows = metierBlock.querySelectorAll('.diag-client-row');
  if (isActive) {
    // Désactiver le filtre → montrer tous
    clientRows.forEach(r => r.classList.remove('hidden'));
    btn.classList.remove('diag-reconquest-active');
  } else {
    // Activer le filtre → ne montrer que prio 2 et 3
    clientRows.forEach(r => {
      const prio = parseInt(r.dataset.prio || '0');
      r.classList.toggle('hidden', prio !== 2 && prio !== 3);
    });
    btn.classList.add('diag-reconquest-active');
  }
}
```

### Enrichir les lignes clients existantes
Dans le rendu des clients (actuellement via le bouton "Voir dans l'onglet Le Terrain"), ajouter `data-prio` et une classe `diag-client-row` sur chaque ligne client :

```html
<div class="diag-client-row" data-prio="{c.prio}">
  ...contenu existant...
</div>
```

### CSS pour le badge actif
```css
.diag-reconquest-active {
  background: rgba(239, 68, 68, 0.3) !important;
  border-color: #ef4444 !important;
  color: #fca5a5 !important;
  box-shadow: 0 0 0 1px rgba(239, 68, 68, 0.3);
}
```

### Score reconquête (enrichissement optionnel)
Si le client est dans `_S.reconquestCohort`, afficher son score comme indicateur de priorité :
```js
const reconquestEntry = _S.reconquestCohort.find(r => r.cc === c.code);
const reconquestScore = reconquestEntry ? reconquestEntry.score : 0;
```
Afficher comme tooltip ou petit badge sur la ligne client : `title="Score reconquête : ${reconquestScore}"`.

---

## Action 4 — Montant € potentiel en tête de carte métier (Codex P3)

### Quoi
Afficher le montant € potentiel en gros, les compteurs clients en sous-titre. Inverser la hiérarchie actuelle qui met les compteurs d'abord.

### Actuellement (L495-496)
```
→ 45 clients dans votre zone · 12 actifs PDV (27%) · 8 actifs sans achat · 3 perdus
→ Potentiel récupérable : 860 €
```

### Après
```
💶 860 € potentiel récupérable
→ 45 clients zone · 12 actifs PDV · 8 sans achat · 3 perdus
```

### Rendu
Si le potentiel est > 0 :
```html
<p class="text-base font-extrabold c-caution mb-1">
  💶 {formatEuro(m.potentiel)} potentiel récupérable
</p>
<p class="text-[10px] t-inverse-muted">
  {m.total} clients zone · {m.p5} actifs PDV · {m.p1} sans achat · {m.p2+m.p3} perdus
</p>
```

Si le potentiel est 0 (pas de perdu) :
```html
<p class="text-[11px] t-inverse mb-1">
  → <strong class="text-white">{m.total}</strong> clients · 
  <span class="c-ok">{m.p5} actifs PDV ({pctActifPDV}%)</span>
</p>
```

Le montant est en `text-base font-extrabold` (plus gros que le texte normal), les compteurs passent en `text-[10px]` en dessous. Le commercial voit le chiffre d'abord.

---

## Checklist de validation

Après implémentation, vérifier :

1. **Mode famille avec chalandise chargée**
   - [ ] Métiers triés par pénétration croissante (plus faible en haut)
   - [ ] Jauges colorées (rouge < 40%, orange 40-60%, vert > 60%)
   - [ ] Badge "⚠️ N perdus" cliquable sur les métiers avec perdus
   - [ ] Clic badge → filtre les clients, re-clic → remet tous
   - [ ] Montant € potentiel en gros avant les compteurs
   - [ ] Métiers urgents visibles, secondaires repliés dans `<details>`

2. **Mode case Radar (cellMode)**
   - [ ] Mêmes jauges et badges dans le mode cellPanel
   - [ ] Données correctes (croisement articles case × acheteurs)

3. **Mode métier**
   - [ ] Si ouvert depuis Le Terrain, V2 pas affiché (mode métier utilise L1-L4)
   - [ ] Pas de régression

4. **Cas limites**
   - [ ] Chalandise non chargée → V2 verrouillé (pas de jauges)
   - [ ] 0 clients perdus → pas de badge reconquête
   - [ ] Métier avec 1 seul client → jauge à 0% ou 100% (pas de NaN)
   - [ ] Potentiel = 0 → pas de ligne "💶 0 €"
   - [ ] Tous métiers sains → pas de `<details>`, affichage normal

5. **Cohérence données**
   - [ ] `m.p5 / m.total` correspond à ce que montre l'onglet Le Terrain
   - [ ] Reconquête cohort croisée correctement (même codes clients)

---

## Ce qui NE change PAS dans ce sprint

- `_diagVoyant2()` — la logique data ne change pas, on ne touche qu'au rendu
- Les prios clients (1-5) restent identiques (engine.js `_diagClientPrio`)
- La cohorte reconquête (engine.js `computeReconquestCohort`) reste identique
- Le bouton "Voir dans l'onglet Le Terrain" reste tel quel
- Le mode 3-voyant et le mode cellPanel restent deux branches dans `_diagRenderV2()`

---

## Fonctions à exposer globalement

La fonction `toggleReconquestFilter` doit être accessible depuis les `onclick` inline.  
Deux options :
1. **window.toggleReconquestFilter = ...** dans diagnostic.js
2. **Exporter** dans le bloc export L915 et l'attacher au window dans main.js

Option 1 est plus simple et cohérente avec le pattern existant (`_copyDiagPlan`, `executeDiagAction` etc. sont déjà sur window).
