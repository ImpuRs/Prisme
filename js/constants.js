// ═══════════════════════════════════════════════════════════════
// PRISME — constants.js
// Constantes métier et configuration
// ═══════════════════════════════════════════════════════════════
'use strict';

export const PAGE_SIZE = 200;
export const CHUNK_SIZE = 5000;
export const TERR_CHUNK_SIZE = 10000;
export const DORMANT_DAYS = 365;
export const NOUVEAUTE_DAYS = 35;
export const SECURITY_DAYS = 3;
export const HIGH_PRICE = 150;
export const CROSS_AGENCE_MIN_CA = 150;  // CA minimum (€) chez l'autre agence pour valider une opportunité cross-agence
export const CROSS_AGENCE_MIN_BL = 2;   // Nombre minimum de BL distincts chez l'autre agence

export const ONLINE_FAM_MIN_CA_HORS = 500;   // CA hors agence minimum pour "Familles à fort achat en ligne"
export const ONLINE_FAM_MIN_CA_TOTAL = 1000; // CA total famille minimum
export const ONLINE_FAM_MIN_CLIENTS = 2;     // Nb clients distincts minimum

export const METIERS_STRATEGIQUES = [
  'menuisier agenceur poseur','menuisier agenceur fabricant','menuisier specialiste',
  'fermeture','centre de formation','formation metier','serrurier','metalier','métallier',
  'aluminier','charpentier','couvreur','ossature bois','major','menuisier bois',
  'menuisier aluminier','hotellerie','hôtellerie','plein air','hebergement','hébergement',
  'santé','sante','collectivite','collectivité','administration','industrie','logistique',
  'facility management','plombier','chauffagiste'
];

export const AGE_BRACKETS = {
  fresh:    { min: 0,   max: 90,       label: '🟢 <90j',     color: 'text-green-700',  bg: 'bg-green-50',  dotClass: 'age-fresh',    badgeBg: 'bg-green-100 text-green-800' },
  warm:     { min: 90,  max: 180,      label: '🟡 90–180j',  color: 'text-yellow-600', bg: 'bg-yellow-50', dotClass: 'age-warm',     badgeBg: 'bg-yellow-100 text-yellow-800' },
  hot:      { min: 180, max: 365,      label: '🟠 180j–1an', color: 'text-orange-600', bg: 'bg-orange-50', dotClass: 'age-hot',      badgeBg: 'bg-orange-100 text-orange-800' },
  critical: { min: 365, max: Infinity, label: '🔴 >1an',     color: 'text-red-700',    bg: 'bg-red-50',    dotClass: 'age-critical', badgeBg: 'bg-red-100 text-red-800' }
};

// Mapping lettre Code famille → Univers (utilisé si colonne 'Univers' absente du consommé)
export const FAM_LETTER_UNIVERS = {
  'A': 'Agencement ameublement', 'B': 'Bâtiment', 'C': 'Consommables',
  'R': 'Électricité', 'E': 'EPI', 'G': 'Génie climatique',
  'M': 'Maintenance et équipements', 'O': 'Outillage', 'L': 'Plomberie'
};

// Labels des cases de la matrice ABC/FMR (utilisé dans _diagRenderV3 et ailleurs)
export const RADAR_LABELS = {
  AF: 'Pépites', AM: 'Surveiller', AR: 'Gros paniers',
  BF: 'Confort',  BM: 'Standard',  BR: 'Questionner',
  CF: 'Réguliers',CM: 'Réduire',   CR: 'Déréférencer'
};

// ── Decision Queue — seuils de significativité ───────────────
export const DQ_MIN_CA_PERDU_SEM    = 50;    // €/sem minimum pour remonter une rupture
export const DQ_MIN_PRIORITY_SCORE  = 1000;  // score alternatif (si PU élevé mais fréq faible)
export const DQ_MIN_PU_ALERTE       = 10;    // PU minimum pour une alerte prévisionnelle
export const DQ_MIN_FREQ_ALERTE     = 6;     // W minimum (article au moins M) pour alerte prévisionnelle

// Mapping première lettre code secteur → Direction commerciale
export const SECTEUR_DIR_MAP = {
  'M': 'Maintenance', 'B': 'Second Œuvre', 'L': 'DVP Plomberie', 'F': 'DVI Industrie'
};

