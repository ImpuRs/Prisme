## GEMINI — Round 1

### 1. Diagnostic : Où s'évaporent les 38s ?

Le goulot n'est pas l'I/O (lecture disque) mais la **pression sur le Main Thread et le GC**.

- **Lookup dynamique `getVal`** : 516 414 × 26 colonnes → surcharge pile + micro-tâches colossale. Sur Intel, surcoût abstraction JS 3-4× plus lent que M1.
- **Surcharge Main Thread** : `readExcel` + `processData` sur thread UI bloquent la boucle événements. `yieldToMain` fragmente la douleur sans augmenter le débit.
- **Explosion IDB (241Mo)** : symptôme d'une structure "Array of Objects". Chaque objet porte les clés (strings) 516k fois.
- **Cascade IDB** : 100+ appels → verrouillage transactionnel permanent = "stop-the-world" déguisé.

### 2. Architecture proposée : Pipeline "Stream-to-Dense"

Passer d'une approche **orientée objet** à une approche **orientée vecteur (Data-Oriented Design)**.

#### A. Worker-Centric Pipeline
1. Main Thread : envoie le `File` object au Worker
2. Worker : `FileReader` + `XLSX.read` avec `type: 'array'`
3. Extraction dense : `XLSX.utils.sheet_to_json(sheet, { header: 1 })` → `Array<Array<any>>`

#### B. Pre-Mapping & Typed Views
```javascript
const MAPPING = { CA: 5, DATE: 0, AGENCE: 12 }; // Calculé une seule fois
for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const ca = row[MAPPING.CA]; // O(1)
}
```

#### C. Stockage Column-Major IDB
Stocker : `{ headers: ["Date", "CA", ...], data: [[val1, val2,...], ...] }`
Impact : 241Mo → ~40-50Mo (sans les clés répétées).

**Note importante** : N'envoyer au Main Thread que les **agrégats** (ce qui s'affiche), garder les 516k lignes dans le Worker ou IDB.

### 3. Top 3 priorités (-25s estimées)

1. **Worker pour tout read + process** (~10-15s) — libère Main Thread, JIT compile Worker sans interférence UI
2. **Suppression getVal → pre-mapping** (~10s sur Intel) — index entiers calculés avant la boucle
3. **Batch IDB + debounce/hash-check** (~5s) — une seule sauvegarde à la fin

### 4. Risques

- **OOM** : 516k lignes en Array of Arrays → utiliser TypedArrays (Float32Array/Int32Array) pour colonnes numériques
- **postMessage 80Mo** : ~1s de sérialisation → envoyer uniquement les agrégats au Main Thread
- **Compatibilité ESM Workers** : `importScripts` pour Worker classique si support large requis

**Cible : 9s** (parsing Worker 5s + mapping dense 2s + IDB async 2s)
