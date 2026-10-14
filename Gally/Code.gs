/**
 * ASSISTANT VENDEUR — V0 (moteur de recherche articles)
 * ------------------------------------------------------
 * Principe : l'IA ne choisit jamais un article. La recherche est déterministe :
 *   1. identifiants (code article, EAN, réf. fournisseur) → correspondance exacte
 *   2. sinon mots-clés → tous les mots doivent être présents (désignation, marque,
 *      réf., famille, sous-famille, texte du catalogue papier), avec un dictionnaire
 *      d'abréviations (onglet ALIAS)
 *   3. 4 issues possibles : TROUVE / PLUSIEURS / DOUBLON / INTROUVABLE
 *      → si plusieurs, on demande un critère au vendeur au lieu de trancher.
 *
 * Onglets attendus dans le classeur :
 *   ARTICLES  (import de ARTICLES.csv)
 *   ALIAS     (import de ALIAS.csv)
 *   TESTS     (créé automatiquement par le menu)
 */

// ============================== CONFIGURATION ==============================
var CONFIG = {
  ONGLET_ARTICLES: 'ARTICLES',
  ONGLET_ALIAS: 'ALIAS',
  ONGLET_TESTS: 'TESTS',
  // Numéros de colonnes (1 = A) dans ARTICLES
  COL: {
    CODE: 1, DESIGNATION: 2, MARQUE: 3, REF: 4, EAN: 5, FAMILLE: 6, SOUS_FAMILLE: 7,
    STATUT: 8, STOCK: 9, UNITE: 10, PRIX: 11, JUSQU_AU: 12, ETAT: 13, CLE: 14, RANG: 15,
    CATALOGUE: 16, PAGE_CATALOGUE: 17   // texte du catalogue papier rattaché au code (vide si absent du catalogue)
  },
  NB_PROPOSITIONS: 5,       // nombre d'articles affichés quand il y a plusieurs résultats
  UTILISER_GEMINI: false,   // V0 : false. Passer à true quand la clé est validée par l'IT
  MODELE_GEMINI: 'gemini-2.5-flash'
};

var MOTS_VIDES = ('A AU AUX AVEC BONJOUR CA CE CES CETTE CHERCHE CHERCHER CLIENT COMBIEN CODE DANS DE DES DU EL ELLE EN EST ET ' +
  'FAUT IL JE JAI LA LE LES LEUR MA ME MERCI MES MOI MON NE NOUS ON OU PAR PAS PEUT POUR PRIX QUE QUEL QUELLE QUI ' +
  'REF REFERENCE SA SE SES SI SON SUR SVP TU UN UNE VEUT VOUDRAIT VOUS Y ARTICLE PRODUIT TROUVER AS AVEZ AVONS ' +
  'IL Y A T STP CEST QUOI EXISTE DISPO DISPONIBLE').split(' ');

// ======================= FONCTIONS PURES (testables) =======================

/** Normalise un texte exactement comme la colonne CLE_DESIGNATION. */
function normaliser(s) {
  s = String(s || '').toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  s = s.replace(/(\d)\.(?=\d)/g, '$1,');            // 3.5 → 3,5 (décimale française)
  s = s.replace(/(?<!\d),|,(?!\d)/g, ' ');           // virgule hors nombre → espace
  s = s.replace(/[^A-Z0-9,]+/g, ' ');
  s = s.replace(/(\d)([A-Z]{3,})/g, '$1 $2');      // 120X80BLANC → 120X80 BLANC
  return s.replace(/\s+/g, ' ').trim();
}

/** Un mot ressemble-t-il à un identifiant (code, EAN, réf. fournisseur) ? */
function estIdentifiant(mot) {
  return /\d/.test(mot) && mot.length >= 4 && !/^\d+,\d+$/.test(mot) && !/^\d+X\d+/.test(mot);
}

/** Découpe la question en identifiants potentiels et mots-clés utiles. */
function analyserQuestion(question) {
  var brut = String(question || '').toUpperCase().split(/\s+/).filter(String);
  var ids = brut.map(function (m) { return m.replace(/^[^A-Z0-9]+|[^A-Z0-9]+$/g, ''); })
                .filter(function (m) { return estIdentifiant(m.replace(/[^A-Z0-9]/g, '')); });
  var mots = normaliser(question).split(' ').filter(function (m) {
    return m && MOTS_VIDES.indexOf(m) < 0 && !(m.length === 1 && !/\d/.test(m));
  });
  return { identifiants: ids, mots: mots };
}

