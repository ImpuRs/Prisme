// © 2026 Jawad El Barkaoui — Tous droits réservés
// PRISME — Outil d'analyse BI pour distribution B2B
// Développé sur initiative et temps personnel
// Contact : Jawad EL BARKAOUI
// ═══════════════════════════════════════════════════════════════
// PRISME — ui.js
// Fonctions UI transverses (toast, tabs, filtres, table, export)
// Dépend de : constants.js, utils.js, state.js, engine.js
// ═══════════════════════════════════════════════════════════════
'use strict';
import { PAGE_SIZE, AGE_BRACKETS, DORMANT_DAYS } from './constants.js';
import { fmtDate, formatEuro, escapeHtml, _isMetierStrategique, famLib, famLabel, normalizeStr, matchQuery, compileQuery, matchCompiled, sortRowsInPlace, buildSkeletonTable, buildSkeletonCards, getAgeBracket } from './utils.js';
import { _S, invalidateCache } from './state.js';
import { DataStore } from './store.js'; // Strangler Fig Étape 5
import { calcPriorityScore, rowVerdictLabel } from './engine.js';


// ── ToastManager — file FIFO avec priorités ───────────────────
const _TOAST_PRIORITY = { error: 0, warning: 1, success: 2, info: 3 };
const _toastState = { queue: [], active: [], maxActive: 3 };
let _lastToastMsg = '', _lastToastTime = 0;

export const ToastManager = {
  show(message, type = 'info', duration, { html = false, undoFn = null, undoLabel = 'Annuler' } = {}) {
    const now = Date.now();
    if (_lastToastMsg === message && now - _lastToastTime < 2000) return;
    _lastToastMsg = message; _lastToastTime = now;
    const _dur = duration || (type === 'error' ? 6000 : type === 'warning' ? 5000 : 3500);
    const toast = { id: now + Math.random(), message, type, html, duration: _dur, undoFn, undoLabel, priority: _TOAST_PRIORITY[type] ?? 3 };
    const insertIdx = _toastState.queue.findIndex(t => t.priority > toast.priority);
    if (insertIdx === -1) _toastState.queue.push(toast);
    else _toastState.queue.splice(insertIdx, 0, toast);
    _toastFlush();
  },
  dismiss(id) {
    const el = document.querySelector(`[data-toast-id="${id}"]`);
    if (el) _toastRemove(el, id);
  },
};

function _toastFlush() {
  const container = document.getElementById('toastContainer');
  if (!container) return;
  while (_toastState.active.length < _toastState.maxActive && _toastState.queue.length > 0) {
    const toast = _toastState.queue.shift();
    _toastState.active.push(toast.id);
    _toastRender(toast, container);
  }
}

function _toastRender(toast, container) {
  const colors = { success: 'i-ok-bg border-emerald-500 c-ok', error: 'i-danger-bg border-red-500 c-danger', warning: 'i-caution-bg border-amber-500 c-caution', info: 'i-info-bg border-blue-500 c-action' };
  const el = document.createElement('div');
  el.className = `p-3 rounded-lg shadow-lg border-l-4 font-bold text-xs flex items-center gap-2 toast-enter pointer-events-auto ${colors[toast.type] || colors.info}`;
  el.setAttribute('role', toast.type === 'error' ? 'alert' : 'status');
  el.setAttribute('aria-live', toast.type === 'error' ? 'assertive' : 'polite');
  el.setAttribute('data-toast-id', toast.id);
  el.style.cssText = 'position:relative;overflow:hidden';
  const msgEl = document.createElement('span');
  msgEl.style.flex = '1';
  if (toast.html) msgEl.innerHTML = toast.message; else msgEl.textContent = toast.message;
  el.appendChild(msgEl);
  if (toast.undoFn) {
    const undoBtn = document.createElement('button');
    undoBtn.className = 'text-[10px] font-extrabold underline cursor-pointer ml-1 shrink-0';
    undoBtn.textContent = toast.undoLabel;
    undoBtn.onclick = (e) => { e.stopPropagation(); toast.undoFn(); _toastRemove(el, toast.id); };
    el.appendChild(undoBtn);
  }
  const dismissBtn = document.createElement('button');
  dismissBtn.className = 'text-lg leading-none opacity-50 hover:opacity-100 shrink-0 ml-1';
  dismissBtn.textContent = '×';
  dismissBtn.setAttribute('aria-label', 'Fermer');
  dismissBtn.onclick = () => _toastRemove(el, toast.id);
  el.appendChild(dismissBtn);
  const progress = document.createElement('div');
  progress.style.cssText = `position:absolute;bottom:0;left:0;height:2px;background:currentColor;opacity:0.35;border-radius:0 0 4px 4px;animation:toastProgress ${toast.duration}ms linear forwards;width:100%`;
  el.appendChild(progress);
  container.appendChild(el);
  const timer = setTimeout(() => _toastRemove(el, toast.id), toast.duration);
  el._toastTimer = timer;
}

function _toastRemove(el, id) {
  if (!el.isConnected) return;
  clearTimeout(el._toastTimer);
  el.classList.replace('toast-enter', 'toast-leave');
  setTimeout(() => {
    el.remove();
    _toastState.active = _toastState.active.filter(aid => aid !== id);
    _toastFlush();
  }, 300);
}

// Rétrocompat — showToast() continue de fonctionner partout
export function showToast(message, type = 'info', _duration, opts = {}) {
  ToastManager.show(message, type, _duration, opts);
}

// ── Loading overlay ───────────────────────────────────────────
export function updateProgress(c, t, txt, step) {
  const p = t > 0 ? Math.round(c / t * 100) : 0;
  document.getElementById('progressBar').style.width = p + '%';
  document.getElementById('progressPct').textContent = p + '%';
  if (txt) document.getElementById('loadingText').textContent = txt;
  if (step) document.getElementById('loadingStep').textContent = step;
}

export function updatePipeline(step, status) {
  const idMap = { consomme: 'pipeConsomme', stock: 'pipeStock', territoire: 'pipeTerritoire' };
  const el = document.getElementById(idMap[step]); if (!el) return;
  const cls = { pending: 't-disabled', active: 'c-action font-bold animate-pulse', done: 'c-ok font-bold' };
  el.className = cls[status] || 't-disabled';
  if (status === 'done') el.textContent = { consomme: '✅ Consommé', stock: '✅ Stock', territoire: '✅ Territoire' }[step] || '✅';
  if (status !== 'pending') { const pl = document.getElementById('loadingPipeline'); if (pl) pl.classList.remove('hidden'); }
  if (step === 'territoire') { const sep = document.getElementById('pipeSepTerr'); if (sep) sep.classList.remove('hidden'); el.classList.remove('hidden'); }
}

export function showLoading(t, s) { document.getElementById('loadingOverlay').classList.add('active'); updateProgress(0, 100, t, s); }
export function hideLoading() { document.getElementById('loadingOverlay').classList.remove('active'); }

// ── Import zone collapse ──────────────────────────────────────
const _statusBadgeMap = {
  dropConsomme: 'statusConsomme',
  dropStock: 'statusStock',
  dropChalandise: 'statusChalandise',
  dropLivraisons: 'statusLivraisons',
  dropForcage: 'statusForcage',
};

export function _updateAnalyserBtn() {
  const hasCacheData = DataStore.finalData.length > 0;
  const hasConsomme  = !!document.getElementById('fileConsomme')?.files[0];
  const hasStock     = !!(_S._hasStock || document.getElementById('fileStock')?.files[0]);
  const btn  = document.getElementById('btnCalculer');
  const btnR = document.getElementById('btnRecalculer');
  if (hasCacheData) {
    // Données déjà en mémoire : Analyser activé + Recalculer visible
    if (btn)  { btn.disabled = false; }
    if (btnR) { btnR.classList.remove('hidden'); }
  } else {
    // Aucune donnée : Analyser activé seulement si les 2 fichiers obligatoires sont sélectionnés
    if (btn)  { btn.disabled = !(hasConsomme && hasStock); }
    if (btnR) { btnR.classList.add('hidden'); }
  }
}

