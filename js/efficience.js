'use strict';

import { _S } from './state.js';
import { DataStore } from './store.js';
import { formatEuro, pct, escapeHtml } from './utils.js';

// ═══════════════════════════════════════════════════════════════
// Efficience de l'Offre — KPIs assortiment + gains potentiels
// Inspiré du programme LMFR "Focus Efficience"
// ═══════════════════════════════════════════════════════════════

const COUT_STOCKAGE_JOUR = 0.02; // €/unité/jour (2% mensuel = 24%/an)
const TAUX_MARGE_MOYEN = 0.35;   // fallback si pas de marge article
const OBJECTIF_DISPO = 0.96;     // 96% taux de présence cible

function _computeEfficience() {
  const fd = DataStore.finalData;
  if (!fd || !fd.length) return null;

  let nbEnStock = 0, nbVendus = 0, nbRupture = 0, nbSurstock = 0, nbDormant = 0;
  let valeurStock = 0, valeurSurstock = 0, valeurDormant = 0;
  let gainRuptureTotal = 0, gainSurstockTotal = 0;
  const detailRupture = [];
  const detailSurstock = [];
  const detailDormant = [];

  for (const r of fd) {
    if (r.isParent) continue;
    const pu = r.prixUnitaire || 0;
    const stock = r.stockActuel || 0;
    const min = r.nouveauMin || 0;
    const max = r.nouveauMax || 0;
    const ca = r.caAnnuel || 0;
    const w = r.W || 0;

    if (stock > 0) nbEnStock++;
    if (w > 0) nbVendus++;

    // Marge estimée par jour
    const margeJour = ca > 0 ? (ca * TAUX_MARGE_MOYEN / 365) : 0;

    // Rupture : stock = 0, MIN > 0 (devrait être en stock)
    if (stock <= 0 && min > 0) {
      nbRupture++;
      // Gain = marge quotidienne × jours estimés de rupture (on prend 30j par défaut)
      const joursRupture = 30;
      const gain = margeJour * joursRupture;
      gainRuptureTotal += gain;
      if (gain > 0) {
        detailRupture.push({ code: r.code, libelle: r.libelle, famille: r.famille,
          abc: r.abcClass, fmr: r.fmrClass, ca, pu, gain, margeJour });
      }
    }

    // Surstock : stock > MAX et MAX > 0
    if (stock > max && max > 0) {
      nbSurstock++;
      const exces = stock - max;
      const coutSurstock = exces * pu * COUT_STOCKAGE_JOUR * 30; // coût mensuel
      valeurSurstock += exces * pu;
      gainSurstockTotal += coutSurstock;
      detailSurstock.push({ code: r.code, libelle: r.libelle, famille: r.famille,
        abc: r.abcClass, fmr: r.fmrClass, stock, max, exces, pu, valExces: exces * pu, coutMois: coutSurstock });
    }

    // Dormant : en stock mais W = 0
    if (stock > 0 && w === 0) {
      nbDormant++;
      valeurDormant += stock * pu;
      detailDormant.push({ code: r.code, libelle: r.libelle, famille: r.famille,
        stock, pu, valeur: stock * pu, ageJours: r.ageJours || 0 });
    }

    if (stock > 0) valeurStock += stock * pu;
  }

  // TGV : refs vendues / refs en stock
  const tgv = nbEnStock > 0 ? (nbVendus / nbEnStock * 100) : 0;
  // Taux de dispo : 1 - (ruptures / (en stock + ruptures))
  const tauxDispo = (nbEnStock + nbRupture) > 0 ? (nbEnStock / (nbEnStock + nbRupture) * 100) : 100;

  // Tri par gain décroissant
  detailRupture.sort((a, b) => b.gain - a.gain);
  detailSurstock.sort((a, b) => b.coutMois - a.coutMois);
  detailDormant.sort((a, b) => b.valeur - a.valeur);

  return {
    nbEnStock, nbVendus, nbRupture, nbSurstock, nbDormant,
    valeurStock, valeurSurstock, valeurDormant,
    tgv, tauxDispo,
    gainRuptureTotal, gainSurstockTotal,
    gainTotal: gainRuptureTotal + gainSurstockTotal,
    detailRupture: detailRupture.slice(0, 50),
    detailSurstock: detailSurstock.slice(0, 50),
    detailDormant: detailDormant.slice(0, 50),
  };
}