/**
 * Construit le motif d'un mot : le mot (ou son singulier) en début de mot de la clé,
 * ou un de ses équivalents de l'onglet ALIAS en mot entier.
 */
function construireMotif(mot, alias) {
  var racine = (mot.length > 4 && /[SX]$/.test(mot) && !/\d/.test(mot)) ? mot.slice(0, -1) : mot;
  var nombrePur = /^[\d,]+$/.test(mot);              // 40 ne doit pas trouver 400
  return {
    mot: mot,
    prefixe: nombrePur ? null : ' ' + racine,           // CHAUSSURES → " CHAUSSURE", 30X40 → "30X40VAR"
    exacts: [' ' + mot + ' '].concat((alias[mot] || alias[racine] || []).map(function (a) { return ' ' + a + ' '; }))
  };
}

function motifPresent(cle, motif) {
  if (motif.prefixe && cle.indexOf(motif.prefixe) >= 0) return true;
  for (var i = 0; i < motif.exacts.length; i++) if (cle.indexOf(motif.exacts[i]) >= 0) return true;
  return false;
}

/**
 * Recherche par mots-clés dans l'index.
 * index = { cle: [..], famille: [..], catalogue: [..], rang: [..], sousFamille: [..], marque: [..] } (tableaux alignés)
 * Un mot trouvé dans la désignation vaut 2, dans la famille ou le texte du catalogue 1.
 * rang = bonus précalculé : article actif +5, stocké +3, composant technique -4.
 * Renvoie les numéros de lignes (0 = première ligne de données) triés par pertinence.
 */
function chercherMotsCles(index, mots, alias) {
  var motifs = mots.map(function (m) { return construireMotif(m, alias); });
  var resultats = [];
  for (var i = 0; i < index.cle.length; i++) {
    var cle = ' ' + index.cle[i] + ' ';
    var fam = null, cat = null, score = 0, ok = true;
    for (var j = 0; j < motifs.length; j++) {
      if (motifPresent(cle, motifs[j])) { score += 2; continue; }
      if (fam === null) fam = ' ' + index.famille[i] + ' ';
      if (motifPresent(fam, motifs[j])) { score += 1; continue; }
      if (cat === null) cat = index.catalogue ? ' ' + (index.catalogue[i] || '') + ' ' : '';
      if (cat.length > 2 && motifPresent(cat, motifs[j])) { score += 1; continue; }
      ok = false; break;
    }
    if (!ok) continue;
    resultats.push([i, score + index.rang[i] / 10, index.cle[i].length]);
  }
  resultats.sort(function (a, b) { return b[1] - a[1] || a[2] - b[2]; });
  return resultats.map(function (r) { return r[0]; });
}

/** Si aucun résultat : on retire un mot à la fois et on garde la meilleure piste (marquée « approchant »). */
function chercherApprochants(index, mots, alias) {
  if (mots.length < 3) return { lignes: [], motIgnore: null };   // au moins 2 mots doivent rester
  var meilleur = { lignes: [], motIgnore: null };
  for (var k = 0; k < mots.length; k++) {
    var sous = mots.slice(0, k).concat(mots.slice(k + 1));
    var l = chercherMotsCles(index, sous, alias);
    if (l.length && (!meilleur.lignes.length || l.length < meilleur.lignes.length)) meilleur = { lignes: l, motIgnore: mots[k] };
  }
  return meilleur;
}

/** Propose le critère qui départage le mieux les résultats (sous-famille, puis marque). */
function critereDepartage(lignes, index) {
  var axes = [['sous-famille', index.sousFamille], ['marque', index.marque]];
  for (var a = 0; a < axes.length; a++) {
    var compte = {};
    lignes.forEach(function (i) { var v = axes[a][1][i]; compte[v] = (compte[v] || 0) + 1; });
    var valeurs = Object.keys(compte).sort(function (x, y) { return compte[y] - compte[x]; });
    if (valeurs.length > 1) {
      return { axe: axes[a][0], bruts: valeurs.slice(0, 6), comptes: valeurs.slice(0, 6).map(function (v) { return compte[v]; }),
               valeurs: valeurs.slice(0, 6).map(function (v) { return v + ' (' + compte[v] + ')'; }) };
    }
  }
  return null;
}

