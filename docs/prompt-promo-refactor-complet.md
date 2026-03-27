# Prompt Claude Code CLI — Refactor complet onglet Promo
# Branche : feature/promo-refactor
# Règle absolue : valider visuellement chaque étape avant de passer à la suivante
# Merge vers main uniquement quand toutes les étapes 1-6 sont fonctionnelles

---

## Avant de commencer — vérifications obligatoires

```bash
git checkout -b feature/promo-refactor
```

Puis vérifier dans la console navigateur après chargement des fichiers :
```javascript
console.log('horsMag:', _S.ventesClientHorsMagasin?.size)
console.log('canaux:', [...(_S.cannauxHorsMagasin||[])])
```
Si `horsMag` vaut 0 et `canaux` est vide → le parser ne peuple pas `ventesClientHorsMagasin`.
Dans ce cas, ajouter dans `js/parser.js`, dans la boucle de parsing du Consommé, après le
bloc qui alimente `ventesClientArticle` (canal MAGASIN) :

```javascript
// Canaux hors MAGASIN → ventesClientHorsMagasin
if(canal && canal !== 'MAGASIN') {
  _S.cannauxHorsMagasin.add(canal);
  const clientMap = _S.ventesClientHorsMagasin.get(cc) || new Map();
  const existing = clientMap.get(codeArt) || { ca: 0, qte: 0, canal };
  existing.ca += caLigne;
  existing.qte += qteLigne;
  clientMap.set(codeArt, existing);
  _S.ventesClientHorsMagasin.set(cc, clientMap);
}
```

---

## Étape 1 — Nouveau DOM `#tabPromo` dans index.html

**Commit :** `refactor(promo): step1 - new DOM structure flex-col`

Localise la section `id="tabPromo"` dans index.html. Remplace son contenu intégral par :

