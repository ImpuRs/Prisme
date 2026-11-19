#!/usr/bin/env node
// build-scan-autonome.mjs — assemble un dossier « PRISME Scan » autonome (sans GitHub, sans CDN).
//
// Usage :  node tools/build-scan-autonome.mjs [dossier-de-sortie]             (défaut : ./scan-autonome)
//          node tools/build-scan-autonome.mjs --public [dossier-de-sortie]    (défaut : ./scan-public)
//   --public : site SANS AUCUNE DONNÉE (ni stock, ni codes-barres, ni catalogue, ni constantes PRISME), à publier
//              tel quel (GitHub Pages…). Chaque appareil charge ses fichiers par le menu du Scan ; ils restent sur l'appareil.
//
// Ce que fait le script :
//  1. télécharge une fois les bibliothèques (versions figées, empreinte vérifiée contre celle de scan.html) ;
//  2. précompile le JSX de scan.html → scan-app.js (plus de Babel dans le navigateur) ;
//  3. sort les scripts de la page dans des fichiers → politique de sécurité stricte : la page ne peut
//     appeler aucun autre serveur que celui qui la sert (balise Content-Security-Policy) ;
//  4. copie les données (data/, catalogue national) et écrit le service worker, les lanceurs et la notice.
//
// Le dossier produit n'est PAS versionné (.gitignore) : il contient les données de l'agence.
// scan.html reste la seule source : relancer le script après chaque mise à jour du Scan.
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ARGS = process.argv.slice(2);
const PUBLIC = ARGS.includes('--public');
// --site : site hébergé (dépôt privé publié par Cloudflare Pages…) AVEC les données de l'agence, catalogue compressé
// (.json.gz : limite de 25 Mo par fichier), sans lanceurs locaux
const SITE = !PUBLIC && ARGS.includes('--site');
const OUT = path.resolve(ARGS.find(a => !a.startsWith('--')) || path.join(ROOT, PUBLIC ? 'scan-public' : SITE ? 'scan-site' : 'scan-autonome'));
const CACHE = path.join(os.tmpdir(), 'prisme-scan-vendor');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

// Bibliothèques : [fichier dans vendor/, URL, rôle, licence]
const JSD = 'https://cdn.jsdelivr.net/npm/';
const LIBS = [
  ['react.production.min.js', 'https://unpkg.com/react@18.3.1/umd/react.production.min.js', 'React 18.3.1 — affichage', 'MIT'],
  ['react-dom.production.min.js', 'https://unpkg.com/react-dom@18.3.1/umd/react-dom.production.min.js', 'React DOM 18.3.1 — affichage', 'MIT'],
  ['zxing/index.js', JSD + 'zxing-wasm@3.0.3/dist/iife/reader/index.js', 'zxing-wasm 3.0.3 — lecture code-barres', 'MIT / Apache-2.0'],
  ['zxing/zxing_reader.wasm', JSD + 'zxing-wasm@3.0.3/dist/reader/zxing_reader.wasm', 'zxing-wasm 3.0.3 — moteur', 'MIT / Apache-2.0'],
  ['zbar/index.js', JSD + '@undecaf/zbar-wasm@0.11.0/dist/index.js', 'zbar-wasm 0.11.0 — lecture code-barres (2e lecteur)', 'LGPL-2.1'],
  ['zbar/zbar.wasm', JSD + '@undecaf/zbar-wasm@0.11.0/dist/zbar.wasm', 'zbar-wasm 0.11.0 — moteur', 'LGPL-2.1'],
];
const BABEL_URL = 'https://unpkg.com/@babel/standalone@7.29.0/babel.min.js'; // outil de build seulement, non livré
const FONTS_CSS = 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&family=JetBrains+Mono:wght@500;700;800&display=swap';

const sha384 = buf => 'sha384-' + createHash('sha384').update(buf).digest('base64');
const die = msg => { console.error('✕ ' + msg); process.exit(1); };

