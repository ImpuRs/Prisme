# Synthèse Finale — Débat Architecture Performance PRISME
## 4 AI × 2 Rounds — Participants : Gemini · Codex · Sonnet · Opus

---

## 🏆 Verdict : Convergence sur 3 axes, 1 découverte critique

---

## 1. La découverte critique du débat : le double-parse

**Participant** : Claude Opus (seul à avoir lu le code réel)
**Découverte** : `processDataFromRaw()` est appelée **2 fois** dans `processData()` — lignes 529 et 536 de `main.js`.

- **Appel 1** (L529) : période complète, calcule W/V/MIN/MAX/ABC/FMR + toutes Maps clients (~20-25s)
- **Appel 2** (L536) : `isRefilter:true`, re-parcourt les **516k lignes** pour recalculer ventesClientArticle, articleRaw, ventesParMagasin — ~60-70% du coût du premier appel (~8-12s)

Les 38s actuels contiennent donc ce double travail. **Éliminer le second appel = -8-12s sans toucher à l'architecture.**

**Réaction des autres après rebuttals** : Tous les 4 ont validé ou concédé. C'est le P0 unanime.

---

## 2. Consensus unanime sur les 3 axes

### Axe A — Accès dense `ws['!data']` sans `sheet_to_json`

**Convergence** : Opus → validé par Gemini, Sonnet, Codex (R2)

SheetJS avec `dense:true` (déjà passé à `XLSX.read()` dans `xlsx-worker.js`) produit `ws['!data']` : le tableau 2D interne natif, **zéro allocation supplémentaire**.

Comparaison :
| Approche | Allocations | Copie mémoire | Gain |
|---|---|---|---|
| `sheet_to_json()` défaut | 516k objets + 26 clés string chacun | Copie O(N×cols) | Baseline |
| `sheet_to_json({header:1})` | 516k arrays | Copie O(N×cols) | ~0% (même coût) |
| **`ws['!data']` direct** | **0 allocation** | **Zéro copie** | **-10-15s** |

Action : dans `xlsx-worker.js`, supprimer `sheet_to_json`, lire directement `ws['!data']` avec column pre-mapping O(1) :
```js
const CI = {};
ws['!data'][0].forEach((cell, i) => CI[cell?.v?.trim()] = i);
for (let r = 1; r < ws['!data'].length; r++) {
  const row = ws['!data'][r];
  const ca = row[CI['CA HT']]?.v ?? 0;  // O(1), pas de indexOf
}
```

### Axe B — Boucle d'agrégation dans le Worker unique

**Convergence** : Sonnet + Opus + Gemini (Codex partiellement — retrait de SharedArrayBuffer + Blob.slice invalide)

Déplacer la boucle consommé (lignes 691-830 de `main.js`) dans le Worker existant (`xlsx-worker.js`). Le main thread ne reçoit que les agrégats finaux via `postMessage` :

```
[Main] file.arrayBuffer() → postMessage(buffer, [buffer]) → [ParseWorker]
       [ParseWorker] ws['!data'] + boucle 516k lignes (O(1) accès)
                     → agrégats: articleRaw, ventesClientArticle, ventesParMagasin...
                     → postMessage(aggregates)  ← quelques Ko, pas 150Mo
[Main] hydrate _S → computeABCFMR → render
```

Les 516k lignes ne traversent jamais `postMessage` — elles restent confinées dans le Worker.

**Rejet unanime de Codex** : `Blob.slice` sur XLSX = invalide (ZIP ne peut pas être découpé à des offsets arbitraires). Multi-workers parallèles = sur-ingénierie pour données non parallélisables.

### Axe C — Hash-check corrigé + une seule sauvegarde IDB

**Convergence** : Tous les 4

Problème actuel : `_saveSessionToIDB` appelée 100+ fois en cascade → le timestamp n'est jamais posé → le hash-check ne s'active jamais.

Fix :
```js
// Dans main.js — UN SEUL point de sauvegarde, après tout le pipeline
const [hashC, hashS] = await Promise.all([
  computeHash(fileC),
  computeHash(fileS)
]);
await Promise.all([launchClientWorker(), parseChalandise(fileZ)]);
_S._lastFileHashC = hashC;
_S._lastFileHashS = hashS;
await _saveSessionToIDB();  // UNE SEULE fois
await _saveFileHashes({ hashC, hashS });
```

