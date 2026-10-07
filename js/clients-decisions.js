// ═══════════════════════════════════════════════════════════════
// PRISME — clients-decisions.js
// Pilotage Commercial › « Tes clients » : le domaine Clients de La partie.
//   Score Clients = fidélité en CA : part du CA comptoir des 6 mois précédents portée par des
//   clients revenus sur les 6 derniers mois (mois complets). Pondère chaque client par son enjeu.
//   Affichés en info, hors score : fidélité en nombre de clients, part de portefeuille
//   (CA comptoir N-1 ÷ CA Legallais N-1 de la chalandise — structurellement basse en B2B).
//   5 décisions triées par enjeu : relancer, reconquérir, développer, conquérir, rattacher.
// Commerce → filtre commercial respecté dans les listes (pas dans le score agence).
// Sources : _byMonth (client → article → mois, MAGASIN de l'agence), clientLastOrder, chalandiseData.
// Dépend de : state.js, utils.js, engine.js
// ═══════════════════════════════════════════════════════════════
'use strict';

import { _S } from './state.js';
import { escapeHtml, formatEuro, defaultPeriodRange } from './utils.js';
import { clientMatchesCommercialFilter } from './engine.js';

const ROWS = 60;
const _col = (s) => s == null ? 'var(--t-disabled)' : s < 70 ? 'var(--pt-low)' : s < 80 ? 'var(--pt-mid)' : 'var(--pt-high)';
const _bar = (v, h = 8) => `<span class="pt-track" style="height:${h}px"><span class="pt-fill" style="width:${Math.max(0, Math.min(100, v))}%;background:${_col(v)}"></span></span>`;
const _n = (v) => Number(v || 0).toLocaleString('fr-FR');
const _eur = (v) => formatEuro(Math.round(v || 0));
const _pl = (n, a, b) => n > 1 ? b : a;

let _cache = { key: '', value: null };
let _openList = '';

/** Agrégats clients (une passe sur _byMonth), mis en cache tant que les données ne changent pas. */
function _base() {
  const bm = _S._byMonth;
  const maxD = _S.consommePeriodMaxFull || _S.consommePeriodMax;
  const key = `${_S.selectedMyStore}|${maxD ? new Date(maxD).getTime() : 0}|${bm ? Object.keys(bm).length : 0}|${_S.chalandiseData?.size || 0}`;
  if (_cache.key === key && _cache.value) return _cache.value;
  const range = defaultPeriodRange(maxD);
  if (!bm || !range) return null;
  const refM = range.end.getFullYear() * 12 + range.end.getMonth();
  const refDate = new Date(maxD);
  const yN1 = range.end.getFullYear() - 1; // année civile complète précédente
  const clients = new Map(); // cc → { ca12, months12:Set, caPrev6, caLast6, caN1, caAll, lastM }
  for (const cc in bm) {
    const arts = bm[cc];
    const c = { ca12: 0, act12: new Set(), prev6: false, caPrev6: 0, last6: false, caN1: 0, lastM: -1, caBeforeLast12: 0 };
    const byM = new Map();
    for (const code in arts) {
      const months = arts[code];
      for (const m in months) {
        const d = months[m]; const mi = +m;
        if (!d || (d.countBL || 0) <= 0) continue;
        byM.set(mi, (byM.get(mi) || 0) + (d.sumCA || 0));
      }
    }
    for (const [mi, ca] of byM) {
      if (mi > c.lastM) c.lastM = mi;
      if (mi <= refM && mi > refM - 12) { c.ca12 += ca; c.act12.add(mi); }
      if (mi <= refM - 6 && mi > refM - 12) { c.prev6 = true; c.caPrev6 += ca; }
      if (mi <= refM && mi > refM - 6) c.last6 = true;
      if (Math.floor(mi / 12) === yN1) c.caN1 += ca;
    }
    // CA des 12 mois qui précèdent le dernier achat (pour les perdus)
    for (const [mi, ca] of byM) if (mi <= c.lastM && mi > c.lastM - 12) c.caBeforeLast12 += ca;
    clients.set(cc, c);
  }
  const value = { clients, refM, refDate, yN1 };
  _cache = { key, value };
  return value;
}

