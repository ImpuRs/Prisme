/* js/conv-worker.js — Web Worker XLSX → CSV (chunked) */
'use strict';
importScripts('https://cdn.sheetjs.com/xlsx-latest/package/dist/xlsx.full.min.js');

function _toStr(cell) {
  if (!cell) return '';
  if (cell.w != null) return String(cell.w);
  if (cell.v != null) return String(cell.v);
  return '';
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

self.onmessage = function(e) {
  var msg = e.data || {};
  if (msg.type !== 'convert') return;

  var opts = msg.opts || {};
  var sep = opts.sep === '\\t' ? '\t' : (opts.sep || ';');
  var sheetIndex = typeof opts.sheetIndex === 'number' ? opts.sheetIndex : (parseInt(opts.sheetIndex || '0', 10) || 0);
  if (sheetIndex < 0) sheetIndex = 0;
  var bom = !!opts.bom;
  var crlf = !!opts.crlf;
  var nl = crlf ? '\r\n' : '\n';

  try {
    self.postMessage({ type: 'progress', pct: 5, msg: 'Parsing XLSX…' });
    var wb = XLSX.read(new Uint8Array(msg.buf), {
      type: 'array',
      dense: true,
      cellDates: false,
      cellFormula: false,
      cellHTML: false,
      cellStyles: false,
    });

    var names = wb.SheetNames || [];
    if (!names.length) throw new Error('XLSX: aucune feuille détectée');
    if (sheetIndex >= names.length) sheetIndex = 0;
    var sheetName = names[sheetIndex] || names[0];
    var ws = wb.Sheets[sheetName];
    if (!ws) throw new Error('XLSX: feuille introuvable');

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
};

