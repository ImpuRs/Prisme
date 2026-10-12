// © 2026 Jawad El Barkaoui — Tous droits réservés
// PRISME — export-erp.js
// Pilotage Stock › Arbitrage › « Mettre à jour les MIN/MAX dans l'ERP » :
// liste des articles dont le MIN/MAX PRISME (taux de service, option B) diffère de l'ERP,
// filtrable, et export CSV au format d'import ERP : ref ; emplacement ; min ; max.
// L'application est ensuite mesurée automatiquement par « Ton suivi » (La partie) au chargement suivant.
// ═══════════════════════════════════════════════════════════════
'use strict';

import { _S } from './state.js';
import { formatEuro, escapeHtml } from './utils.js';

const OPT = { sens: 'tout', zeros: false, implant: false, chers: false, sep: ';' };
const PRIX_CHER = 150; // €/pièce : mettre en stock une pièce chère jusque-là à 0/0 se décide au cas par cas

/** Articles à modifier dans l'ERP. type : hausse (MAX monte), baisse (MAX baisse), zero (passe à 0/0). */
export function computeErpChanges() {
  const out = [];
  for (const r of _S.finalData || []) {
    if (!/^\d{6}$/.test(r.code) || r.isParent || r.isNouveaute) continue;
    const eMin = r.ancienMin || 0, eMax = r.ancienMax || 0, nMin = r.nouveauMin || 0, nMax = r.nouveauMax || 0;
    if (eMin === nMin && eMax === nMax) continue;
    const pu = r.prixUnitaire || 0;
    const type = (nMin === 0 && nMax === 0) ? 'zero' : nMax > eMax ? 'hausse' : nMax < eMax ? 'baisse' : (nMin > eMin ? 'hausse' : 'baisse');
    const implant = !!r._vitesseReseau && !r._venteUnique;           // jamais vendu ici : pari réseau (Plan › Implanter)
    const cher = eMax === 0 && nMax > 0 && pu > PRIX_CHER;             // pièce chère mise en stock
    out.push({ code: r.code, lib: r.libelle || '', empl: r.emplacement || '', type, implant, cher, eMin, eMax, nMin, nMax, pu,
      deltaEur: (nMax - eMax) * pu, stock: r.stockActuel || 0, w: r.W || 0, fmr: r.fmrClass || '' });
  }
  // Enjeu : valeur de MAX en jeu, en valeur absolue
  out.sort((a, b) => Math.abs(b.deltaEur) - Math.abs(a.deltaEur));
  return out;
}

function _filtered(all) {
  return all.filter(x => (OPT.zeros || x.type !== 'zero') && (OPT.implant || !x.implant) && (OPT.chers || !x.cher)
    && (OPT.sens === 'tout' || x.type === OPT.sens || (OPT.sens === 'baisse' && x.type === 'zero')));
}

