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
  // Padder à 6 chiffres si code numérique (1853 → 001853)
  return /^\d+$/.test(code) ? code.padStart(6, '0') : code;
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
  var active = data.filter(function(r) { return r.W >= 1; });
  active.sort(function(a, b) { return (b.V * b.prixUnitaire) - (a.V * a.prixUnitaire); });
  var totalRot = active.reduce(function(s, r) { return s + r.V * r.prixUnitaire; }, 0);
  var cumul = 0;
  var abcMap = {};
  for (var i = 0; i < active.length; i++) {
    var r = active[i];
    cumul += r.V * r.prixUnitaire;
    var p = totalRot > 0 ? cumul / totalRot : 1;
    abcMap[r.code] = p <= 0.8 ? 'A' : p <= 0.95 ? 'B' : 'C';
  }
  for (var j = 0; j < data.length; j++) {
    var rd = data[j];
    if (rd.W >= 1) {
      rd.abcClass = abcMap[rd.code] || 'C';
      rd.fmrClass = rd.W >= 12 ? 'F' : rd.W >= 4 ? 'M' : 'R';
    } else {
      rd.abcClass = ''; rd.fmrClass = '';
    }
  }
  var totalStockVal = data.reduce(function(s, r) { return r.stockActuel > 0 ? s + r.stockActuel * r.prixUnitaire : s; }, 0);
  var mx = {};
  var abcCls = ['A', 'B', 'C'], fmrCls = ['F', 'M', 'R'];
  for (var ai = 0; ai < abcCls.length; ai++) {
    for (var fi = 0; fi < fmrCls.length; fi++) {
      var key = abcCls[ai] + fmrCls[fi];
      var items = data.filter(function(r) { return r.abcClass === abcCls[ai] && r.fmrClass === fmrCls[fi]; });
      var sv = items.reduce(function(s, r) { return r.stockActuel > 0 ? s + r.stockActuel * r.prixUnitaire : s; }, 0);
      mx[key] = { count: items.length, stockVal: sv, pctTotal: totalStockVal > 0 ? sv / totalStockVal * 100 : 0 };
    }
  }
  return mx; // retourne abcMatrixData (dans le worker, pas de _S)
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

