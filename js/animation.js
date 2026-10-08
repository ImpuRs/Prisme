// © 2026 Jawad El Barkaoui — Tous droits réservés
// PRISME — animation.js
// Onglet Animation : préparation d'animations commerciales par marque
// ═══════════════════════════════════════════════════════════════
'use strict';

import { _S } from './state.js';
import { formatEuro, escapeHtml, famLib, _copyCodeBtn, defaultPeriodRange, readExcel, readExcelAsObjects, extractClientCode, parseCSVTextToHR } from './utils.js';
import { computeAnimation } from './engine.js';
import { getVentesHorsMagFullMap } from './sales.js';

// ═══════════════════════════════════════════════════════════════
// Data Fournisseur — fichier BL national chargé par l'utilisateur
// Même format que Le Terrain (Qlik) — croisé avec la base locale
// ═══════════════════════════════════════════════════════════════

let _brandFileData = null;   // { marque, lines[], crossResult }
let _brandFileMarque = '';   // marque active au moment du chargement

async function _parseBrandFile(file) {
  let hr;
  const isCSV = file.name.toLowerCase().endsWith('.csv');
  if (isCSV) {
    // CSV : lire en CP1252 (standard Legallais/Qlik), séparateur ;
    const text = await new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = e => res(e.target.result);
      r.onerror = () => rej(new Error('Lecture CSV impossible'));
      r.readAsText(file, 'windows-1252');
    });
    const sep = text.indexOf(';') >= 0 ? ';' : ',';
    hr = parseCSVTextToHR(text, sep);
  } else {
    hr = await readExcel(file);
  }
  const rows = readExcelAsObjects(hr);
  if (!rows.length) return null;

  // Détecter les colonnes (même format que Terrain / Livraisons)
  const h = Object.keys(rows[0]);
  const _col = (patterns) => h.find(k => patterns.some(p => k.toLowerCase().includes(p))) || '';
  const cArticle = _col(['article']);
  const cClient = _col(['code client']);
  const cNomClient = _col(['nom client']);
  const cCA = h.find(k => /^ca$/i.test(k.trim())) || _col(['montant ca', 'chiffre']);
  const cQte = _col(['quantit', 'qté']);
  const cSecteur = _col(['secteur']);
  const cDirection = _col(['direction']);
  const cDate = _col(["date d'exp", 'date exp', 'date']);

  if (!cArticle || !cClient) return null;

  const lines = [];
  for (const r of rows) {
    const artRaw = String(r[cArticle] || '');
    // Extraire code 6 chiffres du début (ex: "183712 - OUTIL A DENUDER")
    const m = artRaw.match(/(\d{6})/);
    if (!m) continue;
    const code = m[1];
    const libelle = artRaw.replace(/^\d+\s*-?\s*/, '').trim();
    const cc = extractClientCode(String(r[cClient] || ''));
    if (!cc) continue;

    // Parser CA (format français : "45.57 €" ou "45,57 €")
    let ca = 0;
    if (cCA) {
      const raw = String(r[cCA] || '').replace(/[€\s]/g, '');
      ca = parseFloat(raw.replace(',', '.')) || 0;
    }
    let qte = 0;
    if (cQte) qte = parseInt(String(r[cQte] || ''), 10) || 0;

    lines.push({
      code, libelle, cc,
      nom: String(r[cNomClient] || ''),
      ca, qte,
      secteur: String(r[cSecteur] || ''),
      direction: String(r[cDirection] || ''),
    });
  }
  return lines;
}

function _crossBrandData(lines, marque) {
  if (!lines?.length) return null;
  const myStore = _S.selectedMyStore;
  const stockMap = new Map((_S.finalData || []).map(r => [r.code, r]));
  const vpm = _S.ventesParAgence || {};
  const hasChal = _S.chalandiseReady && _S.chalandiseData?.size > 0;

  // 1. Agréger le fichier fournisseur par article
  const artAgg = new Map(); // code → {ca, qte, nbClients, clients: Set, nbBL, secteurs: Set, libelle}
  const clientAgg = new Map(); // cc → {nom, ca, nbArts, codes: Set}
  for (const l of lines) {
    if (!artAgg.has(l.code)) artAgg.set(l.code, { ca: 0, qte: 0, clients: new Set(), nbBL: 0, secteurs: new Set(), libelle: l.libelle });
    const a = artAgg.get(l.code);
    a.ca += l.ca; a.qte += l.qte; a.clients.add(l.cc); a.nbBL++;
    if (l.secteur) a.secteurs.add(l.secteur);

    if (!clientAgg.has(l.cc)) clientAgg.set(l.cc, { nom: l.nom, ca: 0, nbArts: 0, codes: new Set() });
    const c = clientAgg.get(l.cc);
    c.ca += l.ca;
    if (!c.codes.has(l.code)) { c.codes.add(l.code); c.nbArts++; }
  }

  // 2. Articles : classé par intérêt local
  const artResults = [];
  for (const [code, agg] of artAgg) {
    const fd = stockMap.get(code);
    const myVentes = vpm[myStore]?.[code];
    const caLocal = myVentes?.sumCA || 0;
    const enStock = fd ? (fd.stockActuel > 0) : false;
    const enRayon = !!fd;
    const catFam = _S.catalogueFamille?.get(code);
    const famLabel = catFam?.libFam || famLib(_S.articleFamille?.[code] || '') || '';

    const nbCli = agg.clients.size;
    const nbSect = agg.secteurs.size;
    const nbBL = agg.nbBL;
    const panierMoyen = nbCli > 0 ? agg.ca / nbCli : 0;
    const puFourn = agg.qte > 0 ? agg.ca / agg.qte : 0;
    // Pull % = clients uniques / nb BL × 100 — mesure la démocratisation
    const pullPct = nbBL > 0 ? Math.round(nbCli / nbBL * 100) : 0;

    artResults.push({
      code,
      libelle: fd ? (fd.libelle || agg.libelle) : agg.libelle,
      famLabel,
      caFournisseur: agg.ca,
      qteFournisseur: agg.qte,
      nbClientsFournisseur: nbCli,
      nbBL, nbSecteurs: nbSect, panierMoyen, puFourn,
      pullPct,
      caLocal,
      enStock,
      enRayon,
      statut: !enRayon ? 'absent' : !enStock ? 'rupture' : 'present',
    });
  }
  // Trier : absents d'abord (opportunités), puis par CA fournisseur décroissant
  const statutOrd = { absent: 0, rupture: 1, present: 2 };
  artResults.sort((a, b) => statutOrd[a.statut] - statutOrd[b.statut] || b.caFournisseur - a.caFournisseur);

  // 3. Clients zone : clients du fichier fournisseur présents dans ma chalandise
  const clientsZone = [];
  const clientsHorsZone = [];
  for (const [cc, cAgg] of clientAgg) {
    const chal = _S.chalandiseData?.get(cc);
    const entry = {
      cc, nom: cAgg.nom || chal?.nom || cc,
      caFournisseur: cAgg.ca,
      nbArtsFournisseur: cAgg.nbArts,
      metier: chal?.metier || '',
      commercial: chal?.commercial || '',
      cp: chal?.cp || '',
      inZone: !!chal,
      // Est-ce qu'il achète chez moi ?
      acheteChezMoi: !!(_S.ventesLocalMag12MG?.has(cc) || getVentesHorsMagFullMap().has(cc)),
    };
    if (chal) clientsZone.push(entry);
    else clientsHorsZone.push(entry);
  }
  clientsZone.sort((a, b) => b.caFournisseur - a.caFournisseur);

  // Séparer : ceux qui achètent chez moi vs ceux qui fuient
  const captables = clientsZone.filter(c => !c.acheteChezMoi);
  const fideles = clientsZone.filter(c => c.acheteChezMoi);

  // 4. Ciblage métier : métiers dominants dans le fichier fournisseur → mes clients de ce métier
  const metierCA = new Map();
  for (const c of clientsZone) {
    if (!c.metier) continue;
    metierCA.set(c.metier, (metierCA.get(c.metier) || 0) + c.caFournisseur);
  }
  const topMetiers = [...metierCA.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);

  const ciblageMetier = [];
  if (hasChal) {
    const clientsFournisseurSet = new Set(clientAgg.keys());
    for (const [metier, caMetier] of topMetiers) {
      const metierClients = _S.clientsByMetier?.get(metier);
      if (!metierClients) continue;
      const cibles = [];
      for (const cc of metierClients) {
        if (clientsFournisseurSet.has(cc)) continue; // déjà dans le fichier
        const chal = _S.chalandiseData.get(cc);
        if (!chal) continue;
        const caLeg = chal.ca2026 || 0;
        cibles.push({
          cc, nom: chal.nom || cc,
          metier, commercial: chal.commercial || '',
          cp: chal.cp || '', caLeg,
        });
      }
      cibles.sort((a, b) => b.caLeg - a.caLeg);
      if (cibles.length > 0) {
        ciblageMetier.push({ metier, caMetier, nbFournisseur: metierCA.get(metier) || 0, cibles: cibles.slice(0, 30), totalCibles: cibles.length });
      }
    }
  }

  const nbAbsents = artResults.filter(a => a.statut === 'absent').length;
  const nbRuptures = artResults.filter(a => a.statut === 'rupture').length;
  const totalCaFournisseur = artResults.reduce((s, a) => s + a.caFournisseur, 0);

  // 5. Produits comptoir : PU < 50€ + fréquence ≥ 4 BL + trié par Pull %
  const produitsComptoir = artResults
    .filter(a => a.puFourn > 0 && a.puFourn < 100 && a.nbBL >= 4)
    .sort((a, b) => b.pullPct - a.pullPct);

  return {
    nbArticles: artResults.length, nbAbsents, nbRuptures,
    totalCaFournisseur, nbLignes: lines.length,
    articles: artResults,
    produitsComptoir,
    captables, fideles, clientsHorsZone,
    ciblageMetier,
    totalClientsZone: clientsZone.length,
    totalCaptables: captables.length,
  };
}