```html
<div id="tabPromo" class="hidden tab-content flex flex-col" style="height:calc(100vh - 88px)">

  <!-- ZONE ENTRÉES — fixe, ne scrolle jamais -->
  <div id="promoEntries" class="flex gap-4 p-4 border-b b-default s-card shrink-0">

    <!-- Entrée A : Recherche libre -->
    <div class="flex-1 min-w-0">
      <div class="text-[10px] font-bold t-tertiary uppercase mb-1">
        🔍 Cibler un article ou une famille
      </div>
      <div class="flex gap-2 items-center">
        <div class="relative flex-1">
          <input id="promoSearchInput" type="text"
            placeholder="Bosch, Milwaukee, coupe, 394285…"
            class="w-full text-sm px-3 py-2 rounded-lg border b-default s-card t-primary focus:border-blue-400 outline-none"
            oninput="_onPromoInput()"
            onkeydown="_promoSuggestKeydown(event)"
            onblur="_closePromoSuggest()">
          <div id="promoSuggestBox"
            class="hidden absolute z-50 left-0 right-0 top-full mt-1 s-card border b-default rounded-lg shadow-lg overflow-hidden">
          </div>
        </div>
        <button onclick="runPromoSearch()"
          class="shrink-0 text-sm font-bold py-2 px-4 rounded-lg text-white"
          style="background:var(--c-caution)">
          🎯 Cibler
        </button>
        <button onclick="exportPromoCSV()" id="promoExportBtn"
          class="hidden shrink-0 text-[11px] font-bold py-2 px-3 rounded-lg border b-default t-secondary hover:s-hover">
          📥 CSV
        </button>
        <button onclick="copyPromoClipboard()" id="promoCopyBtn"
          class="hidden shrink-0 text-[11px] font-bold py-2 px-3 rounded-lg border b-default t-secondary hover:s-hover">
          📋 Copier
        </button>
      </div>
      <div id="promoMatchInfo" class="hidden text-[10px] t-tertiary mt-1"></div>
    </div>

    <!-- Séparateur -->
    <div class="w-px bg-slate-200 dark:bg-slate-700 shrink-0 self-stretch"></div>

    <!-- Entrée B : Import opération promo -->
    <div class="flex-1 min-w-0">
      <div class="text-[10px] font-bold t-tertiary uppercase mb-1">
        📋 Opération promo — charger un fichier
      </div>
      <div class="flex gap-2 items-center flex-wrap">
        <label class="shrink-0 text-[11px] font-semibold py-1.5 px-3 rounded-lg border b-default s-card cursor-pointer hover:s-hover t-secondary">
          📎 Choisir fichier
          <input type="file" id="promoImportFile" accept=".xlsx,.csv"
            class="hidden" onchange="_onPromoImportFileChange(this)">
        </label>
        <span id="promoImportFileName" class="text-[10px] t-tertiary truncate max-w-[140px]">
          Aucun fichier
        </span>
        <button onclick="runPromoImport()"
          class="shrink-0 text-sm font-bold py-2 px-4 rounded-lg text-white"
          style="background:var(--p-orange-500)">
          🎯 Analyser
        </button>
        <button onclick="_clearPromoImport()"
          class="shrink-0 text-[11px] t-disabled hover:t-secondary">
          ✕ Effacer
        </button>
        <button onclick="exportPromoImportCSV()" id="promoImportExportBtn"
          class="hidden shrink-0 text-[11px] font-bold py-1.5 px-3 rounded border b-default t-secondary hover:s-hover">
          📥 CSV opération
        </button>
      </div>
      <div id="promoImportOpName" class="text-[10px] t-tertiary mt-1"></div>
    </div>

  </div>

  <!-- FILTRES LATÉRAUX — intégrés en bandeau horizontal sous les entrées -->
  <div id="promoRefinementFilters" class="hidden shrink-0 flex flex-wrap gap-2 px-4 py-2 border-b b-light s-card-alt text-[10px]">
    <select id="promoFilterFamille" onchange="_onPromoFamilleChange()"
      class="py-0.5 px-2 rounded border b-default s-card t-primary text-[10px]">
      <option value="">Toutes familles</option>
    </select>
    <select id="promoFilterSousFamille" onchange="_applyPromoFilters()"
      class="py-0.5 px-2 rounded border b-default s-card t-primary text-[10px]">
      <option value="">Toutes sous-familles</option>
    </select>
    <select id="promoFilterMetier" onchange="_applyPromoFilters()"
      class="py-0.5 px-2 rounded border b-default s-card t-primary text-[10px]">
      <option value="">Tous métiers</option>
    </select>
    <select id="promoFilterCommercial" onchange="_applyPromoFilters()"
      class="py-0.5 px-2 rounded border b-default s-card t-primary text-[10px]">
      <option value="">Tous commerciaux</option>
    </select>
    <select id="promoFilterClassif" onchange="_applyPromoFilters()"
      class="py-0.5 px-2 rounded border b-default s-card t-primary text-[10px]">
      <option value="">Toutes classifications</option>
    </select>
    <select id="promoFilterDept" onchange="_applyPromoFilters()"
      class="py-0.5 px-2 rounded border b-default s-card t-primary text-[10px]">
      <option value="">Tous départements</option>
    </select>
    <input id="promoFilterCAMin" type="number" placeholder="CA min (€)"
      oninput="_applyPromoFilters()"
      class="w-24 py-0.5 px-2 rounded border b-default s-card t-primary text-[10px]">
    <label class="flex items-center gap-1 cursor-pointer">
      <input type="checkbox" id="promoFilterStrat" onchange="_applyPromoFilters()">
      <span>⭐ Stratégiques</span>
    </label>
    <button onclick="_resetPromoFilters()"
      class="text-[10px] t-tertiary hover:t-primary underline">
      Réinitialiser
    </button>
  </div>

  <!-- ZONE CORPS — scroll naturel, tout le contenu ici -->
  <div id="promoBody" class="flex-1 overflow-y-auto p-4 space-y-6 min-h-0">

    <!-- Résultats recherche libre -->
    <div id="promoSearchResults" class="hidden space-y-4">

      <!-- Section A -->
      <div>
        <div class="flex items-center gap-2 mb-2 cursor-pointer"
             onclick="_togglePromoSection('A')">
          <span class="text-sm font-bold">
            🟢 Déjà acheteurs — tous canaux
          </span>
          <span id="promoCountA" class="text-[10px] t-tertiary font-semibold"></span>
          <span id="promoArrowA" class="text-[10px] t-disabled ml-auto">▼</span>
        </div>
        <div id="promoBodyA" class="space-y-1.5"></div>
      </div>

      <!-- Section B -->
      <div>
        <div class="flex items-center gap-2 mb-2 cursor-pointer"
             onclick="_togglePromoSection('B')">
          <span class="text-sm font-bold">
            🔴 Actifs Legallais — jamais en comptoir
          </span>
          <span id="promoCountB" class="text-[10px] t-tertiary font-semibold"></span>
          <span id="promoArrowB" class="text-[10px] t-disabled ml-auto">▼</span>
        </div>
        <div id="promoBodyB" class="space-y-1.5"></div>
      </div>

      <!-- Section C -->
      <div>
        <div class="flex items-center gap-2 mb-2 cursor-pointer"
             onclick="_togglePromoSection('C')">
          <span class="text-sm font-bold">
            🟡 Prospects métier
          </span>
          <span id="promoCountC" class="text-[10px] t-tertiary font-semibold"></span>
          <span id="promoArrowC" class="text-[10px] t-disabled ml-auto">▼</span>
        </div>
        <div id="promoBodyC" class="space-y-1.5"></div>
      </div>

      <!-- Barre export -->
      <div class="flex gap-2 pt-2 border-t b-light">
        <button onclick="exportTourneeCSV()"
          class="text-sm font-bold py-2 px-4 rounded-lg border b-default s-card hover:s-hover t-secondary">
          📄 Fiche tournée CSV
        </button>
      </div>

    </div>

    <!-- Résultats import opération -->
    <div id="promoImportResults" class="hidden space-y-4">

      <div id="promoImportSummaryBar"
        class="text-[11px] t-tertiary px-3 py-2 s-card-alt rounded-lg border b-default">
      </div>

      <!-- Section D -->
      <div>
        <div class="flex items-center gap-2 mb-2 cursor-pointer"
             onclick="_togglePromoImportSection('D')">
          <span class="text-sm font-bold c-ok">
            🟢 Articles vendus au comptoir
          </span>
          <span id="promoImportCountD"
            class="text-[10px] t-tertiary font-semibold"></span>
          <span id="promoImportArrowD"
            class="text-[10px] t-disabled ml-auto">▼</span>
        </div>
        <div id="promoImportBodyD">
          <table class="min-w-full text-[11px]">
            <thead class="s-card-alt">
              <tr>
                <th class="py-1 px-2 text-left font-bold t-tertiary">Code</th>
                <th class="py-1 px-2 text-left font-bold t-tertiary">Libellé</th>
                <th class="py-1 px-2 text-center font-bold t-tertiary">Qté</th>
                <th class="py-1 px-2 text-right font-bold t-tertiary">CA Magasin</th>
                <th class="py-1 px-2 text-center font-bold t-tertiary">Clients</th>
                <th class="py-1 px-2 text-center font-bold t-tertiary">Stock</th>
              </tr>
            </thead>
            <tbody id="promoImportTableD"></tbody>
          </table>
        </div>
      </div>

      <!-- Section E -->
      <div>
        <div class="flex items-center gap-2 mb-2 cursor-pointer"
             onclick="_togglePromoImportSection('E')">
          <span class="text-sm font-bold c-danger">
            🔴 Articles non vendus
          </span>
          <span id="promoImportCountE"
            class="text-[10px] t-tertiary font-semibold"></span>
          <span id="promoImportArrowE"
            class="text-[10px] t-disabled ml-auto">▼</span>
        </div>
        <div id="promoImportBodyE">
          <table class="min-w-full text-[11px]">
            <thead class="s-card-alt">
              <tr>
                <th class="py-1 px-2 text-left font-bold t-tertiary">Code</th>
                <th class="py-1 px-2 text-left font-bold t-tertiary">Libellé</th>
                <th class="py-1 px-2 text-center font-bold t-tertiary">Rayon</th>
                <th class="py-1 px-2 text-center font-bold t-tertiary">Stock</th>
                <th class="py-1 px-2 text-left font-bold t-tertiary">Famille</th>
              </tr>
            </thead>
            <tbody id="promoImportTableE"></tbody>
          </table>
        </div>
      </div>

      <!-- Section F — groupée par commercial -->
      <div>
        <div class="flex items-center gap-2 mb-2">
          <span class="text-sm font-bold c-caution">
            👥 Clients à relancer
          </span>
          <span id="promoImportCountF"
            class="text-[10px] t-tertiary font-semibold"></span>
        </div>
        <div id="promoImportBodyF" class="space-y-3"></div>
      </div>

      <!-- Action appels -->
      <div id="promoImportActionBtn" class="hidden"></div>

    </div>

  </div><!-- fin promoBody -->

</div><!-- fin tabPromo -->
```