/**
 * Cœur du moteur. rechercherIdentifiant(id) → tableau de numéros de lignes (exact).
 * Renvoie { type, lignes, total, motIgnore, departage, recherche }.
 */
function appliquerFiltres(lignes, index, filtres) {
  (filtres || []).forEach(function (f) {
    var col = f.axe === 'marque' ? index.marque : index.sousFamille;
    lignes = lignes.filter(function (i) { return col[i] === f.valeur; });
  });
  return lignes;
}

function moteur(question, index, alias, rechercherIdentifiant, filtres) {
  var a = analyserQuestion(question);

  // 1. Identifiants : correspondance exacte
  for (var k = 0; k < a.identifiants.length; k++) {
    var trouves = rechercherIdentifiant(a.identifiants[k]);
    if (trouves.length > 1) {
      // Plusieurs articles pour cet identifiant : les autres mots de la question peuvent départager
      var idNorm = normaliser(a.identifiants[k]).split(' ');
      var autres = a.mots.filter(function (m) { return idNorm.indexOf(m) < 0; });
      if (autres.length) {
        var motifs = autres.map(function (m) { return construireMotif(m, alias); });
        var filtres = trouves.filter(function (i) {
          var cle = ' ' + index.cle[i] + ' ', fam = ' ' + index.famille[i] + ' ',
              cat = index.catalogue ? ' ' + (index.catalogue[i] || '') + ' ' : '';
          return motifs.every(function (mo) { return motifPresent(cle, mo) || motifPresent(fam, mo) || motifPresent(cat, mo); });
        });
        if (filtres.length) trouves = filtres;
      }
    }
    if (trouves.length === 1) return { type: 'TROUVE', lignes: trouves, total: 1, recherche: a.identifiants[k] };
    if (trouves.length > 1) return { type: 'DOUBLON', lignes: trouves, total: trouves.length, recherche: a.identifiants[k] };
  }

  // 2. Mots-clés
  if (!a.mots.length) return { type: 'VIDE', lignes: [], total: 0 };
  var lignes = appliquerFiltres(chercherMotsCles(index, a.mots, alias), index, filtres);
  if (lignes.length === 1) return { type: 'TROUVE', lignes: lignes, total: 1, recherche: a.mots.join(' ') };
  if (lignes.length > 1) {
    return { type: 'PLUSIEURS', lignes: lignes, total: lignes.length, recherche: a.mots.join(' '),
             departage: critereDepartage(lignes, index) };
  }
  var approx = chercherApprochants(index, a.mots, alias);
  approx.lignes = appliquerFiltres(approx.lignes, index, filtres);
  return { type: 'INTROUVABLE', lignes: approx.lignes, total: approx.lignes.length,
           motIgnore: approx.motIgnore, recherche: a.mots.join(' ') };
}

/** Met en forme une fiche article (ligne = tableau de valeurs de l'onglet ARTICLES). */
function ficheArticle(v) {
  var C = CONFIG.COL, alertes = [];
  if (v[C.STATUT - 1] !== 'Normal') alertes.push('⚠️ ' + v[C.STATUT - 1]);
  if (v[C.JUSQU_AU - 1]) alertes.push('commandable jusqu\'au ' + v[C.JUSQU_AU - 1]);
  return '*' + v[C.CODE - 1] + '* — ' + v[C.DESIGNATION - 1] + '\n' +
    '   ' + v[C.MARQUE - 1] + ' · réf. ' + v[C.REF - 1] + (v[C.EAN - 1] ? ' · EAN ' + v[C.EAN - 1] : '') + '\n' +
    '   ' + v[C.STOCK - 1] + ' · ' + v[C.PRIX - 1] + ' € HT public / ' + v[C.UNITE - 1] +
    (alertes.length ? '\n   ' + alertes.join(' · ') : '');
}

