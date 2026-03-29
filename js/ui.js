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
import { fmtDate, formatEuro, _isMetierStrategique, famLib, famLabel, normalizeStr, matchQuery } from './utils.js';
import { _S } from './state.js';
import { DataStore } from './store.js'; // Strangler Fig Étape 5
import { calcPriorityScore, computeHealthScore } from './engine.js';
import { _nlInterpret, _nlRenderResults } from './nl.js';


// ── Toast notifications ───────────────────────────────────────
export function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer'); if (!container) return;
  const toast = document.createElement('div');
  const colors = { success: 'i-ok-bg border-emerald-500 c-ok', error: 'i-danger-bg border-red-500 c-danger', warning: 'i-caution-bg border-amber-500 c-caution', info: 'i-info-bg border-blue-500 c-action' };
  toast.className = `p-3 rounded-lg shadow-lg border-l-4 font-bold text-xs flex items-center gap-2 toast-enter pointer-events-auto ${colors[type] || colors.info}`;
  toast.innerHTML = message;
  container.appendChild(toast);
  setTimeout(() => { toast.classList.replace('toast-enter', 'toast-leave'); setTimeout(() => toast.remove(), 300); }, 3500);
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

export function showTerritoireLoading(show) {
  const sp = document.getElementById('terrLoadingSpinner');
  if (sp) sp.classList.toggle('hidden', !show);
}

export function updateTerrProgress(cur, total) {
  const pct2 = total > 0 ? Math.round(cur / total * 100) : 0;
  const bar = document.getElementById('terrProgressBar');
  const txt = document.getElementById('terrProgressText');
  if (bar) bar.style.width = pct2 + '%';
  if (txt) txt.textContent = pct2 + '%';
  const pipe = document.getElementById('pipeTerritoire');
  if (pipe && pct2 < 100) pipe.textContent = `🔗 Territoire… ${pct2}%`;
}

// ── Import zone collapse ──────────────────────────────────────
export function onFileSelected(i, id) {
  if (i.files.length > 0 && DataStore.finalData.length > 0) {
    if (!confirm('⚠️ Vous avez une analyse en cours. Charger un nouveau fichier remplacera toutes les données. Continuer ?')) {
      i.value = '';
      return;
    }
  }
  document.getElementById(id).classList.toggle('file-loaded', i.files.length > 0);
}

export function collapseImportZone(nbFiles, store, nbArts, elapsed) {
  const iz = document.getElementById('importZone');
  const bannerRight = document.getElementById('insightsBannerRight');
  const banner = document.getElementById('insightsBanner');
  if (!iz || !bannerRight || !banner) return;
  bannerRight.innerHTML = `<button onclick="expandImportZone()" style="font-size:var(--fs-xs);color:rgba(255,255,255,0.35);background:none;border:1px solid rgba(255,255,255,0.15);border-radius:4px;padding:1px 8px;cursor:pointer;transition:color .15s,border-color .15s" onmouseover="this.style.color='rgba(255,255,255,0.65)';this.style.borderColor='rgba(255,255,255,0.3)'" onmouseout="this.style.color='rgba(255,255,255,0.35)';this.style.borderColor='rgba(255,255,255,0.15)'">Modifier les fichiers</button><button onclick="document.getElementById('glossaire').classList.toggle('hidden')" style="font-size:var(--fs-xs);color:rgba(255,255,255,0.35);background:none;border:1px solid rgba(255,255,255,0.15);border-radius:4px;padding:1px 8px;cursor:pointer;margin-left:6px;transition:color .15s,border-color .15s" onmouseover="this.style.color='rgba(255,255,255,0.65)';this.style.borderColor='rgba(255,255,255,0.3)'" onmouseout="this.style.color='rgba(255,255,255,0.35)';this.style.borderColor='rgba(255,255,255,0.15)'">Glossaire</button>`;
  iz.classList.add('hidden');
  document.getElementById('onboardingBlock')?.classList.add('hidden');
  banner.classList.remove('hidden');
}

export function expandImportZone() {
  const iz = document.getElementById('importZone');
  const bannerRight = document.getElementById('insightsBannerRight');
  const bannerLeft = document.getElementById('insightsBannerLeft');
  const banner = document.getElementById('insightsBanner');
  if (iz) iz.classList.remove('hidden');
  if (bannerRight) bannerRight.innerHTML = '';
  if (banner && bannerLeft && !bannerLeft.innerHTML.trim()) banner.classList.add('hidden');
  if (DataStore.finalData.length > 0) {
    const btn = document.getElementById('importZoneCancelBtn');
    if (btn) { btn.classList.remove('hidden'); btn.style.display = 'flex'; }
  }
}

// ── Canal global — pill selector ──────────────────────────────
export function _setGlobalCanal(canal) {
  _S._globalCanal = canal;
  // _reseauCanaux est indépendant — géré par _toggleReseauCanal
  // Invalider les caches
  _S._benchCache = null;
  _S._tabRendered = {};
  _S._terrCanalCache = new Map();
  // Sync active state sur les pills globales
  document.querySelectorAll('#globalCanalFilter .canal-pill-btn').forEach(p => {
    p.classList.toggle('active', (p.dataset.canal || '') === canal);
  });
  // Recalculer le benchmark puis re-render onglet actif
  if (typeof window.computeBenchmark === 'function') window.computeBenchmark(_S._globalCanal || null);
  if (typeof window.renderCurrentTab === 'function') window.renderCurrentTab();
}
if (typeof window !== 'undefined') window._setGlobalCanal = _setGlobalCanal;

// ── Tab navigation ────────────────────────────────────────────
export function switchTab(id) {
  window.scrollTo(0, 0);
  document.querySelectorAll('.tab-content').forEach(e => e.classList.add('hidden'));
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  const tab = document.getElementById('tab' + id.charAt(0).toUpperCase() + id.slice(1)); if (tab) tab.classList.remove('hidden');
  const btn = document.querySelector(`[data-tab="${id}"]`);
  if (btn) {
    btn.classList.add('active');
    // Lazy render: first visit to this tab triggers render if data is loaded
    if (!_S._tabRendered[id] && (DataStore.finalData.length > 0 || _S.ventesClientArticle?.size > 0)) renderCurrentTab();
  }
  // Update filter panel groups based on active tab
  const groups = { stock: 'filterGroupStock', territoire: 'filterGroupTerritoire', bench: 'filterGroupBench', promo: 'filterGroupPromo' };
  const activeGroup = id === 'bench' ? 'bench' : id === 'territoire' ? 'territoire' : id === 'promo' ? 'promo' : 'stock';
  Object.entries(groups).forEach(([key, gid]) => {
    const el = document.getElementById(gid); if (!el) return;
    el.classList.toggle('hidden', key !== activeGroup);
  });
  // Masquer les filtres stock sur Ce matin (non pertinents)
  const gf = document.getElementById('globalFilters');
  if (gf) gf.classList.toggle('hidden', id === 'action');
  // Filtre canal global — visible sur action/territoire/promo uniquement (bench a son propre #reseauCanalBar)
  const _CANAL_TABS = new Set(['action', 'territoire', 'promo']);
  const gcf = document.getElementById('globalCanalFilter');
  if (gcf) gcf.classList.toggle('hidden', !_CANAL_TABS.has(id));
  // Titre sidebar par onglet
  const _sidebarTitles = { action: "Aujourd'hui", dash: 'Filtres Stock', abc: 'Filtres Vue 360', table: 'Filtres', territoire: 'Filtres Commerce', bench: 'Filtres Réseau', promo: 'Animation' };
  const _st = _sidebarTitles[id] || 'Filtres';
  const _stEl = document.getElementById('sidebarGroupTitle'); if (_stEl) _stEl.textContent = _st;
  const _stD = document.getElementById('sidebarDesktopTitle'); if (_stD) _stD.textContent = _st;
  // Blocs sidebar Ce matin — visibles uniquement sur Ce matin
  const csb = document.getElementById('cematinScoreBlock');
  if (csb) csb.classList.toggle('hidden', id !== 'action');
  const css = document.getElementById('cematinSearchBlock');
  if (css) css.classList.toggle('hidden', id !== 'action');
}

