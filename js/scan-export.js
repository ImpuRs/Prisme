// © 2026 Jawad El Barkaoui — Tous droits réservés
// PRISME — scan-export.js
// Exports Scan (mobile), rafraîchissement ZZAT018, import EAN
// Extrait de main.js (oct. 2026). Les fonctions restent exposées via window.* dans main.js.
// ═══════════════════════════════════════════════════════════════
'use strict';

import { _S, invalidateCache } from './state.js';
import { computeSquelette, computeVitesseReseau, rowVerdictLabel } from './engine.js';
import { showToast, renderAll } from './ui.js';
import { _saveSessionToIDB } from './cache.js';
import { DataStore } from './store.js';
import { renderTable } from './render-stock.js';

// ── Rafraichir stock depuis ZZAT018 CSV ──────────────────────────────
// Le ZZAT fait foi sur la LISTE des articles de l'agence : après rafraîchissement, finalData = exactement les
// articles du ZZAT (absents du ZZAT retirés, présents seulement dans le ZZAT ajoutés), avec son stock,
// MIN/MAX ERP, emplacement et statut. Colonnes lues d'après l'en-tête (positions ZZAT018 en secours).
window.refreshFromZZAT018 = function(fileInput) {
  const file = fileInput.files[0];
  if (!file) return;
  fileInput.value = ''; // reset pour pouvoir reimporter
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const lines = String(reader.result).split(/\r?\n/).filter(l => l.trim());
      const split = (l) => l.split(';').map(c => c.trim().replace(/^"|"$/g, ''));
      const hdr = split(lines[0] || '').map(h => h.toLowerCase());
      const col = (re, def) => { const i = hdr.findIndex(h => re.test(h)); return i >= 0 ? i : def; };
      const iArt = col(/^article$/, 3), iLib = col(/^libell?[eé]/, 4), iFam = col(/^famille$/, 1), iSous = col(/^sous.?famille$/, 2);
      const iMin = col(/qte\s*min/, 7), iMax = col(/qte\s*max/, 8), iStk = col(/^stock$/, 9), iEmpl = col(/^emplacement$/, 10), iStat = col(/^statut$/, 11);
      const num = (v) => { const n = parseInt(String(v || '').replace(/[\s  ]/g, ''), 10); return isNaN(n) ? 0 : n; };
      const zz = new Map();
      for (let i = 1; i < lines.length; i++) {
        const cols = split(lines[i]);
        let code = (cols[iArt] || '').replace(/\D/g, '');
        if (!code) continue;
        if (code.length < 6) code = code.padStart(6, '0'); // zéros retirés par Excel
        if (!/^\d{6}$/.test(code)) continue;
        zz.set(code, cols);
      }
      if (!zz.size) { showToast('ZZAT018 : aucun article lu (colonne Article introuvable ?)', 'error'); return; }
      const before = _S.finalData.length;
      const kept = [];
      let updated = 0;
      for (const r of _S.finalData) {
        const cols = zz.get(r.code);
        if (!cols) continue; // absent du ZZAT : retiré
        r.stockActuel = num(cols[iStk]);
        r.emplacement = cols[iEmpl] || r.emplacement;
        r.ancienMin = num(cols[iMin]);
        r.ancienMax = num(cols[iMax]);
        if (cols[iStat]) r.statut = cols[iStat];
        kept.push(r); updated++;
      }
      const known = new Set(kept.map(r => r.code));
      let added = 0;
      for (const [code, cols] of zz) {
        if (known.has(code)) continue;
        kept.push({
          code, libelle: cols[iLib] || '', famille: cols[iFam] || '', sousFamille: cols[iSous] || '',
          emplacement: cols[iEmpl] || '', statut: cols[iStat] || '',
          stockActuel: num(cols[iStk]), ancienMin: num(cols[iMin]), ancienMax: num(cols[iMax]),
          nouveauMin: 0, nouveauMax: 0, W: 0, V: 0, enleveTotal: 0,
          couvertureJours: 9999, ageJours: 9999,
          abcClass: '', fmrClass: '', prixUnitaire: 0, caAnnuel: 0,
        });
        added++;
      }
      const removed = before - updated;
      _S.finalData = kept;
      invalidateCache();
      renderTable();
      renderAll();
      _saveSessionToIDB();
      showToast(`Base = ZZAT018 : ${kept.length.toLocaleString('fr-FR')} articles (${updated.toLocaleString('fr-FR')} mis à jour` + (added ? `, ${added} ajoutés` : '') + (removed ? `, ${removed} retirés` : '') + ')', 'success', 6000);
    } catch (e) {
      showToast('Erreur lecture ZZAT018 : ' + e.message, 'error');
    }
  };
  reader.readAsText(file, 'ISO-8859-1');
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
      _sqClassif: r._sqClassif || '', _sqRole: r._sqRole || '', _sqVerdict: r._sqVerdict || '', _sqLabel: rowVerdictLabel(r),
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