const _silence = (cc, refDate) => {
  const d = _S.clientLastOrder?.get(cc);
  return d ? Math.round((refDate - new Date(d)) / 86400000) : null;
};

/** Domaine Clients de La partie — même calcul que l'écran « Tes clients ». */
export function computeClientsPartie() {
  const b = _base();
  if (!b) return { score: null };
  const chal = _S.chalandiseData;
  let prev = 0, kept = 0, caPrev = 0, caKept = 0, caN1 = 0, legN1 = 0, nbPart = 0;
  for (const [cc, c] of b.clients) {
    if (c.prev6) { prev++; caPrev += c.caPrev6; if (c.last6) { kept++; caKept += c.caPrev6; } }
    const info = chal?.get(cc);
    const leg = info?.['ca' + b.yN1] || 0; // chalandise : CA Legallais de l'année civile N-1
    if (leg > 0 && c.caN1 > 0) {
      caN1 += c.caN1; legN1 += Math.max(leg, c.caN1); nbPart++;
    }
  }
  if (!caPrev) return { score: null };
  const score = Math.round(100 * caKept / caPrev);
  const fideliteClients = prev ? Math.round(100 * kept / prev) : null;
  const part = legN1 ? Math.round(100 * caN1 / legN1) : null;
  return { score, caPrev, caKept, fideliteClients, prev, kept, part, caN1, legN1, nbPart, yN1: b.yN1 };
}

function _decisions() {
  const b = _base();
  if (!b) return null;
  const chal = _S.chalandiseData || new Map();
  const okCom = (cc) => { const i = chal.get(cc); return !_S._selectedCommercial || (i && clientMatchesCommercialFilter(i)); };
  const row = (cc, extra) => {
    const i = chal.get(cc);
    return { cc, nom: i?.nom || _S.clientNomLookup?.[cc] || cc, metier: i?.metier || '', commercial: i?.commercial || '', ville: i?.ville || '', classif: i?.classification || '', ...extra };
  };
  const relancer = [], reconquerir = [], developper = [], rattacher = [];
  for (const [cc, c] of b.clients) {
    const sil = _silence(cc, b.refDate);
    const info = chal.get(cc);
    if (!info && c.ca12 > 0) rattacher.push(row(cc, { ca: c.ca12, sil }));
    if (!okCom(cc)) continue;
    if (sil != null && sil >= 60 && sil < 180 && c.act12.size >= 3) relancer.push(row(cc, { ca: c.ca12, sil, mois: c.act12.size }));
    else if (sil != null && sil >= 180 && sil < 365 && c.caBeforeLast12 >= 300) reconquerir.push(row(cc, { ca: c.caBeforeLast12, sil }));
    else if (sil != null && sil < 60 && info && (info['ca' + b.yN1] || 0) >= 2000) {
      const leg = info['ca' + b.yN1];
      const part = c.caN1 / Math.max(leg, c.caN1);
      if (part < 0.25) developper.push(row(cc, { ca: c.ca12, leg, part: Math.round(part * 100), ecart: leg - c.caN1 }));
    }
  }
  // Conquérir : clients de la zone actifs chez Legallais cette année, jamais venus au comptoir, ≤ 10 km si connu
  const conquerir = [];
  const hasDist = [...chal.values()].some(i => i.distanceKm != null);
  for (const [cc, info] of chal) {
    if (b.clients.has(cc) || _S.ventesLocalMag12MG?.has(cc)) continue;
    if ((info['ca' + (b.yN1 + 1)] || 0) <= 0 || (info['ca' + b.yN1] || 0) < 1000) continue;
    if (hasDist && !(info.distanceKm != null && info.distanceKm <= 10)) continue;
    if (!okCom(cc)) continue;
    conquerir.push(row(cc, { leg: info['ca' + b.yN1], dist: info.distanceKm }));
  }
  relancer.sort((a, z) => z.ca - a.ca);
  reconquerir.sort((a, z) => z.ca - a.ca);
  developper.sort((a, z) => z.ecart - a.ecart);
  conquerir.sort((a, z) => z.leg - a.leg);
  rattacher.sort((a, z) => z.ca - a.ca);
  return { relancer, reconquerir, developper, conquerir, rattacher, nbActifs: [...b.clients.values()].filter(c => c.ca12 > 0).length, ca12: [...b.clients.values()].reduce((s, c) => s + c.ca12, 0) };
}

