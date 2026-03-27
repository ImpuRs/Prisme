# SYNTHÈSE FINALE — PRISME Le Réseau : Relecture V3
*Débat 4 rounds — 4 participants : Gemini (Architecte Pragmatique), Codex (Ingénieur Refactoring), Claude Sonnet (Spécialiste Perf Front), Claude Opus (Gardien Métier)*
*Date : 2026-03-28*

---

## Résumé Exécutif

Les 4 questions de relecture aboutissent à des décisions claires et compatibles entre elles. Le consensus dominant : **faire d'abord ce qui est honnête**, puis ce qui est utile. La règle d'or du Gardien Métier ("un filtre partiel non étiqueté est pire que l'absence de filtre") est validée par Sonnet et Codex sur les rounds 2 et 3. Le ranking dynamique (Round 4) est le quick-win le plus simple à livrer.

---

## Round 1 — INVERSION DU REGARD

### Décision : Double colonne + label positionnel explicite (Codex + Gardien compromis)

**Ce qu'on implémente :**
- Layout `grid md:grid-cols-2` pour `obsFamiliesLose` (gauche) et `obsFamiliesWin` (droite)
- Renommer les sections : "Le réseau fait mieux que toi" | "Tu fais mieux que le réseau"
- Ajouter une ligne dans `renderObservatoire()` : calcul `pdmTrend` positionnel

**Label obligatoire (wording exact) :**
```
"Position vs bassin" — pas "Tendance", jamais une flèche ↑↓ sans données N-1
```

**Ce qu'on n'implémente PAS :**
- Toggle "Vue AG22 / Vue Réseau" (Gemini) — même données, interaction superflue
- Flèche directionnelle avec verbe de mouvement (Sonnet avait proposé "Vous gagnez" — corrigé en "Position : au-dessus du bassin")
- Toute notion de tendance temporelle sans `ventesParMagasinN1`

**Chemin vers la vraie tendance (futur) :**
Les dates BL sont présentes dans le fichier Consommé. Découper `ventesParMagasin` en S1/S2 au parsing = prérequis Feature A+. Effort modéré, sprint suivant le Canal Global.

**Structures `_S` :** aucune nouvelle — réorganisation render uniquement.

---

## Round 2 — SIMPLIFICATION / REGROUPEMENT

### Décision : Accordion 8/13 + fusion orphelins/missed + supprimer under + sidebar période

**Réorganisation des 13 pavés :**

| Statut | Pavé | Défaut |
|--------|------|--------|
| ✅ Ouvert | Observatoire KPIs (obsKpis) | Ouvert |
| ✅ Ouvert | Diagnostic auto + Plan d'action | Ouvert |
| ✅ Ouvert | Forces & Faiblesses (familyPerf) | Ouvert |
| ✅ Ouvert | Classement agences (storePerf) | Ouvert |
| ✅ Ouvert | **Articles réseau non référencés** *(fusion missed + orphelins)* | Ouvert |
| 🔽 Fermé | Articles surperformants (over) | Fermé — badge count |
| 🔽 Fermé | Heatmap réseau 20 familles | Fermé — badge "X fam. en rouge" |
| 🔽 Fermé | Familles perdantes détail (obsFamiliesLose) | Fermé — badge count |
| 🔽 Fermé | Familles gagnantes détail (obsFamiliesWin) | Fermé — badge count |
| 🔽 Fermé | Pépites (pepites + pepitesOther) | Fermé — badge count |
| 🔽 Fermé | Nomades | Fermé — badge count |
| 🔽 Fermé | Fuites par métier | Fermé — badge count |
| 🔽 Fermé | Nomades × Articles manquants | Fermé — badge count |
| ❌ Supprimé | **Articles sous-performants (under)** | Supprimé — redondant avec familyPerf |

**Fusion missed + orphelins :**
Vue unifiée "Articles réseau non référencés", deux sous-sections distinctes dans le même pavé :
- Section A — "Absents de votre stock" (missed) — action : référencer
- Section B — "Présents chez ≥50% du réseau, absents ici" (orphelins) — action : vérifier gamme

Score de priorité composite pour le tri de la Section A :
```js
// priority ∈ [0,1], trié DESC
const priority = (m) =>
  (m.sc / totalAgences) * 0.4          // couverture réseau normalisée
  + Math.min(m.bassinFreq / 50, 1)*0.4 // fréquence normalisée (plafond 50 BL)
  + (m.myStock === 0 ? 0.2 : 0);       // urgence : stock zéro
```

**Sidebar gauche — filtres à ajouter :**
| Filtre | Décision | Raison |
|--------|----------|--------|
| Bassin (existant) | ✅ Conserver | Neutre, symétrique |
| Univers (existant) | ✅ Conserver | Filtre symétrique tous magasins |
| MinCA (existant) | ✅ Conserver | Réduit le bruit |
| Mode comparaison (existant) | ✅ Conserver | Côté client |
| **Période 12M/6M/YTD** | ✅ **Ajouter** | Filtre sur `_getFilteredMonths`, valeur analytique élevée |
| Canal | ❌ **Refuser** | `articleCanalCA` agence-only — biais de comparaison garanti |
| Commercial | ❌ **Refuser** | Idem : pas de données commercial pour les autres agences |