// ── Référentiel familles Legallais ────────────────────────────────────────
// Source : Qlik — stable, mis à jour manuellement si évolution du catalogue
export const FAMILLE_LOOKUP = {
  '00': 'Frais Gén./Emballages Internes',
  '12': 'Actions promotionnelles',
  '22': 'Lots - Cadeaux - Dons',
  '30': 'Moustiquaires sur mesure',
  '31': 'Grilles sur mesure',
  '32': 'Baton maréchal sur mesure',
  '94': 'Fin de série 2004',
  'A01': 'Accessoires',
  'A02': 'Agencement',
  'A03': 'Assemblage de meuble',
  'A04': 'Equipements',
  'A05': 'Fermetures de meubles',
  'A06': 'Ferrures de portes battantes',
  'A07': 'Ferrures de portes coulissantes',
  'A08': 'Garnitures de meubles',
  'A10': 'Pieds et roulettes de meubles',
  'A11': 'Tiroirs et coulisses',
  'A12': 'Caissons et portes',
  'B01': 'Contrôle d\'accès et sécurité',
  'B02': 'Cylindres',
  'B03': 'Ferme-porte',
  'B04': 'Ferrures de porte et fenêtre',
  'B05': 'Ferrures de portes coulissantes',
  'B06': 'Ferrures de volets et portail',
  'B07': 'Garnitures de porte et fenêtre',
  'B09': 'Quincaillerie générale',
  'B10': 'Serrures',
  'B11': 'Ventilation extraction',
  'C01': 'Colles - adhésifs - lubrifiant',
  'C02': 'Coupe',
  'C03': 'Fixation',
  'C04': 'Peintures - marquage',
  'E01': 'Matériel des 1ers secours',
  'E02': 'Mise en sécurité de la personne',
  'E03': 'Protection auditive',
  'E04': 'Protection de la tête',
  'E05': 'Protection des mains',
  'E06': 'Protection des pieds',
  'E07': 'Protection des yeux',
  'E08': 'Protection du corps',
  'E09': 'Protection respiratoire',
  'G01': 'Radiateurs et sèche-serviettes',
  'G02': 'Robinetterie de radiateur',
  'G03': 'Plancher chauffant',
  'G04': 'Chaudières',
  'G05': 'Équipements de chaufferie',
  'G06': 'Pompes à chaleur',
  'G07': 'Climatisation',
  'G08': 'Régulation',
  'G09': 'Ventilation, traitement air',
  'G10': 'Fumisterie',
  'L01': 'Raccords',
  'L02': 'Robinetterie',
  'L03': 'Sanitaire',
  'L04': 'WC',
  'L05': 'Vidage',
  'L06': 'Collectivité',
  'L07': 'Réseau sanitaire',
  'L08': 'Gaz',
  'M01': 'Air comprimé',
  'M02': 'Atelier',
  'M03': 'Echelles - échafaudages',
  'M05': 'Emballage - protection',
  'M06': 'Matériels et produits d\'entretien',
  'M07': 'Levage et manutention',
  'M08': 'Matériel de chantier',
  'M09': 'Équipements urbains',
  'M10': 'Signalisation de chantier',
  'M11': 'Soudage',
  'M12': 'Tuyaux',
  'M14': 'Équipements de chantier',
  'M15': 'Fournitures de bureaux',
  'O01': 'Jardin',
  'O02': 'Machines de chantier et d\'atelier',
  'O03': 'Mesure et contrôle',
  'O04': 'Outillage à main',
  'O05': 'Outillage électroportatif',
  'O06': 'Outils métiers',
  'O07': 'Rangement d\'outillage',
  'O08': 'Serrage',
  'R01': 'Branchement et protection',
  'R02': 'Appareillage terminal',
  'R03': 'Appareillage industriel',
  'R04': 'Communication et réseaux',
  'R05': 'Fils et câbles',
  'R06': 'Conduits et chemin de câbles',
  'R07': 'Accessoires et raccordements',
  'R08': 'Eclairage',
  'R09': 'Domotique et automatisme',
  'R10': 'Sécurité & Alarme',
  'R12': 'Piles, batteries, alimentation',
  'R13': 'Équipements électriques',
};

