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
import { DQ_MIN_CA_PERDU_SEM, DQ_MIN_PRIORITY_SCORE, DQ_MIN_PU_ALERTE, DQ_MIN_FREQ_ALERTE } from './constants.js';
import { _S } from './state.js';
import { getVal, _normalizeStatut, _isMetierStrategique, _normalizeClassif, _median, normFam } from './utils.js';


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
  return `<a data-unik-client="${code}" href="https://unik.legallais.com/app/customer/${code}/orders" target="_blank" rel="noopener" title="Voir commandes Unik" style="text-decoration:none;font-size:var(--fs-xs);line-height:1;vertical-align:middle" class="ml-0.5 text-blue-400 hover:text-blue-300">🔗</a>`;
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
  // alerte_prev < rupture : on peut encore agir, la rupture arrive dans X jours
  const TYPE_PRIORITY = { alerte_prev: 0, rupture: 1, client: 2, concentration: 2.5, dormants: 3, fragilite: 3.5, anomalie_minmax: 4, sain: 99 };

  // ── 1a. Alertes prévisionnelles (couverture ≤8j, stock>0, W≥DQ_MIN_FREQ_ALERTE, PU≥DQ_MIN_PU_ALERTE) ──
  const REAPPRO_DAYS = 8; // buffer de confort (délai réappro 48h + sécurité SECURITY_DAYS=3j)
  const alerteItems = _S.finalData
    .filter(r => r.couvertureJours != null && r.couvertureJours <= REAPPRO_DAYS
               && r.stockActuel > 0 && r.W >= DQ_MIN_FREQ_ALERTE
               && r.prixUnitaire >= DQ_MIN_PU_ALERTE
               && !r.isParent && !(r.V === 0 && r.enleveTotal > 0))
    .sort((a, b) => a.couvertureJours - b.couvertureJours)
    .slice(0, 3);

  for (const r of alerteItems) {
    const jours = Math.round(r.couvertureJours);
    const qteSugg = Math.max(1, (r.nouveauMax || 1) - r.stockActuel);
    decisions.push({
      type: 'alerte_prev', code: r.code, lib: r.libelle, famille: r.famille, fmrClass: r.fmrClass,
      impact: r.W * r.prixUnitaire, action: 'commander', qteSugg,
      label: `Commander ${qteSugg}u réf.${r.code} — rupture dans ${jours}j`,
      why: [
        `Stock actuel : ${r.stockActuel} u. — couverture ~${jours}j. Le réappro prend 48h + 1j de marge. Commander maintenant pour éviter la rupture.`,
        `Quantité suggérée : ${qteSugg} u. pour atteindre le MAX de ${r.nouveauMax || 1} u. en rayon.`,
      ],
    });
  }

  // ── 1b. Ruptures significatives (W≥3, stock≤0, CA/sem≥DQ_MIN_CA_PERDU_SEM ou score≥DQ_MIN_PRIORITY_SCORE) ──
  const allRupt = _S.finalData
    .filter(r => r.W >= 3 && r.stockActuel <= 0 && !r.isParent && !(r.V === 0 && r.enleveTotal > 0))
    .map(r => ({ r, impact: r.W * r.prixUnitaire, semCA: Math.round(r.W * r.prixUnitaire / 52) }))
    .sort((a, b) => b.impact - a.impact);

  const critRupt = allRupt
    .filter(({ r, semCA }) => semCA >= DQ_MIN_CA_PERDU_SEM || calcPriorityScore(r.W, r.prixUnitaire, r.ageJours) >= DQ_MIN_PRIORITY_SCORE)
    .slice(0, 3);

  for (const { r, impact, semCA } of critRupt) {
    const qteSugg = Math.max((r.nouveauMax || 1) - r.stockActuel, r.nouveauMax || 1);
    const ageText = (r.ageJours > 0 && r.ageJours < 999) ? ` depuis ${r.ageJours}j` : '';
    const coverTarget = r.fmrClass === 'F' ? '21j' : '10j';
    decisions.push({
      type: 'rupture', code: r.code, lib: r.libelle, famille: r.famille, fmrClass: r.fmrClass,
      impact, qteSugg, action: 'commander',
      label: `Commander ${r.W} × réf. ${r.code} — rupture active, ~${semCA.toLocaleString('fr')} €/sem.`,
      why: [
        `Stock à 0${ageText}. Cet article se vend ${r.W} fois/an (article ${r.fmrClass || '?'}). Chaque semaine sans stock ≈ ${semCA.toLocaleString('fr')} € de CA perdu.`,
        `Commander ${qteSugg} u. pour atteindre le MAX (${r.nouveauMax || 1} u. en rayon) — couverture cible ~${coverTarget}.`,
        `MIN configuré : ${r.nouveauMin} u. — stock actuel : ${r.stockActuel} u. (sous le seuil de commande auto).`,
      ],
    });
  }

  // Si des ruptures existent mais aucune ne passe le seuil → notice de surveillance
  if (allRupt.length > 0 && critRupt.length === 0) {
    const n = allRupt.length;
    decisions.push({
      type: 'sain', impact: 0,
      label: `Aucune rupture significative — ${n} rupture${n > 1 ? 's' : ''} mineure${n > 1 ? 's' : ''} en surveillance.`,
      why: [
        `${n} article${n > 1 ? 's' : ''} en rupture sous les seuils (CA/sem < ${DQ_MIN_CA_PERDU_SEM}€ et score < ${DQ_MIN_PRIORITY_SCORE})`,
        `Seuils d'alerte : CA perdu ≥ ${DQ_MIN_CA_PERDU_SEM}€/sem OU score priorité ≥ ${DQ_MIN_PRIORITY_SCORE}`,
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
      inactive.push({ cc, nom: info.nom || cc, daysAgo, weeksAgo: Math.round(daysAgo / 7), caAnnuel, metier: info.metier || '' });
    }
    inactive.sort((a, b) => b.caAnnuel - a.caAnnuel);
    for (const c of inactive.slice(0, 2)) {
      const horsMag = _S.ventesClientHorsMagasin?.get(c.cc);
      const nbArtsWeb = horsMag ? horsMag.size : 0;
      const labelWeb = nbArtsWeb > 0
        ? ` (${nbArtsWeb} art. hors agence détectés)`
        : '';
      decisions.push({
        type: 'client', code: c.cc, impact: c.caAnnuel,
        label: `Appeler client ${c.nom} — disparu ${c.weeksAgo} sem.${labelWeb}, ${Math.round(c.caAnnuel).toLocaleString('fr')} € annuel.`,
        why: [
          `Ce client représente ~${Math.round(c.caAnnuel).toLocaleString('fr')} €/an chez Legallais.`,
          nbArtsWeb > 0
            ? `⚠️ ${nbArtsWeb} articles achetés hors agence (web/représentant/DCS) — vérifier si le silence PDV est lié à ces canaux.`
            : `Dernière commande PDV il y a ${c.daysAgo} jours. Risque : départ silencieux vers un concurrent.`,
          `Métier stratégique — contacter pour comprendre l'absence ou proposer une visite.`,
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
        `${dormants.length} articles sans mouvement depuis plus de 12 mois — capital immobilisé et gelé.`,
        `Valeur stock : ${Math.round(dormantVal).toLocaleString('fr')} € d'argent qui ne tourne pas et se déprécie (âge moyen ~${avgMonths} mois).`,
        `Action recommandée : retour dépôt Legallais ou vente soldée — libère de la trésorerie.`,
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
        `${anomalies.length} articles vendus régulièrement mais sans seuil de réappro automatique dans l'ERP.`,
        `Sans MIN configuré, aucune alerte auto ne se déclenchera : risque de rupture invisible.`,
        `Action : exporter les codes via l'onglet Articles, paramétrer les MIN/MAX calculés par PRISME.`,
      ],
    });
  }

  // ── 5. Concentration Client — ICC (K1) ───────────────────────────────
  _S._iccData = null;
  if (_S.ventesClientArticle.size > 0) {
    const caParClient = [];
    for (const [cc, artMap] of _S.ventesClientArticle.entries()) {
      let ca = 0;
      for (const d of artMap.values()) ca += (d.sumCA || 0);
      if (ca > 0) caParClient.push({ code: cc, ca, nom: _S.clientNomLookup[cc] || cc });
    }
    caParClient.sort((a, b) => b.ca - a.ca);
    const totalCA = caParClient.reduce((s, c) => s + c.ca, 0);
    if (caParClient.length >= 3 && totalCA > 0) {
      let cumul = 0, icc = 0;
      for (const c of caParClient) { cumul += c.ca; icc++; if (cumul >= totalCA * 0.5) break; }
      const top3 = caParClient.slice(0, 3).map(c => ({ code: c.code, nom: c.nom, ca: Math.round(c.ca), pct: Math.round(c.ca / totalCA * 100) }));
      const top3Pct = top3.reduce((s, c) => s + c.pct, 0);
      const alerte = icc <= 5 || top3Pct > 40;
      _S._iccData = { icc, top3Pct, top3, alerte, totalCA: Math.round(totalCA) };
      if (alerte) {
        const top3Label = top3.map(c => `${c.nom.substring(0, 20)} (${c.pct}%)`).join(', ');
        decisions.push({
          type: 'concentration', impact: top3.reduce((s, c) => s + c.ca, 0),
          label: `Diversifier\u00a0— ${icc} client${icc > 1 ? 's' : ''} font 50% du CA. Top\u00a0: ${top3Label}.`,
          why: [
            `${icc} client${icc > 1 ? 's' : ''} concentrent 50% de votre CA Comptoir de ${Math.round(totalCA).toLocaleString('fr')} \u20ac`,
            `Si ${top3[0].nom} part, vous perdez ${top3[0].ca.toLocaleString('fr')} \u20ac soit ${top3[0].pct}% du CA`,
            `Objectif\u00a0: développer les clients moyens pour diluer le risque`,
          ],
        });
      }
    }
  }

  // ── 6. Fragilité Produit — 1-2 clients (K6) ─────────────────────────
  _S._fragiliteData = null;
  if (_S.articleClients.size > 0) {
    const fragiles = [];
    if (_S.cockpitLists.fragiles) _S.cockpitLists.fragiles.clear();
    for (const r of _S.finalData) {
      if (r.W < 3) continue;
      const clients = _S.articleClients.get(r.code);
      if (!clients || clients.size > 2) continue;
      const ca = Math.round(r.V * r.prixUnitaire);
      if (ca <= 200) continue;
      const topClientCode = clients.values().next().value;
      const topNom = _S.clientNomLookup[topClientCode] || topClientCode;
      fragiles.push({ code: r.code, libelle: r.libelle, client: topNom, clientCode: topClientCode, nbClients: clients.size, ca });
      if (_S.cockpitLists.fragiles) _S.cockpitLists.fragiles.add(r.code);
    }
    fragiles.sort((a, b) => b.ca - a.ca);
    const caTotal = fragiles.reduce((s, f) => s + f.ca, 0);
    if (fragiles.length > 0) {
      _S._fragiliteData = { nbFragiles: fragiles.length, caFragileTotal: caTotal, topFragiles: fragiles.slice(0, 5) };
      if (fragiles.length >= 3) {
        const top1 = fragiles[0];
        const label1 = top1.nbClients === 1 ? `seul client\u00a0: ${top1.client}` : `principal client\u00a0: ${top1.client}`;
        decisions.push({
          type: 'fragilite', impact: caTotal,
          label: `${fragiles.length} articles fragilisés\u00a0— ${caTotal.toLocaleString('fr')} \u20ac à risque si un client clé part.`,
          why: [
            `${fragiles.length} articles fréquents (≥3 cmd/an) n'ont que 1 ou 2 acheteurs`,
            `Si ce client part, ces articles deviennent dormants`,
            `Top risque\u00a0: ${top1.libelle.substring(0, 25)} (${top1.ca.toLocaleString('fr')} \u20ac)\u00a0\u2014 ${label1}`,
          ],
        });
      }
    }
  }

  // ── 7. Situation saine (aucune urgence trouvée) ──────────────────────
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

  _S.decisionQueueData = decisions.slice(0, 9);
}


// ── A5: Cohorte reconquête (P3.5+P4.6) ────────────────────────
// Clients perdus (>6 mois sans commande) avec historique CA significatif
export function computeReconquestCohort() {
  _S.reconquestCohort = [];
  if (!_S.chalandiseReady || !_S.clientLastOrder.size) return;
  const now = new Date();
  const SIX_MONTHS = 180 * 86400000;
  const cohort = [];
  for (const [cc, lastDate] of _S.clientLastOrder.entries()) {
    if ((now - lastDate) < SIX_MONTHS) continue;
    const info = _S.chalandiseData.get(cc);
    if (!info) continue;
    const artMap = _S.ventesClientArticle.get(cc);
    if (!artMap || artMap.size === 0) continue;
    const totalCA = [...artMap.values()].reduce((s, d) => s + (d.sumCA || 0), 0);
    if (totalCA < 500) continue;
    const nbFamilles = new Set([...artMap.keys()].map(code => _S.articleFamille[code]).filter(Boolean)).size;
    const daysAgo = Math.round((now - lastDate) / 86400000);
    const score = Math.round(totalCA * (nbFamilles / 5) * (180 / daysAgo));
    cohort.push({ cc, nom: info.nom || cc, metier: info.metier || '', commercial: info.commercial || '', totalCA, nbFamilles, daysAgo, score });
  }
  cohort.sort((a, b) => b.score - a.score);
  _S.reconquestCohort = cohort;
}

// ── C1: Opportunité nette Client×Famille ──────────────────────
export function computeOpportuniteNette() {
  if (!_S.metierFamBench || !Object.keys(_S.metierFamBench).length) {
    _S.opportuniteNette = [];
    return;
  }
  const results = [];
  for (const [cc, info] of _S.chalandiseData.entries()) {
    if (!info.metier) continue;
    const bench = _S.metierFamBench[info.metier];
    if (!bench) continue;
    const clientFams = _S.clientFamCA ? (_S.clientFamCA[cc] || {}) : {};
    const totalMetierClients = _S.clientsByMetier.get(info.metier)?.size || 1;
    if (totalMetierClients < 5) continue;
    const missing = [];
    for (const [fam, data] of Object.entries(bench)) {
      if (clientFams[fam]) continue;
      const pct = Math.round((data.nbClients / totalMetierClients) * 100);
      if (pct < 50) continue;
      missing.push({ fam, metierPct: pct, metierCA: Math.round(data.totalCA / data.nbClients) });
    }
    if (missing.length === 0) continue;
    missing.sort((a, b) => b.metierPct - a.metierPct);
    const totalPotentiel = missing.reduce((s, m) => s + m.metierCA, 0);
    results.push({
      cc, nom: info.nom || _S.clientNomLookup[cc] || cc,
      metier: info.metier, commercial: info.commercial || '',
      missingFams: missing.slice(0, 5),
      totalPotentiel, nbMissing: missing.length
    });
  }
  results.sort((a, b) => b.totalPotentiel - a.totalPotentiel);
  _S.opportuniteNette = results;
}

// ── B2: Score Potentiel Client (SPC) — 0-100 ─────────────────
export function computeSPC(cc, info) {
  let score = 0;
  // 1. Récence (30 pts)
  const lastOrder = _S.clientLastOrder.get(cc);
  if (lastOrder) {
    const daysAgo = Math.round((new Date() - lastOrder) / 86400000);
    if (daysAgo <= 30) score += 30;
    else if (daysAgo <= 90) score += 20;
    else if (daysAgo <= 180) score += 10;
  }
  // 2. CA rapatriable (30 pts)
  const caLeg = info.ca2025 || info.ca2026 || 0;
  const artMap = _S.ventesClientArticle.get(cc);
  const caPDV = artMap ? [...artMap.values()].reduce((s, d) => s + (d.sumCA || 0), 0) : 0;
  const caHorsPDV = Math.max(caLeg - caPDV, 0);
  if (caHorsPDV > 10000) score += 30;
  else if (caHorsPDV > 5000) score += 25;
  else if (caHorsPDV > 2000) score += 20;
  else if (caHorsPDV > 500) score += 15;
  else if (caHorsPDV > 0) score += 5;
  // 3. Familles manquantes vs benchmark métier (20 pts)
  if (_S.metierFamBench && info.metier && _S.metierFamBench[info.metier]) {
    const metierFams = _S.metierFamBench[info.metier];
    const clientFams = _S.clientFamCA ? _S.clientFamCA[cc] || {} : {};
    const totalMetierFams = Object.keys(metierFams).length;
    const missingFams = Object.keys(metierFams).filter(f => !clientFams[f]).length;
    const missingRatio = totalMetierFams > 0 ? missingFams / totalMetierFams : 0;
    score += Math.round(missingRatio * 20);
  }
  // 4. Profil chalandise (20 pts)
  const classif = _normalizeClassif(info.classification);
  if (classif === 'FID Pot+') score += 15;
  else if (classif === 'OCC Pot+') score += 10;
  else if (classif === 'FID Pot=') score += 8;
  if (_isMetierStrategique(info.metier)) score += 5;
  return Math.min(Math.round(score), 100);
}

// ── Heatmap réseau : top 20 familles × N agences, ratio vs médiane ────────
// Peuple _S.reseauHeatmapData depuis ventesParMagasin et articleFamille.
// Résultat : { familles: string[], agences: string[], matrix: {fam:{store: ratio}} }
export function computeReseauHeatmap() {
  const myStore = _S.selectedMyStore;
  const allStores = [..._S.storesIntersection];
  if (allStores.length < 2) { _S.reseauHeatmapData = null; return; }

  // Agréger CA par (store, famille)
  const storeFamCA = {};
  const famTotalCA = {};
  for (const store of allStores) {
    storeFamCA[store] = {};
    const sv = _S.ventesParMagasin[store] || {};
    for (const [code, data] of Object.entries(sv)) {
      if (!/^\d{6}$/.test(code)) continue;
      const fam = normFam(_S.articleFamille[code]);
      if (!fam) continue;
      const ca = data.sumCA || 0;
      storeFamCA[store][fam] = (storeFamCA[store][fam] || 0) + ca;
      famTotalCA[fam] = (famTotalCA[fam] || 0) + ca;
    }
  }

  // Top 20 familles par CA réseau total
  const familles = Object.entries(famTotalCA)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([fam]) => fam);

  if (!familles.length) { _S.reseauHeatmapData = null; return; }

  // Médiane réseau par famille (sur toutes les agences ayant du CA)
  const famMedian = {};
  for (const fam of familles) {
    const vals = allStores.map(s => storeFamCA[s]?.[fam] || 0).filter(v => v > 0);
    famMedian[fam] = vals.length ? _median(vals) : 1;
  }

  // Matrix : ratio = caStore / médiane (1 = médiane, >1 = surperf, <1 = sous-perf)
  const matrix = {};
  for (const fam of familles) {
    matrix[fam] = {};
    for (const store of allStores) {
      const ca = storeFamCA[store]?.[fam] || 0;
      matrix[fam][store] = famMedian[fam] > 0 ? ca / famMedian[fam] : 0;
    }
  }

  // Agences : mon agence en premier, puis les autres triées par CA total décroissant
  const storeCA = {};
  for (const store of allStores) storeCA[store] = Object.values(storeFamCA[store] || {}).reduce((s,v)=>s+v,0);
  const agences = [myStore, ...allStores.filter(s => s !== myStore).sort((a,b) => storeCA[b]-storeCA[a])];

  _S.reseauHeatmapData = { familles, agences, matrix };
}
