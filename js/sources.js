// © 2026 Jawad El Barkaoui — Tous droits réservés
// PRISME — sources.js
// Mise à jour des fichiers par fusion, sans reconstituer de fichier complet :
//   • PRISME garde une copie (compressée) des derniers fichiers dans la base PRISME_SOURCES
//     (séparée : non touchée par « Purger le cache ») ;
//   • Consommé : fusion par (mois × agence) — chaque couple mois/agence présent dans le nouveau fichier
//     remplace celui gardé ; le reste est gardé ; fenêtre de 24 mois glissants ;
//   • Chalandise : fusion client par client, le nouvel export l'emporte ; les clients absents du nouvel
//     export sont gardés, marqués « Dans le dernier export = non » ;
//   • État du stock : photo à date → simple remplacement.
// Branché au début de processData() : les fichiers fusionnés remplacent ceux des champs de chargement.
// ═══════════════════════════════════════════════════════════════
'use strict';

import { _S } from './state.js';
import { showLoading, hideLoading } from './ui.js';

const DB = 'PRISME_SOURCES', ST = 'kv';
const MONTHS_KEEP = 24;
const MOIS = { janv: 1, jan: 1, fevr: 2, fev: 2, mars: 3, mar: 3, avr: 4, mai: 5, juin: 6, juil: 7, aout: 8, sept: 9, sep: 9, oct: 10, nov: 11, dec: 12 };
let _info = { consomme: null, chalandise: null, stock: null }; // métadonnées (sans les fichiers)
let _merge = true;

// ── IndexedDB ──
function _open() {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(ST);
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
}
async function _get(k) { const db = await _open(); try { return await new Promise((res, rej) => { const q = db.transaction(ST).objectStore(ST).get(k); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); }); } finally { db.close(); } }
async function _put(k, v) { const db = await _open(); try { const tx = db.transaction(ST, 'readwrite'); tx.objectStore(ST).put(v, k); await new Promise((res, rej) => { tx.oncomplete = res; tx.onerror = () => rej(tx.error); }); } finally { db.close(); } }
async function _del(k) { const db = await _open(); try { const tx = db.transaction(ST, 'readwrite'); tx.objectStore(ST).delete(k); await new Promise((res, rej) => { tx.oncomplete = res; tx.onerror = () => rej(tx.error); }); } finally { db.close(); } }
async function _clear() { const db = await _open(); try { const tx = db.transaction(ST, 'readwrite'); tx.objectStore(ST).clear(); await new Promise((res, rej) => { tx.oncomplete = res; tx.onerror = () => rej(tx.error); }); } finally { db.close(); } }

