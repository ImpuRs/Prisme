# ÉTAPE 2 — Migration engine.js (suppression doublons + factorisation CA perdu)

## Contexte
`js/engine.js` est déjà créé et contient toutes les fonctions moteur. Mais elles sont encore **dupliquées** dans `index.html`. Cette étape :
1. Ajoute le `<script src="js/engine.js">` dans index.html
2. Supprime les doublons dans index.html
3. Remplace les calculs inline de CA perdu par `estimerCAPerdu()`
4. Remplace le bloc PU fallback inline par `enrichPrixUnitaire()`

## 1. Ajouter l'import

Dans `index.html`, juste APRÈS `<script src="js/state.js"></script>` et AVANT le `<script>` principal, ajouter :
```html
<script src="js/engine.js"></script>
```

## 2. Supprimer les doublons — fonctions à retirer de index.html

Chaque fonction ci-dessous existe déjà dans `js/engine.js`. Supprimer la définition dans index.html :

| Ligne approx. | Fonction |
|---|---|
| ~876 | `clientMatchesDeptFilter` |
| ~880 | `clientMatchesClassifFilter` |
| ~881 | `clientMatchesStatutFilter` |
| ~882 | `clientMatchesActivitePDVFilter` |
| ~883 | `clientMatchesCommercialFilter` |
| ~884 | `clientMatchesMetierFilter` |
| ~929 | `_clientPassesFilters` |
| ~950 | `_isPDVActif` |
| ~951 | `_isPerdu` (⚠️ il y a 2 occurrences — supprimer les DEUX) |
| ~952 | `_isProspect` |
| ~953 | `_isPerdu24plus` |
| ~1189 | `_isGlobalActif` |
| ~1385 | `calcCouverture` |
| ~1386 | `formatCouv` |
| ~1387 | `couvColor` |
| ~1390-1398 | `computeClientCrossing` |
| ~1399-1405 | `_crossBadge` |
| ~1406-1412 | `_passesClientCrossFilter` |
| ~1426-1435 | `calcPriorityScore` |
| ~1436 | `prioClass` |
| ~1437 | `prioLabel` |
| ~1440-1448 | `isParentRef` |
| ~1449-1478 | `computeABCFMR` |
| ~3115-3124 | `_radarComputeMatrix` |
| ~3817-3827 | `_diagClientPrio` |
| ~3829 | `_diagClassifPrio` |
| ~3830-3835 | `_diagClassifBadge` |

## 3. Supprimer le bloc PU fallback inline

Dans `processData()`, il y a un bloc qui fait le fallback PU (ajouté au fix précédent). Il ressemble à :
```js
// ★ Fix: PU fallback from consommé for articles with prixUnitaire=0
{const mySk=selectedMyStore||Object.keys(ventesParMagasin)[0]||'';
for(const r of finalData){if(r.prixUnitaire>0)continue;
  ...
}}
```

Remplacer ce bloc par un simple appel :
```js
enrichPrixUnitaire();
```

## 4. Factoriser les calculs de CA perdu inline

Remplacer les formules inline par `estimerCAPerdu()`. Voici chaque occurrence :

### 4a. Diagnostic cell Radar (~ligne 3294)
```js
// AVANT :
const ca=Math.round((r.V/globalJoursOuvres)*jours*r.prixUnitaire);caPerduTotal+=ca;
// APRÈS :
const ca=estimerCAPerdu(r.V,r.prixUnitaire,jours);caPerduTotal+=ca;
```

### 4b. Diagnostic famille (~ligne 3391)
```js
// AVANT :
const ca=Math.round((r.V/globalJoursOuvres)*jours*r.prixUnitaire);
// APRÈS :
const ca=estimerCAPerdu(r.V,r.prixUnitaire,jours);
```

### 4c. Diagnostic famille — 2ème occurrence (~ligne 3439)
```js
// AVANT :
const ca=Math.round((r.V/globalJoursOuvres)*jours*r.prixUnitaire);
// APRÈS :
const ca=estimerCAPerdu(r.V,r.prixUnitaire,jours);
```

### 4d. Diagnostic métier territoire (~ligne 3711)
```js
// AVANT :
const jours=90;const ca=Math.round((a.V/globalJoursOuvres)*jours*a.prixUnitaire);caPerduTotal+=ca;
// APRÈS :
const jours=90;const ca=estimerCAPerdu(a.V,a.prixUnitaire,jours);caPerduTotal+=ca;
```

### 4e. Export CSV (~ligne 3980)
Dans la fonction `downloadCSV()`, il y a :
```js
const caPerduCSV=(r.W>=3&&r.stockActuel<=0&&!r.isParent&&r.V>0)?Math.round((r.V/globalJoursOuvres)*Math.min(r.ageJours>=999?90:r.ageJours,90)*r.prixUnitaire):0;
```
Remplacer par :
```js
const caPerduCSV=(r.W>=3&&r.stockActuel<=0&&!r.isParent&&r.V>0)?estimerCAPerdu(r.V,r.prixUnitaire,Math.min(r.ageJours>=999?90:r.ageJours,90)):0;
```

### 4f. Cockpit CA perdu mono-agence (~ligne 2926)
Celui-ci est un cas spécial — en mono-agence il utilise `r.V*r.prixUnitaire` (CA total période, pas CA perdu par jour). NE PAS remplacer par `estimerCAPerdu` — la formule est intentionnellement différente.

## 5. Vérification

Après les modifications :
1. `node --check js/engine.js` → aucune erreur
2. Ouvrir `index.html` dans le navigateur → console propre, zéro erreur
3. Charger les fichiers Consommé + Stock
4. Vérifier que les chiffres du cockpit (ruptures, CA perdu) sont identiques
5. Ouvrir le diagnostic d'une case Radar → CA récupérable doit être > 0€
6. Exporter le CSV → colonne CAPerdu doit avoir des valeurs

## Résumé de l'impact
- ~30 fonctions retirées de index.html
- ~150 lignes en moins dans index.html  
- 5 formules de CA perdu factorisées → 1 seule source de vérité (`estimerCAPerdu`)
- Le fix PU fallback est centralisé dans `enrichPrixUnitaire()`
