// © 2026 Jawad El Barkaoui — Tous droits réservés
// PRISME — article-360.js
// Fiche article 360 (overlay #articlePanel) pour un article de l'agence. Une seule page qui défile :
//   verdict en une phrase + 4 chiffres · ventes 24 mois (vs N-1) · stock (jauge ERP / PRISME, « pourquoi ce mini/maxi »)
//   · ventes perdues (seulement en rupture, calcul affiché) · clients · autres agences · souvent acheté avec · détail technique.
// Ventes perdues = ventes par jour EN STOCK (12 mois, jours de rupture exclus) × jours de rupture × saison,
// valorisées au prix de vente moyen puis à la marge. Rupture datée par la dernière sortie du fichier stock
// (si aucune entrée depuis) ; sinon « durée inconnue ».
// Les articles hors agence gardent le « kit d'implantation » de diagnostic.js.
// ═══════════════════════════════════════════════════════════════
'use strict';

import { _S } from './state.js';
import { formatEuro, escapeHtml } from './utils.js';
import { computePriceGap, isInvendu, isSurStock, excedentSurStock, rowVerdictLabel, isClientAgence, computeSquelette } from './engine.js';
import { explainMinMax } from './minmax.js';
import { _computeSmartCoAchats } from './diagnostic.js';
import { downloadErpFile } from './export-erp.js';

const DAY = 86400000;
const MOIS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
const n0 = (v) => Math.round(v || 0).toLocaleString('fr-FR');
const n1 = (v) => (Math.round((v || 0) * 10) / 10).toLocaleString('fr-FR');
const n2 = (v) => (Math.round((v || 0) * 100) / 100).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pct = (a, b) => (b > 0 && a >= 0) ? Math.round((a / b - 1) * 100) : null;
const sgn = (v) => v == null ? '' : `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v)} %`;
const dfr = (t) => t ? new Date(t).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

/** Date de référence : date du fichier stock si connue, sinon fin des ventes. */
function _refTs() {
  return _S._stockFileTs || +(_S.consommePeriodMaxFull || _S.consommePeriodMax || Date.now());
}

/** Ventes mensuelles de l'agence pour un article (tous canaux) : monthIdx → { ca, qte, bl }. */
function _monthly(code) {
  const out = {};
  const me = _S._byMonthStoreArtCanal?.[_S.selectedMyStore] || {};
  for (const canal in me) {
    const months = me[canal]?.[code];
    if (!months) continue;
    for (const m in months) {
      const d = months[m], e = out[m] || (out[m] = { ca: 0, qte: 0, bl: 0 });
      e.ca += d.sumCA || 0; e.qte += d.sumQteP || 0; e.bl += d.countBL || 0;
    }
  }
  return out;
}

