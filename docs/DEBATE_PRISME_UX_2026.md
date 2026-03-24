# PRISME 2026 — Vision UX Futuriste
> Synthèse du débat 4 IAs — 24 mars 2026
> Format : 3 rounds · 4 angles · Contraintes : HTML statique, zéro serveur, données locales Excel

---

## Contexte

PRISME (ex-Optistock PRO) est un outil BI pour chef d'agence Legallais (distribution B2B quincaillerie). Aujourd'hui : tableaux, filtres, cockpit. La question posée : **qu'est-ce qui fait qu'en ouvrant l'outil on dit "wouahh" — en restant dans les contraintes (HTML statique, JS pur, zéro serveur) ?**

Quatre IAs ont débattu en 3 rounds, chacune défendant un angle différent.

---

## Les 4 Angles

| IA | Angle | Thèse centrale |
|----|-------|----------------|
| 🎨 Sonnet | WOW Visuel | La clarté instantanée EST le WOW — pas le spectacle |
| 📖 Gemini | Narration Data | La donnée doit avoir une voix, pas juste une forme |
| 🤖 Opus | IA Embarquée | L'outil qui pense pendant que tu navigues |
| 🧭 Codex | Onboarding Intelligent | Réduire le temps avant compréhension, en continu |

---

## Les Phrases Clés du Débat

> *"Le WOW n'est pas ce qu'on regarde — c'est ce qu'on comprend plus vite que prévu."*
> — Sonnet (WOW Visuel, Round 3)

> *"PRISME 2026 n'est pas plus beau que son concurrent — il est plus intelligent. Et dans un outil que tu ouvres chaque lundi matin, c'est ça qui fait 'wouahh' au 52ème lancement."*
> — Opus (IA Embarquée, Round 3)

> *"La meilleure BI n'est pas celle qu'on apprend à utiliser, c'est celle qui apprend immédiatement à vous être utile."*
> — Codex (Onboarding, Round 3)

> *"Ne forcez plus vos experts à traduire des pixels en stratégies."*
> — Gemini (Narration Data, Round 3)

---

## Verdict

**🏆 Vainqueur : Sonnet — WOW Visuel (version évoluée)**

Sonnet a réalisé le pivot intellectuel le plus fort du débat : entré avec "Canvas de particules plein écran", sorti avec "clarté instantanée = le vrai WOW". Il a absorbé les critiques adverses (CPU, utilité réelle, distraction) pour produire une thèse plus solide — et plus implémentable — qu'au départ. C'est le signe d'un argument qui tient.

---

## Vision Synthèse — PRISME 2026

*Combinant les meilleures idées des 4 angles, dans les contraintes techniques du projet*

### Architecture en 6 Couches

---

### Couche 1 — Signal Ambiant (800ms au chargement)
*Angle WOW Visuel — Effort : 🟢 30 min*

Le fond de l'interface n'est pas blanc. C'est un gradient radial très subtil dont la teinte est calculée une fois au chargement depuis le ratio `ruptures critiques / total références`. Le cerveau du chef d'agence reçoit le signal **avant** de lire un chiffre.

```css
/* 3 lignes. C'est tout. */
body {
  filter: hue-rotate(var(--health-hue, 0deg));
  transition: filter 1.2s ease;
}
```

- Taux service > 95% → nuance turquoise froide (calme)
- Taux service 85–95% → neutre blanc chaud
- Taux service < 85% → légère chaleur orange
- > 5 ruptures critiques → tension rouge imperceptible

**Règle absolue** : l'effet doit être subliminal, pas visible. Si l'utilisateur le remarque consciemment, c'est trop fort.

---

### Couche 2 — Briefing Matinal (cockpit, 3 phrases)
*Angle IA Embarquée — Effort : 🟢 2h*

Au lieu d'un cockpit qui liste des KPIs plats, PRISME génère 3 phrases en JS pur depuis des **templates à variables mesurées** (pas du NLG halluciné — des valeurs vérifiables, affichées en tooltip sur chaque chiffre).

```
"Ce matin : [N] ruptures critiques menacent ~[CA]€ de CA.
Famille [F] décroche de [X]% vs le bassin ce mois.
[M] clients stratégiques inactifs depuis plus de 45 jours."
```

La phrase n'est générée que si la condition est vraie. Si tout va bien, la phrase dit : *"Situation saine : taux de service à [X]%, aucune alerte critique détectée."*

---

### Couche 3 — Heat Canvas Famille×Semaine
*Angle WOW Visuel × IA Embarquée — Effort : 🟡 4h*

**La data viz qui dit tout avant le premier filtre.**

Un Canvas 2D natif rendu en <16ms :
- **Axe X** : semaines du consommé (période auto-détectée)
- **Axe Y** : familles triées par CA perdu estimé (desc)
- **Cellule** : colorée par intensité des ruptures sur la semaine (blanc → orange → rouge)
- **Interaction** : `mousemove` → tooltip inline (famille, semaine, ruptures, CA perdu)
- **Zéro lib externe** — `requestAnimationFrame`, `ctx.fillRect`, c'est tout

