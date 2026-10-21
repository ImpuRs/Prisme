// © 2026 Jawad El Barkaoui — Tous droits réservés
// PRISME — pipeline.js
// Moteur principal : chargement des fichiers, worker de parsing, hydratation, post-traitements
// Extrait de main.js (oct. 2026). Les fonctions restent exposées via window.* dans main.js.
// ═══════════════════════════════════════════════════════════════
'use strict';

import { CHUNK_SIZE, NOUVEAUTE_DAYS, HIGH_PRICE, FAM_LETTER_UNIVERS, SQ_RESEAU_FORT_DETENTION, SQ_RESEAU_FORT_CA_AGENCE } from './constants.js';
import { cleanCode, extractClientCode, cleanPrice, parseExcelDate, daysBetween, getVal, extractStoreCode, yieldToMain, _median, _resetColCache, formatLocalYMD, defaultPeriodRange, extractFamCode, famLib, famLabel } from './utils.js';
import { _S, resetAppState, assertPostParseInvariants, invalidateCache } from './state.js';
import { enrichPrixUnitaire, isParentRef, computeABCFMR, calcCouverture, computeClientCrossing, computeReconquestCohort, computeOpportuniteNette, computeAnglesMorts, resetBenchMetierCache, computeOmniScores, applyVerdictOverrides, computeVitesseReseau } from './engine.js';
import { parseChalandise, computeBenchmark, launchClientWorker, _computeChalandiseDistances } from './parser.js';
import { showToast, updateProgress, updatePipeline, showLoading, hideLoading, collapseImportZone, switchTab, populateSelect, renderAll, updatePeriodAlert, renderTabBadges, initDetailsAnimations, buildSqLookup, initColSelector } from './ui.js';
import { prepareSources, getZzat } from './sources.js';
import { applyZzatText } from './scan-export.js';
import { _saveToCache, _restoreExclusions, _saveSessionToIDB, _restoreSessionFromIDB, _checkFilesUnchanged, _saveFileHashes } from './cache.js';
import './sales.js';
import './helpers.js';
import { buildClientStore } from './client-store.js';
import { applyForcageCommercial as _applyForcageCommercial } from './chalandise-store.js';
import { buildAgenceStore } from './agence-store.js';
import { DataStore } from './store.js';
import './diagnostic.js';
import './planRayon.js';
import './arbitrage.js';
import { applyMinMaxServiceLevel, localSalesCount12m, blCount12m } from './minmax.js';
import './clients-decisions.js';
import './animation.js';
import './partie.js';
import './commerce.js';
import { _ASSET_VER_Q, _detectLowMemMode, renderSidebarAgenceSelector } from './main.js';
import { _refilterFromByMonth, buildPeriodFilter } from './periode.js';
import { _scheduleIdleSquelette, renderCurrentTab, setPeriodePreset } from './render-stock.js';

  // ★★★ MOTEUR PRINCIPAL ★★★

  export function _detectStoreColumnIdx(headers){
    if(!headers||!headers.length)return -1;
    return headers.findIndex(k=>{
      const kl=k.toLowerCase().replace(/[\r\n]/g,' ').trim();
      return kl==='code pdv'||kl==='pdv'||kl==='code agence'||kl==='agence'||kl==='code depot'||kl==='dépôt'||kl==='depot';
    });
  }

  // Helper : affiche le sélecteur d'agence et attend le choix (Promise-based)
  export function _showStoreSelector(stores){
    return new Promise(resolve=>{
      const sel=document.getElementById('selectMyStore');
      if(!sel){resolve('');return;}
      sel.innerHTML='<option value="">— Choisir votre agence —</option>'+
        [...stores].sort().map(s=>'<option value="'+s+'">'+s+'</option>').join('');
      sel.value='';
      document.getElementById('storeSelector').classList.remove('hidden');
      hideLoading();
      const handler=()=>{
        const v=sel.value.toUpperCase();
        if(v&&stores.has(v)){
          sel.removeEventListener('change',handler);
          document.getElementById('storeSelector').classList.add('hidden');
          showLoading('Analyse '+v+'…','');
          resolve(v);
        }
      };
      sel.addEventListener('change',handler);
    });
  }

  export async function processData(_storeOverride,_opts={}){
    await prepareSources(); // fichiers gardés : fusion des nouveaux extraits / restitution (sources.js)
    const filesC=document.getElementById('fileConsomme').files,f2=document.getElementById('fileStock').files[0];
    if(!filesC||!filesC.length){showToast('⚠️ Chargez votre fichier Consommé (ventes)','warning');return;}
    if(filesC.length>1){showToast('📊 '+filesC.length+' fichiers consommé — fusion automatique','info',3000);}
    if(f2)_S._stockFileTs=f2.lastModified||null; // date du fichier stock (le Scan s'en sert pour garder un import ZZAT plus récent)
    if(!f2){showToast('ℹ️ Mode commercial — chargez l\'État du Stock pour Pilotage Stock et la Base articles','info',4000);}
    const btn=document.getElementById('btnCalculer');

    // iPhone/Safari : gros fichiers (CSV/XLSX) => pic RAM énorme (ArrayBuffer + decode + structures).
    // On préfère un avertissement + opt-in plutôt qu'un crash du navigateur.
    if(_S.lowMemMode){
      try{
        const totalBytes = Array.from(filesC||[]).reduce((s,f)=>s+(f?.size||0),0) + (f2?.size||0);
        const totalMB = totalBytes / (1024*1024);
        // Seuil "hard stop" : au-delà, Safari iOS tue souvent l'onglet (OOM) pendant arrayBuffer()+XLSX.
        if (totalMB >= 80) {
          showToast(`📱 Mode mobile : ${totalMB.toFixed(1)} Mo — trop volumineux pour Safari iOS. Faites l'analyse sur PC puis "📱 Exporter pour Scan" (scan.html → Import .json).`,'error',8000);
          return;
        }
        if(totalMB >= 25){
          showToast(`📱 Mode mobile : ${totalMB.toFixed(1)} Mo à analyser — risque élevé de crash. Conseil: faites l'analyse sur PC puis "📱 Exporter pour Scan".`,'warning',7000);
          const ok = confirm(`Mode mobile: ${totalMB.toFixed(1)} Mo à analyser.\nSafari iOS peut planter sur ce volume.\n\nOK = continuer quand même\nAnnuler = arrêter`);
          if(!ok) return;
        }
      }catch(_){}
    }

    btn.disabled=true;
    // ── OPT1 : Hash-check IDB — même fichier → skip parse complet ──
    {
      const _hashes = localStorage.getItem('prisme_fileHashes');
      if (_hashes) {
        const _storeBeforeRestore = _S.selectedMyStore;
        const _idbOk = DataStore.finalData.length > 0 || await _restoreSessionFromIDB();
        if (_storeBeforeRestore) _S.selectedMyStore = _storeBeforeRestore;
        // Vérifier si l'agence a changé dans le dropdown
        const _newStore = (document.getElementById('selectMyStore')?.value || '').toUpperCase();
        const _storeChanged = _newStore && _newStore !== _S.selectedMyStore;
        if (_idbOk && DataStore.finalData.length > 0 && !_storeChanged) {
          const _unchanged = !_opts.force && await _checkFilesUnchanged(filesC, f2 || null, document.getElementById('fileChalandise').files[0] || null, null);
          if (_unchanged) {
            // Cache "schema upgrade" : certaines features (clients actifs tous canaux par mois)
            // nécessitent _byMonthClients/_byMonthClientsByCanal. Les vieux caches ont _byMonth
            // mais pas ces sets → refilter période peut perdre des clients (ex: REPRESENTANT-only).
            // Idem pour le contenu des BL (co-achats de la fiche article, oct. 2026) : absent des sessions plus anciennes.
            const _needsUpgrade = !_S.lowMemMode && ((_S._byMonth && (!_S._byMonthClients || !_S._byMonthClientsByCanal || !_S._byMonthClientCAByCanal)) || !(_S.coBL?.length) || (_S.finalData?.length && (!('dateSortie' in _S.finalData[0]) || !_S.finalData.some(r => r._mmRule))));
            if (!_needsUpgrade) {
              showToast('⚡ Fichiers inchangés — session restaurée depuis le cache', 'success', 3000);
              btn.disabled = false;
              hideLoading();
              if (!_S.clientStore?.size) buildClientStore();
              _applyForcageCommercial();
              if (_S.storesIntersection.size > 1 && !_S.agenceStore?.size) buildAgenceStore();
              renderAll();
              buildPeriodFilter();
              collapseImportZone();
              return;
            }
            showToast('Session enregistrée par une version précédente de PRISME : nouvelle lecture des fichiers…', 'info', 6000);
          }
        }
      }
    }
    // H4: reset complet de tous les globals session avant chaque re-upload
    resetAppState();
    // Le reset conserve _S.lowMemMode (flag environnement). Re-détecter au cas où.
    if (!_S.lowMemMode) _S.lowMemMode = _detectLowMemMode();
    const _selStore=document.getElementById('selectMyStore');
    if(_selStore){if(_storeOverride){_selStore.value=_storeOverride;}else{_selStore.innerHTML='<option value="">—</option>';_selStore.value='';}}
    _restoreExclusions();

    // Agence pré-remplie si mémorisée — le Worker validera et demandera si besoin
    let selectedStore=_storeOverride||localStorage.getItem('prisme_selectedStore')||'';

    showLoading('Lecture…','');await yieldToMain();

    // Stocker les File pour refilter période ultérieur (léger, pas de copie buffer)
    _S._fileC = filesC[0];
    _S._filesC = filesC;
    _S._fileS = f2 || null;
    _S._rawDataC = null; _S._rawDataS = [];

    // ── Lancement du worker de parsing (stream ArrayBuffers) ──
    updatePipeline('consomme','active');updatePipeline('stock','active');
    updateProgress(10,100,'Lecture fichiers…');
    let parseResult;
    try{
      parseResult = await launchParseWorkerFromFiles(filesC, f2 || null, {
        selectedStore: selectedStore || '',
        lowMem: !!_S.lowMemMode,
      });
    }catch(error){showToast('❌ Parsing: '+error.message,'error');console.error(error);btn.disabled=false;hideLoading();return;}

    // ── Agence sélectionnée — résolue dans launchParseWorker (message 'stores') ──
    selectedStore = parseResult._resolvedStore || selectedStore;

    // ── Hydrater _S depuis le résultat du worker ──
    _hydrateStateFromParseResult(parseResult, selectedStore);

    _S.selectedMyStore = selectedStore;
    if(selectedStore)localStorage.setItem('prisme_selectedStore',selectedStore);
    if(_selStore&&selectedStore){_selStore.innerHTML='<option value="">—</option>'+[..._S.storesIntersection].sort().map(s=>`<option value="${s}">${s}</option>`).join('');_selStore.value=selectedStore;}
    document.getElementById('storeSelector').classList.add('hidden');

    // ── Suite du pipeline (enrichissement, chalandise, benchmark, render) ──
    // Étapes post-hydratation côté main thread : enrichPrixUnitaire, chalandise, benchmark, render
    await _postParseMain({storeOverride: selectedStore||'', _f1: filesC, _f2: f2||null});
    buildPeriodFilter();
  }

  // ── launchParseWorkerFromFiles — stream File → Worker (faible pic mémoire) ──
  // Sur certaines configs (PC 4Go / iOS), accumuler plusieurs gros ArrayBuffer avant transfert
  // peut faire planter le navigateur. Ici, on envoie les buffers un par un (transferable).
  export async function launchParseWorkerFromFiles(filesC, fileS, opts) {
    const _filesC = Array.from(filesC || []);
    const filenamesC = _filesC.map(f => f.name);
    const worker = new Worker('js/parse-worker.js' + _ASSET_VER_Q);
    const serialStream = !!opts?.lowMem || (function(){
      try{
        const dm = navigator.deviceMemory;
        if (typeof dm === 'number' && dm > 0 && dm <= 4) return true;
      }catch(_){}
      // Heuristique taille : si on poste plusieurs gros buffers sans backpressure,
      // le Worker peut accumuler en queue et exploser la RAM.
      try{
        const totalBytes = _filesC.reduce((s,f)=>s+(f.size||0),0) + (fileS? (fileS.size||0) : 0);
        if (totalBytes >= 64*1024*1024) return true;
      }catch(_){}
      return false;
    })();
    let _pendingAck = null;

    const resultP = new Promise((resolve, reject) => {
      worker.onmessage = async function(ev) {
        const msg = ev.data;
        if (msg.type === 'progress') {
          updateProgress(msg.pct, 100, msg.msg);
        } else if (msg.type === 'consomme_ack' || msg.type === 'stock_ack') {
          if (_pendingAck && _pendingAck.type === msg.type && (_pendingAck.index === undefined || _pendingAck.index === msg.index)) {
            const r = _pendingAck.resolve;
            _pendingAck = null;
            r();
          }
        } else if (msg.type === 'stores') {
          // Le Worker a détecté les agences — sélectionner et répondre
          const storesI = new Set(msg.storesIntersection || []);
          _S.storesIntersection = storesI;
          _S.storeCountConsomme = (msg.storesFoundC || []).length;
          _S.storeCountStock = (msg.storesFoundS || []).length;
          let store = (opts.selectedStore || '').toUpperCase();
          if (storesI.size === 1) {
            store = [...storesI][0];
          } else if (storesI.size > 1 && (!store || !storesI.has(store))) {
            store = await _showStoreSelector(storesI) || '';
          }
          if (store) localStorage.setItem('prisme_selectedStore', store);
          // Mettre à jour le dropdown agence
          const _selStore = document.getElementById('selectMyStore');
          if (_selStore && storesI.size) {
            _selStore.innerHTML = '<option value="">—</option>' + [...storesI].sort().map(s => `<option value="${s}">${s}</option>`).join('');
            if (store) _selStore.value = store;
          }
          document.getElementById('storeSelector')?.classList.add('hidden');
          // Confirmer au Worker — il peut continuer le parse complet
          worker.postMessage({ type: 'continue', selectedStore: store });
        } else if (msg.type === 'done') {
          worker.terminate();
          resolve(msg.payload);
        } else if (msg.type === 'error') {
          if (_pendingAck) {
            const rj = _pendingAck.reject;
            _pendingAck = null;
            rj(new Error(msg.msg));
          }
          worker.terminate();
          reject(new Error(msg.msg));
        }
      };
      worker.onerror = function(err) { worker.terminate(); reject(new Error('ParseWorker: ' + (err.message||'erreur'))); };
    });

    // Init (sans buffers)
    worker.postMessage(Object.assign({ type: 'init', filenamesC: filenamesC }, opts));

    // Envoyer consommé (1 par 1) pour réduire le pic mémoire
    try {
      for (let i = 0; i < _filesC.length; i++) {
        const f = _filesC[i];
        updateProgress(10 + Math.round(6 * (i / Math.max(_filesC.length, 1))), 100, 'Lecture ' + f.name + '…');
        const buf = await f.arrayBuffer();
        worker.postMessage({ type: 'consomme', buf, filename: f.name, index: i, total: _filesC.length }, [buf]);
        if (serialStream) {
          await new Promise((resolve, reject) => { _pendingAck = { type: 'consomme_ack', index: i, resolve, reject }; });
        }
        await yieldToMain();
      }
      if (fileS) {
        updateProgress(16, 100, 'Lecture ' + fileS.name + '…');
        const bufS = await fileS.arrayBuffer();
        worker.postMessage({ type: 'stock', buf: bufS, filename: fileS.name }, [bufS]);
        if (serialStream) {
          await new Promise((resolve, reject) => { _pendingAck = { type: 'stock_ack', resolve, reject }; });
        }
        await yieldToMain();
      }
      updateProgress(20, 100, 'Parsing en cours (Worker)…');
      worker.postMessage({ type: 'start' });
    } catch (e) {
      worker.terminate();
      throw e;
    }

    return await resultP;
  }

  // ── _hydrateStateFromParseResult — reconstruit _S depuis le payload worker ──
  export function _hydrateStateFromParseResult(r, selectedStore) {
    // Objets plain
    _S.articleRaw         = r.articleRaw || {};
    _S.articleDemand      = r.articleDemand || {};
    _S.coBL = r.coBL || []; _S.coBLn = r.coBLn || {}; _S._coIndex = null;
    _S.articleMonthlySales    = r.monthlySales || {};
    _S.seasonalIndexReseau    = r.seasonalIndexReseau || {};
    _S.ventesParAgence   = r.ventesParAgence || {};
    _S.ventesParAgenceByCanal = r.ventesParAgenceByCanal || {};
    _S.clientNomLookup    = r.clientNomLookup || {};
    _S.articleFamille     = r.articleFamille || {};
    _S.articleUnivers     = r.articleUnivers || {};
    _S.libelleLookup      = r.libelleLookup || {};
    _S.canalAgence        = r.canalAgence || {};
    _S._byMonth           = r.byMonth      || null;
    _S._byMonthFull       = r.byMonthFull  || null;
    _S._byMonthCanal      = r.byMonthCanal || null;
    _S._byMonthStoreArtCanal = r.byMonthStoreArtCanal || null;
    // Hydrater byMonthStoreClients (Arrays → Sets)
    if (r.byMonthStoreClients) {
      const _bmsc = {};
      for (const sk in r.byMonthStoreClients) { _bmsc[sk] = {}; for (const mi in r.byMonthStoreClients[sk]) _bmsc[sk][mi] = new Set(r.byMonthStoreClients[sk][mi]); }
      _S._byMonthStoreClients = _bmsc;
    } else { _S._byMonthStoreClients = null; }
    _S._byMonthStoreClientCA = r.byMonthStoreClientCA || null;
    if (r.byMonthClients) {
      const _bmc = {};
      for (const k in r.byMonthClients) _bmc[k] = new Set(r.byMonthClients[k]);
      _S._byMonthClients = _bmc;
    } else { _S._byMonthClients = null; }
    _S._byMonthClientsByCanal = r.byMonthClientsByCanal
      ? Object.fromEntries(Object.entries(r.byMonthClientsByCanal).map(([k, cm]) => {
          const _out = {};
          for (const _c in cm) _out[_c] = new Set(cm[_c]);
          return [k, _out];
        }))
      : null;
    _S._byMonthClientCAByCanal = r.byMonthClientCAByCanal || null;
    _S.finalData          = r.finalData || [];
    _S.abcMatrixData      = r.abcMatrixData || {};
    _S.stockParMagasin    = r.stockParMagasin || {};
    _S.ventesAnalysis     = r.ventesAnalysis || { refParBL:0, famParBL:0, totalBL:0, refActives:0, attractivite:{}, nbPassages:0, txMarge:null, vmc:null };
    _S.globalJoursOuvres  = r.joursOuvres || 250;
    _S.consommeMoisCouverts = r.consommeMoisCouverts || 0;
    _S._hasStock = _S.finalData.length > 0;

    // Reconstruire ventesClientsPerStore (Sets)
    const vcps = r.ventesClientsPerStore || {};
    _S.ventesClientsPerStore = {};
    for (const sk in vcps) { _S.ventesClientsPerStore[sk] = new Set(vcps[sk]); }
    // Reconstruire clientsByStoreUnivers (Sets)
    _S.clientsByStoreUnivers = {};
    for (const sk in (r.clientsByStoreUnivers || {})) {
      _S.clientsByStoreUnivers[sk] = {};
      for (const u in r.clientsByStoreUnivers[sk]) {
        _S.clientsByStoreUnivers[sk][u] = new Set(r.clientsByStoreUnivers[sk][u]);
      }
    }

    // Reconstruire caClientParStore (Maps)
    const ccps = r.caClientParStore || {};
    _S.caClientParStore = {};
    for (const sk in ccps) { _S.caClientParStore[sk] = new Map(ccps[sk]); }
    // Reconstruire commandesPerStoreCanal (Sets)
    const cpsc = r.commandesPerStoreCanal || {};
    _S.commandesPerStoreCanal = {};
    for (const sk in cpsc) {
      _S.commandesPerStoreCanal[sk] = {};
      for (const c in cpsc[sk]) { _S.commandesPerStoreCanal[sk][c] = new Set(cpsc[sk][c]); }
    }

    // blData — worker retourne { codesSize, famillesSize } uniquement (Sets non sérialisables)
    // On recrée une structure allégée compatible avec le reste du code
    _S.blData = {};
    const blDataSer = r.blData || {};
    for (const blk in blDataSer) {
      _S.blData[blk] = { codes: new Set(), familles: new Set() };
      // On ne peut pas reconstruire les sets exacts, mais blConsommeSet est recalculé ci-dessous
    }
    _S.blConsommeSet = new Set(Object.keys(_S.blData));

    // Dates
    _S.consommePeriodMin = r.minDateVente ? new Date(r.minDateVente) : null;
    _S.consommePeriodMax = r.maxDateVente ? new Date(r.maxDateVente) : null;
    _S.consommePeriodMinFull = _S.consommePeriodMin;
    _S.consommePeriodMaxFull = _S.consommePeriodMax;
    // periodFilterStart/End : NE PAS toucher ici — déjà null via resetAppState(),
    // ou déjà set par applyPeriodFilter() avant un refilter.

    // Maps imbriquées
    _S.ventesLocalMagPeriode     = new Map((r.ventesLocalMagPeriode||[]).map(([k,v]) => [k, new Map(v)]));
    _S.ventesLocalMag12MG = new Map((r.ventesLocalMag12MG||[]).map(([k,v]) => [k, new Map(v)]));
    _S.ventesReseauTousCanaux = new Map((r.ventesReseauTousCanaux||[]).map(([k,v]) => [k, new Map(v)]));
    _S.ventesLocalHorsMag = new Map((r.ventesLocalHorsMag||[]).map(([k,v]) => [k, new Map(v)]));
    _S.ventesLocalHorsMagFull = new Map((r.ventesLocalHorsMagFull||[]).map(([k,v]) => [k, new Map(v)]));
    _S.clientLastOrder         = new Map((r.clientLastOrder||[]).map(([k,v]) => [k, typeof v==='number'?new Date(v):v]));
    _S.clientLastOrderAll      = new Map((r.clientLastOrderAll||[]).map(([k,v]) => [k, {date:new Date(v.date),canal:v.canal}]));
    _S.clientLastOrderByCanal  = new Map((r.clientLastOrderByCanal||[]).map(([k,v]) => [k, new Map(v)]));
    _S.clientArticles          = new Map((r.clientArticles||[]).map(([k,v]) => [k, new Set(v)]));
    _S.articleClients          = new Map((r.articleClients||[]).map(([k,v]) => [k, new Set(v)]));
    _S.articleClientsFull      = new Map((r.articleClientsFull||[]).map(([k,v]) => [k, new Set(v)]));
    _S.articleCanalCA          = new Map((r.articleCanalCA||[]).map(([k,v]) => [k, new Map(v)]));
    _S.blCanalMap              = new Map(r.blCanalMap||[]);
    _S.clientsMagasin          = new Set(r.clientsMagasin||[]);
    _S.clientsMagasinFreq      = new Map(r.clientsMagasinFreq||[]);
    _S.cannauxHorsMagasin      = new Set(r.cannauxHorsMagasin||[]);
    _S.blPreleveeSet           = new Set(r.blPreleveeSet||[]);
    _S.enleveSingleBL          = r.enleveSingleBL || {};
    _S.ventesClientAutresAgences = new Map(r.ventesClientAutresAgences||[]);

    // Recalcul seasonalIndex depuis monthlySales (B3)
    _computeSeasonalIndex(_S.articleMonthlySales);

    // storesIntersection (si pas déjà set par processData)
    if (r.storesIntersection && r.storesIntersection.length) {
      _S.storesIntersection = new Set(r.storesIntersection);
    }
    _S.storeCountConsomme = (r.storesFoundC||[]).length;
    _S.storeCountStock    = (r.storesFoundS||[]).length;

    // hasCommandeCol — stocker pour info
    _S._hasCommandeCol = r.hasCommandeCol;

    // selectedMyStore
    _S.selectedMyStore = selectedStore || '';
    if (selectedStore) localStorage.setItem('prisme_selectedStore', selectedStore);
  }

  window._applyForcageCommercial = _applyForcageCommercial;

  // ── Juge de Paix — Vitesse Réseau (fonction partagée) ──────────────────
  // Cascade : Ventes locales > 0 → calcul local (déjà fait en amont)
  //           Ventes locales = 0, réseau > 0 → Vitesse Réseau (Top 3)
  //           Ventes locales = 0, réseau = 0, stocké réseau → médiane ERP
  export function _applyVitesseReseau(){
    // Règles MIN/MAX quand le calcul local donne 0/0 (oct. 2026). Mesure unique : n = ventes au COMPTOIR (BL prélevés)
    // sur les 12 derniers mois complets — les colis (enlevé) partent de la centrale, pas du rayon.
    //   n = 1                        → 1/1 (vendu une fois ici)
    //   n = 0 et EN RAYON (stock > 0) → 0/0 « à sortir », même s'il part en colis (pas de rythme réseau)
    //   n = 0 et ABSENT du rayon     → implantation au rythme du réseau SEULEMENT s'il y a une vraie demande :
    //                                   ≥ 3 colis/an chez toi, ou réseau fort (≥ 60 % des autres agences, ≥ 200 €/an chacune) ;
    //                                   plafonnée à la médiane ERP des autres agences ; sinon 0/0.
    if(!DataStore.finalData.length)return;
    const stores=Object.keys(_S.ventesParAgence||{}).filter(s=>s!==_S.selectedMyStore);
    if(stores.length<2)return;
    const _hasArtDemand=!!Object.keys(_S.articleDemand||{}).length;
    const IMPLANT_COLIS_MIN=3;
    let _applied=0,_unique=0,_rayon=0,_sansDemande=0;
    const reseauFort=(code)=>{ let n=0,ca=0; for(const s of stores){ const d=_S.ventesParAgence[s]?.[code]; if(d&&d.countBL>0){ n++; ca+=d.sumCA||0; } } return n/stores.length>=SQ_RESEAU_FORT_DETENTION && n>0 && ca/n>=SQ_RESEAU_FORT_CA_AGENCE; };
    for(const r of DataStore.finalData){
      if(r.nouveauMin>0||r.nouveauMax>0)continue;
      if(r.isParent||!/^\d{6}$/.test(r.code))continue;
      const _sl=(r.statut||'').toLowerCase();
      if(_sl.includes('fin de série')||_sl.includes('fin de serie')||_sl.includes('fin de stock')||_sl.includes('fin de catalogue'))continue;
      if(['2','3','4'].includes(String(r.statut||'').charAt(0)))continue;
      if(r.isNouveaute)continue;
      const n=_hasArtDemand?localSalesCount12m(r.code):(r.V>0?r.W:0);
      if(n>=1){ r.nouveauMin=1; r.nouveauMax=1; r._venteUnique=true; r._mmRule='vente_unique'; _unique++; continue; }
      if((r.stockActuel||0)>0){ r._mmRule='rayon_sans_vente'; _rayon++; continue; } // reste 0/0 : à sortir
      const colis=blCount12m(r.code);
      const fort=reseauFort(r.code);
      if(colis<IMPLANT_COLIS_MIN&&!fort){ r._mmRule='absent_sans_demande'; _sansDemande++; continue; }
      // Implantation : rythme du réseau (Top 3), sinon médiane ERP ; plafonné à la médiane ERP des autres agences
      const vr=computeVitesseReseau(r.code,r.prixUnitaire||0,r.medMinReseau||0);
      let mi=vr?vr.min:Math.max(Math.round(r.medMinReseau||0),1), ma=vr?vr.max:Math.max(Math.round(r.medMaxReseau||0),mi+1);
      if(!vr&&!(r.medMinReseau>0||r.medMaxReseau>0)){ mi=1; ma=1; } // demande locale en colis sans repère réseau : 1/1
      if(r.medMinReseau>0) mi=Math.min(mi,Math.max(1,Math.round(r.medMinReseau)));
      if(r.medMaxReseau>0) ma=Math.min(ma,Math.max(mi,Math.round(r.medMaxReseau)));
      ma=Math.max(ma,mi);
      r.nouveauMin=mi; r.nouveauMax=ma;
      r._vitesseReseau=true; r._fallbackERP=!vr; r._mmRule=colis>=IMPLANT_COLIS_MIN?'implant_colis':'implant_reseau'; r._implantColis=colis;
      _applied++;
    }
    console.log('[VR] implantations:', _applied, '· vendus 1 fois → 1/1 :', _unique, '· en rayon sans vente comptoir → 0/0 :', _rayon, '· absents sans demande → 0/0 :', _sansDemande);
  }


  // ── _postParseMain — étapes post-hydratation côté main thread ────────────
  // Equivalent à la fin de processDataFromRaw() mais sans re-parser les fichiers.
  export async function _postParseMain(opts) {
    const {storeOverride='', _f1=null, _f2=null} = opts;
    const t0 = performance.now();
    const _perf=[];const _mark=(label)=>{_perf.push({etape:label,ms:Math.round(performance.now()-t0)});};
    const btn = document.getElementById('btnCalculer'); btn.disabled = true;
    try {
      const useMulti = _S.storesIntersection.size > 1 && _S.selectedMyStore;
      const lowMem = !!_S.lowMemMode;

      // ZZAT018 gardé (Base articles › Rafraîchir stock) : il fait foi sur la liste, le stock et le MIN/MAX ERP
      _S._zzatStats = null;
      { const _zz = await getZzat(); if (_zz?.text && DataStore.finalData.length) { _S._zzatStats = applyZzatText(_zz.text); if (_S._zzatStats) console.log('[PRISME] ZZAT018 appliqué :', _S._zzatStats); } }
      // Enrichissement prix unitaire depuis ventes (main thread, accès _S)
      enrichPrixUnitaire();
      _enrichFinalDataWithCA();
      // MIN/MAX « taux de service » (oct. 2026, validé au banc d'essai) — avant Vitesse Réseau et Bouclier
      { const _nMM = applyMinMaxServiceLevel(); if (_nMM) console.log('[MINMAX] taux de service appliqué :', _nMM, 'articles'); }
      if(useMulti) _applyVitesseReseau();
      _mark('Enrichissement prix/CA');

      // Période par défaut : 12 mois glissants complets (INIT ONLY — pas de render ici)
      // C'est le SEUL endroit hors applyPeriodFilter() qui écrit periodFilterStart/End,
      // justifié car les données ne sont pas encore prêtes pour un render complet.
      if (_S._byMonth && !_S.periodFilterStart) {
        const _r = defaultPeriodRange(_S.consommePeriodMaxFull || _S.consommePeriodMax);
        if (_r) { _S.periodFilterStart = _r.start; _S.periodFilterEnd = _r.end; }
      }
      // Initialiser canalAgence depuis byMonthCanal (pleine période ou filtre actif)
      if (_S._byMonth) _refilterFromByMonth();

      // Fix articleFamille depuis stock (stock est master)
      for (const r of DataStore.finalData) { if (r.famille && r.famille !== 'Non Classé') _S.articleFamille[r.code] = r.famille; }
      // Recalcul seasonalIndex après enrichissement articleFamille
      _computeSeasonalIndex(_S.articleMonthlySales);

      // Patch obsKpis.mine depuis canalAgence (si benchmark déjà présent)
      if (_S.periodFilterStart || _S.periodFilterEnd) {
        if (_S.benchLists?.obsKpis) {
          const _ca = Object.values(_S.canalAgence).reduce((t,v)=>t+(v.ca||0),0);
          _S.benchLists.obsKpis.mine = {
            ca: _ca,
            ref: _S.benchLists.obsKpis.mine?.ref||0,
            freq: Object.values(_S.canalAgence).reduce((t,v)=>t+(v.bl||0),0),
            serv: _S.benchLists.obsKpis.mine?.serv||0,
            pdm: _S.benchLists.obsKpis.mine?.pdm||0,
            txMarge: _S.benchLists.obsKpis.mine?.txMarge||0
          };
          invalidateCache('bench');
        }
      }

      updatePipeline('consomme','done');
      updatePipeline('stock','done');

      // Chalandise (si fichier chargé)
      _mark('Avant chalandise');
      console.log('[PERF] avant parsing optionnels — chalFiles=',document.getElementById('fileChalandise').files?.length||0);
      if (!lowMem) {
        {const _chalFiles=document.getElementById('fileChalandise').files;if(_chalFiles?.length&&!_S.chalandiseReady&&!_S._chalandiseLoading){_S._chalandiseLoading=true;try{await parseChalandise(_chalFiles);}finally{_S._chalandiseLoading=false;}}}
      } else {
        const _chalFiles=document.getElementById('fileChalandise').files;
        if (_chalFiles?.length) showToast('📱 Mode mobile: Chalandise ignorée (risque crash mémoire). Faites-le sur PC/Zebra.', 'info', 6000);
      }
      _mark('Après chalandise');
      if(!lowMem && useMulti){updateProgress(92,100,'Benchmark…');await yieldToMain();computeBenchmark();_mark('Benchmark');}

      // ABC/FMR + selects
      if(DataStore.finalData.length>0&&DataStore.finalData.every(r=>r.stockActuel===0)){showToast('⚠️ Attention : toutes les valeurs de stock sont à 0 dans le fichier. Vérifiez votre export.','warning');}
      updateProgress(93,100,'Radar ABC/FMR…');await yieldToMain();
      if (!lowMem) assertPostParseInvariants();
      if(useMulti){updateProgress(94,100,'Verdicts assortiment…');await yieldToMain();try{const _vr=applyVerdictOverrides();console.log('[PRISME] Bouclier Squelette:',_vr);}catch(e){console.error('[PRISME] Bouclier Squelette ERREUR:',e);}_mark('Verdicts');}
      updateProgress(95,100,'Affichage…');await yieldToMain();

      // Repeupler les selects depuis finalData
      const familles=new Set(),sousFamilles=new Set(),emplacements=new Set(),statuts=new Set();
      for(const r of DataStore.finalData){
        if(r.famille&&r.famille!=='Non Classé')familles.add(r.famille);
        if(r.sousFamille)sousFamilles.add(r.sousFamille);
        if(r.emplacement)emplacements.add(r.emplacement);
        if(r.statut)statuts.add(r.statut);
      }
      populateSelect('filterFamille',familles,famLabel);populateSelect('filterSousFamille',sousFamilles);populateSelect('filterEmplacement',emplacements);populateSelect('filterStatut',statuts);
      buildSqLookup();

      const elapsed=((performance.now()-t0)/1000).toFixed(1);
      document.getElementById('navStats').textContent=DataStore.finalData.length.toLocaleString('fr')+' art.';document.getElementById('navStats').classList.remove('hidden');
      document.getElementById('navPerf').textContent=elapsed+'s';document.getElementById('navPerf').classList.remove('hidden');
      const _navSt=document.getElementById('navStore');if(_navSt){_navSt.textContent=_S.selectedMyStore||'';_navSt.classList.toggle('hidden',!_S.selectedMyStore);}
      document.getElementById('navReportingBtn').classList.remove('hidden');
      document.getElementById('globalFilters').classList.remove('hidden');
      document.body.classList.add('pilot-loaded');
      const _terrBtn=document.getElementById('btnTabCommerce');_terrBtn.classList.remove('hidden');
      const _clientsBtn=document.getElementById('btnTabClients');if(_clientsBtn)_clientsBtn.classList.remove('hidden');
      const terrNoC=document.getElementById('terrNoChalandise');if(terrNoC)terrNoC.classList.toggle('hidden',_S.chalandiseReady);

      if (!lowMem) {
        computeClientCrossing();computeReconquestCohort();
        buildClientStore();_applyForcageCommercial();_mark('ClientStore + crossing');
        if(!_S.chalandiseReady)_rebuildCaByArticleCanal();
        // launchClientWorker — toujours lancé (gère chalandise vide en interne)
        // IDB sauvegardée uniquement ici — évite double save avec chalandise partielle
        launchClientWorker().then(async()=>{
          if(_S.chalandiseReady&&DataStore.ventesLocalMagPeriode.size>0){resetBenchMetierCache();computeOpportuniteNette();computeAnglesMorts();computeOmniScores();buildClientStore();_applyForcageCommercial();renderTabBadges();}
          if(_S.selectedMyStore){localStorage.setItem('prisme_selectedStore',_S.selectedMyStore);_saveToCache();await _saveSessionToIDB();const _fc=document.getElementById('fileConsomme').files;const f2h=document.getElementById('fileStock').files[0]||null;const f3h=document.getElementById('fileChalandise').files[0]||null;const f4h=null;if(_fc&&_fc.length)await _saveFileHashes(_fc,f2h,f3h,f4h);}
        }).catch(err=>console.warn('Client worker error:',err));
      } else {
        // Mode mobile: on évite les agrégats clients (gros Map/Set) et on sauvegarde directement pour Scan.
        if(_S.selectedMyStore){
          localStorage.setItem('prisme_selectedStore',_S.selectedMyStore);
          _saveToCache();
          await _saveSessionToIDB();
          const _fc=document.getElementById('fileConsomme').files;
          const f2h=document.getElementById('fileStock').files[0]||null;
          if(_fc&&_fc.length) await _saveFileHashes(_fc,f2h,null,null);
        }
        showToast('📱 Mode mobile: cache Scan prêt (IndexedDB) — ouvrez scan.html', 'success', 5000);
      }
      _S.currentPage=0;
      renderAll();_mark('renderAll');
      initDetailsAnimations();
      initColSelector();
      _syncTabAccess();

      // Auto-YTD si consommé court
      if(_S.consommeMoisCouverts<6&&(_S._globalPeriodePreset||'12M')==='12M'){_S._globalPeriodePreset='YTD';setPeriodePreset('YTD');}


      _mark('Prêt');console.table(_perf);
      updateProgress(100,100,'✅ Prêt !',elapsed+'s');await new Promise(r=>setTimeout(r,400));
      renderSidebarAgenceSelector();
      switchTab('omni');btn.textContent='✅ '+elapsed+'s';btn.classList.replace('s-panel-inner','bg-emerald-600');
      // Pré-calcul squelette en idle — alimente SOCLE badges + 🚨 Capitaines
      _scheduleIdleSquelette();
      const _nbFC=document.getElementById('fileConsomme')?.files?.length||1;
      const _nbF=_nbFC+1+(document.getElementById('fileChalandise').files[0]?1:0);
      collapseImportZone(_nbF,_S.selectedMyStore,DataStore.finalData.length,elapsed);
      const btnR=document.getElementById('btnRecalculer');if(btnR)btnR.classList.remove('hidden');

    }catch(error){if(error.message==='NO_STORE_SELECTED')return;showToast('❌ '+error.message,'error');console.error(error);btn.textContent='❌';btn.classList.replace('s-panel-inner','bg-red-600');}
    finally{btn.disabled=false;btn.classList.remove('loading');hideLoading();}
  }


  // ── Sous-fonctions de processDataFromRaw — refactoring pur, zéro impact comportemental ──
  // Règle : chaque fonction a une seule responsabilité, paramètres explicites, pas de
  // variables locales de processDataFromRaw capturées par closure.

  export function _computeSeasonalIndex(monthlySales) {
    // B3 : agrège monthlySales par famille → coefficients saisonniers
    // Blend local × réseau : poids local = min(1, volumeLocal / 50)
    // Plus l'historique local est riche, plus il pèse. Sinon le réseau stabilise.
    const familyMonthly={};
    const familyVolume={}; // volume total par famille (12 mois)
    for(const[code,months] of Object.entries(monthlySales)){
      const fam=_S.articleFamille[code];if(!fam)continue;
      if(!familyMonthly[fam])familyMonthly[fam]=new Array(12).fill(0);
      for(let m=0;m<12;m++)familyMonthly[fam][m]+=months[m];
    }
    for(const[fam,months] of Object.entries(familyMonthly)){
      familyVolume[fam]=months.reduce((s,v)=>s+v,0);
    }

    // Index local pur
    const localIndex={};
    for(const[fam,months] of Object.entries(familyMonthly)){
      const avg=familyVolume[fam]/12;if(avg<=0)continue;
      localIndex[fam]=months.map(v=>Math.round(v/avg*100)/100);
    }

    // Blend avec réseau
    const reseauIndex=_S.seasonalIndexReseau||{};
    _S.seasonalIndex={};
    const allFams=new Set([...Object.keys(localIndex),...Object.keys(reseauIndex)]);
    for(const fam of allFams){
      const loc=localIndex[fam];
      const res=reseauIndex[fam];
      if(loc&&res){
        // Poids local proportionnel au volume — seuil 50 ventes pour confiance max
        const vol=familyVolume[fam]||0;
        const wLocal=Math.min(1,vol/50);
        const wReseau=1-wLocal;
        _S.seasonalIndex[fam]=loc.map((v,i)=>Math.round((v*wLocal+res[i]*wReseau)*100)/100);
      }else if(loc){
        _S.seasonalIndex[fam]=loc;
      }else if(res){
        _S.seasonalIndex[fam]=res;
      }
    }

_S.articleMonthlySales=monthlySales;
  }

  export function _buildSynthFromRaw(articleRaw) {
    // Transforme articleRaw (brut consommé) en synth (T, V, W, U écrêtés)
    // Pure : aucun effet de bord sur _S.
    const synth={};
    for(const[code,art] of Object.entries(articleRaw)){
      const pNet=art.tpp+art.tpn;const isReg=(art.tpp>0&&pNet<=0);
      let maxP=0,cntP=0,sumP=0;
      if(!isReg){for(const bl of Object.values(art.bls)){if(bl.p>0){if(bl.p>maxP)maxP=bl.p;sumP+=bl.p;cntP++;}}}
      if(!isReg&&sumP>0&&pNet>0&&pNet<sumP*0.5){const r=pNet/sumP;maxP=Math.round(maxP*r);sumP=pNet;}
      synth[code]={maxP,sumP:isReg?0:Math.max(pNet,0),sumE:art.te,cbl:art.cbl,cblP:isReg?0:cntP};
    }
    return synth;
  }

  export function _enrichFinalDataWithCA() {
    // Injecte caAnnuel sur chaque article depuis ventesLocalMag12MG (12 mois glissants, myStore)
    // Pleine période comme PRÉL/ENL/FRÉQ — invariant au filtre période UI
    const _full=_S.ventesLocalMag12MG;
    if(_full?.size){
      const _caByCode=new Map();
      for(const[,artMap] of _full){
        for(const[code,data] of artMap){
          _caByCode.set(code,(_caByCode.get(code)||0)+(data.sumCAPrelevee||0));
        }
      }
      for(const r of DataStore.finalData){r.caAnnuel=Math.round(_caByCode.get(r.code)||0);}
      _enrichPullIndex();
      return;
    }
    // Fallback VPM si ventesLocalMag12MG pas encore peuplé
    const _myStore=_S.selectedMyStore;
    const _vpmStore=_myStore?(_S.ventesParAgence?.[_myStore]||null):null;
    if(_vpmStore){
      for(const r of DataStore.finalData){r.caAnnuel=Math.round(_vpmStore?.[r.code]?.sumCA||0);}
    }
    _enrichPullIndex();
  }

  // Pull Index : nbClients / W — mesure si l'article "s'achète" (pull) ou "se vend" (push)
  export function _enrichPullIndex() {
    const acf = _S.articleClientsFull;
    if (!acf?.size) return;
    for (const r of DataStore.finalData) {
      const nbClients = acf.get(r.code)?.size || 0;
      const w = r.W || 0;
      r.pullIndex = w >= 5 ? Math.round(nbClients / w * 100) : null;
      r.nbClientsPull = nbClients;
    }
  }

  // Grise les onglets selon les fichiers chargés — appelé après chaque chargement complet
  export function _syncTabAccess(){
    const hasStock=!!_S._hasStock;
    // Griser les pills Mon Stock si pas de fichier stock
    ['stock','table'].forEach(tabId=>{
      const pill=document.querySelector(`.supertab-pill[data-subtab="${tabId}"]`);if(!pill)return;
      if(!hasStock){pill.style.opacity='0.45';pill.title="Nécessite le fichier stock";pill.style.pointerEvents='none';}
      else{pill.style.opacity='';pill.title='';pill.style.pointerEvents='';}
    });
    // Labo pill — pas de verrouillage (espace réservé)
  }

  // Univers dominant par client — séparé pour être appelable depuis processDataFromRaw ET _initFromCache
  export function _computeClientDominantUnivers(){
    const m=new Map();
    const au=_S.articleUnivers||{};
    for(const[cc,artMap] of _S.ventesLocalMagPeriode.entries()){
      const sums=Object.create(null);
      let maxU='',maxCA=0;
      for(const[code,v] of artMap.entries()){
        const u=au[code];if(!u)continue;
        const ca=v?.sumCA||0;if(!ca)continue;
        const next=(sums[u]||0)+ca;
        sums[u]=next;
        if(next>maxCA){maxCA=next;maxU=u;}
      }
      if(maxU)m.set(cc,maxU);
    }
    _S._clientDominantUnivers=m;
  }


  // caByArticleCanal — séparé pour être appelable depuis processDataFromRaw ET _initFromCache
  export function _rebuildCaByArticleCanal(){
    const vh=_S.ventesLocalHorsMag;
    const fd=DataStore.finalData;
    if(!vh?.size||!fd?.length)return;

    // O(total edges) au lieu de O(articles × clients)
    const caByCode=new Map();
    const nbClientsByCode=new Map();
    for(const[,artMap] of vh.entries()){
      for(const[code,data] of artMap.entries()){
        let entry=caByCode.get(code);
        if(!entry){entry=Object.create(null);caByCode.set(code,entry);}
        const canal=data?.canal||'';
        if(canal) entry[canal]=(entry[canal]||0)+(data?.sumCA||0);
        nbClientsByCode.set(code,(nbClientsByCode.get(code)||0)+1);
      }
    }
    _S.caByArticleCanal=caByCode;
    for(const r of fd){
      const c=caByCode.get(r.code);
      const web=c?.INTERNET||0,rep=c?.REPRESENTANT||0,dcs=c?.DCS||0;
      r.caWeb=web;r.caRep=rep;r.caDcs=dcs;
      r.caHorsMagasin=web+rep+dcs;
      r.nbClientsWeb=nbClientsByCode.get(r.code)||0;
    }
  }
  // ★★★ LEGACY / REFILTER ONLY ★★★
  // ⚠️  Le parsing initial des fichiers consommé+stock passe par parse-worker.js (Web Worker)
  //     puis _hydrateStateFromParseResult() + _postParseMain().
  //     processDataFromRaw() n'est appelé QUE dans 2 cas :
  //       1. applyPeriodFilter → isRefilter=true (re-calcul depuis _rawDataC en mémoire)
  //       2. _initFromCache → isRefilter=true (restauration IDB au démarrage)
  //     ➜ NE PAS ajouter de nouvelles structures ici sans les ajouter aussi dans parse-worker.js !
  export async function processDataFromRaw(dataC,dataS,opts={}){
    const{isRefilter=false,storeOverride='',_f1=null,_f2=null}=opts;
    if(!isRefilter)console.warn('[PRISME] processDataFromRaw called with isRefilter:false — legacy path?',new Error().stack);
    const _savedStoreBeforeReset=isRefilter?(_S.selectedMyStore||localStorage.getItem('prisme_selectedStore')||''):'';
    if(isRefilter&&_savedStoreBeforeReset)_S.selectedMyStore=_savedStoreBeforeReset;
    const t0=performance.now();const _perf=[];const _mark=(label)=>{_perf.push({etape:label,ms:Math.round(performance.now()-t0)});};
    const btn=document.getElementById('btnCalculer');btn.disabled=true;btn.classList.add('loading');
    _S._parsingInProgress=true; // bloque les renderAll parasites pendant le parsing
    if(isRefilter){showLoading('Recalcul période…','');await yieldToMain();}
    try{
      let headersC=null;
      if(!isRefilter){headersC=(dataC.headers||[]).join(' ').toLowerCase();if(!headersC.includes('article')&&!headersC.includes('code')){showToast('⚠️ Le fichier Ventes ne semble pas contenir de colonne Article/Code.','error');btn.disabled=false;hideLoading();return;}if(dataS&&dataS.length){const headersS=Object.keys(dataS[0]||{}).join(' ').toLowerCase();if(!headersS.includes('article')&&!headersS.includes('code')){showToast('⚠️ Le fichier Stock ne semble pas contenir de colonne Article/Code.','error');btn.disabled=false;hideLoading();return;}}}

      // ── Store detection — skipped for isRefilter (storesIntersection/selectedMyStore unchanged) ──
      _resetColCache();
      let hasMulti=_S.storesIntersection.size>1,useMulti=hasMulti&&_S.selectedMyStore;
      if(!isRefilter){
        const stC=new Set(),stS=new Set();
        const _stIdx=_detectStoreColumnIdx(dataC.headers);
        for(const r of dataC.rows){const c=_stIdx>=0?(r[_stIdx]??'').toString().trim().toUpperCase():'';if(c)stC.add(c);}
        if(dataS&&dataS.length){for(const r of dataS){const c=extractStoreCode(r);if(c)stS.add(c);}_S.storesIntersection=new Set();for(const s of stC){if(stS.has(s))_S.storesIntersection.add(s);}}
        else{_S.storesIntersection=new Set(stC);}
        _S.storeCountConsomme=stC.size;_S.storeCountStock=stS.size;
        const _explicitStore=storeOverride==='*'?'':storeOverride||(document.getElementById('selectMyStore').value||'').toUpperCase();
        _S.selectedMyStore=_explicitStore;
        hasMulti=_S.storesIntersection.size>1;
        document.getElementById('storeSelector').classList.add('hidden');
        if(hasMulti){if(storeOverride==='*'){_S.selectedMyStore='';/* tout sélectionner */}else if(_explicitStore&&_S.storesIntersection.has(_explicitStore)){_S.selectedMyStore=_explicitStore;localStorage.setItem('prisme_selectedStore',_explicitStore);}else{const _selEl=document.getElementById('selectMyStore');if(_selEl){_selEl.innerHTML='<option value="">—</option>'+[..._S.storesIntersection].sort().map(s=>`<option value="${s}">${s}</option>`).join('');_selEl.value='';}document.getElementById('storeSelector').classList.remove('hidden');btn.disabled=false;throw new Error('NO_STORE_SELECTED');}btn.disabled=false;}
        else{if(_S.storesIntersection.size===1)_S.selectedMyStore=[..._S.storesIntersection][0];}
        useMulti=hasMulti&&_S.selectedMyStore;
      }else if(_savedStoreBeforeReset){const sel=document.getElementById('selectMyStore');if(sel)sel.value=_savedStoreBeforeReset;}

      const stockKeys=Object.keys(dataS[0]||{});
      const colFamille=stockKeys.find(k=>k.toLowerCase()==='famille')||stockKeys.find(k=>k.toLowerCase().startsWith('famille'));
      const colSousFamille=stockKeys.find(k=>{const l=k.toLowerCase();return l.includes('sous')&&l.includes('famille');})||stockKeys.find(k=>k.toLowerCase().startsWith('sous-famille'));

      updatePipeline('stock','active');updatePipeline('consomme','active');
      _resetColCache(); // colonnes consommé différentes du stock
      _mark('Init + détection agences');
      updateProgress(45,100,'Ventes…',dataC.rows.length.toLocaleString('fr'));
      const articleRaw={};_S.ventesParAgence={};_S.blData={};if(!isRefilter)_S.clientsMagasin=new Set();_S.ventesLocalMagPeriode=new Map();_S.ventesReseauTousCanaux=new Map();_S.ventesClientsPerStore={};_S.caClientParStore={};_S.clientsByStoreUnivers={};_S.commandesPerStoreCanal={};_S.articleClients=new Map();_S.clientArticles=new Map();if(!isRefilter){_S.clientLastOrder=new Map();_S.clientLastOrderAll=new Map();_S.articleClientsFull=new Map();}
      _S.ventesParAgenceByCanal={};
      if(!isRefilter){_S.articleFamille={};_S.articleUnivers={};_S.canalAgence={};_S.clientNomLookup={};}
      const _clientMagasinBLsTemp=new Map();
      const monthlySales={}; // B3: code → [12 mois qtés]
      let minDateVente=Infinity,maxDateVente=0;let passagesUniques=new Set(),commandesPDV=new Set();const _tempCAAll=new Map(); // accumulation sumCAAll tous canaux, filtré période, fusionné après la boucle
      const _tempCAAllFull=new Map(); // accumulation sumCAAll tous canaux, pleine période, pour ventesLocalMag12MG
      const _storeUniverseBuyerRows=[]; // store × client × article, rebâti en univers après enrichissement familles
      let _cSStk=null,_cSValS=null; // pré-détectés avant la boucle stock
      // H2 / OPT3 : pré-mapper les colonnes UNE FOIS avant la boucle (évite findKey par row)
      let _hasCommandeCol=false;
      const _hC_ci=dataC.headers||[];const _nrm_ci=s=>(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();const _fc_ci=(...t)=>{const _i=_hC_ci.findIndex(h=>t.some(s=>_nrm_ci(h).includes(_nrm_ci(s))));return _i>=0?_i:null;};
      const _famIdx=_hC_ci.findIndex(h=>_nrm_ci(h)==='famille');const _uvIdx=_hC_ci.findIndex(h=>_nrm_ci(h)==='univers');
      const CI={store:_fc_ci('code pdv','pdv','code agence','agence','code depot','depot'),article:_fc_ci('code - désignation','code et nom article','article'),client:_fc_ci('code et nom client','code client','client'),canal:_fc_ci('canal commande','canal'),jour:_fc_ci('jour','date'),bl:_fc_ci('n° bl','numéro de bl','numero bl'),commande:_fc_ci('numéro de commande','n° commande'),caE:_fc_ci('ca enlevé','ca enleve'),caP:_fc_ci('ca prélevé','ca preleve'),vmbE:_fc_ci('vmb enlevé','vmb enleve'),vmbP:_fc_ci('vmb prélevé','vmb preleve'),qteE:_fc_ci('qté enlevée','qte enlevee'),qteP:_fc_ci('qté prélevée','qte prelevee'),famille:_famIdx>=0?_famIdx:null,codeFam:_fc_ci('code famille'),univers:_uvIdx>=0?_uvIdx:null};
      _hasCommandeCol=!!(CI.commande!==null||CI.bl!==null);if(!_hasCommandeCol&&headersC)showToast('⚠️ Colonne "N° commande" absente du fichier Consommé — le dédoublonnage BL est désactivé.','warning');

      for(let i=0;i<dataC.rows.length;i+=CHUNK_SIZE){const end=Math.min(i+CHUNK_SIZE,dataC.rows.length);for(let j=i;j<end;j++){const row=dataC.rows[j];const _rs=(CI.store!==null?(row[CI.store]??'').toString().trim().toUpperCase():'')||'INCONNU';const _ra=(CI.article!==null?(row[CI.article]??''):'').toString();const _rc=(CI.client!==null?(row[CI.client]??''):'').toString().trim();const _rcp=CI.caP!==null?+row[CI.caP]||0:0;const _rce=CI.caE!==null?+row[CI.caE]||0:0;const _rqp=CI.qteP!==null?+row[CI.qteP]||0:0;const _rqe=CI.qteE!==null?+row[CI.qteE]||0:0;const _rvp=CI.vmbP!==null?+row[CI.vmbP]||0:0;const _rve=CI.vmbE!==null?+row[CI.vmbE]||0:0;const _rnc=(CI.commande!==null?(row[CI.commande]??'').toString():'').trim();const _rbl2=(CI.bl!==null?(row[CI.bl]??'').toString():'').trim();const _rncb=_rnc||_rbl2;const _rj=CI.jour!==null?row[CI.jour]:null;const canal=(CI.canal!==null?(row[CI.canal]??''):'MAGASIN').toString().trim().toUpperCase(); // colonne canal absente → MAGASIN (cf. parse-worker)
      // V24.4: canalAgence/libelleLookup/articleCanalCA — period-independent, skip for isRefilter
      if(!isRefilter){
      if(canal){const _sk_canal=_rs;const _storeMatch=!_S.selectedMyStore||_sk_canal==='INCONNU'||_sk_canal===_S.selectedMyStore;if(_storeMatch){const nc2=_rncb;const _bl2=_rbl2;if(nc2||_bl2){if(!_S.canalAgence[canal])_S.canalAgence[canal]={bl:new Set(),blNums:new Set(),ca:0,caP:0,caE:0};if(nc2)_S.canalAgence[canal].bl.add(nc2);if(_bl2&&_bl2!==nc2)_S.canalAgence[canal].blNums.add(_bl2);}}}
      {const _ra0=_ra;const _c0=cleanCode(_ra0);if(_c0&&!_S.libelleLookup[_c0]){const _s0=_ra0.indexOf(' - ');if(_s0>0)_S.libelleLookup[_c0]=_ra0.substring(_s0+3).trim();}}
      // Accumulation CA par canal (prélevé + enlevé) — avant le continue pour capturer tous les canaux
      if(canal&&_S.canalAgence[canal]){const _sk_ca=_rs;if(!_S.selectedMyStore||_sk_ca==='INCONNU'||_sk_ca===_S.selectedMyStore){const _caP3=_rcp;const _caE3=_rce;_S.canalAgence[canal].caP+=_caP3;_S.canalAgence[canal].caE+=_caE3;_S.canalAgence[canal].ca+=_caP3+_caE3;
      // [F1 fix] articleCanalCA — tous canaux, filtré par agence, construit ici dans la boucle existante
      {const _cf1=cleanCode(_ra);if(_cf1){const _qteP_acc=_rqp;if(_caP3+_caE3>0||_qteP_acc>0){if(!_S.articleCanalCA.has(_cf1))_S.articleCanalCA.set(_cf1,new Map());const _acm=_S.articleCanalCA.get(_cf1);if(!_acm.has(canal))_acm.set(canal,{ca:0,qteP:0,countBL:0});const _ace=_acm.get(canal);_ace.ca+=_caP3+_caE3;_ace.qteP+=_qteP_acc;_ace.countBL++;}}}
      }}
      } // end !isRefilter for period-independent blocks
      // Parse date une seule fois — réutilisé par sumCAAll, filtre hors-MAGASIN, et filtre MAGASIN plus bas
      const dateV=parseExcelDate(_rj);
      // Acheteurs par agence × univers — pleine période, on résout l'univers après le stock.
      if(!isRefilter){const _ccBU=extractClientCode(_rc);const _codeBU=cleanCode(_ra);if(_ccBU&&_codeBU){
        const _storeBU=_rs==='INCONNU'?(_S.selectedMyStore||_rs):_rs;
        const _caBU=_rcp+_rce;const _qBU=_rqp+_rqe;
        const _uvBU=(CI.univers!==null?(row[CI.univers]??''):'').toString().trim();
        const _cfBU=(CI.codeFam!==null?(row[CI.codeFam]??''):'').toString().trim()||extractFamCode(((CI.famille!==null?(row[CI.famille]??''):'')||'').toString().trim());
        if((_caBU>0||_qBU>0))_storeUniverseBuyerRows.push({store:_storeBU,cc:_ccBU,code:_codeBU,univ:_uvBU,fam:_cfBU});
      }}
      // clientLastOrderAll — tous canaux, period-independent, avant le split canal
      if(!isRefilter&&dateV){const _ccAll=extractClientCode(_rc);const _skAll=_rs;if(_ccAll&&(!_S.selectedMyStore||_skAll==='INCONNU'||_skAll===_S.selectedMyStore)){const prev=_S.clientLastOrderAll.get(_ccAll);if(!prev||dateV>prev.date)_S.clientLastOrderAll.set(_ccAll,{date:dateV,canal:canal||'MAGASIN'});
      // clientLastOrderByCanal — dernière commande par canal
      const _cByC=canal||'MAGASIN';if(!_S.clientLastOrderByCanal.has(_ccAll))_S.clientLastOrderByCanal.set(_ccAll,new Map());const _cMap=_S.clientLastOrderByCanal.get(_ccAll);const _prevC=_cMap.get(_cByC);if(!_prevC||dateV>_prevC)_cMap.set(_cByC,dateV);
      // clientLastOrder — MAGASIN uniquement, period-independent (comme clientLastOrderAll)
      if(!canal||canal==='MAGASIN'){const _prevMag=_S.clientLastOrder.get(_ccAll);if(!_prevMag||dateV>_prevMag)_S.clientLastOrder.set(_ccAll,dateV);}}}
      // Accumulation CA tous canaux par client dans _tempCAAll (fusionné après la boucle)
      // Ne PAS créer d'entrée dans ventesLocalMagPeriode ici — seules les lignes MAGASIN (L1686) le font
      if(!(_S.periodFilterStart&&dateV&&dateV<_S.periodFilterStart)&&!(_S.periodFilterEnd&&dateV&&dateV>_S.periodFilterEnd))
      {const _ccA=extractClientCode(_rc);const _codeA=cleanCode(_ra);const _skA=_rs;if(_ccA&&_codeA&&(!_S.selectedMyStore||_skA==='INCONNU'||_skA===_S.selectedMyStore)){const _caAT=_rcp+_rce;if(_caAT>0){if(!_tempCAAll.has(_ccA))_tempCAAll.set(_ccA,new Map());const _amA=_tempCAAll.get(_ccA);_amA.set(_codeA,(_amA.get(_codeA)||0)+_caAT);}}}
      // _tempCAAllFull — tous canaux, pleine période (sans filtre), pour ventesLocalMag12MG.sumCAAll
      if(!isRefilter){const _ccAF=extractClientCode(_rc);const _codeAF=cleanCode(_ra);if(_ccAF&&_codeAF&&(!_S.selectedMyStore||_rs==='INCONNU'||_rs===_S.selectedMyStore)){const _caAF=_rcp+_rce;if(_caAF>0){if(!_tempCAAllFull.has(_ccAF))_tempCAAllFull.set(_ccAF,new Map());const _amAF=_tempCAAllFull.get(_ccAF);_amAF.set(_codeAF,(_amAF.get(_codeAF)||0)+_caAF);}}}
      // clientNomLookup — ALL canals, before the canal split, so hors-MAGASIN clients get named too
      if(!isRefilter){const _ccNom=extractClientCode(_rc);if(_ccNom&&!_S.clientNomLookup[_ccNom]){const _rawFull=_rc;const _di=_rawFull.indexOf(' - ');if(_di>=0)_S.clientNomLookup[_ccNom]=_rawFull.slice(_di+3).trim();}}
      if(_S.storesIntersection.size>0?canal!=='MAGASIN':canal!==''&&canal!=='MAGASIN'){
        // Canaux hors MAGASIN — filtre période + accumulation ventesParAgenceByCanal
        if(canal){
          if(_S.periodFilterStart&&dateV&&dateV<_S.periodFilterStart){continue;}
          if(_S.periodFilterEnd&&dateV&&dateV>_S.periodFilterEnd){continue;}
          const cc=extractClientCode(_rc);const codeArt=cleanCode(_ra);const caLigne=_rcp+_rce;const qteLigne=_rqp+_rqe;const skHors=_rs;
          // ventesLocalHorsMag — skip for isRefilter
          if(!isRefilter&&cc&&codeArt&&(!_S.selectedMyStore||skHors==='INCONNU'||skHors===_S.selectedMyStore)){_S.cannauxHorsMagasin.add(canal);const hm=_S.ventesLocalHorsMag.get(cc)||new Map();const ex=hm.get(codeArt)||{sumCA:0,sumPrelevee:0,sumCAPrelevee:0,sumCAP:0,sumCAE:0,countBL:0,canal};ex.sumCA+=caLigne;ex.sumPrelevee+=qteLigne;ex.sumCAPrelevee+=caLigne;ex.sumCAP+=_rcp;ex.sumCAE+=_rce;ex.countBL++;hm.set(codeArt,ex);_S.ventesLocalHorsMag.set(cc,hm);}
          // ventesParAgenceByCanal — toujours (y compris isRefilter)
          if(codeArt&&(skHors==='INCONNU'||_S.storesIntersection.has(skHors)||!_S.storesIntersection.size)){const _storeKey=skHors==='INCONNU'?(_S.selectedMyStore||skHors):skHors;if(!_S.ventesParAgenceByCanal[_storeKey])_S.ventesParAgenceByCanal[_storeKey]={};if(!_S.ventesParAgenceByCanal[_storeKey][canal])_S.ventesParAgenceByCanal[_storeKey][canal]={};if(!_S.ventesParAgenceByCanal[_storeKey][canal][codeArt])_S.ventesParAgenceByCanal[_storeKey][canal][codeArt]={sumCA:0,sumPrelevee:0,countBL:0,sumVMB:0,sumVMBPrel:0};const _vpmc=_S.ventesParAgenceByCanal[_storeKey][canal][codeArt];_vpmc.sumCA+=caLigne;_vpmc.sumPrelevee+=_rcp;_vpmc.countBL++;const _vmbPH=_rvp;const _vmbEH=_rve;_vpmc.sumVMB+=_vmbPH+_vmbEH;_vpmc.sumVMBPrel+=_vmbPH;}
          // commandesPerStoreCanal — hors-MAGASIN
          if(_rncb){if(!_S.commandesPerStoreCanal[skHors])_S.commandesPerStoreCanal[skHors]={};if(!_S.commandesPerStoreCanal[skHors][canal])_S.commandesPerStoreCanal[skHors][canal]=new Set();_S.commandesPerStoreCanal[skHors][canal].add(_rncb);}
          // CA tous canaux dans d'autres agences (sk ≠ myStore)
          if(!isRefilter&&cc&&codeArt&&_S.selectedMyStore&&skHors!=='INCONNU'&&skHors!==_S.selectedMyStore){const _caAut2=_rcp+_rce;if(_caAut2>0){_S.ventesClientAutresAgences.set(cc,(_S.ventesClientAutresAgences.get(cc)||0)+_caAut2);}}
        }
        continue;
      }
      const rawArt=_ra;const code=cleanCode(rawArt);const qteP=_rqp;const qteE=_rqe;const caP=_rcp;const caE=_rce;const sk=_rs;
      if(code&&!_S.libelleLookup[code]){const si=rawArt.indexOf(' - ');if(si>0)_S.libelleLookup[code]=rawArt.substring(si+3).trim();}
      const famConso=((CI.famille!==null?(row[CI.famille]??''):'')||(CI.univers!==null?(row[CI.univers]??''):'')||'').toString().trim();const _codeFamConso=(CI.codeFam!==null?(row[CI.codeFam]??''):'').toString().trim();const _famCode=_codeFamConso||extractFamCode(famConso);if(_famCode&&code)_S.articleFamille[code]=_famCode;const _uv2=(CI.univers!==null?(row[CI.univers]??''):'').toString().trim();const _cf2=_codeFamConso||'';const univConso=_uv2||(_cf2?FAM_LETTER_UNIVERS[_cf2[0].toUpperCase()]||'Inconnu':'');if(univConso&&code)_S.articleUnivers[code]=univConso;
      if(dateV){const ts=dateV.getTime();if(ts<minDateVente)minDateVente=ts;if(ts>maxDateVente)maxDateVente=ts;}
      // Hoistés avant le filtre période : invariants (W/V/MIN/MAX), ventesLocalMag12MG
      const cc2=extractClientCode(_rc);const nc=(_hasCommandeCol?(_rncb||''):('__r'+j)).toString().trim()||('__r'+j);
      if(!isRefilter&&dateV&&code&&(!_S.selectedMyStore||sk===_S.selectedMyStore)&&qteP>0){if(!monthlySales[code])monthlySales[code]=new Array(12).fill(0);monthlySales[code][dateV.getMonth()]+=qteP;}
      if(!isRefilter&&(!useMulti||sk===_S.selectedMyStore)){if(!articleRaw[code])articleRaw[code]={tpp:0,tpn:0,te:0,bls:{},cbl:0};const a=articleRaw[code];if(qteP>0)a.tpp+=qteP;if(qteP<0)a.tpn+=qteP;if(qteE>0)a.te+=qteE;if(!a.bls[nc]){a.bls[nc]={p:Math.max(qteP,0),e:Math.max(qteE,0)};a.cbl++;}else{const ex=a.bls[nc];if(Math.max(qteP,0)>ex.p)ex.p=Math.max(qteP,0);if(Math.max(qteE,0)>ex.e)ex.e=Math.max(qteE,0);}}
      if(!isRefilter&&cc2&&code&&(!_S.selectedMyStore||sk===_S.selectedMyStore)){if(!_S.ventesLocalMag12MG.has(cc2))_S.ventesLocalMag12MG.set(cc2,new Map());const _artF=_S.ventesLocalMag12MG.get(cc2);if(!_artF.has(code))_artF.set(code,{sumPrelevee:0,sumCAPrelevee:0,sumCA:0,sumCAAll:0,countBL:0});const _eF=_artF.get(code);if(qteP>0){_eF.sumPrelevee+=qteP;_eF.sumCAPrelevee+=caP;}_eF.sumCA+=caP+caE;if(qteP>0||qteE>0)_eF.countBL++;}
      // articleClientsFull — pleine période, hoisté hors filtre période (pour squelette invariant)
      if(!isRefilter&&cc2&&code&&(!_S.selectedMyStore||sk===_S.selectedMyStore)){const _ccFull=extractClientCode(_rc);if(_ccFull){if(!_S.articleClientsFull.has(code))_S.articleClientsFull.set(code,new Set());_S.articleClientsFull.get(code).add(_ccFull);}}
      if(_S.periodFilterStart&&dateV&&dateV<_S.periodFilterStart)continue;
      if(_S.periodFilterEnd&&dateV&&dateV>_S.periodFilterEnd)continue;
      if(_S.storesIntersection.has(sk)||!_S.storesIntersection.size){if(!_S.ventesParAgence[sk])_S.ventesParAgence[sk]={};if(!_S.ventesParAgence[sk][code])_S.ventesParAgence[sk][code]={sumPrelevee:0,sumEnleve:0,sumCA:0,countBL:0,sumVMB:0};if(qteP>0)_S.ventesParAgence[sk][code].sumPrelevee+=qteP;if(qteE>0)_S.ventesParAgence[sk][code].sumEnleve+=qteE;_S.ventesParAgence[sk][code].sumCA+=caP+caE;if(qteP>0||qteE>0)_S.ventesParAgence[sk][code].countBL++;_S.ventesParAgence[sk][code].sumVMB+=_rvp+_rve;if(canal){const _bck=_S.ventesParAgence[sk][code];if(!_bck.byCanal)_bck.byCanal={};if(!_bck.byCanal[canal])_bck.byCanal[canal]={sumPrelevee:0,sumCA:0,countBL:0,sumVMB:0};const _bc=_bck.byCanal[canal];if(qteP>0)_bc.sumPrelevee+=qteP;_bc.sumCA+=caP+caE;if(qteP>0||qteE>0)_bc.countBL++;_bc.sumVMB+=_rvp+_rve;}if(code&&(!canal||canal==='MAGASIN')){const _canalKey='MAGASIN';if(!_S.ventesParAgenceByCanal[sk])_S.ventesParAgenceByCanal[sk]={};if(!_S.ventesParAgenceByCanal[sk][_canalKey])_S.ventesParAgenceByCanal[sk][_canalKey]={};if(!_S.ventesParAgenceByCanal[sk][_canalKey][code])_S.ventesParAgenceByCanal[sk][_canalKey][code]={sumCA:0,sumPrelevee:0,countBL:0,sumVMB:0,sumVMBPrel:0};const _vpmc2=_S.ventesParAgenceByCanal[sk][_canalKey][code];_vpmc2.sumCA+=caP+caE;_vpmc2.sumPrelevee+=caP;if(qteP>0||qteE>0)_vpmc2.countBL++;const _vmbP2=_rvp;const _vmbE2=_rve;_vpmc2.sumVMB+=_vmbP2+_vmbE2;_vpmc2.sumVMBPrel+=_vmbP2;}}
      // V2 Phase 1: DataStore.ventesLocalMagPeriode (myStore only) + _S.ventesClientsPerStore (all stores)
      // cc2 et nc déclarés avant le filtre période (hoistés pour W/V/MIN/MAX et ventesLocalMag12MG)
      if(cc2&&code){if(!_S.ventesClientsPerStore[sk])_S.ventesClientsPerStore[sk]=new Set();_S.ventesClientsPerStore[sk].add(cc2);{const _cca=caP+caE;if(_cca>0){if(!_S.caClientParStore[sk])_S.caClientParStore[sk]=new Map();_S.caClientParStore[sk].set(cc2,(_S.caClientParStore[sk].get(cc2)||0)+_cca);}}}
      // commandesPerStoreCanal : N° commande (ou BL) uniques par store × canal (pour nbCommandes dans agenceStore)
      {const _ncCmd=_rncb;if(_ncCmd){const _canalCmd=canal||'MAGASIN';if(!_S.commandesPerStoreCanal[sk])_S.commandesPerStoreCanal[sk]={};if(!_S.commandesPerStoreCanal[sk][_canalCmd])_S.commandesPerStoreCanal[sk][_canalCmd]=new Set();_S.commandesPerStoreCanal[sk][_canalCmd].add(_ncCmd);}}
      // _S.clientsMagasin : clients du consommé de l'agence sélectionnée uniquement (après filtre canal+store)
      if(cc2&&(!_S.selectedMyStore||sk===_S.selectedMyStore)){_S.clientsMagasin.add(cc2);const _nc4m=_rncb||('__row_'+j);if(!_clientMagasinBLsTemp.has(cc2))_clientMagasinBLsTemp.set(cc2,new Set());_clientMagasinBLsTemp.get(cc2).add(_nc4m);}
      // clientNomLookup already populated above (before canal split) for ALL canals
      // ventesLocalMagPeriode = MAGASIN uniquement (garde canal déjà assuré par continue ligne 1594)
      // sumCA inclut les avoirs (qteP<0) pour refléter le CA net réel comme Qlik
      // ventesLocalMagPeriode (myStore) + ventesReseauTousCanaux (ALL stores)
      if(cc2&&code){if(!_S.ventesReseauTousCanaux.has(cc2))_S.ventesReseauTousCanaux.set(cc2,new Map());const artMapR=_S.ventesReseauTousCanaux.get(cc2);if(!artMapR.has(code))artMapR.set(code,{sumCA:0,countBL:0});const eR=artMapR.get(code);eR.sumCA+=caP+caE;if(qteP>0||qteE>0)eR.countBL++;if(!_S.selectedMyStore||sk===_S.selectedMyStore){if(!DataStore.ventesLocalMagPeriode.has(cc2))DataStore.ventesLocalMagPeriode.set(cc2,new Map());const artMap=DataStore.ventesLocalMagPeriode.get(cc2);if(!artMap.has(code))artMap.set(code,{sumPrelevee:0,sumCAPrelevee:0,sumCA:0,sumCAAll:0,countBL:0});const e=artMap.get(code);if(qteP>0){e.sumPrelevee+=qteP;e.sumCAPrelevee+=caP;}e.sumCA+=caP+caE;if(qteP>0||qteE>0)e.countBL++;}}
      // CA MAGASIN dans d'autres agences (sk ≠ myStore)
      if(!isRefilter&&cc2&&code&&_S.selectedMyStore&&sk!=='INCONNU'&&sk!==_S.selectedMyStore){const _caAut=caP+caE;if(_caAut>0){_S.ventesClientAutresAgences.set(cc2,(_S.ventesClientAutresAgences.get(cc2)||0)+_caAut);}}
      if((!_S.selectedMyStore||sk===_S.selectedMyStore)){const _nc3=_rnc;if(_nc3)commandesPDV.add(_nc3);}
      if((!_S.selectedMyStore||sk===_S.selectedMyStore)&&(qteP>0||qteE>0)){if(cc2&&dateV&&!isNaN(dateV.getTime()))passagesUniques.add(cc2+'_'+formatLocalYMD(dateV));}
      // clientLastOrder peuplé avant le filtre période (ligne ~1273) — period-independent
      // V2 Phase 2: _S.articleClients — sans filtre store ni quantité pour couvrir mono ET multi, prélevé ET enlevé
      const rawClient=_rc;
      const codeClient=extractClientCode(_rc);
      if(codeClient&&code){
        if(!_S.articleClients.has(code))_S.articleClients.set(code,new Set());
        _S.articleClients.get(code).add(codeClient);
        if(!_S.clientArticles.has(codeClient))_S.clientArticles.set(codeClient,new Set());
        _S.clientArticles.get(codeClient).add(code);
      }
      if(!useMulti||sk===_S.selectedMyStore){if(qteP>0||qteE>0){const blNum=nc;if(!_S.blData[blNum])_S.blData[blNum]={codes:new Set(),familles:new Set()};_S.blData[blNum].codes.add(code);if(_famCode)_S.blData[blNum].familles.add(famLib(_famCode));if(qteP>0)_S.blPreleveeSet.add(blNum);}}}updateProgress(45+Math.round(i/dataC.rows.length*20),100);await yieldToMain();}
      // Fusion sumCAAll : enrichir ventesLocalMagPeriode avec les CA tous canaux (seuls les clients MAGASIN existants)
      for(const [_cc,_arts] of _tempCAAll){if(!_S.ventesLocalMagPeriode.has(_cc))continue;const _cMap=_S.ventesLocalMagPeriode.get(_cc);for(const [_code,_ca] of _arts){const _e=_cMap.get(_code);if(_e)_e.sumCAAll+=_ca;}}
      // Fusion sumCAAll pleine période dans ventesLocalMag12MG
      if(!isRefilter){for(const [_cc,_arts] of _tempCAAllFull){if(!_S.ventesLocalMag12MG.has(_cc))continue;const _cMap=_S.ventesLocalMag12MG.get(_cc);for(const [_code,_ca] of _arts){const _e=_cMap.get(_code);if(_e)_e.sumCAAll+=_ca;}}}
      // Build blCanalMap + convert canalAgence bl sets — skipped for isRefilter (canalAgence unchanged)
      if(!isRefilter){
      _S.blCanalMap = new Map();
      for(const [canal, data] of Object.entries(_S.canalAgence)){
        if(data.bl instanceof Set){for(const bl of data.bl)_S.blCanalMap.set(bl, canal);}
        if(data.blNums instanceof Set){for(const bl of data.blNums)_S.blCanalMap.set(bl, canal);}
      }
      for(const c of Object.keys(_S.canalAgence)){_S.canalAgence[c].bl=_S.canalAgence[c].bl.size;delete _S.canalAgence[c].blNums;}
      }
      // Recalcul canalAgence période-filtré (isRefilter OU premier parse avec filtre déjà positionné)
      if(isRefilter||(_S.periodFilterStart||_S.periodFilterEnd)){
        _S.canalAgence={};const _tmpBLca={};
        for(const row of dataC.rows){
          const canal=(CI.canal!==null?(row[CI.canal]??''):'MAGASIN').toString().trim().toUpperCase();if(!canal)continue;
          const sk=(CI.store!==null?(row[CI.store]??'').toString().trim().toUpperCase():'')||'INCONNU';if(_S.selectedMyStore&&sk!=='INCONNU'&&sk!==_S.selectedMyStore)continue;
          const dateV=parseExcelDate(CI.jour!==null?row[CI.jour]:null);
          if(_S.periodFilterStart&&dateV&&dateV<_S.periodFilterStart)continue;
          if(_S.periodFilterEnd&&dateV&&dateV>_S.periodFilterEnd)continue;
          const nc=((CI.commande!==null?(row[CI.commande]??'').toString():CI.bl!==null?(row[CI.bl]??'').toString():'')).trim();
          const caP=CI.caP!==null?+row[CI.caP]||0:0;const caE=CI.caE!==null?+row[CI.caE]||0:0;
          if(!_S.canalAgence[canal])_S.canalAgence[canal]={bl:0,ca:0,caP:0,caE:0};
          if(nc){if(!_tmpBLca[canal])_tmpBLca[canal]=new Set();if(!_tmpBLca[canal].has(nc)){_tmpBLca[canal].add(nc);_S.canalAgence[canal].bl++;}}
          _S.canalAgence[canal].caP+=caP;_S.canalAgence[canal].caE+=caE;_S.canalAgence[canal].ca+=caP+caE;
        }
      }
      // Patch obsKpis.mine depuis canalAgence (période-filtré — isRefilter ou premier parse avec filtre)
      if((isRefilter||(_S.periodFilterStart||_S.periodFilterEnd))&&_S.benchLists?.obsKpis){
        const _ca=Object.values(_S.canalAgence).reduce((t,v)=>t+(v.ca||0),0);

        _S.benchLists.obsKpis.mine={
          ca:_ca,
          ref:_S.benchLists.obsKpis.mine?.ref||0,
          freq:Object.values(_S.canalAgence).reduce((t,v)=>t+(v.bl||0),0),
          serv:_S.benchLists.obsKpis.mine?.serv||0,
          pdm:_S.benchLists.obsKpis.mine?.pdm||0,
          txMarge:_S.benchLists.obsKpis.mine?.txMarge||0
        };
        invalidateCache('bench');
      }
      // Fidèles PDV : fréquence MAGASIN par client (nb BL distincts)
      if(!isRefilter)_S.clientsMagasinFreq=new Map([..._clientMagasinBLsTemp].map(([cc,bls])=>[cc,bls.size]));
      // Univers dominant par client : somme CA par univers → univers avec le plus de CA
      _computeClientDominantUnivers();
      // V24.4: build _S.blConsommeSet ONCE here (before territoire processing)
      _S.blConsommeSet=new Set(Object.keys(_S.blData));
      updatePipeline('consomme','done');
      // B3: Moteur saisonnier — skipped for isRefilter (stock-derived, period-independent)
      if(!isRefilter){_computeSeasonalIndex(monthlySales);}

      const synth=_buildSynthFromRaw(articleRaw);
      _mark('Boucle consommé');

      updateProgress(68,100,'Analyse ventes…');
      const joursOuvres=(minDateVente<Infinity&&maxDateVente>0)?Math.max(Math.round(daysBetween(new Date(minDateVente),new Date(maxDateVente))*(5/7)),30):250;
      _S.globalJoursOuvres=joursOuvres;
      // VOLET 4: Period detection
      let _autoYTD=false;
      if(minDateVente<Infinity&&maxDateVente>0){
        _S.consommePeriodMin=new Date(minDateVente);_S.consommePeriodMax=new Date(maxDateVente);
        const calJours=daysBetween(_S.consommePeriodMin,_S.consommePeriodMax);
        _S.consommeMoisCouverts=Math.round(calJours/30.5);
        // [AUTO-YTD] consommé < 6 mois → forcer YTD pour éviter sparklines vides sur données courtes
        if(!isRefilter&&_S.consommeMoisCouverts<6&&(_S._globalPeriodePreset||'12M')==='12M'){_S._globalPeriodePreset='YTD';_autoYTD=true;}
        // MinFull/MaxFull = plage totale : on les définit sur le parse complet (!isRefilter)
        // minDateVente/maxDateVente sont trackés AVANT le filtre période → toujours pleine plage
        if(!isRefilter){_S.consommePeriodMinFull=_S.consommePeriodMin;_S.consommePeriodMaxFull=_S.consommePeriodMax;}
        updatePeriodAlert();
        buildPeriodFilter();
      }
      const totalBLs=Object.keys(_S.blData).length;let sumRefParBL=0,sumFamParBL=0;const famBLcount={};
      for(const bl of Object.values(_S.blData)){sumRefParBL+=bl.codes.size;sumFamParBL+=bl.familles.size;for(const fam of bl.familles)famBLcount[fam]=(famBLcount[fam]||0)+1;}
      const _sd0=_S.ventesParAgence[_S.selectedMyStore]||{};const _caCalc=Object.values(_sd0).reduce((s,v)=>s+(v.sumCA||0),0);const _vmbCalc=Object.values(_sd0).reduce((s,v)=>s+(v.sumVMB||0),0);
      _S.ventesAnalysis={refParBL:totalBLs>0?(sumRefParBL/totalBLs).toFixed(1):0,famParBL:totalBLs>0?(sumFamParBL/totalBLs).toFixed(1):0,totalBL:totalBLs,refActives:Object.values(synth).filter(s=>s.sumP>0||s.sumE>0).length,attractivite:famBLcount,nbPassages:passagesUniques.size,txMarge:_caCalc>0?_vmbCalc/_caCalc*100:null,vmc:commandesPDV.size>0?_caCalc/commandesPDV.size:null};

      let familles=new Set(),sousFamilles=new Set(),emplacements=new Set(),statuts=new Set();
      if(!isRefilter) _S._pushedCodes=new Set(); // reset dédup avant le bloc stock (interdit le double-push inter-appels)
      if(!isRefilter && dataS && dataS.length){ // ── bloc stock — skipped for isRefilter (stock unchanged) ──
      updatePipeline('stock','active');
      _resetColCache(); // colonnes stock différentes du consommé
      // Pré-détection colonnes stock qty / valeur — évite Object.keys par ligne
      {const _ks0=Object.keys(dataS[0]||{});_cSStk=_ks0.find(k=>{const lk=k.toLowerCase();return(lk.includes('stock')||lk.includes('qt')||lk.includes('quant'))&&!lk.includes('min')&&!lk.includes('max')&&!lk.includes('valeur')&&!lk.includes('alerte')&&!lk.includes('statut');});_cSValS=_ks0.find(k=>{const lk=k.toLowerCase().replace(/[\r\n]/g,' ');return lk.includes('valeur')&&lk.includes('stock');});}
      _mark('Analyse ventes');
      updateProgress(70,100,'Min/Max…',dataS.length.toLocaleString('fr'));
      // C1: snapshot des libellés bâtis depuis le consommé avant le reset — merger après la boucle stock
      const _libelleFromConsomme = Object.assign({}, _S.libelleLookup);
      _S.finalData=[];_S.libelleLookup={}; // producteur — _S direct_S.stockParMagasin={};_S.cockpitLists={ruptures:new Set(),fantomes:new Set(),sansemplacement:new Set(),anomalies:new Set(),saso:new Set(),dormants:new Set(),fins:new Set(),top20:new Set(),nouveautes:new Set(),colisrayon:new Set(),stockneg:new Set(),fragiles:new Set(),phantom:new Set(),invendus:new Set()};
      _S.parentRefsExcluded=0;
      const NOW=new Date();

      for(let i=0;i<dataS.length;i+=CHUNK_SIZE){const end=Math.min(i+CHUNK_SIZE,dataS.length);for(let j=i;j<end;j++){const row=dataS[j];const rawCode=getVal(row,'Article','Code');if(!rawCode)continue;const storeCode=extractStoreCode(row),code=cleanCode(rawCode);
      if(storeCode&&(_S.storesIntersection.has(storeCode)||!_S.storesIntersection.size)){if(!_S.stockParMagasin[storeCode])_S.stockParMagasin[storeCode]={};const _stkVal=_cSValS?cleanPrice(row[_cSValS]):null;const _kMin=parseFloat(getVal(row,'min')||0)||0;const _kMax=parseFloat(getVal(row,'max')||0)||0;_S.stockParMagasin[storeCode][code]={stockActuel:cleanPrice(_cSStk?row[_cSStk]:0),valeurStock:_stkVal,qteMin:_kMin,qteMax:_kMax};}
      if(!_S.libelleLookup[code]){const lib=rawCode.toString().substring(code.length+3).trim()||(getVal(row,'Libellé','Designation')||'').toString().trim();if(lib)_S.libelleLookup[code]=lib;}
      if(_S.selectedMyStore&&storeCode&&storeCode!==_S.selectedMyStore)continue;
      const libelle=_S.libelleLookup[code]||code;const statut=(getVal(row,'Statut')||'Inconnu').toString().trim();
      const _rawFamille=colFamille?(row[colFamille]||'').toString().trim():'';const famille=(_rawFamille?extractFamCode(_rawFamille):null)||_S.articleFamille[code]||'Non Classé';
      const sousFamille=colSousFamille?(row[colSousFamille]||'').toString().trim():'';
      const rawEmp=(getVal(row,'Emplacement')||'').toString().trim();const emplacement=(rawEmp===''||rawEmp==='-')?'':rawEmp;
      if(famille&&famille!=='Non Classé')familles.add(famille);if(sousFamille)sousFamilles.add(sousFamille);if(emplacement)emplacements.add(emplacement);if(statut)statuts.add(statut);
      const keyStock=_cSStk;const keyValeurStock=_cSValS;
      const stockActuel=cleanPrice(keyStock?row[keyStock]:0);const valeurStock=keyValeurStock?cleanPrice(row[keyValeurStock]):null;const prixUnitaire=(valeurStock!==null&&stockActuel!==0)?Math.abs(valeurStock/stockActuel):(Math.abs(cleanPrice(getVal(row,'Valeur','Prix')))/(Math.abs(stockActuel)||1));
      const dateSortie=parseExcelDate(getVal(row,'dernière sortie','sortie'));const date1ereEntree=parseExcelDate(getVal(row,'première entrée','premiere entree','première réception'));const dateEntree=parseExcelDate(getVal(row,'dernière entrée','entrée'));const dateRef=parseExcelDate(getVal(row,'référencement','réf'));
      const dateInactivite=dateSortie||dateEntree||dateRef;const ageJours=dateInactivite?daysBetween(dateInactivite,NOW):999;const age1ereEntree=date1ereEntree?daysBetween(date1ereEntree,NOW):999;const isNouveaute=(age1ereEntree<NOUVEAUTE_DAYS)&&(!dateSortie||ageJours<90);
      const ancienMin=parseFloat(getVal(row,'min')||0);const ancienMax=parseFloat(getVal(row,'max')||0);

      // ★ V23: Detect parent reference
      const isParent=isParentRef(row);

      const stats=synth[code]||{maxP:0,sumP:0,sumE:0,cbl:0,cblP:0};
      const T=stats.maxP,V=stats.sumP,W=stats.cbl,Wp=stats.cblP;const U=Wp>0?(V/Wp):0;
      const X=V/joursOuvres;
      const enleveTotal=stats.sumE;
      let nouveauMin=0,nouveauMax=0;const cs=statut.charAt(0);
      if(isNouveaute){nouveauMin=ancienMin;nouveauMax=ancienMax;}
      else if(['2','3','4'].includes(cs)){nouveauMin=0;nouveauMax=0;}
      else if(W<=1){nouveauMin=0;nouveauMax=0;}
      else if(W===2&&V>0){nouveauMin=1;nouveauMax=2;}
      else if(V===0){nouveauMin=0;nouveauMax=0;}
      else if(Wp===0){nouveauMin=0;nouveauMax=0;} // H1: guard — Wp=0 ne doit jamais atteindre l'écretage
      else{const dlR=(T>3*U)?3*U:T;const dl=Math.min(dlR,U*5);const secDays=Wp>=12?4:Wp>=4?3:(prixUnitaire>HIGH_PRICE?1:2);nouveauMin=Math.max(Math.min(Math.round(dl+(X*secDays)),Math.ceil(V/6)),1);if(nouveauMin<0)nouveauMin=0;if(nouveauMin===0)nouveauMax=0;else{const df=Wp>12?21:10;const me=prixUnitaire>HIGH_PRICE?(Wp>12?1:0):(Wp>12?3:1);nouveauMax=Math.max(Math.round(nouveauMin+(X*df)),nouveauMin+me);}}
      const couvertureJours=calcCouverture(stockActuel,V);
      if(_S._pushedCodes.has(code))continue; _S._pushedCodes.add(code);
      DataStore.finalData.push({code,libelle,statut,famille,sousFamille,emplacement,W,V,stockActuel,prixUnitaire,valeurStock,ancienMin,ancienMax,nouveauMin,nouveauMax,ageJours,isNouveaute,enleveTotal,couvertureJours,isParent});
      }updateProgress(70+Math.round(i/dataS.length*20),100);await yieldToMain();}
      // C1: enrichir _S.libelleLookup avec les libellés consommé pour les codes absents du stock
      for(const k in _libelleFromConsomme){if(!_S.libelleLookup[k])_S.libelleLookup[k]=_libelleFromConsomme[k];}
      _mark('Boucle stock');
      updatePipeline('stock','done');

      // ★ Médiane réseau MIN/MAX par article (multi-agences uniquement)
      if(useMulti&&DataStore.finalData.length){const _otherS=[..._S.storesIntersection].filter(s=>s!==_S.selectedMyStore);if(_otherS.length){for(const r of DataStore.finalData){const _mins=_otherS.map(s=>_S.stockParMagasin[s]?.[r.code]?.qteMin).filter(v=>v>0);const _maxs=_otherS.map(s=>_S.stockParMagasin[s]?.[r.code]?.qteMax).filter(v=>v>0);r.medMinReseau=_mins.length?_median(_mins):null;r.medMaxReseau=_maxs.length?_median(_maxs):null;}}}

      enrichPrixUnitaire();
      _enrichFinalDataWithCA(); // CA réel depuis ventesLocalMagPeriode (MAGASIN, myStore)

      // ★ Juge de Paix — Vitesse Réseau (fallback adaptatif pour TOUS les 0/0)
      if(useMulti) _applyVitesseReseau();

      // Fix: align _S.articleFamille with stock famille (stock is master)
      for (const r of DataStore.finalData) { if (r.famille && r.famille !== 'Non Classé') _S.articleFamille[r.code] = r.famille; }
      // B3b: Recalcul moteur saisonnier après enrichissement articleFamille (stock est master des familles)
      _computeSeasonalIndex(monthlySales);
      _S._hasStock = _S.finalData.length > 0;
      }else{updatePipeline('stock','skip');} // ── fin bloc stock ──────────────────────

      // Acheteurs par agence × univers : résolution après stock (certains consommés n'ont pas l'univers/famille).
      // clientsByStoreUnivers = pleine période 12MG (structurel, pas filtré par période).
      if (!Object.keys(_S.clientsByStoreUnivers || {}).length) {
        _S.clientsByStoreUnivers={};
        for(const row of _storeUniverseBuyerRows){
          const fam=row.fam||_S.articleFamille?.[row.code]||'';
          const univ=(fam&&fam!=='Non Classé')?(FAM_LETTER_UNIVERS[fam[0].toUpperCase()]||row.univ||'Inconnu'):(row.univ||_S.articleUnivers?.[row.code]||'');
          if(!univ)continue;
          if(!_S.clientsByStoreUnivers[row.store])_S.clientsByStoreUnivers[row.store]={};
          if(!_S.clientsByStoreUnivers[row.store][univ])_S.clientsByStoreUnivers[row.store][univ]=new Set();
          _S.clientsByStoreUnivers[row.store][univ].add(row.cc);
        }
      }

      // Benchmark — skipped for isRefilter (period-independent)
      // Chalandise : géré dans _postParseMain (point d'entrée principal)
      if(!isRefilter){
        if(useMulti){updateProgress(92,100,'Benchmark…');await yieldToMain();computeBenchmark();_mark('Benchmark');}
      }
      // ABC/FMR, selects — skipped for isRefilter (finalData unchanged)
      if(!isRefilter){
        if(DataStore.finalData.length>0&&DataStore.finalData.every(r=>r.stockActuel===0)){showToast('⚠️ Attention : toutes les valeurs de stock sont à 0 dans le fichier. Vérifiez votre export.','warning');}
        updateProgress(93,100,'Radar ABC/FMR…');await yieldToMain();computeABCFMR(DataStore.finalData);_mark('ABC/FMR');assertPostParseInvariants();
        if(useMulti){updateProgress(94,100,'Verdicts assortiment…');await yieldToMain();try{const _vr=applyVerdictOverrides();console.log('[PRISME] Bouclier Squelette:',_vr);}catch(e){console.error('[PRISME] Bouclier Squelette ERREUR:',e);}_mark('Verdicts');}
        updateProgress(95,100,'Affichage…');await yieldToMain();
        populateSelect('filterFamille',familles,famLabel);populateSelect('filterSousFamille',sousFamilles);populateSelect('filterEmplacement',emplacements);populateSelect('filterStatut',statuts);
        buildSqLookup();
      }
      const elapsed=((performance.now()-t0)/1000).toFixed(1);
      document.getElementById('navStats').textContent=DataStore.finalData.length.toLocaleString('fr')+' art.';document.getElementById('navStats').classList.remove('hidden');
      document.getElementById('navPerf').textContent=elapsed+'s';document.getElementById('navPerf').classList.remove('hidden');
      const _navSt=document.getElementById('navStore');if(_navSt){_navSt.textContent=_S.selectedMyStore||'';_navSt.classList.toggle('hidden',!_S.selectedMyStore);}
      document.getElementById('navReportingBtn').classList.remove('hidden');
      document.getElementById('globalFilters').classList.remove('hidden');
      document.body.classList.add('pilot-loaded');
      if(!isRefilter){
        const _terrBtn=document.getElementById('btnTabCommerce');_terrBtn.classList.remove('hidden');
        const _clientsBtn=document.getElementById('btnTabClients');if(_clientsBtn)_clientsBtn.classList.remove('hidden');
        const terrNoC=document.getElementById('terrNoChalandise');if(terrNoC)terrNoC.classList.toggle('hidden',_S.chalandiseReady);
      }
      // Render main UI immediately — don't wait for territoire
      computeClientCrossing();computeReconquestCohort();
      buildClientStore();_applyForcageCommercial();_mark('ClientStore + crossing');
      if(!isRefilter&&_S.chalandiseReady)_computeChalandiseDistances();
      // caByArticleCanal — skipped for isRefilter (ventesLocalHorsMag unchanged)
      if (!isRefilter && _S.chalandiseReady) _rebuildCaByArticleCanal();
      if(_S.chalandiseReady&&DataStore.ventesLocalMagPeriode.size>0){launchClientWorker().then(()=>{resetBenchMetierCache();computeOpportuniteNette();computeAnglesMorts();computeOmniScores();buildClientStore();_applyForcageCommercial();renderTabBadges();if(!isRefilter&&_S.selectedMyStore)_saveSessionToIDB();}).catch(err=>console.warn('Client worker error:',err));}
      _S.currentPage=0;_S._parsingInProgress=false; // libère les renders
      if(isRefilter&&useMulti){invalidateCache('bench');computeBenchmark();}if(isRefilter){renderCurrentTab();}else{renderAll();}_mark('renderAll');
      if(!isRefilter){_syncTabAccess();}
      if(_autoYTD){setPeriodePreset('YTD');}
      _mark('Prêt');console.table(_perf);
      updateProgress(100,100,'✅ Prêt !',elapsed+'s');await new Promise(r=>setTimeout(r,400));
      renderSidebarAgenceSelector();
      if(!isRefilter){switchTab('partie');btn.textContent='✅ '+elapsed+'s';btn.classList.replace('s-panel-inner','bg-emerald-600');const _nbF=2+(document.getElementById('fileChalandise').files[0]?1:0);collapseImportZone(_nbF,_S.selectedMyStore,DataStore.finalData.length,elapsed);const btnR=document.getElementById('btnRecalculer');if(btnR)btnR.classList.remove('hidden');}else{btn.textContent='✅ '+elapsed+'s';btn.classList.replace('s-panel-inner','bg-emerald-600');}
      // IDB save — skipped for isRefilter (only saves on full load)
      if (!isRefilter && _S.selectedMyStore) { localStorage.setItem('prisme_selectedStore', _S.selectedMyStore); _saveToCache(); _saveSessionToIDB(); if(_f1)_saveFileHashes(_f1,_f2,document.getElementById('fileChalandise').files[0]||null,null); }
      // Pré-calcul squelette en idle — alimente SOCLE badges + 🚨 Capitaines
      _scheduleIdleSquelette();
    }catch(error){if(error.message==='NO_STORE_SELECTED')return;showToast('❌ '+error.message,'error');console.error(error);btn.textContent='❌';btn.classList.replace('s-panel-inner','bg-red-600');}
    finally{btn.disabled=false;btn.classList.remove('loading');hideLoading();}
  }



  // V24.4+: Render canal distribution block — enriched with prélevé/enlevé CA