/** Tout ce que la fiche affiche, calculé une fois. */
function _compute(r) {
  const code = r.code, me = _S.selectedMyStore;
  const refTs = _refTs();
  const dMax = new Date(_S.consommePeriodMaxFull || _S.consommePeriodMax || refTs);
  const lastM = dMax.getFullYear() * 12 + dMax.getMonth();
  const mon = _monthly(code);
  const series = [];
  for (let m = lastM - 23; m <= lastM; m++) series.push({ m, ...(mon[m] || { ca: 0, qte: 0, bl: 0 }) });
  const cur = series.slice(12), prev = series.slice(0, 12);
  const sum = (a, k) => a.reduce((t, x) => t + x[k], 0);
  // Comparaison N-1 seulement si les 12 mois d'avant sont entièrement dans les données (1er mois complet)
  const d0 = _S.consommePeriodMinFull || _S.consommePeriodMin;
  const firstFull = d0 ? new Date(d0).getFullYear() * 12 + new Date(d0).getMonth() + (new Date(d0).getDate() > 1 ? 1 : 0) : Infinity;
  const hasPrev = firstFull <= lastM - 23;
  const v = _S.ventesParAgence?.[me]?.[code] || {};
  const qteTot = (v.sumPrelevee || 0) + (v.sumEnleve || 0);
  const prixVente = qteTot > 0 ? v.sumCA / qteTot : null;
  const tauxMarge = v.sumCA > 0 ? (v.sumVMB || 0) / v.sumCA : null;

  // Clients
  const clis = [..._S.articleClientsFull?.get(code) || []].map(cc => {
    const ca = (_S.ventesLocalMag12MG?.get(cc)?.get(code)?.sumCA || 0) + (_S.ventesLocalHorsMagFull?.get(cc)?.get(code)?.sumCA || 0);
    const info = _S.chalandiseData?.get(cc);
    return { cc, ca, nom: info?.nom || _S.clientNomLookup?.[cc] || cc, metier: info?.metier || '', actif: isClientAgence(cc), last: _S.clientLastOrderAll?.get(cc) || _S.clientLastOrder?.get(cc) || null };
  }).sort((a, b) => b.ca - a.ca);
  const metiers = new Map();
  for (const c of clis) { const k = c.metier || 'Sans métier'; metiers.set(k, (metiers.get(k) || 0) + c.ca); }

  // Réseau
  const reseau = Object.entries(_S.ventesParAgence || {}).map(([s, arts]) => {
    const d = arts?.[code], st = _S.stockParMagasin?.[s]?.[code];
    return { s, ca: d?.sumCA || 0, bl: d?.countBL || 0, stock: st?.stockActuel, min: st?.qteMin, max: st?.qteMax, me: s === me };
  }).filter(x => x.ca > 0 || x.stock != null).sort((a, b) => b.ca - a.ca);
  const others = reseau.filter(x => !x.me && x.ca > 0).map(x => x.ca).sort((a, b) => a - b);
  const medCA = others.length ? others[others.length >> 1] : null;
  const rang = reseau.findIndex(x => x.me) + 1;

  // Rupture et ventes perdues
  let rupture = null;
  if ((r.stockActuel || 0) <= 0 && (r.W || 0) > 0 && !r.isParent) {
    const start = r.dateSortie && (!r.dateEntree || r.dateEntree <= r.dateSortie) ? r.dateSortie : null;
    const jours = start ? Math.max(0, Math.round((refTs - start) / DAY)) : null;
    // Ventes des 12 derniers mois (prélevé, BL dédupliqués) sur les jours où l'article était en stock
    const d1 = Math.floor(refTs / DAY), d0 = d1 - 364;
    const ev = (_S.articleDemand || {})[code] || [];
    let qte = 0, nbl = 0;
    for (let i = 0; i < ev.length; i += 2) if (ev[i] >= d0 && ev[i] <= d1) { qte += ev[i + 1]; nbl++; }
    const joursRupFen = jours == null ? 0 : Math.min(jours, 365);
    const joursStock = Math.max(30, 365 - joursRupFen);
    const parJour = qte / joursStock;
    const saison = _S.seasonalIndex?.[r.famille]?.[new Date(refTs).getMonth()] || 1;
    const coefSaison = Math.abs(saison - 1) >= 0.15 ? saison : 1;
    const piecesPerdues = jours == null ? null : parJour * jours * coefSaison;
    rupture = { start, jours, qte, nbl, joursStock, parJour, coefSaison, piecesPerdues,
      blPerdus: jours == null ? null : nbl / joursStock * jours * coefSaison,
      rare: nbl < 12,
      ca: piecesPerdues != null && prixVente ? piecesPerdues * prixVente : null,
      marge: piecesPerdues != null && prixVente && tauxMarge != null ? piecesPerdues * prixVente * tauxMarge : null };
  }

  // Co-achats (même calcul que l'ancienne fiche)
  let co = { items: [], totalBL: 0 };
  try {
    const sq = _S._prSqData || computeSquelette();
    const sqM = new Map();
    if (sq?.directions) for (const dir of sq.directions) for (const cat of ['socle', 'implanter', 'challenger', 'surveiller']) for (const a of dir[cat] || []) sqM.set(a.code, a.classification || cat);
    co = _computeSmartCoAchats(code, sqM);
  } catch (e) { /* co-achats indisponibles */ }

  return { r, refTs, lastM, series, cur, prev, hasPrev, ca12: sum(cur, 'ca'), ca12p: sum(prev, 'ca'), qte12: sum(cur, 'qte'), bl12: sum(cur, 'bl'),
    prixVente, tauxMarge, clis, metiers, reseau, medCA, rang, rupture, co,
    gap: computePriceGap(code), mm: explainMinMax(r), lastSale: (() => { const ev = (_S.articleDemand || {})[code] || []; let d = 0; for (let i = 0; i < ev.length; i += 2) if (ev[i] > d) d = ev[i]; return d ? d * DAY : null; })() };
}

