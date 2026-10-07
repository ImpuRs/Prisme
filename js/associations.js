// © 2026 Jawad El Barkaoui — Tous droits réservés
// PRISME — associations.js
// Associations : familles qui s'achètent ensemble chez toi (détectées, lift) + paires manuelles
// ═══════════════════════════════════════════════════════════════
'use strict';

import { _S } from './state.js';
import { formatEuro, escapeHtml, _isMetierStrategique } from './utils.js';
import { FAM_LETTER_UNIVERS } from './constants.js';
import { _saveSessionToIDB } from './cache.js';
import { getVentesHorsMagFullMap } from './sales.js';

// ═══════════════════════════════════════════════════════════════
// Données persistées : _S._associations = [{id, famA, famB, famC?, label, dateCreated}]
// ═══════════════════════════════════════════════════════════════

/** Initialise la structure si absente */
function _ensureAssoc() {
  if (!_S._associations) _S._associations = [];
}

/** Filtre métier actif pour le Labo (module-level, pas persisté) */
let _assocMetierFilter = '';
/** Filtre stratégique : '' | 'strat' | 'hors' */
let _assocStratFilter = '';
/** Filtre univers pour l'étape 2 : '' | 'E' | 'O' | ... */
let _assocUniversFilter = '';

/** Teste si un client passe le filtre métier + strat actif */
function _clientPassesAssocFilter(cc) {
  const mf = _assocMetierFilter;
  const sf = _assocStratFilter;
  if (!mf && !sf) return true;
  const metier = _S.chalandiseData?.get(cc)?.metier || '';
  if (mf === '__nonclasse__') {
    return !metier || metier.length <= 2 || /^[-–—\s.]+$/.test(metier);
  }
  if (mf) return metier === mf;
  // Pas de métier individuel mais filtre strat/hors actif
  if (sf === 'strat') return _isMetierStrategique(metier);
  if (sf === 'hors') return metier.length > 2 && !_isMetierStrategique(metier);
  return true;
}

/** Génère un ID court */
function _assocId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

// ═══════════════════════════════════════════════════════════════
// Calcul du taux d'association par agence (via ventesParAgence)
// ═══════════════════════════════════════════════════════════════

/**
 * Vue omnicanale unifiée par client : merge ventesLocalMag12MG + ventesLocalHorsMag.
 * Retourne un itérateur de [cc, Map<code, {sumCA}>] — tous canaux confondus.
 * Le BL du co-achat se mesure au niveau client (a-t-il acheté A ET B ?), pas au niveau BL,
 * donc on agrège le CA tous canaux pour chaque couple (client, article).
 */
function _omniClientArticles() {
  const merged = new Map(); // cc → Map<code, {sumCA}>
  const hasFilter = !!_assocMetierFilter || !!_assocStratFilter;
  // Source 1 : MAGASIN (ventesLocalMag12MG — pleine période, structurel)
  if (_S.ventesLocalMag12MG?.size) {
    for (const [cc, artMap] of _S.ventesLocalMag12MG) {
      if (hasFilter && !_clientPassesAssocFilter(cc)) continue;
      if (!merged.has(cc)) merged.set(cc, new Map());
      const m = merged.get(cc);
      for (const [code, v] of artMap) {
        if (!/^\d{6}$/.test(code)) continue;
        const prev = m.get(code);
        m.set(code, { sumCA: (prev?.sumCA || 0) + (v.sumCA || 0) });
      }
    }
  }
  // Source 2 : hors-MAGASIN (Web, Représentant, DCS)
  if (getVentesHorsMagFullMap().size) {
    for (const [cc, artMap] of getVentesHorsMagFullMap()) {
      if (hasFilter && !_clientPassesAssocFilter(cc)) continue;
      if (!merged.has(cc)) merged.set(cc, new Map());
      const m = merged.get(cc);
      for (const [code, v] of artMap) {
        if (!/^\d{6}$/.test(code)) continue;
        const prev = m.get(code);
        m.set(code, { sumCA: (prev?.sumCA || 0) + (v.sumCA || 0) });
      }
    }
  }
  // Source 3 : Terrain (BL Qlik multi-agences — livraisons, chantiers)
  if (_S.territoireReady && _S.ventesTerrain?.length) {
    for (const l of _S.ventesTerrain) {
      const cc = l.clientCode;
      if (!cc || !l.ca) continue;
      if (!/^\d{6}$/.test(l.code)) continue;
      if (hasFilter && !_clientPassesAssocFilter(cc)) continue;
      if (!merged.has(cc)) merged.set(cc, new Map());
      const m = merged.get(cc);
      const prev = m.get(l.code);
      m.set(l.code, { sumCA: (prev?.sumCA || 0) + l.ca });
    }
  }
  return merged;
}

// ═══════════════════════════════════════════════════════════════
// Lookup libellé famille
// ═══════════════════════════════════════════════════════════════

function _famLabel(codeFam) { return _famName(codeFam); }

// ═══════════════════════════════════════════════════════════════
// Rendu
// ═══════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════
// Associations détectées — les familles qui s'achètent ensemble chez toi
// Clients du comptoir (au moins un achat MAGASIN), achats tous canaux, 12 mois (structurel).
// « Prend aussi B » est comparé à la part de TOUS les clients qui prennent B (lift) :
// une association n'existe que si l'écart est net.
// ═══════════════════════════════════════════════════════════════

const ASSOC_MIN_A = 40;      // clients acheteurs de la famille moteur
const ASSOC_MIN_AB = 12;     // clients qui prennent les deux
const ASSOC_MIN_TAUX = 0.2;  // part des acheteurs de A qui prennent B
const ASSOC_MIN_LIFT = 4;    // vs part de tous les clients qui prennent B (en dessous : effet « gros client qui achète de tout »)

let _famIdx = null;
let _autoCache = null;
let _famLibCache = null;
let _sel = null;             // { A, B } paire affichée
let _selAll = false;

