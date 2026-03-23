// ═══════════════════════════════════════════════════════════════
// PILOT PRO — cache.js
// Persistance localStorage : préférences utilisateur seulement.
// Les données volumineuses (finalData, ventesParMagasin, etc.)
// ne sont PAS stockées — elles dépassent le quota 5 Mo.
// L'utilisateur recharge les fichiers (8 s) à chaque session.
// Dépend de : state.js (variables globales)
// ═══════════════════════════════════════════════════════════════
'use strict';

const CACHE_KEY      = 'PILOT_PREFS';
const CACHE_KEY_OLD  = 'PILOT_CACHE';   // ancienne clé volumineuse — purgée au démarrage
const EXCL_KEY       = 'PILOT_EXCLUSIONS';

// Purger l'ancien cache volumineux (pouvait atteindre 15 Mo)
try { localStorage.removeItem(CACHE_KEY_OLD); } catch (_) {}

// ── Sauvegarde des préférences (< 1 Ko) ───────────────────────
function _saveToCache() {
  try {
    const prefs = {
      version: '2.0',
      timestamp: Date.now(),
      selectedMyStore,
      selectedObsCompare,
      obsFilterUnivers,
      periodFilterStart: periodFilterStart ? periodFilterStart.getTime() : null,
      periodFilterEnd:   periodFilterEnd   ? periodFilterEnd.getTime()   : null,
    };
    localStorage.setItem(CACHE_KEY, JSON.stringify(prefs));
  } catch (e) {
    console.warn('PILOT: sauvegarde préférences échouée :', e.message);
  }
}

// ── Restauration des préférences ──────────────────────────────
// Toujours retourne false : aucune donnée volumineuse stockée,
// l'utilisateur doit recharger ses fichiers à chaque session.
function _restoreFromCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return false;
    const prefs = JSON.parse(raw);
    if (!prefs || prefs.version !== '2.0') {
      localStorage.removeItem(CACHE_KEY);
      return false;
    }
    // Restaurer les préférences dans l'état global
    if (prefs.selectedMyStore)    selectedMyStore    = prefs.selectedMyStore;
    if (prefs.selectedObsCompare) selectedObsCompare = prefs.selectedObsCompare;
    if (prefs.obsFilterUnivers)   obsFilterUnivers   = prefs.obsFilterUnivers;
    if (prefs.periodFilterStart)  periodFilterStart  = new Date(prefs.periodFilterStart);
    if (prefs.periodFilterEnd)    periodFilterEnd    = new Date(prefs.periodFilterEnd);
    console.log('PILOT: préférences restaurées (agence :', prefs.selectedMyStore || '—', ')');
  } catch (e) {
    console.warn('PILOT: restauration préférences échouée :', e);
    localStorage.removeItem(CACHE_KEY);
  }
  // Toujours false — pas de données volumineuses à restaurer
  return false;
}

// ── Effacer les préférences ───────────────────────────────────
function _clearCache() {
  localStorage.removeItem(CACHE_KEY);
  // Réinitialiser les préférences en mémoire
  selectedMyStore    = '';
  selectedObsCompare = 'median';
  obsFilterUnivers   = '';
  periodFilterStart  = null;
  periodFilterEnd    = null;
  // Cacher le bandeau cache (s'il était visible)
  const b = document.getElementById('cacheBanner');
  if (b) b.classList.add('hidden');
  // Réafficher la zone d'import et l'onboarding
  const iz = document.getElementById('importZone');
  if (iz) iz.classList.remove('hidden');
  const ob = document.getElementById('onboardingBlock');
  if (ob) ob.classList.remove('hidden');
  // Masquer les onglets et la navbar store si pas de données
  if (!finalData.length) {
    document.getElementById('tabsContainer')?.classList.add('hidden');
    document.getElementById('globalFilters')?.classList.add('hidden');
    document.getElementById('navReportingBtn')?.classList.add('hidden');
    document.getElementById('navStore')?.classList.add('hidden');
    document.body.classList.remove('pilot-loaded');
    document.getElementById('insightsBanner')?.classList.add('hidden');
  }
}

// ── Bandeau "préférences restaurées" (non affiché — plus utilisé) ─
function _showCacheBanner() {
  // Les données ne sont plus restaurées depuis le cache.
  // Le bandeau n'a plus de raison d'être affiché.
  const banner = document.getElementById('cacheBanner');
  if (banner) banner.classList.add('hidden');
}

// ── Exclusions clients (persistance permanente, sans TTL) ─────
function _saveExclusions() {
  try {
    const data = {};
    for (const [k, v] of excludedClients.entries()) {
      // Ne pas sauvegarder clientData (objet lourd, peut être reconstruit)
      const { clientData, ...rest } = v;
      data[k] = rest;
    }
    localStorage.setItem(EXCL_KEY, JSON.stringify(data));
  } catch (e) {
    console.warn('Exclusions save failed :', e.message);
  }
}

function _restoreExclusions() {
  try {
    const raw = localStorage.getItem(EXCL_KEY);
    if (!raw) return;
    const data = JSON.parse(raw);
    for (const [k, v] of Object.entries(data)) {
      if (k && v) excludedClients.set(k, v);
    }
  } catch (e) {
    console.warn('Exclusions restore failed :', e);
  }
}