export function onFileSelected(i, id) {
  // Confirm uniquement pour le fichier principal (Consommé) qui déclenche un reset complet.
  // Les fichiers optionnels (Stock, Livraisons, Chalandise) s'ajoutent sans écraser la session.
  if (id === 'dropConsomme' && i.files.length > 0 && DataStore.finalData.length > 0) {
    if (!confirm('⚠️ Vous avez une analyse en cours. Charger un nouveau Consommé relancera l\'analyse complète. Continuer ?')) {
      i.value = '';
      return;
    }
  }
  document.getElementById(id).classList.toggle('file-loaded', i.files.length > 0);
  const badgeId = _statusBadgeMap[id];
  if (badgeId) { const b = document.getElementById(badgeId); if (b) b.textContent = i.files.length > 0 ? '✅' : '⭕'; }
  _updateAnalyserBtn();
}

export function collapseImportZone(nbFiles, store, nbArts, elapsed) {
  const iz = document.getElementById('importZone');
  const ob = document.getElementById('onboardingStep0');
  const bannerRight = document.getElementById('insightsBannerRight');
  const banner = document.getElementById('insightsBanner');
  if (!bannerRight || !banner) return;
  const _btn = (label, onclick) => `<button type="button" onclick="${onclick}" class="ib-btn">${label}</button>`;
  bannerRight.innerHTML = _btn('Fichiers', 'expandImportZone()');
  // Résumé des données à gauche (une fois analysé ; la restauration IDB l'écrit aussi, cf. _showCacheBanner)
  const left = document.getElementById('insightsBannerLeft');
  if (left && nbArts) left.innerHTML = `<span class="ib-sum">Fichiers chargés à l’instant · ${Number(nbArts).toLocaleString('fr-FR')} articles · ${store || '—'}${elapsed ? ` · ${elapsed} s` : ''}</span>`;
  if (iz) iz.classList.add('hidden');
  if (ob) ob.classList.add('hidden');
  banner.classList.remove('hidden');
  // Banner enrichissement : seule la chalandise manque vraiment (Commerce & Clients en dépendent).
  // Le fichier Livraisons (Qlik) reste un plus facultatif — on ne le réclame plus.
  const hasChal = _S.chalandiseReady || !!document.getElementById('fileChalandise')?.files[0];
  const enrichEl = document.getElementById('enrichBanner');
  const enrichMsg = document.getElementById('enrichBannerMsg');
  if (enrichEl) {
    if (!hasChal) {
      if (enrichMsg) enrichMsg.textContent = 'Ajoutez la Zone de Chalandise pour activer Commerce & Clients';
      enrichEl.classList.remove('hidden');
    } else enrichEl.classList.add('hidden');
  }
  const navKpisEl = document.getElementById('navKpis');
  if (navKpisEl) navKpisEl.style.display = 'flex';
}

export function expandImportZone() {
  const iz = document.getElementById('importZone');
  const ob = document.getElementById('onboardingStep0');
  const bannerRight = document.getElementById('insightsBannerRight');
  const bannerLeft = document.getElementById('insightsBannerLeft');
  const banner = document.getElementById('insightsBanner');
  const enrichEl = document.getElementById('enrichBanner');
  if (iz) iz.classList.remove('hidden');
  if (ob) ob.classList.remove('hidden');
  if (enrichEl) enrichEl.classList.add('hidden');
  if (bannerRight) bannerRight.innerHTML = '';
  if (banner && bannerLeft && !bannerLeft.innerHTML.trim()) banner.classList.add('hidden');
  if (_S.storesIntersection && _S.storesIntersection.size > 1) {
    document.getElementById('storeSelector')?.classList.remove('hidden');
  }
  if (DataStore.finalData.length > 0) {
    const btn = document.getElementById('importZoneCancelBtn');
    if (btn) { btn.classList.remove('hidden'); btn.style.display = 'flex'; }
  }
  _updateAnalyserBtn();
}

// ── Canal global — pill selector ──────────────────────────────
let _canalDebounceTimer = 0;
export function _setGlobalCanal(canal) {
  _S._globalCanal = canal;
  // Sync visuel immédiat (pas de latence perçue)
  document.querySelectorAll('#globalCanalFilter [data-global-canal]').forEach(p => {
    p.classList.toggle('active', (p.dataset.globalCanal || '') === canal);
  });
  const _mmBar = document.getElementById('globalMagasinModeBar');
  if (_mmBar) _mmBar.classList.toggle('hidden', canal !== 'MAGASIN');
  // Debounce le travail lourd — seul le dernier clic dans 120ms est traité
  clearTimeout(_canalDebounceTimer);
  _canalDebounceTimer = setTimeout(() => {
    invalidateCache('tab'); // PAS 'terr' : le cache territoire a le canal dans sa clé, pas de stale risk
    window._refilterFromByMonth?.();
    if (typeof window.renderCurrentTab === 'function') window.renderCurrentTab();
    window._refreshBenchEquation?.();
  }, 120);
}
if (typeof window !== 'undefined') window._setGlobalCanal = _setGlobalCanal;

// ── Super-tab navigation ──────────────────────────────────────
const _SUPERTAB_DEFAULT = { partie: 'partie', base: 'table', stock: 'arbitrage', clients: 'portefeuille', commerce: 'commerce', direction: 'duel', animation: 'animation' };
const _TAB_TO_SUPERTAB  = {
  partie: 'partie',
  table: 'base',
  plan: 'stock', arbitrage: 'stock', essai: 'stock', stock: 'stock',
  commerce: 'commerce', clients: 'commerce', portefeuille: 'commerce',
  duel: 'direction',
  animation: 'animation', associations: 'animation',
};

export function switchSuperTab(supertabId) {
  document.querySelectorAll('.supertab-group').forEach(g => g.classList.remove('active'));
  document.querySelectorAll('.supertab-btn').forEach(b => b.classList.remove('active'));
  const gKey = supertabId === 'commerce' ? 'clients' : supertabId;
  const group = document.getElementById(`stg-${gKey}`);
  const btn   = document.getElementById(`stbtn-${gKey}`);
  if (group) group.classList.add('active');
  if (btn)   btn.classList.add('active');
  switchTab(_SUPERTAB_DEFAULT[supertabId] || supertabId);
}

// ── Filtres tactiques par onglet — save / restore ────────────
const _TACTICAL_KEYS = ['distanceMaxKm','selectedDepts','selectedMetier','filterStrategiqueOnly',
  'selectedClassifs','selectedStatuts','selectedActivitesPDV','selectedStatutDetaille',
  'includePerdu24m','selectedDirections','selectedUnivers'];
const _STATE_MAP = {distanceMaxKm:'_distanceMaxKm',selectedDepts:'_selectedDepts',selectedMetier:'_selectedMetier',
  filterStrategiqueOnly:'_filterStrategiqueOnly',selectedClassifs:'_selectedClassifs',selectedStatuts:'_selectedStatuts',
  selectedActivitesPDV:'_selectedActivitesPDV',selectedStatutDetaille:'_selectedStatutDetaille',
  includePerdu24m:'_includePerdu24m',selectedDirections:'_selectedDirections',selectedUnivers:'_selectedUnivers'};

