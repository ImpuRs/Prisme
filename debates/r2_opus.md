## OPUS — Round 2 Rebuttals

### 1. Le double-parse est réel (a lu le code lignes 529+536)
Appel 1 (L529) : période complète, calcule W/V/MIN/MAX/ABC/FMR + toutes Maps clients.
Appel 2 (L536) : `isRefilter:true`, repositionne sur le mois récent, **re-parcourt les 516k lignes** pour recalculer `ventesClientArticle`, `articleRaw`, `ventesParMagasin`. Saute quelques blocs (store detection, `articleFamille`, L693-701) mais la boucle principale itère toutes les lignes. Coût ~60-70% du premier appel. **Gain : 8-12s**.

### 2. `ws['!data']` vs `sheet_to_json({header:1})` — Gemini se trompe à moitié
| Approche | Allocations | Copie mémoire |
|---|---|---|
| `sheet_to_json()` défaut | 516k objets + clés string | Copie complète |
| `sheet_to_json({header:1})` | 516k arrays | Copie complète |
| `ws['!data']` direct | **0 allocation supplémentaire** | **Zéro copie** |

`ws['!data']` est le format interne natif de SheetJS avec `dense:true`. Strictement supérieur. Seul prérequis : vérifier que `dense:true` est passé dans `xlsx-worker.js` (c'est le cas par défaut SheetJS >= 0.20).

### 3. Multi-workers de Codex — Sur-ingénierie injustifiée
1. `xlsx-stream-reader` est un package npm avec dépendances Node — incompatible ESM natif sans bundler.
2. Le parsing XLSX est un bloc atomique (SheetJS décompresse ZIP + parse XML en une seule passe) — non parallélisable.
3. La boucle d'agrégation est séquentielle par nature (accumulation dans Maps partagées).
**Un seul Worker est le bon compromis.**

### 4. Convergence avec Gemini sur Worker
Accord sur le principe : les 516k lignes ne traversent jamais postMessage. Divergence sur TypedArrays : trop complexe (encoder/décoder Maps avec clés string). Un simple `postMessage` des Maps agrégées (~5-15k entrées) est suffisant (<50ms).

### Plan convergent — 3 étapes

**Étape 1 — Accès dense sans sheet_to_json (-10-15s)**
- `XLSX.read(data, {dense:true})` dans xlsx-worker.js, accès `ws['!data']` direct
- Mapper indices colonnes une seule fois sur `ws['!data'][0]`
- Inclut le pre-mapping O(1) de Sonnet

**Étape 2 — Boucle d'agrégation dans le Worker (-5-8s)**
- Déplacer boucle L691+ dans le Worker
- `postMessage` transfère uniquement les agrégats (~10-50k entrées)
- 516k lignes restent confinées dans le Worker (convergence Gemini)

**Étape 3 — Éliminer le double-parse par accumulation mensuelle (-8-12s)**
- Accumuler par mois pendant la boucle unique
- Filtre période → somme des mois sélectionnés O(n_articles × 12) au lieu de O(516k)
- Supprimer L536 (second appel isRefilter)
- **Bonus** : changements de période instantanés (<50ms)

| Étape | Gain | Risque |
|---|---|---|
| 1 — Dense direct | 10-15s | Faible |
| 2 — Agrégation Worker | 5-8s | Moyen |
| 3 — Accum. mensuelle | 8-12s | Moyen-élevé |
| **Total** | **23-35s** sur ~45s | |
