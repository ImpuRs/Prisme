# Prompt Claude Code CLI — Référentiel famille/sous-famille universel
# Branche : feature/famille-referentiel
# Objectif : clé interne = code famille, affichage = "C02 · Coupe" partout dans PRISME
# Recherche : "C02" OU "coupe" OU "fixation" → même résultat

---

## Contexte

Le fichier Consommé a deux colonnes séparées : `Code famille` (ex: `"C02"`) + `Famille` (ex: `"Coupe"`).
Le fichier Stock a une colonne concaténée : `"C02 - Coupe"`.
Après le parsing actuel, `_S.articleFamille` peut contenir `"Coupe"` (consommé) ou `"C02 - Coupe"` (stock)
pour le même article selon la source. `normFam()` strip le préfixe mais perd le code.

**Solution cible :**
- `_S.articleFamille[codeArticle]` → stocke le **code** famille (`"C02"`)
- `_S.familleLookup` → Map code → libellé (`{"C02": "Coupe", ...}`)
- Affichage partout : `"C02 · Coupe"` via helper `famLabel(code)`
- Recherche : `"C02"` OU `"coupe"` OU `"fix"` → matche `C02 · Fixation`
- Codes hors format standard (`"00"`, `"22"`, `"94"`...) → affichés comme libellé brut sans code

---

## Étape 1 — Ajouter le référentiel dans `js/constants.js`

Ajouter à la fin de `constants.js` :

```javascript
// ── Référentiel familles Legallais ────────────────────────────────────────
// Source : Qlik — stable, mis à jour manuellement si évolution du catalogue
export const FAMILLE_LOOKUP = {
  "00": "Frais Gén./Emballages Internes",
  "12": "Actions promotionnelles",
  "22": "Lots - Cadeaux - Dons",
  "30": "Moustiquaires sur mesure",
  "31": "Grilles sur mesure",
  "32": "Baton maréchal sur mesure",
  "94": "Fin de série 2004",
  "A01": "Accessoires",
  "A02": "Agencement",
  "A03": "Assemblage de meuble",
  "A04": "Equipements",
  "A05": "Fermetures de meubles",
  "A06": "Ferrures de portes battantes",
  "A07": "Ferrures de portes coulissantes",
  "A08": "Garnitures de meubles",
  "A10": "Pieds et roulettes de meubles",
  "A11": "Tiroirs et coulisses",
  "A12": "Caissons et portes",
  "B01": "Contrôle d'accès et sécurité",
  "B02": "Cylindres",
  "B03": "Ferme-porte",
  "B04": "Ferrures de porte et fenêtre",
  "B05": "Ferrures de portes coulissantes",
  "B06": "Ferrures de volets et portail",
  "B07": "Garnitures de porte et fenêtre",
  "B09": "Quincaillerie générale",
  "B10": "Serrures",
  "B11": "Ventilation extraction",
  "C01": "Colles - adhésifs - lubrifiant",
  "C02": "Coupe",
  "C03": "Fixation",
  "C04": "Peintures - marquage",
  "E01": "Matériel des 1ers secours",
  "E02": "Mise en sécurité de la personne",
  "E03": "Protection auditive",
  "E04": "Protection de la tête",
  "E05": "Protection des mains",
  "E06": "Protection des pieds",
  "E07": "Protection des yeux",
  "E08": "Protection du corps",
  "E09": "Protection respiratoire",
  "G01": "Radiateurs et sèche-serviettes",
  "G02": "Robinetterie de radiateur",
  "G03": "Plancher chauffant",
  "G04": "Chaudières",
  "G05": "Équipements de chaufferie",
  "G06": "Pompes à chaleur",
  "G07": "Climatisation",
  "G08": "Régulation",
  "G09": "Ventilation, traitement air",
  "G10": "Fumisterie",
  "L01": "Raccords",
  "L02": "Robinetterie",
  "L03": "Sanitaire",
  "L04": "WC",
  "L05": "Vidage",
  "L06": "Collectivité",
  "L07": "Réseau sanitaire",
  "L08": "Gaz",
  "M01": "Air comprimé",
  "M02": "Atelier",
  "M03": "Echelles - échafaudages",
  "M05": "Emballage - protection",
  "M06": "Matériels et produits d'entretien",
  "M07": "Levage et manutention",
  "M08": "Matériel de chantier",
  "M09": "Équipements urbains",
  "M10": "Signalisation de chantier",
  "M11": "Soudage",
  "M12": "Tuyaux",
  "M14": "Équipements de chantier",
  "M15": "Fournitures de bureaux",
  "O01": "Jardin",
  "O02": "Machines de chantier et d'atelier",
  "O03": "Mesure et contrôle",
  "O04": "Outillage à main",
  "O05": "Outillage électroportatif",
  "O06": "Outils métiers",
  "O07": "Rangement d'outillage",
  "O08": "Serrage",
  "R01": "Branchement et protection",
  "R02": "Appareillage terminal",
  "R03": "Appareillage industriel",
  "R04": "Communication et réseaux",
  "R05": "Fils et câbles",
  "R06": "Conduits et chemin de câbles",
  "R07": "Accessoires et raccordements",
  "R08": "Eclairage",
  "R09": "Domotique et automatisme",
  "R10": "Sécurité & Alarme",
  "R12": "Piles, batteries, alimentation",
  "R13": "Équipements électriques",
};

// Codes considérés comme "hors catalogue standard" — affichés sans code préfixe
export const FAMILLE_HORS_CATALOGUE = new Set(["00","12","22","30","31","32","94"]);
```

