/* js/xlsx-worker.js — Web Worker pour parsing XLSX volumineux */
'use strict';

// Charger SheetJS dans le Worker (même version que index.html)
importScripts('https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js');

self.onmessage = function(e) {
  try {
    const buffer = e.data.buffer;
    const opts = e.data.opts || {};

    self.postMessage({ type: 'progress', message: 'Parsing XLSX...', pct: 30 });

    const wb = XLSX.read(buffer, {
      type: 'array',
      cellDates: true,
      cellFormula: false,
      cellHTML: false,
      cellStyles: false,
      ...opts
    });

    self.postMessage({ type: 'progress', message: 'Conversion JSON...', pct: 70 });

    const sheetName = wb.SheetNames[0];
    const data = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { defval: '' });

    self.postMessage({ type: 'progress', message: 'Transfert...', pct: 90 });

    // Envoyer le résultat
    self.postMessage({ type: 'result', data: data, rows: data.length });

  } catch(err) {
    self.postMessage({ type: 'error', message: err.message || 'Erreur parsing Worker' });
  }
};