async function download(url) {
  const file = path.join(CACHE, createHash('sha1').update(url).digest('hex'));
  if (fs.existsSync(file)) return fs.readFileSync(file);
  for (let i = 1; ; i++) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': UA } });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const buf = Buffer.from(await r.arrayBuffer());
      fs.writeFileSync(file, buf);
      return buf;
    } catch (e) {
      if (i >= 4) die(`téléchargement impossible : ${url} (${e.message})`);
      await new Promise(res => setTimeout(res, 1500 * i));
    }
  }
}
function write(rel, content) {
  const f = path.join(OUT, rel);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, content);
}
/** Remplacement obligatoire : le build s'arrête si scan.html a changé à cet endroit. */
function swap(src, from, to, what) {
  const n = typeof from === 'string' ? src.split(from).length - 1 : (src.match(from) || []).length;
  if (!n) die(`scan.html a changé : « ${what} » introuvable — adapter tools/build-scan-autonome.mjs`);
  return typeof from === 'string' ? src.split(from).join(to) : src.replace(from, to);
}

fs.mkdirSync(CACHE, { recursive: true });
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

let html = fs.readFileSync(path.join(ROOT, 'scan.html'), 'utf8');
const version = (html.match(/const SCAN_VERSION = '([^']+)'/) || [])[1] || '?';
const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '');

// ── 1. Bibliothèques ─────────────────────────────────────────
console.log('→ Bibliothèques');
const inventory = [];
for (const [rel, url, role, licence] of LIBS) {
  const buf = await download(url);
  const hash = sha384(buf);
  // Empreinte déclarée dans scan.html pour cette URL : doit correspondre
  const declared = (html.match(new RegExp(url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '"\\s+integrity="([^"]+)"')) || [])[1];
  if (declared && declared !== hash) die(`empreinte inattendue pour ${url}`);
  write('vendor/' + rel, buf);
  inventory.push({ rel: 'vendor/' + rel, url, role, licence, hash, size: buf.length, verified: !!declared });
}

// ── 2. Polices (latin + latin étendu) ────────────────────────
console.log('→ Polices');
let css = (await download(FONTS_CSS)).toString('utf8');
const blocks = css.split('/* ').slice(1).filter(b => /^latin(-ext)? \*\//.test(b));
const fontFiles = new Map();
let fontCss = '';
for (const b of blocks) {
  const url = (b.match(/url\((https:[^)]+)\)/) || [])[1];
  if (!url) continue;
  if (!fontFiles.has(url)) {
    const fam = /JetBrains/.test(b) ? 'jetbrains-mono' : 'inter';
    const name = `${fam}-${/^latin-ext/.test(b) ? 'latin-ext' : 'latin'}.woff2`;
    const buf = await download(url);
    write('vendor/fonts/' + name, buf);
    fontFiles.set(url, name);
    inventory.push({ rel: 'vendor/fonts/' + name, url, role: `Police ${fam === 'inter' ? 'Inter' : 'JetBrains Mono'}`, licence: 'OFL-1.1', hash: sha384(buf), size: buf.length, verified: false });
  }
  fontCss += '/* ' + b.replace(url, fontFiles.get(url));
}
if (fontFiles.size < 2) die('polices : feuille Google Fonts inattendue');
write('vendor/fonts/fonts.css', fontCss);

// ── 3. Page : scripts sortis dans des fichiers, JSX précompilé ─
console.log('→ Page');
const CSP = "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; "
  + "img-src 'self' data: blob:; media-src 'self' blob:; font-src 'self'; connect-src 'self' data: blob:; "
  + "worker-src 'self' blob:; object-src 'none'; base-uri 'self'; form-action 'none'";

