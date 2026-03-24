# PRISME PREMIUM — Spec d'implémentation complète

> 9 features · 3 sprints · Fichiers : index.html, js/ui.js, js/engine.js, js/state.js, js/constants.js
> Règle absolue : ZÉRO régression sur les chiffres. Ne pas toucher parser.js sauf si explicitement indiqué.

---

## SPRINT 1 — Fondation visuelle + Decision Queue

### Feature 1 : Color Covenant (4 couleurs sémantiques)

**Fichier** : `index.html` (CSS) + audit de tous les fichiers JS émettant des classes couleur

Ajouter les variables CSS dans `:root` :
```css
:root {
  --c-action:  #2563eb;  /* Bleu  — "fais quelque chose maintenant" */
  --c-danger:  #dc2626;  /* Rouge — "perte d'argent en cours" */
  --c-caution: #d97706;  /* Ambre — "surveille, pas encore urgent" */
  --c-ok:      #16a34a;  /* Vert  — "sous contrôle, pas d'action" */
  --c-muted:   #9ca3af;  /* Gris  — "information, pas de jugement" */
}
```

**Attribution stricte** — auditer et corriger TOUT le code :
- Rouge (`--c-danger`) : UNIQUEMENT rupture active + rotation F ou M (article fréquent en stock ≤ 0)
- Ambre (`--c-caution`) : stock bas non rompu (couverture < 8j, stock > 0), OU rupture + rotation R
- Bleu (`--c-action`) : boutons d'action, CTA, liens cliquables
- Vert (`--c-ok`) : stock correct, couverture suffisante, taux de service bon
- Gris (`--c-muted`) : codes articles, libellés, dates, tout ce qui est informatif sans jugement

Chercher dans tout le code les `#ef4444`, `#dc2626`, `red`, `#f59e0b`, `#22c55e`, `text-red-*`, `text-green-*`, `bg-red-*`, `bg-green-*` etc. et les remplacer par les variables CSS.

### Feature 2 : Signal Ambiant (hue-rotate)

**Fichier** : `index.html` (CSS + HTML) + `js/ui.js`

CSS :
```css
#ambient-signal {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  height: 3px;
  z-index: 9999;
  transition: background 1.2s ease;
  background: var(--health-color, transparent);
}
```

HTML — ajouter tout en haut du body :
```html
<div id="ambient-signal"></div>
```

