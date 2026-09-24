# PRISME

> Voir juste, piloter vite.

**Outil d'analyse BI offline** pour chef d'agence en distribution B2B (quincaillerie Legallais) : stock, clients, réseau.

Tout tourne dans le navigateur — zéro serveur, zéro cloud, zéro build step.
Déployé sur GitHub Pages : **https://impurs.github.io/Prisme/**

---

## 🎯 À quoi ça sert ?

PRISME croise les exports ERP / Qlik de l'agence pour :

- **Recalculer les MIN/MAX** de chaque article (écrêtage des commandes exceptionnelles + stock de sécurité selon la fréquence)
- **Arbitrer le rayon** : ruptures, dormants, surstock, rendement par emplacement, Plan Rayon
- **Piloter les clients** : fidélisation PDV, conquête terrain, omnicanalité, reconquête, opportunités par métier
- **Se comparer au réseau** : Physigamme (squelette d'assortiment), Duel Agence, heatmap familles × agences
- **Animer le commerce** : ciblage marque/conquête, associations d'articles, exports tournée CSV
- **Diagnostiquer une famille** en 4 niveaux adaptatifs : Stock → Calibrage → Gamme → Clients métier

## 📂 Fichiers d'entrée

| Fichier | Obligatoire | Contenu |
|---|---|---|
| **Consommé** | ✅ | Ventes multi-canal (MAGASIN, REPRÉSENTANT, INTERNET, DCS), multi-agences |
| **État du Stock** | ✅ | Articles, stock, MIN/MAX ERP, statuts, emplacements |
| **Le Terrain** | Optionnel | BL omnicanal réseau Qlik (~250k lignes) |
| **Zone de Chalandise** | Optionnel | Clients de la zone : classification, commercial, métier, CP, CA |

Les données restent dans le navigateur. La session est persistée en **IndexedDB** et restaurée au prochain lancement.

## 🧭 Navigation

| Super-onglet | Sous-onglets |
|---|---|
| 📦 **Pilotage Stock** | Arbitrage · Plan · Articles · Efficience |
| 👥 **Pilotage Commercial** | Fidélisation PDV · Conquête Terrain |
| 🏢 **Direction Réseau** | Physigamme · Duel Agence |
| 🧪 **Labo** | Action Commerciale · Associations |

Un overlay **Diagnostic** (par famille) et une **fiche Client 360°** sont accessibles depuis la plupart des vues.

### Outils annexes

| Page | Rôle |
|---|---|
| `scan.html` | Scanner code-barres mobile (PWA, `sw.js`) : stock, MIN/MAX, emplacement d'un article |
| `scan-update.html` | Mise à jour du JSON scan depuis un export ZZAT (version navigateur de `tools/update-scan.sh`) |
| `balisage.html` | Génération d'étiquettes de balisage avec code-barres |
| `conv.html` | Convertisseur XLSX → CSV local (Web Worker, multi-fichiers) |
| `scan-beta.html` | Banc d'essai des moteurs de scan (BarcodeDetector natif, ZBar, ZXing, OCR) |

## 🏗️ Architecture

```
index.html        ← structure HTML + CSS (thème dark/mixed)
js/
  main.js         ← point d'entrée ESM, orchestre les modules
  state.js        ← _S : état mutable unique
  store.js        ← DataStore : lecture seule sur _S, byContext()
  engine.js       ← moteur de calcul métier
  parser.js       ← pipeline de parsing
  parse-worker.js ← Web Worker : consommé + stock + ABC/FMR
  cache.js        ← persistance IndexedDB
  *-store.js      ← stores pré-calculés (article, client, agence, chalandise)
  …               ← un module par onglet (commerce, physigamme, planRayon, duel-agence…)
data/             ← données du scan (prisme-scan-AGxx.json)
models/           ← modèles ONNX de détection code-barres
tools/            ← scripts Node/Bash de mise à jour des données
docs/             ← documentation technique et specs
```

**Stack :** ES Modules natifs + Tailwind CSS (CDN) + SheetJS (CDN). Pas de bundler, pas de npm, pas de framework.
Les gros fichiers sont parsés en **Web Workers** ; les boucles lourdes sont découpées en chunks avec `yieldToMain()`.

Contexte détaillé pour le développement : [`CLAUDE.md`](CLAUDE.md) · documentation : [`docs/DOCUMENTATION.md`](docs/DOCUMENTATION.md)

## 🚀 Utilisation

### En ligne
Ouvrir https://impurs.github.io/Prisme/, charger le consommé et l'état du stock (+ fichiers optionnels), lancer l'analyse.

### En local
Les modules ESM et les Web Workers ne se chargent pas en `file://` : servir le dossier en HTTP.

```bash
python3 -m http.server 8080
# puis ouvrir http://localhost:8080/
```

### Mettre à jour les données du scan

```bash
./tools/update-scan.sh ~/Downloads/ZZAT018_22.csv   # merge + commit + push pour AG22
node tools/build-catalogue.js                       # data/catalogue.csv → js/catalogue-marques.json
```

### Déploiement
Chaque push sur `main` déclenche le workflow `.github/workflows/pages.yml` (GitHub Pages).

## 🧮 Algorithme MIN/MAX

Calculé sur le **prélevé** uniquement (l'enlevé ne compte que pour la fréquence) :

```
U  = prélevé moyen par BL          X = prélevé moyen par jour ouvré
dl = min(plus gros BL, 3×U, 5×U)                       ← écrêtage
MIN = dl + X × jours de sécurité   (F ≥12 BL : 4j · M 4-11 : 3j · R ≤3 : 2j)
MAX = MIN + X × 21j (≥12 BL) ou 10j
```

Cas spéciaux : W ≤ 1 → 0/0 · W = 2 → 1/2 · nouveauté < 35 j → conserve l'ancien MIN/MAX ·
statuts 2/3/4 → 0/0 · articles spéciaux (code ≠ 6 chiffres) exclus.
Si le calcul local donne 0/0 mais que le réseau stocke l'article, la **Vitesse Réseau** (Top 3 agences) prend le relais.

Détail complet des règles : [`CLAUDE.md`](CLAUDE.md) (section *Règles métier critiques*).

## 📝 Licence

© 2026 Jawad El Barkaoui — Usage interne.