html = swap(html, /<link rel="preconnect"[^>]*>\n/g, '', 'preconnect polices');
html = swap(html, /<link href="https:\/\/fonts\.googleapis\.com[^>]*>/, '<link href="vendor/fonts/fonts.css" rel="stylesheet" />', 'feuille de polices');
html = swap(html, '<meta charset="UTF-8" />', `<meta charset="UTF-8" />\n<meta http-equiv="Content-Security-Policy" content="${CSP}" />`, 'meta charset');
const localSrc = {
  'https://unpkg.com/react@18.3.1/umd/react.production.min.js': 'vendor/react.production.min.js',
  'https://unpkg.com/react-dom@18.3.1/umd/react-dom.production.min.js': 'vendor/react-dom.production.min.js',
  [JSD + 'zxing-wasm@3.0.3/dist/iife/reader/index.js']: 'vendor/zxing/index.js',
  [JSD + '@undecaf/zbar-wasm@0.11.0/dist/index.js']: 'vendor/zbar/index.js',
};
for (const [url, rel] of Object.entries(localSrc)) {
  const h = inventory.find(x => x.rel === rel).hash;
  html = swap(html, new RegExp(`<script src="${url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"[^>]*></script>`), `<script src="${rel}" integrity="${h}"></script>`, rel);
}

// Scripts en ligne → fichiers
const scripts = [...html.matchAll(/<script(?![^>]*\bsrc=)([^>]*)>([\s\S]*?)<\/script>/g)];
if (scripts.length !== 3) die(`scan.html a changé : ${scripts.length} scripts en ligne au lieu de 3`);
const [boot, app, loader] = scripts;
if (!/serviceWorker/.test(boot[2]) || !/id="app-src"/.test(app[1]) || !/Babel/.test(loader[2])) die('scan.html a changé : ordre des scripts inattendu');

// Lecteur zxing : son moteur est dans vendor/ (par défaut il le demande à un CDN)
const bootJs = `// PRISME Scan autonome — démarrage (extrait de scan.html)
if (typeof ZXingWASM !== 'undefined') ZXingWASM.prepareZXingModule({ overrides: { locateFile: function (f) { return new URL('vendor/zxing/' + f, document.baseURI).href; } } });
` + swap(boot[2], /onclick="location\.reload\(\)"/g, 'data-reload="1"', 'bouton Recharger de l\'écran d\'erreur')
  + `// Écran d'erreur : bouton « Recharger » sans script en ligne (politique de sécurité)
document.addEventListener('click', function (e) { if (e.target && e.target.getAttribute && e.target.getAttribute('data-reload')) location.reload(); });
`;
write('scan-boot.js', bootJs);

let jsx = app[2];
if (!PUBLIC && !SITE) jsx = swap(jsx, /const SCAN_VERSION = '([^']+)'/, `const SCAN_VERSION = '$1 · autonome'`, 'version');

const babelFile = path.join(CACHE, 'babel.cjs');
fs.writeFileSync(babelFile, await download(BABEL_URL));
const Babel = createRequire(import.meta.url)(babelFile);
const appJs = Babel.transform(jsx, { presets: ['react'] }).code;
write('scan-app.js', `// PRISME Scan ${version} — code de l'application, compilé depuis scan.html (ne pas modifier ici)\n` + appJs + '\n');

html = html.replace(boot[0], '<script src="scan-boot.js"></script>')
  .replace(/<!-- Source JSX[^>]*-->\n/, '')
  .replace(app[0], '')
  .replace(loader[0], '<script src="scan-app.js"></script>');
const left = html.match(/https?:\/\/(?!www\.legallais\.com)[a-z0-9.-]+/gi);
if (left) die('adresses externes restantes dans la page : ' + [...new Set(left)].join(', '));
const leftJs = (appJs + bootJs).match(/https?:\/\/(?!www\.legallais\.com)[a-z0-9.-]+\.[a-z]{2,}/gi);
if (leftJs) die('adresses externes restantes dans le code : ' + [...new Set(leftJs)].join(', '));
write('scan.html', html);

