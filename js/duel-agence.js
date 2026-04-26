// ═══════════════════════════════════════════════════════════════
// PRISME — duel-agence.js
// Duel Agence : comparaison 1v1 entre mon agence et une agence cible
// Axes : KPIs globaux, familles, univers/métier, canaux
// ═══════════════════════════════════════════════════════════════
'use strict';

import { _S } from './state.js';
import { formatEuro, famLib, escapeHtml } from './utils.js';
import { FAM_LETTER_UNIVERS } from './constants.js';
import { buildAgenceStore, getAgenceStoreKey } from './agence-store.js';
import { getCaClientParStoreMap } from './sales.js';

// ── État local ──
let _duelTarget = '';
let _duelSort = 'ecart';
let _duelSortDir = 'desc';
let _duelUniversFilter = '';
let _duelOpenFam = '';
let _duelDrillSort = 'tgtCA';
let _duelDrillDir = 'desc';
let _duelDrillTab = 'manquant';
let _duelShowAllMetiers = false;
let _duelOpenMetier = '';
let _duelMetierTab = 'partages'; // partages | conquete | fideles
// _duelClientsTab supprimé — Opportunités clients déplacées vers poches Conquête Terrain
let _duelAuditOpen = false;

// Cache local (évite de re-parcourir 40k clients à chaque re-render sur un simple toggle UI)

// Cache duel (évite de recalculer toute l'agrégation sur de simples toggles UI)
let _duelCacheKey = '';
let _duelCache = null;

// Index finalData (stock selected store) — évite de reconstruire un gros lookup à chaque drill-down
let _duelFDIndexSrc = null; // Array reference
let _duelFDIndex = null;    // Object {code → row}
function _getFinalDataIndex() {
  const src = _S.finalData || [];
  if (_duelFDIndex && _duelFDIndexSrc === src) return _duelFDIndex;
  const out = {};
  for (const r of src) { if (r && r.code) out[r.code] = r; }
  _duelFDIndexSrc = src;
  _duelFDIndex = out;
  return out;
}

function _periodMonthIdxBounds() {
  const pStart = _S.periodFilterStart;
  const pEnd = _S.periodFilterEnd;
  const startIdx = pStart ? (pStart.getFullYear() * 12 + pStart.getMonth()) : 0;
  const endIdx = pEnd ? (pEnd.getFullYear() * 12 + pEnd.getMonth()) : 999999;
  return { startIdx, endIdx, hasPeriod: !!(pStart || pEnd) };
}

function _periodLabel() {
  const pStart = _S.periodFilterStart;
  const pEnd = _S.periodFilterEnd;
  if (!pStart && !pEnd) return 'Toute la période';
  const fmt = d => d ? d.toLocaleDateString('fr-FR', { month: 'short', year: 'numeric' }) : 'début';
  if (pStart && pEnd && pStart.getFullYear() === pEnd.getFullYear() && pStart.getMonth() === pEnd.getMonth()) return fmt(pStart);
  return `${fmt(pStart)} → ${fmt(pEnd)}`;
}

function _isSixDigit(code) {
  return typeof code === 'string' ? /^\d{6}$/.test(code) : false;
}

function _hasAmount(v) {
  return Number.isFinite(+v) && Math.abs(+v) >= 0.5;
}

function _ensureDuelAgenceStore() {
  const opts = { canaux: new Set(), magasinMode: 'all', univers: '', stores: _S.storesIntersection };
  const key = getAgenceStoreKey(opts);
  if (!_S.agenceStore?.size || _S._agenceStoreKey !== key) buildAgenceStore(opts);
}

function _buildDataHealthNotice(myStore, tgtStore) {
  const hasPeriod = !!(_S.periodFilterStart || _S.periodFilterEnd);
  const notes = [];
  if (hasPeriod && !_S._byMonthStoreArtCanal) notes.push('agrégats mensuels agence absents : KPI/familles en fallback pleine période');
  if (hasPeriod && (!_S._byMonthStoreClientCA?.[myStore] || !_S._byMonthStoreClientCA?.[tgtStore])) notes.push('CA client mensuel incomplet : diagnostic métier moins précis');
  if (!_S.chalandiseData?.size) notes.push('zone chalandise absente : diagnostic métiers désactivé');
  if (!notes.length) return '';
  return `<div class="mb-4 rounded-lg border px-3 py-2 text-[11px] text-amber-300" style="background:rgba(245,158,11,.08);border-color:rgba(245,158,11,.35)">
    ${notes.map(escapeHtml).join(' · ')}
  </div>`;
}

function _getPeriodClientSetForStore(store) {
  const { startIdx, endIdx, hasPeriod } = _periodMonthIdxBounds();
  const bmsc = _S._byMonthStoreClients?.[store];
  if (bmsc) {
    const out = new Set();
    for (const midxStr in bmsc) {
      const midx = +midxStr;
      if (hasPeriod && (midx < startIdx || midx > endIdx)) continue;
      const s = bmsc[midxStr];
      if (s instanceof Set) { for (const cc of s) out.add(cc); }
      else if (Array.isArray(s)) { for (const cc of s) out.add(cc); }
    }
    return out;
  }
  const vcs = _S.ventesClientsPerStore?.[store];
  if (vcs instanceof Set) return new Set(vcs);
  if (Array.isArray(vcs)) return new Set(vcs);
  return new Set();
}

// ═══════════════════════════════════════════════════════════════
// computeDuel — calcule le comparatif entre deux agences
// ═══════════════════════════════════════════════════════════════
function _computeDuel(myStore, targetStore) {
  _ensureDuelAgenceStore();
  const myRec = _S.agenceStore.get(myStore);
  const tgtRec = _S.agenceStore.get(targetStore);
  if (!myRec || !tgtRec) return null;

  const artFam = _S.articleFamille || {};
  const spm = _S.stockParMagasin || {};

  // ── Agrégation par famille ──
  const famMap = {};

  function _addToFam(artMap, prefix) {
    for (const code in artMap) {
      if (!/^\d{6}$/.test(code)) continue;
      const d = artMap[code];
      const fam = artFam[code] || '';
      if (!fam) continue;
      if (!famMap[fam]) famMap[fam] = { myCA: 0, tgtCA: 0, myBL: 0, tgtBL: 0, myRefs: 0, tgtRefs: 0, myVMB: 0, tgtVMB: 0, myRefsStock: 0, tgtRefsStock: 0 };
      famMap[fam][prefix + 'CA'] += d.sumCA || 0;
      famMap[fam][prefix + 'BL'] += d.countBL || 0;
      famMap[fam][prefix + 'VMB'] += d.sumVMB || 0;
      famMap[fam][prefix + 'Refs']++;
    }
  }
  _addToFam(myRec.artMap, 'my');
  _addToFam(tgtRec.artMap, 'tgt');

  // Refs stockées — O(n) (évite O(familles × refs) sur les gros stocks)
  function _countStockByFam(storeCode) {
    const sd = spm[storeCode];
    if (!sd) return {};
    const out = {};
    for (const code in sd) {
      if (!_isSixDigit(code)) continue;
      const s = sd[code];
      if ((s.qteMin || 0) <= 0 && (s.qteMax || 0) <= 0) continue;
      const fam = artFam[code] || '';
      if (!fam) continue;
      out[fam] = (out[fam] || 0) + 1;
    }
    return out;
  }
  const myStockByFam = _countStockByFam(myStore);
  const tgtStockByFam = _countStockByFam(targetStore);
  for (const fam in famMap) {
    famMap[fam].myRefsStock = myStockByFam[fam] || 0;
    famMap[fam].tgtRefsStock = tgtStockByFam[fam] || 0;
  }

  // ── Familles en tableau ──
  const familles = [];
  for (const [fam, d] of Object.entries(famMap)) {
    if (!_hasAmount(d.myCA) && !_hasAmount(d.tgtCA) && !d.myBL && !d.tgtBL) continue;
    const letter = fam.charAt(0).toUpperCase();
    const univers = FAM_LETTER_UNIVERS[letter] || 'Autre';
    familles.push({
      fam, label: famLib(fam), univers,
      ecart: d.tgtCA - d.myCA,
      ecartPct: d.myCA > 0 ? Math.round((d.tgtCA - d.myCA) / d.myCA * 100) : (d.tgtCA > 0 ? 999 : 0),
      ...d
    });
  }

  // ── Agrégation par univers ──
  const universMap = {};
  for (const f of familles) {
    if (!universMap[f.univers]) universMap[f.univers] = { myCA: 0, tgtCA: 0, myBL: 0, tgtBL: 0, myRefs: 0, tgtRefs: 0, myRefsStock: 0, tgtRefsStock: 0 };
    const u = universMap[f.univers];
    u.myCA += f.myCA; u.tgtCA += f.tgtCA;
    u.myBL += f.myBL; u.tgtBL += f.tgtBL;
    u.myRefs += f.myRefs; u.tgtRefs += f.tgtRefs;
    u.myRefsStock += f.myRefsStock; u.tgtRefsStock += f.tgtRefsStock;
  }
  const univers = Object.entries(universMap).map(([nom, d]) => ({
    nom,
    ecart: d.tgtCA - d.myCA,
    myPct: myRec.ca > 0 ? d.myCA / myRec.ca * 100 : 0,
    tgtPct: tgtRec.ca > 0 ? d.tgtCA / tgtRec.ca * 100 : 0,
    ...d
  })).sort((a, b) => b.ecart - a.ecart);

  const metiers = _computeMetierMix(myStore, targetStore);

  return { my: myRec, tgt: tgtRec, familles, univers, metiers };
}

function _getCachedDuel(myStore, targetStore) {
  if (!myStore || !targetStore) return null;
  _ensureDuelAgenceStore();
  const { startIdx, endIdx } = _periodMonthIdxBounds();
  const stamp = [
    myStore,
    targetStore,
    startIdx,
    endIdx,
    _S.consommePeriodMaxFull ? _S.consommePeriodMaxFull.getTime() : 0,
    _S.finalData?.length || 0,
    _S.storeCountConsomme || (_S.storesIntersection?.size || 0),
    _S._agenceStoreKey || '',
  ].join('|');
  if (_duelCache && _duelCacheKey === stamp) return _duelCache;
  const duel = _computeDuel(myStore, targetStore);
  _duelCacheKey = stamp;
  _duelCache = duel;
  return duel;
}

// ── CA client par store — période-filtré si byMonthStoreClientCA disponible ──
function _buildPeriodCAMapForStore(store) {
  const pStart = _S.periodFilterStart;
  const pEnd = _S.periodFilterEnd;
  const bmscc = _S._byMonthStoreClientCA;
  if (!(pStart || pEnd) || !bmscc?.[store]) return getCaClientParStoreMap(store);
  const startIdx = pStart ? (pStart.getFullYear() * 12 + pStart.getMonth()) : 0;
  const endIdx = pEnd ? (pEnd.getFullYear() * 12 + pEnd.getMonth()) : 999999;
  const storeData = bmscc[store];
  const map = new Map();
  for (const midxStr in storeData) {
    const midx = +midxStr;
    if (midx < startIdx || midx > endIdx) continue;
    const monthData = storeData[midxStr];
    for (const cc in monthData) {
      map.set(cc, (map.get(cc) || 0) + monthData[cc]);
    }
  }
  return map;
}