function _renderBrandInsights(cross) {
  if (!cross) return '';
  let html = `<div class="s-card rounded-xl border overflow-hidden mb-4" style="border-color:#8b5cf6">
    <div class="px-4 py-3 border-b" style="background:linear-gradient(135deg,#ede9fe,#c4b5fd);border-color:#8b5cf6">
      <div class="flex items-center justify-between">
        <h4 class="font-extrabold text-sm" style="color:#5b21b6">📊 Data Fournisseur — ${cross.nbLignes} lignes analysées</h4>
        <button onclick="window._animClearBrandFile()" class="text-[10px] px-3 py-1.5 rounded-lg border cursor-pointer" style="border-color:#8b5cf6;color:#5b21b6">✕ Retirer</button>
      </div>
      <div class="flex flex-wrap gap-3 mt-2 text-[10px]" style="color:#5b21b6">
        <span class="font-bold">${cross.nbArticles} articles</span>
        <span>${cross.nbAbsents} absents de mon rayon</span>
        <span>${cross.nbRuptures} en rupture</span>
        <span class="font-bold">${formatEuro(cross.totalCaFournisseur)} CA fournisseur</span>
        <span>${cross.totalClientsZone} clients dans ma zone</span>
        <span class="font-bold" style="color:#dc2626">${cross.totalCaptables} à capter</span>
      </div>
    </div>`;

  // ── Panel 0 : Produits Comptoir (merchandising comportemental) ──
  if (cross.produitsComptoir?.length > 0) {
    const top = cross.produitsComptoir.slice(0, 20);
    html += `<details class="border-b b-light" open>
      <summary class="flex items-center justify-between px-4 py-2.5 cursor-pointer select-none hover:s-hover">
        <div class="flex items-center gap-2">
          <span class="acc-arrow t-disabled">▶</span>
          <span class="font-bold text-[12px]" style="color:#f59e0b">🏪 ${cross.produitsComptoir.length} Produits Comptoir — PU < 100€, Pull élevé</span>
        </div>
        <span class="text-[10px] t-disabled">Pull % = clients uniques ÷ fréquence</span>
      </summary>
      <div class="px-4 py-2">
        <p class="text-[9px] t-disabled mb-2">Filtre : PU < 100€ + ≥ 4 BL. Pull élevé = acheté par beaucoup de clients différents (comptoir). Pull bas = poussé par quelques gros clients (chantier). Ceux marqués "En stock" sont prêts pour la tête de gondole.</p>
      </div>
      <div class="overflow-x-auto">
        <table class="min-w-full">
          <thead class="s-panel-inner t-inverse text-[10px]">
            <tr><th class="py-1.5 px-2 text-left">Code</th><th class="py-1.5 px-2 text-left">Libellé</th><th class="py-1.5 px-2 text-left">Famille</th><th class="py-1.5 px-2 text-center">Pull %</th><th class="py-1.5 px-2 text-right">Clients</th><th class="py-1.5 px-2 text-right">BL</th><th class="py-1.5 px-2 text-right">PU moy.</th><th class="py-1.5 px-2 text-right">CA fourn.</th></tr>
          </thead>
          <tbody id="brandTbody_comptoir">${top.map(a => {
            const pullBg = a.pullPct >= 80 ? '#dcfce7' : a.pullPct >= 50 ? '#fef3c7' : '#f1f5f9';
            const pullColor = a.pullPct >= 80 ? '#166534' : a.pullPct >= 50 ? '#92400e' : '#475569';
            const stockTag = a.statut === 'present' ? ' <span class="text-[8px] px-1.5 py-0.5 rounded-full font-bold" style="background:#dcfce7;color:#166534">En stock</span>' : '';
            return `<tr class="border-b b-light hover:s-hover text-[11px] cursor-pointer" onclick="if(window.openArticlePanel)window.openArticlePanel('${a.code}','animation')">
              <td class="py-1.5 px-2 font-mono t-disabled">${a.code} <span class="opacity-50 hover:opacity-100">🔍</span></td>
              <td class="py-1.5 px-2 t-primary" style="max-width:250px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(a.libelle)}${stockTag}</td>
              <td class="py-1.5 px-2 text-[9px] t-secondary">${escapeHtml(a.famLabel)}</td>
              <td class="py-1.5 px-2 text-center"><span class="px-2 py-0.5 rounded-full text-[9px] font-bold" style="background:${pullBg};color:${pullColor}">${a.pullPct}%</span></td>
              <td class="py-1.5 px-2 text-right font-bold" style="color:#f59e0b">${a.nbClientsFournisseur}</td>
              <td class="py-1.5 px-2 text-right t-secondary">${a.nbBL}</td>
              <td class="py-1.5 px-2 text-right t-secondary">${formatEuro(a.puFourn)}</td>
              <td class="py-1.5 px-2 text-right font-bold" style="color:#8b5cf6">${formatEuro(a.caFournisseur)}</td>
            </tr>`;
          }).join('')}</tbody>
        </table>
        ${cross.produitsComptoir.length > 20 ? `<button id="brandMore_comptoir" onclick="window._brandShowMore('comptoir',20)" class="mt-1 mb-1 ml-2 text-[10px] font-bold c-action hover:underline cursor-pointer">▼ Voir plus (${cross.produitsComptoir.length - 20} restants)</button>` : ''}
      </div>
    </details>`;
  }

  // ── Panel 1 : Articles à implanter ──
  const absents = cross.articles.filter(a => a.statut === 'absent');
  if (absents.length > 0) {
    html += `<details class="border-b b-light" open>
      <summary class="flex items-center justify-between px-4 py-2.5 cursor-pointer select-none hover:s-hover">
        <div class="flex items-center gap-2">
          <span class="acc-arrow t-disabled">▶</span>
          <span class="font-bold text-[12px]" style="color:#dc2626">🕳️ ${absents.length} articles absents de mon rayon</span>
        </div>
        <span class="text-[10px] t-disabled">${formatEuro(absents.reduce((s, a) => s + a.caFournisseur, 0))} CA fournisseur</span>
      </summary>
      <div class="overflow-x-auto">
        <table class="min-w-full">
          <thead class="s-panel-inner t-inverse text-[10px]">
            <tr><th class="py-1.5 px-2 text-left">Code</th><th class="py-1.5 px-2 text-left">Libellé</th><th class="py-1.5 px-2 text-left">Famille</th><th class="py-1.5 px-2 text-right">CA fourn.</th><th class="py-1.5 px-2 text-right">Qté</th><th class="py-1.5 px-2 text-right">Clients fourn.</th></tr>
          </thead>
          <tbody id="brandTbody_absents">${absents.slice(0, 30).map(a => `<tr class="border-b b-light hover:s-hover text-[11px]">
            <td class="py-1.5 px-2 font-mono">${_copyCodeBtn(a.code)}</td>
            <td class="py-1.5 px-2 max-w-[200px] truncate" title="${escapeHtml(a.libelle)}">${escapeHtml(a.libelle)}</td>
            <td class="py-1.5 px-2 text-[9px] t-secondary">${escapeHtml(a.famLabel)}</td>
            <td class="py-1.5 px-2 text-right font-bold" style="color:#8b5cf6">${formatEuro(a.caFournisseur)}</td>
            <td class="py-1.5 px-2 text-right t-secondary">${a.qteFournisseur}</td>
            <td class="py-1.5 px-2 text-right t-secondary">${a.nbClientsFournisseur}</td>
          </tr>`).join('')}</tbody>
        </table>
        ${absents.length > 30 ? `<button id="brandMore_absents" onclick="window._brandShowMore('absents',30)" class="mt-1 mb-1 ml-2 text-[10px] font-bold c-action hover:underline cursor-pointer">▼ Voir plus (${absents.length - 30} restants)</button>` : ''}
      </div>
    </details>`;
  }

  // ── Panel 2 : Clients captables (zone, achètent la marque ailleurs mais pas chez moi) ──
  if (cross.captables.length > 0) {
    html += `<details class="border-b b-light" open>
      <summary class="flex items-center justify-between px-4 py-2.5 cursor-pointer select-none hover:s-hover">
        <div class="flex items-center gap-2">
          <span class="acc-arrow t-disabled">▶</span>
          <span class="font-bold text-[12px]" style="color:#dc2626">🎯 ${cross.captables.length} clients zone — achètent ailleurs, pas chez moi</span>
        </div>
        <span class="text-[10px] t-disabled">${formatEuro(cross.captables.reduce((s, c) => s + c.caFournisseur, 0))} CA fuite</span>
      </summary>
      <div class="overflow-x-auto">
        <table class="min-w-full">
          <thead class="s-panel-inner t-inverse text-[10px]">
            <tr><th class="py-1.5 px-2 text-left">Client</th><th class="py-1.5 px-2">Métier</th><th class="py-1.5 px-2">CP</th><th class="py-1.5 px-2">Commercial</th><th class="py-1.5 px-2 text-right">CA fourn.</th><th class="py-1.5 px-2 text-right">Articles</th></tr>
          </thead>
          <tbody id="brandTbody_captables">${cross.captables.slice(0, 30).map(c => {
            const ccSafe = (c.cc || '').replace(/'/g, "\\'");
            return `<tr class="border-b b-light hover:s-hover text-[11px] cursor-pointer" onclick="if(window.openClient360)window.openClient360('${ccSafe}','animation')">
              <td class="py-1.5 px-2 font-bold max-w-[180px] truncate" title="${escapeHtml(c.nom)}">${escapeHtml(c.nom)} <span class="text-[9px] t-disabled font-mono">${escapeHtml(c.cc)}</span></td>
              <td class="py-1.5 px-2 text-[10px]">${escapeHtml(c.metier)}</td>
              <td class="py-1.5 px-2 text-[10px]">${escapeHtml(c.cp)}</td>
              <td class="py-1.5 px-2 text-[10px]">${escapeHtml(c.commercial)}</td>
              <td class="py-1.5 px-2 text-right font-bold" style="color:#dc2626">${formatEuro(c.caFournisseur)}</td>
              <td class="py-1.5 px-2 text-right t-secondary">${c.nbArtsFournisseur}</td>
            </tr>`;
          }).join('')}</tbody>
        </table>
        ${cross.captables.length > 30 ? `<button id="brandMore_captables" onclick="window._brandShowMore('captables',30)" class="mt-1 mb-1 ml-2 text-[10px] font-bold c-action hover:underline cursor-pointer">▼ Voir plus (${cross.captables.length - 30} restants)</button>` : ''}
      </div>
    </details>`;
  }

  // ── Panel 2b : Clients fidèles (achètent chez moi ET dans le fichier fournisseur) ──
  if (cross.fideles.length > 0) {
    html += `<details class="border-b b-light">
      <summary class="flex items-center justify-between px-4 py-2.5 cursor-pointer select-none hover:s-hover">
        <div class="flex items-center gap-2">
          <span class="acc-arrow t-disabled">▶</span>
          <span class="font-bold text-[12px]" style="color:#16a34a">✅ ${cross.fideles.length} clients zone — déjà actifs chez moi</span>
        </div>
      </summary>
      <div class="overflow-x-auto">
        <table class="min-w-full">
          <thead class="s-panel-inner t-inverse text-[10px]">
            <tr><th class="py-1.5 px-2 text-left">Client</th><th class="py-1.5 px-2">Métier</th><th class="py-1.5 px-2">Commercial</th><th class="py-1.5 px-2 text-right">CA fourn.</th><th class="py-1.5 px-2 text-right">Articles</th></tr>
          </thead>
          <tbody id="brandTbody_fideles">${cross.fideles.slice(0, 30).map(c => {
            const ccSafe = (c.cc || '').replace(/'/g, "\\'");
            return `<tr class="border-b b-light hover:s-hover text-[11px] cursor-pointer" onclick="if(window.openClient360)window.openClient360('${ccSafe}','animation')">
              <td class="py-1.5 px-2 font-bold max-w-[180px] truncate">${escapeHtml(c.nom)}</td>
              <td class="py-1.5 px-2 text-[10px]">${escapeHtml(c.metier)}</td>
              <td class="py-1.5 px-2 text-[10px]">${escapeHtml(c.commercial)}</td>
              <td class="py-1.5 px-2 text-right font-bold" style="color:#16a34a">${formatEuro(c.caFournisseur)}</td>
              <td class="py-1.5 px-2 text-right t-secondary">${c.nbArtsFournisseur}</td>
            </tr>`;
          }).join('')}</tbody>
        </table>
        ${cross.fideles.length > 30 ? `<button id="brandMore_fideles" onclick="window._brandShowMore('fideles',30)" class="mt-1 mb-1 ml-2 text-[10px] font-bold c-action hover:underline cursor-pointer">▼ Voir plus (${cross.fideles.length - 30} restants)</button>` : ''}
      </div>
    </details>`;
  }

  // ── Panel 3 : Ciblage métier ──
  if (cross.ciblageMetier.length > 0) {
    html += `<details class="border-b b-light">
      <summary class="flex items-center justify-between px-4 py-2.5 cursor-pointer select-none hover:s-hover">
        <div class="flex items-center gap-2">
          <span class="acc-arrow t-disabled">▶</span>
          <span class="font-bold text-[12px]" style="color:#2563eb">🔵 Ciblage par métier — ${cross.ciblageMetier.reduce((s, m) => s + m.totalCibles, 0)} prospects potentiels</span>
        </div>
      </summary>
      <div class="px-4 py-2">
        <p class="text-[10px] t-disabled mb-2">Métiers qui achètent le plus cette marque dans le fichier fournisseur. Les cibles sont vos clients du même métier qui ne sont PAS dans le fichier fournisseur.</p>`;

    for (let _ci = 0; _ci < cross.ciblageMetier.length; _ci++) {
      const m = cross.ciblageMetier[_ci];
      html += `<details class="border b-light rounded-lg mb-2">
        <summary class="px-3 py-2 cursor-pointer select-none hover:s-hover text-[11px]">
          <span class="acc-arrow t-disabled">▶</span>
          <span class="font-bold">${escapeHtml(m.metier)}</span>
          <span class="t-disabled ml-2">${m.totalCibles} cibles · ${formatEuro(m.caMetier)} CA fournisseur</span>
        </summary>
        <div class="overflow-x-auto">
          <table class="min-w-full text-[11px]">
            <thead class="text-[9px] t-disabled">
              <tr><th class="py-1 px-2 text-left">Client</th><th class="py-1 px-2">CP</th><th class="py-1 px-2">Commercial</th><th class="py-1 px-2 text-right">CA Leg.</th></tr>
            </thead>
            <tbody id="brandTbody_ciblage_${_ci}">${m.cibles.slice(0, 15).map(c => {
              const ccSafe = (c.cc || '').replace(/'/g, "\\'");
              return `<tr class="border-b b-light hover:s-hover cursor-pointer" onclick="if(window.openClient360)window.openClient360('${ccSafe}','animation')">
                <td class="py-1 px-2 font-bold">${escapeHtml(c.nom)}</td>
                <td class="py-1 px-2 text-[10px]">${escapeHtml(c.cp)}</td>
                <td class="py-1 px-2 text-[10px]">${escapeHtml(c.commercial)}</td>
                <td class="py-1 px-2 text-right font-bold c-action">${c.caLeg > 0 ? formatEuro(c.caLeg) : '—'}</td>
              </tr>`;
            }).join('')}</tbody>
          </table>
          ${m.cibles.length > 15 ? `<button id="brandMore_ciblage_${_ci}" onclick="window._brandShowMore('ciblage_${_ci}',15)" class="mt-1 mb-1 ml-2 text-[10px] font-bold c-action hover:underline cursor-pointer">▼ Voir plus (${m.cibles.length - 15} restants)</button>` : ''}
        </div>
      </details>`;
    }
    html += '</div></details>';
  }

  html += '</div>';
  return html;
}

