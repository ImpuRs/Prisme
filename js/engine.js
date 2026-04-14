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
import { FAM_LETTER_UNIVERS, FAMILLE_LOOKUP } from './constants.js';
import { _S } from './state.js';
import { getVal, _normalizeStatut, _isMetierStrategique, _normalizeClassif, _median, famLib, haversineKm, getSecteurDirection } from './utils.js';
import { articleLib } from './article-store.js';

function _isSixDigitCode(code) {
  if (code == null) return false;
  const s = typeof code === 'string' ? code : String(code);
  if (s.length !== 6) return false;
  for (let i = 0; i < 6; i++) {
    const c = s.charCodeAt(i);
    if (c < 48 || c > 57) return false;
  }
  return true;
}


// ── Prix Unitaire avec fallback consommé ──────────────────────
// Quand un article est en rupture (stock=0), la valeur PRMP = 0.
// On enrichit le PU depuis le CA consommé (sumCA / sumPrelevee).
export function enrichPrixUnitaire() {
  const mySk = _S.selectedMyStore || Object.keys(_S.ventesParMagasin)[0] || '';
  const otherStoreKeys = Object.keys(_S.ventesParMagasin).filter(sk => sk !== mySk);
  for (const r of _S.finalData) {
    if (r.prixUnitaire > 0) continue;
    // Fallback 1: PU from own store's consommé
    const myV = _S.ventesParMagasin[mySk]?.[r.code];
    if (myV && myV.sumPrelevee > 0 && myV.sumCA > 0) {
      r.prixUnitaire = Math.round(myV.sumCA / myV.sumPrelevee * 100) / 100;
      continue;
    }
    // Fallback 2: PU from any other store (multi-agence)
    for (const sk of otherStoreKeys) {
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
// V2 : Fréq × PU × coeff ancienneté × poids clients stratégiques
export function calcPriorityScore(freq, pu, ageJours, code) {
  const caPerdu = freq * pu;
  let ageCoeff = 1;
  if (ageJours < 30) ageCoeff = 0.8;
  else if (ageJours < 90) ageCoeff = 1;
  else if (ageJours < 180) ageCoeff = 1.2;
  else ageCoeff = 1.5;

  // Poids Client : boost si des clients stratégiques achètent cet article
  let clientWeight = 1;
  if (code && _S.articleClients && _S.chalandiseData?.size) {
    const buyers = _S.articleClients.get(code);
    if (buyers && buyers.size > 0) {
      let nbStrat = 0;
      for (const cc of buyers) {
        const info = _S.chalandiseData.get(cc);
        if (!info) continue;
        const cl = (info.classification || '').toUpperCase();
        if (cl.includes('FID') || cl === 'OCC POT+') nbStrat++;
      }
      clientWeight = 1 + Math.min(nbStrat, 8) * 0.4; // max 4.2×
    }
  }

  return Math.round(caPerdu * ageCoeff * clientWeight);
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
  const active = [];
  for (const r of data) if (r.W >= 1) active.push(r);
  for (const r of active) r._rot = r.V * r.prixUnitaire;
  active.sort((a, b) => b._rot - a._rot);
  let totalRot = 0;
  for (const r of active) totalRot += r._rot;
  let cumul = 0;
  const abcMap = {};
  for (const r of active) {
    cumul += r._rot;
    delete r._rot;
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
  let totalStockVal = 0;
  const mx = {
    AF: { count: 0, stockVal: 0, pctTotal: 0 }, AM: { count: 0, stockVal: 0, pctTotal: 0 }, AR: { count: 0, stockVal: 0, pctTotal: 0 },
    BF: { count: 0, stockVal: 0, pctTotal: 0 }, BM: { count: 0, stockVal: 0, pctTotal: 0 }, BR: { count: 0, stockVal: 0, pctTotal: 0 },
    CF: { count: 0, stockVal: 0, pctTotal: 0 }, CM: { count: 0, stockVal: 0, pctTotal: 0 }, CR: { count: 0, stockVal: 0, pctTotal: 0 }
  };
  for (const r of data) {
    const sv = r.stockActuel > 0 ? r.stockActuel * r.prixUnitaire : 0;
    totalStockVal += sv;
    if (!r.abcClass || !r.fmrClass) continue;
    const key = r.abcClass + r.fmrClass;
    const cell = mx[key];
    if (!cell) continue;
    cell.count++;
    cell.stockVal += sv;
  }
  if (totalStockVal > 0) {
    for (const key of Object.keys(mx)) mx[key].pctTotal = mx[key].stockVal / totalStockVal * 100;
  }
  _S.abcMatrixData = mx;
}

// ── Radar: recalcul matrice sur données filtrées ──────────────
export function _radarComputeMatrix(data) {
  let totalStock = 0;
  const mx = {
    AF: { count: 0, stockVal: 0, pctTotal: 0 }, AM: { count: 0, stockVal: 0, pctTotal: 0 }, AR: { count: 0, stockVal: 0, pctTotal: 0 },
    BF: { count: 0, stockVal: 0, pctTotal: 0 }, BM: { count: 0, stockVal: 0, pctTotal: 0 }, BR: { count: 0, stockVal: 0, pctTotal: 0 },
    CF: { count: 0, stockVal: 0, pctTotal: 0 }, CM: { count: 0, stockVal: 0, pctTotal: 0 }, CR: { count: 0, stockVal: 0, pctTotal: 0 }
  };
  for (const r of data) {
    const sv = (r.stockActuel || 0) * (r.prixUnitaire || 0);
    totalStock += sv;
    if (!r.abcClass || !r.fmrClass) continue;
    const key = r.abcClass + r.fmrClass;
    const cell = mx[key];
    if (!cell) continue;
    cell.count++;
    cell.stockVal += sv;
  }
  const denom = totalStock || 1;
  for (const key of Object.keys(mx)) mx[key].pctTotal = (mx[key].stockVal / denom) * 100;
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
  if (info.activiteLeg) return info.activiteLeg.startsWith('Actif');
  const aG = (info.activiteGlobale || info.activite || '').toLowerCase();
  const s = (info.statut || '').toLowerCase();
  return aG.includes('actif') || (s.includes('actif') && !s.includes('inactif'));
}

export function _isPDVActif(cc) {
  // Source structurelle Qlik — Activité PDV Zone (indépendant de la période)
  // Les filtres KM/métier/commercial/etc. sont appliqués en amont par _clientPassesFilters
  if (_S.chalandiseReady && _S.chalandiseData?.size) {
    const info = _S.chalandiseData.get(cc);
    if (info) return (info.activitePDV || '').startsWith('Actif PDV Zone');
  }
  // Fallback si chalandise non chargée
  if (_S.clientsMagasin && _S.clientsMagasin.size > 0) return _S.clientsMagasin.has(cc);
  const art = _S.ventesClientArticle.get(cc);
  return art && art.size > 0;
}

export function _isPerdu(info) {
  const s = _normalizeStatut(info.statut);
  return s === 'Inactif' || s === 'Perdu';
}

export function _isProspect(info) { return _normalizeStatut(info.statut) === 'Prospect'; }

export function _isPerdu24plus(info) {
  // Guillotine 12 mois : au-delà, le client bascule en Conquête (prospect froid)
  const sd = (info.statutDetaille || '').toLowerCase();
  if (sd) return sd.includes('>24') || sd.includes('> 24') || sd.includes('12-24') || sd.includes('12 - 24');
  // Fallback sans statutDetaille : ni CA N-1 ni CA N → inactif >12m
  return _isPerdu(info) && !(info.ca2025 || 0) && !(info.ca2026 || 0);
}

// ── Croisement consommé × chalandise ──────────────────────────
export function computeClientCrossing() {
  if (!_S.chalandiseReady || !_S.clientsMagasin.size) { _S.crossingStats = null; return; }
  const fideles = new Set(), potentiels = new Set(), captes = new Set(), fidelespdv = new Set();
  for (const cc of _S.clientsMagasin) {
    if (_S.chalandiseData.has(cc)) captes.add(cc); else fideles.add(cc);
  }
  for (const [cc, info] of _S.chalandiseData.entries()) {
    if (!_S.clientsMagasin.has(cc)) {
      if (_isGlobalActif(info)) potentiels.add(cc);
    }
  }
  // Fidèles PDV : clients ayant acheté en canal MAGASIN avec fréquence >= 2
  for (const [cc, freq] of _S.clientsMagasinFreq) {
    if (freq >= 2) fidelespdv.add(cc);
  }
  _S.crossingStats = { fideles, potentiels, captes, fidelespdv };
}

export function _clientUrgencyScore(cc, info) {
  const caLeg = info.ca2025 || 0;
  const pdvActif = _isPDVActif(cc);
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
  const pdvActif = _isPDVActif(cc);
  const globalActif = _isGlobalActif(info);
  if (pdvActif) return '<span class="text-[9px] font-bold px-1.5 py-0.5 rounded ml-1" style="background:var(--i-ok-bg);color:var(--i-ok-text)">Actif PDV</span>';
  if (globalActif) return '<span class="text-[9px] font-bold px-1.5 py-0.5 rounded ml-1" style="background:var(--i-info-bg);color:var(--i-info-text)">Actif Leg.</span>';
  if (_isProspect(info)) return '<span class="text-[9px] font-bold px-1.5 py-0.5 rounded ml-1" style="background:var(--i-neutral-bg);color:var(--i-neutral-text)">Prospect</span>';
  if (_isPerdu(info) && (info.ca2025 || 0) > 0) return '<span class="text-[9px] font-bold px-1.5 py-0.5 rounded ml-1" style="background:var(--i-caution-bg);color:var(--i-caution-text)">Perdu 12-24m</span>';
  return '<span class="text-[9px] font-bold px-1.5 py-0.5 rounded ml-1" style="background:var(--i-danger-bg);color:var(--i-danger-text)">Inactif</span>';
}

export function _clientStatusText(cc, info) {
  const pdvActif = _isPDVActif(cc);
  const globalActif = _isGlobalActif(info);
  if (pdvActif) return 'Actif PDV';
  if (globalActif) return 'Actif Leg.';
  if (_isProspect(info)) return 'Prospect';
  if (_isPerdu(info) && (info.ca2025 || 0) > 0) return 'Perdu 12-24m';
  return 'Inactif';
}

export function _unikLink(code) {
  if (!code || !_isSixDigitCode(code)) return '';
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
  if (_S._selectedCrossStatus === 'fidelespdv') return !!_S.crossingStats.fidelespdv?.has(cc);
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

export function clientMatchesStatutDetailleFilter(info) {
  if (!_S._selectedStatutDetaille) return true;
  return (info.statutDetaille || '') === _S._selectedStatutDetaille;
}

export function clientMatchesDirectionFilter(info) {
  if (!_S._selectedDirections.size) return true;
  const dir = info.secteur ? getSecteurDirection(info.secteur) || 'Autre' : 'Autre';
  return _S._selectedDirections.has(dir);
}

export function clientMatchesCommercialFilter(info) {
  if (!_S._selectedCommercial) return true;
  return (info.commercial || '') === _S._selectedCommercial;
}

export function clientMatchesMetierFilter(info) {
  if (!_S._selectedMetier) return true;
  return (info.metier || '') === _S._selectedMetier;
}

export function clientMatchesUniversFilter(cc) {
  if (!_S._selectedUnivers.size) return true;
  const u = _S._clientDominantUnivers?.get(cc) || '';
  return _S._selectedUnivers.has(u);
}

export function clientMatchesDistanceFilter(info) {
  if (!_S._distanceMaxKm) return true;
  const d = info.distanceKm;
  if (d == null) return true; // pas de coordonnées → ne pas exclure
  return d <= _S._distanceMaxKm;
}

export function _clientPassesFilters(info, cc='') {
  if (_S._filterStrategiqueOnly && !_isMetierStrategique(info.metier)) return false;
  if (!clientMatchesUniversFilter(cc)) return false;
  // Distance : client PDV actif → vient déjà au comptoir, ne pas exclure par distance
  const distOk = clientMatchesDistanceFilter(info) || (cc && _S.clientsMagasin?.has(cc));
  return clientMatchesDeptFilter(info) && clientMatchesClassifFilter(info) &&
    clientMatchesStatutFilter(info) && clientMatchesStatutDetailleFilter(info) &&
    clientMatchesActivitePDVFilter(info) && clientMatchesDirectionFilter(info) &&
    clientMatchesCommercialFilter(info) && clientMatchesMetierFilter(info) &&
    distOk;
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
// Retourne les codes clients actifs pour le canal donné.
// '' ou 'MAGASIN' → ventesClientArticle ; autre canal → ventesClientHorsMagasin filtré.
function _getClientsActifs(canal = '') {
  const vca = _S.ventesClientArticle;
  const vh = _S.ventesClientHorsMagasin;
  if (!canal || canal === 'MAGASIN') {
    return vca ? Array.from(vca.keys()) : [];
  }
  if (!vh?.size) return [];
  const out = [];
  for (const [cc, arts] of vh.entries()) {
    let ok = false;
    for (const a of arts.values()) {
      if (a.canal === canal) { ok = true; break; }
    }
    if (ok) out.push(cc);
  }
  return out;
}

// ── Health Score agence 0-100 ──────────────────────────────────
// Score synthétique : stock A + captation clients + taux service + actif/dormant
export function computeHealthScore() {
  if (!_S._hasStock) {
    let actifs=0,total=0;
    if(_S.clientStore?.size){for(const rec of _S.clientStore.values()){if(rec.lastOrderPDV){total++;if((rec.silenceDaysPDV||999)<90)actifs++;}}}
    else{const nowTs=Date.now();for(const[,dt] of _S.clientLastOrder){total++;if(nowTs-dt<90*86400000)actifs++;}}
    total=Math.max(total,1);
    const momentumScore = Math.round(Math.min(1, actifs/total) * 100);
    const captationScore = (_S.chalandiseReady && _S.chalandiseData.size > 0)
      ? Math.round(Math.min(1, actifs / _S.chalandiseData.size) * 100) : 50;
    const score = Math.round((momentumScore + captationScore) / 2);
    const label = score >= 70 ? 'Bon' : score >= 40 ? 'Vigilance' : 'Critique';
    return { score, label, details: { momentum: momentumScore, captation: captationScore, stockFM: null, service: null }, degraded: true };
  }
  const d = _S.finalData;
  if (!d.length) return null;

  // Composante 1 : ruptures articles A (poids 30%)
  let articlesACount = 0;
  let articlesARupture = 0;
  for (const r of d) {
    if (r.abcClass !== 'A' || r.W < 1 || r.isParent || (r.V === 0 && r.enleveTotal > 0)) continue;
    articlesACount++;
    if (r.stockActuel <= 0) articlesARupture++;
  }
  const scoreStock = articlesACount > 0 ? Math.max(0, 1 - articlesARupture / articlesACount) : 1;

  // Composante 2 : clients actifs PDV 90j vs zone chalandise (poids 30%)
  let scoreClients = 0.5; // défaut sans chalandise
  if (_S.chalandiseReady && _S.chalandiseData.size > 0) {
    let actifs = 0;
    if (_S.clientStore?.size) {
      for (const rec of _S.clientStore.values()) {
        if (rec.silenceDaysPDV !== null && rec.silenceDaysPDV <= 90) actifs++;
      }
    } else {
      const nowTs = Date.now();
      actifs = 0;
      for (const dt of _S.clientLastOrder.values()) {
        if (nowTs - dt < 90 * 86400000) actifs++;
      }
    }
    scoreClients = Math.min(1, actifs / _S.chalandiseData.size);
  }

  // Composante 3 : taux de service (poids 20%)
  const serv = _S.benchLists?.obsKpis?.mine?.serv || 0;

  // Composante 4 : ratio actif/dormant en valeur (poids 20%)
  let valDormants = 0, valStock = 0;
  for (const r of d) {
    const val = (r.stockActuel || 0) * (r.prixUnitaire || 0);
    valStock += val;
    if ((r.ageJours || 0) > 365) valDormants += val;
  }
  const scoreDorm = valStock > 0 ? Math.max(0, 1 - valDormants / valStock) : 1;

  const score = Math.round(scoreStock * 30 + scoreClients * 30 + (serv / 100) * 20 + scoreDorm * 20);
  const color = score >= 70 ? 'green' : score >= 45 ? 'amber' : 'red';
  const label = score >= 70 ? 'Bonne santé' : score >= 45 ? 'Vigilance' : 'Actions requises';
  return { score, color, label, scoreStock, scoreClients, serv, scoreDorm };
}

// ── Helper : enrichissement client (chalandise + fallback territoire) ──
let _terrFBCache = null;
function _buildTerrFB() {
  if (_terrFBCache) return _terrFBCache;
  _terrFBCache = new Map();
  if (_S.territoireLines?.length) {
    for (const ln of _S.territoireLines) {
      if (!ln.clientCode) continue;
      const cc = ln.clientCode;
      if (!_terrFBCache.has(cc)) {
        _terrFBCache.set(cc, { commercial: ln.commercial || '' });
      } else if (!_terrFBCache.get(cc).commercial && ln.commercial) {
        _terrFBCache.get(cc).commercial = ln.commercial;
      }
    }
  }
  return _terrFBCache;
}
export function _enrichClientInfo(cc) {
  const rec = _S.clientStore?.get(cc);
  if (rec) return { nom: rec.nom, metier: rec.metier, commercial: rec.commercial };
  const info = _S.chalandiseData?.get(cc);
  const fb = _buildTerrFB().get(cc);
  return { nom: info?.nom || cc, metier: info?.metier || '', commercial: info?.commercial || fb?.commercial || '' };
}
export function _invalidateTerrFBCache() { _terrFBCache = null; }

// ── Helper interne : construit une entrée de cohorte reconquête ──────────
// Retourne null si le CA total est nul ou négatif.
function _buildCohortItem(cc, artMap, daysAgo) {
  let totalCA = 0;
  const famSet = new Set();
  for (const [code, d] of artMap) {
    totalCA += d.sumCAAll || d.sumCA || 0;
    const fam = _S.articleFamille?.[code];
    if (fam) famSet.add(fam);
  }
  if (totalCA <= 0) return null;
  const nbFamilles = famSet.size;
  const score = Math.round(totalCA * (nbFamilles / 5) * (180 / daysAgo));
  const ec = _enrichClientInfo(cc);
  return { cc, nom: ec.nom, metier: ec.metier, commercial: ec.commercial, totalCA, nbFamilles, daysAgo, score, source: 'fidele' };
}

// ── A5: Cohorte reconquête (P3.5+P4.6) ────────────────────────
// Clients perdus (>6 mois sans commande) avec historique CA significatif
export function computeReconquestCohort() {
  _S.reconquestCohort = [];
  _S.livraisonsSansPDV = [];
  _invalidateTerrFBCache(); // rebuild on data change
  const nowTs = Date.now();

  // ── Section 1 : anciens fidèles silencieux (> 60j, CA > 0 dans consommé) ──
  // Source : clientStore (préféré) ou fallback crossingStats × clientLastOrder
  const _minCR = _S.consommePeriodMinFull || _S.consommePeriodMin;
  const cohort = [];

  if (_S.clientStore?.size) {
    const fidelesSet = _S.crossingStats?.fideles;
    for (const rec of _S.clientStore.values()) {
      // Si crossingStats dispo, ne garder que les fidèles
      if (fidelesSet?.size && !fidelesSet.has(rec.cc)) continue;
      const lastDate = rec.lastOrderPDV;
      if (!lastDate) continue;
      if (_minCR && lastDate < _minCR) continue;
      const daysAgo = Math.round((nowTs - lastDate.getTime()) / 86400000);
      if (daysAgo < 60) continue;
      if (!rec.artMapPDV || rec.artMapPDV.size === 0) continue;
      const item = _buildCohortItem(rec.cc, rec.artMapPDV, daysAgo);
      if (item) cohort.push(item);
    }
  } else {
    // Fallback sans clientStore
    const fidelesSet = _S.crossingStats?.fideles;
    if (fidelesSet?.size) {
      for (const cc of fidelesSet) {
        const lastDate = _S.clientLastOrder.get(cc);
        if (!lastDate) continue;
        if (_minCR && lastDate < _minCR) continue;
        const daysAgo = Math.round((nowTs - lastDate.getTime()) / 86400000);
        if (daysAgo < 60) continue;
        const artMap = _S.ventesClientArticle.get(cc);
        if (!artMap || artMap.size === 0) continue;
        const item = _buildCohortItem(cc, artMap, daysAgo);
        if (item) cohort.push(item);
      }
    } else {
      for (const cc of _S.clientLastOrder.keys()) {
        const lastDate = _S.clientLastOrder.get(cc);
        if (!lastDate) continue;
        if (_minCR && lastDate < _minCR) continue;
        const daysAgo = Math.round((nowTs - lastDate.getTime()) / 86400000);
        if (daysAgo < 60) continue;
        const artMap = _S.ventesClientArticle.get(cc);
        if (!artMap || artMap.size === 0) continue;
        const item = _buildCohortItem(cc, artMap, daysAgo);
        if (item) cohort.push(item);
      }
    }
  }
  cohort.sort((a, b) => b.score - a.score);
  _S.reconquestCohort = cohort;

  // ── Section 2 : livrés sans PDV (jamais dans ventesClientArticle) ──
  if (_S.livraisonsReady && _S.livraisonsData?.size) {
    const sansPDV = [];
    for (const [cc, livData] of _S.livraisonsData) {
      if (livData.ca <= 0) continue;
      const rec = _S.clientStore?.get(cc);
      if (rec?.artMapPDV && rec.artMapPDV.size > 0) continue; // a déjà acheté au comptoir
      if (!rec) {
        const artMap = _S.ventesClientArticle?.get(cc);
        if (artMap && artMap.size > 0) continue;
      }
      const chalInfo = _S.chalandiseData?.get(cc);
      const nom = rec?.nom || chalInfo?.nom || _S.clientNomLookup?.[cc] || cc;
      const metier = rec?.metier || chalInfo?.metier || '';
      const commercial = rec?.commercial || chalInfo?.commercial || _enrichClientInfo(cc).commercial;
      const classification = rec?.classification || chalInfo?.classification || '';
      sansPDV.push({ cc, nom, metier, classification, commercial, caLivraison: livData.ca, nbBL: livData.bl.size, lastDate: livData.lastDate });
    }
    sansPDV.sort((a, b) => b.caLivraison - a.caLivraison);
    _S.livraisonsSansPDV = sansPDV;
  }
}

// ── C1: Opportunité nette — par FAMILLE, clients AG22 qui achètent ailleurs ──
// Définition : client présent dans ventesClientArticle (il achète chez nous),
// mais qui achète via d'autres canaux/agences (ventesClientHorsMagasin) des articles
// dont la FAMILLE est présente dans notre rayon ET qu'il ne nous achète PAS dans cette famille.
export function computeOpportuniteNette() {
  if (!_S.ventesClientHorsMagasin?.size || !_S.finalData?.length) {
    _S.opportuniteNette = [];
    return;
  }
  // 1. rayonFamSet = familles disponibles en rayon AG22
  const rayonFamSet = new Set();
  for (const r of _S.finalData) {
    const fam = _S.articleFamille?.[r.code] || r.famille;
    if (fam) rayonFamSet.add(fam);
  }
  const results = [];
  for (const [cc, horsArts] of _S.ventesClientHorsMagasin.entries()) {
    if (!horsArts.size) continue;
    // 2a. caParFamMoi = CA chez AG22 par famille pour ce client
    const caParFamMoi = new Map();
    const myArts = _S.ventesClientArticle?.get(cc);
    if (myArts) {
      for (const [code, d] of myArts.entries()) {
        const fam = _S.articleFamille?.[code];
        if (!fam) continue;
        caParFamMoi.set(fam, (caParFamMoi.get(fam) || 0) + (d.sumCA || 0));
      }
    }
    // 2b. Agréger le CA hors par famille (familles du rayon uniquement)
    const famMap = new Map();
    const globalCanal = {};
    for (const [code, d] of horsArts.entries()) {
      const caHors = d.sumCA || 0;
      if (caHors <= 0) continue;
      const fam = _S.articleFamille?.[code];
      if (!fam || !rayonFamSet.has(fam)) continue;
      if (!famMap.has(fam)) famMap.set(fam, { caHors: 0, nbArticles: 0, canalBreakdown: {} });
      const fd = famMap.get(fam);
      fd.caHors += caHors;
      fd.nbArticles++;
      const canal = d.canal || 'AUTRE';
      fd.canalBreakdown[canal] = (fd.canalBreakdown[canal] || 0) + caHors;
      globalCanal[canal] = (globalCanal[canal] || 0) + caHors;
    }
    if (!famMap.size) continue;
    // 2c. Delta = caHors − caMoi — garder uniquement les familles où on achète plus ailleurs
    const missingFams = [];
    for (const [famCode, fd] of famMap.entries()) {
      const caMoi = caParFamMoi.get(famCode) || 0;
      const delta = fd.caHors - caMoi;
      if (delta <= 0) continue; // client achète autant ou plus chez AG22
      missingFams.push({
        famCode,
        fam: famLib(famCode) || famCode,
        ca: delta,
        caHors: fd.caHors,
        caMoi,
        nbArticles: fd.nbArticles,
        canalBreakdown: fd.canalBreakdown,
      });
    }
    if (!missingFams.length) continue;
    missingFams.sort((a, b) => b.ca - a.ca);
    let totalPotentiel = 0;
    for (const f of missingFams) totalPotentiel += f.ca;
    const _ec3=_enrichClientInfo(cc);
    results.push({
      cc,
      nom: _ec3.nom,
      metier: _ec3.metier,
      commercial: _ec3.commercial,
      missingFams,
      totalPotentiel,
      canalBreakdown: globalCanal,
      articlesManquants: [],
    });
  }
  results.sort((a, b) => b.totalPotentiel - a.totalPotentiel);
  _S.opportuniteNette = results;
}

// ── B2: Score Potentiel Client (SPC) — 0-100 ─────────────────
export function computeSPC(cc, info) {
  let score = 0;
  const rec = _S.clientStore?.get(cc);
  // 1. Récence (30 pts)
  const daysAgo = rec?.silenceDaysPDV;
  if (daysAgo !== null && daysAgo !== undefined) {
    if (daysAgo <= 30) score += 30;
    else if (daysAgo <= 90) score += 20;
    else if (daysAgo <= 180) score += 10;
  }
  // 2. CA rapatriable (30 pts)
  const caLeg = info.ca2025 || info.ca2026 || 0;
  const caPDV = rec?.caPDV || 0;
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
    let totalMetierFams = 0;
    let missingFams = 0;
    for (const f in metierFams) {
      if (!Object.prototype.hasOwnProperty.call(metierFams, f)) continue;
      totalMetierFams++;
      if (!clientFams[f]) missingFams++;
    }
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


// ── Helper interne : suivi famille × canal pour le score omnicanal ───────
function _trackFamCanalInto(famCanalState, nbFamsCrossRef, fam, canal) {
  if (!fam) return;
  const prev = famCanalState.get(fam);
  if (!prev) { famCanalState.set(fam, canal); return; }
  if (prev !== '*' && prev !== canal) {
    famCanalState.set(fam, '*');
    nbFamsCrossRef[0]++;
  }
}

// ── Score omnicanalité par client ─────────────────────────────────────────
// Segmente chaque client en : mono / hybride / digital / dormant
// Segmentation par nombre de canaux distincts :
//   purComptoir = MAGASIN uniquement (1 canal)
//   purHors     = jamais MAGASIN, uniquement DCS/Internet/Représentant/Autre
//   hybride     = MAGASIN + 1 ou 2 autres canaux (2-3 canaux)
//   full        = 4+ canaux distincts
// Score omnicanal composite 0-100 : canaux(30) + équilibre PDV/hors(30) + récence PDV(20) + familles cross-canal(20)
// Résultat : _S.clientOmniScore = Map<cc, {segment, score, caPDV, caHors, caTotal, nbCanaux, nbBL, silenceDays}>
export function computeOmniScores() {
  const scores = new Map();
  const nowTs = Date.now();
  const allCc = new Set();
  if (_S.ventesClientArticle) for (const cc of _S.ventesClientArticle.keys()) allCc.add(cc);
  if (_S.ventesClientHorsMagasin) for (const cc of _S.ventesClientHorsMagasin.keys()) allCc.add(cc);
  for (const cc of allCc) {
    const pdvArts = _S.ventesClientArticle?.get(cc);
    const horArts = _S.ventesClientHorsMagasin?.get(cc);
    let caPDV = 0;
    if (pdvArts) for (const [, v] of pdvArts) caPDV += v.sumCA || 0;
    let caHors = 0;
    const canaux = new Set();
    if (caPDV > 0) canaux.add('MAGASIN');
    if (horArts) {
      for (const [, v] of horArts) {
        caHors += v.sumCA || 0;
        if (v.canal) canaux.add(v.canal);
      }
    }
    const nbCanaux = canaux.size;
    const caTotal = caPDV + caHors;
    if (caTotal <= 0) continue; // ignorer les clients sans CA effectif
    const nbBL = _S.clientsMagasinFreq?.get(cc) || (pdvArts ? pdvArts.size : 0);
    const _csRec = _S.clientStore?.get(cc);
    const lastPDV = _csRec?.lastOrderPDV || _S.clientLastOrder?.get(cc);
    const silenceDays = _csRec?.silenceDaysPDV ?? (lastPDV ? Math.round((nowTs - lastPDV) / 86400000) : 999);
    // Segment par nombre de canaux
    let segment;
    if (nbCanaux >= 4) segment = 'full';
    else if (canaux.has('MAGASIN') && nbCanaux >= 2) segment = 'hybride';
    else if (!canaux.has('MAGASIN') && nbCanaux >= 1) segment = 'purHors';
    else segment = 'purComptoir'; // MAGASIN uniquement (ou aucun canal avec CA)
    // Score composite 0-100
    // 1. Nb canaux (30pts)
    const _sCanaux = nbCanaux >= 4 ? 30 : nbCanaux === 3 ? 22 : nbCanaux === 2 ? 15 : 5;
    // 2. Équilibre PDV/hors-agence (30pts)
    const _sEquilibre = (caPDV > 0 && caHors > 0) ? Math.round(Math.min(caPDV, caHors) / Math.max(caPDV, caHors) * 30) : 0;
    // 3. Récence PDV (20pts)
    const _sRecence = silenceDays <= 30 ? 20 : silenceDays <= 90 ? 15 : silenceDays <= 180 ? 10 : 0;
    // 4. Profondeur familles cross-canal (20pts) : familles achetées sur 2+ canaux distincts
    const _famCanalState = new Map(); // fam -> first canal, or '*'
    const _nbFamsCrossRef = [0];
    if (pdvArts) for (const [code] of pdvArts) _trackFamCanalInto(_famCanalState, _nbFamsCrossRef, _S.articleFamille?.[code], 'MAGASIN');
    if (horArts) for (const [code, v] of horArts) _trackFamCanalInto(_famCanalState, _nbFamsCrossRef, _S.articleFamille?.[code], v.canal || 'HORS');
    const _sFams = _nbFamsCrossRef[0] >= 5 ? 20 : _nbFamsCrossRef[0] >= 3 ? 13 : _nbFamsCrossRef[0] >= 1 ? 6 : 0;
    const score = Math.min(100, _sCanaux + _sEquilibre + _sRecence + _sFams);
    scores.set(cc, { segment, score, caPDV, caHors, caTotal, nbCanaux, nbBL, silenceDays });
  }
  _S.clientOmniScore = scores;
}

// ── Familles fuyantes hors agence ─────────────────────────────────────────
// Détecte les familles que des clients PDV achètent hors agence sans jamais
// les acheter au comptoir → signal de gamme manquante ou de captation partielle
// Résultat : _S.famillesHors = [{fam, rawFam, nbClients, caHors, mainCanal, clients[]}]
export function computeFamillesHors() {
  if (!_S.ventesClientArticle?.size || !_S.ventesClientHorsMagasin?.size) {
    _S.famillesHors = [];
    return;
  }
  const famData = new Map(); // rawFam → {nbClients, caHors, canalCount:Map, clients}
  for (const [cc, horArts] of _S.ventesClientHorsMagasin) {
    const pdvArts = _S.ventesClientArticle.get(cc);
    if (!pdvArts) continue; // pas de PDV → pas de "fuite", c'est juste hors-agence
    // Familles achetées en PDV
    const famsPDV = new Set();
    for (const [code] of pdvArts) {
      const fam = _S.articleFamille?.[code];
      if (fam) famsPDV.add(fam);
    }
    // CA hors agence par famille non présente en PDV
    const famHors = new Map();
    for (const [code, v] of horArts) {
      const rawFam = _S.articleFamille?.[code];
      if (!rawFam || famsPDV.has(rawFam)) continue;
      if (!famHors.has(rawFam)) famHors.set(rawFam, { ca: 0, canal: v.canal || '' });
      famHors.get(rawFam).ca += v.sumCA || 0;
    }
    const _ecF = _enrichClientInfo(cc);
    for (const [rawFam, d] of famHors) {
      const ca = d.ca;
      const canal = d.canal;
      if (ca < 100) continue;
      if (!famData.has(rawFam)) famData.set(rawFam, { nbClients: 0, caHors: 0, canalCount: new Map(), clients: [] });
      const entry = famData.get(rawFam);
      entry.nbClients++;
      entry.caHors += ca;
      entry.canalCount.set(canal, (entry.canalCount.get(canal) || 0) + 1);
      entry.clients.push({ cc, nom: _ecF.nom, ca, canal });
    }
  }
  const out = [];
  for (const [rawFam, d] of famData) {
    const caHors = Math.round(d.caHors);
    if (caHors < 200) continue;
    let mainCanal = '';
    let maxCount = -1;
    for (const [canal, n] of d.canalCount) {
      if (n > maxCount) { maxCount = n; mainCanal = canal; }
    }
    d.clients.sort((a, b) => b.ca - a.ca);
    out.push({
      fam: famLib(rawFam) || rawFam,
      rawFam,
      nbClients: d.nbClients,
      caHors,
      mainCanal,
      clients: d.clients.slice(0, 5),
    });
  }
  out.sort((a, b) => b.caHors - a.caHors);
  _S.famillesHors = out;
}

// ═══════════════════════════════════════════════════════════════
// SQUELETTE — Plan de Stock Stratégique par direction
// Croise 5 sources : réseau, chalandise, hors-zone, livraisons, pénétration PDV
// ═══════════════════════════════════════════════════════════════

const FAM_UNIVERS_TO_DIR = {
  'A': 'DV SECOND OEUVRE', 'B': 'DV SECOND OEUVRE', 'C': 'DV MAINTENANCE',
  'R': 'DV MAINTENANCE', 'E': 'DV MAINTENANCE', 'G': 'DV PLOMBERIE',
  'M': 'DV MAINTENANCE', 'O': 'DV MAINTENANCE', 'L': 'DV PLOMBERIE'
};

// ── Article Zone Index — source unique CA Zone / Cli Zone ──────────
// Pré-calcule par article : caZone (tous canaux), caAgence (MAGASIN),
// clis (Set<cc> dédupliqué), contribs [{cc, ca, mon}] pour re-filtrage distance.
// Lazy-cached dans _S.articleZoneIndex.
export function computeArticleZoneIndex() {
  if (_S.articleZoneIndex) return _S.articleZoneIndex;
  const hasChal = _S.chalandiseReady && _S.chalandiseData?.size > 0;
  const idx = new Map(); // code → {caZone, caAgence, cliZone, contribs: Array<{cc,ca,mon}>}
  if (!hasChal) { _S.articleZoneIndex = idx; return idx; }

  const chalClients = _S.chalandiseData;
  const _ens = (code) => {
    if (!idx.has(code)) idx.set(code, { caZone: 0, caAgence: 0, cliZone: 0, _cc: new Map() });
    return idx.get(code);
  };
  const _addContrib = (o, cc, ca, mon) => {
    let c = o._cc.get(cc);
    if (!c) { c = { cc, ca: 0, mon: 0 }; o._cc.set(cc, c); }
    c.ca += ca; c.mon += mon;
  };

  // Source 1 : ventesClientArticle (MAGASIN = mon agence)
  for (const [cc, artMap] of (_S.ventesClientArticle || new Map())) {
    if (!chalClients.has(cc)) continue;
    for (const [code, data] of artMap) {
      if (!_isSixDigitCode(code)) continue;
      const ca = +(data.sumCA || 0);
      const o = _ens(code);
      o.caZone += ca;
      o.caAgence += ca;
      _addContrib(o, cc, ca, ca);
    }
  }
  // Source 2 : ventesClientHorsMagasin (Internet, Représentant, DCS)
  for (const [cc, artMap] of (_S.ventesClientHorsMagasin || new Map())) {
    if (!chalClients.has(cc)) continue;
    for (const [code, data] of artMap) {
      if (!_isSixDigitCode(code)) continue;
      const ca = +(data.sumCA || 0);
      const o = _ens(code);
      o.caZone += ca;
      _addContrib(o, cc, ca, 0);
    }
  }
  // Source 3 : territoireLines (livraisons réseau → clients zone)
  if (_S.territoireReady && _S.territoireLines?.length) {
    for (const l of _S.territoireLines) {
      if (l.isSpecial || !l.clientCode || !chalClients.has(l.clientCode)) continue;
      if (!_isSixDigitCode(l.code)) continue;
      const ca = +(l.ca || 0);
      const o = _ens(l.code);
      o.caZone += ca;
      _addContrib(o, l.clientCode, ca, 0);
    }
  }

  // Finaliser contribs : convertir Map → Array pour itération rapide
  for (const [, o] of idx) {
    o.contribs = Array.from(o._cc.values());
    o.cliZone = o.contribs.length;
    delete o._cc;
  }

  _S.articleZoneIndex = idx;
  return idx;
}

let _sqCacheKey = '';
let _sqCacheResult = null;
export function invalidateSqueletteCache() { _sqCacheKey = ''; _sqCacheResult = null; }

export function computeSquelette(directionFilter) {
  const vpm = _S.ventesParMagasin || {};
  const myStore = _S.selectedMyStore;
  const finalData = _S.finalData || [];
  let storesCount = 0;
  let storesExclMy = 0;
  for (const store of Object.keys(vpm)) {
    storesCount++;
    if (store !== myStore) storesExclMy++;
  }
  const nbStoresExclMy = Math.max(1, storesExclMy);
  // Cache rapide — même données source = même résultat
  const _sk = `${myStore}|${storesCount}|${finalData.length}|${_S.territoireLines?.length||0}|${_S.chalandiseData?.size||0}|${directionFilter||''}`;
  if (_sk === _sqCacheKey && _sqCacheResult) return _sqCacheResult;
  const hasTerr = _S.territoireReady && _S.territoireLines?.length > 0;
  const hasChal = _S.chalandiseReady && _S.chalandiseData?.size > 0;

  const articleData = new Map();
  const _ensure = (code) => {
    if (!articleData.has(code)) {
      articleData.set(code, {
        code,
        libelle: articleLib(code),
        famille: _S.articleFamille?.[code] || '',
        univers: _S.articleUnivers?.[code] || '',
        sources: new Set(),
        nbAgencesReseau: 0, caReseau: 0,
        nbClientsZone: 0, caClientsZone: 0,
        nbClientsHorsZone: 0, caClientsHorsZone: 0,
        nbClientsPDV: 0,
        nbBLLivraisons: 0, caLivraisons: 0,
        direction: '',
        enStock: false, stockActuel: 0, emplacement: '', statut: '',
        abcClass: '', fmrClass: '', caAgence: 0,
      });
    }
    return articleData.get(code);
  };

  // ── Source 1 : Réseau ──
  for (const store in vpm) {
    if (store === myStore) continue;
    const arts = vpm[store];
    if (!arts) continue;
    for (const code in arts) {
      const data = arts[code];
      if (!data || data.countBL <= 0 || !_isSixDigitCode(code)) continue;
      const a = _ensure(code);
      a.nbAgencesReseau++;
      a.caReseau += data.sumCA || 0;
      a.sources.add('reseau');
    }
  }

  // ── Source 2 : Chalandise (clients zone) — via articleZoneIndex centralisé ──
  if (hasChal) {
    const zoneIdx = computeArticleZoneIndex();
    for (const [code, zi] of zoneIdx) {
      const a = _ensure(code);
      a.caClientsZone = zi.caZone;
      a.nbClientsZone = zi.cliZone;
      if (zi.cliZone > 0) a.sources.add('chalandise');
    }
  }

  // ── Source 3 : Clients hors-zone ──
  {
    const chalClients = hasChal ? _S.chalandiseData : null;
    for (const [cc, artMap] of (_S.ventesClientArticle || new Map())) {
      if (chalClients && chalClients.has(cc)) continue;
      for (const [code, data] of artMap) {
        if (!_isSixDigitCode(code)) continue;
        const a = _ensure(code);
        a.nbClientsHorsZone++;
        a.caClientsHorsZone += data.sumCA || 0;
        a.sources.add('horsZone');
      }
    }
  }

  // ── Source 4 : Livraisons (réseau) — BL count + direction ──
  if (hasTerr) {
    const deliveredCodes = new Set();
    for (const l of _S.territoireLines) {
      if (l.isSpecial) continue;
      const a = _ensure(l.code);
      a.caLivraisons += l.ca;
      a.direction = a.direction || l.direction;
      a.sources.add('livraisons');
      if (!a._blSet) a._blSet = new Set();
      a._blSet.add(l.bl);
      deliveredCodes.add(l.code);
    }
    for (const code of deliveredCodes) {
      const a = articleData.get(code);
      if (a?._blSet) { a.nbBLLivraisons = a._blSet.size; delete a._blSet; }
    }
  }

  // ── Source 5 : Pénétration PDV (combien de MES clients achètent cet article) ──
  if (_S.articleClients?.size && _S.clientsMagasin?.size) {
    for (const [code, clients] of _S.articleClients) {
      if (!_isSixDigitCode(code)) continue;
      let n = 0;
      for (const cc of clients) {
        if (_S.clientsMagasin.has(cc)) n++;
      }
      if (n >= 1) {
        const a = _ensure(code);
        a.nbClientsPDV = n;
        a.sources.add('pdvClients');
      }
    }
  }

  // ── Enrichir stock + CA agence ──
  const finalByCode = new Map();
  for (const r of finalData) {
    finalByCode.set(r.code, r);
    const a = _ensure(r.code);
    a.enStock = (r.stockActuel || 0) > 0;
    a.stockActuel = r.stockActuel || 0;
    a.emplacement = r.emplacement || '';
    a.statut = r.statut || '';
    a.abcClass = r.abcClass || '';
    a.fmrClass = r.fmrClass || '';
    if (!a.famille) a.famille = r.famille || '';
  }
  const myArts = vpm[myStore] || {};
  for (const [code, data] of Object.entries(myArts)) {
    const a = articleData.get(code);
    if (a) a.caAgence = data.sumCA || 0;
  }
  // Direction fallback via famille
  for (const [, a] of articleData) {
    if (!a.direction && a.famille) {
      const letter = a.famille[0] || '';
      a.direction = FAM_UNIVERS_TO_DIR[letter] || 'NON CLASSÉ';
    }
  }

  // ── Score composite + classification ──
  for (const [, a] of articleData) {
    let score = 0;
    if (a.nbAgencesReseau >= 3) score += 40;
    else if (a.nbAgencesReseau >= 1) score += 15;
    if (a.nbClientsZone >= 5) score += 30;
    else if (a.nbClientsZone >= 2) score += 15;
    else if (a.nbClientsZone >= 1) score += 5;
    if (a.nbClientsHorsZone >= 3) score += 20;
    else if (a.nbClientsHorsZone >= 1) score += 8;
    // Pénétration PDV : articles populaires auprès de ma base clients
    if (a.nbClientsPDV >= 10) score += 25;
    else if (a.nbClientsPDV >= 5) score += 15;
    else if (a.nbClientsPDV >= 3) score += 8;
    if (a.nbBLLivraisons >= 50) score += 30;
    else if (a.nbBLLivraisons >= 10) score += 20;
    else if (a.nbBLLivraisons >= 3) score += 10;
    const nbSources = a.sources.size;
    if (nbSources >= 4) score *= 1.5;
    else if (nbSources >= 3) score *= 1.3;
    else if (nbSources >= 2) score *= 1.1;
    a.score = Math.round(score);

    // ── Classification squelette ──────────────────────────────────
    // W = fréquence BL agence, nbClientsPDV = clients distincts PDV
    const fd = finalByCode.get(a.code);
    const W = fd?.W || 0;

    if (a.enStock) {
      // CHALLENGER : en stock ET 0 vente (W=0 = aucun BL sur la période)
      if (W === 0)
        a.classification = 'challenger';
      // SOCLE : ≥3 clients distincts ET ≥3 BL — validé par le marché
      else if (a.nbClientsPDV >= 3 && W >= 3)
        a.classification = 'socle';
      // À SURVEILLER : le reste — en stock, actif mais pas encore socle
      else
        a.classification = 'surveiller';
    } else {
      // ── Filtre Fin de Vie : exclure les articles morts du catalogue ──
      // 1. Statut local ERP = fin de série / fin de stock → bruit
      const _sl = (fd?.statut || '').toLowerCase();
      const _isFin = _sl.includes('fin de série') || _sl.includes('fin de serie') || _sl.includes('fin de stock');
      if (_isFin) { a.classification = 'bruit'; continue; }
      // 2. Signal réseau mort : toutes les agences qui vendent ont MIN/MAX=0/0 → produit bloqué nationalement
      if (a.nbAgencesReseau >= 1 && _S.stockParMagasin) {
        let _anyMinMax = false;
        for (const s of Object.keys(vpm)) {
          if (s === myStore) continue;
          const stk = _S.stockParMagasin[s]?.[a.code];
          if (stk && ((stk.qteMin || 0) > 0 || (stk.qteMax || 0) > 0)) { _anyMinMax = true; break; }
        }
        if (!_anyMinMax) { a.classification = 'bruit'; continue; }
      }
      // À IMPLANTER : pas en stock ET signal fort
      const detention = a.nbAgencesReseau / nbStoresExclMy;
      const isIncontournable = detention >= 0.6 || (fd?.abcClass === 'A');
      const isNouveaute = fd?.isNouveaute || (fd?.ageJours != null && fd.ageJours < 90 && a.nbAgencesReseau >= 2);
      if (isIncontournable || isNouveaute || a.nbClientsZone >= 5 || a.caClientsZone >= 1000)
        a.classification = 'implanter';
      else
        a.classification = 'bruit';
    }
  }

  // ── Grouper par direction ──
  const results = [];
  const totals = { socle: 0, implanter: 0, challenger: 0, surveiller: 0 };
  for (const [, a] of articleData) {
    if (a.classification === 'bruit') continue;
    if (directionFilter && a.direction !== directionFilter) continue;
    if (a.classification === 'socle') totals.socle++;
    else if (a.classification === 'implanter') totals.implanter++;
    else if (a.classification === 'challenger') totals.challenger++;
    else if (a.classification === 'surveiller') totals.surveiller++;
    results.push(a);
  }
  const byDir = new Map();
  for (const a of results) {
    const dir = a.direction || 'NON CLASSÉ';
    if (!byDir.has(dir)) byDir.set(dir, { direction: dir, socle: [], implanter: [], challenger: [], surveiller: [] });
    byDir.get(dir)[a.classification].push(a);
  }
  for (const [, d] of byDir) {
    d.socle.sort((a, b) => b.score - a.score);
    d.implanter.sort((a, b) => b.score - a.score);
    d.challenger.sort((a, b) => a.score - b.score);
    d.surveiller.sort((a, b) => b.score - a.score);
  }

  const directions = Array.from(byDir.values());
  directions.sort((a, b) =>
    (b.implanter.length + b.challenger.length) - (a.implanter.length + a.challenger.length)
  );
  const _result = { directions, totals };
  _sqCacheKey = _sk; _sqCacheResult = _result;
  return _result;
}

// ═══════════════════════════════════════════════════════════════
// BOUCLIER SQUELETTE — Verdicts + overrides MIN/MAX
// Le Merchandising pilote la Supply Chain.
// Appelé dans processData() APRÈS computeABCFMR + Vitesse Réseau.
// ═══════════════════════════════════════════════════════════════

const _VERDICT_MAP = {
  socle:      { incontournable: 'Le Capitaine', nouveaute: 'La Bonne Pioche', specialiste: 'Le Lien Fort', standard: 'Le Bon Soldat' },
  surveiller: { incontournable: "L'Alerte Rouge", nouveaute: 'Le Stagiaire', specialiste: 'Le Point de Rupture', standard: 'Le Déclinant' },
  challenger: { incontournable: 'La Réf Schizo', nouveaute: "L'Erreur de Casting", specialiste: 'La Trahison', standard: 'Le Poids Mort' },
  implanter:  { incontournable: 'Le Trou Critique', nouveaute: 'Le Pari du Réseau', specialiste: 'La Conquête', standard: "L'Opportunité Locale" },
};

// Lite squelette classification (finalData uniquement) — évite un computeSquelette() complet
// pendant l'étape "Verdicts" (hot path au chargement).
function _computeSqClassifMapForVerdicts({ vpm, myStore, stores, nbStores, finalData, finalCodes }) {
  const nbStByCode = new Map(); // code → nb agences réseau (hors myStore) où countBL>0
  for (const code of finalCodes) {
    let n = 0;
    for (let i = 0; i < stores.length; i++) {
      const d = vpm[stores[i]]?.[code];
      if (d && d.countBL > 0) n++;
    }
    nbStByCode.set(code, n);
  }

  // Chalandise zone: caZone + nbClientsZone (capé à 5 car seul le seuil >=5 est utilisé)
  const zone = new Map(); // code → {ca, n, _cli:Set|null}
  const hasChal = _S.chalandiseReady && _S.chalandiseData?.size > 0;
  if (hasChal && finalCodes.size > 0) {
    const chal = _S.chalandiseData;
    const _ensureZ = (code) => {
      let z = zone.get(code);
      if (!z) { z = { ca: 0, n: 0, _cli: new Set() }; zone.set(code, z); }
      return z;
    };
    const _addCli = (z, cc) => {
      if (z.n >= 5) return;
      const s = z._cli;
      if (s && !s.has(cc)) {
        s.add(cc); z.n++;
        if (z.n >= 5) z._cli = null; // on n'a plus besoin de dédup au-delà de 5
      }
    };
    for (const [cc, artMap] of (_S.ventesClientArticle || new Map())) {
      if (!chal.has(cc)) continue;
      for (const [code, data] of artMap) {
        if (!finalCodes.has(code) || !_isSixDigitCode(code)) continue;
        const z = _ensureZ(code);
        z.ca += +(data?.sumCA || 0);
        _addCli(z, cc);
      }
    }
    for (const [cc, artMap] of (_S.ventesClientHorsMagasin || new Map())) {
      if (!chal.has(cc)) continue;
      for (const [code, data] of artMap) {
        if (!finalCodes.has(code) || !_isSixDigitCode(code)) continue;
        const z = _ensureZ(code);
        z.ca += +(data?.sumCA || 0);
        _addCli(z, cc);
      }
    }
    if (_S.territoireReady && _S.territoireLines?.length) {
      for (const l of _S.territoireLines) {
        if (l.isSpecial || !l.clientCode || !chal.has(l.clientCode)) continue;
        const code = l.code;
        if (!finalCodes.has(code) || !_isSixDigitCode(code)) continue;
        const z = _ensureZ(code);
        z.ca += +(l.ca || 0);
        _addCli(z, l.clientCode);
      }
    }
  }

  // nbClientsPDV (capé à 3 car seul le seuil >=3 est utilisé pour SOCLE)
  const nbClientsPDVCache = new Map();
  const _getNbClientsPDV = (code) => {
    const cached = nbClientsPDVCache.get(code);
    if (cached !== undefined) return cached;
    const cm = _S.clientsMagasin;
    const clients = _S.articleClients?.get(code);
    if (!cm?.size || !clients?.size) { nbClientsPDVCache.set(code, 0); return 0; }
    let n = 0;
    for (const cc of clients) {
      if (cm.has(cc)) { n++; if (n >= 3) break; }
    }
    nbClientsPDVCache.set(code, n);
    return n;
  };

  const classifMap = new Map(); // code → 'socle'|'implanter'|'challenger'|'surveiller'
  for (const r of finalData) {
    const code = r?.code;
    if (!code) continue;
    const enStock = (r.stockActuel || 0) > 0;
    const W = r.W || 0;
    const nbAgencesReseau = nbStByCode.get(code) || 0;
    const z = zone.get(code);
    const nbClientsZone = z?.n || 0;
    const caClientsZone = z?.ca || 0;

    let classif = 'bruit';
    if (enStock) {
      if (W === 0) classif = 'challenger';
      else if (W >= 3 && _getNbClientsPDV(code) >= 3) classif = 'socle';
      else classif = 'surveiller';
    } else {
      const _sl = (r.statut || '').toLowerCase();
      const _isFin = _sl.includes('fin de série') || _sl.includes('fin de serie') || _sl.includes('fin de stock');
      if (_isFin) { classif = 'bruit'; }
      else {
        if (nbAgencesReseau >= 1 && _S.stockParMagasin) {
          let anyMinMax = false;
          for (let i = 0; i < stores.length; i++) {
            const stk = _S.stockParMagasin[stores[i]]?.[code];
            if (stk && ((stk.qteMin || 0) > 0 || (stk.qteMax || 0) > 0)) { anyMinMax = true; break; }
          }
          if (!anyMinMax) { classif = 'bruit'; continue; }
        }
        const detention = nbAgencesReseau / Math.max(1, nbStores);
        const isIncontournable = detention >= 0.6 || (r.abcClass === 'A');
        const isNouveaute = r.isNouveaute || (r.ageJours != null && r.ageJours < 90 && nbAgencesReseau >= 2);
        if (isIncontournable || isNouveaute || nbClientsZone >= 5 || caClientsZone >= 1000)
          classif = 'implanter';
        else
          classif = 'bruit';
      }
    }
    if (classif !== 'bruit') classifMap.set(code, classif);
  }

  return { classifMap, nbStByCode };
}

export function applyVerdictOverrides() {
  const vpm = _S.ventesParMagasin || {};
  const myStore = _S.selectedMyStore;
  if (!myStore || !Object.keys(vpm).length) return 0;

  const stores = Object.keys(vpm).filter(s => s !== myStore);
  const nbStores = Math.max(stores.length, 1);
  const finalData = _S.finalData || [];
  const finalCodes = new Set();
  for (const r of finalData) if (r?.code) finalCodes.add(r.code);

  // Index hors-magasin : code → cc[] (array, pas Set — moins d'alloc)
  const hmBuyers = new Map();
  if (_S.ventesClientHorsMagasin) {
    for (const [cc, artMap] of _S.ventesClientHorsMagasin) {
      for (const code of artMap.keys()) {
        if (!finalCodes.has(code)) continue;
        let arr = hmBuyers.get(code);
        if (!arr) { arr = []; hmBuyers.set(code, arr); }
        arr.push(cc);
      }
    }
  }

  // Cache clients dont le métier est stratégique (pré-calculé une seule fois)
  const stratMetierClients = new Set();
  if (_S.chalandiseData?.size) {
    for (const [cc, info] of _S.chalandiseData) {
      if (info.metier && _isMetierStrategique(info.metier)) stratMetierClients.add(cc);
    }
  }

  // Squelette : classifications par code (lite, finalData uniquement)
  const { classifMap, nbStByCode } = _computeSqClassifMapForVerdicts({ vpm, myStore, stores, nbStores, finalData, finalCodes });

  let overrideCount = 0;
  let facingCount = 0;

  for (const r of finalData) {
    const classif = classifMap.get(r.code);
    if (!classif) { r._sqClassif = ''; r._sqRole = ''; r._sqVerdict = ''; continue; }
    r._sqClassif = classif;

    // ── Calcul du rôle Physigamme (adapté de _prComputeRoles) ──
    const nbSt = nbStByCode.get(r.code) || 0;
    const detention = nbSt / nbStores;
    const W = r.W || 0;

    // Comptage union(buyersMag, hmArr) SANS allouer de Set par article
    const buyersMag = _S.articleClients?.get(r.code);
    const hmArr = hmBuyers.get(r.code);
    let nbCli = 0, nbCliMetierStrat = 0;
    if (buyersMag?.size) {
      for (const cc of buyersMag) {
        nbCli++;
        if (stratMetierClients.has(cc)) nbCliMetierStrat++;
      }
    }
    if (hmArr) {
      for (let j = 0; j < hmArr.length; j++) {
        const cc = hmArr[j];
        if (buyersMag?.has(cc)) continue; // déjà compté
        nbCli++;
        if (stratMetierClients.has(cc)) nbCliMetierStrat++;
      }
    }

    let role = 'standard';
    if (detention >= 0.6 || (r.abcClass === 'A' && W >= 12)) role = 'incontournable';
    else if (r.isNouveaute || (r.ageJours != null && r.ageJours < 90 && nbSt >= 2)) role = 'nouveaute';
    else if (nbCli >= 2 && nbCliMetierStrat / nbCli >= 0.5) role = 'specialiste';

    // Fix Poids Mort : challenger avec demande externe → upgrade rôle
    if (role === 'standard' && W === 0 && (r.stockActuel || 0) > 0) {
      if (nbSt >= 1) role = 'incontournable';
      else if (nbCli >= 1) role = 'specialiste';
    }

    r._sqRole = role;
    r._sqVerdict = _VERDICT_MAP[classif]?.[role] || '';

    // ── Geste 2 : MIN_FACING — plancher visuel pour petits produits fréquents ──
    if (r.abcClass === 'C' && r.fmrClass === 'F' && r.nouveauMax > 0 && r.nouveauMax < 10) {
      r.nouveauMax = 10;
      facingCount++;
    }
  }

  // ── Geste 3 : Bouclier Squelette — overrides MIN/MAX ──
  // Passe 1 : Poids Mort / Erreur de Casting → 0/0, collecter Trahisons par famille
  const trahisonsByFam = new Map(); // famille → [ref, ...]
  const MAX_ANCRES_PAR_FAMILLE = 5;

  for (const r of (_S.finalData || [])) {
    if (r._sqClassif !== 'challenger') continue;

    if (r._sqRole === 'standard' || r._sqRole === 'nouveaute') {
      // Poids Mort / Erreur de Casting → couper les vivres
      if (r.nouveauMin > 0 || r.nouveauMax > 0) {
        r.nouveauMin = 0; r.nouveauMax = 0;
        r._vitesseReseau = false;
        r._verdictOverride = true;
        overrideCount++;
      }
    } else if (r._sqRole === 'specialiste') {
      // La Trahison → candidat Ancre Métier (quota par famille)
      const fam = r.famille || 'SANS_FAMILLE';
      if (!trahisonsByFam.has(fam)) trahisonsByFam.set(fam, []);
      trahisonsByFam.get(fam).push(r);
    }
    // Réf Schizo (incontournable) → garder, nécessite investigation commerciale
  }

  // Passe 2 : Ancre Métier — top 5 par famille (prix décroissant), reste purgé
  for (const [, refs] of trahisonsByFam) {
    refs.sort((a, b) => (b.prixUnitaire || 0) - (a.prixUnitaire || 0));
    for (let i = 0; i < refs.length; i++) {
      const r = refs[i];
      if (i < MAX_ANCRES_PAR_FAMILLE) {
        // Ancre Métier : pardonné, 1 exemplaire
        r._sqVerdict = 'Ancre Métier';
        r.nouveauMin = 1; r.nouveauMax = 1;
        r._vitesseReseau = false;
        r._verdictOverride = true;
        overrideCount++;
      } else {
        // Trahison non pardonnée : purge
        r.nouveauMin = 0; r.nouveauMax = 0;
        r._vitesseReseau = false;
        r._verdictOverride = true;
        overrideCount++;
      }
    }
  }

  return { overrides: overrideCount, facings: facingCount };
}

// ═══════════════════════════════════════════════════════════════
// MA CLIENTÈLE — Cartographie métiers + drill-down
// Croise chalandise × ventesClientArticle × stock
// ═══════════════════════════════════════════════════════════════

export function computeMaClientele(metierFilter, distanceKm) {
  if (!_S.chalandiseReady || !_S.chalandiseData?.size) return null;

  const stockMap = new Map((_S.finalData || []).map(r => [r.code, r]));
  const _distOk = (cc) => {
    if (!distanceKm) return true;
    const info = _S.chalandiseData.get(cc);
    if (!info || info.distanceKm == null) return true;
    return info.distanceKm <= distanceKm;
  };

  // ═══ NIVEAU 1 : Cartographie par métier ═══
  if (!metierFilter) {
    const metiers = [];
    let totalClients = 0;
    let totalActifs = 0;
    let totalCA = 0;
    for (const [metier, clientSet] of _S.clientsByMetier) {
      if (!metier) continue;

      let nbFiltered = 0, nbActifs = 0, nbProspects = 0, caTotal = 0;
      const articlesSet = new Set();

      for (const cc of clientSet) {
        if (!_distOk(cc)) continue;
        nbFiltered++;
        const vca = _S.ventesClientArticle?.get(cc);
        if (vca && vca.size > 0) {
          nbActifs++;
          for (const [code, data] of vca) {
            caTotal += data.sumCA || 0;
            articlesSet.add(code);
          }
        } else {
          nbProspects++;
        }
      }

      let articlesEnStock = 0;
      for (const code of articlesSet) {
        const stock = stockMap.get(code);
        if (stock && (stock.stockActuel || 0) > 0) articlesEnStock++;
      }

      const articlesTotaux = articlesSet.size;
      const couverture = articlesTotaux > 0 ? Math.round(articlesEnStock / articlesTotaux * 100) : 0;

      if (nbFiltered === 0) continue;

      totalClients += nbFiltered;
      totalActifs += nbActifs;
      totalCA += caTotal;
      metiers.push({
        metier, nbClients: nbFiltered, nbActifs, nbProspects,
        caTotal, nbArticles: articlesTotaux, couverture,
      });
    }

    metiers.sort((a, b) => b.caTotal - a.caTotal);

    return {
      level: 1,
      metiers,
      totalClients,
      totalActifs,
      totalCA,
      nbMetiers: metiers.length
    };
  }

  // ═══ NIVEAU 2 : Drill-down dans un métier ═══
  const clientSet = _S.clientsByMetier.get(metierFilter);
  if (!clientSet || !clientSet.size) return null;

  const univers = new Map();
  const clientDetails = [];
  let nbActifs = 0;
  let nbProspects = 0;
  let caTotalClients = 0;

  for (const cc of clientSet) {
    if (!_distOk(cc)) continue;
    const chal = _S.chalandiseData.get(cc);
    const vca = _S.ventesClientArticle?.get(cc);
    const vcaHors = _S.ventesClientHorsMagasin?.get(cc);
    if (!vca && !vcaHors) {
      // Prospect sans achats
      clientDetails.push({
        cc, nom: _S.clientStore?.get(cc)?.nom || chal?.nom || cc,
        cp: chal?.cp || '', commercial: chal?.commercial || '',
        classification: chal?.classification || '', statut: chal?.statut || '',
        ca: 0, nbFamilles: 0, isActif: false,
      });
      nbProspects++;
      continue;
    }

    let clientCA = 0;
    const clientFamilles = new Set();

    const _agg = (code, ca, countBL) => {
      const famCode = _S.articleFamille?.[code] || '';
      if (!famCode) return;
      const letter = famCode.match(/^[A-Z]/)?.[0] || '';
      const univName = FAM_LETTER_UNIVERS[letter] || 'Autre';
      const famName = FAMILLE_LOOKUP[famCode] || famCode;
      clientFamilles.add(famCode);

      if (!univers.has(univName)) univers.set(univName, { ca: 0, familles: new Map() });
      const u = univers.get(univName);
      u.ca += ca;
      if (!u.familles.has(famCode)) u.familles.set(famCode, { famCode, famName, ca: 0, articles: new Map() });
      const f = u.familles.get(famCode);
      f.ca += ca;
      if (!f.articles.has(code)) {
        const stock = stockMap.get(code);
        f.articles.set(code, {
          code, libelle: articleLib(code),
          ca: 0, countBL: 0,
          enStock: stock ? (stock.stockActuel || 0) > 0 : false,
          rupture: stock ? (stock.stockActuel || 0) === 0 && !!stock.emplacement : false,
          stockActuel: stock?.stockActuel ?? null,
          nbClients: 0,
        });
      }
      const art = f.articles.get(code);
      art.ca += ca;
      art.countBL += countBL || 0;
      art.nbClients++;
    };

    if (vca) {
      for (const [code, data] of vca) {
        const ca = data.sumCA || 0;
        clientCA += ca;
        _agg(code, ca, data.countBL || 0);
      }
    }
    if (vcaHors) {
      for (const [code, data] of vcaHors) {
        const ca = data.sumCA || 0;
        clientCA += ca;
        _agg(code, ca, 0);
      }
    }

    const isActif = !!(vca && vca.size > 0);
    clientDetails.push({
      cc, nom: _S.clientStore?.get(cc)?.nom || chal?.nom || cc,
      cp: chal?.cp || '', commercial: chal?.commercial || '',
      classification: chal?.classification || '', statut: chal?.statut || '',
      ca: clientCA, nbFamilles: clientFamilles.size, isActif,
    });
    caTotalClients += clientCA;
    if (isActif) nbActifs++;
    else nbProspects++;
  }

  clientDetails.sort((a, b) => b.ca - a.ca);

  // Sort hierarchy
  const univSorted = [];
  for (const [name, u] of univers.entries()) {
    const familles = [];
    for (const f of u.familles.values()) {
      const articles = Array.from(f.articles.values());
      articles.sort((a, b) => b.ca - a.ca);
      let nbEnStock = 0;
      for (const a of articles) if (a.enStock) nbEnStock++;
      const nbTotal = articles.length;
      familles.push({
        ...f,
        articles,
        nbEnStock,
        nbTotal,
        couverture: nbTotal > 0 ? Math.round(nbEnStock / nbTotal * 100) : 0
      });
    }
    familles.sort((a, b) => b.ca - a.ca);
    univSorted.push({ name, ca: u.ca, familles });
  }
  univSorted.sort((a, b) => b.ca - a.ca);

  const totalArticles = new Set();
  const totalEnStock = new Set();
  for (const u of univSorted) {
    for (const f of u.familles) {
      for (const a of f.articles) {
        totalArticles.add(a.code);
        if (a.enStock) totalEnStock.add(a.code);
      }
    }
  }

  return {
    level: 2,
    metier: metierFilter,
    nbClients: clientDetails.length,
    nbActifs,
    nbProspects,
    caTotal: caTotalClients,
    couvertureGlobale: totalArticles.size > 0 ? Math.round(totalEnStock.size / totalArticles.size * 100) : 0,
    univers: univSorted,
    clients: clientDetails,
    nbArticlesDistincts: totalArticles.size,
    nbArticlesEnStock: totalEnStock.size,
  };
}

// ═══════════════════════════════════════════════════════════════
// Animation — préparation d'animations commerciales par marque
// ═══════════════════════════════════════════════════════════════

export function computeAnimation(marque) {
  if (!marque || !_S.marqueArticles?.has(marque)) return null;

  const marqueArticles = _S.marqueArticles.get(marque); // Set<code>
  const marqueCodes = new Set();
  for (const code of marqueArticles) marqueCodes.add(code.replace(/^0+/, '').padStart(6, '0'));
  const stockMap = new Map((_S.finalData || []).map(r => [r.code, r]));
  const vpm = _S.ventesParMagasin || {};
  const myStore = _S.selectedMyStore;
  const hasChal = _S.chalandiseReady && _S.chalandiseData?.size > 0;

  const reseauByCode = new Map(); // code -> {nbAgencesReseau, caReseau}
  for (const [store, arts] of Object.entries(vpm)) {
    if (store === myStore) continue;
    for (const [code, d] of Object.entries(arts)) {
      if (!marqueCodes.has(code) || !(d?.countBL > 0)) continue;
      if (!reseauByCode.has(code)) reseauByCode.set(code, { nbAgencesReseau: 0, caReseau: 0 });
      const e = reseauByCode.get(code);
      e.nbAgencesReseau++;
      e.caReseau += d.sumCA || 0;
    }
  }

  const buyersByCode = new Map(); // code -> cc[]
  const brandAggByClient = new Map(); // cc -> {caMarque, nbArticlesMarque}
  if (_S.ventesClientArticle) {
    for (const [cc, artMap] of _S.ventesClientArticle) {
      let caMarque = 0;
      let nbArticlesMarque = 0;
      for (const [code, d] of artMap) {
        if (!marqueCodes.has(code)) continue;
        caMarque += d.sumCA || 0;
        nbArticlesMarque++;
        if (!buyersByCode.has(code)) buyersByCode.set(code, []);
        buyersByCode.get(code).push(cc);
      }
      if (nbArticlesMarque > 0) brandAggByClient.set(cc, { caMarque, nbArticlesMarque });
    }
  }

  // ═══ 1. ARTICLES — classifier chaque article de la marque ═══
  const articles = [];
  for (const normCode of marqueCodes) {
    const stock = stockMap.get(normCode);
    const famille = _S.articleFamille?.[normCode] || '';
    const libelle = articleLib(normCode);
    const catFam = _S.catalogueFamille?.get(normCode);

    // Status stock
    let stockStatus, stockActuel = null;
    if (stock) {
      stockActuel = stock.stockActuel || 0;
      stockStatus = stockActuel > 0 ? 'enStock' : 'rupture';
    } else {
      stockStatus = 'absent';
    }

    // Vendu dans mon agence ?
    const myData = vpm[myStore]?.[normCode];
    const caAgence = myData?.sumCA || 0;
    const blAgence = myData?.countBL || 0;

    // Vendu dans le réseau ?
    const reseau = reseauByCode.get(normCode);
    const nbAgencesReseau = reseau?.nbAgencesReseau || 0;
    const caReseau = reseau?.caReseau || 0;
    const clientsAcheteurs = buyersByCode.get(normCode) || [];
    const nbClients = clientsAcheteurs.length;

    articles.push({
      code: normCode, libelle, famille,
      famLabel: catFam?.libFam || famLib(famille) || famille,
      sousFam: catFam?.sousFam || '',
      stockStatus, stockActuel,
      caAgence, blAgence,
      nbAgencesReseau, caReseau,
      nbClients, clientsAcheteurs
    });
  }

  // Trier : en stock d'abord, puis rupture, puis absent. Par CA agence décroissant.
  const stockOrder = { enStock: 0, rupture: 1, absent: 2 };
  articles.sort((a, b) => stockOrder[a.stockStatus] - stockOrder[b.stockStatus] || b.caAgence - a.caAgence);

  // Stats articles
  let nbEnStock = 0, nbRupture = 0, nbAbsent = 0, nbVendusReseau = 0;
  for (const a of articles) {
    if (a.stockStatus === 'enStock') nbEnStock++;
    else if (a.stockStatus === 'rupture') nbRupture++;
    else nbAbsent++;
    if (a.nbAgencesReseau > 0) nbVendusReseau++;
  }

  // Par famille
  const famMap = new Map();
  for (const a of articles) {
    const fam = a.famLabel || 'Non classé';
    if (!famMap.has(fam)) famMap.set(fam, { articles: [], enStock: 0, absent: 0, rupture: 0 });
    const f = famMap.get(fam);
    f.articles.push(a);
    if (a.stockStatus === 'enStock') f.enStock++;
    else if (a.stockStatus === 'rupture') f.rupture++;
    else f.absent++;
  }
  const familles = [];
  for (const [name, d] of famMap.entries()) familles.push({ name, ...d });
  familles.sort((a, b) => b.articles.length - a.articles.length);

  // ═══ 2. CLIENTS — qui achète cette marque + qui devrait ═══

  // Clients acheteurs (ont acheté au moins 1 article de la marque)
  const clientSet = new Set(brandAggByClient.keys());

  const clientsActifs = [];
  let caMarqueAgence = 0;
  for (const cc of clientSet) {
    const chal = _S.chalandiseData?.get(cc);
    const agg = brandAggByClient.get(cc) || { caMarque: 0, nbArticlesMarque: 0 };
    caMarqueAgence += agg.caMarque;
    clientsActifs.push({
      cc,
      nom: _S.clientStore?.get(cc)?.nom || chal?.nom || cc,
      metier: chal?.metier || '',
      commercial: chal?.commercial || '',
      cp: chal?.cp || '',
      caMarque: agg.caMarque,
      nbArticlesMarque: agg.nbArticlesMarque,
      type: 'acheteur'
    });
  }
  clientsActifs.sort((a, b) => b.caMarque - a.caMarque);

  // ═══ Conquête : clients qui achètent la CONCURRENCE dans les mêmes familles ═══
  // Identifier les familles de la marque
  const marqueFams = new Set();
  for (const a of articles) if (a.famille) marqueFams.add(a.famille);

  // Identifier les marques concurrentes dans ces familles
  const concurrentCodes = new Map(); // code -> marque concurrente
  if (_S.catalogueMarques?.size) {
    for (const [code, m] of _S.catalogueMarques) {
      if (m === marque) continue; // même marque
      const fam = _S.articleFamille?.[code];
      if (!fam || !marqueFams.has(fam)) continue; // pas dans les mêmes familles
      concurrentCodes.set(code, m);
    }
  }

  const clientsConquete = [];
  if (hasChal && concurrentCodes.size > 0 && _S.ventesClientArticle) {
    for (const [cc, artMap] of _S.ventesClientArticle) {
      if (clientSet.has(cc)) continue; // déjà acheteur de la marque
      let caConcurrence = 0;
      const marquesConcurrentes = new Set();
      for (const [code, d] of artMap) {
        const mc = concurrentCodes.get(code);
        if (mc) { caConcurrence += d.sumCA || 0; marquesConcurrentes.add(mc); }
      }
      if (caConcurrence <= 0) continue;
      const chal = _S.chalandiseData?.get(cc);
      clientsConquete.push({
        cc,
        nom: _S.clientStore?.get(cc)?.nom || chal?.nom || cc,
        metier: chal?.metier || '',
        commercial: chal?.commercial || '',
        cp: chal?.cp || '',
        caConcurrence,
        marquesConcurrentes: [...marquesConcurrentes].slice(0, 3).join(', '),
        type: 'conquete'
      });
    }
    clientsConquete.sort((a, b) => b.caConcurrence - a.caConcurrence);
  }

  // ═══ Labo : clients qui achètent du consommable de la marque mais pas les machines ═══
  // Heuristique : consommable = sous-famille contenant foret/disque/lame/embout/insert/mèche
  // Machine = articles avec PU > 50€ et pas consommable
  const consoPattern = /foret|disque|lame|embout|insert|m[eè]che|abrasif|pointe|clou|agrafe|accessoire/i;
  const consoCodesMarque = new Set();
  const machineCodesMarque = new Set();
  for (const a of articles) {
    const sf = (a.sousFam || a.famLabel || '').toLowerCase();
    const lib = (a.libelle || '').toLowerCase();
    if (consoPattern.test(sf) || consoPattern.test(lib)) {
      consoCodesMarque.add(a.code);
    } else {
      const fd = stockMap.get(a.code);
      if (fd && (fd.prixUnitaire || 0) > 50) machineCodesMarque.add(a.code);
    }
  }

  const clientsLabo = [];
  if (consoCodesMarque.size > 0 && machineCodesMarque.size > 0 && _S.ventesClientArticle) {
    for (const [cc, artMap] of _S.ventesClientArticle) {
      let acheteConsoMarque = false, acheteMachineMarque = false;
      let caConso = 0;
      for (const [code, d] of artMap) {
        if (consoCodesMarque.has(code)) { acheteConsoMarque = true; caConso += d.sumCA || 0; }
        if (machineCodesMarque.has(code)) acheteMachineMarque = true;
      }
      if (acheteConsoMarque && !acheteMachineMarque) {
        const chal = _S.chalandiseData?.get(cc);
        clientsLabo.push({
          cc,
          nom: _S.clientStore?.get(cc)?.nom || chal?.nom || cc,
          metier: chal?.metier || '',
          commercial: chal?.commercial || '',
          cp: chal?.cp || '',
          caConso,
          type: 'labo'
        });
      }
    }
    clientsLabo.sort((a, b) => b.caConso - a.caConso);
  }

  // Clients prospects : même métier que les acheteurs, mais n'achètent pas la marque
  const clientsProspects = [];
  const conqueteSet = new Set(clientsConquete.map(c => c.cc));
  const laboSet = new Set(clientsLabo.map(c => c.cc));
  if (hasChal) {
    const metiersAcheteurs = new Set();
    for (const c of clientsActifs) {
      if (c.metier) metiersAcheteurs.add(c.metier);
    }

    for (const metier of metiersAcheteurs) {
      const metierClients = _S.clientsByMetier?.get(metier);
      if (!metierClients) continue;
      for (const cc of metierClients) {
        if (clientSet.has(cc) || conqueteSet.has(cc) || laboSet.has(cc)) continue;
        const chal = _S.chalandiseData.get(cc);
        const vca = _S.ventesClientArticle?.get(cc);
        let caTotalPDV = 0;
        if (vca) for (const v of vca.values()) caTotalPDV += v.sumCA || 0;

        clientsProspects.push({
          cc,
          nom: _S.clientStore?.get(cc)?.nom || chal?.nom || cc,
          metier: chal?.metier || '',
          commercial: chal?.commercial || '',
          cp: chal?.cp || '',
          caTotalPDV,
          type: 'prospect'
        });
      }
    }
    clientsProspects.sort((a, b) => b.caTotalPDV - a.caTotalPDV);
  }

  // ═══ Trous critiques : articles vendus par le réseau et NON RÉFÉRENCÉS (absent) chez moi ═══
  // Les ruptures (référencés mais stock=0) restent dans le bloc ruptures, pas ici
  const trousCritiques = articles
    .filter(a => a.stockStatus === 'absent' && a.nbAgencesReseau >= 2)
    .sort((a, b) => b.caReseau - a.caReseau);

  // Clients reconquête : acheteurs avec lastOrder > 60j
  const clientsReconquete = [];
  for (const c of clientsActifs) {
    const _rcRec = _S.clientStore?.get(c.cc);
    const lastDate = _rcRec?.lastOrderPDV || _S.clientLastOrder?.get(c.cc);
    if (!lastDate) continue;
    const daysSince = _rcRec?.silenceDaysPDV ?? Math.round((Date.now() - lastDate) / 86400000);
    if (daysSince > 60) {
      clientsReconquete.push({ ...c, daysSince, type: 'reconquete' });
    }
  }
  clientsReconquete.sort((a, b) => b.caMarque - a.caMarque);

  return {
    marque,
    nbArticlesTotal: articles.length,
    nbEnStock, nbRupture, nbAbsent, nbVendusReseau,
    articles,
    familles,
    trousCritiques,
    clients: {
      acheteurs: clientsActifs,
      conquete: clientsConquete.slice(0, 80),
      labo: clientsLabo.slice(0, 50),
      prospects: clientsProspects.slice(0, 100),
      reconquete: clientsReconquete,
    },
    totalClientsActifs: clientsActifs.length,
    totalConquete: clientsConquete.length,
    totalLabo: clientsLabo.length,
    totalProspects: clientsProspects.length,
    totalReconquete: clientsReconquete.length,
    caMarqueAgence,
  };
}

// ═══════════════════════════════════════════════════════════════
// computeMonRayon — Diagnostic complet d'un rayon par famille/sous-famille
// ═══════════════════════════════════════════════════════════════
export function computeMonRayon(codeFam, codeSousFam) {
  if (!codeFam) return null;

  const fd = _S.finalData || [];
  const vpm = _S.ventesParMagasin || {};
  const myStore = _S.selectedMyStore;
  const catFam = _S.catalogueFamille;
  const catMarq = _S.catalogueMarques;
  const vca = _S.ventesClientArticle;
  const matchCache = new Map();

  // Helper : article matche la famille/sous-famille ?
  const matchFam = (code) => {
    if (matchCache.has(code)) return matchCache.get(code);
    const cf = catFam?.get(code);
    let ok = false;
    if (cf) {
      ok = cf.codeFam === codeFam && (!codeSousFam || cf.codeSousFam === codeSousFam);
      matchCache.set(code, ok);
      return ok;
    }
    const fam = _S.articleFamille?.[code];
    ok = !!(fam && fam.startsWith(codeFam) && !codeSousFam);
    matchCache.set(code, ok);
    return ok;
  };

  // ═══ 1. MON RAYON — articles en stock dans cette famille ═══
  const monRayon = [];
  for (const r of fd) {
    if (!matchFam(r.code)) continue;
    monRayon.push({
      code: r.code,
      libelle: articleLib(r.code),
      marque: catMarq?.get(r.code) || '',
      sousFam: catFam?.get(r.code)?.sousFam || '',
      stockActuel: r.stockActuel || 0,
      W: r.W || 0,
      abcClass:    r.abcClass    || '',
      fmrClass:    r.fmrClass    || '',
      statut:      r.statut      || '',
      emplacement: r.emplacement || '',
      ancienMin:   r.ancienMin   || 0,
      ancienMax:   r.ancienMax   || 0,
      nouveauMin:  r.nouveauMin  || 0,
      nouveauMax:  r.nouveauMax  || 0,
      prixUnitaire: r.prixUnitaire || 0,
      caAgence:    vpm[myStore]?.[r.code]?.sumCA || 0,
      valeurStock: (r.stockActuel || 0) * (r.prixUnitaire || 0),
      status: 'standard'
    });
  }
  for (const a of monRayon) {
    if (a.W === 0 && a.stockActuel > 0) a.status = 'dormant';
    else if (a.stockActuel === 0) a.status = 'rupture';
    else if (a.abcClass === 'A' && a.fmrClass === 'F') a.status = 'pepite';
    else if (a.abcClass === 'C' && a.fmrClass === 'R') a.status = 'challenger';
  }
  monRayon.sort((a, b) => b.caAgence - a.caAgence);

  let nbEnStock = 0;
  let nbPepites = 0;
  let nbChallenger = 0;
  let nbDormants = 0;
  let nbRuptures = 0;
  let valeurTotale = 0;
  const mesCodes = new Set();
  for (const a of monRayon) {
    mesCodes.add(a.code);
    if (a.stockActuel > 0) nbEnStock++;
    if (a.status === 'pepite') nbPepites++;
    else if (a.status === 'challenger') nbChallenger++;
    else if (a.status === 'dormant') nbDormants++;
    else if (a.status === 'rupture') nbRuptures++;
    valeurTotale += a.valeurStock;
  }

  // ═══ 2. À IMPLANTER — vendus par le réseau, absents chez moi ═══
  const implanter = new Map();
  for (const [store, arts] of Object.entries(vpm)) {
    if (store === myStore) continue;
    for (const [code, data] of Object.entries(arts)) {
      if (!matchFam(code)) continue;
      if (data.countBL <= 0) continue;
      if (mesCodes.has(code)) continue;
      if (!implanter.has(code)) {
        implanter.set(code, {
          code,
          libelle: articleLib(code),
          marque: catMarq?.get(code) || '',
          sousFam: catFam?.get(code)?.sousFam || '',
          nbAgences: 0,
          caReseau: 0,
        });
      }
      const a = implanter.get(code);
      a.nbAgences++;
      a.caReseau += data.sumCA || 0;
    }
  }
  const aImplanter = Array.from(implanter.values());
  aImplanter.sort((a, b) => b.nbAgences - a.nbAgences || b.caReseau - a.caReseau);

  // ═══ 3. CLIENTS — qui achète cette famille chez moi ═══
  const clients = [];
  if (vca) {
    for (const [cc, artMap] of vca) {
      let caFam = 0, nbArt = 0;
      for (const [code, data] of artMap) {
        if (matchFam(code)) { caFam += data.sumCA || 0; nbArt++; }
      }
      if (nbArt > 0) {
        const chal = _S.chalandiseData?.get(cc);
        clients.push({
          cc,
          nom: _S.clientStore?.get(cc)?.nom || chal?.nom || cc,
          metier: chal?.metier || '',
          commercial: chal?.commercial || '',
          ca: caFam,
          nbArticles: nbArt
        });
      }
    }
  }
  clients.sort((a, b) => b.ca - a.ca);

  const metiersCount = {};
  for (const c of clients) {
    if (c.metier) metiersCount[c.metier] = (metiersCount[c.metier] || 0) + 1;
  }
  const topMetiers = Object.entries(metiersCount);
  topMetiers.sort((a, b) => b[1] - a[1]);
  if (topMetiers.length > 10) topMetiers.length = 10;

  // ═══ 4. CATALOGUE — tout ce qui existe dans cette famille ═══
  let nbCatalogue = 0;
  const catSousFams = {};
  const catMarques = {};
  let displayLibFam = FAMILLE_LOOKUP?.[codeFam] || codeFam;
  let displaySousFam = '';
  if (catFam) {
    for (const [code, f] of catFam) {
      if (f.codeFam !== codeFam) continue;
      if (!displayLibFam || displayLibFam === codeFam) displayLibFam = f.libFam || displayLibFam;
      if (codeSousFam && !displaySousFam && f.codeSousFam === codeSousFam) displaySousFam = f.sousFam || codeSousFam;
      if (codeSousFam && f.codeSousFam !== codeSousFam) continue;
      nbCatalogue++;
      const sf = f.sousFam || 'Non classé';
      catSousFams[sf] = (catSousFams[sf] || 0) + 1;
      const m = catMarq?.get(code) || 'Non classé';
      catMarques[m] = (catMarques[m] || 0) + 1;
    }
  }
  const couverture = nbCatalogue > 0 ? Math.round(mesCodes.size / nbCatalogue * 100) : 0;

  const sousFamilles = Object.entries(catSousFams);
  sousFamilles.sort((a, b) => b[1] - a[1]);

  const marques = Object.entries(catMarques);
  marques.sort((a, b) => b[1] - a[1]);
  if (marques.length > 15) marques.length = 15;

  return {
    codeFam,
    codeSousFam,
    libFam: displayLibFam,
    sousFam: displaySousFam,
    monRayon,
    nbEnStock,
    nbPepites,
    nbChallenger,
    nbDormants,
    nbRuptures,
    valeurTotale,
    aImplanter,
    clients,
    topMetiers,
    nbCatalogue,
    couverture,
    sousFamilles,
    marques,
  };
}

// ═══════════════════════════════════════════════════════════════
// computeRadarFamille — Vue radar par famille (fusion Squelette + Mon Rayon)
// Agrège toutes les données du Squelette par codeFam catalogue
// ═══════════════════════════════════════════════════════════════
export function computeRadarFamille() {
  const sqData = computeSquelette();
  const catFam = _S.catalogueFamille;
  const famInfoCache = new Map();

  // ── Compter nb articles dans le catalogue par famille ──
  const catCount = new Map();
  if (catFam) {
    for (const [, f] of catFam) {
      if (!f.codeFam) continue;
      catCount.set(f.codeFam, (catCount.get(f.codeFam) || 0) + 1);
    }
  }

  // ── Helper : retrouver codeFam + libFam d'un article ──
  const getFamInfo = (code) => {
    if (famInfoCache.has(code)) return famInfoCache.get(code);
    const cf = catFam?.get(code);
    let fi = null;
    if (cf?.codeFam) fi = { codeFam: cf.codeFam, libFam: cf.libFam || cf.codeFam };
    else {
      const fam = _S.articleFamille?.[code];
      if (fam) fi = { codeFam: fam, libFam: FAMILLE_LOOKUP[fam.slice(0, 2)] || fam };
    }
    famInfoCache.set(code, fi);
    return fi;
  };

  const famMap = new Map();
  const _ensure = (codeFam, libFam) => {
    if (!famMap.has(codeFam)) {
      famMap.set(codeFam, {
        codeFam, libFam,
        socle: 0, implanter: 0, challenger: 0, potentiel: 0, surveiller: 0,
        srcReseau: false, srcChalandise: false, srcHorsZone: false, srcLivraisons: false,
        caAgence: 0, caReseau: 0, nbClients: 0,
        nbCatalogue: catCount.get(codeFam) || 0,
        nbEnRayon: 0, couverture: 0, classifGlobal: 'potentiel',
        articles: { socle: [], implanter: [], challenger: [], potentiel: [], surveiller: [] },
      });
    }
    return famMap.get(codeFam);
  };

  // ── Grouper les articles du squelette par famille ──
  const CLASSIFS = ['socle', 'implanter', 'challenger', 'potentiel', 'surveiller'];
  for (const d of sqData.directions) {
    for (const g of CLASSIFS) {
      for (const a of (d[g] || [])) {
        const fi = getFamInfo(a.code);
        if (!fi) continue;
        const f = _ensure(fi.codeFam, fi.libFam);
        f[g]++;
        f.articles[g].push(a);
        if (a.sources.has('reseau'))     f.srcReseau     = true;
        if (a.sources.has('chalandise')) f.srcChalandise = true;
        if (a.sources.has('horsZone'))   f.srcHorsZone   = true;
        if (a.sources.has('livraisons')) f.srcLivraisons = true;
        f.caAgence += a.caAgence  || 0;
        f.caReseau += a.caReseau  || 0;
        if (a.enStock) f.nbEnRayon++;
      }
    }
  }

  // ── Clients par famille ──
  if (_S.ventesClientArticle) {
    for (const [, artMap] of _S.ventesClientArticle) {
      const seen = new Set();
      for (const code of artMap.keys()) {
        const fi = getFamInfo(code);
        if (fi && !seen.has(fi.codeFam)) {
          seen.add(fi.codeFam);
          const f = famMap.get(fi.codeFam);
          if (f) f.nbClients++;
        }
      }
    }
  }

  // ── Couverture + classification globale ──
  for (const [, f] of famMap) {
    f.couverture = f.nbCatalogue > 0 ? Math.round(f.nbEnRayon / f.nbCatalogue * 100) : 0;
    const totalStock  = f.socle + f.challenger + f.surveiller;
    const totalAbsent = f.implanter + f.potentiel;

    if (f.implanter >= 3 && f.challenger >= 3)
      f.classifGlobal = 'implanter';
    else if (f.implanter >= 2 && totalAbsent > totalStock * 0.3)
      f.classifGlobal = 'implanter';
    else if (f.socle >= 5 && f.challenger <= f.socle * 0.5)
      f.classifGlobal = 'socle';
    else if (f.socle >= 3 && f.challenger === 0)
      f.classifGlobal = 'socle';
    else if (f.challenger >= 5 && f.challenger > f.socle * 2)
      f.classifGlobal = 'challenger';
    else if (f.challenger > f.socle && f.socle < 2)
      f.classifGlobal = 'challenger';
    else if (f.implanter >= 1 || f.potentiel >= 3)
      f.classifGlobal = 'potentiel';
    else
      f.classifGlobal = 'surveiller';
  }

  // ── Enrichissement réseau : écart médiane, rang ──
  const obsLose = _S.benchLists?.obsFamiliesLose || [];
  const obsWin  = _S.benchLists?.obsFamiliesWin  || [];
  // Index par libellé de famille
  const obsIdx = new Map();
  for (const o of obsLose) obsIdx.set(o.fam, o);
  for (const o of obsWin) obsIdx.set(o.fam, o);
  // Rang réseau : familyPerf trié par priorityScore (déjà trié dans parser)
  const fpArr = _S.benchLists?.familyPerf || [];
  const fpIdx = new Map();
  for (let i = 0; i < fpArr.length; i++) fpIdx.set(fpArr[i].fam, i + 1);

  for (const [, f] of famMap) {
    // Croiser par libFam — c'est la clé utilisée par le benchmark (famLib sur code 2 lettres)
    const famKey = f.libFam;
    const obs = obsIdx.get(famKey);
    f.ecartReseau   = obs ? Math.round(obs.caMe - obs.caOther)     : null;
    f.ecartReseauPct = obs ? obs.ecartPct                           : null;
    f.caReseauMe     = obs ? Math.round(obs.caMe)                   : null;
    f.caReseauOther  = obs ? Math.round(obs.caOther)                : null;
    f.rangReseau     = fpIdx.get(famKey) || null;
    f.rangReseauTotal = fpArr.length || null;
  }

  const totals = { socle: 0, implanter: 0, challenger: 0, potentiel: 0, surveiller: 0 };
  const families = [];
  for (const f of famMap.values()) {
    if (f.socle + f.implanter + f.challenger + f.potentiel + f.surveiller <= 0) continue;
    if (totals[f.classifGlobal] != null) totals[f.classifGlobal]++;
    families.push(f);
  }
  families.sort((a, b) => (b.implanter + b.challenger) - (a.implanter + a.challenger));

  return {
    families,
    totals
  };
}

// ── Benchmark local des hotspots moteur ───────────────────────────────
// Usage: benchmarkEngineHotspots({ iterations: 5, marque: 'XYZ', codeFam: 'A1', codeSousFam: '' })
export function benchmarkEngineHotspots(opts = {}) {
  const iterations = Math.max(1, Number(opts.iterations) || 3);
  const invalidateBetweenRuns = !!opts.invalidateBetweenRuns;
  const now = () => (globalThis.performance?.now ? globalThis.performance.now() : Date.now());
  const runs = [];
  const invalidate = () => {
    if (typeof invalidateSqueletteCache === 'function') invalidateSqueletteCache();
    _S.articleZoneIndex = null;
    if (typeof _invalidateTerrFBCache === 'function') _invalidateTerrFBCache();
  };

  const jobs = [
    { name: 'computeSquelette', enabled: true, fn: () => computeSquelette(opts.directionFilter) },
    { name: 'computeRadarFamille', enabled: true, fn: () => computeRadarFamille() },
    { name: 'computeMaClientele(level1)', enabled: true, fn: () => computeMaClientele('', opts.distanceKm) },
    { name: 'computeMaClientele(level2)', enabled: !!opts.metierFilter, fn: () => computeMaClientele(opts.metierFilter, opts.distanceKm) },
    { name: 'computeAnimation', enabled: !!opts.marque, fn: () => computeAnimation(opts.marque) },
    { name: 'computeMonRayon', enabled: !!opts.codeFam, fn: () => computeMonRayon(opts.codeFam, opts.codeSousFam) },
  ];

  for (const job of jobs) {
    if (!job.enabled) {
      runs.push({ name: job.name, skipped: true, reason: 'missing-params' });
      continue;
    }
    let totalMs = 0;
    let ok = true;
    let error = '';
    for (let i = 0; i < iterations; i++) {
      if (invalidateBetweenRuns) invalidate();
      const t0 = now();
      try {
        job.fn();
      } catch (e) {
        ok = false;
        error = e?.message || String(e);
        break;
      }
      totalMs += (now() - t0);
    }
    runs.push({
      name: job.name,
      iterations: ok ? iterations : 0,
      totalMs: ok ? Math.round(totalMs * 100) / 100 : null,
      avgMs: ok ? Math.round((totalMs / iterations) * 100) / 100 : null,
      ok,
      error
    });
  }

  return {
    iterations,
    mode: invalidateBetweenRuns ? 'cold-ish' : 'warm',
    timestamp: new Date().toISOString(),
    runs
  };
}