Ajouter dans le `<style>` de index.html :

```css
/* Promo refactor — accordion client */
.promo-client-accordion { display: none; }
.promo-client-accordion.open { display: block; }
.promo-acc-tab {
  font-size: 11px; font-weight: 600;
  padding: 3px 10px; border-radius: 6px;
  border: 1px solid transparent;
  color: var(--t-tertiary); cursor: pointer;
  background: none;
}
.promo-acc-tab.active {
  background: var(--i-info-bg);
  color: var(--c-action);
  border-color: var(--p-blue-300);
}
```

**Validation étape 1 :** ouvrir l'onglet Promo, vérifier que :
- Les deux zones (recherche + import) sont côte à côte et ne scrollent pas
- Le corps est vide (normal — pas encore de rendering)
- Pas d'erreur console
- En réduisant la fenêtre, les zones se compriment correctement

---

## Étape 2 — `_renderSearchResults()` + `_renderClientCard()` dans promo.js

**Commit :** `refactor(promo): step2 - search results rendering`

Dans `js/promo.js`, remplacer `_renderPromoResults()` par les fonctions suivantes.
Conserver `runPromoSearch()` INTÉGRALEMENT — changer uniquement son dernier appel :

```javascript
// Dans runPromoSearch(), remplacer l'appel final :
// AVANT :
_populatePromoFilterDropdowns();
_renderPromoResults();
const btnAction = document.getElementById('promoModeAction');
if(btnAction){ ... }

// APRÈS :
_promoSearchResult = { matchedCodes, sectionA, sectionB,
                       sectionC: sC.slice(0,50), sectionCTotal: sC.length,
                       terms, matchedFamilles };
_populatePromoFilterDropdowns();
_renderSearchResults();
```

Déclarer en haut de promo.js (remplace `_promoLastResult`) :
```javascript
let _promoSearchResult = null;   // résultat recherche libre
let _promoImportResult = null;   // résultat import opération (déjà existant)
```

Nouvelles fonctions de rendering :