window._animLoadBrandFile = async function() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.xlsx,.xls,.csv';
  input.onchange = async () => {
    if (!input.files?.[0]) return;
    const btn = document.getElementById('animBrandFileBtn');
    if (btn) { btn.textContent = 'Chargement…'; btn.disabled = true; }
    try {
      const lines = await _parseBrandFile(input.files[0]);
      if (!lines?.length) {
        if (btn) { btn.textContent = 'Fichier invalide'; setTimeout(() => { btn.textContent = '📊 Charger fichier fournisseur'; btn.disabled = false; }, 2000); }
        return;
      }
      const marque = _S._animationData?.marque || '';
      const cross = _crossBrandData(lines, marque);
      _brandFileData = { marque, lines, crossResult: cross };
      _brandFileMarque = marque;
      // Re-render l'animation avec les insights fournisseur
      const el = document.getElementById('animContent');
      if (el && _S._animationData) {
        el.innerHTML = _renderAnimation(_S._animationData);
        el.dataset.animActive = '1';
      }
    } catch (e) {
      console.error('[PRISME] Erreur parsing fichier fournisseur:', e);
      if (btn) { btn.textContent = 'Erreur parsing'; setTimeout(() => { btn.textContent = '📊 Charger fichier fournisseur'; btn.disabled = false; }, 2000); }
    }
  };
  input.click();
};