/** Le verdict en une phrase, + l'écart PRISME / ERP s'il existe. */
function _verdict(D) {
  const v = _verdict0(D), r = D.r;
  if (/^\d{6}$/.test(r.code) && !r.isParent && (r.ancienMin !== r.nouveauMin || r.ancienMax !== r.nouveauMax))
    v.txt += ` PRISME propose ${r.nouveauMin || 0} / ${r.nouveauMax || 0} au lieu de ${r.ancienMin || 0} / ${r.ancienMax || 0} dans l’ERP.`;
  return v;
}
function _verdict0(D) {
  const r = D.r, st = r.stockActuel || 0;
  const parMois = D.qte12 / 12;
  if (st < 0) return { tone: 'low', tag: 'Stock négatif', txt: `Stock ERP à ${n0(st)} : recompter le rayon.` };
  if (st <= 0 && (r.W || 0) > 0) return { tone: 'low', tag: 'Rupture', txt: `En rupture${D.rupture?.jours != null ? ` depuis ${D.rupture.jours} jour${D.rupture.jours > 1 ? 's' : ''}` : ''}. Il se vend ~${n1(parMois)} pièce${parMois >= 2 ? 's' : ''} par mois.` };
  if (isInvendu(r)) return { tone: 'mid', tag: 'Jamais vendu', txt: `${n0(st)} en stock, aucune vente en 12 mois.` };
  if (r._mmRule === 'rayon_sans_vente') return { tone: 'mid', tag: 'Pas vendu au comptoir', txt: `${n0(st)} en stock, aucune pièce vendue au comptoir en 12 mois${(r.W || 0) > 0 ? ' (seulement en colis)' : ''}.` };
  if ((r.ancienMin || 0) > 0 && st < r.ancienMin) return { tone: 'mid', tag: 'Sous le mini', txt: `${n0(st)} en stock pour un mini ERP de ${n0(r.ancienMin)}.` };
  if (isSurStock(r)) return { tone: 'mid', tag: 'Sur-stock', txt: `${n0(st)} en stock pour un maxi PRISME de ${n0(r.nouveauMax)} : ${n0(excedentSurStock(r))} de trop${D.qte12 > 0 ? `, ~${n0(st / (D.qte12 / 365))} jours de ventes` : ''}.` };
  return { tone: 'high', tag: 'OK', txt: D.qte12 > 0 ? `Le stock suit les ventes : ${n0(st)} en stock, ~${n0(st / Math.max(D.qte12 / 365, 0.01))} jours de ventes.` : `${n0(st)} en stock.` };
}

// ── Rendu ──────────────────────────────────────────────────────
const _sec = (id, title, sub, body) => `<section class="a360-sec" id="a360-${id}"><header class="a360-h"><h3>${title}</h3>${sub ? `<span class="pt-small pt-muted">${sub}</span>` : ''}</header>${body}</section>`;

