// © 2026 Jawad El Barkaoui — Tous droits réservés
// PRISME — scan-export.js
// Exports Scan (mobile), rafraîchissement ZZAT018, import EAN
// Extrait de main.js (oct. 2026). Les fonctions restent exposées via window.* dans main.js.
// ═══════════════════════════════════════════════════════════════
'use strict';

import { _S, invalidateCache } from './state.js';
import { computeSquelette, computeVitesseReseau, rowVerdictLabel, isInvendu } from './engine.js';
import { showToast, renderAll, showLoading, hideLoading } from './ui.js';
import { _saveSessionToIDB } from './cache.js';
import { DataStore } from './store.js';
import { renderTable } from './render-stock.js';
import { saveZzat, saveDepot } from './sources.js';

// ── Rafraichir stock depuis ZZAT018 CSV ──────────────────────────────
// Le ZZAT fait foi sur la LISTE des articles de l'agence : après rafraîchissement, finalData = exactement les
// articles du ZZAT (absents du ZZAT retirés, présents seulement dans le ZZAT ajoutés), avec son stock,
// MIN/MAX ERP, emplacement et statut. Colonnes lues d'après l'en-tête (positions ZZAT018 en secours).
// Sur PC, le ZZAT est gardé (sources.js) puis l'analyse est relancée : il est appliqué AVANT le calcul des
// MIN/MAX, verdicts, scores… (_postParseMain), et réappliqué à chaque analyse jusqu'au prochain état du stock.
/** Applique un ZZAT018 (texte CSV) à _S.finalData. Retourne {total, updated, added, removed} ou null si illisible. */
export function applyZzatText(text) {
  const lines = String(text).split(/\r?\n/).filter(l => l.trim());
  const split = (l) => l.split(';').map(c => c.trim().replace(/^"|"$/g, ''));
  const hdr = split(lines[0] || '').map(h => h.toLowerCase());
  const col = (re, def) => { const i = hdr.findIndex(h => re.test(h)); return i >= 0 ? i : def; };
  const iArt = col(/^article$/, 3), iLib = col(/^libell?[eé]/, 4), iFam = col(/^famille$/, 1), iSous = col(/^sous.?famille$/, 2);
  const iMin = col(/qte\s*min/, 7), iMax = col(/qte\s*max/, 8), iStk = col(/^stock$/, 9), iEmpl = col(/^emplacement$/, 10), iStat = col(/^statut$/, 11);
  const num = (v) => { const n = parseInt(String(v || '').replace(/[\s  ]/g, ''), 10); return isNaN(n) ? 0 : n; };
  const zz = new Map();
  for (let i = 1; i < lines.length; i++) {
    const cols = split(lines[i]);
    let code = (cols[iArt] || '').replace(/\D/g, '');
    if (!code) continue;
    if (code.length < 6) code = code.padStart(6, '0'); // zéros retirés par Excel
    if (!/^\d{6}$/.test(code)) continue;
    zz.set(code, cols);
  }
  if (!zz.size) return null;
  const myStore = _S.selectedMyStore || '';
  const spm = myStore ? ((_S.stockParMagasin ||= {})[myStore] ||= {}) : null;
  const before = _S.finalData.length;
  const kept = [];
  let updated = 0;
  for (const r of _S.finalData) {
    const cols = zz.get(r.code);
    if (!cols) continue; // absent du ZZAT : retiré
    const old = r.stockActuel || 0;
    r.stockActuel = num(cols[iStk]);
    if (r.valeurStock != null) r.valeurStock = old > 0 ? r.valeurStock / old * r.stockActuel : r.stockActuel * (r.prixUnitaire || 0);
    r.emplacement = cols[iEmpl] || r.emplacement;
    r.ancienMin = num(cols[iMin]);
    r.ancienMax = num(cols[iMax]);
    if (cols[iStat]) r.statut = cols[iStat];
    kept.push(r); updated++;
  }
  const known = new Set(kept.map(r => r.code));
  const vMine = _S.ventesParAgence?.[myStore] || {};
  let added = 0;
  for (const [code, cols] of zz) {
    if (known.has(code)) continue;
    const v = vMine[code];
    kept.push({
      code, libelle: cols[iLib] || _S.libelleLookup?.[code] || '', famille: cols[iFam] || '', sousFamille: cols[iSous] || '',
      emplacement: cols[iEmpl] || '', statut: cols[iStat] || '',
      stockActuel: num(cols[iStk]), ancienMin: num(cols[iMin]), ancienMax: num(cols[iMax]),
      nouveauMin: 0, nouveauMax: 0, W: v?.countBL || 0, V: v?.sumPrelevee || 0, enleveTotal: v?.sumEnleve || 0,
      couvertureJours: 9999, ageJours: 9999, isNouveaute: false, isParent: false,
      abcClass: '', fmrClass: '', prixUnitaire: 0, valeurStock: 0, caAnnuel: 0,
    });
    if (_S.libelleLookup && !_S.libelleLookup[code] && cols[iLib]) _S.libelleLookup[code] = cols[iLib];
    added++;
  }
  // Médiane MIN/MAX des autres agences pour les articles ajoutés ; stock de l'agence aligné sur le ZZAT
  const others = [...(_S.storesIntersection || [])].filter(s => s !== myStore);
  const med = (a) => { const t = [...a].sort((x, y) => x - y); return t.length ? t[Math.floor(t.length / 2)] : null; };
  for (const r of kept) {
    if (spm) spm[r.code] = { ...(spm[r.code] || {}), stockActuel: r.stockActuel, qteMin: r.ancienMin, qteMax: r.ancienMax };
    if (!known.has(r.code) && others.length) {
      r.medMinReseau = med(others.map(s => _S.stockParMagasin?.[s]?.[r.code]?.qteMin).filter(v => v > 0));
      r.medMaxReseau = med(others.map(s => _S.stockParMagasin?.[s]?.[r.code]?.qteMax).filter(v => v > 0));
    }
  }
  if (spm) for (const c of Object.keys(spm)) if (!zz.has(c)) delete spm[c];
  _S.finalData = kept;
  return { total: kept.length, updated, added, removed: before - updated };
}

