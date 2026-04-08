## SONNET — Round 2 Rebuttals

### 1. Double-parse d'Opus — Mea culpa, P0 immédiat
Je l'avais raté. Si `processDataFromRaw` est invoquée 2× dans `processData()`, c'est P0 avant tout le reste. La 2ème passe filtrée économise ~60-70% du premier parse mais itère quand même toutes les lignes. Gain estimé : **~10-12s sans refacto architecturale**. Priorités réordonnées : P0=double-parse, P1=column pre-mapping, P2=accès dense.

### 2. Multi-workers Codex — Conteste
Le round-robin suppose des chunks indépendants — faux ici. La dédup BL (même N° BL + même article → MAX) nécessite un état partagé cross-chunk. Merge final coûteux ou SharedArrayBuffer+Atomics = complexité disproportionnée pour outil mono-utilisateur. Le vrai bottleneck est la lecture SheetJS, pas la boucle de calcul. **Un seul Parse Worker suffit**.

### 3. `ws['!data']` vs `sheet_to_json({header:1})`
Préfère **`ws['!data']`** (Opus). `sheet_to_json` fait un passage supplémentaire O(n×cols) pour construire les arrays row. `ws['!data'][rowIdx][colIdx]` est O(1) sans intermédiaire — court-circuite entièrement ce passage.

### 4. "Garder les 516k lignes dans le Worker" (Gemini)
Bonne idée conditionnellement. Transférer uniquement les agrégats (quelques KB) au lieu de 150Mo. Mais nécessite de persister dans IDB via canal Worker→IDB direct. → Bonne direction mais refactor `cache.js` non immédiate.

### Convergence — 3 actions ordonnées
- **A1 (P0, 2h, ~10-12s)** : Éliminer le double-appel `processDataFromRaw`. Dériver le filtered par sommation en mémoire.
- **A2 (P1, 4h, ~8-10s)** : Column pre-mapping O(1) + accès `ws['!data']` — ces deux fixes sont couplés, même PR.
- **A3 (P2, 1 journée, ~5-8s)** : Parse Worker unique avec hash SHA-256 + transfert agrégats seulement.

**Cible réaliste : 8-12s** (depuis ~38s).
