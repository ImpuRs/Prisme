// © 2026 Jawad El Barkaoui — Tous droits réservés
// PRISME — Outil d'analyse BI pour distribution B2B
// Développé sur initiative et temps personnel
// Contact : Jawad EL BARKAOUI
// ═══════════════════════════════════════════════════════════════
// PRISME — engine.js
// Moteur de calcul métier
// Dépend de : constants.js, utils.js, state.js
// ═══════════════════════════════════════════════════════════════
'use strict';
import { _S } from './state.js';
import { getVal, _normalizeStatut, _isMetierStrategique, _normalizeClassif } from './utils.js';


// ── Prix Unitaire avec fallback consommé ──────────────────────
// Quand un article est en rupture (stock=0), la valeur PRMP = 0.
// On enrichit le PU depuis le CA consommé (sumCA / sumPrelevee).
export function enrichPrixUnitaire() {
  const mySk = _S.selectedMyStore || Object.keys(_S.ventesParMagasin)[0] || '';
  for (const r of _S.finalData) {
    if (r.prixUnitaire > 0) continue;
    // Fallback 1: PU from own store's consommé
    const myV = _S.ventesParMagasin[mySk]?.[r.code];
    if (myV && myV.sumPrelevee > 0 && myV.sumCA > 0) {
      r.prixUnitaire = Math.round(myV.sumCA / myV.sumPrelevee * 100) / 100;
      continue;
    }
    // Fallback 2: PU from any other store (multi-agence)
    for (const sk of Object.keys(_S.ventesParMagasin)) {
      if (sk === mySk) continue;
      const sv = _S.ventesParMagasin[sk]?.[r.code];
      if (sv && sv.sumPrelevee > 0 && sv.sumCA > 0) {
        r.prixUnitaire = Math.round(sv.sumCA / sv.sumPrelevee * 100) / 100;
        break;
      }
    }
  }
}

// ── CA perdu estimé — UNE SEULE formule, appelée partout ──────
// Remplace les 4+ formules inline : (r.V/_S.globalJoursOuvres)*jours*r.prixUnitaire
export function estimerCAPerdu(V, prixUnitaire, jours) {
  if (_S.globalJoursOuvres <= 0 || V <= 0 || prixUnitaire <= 0) return 0;
  return Math.round((V / _S.globalJoursOuvres) * jours * prixUnitaire);
}

// ── Priority score composite ──────────────────────────────────
// Fréq × PU × coeff ancienneté
export function calcPriorityScore(freq, pu, ageJours) {
  const caPerdu = freq * pu;
  let ageCoeff = 1;
  if (ageJours < 30) ageCoeff = 0.8;
  else if (ageJours < 90) ageCoeff = 1;
  else if (ageJours < 180) ageCoeff = 1.2;
  else ageCoeff = 1.5;
  return Math.round(caPerdu * ageCoeff);
}

export function prioClass(score) {
  if (score >= 5000) return 'prio-critical';
  if (score >= 1000) return 'prio-high';
  if (score >= 300) return 'prio-medium';
  return 'prio-low';
}

export function prioLabel(score) {
  if (score >= 5000) return '🔴';
  if (score >= 1000) return '🟠';
  if (score >= 300) return '🟡';
  return '⚪';
}

// ── Détection référence père ──────────────────────────────────
// Toutes les 3 dates vides → référence père (exclue des ruptures)
export function isParentRef(row) {
  const d1 = getVal(row, 'dernière sortie', 'sortie');
  const d2 = getVal(row, 'première entrée', 'premiere entree', 'première réception');
  const d3 = getVal(row, 'dernière entrée', 'entrée');
  function isEmpty(v) { if (!v) return true; const s = v.toString().trim(); return s === '' || s === '-' || s === '0' || s === 'NaN'; }
  return isEmpty(d1) && isEmpty(d2) && isEmpty(d3);
}

// ── ABC/FMR classification ────────────────────────────────────
export function computeABCFMR(data) {
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
  _S.abcMatrixData = mx;
}

