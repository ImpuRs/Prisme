/* js/conv-worker.js — Web Worker XLSX → CSV (chunked) */
'use strict';
importScripts('https://cdn.sheetjs.com/xlsx-latest/package/dist/xlsx.full.min.js');

function _toStr(cell) {
  if (!cell) return '';
  // Nombres : utiliser cell.v (valeur brute) pour éviter les séparateurs de milliers
  // dans cell.w ("4,139" ou "4 138,80") qui cassent le parsing CSV.
  // Exception : pourcentages (cell.v = 0.3288 vs cell.w = "32,88%") → garder cell.w
  // Exception : dates sérialisées (cell.w contient "/" ou lettres) → garder cell.w
  if (cell.t === 'n' && cell.v != null) {
    if (cell.w != null && /[%\/a-zA-Z]/.test(cell.w)) return String(cell.w);
    return String(cell.v);
  }
  if (cell.w != null) return String(cell.w);
  if (cell.v != null) return String(cell.v);
  return '';
}

function _normHeader(s) {
  if (!s) return '';
  var t = String(s).trim().toLowerCase();
  // Retire accents (NFD)
  try { t = t.normalize('NFD').replace(/[\u0300-\u036f]/g, ''); } catch (_) {}
  // Retire séparateurs, garde lettres/chiffres (clé stable)
  t = t.replace(/[^a-z0-9]+/g, '');
  return t;
}

function _extractClientCode(v) {
  if (!v) return '';
  var s = String(v).trim();
  // Formats fréquents : "022155", "022155 | NOM", "022155 - NOM"
  var m = s.match(/^(\d{4,})/);
  return m ? m[1] : s;
}

function _parseNum(v) {
  if (v == null) return 0;
  var s = String(v).trim();
  if (!s) return 0;
  s = s.replace(/\s+/g, '').replace(',', '.');
  var x = parseFloat(s);
  return isFinite(x) ? x : 0;
}

