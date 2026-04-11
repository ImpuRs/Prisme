// © 2026 Jawad El Barkaoui — Tous droits réservés
// PRISME — labo.js
// Onglet Labo : espace réservé pour prototypes futurs
// ═══════════════════════════════════════════════════════════════
'use strict';

export function renderLaboTab() {
  const el = document.getElementById('tabLabo');
  if (!el) return;
  el.innerHTML = `
    <div class="flex flex-col items-center justify-center py-20 t-disabled">
      <span style="font-size:3rem;margin-bottom:12px">🧪</span>
      <span class="text-[14px] font-semibold mb-1">Le Labo</span>
      <span class="text-[11px]">Espace d'expérimentation — bientôt de nouveaux outils ici.</span>
    </div>`;
}

export function updateLaboTiles() {
  // no-op — placeholder for future use
}
