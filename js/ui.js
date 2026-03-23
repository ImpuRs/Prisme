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
  bannerRight.innerHTML = `<button onclick="expandImportZone()" style="font-size:10px;color:rgba(255,255,255,0.35);background:none;border:1px solid rgba(255,255,255,0.15);border-radius:4px;padding:1px 8px;cursor:pointer;transition:color .15s,border-color .15s" onmouseover="this.style.color='rgba(255,255,255,0.65)';this.style.borderColor='rgba(255,255,255,0.3)'" onmouseout="this.style.color='rgba(255,255,255,0.35)';this.style.borderColor='rgba(255,255,255,0.15)'">Modifier les fichiers</button><button onclick="document.getElementById('glossaire').classList.toggle('hidden')" style="font-size:10px;color:rgba(255,255,255,0.35);background:none;border:1px solid rgba(255,255,255,0.15);border-radius:4px;padding:1px 8px;cursor:pointer;margin-left:6px;transition:color .15s,border-color .15s" onmouseover="this.style.color='rgba(255,255,255,0.65)';this.style.borderColor='rgba(255,255,255,0.3)'" onmouseout="this.style.color='rgba(255,255,255,0.35)';this.style.borderColor='rgba(255,255,255,0.15)'">Glossaire</button>`;
  iz.classList.add('hidden');
  document.getElementById('onboardingBlock')?.classList.add('hidden');
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
  if (finalData.length > 0) {
    const btn = document.getElementById('importZoneCancelBtn');
    if (btn) { btn.classList.remove('hidden'); btn.style.display = 'flex'; }
  }
}

