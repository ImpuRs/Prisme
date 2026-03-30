// © 2026 Jawad El Barkaoui — Tous droits réservés
// PRISME — Outil d'analyse BI pour distribution B2B
// Développé sur initiative et temps personnel
// Contact : Jawad EL BARKAOUI
// ═══════════════════════════════════════════════════════════════
// PRISME — parser.js
// Pipeline de données : parsing fichiers + benchmark
// Dépend de : constants.js, utils.js, state.js, engine.js
// Note : utilise des fonctions DOM (showToast, updateProgress, etc.)
//        qui restent dans index.html/ui.js — fonctionne car scope global
// ═══════════════════════════════════════════════════════════════
'use strict';
import { CHUNK_SIZE, TERR_CHUNK_SIZE, NOUVEAUTE_DAYS, DORMANT_DAYS, SECURITY_DAYS, HIGH_PRICE, CROSS_AGENCE_MIN_CA, CROSS_AGENCE_MIN_BL, FAM_LETTER_UNIVERS, SECTEUR_DIR_MAP, FAMILLE_LOOKUP } from './constants.js';
import { cleanCode, cleanPrice, cleanOmniPrice, formatEuro, pct, parseExcelDate, daysBetween, getVal, getQuantityColumn, getCaColumn, getVmbColumn, extractStoreCode, readExcel, yieldToMain, parseCSVText, getAgeBracket, _median, _isMetierStrategique, _normalizeStatut, extractClientCode, _resetColCache, escapeHtml, extractFamCode, famLib } from './utils.js';
import { _S, resetAppState } from './state.js';


// ── Zone de Chalandise (4ème fichier optionnel) ───────────────
export async function parseChalandise(file) {
  const isCSV = file.name.toLowerCase().endsWith('.csv');
  let data;
  if (isCSV) {
    const text = await new Promise((res, rej) => { const r = new FileReader(); r.onload = e => res(e.target.result); r.onerror = () => rej(new Error('Lecture CSV impossible')); r.readAsText(file, 'UTF-8'); });
    const first = text.split('\n')[0] || '';
    const sep = first.includes(';') ? ';' : ',';
    data = parseCSVText(text, sep);
    if (!data.length) {
      // Retry with CP1252 encoding
      const text2 = await new Promise((res, rej) => { const r = new FileReader(); r.onload = e => res(e.target.result); r.onerror = () => rej(new Error('Lecture CSV impossible')); r.readAsText(file, 'windows-1252'); });
      data = parseCSVText(text2, sep);
    }
  } else {
    data = await readExcel(file);
  }
  if (!data || !data.length) { showToast('⚠️ Fichier Chalandise vide ou illisible', 'error'); return; }
  const sample = data[0];
  const findCol = s => Object.keys(sample).find(k => k.toLowerCase().includes(s.toLowerCase()));
  const cCode = findCol('code client') || findCol('code et nom');
  const cNom = findCol('nom client') || findCol('nom');
  const cMetier = findCol('libellé court métier') || findCol('libelle court metier') || findCol('métier') || findCol('metier');
  const cStatut = findCol('statut actuel général') || findCol('statut actuel general') || findCol('statut');
  const cClassif = findCol('classification') || findCol('classif');
  const cActivite = findCol('activité pdv zone') || findCol('activite pdv zone') || findCol('activité globale') || findCol('activite globale');
  const cActiviteGlobale = findCol('activité globale') || findCol('activite globale');
  const cSecteur = findCol('secteur') || findCol('code secteur');
  const cCommercial = findCol('commercial') || findCol('nom commercial');
  const cCP = findCol('code postal') || findCol('cp');
  const cVille = findCol('ville') || findCol('commune');
  const cCA2025 = findCol('ca 2025') || findCol('ca n-1') || findCol('ca n');
  const cCA2026 = findCol('ca 2026') || findCol('ca n');
  const cCaPDVN = findCol('ca pdv zone n') || findCol('ca pdv n') || findCol('ca pdv');
  if (!cCode) { showToast('⚠️ Colonne "Code client" introuvable dans le fichier Chalandise', 'error'); return; }

  _S.chalandiseData = new Map();
  const metiersSet = new Set();
  for (const row of data) {
    const rawCode = (cCode ? row[cCode] || '' : '').toString().trim();
    const cc = extractClientCode(rawCode);
    if (!cc) continue;
    const metier = (cMetier ? row[cMetier] || '' : '').toString().trim();
    if (metier) metiersSet.add(metier);
    _S.chalandiseData.set(cc, {
      nom: (cNom ? row[cNom] || '' : '').toString().trim(),
      metier,
      statut: (cStatut ? row[cStatut] || '' : '').toString().trim(),
      classification: (cClassif ? row[cClassif] || '' : '').toString().trim(),
      activitePDV: (cActivite ? row[cActivite] || '' : '').toString().trim(),
      activiteGlobale: (cActiviteGlobale ? row[cActiviteGlobale] || '' : '').toString().trim(),
      activite: (cActiviteGlobale ? row[cActiviteGlobale] || '' : '').toString().trim(),
      secteur: (cSecteur ? row[cSecteur] || '' : '').toString().trim(),
      commercial: (cCommercial ? row[cCommercial] || '' : '').toString().trim(),
      cp: (cCP ? row[cCP] || '' : '').toString().trim(),
      ville: (cVille ? row[cVille] || '' : '').toString().trim(),
      ca2025: parseFloat((cCA2025 ? row[cCA2025] || '' : '').toString().replace(/\s/g, '').replace(',', '.')) || 0,
      ca2026: parseFloat((cCA2026 ? row[cCA2026] || '' : '').toString().replace(/\s/g, '').replace(',', '.')) || 0,
      caPDVN: parseFloat((cCaPDVN ? row[cCaPDVN] || '' : '').toString().replace(/\s/g, '').replace(',', '.')) || 0,
    });
  }
  _S.chalandiseMetiers = [...metiersSet].sort();
  // Build metier and commercial indexes
  _S.clientsByMetier.clear();
  _S.clientsByCommercial.clear();
  for (const [cc, info] of _S.chalandiseData.entries()) {
    if (info.metier) {
      if (!_S.clientsByMetier.has(info.metier)) _S.clientsByMetier.set(info.metier, new Set());
      _S.clientsByMetier.get(info.metier).add(cc);
    }
    if (info.commercial) {
      if (!_S.clientsByCommercial.has(info.commercial)) _S.clientsByCommercial.set(info.commercial, new Set());
      _S.clientsByCommercial.get(info.commercial).add(cc);
    }
  }
  _S.chalandiseReady = true;
  const nbActifs = [..._S.chalandiseData.values()].filter(i => { const s = (i.statut || '').toLowerCase(); return s.includes('actif') && !s.includes('inactif'); }).length;
  const nbPerdus = [..._S.chalandiseData.values()].filter(i => { const s = (i.statut || '').toLowerCase(); return s.includes('perdu') || s.includes('inactif'); }).length;
  showToast(`📋 Chalandise : ${_S.chalandiseData.size} clients · ${metiersSet.size} métiers · ${nbActifs} actifs · ${nbPerdus} perdus`, 'success');
  // Show territoire tab if chalandise loaded (even without territoire file)
  const terrBtn = document.getElementById('btnTabTerritoire'); if (terrBtn) terrBtn.classList.remove('hidden');
  // Rebuild overview if already on territoire tab
  if (_S.finalData && _S.finalData.length > 0) { window.computeClientCrossing?.(); window.renderAll?.(); }
  // Ne pas sauvegarder si aucune agence sélectionnée — évite la contamination IDB
  if (_S.selectedMyStore) _saveSessionToIDB(); // Sauvegarder avec les données chalandise
}

export function onChalandiseSelected(input) {
  onFileSelected(input, 'dropChalandise');
  if (input.files && input.files[0]) parseChalandise(input.files[0]);
}

