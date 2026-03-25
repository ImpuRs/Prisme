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
import { PAGE_SIZE, AGE_BRACKETS } from './constants.js';
import { fmtDate, formatEuro, _isMetierStrategique } from './utils.js';
import { _S } from './state.js';
import { calcPriorityScore } from './engine.js';


// ── Toast notifications ───────────────────────────────────────
export function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer'); if (!container) return;
  const toast = document.createElement('div');
  const colors = { success: 'bg-emerald-100 border-emerald-500 text-emerald-800', error: 'bg-red-100 border-red-500 text-red-800', warning: 'bg-amber-100 border-amber-500 text-amber-800', info: 'bg-blue-100 border-blue-500 text-blue-800' };
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
  const cls = { pending: 'text-gray-400', active: 'text-blue-300 font-bold animate-pulse', done: 'text-green-400 font-bold' };
  el.className = cls[status] || 'text-gray-400';
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
  if (i.files.length > 0 && _S.finalData.length > 0) {
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
  bannerRight.innerHTML = `<button onclick="expandImportZone()" style="font-size:10px;color:rgba(255,255,255,0.35);background:none;border:1px solid rgba(255,255,255,0.15);border-radius:4px;padding:1px 8px;cursor:pointer;transition:color .15s,border-color .15s" onmouseover="this.style.color='rgba(255,255,255,0.65)';this.style.borderColor='rgba(255,255,255,0.3)'" onmouseout="this.style.color='rgba(255,255,255,0.35)';this.style.borderColor='rgba(255,255,255,0.15)'">Modifier les fichiers</button><button onclick="document.getElementById('glossaire').classList.toggle('hidden')" style="font-size:10px;color:rgba(255,255,255,0.35);background:none;border:1px solid rgba(255,255,255,0.15);border-radius:4px;padding:1px 8px;cursor:pointer;margin-left:6px;transition:color .15s,border-color .15s" onmouseover="this.style.color='rgba(255,255,255,0.65)';this.style.borderColor='rgba(255,255,255,0.3)'" onmouseout="this.style.color='rgba(255,255,255,0.35)';this.style.borderColor='rgba(255,255,255,0.15)'">Glossaire</button>`;
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
  if (_S.finalData.length > 0) {
    const btn = document.getElementById('importZoneCancelBtn');
    if (btn) { btn.classList.remove('hidden'); btn.style.display = 'flex'; }
  }
}

