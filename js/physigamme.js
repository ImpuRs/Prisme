// © 2026 Jawad El Barkaoui — Tous droits réservés
// PRISME — Physigamme PDV
// Décisions de gamme : standard réseau, socle régional, spécialiste local.
// ═══════════════════════════════════════════════════════════════
'use strict';

export const PHYSIGAMME_COPY = {
  title: 'Physigamme PDV',
  subtitle: 'Décider le socle magasin à partir des ventes réelles',
  description: 'Transversalité métiers + validation réseau : ce qui doit être standard, régional ou purement spécialiste.',
  perimeters: {
    agence: '🏢 PDV omnicanal (consommé mon agence)',
    reseau: '🏪 Réseau (toutes agences du consommé)',
    territoire: '🌍 Territoire (fichier Qlik, tous clients)'
  }
};

export function getPhysigammeDecision(article, verdictData) {
  const hasStock = !!verdictData?.stock;
  const verdict = verdictData?.classif || '';
  let label = 'Spécialiste local';
  let color = '#ef4444';
  let detail = '< 30% métiers';
  let rank = 3;

  if (article.indice >= 60) {
    label = hasStock ? 'Socle PDV' : 'À implanter';
    color = hasStock ? '#22c55e' : '#38bdf8';
    detail = 'standard réseau';
    rank = hasStock ? 0 : 1;
  } else if (article.indice >= 30) {
    label = 'Socle régional';
    color = '#f59e0b';
    detail = 'selon bassin';
    rank = 2;
  }

  if (verdict === 'implanter' && article.indice >= 30) {
    label = 'Manquant prioritaire';
    color = '#ef4444';
    detail = 'stock absent';
    rank = 0;
  } else if (verdict === 'surveiller') {
    label = 'À surveiller';
    color = '#a855f7';
    detail = 'signal stock';
  }

  return { label, color, detail, rank };
}

export function renderPhysigammeDecisionBadge(article, verdictData) {
  const d = getPhysigammeDecision(article, verdictData);
  return `<span class="inline-flex flex-col items-center leading-tight text-[9px] px-1.5 py-0.5 rounded font-bold" style="background:${d.color}20;color:${d.color}">
    <span>${d.label}</span>
    <span class="text-[8px] opacity-70 font-semibold">${d.detail}</span>
  </span>`;
}