const _zzMsg = (st) => `Base = ZZAT018 : ${st.total.toLocaleString('fr-FR')} articles (${st.updated.toLocaleString('fr-FR')} mis à jour` + (st.added ? `, ${st.added} ajoutés` : '') + (st.removed ? `, ${st.removed} retirés` : '') + ')';

window.refreshFromZZAT018 = function(fileInput) {
  const file = fileInput.files[0];
  if (!file) return;
  fileInput.value = ''; // reset pour pouvoir reimporter
  const reader = new FileReader();
  reader.onload = async () => {
    try {
      const text = String(reader.result);
      if (!_S.lowMemMode && window.processData) {
        // Vérifier qu'il est lisible avant de le garder
        const probe = text.split(/\r?\n/, 2)[0] || '';
        if (!/article/i.test(probe)) { showToast('ZZAT018 : colonne Article introuvable', 'error'); return; }
        await saveZzat(text, file.name, file.lastModified);
        showToast('ZZAT018 gardé — recalcul de toute l\'analyse (MIN/MAX, verdicts, scores)…', 'info', 5000);
        await window.processData(_S.selectedMyStore || '', { force: true });
        window.switchTab?.('table');
        if (_S._zzatStats) showToast(_zzMsg(_S._zzatStats), 'success', 7000);
        return;
      }
      // Mobile (pas de fichiers gardés) : mise à jour en mémoire seulement
      const st = applyZzatText(text);
      if (!st) { showToast('ZZAT018 : aucun article lu (colonne Article introuvable ?)', 'error'); return; }
      invalidateCache();
      renderTable();
      renderAll();
      _saveSessionToIDB();
      showToast(_zzMsg(st), 'success', 6000);
    } catch (e) {
      showToast('Erreur lecture ZZAT018 : ' + e.message, 'error');
    }
  };
  reader.readAsText(file, 'ISO-8859-1');
};