// ── Tab navigation ────────────────────────────────────────────
export function switchTab(id) {
  window.scrollTo(0, 0);
  document.querySelectorAll('.tab-content').forEach(e => e.classList.add('hidden'));
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  const tab = document.getElementById('tab' + id.charAt(0).toUpperCase() + id.slice(1)); if (tab) tab.classList.remove('hidden');
  const btn = document.querySelector(`[data-tab="${id}"]`);
  if (btn) {
    btn.classList.add('active');
    if (id === 'territoire' && (_S.chalandiseReady || _S.territoireReady)) renderTerritoireTab();
  }
  // Update filter panel groups based on active tab
  const groups = { stock: 'filterGroupStock', territoire: 'filterGroupTerritoire', bench: 'filterGroupBench', promo: 'filterGroupPromo' };
  const activeGroup = id === 'bench' ? 'bench' : id === 'territoire' ? 'territoire' : id === 'promo' ? 'promo' : 'stock';
  Object.entries(groups).forEach(([key, gid]) => {
    const el = document.getElementById(gid); if (!el) return;
    el.classList.toggle('hidden', key !== activeGroup);
  });
  // Contextual panel title
  const titles = { table: 'Filtres Articles', dash: 'Filtres Stock', action: 'Filtres Cockpit', abc: 'Filtres Radar', territoire: 'Filtres Le Terrain', bench: 'Filtres Le Réseau', promo: 'Filtres Promo' };
  const titleEl = document.getElementById('filterPanelTitle');
  if (titleEl) titleEl.textContent = titles[id] || 'Filtres';
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

export function populateSelect(id, vals) {
  const s = document.getElementById(id); if (!s) return;
  if (s.tagName === 'INPUT') { const dl = document.getElementById(s.getAttribute('list')); if (dl) { dl.innerHTML = ''; [...vals].sort().forEach(v => { const o = document.createElement('option'); o.value = v; dl.appendChild(o); }); } return; }
  const f = s.options[0].textContent; s.innerHTML = `<option value="">${f}</option>`;
  [...vals].sort().forEach(v => { const o = document.createElement('option'); o.value = v; o.textContent = v; s.appendChild(o); });
}

// ── Filters ───────────────────────────────────────────────────
export function getFilteredData() {
  const fam = (document.getElementById('filterFamille').value || '').trim(), sFam = (document.getElementById('filterSousFamille').value || '').trim(), emp = (document.getElementById('filterEmplacement').value || '').trim(), stat = document.getElementById('filterStatut').value, af = document.getElementById('filterAge').value;
  const cockpitType = document.getElementById('filterCockpit').value;
  const abc = document.getElementById('filterABC').value, fmr = document.getElementById('filterFMR').value;
  const terms = document.getElementById('searchInput').value.toLowerCase().trim().split(/\s+/).filter(Boolean);
  const filtered = _S.finalData.filter(r => {
    if (fam && !(r.famille || '').toLowerCase().includes(fam.toLowerCase())) return false;
    if (sFam && !(r.sousFamille || '').toLowerCase().includes(sFam.toLowerCase())) return false;
    if (emp && !(r.emplacement || '').toLowerCase().includes(emp.toLowerCase())) return false;
    if (stat && r.statut !== stat) return false;
    if (af) { const b = AGE_BRACKETS[af]; if (b && (r.ageJours < b.min || r.ageJours >= b.max)) return false; }
    if (cockpitType && _S.cockpitLists[cockpitType] && !_S.cockpitLists[cockpitType].has(r.code)) return false;
    if (abc && r.abcClass !== abc) return false;
    if (fmr && r.fmrClass !== fmr) return false;
    if (terms.length > 0) { const h = (r.code + ' ' + r.libelle + ' ' + r.famille).toLowerCase(); return terms.every(t => h.includes(t)); }
    return true;
  });
  let activeCount = 0; if (fam) activeCount++; if (sFam) activeCount++; if (emp) activeCount++; if (stat) activeCount++; if (af) activeCount++; if (terms.length) activeCount++; if (cockpitType) activeCount++; if (abc) activeCount++; if (fmr) activeCount++;
  const el = document.getElementById('filterActiveCount'); if (el) el.textContent = activeCount > 0 ? `(${activeCount} actif${activeCount > 1 ? 's' : ''})` : '';
  return filtered;
}

export function renderAll() {
  _S.filteredData = getFilteredData();
  _S.filteredData.sort((a, b) => { let vA = a[_S.sortCol], vB = b[_S.sortCol]; if (typeof vA === 'string') vA = vA.toLowerCase(); if (typeof vB === 'string') vB = vB.toLowerCase(); if (vA < vB) return _S.sortAsc ? -1 : 1; if (vA > vB) return _S.sortAsc ? 1 : -1; return 0; });
  updateActiveAgeIndicator();
  renderTable(true);
  renderDashboardAndCockpit();
  renderABCTab();
  renderCanalAgence();
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
  document.getElementById('activeCockpitLabel').textContent = { ruptures: '🚨 Ruptures', fantomes: '👻 Articles sans emplacement', anomalies: '⚠️ Anomalies', saso: '📦 SASO', dormants: '💤 Dormants', fins: '📉 Fins de série', top20: '🏆 Top 20 fréquence', nouveautes: '✨ Nouveautés', colisrayon: '📦→🏪 Colis à stocker', stockneg: '📉 Stock négatif', fragiles: '🎯 Articles mono-client' }[type] || type;
  const nbtn = document.getElementById('btnNouveautesOnly');
  if (nbtn) { const isNouv = type === 'nouveautes'; nbtn.classList.toggle('bg-emerald-500', isNouv); nbtn.classList.toggle('text-white', isNouv); nbtn.classList.toggle('bg-gray-200', !isNouv); nbtn.classList.toggle('text-gray-600', !isNouv); }
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
  if (nbtn) { nbtn.classList.remove('bg-emerald-500', 'text-white'); nbtn.classList.add('bg-gray-200', 'text-gray-600'); }
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
  el.innerHTML = `<span style="color:rgba(255,255,255,0.25);margin-right:8px;font-size:10px;letter-spacing:.05em;text-transform:uppercase">Détecté</span>` + parts.join(sep);
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
      <button onclick="closeReporting()" class="text-xs bg-slate-700 hover:bg-slate-600 text-slate-300 py-1.5 px-3 rounded-lg font-bold transition-colors">✕ Fermer</button>
    </div>
  </div>
  <textarea id="reportingTextarea" class="w-full bg-slate-900 text-slate-200 text-xs font-mono p-4 rounded-xl border border-slate-700 resize-y" style="min-height:480px;line-height:1.75" spellcheck="false">${text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}</textarea>
  <p class="text-[10px] text-slate-500 mt-2">Texte brut — collez directement dans Excel, Teams ou un email. Modifiable avant envoi.</p>`;
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
export function changePage(d) { const m = Math.ceil(_S.filteredData.length / PAGE_SIZE) - 1; _S.currentPage = Math.max(0, Math.min(_S.currentPage + d, m)); renderTable(true); }

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
  const data = _S.filteredData.length ? _S.filteredData : _S.finalData;
  for (const r of data) {
    const br = getAgeBracket(r.ageJours);
    const caPerduCSV = (r.W >= 3 && r.stockActuel <= 0 && !r.isParent && r.V > 0) ? estimerCAPerdu(r.V, r.prixUnitaire, Math.min(r.ageJours >= 999 ? 90 : r.ageJours, 90)) : 0;
    lines.push([r.code, `"${r.libelle.replace(/"/g, '""')}"`, `"${r.famille}"`, `"${r.sousFamille}"`, `"${r.emplacement}"`, `"${r.statut}"`, r.ageJours, AGE_BRACKETS[br].label.replace(/[🟢🟡🟠🔴]/g, '').trim(), r.isNouveaute ? 'OUI' : 'NON', r.isParent ? 'OUI' : 'NON', r.V, r.enleveTotal || 0, r.W, r.stockActuel, r.couvertureJours >= 999 ? '' : r.couvertureJours, r.prixUnitaire.toFixed(2).replace('.', ','), r.ancienMin, r.ancienMax, r.nouveauMin, r.nouveauMax, r.abcClass || '', r.fmrClass || '', caPerduCSV || ''].join(SEP));
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
  { kw: ['promo'], icon: '🎯', label: 'Onglet Promo', fn: () => { switchTab('promo'); } },
  { kw: ['radar','abc','fmr','matrice'], icon: '📡', label: 'Onglet Radar (ABC/FMR)', fn: () => { switchTab('abc'); } },
  { kw: ['terrain','territoire'], icon: '🔗', label: 'Onglet Le Terrain', fn: () => { switchTab('territoire'); } },
  { kw: ['réseau','reseau','benchmark','bench'], icon: '🔭', label: 'Onglet Le Réseau', fn: () => { switchTab('bench'); } },
  { kw: ['cockpit','actions','urgences'], icon: '⚙️', label: 'Onglet Cockpit', fn: () => { switchTab('action'); } },
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
        ${item.badge ? `<span class="cmd-item-badge ${item.badgeCls || 'bg-gray-100 text-gray-600'}">${item.badge}</span>` : ''}
        <span class="text-gray-300 text-xs ml-1">↵</span>
      </div>`;
    }
  }
  res.innerHTML = html;
}

export function _cmdBuildResults(q) {
  const groups = [];
  const ql = q.toLowerCase();

  // 1. Quick actions
  const matchedActions = [];
  for (const a of _CMD_ACTIONS) {
    if (!q || a.kw.some(k => k.includes(ql) || ql.includes(k.split(' ')[0]))) {
      matchedActions.push({ icon: a.icon, main: a.label, sub: '', fn: a.fn });
      if (matchedActions.length >= 5) break;
    }
  }
  if (matchedActions.length) groups.push({ header: '⚡ Actions', items: matchedActions });

  if (!q) return groups;

  // 2. Articles (search _S.finalData)
  if (typeof _S.finalData !== 'undefined' && _S.finalData.length) {
    const terms = ql.split(/\s+/).filter(Boolean);
    const artResults = [];
    for (const r of _S.finalData) {
      if (artResults.length >= 5) break;
      const haystack = (r.code + ' ' + r.libelle + ' ' + (r.famille || '')).toLowerCase();
      if (terms.every(t => haystack.includes(t))) {
        const stockColor = r.stockActuel <= 0 ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700';
        artResults.push({
          icon: '📦',
          main: `<span class="font-mono text-[10px] text-gray-400 mr-1">${r.code}</span>${_cmdEsc(r.libelle)}`,
          sub: `${r.famille || '—'} · Stock: ${r.stockActuel}`,
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
      if (code.toLowerCase().includes(ql) || (info.nom || '').toLowerCase().includes(ql)) {
        const ca = _cmdClientCA(code);
        const isActif = (info.statut || '').toLowerCase().includes('actif');
        clientResults.push({
          icon: '👤',
          main: `<span class="font-mono text-[10px] text-gray-400 mr-1">${code}</span>${_cmdEsc(info.nom || code)}`,
          sub: [info.metier, ca ? ca + '€ CA' : ''].filter(Boolean).join(' · '),
          badge: isActif ? 'Actif' : (info.statut || ''),
          badgeCls: isActif ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500',
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
      if (code.toLowerCase().includes(ql) || (nom || '').toLowerCase().includes(ql)) {
        clientResults.push({
          icon: '👤',
          main: `<span class="font-mono text-[10px] text-gray-400 mr-1">${code}</span>${_cmdEsc(nom || code)}`,
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
  if (typeof _S.finalData !== 'undefined' && _S.finalData.length) {
    const famSet = new Set();
    _S.finalData.forEach(r => { if (r.famille) famSet.add(r.famille); });
    const famResults = [];
    for (const f of famSet) {
      if (famResults.length >= 3) break;
      if (f.toLowerCase().includes(ql)) {
        famResults.push({
          icon: '🏷️',
          main: _cmdEsc(f),
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
      if (s !== _S.selectedMyStore && s.toLowerCase().includes(ql)) {
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

  return groups;
}

export function _cmdClientCA(code) {
  if (typeof _S.ventesClientArticle === 'undefined') return '';
  const arts = _S.ventesClientArticle.get(code);
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

// ── Feature 2: Signal Ambiant ─────────────────────────────────
// Barre 3px en haut de l'écran reflétant l'état de santé du stock
export function updateAmbientSignal() {
  const el = document.getElementById('ambient-signal');
  if (!el) return;
  if (!_S.finalData.length) { el.style.setProperty('--health-color', 'transparent'); return; }

  // Taux de service : articles fréquents (W≥3) en stock ÷ total fréquents
  const freq = _S.finalData.filter(r => r.W >= 3 && !r.isParent && !(r.V === 0 && r.enleveTotal > 0));
  const inStock = freq.filter(r => r.stockActuel > 0).length;
  const sr = freq.length > 0 ? (inStock / freq.length * 100) : 100;

  // Ruptures critiques : W≥3, stock≤0, priorityScore≥5000
  const critRupt = _S.finalData.filter(r =>
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
  if (!el || !textEl || !_S.finalData.length) { if (el) el.classList.add('hidden'); return; }

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
    if (srNum >= 95) sentences.push({ icon: '💪', color: 'c-ok', text: `Taux de service\u00a0: ${srFmt} — excellent.` });
    else if (srNum >= 85) sentences.push({ icon: '👍', color: 'c-caution', text: `Taux de service\u00a0: ${srFmt} — correct, marge de progression sur les ruptures.` });
    else sentences.push({ icon: '⚠️', color: 'c-danger', text: `Taux de service\u00a0: ${srFmt} — priorité\u00a0: résoudre les ruptures pour remonter.` });
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
  if (_S.finalData[0]?.abcClass !== undefined) {
    const crItems = _S.finalData.filter(r => r.abcClass === 'C' && r.fmrClass === 'R' && r.stockActuel > 0);
    const crVal = crItems.reduce((s, r) => s + r.stockActuel * r.prixUnitaire, 0);
    const totalFull = _S.finalData.reduce((s, r) => r.stockActuel > 0 ? s + r.stockActuel * r.prixUnitaire : s, 0);
    const crPct = totalFull > 0 ? (crVal / totalFull * 100).toFixed(1) : '0';
    if (crVal > 100) {
      sentences.push({ icon: '🗑️', color: 'c-muted', text: `${n(crPct + '%', 'c-muted', `${crItems.length} articles C-Rare en stock`)} du stock (${n(formatEuro(crVal), 'c-muted', 'Valeur stock C-Rare')}) en C-Rare — candidat au déréférencement.` });
    }
  }

  // 5. Territoire si chargé
  if (_S.territoireReady && _S.territoireLines.length > 0) {
    const artMap = new Map();
    for (const l of _S.territoireLines) {
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
    sentences.push({ icon: '⚠️', color: 'c-caution', text: `Concentration client\u00a0: ${n(_S._iccData.top3.length + ' clients', 'c-caution', `Top 3 clients = ${_S._iccData.top3Pct}% du CA Comptoir`)} représentent ${n(_S._iccData.top3Pct + '%', 'c-caution', 'Part du CA Comptoir sur les 3 premiers clients')} du CA Comptoir. Risque si l'un d'eux part.` });
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
export function renderDecisionQueue() {
  const el = document.getElementById('decisionQueue');
  const listEl = document.getElementById('decisionQueueList');
  const subtitle = document.getElementById('dqSubtitle');
  if (!el || !listEl) return;
  if (!_S.decisionQueueData || !_S.decisionQueueData.length) { el.classList.add('hidden'); return; }

  // impactClass : 'dq-high' = rouge (--c-danger), 'dq-medium' = ambre (--c-caution)
  // Noms prefixés 'dq-' pour éviter tout conflit avec les utilitaires Tailwind
  const typeConfig = {
    rupture:        { badgeClass: 'dq-danger',  icon: '🚨', impactClass: 'dq-high' },
    alerte_prev:    { badgeClass: 'dq-caution', icon: '⚡', impactClass: 'dq-medium' },
    client:         { badgeClass: 'dq-action',  icon: '📞', impactClass: 'dq-medium' },
    concentration:  { badgeClass: 'dq-caution', icon: '📊', impactClass: 'dq-medium' },
    dormants:       { badgeClass: 'dq-caution', icon: '💤', impactClass: 'dq-medium' },
    fragilite:      { badgeClass: 'dq-action',  icon: '🎯', impactClass: 'dq-medium' },
    anomalie_minmax:{ badgeClass: 'dq-action',  icon: '⚠️', impactClass: '' },
    sain:           { badgeClass: 'dq-ok',      icon: '✅', impactClass: '' },
  };

  const items = _S.decisionQueueData.slice(0, 9);
  if (subtitle) subtitle.textContent = `${items.length} action${items.length > 1 ? 's' : ''} · ruptures d'abord`;

  listEl.innerHTML = items.map((d, idx) => {
    const cfg = typeConfig[d.type] || { badgeClass: '', icon: '•', impactClass: '' };
    const impactStr = d.impact >= 1000 ? formatEuro(d.impact) : '';
    // Fix: dormants/clients → ambre (dq-medium). Seules les ruptures actives → rouge (dq-high).
    const impactClass = (d.type === 'rupture') ? 'dq-high' : (impactStr ? 'dq-medium' : '');
    const impactHtml = impactStr ? `<span class="dq-impact ${impactClass}">${impactStr}</span>` : '';
    const whyHtml = d.why && d.why.length ? `<details class="dq-why" onclick="event.stopPropagation()"><summary>Pourquoi ?</summary><ul>${d.why.map(w => `<li>${w}</li>`).join('')}</ul></details>` : '';
    return `<div class="dq-item dq-item-click" data-dqtype="${d.type}" onclick="dqFocus(${idx})" title="Cliquer pour naviguer">
      <div class="dq-num-badge ${cfg.badgeClass}">${idx + 1}</div>
      <div style="flex:1;min-width:0">
        <div class="dq-label">${cfg.icon} ${d.label}</div>
        ${whyHtml}
      </div>
      ${impactHtml}
    </div>`;
  }).join('');

  // Footer : Clip ERP si au moins une commande à passer
  const footerEl = document.getElementById('dqFooter');
  if (footerEl) {
    const cmdItems = items.filter(d => d.action === 'commander' && d.qteSugg > 0 && d.code);
    if (cmdItems.length > 0) {
      footerEl.innerHTML = `<button id="erpCopyBtn" onclick="clipERP()" class="w-full mt-1 py-2 px-3 rounded-lg text-xs font-bold bg-slate-100 border border-slate-200 hover:bg-slate-200 transition-colors flex items-center justify-center gap-2" style="color:var(--c-action)">📋 Copier paquet ERP <span class="font-normal text-gray-400">(${cmdItems.length} article${cmdItems.length > 1 ? 's' : ''})</span></button>`;
      footerEl.classList.remove('hidden');
    } else {
      footerEl.innerHTML = '';
      footerEl.classList.add('hidden');
    }
  }

  el.classList.remove('hidden');
}

// ── Feature 6: Focus Mode — clic DQ → navigation ─────────────
export function dqFocus(idx) {
  const d = (_S.decisionQueueData || [])[idx];
  if (!d) return;
  switch (d.type) {
    case 'rupture':
    case 'alerte_prev': {
      // Filtrer sur l'article spécifique dans le tableau
      const si = document.getElementById('searchInput');
      if (si && d.code) si.value = d.code;
      clearCockpitFilter(true);
      _S.currentPage = 0;
      switchTab('table');
      renderAll();
      break;
    }
    case 'dormants':
      showCockpitInTable('dormants');
      break;
    case 'anomalie_minmax':
      showCockpitInTable('anomalies');
      break;
    case 'client':
      switchTab('territoire');
      break;
    case 'concentration':
      switchTab('territoire');
      break;
    case 'fragilite':
      showCockpitInTable('fragiles');
      switchTab('table');
      break;
    default:
      break;
  }
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

// Input debounce
document.addEventListener('input', function(e) {
  if (e.target.id !== 'cmdInput') return;
  _cmdSelectedIdx = -1;
  clearTimeout(_cmdTimer);
  _cmdTimer = setTimeout(() => _cmdRender(e.target.value), 150);
});