function _chart(D) {
  const W = 640, H = 150, pad = 4, n = 12, bw = (W - pad * 2) / n;
  const max = Math.max(1, ...D.series.map(x => x.ca));
  const y = (v) => H - 18 - (v / max) * (H - 30);
  const bars = D.cur.map((x, i) => {
    const p = D.prev[i];
    const x0 = pad + i * bw;
    const rup = D.rupture?.start && (x.m >= (new Date(D.rupture.start).getFullYear() * 12 + new Date(D.rupture.start).getMonth()));
    return `<g><title>${MOIS[x.m % 12]} ${Math.floor(x.m / 12)} : ${formatEuro(x.ca)} · ${n0(x.qte)} pcs${p ? ` (un an avant : ${formatEuro(p.ca)})` : ''}</title>
      ${rup ? `<rect x="${x0}" y="0" width="${bw}" height="${H - 18}" class="a360-rup"/>` : ''}
      ${p && p.ca > 0 ? `<rect x="${x0 + bw * 0.18}" y="${y(p.ca)}" width="${bw * 0.64}" height="${H - 18 - y(p.ca)}" class="a360-prev"/>` : ''}
      <rect x="${x0 + bw * 0.26}" y="${y(x.ca)}" width="${bw * 0.48}" height="${Math.max(0, H - 18 - y(x.ca))}" rx="3" class="a360-bar"/>
      <text x="${x0 + bw / 2}" y="${H - 4}" text-anchor="middle" class="a360-ax">${MOIS[x.m % 12].slice(0, 3)}</text></g>`;
  }).join('');
  return `<svg viewBox="0 0 ${W} ${H}" class="a360-chart" role="img" aria-label="Ventes des 12 derniers mois comparées à l'année précédente">${bars}</svg>
    <div class="a360-legend"><span><i class="a360-k a360-k-cur"></i>12 derniers mois</span>${D.hasPrev ? '<span><i class="a360-k a360-k-prev"></i>même mois, un an avant</span>' : ''}${D.rupture?.start ? '<span><i class="a360-k a360-k-rup"></i>en rupture</span>' : ''}</div>`;
}

function _gauge(r) {
  const st = Math.max(0, r.stockActuel || 0);
  const eMin = r.ancienMin || 0, eMax = r.ancienMax || 0, pMin = r.nouveauMin || 0, pMax = r.nouveauMax || 0;
  const top = Math.max(1, st, eMax, pMax, eMin, pMin) * 1.15;
  const x = (v) => `${Math.min(100, v / top * 100).toFixed(2)}%`;
  const tone = (r.stockActuel || 0) <= 0 ? 'low' : (eMin && st < eMin) || isSurStock(r) ? 'mid' : 'high';
  return `<div class="a360-gauge" role="img" aria-label="Stock ${st}, mini/maxi ERP ${eMin}/${eMax}, PRISME ${pMin}/${pMax}">
      <div class="a360-band" style="left:${x(pMin)};width:calc(${x(pMax)} - ${x(pMin)})" title="Plage PRISME ${pMin}–${pMax}"></div>
      <div class="a360-fill" data-tone="${tone}" style="width:${x(st)}"></div>
      <span class="a360-mk a360-mk-erp" style="left:${x(eMin)}" title="Mini ERP ${eMin}"></span><span class="a360-mk a360-mk-erp" style="left:${x(eMax)}" title="Maxi ERP ${eMax}"></span>
      <span class="a360-mk a360-mk-pr" style="left:${x(pMin)}" title="Mini PRISME ${pMin}"></span><span class="a360-mk a360-mk-pr" style="left:${x(pMax)}" title="Maxi PRISME ${pMax}"></span>
    </div>
    <div class="a360-gl"><span><i class="a360-k a360-k-erp"></i>ERP <b class="pt-num">${eMin} / ${eMax}</b></span><span><i class="a360-k a360-k-pr"></i>PRISME <b class="pt-num">${pMin} / ${pMax}</b></span>${r.medMinReseau != null ? `<span class="pt-muted">autres agences (médiane) <b class="pt-num">${r.medMinReseau} / ${r.medMaxReseau ?? '—'}</b></span>` : ''}</div>`;
}