function _famIndex() {
  const hm = getVentesHorsMagFullMap();
  const key = `${_S.selectedMyStore}|${_S.ventesLocalMag12MG?.size || 0}|${hm.size}|${_assocMetierFilter}|${_assocStratFilter}`;
  if (_famIdx?.key === key) return _famIdx;
  const omni = _omniClientArticles();
  const catFam = _S.catalogueFamille;
  const famOf = code => catFam?.get(code)?.codeFam || _S.articleFamille?.[code] || '';
  const byClient = new Map(); // cc → Map<fam, ca>
  const famCount = new Map();
  for (const [cc, arts] of omni) {
    if (!_S.ventesLocalMag12MG?.has(cc)) continue;
    const m = new Map();
    for (const [code, v] of arts) {
      const f = famOf(code);
      if (/^[A-Z]\d{2}$/.test(f)) m.set(f, (m.get(f) || 0) + (v.sumCA || 0));
    }
    for (const [f, ca] of m) if (ca <= 0) m.delete(f);
    if (!m.size) continue;
    byClient.set(cc, m);
    for (const f of m.keys()) famCount.set(f, (famCount.get(f) || 0) + 1);
  }
  _famIdx = { key, byClient, famCount, n: byClient.size, omni };
  return _famIdx;
}

function _famName(code) {
  if (!_famLibCache) {
    _famLibCache = new Map();
    for (const f of (_S.catalogueFamille?.values() || [])) if (f.codeFam && f.libFam && !_famLibCache.has(f.codeFam)) _famLibCache.set(f.codeFam, f.libFam);
  }
  return _famLibCache.get(code) || code;
}

function _pairStats(A, B) {
  const ix = _famIndex();
  let nA = 0, nAB = 0, caB = 0;
  for (const m of ix.byClient.values()) {
    if (!m.has(A)) continue;
    nA++;
    if (m.has(B)) { nAB++; caB += m.get(B); }
  }
  const pB = ix.n ? (ix.famCount.get(B) || 0) / ix.n : 0;
  const taux = nA ? nAB / nA : 0;
  return { A, B, nA, nAB, taux, pB, lift: pB ? taux / pB : 0, gap: nA - nAB, caBMoy: nAB ? caB / nAB : 0 };
}

/** Les paires les plus nettes : support suffisant, lift fort, une direction par paire, 2 max par famille moteur. */
function _autoPairs() {
  const ix = _famIndex();
  if (_autoCache?.key === ix.key) return _autoCache.list;
  // Co-achats en matrice d'entiers (familles fréquentes seulement) — rapide même avec ~300 familles
  const fams = [...ix.famCount].filter(([, n]) => n >= ASSOC_MIN_AB).map(([f]) => f);
  const pos = new Map(fams.map((f, i) => [f, i]));
  const F = fams.length;
  const co = new Uint32Array(F * F);
  const buf = new Int32Array(F);
  for (const m of ix.byClient.values()) {
    let k = 0;
    for (const f of m.keys()) { const i = pos.get(f); if (i !== undefined) buf[k++] = i; }
    for (let a = 0; a < k; a++) { const row = buf[a] * F; for (let b = 0; b < k; b++) if (a !== b) co[row + buf[b]]++; }
  }
  const best = [];
  for (let x = 0; x < F; x++) for (let y = x + 1; y < F; y++) {
    const nAB = co[x * F + y];
    if (nAB < ASSOC_MIN_AB) continue;
    const dirs = [[fams[x], fams[y]], [fams[y], fams[x]]].map(([A, B]) => {
      const nA = ix.famCount.get(A), pB = ix.famCount.get(B) / ix.n, taux = nAB / nA;
      return { A, B, nA, nAB, taux, pB, lift: taux / pB, gap: nA - nAB };
    }).filter(d => d.nA >= ASSOC_MIN_A && d.taux >= ASSOC_MIN_TAUX && d.lift >= ASSOC_MIN_LIFT && d.gap > 0);
    if (!dirs.length) continue;
    dirs.sort((a, b) => b.gap * b.taux - a.gap * a.taux);
    dirs[0].excess = nAB - dirs[0].nA * dirs[0].pB; // co-acheteurs au-delà du hasard
    best.push(dirs[0]);
  }
  best.sort((a, b) => b.excess - a.excess);
  const perA = new Map(), list = [];
  for (const p of best) {
    const n = perA.get(p.A) || 0;
    if (n >= 2) continue;
    perA.set(p.A, n + 1);
    list.push(p);
    if (list.length >= 15) break;
  }
  _autoCache = { key: ix.key, list };
  return list;
}

/** Clients qui prennent A sans B ; « métier qui en prend » = dans son métier, les acheteurs de A prennent B nettement plus que la moyenne. */
function _pairTargets(A, B, st) {
  const ix = _famIndex();
  const byMetier = new Map(); // métier → {nA, nAB}
  for (const [cc, m] of ix.byClient) {
    if (!m.has(A)) continue;
    const mt = _S.chalandiseData?.get(cc)?.metier || '';
    const e = byMetier.get(mt) || { nA: 0, nAB: 0 };
    e.nA++; if (m.has(B)) e.nAB++;
    byMetier.set(mt, e);
  }
  const out = [];
  for (const [cc, m] of ix.byClient) {
    if (!m.has(A) || m.has(B)) continue;
    const info = _S.chalandiseData?.get(cc);
    const mt = info?.metier || '';
    const e = byMetier.get(mt);
    const mTaux = e && e.nA >= 5 ? e.nAB / e.nA : null;
    out.push({ cc, nom: info?.nom || _S.clientNomLookup?.[cc] || cc, metier: mt, commercial: info?.commercial || '',
      caA: m.get(A), mTaux, pertinent: mTaux != null && mTaux >= Math.max(st.taux, 2 * st.pB) && mt.length > 2 });
  }
  out.sort((a, b) => (b.pertinent - a.pertinent) || b.caA - a.caA);
  return out;
}

/** Ce que prennent dans B les clients qui achètent les deux — ce qu'il faut proposer. */
function _pairTopArticles(A, B) {
  const ix = _famIndex();
  const catFam = _S.catalogueFamille;
  const famOf = code => catFam?.get(code)?.codeFam || _S.articleFamille?.[code] || '';
  const cnt = new Map();
  for (const [cc, m] of ix.byClient) {
    if (!m.has(A) || !m.has(B)) continue;
    for (const [code, v] of ix.omni.get(cc) || []) {
      if (famOf(code) !== B || !(v.sumCA > 0)) continue;
      cnt.set(code, (cnt.get(code) || 0) + 1);
    }
  }
  const fd = new Map((_S.finalData || []).map(r => [r.code, r]));
  return [...cnt].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([code, n]) => {
    const r = fd.get(code);
    const lib = _S.libelleLookup?.[code] || _S.catalogueDesignation?.get(code) || code;
    return { code, n, lib: /^\d{6} - /.test(lib) ? lib.substring(9).trim() : lib, stock: r ? (r.stockActuel || 0) : null };
  });
}

