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
import { formatEuro } from './utils.js';
import { _saveArticleSnapshot, _loadArticleSnapshot, _exportPartieBackup, _importPartieBackup } from './cache.js';

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

/** Enregistre la photo du jeu courant et calcule le bilan vs la photo précédente. */
export async function recordSuiviAndBilan(dataKey) {
  const store = _S.selectedMyStore;
  if (!store || !dataKey || !(_S.finalData || []).length) return null;
  const cur = { key: dataKey, t: Date.now(), a: _photo() };
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
  _S._suiviBilan = { first: false, prevKey, curKey: dataKey, prev: kp, cur: kc, applied, aAppliquer, libere };
  return _S._suiviBilan;
}

const _d = (ymd) => { const [y, m, d] = String(ymd).split('-').map(Number); return new Date(y, m - 1, d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }); };
const _delta = (v, unit = '', good = 'down') => {
  if (!v) return '<span class="pt-muted">=</span>';
  const ok = good === 'down' ? v < 0 : v > 0;
  return `<span class="pt-num pt-strong" style="color:${ok ? 'var(--pt-high)' : 'var(--pt-low)'}">${v > 0 ? '+' : '−'}${unit === '€' ? formatEuro(Math.abs(v)) : Math.abs(v).toLocaleString('fr-FR')}</span>`;
};

/** Bloc « Ton suivi » pour La partie. */
export function renderSuiviCard(scoreDelta) {
  const b = _S._suiviBilan;
  const backup = `<div class="pt-row" style="gap:16px;flex-wrap:wrap">
      <button type="button" class="pt-link pt-small" onclick="window._suiviExport()">Sauvegarder l'historique (fichier)</button>
      <label class="pt-link pt-small" style="cursor:pointer">Restaurer une sauvegarde<input type="file" accept=".json" style="display:none" onchange="window._suiviImport(this)"></label>
    </div>`;
  if (!b) return '';
  if (b.first) {
    return `<section class="pt-card pt-col" style="gap:10px">
      <div class="pt-eyebrow">Ton suivi</div>
      <p class="pt-muted" style="margin:0">Le suivi démarre avec ces données. Au prochain chargement, tu verras ici ce qui a changé : MIN/MAX appliqués dans l'ERP, ruptures, valeur de stock. L'historique survit à « Purger le cache » ; garde aussi une sauvegarde en fichier.</p>
      ${backup}
    </section>`;
  }
  const tile = (label, val, hint) => `<div class="pt-col" style="gap:4px;padding:14px 16px;border-radius:14px;background:var(--s-card-alt);min-width:0">
      <span class="pt-eyebrow" style="font-size:11px">${label}</span><span style="font-size:22px;font-weight:600">${val}</span><span class="pt-small pt-muted">${hint}</span></div>`;
  return `<section class="pt-card pt-col" style="gap:14px">
    <div class="pt-row pt-between" style="gap:12px;flex-wrap:wrap;align-items:baseline">
      <div class="pt-col" style="gap:2px"><div class="pt-eyebrow">Ton suivi</div><h3 class="pt-h3">Depuis les données du ${_d(b.prevKey)}</h3></div>
      ${backup}
    </div>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:12px">
      ${tile('MIN/MAX appliqués dans l’ERP', `<span class="pt-num">${b.applied.toLocaleString('fr-FR')}</span><span class="pt-small pt-muted"> / ${b.aAppliquer.toLocaleString('fr-FR')}</span>`, `${b.cur.ecarts.toLocaleString('fr-FR')} écarts ERP ≠ PRISME restants${b.libere > 0 ? ` · ${formatEuro(b.libere)} de MAX libérés` : ''}`)}
      ${tile('Ruptures articles fréquents', `<span class="pt-num">${b.cur.rupt.toLocaleString('fr-FR')}</span> ${_delta(b.cur.rupt - b.prev.rupt)}`, `${b.prev.rupt.toLocaleString('fr-FR')} au chargement précédent`)}
      ${tile('Valeur de stock', `<span class="pt-num">${formatEuro(b.cur.valeur)}</span>`, `${_delta(Math.round(b.cur.valeur - b.prev.valeur), '€')} vs ${formatEuro(b.prev.valeur)}`)}
      ${tile('Score agence', `<span class="pt-num">${scoreDelta == null ? '—' : (scoreDelta > 0 ? '+' : '') + scoreDelta}</span>`, 'points depuis le chargement précédent')}
    </div>
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