// ── 4. Données, icônes, manifeste ────────────────────────────
console.log('→ Données');
const copy = (rel, to = rel) => { const f = path.join(ROOT, rel); if (!fs.existsSync(f)) die('fichier manquant : ' + rel); write(to, fs.readFileSync(f)); };
['manifest.json', 'icon-192.png', 'icon-512.png'].forEach(f => copy(f));
write('config.json', '{}\n');
const dataFiles = PUBLIC ? [] : JSON.parse(fs.readFileSync(path.join(ROOT, 'data/index.json'), 'utf8'));
if (PUBLIC) {
  // Aucune donnée : pas de fichier publié, pas de catalogue, constantes PRISME vides (libellés famille = catalogue chargé)
  write('data/index.json', '[]\n');
  write('js/constants.js', '// PRISME Scan public : aucune donnée embarquée.\nexport const FAMILLE_LOOKUP = {};\n');
  write('index.html', '<!DOCTYPE html>\n<html lang="fr"><head><meta charset="UTF-8"><meta http-equiv="refresh" content="0; url=scan.html"><title>PRISME Scan</title></head><body><a href="scan.html">PRISME Scan</a></body></html>\n');
  write('.nojekyll', '');
} else {
  ['js/constants.js', SITE ? 'js/catalogue-marques.json.gz' : 'js/catalogue-marques.json', 'data/index.json'].forEach(f => copy(f));
  if (SITE) {
    write('index.html', '<!DOCTYPE html>\n<html lang="fr"><head><meta charset="UTF-8"><meta http-equiv="refresh" content="0; url=scan.html"><title>PRISME Scan</title></head><body><a href="scan.html">PRISME Scan</a></body></html>\n');
    write('.nojekyll', '');
    // Cloudflare (Worker à fichiers statiques) : sans ce fichier, son build devine un framework (Hugo…) et échoue.
    // html_handling none : scan.html servi sous son nom (pas de redirection vers /scan, qui casserait le service worker)
    // workers_dev : adresse *.workers.dev ouverte — protégée par Cloudflare Access (application à créer dans Zero Trust
    // AVANT le premier déploiement, sinon les données sont publiques). preview_urls false : pas d'adresse par version.
    const ag = (dataFiles.map(f => (f.match(/prisme-scan-AG(\d+)\.json/) || [])[1]).find(Boolean)) || 'site';
    write('wrangler.jsonc', JSON.stringify({ name: 'scan' + ag, compatibility_date: '2026-11-18', workers_dev: true, preview_urls: false,
      assets: { directory: './', html_handling: 'none', not_found_handling: 'none' } }, null, 2) + '\n');
    write('.assetsignore', ['.git', '.gitignore', 'wrangler.jsonc', '.assetsignore', 'README.md', ''].join('\n'));
  }
  dataFiles.forEach(f => copy('data/' + f));
  // Page « Mise à jour Scan » (ZZAT → JSON) : sans les liens vers le reste de PRISME
  let upd = fs.readFileSync(path.join(ROOT, 'scan-update.html'), 'utf8');
  upd = swap(upd, /\s*<a class="muted" href="conv\.html">[^<]*<\/a>\s*<a class="muted" href="index\.html">[^<]*<\/a>/, '\n        <a class="muted" href="scan.html">Scan</a>', 'liens scan-update');
  if (/https?:\/\//.test(upd.replace(/http:\/\/www\.w3\.org[^"']*/g, ''))) die('scan-update.html appelle une adresse externe');
  write('scan-update.html', upd);
}

// ── 5. Service worker (hors ligne) ───────────────────────────
let sw = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
sw = swap(sw, /const CACHE_NAME = '[^']+';/, `const CACHE_NAME = 'prisme-scan-autonome-${stamp}';`, 'sw CACHE_NAME');
const shell = ['./scan.html', './scan-boot.js', './scan-app.js', './manifest.json', './config.json', './js/constants.js', './data/index.json',
  './vendor/fonts/fonts.css', ...[...fontFiles.values()].map(n => './vendor/fonts/' + n),
  ...inventory.filter(x => !x.rel.startsWith('vendor/fonts/')).map(x => './' + x.rel)];
sw = swap(sw, /const PRECACHE = \[[^\]]*\];/, `const PRECACHE = ${JSON.stringify(shell)};`, 'sw PRECACHE');
sw = swap(sw, /const CDN_HOSTS = \[[^\]]*\];/, 'const CDN_HOSTS = [];', 'sw CDN_HOSTS');
// Bibliothèques locales (vendor/) : cache d'abord — le nom du cache change à chaque build
sw = swap(sw, "  if (url.origin === self.location.origin) {\n    e.respondWith(networkFirst(req));",
  "  if (url.origin === self.location.origin) {\n    e.respondWith(url.pathname.includes('/vendor/') ? cacheFirst(req) : networkFirst(req));", 'sw fetch');
write('sw.js', sw);