function _pourquoi(D) {
  const r = D.r, m = D.mm;
  const lines = [];
  if (m.rule === 'nouveaute') lines.push('Nouveauté (moins de 35 jours) : PRISME garde le mini/maxi de l’ERP le temps qu’elle fasse ses preuves.');
  else if (m.rule === 'statut') lines.push(`Statut « ${escapeHtml(r.statut || '')} » : plus de réappro, 0 / 0.`);
  else if (r._mmRule === 'vente_unique') lines.push('Vendu une seule fois au comptoir en 12 mois : 1 / 1.');
  else if (r._mmRule === 'rayon_sans_vente') lines.push(`Aucune pièce vendue au comptoir en 12 mois alors qu’il est en rayon : 0 / 0, à sortir.${(r.W || 0) > 0 ? ' Les ventes en colis partent de la centrale, pas de ton rayon.' : ''}`);
  else if (r._mmRule === 'absent_sans_demande') lines.push('Absent de ton rayon, aucune vente au comptoir, et pas de vraie demande (moins de 3 colis par an, réseau faible) : 0 / 0.');
  else if (r._mmRule === 'implant_colis') lines.push(`Absent de ton rayon mais tes clients le prennent en colis (${r._implantColis} fois en 12 mois) : implantation au rythme du réseau, au plus la médiane des autres agences.`);
  else if (r._mmRule === 'implant_reseau') lines.push('Absent de ton rayon, mais le réseau le vend vraiment (au moins 60 % des agences, 200 €/an chacune) : implantation au rythme du réseau, au plus la médiane des autres agences.');
  else if (m.rule === 'une_vente') lines.push(`Vendu ${m.nbVentes} fois en 12 mois : trop peu pour garder du stock, 0 / 0.`);
  else if (m.rule === 'deux_ventes') lines.push('Vendu 2 fois en 12 mois : règle 1 / 2.');
  else if (m.rule === 'calcul') {
    lines.push(`Il se vend <b>${n2(m.rate)}</b> pièce par jour en moyenne (${n0(m.tot)} pièces sur ${m.days} jours${m.intermittent ? ', ventes irrégulières : rythme corrigé de 5 %' : ''}).`);
    lines.push(`Pendant les <b>${m.lead} jours</b> de réappro : ${n2(m.besoinDelai)} pièce${m.besoinDelai >= 2 ? 's' : ''}, plus une marge de sécurité de ${n2(m.securite)} pour viser <b>${Math.round(m.service * 100)} %</b> de ventes servies → ${m.parRythme}.`);
    lines.push(`Une commande type fait <b>${m.qOrder}</b> pièce${m.qOrder > 1 ? 's' : ''} (au niveau de service visé). Le mini est le plus grand des deux : <b>${m.min}</b>.`);
    lines.push(`Maxi = mini + ${m.cycle} jours de ventes (${m.cycleQte}) = <b>${m.max}</b>.`);
    if (m.rabote) lines.push(`Une commande exceptionnelle de ${m.rabote} pièces a été rabotée pour ne pas gonfler le mini.`);
  } else lines.push('Pas assez d’historique de ventes jour par jour pour détailler le calcul.');
  if (m.rule === 'calcul' && (r.nouveauMin !== m.min || r.nouveauMax !== m.max)) lines.push(`Valeur finale <b>${r.nouveauMin} / ${r.nouveauMax}</b> après les règles d’assortiment (${escapeHtml(rowVerdictLabel(r) || 'ajustement')}).`);
  return `<details class="a360-why"><summary>Pourquoi ce mini / maxi ?</summary><ol>${lines.map(l => `<li>${l}</li>`).join('')}</ol></details>`;
}

function _perdues(D) {
  const R = D.rupture;
  if (!R) return '';
  if (R.jours == null) return _sec('perdues', 'Ventes perdues', 'en rupture', `<p class="pt-muted" style="margin:0">Durée de la rupture inconnue (pas de date de dernière sortie dans le fichier stock, ou une entrée depuis). Ventes habituelles : ~${n1(R.parJour * 30)} pièce${R.parJour * 30 >= 2 ? 's' : ''} par mois.</p>`);
  const res = R.rare
    ? `<div class="a360-big">≈ ${n1(R.blPerdus)} <span>vente${R.blPerdus >= 2 ? 's' : ''} manquée${R.blPerdus >= 2 ? 's' : ''}</span></div>`
    : `<div class="a360-big">≈ ${n0(R.piecesPerdues)} <span>pièces</span>${R.ca != null ? ` · ${formatEuro(R.ca)} <span>de ventes</span>` : ''}${R.marge != null ? ` · ${formatEuro(R.marge)} <span>de marge</span>` : ''}</div>`;
  return _sec('perdues', 'Ventes perdues', 'estimation, pendant la rupture en cours', `${res}
    <ol class="a360-calc">
      <li>En rupture depuis <b>${R.jours} jours</b> (dernière sortie le ${dfr(R.start)}, aucune entrée depuis).</li>
      <li>Quand il était en stock, il se vendait <b>${n2(R.parJour)}</b> pièce par jour (${n0(R.qte)} pièces en ${R.nbl} ventes sur ${R.joursStock} jours en stock).</li>
      ${R.coefSaison !== 1 ? `<li>Saison de la famille ce mois-ci : ×${n2(R.coefSaison)}.</li>` : ''}
      <li>${n2(R.parJour)} × ${R.jours} j${R.coefSaison !== 1 ? ` × ${n2(R.coefSaison)}` : ''} = <b>${n1(R.piecesPerdues)} pièces</b>${D.prixVente ? ` × ${n2(D.prixVente)} € (prix de vente moyen) = <b>${formatEuro(R.ca)}</b>` : ''}${R.marge != null ? ` × ${Math.round(D.tauxMarge * 100)} % de marge = <b>${formatEuro(R.marge)}</b>` : ''}.</li>
    </ol>
    <p class="pt-small pt-muted" style="margin:0">Ordre de grandeur : une partie des clients a pu prendre un article voisin ou l’acheter dans une autre agence du réseau.${R.rare ? ' Article vendu rarement : le résultat est donné en ventes manquées plutôt qu’en euros.' : ''}</p>`);
}