function _saveTacticalFilters(tabId) {
  if (!tabId || !_S._tabFilters[tabId]) return;
  const slot = _S._tabFilters[tabId];
  for (const k of _TACTICAL_KEYS) {
    const v = _S[_STATE_MAP[k]];
    slot[k] = v instanceof Set ? new Set(v) : v;
  }
}
function _restoreTacticalFilters(tabId) {
  if (!tabId || !_S._tabFilters[tabId]) return;
  const slot = _S._tabFilters[tabId];
  for (const k of _TACTICAL_KEYS) {
    const v = slot[k];
    _S[_STATE_MAP[k]] = v instanceof Set ? new Set(v) : v;
  }
}
function _syncTacticalUI() {
  // Sync visuals immédiats — le reste sera recalé par _buildOverviewFilterChips
  if (window._updateDistQuickBtns) window._updateDistQuickBtns(_S._distanceMaxKm || 0);
  const metSel = document.getElementById('terrMetierFilter'); if (metSel) metSel.value = _S._selectedMetier || '';
  const btn = document.getElementById('btnStrategiqueOnly');
  if (btn) { btn.classList.toggle('bg-amber-500', _S._filterStrategiqueOnly); btn.classList.toggle('text-white', _S._filterStrategiqueOnly); btn.classList.toggle('s-hover', !_S._filterStrategiqueOnly); btn.classList.toggle('t-secondary', !_S._filterStrategiqueOnly); }
  const cb = document.querySelector('#togglePerdu24m input'); if (cb) cb.checked = !!_S._includePerdu24m;
  const sdSel = document.getElementById('terrStatutDetailleSelect'); if (sdSel) sdSel.value = _S._selectedStatutDetaille || '';
}
function _swapTacticalFilters(newTabId) {
  const prev = _S._activeCommerceTab;
  if (prev && prev !== newTabId) {
    _saveTacticalFilters(prev);
    _restoreTacticalFilters(newTabId);
    _syncTacticalUI();
  }
  _S._activeCommerceTab = newTabId;
}

// ── Tab navigation ────────────────────────────────────────────
export function switchTab(id) {
  if (id === 'abc' || id === 'matrice') id = 'arbitrage'; // abc/matrice → arbitrage
  if (id === 'stock') id = 'arbitrage'; // ancien stock → arbitrage
  if (id === 'omni') { switchTab('commerce'); return; }
  if (id === 'clients') id = 'portefeuille'; // Fidélisation PDV retirée → Tes clients
  if (id === 'conformite') id = 'duel'; // Physigamme (Direction) retirée → Duel agence
  window.scrollTo(0, 0);
  document.querySelectorAll('.tab-content').forEach(e => e.classList.add('hidden'));
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  const tab = document.getElementById('tab' + id.charAt(0).toUpperCase() + id.slice(1)); if (tab) tab.classList.remove('hidden');

  // Active le bouton direct si trouvé (data-tab = super-tab button)
  const btn = document.querySelector(`[data-tab="${id}"]`);
  if (btn) btn.classList.add('active');

  // Synchroniser le super-tab parent
  const supertabId = _TAB_TO_SUPERTAB[id];
  if (supertabId) {
    document.querySelectorAll('.supertab-group').forEach(g => g.classList.remove('active'));
    document.querySelectorAll('.supertab-btn').forEach(b => b.classList.remove('active'));
    const gKey = supertabId === 'commerce' ? 'clients' : supertabId;
    const stGroup = document.getElementById(`stg-${gKey}`);
    const stBtn   = document.getElementById(`stbtn-${gKey}`);
    if (stGroup) stGroup.classList.add('active');
    if (stBtn)   stBtn.classList.add('active');
  }
  // Synchroniser la pill active
  document.querySelectorAll('.supertab-pill').forEach(p => p.classList.remove('active'));
  const activePill = document.querySelector(`.supertab-pill[data-subtab="${id}"]`);
  if (activePill) activePill.classList.add('active');

  // Déclencher le rendu — découplé de la présence d'un bouton direct
  {
    if (!_S._tabRendered[id] && DataStore.finalData.length > 0) {
      const skeletonMap = {
        // Uniquement les tabs dont le renderer écrase tab.innerHTML en entier
        commerce: () => buildSkeletonCards(3) + buildSkeletonTable(10, 7),
      };
      const skFn = skeletonMap[id];
      if (skFn && tab) tab.innerHTML = `<div class="container mx-auto mt-3 p-4 md:p-5">${skFn()}</div>`;
      renderCurrentTab();
    } else if (!_S._tabRendered[id] && _S.ventesLocalMagPeriode?.size > 0) {
      renderCurrentTab();
    }
  }
  // Barre latérale : seulement là où ses filtres agissent (Plan, Base articles, Tes clients, Conquête)
  document.body.classList.toggle('no-sidebar', ['partie', 'arbitrage', 'essai', 'duel', 'animation', 'associations'].includes(id));
  // Sélecteur de période : seulement sur le Duel. Conquête compte sur l'année en cours, le reste sur 12 mois.
  document.body.classList.toggle('no-period', id !== 'duel');
  // Update filter panel groups based on active tab
  const groups = { stock: 'filterGroupStock', commerce: 'filterGroupTerritoire', plan: 'filterGroupPlan' };
  const activeGroup = id === 'duel' ? '' : id === 'plan' ? 'plan' : (id === 'commerce' || id === 'clients' || id === 'portefeuille') ? 'commerce' : 'stock';
  Object.entries(groups).forEach(([key, gid]) => {
    const el = document.getElementById(gid); if (!el) return;
    el.classList.toggle('hidden', key !== activeGroup);
  });
  // Masquer les filtres stock sur Ce matin (non pertinents)
  const gf = document.getElementById('globalFilters');
  if (gf) gf.classList.toggle('hidden', id === 'animation' || id === 'associations' || id === 'action' || id === 'duel');
  // Recherche client — tout en haut, visible sur Commerce/Fidélisation
  const _CANAL_TABS = new Set(['commerce', 'clients']);
  const tsb = document.getElementById('terrSearchBlock');
  if (tsb) tsb.classList.toggle('hidden', !_CANAL_TABS.has(id) && id !== 'portefeuille');
  // Filtre canal global — visible sur Commerce
  const gcf = document.getElementById('globalCanalFilter');
  if (gcf) gcf.classList.toggle('hidden', !_CANAL_TABS.has(id));
  // Chalandise filters — visible sur Commerce si chalandise chargée
  if (id === 'commerce' || id === 'clients' || id === 'portefeuille') {
    const chalFilBlk = document.getElementById('terrChalandiseFiltersBlock');
    if (chalFilBlk && _S.chalandiseReady) chalFilBlk.classList.remove('hidden');
    // Filtres tactiques PAR ONGLET — save ancien, restore nouveau
    _swapTacticalFilters(id);
  }
  // Titre sidebar par onglet
  const _sidebarTitles = { action: "Aujourd'hui", stock: 'Filtres Analyse du stock', table: 'Filtres', commerce: 'Filtres Terrain', clients: 'Filtres PDV', portefeuille: 'Filtres clients', plan: 'Filtres Plan', animation: 'Animation', associations: 'Associations', duel: 'Duel agence' };
  const _st = _sidebarTitles[id] || 'Filtres';
  const _stEl = document.getElementById('sidebarGroupTitle'); if (_stEl) _stEl.textContent = _st;
  const _stD = document.getElementById('sidebarDesktopTitle'); if (_stD) _stD.textContent = _st;
  // Alertes stock pills — visibles uniquement sur Analyse du stock
  const sap = document.getElementById('stockAlertPills');
  if (sap) sap.classList.toggle('hidden', id !== 'stock');
  // Blocs sidebar Ce matin — visibles uniquement sur Ce matin
  const csb = document.getElementById('cematinScoreBlock');
  if (csb) csb.classList.toggle('hidden', id !== 'action');
}

