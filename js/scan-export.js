// © 2026 Jawad El Barkaoui — Tous droits réservés
// PRISME — scan-export.js
// Exports Scan (mobile), rafraîchissement ZZAT018, import EAN
// Extrait de main.js (oct. 2026). Les fonctions restent exposées via window.* dans main.js.
// ═══════════════════════════════════════════════════════════════
'use strict';

import './constants.js';
import { _median } from './utils.js';
import { _S } from './state.js';
import { computeSquelette, computeVitesseReseau, rowVerdictLabel } from './engine.js';
import './parser.js';
import { showToast, renderAll } from './ui.js';
import { _saveSessionToIDB } from './cache.js';
import './sales.js';
import './helpers.js';
import './client-store.js';
import './chalandise-store.js';
import './agence-store.js';
import { DataStore } from './store.js';
import './diagnostic.js';
import './planRayon.js';
import './arbitrage.js';
import './minmax.js';
import './clients-decisions.js';
import './animation.js';
import './partie.js';
import './commerce.js';
import { renderTable } from './render-stock.js';

// ── Export Scan — fichier léger pour mobile ──────────────────────────
// ── Rafraichir stock depuis ZZAT018 CSV ──────────────────────────────
window.refreshFromZZAT018 = function(fileInput) {
  const file = fileInput.files[0];
  if (!file) return;
  fileInput.value = ''; // reset pour pouvoir reimporter
  const reader = new FileReader();
  reader.onload = () => {
    try {
      // Lire CSV en ISO-8859-1 (encodage Legallais)
      const text = reader.result;
      const rows = text.split('\n');
      let updated = 0, added = 0;
      for (let i = 1; i < rows.length; i++) {
        const cols = rows[i].split(';').map(c => c.trim());
        if (cols.length < 12) continue;
        const code = cols[3];
        if (!/^\d{6}$/.test(code)) continue;
        let r = _S.finalData.find(a => a.code === code);
        if (!r) {
          // Article absent du consommé → l'ajouter dans finalData
          r = {
            code, libelle: cols[4] || '', famille: cols[1] || '', sousFamille: cols[2] || '',
            emplacement: cols[10] || '', statut: cols[11] || '',
            stockActuel: parseInt(cols[9]) || 0,
            ancienMin: parseInt(cols[7]) || 0, ancienMax: parseInt(cols[8]) || 0,
            nouveauMin: 0, nouveauMax: 0, W: 0, V: 0, enleveTotal: 0,
            couvertureJours: 9999, ageJours: 9999,
            abcClass: '', fmrClass: '', prixUnitaire: 0, caAnnuel: 0
          };
          _S.finalData.push(r);
          added++;
          continue;
        }
        r.stockActuel = parseInt(cols[9]) || 0;
        r.emplacement = cols[10] || r.emplacement;
        r.ancienMin = parseInt(cols[7]) || 0;
        r.ancienMax = parseInt(cols[8]) || 0;
        const statut = cols[11] || '';
        if (statut) r.statut = statut;
        updated++;
      }
      // Re-render
      renderTable();
      renderAll();
      _saveSessionToIDB();
      showToast(`Stock rafraichi : ${updated} mis a jour` + (added ? ` + ${added} ajoutes` : ''), 'success');
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

window.exportScanData = function() {
  if (!DataStore.finalData.length) { showToast('Aucune donnée à exporter', 'warning'); return; }
  const myStore = _S.selectedMyStore || '';
  const vpm = _S.ventesParAgence || {};
  const otherStores = Object.keys(vpm).filter(s => s !== myStore);
  const _mLabels = {AF:'Pépites',AM:'Surveiller',AR:'Gros paniers',BF:'Confort',BM:'Standard',BR:'Questionner',CF:'Réguliers',CM:'Réduire',CR:'Déréférencer'};
  const articles = DataStore.finalData.map(r => {
    let reseauAgences = 0, totalCA = 0, totalQte = 0, totalVMB = 0;
    const allStores = Object.keys(vpm);
    for (const s of allStores) {
      const v = vpm[s]?.[r.code];
      if (!v || v.countBL <= 0) continue;
      if (s !== myStore) reseauAgences++;
      totalCA += v.sumCA || 0;
      totalQte += (v.sumPrelevee || 0) + (v.sumEnleve || 0);
      totalVMB += v.sumVMB || 0;
    }
    const prixMoyenReseau = totalQte > 0 ? Math.round(totalCA / totalQte * 100) / 100 : null;
    const txMargeReseau = totalQte > 0 ? (totalCA > 0 ? Math.round(totalVMB / totalCA * 10000) / 100 : 0) : null;
    const mKey = (r.abcClass || '') + (r.fmrClass || '');
    return {
      code: r.code, libelle: r.libelle, famille: r.famille, sousFamille: r.sousFamille,
      emplacement: r.emplacement, statut: r.statut, stockActuel: r.stockActuel,
      prixMoyenReseau, txMargeReseau, prixUnitaire: r.prixUnitaire, W: r.W, V: r.V,
      ancienMin: r.ancienMin, ancienMax: r.ancienMax,
      nouveauMin: r.nouveauMin, nouveauMax: r.nouveauMax,
      couvertureJours: r.couvertureJours, abcClass: r.abcClass, fmrClass: r.fmrClass,
      matriceVerdict: _mLabels[mKey] || '',
      _sqClassif: r._sqClassif || '', _sqRole: r._sqRole || '', _sqVerdict: r._sqVerdict || '', _sqLabel: rowVerdictLabel(r),
      medMinReseau: r.medMinReseau, medMaxReseau: r.medMaxReseau,
      _vitesseReseau: r._vitesseReseau || false, _fallbackERP: r._fallbackERP || false,
      _reseauAgences: reseauAgences, isParent: r.isParent, _refFourn: r._refFourn || ''
    };
  });
  // ── Ajouter les articles squelette "implanter" absents de finalData ──
  const fdCodes = new Set(DataStore.finalData.map(r => r.code));
  const sqData = _S._prSqData || computeSquelette();
  if (sqData?.directions) {
    for (const d of sqData.directions) {
      for (const a of (d.implanter || [])) {
        if (fdCodes.has(a.code)) continue; // déjà dans finalData
        let reseauAgences = 0, totalCA = 0, totalQte = 0, totalVMB = 0;
        for (const s of otherStores) {
          const v = vpm[s]?.[a.code];
          if (!v || v.countBL <= 0) continue;
          reseauAgences++;
          totalCA += v.sumCA || 0;
          totalQte += (v.sumPrelevee || 0) + (v.sumEnleve || 0);
          totalVMB += v.sumVMB || 0;
        }
        const prixMoyenReseau = totalQte > 0 ? Math.round(totalCA / totalQte * 100) / 100 : null;
        const txMargeReseau = totalQte > 0 ? (totalCA > 0 ? Math.round(totalVMB / totalCA * 10000) / 100 : 0) : null;
        // Médiane réseau ERP depuis stockParMagasin
        const _spMins=otherStores.map(s=>_S.stockParMagasin?.[s]?.[a.code]?.qteMin).filter(v=>v>0);
        const _spMaxs=otherStores.map(s=>_S.stockParMagasin?.[s]?.[a.code]?.qteMax).filter(v=>v>0);
        const _median=arr=>{const s=[...arr].sort((x,y)=>x-y);return s[Math.floor(s.length/2)];};
        const medMin=_spMins.length?Math.round(_median(_spMins)):0;
        const medMax=_spMaxs.length?Math.round(_median(_spMaxs)):0;
        // Vitesse Réseau centralisée (rotation mensuelle)
        const _vrScan=computeVitesseReseau(a.code,prixMoyenReseau||0,medMin);
        let sugMin=_vrScan?_vrScan.min:Math.max(medMin,1);
        let sugMax=_vrScan?_vrScan.max:Math.max(medMax,sugMin+1);
        if(!_vrScan&&!_spMins.length&&!_spMaxs.length){sugMin=0;sugMax=0;}
        articles.push({
          code: a.code, libelle: a.libelle || '', famille: a.famille || '', sousFamille: '',
          emplacement: '', statut: '', stockActuel: 0,
          prixMoyenReseau, txMargeReseau, prixUnitaire: prixMoyenReseau||0, W: 0, V: 0,
          ancienMin: 0, ancienMax: 0,
          nouveauMin: sugMin, nouveauMax: sugMax,
          couvertureJours: 0, abcClass: '', fmrClass: '',
          matriceVerdict: '',
          _sqClassif: 'implanter', _sqRole: '', _sqVerdict: a.classification || 'implanter', _sqLabel: 'À implanter',
          medMinReseau: medMin||null, medMaxReseau: medMax||null,
          _vitesseReseau: sugMin > 0, _fallbackERP: !!(!_vrScan&&sugMin>0),
          _reseauAgences: reseauAgences, isParent: false
        });
        fdCodes.add(a.code); // éviter les doublons cross-directions
      }
    }
  }
  // EAN → code (inverse map pour lookup scanner)
  const eanMap = {};
  if (_S.catalogueEAN?.size) {
    for (const [ean, code] of _S.catalogueEAN) eanMap[ean] = code;
  }
  const payload = { version: 2, store: myStore, timestamp: Date.now(), count: articles.length, articles, ean: eanMap };
  const json = JSON.stringify(payload);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'prisme-scan-' + myStore + '.json'; a.click();
  URL.revokeObjectURL(url);
  showToast('📱 Fichier Scan exporté — ' + articles.length + ' refs (' + (json.length / 1024 / 1024).toFixed(1) + ' Mo)', 'success');
};
window.exportScanDataAG = function() {
  // Export allégé pour collègues : sans prix moyen ni marge réseau
  if (!DataStore.finalData.length) { showToast('Aucune donnée à exporter', 'warning'); return; }
  const myStore = _S.selectedMyStore || '';
  const _mLabels = {AF:'Pépites',AM:'Surveiller',AR:'Gros paniers',BF:'Confort',BM:'Standard',BR:'Questionner',CF:'Réguliers',CM:'Réduire',CR:'Déréférencer'};
  const articles = DataStore.finalData.map(r => {
    const mKey = (r.abcClass || '') + (r.fmrClass || '');
    return {
      code: r.code, libelle: r.libelle, famille: r.famille, sousFamille: r.sousFamille,
      emplacement: r.emplacement, statut: r.statut, stockActuel: r.stockActuel,
      W: r.W, V: r.V,
      ancienMin: r.ancienMin, ancienMax: r.ancienMax,
      nouveauMin: r.nouveauMin, nouveauMax: r.nouveauMax,
      couvertureJours: r.couvertureJours, abcClass: r.abcClass, fmrClass: r.fmrClass,
      matriceVerdict: _mLabels[mKey] || '',
      _sqClassif: r._sqClassif || '', _sqRole: r._sqRole || '', _sqVerdict: r._sqVerdict || '', _sqLabel: rowVerdictLabel(r),
      _vitesseReseau: r._vitesseReseau || false, _fallbackERP: r._fallbackERP || false,
      isParent: r.isParent, _refFourn: r._refFourn || ''
    };
  });
  const eanMap = {};
  if (_S.catalogueEAN?.size) {
    for (const [ean, code] of _S.catalogueEAN) eanMap[ean] = code;
  }
  const payload = { version: 2, store: myStore, timestamp: Date.now(), count: articles.length, articles, ean: eanMap };
  const json = JSON.stringify(payload);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'prisme-scan-' + myStore + '.json'; a.click();
  URL.revokeObjectURL(url);
  showToast('📱 Scan AG exporté (sans prix) — ' + articles.length + ' refs (' + (json.length / 1024 / 1024).toFixed(1) + ' Mo)', 'success');
};
