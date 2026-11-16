/**
 * SIA AMS Chrome Wrapper & Crash-Guard — v1.1.4
 * draft-vault-ui.js — Simplified 1-line-per-editor-field Drafts modal.
 *
 * Each row represents 1 editor field (e.g. Initial ward examination, Epicrisis, Extras)
 * with ONLY 2 actions:
 *   - ✏️ Open  (opens that patient's page & exact editor directly)
 *   - ↺ Reset  (discards local draft & resets back to server text, with 5s Undo)
 *
 * API: window.__SIAAMS_VAULT_UI__ = {
 *   configure(ctx),
 *   openDraftHistoryModal(),
 *   openGlobalVaultManager(),
 *   scanAllDrafts()
 * }
 */
(function () {
  'use strict';
  if (window.__SIAAMS_VAULT_UI__) return;

  const t = (k, p) => (window.__SIAAMS_I18N__ ? window.__SIAAMS_I18N__.t(k, p) : k);
  const locale = () => (window.__SIAAMS_I18N__ ? window.__SIAAMS_I18N__.locale() : 'ro-RO');
  const DRAFT_PREFIX = 'siaams_draft_';

  let ctx = {
    getPageVaultInfo: () => ({ pageType: 'page', recordId: 'global', patientTitle: '', patientName: '', vaultKey: '' }),
    openEditorForField: () => {},
    resetFieldDraft: () => {},
    updateHistoryCountBadge: () => {},
    formatFriendlyFieldName: (id) => id
  };

  function configure(c) {
    ctx = { ...ctx, ...(c || {}) };
  }

  function escapeHtml(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function formatKB(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  function formatTime(ts) {
    if (!ts) return '';
    try { return new Date(ts).toLocaleString(locale()); } catch (_e) { return ''; }
  }

  let activeUndoTimer = null;
  function showToast(msg, undoFn) {
    let host = document.getElementById('siaams-vault-toast');
    if (host) host.remove();
    if (activeUndoTimer) { clearTimeout(activeUndoTimer); activeUndoTimer = null; }

    host = document.createElement('div');
    host.id = 'siaams-vault-toast';
    host.className = 'siaams-vault-toast';
    host.innerHTML = `
      <span>${escapeHtml(msg)}</span>
      ${undoFn ? `<button type="button" class="siaams-toast-undo">${escapeHtml(t('common.undo'))}</button>` : ''}
    `;
    document.body.appendChild(host);

    if (undoFn) {
      host.querySelector('.siaams-toast-undo')?.addEventListener('click', () => {
        if (activeUndoTimer) { clearTimeout(activeUndoTimer); activeUndoTimer = null; }
        host.remove();
        undoFn();
      });
    }

    activeUndoTimer = setTimeout(() => {
      host.remove();
      activeUndoTimer = null;
    }, 5500);
  }

  function scanAllDrafts() {
    const items = [];
    let totalBytes = 0;

    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k) continue;
      const val = localStorage.getItem(k) || '';
      totalBytes += (k.length + val.length) * 2;
      if (!k.startsWith(DRAFT_PREFIX)) continue;
      try {
        const d = JSON.parse(val);
        if (!d || !d.fieldId) continue;
        items.push({
          key: k,
          pageType: d.pageType || 'page',
          recordId: d.recordId || 'global',
          fieldId: d.fieldId,
          pageUrl: d.pageUrl || '',
          editorMode: d.editorMode || 'ckeditor',
          patientName: d.patientName || d.patientTitle || `${d.pageType || 'page'} #${d.recordId || ''}`,
          patientTitle: d.patientTitle || '',
          stepsCount: Array.isArray(d.checkpoints) ? d.checkpoints.length : 1,
          updatedAt: d.updatedAt || d.createdAt || 0,
          bytes: (k.length + val.length) * 2,
          draft: d
        });
      } catch (_e) {}
    }

    items.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    return { items, totalBytes };
  }

  let activeModalRefresh = null;

  function openDraftsModal({ onlyCurrentRecord = false } = {}) {
    const existing = document.getElementById('siaams-vault-manager-backdrop');
    if (existing) existing.remove();
    document.getElementById('siaams-history-modal-backdrop')?.remove();

    const curInfo = ctx.getPageVaultInfo();
    const backdrop = document.createElement('div');
    backdrop.id = 'siaams-vault-manager-backdrop';
    document.body.appendChild(backdrop);

    function render() {
      const { items: allItems, totalBytes } = scanAllDrafts();
      const items = onlyCurrentRecord
        ? allItems.filter((x) => x.pageType === curInfo.pageType && String(x.recordId) === String(curInfo.recordId))
        : allItems;

      const quota = 5 * 1024 * 1024;
      const pct = Math.min(100, Math.round((totalBytes / quota) * 100));
      const titleText = onlyCurrentRecord
        ? t('vault.historyTitle', { title: curInfo.patientName || curInfo.patientTitle })
        : t('vault.managerTitle');

      backdrop.innerHTML = `
        <div class="siaams-history-modal siaams-vault-manager-modal" role="dialog" aria-modal="true">
          <div class="siaams-history-header">
            <h3>${escapeHtml(titleText)}</h3>
            <div class="siaams-history-header-right">
              ${onlyCurrentRecord ? `<button type="button" id="siaams-mgr-show-all" class="siaams-btn-subtle">${escapeHtml(t('topbar.allDrafts'))}</button>` : ''}
              <button type="button" id="siaams-mgr-close" class="siaams-btn-close" aria-label="${escapeHtml(t('common.close'))}">✕</button>
            </div>
          </div>
          <div class="siaams-vault-storage-bar">
            <div class="siaams-vault-storage-meta">
              <span>${escapeHtml(t('vault.storage', { used: formatKB(totalBytes), pct }))}</span>
              <div class="siaams-vault-purge-group">
                ${items.length > 0 ? `
                  <button type="button" id="siaams-mgr-reset-all" class="siaams-vault-btn siaams-vault-btn-danger-outline">
                    ${escapeHtml(t('vault.resetAll'))} (${items.length})
                  </button>
                ` : ''}
              </div>
            </div>
            <div class="siaams-vault-meter"><div class="siaams-vault-meter-fill" style="width:${Math.max(2, pct)}%"></div></div>
          </div>
          <div class="siaams-history-body">
            ${items.length === 0 ? `
              <p class="siaams-empty-history">${escapeHtml(onlyCurrentRecord ? t('vault.empty') : t('vault.managerEmpty'))}</p>
            ` : `
              <table class="siaams-vault-table">
                <thead>
                  <tr>
                    <th>${escapeHtml(t('vault.colRecord'))}</th>
                    <th>${escapeHtml(t('vault.colSteps'))}</th>
                    <th>${escapeHtml(t('vault.colLast'))}</th>
                    <th>${escapeHtml(t('vault.colSize'))}</th>
                    <th>${escapeHtml(t('vault.colActions'))}</th>
                  </tr>
                </thead>
                <tbody>
                  ${items.map((item, idx) => {
                    const isCur = item.pageType === curInfo.pageType && String(item.recordId) === String(curInfo.recordId);
                    const typeLabel = t(`vault.pageType.${item.pageType}`);
                    const fieldLabel = ctx.formatFriendlyFieldName(item.fieldId);
                    return `
                      <tr data-draft-idx="${idx}" data-field-id="${escapeHtml(item.fieldId)}" class="${isCur ? 'siaams-vault-row-current' : ''}">
                        <td>
                          <strong>${escapeHtml(item.patientName)}</strong>
                          <span class="siaams-vault-type-badge">${escapeHtml(typeLabel)}</span>
                          ${isCur ? `<span class="siaams-vault-cur-badge">${escapeHtml(t('vault.currentPage'))}</span>` : ''}
                          <div class="siaams-vault-action-sub">${escapeHtml(fieldLabel)}</div>
                        </td>
                        <td>${escapeHtml(t('vault.stepsCount', { n: item.stepsCount }))}</td>
                        <td>${escapeHtml(formatTime(item.updatedAt))}</td>
                        <td>${escapeHtml(formatKB(item.bytes))}</td>
                        <td class="siaams-vault-actions-cell">
                          <button type="button" class="siaams-vault-btn siaams-vault-btn-view" data-draft-open="${idx}">
                            ${escapeHtml(t('vault.openInEditor'))}
                          </button>
                          <button type="button" class="siaams-vault-btn siaams-vault-btn-danger-outline" data-draft-reset="${idx}">
                            ${escapeHtml(t('vault.resetDraft'))}
                          </button>
                        </td>
                      </tr>
                    `;
                  }).join('')}
                </tbody>
              </table>
            `}
          </div>
        </div>
      `;

      document.getElementById('siaams-mgr-close')?.addEventListener('click', close);
      document.getElementById('siaams-mgr-show-all')?.addEventListener('click', () => {
        close();
        openDraftsModal({ onlyCurrentRecord: false });
      });

      backdrop.querySelectorAll('[data-draft-open]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const item = items[Number(btn.getAttribute('data-draft-open'))];
          if (!item) return;
          const isCur = item.pageType === curInfo.pageType && String(item.recordId) === String(curInfo.recordId);
          close();
          if (isCur) {
            ctx.openEditorForField(item.fieldId, item.editorMode);
          } else if (item.pageUrl) {
            try {
              sessionStorage.setItem('siaams_pending_open_editor', JSON.stringify({
                fieldId: item.fieldId,
                editorMode: item.editorMode,
                pageType: item.pageType,
                recordId: item.recordId
              }));
            } catch (_e) {}
            window.location.href = item.pageUrl;
          }
        });
      });

      backdrop.querySelectorAll('[data-draft-reset]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const item = items[Number(btn.getAttribute('data-draft-reset'))];
          if (!item) return;
          const backupRaw = localStorage.getItem(item.key);
          const isCur = item.pageType === curInfo.pageType && String(item.recordId) === String(curInfo.recordId);
          if (isCur && typeof ctx.resetFieldDraft === 'function') {
            ctx.resetFieldDraft(item.fieldId, true);
          } else {
            localStorage.removeItem(item.key);
            ctx.updateHistoryCountBadge();
          }
          render();
          showToast(t('vault.deleted', { n: 1 }), () => {
            if (backupRaw !== null) localStorage.setItem(item.key, backupRaw);
            ctx.updateHistoryCountBadge();
            if (isCur && typeof ctx.syncCurrentPageDrafts === 'function') ctx.syncCurrentPageDrafts();
            render();
          });
        });
      });

      document.getElementById('siaams-mgr-reset-all')?.addEventListener('click', () => {
        if (!window.confirm(t('vault.confirmResetAll'))) return;
        const backups = {};
        items.forEach((item) => {
          backups[item.key] = localStorage.getItem(item.key);
          const isCur = item.pageType === curInfo.pageType && String(item.recordId) === String(curInfo.recordId);
          if (isCur && typeof ctx.resetFieldDraft === 'function') {
            ctx.resetFieldDraft(item.fieldId, true);
          } else {
            localStorage.removeItem(item.key);
          }
        });
        ctx.updateHistoryCountBadge();
        render();
        showToast(t('vault.deleted', { n: items.length }), () => {
          Object.entries(backups).forEach(([ k, v ]) => {
            if (v !== null) localStorage.setItem(k, v);
          });
          ctx.updateHistoryCountBadge();
          if (typeof ctx.syncCurrentPageDrafts === 'function') ctx.syncCurrentPageDrafts();
          render();
        });
      });
    }

    function close() {
      activeModalRefresh = null;
      backdrop.remove();
    }

    backdrop.addEventListener('click', (e) => { if (e.target === backdrop) close(); });
    activeModalRefresh = render;
    render();
  }

  if (window.__SIAAMS_I18N__) {
    window.__SIAAMS_I18N__.onChange(() => {
      if (typeof activeModalRefresh === 'function') activeModalRefresh();
    });
  }

  window.__SIAAMS_VAULT_UI__ = {
    configure,
    openDraftHistoryModal: () => openDraftsModal({ onlyCurrentRecord: true }),
    openGlobalVaultManager: () => openDraftsModal({ onlyCurrentRecord: false }),
    scanAllDrafts
  };
})();