function _csvEscape(v, sep) {
  if (v == null) return '';
  var s = (typeof v === 'string') ? v : String(v);
  // Normaliser les fins de ligne : évite de casser le CSV
  if (s.indexOf('\r') !== -1) s = s.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  var mustQuote = false;
  if (s.indexOf('"') !== -1 || s.indexOf('\n') !== -1) mustQuote = true;
  if (!mustQuote && sep && sep.length === 1 && s.indexOf(sep) !== -1) mustQuote = true;
  if (!mustQuote) return s;
  return '"' + s.replace(/"/g, '""') + '"';
}

function _readWB(buf) {
  return XLSX.read(new Uint8Array(buf), {
    type: 'array',
    dense: true,
    cellDates: false,
    cellFormula: false,
    cellHTML: false,
    cellStyles: false,
  });
}

function _getSheet(wb, sheetIndex) {
  var names = wb.SheetNames || [];
  if (!names.length) throw new Error('XLSX: aucune feuille détectée');
  if (sheetIndex >= names.length) sheetIndex = 0;
  var sheetName = names[sheetIndex] || names[0];
  var ws = wb.Sheets[sheetName];
  if (!ws) throw new Error('XLSX: feuille introuvable');
  return { sheetName: sheetName, ws: ws };
}

// ── Merge state (multi-fichiers → un seul CSV) ──
var _merge = null;

function _findKeyIdx(headers) {
  if (!headers || !headers.length) return -1;
  for (var i = 0; i < headers.length; i++) {
    var k = _normHeader(headers[i]);
    if (k === 'codeclient' || k === 'codeetnomclient') return i;
    if (k.indexOf('code') !== -1 && k.indexOf('client') !== -1) return i;
  }
  return -1;
}

function _findScoreIdx(headers) {
  if (!headers || !headers.length) return -1;
  // Heuristique Chalandise : CA 2026 (sinon CA N PDV Zone)
  for (var i = 0; i < headers.length; i++) {
    var k = _normHeader(headers[i]);
    if (k === 'ca2026') return i;
  }
  for (var j = 0; j < headers.length; j++) {
    var k2 = _normHeader(headers[j]);
    if (k2.indexOf('canpdvzone') !== -1) return j;
  }
  return -1;
}

function _mergeInit(msg) {
  var opts = (msg && msg.opts) ? msg.opts : {};
  var sep = opts.sep === '\\t' ? '\t' : (opts.sep || ';');
  var sheetIndex = typeof opts.sheetIndex === 'number' ? opts.sheetIndex : (parseInt(opts.sheetIndex || '0', 10) || 0);
  if (sheetIndex < 0) sheetIndex = 0;
  var bom = !!opts.bom;
  var crlf = !!opts.crlf;
  var nl = crlf ? '\r\n' : '\n';
  var dedup = opts.dedup || 'client'; // client | client-first | row | none

  _merge = {
    sep: sep,
    sheetIndex: sheetIndex,
    bom: bom,
    nl: nl,
    dedup: dedup,
    headers: [],
    h2i: Object.create(null), // normHeader -> index
    rowsArr: [],
    rowSeen: dedup === 'row' ? new Set() : null,
    clientMap: (dedup === 'client' || dedup === 'client-first') ? new Map() : null,
    keyIdx: -1,
    scoreIdx: -1,
    duplicates: 0,
  };

  self.postMessage({ type: 'merge_ready' });
}

function _mergeAdd(msg) {
  if (!_merge) throw new Error('Fusion non initialisée');

  var wb = _readWB(msg.buf);
  var sh = _getSheet(wb, _merge.sheetIndex);
  var ws = sh.ws;
  var raw = ws['!data'] || [];
  if (!raw.length) {
    self.postMessage({ type: 'merge_added', added: 0, total: _merge.clientMap ? _merge.clientMap.size : _merge.rowsArr.length });
    return;
  }

  // Colonnes : prendre le max des longueurs de ligne
  var nCols = 0;
  for (var rr = 0; rr < raw.length; rr++) {
    var rowR = raw[rr];
    if (rowR && rowR.length > nCols) nCols = rowR.length;
  }
  if (!nCols) nCols = (raw[0] && raw[0].length) ? raw[0].length : 0;

  // Headers locaux + mapping vers headers globaux
  var r0 = raw[0] || [];
  var localToGlobal = new Array(nCols);

  for (var c = 0; c < nCols; c++) {
    var h = _toStr(r0[c]);
    h = (h || '').toString().replace(/\r?\n/g, ' ').trim();
    if (!h) h = 'COL_' + (c + 1);
    var norm = _normHeader(h);
    var gi = _merge.h2i[norm];
    if (gi == null) {
      gi = _merge.headers.length;
      _merge.h2i[norm] = gi;
      _merge.headers.push(h);
      // Lazy discovery des colonnes utiles
      if (_merge.keyIdx < 0 && (_merge.dedup === 'client' || _merge.dedup === 'client-first')) _merge.keyIdx = _findKeyIdx(_merge.headers);
      if (_merge.scoreIdx < 0 && (_merge.dedup === 'client' || _merge.dedup === 'client-first')) _merge.scoreIdx = _findScoreIdx(_merge.headers);
    }
    localToGlobal[c] = gi;
  }

  if (_merge.keyIdx < 0 && _merge.dedup === 'client') _merge.keyIdx = _findKeyIdx(_merge.headers);
  if (_merge.scoreIdx < 0 && _merge.dedup === 'client') _merge.scoreIdx = _findScoreIdx(_merge.headers);

  var added = 0;
  var emitted = 0;
  var totalRows = raw.length - 1;

  for (var r = 1; r < raw.length; r++) {
    var src = raw[r] || [];
    var row = []; // sparse (indices globaux)
    var hasData = false;

    for (var c2 = 0; c2 < nCols; c2++) {
      var gi2 = localToGlobal[c2];
      var v = _toStr(src[c2]);
      if (v != null && String(v).trim() !== '') hasData = true;
      row[gi2] = v;
    }
    if (!hasData) continue;

    if (_merge.dedup === 'none') {
      _merge.rowsArr.push(row);
      added++;
    } else if (_merge.dedup === 'row') {
      // clé "ligne identique" (sur headers globaux)
      var lk = '';
      for (var k = 0; k < _merge.headers.length; k++) {
        var vv = row[k];
        lk += (vv == null ? '' : String(vv)) + '\u001f';
      }
      if (!_merge.rowSeen.has(lk)) {
        _merge.rowSeen.add(lk);
        _merge.rowsArr.push(row);
        added++;
      } else {
        _merge.duplicates++;
      }
    } else {
      // dedup client (code client)
      var key = '';
      if (_merge.keyIdx >= 0) key = _extractClientCode(row[_merge.keyIdx]);
      if (!key) {
        _merge.rowsArr.push(row);
        added++;
      } else {
        var score = (_merge.scoreIdx >= 0) ? _parseNum(row[_merge.scoreIdx]) : 0;
        var ex = _merge.clientMap.get(key);
        if (!ex) {
          _merge.clientMap.set(key, { row: row, score: score });
          added++;
        } else {
          _merge.duplicates++;
          if (_merge.dedup === 'client-first') {
            // Premier fichier gagne — ne pas écraser
          } else if (_merge.scoreIdx >= 0 && score > ex.score) {
            _merge.clientMap.set(key, { row: row, score: score });
          }
        }
      }
    }

    emitted++;
    if (emitted % 2000 === 0) {
      var pct = Math.round((emitted / Math.max(totalRows, 1)) * 100);
      self.postMessage({ type: 'progress', scope: 'ingest', pct: pct, msg: (msg.filename || 'Fichier') + ' — ' + emitted + '/' + totalRows + ' lignes…' });
    }
  }

  self.postMessage({ type: 'merge_added', added: added, total: _merge.clientMap ? _merge.clientMap.size : _merge.rowsArr.length });
}

function _mergeDone() {
  if (!_merge) throw new Error('Fusion non initialisée');

  var sep = _merge.sep;
  var nl = _merge.nl;
  var headers = _merge.headers || [];
  var rowsCount = _merge.clientMap ? _merge.clientMap.size : _merge.rowsArr.length;

  self.postMessage({ type: 'meta', merge: true, rows: rowsCount, cols: headers.length, duplicates: _merge.duplicates });

  var chunk = '';
  var chunkRows = 0;
  var emitted = 0;

  function flush() {
    if (!chunk) return;
    self.postMessage({ type: 'chunk', text: chunk });
    chunk = '';
    chunkRows = 0;
  }

  // Header
  chunk += (_merge.bom ? '\ufeff' : '') + headers.map(function(x){ return _csvEscape(x, sep); }).join(sep) + nl;

  function emitRow(row) {
    var cells = new Array(headers.length);
    for (var i = 0; i < headers.length; i++) {
      var v = row[i];
      cells[i] = _csvEscape(v == null ? '' : v, sep);
    }
    chunk += cells.join(sep) + nl;
    chunkRows++;
    emitted++;
    if (chunk.length > 1024 * 1024 || chunkRows >= 600) flush();
    if (emitted % 2000 === 0) {
      var pct = Math.round((emitted / Math.max(rowsCount, 1)) * 100);
      self.postMessage({ type: 'progress', scope: 'emit', pct: pct, msg: 'Écriture — ' + emitted + '/' + rowsCount + ' lignes…' });
    }
  }

  if (_merge.clientMap) {
    // Ordre stable : tri des codes client
    var keys = Array.from(_merge.clientMap.keys());
    keys.sort();
    for (var k = 0; k < keys.length; k++) {
      var it = _merge.clientMap.get(keys[k]);
      if (it && it.row) emitRow(it.row);
    }
  } else {
    for (var r = 0; r < _merge.rowsArr.length; r++) emitRow(_merge.rowsArr[r]);
  }

  flush();
  self.postMessage({ type: 'progress', scope: 'emit', pct: 100, msg: 'Finalisation…' });
  self.postMessage({ type: 'done', rows: rowsCount, cols: headers.length, merge: true, duplicates: _merge.duplicates });
}

function _convertOne(msg) {
  var opts = msg.opts || {};
  var sep = opts.sep === '\\t' ? '\t' : (opts.sep || ';');
  var sheetIndex = typeof opts.sheetIndex === 'number' ? opts.sheetIndex : (parseInt(opts.sheetIndex || '0', 10) || 0);
  if (sheetIndex < 0) sheetIndex = 0;
  var bom = !!opts.bom;
  var crlf = !!opts.crlf;
  var nl = crlf ? '\r\n' : '\n';

  try {
    self.postMessage({ type: 'progress', pct: 5, msg: 'Parsing XLSX…' });
    var wb = _readWB(msg.buf);
    var sh = _getSheet(wb, sheetIndex);
    var sheetName = sh.sheetName;
    var ws = sh.ws;

    var raw = ws['!data'] || [];
    if (!raw.length) {
      self.postMessage({ type: 'meta', sheet: sheetName, rows: 0, cols: 0 });
      self.postMessage({ type: 'done', rows: 0, cols: 0, sheet: sheetName });
      return;
    }

    // Colonnes : prendre le max des longueurs de ligne (CSV stable)
    var nCols = 0;
    for (var rr = 0; rr < raw.length; rr++) {
      var rowR = raw[rr];
      if (rowR && rowR.length > nCols) nCols = rowR.length;
    }
    if (!nCols) nCols = (raw[0] && raw[0].length) ? raw[0].length : 0;

    // En-têtes
    var headers = new Array(nCols);
    var r0 = raw[0] || [];
    for (var c = 0; c < nCols; c++) {
      var h = _toStr(r0[c]);
      h = (h || '').toString().replace(/\r?\n/g, ' ').trim();
      headers[c] = h || ('COL_' + (c + 1));
    }

    var nRows = raw.length - 1;
    self.postMessage({ type: 'meta', sheet: sheetName, rows: nRows, cols: nCols });

    // Chunk writer : évite d'allouer une string gigantesque
    var chunk = '';
    var chunkRows = 0;
    var emitted = 0;

    function flush() {
      if (!chunk) return;
      self.postMessage({ type: 'chunk', text: chunk });
      chunk = '';
      chunkRows = 0;
    }

    // Header line (BOM optionnel)
    chunk += (bom ? '\ufeff' : '') + headers.map(function(x){ return _csvEscape(x, sep); }).join(sep) + nl;

    // Data rows
    for (var r = 1; r < raw.length; r++) {
      var src = raw[r] || [];
      var cells = new Array(nCols);
      for (var c2 = 0; c2 < nCols; c2++) {
        cells[c2] = _csvEscape(_toStr(src[c2]), sep);
      }
      chunk += cells.join(sep) + nl;
      chunkRows++;
      emitted++;

      if (chunk.length > 1024 * 1024 || chunkRows >= 600) flush();

      if (emitted % 2000 === 0) {
        var pct = 5 + Math.round((emitted / Math.max(nRows, 1)) * 90);
        self.postMessage({ type: 'progress', pct: pct, msg: emitted + '/' + nRows + ' lignes…' });
      }
    }
    flush();
    self.postMessage({ type: 'progress', pct: 98, msg: 'Finalisation…' });
    self.postMessage({ type: 'done', rows: nRows, cols: nCols, sheet: sheetName });
  } catch (err) {
    self.postMessage({ type: 'error', msg: (err && err.message) ? err.message : String(err) });
  }
}

self.onmessage = function(e) {
  var msg = e.data || {};
  try {
    if (msg.type === 'convert') return _convertOne(msg);
    if (msg.type === 'merge_init') return _mergeInit(msg);
    if (msg.type === 'merge_add') return _mergeAdd(msg);
    if (msg.type === 'merge_done') return _mergeDone(msg);
  } catch (err) {
    self.postMessage({ type: 'error', msg: (err && err.message) ? err.message : String(err) });
  }
};
