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
import { CROSS_AGENCE_MIN_CA, CROSS_AGENCE_MIN_BL, FAMILLE_LOOKUP, AGENCE_CP } from './constants.js';
import { cleanOmniPrice, readExcel, _wsToHR, yieldToMain, parseCSVTextToHR, _median, _isMetierStrategique, extractClientCode, escapeHtml, famLib, haversineKm } from './utils.js';
import { _S, invalidateCache } from './state.js';
import { buildAgenceStore } from './agence-store.js';
import { getVentesClientMagFull } from './sales.js';

// ── Zone de Chalandise (4ème fichier optionnel) ───────────────
export async function parseChalandise(file) {
  if (_S.lowMemMode) {
    showToast('📱 Mode mobile: Chalandise désactivée (mémoire). Chargez-la sur PC/Zebra.', 'info', 6000);
    return;
  }
  // Support multi-fichier : file peut être un File ou un FileList/Array
  const files = (file instanceof FileList || Array.isArray(file)) ? [...file] : [file];
  if (!files.length) return;

  _S.chalandiseData = new Map();
  const metiersSet = new Set();
  let enrichedCount = 0;

  for (let fi = 0; fi < files.length; fi++) {
    const f = files[fi];
    const isEnrich = fi > 0; // fichiers suivants = enrichissement
    const isCSV = f.name.toLowerCase().endsWith('.csv');
    let hr;
    if (isCSV) {
      const text = await new Promise((res, rej) => { const r = new FileReader(); r.onload = e => res(e.target.result); r.onerror = () => rej(new Error('Lecture CSV impossible')); r.readAsText(f, 'UTF-8'); });
      const _nl1 = text.indexOf('\n'), _cr1 = text.indexOf('\r');
      const _cut1 = (_nl1 === -1) ? (_cr1 === -1 ? text.length : _cr1) : (_cr1 === -1 ? _nl1 : Math.min(_nl1, _cr1));
      const first = _cut1 > 0 ? text.slice(0, _cut1) : '';
      const sep = first.includes(';') ? ';' : ',';
      hr = parseCSVTextToHR(text, sep);
      if (!hr.rows.length) {
        const text2 = await new Promise((res, rej) => { const r = new FileReader(); r.onload = e => res(e.target.result); r.onerror = () => rej(new Error('Lecture CSV impossible')); r.readAsText(f, 'windows-1252'); });
        hr = parseCSVTextToHR(text2, sep);
      }
    } else {
      hr = await readExcel(f);
    }
    if (!hr || !hr.rows.length) { showToast(`⚠️ Fichier Chalandise ${isEnrich ? '(enrichissement) ' : ''}vide ou illisible`, 'error'); continue; }
    const headers = hr.headers || [];
    const rows = hr.rows || [];
    const _norm = s => (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
    const nHeaders = headers.map(h => _norm(h));
    const findCol = s => {
      const ns = _norm(s);
      let idx = nHeaders.findIndex(h => h === ns);
      if (idx >= 0) return idx;
      idx = nHeaders.findIndex(h => h.includes(ns));
      return idx >= 0 ? idx : null;
    };
    const findColExact = s => {
      const ns = _norm(s);
      const idx = nHeaders.findIndex(h => h === ns);
      return idx >= 0 ? idx : null;
    };
    const pick = (...idxs) => { for (const i of idxs) { if (i !== null && i !== undefined) return i; } return null; };

    const cCode = pick(findCol('code client'), findCol('code et nom'));
    const cNom = pick(findCol('nom client'), findCol('nom'));
    const cMetier = pick(findCol('libellé court métier'), findCol('libelle court metier'), findCol('métier'), findCol('metier'));
    const cStatut = pick(findCol('statut actuel général'), findCol('statut actuel general'), findCol('statut'));
    const cStatutDetaille = pick(findCol('statut actuel détaillé'), findCol('statut actuel detaille'));
    const cClassif = pick(findCol('classification'), findCol('classif'));
    const cActiviteLeg = pick(findCol('activité client n/n-1'), findCol('activite client n/n-1'), findCol('activité client n'), findCol('activite client n'));
    const cActivite = pick(findCol('activité pdv zone client n/n-1'), findCol('activite pdv zone client n/n-1'), findCol('activité pdv zone'), findCol('activite pdv zone'));
    const cActiviteGlobale = pick(findCol('activité globale'), findCol('activite globale'));
    const cDirection = pick(findColExact('direction'), findCol('direction commerciale'), findCol('libellé direction'), findCol('libelle direction'), findCol('direction'));
    const cSecteur = pick(findCol('secteur'), findCol('code secteur'));
    const cCommercial = pick(findCol('commercial'), findCol('nom commercial'));
    const cCP = pick(findCol('code postal'), findCol('cp'));
    const cVille = pick(findCol('ville'), findCol('commune'));
    const cCA2025 = pick(findCol('ca 2025'), findCol('ca n-1'), findCol('ca n'));
    const cCA2026 = pick(findCol('ca 2026'), findCol('ca n'));
    const cCaPDVN = pick(findCol('ca pdv zone n'), findCol('ca pdv n'), findCol('ca pdv'));
    const cCaEnleveN = pick(findCol('ca enlevé n pdv'), findCol('ca enleve n pdv'));
    const cCaPreleveN = pick(findCol('ca prélevé n pdv'), findCol('ca preleve n pdv'));
    const cTournee = pick(findCol('libellé tournée'), findCol('libelle tournee'), findCol('tournée'), findCol('tournee'));
    const cSolvabilite = pick(findCol('libellé solvabilité'), findCol('libelle solvabilite'), findCol('solvabilité'), findCol('solvabilite'));
    const cCodeAPE = pick(findCol('code ape'));
    const cLibelleAPE = pick(findCol('libellé ape'), findCol('libelle ape'));
    const cEffectifs = pick(findCol('effectifs client'), findCol('effectif'));
    if (cCode === null) { showToast(`⚠️ Colonne "Code client" introuvable dans ${f.name}`, 'error'); continue; }

    // Extraire un label agence court du nom de fichier (ex: "Chalandise_AG93.xlsx" → "AG93")
    const _agLabel = isEnrich ? (f.name.replace(/\.(xlsx?|csv)$/i, '').replace(/^.*?_/, '').substring(0, 20)) : '';

    const _p = v => {
      if (!v) return 0;
      if (typeof v === 'number') return v;
      return parseFloat(String(v).replace(/\s/g, '').replace(',', '.')) || 0;
    };
    const _s = v => (v === null || v === undefined) ? '' : String(v).trim();

    let _lastYield = performance.now();
    for (let ri = 0; ri < rows.length; ri++) {
      const row = rows[ri];
      if ((ri & 4095) === 0) {
        const _now = performance.now();
        if (_now - _lastYield > 60) { await yieldToMain(); _lastYield = performance.now(); }
      }

      const rawCode = _s(row?.[cCode]);
      const cc = extractClientCode(rawCode);
      if (!cc || cc === '000000') continue;

      // Enrichissement : ne prendre que les clients ABSENTS de la chalandise principale
      if (isEnrich && _S.chalandiseData.has(cc)) continue;

      const metier = cMetier !== null ? _s(row?.[cMetier]) : '';
      if (metier) metiersSet.add(metier);
      const info = {
        nom: cNom !== null ? _s(row?.[cNom]) : '',
        metier,
        statut: cStatut !== null ? _s(row?.[cStatut]) : '',
        statutDetaille: cStatutDetaille !== null ? _s(row?.[cStatutDetaille]) : '',
        classification: cClassif !== null ? _s(row?.[cClassif]) : '',
        activiteLeg: cActiviteLeg !== null ? _s(row?.[cActiviteLeg]) : '',
        activitePDV: cActivite !== null ? _s(row?.[cActivite]) : '',
        activiteGlobale: cActiviteGlobale !== null ? _s(row?.[cActiviteGlobale]) : '',
        activite: cActiviteGlobale !== null ? _s(row?.[cActiviteGlobale]) : '',
        direction: cDirection !== null ? _s(row?.[cDirection]) : '',
        secteur: cSecteur !== null ? _s(row?.[cSecteur]) : '',
        commercial: cCommercial !== null ? _s(row?.[cCommercial]) : '',
        cp: cCP !== null ? _s(row?.[cCP]) : '',
        ville: cVille !== null ? _s(row?.[cVille]) : '',
        tournee: cTournee !== null ? _s(row?.[cTournee]) : '',
        solvabilite: cSolvabilite !== null ? _s(row?.[cSolvabilite]) : '',
        codeAPE: cCodeAPE !== null ? _s(row?.[cCodeAPE]) : '',
        libelleAPE: cLibelleAPE !== null ? _s(row?.[cLibelleAPE]) : '',
        effectifs: cEffectifs !== null ? _s(row?.[cEffectifs]) : '',
        ca2025: _p(cCA2025 !== null ? row?.[cCA2025] : ''),
        ca2026: _p(cCA2026 !== null ? row?.[cCA2026] : ''),
        caPDVN: _p(cCaPDVN !== null ? row?.[cCaPDVN] : ''),
        caEnleveN: _p(cCaEnleveN !== null ? row?.[cCaEnleveN] : ''),
        caPreleveN: _p(cCaPreleveN !== null ? row?.[cCaPreleveN] : ''),
      };
      if (isEnrich) { info._enrichSource = _agLabel; enrichedCount++; }
      _S.chalandiseData.set(cc, info);
    }
  }

  _S.chalandiseMetiers = [...metiersSet].sort();
  // ── Distance km — calcul Haversine CP client vs CP agence ──
  _computeChalandiseDistances();
  // Build metier and commercial indexes
  if (!_S.clientsByMetier) _S.clientsByMetier = new Map();
  else _S.clientsByMetier.clear();
  if (!_S.clientsByCommercial) _S.clientsByCommercial = new Map();
  else _S.clientsByCommercial.clear();
  for (const [cc, info] of _S.chalandiseData.entries()) {
    const m = info.metier && info.metier.trim().length > 2 && !/^[-.\s]+$/.test(info.metier) ? info.metier : null;
    const metierKey = m || '__NON_RENSEIGNE__';
    if (!_S.clientsByMetier.has(metierKey)) _S.clientsByMetier.set(metierKey, new Set());
    _S.clientsByMetier.get(metierKey).add(cc);
    if (info.commercial) {
      if (!_S.clientsByCommercial.has(info.commercial)) _S.clientsByCommercial.set(info.commercial, new Set());
      _S.clientsByCommercial.get(info.commercial).add(cc);
    }
  }
  _S.chalandiseReady = true;
  let nbActifs = 0, nbPerdus = 0;
  for (const i of _S.chalandiseData.values()) {
    const s = (i.statut || '').toLowerCase();
    if (s.includes('actif') && !s.includes('inactif')) nbActifs++;
    else if (s.includes('perdu') || s.includes('inactif')) nbPerdus++;
  }
  const enrichMsg = enrichedCount > 0 ? ` · ${enrichedCount} enrichis via autres agences` : '';
  showToast(`📋 Chalandise : ${_S.chalandiseData.size} clients · ${metiersSet.size} métiers · ${nbActifs} actifs · ${nbPerdus} perdus${enrichMsg}`, 'success');
  // Show commerce tab if chalandise loaded (even without territoire file)
  const terrBtn = document.getElementById('btnTabCommerce'); if (terrBtn) terrBtn.classList.remove('hidden');
  // Rebuild overview if already on commerce tab
  // NB: buildClientStore + renderAll sont appelés par main.js après le parsing complet
  // Ici on ne fait que le croisement nécessaire pour que les données soient prêtes
  if (_S.finalData && _S.finalData.length > 0) { window.computeClientCrossing?.(); }
  // Refresh data scope bar si déjà rendu
  if (typeof window._renderDataScopeBar === 'function') window._renderDataScopeBar();
  // Ne pas sauvegarder depuis les parsers optionnels — la sauvegarde est gérée dans processDataFromRaw
}

export function onChalandiseSelected(input) {
  onFileSelected(input, 'dropChalandise');
  if (input.files && input.files.length) parseChalandise(input.files);
}

// ── Chargement table CP → coordonnées GPS ──────────────────────
export async function loadCpCoords() {
  if (_S._cpCoords) return;
  try {
    const r = await fetch('js/cp-coords.json');
    if (r.ok) {
      _S._cpCoords = await r.json();
      // Si chalandise déjà chargée (restauration IDB), calculer les distances maintenant
      if (_S.chalandiseData?.size) _computeChalandiseDistances();
    }
  } catch (e) { console.warn('[PRISME] cp-coords.json non chargé:', e.message); }
}

// ── Calcul distances Haversine sur chalandiseData ──────────────
export function _computeChalandiseDistances() {
  if (!_S._cpCoords || !_S.chalandiseData.size) return;
  // Résoudre les coordonnées de l'agence
  const agenceCp = AGENCE_CP[_S.selectedMyStore] || '';
  const agCoords = agenceCp ? _S._cpCoords[agenceCp] : null;
  _S._agenceCoords = agCoords || null;
  if (!agCoords) return;
  const [aLat, aLon] = agCoords;
  let computed = 0;
  for (const [, info] of _S.chalandiseData) {
    const cp = (info.cp || '').toString().replace(/\s/g, '');
    const coords = cp ? _S._cpCoords[cp] : null;
    if (coords) {
      info.distanceKm = Math.round(haversineKm(aLat, aLon, coords[0], coords[1]));
      computed++;
    } else {
      info.distanceKm = null;
    }
  }
  if (computed) console.log(`[PRISME] Distances calculées : ${computed}/${_S.chalandiseData.size} clients`);
}

// ── Livraisons (4ème fichier optionnel) — alimente livraisonsData + territoireLines ──
export async function parseLivraisons(file) {
  if (_S.lowMemMode) {
    showToast('📱 Mode mobile: Livraisons/Terrain désactivés (mémoire). Chargez-les sur PC.', 'info', 6000);
    return;
  }
  const _lt0=performance.now();const _lm=[];const _lmk=(l)=>{_lm.push({etape:l,ms:Math.round(performance.now()-_lt0)});};
  _S.livraisonsData = new Map();
  _S.livraisonsReady = false;
  _S.livraisonsClientCount = 0;
  _S._livraisonsDebug = { step: 'init', file: file?.name, size: file?.size };
  try {
    const isCSV = file.name.toLowerCase().endsWith('.csv');
    let hr;
    if (isCSV) {
      const text = await new Promise((res, rej) => { const r = new FileReader(); r.onload = e => res(e.target.result); r.onerror = () => rej(new Error('Lecture CSV impossible')); r.readAsText(file, 'windows-1252'); });
      const _nl2 = text.indexOf('\n'), _cr2 = text.indexOf('\r');
      const _cut2 = (_nl2 === -1) ? (_cr2 === -1 ? text.length : _cr2) : (_cr2 === -1 ? _nl2 : Math.min(_nl2, _cr2));
      const sep = (_cut2 > 0 ? text.slice(0, _cut2) : '').includes(';') ? ';' : ',';
      hr = parseCSVTextToHR(text, sep);
      _lmk('CSV parse');
    } else {
      const buf = await new Promise((res, rej) => { const r = new FileReader(); r.onload = e => res(e.target.result); r.onerror = () => rej(new Error('Lecture XLSX impossible')); r.readAsArrayBuffer(file); });
      _lmk('FileReader');
      const wb = XLSX.read(buf, { type: 'array', cellDates: false, dense: true });
      _lmk('XLSX.read');
      _S._livraisonsDebug.sheets = wb.SheetNames;
      const _ws = wb.Sheets[wb.SheetNames[0]];
      hr = _wsToHR(_ws);
      _lmk('wsToHR');
    }
    const headersFound = hr?.headers || [];
    const rows = hr?.rows || [];
    _S._livraisonsDebug.step = 'parsed';
    _S._livraisonsDebug.rowCount = rows.length;
    _S._livraisonsDebug.headersFound = headersFound;
    if (headersFound.length && rows.length) {
      const o = {};
      const r0 = rows[0] || [];
      for (let i = 0; i < headersFound.length; i++) o[headersFound[i]] = r0[i];
      _S._livraisonsDebug.row0 = o;
    } else {
      _S._livraisonsDebug.row0 = rows[0] || null;
    }

    // Passe unique : livraisonsData + territoireLines
    const _norm = s => (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
    const nHeaders = headersFound.map(h => _norm(h));
    // exact-match en priorité, puis includes (évite faux positifs sur 'ca' / 'bl')
    const findCol = s => {
      const ns = _norm(s);
      let idx = nHeaders.findIndex(h => h === ns);
      if (idx >= 0) return idx;
      idx = nHeaders.findIndex(h => h.includes(ns));
      return idx >= 0 ? idx : null;
    };
    const pick = (...idxs) => { for (const i of idxs) { if (i !== null && i !== undefined) return i; } return null; };
    const cCC      = pick(findCol('code client'));
    const cNomC    = pick(findCol('nom client'));
    const cSect    = pick(findCol('secteur'));
    const cDir     = pick(findCol('direction'));
    const cBL      = pick(findCol('numero de bl'), findCol('n° bl'), findCol('numero bl'));
    const cArt     = pick(findCol('article'));
    const cQty     = pick(findCol('quantite livree'), findCol('qte livree'), findCol('quantite'));
    const cCA      = pick(findCol('ca'));
    const cVMB     = pick(findCol('vmb'));
    const cDate    = pick(findCol("date d'expedition"), findCol('date expedition'), findCol('expedition'));
    const colsFound = { cCC, cNomC, cSect, cDir, cBL, cArt, cQty, cCA, cVMB, cDate };
    _S._livraisonsDebug.step = 'cols';
    _S._livraisonsDebug.colsFound = colsFound;
    if (cCC === null || cBL === null || cArt === null) {
      _S._livraisonsDebug.step = 'guard_failed';
      _S._livraisonsDebug.guardReason = `manquant: ${cCC===null?'cCC ':''}${cBL===null?'cBL ':''}${cArt===null?'cArt':''}`.trim();
      showToast(`❌ Livraisons : colonnes introuvables — inspectez _S._livraisonsDebug dans la console`, 'error');
      return;
    }
    const terrLines = [];
    const terrDirData = {};
    const secteurSet = new Set();
    let livDateMinMs = null, livDateMaxMs = null;

    const _isCode6 = (code) => {
      if (!code || code.length !== 6) return false;
      for (let i = 0; i < 6; i++) {
        const c = code.charCodeAt(i);
        if (c < 48 || c > 57) return false;
      }
      return true;
    };
    const _fastTrim = (v) => {
      if (v === undefined || v === null) return '';
      const s = typeof v === 'string' ? v : String(v);
      const len = s.length;
      if (!len) return '';
      const c0 = s.charCodeAt(0), c1 = s.charCodeAt(len - 1);
      return (c0 <= 32 || c1 <= 32) ? s.trim() : s;
    };
    const _trimCacheDir = new Map();
    const _trimCacheSect = new Map();
    const _cachedTrim = (cache, v) => {
      if (v === undefined || v === null) return '';
      const key = typeof v === 'string' ? v : String(v);
      let out = cache.get(key);
      if (out !== undefined) return out;
      out = _fastTrim(key);
      cache.set(key, out);
      return out;
    };
    // Dates: millisecondes dans la boucle (moins d'alloc), convertir en Date à la fin
    const _dateMsCache = new Map();
    const _parseDateMs = (v) => {
      if (!v && v !== 0) return null;
      if (v instanceof Date) { const ms = v.getTime(); return isNaN(ms) ? null : ms; }
      if (typeof v === 'number') {
        if (v > 39000 && v < 60000) return Math.round((v - 25569) * 864e5);
        return null;
      }
      const key = typeof v === 'string' ? v : String(v);
      const cached = _dateMsCache.get(key);
      if (cached !== undefined) return cached;
      let ms = null;
      const s = key.split(' ')[0];
      const p = s.split(/[-/]/);
      if (p.length === 3) {
        const n0 = parseInt(p[0], 10), n1 = parseInt(p[1], 10), n2 = parseInt(p[2], 10);
        if (!(isNaN(n0) || isNaN(n1) || isNaN(n2))) {
          if (n0 > 31) ms = new Date(n0, n1 - 1, n2).getTime();
          else if (n2 > 31) ms = new Date(n2, n1 - 1, n0).getTime();
          else {
            let a = n0, b = n1, d = n2;
            if (d < 100) d += 2000;
            if (a > 12) ms = new Date(d, b - 1, a).getTime();
            else if (b > 12) ms = new Date(d, a - 1, b).getTime();
            else ms = new Date(d, b - 1, a).getTime();
          }
          if (isNaN(ms)) ms = null;
        }
      } else {
        const x = new Date(key); const t = x.getTime();
        ms = isNaN(t) ? null : t;
      }
      _dateMsCache.set(key, ms);
      return ms;
    };
    // Map stock O(1) — évite _S.finalData.find() O(n) × 282k lignes
    const _stockMap = new Map();
    if (_S.finalData) for (const r of _S.finalData) _stockMap.set(r.code, r);

    const clientsMagasin = _S.clientsMagasin || new Set();
    const blCanalMap = _S.blCanalMap || new Map();
    const blConsommeSet = _S.blConsommeSet || new Set();
    const articleFamille = _S.articleFamille || {};
    const libelleLookup = _S.libelleLookup || {};
    // Caches par article/client pour éviter de refaire les mêmes trims/lookups ~281k fois
    const _articleMeta = new Map(); // code → {libelle, famille, rayonStatus, isSpecial}
    const _clientNomByCc = new Map(); // cc → nom (trimmed)

    let _lastYield = performance.now();
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];

      // Yield périodiquement (évite freeze UI sur gros fichiers)
      if ((i & 4095) === 0) {
        const _now = performance.now();
        if (_now - _lastYield > 60) { await yieldToMain(); _lastYield = performance.now(); }
      }

      const cc = extractClientCode(row?.[cCC] || '');
      if (!cc || cc === '000000') continue;

      const caRaw = cCA !== null ? row?.[cCA] : 0;
      const vmbRaw = cVMB !== null ? row?.[cVMB] : 0;
      const ca = typeof caRaw === 'number' ? caRaw : cleanOmniPrice(caRaw);
      const vmb = typeof vmbRaw === 'number' ? vmbRaw : cleanOmniPrice(vmbRaw);

      const blNum = _fastTrim(row?.[cBL] ?? '');
      const articleRaw = row?.[cArt];
      if (articleRaw === undefined || articleRaw === null) continue;
      const articleStr = _fastTrim(articleRaw);
      if (!articleStr) continue;
      const dashIdx = articleStr.indexOf(' - ');
      const codeArticle = dashIdx >= 0 ? articleStr.slice(0, dashIdx) : articleStr;
      if (!codeArticle) continue;

      const qtyRaw = cQty !== null ? row?.[cQty] : 0;
      const qty = typeof qtyRaw === 'number' ? qtyRaw : (parseInt(String(qtyRaw || '0'), 10) || 0);
      if (qty < 0) continue; // avoirs : exclure comme dans le Worker territoire

      const rawDate = cDate !== null ? row?.[cDate] : null;
      const dateMs = _parseDateMs(rawDate);

      // Plage de dates Livraisons (pour alignement captation)
      if (dateMs != null) {
        if (livDateMinMs == null || dateMs < livDateMinMs) livDateMinMs = dateMs;
        if (livDateMaxMs == null || dateMs > livDateMaxMs) livDateMaxMs = dateMs;
      }

      // — livraisonsData — codes 6 chiffres uniquement
      let meta = _articleMeta.get(codeArticle);
      if (!meta) {
        const isSpecial = !_isCode6(codeArticle);
        const stockItem = _stockMap.get(codeArticle);
        const rayonStatus = stockItem ? (stockItem.stockActuel > 0 ? 'green' : 'yellow') : 'red';
        const famille = articleFamille[codeArticle] || stockItem?.famille || 'Non classé';
        const libelle = dashIdx >= 0 ? articleStr.slice(dashIdx + 3) : (libelleLookup[codeArticle] || codeArticle);
        meta = { libelle, famille, rayonStatus, isSpecial };
        _articleMeta.set(codeArticle, meta);
      }

      if (!meta.isSpecial) {
        let d = _S.livraisonsData.get(cc);
        if (!d) {
          d = { ca: 0, vmb: 0, bl: new Set(), articles: new Map(), lastDate: null, lastDateMs: null };
          _S.livraisonsData.set(cc, d);
        }
        d.ca += ca; d.vmb += vmb;
        if (blNum) d.bl.add(blNum);
        let a = d.articles.get(codeArticle);
        if (!a) { a = { ca: 0, qty: 0 }; d.articles.set(codeArticle, a); }
        a.ca += ca; a.qty += qty;
        if (dateMs != null && (d.lastDateMs == null || dateMs > d.lastDateMs)) d.lastDateMs = dateMs;
      }

      // — territoireLines — tous codes y compris spéciaux (isSpecial = true pour non-stockables)
      const direction = (cDir !== null ? (_cachedTrim(_trimCacheDir, row?.[cDir]) || 'Non défini') : 'Non défini');
      const secteur = cSect !== null ? _cachedTrim(_trimCacheSect, row?.[cSect]) : '';
      let clientNom = '';
      if (cNomC !== null) {
        clientNom = _clientNomByCc.get(cc);
        if (clientNom === undefined) {
          clientNom = _fastTrim(row?.[cNomC] ?? '');
          _clientNomByCc.set(cc, clientNom);
        }
      }
      const clientType = clientsMagasin.has(cc) ? 'mixte' : 'exterieur';
      if (secteur) secteurSet.add(secteur);
      const canal = blNum ? (blCanalMap.get(blNum) || (blConsommeSet.has(blNum) ? 'MAGASIN' : 'EXTÉRIEUR')) : 'EXTÉRIEUR';
      terrLines.push({ code: codeArticle, libelle: meta.libelle, famille: meta.famille, direction, secteur, bl: blNum, ca, canal,
        clientCode: cc, clientNom, clientType, rayonStatus: meta.rayonStatus, isSpecial: meta.isSpecial, commercial: '',
        dateExp: dateMs });

      // — terrDirData (pour le tableau Directions dans l'onglet Terrain) —
      if (!meta.isSpecial) {
        if (!terrDirData[direction]) terrDirData[direction] = { dir: direction, caTotal: 0, caMag: 0, caExt: 0, refSet: new Set(), absentSet: new Set(), familles: {} };
        const td = terrDirData[direction];
        td.caTotal += ca; if (canal === 'MAGASIN') td.caMag += ca; else td.caExt += ca;
        td.refSet.add(codeArticle); if (meta.rayonStatus === 'red') td.absentSet.add(codeArticle);
        if (!td.familles[meta.famille]) td.familles[meta.famille] = { caTotal: 0, caMag: 0, caExt: 0 };
        td.familles[meta.famille].caTotal += ca;
        if (canal === 'MAGASIN') td.familles[meta.famille].caMag += ca; else td.familles[meta.famille].caExt += ca;
      }
    }

    _lmk('Boucle lignes');
    _S.livraisonsReady = _S.livraisonsData.size > 0;
    _S.livraisonsClientCount = _S.livraisonsData.size;
    _S.livraisonsDateMin = livDateMinMs != null ? new Date(livDateMinMs) : null;
    _S.livraisonsDateMax = livDateMaxMs != null ? new Date(livDateMaxMs) : null;
    // Convertir lastDateMs → Date (une fois par client, pas par ligne)
    for (const d of _S.livraisonsData.values()) {
      d.lastDate = d.lastDateMs != null ? new Date(d.lastDateMs) : null;
      delete d.lastDateMs;
    }
    _S.territoireLines = terrLines;
    _S.terrDirectionData = terrDirData;
    _S.territoireReady = terrLines.length > 0;
    // Enrichir libelleLookup depuis les livraisons (articles réseau sans consommé local)
    for (const l of terrLines) {
      if (l.code && l.libelle && !_S.libelleLookup[l.code]) _S.libelleLookup[l.code] = l.libelle;
    }
    invalidateCache('terr');

    _S._livraisonsDebug.step = 'done';
    _S._livraisonsDebug.livraisonsSize = _S.livraisonsData.size;
    _S._livraisonsDebug.terrLinesCount = terrLines.length;
    _S._livraisonsDebug.skippedZero = rows.length - terrLines.length; // indicatif

    // Secteurs — met à jour les checkboxes dans le filtre Terrain
    buildSecteurCheckboxes([...secteurSet].sort());

    _lmk('Fin');console.table(_lm);
    if (!_S.livraisonsReady) {
      showToast(`⚠️ Livraisons : 0 client chargé sur ${rows.length} lignes — inspectez _S._livraisonsDebug`, 'error');
      return;
    }
    showToast(`📦 Livraisons : ${_S.livraisonsClientCount} clients · ${terrLines.length} lignes terrain chargés`, 'success');

    // territoireLines déjà positionné ligne ~221 sur terrLines (tableau)
    // livraisonsData reste la Map client ; pas de réassignation ici
    window.computeReconquestCohort?.();
    window.computeOpportuniteNette?.();
    if (typeof window._renderDataScopeBar === 'function') window._renderDataScopeBar();
    // renderTerritoireTab + renderAll sont appelés par main.js après le parsing complet
    // Ne pas sauvegarder depuis les parsers optionnels — la sauvegarde est gérée dans processDataFromRaw
  } catch (e) {
    console.error('[PRISME] parseLivraisons error:', e);
    showToast('❌ Erreur lecture Livraisons : ' + e.message, 'error');
  }
}