// ── Tab navigation ────────────────────────────────────────────
function switchTab(id) {
  window.scrollTo(0, 0);
  document.querySelectorAll('.tab-content').forEach(e => e.classList.add('hidden'));
  document.querySelectorAll('.tab-btn').forEach(b => { b.classList.remove('border-blue-500', 'border-red-500', 'border-cyan-500', 'border-indigo-500', 'border-violet-500', 'border-orange-500', 'active'); b.classList.add('border-transparent'); });
  const tab = document.getElementById('tab' + id.charAt(0).toUpperCase() + id.slice(1)); if (tab) tab.classList.remove('hidden');
  const btn = document.querySelector(`[data-tab="${id}"]`);
  if (btn) {
    btn.classList.remove('border-transparent');
    if (id === 'action') btn.classList.add('border-red-500', 'active');
    else if (id === 'bench') btn.classList.add('border-cyan-500', 'active');
    else if (id === 'territoire') { btn.classList.add('border-violet-500', 'active'); if (chalandiseReady || territoireReady) renderTerritoireTab(); }
    else if (id === 'abc') btn.classList.add('border-indigo-500', 'active');
    else if (id === 'promo') btn.classList.add('border-orange-500', 'active');
    else btn.classList.add('border-blue-500', 'active');
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
function openFilterDrawer() {
  const panel = document.getElementById('filterPanel');
  const overlay = document.getElementById('filterOverlay');
  if (panel) panel.classList.add('drawer-open');
  if (overlay) overlay.classList.add('active');
}

function closeFilterDrawer() {
  const panel = document.getElementById('filterPanel');
  const overlay = document.getElementById('filterOverlay');
  if (panel) panel.classList.remove('drawer-open');
  if (overlay) overlay.classList.remove('active');
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
  document.getElementById('activeCockpitLabel').textContent = { ruptures: '🚨 Ruptures', fantomes: '👻 Articles sans emplacement', anomalies: '⚠️ Anomalies', saso: '📦 SASO', dormants: '💤 Dormants', fins: '📉 Fins de série', top20: '🏆 Top 20 fréquence', nouveautes: '✨ Nouveautés', colisrayon: '📦→🏪 Colis à stocker', stockneg: '📉 Stock négatif' }[type] || type;
  const nbtn = document.getElementById('btnNouveautesOnly');
  if (nbtn) { const isNouv = type === 'nouveautes'; nbtn.classList.toggle('bg-emerald-500', isNouv); nbtn.classList.toggle('text-white', isNouv); nbtn.classList.toggle('bg-gray-200', !isNouv); nbtn.classList.toggle('text-gray-600', !isNouv); }
  document.getElementById('activeCockpitFilter').classList.remove('hidden');
  currentPage = 0; switchTab('table');
  filteredData = getFilteredData();
  filteredData.sort((a, b) => { let vA = a[sortCol], vB = b[sortCol]; if (typeof vA === 'string') vA = vA.toLowerCase(); if (typeof vB === 'string') vB = vB.toLowerCase(); if (vA < vB) return sortAsc ? -1 : 1; if (vA > vB) return sortAsc ? 1 : -1; return 0; });
  updateActiveAgeIndicator(); renderTable(true);
}

function clearCockpitFilter(silent) {
  document.getElementById('filterCockpit').value = '';
  document.getElementById('activeCockpitFilter').classList.add('hidden');
  const nbtn = document.getElementById('btnNouveautesOnly');
  if (nbtn) { nbtn.classList.remove('bg-emerald-500', 'text-white'); nbtn.classList.add('bg-gray-200', 'text-gray-600'); }
  if (!silent) { currentPage = 0; renderAll(); }
}

function _toggleNouveautesFilter() {
  const fc = document.getElementById('filterCockpit');
  if (fc && fc.value === 'nouveautes') { clearCockpitFilter(); } else { showCockpitInTable('nouveautes'); }
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
  const stockBanner = document.getElementById('stockMonoBanner');
  if (stockBanner) {
    if (storeCountConsomme > 1 && storeCountStock <= 1) {
      stockBanner.textContent = '⚠️ Fichier Stock mono-agence détecté — chargez un export Stock multi-agences pour activer le Réseau et le benchmark.';
      stockBanner.classList.add('active');
    } else {
      stockBanner.classList.remove('active');
    }
  }
  const btn = document.getElementById('navPeriodBtn');
  const navPeriod = document.getElementById('navPeriod');
  if (btn) { btn.textContent = `${fmtDate(consommePeriodMin)} → ${fmtDate(consommePeriodMax)}`; }
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
  const mkLink = (num, txt, tab, col) => `<span style="cursor:pointer;color:rgba(255,255,255,0.55);white-space:nowrap;transition:color .15s" onmouseover="this.style.color='rgba(255,255,255,0.9)'" onmouseout="this.style.color='rgba(255,255,255,0.55)'" onclick="switchTab('${tab}')"><span style="color:${col};font-weight:600">${num}</span> ${txt}</span>`;
  const mkAction = (num, txt, fn, col) => `<span style="cursor:pointer;color:rgba(255,255,255,0.55);white-space:nowrap;transition:color .15s" onmouseover="this.style.color='rgba(255,255,255,0.9)'" onmouseout="this.style.color='rgba(255,255,255,0.55)'" onclick="${fn}"><span style="color:${col};font-weight:600">${num}</span> ${txt}</span>`;
  const sep = `<span style="color:rgba(255,255,255,0.18);margin:0 6px">·</span>`;
  const parts = [];
  parts.push(mkAction(ruptures, `rupture${ruptures !== 1 ? 's' : ''} critiques`, "showCockpitInTable('ruptures')", '#f87171'));
  if (hasTerr) {
    parts.push(mkLink(absentsTerr, `article${absentsTerr !== 1 ? 's' : ''} absents du rayon`, `territoire`, '#fbbf24'));
    parts.push(mkLink(extClients, `client${extClients !== 1 ? 's' : ''} hors agence`, `territoire`, '#fbbf24'));
  } else {
    parts.push(mkAction(dormants, `dormant${dormants !== 1 ? 's' : ''} à traiter`, "showCockpitInTable('dormants')", '#fbbf24'));
  }
  el.innerHTML = `<span style="color:rgba(255,255,255,0.25);margin-right:8px;font-size:10px;letter-spacing:.05em;text-transform:uppercase">Détecté</span>` + parts.join(sep);
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

function openCmdPalette() {
  const pal = document.getElementById('cmdPalette');
  const inp = document.getElementById('cmdInput');
  if (!pal || !inp) return;
  pal.classList.remove('hidden');
  inp.value = '';
  _cmdSelectedIdx = -1;
  _cmdRender('');
  setTimeout(() => inp.focus(), 30);
}

function closeCmdPalette() {
  const pal = document.getElementById('cmdPalette');
  if (pal) pal.classList.add('hidden');
  _cmdSelectedIdx = -1;
  _cmdItems = [];
}

function _cmdRender(q) {
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

function _cmdBuildResults(q) {
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

  // 2. Articles (search finalData)
  if (typeof finalData !== 'undefined' && finalData.length) {
    const terms = ql.split(/\s+/).filter(Boolean);
    const artResults = [];
    for (const r of finalData) {
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

  // 3. Clients (chalandiseData + clientNomLookup fallback)
  const clientResults = [];
  if (typeof chalandiseData !== 'undefined' && chalandiseData.size) {
    for (const [code, info] of chalandiseData) {
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
  if (clientResults.length < 5 && typeof clientNomLookup !== 'undefined') {
    for (const [code, nom] of Object.entries(clientNomLookup)) {
      if (clientResults.length >= 5) break;
      if (typeof chalandiseData !== 'undefined' && chalandiseData.has(code)) continue;
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
  if (typeof finalData !== 'undefined' && finalData.length) {
    const famSet = new Set();
    finalData.forEach(r => { if (r.famille) famSet.add(r.famille); });
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

  // 5. Agences (storesIntersection)
  if (typeof storesIntersection !== 'undefined' && storesIntersection.size > 1) {
    const agResults = [];
    for (const s of storesIntersection) {
      if (agResults.length >= 3) break;
      if (s !== selectedMyStore && s.toLowerCase().includes(ql)) {
        agResults.push({
          icon: '🏪',
          main: s,
          sub: 'Comparer dans Le Réseau',
          badge: s === selectedMyStore ? 'Mon agence' : '',
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

function _cmdClientCA(code) {
  if (typeof ventesClientArticle === 'undefined') return '';
  const arts = ventesClientArticle.get(code);
  if (!arts) return '';
  let total = 0;
  for (const v of arts.values()) total += (v.sumCA || 0);
  return total > 0 ? formatEuro(total).replace('€','').trim() : '';
}

function _cmdEsc(s) {
  return (s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function _cmdExec(idx) {
  const item = _cmdItems[idx];
  if (!item) return;
  closeCmdPalette();
  if (item.fn) item.fn();
}

function _cmdMoveSelection(dir) {
  const items = document.querySelectorAll('#cmdResults .cmd-item');
  if (!items.length) return;
  items.forEach(el => el.classList.remove('cmd-selected'));
  _cmdSelectedIdx = Math.max(0, Math.min(_cmdSelectedIdx + dir, items.length - 1));
  const sel = items[_cmdSelectedIdx];
  if (sel) { sel.classList.add('cmd-selected'); sel.scrollIntoView({ block: 'nearest' }); }
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
