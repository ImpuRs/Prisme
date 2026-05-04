/* js/parse-worker.js — Worker parsing : consommé + stock + ABC/FMR */
'use strict';
importScripts('https://cdn.sheetjs.com/xlsx-latest/package/dist/xlsx.full.min.js');

// ── Constantes inline (depuis constants.js) ──────────────────────────────
var CHUNK_SIZE = 5000;
var DORMANT_DAYS = 365;
var NOUVEAUTE_DAYS = 35;
var SECURITY_DAYS = 3;
var HIGH_PRICE = 150;

var FAM_LETTER_UNIVERS = {
  'A': 'Agencement ameublement', 'B': 'Bâtiment', 'C': 'Consommables',
  'R': 'Électricité', 'E': 'EPI', 'G': 'Génie climatique',
  'M': 'Maintenance et équipements', 'O': 'Outillage', 'L': 'Plomberie'
};
// Reverse lookup : libellé univers (lowercase) → nom canonique FAM_LETTER_UNIVERS
var _UNIVERS_CANONICAL = {};
for (var _ulk in FAM_LETTER_UNIVERS) { _UNIVERS_CANONICAL[FAM_LETTER_UNIVERS[_ulk].toLowerCase()] = FAM_LETTER_UNIVERS[_ulk]; }

var AGE_BRACKETS = {
  fresh:    { min: 0,   max: 90 },
  warm:     { min: 90,  max: 180 },
  hot:      { min: 180, max: 365 },
  critical: { min: 365, max: Infinity }
};

var FAMILLE_LOOKUP = {
  '00': 'Frais Gén./Emballages Internes',
  '12': 'Actions promotionnelles',
  '22': 'Lots - Cadeaux - Dons',
  '30': 'Moustiquaires sur mesure',
  '31': 'Grilles sur mesure',
  '32': 'Baton maréchal sur mesure',
  '94': 'Fin de série 2004',
  'A01': 'Accessoires', 'A02': 'Agencement', 'A03': 'Assemblage de meuble',
  'A04': 'Equipements', 'A05': 'Fermetures de meubles', 'A06': 'Ferrures de portes battantes',
  'A07': 'Ferrures de portes coulissantes', 'A08': 'Garnitures de meubles',
  'A10': 'Pieds et roulettes de meubles', 'A11': 'Tiroirs et coulisses',
  'A12': 'Caissons et portes',
  'B01': 'Contrôle d\'accès et sécurité', 'B02': 'Cylindres', 'B03': 'Ferme-porte',
  'B04': 'Ferrures de porte et fenêtre', 'B05': 'Ferrures de portes coulissantes',
  'B06': 'Ferrures de volets et portail', 'B07': 'Garnitures de porte et fenêtre',
  'B09': 'Quincaillerie générale', 'B10': 'Serrures', 'B11': 'Ventilation extraction',
  'C01': 'Colles - adhésifs - lubrifiant', 'C02': 'Coupe', 'C03': 'Fixation',
  'C04': 'Peintures - marquage',
  'E01': 'Matériel des 1ers secours', 'E02': 'Mise en sécurité de la personne',
  'E03': 'Protection auditive', 'E04': 'Protection de la tête',
  'E05': 'Protection des mains', 'E06': 'Protection des pieds',
  'E07': 'Protection des yeux', 'E08': 'Protection du corps', 'E09': 'Protection respiratoire',
  'G01': 'Radiateurs et sèche-serviettes', 'G02': 'Robinetterie de radiateur',
  'G03': 'Plancher chauffant', 'G04': 'Chaudières', 'G05': 'Équipements de chaufferie',
  'G06': 'Pompes à chaleur', 'G07': 'Climatisation', 'G08': 'Régulation',
  'G09': 'Ventilation, traitement air', 'G10': 'Fumisterie',
  'L01': 'Raccords', 'L02': 'Robinetterie', 'L03': 'Sanitaire', 'L04': 'WC',
  'L05': 'Vidage', 'L06': 'Collectivité', 'L07': 'Réseau sanitaire', 'L08': 'Gaz',
  'M01': 'Air comprimé', 'M02': 'Atelier', 'M03': 'Echelles - échafaudages',
  'M05': 'Emballage - protection', 'M06': 'Matériels et produits d\'entretien',
  'M07': 'Levage et manutention', 'M08': 'Matériel de chantier',
  'M09': 'Équipements urbains', 'M10': 'Signalisation de chantier',
  'M11': 'Soudage', 'M12': 'Tuyaux', 'M14': 'Équipements de chantier',
  'M15': 'Fournitures de bureaux',
  'O01': 'Jardin', 'O02': 'Machines de chantier et d\'atelier',
  'O03': 'Mesure et contrôle', 'O04': 'Outillage à main',
  'O05': 'Outillage électroportatif', 'O06': 'Outils métiers',
  'O07': 'Rangement d\'outillage', 'O08': 'Serrage',
  'R01': 'Branchement et protection', 'R02': 'Appareillage terminal',
  'R03': 'Appareillage industriel', 'R04': 'Communication et réseaux',
  'R05': 'Fils et câbles', 'R06': 'Conduits et chemin de câbles',
  'R07': 'Accessoires et raccordements', 'R08': 'Eclairage',
  'R09': 'Domotique et automatisme', 'R10': 'Sécurité & Alarme',
  'R12': 'Piles, batteries, alimentation', 'R13': 'Équipements électriques'
};

// ── Utilitaires inline (depuis utils.js) ─────────────────────────────────
function cleanCode(s) { return s ? s.toString().split('-')[0].trim() : ''; }

function extractClientCode(val) {
  var s = (val || '').toString().trim();
  var idx = s.indexOf(' - ');
  var code = idx >= 0 ? s.slice(0, idx).trim() : s;
  // Padder à 6 chiffres si code numérique — charCodeAt plus rapide que regex
  var allDigits = code.length > 0;
  for (var di = 0; di < code.length; di++) {
    var cc = code.charCodeAt(di);
    if (cc < 48 || cc > 57) { allDigits = false; break; }
  }
  return allDigits ? code.padStart(6, '0') : code;
}

function cleanPrice(v) {
  if (!v) return 0;
  var s = v.toString().replace(/\s/g, '').replace(/,/g, '.').replace(/[−–—]/g, '-');
  var n = parseFloat(s.replace(/[^0-9.\-]/g, ''));
  return isNaN(n) ? 0 : n;
}

function parseExcelDate(v) {
  if (!v && v !== 0) return null;
  if (v instanceof Date) return isNaN(v.getTime()) ? null : v;
  if (typeof v === 'number') {
    if (v > 39000 && v < 60000) return new Date(Math.round((v - 25569) * 864e5));
    return null;
  }
  if (typeof v === 'string') {
    var s = v.split(' ')[0];
    var p = s.split(/[-/]/);
    if (p.length === 3) {
      var n = p.map(function(x) { return parseInt(x, 10); });
      if (n.some(isNaN)) return null;
      if (n[0] > 31) return new Date(n[0], n[1] - 1, n[2]);
      if (n[2] > 31) return new Date(n[2], n[1] - 1, n[0]);
      var a = n[0], b = n[1], d = n[2];
      if (d < 100) d += 2000;
      if (a > 12) return new Date(d, b - 1, a);
      if (b > 12) return new Date(d, a - 1, b);
      return new Date(d, b - 1, a);
    }
    var x = new Date(v);
    return isNaN(x.getTime()) ? null : x;
  }
  return null;
}

function daysBetween(a, b) { var d = b.getTime() - a.getTime(); return d > 0 ? Math.ceil(d / 864e5) : 0; }

function extractFamCode(raw) {
  if (!raw) return '';
  var s = raw.toString().trim();
  var m = s.match(/^([A-Z]\d{2,3}|\d{2,3})\s*-\s*/);
  if (m) return m[1];
  if (/^([A-Z]\d{2,3}|\d{2,3})$/.test(s)) return s;
  var sL = s.toLowerCase();
  for (var code in FAMILLE_LOOKUP) {
    if (FAMILLE_LOOKUP[code].toLowerCase() === sL) return code;
  }
  return s;
}

function famLib(code) {
  if (!code) return '';
  return FAMILLE_LOOKUP[code] || code;
}

function formatLocalYMD(d) {
  var y = d.getFullYear(), m = d.getMonth() + 1, day = d.getDate();
  return y + '-' + (m < 10 ? '0' + m : m) + '-' + (day < 10 ? '0' + day : day);
}

// ── Column-name lookup cache (reset between datasets) ────────────────────
var _CC = { gv: {}, qty: {}, ca: {}, vmb: {} };
function _resetColCache() { _CC = { gv: {}, qty: {}, ca: {}, vmb: {} }; }

function getVal(r, /* ...k */) {
  var keys = Array.prototype.slice.call(arguments, 1);
  var cKey = keys.join('\x00');
  var col = _CC.gv[cKey];
  if (col === undefined) {
    var ks = Object.keys(r);
    col = null;
    for (var pi = 0; pi < keys.length; pi++) {
      var p = keys[pi];
      var f = null;
      for (var ki = 0; ki < ks.length; ki++) {
        if (ks[ki].toLowerCase().includes(p.toLowerCase())) { f = ks[ki]; break; }
      }
      if (f !== undefined && f !== null) { col = f; break; }
    }
    _CC.gv[cKey] = col;
  }
  return col !== null ? (r[col] != null ? r[col] : '') : '';
}

function isParentRef(row) {
  function isEmpty(v) { if (!v) return true; var s = v.toString().trim(); return s === '' || s === '-' || s === '0' || s === 'NaN'; }
  return isEmpty(getVal(row, 'dernière sortie', 'sortie')) &&
         isEmpty(getVal(row, 'première entrée', 'premiere entree', 'première réception')) &&
         isEmpty(getVal(row, 'dernière entrée', 'entrée'));
}

// ── extractStoreCode (version pour objets stock) ─────────────────────────
function extractStoreCode(row) {
  var keys = Object.keys(row);
  var key = null;
  for (var i = 0; i < keys.length; i++) {
    var kl = keys[i].toLowerCase().replace(/[\r\n]/g, ' ').trim();
    if (kl === 'code pdv' || kl === 'pdv' || kl === 'code agence' || kl === 'agence' || kl === 'code depot' || kl === 'dépôt' || kl === 'depot') {
      key = keys[i]; break;
    }
  }
  return key ? (row[key] || '').toString().trim().toUpperCase() : '';
}

// ── calcCouverture inline ────────────────────────────────────────────────
function calcCouverture(stock, V, joursOuvres) {
  if (V <= 0 || stock <= 0) return 999;
  return Math.round(stock / (V / joursOuvres));
}

// ── computeABCFMR inline (depuis engine.js, sans _S) ────────────────────
function computeABCFMR(data) {
  // Single-pass: collect active items + total rotation + total stock value
  var active = [];
  var totalStockVal = 0;
  for (var i = 0; i < data.length; i++) {
    var r = data[i];
    if (r.W >= 1) active.push(r);
    if (r.stockActuel > 0) totalStockVal += r.stockActuel * r.prixUnitaire;
  }
  active.sort(function(a, b) { return (b.V * b.prixUnitaire) - (a.V * a.prixUnitaire); });
  var totalRot = 0;
  for (var j = 0; j < active.length; j++) totalRot += active[j].V * active[j].prixUnitaire;
  // ABC classification
  var cumul = 0;
  for (var k = 0; k < active.length; k++) {
    var ra = active[k];
    cumul += ra.V * ra.prixUnitaire;
    var p = totalRot > 0 ? cumul / totalRot : 1;
    ra.abcClass = p <= 0.8 ? 'A' : p <= 0.95 ? 'B' : 'C';
    ra.fmrClass = ra.W >= 12 ? 'F' : ra.W >= 4 ? 'M' : 'R';
  }
  // Matrix accumulation — single pass over data
  var mx = {};
  var abcCls = ['A', 'B', 'C'], fmrCls = ['F', 'M', 'R'];
  for (var ai = 0; ai < abcCls.length; ai++)
    for (var fi = 0; fi < fmrCls.length; fi++)
      mx[abcCls[ai] + fmrCls[fi]] = { count: 0, stockVal: 0, pctTotal: 0 };
  for (var m = 0; m < data.length; m++) {
    var rd = data[m];
    if (rd.W < 1) { rd.abcClass = ''; rd.fmrClass = ''; continue; }
    var key = rd.abcClass + rd.fmrClass;
    if (mx[key]) {
      mx[key].count++;
      if (rd.stockActuel > 0) mx[key].stockVal += rd.stockActuel * rd.prixUnitaire;
    }
  }
  for (var mk in mx) {
    if (totalStockVal > 0) mx[mk].pctTotal = mx[mk].stockVal / totalStockVal * 100;
  }
  return mx;
}