/** Rédige la réponse (gabarit fixe : aucun chiffre ni référence n'est inventé). */
function rediger(res, lignesValeurs) {
  var fiches = lignesValeurs.map(ficheArticle).join('\n\n');
  switch (res.type) {
    case 'TROUVE':
      return '✅ Article trouvé :\n\n' + fiches;
    case 'DOUBLON':
      return '⚠️ « ' + res.recherche + ' » correspond à ' + res.total + ' codes article différents. ' +
        'Vérifie lequel est le bon avant de commander :\n\n' + fiches;
    case 'PLUSIEURS':
      var q = res.departage ? '\n\n👉 Pour affiner, précise la ' + res.departage.axe + ' : ' + res.departage.valeurs.join(', ') +
        ', ou ajoute un mot (dimension, finition, couleur…).' : '\n\n👉 Ajoute un critère (dimension, finition, marque…).';
      return '🔎 ' + res.total + ' articles correspondent à « ' + res.recherche + ' ». Les ' + lignesValeurs.length +
        ' plus pertinents :\n\n' + fiches + q;
    case 'INTROUVABLE':
      if (!lignesValeurs.length) return '❌ Aucun article ne correspond à « ' + res.recherche + ' ». ' +
        'Essaie avec le code article, l\'EAN, la réf. fournisseur ou moins de mots.';
      return '❌ Rien avec tous les mots « ' + res.recherche + ' ». En ignorant « ' + res.motIgnore + ' », ' +
        res.total + ' résultat(s) approchant(s) — à vérifier :\n\n' + fiches;
    default:
      return 'Donne-moi un code article, un EAN, une réf. fournisseur ou quelques mots-clés.';
  }
}

// ============================ ACCÈS GOOGLE SHEETS ===========================

var _index = null, _alias = null;

/** Classeur : actif (menu) ou retrouvé par son ID (page web). L'ID est mémorisé à l'ouverture du classeur. */
function classeur_() {
  var ss = null;
  try { ss = SpreadsheetApp.getActive(); } catch (e) {}
  if (ss) return ss;
  var id = PropertiesService.getScriptProperties().getProperty('ID_CLASSEUR');
  if (!id) throw new Error('Ouvre une fois le classeur (ou lance « memoriserClasseur ») avant d\'utiliser la page web.');
  return SpreadsheetApp.openById(id);
}

function memoriserClasseur() {
  PropertiesService.getScriptProperties().setProperty('ID_CLASSEUR', SpreadsheetApp.getActive().getId());
}

function feuille_(nom) {
  var f = classeur_().getSheetByName(nom);
  if (!f) throw new Error('Onglet introuvable : ' + nom);
  return f;
}

function lireColonne_(f, col, n) {
  return f.getRange(2, col, n, 1).getValues().map(function (r) { return String(r[0]); });
}

/** Charge les colonnes utiles à la recherche (une seule fois par exécution). */
function chargerIndex_() {
  if (_index) return _index;
  // 2 lectures groupées seulement (FAMILLE+SOUS_FAMILLE, CLE+RANG+CATALOGUE) pour limiter le temps de réponse
  var f = feuille_(CONFIG.ONGLET_ARTICLES), n = f.getLastRow() - 1, C = CONFIG.COL, memo = {};
  var avecCatalogue = f.getLastColumn() >= C.CATALOGUE;
  var fs = f.getRange(2, C.FAMILLE, n, 2).getValues(), cr = f.getRange(2, C.CLE, n, avecCatalogue ? 3 : 2).getValues();
  _index = {
    cle: cr.map(function (r) { return String(r[0]); }),
    rang: cr.map(function (r) { return Number(r[1]) || 0; }),
    catalogue: avecCatalogue ? cr.map(function (r) { return String(r[2]); }) : null,
    sousFamille: fs.map(function (r) { return String(r[1]); }),
    famille: fs.map(function (r) {
      var k = r[0] + '|' + r[1];
      return memo[k] || (memo[k] = normaliser(String(r[0]).replace(/^\S+\s/, '') + ' ' + r[1]));
    })
  };
  var marques = null;   // lue seulement si on en a besoin pour départager
  Object.defineProperty(_index, 'marque', { get: function () { return marques || (marques = lireColonne_(f, C.MARQUE, n)); } });
  return _index;
}