// Pagination Data Fournisseur — affiche N lignes de plus dans un tbody
window._brandShowMore = function(panelId, step) {
  if (!_brandFileData?.crossResult) return;
  const cross = _brandFileData.crossResult;
  const tbody = document.getElementById('brandTbody_' + panelId);
  const btn = document.getElementById('brandMore_' + panelId);
  if (!tbody || !btn) return;
  const current = tbody.children.length;
  let items, renderFn;
  if (panelId === 'comptoir') {
    items = cross.produitsComptoir;
    renderFn = a => {
      const pullBg = a.pullPct >= 80 ? '#dcfce7' : a.pullPct >= 50 ? '#fef3c7' : '#f1f5f9';
      const pullColor = a.pullPct >= 80 ? '#166534' : a.pullPct >= 50 ? '#92400e' : '#475569';
      const stockTag = a.statut === 'present' ? ' <span class="text-[8px] px-1.5 py-0.5 rounded-full font-bold" style="background:#dcfce7;color:#166534">En stock</span>' : '';
      return `<tr class="border-b b-light hover:s-hover text-[11px] cursor-pointer" onclick="if(window.openArticlePanel)window.openArticlePanel('${a.code}','animation')">
        <td class="py-1.5 px-2 font-mono t-disabled">${a.code} <span class="opacity-50 hover:opacity-100">🔍</span></td>
        <td class="py-1.5 px-2 t-primary" style="max-width:250px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(a.libelle)}${stockTag}</td>
        <td class="py-1.5 px-2 text-[9px] t-secondary">${escapeHtml(a.famLabel)}</td>
        <td class="py-1.5 px-2 text-center"><span class="px-2 py-0.5 rounded-full text-[9px] font-bold" style="background:${pullBg};color:${pullColor}">${a.pullPct}%</span></td>
        <td class="py-1.5 px-2 text-right font-bold" style="color:#f59e0b">${a.nbClientsFournisseur}</td>
        <td class="py-1.5 px-2 text-right t-secondary">${a.nbBL}</td>
        <td class="py-1.5 px-2 text-right t-secondary">${formatEuro(a.puFourn)}</td>
        <td class="py-1.5 px-2 text-right font-bold" style="color:#8b5cf6">${formatEuro(a.caFournisseur)}</td>
      </tr>`;
    };
  } else if (panelId === 'absents') {
    items = cross.articles.filter(a => a.statut === 'absent');
    renderFn = a => `<tr class="border-b b-light hover:s-hover text-[11px]">
      <td class="py-1.5 px-2 font-mono">${_copyCodeBtn(a.code)}</td>
      <td class="py-1.5 px-2 max-w-[200px] truncate" title="${escapeHtml(a.libelle)}">${escapeHtml(a.libelle)}</td>
      <td class="py-1.5 px-2 text-[9px] t-secondary">${escapeHtml(a.famLabel)}</td>
      <td class="py-1.5 px-2 text-right font-bold" style="color:#8b5cf6">${formatEuro(a.caFournisseur)}</td>
      <td class="py-1.5 px-2 text-right t-secondary">${a.qteFournisseur}</td>
      <td class="py-1.5 px-2 text-right t-secondary">${a.nbClientsFournisseur}</td>
    </tr>`;
  } else if (panelId === 'captables') {
    items = cross.captables;
    renderFn = c => { const ccSafe = (c.cc||'').replace(/'/g,"\\'"); return `<tr class="border-b b-light hover:s-hover text-[11px] cursor-pointer" onclick="if(window.openClient360)window.openClient360('${ccSafe}','animation')">
      <td class="py-1.5 px-2 font-bold max-w-[180px] truncate" title="${escapeHtml(c.nom)}">${escapeHtml(c.nom)} <span class="text-[9px] t-disabled font-mono">${escapeHtml(c.cc)}</span></td>
      <td class="py-1.5 px-2 text-[10px]">${escapeHtml(c.metier)}</td>
      <td class="py-1.5 px-2 text-[10px]">${escapeHtml(c.cp)}</td>
      <td class="py-1.5 px-2 text-[10px]">${escapeHtml(c.commercial)}</td>
      <td class="py-1.5 px-2 text-right font-bold" style="color:#dc2626">${formatEuro(c.caFournisseur)}</td>
      <td class="py-1.5 px-2 text-right t-secondary">${c.nbArtsFournisseur}</td>
    </tr>`; };
  } else if (panelId === 'fideles') {
    items = cross.fideles;
    renderFn = c => { const ccSafe = (c.cc||'').replace(/'/g,"\\'"); return `<tr class="border-b b-light hover:s-hover text-[11px] cursor-pointer" onclick="if(window.openClient360)window.openClient360('${ccSafe}','animation')">
      <td class="py-1.5 px-2 font-bold max-w-[180px] truncate">${escapeHtml(c.nom)}</td>
      <td class="py-1.5 px-2 text-[10px]">${escapeHtml(c.metier)}</td>
      <td class="py-1.5 px-2 text-[10px]">${escapeHtml(c.commercial)}</td>
      <td class="py-1.5 px-2 text-right font-bold" style="color:#16a34a">${formatEuro(c.caFournisseur)}</td>
      <td class="py-1.5 px-2 text-right t-secondary">${c.nbArtsFournisseur}</td>
    </tr>`; };
  } else if (panelId.startsWith('ciblage_')) {
    const ci = parseInt(panelId.split('_')[1], 10);
    const m = cross.ciblageMetier?.[ci];
    if (!m) return;
    items = m.cibles;
    renderFn = c => { const ccSafe = (c.cc||'').replace(/'/g,"\\'"); return `<tr class="border-b b-light hover:s-hover cursor-pointer" onclick="if(window.openClient360)window.openClient360('${ccSafe}','animation')">
      <td class="py-1 px-2 font-bold">${escapeHtml(c.nom)}</td>
      <td class="py-1 px-2 text-[10px]">${escapeHtml(c.cp)}</td>
      <td class="py-1 px-2 text-[10px]">${escapeHtml(c.commercial)}</td>
      <td class="py-1 px-2 text-right font-bold c-action">${c.caLeg > 0 ? formatEuro(c.caLeg) : '—'}</td>
    </tr>`; };
  } else return;
  const next = items.slice(current, current + step);
  tbody.insertAdjacentHTML('beforeend', next.map(renderFn).join(''));
  const remaining = items.length - current - next.length;
  if (remaining > 0) btn.textContent = `▼ Voir plus (${remaining} restants)`;
  else btn.remove();
};

window._animClearBrandFile = function() {
  _brandFileData = null;
  _brandFileMarque = '';
  const el = document.getElementById('animContent');
  if (el && _S._animationData) {
    el.innerHTML = _renderAnimation(_S._animationData);
    el.dataset.animActive = '1';
  }
};

// Aliases marques commerciales → fournisseur catalogue
const MARQUE_ALIASES = {
  'dewalt': 'STANLEY BLACK & DECKER FRANCE',
  'facom': 'STANLEY BLACK & DECKER FRANCE',
  'black+decker': 'STANLEY BLACK & DECKER FRANCE',
  'black decker': 'STANLEY BLACK & DECKER FRANCE',
  'milwaukee': 'TECHTRONIC INDUSTRIES FRANCE',
  'ryobi': 'TECHTRONIC INDUSTRIES FRANCE',
  'hikoki': 'KOKI HOLDINGS (EUROPE)',
  'metabo': 'KOKI HOLDINGS (EUROPE)',
};

// ═══════════════════════════════════════════════════════════════
// Chargement du catalogue marques (async, non bloquant)
// ═══════════════════════════════════════════════════════════════

export async function loadCatalogueMarques() {
  try {
    const resp = await fetch('js/catalogue-marques.json');
    if (!resp.ok) { console.warn('[PRISME] catalogue-marques.json non trouvé'); return; }
    const data = await resp.json();

    _S.catalogueMarques = new Map();
    _S.marqueArticles = new Map();
    _S.catalogueDesignation = new Map();
    _S.catalogueFamille = new Map();
    _S.catalogueStatut = new Map();
    _S.catalogueEAN = new Map(); // EAN → code article

    // Detect format: new indexed format has M/F/A keys
    if (data.M && data.F && data.A) {
      const marques = data.M;
      const familles = data.F;
      const articles = data.A;

      for (const [rawCode, entry] of Object.entries(articles)) {
        const code = rawCode.replace(/^0+/, '').padStart(6, '0');
        const [mIdx, fIdx, designation, sIdx] = entry;
        const marque = marques[mIdx] || 'Inconnu';

        _S.catalogueMarques.set(code, marque);
        if (!_S.marqueArticles.has(marque)) _S.marqueArticles.set(marque, new Set());
        _S.marqueArticles.get(marque).add(code);

        if (designation) _S.catalogueDesignation.set(code, designation);
        // Statut catalogue national (Fin de stock, Fin de série, etc.)
        if (data.S && sIdx > 0) _S.catalogueStatut.set(code, data.S[sIdx] || '');
        if (familles[fIdx]) {
          const fam = familles[fIdx];
          _S.catalogueFamille.set(code, {
            codeFam: fam[0] || '', libFam: fam[1] || '',
            codeSousFam: fam[2] || '', sousFam: fam[3] || ''
          });
        }
      }
    } else {
      for (const [rawCode, marque] of Object.entries(data)) {
        const code = rawCode.replace(/^0+/, '').padStart(6, '0');
        _S.catalogueMarques.set(code, marque);
        if (!_S.marqueArticles.has(marque)) _S.marqueArticles.set(marque, new Set());
        _S.marqueArticles.get(marque).add(code);
      }
    }

    // EAN → code article
    if (data.E) {
      for (const [ean, code] of Object.entries(data.E)) _S.catalogueEAN.set(ean, code);
    }

    // Ref fournisseur → enrichir finalData
    if (data.R) {
      _S.catalogueRefFourn = new Map();
      for (const [rawCode, ref] of Object.entries(data.R)) {
        const code = rawCode.replace(/^0+/, '').padStart(6, '0');
        _S.catalogueRefFourn.set(code, ref);
      }
      // Enrichir finalData si déjà chargé
      if (_S.finalData?.length) {
        for (const r of _S.finalData) {
          const ref = _S.catalogueRefFourn.get(r.code);
          if (ref) r._refFourn = ref;
        }
      }
    }

    _S.marquesList = [..._S.marqueArticles.keys()].filter(m => typeof m === 'string' && m.length > 0).sort();
    console.log(`[PRISME] Catalogue marques : ${_S.catalogueMarques.size} articles, ${_S.marquesList.length} marques, ${_S.catalogueEAN.size} EAN`);
  } catch (e) {
    console.warn('[PRISME] Erreur chargement catalogue marques:', e);
  }
}

// ═══════════════════════════════════════════════════════════════
// Recherche marque — command palette
// ═══════════════════════════════════════════════════════════════

export function initAnimationSearch() {
  const input = document.getElementById('animSearchInput');
  const results = document.getElementById('animSearchResults');
  if (!input || !results) return;
  if (input._animBound) return; // éviter double-bind
  input._animBound = true;

  let debounce;
  input.addEventListener('input', () => {
    clearTimeout(debounce);
    debounce = setTimeout(() => {
      const q = input.value.trim().toLowerCase();
      if (q.length < 2) { results.classList.add('hidden'); return; }

      const directMatches = (_S.marquesList || [])
        .filter(m => m && typeof m === 'string' && m.toLowerCase().includes(q));

      const aliasHits = [];
      const directSet = new Set(directMatches);
      for (const [alias, marque] of Object.entries(MARQUE_ALIASES)) {
        if (alias.includes(q) && !directSet.has(marque)) {
          directSet.add(marque);
          aliasHits.push({ alias, marque });
        }
      }

      const combined = [
        ...aliasHits.map(h => ({ marque: h.marque, alias: h.alias })),
        ...directMatches.map(m => ({ marque: m, alias: null })),
      ].slice(0, 15);

      if (!combined.length) {
        results.innerHTML = '<div class="p-3 text-[11px] t-disabled">Aucune marque trouvée</div>';
        results.classList.remove('hidden');
        return;
      }

      results.innerHTML = combined.map(({ marque: m, alias }) => {
        const nbArt = _S.marqueArticles?.get(m)?.size || 0;
        const safe = m.replace(/'/g, "\\'").replace(/"/g, '&quot;');
        const label = alias
          ? `<span class="font-bold t-primary">${escapeHtml(alias.toUpperCase())}</span> <span class="t-disabled">→</span> <span class="t-secondary">${escapeHtml(m)}</span>`
          : `<span class="font-bold t-primary">${escapeHtml(m)}</span>`;
        return `<div class="px-3 py-2 hover:s-hover cursor-pointer border-b b-light text-[12px]"
          onclick="window._selectAnimMarque('${safe}')">
          ${label}
          <span class="t-disabled ml-2">${nbArt} articles</span>
        </div>`;
      }).join('');
      results.classList.remove('hidden');
    }, 200);
  });

  document.addEventListener('click', (e) => {
    if (!input.contains(e.target) && !results.contains(e.target)) {
      results.classList.add('hidden');
    }
  });
}

// ═══════════════════════════════════════════════════════════════
// Sélection marque + rendu
// ═══════════════════════════════════════════════════════════════

window._selectAnimMarque = function(marque) {
  const input = document.getElementById('animSearchInput');
  const results = document.getElementById('animSearchResults');
  if (input) input.value = marque;
  if (results) results.classList.add('hidden');

  const data = computeAnimation(marque);
  if (!data) return;
  _S._animationData = data;

  const el = document.getElementById('animContent');
  if (el) { el.innerHTML = _renderAnimation(data); el.dataset.animActive = '1'; }
};

// ═══════════════════════════════════════════════════════════════
// Préparer une animation — même langage que La partie
// 1. Choisir la marque (suggestions : où une agence de ta taille fait mieux)
// 2. Le rayon prêt pour le jour J (ruptures + trous réseau)
// 3. Qui inviter (une seule liste, triée, avec la raison)
// ═══════════════════════════════════════════════════════════════

const _jsq = s => String(s ?? '').replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '&quot;');
const _plural = (n, s, p) => `${n} ${n > 1 ? (p || s + 's') : s}`;

/** CA tous canaux par agence × article sur 12 mois complets (pleine période, comme le reste de l'assortiment). */
function _storeCA12m() {
  const bmsac = _S._byMonthStoreArtCanal;
  const maxD = _S.consommePeriodMaxFull || _S.consommePeriodMax;
  const key = `${_S.selectedMyStore}|${maxD}|${bmsac ? Object.keys(bmsac).length : 0}`;
  if (_ca12Cache?.key === key) return _ca12Cache;
  const byStore = new Map(), totals = new Map();
  if (bmsac) {
    const r = defaultPeriodRange(maxD);
    const a = r ? r.start.getFullYear() * 12 + r.start.getMonth() : 0;
    const b = r ? r.end.getFullYear() * 12 + r.end.getMonth() : 999999;
    for (const store in bmsac) {
      const m = new Map(); let tot = 0;
      for (const canal in bmsac[store]) {
        const codes = bmsac[store][canal];
        for (const code in codes) {
          let ca = 0;
          for (const k in codes[code]) { const i = +k; if (i >= a && i <= b) ca += codes[code][k].sumCA || 0; }
          if (!ca) continue;
          m.set(code, (m.get(code) || 0) + ca); tot += ca;
        }
      }
      byStore.set(store, m); totals.set(store, tot);
    }
  } else {
    for (const [store, arts] of Object.entries(_S.ventesParAgence || {})) {
      const m = new Map(); let tot = 0;
      for (const code in arts) { const ca = arts[code]?.sumCA || 0; if (ca) { m.set(code, ca); tot += ca; } }
      byStore.set(store, m); totals.set(store, tot);
    }
  }
  _ca12Cache = { key, byStore, totals };
  return _ca12Cache;
}

let _ca12Cache = null, _benchCache = null;
const _median = arr => { if (!arr.length) return 0; const s = [...arr].sort((x, y) => x - y); const n = s.length; return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2; };

/** Pour chaque marque : CA chez toi, médiane des autres agences ramenées à ta taille. */
function _brandBench() {
  const ca = _storeCA12m();
  const my = _S.selectedMyStore;
  if (_benchCache?.key === ca.key) return _benchCache.list;
  const myTot = ca.totals.get(my) || 0;
  const per = new Map(); // marque → Map<store, ca>
  for (const [store, m] of ca.byStore) {
    for (const [code, v] of m) {
      const mq = _S.catalogueMarques?.get(code);
      if (!mq) continue;
      let s = per.get(mq); if (!s) per.set(mq, s = new Map());
      s.set(store, (s.get(store) || 0) + v);
    }
  }
  const others = [...ca.byStore.keys()].filter(s => s !== my && (ca.totals.get(s) || 0) > 0);
  const list = [];
  for (const [marque, s] of per) {
    const me = s.get(my) || 0;
    const scaled = others.map(o => (s.get(o) || 0) * (myTot / ca.totals.get(o)));
    const sellers = others.filter(o => (s.get(o) || 0) > 0).length;
    const med = _median(scaled);
    list.push({ marque, me, med, gain: med - me, sellers, nbOthers: others.length });
  }
  _benchCache = { key: ca.key, list };
  return list;
}

function _tile(label, value, hint, color) {
  return `<div class="pt-col" style="gap:4px;padding:14px 16px;border-radius:14px;background:var(--s-card-alt);min-width:0">
    <span class="pt-eyebrow" style="font-size:11px">${label}</span>
    <span class="pt-num" style="font-size:22px;font-weight:600;color:${color || 'var(--t-primary)'}">${value}</span>
    <span class="pt-small pt-muted" style="line-height:1.35">${hint || ''}</span>
  </div>`;
}

function _signed(v) { return `${v >= 0 ? '+' : '−'}${formatEuro(Math.abs(v))}`; }

/** Écran d'accueil : les marques où tu as le plus à gagner. */
function _renderBrandPicker() {
  const bench = _brandBench();
  const top = bench.filter(b => b.gain > 0 && b.sellers >= Math.max(2, Math.ceil(b.nbOthers / 2)))
    .sort((a, b) => b.gain - a.gain).slice(0, 15);
  const rows = top.map(b => `<tr class="ar-click" onclick="window._selectAnimMarque('${_jsq(b.marque)}')">
      <td><span class="pt-strong">${escapeHtml(b.marque)}</span></td>
      <td class="pt-num ar-r">${b.me ? formatEuro(b.me) : '<span class="pt-muted">—</span>'}</td>
      <td class="pt-num ar-r">${formatEuro(b.med)}</td>
      <td class="pt-num ar-r pt-strong" style="color:var(--pt-low)">${_signed(b.gain)}</td>
      <td class="pt-num ar-r pt-muted">${b.sellers} / ${b.nbOthers}</td>
    </tr>`).join('');
  return `<section class="pt-card pt-col" style="gap:14px">
    <div class="pt-col" style="gap:4px">
      <h3 class="pt-h3">Les marques où tu as le plus à gagner</h3>
      <span class="pt-small pt-muted">Ce que fait une agence de ta taille (médiane du réseau, ramenée à ton CA) face à ce que tu fais, sur 12 mois tous canaux. Clic sur une marque pour préparer l’animation.</span>
    </div>
    ${top.length ? `<div class="pt-list" style="margin-top:0"><div class="pt-scroll" style="max-height:none"><table class="pt-table">
      <thead><tr><th>Marque</th><th class="ar-r">Chez toi</th><th class="ar-r">Agence de ta taille</th><th class="ar-r">À gagner</th><th class="ar-r">Agences qui la vendent</th></tr></thead>
      <tbody>${rows}</tbody></table></div></div>`
    : '<p class="pt-small pt-muted" style="margin:0">Il faut un consommé multi-agences pour comparer les marques. Tu peux quand même chercher une marque ci-dessus.</p>'}
  </section>`;
}

// ── Qui inviter ──
let _invFilter = 'all';
let _invCom = '';
let _invAll = false;

const INV_RAISONS = {
  fidele:      { label: 'Fidèle',                tone: 'high' },
  machine:     { label: 'Consommables sans machine', tone: 'mid' },
  relancer:    { label: 'À relancer',            tone: 'mid' },
  concurrence: { label: 'Achète la concurrence', tone: 'low' },
};

function _invites(data) {
  const machine = new Set((data.clients.labo || []).map(c => c.cc));
  const silent = new Map((data.clients.reconquete || []).map(c => [c.cc, c.daysSince]));
  const out = [];
  for (const c of data.clients.acheteurs) {
    const days = silent.get(c.cc);
    const raison = days != null ? 'relancer' : machine.has(c.cc) ? 'machine' : 'fidele';
    const detail = days != null ? `${_plural(c.nbArticlesMarque, 'article')} de la marque · plus venu depuis ${days} j`
      : raison === 'machine' ? `achète les consommables, pas la machine · ${_plural(c.nbArticlesMarque, 'article')}`
      : `${_plural(c.nbArticlesMarque, 'article')} de la marque`;
    out.push({ ...c, raison, detail, montant: c.caMarque || 0, montantLabel: 'CA marque' });
  }
  for (const c of data.clients.conquete || []) {
    out.push({ ...c, raison: 'concurrence', detail: c.marquesConcurrentes ? `achète ${c.marquesConcurrentes}` : 'achète une autre marque', montant: c.caConcurrence || 0, montantLabel: 'CA concurrence' });
  }
  out.sort((a, b) => b.montant - a.montant);
  return out;
}

function _invFiltered(data) {
  return _invites(data).filter(c => (_invFilter === 'all' || c.raison === _invFilter) && (!_invCom || c.commercial === _invCom));
}

function _renderInvites(data) {
  const all = _invites(data);
  const counts = { all: all.length };
  for (const c of all) counts[c.raison] = (counts[c.raison] || 0) + 1;
  const coms = [...new Set(all.map(c => c.commercial).filter(Boolean))].sort();
  const list = _invFiltered(data);
  const shown = _invAll ? list : list.slice(0, 30);
  const chip = (k, label) => `<button type="button" class="ar-chip${_invFilter === k ? ' ar-chip-on' : ''}" onclick="window._animInvFilter('${k}')">${label} <span class="pt-num">${counts[k] || 0}</span></button>`;
  const rows = shown.map(c => {
    const r = INV_RAISONS[c.raison];
    return `<tr class="ar-click" onclick="window.openClient360?.('${_jsq(c.cc)}','animation')">
      <td><div class="pt-col" style="gap:2px"><span class="pt-strong">${escapeHtml(c.nom)}</span><span class="pt-small pt-muted">${escapeHtml(c.detail)}</span></div></td>
      <td><span class="ar-tag" data-tone="${r.tone}">${r.label}</span></td>
      <td class="pt-small">${escapeHtml(c.metier || '—')}</td>
      <td class="pt-small">${escapeHtml(c.commercial || '—')}</td>
      <td class="pt-num ar-r">${formatEuro(c.montant)}</td>
    </tr>`;
  }).join('');
  return `<section class="pt-card pt-col" style="gap:14px" id="animInvites">
    <div class="pt-row pt-between" style="gap:12px;flex-wrap:wrap;align-items:flex-start">
      <div class="pt-col" style="gap:4px;flex:1;min-width:260px">
        <h3 class="pt-h3">Qui inviter</h3>
        <span class="pt-small pt-muted">Clients du comptoir sur 12 mois. Fidèles = ceux qui achètent déjà la marque ; concurrence = ceux qui achètent une autre marque dans les mêmes familles.</span>
      </div>
      <button type="button" class="pt-btn" onclick="window._animExportTournee()">Exporter la tournée (${list.length})</button>
    </div>
    <div class="pt-row" style="gap:8px;flex-wrap:wrap">
      ${chip('all', 'Tous')}${chip('fidele', 'Fidèles')}${chip('machine', 'Sans la machine')}${chip('relancer', 'À relancer')}${chip('concurrence', 'Concurrence')}
      ${coms.length > 1 ? `<select class="pf-select" style="margin-left:auto" onchange="window._animInvCom(this.value)">
        <option value="">Tous les commerciaux</option>${coms.map(c => `<option value="${escapeHtml(c)}"${c === _invCom ? ' selected' : ''}>${escapeHtml(c)}</option>`).join('')}
      </select>` : ''}
    </div>
    ${list.length ? `<div class="pt-list" style="margin-top:0"><div class="pt-scroll" style="max-height:none"><table class="pt-table">
      <thead><tr><th>Client</th><th>Raison</th><th>Métier</th><th>Commercial</th><th class="ar-r">Montant 12 mois</th></tr></thead>
      <tbody>${rows}</tbody></table></div></div>
      ${list.length > shown.length ? `<button type="button" class="pt-link" onclick="window._animInvAll()">Voir les ${list.length} clients</button>` : ''}`
    : '<p class="pt-small pt-muted" style="margin:0">Aucun client pour ce filtre.</p>'}
  </section>`;
}

window._animInvFilter = k => { _invFilter = k; _invAll = false; _rerenderInvites(); };
window._animInvCom = v => { _invCom = v; _invAll = false; _rerenderInvites(); };
window._animInvAll = () => { _invAll = true; _rerenderInvites(); };
function _rerenderInvites() {
  const el = document.getElementById('animInvites');
  if (el && _S._animationData) el.outerHTML = _renderInvites(_S._animationData);
}

// ── Le rayon prêt ──
function _rayonLists(data) {
  const ruptures = data.articles
    .filter(a => a.stockStatus === 'rupture' && (a.caAgence > 0 || a.nbAgencesReseau >= 2))
    .sort((a, b) => b.caAgence - a.caAgence || b.caReseau - a.caReseau);
  const trous = data.trousCritiques.slice(0, 12);
  return { ruptures, trous };
}

function _renderRayon(data) {
  const { ruptures, trous } = _rayonLists(data);
  const row = (a, geste, tone) => `<tr class="ar-click" onclick="window.openArticlePanel?.('${a.code}','animation')">
      <td><div class="pt-col" style="gap:2px"><span class="pt-strong">${escapeHtml(a.libelle || a.code)}</span><span class="pt-small pt-muted pt-num">${a.code} · ${escapeHtml(a.famLabel || '')}</span></div></td>
      <td><span class="ar-tag" data-tone="${tone}">${geste}</span></td>
      <td class="pt-num ar-r">${a.caAgence ? formatEuro(a.caAgence) : '<span class="pt-muted">—</span>'}</td>
      <td class="pt-num ar-r">${a.nbAgencesReseau ? `${a.nbAgencesReseau} ag. · ${formatEuro(a.caReseau / a.nbAgencesReseau)}` : '<span class="pt-muted">—</span>'}</td>
    </tr>`;
  const body = [
    ...ruptures.map(a => row(a, 'Commander', 'low')),
    ...(ruptures.length && trous.length ? ['<tr class="pt-sep"><td colspan="4">Vendus dans le réseau, absents de ton stock — à demander au fournisseur (dépôt, lancement)</td></tr>'] : []),
    ...trous.map(a => row(a, 'Faire entrer', 'mid')),
  ].join('');
  const n = ruptures.length + trous.length;
  return `<section class="pt-card pt-col" style="gap:14px">
    <div class="pt-row pt-between" style="gap:12px;flex-wrap:wrap;align-items:flex-start">
      <div class="pt-col" style="gap:4px;flex:1;min-width:260px">
        <h3 class="pt-h3">Le rayon prêt pour le jour J</h3>
        <span class="pt-small pt-muted">${ruptures.length ? `${_plural(ruptures.length, 'rupture')} à commander avant l’animation` : 'Aucune rupture sur la marque'}${trous.length ? ` · ${trous.length} article${trous.length > 1 ? 's' : ''} que le réseau vend et que tu n’as pas (sur ${data.trousCritiques.length})` : ''}.</span>
      </div>
      ${n ? '<button type="button" class="pt-btn" onclick="window._animExportRayon()">Exporter la commande</button>' : ''}
    </div>
    ${n ? `<div class="pt-list" style="margin-top:0"><div class="pt-scroll" style="max-height:none"><table class="pt-table">
      <thead><tr><th>Article</th><th>Geste</th><th class="ar-r">Vendu chez toi</th><th class="ar-r">Réseau · par agence</th></tr></thead>
      <tbody>${body}</tbody></table></div></div>` : ''}
  </section>`;
}

function _renderAnimation(data) {
  if (!data) return '<p class="pt-muted">Aucune donnée pour cette marque.</p>';
  const my = _S.selectedMyStore;
  const b = _brandBench().find(x => x.marque === data.marque);
  const hasBrandFile = _brandFileData && _brandFileMarque === data.marque && _brandFileData.crossResult;
  const nbInv = data.totalClientsActifs + (data.clients.conquete?.length || 0);
  const tiles = [
    _tile('Chez toi · 12 mois', formatEuro(b?.me || 0), `tous canaux · ${_plural(data.totalClientsActifs, 'client')} au comptoir`),
    _tile('Agence de ta taille', b?.nbOthers ? formatEuro(b.med) : '—', b?.nbOthers ? `médiane réseau ramenée à ton CA · ${b.sellers}/${b.nbOthers} agences la vendent` : 'consommé multi-agences requis'),
    _tile(b && b.gain > 0 ? 'À gagner' : 'D’avance', b?.nbOthers ? _signed(b && b.gain > 0 ? b.gain : -(b?.gain || 0)) : '—', b && b.gain > 0 ? 'si tu fais comme une agence de ta taille' : 'tu fais déjà mieux que la médiane', b && b.gain > 0 ? 'var(--pt-low)' : 'var(--pt-high)'),
    _tile('Rayon', `${data.nbEnStock} en stock`, `${_plural(data.nbRupture, 'rupture')} · ${data.trousCritiques.length} trous réseau`),
    _tile('Invités possibles', String(nbInv), `${data.totalClientsActifs} fidèles · ${data.clients.conquete?.length || 0} chez la concurrence`),
  ].join('');
  return `<div class="pt-col" style="gap:20px">
    <section class="pt-card pt-col" style="gap:18px">
      <div class="pt-row pt-between" style="gap:16px;flex-wrap:wrap;align-items:flex-start">
        <div class="pt-col" style="gap:4px;min-width:260px;flex:1">
          <span class="pt-eyebrow">Animation · ${escapeHtml(my || '')}</span>
          <h3 class="pt-h2">${escapeHtml(data.marque)}</h3>
          <span class="pt-muted">Un rayon plein, les bons clients invités. ${_plural(data.nbArticlesTotal, 'article')} au catalogue, ${data.nbVendusReseau} vendus dans le réseau.</span>
        </div>
        <div class="pt-row" style="gap:8px;flex-wrap:wrap">
          <button type="button" class="pt-btn" onclick="window._animBack()">Autre marque</button>
          <button type="button" id="animBrandFileBtn" class="pt-btn" onclick="window._animLoadBrandFile()" title="Fichier de ventes nationales du fournisseur (format Qlik)">${hasBrandFile ? 'Fichier fournisseur chargé' : 'Charger un fichier fournisseur'}</button>
        </div>
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px">${tiles}</div>
    </section>
    ${_renderRayon(data)}
    ${_renderInvites(data)}
    ${hasBrandFile ? `<details class="ar-sec" open><summary><span class="pt-col" style="gap:2px"><span class="pt-h3">Données fournisseur</span><span class="pt-small pt-muted">Croisement du fichier chargé avec tes clients · <button type="button" class="pt-link pt-small" style="padding:0" onclick="event.preventDefault();window._animClearBrandFile()">retirer le fichier</button></span></span><span class="ar-chev" aria-hidden="true"></span></summary><div class="ar-sec-body">${_renderBrandInsights(_brandFileData.crossResult)}</div></details>` : ''}
  </div>`;
}

window._animBack = function() {
  _S._animationData = null;
  const input = document.getElementById('animSearchInput');
  if (input) { input.value = ''; input.focus(); }
  const el = document.getElementById('animContent');
  if (el) { el.innerHTML = _renderBrandPicker(); delete el.dataset.animActive; }
};

window._animExportRayon = function() {
  const data = _S._animationData;
  if (!data) return;
  const { ruptures, trous } = _rayonLists(data);
  const sep = ';';
  const header = ['Code', 'Libellé', 'Famille', 'Geste', 'CA agence', 'Agences réseau', 'CA réseau'].join(sep);
  const rows = [...ruptures.map(a => [a, 'Commander']), ...trous.map(a => [a, 'Faire entrer'])].map(([a, g]) => [
    a.code, `"${(a.libelle || '').replace(/"/g, '""')}"`, `"${a.famLabel || ''}"`, g,
    (a.caAgence || 0).toFixed(2), a.nbAgencesReseau, (a.caReseau || 0).toFixed(2)
  ].join(sep));
  _downloadCSV('\uFEFF' + header + '\n' + rows.join('\n'), `PRISME_Rayon_${_safeName(data.marque)}_${_today()}.csv`);
};

