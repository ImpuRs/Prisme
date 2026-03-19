# PILOT PRO — Documentation Technique V1.0

## 1. Vue d'ensemble

PILOT PRO (ex-Optistock PRO) est un outil d'analyse et d'optimisation des stocks pour magasins de distribution B2B. Il fonctionne en fichier HTML unique dans Google Apps Script, avec 2 fichiers Excel en entrée + 1 optionnel (Territoire).

### Fichiers d'entrée

| Fichier | Contenu | Période |
|---------|---------|---------|
| Consommé (Ventes) | Toutes les lignes de commandes : prélevé, enlevé, canal, client, famille | 12 mois glissants |
| État du Stock | Stock actuel, MIN/MAX actuels, dates, statuts, emplacements, valeur PRMP | Photo du jour |
| Ventes Territoire *(optionnel)* | BL omnicanal tous canaux exporté depuis Qlik — active l'onglet 🔗 Territoire | À la demande |

### Onglets de l'outil

| Onglet | Rôle |
|--------|------|
| 📋 Articles | Tableau complet avec tous les indicateurs, filtrable, triable, exportable CSV |
| 📊 Stock | KPI → Évolution historique → Accès rapide → Attractivité par famille → Ancienneté/Statuts/Familles |
| 🎯 COCKPIT | Urgences du matin (Ruptures + Anomalies) + Préconisation de stock (SASO + Colis) |
| 📊 ABC | Matrice ABC/FMR 3×3 cliquable + guides "Par où commencer ?" et "Comment progresser ?" |
| 🔗 Territoire *(optionnel)* | Canaux agence + Vue Direction + Top 100 + filtre multi-select secteur |
| 🔄 BENCH | Comparaison multi-magasins (si fichiers multi-agences) |

### Onglet Territoire V1.0

L'onglet Territoire s'active uniquement lorsqu'un **3ème fichier** (BL omnicanal Qlik) est chargé. Il permet de comprendre ce que votre agence capte du bassin omnicanal.

**Principe fondamental** : ne jamais afficher un chiffre qu'on ne peut pas sourcer à un seul fichier. Pas de ratio entre CA de sources différentes.

**Colonnes attendues dans le fichier territoire** (matching insensible à la casse) :

| Colonne | Description |
|---------|-------------|
| Date d'expédition | Date du BL |
| Code client | Code numérique client |
| Nom client | Nom du client |
| Secteur | Secteur commercial |
| Direction | Direction commerciale (regroupement) |
| Numéro de BL | Identifiant BL — croisé avec le consommé pour déterminer le canal |
| Article | Format "CODE - LIBELLÉ" — le code est extrait avant le premier " - " |
| Quantité livrée | Quantité (négatif = avoir → ignoré) |
| CA | Chiffre d'affaires (€ et espaces retirés, virgule → point) |
| VMB | Valeur marchandise brute |
| Taux de marge | En % |

**Logique canal** : si le N° BL est présent dans les BL du fichier Consommé → `MAGASIN`, sinon → `EXTÉRIEUR`. Utilisé uniquement pour les Contributeurs agence (VOLET 2bis), pas pour les KPI ou le CA.

**Articles spéciaux** : code article ≠ exactement 6 chiffres (regex `/^\d{6}$/`) → non stockable. Exclus du calcul principal (Direction, Top 100, rayon). KPI `📌 X% du CA = spécial non stockable`.

**Statut rayon** : croisé avec `finalData` — ✅ En rayon (stock > 0), ⚠️ Rupture (référencé mais stock = 0), ❌ Absent (non référencé). Toujours affiché avec texte (accessible daltoniens).

**KPI Territoire (5 cartes, source unique)** :
1. 📋 Lignes analysées + nb BL — source : fichier territoire uniquement
2. 💰 CA Total territoire — source : fichier territoire uniquement
3. 📊 Couverture rayon "X% du Top 100 en stock" — source : croisement Top 100 territoire × stock du jour
4. 📌 Spécial X% du CA — source : fichier territoire (codes non standard)
5. 👥 Clients X mixtes / Y extérieur pur — source : croisement codes clients territoire × consommé agence

