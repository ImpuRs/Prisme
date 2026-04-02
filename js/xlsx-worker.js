/* js/xlsx-worker.js — Web Worker pour parsing XLSX volumineux */
'use strict';
importScripts('https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js');

self.onmessage = function(e) {
  try {
    var arr = new Uint8Array(e.data.buffer);
    self.postMessage({type:'progress', msg:'Parsing XLSX...', pct:30});
    var wb = XLSX.read(arr, {
      type:'array', dense:true, cellDates:true,
      cellFormula:false, cellHTML:false, cellStyles:false
    });
    self.postMessage({type:'progress', msg:'Conversion JSON...', pct:70});
    var ws = wb.Sheets[wb.SheetNames[0]];
    var data = XLSX.utils.sheet_to_json(ws, {defval:''});
    self.postMessage({type:'progress', msg:'Transfert...', pct:90});
    self.postMessage({type:'result', data:data, rows:data.length});
  } catch(err) {
    self.postMessage({type:'error', msg:err.message || 'Erreur parsing Worker'});
  }
};
