# OPTISTOCK PRO — Documentation Technique V23

## 1. Vue d'ensemble

Optistock est un outil d'analyse et d'optimisation des stocks pour magasins de distribution B2B. Il fonctionne en fichier HTML unique dans Google Apps Script, avec 2 fichiers Excel en entrée.

### Fichiers d'entrée

| Fichier | Contenu | Période |
|---------|---------|---------|
| Consommé (Ventes) | Toutes les lignes de commandes : prélevé, enlevé, canal, client, famille | 12 mois glissants |
| État du Stock | Stock actuel, MIN/MAX actuels, dates, statuts, emplacements, valeur PRMP | Photo du jour |

### Onglets de l'outil

| Onglet | Rôle |
|--------|------|
| 📋 Articles | Tableau complet avec tous les indicateurs, filtrable, triable, exportable CSV |
| 📊 Santé | KPI globaux + comparaison vs analyse précédente |
| 🎯 COCKPIT | Actions prioritaires classées par urgence + résumé exécutif (V23) |
| 🧲 Ventes | Attractivité par famille |
| 🔄 BENCH | Comparaison multi-magasins (si fichiers multi-agences) |

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

## 3. Nouveautés V23

### 3.1 Résumé exécutif automatique

Bloc en haut du cockpit, 3 lignes générées automatiquement :
1. **Ruptures** : nombre + CA potentiel perdu annuel + top 3 articles
2. **Assainissement** : total dormants + CAPALIN à renvoyer
3. **Taux de service** : diagnostic (excellent / correct / priorité)

### 3.2 Tri par CA potentiel perdu

Les ruptures sont désormais triées par `Fréquence × Prix unitaire` (CA annuel potentiel perdu) au lieu de la fréquence seule.

### 3.3 Score de priorité composite

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

### 3.4 Filtre références père

**Problème** : les références "carton" (père) ont toujours un stock à 0 dans l'ERP car le stock physique est porté par la référence fils (unité). Cela créait des faux positifs dans les ruptures.

**Solution** : si les 3 colonnes de dates du fichier stock sont toutes vides ou "-" :
- Date dernière sortie
- Date première entrée / réception  
- Date dernière entrée

→ L'article est marqué `isParent = true` et **exclu des ruptures**.

Le nombre de réf. père exclues est affiché sous le titre des ruptures. Le flag est aussi exporté dans le CSV (colonne `RefPere`).

### 3.5 Suppression des badges conditionnement

Les badges 📦C24, 📦B10 etc. ont été retirés de tous les tableaux du cockpit car ils n'apportaient pas de valeur ajoutée pour l'action terrain.

---

## 4. Indicateurs calculés

### 4.1 Par article

| Indicateur | Formule | Signification |
|-----------|---------|---------------|
| Prél | Somme prélevé net 12 mois | Ce qui sort vraiment du rayon |
| Enl | Somme enlevé 12 mois | Colis commandés (info) |
| Fréq | Nombre de commandes (W) | Nombre de clients/BL |
| Couverture | Stock ÷ (V ÷ jours ouvrés) | Jours de stock restant |
| Âge | Jours depuis dernière sortie | Fraîcheur de l'article |

### 4.2 KPI Dashboard (Santé)

| KPI | Formule |
|-----|---------|
| Total immobilisé | Σ(stock × prix) pour stock > 0 |
| Dormant | Σ valeur des articles > 1 an sans sortie et non-nouveauté |
| Surstock actif | Σ (stock - NOUVEAU MAX) × prix, pour articles actifs dépassant le MAX |
| CAPALIN (SASO) | Σ (stock - ANCIEN MAX) × prix, pour articles dépassant l'ancien MAX ERP |
| Taux de service | % d'articles avec fréq ≥ 3 qui ont du stock > 0 |

---

## 5. Cockpit — Actions prioritaires

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

## 6. Paramètres du calcul

| Constante | Valeur | Signification |
|-----------|--------|---------------|
| SECURITY_DAYS | 3 | Jours de sécurité (48h réappro + 1j marge) |
| DORMANT_DAYS | 365 | Seuil dormant en jours |
| NOUVEAUTE_DAYS | 35 | Seuil nouveauté en jours |
| HIGH_PRICE | 150 | Prix unitaire au-dessus duquel on limite le MAX |
| PAGE_SIZE | 200 | Lignes par page dans le tableau |
| CHUNK_SIZE | 5000 | Taille des morceaux pour le traitement par chunks |

---

## 7. Fréquence d'utilisation recommandée

| Action | Fréquence |
|--------|-----------|
| Recalibrer les MIN/MAX | 1×/mois |
| Nettoyer les dormants | 1×/mois |
| Exporter le JSON historique | 1×/mois |
| Benchmark bassin | 1×/trimestre |
| Revoir les "Colis à stocker" | 1×/trimestre |

---

## 8. Historique des fixes

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

---

*Document généré — Optistock PRO V23*