/** Dictionnaire ALIAS : Terme_vendeur → [équivalents]. */
function chargerAlias_() {
  if (_alias) return _alias;
  _alias = {};
  var f = classeur_().getSheetByName(CONFIG.ONGLET_ALIAS);
  if (!f || f.getLastRow() < 2) return _alias;
  f.getRange(2, 1, f.getLastRow() - 1, 2).getValues().forEach(function (r) {
    var terme = normaliser(r[0]);
    if (!terme) return;
    if (terme.indexOf(' ') >= 0) return;   // un seul mot par terme (les expressions passent par la sous-famille)
    _alias[terme] = String(r[1]).split('|').map(normaliser).filter(String);
  });
  return _alias;
}

/** Recherche exacte d'un identifiant via TextFinder (rapide, côté serveur). */
function rechercherIdentifiantSheets_(id) {
  var f = feuille_(CONFIG.ONGLET_ARTICLES), n = f.getLastRow() - 1, C = CONFIG.COL, lignes = {};
  var compact = id.replace(/[^A-Z0-9]/gi, '');
  function chercher(col, texte, regex) {
    var tf = f.getRange(2, col, n, 1).createTextFinder(texte).matchEntireCell(true).matchCase(false);
    if (regex) tf.useRegularExpression(true);
    tf.findAll().forEach(function (r) { lignes[r.getRow() - 2] = true; });
  }
  if (/^\d+$/.test(compact)) { chercher(C.CODE, compact); chercher(C.EAN, compact); }
  // Réf. fournisseur : tolère les séparateurs (CQ135161 trouve CQ.13516.1)
  chercher(C.REF, compact.split('').join('[^A-Za-z0-9]*'), true);
  return Object.keys(lignes).map(Number);
}

function lireLignes_(lignes) {
  var f = feuille_(CONFIG.ONGLET_ARTICLES), nb = Math.min(f.getLastColumn(), CONFIG.COL.PAGE_CATALOGUE);
  return lignes.map(function (i) { return f.getRange(i + 2, 1, 1, nb).getDisplayValues()[0]; });
}

/** Point d'entrée unique : question → réponse texte + résultat structuré. */
function repondre(question, filtres) {
  var texte = question;
  if (CONFIG.UTILISER_GEMINI) {
    try { texte = interpreterAvecGemini_(question); } catch (e) { console.warn('Gemini indisponible : ' + e); }
  }
  var res = moteur(texte, chargerIndex_(), chargerAlias_(), rechercherIdentifiantSheets_, filtres);
  var montrer = res.type === 'DOUBLON' ? res.lignes : res.lignes.slice(0, CONFIG.NB_PROPOSITIONS);
  var valeurs = lireLignes_(montrer);
  return { resultat: res, valeurs: valeurs, reponse: rediger(res, valeurs) };
}


// ======================= PAGE DE CHAT (application web) ======================
/**
 * Déploiement : Déployer > Nouveau déploiement > Application Web
 *   Exécuter en tant que : Moi · Accès : utilisateurs de ton domaine.
 * Les vendeurs ouvrent l'URL (PC ou téléphone) : pas besoin d'accès au classeur.
 * Le jour où Gemini est validé : CONFIG.UTILISER_GEMINI = true + clé GEMINI_API_KEY.
 * Rien d'autre ne change : la page appelle toujours chatRepondre().
 */