**`priorityScore` réseau par famille (Gardien) :**
```js
// Dans computeBenchmark(), après calcul familyPerf
for (const fp of _S.benchLists.familyPerf) {
  const ecartAbs = Math.abs(fp.ecart) / 100;        // 0-1
  const pdmW = (famPDM[fp.fam] || 0) / 100;         // 0-1
  const caW = (myFamCA[fp.fam]||0) / (myTotalCA||1); // poids CA
  fp.priorityScore = ecartAbs * (1-pdmW) * caW;     // urgence × opportunité × poids
}
_S.benchLists.familyPerf.sort((a,b)=>b.priorityScore-a.priorityScore);
```

**Structures `_S` à ajouter :**
- `_S._globalPeriodePreset` : déjà existant (Feature A) ✅ — l'activer dans la sidebar réseau

---

## Round 3 — FILTRE CANAL DANS LE RÉSEAU

### Décision : Sections légitimement filtrables + overlay KPI cards + bloquer F&F et classement

**Règle fondamentale (Gardien + Sonnet, consensus 2/4, position majoritaire) :**
> Comparer "mon agence filtrée sur canal X" vs "médiane réseau tous canaux" produit un biais de lecture garanti et invisible pour l'utilisateur. Cette comparaison est INTERDITE sauf mention explicite.

**Sections filtrables SANS biais (implémentation autorisée) :**

| Section | Filtrable ? | Mécanisme | Label obligatoire |
|---------|-------------|-----------|-------------------|
| KPI cards mon agence — **overlay** | ✅ | `articleCanalCA` agence-only, lecture pure | "Mon agence uniquement — aucune comparaison réseau" |
| Heatmap réseau — myStore uniquement | ✅ | Remplacer `storeFamCA[myStore]` par `articleCanalCA` côté render | Note : "Mon agence : canal X \| Réseau : tous canaux" |
| Pépites (`benchLists.pepites`) | ✅ | Filtrer par `articleCanalCA.get(code)?.has(canal)` | Même note |
| Familles perdantes/gagnantes (F&F) | ❌ | Biais comparaison agence filtrée vs réseau brut | — |
| Classement agences (storePerf) | ❌ | `ventesParMagasin` canal-invariant pour tous les stores | — |
| Articles manquants (missed) | ❌ | Idem | — |

**Implémentation overlay KPI cards :**
```js
// Bouton "par canal" sur la card "Mon agence" dans obsKpiCards
function toggleObsCanalBreakdown() {
  const el = document.getElementById('obsCanalBreakdown');
  if (!el.classList.contains('hidden')) { el.classList.add('hidden'); return; }
  const canaux = ['MAGASIN','INTERNET','REPRESENTANT','DCS','AUTRE'];
  const rows = canaux.map(canal => {
    let ca = 0;
    for (const [, cmap] of _S.articleCanalCA) ca += cmap.get(canal)?.ca || 0;
    return ca > 0 ? `<div class="flex justify-between text-xs"><span>${canal}</span><span class="font-bold">${formatEuro(ca)}</span></div>` : '';
  }).filter(Boolean);
  el.innerHTML = rows.join('') + '<p class="text-[10px] t-disabled mt-1 italic">Source : Mon agence uniquement — aucune comparaison réseau</p>';
  el.classList.remove('hidden');
}
```

**Bandeau avertissement quand un canal est actif sur les sections soft :**
```
⚠️ Filtrage partiel — Mon agence : canal [X]. Médiane réseau : tous canaux.
Ne pas interpréter les écarts comme des benchmarks comparatifs stricts.
```
Position DOM : juste après `#benchFilterBar`, `id="benchCanalBias"`, masqué par défaut.

**`_S.ventesParMagasinCanal` (Gemini) :** Reporté — effort 25+ lignes de refactoring `computeBenchmark()` + mémoire additionnelle. Déclencher uniquement si un vrai benchmark canal-aware est validé métier par Legallais.

**Structures `_S` :** aucune nouvelle — filtre via `_S._globalCanal` existant, lecture `_S.articleCanalCA` existant.

---

## Round 4 — RANKING DYNAMIQUE

### Décision : Select + ASC/DESC + normalisation freq par canaux actifs + défaut txMarge

**Implémentation choisie (Gemini + normalisation Gardien) :**

