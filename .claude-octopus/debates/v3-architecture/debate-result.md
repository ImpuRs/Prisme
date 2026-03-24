# Debate: Pilot PRO V3 — Single HTML File vs Modular JS
Date: 2026-03-24
Participants: Gemini (single-file), Claude (single-file), Codex/gpt-5.4 (modular), Sonnet (modular)
Verdict: Modular JS wins 3–1

## Key Decision
Adopt native ES modules with `<script type="module" src="js/main.js">` entry point.
No build step required. GitHub Pages serves ES modules natively.
Existing js/ structure (7 files, 2042 lines) maps directly onto this pattern.

## Recommended Structure
- index.html: markup only (~200 lines)
- js/main.js: entry point
- js/constants.js, state.js, cache.js, parser.js, engine.js, ui.js, utils.js: existing modules
- js/router.js: NEW — tab/view management

## Why Modular Won
1. Project already voted — js/ folder exists and has 2042 lines
2. Native ESM = no build step (eliminates single-file camp's core objection)
3. Cache granularity: stable modules stay cached, only changed files invalidate
4. 5513→7500+ line HTML is project-ending risk
5. Testability on parser/engine (most failure-prone paths)