function doGet() {
  return HtmlService.createHtmlOutputFromFile('Chat')
    .setTitle('Assistant vendeur')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/** Un message affine-t-il la recherche précédente (« blanc », « geze », une sous-famille…) ? */
function estAffinage(message, contexte) {
  if (!contexte || contexte.type !== 'PLUSIEURS' || !contexte.recherche) return false;
  var a = analyserQuestion(message);
  return a.identifiants.length === 0 && a.mots.length > 0 && a.mots.length <= 4;
}

function introChat(res, nbAffiches) {
  switch (res.type) {
    case 'TROUVE': return 'Article trouvé.';
    case 'DOUBLON': return '« ' + res.recherche + ' » correspond à ' + res.total + ' codes article différents. Vérifie lequel est le bon avant de commander.';
    case 'PLUSIEURS': return res.total + ' articles correspondent à « ' + res.recherche + ' ». Voici les ' + nbAffiches + ' plus pertinents.';
    case 'INTROUVABLE':
      return res.total ? 'Rien avec tous les mots « ' + res.recherche + ' ». En ignorant « ' + res.motIgnore + ' », ' + res.total + ' résultat(s) approchant(s), à vérifier.'
                       : 'Aucun article ne correspond à « ' + res.recherche + ' ». Essaie le code article, l\'EAN, la réf. fournisseur ou moins de mots.';
    default: return 'Donne-moi un code article, un EAN, une réf. fournisseur ou quelques mots-clés.';
  }
}

/**
 * Appelée par la page. contexte = { type, recherche, filtres } de la réponse précédente.
 * choix = { axe, valeur } quand le vendeur clique sur un bouton de précision (filtre exact).
 */
function chatRepondre(message, contexte, choix) {
  var t0 = Date.now(), filtres = [], affinage = false, question = message;
  if (choix && contexte) {                       // bouton : on garde la recherche, on filtre sur la valeur exacte
    question = contexte.recherche; filtres = (contexte.filtres || []).concat([choix]); affinage = true;
  } else if (estAffinage(message, contexte)) {   // texte court : on complète la recherche en cours
    question = contexte.recherche + ' ' + message; filtres = contexte.filtres || []; affinage = true;
  }
  var out = repondre(question, filtres), res = out.resultat, C = CONFIG.COL;
  var articles = out.valeurs.map(function (v) {
    var alertes = [];
    if (v[C.STATUT - 1] !== 'Normal') alertes.push(v[C.STATUT - 1]);
    if (v[C.JUSQU_AU - 1]) alertes.push('commandable jusqu\'au ' + v[C.JUSQU_AU - 1]);
    return { code: v[C.CODE - 1], designation: v[C.DESIGNATION - 1], marque: v[C.MARQUE - 1], ref: v[C.REF - 1],
             ean: v[C.EAN - 1], stock: v[C.STOCK - 1], prix: v[C.PRIX - 1], unite: v[C.UNITE - 1],
             sousFamille: v[C.SOUS_FAMILLE - 1], alertes: alertes, pageCatalogue: v[C.PAGE_CATALOGUE - 1] || '' };
  });
  return {
    type: res.type, total: res.total, recherche: res.recherche || '', affinage: affinage, filtres: filtres,
    intro: introChat(res, articles.length), articles: articles,
    choix: res.type === 'PLUSIEURS' && res.departage ? { axe: res.departage.axe, valeurs: res.departage.bruts, comptes: res.departage.comptes } : null,
    duree: (Date.now() - t0) / 1000
  };
}

// ================================== TESTS ===================================

function onOpen() {
  try { memoriserClasseur(); } catch (e) {}
  SpreadsheetApp.getUi().createMenu('Assistant vendeur')
    .addItem('Poser une question…', 'poserQuestion')
    .addItem('Lancer les tests (onglet TESTS)', 'lancerTests')
    .addToUi();
}

function poserQuestion() {
  var ui = SpreadsheetApp.getUi();
  var r = ui.prompt('Assistant vendeur', 'Ta question (code, EAN, réf. ou mots-clés) :', ui.ButtonSet.OK_CANCEL);
  if (r.getSelectedButton() !== ui.Button.OK) return;
  var t0 = Date.now(), out = repondre(r.getResponseText());
  ui.alert(out.reponse + '\n\n(' + ((Date.now() - t0) / 1000).toFixed(1) + ' s)');
}

/**
 * Onglet TESTS : colonne A = question, colonne B = code(s) attendu(s) (séparés par des virgules)
 * ou un type attendu (PLUSIEURS, INTROUVABLE…). Le script remplit C à F.
 */
function lancerTests() {
  var ss = SpreadsheetApp.getActive(), f = ss.getSheetByName(CONFIG.ONGLET_TESTS);
  if (!f) {
    f = ss.insertSheet(CONFIG.ONGLET_TESTS);
    f.getRange(1, 1, 1, 6).setValues([['Question', 'Attendu', 'Type obtenu', 'Codes obtenus (5 premiers)', 'OK ?', 'Réponse']]);
    SpreadsheetApp.getUi().alert('Onglet TESTS créé : saisis tes questions en colonne A et l\'attendu en B, puis relance.');
    return;
  }
  var n = f.getLastRow() - 1;
  if (n < 1) return;
  f.getRange(1, 3, 1, 4).setValues([['Type obtenu', 'Codes obtenus (5 premiers)', 'OK ?', 'Réponse']]);
  var codes = lireColonne_(feuille_(CONFIG.ONGLET_ARTICLES), CONFIG.COL.CODE, chargerIndex_().cle.length);
  var data = f.getRange(2, 1, n, 2).getValues(), sortie = [], ok = 0;
  data.forEach(function (r) {
    if (!r[0]) { sortie.push(['', '', '', '']); return; }
    var out = repondre(String(r[0])), res = out.resultat;
    var obtenus = res.lignes.slice(0, 5).map(function (i) { return codes[i]; });
    var attendu = String(r[1]).trim(), bon;
    if (/^[A-Z]+$/.test(attendu)) bon = attendu === res.type;
    else bon = attendu.split(',').map(function (c) { return c.trim(); }).every(function (c) { return obtenus.indexOf(c) >= 0; });
    if (bon) ok++;
    sortie.push([res.type, obtenus.join(', '), bon ? 'OUI' : 'NON', out.reponse]);
  });
  f.getRange(2, 3, sortie.length, 4).setValues(sortie);
  SpreadsheetApp.getUi().alert(ok + ' / ' + data.filter(function (r) { return r[0]; }).length + ' tests réussis');
}

// ========================= V1 : GOOGLE CHAT (préparé) ========================
/**
 * Gestionnaire de message Google Chat. Fonctionne une fois le script relié à une
 * application Chat (projet Google Cloud + API Chat activée : à voir avec l'IT).
 * Gère les deux formats d'événement (application Chat « classique » et module
 * complémentaire Workspace). Format de réponse à confirmer lors de la mise en place.
 */
function onMessage(event) {
  var msg = (event.chat && event.chat.messagePayload) ? event.chat.messagePayload.message : event.message;
  var question = (msg && (msg.argumentText || msg.text)) || '';
  var reponse = repondre(question.trim()).reponse;
  if (event.chat) {
    return { hostAppDataAction: { chatDataAction: { createMessageAction: { message: { text: reponse } } } } };
  }
  return { text: reponse };
}

// ===================== GEMINI : compréhension (optionnel) ====================
/**
 * Gemini sert UNIQUEMENT à reformuler la question en mots-clés / identifiants.
 * Il ne voit pas la base et ne choisit aucun article. Clé à stocker dans
 * Paramètres du projet > Propriétés du script : GEMINI_API_KEY.
 */
function interpreterAvecGemini_(question) {
  var cle = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
  if (!cle) throw new Error('GEMINI_API_KEY absente');
  var consigne =
    'Tu aides des vendeurs de quincaillerie professionnelle. Extrais de la question les identifiants ' +
    '(code article à 6 chiffres, EAN, référence fabricant) et 1 à 5 mots-clés de produit utiles pour chercher ' +
    'dans un catalogue aux désignations abrégées (ex. "ferme-porte", "TS4000", "blanc", "30x40"). ' +
    'N\'invente jamais de référence. Réponds en JSON : {"identifiants":[],"mots_cles":[]}.\nQuestion : ' + question;
  var url = 'https://generativelanguage.googleapis.com/v1beta/models/' + CONFIG.MODELE_GEMINI + ':generateContent?key=' + cle;
  var rep = UrlFetchApp.fetch(url, {
    method: 'post', contentType: 'application/json', muteHttpExceptions: true,
    payload: JSON.stringify({
      contents: [{ parts: [{ text: consigne }] }],
      generationConfig: { responseMimeType: 'application/json', temperature: 0 }
    })
  });
  if (rep.getResponseCode() !== 200) throw new Error(rep.getContentText());
  var j = JSON.parse(JSON.parse(rep.getContentText()).candidates[0].content.parts[0].text);
  var texte = (j.identifiants || []).concat(j.mots_cles || []).join(' ');
  return texte || question;
}

// Export pour les tests hors Google (Node.js) — ignoré par Apps Script
if (typeof module !== 'undefined') {
  module.exports = { normaliser: normaliser, analyserQuestion: analyserQuestion, moteur: moteur,
                     rediger: rediger, CONFIG: CONFIG, appliquerFiltres: appliquerFiltres, estAffinage: estAffinage, introChat: introChat };
}