// ── ZZSS022B (dossier ZZSS022B_NEW, un fichier par jour) : stock de tous les dépôts ──────────
// On n'en garde qu'un extrait : la dispo vente du dépôt central SASO (S00) et le statut des articles de l'agence.
// Appliqué à chaque analyse AVANT le MIN/MAX (pipeline._postParseMain) : un article passé ce jour en fin de série
// part à 0/0, et une fin de vie encore disponible à SASO est à renvoyer en priorité (la centrale la vend encore).
export const DEPOT_SASO = 'S00';
const _STATUT_ERP = { 'normal': '0 - Normal', 'fin de stock': '2 - Fin de stock', 'fin de serie': '3 - Fin de série', 'fin de série': '3 - Fin de série', 'promo': '4 - Promo' };
/** Lit le texte d'un ZZSS022B → extrait { name, date, store, saso: {code: qté}, statuts: {code: statut ERP} } ou null. */
export function parseDepotZZSS(text, name, store) {
  const nl = text.indexOf('\n');
  const hdr = text.slice(0, nl).replace(/\r$/, '').split(';').map(h => h.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''));
  const iDep = hdr.indexOf('depot'), iArt = hdr.indexOf('code article'), iQte = hdr.indexOf('qte dispo vente'), iStat = hdr.indexOf('statut article');
  if (iDep < 0 || iArt < 0 || iQte < 0) return null;
  const myDep = String(store || '').replace(/\D/g, '').padStart(2, '0');
  const saso = {}, statuts = {};
  let pos = nl + 1, nAg = 0;
  while (pos < text.length) {
    let end = text.indexOf('\n', pos); if (end < 0) end = text.length;
    const sc = text.indexOf(';', pos);
    const dep = sc > 0 && sc < end ? text.slice(pos, sc).trim() : '';
    if (dep === DEPOT_SASO || dep === myDep) {
      const c = text.slice(pos, end).replace(/\r$/, '').split(';');
      let code = (c[iArt] || '').replace(/\D/g, '');
      if (code && code.length < 6) code = code.padStart(6, '0');
      if (/^\d{6}$/.test(code)) {
        if (dep === DEPOT_SASO) { const q = parseFloat(String(c[iQte] || '').replace(',', '.')) || 0; if (q > 0) saso[code] = q; }
        else if (iStat >= 0) { const st = (c[iStat] || '').trim(); if (st) { statuts[code] = _STATUT_ERP[st.toLowerCase()] || st; nAg++; } }
      }
    }
    pos = end + 1;
  }
  const m = String(name || '').match(/(20\d{2})(\d{2})(\d{2})/);
  const date = m ? new Date(+m[1], +m[2] - 1, +m[3]).getTime() : Date.now();
  if (!Object.keys(saso).length && !nAg) return null;
  return { name, date, store: store || '', saso, statuts, nAg };
}
const _cat = (s) => { const t = String(s || '').trim(); return /^[23]\b|fin de s[ée]rie|fin de stock|fin de catalogue/i.test(t) ? 'fin' : /^4\b|promo/i.test(t) ? 'promo' : 'normal'; };
/** Applique l'extrait à _S.finalData : dispo SASO (r._dispoSaso) et statut du jour quand il change de catégorie. */
export function applyDepotExtract(x) {
  if (!x) return null;
  const sameStore = !x.store || !_S.selectedMyStore || x.store === _S.selectedMyStore;
  // Statuts : seulement si le ZZSS n'est pas plus ancien que l'état du stock chargé (sinon le stock fait foi)
  const statutsOk = sameStore && (!_S._stockFileTs || x.date + 86400000 > _S._stockFileTs);
  let statutsChanges = 0, avecDispo = 0;
  for (const r of _S.finalData || []) {
    r._dispoSaso = x.saso?.[r.code] || 0;
    if (r._dispoSaso > 0) avecDispo++;
    const st = statutsOk ? x.statuts?.[r.code] : null;
    if (st && _cat(st) !== _cat(r.statut)) { r._statutAvantZZSS = r.statut; r.statut = st; statutsChanges++; }
  }
  _S._depotInfo = { name: x.name, date: x.date, avecDispo, statutsChanges };
  return _S._depotInfo;
}

window.importDepotZZSS = async function(fileInput) {
  const file = fileInput.files[0];
  if (!file) return;
  fileInput.value = '';
  try {
    showLoading('Lecture du ZZSS022B…', file.name);
    const text = new TextDecoder('utf-8').decode(await file.arrayBuffer());
    const x = parseDepotZZSS(text, file.name, _S.selectedMyStore);
    hideLoading();
    if (!x) { showToast('ZZSS022B : colonnes depot / Code article / Qte dispo vente introuvables', 'error'); return; }
    if (!_S.lowMemMode && window.processData) {
      await saveDepot(x);
      showToast(`ZZSS022B gardé — ${Object.keys(x.saso).length.toLocaleString('fr-FR')} articles dispo à SASO · recalcul de l'analyse…`, 'info', 5000);
      await window.processData(_S.selectedMyStore || '', { force: true });
    } else {
      applyDepotExtract(x); invalidateCache(); renderAll(); _saveSessionToIDB();
    }
    const d = _S._depotInfo;
    if (d) showToast(`ZZSS022B du ${new Date(d.date).toLocaleDateString('fr-FR')} : ${d.avecDispo.toLocaleString('fr-FR')} de tes articles dispo à SASO` + (d.statutsChanges ? ` · ${d.statutsChanges} statut${d.statutsChanges > 1 ? 's' : ''} mis à jour` : ''), 'success', 7000);
  } catch (e) {
    hideLoading();
    showToast('Erreur lecture ZZSS022B : ' + e.message, 'error');
  }
};

