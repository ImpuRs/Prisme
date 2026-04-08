## SONNET — Round 1

### 1. Diagnostic : le vrai bottleneck

Le problème n'est pas SheetJS — c'est la boucle de parsing sur le main thread qui bloque le rendu pendant 30+ secondes.

Décomposition estimée des 38s sur Intel :

- **SheetJS `read()` sur 82Mo** : ~8-10s (décompression ZIP + parsing XML) — inévitable mais déplaçable
- **Boucle consommé 516k lignes avec `getVal()` dynamique** : ~18-22s — le vrai coupable
- **`getVal()` : lookup `headers.indexOf(colName)` à chaque appel** : O(n×colonnes) = 516k × 26 = 13M opérations de recherche de string
- **`yieldToMain()` toutes les 5000 lignes** : ajoute ~100 micro-pauses mais ne supprime pas le coût CPU

Le `getVal()` avec `indexOf` répété est une boucle chaude catastrophique. Le format dense + column pre-mapping est la bonne direction, mais à moitié implémenté il crée une asymétrie entre `readExcel()` (qui retourne `{headers, rows}`) et la boucle principale (qui continue à appeler `getVal()`).

**Conclusion : deux bottlenecks orthogonaux, un seul fix suffit pour 80% du gain.**

---

### 2. Architecture proposée

#### A. Parser Worker — déplacer tout hors du main thread

Créer `js/xlsx-worker.js` (ou compléter l'existant) qui reçoit le `File`, lit le XLSX via `importScripts` SheetJS CDN, et retourne les données traitées.

```
[File input]
  → main.js : file.arrayBuffer() → postMessage(buffer, [buffer]) au ParseWorker
  → ParseWorker :
      SheetJS.read(buffer) → {headers, rows: Uint8Array columns mapped}
      Boucle 516k lignes avec column pre-mapping (index fixes, pas de indexOf)
      Agrégats partiels (ventesParMagasin, ventesClientArticle, canalAgence...)
      postMessage({type:'done', payload}) → transferable où possible
  → main.js : reçoit payload → merge dans _S → computeABCFMR → IDB save
```

Le gain : le main thread n'est plus bloqué. L'UI reste responsive. Sur Intel, le Worker tourne sur un autre core — les 38s deviennent ~12-15s **perçues comme 0s** (spinner, pas de freeze).

#### B. Column pre-mapping dans la boucle chaude

```js
const COL = {};
headers.forEach((h, i) => COL[h.trim()] = i);
// Puis dans la boucle :
const qte = row[COL['Qte prélevée']];  // O(1), pas de indexOf
```

Gain : -50% sur la boucle consommé.

#### C. Hash-check corrigé

Fix : **une seule sauvegarde IDB, à la fin du pipeline complet**, avec hash posé atomiquement.

```js
// Dans main.js, après processData() + launchClientWorker() + parseChalandise() :
_S._lastFileHash = computedHash;
await _saveSessionToIDB();  // UNE SEULE fois
```

Le hash est calculé dans le Worker pendant le parsing (SHA-256 via SubtleCrypto sur l'ArrayBuffer) et transmis avec le payload.

#### D. IDB : données traitées seulement (pas de raw)

`b9d945a` a raison : `_rawDataC` en IDB = fausse bonne idée. Stocker uniquement les agrégats.

---

### 3. Ordre de priorité

**P1 — Column pre-mapping** (1h, -40-50% CPU, ~-8s sur 38s)
**P2 — Parse Worker** (-10-15s perçues, UI responsive)
**P3 — Hash-check corrigé** (élimine 38s dès le 2e chargement)

---

### 4. Risques et garde-fous

- **Transfert ArrayBuffer** : une fois transféré au Worker, non lisible dans main thread → calculer le hash dans le Worker
- **SheetJS dans Worker** : pas ESM natif → `importScripts` (Worker classique, pas module Worker)
- **Column pre-mapping** : si headers Qlik changent → index silencieusement faux → assertion au démarrage
- **Cascade IDB** : auditer tous les call sites avant de toucher `_saveSessionToIDB`
