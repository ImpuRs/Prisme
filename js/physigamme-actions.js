// © 2026 Jawad El Barkaoui — Tous droits réservés
// PRISME — Physigamme actions
// Détail manquants, exports ordre d'implantation, kit de démarrage.
// ═══════════════════════════════════════════════════════════════
'use strict';

import { formatEuro } from './utils.js';

function _median(values) {
  if (!values.length) return 0;
  const sorted = values.slice().sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] || 0;
}

function _missingRowsForStore({ store, stores, storeSnapshots, troncArts, famLabel, libelleLookup, articleFamille }) {
  const sd = storeSnapshots.get(store) || {};
  const missing = troncArts
    .map(a => a.code)
    .filter(code => !sd[code] || ((sd[code].sumCA || 0) <= 0 && (sd[code].sumPrelevee || 0) <= 0));

  const groups = new Map();
  for (const code of missing) {
    const lib = libelleLookup?.[code] || code;
    const fam = famLabel(articleFamille?.[code] || '') || 'Autres';
    const cas = stores.map(s => storeSnapshots.get(s)?.[code]?.sumCA || 0).filter(v => v > 0);
    const medianCA = _median(cas);
    if (!groups.has(fam)) groups.set(fam, []);
    groups.get(fam).push({ code, lib, nbStores: cas.length, medianCA });
  }
  for (const arts of groups.values()) arts.sort((a, b) => b.medianCA - a.medianCA);
  const sortedGroups = [...groups.entries()].sort((a, b) => (
    b[1].reduce((s, r) => s + r.medianCA, 0) - a[1].reduce((s, r) => s + r.medianCA, 0)
  ));
  return { missing, sortedGroups };
}

export function renderMissingPanel({ store, stores, storeSnapshots, troncArts, famLabel, libelleLookup, articleFamille }) {
  const { missing, sortedGroups } = _missingRowsForStore({ store, stores, storeSnapshots, troncArts, famLabel, libelleLookup, articleFamille });
  if (!missing.length) {
    return `<div class="rounded-lg p-3 text-[11px]" style="background:var(--bg-card);border-left:3px solid #22c55e"><strong class="text-green-400">${store}</strong> — ✅ 100% conforme</div>`;
  }

  let tableRows = '';
  for (const [fam, arts] of sortedGroups) {
    tableRows += `<tr><td colspan="4" class="px-2 pt-3 pb-1"><span class="text-[10px] font-black" style="color:#8B5CF6">📁 ${fam.toUpperCase()}</span> <span class="text-[9px] t-disabled">(${arts.length})</span></td></tr>`;
    for (const r of arts) {
      tableRows += `<tr class="text-[10px]"><td class="px-2 py-1 font-mono t-disabled pl-5">${r.code}<span class="ml-1 cursor-pointer opacity-50 hover:opacity-100" onclick="event.stopPropagation();if(window.openArticlePanel)window.openArticlePanel('${r.code}','conformite')" title="Voir détail article">🔍</span></td><td class="px-2 py-1 t-primary">${r.lib}</td><td class="px-2 py-1 text-right t-disabled">${r.nbStores} ag.</td><td class="px-2 py-1 text-right font-bold" style="color:#f59e0b">${formatEuro(r.medianCA)}</td></tr>`;
    }
  }

  return `<div class="rounded-lg p-3 space-y-2" style="background:var(--bg-card);border-left:3px solid #ef4444">
    <div class="flex items-center justify-between">
      <span class="text-[11px]"><strong class="text-red-400">${store}</strong> — <strong>${missing.length}</strong> articles manquants dans <strong>${sortedGroups.length}</strong> familles</span>
      <div class="flex items-center gap-2">
        <button onclick="window._troncConfExport('${store}')" class="text-[9px] px-2 py-0.5 rounded cursor-pointer" style="background:#8B5CF6;color:white">📥 Ordre d'implantation</button>
        <button onclick="document.getElementById('troncConfMissingPanel').innerHTML=''" class="text-[11px] t-disabled hover:text-white cursor-pointer font-bold px-1" title="Fermer">✕</button>
      </div>
    </div>
    <table class="w-full"><thead><tr class="text-[8px] t-disabled uppercase">
      <th class="px-2 py-1 text-left">Code</th><th class="px-2 py-1 text-left">Article</th><th class="px-2 py-1 text-right">Présent dans</th><th class="px-2 py-1 text-right">CA médian</th>
    </tr></thead><tbody>${tableRows}</tbody></table>
  </div>`;
}