function _kpiCard(label, value, sub, color) {
  return `<div class="s-card p-4 rounded-xl text-center flex-1 min-w-[160px]">
    <div class="text-[11px] t-secondary uppercase tracking-wide mb-1">${label}</div>
    <div class="text-2xl font-bold" style="color:${color}">${value}</div>
    ${sub ? `<div class="text-[11px] t-disabled mt-1">${sub}</div>` : ''}
  </div>`;
}

function _gainCard(label, value, detail, icon, color) {
  return `<div class="s-card p-4 rounded-xl flex-1 min-w-[200px]">
    <div class="flex items-center gap-2 mb-2">
      <span class="text-xl">${icon}</span>
      <span class="text-[11px] t-secondary uppercase tracking-wide">${label}</span>
    </div>
    <div class="text-2xl font-bold" style="color:${color}">${value}</div>
    <div class="text-[11px] t-disabled mt-1">${detail}</div>
  </div>`;
}

function _buildTable(rows, columns, id) {
  if (!rows.length) return `<div class="text-[11px] t-disabled text-center py-4">Aucun article</div>`;
  const hdr = columns.map(c => `<th class="px-2 py-1.5 text-left text-[10px] t-secondary uppercase">${c.label}</th>`).join('');
  const body = rows.map(r => {
    const cells = columns.map(c => `<td class="px-2 py-1.5 text-[11px] ${c.align || ''}" style="${c.style?.(r) || ''}">${c.render(r)}</td>`).join('');
    return `<tr class="border-b b-light hover:s-hover">${cells}</tr>`;
  }).join('');
  return `<div class="overflow-x-auto"><table id="${id}" class="w-full"><thead><tr class="border-b b-light">${hdr}</tr></thead><tbody>${body}</tbody></table></div>`;
}

