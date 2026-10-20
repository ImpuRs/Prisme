// © 2026 Jawad El Barkaoui — Tous droits réservés
// PRISME — rapport.js
// Reporting mensuel (bouton « Reporting » de la barre du haut) : un rapport lisible tel quel,
// sur une période au choix (dernier mois complet / 3 mois / 12 mois) comparée à la même période N-1.
//   Chiffres clés (CA tous canaux, marge, clients, canaux) · Réseau (rang, médiane, évolution)
//   Score agence (La partie) · Stock (photo à la date des données) · Clients (décisions + relances notées)
//   Nos 3 actions (top de La partie)
// Sorties : « Copier le texte » (e-mail / Excel), « Imprimer / PDF », « Copier pour une IA » (consignes + données).
// Sources : _byMonthStoreArtCanal (CA/VMB par agence × mois), _byMonthClients (clients actifs, agence),
// _byMonthClientCAByCanal (CA par canal, agence) — mêmes chiffres que le reste de l'appli.
// ═══════════════════════════════════════════════════════════════
'use strict';

import { _S } from './state.js';
import { formatEuro, escapeHtml, ptTile } from './utils.js';
import { isInvendu, excedentSurStock } from './engine.js';
import { computeStockPartie } from './partie.js';
import { clientsDecisionsAll } from './clients-decisions.js';
import { computeErpChanges } from './export-erp.js';
import { ensureRelances, relancesData } from './relances.js';

const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const CANAUX = { MAGASIN: 'Comptoir', INTERNET: 'Internet', REPRESENTANT: 'Représentant', DCS: 'DCS', AUTRE: 'Autre' };
const PERIODES = { mois: 'Dernier mois', trim: '3 derniers mois', an: '12 derniers mois' };
let _periode = 'mois';
let _cache = null, _cacheKey = '';

