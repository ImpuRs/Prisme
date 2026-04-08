## OPUS (Claude Opus) — Round 1

### 1. Diagnostic : où vont les 38s ?

(Analyse basée sur lecture du code réel)

| Phase | Durée estimée | Cause |
|---|---|---|
| `readExcel` (SheetJS `XLSX.read` + `sheet_to_json`) | **~12-15s** | 82Mo XLSX → décompression ZIP + parsing XML + conversion 516k objets JSON avec clés string |
| Boucle consommé (lignes 691-758 main.js) | **~18-22s** | 516k itérations, chaque ligne : extractStoreCode, cleanCode, extractClientCode, parseExcelDate, ~15 colonnes, ~12 Maps |
| Boucle stock (~65k lignes) | ~1-2s | Peu de lignes |
| `computeABCFMR` + enrichissements | ~0.5s | Linéaire sur finalData |
| IDB save | ~0.3s | Non bloquant si bien fait |

**Points critiques identifiés dans le code :**

1. **`sheet_to_json` avec `defval:''`** : crée un objet `{cleLongue: valeur}` par ligne. 516k × 26 colonnes = **13.4M property accesses** rien que pour la construction. `dense:true` est passé à `XLSX.read` mais `sheet_to_json` l'annule en reconstruisant des objets.

2. **Double-parse** : `processData` appelle `processDataFromRaw` DEUX FOIS (lignes 529 + 536) — une fois full-period, une fois filtered → double le parsing de 516k lignes.

3. **Pre-mapping `CI` existe** mais accès restent via `row[CI.xxx]` sur objets JSON clés string, pas tableaux indexés.

4. **`parseExcelDate` à chaque ligne** avec tests de type et branchements.

### 2. Architecture proposée

#### Phase A — Worker Pipeline (gain majeur : -20s)

```
[Main thread]                          [Parse Worker]
  |                                       |
  |-- postMessage(ArrayBuffer) ---------->|
  |                                       |-- XLSX.read(buf, {type:'array', dense:true})
  |                                       |-- PAS de sheet_to_json
  |                                       |-- Lecture directe ws['!data'][row][col]
  |                                       |-- Boucle 516k lignes avec accès array[colIdx]
  |                                       |-- Produit directement les agrégats
  |  <-- postMessage(Transferable) -------|
  |
  |-- Hydrate _S (instantané)
  |-- computeABCFMR (~0.5s)
  |-- Render
```

**Ne jamais appeler `sheet_to_json`** — lire directement `ws['!data']` avec index numériques. Élimine la création de 516k objets + GC pressure + property lookup par nom.

#### Phase B — Éliminer le double-parse

1. Parser une seule fois, accumuler par mois (comme `monthlySales` le fait déjà)
2. Agrégats période-dépendants stockent totaux par mois
3. Filtre période → sommation des mois (O(articles×12)) au lieu de re-itérer 516k lignes

Coût : ~30% de mémoire en plus sur les maps clients, mais refilter passe de 18s à <0.1s.

#### Phase C — Hash-check IDB corrigé

1. **Un seul point de sauvegarde** : après que tous les workers ont terminé via `Promise.all`
2. `_saveFileHashes` appelée immédiatement après `_saveSessionToIDB` resolve
3. Le guard `_idbSaving` est déjà en place — ne plus appeler en cascade

### 3. Ordre de priorité

**P1 — Accès dense sans `sheet_to_json`** (gain : **-10 à 15s**)
Remplacer `sheet_to_json` par lecture directe `ws['!data']` dans le Worker. Réduit SheetJS de ~13s à ~5s et la boucle de ~20s à ~8s. Changement localisé, pas de touche à la logique métier.

**P2 — Boucle consommé dans le Worker** (gain : **-5 à 8s**)
Déplacer la boucle d'agrégation (lignes 691-758) dans le Worker. Main thread hydrate les résultats + rendu.

**P3 — Éliminer le double-parse** (gain : **-8 à 15s**)
Accumuler par mois + refilter par sommation. Élimine complètement le 2ème appel `processDataFromRaw`.

**Gain cumulé estimé : 38s → 5-8s sur Intel PC.**

### 4. Risques et garde-fous

- **Régression colonnes** : mapping `CI` flexible (recherche sous-chaîne). En mode dense, reconstruire sur `headers[0]`. → Test unitaire sur headers Qlik réels (fixture)
- **Sérialisation Worker → Main** : Maps JS non transferables → `Array<[key, value]>` + `serializeMap/deserializeMap`
- **`dense:true` + cellules vides** : SheetJS met `undefined` au lieu de `''` → Worker normalise avant passage
- **Perte `isRefilter`** : si on élimine le double-parse, recalcul `canalAgence` pour `isRefilter` doit être réécrit. → Implémenter P3 en dernier, garder `processDataFromRaw` avec `isRefilter` comme fallback pendant transition
- **IDB quota** : ne PAS stocker données brutes. Agrégats uniquement (~30% plus gros mais <50Mo)

---
**Position claire** : L'élimination de `sheet_to_json` au profit de l'accès dense direct est le gain le plus immédiat et le moins risqué. Changement localisé qui peut diviser le temps total par 2-3 seul.