---

## Étape 2 — Deux fonctions dans `js/utils.js`

Importer `FAMILLE_LOOKUP` et `FAMILLE_HORS_CATALOGUE` depuis `constants.js`.

Remplacer `normFam()` existante par ces deux fonctions :

```javascript
/**
 * Extrait le CODE famille depuis n'importe quel format :
 * "C02 - Coupe" → "C02"
 * "Coupe"       → "Coupe" (libellé brut, pas de code connu)
 * "C02"         → "C02"
 * Utilisé au PARSING pour alimenter _S.articleFamille
 */
export function extractFamCode(raw) {
  if (!raw) return '';
  const s = raw.toString().trim();
  // Format "CODE - Libellé" → extraire le code
  const m = s.match(/^([A-Z]\d{2,3}|\d{2,3})\s*-\s*/);
  if (m) return m[1];
  // Si c'est déjà un code pur (ex: "C02" ou "00")
  if (/^([A-Z]\d{2,3}|\d{2,3})$/.test(s)) return s;
  // Sinon c'est un libellé brut — chercher dans FAMILLE_LOOKUP
  const sL = s.toLowerCase();
  for (const [code, lib] of Object.entries(FAMILLE_LOOKUP)) {
    if (lib.toLowerCase() === sL) return code;
  }
  // Libellé inconnu du référentiel — retourner tel quel
  return s;
}

/**
 * Retourne le libellé d'affichage pour un code famille.
 * "C02" → "Coupe"
 * "Coupe" (libellé brut) → "Coupe"
 * "" → ""
 * Utilisé partout dans l'UI pour l'affichage.
 */
export function famLib(code) {
  if (!code) return '';
  return FAMILLE_LOOKUP[code] || code;
}

/**
 * Retourne le label complet "CODE · Libellé" pour l'affichage.
 * "C02" → "C02 · Coupe"
 * Codes hors catalogue → libellé seul sans code
 * Utilisé dans les selects, autocomplete, filtres.
 */
export function famLabel(code) {
  if (!code) return '';
  const lib = FAMILLE_LOOKUP[code];
  if (!lib) return code; // code inconnu → afficher tel quel
  if (FAMILLE_HORS_CATALOGUE.has(code)) return lib; // hors catalogue → pas de code
  return `${code} · ${lib}`;
}

// Supprimer normFam() — remplacée par extractFamCode() + famLib() + famLabel()
// Note : partout où normFam() était appelée, remplacer par famLib(extractFamCode(valeur))
// ou directement famLib(code) si le code est déjà extrait
```