const _n = (v) => Math.round(v || 0).toLocaleString('fr-FR');
const _pct = (a, b) => (b > 0 && a >= 0) ? Math.round((a / b - 1) * 1000) / 10 : null;
const _sgn = (v) => v == null ? '—' : `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toLocaleString('fr-FR')} %`;
const _lib = (r) => String(r.libelle || r.code).replace(/\s+/g, ' ').trim();
const _mLabel = (m) => `${MOIS[((m % 12) + 12) % 12]} ${Math.floor(m / 12)}`;
const _ymd = (m, last) => { const y = Math.floor(m / 12), mo = m % 12; const d = last ? new Date(y, mo + 1, 0) : new Date(y, mo, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

/** Agrégats mensuels par agence (CA, VMB) et par canal pour mon agence — calculés une fois par jeu de données. */
function _agg() {
  const bm = _S._byMonthStoreArtCanal || {};
  const key = `${_S.selectedMyStore}|${_S.finalData?.length || 0}|${Object.keys(bm).length}|${_S.consommePeriodMaxFull || _S.consommePeriodMax}`;
  if (_cache && key === _cacheKey) return _cache;
  const stores = {}, myCanal = {};
  let minM = Infinity, maxM = -Infinity;
  for (const [store, canaux] of Object.entries(bm)) {
    const sm = stores[store] = {};
    for (const [canal, arts] of Object.entries(canaux)) {
      for (const months of Object.values(arts)) {
        for (const [ms, d] of Object.entries(months)) {
          const m = +ms;
          if (m < minM) minM = m; if (m > maxM) maxM = m;
          const e = sm[m] || (sm[m] = { ca: 0, vmb: 0 });
          e.ca += d.sumCA || 0; e.vmb += d.sumVMB || 0;
          if (store === _S.selectedMyStore) {
            const c = myCanal[canal] || (myCanal[canal] = {});
            c[m] = (c[m] || 0) + (d.sumCA || 0);
          }
        }
      }
    }
  }
  _cache = { stores, myCanal, minM, maxM };
  _cacheKey = key;
  return _cache;
}

/** Bornes de la période choisie (indices de mois = année × 12 + mois) et de la même période N-1. */
function _bornes() {
  const d = new Date(_S.consommePeriodMaxFull || _S.consommePeriodMax || Date.now());
  const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  const last = d.getFullYear() * 12 + d.getMonth() - (d.getDate() < lastDay ? 1 : 0); // dernier mois complet
  const len = _periode === 'mois' ? 1 : _periode === 'trim' ? 3 : 12;
  return { a: last - len + 1, b: last, a1: last - len + 1 - 12, b1: last - 12, len };
}

const _sumRange = (byM, a, b, f = (x) => x) => { let s = 0; for (let m = a; m <= b; m++) if (byM?.[m] != null) s += f(byM[m]); return s; };

function _clientsActifs(a, b) {
  const bmc = _S._byMonthClients;
  if (!bmc) return null;
  const set = new Set();
  for (let m = a; m <= b; m++) for (const cc of bmc[m] || []) set.add(cc);
  return set.size;
}

/** Toutes les données du rapport. */
function computeRapport() {
  const ag = _agg();
  const P = _bornes();
  const me = _S.selectedMyStore;
  // N-1 seulement sur des mois complets : le premier mois des données compte s'il commence le 1er
  const d0 = _S.consommePeriodMinFull || _S.consommePeriodMin;
  const firstFull = d0 ? new Date(d0).getFullYear() * 12 + new Date(d0).getMonth() + (new Date(d0).getDate() > 1 ? 1 : 0) : ag.minM;
  const hasN1 = Math.max(ag.minM, firstFull) <= P.a1;
  const my = ag.stores[me] || {};
  const ca = _sumRange(my, P.a, P.b, x => x.ca), vmb = _sumRange(my, P.a, P.b, x => x.vmb);
  const ca1 = hasN1 ? _sumRange(my, P.a1, P.b1, x => x.ca) : null, vmb1 = hasN1 ? _sumRange(my, P.a1, P.b1, x => x.vmb) : null;
  const canaux = Object.entries(ag.myCanal).map(([k, byM]) => ({ k, label: CANAUX[k] || k, ca: _sumRange(byM, P.a, P.b), ca1: hasN1 ? _sumRange(byM, P.a1, P.b1) : null }))
    .filter(c => c.ca > 0 || c.ca1 > 0).sort((x, y) => y.ca - x.ca);
  const cli = _clientsActifs(P.a, P.b), cli1 = hasN1 ? _clientsActifs(P.a1, P.b1) : null;

  // Réseau : CA de chaque agence sur la période, rang, médiane, évolution médiane
  const rows = Object.entries(ag.stores).map(([s, byM]) => ({ s, ca: _sumRange(byM, P.a, P.b, x => x.ca), ca1: hasN1 ? _sumRange(byM, P.a1, P.b1, x => x.ca) : null })).filter(r => r.ca > 0);
  rows.sort((x, y) => y.ca - x.ca);
  const med = (arr) => { const v = arr.filter(x => x != null).sort((x, y) => x - y); if (!v.length) return null; const i = v.length >> 1; return v.length % 2 ? v[i] : (v[i - 1] + v[i]) / 2; };
  const others = rows.filter(r => r.s !== me);
  const reseau = rows.length > 1 ? {
    rang: rows.findIndex(r => r.s === me) + 1, nb: rows.length,
    med: med(others.map(r => r.ca)),
    evoMed: hasN1 ? med(others.map(r => r.ca1 ? _pct(r.ca, r.ca1) : null)) : null,
  } : null;

  // Score agence (La partie) et écart avec le chargement précédent
  const p = _S._partie;
  const hist = _S._partieHist || [];
  const prev = hist.length >= 2 ? hist[hist.length - 2] : null;
  const score = p ? { global: p.global, assort: p.assort, stock: p.stock, clients: p.clients, delta: prev && p.global != null ? p.global - prev.global : null } : null;

  // Stock : photo à la date des données
  const fd = _S.finalData || [];
  const sp = computeStockPartie(fd);
  let valStock = 0, invN = 0, invVal = 0, excVal = 0;
  for (const r of fd) {
    const v = Math.max(0, r.stockActuel || 0) * (r.prixUnitaire || 0);
    valStock += v;
    if (isInvendu(r)) { invN++; invVal += v; }
    excVal += excedentSurStock(r) * (r.prixUnitaire || 0);
  }
  const rupTop = [...sp.rupArts].sort((x, y) => (y.W || 0) - (x.W || 0)).slice(0, 5);
  let erp = null;
  try { erp = computeErpChanges().length; } catch (_) { /* pas de MIN/MAX */ }
  const bilan = _S._suiviBilan && !_S._suiviBilan.first ? _S._suiviBilan : null;
  const stock = { valStock, dispo: sp.service, rup: sp.rupArts.length, rupTop, saso: sp.sasoArts.length, excVal, invN, invVal, erp, appliques: bilan ? { n: bilan.applied, sur: bilan.aAppliquer } : null };

  // Clients : décisions (à la date des données) + relances notées sur la période
  let dec = null;
  try { dec = clientsDecisionsAll(); } catch (_) { dec = null; }
  const sumCa = (l) => (l || []).reduce((s, r) => s + (r.ca || 0), 0);
  const rel = relancesData() || {};
  const dA = _ymd(P.a, false), dB = _ymd(P.b, true);
  const cnt = { appele: 0, rdv: 0, sans_suite: 0 }, relCc = new Set();
  let revenus = 0;
  for (const [cc, h] of Object.entries(rel)) {
    let first = null;
    for (const e of h) {
      if (e.d < dA || e.d > dB || !(e.s in cnt)) continue;
      cnt[e.s]++; relCc.add(cc);
      if (!first || e.d < first) first = e.d;
    }
    const lo = _S.clientLastOrderAll?.get(cc) || _S.clientLastOrder?.get(cc);
    if (first && lo && new Date(lo) > new Date(first)) revenus++;
  }
  const clients = dec ? {
    fidelite: p?.clients ?? null, detail: p?.clientsDetail || null,
    relancer: { n: dec.relancer.length, ca: sumCa(dec.relancer) },
    reconquerir: { n: dec.reconquerir.length, ca: sumCa(dec.reconquerir) },
    nouveaux: dec.nouveaux.filter(r => r.type === 'Nouveau').length,
    reactives: dec.nouveaux.filter(r => r.type === 'Réactivé').length,
    relances: { ...cnt, clients: relCc.size, revenus },
  } : null;

  const actions = (p?.actions || []).slice(0, 3).map(a => ({ title: a.title, where: a.where, gain: a.gain }));

  return {
    agence: me, P, hasN1,
    titre: P.len === 1 ? _mLabel(P.b) : `${_mLabel(P.a)} → ${_mLabel(P.b)}`,
    titreN1: P.len === 1 ? _mLabel(P.b1) : `${_mLabel(P.a1)} → ${_mLabel(P.b1)}`,
    dataDate: _S.consommePeriodMaxFull || _S.consommePeriodMax,
    ventes: { ca, ca1, evo: ca1 ? _pct(ca, ca1) : null, marge: ca ? vmb / ca * 100 : null, marge1: ca1 ? vmb1 / ca1 * 100 : null, cli, cli1, evoCli: cli1 ? _pct(cli, cli1) : null, canaux },
    reseau, score, stock, clients, actions,
  };
}

// ── Rendu ───────────────────────────────────────────────────
const _evo = (v) => v == null ? '<span class="pt-muted">N-1 indisponible</span>' : `<span class="pt-num pt-strong" style="color:${v >= 0 ? 'var(--pt-high)' : 'var(--pt-low)'}">${_sgn(v)}</span> vs N-1`;
const _marge = (m) => m == null ? '—' : `${m.toFixed(1).replace('.', ',')} %`;
const _sec = (title, body) => `<section class="rp-sec"><h3 class="rp-h">${title}</h3>${body}</section>`;

function _html(R) {
  const v = R.ventes;
  const tot = v.canaux.reduce((s, c) => s + c.ca, 0) || 1;
  const canaux = v.canaux.map(c => `<tr><td>${escapeHtml(c.label)}</td><td class="ar-r pt-num">${formatEuro(c.ca)}</td><td class="ar-r pt-num">${Math.round(c.ca / tot * 100)} %</td><td class="ar-r">${c.ca1 ? _sgn(_pct(c.ca, c.ca1)) : '—'}</td></tr>`).join('');
  const s = R.stock, c = R.clients, sc = R.score, rz = R.reseau;
  return `
  <div class="rp-head">
    <div class="pt-col" style="gap:4px">
      <span class="pt-eyebrow">Reporting agence ${escapeHtml(R.agence || '')}</span>
      <h2 class="pt-h2" style="margin:0">${escapeHtml(R.titre.charAt(0).toUpperCase() + R.titre.slice(1))}</h2>
      <span class="pt-small pt-muted">Comparé à ${escapeHtml(R.titreN1)} · données au ${R.dataDate ? new Date(R.dataDate).toLocaleDateString('fr-FR') : '—'} · le stock et les listes clients sont à la date des données</span>
    </div>
    <div class="pt-col rp-noprint" style="gap:8px;align-items:flex-end">
      <div class="pt-row" style="gap:6px;flex-wrap:wrap;justify-content:flex-end">${Object.entries(PERIODES).map(([k, l]) => `<button type="button" class="ar-chip${_periode === k ? ' ar-chip-on' : ''}" aria-pressed="${_periode === k}" onclick="window._rpPeriode('${k}')">${l}</button>`).join('')}</div>
      <div class="pt-row" style="gap:8px;flex-wrap:wrap;justify-content:flex-end">
        <button type="button" class="pt-btn" onclick="window._rpCopy('texte')">Copier le texte</button>
        <button type="button" class="pt-btn" onclick="window._rpPrint()">Imprimer / PDF</button>
        <button type="button" class="pt-btn" onclick="window._rpCopy('ia')" title="Consignes de rédaction + ces chiffres, à coller dans une IA">Copier pour une IA</button>
        <button type="button" class="pt-btn" onclick="closeReporting()">Fermer</button>
      </div>
    </div>
  </div>

  ${_sec('Chiffres clés', `<div class="pt-tiles">
    ${ptTile('CA agence · tous canaux', formatEuro(v.ca), _evo(v.evo))}
    ${ptTile('Marge', _marge(v.marge), v.marge1 != null ? `${_marge(v.marge1)} il y a un an` : '')}
    ${ptTile('Clients actifs', v.cli == null ? '—' : _n(v.cli), v.cli == null ? '' : _evo(v.evoCli))}
    ${rz ? ptTile('Rang réseau (CA)', `${rz.rang}<span class="pt-small pt-muted"> / ${rz.nb}</span>`, rz.med ? `médiane ${formatEuro(rz.med)}${rz.evoMed != null ? ` · réseau ${_sgn(Math.round(rz.evoMed * 10) / 10)} vs N-1` : ''}` : '') : ''}
  </div>
  ${canaux ? `<div class="pt-list"><div class="pt-scroll"><table class="pt-table"><thead><tr><th>Canal</th><th class="ar-r">CA</th><th class="ar-r">Part</th><th class="ar-r">vs N-1</th></tr></thead><tbody>${canaux}</tbody></table></div></div>` : ''}`)}

  ${sc ? _sec('Score agence (La partie)', `<div class="pt-tiles">
    ${ptTile('Score agence', `${sc.global ?? '—'}<span class="pt-small pt-muted"> / 100</span>`, sc.delta == null ? 'pas de chargement précédent' : `${sc.delta > 0 ? '+' : ''}${sc.delta} pt depuis le dernier chargement`)}
    ${ptTile('Assortiment', sc.assort ?? '—', '')}${ptTile('Stock', sc.stock ?? '—', '')}${ptTile('Clients', sc.clients ?? '—', '')}
  </div>`) : ''}

  ${_sec('Stock', `<div class="pt-tiles">
    ${ptTile('Valeur du stock', formatEuro(s.valStock), `${s.dispo != null ? `disponibilité des articles fréquents ${s.dispo} %` : ''}`)}
    ${ptTile('Ruptures', _n(s.rup), 'articles vendus au moins 3 fois en 12 mois, à zéro')}
    ${ptTile('Sur-stock', _n(s.saso), `${formatEuro(s.excVal)} au-dessus du MAX PRISME`)}
    ${ptTile('Jamais vendus', _n(s.invN), `${formatEuro(s.invVal)} immobilisés`)}
  </div>
  ${s.rupTop.length ? `<p class="pt-small" style="margin:0"><span class="pt-strong">Ruptures les plus vendues :</span> ${s.rupTop.map(r => `${escapeHtml(_lib(r))} <span class="pt-muted pt-num">${r.code}</span>`).join(' · ')}</p>` : ''}
  ${s.erp != null ? `<p class="pt-small pt-muted" style="margin:0">${_n(s.erp)} MIN/MAX PRISME différents de l’ERP${s.appliques ? ` · ${_n(s.appliques.n)} appliqués sur ${_n(s.appliques.sur)} depuis le chargement précédent` : ''}.</p>` : ''}`)}

  ${c ? _sec('Clients', `<div class="pt-tiles">
    ${ptTile('Fidélité comptoir', c.fidelite == null ? '—' : `${c.fidelite} %`, c.detail ? `${_n(c.detail.kept)} clients revenus sur ${_n(c.detail.prev)}` : '')}
    ${ptTile('À relancer', _n(c.relancer.n), `${formatEuro(c.relancer.ca)} de CA comptoir sur 12 mois`)}
    ${ptTile('À reconquérir', _n(c.reconquerir.n), `${formatEuro(c.reconquerir.ca)} avant leur départ`)}
    ${ptTile('Nouveaux · réactivés', `${_n(c.nouveaux)} · ${_n(c.reactives)}`, 'sur les 6 derniers mois')}
  </div>
  <p class="pt-small" style="margin:0"><span class="pt-strong">Relances notées sur la période :</span> ${c.relances.clients ? `${_n(c.relances.clients)} clients — ${_n(c.relances.appele)} appels, ${_n(c.relances.rdv)} RDV, ${_n(c.relances.sans_suite)} sans suite · ${_n(c.relances.revenus)} ont racheté depuis` : 'aucune (à noter dans la fiche client)'}</p>`) : ''}

  ${R.actions.length ? _sec('Nos 3 actions', `<ol class="rp-actions">${R.actions.map(a => `<li><span class="pt-strong">${escapeHtml(a.title)}</span> <span class="pt-small pt-muted">${escapeHtml(a.where || '')}</span></li>`).join('')}</ol>`) : ''}`;
}

/** Version texte (e-mail, cellule Excel) : titres en majuscules, tirets. */
function _texte(R) {
  const v = R.ventes, s = R.stock, c = R.clients, sc = R.score, rz = R.reseau;
  const L = [];
  L.push(`REPORTING AGENCE ${R.agence} — ${R.titre.toUpperCase()}`);
  L.push(`Comparé à ${R.titreN1} · données au ${R.dataDate ? new Date(R.dataDate).toLocaleDateString('fr-FR') : '—'}`);
  L.push('', 'CHIFFRES CLÉS');
  L.push(`- CA agence tous canaux : ${formatEuro(v.ca)}${v.evo != null ? ` (${_sgn(v.evo)} vs N-1)` : ''}`);
  if (v.marge != null) L.push(`- Marge : ${_marge(v.marge)}${v.marge1 != null ? ` (${_marge(v.marge1)} il y a un an)` : ''}`);
  if (v.cli != null) L.push(`- Clients actifs : ${_n(v.cli)}${v.evoCli != null ? ` (${_sgn(v.evoCli)} vs N-1)` : ''}`);
  const tot = v.canaux.reduce((t, x) => t + x.ca, 0) || 1;
  if (v.canaux.length) L.push(`- Canaux : ${v.canaux.map(x => `${x.label} ${formatEuro(x.ca)} (${Math.round(x.ca / tot * 100)} %${x.ca1 ? `, ${_sgn(_pct(x.ca, x.ca1))} vs N-1` : ''})`).join(' ; ')}`);
  if (rz) L.push(`- Réseau : rang ${rz.rang}/${rz.nb} en CA${rz.med ? `, médiane des autres agences ${formatEuro(rz.med)}` : ''}${rz.evoMed != null ? `, réseau ${_sgn(Math.round(rz.evoMed * 10) / 10)} vs N-1` : ''}`);
  if (sc) {
    L.push('', 'SCORE AGENCE (LA PARTIE)');
    L.push(`- ${sc.global}/100${sc.delta != null ? ` (${sc.delta > 0 ? '+' : ''}${sc.delta} pt depuis le dernier chargement)` : ''} · assortiment ${sc.assort ?? '—'} · stock ${sc.stock ?? '—'} · clients ${sc.clients ?? '—'}`);
  }
  L.push('', 'STOCK');
  L.push(`- Valeur : ${formatEuro(s.valStock)}${s.dispo != null ? ` · disponibilité des articles fréquents ${s.dispo} %` : ''}`);
  L.push(`- Ruptures : ${_n(s.rup)}${s.rupTop.length ? ` (dont ${s.rupTop.slice(0, 3).map(_lib).join(', ')})` : ''}`);
  L.push(`- Sur-stock : ${_n(s.saso)} articles, ${formatEuro(s.excVal)} au-dessus du MAX PRISME`);
  L.push(`- Jamais vendus en 12 mois : ${_n(s.invN)} articles, ${formatEuro(s.invVal)} immobilisés`);
  if (s.erp != null) L.push(`- MIN/MAX : ${_n(s.erp)} à passer dans l'ERP${s.appliques ? ` (${_n(s.appliques.n)}/${_n(s.appliques.sur)} appliqués depuis le chargement précédent)` : ''}`);
  if (c) {
    L.push('', 'CLIENTS');
    if (c.fidelite != null) L.push(`- Fidélité comptoir : ${c.fidelite} %${c.detail ? ` (${_n(c.detail.kept)} clients revenus sur ${_n(c.detail.prev)})` : ''}`);
    L.push(`- À relancer : ${_n(c.relancer.n)} clients réguliers qui décrochent (${formatEuro(c.relancer.ca)} de CA comptoir 12 mois)`);
    L.push(`- À reconquérir : ${_n(c.reconquerir.n)} clients perdus depuis 6 à 12 mois (${formatEuro(c.reconquerir.ca)})`);
    L.push(`- Nouveaux / réactivés sur 6 mois : ${_n(c.nouveaux)} / ${_n(c.reactives)}`);
    L.push(`- Relances notées sur la période : ${c.relances.clients ? `${_n(c.relances.clients)} clients (${_n(c.relances.appele)} appels, ${_n(c.relances.rdv)} RDV, ${_n(c.relances.sans_suite)} sans suite), ${_n(c.relances.revenus)} ont racheté depuis` : 'aucune'}`);
  }
  if (R.actions.length) {
    L.push('', 'NOS 3 ACTIONS');
    R.actions.forEach((a, i) => L.push(`${i + 1}. ${a.title}${a.where ? ` (${a.where})` : ''}`));
  }
  L.push('', `Source : PRISME · ${new Date().toLocaleDateString('fr-FR')}`);
  return L.join('\n');
}

/** Version IA : consignes de rédaction + les mêmes données. */
function _ia(R) {
  return [
    `RÔLE : Tu es chef d'agence en distribution B2B quincaillerie (réseau Legallais). Tu rédiges le reporting de l'agence pour ta direction régionale.`,
    `FORMAT : texte brut (cellule Excel ou e-mail). Pas de markdown. Titres en MAJUSCULES, tirets simples pour les listes. 300 mots maximum.`,
    `POSTURE : parler au nom de l'agence et de l'équipe (« l'agence », « on »), jamais « je ».`,
    `STRUCTURE : 1. SYNTHÈSE (2 phrases : CA et évolution, le moteur, le risque) — 2. PERFORMANCE (CA, marge, clients, canaux, réseau) — 3. STOCK (verdict : frein, neutre ou levier) — 4. CLIENTS (fidélité, à relancer, relances menées) — 5. NOS 3 ACTIONS (geste concret, échéance, résultat attendu en €).`,
    `RÈGLES : une phrase = une idée chiffrée = un impact business. Pas de jargon, pas de dramatisation. N'invente aucun chiffre ni aucun nom absent des données ; si une donnée manque, le dire.`,
    '',
    '═══ DONNÉES ═══',
    _texte(R),
  ].join('\n');
}

let _last = null;
function _render() {
  const panel = document.getElementById('reportingPanel');
  if (!panel) return;
  try {
    _last = computeRapport();
    panel.innerHTML = `<div class="rp">${_html(_last)}</div>`;
  } catch (e) {
    console.error('[PRISME] Reporting :', e);
    panel.innerHTML = `<div class="pt-card"><p>Reporting indisponible : ${escapeHtml(e.message)}</p><button type="button" class="pt-btn" onclick="closeReporting()">Fermer</button></div>`;
  }
}

export async function openReporting() {
  const overlay = document.getElementById('reportingOverlay');
  if (!overlay) return;
  if (!(_S.finalData || []).length) { window.showToast?.('Charge d’abord les fichiers', 'info'); return; }
  const trigger = document.activeElement;
  await ensureRelances();
  _render();
  overlay.classList.add('active');
  overlay._cleanupFocusTrap = window.focusTrap?.(document.getElementById('reportingPanel'), trigger);
}

export function closeReporting() {
  const overlay = document.getElementById('reportingOverlay');
  if (overlay) { overlay._cleanupFocusTrap?.(); overlay.classList.remove('active'); }
}

window._rpPeriode = (k) => { _periode = PERIODES[k] ? k : 'mois'; _render(); };
window._rpCopy = async (kind) => {
  if (!_last) return;
  const txt = kind === 'ia' ? _ia(_last) : _texte(_last);
  try { await navigator.clipboard.writeText(txt); window.showToast?.(kind === 'ia' ? 'Copié : à coller dans une IA' : 'Rapport copié', 'success'); }
  catch (_) { window.showToast?.('Copie impossible dans ce navigateur', 'error'); }
};
window._rpPrint = () => {
  document.body.classList.add('print-report');
  const done = () => { document.body.classList.remove('print-report'); window.removeEventListener('afterprint', done); };
  window.addEventListener('afterprint', done);
  window.print();
  done();
};
window.openReporting = openReporting;
window.closeReporting = closeReporting;