// ── Rendu ────────────────────────────────────────────────────
const DEFS = {
  relancer: { verb: 'Relancer', unit: ['client régulier qui décroche', 'clients réguliers qui décrochent'], sub: (l) => `${_eur(l.reduce((s, r) => s + r.ca, 0))} de CA comptoir sur 12 mois`,
    why: 'Venus au moins 3 mois sur les 12 derniers, plus rien depuis 60 jours à 6 mois. Triés par CA comptoir sur 12 mois.',
    head: ['CA 12 mois', 'Mois actifs', 'Silence'], cells: (r) => [_eur(r.ca), r.mois, `${r.sil} j`] },
  reconquerir: { verb: 'Reconquérir', unit: ['client perdu depuis 6 à 12 mois', 'clients perdus depuis 6 à 12 mois'], sub: (l) => `${_eur(l.reduce((s, r) => s + r.ca, 0))} de CA comptoir avant leur départ`,
    why: 'Plus aucun achat au comptoir depuis 6 à 12 mois, au moins 300 € sur leurs 12 derniers mois actifs. Triés par ce CA.',
    head: ['CA avant départ', 'Silence'], cells: (r) => [_eur(r.ca), `${r.sil} j`] },
  developper: { verb: 'Développer', unit: ['client actif qui achète surtout ailleurs', 'clients actifs qui achètent surtout ailleurs'], sub: (l) => `${_eur(l.reduce((s, r) => s + r.ecart, 0))} de CA Legallais hors de ton comptoir`,
    why: 'Venus ces 60 derniers jours, mais ton comptoir pèse moins de 25 % de leur CA Legallais (année précédente, chalandise). Triés par ce qu’ils dépensent ailleurs.',
    head: ['CA comptoir 12 mois', 'CA Legallais N-1', 'Ta part'], cells: (r) => [_eur(r.ca), _eur(r.leg), `${r.part} %`] },
  conquerir: { verb: 'Conquérir', unit: ['client de ta zone jamais venu', 'clients de ta zone jamais venus'], sub: (l) => `${_n(l.length)} ${_pl(l.length, 'client actif', 'clients actifs')} chez Legallais, à 10 km ou moins`,
    why: 'Clients de ta zone de chalandise, actifs chez Legallais cette année (≥1 000 € l’an dernier), jamais venus à ton comptoir, à 10 km ou moins. Triés par CA Legallais.',
    head: ['CA Legallais N-1', 'Distance'], cells: (r) => [_eur(r.leg), r.dist != null ? `${r.dist} km` : '—'] },
  rattacher: { verb: 'Rattacher', unit: ['client du comptoir hors chalandise', 'clients du comptoir hors chalandise'], sub: (l) => `${_eur(l.reduce((s, r) => s + r.ca, 0))} de CA comptoir sans commercial attitré`,
    why: 'Achètent à ton comptoir mais absents du fichier chalandise : pas de métier, pas de commercial. Exporte la liste, complète la colonne Commercial et recharge-la en « Rattachement commercial ».',
    head: ['CA 12 mois', 'Silence'], cells: (r) => [_eur(r.ca), r.sil != null ? `${r.sil} j` : '—'] },
};
const ORDER = ['relancer', 'reconquerir', 'developper', 'conquerir', 'rattacher'];

