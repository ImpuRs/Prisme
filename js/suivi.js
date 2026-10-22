// © 2026 Jawad El Barkaoui — Tous droits réservés
// PRISME — suivi.js
// Suivi d'un chargement à l'autre (affiché dans La partie) :
//   • à chaque nouveau jeu de données, une photo compacte des articles est rangée dans PRISME_PARTIE
//     (base séparée : survit à « Purger le cache ») ;
//   • le bilan compare la photo courante à la précédente : MIN/MAX recommandés appliqués dans l'ERP,
//     ruptures sur articles fréquents, valeur de stock, score ;
//   • sauvegarde / restauration en fichier JSON (survit aussi à un nettoyage du navigateur ou à un autre poste).
// ═══════════════════════════════════════════════════════════════
'use strict';

import { _S } from './state.js';
import { formatEuro, escapeHtml } from './utils.js';
import { clientsARelancer } from './clients-decisions.js';
import { _saveArticleSnapshot, _loadArticleSnapshot, _exportPartieBackup, _importPartieBackup, _loadFinTrack, _saveFinTrack } from './cache.js';
import { isFinDeVie } from './engine.js';
import { downloadErpFile } from './export-erp.js';

// Photo : code → [stock, MIN ERP, MAX ERP, MIN PRISME, MAX PRISME, PU, fréquent (F/M = 1)]
function _photo() {
  const a = {};
  for (const r of _S.finalData || []) {
    if (!/^\d{6}$/.test(r.code) || r.isParent) continue;
    a[r.code] = [r.stockActuel || 0, r.ancienMin || 0, r.ancienMax || 0, r.nouveauMin || 0, r.nouveauMax || 0,
      Math.round((r.prixUnitaire || 0) * 100) / 100, (r.fmrClass === 'F' || r.fmrClass === 'M') ? 1 : 0];
  }
  return a;
}

function _kpis(a) {
  let valeur = 0, rupt = 0, ecarts = 0;
  for (const c in a) {
    const [st, mi, ma, pmi, pma, pu, freq] = a[c];
    valeur += Math.max(0, st) * pu;
    if (freq && mi > 0 && st <= 0) rupt++;
    if (mi !== pmi || ma !== pma) ecarts++;
  }
  return { valeur, rupt, ecarts };
}

// ── Passages en fin de vie (fin de série / fin de stock) ──
// Indépendant de la date du consommé : un ZZAT ou un état du stock du jour suffit à détecter un changement de statut.
// 1er passage : tout l'existant est noté « connu » (pas de fausse alerte) ; ensuite, les articles qui deviennent
// fin de vie forment un lot daté, affiché jusqu'au lot suivant.
export async function trackFinDeVie() {
  const store = _S.selectedMyStore;
  if (!store || !(_S.finalData || []).length) return null;
  const now = Date.now();
  const cur = new Set();
  for (const r of _S.finalData) if (/^\d{6}$/.test(r.code) && !r.isParent && isFinDeVie(r)) cur.add(r.code);
  const rec = await _loadFinTrack(store);
  let v;
  if (!rec?.known) v = { known: Object.fromEntries([...cur].map(c => [c, now])), since: now, batch: null };
  else {
    const known = {};
    const fresh = [];
    for (const c of cur) { if (rec.known[c]) known[c] = rec.known[c]; else { known[c] = now; fresh.push(c); } }
    v = { known, since: rec.since || now, prevT: rec.lastT || rec.since, batch: fresh.length ? { t: now, from: rec.lastT || rec.since, codes: fresh } : rec.batch };
  }
  v.lastT = now;
  await _saveFinTrack(store, v);
  // Lot affiché : seulement les articles toujours en fin de vie et dans la base
  const codes = (v.batch?.codes || []).filter(c => cur.has(c));
  _S._finNew = codes.length ? { t: v.batch.t, from: v.batch.from, codes } : null;
  if (_S.cockpitLists) _S.cockpitLists.finsNew = new Set(codes);
  return _S._finNew;
}

