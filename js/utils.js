// ═══════════════════════════════════════════════════════════════
// PRISME — utils.js
// Fonctions utilitaires pures (aucun accès DOM ni état global)
// Dépend de : constants.js
// ═══════════════════════════════════════════════════════════════
'use strict';

import { METIERS_STRATEGIQUES, SECTEUR_DIR_MAP } from './constants.js';

export function cleanCode(s) { return s ? s.toString().split('-')[0].trim() : ''; }

export function extractClientCode(val) {
  const s = (val || '').toString().trim();
  const idx = s.indexOf(' - ');
  return idx >= 0 ? s.slice(0, idx).trim() : s;
}

export function cleanPrice(v) {
  if (!v) return 0;
  const s = v.toString().replace(/\s/g, '').replace(/,/g, '.').replace(/[−–—]/g, '-');
  const n = parseFloat(s.replace(/[^0-9.\-]/g, ''));
  return isNaN(n) ? 0 : n;
}

export function cleanOmniPrice(v) {
  if (!v) return 0;
  const s = v.toString().replace(/\s/g, '').replace(/€/g, '').replace(/,/g, '.');
  return parseFloat(s) || 0;
}

export function formatEuro(n) {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n);
}

export function pct(p, t) { return t > 0 ? ((p / t) * 100).toFixed(1) + '%' : '0%'; }

export function parseExcelDate(v) {
  if (!v) return null;
  if (v instanceof Date) return isNaN(v.getTime()) ? null : v;
  if (typeof v === 'number') return new Date(Math.round((v - 25569) * 864e5));
  if (typeof v === 'string') {
    const c = v.split(' ')[0], p = c.split(/[-/]/);
    if (p.length === 3) {
      let [a, b, d] = p.map(x => parseInt(x, 10));
      if (isNaN(a) || isNaN(b) || isNaN(d)) return null;
      if (d < 100) d += 2000;
      if (a > 12) return new Date(d, b - 1, a);
      if (b > 12) return new Date(d, a - 1, b);
      return new Date(d, b - 1, a);
    }
    const x = new Date(v);
    return isNaN(x.getTime()) ? null : x;
  }
  return null;
}

export function daysBetween(a, b) { const d = b.getTime() - a.getTime(); return d > 0 ? Math.ceil(d / 864e5) : 0; }

// ── Column-name lookup cache (reset between datasets) ─────────────────────
// Avoids ~1M Object.keys + find + toLowerCase calls during the parse loops.
let _CC = { gv: {}, qty: {}, ca: {}, vmb: {} };
export function _resetColCache() { _CC = { gv: {}, qty: {}, ca: {}, vmb: {} }; }

export function getVal(r, ...k) {
  const cKey = k.join('\x00');
  let col = _CC.gv[cKey];
  if (col === undefined) {
    const ks = Object.keys(r);
    col = null;
    for (const p of k) {
      const f = ks.find(x => x.toLowerCase().includes(p.toLowerCase()));
      if (f !== undefined) { col = f; break; }
    }
    _CC.gv[cKey] = col;
  }
  return col !== null ? (r[col] ?? '') : '';
}

export function getQuantityColumn(r, t) {
  const tl = t.toLowerCase();
  let col = _CC.qty[tl];
  if (col === undefined) {
    const ks = Object.keys(r);
    let f = ks.find(k => { const l = k.toLowerCase(); return l.includes(tl) && (l.includes('qté') || l.includes('qte') || l.includes('qt') || l.includes('quantité')); });
    if (!f) f = ks.find(k => { const l = k.toLowerCase(); return l.includes(tl) && !l.includes('ca ') && !l.includes('vmb'); });
    _CC.qty[tl] = col = f || null;
  }
  return col ? parseFloat(r[col] || 0) : 0;
}

export function getCaColumn(r, t) {
  const tl = t.toLowerCase();
  let col = _CC.ca[tl];
  if (col === undefined) {
    const ks = Object.keys(r);
    const f = ks.find(k => { const l = k.toLowerCase(); return (l.includes('ca') || l.includes('montant')) && l.includes(tl); });
    _CC.ca[tl] = col = f || null;
  }
  return col ? parseFloat((r[col] || '').toString().replace(',', '.')) || 0 : 0;
}

export function getVmbColumn(r, t) {
  const tl = t.toLowerCase();
  let col = _CC.vmb[tl];
  if (col === undefined) {
    const ks = Object.keys(r);
    const f = ks.find(k => { const l = k.toLowerCase(); return l.includes('vmb') && l.includes(tl); });
    _CC.vmb[tl] = col = f || null;
  }
  return col ? parseFloat((r[col] || '').toString().replace(',', '.')) || 0 : 0;
}
// ──────────────────────────────────────────────────────────────────────────

