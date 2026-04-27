// © 2026 Jawad El Barkaoui — Tous droits réservés
// PRISME — Physigamme engine
// Calcul du socle PDV par transversalité métiers et périmètre de ventes.
// ═══════════════════════════════════════════════════════════════
'use strict';

import { _S } from './state.js';
import { FAM_LETTER_UNIVERS } from './constants.js';
import { _isMetierStrategique } from './utils.js';

function _physigammeFamLabel(codeFam) {
  const catFam = _S.catalogueFamille;
  if (catFam) {
    for (const f of catFam.values()) {
      if (f.codeFam === codeFam && f.libFam) return f.libFam;
    }
  }
  return codeFam;
}

function _defaultStrategicMetiers(chalandiseData) {
  const metiers = new Set();
  for (const info of chalandiseData.values()) {
    if (info.metier && _isMetierStrategique(info.metier)) metiers.add(info.metier);
  }
  return metiers;
}

function _emptyPhysigammeResult() {
  return {
    articles: [],
    totalMetiers: 0,
    troncCount: 0,
    interCount: 0,
    specCount: 0,
    caHorsMetier: 0,
    clientsHorsMetier: 0
  };
}

export function computePhysigamme({
  universLetter = '',
  metiersSet = null,
  includeAll = false,
  perimetre = 'agence'
} = {}) {
  const catFam = _S.catalogueFamille;
  const chal = _S.chalandiseData;
  if (!chal?.size) return _emptyPhysigammeResult();

  const selectedMetiers = metiersSet || _defaultStrategicMetiers(chal);
  const totalMetiers = selectedMetiers.size;
  if (totalMetiers === 0) return _emptyPhysigammeResult();

  const artMetierMap = new Map();
  let caHorsMetier = 0;
  let clientsHorsMetier = 0;
  const horsMetierSeen = new Set();

  const ingest = (cc, code, ca) => {
    if (!/^\d{6}$/.test(code)) return;
    if (universLetter) {
      const cf = catFam?.get(code)?.codeFam || _S.articleFamille?.[code] || '';
      if (!cf || cf.charAt(0) !== universLetter) return;
    }

    const rawMetier = chal.get(cc)?.metier;
    let metier = rawMetier && selectedMetiers.has(rawMetier) ? rawMetier : null;
    if (!metier && includeAll) metier = rawMetier && rawMetier.length > 2 ? rawMetier : '(Non renseigné)';

    if (!metier) {
      caHorsMetier += ca;
      if (!horsMetierSeen.has(cc)) {
        clientsHorsMetier++;
        horsMetierSeen.add(cc);
      }
      return;
    }

    if (!artMetierMap.has(code)) artMetierMap.set(code, new Map());
    const metierMap = artMetierMap.get(code);
    if (!metierMap.has(metier)) metierMap.set(metier, { ca: 0, clients: new Set() });
    const entry = metierMap.get(metier);
    entry.ca += ca;
    entry.clients.add(cc);
  };

  const processClientArticleMap = (src) => {
    if (!src?.size) return;
    for (const [cc, artMap] of src) {
      for (const [code, v] of artMap) ingest(cc, code, v.sumCA || 0);
    }
  };

  if (perimetre === 'agence') {
    // Consommé de mon agence : MAGASIN + canaux PDV hors comptoir (Web/Rep/DCS).
    processClientArticleMap(_S.ventesLocalMagPeriode);
    processClientArticleMap(_S.ventesLocalHorsMag);
  } else if (perimetre === 'reseau') {
    processClientArticleMap(_S.ventesReseauTousCanaux);
  } else if (perimetre === 'territoire' && _S.territoireReady && _S.territoireLines?.length) {
    for (const line of _S.territoireLines) {
      if (line.clientCode) ingest(line.clientCode, line.code, line.ca || 0);
    }
  }

  const allFoundMetiers = new Set();
  if (includeAll) {
    for (const metierMap of artMetierMap.values()) {
      for (const metier of metierMap.keys()) allFoundMetiers.add(metier);
    }
  }
  const effectiveTotalMetiers = includeAll ? Math.max(allFoundMetiers.size, totalMetiers) : totalMetiers;

  const articles = [];
  for (const [code, metierMap] of artMetierMap) {
    const nbMetiers = metierMap.size;
    const indice = Math.round(nbMetiers / effectiveTotalMetiers * 100);
    let caTotal = 0;
    const clientsAll = new Set();
    for (const data of metierMap.values()) {
      caTotal += data.ca;
      for (const cc of data.clients) clientsAll.add(cc);
    }
    const cf = catFam?.get(code)?.codeFam || _S.articleFamille?.[code] || '';
    articles.push({
      code,
      libelle: _S.libelleLookup?.[code] || code,
      famille: cf,
      famLib: _physigammeFamLabel(cf),
      univers: cf ? (FAM_LETTER_UNIVERS[cf.charAt(0)] || '?') : '?',
      nbMetiers,
      indice,
      caTotal,
      nbClients: clientsAll.size,
      metierDetail: metierMap
    });
  }

  articles.sort((a, b) => b.indice - a.indice || b.caTotal - a.caTotal);

  return {
    articles,
    totalMetiers: effectiveTotalMetiers,
    troncCount: articles.filter(a => a.indice >= 60).length,
    interCount: articles.filter(a => a.indice >= 30 && a.indice < 60).length,
    specCount: articles.filter(a => a.indice < 30).length,
    caHorsMetier,
    clientsHorsMetier
  };
}
