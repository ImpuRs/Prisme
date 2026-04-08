# Résumé Round 1 — Arguments de chaque participant

## SONNET
- Bottleneck : `getVal()` avec `indexOf` répété = 13M string searches. SheetJS ~8-10s + boucle ~18-22s.
- Propose : Parse Worker (tout SheetJS + boucle dedans), column pre-mapping O(1), hash SHA-256 dans le Worker, une seule sauvegarde IDB à la fin
- Priorité : P1=column pre-mapping (-8s), P2=Parse Worker (-10-15s perçues), P3=hash-check corrigé
- Point unique : hash calculé dans le Worker via SubtleCrypto sur ArrayBuffer

## CODEX (o4-mini)
- Bottleneck : `getVal()` + `yieldToMain()` surcharge + cascade `_saveSessionToIDB` 100+ fois
- Propose : **Multi-workers (N cœurs) en round-robin** pour distribuer les chunks de lignes, streaming XLSX (xlsx-stream-reader), TypedArrays / SharedArrayBuffer, batching IDB
- Priorité : P1=pre-mapping (-30% ~11s), P2=typed arrays (-20% ~8s), P3=multi-workers parallèles (-60% ~23s cumulés)
- Point unique : distribution des chunks sur N workers en parallèle (seul à proposer ça)

## OPUS (Claude Opus) — a lu le code réel
- Bottleneck : `sheet_to_json` crée 516k objets (dense:true passé mais annulé par sheet_to_json), + **double-parse** (`processDataFromRaw` appelée 2× dans `processData`)
- Propose : Lire directement `ws['!data']` (sans sheet_to_json), boucle Worker avec index numériques, **éliminer le double-parse** (accumuler par mois, refilter par sommation), hash-check avec un seul point de sauvegarde IDB
- Priorité : P1=accès dense sans sheet_to_json (-10-15s), P2=boucle dans Worker (-5-8s), P3=éliminer double-parse (-8-15s)
- **Point UNIQUE CRITIQUE** : découverte du double-parse (processDataFromRaw appelée 2×) que les autres n'ont pas vu

## GEMINI
- Bottleneck : GC pressure + main thread + cascade IDB. Data-Oriented Design nécessaire.
- Propose : Worker-Centric Pipeline, `sheet_to_json({header:1})` pour arrays, pre-mapping MAPPING={}, TypedArrays pour colonnes numériques, garder les 516k lignes dans le Worker (ne transférer que les agrégats)
- Priorité : P1=Worker (+JIT) (-10-15s), P2=pre-mapping (-10s), P3=batch IDB (-5s)
- Point unique : garder les données brutes dans le Worker (pas de transfert back), TypedArrays

## Points de convergence (unanimes)
1. Déplacer le parsing/processing dans un Web Worker
2. Column pre-mapping (index numériques, pas indexOf)
3. Une seule sauvegarde IDB à la fin du pipeline
4. Ne pas stocker _rawDataC en IDB (agrégats seulement)

## Points de divergence (à débattre en Round 2)
- **Opus seul** : `ws['!data']` direct vs `sheet_to_json({header:1})` (Sonnet+Gemini)
- **Codex seul** : multi-workers parallèles (N cœurs) — les autres: un seul Worker suffit
- **Opus seul** : double-parse = priorité critique — les autres ne l'ont pas mentionné
- **Gemini seul** : garder les 516k lignes dans le Worker (ne pas transférer)
- Codex propose streaming XLSX mais c'est une lib externe (contrainte ESM natif sans bundler)
