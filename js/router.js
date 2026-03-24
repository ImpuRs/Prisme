// ═══════════════════════════════════════════════════════════════
// PRISME — router.js
// Gestion de la navigation entre onglets
// Dépend de : ui.js
// ═══════════════════════════════════════════════════════════════
'use strict';

import { switchTab } from './ui.js';

// Lier les boutons d'onglets aux événements de navigation
export function initRouter() {
  document.querySelectorAll('[data-tab]').forEach(btn => {
    // Les boutons tab ont déjà des onclick="switchTab(...)" dans le HTML (Phase 1).
    // initRouter() est un point d'extension pour la Phase 2 (deep linking, hashchange).
    // Pour l'instant, on s'assure que switchTab est accessible via window.
    if (!btn.hasAttribute('onclick')) {
      btn.addEventListener('click', () => switchTab(btn.dataset.tab));
    }
  });
}