```js
// Dans renderBenchmark(), remplacer le sort existant
const _rankKey = _S._rankSortKey || 'txMarge'; // défaut : txMarge (plus stable que freq)
const _rankDir = _S._rankSortDir || -1;         // -1 = DESC

// Normalisation freq par canaux actifs (Gardien)
const _nbCanauxActifs = (store) => {
  const ca = _S.canalAgence[store] || {};
  return Math.max(1, Object.values(ca).filter(v => (v.ca||0) > 500).length);
};
const sorted = Object.entries(storePerf).sort((a,b) => {
  let va = a[1][_rankKey] ?? 0;
  let vb = b[1][_rankKey] ?? 0;
  if (_rankKey === 'freq') { va /= _nbCanauxActifs(a[0]); vb /= _nbCanauxActifs(b[0]); }
  return _rankDir * (vb - va);
});
```

**HTML sidebar ranking (à ajouter au-dessus du tableau storePerf) :**
```html
<div class="flex items-center gap-2 mb-2">
  <select id="rankSortKey" onchange="_S._rankSortKey=this.value;renderBenchmark()"
          class="text-xs s-card border b-default rounded px-2 py-1">
    <option value="txMarge">Tx marge</option>
    <option value="freq">Fréquence (normalisée)</option>
    <option value="serv">Taux service</option>
    <option value="pdm">PDM bassin</option>
  </select>
  <button onclick="_S._rankSortDir=(_S._rankSortDir||−1)*−1;renderBenchmark()"
          class="text-xs s-card border b-default rounded px-2 py-1" id="rankDirBtn">▼ DESC</button>
</div>
```

**Pourquoi txMarge par défaut (Gardien, validé par Codex) :**
- Intrinsèque au magasin, indépendant du périmètre géographique du bassin
- Directement actionnable par un chef de rayon
- PDM dépend du bassin chargé = instable selon la sélection
- Fréquence brute = biaisée par le nombre de canaux actifs

**Score composite (Codex) :** Reporté V4 — la normalisation min-max multi-critères nécessite une UI de pondération. Quick-win du select est suffisant.

**Structures `_S` à ajouter :**
```js
// state.js + resetAppState()
_S._rankSortKey = 'txMarge'; // tri par défaut
_S._rankSortDir = -1;        // DESC
```

---

## Récapitulatif des décisions

| Question | Décision | Effort | Sprint |
|----------|----------|--------|--------|
| Inversion du regard | Double colonne F&F + label "Position vs bassin" | ~1h | Immédiat |
| Suppression `under` | Supprimer la section | ~15 min | Immédiat |
| Fusion missed+orphelins | Vue unifiée 2 sous-sections + score priorité | ~2h | Immédiat |
| Accordion 8 pavés | Fermer par défaut + badges | ~1h | Immédiat |
| priorityScore famille | 6 lignes dans computeBenchmark | ~30 min | Immédiat |
| Sidebar période | Chips 12M/6M/YTD activant `_getFilteredMonths` | ~30 min | Immédiat |
| Ranking dynamique | Select txMarge/freq/serv/PDM + ASC/DESC + normalisation | ~1h | Immédiat |
| Overlay canal KPI cards | Bouton "par canal" sur obsKpiCards | ~1h | Immédiat |
| Heatmap canal (myStore) | Filtrage render + note lecture | ~1h | Après overlay |
| Pépites canal filter | articleCanalCA.has(canal) | ~30 min | Après overlay |
| **Total** | | **~9h** | |

---

## Structures `_S` à ajouter

```js
// state.js — ajouter
_S._rankSortKey = 'txMarge';
_S._rankSortDir = -1;

// resetAppState() — ajouter les mêmes
```

---

## Hors-périmètre — DÉFINITIF

| Feature | Raison |
|---------|--------|
| `_S.ventesParMagasinCanal` | Trop coûteux sans validation métier Legallais |
| Benchmark canal-aware complet | Dépend de `ventesParMagasinCanal` — reporté V4 |
| Filtre commercial dans sidebar réseau | Données commercial absentes pour les autres agences |
| Filtre canal sur F&F / classement agences | Biais de comparaison garanti — interdit |
| Score composite pondéré (ranking) | UI trop complexe — reporté V4 |
| Tendance temporelle (flèche N vs N-1) | Requiert `ventesParMagasinN1` — Feature A+ |
| Toggle "Vue AG22 / Vue Réseau" | Moins utile que la double colonne, sans info nouvelle |

---

## Ordre d'implémentation recommandé

1. **Suppression `under`** (15 min) — quick-win, zéro risque
2. **Ranking dynamique** (1h) — état `_S._rankSortKey/_rankSortDir` + select UI
3. **priorityScore** dans computeBenchmark (30 min) — tri familyPerf par urgence
4. **Accordion + badges** (1h) — 8 pavés fermés par défaut
5. **Double colonne F&F** (30 min) — layout Tailwind grid, label obligatoire
6. **Fusion missed + orphelins** (2h) — pavé unifié + score composite
7. **Sidebar période** (30 min) — chips 12M/6M/YTD
8. **Overlay canal KPI cards** (1h) — `toggleObsCanalBreakdown()`
9. **Heatmap + pépites filtrage canal** (1h30) — render-only, avec note