// ── Sérialisation Maps/Sets pour postMessage ─────────────────────────────
function serMap(m) {
  if (!(m instanceof Map)) return m;
  return Array.from(m).map(function(kv) {
    var k = kv[0], v = kv[1];
    if (v instanceof Map) return [k, serMap(v)];
    if (v instanceof Set) return [k, Array.from(v)];
    return [k, v];
  });
}

// ── Détection colonne agence dans headers (tableau) ──────────────────────
function _detectStoreColumnIdx(headers) {
  if (!headers || !headers.length) return -1;
  return headers.findIndex(function(k) {
    var kl = k.toLowerCase().replace(/[\r\n]/g, ' ').trim();
    return kl === 'code pdv' || kl === 'pdv' || kl === 'code agence' || kl === 'agence' ||
           kl === 'code depot' || kl === 'dépôt' || kl === 'depot';
  });
}

// ── Conversion ws dense → {headers, rows} ──────────────────────────────
function _wsToHR(ws) {
  var raw = ws['!data'] || [];
  if (!raw.length) return { headers: [], rows: [] };
  var r0 = raw[0] || [];
  var headers = [];
  for (var c = 0; c < r0.length; c++) {
    headers.push(r0[c] != null && r0[c].v != null ? String(r0[c].v).trim() : '');
  }
  var nCols = headers.length;
  var rows = [];
  for (var ri = 1; ri < raw.length; ri++) {
    var src = raw[ri];
    var row = new Array(nCols);
    if (src) {
      for (var ci = 0; ci < nCols; ci++) {
        var cell = src[ci];
        row[ci] = cell != null ? (cell.v != null ? cell.v : '') : '';
      }
    } else {
      for (var ci2 = 0; ci2 < nCols; ci2++) row[ci2] = '';
    }
    rows.push(row);
  }
  return { headers: headers, rows: rows };
}

// ── readExcelAsObjects ────────────────────────────────────────────────────
function readExcelAsObjects(hr) {
  var headers = hr.headers, rows = hr.rows;
  return rows.map(function(r) {
    var obj = {};
    for (var i = 0; i < headers.length; i++) obj[headers[i]] = r[i] != null ? r[i] : '';
    return obj;
  });
}

// ── _median ───────────────────────────────────────────────────────────────
function _median(arr) {
  if (!arr.length) return 0;
  var s = arr.slice().sort(function(a, b) { return a - b; });
  var m = s.length;
  return m % 2 ? s[(m - 1) / 2] : (s[m / 2 - 1] + s[m / 2]) / 2;
}

// ════════════════════════════════════════════════════════════════════════════
// HANDLER PRINCIPAL
// ════════════════════════════════════════════════════════════════════════════

// Attendre un message {type:'continue'} du main thread (sélection agence)
function waitForContinue() {
  return new Promise(function(resolve) {
    var prev = self.onmessage;
    self.onmessage = function(ev) {
      if (ev.data && ev.data.type === 'continue') {
        self.onmessage = prev;
        resolve((ev.data.selectedStore || '').toUpperCase());
      }
    };
  });
}

// ── Helpers de parsing consommé (CSV / XLSX) ──────────────────────────
function _parseCsvBuffer(buf) {
  var text;
  try { text = new TextDecoder('utf-8', { fatal: true }).decode(buf); }
  catch(e) { text = new TextDecoder('windows-1252').decode(buf); }
  // Détection séparateur sur la première ligne (avant tout guillemet)
  var nlIdx = text.indexOf('\n');
  var firstLine = nlIdx >= 0 ? text.substring(0, nlIdx).replace(/\r/g, '') : text;
  var sep = firstLine.indexOf(';') > firstLine.indexOf('\t') ? ';'
          : firstLine.indexOf('\t') >= 0 ? '\t' : ';';
  var sepCode = sep.charCodeAt(0);
  // État-machine quote-safe (gère séparateur dans guillemets)
  var headers = [];
  var rows = [];
  var len = text.length;
  var i = 0;
  var cells = [];
  var field = '';
  var inQuote = false;
  var isHeader = true;
  while (i <= len) {
    var ch = i < len ? text.charCodeAt(i) : -1;
    if (inQuote) {
      if (ch === 34) { // "
        if (i + 1 < len && text.charCodeAt(i + 1) === 34) { field += '"'; i += 2; }
        else { inQuote = false; i++; }
      } else if (ch === -1) { inQuote = false; }
      else { field += text.charAt(i); i++; }
    } else {
      if (ch === 34) { inQuote = true; i++; }
      else if (ch === sepCode) { cells.push(field); field = ''; i++; }
      else if (ch === 13) { i++; } // skip \r
      else if (ch === 10 || ch === -1) { // \n or EOF
        if (cells.length || field) {
          cells.push(field); field = '';
          if (isHeader) { headers = cells.map(function(h) { return h.trim(); }); isHeader = false; }
          else rows.push(cells);
          cells = [];
        }
        i++;
      } else { field += text.charAt(i); i++; }
    }
  }
  var nbCols = headers.length;
  for (var ri = 0; ri < rows.length; ri++) {
    while (rows[ri].length < nbCols) rows[ri].push('');
  }
  return { headers: headers, rows: rows };
}

function _parseXlsxBuffer(buf) {
  var wb = XLSX.read(new Uint8Array(buf), {
    type: 'array', dense: true, cellDates: false,
    cellFormula: false, cellHTML: false, cellStyles: false
  });
  return _wsToHR(wb.Sheets[wb.SheetNames[0]]);
}

// ── Streaming state (réduit le pic RAM côté main thread) ─────────────────
// Protocol:
//   1) main → worker : {type:'init', ...opts}
//   2) main → worker : {type:'consomme', buf, filename, index, total}  (repeat)
//   3) main → worker : {type:'stock', buf, filename}                   (optional)
//   4) main → worker : {type:'start'}                                  (run)
var _stream = null;