self.onmessage = async function(ev) {
  var data = ev.data;
  if (data.type === 'continue') return; // message tardif, ignorer
  var bufC = data.bufC;
  var bufS = data.bufS;
  var periodStart = data.periodStart ? new Date(data.periodStart) : null;
  var periodEnd = data.periodEnd ? new Date(data.periodEnd) : null;
  var isRefilter = !!data.isRefilter;
  var filenameC = (data.filenameC || '').toLowerCase();
  var isCsvC = filenameC.endsWith('.csv');

  try {
    // ── 1. Parse consommé ────────────────────────────────────────────────
    var dataC;
    if (isCsvC) {
      self.postMessage({ type: 'progress', pct: 15, msg: 'Parsing consommé CSV…' });
      // Détecter l'encodage : essayer UTF-8, fallback CP1252
      var text;
      try { text = new TextDecoder('utf-8', { fatal: true }).decode(bufC); }
      catch(e) { text = new TextDecoder('windows-1252').decode(bufC); }
      var csvLines = text.split('\n');
      // Détecter le séparateur sur la première ligne
      var firstLine = csvLines[0] || '';
      var sep = firstLine.indexOf(';') > firstLine.indexOf('\t') ? ';'
              : firstLine.indexOf('\t') >= 0 ? '\t' : ';';
      var headersC_csv = firstLine.split(sep).map(function(h) { return h.trim().replace(/\r/g,'').replace(/^"|"$/g,''); });
      var csvRows = [];
      for (var cri = 1; cri < csvLines.length; cri++) {
        var ln = csvLines[cri].replace(/\r/g,'');
        if (!ln) continue;
        var cells = ln.split(sep);
        // Normaliser à la bonne longueur
        while (cells.length < headersC_csv.length) cells.push('');
        csvRows.push(cells);
      }
      dataC = { headers: headersC_csv, rows: csvRows };
    } else {
      self.postMessage({ type: 'progress', pct: 15, msg: 'Parsing consommé XLSX…' });
      var wbC = XLSX.read(new Uint8Array(bufC), {
        type: 'array', dense: true, cellDates: false,
        cellFormula: false, cellHTML: false, cellStyles: false
      });
      dataC = _wsToHR(wbC.Sheets[wbC.SheetNames[0]]);
    }

    // ── 2. Parse XLSX stock ──────────────────────────────────────────────
    var dataS = [];
    if (bufS) {
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
    var ventesParMagasin = {};
    var ventesParMagasinByCanal = {};
    var ventesClientArticle = new Map();
    var ventesClientArticleFull = new Map();
    var ventesClientHorsMagasin = new Map();
    var ventesClientsPerStore = {};
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
    var passagesUniques = new Set();
    var commandesPDV = new Set();
    var minDateVente = Infinity, maxDateVente = 0;
    var _tempCAAll = new Map();
    var _tempCAAllFull = new Map();
    var byMonth = {};        // cc → code → monthIdx → {sumCA, sumPrelevee, countBL, sumVMB, sumVMBP, sumCAPrelevee}
    var byMonthCanal = {};   // store → canal → monthIdx → {sumCA, sumPrelevee, countBL}
    var byMonthClients = {}; // monthIdx → Set<cc> — tous canaux, pleine période, pour comptage clients par période

    var rows = dataC.rows;
    var totalRows = rows.length;

    for (var i = 0; i < totalRows; i++) {
      var row = rows[i];

      var _rs = (CI.store !== null ? (row[CI.store] != null ? row[CI.store] : '') : '').toString().trim().toUpperCase() || 'INCONNU';
      var _ra = (CI.article !== null ? (row[CI.article] != null ? row[CI.article] : '') : '').toString();
      var _rc = (CI.client !== null ? (row[CI.client] != null ? row[CI.client] : '') : '').toString().trim();
      var _rcp = CI.caP !== null ? (isCsvC ? cleanPrice(row[CI.caP]) : (+row[CI.caP] || 0)) : 0;
      var _rce = CI.caE !== null ? (isCsvC ? cleanPrice(row[CI.caE]) : (+row[CI.caE] || 0)) : 0;
      var _rqp = CI.qteP !== null ? (isCsvC ? cleanPrice(row[CI.qteP]) : (+row[CI.qteP] || 0)) : 0;
      var _rqe = CI.qteE !== null ? (isCsvC ? cleanPrice(row[CI.qteE]) : (+row[CI.qteE] || 0)) : 0;
      var _rvp = CI.vmbP !== null ? (isCsvC ? cleanPrice(row[CI.vmbP]) : (+row[CI.vmbP] || 0)) : 0;
      var _rve = CI.vmbE !== null ? (isCsvC ? cleanPrice(row[CI.vmbE]) : (+row[CI.vmbE] || 0)) : 0;
      var _rnc = (CI.commande !== null ? (row[CI.commande] != null ? row[CI.commande] : '').toString() : '').trim();
      var _rbl2 = (CI.bl !== null ? (row[CI.bl] != null ? row[CI.bl] : '').toString() : '').trim();
      var _rncb = _rnc || _rbl2;
      var _rj = isCsvC ? _parseDateRow(row) : (CI.jour !== null ? row[CI.jour] : null);
      var canal = (CI.canal !== null ? (row[CI.canal] != null ? row[CI.canal] : '') : '').toString().trim().toUpperCase();

      // Period-independent blocks (always on first parse — isRefilter=false in worker)
      if (canal) {
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
      if (canal && canalAgence[canal]) {
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
      if (dateV) {
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
        }
      }

      // byMonthCanal — accumulation mensuelle tous canaux pour reconstruction canalAgence par période
      if (dateV && canal && (!selectedStore || _rs === 'INCONNU' || _rs === selectedStore)) {
        var _midxC = dateV.getFullYear() * 12 + dateV.getMonth();
        var _skC = _rs;
        if (!byMonthCanal[_skC]) byMonthCanal[_skC] = {};
        if (!byMonthCanal[_skC][canal]) byMonthCanal[_skC][canal] = {};
        if (!byMonthCanal[_skC][canal][_midxC]) byMonthCanal[_skC][canal][_midxC] = { sumCA: 0, sumPrelevee: 0, sumVMB: 0, sumVMBP: 0, _cmds: new Set() };
        var _bmce = byMonthCanal[_skC][canal][_midxC];
        _bmce.sumCA += _rcp + _rce;
        if (_rqp > 0) _bmce.sumPrelevee += _rcp;
        _bmce.sumVMB += _rvp + _rve;
        _bmce.sumVMBP += _rvp;
        if (_rncb) _bmce._cmds.add(_rncb);
      }

      // byMonthClients — tous canaux, pleine période, pour comptage clients uniques par période
      if (dateV) {
        var _ccBMC = extractClientCode(_rc);
        var _skBMC = _rs;
        if (_ccBMC && (!selectedStore || _skBMC === 'INCONNU' || _skBMC === selectedStore)) {
          var _midxBMC = dateV.getFullYear() * 12 + dateV.getMonth();
          if (!byMonthClients[_midxBMC]) byMonthClients[_midxBMC] = new Set();
          byMonthClients[_midxBMC].add(_ccBMC);
        }
      }

      // _tempCAAll (période filtrée, tous canaux)
      if (!(periodFilterStart && dateV && dateV < periodFilterStart) && !(periodFilterEnd && dateV && dateV > periodFilterEnd)) {
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
      {
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
      {
        var _ccNom = extractClientCode(_rc);
        if (_ccNom && !clientNomLookup[_ccNom]) {
          var _di = _rc.indexOf(' - ');
          if (_di >= 0) clientNomLookup[_ccNom] = _rc.slice(_di + 3).trim();
        }
      }

      // Canaux hors MAGASIN
      if (storesIntersection.size > 0 ? canal !== 'MAGASIN' : canal !== '' && canal !== 'MAGASIN') {
        if (canal) {
          if (periodFilterStart && dateV && dateV < periodFilterStart) continue;
          if (periodFilterEnd && dateV && dateV > periodFilterEnd) continue;
          var cc_h = extractClientCode(_rc);
          var codeArt_h = cleanCode(_ra);
          var caLigne_h = _rcp + _rce;
          var qteLigne_h = _rqp + _rqe;
          var skHors = _rs;
          if (cc_h && codeArt_h && (!selectedStore || skHors === 'INCONNU' || skHors === selectedStore)) {
            cannauxHorsMagasin.add(canal);
            var hm = ventesClientHorsMagasin.get(cc_h) || new Map();
            var ex_h = hm.get(codeArt_h) || { sumCA: 0, sumPrelevee: 0, sumCAPrelevee: 0, countBL: 0, canal: canal };
            ex_h.sumCA += caLigne_h;
            ex_h.sumPrelevee += qteLigne_h;
            ex_h.sumCAPrelevee += caLigne_h;
            ex_h.countBL++;
            hm.set(codeArt_h, ex_h);
            ventesClientHorsMagasin.set(cc_h, hm);
          }
          // ventesParMagasinByCanal
          if (codeArt_h && (skHors === 'INCONNU' || storesIntersection.has(skHors) || !storesIntersection.size)) {
            var _storeKey_h = skHors === 'INCONNU' ? (selectedStore || skHors) : skHors;
            if (!ventesParMagasinByCanal[_storeKey_h]) ventesParMagasinByCanal[_storeKey_h] = {};
            if (!ventesParMagasinByCanal[_storeKey_h][canal]) ventesParMagasinByCanal[_storeKey_h][canal] = {};
            if (!ventesParMagasinByCanal[_storeKey_h][canal][codeArt_h]) ventesParMagasinByCanal[_storeKey_h][canal][codeArt_h] = { sumCA: 0, sumPrelevee: 0, countBL: 0, sumVMB: 0, sumVMBPrel: 0 };
            var _vpmc_h = ventesParMagasinByCanal[_storeKey_h][canal][codeArt_h];
            _vpmc_h.sumCA += caLigne_h;
            _vpmc_h.sumPrelevee += _rcp;
            _vpmc_h.countBL++;
            _vpmc_h.sumVMB += _rvp + _rve;
            _vpmc_h.sumVMBPrel += _rvp;
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
      if (_famCode && code) articleFamille[code] = _famCode;
      var _uv2 = (CI.univers !== null ? (row[CI.univers] != null ? row[CI.univers] : '') : '').toString().trim();
      var _cf2 = _codeFamConso || '';
      var univConso = _uv2 || (_cf2 ? (FAM_LETTER_UNIVERS[_cf2[0].toUpperCase()] || 'Inconnu') : '');
      if (univConso && code) articleUnivers[code] = univConso;

      if (dateV) {
        var tsD = dateV.getTime();
        if (tsD < minDateVente) minDateVente = tsD;
        if (tsD > maxDateVente) maxDateVente = tsD;
      }

      // articleRaw (W/V/MIN/MAX — hoisted, no period filter)
      var cc2 = extractClientCode(_rc);
      var nc = (_hasCommandeCol ? (_rncb || '') : ('__r' + i)).toString().trim() || ('__r' + i);
      if (dateV && code && (!selectedStore || sk === selectedStore) && qteP > 0) {
        if (!monthlySales[code]) monthlySales[code] = new Array(12).fill(0);
        monthlySales[code][dateV.getMonth()] += qteP;
      }
      // Réseau : toutes agences (pour seasonalIndexReseau)
      if (dateV && code && qteP > 0) {
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

      // ventesClientArticleFull (pleine période, MAGASIN, myStore only)
      if (cc2 && code && (!selectedStore || sk === selectedStore)) {
        if (!ventesClientArticleFull.has(cc2)) ventesClientArticleFull.set(cc2, new Map());
        var _artF = ventesClientArticleFull.get(cc2);
        if (!_artF.has(code)) _artF.set(code, { sumPrelevee: 0, sumCAPrelevee: 0, sumCA: 0, sumCAAll: 0, countBL: 0 });
        var _eF = _artF.get(code);
        if (qteP > 0) { _eF.sumPrelevee += qteP; _eF.sumCAPrelevee += caP; }
        _eF.sumCA += caP + caE;
        if (qteP > 0 || qteE > 0) _eF.countBL++;
      }

      // byMonth — accumulation mensuelle pleine période pour filtre instantané (MAGASIN, myStore)
      if (dateV && cc2 && code && canal === 'MAGASIN' && (!selectedStore || sk === selectedStore)) {
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

      // ventesParMagasin (PAS de filtre période — cohérent avec articleRaw)
      if (storesIntersection.has(sk) || !storesIntersection.size) {
        if (!ventesParMagasin[sk]) ventesParMagasin[sk] = {};
        if (!ventesParMagasin[sk][code]) ventesParMagasin[sk][code] = { sumPrelevee: 0, sumEnleve: 0, sumCA: 0, countBL: 0, sumVMB: 0 };
        if (qteP > 0) ventesParMagasin[sk][code].sumPrelevee += qteP;
        if (qteE > 0) ventesParMagasin[sk][code].sumEnleve += qteE;
        ventesParMagasin[sk][code].sumCA += caP + caE;
        if (qteP > 0 || qteE > 0) ventesParMagasin[sk][code].countBL++;
        ventesParMagasin[sk][code].sumVMB += _rvp + _rve;
        if (canal) {
          var _bck = ventesParMagasin[sk][code];
          if (!_bck.byCanal) _bck.byCanal = {};
          if (!_bck.byCanal[canal]) _bck.byCanal[canal] = { sumPrelevee: 0, sumCA: 0, countBL: 0, sumVMB: 0 };
          var _bc = _bck.byCanal[canal];
          if (qteP > 0) _bc.sumPrelevee += qteP;
          _bc.sumCA += caP + caE;
          if (qteP > 0 || qteE > 0) _bc.countBL++;
          _bc.sumVMB += _rvp + _rve;
        }
        if (code && (!canal || canal === 'MAGASIN')) {
          var _canalKey = 'MAGASIN';
          if (!ventesParMagasinByCanal[sk]) ventesParMagasinByCanal[sk] = {};
          if (!ventesParMagasinByCanal[sk][_canalKey]) ventesParMagasinByCanal[sk][_canalKey] = {};
          if (!ventesParMagasinByCanal[sk][_canalKey][code]) ventesParMagasinByCanal[sk][_canalKey][code] = { sumCA: 0, sumPrelevee: 0, countBL: 0, sumVMB: 0, sumVMBPrel: 0 };
          var _vpmc2 = ventesParMagasinByCanal[sk][_canalKey][code];
          _vpmc2.sumCA += caP + caE;
          _vpmc2.sumPrelevee += caP;
          if (qteP > 0 || qteE > 0) _vpmc2.countBL++;
          _vpmc2.sumVMB += _rvp + _rve;
          _vpmc2.sumVMBPrel += _rvp;
        }
      }

      // Filtre période (s'applique aux agrégats client/temps en aval)
      if (periodFilterStart && dateV && dateV < periodFilterStart) continue;
      if (periodFilterEnd && dateV && dateV > periodFilterEnd) continue;

      // ventesClientsPerStore + clientsMagasin
      if (cc2 && code) {
        if (!ventesClientsPerStore[sk]) ventesClientsPerStore[sk] = new Set();
        ventesClientsPerStore[sk].add(cc2);
      }
      if (cc2 && (!selectedStore || sk === selectedStore)) {
        clientsMagasin.add(cc2);
        var _nc4m = _rncb || ('__row_' + i);
        if (!_clientMagasinBLsTemp.has(cc2)) _clientMagasinBLsTemp.set(cc2, new Set());
        _clientMagasinBLsTemp.get(cc2).add(_nc4m);
      }

      // ventesClientArticle (MAGASIN, myStore, période filtrée)
      if (cc2 && code && (!selectedStore || sk === selectedStore)) {
        if (!ventesClientArticle.has(cc2)) ventesClientArticle.set(cc2, new Map());
        var artMap = ventesClientArticle.get(cc2);
        if (!artMap.has(code)) artMap.set(code, { sumPrelevee: 0, sumCAPrelevee: 0, sumCA: 0, sumCAAll: 0, countBL: 0 });
        var e_vca = artMap.get(code);
        if (qteP > 0) { e_vca.sumPrelevee += qteP; e_vca.sumCAPrelevee += caP; }
        e_vca.sumCA += caP + caE;
        if (qteP > 0 || qteE > 0) e_vca.countBL++;
      }

      // commandesPDV + passagesUniques
      if (!selectedStore || sk === selectedStore) {
        if (_rnc || _rbl2) commandesPDV.add(_rnc || _rbl2);
        if ((qteP > 0 || qteE > 0) && cc2 && dateV && !isNaN(dateV.getTime())) {
          passagesUniques.add(cc2 + '_' + formatLocalYMD(dateV));
        }
      }

      // clientLastOrder (MAGASIN, période filtrée)
      if (cc2 && dateV && (!selectedStore || sk === selectedStore)) {
        var prev_lo = clientLastOrder.get(cc2);
        if (!prev_lo || dateV > prev_lo) clientLastOrder.set(cc2, dateV);
      }

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

      if (i % 50000 === 0 && i > 0) {
        self.postMessage({ type: 'progress', pct: 35 + Math.round(i / totalRows * 25), msg: 'Ventes ' + Math.round(i / totalRows * 100) + '%…' });
      }
    } // end boucle consommé

    // ── Fusion sumCAAll ───────────────────────────────────────────────────
    _tempCAAll.forEach(function(_arts, _cc) {
      if (!ventesClientArticle.has(_cc)) return;
      var _cMap = ventesClientArticle.get(_cc);
      _arts.forEach(function(_ca, _code) {
        var _e = _cMap.get(_code);
        if (_e) _e.sumCAAll += _ca;
      });
    });
    _tempCAAllFull.forEach(function(_arts, _cc) {
      if (!ventesClientArticleFull.has(_cc)) return;
      var _cMap = ventesClientArticleFull.get(_cc);
      _arts.forEach(function(_ca, _code) {
        var _e = _cMap.get(_code);
        if (_e) _e.sumCAAll += _ca;
      });
    });

    // ── Build blCanalMap + convert canalAgence bl sets ───────────────────
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
          delete _bme2._cmds;
        }
      }
    }

    // ── clientsMagasinFreq ────────────────────────────────────────────────
    _clientMagasinBLsTemp.forEach(function(bls, cc) {
      clientsMagasinFreq.set(cc, bls.size);
    });

    // ── ventesAnalysis intermédiaire ──────────────────────────────────────
    var totalBLs = Object.keys(blData).length;
    var sumRefParBL = 0, sumFamParBL = 0;
    var famBLcount = {};
    for (var blKey in blData) {
      var blEntry = blData[blKey];
      sumRefParBL += blEntry.codes.size;
      sumFamParBL += blEntry.familles.size;
      blEntry.familles.forEach(function(fam) { famBLcount[fam] = (famBLcount[fam] || 0) + 1; });
    }
    var _sd0 = ventesParMagasin[selectedStore] || {};
    var _caCalc = Object.values(_sd0).reduce(function(s, v) { return s + (v.sumCA || 0); }, 0);
    var _vmbCalc = Object.values(_sd0).reduce(function(s, v) { return s + (v.sumVMB || 0); }, 0);
    var ventesAnalysis = {
      refParBL: totalBLs > 0 ? (sumRefParBL / totalBLs).toFixed(1) : 0,
      famParBL: totalBLs > 0 ? (sumFamParBL / totalBLs).toFixed(1) : 0,
      totalBL: totalBLs,
      refActives: 0, // will be set after synth
      attractivite: famBLcount,
      nbPassages: passagesUniques.size,
      txMarge: _caCalc > 0 ? _vmbCalc / _caCalc * 100 : null,
      vmc: commandesPDV.size > 0 ? _caCalc / commandesPDV.size : null
    };

    // ── blData: convert Sets to counts for serialization ─────────────────
    // Keep only sizes to avoid serializing millions of sets
    var blDataSer = {};
    for (var blk in blData) {
      blDataSer[blk] = { codesSize: blData[blk].codes.size, famillesSize: blData[blk].familles.size };
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
          stockParMagasin[storeCodeS][codeS] = { stockActuel: cleanPrice(_cSStk ? rowS[_cSStk] : 0), valeurStock: _stkVal, qteMin: _kMin, qteMax: _kMax };
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

    // ── caAnnuel (depuis ventesClientArticle, MAGASIN) ───────────────────
    var _caByCode = new Map();
    ventesClientArticle.forEach(function(artMap) {
      artMap.forEach(function(data2, code2) {
        _caByCode.set(code2, (_caByCode.get(code2) || 0) + (data2.sumCA || 0));
      });
    });
    for (var fdi3 = 0; fdi3 < finalData.length; fdi3++) {
      finalData[fdi3].caAnnuel = Math.round(_caByCode.get(finalData[fdi3].code) || 0);
    }

    // ── globalJoursOuvres ─────────────────────────────────────────────────
    var consommeMoisCouverts = (minDateVente < Infinity && maxDateVente > 0)
      ? Math.round(daysBetween(new Date(minDateVente), new Date(maxDateVente)) / 30.5) : 0;

    // ── Retourner les résultats ───────────────────────────────────────────
    self.postMessage({ type: 'progress', pct: 95, msg: 'Sérialisation…' });

    // seasonalIndexReseau : agrège monthlySalesReseau par famille → coefficients réseau
    var seasonalIndexReseau = {};
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

    // Serialize ventesClientsPerStore (Map de Sets → obj de arrays)
    var ventesClientsPerStoreSer = {};
    for (var vsk in ventesClientsPerStore) {
      ventesClientsPerStoreSer[vsk] = Array.from(ventesClientsPerStore[vsk]);
    }

    self.postMessage({
      type: 'done',
      payload: {
        // Objets plain
        articleRaw: articleRaw,
        monthlySales: monthlySales,
        seasonalIndexReseau: seasonalIndexReseau,
        ventesParMagasin: ventesParMagasin,
        ventesParMagasinByCanal: ventesParMagasinByCanal,
        ventesClientsPerStore: ventesClientsPerStoreSer,
        clientNomLookup: clientNomLookup,
        articleFamille: articleFamille,
        articleUnivers: articleUnivers,
        libelleLookup: libelleLookup,
        canalAgence: canalAgence,
        blData: blDataSer,
        finalData: finalData,
        abcMatrixData: abcMatrixData,
        stockParMagasin: stockParMagasin,
        ventesAnalysis: ventesAnalysis,
        joursOuvres: joursOuvres,
        consommeMoisCouverts: consommeMoisCouverts,
        // Dates
        minDateVente: minDateVente < Infinity ? minDateVente : null,
        maxDateVente: maxDateVente > 0 ? maxDateVente : null,
        periodFilterStart: periodFilterStart ? periodFilterStart.getTime() : null,
        periodFilterEnd: periodFilterEnd ? periodFilterEnd.getTime() : null,
        storesFoundC: Array.from(storesFoundC),
        storesFoundS: Array.from(storesFoundS),
        storesIntersection: Array.from(storesIntersection),
        hasCommandeCol: _hasCommandeCol,
        headersC: headersC,
        _resolvedStore: selectedStore,
        // Maps sérialisées
        ventesClientArticle: serMap(ventesClientArticle),
        ventesClientArticleFull: serMap(ventesClientArticleFull),
        ventesClientHorsMagasin: serMap(ventesClientHorsMagasin),
        clientLastOrder: Array.from(clientLastOrder).map(function(kv) { return [kv[0], kv[1] instanceof Date ? kv[1].getTime() : kv[1]]; }),
        clientLastOrderAll: Array.from(clientLastOrderAll).map(function(kv) { return [kv[0], { date: kv[1].date instanceof Date ? kv[1].date.getTime() : kv[1].date, canal: kv[1].canal }]; }),
        clientLastOrderByCanal: serMap(clientLastOrderByCanal),
        clientArticles: serMap(clientArticles),
        articleClients: serMap(articleClients),
        articleCanalCA: serMap(articleCanalCA),
        blCanalMap: Array.from(blCanalMap),
        clientsMagasin: Array.from(clientsMagasin),
        clientsMagasinFreq: Array.from(clientsMagasinFreq),
        cannauxHorsMagasin: Array.from(cannauxHorsMagasin),
        blPreleveeSet: Array.from(blPreleveeSet),
        passagesUniques: Array.from(passagesUniques),
        byMonth: byMonth,
        byMonthCanal: byMonthCanal,
        byMonthClients: Object.fromEntries(Object.entries(byMonthClients).map(function(kv) { return [kv[0], Array.from(kv[1])]; })),
      }
    });

  } catch (err) {
    self.postMessage({ type: 'error', msg: err.message || 'Erreur parse-worker' });
  }
};
