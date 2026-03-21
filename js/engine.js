// ═══════════════════════════════════════════════════════════════
// PILOT PRO — engine.js
// Moteur de calcul métier
// Dépend de : constants.js, utils.js, state.js
// ═══════════════════════════════════════════════════════════════
'use strict';

// ── Prix Unitaire avec fallback consommé ──────────────────────
// Quand un article est en rupture (stock=0), la valeur PRMP = 0.
// On enrichit le PU depuis le CA consommé (sumCA / sumPrelevee).
function enrichPrixUnitaire() {
  const mySk = selectedMyStore || Object.keys(ventesParMagasin)[0] || '';
  for (const r of finalData) {
    if (r.prixUnitaire > 0) continue;
    // Fallback 1: PU from own store's consommé
    const myV = ventesParMagasin[mySk]?.[r.code];
    if (myV && myV.sumPrelevee > 0 && myV.sumCA > 0) {
      r.prixUnitaire = Math.round(myV.sumCA / myV.sumPrelevee * 100) / 100;
      continue;
    }
    // Fallback 2: PU from any other store (multi-agence)
    for (const sk of Object.keys(ventesParMagasin)) {
      if (sk === mySk) continue;
      const sv = ventesParMagasin[sk]?.[r.code];
      if (sv && sv.sumPrelevee > 0 && sv.sumCA > 0) {
        r.prixUnitaire = Math.round(sv.sumCA / sv.sumPrelevee * 100) / 100;
        break;
      }
    }
  }
}

// ── CA perdu estimé — UNE SEULE formule, appelée partout ──────
// Remplace les 4+ formules inline : (r.V/globalJoursOuvres)*jours*r.prixUnitaire
function estimerCAPerdu(V, prixUnitaire, jours) {
  if (globalJoursOuvres <= 0 || V <= 0 || prixUnitaire <= 0) return 0;
  return Math.round((V / globalJoursOuvres) * jours * prixUnitaire);
}

// ── Priority score composite ──────────────────────────────────
// Fréq × PU × coeff ancienneté
function calcPriorityScore(freq, pu, ageJours) {
  const caPerdu = freq * pu;
  let ageCoeff = 1;
  if (ageJours < 30) ageCoeff = 0.8;
  else if (ageJours < 90) ageCoeff = 1;
  else if (ageJours < 180) ageCoeff = 1.2;
  else ageCoeff = 1.5;
  return Math.round(caPerdu * ageCoeff);
}

function prioClass(score) {
  if (score >= 5000) return 'prio-critical';
  if (score >= 1000) return 'prio-high';
  if (score >= 300) return 'prio-medium';
  return 'prio-low';
}

function prioLabel(score) {
  if (score >= 5000) return '🔴';
  if (score >= 1000) return '🟠';
  if (score >= 300) return '🟡';
  return '⚪';
}

// ── Détection référence père ──────────────────────────────────
// Toutes les 3 dates vides → référence père (exclue des ruptures)
function isParentRef(row) {
  const d1 = getVal(row, 'dernière sortie', 'sortie');
  const d2 = getVal(row, 'première entrée', 'premiere entree', 'première réception');
  const d3 = getVal(row, 'dernière entrée', 'entrée');
  function isEmpty(v) { if (!v) return true; const s = v.toString().trim(); return s === '' || s === '-' || s === '0' || s === 'NaN'; }
  return isEmpty(d1) && isEmpty(d2) && isEmpty(d3);
}