// ── Livraisons (4ème fichier optionnel) — alimente livraisonsData + territoireLines ──
export async function parseLivraisons(file) {
  _S.livraisonsData = new Map();
  _S.livraisonsReady = false;
  _S.livraisonsClientCount = 0;
  try {
    const isCSV = file.name.toLowerCase().endsWith('.csv');
    let data;
    if (isCSV) {
      const text = await new Promise((res, rej) => { const r = new FileReader(); r.onload = e => res(e.target.result); r.onerror = () => rej(new Error('Lecture CSV impossible')); r.readAsText(file, 'windows-1252'); });
      const sep = (text.split('\n')[0] || '').includes(';') ? ';' : ',';
      data = parseCSVText(text, sep);
    } else {
      const buf = await new Promise((res, rej) => { const r = new FileReader(); r.onload = e => res(e.target.result); r.onerror = () => rej(new Error('Lecture XLSX impossible')); r.readAsArrayBuffer(file); });
      const wb = XLSX.read(buf, { type: 'array', cellDates: true });
      data = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' });
    }

    // Passe unique : livraisonsData + territoireLines
    const _norm = s => (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
    const sample = data[0] || {};
    const findCol = s => Object.keys(sample).find(k => _norm(k).includes(_norm(s)));
    const cCC      = findCol('code client');
    const cNomC    = findCol('nom client');
    const cSect    = findCol('secteur');
    const cDir     = findCol('direction');
    const cBL      = findCol('numero de bl') || findCol('n° bl') || findCol('bl');
    const cArt     = findCol('article');
    const cQty     = findCol('quantite livree') || findCol('qte livree') || findCol('quantite');
    const cCA      = findCol('ca');
    const cVMB     = findCol('vmb');
    const cDate    = findCol("date d'expedition") || findCol('date expedition') || findCol('expedition');
    console.log('[PRISME] parseLivraisons colonnes détectées:', { cCC, cNomC, cSect, cDir, cBL, cArt, cQty, cCA, cVMB, cDate });
    console.log('[PRISME] parseLivraisons rows:', data.length);
    if (!cCC || !cBL || !cArt) {
      showToast('❌ Livraisons : colonnes obligatoires introuvables (Code client / Numéro de BL / Article)', 'error');
      return;
    }
    const terrLines = [];
    const terrDirData = {};
    const secteurSet = new Set();
    for (const row of data) {
      const cc = String(row[cCC] || '').trim().padStart(6, '0');
      if (!cc || cc === '000000') continue;
      const ca = parseFloat(String(row[cCA] || '0').replace(',', '.')) || 0;
      const vmb = parseFloat(String(row[cVMB] || '0').replace(',', '.')) || 0;
      const blNum = String(row[cBL] || '').trim();
      const articleStr = String(row[cArt] || '').trim();
      const codeArticle = articleStr.split(' - ')[0]?.trim() || '';
      const qty = parseInt(row[cQty]) || 0;
      const rawDate = cDate ? row[cDate] : null;
      const dateObj = rawDate instanceof Date ? rawDate : (rawDate ? parseExcelDate(rawDate) : null);

      // — livraisonsData —
      if (!_S.livraisonsData.has(cc)) {
        _S.livraisonsData.set(cc, { ca: 0, vmb: 0, bl: new Set(), articles: new Map(), lastDate: null });
      }
      const d = _S.livraisonsData.get(cc);
      d.ca += ca; d.vmb += vmb;
      if (blNum) d.bl.add(blNum);
      if (codeArticle) {
        if (!d.articles.has(codeArticle)) d.articles.set(codeArticle, { ca: 0, qty: 0 });
        const a = d.articles.get(codeArticle); a.ca += ca; a.qty += qty;
      }
      if (dateObj && (!d.lastDate || dateObj > d.lastDate)) d.lastDate = dateObj;

      // — territoireLines —
      if (!codeArticle) continue;
      const direction = String(row[cDir] || '').trim() || 'Non défini';
      const secteur = String(row[cSect] || '').trim();
      const clientNom = String(row[cNomC] || '').trim();
      const isSpecial = !/^\d{6}$/.test(codeArticle);
      const stockItem = _S.finalData?.find(a => a.code === codeArticle);
      const rayonStatus = stockItem ? (stockItem.stockActuel > 0 ? 'green' : 'yellow') : 'red';
      const clientType = _S.clientsMagasin?.has(cc) ? 'mixte' : 'exterieur';
      const famille = _S.articleFamille?.[codeArticle] || stockItem?.famille || 'Non classé';
      const libelle = articleStr.includes(' - ') ? articleStr.split(' - ').slice(1).join(' - ').trim() : (_S.libelleLookup?.[codeArticle] || codeArticle);
      if (secteur) secteurSet.add(secteur);
      terrLines.push({ code: codeArticle, libelle, famille, direction, secteur, bl: blNum, ca, canal: 'EXTÉRIEUR',
        clientCode: cc, clientNom, clientType, rayonStatus, isSpecial, commercial: '',
        dateExp: dateObj ? dateObj.getTime() : null });

      // — terrDirData (pour le tableau Directions dans l'onglet Terrain) —
      if (!isSpecial) {
        if (!terrDirData[direction]) terrDirData[direction] = { dir: direction, caTotal: 0, caMag: 0, caExt: 0, refSet: new Set(), absentSet: new Set(), familles: {} };
        const td = terrDirData[direction];
        td.caTotal += ca; td.caExt += ca;
        td.refSet.add(codeArticle); if (rayonStatus === 'red') td.absentSet.add(codeArticle);
        if (!td.familles[famille]) td.familles[famille] = { caTotal: 0, caMag: 0, caExt: 0 };
        td.familles[famille].caTotal += ca; td.familles[famille].caExt += ca;
      }
    }

    _S.livraisonsReady = _S.livraisonsData.size > 0;
    _S.livraisonsClientCount = _S.livraisonsData.size;
    _S.territoireLines = terrLines;
    _S.terrDirectionData = terrDirData;
    _S.territoireReady = terrLines.length > 0;
    _S._terrCanalCache = new Map(); // invalidation cache territoire

    // Secteurs — met à jour les checkboxes dans le filtre Terrain
    buildSecteurCheckboxes([...secteurSet].sort());

    showToast(`📦 Livraisons : ${_S.livraisonsClientCount} clients · ${terrLines.length} lignes terrain chargés`, 'success');

    window.computeReconquestCohort?.();
    window.computeOpportuniteNette?.();
    window.renderTerritoireTab?.();
    window.renderAll?.();
    if (_S.selectedMyStore) window._saveSessionToIDB?.();
  } catch (e) {
    console.error('[PRISME] parseLivraisons error:', e);
    showToast('❌ Erreur lecture Livraisons : ' + e.message, 'error');
  }
}

export function onLivraisonsSelected(input) {
  onFileSelected(input, 'dropLivraisons');
  if (input.files && input.files[0]) parseLivraisons(input.files[0]);
}

// ── Territoire file parsing (3ème fichier) ────────────────────
export async function parseTerritoireFile(f) {
  return new Promise((res, rej) => {
    const reader = new FileReader();
    reader.onerror = () => rej(new Error('Lecture impossible'));
    const ext = f.name.toLowerCase();
    if (ext.endsWith('.csv')) {
      reader.onload = e => {
        try {
          let text = e.target.result;
          const firstLine = text.split('\n')[0] || '';
          const sep = firstLine.includes(';') ? ';' : ',';
          const rows = parseCSVText(text, sep);
          res(rows);
        } catch (err) { rej(err); }
      };
      reader.readAsText(f, 'UTF-8');
    } else {
      reader.onload = e => {
        try {
          const wb = XLSX.read(new Uint8Array(e.target.result), { type: 'array', cellDates: true, cellFormula: false, cellHTML: false, cellStyles: false });
          res(XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' }));
        } catch (err) { rej(err); }
      };
      reader.readAsArrayBuffer(f);
    }
  });
}

// ── Web Worker code for territoire processing ─────────────────
export function _terrWorker() {
  'use strict';
  function cleanOmniPrice(v) { if (!v) return 0; const s = v.toString().replace(/\s/g, '').replace(/€/g, '').replace(/,/g, '.'); return parseFloat(s) || 0; }
  function extractClientCode(val) { const s = (val || '').toString().trim(); const idx = s.indexOf(' - '); return idx >= 0 ? s.slice(0, idx).trim() : s; }
  self.onmessage = function (ev) {
    const { rows, blConsommeArr, blCanalArr, clientsMagasinArr, stockArr, libelleLookupObj, articleFamilleObj } = ev.data;
    const blConsommeSet = new Set(blConsommeArr);
    const blCanalMapLocal = blCanalArr ? new Map(blCanalArr) : new Map();
    const clientsMagasin = new Set(clientsMagasinArr);
    const stockMap = new Map(stockArr.map(r => [r.code, r]));
    const sample = rows[0] || {};
    const _norm = s => (s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
    const findCol = s => Object.keys(sample).find(k => _norm(k).includes(_norm(s)));
    const cClient = findCol('code client') || findCol('code et nom');
    const cNom = findCol('nom client') || findCol('nom');
    const cDir = findCol('direction');
    const cSecteur = findCol('secteur') || findCol('code secteur') || findCol('commercial');
    const cBL = findCol('numero de bl') || findCol('n° bl') || findCol('num bl') || findCol('bl');
    const cArticle = findCol('article');
    const cQty = findCol('quantite livree') || findCol('qte livree') || findCol('qte') || findCol('quantite');
    const cCA = findCol('ca');
    const cDate = findCol("date d'expedition") || findCol('date expedition') || findCol('date exp') || findCol('expedition');
    if (!cArticle) { self.postMessage({ type: 'error', msg: 'Territoire: colonne Article introuvable' }); return; }
    if (!cBL) { self.postMessage({ type: 'error', msg: 'Territoire: colonne Numéro de BL introuvable' }); return; }
    const lines = []; const dirSet = new Set(); const secteurSet = new Set(); const CHUNK = 2000; const total = rows.length;
    for (let ci = 0; ci < Math.ceil(total / CHUNK); ci++) {
      const start = ci * CHUNK, end = Math.min(start + CHUNK, total);
      for (let j = start; j < end; j++) {
        const row = rows[j];
        const qty = cQty ? cleanOmniPrice(row[cQty]) : 0; if (qty < 0) continue;
        const articleRaw = (cArticle ? row[cArticle] || '' : '').toString().trim();
        const code = articleRaw.split(' - ')[0].trim(); if (!code) continue;
        const isSpecial = !/^\d{6}$/.test(code);
        const bl = (cBL ? row[cBL] || '' : '').toString().trim();
        const ca = cCA ? cleanOmniPrice(row[cCA]) : 0;
        const direction = (cDir ? row[cDir] || '' : '').toString().trim() || 'Non défini';
        const secteur = (cSecteur ? row[cSecteur] || '' : '').toString().trim();
        const clientCodeRaw = (cClient ? row[cClient] || '' : '').toString().trim();
        const clientNom = (cNom ? row[cNom] || '' : '').toString().trim();
        const rawDate = cDate ? row[cDate] : null;
        const dateExp = rawDate instanceof Date ? rawDate : (rawDate ? new Date(rawDate) : null);
        const canal = bl ? (blCanalMapLocal.get(bl) || (blConsommeSet.has(bl) ? 'MAGASIN' : 'EXTÉRIEUR')) : 'EXTÉRIEUR';
        const stockItem = stockMap.get(code);
        const rayonStatus = stockItem ? (stockItem.stockActuel > 0 ? 'green' : 'yellow') : 'red';
        const ccRaw = extractClientCode(clientCodeRaw);
        // Pad numeric codes to 6 digits (livraisons format exports integers)
        const ccNum = /^\d+$/.test(ccRaw) && ccRaw.length < 6 ? ccRaw.padStart(6,'0') : ccRaw;
        const clientType = clientsMagasin.has(ccNum) ? 'mixte' : 'exterieur';
        const famItem = articleFamilleObj[code] || (stockItem ? stockItem.famille : '') || 'Non classé';
        const libelle = articleRaw.includes(' - ') ? articleRaw.split(' - ').slice(1).join(' - ').trim() : (libelleLookupObj[code] || code);
        if (!isSpecial) dirSet.add(direction);
        if (secteur) secteurSet.add(secteur);
        lines.push({ code, libelle, direction, secteur, famille: famItem, bl, ca, canal, rayonStatus, clientCode: ccNum, clientNom, clientType, isSpecial, dateExp: dateExp ? dateExp.getTime() : null });
      }
      self.postMessage({ type: 'progress', cur: end, total });
    }
    const terrDirData = {};
    for (const ln of lines) {
      if (ln.isSpecial) continue;
      if (!terrDirData[ln.direction]) terrDirData[ln.direction] = { dir: ln.direction, caTotal: 0, caMag: 0, caExt: 0, refSet: new Set(), absentSet: new Set(), familles: {} };
      const d = terrDirData[ln.direction];
      d.caTotal += ln.ca; if (ln.canal === 'MAGASIN') d.caMag += ln.ca; else d.caExt += ln.ca;
      d.refSet.add(ln.code); if (ln.rayonStatus === 'red') d.absentSet.add(ln.code);
      if (!d.familles[ln.famille]) d.familles[ln.famille] = { caTotal: 0, caMag: 0, caExt: 0 };
      d.familles[ln.famille].caTotal += ln.ca;
      if (ln.canal === 'MAGASIN') d.familles[ln.famille].caMag += ln.ca; else d.familles[ln.famille].caExt += ln.ca;
    }
    self.postMessage({ type: 'done', lines, terrDirData, dirsSorted: [...dirSet].sort(), secteursSorted: [...secteurSet].sort() });
  };
}

export function launchTerritoireWorker(rows, progressCb) {
  return new Promise((resolve, reject) => {
    let workerUrl;
    try {
      const code = `(${_terrWorker.toString()})()`;
      const blob = new Blob([code], { type: 'text/javascript' });
      workerUrl = URL.createObjectURL(blob);
    } catch (e) { reject(new Error('Worker indisponible: ' + e.message)); return; }
    const worker = new Worker(workerUrl);
    _S._activeTerrWorker = worker; // guard: permet l'annulation au re-upload via resetAppState()
    const stockArr = _S.finalData.map(r => ({ code: r.code, stockActuel: r.stockActuel, famille: r.famille }));
    const _blCanalArr = [..._S.blCanalMap.entries()];
    worker.postMessage({ rows, blConsommeArr: [..._S.blConsommeSet], blCanalArr: _blCanalArr, clientsMagasinArr: [..._S.clientsMagasin], stockArr, libelleLookupObj: _S.libelleLookup, articleFamilleObj: _S.articleFamille });
    worker.onmessage = function (ev) {
      const d = ev.data;
      if (d.type === 'progress') { if (progressCb) progressCb(d.cur, d.total); }
      else if (d.type === 'done') {
        _S.territoireLines = d.lines; _S.terrDirectionData = d.terrDirData;
        const sel = document.getElementById('terrFilterDir');
        if (sel) { sel.innerHTML = '<option value="">Toutes Directions</option>'; d.dirsSorted.forEach(dir => { sel.innerHTML += `<option value="${escapeHtml(dir)}">${escapeHtml(dir)}</option>`; }); }
        buildSecteurCheckboxes(d.secteursSorted || []);
        _S.territoireReady = true;
        _S._activeTerrWorker = null; worker.terminate(); URL.revokeObjectURL(workerUrl); resolve();
      } else if (d.type === 'error') {
        _S._activeTerrWorker = null; worker.terminate(); URL.revokeObjectURL(workerUrl); reject(new Error(d.msg));
      }
    };
    worker.onerror = function (e) { _S._activeTerrWorker = null; worker.terminate(); URL.revokeObjectURL(workerUrl); reject(new Error(e.message || 'Worker error')); };
  });
}

// ── B1: Client aggregation Worker ────────────────────────────
export function _clientWorker() {
  self.onmessage = function(e) {
    const { ventesCA, chalandise, articleFamille } = e.data;
    const clientFamCA = {};
    for (const [cc, articles] of ventesCA) {
      clientFamCA[cc] = {};
      for (const [code, data] of articles) {
        const fam = articleFamille[code] || '';
        if (fam) clientFamCA[cc][fam] = (clientFamCA[cc][fam] || 0) + (data.sumCA || 0);
      }
    }
    const metierFamBench = {};
    for (const [cc, info] of chalandise) {
      if (!info.metier) continue;
      const fams = clientFamCA[cc];
      if (!fams) continue;
      if (!metierFamBench[info.metier]) metierFamBench[info.metier] = {};
      for (const [fam, ca] of Object.entries(fams)) {
        if (!metierFamBench[info.metier][fam]) metierFamBench[info.metier][fam] = { nbClients: 0, totalCA: 0 };
        metierFamBench[info.metier][fam].nbClients++;
        metierFamBench[info.metier][fam].totalCA += ca;
      }
    }
    self.postMessage({ clientFamCA, metierFamBench });
  };
}

export function launchClientWorker(progressCb) {
  return new Promise((resolve, reject) => {
    try {
      const code = `(${_clientWorker.toString()})()`;
      const blob = new Blob([code], { type: 'application/javascript' });
      const url = URL.createObjectURL(blob);
      const worker = new Worker(url);
      _S._activeClientWorker = worker;
      const ventesCA = [];
      for (const [cc, artMap] of _S.ventesClientArticle.entries()) {
        const arts = [];
        for (const [code2, data] of artMap.entries()) arts.push([code2, data]);
        ventesCA.push([cc, arts]);
      }
      const chalandise = [];
      for (const [cc, info] of _S.chalandiseData.entries()) {
        chalandise.push([cc, { metier: info.metier, statut: info.statut, classification: info.classification, ca2025: info.ca2025 }]);
      }
      worker.onmessage = (e) => {
        _S._activeClientWorker = null;
        _S.clientFamCA = e.data.clientFamCA;
        _S.metierFamBench = e.data.metierFamBench;
        worker.terminate(); URL.revokeObjectURL(url);
        if (progressCb) progressCb(100);
        resolve();
      };
      worker.onerror = (err) => { _S._activeClientWorker = null; worker.terminate(); URL.revokeObjectURL(url); reject(err); };
      worker.postMessage({ ventesCA, chalandise, articleFamille: _S.articleFamille });
      if (progressCb) progressCb(10);
    } catch (err) { reject(err); }
  });
}

// ── Secteur multi-select helpers ──────────────────────────────
export function buildSecteurCheckboxes(secteurs) {
  const div = document.getElementById('terrSecteurCheckboxes'); if (!div) return;
  if (!secteurs.length) { div.innerHTML = '<p class="text-gray-400 text-[10px] p-1">Aucun secteur trouvé</p>'; return; }
  let html = '';
  for (const s of secteurs) {
    const label = s;
    html += `<label class="flex items-center gap-2 p-1.5 rounded hover:bg-violet-50 cursor-pointer text-xs">
      <input type="checkbox" value="${escapeHtml(s)}" checked onchange="onSecteurChange()" class="rounded">
      <span class="font-semibold">${escapeHtml(label)}</span>
    </label>`;
  }
  div.innerHTML = html;
}

export function toggleSecteurDropdown() {
  const panel = document.getElementById('terrSecteurPanel');
  if (panel) panel.classList.toggle('hidden');
}

export function toggleAllSecteurs(checked) {
  document.querySelectorAll('#terrSecteurCheckboxes input[type=checkbox]').forEach(cb => { cb.checked = checked; });
  onSecteurChange();
}

export function onSecteurChange() {
  const all = document.querySelectorAll('#terrSecteurCheckboxes input[type=checkbox]');
  const checked = [...all].filter(cb => cb.checked);
  const allCb = document.getElementById('terrSecteurAll');
  if (allCb) allCb.checked = (checked.length === all.length);
  const label = document.getElementById('terrSecteurLabel');
  if (label) {
    if (checked.length === all.length || checked.length === 0) label.textContent = 'Tous Secteurs';
    else if (checked.length === 1) label.textContent = checked[0].value;
    else label.textContent = checked.length + ' secteurs';
  }
  renderTerritoireTab();
}

export function getSelectedSecteurs() {
  const all = document.querySelectorAll('#terrSecteurCheckboxes input[type=checkbox]');
  if (!all.length) return null;
  const checked = [...all].filter(cb => cb.checked).map(cb => cb.value);
  if (checked.length === all.length) return null;
  return new Set(checked);
}

// ── Benchmark multi-agences ───────────────────────────────────
export function computeBenchmark(canal = null) {
  // Cache : clé canal unique (string) + mode MAGASIN si applicable.
  const _canauxKey = canal || '';
  const _modeKey = canal === 'MAGASIN' ? (_S._reseauMagasinMode || 'all') : '';
  const _bKey = [
    _S.selectedMyStore || '',
    [..._S.selectedBenchBassin].sort().join(','),
    _S.obsFilterUnivers || '',
    _S.obsFilterMinCA || 0,
    _S.selectedObsCompare || 'median',
    _S.chalandiseReady ? '1' : '0',
    _canauxKey,
    _modeKey,
  ].join('|');
  if (_S._benchCache && _S._benchCache.key === _bKey) {
    _S.benchLists    = _S._benchCache.benchLists;
    _S.benchFamEcarts = _S._benchCache.benchFamEcarts;
    return; // ~0ms — invariant canaux confirmé
  }

  const bassinStores = _S.selectedBenchBassin.size > 0 ? [..._S.selectedBenchBassin] : getBenchCompareStores();
  const cs = bassinStores.filter(s => _S.storesIntersection.has(s));
  _S.benchLists = { missed: [], under: [], over: [], storePerf: {}, familyPerf: [], pepites: [], pepitesOther: [] };
  if (!cs.length) { _S._benchCache = { key: _bKey, benchLists: _S.benchLists, benchFamEcarts: _S.benchFamEcarts }; return; }
  const n = cs.length;
  // Vue canal-filtrée : ventesParMagasinByCanal[store][canal] si canal fourni, sinon ventesParMagasin
  const vpm = {};
  if (!canal) { Object.assign(vpm, _S.ventesParMagasin); }
  else { const _m = canal === 'MAGASIN' ? (_S._reseauMagasinMode || 'all') : 'all'; for (const [store, canalMap] of Object.entries(_S.ventesParMagasinByCanal || {})) { const artMap = canalMap[canal] || {}; const f = {}; for (const [code, data] of Object.entries(artMap)) { const _caSrc = _m === 'preleve' ? (data.sumPrelevee || 0) : _m === 'enleve' ? Math.max(0, (data.sumCA || 0) - (data.sumPrelevee || 0)) : (data.sumCA || 0); f[code] = { sumPrelevee: data.sumPrelevee || 0, sumCA: _caSrc, countBL: data.countBL || 0, sumVMB: data.sumVMB || 0 }; } if (Object.keys(f).length) vpm[store] = f; } }
  let myV = vpm[_S.selectedMyStore] || {};
  const bv = {};
  for (const store of cs) {
    const sv = vpm[store] || {};
    for (const [a, d] of Object.entries(sv)) {
      if (!/^\d{6}$/.test(a)) continue;
      if (!bv[a]) bv[a] = { tp: 0, tb: 0, sc: 0 };
      bv[a].tp += canal ? d.sumCA : d.sumPrelevee; bv[a].tb += d.countBL; bv[a].sc++;
    }
  }
  if (_S.obsFilterUnivers) {
    for (const k of Object.keys(bv)) { if (_S.articleUnivers[k] !== _S.obsFilterUnivers) delete bv[k]; }
    const myVF = {}; for (const [k, v] of Object.entries(myV)) { if (_S.articleUnivers[k] === _S.obsFilterUnivers) myVF[k] = v; }
    myV = myVF;
  }
  const totalArtsInBassin = Object.keys(bv).length || 1;
  const sp = {}; sp[_S.selectedMyStore] = { ref: 0, freq: 0, serv: 0, clientsZone: 0 };
  const _isRefActive = (v) => canal ? v.sumCA > 0 : v.sumPrelevee > 0;
  for (const [k, v] of Object.entries(myV)) { if (_isRefActive(v)) sp[_S.selectedMyStore].ref++; sp[_S.selectedMyStore].freq += v.countBL; }
  sp[_S.selectedMyStore].serv = Math.round((sp[_S.selectedMyStore].ref / totalArtsInBassin) * 100);
  if (_S.chalandiseReady && _S.ventesClientsPerStore[_S.selectedMyStore]) sp[_S.selectedMyStore].clientsZone = [..._S.ventesClientsPerStore[_S.selectedMyStore]].filter(c => _S.chalandiseData.has(c)).length;
  { const _sdMe = vpm[_S.selectedMyStore] || {}; const _cMe = Object.values(_sdMe).reduce((s, v) => s + (v.sumCA || 0), 0); const _vMe = Object.values(_sdMe).reduce((s, v) => s + (v.sumVMB || 0), 0); sp[_S.selectedMyStore].txMarge = _cMe > 0 ? _vMe / _cMe * 100 : null; }
  for (const store of cs) { sp[store] = { ref: 0, freq: 0, serv: 0, clientsZone: 0, txMarge: null }; const sv = vpm[store] || {}; for (const [k, v] of Object.entries(sv)) { if (_S.obsFilterUnivers && _S.articleUnivers[k] !== _S.obsFilterUnivers) continue; if (_isRefActive(v)) sp[store].ref++; sp[store].freq += v.countBL; } sp[store].serv = Math.round((sp[store].ref / totalArtsInBassin) * 100); if (_S.chalandiseReady && _S.ventesClientsPerStore[store]) sp[store].clientsZone = [..._S.ventesClientsPerStore[store]].filter(c => _S.chalandiseData.has(c)).length; const _c = Object.values(sv).reduce((s, v) => s + (v.sumCA || 0), 0); const _v = Object.values(sv).reduce((s, v) => s + (v.sumVMB || 0), 0); sp[store].txMarge = _c > 0 ? _v / _c * 100 : null; }
  _S.benchLists.storePerf = sp;
  // pdmBassin = CA agence ÷ CA total bassin
  { const allSt=Object.keys(sp);const stCA={};let totCA=0;for(const s of allSt){const sv=vpm[s]||{};const ca=Object.values(sv).reduce((acc,v)=>acc+(v.sumCA||0),0);stCA[s]=ca;totCA+=ca;}for(const s of allSt)sp[s].pdmBassin=totCA>0?+(stCA[s]/totCA*100).toFixed(1):0; }
  const myFamFreq = {}; const storesFamFreq = {};
  for (const [code, data] of Object.entries(myV)) { if (!/^\d{6}$/.test(code)) continue; const fam = famLib(_S.articleFamille[code]) || ''; if (fam) myFamFreq[fam] = (myFamFreq[fam] || 0) + data.countBL; }
  for (const store of cs) { storesFamFreq[store] = {}; const sv = vpm[store] || {}; for (const [code, data] of Object.entries(sv)) { if (!/^\d{6}$/.test(code)) continue; if (_S.obsFilterUnivers && _S.articleUnivers[code] !== _S.obsFilterUnivers) continue; const fam = famLib(_S.articleFamille[code]) || ''; if (fam) storesFamFreq[store][fam] = (storesFamFreq[store][fam] || 0) + data.countBL; } }
  const allFamsSet = new Set([...Object.keys(myFamFreq)]); for (const store of cs) for (const f of Object.keys(storesFamFreq[store] || {})) allFamsSet.add(f);
  const bassinFamMedian = {}; for (const fam of allFamsSet) { const vals = cs.map(s => (storesFamFreq[s] || {})[fam] || 0).filter(v => v > 0); if (vals.length) bassinFamMedian[fam] = _median(vals); }
  const familyPerf = []; let familyPerfMasked = 0;
  for (const fam of allFamsSet) { const my = myFamFreq[fam] || 0; const med = bassinFamMedian[fam] || 0; if (med < 2) { if (my > 0) familyPerfMasked++; continue; } const ecart = med > 0 ? ((my - med) / med * 100) : (my > 0 ? 100 : 0); familyPerf.push({ fam, my, med: Math.round(med), ecart }); }
  familyPerf.sort((a, b) => a.ecart - b.ecart); _S.benchLists.familyPerf = familyPerf; _S.benchLists.familyPerfMasked = familyPerfMasked;
  // Calcul benchFamEcarts : mean ± 2σ par famille (pour badge divergence navbar)
  { const fe = {};
    for (const fp of familyPerf) {
      const vals = cs.map(s => (storesFamFreq[s] || {})[fp.fam] || 0);
      const mean = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
      const sigma = vals.length > 1 ? Math.sqrt(vals.reduce((s, v) => s + (v - mean) ** 2, 0) / vals.length) : 0;
      fe[fp.fam] = { mean, sigma, my: fp.my };
    }
    _S.benchFamEcarts = fe;
  }
  for (const [a, b] of Object.entries(bv)) {
    if (b.tb < 3) continue; const md = myV[a]; const mq = md ? (canal ? md.sumCA : md.sumPrelevee) : 0; const myFreq = md ? md.countBL : 0; const avg = b.tp / n; const _rawLib = _S.libelleLookup[a] || a; const lib = /^\d{6} - /.test(_rawLib) ? _rawLib.substring(9).trim() : _rawLib; const ms = (_S.stockParMagasin[_S.selectedMyStore] || {})[a]; const mst = ms ? ms.stockActuel : 0;
    if (myFreq === 0 && b.sc >= Math.min(2, n)) { let diagnostic = mst > 0 ? '🟢 En stock — visibilité?' : '🔴 Stock 0 — référencer?'; _S.benchLists.missed.push({ code: a, lib, bassinFreq: b.tb, sc: b.sc, nbCompare: n, myStock: mst, sv: b.tb, diagnostic }); }
    else if (myFreq > 0 && avg > 0) { const r = mq / avg; if (r < 0.5 && b.sc >= 2) _S.benchLists.under.push({ code: a, lib, myQte: Math.round(mq), avg: Math.round(avg), ratio: r, sv: avg - mq }); else if (r > 1.5 && mq >= 5) _S.benchLists.over.push({ code: a, lib, myQte: Math.round(mq), avg: Math.round(avg), ratio: r, sv: r }); }
  }
  // Sort missed by priority score [V3]: couverture réseau × fréquence × urgence stock zéro
  const _totalAgences = n || 1;
  for (const m of _S.benchLists.missed) {
    m.priorityScore = (m.sc / _totalAgences) * 0.4
      + Math.min(m.bassinFreq / 50, 1) * 0.4
      + (m.myStock === 0 ? 0.2 : 0);
  }
  _S.benchLists.missed.sort((a, b) => b.priorityScore - a.priorityScore);
  _S.benchLists.under.sort((a, b) => b.sv - a.sv); _S.benchLists.over.sort((a, b) => b.sv - a.sv);
  // === OBSERVATOIRE DATA ===
  const prixLookup = {}; for (const r of _S.finalData) prixLookup[r.code] = r.prixUnitaire || 0;
  const finalDataByCode = {}; for (const r of _S.finalData) finalDataByCode[r.code] = r;
  const allOtherStores = [..._S.storesIntersection].filter(s => s !== _S.selectedMyStore);
  const storeFamCA = {}, storeFamRef = {}, storeTotalCA = {};
  const artCA = data => data.sumCA || 0;
  for (const store of allOtherStores) { storeFamCA[store] = {}; storeFamRef[store] = {}; let ca = 0; const sv = vpm[store] || {}; for (const [code, data] of Object.entries(sv)) { if (_S.obsFilterUnivers && _S.articleUnivers[code] !== _S.obsFilterUnivers) continue; const lineCA = artCA(data); ca += lineCA; if (!data.sumPrelevee && !data.sumEnleve && !data.countBL) continue; const fam = famLib(_S.articleFamille[code]); if (!fam || !/^\d{6}$/.test(code)) continue; storeFamCA[store][fam] = (storeFamCA[store][fam] || 0) + lineCA; storeFamRef[store][fam] = (storeFamRef[store][fam] || 0) + 1; } storeTotalCA[store] = ca; }
  const bassinFamCAMed = {}; for (const fam of allFamsSet) { const caVals = cs.map(s => (storeFamCA[s] || {})[fam] || 0).filter(v => v > 0); if (caVals.length) bassinFamCAMed[fam] = _median(caVals); }
  _S.benchLists._bassinFamCAMed = bassinFamCAMed;
  { const _bfpBefore = _S.benchLists.familyPerf.length; _S.benchLists.familyPerf = _S.benchLists.familyPerf.filter(fp => (bassinFamCAMed[fp.fam] || 0) >= 1000); _S.benchLists.familyPerfMasked = (_S.benchLists.familyPerfMasked || 0) + (_bfpBefore - _S.benchLists.familyPerf.length); }
  // Top 5 articles per family (Moi / Méd. / % bassin) for F&F expand
  for (const fp of _S.benchLists.familyPerf) { const myArts = []; for (const [c, d] of Object.entries(myV)) { if (!/^\d{6}$/.test(c) || famLib(_S.articleFamille[c]) !== fp.fam) continue; const artVals = cs.map(s => (vpm[s]?.[c] || {}).countBL || 0).filter(v => v > 0); const med = artVals.length ? Math.round(_median(artVals)) : 0; const pct = med > 0 ? Math.round(d.countBL / med * 100) : null; const _rawLib = _S.libelleLookup[c] || c; const lib = /^\d{6} - /.test(_rawLib) ? _rawLib.substring(9).trim() : _rawLib; myArts.push({ code: c, lib, my: d.countBL, med, pct }); } fp.topArticles = myArts.sort((a, b) => b.my - a.my).slice(0, 5); }
  const myFamCA = {}, myFamRef = {}; let myTotalCA = 0;
  for (const [code, data] of Object.entries(myV)) { const lineCA = artCA(data); myTotalCA += lineCA; if (!data.sumPrelevee && !data.sumEnleve && !data.countBL) continue; if (!/^\d{6}$/.test(code)) continue; const fam = famLib(_S.articleFamille[code]); if (!fam) continue; myFamCA[fam] = (myFamCA[fam] || 0) + lineCA; myFamRef[fam] = (myFamRef[fam] || 0) + 1; }
  // PDM bassin — poids de mon magasin dans le bassin
  const bassinTotalCA = myTotalCA + Object.values(storeTotalCA).reduce((s, v) => s + v, 0); const myPoids = bassinTotalCA > 0 ? myTotalCA / bassinTotalCA : 0; const bassinFamCATot = {}; for (const [fam, ca] of Object.entries(myFamCA)) bassinFamCATot[fam] = ca; for (const store of allOtherStores) for (const [fam, ca] of Object.entries(storeFamCA[store] || {})) bassinFamCATot[fam] = (bassinFamCATot[fam] || 0) + ca;
  // PDM par famille : ma part dans le bassin pour chaque famille
  const famPDM = {};
  for (const fam of Object.keys(bassinFamCATot)) {
    const total = bassinFamCATot[fam] || 0;
    const mine = myFamCA[fam] || 0;
    famPDM[fam] = total > 0 ? Math.round(mine / total * 100) : null;
  }
  // Enrich familyPerf entries with per-family PDM + priorityScore [V3]
  for (const fp of _S.benchLists.familyPerf) {
    fp.pdm = famPDM[fp.fam] ?? null;
    const ecartAbs = Math.abs(fp.ecart) / 100;          // 0-1
    const pdmW = (famPDM[fp.fam] || 0) / 100;           // 0-1
    const caW = (myFamCA[fp.fam] || 0) / (myTotalCA || 1); // poids CA
    fp.priorityScore = ecartAbs * (1 - pdmW) * caW;     // urgence × opportunité × poids
  }
  _S.benchLists.familyPerf.sort((a, b) => b.priorityScore - a.priorityScore);
  const obsMode = _S.selectedObsCompare || 'median';
  let compV = null, compFamCA = {}, compFamRef = {}, compTotalCA = 0, compRef = 0, compFreq = 0, compServ = 0;
  if (obsMode !== 'median' && _S.storesIntersection.has(obsMode)) {
    compV = vpm[obsMode] || {}; compTotalCA = storeTotalCA[obsMode] || 0; compRef = sp[obsMode]?.ref || 0; compFreq = sp[obsMode]?.freq || 0; compServ = sp[obsMode]?.serv || 0; compFamCA = storeFamCA[obsMode] || {}; compFamRef = storeFamRef[obsMode] || {};
  } else {
    const caTotals = cs.map(s => storeTotalCA[s] || 0).filter(v => v > 0); compTotalCA = _median(caTotals);
    const refV = cs.map(s => sp[s]?.ref || 0).filter(v => v > 0); compRef = Math.round(_median(refV));
    const freqV = cs.map(s => sp[s]?.freq || 0).filter(v => v > 0); compFreq = Math.round(_median(freqV));
    const servV = cs.map(s => sp[s]?.serv || 0).filter(v => v > 0); compServ = Math.round(_median(servV));
    const allFamsSet2 = new Set(Object.keys(myFamCA)); for (const s of cs) for (const f of Object.keys(storeFamCA[s] || {})) allFamsSet2.add(f);
    for (const fam of allFamsSet2) { const caV = cs.map(s => storeFamCA[s]?.[fam] || 0).filter(v => v > 0); compFamCA[fam] = caV.length ? _median(caV) : 0; const refV2 = cs.map(s => storeFamRef[s]?.[fam] || 0).filter(v => v > 0); compFamRef[fam] = refV2.length ? Math.round(_median(refV2)) : 0; }
  }
  const myRef = sp[_S.selectedMyStore]?.ref || 0;
  const avgRef = cs.length > 0 ? Math.round(cs.reduce((s, store) => s + (sp[store]?.ref || 0), 0) / cs.length) : 0;
  const myAssort = avgRef > 0 ? Math.round((myRef / avgRef) * 100) : 0;
  const compAssort = 100;
  const myPdm = Math.round(myPoids * 1000) / 10; const compPdmVals = cs.map(s => bassinTotalCA > 0 ? (storeTotalCA[s] || 0) / bassinTotalCA * 100 : 0).filter(v => v > 0); const compPdmMed = Math.round((compPdmVals.length ? _median(compPdmVals) : 0) * 10) / 10; const compPdm = (obsMode !== 'median' && _S.storesIntersection.has(obsMode)) ? Math.round((storeTotalCA[obsMode] || 0) / bassinTotalCA * 1000) / 10 : compPdmMed;
  _S.benchLists._myPoids = myPoids; _S.benchLists._bassinFamCATot = bassinFamCATot; _S.benchLists._myFamCA = myFamCA;
  const compTxMargeVals = cs.map(s => sp[s]?.txMarge ?? null).filter(v => v !== null && v > 0);
  const compTxMarge = (obsMode !== 'median' && _S.storesIntersection.has(obsMode)) ? (sp[obsMode]?.txMarge ?? null) : (compTxMargeVals.length ? _median(compTxMargeVals) : null);
  _S.benchLists.obsKpis = { mine: { ca: myTotalCA, ref: myRef, serv: sp[_S.selectedMyStore]?.serv || 0, freq: sp[_S.selectedMyStore]?.freq || 0, pdm: myPdm, txMarge: sp[_S.selectedMyStore]?.txMarge ?? null }, compared: { ca: compTotalCA, ref: compRef, serv: compServ, freq: compFreq, pdm: compPdm, txMarge: compTxMarge } };
  const allFams2 = new Set([...Object.keys(myFamCA), ...Object.keys(compFamCA)]);
  const obsFamiliesLose = [], obsFamiliesWin = [];
  for (const fam of allFams2) {
    const caMe = myFamCA[fam] || 0, caOther = compFamCA[fam] || 0; if (caMe < 50 && caOther < 50) continue;
    const refMe = myFamRef[fam] || 0, refOther = compFamRef[fam] || 0;
    const ecartPct = caOther > 0 ? Math.round((caMe - caOther) / caOther * 100) : (caMe > 0 ? 100 : 0);
    let missingArts = [], specialArts = [];
    const _splitLib = raw => { if (!raw) return 'Libellé non disponible'; const m = /^\d{6} - /.exec(raw); return m ? raw.substring(m[0].length).trim() : raw; };
    if (compV) { for (const [code, data] of Object.entries(compV)) { if (famLib(_S.articleFamille[code]) !== fam || (data.sumPrelevee || 0) + (data.sumEnleve || 0) <= 0) continue; if ((myV[code]?.sumPrelevee || 0) > 0) continue; const r = finalDataByCode[code]; const statutMe = !r ? '❌ Absent' : r.stockActuel > 0 ? '✅ En stock' : r.ancienMax > 0 ? '⚠️ Rupture' : '❌ Absent'; const caA = artCA(data); if (!/^\d{6}$/.test(code)) { specialArts.push({ code, freqOther: data.countBL, caOther: Math.round(caA) }); continue; } const r2 = finalDataByCode[code]; const statMe2 = !r2 ? '❌ Absent' : r2.stockActuel > 0 ? '✅ En stock' : r2.ancienMax > 0 ? '⚠️ Rupture' : '❌ Absent'; missingArts.push({ code, lib: _splitLib(_S.libelleLookup[code] || 'Libellé non disponible'), freqOther: data.countBL, caOther: Math.round(caA), statutMe: statMe2 }); }
    } else { const threshold = refMe === 0 ? 2 : Math.max(2, Math.ceil(cs.length / 2)); const artCnt = {}, artFreqSum = {}, artCASum = {}; for (const store of cs) { const sv2 = vpm[store] || {}; for (const [code, data] of Object.entries(sv2)) { if (famLib(_S.articleFamille[code]) !== fam || (data.sumPrelevee || 0) + (data.sumEnleve || 0) <= 0) continue; if (_S.obsFilterUnivers && _S.articleUnivers[code] !== _S.obsFilterUnivers) continue; artCnt[code] = (artCnt[code] || 0) + 1; artFreqSum[code] = (artFreqSum[code] || 0) + data.countBL; artCASum[code] = (artCASum[code] || 0) + artCA(data); } } for (const [code, cnt] of Object.entries(artCnt)) { if (cnt < threshold || (myV[code]?.sumPrelevee || 0) > 0) continue; const r = finalDataByCode[code]; const statutMe = !r ? '❌ Absent' : r.stockActuel > 0 ? '✅ En stock' : r.ancienMax > 0 ? '⚠️ Rupture' : '❌ Absent'; const caO2 = Math.round(artCASum[code] / cnt); if (!/^\d{6}$/.test(code)) { specialArts.push({ code, freqOther: Math.round(artFreqSum[code] / cnt), caOther: caO2, nbStores: cnt }); continue; } const r2b = finalDataByCode[code]; const statMe2b = !r2b ? '❌ Absent' : r2b.stockActuel > 0 ? '✅ En stock' : r2b.ancienMax > 0 ? '⚠️ Rupture' : '❌ Absent'; missingArts.push({ code, lib: _splitLib(_S.libelleLookup[code] || 'Libellé non disponible'), freqOther: Math.round(artFreqSum[code] / cnt), caOther: caO2, statutMe: statMe2b, nbStores: cnt }); } }
    if (refMe === 0) { missingArts.sort((a, b) => b.caOther - a.caOther); } else { missingArts.sort((a, b) => b.freqOther - a.freqOther); } missingArts = missingArts.slice(0, 50);
    // Articles exclusifs — vendus par moi mais pas par la comparaison
    const exclusiveArts = []; if (compV) { for (const [code, data] of Object.entries(myV)) { if (famLib(_S.articleFamille[code]) !== fam || (data.sumPrelevee || 0) <= 0 || !/^\d{6}$/.test(code)) continue; if ((compV[code]?.sumPrelevee || 0) > 0 || (compV[code]?.sumEnleve || 0) > 0) continue; const lib = _S.libelleLookup[code] || code; const splitLib = /^\d{6} - /.test(lib) ? lib.substring(9).trim() : lib; exclusiveArts.push({ code, lib: splitLib, freq: data.countBL, ca: Math.round(artCA(data)) }); } } else { const threshold = Math.max(2, Math.ceil(cs.length / 2)); for (const [code, data] of Object.entries(myV)) { if (famLib(_S.articleFamille[code]) !== fam || (data.sumPrelevee || 0) <= 0 || !/^\d{6}$/.test(code)) continue; let otherCount = 0; for (const store of cs) { if ((vpm[store]?.[code]?.sumPrelevee || 0) > 0) otherCount++; } if (otherCount >= threshold) continue; const lib = _S.libelleLookup[code] || code; const splitLib = /^\d{6} - /.test(lib) ? lib.substring(9).trim() : lib; exclusiveArts.push({ code, lib: splitLib, freq: data.countBL, ca: Math.round(artCA(data)), nbStores: otherCount }); } } exclusiveArts.sort((a, b) => b.ca - a.ca);
    const entry = { fam, caMe, caOther, ecartPct, refMe, refOther, missingArts, specialArts, exclusiveArts: exclusiveArts.slice(0, 30), caTheorique: Math.round(myPoids * (bassinFamCATot[fam] || 0)), ecartTheorique: Math.round((myFamCA[fam] || 0) - myPoids * (bassinFamCATot[fam] || 0)), pdm: famPDM[fam] ?? null };
    if (ecartPct <= -5) obsFamiliesLose.push(entry); else if (ecartPct >= 5) obsFamiliesWin.push(entry);
  }
  obsFamiliesLose.sort((a, b) => Math.abs(b.caOther - b.caMe) - Math.abs(a.caOther - a.caMe) || a.ecartPct - b.ecartPct);
  obsFamiliesWin.sort((a, b) => (b.caMe - b.caOther) - (a.caMe - a.caOther));
  _S.benchLists.obsFamiliesLose = obsFamiliesLose; _S.benchLists.obsFamiliesWin = obsFamiliesWin;
  _S.benchLists.obsActionPlan = obsFamiliesLose.slice(0, 3).map(f => { const artsToRef = (f.missingArts || []).filter(a => a.statutMe !== '✅ En stock'); const artsVisi = (f.missingArts || []).filter(a => a.statutMe === '✅ En stock'); return { fam: f.fam, ecartPct: f.ecartPct, nbToRef: artsToRef.length, nbVisibility: artsVisi.length, refOther: f.refOther, caPotentiel: Math.round(Math.abs(f.caOther - f.caMe)) }; });
  // === PÉPITES — articles où je surperforme / où le réseau me surpasse ===
  // Build per-code frequency + CA lists across cs stores (one pass)
  const _pepCsFreqs = {}, _pepCsCA = {};
  for (const store of cs) { const sv = vpm[store] || {}; for (const [code, data] of Object.entries(sv)) { if (!/^\d{6}$/.test(code) || !(data.countBL > 0)) continue; if (!_pepCsFreqs[code]) { _pepCsFreqs[code] = []; _pepCsCA[code] = []; } _pepCsFreqs[code].push(data.countBL); _pepCsCA[code].push(artCA(data)); } }
  const _pepLib = code => { const r = _S.libelleLookup[code] || code; return /^\d{6} - /.test(r) ? r.substring(9).trim() : r; };
  // 💎 Mes pépites — I outperform
  const pepites = [];
  for (const [code, data] of Object.entries(myV)) {
    if (!/^\d{6}$/.test(code)) continue;
    const myFreq = data.countBL || 0;
    if (myFreq < 2) continue;
    const csFreqs = _pepCsFreqs[code] || [];
    // In 1v1 mode: compare directly against compV; in median mode: use cs median
    const compFreq = compV ? (compV[code]?.countBL || 0) : (csFreqs.length ? _median(csFreqs) : 0);
    if (compFreq <= 0 || myFreq <= compFreq * 1.3) continue;
    const ecartPct = Math.round((myFreq / compFreq - 1) * 100);
    pepites.push({ code, lib: _pepLib(code), fam: famLib(_S.articleFamille[code]) || '', myFreq, compFreq: Math.round(compFreq), ecartPct, caMe: Math.round(artCA(data)) });
  }
  pepites.sort((a, b) => (b.myFreq - b.compFreq) - (a.myFreq - a.compFreq));
  _S.benchLists.pepites = pepites.slice(0, 50);
  // 🔥 Pépites réseau — comparison outperforms me
  const pepitesOther = [];
  const _addPepOther = (code, compFreq, caComp) => {
    const myFreq = myV[code]?.countBL || 0;
    if (compFreq < 2 || compFreq <= myFreq * 1.3) return;
    const ecartPct = myFreq > 0 ? Math.round((compFreq / myFreq - 1) * 100) : null;
    pepitesOther.push({ code, lib: _pepLib(code), fam: famLib(_S.articleFamille[code]) || '', myFreq, compFreq: Math.round(compFreq), ecartPct, caComp: Math.round(caComp) });
  };
  if (compV) {
    for (const [code, data] of Object.entries(compV)) { if (!/^\d{6}$/.test(code)) continue; _addPepOther(code, data.countBL || 0, artCA(data)); }
  } else {
    for (const [code, csFreqs] of Object.entries(_pepCsFreqs)) { if (!csFreqs.length) continue; const caArr = _pepCsCA[code] || []; _addPepOther(code, _median(csFreqs), caArr.length ? _median(caArr) : 0); }
  }
  pepitesOther.sort((a, b) => (b.compFreq - b.myFreq) - (a.compFreq - a.myFreq));
  _S.benchLists.pepitesOther = pepitesOther.slice(0, 50);

  // Mémoriser le résultat — clé sans canal (invariant architectural)
  _S._benchCache = { key: _bKey, benchLists: _S.benchLists, benchFamEcarts: _S.benchFamEcarts };
}

// ── Worker réseau inline ────────────────────────────────────────────────────
// Calcule : nomades, orphelins réseau, fuites par métier
export function _reseauWorker() {
  self.onmessage = function(e) {
    const { myStore, ventesParMagasin, storesIntersection, articleFamille,
            chalandiseData, chalandiseReady, famLookup } = e.data;
    const _famLib = (code) => (famLookup && famLookup[code]) ? famLookup[code] : (code || '');

    // Convertir articleClientsMap en Map de Sets pour lookup rapide
    const artClientsMap = {};
    for (const [code, arr] of Object.entries(e.data.articleClientsMap || {})) {
      artClientsMap[code] = new Set(arr);
    }

    // ── 1. Nomades : clients actifs dans ≥2 agences dont myStore ──────────
    const clientStores = {}; // cc → Set<store>
    for (const store of storesIntersection) {
      const sv = ventesParMagasin[store] || {};
      // ventesParMagasin est indexé par article dans le worker, on a besoin d'une map client→store
      // Transmis via clientsPerStore (Set<cc> par store)
    }
    const nomades = [];
    const myClients = new Set(e.data.clientsPerStore[myStore] || []);
    for (const cc of myClients) {
      let count = 0;
      for (const store of storesIntersection) {
        if ((e.data.clientsPerStore[store] || []).includes(cc)) count++;
      }
      if (count >= 2) nomades.push(cc);
    }

    // ── 2. Orphelins réseau : articles ≥50% stores sans moi (top 50) ───────
    const artStoreCount = {}; // code → nb stores avec ventes
    const artTotalFreq = {};  // code → fréquence totale réseau
    for (const store of storesIntersection) {
      if (store === myStore) continue;
      const sv = ventesParMagasin[store] || {};
      for (const [code, data] of Object.entries(sv)) {
        if (!/^\d{6}$/.test(code)) continue;
        if ((data.countBL || 0) > 0) {
          artStoreCount[code] = (artStoreCount[code] || 0) + 1;
          artTotalFreq[code] = (artTotalFreq[code] || 0) + (data.countBL || 0);
        }
      }
    }
    const otherStoresCount = storesIntersection.filter(s => s !== myStore).length || 1;
    const myV = ventesParMagasin[myStore] || {};
    const orphelins = [];
    for (const [code, cnt] of Object.entries(artStoreCount)) {
      if (cnt < otherStoresCount * 0.5) continue; // présent dans <50% des autres stores
      if ((myV[code]?.countBL || 0) > 0) continue; // déjà vendu chez moi
      const fam = _famLib(articleFamille[code] || '');
      orphelins.push({ code, fam, nbStores: cnt, totalFreq: artTotalFreq[code] || 0 });
    }
    orphelins.sort((a, b) => b.nbStores - a.nbStores || b.totalFreq - a.totalFreq);

    // ── 3. Fuites par métier (si chalandise) ────────────────────────────────
    const fuitesParMetier = [];
    if (chalandiseReady && chalandiseData) {
      const metierTotal = {}, metierActifs = {};
      for (const [cc, info] of chalandiseData) {
        if (!info.metier) continue;
        metierTotal[info.metier] = (metierTotal[info.metier] || 0) + 1;
      }
      for (const cc of (e.data.clientsPerStore[myStore] || [])) {
        const info = chalandiseData.find ? null : (chalandiseData[cc] || null);
        // chalandiseData transmis comme tableau de paires [cc, info]
        // on reconstruit depuis le tableau passé
        const metier = (e.data.chalandiseMetierMap || {})[cc];
        if (!metier) continue;
        metierActifs[metier] = (metierActifs[metier] || 0) + 1;
      }
      for (const [metier, total] of Object.entries(metierTotal)) {
        if (total < 3) continue;
        const actifs = metierActifs[metier] || 0;
        const indiceFuite = 1 - actifs / total;
        fuitesParMetier.push({ metier, total, actifs, indiceFuite: Math.round(indiceFuite * 100) });
      }
      fuitesParMetier.sort((a, b) => b.indiceFuite - a.indiceFuite);
    }

    // ── 4. Nomades × Articles : ce que mes nomades achètent ailleurs mais pas chez moi
    const CROSS_AGENCE_MIN_CA = e.data.crossAgenceMinCA || 150;
    const CROSS_AGENCE_MIN_BL = e.data.crossAgenceMinBL || 2;

    const nomadeSet = new Set(nomades);
    // article → { clients: Set<cc>, caByStore: { store: avgCA }, totalCaOther, totalBLOther }
    const missedByArt = {};

    for (const store of storesIntersection) {
      if (store === myStore) continue;
      const sv = ventesParMagasin[store] || {};
      const storeClientsSet = new Set(e.data.clientsPerStore[store] || []);

      for (const [code, data] of Object.entries(sv)) {
        if (!/^\d{6}$/.test(code)) continue;
        if ((data.countBL || 0) === 0) continue;
        if ((myV[code]?.countBL || 0) > 0) continue; // déjà vendu chez moi

        // Trouver les clients nomades qui ont acheté cet article dans ce store
        const artBuyers = artClientsMap[code]; // Set des clients qui ont acheté cet article
        if (!artBuyers) continue;

        let foundNomade = false;
        for (const cc of artBuyers) {
          if (!nomadeSet.has(cc)) continue;
          if (!storeClientsSet.has(cc)) continue; // ce client a-t-il acheté dans ce store ?
          if (!missedByArt[code]) missedByArt[code] = { clients: new Set(), caByStore: {}, totalCaOther: 0, totalBLOther: 0 };
          missedByArt[code].clients.add(cc);
          foundNomade = true;
        }
        // CA : valeur unitaire moyenne + totaux — ajoutés UNE seule fois par store
        if (foundNomade && !missedByArt[code].caByStore[store]) {
          const avgCA = data.countBL > 0 ? Math.round((data.sumCA || 0) / data.countBL) : 0;
          missedByArt[code].caByStore[store] = avgCA;
          missedByArt[code].totalCaOther += (data.sumCA || 0);
          missedByArt[code].totalBLOther += (data.countBL || 0);
        }
      }
    }

    // Finaliser : filtrer par seuils CA et BL, trier par CA autre agence DESC
    const nomadesMissedArts = Object.entries(missedByArt)
      .filter(([, d]) => d.totalCaOther >= CROSS_AGENCE_MIN_CA && d.totalBLOther >= CROSS_AGENCE_MIN_BL)
      .map(([code, d]) => {
        const caValues = Object.values(d.caByStore);
        const caMedian = caValues.length
          ? Math.round(caValues.sort((a, b) => a - b)[Math.floor(caValues.length / 2)])
          : 0;
        return {
          code,
          fam: _famLib(articleFamille[code] || ''),
          nbClients: d.clients.size,
          clientCodes: [...d.clients].slice(0, 10),
          caReseau: caMedian,
          totalCaOther: Math.round(d.totalCaOther),
          totalBLOther: d.totalBLOther
        };
      })
      .sort((a, b) => b.totalCaOther - a.totalCaOther)
      .slice(0, 50);

    self.postMessage({
      nomades: nomades.slice(0, 200),
      orphelins: orphelins.slice(0, 50),
      fuitesParMetier: fuitesParMetier.slice(0, 30),
      nomadesMissedArts: nomadesMissedArts
    });
  };
}

export function launchReseauWorker() {
  if (_S._activeReseauWorker) { try { _S._activeReseauWorker.terminate(); } catch (_) {} }
  return new Promise((resolve, reject) => {
    try {
      const code = `(${_reseauWorker.toString()})()`;
      const blob = new Blob([code], { type: 'application/javascript' });
      const url = URL.createObjectURL(blob);
      const worker = new Worker(url);
      _S._activeReseauWorker = worker;

      // Préparer clientsPerStore : store → [cc, ...]
      const clientsPerStore = {};
      for (const store of _S.storesIntersection) {
        clientsPerStore[store] = [...(_S.ventesClientsPerStore[store] || new Set())];
      }

      // chalandiseMetierMap : cc → metier
      const chalandiseMetierMap = {};
      if (_S.chalandiseReady) {
        for (const [cc, info] of _S.chalandiseData.entries()) {
          if (info.metier) chalandiseMetierMap[cc] = info.metier;
        }
      }

      worker.onmessage = (ev) => {
        _S.reseauNomades = ev.data.nomades || [];
        _S.nomadesMissedArts = ev.data.nomadesMissedArts || [];
        _S.reseauOrphelins = ev.data.orphelins || [];
        _S.reseauFuitesMetier = ev.data.fuitesParMetier || [];
        worker.terminate(); URL.revokeObjectURL(url);
        _S._activeReseauWorker = null;
        resolve();
      };
      worker.onerror = (err) => {
        worker.terminate(); URL.revokeObjectURL(url);
        _S._activeReseauWorker = null;
        reject(err);
      };
      // Convertir _S.articleClients (Map) en objet sérialisable pour le worker
      const articleClientsMap = {};
      for (const [code, clients] of _S.articleClients.entries()) {
        articleClientsMap[code] = [...clients];
      }

      worker.postMessage({
        myStore: _S.selectedMyStore,
        ventesParMagasin: _S.ventesParMagasin,
        storesIntersection: [..._S.storesIntersection],
        articleFamille: _S.articleFamille,
        chalandiseReady: _S.chalandiseReady,
        chalandiseData: null, // non transmis (lourd) — on passe chalandiseMetierMap
        chalandiseMetierMap,
        clientsPerStore,
        articleClientsMap,
        famLookup: FAMILLE_LOOKUP,
        crossAgenceMinCA: CROSS_AGENCE_MIN_CA,
        crossAgenceMinBL: CROSS_AGENCE_MIN_BL
      });
    } catch (err) { reject(err); }
  });
}
