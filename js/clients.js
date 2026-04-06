'use strict';

import { _S } from './state.js';
import { renderOppNetteTable } from './helpers.js';

// RÈGLE PRISME — render autonome :
// Ces fonctions écrivent dans leurs slots respectifs (injectés par _cmSwitchTab).
// Elles ne retournent pas de HTML — elles peuplent directement le DOM.

// ── Sous-vue Silencieux (30-60j sans commande PDV) ───────────────────────
function renderSilencieux() {
  window._buildCockpitClient?.();
}

// ── Sous-vue Perdus (>60j sans commande PDV) ─────────────────────────────
function renderPerdus() {
  window._buildCockpitClient?.();
}

// ── Sous-vue Potentiels (jamais venus + segments omnicanaux) ─────────────
function renderPotentiels() {
  window._buildCockpitClient?.();
  window._renderSegmentsOmnicanaux?.();
}

// ── Sous-vue Opportunités nettes ─────────────────────────────────────────
function renderOpportunites() {
  const el = document.getElementById('terrOpportunites');
  if (el) el.innerHTML = renderOppNetteTable();
}

window.renderSilencieux   = renderSilencieux;
window.renderPerdus       = renderPerdus;
window.renderPotentiels   = renderPotentiels;
window.renderOpportunites = renderOpportunites;
