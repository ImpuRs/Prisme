// ═══════════════════════════════════════════════════════════════
// PRISME — utils.js
// Fonctions utilitaires pures (aucun accès DOM ni état global)
// Dépend de : constants.js
// ═══════════════════════════════════════════════════════════════
'use strict';

import { METIERS_STRATEGIQUES, SECTEUR_DIR_MAP, FAMILLE_LOOKUP, FAMILLE_HORS_CATALOGUE } from './constants.js';

export function escapeHtml(s) {
  return String(s === null || s === undefined ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

export function formatLocalYMD(d) {
  const y = d.getFullYear(), m = d.getMonth() + 1, day = d.getDate();
  return `${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

// ── Recherche normalisée ───────────────────────────────────────
// Supprime les accents et met en minuscules pour la comparaison.
export function normalizeStr(str) {
  return (str || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

// Vérifie que tous les mots de `query` sont présents dans au moins
// un des champs fournis (recherche partielle, multi-mots, sans accents).
// Retourne true si query est vide.
export function matchQuery(query, ...fields) {
  const terms = normalizeStr(query).split(/\s+/).filter(Boolean);
  if (!terms.length) return true;
  const haystack = fields.map(f => normalizeStr(f)).join(' ');
  return terms.every(t => haystack.includes(t));
}

/** Pre-compile query terms once — call per filter change, not per row */
export function compileQuery(query) {
  const terms = normalizeStr(query).split(/\s+/).filter(Boolean);
  return terms.length ? terms : null;
}

/** Fast match against pre-compiled terms and pre-normalized haystack */
export function matchCompiled(terms, normalizedHaystack) {
  if (!terms) return true;
  for (let i = 0; i < terms.length; i++) {
    if (!normalizedHaystack.includes(terms[i])) return false;
  }
  return true;
}

// Sort helper used by large tables (avoids repeated toLowerCase() calls inside comparator).
// Mutates the input array (in-place).
export function sortRowsInPlace(rows, col, asc) {
  if (!Array.isArray(rows) || rows.length < 2) return rows;
  const cache = new WeakMap(); // row(object) -> normalized sort value
  const norm = (v) => (typeof v === 'string' ? v.toLowerCase() : v);
  rows.sort((a, b) => {
    const vA = cache.has(a) ? cache.get(a) : (cache.set(a, norm(a[col])), cache.get(a));
    const vB = cache.has(b) ? cache.get(b) : (cache.set(b, norm(b[col])), cache.get(b));
    if (vA < vB) return asc ? -1 : 1;
    if (vA > vB) return asc ? 1 : -1;
    return 0;
  });
  return rows;
}

export function cleanCode(s) { return s ? s.toString().split('-')[0].trim() : ''; }

export function extractClientCode(val) {
  const s = (val || '').toString().trim();
  const idx = s.indexOf(' - ');
  const code = idx >= 0 ? s.slice(0, idx).trim() : s;
  // Normaliser les codes numériques à 6 chiffres (1853 → 001853) pour matcher le Worker parse.
  // P1: charCode check au lieu de regex (hot path ~281k appels)
  let allDigit = code.length > 0;
  for (let i = 0; i < code.length; i++) { const c = code.charCodeAt(i); if (c < 48 || c > 57) { allDigit = false; break; } }
  return allDigit ? code.padStart(6, '0') : code;
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

const _FMT_EUR = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
export function formatEuro(n) {
  return _FMT_EUR.format(n);
}

export function buildPctBar(pct, {
  color    = 'var(--c-action)',
  bgColor  = 'var(--s-card-alt)',
  height   = 6,
  showLabel = false,
  animated  = true,
  max       = 100,
  radius    = 'var(--r-sm)',
  gradient  = false,
  glow      = false,
} = {}) {
  const clamped = Math.min(100, Math.max(0, max > 0 ? (pct / max) * 100 : 0));
  const fill = gradient
    ? `linear-gradient(90deg, ${color}, var(--c-info, #38bdf8))`
    : color;
  const glowStyle = (glow && clamped > 80)
    ? `;box-shadow:0 0 8px 1px ${color}40`
    : '';
  const label = showLabel
    ? `<span style="font-size:var(--fs-2xs);font-weight:var(--fw-bold);color:${color};margin-left:var(--sp-1);white-space:nowrap;font-variant-numeric:tabular-nums">${Math.round(clamped)}%</span>`
    : '';
  return `<div style="display:flex;align-items:center;gap:4px;width:100%"><div style="flex:1;height:${height}px;background:${bgColor};border-radius:${radius};overflow:hidden"><div style="width:${clamped}%;height:100%;background:${fill};border-radius:${radius}${animated ? ';transition:width .5s ease' : ''}${glowStyle}"></div></div>${label}</div>`;
}

export function buildSparklineSVG(values, {
  color   = 'var(--c-action)',
  width   = 80,
  height  = 20,
  filled  = false,
  dotLast = true,
} = {}) {
  if (!values?.length || values.length < 2) return '';
  const min = Math.min(...values), max = Math.max(...values);
  const range = max - min || 1;
  const pad = 2;
  const pts = values.map((v, i) => {
    const x = (i / (values.length - 1)) * (width - pad * 2) + pad;
    const y = height - pad - ((v - min) / range) * (height - pad * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const polyline = `<polyline points="${pts.join(' ')}" fill="none" stroke="${color}" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"/>`;
  const area = filled ? (() => {
    const first = pts[0].split(',');
    const last  = pts[pts.length - 1].split(',');
    return `<polygon points="${pts.join(' ')} ${last[0]},${height} ${first[0]},${height}" fill="${color}" opacity="0.12"/>`;
  })() : '';
  const dot = dotLast ? (() => {
    const [lx, ly] = pts[pts.length - 1].split(',');
    return `<circle cx="${lx}" cy="${ly}" r="2.5" fill="${color}"/>`;
  })() : '';
  return `<svg viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" aria-hidden="true" style="display:block;overflow:visible">${area}${polyline}${dot}</svg>`;
}

export function buildDeltaBadge(current, previous, {
  format = 'pct',
  invert = false,
} = {}) {
  if (!previous || previous === 0) return '';
  const delta = current - previous;
  const pctVal = ((delta / Math.abs(previous)) * 100).toFixed(1);
  const isPositive = delta >= 0;
  const isGood = invert ? !isPositive : isPositive;
  const cls = delta === 0 ? 'chip-muted' : isGood ? 'chip-ok' : 'chip-danger';
  const sign = delta > 0 ? '+' : '';
  let label;
  if (format === 'pct')       label = `${sign}${pctVal}%`;
  else if (format === 'abs')  label = `${sign}${Math.round(delta).toLocaleString('fr')}`;
  else                        label = `${sign}${pctVal}% (${sign}${Math.round(delta).toLocaleString('fr')})`;
  return `<span class="chip chip-xs ${cls}" style="background:transparent;border:none">${label}</span>`;
}

export function buildSkeletonTable(rows = 8, cols = 5) {
  const widths = ['sk-short', 'sk-long', 'sk-medium', 'sk-full', 'sk-short'];
  const trs = Array.from({ length: rows }, (_, r) =>
    `<tr>${Array.from({ length: cols }, (_, c) =>
      `<td class="px-3 py-2"><div class="skeleton skeleton-row ${widths[(r + c) % widths.length]}"></div></td>`
    ).join('')}</tr>`
  ).join('');
  return `<table class="min-w-full"><tbody>${trs}</tbody></table>`;
}

export function buildSkeletonCards(count = 4) {
  return `<div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:16px">${Array.from({ length: count }, () => '<div class="skeleton skeleton-kpi"></div>').join('')}</div>`;
}

/**
 * buildEvidenceCard — carte métier scannable pour le cockpit briefing
 */
export function buildEvidenceCard({ icon, value, label, severity = 'muted', cta = '', ctaFn = '', sparkline = '' }) {
  const ctaHtml = cta
    ? `<span class="evidence-cta" onclick="${ctaFn}" role="button" tabindex="0">${cta} →</span>`
    : '';
  return `<div class="evidence-card evidence-card--${severity}" ${ctaFn ? `onclick="${ctaFn}" role="button" tabindex="0"` : ''}>
    <div class="evidence-icon">${icon}</div>
    <div class="evidence-value">${value}</div>
    <div class="evidence-label">${label}</div>
    ${sparkline ? `<div style="margin-top:4px">${sparkline}</div>` : ''}
    ${ctaHtml}
  </div>`;
}

export function pct(p, t) { return t > 0 ? ((p / t) * 100).toFixed(1) + '%' : '0%'; }

export function parseExcelDate(v) {
  if (!v && v !== 0) return null;
  if (v instanceof Date) return isNaN(v.getTime()) ? null : v;
  // Numéro sérial Excel (cellDates:false) — plage réaliste 2009-2036
  if (typeof v === 'number') {
    if (v > 39000 && v < 60000) return new Date(Math.round((v - 25569) * 864e5));
    return null; // nombre hors plage dates : pas une date
  }
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

export function readExcel(f, onProgress) {
  // Fichiers < 20 Mo : inline (rapide, pas d'overhead Worker)
  if (f.size < 20 * 1024 * 1024) {
    return new Promise((res, rej) => {
      const r = new FileReader();
      r.onerror = () => rej(new Error('Lecture impossible'));
      r.onload = e => {
        try {
          const wb = XLSX.read(new Uint8Array(e.target.result), {
            type: 'array', dense: true, cellDates: false,
            cellFormula: false, cellHTML: false, cellStyles: false
          });
          res(_wsToHR(wb.Sheets[wb.SheetNames[0]]));
        } catch(err) { rej(err); }
      };
      r.readAsArrayBuffer(f);
    });
  }

  // Fichiers >= 20 Mo : Worker (pas de freeze UI)
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onerror = () => rej(new Error('Lecture impossible'));
    r.onload = e => {
      const worker = new Worker('js/xlsx-worker.js');
      worker.onmessage = evt => {
        const msg = evt.data;
        if (msg.type === 'progress' && onProgress) onProgress(msg.msg, msg.pct);
        else if (msg.type === 'result') { worker.terminate(); res(msg.data); }
        else if (msg.type === 'error') { worker.terminate(); rej(new Error(msg.msg)); }
      };
      worker.onerror = err => { worker.terminate(); rej(new Error('Worker: ' + err.message)); };
      const buf = e.target.result;
      worker.postMessage({buffer: buf}, [buf]);
    };
    r.readAsArrayBuffer(f);
  });
}

// ws['!data'] (dense:true) → {headers, rows} — valeurs brutes, pas de formatage
export function _wsToHR(ws) {
  const raw = ws['!data'] || [];
  if (!raw.length) return { headers: [], rows: [] };
  const headers = (raw[0] || []).map(cell => cell != null && cell.v != null ? String(cell.v).trim() : '');
  const nCols = headers.length;
  const rows = [];
  for (let r = 1; r < raw.length; r++) {
    const src = raw[r];
    const row = new Array(nCols);
    if (src) {
      for (let c = 0; c < nCols; c++) {
        const cell = src[c];
        row[c] = cell != null ? (cell.v != null ? cell.v : '') : '';
      }
    } else {
      row.fill('');
    }
    rows.push(row);
  }
  return { headers, rows };
}

// Converts {headers, rows} → array of objects (for small-file parsers)
export function readExcelAsObjects({ headers, rows }) {
  return rows.map(r => Object.fromEntries(headers.map((h, i) => [h, r[i] ?? ''])));
}

export function yieldToMain() { return new Promise(r => setTimeout(r, 0)); }

export function parseCSVTextToHR(text, sep) {
  // Parser RFC 4180 — gère : champs quotés, séparateur dans un champ,
  // guillemets échappés (""), sauts de ligne dans un champ quoté.
  // Retourne {headers: string[], rows: string[][]} — pas d'objet par ligne.
  if (!text) return { headers: [], rows: [] };

  // Normaliser les fins de ligne (une seule fois).
  let src = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  // BOM UTF-8 éventuel
  if (src.charCodeAt(0) === 0xfeff) src = src.slice(1);

  // Fast-path sans guillemets : cas majoritaire des exports Qlik.
  if (src.indexOf('"') === -1) {
    const len = src.length;
    let pos = 0;
    const nextLine = () => {
      if (pos > len) return null;
      const nl = src.indexOf('\n', pos);
      if (nl === -1) { const line = src.slice(pos); pos = len + 1; return line; }
      const line = src.slice(pos, nl);
      pos = nl + 1;
      return line;
    };
    let headerLine = '';
    while (true) {
      const ln0 = nextLine();
      if (ln0 === null) return { headers: [], rows: [] };
      if (ln0.trim()) { headerLine = ln0; break; }
    }
    const headers = headerLine.split(sep).map(s => s.trim());
    const rows = [];
    let line;
    while ((line = nextLine()) !== null) {
      if (!line) continue;
      const cells = line.split(sep);
      let hasData = false;
      for (let c = 0; c < cells.length; c++) {
        const v = cells[c].trim();
        cells[c] = v;
        if (v) hasData = true;
      }
      if (hasData) rows.push(cells);
    }
    return { headers, rows };
  }

  // Slow-path RFC 4180 complet (guillemets présents)
  const rows = [];
  let cur = [];
  let field = '';
  let inQuotes = false;
  let i = 0;
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

  if (!rows.length) return { headers: [], rows: [] };

  const headers = rows[0];
  return { headers, rows: rows.slice(1) };
}

export function parseCSVText(text, sep) {
  const hr = parseCSVTextToHR(text, sep);
  if (!hr.headers.length) return [];
  const { headers, rows } = hr;
  const data = new Array(rows.length);
  for (let r = 0; r < rows.length; r++) {
    const rowObj = {};
    const cells = rows[r];
    for (let c = 0; c < headers.length; c++) {
      rowObj[headers[c]] = cells?.[c] ?? '';
    }
    data[r] = rowObj;
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

/**
 * Extrait le CODE famille depuis n'importe quel format :
 * "C02 - Coupe" → "C02"  |  "Coupe" → cherche dans FAMILLE_LOOKUP → "C02"  |  "C02" → "C02"
 * Utilisé au PARSING pour alimenter _S.articleFamille
 */
export function extractFamCode(raw) {
  if (!raw) return '';
  const s = raw.toString().trim();
  // Format "CODE - Libellé" → extraire le code
  const m = s.match(/^([A-Z]\d{2,3}|\d{2,3})\s*-\s*/);
  if (m) return m[1];
  // Si c'est déjà un code pur (ex: "C02" ou "00")
  if (/^([A-Z]\d{2,3}|\d{2,3})$/.test(s)) return s;
  // Libellé brut — chercher dans FAMILLE_LOOKUP
  const sL = s.toLowerCase();
  for (const [code, lib] of Object.entries(FAMILLE_LOOKUP)) {
    if (lib.toLowerCase() === sL) return code;
  }
  // Libellé inconnu du référentiel — retourner tel quel
  return s;
}

/**
 * Retourne le libellé d'affichage pour un code famille.
 * "C02" → "Coupe"  |  "Coupe" (libellé brut) → "Coupe"  |  "" → ""
 * Utilisé dans les tableaux et comparaisons internes.
 */
export function famLib(code) {
  if (!code) return '';
  return FAMILLE_LOOKUP[code] || code;
}

/**
 * Retourne le label complet "CODE · Libellé" pour l'affichage dans les selects/filtres.
 * "C02" → "C02 · Coupe"  |  codes hors catalogue → libellé seul  |  code inconnu → code tel quel
 */
export function famLabel(code) {
  if (!code) return '';
  const lib = FAMILLE_LOOKUP[code];
  if (!lib) return `(${code})`;
  if (FAMILLE_HORS_CATALOGUE.has(code)) return lib;
  return `${code} · ${lib}`;
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

// ── Haversine — distance en km entre deux coordonnées GPS ─────
export function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