export function extractStoreCode(row) {
  return (getVal(row, 'Code PDV', 'PDV', 'Code Agence', 'Agence', 'code pdv', 'code agence') || '').toString().trim().toUpperCase();
}

export function readExcel(f) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = e => { try { const w = XLSX.read(new Uint8Array(e.target.result), { type: 'array', cellDates: true, cellFormula: false, cellHTML: false, cellStyles: false }); res(XLSX.utils.sheet_to_json(w.Sheets[w.SheetNames[0]], { defval: '' })); } catch (e) { rej(e); } };
    r.onerror = () => rej(new Error('Lecture impossible'));
    r.readAsArrayBuffer(f);
  });
}

export function yieldToMain() { return new Promise(r => setTimeout(r, 0)); }

export function parseCSVText(text, sep) {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (!lines.length) return [];
  const headers = lines[0].split(sep).map(h => h.replace(/^"|"$/g, '').trim());
  const data = [];
  for (let i = 1; i < lines.length; i++) {
    const vals = lines[i].split(sep).map(v => v.replace(/^"|"$/g, '').trim());
    const row = {};
    for (let j = 0; j < headers.length; j++) row[headers[j]] = vals[j] || '';
    data.push(row);
  }
  return data;
}

export function getAgeBracket(d) { return d < 90 ? 'fresh' : d < 180 ? 'warm' : d <= 365 ? 'hot' : 'critical'; }

export function getAgeLabel(d) {
  if (d >= 999) return '—';
  if (d < 90) return d + 'j';
  if (d < 365) return Math.round(d / 30) + 'm';
  return (d / 365).toFixed(1) + 'a';
}

export function _median(arr) {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  const m = s.length;
  return m % 2 ? s[(m - 1) / 2] : (s[m / 2 - 1] + s[m / 2]) / 2;
}

export function _isMetierStrategique(metier) {
  const l = (metier || '').toLowerCase();
  return METIERS_STRATEGIQUES.some(m => l.includes(m));
}

export function _normalizeClassif(c) {
  const u = (c || '').toUpperCase().replace(/\s/g, '');
  if (u.includes('FID') && u.includes('POT+')) return 'FID Pot+';
  if (u.includes('FID') && u.includes('POT-')) return 'FID Pot-';
  if (u.includes('OCC') && u.includes('POT+')) return 'OCC Pot+';
  if (u.includes('OCC') && u.includes('POT-')) return 'OCC Pot-';
  return 'NC';
}

export function _classifShort(c) {
  const n = _normalizeClassif(c);
  if (n === 'FID Pot+') return '<span class="text-emerald-600 font-bold">FID+</span>';
  if (n === 'OCC Pot+') return '<span class="text-blue-600 font-bold">OCC+</span>';
  if (n === 'FID Pot-') return '<span class="text-gray-500">FID-</span>';
  if (n === 'OCC Pot-') return '<span class="text-gray-400">OCC-</span>';
  return '<span class="text-gray-300">NC</span>';
}

// ── Copy-code helpers ──────────────────────────────────────────────────────
export function _doCopyCode(btn, code) {
  navigator.clipboard.writeText(code).catch(() => {});
  const orig = btn.innerHTML;
  btn.innerHTML = '✅';
  setTimeout(() => { btn.innerHTML = orig; }, 1000);
}

export function _copyCodeBtn(code) {
  return `<button onclick="event.stopPropagation();_doCopyCode(this,'${code}')" title="Copier le code article" style="font-size:10px;line-height:1;vertical-align:middle;background:none;border:none;cursor:pointer;padding:0 2px;opacity:.55" class="hover:opacity-100 ml-0.5 inline-block align-middle">📋</button>`;
}

export function _copyAllCodesDirect(btn, codesCSV) {
  const codes = codesCSV.split(',').filter(Boolean);
  navigator.clipboard.writeText(codes.join('\n')).catch(() => {});
  const orig = btn.innerHTML;
  btn.innerHTML = `✅ ${codes.length} codes copiés`;
  setTimeout(() => { btn.innerHTML = orig; }, 1500);
}
// ──────────────────────────────────────────────────────────────────────────

export function _normalizeStatut(s) {
  const l = (s || '').toLowerCase();
  if (l.includes('prospect')) return 'Prospect';
  if (l.includes('perdu')) return 'Perdu';
  if (l.includes('inactif')) return 'Inactif';
  if (l.includes('actif')) return 'Actif';
  return 'Inactif';
}

export function fmtDate(d) {
  if (!d) return '?';
  return d.toLocaleDateString('fr-FR', { month: 'short', year: 'numeric' });
}

export function getSecteurDirection(code) {
  if (!code) return '';
  return SECTEUR_DIR_MAP[code.charAt(0).toUpperCase()] || '';
}