function _list(key, rows) {
  const d = DEFS[key];
  const open = _openList === key;
  const shown = rows.slice(0, ROWS);
  const body = shown.map(r => `<tr class="ar-click" onclick="window.openClient360?.('${escapeHtml(r.cc)}','tes-clients')">
      <td><span class="pt-strong">${escapeHtml(r.nom)}</span><br><span class="pt-small pt-muted">${escapeHtml(r.ville || '')}</span></td>
      <td class="pt-small">${escapeHtml(r.metier || '—')}</td>
      <td class="pt-small pt-muted">${escapeHtml(r.commercial || '—')}</td>
      ${d.cells(r).map(v => `<td class="pt-num ar-r">${v}</td>`).join('')}</tr>`).join('');
  return `<details class="ar-sec" id="tcSec-${key}" ${open ? 'open' : ''}>
    <summary><span class="pt-row" style="gap:14px;align-items:baseline;flex-wrap:wrap">
      <span class="pt-num" style="font-size:24px;font-weight:600;min-width:44px">${_n(rows.length)}</span>
      <span class="pt-col" style="gap:2px"><span class="pt-h3">${d.verb}</span><span class="pt-small pt-muted">${rows.length ? d.sub(rows) : 'personne'}</span></span>
    </span><span class="ar-chev" aria-hidden="true"></span></summary>
    ${rows.length ? `<div class="ar-sec-body">
      <p class="pt-small pt-muted" style="margin:0">${d.why}</p>
      <div class="pt-list"><div class="pt-scroll"><table class="pt-table">
        <thead><tr><th>Client</th><th>Métier</th><th>Commercial</th>${d.head.map(h => `<th class="ar-r">${h}</th>`).join('')}</tr></thead>
        <tbody>${body}</tbody></table></div>
        <div class="pt-row pt-between pt-small pt-muted" style="padding:10px 12px;gap:12px;flex-wrap:wrap">
          <span>${rows.length > ROWS ? `${ROWS} premiers sur ${_n(rows.length)}` : `${_n(rows.length)} ${_pl(rows.length, 'client', 'clients')}`} · clic = fiche client</span>
          <button type="button" class="pt-link" onclick="_tcCsv('${key}')">Exporter en CSV</button>
        </div></div>
    </div>` : ''}
  </details>`;
}

function _card(key, rows) {
  const d = DEFS[key];
  const empty = !rows.length;
  return `<article class="pt-card ar-dec${empty ? ' ar-dec-empty' : ''}">
    <div class="pt-row pt-between" style="gap:10px;min-height:32px"><span class="pt-eyebrow">${d.verb}</span></div>
    ${empty ? '<p class="pt-muted" style="margin:0">Personne à traiter.</p>' : `
    <div class="pt-col" style="gap:4px"><span class="pt-num" style="font-size:36px;font-weight:600;line-height:1.05">${_n(rows.length)}</span>
      <span class="ar-dec-unit">${_pl(rows.length, d.unit[0], d.unit[1])}</span></div>
    <p class="pt-small pt-muted" style="margin:0">${d.sub(rows)}</p>
    <button type="button" class="pt-btn ar-dec-cta" onclick="_tcShow('${key}')">Voir la liste →</button>`}
  </article>`;
}