function _clients(D) {
  if (!D.clis.length) return _sec('clients', 'Qui l’achète ?', '', '<p class="pt-muted" style="margin:0">Aucun client identifié sur la période chargée.</p>');
  const actifs = D.clis.filter(c => c.actif).length;
  const rows = D.clis.slice(0, 8).map(c => `<tr class="ar-click" onclick="window.openClient360?.('${escapeHtml(c.cc)}','article')">
      <td><span class="pt-strong">${escapeHtml(c.nom)}</span><br><span class="pt-small pt-muted">${escapeHtml(c.metier || '—')}</span></td>
      <td class="pt-num ar-r">${formatEuro(c.ca)}</td>
      <td class="ar-r">${c.actif ? '<span class="ar-tag" data-tone="high">client cette année</span>' : '<span class="ar-tag" data-tone="mid">pas cette année</span>'}</td></tr>`).join('');
  const mt = [...D.metiers].sort((a, b) => b[1] - a[1]).slice(0, 6);
  const mMax = Math.max(1, ...mt.map(x => x[1]));
  const bars = mt.map(([k, v]) => `<div class="a360-hb"><span class="a360-hb-l">${escapeHtml(k)}</span><span class="a360-hb-t"><i style="width:${(v / mMax * 100).toFixed(1)}%"></i></span><span class="pt-num pt-small">${formatEuro(v)}</span></div>`).join('');
  return _sec('clients', 'Qui l’achète ?', `${n0(D.clis.length)} client${D.clis.length > 1 ? 's' : ''} sur la période chargée · ${n0(actifs)} venu${actifs > 1 ? 's' : ''} à l’agence cette année`,
    `<div class="a360-2c"><div class="pt-list"><div class="pt-scroll"><table class="pt-table"><thead><tr><th>Client</th><th class="ar-r">CA sur l’article</th><th class="ar-r"></th></tr></thead><tbody>${rows}</tbody></table></div></div>
      <div class="pt-col" style="gap:8px"><span class="pt-eyebrow">Par métier</span>${bars}</div></div>`);
}

function _reseau(D) {
  if (D.reseau.length < 2) return '';
  const max = Math.max(1, ...D.reseau.map(x => x.ca));
  const rows = D.reseau.slice(0, 12).map(x => `<div class="a360-hb${x.me ? ' a360-me' : ''}"><span class="a360-hb-l pt-num">${escapeHtml(x.s)}</span>
      <span class="a360-hb-t"><i style="width:${(x.ca / max * 100).toFixed(1)}%"></i>${D.medCA ? `<em style="left:${(D.medCA / max * 100).toFixed(1)}%" title="Médiane des autres agences"></em>` : ''}</span>
      <span class="pt-num pt-small a360-hb-v">${formatEuro(x.ca)} · stock ${x.stock ?? '—'} · ${x.min ?? '—'}/${x.max ?? '—'}</span></div>`).join('');
  const me = D.reseau.find(x => x.me);
  const phrase = me && D.medCA ? `Tu es ${D.rang}${D.rang === 1 ? 'er' : 'e'} sur ${D.reseau.filter(x => x.ca > 0).length} en CA sur cet article, ${me.ca >= D.medCA ? `au-dessus` : 'en dessous'} de la médiane des autres agences (${formatEuro(D.medCA)}).` : '';
  return _sec('reseau', 'Et dans les autres agences ?', phrase, `<div class="pt-col" style="gap:6px">${rows}</div><p class="pt-small pt-muted" style="margin:6px 0 0">CA sur la période chargée · stock et mini/maxi ERP de chaque agence · trait = médiane.</p>`);
}