// Codes hors catalogue standard — affichés sans code préfixe
export const FAMILLE_HORS_CATALOGUE = new Set(['00','12','22','30','31','32','94']);

// ── Segments vocationnels (taxonomie universelle 4 segments) ──────────────
// Utilisé par le plan de rayon stratégique pour détecter la vocation réelle
// d'une famille (incontournables vs sortir vs métiers clients agence)
export const SEGMENTS = {
  chantier: { label: 'Chantier', icon: '⚒', color: 'orange' },
  erp:      { label: 'ERP/Bâtiment', icon: '🏢', color: 'blue' },
  deco:     { label: 'Déco/Résidentiel', icon: '💡', color: 'pink' },
  source:   { label: 'Source/Conso', icon: '🔌', color: 'gray' },
};

// Mapping métier client → segments cibles (un métier peut viser plusieurs segments)
// Clés en minuscules sans accent pour matching tolérant
export const METIER_SEGMENTS = {
  'serrurier': ['chantier'],
  'metalier': ['chantier'], 'métallier': ['chantier'], 'metallier': ['chantier'],
  'aluminier': ['chantier'],
  'charpentier': ['chantier'], 'couvreur': ['chantier'],
  'ossature bois': ['chantier'],
  'menuisier bois': ['chantier'], 'menuisier aluminier': ['chantier'],
  'menuisier specialiste': ['chantier'], 'menuisier spécialiste': ['chantier'],
  'menuisier agenceur poseur': ['chantier','deco'],
  'menuisier agenceur fabricant': ['deco'],
  'fermeture': ['chantier'],
  'entreprise generale': ['chantier','erp'], 'entreprise générale': ['chantier','erp'],
  'multi-tech': ['chantier','erp'], 'multitech': ['chantier','erp'],
  'facility management': ['erp'],
  'plombier': ['chantier','erp'], 'chauffagiste': ['chantier','erp'],
  'electricien': ['source','erp'], 'électricien': ['source','erp'],
  'major': ['erp','chantier'],
  'collectivite': ['erp'], 'collectivité': ['erp'],
  'administration': ['erp'],
  'enseignement': ['erp'],
  'centre de formation': ['erp'], 'formation metier': ['erp'],
  'sante': ['erp'], 'santé': ['erp'],
  'hotellerie': ['erp','deco'], 'hôtellerie': ['erp','deco'],
  'hebergement': ['erp'], 'hébergement': ['erp'],
  'plein air': ['erp'],
  'industrie': ['chantier','erp'],
  'logistique': ['erp'],
  'bricoleur': ['deco','source'], 'particulier': ['deco','source'],
};

// Mots-clés segment par libellé d'article (heuristique universelle)
// Ordre = priorité : chantier > erp > source > deco
const SEG_KEYWORDS = {
  chantier: [
    'chantier','rechargeable','frontale','frontal','baladeuse','projecteur',
    'jaro','rufus','professionnel','pro mobile','batterie li','accu',
    'antichoc','etanche ip6','étanche ip6','heavy duty','renforce','renforcé',
    'echafaudage','échafaudage','levage','manutention','soudage','meuleuse',
    'perceuse','visseuse','tronconneuse','tronçonneuse','disqueuse'
  ],
  erp: [
    'erp','ert','dalle led','hublot','tube t8','tube t5','tube led','bloc secours',
    'bloc autonome','baes','etanche','étanche ','encastre','encastré',
    'collectif','collective','plenum','plénum','faux plafond','plafonnier',
    'detecteur','détecteur','desenfumage','désenfumage','coupe-feu','coupe feu',
    'compteur','tableau electrique','tableau électrique','sanitaire collectif'
  ],
  source: [
    'gu10','e27','e14','g9','g4','b22','ampoule','tube fluo','starter','transfo',
    'pile','batterie aaa','batterie aa','rallonge','prise','multiprise',
    'consommable','sachet','boite de','boîte de','recharge','cartouche'
  ],
  deco: [
    'deco','déco','design','salon','chambre','suspension','applique',
    'lampadaire','lampe a poser','lampe à poser','spot encastre deco',
    'guirlande','ruban led ','strip led','luminaire decoratif','luminaire décoratif',
    'agenceur','meuble','tiroir','poignee meuble','poignée meuble'
  ]
};

