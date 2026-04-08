## Agent Gemini — Volet 1 : Palette & Tokens dark-first

### Propositions

**P1 — Obsidian Deep Navy (Le Standard Premium)**
Base sur un bleu-nuit désaturé (Slate-950) pour une profondeur infinie. Utilise des accents "Cyan-Blue" pour l'action. Très reposant pour les yeux sur de longues sessions de BI.
*Surface 0: #0a0f18 | Action: #3b82f6 | Text: #f8fafc*
Effort : S | Priorité : Critical

**P2 — Industrial Graphite (L'ADN Quincaillerie)**
Nuances de gris neutres et froids, rappelant l'acier et le béton. Très pro, minimaliste, laisse toute la place aux couleurs de la DataViz.
*Surface 0: #121212 | Action: #ffffff | Text: #e2e8f0*
Effort : S | Priorité : High

**P3 — Midnight Emerald (L'Angle Croissance)**
Teinte de base légèrement verte/canard très sombre. Évoque la rentabilité et le "BI moderne".
*Surface 0: #061010 | Action: #10b981 | Text: #ecfdf5*
Effort : M | Priorité : Medium

**P4 — High-Contrast Cobalt (L'Accessibilité Max)**
Noir pur pour les surfaces de fond, avec des bordures très marquées en Cobalt.
*Surface 0: #000000 | Action: #6366f1 | Text: #ffffff*
Effort : S | Priorité : High

### Verdict
**Gagnante : P1 — Obsidian Deep Navy**

```css
[data-theme="dark"] {
  --p-bg-0: #0a0f18; --p-bg-1: #111827; --p-bg-2: #1f2937; --p-bg-3: #374151;
  --p-border-low: #1e293b; --p-border-mod: #334155; --p-border-high: #475569;
  --c-action: #60a5fa; --c-danger: #f87171; --c-caution: #fbbf24; --c-ok: #34d399; --c-muted: #94a3b8;
  --p-tab-1: #fb7185; --p-tab-2: #fb923c; --p-tab-3: #facc15; --p-tab-4: #4ade80;
  --p-tab-5: #38bdf8; --p-tab-6: #818cf8; --p-tab-7: #c084fc;
  --t-primary: #f8fafc; --t-secondary: #cbd5e1; --t-tertiary: #64748b;
}
```

### Synergies
- V2 Typo : profondeur #0a0f18 permet polices plus fines sans perte de lisibilité
- V3 Composants : supprimer box-shadow, élévation par border seule
- V4 DataViz : spectre 7 couleurs désaturées 15% pour éviter effet néon
