#!/usr/bin/env node
// merge-zzat.js — Met à jour prisme-scan-AGXX.json avec un export ZZAT018 frais
// Usage: node merge-zzat.js <ZZAT018.csv> <prisme-scan-AGXX.json>
// Résultat: écrase le JSON avec les stocks/min/max/emplacements/statuts à jour

const fs = require('fs');
const path = require('path');

const [csvPath, jsonPath] = process.argv.slice(2);
if (!csvPath || !jsonPath) {
  console.error('Usage: node merge-zzat.js <ZZAT018.csv> <prisme-scan-AGXX.json>');
  process.exit(1);
}

// Parse ZZAT CSV (séparateur " ; ", encodage CP1252-ish)
const csvBuf = fs.readFileSync(csvPath);
// Essayer UTF-8, sinon latin1
let csvText;
try { csvText = csvBuf.toString('utf8'); } catch(e) { csvText = csvBuf.toString('latin1'); }
// Si des caractères cassés, fallback latin1
if (csvText.includes('�')) csvText = csvBuf.toString('latin1');

const lines = csvText.split('\n').filter(l => l.trim());
const header = lines[0].split(';').map(h => h.trim().toLowerCase());

// Index colonnes
const iArticle = header.findIndex(h => h === 'article');
const iStock = header.findIndex(h => h === 'stock');
const iMin = header.findIndex(h => /qte\s*min/.test(h));
const iMax = header.findIndex(h => /qte\s*max/.test(h));
const iEmpl = header.findIndex(h => h === 'emplacement');
const iStatut = header.findIndex(h => h === 'statut');
const iLibelle = header.findIndex(h => h.startsWith('libelle'));
const iFam = header.findIndex(h => h === 'famille');
const iSousFam = header.findIndex(h => h === 'sous-famille');

console.log(`Colonnes détectées: article=${iArticle} stock=${iStock} min=${iMin} max=${iMax} empl=${iEmpl} statut=${iStatut}`);

// Construire Map<code, {...}>
const zzat = new Map();
for (let i = 1; i < lines.length; i++) {
  const cols = lines[i].split(';').map(c => c.trim());
  const code = cols[iArticle];
  if (!code || !/^\d{5,6}$/.test(code)) continue;
  zzat.set(code, {
    stock: parseInt(cols[iStock]) || 0,
    min: parseInt(cols[iMin]) || 0,
    max: parseInt(cols[iMax]) || 0,
    empl: cols[iEmpl] || '',
    statut: cols[iStatut] || '',
    libelle: cols[iLibelle] || '',
    famille: iFam >= 0 ? cols[iFam] || '' : '',
    sousFamille: iSousFam >= 0 ? cols[iSousFam] || '' : '',
  });
}
console.log(`ZZAT: ${zzat.size} articles parsés`);

// Charger le JSON scan
const scan = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
const articles = scan.articles || [];
console.log(`JSON: ${articles.length} articles`);

let updated = 0, unchanged = 0;
for (const a of articles) {
  const z = zzat.get(a.code);
  if (!z) continue;
  const changed = a.stockActuel !== z.stock || a.ancienMin !== z.min || a.ancienMax !== z.max
    || a.emplacement !== z.empl || a.statut !== z.statut;
  if (changed) {
    a.stockActuel = z.stock;
    a.ancienMin = z.min;
    a.ancienMax = z.max;
    a.emplacement = z.empl;
    a.statut = z.statut;
    updated++;
  } else {
    unchanged++;
  }
}

// Articles du ZZAT absents du JSON (nouvelles implantations) → fiche minimale
// enrichie par le catalogue (libellé, sous-famille, ref fournisseur, EAN).
// Pas d'analyse PRISME pour eux : reco MIN/MAX = ERP, squelette « Non analysé ».
const CAT_PATH = path.join(__dirname, '..', 'js', 'catalogue-marques.json');
const cat = fs.existsSync(CAT_PATH) ? JSON.parse(fs.readFileSync(CAT_PATH, 'utf8')) : null;
const eansByCode = new Map();
if (cat?.E) for (const [ean, code] of Object.entries(cat.E)) {
  if (!eansByCode.has(code)) eansByCode.set(code, []);
  eansByCode.get(code).push(ean);
}
const known = new Set(articles.map(a => a.code));
let added = 0, eanAdded = 0;
if (!scan.ean) scan.ean = {};
for (const [code, z] of zzat) {
  if (known.has(code)) continue;
  const c = cat?.A?.[code];
  const f = c ? cat.F[c[1]] : null; // [codeFam, libFam, codeSF, libSF]
  articles.push({
    code,
    libelle: c?.[2] || z.libelle,
    famille: z.famille || f?.[0] || '',
    sousFamille: f?.[2] && f?.[3] ? `${f[2]} - ${f[3]}` : z.sousFamille,
    emplacement: z.empl,
    statut: z.statut,
    stockActuel: z.stock,
    W: 0, V: 0,
    ancienMin: z.min, ancienMax: z.max,
    nouveauMin: z.min, nouveauMax: z.max,
    couvertureJours: null,
    abcClass: '', fmrClass: '', matriceVerdict: '',
    _sqClassif: '', _sqRole: '', _sqVerdict: 'Non analysé',
    _vitesseReseau: false, _fallbackERP: true, isParent: false,
    _refFourn: cat?.R?.[code] || '',
  });
  for (const ean of eansByCode.get(code) || []) {
    if (!scan.ean[ean]) { scan.ean[ean] = code; eanAdded++; }
  }
  added++;
}
scan.articles = articles;
scan.count = articles.length;

// Mettre à jour le timestamp
scan.timestamp = Date.now();

// Sauvegarder
fs.writeFileSync(jsonPath, JSON.stringify(scan));
console.log(`✓ ${updated} articles mis à jour, ${unchanged} inchangés, ${added} ajoutés (${eanAdded} EAN)`);
if (!cat) console.log('⚠ catalogue-marques.json introuvable — articles ajoutés sans enrichissement catalogue');
console.log(`→ ${jsonPath}`);
