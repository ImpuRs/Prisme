# Synthèse — Débat Architecture Données PRISME
## Décision architecturale actionnée

**Date** : 2026-03-28
**Rounds** : 4 × 4 participants (Gemini, Codex, Sonnet, Opus)
**Objectif** : Décision architecturale + ordre de migration concret

---

## VERDICT GLOBAL

**L'architecture B+cache est la bonne décision — et elle est déjà largement implémentée.**

Révélation Round 3 (Sonnet, lecture du code réel) : `_S._terrCanalCache`, `_S._benchCache`, `_S.articleCanalCA`, `getKPIsByCanal()`, et `finalData` canal-invariant existent déjà. Le switch canal ne déclenche PAS `renderAll()` — seulement `renderTerritoireTab()`. L'architecture cible était déjà en place.

**CQRS : rejeté unanimement** (Rounds 3 et 4). Trop complexe pour un projet sans tests auto, équipe réduite, contraintes GAS.

---

## (a) STRUCTURES À GARDER TELLES QUELLES

| Structure | Justification |
|-----------|--------------|
| `finalData[]` | Canal-invariant par design. MIN/MAX calculés une fois sur tout le consommé agence. 50+ fonctions dépendantes — intouchable. |
| `ventesParMagasin{}` | Source de vérité benchmark réseau. computeBenchmark() l'utilise partout. Modifier sa structure casse le bench entier. |
| `territoireLines[]` | Seule source brute conservée (3ème fichier). Toute modification de shape nécessite de synchroniser `_terrWorker`. |
| `articleCanalCA` | `Map<code, Map<canal, {ca, qteP, countBL}>>` — schema propre, source de vérité article×canal. Déjà utilisé par getKPIsByCanal() et le filtre canal. |
| `_terrCanalCache` / `_benchCache` | Caches de rendu HTML invalidés au rechargement. Performances prouvées. Aucun invariant métier. |
| `getKPIsByCanal()` | Fonction pure d'isolation du filtrage canal. Interface stable. |
| `blCanalMap` | Passé au Web Worker territoire pour l'assignation canal des lignes BL. |

---

## (b) STRUCTURES À UNIFIER / REFACTORER

### Priorité 1 — Schémas divergents ventesClientArticle / ventesClientHorsMagasin

**Bug latent identifié** (Sonnet, Round 4) : dans `ventesClientHorsMagasin`, si un même client achète le même article via INTERNET puis REPRESENTANT, `canal` est écrasé par le dernier vu. Une seule valeur survit.

**AVANT** (deux structures incompatibles) :
```js
// ventesClientArticle — MAGASIN, sans canal explicite
Map<cc, Map<code, {
  sumPrelevee: number,
  sumCAPrelevee: number,
  sumCA: number,
  sumCAAll: number,   // patché en post-hoc, absent de l'init
  countBL: number
}>>

// ventesClientHorsMagasin — hors-MAGASIN, schema différent + bug canal écrasé
Map<cc, Map<code, {
  ca: number,   // nommage incohérent avec ventesClientArticle
  qte: number,  // idem
  canal: string // écrasé si multi-canal pour même client×article
}>>
```

**APRÈS** (schema unifié `ClientArticleFact`) :
```js
// ventesClientHorsMagasin aligné
Map<cc, Map<code, {
  sumPrelevee: number,    // renommé depuis qte
  sumCAPrelevee: number,  // = sumCA (hors-MAGASIN = tout est prélevé dans BL omnicanal)
  sumCA: number,          // renommé depuis ca
  countBL: number,        // ajouté (incrémenté, pas remplacé)
  canal: string           // canal PRINCIPAL, ou byCanal Map si multi-canal
}>>

// ventesClientArticle — ajouter canal:'MAGASIN' explicite + init sumCAAll
Map<cc, Map<code, {
  sumPrelevee: number,
  sumCAPrelevee: number,
  sumCA: number,
  sumCAAll: number,       // dans l'init, pas en post-hoc
  countBL: number,
  canal: 'MAGASIN'        // ajouté explicitement
}>>
```

**Fonctions impactées** : `_toggleClientArticles` (main.js:481-487), `renderCockpitClients` (main.js:878-898), `renderTerrContrib`, `estimerCAPerdu` (engine.js:403), `renderDiagnosticPanel` (diagnostic.js:61-62).

### Priorité 2 — resetAppState() de 80 lignes

**AVANT** : inventaire manuel champ par champ, risque d'oubli, toute nouvelle variable non ajoutée = bug silencieux au re-chargement.

**APRÈS** :
```js
// state.js — au boot, après init _S
const _S_DEFAULTS = Object.freeze(/* snapshot des valeurs initiales sans Workers */);

function resetAppState() {
  const workers = {
    _activeReseauWorker: _S._activeReseauWorker,
    _activeTerrWorker: _S._activeTerrWorker
  };
  Object.assign(_S, structuredClone(_S_DEFAULTS));
  Object.assign(_S, workers); // restaurer les Workers (non clonables)
}
```
**Note** : `structuredClone` supporte Map/Set depuis Chrome 98+. Valider sur les versions cibles GAS.