// ── ABC/FMR classification ────────────────────────────────────
function computeABCFMR(data) {
  const active = data.filter(r => r.W >= 1);
  active.sort((a, b) => (b.V * b.prixUnitaire) - (a.V * a.prixUnitaire));
  const totalRot = active.reduce((s, r) => s + r.V * r.prixUnitaire, 0);
  let cumul = 0;
  const abcMap = {};
  for (const r of active) {
    cumul += r.V * r.prixUnitaire;
    const p = totalRot > 0 ? cumul / totalRot : 1;
    abcMap[r.code] = p <= 0.8 ? 'A' : p <= 0.95 ? 'B' : 'C';
  }
  for (const r of data) {
    if (r.W >= 1) {
      r.abcClass = abcMap[r.code] || 'C';
      r.fmrClass = r.W >= 12 ? 'F' : r.W >= 4 ? 'M' : 'R';
    } else {
      r.abcClass = ''; r.fmrClass = '';
    }
  }
  const totalStockVal = data.reduce((s, r) => r.stockActuel > 0 ? s + r.stockActuel * r.prixUnitaire : s, 0);
  const mx = {};
  for (const abc of ['A', 'B', 'C']) for (const fmr of ['F', 'M', 'R']) {
    const key = abc + fmr, items = data.filter(r => r.abcClass === abc && r.fmrClass === fmr);
    const sv = items.reduce((s, r) => r.stockActuel > 0 ? s + r.stockActuel * r.prixUnitaire : s, 0);
    mx[key] = { count: items.length, stockVal: sv, pctTotal: totalStockVal > 0 ? sv / totalStockVal * 100 : 0 };
  }
  abcMatrixData = mx;
}

// ── Radar: recalcul matrice sur données filtrées ──────────────
function _radarComputeMatrix(data) {
  const totalStock = data.reduce((s, r) => s + r.stockActuel * r.prixUnitaire, 0) || 1;
  const mx = {};
  for (const abc of ['A', 'B', 'C']) for (const fmr of ['F', 'M', 'R']) {
    const key = abc + fmr, items = data.filter(r => r.abcClass === abc && r.fmrClass === fmr);
    const stockVal = items.reduce((s, r) => s + r.stockActuel * r.prixUnitaire, 0);
    mx[key] = { count: items.length, stockVal, pctTotal: (stockVal / totalStock) * 100 };
  }
  return mx;
}

// ── Couverture jours ──────────────────────────────────────────
function calcCouverture(stock, V) {
  if (V <= 0 || stock <= 0) return 999;
  return Math.round(stock / (V / globalJoursOuvres));
}

function formatCouv(j) { if (j >= 999) return '—'; return j + 'j'; }

function couvColor(j) {
  if (j >= 999) return 'text-gray-400';
  if (j <= 7) return 'text-red-600 font-extrabold';
  if (j <= 21) return 'text-orange-600 font-bold';
  if (j <= 60) return 'text-green-600';
  return 'text-blue-500';
}

// ── Client classification helpers ─────────────────────────────
function _isGlobalActif(info) {
  const aG = (info.activiteGlobale || info.activite || '').toLowerCase();
  const s = (info.statut || '').toLowerCase();
  return aG.includes('actif') || (s.includes('actif') && !s.includes('inactif'));
}

function _isPDVActif(cc) {
  const art = ventesClientArticle.get(cc);
  return art && art.size > 0;
}

function _isPerdu(info) {
  const s = _normalizeStatut(info.statut);
  return s === 'Inactif' || s === 'Perdu';
}

function _isProspect(info) { return _normalizeStatut(info.statut) === 'Prospect'; }

function _isPerdu24plus(info) { return _isPerdu(info) && !(info.ca2025 || 0) && !(info.ca2026 || 0); }

// ── Croisement consommé × chalandise ──────────────────────────
function computeClientCrossing() {
  if (!chalandiseReady || !clientsMagasin.size) { crossingStats = null; return; }
  const fideles = new Set(), potentiels = new Set(), captes = new Set();
  for (const cc of clientsMagasin) {
    if (chalandiseData.has(cc)) captes.add(cc); else fideles.add(cc);
  }
  for (const [cc, info] of chalandiseData.entries()) {
    if (!clientsMagasin.has(cc)) {
      const s = (info.statut || '').toLowerCase();
      if (s.includes('actif') && !s.includes('inactif')) potentiels.add(cc);
    }
  }
  crossingStats = { fideles, potentiels, captes };
}