// ── Importer associations EAN depuis CSV scan ───────────────────────
window.importEanCSV = function(fileInput) {
  const file = fileInput.files[0];
  if (!file) return;
  fileInput.value = '';
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const text = reader.result;
      const rows = text.split('\n');
      if (!_S.catalogueEAN) _S.catalogueEAN = new Map();
      let added = 0;
      // Ordre des colonnes d'après l'en-tête : l'export du Scan écrit « EAN;Code Article;Libelle »
      const hdr = (rows[0] || '').split(';').map(c => c.trim().replace(/^"|"$/g, '').toLowerCase());
      let iEan = hdr.findIndex(h => h.includes('ean'));
      let iCode = hdr.findIndex(h => h.includes('code') || h.includes('article'));
      if (iEan < 0 || iCode < 0 || iEan === iCode) { iEan = 0; iCode = 1; }
      for (let i = 1; i < rows.length; i++) {
        const cols = rows[i].split(';').map(c => c.trim().replace(/^"|"$/g, ''));
        if (cols.length < 2) continue;
        let code = (cols[iCode] || '').replace(/\D/g, '');
        if (code.length > 0 && code.length < 6) code = code.padStart(6, '0'); // zéros retirés par Excel
        const ean = (cols[iEan] || '').replace(/\D/g, '');
        if (code.length !== 6 || ean.length < 8) continue;
        if (!_S.catalogueEAN.has(ean)) {
          _S.catalogueEAN.set(ean, code);
          added++;
        }
      }
      _saveSessionToIDB();
      showToast(`${added} code${added > 1 ? 's' : ''}-barre${added > 1 ? 's' : ''} importe${added > 1 ? 's' : ''} (${_S.catalogueEAN.size} total)`, 'success');
    } catch (e) {
      showToast('Erreur lecture CSV : ' + e.message, 'error');
    }
  };
  reader.readAsText(file, 'UTF-8');
};