// ═══════════════════════════════════════════════════════════════
// Exports CSV
// ═══════════════════════════════════════════════════════════════

window._animExportTournee = function() {
  const data = _S._animationData;
  if (!data) return;
  const sep = ';';
  const header = ['Code client', 'Nom', 'Raison', 'Détail', 'Métier', 'CP', 'Commercial', 'Montant 12 mois', 'Présence confirmée'].join(sep);
  const q = s => `"${String(s || '').replace(/"/g, '""')}"`;
  const rows = _invFiltered(data).sort((a, b) => (a.commercial || '').localeCompare(b.commercial || '') || (a.cp || '').localeCompare(b.cp || ''))
    .map(c => [c.cc, q(c.nom), INV_RAISONS[c.raison].label, q(c.detail), q(c.metier), c.cp || '', q(c.commercial), (c.montant || 0).toFixed(2), ''].join(sep));
  _downloadCSV('\uFEFF' + header + '\n' + rows.join('\n'), `PRISME_Tournee_${_safeName(data.marque)}_${_today()}.csv`);
};

function _downloadCSV(csv, filename) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  document.body.appendChild(link); link.click(); document.body.removeChild(link);
  URL.revokeObjectURL(link.href);
}

function _safeName(s) { return (s || '').replace(/[^a-zA-Z0-9]/g, '_').slice(0, 30); }
function _today() { return new Date().toISOString().slice(0, 10); }