export function renderEfficienceTab() {
  const tab = document.getElementById('tabEfficience');
  if (!tab) return;

  const data = _computeEfficience();
  if (!data) {
    tab.innerHTML = `<div class="container mx-auto p-6 text-center t-secondary">Chargez un consommé et un stock pour voir l'efficience.</div>`;
    return;
  }

  const { nbEnStock, nbVendus, nbRupture, nbSurstock, nbDormant,
    valeurStock, valeurSurstock, valeurDormant,
    tgv, tauxDispo, gainRuptureTotal, gainSurstockTotal, gainTotal,
    detailRupture, detailSurstock, detailDormant } = data;

  // Couleurs
  const tgvColor = tgv >= 85 ? '#22c55e' : tgv >= 70 ? '#f59e0b' : '#ef4444';
  const dispoColor = tauxDispo >= 96 ? '#22c55e' : tauxDispo >= 90 ? '#f59e0b' : '#ef4444';

  const html = `<div class="container mx-auto p-4 md:p-5 space-y-6">
    <!-- En-tête -->
    <div class="flex items-center gap-3 mb-2">
      <span class="text-2xl">📐</span>
      <div>
        <h2 class="text-lg font-bold t-primary">Efficience de l'Offre</h2>
        <p class="text-[11px] t-secondary">Qualité de l'assortiment et gains potentiels</p>
      </div>
    </div>

    <!-- KPIs assortiment -->
    <div class="flex flex-wrap gap-3">
      ${_kpiCard('TGV', pct(tgv), `${nbVendus} vendues / ${nbEnStock} en stock`, tgvColor)}
      ${_kpiCard('Taux de dispo', pct(tauxDispo), `Objectif : ${pct(OBJECTIF_DISPO * 100)}`, dispoColor)}
      ${_kpiCard('Refs en stock', nbEnStock.toLocaleString('fr-FR'), `dont ${nbDormant} dormantes`, '#60a5fa')}
      ${_kpiCard('Valeur stock', formatEuro(valeurStock), '', '#94a3b8')}
    </div>

    <!-- Gains potentiels -->
    <div>
      <h3 class="text-sm font-semibold t-primary mb-3">Gains potentiels mensuels</h3>
      <div class="flex flex-wrap gap-3">
        ${_gainCard('Gain Rupture', formatEuro(gainRuptureTotal),
          `${nbRupture} articles en rupture — marge perdue estimée`,
          '🔴', '#ef4444')}
        ${_gainCard('Gain Surstock', formatEuro(gainSurstockTotal),
          `${nbSurstock} articles surstockés — ${formatEuro(valeurSurstock)} immobilisés`,
          '📦', '#f59e0b')}
        ${_gainCard('Gain Dormants', formatEuro(valeurDormant),
          `${nbDormant} refs sans vente — capital immobilisé`,
          '💤', '#8b5cf6')}
        ${_gainCard('Gain Total', formatEuro(gainTotal),
          'Rupture + Surstock (hors dormants)',
          '💰', '#22c55e')}
      </div>
    </div>

    <!-- Tableaux détaillés -->
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <!-- Top Ruptures -->
      <div class="s-card p-4 rounded-xl">
        <h4 class="text-[12px] font-semibold t-primary mb-2 flex items-center gap-2">
          <span class="text-red-400">🔴</span> Top articles en rupture
          <span class="text-[10px] t-disabled font-normal">(par marge perdue)</span>
        </h4>
        ${_buildTable(detailRupture, [
          { label: 'Code', render: r => `<span class="font-mono">${r.code}</span>` },
          { label: 'Libellé', render: r => `<span class="max-w-[180px] truncate inline-block" title="${escapeHtml(r.libelle)}">${escapeHtml(r.libelle)}</span>` },
          { label: 'ABC', render: r => r.abc || '-', align: 'text-center' },
          { label: 'CA annuel', render: r => formatEuro(r.ca), align: 'text-right' },
          { label: 'Gain/mois', render: r => `<span class="text-red-400 font-semibold">${formatEuro(r.gain)}</span>`, align: 'text-right' },
        ], 'effRuptureTable')}
      </div>

      <!-- Top Surstock -->
      <div class="s-card p-4 rounded-xl">
        <h4 class="text-[12px] font-semibold t-primary mb-2 flex items-center gap-2">
          <span class="text-amber-400">📦</span> Top articles surstockés
          <span class="text-[10px] t-disabled font-normal">(par coût de stockage)</span>
        </h4>
        ${_buildTable(detailSurstock, [
          { label: 'Code', render: r => `<span class="font-mono">${r.code}</span>` },
          { label: 'Libellé', render: r => `<span class="max-w-[180px] truncate inline-block" title="${escapeHtml(r.libelle)}">${escapeHtml(r.libelle)}</span>` },
          { label: 'Stock', render: r => r.stock, align: 'text-center' },
          { label: 'MAX', render: r => r.max, align: 'text-center' },
          { label: 'Excès', render: r => `<span class="text-amber-400">+${r.exces}</span>`, align: 'text-center' },
          { label: 'Coût/mois', render: r => `<span class="text-amber-400 font-semibold">${formatEuro(r.coutMois)}</span>`, align: 'text-right' },
        ], 'effSurstockTable')}
      </div>
    </div>

    <!-- Top Dormants -->
    <div class="s-card p-4 rounded-xl">
      <h4 class="text-[12px] font-semibold t-primary mb-2 flex items-center gap-2">
        <span class="text-purple-400">💤</span> Top articles dormants
        <span class="text-[10px] t-disabled font-normal">(en stock mais jamais vendus — par valeur immobilisée)</span>
      </h4>
      ${_buildTable(detailDormant, [
        { label: 'Code', render: r => `<span class="font-mono">${r.code}</span>` },
        { label: 'Libellé', render: r => `<span class="max-w-[250px] truncate inline-block" title="${escapeHtml(r.libelle)}">${escapeHtml(r.libelle)}</span>` },
        { label: 'Famille', render: r => r.famille || '-' },
        { label: 'Stock', render: r => r.stock, align: 'text-center' },
        { label: 'PU', render: r => formatEuro(r.pu), align: 'text-right' },
        { label: 'Valeur', render: r => `<span class="text-purple-400 font-semibold">${formatEuro(r.valeur)}</span>`, align: 'text-right' },
        { label: 'Âge (j)', render: r => r.ageJours > 0 ? r.ageJours : '-', align: 'text-center' },
      ], 'effDormantTable')}
    </div>
  </div>`;

  tab.innerHTML = html;
}