// ── Fichier Scan (data/prisme-scan-<agence>.json) ─────────────────────────
// withPrices = false : version collègues, sans prix ni marge réseau ni articles « à implanter ».
const _M_LABELS = {AF:'Pépites',AM:'Surveiller',AR:'Gros paniers',BF:'Confort',BM:'Standard',BR:'Questionner',CF:'Réguliers',CM:'Réduire',CR:'Déréférencer'};
/** CA, quantités et marge d'un article dans les agences du réseau (myStore inclus ou non). */
function _reseauAgg(code, stores, myStore) {
  const vpm = _S.ventesParAgence || {};
  let n = 0, ca = 0, qte = 0, vmb = 0;
  for (const s of stores) {
    const v = vpm[s]?.[code];
    if (!v || v.countBL <= 0) continue;
    if (s !== myStore) n++;
    ca += v.sumCA || 0; qte += (v.sumPrelevee || 0) + (v.sumEnleve || 0); vmb += v.sumVMB || 0;
  }
  return {
    reseauAgences: n,
    prixMoyenReseau: qte > 0 ? Math.round(ca / qte * 100) / 100 : null,
    txMargeReseau: qte > 0 ? (ca > 0 ? Math.round(vmb / ca * 10000) / 100 : 0) : null,
  };
}
function _exportScan(withPrices) {
  if (!DataStore.finalData.length) { showToast('Aucune donnée à exporter', 'warning'); return; }
  const myStore = _S.selectedMyStore || '';
  const allStores = Object.keys(_S.ventesParAgence || {});
  const otherStores = allStores.filter(s => s !== myStore);
  const articles = DataStore.finalData.map(r => {
    const mKey = (r.abcClass || '') + (r.fmrClass || '');
    const row = {
      code: r.code, libelle: r.libelle, marque: r.marque, famille: r.famille, sousFamille: r.sousFamille,
      emplacement: r.emplacement, statut: r.statut, stockActuel: r.stockActuel,
      W: r.W, V: r.V,
      ancienMin: r.ancienMin, ancienMax: r.ancienMax,
      nouveauMin: r.nouveauMin, nouveauMax: r.nouveauMax,
      couvertureJours: r.couvertureJours, abcClass: r.abcClass, fmrClass: r.fmrClass,
      matriceVerdict: _M_LABELS[mKey] || '',
      _sqClassif: r._sqClassif || '', _sqRole: r._sqRole || '', _sqVerdict: r._sqVerdict || '', _sqLabel: rowVerdictLabel(r), _invendu: isInvendu(r),
      _vitesseReseau: r._vitesseReseau || false, _fallbackERP: r._fallbackERP || false,
      isParent: r.isParent, _refFourn: r._refFourn || '',
    };
    if (withPrices) {
      const g = _reseauAgg(r.code, allStores, myStore);
      Object.assign(row, { prixMoyenReseau: g.prixMoyenReseau, txMargeReseau: g.txMargeReseau, prixUnitaire: r.prixUnitaire,
        medMinReseau: r.medMinReseau, medMaxReseau: r.medMaxReseau, _reseauAgences: g.reseauAgences });
    }
    return row;
  });
  // Articles « à implanter » absents de finalData (version complète seulement)
  if (withPrices) {
    const fdCodes = new Set(DataStore.finalData.map(r => r.code));
    const sqData = _S._prSqData || computeSquelette();
    const med = (arr) => { const t = [...arr].sort((x, y) => x - y); return t[Math.floor(t.length / 2)]; };
    for (const d of (sqData?.directions || [])) {
      for (const a of (d.implanter || [])) {
        if (fdCodes.has(a.code)) continue;
        const g = _reseauAgg(a.code, otherStores, myStore);
        const mins = otherStores.map(s => _S.stockParMagasin?.[s]?.[a.code]?.qteMin).filter(v => v > 0);
        const maxs = otherStores.map(s => _S.stockParMagasin?.[s]?.[a.code]?.qteMax).filter(v => v > 0);
        const medMin = mins.length ? Math.round(med(mins)) : 0, medMax = maxs.length ? Math.round(med(maxs)) : 0;
        const vr = computeVitesseReseau(a.code, g.prixMoyenReseau || 0, medMin); // rythme du réseau
        let sugMin = vr ? vr.min : Math.max(medMin, 1);
        let sugMax = vr ? vr.max : Math.max(medMax, sugMin + 1);
        if (!vr && !mins.length && !maxs.length) { sugMin = 0; sugMax = 0; }
        articles.push({
          code: a.code, libelle: a.libelle || '', famille: a.famille || '', sousFamille: '',
          emplacement: '', statut: '', stockActuel: 0,
          prixMoyenReseau: g.prixMoyenReseau, txMargeReseau: g.txMargeReseau, prixUnitaire: g.prixMoyenReseau || 0, W: 0, V: 0,
          ancienMin: 0, ancienMax: 0, nouveauMin: sugMin, nouveauMax: sugMax,
          couvertureJours: 0, abcClass: '', fmrClass: '', matriceVerdict: '',
          _sqClassif: 'implanter', _sqRole: '', _sqVerdict: a.classification || 'implanter', _sqLabel: 'À implanter',
          medMinReseau: medMin || null, medMaxReseau: medMax || null,
          _vitesseReseau: sugMin > 0, _fallbackERP: !!(!vr && sugMin > 0),
          _reseauAgences: g.reseauAgences, isParent: false,
        });
        fdCodes.add(a.code);
      }
    }
  }
  const ean = {};
  if (_S.catalogueEAN?.size) for (const [e, code] of _S.catalogueEAN) ean[e] = code;
  const dataDate = (_S.consommePeriodMaxFull || _S.consommePeriodMax)?.getTime?.() || null;
  const payload = { version: 2, store: myStore, timestamp: Date.now(), dataDate, stockTs: _S._stockFileTs || null, count: articles.length, articles, ean };
  const json = JSON.stringify(payload);
  const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url; link.download = 'prisme-scan-' + myStore + '.json'; link.click();
  URL.revokeObjectURL(url);
  showToast(`📱 ${withPrices ? 'Fichier Scan' : 'Scan AG (sans prix)'} exporté — ${articles.length} refs (${(json.length / 1024 / 1024).toFixed(1)} Mo)`, 'success');
}
window.exportScanData = () => _exportScan(true);
window.exportScanDataAG = () => _exportScan(false);