function _coachats(D) {
  const it = D.co?.items || [];
  if (!it.length) return '';
  return _sec('avec', 'Souvent acheté avec', `${n0(D.co.totalBL)} BL de moins de 15 articles · 12 mois${D.co.totalBL < 10 ? ' · peu de BL : une piste, pas une règle' : ''}`,
    `<div class="a360-chips">${it.slice(0, 6).map(c => `<button type="button" class="a360-chip" onclick="window.openArticlePanel?.('${c.code}','co-achat')"><span class="pt-strong">${escapeHtml(c.lib)}</span><span class="pt-small pt-muted">${c.pct} % des BL · ${c.inStock ? 'en stock' : '<span style="color:var(--pt-low)">pas en stock</span>'}</span></button>`).join('')}</div>`);
}

function _html(D) {
  const r = D.r, V = _verdict(D);
  const evo = D.hasPrev ? pct(D.ca12, D.ca12p) : null;
  const tile = (k, v, s, tone) => `<div class="a360-tile"${tone ? ` data-tone="${tone}"` : ''}><span class="pt-eyebrow">${k}</span><span class="a360-tv pt-num">${v}</span><span class="pt-small pt-muted">${s}</span></div>`;
  const ecartErp = (r.ancienMin !== r.nouveauMin || r.ancienMax !== r.nouveauMax) && /^\d{6}$/.test(r.code) && !r.isParent;
  const gap = D.gap;
  return `<div class="a360">
    <header class="a360-top">
      <div class="pt-col" style="gap:4px;min-width:0">
        <span class="pt-small pt-muted pt-num">${escapeHtml(r.code)} · ${escapeHtml(r.emplacement || 'sans emplacement')} · ${escapeHtml(r.statut || '')}</span>
        <h2 class="a360-title">${escapeHtml(r.libelle || r.code)}</h2>
        <span class="pt-small pt-muted">${escapeHtml(_S.catalogueFamille?.get?.(r.code)?.libFam || r.famille || '')}${r.sousFamille ? ' › ' + escapeHtml(String(r.sousFamille).replace(/^[A-Z0-9]{1,4}\s*-\s*/, '')) : ''}${_S.catalogueMarques?.get?.(r.code) ? ' · ' + escapeHtml(_S.catalogueMarques.get(r.code)) : ''}</span>
      </div>
      <div class="a360-actions">
        <button type="button" class="pt-btn a360-b" onclick="navigator.clipboard?.writeText('${r.code}');window.showToast?.('Code copié','success',1500)">Copier le code</button>
        <a class="pt-btn a360-b" href="https://www.legallais.com/article/${r.code}" target="_blank" rel="noopener">legallais.com ↗</a>
        ${ecartErp ? `<button type="button" class="pt-btn a360-b" onclick="window._a360Erp('${r.code}')" title="Fichier d’import ERP pour cet article : ${r.nouveauMin}/${r.nouveauMax}">Fichier ERP ${r.nouveauMin}/${r.nouveauMax}</button>` : ''}
        <button type="button" class="pt-btn a360-b" onclick="closeArticlePanel()" aria-label="Fermer">✕</button>
      </div>
    </header>
    <div class="a360-verdict" data-tone="${V.tone}"><span class="ar-tag" data-tone="${V.tone === 'high' ? 'high' : V.tone === 'mid' ? 'mid' : 'low'}">${V.tag}</span><span>${V.txt}</span></div>
    <div class="a360-tiles">
      ${tile('Stock', `${n0(r.stockActuel)}`, `mini ERP ${r.ancienMin ?? 0} · PRISME ${r.nouveauMin ?? 0}`, V.tone)}
      ${tile('Ventes 12 mois', formatEuro(D.ca12), `${n0(D.qte12)} pcs · ${n0(D.bl12)} ventes${evo != null ? ` · ${sgn(evo)} vs un an avant` : ''}`)}
      ${tile('Marge', D.tauxMarge != null ? `${Math.round(D.tauxMarge * 100)} %` : '—', D.prixVente ? `prix de vente moyen ${n2(D.prixVente)} €${gap ? ` · ${gap.ecartPct > 0 ? '+' : ''}${gap.ecartPct} % vs le réseau` : ''}` : 'pas de vente')}
      ${tile('Clients', n0(D.clis.length), `${n0(D.clis.filter(c => c.actif).length)} venus cette année · dernière vente ${D.lastSale ? dfr(D.lastSale) : '—'}`)}
    </div>
    <nav class="a360-nav" aria-label="Sections">${[['ventes', 'Ventes'], ['stock', 'Stock'], ...(D.rupture ? [['perdues', 'Perdues']] : []), ['clients', 'Clients'], ...(D.reseau.length > 1 ? [['reseau', 'Réseau']] : []), ...(D.co?.items?.length ? [['avec', 'Avec']] : [])].map(([k, l]) => `<a href="#a360-${k}" onclick="event.preventDefault();document.getElementById('a360-${k}')?.scrollIntoView({behavior:'smooth',block:'start'})">${l}</a>`).join('')}</nav>
    <div class="a360-2c">
      ${_sec('ventes', 'Comment ça se vend ?', D.hasPrev && evo != null ? `${sgn(evo)} sur 12 mois vs l’année d’avant` : 'CA par mois, tous canaux', _chart(D))}
      ${_sec('stock', 'Mon stock est-il bon ?', D.qte12 > 0 && (r.stockActuel || 0) > 0 ? `${n0(r.stockActuel)} en stock = ~${n0(r.stockActuel / Math.max(D.qte12 / 365, 0.01))} jours de ventes` : '', _gauge(r) + _pourquoi(D))}
    </div>
    ${_perdues(D)}
    ${_clients(D)}
    ${_reseau(D)}
    ${_coachats(D)}
    <details class="a360-tech"><summary>Détail technique</summary>
      <div class="pt-small pt-muted">ABC ${r.abcClass || '—'} · FMR ${r.fmrClass || '—'} · ventes (BL) ${r.W ?? 0} · pièces prélevées ${r.V ?? 0} · enlevées ${r.enleveTotal ?? 0} · prix de valorisation ${n2(r.prixUnitaire)} € · assortiment ${escapeHtml(rowVerdictLabel(r) || '—')}${r._minMaxAvant ? ` · ancien calcul ${r._minMaxAvant.join('/')}` : ''} · dernière sortie ${dfr(r.dateSortie)} · dernière entrée ${dfr(r.dateEntree)}</div>
    </details>
  </div>`;
}

/** Ouvre la fiche 360 d'un article de l'agence (appelée par openArticlePanel). */
export function renderArticle360(r, source) {
  const overlay = document.getElementById('articlePanelOverlay');
  const panel = document.getElementById('articlePanel');
  if (!overlay || !panel || !r) return false;
  const trigger = document.activeElement;
  let D;
  try { D = _compute(r); } catch (e) { console.error('[PRISME] fiche article 360 :', e); return false; }
  panel.classList.add('a360-panel');
  panel.innerHTML = _html(D);
  panel.scrollTop = 0;
  overlay.classList.add('active');
  overlay._cleanupFocusTrap?.();
  overlay._cleanupFocusTrap = window.focusTrap?.(panel, trigger);
  return true;
}

window._a360Erp = (code) => {
  const r = (_S.finalData || []).find(x => x.code === code);
  if (r) downloadErpFile([{ code: r.code, empl: r.emplacement || '', nMin: r.nouveauMin || 0, nMax: r.nouveauMax || 0 }], code);
};
window._renderArticle360 = renderArticle360;