export function exportMissingOrder({ store, stores, storeSnapshots, troncArts, famLabel, libelleLookup, articleFamille }) {
  const { sortedGroups } = _missingRowsForStore({ store, stores, storeSnapshots, troncArts, famLabel, libelleLookup, articleFamille });
  let csv = 'Famille;Code;Article;Agences présentes;CA médian réseau\n';
  for (const [fam, arts] of sortedGroups) {
    for (const r of arts) csv += `${fam};${r.code};${String(r.lib || '').replace(/;/g, ',')};${r.nbStores};${Math.round(r.medianCA)}\n`;
  }
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `PRISME_Ordre_Implantation_${store}.csv`;
  a.click();
}

export function exportStartupKit({ store, stores, storeSnapshots, troncArts, finalData }) {
  const fdMap = new Map();
  for (const r of (finalData || [])) fdMap.set(r.code, r);

  let csv = 'Famille;Code;Article;MIN (Vitesse);MAX (Vitesse);Prix Unitaire;Valeur Stock MIN;Agences présentes;CA médian réseau;Source\n';
  const groups = new Map();

  for (const a of troncArts) {
    const r = fdMap.get(a.code);
    const pu = r?.prixUnitaire || 0;
    let t1ca = 0, t1bl = 0, t2ca = 0, t2bl = 0, t3ca = 0, t3bl = 0, any = false;
    for (const s of stores) {
      const v = storeSnapshots.get(s)?.[a.code];
      if (!v || v.countBL <= 0) continue;
      const ca = v.sumCA || 0;
      const bl = v.countBL;
      any = true;
      if (ca > t1ca) { t3ca = t2ca; t3bl = t2bl; t2ca = t1ca; t2bl = t1bl; t1ca = ca; t1bl = bl; }
      else if (ca > t2ca) { t3ca = t2ca; t3bl = t2bl; t2ca = ca; t2bl = bl; }
      else if (ca > t3ca) { t3ca = ca; t3bl = bl; }
    }

    let minQty = 0, maxQty = 0, source = '';
    if (any && pu > 0 && (t1bl + t2bl + t3bl) > 0) {
      let vit = ((t1ca + t2ca + t3ca) / pu) / (t1bl + t2bl + t3bl);
      const capMed = r?.medMinReseau > 0 ? r.medMinReseau * 2 : 20;
      vit = Math.min(vit, capMed);
      minQty = Math.max(Math.ceil(vit), 1);
      maxQty = Math.max(Math.ceil(vit * 2), minQty + 1);
      source = 'Vitesse Réseau';
    } else if (r?.medMinReseau > 0 || r?.medMaxReseau > 0) {
      minQty = Math.max(Math.round(r.medMinReseau || 0), 1);
      maxQty = Math.max(Math.round(r.medMaxReseau || 0), minQty + 1);
      source = 'Médiane ERP';
    } else {
      minQty = 1;
      maxQty = 2;
      source = 'Défaut';
    }

    const cas = stores.map(s => storeSnapshots.get(s)?.[a.code]?.sumCA || 0).filter(v => v > 0);
    const median = _median(cas);
    const valStock = minQty * pu;
    const fam = a.famLib || a.famille || '';
    if (!groups.has(fam)) groups.set(fam, []);
    groups.get(fam).push({ code: a.code, lib: String(a.libelle || '').replace(/;/g, ','), minQty, maxQty, pu, valStock, nbStores: cas.length, median, source });
  }

  for (const arts of groups.values()) arts.sort((a, b) => b.median - a.median);
  const sortedGroups = [...groups.entries()].sort((a, b) => (
    b[1].reduce((s, r) => s + r.valStock, 0) - a[1].reduce((s, r) => s + r.valStock, 0)
  ));

  let totalVal = 0, totalRefs = 0;
  for (const [fam, arts] of sortedGroups) {
    for (const r of arts) {
      csv += `${fam};${r.code};${r.lib};${r.minQty};${r.maxQty};${r.pu.toFixed(2)};${Math.round(r.valStock)};${r.nbStores};${Math.round(r.median)};${r.source}\n`;
      totalVal += r.valStock;
      totalRefs++;
    }
  }
  csv += `\nTOTAL;${totalRefs} références;;;;"${Math.round(totalVal)} € BFR estimé";;;;\n`;

  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `PRISME_Kit_Demarrage_${store}.csv`;
  a.click();

  return { totalRefs, totalVal };
}