function _mergeConsomme(dataC, parsed) {
  if (!dataC) return parsed;
  // Fusion : concaténer les rows, réaligner colonnes si headers diffèrent
  if (parsed.headers.join('|') === dataC.headers.join('|')) {
    for (var ri = 0; ri < parsed.rows.length; ri++) dataC.rows.push(parsed.rows[ri]);
  } else {
    // Match fuzzy : normaliser casse/accents/espaces pour mapper les colonnes
    var _norm = function(s) { return (s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ').trim(); };
    var exactIdx = {};
    var normIdx = {};
    for (var ni = 0; ni < parsed.headers.length; ni++) {
      exactIdx[parsed.headers[ni]] = ni;
      normIdx[_norm(parsed.headers[ni])] = ni;
    }
    var colMap = [];
    for (var hi = 0; hi < dataC.headers.length; hi++) {
      var ex = exactIdx[dataC.headers[hi]];
      colMap.push(ex !== undefined ? ex : (normIdx[_norm(dataC.headers[hi])] ?? -1));
    }
    var mapLen = colMap.length;
    for (var ri2 = 0; ri2 < parsed.rows.length; ri2++) {
      var srcRow = parsed.rows[ri2];
      var mappedRow = new Array(mapLen);
      for (var mi = 0; mi < mapLen; mi++) {
        mappedRow[mi] = colMap[mi] >= 0 ? srcRow[colMap[mi]] : '';
      }
      dataC.rows.push(mappedRow);
    }
  }
  return dataC;
}

async function _handleParseMessage(data) {
  if (data.type === 'continue') return; // message tardif, ignorer
  // Multi-consommé : accepte bufCArray (tableau) OU bufC (unique, rétrocompat)
  var bufCArray = data.bufCArray || (data.bufC ? [data.bufC] : []);
  var filenamesC = data.filenamesC || (data.filenameC ? [data.filenameC] : ['']);
  var bufS = data.bufS;
  var periodStart = data.periodStart ? new Date(data.periodStart) : null;
  var periodEnd = data.periodEnd ? new Date(data.periodEnd) : null;
  var isRefilter = !!data.isRefilter;
  var lowMem = !!data.lowMem;

  try {
    // ── 1. Parse consommé (un ou plusieurs fichiers) ──────────────────
    var dataC = null;
    if (data.type === 'start' && _stream && _stream.dataC) {
      dataC = _stream.dataC;
    } else {
      for (var fi = 0; fi < bufCArray.length; fi++) {
        var fname = (filenamesC[fi] || '').toLowerCase();
        var isCsv = fname.endsWith('.csv');
        var label = bufCArray.length > 1 ? ' (' + (fi + 1) + '/' + bufCArray.length + ')' : '';
        self.postMessage({ type: 'progress', pct: 10 + Math.round(8 * fi / bufCArray.length), msg: 'Parsing consommé' + label + '…' });
        var parsed = isCsv ? _parseCsvBuffer(bufCArray[fi]) : _parseXlsxBuffer(bufCArray[fi]);
        dataC = _mergeConsomme(dataC, parsed);
      }
      if (!dataC) dataC = { headers: [], rows: [] };
    }

    // ── 2. Parse XLSX stock ──────────────────────────────────────────────
    var dataS = [];
    if (data.type === 'start' && _stream && _stream.dataS) {
      dataS = _stream.dataS;
    } else if (bufS) {
      self.postMessage({ type: 'progress', pct: 25, msg: 'Parsing stock XLSX…' });
      var wbS = XLSX.read(new Uint8Array(bufS), {
        type: 'array', dense: true, cellDates: false,
        cellFormula: false, cellHTML: false, cellStyles: false
      });
      var rawS = _wsToHR(wbS.Sheets[wbS.SheetNames[0]]);
      dataS = readExcelAsObjects(rawS);
    }

    // ── 3. Détection agences ──────────────────────────────────────────────
    self.postMessage({ type: 'progress', pct: 30, msg: 'Détection agences…' });
    var headersC = dataC.headers || [];
    var storeIdxC = _detectStoreColumnIdx(headersC);
    var storesFoundC = new Set();
    for (var ri = 0; ri < dataC.rows.length; ri++) {
      var s = storeIdxC >= 0 ? (dataC.rows[ri][storeIdxC] != null ? dataC.rows[ri][storeIdxC] : '').toString().trim().toUpperCase() : '';
      if (s) storesFoundC.add(s);
    }
    var storesFoundS = new Set();
    if (dataS && dataS.length) {
      for (var si = 0; si < dataS.length; si++) {
        var sc = extractStoreCode(dataS[si]);
        if (sc) storesFoundS.add(sc);
      }
    }
    var computedIntersection;
    if (storesFoundS.size) {
      computedIntersection = new Set();
      storesFoundC.forEach(function(ss) { if (storesFoundS.has(ss)) computedIntersection.add(ss); });
    } else {
      computedIntersection = new Set(storesFoundC);
    }
    var storesIntersection = computedIntersection;

    // ── 3b. Sélection agence — déléguer au main thread si premier parse ──
    var selectedStore;
    if (isRefilter) {
      // Refilter : agence déjà connue, main thread la fournit directement
      selectedStore = (data.selectedStore || '').toUpperCase();
    } else {
      // Premier parse : envoyer la liste des agences et attendre le choix
      self.postMessage({
        type: 'stores',
        storesFoundC: [...storesFoundC],
        storesFoundS: [...storesFoundS],
        storesIntersection: [...storesIntersection],
      });
      selectedStore = await waitForContinue();
    }

    var hasMulti = storesIntersection.size > 1;
    var useMulti = hasMulti && selectedStore;

    // ── 4. Pré-scan maxDate pour période (si pas fournie) ────────────────
    var _nrm = function(s) { return (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim(); };
    var _fc = function() {
      var t = Array.prototype.slice.call(arguments);
      var idx = headersC.findIndex(function(h) { return t.some(function(s) { return _nrm(h).includes(_nrm(s)); }); });
      return idx >= 0 ? idx : null;
    };
    var MOIS_FR = {
      'janv.':0,'févr.':1,'mars':2,'avr.':3,'mai':4,'juin':5,
      'juil.':6,'août':7,'sept.':8,'oct.':9,'nov.':10,'déc.':11,
      // variantes sans point
      'janv':0,'févr':1,'avr':3,'juil':6,'sept':8,'oct':9,'nov':10,'déc':11
    };
    var CI = {
      store: _fc('code pdv', 'pdv', 'code agence', 'agence', 'code depot', 'depot'),
      article: _fc('code - désignation', 'code et nom article', 'article'),
      client: _fc('code et nom client', 'code client', 'client'),
      canal: _fc('canal commande', 'canal'),
      jour: _fc('jour', 'date'),
      annee: _fc('année', 'annee', 'year'),
      mois: _fc('mois'),
      bl: _fc('n° bl', 'numéro de bl', 'numero bl'),
      commande: _fc('numéro de commande', 'n° commande'),
      // typeCmde retiré — jamais lu dans le pipeline
      caE: _fc('ca enlevé', 'ca enleve'),
      caP: _fc('ca prélevé', 'ca preleve'),
      vmbE: _fc('vmb enlevé', 'vmb enleve'),
      vmbP: _fc('vmb prélevé', 'vmb preleve'),
      qteE: _fc('qté enlevée', 'qte enlevee'),
      qteP: _fc('qté prélevée', 'qte prelevee'),
      famille: headersC.findIndex(function(h) { return _nrm(h) === 'famille'; }),
      codeFam: _fc('code famille'),
      univers: headersC.findIndex(function(h) { return _nrm(h) === 'univers'; })
    };
    if (CI.famille < 0) CI.famille = null;
    if (CI.univers < 0) CI.univers = null;

    // Helper date CSV : reconstruit depuis colonne jour OU colonnes annee+mois
    var _parseDateRow = function(prow) {
      if (CI.jour !== null && prow[CI.jour] != null && prow[CI.jour] !== '') {
        return parseExcelDate(prow[CI.jour]);
      }
      if (CI.annee !== null && CI.mois !== null) {
        var yr = parseInt(prow[CI.annee] || '', 10);
        var mStr = (prow[CI.mois] || '').toString().trim().toLowerCase();
        var mi = MOIS_FR[mStr];
        if (!isNaN(yr) && mi !== undefined) return new Date(yr, mi, 1);
      }
      return null;
    };

    var periodFilterStart = periodStart;
    var periodFilterEnd = periodEnd;

    // Pré-scan si pas de période fournie
    if (!isRefilter && !periodFilterStart && (CI.jour !== null || (CI.annee !== null && CI.mois !== null))) {
      var _ps_maxTs = 0;
      for (var psi = 1; psi < dataC.rows.length; psi++) {
        var prow = dataC.rows[psi]; if (!prow) continue;
        var _pd = _parseDateRow(prow);
        if (_pd && !isNaN(_pd)) { var ts = _pd.getTime(); if (ts > _ps_maxTs) _ps_maxTs = ts; }
      }
      if (_ps_maxTs > 0) {
        var _pD = new Date(_ps_maxTs);
        var _py = _pD.getFullYear(), _pm = _pD.getMonth();
        periodFilterStart = new Date(_py, _pm, 1);
        periodFilterEnd = new Date(_py, _pm + 1, 0, 23, 59, 59);
      }
    }

    // ── 5. Boucle consommé ───────────────────────────────────────────────
    self.postMessage({ type: 'progress', pct: 35, msg: 'Analyse ventes…' });

    var _hasCommandeCol = !!(CI.commande !== null || CI.bl !== null);

    // Agrégats locaux
    var articleRaw = {};
    var monthlySales = {};
    var monthlySalesReseau = {};
    var ventesParAgence = {};
    var ventesParAgenceByCanal = {};
    var ventesLocalMagPeriode = new Map();
    var ventesLocalMag12MG = new Map();
    var ventesReseauTousCanaux = new Map();
    var ventesLocalHorsMag = new Map();
    var ventesClientsPerStore = {};
    var caClientParStore = {}; // {store → Map<cc, totalCA>} — FULL period, TOUS canaux
    var byMonthStoreClients = {}; // {store → {monthIdx → Set<cc>}} — pour rebuild période
    var byMonthStoreClientCA = {}; // {store → {monthIdx → {cc → sumCA}}} — CA client par mois par store
    var commandesPerStoreCanal = {};
    var clientsMagasin = new Set();
    var clientsMagasinFreq = new Map(); // built post-loop from _clientMagasinBLsTemp
    var _clientMagasinBLsTemp = new Map();
    var clientLastOrder = new Map();
    var clientLastOrderAll = new Map();
    var clientLastOrderByCanal = new Map();
    var clientNomLookup = {};
    var articleFamille = {};
    var articleUnivers = {};
    var libelleLookup = {};
    var canalAgence = {};
    var blCanalMap = new Map();
    var cannauxHorsMagasin = new Set();
    var articleCanalCA = new Map();
    var blData = {};
    var blPreleveeSet = new Set();
    var clientArticles = new Map();
    var articleClients = new Map();
    var articleClientsFull = new Map(); // pleine période — hoisté hors filtre période (pour squelette)
    var passagesUniques = new Set();
    var commandesPDV = new Set();
    var ventesClientAutresAgences = new Map();
    var clientsByStoreUnivers = {}; // {store → {univers → Set<cc>}} — pleine période 12MG
    var _cbuDeferred = []; // rows where univers couldn't be resolved inline — second pass after articleFamille complete
    var minDateVente = Infinity, maxDateVente = 0;
    var _tempCAAll = new Map();
    var _tempCAAllFull = new Map();
    var byMonth = {};        // cc → code → monthIdx → {sumCA, sumPrelevee, countBL, sumVMB, sumVMBP, sumCAPrelevee}
    var byMonthFull = {};    // cc → code → monthIdx → {sumCA} — TOUS canaux, myStore (pour captation vs Livraisons)
    var byMonthCanal = {};   // store → canal → monthIdx → {sumCA, sumPrelevee, countBL}
    var byMonthClients = {}; // monthIdx → Set<cc> — tous canaux, pleine période, pour comptage clients par période
    var byMonthClientsByCanal = {}; // monthIdx → canal → Set<cc> — pour comptage clients par canal+période
    var byMonthClientCAByCanal = {}; // monthIdx → canal → {cc → sumCA} — CA client par canal+période (myStore)
    var byMonthStoreArtCanal = {}; // store → canal → code → monthIdx → {sumCA, sumPrelevee, countBL, sumVMB, sumVMBPrel} — pour rebuild ventesParAgenceByCanal filtré période

    var rows = dataC.rows;
    var totalRows = rows.length;

    for (var i = 0; i < totalRows; i++) {
      var row = rows[i];

      var _rs = (CI.store !== null ? (row[CI.store] != null ? row[CI.store] : '') : '').toString().trim().toUpperCase() || 'INCONNU';
      var _ra = (CI.article !== null ? (row[CI.article] != null ? row[CI.article] : '') : '').toString();
      var _rc = (CI.client !== null ? (row[CI.client] != null ? row[CI.client] : '') : '').toString().trim();
      var _rcp = CI.caP !== null ? cleanPrice(row[CI.caP]) : 0;
      var _rce = CI.caE !== null ? cleanPrice(row[CI.caE]) : 0;
      var _rqp = CI.qteP !== null ? cleanPrice(row[CI.qteP]) : 0;
      var _rqe = CI.qteE !== null ? cleanPrice(row[CI.qteE]) : 0;
      var _rvp = CI.vmbP !== null ? cleanPrice(row[CI.vmbP]) : 0;
      var _rve = CI.vmbE !== null ? cleanPrice(row[CI.vmbE]) : 0;
      var _rnc = (CI.commande !== null ? (row[CI.commande] != null ? row[CI.commande] : '').toString() : '').trim();
      var _rbl2 = (CI.bl !== null ? (row[CI.bl] != null ? row[CI.bl] : '').toString() : '').trim();
      var _rncb = _rnc || _rbl2;
      var _rj = _parseDateRow(row);
      var canal = (CI.canal !== null ? (row[CI.canal] != null ? row[CI.canal] : '') : '').toString().trim().toUpperCase();

      // Period-independent blocks (always on first parse — isRefilter=false in worker)
      if (!lowMem && canal) {
        var _storeMatch = !selectedStore || _rs === 'INCONNU' || _rs === selectedStore;
        if (_storeMatch) {
          var nc2_pre = _rncb;
          var _bl2_pre = _rbl2;
          if (nc2_pre || _bl2_pre) {
            if (!canalAgence[canal]) canalAgence[canal] = { bl: new Set(), blNums: new Set(), ca: 0, caP: 0, caE: 0 };
            if (nc2_pre) canalAgence[canal].bl.add(nc2_pre);
            if (_bl2_pre && _bl2_pre !== nc2_pre) canalAgence[canal].blNums.add(_bl2_pre);
          }
        }
      }

      // libelleLookup (all canals)
      {
        var _c0 = cleanCode(_ra);
        if (_c0 && !libelleLookup[_c0]) {
          var _s0 = _ra.indexOf(' - ');
          if (_s0 > 0) libelleLookup[_c0] = _ra.substring(_s0 + 3).trim();
        }
      }

      // canalAgence CA + articleCanalCA
      if (!lowMem && canal && canalAgence[canal]) {
        var _sk_ca = _rs;
        if (!selectedStore || _sk_ca === 'INCONNU' || _sk_ca === selectedStore) {
          canalAgence[canal].caP += _rcp;
          canalAgence[canal].caE += _rce;
          canalAgence[canal].ca += _rcp + _rce;
          var _cf1 = cleanCode(_ra);
          if (_cf1) {
            var _qteP_acc = _rqp;
            if (_rcp + _rce > 0 || _qteP_acc > 0) {
              if (!articleCanalCA.has(_cf1)) articleCanalCA.set(_cf1, new Map());
              var _acm = articleCanalCA.get(_cf1);
              if (!_acm.has(canal)) _acm.set(canal, { ca: 0, qteP: 0, countBL: 0 });
              var _ace = _acm.get(canal);
              _ace.ca += _rcp + _rce;
              _ace.qteP += _qteP_acc;
              _ace.countBL++;
            }
          }
        }
      }

      // Parse date
      var dateV = parseExcelDate(_rj);

      // clientLastOrderAll (all canals, period-independent)
      if (!lowMem && dateV) {
        var _ccAll = extractClientCode(_rc);
        var _skAll = _rs;
        if (_ccAll && (!selectedStore || _skAll === 'INCONNU' || _skAll === selectedStore)) {
          var prev = clientLastOrderAll.get(_ccAll);
          if (!prev || dateV > prev.date) clientLastOrderAll.set(_ccAll, { date: dateV, canal: canal || 'MAGASIN' });
          var _cByC = canal || 'MAGASIN';
          if (!clientLastOrderByCanal.has(_ccAll)) clientLastOrderByCanal.set(_ccAll, new Map());
          var _cMap = clientLastOrderByCanal.get(_ccAll);
          var _prevC = _cMap.get(_cByC);
          if (!_prevC || dateV > _prevC) _cMap.set(_cByC, dateV);
          // clientLastOrder — MAGASIN uniquement, period-independent (comme clientLastOrderAll)
          if (!canal || canal === 'MAGASIN') {
            var _prevMag = clientLastOrder.get(_ccAll);
            if (!_prevMag || dateV > _prevMag) clientLastOrder.set(_ccAll, dateV);
          }
        }
      }

      // byMonthCanal — accumulation mensuelle tous canaux pour reconstruction canalAgence par période
      // NB: on exclut _rs === 'INCONNU' quand un store est sélectionné — ces lignes ne doivent
      // pas être attribuées au store actif (bug split prel AG93 mars 2026: +4491€).
      if (!lowMem && dateV && canal && (!selectedStore || _rs === selectedStore)) {
        var _midxC = dateV.getFullYear() * 12 + dateV.getMonth();
        var _skC = _rs;
        if (!byMonthCanal[_skC]) byMonthCanal[_skC] = {};
        if (!byMonthCanal[_skC][canal]) byMonthCanal[_skC][canal] = {};
        if (!byMonthCanal[_skC][canal][_midxC]) byMonthCanal[_skC][canal][_midxC] = { sumCA: 0, sumPrelevee: 0, sumVMB: 0, sumVMBP: 0, _cmds: new Set(), _cmdsP: new Set(), _cmdsE: new Set() };
        var _bmce = byMonthCanal[_skC][canal][_midxC];
        _bmce.sumCA += _rcp + _rce;
        _bmce.sumPrelevee += _rcp;
        _bmce.sumVMB += _rvp + _rve;
        _bmce.sumVMBP += _rvp;
        if (_rncb) {
          _bmce._cmds.add(_rncb);
          if (_rcp || _rvp) _bmce._cmdsP.add(_rncb);
          if (_rce || _rve) _bmce._cmdsE.add(_rncb);
        }
      }

      // byMonthClients — tous canaux, pleine période, pour comptage clients uniques par période
      if (!lowMem && dateV) {
        var _ccBMC = extractClientCode(_rc);
        var _skBMC = _rs;
        if (_ccBMC && (!selectedStore || _skBMC === selectedStore)) {
          var _midxBMC = dateV.getFullYear() * 12 + dateV.getMonth();
          if (!byMonthClients[_midxBMC]) byMonthClients[_midxBMC] = new Set();
          byMonthClients[_midxBMC].add(_ccBMC);
          var _cBMC = canal || 'MAGASIN';
          if (!byMonthClientsByCanal[_midxBMC]) byMonthClientsByCanal[_midxBMC] = {};
          if (!byMonthClientsByCanal[_midxBMC][_cBMC]) byMonthClientsByCanal[_midxBMC][_cBMC] = new Set();
          byMonthClientsByCanal[_midxBMC][_cBMC].add(_ccBMC);
          // Sub-mode prel/enl pour MAGASIN — permet comptage clients par mode
          if (_cBMC === 'MAGASIN') {
            if (_rcp || _rvp) {
              if (!byMonthClientsByCanal[_midxBMC]['MAGASIN_PREL']) byMonthClientsByCanal[_midxBMC]['MAGASIN_PREL'] = new Set();
              byMonthClientsByCanal[_midxBMC]['MAGASIN_PREL'].add(_ccBMC);
            }
            if (_rce || _rve) {
              if (!byMonthClientsByCanal[_midxBMC]['MAGASIN_ENL']) byMonthClientsByCanal[_midxBMC]['MAGASIN_ENL'] = new Set();
              byMonthClientsByCanal[_midxBMC]['MAGASIN_ENL'].add(_ccBMC);
            }
          }
          // byMonthClientCAByCanal — CA mensuel client×canal (répare CA canal-aware au refilter depuis IDB)
          var _caBMC = _rcp + _rce;
          if (_caBMC) {
            if (!byMonthClientCAByCanal[_midxBMC]) byMonthClientCAByCanal[_midxBMC] = {};
            if (!byMonthClientCAByCanal[_midxBMC][_cBMC]) byMonthClientCAByCanal[_midxBMC][_cBMC] = {};
            byMonthClientCAByCanal[_midxBMC][_cBMC][_ccBMC] = (byMonthClientCAByCanal[_midxBMC][_cBMC][_ccBMC] || 0) + _caBMC;
            if (_cBMC === 'MAGASIN') {
              if (_rcp) {
                if (!byMonthClientCAByCanal[_midxBMC]['MAGASIN_PREL']) byMonthClientCAByCanal[_midxBMC]['MAGASIN_PREL'] = {};
                byMonthClientCAByCanal[_midxBMC]['MAGASIN_PREL'][_ccBMC] = (byMonthClientCAByCanal[_midxBMC]['MAGASIN_PREL'][_ccBMC] || 0) + _rcp;
              }
              if (_rce) {
                if (!byMonthClientCAByCanal[_midxBMC]['MAGASIN_ENL']) byMonthClientCAByCanal[_midxBMC]['MAGASIN_ENL'] = {};
                byMonthClientCAByCanal[_midxBMC]['MAGASIN_ENL'][_ccBMC] = (byMonthClientCAByCanal[_midxBMC]['MAGASIN_ENL'][_ccBMC] || 0) + _rce;
              }
            }
          }
        }
      }

      // _tempCAAll (période filtrée, tous canaux)
      if (!lowMem && !(periodFilterStart && dateV && dateV < periodFilterStart) && !(periodFilterEnd && dateV && dateV > periodFilterEnd)) {
        var _ccA = extractClientCode(_rc);
        var _codeA = cleanCode(_ra);
        var _skA = _rs;
        if (_ccA && _codeA && (!selectedStore || _skA === 'INCONNU' || _skA === selectedStore)) {
          var _caAT = _rcp + _rce;
          if (_caAT > 0) {
            if (!_tempCAAll.has(_ccA)) _tempCAAll.set(_ccA, new Map());
            var _amA = _tempCAAll.get(_ccA);
            _amA.set(_codeA, (_amA.get(_codeA) || 0) + _caAT);
          }
        }
      }

      // _tempCAAllFull (pleine période)
      if (!lowMem) {
        var _ccAF = extractClientCode(_rc);
        var _codeAF = cleanCode(_ra);
        if (_ccAF && _codeAF && (!selectedStore || _rs === 'INCONNU' || _rs === selectedStore)) {
          var _caAF = _rcp + _rce;
          if (_caAF > 0) {
            if (!_tempCAAllFull.has(_ccAF)) _tempCAAllFull.set(_ccAF, new Map());
            var _amAF = _tempCAAllFull.get(_ccAF);
            _amAF.set(_codeAF, (_amAF.get(_codeAF) || 0) + _caAF);
          }
        }
      }

      // clientNomLookup (all canals)
      if (!lowMem) {
        var _ccNom = extractClientCode(_rc);
        if (_ccNom && !clientNomLookup[_ccNom]) {
          var _di = _rc.indexOf(' - ');
          if (_di >= 0) clientNomLookup[_ccNom] = _rc.slice(_di + 3).trim();
        }
      }

      // Canaux hors MAGASIN
      if (storesIntersection.size > 0 ? canal !== 'MAGASIN' : canal !== '' && canal !== 'MAGASIN') {
        if (lowMem) continue; // mode mobile: ignorer hors-magasin pour limiter mémoire/CPU
        if (canal) {
          var codeArt_h = cleanCode(_ra);
          var caLigne_h = _rcp + _rce;
          var skHors = _rs;
          // byMonthStoreArtCanal + byMonthStoreClients — AVANT filtre période : toutes les lignes, tous les mois
          var _cc_bm_h = extractClientCode(_rc);
          if (codeArt_h && dateV && (skHors === 'INCONNU' || storesIntersection.has(skHors) || !storesIntersection.size)) {
            var _storeKey_bm = skHors === 'INCONNU' ? (selectedStore || skHors) : skHors;
            var _midx_h = dateV.getFullYear() * 12 + dateV.getMonth();
            // byMonthStoreClients
            if (_cc_bm_h) {
              if (!byMonthStoreClients[_storeKey_bm]) byMonthStoreClients[_storeKey_bm] = {};
              if (!byMonthStoreClients[_storeKey_bm][_midx_h]) byMonthStoreClients[_storeKey_bm][_midx_h] = new Set();
              byMonthStoreClients[_storeKey_bm][_midx_h].add(_cc_bm_h);
              // byMonthStoreClientCA — CA mensuel par client par store
              if (caLigne_h > 0) {
                if (!byMonthStoreClientCA[_storeKey_bm]) byMonthStoreClientCA[_storeKey_bm] = {};
                if (!byMonthStoreClientCA[_storeKey_bm][_midx_h]) byMonthStoreClientCA[_storeKey_bm][_midx_h] = {};
                byMonthStoreClientCA[_storeKey_bm][_midx_h][_cc_bm_h] = (byMonthStoreClientCA[_storeKey_bm][_midx_h][_cc_bm_h] || 0) + caLigne_h;
              }
            }
            if (!byMonthStoreArtCanal[_storeKey_bm]) byMonthStoreArtCanal[_storeKey_bm] = {};
            if (!byMonthStoreArtCanal[_storeKey_bm][canal]) byMonthStoreArtCanal[_storeKey_bm][canal] = {};
            if (!byMonthStoreArtCanal[_storeKey_bm][canal][codeArt_h]) byMonthStoreArtCanal[_storeKey_bm][canal][codeArt_h] = {};
            var _bmsac_h = byMonthStoreArtCanal[_storeKey_bm][canal][codeArt_h];
            if (!_bmsac_h[_midx_h]) _bmsac_h[_midx_h] = { sumCA: 0, sumPrelevee: 0, countBL: 0, sumVMB: 0, sumVMBPrel: 0, sumQteP: 0 };
            var _bme_h = _bmsac_h[_midx_h];
            _bme_h.sumCA += caLigne_h;
            _bme_h.sumPrelevee += _rcp;
            if (_rqp > 0) _bme_h.sumQteP += _rqp;
            _bme_h.countBL++;
            _bme_h.sumVMB += _rvp + _rve;
            _bme_h.sumVMBPrel += _rvp;
          }
          // caClientParStore hors-MAGASIN — AVANT filtre période
          if (_cc_bm_h && codeArt_h && caLigne_h > 0) {
            var _skCps_h = skHors === 'INCONNU' ? (selectedStore || skHors) : skHors;
            if (!caClientParStore[_skCps_h]) caClientParStore[_skCps_h] = new Map();
            caClientParStore[_skCps_h].set(_cc_bm_h, (caClientParStore[_skCps_h].get(_cc_bm_h) || 0) + caLigne_h);
          }
          // ventesReseauTousCanaux — hors-MAGASIN (pleine période, toutes agences)
          if (_cc_bm_h && codeArt_h && /^\d{6}$/.test(codeArt_h)) {
            if (!ventesReseauTousCanaux.has(_cc_bm_h)) ventesReseauTousCanaux.set(_cc_bm_h, new Map());
            var _arR_h = ventesReseauTousCanaux.get(_cc_bm_h);
            if (!_arR_h.has(codeArt_h)) _arR_h.set(codeArt_h, { sumCA: 0, countBL: 0 });
            var _eR_h = _arR_h.get(codeArt_h);
            _eR_h.sumCA += caLigne_h;
            _eR_h.countBL++;
          }
          // byMonthFull hors-MAGASIN — accumulation mensuelle TOUS canaux, myStore
          var _skBmf = skHors === 'INCONNU' ? (selectedStore || skHors) : skHors;
          if (_cc_bm_h && codeArt_h && dateV && caLigne_h > 0 && (!selectedStore || _skBmf === selectedStore)) {
            var _midxBmf = dateV.getFullYear() * 12 + dateV.getMonth();
            if (!byMonthFull[_cc_bm_h]) byMonthFull[_cc_bm_h] = {};
            if (!byMonthFull[_cc_bm_h][codeArt_h]) byMonthFull[_cc_bm_h][codeArt_h] = {};
            if (!byMonthFull[_cc_bm_h][codeArt_h][_midxBmf]) byMonthFull[_cc_bm_h][codeArt_h][_midxBmf] = { sumCA: 0 };
            byMonthFull[_cc_bm_h][codeArt_h][_midxBmf].sumCA += caLigne_h;
          }
          // Filtre période — le reste est period-sensitive
          if (periodFilterStart && dateV && dateV < periodFilterStart) continue;
          if (periodFilterEnd && dateV && dateV > periodFilterEnd) continue;
          var cc_h = extractClientCode(_rc);
          var qteLigne_h = _rqp + _rqe;
          if (cc_h && codeArt_h && (!selectedStore || skHors === 'INCONNU' || skHors === selectedStore)) {
            cannauxHorsMagasin.add(canal);
            var hm = ventesLocalHorsMag.get(cc_h) || new Map();
            var ex_h = hm.get(codeArt_h) || { sumCA: 0, sumPrelevee: 0, sumCAPrelevee: 0, sumCAP: 0, sumCAE: 0, countBL: 0, canal: canal };
            ex_h.sumCA += caLigne_h;
            ex_h.sumPrelevee += qteLigne_h;
            ex_h.sumCAPrelevee += caLigne_h;
            ex_h.sumCAP += _rcp;
            ex_h.sumCAE += _rce;
            ex_h.countBL++;
            hm.set(codeArt_h, ex_h);
            ventesLocalHorsMag.set(cc_h, hm);
          }
          // ventesClientsPerStore — hors-MAGASIN (period-filtered)
          if (_cc_bm_h && codeArt_h) {
            var _skCli_h = skHors === 'INCONNU' ? (selectedStore || skHors) : skHors;
            if (!ventesClientsPerStore[_skCli_h]) ventesClientsPerStore[_skCli_h] = new Set();
            ventesClientsPerStore[_skCli_h].add(_cc_bm_h);
            // clientsByStoreUnivers — hors-MAGASIN
            var _uvH = articleUnivers[codeArt_h] || '';
            if (!_uvH) { var _fH = articleFamille[codeArt_h] || ''; if (_fH) _uvH = FAM_LETTER_UNIVERS[_fH[0].toUpperCase()] || ''; }
            if (_uvH) {
              if (!clientsByStoreUnivers[_skCli_h]) clientsByStoreUnivers[_skCli_h] = {};
              if (!clientsByStoreUnivers[_skCli_h][_uvH]) clientsByStoreUnivers[_skCli_h][_uvH] = new Set();
              clientsByStoreUnivers[_skCli_h][_uvH].add(_cc_bm_h);
            } else if (codeArt_h) {
              _cbuDeferred.push({ store: _skCli_h, cc: _cc_bm_h, code: codeArt_h });
            }
          }
          // ventesParAgenceByCanal
          if (codeArt_h && (skHors === 'INCONNU' || storesIntersection.has(skHors) || !storesIntersection.size)) {
            var _storeKey_h = skHors === 'INCONNU' ? (selectedStore || skHors) : skHors;
            if (!ventesParAgenceByCanal[_storeKey_h]) ventesParAgenceByCanal[_storeKey_h] = {};
            if (!ventesParAgenceByCanal[_storeKey_h][canal]) ventesParAgenceByCanal[_storeKey_h][canal] = {};
            if (!ventesParAgenceByCanal[_storeKey_h][canal][codeArt_h]) ventesParAgenceByCanal[_storeKey_h][canal][codeArt_h] = { sumCA: 0, sumPrelevee: 0, countBL: 0, sumVMB: 0, sumVMBPrel: 0 };
            var _vpmc_h = ventesParAgenceByCanal[_storeKey_h][canal][codeArt_h];
            _vpmc_h.sumCA += caLigne_h;
            _vpmc_h.sumPrelevee += _rcp;
            _vpmc_h.countBL++;
            _vpmc_h.sumVMB += _rvp + _rve;
            _vpmc_h.sumVMBPrel += _rvp;
            // ventesParAgence — accumuler hors-MAGASIN aussi (cohérence tous canaux)
            if (!ventesParAgence[_storeKey_h]) ventesParAgence[_storeKey_h] = {};
            if (!ventesParAgence[_storeKey_h][codeArt_h]) ventesParAgence[_storeKey_h][codeArt_h] = { sumPrelevee: 0, sumEnleve: 0, sumCA: 0, countBL: 0, sumVMB: 0 };
            ventesParAgence[_storeKey_h][codeArt_h].sumCA += caLigne_h;
            if (_rqp > 0) ventesParAgence[_storeKey_h][codeArt_h].sumPrelevee += _rqp;
            if (_rqe > 0) ventesParAgence[_storeKey_h][codeArt_h].sumEnleve += _rqe;
            ventesParAgence[_storeKey_h][codeArt_h].countBL++;
            ventesParAgence[_storeKey_h][codeArt_h].sumVMB += _rvp + _rve;
            // byCanal hors-MAGASIN (pour % comptoir dans Plan)
            if (!lowMem && canal) {
              var _bckH = ventesParAgence[_storeKey_h][codeArt_h];
              if (!_bckH.byCanal) _bckH.byCanal = {};
              if (!_bckH.byCanal[canal]) _bckH.byCanal[canal] = { sumPrelevee: 0, sumCA: 0, countBL: 0, sumVMB: 0 };
              var _bcH = _bckH.byCanal[canal];
              _bcH.sumCA += caLigne_h;
              if (_rqp > 0) _bcH.sumPrelevee += _rqp;
              _bcH.countBL++;
              _bcH.sumVMB += _rvp + _rve;
            }
          }
          // commandesPerStoreCanal — hors-MAGASIN
          if (_rncb) {
            if (!commandesPerStoreCanal[skHors]) commandesPerStoreCanal[skHors] = {};
            if (!commandesPerStoreCanal[skHors][canal]) commandesPerStoreCanal[skHors][canal] = new Set();
            commandesPerStoreCanal[skHors][canal].add(_rncb);
          }
          // ventesClientAutresAgences — CA client dans autres agences (hors-MAGASIN)
          if (_cc_bm_h && codeArt_h && selectedStore && skHors !== 'INCONNU' && skHors !== selectedStore) {
            var _caAutH = _rcp + _rce;
            if (_caAutH > 0) ventesClientAutresAgences.set(_cc_bm_h, (ventesClientAutresAgences.get(_cc_bm_h) || 0) + _caAutH);
          }
        }
        continue;
      }

      // MAGASIN lines
      var rawArt = _ra;
      var code = cleanCode(rawArt);
      var qteP = _rqp, qteE = _rqe, caP = _rcp, caE = _rce, sk = _rs;

      if (code && !libelleLookup[code]) {
        var si2 = rawArt.indexOf(' - ');
        if (si2 > 0) libelleLookup[code] = rawArt.substring(si2 + 3).trim();
      }

      // famille / univers
      var famConso = ((CI.famille !== null ? (row[CI.famille] != null ? row[CI.famille] : '') : '') || (CI.univers !== null ? (row[CI.univers] != null ? row[CI.univers] : '') : '') || '').toString().trim();
      var _codeFamConso = (CI.codeFam !== null ? (row[CI.codeFam] != null ? row[CI.codeFam] : '') : '').toString().trim();
      var _famCode = _codeFamConso || extractFamCode(famConso);
      // Ne stocker dans articleFamille que les vrais codes (L01, 03, A12…) — pas les libellés univers
      var _famCodeValid = _famCode && /^[A-Z]?\d{2,3}$/.test(_famCode);
      if (_famCodeValid && code) articleFamille[code] = _famCode;
      var _uv2 = (CI.univers !== null ? (row[CI.univers] != null ? row[CI.univers] : '') : '').toString().trim();
      // Priorité : FAM_LETTER_UNIVERS via code famille (canonique) > colonne Univers normalisée > brut
      var _uvCanon = _famCodeValid ? (FAM_LETTER_UNIVERS[_famCode[0].toUpperCase()] || '') : '';
      if (!_uvCanon && _uv2) _uvCanon = _UNIVERS_CANONICAL[_uv2.toLowerCase()] || _uv2;
      if (!_uvCanon && famConso && !_famCodeValid) _uvCanon = _UNIVERS_CANONICAL[famConso.toLowerCase()] || '';
      var univConso = _uvCanon;
      if (univConso && code) articleUnivers[code] = univConso;

      if (dateV) {
        var tsD = dateV.getTime();
        if (tsD < minDateVente) minDateVente = tsD;
        if (tsD > maxDateVente) maxDateVente = tsD;
      }

      // articleRaw (W/V/MIN/MAX — hoisted, no period filter)
      var cc2 = extractClientCode(_rc);
      // clientsByStoreUnivers — store × client × univers (tous canaux, pleine période 12MG)
      var _univBU = univConso;
      if (!_univBU && code) { var _fBU = articleFamille[code] || ''; if (_fBU) _univBU = FAM_LETTER_UNIVERS[_fBU[0].toUpperCase()] || ''; }
      if (_univBU && cc2 && sk && (caP > 0 || caE > 0)) {
        var _skBU = sk === 'INCONNU' ? (selectedStore || sk) : sk;
        if (!clientsByStoreUnivers[_skBU]) clientsByStoreUnivers[_skBU] = {};
        if (!clientsByStoreUnivers[_skBU][_univBU]) clientsByStoreUnivers[_skBU][_univBU] = new Set();
        clientsByStoreUnivers[_skBU][_univBU].add(cc2);
      } else if (!_univBU && cc2 && sk && code && (caP > 0 || caE > 0)) {
        _cbuDeferred.push({ store: sk === 'INCONNU' ? (selectedStore || sk) : sk, cc: cc2, code: code });
      }
      var nc = (_hasCommandeCol ? (_rncb || '') : ('__r' + i)).toString().trim() || ('__r' + i);
      if (dateV && code && (!selectedStore || sk === selectedStore) && qteP > 0) {
        if (!monthlySales[code]) monthlySales[code] = new Array(12).fill(0);
        monthlySales[code][dateV.getMonth()] += qteP;
      }
      // Réseau : toutes agences (pour seasonalIndexReseau)
      // LowMem : seasonalIndexReseau n'est pas sérialisé → inutile d'accumuler.
      if (!lowMem && dateV && code && qteP > 0) {
        if (!monthlySalesReseau[code]) monthlySalesReseau[code] = new Array(12).fill(0);
        monthlySalesReseau[code][dateV.getMonth()] += qteP;
      }
      if (!useMulti || sk === selectedStore) {
        if (!articleRaw[code]) articleRaw[code] = { tpp: 0, tpn: 0, te: 0, bls: {}, cbl: 0 };
        var a = articleRaw[code];
        if (qteP > 0) a.tpp += qteP;
        if (qteP < 0) a.tpn += qteP;
        if (qteE > 0) a.te += qteE;
        if (!a.bls[nc]) { a.bls[nc] = { p: Math.max(qteP, 0), e: Math.max(qteE, 0) }; a.cbl++; }
        else { var ex_r = a.bls[nc]; if (Math.max(qteP, 0) > ex_r.p) ex_r.p = Math.max(qteP, 0); if (Math.max(qteE, 0) > ex_r.e) ex_r.e = Math.max(qteE, 0); }
      }

      // ventesLocalMag12MG (pleine période, MAGASIN, myStore only)
      if (!lowMem && cc2 && code && (!selectedStore || sk === selectedStore)) {
        if (!ventesLocalMag12MG.has(cc2)) ventesLocalMag12MG.set(cc2, new Map());
        var _artF = ventesLocalMag12MG.get(cc2);
        if (!_artF.has(code)) _artF.set(code, { sumPrelevee: 0, sumCAPrelevee: 0, sumCA: 0, sumCAAll: 0, countBL: 0 });
        var _eF = _artF.get(code);
        if (qteP > 0) { _eF.sumPrelevee += qteP; _eF.sumCAPrelevee += caP; }
        _eF.sumCA += caP + caE;
        if (qteP > 0 || qteE > 0) _eF.countBL++;
      }

      // articleClientsFull — pleine période, hoisté hors filtre période (pour squelette invariant)
      if (cc2 && code && (!selectedStore || sk === selectedStore)) {
        var codeClientFull = extractClientCode(_rc);
        if (codeClientFull) {
          if (!articleClientsFull.has(code)) articleClientsFull.set(code, new Set());
          articleClientsFull.get(code).add(codeClientFull);
        }
      }

      // byMonth — accumulation mensuelle pleine période pour filtre instantané (MAGASIN, myStore)
      if (!lowMem && dateV && cc2 && code && canal === 'MAGASIN' && (!selectedStore || sk === selectedStore)) {
        var _monthIdx = dateV.getFullYear() * 12 + dateV.getMonth();
        if (!byMonth[cc2]) byMonth[cc2] = {};
        if (!byMonth[cc2][code]) byMonth[cc2][code] = {};
        var _bm = byMonth[cc2][code];
        if (!_bm[_monthIdx]) _bm[_monthIdx] = { sumCA: 0, sumPrelevee: 0, countBL: 0, sumVMB: 0, sumVMBP: 0, sumCAPrelevee: 0 };
        var _bme = _bm[_monthIdx];
        _bme.sumCA += caP + caE;
        if (qteP > 0) { _bme.sumPrelevee += qteP; _bme.sumCAPrelevee += caP; }
        if (qteP > 0 || qteE > 0) _bme.countBL++;
        _bme.sumVMB += _rvp + _rve;
        _bme.sumVMBP += _rvp;
      }

      // byMonthFull — accumulation mensuelle TOUS canaux, myStore, pour captation Livraisons
      if (!lowMem && dateV && cc2 && code && (!selectedStore || sk === selectedStore)) {
        var _monthIdxF = dateV.getFullYear() * 12 + dateV.getMonth();
        if (!byMonthFull[cc2]) byMonthFull[cc2] = {};
        if (!byMonthFull[cc2][code]) byMonthFull[cc2][code] = {};
        if (!byMonthFull[cc2][code][_monthIdxF]) byMonthFull[cc2][code][_monthIdxF] = { sumCA: 0 };
        byMonthFull[cc2][code][_monthIdxF].sumCA += caP + caE;
      }

      // caClientParStore — TOUS canaux, PAS de filtre période, par store × client
      if (!lowMem && cc2 && code) {
        var _ccaS = caP + caE;
        if (_ccaS > 0) {
          if (!caClientParStore[sk]) caClientParStore[sk] = new Map();
          caClientParStore[sk].set(cc2, (caClientParStore[sk].get(cc2) || 0) + _ccaS);
        }
      }

      // ventesParAgence (PAS de filtre période — cohérent avec articleRaw)
      if (storesIntersection.has(sk) || !storesIntersection.size) {
        if (!ventesParAgence[sk]) ventesParAgence[sk] = {};
        if (!ventesParAgence[sk][code]) ventesParAgence[sk][code] = { sumPrelevee: 0, sumEnleve: 0, sumCA: 0, countBL: 0, sumVMB: 0 };
        if (qteP > 0) ventesParAgence[sk][code].sumPrelevee += qteP;
        if (qteE > 0) ventesParAgence[sk][code].sumEnleve += qteE;
        ventesParAgence[sk][code].sumCA += caP + caE;
        if (qteP > 0 || qteE > 0) ventesParAgence[sk][code].countBL++;
        ventesParAgence[sk][code].sumVMB += _rvp + _rve;
        if (!lowMem && canal) {
          var _bck = ventesParAgence[sk][code];
          if (!_bck.byCanal) _bck.byCanal = {};
          if (!_bck.byCanal[canal]) _bck.byCanal[canal] = { sumPrelevee: 0, sumCA: 0, countBL: 0, sumVMB: 0 };
          var _bc = _bck.byCanal[canal];
          if (qteP > 0) _bc.sumPrelevee += qteP;
          _bc.sumCA += caP + caE;
          if (qteP > 0 || qteE > 0) _bc.countBL++;
          _bc.sumVMB += _rvp + _rve;
        }
        if (!lowMem && code && (!canal || canal === 'MAGASIN')) {
          var _canalKey = 'MAGASIN';
          if (!ventesParAgenceByCanal[sk]) ventesParAgenceByCanal[sk] = {};
          if (!ventesParAgenceByCanal[sk][_canalKey]) ventesParAgenceByCanal[sk][_canalKey] = {};
          if (!ventesParAgenceByCanal[sk][_canalKey][code]) ventesParAgenceByCanal[sk][_canalKey][code] = { sumCA: 0, sumPrelevee: 0, countBL: 0, sumVMB: 0, sumVMBPrel: 0 };
          var _vpmc2 = ventesParAgenceByCanal[sk][_canalKey][code];
          _vpmc2.sumCA += caP + caE;
          _vpmc2.sumPrelevee += caP;
          if (qteP > 0 || qteE > 0) _vpmc2.countBL++;
          _vpmc2.sumVMB += _rvp + _rve;
          _vpmc2.sumVMBPrel += _rvp;
          // byMonthStoreArtCanal MAGASIN — accumulation mensuelle pour rebuild période
          if (dateV) {
            var _midx_m = dateV.getFullYear() * 12 + dateV.getMonth();
            if (!byMonthStoreArtCanal[sk]) byMonthStoreArtCanal[sk] = {};
            if (!byMonthStoreArtCanal[sk][_canalKey]) byMonthStoreArtCanal[sk][_canalKey] = {};
            if (!byMonthStoreArtCanal[sk][_canalKey][code]) byMonthStoreArtCanal[sk][_canalKey][code] = {};
            var _bmsac_m = byMonthStoreArtCanal[sk][_canalKey][code];
            if (!_bmsac_m[_midx_m]) _bmsac_m[_midx_m] = { sumCA: 0, sumPrelevee: 0, countBL: 0, sumVMB: 0, sumVMBPrel: 0, sumQteP: 0 };
            var _bme_m = _bmsac_m[_midx_m];
            _bme_m.sumCA += caP + caE;
            _bme_m.sumPrelevee += caP;
            if (qteP > 0) _bme_m.sumQteP += qteP;
            if (qteP > 0 || qteE > 0) _bme_m.countBL++;
            _bme_m.sumVMB += _rvp + _rve;
            _bme_m.sumVMBPrel += _rvp;
          }
        }
        // byMonthStoreClients MAGASIN
        if (!lowMem && cc2 && dateV) {
          var _midx_cl = dateV.getFullYear() * 12 + dateV.getMonth();
          if (!byMonthStoreClients[sk]) byMonthStoreClients[sk] = {};
          if (!byMonthStoreClients[sk][_midx_cl]) byMonthStoreClients[sk][_midx_cl] = new Set();
          byMonthStoreClients[sk][_midx_cl].add(cc2);
          // byMonthStoreClientCA MAGASIN — CA mensuel par client par store
          var _ccaM = caP + caE;
          if (_ccaM > 0) {
            if (!byMonthStoreClientCA[sk]) byMonthStoreClientCA[sk] = {};
            if (!byMonthStoreClientCA[sk][_midx_cl]) byMonthStoreClientCA[sk][_midx_cl] = {};
            byMonthStoreClientCA[sk][_midx_cl][cc2] = (byMonthStoreClientCA[sk][_midx_cl][cc2] || 0) + _ccaM;
          }
        }
      }

      // Filtre période (s'applique aux agrégats client/temps en aval)
      if (periodFilterStart && dateV && dateV < periodFilterStart) continue;
      if (periodFilterEnd && dateV && dateV > periodFilterEnd) continue;

      if (!lowMem) {
      // ventesClientsPerStore + clientsMagasin (caClientParStore déplacé avant filtre période)
      if (cc2 && code) {
        if (!ventesClientsPerStore[sk]) ventesClientsPerStore[sk] = new Set();
        ventesClientsPerStore[sk].add(cc2);
      }
      // commandesPerStoreCanal : N° commande (ou BL) uniques par store × canal
      if (_rncb) {
        var _canalCmd = canal || 'MAGASIN';
        if (!commandesPerStoreCanal[sk]) commandesPerStoreCanal[sk] = {};
        if (!commandesPerStoreCanal[sk][_canalCmd]) commandesPerStoreCanal[sk][_canalCmd] = new Set();
        commandesPerStoreCanal[sk][_canalCmd].add(_rncb);
      }
      if (cc2 && (!selectedStore || sk === selectedStore)) {
        clientsMagasin.add(cc2);
        var _nc4m = _rncb || ('__row_' + i);
        if (!_clientMagasinBLsTemp.has(cc2)) _clientMagasinBLsTemp.set(cc2, new Set());
        _clientMagasinBLsTemp.get(cc2).add(_nc4m);
      }

      // ventesLocalMagPeriode (MAGASIN, myStore, période filtrée)
      if (cc2 && code && (!selectedStore || sk === selectedStore)) {
        if (!ventesLocalMagPeriode.has(cc2)) ventesLocalMagPeriode.set(cc2, new Map());
        var artMap = ventesLocalMagPeriode.get(cc2);
        if (!artMap.has(code)) artMap.set(code, { sumPrelevee: 0, sumCAPrelevee: 0, sumCA: 0, sumCAAll: 0, countBL: 0 });
        var e_vca = artMap.get(code);
        if (qteP > 0) { e_vca.sumPrelevee += qteP; e_vca.sumCAPrelevee += caP; }
        e_vca.sumCA += caP + caE;
        if (qteP > 0 || qteE > 0) e_vca.countBL++;
      }

      // ventesReseauTousCanaux — TOUTES agences (pour Tronc Commun Réseau)
      if (cc2 && code) {
        if (!ventesReseauTousCanaux.has(cc2)) ventesReseauTousCanaux.set(cc2, new Map());
        var artMapR = ventesReseauTousCanaux.get(cc2);
        if (!artMapR.has(code)) artMapR.set(code, { sumCA: 0, countBL: 0 });
        var eR = artMapR.get(code);
        eR.sumCA += caP + caE;
        if (qteP > 0 || qteE > 0) eR.countBL++;
      }

      // ventesClientAutresAgences — CA client dans autres agences (MAGASIN)
      if (cc2 && code && selectedStore && sk !== 'INCONNU' && sk !== selectedStore) {
        var _caAutM = caP + caE;
        if (_caAutM > 0) ventesClientAutresAgences.set(cc2, (ventesClientAutresAgences.get(cc2) || 0) + _caAutM);
      }

      // commandesPDV + passagesUniques
      if (!selectedStore || sk === selectedStore) {
        if (_rnc || _rbl2) commandesPDV.add(_rnc || _rbl2);
        if ((qteP > 0 || qteE > 0) && cc2 && dateV && !isNaN(dateV.getTime())) {
          passagesUniques.add(cc2 + '_' + formatLocalYMD(dateV));
        }
      }

      // clientLastOrder peuplé avant le filtre période (ligne ~615) — period-independent

      // articleClients + clientArticles
      var codeClient = extractClientCode(_rc);
      if (codeClient && code) {
        if (!articleClients.has(code)) articleClients.set(code, new Set());
        articleClients.get(code).add(codeClient);
        if (!clientArticles.has(codeClient)) clientArticles.set(codeClient, new Set());
        clientArticles.get(codeClient).add(code);
      }

      // blData
      if (!useMulti || sk === selectedStore) {
        if (qteP > 0 || qteE > 0) {
          var blNum = nc;
          if (!blData[blNum]) blData[blNum] = { codes: new Set(), familles: new Set() };
          blData[blNum].codes.add(code);
          if (_famCode) blData[blNum].familles.add(famLib(_famCode));
          if (qteP > 0) blPreleveeSet.add(blNum);
        }
      }
      } // end !lowMem

      if (i % 50000 === 0 && i > 0) {
        self.postMessage({ type: 'progress', pct: 35 + Math.round(i / totalRows * 25), msg: 'Ventes ' + Math.round(i / totalRows * 100) + '%…' });
      }
    } // end boucle consommé

    // Optionnels (gros) — ignorés en mode lowMem (mobile) pour éviter crashes mémoire.
    var blDataSer = {};
    var ventesAnalysis = { refParBL: 0, famParBL: 0, totalBL: 0, refActives: 0, attractivite: {}, nbPassages: 0, txMarge: null, vmc: null };
    if (!lowMem) {
      // ── Fusion sumCAAll ────────────────────────────────────────────────
      _tempCAAll.forEach(function(_arts, _cc) {
        if (!ventesLocalMagPeriode.has(_cc)) return;
        var _cMap = ventesLocalMagPeriode.get(_cc);
        _arts.forEach(function(_ca, _code) {
          var _e = _cMap.get(_code);
          if (_e) _e.sumCAAll += _ca;
        });
      });
      _tempCAAllFull.forEach(function(_arts, _cc) {
        if (!ventesLocalMag12MG.has(_cc)) return;
        var _cMap = ventesLocalMag12MG.get(_cc);
        _arts.forEach(function(_ca, _code) {
          var _e = _cMap.get(_code);
          if (_e) _e.sumCAAll += _ca;
        });
      });

      // ── Build blCanalMap + convert canalAgence bl sets ─────────────────
      for (var canalKey in canalAgence) {
        var cdata = canalAgence[canalKey];
        if (cdata.bl instanceof Set) {
          cdata.bl.forEach(function(bl) { blCanalMap.set(bl, canalKey); });
        }
        if (cdata.blNums instanceof Set) {
          cdata.blNums.forEach(function(bl) { blCanalMap.set(bl, canalKey); });
        }
      }
      for (var ck in canalAgence) {
        canalAgence[ck].bl = canalAgence[ck].bl.size;
        delete canalAgence[ck].blNums;
      }
      // Convertir les Sets _cmds de byMonthCanal en counts avant sérialisation
      for (var _bmsk in byMonthCanal) {
        for (var _bmc in byMonthCanal[_bmsk]) {
          for (var _bmmidx in byMonthCanal[_bmsk][_bmc]) {
            var _bme2 = byMonthCanal[_bmsk][_bmc][_bmmidx];
            _bme2.countBL = _bme2._cmds ? _bme2._cmds.size : 0;
            _bme2.countBLP = _bme2._cmdsP ? _bme2._cmdsP.size : 0;
            _bme2.countBLE = _bme2._cmdsE ? _bme2._cmdsE.size : 0;
            delete _bme2._cmds; delete _bme2._cmdsP; delete _bme2._cmdsE;
          }
        }
      }

      // ── clientsMagasinFreq ─────────────────────────────────────────────
      _clientMagasinBLsTemp.forEach(function(bls, cc) {
        clientsMagasinFreq.set(cc, bls.size);
      });

      // ── ventesAnalysis intermédiaire ───────────────────────────────────
      var totalBLs = Object.keys(blData).length;
      var sumRefParBL = 0, sumFamParBL = 0;
      var famBLcount = {};
      for (var blKey in blData) {
        var blEntry = blData[blKey];
        sumRefParBL += blEntry.codes.size;
        sumFamParBL += blEntry.familles.size;
        blEntry.familles.forEach(function(fam) { famBLcount[fam] = (famBLcount[fam] || 0) + 1; });
      }
      var _sd0 = ventesParAgence[selectedStore] || {};
      var _caCalc = Object.values(_sd0).reduce(function(s, v) { return s + (v.sumCA || 0); }, 0);
      var _vmbCalc = Object.values(_sd0).reduce(function(s, v) { return s + (v.sumVMB || 0); }, 0);
      ventesAnalysis = {
        refParBL: totalBLs > 0 ? (sumRefParBL / totalBLs).toFixed(1) : 0,
        famParBL: totalBLs > 0 ? (sumFamParBL / totalBLs).toFixed(1) : 0,
        totalBL: totalBLs,
        refActives: 0, // will be set after synth
        attractivite: famBLcount,
        nbPassages: passagesUniques.size,
        txMarge: _caCalc > 0 ? _vmbCalc / _caCalc * 100 : null,
        vmc: commandesPDV.size > 0 ? _caCalc / commandesPDV.size : null
      };

      // ── Enlevé mono-ligne : BL MAGASIN, 1 seul article, 100% enlevé ──
      var enleveSingleBL = {}; // code → count
      for (var blk in blData) {
        var _blE = blData[blk];
        if (_blE.codes.size !== 1) continue; // uniquement BL mono-article
        if (blPreleveeSet.has(blk)) continue; // a du prélevé → pas une rupture
        if (blCanalMap.get(blk) !== 'MAGASIN') continue; // uniquement canal MAGASIN
        var _singleCode = _blE.codes.values().next().value;
        enleveSingleBL[_singleCode] = (enleveSingleBL[_singleCode] || 0) + 1;
      }

      // ── blData: convert Sets to counts for serialization ───────────────
      for (var blk in blData) {
        blDataSer[blk] = { codesSize: blData[blk].codes.size, famillesSize: blData[blk].familles.size };
      }
    }

    // ── Period detection ──────────────────────────────────────────────────
    var joursOuvres = (minDateVente < Infinity && maxDateVente > 0)
      ? Math.max(Math.round(daysBetween(new Date(minDateVente), new Date(maxDateVente)) * (5 / 7)), 30)
      : 250;

    self.postMessage({ type: 'progress', pct: 62, msg: 'Analyse stock…' });

    // ── 6. Boucle stock ───────────────────────────────────────────────────
    // Build synth from articleRaw
    var synth = {};
    for (var artCode in articleRaw) {
      var art = articleRaw[artCode];
      var pNet = art.tpp + art.tpn;
      var isReg = (art.tpp > 0 && pNet <= 0);
      var maxP = 0, cntP = 0, sumP = 0;
      if (!isReg) {
        for (var blK in art.bls) {
          var bl = art.bls[blK];
          if (bl.p > 0) { if (bl.p > maxP) maxP = bl.p; sumP += bl.p; cntP++; }
        }
      }
      if (!isReg && sumP > 0 && pNet > 0 && pNet < sumP * 0.5) {
        var r2 = pNet / sumP; maxP = Math.round(maxP * r2); sumP = pNet;
      }
      synth[artCode] = { maxP: maxP, sumP: isReg ? 0 : Math.max(pNet, 0), sumE: art.te, cbl: art.cbl, cblP: isReg ? 0 : cntP };
    }
    ventesAnalysis.refActives = Object.values(synth).filter(function(s) { return s.sumP > 0 || s.sumE > 0; }).length;

    var finalData = [];
    var pushedCodes = new Set();
    var stockParMagasin = {};
    var NOW = new Date();

    if (dataS && dataS.length) {
      _resetColCache();
      // Pré-détection colonnes stock qty / valeur
      var _ks0 = Object.keys(dataS[0] || {});
      var _cSStk = _ks0.find(function(k) {
        var lk = k.toLowerCase();
        return (lk.includes('stock') || lk.includes('qt') || lk.includes('quant')) &&
               !lk.includes('min') && !lk.includes('max') && !lk.includes('valeur') &&
               !lk.includes('alerte') && !lk.includes('statut');
      });
      var _cSValS = _ks0.find(function(k) {
        var lk = k.toLowerCase().replace(/[\r\n]/g, ' ');
        return lk.includes('valeur') && lk.includes('stock');
      });

      var colFamille = _ks0.find(function(k) { return k.toLowerCase() === 'famille'; }) ||
                       _ks0.find(function(k) { return k.toLowerCase().startsWith('famille'); });
      var colSousFamille = _ks0.find(function(k) { var l = k.toLowerCase(); return l.includes('sous') && l.includes('famille'); }) ||
                           _ks0.find(function(k) { return k.toLowerCase().startsWith('sous-famille'); });

      var _libelleFromConsomme = Object.assign({}, libelleLookup);
      libelleLookup = {};

      for (var si3 = 0; si3 < dataS.length; si3++) {
        var rowS = dataS[si3];
        var rawCodeS = getVal(rowS, 'Article', 'Code');
        if (!rawCodeS) continue;
        var storeCodeS = extractStoreCode(rowS);
        var codeS = cleanCode(rawCodeS);

        if (storeCodeS && (storesIntersection.has(storeCodeS) || !storesIntersection.size)) {
          if (!stockParMagasin[storeCodeS]) stockParMagasin[storeCodeS] = {};
          var _stkVal = _cSValS ? cleanPrice(rowS[_cSValS]) : null;
          var _kMin = parseFloat(getVal(rowS, 'min') || 0) || 0;
          var _kMax = parseFloat(getVal(rowS, 'max') || 0) || 0;
          var _statutSpm = (getVal(rowS, 'Statut') || '').toString().trim();
          stockParMagasin[storeCodeS][codeS] = { stockActuel: cleanPrice(_cSStk ? rowS[_cSStk] : 0), valeurStock: _stkVal, qteMin: _kMin, qteMax: _kMax, statut: _statutSpm };
        }

        if (!libelleLookup[codeS]) {
          var lib = rawCodeS.toString().substring(codeS.length + 3).trim() || (getVal(rowS, 'Libellé', 'Designation') || '').toString().trim();
          if (lib) libelleLookup[codeS] = lib;
        }

        if (selectedStore && storeCodeS && storeCodeS !== selectedStore) continue;

        var libelleS = libelleLookup[codeS] || codeS;
        var statutS = (getVal(rowS, 'Statut') || 'Inconnu').toString().trim();
        var _rawFamilleS = colFamille ? (rowS[colFamille] || '').toString().trim() : '';
        var familleS = (_rawFamilleS ? extractFamCode(_rawFamilleS) : null) || articleFamille[codeS] || 'Non Classé';
        var sousFamilleS = colSousFamille ? (rowS[colSousFamille] || '').toString().trim() : '';
        var rawEmpS = (getVal(rowS, 'Emplacement') || '').toString().trim();
        var emplacementS = (rawEmpS === '' || rawEmpS === '-') ? '' : rawEmpS;

        var stockActuelS = cleanPrice(_cSStk ? rowS[_cSStk] : 0);
        var valeurStockS = _cSValS ? cleanPrice(rowS[_cSValS]) : null;
        var prixUnitaireS = (valeurStockS !== null && stockActuelS !== 0)
          ? Math.abs(valeurStockS / stockActuelS)
          : (Math.abs(cleanPrice(getVal(rowS, 'Valeur', 'Prix'))) / (Math.abs(stockActuelS) || 1));

        var dateSortieS = parseExcelDate(getVal(rowS, 'dernière sortie', 'sortie'));
        var date1ereEntreeS = parseExcelDate(getVal(rowS, 'première entrée', 'premiere entree', 'première réception'));
        var dateEntreeS = parseExcelDate(getVal(rowS, 'dernière entrée', 'entrée'));
        var dateInactiviteS = dateSortieS || dateEntreeS || parseExcelDate(getVal(rowS, 'référencement', 'réf'));
        var ageJoursS = dateInactiviteS ? daysBetween(dateInactiviteS, NOW) : 999;
        var age1ereEntreeS = date1ereEntreeS ? daysBetween(date1ereEntreeS, NOW) : 999;
        var isNouveauteS = (age1ereEntreeS < NOUVEAUTE_DAYS) && (!dateSortieS || ageJoursS < 90);
        var ancienMinS = parseFloat(getVal(rowS, 'min') || 0);
        var ancienMaxS = parseFloat(getVal(rowS, 'max') || 0);
        var isParentS = isParentRef(rowS);

        var statsS = synth[codeS] || { maxP: 0, sumP: 0, sumE: 0, cbl: 0, cblP: 0 };
        var T = statsS.maxP, V = statsS.sumP, W = statsS.cbl, Wp = statsS.cblP;
        var U = Wp > 0 ? (V / Wp) : 0;
        var X = V / joursOuvres;
        var enleveTotalS = statsS.sumE;
        var nouveauMinS = 0, nouveauMaxS = 0;
        var cs = statutS.charAt(0);

        if (isNouveauteS) { nouveauMinS = ancienMinS; nouveauMaxS = ancienMaxS; }
        else if (['2', '3', '4'].includes(cs)) { nouveauMinS = 0; nouveauMaxS = 0; }
        else if (W <= 1) { nouveauMinS = 0; nouveauMaxS = 0; }
        else if (W === 2 && V > 0) { nouveauMinS = 1; nouveauMaxS = 2; }
        else if (V === 0) { nouveauMinS = 0; nouveauMaxS = 0; }
        else if (Wp === 0) { nouveauMinS = 0; nouveauMaxS = 0; }
        else {
          var dlR = (T > 3 * U) ? 3 * U : T;
          var dl = Math.min(dlR, U * 5);
          var secDays = Wp >= 12 ? 4 : Wp >= 4 ? 3 : (prixUnitaireS > HIGH_PRICE ? 1 : 2);
          nouveauMinS = Math.max(Math.min(Math.round(dl + (X * secDays)), Math.ceil(V / 6)), 1);
          if (nouveauMinS < 0) nouveauMinS = 0;
          if (nouveauMinS === 0) { nouveauMaxS = 0; }
          else {
            var df = Wp > 12 ? 21 : 10;
            var me = prixUnitaireS > HIGH_PRICE ? 0 : (Wp > 12 ? 3 : 1);
            nouveauMaxS = Math.max(Math.round(nouveauMinS + (X * df)), nouveauMinS + me);
          }
        }

        var couvertureJoursS = calcCouverture(stockActuelS, V, joursOuvres);

        if (pushedCodes.has(codeS)) continue;
        pushedCodes.add(codeS);

        finalData.push({
          code: codeS, libelle: libelleS, statut: statutS, famille: familleS,
          sousFamille: sousFamilleS, emplacement: emplacementS,
          W: W, V: V, stockActuel: stockActuelS, prixUnitaire: prixUnitaireS,
          valeurStock: valeurStockS, ancienMin: ancienMinS, ancienMax: ancienMaxS,
          nouveauMin: nouveauMinS, nouveauMax: nouveauMaxS,
          ageJours: ageJoursS, isNouveaute: isNouveauteS,
          enleveTotal: enleveTotalS, couvertureJours: couvertureJoursS, isParent: isParentS
        });

        if (si3 % 50000 === 0 && si3 > 0) {
          self.postMessage({ type: 'progress', pct: 62 + Math.round(si3 / dataS.length * 18), msg: 'Stock ' + Math.round(si3 / dataS.length * 100) + '%…' });
        }
      }

      // Merge libellé consommé pour les codes absents du stock
      for (var lk2 in _libelleFromConsomme) {
        if (!libelleLookup[lk2]) libelleLookup[lk2] = _libelleFromConsomme[lk2];
      }

      // Médiane réseau MIN/MAX (multi-agences)
      if (useMulti && finalData.length) {
        var _otherS = Array.from(storesIntersection).filter(function(s) { return s !== selectedStore; });
        if (_otherS.length) {
          for (var fdi = 0; fdi < finalData.length; fdi++) {
            var fdr = finalData[fdi];
            var _mins = _otherS.map(function(s) { return stockParMagasin[s] && stockParMagasin[s][fdr.code] ? stockParMagasin[s][fdr.code].qteMin : undefined; }).filter(function(v) { return v > 0; });
            var _maxs = _otherS.map(function(s) { return stockParMagasin[s] && stockParMagasin[s][fdr.code] ? stockParMagasin[s][fdr.code].qteMax : undefined; }).filter(function(v) { return v > 0; });
            fdr.medMinReseau = _mins.length ? _median(_mins) : null;
            fdr.medMaxReseau = _maxs.length ? _median(_maxs) : null;
          }
        }
      }

      // Fix: align articleFamille with stock famille (stock is master)
      for (var fdi2 = 0; fdi2 < finalData.length; fdi2++) {
        var fdr2 = finalData[fdi2];
        if (fdr2.famille && fdr2.famille !== 'Non Classé') articleFamille[fdr2.code] = fdr2.famille;
      }
    }

    // ── ABC/FMR ───────────────────────────────────────────────────────────
    self.postMessage({ type: 'progress', pct: 83, msg: 'ABC/FMR…' });
    var abcMatrixData = computeABCFMR(finalData);

    // ── caAnnuel ──────────────────────────────────────────────────────────
    // Full mode : depuis ventesLocalMagPeriode (MAGASIN).
    // LowMem mode : fallback depuis ventesParAgence (myStore) pour éviter les gros Maps clients.
    if (!lowMem) {
      var _caByCode = new Map();
      ventesLocalMagPeriode.forEach(function(artMap) {
        artMap.forEach(function(data2, code2) {
          _caByCode.set(code2, (_caByCode.get(code2) || 0) + (data2.sumCA || 0));
        });
      });
      for (var fdi3 = 0; fdi3 < finalData.length; fdi3++) {
        finalData[fdi3].caAnnuel = Math.round(_caByCode.get(finalData[fdi3].code) || 0);
      }
    } else {
      var _sdCA = ventesParAgence[selectedStore] || {};
      for (var fdi4 = 0; fdi4 < finalData.length; fdi4++) {
        var _c = finalData[fdi4].code;
        finalData[fdi4].caAnnuel = Math.round((_sdCA[_c] && _sdCA[_c].sumCA) || 0);
      }
    }

    // ── globalJoursOuvres ─────────────────────────────────────────────────
    var consommeMoisCouverts = (minDateVente < Infinity && maxDateVente > 0)
      ? Math.round(daysBetween(new Date(minDateVente), new Date(maxDateVente)) / 30.5) : 0;

    // ── clientsByStoreUnivers — second pass pour résolutions différées ────
    for (var di = 0; di < _cbuDeferred.length; di++) {
      var dr = _cbuDeferred[di];
      var _fDef = articleFamille[dr.code] || '';
      var _uDef = _fDef ? (FAM_LETTER_UNIVERS[_fDef[0].toUpperCase()] || '') : (articleUnivers[dr.code] || '');
      if (!_uDef) continue;
      if (!clientsByStoreUnivers[dr.store]) clientsByStoreUnivers[dr.store] = {};
      if (!clientsByStoreUnivers[dr.store][_uDef]) clientsByStoreUnivers[dr.store][_uDef] = new Set();
      clientsByStoreUnivers[dr.store][_uDef].add(dr.cc);
    }

    // ── Retourner les résultats ───────────────────────────────────────────
    self.postMessage({ type: 'progress', pct: 95, msg: 'Sérialisation…' });

    // seasonalIndexReseau : agrège monthlySalesReseau par famille → coefficients réseau
    var seasonalIndexReseau = {};
    if (!lowMem) {
      var famMonthlyReseau = {};
      for (var _srCode in monthlySalesReseau) {
        var _srFam = articleFamille[_srCode]; if (!_srFam) continue;
        if (!famMonthlyReseau[_srFam]) famMonthlyReseau[_srFam] = new Array(12).fill(0);
        var _srMonths = monthlySalesReseau[_srCode];
        for (var _srM = 0; _srM < 12; _srM++) famMonthlyReseau[_srFam][_srM] += _srMonths[_srM];
      }
      for (var _srFam2 in famMonthlyReseau) {
        var _srMths = famMonthlyReseau[_srFam2];
        var _srAvg = _srMths.reduce(function(s, v) { return s + v; }, 0) / 12;
        if (_srAvg <= 0) continue;
        seasonalIndexReseau[_srFam2] = _srMths.map(function(v) { return Math.round(v / _srAvg * 100) / 100; });
      }
    }

    // Serialize ventesClientsPerStore (Map de Sets → obj de arrays)
    var ventesClientsPerStoreSer = {};
    for (var vsk in ventesClientsPerStore) {
      ventesClientsPerStoreSer[vsk] = Array.from(ventesClientsPerStore[vsk]);
    }

    // Serialize caClientParStore (Map<cc,CA> → array of [cc,CA])
    var caClientParStoreSer = {};
    for (var csk2 in caClientParStore) {
      caClientParStoreSer[csk2] = Array.from(caClientParStore[csk2]);
    }

    // Serialize commandesPerStoreCanal ({store: {canal: Set}} → {store: {canal: array}})
    var commandesPerStoreCanalSer = {};
    for (var csk in commandesPerStoreCanal) {
      commandesPerStoreCanalSer[csk] = {};
      for (var cc in commandesPerStoreCanal[csk]) {
        commandesPerStoreCanalSer[csk][cc] = Array.from(commandesPerStoreCanal[csk][cc]);
      }
    }

    // Payload : full vs lowMem (mobile) — on réduit drastiquement le structured clone.
    var payload = {
      finalData: finalData,
      ventesParAgence: ventesParAgence,
      storesFoundC: Array.from(storesFoundC),
      storesFoundS: Array.from(storesFoundS),
      storesIntersection: Array.from(storesIntersection),
      hasCommandeCol: _hasCommandeCol,
      _resolvedStore: selectedStore,
      // Dates
      minDateVente: minDateVente < Infinity ? minDateVente : null,
      maxDateVente: maxDateVente > 0 ? maxDateVente : null,
      periodFilterStart: periodFilterStart ? periodFilterStart.getTime() : null,
      periodFilterEnd: periodFilterEnd ? periodFilterEnd.getTime() : null,
      joursOuvres: joursOuvres,
      consommeMoisCouverts: consommeMoisCouverts,
    };
    if (!lowMem) {
      payload.articleRaw = articleRaw;
      payload.monthlySales = monthlySales;
      payload.seasonalIndexReseau = seasonalIndexReseau;
      payload.ventesParAgenceByCanal = ventesParAgenceByCanal;
      payload.ventesClientsPerStore = ventesClientsPerStoreSer;
      // clientsByStoreUnivers — sérialiser Sets → Arrays
      var _cbuSer = {};
      for (var _skBU2 in clientsByStoreUnivers) {
        _cbuSer[_skBU2] = {};
        for (var _uvBU2 in clientsByStoreUnivers[_skBU2]) {
          _cbuSer[_skBU2][_uvBU2] = Array.from(clientsByStoreUnivers[_skBU2][_uvBU2]);
        }
      }
      payload.clientsByStoreUnivers = _cbuSer;
      payload.caClientParStore = caClientParStoreSer;
      payload.commandesPerStoreCanal = commandesPerStoreCanalSer;
      payload.clientNomLookup = clientNomLookup;
      payload.articleFamille = articleFamille;
      payload.articleUnivers = articleUnivers;
      payload.libelleLookup = libelleLookup;
      payload.canalAgence = canalAgence;
      payload.blData = blDataSer;
      payload.abcMatrixData = abcMatrixData;
      payload.stockParMagasin = stockParMagasin;
      payload.ventesAnalysis = ventesAnalysis;
      payload.headersC = headersC;
      // Maps sérialisées
      payload.ventesLocalMagPeriode = serMap(ventesLocalMagPeriode);
      payload.ventesLocalMag12MG = serMap(ventesLocalMag12MG);
      payload.ventesReseauTousCanaux = serMap(ventesReseauTousCanaux);
      payload.ventesLocalHorsMag = serMap(ventesLocalHorsMag);
      payload.clientLastOrder = Array.from(clientLastOrder).map(function(kv) { return [kv[0], kv[1] instanceof Date ? kv[1].getTime() : kv[1]]; });
      payload.clientLastOrderAll = Array.from(clientLastOrderAll).map(function(kv) { return [kv[0], { date: kv[1].date instanceof Date ? kv[1].date.getTime() : kv[1].date, canal: kv[1].canal }]; });
      payload.clientLastOrderByCanal = serMap(clientLastOrderByCanal);
      payload.clientArticles = serMap(clientArticles);
      payload.articleClients = serMap(articleClients);
      payload.articleClientsFull = serMap(articleClientsFull);
      payload.articleCanalCA = serMap(articleCanalCA);
      payload.blCanalMap = Array.from(blCanalMap);
      payload.clientsMagasin = Array.from(clientsMagasin);
      payload.clientsMagasinFreq = Array.from(clientsMagasinFreq);
      payload.cannauxHorsMagasin = Array.from(cannauxHorsMagasin);
      payload.blPreleveeSet = Array.from(blPreleveeSet);
      payload.enleveSingleBL = enleveSingleBL;
      payload.passagesUniques = Array.from(passagesUniques);
      payload.byMonth = byMonth;
      payload.byMonthFull = byMonthFull;
      payload.byMonthCanal = byMonthCanal;
      payload.byMonthStoreArtCanal = byMonthStoreArtCanal;
      payload.byMonthStoreClients = (function() { var o = {}; for (var sk in byMonthStoreClients) { o[sk] = {}; for (var mi in byMonthStoreClients[sk]) o[sk][mi] = Array.from(byMonthStoreClients[sk][mi]); } return o; })();
      payload.byMonthStoreClientCA = byMonthStoreClientCA; // plain objects, no serialization needed
      payload.byMonthClients = Object.fromEntries(Object.entries(byMonthClients).map(function(kv) { return [kv[0], Array.from(kv[1])]; }));
      payload.ventesClientAutresAgences = Array.from(ventesClientAutresAgences);
      payload.byMonthClientsByCanal = Object.fromEntries(Object.entries(byMonthClientsByCanal).map(function(kv) {
        var _cm = {};
        for (var _k in kv[1]) _cm[_k] = Array.from(kv[1][_k]);
        return [kv[0], _cm];
      }));
      payload.byMonthClientCAByCanal = byMonthClientCAByCanal;
    }
    self.postMessage({ type: 'done', payload: payload });

  } catch (err) {
    self.postMessage({ type: 'error', msg: err.message || 'Erreur parse-worker' });
  }
}

self.onmessage = async function(ev) {
  var data = ev.data || {};
  if (data.type === 'continue') return; // message tardif, ignorer

  // ── Streaming protocol ───────────────────────────────────────────────
  if (data.type === 'init') {
    _stream = {
      meta: {
        selectedStore: data.selectedStore || '',
        periodStart: data.periodStart || null,
        periodEnd: data.periodEnd || null,
        isRefilter: !!data.isRefilter,
        lowMem: !!data.lowMem,
      },
      dataC: null,
      dataS: [],
    };
    return;
  }
  if (data.type === 'consomme') {
    if (!_stream) { self.postMessage({ type: 'error', msg: 'Stream non initialisé' }); return; }
    try {
      var fname = (data.filename || '').toLowerCase();
      var isCsv = fname.endsWith('.csv');
      var idx = data.index || 0;
      var total = data.total || 1;
      var label = total > 1 ? ' (' + (idx + 1) + '/' + total + ')' : '';
      self.postMessage({ type: 'progress', pct: 10 + Math.round(8 * idx / Math.max(total, 1)), msg: 'Parsing consommé' + label + '…' });
      var parsed = isCsv ? _parseCsvBuffer(data.buf) : _parseXlsxBuffer(data.buf);
      _stream.dataC = _mergeConsomme(_stream.dataC, parsed);
      self.postMessage({ type: 'consomme_ack', index: idx });
    } catch (e) {
      self.postMessage({ type: 'error', msg: e.message || 'Erreur parsing consommé (stream)' });
    }
    return;
  }
  if (data.type === 'stock') {
    if (!_stream) { self.postMessage({ type: 'error', msg: 'Stream non initialisé' }); return; }
    try {
      self.postMessage({ type: 'progress', pct: 25, msg: 'Parsing stock XLSX…' });
      var wbS = XLSX.read(new Uint8Array(data.buf), {
        type: 'array', dense: true, cellDates: false,
        cellFormula: false, cellHTML: false, cellStyles: false
      });
      var rawS = _wsToHR(wbS.Sheets[wbS.SheetNames[0]]);
      _stream.dataS = readExcelAsObjects(rawS);
      self.postMessage({ type: 'stock_ack' });
    } catch (e2) {
      self.postMessage({ type: 'error', msg: e2.message || 'Erreur parsing stock (stream)' });
    }
    return;
  }
  if (data.type === 'start') {
    if (!_stream) { self.postMessage({ type: 'error', msg: 'Stream non initialisé' }); return; }
    // Rejouer le pipeline complet à partir des dataC/dataS déjà parsées.
    var runData = Object.assign({ type: 'start' }, _stream.meta || {});
    await _handleParseMessage(runData);
    // Libérer la mémoire (gros arrays) dès la fin du run
    _stream = null;
    return;
  }

  // ── Legacy initial message ────────────────────────────────────────────
  await _handleParseMessage(data);
};
