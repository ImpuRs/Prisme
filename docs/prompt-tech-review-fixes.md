# Prompt Claude Code CLI — Fixes review technique
# Branche : fix/tech-review-bugs
# 4 bugs ciblés — utils.js, state.js, parser.js/main.js
# Commits séquentiels, un bug = un commit

---

## Fix 1 — `parseExcelDate` : dates ISO mal interprétées
**Fichier** : `js/utils.js`
**Commit** : `fix(utils): parseExcelDate - handle ISO YYYY-MM-DD correctly`

**Problème** : pour `"2026-03-26"`, le parser split sur `-` → `[a=2026, b=3, d=26]`.
Comme `a > 12` → branche `new Date(d, b-1, a)` → `new Date(26, 2, 2026)` → année 1926 + overflow → date en 2031.

**Localise** `parseExcelDate` dans `js/utils.js` et remplace-la intégralement :

```javascript
export function parseExcelDate(v) {
  if (!v) return null;
  if (v instanceof Date) return isNaN(v.getTime()) ? null : v;
  if (typeof v === 'number') return new Date(Math.round((v - 25569) * 864e5));
  if (typeof v === 'string') {
    const s = v.split(' ')[0]; // strip time part
    const p = s.split(/[-/]/);
    if (p.length === 3) {
      const n = p.map(x => parseInt(x, 10));
      if (n.some(isNaN)) return null;
      // Format ISO : YYYY-MM-DD (premier segment > 31 → c'est l'année)
      if (n[0] > 31) {
        // YYYY-MM-DD
        return new Date(n[0], n[1] - 1, n[2]);
      }
      // Format DD-MM-YYYY ou DD/MM/YYYY (dernier segment > 31 → c'est l'année)
      if (n[2] > 31) {
        return new Date(n[2], n[1] - 1, n[0]);
      }
      // Ambiguité MM-DD-YY ou DD-MM-YY : compléter l'année si < 100
      let [a, b, d] = n;
      if (d < 100) d += 2000;
      // Si a > 12 → a est forcément le jour, b le mois
      if (a > 12) return new Date(d, b - 1, a);
      // Si b > 12 → b est forcément le jour, a le mois
      if (b > 12) return new Date(d, a - 1, b);
      // Défaut : DD-MM-YYYY (convention française)
      return new Date(d, b - 1, a);
    }
    // Fallback : laisser le moteur JS parser (formats RFC2822, etc.)
    const x = new Date(v);
    return isNaN(x.getTime()) ? null : x;
  }
  return null;
}
```

**Test rapide** : dans la console après déploiement (si `parseExcelDate` est exposée sur `window`) :
- `parseExcelDate('2026-03-26')` → doit retourner `Date(2026, 2, 26)` — vendredi 26 mars 2026
- `parseExcelDate('26/03/2026')` → doit retourner `Date(2026, 2, 26)`
- `parseExcelDate('03/26/2026')` → doit retourner `Date(2026, 2, 26)` (b=26 > 12)
- `parseExcelDate(45941)` → nombre Excel → date correcte (ne pas toucher cette branche)

---

## Fix 2 — `parseCSVText` : parser CSV naïf
**Fichier** : `js/utils.js`
**Commit** : `fix(utils): parseCSVText - RFC 4180 compliant parser`

**Problème** : `split(sep)` naïf casse sur les champs contenant le séparateur, des guillemets
échappés (`""`), ou des sauts de ligne dans une cellule. Les exports Qlik chalandise
(noms clients avec `;`, adresses multi-lignes) sont silencieusement corrompus.

**Localise** `parseCSVText` dans `js/utils.js` et remplace-la intégralement :

```javascript
export function parseCSVText(text, sep) {
  // Parser RFC 4180 — gère : champs quotés, séparateur dans un champ,
  // guillemets échappés (""), sauts de ligne dans un champ quoté.
  const rows = [];
  let cur = [];
  let field = '';
  let inQuotes = false;
  let i = 0;
  const n = text.length;

  // Normaliser les fins de ligne
  const src = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const len = src.length;

  while (i <= len) {
    const ch = i < len ? src[i] : null;

    if (inQuotes) {
      if (ch === '"') {
        // Guillemet échappé ("") ou fin de champ quoté
        if (i + 1 < len && src[i + 1] === '"') {
          field += '"';
          i += 2;
        } else {
          inQuotes = false;
          i++;
        }
      } else if (ch === null) {
        // Fin de fichier dans un champ quoté — on sort quand même
        cur.push(field);
        rows.push(cur);
        break;
      } else {
        field += ch;
        i++;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
        i++;
      } else if (ch === sep) {
        cur.push(field.trim());
        field = '';
        i++;
      } else if (ch === '\n' || ch === null) {
        cur.push(field.trim());
        if (cur.some(f => f !== '')) rows.push(cur); // ignorer lignes vides
        cur = [];
        field = '';
        i++;
      } else {
        field += ch;
        i++;
      }
    }
  }

  if (!rows.length) return [];

  // Première ligne = headers
  const headers = rows[0];
  const data = [];
  for (let r = 1; r < rows.length; r++) {
    const row = {};
    for (let c = 0; c < headers.length; c++) {
      row[headers[c]] = rows[r][c] ?? '';
    }
    data.push(row);
  }
  return data;
}
```

**Note** : cette fonction est utilisée pour `parseChalandise` (fichiers CSV Qlik avec
encoding CP1252). Le nouveau parser gère tous les cas sans régression sur les fichiers
simples (pas de guillemets, pas de sauts de ligne dans les champs).

---

## Fix 3 — `resetAppState` : champs manquants
**Fichier** : `js/state.js`
**Commit** : `fix(state): resetAppState - add missing fields`