const _pct = v => `${Math.round(v * 100)} %`;
const _x = v => `×${(Math.round(v * 10) / 10).toLocaleString('fr-FR')}`;

function _renderPairDetail(A, B) {
  const st = _pairStats(A, B);
  const la = escapeHtml(_famName(A)), lb = escapeHtml(_famName(B));
  const targets = _pairTargets(A, B, st);
  const nPert = targets.filter(t => t.pertinent).length;
  const shown = _selAll ? targets : targets.slice(0, 30);
  const arts = _pairTopArticles(A, B);
  const tile = (label, value, hint, color) => `<div class="pt-col" style="gap:4px;padding:14px 16px;border-radius:14px;background:var(--s-card-alt);min-width:0">
      <span class="pt-eyebrow" style="font-size:11px">${label}</span>
      <span class="pt-num" style="font-size:22px;font-weight:600;color:${color || 'var(--t-primary)'}">${value}</span>
      <span class="pt-small pt-muted" style="line-height:1.35">${hint}</span>
    </div>`;
  const nette = st.lift >= ASSOC_MIN_LIFT;
  const cli = shown.map(c => `<tr class="ar-click" onclick="window.openClient360?.('${c.cc}','associations')">
      <td><div class="pt-col" style="gap:2px"><span class="pt-strong">${escapeHtml(c.nom)}</span><span class="pt-small pt-muted">${escapeHtml(c.metier || 'métier non renseigné')}${c.commercial ? ' · ' + escapeHtml(c.commercial) : ''}</span></div></td>
      <td>${c.pertinent ? `<span class="ar-tag" data-tone="high" title="Dans ce métier, ${_pct(c.mTaux)} des acheteurs de ${la} prennent ${lb}">son métier en prend</span>` : ''}</td>
      <td class="pt-num ar-r">${formatEuro(c.caA)}</td>
    </tr>`).join('');
  const artRows = arts.map(a => `<tr class="ar-click" onclick="window.openArticlePanel?.('${a.code}','associations')">
      <td><div class="pt-col" style="gap:2px"><span class="pt-strong">${escapeHtml(a.lib)}</span><span class="pt-small pt-muted pt-num">${a.code}</span></div></td>
      <td class="pt-num ar-r">${a.n}</td>
      <td class="ar-r">${a.stock == null ? '<span class="ar-tag">pas en stock</span>' : a.stock > 0 ? `<span class="pt-num">${a.stock}</span>` : '<span class="ar-tag" data-tone="low">rupture</span>'}</td>
    </tr>`).join('');
  return `<section class="pt-card pt-col" id="assocDetail" style="gap:18px;scroll-margin-top:120px">
    <div class="pt-row pt-between" style="gap:12px;flex-wrap:wrap;align-items:flex-start">
      <div class="pt-col" style="gap:4px;flex:1;min-width:260px">
        <span class="pt-eyebrow">Association</span>
        <h3 class="pt-h2">${la} → ${lb}</h3>
        <span class="pt-muted">${nette ? `Un client ${la} prend ${lb} ${_x(st.lift)} plus souvent que la moyenne de tes clients.` : `Pas d’association nette chez toi : un client ${la} prend ${lb} à peine plus souvent que la moyenne (${_x(st.lift)}).`}</span>
      </div>
      ${targets.length ? `<button type="button" class="pt-btn" onclick="window._assocExportTargets('${A}','${B}')">Exporter les ${targets.length} clients</button>` : ''}
    </div>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:12px">
      ${tile(`Prennent aussi ${lb}`, _pct(st.taux), `${st.nAB} de tes ${st.nA} clients ${la}`, nette ? 'var(--pt-high)' : 'var(--t-primary)')}
      ${tile('Moyenne de tes clients', _pct(st.pB), `tous clients confondus · écart ${_x(st.lift)}`)}
      ${tile('À travailler', String(st.gap), `achètent ${la}, pas ${lb}${nPert ? ` · ${nPert} dans un métier qui en prend` : ''}`, 'var(--pt-mid)')}
      ${tile(`${lb} par client`, formatEuro(st.caBMoy), 'CA moyen chez ceux qui prennent les deux · 12 mois')}
    </div>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(380px,1fr));gap:16px">
      <div class="pt-col" style="gap:8px">
        <h4 class="pt-h3" style="font-size:16px">Clients à travailler</h4>
        ${targets.length ? `<div class="pt-list" style="margin-top:0"><div class="pt-scroll"><table class="pt-table">
          <thead><tr><th>Client</th><th></th><th class="ar-r">CA ${la}</th></tr></thead><tbody>${cli}</tbody></table></div></div>
          ${targets.length > shown.length ? `<button type="button" class="pt-link pt-small" style="align-self:flex-start" onclick="window._assocSelAll()">Voir les ${targets.length} clients</button>` : ''}` : '<p class="pt-small pt-muted" style="margin:0">Tous tes clients concernés prennent déjà les deux.</p>'}
      </div>
      <div class="pt-col" style="gap:8px">
        <h4 class="pt-h3" style="font-size:16px">Quoi leur proposer <span class="pt-small pt-muted" style="font-weight:400">ce que prennent ceux qui achètent les deux</span></h4>
        ${arts.length ? `<div class="pt-list" style="margin-top:0"><div class="pt-scroll"><table class="pt-table">
          <thead><tr><th>Article ${lb}</th><th class="ar-r">Clients</th><th class="ar-r">Stock</th></tr></thead><tbody>${artRows}</tbody></table></div></div>` : '<p class="pt-small pt-muted" style="margin:0">—</p>'}
      </div>
    </div>
  </section>`;
}

