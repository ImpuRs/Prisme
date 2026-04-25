'use strict';

export function createConqueteOverviewController({ getMode, renderL2, renderL3, renderL4 }) {
  function toggleSecGrp(grpId) {
    const rows = document.querySelectorAll('.' + grpId);
    const arrow = document.getElementById(grpId + '-arrow');
    const firstSect = [...rows].find(r => !r.id.startsWith('overviewL2-'));
    const isOpen = firstSect && firstSect.style.display !== 'none';
    rows.forEach(r => {
      if (isOpen) {
        r.style.display = 'none';
      } else if (!r.id.startsWith('overviewL2-')) {
        r.style.display = 'table-row';
      }
    });
    if (arrow) arrow.textContent = isOpen ? '▶' : '▼';
  }

  function toggleOverviewL2(dirEnc, idx) {
    const row = document.getElementById('overviewL2-' + idx);
    if (!row) return;
    const arrow = document.getElementById('overviewL1Arrow-' + idx);
    const isOpen = row.style.display !== 'none';
    row.style.display = isOpen ? 'none' : 'table-row';
    if (arrow) arrow.textContent = isOpen ? '▼' : '▲';
    if (!isOpen) {
      const inner = document.getElementById('overviewL2Inner-' + idx);
      if (inner) renderL2(inner, decodeURIComponent(dirEnc));
    }
  }

  function toggleOverviewL3(dirEnc, mEnc, rowId) {
    const row = document.getElementById(rowId);
    if (!row) return;
    const arrow = document.getElementById(rowId + '-arrow');
    const isOpen = row.style.display !== 'none';
    row.style.display = isOpen ? 'none' : 'table-row';
    if (arrow) arrow.textContent = isOpen ? '▼' : '▲';
    if (!isOpen) {
      const inner = document.getElementById(rowId + '-inner');
      if (!inner) return;
      if (getMode() === 'secteur') {
        renderL4(inner, decodeURIComponent(dirEnc), decodeURIComponent(mEnc), decodeURIComponent(dirEnc));
      } else {
        renderL3(inner, decodeURIComponent(dirEnc), decodeURIComponent(mEnc));
      }
    }
  }

  function toggleOverviewL4(dirEnc, mEnc, sEnc, rowId) {
    const row = document.getElementById(rowId);
    if (!row) return;
    const arrow = document.getElementById(rowId + '-arrow');
    const isOpen = row.style.display !== 'none';
    row.style.display = isOpen ? 'none' : 'table-row';
    if (arrow) arrow.textContent = isOpen ? '▼' : '▲';
    if (!isOpen) {
      const inner = document.getElementById(rowId + '-inner');
      if (inner) renderL4(inner, decodeURIComponent(dirEnc), decodeURIComponent(mEnc), decodeURIComponent(sEnc));
    }
  }

  return { toggleSecGrp, toggleOverviewL2, toggleOverviewL3, toggleOverviewL4 };
}

export function installConqueteOverviewController(controller, target = window) {
  target._toggleSecGrp = controller.toggleSecGrp;
  target._toggleOverviewL2 = controller.toggleOverviewL2;
  target._toggleOverviewL3 = controller.toggleOverviewL3;
  target._toggleOverviewL4 = controller.toggleOverviewL4;
}
