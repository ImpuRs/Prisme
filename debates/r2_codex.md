## CODEX — Round 2 Rebuttals

### 1. Double-parse d'Opus — Concède, priorité
Vrai goulet. `processDataFromRaw` appelée 2× double le temps. Fix : fusionner accumulation + filtrage en une seule passe, agréger ligne par ligne dans une table mensuelle. Gain estimé : -30%.

### 2. Multi-workers & XLSX — Pivote sur l'approche
Concède : `xlsx-stream-reader` est CJS/Node-only, incompatible ESM sans bundler. Nouvelle proposition :
- Charger SheetJS UMD dans chaque Worker via `importScripts('https://cdn.jsdelivr.net/npm/xlsx/dist/xlsx.full.min.js')`
- Segmenter le fichier en N tranches via `Blob.prototype.slice`
- Chaque Worker : `XLSX.read(data, {type:'array', dense:true})` + `ws['!data']`

### 3. SharedArrayBuffer — Retire
GitHub Pages ne peut pas servir les headers COOP/COEP requis. Retire la suggestion. Communication via `postMessage` + `Transferable` (ArrayBuffer) ou `BroadcastChannel`.

### 4. TypedArrays — Maintient avec adaptation
Séparer colonnes par type dès le header scan :
- Colonnes numériques/dates : `Float64Array` ou `Int32Array` (dates en epoch ms)
- Colonnes string/IDs : `Array<string>`
- Regrouper en `{ nums: {...}, strs: {...} }` pour itérations rapides

### Plan final — 3 étapes
1. **Refactor un-seul-parse** : fusionner accumulation + filtrage, éliminer double passage
2. **Détection automatique types par colonne** : header scan → TypedArray ou Array<string> → setter dédié
3. **Parallélisation Worker UMD** : `Blob.slice` en N tranches, N Workers avec importScripts XLSX, merge côté main

---
**Note critique** : La proposition `Blob.slice` sur un fichier XLSX est techniquement invalide — un XLSX est une archive ZIP qui ne peut pas être découpée à des offsets arbitraires. Cette approche ne fonctionnerait pas en pratique.
