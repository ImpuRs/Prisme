// Ajoute à ARTICLES.csv les colonnes CATALOGUE (texte normalisé comme CLE_DESIGNATION) et PAGE_CATALOGUE.
// Usage : node fusionner.js ARTICLES.csv rattachement.json ARTICLES_catalogue.csv
// Un code présent sur plusieurs pages garde ses textes (dédoublonnés) et la première page.
const fs = require('fs'), path = require('path');
const E = require(path.join(__dirname, '..', '..', 'Code.gs'));
const [src, json, out] = process.argv.slice(2);
const rat = JSON.parse(fs.readFileSync(json, 'utf8'));
const lignes = fs.readFileSync(src, 'utf8').split('\n');
const q = v => /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
let enrichis = 0;
const res = lignes.map((l, i) => {
  if (!l) return l;
  if (i === 0) return l.replace(/\r$/, '') + ',CATALOGUE,PAGE_CATALOGUE';
  const code = l.slice(0, l.indexOf(','));
  const r = rat[code];
  if (!r) return l.replace(/\r$/, '') + ',,';
  enrichis++;
  // « TS 4000 » dans le catalogue, « TS4000 » dans la désignation : on ajoute la forme collée
  const brut = E.normaliser(r.map(x => x[2]).join(' ')).split(' ');
  const colles = brut.flatMap((m, k) => /^[A-Z]{1,4}$/.test(m) && /^\d+[A-Z]*$/.test(brut[k + 1] || '') ? [m + brut[k + 1]] : []);
  const mots = [...new Set(brut.concat(colles))].join(' ');
  return l.replace(/\r$/, '') + ',' + q(mots) + ',' + q(r[0][1] || ('page PDF ' + r[0][0]));
});
fs.writeFileSync(out, res.join('\n'));
console.log(enrichis + ' articles enrichis sur ' + (lignes.length - 2));