export function renderErpExport() {
  const el = document.getElementById('arErpExport');
  if (!el) return;
  const all = computeErpChanges();
  if (!all.length) { el.innerHTML = ''; return; }
  const n = (t) => all.filter(x => x.type === t);
  const hausses = n('hausse'), baisses = n('baisse'), zeros = n('zero');
  const sum = (l) => l.reduce((s, x) => s + x.deltaEur, 0);
  const list = _filtered(all);
  const chip = (k, label, cnt) => `<button type="button" class="ar-chip${OPT.sens === k ? ' ar-chip-on' : ''}" onclick="window._erpSens('${k}')">${label} <span class="pt-num">${cnt.toLocaleString('fr-FR')}</span></button>`;
  const tag = { hausse: '<span class="ar-tag" data-tone="mid">MAX ↑</span>', baisse: '<span class="ar-tag" data-tone="high">MAX ↓</span>', zero: '<span class="ar-tag" data-tone="low">0/0</span>' };
  const rows = list.slice(0, 40).map(x => `<tr class="ar-click" onclick="window.openArticlePanel?.('${x.code}','arbitrage')">
      <td><div class="pt-col" style="gap:2px"><span class="pt-strong">${escapeHtml(x.lib)}</span><span class="pt-small pt-muted pt-num">${x.code}${x.empl ? ' · ' + escapeHtml(x.empl) : ''}</span></div></td>
      <td>${tag[x.type]}</td>
      <td class="pt-num ar-r">${x.eMin}/${x.eMax}</td>
      <td class="pt-num ar-r pt-strong">${x.nMin}/${x.nMax}</td>
      <td class="pt-num ar-r">${x.stock}</td>
      <td class="pt-num ar-r" style="color:${x.deltaEur <= 0 ? 'var(--pt-high)' : 'var(--pt-mid)'}">${x.deltaEur <= 0 ? '−' : '+'}${formatEuro(Math.abs(x.deltaEur))}</td>
    </tr>`).join('');
  const tile = (label, val, hint) => `<div class="pt-col" style="gap:4px;padding:14px 16px;border-radius:14px;background:var(--s-card-alt);min-width:0">
      <span class="pt-eyebrow" style="font-size:12px">${label}</span><span class="pt-num" style="font-size:22px;font-weight:600">${val}</span><span class="pt-small pt-muted">${hint}</span></div>`;
  el.innerHTML = `<section class="pt-card pt-col" style="gap:16px">
    <div class="pt-row pt-between" style="gap:12px;flex-wrap:wrap;align-items:flex-start">
      <div class="pt-col" style="gap:4px;flex:1;min-width:280px">
        <span class="pt-eyebrow">Mettre à jour l'ERP</span>
        <h3 class="pt-h2">${all.length.toLocaleString('fr-FR')} MIN/MAX à changer</h3>
        <span class="pt-muted">Le calcul PRISME (taux de service) diffère de l'ERP sur ces articles. Exporte le fichier et importe-le dans l'ERP ; au chargement suivant, « Ton suivi » mesure ce qui a été appliqué.</span>
      </div>
      <button type="button" class="pt-btn" onclick="window._erpExport()" ${list.length ? '' : 'disabled'}>Exporter pour l'ERP (${list.length.toLocaleString('fr-FR')} lignes)</button>
    </div>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:12px">
      ${tile('MAX à baisser', baisses.length.toLocaleString('fr-FR'), `${formatEuro(Math.abs(sum(baisses)))} de MAX libérés`)}
      ${tile('MAX à monter', hausses.length.toLocaleString('fr-FR'), `${formatEuro(sum(hausses))} de MAX en plus (ruptures évitées)`)}
      ${tile('Passent à 0/0', zeros.length.toLocaleString('fr-FR'), 'plus de réappro (invendus, fins de série…)')}
    </div>
    <div class="pt-row" style="gap:8px;flex-wrap:wrap;align-items:center">
      ${chip('tout', 'Tout', all.filter(x => (OPT.zeros || x.type !== 'zero') && (OPT.implant || !x.implant) && (OPT.chers || !x.cher)).length)}${chip('baisse', 'Baisses', baisses.length + (OPT.zeros ? zeros.length : 0))}${chip('hausse', 'Hausses', hausses.filter(x => (OPT.implant || !x.implant) && (OPT.chers || !x.cher)).length)}
      <label class="pt-row pt-small" style="gap:6px;margin-left:8px;cursor:pointer"><input type="checkbox" ${OPT.zeros ? 'checked' : ''} onchange="window._erpZeros(this.checked)"> passages à 0/0 (${zeros.length})</label>
      <label class="pt-row pt-small" style="gap:6px;cursor:pointer" title="Articles jamais vendus ici, dimensionnés sur le rythme du réseau : un pari d'implantation, à décider dans Plan › Implanter"><input type="checkbox" ${OPT.implant ? 'checked' : ''} onchange="window._erpOpt('implant', this.checked)"> implantations jamais vendues ici (${all.filter(x => x.implant).length})</label>
      <label class="pt-row pt-small" style="gap:6px;cursor:pointer" title="Pièces à plus de ${PRIX_CHER} € jusqu'ici à 0/0 dans l'ERP : à garder en commande client ou à stocker, au cas par cas"><input type="checkbox" ${OPT.chers ? 'checked' : ''} onchange="window._erpOpt('chers', this.checked)"> nouvelles pièces &gt; ${PRIX_CHER} € (${all.filter(x => x.cher).length})</label>
      <label class="pt-row pt-small" style="gap:6px;margin-left:auto">Séparateur
        <select class="pf-select" style="min-height:32px" onchange="window._erpSep(this.value)"><option value=";"${OPT.sep === ';' ? ' selected' : ''}>point-virgule ;</option><option value=","${OPT.sep === ',' ? ' selected' : ''}>virgule ,</option></select></label>
    </div>
    ${list.length ? `<div class="pt-list" style="margin-top:0"><div class="pt-scroll"><table class="pt-table">
      <thead><tr><th>Article</th><th>Changement</th><th class="ar-r">ERP</th><th class="ar-r">PRISME</th><th class="ar-r">Stock</th><th class="ar-r">MAX × PU</th></tr></thead>
      <tbody>${rows}</tbody></table></div></div>
      <span class="pt-small pt-muted">${list.length > 40 ? `40 premiers sur ${list.length.toLocaleString('fr-FR')}, triés par valeur de MAX en jeu ; tout est dans l'export.` : ''} Fichier : ref${OPT.sep}emplacement${OPT.sep}min${OPT.sep}max.</span>`
    : '<p class="pt-small pt-muted" style="margin:0">Rien pour ce filtre.</p>'}
  </section>`;
}

window._erpSens = (k) => { OPT.sens = k; renderErpExport(); };
window._erpZeros = (v) => { OPT.zeros = !!v; renderErpExport(); };
window._erpOpt = (k, v) => { OPT[k] = !!v; renderErpExport(); };
window._erpSep = (v) => { OPT.sep = v === ',' ? ',' : ';'; renderErpExport(); };
window._erpExport = () => {
  const list = _filtered(computeErpChanges());
  if (!list.length) return;
  const sep = OPT.sep;
  const q = (v) => { const s = String(v ?? ''); return s.includes(sep) || s.includes('"') ? `"${s.replace(/"/g, '""')}"` : s; };
  const lines = [['ref', 'emplacement', 'min', 'max'].join(sep), ...list.map(x => [x.code, q(x.empl), x.nMin, x.nMax].join(sep))];
  const blob = new Blob([lines.join('\r\n') + '\r\n'], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob); const a = document.createElement('a');
  a.href = url; a.download = `PRISME_minmax_ERP_${_S.selectedMyStore || ''}_${new Date().toISOString().slice(0, 10)}.csv`; a.click(); URL.revokeObjectURL(url);
};