---

## (c) STRUCTURES À CRÉER

Aucune nouvelle structure de données. La seule création nécessaire est le contrat JSDoc formel :

```js
/**
 * @typedef {Object} ClientArticleFact
 * @property {number} sumPrelevee    - Quantité prélevée (dimensionne MIN/MAX)
 * @property {number} sumCAPrelevee  - CA prélevé uniquement
 * @property {number} sumCA          - CA total (prélevé + enlevé)
 * @property {number} countBL        - Nb BL distincts (fréquence)
 * @property {string} [canal]        - Canal source (uniquement hors-MAGASIN)
 */
// À déclarer dans js/state.js au-dessus des deux Maps
```

**Structures Codex rejetées** : `src/services/cache.js`, `src/queries/index.js`, `src/models/Vente.ts` — incompatibles avec l'architecture PRISME (zéro bundler, plain JS, pas de src/).

---

## (d) ORDRE DE MIGRATION — 4 ÉTAPES

| Étape | Fichier | Changement | Risque | Invariant à vérifier |
|-------|---------|-----------|--------|---------------------|
| **1** | `js/state.js` | Ajouter JSDoc `ClientArticleFact` + commentaire schema sur les deux Maps + préparer `_S_DEFAULTS` | **Faible** | Documentation pure. Vérifier que resetAppState() reste synchrone avec les déclarations. |
| **2** | `js/main.js` L.1511 | Aligner construction `ventesClientHorsMagasin` : `{sumPrelevee: qte, sumCAPrelevee: ca, sumCA: ca, countBL: 1, canal}`, incrémenter countBL. Corriger le bug d'écrasement canal. | **Moyen** | **Invariant 4** (dualité MAGASIN/hors-MAGASIN) : vérifier que `cannauxHorsMagasin` ne contient jamais 'MAGASIN'. Test manuel : charger un consommé multi-canal, vérifier toast canaux hors-MAGASIN. |
| **3** | `js/main.js`, `js/engine.js`, `js/diagnostic.js` | Remplacer tous les accès `.ca` → `.sumCA` et `.qte` → `.sumPrelevee` sur `ventesClientHorsMagasin`. Adapter `_toggleClientArticles`. Intégrer `sumCAAll` dans l'init de `ventesClientArticle`. | **Élevé** | **Invariant 1** (prélevé dimensionne MIN/MAX) : vérifier que `estimerCAPerdu` utilise `.sumCA` (pas `.sumPrelevee`) pour le CA perdu. Test : diagnostic famille en rupture → CA perdu cohérent avec cockpit. Vérifier filtre `pdvCanalFilter='all'` utilise `sumCAAll`. |
| **4** | `js/state.js` | Implémenter `resetAppState()` via `structuredClone(_S_DEFAULTS)` + restauration Workers. | **Moyen** | Cycle load/reset/reload sur fichiers réels. Vérifier `assertPostParseInvariants()` passe après reset. Ajouter 6ème assert : `ventesClientHorsMagasin` values → `typeof sumCA === 'number'`. |

---

## QUESTIONS TRANCHÉES

| Question | Verdict | Unanimité |
|----------|---------|-----------|
| Option A (getLines + computeKPIs sur brut) | ❌ Rejeté — 200MB heap, iframe GAS, brut non conservé par design | Unanime |
| Option C (re-parsing File API) | ❌ Rejeté — 800-1200ms inacceptable sur switch canal | Unanime |
| Option D CQRS (Codex R1) | ❌ Rejeté — trop complexe sans tests auto, Codex concède R3 | Unanime R3 |
| Option B+cache | ✅ **Décision — et déjà implémentée** | Unanime R3-R4 |
| MIN/MAX varient selon canal | ❌ Non — invariants globaux, calculés sur tout le consommé | Unanime |
| Affichage "dont canal X" | ✅ Oui, lecture seule, badge grisé, sans colonne "MIN canal" | Opus+Sonnet |
| Fusion finalData+territoireLines | ❌ Rejeté — 3 invariants violés (dédup BL, articles spéciaux, période) | Opus R2 |
| Dualité MAGASIN/hors-MAGASIN | ✅ Distinction métier légitime — à garder, harmoniser le schema | Opus R1 |

---

## STRUCTURES LES PLUS RISQUÉES (ne pas toucher en premier)

1. `ventesParMagasin` — computeBenchmark() l'utilise partout, modifier casse le bench
2. `finalData` — 50+ fonctions, tout changement de schema propage partout
3. `territoireLines` — passé au Web Worker, shape doit être synchronisée

## STRUCTURES SÛRES À REFACTORER EN PREMIER

1. `_terrCanalCache` — cache pur, invalidation sans risque métier
2. `cannauxHorsMagasin` — simple Set, déjà validé par invariant
3. `_diagLevels`/`_diagActions` — scope local au diagnostic, aucun couplage moteur