/** Détail du lot : à passer à 0/0 dans l'ERP, stock à liquider / renvoyer. */
export function finNewDetail() {
  const f = _S._finNew;
  if (!f) return null;
  const by = new Map((_S.finalData || []).map(r => [r.code, r]));
  const arts = f.codes.map(c => by.get(c)).filter(Boolean);
  const val = (r) => r.valeurStock != null ? r.valeurStock : Math.max(0, r.stockActuel || 0) * (r.prixUnitaire || 0);
  const erp = arts.filter(r => (r.ancienMin || 0) > 0 || (r.ancienMax || 0) > 0);
  const enStock = arts.filter(r => (r.stockActuel || 0) > 0);
  return {
    ...f, arts, erp, enStock,
    saso: enStock.filter(r => r._dispoSaso > 0),
    liquider: enStock.filter(r => !(r._dispoSaso > 0) && (r.W || 0) > 0), renvoyer: enStock.filter(r => !(r._dispoSaso > 0) && !(r.W || 0)),
    valeur: enStock.reduce((s, r) => s + val(r), 0),
  };
}
window._finNewErp = () => {
  const d = finNewDetail();
  if (d?.erp.length) downloadErpFile(d.erp.map(r => ({ code: r.code, empl: r.emplacement || '', nMin: 0, nMax: 0 })), 'fins_de_vie');
};
window._finNewList = () => window.showCockpitInTable?.('finsNew');

/** Enregistre la photo du jeu courant et calcule le bilan vs la photo précédente. */
export async function recordSuiviAndBilan(dataKey) {
  const store = _S.selectedMyStore;
  if (!store || !dataKey || !(_S.finalData || []).length) return null;
  // Clients réguliers qui décrochent (liste « Relancer », sans filtre) : cc → CA comptoir 12 mois
  let rel = {};
  try { for (const r of clientsARelancer().slice(0, 300)) rel[r.cc] = Math.round(r.ca || 0); } catch (e) { rel = null; }
  const cur = { key: dataKey, t: Date.now(), a: _photo(), rel };
  const keys = await _saveArticleSnapshot(store, cur);
  const prevKey = [...keys].filter(k => k < dataKey).pop();
  const prev = prevKey ? await _loadArticleSnapshot(store, prevKey) : null;
  const kc = _kpis(cur.a);
  if (!prev?.a) { _S._suiviBilan = { first: true, cur: kc, curKey: dataKey }; return _S._suiviBilan; }
  const kp = _kpis(prev.a);
  // Recos appliquées : l'ERP d'aujourd'hui = la reco PRISME de la photo précédente (qui différait alors de l'ERP)
  let applied = 0, aAppliquer = 0, libere = 0;
  for (const c in prev.a) {
    const p = prev.a[c], n = cur.a[c];
    if (!n) continue;
    const prevDiff = p[1] !== p[3] || p[2] !== p[4];
    if (!prevDiff) continue;
    aAppliquer++;
    if (n[1] === p[3] && n[2] === p[4]) { applied++; libere += (p[2] - p[4]) * p[5]; }
  }
  // Nouvelles ruptures d'articles fréquents (en stock au chargement précédent, à zéro aujourd'hui) et ruptures résolues
  const newRupt = [];
  let rupResolues = 0;
  for (const c in cur.a) {
    const n = cur.a[c], p = prev.a[c];
    if (!p || !n[6] || n[1] <= 0) continue;
    if (n[0] <= 0 && p[0] > 0) newRupt.push(c);
    if (n[0] > 0 && p[0] <= 0 && p[6] && p[1] > 0) rupResolues++;
  }
  const fd = new Map((_S.finalData || []).map(r => [r.code, r]));
  newRupt.sort((x, y) => ((fd.get(y)?.W || 0) - (fd.get(x)?.W || 0)));
  // Clients entrés dans « Relancer » depuis (la photo précédente doit avoir la liste)
  const newRel = prev.rel && cur.rel ? Object.keys(cur.rel).filter(cc => !(cc in prev.rel)).sort((x, y) => cur.rel[y] - cur.rel[x]) : null;
  _S._suiviBilan = { first: false, prevKey, curKey: dataKey, prev: kp, cur: kc, applied, aAppliquer, libere, newRupt, rupResolues, newRel, rel: cur.rel };
  return _S._suiviBilan;
}

const _d = (ymd) => { const [y, m, d] = String(ymd).split('-').map(Number); return new Date(y, m - 1, d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }); };
const _delta = (v, unit = '', good = 'down') => {
  if (!v) return '<span class="pt-muted">=</span>';
  const ok = good === 'down' ? v < 0 : v > 0;
  return `<span class="pt-num pt-strong" style="color:${ok ? 'var(--pt-high)' : 'var(--pt-low)'}">${v > 0 ? '+' : '−'}${unit === '€' ? formatEuro(Math.abs(v)) : Math.abs(v).toLocaleString('fr-FR')}</span>`;
};

