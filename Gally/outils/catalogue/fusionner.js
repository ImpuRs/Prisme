// Ajoute à ARTICLES.csv les colonnes CATALOGUE (texte normalisé comme CLE_DESIGNATION) et PAGE_CATALOGUE.
// Usage : node fusionner.js ARTICLES.csv ARTICLES_catalogue.csv "Second œuvre=rattachement_so.json" "Plomberie=rattachement_plomberie.json" …
// Un code présent dans plusieurs catalogues (ou sur plusieurs pages) garde tous ses textes ;
// la page affichée est la première trouvée, dans l'ordre des catalogues donnés.
const fs = require('fs'), path = require('path');
const E = require(path.join(__dirname, '..', '..', 'Code.gs'));
const [src, out, ...cats] = process.argv.slice(2);
const sources = cats.map(a => { const k = a.indexOf('='); return { nom: a.slice(0, k), rat: JSON.parse(fs.readFileSync(a.slice(k + 1), 'utf8')) }; });
const lignes = fs.readFileSync(src, 'utf8').split('\n');
const q = v => /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
const compte = {}; let enrichis = 0;
const res = lignes.map((l, i) => {
  if (!l) return l;
  l = l.replace(/\r$/, '');
  if (i === 0) return l + ',CATALOGUE,PAGE_CATALOGUE';
  const code = l.slice(0, l.indexOf(','));
  const trouves = sources.filter(s => s.rat[code]);
  if (!trouves.length) return l + ',,';
  enrichis++;
  trouves.forEach(s => { compte[s.nom] = (compte[s.nom] || 0) + 1; });
  // « TS 4000 » dans le catalogue, « TS4000 » dans la désignation : on ajoute la forme collée
  const brut = E.normaliser(trouves.flatMap(s => s.rat[code].map(x => x[2])).join(' ')).split(' ');
  const colles = brut.flatMap((m, k) => /^[A-Z]{1,4}$/.test(m) && /^\d+[A-Z]*$/.test(brut[k + 1] || '') ? [m + brut[k + 1]] : []);
  const mots = [...new Set(brut.concat(colles))].join(' ');
  const p = trouves[0].rat[code][0];
  return l + ',' + q(mots) + ',' + q(trouves[0].nom + ' p. ' + (p[1] || 'PDF ' + p[0]));
});
fs.writeFileSync(out, res.join('\n'));
console.log(enrichis + ' articles enrichis sur ' + (lignes.length - 2) + ' · par catalogue : ' + JSON.stringify(compte));