```javascript
// ── Rendering recherche libre ──────────────────────────────────────────────

function _renderSearchResults() {
  const r = _promoSearchResult; if(!r) return;

  const fmtD = d => {
    if(!d) return '—';
    try { return d.toLocaleDateString('fr-FR',{day:'2-digit',month:'2-digit',year:'2-digit'}); }
    catch { return '—'; }
  };

  // Lire les filtres actifs
  const fFamille    = document.getElementById('promoFilterFamille')?.value    || '';
  const fSousFam    = document.getElementById('promoFilterSousFamille')?.value || '';
  const fMetier     = document.getElementById('promoFilterMetier')?.value     || '';
  const fComm       = document.getElementById('promoFilterCommercial')?.value || '';
  const fClassif    = document.getElementById('promoFilterClassif')?.value    || '';
  const fCAMin      = parseFloat(document.getElementById('promoFilterCAMin')?.value) || 0;
  const fDept       = document.getElementById('promoFilterDept')?.value       || '';
  const fStrat      = document.getElementById('promoFilterStrat')?.checked    || false;

  const passBase = (c, caField) => {
    if(fMetier  && c.metier       !== fMetier)  return false;
    if(fComm    && c.commercial   !== fComm)    return false;
    if(fClassif && c.classification !== fClassif) return false;
    if(fCAMin > 0 && (c[caField]||0) < fCAMin) return false;
    if(fDept) {
      const cp = (_S.chalandiseData.get(c.cc)?.cp||'').replace(/\s/g,'').slice(0,2);
      if(cp !== fDept) return false;
    }
    if(fStrat) {
      const m = (c.metier||'').toLowerCase();
      if(!METIERS_STRATEGIQUES.some(s => m.includes(s))) return false;
    }
    return true;
  };

  const sA = r.sectionA.filter(c => passBase(c, 'ca'));
  const sB = r.sectionB.filter(c => passBase(c, 'ca2025'));
  const sC = r.sectionC.filter(c => passBase(c, 'ca2025'));

  // Section A
  document.getElementById('promoCountA').textContent =
    sA.length + (sA.length < r.sectionA.length ? ' / ' + r.sectionA.length : '');
  document.getElementById('promoBodyA').innerHTML =
    sA.length
      ? sA.slice(0,200).map(c => _renderClientCard(c, 'A', fmtD)).join('')
      : '<p class="text-[11px] t-disabled py-2 px-3">Aucun acheteur identifié.</p>';

  // Section B
  document.getElementById('promoCountB').textContent =
    sB.length + (sB.length < r.sectionB.length ? ' / ' + r.sectionB.length : '');
  document.getElementById('promoBodyB').innerHTML =
    sB.length
      ? sB.slice(0,200).map(c => _renderClientCard(c, 'B', fmtD)).join('')
      : '<p class="text-[11px] t-disabled py-2 px-3">' +
        (_S.territoireReady ? 'Aucun acheteur hors PDV identifié.'
                            : 'Chargez le fichier Terrain pour activer cette vue.') +
        '</p>';

  // Section C
  document.getElementById('promoCountC').textContent =
    sC.length + (r.sectionCTotal > 50 ? ' / ' + r.sectionCTotal : '');
  document.getElementById('promoBodyC').innerHTML =
    sC.length
      ? sC.slice(0,200).map(c => _renderClientCard(c, 'C', fmtD)).join('')
      : '<p class="text-[11px] t-disabled py-2 px-3">' +
        (_S.chalandiseReady ? 'Aucun prospect dans les métiers cibles.'
                            : 'Chargez la Chalandise pour activer cette vue.') +
        '</p>';

  document.getElementById('promoSearchResults').classList.remove('hidden');
  document.getElementById('promoExportBtn').classList.remove('hidden');
  document.getElementById('promoCopyBtn').classList.remove('hidden');

  // Afficher filtres si résultats
  const rf = document.getElementById('promoRefinementFilters');
  if(rf) rf.classList.remove('hidden');
}

function _renderClientCard(c, section, fmtD) {
  const canalBadge = !c.canal || c.canal === 'PDV' ? ''
    : c.canal === 'MIXTE'
      ? '<span class="inline-flex items-center text-[8px] bg-purple-100 text-purple-700 rounded px-1 ml-1">🌐 Multi</span>'
      : `<span class="inline-flex items-center text-[8px] bg-blue-100 text-blue-700 rounded px-1 ml-1">🌐 ${c.canal}</span>`;

  const inChal = _S.chalandiseReady && _S.chalandiseData.has(c.cc);
  const horsZone = !inChal
    ? '<span class="text-[8px] t-disabled border b-default rounded px-1 ml-1">hors zone</span>'
    : '';

  const caValue = section === 'A' ? c.ca : c.ca2025 || c.terrCA || 0;
  const caColor = section === 'A' ? 'c-ok' : section === 'B' ? 'c-danger' : 'c-caution';
  const caLabel = caValue > 0 ? formatEuro(caValue) : '—';

  const lastDateStr = section === 'A' ? fmtD(c.lastDate) : '';

  return `
    <div class="promo-client-card border b-default rounded-lg s-card overflow-hidden">
      <div class="flex items-center gap-3 px-3 py-2 cursor-pointer hover:s-hover transition-colors"
           onclick="_togglePromoClientRow('${c.cc}')">
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-1 flex-wrap leading-tight">
            <span class="font-semibold text-sm t-primary">${c.nom}</span>
            ${_spcBadge(c.spc)}${canalBadge}${horsZone}
          </div>
          <div class="text-[10px] t-tertiary mt-0.5">
            ${c.metier||'—'} · ${c.commercial||'—'}
          </div>
        </div>
        <div class="text-right shrink-0">
          <span class="font-bold text-sm ${caColor}">${caLabel}</span>
          ${lastDateStr ? `<div class="text-[9px] t-disabled">${lastDateStr}</div>` : ''}
        </div>
        <span class="text-[10px] t-disabled ml-1 shrink-0 transition-transform"
              id="promoChevron_${c.cc}">▶</span>
      </div>
      <div id="promoAcc_${c.cc}" class="promo-client-accordion"></div>
    </div>`;
}
```

Remplacer `_applyPromoFilters` :
```javascript
function _applyPromoFilters() { _renderSearchResults(); }
```

**Validation étape 2 :** taper "Bosch" → Cibler → vérifier que :
- Section A affiche les clients sous forme de cards (sans accordion ouvert)
- Section B et C s'affichent
- Les filtres fonctionnent
- Pas d'erreur console

