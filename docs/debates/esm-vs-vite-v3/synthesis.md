# DEBATE SYNTHESIS — ESM natif vs Vite pour PILOT PRO V3
## Date : 2026-03-24 | Participants : Gemini 2.5-flash, Codex gpt-5.4, Sonnet 4.6, Claude/Opus 4.6

---

## SCORECARD PAR ARGUMENT

| Argument | Camp | Réfutation adverse | Score |
|---|---|---|---|
| HMR = DX dev quotidien | Vite | Cycle GAS invalide HMR local (Codex) | ⚖️ Partage |
| Tree-shaking Rollup réel | Vite | Imports granulaires ESM suffisent si 7 modules | 🟠 ESM léger avantage |
| vite-plugin-singlefile | Vite | "Confirme le problème" — rétrofit artificiel (Codex) | ⚖️ Partage |
| Tailwind JIT | Vite | PostCSS CLI indépendant de Vite (tous ESM) | 🟠 ESM gagne |
| Script maison trivial | ESM | "Qui le maintient ? Dépendances circulaires ?" (Opus) | 🔵 Vite léger avantage |
| GAS cycle = déploiement | ESM | ✅ Non réfuté efficacement par le camp Vite | 🟠 ESM gagne |
| Modernisation V3→V4 | Vite | ✅ Non adressé par le camp ESM | 🔵 Vite gagne |
| Tests (Vitest) | Vite | ✅ Manque réel confirmé par CLAUDE.md | 🔵 Vite gagne |
| file:// compatibility | ESM | ESM natif a aussi des limitations en file:// | ⚖️ Partage |

---

## MEILLEURS ARGUMENTS DU DÉBAT

### 🏆 Top 3 arguments (tous camps confondus)

**#1 — CODEX (ESM) :** *"Le point critique n'est pas le hot reload local, mais le cycle réel de validation dans GAS : déploiement, sandbox iframe, quotas, auth Google. Dans ce contexte, gagner 300ms sur un reload local ne compense pas la complexité ajoutée par Vite."*
→ **Percutant car ancré dans la réalité opérationnelle du projet**

**#2 — CODEX (ESM) :** *"vite-plugin-singlefile confirme même le problème : il faut réintroduire artificiellement une sortie compatible avec la contrainte d'hébergement."*
→ **Retourne l'argument adverse en preuve à charge**

**#3 — CLAUDE/OPUS (Vite) :** *"Pilot PRO a zéro test automatisé (CLAUDE.md). Vitest — natif à Vite — résout ça au passage. V3 sans tests reste une dette technique critique."*
→ **Adresse une lacune réelle non défendue par le camp ESM**

---

## ERREURS FACTUELLES

| Participant | Erreur |
|---|---|
| Sonnet (Vite, R2) | "50+ modules génèrent 80-120 requêtes" — Pilot PRO a 7 modules |
| Sonnet (Vite, R2) | "TypeScript à transpiler, JSX à compiler" — Pilot PRO = vanilla JS, 0 TS, 0 JSX |

---

## VERDICT

### ⚖️ RÉSULTAT : MATCH NUL CONDITIONNEL

**Le camp ESM natif gagne le débat contextuel** (pour PILOT PRO V3 tel qu'il est aujourd'hui) :
- 7 modules seulement — pas de tree-shaking massif à faire
- Cycle GAS invalide l'argument HMR comme levier DX principal
- Tailwind CLI fonctionne sans Vite
- vite-plugin-singlefile est un retrofit, pas une solution native

**Le camp Vite gagne le débat stratégique** (pour la modernisation V3→V4) :
- Tests automatisés = dette critique non adressée
- Build reproductible pour livraisons GAS
- Vélocité quotidienne sur 6-12 mois de développement actif
- Absorption de la croissance sans migration future

---

## RECOMMANDATION ACTIONNABLE

### Pour PILOT PRO V3 — Migration en 2 phases

**Phase 1 (V3.0) — ESM natif pur, sans bundler**
```
index.html avec <script type="module">
import { engine } from './js/engine.js'
import { parser } from './js/parser.js'
...
```
→ Gain DX immédiat (imports explicites, 0 globals), coût zéro

**Phase 2 (V3.1+) — Pipeline minimal si tests souhaités**
```
npm create vite@latest pilot-pro-v3 -- --template vanilla
# + vite-plugin-singlefile pour GAS
# + Tailwind v4 (intégré Vite)
# + Vitest pour les règles métier critiques
```
→ Quand les tests deviennent prioritaires

**La vraie question à trancher :** V3 est-elle une migration de code (ESM natif suffit) ou le début d'une infrastructure de développement (Vite s'impose) ?