```javascript
// Principe de base
function renderHeatCanvas(data, canvasEl) {
  const ctx = canvasEl.getContext('2d');
  const familles = [...new Set(data.map(d => d.famille))].sort(/* by CA perdu */);
  const semaines = getWeeksFromConsomme(data);
  // cellule = intensité ruptures semaine×famille → hsl(0, saturation%, 50%)
  familles.forEach((fam, y) => {
    semaines.forEach((week, x) => {
      const intensity = getRuptureIntensity(data, fam, week); // 0-1
      ctx.fillStyle = `hsl(${Math.round(intensity * 15)}, ${Math.round(intensity * 80)}%, ${Math.round(55 - intensity * 25)}%)`;
      ctx.fillRect(x * cellW, y * cellH, cellW - 1, cellH - 1);
    });
  });
}
```

---

### Couche 4 — Tableaux Vivants
*Angle WOW Visuel — Effort : 🟢 1h*

Les lignes des tableaux ne sont pas statiques. Chaque ligne a une "température" : une micro-animation CSS de hauteur proportionnelle au score de priorité.

```css
@keyframes breathe {
  0%, 100% { transform: scaleY(1); }
  50% { transform: scaleY(1.008); }
}
.row-critical {
  animation: breathe 2s ease-in-out infinite;
}
.row-dormant {
  opacity: 0.65;
  filter: saturate(0.4);
}
```

- Ruptures critiques (score > 5000€) : pulsent doucement
- Dormants : légèrement décolorés et "effacés"
- Scroller dans la table ressemble à parcourir un organisme vivant

---

### Couche 5 — Intelligence Continue (Copilote Silencieux)
*Angle IA Embarquée × Onboarding — Effort : 🟡 3h*

Un Web Worker JS tourne en arrière-plan pendant que l'utilisateur navigue. Il cherche des corrélations non-évidentes : client inactif × famille en baisse × saison. Quand il trouve quelque chose, **une pastille orange pulse discrètement** dans la navbar — pas de notification intrusive, juste un signal qui attend que l'utilisateur soit prêt.

La transparence est non-négociable : chaque insight cliqué affiche la formule et les données sources. "Prédiction basée sur X BL sur Y semaines" — pas une boîte noire.

---

### Couche 6 — Narration Ancrée (bonus)
*Angle Narration Data × Onboarding — Effort : 🟡 3h*

Chaque KPI clé dispose d'un **titre sémantique dynamique** généré par agrégation logique :

```
Au lieu de : "Visserie — CA : 142 300€ (-14%)"
PRISME dit : "Visserie : -14% sur 3 semaines consécutives de rupture"
```

Chaque titre est un hyperlien → déploie les données sources brutes. L'analyse BI se lit comme une enquête, pas comme un tableau.

---

## Roadmap Implémentation

| Priorité | Feature | Effort estimé | Impact UX | Fichier(s) |
|----------|---------|---------------|-----------|-----------|
| 🥇 P0 | Signal ambiant `hue-rotate` | 30 min | ⭐⭐⭐⭐⭐ | `index.html` CSS |
| 🥇 P0 | Briefing 3 phrases cockpit | 2h | ⭐⭐⭐⭐⭐ | `js/engine.js` |
| 🥇 P0 | `animation: breathe` lignes | 1h | ⭐⭐⭐⭐ | `index.html` CSS |
| 🥈 P1 | Heat Canvas Famille×Semaine | 4h | ⭐⭐⭐⭐⭐ | `js/ui.js` (nouveau) |
| 🥈 P1 | Pastille navbar + worker insights | 3h | ⭐⭐⭐⭐ | `js/engine.js` |
| 🥉 P2 | Titres sémantiques dynamiques | 3h | ⭐⭐⭐ | `js/ui.js` |
| 🥉 P2 | Profils métier (réordonnancement) | 6h | ⭐⭐⭐ | `js/state.js` + `js/ui.js` |

**Total quick-wins P0 : ~3h30 pour un WOW immédiat.**
**Total P0+P1 : ~10h30 pour PRISME 2026 complet.**

---

## Règles de Design Issues du Débat

1. **Zéro animation sans sémantique** — chaque mouvement transporte de l'information
2. **Palette stricte** : 🔴 danger / 🟠 vigilance / 🟢 sain / ⚫ neutre
3. **Transitions : 150-200ms, `transform` GPU uniquement** (jamais `width` ou `top`)
4. **Transparence IA obligatoire** : tout insight affiché montre sa source en tooltip
5. **L'overlay sombre concentre** — le diagnostic cascade est déjà juste
6. **Subliminal > spectaculaire** : l'effet ambiant doit être ressenti, pas vu

---

## Ce qui a été rejeté (et pourquoi)

| Idée | Rejetée par | Raison |
|------|-------------|--------|
| Canvas de particules plein écran | Gemini, Opus | CPU, distraction, inutile à J+30 |
| NLG halluciné (texte libre IA) | Opus | Perte de crédibilité si une phrase est fausse |
| Onboarding tunnel (une seule fois) | Sonnet, Opus | Ignore les 364 autres jours |
| Constellation clients SVG décorative | Sonnet | Spectacle sans signal d'action |
| Prédiction J+7 sans transparence | Codex | Boîte noire = méfiance utilisateur |

---

## Débat complet

Le débat intégral (3 rounds, 4 IAs) est archivé dans `.debate/prisme-ux-20260324-185147.md`.

---

*Généré le 24 mars 2026 — Claude Opus · Claude Sonnet · Gemini CLI · OpenAI Codex (GPT-5.4)*