export function onLivraisonsSelected(input) {
  onFileSelected(input, 'dropLivraisons');
  // parsing différé au pipeline principal (processDataFromRaw / _postParseMain)
}


// ── B1: Client aggregation Worker ────────────────────────────
export function _clientWorker() {
  self.onmessage = function(e) {
    const { ventesCA, ventesReseau, chalandise, articleFamille } = e.data;
    // clientFamCA : local only (commerce — mon agence)
    const clientFamCA = {};
    for (const [cc, articles] of ventesCA) {
      clientFamCA[cc] = {};
      for (const [code, data] of articles) {
        const fam = articleFamille[code] || '';
        if (fam) clientFamCA[cc][fam] = (clientFamCA[cc][fam] || 0) + (data.sumCA || 0);
      }
    }
    // clientFamCAReseau : toutes agences (pour metierFamBench national)
    const clientFamCAReseau = {};
    for (const [cc, articles] of ventesReseau) {
      clientFamCAReseau[cc] = {};
      for (const [code, data] of articles) {
        const fam = articleFamille[code] || '';
        if (fam) clientFamCAReseau[cc][fam] = (clientFamCAReseau[cc][fam] || 0) + (data.sumCA || 0);
      }
    }
    // metierFamBench : national (toutes agences via ventesReseau)
    const metierFamBench = {};
    for (const [cc, info] of chalandise) {
      if (!info.metier) continue;
      const fams = clientFamCAReseau[cc];
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
      const _srcVentes = getVentesClientMagFull();
      for (const [cc, artMap] of _srcVentes.entries()) {
        const arts = [];
        for (const [code2, data] of artMap.entries()) arts.push([code2, data]);
        ventesCA.push([cc, arts]);
      }
      // ventesReseau : toutes agences (pour metierFamBench national)
      const ventesReseau = [];
      const _srcReseau = _S.ventesReseauTousCanaux;
      if (_srcReseau?.size) {
        for (const [cc, artMap] of _srcReseau.entries()) {
          const arts = [];
          for (const [code2, data] of artMap.entries()) arts.push([code2, data]);
          ventesReseau.push([cc, arts]);
        }
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
      worker.postMessage({ ventesCA, ventesReseau, chalandise, articleFamille: _S.articleFamille });
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
export function computeBenchmark(canaux = new Set()) {
  const _bt0=performance.now();const _bm=[];const _bmk=(l)=>{_bm.push({etape:l,ms:Math.round(performance.now()-_bt0)});};
  // Normalise : accepte un Set, un Array, un string, ou null → toujours Set
  const _canauxSet = canaux instanceof Set ? canaux
    : Array.isArray(canaux) ? new Set(canaux)
    : canaux ? new Set([canaux])
    : new Set();
  const _canauxKey = _canauxSet.size ? [..._canauxSet].sort().join('+') : '';
  const _modeKey = _canauxSet.size === 1 && _canauxSet.has('MAGASIN') ? (_S._reseauMagasinMode || 'all') : '';
  const _periodeKey = [
    _S.periodFilterStart ? _S.periodFilterStart.toISOString().slice(0, 7) : '',
    _S.periodFilterEnd   ? _S.periodFilterEnd.toISOString().slice(0, 7)   : '',
    _S._globalPeriodePreset || '',
  ].join('-');
  const _bKey = [
    _S.selectedMyStore || '',
    [..._S.selectedBenchBassin].sort().join(','),
    _S.obsFilterUnivers || '',
    _S.obsFilterMinCA || 0,
    _S.selectedObsCompare || 'median',
    _S.chalandiseReady ? '1' : '0',
    _canauxKey,
    _modeKey,
    _periodeKey,
  ].join('|');
  if (_S._benchCache && _S._benchCache.key === _bKey) {
    _S.benchLists    = _S._benchCache.benchLists;
    _S.benchFamEcarts = _S._benchCache.benchFamEcarts;
    return; // ~0ms — invariant canaux confirmé
  }
  // Cache miss — invalider les médianes (reconstruites depuis ventesParAgence période-courante)
  delete _S._artMedianBL; delete _S._artMedianQte; delete _S._artMedianCA;

  // Bassin : sélection manuelle > tous les stores
  const bassinStores = _S.selectedBenchBassin?.size > 0
    ? [..._S.selectedBenchBassin]
    : [..._S.storesIntersection].filter(s => s !== _S.selectedMyStore);
  const cs = bassinStores.filter(s => _S.storesIntersection.has(s));
  const csSet = new Set(cs);
  _S.benchLists = { missed: [], under: [], over: [], storePerf: {}, familyPerf: [], pepites: [], pepitesOther: [] };
  if (!cs.length) { _S._benchCache = { key: _bKey, benchLists: _S.benchLists, benchFamEcarts: _S.benchFamEcarts }; return; }
  const n = cs.length;
  // ── Rebuild agenceStore avec filtre canal ──
  const _magMode = (_canauxSet.size === 1 && _canauxSet.has('MAGASIN')) ? (_S._reseauMagasinMode || 'all') : 'all';
  buildAgenceStore({ canaux: _canauxSet, magasinMode: _magMode, univers: _S.obsFilterUnivers || '' });
  _bmk('buildAgenceStore');
  // ── Dériver vpm, sp, bv depuis agenceStore ──
  const vpm = {};
  const sp = {};
  const bv = {};
  for (const [store, rec] of _S.agenceStore) {
    vpm[store] = rec.artMap;
    sp[store] = { ca: rec.ca, ref: rec.refs, freq: rec.freq, serv: rec.serv, clientsZone: rec.clientsZone, txMarge: rec.txMarge, freqClient: rec.freqClient, caClient: rec.caClient, pdmBassin: rec.pdmBassin, nbClients: rec.nbClients, nbCommandes: rec.nbCommandes };
    if (!csSet.has(store)) continue;
    for (const a in rec.artMap) {
      if (a.length !== 6) continue;
      const d = rec.artMap[a];
      if (!bv[a]) bv[a] = { tp: 0, tb: 0, sc: 0 };
      bv[a].tp += d.sumCA || 0; bv[a].tb += d.countBL; bv[a].sc++;
    }
  }
  let myV = vpm[_S.selectedMyStore] || {};
  if (_S.obsFilterUnivers) {
    for (const k of Object.keys(bv)) { if (_S.articleUnivers[k] !== _S.obsFilterUnivers) delete bv[k]; }
    const myVF = {}; for (const [k, v] of Object.entries(myV)) { if (_S.articleUnivers[k] === _S.obsFilterUnivers) myVF[k] = v; }
    myV = myVF;
  }
  const totalArtsInBassin = Object.keys(bv).length || 1;
  _S.benchLists.storePerf = sp;
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
  const _minAgences = Math.max(2, Math.ceil(n / 2)); // seuil 50% des agences
  for (const [a, b] of Object.entries(bv)) {
    if (b.tb < 3) continue; const md = myV[a]; const mq = md ? (md.sumCA || 0) : 0; const myFreq = md ? md.countBL : 0; const avg = b.tp / n; const _rawLib = _S.libelleLookup[a] || a; const lib = /^\d{6} - /.test(_rawLib) ? _rawLib.substring(9).trim() : _rawLib; const ms = (_S.stockParMagasin[_S.selectedMyStore] || {})[a]; const mst = ms ? ms.stockActuel : 0;
    // Essentials : articles vendus par 50%+ des agences, absents ou sous la moyenne réseau (<80%)
    const ratio = avg > 0 ? mq / avg : (mq > 0 ? 999 : 0);
    if (b.sc >= _minAgences && ratio < 0.8) {
      _S.benchLists.missed.push({ code: a, lib, bassinFreq: b.tb, sc: b.sc, nbCompare: n, myFreq, myCA: Math.round(mq), avgCA: Math.round(avg), myStock: mst, ratio, sv: b.tb });
    }
    // Over-exploités : inchangé
    if (myFreq > 0 && avg > 0 && ratio > 1.5 && mq >= 5) {
      _S.benchLists.over.push({ code: a, lib, myQte: Math.round(mq), avg: Math.round(avg), ratio, sv: ratio });
    }
  }
  // Tri : 0 ventes d'abord (par couverture réseau desc), puis ratio croissant
  _S.benchLists.missed.sort((a, b) => {
    if (a.myFreq === 0 && b.myFreq > 0) return -1;
    if (a.myFreq > 0 && b.myFreq === 0) return 1;
    if (a.myFreq === 0 && b.myFreq === 0) return b.sc - a.sc || b.bassinFreq - a.bassinFreq;
    return a.ratio - b.ratio;
  });
  _S.benchLists.over.sort((a, b) => b.sv - a.sv);
  _bmk('missed/over');
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
  const compFreqClVals = cs.map(s => sp[s]?.freqClient || 0).filter(v => v > 0);
  const compFreqCl = (obsMode !== 'median' && _S.storesIntersection.has(obsMode)) ? (sp[obsMode]?.freqClient || 0) : (compFreqClVals.length ? parseFloat(_median(compFreqClVals).toFixed(1)) : 0);
  const compCaClVals = cs.map(s => sp[s]?.caClient || 0).filter(v => v > 0);
  const compCaCl = (obsMode !== 'median' && _S.storesIntersection.has(obsMode)) ? (sp[obsMode]?.caClient || 0) : (compCaClVals.length ? Math.round(_median(compCaClVals)) : 0);
  const compNbClVals = cs.map(s => sp[s]?.nbClients || 0).filter(v => v > 0);
  const compNbCl = (obsMode !== 'median' && _S.storesIntersection.has(obsMode)) ? (sp[obsMode]?.nbClients || 0) : (compNbClVals.length ? Math.round(_median(compNbClVals)) : 0);
  const compNbCmdVals = cs.map(s => sp[s]?.nbCommandes || 0).filter(v => v > 0);
  const compNbCmd = (obsMode !== 'median' && _S.storesIntersection.has(obsMode)) ? (sp[obsMode]?.nbCommandes || 0) : (compNbCmdVals.length ? Math.round(_median(compNbCmdVals)) : 0);
  _S.benchLists.obsKpis = { mine: { ca: myTotalCA, ref: myRef, serv: sp[_S.selectedMyStore]?.serv || 0, freq: sp[_S.selectedMyStore]?.freq || 0, pdm: myPdm, txMarge: sp[_S.selectedMyStore]?.txMarge ?? null, freqClient: sp[_S.selectedMyStore]?.freqClient || 0, caClient: sp[_S.selectedMyStore]?.caClient || 0, nbClients: sp[_S.selectedMyStore]?.nbClients || 0, nbCommandes: sp[_S.selectedMyStore]?.nbCommandes || 0 }, compared: { ca: compTotalCA, ref: compRef, serv: compServ, freq: compFreq, pdm: compPdm, txMarge: compTxMarge, freqClient: compFreqCl, caClient: compCaCl, nbClients: compNbCl, nbCommandes: compNbCmd } };
  const allFams2 = new Set([...Object.keys(myFamCA), ...Object.keys(compFamCA)]);
  const obsFamiliesLose = [], obsFamiliesWin = [];
  for (const fam of allFams2) {
    const caMe = myFamCA[fam] || 0, caOther = compFamCA[fam] || 0; if (caMe < 50 && caOther < 50) continue;
    const refMe = myFamRef[fam] || 0, refOther = compFamRef[fam] || 0;
    const ecartPct = caOther > 0 ? Math.round((caMe - caOther) / caOther * 100) : (caMe > 0 ? 100 : 0);
    let missingArts = [], specialArts = [];
    const _splitLib = raw => { if (!raw) return 'Libellé non disponible'; const m = /^\d{6} - /.exec(raw); return m ? raw.substring(m[0].length).trim() : raw; };
    if (compV) { for (const [code, data] of Object.entries(compV)) { if (famLib(_S.articleFamille[code]) !== fam || (data.sumPrelevee || 0) + (data.sumEnleve || 0) <= 0) continue; if ((myV[code]?.sumPrelevee || 0) > 0) continue; const r = finalDataByCode[code]; const statutMe = !r ? '❌ Absent' : r.stockActuel > 0 ? '✅ En stock' : r.ancienMax > 0 ? '⚠️ Rupture' : '❌ Absent'; const caA = artCA(data); if (!/^\d{6}$/.test(code)) { specialArts.push({ code, freqOther: data.countBL, caOther: Math.round(caA) }); continue; } const r2 = finalDataByCode[code]; const statMe2 = !r2 ? '❌ Absent' : r2.stockActuel > 0 ? '✅ En stock' : r2.ancienMax > 0 ? '⚠️ Rupture' : '❌ Absent'; missingArts.push({ code, lib: _splitLib(_S.libelleLookup[code] || 'Libellé non disponible'), freqOther: data.countBL, caOther: Math.round(caA), statutMe: statMe2 }); }
    } else { const threshold = refMe === 0 ? 1 : Math.max(2, Math.ceil(cs.length / 2)); const artCnt = {}, artFreqSum = {}, artCASum = {}; for (const store of cs) { const sv2 = vpm[store] || {}; for (const [code, data] of Object.entries(sv2)) { if (famLib(_S.articleFamille[code]) !== fam || (data.sumPrelevee || 0) + (data.sumEnleve || 0) <= 0) continue; if (_S.obsFilterUnivers && _S.articleUnivers[code] !== _S.obsFilterUnivers) continue; artCnt[code] = (artCnt[code] || 0) + 1; artFreqSum[code] = (artFreqSum[code] || 0) + data.countBL; artCASum[code] = (artCASum[code] || 0) + artCA(data); } } for (const [code, cnt] of Object.entries(artCnt)) { if (cnt < threshold || (myV[code]?.sumPrelevee || 0) > 0) continue; const r = finalDataByCode[code]; const statutMe = !r ? '❌ Absent' : r.stockActuel > 0 ? '✅ En stock' : r.ancienMax > 0 ? '⚠️ Rupture' : '❌ Absent'; const caO2 = Math.round(artCASum[code] / cnt); if (!/^\d{6}$/.test(code)) { specialArts.push({ code, freqOther: Math.round(artFreqSum[code] / cnt), caOther: caO2, nbStores: cnt }); continue; } const r2b = finalDataByCode[code]; const statMe2b = !r2b ? '❌ Absent' : r2b.stockActuel > 0 ? '✅ En stock' : r2b.ancienMax > 0 ? '⚠️ Rupture' : '❌ Absent'; missingArts.push({ code, lib: _splitLib(_S.libelleLookup[code] || 'Libellé non disponible'), freqOther: Math.round(artFreqSum[code] / cnt), caOther: caO2, statutMe: statMe2b, nbStores: cnt }); } }
    if (refMe === 0) { missingArts.sort((a, b) => b.caOther - a.caOther); } else { missingArts.sort((a, b) => b.freqOther - a.freqOther); } missingArts = missingArts.slice(0, 50);
    // Articles exclusifs — vendus par moi mais pas par la comparaison
    const exclusiveArts = []; if (compV) { for (const [code, data] of Object.entries(myV)) { if (famLib(_S.articleFamille[code]) !== fam || (data.sumPrelevee || 0) <= 0 || !/^\d{6}$/.test(code)) continue; if ((compV[code]?.sumPrelevee || 0) > 0 || (compV[code]?.sumEnleve || 0) > 0) continue; const lib = _S.libelleLookup[code] || code; const splitLib = /^\d{6} - /.test(lib) ? lib.substring(9).trim() : lib; exclusiveArts.push({ code, lib: splitLib, freq: data.countBL, ca: Math.round(artCA(data)) }); } } else { const threshold = Math.max(2, Math.ceil(cs.length / 2)); for (const [code, data] of Object.entries(myV)) { if (famLib(_S.articleFamille[code]) !== fam || (data.sumPrelevee || 0) <= 0 || !/^\d{6}$/.test(code)) continue; let otherCount = 0; for (const store of cs) { if ((vpm[store]?.[code]?.sumPrelevee || 0) > 0) otherCount++; } if (otherCount >= threshold) continue; const lib = _S.libelleLookup[code] || code; const splitLib = /^\d{6} - /.test(lib) ? lib.substring(9).trim() : lib; exclusiveArts.push({ code, lib: splitLib, freq: data.countBL, ca: Math.round(artCA(data)), nbStores: otherCount }); } } exclusiveArts.sort((a, b) => b.ca - a.ca);
    const entry = { fam, caMe, caOther, ecartPct, refMe, refOther, missingArts, specialArts, exclusiveArts: exclusiveArts.slice(0, 30), caTheorique: Math.round(myPoids * (bassinFamCATot[fam] || 0)), ecartTheorique: Math.round((myFamCA[fam] || 0) - myPoids * (bassinFamCATot[fam] || 0)), pdm: famPDM[fam] ?? null };
    if (ecartPct <= -5) obsFamiliesLose.push(entry); else if (ecartPct >= 5) obsFamiliesWin.push(entry);
  }
  obsFamiliesLose.sort((a, b) => Math.abs(b.caOther - b.caMe) - Math.abs(a.caOther - a.caMe) || a.ecartPct - b.ecartPct);
  obsFamiliesWin.sort((a, b) => (b.caMe - b.caOther) - (a.caMe - a.caOther));
  _S.benchLists.obsFamiliesLose = obsFamiliesLose; _S.benchLists.obsFamiliesWin = obsFamiliesWin;
  _bmk('Observatoire familles');
  _S.benchLists.obsActionPlan = obsFamiliesLose.slice(0, 3).map(f => { const artsToRef = (f.missingArts || []).filter(a => a.statutMe !== '✅ En stock'); const artsVisi = (f.missingArts || []).filter(a => a.statutMe === '✅ En stock'); return { fam: f.fam, ecartPct: f.ecartPct, nbToRef: artsToRef.length, nbVisibility: artsVisi.length, refOther: f.refOther, caPotentiel: Math.round(Math.abs(f.caOther - f.caMe)) }; });
  // === PÉPITES — articles où je surperforme / où le réseau me surpasse ===
  // ── Agréger les ventes myStore sur la période active depuis _byMonth ──
  const _pepMyStore = {};
  {
    const pStart = _S.periodFilterStart;
    const pEnd   = _S.periodFilterEnd;
    const startIdx = pStart ? (pStart.getFullYear()*12 + pStart.getMonth()) : 0;
    const endIdx   = pEnd   ? (pEnd.getFullYear()*12   + pEnd.getMonth())   : 999999;
    const bm = _S._byMonth;
    if (bm) {
      for (const cc in bm) {
        const arts = bm[cc];
        for (const code in arts) {
          if (!/^\d{6}$/.test(code)) continue;
          for (const midxStr in arts[code]) {
            const midx = +midxStr;
            if (midx < startIdx || midx > endIdx) continue;
            const d = arts[code][midxStr];
            if (!_pepMyStore[code]) _pepMyStore[code] = { sumPrelevee: 0, sumCA: 0, countBL: 0 };
            if ((d.sumPrelevee || 0) > 0) _pepMyStore[code].sumPrelevee += d.sumPrelevee;
            _pepMyStore[code].sumCA   += d.sumCA   || 0;
            _pepMyStore[code].countBL += d.countBL || 0;
          }
        }
      }
    } else {
      // Fallback : _byMonth absent (IDB ancien ou parse inline) → articleMonthlySales + periodeMonths
      // articleMonthlySales[code] = [12 qtés mois 0-11], sauvegardé en IDB → toujours disponible
      const _fMois = new Date().getMonth();
      const _preset = _S._globalPeriodePreset || '12M';
      const _fPm = _preset === '6M'
        ? Array.from({ length: 6 }, (_, i) => (_fMois - 5 + i + 12) % 12)
        : _preset === 'YTD'
        ? Array.from({ length: _fMois + 1 }, (_, i) => i)
        : Array.from({ length: 12 }, (_, i) => i);
      const _ms = _S.articleMonthlySales || {};
      for (const [code, monthly] of Object.entries(_ms)) {
        if (!/^\d{6}$/.test(code)) continue;
        const sumP = _fPm.reduce((s, m) => s + (monthly[m] || 0), 0);
        if (sumP <= 0) continue;
        const _vpmArt = _S.ventesParAgence?.[_S.selectedMyStore]?.[code];
        _pepMyStore[code] = { sumPrelevee: sumP, sumCA: _vpmArt?.sumCA || 0, countBL: _vpmArt?.countBL || 0 };
      }
    }
  }
  // Build per-code frequency + CA lists across cs stores (one pass)
  const _pepCsFreqs = {}, _pepCsCA = {}, _pepCsQte = {};
  // _pepCsQte : depuis vpm (période-filtrée, cohérent avec _pepMyStore)
  for (const store of cs) { const sv = vpm[store] || {}; for (const [code, data] of Object.entries(sv)) { if (!/^\d{6}$/.test(code) || !(data.countBL > 0)) continue; if (!_pepCsFreqs[code]) { _pepCsFreqs[code] = []; _pepCsCA[code] = []; _pepCsQte[code] = []; } _pepCsFreqs[code].push(data.countBL); _pepCsCA[code].push(artCA(data)); _pepCsQte[code].push(data.sumPrelevee || 0); } }
  const _pepLib = code => { const r = _S.libelleLookup[code] || code; return /^\d{6} - /.test(r) ? r.substring(9).trim() : r; };
  // 💎 Mes pépites — I outperform
  const pepites = [];
  for (const code of new Set([...Object.keys(_pepMyStore), ...Object.keys(myV)])) {
    if (!/^\d{6}$/.test(code)) continue;
    const myPep = _pepMyStore[code];
    const myFreq = myPep?.countBL || 0;
    if (myFreq < 2) continue;
    const csFreqs = _pepCsFreqs[code] || [];
    const compFreq = compV ? (compV[code]?.countBL || 0) : (csFreqs.length ? _median(csFreqs) : 0);
    if (compFreq <= 0 || myFreq <= compFreq * 1.3) continue;
    const ecartPct = Math.round((myFreq / compFreq - 1) * 100);
    const myQte = myPep?.sumPrelevee || 0;
    const csQtes = _pepCsQte[code] || [];
    const _obsStore = _S.selectedObsCompare && _S.selectedObsCompare !== 'median' ? _S.selectedObsCompare : null;
    const compQte = _obsStore ? (_S.ventesParAgence[_obsStore]?.[code]?.sumPrelevee || 0) : (csQtes.length ? _median(csQtes) : 0);
    const caMe = myPep?.sumCA || artCA(myV[code] || {}) || 0;
    pepites.push({ code, lib: _pepLib(code), fam: famLib(_S.articleFamille[code]) || '', myFreq, compFreq: Math.round(compFreq), ecartPct, caMe: Math.round(caMe), myQte, compQte: Math.round(compQte) });
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

  _bmk('Observatoire + pépites');
  console.table(_bm);
  // Mémoriser le résultat — clé sans canal (invariant architectural)
  _S._benchCache = { key: _bKey, benchLists: _S.benchLists, benchFamEcarts: _S.benchFamEcarts };
}

// ── Worker réseau inline ────────────────────────────────────────────────────
// Calcule : nomades, orphelins réseau, fuites par métier
export function _reseauWorker() {
  self.onmessage = function(e) {
    const { myStore, ventesParAgence, storesIntersection, articleFamille,
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
      const sv = ventesParAgence[store] || {};
      // ventesParAgence est indexé par article dans le worker, on a besoin d'une map client→store
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
      const sv = ventesParAgence[store] || {};
      for (const [code, data] of Object.entries(sv)) {
        if (!/^\d{6}$/.test(code)) continue;
        if ((data.countBL || 0) > 0) {
          artStoreCount[code] = (artStoreCount[code] || 0) + 1;
          artTotalFreq[code] = (artTotalFreq[code] || 0) + (data.countBL || 0);
        }
      }
    }
    const otherStoresCount = storesIntersection.filter(s => s !== myStore).length || 1;
    const myV = ventesParAgence[myStore] || {};
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
      const sv = ventesParAgence[store] || {};
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
      .filter(([, d]) => d.clients.size >= 2 && d.totalCaOther >= CROSS_AGENCE_MIN_CA && d.totalBLOther >= CROSS_AGENCE_MIN_BL)
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

// Legacy — Worker réseau (non déclenché, nomades/orphelins via compute direct)
function launchReseauWorker() {
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
        ventesParAgence: _S.ventesParAgence,
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