// ── Filter drawer (mobile) ─────────────────────────────────────
export function openFilterDrawer() {
  const panel = document.getElementById('filterPanel');
  const overlay = document.getElementById('filterOverlay');
  if (panel) {
    const hh = (document.getElementById('stickyHeader')?.offsetHeight || 0);
    panel.style.top = hh + 'px';
    panel.style.height = `calc(100dvh - ${hh}px)`;
    panel.classList.add('drawer-open');
  }
  if (overlay) overlay.classList.add('active');
}

export function closeFilterDrawer() {
  const panel = document.getElementById('filterPanel');
  const overlay = document.getElementById('filterOverlay');
  if (panel) panel.classList.remove('drawer-open');
  if (overlay) overlay.classList.remove('active');
}

export function populateSelect(id, vals, labelFn) {
  const s = document.getElementById(id); if (!s) return;
  if (s.tagName === 'INPUT') { const dl = document.getElementById(s.getAttribute('list')); if (dl) { dl.innerHTML = ''; [...vals].sort((a,b)=>(labelFn?labelFn(a):a).localeCompare(labelFn?labelFn(b):b)).forEach(v => { const o = document.createElement('option'); o.value = v; if (labelFn) o.textContent = labelFn(v); dl.appendChild(o); }); } return; }
  const f = s.options[0].textContent; s.innerHTML = `<option value="">${f}</option>`;
  [...vals].sort().forEach(v => { const o = document.createElement('option'); o.value = v; o.textContent = v; s.appendChild(o); });
}

// ── Peupler le filtre Univers depuis articleUnivers ──
export function buildSqLookup() {
  const sel = document.getElementById('filterMetier');
  if (!sel) return;
  const univers = new Set();
  for (const v of Object.values(_S.articleUnivers || {})) { if (v) univers.add(v); }
  if (!univers.size) return;
  const cur = sel.value;
  sel.innerHTML = '<option value="">🏗️ Univers</option>';
  [...univers].sort().forEach(u => { const o = document.createElement('option'); o.value = u; o.textContent = u; sel.appendChild(o); });
  sel.value = cur;
  sel.classList.remove('hidden');
}

// ── Filters ───────────────────────────────────────────────────
export function getFilteredData() {
  const fam = (document.getElementById('filterFamille').value || '').trim(), sFam = (document.getElementById('filterSousFamille').value || '').trim(), emp = (document.getElementById('filterEmplacement').value || '').trim(), stat = document.getElementById('filterStatut').value, af = document.getElementById('filterAge').value;
  const cockpitType = document.getElementById('filterCockpit').value;
  const abc = document.getElementById('filterABC').value, fmr = document.getElementById('filterFMR').value;
  const verdict = document.getElementById('filterVerdict')?.value || '';
  const searchQuery = document.getElementById('searchInput').value.trim();
  const univers = document.getElementById('filterMetier')?.value || '';
  // Verdict — libellé en clair (rowVerdictLabel) ; anciennes valeurs = classification squelette
  const _oldClassif = { socle: 1, implanter: 1, challenger: 1, surveiller: 1 };
  const verdictOf = verdict ? (r) => _oldClassif[verdict] ? r._sqClassif : rowVerdictLabel(r) : null;

  const _cFam = fam ? compileQuery(fam) : null;
  const _cSFam = sFam ? compileQuery(sFam) : null;
  const _cEmp = emp ? compileQuery(emp) : null;
  const _cSearch = searchQuery ? compileQuery(searchQuery) : null;
  const filtered = DataStore.finalData.filter(r => {
    if(_cFam){
      const famCode = r.famille||'';
      if(!matchCompiled(_cFam, normalizeStr(famLib(famCode)+' '+famCode+' '+famLabel(famCode)))) return false;
    }
    if (_cSFam && !matchCompiled(_cSFam, normalizeStr(r.sousFamille || ''))) return false;
    if (_cEmp && !matchCompiled(_cEmp, normalizeStr(r.emplacement || ''))) return false;
    if (stat && r.statut !== stat) return false;
    if (af) { const b = AGE_BRACKETS[af]; if (b && (r.ageJours < b.min || r.ageJours >= b.max)) return false; }
    if (cockpitType && _S.cockpitLists[cockpitType] && !_S.cockpitLists[cockpitType].has(r.code)) return false;
    if (abc && r.abcClass !== abc) return false;
    if (fmr && r.fmrClass !== fmr) return false;
    if (univers && (_S.articleUnivers?.[r.code] || '') !== univers) return false;
    if (verdictOf && verdictOf(r) !== verdict) return false;
    if (_cSearch) { return matchCompiled(_cSearch, normalizeStr(r.code+' '+r.libelle+' '+famLib(r.famille || '')), r.code); }
    return true;
  });
  let activeCount = 0; if (fam) activeCount++; if (sFam) activeCount++; if (emp) activeCount++; if (stat) activeCount++; if (af) activeCount++; if (searchQuery) activeCount++; if (cockpitType) activeCount++; if (abc) activeCount++; if (fmr) activeCount++; if (univers) activeCount++; if (verdict) activeCount++;
  const el = document.getElementById('filterActiveCount'); if (el) el.textContent = activeCount > 0 ? `(${activeCount} actif${activeCount > 1 ? 's' : ''})` : '';
  // Badges groupes sidebar
  const _classifActive = [abc, fmr, fam, stat, univers, verdict].filter(Boolean).length;
  const _advancedActive = [sFam, emp, af].filter(Boolean).length;
  const _bgClassif = document.getElementById('fgBadgeClassif');
  if (_bgClassif) { _bgClassif.textContent = _classifActive; _bgClassif.classList.toggle('hidden', _classifActive === 0); }
  const _bgAdv = document.getElementById('fgBadgeAvanced');
  if (_bgAdv) { _bgAdv.textContent = _advancedActive; _bgAdv.classList.toggle('hidden', _advancedActive === 0); }
  if (_S._filterHorsAgence) return filtered.filter(r => (r.caHorsMagasin || 0) > 0);
  return filtered;
}

let _renderAllRunning = false;
export function renderAll() {
  if (_renderAllRunning || _S._parsingInProgress) return; // guard anti-réentrance + parsing
  _renderAllRunning = true;
  document.body.classList.add('filtering');
  _S.filteredData = getFilteredData();
  sortRowsInPlace(_S.filteredData, _S.sortCol, _S.sortAsc);
  updateActiveAgeIndicator();
  renderTable(true); // articles always re-renders (exception: not behind lazy flag)
  invalidateCache('tab'); // invalidate all tab caches (filter or data changed)
  renderCurrentTab(); // render only the currently active non-articles tab
  updateAmbientSignal();
  // Wrap glossary terms in <th> headers (idempotent — skips already-processed elements)
  requestAnimationFrame(() => { document.body.classList.remove('filtering'); wrapGlossaryTerms(document); });
  _renderAllRunning = false;
}

export function onFilterChange() { _S.currentPage = 0; clearCockpitFilter(true); renderAll(); }
export function debouncedRender() { clearTimeout(_S.debounceTimer); _S.debounceTimer = setTimeout(() => { _S.currentPage = 0; renderAll(); }, 250); }