Hash calculé via SubtleCrypto dans le Worker pendant le parsing (SHA-256 sur ArrayBuffer), transmis dans le payload. Au 2ème chargement du même fichier : skip complet du parsing → <1s (IDB restore).

---

## 3. Ce que Codex a proposé et pourquoi c'est invalidé

| Proposition Codex | Verdict | Raison |
|---|---|---|
| `xlsx-stream-reader` | ❌ Invalide | Package npm CJS/Node, incompatible ESM natif sans bundler |
| `SharedArrayBuffer` | ❌ Invalide | Requiert COOP/COEP headers — GitHub Pages ne peut pas les servir |
| `Blob.slice` sur XLSX | ❌ Invalide | ZIP ne peut pas être découpé à des offsets arbitraires |
| Multi-workers N cœurs | ❌ Surplus | XLSX = bloc atomique séquentiel, agrégations non parallélisables |
| TypedArrays via Dictionary Encoding | ⚠️ Complexe | Techniquement valide mais disproportionné. PostMessage des Maps agrégées (<50ms) suffit. |
| Pre-mapping colonnes | ✅ Validé | Convergence unanime |
| Éliminer cascade IDB | ✅ Validé | Convergence unanime |

---

## 4. Bonus technique — Accumulation mensuelle (Opus, non contesté)

Actuellement, chaque changement de filtre période relance un scan de 516k lignes. Fix :

Dans la boucle, accumuler les données **par mois** :
```js
const monthKey = `${date.getFullYear()}-${date.getMonth()}`;
if (!byMonth[monthKey]) byMonth[monthKey] = { ca: 0, qte: 0 };
byMonth[monthKey].ca += ca;
```

Le filtre période devient une sommation des mois sélectionnés : O(n_articles × 12) au lieu de O(516k). Supprimer le second appel `processDataFromRaw(isRefilter:true)`.

**Bonus** : chaque changement de période devient instantané (<50ms) — plus de toast "agrégats figés".

---

## 5. Plan d'action prioritaire

| Priorité | Action | Gain estimé | Complexité | Risque |
|---|---|---|---|---|
| **P0** | Éliminer double-parse (supprimer L536 + accumulation mensuelle) | **-8-12s** | Moyenne | Moyen — tester isRefilter |
| **P1** | `ws['!data']` direct + column pre-mapping O(1) dans Worker | **-10-15s** | Faible | Faible — API SheetJS stable |
| **P2** | Boucle agrégation complète dans le Worker, transfert agrégats seulement | **-5-8s** | Moyenne | Moyen — refactor boucle 691-830 |
| **P3** | Hash-check corrigé + une seule sauvegarde IDB | **Élimine 38s aux sessions 2+** | Faible | Faible — guard _idbSaving existe déjà |

**Gain cumulé estimé : 38s → 6-10s sur Intel PC (depuis la session 1)**
**Session 2+ (même fichier) : <1s (IDB restore avec hash-check)**

---

## 6. Gagnant du débat

**Claude Opus** — pour la découverte du double-parse basée sur lecture du code réel, qui a recentré le débat de l'"infrastructure" vers la "suppression du travail inutile". Tous les 4 participants ont convergé sur cette découverte en Round 2.

**Deuxième rang : Sonnet** — pour la proposition la plus complète et cohérente du Round 1 (Parse Worker + hash SHA-256 + une seule IDB), qui anticipait déjà la bonne architecture sans avoir lu le code.

**À retenir de Gemini** : la formulation "Data-Oriented Design" et TypedArrays via Dictionary Encoding — pertinents pour une future optimisation mémoire V4 si PRISME doit gérer 2M+ lignes.

**Erreurs de Codex** : SharedArrayBuffer (GitHub Pages incompatible), Blob.slice sur XLSX (techniquement invalide), xlsx-stream-reader (CJS/Node). Mais a correctement identifié le pre-mapping comme P1 dès le Round 1.

---

## TL;DR — Les 4 lignes d'action

```
1. Supprimer le 2ème processDataFromRaw() + accumuler par mois     → -10s
2. ws['!data'] direct + pre-mapping O(1) dans xlsx-worker.js        → -12s
3. Déplacer boucle agrégation dans le Worker, transférer agrégats    → -7s
4. Hash-check + _saveSessionToIDB() appelée UNE SEULE fois           → -38s session 2+
```