// Mapping univers (1ère lettre code famille) → segment par défaut
const UNIVERS_SEGMENT = {
  'L': 'chantier',  // Plomberie
  'B': 'chantier',  // Bâtiment
  'O': 'chantier',  // Outillage
  'E': 'chantier',  // EPI
  'G': 'erp',       // Génie climatique
  'M': 'erp',       // Maintenance
  'R': 'erp',       // Électricité
  'C': 'source',    // Consommables
  'A': 'deco',      // Agencement ameublement
};

/**
 * Détecte le segment vocationnel d'un article.
 * 1) Mots-clés libellé (priorité : chantier > erp > source > deco)
 * 2) Sinon, univers famille (1ère lettre code famille)
 * 3) Sinon, 'deco' par défaut
 * @param {string} libelle - Libellé article
 * @param {string} [marque] - Marque (optionnel)
 * @param {string} [codeFam] - Code famille (ex: 'L01') — 1ère lettre donne l'univers
 * @returns {'chantier'|'erp'|'deco'|'source'}
 */
export function detectSegment(libelle, marque = '', codeFam = '') {
  if (!libelle && !codeFam) return 'deco';
  const l = (libelle + ' ' + (marque || '')).toLowerCase();
  for (const seg of ['chantier','erp','source','deco']) {
    for (const kw of SEG_KEYWORDS[seg]) {
      if (l.includes(kw)) return seg;
    }
  }
  // Fallback : univers famille
  if (codeFam) {
    const letter = codeFam.charAt(0).toUpperCase();
    if (UNIVERS_SEGMENT[letter]) return UNIVERS_SEGMENT[letter];
  }
  return 'deco';
}

/**
 * Calcule le segment dominant d'une liste d'articles avec poids optionnel.
 * @param {Array<{libelle:string, marque?:string, weight?:number}>} items
 * @returns {{segment:string, share:number, distribution:Object}}
 */
export function dominantSegment(items) {
  const dist = { chantier: 0, erp: 0, deco: 0, source: 0 };
  let total = 0;
  for (const it of items || []) {
    const seg = detectSegment(it.libelle, it.marque);
    const w = it.weight || 1;
    dist[seg] += w;
    total += w;
  }
  if (total === 0) return { segment: 'deco', share: 0, distribution: dist };
  let best = 'deco', bestVal = -1;
  for (const k of Object.keys(dist)) {
    if (dist[k] > bestVal) { bestVal = dist[k]; best = k; }
  }
  return { segment: best, share: bestVal / total, distribution: dist };
}

/**
 * Normalise un libellé métier pour matching (lowercase, sans accents, trim).
 */
function _normMetier(s) {
  return (s || '').toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[\s-]+/g, ' ').trim();
}

/**
 * Retourne les segments cibles d'un métier client.
 * @param {string} metier
 * @returns {string[]} segments cibles, [] si inconnu
 */
export function metierToSegments(metier) {
  if (!metier) return [];
  const norm = _normMetier(metier);
  // Match exact normalisé
  for (const key of Object.keys(METIER_SEGMENTS)) {
    if (_normMetier(key) === norm) return METIER_SEGMENTS[key];
  }
  // Match partiel (contient)
  for (const key of Object.keys(METIER_SEGMENTS)) {
    if (norm.includes(_normMetier(key))) return METIER_SEGMENTS[key];
  }
  return [];
}

// CP agences Legallais — codes vus dans le consommé multi-agences
export const AGENCE_CP = {
  'AG22': '91300', // Massy
  'AG02': '78200', // Mantes-la-Jolie
  'AG03': '93200', // Saint-Denis
  'AG05': '75011', // Paris 11
  'AG11': '59000', // Lille
  'AG16': '75009', // Paris 9
  'AG51': '51100', // Reims
  'AG67': '67000', // Strasbourg
  'AG92': '92000', // Nanterre
  'AG94': '94200', // Ivry
  'AG93': '93160', // Noisy-le-Sec
};
