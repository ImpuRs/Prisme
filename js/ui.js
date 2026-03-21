// ═══════════════════════════════════════════════════════════════
// PILOT PRO — ui.js
// Fonctions UI transverses (toast, tabs, filtres, table, export)
// Dépend de : constants.js, utils.js, state.js, engine.js
// ═══════════════════════════════════════════════════════════════
'use strict';

// ── Toast notifications ───────────────────────────────────────
function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer'); if (!container) return;
  const toast = document.createElement('div');
  const colors = { success: 'bg-emerald-100 border-emerald-500 text-emerald-800', error: 'bg-red-100 border-red-500 text-red-800', warning: 'bg-amber-100 border-amber-500 text-amber-800', info: 'bg-blue-100 border-blue-500 text-blue-800' };
  toast.className = `p-3 rounded-lg shadow-lg border-l-4 font-bold text-xs flex items-center gap-2 toast-enter pointer-events-auto ${colors[type] || colors.info}`;
  toast.innerHTML = message;
  container.appendChild(toast);
  setTimeout(() => { toast.classList.replace('toast-enter', 'toast-leave'); setTimeout(() => toast.remove(), 300); }, 3500);
}

// ── Loading overlay ───────────────────────────────────────────
function updateProgress(c, t, txt, step) {
  const p = t > 0 ? Math.round(c / t * 100) : 0;
  document.getElementById('progressBar').style.width = p + '%';
  document.getElementById('progressPct').textContent = p + '%';
  if (txt) document.getElementById('loadingText').textContent = txt;
  if (step) document.getElementById('loadingStep').textContent = step;
}

function updatePipeline(step, status) {
  const idMap = { consomme: 'pipeConsomme', stock: 'pipeStock', territoire: 'pipeTerritoire' };
  const el = document.getElementById(idMap[step]); if (!el) return;
  const cls = { pending: 'text-gray-400', active: 'text-blue-300 font-bold animate-pulse', done: 'text-green-400 font-bold' };
  el.className = cls[status] || 'text-gray-400';
  if (status === 'done') el.textContent = { consomme: '✅ Consommé', stock: '✅ Stock', territoire: '✅ Territoire' }[step] || '✅';
  if (status !== 'pending') { const pl = document.getElementById('loadingPipeline'); if (pl) pl.classList.remove('hidden'); }
  if (step === 'territoire') { const sep = document.getElementById('pipeSepTerr'); if (sep) sep.classList.remove('hidden'); el.classList.remove('hidden'); }
}

function showLoading(t, s) { document.getElementById('loadingOverlay').classList.add('active'); updateProgress(0, 100, t, s); }
function hideLoading() { document.getElementById('loadingOverlay').classList.remove('active'); }

function showTerritoireLoading(show) {
  const sp = document.getElementById('terrLoadingSpinner');
  if (sp) sp.classList.toggle('hidden', !show);
}

function updateTerrProgress(cur, total) {
  const pct2 = total > 0 ? Math.round(cur / total * 100) : 0;
  const bar = document.getElementById('terrProgressBar');
  const txt = document.getElementById('terrProgressText');
  if (bar) bar.style.width = pct2 + '%';
  if (txt) txt.textContent = pct2 + '%';
  const pipe = document.getElementById('pipeTerritoire');
  if (pipe && pct2 < 100) pipe.textContent = `🔗 Territoire… ${pct2}%`;
}

// ── Import zone collapse ──────────────────────────────────────
function onFileSelected(i, id) { document.getElementById(id).classList.toggle('file-loaded', i.files.length > 0); }

function collapseImportZone(nbFiles, store, nbArts, elapsed) {
  const iz = document.getElementById('importZone');
  const bannerRight = document.getElementById('insightsBannerRight');
  const banner = document.getElementById('insightsBanner');
  if (!iz || !bannerRight || !banner) return;
  bannerRight.innerHTML = `<button onclick="expandImportZone()" class="text-[10px] bg-slate-700 hover:bg-slate-600 text-slate-300 py-0.5 px-2 rounded font-semibold">▼ Modifier les fichiers</button><button onclick="document.getElementById('glossaire').classList.toggle('hidden')" class="ml-1 text-[10px] bg-blue-900 hover:bg-blue-800 text-blue-200 py-0.5 px-2 rounded font-semibold">📖 Glossaire</button>`;
  iz.classList.add('hidden');
  banner.classList.remove('hidden');
}