if (!PUBLIC && !SITE) {
// ── 6. Lanceurs ──────────────────────────────────────────────
write('Lancer le Scan.bat', [
  '@echo off', 'rem PRISME Scan autonome - petit serveur local (Windows, rien a installer)', 'cd /d "%~dp0"',
  'powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0serveur.ps1" %*',
  'if errorlevel 1 pause', ''].join('\r\n'));
write('serveur.ps1', `# PRISME Scan autonome — petit serveur de fichiers local (PowerShell, rien à installer).
# N'écoute que sur ce poste (localhost) : aucune ouverture réseau, aucun droit administrateur.
param([int]$Port = 8000, [switch]$NoBrowser)
$ErrorActionPreference = 'Stop'
$root = [System.IO.Path]::GetFullPath($PSScriptRoot)
$mime = @{ '.html'='text/html; charset=utf-8'; '.js'='text/javascript; charset=utf-8'; '.mjs'='text/javascript; charset=utf-8';
  '.json'='application/json; charset=utf-8'; '.css'='text/css; charset=utf-8'; '.wasm'='application/wasm'; '.png'='image/png';
  '.woff2'='font/woff2'; '.txt'='text/plain; charset=utf-8'; '.onnx'='application/octet-stream'; '.csv'='text/csv; charset=utf-8' }
# Port déjà pris : soit le Scan tourne déjà (fenêtre du serveur restée ouverte) → on rouvre simplement la page,
# soit un autre logiciel l'occupe → on essaie les ports suivants.
$listener = $null
foreach ($p in $Port..($Port + 9)) {
  $l = New-Object System.Net.HttpListener
  $l.Prefixes.Add("http://localhost:$p/")
  try { $l.Start(); $listener = $l; $Port = $p; break } catch {
    try { $l.Close() } catch {}
    $deja = $false
    try { $r = Invoke-WebRequest -Uri "http://localhost:$p/scan.html" -UseBasicParsing -TimeoutSec 3; $deja = ($r.Content -match 'PRISME Scan') } catch {}
    if ($deja) {
      Write-Host "Le Scan tourne deja sur ce poste : http://localhost:$p/scan.html"
      if (-not $NoBrowser) { Start-Process "http://localhost:$p/scan.html" }
      Start-Sleep -Seconds 3
      exit 0
    }
  }
}
if (-not $listener) { Write-Host "Aucun port libre entre $Port et $($Port + 9)."; exit 1 }
$url = "http://localhost:$Port/scan.html"
Write-Host "PRISME Scan : $url"
Write-Host "Laisser cette fenetre ouverte. Ctrl+C ou fermer la fenetre pour arreter."
if (-not $NoBrowser) { Start-Process $url }
try {
  while ($listener.IsListening) {
    $ctx = $listener.GetContext()
    $res = $ctx.Response
    try {
      $rel = [System.Uri]::UnescapeDataString($ctx.Request.Url.AbsolutePath).TrimStart('/')
      if ($rel -eq '') { $rel = 'scan.html' }
      $file = [System.IO.Path]::GetFullPath((Join-Path $root $rel))
      $inside = $file.StartsWith($root + [System.IO.Path]::DirectorySeparatorChar)
      if ($inside -and [System.IO.File]::Exists($file)) {
        $info = New-Object System.IO.FileInfo $file
        $etag = '"' + $info.Length + '-' + $info.LastWriteTimeUtc.Ticks + '"'
        $ext = $info.Extension.ToLower()
        $res.ContentType = if ($mime.ContainsKey($ext)) { $mime[$ext] } else { 'application/octet-stream' }
        $res.Headers['ETag'] = $etag
        $res.Headers['Cache-Control'] = 'no-cache'
        $res.Headers['X-Content-Type-Options'] = 'nosniff'
        if ($ctx.Request.Headers['If-None-Match'] -eq $etag) { $res.StatusCode = 304 }
        else {
          $res.ContentLength64 = $info.Length
          if ($ctx.Request.HttpMethod -ne 'HEAD') {
            $fs = [System.IO.File]::OpenRead($file)
            try { $fs.CopyTo($res.OutputStream) } finally { $fs.Dispose() }
          }
        }
      } else { $res.StatusCode = 404 }
    } catch { try { $res.StatusCode = 500 } catch {} }
    finally { try { $res.Close() } catch {} }
  }
} finally { $listener.Stop() }
`);
write('lancer.sh', `#!/bin/sh
# PRISME Scan autonome — serveur local (Mac / Linux). N'écoute que sur ce poste.
cd "$(dirname "$0")" || exit 1
PORT="\${1:-8000}"
echo "PRISME Scan : http://localhost:$PORT/scan.html   (Ctrl+C pour arrêter)"
( sleep 1; (command -v open >/dev/null && open "http://localhost:$PORT/scan.html") || (command -v xdg-open >/dev/null && xdg-open "http://localhost:$PORT/scan.html") ) >/dev/null 2>&1 &
exec python3 -m http.server "$PORT" --bind 127.0.0.1
`);
fs.chmodSync(path.join(OUT, 'lancer.sh'), 0o755);

}