---

## Étape 3 — Accordion inline dans promo.js

**Commit :** `refactor(promo): step3 - inline accordion pitch + achats`

Ajouter dans `js/promo.js` :

```javascript
// ── Accordion client inline ────────────────────────────────────────────────

let _promoOpenCc = null; // cc de l'accordion actuellement ouvert

function _togglePromoClientRow(cc) {
  // Fermer le précédent
  if(_promoOpenCc && _promoOpenCc !== cc) {
    const prev = document.getElementById(`promoAcc_${_promoOpenCc}`);
    const prevChev = document.getElementById(`promoChevron_${_promoOpenCc}`);
    if(prev) { prev.classList.remove('open'); prev.innerHTML = ''; }
    if(prevChev) prevChev.style.transform = '';
  }

  const panel = document.getElementById(`promoAcc_${cc}`);
  const chev  = document.getElementById(`promoChevron_${cc}`);
  if(!panel) return;

  // Toggle : referme si même client
  if(_promoOpenCc === cc && panel.classList.contains('open')) {
    panel.classList.remove('open');
    panel.innerHTML = '';
    if(chev) chev.style.transform = '';
    _promoOpenCc = null;
    return;
  }

  // Ouvrir
  _promoOpenCc = cc;
  panel.classList.add('open');
  if(chev) chev.style.transform = 'rotate(90deg)';

  const pitchHTML  = _buildPitchHTML(cc);
  const achatsHTML = _buildAchatsHTML(cc);

  panel.innerHTML = `
    <div class="border-t b-default" style="background:var(--s-card-alt)">
      <div class="flex gap-1 px-3 py-1.5 border-b b-light">
        <button class="promo-acc-tab active"
                onclick="_switchPromoTab(this,'pitch','${cc}')">
          🎯 Ce que je propose
        </button>
        <button class="promo-acc-tab"
                onclick="_switchPromoTab(this,'achats','${cc}')">
          📋 Ses achats
        </button>
      </div>
      <div id="promoAccPitch_${cc}"  class="p-3 space-y-1">${pitchHTML}</div>
      <div id="promoAccAchats_${cc}" class="p-3 hidden">${achatsHTML}</div>
    </div>`;
}

function _switchPromoTab(btn, tab, cc) {
  const pitchEl  = document.getElementById(`promoAccPitch_${cc}`);
  const achatsEl = document.getElementById(`promoAccAchats_${cc}`);
  const tabs = btn.parentElement.querySelectorAll('.promo-acc-tab');
  tabs.forEach(t => t.classList.remove('active'));
  btn.classList.add('active');
  if(tab === 'pitch') {
    pitchEl?.classList.remove('hidden');
    achatsEl?.classList.add('hidden');
  } else {
    pitchEl?.classList.add('hidden');
    achatsEl?.classList.remove('hidden');
  }
}

function _buildPitchHTML(cc) {
  // Source : recherche libre OU import opération
  const matchedCodes = _promoSearchResult?.matchedCodes
                    || _promoImportResult?.promoCodes
                    || new Set();
  if(!matchedCodes.size) return '<p class="t-disabled text-[11px] py-1">Aucune recherche active.</p>';

  // Exclure tous canaux (fix omnicanal)
  const artMap      = _S.ventesClientArticle.get(cc)        || new Map();
  const terrCodes   = new Set((_S.territoireLines||[]).filter(l=>l.clientCode===cc).map(l=>l.code));
  const horsCodes   = new Set((_S.ventesClientHorsMagasin?.get(cc)||new Map()).keys());

  const candidates = [...matchedCodes].filter(code =>
    !artMap.has(code) && !terrCodes.has(code) && !horsCodes.has(code)
  );

  const myStore  = _S.ventesParMagasin[_S.selectedMyStore] || {};
  const isPepite = new Set((_S.benchLists?.pepitesOther||[]).map(a=>a.code));

  candidates.sort((a,b) => {
    const pa = isPepite.has(a)?1:0, pb = isPepite.has(b)?1:0;
    if(pa !== pb) return pb - pa;
    return (myStore[b]?.countBL||0) - (myStore[a]?.countBL||0);
  });

  const enStock   = candidates.filter(c => (_S.finalData.find(d=>d.code===c)?.stockActuel||0) > 0);
  const enRupture = candidates.filter(c => {
    const ref = _S.finalData.find(d=>d.code===c);
    return ref ? ref.stockActuel <= 0 : false;
  });
  const pitch = [...enStock.slice(0,5), ...enRupture.slice(0,2)];

  if(!pitch.length) return '<p class="t-disabled text-[11px] py-1">✅ Client achète déjà tous les articles de la sélection.</p>';

  return pitch.map(code => {
    const ref   = _S.finalData.find(d=>d.code===code);
    const lib   = _S.libelleLookup[code] || ref?.libelle || code;
    const stock = ref?.stockActuel ?? null;
    const stockBadge = stock === null
      ? '<span class="t-disabled text-[9px]">Non réf.</span>'
      : stock > 0
        ? `<span class="c-ok text-[9px] font-bold">${stock} en stock</span>`
        : '<span class="c-danger text-[9px] font-bold">⚠️ Rupture</span>';
    const pepBadge = isPepite.has(code)
      ? '<span class="text-[8px] bg-amber-100 text-amber-700 rounded px-1 ml-1">⭐ Réseau</span>'
      : '';
    return `<div class="flex items-center gap-2 py-1 px-2 s-card rounded border b-light text-[11px]">
      <span class="font-mono t-disabled w-14 shrink-0">${code}</span>
      <span class="flex-1 truncate">${lib}${pepBadge}</span>
      ${stockBadge}
    </div>`;
  }).join('');
}

function _buildAchatsHTML(cc) {
  const artData = _S.ventesClientArticle.get(cc);
  if(!artData?.size) return '<p class="t-disabled text-[11px] py-1">Aucune donnée comptoir.</p>';

  const matchedCodes = _promoSearchResult?.matchedCodes;
  const rows = [...artData.entries()]
    .filter(([code]) => !matchedCodes || matchedCodes.has(code))
    .sort((a,b) => (b[1].sumCA||0) - (a[1].sumCA||0))
    .slice(0, 10);

  if(!rows.length) return '<p class="t-disabled text-[11px] py-1">Aucun achat sur cette sélection.</p>';

  return `<table class="min-w-full text-[10px]">
    <thead><tr class="t-tertiary font-bold border-b b-light">
      <th class="text-left py-0.5 px-1">Code</th>
      <th class="text-left py-0.5 px-1">Libellé</th>
      <th class="text-center py-0.5 px-1">Qté</th>
      <th class="text-right py-0.5 px-1">CA</th>
    </tr></thead>
    <tbody>${rows.map(([code,d]) => {
      const lib = _S.libelleLookup[code] || code;
      return `<tr class="border-t b-light">
        <td class="font-mono t-disabled py-0.5 px-1">${code}</td>
        <td class="py-0.5 px-1 t-primary">${lib}</td>
        <td class="text-center t-tertiary py-0.5 px-1">${d.countBL||'—'}</td>
        <td class="text-right font-bold c-ok py-0.5 px-1">${d.sumCA>0?formatEuro(d.sumCA):'—'}</td>
      </tr>`;
    }).join('')}</tbody>
  </table>`;
}
```