// ── Radar: recalcul matrice sur données filtrées ──────────────
export function _radarComputeMatrix(data) {
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
export function calcCouverture(stock, V) {
  if (V <= 0 || stock <= 0) return 999;
  return Math.round(stock / (V / _S.globalJoursOuvres));
}

export function formatCouv(j) { if (j >= 999) return '—'; return j + 'j'; }

export function couvColor(j) {
  if (j >= 999) return 'c-muted';
  if (j <= 7) return 'c-danger font-extrabold';  // rupture imminente — perte d'argent
  if (j <= 21) return 'c-caution font-bold';     // stock bas — à surveiller
  if (j <= 60) return 'c-ok';                    // couverture saine
  return 'c-muted';                              // surstock — informatif seulement
}

// ── Client classification helpers ─────────────────────────────
export function _isGlobalActif(info) {
  const aG = (info.activiteGlobale || info.activite || '').toLowerCase();
  const s = (info.statut || '').toLowerCase();
  return aG.includes('actif') || (s.includes('actif') && !s.includes('inactif'));
}

export function _isPDVActif(cc) {
  const art = _S.ventesClientArticle.get(cc);
  return art && art.size > 0;
}

export function _isPerdu(info) {
  const s = _normalizeStatut(info.statut);
  return s === 'Inactif' || s === 'Perdu';
}

export function _isProspect(info) { return _normalizeStatut(info.statut) === 'Prospect'; }

export function _isPerdu24plus(info) { return _isPerdu(info) && !(info.ca2025 || 0) && !(info.ca2026 || 0); }

// ── Croisement consommé × chalandise ──────────────────────────
export function computeClientCrossing() {
  if (!_S.chalandiseReady || !_S.clientsMagasin.size) { _S.crossingStats = null; return; }
  const fideles = new Set(), potentiels = new Set(), captes = new Set();
  for (const cc of _S.clientsMagasin) {
    if (_S.chalandiseData.has(cc)) captes.add(cc); else fideles.add(cc);
  }
  for (const [cc, info] of _S.chalandiseData.entries()) {
    if (!_S.clientsMagasin.has(cc)) {
      const s = (info.statut || '').toLowerCase();
      if (s.includes('actif') && !s.includes('inactif')) potentiels.add(cc);
    }
  }
  _S.crossingStats = { fideles, potentiels, captes };
}

export function _clientUrgencyScore(cc, info) {
  const caLeg = info.ca2025 || 0;
  const pdvActif = _S.ventesClientArticle.has(cc) && _S.ventesClientArticle.get(cc).size > 0;
  const globalActif = _isGlobalActif(info);
  const classif = _normalizeClassif(info.classification);
  const isFidPlus = classif === 'FID Pot+';
  const isOccPlus = classif === 'OCC Pot+';
  const isStrategique = _isMetierStrategique(info.metier);
  let score = caLeg;
  if (globalActif && !pdvActif) score *= 3;
  else if (_isPerdu(info) && caLeg > 0) score *= 2;
  else if (_isPerdu(info)) score *= 0.5;
  if (isFidPlus) score *= 2;
  else if (isOccPlus) score *= 1.5;
  if (isStrategique) score *= 1.3;
  return Math.round(score);
}

export function _clientStatusBadge(cc, info) {
  const pdvActif = _S.ventesClientArticle.has(cc) && _S.ventesClientArticle.get(cc).size > 0;
  const globalActif = _isGlobalActif(info);
  if (pdvActif) return '<span class="text-[9px] font-bold px-1.5 py-0.5 rounded bg-green-100 text-green-700 ml-1">Actif PDV</span>';
  if (globalActif) return '<span class="text-[9px] font-bold px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 ml-1">Actif Leg.</span>';
  if (_isProspect(info)) return '<span class="text-[9px] font-bold px-1.5 py-0.5 rounded bg-gray-100 text-gray-500 ml-1">Prospect</span>';
  if (_isPerdu(info) && (info.ca2025 || 0) > 0) return '<span class="text-[9px] font-bold px-1.5 py-0.5 rounded bg-orange-100 text-orange-700 ml-1">Perdu 12-24m</span>';
  return '<span class="text-[9px] font-bold px-1.5 py-0.5 rounded bg-red-100 text-red-700 ml-1">Inactif</span>';
}

export function _clientStatusText(cc, info) {
  const pdvActif = _S.ventesClientArticle.has(cc) && _S.ventesClientArticle.get(cc).size > 0;
  const globalActif = _isGlobalActif(info);
  if (pdvActif) return 'Actif PDV';
  if (globalActif) return 'Actif Leg.';
  if (_isProspect(info)) return 'Prospect';
  if (_isPerdu(info) && (info.ca2025 || 0) > 0) return 'Perdu 12-24m';
  return 'Inactif';
}

export function _unikLink(code) {
  if (!code || !/^\d{6}$/.test(String(code))) return '';
  return `<a href="https://unik.legallais.com/app/customer/${code}/orders" target="_blank" rel="noopener" onclick="event.stopPropagation()" title="Voir commandes Unik" style="text-decoration:none;font-size:10px;line-height:1;vertical-align:middle" class="ml-0.5 text-blue-400 hover:text-blue-300">🔗</a>`;
}

export function _crossBadge(cc) {
  if (!_S.crossingStats) return '';
  if (_S.crossingStats.captes.has(cc)) return '<span class="ml-0.5 text-[10px]" title="Capté — dans la zone chalandise et venu en agence">🟢</span>';
  if (_S.crossingStats.potentiels.has(cc)) return '<span class="ml-0.5 text-[10px]" title="Potentiel non capté — dans la zone, n\'est pas encore venu en agence">🔴</span>';
  if (_S.crossingStats.fideles.has(cc)) return '<span class="ml-0.5 text-[10px]" title="Fidèle hors zone — vient en agence malgré la distance">🟣</span>';
  return '';
}

export function _passesClientCrossFilter(cc) {
  if (!_S._selectedCrossStatus || !_S.crossingStats) return true;
  if (_S._selectedCrossStatus === 'fidele') return _S.crossingStats.fideles.has(cc);
  if (_S._selectedCrossStatus === 'capte') return _S.crossingStats.captes.has(cc);
  if (_S._selectedCrossStatus === 'potentiel') return _S.crossingStats.potentiels.has(cc);
  return true;
}

// ── Filtres chalandise ────────────────────────────────────────
export function clientMatchesDeptFilter(info) {
  if (!_S._selectedDepts.size) return true;
  const dept = (info.cp || '').toString().slice(0, 2);
  return _S._selectedDepts.has(dept);
}

export function clientMatchesClassifFilter(info) {
  if (!_S._selectedClassifs.size) return true;
  return _S._selectedClassifs.has(_normalizeClassif(info.classification));
}

export function clientMatchesStatutFilter(info) {
  if (!_S._selectedStatuts.size) return true;
  return _S._selectedStatuts.has(_normalizeStatut(info.statut));
}

export function clientMatchesActivitePDVFilter(info) {
  if (!_S._selectedActivitesPDV.size) return true;
  return _S._selectedActivitesPDV.has(info.activitePDV || '');
}

export function clientMatchesCommercialFilter(info) {
  if (!_S._selectedCommercial) return true;
  return (info.commercial || '') === _S._selectedCommercial;
}

export function clientMatchesMetierFilter(info) {
  if (!_S._selectedMetier) return true;
  return (info.metier || '') === _S._selectedMetier;
}

export function _clientPassesFilters(info) {
  if (_S._filterStrategiqueOnly && !_isMetierStrategique(info.metier)) return false;
  return clientMatchesDeptFilter(info) && clientMatchesClassifFilter(info) &&
    clientMatchesActivitePDVFilter(info) && clientMatchesCommercialFilter(info) &&
    clientMatchesMetierFilter(info);
}

// ── Diagnostic helpers ────────────────────────────────────────
export function _diagClientPrio(info, famCA) {
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

export function _diagClassifPrio(c) {
  const u = (c || '').toUpperCase();
  if (u.includes('FID') && u.includes('POT+')) return 0;
  if (u.includes('OCC') && u.includes('POT+')) return 1;
  if (u.includes('POT-')) return 2;
  return 3;
}

export function _diagClassifBadge(c) {
  const u = (c || '').toUpperCase();
  if (u.includes('FID') && u.includes('POT+')) return `<span class="text-[9px] font-bold px-1.5 py-0.5 rounded bg-emerald-900/60 text-emerald-400">${c}</span>`;
  if (u.includes('OCC') && u.includes('POT+')) return `<span class="text-[9px] font-bold px-1.5 py-0.5 rounded bg-blue-900/60 text-blue-400">${c}</span>`;
  if (u.includes('POT-')) return `<span class="text-[9px] font-bold px-1.5 py-0.5 rounded bg-slate-700 text-slate-400">${c}</span>`;
  if (c && c !== '—') return `<span class="text-[9px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-500">${c}</span>`;
  return '<span class="text-slate-600 text-[9px]">—</span>';
}

// ── Decision Queue — génération (Sprint 1) ────────────────────
// Produit 3–7 décisions triées par priorité de catégorie, puis impact€.
// L'ordre de catégorie est FIXE (rupture > client > dormants > anomalie).
// Le tri par €  ne s'applique QU'À L'INTÉRIEUR d'une même catégorie.
// Stocke le résultat dans _S.decisionQueueData.
export function generateDecisionQueue() {
  const decisions = [];
  if (!_S.finalData.length) { _S.decisionQueueData = decisions; return; }

  // Priorité de catégorie : 0 = plus urgent
  const TYPE_PRIORITY = { rupture: 0, alerte_prev: 1, client: 2, dormants: 3, anomalie_minmax: 4, sain: 99 };

  // ── 1. Ruptures (W≥3, stock≤0, top 3 par CA annuel W×PU) ──────────────
  // PAS de filtre par score — toute rupture d'article fréquent est urgente.
  const critRupt = _S.finalData
    .filter(r => r.W >= 3 && r.stockActuel <= 0 && !r.isParent && !(r.V === 0 && r.enleveTotal > 0))
    .map(r => ({ r, impact: r.W * r.prixUnitaire }))
    .sort((a, b) => b.impact - a.impact)
    .slice(0, 3);

  for (const { r, impact } of critRupt) {
    const semCA = Math.round(impact / 52);
    const qteSugg = Math.max((r.nouveauMax || 1) - r.stockActuel, r.nouveauMax || 1);
    decisions.push({
      type: 'rupture', code: r.code, lib: r.libelle, famille: r.famille, fmrClass: r.fmrClass,
      impact, qteSugg,
      label: `Commander ${r.W} × réf. ${r.code} — rupture active, ~${semCA.toLocaleString('fr')} €/sem.`,
      why: [
        `Stock actuel : ${r.stockActuel} u. (sous le MIN de ${r.nouveauMin})`,
        `Fréquence : ${r.W} commandes/an — article ${r.fmrClass || '?'}`,
        `CA annuel à risque : ${impact.toLocaleString('fr')} €`,
      ],
    });
  }

  // ── 2. Clients stratégiques inactifs >30j (si chalandise chargée, top 2) ──
  if (_S.chalandiseReady && _S.clientLastOrder.size) {
    const now = new Date();
    const inactive = [];
    for (const [cc, lastDate] of _S.clientLastOrder.entries()) {
      const info = _S.chalandiseData.get(cc);
      if (!info || !_isMetierStrategique(info.metier)) continue;
      const daysAgo = Math.round((now - lastDate) / 86400000);
      if (daysAgo < 30) continue;
      const caAnnuel = info.ca2025 || info.ca2026 || 0;
      inactive.push({ cc, nom: info.nom || cc, daysAgo, weeksAgo: Math.round(daysAgo / 7), caAnnuel });
    }
    inactive.sort((a, b) => b.caAnnuel - a.caAnnuel);
    for (const c of inactive.slice(0, 2)) {
      decisions.push({
        type: 'client', code: c.cc, impact: c.caAnnuel,
        label: `Appeler client ${c.nom} — disparu ${c.weeksAgo} sem., ${Math.round(c.caAnnuel).toLocaleString('fr')} € annuel.`,
        why: [
          `Dernière commande PDV : il y a ${c.daysAgo} jours`,
          `CA annuel Legallais : ${Math.round(c.caAnnuel).toLocaleString('fr')} €`,
          `Métier stratégique — fort potentiel de reconquête`,
        ],
      });
    }
  }

  // ── 3. Dormants (≥3 articles, valeur >500€) — capital immobilisé ──────
  const DORMANT_THRESHOLD = 365; // jours sans mouvement
  const dormants = _S.finalData.filter(r =>
    r.stockActuel > 0 && r.prixUnitaire > 0 && !r.isNouveaute && r.ageJours > DORMANT_THRESHOLD
  );
  const dormantVal = dormants.reduce((s, r) => s + r.stockActuel * r.prixUnitaire, 0);
  if (dormants.length >= 3 && dormantVal > 500) {
    const avgMonths = dormants.length > 0
      ? Math.round(dormants.reduce((s, r) => s + r.ageJours, 0) / dormants.length / 30) : 0;
    decisions.push({
      type: 'dormants', impact: dormantVal,
      label: `Sortir ${dormants.length} réfs dormantes — immobilisent ${Math.round(dormantVal).toLocaleString('fr')} € depuis ~${avgMonths} mois.`,
      why: [
        `${dormants.length} articles sans mouvement depuis plus de 12 mois`,
        `Valeur stock immobilisée : ${Math.round(dormantVal).toLocaleString('fr')} €`,
        `Âge moyen du stock dormant : ~${avgMonths} mois`,
      ],
    });
  }

  // ── 4. Anomalies MIN/MAX (≥5 articles actifs sans seuil ERP) ──────────
  const anomalies = _S.finalData.filter(r =>
    r.stockActuel > 0 && r.ancienMin === 0 && r.ancienMax === 0 && !r.isNouveaute && r.V > 0
  );
  if (anomalies.length >= 5) {
    decisions.push({
      type: 'anomalie_minmax', impact: 0,
      label: `Paramétrer MIN/MAX pour ${anomalies.length} articles actifs sans seuil ERP.`,
      why: [
        `${anomalies.length} articles vendus mais sans MIN/MAX configuré`,
        `Sans seuil, le réapprovisionnement est 100% manuel`,
        `Action : exporter les codes, paramétrer dans l'ERP`,
      ],
    });
  }

  // ── 5. Situation saine (aucune urgence trouvée) ──────────────────────
  if (decisions.length === 0) {
    const freq = _S.finalData.filter(r => r.W >= 3 && !r.isParent && !(r.V === 0 && r.enleveTotal > 0));
    const sr = freq.length > 0 ? Math.round(freq.filter(r => r.stockActuel > 0).length / freq.length * 100) : 100;
    decisions.push({
      type: 'sain', impact: 0,
      label: `RAS — stock calibré, taux de service ${sr}%, aucune anomalie critique.`,
      why: [],
    });
  }

  // ── Tri : catégorie d'abord (rupture avant dormants), puis impact€ ────
  // Une rupture à 100€ est PLUS urgente qu'un dormant à 68 000€ :
  // la rupture perd de l'argent chaque jour, le dormant est stable.
  decisions.sort((a, b) => {
    const pa = TYPE_PRIORITY[a.type] ?? 50;
    const pb = TYPE_PRIORITY[b.type] ?? 50;
    if (pa !== pb) return pa - pb;      // catégorie plus urgente d'abord
    return b.impact - a.impact;         // à catégorie égale : plus gros impact d'abord
  });

  _S.decisionQueueData = decisions.slice(0, 7);
}