// ── Mix Métier — croisement clients × chalandise ──
function _computeMetierMix(myStore, tgtStore) {
  const chal = _S.chalandiseData;
  if (!chal?.size) return [];

  const myClients = _getPeriodClientSetForStore(myStore);
  const tgtClients = _getPeriodClientSetForStore(tgtStore);

  const myCAMap = _buildPeriodCAMapForStore(myStore);
  const tgtCAMap = _buildPeriodCAMapForStore(tgtStore);

  const metierMap = {};

  for (const [cc, info] of chal) {
    let metier = info.metier || '';
    if (!metier || metier.length <= 2 || /^[-.\s]+$/.test(metier)) metier = 'Non renseigné';
    if (!metierMap[metier]) metierMap[metier] = { myClients: 0, tgtClients: 0, zoneTotal: 0, zoneNonCaptes: 0, myCA: 0, tgtCA: 0, tgtClientCCs: [] };
    metierMap[metier].zoneTotal++;
    if (myClients.has(cc)) {
      metierMap[metier].myClients++;
      if (myCAMap?.has(cc)) metierMap[metier].myCA += myCAMap.get(cc);
    } else {
      metierMap[metier].zoneNonCaptes++;
    }
    if (tgtClients.has(cc)) {
      metierMap[metier].tgtClients++;
      if (tgtCAMap?.has(cc)) metierMap[metier].tgtCA += tgtCAMap.get(cc);
      metierMap[metier].tgtClientCCs.push(cc);
    }
  }

  return Object.entries(metierMap)
    .filter(([, d]) => d.zoneTotal > 0)
    .map(([metier, d]) => ({
      metier,
      zoneTotal: d.zoneTotal,
      myClients: d.myClients,
      tgtClients: d.tgtClients,
      zoneNonCaptes: d.zoneNonCaptes,
      captation: d.zoneTotal > 0 ? d.myClients / d.zoneTotal * 100 : 0,
      fuite: d.tgtClients,
      myCA: d.myCA,
      tgtCA: d.tgtCA,
      tgtClientCCs: d.tgtClientCCs || [],
    }))
    .sort((a, b) => b.tgtCA - a.tgtCA || b.fuite - a.fuite);
}

// ═══════════════════════════════════════════════════════════════
// renderDuelTab — construit l'UI complète
// ═══════════════════════════════════════════════════════════════
export function renderDuelTab() {
  const el = document.getElementById('duelContent');
  if (!el) return;

  const myStore = _S.selectedMyStore;
  const stores = _S.storesIntersection;
  if (!stores || stores.size < 2 || !myStore) {
    el.innerHTML = '<div class="p-8 text-center t-secondary">Chargez un consommé multi-agences pour activer le Duel.</div>';
    return;
  }

  const otherStores = [...stores].filter(s => s !== myStore).sort();
  if (!_duelTarget || !stores.has(_duelTarget) || _duelTarget === myStore) {
    _duelTarget = otherStores[0] || '';
  }
  if (!_duelTarget) {
    el.innerHTML = '<div class="p-8 text-center t-secondary">Aucune autre agence disponible.</div>';
    return;
  }

  const t0 = performance.now();
  const duel = _getCachedDuel(myStore, _duelTarget);
  if (!duel) {
    el.innerHTML = '<div class="p-8 text-center t-secondary">Données insuffisantes pour ce duel.</div>';
    return;
  }
  console.log(`[Duel] ${myStore} vs ${_duelTarget} — ${(performance.now() - t0).toFixed(1)}ms`);

  const html = [];

  // ── Header : sélecteur + titre ──
  html.push(`<div class="flex items-center gap-3 mb-5 flex-wrap">
    <div class="flex items-center gap-2">
      <span class="font-bold text-lg" style="color:var(--c-action)">${escapeHtml(myStore)}</span>
      <span class="t-secondary text-sm font-medium">vs</span>
      <select id="duelTargetSelect" onchange="window._duelSelectTarget(this.value)" class="p-2 border-2 b-dark rounded-lg text-sm font-bold t-primary s-card">
        ${otherStores.map(s => `<option value="${s}"${s === _duelTarget ? ' selected' : ''}>${s}</option>`).join('')}
      </select>
    </div>
    <div class="flex-1"></div>
    <span class="text-xs t-disabled">Période : ${escapeHtml(_periodLabel())}</span>
  </div>`);

  html.push(_buildDataHealthNotice(myStore, _duelTarget));

  // ── Cockpit décision : un diagnostic, des preuves, un plan ──
  const decision = _decisionModel(duel, myStore, _duelTarget);
  html.push(_buildDecisionCockpit(decision, myStore, _duelTarget));
  html.push(_buildDecisionEvidence(decision));
  html.push(_buildAuditDetails(duel, myStore, _duelTarget));

  el.innerHTML = html.join('');
}