**Problème** : `resetAppState()` ne réinitialise pas plusieurs champs qui sont pourtant
lus après le reset dans `main.js`. Une seconde analyse peut hériter silencieusement de
filtres ou exclusions de la session précédente.

**Champs manquants identifiés** (définis dans l'init de `_S` mais absents du reset) :
- `_S.periodFilterStart` et `_S.periodFilterEnd` (filtres période)
- `_S.excludedClients` (exclusions cockpit)
- `_S._selectedCrossStatus`
- `_S._includePerdu24m`
- `_S._selectedDepts`, `_S._selectedClassifs`, `_S._selectedStatuts`
- `_S._selectedActivitesPDV`, `_S._selectedCommercial`, `_S._selectedMetier`
- `_S._filterStrategiqueOnly`
- `_S.obsFilterUnivers`, `_S.obsFilterMinCA`, `_S.selectedObsCompare`
- `_S.selectedBenchBassin`

**Dans `js/state.js`**, localise `resetAppState()` et ajoute à la fin de la fonction,
juste avant la fermeture `}` :

```javascript
  // ── Filtres période ──
  _S.periodFilterStart = null;
  _S.periodFilterEnd = null;

  // ── Exclusions clients ──
  _S.excludedClients = new Map();
  _S._selectedCrossStatus = '';
  _S._includePerdu24m = false;

  // ── Filtres chalandise ──
  _S._selectedDepts = new Set();
  _S._selectedClassifs = new Set();
  _S._selectedStatuts = new Set();
  _S._selectedActivitesPDV = new Set();
  _S._selectedCommercial = '';
  _S._selectedMetier = '';
  _S._filterStrategiqueOnly = false;

  // ── Observatoire ──
  _S.obsFilterUnivers = '';
  _S.obsFilterMinCA = 0;
  _S.selectedObsCompare = 'median';

  // ── Benchmark bassin ──
  _S.selectedBenchBassin = new Set();
```

**Vérification** : après ce fix, recharger deux fichiers différents en séquence ne doit
pas conserver les filtres de période ou les exclusions de la première session.

---

## Fix 4 — Worker client non annulé
**Fichiers** : `js/state.js` + `js/parser.js`
**Commit** : `fix(parser): launchClientWorker - cancellable worker`

**Problème** : `launchClientWorker()` crée un Worker sans le stocker dans `_S`.
Si l'utilisateur recharge des fichiers pendant que ce worker tourne, l'ancien `onmessage`
peut réécrire `_S.clientFamCA` et `_S.metierFamBench` avec des données périmées.
Contrairement aux workers territoire et réseau qui sont stockés dans `_S._activeTerrWorker`
et `_S._activeReseauWorker`, le worker client n'est pas annulable.

**Étape 1 — Dans `js/state.js`**, ajouter dans la section init (après `_S._activeReseauWorker`) :

```javascript
_S._activeClientWorker = null;  // guard: annulation au re-upload
```

Et dans `resetAppState()`, dans le bloc "Réseau worker" existant, ajouter :

```javascript
  // Worker client
  if (_S._activeClientWorker) {
    try { _S._activeClientWorker.terminate(); } catch (_) {}
    _S._activeClientWorker = null;
  }
```

**Étape 2 — Dans `js/parser.js`**, localise `launchClientWorker()`.
Elle contient `const worker = new Worker(url)`.

Ajouter juste après cette ligne :
```javascript
_S._activeClientWorker = worker;
```

Et dans le `worker.onmessage` callback, juste avant `resolve()` :
```javascript
_S._activeClientWorker = null;
```

Et dans le `worker.onerror` callback, juste avant `reject(err)` :
```javascript
_S._activeClientWorker = null;
```

Le résultat final dans `launchClientWorker` doit ressembler à :

```javascript
const worker = new Worker(url);
_S._activeClientWorker = worker;  // ← ajouté

worker.onmessage = (e) => {
  _S.clientFamCA = e.data.clientFamCA;
  _S.metierFamBench = e.data.metierFamBench;
  worker.terminate(); URL.revokeObjectURL(url);
  _S._activeClientWorker = null;  // ← ajouté
  if (progressCb) progressCb(100);
  resolve();
};
worker.onerror = (err) => {
  worker.terminate(); URL.revokeObjectURL(url);
  _S._activeClientWorker = null;  // ← ajouté
  reject(err);
};
```

---

## Ordre des commits

```
git checkout -b fix/tech-review-bugs

# Fix 1
# modifier parseExcelDate dans utils.js
git add js/utils.js
git commit -m "fix(utils): parseExcelDate - handle ISO YYYY-MM-DD correctly"

# Fix 2
# modifier parseCSVText dans utils.js
git add js/utils.js
git commit -m "fix(utils): parseCSVText - RFC 4180 compliant parser"

# Fix 3
# modifier resetAppState dans state.js
git add js/state.js
git commit -m "fix(state): resetAppState - add missing period/filter/exclusion fields"

# Fix 4
# modifier state.js + parser.js
git add js/state.js js/parser.js
git commit -m "fix(parser): launchClientWorker - cancellable worker via _S._activeClientWorker"

git push origin fix/tech-review-bugs
# PR → merge vers main
```

---

## Ce qu'il ne faut PAS modifier

- La signature de `parseExcelDate` — même nom, même export, juste le corps
- La signature de `parseCSVText` — même nom, même paramètres `(text, sep)`
- Tout le reste de `utils.js` — ne pas toucher aux autres fonctions
- Le reste de `resetAppState()` — uniquement ajouter les champs manquants à la fin
- La logique métier de `launchClientWorker` — uniquement ajouter les 3 lignes de guard