function _crossBadge(cc) {
  if (!crossingStats) return '';
  if (crossingStats.captes.has(cc)) return '<span class="ml-0.5 text-[10px]" title="Capté — dans la zone chalandise et venu en agence">🟢</span>';
  if (crossingStats.potentiels.has(cc)) return '<span class="ml-0.5 text-[10px]" title="Potentiel non capté — dans la zone, n\'est pas encore venu en agence">🔴</span>';
  if (crossingStats.fideles.has(cc)) return '<span class="ml-0.5 text-[10px]" title="Fidèle hors zone — vient en agence malgré la distance">🟣</span>';
  return '';
}

function _passesClientCrossFilter(cc) {
  if (!_selectedCrossStatus || !crossingStats) return true;
  if (_selectedCrossStatus === 'fidele') return crossingStats.fideles.has(cc);
  if (_selectedCrossStatus === 'capte') return crossingStats.captes.has(cc);
  if (_selectedCrossStatus === 'potentiel') return crossingStats.potentiels.has(cc);
  return true;
}

// ── Filtres chalandise ────────────────────────────────────────
function clientMatchesDeptFilter(info) {
  if (!_selectedDepts.size) return true;
  const dept = (info.cp || '').toString().slice(0, 2);
  return _selectedDepts.has(dept);
}

function clientMatchesClassifFilter(info) {
  if (!_selectedClassifs.size) return true;
  return _selectedClassifs.has(_normalizeClassif(info.classification));
}

function clientMatchesStatutFilter(info) {
  if (!_selectedStatuts.size) return true;
  return _selectedStatuts.has(_normalizeStatut(info.statut));
}

function clientMatchesActivitePDVFilter(info) {
  if (!_selectedActivitesPDV.size) return true;
  return _selectedActivitesPDV.has(info.activitePDV || '');
}

function clientMatchesCommercialFilter(info) {
  if (!_selectedCommercial) return true;
  return (info.commercial || '') === _selectedCommercial;
}

function clientMatchesMetierFilter(info) {
  if (!_selectedMetier) return true;
  return (info.metier || '') === _selectedMetier;
}

function _clientPassesFilters(info) {
  if (_filterStrategiqueOnly && !_isMetierStrategique(info.metier)) return false;
  return clientMatchesDeptFilter(info) && clientMatchesClassifFilter(info) &&
    clientMatchesActivitePDVFilter(info) && clientMatchesCommercialFilter(info) &&
    clientMatchesMetierFilter(info);
}

// ── Diagnostic helpers ────────────────────────────────────────
function _diagClientPrio(info, famCA) {
  const s = (info.statut || '').toLowerCase();
  const aG = (info.activiteGlobale || info.activite || '').toLowerCase();
  const isGlobalActif = aG.includes('actif') || (s.includes('actif') && !s.includes('inactif'));
  const isPDVActif = famCA > 0;
  if (isGlobalActif && !isPDVActif) return 1;
  if (s.includes('inactif') && s.includes('2026') && !s.includes('2025')) return 2;
  if (s.includes('inactif') || s.includes('perdu')) return 3;
  if (s.includes('prospect')) return 4;
  if (isGlobalActif && isPDVActif) return 5;
  return 4;
}

function _diagClassifPrio(c) {
  const u = (c || '').toUpperCase();
  if (u.includes('FID') && u.includes('POT+')) return 0;
  if (u.includes('OCC') && u.includes('POT+')) return 1;
  if (u.includes('POT-')) return 2;
  return 3;
}

function _diagClassifBadge(c) {
  const u = (c || '').toUpperCase();
  if (u.includes('FID') && u.includes('POT+')) return `<span class="text-[9px] font-bold px-1.5 py-0.5 rounded bg-emerald-900/60 text-emerald-400">${c}</span>`;
  if (u.includes('OCC') && u.includes('POT+')) return `<span class="text-[9px] font-bold px-1.5 py-0.5 rounded bg-blue-900/60 text-blue-400">${c}</span>`;
  if (u.includes('POT-')) return `<span class="text-[9px] font-bold px-1.5 py-0.5 rounded bg-slate-700 text-slate-400">${c}</span>`;
  if (c && c !== '—') return `<span class="text-[9px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-500">${c}</span>`;
  return '<span class="text-slate-600 text-[9px]">—</span>';
}