function expandImportZone() {
  const iz = document.getElementById('importZone');
  const bannerRight = document.getElementById('insightsBannerRight');
  const bannerLeft = document.getElementById('insightsBannerLeft');
  const banner = document.getElementById('insightsBanner');
  if (iz) iz.classList.remove('hidden');
  if (bannerRight) bannerRight.innerHTML = '';
  if (banner && bannerLeft && !bannerLeft.innerHTML.trim()) banner.classList.add('hidden');
}

// ── Tab navigation ────────────────────────────────────────────
function switchTab(id) {
  document.querySelectorAll('.tab-content').forEach(e => e.classList.add('hidden'));
  document.querySelectorAll('.tab-btn').forEach(b => { b.classList.remove('border-blue-600', 'text-blue-600', 'border-red-600', 'text-red-700', 'border-cyan-600', 'text-cyan-700', 'border-indigo-600', 'text-indigo-600', 'border-violet-600', 'text-violet-600', 'active'); b.classList.add('border-transparent', 'text-gray-500'); });
  const tab = document.getElementById('tab' + id.charAt(0).toUpperCase() + id.slice(1)); if (tab) tab.classList.remove('hidden');
  const btn = document.querySelector(`[data-tab="${id}"]`);
  if (btn) {
    btn.classList.remove('border-transparent', 'text-gray-500');
    if (id === 'action') btn.classList.add('border-red-600', 'text-red-700', 'active');
    else if (id === 'bench') btn.classList.add('border-cyan-600', 'text-cyan-700', 'active');
    else if (id === 'territoire') { btn.classList.add('border-violet-600', 'text-violet-600', 'active'); if (chalandiseReady || territoireReady) renderTerritoireTab(); }
    else if (id === 'abc') btn.classList.add('border-indigo-600', 'text-indigo-600', 'active');
    else btn.classList.add('border-blue-600', 'text-blue-600', 'active');
  }
  const loaded = !document.getElementById('tabsContainer').classList.contains('hidden');
  if (loaded) { const gf = document.getElementById('globalFilters'), of2 = document.getElementById('obsFilters'); if (gf && of2) { if (id === 'bench') { gf.classList.add('hidden'); of2.classList.remove('hidden'); } else { gf.classList.remove('hidden'); of2.classList.add('hidden'); } } }
}

function populateSelect(id, vals) {
  const s = document.getElementById(id); if (!s) return;
  if (s.tagName === 'INPUT') { const dl = document.getElementById(s.getAttribute('list')); if (dl) { dl.innerHTML = ''; [...vals].sort().forEach(v => { const o = document.createElement('option'); o.value = v; dl.appendChild(o); }); } return; }
  const f = s.options[0].textContent; s.innerHTML = `<option value="">${f}</option>`;
  [...vals].sort().forEach(v => { const o = document.createElement('option'); o.value = v; o.textContent = v; s.appendChild(o); });
}

// ── Filters ───────────────────────────────────────────────────
function getFilteredData() {
  const fam = (document.getElementById('filterFamille').value || '').trim(), sFam = (document.getElementById('filterSousFamille').value || '').trim(), emp = (document.getElementById('filterEmplacement').value || '').trim(), stat = document.getElementById('filterStatut').value, af = document.getElementById('filterAge').value;
  const cockpitType = document.getElementById('filterCockpit').value;
  const abc = document.getElementById('filterABC').value, fmr = document.getElementById('filterFMR').value;
  const terms = document.getElementById('searchInput').value.toLowerCase().trim().split(/\s+/).filter(Boolean);
  const filtered = finalData.filter(r => {
    if (fam && !(r.famille || '').toLowerCase().includes(fam.toLowerCase())) return false;
    if (sFam && !(r.sousFamille || '').toLowerCase().includes(sFam.toLowerCase())) return false;
    if (emp && !(r.emplacement || '').toLowerCase().includes(emp.toLowerCase())) return false;
    if (stat && r.statut !== stat) return false;
    if (af) { const b = AGE_BRACKETS[af]; if (b && (r.ageJours < b.min || r.ageJours >= b.max)) return false; }
    if (cockpitType && cockpitLists[cockpitType] && !cockpitLists[cockpitType].has(r.code)) return false;
    if (abc && r.abcClass !== abc) return false;
    if (fmr && r.fmrClass !== fmr) return false;
    if (terms.length > 0) { const h = (r.code + ' ' + r.libelle + ' ' + r.famille).toLowerCase(); return terms.every(t => h.includes(t)); }
    return true;
  });
  let activeCount = 0; if (fam) activeCount++; if (sFam) activeCount++; if (emp) activeCount++; if (stat) activeCount++; if (af) activeCount++; if (terms.length) activeCount++; if (cockpitType) activeCount++; if (abc) activeCount++; if (fmr) activeCount++;
  const el = document.getElementById('filterActiveCount'); if (el) el.textContent = activeCount > 0 ? `(${activeCount} actif${activeCount > 1 ? 's' : ''})` : '';
  return filtered;
}