const _libArt = (c) => _S.libelleLookup?.[c] || (_S.finalData || []).find(r => r.code === c)?.libelle || c;
const _nomCli = (cc) => _S.chalandiseData?.get(cc)?.nom || _S.clientNomLookup?.[cc] || cc;
const _list = (items, open) => items.length ? `<ul class="sv-list">${items.map(x => `<li><button type="button" class="pt-link sv-item" onclick="${open(x)}">${x.html}</button></li>`).join('')}</ul>` : '';
const _backup = `<div class="pt-row" style="gap:16px;flex-wrap:wrap">
      <button type="button" class="pt-link pt-small" onclick="window._suiviExport()">Sauvegarder l'historique (fichier)</button>
      <label class="pt-link pt-small" style="cursor:pointer">Restaurer une sauvegarde<input type="file" accept=".json" style="display:none" onchange="window._suiviImport(this)"></label>
    </div>`;

/** « Depuis le dernier chargement » : en tête de La partie (rien au premier chargement). */
/** Bloc « Passés en fin de série / fin de stock » (La partie, en tête) : visible tant qu'un lot est en cours. */
export function renderFinNewBlock() {
  const d = finNewDetail();
  if (!d || !d.arts.length) return '';
  const dt = (t) => new Date(t).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
  const items = d.arts.slice().sort((a, b) => (b.stockActuel || 0) * (b.prixUnitaire || 0) - (a.stockActuel || 0) * (a.prixUnitaire || 0)).slice(0, 6)
    .map(r => ({ c: r.code, html: `${escapeHtml(r.libelle || r.code)} <span class="pt-muted pt-num">${r.code} · ${escapeHtml(r.statut || '')}${(r.stockActuel || 0) > 0 ? ` · ${r.stockActuel} en stock` : ''}</span>` }));
  const step = (n, txt) => n ? `<li><span class="pt-num pt-strong">${n.toLocaleString('fr-FR')}</span> ${txt}</li>` : '';
  return `<section class="pt-card pt-col" style="gap:14px">
    <div class="pt-row pt-between" style="gap:12px;flex-wrap:wrap;align-items:baseline">
      <div class="pt-col" style="gap:2px"><span class="pt-eyebrow">Statuts ERP</span>
        <h2 class="pt-h3"><span class="pt-num">${d.arts.length.toLocaleString('fr-FR')}</span> article${d.arts.length > 1 ? 's' : ''} passé${d.arts.length > 1 ? 's' : ''} en fin de série / fin de stock</h2></div>
      <span class="pt-small pt-muted">détecté${d.arts.length > 1 ? 's' : ''} le ${dt(d.t)}${d.from ? ` (depuis le chargement du ${dt(d.from)})` : ''}</span>
    </div>
    <ol class="pt-small" style="margin:0;padding-left:18px;display:flex;flex-direction:column;gap:4px">
      ${step(d.erp.length, `ont encore un MIN/MAX dans l’ERP : <b>passe-les à 0/0</b> pour arrêter la réappro.`)}
      ${step(d.saso.length, `encore disponibles à SASO : <b>à renvoyer en priorité</b>.`)}
      ${step(d.liquider.length, `en stock et encore vendus : <b>à liquider</b> au comptoir (mise en avant, prix).`)}
      ${step(d.renvoyer.length, `en stock sans vente en 12 mois : <b>à renvoyer</b> à la centrale.`)}
      ${d.enStock.length ? `<li class="pt-muted">${formatEuro(d.valeur)} de stock concerné.</li>` : ''}
    </ol>
    ${_list(items, x => `window.openArticlePanel?.('${x.c}','suivi')`)}
    <div class="pt-row" style="gap:16px;flex-wrap:wrap">
      <button type="button" class="pt-link pt-small" onclick="window._finNewList()">Voir les ${d.arts.length.toLocaleString('fr-FR')} articles →</button>
      ${d.erp.length ? `<button type="button" class="pt-link pt-small" onclick="window._finNewErp()">Fichier ERP : ${d.erp.length.toLocaleString('fr-FR')} à 0/0</button>` : ''}
    </div>
  </section>`;
}

