/* js/conv.js — Convertisseur XLSX → CSV (local, optimisé, multi-fichiers) */
'use strict';

(function() {
  const $ = (id) => document.getElementById(id);

  const elFiles = $('convFiles');
  const elList = $('convFileList');
  const elSep = $('convSep');
  const elSheet = $('convSheet');
  const elBom = $('convBom');
  const elCrlf = $('convCrlf');
  const btnPickDir = $('btnPickDir');
  const btnClearDir = $('btnClearDir');
  const elDirStatus = $('dirStatus');
  const btnConvert = $('btnConvert');
  const bar = $('convProgBar');
  const elProgText = $('convProgText');
  const elLog = $('convLog');
  const elSupportBadge = $('convSupportBadge');
  const elMerge = $('convMerge');
  const elMergeOptions = $('mergeOptions');
  const elMergeName = $('convMergeName');
  const elDedup = $('convDedup');
  const elSecondaryFiles = $('convSecondaryFiles');
  const elSecondaryZone = $('secondaryFileZone');
  const elSecondaryList = $('convSecondaryList');
  const elDedupHint = $('dedupHint');

  let outDirHandle = null;

  function fmtBytes(n) {
    const u = ['o', 'Ko', 'Mo', 'Go'];
    let i = 0;
    let v = n || 0;
    while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
    return (i === 0 ? String(Math.round(v)) : v.toFixed(1).replace('.', ',')) + ' ' + u[i];
  }

  function log(line) {
    const ts = new Date().toISOString().slice(11, 19);
    elLog.textContent += `[${ts}] ${line}\n`;
    elLog.scrollTop = elLog.scrollHeight;
  }

  function setProg(pct, text) {
    const p = Math.max(0, Math.min(100, pct || 0));
    bar.style.width = p.toFixed(1) + '%';
    elProgText.textContent = text || '';
  }

  function sanitizeCsvName(name) {
    const base = (name || 'export').replace(/\.(xlsx?|xls)$/i, '');
    const safe = base.replace(/[\\/:*?"<>|]+/g, '_').slice(0, 120);
    return safe + '.csv';
  }

  function sanitizeOutCsvName(name, fallback) {
    const raw = (name || '').trim();
    if (!raw) return sanitizeCsvName(fallback || 'fusion.xlsx');
    const base = raw.replace(/\.csv$/i, '');
    const safe = base.replace(/[\\/:*?"<>|]+/g, '_').slice(0, 120);
    return safe + '.csv';
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }

  function supportsDirPicker() {
    return typeof window.showDirectoryPicker === 'function';
  }

  function updateDirUI() {
    if (!supportsDirPicker()) {
      btnPickDir.disabled = true;
      btnPickDir.title = 'Non supporté sur ce navigateur';
      btnClearDir.style.display = 'none';
      elDirStatus.textContent = 'Mode dossier : non supporté ici (utilise Chrome/Edge).';
      return;
    }
    btnPickDir.disabled = false;
    btnPickDir.title = '';
    btnClearDir.style.display = outDirHandle ? '' : 'none';
    elDirStatus.textContent = outDirHandle ? 'Dossier sélectionné (écriture directe, plus fiable pour gros fichiers).' : 'Aucun dossier sélectionné (téléchargements).';
  }

  function updateFileListUI() {
    const files = elFiles.files ? [...elFiles.files] : [];
    btnConvert.disabled = files.length === 0;

    if (!files.length) {
      elList.style.display = 'none';
      elList.innerHTML = '';
      return;
    }

    elList.style.display = '';
    elList.innerHTML = files.map(f => {
      return `<div class="it">
        <div class="name" title="${escapeHtml(f.name)}">${escapeHtml(f.name)}</div>
        <div class="meta">${fmtBytes(f.size)}</div>
      </div>`;
    }).join('');

    updateMergeUI();
  }

  function escapeHtml(s) {
    return (s || '').toString()
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  async function convertOneFile(file, idx, total) {
    const outName = sanitizeCsvName(file.name);
    const sep = elSep.value || ';';
    const sheetIndex = Math.max(0, parseInt(elSheet.value || '0', 10) || 0);
    const bom = !!elBom.checked;
    const crlf = elCrlf.value === '1';

    setProg((idx / Math.max(total, 1)) * 100, `Lecture ${file.name}…`);
    log(`📥 ${file.name} (${fmtBytes(file.size)}) → ${outName}`);

    // Lire en ArrayBuffer (séquentiel pour limiter le pic RAM)
    const buf = await file.arrayBuffer();

    const worker = new Worker('js/conv-worker.js');

    let chunks = null;
    let writable = null;
    let writeChain = Promise.resolve();
    let gotMeta = false;

    if (outDirHandle) {
      try {
        const handle = await outDirHandle.getFileHandle(outName, { create: true });
        writable = await handle.createWritable();
      } catch (e) {
        log(`⚠️ Écriture directe impossible (${e.message || e}). Fallback téléchargement.`);
        outDirHandle = null;
        updateDirUI();
      }
    }

    if (!writable) chunks = [];

    const finish = (ok, errMsg) => {
      try { worker.terminate(); } catch (_) {}
      if (!ok) throw new Error(errMsg || 'Erreur conversion');
    };

    const p = new Promise((resolve, reject) => {
      worker.onerror = (e) => reject(new Error('Worker: ' + (e.message || 'erreur')));
      worker.onmessage = (evt) => {
        const m = evt.data || {};
        if (m.type === 'progress') {
          const pct = Math.min(100, Math.max(0, m.pct || 0));
          const globalPct = ((idx / Math.max(total, 1)) * 100) + (pct / Math.max(total, 1));
          setProg(globalPct, `${file.name} — ${m.msg || '…'}`);
        } else if (m.type === 'meta') {
          gotMeta = true;
          log(`🧾 Feuille: ${m.sheet || '—'} · ${m.rows || 0} lignes · ${m.cols || 0} colonnes`);
        } else if (m.type === 'chunk') {
          const text = m.text || '';
          if (!text) return;
          if (writable) {
            // Garder l'ordre des chunks
            writeChain = writeChain.then(() => writable.write(text));
          } else {
            chunks.push(text);
          }
        } else if (m.type === 'done') {
          (async () => {
            try {
              if (writable) {
                await writeChain;
                await writable.close();
                log('✅ Écrit dans le dossier.');
              } else {
                const blob = new Blob(chunks, { type: 'text/csv;charset=utf-8' });
                downloadBlob(blob, outName);
                log('✅ Téléchargé.');
              }
              resolve();
            } catch (e) {
              reject(e);
            }
          })();
        } else if (m.type === 'error') {
          reject(new Error(m.msg || 'Erreur conversion'));
        }
      };

      worker.postMessage({
        type: 'convert',
        buf,
        filename: file.name,
        opts: { sep, sheetIndex, bom, crlf }
      }, [buf]);
    });

    try {
      await p;
      if (!gotMeta) log('ℹ️ Conversion terminée.');
    } catch (e) {
      finish(false, e.message || String(e));
      throw e;
    } finally {
      try { worker.terminate(); } catch (_) {}
    }
  }

  function updateMergeUI() {
    if (!elMerge || !elMergeOptions) return;
    elMergeOptions.style.display = elMerge.checked ? '' : 'none';
    const files = elFiles.files ? [...elFiles.files] : [];
    const dedup = elDedup ? elDedup.value : '';
    const isClientFirst = dedup === 'client-first';
    // Show/hide secondary files zone
    if (elSecondaryZone) elSecondaryZone.style.display = isClientFirst ? '' : 'none';
    // Update secondary file list
    if (elSecondaryList) {
      const sFiles = elSecondaryFiles?.files ? [...elSecondaryFiles.files] : [];
      if (sFiles.length) {
        elSecondaryList.style.display = '';
        elSecondaryList.innerHTML = sFiles.map(f => `<div class="it"><div class="name" title="${escapeHtml(f.name)}">${escapeHtml(f.name)}</div><div class="meta">${fmtBytes(f.size)}</div></div>`).join('');
      } else {
        elSecondaryList.style.display = 'none';
        elSecondaryList.innerHTML = '';
      }
    }
    // Update hint text
    if (elDedupHint) {
      if (isClientFirst) {
        elDedupHint.innerHTML = '<strong>Priorité mon agence</strong> : le fichier principal (au-dessus) est prioritaire. Les complémentaires ajoutent les clients manquants sans écraser.';
      } else if (dedup === 'client') {
        elDedupHint.innerHTML = '<strong>Priorité CA 2026</strong> : garde la ligne avec le plus gros CA 2026.';
      } else if (dedup === 'row') {
        elDedupHint.innerHTML = 'Supprime les lignes 100% identiques (safe pour doublons copier/coller).';
      } else {
        elDedupHint.innerHTML = 'Concatène tout sans dédoublonnage (peut surcompter).';
      }
    }
    // Update button label
    const secFiles = isClientFirst && elSecondaryFiles?.files ? elSecondaryFiles.files.length : 0;
    const totalFiles = files.length + secFiles;
    if (elMerge.checked) {
      btnConvert.textContent = totalFiles > 1 ? `Fusionner (${totalFiles})` : 'Fusionner';
    } else {
      btnConvert.textContent = 'Convertir';
    }
    btnConvert.disabled = files.length === 0;
  }

  async function convertMerged(files) {
    const sep = elSep.value || ';';
    const sheetIndex = Math.max(0, parseInt(elSheet.value || '0', 10) || 0);
    const bom = !!elBom.checked;
    const crlf = elCrlf.value === '1';
    const dedup = (elDedup && elDedup.value) ? elDedup.value : 'client';

    // client-first : primary files first, then secondary files
    if (dedup === 'client-first' && elSecondaryFiles?.files?.length) {
      files = [...files, ...elSecondaryFiles.files];
    }

    const outName = sanitizeOutCsvName(elMergeName ? elMergeName.value : 'fusion.csv', files[0] ? files[0].name : 'fusion.xlsx');

    log(`🧩 Fusion activée — sortie: ${outName} · doublons: ${dedup}`);
    setProg(0, `Fusion (${files.length} fichier(s))…`);

    const worker = new Worker('js/conv-worker.js');
    let chunks = null;
    let writable = null;
    let writeChain = Promise.resolve();

    if (outDirHandle) {
      try {
        const handle = await outDirHandle.getFileHandle(outName, { create: true });
        writable = await handle.createWritable();
      } catch (e) {
        log(`⚠️ Écriture directe impossible (${e.message || e}). Fallback téléchargement.`);
        outDirHandle = null;
        updateDirUI();
      }
    }
    if (!writable) chunks = [];

    const waiters = new Map(); // type -> [resolve, reject]
    const once = (type) => new Promise((resolve, reject) => { waiters.set(type, [resolve, reject]); });

    let activeFileIdx = 0;
    const stageParseMax = 70; // % pour ingestion des fichiers
    const stageEmitMax = 30;  // % pour écriture CSV

    worker.onerror = (e) => {
      const err = new Error('Worker: ' + (e.message || 'erreur'));
      // Rejette tout ce qui attend (sinon on peut rester bloqué sur await once(...))
      for (const [, w] of waiters) { try { w[1](err); } catch (_) {} }
      waiters.clear();
    };

    worker.onmessage = (evt) => {
      const m = evt.data || {};

      if (m.type === 'progress') {
        const pct = Math.min(100, Math.max(0, m.pct || 0));
        // m.scope = 'ingest' | 'emit' (merge), sinon fallback
        let globalPct = pct;
        if (m.scope === 'ingest') {
          globalPct = (activeFileIdx / Math.max(files.length, 1)) * stageParseMax + (pct / 100) * (stageParseMax / Math.max(files.length, 1));
        } else if (m.scope === 'emit') {
          globalPct = stageParseMax + (pct / 100) * stageEmitMax;
        }
        setProg(globalPct, m.msg || '…');
        return;
      }

      if (m.type === 'chunk') {
        const text = m.text || '';
        if (!text) return;
        if (writable) writeChain = writeChain.then(() => writable.write(text));
        else chunks.push(text);
        return;
      }

      if (m.type === 'meta') {
        // Affichage utile, sans être verbeux
        if (m.merge) {
          log(`🧾 Fusion: ${m.rows || 0} lignes · ${m.cols || 0} colonnes · doublons=${m.duplicates || 0}`);
        } else {
          log(`🧾 Feuille: ${m.sheet || '—'} · ${m.rows || 0} lignes · ${m.cols || 0} colonnes`);
        }
        return;
      }

      if (m.type === 'done') {
        (async () => {
          try {
            if (writable) {
              await writeChain;
              await writable.close();
              log('✅ Écrit dans le dossier.');
            } else {
              const blob = new Blob(chunks, { type: 'text/csv;charset=utf-8' });
              downloadBlob(blob, outName);
              log('✅ Téléchargé.');
            }
            const w = waiters.get('done');
            if (w) { waiters.delete('done'); w[0](m); }
          } catch (e) {
            const w = waiters.get('done');
            if (w) { waiters.delete('done'); w[1](e); }
          }
        })();
        return;
      }

      if (m.type === 'error') {
        const err = new Error(m.msg || 'Erreur conversion');
        for (const [, w] of waiters) { try { w[1](err); } catch (_) {} }
        waiters.clear();
        return;
      }

      const w = waiters.get(m.type);
      if (w) { waiters.delete(m.type); w[0](m); }
    };

    // 1) init
    worker.postMessage({ type: 'merge_init', opts: { sep, sheetIndex, bom, crlf, dedup } });
    await once('merge_ready');

    // 2) feed files (séquentiel)
    for (let i = 0; i < files.length; i++) {
      activeFileIdx = i;
      const f = files[i];
      setProg((i / Math.max(files.length, 1)) * stageParseMax, `Lecture ${f.name}…`);
      log(`📥 + ${f.name} (${fmtBytes(f.size)})`);
      const buf = await f.arrayBuffer();
      worker.postMessage({ type: 'merge_add', buf, filename: f.name }, [buf]);
      const res = await once('merge_added');
      if (res && res.added != null) log(`➕ ${res.added} lignes ingérées (total unique: ${res.total || '—'})`);
    }

    // 3) emit CSV
    worker.postMessage({ type: 'merge_done' });
    await once('done');

    try { worker.terminate(); } catch (_) {}
  }

  async function run() {
    const files = elFiles.files ? [...elFiles.files] : [];
    if (!files.length) return;

    btnConvert.disabled = true;
    btnPickDir.disabled = true;
    btnClearDir.disabled = true;
    elFiles.disabled = true;

    log('— Début conversion —');
    try {
      if (elMerge && elMerge.checked) {
        await convertMerged(files);
      } else {
        for (let i = 0; i < files.length; i++) {
          await convertOneFile(files[i], i, files.length);
        }
      }
      setProg(100, `Terminé: ${files.length} fichier(s).`);
      log('— Terminé —');
    } catch (e) {
      log(`❌ ${e.message || e}`);
      setProg(0, 'Erreur. Voir logs.');
    } finally {
      btnConvert.disabled = false;
      btnPickDir.disabled = false;
      btnClearDir.disabled = false;
      elFiles.disabled = false;
    }
  }

  // ── UI wiring ──
  elFiles.addEventListener('change', updateFileListUI);
  btnConvert.addEventListener('click', () => { run(); });
  if (elMerge) elMerge.addEventListener('change', updateMergeUI);
  if (elDedup) elDedup.addEventListener('change', updateMergeUI);
  if (elSecondaryFiles) elSecondaryFiles.addEventListener('change', updateMergeUI);

  btnPickDir.addEventListener('click', async () => {
    if (!supportsDirPicker()) return;
    try {
      outDirHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
      log('📁 Dossier de sortie sélectionné.');
    } catch (e) {
      log(`⚠️ Dossier non sélectionné (${e && e.name ? e.name : 'annulé'}).`);
    }
    updateDirUI();
  });

  btnClearDir.addEventListener('click', () => {
    outDirHandle = null;
    log('📁 Mode dossier désactivé.');
    updateDirUI();
  });

  // ── Init ──
  elSupportBadge.textContent = supportsDirPicker() ? 'Chrome/Edge: mode dossier disponible' : 'Mode dossier indisponible';
  updateDirUI();
  updateFileListUI();
  updateMergeUI();
  setProg(0, 'En attente…');
})();