// ── Compression ──
async function _pack(text) {
  if (typeof CompressionStream === 'undefined') return { gz: false, blob: new Blob([text]) };
  const blob = await new Response(new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'))).blob();
  return { gz: true, blob };
}
async function _unpack(rec) {
  if (!rec?.blob) return '';
  if (!rec.gz) return await rec.blob.text();
  return await new Response(rec.blob.stream().pipeThrough(new DecompressionStream('gzip'))).text();
}

// ── Lecture de fichier en texte CSV ──
async function _fileText(file) {
  if (/\.(xlsx|xls)$/i.test(file.name)) {
    const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
    return XLSX.utils.sheet_to_csv(wb.Sheets[wb.SheetNames[0]], { FS: ';', blankrows: false });
  }
  const buf = await file.arrayBuffer();
  try { return new TextDecoder('utf-8', { fatal: true }).decode(buf); }
  catch (_) { return new TextDecoder('windows-1252').decode(buf); }
}
const _norm = (h) => String(h || '').replace(/^﻿/, '').trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ');
function _sepOf(line) { const c = { ';': 0, ',': 0, '\t': 0 }; for (const ch of line) if (ch in c) c[ch]++; return Object.entries(c).sort((a, b) => b[1] - a[1])[0][0]; }
function _split(line, sep) {
  if (line.indexOf('"') === -1) return line.split(sep);
  const out = []; let cur = '', q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) { if (ch === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch; }
    else if (ch === '"') q = true; else if (ch === sep) { out.push(cur); cur = ''; } else cur += ch;
  }
  out.push(cur); return out;
}
const _quote = (v, sep) => (/["\n\r]/.test(v) || v.includes(sep)) ? `"${v.replace(/"/g, '""')}"` : v;
function _table(text) {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/);
  let h = 0; while (h < lines.length && !lines[h].trim()) h++;
  const sep = _sepOf(lines[h] || '');
  const header = _split(lines[h] || '', sep).map(x => x.trim());
  return { sep, header, norm: header.map(_norm), lines: lines.slice(h + 1).filter(l => l.trim()) };
}
/** Convertit une ligne d'une table vers l'ordre de colonnes d'une autre (par nom de colonne). */
function _remapper(from, to) {
  const same = from.sep === to.sep && from.norm.join('|') === to.norm.join('|');
  if (same) return (line) => line;
  const idx = to.norm.map(n => from.norm.indexOf(n));
  return (line) => { const f = _split(line, from.sep); return idx.map(i => _quote(i >= 0 ? (f[i] ?? '') : '', to.sep)).join(to.sep); };
}

// ── Consommé : clé (mois × agence) ──
function _consoKey(t) {
  const iA = t.norm.indexOf('annee'), iM = t.norm.indexOf('mois'), iJ = t.norm.indexOf('jour'), iP = t.norm.indexOf('code pdv');
  return (line) => {
    const f = _split(line, t.sep);
    let y = 0, m = 0;
    if (iA >= 0 && iM >= 0) {
      y = parseInt(f[iA], 10);
      const mm = _norm(f[iM]).replace(/\./g, '');
      m = MOIS[mm] || MOIS[mm.slice(0, 4)] || MOIS[mm.slice(0, 3)] || parseInt(mm, 10) || 0;
    }
    if ((!y || !m) && iJ >= 0) {
      const j = String(f[iJ] || '');
      let r = j.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/); if (r) { y = +r[3]; m = +r[2]; }
      else { r = j.match(/^(\d{4})-(\d{2})/); if (r) { y = +r[1]; m = +r[2]; } }
    }
    const ym = y && m ? y * 12 + (m - 1) : 0;
    return { ym, pdv: iP >= 0 ? (f[iP] || '').trim() : '' };
  };
}
async function _mergeConsomme(baseText, files) {
  const news = [];
  for (const f of files) news.push(_table(await _fileText(f)));
  const base = baseText ? _table(baseText) : null;
  const ref = base || news[0];
  const replaced = new Set();
  const lines = [], yms = [], pdvs = [];
  for (const t of news) {
    const key = _consoKey(t), remap = _remapper(t, ref);
    for (const l of t.lines) { const k = key(l); replaced.add(k.ym + '|' + k.pdv); lines.push(remap(l)); yms.push(k.ym); pdvs.push(k.pdv); }
  }
  const nouvelles = lines.length;
  let kept = 0;
  if (base) {
    const key = _consoKey(base);
    for (const l of base.lines) { const k = key(l); if (replaced.has(k.ym + '|' + k.pdv)) continue; lines.push(l); yms.push(k.ym); pdvs.push(k.pdv); kept++; }
  }
  // Fenêtre : 24 mois glissants à partir du mois le plus récent
  let maxYm = 0; for (const y of yms) if (y > maxYm) maxYm = y;
  const minKeep = maxYm - (MONTHS_KEEP - 1);
  const out = [ref.header.map(h => _quote(h, ref.sep)).join(ref.sep)];
  const stores = new Set(); let minYm = Infinity;
  for (let i = 0; i < lines.length; i++) {
    if (yms[i] && yms[i] < minKeep) continue;
    out.push(lines[i]);
    if (pdvs[i]) stores.add(pdvs[i]);
    if (yms[i] && yms[i] < minYm) minYm = yms[i];
  }
  return { text: out.join('\n'), meta: { lignes: out.length - 1, kept, nouvelles, mois: [minYm === Infinity ? 0 : minYm, maxYm], agences: stores.size } };
}

// ── Chalandise : clé client ──
const FLAG = 'Dans le dernier export';
async function _mergeChalandise(baseText, files) {
  const news = [];
  for (const f of files) news.push(_table(await _fileText(f)));
  const ref = news[0];                       // le nouvel export fait foi pour les colonnes
  const iFlagRef = ref.norm.indexOf(_norm(FLAG));
  const outHeader = iFlagRef >= 0 ? ref.header : [...ref.header, FLAG];
  const outT = { sep: ref.sep, header: outHeader, norm: outHeader.map(_norm) };
  const cc = (t) => { const i = t.norm.indexOf('code client'); return (l) => String(_split(l, t.sep)[i] || '').trim().replace(/^0+(?=\d)/, '').padStart(6, '0'); };
  const setFlag = (line, v) => { const f = _split(line, outT.sep); const i = outT.norm.indexOf(_norm(FLAG)); while (f.length < outT.header.length) f.push(''); f[i] = v; return f.map(x => _quote(x, outT.sep)).join(outT.sep); };
  const rows = new Map();
  for (const t of news) { const k = cc(t), remap = _remapper(t, outT); for (const l of t.lines) rows.set(k(l), setFlag(remap(l), 'oui')); }
  let absents = 0;
  if (baseText) {
    const base = _table(baseText); const k = cc(base), remap = _remapper(base, outT);
    for (const l of base.lines) { const c = k(l); if (!rows.has(c)) { rows.set(c, setFlag(remap(l), 'non')); absents++; } }
  }
  const text = [outHeader.map(h => _quote(h, outT.sep)).join(outT.sep), ...rows.values()].join('\n');
  return { text, meta: { clients: rows.size, absents } };
}

const _asFile = (text, name, t) => new File(['\uFEFF' + text], name, { type: 'text/csv', lastModified: t || Date.now() });
const _day = (t) => new Date(t).toISOString().slice(0, 10);
function _setInput(id, files) {
  const el = document.getElementById(id); if (!el) return;
  const dt = new DataTransfer(); files.forEach(f => dt.items.add(f)); el.files = dt.files;
}
// Les fichiers restitués portent la date de leur mise à jour (lastModified) : le contrôle « fichiers inchangés »
// de processData reconnaît alors le même jeu et évite de tout réanalyser.

async function _prepConsomme(now) {
  const inC = [...(document.getElementById('fileConsomme')?.files || [])];
  const rec = await _get('consomme');
  if (inC.length) {
    if (inC.length === 1 && /^PRISME_consomme_fusionne/.test(inC[0].name)) return;
    const { text, meta } = await _mergeConsomme(_merge && rec ? await _unpack(rec) : '', inC);
    await _put('consomme', { ...(await _pack(text)), meta, updated: now, from: inC.map(f => f.name) });
    _setInput('fileConsomme', [_asFile(text, `PRISME_consomme_fusionne_${_day(now)}.csv`, now)]);
    if (rec && _merge) window.showToast?.(`Consommé fusionné : ${meta.nouvelles.toLocaleString('fr-FR')} lignes nouvelles, ${meta.kept.toLocaleString('fr-FR')} gardées`, 'info', 4000);
  } else if (rec) {
    _setInput('fileConsomme', [_asFile(await _unpack(rec), `PRISME_consomme_fusionne_${_day(rec.updated)}.csv`, rec.updated)]);
  }
}
async function _prepChalandise(now) {
  const inH = [...(document.getElementById('fileChalandise')?.files || [])];
  const rec = await _get('chalandise');
  if (inH.length) {
    if (inH.length === 1 && /^PRISME_chalandise_fusionnee/.test(inH[0].name)) return;
    const { text, meta } = await _mergeChalandise(_merge && rec ? await _unpack(rec) : '', inH);
    await _put('chalandise', { ...(await _pack(text)), meta, updated: now, from: inH.map(f => f.name) });
    _setInput('fileChalandise', [_asFile(text, `PRISME_chalandise_fusionnee_${_day(now)}.csv`, now)]);
  } else if (rec) {
    _setInput('fileChalandise', [_asFile(await _unpack(rec), `PRISME_chalandise_fusionnee_${_day(rec.updated)}.csv`, rec.updated)]);
  }
}
async function _prepStock(now) {
  const inS = document.getElementById('fileStock')?.files?.[0];
  const rec = await _get('stock');
  if (inS) {
    if (rec && inS.name === rec.name && inS.lastModified === rec.lastModified) return; // déjà le fichier gardé
    await _put('stock', { blob: inS, gz: false, name: inS.name, lastModified: inS.lastModified, updated: now });
    await _del('zzat'); // nouvel état du stock : l'ancien ZZAT018 ne fait plus foi
  } else if (rec) {
    _setInput('fileStock', [new File([rec.blob], rec.name || 'PRISME_stock_garde.csv', { lastModified: rec.lastModified || rec.updated })]);
  }
}

/** Appelé au début de processData() (et à la sélection d'une chalandise, données déjà chargées) :
 *  fusionne les nouveaux fichiers avec ceux gardés, ou restitue les fichiers gardés, et met la base à jour. */
export async function prepareSources(only) {
  if (_S.lowMemMode) return;                 // mobile : pas de copie des fichiers (mémoire)
  const now = Date.now();
  const steps = { consomme: _prepConsomme, chalandise: _prepChalandise, stock: _prepStock };
  const label = { consomme: 'consommé', chalandise: 'chalandise', stock: 'état du stock' };
  for (const k of only ? [only] : Object.keys(steps)) {
    try { showLoading('Mise à jour des fichiers…', label[k]); await steps[k](now); }
    catch (e) {
      console.warn('[PRISME] Fusion ' + k + ' impossible :', e);
      window.showToast?.(`Fusion ${k} impossible (${e.message}) — analyse avec le fichier choisi`, 'warning', 7000);
    }
  }
  hideLoading();
  await refreshSourcesPanel();
}

// ── ZZAT018 (Base articles › Rafraîchir stock) : gardé à côté de l'état du stock et réappliqué à chaque
// analyse (pipeline._postParseMain), jusqu'au prochain état du stock déposé.
export async function saveZzat(text, name, lastModified) {
  if (_S.lowMemMode) return false;
  await _put('zzat', { ...(await _pack(text)), name, lastModified: lastModified || Date.now(), updated: Date.now() });
  return true;
}
export async function getZzat() {
  if (_S.lowMemMode) return null;
  try { const rec = await _get('zzat'); return rec ? { text: await _unpack(rec), name: rec.name, updated: rec.updated } : null; }
  catch (_) { return null; }
}

// ── Panneau « Fichiers gardés » (écran de chargement) ──
const _ymLabel = (ym) => ym ? new Date(Math.floor(ym / 12), ym % 12, 1).toLocaleDateString('fr-FR', { month: 'short', year: 'numeric' }) : '?';
const _d = (t) => t ? new Date(t).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }) : '';
export async function refreshSourcesPanel() {
  let c = null, h = null, s = null, z = null;
  try { [c, h, s, z] = await Promise.all([_get('consomme'), _get('chalandise'), _get('stock'), _get('zzat')]); } catch (_) {}
  _info = { consomme: c ? { meta: c.meta, updated: c.updated } : null, chalandise: h ? { meta: h.meta, updated: h.updated } : null, stock: s ? { name: s.name, updated: s.updated } : null };
  window.__prismeSources = { consomme: !!c, stock: !!s, chalandise: !!h };
  const el = document.getElementById('sourcesPanel');
  if (!el) return;
  if (!c && !h && !s) { el.innerHTML = ''; return; }
  const row = (label, txt) => `<div class="pt-row pt-between" style="gap:12px;padding:8px 0;border-top:1px solid var(--pt-line)"><span class="pt-strong">${label}</span><span class="pt-small pt-muted" style="text-align:right">${txt}</span></div>`;
  el.innerHTML = `<section class="pt-card pt-col" style="gap:10px">
    <div class="pt-col" style="gap:4px">
      <span class="pt-eyebrow">Fichiers gardés</span>
      <span class="pt-small pt-muted">Pour mettre à jour, dépose seulement le nouvel extrait (ex. le dernier mois de consommé, la nouvelle chalandise) puis Analyser : PRISME le fusionne avec ce qu'il a gardé. Sans nouveau fichier, Analyser repart des fichiers gardés.</span>
    </div>
    ${c ? row('Consommé', `${_ymLabel(c.meta?.mois?.[0])} → ${_ymLabel(c.meta?.mois?.[1])} · ${c.meta?.agences || '?'} agences · ${(c.meta?.lignes || 0).toLocaleString('fr-FR')} lignes · mis à jour le ${_d(c.updated)}`) : ''}
    ${h ? row('Chalandise', `${(h.meta?.clients || 0).toLocaleString('fr-FR')} clients${h.meta?.absents ? ` (dont ${h.meta.absents.toLocaleString('fr-FR')} absents du dernier export, gardés)` : ''} · mis à jour le ${_d(h.updated)}`) : ''}
    ${s ? row('État du stock', `${s.name || ''} · du ${_d(s.updated)}`) : ''}
    ${z ? row('ZZAT018', `${z.name || ''} · du ${_d(z.updated)} — stock, MIN/MAX ERP et liste des articles de l'agence`) : ''}
    <div class="pt-row pt-between" style="gap:12px;flex-wrap:wrap;padding-top:6px">
      <label class="pt-row pt-small" style="gap:8px;cursor:pointer"><input type="checkbox" ${_merge ? 'checked' : ''} onchange="window._sourcesMerge(this.checked)"> Fusionner les nouveaux fichiers avec ceux gardés <span class="pt-muted">(sinon : ils remplacent)</span></label>
      <button type="button" class="pt-link pt-small" style="color:var(--pt-low)" onclick="window._sourcesForget()">Oublier les fichiers gardés</button>
    </div>
  </section>`;
  window._updateAnalyserBtn?.();
}

window._sourcesMerge = (v) => { _merge = !!v; };
window._sourcesForget = async () => {
  if (!confirm('Oublier les fichiers gardés ? La prochaine analyse demandera des fichiers complets.')) return;
  try { await _clear(); } catch (_) {}
  await refreshSourcesPanel();
};

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => refreshSourcesPanel());
  else refreshSourcesPanel();
}
