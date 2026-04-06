'use strict';

import { _S } from './state.js';
import { renderOppNetteTable } from './helpers.js';

// ── Sous-vue Silencieux (30-60j sans commande PDV) ───────────────────────
function renderSilencieux() {
  const el = document.getElementById('terrSilencieux');
  if (el && el.innerHTML.trim()) return `<div>${el.innerHTML}</div>`;
  const clients = _S._cockpitExportData?.silencieux || [];
  if (!clients.length) return `<div class="p-6 text-center t-disabled text-sm">Aucun client silencieux (30-60j) détecté.</div>`;
  return `<div>${document.getElementById('terrSilencieux')?.innerHTML || ''}</div>`;
}

// ── Sous-vue Perdus (>60j sans commande PDV) ─────────────────────────────
function renderPerdus() {
  const el = document.getElementById('terrPerdus');
  if (el && el.innerHTML.trim()) return `<div>${el.innerHTML}</div>`;
  const clients = _S._cockpitExportData?.perdus || [];
  if (!clients.length) return `<div class="p-6 text-center t-disabled text-sm">Aucun client perdu (&gt;60j) détecté.</div>`;
  return `<div>${document.getElementById('terrPerdus')?.innerHTML || ''}</div>`;
}

// ── Sous-vue Potentiels (jamais venus + segments omnicanaux) ─────────────
function renderPotentiels() {
  const capEl = document.getElementById('terrACapter');
  const capHtml = capEl?.innerHTML?.trim() || '';
  const segEl = document.getElementById('terrSegmentsOmni');
  const segHtml = segEl?.innerHTML?.trim() || '';
  let html = '';
  if (capHtml) html += `<div class="mb-4">${capHtml}</div>`;
  if (segHtml) html += `<div class="mb-4">${segHtml}</div>`;
  if (!html) html = `<div class="p-6 text-center t-disabled text-sm">Chargez la zone de chalandise pour voir les potentiels.</div>`;
  return html;
}

// ── Sous-vue Opportunités nettes ─────────────────────────────────────────
function renderOpportunites() {
  return renderOppNetteTable();
}

window.renderSilencieux   = renderSilencieux;
window.renderPerdus       = renderPerdus;
window.renderPotentiels   = renderPotentiels;
window.renderOpportunites = renderOpportunites;