// ═══════════════════════════════════════════════════════════════
// Render tab (appelé depuis renderAll)
// ═══════════════════════════════════════════════════════════════

export async function renderAnimationTab() {
  const el = document.getElementById('tabAnimation');
  if (!el) return;
  const content = document.getElementById('animContent');
  if (!_S.catalogueMarques?.size) {
    if (content) content.innerHTML = '<p class="pt-muted">Catalogue des marques en cours de chargement…</p>';
    await loadCatalogueMarques();
  }
  if (!_S.catalogueMarques?.size) {
    if (content) content.innerHTML = '<p class="pt-muted">Catalogue des marques indisponible (js/catalogue-marques.json manquant).</p>';
    return;
  }
  initAnimationSearch();
  const n = document.getElementById('animSearchCount');
  if (n) n.textContent = `${(_S.marquesList || []).length} marques (fournisseurs du catalogue) · tape au moins 2 lettres`;
  if (!content) return;
  if (_S._animationData && content.dataset.animActive) {
    // Les données ont pu changer (rechargement) : recalcule la marque active
    const data = computeAnimation(_S._animationData.marque);
    if (data) { _S._animationData = data; content.innerHTML = _renderAnimation(data); return; }
  }
  content.innerHTML = _renderBrandPicker();
  delete content.dataset.animActive;
}