// ═══════════════════════════════════════════════════════════════
// Cockpit décision — un duel doit produire une décision, pas un rapport
// ═══════════════════════════════════════════════════════════════
function _jsArg(s) {
  return String(s || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

function _signedEuro(v) {
  return `${v > 0 ? '+' : ''}${formatEuro(v || 0)}`;
}

function _walletPct(myCA, tgtCA) {
  const total = (myCA || 0) + (tgtCA || 0);
  if (total <= 0) return null;
  return Math.round((myCA || 0) / total * 100);
}

function _getUniverseBuyerMetrics(universeName, myStore, tgtStore, universeRow) {
  const idx = _S.clientsByStoreUnivers || {};
  const myStoreIdx = idx[myStore];
  const tgtStoreIdx = idx[tgtStore];
  const available = !!(myStoreIdx && tgtStoreIdx && universeName);
  const myBuyers = available ? (myStoreIdx[universeName]?.size || 0) : null;
  const tgtBuyers = available ? (tgtStoreIdx[universeName]?.size || 0) : null;
  const myCA = universeRow?.myCA || 0;
  const tgtCA = universeRow?.tgtCA || 0;
  return {
    available,
    myBuyers,
    tgtBuyers,
    myAvg: available && myBuyers > 0 ? myCA / myBuyers : 0,
    tgtAvg: available && tgtBuyers > 0 ? tgtCA / tgtBuyers : 0,
  };
}

function _decisionModel(duel, myStore, tgtStore) {
  const positiveUnivers = [...(duel.univers || [])]
    .filter(u => u.ecart > 0)
    .sort((a, b) => b.ecart - a.ecart);
  const focusUniverse = (_duelUniversFilter && positiveUnivers.find(u => u.nom === _duelUniversFilter)) || positiveUnivers[0] || null;

  const focusFams = focusUniverse
    ? duel.familles
      .filter(f => f.univers === focusUniverse.nom && f.ecart > 0)
      .sort((a, b) => b.ecart - a.ecart)
      .slice(0, 6)
      .map(f => ({ ...f, missing: _missingArticlesForFam(f.fam, myStore, tgtStore) }))
    : [];

  const metiersRaw = (duel.metiers || [])
    .filter(m => m.metier !== 'Hors zone' && m.metier !== 'Non renseigné' && (m.tgtCA - m.myCA) > 0);
  let focusMetiers = focusUniverse ? metiersRaw.filter(m => _metierMatchesUniverse(m.metier, focusUniverse.nom)) : metiersRaw;
  if (!focusMetiers.length) focusMetiers = metiersRaw;
  focusMetiers = focusMetiers
    .sort((a, b) => (b.tgtCA - b.myCA) - (a.tgtCA - a.myCA))
    .slice(0, 5);

  const universeGap = focusUniverse?.ecart || 0;
  const familyGap = focusFams.reduce((s, f) => s + Math.max(f.ecart || 0, 0), 0);
  const missingRefs = focusFams.reduce((s, f) => s + (f.missing?.count || 0), 0);
  const metierGap = focusMetiers.reduce((s, m) => s + Math.max((m.tgtCA || 0) - (m.myCA || 0), 0), 0);
  const topFam = focusFams[0] || null;
  const topMetier = focusMetiers[0] || null;
  const mixGapPts = focusUniverse ? focusUniverse.tgtPct - focusUniverse.myPct : 0;
  const buyerMetrics = focusUniverse ? _getUniverseBuyerMetrics(focusUniverse.nom, myStore, tgtStore, focusUniverse) : null;

  let headline = 'Pas de chantier magasin évident';
  let decision = 'Le duel ne prouve pas encore un besoin de développement magasin';
  let confidence = 'faible';
  if (focusUniverse && universeGap >= 5000 && (focusFams.length >= 2 || focusMetiers.length >= 2 || mixGapPts >= 3)) {
    headline = `Développer ${focusUniverse.nom}`;
    decision = `Le duel justifie un plan magasin : kit familles + relais Conquête pour les clients`;
    confidence = focusFams.length >= 3 && focusMetiers.length >= 2 && mixGapPts >= 3 ? 'forte' : 'moyenne';
  } else if (focusUniverse && universeGap > 0) {
    headline = `Surveiller ${focusUniverse.nom}`;
    decision = `Écart visible, mais à confirmer avant d'ouvrir un kit magasin`;
    confidence = 'moyenne';
  }

  return {
    focusUniverse,
    focusFams,
    focusMetiers,
    universeGap,
    familyGap,
    metierGap,
    missingRefs,
    topFam,
    topMetier,
    mixGapPts,
    buyerMetrics,
    headline,
    decision,
    confidence,
  };
}

function _miniBar(myVal, tgtVal) {
  const max = Math.max(Math.abs(myVal || 0), Math.abs(tgtVal || 0), 1);
  const myW = Math.round(Math.abs(myVal || 0) / max * 100);
  const tgtW = Math.round(Math.abs(tgtVal || 0) / max * 100);
  return `<div class="flex items-center gap-0.5 h-3">
    <div class="flex-1 flex justify-end"><div class="h-2 rounded-sm" style="width:${myW}%;background:var(--c-action);opacity:.75;min-width:${myW ? '2px' : '0'}"></div></div>
    <div class="w-px h-3" style="background:var(--b-dark)"></div>
    <div class="flex-1"><div class="h-2 rounded-sm bg-gray-400" style="width:${tgtW}%;opacity:.55;min-width:${tgtW ? '2px' : '0'}"></div></div>
  </div>`;
}

function _buildDecisionCockpit(m, myStore, tgtStore) {
  const u = m.focusUniverse;
  const confColor = m.confidence === 'forte' ? '#22c55e' : m.confidence === 'moyenne' ? '#f59e0b' : '#94a3b8';
  const wallet = u ? _walletPct(u.myCA, u.tgtCA) : null;
  const bm = m.buyerMetrics;
  const buyerHint = bm?.available
    ? `${bm.myBuyers} acheteurs moi · ${bm.tgtBuyers} lui`
    : 'Recharge les fichiers pour activer les acheteurs par agence';

  const kpiCards = [
    {
      label: 'Retard univers',
      value: u ? _signedEuro(u.ecart) : '—',
      hint: u ? `${u.myPct.toFixed(0)}% mix moi · ${u.tgtPct.toFixed(0)}% lui` : 'Pas de retard positif',
      color: u?.ecart > 0 ? '#ef4444' : '#94a3b8',
    },
    {
      label: 'Acheteurs 12MG',
      value: bm?.available ? `${bm.myBuyers} → ${bm.tgtBuyers}` : '—',
      hint: buyerHint,
      color: '#22c55e',
    },
    {
      label: 'CA / acheteur · tous canaux',
      value: bm?.available ? `${formatEuro(bm.myAvg)} → ${formatEuro(bm.tgtAvg)}` : '—',
      hint: bm?.available ? `écart ${_signedEuro(bm.tgtAvg - bm.myAvg)} par acheteur` : 'Index acheteurs non disponible',
      color: '#06b6d4',
    },
    {
      label: 'Familles à soutenir',
      value: m.focusFams.length ? String(m.focusFams.length) : '—',
      hint: m.topFam ? `${escapeHtml(m.topFam.label || m.topFam.fam)} · ${_signedEuro(m.topFam.ecart)}` : 'Pas de famille porteuse',
      color: '#3b82f6',
    },
    {
      label: 'Métiers concernés',
      value: m.focusMetiers.length ? String(m.focusMetiers.length) : '—',
      hint: m.topMetier ? `${escapeHtml(m.topMetier.metier)} · ${_signedEuro(m.topMetier.tgtCA - m.topMetier.myCA)}` : 'Pas de métier explicatif',
      color: '#f59e0b',
    },
  ].map(c => `<div class="rounded-lg border p-3" style="border-color:var(--b-light);background:rgba(255,255,255,.02)">
    <div class="text-[10px] uppercase font-bold t-disabled mb-1">${c.label}</div>
    <div class="text-lg font-extrabold" style="color:${c.color}">${c.value}</div>
    <div class="text-[10px] t-secondary mt-1 truncate" title="${escapeHtml(c.hint)}">${c.hint}</div>
  </div>`).join('');

  return `<div class="rounded-xl border mb-5 overflow-hidden" style="background:linear-gradient(135deg,rgba(59,130,246,.10),rgba(15,23,42,.55));border-color:rgba(96,165,250,.28)">
    <div class="p-5 border-b" style="border-color:var(--b-light)">
      <div class="flex items-start gap-4 flex-wrap">
        <div class="flex-1 min-w-[260px]">
          <div class="text-[10px] uppercase tracking-wide font-bold t-disabled mb-1">Décision recommandée</div>
          <h2 class="text-xl font-extrabold t-primary leading-tight">${escapeHtml(m.headline)}</h2>
          <p class="text-[12px] t-secondary mt-1">${escapeHtml(m.decision)}</p>
        </div>
        <div class="text-right">
          <div class="text-[10px] uppercase font-bold t-disabled mb-1">Confiance</div>
          <div class="text-sm font-extrabold" style="color:${confColor}">${escapeHtml(m.confidence)}</div>
          <div class="text-[10px] t-disabled">${escapeHtml(myStore)} vs ${escapeHtml(tgtStore)}</div>
        </div>
      </div>
      <div class="grid grid-cols-2 xl:grid-cols-5 gap-3 mt-4">${kpiCards}</div>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-3 gap-0">
      <div class="p-4 lg:border-r" style="border-color:var(--b-light)">
        <div class="text-[10px] uppercase font-bold t-disabled mb-2">Pourquoi agir</div>
        ${u ? `<div class="space-y-2">
          <div class="flex items-center gap-2 text-[12px]">
            <span class="t-secondary">Mix</span>
            <span class="ml-auto font-mono t-primary">${u.myPct.toFixed(1)}% → ${u.tgtPct.toFixed(1)}%</span>
            <span class="font-bold text-red-400">${m.mixGapPts > 0 ? '+' : ''}${m.mixGapPts.toFixed(1)} pts</span>
          </div>
          ${_miniBar(u.myCA, u.tgtCA)}
          <div class="text-[11px] t-secondary">Part captée dans le duel : <strong class="t-primary">${wallet == null ? '—' : wallet + '%'}</strong></div>
          ${m.topFam ? `<div class="text-[11px] t-secondary">Première famille : <button class="font-bold t-primary hover:underline" onclick="window._duelOpenPlanFam('${_jsArg(u.nom)}','${_jsArg(m.topFam.fam)}')">${escapeHtml(m.topFam.label || m.topFam.fam)}</button> <span class="text-red-400">${_signedEuro(m.topFam.ecart)}</span></div>` : ''}
        </div>` : '<div class="text-[11px] t-disabled">Pas d’univers prioritaire détecté.</div>'}
      </div>

      <div class="p-4 lg:border-r" style="border-color:var(--b-light)">
        <div class="text-[10px] uppercase font-bold t-disabled mb-2">Ce que ça prouve</div>
        <div class="space-y-2 text-[11px]">
          <div class="rounded-md p-2" style="background:rgba(239,68,68,.08);color:#fca5a5">Retard CA : <strong>${_signedEuro(m.universeGap)}</strong> sur l'univers.</div>
          ${bm?.available ? `<div class="rounded-md p-2" style="background:rgba(6,182,212,.08);color:#67e8f9">Transformation : <strong>${bm.myBuyers}</strong> acheteurs moi vs <strong>${bm.tgtBuyers}</strong> lui · <strong>${formatEuro(bm.myAvg)}</strong> vs <strong>${formatEuro(bm.tgtAvg)}</strong>/acheteur.</div>` : ''}
          <div class="rounded-md p-2" style="background:rgba(34,197,94,.08);color:#86efac">Mix : <strong>${m.mixGapPts > 0 ? '+' : ''}${m.mixGapPts.toFixed(1)} pts</strong> vs agence cible.</div>
          <div class="rounded-md p-2" style="background:rgba(59,130,246,.08);color:#93c5fd">Assortiment : <strong>${m.focusFams.length}</strong> familles à travailler.</div>
        </div>
      </div>

      <div class="p-4">
        <div class="text-[10px] uppercase font-bold t-disabled mb-2">Plan court</div>
        <div class="space-y-2 text-[11px]">
          <div class="rounded-md p-2" style="background:rgba(34,197,94,.08);color:#86efac"><strong>Décider</strong> : oui/non sur un chantier magasin ${u ? escapeHtml(u.nom) : ''}.</div>
          <div class="rounded-md p-2" style="background:rgba(59,130,246,.08);color:#93c5fd"><strong>Construire</strong> : kit court par familles, pas liste de refs isolées.</div>
          <div class="rounded-md p-2" style="background:rgba(245,158,11,.08);color:#fcd34d"><strong>Exécuter</strong> : détail clients/commerciaux dans Conquête.</div>
        </div>
      </div>
    </div>
  </div>`;
}

function _buildDecisionEvidence(m) {
  const famRows = m.focusFams.slice(0, 5).map(f => {
    const miss = f.missing || { count: 0, top: [] };
    const codes = miss.top.map(a => a.code).join(', ');
    return `<button class="w-full text-left py-2 px-2 rounded-md hover:bg-gray-800 transition-colors" onclick="window._duelOpenPlanFam('${_jsArg(m.focusUniverse?.nom || '')}','${_jsArg(f.fam)}')">
      <div class="flex gap-2 items-center">
        <span class="text-[12px] font-semibold t-primary truncate">${escapeHtml(f.label || f.fam)}</span>
        <span class="ml-auto text-[12px] font-mono font-bold text-red-400">${_signedEuro(f.ecart)}</span>
      </div>
      <div class="text-[10px] t-disabled truncate">${miss.count} refs absentes${codes ? ` · ${escapeHtml(codes)}` : ''}</div>
    </button>`;
  }).join('');

  const metierRows = m.focusMetiers.slice(0, 5).map(mt => {
    const gap = mt.tgtCA - mt.myCA;
    const cGap = mt.tgtClients - mt.myClients;
    return `<div class="py-2 px-2 rounded-md" style="background:rgba(255,255,255,.02)">
      <div class="flex gap-2 items-center">
        <span class="text-[12px] font-semibold t-primary truncate">${escapeHtml(mt.metier)}</span>
        <span class="ml-auto text-[12px] font-mono font-bold text-red-400">${_signedEuro(gap)}</span>
      </div>
      <div class="text-[10px] t-disabled">${mt.myClients} clients moi · ${mt.tgtClients} lui${cGap > 0 ? ` · +${cGap} clients` : ''}</div>
    </div>`;
  }).join('');

  return `<div class="grid grid-cols-1 xl:grid-cols-2 gap-4 mb-5">
    <div class="s-card rounded-xl border p-4">
      <div class="flex items-center gap-2 mb-3">
        <h3 class="text-sm font-bold t-primary">Familles à ouvrir</h3>
        <span class="ml-auto text-[10px] t-disabled">${m.focusUniverse ? escapeHtml(m.focusUniverse.nom) : ''}</span>
      </div>
      ${famRows || '<div class="text-[11px] t-disabled py-4">Aucune famille prioritaire.</div>'}
    </div>
    <div class="s-card rounded-xl border p-4">
      <div class="flex items-center gap-2 mb-3">
        <h3 class="text-sm font-bold t-primary">Métiers qui expliquent l’écart</h3>
      </div>
      <div class="space-y-2">${metierRows || '<div class="text-[11px] t-disabled py-4">Aucun métier discriminant.</div>'}</div>
    </div>
  </div>`;
}

function _buildAuditDetails(duel, myStore, tgtStore) {
  return `<details class="s-card rounded-xl border mb-5 overflow-hidden"${_duelAuditOpen ? ' open' : ''} ontoggle="window._duelAuditOpenSet(this.open)">
    <summary class="cursor-pointer select-none p-4 text-sm font-bold t-primary">
      Audit complet du duel <span class="text-xs font-normal t-disabled">KPIs, clients, métiers, univers, familles</span>
    </summary>
    <div class="px-4 pb-4">
      ${_buildKPIScorecard(duel, myStore, tgtStore)}
      ${_buildMetierSection(duel, myStore, tgtStore)}
      ${_buildUniversSection(duel, myStore, tgtStore)}
      ${_buildFamillesSection(duel, myStore, tgtStore)}
    </div>
  </details>`;
}

// ═══════════════════════════════════════════════════════════════
// KPI Scorecard — compact, visuel, avec barres de comparaison
// ═══════════════════════════════════════════════════════════════
function _buildKPIScorecard(duel, myStore, tgtStore) {
  const { my, tgt } = duel;

  // Helper pour une barre de comparaison horizontale
  function _kpiRow(label, myVal, tgtVal, fmt, diffFmt, reverse = false) {
    const hasMy = Number.isFinite(myVal);
    const hasTgt = Number.isFinite(tgtVal);
    const comparable = hasMy && hasTgt;
    const max = Math.max(hasMy ? Math.abs(myVal) : 0, hasTgt ? Math.abs(tgtVal) : 0) || 1;
    const myW = hasMy ? Math.round(Math.abs(myVal) / max * 100) : 0;
    const tgtW = hasTgt ? Math.round(Math.abs(tgtVal) / max * 100) : 0;
    const iWin = comparable && (reverse ? myVal < tgtVal : myVal > tgtVal);
    const theyWin = comparable && (reverse ? myVal > tgtVal : myVal < tgtVal);
    const diffColor = theyWin ? 'text-red-500' : iWin ? 'text-emerald-500' : 't-disabled';
    const myFmt = hasMy ? fmt(myVal) : '<span class="t-disabled">—</span>';
    const tgtFmt = hasTgt ? fmt(tgtVal) : '<span class="t-disabled">—</span>';
    const diff = comparable ? diffFmt(tgtVal - myVal, myVal, tgtVal) : '<span class="t-disabled">—</span>';

    return `<div class="flex items-center gap-2 py-1.5">
      <div class="w-28 text-[11px] t-secondary font-medium shrink-0">${label}</div>
      <div class="flex-1 flex items-center gap-1.5">
        <div class="w-20 text-right text-xs font-bold shrink-0 ${iWin ? '' : 'font-normal'}" style="color:var(--c-action)">${myFmt}</div>
        <div class="flex-1 flex items-center gap-0.5 h-4">
          <div class="flex-1 flex justify-end"><div class="h-3 rounded-sm" style="width:${myW}%;background:var(--c-action);opacity:${iWin ? '.85' : '.35'};min-width:${myW > 0 ? '2px' : '0'}"></div></div>
          <div class="w-px h-4" style="background:var(--b-dark)"></div>
          <div class="flex-1"><div class="h-3 rounded-sm bg-gray-400" style="width:${tgtW}%;opacity:${theyWin ? '.85' : '.35'};min-width:${tgtW > 0 ? '2px' : '0'}"></div></div>
        </div>
        <div class="w-20 text-xs shrink-0 ${theyWin ? 'font-bold' : 'font-normal'} t-primary">${tgtFmt}</div>
      </div>
      <div class="w-20 text-right text-[11px] font-semibold ${diffColor} shrink-0">${diff}</div>
    </div>`;
  }

  const fmtInt = v => Math.round(v).toLocaleString('fr-FR');
  const fmtOne = v => v.toFixed(1);
  const fmtPct = v => v.toFixed(1) + '%';
  const fmtEuroDiff = d => (d > 0 ? '+' : '') + formatEuro(d);
  const fmtIntDiff = d => (d > 0 ? '+' : '') + Math.round(d).toLocaleString('fr-FR');
  const fmtPtsDiff = d => (d > 0 ? '+' : '') + d.toFixed(1) + ' pts';
  const fmtOneDiff = d => (d > 0 ? '+' : '') + d.toFixed(1);
  const caClientMy = my.nbClients > 0 ? (my.caClient || 0) : null;
  const caClientTgt = tgt.nbClients > 0 ? (tgt.caClient || 0) : null;
  const freqClientMy = my.nbClients > 0 ? (my.freqClient || 0) : null;
  const freqClientTgt = tgt.nbClients > 0 ? (tgt.freqClient || 0) : null;

  const rows = [
    _kpiRow('CA Total', my.ca, tgt.ca, formatEuro, fmtEuroDiff),
    _kpiRow('Marge Brute', my.vmb, tgt.vmb, formatEuro, fmtEuroDiff),
    _kpiRow('Tx Marge', my.txMarge, tgt.txMarge, fmtPct, fmtPtsDiff),
    _kpiRow('Refs actives', my.refs, tgt.refs, fmtInt, fmtIntDiff),
    _kpiRow('Clients', my.nbClients, tgt.nbClients, fmtInt, fmtIntDiff),
    _kpiRow('Fréquence BL', my.freq, tgt.freq, fmtInt, fmtIntDiff),
    _kpiRow('CA / Client', caClientMy, caClientTgt, formatEuro, fmtEuroDiff),
    _kpiRow('BL / Client', freqClientMy, freqClientTgt, fmtOne, fmtOneDiff),
  ];

  // Score global : uniquement sur les KPIs réellement comparables.
  const scoreMetrics = [
    [my.ca, tgt.ca], [my.vmb, tgt.vmb], [my.txMarge, tgt.txMarge],
    [my.refs, tgt.refs], [my.nbClients, tgt.nbClients], [my.freq, tgt.freq],
    [caClientMy, caClientTgt], [freqClientMy, freqClientTgt],
  ].filter(([a, b]) => Number.isFinite(a) && Number.isFinite(b));
  const myWins = scoreMetrics.filter(([a, b]) => a > b).length;
  const tgtWins = scoreMetrics.filter(([a, b]) => b > a).length;
  const comparableCount = scoreMetrics.length || 0;
  const scoreColor = comparableCount && myWins > tgtWins ? 'text-emerald-500' : comparableCount && myWins === tgtWins ? 'text-amber-500' : 'text-red-500';

  // ── Sparklines mensuelles CA face-à-face ──
  let monthlyHtml = '';
  const bmsac = _S._byMonthStoreArtCanal;
  if (bmsac?.[myStore] && bmsac?.[tgtStore]) {
    const { startIdx, endIdx, hasPeriod } = _periodMonthIdxBounds();
    // Agréger CA par mois pour chaque store (tous canaux, tous articles)
    const myMonths = {}, tgtMonths = {};
    for (const canal in bmsac[myStore]) {
      for (const code in bmsac[myStore][canal]) {
        for (const midx in bmsac[myStore][canal][code]) {
          if (hasPeriod && (+midx < startIdx || +midx > endIdx)) continue;
          myMonths[midx] = (myMonths[midx] || 0) + (bmsac[myStore][canal][code][midx].sumCA || 0);
        }
      }
    }
    for (const canal in bmsac[tgtStore]) {
      for (const code in bmsac[tgtStore][canal]) {
        for (const midx in bmsac[tgtStore][canal][code]) {
          if (hasPeriod && (+midx < startIdx || +midx > endIdx)) continue;
          tgtMonths[midx] = (tgtMonths[midx] || 0) + (bmsac[tgtStore][canal][code][midx].sumCA || 0);
        }
      }
    }
    // Indices de mois triés
    const allIdx = [...new Set([...Object.keys(myMonths), ...Object.keys(tgtMonths)])].sort((a, b) => +a - +b);
    if (allIdx.length >= 2) {
      const maxCA = Math.max(...allIdx.map(i => Math.max(myMonths[i] || 0, tgtMonths[i] || 0))) || 1;
      const MONTH_LABELS = ['J','F','M','A','M','J','J','A','S','O','N','D'];
      const bars = allIdx.map(midx => {
        const m = +midx % 12;
        const myH = Math.round((myMonths[midx] || 0) / maxCA * 40);
        const tgtH = Math.round((tgtMonths[midx] || 0) / maxCA * 40);
        const myV = myMonths[midx] || 0;
        const tgtV = tgtMonths[midx] || 0;
        const iWin = myV > tgtV;
        return `<div class="flex flex-col items-center gap-0.5" title="${MONTH_LABELS[m]} : ${formatEuro(myV)} vs ${formatEuro(tgtV)}">
          <div class="flex items-end gap-px" style="height:40px">
            <div class="w-[6px] rounded-t-sm" style="height:${myH}px;background:var(--c-action);opacity:${iWin ? '.85' : '.4'}"></div>
            <div class="w-[6px] rounded-t-sm bg-gray-400" style="height:${tgtH}px;opacity:${!iWin ? '.85' : '.4'}"></div>
          </div>
          <span class="text-[7px] t-disabled">${MONTH_LABELS[m]}</span>
        </div>`;
      }).join('');

      monthlyHtml = `<div class="mt-3 pt-3" style="border-top:1px solid var(--b-light)">
        <div class="text-[10px] t-disabled mb-1.5">CA mensuel <span style="color:var(--c-action)">■</span> Moi vs <span class="t-primary">■</span> Lui</div>
        <div class="flex items-end justify-between gap-1">${bars}</div>
      </div>`;
    }
  }

  return `<div class="s-card rounded-xl border p-4 mb-5">
    <div class="flex items-center justify-between mb-3">
      <div class="flex items-center gap-3">
        <span class="font-bold text-sm" style="color:var(--c-action)">${escapeHtml(myStore)}</span>
        <span class="text-xs font-bold ${scoreColor}">${myWins}/${comparableCount || '—'}</span>
        <span class="t-disabled text-xs">—</span>
        <span class="text-xs font-bold t-primary">${tgtWins}/${comparableCount || '—'}</span>
        <span class="font-bold text-sm t-primary">${escapeHtml(tgtStore)}</span>
      </div>
      <span class="text-[10px] t-disabled">Écart</span>
    </div>
    <div class="divide-y" style="border-color:var(--b-light)">
      ${rows.join('')}
    </div>
    ${monthlyHtml}
  </div>`;
}

// ═══════════════════════════════════════════════════════════════
// Plan d'action — transforme le duel en levier terrain par univers
// ═══════════════════════════════════════════════════════════════
function _normTxt(s) {
  return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function _metierMatchesUniverse(metier, univers) {
  const m = _normTxt(metier);
  const u = _normTxt(univers);
  if (!m || !u) return false;
  const rules = {
    plomberie: /plomb|chauff|sanit|therm|fluide|clim|genie climatique|maintenance/,
    batiment: /batiment|macon|couverture|couvreur|menuis|charpent|plaqu|peint|sol|carrel/,
    electricite: /electric|alarme|courant|cable|domot|automat/,
    outillage: /maintenance|indus|mecan|atelier|serrur|metal|usin/,
    quincaillerie: /serrur|menuis|agencement|batiment|maintenance|metall/,
    consommables: /maintenance|indus|atelier|nettoy|service|collectiv/,
    epi: /securite|collectiv|industrie|batiment|maintenance/,
    "genie climatique": /clim|chauff|ventil|frigor|therm|genie climatique/,
  };
  for (const key in rules) {
    if (u.includes(key)) return rules[key].test(m);
  }
  return false;
}

function _missingArticlesForFam(famCode, myStore, tgtStore) {
  _ensureDuelAgenceStore();
  const myRec = _S.agenceStore?.get(myStore);
  const tgtRec = _S.agenceStore?.get(tgtStore);
  if (!myRec || !tgtRec) return { count: 0, ca: 0, top: [] };
  const artFam = _S.articleFamille || {};
  const libLookup = _S.libelleLookup || {};
  const spm = _S.stockParMagasin || {};
  const myStock = spm[myStore] || {};
  const fdByCode = _getFinalDataIndex();
  const out = [];
  for (const code in (tgtRec.artMap || {})) {
    if (!_isSixDigit(code) || artFam[code] !== famCode) continue;
    const tgtD = tgtRec.artMap[code];
    const myD = myRec.artMap?.[code];
    const tgtCA = tgtD?.sumCA || 0;
    const myCA = myD?.sumCA || 0;
    const myStk = myStock[code] || {};
    const fdRef = fdByCode[code];
    const myHasStock = (myStk.qteMin || 0) > 0 || (myStk.qteMax || 0) > 0 || (fdRef?.stockActuel > 0) || (fdRef?.nouveauMin > 0);
    if (tgtCA > 0 && !myHasStock && !_hasAmount(myCA)) {
      out.push({ code, lib: libLookup[code] || '', ca: tgtCA, bl: tgtD?.countBL || 0 });
    }
  }
  out.sort((a, b) => b.ca - a.ca || b.bl - a.bl);
  return {
    count: out.length,
    ca: out.reduce((s, a) => s + a.ca, 0),
    top: out.slice(0, 3),
  };
}


// ═══════════════════════════════════════════════════════════════
// Gap Métier — pourquoi il me bat ? diagnostic par métier client
// ═══════════════════════════════════════════════════════════════
function _buildMetierSection(duel, myStore, tgtStore) {
  const { metiers } = duel;
  if (!metiers?.length) return '<div class="mb-5 p-4 text-xs t-secondary s-card rounded-xl border">Chargez la Zone de Chalandise pour voir le diagnostic métier.</div>';

  // Séparer principaux / spéciaux
  const mainMetiers = metiers.filter(m => m.metier !== 'Hors zone' && m.metier !== 'Non renseigné');
  const otherMetiers = metiers.filter(m => m.metier === 'Hors zone' || m.metier === 'Non renseigné');

  // Tri par gap CA desc (là où il me bat le plus)
  const sorted = [...mainMetiers.sort((a, b) => (b.tgtCA - b.myCA) - (a.tgtCA - a.myCA)), ...otherMetiers];

  // Filtrer : garder uniquement les métiers avec du signal (zone >= 5 OU CA > 0)
  const withSignal = sorted.filter(m => m.zoneTotal >= 5 || m.myCA > 0 || m.tgtCA > 0 || m.metier === 'Hors zone' || m.metier === 'Non renseigné');

  const TOP_N = 10;
  const showAll = _duelShowAllMetiers;
  const visible = showAll ? withSignal : withSignal.slice(0, TOP_N);
  const hasMore = withSignal.length > TOP_N;

  // Max pour les barres
  const maxClients = Math.max(...withSignal.map(m => Math.max(m.myClients, m.tgtClients))) || 1;

  const rows = visible.map(m => {
    const gapCA = m.tgtCA - m.myCA;
    const gapClients = m.tgtClients - m.myClients;
    const gapColor = gapCA > 0 ? 'text-red-500' : gapCA < 0 ? 'text-emerald-500' : 't-disabled';
    const isSpecial = m.metier === 'Hors zone' || m.metier === 'Non renseigné';

    // Barres face-à-face clients
    const myBarW = Math.round(m.myClients / maxClients * 100);
    const tgtBarW = Math.round(m.tgtClients / maxClients * 100);

    // Diagnostic auto : pourquoi il gagne ?
    let diag = '';
    if (gapCA > 1000) {
      if (gapClients > 5) diag = `<span class="text-[9px] text-red-400 ml-1">+${gapClients} clients</span>`;
      else if (m.tgtClients > 0 && m.myClients > 0) diag = `<span class="text-[9px] text-amber-400 ml-1">panier ↑</span>`;
    } else if (gapCA < -1000 && gapClients < -5) {
      diag = `<span class="text-[9px] text-emerald-400 ml-1">+${-gapClients} clients</span>`;
    }

    const isOpen = _duelOpenMetier === m.metier;
    const clickable = !isSpecial && (m.tgtClients > 0 || m.myClients > 0);
    const cursor = clickable ? 'cursor-pointer' : '';
    const onclick = clickable ? ` onclick="window._duelToggleMetier('${escapeHtml(m.metier.replace(/'/g, "\\'"))}')"` : '';
    const chevron = clickable ? `<span class="text-[9px] t-disabled ml-1">${isOpen ? '▼' : '▶'}</span>` : '';

    let row = `<tr class="border-b hover:bg-gray-50 dark:hover:bg-gray-800 ${isSpecial ? 'opacity-50' : ''} ${cursor}" style="border-color:var(--b-light)"${onclick}>
      <td class="py-2 px-2 text-xs font-medium">${escapeHtml(m.metier)}${diag}${chevron}</td>
      <td class="py-2 px-2 text-xs text-right t-disabled">${m.zoneTotal}</td>
      <td class="py-2 px-2">
        <div class="flex items-center gap-1">
          <div class="w-8 text-right text-[11px] font-semibold" style="color:var(--c-action)">${m.myClients}</div>
          <div class="flex-1 flex items-center gap-px h-3">
            <div class="flex-1 flex justify-end"><div class="h-2.5 rounded-sm" style="width:${myBarW}%;background:var(--c-action);opacity:.7;min-width:${myBarW > 0 ? '1px' : '0'}"></div></div>
            <div class="w-px h-3" style="background:var(--b-dark)"></div>
            <div class="flex-1"><div class="h-2.5 rounded-sm bg-gray-400" style="width:${tgtBarW}%;opacity:.6;min-width:${tgtBarW > 0 ? '1px' : '0'}"></div></div>
          </div>
          <div class="w-8 text-[11px] font-semibold t-primary">${m.tgtClients}</div>
        </div>
      </td>
      <td class="py-2 px-2 text-xs text-right font-mono">${_hasAmount(m.myCA) ? formatEuro(m.myCA) : '<span class="t-disabled">—</span>'}</td>
      <td class="py-2 px-2 text-xs text-right font-mono">${_hasAmount(m.tgtCA) ? formatEuro(m.tgtCA) : '<span class="t-disabled">—</span>'}</td>
      <td class="py-2 px-2 text-xs text-right font-bold font-mono ${gapColor}">${gapCA !== 0 ? (gapCA > 0 ? '+' : '') + formatEuro(gapCA) : '—'}</td>
    </tr>`;

    // Drill-down métier : familles où l'adversaire bat chez ce métier
    if (isOpen) {
      row += _buildMetierDrillDown(m, myStore, tgtStore);
    }

    return row;
  }).join('');

  // Totaux
  const totalMyCA = metiers.reduce((s, m) => s + m.myCA, 0);
  const totalTgtCA = metiers.reduce((s, m) => s + m.tgtCA, 0);
  const totalGap = totalTgtCA - totalMyCA;
  const totalMyClients = metiers.reduce((s, m) => s + m.myClients, 0);
  const totalTgtClients = metiers.reduce((s, m) => s + m.tgtClients, 0);

  return `<div class="s-card rounded-xl border mb-5 overflow-hidden">
    <div class="p-4 pb-2">
      <h3 class="text-sm font-bold t-primary mb-0.5">Diagnostic Métier <span class="text-xs font-normal t-disabled">— pourquoi il me bat</span></h3>
      <p class="text-[10px] t-disabled mb-2">Clients de ta zone chalandise croisés avec le consommé ${escapeHtml(tgtStore)}. Sur quel métier il capte plus de clients et plus de CA que toi ?</p>
    </div>

    <div class="overflow-x-auto">
    <table class="w-full text-left border-collapse">
      <thead><tr class="text-[10px] t-disabled border-b" style="border-color:var(--b-dark);background:var(--s-page)">
        <th class="py-1.5 px-2 font-medium">Métier</th>
        <th class="py-1.5 px-2 text-right font-medium">Zone</th>
        <th class="py-1.5 px-2 font-medium text-center" style="min-width:160px">
          <span style="color:var(--c-action)">Moi</span>
          <span class="mx-1 t-disabled">·</span>
          Clients
          <span class="mx-1 t-disabled">·</span>
          <span class="t-primary">Lui</span>
        </th>
        <th class="py-1.5 px-2 text-right font-medium">CA Moi</th>
        <th class="py-1.5 px-2 text-right font-medium">CA Lui</th>
        <th class="py-1.5 px-2 text-right font-medium">Gap CA</th>
      </tr></thead>
      <tbody>${rows}
        <tr class="border-t-2 font-semibold" style="border-color:var(--b-dark)">
          <td class="py-2 px-2 text-xs">Total zone</td>
          <td class="py-2 px-2 text-xs text-right t-disabled">${metiers.reduce((s, m) => s + m.zoneTotal, 0)}</td>
          <td class="py-2 px-2 text-xs text-center">
            <span style="color:var(--c-action)">${totalMyClients}</span>
            <span class="t-disabled mx-2">vs</span>
            <span class="t-primary">${totalTgtClients}</span>
          </td>
          <td class="py-2 px-2 text-xs text-right font-mono">${formatEuro(totalMyCA)}</td>
          <td class="py-2 px-2 text-xs text-right font-mono">${formatEuro(totalTgtCA)}</td>
          <td class="py-2 px-2 text-xs text-right font-mono font-bold ${totalGap > 0 ? 'text-red-500' : 'text-emerald-500'}">${totalGap > 0 ? '+' : ''}${formatEuro(totalGap)}</td>
        </tr>
      </tbody>
    </table>
    </div>
    ${hasMore ? `<div class="p-2 text-center border-t" style="border-color:var(--b-light)">
      <button onclick="window._duelToggleAllMetiers()" class="text-xs font-medium hover:underline" style="color:var(--c-action)">
        ${showAll ? 'Réduire ▲' : `Voir les ${withSignal.length - TOP_N} autres ▼`}
      </button>
    </div>` : ''}
  </div>`;
}

// ═══════════════════════════════════════════════════════════════
// Drill-down Métier — RADIOGRAPHIE CLIENTS nommés
// Qui achète chez lui ? Combien ? Est-il dans ma zone ?
// 3 groupes : Partagés (quick wins), À conquérir, Mes fidèles
// ═══════════════════════════════════════════════════════════════
function _buildMetierDrillDown(metierData, myStore, tgtStore) {
  const chal = _S.chalandiseData;
  if (!chal?.size) return `<tr><td colspan="6" class="py-4 px-4 text-[11px] t-disabled text-center" style="background:var(--bg-card)">
    Chargez la Zone de Chalandise pour voir les clients nommés.</td></tr>`;

  const myClientsStore = _getPeriodClientSetForStore(myStore);
  const tgtClientsStore = _getPeriodClientSetForStore(tgtStore);
  const myCAMap = _buildPeriodCAMapForStore(myStore);
  const tgtCAMap = _buildPeriodCAMapForStore(tgtStore);
  const nomLookup = _S.clientNomLookup || {};
  const vcaFull = _S.ventesClientMagFull;
  const artFam = _S.articleFamille || {};
  const metier = metierData.metier;

  // ── Familles fortes chez l'adversaire (pour suggestions familles manquantes) ──
  const tgtFamCA = {};
  const tgtRec = _S.agenceStore?.get(tgtStore);
  const tgtArtMap = tgtRec?.artMap || _S.ventesParMagasin?.[tgtStore] || {};
  for (const code in tgtArtMap) {
    if (!/^\d{6}$/.test(code)) continue;
    const fam = artFam[code];
    if (fam) tgtFamCA[fam] = (tgtFamCA[fam] || 0) + (tgtArtMap[code].sumCA || 0);
  }

  // ── Classifier tous les clients zone de ce métier ──
  const partages = [];
  const conquete = [];
  const fideles = [];
  let dormantCount = 0;

  for (const [cc, info] of chal) {
    let m = info.metier || '';
    if (!m || m.length <= 2 || /^[-.\s]+$/.test(m)) m = 'Non renseigné';
    if (m !== metier) continue;

    const buysMine = myClientsStore.has(cc);
    const buysHis = tgtClientsStore.has(cc);
    const myCA = myCAMap?.get(cc) || 0;
    const hisCA = tgtCAMap?.get(cc) || 0;
    const nom = info.nom || nomLookup[cc] || cc;
    const classif = info.classification || '';
    const commercial = info.commercial || '';
    const cp = info.cp || '';
    const ville = info.ville || '';

    // Familles achetées chez moi par ce client
    let myFams = null;
    if (buysMine && vcaFull?.has(cc)) {
      myFams = new Set();
      for (const [code] of vcaFull.get(cc)) {
        const f = artFam[code];
        if (f) myFams.add(f);
      }
    }

    // Familles suggérées : fortes chez adversaire, dans le métier, pas achetées chez moi
    let suggestedFams = [];
    if (buysMine && myFams) {
      const allTgtFams = Object.entries(tgtFamCA)
        .filter(([f, ca]) => ca > 500 && !myFams.has(f))
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3);
      suggestedFams = allTgtFams.map(([f, ca]) => ({ fam: f, label: famLib(f), ca }));
    }

    const client = { cc, nom, classif, commercial, cp, ville, myCA, hisCA, gap: hisCA - myCA, myFamCount: myFams?.size || 0, suggestedFams };

    if (buysMine && buysHis) partages.push(client);
    else if (buysHis && !buysMine) conquete.push(client);
    else if (buysMine && !buysHis) fideles.push(client);
    else dormantCount++;
  }

  // ── Tri par impact ──
  partages.sort((a, b) => b.gap - a.gap);
  conquete.sort((a, b) => b.hisCA - a.hisCA);
  fideles.sort((a, b) => b.myCA - a.myCA);

  // ── KPIs ──
  const totalGapPartages = partages.reduce((s, c) => s + Math.max(0, c.gap), 0);
  const totalConquest = conquete.reduce((s, c) => s + c.hisCA, 0);
  const totalFideles = fideles.reduce((s, c) => s + c.myCA, 0);
  const totalMy = partages.reduce((s, c) => s + c.myCA, 0) + fideles.reduce((s, c) => s + c.myCA, 0);
  const totalHis = partages.reduce((s, c) => s + c.hisCA, 0) + conquete.reduce((s, c) => s + c.hisCA, 0);
  const walletShare = (totalMy + totalHis) > 0 ? Math.round(totalMy / (totalMy + totalHis) * 100) : 0;

  // ── Classification badge ──
  function _classifBadge(c) {
    if (!c) return '';
    const colors = {
      'FID Pot+': 'background:#10b98130;color:#34d399;border:1px solid #10b98140',
      'FID Pot-': 'background:#6ee7b730;color:#6ee7b7;border:1px solid #6ee7b740',
      'OCC Pot+': 'background:#f59e0b30;color:#fbbf24;border:1px solid #f59e0b40',
      'OCC Pot-': 'background:#f59e0b20;color:#fcd34d;border:1px solid #f59e0b30',
    };
    const style = colors[c] || 'background:var(--bg-card);color:var(--t-secondary);border:1px solid var(--b-light)';
    return `<span class="text-[8px] px-1.5 py-0.5 rounded-full font-bold whitespace-nowrap" style="${style}">${escapeHtml(c)}</span>`;
  }

  // ── Wallet share bar (macro) ──
  function _walletBar(myCA, hisCA) {
    const total = myCA + hisCA;
    if (total <= 0) return '';
    const myPct = Math.round(myCA / total * 100);
    const hisPct = 100 - myPct;
    return `<div class="flex h-2 rounded-full overflow-hidden" style="min-width:60px;background:var(--b-light)">
      <div class="h-full rounded-l-full" style="width:${myPct}%;background:var(--c-action);opacity:.85"></div>
      <div class="h-full rounded-r-full bg-gray-400" style="width:${hisPct}%;opacity:.6"></div>
    </div>`;
  }

  // ── Tab buttons ──
  const tab = _duelMetierTab;
  function _tabBtn(id, icon, label, count, ca, color) {
    const active = tab === id;
    return `<button onclick="event.stopPropagation();window._duelMetierSetTab('${id}')" class="flex items-center gap-1.5 px-3 py-2 text-[11px] font-semibold rounded-lg border transition-all ${active ? 'text-white shadow-lg' : 't-primary hover:border-blue-400'}" style="${active ? `background:${color};border-color:${color}` : 'background:var(--s-card);border-color:var(--b-default)'}">
      <span>${icon}</span>
      <span>${label}</span>
      <span class="font-bold">${count}</span>
      ${ca > 0 ? `<span class="opacity-70 text-[10px]">${formatEuro(ca)}</span>` : ''}
    </button>`;
  }

  // ── Client rows ──
  const TOP = 20;

  function _clientRow(c, showHisCA, showMyCA, showGap, idx) {
    const open360 = `event.stopPropagation();if(window.openClient360)window.openClient360('${c.cc}','duel')`;
    const rowBg = idx % 2 === 0 ? '' : 'background:rgba(255,255,255,.02)';

    let cols = '';
    // Name + badge
    cols += `<td class="py-2 px-3">
      <div class="flex items-center gap-2">
        <span class="text-[11px] font-semibold t-primary cursor-pointer hover:underline" onclick="${open360}">${escapeHtml(c.nom.substring(0, 35))}</span>
        ${_classifBadge(c.classif)}
      </div>
      <div class="text-[9px] t-disabled mt-0.5">${escapeHtml(c.commercial || '—')} · ${escapeHtml(c.cp || '')} ${escapeHtml(c.ville || '')}</div>
    </td>`;

    if (showMyCA) cols += `<td class="py-2 px-2 text-[11px] text-right font-mono font-semibold" style="color:var(--c-action)">${_hasAmount(c.myCA) ? formatEuro(c.myCA) : '<span class="t-disabled">—</span>'}</td>`;
    if (showHisCA) cols += `<td class="py-2 px-2 text-[11px] text-right font-mono t-primary">${_hasAmount(c.hisCA) ? formatEuro(c.hisCA) : '<span class="t-disabled">—</span>'}</td>`;
    if (showGap) {
      const gColor = c.gap > 0 ? 'text-red-400' : c.gap < 0 ? 'text-emerald-400' : 't-disabled';
      cols += `<td class="py-2 px-2 text-[11px] text-right font-mono font-bold ${gColor}">${c.gap !== 0 ? (c.gap > 0 ? '+' : '') + formatEuro(c.gap) : '—'}</td>`;
    }

    // Wallet share bar for partages
    if (showMyCA && showHisCA) {
      cols += `<td class="py-2 px-2 w-20">${_walletBar(c.myCA, c.hisCA)}</td>`;
    }

    let row = `<tr style="border-bottom:1px solid var(--b-light);${rowBg}">${cols}</tr>`;

    // Suggested families for shared clients
    if (showGap && c.suggestedFams?.length > 0) {
      const famTags = c.suggestedFams.map(f =>
        `<span class="inline-flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded-md" style="background:#3b82f615;border:1px solid #3b82f630;color:#60a5fa">
          ${escapeHtml(f.label)} <span class="font-mono opacity-60">${formatEuro(f.ca)}</span>
        </span>`
      ).join(' ');
      row += `<tr style="${rowBg}"><td colspan="5" class="pb-2 px-3 pt-0">
        <div class="flex items-center gap-1 flex-wrap ml-0.5">
          <span class="text-[8px] t-disabled">Familles à proposer :</span>${famTags}
        </div>
      </td></tr>`;
    }

    return row;
  }

  // ── Build active tab content ──
  let tableContent = '';
  let headerRow = '';
  let activeList = [];

  if (tab === 'partages') {
    activeList = partages.slice(0, TOP);
    headerRow = `<th class="py-1.5 px-3 text-left">Client</th>
      <th class="py-1.5 px-2 text-right"><span style="color:var(--c-action)">CA Moi</span></th>
      <th class="py-1.5 px-2 text-right">CA Lui</th>
      <th class="py-1.5 px-2 text-right">Gap</th>
      <th class="py-1.5 px-2 text-center" style="min-width:60px">Part</th>`;
    tableContent = activeList.map((c, i) => _clientRow(c, true, true, true, i)).join('');
  } else if (tab === 'conquete') {
    activeList = conquete.slice(0, TOP);
    headerRow = `<th class="py-1.5 px-3 text-left">Client</th>
      <th class="py-1.5 px-2 text-right">CA chez ${escapeHtml(tgtStore)}</th>`;
    tableContent = activeList.map((c, i) => _clientRow(c, true, false, false, i)).join('');
  } else {
    activeList = fideles.slice(0, TOP);
    headerRow = `<th class="py-1.5 px-3 text-left">Client</th>
      <th class="py-1.5 px-2 text-right"><span style="color:var(--c-action)">CA Moi</span></th>`;
    tableContent = activeList.map((c, i) => _clientRow(c, false, true, false, i)).join('');
  }

  const fullList = tab === 'partages' ? partages : tab === 'conquete' ? conquete : fideles;
  const moreCount = fullList.length - activeList.length;

  // ── Assemble ──
  return `<tr><td colspan="6" class="p-0">
    <div class="mx-2 my-2 rounded-xl overflow-hidden" style="border:1.5px solid var(--c-action);background:var(--s-page)">

      <!-- Header KPIs -->
      <div class="px-4 py-3" style="background:linear-gradient(135deg, rgba(59,130,246,.10), rgba(16,185,129,.06))">
        <div class="text-[13px] font-bold t-primary mb-1">
          ${escapeHtml(metierData.metier)} — Radiographie clients
        </div>
        <div class="flex items-center gap-4 flex-wrap">
          <div class="text-[10px]">
            <span class="t-disabled">Part de portefeuille :</span>
            <span class="font-bold text-[12px] ${walletShare >= 50 ? 'text-emerald-400' : 'text-red-400'}">${walletShare}%</span>
          </div>
          <div class="text-[10px]">
            <span class="t-disabled">Potentiel récupérable :</span>
            <span class="font-bold text-[12px] text-amber-400">${formatEuro(totalGapPartages)}</span>
          </div>
          <div class="text-[10px]">
            <span class="t-disabled">CA à conquérir :</span>
            <span class="font-bold text-[12px] text-red-400">${formatEuro(totalConquest)}</span>
          </div>
          ${dormantCount > 0 ? `<div class="text-[10px] t-disabled">${dormantCount} dormants zone</div>` : ''}
        </div>
      </div>

      <!-- Tabs -->
      <div class="flex gap-2 px-4 py-3 flex-wrap" style="background:var(--bg-card)">
        ${_tabBtn('partages', '🤝', 'Partagés', partages.length, totalGapPartages, '#3b82f6')}
        ${_tabBtn('conquete', '🎯', 'À conquérir', conquete.length, totalConquest, '#ef4444')}
        ${_tabBtn('fideles', '🛡️', 'Mes fidèles', fideles.length, totalFideles, '#10b981')}
      </div>

      <!-- Table -->
      ${activeList.length === 0
        ? `<div class="text-[11px] t-disabled text-center py-6">Aucun client dans ce groupe.</div>`
        : `<table class="w-full text-left border-collapse">
          <thead><tr class="text-[9px] uppercase tracking-wider t-disabled" style="background:var(--bg-card);border-bottom:1px solid var(--b-dark)">
            ${headerRow}
          </tr></thead>
          <tbody>${tableContent}</tbody>
          ${moreCount > 0 ? `<tfoot><tr><td colspan="5" class="text-[10px] t-disabled text-center py-2" style="background:var(--bg-card)">… et ${moreCount} autres clients</td></tr></tfoot>` : ''}
        </table>`
      }
    </div>
  </td></tr>`;
}

// ═══════════════════════════════════════════════════════════════
// Mix Univers — barres face-à-face
// ═══════════════════════════════════════════════════════════════
function _buildUniversSection(duel, myStore, tgtStore) {
  const { univers, my, tgt } = duel;
  if (!univers.length) return '';

  const maxCA = Math.max(...univers.map(u => Math.max(u.myCA, u.tgtCA))) || 1;

  const rows = univers.map(u => {
    const ecartColor = u.ecart > 0 ? 'text-red-500' : u.ecart < 0 ? 'text-emerald-500' : 't-disabled';
    const myW = Math.round(u.myCA / maxCA * 100);
    const tgtW = Math.round(u.tgtCA / maxCA * 100);
    const isFiltered = _duelUniversFilter === u.nom;
    return `<tr class="border-b hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer ${isFiltered ? 'font-bold' : ''}" style="border-color:var(--b-light)" onclick="window._duelFilterUnivers('${escapeHtml(u.nom)}')">
      <td class="py-2 px-2 text-xs font-medium">${escapeHtml(u.nom)} ${isFiltered ? '<span class="text-blue-500 text-[10px]">✕</span>' : ''}</td>
      <td class="py-2 px-2 text-xs text-right font-mono">${formatEuro(u.myCA)}</td>
      <td class="py-2 px-2 text-xs text-right font-mono">${formatEuro(u.tgtCA)}</td>
      <td class="py-2 px-2 text-xs text-right font-semibold ${ecartColor}">${u.ecart > 0 ? '+' : ''}${formatEuro(u.ecart)}</td>
      <td class="py-2 px-2 w-40">
        <div class="flex items-center gap-0.5 h-4">
          <div class="flex-1 flex justify-end"><div class="h-3 rounded-sm" style="width:${myW}%;background:var(--c-action);opacity:.7;min-width:${myW > 0 ? '2px' : '0'}"></div></div>
          <div class="flex-1"><div class="h-3 rounded-sm bg-gray-400" style="width:${tgtW}%;opacity:.5;min-width:${tgtW > 0 ? '2px' : '0'}"></div></div>
        </div>
      </td>
      <td class="py-2 px-2 text-xs text-right">${u.myPct.toFixed(0)}%</td>
      <td class="py-2 px-2 text-xs text-right">${u.tgtPct.toFixed(0)}%</td>
    </tr>`;
  }).join('');

  return `<div class="s-card rounded-xl border mb-5 overflow-hidden">
    <div class="p-4 pb-2">
      <h3 class="text-sm font-bold t-primary">Mix Univers <span class="text-xs font-normal t-disabled">(cliquer pour filtrer les familles)</span></h3>
    </div>
    <div class="overflow-x-auto">
    <table class="w-full text-left border-collapse">
      <thead><tr class="text-[10px] t-disabled border-b" style="border-color:var(--b-dark);background:var(--s-page)">
        <th class="py-1.5 px-2 font-medium">Univers</th>
        <th class="py-1.5 px-2 text-right font-medium">${escapeHtml(myStore)}</th>
        <th class="py-1.5 px-2 text-right font-medium">${escapeHtml(tgtStore)}</th>
        <th class="py-1.5 px-2 text-right font-medium">Écart</th>
        <th class="py-1.5 px-2 font-medium"></th>
        <th class="py-1.5 px-2 text-right font-medium">Mix Moi</th>
        <th class="py-1.5 px-2 text-right font-medium">Mix Lui</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>
    </div>
  </div>`;
}

// ═══════════════════════════════════════════════════════════════
// Familles — top 30 avec drill-down
// ═══════════════════════════════════════════════════════════════
function _buildFamillesSection(duel, myStore, tgtStore) {
  let familles = duel.familles;
  if (_duelUniversFilter) familles = familles.filter(f => f.univers === _duelUniversFilter);

  familles = [...familles].sort((a, b) => {
    let va, vb;
    switch (_duelSort) {
      case 'ecart': va = a.ecart; vb = b.ecart; break;
      case 'ecartPct': va = a.ecartPct; vb = b.ecartPct; break;
      case 'myCA': va = a.myCA; vb = b.myCA; break;
      case 'tgtCA': va = a.tgtCA; vb = b.tgtCA; break;
      case 'myBL': va = a.myBL; vb = b.myBL; break;
      case 'tgtBL': va = a.tgtBL; vb = b.tgtBL; break;
      case 'myRefsStock': va = a.myRefsStock; vb = b.myRefsStock; break;
      case 'tgtRefsStock': va = a.tgtRefsStock; vb = b.tgtRefsStock; break;
      default: va = a.ecart; vb = b.ecart;
    }
    return _duelSortDir === 'desc' ? vb - va : va - vb;
  });

  const top = familles.slice(0, 30);
  const sortIcon = (col) => _duelSort === col ? (_duelSortDir === 'desc' ? ' ▼' : ' ▲') : '';

  const rows = top.map(f => {
    const ecartColor = f.ecart > 0 ? 'text-red-500' : f.ecart < 0 ? 'text-emerald-500' : '';
    const refsEcart = f.tgtRefsStock - f.myRefsStock;
    const refsColor = refsEcart > 0 ? 'text-red-500' : refsEcart < 0 ? 'text-emerald-500' : '';
    const isOpen = _duelOpenFam === f.fam;
    return `<tr class="border-b hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer ${isOpen ? 'font-semibold' : ''}" style="border-color:var(--b-light);${isOpen ? 'background:var(--s-page)' : ''}" onclick="window._duelToggleFam('${escapeHtml(f.fam)}')">
      <td class="py-1.5 px-2 text-xs">
        <span class="mr-1 t-disabled">${isOpen ? '▾' : '▸'}</span>
        <span class="font-medium">${escapeHtml(f.label || f.fam)}</span>
        <span class="text-[10px] t-disabled ml-1">${escapeHtml(f.fam)}</span>
      </td>
      <td class="py-1.5 px-2 text-xs text-right font-mono">${formatEuro(f.myCA)}</td>
      <td class="py-1.5 px-2 text-xs text-right font-mono">${formatEuro(f.tgtCA)}</td>
      <td class="py-1.5 px-2 text-xs text-right font-semibold ${ecartColor}">${f.ecart > 0 ? '+' : ''}${formatEuro(f.ecart)}</td>
      <td class="py-1.5 px-2 text-xs text-right">${f.myRefsStock}</td>
      <td class="py-1.5 px-2 text-xs text-right">${f.tgtRefsStock}</td>
      <td class="py-1.5 px-2 text-xs text-right font-semibold ${refsColor}">${refsEcart > 0 ? '+' : ''}${refsEcart}</td>
      <td class="py-1.5 px-2 text-xs text-right font-mono">${f.myBL}</td>
      <td class="py-1.5 px-2 text-xs text-right font-mono">${f.tgtBL}</td>
    </tr>${isOpen ? _buildDrillDown(f.fam) : ''}`;
  }).join('');

  const th = (label, col) => `<th class="py-1.5 px-2 text-right cursor-pointer select-none hover:text-blue-600 font-medium" onclick="window._duelSortBy('${col}')">${label}${sortIcon(col)}</th>`;

  const filterLabel = _duelUniversFilter ? ` — ${escapeHtml(_duelUniversFilter)} <button onclick="window._duelFilterUnivers('')" class="text-blue-500 hover:underline">✕</button>` : '';

  return `<div class="s-card rounded-xl border mb-5 overflow-hidden">
    <div class="p-4 pb-2">
      <h3 class="text-sm font-bold t-primary">Détail par famille <span class="text-xs font-normal t-disabled">(top ${top.length}/${familles.length}${filterLabel})</span></h3>
    </div>
    <div class="overflow-x-auto">
    <table class="w-full text-left border-collapse">
      <thead><tr class="text-[10px] t-disabled border-b" style="border-color:var(--b-dark);background:var(--s-page)">
        <th class="py-1.5 px-2 font-medium">Famille</th>
        ${th('CA Moi', 'myCA')}
        ${th('CA Lui', 'tgtCA')}
        ${th('Écart CA', 'ecart')}
        ${th('Stock Moi', 'myRefsStock')}
        ${th('Stock Lui', 'tgtRefsStock')}
        <th class="py-1.5 px-2 text-right font-medium">Δ Stock</th>
        ${th('BL Moi', 'myBL')}
        ${th('BL Lui', 'tgtBL')}
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>
    </div>
  </div>`;
}

// ═══════════════════════════════════════════════════════════════
// Drill-down article-level
// ═══════════════════════════════════════════════════════════════
function _buildDrillDown(famCode) {
  const myStore = _S.selectedMyStore;
  const tgtStore = _duelTarget;
  _ensureDuelAgenceStore();
  if (!_S.agenceStore?.size) return '';
  const myRec = _S.agenceStore.get(myStore);
  const tgtRec = _S.agenceStore.get(tgtStore);
  if (!myRec || !tgtRec) return '';

  const artFam = _S.articleFamille || {};
  const libLookup = _S.libelleLookup || {};
  const spm = _S.stockParMagasin || {};
  const myStock = spm[myStore] || {};
  const tgtStock = spm[tgtStore] || {};
  // Source : artMap déjà période-filtré via buildAgenceStore()
  const myVpm = myRec.artMap || {};
  const tgtVpm = tgtRec.artMap || {};
  // Index finalData pour stock actuel + MIN/MAX calculé
  const fdByCode = _getFinalDataIndex();

  const allCodes = new Set();
  for (const code in myVpm) { if (artFam[code] === famCode && /^\d{6}$/.test(code)) allCodes.add(code); }
  for (const code in tgtVpm) { if (artFam[code] === famCode && /^\d{6}$/.test(code)) allCodes.add(code); }
  for (const code in myStock) { if (artFam[code] === famCode && /^\d{6}$/.test(code)) allCodes.add(code); }
  for (const code in tgtStock) { if (artFam[code] === famCode && /^\d{6}$/.test(code)) allCodes.add(code); }

  const articles = [];
  for (const code of allCodes) {
    if (!/^\d{6}$/.test(code)) continue;
    // Source : ventesParMagasin — même source que le diagnostic article (consommé brut)
    const myD = myVpm[code];
    const tgtD = tgtVpm[code];
    const myCA = myD?.sumCA || 0;
    const tgtCA = tgtD?.sumCA || 0;
    const myBL = myD?.countBL || 0;
    const tgtBL = tgtD?.countBL || 0;
    const myStkMin = myStock[code]?.qteMin || 0;
    const myStkMax = myStock[code]?.qteMax || 0;
    const tgtStkMin = tgtStock[code]?.qteMin || 0;
    const tgtStkMax = tgtStock[code]?.qteMax || 0;
    // "Stocked" = MIN/MAX ERP > 0, OU stock physique > 0, OU MIN/MAX calculé PRISME > 0
    const fdRef = fdByCode[code];
    const myHasStock = myStkMin > 0 || myStkMax > 0 || (fdRef?.stockActuel > 0) || (fdRef?.nouveauMin > 0);
    const tgtStocked = tgtStkMin > 0 || tgtStkMax > 0;

    let cat;
    if (tgtCA > 0 && !myHasStock && myCA === 0) cat = 'manquant';
    else if (myHasStock || myCA > 0) cat = tgtCA > 0 ? 'commun' : 'exclusif';
    else if (tgtCA > 0) cat = 'manquant';
    else cat = 'commun';

    articles.push({
      code, lib: libLookup[code] || '', cat,
      myCA, tgtCA, ecart: tgtCA - myCA,
      myBL, tgtBL,
      myStkMin, myStkMax, tgtStkMin, tgtStkMax,
      myStocked: myHasStock, tgtStocked,
    });
  }

  const counts = { manquant: 0, commun: 0, exclusif: 0 };
  const caByTab = { manquant: 0, commun: 0, exclusif: 0 };
  for (const a of articles) { counts[a.cat]++; caByTab[a.cat] += a.tgtCA; }

  const filtered = articles.filter(a => a.cat === _duelDrillTab);

  filtered.sort((a, b) => {
    let va, vb;
    switch (_duelDrillSort) {
      case 'tgtCA': va = a.tgtCA; vb = b.tgtCA; break;
      case 'myCA': va = a.myCA; vb = b.myCA; break;
      case 'ecart': va = a.ecart; vb = b.ecart; break;
      case 'tgtBL': va = a.tgtBL; vb = b.tgtBL; break;
      case 'myBL': va = a.myBL; vb = b.myBL; break;
      default: va = a.tgtCA; vb = b.tgtCA;
    }
    return _duelDrillDir === 'desc' ? vb - va : va - vb;
  });

  const show = filtered.slice(0, 50);

  const tabBtn = (id, label, count, ca) => {
    const active = _duelDrillTab === id;
    return `<button onclick="window._duelDrillSetTab('${id}')" class="px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors ${active ? 'text-white' : 't-primary'}" style="${active ? 'background:var(--c-action);border-color:var(--c-action)' : 'background:var(--s-card);border-color:var(--b-default)'}">
      ${label} <span class="font-normal opacity-70">${count}</span>${ca > 0 ? ` <span class="text-[10px] font-normal opacity-70">${formatEuro(ca)}</span>` : ''}
    </button>`;
  };

  const dth = (label, col) => `<th class="py-1 px-2 text-right cursor-pointer select-none hover:text-blue-600 text-[10px] font-medium" onclick="window._duelDrillSortBy('${col}')">${label}${_duelDrillSort === col ? (_duelDrillDir === 'desc' ? ' ▼' : ' ▲') : ''}</th>`;

  const _loupe = (code) => `<span class="opacity-40 hover:opacity-100 cursor-pointer ml-1" onclick="event.stopPropagation();if(window.openArticlePanel)window.openArticlePanel('${code}','duel')">🔍</span>`;

  let tableRows;
  if (_duelDrillTab === 'manquant') {
    tableRows = show.map(a => `<tr class="border-b hover:bg-gray-50 dark:hover:bg-gray-800" style="border-color:var(--b-light)">
      <td class="py-1 px-2 text-xs font-mono">${a.code} ${_loupe(a.code)}</td>
      <td class="py-1 px-2 text-xs max-w-[200px] truncate">${escapeHtml(a.lib)}</td>
      <td class="py-1 px-2 text-xs text-right font-mono">${formatEuro(a.tgtCA)}</td>
      <td class="py-1 px-2 text-xs text-right">${a.tgtBL}</td>
      <td class="py-1 px-2 text-xs text-right t-secondary">${a.tgtStkMin}/${a.tgtStkMax}</td>
    </tr>`).join('');
  } else if (_duelDrillTab === 'commun') {
    tableRows = show.map(a => {
      const ecColor = a.ecart > 0 ? 'text-red-500' : a.ecart < 0 ? 'text-emerald-500' : '';
      return `<tr class="border-b hover:bg-gray-50 dark:hover:bg-gray-800" style="border-color:var(--b-light)">
      <td class="py-1 px-2 text-xs font-mono">${a.code} ${_loupe(a.code)}</td>
      <td class="py-1 px-2 text-xs max-w-[180px] truncate">${escapeHtml(a.lib)}</td>
      <td class="py-1 px-2 text-xs text-right font-mono">${formatEuro(a.myCA)}</td>
      <td class="py-1 px-2 text-xs text-right font-mono">${formatEuro(a.tgtCA)}</td>
      <td class="py-1 px-2 text-xs text-right font-semibold ${ecColor}">${a.ecart > 0 ? '+' : ''}${formatEuro(a.ecart)}</td>
      <td class="py-1 px-2 text-xs text-right">${a.myBL} / ${a.tgtBL}</td>
    </tr>`;
    }).join('');
  } else {
    tableRows = show.map(a => `<tr class="border-b hover:bg-gray-50 dark:hover:bg-gray-800" style="border-color:var(--b-light)">
      <td class="py-1 px-2 text-xs font-mono">${a.code} ${_loupe(a.code)}</td>
      <td class="py-1 px-2 text-xs max-w-[200px] truncate">${escapeHtml(a.lib)}</td>
      <td class="py-1 px-2 text-xs text-right font-mono">${formatEuro(a.myCA)}</td>
      <td class="py-1 px-2 text-xs text-right">${a.myBL}</td>
      <td class="py-1 px-2 text-xs text-right t-secondary">${a.myStkMin}/${a.myStkMax}</td>
    </tr>`).join('');
  }

  let headerRow;
  if (_duelDrillTab === 'manquant') {
    headerRow = `<th class="py-1 px-2 text-[10px] font-medium">Code</th><th class="py-1 px-2 text-[10px] font-medium">Libellé</th>
      ${dth('CA ' + tgtStore, 'tgtCA')}${dth('BL', 'tgtBL')}<th class="py-1 px-2 text-right text-[10px] font-medium">MIN/MAX</th>`;
  } else if (_duelDrillTab === 'commun') {
    headerRow = `<th class="py-1 px-2 text-[10px] font-medium">Code</th><th class="py-1 px-2 text-[10px] font-medium">Libellé</th>
      ${dth('CA Moi', 'myCA')}${dth('CA Lui', 'tgtCA')}${dth('Écart', 'ecart')}<th class="py-1 px-2 text-right text-[10px] font-medium">BL Moi/Lui</th>`;
  } else {
    headerRow = `<th class="py-1 px-2 text-[10px] font-medium">Code</th><th class="py-1 px-2 text-[10px] font-medium">Libellé</th>
      ${dth('CA Moi', 'myCA')}${dth('BL', 'myBL')}<th class="py-1 px-2 text-right text-[10px] font-medium">MIN/MAX</th>`;
  }

  return `<tr><td colspan="9" class="p-0">
    <div class="border-l-4 p-3 m-1 rounded-r-lg" style="border-color:var(--c-action);background:var(--s-card)">
      <div class="flex items-center gap-3 mb-3 flex-wrap">
        <h4 class="text-sm font-bold t-primary">${escapeHtml(famLib(famCode))} <span class="text-xs font-normal t-disabled">${famCode}</span></h4>
        <div class="flex-1"></div>
      </div>
      <div class="flex gap-2 mb-3">
        ${tabBtn('manquant', 'Pas chez moi', counts.manquant, caByTab.manquant)}
        ${tabBtn('commun', 'Articles communs', counts.commun, 0)}
        ${tabBtn('exclusif', 'Mes exclusifs', counts.exclusif, 0)}
      </div>
      ${filtered.length === 0
        ? `<div class="text-xs t-secondary py-4 text-center">Aucun article dans cette catégorie.</div>`
        : `<div class="overflow-x-auto"><table class="w-full text-left border-collapse">
        <thead><tr class="border-b t-disabled" style="border-color:var(--b-dark)">${headerRow}</tr></thead>
        <tbody>${tableRows}</tbody>
        ${show.length < filtered.length ? `<tfoot><tr><td colspan="7" class="text-xs t-disabled text-center py-2">… et ${filtered.length - show.length} autres</td></tr></tfoot>` : ''}
      </table></div>`
      }
    </div>
  </td></tr>`;
}

// ── Handlers ──
window._duelSelectTarget = function(val) {
  _duelTarget = val;
  _duelOpenFam = '';
  _duelShowAllMetiers = false;
  _duelAuditOpen = false;
  renderDuelTab();
};

window._duelSortBy = function(col) {
  if (_duelSort === col) _duelSortDir = _duelSortDir === 'desc' ? 'asc' : 'desc';
  else { _duelSort = col; _duelSortDir = 'desc'; }
  renderDuelTab();
};

window._duelFilterUnivers = function(u) {
  _duelUniversFilter = _duelUniversFilter === u ? '' : u;
  _duelOpenFam = '';
  renderDuelTab();
};

window._duelSetUnivers = function(u) {
  _duelUniversFilter = u || '';
  _duelOpenFam = '';
  renderDuelTab();
};

window._duelOpenPlanFam = function(univers, fam) {
  _duelUniversFilter = univers || '';
  _duelOpenFam = fam || '';
  _duelAuditOpen = true;
  _duelDrillTab = 'manquant';
  _duelDrillSort = 'tgtCA';
  _duelDrillDir = 'desc';
  renderDuelTab();
};

window._duelToggleFam = function(fam) {
  if (_duelOpenFam === fam) { _duelOpenFam = ''; }
  else { _duelOpenFam = fam; _duelAuditOpen = true; _duelDrillTab = 'manquant'; _duelDrillSort = 'tgtCA'; _duelDrillDir = 'desc'; }
  renderDuelTab();
};

window._duelAuditOpenSet = function(isOpen) {
  _duelAuditOpen = !!isOpen;
};

window._duelDrillSetTab = function(tab) {
  _duelDrillTab = tab;
  _duelDrillSort = tab === 'manquant' ? 'tgtCA' : tab === 'commun' ? 'ecart' : 'myCA';
  _duelDrillDir = 'desc';
  renderDuelTab();
};

window._duelDrillSortBy = function(col) {
  if (_duelDrillSort === col) _duelDrillDir = _duelDrillDir === 'desc' ? 'asc' : 'desc';
  else { _duelDrillSort = col; _duelDrillDir = 'desc'; }
  renderDuelTab();
};

window._duelToggleAllMetiers = function() {
  _duelShowAllMetiers = !_duelShowAllMetiers;
  renderDuelTab();
};

window._duelToggleMetier = function(metier) {
  if (_duelOpenMetier === metier) { _duelOpenMetier = ''; }
  else { _duelOpenMetier = metier; _duelMetierTab = 'partages'; }
  renderDuelTab();
};

window._duelMetierSetTab = function(tab) {
  _duelMetierTab = tab;
  renderDuelTab();
};

window.renderDuelTab = renderDuelTab;
