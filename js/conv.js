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

  async function run() {
    const files = elFiles.files ? [...elFiles.files] : [];
    if (!files.length) return;

    btnConvert.disabled = true;
    btnPickDir.disabled = true;
    btnClearDir.disabled = true;
    elFiles.disabled = true;

    log('— Début conversion —');
    try {
      for (let i = 0; i < files.length; i++) {
        await convertOneFile(files[i], i, files.length);
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
  setProg(0, 'En attente…');
})();