function _renderAssociations() {
  _ensureAssoc();
  const assocs = _S._associations;
  const auto = _autoPairs();
  if (!_sel && auto.length) _sel = { A: auto[0].A, B: auto[0].B };
  const ix = _famIndex();
  const isSel = (A, B) => _sel && _sel.A === A && _sel.B === B;
  const rows = auto.map(p => `<tr class="ar-click${isSel(p.A, p.B) ? ' pt-next' : ''}" onclick="window._assocSelect('${p.A}','${p.B}')">
      <td><span class="pt-strong">${escapeHtml(_famName(p.A))}</span> <span class="pt-muted">→</span> <span class="pt-strong">${escapeHtml(_famName(p.B))}</span></td>
      <td class="pt-num ar-r">${_pct(p.taux)}</td>
      <td class="pt-num ar-r pt-muted">${_pct(p.pB)}</td>
      <td class="pt-num ar-r pt-strong" style="color:var(--pt-high)">${_x(p.lift)}</td>
      <td class="pt-num ar-r">${p.gap}</td>
    </tr>`).join('');
  const mine = assocs.length ? `<div class="pt-row" style="gap:8px;flex-wrap:wrap;align-items:center">
      <span class="pt-small pt-muted">Tes paires :</span>
      ${assocs.map(a => `<span class="ar-chip${isSel(a.famA, a.famB) ? ' ar-chip-on' : ''}" style="display:inline-flex;align-items:center;gap:8px"><button type="button" class="pt-link" style="padding:0;color:inherit;font-weight:inherit" onclick="window._assocSelect('${a.famA}','${a.famB}')">${escapeHtml(_famName(a.famA))} → ${escapeHtml(_famName(a.famB))}</button><button type="button" class="pt-link" style="padding:0;color:var(--t-tertiary)" title="Retirer" onclick="window._assocDelete('${a.id}')">✕</button></span>`).join('')}
    </div>` : '';
  let html = `<section class="pt-card pt-col" style="gap:14px">
    <div class="pt-row pt-between" style="gap:16px;flex-wrap:wrap;align-items:flex-start">
      <div class="pt-col" style="gap:4px;flex:1;min-width:260px">
        <span class="pt-eyebrow">Associations</span>
        <h3 class="pt-h2">Les familles qui s’achètent ensemble chez toi</h3>
        <span class="pt-muted">Sur tes ${ix.n.toLocaleString('fr-FR')} clients du comptoir (achats tous canaux, 12 mois). Une paire n’apparaît que si les acheteurs de la première prennent la seconde au moins ${String(ASSOC_MIN_LIFT).replace('.', ',')} fois plus souvent que la moyenne.</span>
      </div>
      ${_S._assocEditMode ? '' : '<button type="button" class="pt-btn" onclick="window._assocNew()">Ajouter une paire à la main</button>'}
    </div>
    ${_assocMetierFilter || _assocStratFilter ? `<div><button type="button" class="ar-chip ar-chip-on" onclick="window._assocSetMetier('');window._assocSetStrat('${_assocStratFilter}')">Filtre : ${escapeHtml(_assocMetierFilter === '__nonclasse__' ? 'métier non classé' : _assocMetierFilter || (_assocStratFilter === 'strat' ? 'métiers stratégiques' : 'hors stratégiques'))} ✕</button></div>` : ''}
    ${auto.length ? `<div class="pt-list" style="margin-top:0"><div class="pt-scroll" style="max-height:none"><table class="pt-table">
      <thead><tr><th>Si le client achète… → il prend aussi</th><th class="ar-r">Prennent les deux</th><th class="ar-r">Moyenne</th><th class="ar-r">Écart</th><th class="ar-r">À travailler</th></tr></thead>
      <tbody>${rows}</tbody></table></div></div>` : '<p class="pt-small pt-muted" style="margin:0">Pas assez de clients pour détecter des associations nettes.</p>'}
    ${mine}
  </section>`;
  if (_S._assocEditMode) html += `<div class="assoc-legacy">${_renderAssocEditor()}</div>`;
  if (_sel) html += _renderPairDetail(_sel.A, _sel.B);
  return `<div class="pt-wrap" style="gap:20px;padding-top:8px">${html}</div>`;
}

/**
 * Calcule les stats par famille : CA, nb clients, nb refs vendues
 * @returns {Map<codeFam, {codeFam, lib, ca, nbClients, nbRefs}>}
 */
function _famStats() {
  if (_famStatsCache) return _famStatsCache;
  const catFam = _S.catalogueFamille;
  const vca = _S.ventesLocalMag12MG;
  const stats = new Map();

  const _ensure = (cf) => {
    if (!stats.has(cf)) stats.set(cf, { codeFam: cf, lib: _famLabel(cf), ca: 0, caReseau: 0, clients: new Set(), refs: new Set() });
    return stats.get(cf);
  };

  // Source 1 : ventesLocalMag12MG (MAGASIN, pleine période) + ventesLocalHorsMag (Web, Rep, DCS)
  // Omnicanal : tous les canaux comptent pour les associations
  const hasFilter = !!_assocMetierFilter || !!_assocStratFilter;
  if (vca?.size) {
    for (const [cc, artMap] of vca) {
      if (hasFilter && !_clientPassesAssocFilter(cc)) continue;
      for (const [code, v] of artMap) {
        const cf = catFam?.get(code)?.codeFam || _S.articleFamille?.[code] || '';
        if (!cf) continue;
        const s = _ensure(cf);
        s.ca += v.sumCA || 0;
        s.clients.add(cc);
        s.refs.add(code);
      }
    }
  }

  // Source 1b : ventesLocalHorsMag (Web, Représentant, DCS) — même structure
  const vhm = getVentesHorsMagFullMap();
  if (vhm?.size) {
    for (const [cc, artMap] of vhm) {
      if (hasFilter && !_clientPassesAssocFilter(cc)) continue;
      for (const [code, v] of artMap) {
        const cf = catFam?.get(code)?.codeFam || _S.articleFamille?.[code] || '';
        if (!cf) continue;
        const s = _ensure(cf);
        s.ca += v.sumCA || 0;
        s.clients.add(cc);
        s.refs.add(code);
      }
    }
  }

  // Source 1c : Terrain (BL Qlik multi-agences — livraisons, chantiers)
  if (_S.territoireReady && _S.ventesTerrain?.length) {
    for (const l of _S.ventesTerrain) {
      const cc = l.clientCode;
      if (!cc || !l.ca) continue;
      if (hasFilter && !_clientPassesAssocFilter(cc)) continue;
      const cf = catFam?.get(l.code)?.codeFam || _S.articleFamille?.[l.code] || '';
      if (!cf) continue;
      const s = _ensure(cf);
      s.ca += l.ca;
      s.clients.add(cc);
      s.refs.add(l.code);
    }
  }

  // Source 2 : ventesParAgence (tout le réseau) — familles absentes localement mais actives réseau
  if (_S.ventesParAgence) {
    for (const [store, arts] of Object.entries(_S.ventesParAgence)) {
      for (const [code, data] of Object.entries(arts)) {
        if ((data.countBL || 0) <= 0) continue;
        const cf = catFam?.get(code)?.codeFam || _S.articleFamille?.[code] || '';
        if (!cf) continue;
        const s = _ensure(cf);
        s.caReseau += data.sumCA || 0;
        s.refs.add(code);
      }
    }
  }

  // Convertir sets en counts
  for (const s of stats.values()) {
    s.nbClients = s.clients.size;
    s.nbRefs = s.refs.size;
    delete s.clients;
    delete s.refs;
  }

  _famStatsCache = stats;
  return stats;
}
let _famStatsCache = null;