// ── Filter drawer (mobile) ─────────────────────────────────────
export function openFilterDrawer() {
  const panel = document.getElementById('filterPanel');
  const overlay = document.getElementById('filterOverlay');
  if (panel) panel.classList.add('drawer-open');
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

// ── Filters ───────────────────────────────────────────────────
export function getFilteredData() {
  const fam = (document.getElementById('filterFamille').value || '').trim(), sFam = (document.getElementById('filterSousFamille').value || '').trim(), emp = (document.getElementById('filterEmplacement').value || '').trim(), stat = document.getElementById('filterStatut').value, af = document.getElementById('filterAge').value;
  const cockpitType = document.getElementById('filterCockpit').value;
  const abc = document.getElementById('filterABC').value, fmr = document.getElementById('filterFMR').value;
  const searchQuery = document.getElementById('searchInput').value.trim();
  const filtered = DataStore.finalData.filter(r => {
    if(fam){
      const famCode = r.famille||'';
      if(!matchQuery(fam, famLib(famCode), famCode, famLabel(famCode))) return false;
    }
    if (sFam && !matchQuery(sFam, r.sousFamille || '')) return false;
    if (emp && !matchQuery(emp, r.emplacement || '')) return false;
    if (stat && r.statut !== stat) return false;
    if (af) { const b = AGE_BRACKETS[af]; if (b && (r.ageJours < b.min || r.ageJours >= b.max)) return false; }
    if (cockpitType && _S.cockpitLists[cockpitType] && !_S.cockpitLists[cockpitType].has(r.code)) return false;
    if (abc && r.abcClass !== abc) return false;
    if (fmr && r.fmrClass !== fmr) return false;
    if (searchQuery) { return matchQuery(searchQuery, r.code, r.libelle, famLib(r.famille || '')); }
    return true;
  });
  let activeCount = 0; if (fam) activeCount++; if (sFam) activeCount++; if (emp) activeCount++; if (stat) activeCount++; if (af) activeCount++; if (searchQuery) activeCount++; if (cockpitType) activeCount++; if (abc) activeCount++; if (fmr) activeCount++;
  const el = document.getElementById('filterActiveCount'); if (el) el.textContent = activeCount > 0 ? `(${activeCount} actif${activeCount > 1 ? 's' : ''})` : '';
  return filtered;
}

export function renderAll() {
  _S.filteredData = getFilteredData();
  _S.filteredData.sort((a, b) => { let vA = a[_S.sortCol], vB = b[_S.sortCol]; if (typeof vA === 'string') vA = vA.toLowerCase(); if (typeof vB === 'string') vB = vB.toLowerCase(); if (vA < vB) return _S.sortAsc ? -1 : 1; if (vA > vB) return _S.sortAsc ? 1 : -1; return 0; });
  updateActiveAgeIndicator();
  renderTable(true); // articles always re-renders (exception: not behind lazy flag)
  _S._tabRendered = {}; // invalidate all tab caches (filter or data changed)
  renderCurrentTab(); // render only the currently active non-articles tab
  updateAmbientSignal();
  // Wrap glossary terms in <th> headers (idempotent — skips already-processed elements)
  requestAnimationFrame(() => wrapGlossaryTerms(document));
}

export function onFilterChange() { _S.currentPage = 0; clearCockpitFilter(true); renderAll(); }
export function debouncedRender() { clearTimeout(_S.debounceTimer); _S.debounceTimer = setTimeout(() => { _S.currentPage = 0; renderAll(); }, 250); }

export function resetFilters() {
  document.getElementById('searchInput').value = '';
  ['filterFamille', 'filterSousFamille', 'filterEmplacement', 'filterStatut', 'filterAge', 'filterABC', 'filterFMR'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  clearCockpitFilter(true); updateActiveAgeIndicator(); _S.currentPage = 0; renderAll();
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

// ── Cockpit filter ────────────────────────────────────────────
export function showCockpitInTable(type) {
  document.getElementById('filterCockpit').value = type;
  document.getElementById('activeCockpitLabel').textContent = { ruptures: '🚨 Ruptures', fantomes: '👻 Articles sans emplacement', sansemplacement: '📍 Sans emplacement', anomalies: '⚠️ Anomalies', saso: '📦 SASO', dormants: '💤 Dormants', fins: '📉 Fins de série', top20: '🏆 Top 20 fréquence', nouveautes: '✨ Nouveautés', colisrayon: '📦→🏪 Colis à stocker', stockneg: '📉 Stock négatif', fragiles: '🎯 Articles mono-client', phantom: '👻 Fantômes de rayon' }[type] || type;
  const nbtn = document.getElementById('btnNouveautesOnly');
  if (nbtn) { const isNouv = type === 'nouveautes'; nbtn.classList.toggle('bg-emerald-500', isNouv); nbtn.classList.toggle('text-white', isNouv); nbtn.classList.toggle('s-hover', !isNouv); nbtn.classList.toggle('t-secondary', !isNouv); }
  document.getElementById('activeCockpitFilter').classList.remove('hidden');
  _S.currentPage = 0; switchTab('table');
  _S.filteredData = getFilteredData();
  _S.filteredData.sort((a, b) => { let vA = a[_S.sortCol], vB = b[_S.sortCol]; if (typeof vA === 'string') vA = vA.toLowerCase(); if (typeof vB === 'string') vB = vB.toLowerCase(); if (vA < vB) return _S.sortAsc ? -1 : 1; if (vA > vB) return _S.sortAsc ? 1 : -1; return 0; });
  updateActiveAgeIndicator(); renderTable(true);
}

export function clearCockpitFilter(silent) {
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
    if (_S.storeCountConsomme > 1 && _S.storeCountStock <= 1) {
      stockBanner.textContent = '⚠️ Fichier Stock mono-agence détecté — chargez un export Stock multi-agences pour activer le Réseau et le benchmark.';
      stockBanner.classList.add('active');
    } else {
      stockBanner.classList.remove('active');
    }
  }
  const btn = document.getElementById('navPeriodBtn');
  const navPeriod = document.getElementById('navPeriod');
  if (btn) { btn.textContent = `${fmtDate(_S.consommePeriodMin)} → ${fmtDate(_S.consommePeriodMax)}`; }
  if (navPeriod) navPeriod.classList.remove('hidden');
  // Tab bar period button — reset to full range label
  const tabLabel = document.getElementById('tabPeriodLabel');
  if (tabLabel) tabLabel.textContent = `${fmtDate(_S.consommePeriodMin)} → ${fmtDate(_S.consommePeriodMax)}`;
  const tabBtn = document.getElementById('tabPeriodBtn');
  if (tabBtn) tabBtn.classList.remove('filtered');
}

export function renderInsightsBanner() {
  const el = document.getElementById('insightsBannerLeft');
  const banner = document.getElementById('insightsBanner');
  if (!el || !banner) return;
  const { ruptures, dormants, absentsTerr, extClients, hasTerr } = _S._insights;
  if (!ruptures && !dormants && !absentsTerr && !extClients) {
    el.innerHTML = '';
    const right = document.getElementById('insightsBannerRight');
    if (!right || !right.innerHTML.trim()) banner.classList.add('hidden');
    return;
  }
  const mkLink = (num, txt, tab, col) => `<span style="cursor:pointer;color:rgba(255,255,255,0.55);white-space:nowrap;transition:color .15s" onmouseover="this.style.color='rgba(255,255,255,0.9)'" onmouseout="this.style.color='rgba(255,255,255,0.55)'" onclick="switchTab('${tab}')"><span style="color:${col};font-weight:600">${num}</span> ${txt}</span>`;
  const mkAction = (num, txt, fn, col) => `<span style="cursor:pointer;color:rgba(255,255,255,0.55);white-space:nowrap;transition:color .15s" onmouseover="this.style.color='rgba(255,255,255,0.9)'" onmouseout="this.style.color='rgba(255,255,255,0.55)'" onclick="${fn}"><span style="color:${col};font-weight:600">${num}</span> ${txt}</span>`;
  const sep = `<span style="color:rgba(255,255,255,0.18);margin:0 6px">·</span>`;
  const parts = [];
  parts.push(mkAction(ruptures, `rupture${ruptures !== 1 ? 's' : ''} critiques`, "showCockpitInTable('ruptures')", 'var(--i-error-dark-text)'));
  if (hasTerr) {
    parts.push(mkLink(absentsTerr, `article${absentsTerr !== 1 ? 's' : ''} absents du rayon`, `territoire`, 'var(--i-warn-dark-text)'));
    parts.push(mkLink(extClients, `client${extClients !== 1 ? 's' : ''} hors agence`, `territoire`, 'var(--i-warn-dark-text)'));
  } else {
    parts.push(mkAction(dormants, `dormant${dormants !== 1 ? 's' : ''} à traiter`, "showCockpitInTable('dormants')", 'var(--i-warn-dark-text)'));
  }
  el.innerHTML = `<span style="color:rgba(255,255,255,0.25);margin-right:8px;font-size:var(--fs-xs);letter-spacing:.05em;text-transform:uppercase">Détecté</span>` + parts.join(sep);
  banner.classList.remove('hidden');
}

// ── Reporting ────────────────────────────────────────────────
export function openReporting() {
  const overlay = document.getElementById('reportingOverlay');
  const panel = document.getElementById('reportingPanel');
  if (!overlay || !panel) return;
  const text = generateReportText();
  panel.innerHTML = `<div class="flex items-center justify-between mb-4 gap-3">
    <h2 class="text-base font-extrabold text-white shrink-0">📊 Reporting ${_S.selectedMyStore || ''}</h2>
    <div class="flex items-center gap-2 shrink-0">
      <button onclick="copyReportText()" class="text-xs bg-indigo-700 hover:bg-indigo-600 text-white py-1.5 px-3 rounded-lg font-bold transition-colors">📋 Copier</button>
      <button onclick="closeReporting()" class="text-xs s-panel-inner hover:s-panel-inner t-inverse py-1.5 px-3 rounded-lg font-bold transition-colors">✕ Fermer</button>
    </div>
  </div>
  <textarea id="reportingTextarea" class="w-full s-panel t-inverse text-xs font-mono p-4 rounded-xl border b-dark resize-y" style="min-height:480px;line-height:1.75" spellcheck="false">${text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}</textarea>
  <p class="text-[10px] t-inverse-muted mt-2">Texte brut — collez directement dans Excel, Teams ou un email. Modifiable avant envoi.</p>`;
  overlay.classList.add('active');
}

export function closeReporting() {
  const overlay = document.getElementById('reportingOverlay');
  if (overlay) overlay.classList.remove('active');
}

export function copyReportText() {
  const ta = document.getElementById('reportingTextarea');
  if (!ta) return;
  navigator.clipboard.writeText(ta.value)
    .then(() => showToast('📋 Rapport copié dans le presse-papier !', 'success'))
    .catch(() => { ta.select(); document.execCommand('copy'); showToast('📋 Rapport copié !', 'success'); });
}

// ── Table sort / pagination ───────────────────────────────────
export function sortBy(c) { if (_S.sortCol === c) _S.sortAsc = !_S.sortAsc; else { _S.sortCol = c; _S.sortAsc = false; } _S.currentPage = 0; renderTable(); }
export function changePage(d) { const m = Math.ceil(DataStore.filteredData.length / PAGE_SIZE) - 1; _S.currentPage = Math.max(0, Math.min(_S.currentPage + d, m)); renderTable(true); }

// ── KPI history ───────────────────────────────────────────────
export function clearSavedKPI() { _S.kpiHistory = []; document.getElementById('compareBlock').classList.add('hidden'); showToast('🗑️ Historique effacé.', 'success'); }

export function exportKPIhistory() {
  if (!_S.kpiHistory.length) { showToast('⚠️ Lancez d\'abord une analyse.', 'warning'); return; }
  const blob = new Blob([JSON.stringify({ magasin: _S.selectedMyStore, exportDate: new Date().toISOString(), history: _S.kpiHistory }, null, 2)], { type: 'application/json' });
  const link = document.createElement('a'); link.href = URL.createObjectURL(blob);
  link.download = 'PRISME_historique_' + (_S.selectedMyStore || 'X') + '_' + new Date().toISOString().slice(0, 10) + '.json';
  document.body.appendChild(link); link.click(); document.body.removeChild(link); URL.revokeObjectURL(link.href);
  showToast('📥 Historique exporté', 'success');
}

export function importKPIhistory(input) {
  if (!input.files.length) return;
  const reader = new FileReader();
  reader.onload = function (e) { try { const data = JSON.parse(e.target.result); if (data.history && data.history.length) { _S.kpiHistory = data.history; showToast(`✅ ${data.history.length} entrée(s) importée(s). Relancez l'analyse.`, 'success'); renderAll(); } else { showToast('❌ Fichier invalide.', 'error'); } } catch (err) { showToast('❌ Erreur : ' + err.message, 'error'); } };
  reader.readAsText(input.files[0]); input.value = '';
}

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

// ═══════════════════════════════════════════════════════════════
// COMMAND PALETTE (Cmd+K)
// ═══════════════════════════════════════════════════════════════

const _CMD_ACTIONS = [
  { kw: ['rupture','ruptures'], icon: '🚨', label: 'Voir les ruptures', fn: () => { showCockpitInTable('ruptures'); } },
  { kw: ['dormant','dormants'], icon: '💤', label: 'Voir les dormants', fn: () => { showCockpitInTable('dormants'); } },
  { kw: ['anomalie','anomalies'], icon: '⚠️', label: 'Voir les anomalies', fn: () => { showCockpitInTable('anomalies'); } },
  { kw: ['saso'], icon: '📦', label: 'Voir les SASO', fn: () => { showCockpitInTable('saso'); } },
  { kw: ['silencieux','silent','clients silencieux'], icon: '🤫', label: 'Clients silencieux (Le Terrain)', fn: () => { switchTab('territoire'); } },
  { kw: ['reporting','report','rapport'], icon: '📊', label: 'Ouvrir le reporting', fn: () => { openReporting(); } },
  { kw: ['mes clients','clients','reconquête','reconquete','opportunités'], icon: '👥', label: 'Onglet Mes clients', fn: () => { switchTab('clients'); } },
  { kw: ['promo'], icon: '🎯', label: 'Onglet Promo', fn: () => { switchTab('promo'); } },
  { kw: ['radar','abc','fmr','matrice'], icon: '📡', label: 'Onglet Radar (ABC/FMR)', fn: () => { switchTab('abc'); } },
  { kw: ['terrain','territoire'], icon: '🔗', label: 'Onglet Le Terrain', fn: () => { switchTab('territoire'); } },
  { kw: ['réseau','reseau','benchmark','bench'], icon: '🔭', label: 'Onglet Le Réseau', fn: () => { switchTab('bench'); } },
  { kw: ['ce matin','matin','cockpit','actions','urgences','file de décision','dq'], icon: '🌅', label: 'Onglet Ce matin', fn: () => { switchTab('action'); } },
  { kw: ['stock','mon stock','dashboard'], icon: '📦', label: 'Onglet Mon Stock', fn: () => { switchTab('dash'); } },
  { kw: ['articles','table','liste'], icon: '📋', label: 'Onglet Articles', fn: () => { switchTab('table'); } },
  { kw: ['export','csv','télécharger'], icon: '📥', label: 'Exporter CSV', fn: () => { downloadCSV(); } },
  { kw: ['glossaire'], icon: '🧠', label: 'Afficher le glossaire', fn: () => { const g = document.getElementById('glossaire'); if (g) { g.classList.toggle('hidden'); g.scrollIntoView({ behavior: 'smooth' }); } } },
];

let _cmdTimer = null;
let _cmdSelectedIdx = -1;
let _cmdItems = []; // flat list of rendered clickable items for keyboard nav

export function openCmdPalette() {
  const pal = document.getElementById('cmdPalette');
  const inp = document.getElementById('cmdInput');
  if (!pal || !inp) return;
  pal.classList.remove('hidden');
  inp.value = '';
  _cmdSelectedIdx = -1;
  _cmdRender('');
  setTimeout(() => inp.focus(), 30);
}

export function closeCmdPalette() {
  const pal = document.getElementById('cmdPalette');
  if (pal) pal.classList.add('hidden');
  _cmdSelectedIdx = -1;
  _cmdItems = [];
}

export function _cmdRender(q) {
  const res = document.getElementById('cmdResults');
  if (!res) return;
  const groups = _cmdBuildResults(q.trim());
  if (!groups.length) {
    res.innerHTML = '<div class="cmd-empty">Aucun résultat — essayez "ruptures", un code article ou un nom client</div>';
    _cmdItems = [];
    return;
  }
  let html = '';
  _cmdItems = [];
  let idx = 0;
  for (const g of groups) {
    html += `<div class="cmd-group-header">${g.header} <span class="opacity-60">(${g.items.length})</span></div>`;
    for (const item of g.items) {
      const dataIdx = idx++;
      _cmdItems.push(item);
      html += `<div class="cmd-item" data-cidx="${dataIdx}" onclick="_cmdExec(${dataIdx})">
        <span class="cmd-item-icon">${item.icon}</span>
        <div class="min-w-0 flex-1">
          <div class="cmd-item-main">${item.main}</div>
          ${item.sub ? `<div class="cmd-item-sub">${item.sub}</div>` : ''}
        </div>
        ${item.badge ? `<span class="cmd-item-badge ${item.badgeCls || 's-hover t-secondary'}">${item.badge}</span>` : ''}
        <span class="t-disabled text-xs ml-1">↵</span>
      </div>`;
    }
  }
  res.innerHTML = html;
}

export function _cmdBuildResults(q) {
  const groups = [];
  const ql = normalizeStr(q);

  // 1. Quick actions
  const matchedActions = [];
  for (const a of _CMD_ACTIONS) {
    if (!q || a.kw.some(k => { const kn = normalizeStr(k); return kn.includes(ql) || ql.includes(kn.split(' ')[0]); })) {
      matchedActions.push({ icon: a.icon, main: a.label, sub: '', fn: a.fn });
      if (matchedActions.length >= 5) break;
    }
  }
  if (matchedActions.length) groups.push({ header: '⚡ Actions', items: matchedActions });

  if (!q) return groups;

  // 2. Articles (search DataStore.finalData)
  if (typeof DataStore.finalData !== 'undefined' && DataStore.finalData.length) {
    const artResults = [];
    for (const r of DataStore.finalData) {
      if (artResults.length >= 5) break;
      if (matchQuery(q, r.code, r.libelle, famLib(r.famille || ''))) {
        const stockColor = r.stockActuel <= 0 ? 'i-danger-bg c-danger' : 'i-ok-bg c-ok';
        artResults.push({
          icon: '📦',
          main: `<span class="font-mono text-[10px] t-disabled mr-1">${r.code}</span>${_cmdEsc(r.libelle)}`,
          sub: `${famLib(r.famille || '') || '—'} · Stock: ${r.stockActuel}`,
          badge: [r.abcClass, r.fmrClass].filter(Boolean).join(''),
          badgeCls: 'bg-indigo-100 text-indigo-700',
          fn: () => {
            document.getElementById('searchInput').value = r.code;
            switchTab('table');
            onFilterChange();
          }
        });
      }
    }
    if (artResults.length) groups.push({ header: '📦 Articles', items: artResults });
  }

  // 3. Clients (_S.chalandiseData + _S.clientNomLookup fallback)
  const clientResults = [];
  if (typeof _S.chalandiseData !== 'undefined' && _S.chalandiseData.size) {
    for (const [code, info] of _S.chalandiseData) {
      if (clientResults.length >= 5) break;
      if (matchQuery(q, code, info.nom || '')) {
        const ca = _cmdClientCA(code);
        const isActif = (info.statut || '').toLowerCase().includes('actif');
        clientResults.push({
          icon: '👤',
          main: `<span class="font-mono text-[10px] t-disabled mr-1">${code}</span>${_cmdEsc(info.nom || code)}`,
          sub: [info.metier, ca ? ca + '€ CA' : ''].filter(Boolean).join(' · '),
          badge: isActif ? 'Actif' : (info.statut || ''),
          badgeCls: isActif ? 'i-ok-bg c-ok' : 's-hover t-tertiary',
          fn: () => {
            switchTab('territoire');
            setTimeout(() => {
              const searchInput = document.getElementById('terrClientSearch');
              if (searchInput) { searchInput.value = info.nom || code; searchInput.dispatchEvent(new Event('input')); }
              const block = document.getElementById('terrClientsBlock');
              if (block) block.scrollIntoView({ behavior: 'smooth' });
            }, 300);
          }
        });
      }
    }
  }
  if (clientResults.length < 5 && typeof _S.clientNomLookup !== 'undefined') {
    for (const [code, nom] of Object.entries(_S.clientNomLookup)) {
      if (clientResults.length >= 5) break;
      if (typeof _S.chalandiseData !== 'undefined' && _S.chalandiseData.has(code)) continue;
      if (matchQuery(q, code, nom || '')) {
        clientResults.push({
          icon: '👤',
          main: `<span class="font-mono text-[10px] t-disabled mr-1">${code}</span>${_cmdEsc(nom || code)}`,
          sub: '',
          fn: () => {
            switchTab('territoire');
            setTimeout(() => {
              const searchInput = document.getElementById('terrClientSearch');
              if (searchInput) { searchInput.value = nom || code; searchInput.dispatchEvent(new Event('input')); }
              const block = document.getElementById('terrClientsBlock');
              if (block) block.scrollIntoView({ behavior: 'smooth' });
            }, 300);
          }
        });
      }
    }
  }
  if (clientResults.length) groups.push({ header: '👥 Clients', items: clientResults });

  // 4. Familles
  if (typeof DataStore.finalData !== 'undefined' && DataStore.finalData.length) {
    const famSet = new Set();
    DataStore.finalData.forEach(r => { if (r.famille) famSet.add(famLib(r.famille)); });
    const famResults = [];
    for (const f of famSet) {
      if (famResults.length >= 3) break;
      if (matchQuery(q, f)) {
        famResults.push({
          icon: '🏷️',
          main: _cmdEsc(famLabel(f)),
          sub: 'Filtrer par famille',
          fn: () => {
            document.getElementById('filterFamille').value = f;
            switchTab('table');
            onFilterChange();
          }
        });
      }
    }
    if (famResults.length) groups.push({ header: '🏷️ Familles', items: famResults });
  }

  // 5. Agences (_S.storesIntersection)
  if (typeof _S.storesIntersection !== 'undefined' && _S.storesIntersection.size > 1) {
    const agResults = [];
    for (const s of _S.storesIntersection) {
      if (agResults.length >= 3) break;
      if (s !== _S.selectedMyStore && matchQuery(q, s)) {
        agResults.push({
          icon: '🏪',
          main: s,
          sub: 'Comparer dans Le Réseau',
          badge: s === _S.selectedMyStore ? 'Mon agence' : '',
          fn: () => {
            switchTab('bench');
            const sel = document.getElementById('obsCompareSelect');
            if (sel) { sel.value = s; sel.dispatchEvent(new Event('change')); }
          }
        });
      }
    }
    if (agResults.length) groups.push({ header: '🏪 Agences', items: agResults });
  }

  // 6. NL Search — si la requête matche l'interpréteur
  const nlPreview = _nlInterpret(q);
  if (nlPreview) {
    groups.push({ header: '🔍 Recherche intelligente', items: [{
      icon: '🔍',
      main: _cmdEsc(q),
      sub: nlPreview.title,
      badge: 'Ce matin',
      badgeCls: 'bg-amber-100 text-amber-700',
      fn: () => { switchTab('action'); setTimeout(() => _cematinSearch(q), 80); }
    }]});
  }

  return groups;
}

export function _cmdClientCA(code) {
  if (typeof DataStore.ventesClientArticle === 'undefined') return '';
  const arts = DataStore.ventesClientArticle.get(code);
  if (!arts) return '';
  let total = 0;
  for (const v of arts.values()) total += (v.sumCA || 0);
  return total > 0 ? formatEuro(total).replace('€','').trim() : '';
}

export function _cmdEsc(s) {
  return (s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

export function _cmdExec(idx) {
  const item = _cmdItems[idx];
  if (!item) return;
  closeCmdPalette();
  if (item.fn) item.fn();
}

export function _cmdMoveSelection(dir) {
  const items = document.querySelectorAll('#cmdResults .cmd-item');
  if (!items.length) return;
  items.forEach(el => el.classList.remove('cmd-selected'));
  _cmdSelectedIdx = Math.max(0, Math.min(_cmdSelectedIdx + dir, items.length - 1));
  const sel = items[_cmdSelectedIdx];
  if (sel) { sel.classList.add('cmd-selected'); sel.scrollIntoView({ block: 'nearest' }); }
}

/// ── Ce matin : NL search ────────────────────────────────────────────────────
export function _cematinSearch(q) {
  if (!q || !q.trim()) return;
  const inp = document.getElementById('cematinSearchInput');
  if (inp && inp.value !== q.trim()) inp.value = q.trim();
  const result = _nlInterpret(q);
  if (result) {
    _nlRenderResults(result);
    const el = document.getElementById('cematinResults');
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    return;
  }
  // Fallback → Promo
  _nlRenderResults(null);
  const promoInput = document.getElementById('promoSearchInput');
  if (promoInput) promoInput.value = q.trim();
  switchTab('promo');
  if (typeof window.runPromoSearch === 'function') window.runPromoSearch();
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
    calcPriorityScore(r.W, r.prixUnitaire, r.ageJours) >= 5000
  ).length;

  let height, bg;
  if (critRupt > 5) {
    // Critique : épais + hachuré
    height = '7px';
    bg = 'repeating-linear-gradient(45deg,var(--c-danger),var(--c-danger) 4px,rgba(220,38,38,.3) 4px,rgba(220,38,38,.3) 8px)';
  } else if (sr < 85) {
    height = '7px';
    bg = 'var(--c-danger)';
  } else if (sr < 95) {
    height = '5px';
    bg = 'var(--c-caution)';
  } else {
    height = '3px';
    bg = 'var(--c-ok)';
  }
  el.style.height = height;
  el.style.background = bg;
}

// ── Feature 3: Briefing 3 Phrases ────────────────────────────
// Génère 1–3 phrases de contexte au-dessus du cockpit
export function renderCockpitBriefing() {
  const el = document.getElementById('cockpitBriefing');
  const textEl = document.getElementById('cockpitBriefingText');
  if (!el || !textEl || !DataStore.finalData.length) { if (el) el.classList.add('hidden'); return; }

  const d = _S._briefingData || {};
  const lstR = d.lstR || [];
  const totalCAPerdu = d.totalCAPerdu || 0;
  const dormantStock = d.dormantStock || 0;
  const capalinOverflow = d.capalinOverflow || 0;
  const sr = d.sr != null ? String(d.sr) : null;
  const hasMulti = d.hasMulti || false;

  const n = (val, cls, tip) => `<span class="briefing-num ${cls}" title="${tip}">${val}</span>`;
  const sentences = [];

  // 1. Ruptures + CA perdu (toujours présent)
  if (lstR.length > 0) {
    const top3 = lstR.slice(0, 3).map(r => r.lib.substring(0, 22)).join(', ');
    let caText;
    if (hasMulti) {
      caText = `~${n(formatEuro(totalCAPerdu), 'c-danger', 'CA perdu estimé vs médiane réseau')} de CA perdu`;
    } else if (totalCAPerdu >= 100) {
      caText = `~${n(formatEuro(totalCAPerdu), 'c-danger', 'CA historique des articles en rupture')} de CA en rupture`;
    } else {
      caText = `CA non estimable (historique insuffisant)`;
    }
    sentences.push({ icon: '🚨', color: 'c-danger', text: `${n(lstR.length, 'c-danger', `${lstR.length} articles fréquents (W≥3) en rupture`)} rupture${lstR.length > 1 ? 's' : ''}\u00a0— ${caText}. Top\u00a0: ${top3}.` });
  } else {
    sentences.push({ icon: '✅', color: 'c-ok', text: `Aucune rupture sur les articles fréquents.` });
  }

  // 2. Taux de service (toujours présent)
  if (sr !== null) {
    const srNum = parseFloat(sr);
    const srCls = srNum >= 95 ? 'c-ok' : srNum >= 85 ? 'c-caution' : 'c-danger';
    const srFmt = n(`${sr}%`, srCls, 'Taux de disponibilité des articles fréquents (W≥3)');
    if (srNum >= 95) sentences.push({ icon: '💪', color: 'c-ok', text: `Taux de dispo\u00a0: ${srFmt} — excellent.` });
    else if (srNum >= 85) sentences.push({ icon: '👍', color: 'c-caution', text: `Taux de dispo\u00a0: ${srFmt} — correct, marge de progression sur les ruptures.` });
    else sentences.push({ icon: '⚠️', color: 'c-danger', text: `Taux de dispo\u00a0: ${srFmt} — priorité\u00a0: résoudre les ruptures pour remonter.` });
  }

  // 3. Stock à assainir (dormants + excédent ERP)
  const assainTotal = dormantStock + capalinOverflow;
  if (assainTotal > 500) {
    const parts = [];
    if (dormantStock > 500) parts.push(`${n(formatEuro(dormantStock), 'c-caution', 'Valeur du stock dormant (>1 an sans mouvement)')} dormants`);
    if (capalinOverflow > 500) parts.push(`${n(formatEuro(capalinOverflow), 'c-caution', 'Stock dépassant le MAX ERP — à renvoyer au dépôt ou solder')} excédent ERP`);
    sentences.push({ icon: '🧹', color: 'c-caution', text: `${n(formatEuro(assainTotal), 'c-caution', 'Total stock dormant + excédent ERP')} à assainir\u00a0: ${parts.join(' + ')}.` });
  } else {
    sentences.push({ icon: '✅', color: 'c-ok', text: `Stock propre — peu de dormants ni de débordements.` });
  }

  // 4. C-Rare si significatif
  if (DataStore.finalData[0]?.abcClass !== undefined) {
    const crItems = DataStore.finalData.filter(r => r.abcClass === 'C' && r.fmrClass === 'R' && r.stockActuel > 0);
    const crVal = crItems.reduce((s, r) => s + r.stockActuel * r.prixUnitaire, 0);
    const totalFull = DataStore.finalData.reduce((s, r) => r.stockActuel > 0 ? s + r.stockActuel * r.prixUnitaire : s, 0);
    const crPct = totalFull > 0 ? (crVal / totalFull * 100).toFixed(1) : '0';
    if (crVal > 100) {
      sentences.push({ icon: '🗑️', color: 'c-muted', text: `${n(crPct + '%', 'c-muted', `${crItems.length} articles C-Rare en stock`)} du stock (${n(formatEuro(crVal), 'c-muted', 'Valeur stock C-Rare')}) en C-Rare — candidat au déréférencement.` });
    }
  }

  // 5. Territoire si chargé
  if (_S.territoireReady && DataStore.territoireLines.length > 0) {
    const artMap = new Map();
    for (const l of DataStore.territoireLines) {
      if (l.isSpecial) continue;
      let a = artMap.get(l.code);
      if (!a) { a = { ca: 0, rayonStatus: l.rayonStatus }; artMap.set(l.code, a); }
      a.ca += l.ca;
    }
    const top100 = [...artMap.entries()].sort((a, b) => b[1].ca - a[1].ca).slice(0, 100);
    const inStock = top100.filter(([, a]) => a.rayonStatus === 'green').length;
    const absent = top100.filter(([, a]) => a.rayonStatus === 'red').length;
    const pctCouv = top100.length > 0 ? Math.round(inStock / top100.length * 100) : 0;
    const couvCls = pctCouv >= 80 ? 'c-ok' : pctCouv >= 60 ? 'c-caution' : 'c-danger';
    sentences.push({ icon: '🔗', color: 'c-muted', text: `Le Terrain\u00a0: ${n(pctCouv + '%', couvCls, 'Articles du Top 100 CA Terrain présents en rayon')} du Top\u00a0100 en rayon, ${n(absent, 'c-caution', 'Articles Top 100 absents du rayon (non référencés ou rupture)')} articles absents.` });
  }

  // 6. Concentration Client (ICC)
  if (_S._iccData && _S._iccData.alerte) {
    sentences.push({ icon: '⚠️', color: 'c-caution', text: `Concentration client\u00a0: ${n(_S._iccData.top3.length + ' clients', 'c-caution', `Top 3 clients = ${_S._iccData.top3Pct}% du CA Magasin`)} représentent ${n(_S._iccData.top3Pct + '%', 'c-caution', 'Part du CA Magasin sur les 3 premiers clients')} du CA Magasin. Risque si l'un d'eux part.` });
  }

  // 7. Fragilité Produit (1-2 clients)
  if (_S._fragiliteData && _S._fragiliteData.nbFragiles >= 3) {
    const nf = _S._fragiliteData.nbFragiles;
    const ca = _S._fragiliteData.caFragileTotal;
    sentences.push({ icon: '🎯', color: 'c-caution', text: `${n(nf + ' articles', 'c-caution', 'Articles fréquents achetés par 1 ou 2 clients seulement')} fréquents n'ont que 1 ou 2 acheteurs\u00a0— ${n(formatEuro(ca), 'c-caution', 'CA annuel à risque si le client clé part')} de CA fragilisé.` });
  }

  textEl.innerHTML = sentences.map(s =>
    `<div class="briefing-line"><span class="briefing-icon">${s.icon}</span><span class="${s.color}">${s.text}</span></div>`
  ).join('');
  el.classList.remove('hidden');
}

// ── Feature 4: Decision Queue (rendu) ────────────────────────
// Rend la file de décision depuis _S.decisionQueueData
// ── Session dismiss pour la DQ (reset à chaque rechargement des données) ──
const _dqDismissed = new Set();
export function dqDismiss(key) { _dqDismissed.add(key); renderDecisionQueue(); }
export function clearDqDismissed() { _dqDismissed.clear(); renderDecisionQueue(); }
function _dqKey(d) { return `${d.type}__${d.code || d.label?.substring(0, 20) || ''}` ; }

export function renderDecisionQueue() {
  const el = document.getElementById('decisionQueue');
  const listEl = document.getElementById('decisionQueueList');
  const subtitle = document.getElementById('dqSubtitle');
  if (!el || !listEl) return;
  if (!_S.decisionQueueData || !_S.decisionQueueData.length) { el.classList.add('hidden'); return; }

  // impactClass : 'dq-high' = rouge (--c-danger), 'dq-medium' = ambre (--c-caution)
  // Noms prefixés 'dq-' pour éviter tout conflit avec les utilitaires Tailwind
  const typeConfig = {
    rupture:           { badgeClass: 'dq-danger',  icon: '🚨', impactClass: 'dq-high' },
    alerte_prev:       { badgeClass: 'dq-caution', icon: '⚡', impactClass: 'dq-medium' },
    saisonnalite_prev: { badgeClass: 'dq-caution', icon: '📅', impactClass: 'dq-medium' },
    client:            { badgeClass: 'dq-action',  icon: '📞', impactClass: 'dq-medium' },
    client_silence:    { badgeClass: 'dq-action',  icon: '🔔', impactClass: 'dq-medium' },
    opportunite:       { badgeClass: 'dq-ok',      icon: '💡', impactClass: 'dq-medium' },
    concentration:     { badgeClass: 'dq-caution', icon: '📊', impactClass: 'dq-medium' },
    dormants:          { badgeClass: 'dq-caution', icon: '💤', impactClass: 'dq-medium' },
    client_web_actif:  { badgeClass: 'dq-caution', icon: '🌐', impactClass: 'dq-medium' },
    fragilite:         { badgeClass: 'dq-action',  icon: '🎯', impactClass: 'dq-medium' },
    anomalie_minmax:   { badgeClass: 'dq-action',  icon: '⚠️', impactClass: '' },
    stock_synthesis:   { badgeClass: 'dq-action',  icon: '📦', impactClass: '' },
    captation:         { badgeClass: 'dq-action',  icon: '🎯', impactClass: 'dq-medium' },
  };

  // Trier par euros perdus estimés (impact) puis par score — DQ V4
  const sorted = _S.decisionQueueData.slice().sort((a, b) => (b.impact || 0) - (a.impact || 0) || (b.score || 0) - (a.score || 0));
  const allItems = sorted.slice(0, 9);
  const items = allItems.filter(d => !_dqDismissed.has(_dqKey(d)));
  _S._dqRenderedItems = items; // snapshot de l'ordre affiché pour dqFocus(idx)
  const nbDismissed = allItems.length - items.length;
  if (subtitle) subtitle.textContent = `${items.length} action${items.length > 1 ? 's' : ''}${nbDismissed > 0 ? ` · ${nbDismissed} traité${nbDismissed > 1 ? 's' : ''}` : ''}`;

  listEl.innerHTML = items.map((d, idx) => {
    const cfg = typeConfig[d.type] || { badgeClass: '', icon: '•', impactClass: '' };
    const impactStr = d.impact >= 1000 ? formatEuro(d.impact) : '';
    const impactClass = (d.type === 'rupture') ? 'dq-high' : (impactStr ? 'dq-medium' : '');
    const impactHtml = impactStr ? `<span class="dq-impact ${impactClass}">${impactStr}</span>` : '';
    const whyHtml = d.why && d.why.length ? `<details class="dq-why" onclick="event.stopPropagation()"><summary>Pourquoi ?</summary><ul>${d.why.map(w => `<li>${w}</li>`).join('')}</ul></details>` : '';
    const score = d.score || 0;
    const priorityLabel = score >= 70 ? '<span class="text-[9px] font-bold c-danger">🔥 Critique</span>'
                        : score >= 40 ? '<span class="text-[9px] font-bold c-caution">⚡ Urgent</span>'
                        : '<span class="text-[9px] t-disabled">📌 À surveiller</span>';
    const saisonTag = d.saisonnier ? '<span class="text-[9px] font-bold" style="color:#0891b2">🌡️ Creux saisonnier</span>' : '';
    const dqK = _dqKey(d).replace(/'/g, "\\'");
    return `<div class="dq-item dq-item-click" data-dqtype="${d.type}" onclick="dqFocus(${idx})" title="Cliquer pour naviguer">
      <div class="dq-num-badge ${cfg.badgeClass}">${idx + 1}</div>
      <div style="flex:1;min-width:0">
        <div class="dq-label">${cfg.icon} ${d.label}</div>
        <div class="mt-0.5 flex flex-wrap gap-1">${priorityLabel}${saisonTag}</div>
        ${whyHtml}
      </div>
      ${impactHtml}
      <button onclick="event.stopPropagation();dqDismiss('${dqK}')" class="ml-2 text-[10px] t-disabled hover:t-primary shrink-0" title="Marquer comme traité">✓</button>
    </div>`;
  }).join('');

  const footerEl = document.getElementById('dqFooter');
  if (footerEl) { footerEl.innerHTML = ''; footerEl.classList.add('hidden'); }

  el.classList.remove('hidden');
}

// ── Feature 6: Focus Mode — clic DQ → navigation ─────────────
export function dqFocus(idx) {
  // Lire depuis l'ordre rendu (sorted+filtered), pas le tableau brut
  const d = (_S._dqRenderedItems || _S.decisionQueueData || [])[idx];
  if (!d) return;
  const cc = d.clientCode || d.code;
  switch (d.type) {
    case 'rupture':
    case 'alerte_prev':
      showCockpitInTable('ruptures');
      switchTab('dash');
      break;
    case 'saisonnalite_prev': {
      const si = document.getElementById('searchInput');
      if (si && d.code) si.value = d.code;
      clearCockpitFilter(true);
      _S.currentPage = 0;
      switchTab('table');
      renderAll();
      break;
    }
    case 'client':
    case 'client_silence':
      if (cc && window.openClient360) window.openClient360(cc, 'cockpit');
      else switchTab('territoire');
      break;
    case 'captation':
      switchTab('territoire');
      break;
    case 'concentration':
      switchTab('territoire');
      break;
    case 'opportunite':
    case 'client_web_actif':
    case 'client_digital_drift':
      if (cc && window.openClient360) window.openClient360(cc, 'cockpit');
      else switchTab('territoire');
      break;
    case 'dormants':
      switchTab('dash');
      showCockpitInTable('dormants');
      break;
    case 'fragilite':
      showCockpitInTable('fragiles');
      switchTab('table');
      break;
    case 'erp_incoherence':
    case 'anomalie_minmax':
      switchTab('dash');
      showCockpitInTable('anomalies');
      break;
    case 'famille_fuite':
      switchTab('bench');
      break;
    case 'stock_synthesis':
      switchTab('dash');
      break;
    default:
      switchTab('dash');
      break;
  }
}

// ── Health Score — fusionné dans renderIRABanner, ce bloc est inactif ──
export function renderHealthScore() {
  const el = document.getElementById('healthScoreBadge');
  if (el) el.classList.add('hidden');
}

// ── No-stock placeholder ──────────────────────────────────────
export function _renderNoStockPlaceholder(ongletNom) {
  return `<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:300px;gap:16px;color:var(--t-muted)"><div style="font-size:2rem">📦</div><div style="font-size:1.1rem;font-weight:600">${ongletNom} — fichier stock non chargé</div><div style="font-size:0.9rem;max-width:400px;text-align:center">Chargez le fichier <strong>État du Stock</strong> via "Modifier les fichiers" pour accéder à cet onglet.</div></div>`;
}

// ── Tab Badges — numériques sur les onglets ───────────────────
export function renderTabBadges() {
  // Badge "Ce matin" : nb items DQ critiques
  const dqItems = (_S.decisionQueueData || []);
  const criticalTypes = new Set(['rupture', 'alerte_prev', 'erp_incoherence', 'saisonnalite_prev']);
  const critCount = dqItems.filter(d => criticalTypes.has(d.type)).length;
  const actionBadge = document.getElementById('navActionBadge');
  if (actionBadge) {
    if (critCount > 0) {
      actionBadge.textContent = critCount > 9 ? '9+' : critCount;
      actionBadge.classList.remove('hidden');
      // Color: red if rupture present, amber otherwise
      const hasRupture = dqItems.some(d => d.type === 'rupture' || d.type === 'alerte_prev');
      actionBadge.style.background = hasRupture ? '#dc2626' : '#d97706';
    } else {
      actionBadge.classList.add('hidden');
    }
  }

  // Badge "Mes clients" : clients silencieux >90j avec CA PDV
  const clientsBadge = document.getElementById('navClientsBadge');
  if (clientsBadge && _S.clientLastOrder?.size > 0) {
    const nowTs = Date.now();
    let silentCount = 0;
    for (const [cc, dt] of _S.clientLastOrder) {
      if ((nowTs - dt) > 90 * 86400000 && _S.ventesClientArticle?.has(cc)) silentCount++;
    }
    if (silentCount > 0) {
      clientsBadge.textContent = silentCount > 99 ? '99+' : silentCount;
      clientsBadge.classList.remove('hidden');
    } else {
      clientsBadge.classList.add('hidden');
    }
  }

  // Task 7: grise Articles + Mon Stock si stock non chargé
  ['table', 'dash'].forEach(tabId => {
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

// ── IRA — Indice de Risque Agence (3 sous-scores + composite) ──
export function renderIRABanner() {
  const el = document.getElementById('iraBanner');
  if (!el) return;
  const d = _S.finalData;
  if (!d.length) { el.classList.add('hidden'); return; }

  // ── Score Stock : taux de service articles F+M (non rupture / total) ──
  const fmArts = d.filter(r => (r.fmrClass === 'F' || r.fmrClass === 'M') && r.W >= 1 && !r.isParent && !(r.V === 0 && r.enleveTotal > 0));
  const fmRup = fmArts.filter(r => r.stockActuel <= 0).length;
  const stockScore = fmArts.length > 0 ? Math.round(100 * (1 - fmRup / fmArts.length)) : 100;

  // ── Score Clients : momentum (actifs <90j) / total chalandise ──
  let clientScore = 50;
  let actifCount = 0, totalChaland = 0;
  if (_S.chalandiseReady && _S.chalandiseData && _S.chalandiseData.size > 0) {
    const nowTs = Date.now();
    totalChaland = _S.chalandiseData.size;
    actifCount = [...(_S.clientLastOrder || new Map()).entries()].filter(([, dt]) => nowTs - dt < 90 * 86400000).length;
    clientScore = Math.min(100, Math.round(100 * actifCount / totalChaland));
  } else if (_S.clientLastOrder && _S.clientLastOrder.size > 0) {
    const nowTs = Date.now();
    const all = _S.clientLastOrder.size;
    actifCount = [..._S.clientLastOrder.values()].filter(dt => nowTs - dt < 90 * 86400000).length;
    clientScore = Math.min(100, Math.round(100 * actifCount / all));
    totalChaland = all;
  }

  // ── Score Captation : CA PDV / (CA PDV + CA fuyant) ──
  let captationScore = 100;
  let caPDV = 0, caFuyant = 0;
  if (_S.famillesHors && _S.famillesHors.length > 0) {
    caFuyant = _S.famillesHors.reduce((s, f) => s + (f.caHors || 0), 0);
    if (_S.ventesClientArticle) {
      for (const [, arts] of _S.ventesClientArticle) {
        for (const [, v] of arts) caPDV += (v.sumCA || 0);
      }
    }
    const total = caPDV + caFuyant;
    captationScore = total > 0 ? Math.round(100 * caPDV / total) : 100;
  } else if (_S.canalAgence && _S.canalAgence.MAGASIN) {
    captationScore = 100; // pas de données fuite, on ne pénalise pas
  }

  // ── IRA composite ──
  const ira = Math.round(stockScore * 0.40 + clientScore * 0.35 + captationScore * 0.25);

  // ── Helpers ──
  function _scoreColor(s) {
    if (s >= 75) return '#16a34a';
    if (s >= 50) return '#d97706';
    return '#dc2626';
  }
  function _scoreBg(s) {
    if (s >= 75) return 'rgba(22,163,74,0.10)';
    if (s >= 50) return 'rgba(217,119,6,0.10)';
    return 'rgba(220,38,38,0.10)';
  }
  function _scoreRing(s) {
    if (s >= 75) return 'rgba(22,163,74,0.28)';
    if (s >= 50) return 'rgba(217,119,6,0.28)';
    return 'rgba(220,38,38,0.28)';
  }
  function _pill(label, score, sub) {
    const c = _scoreColor(score), bg = _scoreBg(score), ring = _scoreRing(score);
    const barW = score + '%';
    return `<div style="flex:1;min-width:0;padding:8px 10px;border-radius:10px;background:${bg};outline:1px solid ${ring}">
      <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:4px">
        <span style="font-size:0.65rem;font-weight:700;color:var(--c-muted);text-transform:uppercase;letter-spacing:0.04em">${label}</span>
        <span style="font-size:1rem;font-weight:900;color:${c}">${score}<span style="font-size:0.6rem">/100</span></span>
      </div>
      <div style="height:3px;border-radius:2px;background:rgba(128,128,128,0.15);margin-bottom:4px">
        <div style="height:3px;border-radius:2px;width:${barW};background:${c};transition:width 0.4s"></div>
      </div>
      <p style="font-size:0.6rem;color:var(--c-muted);opacity:0.75;margin:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${sub}</p>
    </div>`;
  }

  const stockSub = `${fmArts.length - fmRup}/${fmArts.length} arts F+M en stock`;
  const clientSub = totalChaland > 0 ? `${actifCount} actifs sur ${totalChaland} clients` : 'Charger chalandise';
  const captSub = caFuyant > 0
    ? `${Math.round(caPDV/1000)}k€ PDV · ${Math.round(caFuyant/1000)}k€ fuyant`
    : 'Aucune fuite détectée';

  const iraLabel = ira >= 70 ? 'Bonne santé' : ira >= 40 ? 'Points d\'attention' : 'Actions urgentes';
  const iraColor = ira >= 70 ? 'var(--c-ok,#16a34a)' : ira >= 40 ? 'var(--c-caution,#d97706)' : 'var(--c-danger,#dc2626)';

  // ── Historique IRA (localStorage) ──
  _saveIRASnapshot(ira, stockScore, clientScore, captationScore);

  // Snapshot pour le modal diagnostic
  _S._iraDiagData = { ira, iraLabel, stockScore, clientScore, captationScore,
    fmTotal: fmArts.length, fmEnStock: fmArts.length - fmRup,
    actifCount, totalChaland, caFuyant, caPDV };

  const _compDispo = `Dispo.\u00a0${stockScore}%`;
  const _compClients = actifCount > 0 ? `${actifCount}\u00a0clients\u00a0actifs` : `Activité\u00a0${clientScore}%`;
  const _compCapt = caFuyant > 0 ? `${Math.round(caFuyant/1000)}k€\u00a0fuyant` : `0\u00a0fuite\u00a0détectée`;
  const components = [_compDispo, _compClients, _compCapt].join('\u00a0·\u00a0');

  el.innerHTML = `<div onclick="openDiagAgence()" title="Diagnostic agence — cliquer pour détails" style="display:flex;align-items:center;gap:10px;padding:7px 14px;border-radius:10px;background:var(--s-card);outline:1px solid var(--b-default);cursor:pointer" onmouseover="this.style.opacity='0.85'" onmouseout="this.style.opacity='1'">
    <span style="font-weight:800;font-size:0.8rem;color:${iraColor}">📊\u00a0${ira}/100</span>
    <span style="font-size:0.75rem;font-weight:600;color:${iraColor}">·\u00a0${iraLabel}</span>
    <span style="font-size:0.72rem;color:var(--t-tertiary,#94a3b8);margin-left:auto">${components}</span>
    <button onclick="event.stopPropagation();exportAgenceSnapshot()" title="Exporter snapshot agence" style="font-size:0.65rem;padding:2px 6px;border-radius:6px;border:1px solid var(--b-light,rgba(128,128,128,0.2));background:transparent;cursor:pointer;color:var(--t-disabled)">📤</button>
  </div>`;
  el.classList.remove('hidden');
  // Sidebar Ce matin — bloc score compact
  {const _sb=document.getElementById('cematinScoreBadge');const _st=document.getElementById('cematinScoreText');const _ss=document.getElementById('cematinScoreSub');
  if(_sb&&_st&&_ss){const _ic=_scoreColor(ira);const _ft=caFuyant>0?`${Math.round(caFuyant/1000)}k€\u00a0fuyant`:'0\u00a0fuite';const _ac=actifCount>0?`${actifCount}\u00a0clients\u00a0actifs`:'Charger\u00a0chalandise';_sb.style.borderColor=_ic+'4d';_sb.style.background=_ic+'1a';_st.innerHTML=`<span style="color:${_ic};font-weight:800;font-size:0.72rem">📊\u00a0${ira}/100</span><span style="color:${_ic};font-size:0.7rem;font-weight:600">\u00a0·\u00a0${iraLabel}</span>`;_ss.textContent=`Dispo.\u00a0${stockScore}%\u00a0·\u00a0${_ac}\u00a0·\u00a0${_ft}`;}}
}

// ── Modal Diagnostic agence ───────────────────────────────────
export function openDiagAgence() {
  const d = _S._iraDiagData;
  if (!d) return;

  const _color = s => s >= 70 ? 'var(--c-ok,#16a34a)' : s >= 40 ? 'var(--c-caution,#d97706)' : 'var(--c-danger,#dc2626)';
  const _label = s => s >= 70 ? '✅ Bon niveau' : s >= 40 ? '⚠️ Vigilance' : '🔴 Actions requises';

  // ── Section Dispo rayon ──
  const dispoDetail = d.fmTotal > 0
    ? `${d.fmEnStock} article${d.fmEnStock > 1 ? 's' : ''} F+M en stock sur ${d.fmTotal} référencés.`
    : 'Aucune donnée stock disponible.';
  const dispoAdvice = d.stockScore >= 70
    ? `${_label(d.stockScore)} — ${d.fmTotal - d.fmEnStock} article${d.fmTotal - d.fmEnStock !== 1 ? 's' : ''} à réapprovisionner.`
    : `${_label(d.stockScore)} — ${d.fmTotal - d.fmEnStock} ruptures sur articles fréquents/moyens.`;

  // ── Section Activité clients ──
  const clientDetail = d.totalChaland > 0
    ? `${d.actifCount.toLocaleString('fr')} clients actifs sur ${d.totalChaland.toLocaleString('fr')} clients en zone.`
    : d.actifCount > 0 ? `${d.actifCount.toLocaleString('fr')} clients actifs détectés.` : 'Chargez le fichier Zone de Chalandise pour une analyse complète.';
  const clientAdvice = d.clientScore >= 70
    ? `${_label(d.clientScore)} — bonne activation de la zone.`
    : d.clientScore >= 40
    ? `${_label(d.clientScore)} — une partie de la zone n'achète pas chez vous.`
    : `${_label(d.clientScore)} — la majorité de la zone n'achète pas chez vous.`;

  // ── Section Captation ──
  const captDetail = d.caFuyant > 0
    ? `${Math.round(d.caPDV / 1000)}k€ CA PDV · ${Math.round(d.caFuyant / 1000)}k€ de CA fuyant détecté.`
    : 'Aucune fuite détectée dans le fichier Territoire.';
  const captAdvice = d.caFuyant > 0
    ? `${_label(d.captationScore)} — des clients achètent des familles ailleurs.`
    : '✅ Chargez le fichier Territoire pour une analyse complète.';

  // ── Recommandations ──
  const recs = [];
  if (d.clientScore < 40) recs.push({ txt: 'Activité clients faible → relancer les silencieux', cmd: 'clients silencieux' });
  if (d.stockScore < 70) recs.push({ txt: `${d.fmTotal - d.fmEnStock} ruptures F+M → passer commande ERP`, cmd: 'ruptures top clients' });
  if (d.caFuyant > 0) recs.push({ txt: 'Fuites détectées → analyser les familles fuyantes', cmd: 'familles fuyantes hors agence' });
  if (!d.totalChaland) recs.push({ txt: 'Charger la Zone de Chalandise pour activer l\'analyse clients', cmd: null });
  if (recs.length === 0) recs.push({ txt: 'Score satisfaisant — continuer la surveillance régulière.', cmd: null });

  const recsHtml = recs.map(r => `<div style="display:flex;align-items:baseline;gap:6px;padding:4px 0">
    <span style="font-size:0.75rem">→</span>
    <span style="font-size:0.78rem;color:var(--t-secondary)">${r.txt}</span>
    ${r.cmd ? `<button onclick="document.getElementById('diagAgenceModal').remove();window._cematinSearch&&window._cematinSearch('${r.cmd}')" style="margin-left:auto;font-size:0.65rem;padding:2px 8px;border-radius:8px;border:1px solid var(--b-light);background:transparent;cursor:pointer;color:var(--c-action);white-space:nowrap">Cmd+K →</button>` : ''}
  </div>`).join('');

  function _card(title, score, detail, advice) {
    const c = _color(score);
    return `<div style="border:1px solid var(--b-darker);border-radius:10px;overflow:hidden;margin-bottom:10px">
      <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 14px;background:var(--s-panel-inner)">
        <span style="font-size:0.75rem;font-weight:700;color:var(--t-inverse)">${title}</span>
        <span style="font-size:0.9rem;font-weight:900;color:${c}">${score}/100</span>
      </div>
      <div style="padding:10px 14px;background:var(--s-panel-inner)">
        <p style="font-size:0.75rem;color:var(--t-inverse-muted);margin:0 0 4px">${detail}</p>
        <p style="font-size:0.72rem;color:${c};font-weight:600;margin:0">${advice}</p>
      </div>
    </div>`;
  }

  const pts1 = Math.round(d.stockScore * 0.40);
  const pts2 = Math.round(d.clientScore * 0.35);
  const pts3 = Math.round(d.captationScore * 0.25);
  const rawTotal = (d.stockScore * 0.40 + d.clientScore * 0.35 + d.captationScore * 0.25).toFixed(1);
  const formulaHtml = `<div style="border:1px solid var(--b-darker);border-radius:10px;overflow:hidden;margin-bottom:12px">
    <div style="padding:6px 14px;background:var(--s-panel-inner);border-bottom:1px solid var(--b-darker)">
      <span style="font-size:0.65rem;font-weight:800;text-transform:uppercase;letter-spacing:0.07em;color:var(--t-disabled)">Détail du calcul</span>
    </div>
    <div style="padding:10px 14px;background:var(--s-panel-inner)">
      <table style="width:100%;border-collapse:collapse;font-size:0.74rem;font-variant-numeric:tabular-nums">
        <tr><td style="color:var(--t-inverse-muted);padding:2px 0">📦 Disponibilité rayon</td><td style="color:var(--t-inverse);text-align:right;padding:2px 8px">${d.stockScore}/100</td><td style="color:var(--t-disabled);text-align:right;padding:2px 8px">× 40%</td><td style="color:var(--t-inverse);font-weight:700;text-align:right;padding:2px 0">${pts1} pt${pts1!==1?'s':''}</td></tr>
        <tr><td style="color:var(--t-inverse-muted);padding:2px 0">👥 Activité clients</td><td style="color:var(--t-inverse);text-align:right;padding:2px 8px">${d.clientScore}/100</td><td style="color:var(--t-disabled);text-align:right;padding:2px 8px">× 35%</td><td style="color:var(--t-inverse);font-weight:700;text-align:right;padding:2px 0">${pts2} pt${pts2!==1?'s':''}</td></tr>
        <tr><td style="color:var(--t-inverse-muted);padding:2px 0">🎯 Captation zone</td><td style="color:var(--t-inverse);text-align:right;padding:2px 8px">${d.captationScore}/100</td><td style="color:var(--t-disabled);text-align:right;padding:2px 8px">× 25%</td><td style="color:var(--t-inverse);font-weight:700;text-align:right;padding:2px 0">${pts3} pt${pts3!==1?'s':''}</td></tr>
        <tr style="border-top:1px solid var(--b-darker)"><td colspan="3" style="color:var(--t-disabled);padding:4px 0 0;font-size:0.65rem">Total brut ${rawTotal} → arrondi</td><td style="font-size:0.95rem;font-weight:900;color:${_color(d.ira)};text-align:right;padding:4px 0 0">${d.ira}/100</td></tr>
      </table>
    </div>
  </div>`;

  const iraColor = _color(d.ira);
  const html = `<div id="diagAgenceModal" onclick="if(event.target===this)this.remove()" style="position:fixed;inset:0;background:rgba(0,0,0,.82);backdrop-filter:blur(6px);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px">
    <div style="background:var(--s-panel);border:1px solid var(--b-dark);border-radius:16px;max-width:600px;width:100%;max-height:90vh;overflow-y:auto;box-shadow:0 20px 60px rgba(0,0,0,0.6);color:var(--t-inverse)">
      <div style="padding:18px 20px 12px;border-bottom:1px solid var(--b-dark)">
        <div style="display:flex;align-items:center;gap:10px">
          <span style="font-size:0.65rem;font-weight:800;text-transform:uppercase;letter-spacing:0.07em;color:var(--t-disabled)">Mon agence en un coup d'œil</span>
          <button onclick="document.getElementById('diagAgenceModal').remove()" style="margin-left:auto;font-size:1rem;background:transparent;border:none;cursor:pointer;color:var(--t-disabled);padding:2px 6px;border-radius:6px" title="Fermer">✕</button>
        </div>
        <p style="margin:6px 0 0;font-size:1rem;font-weight:900;color:${iraColor}">📊 Score global : ${d.ira}/100 — ${d.iraLabel}</p>
      </div>
      <div style="padding:16px 20px">
        ${_card('📦 Disponibilité rayon', d.stockScore, dispoDetail, dispoAdvice)}
        ${_card('👥 Activité clients', d.clientScore, clientDetail, clientAdvice)}
        ${_card('🎯 Captation zone', d.captationScore, captDetail, captAdvice)}
        ${formulaHtml}
        <div style="border-top:1px solid var(--b-darker);padding-top:12px;margin-top:4px">
          <p style="font-size:0.65rem;font-weight:800;text-transform:uppercase;letter-spacing:0.07em;color:var(--t-disabled);margin:0 0 8px">Comment améliorer mon score ?</p>
          ${recsHtml}
        </div>
      </div>
      <div style="padding:12px 20px;border-top:1px solid var(--b-dark);text-align:right">
        <button onclick="document.getElementById('diagAgenceModal').remove()" style="padding:7px 20px;border-radius:20px;background:var(--s-panel-inner);border:1px solid var(--b-dark);cursor:pointer;font-size:0.8rem;font-weight:600;color:var(--t-inverse)">Fermer</button>
      </div>
    </div>
  </div>`;

  document.getElementById('diagAgenceModal')?.remove();
  document.body.insertAdjacentHTML('beforeend', html);
}
window.openDiagAgence = openDiagAgence;

// ── IRA history helpers ───────────────────────────────────────
const _IRA_HIST_KEY = 'PRISME_IRA_HISTORY';
const _IRA_MAX_DAYS = 90;

function _saveIRASnapshot(ira, sr, cs, cap) {
  try {
    const today = new Date().toISOString().slice(0, 10); // 'YYYY-MM-DD'
    const hist = _loadIRAHistory();
    // Dedup: remplacer le snapshot du jour si déjà présent
    const idx = hist.findIndex(p => p.d === today);
    const snap = { d: today, ira, sr, cs, cap };
    if (idx >= 0) hist[idx] = snap; else hist.push(snap);
    // Garder les 90 derniers jours
    hist.sort((a, b) => a.d.localeCompare(b.d));
    while (hist.length > _IRA_MAX_DAYS) hist.shift();
    localStorage.setItem(_IRA_HIST_KEY, JSON.stringify(hist));
  } catch (_) {}
}

export function _loadIRAHistory() {
  try {
    const raw = localStorage.getItem(_IRA_HIST_KEY);
    if (!raw) return [];
    return JSON.parse(raw) || [];
  } catch (_) { return []; }
}

function _renderIRASparkline(history) {
  if (!history || history.length < 2) return '';
  const pts = history.slice(-30); // derniers 30 points
  const n = pts.length;
  const W = 340, H = 36, padL = 2, padR = 2, padT = 3, padB = 10;
  const pw = W - padL - padR, ph = H - padT - padB;

  const iras  = pts.map(p => p.ira);
  const srs   = pts.map(p => p.sr);
  const xStep = pw / Math.max(n - 1, 1);

  function poly(vals, color, dash = '') {
    const points = vals.map((v, i) => {
      const x = (padL + i * xStep).toFixed(1);
      const y = (padT + ph - v / 100 * ph).toFixed(1);
      return `${x},${y}`;
    }).join(' ');
    return `<polyline points="${points}" fill="none" stroke="${color}" stroke-width="1.5" opacity="0.8"${dash ? ` stroke-dasharray="${dash}"` : ''}/>`;
  }

  // Zone de référence : ligne à 75 (seuil "agence en forme")
  const refY = (padT + ph - 75 / 100 * ph).toFixed(1);
  const refLine = `<line x1="${padL}" y1="${refY}" x2="${W - padR}" y2="${refY}" stroke="rgba(22,163,74,0.2)" stroke-dasharray="2,3"/>`;

  // Dot sur le dernier point IRA
  const lastIRA = iras[n - 1];
  const dotX = (padL + (n - 1) * xStep).toFixed(1);
  const dotY = (padT + ph - lastIRA / 100 * ph).toFixed(1);
  const dotColor = lastIRA >= 75 ? '#16a34a' : lastIRA >= 50 ? '#d97706' : '#dc2626';
  const dot = `<circle cx="${dotX}" cy="${dotY}" r="2.5" fill="${dotColor}"/>`;

  // Labels axe Y
  const labelY75 = `<text x="${W - padR + 1}" y="${refY - 0 + 3.5}" font-size="6" fill="rgba(22,163,74,0.4)" text-anchor="start">75</text>`;

  // Dates début / fin sous le sparkline
  const d0 = pts[0].d.slice(5).replace('-', '/');  // MM/DD
  const dN = pts[n - 1].d.slice(5).replace('-', '/');
  const dateLabel = `<text x="${padL}" y="${H - 1}" font-size="6" fill="rgba(128,128,128,0.4)">${d0}</text>
    <text x="${W - padR}" y="${H - 1}" font-size="6" fill="rgba(128,128,128,0.4)" text-anchor="end">${dN}</text>`;

  // Légende
  const legend = `<text x="${W / 2}" y="${H - 1}" font-size="6" fill="rgba(128,128,128,0.45)" text-anchor="middle">━ IRA  ╌ Taux service  (${n} pts)</text>`;

  const svg = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" style="display:block;overflow:visible">
    ${refLine}
    ${poly(srs, 'rgba(99,179,237,0.45)', '2,2')}
    ${poly(iras, dotColor)}
    ${dot}
    ${labelY75}
    ${dateLabel}
    ${legend}
  </svg>`;
  return svg;
}

// ── Snapshot agence — export markdown clipboard ───────────────
export function exportAgenceSnapshot() {
  const d = _S.finalData;
  if (!d.length) { showToast('Aucune donnée chargée', 'info'); return; }

  const now = new Date();
  const dateStr = now.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const timeStr = now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  const store = _S.selectedMyStore || 'Agence';
  const stripHtml = s => s.replace(/<[^>]+>/g, '').replace(/\u00a0/g, ' ');

  // ── IRA scores (réplique logique renderIRABanner) ──
  const fmArts = d.filter(r => (r.fmrClass === 'F' || r.fmrClass === 'M') && r.W >= 1 && !r.isParent && !(r.V === 0 && r.enleveTotal > 0));
  const fmRup = fmArts.filter(r => r.stockActuel <= 0).length;
  const stockScore = fmArts.length > 0 ? Math.round(100 * (1 - fmRup / fmArts.length)) : 100;

  let clientScore = 50, actifCount = 0, totalChaland = 0;
  if (_S.clientLastOrder?.size > 0) {
    const nowTs = Date.now();
    if (_S.chalandiseData?.size > 0) { totalChaland = _S.chalandiseData.size; }
    else { totalChaland = _S.clientLastOrder.size; }
    actifCount = [..._S.clientLastOrder.values()].filter(dt => nowTs - dt < 90 * 86400000).length;
    clientScore = Math.min(100, Math.round(100 * actifCount / totalChaland));
  }

  let captationScore = 100, caPDVtot = 0, caFuyantTot = 0;
  if (_S.famillesHors?.length > 0) {
    caFuyantTot = _S.famillesHors.reduce((s, f) => s + (f.caHors || 0), 0);
    if (_S.ventesClientArticle) for (const [, arts] of _S.ventesClientArticle) for (const [, v] of arts) caPDVtot += (v.sumCA || 0);
    const tot = caPDVtot + caFuyantTot;
    captationScore = tot > 0 ? Math.round(100 * caPDVtot / tot) : 100;
  }
  const ira = Math.round(stockScore * 0.40 + clientScore * 0.35 + captationScore * 0.25);
  const iraLabel = ira >= 75 ? 'Agence en forme' : ira >= 50 ? 'Points d\'attention' : 'Actions urgentes';

  // ── Briefing ──
  const br = _S._briefingData || {};
  const lstR = br.lstR || [];
  const totalCAPerdu = br.totalCAPerdu || 0;
  const dormantStock = br.dormantStock || 0;
  const capalinOverflow = br.capalinOverflow || 0;
  const sr = br.sr != null ? br.sr : null;

  // ── DQ items (top 5) ──
  const dqItems = (_S.decisionQueueData || []).slice(0, 5);

  const typeEmoji = { rupture: '🔴', client_silence: '🟡', client_digital_drift: '📱', famille_fuite: '🟠', dormants: '🟡', anomalie_minmax: '⚠️', fragilite: '🟠', saisonnalite_prev: '🌡️', concentration: '🟠', opportunite: '💡' };

  // ── Canal KPIs ──
  const caMag = _S.canalAgence?.MAGASIN?.ca || 0;
  const caWeb = _S.canalAgence?.INTERNET?.ca || 0;
  const caRep = _S.canalAgence?.REPRESENTANT?.ca || 0;
  const caDcs = _S.canalAgence?.DCS?.ca || 0;
  const caTot = caMag + caWeb + caRep + caDcs;

  // ── Familles fuyantes top 3 ──
  const topFuites = (_S.famillesHors || []).slice(0, 3);

  // ── Build markdown ──
  const lines = [];
  lines.push(`# 📊 Snapshot Agence — ${store} · ${dateStr}`);
  lines.push('');

  // IRA
  lines.push(`## 🎯 IRA ${ira}/100 — ${iraLabel}`);
  lines.push(`- 📦 Stock F+M : **${stockScore}/100** · ${fmArts.length - fmRup}/${fmArts.length} articles en stock`);
  if (totalChaland > 0) lines.push(`- 👥 Momentum clients : **${clientScore}/100** · ${actifCount} actifs / ${totalChaland} clients`);
  if (caFuyantTot > 0) lines.push(`- 🛒 Captation PDV : **${captationScore}/100** · ${Math.round(caPDVtot/1000)}k€ PDV · ${Math.round(caFuyantTot/1000)}k€ fuyant`);
  else lines.push(`- 🛒 Captation PDV : **${captationScore}/100** · Aucune fuite détectée`);
  lines.push('');

  // Alertes DQ
  if (dqItems.length > 0) {
    lines.push('## 🗂️ Alertes prioritaires');
    dqItems.forEach((item, i) => {
      const emoji = typeEmoji[item.type] || '📌';
      lines.push(`${i + 1}. ${emoji} ${stripHtml(item.label)}`);
      if (item.why?.[0]) lines.push(`   → ${stripHtml(item.why[0])}`);
    });
    lines.push('');
  }

  // KPIs stock
  lines.push('## 📦 KPIs stock');
  if (sr !== null) lines.push(`- Taux de service F+M : **${sr}%**`);
  lines.push(`- Ruptures actives (F+M) : **${lstR.length}** articles${totalCAPerdu > 0 ? ` · ~${Math.round(totalCAPerdu/1000)}k€ à risque` : ''}`);
  if (dormantStock + capalinOverflow > 0) lines.push(`- Stock à assainir : **${formatEuro(dormantStock + capalinOverflow)}** (dormants ${formatEuro(dormantStock)} + excédent ${formatEuro(capalinOverflow)})`);
  lines.push('');

  // CA canaux
  if (caTot > 0) {
    lines.push('## 💶 CA multi-canal');
    if (caMag > 0) lines.push(`- Comptoir (PDV) : **${formatEuro(caMag)}** (${Math.round(caMag/caTot*100)}%)`);
    if (caWeb > 0) lines.push(`- Internet : **${formatEuro(caWeb)}** (${Math.round(caWeb/caTot*100)}%)`);
    if (caRep > 0) lines.push(`- Représentant : **${formatEuro(caRep)}** (${Math.round(caRep/caTot*100)}%)`);
    if (caDcs > 0) lines.push(`- DCS : **${formatEuro(caDcs)}** (${Math.round(caDcs/caTot*100)}%)`);
    lines.push('');
  }

  // Fuites
  if (topFuites.length > 0) {
    lines.push('## 🟠 Top familles fuyantes');
    topFuites.forEach(f => lines.push(`- ${f.fam} : **${formatEuro(f.caHors)}** hors agence · ${f.nbClients} clients`));
    if (_S.famillesHors.length > 3) lines.push(`  _(+${_S.famillesHors.length - 3} autres familles)_`);
    lines.push('');
  }

  lines.push('---');
  lines.push(`_Généré par PRISME · ${dateStr} ${timeStr}_`);

  const md = lines.join('\n');

  navigator.clipboard.writeText(md).then(() => {
    showToast('📋 Snapshot copié — prêt à coller dans Notion, Teams ou email', 'success');
  }).catch(() => {
    // Fallback: textarea select
    const ta = document.createElement('textarea');
    ta.value = md;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    showToast('📋 Snapshot copié (fallback)', 'success');
  });
}

// ── Feature 7: Clip ERP — TSV CODE<tab>QTÉ ───────────────────
export function clipERP() {
  const lines = (_S.decisionQueueData || [])
    .filter(d => d.action === 'commander' && d.qteSugg > 0 && d.code)
    .map(d => `${d.code}\t${d.qteSugg}`)
    .join('\n');
  if (!lines) { showToast('Aucune commande à copier', 'info'); return; }
  const count = lines.split('\n').length;
  const btn = document.getElementById('erpCopyBtn');
  navigator.clipboard.writeText(lines).then(() => {
    showToast(`📋 ${count} article${count > 1 ? 's' : ''} copié${count > 1 ? 's' : ''} (CODE → QTÉ)`, 'success');
    if (btn) { const orig = btn.innerHTML; btn.innerHTML = '✅ Copié !'; setTimeout(() => { btn.innerHTML = orig; }, 2000); }
  }).catch(() => {
    showToast('Erreur de copie dans le presse-papiers', 'error');
  });
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

// Keyboard listeners
document.addEventListener('keydown', function(e) {
  // Open: Cmd+K / Ctrl+K
  if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
    e.preventDefault();
    const pal = document.getElementById('cmdPalette');
    if (pal && pal.classList.contains('hidden')) openCmdPalette();
    else closeCmdPalette();
    return;
  }
  const pal = document.getElementById('cmdPalette');
  if (!pal || pal.classList.contains('hidden')) return;
  if (e.key === 'Escape') { e.preventDefault(); closeCmdPalette(); }
  else if (e.key === 'ArrowDown') { e.preventDefault(); _cmdMoveSelection(1); }
  else if (e.key === 'ArrowUp') { e.preventDefault(); _cmdMoveSelection(-1); }
  else if (e.key === 'Enter') {
    e.preventDefault();
    if (_cmdSelectedIdx >= 0) _cmdExec(_cmdSelectedIdx);
    else if (_cmdItems.length > 0) _cmdExec(0);
  }
});

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
    // Hide NL results if open
    const nlRes = document.getElementById('cematinResults');
    if (nlRes && !nlRes.classList.contains('hidden')) { nlRes.classList.add('hidden'); e.preventDefault(); return; }
    return;
  }

  // / : focus barre NL search (Ce matin)
  if (e.key === '/' && !e.metaKey && !e.ctrlKey) {
    const si = document.getElementById('cematinSearchInput');
    if (si) { e.preventDefault(); switchTab('action'); si.focus(); si.select(); }
    return;
  }

  // 1–7 : switcher d'onglet (uniquement sans modificateur)
  if (!e.metaKey && !e.ctrlKey && !e.altKey && !e.shiftKey) {
    const TAB_MAP = { '1': 'table', '2': 'dash', '3': 'action', '4': 'abc', '5': 'clients', '6': 'territoire', '7': 'bench' };
    const tab = TAB_MAP[e.key];
    if (tab) {
      const btn = document.querySelector(`[data-tab="${tab}"]`);
      if (btn && !btn.classList.contains('hidden')) { e.preventDefault(); switchTab(tab); }
    }
  }
});

// Input debounce
document.addEventListener('input', function(e) {
  if (e.target.id !== 'cmdInput') return;
  _cmdSelectedIdx = -1;
  clearTimeout(_cmdTimer);
  _cmdTimer = setTimeout(() => _cmdRender(e.target.value), 150);
});

// ═══ D2 — THEME SWITCH ═══
export function initTheme() {
  const hash = location.hash.replace('#','');
  const theme = ['dark'].includes(hash) ? hash : '';
  if (theme) document.documentElement.setAttribute('data-theme', theme);
  window.addEventListener('hashchange', () => {
    const h = location.hash.replace('#','');
    if (['dark'].includes(h)) {
      document.documentElement.setAttribute('data-theme', h);
    } else {
      document.documentElement.removeAttribute('data-theme');
    }
  });
}

export function cycleTheme() {
  const current = document.documentElement.getAttribute('data-theme');
  const next = current === 'dark' ? '' : 'dark';
  if (next) {
    document.documentElement.setAttribute('data-theme', next);
    location.hash = next;
  } else {
    document.documentElement.removeAttribute('data-theme');
    history.replaceState(null, '', location.pathname + location.search);
  }
  // Update button icon
  const btn = document.getElementById('themeToggle');
  if (btn) btn.textContent = next === 'dark' ? '🌙' : '🌗';
}

// ── P6: Export résumé Cockpit vers le presse-papier ──────────
export function exportCockpitResume() {
  const lines = [];
  lines.push(`COCKPIT ${_S.selectedMyStore} — ${new Date().toLocaleDateString('fr-FR')}`);
  lines.push(`CA Magasin : ${formatEuro(_S._briefingData?.caComptoir || 0)}`);
  lines.push(`Taux de dispo : ${_S._briefingData?.sr ?? '—'}%`);
  lines.push(`Ruptures : ${_S.cockpitLists.ruptures?.size ?? 0} · Dormants : ${_S.cockpitLists.dormants?.size ?? 0}`);
  lines.push('');
  lines.push('ACTIONS PRIORITAIRES :');
  for (const d of (_S.decisionQueueData || []).slice(0, 5)) {
    const score = d.score || 0;
    const icon = score >= 70 ? '🔥' : score >= 40 ? '⚡' : '📌';
    lines.push(`${icon} ${d.label}`);
  }
  navigator.clipboard.writeText(lines.join('\n'));
  showToast('Résumé Cockpit copié ✅', 'success');
}