export function resetFilters() {
  document.getElementById('searchInput').value = '';
  ['filterFamille', 'filterSousFamille', 'filterEmplacement', 'filterStatut', 'filterAge', 'filterABC', 'filterFMR', 'filterMetier', 'filterVerdict'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  _S._filterHorsAgence = false;
  const btnHA = document.getElementById('btnHorsAgence');
  if (btnHA) { btnHA.classList.remove('bg-violet-500', 'text-white'); btnHA.classList.add('t-secondary'); }
  clearCockpitFilter(true); updateActiveAgeIndicator(); _S.currentPage = 0; renderAll();
}

// ── Sélecteur de colonnes (tableau Articles) ──
const _COL_DEFS = [
  { key: 'famille', label: 'Famille', default: true },
  { key: 'emplacement', label: 'Emplacement', default: true },
  { key: 'V', label: 'Prélevé', default: true },
  { key: 'caAnnuel', label: 'CA', default: true },
  { key: 'enleveTotal', label: 'Enlevé', default: true },
  { key: 'W', label: 'Fréquence', default: true },
  { key: 'stockActuel', label: 'Stock', default: true },
  { key: 'couvertureJours', label: 'Couverture', default: true },
  { key: 'ageJours', label: 'Dernière vente', default: true },
  { key: 'ancien', label: 'Ancien MIN/MAX', default: true },
  { key: 'nouveauMin', label: 'MIN PRISME', default: true },
  { key: 'nouveauMax', label: 'MAX PRISME', default: true },
  { key: 'canalWeb', label: '🌐 Canal Web', default: true },
  { key: 'pullIndex', label: 'Pull %', default: false },
];
let _colVisibility = null;

function _loadColVisibility() {
  if (_colVisibility) return _colVisibility;
  try {
    const saved = localStorage.getItem('prisme_colVis');
    if (saved) { _colVisibility = JSON.parse(saved); return _colVisibility; }
  } catch {}
  _colVisibility = {};
  for (const c of _COL_DEFS) _colVisibility[c.key] = c.default;
  return _colVisibility;
}

function _saveColVisibility() {
  try { localStorage.setItem('prisme_colVis', JSON.stringify(_colVisibility)); } catch {}
}

export function initColSelector() {
  const panel = document.getElementById('colSelectorPanel');
  if (!panel) return;
  const vis = _loadColVisibility();
  panel.innerHTML = _COL_DEFS.map(c =>
    `<label class="flex items-center gap-2 py-1 cursor-pointer hover:bg-gray-700 px-1 rounded">
      <input type="checkbox" data-colkey="${c.key}" ${vis[c.key] !== false ? 'checked' : ''} class="accent-emerald-500">
      <span class="text-gray-200">${c.label}</span>
    </label>`
  ).join('') + `<div class="border-t border-gray-600 mt-2 pt-2"><button onclick="window._colResetAll()" class="text-[10px] text-cyan-400 hover:text-cyan-300">Tout afficher</button></div>`;
  panel.addEventListener('change', e => {
    const key = e.target.dataset?.colkey;
    if (!key) return;
    vis[key] = e.target.checked;
    _saveColVisibility();
    _applyColVisibility();
  });
  // Fermer au clic extérieur
  document.addEventListener('click', e => {
    const wrap = document.getElementById('colSelectorWrap');
    if (wrap && !wrap.contains(e.target)) panel.classList.add('hidden');
  });
  window._colResetAll = function() {
    for (const c of _COL_DEFS) vis[c.key] = true;
    _saveColVisibility();
    panel.querySelectorAll('input[type=checkbox]').forEach(cb => cb.checked = true);
    _applyColVisibility();
  };
  _applyColVisibility();
}

// Colonne masquée par l'utilisateur, ou vide par nature (🌐 sans aucun signal : _S._webColEmpty)
const _colOff = (vis, key) => vis[key] === false || (key === 'canalWeb' && _S._webColEmpty);
export function _applyColVisibility() {
  const vis = _loadColVisibility();
  const table = document.querySelector('#tabTable table');
  if (!table) return;
  const ths = table.querySelectorAll('thead th[data-col]');
  const colIndices = {};
  ths.forEach((th, _) => {
    // Get actual column index in the row
    const row = th.parentElement;
    let idx = 0;
    for (const child of row.children) { if (child === th) break; idx++; }
    const key = th.dataset.col;
    colIndices[key] = idx;
    th.style.display = _colOff(vis, key) ? 'none' : '';
  });
  // Apply to body cells
  const rows = table.querySelectorAll('tbody tr');
  for (const row of rows) {
    const cells = row.children;
    for (const [key, idx] of Object.entries(colIndices)) {
      if (cells[idx]) cells[idx].style.display = _colOff(vis, key) ? 'none' : '';
    }
  }
}

export function filterByAge(b) { document.getElementById('filterAge').value = b; updateActiveAgeIndicator(); _S.currentPage = 0; switchTab('table'); renderAll(); }
export function clearAgeFilter() { document.getElementById('filterAge').value = ''; updateActiveAgeIndicator(); _S.currentPage = 0; renderAll(); }

export function updateActiveAgeIndicator() {
  const v = document.getElementById('filterAge').value;
  const el = document.getElementById('activeAgeFilter');
  if (v && AGE_BRACKETS[v]) { const b = AGE_BRACKETS[v]; el.className = `text-xs font-bold px-3 py-1 rounded-full flex items-center gap-1 cursor-pointer ${b.badgeBg}`; document.getElementById('activeAgeLabel').textContent = '⏳ ' + b.label; el.classList.remove('hidden'); }
  else el.classList.add('hidden');
}

export function filterByAbcFmr(abc, fmr) {
  document.getElementById('filterABC').value = abc;
  document.getElementById('filterFMR').value = fmr;
  _S.currentPage = 0; switchTab('table'); renderAll();
}

// ── Bandeau de contexte Articles ──────────────────────────────
// Articles = la base. Quand on y arrive filtré depuis un écran de décision, un bandeau dit
// ce qu'on regarde, quoi en faire, et ramène à l'écran d'origine.
const _CTX = {
  ruptures: ['Articles fréquents en rupture', 'à commander'],
  saso: ['Articles au-dessus de leur MAX', 'à dégonfler'],
  invendus: ['Jamais vendus en 12 mois', 'à retourner à la centrale ou déstocker'],
  dormants: ['Dormants (plus de 180 jours sans mouvement)', 'à écouler'],
  anomalies: ['En stock et vendus, sans MIN/MAX dans l’ERP', 'à paramétrer'],
  fantomes: ['En stock sans emplacement', 'à ranger'],
  sansemplacement: ['En stock sans emplacement', 'à ranger'],
  stockneg: ['Stock négatif', 'à régulariser'],
  fins: ['Fins de série', 'à écouler'],
  colisrayon: ['Vendus en colis, absents du rayon', 'à stocker ?'],
};
const _TAB_NAMES = { partie: 'La partie', arbitrage: 'Arbitrage', essai: 'Banc d’essai', plan: 'Plan', clients: 'Fidélisation PDV', commerce: 'Conquête Terrain' };
function _currentTabId() {
  const pill = document.querySelector('.supertab-group.active .supertab-pill.active[data-subtab]');
  return pill?.dataset.subtab || document.querySelector('.tab-btn.active')?.getAttribute('data-tab') || '';
}
export function setTableContext(title, action) {
  const from = _currentTabId();
  _S._tableContext = { title, action, from: from && from !== 'table' ? from : (_S._tableContext?.from || '') };
}
export function renderTableContext() {
  const el = document.getElementById('tableContext');
  if (!el) return;
  const c = _S._tableContext;
  if (!c) { el.classList.add('hidden'); el.innerHTML = ''; return; }
  const n = DataStore.filteredData.length;
  el.classList.remove('hidden');
  el.innerHTML = `<div class="pt-col" style="gap:2px;min-width:0">
      <span class="pt-small pt-muted">Tu regardes</span>
      <span class="pt-strong" style="font-size:16px"><span class="pt-num">${n.toLocaleString('fr-FR')}</span> · ${escapeHtml(c.title)}${c.action ? ` <span class="pt-muted" style="font-weight:400">— ${escapeHtml(c.action)}</span>` : ''}</span>
    </div>
    <div class="pt-row" style="gap:16px;flex-wrap:wrap">
      ${c.from ? `<button type="button" class="pt-link" onclick="_tableCtxBack()">← Retour à ${escapeHtml(_TAB_NAMES[c.from] || c.from)}</button>` : ''}
      <button type="button" class="pt-link" onclick="resetFilters()">Toute la base</button>
    </div>`;
}
if (typeof window !== 'undefined') window._tableCtxBack = () => {
  const from = _S._tableContext?.from;
  resetFilters();
  if (from) switchTab(from);
};

// ── Cockpit filter ────────────────────────────────────────────
export function showCockpitInTable(type) {
  const ctx = _CTX[type];
  setTableContext(ctx ? ctx[0] : type, ctx ? ctx[1] : '');
  document.getElementById('filterCockpit').value = type;
  document.getElementById('activeCockpitLabel').textContent = { ruptures: '🚨 Ruptures', fantomes: '👻 Articles sans emplacement', sansemplacement: '📍 Sans emplacement', anomalies: '⚠️ Anomalies', saso: '📦 SASO', dormants: '💤 Dormants', fins: '📉 Fins de série', top20: '🏆 Top 20 fréquence', nouveautes: '✨ Nouveautés', colisrayon: '📦→🏪 Colis à stocker', stockneg: '📉 Stock négatif', fragiles: '🎯 Articles mono-client', phantom: '👻 Fantômes de rayon', invendus: '🧊 Jamais vendus en 12 mois' }[type] || type;
  const nbtn = document.getElementById('btnNouveautesOnly');
  if (nbtn) { const isNouv = type === 'nouveautes'; nbtn.classList.toggle('bg-emerald-500', isNouv); nbtn.classList.toggle('text-white', isNouv); nbtn.classList.toggle('s-hover', !isNouv); nbtn.classList.toggle('t-secondary', !isNouv); }
  document.getElementById('activeCockpitFilter').classList.remove('hidden');
  _S.currentPage = 0; switchTab('table');
  _S.filteredData = getFilteredData();
  sortRowsInPlace(_S.filteredData, _S.sortCol, _S.sortAsc);
  updateActiveAgeIndicator(); renderTable(true);
}

export function clearCockpitFilter(silent) {
  _S._tableContext = null;
  document.getElementById('filterCockpit').value = '';
  document.getElementById('activeCockpitFilter').classList.add('hidden');
  const nbtn = document.getElementById('btnNouveautesOnly');
  if (nbtn) { nbtn.classList.remove('bg-emerald-500', 'text-white'); nbtn.classList.add('s-hover', 't-secondary'); }
  if (!silent) { _S.currentPage = 0; renderAll(); }
}

export function _toggleNouveautesFilter() {
  const fc = document.getElementById('filterCockpit');
  if (fc && fc.value === 'nouveautes') { clearCockpitFilter(); } else { showCockpitInTable('nouveautes'); }
}

// ── Period alert ──────────────────────────────────────────────
export function updatePeriodAlert() {
  if (!_S.consommePeriodMin || !_S.consommePeriodMax) return;
  const banner = document.getElementById('periodBanner');
  if (_S.consommeMoisCouverts < 10) {
    if (banner) { banner.textContent = `⚠️ Attention : votre fichier Consommé couvre ${_S.consommeMoisCouverts} mois (${fmtDate(_S.consommePeriodMin)} → ${fmtDate(_S.consommePeriodMax)}). Pour un calcul MIN/MAX fiable, 12 mois minimum sont recommandés.`; banner.classList.add('active'); }
  } else {
    if (banner) banner.classList.remove('active');
  }
  const stockBanner = document.getElementById('stockMonoBanner');
  if (stockBanner) {
    if (_S.storeCountConsomme > 1 && _S._hasStock && _S.storeCountStock <= 1) {
      stockBanner.textContent = '⚠️ Fichier Stock mono-agence détecté — chargez un export Stock multi-agences pour activer le Réseau et le benchmark.';
      stockBanner.classList.add('active');
    } else if (_S.storeCountConsomme > 1 && !_S._hasStock) {
      stockBanner.textContent = '📊 Consommé multi-agences chargé — ajoutez le Stock pour activer l\'onglet Analyse et les analyses articles.';
      stockBanner.classList.add('active');
    } else {
      stockBanner.classList.remove('active');
    }
  }
  // Sidebar period label — reset to full range
  const tabLabel = document.getElementById('tabPeriodLabel');
  if (tabLabel) {
    tabLabel.textContent = `${fmtDate(_S.consommePeriodMin)} → ${fmtDate(_S.consommePeriodMax)} ▼`;
    tabLabel.classList.remove('filtered');
  }
  const tabBlock = document.getElementById('tabPeriodBlock');
  if (tabBlock) tabBlock.style.display = '';
}

export function renderInsightsBanner() {
  const banner = document.getElementById('insightsBanner');
  if (banner) banner.classList.add('hidden');
}

// ── Reporting ────────────────────────────────────────────────
export function openReporting() {
  const overlay = document.getElementById('reportingOverlay');
  const panel = document.getElementById('reportingPanel');
  if (!overlay || !panel) return;
  const _trigger = document.activeElement;
  const esc=t=>(t||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  const reportText = typeof generateRegionReportText==='function'?generateRegionReportText():(typeof generateReportText==='function'?generateReportText():'');
  panel.innerHTML = `<div class="flex items-center justify-between mb-4 gap-3">
    <h2 class="text-base font-extrabold text-white shrink-0">📊 Prompt Reporting ${_S.selectedMyStore || ''}</h2>
    <div class="flex items-center gap-2 shrink-0">
      <button onclick="copyReportText()" class="text-xs bg-indigo-700 hover:bg-indigo-600 text-white py-1.5 px-3 rounded-lg font-bold transition-colors">📋 Copier</button>
      <button onclick="closeReporting()" class="text-xs s-panel-inner hover:s-panel-inner t-inverse py-1.5 px-3 rounded-lg font-bold transition-colors">✕ Fermer</button>
    </div>
  </div>
  <textarea id="reportingTextarea" class="w-full s-panel t-inverse text-xs font-mono p-4 rounded-xl border b-dark resize-y" style="min-height:480px;line-height:1.75" spellcheck="false">${esc(reportText)}</textarea>
  <p class="text-[10px] t-inverse-muted mt-2">Prompt structuré — collez dans Claude, ChatGPT ou Gemini. Modifiable avant envoi.</p>`;
  overlay.classList.add('active');
  overlay._cleanupFocusTrap = focusTrap(panel, _trigger);
}

export function closeReporting() {
  const overlay = document.getElementById('reportingOverlay');
  if (overlay) { overlay._cleanupFocusTrap?.(); overlay.classList.remove('active'); }
}

// ── Focus Trap — WCAG 2.1 criterion 2.4.3 ────────────────────
export function focusTrap(container, trigger) {
  const FOCUSABLE = 'button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';
  const getFocusable = () => [...container.querySelectorAll(FOCUSABLE)].filter(el => !el.closest('[hidden]'));
  const onKey = (e) => {
    if (e.key !== 'Tab') return;
    const els = getFocusable();
    if (!els.length) return;
    const first = els[0], last = els[els.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault(); last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault(); first.focus();
    }
  };
  container.addEventListener('keydown', onKey);
  requestAnimationFrame(() => getFocusable()[0]?.focus());
  return () => {
    container.removeEventListener('keydown', onKey);
    if (trigger && document.body.contains(trigger)) trigger.focus();
  };
}

export function copyReportText() {
  const ta = document.getElementById('reportingTextarea');
  if (!ta) return;
  navigator.clipboard.writeText(ta.value)
    .then(() => showToast('📋 Rapport copié dans le presse-papier !', 'success'))
    .catch(() => { ta.select(); document.execCommand('copy'); showToast('📋 Rapport copié !', 'success'); });
}

// ── Navbar collapsible ────────────────────────────────────────
export function toggleNavKpis() {
  const detail = document.getElementById('navKpisDetail');
  const toggle = document.getElementById('navKpisToggle');
  if (!detail) return;
  const collapsed = detail.style.display === 'none';
  detail.style.display = collapsed ? 'flex' : 'none';
  if (toggle) toggle.style.transform = collapsed ? 'rotate(0deg)' : 'rotate(180deg)';
  try { localStorage.setItem('prisme_nav_collapsed', collapsed ? '0' : '1'); } catch (_) {}
}

// Restaurer l'état collapsé au chargement
(function _restoreNavState() {
  try {
    if (localStorage.getItem('prisme_nav_collapsed') === '1') {
      const detail = document.getElementById('navKpisDetail');
      const toggle = document.getElementById('navKpisToggle');
      if (detail) detail.style.display = 'none';
      if (toggle) toggle.style.transform = 'rotate(180deg)';
    }
  } catch (_) {}
})();

// ── Details smooth animations ─────────────────────────────────
export function initDetailsAnimations() {
  document.querySelectorAll('details:not([data-animated])').forEach(el => {
    el.dataset.animated = '1';
    const children = [...el.children].filter(c => c.tagName !== 'SUMMARY');
    if (children.length === 0) return;
    if (children.length === 1 && children[0].classList.contains('details-body')) return;
    const wrapper = document.createElement('div');
    wrapper.className = 'details-body';
    children.forEach(c => wrapper.appendChild(c));
    el.appendChild(wrapper);
  });
}

// ── Table sort / pagination ───────────────────────────────────
export function sortBy(c) {
  if (_S.sortCol === c) _S.sortAsc = !_S.sortAsc;
  else { _S.sortCol = c; _S.sortAsc = false; }
  _S.currentPage = 0;
  // Sorting does not require refiltering — keep the existing filtered set and resort in place.
  sortRowsInPlace(DataStore.filteredData, _S.sortCol, _S.sortAsc);
  renderTable(true);
}
export function changePage(d) { const m = Math.ceil(DataStore.filteredData.length / PAGE_SIZE) - 1; _S.currentPage = Math.max(0, Math.min(_S.currentPage + d, m)); renderTable(true); }

// ── CSV export ────────────────────────────────────────────────
export function downloadCSV() {
  const SEP = ';';
  const hd = ['Code', 'Libelle', 'Famille', 'S/Fam', 'Empl', 'Statut', 'Age', 'Tranche', 'Nouv', 'RefPere', 'Preleve', 'Enleve', 'Freq', 'Stock', 'Couverture(j)', 'PU', 'AncMin', 'AncMax', 'MIN', 'MAX', 'ABC', 'FMR', 'CAPerdu'];
  const lines = ['\uFEFF' + hd.join(SEP)];
  const data = DataStore.filteredData.length ? DataStore.filteredData : DataStore.finalData;
  for (const r of data) {
    const br = getAgeBracket(r.ageJours);
    const caPerduCSV = (r.W >= 3 && r.stockActuel <= 0 && !r.isParent && r.V > 0) ? estimerCAPerdu(r.V, r.prixUnitaire, Math.min(r.ageJours >= 999 ? 90 : r.ageJours, 90)) : 0;
    lines.push([r.code, `"${r.libelle.replace(/"/g, '""')}"`, `"${famLib(r.famille || '')}"`, `"${r.sousFamille}"`, `"${r.emplacement}"`, `"${r.statut}"`, r.ageJours, AGE_BRACKETS[br].label.replace(/[🟢🟡🟠🔴]/g, '').trim(), r.isNouveaute ? 'OUI' : 'NON', r.isParent ? 'OUI' : 'NON', r.V, r.enleveTotal || 0, r.W, r.stockActuel, r.couvertureJours >= 999 ? '' : r.couvertureJours, r.prixUnitaire.toFixed(2).replace('.', ','), r.ancienMin, r.ancienMax, r.nouveauMin, r.nouveauMax, r.abcClass || '', r.fmrClass || '', caPerduCSV || ''].join(SEP));
  }
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a'); link.href = URL.createObjectURL(blob);
  link.download = `PRISME_${_S.selectedMyStore || 'X'}_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link); link.click(); document.body.removeChild(link); URL.revokeObjectURL(link.href);
  showToast('📥 CSV téléchargé', 'success');
}

// ── Feature 2: Signal Ambiant ─────────────────────────────────
// Barre 3px en haut de l'écran reflétant l'état de santé du stock
export function updateAmbientSignal() {
  const el = document.getElementById('ambient-signal');
  if (!el) return;
  if (!DataStore.finalData.length) { el.style.setProperty('--health-color', 'transparent'); return; }

  // Taux de service : articles fréquents (W≥3) en stock ÷ total fréquents
  const freq = DataStore.finalData.filter(r => r.W >= 3 && !r.isParent && !(r.V === 0 && r.enleveTotal > 0));
  const inStock = freq.filter(r => r.stockActuel > 0).length;
  const sr = freq.length > 0 ? (inStock / freq.length * 100) : 100;

  // Ruptures critiques : W≥3, stock≤0, priorityScore≥5000
  const critRupt = DataStore.finalData.filter(r =>
    r.W >= 3 && r.stockActuel <= 0 && !r.isParent && !(r.V === 0 && r.enleveTotal > 0) &&
    calcPriorityScore(r.W, r.prixUnitaire, r.ageJours, r.code) >= 5000
  ).length;

  el.classList.remove('signal--ok', 'signal--caution', 'signal--danger', 'signal--critical');
  if (critRupt > 5)  el.classList.add('signal--critical');
  else if (sr < 85)  el.classList.add('signal--danger');
  else if (sr < 95)  el.classList.add('signal--caution');
  else               el.classList.add('signal--ok');
}

// ── Feature 3: Briefing Evidence Cards ───────────────────────
// Grille de cartes scannables au-dessus du cockpit
// cockpitBriefing supprimé — fonction conservée comme no-op pour compat
export function renderCockpitBriefing() {}


// ── Health Score ──────────────────────────────────────────────
export function renderHealthScore() {
  const el = document.getElementById('healthScoreBadge');
  if (!el) return;
  const fd = _S.finalData;
  if (!fd || !fd.length) { el.classList.add('hidden'); return; }
  const totalRefs = fd.length;
  const ruptures = fd.filter(r => r.stockActuel <= 0 && r.W >= 3 && !r.isParent).length;
  const dormants = fd.filter(r => r.ageJours >= (_S.DORMANT_DAYS || 180) && r.stockActuel > 0 && r.W <= 1).length;
  const sansMin = fd.filter(r => r.ancienMin === 0 && r.W >= 3).length;
  const surstock = fd.filter(r => r.ancienMax > 0 && r.stockActuel > r.ancienMax * 2).length;
  const actives = fd.filter(r => r.W >= 1 && !r.isParent);
  const activesOk = actives.filter(r => r.stockActuel > 0).length;
  const txService = actives.length > 0 ? Math.round(activesOk / actives.length * 100) : 100;
  const rupPct = totalRefs > 0 ? ruptures / totalRefs * 100 : 0;
  const dormPct = totalRefs > 0 ? dormants / totalRefs * 100 : 0;
  const sansMinPct = actives.length > 0 ? sansMin / actives.length * 100 : 0;
  const surstockPct = totalRefs > 0 ? surstock / totalRefs * 100 : 0;
  const score = Math.max(0, Math.min(100, Math.round(
    txService * 0.4 +
    Math.max(0, 100 - rupPct * 10) * 0.25 +
    Math.max(0, 100 - dormPct * 3) * 0.15 +
    Math.max(0, 100 - sansMinPct * 5) * 0.1 +
    Math.max(0, 100 - surstockPct * 5) * 0.1
  )));
  const color = score >= 75 ? 'var(--c-ok)' : score >= 50 ? 'var(--c-caution)' : 'var(--c-danger)';
  const label = score >= 75 ? 'Bonne santé' : score >= 50 ? 'À surveiller' : 'Critique';
  const icon = score >= 75 ? '💚' : score >= 50 ? '🟡' : '🔴';
  const dims = [
    { label: 'Taux de service', val: txService + '%', ok: txService >= 95 },
    { label: 'Ruptures', val: ruptures, ok: ruptures <= 5 },
    { label: 'Dormants', val: dormants, ok: dormants <= totalRefs * 0.05 },
    { label: 'Sans MIN', val: sansMin, ok: sansMin <= 3 },
    { label: 'Surstock', val: surstock, ok: surstock <= totalRefs * 0.03 },
  ];
  const pills = dims.map(d =>
    `<span class="text-[10px] px-2 py-0.5 rounded-full border" style="${d.ok ? 'border-color:var(--c-ok);color:var(--i-ok-text);background:var(--i-ok-bg)' : 'border-color:var(--c-caution);color:var(--i-caution-text);background:var(--i-caution-bg)'}">${d.label} : <strong>${typeof d.val === 'number' ? d.val.toLocaleString('fr') : d.val}</strong></span>`
  ).join('');
  const healthHtml = `<div class="flex items-center gap-4 py-3 px-4 s-card rounded-xl border shadow-sm flex-wrap">
    <div class="flex items-center gap-2">
      <span class="text-2xl">${icon}</span>
      <div>
        <p class="text-[10px] font-bold t-tertiary uppercase tracking-wide">Sante Stock</p>
        <p class="text-xl font-extrabold" style="color:${color}">${score}<span class="text-sm font-normal t-disabled">/100</span></p>
      </div>
      <div class="w-24 h-2.5 rounded-full bg-gray-200 overflow-hidden ml-2">
        <div class="h-full rounded-full" style="width:${score}%;background:${color}"></div>
      </div>
      <span class="text-[10px] font-bold" style="color:${color}">${label}</span>
    </div>
    <div class="flex flex-wrap gap-1.5 ml-auto">${pills}</div>
  </div>`;
  el.innerHTML = healthHtml;
  el.classList.remove('hidden');
  const hsc = document.getElementById('healthScoreContent');
  if (hsc) hsc.innerHTML = healthHtml;
  const hsi = document.getElementById('healthScoreInline');
  if (hsi) hsi.textContent = `${score}/100 — ${label}`;
}


// ── Feature 9: Lexique Ancré <abbr> ──────────────────────────
// Wraps known métier terms in <abbr class="gls"> inside <th> elements.
// Uses TreeWalker on text nodes only — never touches element attributes.
// Idempotent: skips already-processed elements (data-gloss="1").
export function wrapGlossaryTerms(root = document) {
  const MAP = [
    ['FMR',  'Fréquence : F≥12 cmd/an, M=3-11, R≤3'],
    ['ABC',  'Valeur : A=80% du CA, B=15%, C=5%'],
    ['MIN',  'Seuil de commande auto (plus gros panier écrêté + 3j sécurité)'],
    ['MAX',  'Capacité rayon (MIN + 21j si forte rotation, 10j sinon)'],
    ['Couv', 'Couverture en jours : Stock ÷ consommation/jour'],
    ['Prél', 'Prélevé : sorti du stock rayon (comptoir)'],
    ['Enl',  'Enlevé : colis commandé, ne touche pas le stock rayon'],
  ];
  const ths = root.querySelectorAll('th:not([data-gloss])');
  for (const th of ths) {
    th.dataset.gloss = '1';
    const walker = document.createTreeWalker(th, NodeFilter.SHOW_TEXT, null, false);
    const textNodes = [];
    let n;
    while ((n = walker.nextNode())) textNodes.push(n);
    for (const tn of textNodes) {
      const val = tn.nodeValue;
      for (const [term, title] of MAP) {
        const idx = val.indexOf(term);
        if (idx === -1) continue;
        const frag = document.createDocumentFragment();
        if (idx > 0) frag.appendChild(document.createTextNode(val.slice(0, idx)));
        const abbr = document.createElement('abbr');
        abbr.className = 'gls';
        abbr.title = title;
        abbr.textContent = term;
        frag.appendChild(abbr);
        const rest = val.slice(idx + term.length);
        if (rest) frag.appendChild(document.createTextNode(rest));
        tn.parentNode.replaceChild(frag, tn);
        break; // one substitution per text node to avoid iterator invalidation
      }
    }
  }
}

// ── Sprint AG: Raccourcis clavier étendus ──────────────────────
document.addEventListener('keydown', function(e) {
  // Ne pas interférer avec les inputs / textearea / contenteditable
  const tag = document.activeElement?.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || document.activeElement?.isContentEditable) return;

  // Escape : fermer overlays (diagnostic, client 360°) si ouverts
  if (e.key === 'Escape') {
    const diag = document.getElementById('diagnosticOverlay');
    if (diag && !diag.classList.contains('hidden')) { diag.classList.add('hidden'); e.preventDefault(); return; }
    const c360 = document.getElementById('client360Overlay');
    if (c360 && !c360.classList.contains('hidden')) { c360.classList.add('hidden'); e.preventDefault(); return; }
    return;
  }

  // 1–9 : écrans dans l'ordre de la barre (uniquement sans modificateur, données chargées)
  if (!e.metaKey && !e.ctrlKey && !e.altKey && !e.shiftKey && _S.finalData?.length) {
    const TAB_MAP = { '1': 'partie', '2': 'arbitrage', '3': 'plan', '4': 'portefeuille', '5': 'commerce', '6': 'duel', '7': 'animation', '8': 'associations', '9': 'table' };
    const tab = TAB_MAP[e.key];
    if (tab) { e.preventDefault(); switchTab(tab); }
  }
});

// ── _renderNoStockPlaceholder — placeholder onglet sans stock ─
export function _renderNoStockPlaceholder(ongletNom) {
  return `<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:300px;gap:16px;color:var(--t-muted)"><div style="font-size:2rem">📦</div><div style="font-size:1.1rem;font-weight:600">${ongletNom} — fichier stock non chargé</div><div style="font-size:0.9rem;max-width:400px;text-align:center">Chargez le fichier <strong>État du Stock</strong> via "Modifier les fichiers" pour accéder à cet onglet.</div></div>`;
}

// ── renderTabBadges — badges numériques sur les onglets ───────
export function renderTabBadges() {
  // Badge "Mes clients" : clients silencieux >90j avec CA PDV
  const clientsBadge = document.getElementById('navClientsBadge');
  if (clientsBadge && (_S.clientStore?.size > 0 || _S.clientLastOrder?.size > 0)) {
    let silentCount = 0;
    if (_S.clientStore?.size) {
      for (const rec of _S.clientStore.values()) {
        if (rec.silenceDaysPDV !== null && rec.silenceDaysPDV > 90 && rec.isPDVActif) silentCount++;
      }
    } else {
      const nowTs = Date.now();
      for (const [cc, dt] of _S.clientLastOrder) {
        if ((nowTs - dt) > 90 * 86400000 && _S.ventesLocalMagPeriode?.has(cc)) silentCount++;
      }
    }
    if (silentCount > 0) {
      clientsBadge.textContent = silentCount > 99 ? '99+' : silentCount;
      clientsBadge.classList.remove('hidden');
    } else {
      clientsBadge.classList.add('hidden');
    }
  }
  // Grise Articles + Mon Stock si stock non chargé
  ['table', 'stock'].forEach(tabId => {
    const btn = document.querySelector(`[onclick*="switchTab('${tabId}')"]`);
    if (btn) {
      if (!_S._hasStock) {
        btn.style.opacity = '0.45';
        btn.title = 'Nécessite le fichier stock';
        btn.style.pointerEvents = 'none';
      } else {
        btn.style.opacity = '';
        btn.title = '';
        btn.style.pointerEvents = '';
      }
    }
  });
}


