// ═══════════════════════════════════════════════════════════════
// PILOT PRO — constants.js
// Constantes métier et configuration
// ═══════════════════════════════════════════════════════════════
'use strict';

const PAGE_SIZE = 200;
const CHUNK_SIZE = 5000;
const TERR_CHUNK_SIZE = 10000;
const DORMANT_DAYS = 365;
const NOUVEAUTE_DAYS = 35;
const SECURITY_DAYS = 3;
const HIGH_PRICE = 150;

const METIERS_STRATEGIQUES = [
  'menuisier agenceur poseur','menuisier agenceur fabricant','menuisier specialiste',
  'fermeture','centre de formation','formation metier','serrurier','metalier','métallier',
  'aluminier','charpentier','couvreur','ossature bois','major','menuisier bois',
  'menuisier aluminier','hotellerie','hôtellerie','plein air','hebergement','hébergement',
  'santé','sante','collectivite','collectivité','administration','industrie','logistique',
  'facility management','plombier','chauffagiste'
];

const AGE_BRACKETS = {
  fresh:    { min: 0,   max: 90,       label: '🟢 <90j',     color: 'text-green-700',  bg: 'bg-green-50',  dotClass: 'age-fresh',    badgeBg: 'bg-green-100 text-green-800' },
  warm:     { min: 90,  max: 180,      label: '🟡 90–180j',  color: 'text-yellow-600', bg: 'bg-yellow-50', dotClass: 'age-warm',     badgeBg: 'bg-yellow-100 text-yellow-800' },
  hot:      { min: 180, max: 365,      label: '🟠 180j–1an', color: 'text-orange-600', bg: 'bg-orange-50', dotClass: 'age-hot',      badgeBg: 'bg-orange-100 text-orange-800' },
  critical: { min: 365, max: Infinity, label: '🔴 >1an',     color: 'text-red-700',    bg: 'bg-red-50',    dotClass: 'age-critical', badgeBg: 'bg-red-100 text-red-800' }
};

// Mapping lettre Code famille → Univers (utilisé si colonne 'Univers' absente du consommé)
const FAM_LETTER_UNIVERS = {
  'A': 'Agencement ameublement', 'B': 'Bâtiment', 'C': 'Consommables',
  'R': 'Électricité', 'E': 'EPI', 'G': 'Génie climatique',
  'M': 'Maintenance et équipements', 'O': 'Outillage', 'L': 'Plomberie'
};

// Mapping première lettre code secteur → Direction commerciale
const SECTEUR_DIR_MAP = {
  'M': 'Maintenance', 'B': 'Second Œuvre', 'L': 'DVP Plomberie', 'F': 'DVI Industrie'
};