**Vue Direction** : Direction | CA Territoire | Nb articles | ✅ En rayon | ⚠️ Rupture | ❌ Absent | % couverture (nb en rayon / nb total). Triée par CA décroissant. Pas de CA Magasin/Extérieur.

**Top 100** : Code | Libellé | Direction | BL | CA Territoire | Rayon (✅/⚠️/❌ + texte) | Stock actuel. Pas de CA Magasin ni CA Extérieur.

**Clients** : Code | Nom | CA Territoire | Nb réf | Type (✅ Mixte / ❌ Extérieur pur). Pas de CA croisé.

**Résumé du croisement** (VOLET 3) : bloc sombre auto-généré au-dessus des KPIs, résumant : nb lignes, nb BL, nb Directions, nb clients, nb réf stock, nb mois consommé, nb BL consommé, % Top 100 en rayon. Toutes les valeurs sont auto-détectées depuis les fichiers.

**Contributeurs agence — Drilldown 3 niveaux** (VOLET 2bis) :
- **Vue 1 — Secteurs** : triée par % BL agence ASC (opportunités en haut). Colonnes : Secteur | Direction | BL territoire | BL agence (croisés avec blConsommeSet) | % agence (barre verte>30%, orange 10-30%, rouge<10%) | CA territoire. Export CSV.
- **Vue 2 — Clients** (clic sur secteur, lazy) : triée par CA décroissant. Colonnes : Code | Nom | CA territoire | Vient en agence (✅/❌) | Nb BL agence. Les ❌ ont fond rouge clair. Compteur "X viennent / Y ne viennent jamais".
- **Vue 3 — Articles** (clic sur client, lazy) : triée par CA décroissant. Colonnes : Code | Libellé | CA territoire | Qté BL | En rayon (✅/⚠️/❌) | Stock actuel. Exclut les spéciaux.

**Type client** : ✅ Mixte (au moins 1 BL dans blConsommeSet), ❌ Extérieur pur.

**Filtre multi-select secteur** : dropdown avec checkboxes listant tous les codes secteur du fichier territoire. Affiche le code secteur + la direction entre parenthèses. Le premier caractère du code secteur indique la direction : M=Maintenance, B=Second Œuvre, L=DVP Plomberie, F=DVI Industrie. Permet de cocher plusieurs secteurs pour comparer.

**Alertes périodes** (VOLET 4) :
- Si consommé < 10 mois : bandeau orange STICKY en haut de toutes les pages : "⚠️ Votre consommé ne couvre que X mois ([dateMin] — [dateMax]). Les MIN/MAX sont calibrés pour 12 mois glissants — résultats potentiellement sous-dimensionnés."
- Si ≥ 10 mois : période affichée dans la navbar : "📅 [dateMin] — [dateMax]" en cyan.
- Territoire : période dans le résumé du croisement (VOLET 3), pas de warning.

### Cockpit V24.3 — logique simplifiée

Le cockpit est organisé en **2 sections** :

**🔴 Urgences** — actions bloquantes du jour :
- 🚨 **Ruptures** : Fréq≥3 et Stock≤0, triées par CA potentiel perdu (score priorité)
- ⚠️ **Anomalies** : articles vendus (V>0) avec stock>0 mais MIN/MAX=0 dans l'ERP

**📦 Préconisation de stock** — actions de rééquilibrage :
- 📦 **SASO** : stock > ancien MAX ERP → excédent à renvoyer au dépôt
- 📦→🏪 **Colis à stocker** : ≥5 enlevés colis/an, 0 prélevé → candidat mise en stock rayon

Les autres listes (Fantômes, Dormants, Fins, Top 20, Nouveautés) sont accessibles depuis les **raccourcis "Accès rapide"** de l'onglet Stock.

---

## 2. Règles de calcul MIN / MAX

### 2.1 Prélevé vs Enlevé

```
PRÉLEVÉ = sorti physiquement du stock rayon (vente comptoir)
         → DIMENSIONNE le MIN/MAX

ENLEVÉ  = colis commandé par le client, livré directement
         → NE TOUCHE PAS le stock rayon
         → Compte pour la fréquence (nb clients)
         → Ne compte PAS pour le MIN/MAX
```

### 2.2 Nettoyage des données ventes

