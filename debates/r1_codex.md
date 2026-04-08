## CODEX (o4-mini) — Round 1

### 1. Diagnostic

Le temps total ~38s est majoritairement dans `processData()` sur le main thread :
- `getVal()` avec lookup colonnes dynamiques à chaque itération — coût de recherche de clé élevé
- `yieldToMain()` toutes les CHUNK_SIZE lignes — rompt la continuité et ajoute surcharge
- `_saveSessionToIDB()` déclenchée 100+ fois — chacune ouvre transaction, sérialise, stocke des dizaines de Mo
- Lecture XLSX initiale (SheetJS) : ~5-8s, mineure comparée à la boucle principale

### 2. Architecture proposée

- **Streaming XLSX** : remplacer la lecture tout-en-mémoire par un flux de rows via parser XLSX streaming (ex: `xlsx-stream-reader`). Chaque ligne émise envoyée en chunks à des Web Workers.
- **Multi-workers** : N = nombre de cœurs logiques, distribution round-robin des chunks. Module ES via Blob-URL (`new Worker(new URL('worker.js', import.meta.url), { type: 'module' })`).
- **Pré-mapping colonnes** : lire la première ligne d'en-têtes, construire `{ champA: 0, champB: 1, … }`. Accès par index dans la boucle.
- **Format dense + typed arrays** : `Float32Array` / `Uint32Array` pour valeurs numériques. `SharedArrayBuffer` si requis par l'UI.
- **Batching IDB** : remplacer les 100+ appels en cascade par un seul batch par worker à la fin, ou pool de transactions de taille fixe (5000 lignes/transaction).
- **Transfert main thread** : workers envoient via `postMessage(typedArray, [typedArray.buffer])`. IDB seulement après réception complète de tous les buffers.

### 3. Ordre de priorité

1. **Pré-mapping colonnes + index direct** (-30% soit ~11s) — lookup O(n) → O(1)
2. **Format dense / typed arrays** (-20% soit ~8s) — moins d'allocations, meilleure locality JIT
3. **Multi-workers parallèles** (-60% cumulés soit ~23s) — segment 516k/4 par worker

Combinés : de 38s → sous 10s sur Intel 4 cœurs.

### 4. Risques et garde-fous

- **Overhead postMessage** : gros transferts → utiliser transferrables et SharedArrayBuffer
- **Mémoire** : N workers + gros buffers → libérer buffers dès stocké, limiter taille chunks
- **Synchronisation** : compteur de chunks prévu, écriture IDB seulement après réception complète
- **Quota IDB** : fractionner en segments ~5Mo, surveiller `onerror` pour fallback
- **Compatibilité ESM Worker** : détecter `{ type: 'module' }` support, sinon Worker classique