export function renderTesClients() {
  const host = document.getElementById('tabPortefeuille');
  if (!host) return;
  if (!_S._byMonth || !(_S.finalData || []).length) { host.innerHTML = '<div class="pt-wrap"><div class="pt-card pt-muted">Charge un consommé pour voir tes clients.</div></div>'; return; }
  const sc = computeClientsPartie();
  const dec = _decisions();
  if (!dec) { host.innerHTML = ''; return; }
  const dt = _S.consommePeriodMaxFull || _S.consommePeriodMax;
  const com = _S._selectedCommercial;
  const scoreCard = sc.score == null
    ? `<div class="pt-card pt-muted">Pas encore de score Clients : il faut au moins 12 mois d’historique de ventes.</div>`
    : `<div class="pt-card pt-col" style="gap:18px">
        <div class="pt-row pt-between" style="align-items:flex-start;gap:12px">
          <div class="pt-col" style="gap:4px"><span class="pt-eyebrow">Score Clients · fidélité</span>
            <button type="button" class="pt-link pt-small" style="padding:0;text-align:left" onclick="switchTab('partie')">Compte dans La partie →</button></div>
          <div class="pt-num pt-big" style="color:${_col(sc.score)}">${sc.score}<span class="pt-muted" style="font-size:20px">/100</span></div>
        </div>
        <div class="pt-col" style="gap:6px">
          ${_bar(sc.score)}
          <span class="pt-small pt-muted">Sur les 6 mois précédents, ${_eur(sc.caPrev)} de CA comptoir ; ${sc.score} % venaient de clients revenus depuis (${_eur(sc.caKept)}).</span>
        </div>
        <div class="pt-col" style="gap:4px">
          <span class="pt-small"><span class="pt-strong">À titre d’info</span> <span class="pt-muted">· hors score</span></span>
          <span class="pt-small pt-muted">En nombre : ${_n(sc.kept)} clients revenus sur ${_n(sc.prev)} (${sc.fideliteClients} %) — beaucoup de clients de passage.</span>
          ${sc.part != null ? `<span class="pt-small pt-muted">Part de portefeuille : ton comptoir = ${sc.part} % du CA Legallais ${sc.yN1} de ${_n(sc.nbPart)} clients (${_eur(sc.caN1)} sur ${_eur(sc.legN1)}) — le reste passe en livraison et par les représentants.</span>` : ''}
        </div>
      </div>`;
  host.innerHTML = `<div class="pt-wrap">
    <header class="pt-col" style="gap:6px">
      <span class="pt-eyebrow">Pilotage commercial</span>
      <h2 class="pt-h2" style="font-size:28px">Tes clients</h2>
      <span class="pt-small pt-muted">${escapeHtml(_S.selectedMyStore || '')} · ventes au comptoir${dt ? ` · données au ${new Date(dt).toLocaleDateString('fr-FR')}` : ''}${com ? ` · listes filtrées sur ${escapeHtml(com)}` : ''}</span>
    </header>
    <section class="ar-head">
      ${scoreCard}
      <div class="pt-card pt-col" style="gap:14px">
        <span class="pt-eyebrow">Ta clientèle comptoir</span>
        <div class="pt-num" style="font-size:40px;font-weight:600;line-height:1">${_n(dec.nbActifs)}<span class="pt-muted" style="font-size:16px;font-weight:400"> clients sur 12 mois</span></div>
        <span class="pt-muted">${_eur(dec.ca12)} de CA comptoir · panier annuel moyen ${_eur(dec.nbActifs ? dec.ca12 / dec.nbActifs : 0)}</span>
        <span class="pt-small pt-muted">Pour le détail historique : <button type="button" class="pt-link pt-small" style="padding:0" onclick="switchTab('clients')">Fidélisation PDV</button> · <button type="button" class="pt-link pt-small" style="padding:0" onclick="switchTab('commerce')">Conquête Terrain</button></span>
      </div>
    </section>
    <section class="pt-col" style="gap:16px">
      <div class="pt-row pt-between" style="gap:12px;flex-wrap:wrap;align-items:baseline">
        <h3 class="pt-h2">Tes décisions clients</h3>
        <span class="pt-small pt-muted">Chaque liste est triée par enjeu · clic sur un client = sa fiche</span>
      </div>
      <div class="ar-decs">${ORDER.map(k => _card(k, dec[k])).join('')}</div>
    </section>
    <section class="pt-col" style="gap:12px">${ORDER.map(k => _list(k, dec[k])).join('')}</section>
  </div>`;
}

window._tcShow = (key) => {
  _openList = key;
  renderTesClients();
  const el = document.getElementById(`tcSec-${key}`);
  if (el) { el.open = true; el.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
};
window._tcCsv = (key) => {
  const dec = _decisions(); const d = DEFS[key];
  if (!dec || !d) return;
  const q = (v) => `"${String(v ?? '').replace(/<[^>]+>/g, '').replace(/"/g, '""')}"`;
  const head = key === 'rattacher' ? ['Code Client', 'Nom', 'Ville', 'CA 12 mois', 'Commercial (à remplir)'] : ['Code Client', 'Nom', 'Métier', 'Commercial', 'Ville', ...d.head];
  const lines = [head.map(q).join(';'), ...dec[key].map(r => (key === 'rattacher'
    ? [r.cc, r.nom, r.ville, Math.round(r.ca), '']
    : [r.cc, r.nom, r.metier, r.commercial, r.ville, ...d.cells(r)]).map(q).join(';'))];
  const url = URL.createObjectURL(new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a'); a.href = url; a.download = `PRISME_${_S.selectedMyStore}_clients_${d.verb.replace(/\s+/g, '-')}.csv`; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
