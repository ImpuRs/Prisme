/* js/xlsx-worker.js — Web Worker pour parsing XLSX volumineux */
'use strict';
importScripts('https://cdn.sheetjs.com/xlsx-latest/package/dist/xlsx.full.min.js');

self.onmessage = function(e) {
  try {
    var arr = new Uint8Array(e.data.buffer);
    self.postMessage({type:'progress', msg:'Parsing XLSX...', pct:30});
    var wb = XLSX.read(arr, {
      type:'array', dense:true, cellDates:false,
      cellFormula:false, cellHTML:false, cellStyles:false
    });
    self.postMessage({type:'progress', msg:'Extraction données...', pct:70});
    var ws = wb.Sheets[wb.SheetNames[0]];
    var raw = ws['!data'] || [];
    var headers = [];
    var rows = [];
    if (raw.length) {
      var r0 = raw[0] || [];
      for (var c = 0; c < r0.length; c++) {
        headers.push(r0[c] != null && r0[c].v != null ? String(r0[c].v).trim() : '');
      }
      var nCols = headers.length;
      for (var r = 1; r < raw.length; r++) {
        var src = raw[r];
        var row = new Array(nCols);
        if (src) {
          for (var c2 = 0; c2 < nCols; c2++) {
            var cell = src[c2];
            row[c2] = cell != null ? (cell.v != null ? cell.v : '') : '';
          }
        } else {
          for (var c3 = 0; c3 < nCols; c3++) row[c3] = '';
        }
        rows.push(row);
      }
    }
    self.postMessage({type:'progress', msg:'Transfert...', pct:90});
    self.postMessage({type:'result', data:{headers:headers, rows:rows}, rows:rows.length});
  } catch(err) {
    self.postMessage({type:'error', msg:err.message || 'Erreur parsing Worker'});
  }
};