JS — fonction `updateAmbientSignal()` dans `js/ui.js`, appelée après chaque `renderAll()` :
- Calculer taux de service (articles fréquents W≥3 en stock ÷ total fréquents)
- Compter ruptures critiques (W≥3, stock≤0, priorityScore≥5000)
- Barre 3px : turquoise (#16a34a) si service>95%, gris (#9ca3af) si 85-95%, ambre (#d97706) si <85%, rouge (#dc2626) si >5 ruptures critiques
- Utiliser les variables du Color Covenant

### Feature 3 : Briefing 3 Phrases Cockpit

**Fichier** : `index.html` (HTML) + `js/ui.js`

Ajouter un bloc `#cockpitBriefing` au-dessus du résumé exécutif dans le Cockpit.

3 conditions indépendantes évaluées après `processData()` :
1. Ruptures critiques (W≥3, stock≤0, priorityScore≥5000) : "Ce matin : [N] ruptures critiques menacent ~[CA]€ de CA."
2. Famille qui décroche vs bassin (<50% médiane, si benchmark dispo) : "Famille [F] décroche de [X]% vs le réseau ce mois."
3. Clients stratégiques inactifs >45j (si chalandise chargée) : "[M] clients stratégiques sans commande depuis plus de 45 jours."

Si tout va bien : "Situation saine : taux de service à [X]%, aucune alerte critique détectée."

Chaque chiffre dans les phrases doit être enveloppé dans un `<span>` avec tooltip montrant la source (ex: "Basé sur X articles fréquents en rupture").

Pas de phrase générée si la condition n'est pas remplie. Max 3 phrases, min 1.

### Feature 4 : Decision Queue (generateDecisionQueue)

**Fichier** : `js/engine.js` (logique) + `js/ui.js` (rendu) + `js/state.js` (stockage)

Générer 3-7 décisions numérotées, triées par impact€ décroissant :

1. **Ruptures critiques** → `"Commander Xu réf.XXXXXX — rupture active, ~X€/sem."` (top 3, impact = W × PU)
2. **Clients stratégiques inactifs >30j** → `"Appeler client [NOM] — disparu X sem., X€ annuel."` (trié par CA desc, si chalandise chargée)
3. **Dormants** → `"Sortir X réfs dormantes — immobilisent X€ depuis ~X mois."` (si ≥3 articles, valeur >500€)
4. **Anomalies MIN/MAX** → `"Paramétrer MIN/MAX pour X articles actifs sans seuil ERP."` (si ≥5 articles)
5. **Situation saine** → `"RAS — stock calibré, taux de service X%, aucune anomalie critique."` (si aucune urgence)

Rendu : bloc `#decisionQueue` visible en haut du Cockpit (sous le briefing), avec numérotation, icônes, et montant impact à droite.

state.js : `let decisionQueueData = [];` pour stocker les décisions générées.

---

## SPRINT 2 — La DQ devient actionnable

### Feature 5 : Horizon d'Alerte Glissant

**Fichier** : `js/engine.js` + `js/ui.js`

Dans engine.js, sur chaque article enrichi après processData :
```js
// Réutiliser art.couverture (déjà calculé par calcCouverture) 
// Seuil : REAPPRO_DAYS = 8 (délai réappro 5j + sécurité 3j)
art.alertePrevisionnelle = (art.couverture != null && art.couverture <= 8 && art.stock > 0 && art.W >= 3);
```

Intégrer dans la Decision Queue AVANT les ruptures actives :
- Libellé : "⚡ [Libellé] réf.[CODE] — rupture dans [X]j, commander maintenant"
- Tri par `art.couverture` ASC (le plus urgent en premier)

### Feature 6 : Focus Mode Decision Queue (clic → navigation)

**Fichier** : `js/ui.js`

Chaque item de la DQ doit être cliquable. Au clic :
- `type === 'rupture'` ou `'alerte_prev'` → switchTab vers Articles + filtrer par article ou famille
- `type === 'dormants'` → switchTab vers Stock + activer accès rapide Dormants
- `type === 'anomalie_minmax'` → switchTab vers Stock + filtrer les articles sans MIN/MAX
- `type === 'client'` → switchTab vers Le Terrain + recherche client

Réutiliser la logique de navigation existante (switchTab, filtres, etc.). Ne pas réinventer.

### Feature 7 : Clip ERP (copier CODE + QTÉ)

**Fichier** : `js/ui.js`

Ajouter un bouton "📋 Copier paquet ERP" en pied de la Decision Queue.

```js
function clipERP() {
  const lines = decisionQueueData
    .filter(d => d.action === 'commander' && d.qteSugg > 0)
    .map(d => `${d.code}\t${d.qteSugg}`)
    .join('\n');
  if (!lines) { toast('Aucune commande à copier'); return; }
  navigator.clipboard.writeText(lines);
  toast('📋 ' + lines.split('\n').length + ' articles copiés (CODE → QTÉ)');
}
```

Format TSV : `CODE<tab>QUANTITÉ` — compatible copier-coller ERP.
La quantité suggérée = newMAX - stock (pour remplir au MAX).

---

## SPRINT 3 — Pédagogie invisible

### Feature 8 : Trace de Décision "Pourquoi ?"

**Fichier** : `js/engine.js` + `js/ui.js`

Dans engine.js, enrichir chaque décision de la DQ avec un tableau `why` :
```js
decision.why = [];
if (decision.type === 'rupture') {
  decision.why.push(`Stock actuel : ${art.stock} u. (sous le MIN de ${art.newMin})`);
  decision.why.push(`Fréquence : ${art.W} commandes/an — article ${art.fmr}`);
  decision.why.push(`CA perdu estimé : ${formatEuro(art.caPerduEstime)} si rupture maintenue`);
}
// Adapter pour chaque type de décision
```

Dans ui.js, sous chaque item DQ, ajouter un chevron expandable :
```html
<details class="dq-why"><summary>Pourquoi ?</summary>
  <ul><!-- les lignes why --></ul>
</details>
```

CSS : `.dq-why { font-size: 0.78rem; color: var(--c-muted); margin-top: 4px; }`
`.dq-why summary { cursor: pointer; color: var(--c-action); }`

### Feature 9 : Lexique Ancré <abbr>

**Fichier** : `js/ui.js`

Créer une fonction `wrapGlossaryTerms(html)` qui détecte les termes métier dans les headers de colonnes et les enveloppe dans `<abbr>`.

Termes à couvrir (réutiliser les définitions du glossaire existant) :
- FMR → "Fréquence : F≥12/an, M=3-11, R≤3"
- ABC → "Valeur : A=80% du CA, B=15%, C=5%"
- MIN → "Seuil de commande auto (plus gros panier écrêté + 3j sécurité)"
- MAX → "Capacité rayon (MIN + 21j si forte rotation, 10j sinon)"
- Couv → "Stock ÷ consommation/jour en jours"
- SASO → "Stock à sortir : dormants ou excédents à renvoyer"
- VMB → "Valeur de Marge Brute (marge brute en €)"

CSS : `abbr.gls { border-bottom: 1px dotted var(--c-muted); cursor: help; text-decoration: none; }`

Appliquer `wrapGlossaryTerms()` dans les headers des tableaux Articles, Cockpit, Stock.

---

## Règles globales

1. **Color Covenant d'abord** — c'est la fondation. Les features suivantes utilisent ses variables.
2. **Pas de framework** — Vanilla JS, innerHTML pour les tableaux (perf 10k+ lignes)
3. **Ne PAS toucher** : `js/parser.js`, `js/constants.js` (sauf ajout REAPPRO_DAYS)
4. **state.js** : uniquement ajouter `decisionQueueData` et les traces
5. **Tester** : charger les fichiers Excel, vérifier KPI identiques à l'euro près
6. **Dark mode** : toutes les nouvelles couleurs doivent fonctionner en dark (tester)
7. **Perf** : aucun calcul lourd ajouté dans les boucles de rendu, pré-calculer dans processData/engine