| Règle | Ce qui est filtré |
|-------|-------------------|
| Canal | Seul "MAGASIN" est retenu. INTERNET et autres exclus |
| Avoirs | Lignes avec quantité négative (prélevé < 0 ou enlevé < 0) → ignorées |
| Dédup BL | Même N° commande + même article → on garde la quantité la plus haute (pas d'addition) |
| Régularisations | Si pour un article la somme des prélevés positifs + négatifs ≤ 0 → régularisation comptable → prélevé mis à 0 |

### 2.3 Variables du calcul

```
V  = Total PRÉLEVÉ net sur la période (quantité sortie du stock rayon)
W  = Fréquence totale (nombre de commandes avec prélevé OU enlevé > 0)
Wp = Fréquence prélevé seul (nombre de commandes avec prélevé > 0)
T  = Plus gros PRÉLEVÉ sur une seule commande
U  = Moyenne PRÉLEVÉ par commande = V ÷ Wp
X  = Consommation journalière = V ÷ jours ouvrés effectifs

Jours ouvrés = calculé dynamiquement entre la date de vente
               la plus ancienne et la plus récente × (5/7)
               Fallback : 250 si pas de dates
               → Stocké dans globalJoursOuvres (variable globale) et utilisé
                 par calcCouverture() pour aligner la couverture sur la période
                 réelle du fichier Consommé
```

### 2.4 Calcul du MIN (seuil de commande)

```
Étape 1 — Écrêtage du plus gros panier :
  Si T > 3 × U → dl = 3 × U    (écrêtage à 3× la moyenne)
  Sinon        → dl = T
  Puis : dl = min(dl, U × 5)     (jamais plus de 5× la moyenne)

Étape 2 — Ajout sécurité (3 jours = 48h réappro + 1j marge) :
  MIN brut = dl + (X × 3)

Étape 3 — Plafonnement :
  MIN = min(MIN brut, V ÷ 6)     (pas plus de 2 mois de stock)
  MIN = max(MIN, 1)               (au moins 1)
```

### 2.5 Calcul du MAX (capacité rayon)

```
Si forte rotation (Wp > 12 commandes/an) :
  MAX = MIN + (X × 21 jours)

Si faible rotation (Wp ≤ 12) :
  MAX = MIN + (X × 10 jours)

Garde-fou prix élevé :
  Si prix unitaire > 150€ → pas de marge supplémentaire
  Sinon → au moins MIN + 1 (faible) ou MIN + 3 (forte)
```

### 2.6 Cas spéciaux

| Cas | Règle | MIN | MAX |
|-----|-------|-----|-----|
| Statut 2, 3, 4 (fin de série/stock) | Pas de réappro | 0 | 0 |
| W ≤ 1 (1 seule vente en 12 mois) | Trop marginal | 0 | 0 |
| W = 2 et V > 0 | Garde minimum | 1 | 2 |
| V = 0 (100% colis, 0 prélevé) | Pas besoin en rayon | 0 | 0 |
| Nouveauté (1ère entrée < 35 jours) | Laisser sa chance | Ancien MIN | Ancien MAX |
| Dormant (0 sortie > 1 an) | Via le statut/fréquence | 0 | 0 |
| **Réf. père (V23)** | **3 dates vides → pas de mouvement** | **Exclu ruptures** | **—** |

---

## 3. Nouveautés V24 — Matrice ABC/FMR

### 3.1 Calcul ABC (valeur de rotation)

Calculé sur les **articles actifs** (W ≥ 1) uniquement. Valeur de rotation = `V × prixUnitaire`.

| Classe | Critère | Logique |
|--------|---------|---------|
| **A** | Top 80% du CA cumulé | Pareto — peu d'articles, beaucoup de valeur |
| **B** | 15% suivants | Standard |
| **C** | 5% restants | Long tail — nombreux articles, faible valeur individuelle |

### 3.2 Calcul FMR (fréquence de sortie)

Basé sur W (nombre de commandes avec prélevé ou enlevé > 0 sur 12 mois).

| Classe | Critère | Signification |
|--------|---------|---------------|
| **F** | W ≥ 12 | Fréquent — sort quasiment chaque mois |
| **M** | W entre 4 et 11 | Moyen — sort régulièrement |
| **R** | W ≤ 3 | Rare — sort peu souvent |

### 3.3 Onglet "📊 ABC"

Matrice visuelle 3×3 (ABC en lignes, FMR en colonnes) affichant pour chaque cellule :
- Nombre d'articles du segment
- Valeur stock immobilisé (articles avec stock > 0)
- % du stock total

**Couleurs** : gradient de vert foncé (AF — pépite) à rouge foncé (CR — candidat déréférencement).

**Interactivité** :
- Clic sur une cellule → filtre l'onglet Articles sur ce segment
- Survol → affiche la recommandation du segment

**Recommandations par cellule** :

| Cellule | Recommandation |
|---------|---------------|
| AF | Pépites — ne jamais rompre, chaque rupture = 2j de CA perdus |
| AM | Surveiller — réassort manuel si rupture |
| AR | Gros paniers ponctuels — stock sécurité OK |
| BF | Confort — bien géré |
| BM | Standard |
| BR | Questionner le MIN |
| CF | Petit mais régulier — passage en colis ? |
| CM | Candidat réduction stock |
| CR | Candidat déréférencement ou colis pur |

### 3.4 Colonnes ABC + FMR dans Articles + CSV

Deux colonnes `ABC` et `FMR` ajoutées dans l'onglet Articles (après la colonne MAX), et exportées dans le CSV. Les articles inactifs (W = 0) ont ces colonnes vides.

### 3.5 Filtres ABC et FMR

Deux nouveaux sélecteurs dans la barre de filtres globaux permettent de filtrer l'onglet Articles par classe ABC (A/B/C) et par classe FMR (F/M/R).

### 3.6 Résumé exécutif — 4ème ligne

Ajout d'une ligne automatique : `"X% de votre stock (Y€) est en C-Rare — candidat au déréférencement ou passage colis."` (affichée seulement si la valeur C-Rare > 100€).

---

## 3bis. Nouveautés V24.2 — Estimation CA Perdu Global

### Contexte métier

Délai de réappro : 48h (J+1 détection ERP + J+1 livraison). Chaque jour de rupture sur un article fréquent représente des ventes perdues réelles. Le CA perdu est estimé à partir de la consommation historique et du nombre de jours de rupture constaté.

### Formule CA perdu par article

```
Pour chaque article en rupture (W ≥ 3, stock ≤ 0, pas isParent) :

X            = V ÷ globalJoursOuvres          (conso journalière réelle)
joursRupture = min(ageJours, 90)              (plafond 90j — au-delà = déréférencement)
caPerdu      = X × joursRupture × prixUnitaire
```

Le plafond de 90 jours évite de surestimer les ruptures structurelles (articles dormants ou déréférencés de fait).

### Impacts visuels

| Endroit | Ce qui est ajouté |
|---------|-------------------|
| **Onglet Santé — 6ème carte** | "💸 CA Perdu" gradient rose, montant total, nb d'articles |
| **Résumé exécutif** | Ligne 1 reformulée : "~X€ CA perdu estimé (Y€/an potentiel)" |
| **Cockpit Ruptures — colonne** | Colonne "CA perdu est." remplace "CA pot." + durée de rupture affichée |
| **Cockpit Ruptures — pied de tableau** | Ligne tfoot : "💸 Total CA perdu estimé : X€" |
| **Comparaison historique** | 7ème carte "💸 CA Perdu" (vert si diminue vs dernière analyse) |
| **CSV exporté** | Colonne `CAPerdu` (0 pour les articles hors rupture) |

---

## 4. Nouveautés V23

### 4.1 Résumé exécutif automatique

Bloc en haut du cockpit, 3 lignes générées automatiquement :
1. **Ruptures** : nombre + CA potentiel perdu annuel + top 3 articles
2. **Assainissement** : total dormants + CAPALIN à renvoyer
3. **Taux de service** : diagnostic (excellent / correct / priorité)

### 4.2 Tri par CA potentiel perdu

Les ruptures sont désormais triées par `Fréquence × Prix unitaire` (CA annuel potentiel perdu) au lieu de la fréquence seule.

### 4.3 Score de priorité composite

```
Score = Fréquence × Prix unitaire × Coefficient d'ancienneté

Coefficient d'ancienneté :
  < 30 jours  → 0.8 (problème récent, peut se résoudre)
  < 90 jours  → 1.0 (normal)
  < 180 jours → 1.2 (ça traîne)
  > 180 jours → 1.5 (problème structurel)

Seuils visuels :
  🔴 > 5 000€  → Critique
  🟠 > 1 000€  → Haute
  🟡 > 300€    → Moyenne
  ⚪ < 300€    → Faible
```

### 4.4 Filtre références père

**Problème** : les références "carton" (père) ont toujours un stock à 0 dans l'ERP car le stock physique est porté par la référence fils (unité). Cela créait des faux positifs dans les ruptures.

**Solution** : si les 3 colonnes de dates du fichier stock sont toutes vides ou "-" :
- Date dernière sortie
- Date première entrée / réception  
- Date dernière entrée

→ L'article est marqué `isParent = true` et **exclu des ruptures**.

Le nombre de réf. père exclues est affiché sous le titre des ruptures. Le flag est aussi exporté dans le CSV (colonne `RefPere`).

### 4.5 Suppression des badges conditionnement

Les badges 📦C24, 📦B10 etc. ont été retirés de tous les tableaux du cockpit car ils n'apportaient pas de valeur ajoutée pour l'action terrain.

---

## 5. Indicateurs calculés

### 5.1 Par article

| Indicateur | Formule | Signification |
|-----------|---------|---------------|
| Prél | Somme prélevé net 12 mois | Ce qui sort vraiment du rayon |
| Enl | Somme enlevé 12 mois | Colis commandés (info) |
| Fréq | Nombre de commandes (W) | Nombre de clients/BL |
| Couverture | Stock ÷ (V ÷ globalJoursOuvres) | Jours de stock restant (base = jours ouvrés dynamiques du fichier) |
| Âge | Jours depuis dernière sortie | Fraîcheur de l'article |
| **ABC** | Classement Pareto valeur rotation (V×PU) | A=top 80%, B=15%, C=5% — actifs uniquement (V24) |
| **FMR** | Classement fréquence W | F≥12, M=4-11, R≤3 — actifs uniquement (V24) |

### 5.2 KPI Dashboard (Santé)

| KPI | Formule |
|-----|---------|
| Total immobilisé | Σ(stock × prix) pour stock > 0 |
| Dormant | Σ valeur des articles > 1 an sans sortie et non-nouveauté |
| Surstock actif | Σ (stock - NOUVEAU MAX) × prix, pour articles actifs dépassant le MAX |
| CAPALIN (SASO) | Σ (stock - ANCIEN MAX) × prix, pour articles dépassant l'ancien MAX ERP |
| Taux de service | % d'articles avec fréq ≥ 3 qui ont du stock > 0 |
| **💸 CA Perdu** | Σ(V÷joursOuvrés × min(ageJours,90) × PU) pour articles en rupture (V24.2) |

---

## 6. Cockpit — Actions prioritaires

### 🔴 Urgences

| Bloc | Critère | Action |
|------|---------|--------|
| 🚨 Ruptures | Fréq ≥ 3, Stock ≤ 0, pas réf. père (V23) | Commander d'urgence, trié par CA potentiel perdu |
| 👻 Fantômes | Stock > 0 ET emplacement vide | Retrouver physiquement le produit |
| ⚠️ Anomalies | Stock > 0, ventes > 0, ancien MIN/MAX = 0, pas nouveauté | Paramétrer les MIN/MAX dans l'ERP |

### 🟠 Assainissement

| Bloc | Critère | Action |
|------|---------|--------|
| 📦 SASO | Stock > ancien MAX (ERP) | Renvoyer l'excédent à la centrale |
| 💤 Dormants | 0 sortie > 1 an, valeur > 50€ | Brader, solder, retourner |
| 📉 Fins | Statut "fin de série/stock" avec stock restant | Solder rapidement |

### 🟢 Opportunités

| Bloc | Critère | Action |
|------|---------|--------|
| 🏆 Top 20 | Les 20 articles avec la plus haute fréquence | Ne jamais rompre |
| ✨ Nouveautés | 1ère entrée < 35 jours | Surveiller les premières ventes |
| 📦→🏪 Colis à stocker | ≥ 5 enlevés/an, 0 prélevé | Envisager de mettre en rayon |

---

## 7. Paramètres du calcul

| Constante | Valeur | Signification |
|-----------|--------|---------------|
| SECURITY_DAYS | 3 | Jours de sécurité (48h réappro + 1j marge) |
| DORMANT_DAYS | 365 | Seuil dormant en jours |
| NOUVEAUTE_DAYS | 35 | Seuil nouveauté en jours |
| HIGH_PRICE | 150 | Prix unitaire au-dessus duquel on limite le MAX |
| PAGE_SIZE | 200 | Lignes par page dans le tableau |
| CHUNK_SIZE | 5000 | Taille des morceaux pour le traitement par chunks |

---

## 8. Fréquence d'utilisation recommandée

| Action | Fréquence |
|--------|-----------|
| Recalibrer les MIN/MAX | 1×/mois |
| Nettoyer les dormants | 1×/mois |
| Exporter le JSON historique | 1×/mois |
| Benchmark bassin | 1×/trimestre |
| Revoir les "Colis à stocker" | 1×/trimestre |

---

## 9. Historique des fixes

| Fix | Problème | Solution |
|-----|----------|----------|
| Avoirs filtrés | Lignes avec qté négative comptées comme ventes | `if(qteP<0 \|\| qteE<0) continue` |
| Dédup BL | Même BL en Enlevé ET Prélevé = double comptage | Clé = N° commande, garde le MAX |
| Régularisations | Prélevé positif + avoir négatif = jeu comptable | Si prélevé net ≤ 0 → prélevé = 0 |
| Écrêtage ×5 | Grosse commande industrielle explose le MIN | `dl = min(dl, U×5)` |
| Prélevé/Enlevé séparés | Colis gonflaient le MIN/MAX | MIN/MAX basé uniquement sur prélevé |
| Ruptures W≥3 | Seuil > 3 excluait des ruptures réelles | Changé en ≥ 3 |
| W=2 → MIN=1 | Articles à 2 ventes tombaient à MIN=0 | Si W=2 et V>0 → MIN=1, MAX=2 |
| Jours ouvrés dynamiques | Si fichier < 12 mois, calcul faussé | Calculé entre min/max date du fichier |
| Ancienneté = 365 | Article à 365j pile incohérent | d<=365 → hot (cohérent avec >365 du dormant) |
| **Réf. père (V23)** | **Cartons toujours stock=0 = faux positifs ruptures** | **3 dates vides → isParent → exclu** |
| **Badges C24 (V23)** | **Badges conditionnement inutiles** | **Supprimés du cockpit** |
| **ABC/FMR (V24)** | **Pas de segmentation analytique** | **computeABCFMR() : Pareto rotation + fréquence** |
| **CA Perdu (V24.2)** | **CA potentiel annuel seulement, pas d'estimation réelle** | **joursRupture = min(ageJours,90), caPerdu = X×j×PU** |

---

## 6. Diagnostic Cascade Adaptatif — V2 Phase 2

### 6.1 Principe

PILOT s'adapte aux fichiers disponibles. Chaque fichier chargé débloque un niveau supplémentaire du diagnostic. Le diagnostic fonctionne toujours, même avec seulement Consommé + Stock.

### 6.2 Déclencheurs

| Contexte | Condition de déclenchement |
|----------|---------------------------|
| **Bench** (multi-agences) | Clic sur cellule rouge (< 50% médiane) dans Forces & Faiblesses |
| **Cockpit** | Bouton 🔍 sur ruptures avec score priorité ≥ 5 000€ (CA perdu) |
| **ABC** | Bouton 🔍 sur familles CF dans la section sous la matrice |
| **Stock** | Bouton 🔍 dans le tableau Top 10 Familles |

### 6.3 Interface

Panneau overlay sombre (`#diagnosticOverlay`, z-index 10500) avec :
- Header : famille analysée, agence vs référence, fichiers disponibles (✅/❌)
- 4 niveaux verticaux avec indicateur statut : ✅ Bon / ⚠️ À corriger / 🔴 Problème / 🔒 Non disponible
- Plan d'action généré automatiquement (max 3 actions cliquables)
- Export CSV du plan d'action
- Bouton ✕ pour fermer + clic sur fond pour fermer

### 6.4 Les 4 Niveaux

#### Niveau 1 — Stock (toujours disponible)

Données : `finalData` filtré sur la famille.

- Articles en stock vs en rupture (W≥3, stock≤0, non-parent)
- Jours de rupture estimés = `min(ageJours, 90j)`
- CA perdu estimé = `(V / globalJoursOuvres) × joursRupture × prixUnitaire`
- Statut : ok si 0 rupture · warn si < 1 000€ · error si ≥ 1 000€

#### Niveau 2 — Calibrage MIN/MAX (toujours disponible)

Données : `finalData` + `ventesParMagasin[refStore]` (si bench).

- Articles sans MIN/MAX paramétré (ancienMin=0, ancienMax=0, non nouveauté, W≥1) → anomalies
- Articles sous-dimensionnés : ancienMin > 0 mais ancienMin < nouveauMin PILOT
- Mode multi-agences : articles où la fréquence du magasin de référence > 2× la mienne

#### Niveau 3 — Profondeur de gamme (Bench OU Territoire requis)

**Mode bench** : compare `ventesParMagasin[refStore]` filtré par famille vs mes références.
- Magasin de référence = magasin avec la plus haute fréquence (`benchLists.storePerf` trié par freq desc)
- Articles du ref absents chez moi, triés par fréquence ref décroissante
- `strongMissing` = articles classés A ou B chez la référence

**Mode territoire** : compare `territoireLines` filtré sur la famille vs `finalData`.
- Articles vendus sur le territoire non référencés en stock agence
- Triés par CA territoire décroissant

#### Niveau 4 — Clients métier (Chalandise requise)

Données : `ventesClientArticle` × `chalandiseData`.

1. Identifier le métier dominant via croisement ventes famille × métiers chalandise
2. Lister tous les clients de la zone avec ce métier
3. Statuts : Actif (CA > 0 + statut actif) / Perdu (statut perdu/inactif) / Prospect (non acheteur)
4. Potentiel reconquête = somme CA famille des clients perdus

### 6.5 Plan d'action

Règles de génération (max 3 actions) :

| Condition | Action | Étoiles |
|-----------|--------|---------|
| Niveau 1 rouge | Réassort X articles en rupture — CA Y€ → filtre Articles/ruptures | ⭐ |
| Niveau 2 non-ok | Recalibrer MIN/MAX de X articles → filtre Articles famille | ⭐ |
| Niveau 3 non-ok | Référencer X articles manquants → onglet Bench ou Territoire | ⭐⭐ |
| Niveau 4 perdus | Démarcher X clients perdus — potentiel Y€ → onglet Territoire | ⭐⭐⭐ |

Chaque action est cliquable et navigue directement vers le bon onglet avec les filtres pré-remplis. Le bouton "📥 Exporter CSV" génère `PILOT_Diag_[Famille]_[date].csv` avec les détails de chaque niveau.

### 6.6 Détail technique

```javascript
// Déclenchement
openDiagnostic(famille, source) // source: 'bench'|'cockpit'|'abc'|'stock'
closeDiagnostic()

// Calcul des niveaux (synchrone, lazy au clic)
_diagLevel1(famille) → {arts, enStock, ruptures[], caPerduTotal, status}
_diagLevel2(famille, hasBench, refStore) → {status, nonCal, sousD, sousPerf[], detail[]}
_diagLevel3(famille, hasBench, hasTerr, refStore) → {status, mode, myCount, missing[], strongMissing}
_diagLevel4(famille, hasChal) → {status, metier, clients[], actifs, perdus, potentiel}

// Plan d'action
_diagGenActions(famille, l1, l2, l3, l4) → _diagActions[] avec .fn()
executeDiagAction(idx) // déclenché par onclick dans le plan

// Export
exportDiagnosticCSV(famille) // CSV avec colonnes Niveau|Type|Code|Libellé|Détail|Valeur
```

Variables globales : `_diagLevels = {l1, l2, l3, l4}`, `_diagActions = []`.

---

*Document généré — PILOT PRO 1.0 (ex-Optistock PRO)*
