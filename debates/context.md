# Contexte : Audit Performance PRISME — Débat Architecture

## Qu'est-ce que PRISME ?
SPA 100% client-side (browser), outil BI pour distribution B2B.
Aucun serveur, aucun build tool, ESM natif, GitHub Pages.

## Le problème de performance
**516 414 lignes** consommé (XLSX Qlik) × 10 agences → **~38s** sur Intel PC, ~8s M1 Mac.

Fichiers par session :
- Consommé : ~82Mo XLSX, 516k lignes, 26 colonnes, 15 mois × 10 agences
- Stock : ~5.5Mo XLSX, ~65k lignes
- Chalandise : CSV, 23 900 clients
- Livraisons : XLSX, ~53k lignes

## Contraintes non négociables
- XLSX obligatoire (export Qlik, pas de CSV)
- Pas de serveur, pas de backend
- ESM natif (pas de bundler/Vite)
- 100% client-side
- Les 10 agences nécessaires pour benchmark réseau

## Ce qui est déjà en place
- Web Workers pour territoire, réseau, agrégats clients
- `Promise.all` lecture parallèle consommé + stock
- IDB restore (~1s au hard refresh) — **fonctionne**
- `await yieldToMain()` tous les CHUNK_SIZE lignes
- `_resetColCache()` entre fichiers
- Format dense `{headers, rows}` partiellement implémenté (arrays d'arrays)

## Ce qui a été tenté et a causé des régressions
1. **Format dense + column pre-mapping** : introduit mais pas appliqué à la boucle principale → régression partielle
2. **`_rawDataC` en IDB** : faisait exploser l'IDB à 241Mo (quota exceeded)
3. **Hash-check fichiers** : implémenté mais `_saveSessionToIDB` appelée 100+ fois en cascade → timestamp jamais posé → hash-check ne s'active jamais

## Architecture actuelle du pipeline de parsing

```
[File input] → readExcel() (SheetJS, main thread)
             → processData() (main thread, ~38s)
               ├── boucle consommé 516k lignes (CHUNK_SIZE=5000, yieldToMain)
               │   └── getVal() : lookup dynamique colonnes par nom
               ├── boucle stock ~65k lignes
               ├── computeABCFMR()
               └── _saveSessionToIDB() → IDB ~20-50Mo

[Après processData]
  → launchClientWorker() : agrégats clients (Worker)
  → launchReseauWorker() : nomades/orphelins (Worker)
  → parseChalandise() : CSV (main thread, rapide)
```

## Question centrale du débat
**Quelle est la meilleure architecture intégrée pour passer de 38s à <10s (idéalement <5s) sur Intel PC, sans régressions, dans les contraintes non négociables ?**

Les sous-questions clés :
1. Faut-il déplacer le parsing XLSX (readExcel + boucle consommé) dans un Web Worker ?
2. Quelle stratégie IDB : données brutes compressées vs données traitées seulement vs chunked raw ?
3. Comment corriger le hash-check sans l'anti-pattern d'appels en cascade `_saveSessionToIDB` ?
4. Format dense + column pre-mapping : comment le compléter correctement sans régression ?
5. Ordre de priorité des optimisations ?