/**
 * Détecte les meilleures familles associées pour une famille A donnée.
 * Critères : co-achat naturel (% clients A qui achètent aussi B), taille B ≤ 2× taille A.
 * @returns {Array<{codeFam, lib, coTaux, nbCoClients, ca, warning?}>}
 */
function _suggestAssociatedFams(famA) {
  const catFam = _S.catalogueFamille;
  const omni = _omniClientArticles();
  if (!omni.size) return [];

  const fStats = _famStats();
  const statsA = fStats.get(famA);
  if (!statsA || statsA.nbClients < 3) return [];

  // Pour chaque client qui achète A (tous canaux), quelles autres familles achète-t-il ?
  const coCount = new Map(); // codeFam → Set<cc>
  for (const [cc, artMap] of omni) {
    let hasA = false;
    const otherFams = new Set();
    for (const [code] of artMap) {
      const cf = catFam?.get(code)?.codeFam || _S.articleFamille?.[code] || '';
      if (cf === famA) hasA = true;
      else if (cf) otherFams.add(cf);
    }
    if (hasA) {
      for (const cf of otherFams) {
        if (!coCount.has(cf)) coCount.set(cf, new Set());
        coCount.get(cf).add(cc);
      }
    }
  }

  const results = [];
  for (const [cf, clients] of coCount) {
    const sB = fStats.get(cf);
    if (!sB || sB.nbClients < 2 || !/^[A-Z]\d{2}$/.test(cf)) continue;
    const coTaux = Math.round(clients.size / statsA.nbClients * 100);
    if (coTaux < 5) continue; // trop marginal
    const tooBig = sB.ca > statsA.ca * 2;
    results.push({
      codeFam: cf,
      lib: sB.lib,
      coTaux,
      nbCoClients: clients.size,
      ca: sB.ca,
      nbClients: sB.nbClients,
      warning: tooBig ? `CA ${_famLabel(cf)} (${formatEuro(sB.ca)}) > 2× CA ${_famLabel(famA)} (${formatEuro(statsA.ca)})` : null
    });
  }

  results.sort((a, b) => b.coTaux - a.coTaux);
  return results.slice(0, 30);
}

