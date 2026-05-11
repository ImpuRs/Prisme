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

// Mettre à jour le timestamp
scan.timestamp = Date.now();

// Sauvegarder
fs.writeFileSync(jsonPath, JSON.stringify(scan));
console.log(`✓ ${updated} articles mis à jour, ${unchanged} inchangés`);
console.log(`→ ${jsonPath}`);