---

## Étape 3 — Parsing dans `js/main.js`

Importer `extractFamCode`, `famLib` depuis `utils.js`.
Retirer `normFam` des imports (supprimée).

**Au parsing du Consommé** — le consommé a deux colonnes séparées :
- `Code famille` (ex: `"C02"`) → déjà un code pur
- `Famille` (ex: `"Coupe"`) → libellé

Chercher où `_S.articleFamille[code]` est assigné depuis le consommé.
Remplacer par :
```javascript
// Le consommé a déjà le code famille dans une colonne dédiée
const codeFam = getVal(row, 'Code famille', 'code famille') || '';
_S.articleFamille[codeArticle] = codeFam || extractFamCode(getVal(row, 'Famille', 'famille'));
```

**Au parsing du Stock** — le stock a `"C02 - Coupe"` concaténé dans la colonne `Famille` :
Chercher où `_S.articleFamille[r.code]` est assigné depuis le stock.
Remplacer par :
```javascript
_S.articleFamille[r.code] = extractFamCode(r.famille || '');
```

Et sur l'objet poussé dans `_S.finalData`, le champ `.famille` doit aussi être le code :
```javascript
famille: extractFamCode(rawFamille),
```

**Résultat** : `_S.articleFamille` contient maintenant uniquement des codes (`"C02"`, `"A01"`...)
jamais des libellés ni des formes concaténées.

---

## Étape 4 — `js/parser.js` — computeBenchmark et territoire

Dans `computeBenchmark()`, partout où `_normFam(x)` était appelé → remplacer par `famLib(x)` si `x` est déjà un code, ou `famLib(extractFamCode(x))` si `x` peut être une forme concaténée.

Importer `extractFamCode`, `famLib`, `famLabel` depuis `utils.js`.
Supprimer l'import de `normFam`.

---

## Étape 5 — Affichage dans l'UI

Partout dans le codebase où une famille est **affichée** à l'utilisateur (dans un `innerHTML`, un `<option>`, un label de filtre), remplacer :

```javascript
// AVANT
r.famille  // ou _S.articleFamille[code]  → pouvait être "C02 - Coupe" ou "Coupe"

// APRÈS
famLabel(_S.articleFamille[code])  // → "C02 · Coupe"
// ou si on veut juste le libellé sans code :
famLib(_S.articleFamille[code])    // → "Coupe"
```

**Fichiers concernés** :
- `js/promo.js` — autocomplete familles, filtres, matchedFamilles display
- `js/diagnostic.js` — affichage famille dans les panels
- `js/ui.js` — selects famille dans les filtres sidebar
- `js/main.js` — tableaux Articles, filtres famille

**Règle d'affichage** :
- Dans les **selects/filtres** → `famLabel(code)` : `"C02 · Coupe"` (permet la recherche par code)
- Dans les **tableaux/cards** → `famLib(code)` : `"Coupe"` (plus lisible, pas besoin du code)
- Dans l'**autocomplete Promo** → les deux : matcher sur `famLabel` permet de taper `"C02"` ou `"coupe"`

---

## Étape 6 — Autocomplete Promo — recherche code + libellé

Dans `js/promo.js`, `_buildPromoSuggestions()` :

```javascript
// AVANT : cherchait uniquement dans le libellé famille
if(terms.every(t => f.toLowerCase().includes(t))) { ... }

// APRÈS : cherche dans code ET libellé
const fCode = famCode; // ex: "C02"
const fLib = famLib(fCode).toLowerCase(); // ex: "coupe"
const fFull = famLabel(fCode).toLowerCase(); // ex: "c02 · coupe"
if(terms.every(t => fLib.includes(t) || fCode.toLowerCase().includes(t) || fFull.includes(t))) {
  // match
}
```