Supprimer `_showActionArticles` — remplacée par `_buildPitchHTML`.
Supprimer `_togglePromoClientArts` — remplacée par `_togglePromoClientRow`.

**Validation étape 3 :** cliquer sur un client → vérifier que :
- L'accordion s'ouvre sous la ligne avec les deux tabs
- "Ce que je propose" affiche 3-7 articles avec état stock
- "Ses achats" affiche l'historique
- Un second clic referme
- Cliquer un autre client ferme le précédent

---

## Étape 4 — `_renderImportResults()` avec groupement commercial dans promo.js

**Commit :** `refactor(promo): step4 - import results with commercial grouping`

Remplacer `_renderPromoImportResults()` par :

```javascript
function _renderPromoImportResults() {
  const r = _promoImportResult; if(!r) return;

  const sold    = r.sectionD.length;
  const unsold  = r.sectionE.length;
  const retarget = r.sectionF.length;
  const totalCA = r.sectionD.reduce((s,x)=>s+x.caTotal,0);

  // Summary bar
  const sumEl = document.getElementById('promoImportSummaryBar');
  if(sumEl) sumEl.innerHTML =
    `<strong>${r.promoCodes.size}</strong> articles · ` +
    `<span class="c-ok">${sold} vendus — ${formatEuro(totalCA)}</span> · ` +
    `<span class="c-danger">${unsold} non vendus</span> · ` +
    `<span class="c-caution">${retarget} à relancer</span>` +
    (r.opName ? ` · <em>${r.opName}</em>` : '');

  // Section D
  document.getElementById('promoImportCountD').textContent = sold;
  document.getElementById('promoImportTableD').innerHTML = r.sectionD.slice(0,200).map(x => {
    const stockCell = x.stock === null
      ? '<span class="t-disabled">Non réf.</span>'
      : x.stock > 0 ? `<span class="c-ok font-bold">${x.stock}</span>`
      : '<span class="c-danger">0</span>';
    return `<tr class="border-t b-light hover:i-ok-bg">
      <td class="py-1 px-2 font-mono t-disabled">${x.code}</td>
      <td class="py-1 px-2 font-semibold truncate max-w-[180px]">${x.lib}</td>
      <td class="py-1 px-2 text-center">${Math.round(x.qtyTotal)}</td>
      <td class="py-1 px-2 text-right font-bold c-ok">${x.caTotal>0?formatEuro(x.caTotal):'—'}</td>
      <td class="py-1 px-2 text-center">${x.nbClients}</td>
      <td class="py-1 px-2 text-center">${stockCell}</td>
    </tr>`;
  }).join('') || '<tr><td colspan="6" class="py-3 text-center t-disabled">Aucun article vendu</td></tr>';

  // Section E
  document.getElementById('promoImportCountE').textContent = unsold;
  document.getElementById('promoImportTableE').innerHTML = r.sectionE.slice(0,200).map(x =>
    `<tr class="border-t border-red-50 hover:i-danger-bg">
      <td class="py-1 px-2 font-mono t-disabled">${x.code}</td>
      <td class="py-1 px-2 font-semibold truncate max-w-[180px]">${x.lib}</td>
      <td class="py-1 px-2 text-center text-xs">${x.rayonStatus}</td>
      <td class="py-1 px-2 text-center">${x.stock===null?'—':x.stock}</td>
      <td class="py-1 px-2 t-tertiary text-[10px]">${x.famille||'—'}</td>
    </tr>`
  ).join('') || '<tr><td colspan="5" class="py-3 text-center c-ok">✅ Tous les articles ont été vendus</td></tr>';

  // Section F — groupée par commercial
  document.getElementById('promoImportCountF').textContent = retarget;
  const byComm = new Map();
  for(const c of r.sectionF) {
    const comm = c.commercial || '—';
    if(!byComm.has(comm)) byComm.set(comm, []);
    byComm.get(comm).push(c);
  }
  document.getElementById('promoImportBodyF').innerHTML = [...byComm.entries()]
    .sort((a,b) => b[1].length - a[1].length)
    .map(([comm, clients]) => `
      <div class="border b-default rounded-lg overflow-hidden">
        <div class="flex items-center justify-between px-3 py-2 s-card-alt border-b b-light">
          <span class="font-semibold text-sm">${comm}</span>
          <div class="flex items-center gap-2">
            <span class="text-[10px] t-tertiary">${clients.length} client${clients.length>1?'s':''}</span>
            <button onclick="_exportCommercialCSV('${comm.replace(/'/g,"\\'")}')"
              class="text-[10px] font-bold c-action border b-default rounded px-2 py-0.5 hover:i-info-bg">
              📥 Sa liste
            </button>
          </div>
        </div>
        <table class="min-w-full text-[10px]">
          <tbody>${clients.map(c => `
            <tr class="border-t b-light hover:i-caution-bg">
              <td class="py-1 px-2 font-mono t-disabled">${c.cc}</td>
              <td class="py-1 px-2 font-semibold">${c.nom}</td>
              <td class="py-1 px-2 t-tertiary">${c.metier||'—'}</td>
              <td class="py-1 px-2 text-right font-bold c-caution">${c.famCA>0?formatEuro(c.famCA):'—'}</td>
              <td class="py-1 px-2 t-disabled text-[9px]">${c.raison||''}</td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>`)
    .join('') || '<p class="text-[11px] t-disabled py-2">Aucun client à relancer.</p>';

  // Bouton préparer les appels — redirige vers accordion Section A si recherche active
  const btnCont = document.getElementById('promoImportActionBtn');
  if(btnCont && retarget > 0) {
    btnCont.innerHTML = `
      <div class="flex items-center justify-between pt-3 border-t b-light">
        <p class="text-[11px] t-tertiary">${retarget} clients identifiés</p>
        <button onclick="_activatePromoImportAction()"
          class="text-sm font-bold py-2 px-4 rounded-lg text-white"
          style="background:var(--p-orange-500)">
          ⚡ Préparer les appels →
        </button>
      </div>`;
    btnCont.classList.remove('hidden');
  }

  document.getElementById('promoImportResults').classList.remove('hidden');
  document.getElementById('promoImportExportBtn').classList.remove('hidden');
}