// ── 7. Notice + inventaire des dépendances ───────────────────
const fmt = n => n >= 1048576 ? (n / 1048576).toFixed(1).replace('.', ',') + ' Mo' : Math.max(1, Math.round(n / 1024)) + ' Ko';
const meta = dataFiles.map(f => {
  const d = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', f), 'utf8'));
  const day = t => t ? new Date(t).toLocaleDateString('fr-FR') : '?';
  return `- data/${f} : agence ${d.store || '?'}, ${(d.articles || []).length.toLocaleString('fr-FR')} articles, stock du ${day(d.stockTs)}, ventes jusqu'au ${day(d.dataDate)}, ${Object.keys(d.ean || {}).length.toLocaleString('fr-FR')} codes-barres`;
});
const cat = PUBLIC ? {} : JSON.parse(fs.readFileSync(path.join(ROOT, 'js/catalogue-marques.json'), 'utf8'));
const CTX_STORE = () => dataFiles.map(f => (f.match(/prisme-scan-(.+)\.json/) || [])[1]).filter(Boolean).join(', ') || 'agence';
write('DEPENDANCES.txt', `PRISME Scan autonome — bibliothèques embarquées (dossier vendor/)
Build du ${new Date().toLocaleString('fr-FR')} — Scan ${version}

Toutes les bibliothèques sont des logiciels libres, copiés une fois dans ce dossier à une version figée.
« vérifiée » = l'empreinte correspond à celle déclarée dans le code source du Scan.

${inventory.map(x => `${x.rel}  (${fmt(x.size)})\n    ${x.role} — licence ${x.licence}\n    origine : ${x.url}\n    ${x.hash}${x.verified ? '  (vérifiée)' : ''}`).join('\n\n')}
`);
if (SITE) write('README.md', `# PRISME Scan — ${CTX_STORE()}

Site du Scan **avec les données de l'agence** (Scan ${version}). Dépôt **privé** : ne pas le rendre public.

${meta.join('\n')}

Publié par Cloudflare Pages (aucune commande de build, dossier publié = racine). Accès protégé par Cloudflare Access.

Dossier généré par \`tools/build-scan-autonome.mjs --site\` depuis le dépôt Prisme — ne pas modifier à la main : relancer le build puis pousser.
`);
else if (!PUBLIC) write('LISEZMOI.txt', `PRISME Scan — version autonome
Scan ${version} · dossier construit le ${new Date().toLocaleDateString('fr-FR')}

Le Scan sert à auditer le rayon : on scanne une étiquette ou un code-barres, on voit le stock,
le mini/maxi et quoi faire de l'article ; on note les actions et on fait l'inventaire d'une zone.

LANCER
  Windows     : double-clic sur « Lancer le Scan.bat »
  Mac / Linux : ./lancer.sh        (demande Python 3)
  La page s'ouvre sur http://localhost:8000/scan.html
  Laisser la fenêtre noire du serveur ouverte tant qu'on utilise le Scan.
  Page fermée par erreur ? Relancer « Lancer le Scan.bat » : il rouvre la page (le serveur tourne déjà).
  Sur un écran large, le Scan passe en mode PC (recherche au clavier / douchette).
  Pour voir l'affichage téléphone sur un PC : réduire la largeur de la fenêtre puis recharger.

CE QUE CONTIENT LE DOSSIER
  scan.html, scan-app.js, scan-boot.js                l'application
  sw.js, manifest.json, icônes                        fonctionnement hors ligne / installation sur l'écran d'accueil
  vendor/                                             bibliothèques libres embarquées (voir DEPENDANCES.txt)
  data/                                               les données de l'agence
  js/catalogue-marques.json                           le catalogue national
  scan-update.html                                    mise à jour du stock à partir d'un export ZZAT
  serveur.ps1, Lancer le Scan.bat, lancer.sh          petit serveur local (lecture seule, ce poste uniquement)

LES DONNÉES
${meta.join('\n')}
- js/catalogue-marques.json : ${Object.keys(cat.A || {}).length.toLocaleString('fr-FR')} articles du catalogue national, ${Object.keys(cat.E || {}).length.toLocaleString('fr-FR')} codes-barres, ${(cat.M || []).length} fournisseurs
  Ni prix, ni client, ni chiffre d'affaires dans ces fichiers.

METTRE À JOUR LE STOCK (usage quotidien)
  - Dans le Scan : menu > importer l'export ZZAT du jour (reste dans le navigateur du poste).
  - Ou pour tous les postes : scan-update.html fabrique un nouveau fichier data/prisme-scan-AGxx.json
    à partir de l'export ZZAT ; remplacer le fichier dans data/.

CE QUE LE SCAN FAIT ET NE FAIT PAS
  - Aucune connexion à l'ERP ni à un serveur : il lit des fichiers exportés, il n'écrit nulle part.
  - Aucun appel vers l'extérieur : la page porte une politique de sécurité (Content-Security-Policy)
    qui interdit au navigateur de contacter un autre serveur que celui qui la sert.
    Seule exception voulue : le lien « voir sur legallais.com » ouvre le site dans un nouvel onglet.
  - La caméra est traitée dans le navigateur ; aucune image ne sort de l'appareil.
  - Les actions notées, l'inventaire en cours et les notes restent dans le navigateur de l'appareil
    (export en fichier CSV depuis le Scan).

SUR TÉLÉPHONE
  Les navigateurs n'autorisent la caméra que sur une adresse sécurisée (https) ou sur localhost.
  Pour l'utiliser sur les téléphones du magasin sans passer par internet, il faut déposer ce dossier
  sur un serveur interne en https — c'est la seule chose à demander à l'informatique.
  Le dossier est statique : n'importe quel serveur web convient, sans base de données ni programme côté serveur.
`);
else write('README.md', `# PRISME Scan

Application web d'audit de rayon : on scanne un code-barres, on retrouve la référence interne, le stock, le mini/maxi et quoi faire de l'article.

Ce dépôt ne contient **que le code** (Scan ${version}). Il n'embarque **aucune donnée** : ni stock, ni codes-barres, ni catalogue.

## Utilisation

1. Ouvrir le site (\`scan.html\`) sur le téléphone ou le PC.
2. Menu › **Charger un fichier de données** : choisir le fichier Scan de l'agence (export PRISME \`prisme-scan-AGxx.json\`) et, si besoin, le catalogue.
3. Les fichiers restent dans le navigateur de l'appareil (IndexedDB) : rien n'est envoyé. « Effacer les fichiers chargés » les retire.

Le stock du jour se met à jour en chargeant l'export ZZAT (CSV) par le même menu.

## Sécurité

- Aucun serveur applicatif, aucune base de données : fichiers statiques seulement.
- La page porte une politique de sécurité (Content-Security-Policy) qui interdit tout appel vers un autre serveur que celui qui la sert.
- Bibliothèques libres embarquées à version figée : voir \`DEPENDANCES.txt\`.
- La caméra est traitée dans le navigateur ; aucune image ne sort de l'appareil.

Dossier généré par \`tools/build-scan-autonome.mjs --public\` — ne pas modifier à la main.
`);

const total = (function walk(d) { return fs.readdirSync(d, { withFileTypes: true }).reduce((s, e) => s + (e.isDirectory() ? walk(path.join(d, e.name)) : fs.statSync(path.join(d, e.name)).size), 0); })(OUT);
console.log(`✓ ${path.relative(process.cwd(), OUT) || OUT} — Scan ${version}, ${fmt(total)}`);
