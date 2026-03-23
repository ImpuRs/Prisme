// ═══════════════════════════════════════════════════════════════
// PILOT PRO — parser.js
// Pipeline de données : parsing fichiers + benchmark
// Dépend de : constants.js, utils.js, state.js, engine.js
// Note : utilise des fonctions DOM (showToast, updateProgress, etc.)
//        qui restent dans index.html/ui.js — fonctionne car scope global
// ═══════════════════════════════════════════════════════════════
'use strict';

// ── Zone de Chalandise (4ème fichier optionnel) ───────────────
async function parseChalandise(file) {
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

  chalandiseData = new Map();
  const metiersSet = new Set();
  for (const row of data) {
    const rawCode = (cCode ? row[cCode] || '' : '').toString().trim();
    const cc = extractClientCode(rawCode);
    if (!cc) continue;
    const metier = (cMetier ? row[cMetier] || '' : '').toString().trim();
    if (metier) metiersSet.add(metier);
    chalandiseData.set(cc, {
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
  chalandiseMetiers = [...metiersSet].sort();
  chalandiseReady = true;
  const nbActifs = [...chalandiseData.values()].filter(i => { const s = (i.statut || '').toLowerCase(); return s.includes('actif') && !s.includes('inactif'); }).length;
  const nbPerdus = [...chalandiseData.values()].filter(i => { const s = (i.statut || '').toLowerCase(); return s.includes('perdu') || s.includes('inactif'); }).length;
  showToast(`📋 Chalandise : ${chalandiseData.size} clients · ${metiersSet.size} métiers · ${nbActifs} actifs · ${nbPerdus} perdus`, 'success');
  // Show territoire tab if chalandise loaded (even without territoire file)
  const terrBtn = document.getElementById('btnTabTerritoire'); if (terrBtn) terrBtn.classList.remove('hidden');
  // Rebuild overview if already on territoire tab
  if (finalData && finalData.length > 0) { computeClientCrossing(); renderAll(); }
  _saveSessionToIDB(); // Sauvegarder avec les données chalandise
}

function onChalandiseSelected(input) {
  onFileSelected(input, 'dropChalandise');
  if (input.files && input.files[0]) parseChalandise(input.files[0]);
}

// ── Territoire file parsing (3ème fichier) ────────────────────
async function parseTerritoireFile(f) {
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
function _terrWorker() {
  'use strict';
  function cleanOmniPrice(v) { if (!v) return 0; const s = v.toString().replace(/\s/g, '').replace(/€/g, '').replace(/,/g, '.'); return parseFloat(s) || 0; }
  function extractClientCode(val) { const s = (val || '').toString().trim(); const idx = s.indexOf(' - '); return idx >= 0 ? s.slice(0, idx).trim() : s; }
  self.onmessage = function (ev) {
    const { rows, blConsommeArr, clientsMagasinArr, stockArr, libelleLookupObj, articleFamilleObj } = ev.data;
    const blConsommeSet = new Set(blConsommeArr);
    const clientsMagasin = new Set(clientsMagasinArr);
    const stockMap = new Map(stockArr.map(r => [r.code, r]));
    const sample = rows[0] || {};
    const findCol = s => Object.keys(sample).find(k => k.toLowerCase().includes(s.toLowerCase()));
    const cClient = findCol('code client') || findCol('code et nom');
    const cNom = findCol('nom client') || findCol('nom');
    const cDir = findCol('direction');
    const cSecteur = findCol('secteur') || findCol('code secteur') || findCol('commercial');
    const cBL = findCol('numéro de bl') || findCol('numero de bl') || findCol('n° bl') || findCol('bl');
    const cArticle = findCol('article');
    const cQty = findCol('quantité livrée') || findCol('quantite livree') || findCol('qté') || findCol('qte');
    const cCA = findCol('ca');
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
        const canal = bl && blConsommeSet.has(bl) ? 'MAGASIN' : 'EXTÉRIEUR';
        const stockItem = stockMap.get(code);
        const rayonStatus = stockItem ? (stockItem.stockActuel > 0 ? 'green' : 'yellow') : 'red';
        const ccNum = extractClientCode(clientCodeRaw);
        const clientType = clientsMagasin.has(ccNum) ? 'mixte' : 'exterieur';
        const famItem = articleFamilleObj[code] || (stockItem ? stockItem.famille : '') || 'Non classé';
        const libelle = articleRaw.includes(' - ') ? articleRaw.split(' - ').slice(1).join(' - ').trim() : (libelleLookupObj[code] || code);
        if (!isSpecial) dirSet.add(direction);
        if (secteur) secteurSet.add(secteur);
        lines.push({ code, libelle, direction, secteur, famille: famItem, bl, ca, canal, rayonStatus, clientCode: ccNum, clientNom, clientType, isSpecial });
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

function launchTerritoireWorker(rows, progressCb) {
  return new Promise((resolve, reject) => {
    let workerUrl;
    try {
      const code = `(${_terrWorker.toString()})()`;
      const blob = new Blob([code], { type: 'text/javascript' });
      workerUrl = URL.createObjectURL(blob);
    } catch (e) { reject(new Error('Worker indisponible: ' + e.message)); return; }
    const worker = new Worker(workerUrl);
    const stockArr = finalData.map(r => ({ code: r.code, stockActuel: r.stockActuel, famille: r.famille }));
    worker.postMessage({ rows, blConsommeArr: [...blConsommeSet], clientsMagasinArr: [...clientsMagasin], stockArr, libelleLookupObj: libelleLookup, articleFamilleObj: articleFamille });
    worker.onmessage = function (ev) {
      const d = ev.data;
      if (d.type === 'progress') { if (progressCb) progressCb(d.cur, d.total); }
      else if (d.type === 'done') {
        territoireLines = d.lines; terrDirectionData = d.terrDirData;
        const sel = document.getElementById('terrFilterDir');
        if (sel) { sel.innerHTML = '<option value="">Toutes Directions</option>'; d.dirsSorted.forEach(dir => { sel.innerHTML += `<option value="${dir}">${dir}</option>`; }); }
        buildSecteurCheckboxes(d.secteursSorted || []);
        territoireReady = true;
        worker.terminate(); URL.revokeObjectURL(workerUrl); resolve();
      } else if (d.type === 'error') {
        worker.terminate(); URL.revokeObjectURL(workerUrl); reject(new Error(d.msg));
      }
    };
    worker.onerror = function (e) { worker.terminate(); URL.revokeObjectURL(workerUrl); reject(new Error(e.message || 'Worker error')); };
  });
}

// ── Secteur multi-select helpers ──────────────────────────────
function buildSecteurCheckboxes(secteurs) {
  const div = document.getElementById('terrSecteurCheckboxes'); if (!div) return;
  if (!secteurs.length) { div.innerHTML = '<p class="text-gray-400 text-[10px] p-1">Aucun secteur trouvé</p>'; return; }
  let html = '';
  for (const s of secteurs) {
    const dirLabel = getSecteurDirection(s);
    const label = dirLabel ? `${s} (${dirLabel})` : s;
    html += `<label class="flex items-center gap-2 p-1.5 rounded hover:bg-violet-50 cursor-pointer text-xs">
      <input type="checkbox" value="${s}" checked onchange="onSecteurChange()" class="rounded">
      <span class="font-semibold">${label}</span>
    </label>`;
  }
  div.innerHTML = html;
}

function toggleSecteurDropdown() {
  const panel = document.getElementById('terrSecteurPanel');
  if (panel) panel.classList.toggle('hidden');
}

function toggleAllSecteurs(checked) {
  document.querySelectorAll('#terrSecteurCheckboxes input[type=checkbox]').forEach(cb => { cb.checked = checked; });
  onSecteurChange();
}

function onSecteurChange() {
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

function getSelectedSecteurs() {
  const all = document.querySelectorAll('#terrSecteurCheckboxes input[type=checkbox]');
  if (!all.length) return null;
  const checked = [...all].filter(cb => cb.checked).map(cb => cb.value);
  if (checked.length === all.length) return null;
  return new Set(checked);
}

// ── Benchmark multi-agences ───────────────────────────────────
function computeBenchmark() {
  const cs = getBenchCompareStores().filter(s => storesIntersection.has(s));
  benchLists = { missed: [], under: [], over: [], storePerf: {}, familyPerf: [], pepites: [], pepitesOther: [] };
  if (!cs.length) return;
  // Normalize famille names: strip prefix code "O05 - " etc. to avoid duplicates
  // when consommé (no prefix) and stock (with prefix) name the same family differently.
  const _normFam = f => f ? f.replace(/^[A-Z]\d{2,3} - /, '') : f;
  const n = cs.length;
  let myV = ventesParMagasin[selectedMyStore] || {};
  const bv = {};
  for (const store of cs) {
    const sv = ventesParMagasin[store] || {};
    for (const [a, d] of Object.entries(sv)) {
      if (!/^\d{6}$/.test(a)) continue;
      if (!bv[a]) bv[a] = { tp: 0, tb: 0, sc: 0 };
      bv[a].tp += d.sumPrelevee; bv[a].tb += d.countBL; bv[a].sc++;
    }
  }
  if (obsFilterUnivers) {
    for (const k of Object.keys(bv)) { if (articleUnivers[k] !== obsFilterUnivers) delete bv[k]; }
    const myVF = {}; for (const [k, v] of Object.entries(myV)) { if (articleUnivers[k] === obsFilterUnivers) myVF[k] = v; }
    myV = myVF;
  }
  const totalArtsInBassin = Object.keys(bv).length || 1;
  const sp = {}; sp[selectedMyStore] = { ref: 0, freq: 0, serv: 0, clientsZone: 0 };
  for (const [k, v] of Object.entries(myV)) { if (v.sumPrelevee > 0) sp[selectedMyStore].ref++; sp[selectedMyStore].freq += v.countBL; }
  sp[selectedMyStore].serv = Math.round((sp[selectedMyStore].ref / totalArtsInBassin) * 100);
  if (chalandiseReady && ventesClientsPerStore[selectedMyStore]) sp[selectedMyStore].clientsZone = [...ventesClientsPerStore[selectedMyStore]].filter(c => chalandiseData.has(c)).length;
  { const _sdMe = ventesParMagasin[selectedMyStore] || {}; const _cMe = Object.values(_sdMe).reduce((s, v) => s + (v.sumCA || 0), 0); const _vMe = Object.values(_sdMe).reduce((s, v) => s + (v.sumVMB || 0), 0); sp[selectedMyStore].txMarge = _cMe > 0 ? _vMe / _cMe * 100 : null; }
  for (const store of cs) { sp[store] = { ref: 0, freq: 0, serv: 0, clientsZone: 0, txMarge: null }; const sv = ventesParMagasin[store] || {}; for (const [k, v] of Object.entries(sv)) { if (obsFilterUnivers && articleUnivers[k] !== obsFilterUnivers) continue; if (v.sumPrelevee > 0) sp[store].ref++; sp[store].freq += v.countBL; } sp[store].serv = Math.round((sp[store].ref / totalArtsInBassin) * 100); if (chalandiseReady && ventesClientsPerStore[store]) sp[store].clientsZone = [...ventesClientsPerStore[store]].filter(c => chalandiseData.has(c)).length; const _c = Object.values(sv).reduce((s, v) => s + (v.sumCA || 0), 0); const _v = Object.values(sv).reduce((s, v) => s + (v.sumVMB || 0), 0); sp[store].txMarge = _c > 0 ? _v / _c * 100 : null; }
  benchLists.storePerf = sp;
  const myFamFreq = {}; const storesFamFreq = {};
  for (const [code, data] of Object.entries(myV)) { if (!/^\d{6}$/.test(code)) continue; const fam = _normFam(articleFamille[code]) || ''; if (fam) myFamFreq[fam] = (myFamFreq[fam] || 0) + data.countBL; }
  for (const store of cs) { storesFamFreq[store] = {}; const sv = ventesParMagasin[store] || {}; for (const [code, data] of Object.entries(sv)) { if (!/^\d{6}$/.test(code)) continue; if (obsFilterUnivers && articleUnivers[code] !== obsFilterUnivers) continue; const fam = _normFam(articleFamille[code]) || ''; if (fam) storesFamFreq[store][fam] = (storesFamFreq[store][fam] || 0) + data.countBL; } }
  const allFamsSet = new Set([...Object.keys(myFamFreq)]); for (const store of cs) for (const f of Object.keys(storesFamFreq[store] || {})) allFamsSet.add(f);
  const bassinFamMedian = {}; for (const fam of allFamsSet) { const vals = cs.map(s => (storesFamFreq[s] || {})[fam] || 0).filter(v => v > 0); if (vals.length) bassinFamMedian[fam] = _median(vals); }
  const familyPerf = []; let familyPerfMasked = 0;
  for (const fam of allFamsSet) { const my = myFamFreq[fam] || 0; const med = bassinFamMedian[fam] || 0; if (med < 2) { if (my > 0) familyPerfMasked++; continue; } const ecart = med > 0 ? ((my - med) / med * 100) : (my > 0 ? 100 : 0); familyPerf.push({ fam, my, med: Math.round(med), ecart }); }
  familyPerf.sort((a, b) => a.ecart - b.ecart); benchLists.familyPerf = familyPerf; benchLists.familyPerfMasked = familyPerfMasked;
  for (const [a, b] of Object.entries(bv)) {
    if (b.tb < 3) continue; const md = myV[a], mq = md ? md.sumPrelevee : 0; const avg = b.tp / n; const _rawLib = libelleLookup[a] || a; const lib = /^\d{6} - /.test(_rawLib) ? _rawLib.substring(9).trim() : _rawLib; const ms = (stockParMagasin[selectedMyStore] || {})[a]; const mst = ms ? ms.stockActuel : 0;
    if (mq === 0 && b.sc >= Math.min(2, n)) { let diagnostic = mst > 0 ? '🟢 En stock — visibilité?' : '🔴 Stock 0 — référencer?'; benchLists.missed.push({ code: a, lib, bassinFreq: b.tb, sc: b.sc, nbCompare: n, myStock: mst, sv: b.tb, diagnostic }); }
    else if (mq > 0 && avg > 0) { const r = mq / avg; if (r < 0.5 && b.sc >= 2) benchLists.under.push({ code: a, lib, myQte: Math.round(mq), avg: Math.round(avg), ratio: r, sv: avg - mq }); else if (r > 1.5 && mq >= 5) benchLists.over.push({ code: a, lib, myQte: Math.round(mq), avg: Math.round(avg), ratio: r, sv: r }); }
  }
  benchLists.missed.sort((a, b) => b.sv - a.sv); benchLists.under.sort((a, b) => b.sv - a.sv); benchLists.over.sort((a, b) => b.sv - a.sv);
  // === OBSERVATOIRE DATA ===
  const prixLookup = {}; for (const r of finalData) prixLookup[r.code] = r.prixUnitaire || 0;
  const finalDataByCode = {}; for (const r of finalData) finalDataByCode[r.code] = r;
  const allOtherStores = [...storesIntersection].filter(s => s !== selectedMyStore);
  const storeFamCA = {}, storeFamRef = {}, storeTotalCA = {};
  const artCA = data => data.sumCA || 0;
  for (const store of allOtherStores) { storeFamCA[store] = {}; storeFamRef[store] = {}; let ca = 0; const sv = ventesParMagasin[store] || {}; for (const [code, data] of Object.entries(sv)) { const lineCA = artCA(data); ca += lineCA; if (!data.sumPrelevee && !data.sumEnleve) continue; if (obsFilterUnivers && articleUnivers[code] !== obsFilterUnivers) continue; const fam = _normFam(articleFamille[code]); if (!fam || !/^\d{6}$/.test(code)) continue; storeFamCA[store][fam] = (storeFamCA[store][fam] || 0) + lineCA; storeFamRef[store][fam] = (storeFamRef[store][fam] || 0) + 1; } storeTotalCA[store] = ca; }
  const bassinFamCAMed = {}; for (const fam of allFamsSet) { const caVals = cs.map(s => (storeFamCA[s] || {})[fam] || 0).filter(v => v > 0); if (caVals.length) bassinFamCAMed[fam] = _median(caVals); }
  benchLists._bassinFamCAMed = bassinFamCAMed;
  { const _bfpBefore = benchLists.familyPerf.length; benchLists.familyPerf = benchLists.familyPerf.filter(fp => (bassinFamCAMed[fp.fam] || 0) >= 1000); benchLists.familyPerfMasked = (benchLists.familyPerfMasked || 0) + (_bfpBefore - benchLists.familyPerf.length); }
  // Top 5 articles per family (Moi / Méd. / % bassin) for F&F expand
  for (const fp of benchLists.familyPerf) { const myArts = []; for (const [c, d] of Object.entries(myV)) { if (!/^\d{6}$/.test(c) || _normFam(articleFamille[c]) !== fp.fam) continue; const artVals = cs.map(s => ((ventesParMagasin[s] || {})[c] || {}).countBL || 0).filter(v => v > 0); const med = artVals.length ? Math.round(_median(artVals)) : 0; const pct = med > 0 ? Math.round(d.countBL / med * 100) : null; const _rawLib = libelleLookup[c] || c; const lib = /^\d{6} - /.test(_rawLib) ? _rawLib.substring(9).trim() : _rawLib; myArts.push({ code: c, lib, my: d.countBL, med, pct }); } fp.topArticles = myArts.sort((a, b) => b.my - a.my).slice(0, 5); }
  const myFamCA = {}, myFamRef = {}; let myTotalCA = 0;
  for (const [code, data] of Object.entries(myV)) { const lineCA = artCA(data); myTotalCA += lineCA; if (!data.sumPrelevee && !data.sumEnleve) continue; if (!/^\d{6}$/.test(code)) continue; const fam = _normFam(articleFamille[code]); if (!fam) continue; myFamCA[fam] = (myFamCA[fam] || 0) + lineCA; myFamRef[fam] = (myFamRef[fam] || 0) + 1; }
  // PDM bassin — poids de mon magasin dans le bassin
  const bassinTotalCA = myTotalCA + Object.values(storeTotalCA).reduce((s, v) => s + v, 0); const myPoids = bassinTotalCA > 0 ? myTotalCA / bassinTotalCA : 0; const bassinFamCATot = {}; for (const [fam, ca] of Object.entries(myFamCA)) bassinFamCATot[fam] = ca; for (const store of allOtherStores) for (const [fam, ca] of Object.entries(storeFamCA[store] || {})) bassinFamCATot[fam] = (bassinFamCATot[fam] || 0) + ca;
  const obsMode = selectedObsCompare || 'median';
  let compV = null, compFamCA = {}, compFamRef = {}, compTotalCA = 0, compRef = 0, compFreq = 0, compServ = 0;
  if (obsMode !== 'median' && storesIntersection.has(obsMode)) {
    compV = ventesParMagasin[obsMode] || {}; compTotalCA = storeTotalCA[obsMode] || 0; compRef = sp[obsMode]?.ref || 0; compFreq = sp[obsMode]?.freq || 0; compServ = sp[obsMode]?.serv || 0; compFamCA = storeFamCA[obsMode] || {}; compFamRef = storeFamRef[obsMode] || {};
  } else {
    const caTotals = cs.map(s => storeTotalCA[s] || 0).filter(v => v > 0); compTotalCA = _median(caTotals);
    const refV = cs.map(s => sp[s]?.ref || 0).filter(v => v > 0); compRef = Math.round(_median(refV));
    const freqV = cs.map(s => sp[s]?.freq || 0).filter(v => v > 0); compFreq = Math.round(_median(freqV));
    const servV = cs.map(s => sp[s]?.serv || 0).filter(v => v > 0); compServ = Math.round(_median(servV));
    const allFamsSet2 = new Set(Object.keys(myFamCA)); for (const s of cs) for (const f of Object.keys(storeFamCA[s] || {})) allFamsSet2.add(f);
    for (const fam of allFamsSet2) { const caV = cs.map(s => storeFamCA[s]?.[fam] || 0).filter(v => v > 0); compFamCA[fam] = caV.length ? _median(caV) : 0; const refV2 = cs.map(s => storeFamRef[s]?.[fam] || 0).filter(v => v > 0); compFamRef[fam] = refV2.length ? Math.round(_median(refV2)) : 0; }
  }
  const myRef = sp[selectedMyStore]?.ref || 0;
  const avgRef = cs.length > 0 ? Math.round(cs.reduce((s, store) => s + (sp[store]?.ref || 0), 0) / cs.length) : 0;
  const myAssort = avgRef > 0 ? Math.round((myRef / avgRef) * 100) : 0;
  const compAssort = 100;
  const myPdm = Math.round(myPoids * 1000) / 10; const compPdmVals = cs.map(s => bassinTotalCA > 0 ? (storeTotalCA[s] || 0) / bassinTotalCA * 100 : 0).filter(v => v > 0); const compPdmMed = Math.round((compPdmVals.length ? _median(compPdmVals) : 0) * 10) / 10; const compPdm = (obsMode !== 'median' && storesIntersection.has(obsMode)) ? Math.round((storeTotalCA[obsMode] || 0) / bassinTotalCA * 1000) / 10 : compPdmMed;
  benchLists._myPoids = myPoids; benchLists._bassinFamCATot = bassinFamCATot; benchLists._myFamCA = myFamCA;
  const compTxMargeVals = cs.map(s => sp[s]?.txMarge ?? null).filter(v => v !== null && v > 0);
  const compTxMarge = (obsMode !== 'median' && storesIntersection.has(obsMode)) ? (sp[obsMode]?.txMarge ?? null) : (compTxMargeVals.length ? _median(compTxMargeVals) : null);
  benchLists.obsKpis = { mine: { ca: myTotalCA, ref: myRef, serv: sp[selectedMyStore]?.serv || 0, freq: sp[selectedMyStore]?.freq || 0, pdm: myPdm, txMarge: sp[selectedMyStore]?.txMarge ?? null }, compared: { ca: compTotalCA, ref: compRef, serv: compServ, freq: compFreq, pdm: compPdm, txMarge: compTxMarge } };
  const allFams2 = new Set([...Object.keys(myFamCA), ...Object.keys(compFamCA)]);
  const obsFamiliesLose = [], obsFamiliesWin = [];
  for (const fam of allFams2) {
    const caMe = myFamCA[fam] || 0, caOther = compFamCA[fam] || 0; if (caMe < 50 && caOther < 50) continue;
    const refMe = myFamRef[fam] || 0, refOther = compFamRef[fam] || 0;
    const ecartPct = caOther > 0 ? Math.round((caMe - caOther) / caOther * 100) : (caMe > 0 ? 100 : 0);
    let missingArts = [], specialArts = [];
    const _splitLib = raw => { if (!raw) return 'Libellé non disponible'; const m = /^\d{6} - /.exec(raw); return m ? raw.substring(m[0].length).trim() : raw; };
    if (compV) { for (const [code, data] of Object.entries(compV)) { if (_normFam(articleFamille[code]) !== fam || (data.sumPrelevee || 0) + (data.sumEnleve || 0) <= 0) continue; if ((myV[code]?.sumPrelevee || 0) > 0) continue; const r = finalDataByCode[code]; const statutMe = !r ? '❌ Absent' : r.stockActuel > 0 ? '✅ En stock' : r.ancienMax > 0 ? '⚠️ Rupture' : '❌ Absent'; const caA = artCA(data); if (!/^\d{6}$/.test(code)) { specialArts.push({ code, freqOther: data.countBL, caOther: Math.round(caA) }); continue; } const r2 = finalDataByCode[code]; const statMe2 = !r2 ? '❌ Absent' : r2.stockActuel > 0 ? '✅ En stock' : r2.ancienMax > 0 ? '⚠️ Rupture' : '❌ Absent'; missingArts.push({ code, lib: _splitLib(libelleLookup[code] || 'Libellé non disponible'), freqOther: data.countBL, caOther: Math.round(caA), statutMe: statMe2 }); }
    } else { const threshold = refMe === 0 ? 2 : Math.max(2, Math.ceil(cs.length / 2)); const artCnt = {}, artFreqSum = {}, artCASum = {}; for (const store of cs) { const sv2 = ventesParMagasin[store] || {}; for (const [code, data] of Object.entries(sv2)) { if (_normFam(articleFamille[code]) !== fam || (data.sumPrelevee || 0) + (data.sumEnleve || 0) <= 0) continue; if (obsFilterUnivers && articleUnivers[code] !== obsFilterUnivers) continue; artCnt[code] = (artCnt[code] || 0) + 1; artFreqSum[code] = (artFreqSum[code] || 0) + data.countBL; artCASum[code] = (artCASum[code] || 0) + artCA(data); } } for (const [code, cnt] of Object.entries(artCnt)) { if (cnt < threshold || (myV[code]?.sumPrelevee || 0) > 0) continue; const r = finalDataByCode[code]; const statutMe = !r ? '❌ Absent' : r.stockActuel > 0 ? '✅ En stock' : r.ancienMax > 0 ? '⚠️ Rupture' : '❌ Absent'; const caO2 = Math.round(artCASum[code] / cnt); if (!/^\d{6}$/.test(code)) { specialArts.push({ code, freqOther: Math.round(artFreqSum[code] / cnt), caOther: caO2, nbStores: cnt }); continue; } const r2b = finalDataByCode[code]; const statMe2b = !r2b ? '❌ Absent' : r2b.stockActuel > 0 ? '✅ En stock' : r2b.ancienMax > 0 ? '⚠️ Rupture' : '❌ Absent'; missingArts.push({ code, lib: _splitLib(libelleLookup[code] || 'Libellé non disponible'), freqOther: Math.round(artFreqSum[code] / cnt), caOther: caO2, statutMe: statMe2b, nbStores: cnt }); } }
    if (refMe === 0) { missingArts.sort((a, b) => b.caOther - a.caOther); } else { missingArts.sort((a, b) => b.freqOther - a.freqOther); } missingArts = missingArts.slice(0, 50);
    // Articles exclusifs — vendus par moi mais pas par la comparaison
    const exclusiveArts = []; if (compV) { for (const [code, data] of Object.entries(myV)) { if (_normFam(articleFamille[code]) !== fam || (data.sumPrelevee || 0) <= 0 || !/^\d{6}$/.test(code)) continue; if ((compV[code]?.sumPrelevee || 0) > 0 || (compV[code]?.sumEnleve || 0) > 0) continue; const lib = libelleLookup[code] || code; const splitLib = /^\d{6} - /.test(lib) ? lib.substring(9).trim() : lib; exclusiveArts.push({ code, lib: splitLib, freq: data.countBL, ca: Math.round(artCA(data)) }); } } else { const threshold = Math.max(2, Math.ceil(cs.length / 2)); for (const [code, data] of Object.entries(myV)) { if (_normFam(articleFamille[code]) !== fam || (data.sumPrelevee || 0) <= 0 || !/^\d{6}$/.test(code)) continue; let otherCount = 0; for (const store of cs) { if ((ventesParMagasin[store]?.[code]?.sumPrelevee || 0) > 0) otherCount++; } if (otherCount >= threshold) continue; const lib = libelleLookup[code] || code; const splitLib = /^\d{6} - /.test(lib) ? lib.substring(9).trim() : lib; exclusiveArts.push({ code, lib: splitLib, freq: data.countBL, ca: Math.round(artCA(data)), nbStores: otherCount }); } } exclusiveArts.sort((a, b) => b.ca - a.ca);
    const entry = { fam, caMe, caOther, ecartPct, refMe, refOther, missingArts, specialArts, exclusiveArts: exclusiveArts.slice(0, 30), caTheorique: Math.round(myPoids * (bassinFamCATot[fam] || 0)), ecartTheorique: Math.round((myFamCA[fam] || 0) - myPoids * (bassinFamCATot[fam] || 0)) };
    if (ecartPct <= -5) obsFamiliesLose.push(entry); else if (ecartPct >= 5) obsFamiliesWin.push(entry);
  }
  obsFamiliesLose.sort((a, b) => Math.abs(b.caOther - b.caMe) - Math.abs(a.caOther - a.caMe) || a.ecartPct - b.ecartPct);
  obsFamiliesWin.sort((a, b) => (b.caMe - b.caOther) - (a.caMe - a.caOther));
  benchLists.obsFamiliesLose = obsFamiliesLose; benchLists.obsFamiliesWin = obsFamiliesWin;
  benchLists.obsActionPlan = obsFamiliesLose.slice(0, 3).map(f => { const artsToRef = (f.missingArts || []).filter(a => a.statutMe !== '✅ En stock'); const artsVisi = (f.missingArts || []).filter(a => a.statutMe === '✅ En stock'); return { fam: f.fam, ecartPct: f.ecartPct, nbToRef: artsToRef.length, nbVisibility: artsVisi.length, refOther: f.refOther, caPotentiel: Math.round(Math.abs(f.caOther - f.caMe)) }; });
  // === PÉPITES — articles où je surperforme / où le réseau me surpasse ===
  // Build per-code frequency + CA lists across cs stores (one pass)
  const _pepCsFreqs = {}, _pepCsCA = {};
  for (const store of cs) { const sv = ventesParMagasin[store] || {}; for (const [code, data] of Object.entries(sv)) { if (!/^\d{6}$/.test(code) || !(data.countBL > 0)) continue; if (!_pepCsFreqs[code]) { _pepCsFreqs[code] = []; _pepCsCA[code] = []; } _pepCsFreqs[code].push(data.countBL); _pepCsCA[code].push(artCA(data)); } }
  const _pepLib = code => { const r = libelleLookup[code] || code; return /^\d{6} - /.test(r) ? r.substring(9).trim() : r; };
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
    pepites.push({ code, lib: _pepLib(code), fam: _normFam(articleFamille[code]) || '', myFreq, compFreq: Math.round(compFreq), ecartPct, caMe: Math.round(artCA(data)) });
  }
  pepites.sort((a, b) => (b.myFreq - b.compFreq) - (a.myFreq - a.compFreq));
  benchLists.pepites = pepites.slice(0, 50);
  // 🔥 Pépites réseau — comparison outperforms me
  const pepitesOther = [];
  const _addPepOther = (code, compFreq, caComp) => {
    const myFreq = myV[code]?.countBL || 0;
    if (compFreq < 2 || compFreq <= myFreq * 1.3) return;
    const ecartPct = myFreq > 0 ? Math.round((compFreq / myFreq - 1) * 100) : null;
    pepitesOther.push({ code, lib: _pepLib(code), fam: _normFam(articleFamille[code]) || '', myFreq, compFreq: Math.round(compFreq), ecartPct, caComp: Math.round(caComp) });
  };
  if (compV) {
    for (const [code, data] of Object.entries(compV)) { if (!/^\d{6}$/.test(code)) continue; _addPepOther(code, data.countBL || 0, artCA(data)); }
  } else {
    for (const [code, csFreqs] of Object.entries(_pepCsFreqs)) { if (!csFreqs.length) continue; const caArr = _pepCsCA[code] || []; _addPepOther(code, _median(csFreqs), caArr.length ? _median(caArr) : 0); }
  }
  pepitesOther.sort((a, b) => (b.compFreq - b.myFreq) - (a.compFreq - a.myFreq));
  benchLists.pepitesOther = pepitesOther.slice(0, 50);
}