function _exportCommercialCSV(commercial) {
  const r = _promoImportResult; if(!r) return;
  const clients = r.sectionF.filter(c => (c.commercial||'—') === commercial);
  const SEP = ';';
  const lines = [
    `PRISME — Opération${r.opName?' '+r.opName:''} — ${commercial}`,
    ['Code','Nom','Métier','CA famille','Raison'].join(SEP),
    ...clients.map(c => [
      c.cc, `"${c.nom}"`, `"${c.metier}"`,
      c.famCA.toFixed(2).replace('.',','), `"${c.raison||''}"`
    ].join(SEP))
  ];
  const blob = new Blob(['\uFEFF'+lines.join('\n')], {type:'text/csv;charset=utf-8;'});
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `PRISME_${r.opName||'Promo'}_${commercial.replace(/[^a-z0-9]/gi,'_')}.csv`;
  document.body.appendChild(link); link.click();
  document.body.removeChild(link); URL.revokeObjectURL(link.href);
  showToast(`📥 ${clients.length} clients exportés — ${commercial}`, 'success');
}
```

Dans `runPromoImport()`, remplacer l'appel final :
```javascript
// AVANT : _renderPromoImportResults();
// APRÈS :
_promoImportResult = { opName, promoCodes, sectionD, sectionE, sectionF };
_renderPromoImportResults();
```

**Validation étape 4 :** charger un CSV opération promo → vérifier :
- Sections D/E/F s'affichent correctement
- Section F groupée par commercial avec bouton "Sa liste"
- Bouton export individuel fonctionne
- Les résultats de recherche (si existants) restent visibles au-dessus

---

## P1 — Fix `exportTourneeCSV` omnicanal

**Commit :** `fix(promo): P1 exportTourneeCSV omnicanal - 3 canaux`

Remplacer `exportTourneeCSV()` :

```javascript
function exportTourneeCSV() {
  // Fonctionne avec les deux contextes
  const sr = _promoSearchResult;
  const ir = _promoImportResult;
  if(!sr && !ir) { showToast('⚠️ Lancez d\'abord une recherche','warning'); return; }

  const matchedCodes = sr?.matchedCodes || ir?.promoCodes || new Set();
  const clients = sr
    ? [...(sr.sectionA||[]), ...(sr.sectionB||[]), ...(sr.sectionC||[])]
    : (ir?.sectionF||[]);

  const ranked = clients.map(c => {
    const info = _S.chalandiseData.get(c.cc) || {};
    const spc  = c.spc || computeSPC(c.cc, info);

    // Fix omnicanal : exclure les 3 canaux
    const artMapMag = _S.ventesClientArticle.get(c.cc)       || new Map();
    const terrCodes = new Set((_S.territoireLines||[]).filter(l=>l.clientCode===c.cc).map(l=>l.code));
    const horsCodes = new Set((_S.ventesClientHorsMagasin?.get(c.cc)||new Map()).keys());

    const toPitch = [];
    for(const code of matchedCodes) {
      if(artMapMag.has(code) || terrCodes.has(code) || horsCodes.has(code)) continue;
      const ref = _S.finalData.find(d=>d.code===code);
      if(ref && ref.stockActuel > 0) toPitch.push({ code, lib: ref.libelle||code });
      if(toPitch.length >= 3) break;
    }

    const lastOrder = _S.clientLastOrder.get(c.cc);
    return {
      cc: c.cc,
      nom: c.nom || info.nom || c.cc,
      spc,
      cp: (info.cp||'').replace(/\s/g,''),
      ville: info.ville||'',
      metier: info.metier||c.metier||'',
      commercial: info.commercial||c.commercial||'',
      lastOrderStr: lastOrder ? lastOrder.toISOString().slice(0,10) : '—',
      toPitch,
      ca: c.ca || c.famCA || 0
    };
  })
  .filter(c => c.spc >= 20)
  .sort((a,b) => a.cp.localeCompare(b.cp) || b.spc - a.spc);

  if(!ranked.length) { showToast('Aucun client qualifié (SPC ≥ 20)','warning'); return; }

  const SEP = ';';
  const label = sr ? (sr.terms||['promo'])[0] : (ir?.opName||'operation');
  const header = ['Code','Nom','SPC','CP','Ville','Métier','Commercial',
                  'Dernière cde','Article 1','Article 2','Article 3','CA'].join(SEP);
  const rows = ranked.map(c => {
    const arts = c.toPitch.map(a => `${a.code} ${a.lib}`);
    return [
      c.cc, `"${c.nom}"`, c.spc, c.cp, `"${c.ville}"`,
      `"${c.metier}"`, `"${c.commercial}"`, c.lastOrderStr,
      `"${arts[0]||''}"`, `"${arts[1]||''}"`, `"${arts[2]||''}"`,
      c.ca > 0 ? Math.round(c.ca) : ''
    ].join(SEP);
  });

  const blob = new Blob(['\uFEFF'+header+'\n'+rows.join('\n')], {type:'text/csv;charset=utf-8;'});
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `PRISME_Tournee_${label}_${new Date().toISOString().slice(0,10)}.csv`;
  document.body.appendChild(link); link.click();
  document.body.removeChild(link); URL.revokeObjectURL(link.href);
  showToast(`📄 Fiche tournée : ${ranked.length} clients`, 'success');
}
```

---

## Étape 6 — Nettoyage final

**Commit :** `refactor(promo): step6 - remove dead code`

**Dans `js/promo.js`, supprimer :**
```javascript
let _promoMode = 'analyse';          // variable de mode
function _setPromoMode(mode) {...}   // 25 lignes
function _lancerPhoning() {...}
function _lancerCiblage() {...}
function _renderPromoActionView() {...}
let _promoLastResult = null;         // remplacé par _promoSearchResult
// Garder _promoImportResult — déjà présent et utilisé
```

**Dans la liste `export` en bas de `promo.js`**, retirer :
`_setPromoMode, exportTourneeCSV (déjà réexportée), _showActionArticles, _lancerPhoning, _lancerCiblage`

Ajouter dans les exports :
`_togglePromoClientRow, _switchPromoTab, _exportCommercialCSV, _renderSearchResults, _renderImportResults`

**Dans `index.html`**, supprimer les éléments DOM devenus orphelins :
- `id="promoModeAnalyse"` et `id="promoModeAction"` (boutons toggle)
- `id="promoActionView"` (conteneur split-screen)
- `id="promoActionClients"` et `id="promoActionArticles"` (colonnes split)
- `id="promoImportZone"` si c'était l'ancien `<details>` accordion
- `id="promoTargetingBlock"` si distinct de `promoSearchResults`
- `id="promoTable[A/B/C]"` — remplacés par `promoBody[A/B/C]`

**Validation finale :**
1. Recherche "Bosch" → sections A/B/C en cards
2. Clic client → accordion pitch + achats
3. Import CSV → sections D/E/F avec groupement commercial
4. Les deux résultats coexistent si les deux entrées ont été utilisées
5. Export fiche tournée CSV → vérifier que les articles web/représentant sont exclus
6. Aucune référence à `_promoMode`, `_promoLastResult`, `_setPromoMode` dans la console
7. Merge vers main

---

## Ce qu'il ne faut PAS modifier

```
runPromoSearch()          → conserver intégralement (matching inchangé)
runPromoImport()          → conserver intégralement (parsing inchangé)
_dejaAcheteur()           → conserver intégralement
_buildPromoSuggestions()  → conserver intégralement
computeSPC()              → ne pas toucher (dans engine.js)
_populatePromoFilterDropdowns() → conserver, juste reconnecter à _renderSearchResults
exportPromoCSV()          → conserver (export ciblage complet)
copyPromoClipboard()      → adapter pour lire _promoSearchResult au lieu de _promoLastResult
```
