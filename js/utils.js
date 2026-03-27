// ═══════════════════════════════════════════════════════════════
// PRISME — utils.js
// Fonctions utilitaires pures (aucun accès DOM ni état global)
// Dépend de : constants.js
// ═══════════════════════════════════════════════════════════════
'use strict';

import { METIERS_STRATEGIQUES, SECTEUR_DIR_MAP } from './constants.js';

export function escapeHtml(s) {
  return String(s === null || s === undefined ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

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
    const s = v.split(' ')[0]; // strip time part
    const p = s.split(/[-/]/);
    if (p.length === 3) {
      const n = p.map(x => parseInt(x, 10));
      if (n.some(isNaN)) return null;
      // Format ISO : YYYY-MM-DD (premier segment > 31 → c'est l'année)
      if (n[0] > 31) {
        // YYYY-MM-DD
        return new Date(n[0], n[1] - 1, n[2]);
      }
      // Format DD-MM-YYYY ou DD/MM/YYYY (dernier segment > 31 → c'est l'année)
      if (n[2] > 31) {
        return new Date(n[2], n[1] - 1, n[0]);
      }
      // Ambiguité MM-DD-YY ou DD-MM-YY : compléter l'année si < 100
      let [a, b, d] = n;
      if (d < 100) d += 2000;
      // Si a > 12 → a est forcément le jour, b le mois
      if (a > 12) return new Date(d, b - 1, a);
      // Si b > 12 → b est forcément le jour, a le mois
      if (b > 12) return new Date(d, a - 1, b);
      // Défaut : DD-MM-YYYY (convention française)
      return new Date(d, b - 1, a);
    }
    // Fallback : laisser le moteur JS parser (formats RFC2822, etc.)
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
  // Ne pas utiliser getVal ici — son cache _CC peut être contaminé entre consommé et stock
  const keys = Object.keys(row);
  const key = keys.find(k => {
    const kl = k.toLowerCase().replace(/[\r\n]/g, ' ').trim();
    return kl === 'code pdv' || kl === 'pdv' || kl === 'code agence' || kl === 'agence' || kl === 'code depot' || kl === 'dépôt' || kl === 'depot';
  });
  return key ? (row[key] || '').toString().trim().toUpperCase() : '';
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
  // Parser RFC 4180 — gère : champs quotés, séparateur dans un champ,
  // guillemets échappés (""), sauts de ligne dans un champ quoté.
  const rows = [];
  let cur = [];
  let field = '';
  let inQuotes = false;
  let i = 0;

  // Normaliser les fins de ligne
  const src = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const len = src.length;

  while (i <= len) {
    const ch = i < len ? src[i] : null;

    if (inQuotes) {
      if (ch === '"') {
        // Guillemet échappé ("") ou fin de champ quoté
        if (i + 1 < len && src[i + 1] === '"') {
          field += '"';
          i += 2;
        } else {
          inQuotes = false;
          i++;
        }
      } else if (ch === null) {
        // Fin de fichier dans un champ quoté — on sort quand même
        cur.push(field);
        rows.push(cur);
        break;
      } else {
        field += ch;
        i++;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
        i++;
      } else if (ch === sep) {
        cur.push(field.trim());
        field = '';
        i++;
      } else if (ch === '\n' || ch === null) {
        cur.push(field.trim());
        if (cur.some(f => f !== '')) rows.push(cur); // ignorer lignes vides
        cur = [];
        field = '';
        i++;
      } else {
        field += ch;
        i++;
      }
    }
  }

  if (!rows.length) return [];

  // Première ligne = headers
  const headers = rows[0];
  const data = [];
  for (let r = 1; r < rows.length; r++) {
    const row = {};
    for (let c = 0; c < headers.length; c++) {
      row[headers[c]] = rows[r][c] ?? '';
    }
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

export function normFam(f) {
  return f ? f.replace(/^[A-Z]\d{2,3} - /, '') : f;
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
  return `<button onclick="event.stopPropagation();_doCopyCode(this,'${code}')" title="Copier le code article" style="font-size:var(--fs-xs);line-height:1;vertical-align:middle;background:none;border:none;cursor:pointer;padding:0 2px;opacity:.55" class="hover:opacity-100 ml-0.5 inline-block align-middle">📋</button>`;
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