function _renderAssocEditor() {
  const famA = _S._assocEditing?.famA || '';
  const famB = _S._assocEditing?.famB || '';
  const _mf = _assocMetierFilter;

  // ── Étape 0 : Métiers disponibles (exclure tirets, vides, trop courts) ──
  const _metiers = new Set();
  let _nonClasseCount = 0;
  if (_S.chalandiseData?.size) {
    for (const info of _S.chalandiseData.values()) {
      const m = info.metier;
      if (m && m.length > 2 && !/^[-–—\s.]+$/.test(m)) _metiers.add(m);
      else _nonClasseCount++;
    }
  }
  const _metiersSorted = [..._metiers].sort();
  // Sécurité : si le filtre actif est un métier junk (sauf notre pseudo-filtre), le reset
  if (_mf && _mf !== '__nonclasse__' && !_metiers.has(_mf)) { _assocMetierFilter = ''; }

  // ── Étape 1 : Familles éligibles (filtrées par métier) ──
  const fStats = _famStats(); // déjà filtré par _assocMetierFilter / _assocStratFilter
  const _hasAnyFilter = !!_assocMetierFilter || !!_assocStratFilter;
  const eligible = [...fStats.values()]
    .filter(f => {
      if (!/^[A-Z]\d{2}$/.test(f.codeFam)) return false;
      // Si filtre actif, exiger des clients locaux (pas juste caReseau)
      if (_hasAnyFilter) return f.nbClients >= 1;
      return f.nbClients >= 3 || f.caReseau >= 1000;
    })
    .sort((a, b) => (b.ca || b.caReseau) - (a.ca || a.caReseau));

  // CA réseau pour comparaison (via ventesParAgence, non filtré métier)
  const _caReseau = {};
  if (_S.ventesParAgence) {
    const myStore = _S.selectedMyStore;
    for (const [store, arts] of Object.entries(_S.ventesParAgence)) {
      if (store === myStore) continue;
      for (const [code, data] of Object.entries(arts)) {
        if ((data.countBL || 0) <= 0) continue;
        const cf = _S.catalogueFamille?.get(code)?.codeFam || _S.articleFamille?.[code] || '';
        if (cf) _caReseau[cf] = (_caReseau[cf] || 0) + (data.sumCA || 0);
      }
    }
  }

  // Recherche texte
  const _searchQ = _S._assocSearchA || '';

  // Filtrer par recherche
  const filtered = _searchQ
    ? eligible.filter(f => (f.lib + ' ' + f.codeFam).toLowerCase().includes(_searchQ.toLowerCase()))
    : eligible;

  // ── Étape 0 : Sélection métier (pilules) avec filtre strat/hors ──
  let step0Html = '';
  if (_metiersSorted.length) {
    const sf = _assocStratFilter;
    // Filtrer les pilules par stratégique/hors
    const visibleMetiers = sf === 'strat'
      ? _metiersSorted.filter(m => _isMetierStrategique(m))
      : sf === 'hors'
        ? _metiersSorted.filter(m => !_isMetierStrategique(m))
        : _metiersSorted;

    const _stratBtn = (id, label) => {
      const sel = sf === id;
      return `<button onclick="window._assocSetStrat('${id}')" class="text-[10px] px-2.5 py-1 rounded-lg border cursor-pointer font-medium transition-all ${sel ? 'font-bold' : 'hover:s-hover'}" style="${sel ? 'background:var(--c-action);color:#fff;border-color:var(--c-action)' : 'border-color:var(--color-border-tertiary);color:var(--t-secondary)'}">${sel ? '✕ ' : ''}${label}</button>`;
    };

    const pills = visibleMetiers.map(m => {
      const sel = m === _mf;
      const mSafe = m.replace(/'/g, "\\'");
      return `<button onclick="window._assocSetMetier(${sel ? "''" : `'${mSafe}'`})" class="text-[10px] px-2.5 py-1 rounded-full border cursor-pointer font-medium transition-all whitespace-nowrap ${sel ? 'font-bold' : 'hover:s-hover'}" style="${sel ? 'background:var(--c-action);color:#fff;border-color:var(--c-action)' : 'border-color:var(--color-border-tertiary);color:var(--t-secondary)'}">${sel ? '✕ ' : ''}${escapeHtml(m)}</button>`;
    }).join('');
    // Bouton "Non classé" en premier — clients sans métier valide
    const _ncSel = _mf === '__nonclasse__';
    const nonClasseBtn = _nonClasseCount > 0
      ? `<button onclick="window._assocSetMetier(${_ncSel ? "''" : "'__nonclasse__'"})" class="text-[10px] px-2.5 py-1 rounded-full border cursor-pointer font-medium transition-all whitespace-nowrap ${_ncSel ? 'font-bold' : 'hover:s-hover'}" style="${_ncSel ? 'background:#a855f7;color:#fff;border-color:#a855f7' : 'border-color:var(--color-border-tertiary);color:#a855f7'}">${_ncSel ? '✕ ' : ''}Non classé (${_nonClasseCount})</button>`
      : '';
    step0Html = `<div class="mb-4">
      <label class="text-[10px] font-bold t-secondary mb-2 block">⓪ Métier <span class="font-normal t-disabled">— filtre les familles et les clients</span></label>
      <div class="flex items-center gap-2 mb-2">${_stratBtn('strat', 'Stratégiques')}${_stratBtn('hors', 'Hors stratégiques')}<span class="text-[9px] t-disabled">${visibleMetiers.length} métier${visibleMetiers.length > 1 ? 's' : ''}</span></div>
      <div class="flex flex-wrap gap-1.5">${nonClasseBtn}${pills}</div>
    </div>`;
  }

  // ── Étape 1 : Tuiles Famille A groupées par Univers ──
  const _uIcons = { A:'🏠', B:'🧱', C:'🧴', R:'⚡', E:'🛡️', G:'🌡️', M:'🔧', O:'🧰', L:'🚰' };
  let step1Html = '';
  if (!famA) {
    const searchBar = `<input id="assocSearchA" type="text" value="${escapeHtml(_searchQ)}" placeholder="Rechercher une famille…" class="w-full text-[11px] px-3 py-1.5 rounded-lg border b-default s-card t-primary mb-3" oninput="window._assocFilterA(this.value)">`;

    const _renderTileA = (f) => {
      const caMe = f.ca > 0 ? formatEuro(f.ca) : '—';
      const caRes = _caReseau[f.codeFam] ? formatEuro(_caReseau[f.codeFam]) : '';
      return `<div onclick="window._assocSelectA('${f.codeFam}')" class="p-2.5 rounded-lg border cursor-pointer transition-all hover:shadow-md hover:s-hover" style="border-color:var(--color-border-tertiary)">
        <div class="flex items-center justify-between mb-1">
          <span class="text-[11px] font-bold t-primary truncate">${escapeHtml(f.lib)}</span>
          <span class="text-[9px] font-mono t-disabled ml-1">${escapeHtml(f.codeFam)}</span>
        </div>
        <div class="flex items-center justify-between text-[10px]">
          <span class="t-secondary">${f.nbClients} cl. · <strong class="t-primary">${caMe}</strong></span>
          ${caRes ? `<span class="t-disabled">Rés. ${caRes}</span>` : ''}
        </div>
      </div>`;
    };

    // Grouper par univers
    const _univA = new Map();
    for (const f of filtered) {
      const letter = (f.codeFam || '?')[0].toUpperCase();
      if (!_univA.has(letter)) _univA.set(letter, { label: FAM_LETTER_UNIVERS[letter] || letter, items: [] });
      _univA.get(letter).items.push(f);
    }

    // Boutons filtre univers A
    const ufA = _assocUniversFilter;
    const univBtnsA = [
      `<button onclick="window._assocSetUnivers('')" class="text-[10px] px-2 py-0.5 rounded-lg border cursor-pointer font-medium transition-all ${!ufA ? 'font-bold' : 'hover:s-hover'}" style="${!ufA ? 'background:var(--c-action);color:#fff;border-color:var(--c-action)' : 'border-color:var(--color-border-tertiary);color:var(--t-secondary)'}">Tous</button>`,
      ...[..._univA.entries()].sort((a, b) => a[1].label.localeCompare(b[1].label)).map(([letter, u]) => {
        const sel = ufA === letter;
        return `<button onclick="window._assocSetUnivers('${letter}')" class="text-[10px] px-2 py-0.5 rounded-lg border cursor-pointer font-medium transition-all whitespace-nowrap ${sel ? 'font-bold' : 'hover:s-hover'}" style="${sel ? 'background:var(--c-action);color:#fff;border-color:var(--c-action)' : 'border-color:var(--color-border-tertiary);color:var(--t-secondary)'}">${_uIcons[letter] || '📦'} ${escapeHtml(u.label)} (${u.items.length})</button>`;
      })
    ].join('');

    // Sections par univers
    const sortedUnivsA = [..._univA.entries()]
      .filter(([letter]) => !ufA || letter === ufA)
      .sort((a, b) => {
        const caA = a[1].items.reduce((s, f) => s + (f.ca || 0), 0);
        const caB = b[1].items.reduce((s, f) => s + (f.ca || 0), 0);
        return caB - caA;
      });

    let sectionsA = '';
    for (const [letter, u] of sortedUnivsA) {
      const icon = _uIcons[letter] || '📦';
      const caUniv = u.items.reduce((s, f) => s + (f.ca || 0), 0);
      sectionsA += `<div class="mb-3">
        <div class="flex items-center gap-2 mb-1.5 pb-1 border-b b-light">
          <span class="text-[11px] font-bold t-primary">${icon} ${escapeHtml(u.label)}</span>
          <span class="text-[9px] t-disabled">${u.items.length} fam.${caUniv > 0 ? ' · ' + formatEuro(caUniv) : ''}</span>
        </div>
        <div class="grid grid-cols-2 lg:grid-cols-3 gap-2">${u.items.map(_renderTileA).join('')}</div>
      </div>`;
    }

    step1Html = `<div>
      <label class="text-[10px] font-bold t-secondary mb-2 block">① Moteur d'achat <span class="font-normal t-disabled">— la famille principale${_mf ? ` (${escapeHtml(_mf)})` : ''}</span></label>
      ${searchBar}
      <div class="flex flex-wrap items-center gap-1.5 mb-3">${univBtnsA}</div>
      <div style="max-height:400px;overflow-y:auto">${sectionsA || '<p class="text-[11px] t-disabled text-center py-4">Aucune famille trouvée.</p>'}</div>
    </div>`;
  } else {
    // Famille A sélectionnée — afficher comme badge compact avec CA réseau
    const labelA = _famLabel(famA);
    const statsA = fStats.get(famA);
    const caResA = _caReseau[famA] ? formatEuro(_caReseau[famA]) : '';
    step1Html = `<div class="mb-3">
      <label class="text-[10px] font-bold t-secondary mb-1.5 block">① Moteur d'achat</label>
      <div class="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border-2" style="border-color:var(--c-action);background:rgba(139,92,246,0.08)">
        <span class="text-[11px] font-bold" style="color:var(--c-action)">${escapeHtml(famA)} ${escapeHtml(labelA)}</span>
        ${statsA ? `<span class="text-[10px] t-secondary">${statsA.nbClients} cl. · ${formatEuro(statsA.ca)}</span>` : ''}
        ${caResA ? `<span class="text-[10px] t-disabled">Rés. ${caResA}</span>` : ''}
        <button onclick="window._assocSelectA('')" class="text-[10px] t-disabled hover:t-primary cursor-pointer ml-1" title="Changer">✕</button>
      </div>
    </div>`;
  }

  // ── Étape 2 : Tuiles Famille B regroupées par Univers ──
  let step2Html = '';
  if (famA && !famB) {
    const sugB = _suggestAssociatedFams(famA);
    if (sugB.length) {
      // Icônes par lettre d'univers
      const _uIcons = { A:'🏠', B:'🧱', C:'🧴', R:'⚡', E:'🛡️', G:'🌡️', M:'🔧', O:'🧰', L:'🚰' };

      // Collecter les univers présents
      const _univPresents = new Map(); // letter → {label, items[]}
      for (const s of sugB) {
        const letter = (s.codeFam || '?')[0].toUpperCase();
        if (!_univPresents.has(letter)) {
          _univPresents.set(letter, { label: FAM_LETTER_UNIVERS[letter] || letter, items: [] });
        }
        _univPresents.get(letter).items.push(s);
      }

      // Boutons filtre univers
      const uf = _assocUniversFilter;
      const univBtns = [
        `<button onclick="window._assocSetUnivers('')" class="text-[10px] px-2 py-0.5 rounded-lg border cursor-pointer font-medium transition-all ${!uf ? 'font-bold' : 'hover:s-hover'}" style="${!uf ? 'background:var(--c-action);color:#fff;border-color:var(--c-action)' : 'border-color:var(--color-border-tertiary);color:var(--t-secondary)'}">Tous</button>`,
        ...[..._univPresents.entries()].sort((a, b) => a[1].label.localeCompare(b[1].label)).map(([letter, u]) => {
          const sel = uf === letter;
          return `<button onclick="window._assocSetUnivers('${letter}')" class="text-[10px] px-2 py-0.5 rounded-lg border cursor-pointer font-medium transition-all whitespace-nowrap ${sel ? 'font-bold' : 'hover:s-hover'}" style="${sel ? 'background:var(--c-action);color:#fff;border-color:var(--c-action)' : 'border-color:var(--color-border-tertiary);color:var(--t-secondary)'}">${_uIcons[letter] || '📦'} ${escapeHtml(u.label)} (${u.items.length})</button>`;
        })
      ].join('');

      // Construire les sections par univers
      const _renderTileB = (s) => {
        const tauxColor = s.coTaux >= 40 ? '#22c55e' : s.coTaux >= 20 ? '#f59e0b' : '#94a3b8';
        const barW = Math.min(s.coTaux, 100);
        const caResB = _caReseau[s.codeFam] ? formatEuro(_caReseau[s.codeFam]) : '';
        return `<div onclick="window._assocPickB('${s.codeFam}')" class="p-2.5 rounded-lg border cursor-pointer transition-all hover:shadow-md hover:s-hover" style="border-color:var(--color-border-tertiary)">
          <div class="flex items-center justify-between mb-1">
            <span class="text-[11px] font-bold t-primary truncate">${escapeHtml(s.lib)}</span>
            <span class="text-sm font-black" style="color:${tauxColor}">${s.coTaux}%</span>
          </div>
          <div class="w-full h-1 rounded-full mb-1.5" style="background:var(--color-border-tertiary)"><div class="h-full rounded-full" style="width:${barW}%;background:${tauxColor}"></div></div>
          <div class="flex items-center justify-between text-[9px] t-disabled">
            <span>${s.nbCoClients} communs / ${s.nbClients} cl. · ${formatEuro(s.ca)}</span>
            ${caResB ? `<span>Rés. ${caResB}</span>` : ''}
          </div>
        </div>`;
      };

      // Trier les univers : même univers que famA en premier, puis par nb items desc
      const famALetter = (famA || '?')[0].toUpperCase();
      const sortedUnivs = [..._univPresents.entries()]
        .filter(([letter]) => !uf || letter === uf)
        .sort((a, b) => {
          if (a[0] === famALetter && b[0] !== famALetter) return 1; // propre univers en dernier (moins intéressant)
          if (b[0] === famALetter && a[0] !== famALetter) return -1;
          return b[1].items.length - a[1].items.length;
        });

      let sectionsHtml = '';
      for (const [letter, u] of sortedUnivs) {
        const icon = _uIcons[letter] || '📦';
        const bestTaux = Math.max(...u.items.map(s => s.coTaux));
        sectionsHtml += `<div class="mb-3">
          <div class="flex items-center gap-2 mb-1.5 pb-1 border-b b-light">
            <span class="text-[11px] font-bold t-primary">${icon} ${escapeHtml(u.label)}</span>
            <span class="text-[9px] t-disabled">${u.items.length} fam. · max ${bestTaux}%</span>
          </div>
          <div class="grid grid-cols-2 lg:grid-cols-3 gap-2">${u.items.map(_renderTileB).join('')}</div>
        </div>`;
      }

      step2Html = `<div>
        <label class="text-[10px] font-bold t-secondary mb-2 block">② Accessoire <span class="font-normal t-disabled">— par univers, triées par co-achat</span></label>
        <div class="flex flex-wrap items-center gap-1.5 mb-3">${univBtns}</div>
        ${sectionsHtml}
      </div>`;
    } else {
      step2Html = '<div class="text-[11px] t-disabled text-center py-4 border-2 border-dashed rounded-lg" style="border-color:var(--color-border-tertiary)">Aucune famille associée significative détectée.</div>';
    }
  }

  return `<div class="s-card rounded-xl border p-4 mb-4">
    <div class="flex items-center justify-between mb-3">
      <h4 class="font-bold text-sm t-primary">Nouvelle association</h4>
      <button onclick="window._assocCancel()" class="text-[10px] t-disabled hover:t-primary cursor-pointer">✕ Fermer</button>
    </div>
    ${step0Html}
    ${step1Html}
    ${step2Html}
  </div>`;
}

// ═══════════════════════════════════════════════════════════════
// Export CSV des 🔴 Trous
// ═══════════════════════════════════════════════════════════════


// ═══════════════════════════════════════════════════════════════
// Rendu onglet complet
// ═══════════════════════════════════════════════════════════════

export function renderAssociationsTab() {
  _famStatsCache = null; // Invalider le cache stats à chaque rendu

  const el = document.getElementById('assocContent');
  if (el) el.innerHTML = _renderAssociations();

  // Restore sélection famille A dans l'éditeur
  if (_S._assocEditMode && _S._assocEditing?.famA) {
    const sA = document.getElementById('assocSelA');
    if (sA) sA.value = _S._assocEditing.famA;
  }
}

// ═══════════════════════════════════════════════════════════════
// Handlers globaux
// ═══════════════════════════════════════════════════════════════

window._assocNew = function() {
  _S._assocEditMode = true;
  _S._assocEditing = { famA: '', famB: '' };
  _S._assocSearchA = '';
  _assocUniversFilter = '';
  _famStatsCache = null;
  renderAssociationsTab();
};

window._assocSelectA = function(famA) {
  if (!_S._assocEditing) _S._assocEditing = { famA: '', famB: '' };
  _S._assocEditing.famA = famA;
  _S._assocEditing.famB = '';
  _S._assocSearchA = '';
  _assocUniversFilter = '';
  _famStatsCache = null;
  renderAssociationsTab();
};

window._assocFilterA = function(query) {
  _S._assocSearchA = query;
  _famStatsCache = null;
  renderAssociationsTab();
};

window._assocPickB = function(famB) {
  // Geste 5 — Clic final : auto-save et ouverture directe
  if (!_S._assocEditing) return;
  const famA = _S._assocEditing.famA;
  if (!famA || !famB || famA === famB) return;

  _ensureAssoc();
  // Vérifier doublon
  if (_S._associations.some(a => a.famA === famA && a.famB === famB)) {
    // Existe déjà : fermer l'éditeur et ouvrir la card
    const existing = _S._associations.find(a => a.famA === famA && a.famB === famB);
    _S._assocEditMode = false;
    _S._assocEditing = null;
    _sel = { A: famA, B: famB }; _selAll = false;
    renderAssociationsTab();
    return;
  }

  _S._associations.push({
    id: _assocId(),
    famA,
    famB,
    label: `${_famLabel(famA)} × ${_famLabel(famB)}`,
    dateCreated: new Date().toISOString()
  });

  _S._assocEditMode = false;
  _S._assocEditing = null;
  _S._assocSearchA = '';
  _sel = { A: famA, B: famB }; _selAll = false;

  _saveSessionToIDB();
  renderAssociationsTab();
};

window._assocCancel = function() {
  _S._assocEditMode = false;
  _S._assocEditing = null;
  _S._assocSearchA = '';
  renderAssociationsTab();
};

window._assocDelete = function(id) {
  _ensureAssoc();
  const gone = _S._associations.find(a => a.id === id);
  if (gone && _sel && _sel.A === gone.famA && _sel.B === gone.famB) _sel = null;
  _S._associations = _S._associations.filter(a => a.id !== id);
  _saveSessionToIDB();
  renderAssociationsTab();
};

window._assocSelect = function(A, B) {
  _sel = { A, B }; _selAll = false;
  renderAssociationsTab();
  document.getElementById('assocDetail')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
};
window._assocSelAll = function() { _selAll = true; renderAssociationsTab(); };
window._assocExportTargets = function(A, B) {
  const st = _pairStats(A, B);
  const q = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const rows = _pairTargets(A, B, st).map(c => [c.cc, q(c.nom), q(c.metier), q(c.commercial), c.pertinent ? 'oui' : '', Math.round(c.caA)].join(';'));
  const csv = '\uFEFF' + ['Code client', 'Nom', 'Métier', 'Commercial', 'Son métier en prend', `CA ${_famName(A)}`].join(';') + '\n' + rows.join('\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
  const a = document.createElement('a');
  a.href = url; a.download = `PRISME_Association_${_famName(A)}_${_famName(B)}.csv`.replace(/[^\w.-]+/g, '_');
  a.click(); URL.revokeObjectURL(url);
};

window._assocSetMetier = function(metier) {
  _assocMetierFilter = metier || '';
  _famStatsCache = null;
  renderAssociationsTab();
};

window._assocSetStrat = function(mode) {
  _assocStratFilter = _assocStratFilter === mode ? '' : mode;
  // Si le métier actif n'est plus visible après le filtre, le reset
  if (_assocMetierFilter) {
    if (_assocMetierFilter === '__nonclasse__') {
      // Non classé n'est ni strat ni hors → reset si un filtre strat est actif
      if (_assocStratFilter) _assocMetierFilter = '';
    } else {
      const isStrat = _isMetierStrategique(_assocMetierFilter);
      if ((_assocStratFilter === 'strat' && !isStrat) || (_assocStratFilter === 'hors' && isStrat)) {
        _assocMetierFilter = '';
      }
    }
  }
  _famStatsCache = null;
  renderAssociationsTab();
};

window._assocSetUnivers = function(letter) {
  _assocUniversFilter = _assocUniversFilter === letter ? '' : letter;
  renderAssociationsTab();
};