Dans les suggestions affichées, le label famille doit montrer `famLabel(code)` :
```javascript
// label affiché dans la dropdown autocomplete
label: famLabel(fam),  // "C02 · Coupe"
value: fam,            // "C02" — ce qui est mis dans l'input au clic
```

Et dans `runPromoSearch()`, quand l'utilisateur a sélectionné une famille via autocomplete,
`matchedFamilles` contiendra des codes (`"C02"`). Pour afficher dans le résumé :
```javascript
[...matchedFamilles].map(c => famLabel(c)).join(', ')
// → "C02 · Coupe, O05 · Outillage électroportatif"
```

---

## Étape 7 — Selects famille dans les filtres sidebar

Dans `index.html` et dans `_populatePromoFilterDropdowns()` (promo.js),
les `<option>` famille doivent avoir :
- `value` = code (`"C02"`)
- texte affiché = `famLabel(code)` (`"C02 · Coupe"`)

```javascript
// Dans _populatePromoFilterDropdowns()
fill('promoFilterFamille', [...famSet].sort((a,b) => a.localeCompare(b)));

// La fonction fill doit générer :
// <option value="C02">C02 · Coupe</option>
// Adapter fill() pour utiliser famLabel() sur la valeur :
const fill = (id, codes) => {
  const sel = document.getElementById(id); if(!sel) return;
  const cur = sel.value;
  const first = sel.options[0].outerHTML;
  sel.innerHTML = first + codes.map(c =>
    `<option value="${c}">${famLabel(c)}</option>`
  ).join('');
  if(codes.includes(cur)) sel.value = cur;
};
```

---

## Ce qu'il ne faut PAS modifier

- La logique de calcul MIN/MAX, SPC, ABC/FMR — aucun changement
- La structure de `_S.finalData` au-delà du champ `.famille`
- Les algorithmes de matching Promo — seule la couche d'extraction/affichage change
- `js/cache.js` — si des familles sont sérialisées en IDB, elles seront maintenant des codes :
  vérifier que la restauration depuis cache ne casse pas avec des codes au lieu de libellés.
  Si le cache IDB stocke des familles, appeler `_clearIDB()` après le déploiement
  pour forcer un rechargement propre.

---

## Ordre des commits

```bash
git checkout -b feature/famille-referentiel

# 1. Référentiel dans constants.js
git add js/constants.js
git commit -m "feat(constants): add FAMILLE_LOOKUP referentiel + FAMILLE_HORS_CATALOGUE"

# 2. Fonctions utils
git add js/utils.js
git commit -m "feat(utils): extractFamCode + famLib + famLabel - replace normFam"

# 3. Parsing main.js
git add js/main.js
git commit -m "fix(main): use extractFamCode at parse time - articleFamille stores codes"

# 4. Parser.js
git add js/parser.js
git commit -m "fix(parser): use famLib/extractFamCode in computeBenchmark"

# 5. UI + promo + diagnostic
git add js/promo.js js/diagnostic.js js/ui.js
git commit -m "feat(ui): famLabel display everywhere - search by code or label"

# 6. Validation + cache clear notice
git commit --allow-empty -m "note: clear IDB cache after deploy (famille keys changed)"
```

---

## Validation finale

Après déploiement, charger les fichiers et vérifier :

1. `_S.articleFamille['394285']` → doit retourner `"C02"` (code pur, pas `"Coupe"` ni `"C02 - Coupe"`)
2. Autocomplete "coupe" → une seule suggestion `"C02 · Coupe"` avec le bon count
3. Autocomplete "C02" → même suggestion
4. Autocomplete "fix" → `"C03 · Fixation"`
5. Select famille dans sidebar → options affichées `"C02 · Coupe"` etc.
6. Tableau Articles → colonne famille affiche `"Coupe"` (famLib, sans code)
7. Benchmark — groupement par famille cohérent, plus de doublons
8. Aucune occurrence de `"C02 - Coupe"` dans l'UI (chercher dans les DevTools)