function renderAll() {
  filteredData = getFilteredData();
  filteredData.sort((a, b) => { let vA = a[sortCol], vB = b[sortCol]; if (typeof vA === 'string') vA = vA.toLowerCase(); if (typeof vB === 'string') vB = vB.toLowerCase(); if (vA < vB) return sortAsc ? -1 : 1; if (vA > vB) return sortAsc ? 1 : -1; return 0; });
  updateActiveAgeIndicator();
  renderTable(true);
  renderDashboardAndCockpit();
  renderABCTab();
  renderCanalAgence();
}

function onFilterChange() { currentPage = 0; clearCockpitFilter(true); renderAll(); }
function debouncedRender() { clearTimeout(debounceTimer); debounceTimer = setTimeout(() => { currentPage = 0; renderAll(); }, 250); }

function resetFilters() {
  document.getElementById('searchInput').value = '';
  ['filterFamille', 'filterSousFamille', 'filterEmplacement', 'filterStatut', 'filterAge', 'filterABC', 'filterFMR'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  clearCockpitFilter(true); updateActiveAgeIndicator(); currentPage = 0; renderAll();
}

function filterByAge(b) { document.getElementById('filterAge').value = b; updateActiveAgeIndicator(); currentPage = 0; switchTab('table'); renderAll(); }
function clearAgeFilter() { document.getElementById('filterAge').value = ''; updateActiveAgeIndicator(); currentPage = 0; renderAll(); }

function updateActiveAgeIndicator() {
  const v = document.getElementById('filterAge').value;
  const el = document.getElementById('activeAgeFilter');
  if (v && AGE_BRACKETS[v]) { const b = AGE_BRACKETS[v]; el.className = `text-xs font-bold px-3 py-1 rounded-full flex items-center gap-1 cursor-pointer ${b.badgeBg}`; document.getElementById('activeAgeLabel').textContent = '⏳ ' + b.label; el.classList.remove('hidden'); }
  else el.classList.add('hidden');
}

function filterByAbcFmr(abc, fmr) {
  document.getElementById('filterABC').value = abc;
  document.getElementById('filterFMR').value = fmr;
  currentPage = 0; switchTab('table'); renderAll();
}

// ── Cockpit filter ────────────────────────────────────────────
function showCockpitInTable(type) {
  document.getElementById('filterCockpit').value = type;
  document.getElementById('activeCockpitLabel').textContent = { ruptures: '🚨 Ruptures', fantomes: '👻 Articles sans emplacement', anomalies: '⚠️ Anomalies', saso: '📦 SASO', dormants: '💤 Dormants', fins: '📉 Fins de série', top20: '🏆 Top 20 fréquence', nouveautes: '✨ Nouveautés', colisrayon: '📦→🏪 Colis à stocker' }[type] || type;
  document.getElementById('activeCockpitFilter').classList.remove('hidden');
  currentPage = 0; switchTab('table');
  filteredData = getFilteredData();
  filteredData.sort((a, b) => { let vA = a[sortCol], vB = b[sortCol]; if (typeof vA === 'string') vA = vA.toLowerCase(); if (typeof vB === 'string') vB = vB.toLowerCase(); if (vA < vB) return sortAsc ? -1 : 1; if (vA > vB) return sortAsc ? 1 : -1; return 0; });
  updateActiveAgeIndicator(); renderTable(true);
}

function clearCockpitFilter(silent) {
  document.getElementById('filterCockpit').value = '';
  document.getElementById('activeCockpitFilter').classList.add('hidden');
  if (!silent) { currentPage = 0; renderAll(); }
}

// ── Period alert ──────────────────────────────────────────────
function updatePeriodAlert() {
  if (!consommePeriodMin || !consommePeriodMax) return;
  const banner = document.getElementById('periodBanner');
  if (consommeMoisCouverts < 10) {
    if (banner) { banner.textContent = `⚠️ Attention : votre fichier Consommé couvre ${consommeMoisCouverts} mois (${fmtDate(consommePeriodMin)} → ${fmtDate(consommePeriodMax)}). Pour un calcul MIN/MAX fiable, 12 mois minimum sont recommandés.`; banner.classList.add('active'); }
  } else {
    if (banner) banner.classList.remove('active');
  }
  const btn = document.getElementById('navPeriodBtn');
  const navPeriod = document.getElementById('navPeriod');
  if (btn) { btn.textContent = `📅 ${fmtDate(consommePeriodMin)} → ${fmtDate(consommePeriodMax)}`; btn.style.cssText = ''; }
  if (navPeriod) navPeriod.classList.remove('hidden');
}

function renderInsightsBanner() {
  const el = document.getElementById('insightsBannerLeft');
  const banner = document.getElementById('insightsBanner');
  if (!el || !banner) return;
  const { ruptures, dormants, absentsTerr, extClients, hasTerr } = _insights;
  if (!ruptures && !dormants && !absentsTerr && !extClients) {
    el.innerHTML = '';
    const right = document.getElementById('insightsBannerRight');
    if (!right || !right.innerHTML.trim()) banner.classList.add('hidden');
    return;
  }
  const mkLink = (txt, tab) => `<span class="cursor-pointer hover:text-white underline underline-offset-2 whitespace-nowrap" onclick="switchTab('${tab}')">${txt}</span>`;
  const mkAction = (txt, fn) => `<span class="cursor-pointer hover:text-white underline underline-offset-2 whitespace-nowrap" onclick="${fn}">${txt}</span>`;
  const parts = [];
  parts.push(mkAction(`${ruptures} rupture${ruptures !== 1 ? 's' : ''} critiques`, "showCockpitInTable('ruptures')"));
  if (hasTerr) {
    parts.push(mkLink(`${absentsTerr} article${absentsTerr !== 1 ? 's' : ''} territoire absents du rayon`, `territoire`));
    parts.push(mkLink(`${extClients} client${extClients !== 1 ? 's' : ''} qui ne viennent jamais`, `territoire`));
  } else {
    parts.push(mkAction(`${dormants} dormant${dormants !== 1 ? 's' : ''} à traiter`, "showCockpitInTable('dormants')"));
  }
  el.innerHTML = `<span class="text-slate-400 mr-1">💡 PILOT a détecté :</span>` + parts.join(`<span class="text-slate-500 mx-1">·</span>`);
  banner.classList.remove('hidden');
}

// ── Reporting ────────────────────────────────────────────────
function openReporting() {
  const overlay = document.getElementById('reportingOverlay');
  const panel = document.getElementById('reportingPanel');
  if (!overlay || !panel) return;
  const text = generateReportText();
  panel.innerHTML = `<div class="flex items-center justify-between mb-4 gap-3">
    <h2 class="text-base font-extrabold text-white shrink-0">📊 Reporting ${selectedMyStore || ''}</h2>
    <div class="flex items-center gap-2 shrink-0">
      <button onclick="copyReportText()" class="text-xs bg-indigo-700 hover:bg-indigo-600 text-white py-1.5 px-3 rounded-lg font-bold transition-colors">📋 Copier</button>
      <button onclick="closeReporting()" class="text-xs bg-slate-700 hover:bg-slate-600 text-slate-300 py-1.5 px-3 rounded-lg font-bold transition-colors">✕ Fermer</button>
    </div>
  </div>
  <textarea id="reportingTextarea" class="w-full bg-slate-900 text-slate-200 text-xs font-mono p-4 rounded-xl border border-slate-700 resize-y" style="min-height:480px;line-height:1.75" spellcheck="false">${text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}</textarea>
  <p class="text-[10px] text-slate-500 mt-2">Texte brut — collez directement dans Excel, Teams ou un email. Modifiable avant envoi.</p>`;
  overlay.classList.add('active');
}

function closeReporting() {
  const overlay = document.getElementById('reportingOverlay');
  if (overlay) overlay.classList.remove('active');
}

function copyReportText() {
  const ta = document.getElementById('reportingTextarea');
  if (!ta) return;
  navigator.clipboard.writeText(ta.value)
    .then(() => showToast('📋 Rapport copié dans le presse-papier !', 'success'))
    .catch(() => { ta.select(); document.execCommand('copy'); showToast('📋 Rapport copié !', 'success'); });
}

// ── Table sort / pagination ───────────────────────────────────
function sortBy(c) { if (sortCol === c) sortAsc = !sortAsc; else { sortCol = c; sortAsc = false; } currentPage = 0; renderTable(); }
function changePage(d) { const m = Math.ceil(filteredData.length / PAGE_SIZE) - 1; currentPage = Math.max(0, Math.min(currentPage + d, m)); renderTable(true); }

// ── KPI history ───────────────────────────────────────────────
function clearSavedKPI() { kpiHistory = []; document.getElementById('compareBlock').classList.add('hidden'); showToast('🗑️ Historique effacé.', 'success'); }

function exportKPIhistory() {
  if (!kpiHistory.length) { showToast('⚠️ Lancez d\'abord une analyse.', 'warning'); return; }
  const blob = new Blob([JSON.stringify({ magasin: selectedMyStore, exportDate: new Date().toISOString(), history: kpiHistory }, null, 2)], { type: 'application/json' });
  const link = document.createElement('a'); link.href = URL.createObjectURL(blob);
  link.download = 'PILOT_historique_' + (selectedMyStore || 'X') + '_' + new Date().toISOString().slice(0, 10) + '.json';
  document.body.appendChild(link); link.click(); document.body.removeChild(link); URL.revokeObjectURL(link.href);
  showToast('📥 Historique exporté', 'success');
}

function importKPIhistory(input) {
  if (!input.files.length) return;
  const reader = new FileReader();
  reader.onload = function (e) { try { const data = JSON.parse(e.target.result); if (data.history && data.history.length) { kpiHistory = data.history; showToast(`✅ ${data.history.length} entrée(s) importée(s). Relancez l'analyse.`, 'success'); renderAll(); } else { showToast('❌ Fichier invalide.', 'error'); } } catch (err) { showToast('❌ Erreur : ' + err.message, 'error'); } };
  reader.readAsText(input.files[0]); input.value = '';
}

// ── CSV export ────────────────────────────────────────────────
function downloadCSV() {
  const SEP = ';';
  const hd = ['Code', 'Libelle', 'Famille', 'S/Fam', 'Empl', 'Statut', 'Age', 'Tranche', 'Nouv', 'RefPere', 'Preleve', 'Enleve', 'Freq', 'Stock', 'Couverture(j)', 'PU', 'AncMin', 'AncMax', 'MIN', 'MAX', 'ABC', 'FMR', 'CAPerdu'];
  const lines = ['\uFEFF' + hd.join(SEP)];
  const data = filteredData.length ? filteredData : finalData;
  for (const r of data) {
    const br = getAgeBracket(r.ageJours);
    const caPerduCSV = (r.W >= 3 && r.stockActuel <= 0 && !r.isParent && r.V > 0) ? estimerCAPerdu(r.V, r.prixUnitaire, Math.min(r.ageJours >= 999 ? 90 : r.ageJours, 90)) : 0;
    lines.push([r.code, `"${r.libelle.replace(/"/g, '""')}"`, `"${r.famille}"`, `"${r.sousFamille}"`, `"${r.emplacement}"`, `"${r.statut}"`, r.ageJours, AGE_BRACKETS[br].label.replace(/[🟢🟡🟠🔴]/g, '').trim(), r.isNouveaute ? 'OUI' : 'NON', r.isParent ? 'OUI' : 'NON', r.V, r.enleveTotal || 0, r.W, r.stockActuel, r.couvertureJours >= 999 ? '' : r.couvertureJours, r.prixUnitaire.toFixed(2).replace('.', ','), r.ancienMin, r.ancienMax, r.nouveauMin, r.nouveauMax, r.abcClass || '', r.fmrClass || '', caPerduCSV || ''].join(SEP));
  }
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a'); link.href = URL.createObjectURL(blob);
  link.download = `PILOT_${selectedMyStore || 'X'}_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link); link.click(); document.body.removeChild(link); URL.revokeObjectURL(link.href);
  showToast('📥 CSV téléchargé', 'success');
}