export function renderSuiviHead(scoreDelta) {
  const b = _S._suiviBilan;
  if (!b || b.first) return '';
  const rupt = b.newRupt || [];
  const rel = b.newRel;
  const reste = b.aAppliquer - b.applied;
  const ruptItems = rupt.slice(0, 5).map(c => ({ c, html: `${escapeHtml(_libArt(c))} <span class="pt-muted pt-num">${c}</span>` }));
  const relItems = (rel || []).slice(0, 5).map(cc => ({ cc, html: `${escapeHtml(_nomCli(cc))} <span class="pt-muted pt-num">${formatEuro(b.rel?.[cc] || 0)}</span>` }));
  const col = (title, n, hint, body) => `<div class="pt-col sv-col"><div class="pt-row" style="gap:10px;align-items:baseline"><span class="pt-num" style="font-size:28px;font-weight:600">${n}</span><span class="pt-strong">${title}</span></div><span class="pt-small pt-muted">${hint}</span>${body}</div>`;
  return `<section class="pt-card pt-col" style="gap:16px">
    <div class="pt-row pt-between" style="gap:12px;flex-wrap:wrap;align-items:baseline">
      <div class="pt-col" style="gap:2px"><span class="pt-eyebrow">Depuis le dernier chargement</span><h2 class="pt-h3">Ce qui a bougé depuis les données du ${_d(b.prevKey)}</h2></div>
      <span class="pt-small pt-muted">Score agence ${scoreDelta == null ? '—' : `<span class="pt-num pt-strong">${scoreDelta > 0 ? '+' : ''}${scoreDelta}</span>`} · valeur de stock ${_delta(Math.round(b.cur.valeur - b.prev.valeur), '€')}</span>
    </div>
    <div class="sv-cols">
      ${col('nouvelles ruptures', rupt.length, `articles fréquents passés à zéro${b.rupResolues ? ` · ${b.rupResolues} remis en stock` : ''}`,
        _list(ruptItems, x => `window.openArticlePanel?.('${x.c}','suivi')`) + (rupt.length > 5 ? `<button type="button" class="pt-link pt-small" onclick="window.showCockpitInTable?.('ruptures')">Toutes les ruptures →</button>` : ''))}
      ${col('clients qui décrochent', rel == null ? '—' : rel.length, rel == null ? 'visible au prochain chargement' : 'réguliers entrés dans « Relancer »',
        _list(relItems, x => `window.openClient360?.('${x.cc}','suivi')`) + (rel && rel.length ? `<button type="button" class="pt-link pt-small" onclick="switchTab('portefeuille')">Voir Tes clients →</button>` : ''))}
      ${col('MIN/MAX passés dans l’ERP', `${b.applied}<span class="pt-small pt-muted"> / ${b.aAppliquer}</span>`, `${reste > 0 ? `${reste} pas encore appliqués` : 'tout est appliqué'} · ${b.cur.ecarts.toLocaleString('fr-FR')} écarts ERP ≠ PRISME en tout${b.libere > 0 ? ` · ${formatEuro(b.libere)} de MAX libérés` : ''}`,
        b.cur.ecarts ? `<button type="button" class="pt-link pt-small" onclick="switchTab('arbitrage');setTimeout(()=>document.getElementById('arErpExport')?.scrollIntoView({behavior:'smooth'}),300)">Fichier pour l’ERP →</button>` : '')}
    </div>
    ${_backup}
  </section>`;
}

/** Premier chargement : le suivi démarre (en bas de La partie). */
export function renderSuiviCard() {
  const b = _S._suiviBilan;
  if (!b?.first) return '';
  return `<section class="pt-card pt-col" style="gap:10px">
      <div class="pt-eyebrow">Ton suivi</div>
      <p class="pt-muted" style="margin:0">Le suivi démarre avec ces données. Au prochain chargement, tu verras en haut de La partie ce qui a bougé : nouvelles ruptures, clients qui décrochent, MIN/MAX passés dans l'ERP. L'historique survit à « Purger le cache » ; garde aussi une sauvegarde en fichier.</p>
      ${_backup}
    </section>`;
}


window._suiviExport = async () => {
  try {
    const data = await _exportPartieBackup();
    const blob = new Blob([JSON.stringify({ prisme: 'historique', v: 1, date: new Date().toISOString(), data })], { type: 'application/json' });
    const url = URL.createObjectURL(blob); const a = document.createElement('a');
    a.href = url; a.download = `PRISME_historique_${_S.selectedMyStore || ''}_${new Date().toISOString().slice(0, 10)}.json`; a.click(); URL.revokeObjectURL(url);
  } catch (e) { window.showToast?.('Sauvegarde impossible : ' + e.message, 'error'); }
};
window._suiviImport = async (input) => {
  const f = input.files?.[0]; if (!f) return;
  try {
    const obj = JSON.parse(await f.text());
    const n = await _importPartieBackup(obj?.data || obj);
    window.showToast?.(`Historique restauré (${n} éléments) — recharge la page pour l'afficher`, 'success');
  } catch (e) { window.showToast?.('Restauration impossible : ' + e.message, 'error'); }
  input.value = '';
};
