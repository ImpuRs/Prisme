#!/usr/bin/env node
'use strict';
// ── Build catalogue-marques.json depuis catalogue.csv (CP1252) ─────────
// Colonnes attendues : Code;Designation_1;Statut;Libelle;Marque;Code_Famille;Libelle_Famille;Code_Sous-famille;Libelle_Sous_Famille;Code_EAN
// Sortie : format indexé compact {M:[], F:[], A:{code:[mIdx,fIdx,designation]}, E:{ean:code}}

const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..', 'data', 'catalogue.csv');
const DST = path.join(__dirname, '..', 'js', 'catalogue-marques.json');

// Lire en latin1 (CP1252-compatible pour les caractères français)
const raw = fs.readFileSync(SRC, 'latin1');
const lines = raw.replace(/\r/g, '').split('\n').filter(l => l.trim());

// Header
const hdr = lines[0].split(';');
const col = {};
hdr.forEach((h, i) => col[h.trim()] = i);

console.log('Colonnes détectées:', hdr.map(h => h.trim()));
console.log('Lignes données:', lines.length - 1);

const marqueIdx = new Map();  // marque → index
const familleIdx = new Map(); // clé fam → index
const statutIdx = new Map();  // statut → index
const marques = [];
const familles = [];
const statuts = [];
const articles = {};
const eans = {};

let eanCount = 0, eanBad = 0;

for (let i = 1; i < lines.length; i++) {
  const parts = lines[i].split(';');
  const code = (parts[col.Code] || '').trim().replace(/^0+/, '').padStart(6, '0');
  if (!code || code === '000000') continue;

  const designation = (parts[col.Designation_1] || '').trim();
  const statut = (parts[col.Statut] || '').trim();
  const marque = (parts[col.Marque] || '').trim() || 'Inconnu';
  const codeFam = (parts[col.Code_Famille] || '').trim();
  const libFam = (parts[col.Libelle_Famille] || '').trim();
  const codeSF = (parts[col['Code_Sous-famille']] || '').trim();
  const libSF = (parts[col.Libelle_Sous_Famille] || '').trim();
  const eanRaw = (parts[col.Code_EAN] || '').trim();

  // Marque index
  if (!marqueIdx.has(marque)) { marqueIdx.set(marque, marques.length); marques.push(marque); }
  const mIdx = marqueIdx.get(marque);

  // Famille index (clé = codeFam + codeSF)
  const famKey = codeFam + '|' + codeSF;
  if (!familleIdx.has(famKey)) {
    familleIdx.set(famKey, familles.length);
    familles.push([codeFam, libFam, codeSF, libSF]);
  }
  const fIdx = familleIdx.get(famKey);

  // Statut index
  let sIdx = 0;
  if (statut) {
    if (!statutIdx.has(statut)) { statutIdx.set(statut, statuts.length); statuts.push(statut); }
    sIdx = statutIdx.get(statut);
  }

  articles[code] = [mIdx, fIdx, designation, sIdx];

  // EAN — ignorer notation scientifique et valeurs vides
  if (eanRaw && !eanRaw.includes('E+') && !eanRaw.includes('e+')) {
    const ean = eanRaw.replace(/\D/g, '');
    if (ean.length >= 8 && ean.length <= 14) {
      eans[ean] = code;
      eanCount++;
    } else if (ean.length > 0) {
      eanBad++;
    }
  } else if (eanRaw.includes('E+')) {
    eanBad++;
  }
}

const payload = { M: marques, F: familles, S: statuts, A: articles, E: eans };
const json = JSON.stringify(payload);
fs.writeFileSync(DST, json, 'utf8');

const sizeMB = (json.length / 1024 / 1024).toFixed(1);
console.log(`\nRésultat:`);
console.log(`  Marques:  ${marques.length}`);
console.log(`  Familles: ${familles.length}`);
console.log(`  Articles: ${Object.keys(articles).length}`);
console.log(`  EAN OK:   ${eanCount}`);
console.log(`  Statuts:  ${statuts.length} (${statuts.join(', ')})`)
console.log(`  EAN bad:  ${eanBad}`);
console.log(`  Taille:   ${sizeMB} Mo`);
console.log(`  → ${DST}`);
