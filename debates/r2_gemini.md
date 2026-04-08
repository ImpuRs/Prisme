## GEMINI — Round 2 Rebuttals

### 1. Double-parse d'Opus — Valide sans réserve
"Smoking gun" de la lenteur. Si `processDataFromRaw` exécutée 2× → **2×19s d'inefficacité pure**. Éliminer l'appel redondant réduit le temps de **50% sans toucher à l'algorithme**. P0 absolu. Auto-critique : mon Round 1 focalisé sur l'infrastructure, OPUS a identifié une faille logique majeure.

### 2. `ws['!data']` vs `sheet_to_json({header:1})` — Concède
`sheet_to_json({header:1})` ré-alloue un nouvel Array of Arrays en itérant sur `ws`. `ws['!data']` avec `dense:true` = la structure interne déjà construite. Utiliser `ws['!data']` direct est **O(0) d'allocation additionnelle**. `sheet_to_json` = O(N) inutile. OPUS a raison.

### 3. Multi-workers Codex — Conteste les 60%
XLSX = ZIP de fichiers XML → décompression + parsing XML intrinsèquement séquentiels sur un seul flux. Splitter en N chunks demande un pré-processing complexe. **Un seul Dedicated Worker suffit** pour ~9s. Pas de SharedArrayBuffer (COOP/COEP headers impossibles sur GitHub Pages).

### 4. TypedArrays — Maintient via Dictionary Encoding
Réponse aux types mixtes : Dictionary Encoding pour strings.
```js
// ids_marques = new Uint16Array(516000)
// valeurs_ca = new Float32Array(516000)
// dates = new Uint32Array(516000)  (epoch ms)
```
Permet 516k lignes en mémoire contigus → filtrages instantanés (<100ms) sans lag GC.

### Plan convergent final — 3 étapes

**Étape 1 — Assainissement du flux** (Priorité OPUS)
- Activer `{dense:true}` dans SheetJS
- Remplacer `sheet_to_json` par accès direct `ws['!data']`
- Supprimer le double appel `processDataFromRaw`. Consolider en un seul passage (Full + Grouped by Month)

**Étape 2 — Worker-Centric** (Priorité GEMINI/SONNET)
- Tout le pipeline dans un Worker unique
- Column mapping (Sonnet) avant le parsing — index utiles seulement
- Transferable pour retour au main thread ou stockage IDB direct depuis Worker

**Étape 3 — Mémoire & Persistance**
- TypedArrays via Dictionary Encoding
- IDB en un seul batch (Blob ou ArrayBuffer)
- Cible : **~6-7s** (2s parsing + 2s mapping/transform + 2s IDB)

**Conclusion** : Le gain ne viendra pas de la parallélisation massive (Codex), mais de la **suppression du travail inutile** (Opus) et d'une **gestion mémoire bas-niveau** (Gemini).
