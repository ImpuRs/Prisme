// Lance le moteur de Code.gs sur la base hors Google.
// Usage : node Gally/tests/lancer-tests.js chemin/ARTICLES.csv ["question libre" ...]
// Sans question : rejoue TESTS.csv. ALIAS non chargé (dictionnaire vide).
// Colonnes CATALOGUE (16) / PAGE_CATALOGUE (17) utilisées si présentes (voir outils/catalogue).
// SANS_CATALOGUE=1 pour comparer sans.
const fs=require('fs');const E=require(require('path').join(__dirname,'..','Code.gs'));
function parseCSV(t){const rows=[];let r=[],f='',q=false;for(let i=0;i<t.length;i++){const c=t[i];if(q){if(c=='"'){if(t[i+1]=='"'){f+='"';i++}else q=false}else f+=c}else if(c=='"')q=true;else if(c==','){r.push(f);f=''}else if(c=='\n'){r.push(f);rows.push(r);r=[];f=''}else if(c!='\r')f+=c}if(f||r.length){r.push(f);rows.push(r)}return rows}
const rows=parseCSV(fs.readFileSync(process.argv[2],'utf8'));rows.shift();
const memo={};
const index={cle:rows.map(r=>r[13]),rang:rows.map(r=>+r[14]||0),sousFamille:rows.map(r=>r[6]),marque:rows.map(r=>r[2]),
 catalogue:(rows[0].length>15&&!process.env.SANS_CATALOGUE)?rows.map(r=>r[15]||''):null,
 famille:rows.map(r=>{const k=r[5]+'|'+r[6];return memo[k]||(memo[k]=E.normaliser(r[5].replace(/^\S+\s/,'')+' '+r[6]))})};
const byCode={},byEan={};rows.forEach((r,i)=>{(byCode[r[0]]=byCode[r[0]]||[]).push(i);if(r[4])(byEan[r[4]]=byEan[r[4]]||[]).push(i)});
const refs=rows.map(r=>r[3].toUpperCase().replace(/[^A-Z0-9]/g,''));
function rid(id){const c=id.replace(/[^A-Z0-9]/gi,'').toUpperCase(),s=new Set();if(/^\d+$/.test(c)){(byCode[c]||[]).forEach(i=>s.add(i));(byEan[c]||[]).forEach(i=>s.add(i))}refs.forEach((r,i)=>{if(r===c)s.add(i)});return [...s]}

const qs=process.argv.slice(3);
const tests=qs.length?qs.map(q=>[q,'?']):parseCSV(fs.readFileSync(require('path').join(__dirname,'TESTS.csv'),'utf8')).slice(1).filter(r=>r[0]);
let ok=0;for(const [q,att] of tests){const t=Date.now();const res=E.moteur(q,index,{},rid,[]);const codes=res.lignes.slice(0,5).map(i=>rows[i][0]);
const bon=/^[A-Z]+$/.test(att)?att===res.type:att.split(',').every(c=>codes.includes(c.trim()));if(bon)ok++;
console.log((bon?'OK ':'XX ')+q.padEnd(45)+res.type.padEnd(12)+String(res.total).padEnd(6)+codes.map(c=>c+' '+rows[byCode[c][0]][1].slice(0,30)).join(' | ').slice(0,160)+' ['+(Date.now()-t)+'ms]')}
console.log(ok+'/'+tests.length);
