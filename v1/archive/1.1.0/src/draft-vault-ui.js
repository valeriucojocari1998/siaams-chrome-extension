/**
 * SIA AMS Chrome Wrapper & Crash-Guard — v1.1.0
 * draft-vault-ui.js — Draft History modal (delete + bulk delete + undo), Global Drafts Manager,
 * and Copy-Only Draft Viewer (rich-editor powered, never touches server).
 *
 * API: window.__SIAAMS_VAULT_UI__ = {
 *   configure(ctx),           // ctx: { getPageVaultInfo, restoreSnapshotToDom, updateHistoryCountBadge, formatFriendlyFieldName }
 *   openDraftHistoryModal(infoOverride, fromManager),
 *   openGlobalVaultManager(),
 *   openDraftViewerModal(snapshot, initialFieldKey)
 * }
 */
(function () {
  'use strict';
  if (window.__SIAAMS_VAULT_UI__) return;

  const t = (k, p) => (window.__SIAAMS_I18N__ ? window.__SIAAMS_I18N__.t(k, p) : k);
  const locale = () => (window.__SIAAMS_I18N__ ? window.__SIAAMS_I18N__.locale() : 'ro-RO');

  let ctx = {
    getPageVaultInfo: () => ({ pageType: 'page', recordId: 'global', patientTitle: '', vaultKey: '', historyKey: '' }),
    restoreSnapshotToDom: () => {},
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

  function stripHtmlTags(html) {
    const tmp = document.createElement('div');
    tmp.innerHTML = String(html || '');
    return (tmp.textContent || tmp.innerText || '').replace(/\s+/g, ' ').trim();
  }

  function formatKB(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  function formatTime(snap) {
    if (snap && snap.timestamp) {
      try { return new Date(snap.timestamp).toLocaleString(locale()); } catch (_e) {}
    }
    return (snap && snap.timeFormatted) || '';
  }

  // ---------------------------------------------------------------------------
  // Storage helpers + Undo toast
  // ---------------------------------------------------------------------------
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

  function readHistoryList(historyKey) {
    try {
      const raw = localStorage.getItem(historyKey);
      return raw ? JSON.parse(raw) : [];
    } catch (_e) {
      return [];
    }
  }

  function writeHistoryAndSyncLatest(vaultKey, historyKey, newList) {
    const curInfo = ctx.getPageVaultInfo();
    try {
      if (!newList || newList.length === 0) {
        localStorage.removeItem(historyKey);
        localStorage.removeItem(vaultKey);
        if (curInfo.vaultKey === vaultKey) {
          document.getElementById('siaams-crash-recovery-banner')?.remove();
        }
      } else {
        localStorage.setItem(historyKey, JSON.stringify(newList));
        // Keep latest snapshot in sync with history head
        localStorage.setItem(vaultKey, JSON.stringify(newList[0]));
      }
    } catch (e) {
      console.warn('[SIAAMS Vault] writeHistoryAndSyncLatest error:', e);
    }
    ctx.updateHistoryCountBadge();
  }

  function snapshotStorageState(keys) {
    const backup = {};
    keys.forEach((k) => {
      if (!k) return;
      backup[k] = localStorage.getItem(k);
    });
    return backup;
  }

  function restoreStorageState(backup, afterRestore) {
    Object.entries(backup).forEach(([ k, v ]) => {
      try {
        if (v === null || v === undefined) localStorage.removeItem(k);
        else localStorage.setItem(k, v);
      } catch (_e) {}
    });
    ctx.updateHistoryCountBadge();
    if (typeof afterRestore === 'function') afterRestore();
  }

  function scanAllVaultRecords() {
    const recordsMap = new Map();
    let totalBytes = 0;

    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k) continue;
      const val = localStorage.getItem(k) || '';
      totalBytes += (k.length + val.length) * 2;

      if (k.startsWith('siaams_vault_hist_')) {
        const suffix = k.slice('siaams_vault_hist_'.length);
        const vaultKey = `siaams_vault_${suffix}`;
        let list = [];
        try { list = JSON.parse(val) || []; } catch (_e) { list = []; }
        if (!Array.isArray(list) || list.length === 0) continue;
        const head = list[0] || {};
        const unsyncedCount = list.filter((x) => !x.syncedToServer).length;
        const rawVault = localStorage.getItem(vaultKey) || '';
        const bytes = (k.length + val.length + vaultKey.length + rawVault.length) * 2;
        const parts = suffix.split('_');
        const pageType = head.pageType || parts[0] || 'page';
        const recordId = head.recordId || parts.slice(1).join('_') || suffix;
        recordsMap.set(k, {
          historyKey: k,
          vaultKey,
          pageType,
          recordId,
          patientTitle: head.patientTitle || `${pageType.toUpperCase()} #${recordId}`,
          versionsCount: list.length,
          unsyncedCount,
          lastTimestamp: head.timestamp || 0,
          lastTimeFormatted: formatTime(head),
          bytes,
          list
        });
      }
    }

    // Also include orphan siaams_vault_<page>_<id> without history key
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k || !k.startsWith('siaams_vault_') || k.startsWith('siaams_vault_hist_')) continue;
      const suffix = k.slice('siaams_vault_'.length);
      const histKey = `siaams_vault_hist_${suffix}`;
      if (recordsMap.has(histKey)) continue;
      try {
        const raw = localStorage.getItem(k) || '';
        const snap = JSON.parse(raw);
        if (!snap || !snap.changedFields) continue;
        recordsMap.set(histKey, {
          historyKey: histKey,
          vaultKey: k,
          pageType: snap.pageType || 'page',
          recordId: snap.recordId || suffix,
          patientTitle: snap.patientTitle || suffix,
          versionsCount: 1,
          unsyncedCount: snap.syncedToServer ? 0 : 1,
          lastTimestamp: snap.timestamp || 0,
          lastTimeFormatted: formatTime(snap),
          bytes: (k.length + raw.length) * 2,
          list: [ snap ]
        });
      } catch (_e) {}
    }

    const records = Array.from(recordsMap.values()).sort((a, b) => (b.lastTimestamp || 0) - (a.lastTimestamp || 0));
    return { records, totalBytes };
  }

  // ---------------------------------------------------------------------------
  // 1. Per-Record Draft History Modal (with single/bulk/all delete + viewer)
  // ---------------------------------------------------------------------------
  let activeModalRefresh = null;

  function openDraftHistoryModal(infoOverride = null, fromManager = false) {
    const existing = document.getElementById('siaams-history-modal-backdrop');
    if (existing) existing.remove();

    const curPageInfo = ctx.getPageVaultInfo();
    const info = infoOverride || curPageInfo;
    const isSameRecordAsPage = info.vaultKey === curPageInfo.vaultKey && curPageInfo.isClinicalForm;
    const selected = new Set();

    const backdrop = document.createElement('div');
    backdrop.id = 'siaams-history-modal-backdrop';
    document.body.appendChild(backdrop);

    function render() {
      const list = readHistoryList(info.historyKey);
      // Drop out-of-range selected indices
      Array.from(selected).forEach((idx) => { if (idx >= list.length) selected.delete(idx); });

      const syncedCount = list.filter((x) => x.syncedToServer).length;
      backdrop.innerHTML = `
        <div class="siaams-history-modal" role="dialog" aria-modal="true">
          <div class="siaams-history-header">
            <div class="siaams-history-header-left">
              ${fromManager ? `<button type="button" id="siaams-history-back" class="siaams-btn-subtle siaams-btn-back">${escapeHtml(t('vault.back'))}</button>` : ''}
              <h3>${escapeHtml(t('vault.historyTitle', { title: info.patientTitle }))}</h3>
            </div>
            <div class="siaams-history-header-right">
              <button type="button" id="siaams-history-open-all" class="siaams-btn-subtle">${escapeHtml(t('topbar.allDrafts'))}</button>
              <button type="button" id="siaams-history-close" class="siaams-btn-close" aria-label="${escapeHtml(t('common.close'))}">✕</button>
            </div>
          </div>
          ${list.length > 0 ? `
            <div class="siaams-vault-bulkbar">
              <label class="siaams-vault-checkall">
                <input type="checkbox" id="siaams-vault-select-all" ${selected.size === list.length && list.length > 0 ? 'checked' : ''} />
                <span>${escapeHtml(t('vault.selectAll'))} (${list.length})</span>
              </label>
              <div class="siaams-vault-bulk-actions">
                <button type="button" id="siaams-vault-del-selected" class="siaams-vault-btn siaams-vault-btn-danger" ${selected.size === 0 ? 'disabled' : ''}>
                  ${escapeHtml(t('vault.deleteSelected', { n: selected.size }))}
                </button>
                <button type="button" id="siaams-vault-del-synced" class="siaams-vault-btn" ${syncedCount === 0 ? 'disabled' : ''}>
                  ${escapeHtml(t('vault.deleteSynced'))} (${syncedCount})
                </button>
                <button type="button" id="siaams-vault-del-all" class="siaams-vault-btn siaams-vault-btn-danger-outline">
                  ${escapeHtml(t('vault.deleteAll'))}
                </button>
              </div>
            </div>
          ` : ''}
          <div class="siaams-history-body">
            ${list.length === 0 ? `
              <p class="siaams-empty-history">${escapeHtml(t('vault.empty'))}</p>
            ` : list.map((item, idx) => {
              const fieldIds = item.changedFieldNames || Object.keys(item.changedFields || {});
              const fieldsStr = fieldIds.map(ctx.formatFriendlyFieldName).join(', ');
              const sampleText = Object.values(item.changedFields || {})[0] || '';
              const cleanExcerpt = stripHtmlTags(sampleText).substring(0, 220);
              const checked = selected.has(idx) ? 'checked' : '';
              return `
                <div class="siaams-history-card ${selected.has(idx) ? 'selected' : ''}" data-card-idx="${idx}">
                  <div class="siaams-history-meta">
                    <label class="siaams-history-check">
                      <input type="checkbox" class="siaams-vault-item-check" data-idx="${idx}" ${checked} />
                      <strong>#${idx + 1} — ${escapeHtml(formatTime(item))}</strong>
                    </label>
                    <span class="siaams-history-fields">${escapeHtml(t('vault.fields', { fields: fieldsStr }))}</span>
                    <span class="siaams-history-status ${item.syncedToServer ? 'synced' : 'unsynced'}">
                      ${escapeHtml(item.syncedToServer ? t('vault.synced') : t('vault.localOnly'))}
                    </span>
                  </div>
                  <div class="siaams-history-excerpt">${escapeHtml(cleanExcerpt)}${cleanExcerpt.length >= 220 ? '…' : ''}</div>
                  <div class="siaams-history-card-actions">
                    <button type="button" class="siaams-vault-btn siaams-vault-btn-view" data-view-idx="${idx}">
                      ${escapeHtml(t('vault.open'))}
                    </button>
                    <button type="button" class="siaams-btn-restore-idx" data-idx="${idx}" ${isSameRecordAsPage ? '' : `disabled title="${escapeHtml(t('vault.restoreDisabled'))}"`}>
                      ${escapeHtml(t('vault.restore'))}
                    </button>
                    <button type="button" class="siaams-vault-btn siaams-vault-btn-danger-outline" data-del-idx="${idx}">
                      ${escapeHtml(t('vault.delete'))}
                    </button>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        </div>
      `;

      // Wire events
      document.getElementById('siaams-history-close')?.addEventListener('click', close);
      document.getElementById('siaams-history-back')?.addEventListener('click', () => {
        close();
        openGlobalVaultManager();
      });
      document.getElementById('siaams-history-open-all')?.addEventListener('click', () => {
        close();
        openGlobalVaultManager();
      });

      document.getElementById('siaams-vault-select-all')?.addEventListener('change', (e) => {
        selected.clear();
        if (e.target.checked) list.forEach((_, i) => selected.add(i));
        render();
      });

      backdrop.querySelectorAll('.siaams-vault-item-check').forEach((cb) => {
        cb.addEventListener('change', () => {
          const i = Number(cb.dataset.idx);
          if (cb.checked) selected.add(i);
          else selected.delete(i);
          render();
        });
      });

      // Single open viewer
      backdrop.querySelectorAll('[data-view-idx]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const idx = Number(btn.getAttribute('data-view-idx'));
          if (list[idx]) openDraftViewerModal(list[idx], null, isSameRecordAsPage);
        });
      });

      // Single restore
      backdrop.querySelectorAll('.siaams-btn-restore-idx').forEach((btn) => {
        btn.addEventListener('click', () => {
          if (!isSameRecordAsPage) return;
          const idx = Number(btn.getAttribute('data-idx'));
          if (list[idx]) {
            ctx.restoreSnapshotToDom(list[idx]);
            close();
          }
        });
      });

      // Single delete
      backdrop.querySelectorAll('[data-del-idx]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const idx = Number(btn.getAttribute('data-del-idx'));
          deleteByIndices([ idx ], false);
        });
      });

      // Bulk delete selected
      document.getElementById('siaams-vault-del-selected')?.addEventListener('click', () => {
        if (selected.size === 0) return;
        deleteByIndices(Array.from(selected), true);
      });

      // Delete synced
      document.getElementById('siaams-vault-del-synced')?.addEventListener('click', () => {
        const idxs = list.map((it, i) => (it.syncedToServer ? i : -1)).filter((i) => i >= 0);
        if (!idxs.length) return;
        deleteByIndices(idxs, true);
      });

      // Delete all for this record
      document.getElementById('siaams-vault-del-all')?.addEventListener('click', () => {
        if (!window.confirm(t('vault.confirmDeleteAll', { title: info.patientTitle }))) return;
        const backup = snapshotStorageState([ info.vaultKey, info.historyKey ]);
        const count = list.length;
        selected.clear();
        writeHistoryAndSyncLatest(info.vaultKey, info.historyKey, []);
        render();
        showToast(t('vault.deleted', { n: count }), () => restoreStorageState(backup, render));
      });

      function deleteByIndices(indices, askConfirm) {
        if (!indices.length) return;
        if (askConfirm && !window.confirm(t('vault.confirmDelete', { n: indices.length }))) return;
        const backup = snapshotStorageState([ info.vaultKey, info.historyKey ]);
        const rmSet = new Set(indices);
        const remaining = list.filter((_, i) => !rmSet.has(i));
        selected.clear();
        writeHistoryAndSyncLatest(info.vaultKey, info.historyKey, remaining);
        render();
        showToast(t('vault.deleted', { n: indices.length }), () => restoreStorageState(backup, render));
      }
    }

    function close() {
      activeModalRefresh = null;
      backdrop.remove();
    }

    backdrop.addEventListener('click', (e) => { if (e.target === backdrop) close(); });
    activeModalRefresh = render;
    render();
  }

  // ---------------------------------------------------------------------------
  // 2. Global Vault Manager (all patients / records across localStorage)
  // ---------------------------------------------------------------------------
  function openGlobalVaultManager() {
    const existing = document.getElementById('siaams-vault-manager-backdrop');
    if (existing) existing.remove();

    const curInfo = ctx.getPageVaultInfo();
    const backdrop = document.createElement('div');
    backdrop.id = 'siaams-vault-manager-backdrop';
    document.body.appendChild(backdrop);

    function render() {
      const { records, totalBytes } = scanAllVaultRecords();
      const quota = 5 * 1024 * 1024;
      const pct = Math.min(100, Math.round((totalBytes / quota) * 100));

      backdrop.innerHTML = `
        <div class="siaams-history-modal siaams-vault-manager-modal" role="dialog" aria-modal="true">
          <div class="siaams-history-header">
            <h3>${escapeHtml(t('vault.managerTitle'))}</h3>
            <button type="button" id="siaams-mgr-close" class="siaams-btn-close" aria-label="${escapeHtml(t('common.close'))}">✕</button>
          </div>
          <div class="siaams-vault-storage-bar">
            <div class="siaams-vault-storage-meta">
              <span>${escapeHtml(t('vault.storage', { used: formatKB(totalBytes), pct }))}</span>
              <div class="siaams-vault-purge-group">
                <span>${escapeHtml(t('vault.olderThan'))}</span>
                <button type="button" class="siaams-vault-btn" data-purge-days="7">${escapeHtml(t('vault.days', { n: 7 }))}</button>
                <button type="button" class="siaams-vault-btn" data-purge-days="14">${escapeHtml(t('vault.days', { n: 14 }))}</button>
                <button type="button" class="siaams-vault-btn" data-purge-days="30">${escapeHtml(t('vault.days', { n: 30 }))}</button>
                <button type="button" id="siaams-mgr-purge-synced" class="siaams-vault-btn siaams-vault-btn-danger-outline">
                  ${escapeHtml(t('vault.deleteAllSynced'))}
                </button>
              </div>
            </div>
            <div class="siaams-vault-meter"><div class="siaams-vault-meter-fill" style="width:${Math.max(2, pct)}%"></div></div>
          </div>
          <div class="siaams-history-body">
            ${records.length === 0 ? `
              <p class="siaams-empty-history">${escapeHtml(t('vault.managerEmpty'))}</p>
            ` : `
              <table class="siaams-vault-table">
                <thead>
                  <tr>
                    <th>${escapeHtml(t('vault.colRecord'))}</th>
                    <th>${escapeHtml(t('vault.colVersions'))}</th>
                    <th>${escapeHtml(t('vault.colUnsynced'))}</th>
                    <th>${escapeHtml(t('vault.colLast'))}</th>
                    <th>${escapeHtml(t('vault.colSize'))}</th>
                    <th>${escapeHtml(t('vault.colActions'))}</th>
                  </tr>
                </thead>
                <tbody>
                  ${records.map((rec, idx) => {
                    const isCur = rec.vaultKey === curInfo.vaultKey;
                    const typeLabel = t(`vault.pageType.${rec.pageType}`);
                    return `
                      <tr data-rec-idx="${idx}" class="${isCur ? 'siaams-vault-row-current' : ''}">
                        <td>
                          <strong>${escapeHtml(rec.patientTitle)}</strong>
                          <span class="siaams-vault-type-badge">${escapeHtml(typeLabel)} #${escapeHtml(rec.recordId)}</span>
                          ${isCur ? `<span class="siaams-vault-cur-badge">${escapeHtml(t('vault.currentPage'))}</span>` : ''}
                        </td>
                        <td>${rec.versionsCount}</td>
                        <td>
                          <span class="siaams-history-status ${rec.unsyncedCount === 0 ? 'synced' : 'unsynced'}">
                            ${rec.unsyncedCount}
                          </span>
                        </td>
                        <td>${escapeHtml(rec.lastTimeFormatted)}</td>
                        <td>${escapeHtml(formatKB(rec.bytes))}</td>
                        <td class="siaams-vault-actions-cell">
                          <button type="button" class="siaams-vault-btn siaams-vault-btn-view" data-mgr-view="${idx}">
                            ${escapeHtml(t('vault.open'))}
                          </button>
                          <button type="button" class="siaams-vault-btn" data-mgr-hist="${idx}">
                            ${escapeHtml(t('vault.openHistory'))}
                          </button>
                          <button type="button" class="siaams-vault-btn siaams-vault-btn-danger-outline" data-mgr-del="${idx}">
                            ${escapeHtml(t('vault.deleteRecord'))}
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

      backdrop.querySelectorAll('[data-mgr-view]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const rec = records[Number(btn.getAttribute('data-mgr-view'))];
          if (rec && rec.list[0]) {
            openDraftViewerModal(rec.list[0], null, rec.vaultKey === curInfo.vaultKey && curInfo.isClinicalForm);
          }
        });
      });

      backdrop.querySelectorAll('[data-mgr-hist]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const rec = records[Number(btn.getAttribute('data-mgr-hist'))];
          if (!rec) return;
          close();
          openDraftHistoryModal({
            pageType: rec.pageType,
            recordId: rec.recordId,
            patientTitle: rec.patientTitle,
            vaultKey: rec.vaultKey,
            historyKey: rec.historyKey,
            isClinicalForm: rec.vaultKey === curInfo.vaultKey && curInfo.isClinicalForm
          }, true);
        });
      });

      backdrop.querySelectorAll('[data-mgr-del]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const rec = records[Number(btn.getAttribute('data-mgr-del'))];
          if (!rec) return;
          if (!window.confirm(t('vault.confirmRecord', { title: rec.patientTitle }))) return;
          const backup = snapshotStorageState([ rec.vaultKey, rec.historyKey ]);
          writeHistoryAndSyncLatest(rec.vaultKey, rec.historyKey, []);
          render();
          showToast(t('vault.deleted', { n: rec.versionsCount }), () => restoreStorageState(backup, render));
        });
      });

      backdrop.querySelectorAll('[data-purge-days]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const days = Number(btn.getAttribute('data-purge-days'));
          if (!window.confirm(t('vault.confirmOlder', { n: days }))) return;
          const cutoff = Date.now() - days * 86400 * 1000;
          purgeAcrossAll((snap) => (snap.timestamp || 0) > 0 && snap.timestamp < cutoff);
        });
      });

      document.getElementById('siaams-mgr-purge-synced')?.addEventListener('click', () => {
        if (!window.confirm(t('vault.confirmSyncedAll'))) return;
        purgeAcrossAll((snap) => Boolean(snap.syncedToServer));
      });

      function purgeAcrossAll(shouldDelete) {
        const allKeys = [];
        records.forEach((r) => allKeys.push(r.vaultKey, r.historyKey));
        const backup = snapshotStorageState(allKeys);
        let removed = 0;
        records.forEach((r) => {
          const kept = r.list.filter((s) => {
            const del = shouldDelete(s);
            if (del) removed++;
            return !del;
          });
          writeHistoryAndSyncLatest(r.vaultKey, r.historyKey, kept);
        });
        render();
        if (removed > 0) {
          showToast(t('vault.deleted', { n: removed }), () => restoreStorageState(backup, render));
        } else {
          showToast(t('vault.nothing'));
        }
      }
    }

    function close() {
      activeModalRefresh = null;
      backdrop.remove();
    }

    backdrop.addEventListener('click', (e) => { if (e.target === backdrop) close(); });
    activeModalRefresh = render;
    render();
  }

  // ---------------------------------------------------------------------------
  // 3. Copy-Only Draft Viewer Modal (powered by __SIAAMS_RTE__, zero server writes)
  // ---------------------------------------------------------------------------
  function openDraftViewerModal(snapshot, initialFieldKey = null, canInsertIntoPage = null) {
    if (!snapshot || !snapshot.changedFields) return;
    const existing = document.getElementById('siaams-draft-viewer-backdrop');
    if (existing) existing.remove();

    const curInfo = ctx.getPageVaultInfo();
    const allowInsert = canInsertIntoPage !== null
      ? canInsertIntoPage
      : (snapshot.vaultKey === curInfo.vaultKey && curInfo.isClinicalForm);

    const fieldKeys = Object.keys(snapshot.changedFields);
    if (fieldKeys.length === 0) return;

    // Working local copy of fields so edits inside the viewer never mutate the stored snapshot
    const workingCopy = { ...snapshot.changedFields };
    let activeKey = initialFieldKey && workingCopy[initialFieldKey] !== undefined ? initialFieldKey : fieldKeys[0];
    let rteCtrl = null;

    const backdrop = document.createElement('div');
    backdrop.id = 'siaams-draft-viewer-backdrop';
    backdrop.innerHTML = `
      <div class="siaams-viewer-modal" role="dialog" aria-modal="true">
        <div class="siaams-history-header">
          <div>
            <h3>${escapeHtml(t('viewer.title', { time: formatTime(snapshot) }))}</h3>
            <div class="siaams-viewer-sub">${escapeHtml(snapshot.patientTitle || '')} — ${escapeHtml(t('viewer.hint'))}</div>
          </div>
          <button type="button" id="siaams-viewer-close" class="siaams-btn-close" aria-label="${escapeHtml(t('common.close'))}">✕</button>
        </div>
        <div class="siaams-viewer-tabs" role="tablist">
          ${fieldKeys.map((k) => `
            <button type="button" role="tab" class="siaams-viewer-tab ${k === activeKey ? 'active' : ''}" data-field-key="${escapeHtml(k)}">
              ${escapeHtml(ctx.formatFriendlyFieldName(k))}
            </button>
          `).join('')}
        </div>
        <div id="siaams-viewer-toolbar-slot" class="siaams-viewer-toolbar-slot"></div>
        <div id="siaams-viewer-editor" class="siaams-viewer-editor" contenteditable="true" spellcheck="false"></div>
        <div class="siaams-viewer-footer">
          <div class="siaams-viewer-footer-left">
            <button type="button" id="siaams-viewer-copy-rich" class="siaams-cke-btn siaams-cke-btn-primary">
              ${escapeHtml(t('viewer.copyRich'))}
            </button>
            <button type="button" id="siaams-viewer-copy-plain" class="siaams-cke-btn siaams-cke-btn-secondary">
              ${escapeHtml(t('viewer.copyPlain'))}
            </button>
            <span id="siaams-viewer-status" class="siaams-viewer-status"></span>
          </div>
          <div class="siaams-viewer-footer-right">
            ${allowInsert ? `
              <button type="button" id="siaams-viewer-insert" class="siaams-cke-btn siaams-cke-btn-helper">
                ${escapeHtml(t('viewer.insert'))}
              </button>
            ` : ''}
            <button type="button" id="siaams-viewer-close-btn" class="siaams-cke-btn siaams-cke-btn-cancel">
              ${escapeHtml(t('common.close'))}
            </button>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(backdrop);

    const editorEl = document.getElementById('siaams-viewer-editor');
    const toolbarSlot = document.getElementById('siaams-viewer-toolbar-slot');
    const statusEl = document.getElementById('siaams-viewer-status');

    function loadField(key) {
      activeKey = key;
      backdrop.querySelectorAll('.siaams-viewer-tab').forEach((tab) => {
        tab.classList.toggle('active', tab.getAttribute('data-field-key') === key);
      });
      const val = String(workingCopy[key] ?? '');
      // Plain text inputs vs HTML fields
      editorEl.innerHTML = /<[a-z][\s\S]*>/i.test(val) ? val : escapeHtml(val).replace(/\n/g, '<br>');
      if (rteCtrl) rteCtrl.refresh();
    }

    editorEl.addEventListener('input', () => {
      workingCopy[activeKey] = editorEl.innerHTML;
    });

    if (window.__SIAAMS_RTE__) {
      rteCtrl = window.__SIAAMS_RTE__.attach(editorEl, {
        mount: (tb) => toolbarSlot.appendChild(tb),
        onChange: () => { workingCopy[activeKey] = editorEl.innerHTML; }
      });
    }

    loadField(activeKey);

    backdrop.querySelectorAll('.siaams-viewer-tab').forEach((tab) => {
      tab.addEventListener('click', () => {
        workingCopy[activeKey] = editorEl.innerHTML;
        loadField(tab.getAttribute('data-field-key'));
      });
    });

    async function copyContent(asRich) {
      const html = editorEl.innerHTML;
      const plain = (editorEl.innerText || editorEl.textContent || '').trim();
      try {
        if (asRich && navigator.clipboard && window.ClipboardItem) {
          const item = new ClipboardItem({
            'text/html': new Blob([ html ], { type: 'text/html' }),
            'text/plain': new Blob([ plain ], { type: 'text/plain' })
          });
          await navigator.clipboard.write([ item ]);
        } else if (navigator.clipboard && navigator.clipboard.writeText) {
          await navigator.clipboard.writeText(plain);
        } else {
          throw new Error('Clipboard API unavailable');
        }
        flashStatus(t('viewer.copied'));
      } catch (_e) {
        // Fallback via selection + execCommand('copy')
        try {
          const sel = window.getSelection();
          const r = document.createRange();
          r.selectNodeContents(editorEl);
          sel.removeAllRanges();
          sel.addRange(r);
          document.execCommand('copy');
          sel.collapseToEnd();
          flashStatus(t('viewer.copied'));
        } catch (_e2) {
          flashStatus(t('viewer.copyFailed'));
        }
      }
    }

    function flashStatus(msg) {
      if (!statusEl) return;
      statusEl.textContent = msg;
      setTimeout(() => { if (statusEl.textContent === msg) statusEl.textContent = ''; }, 3500);
    }

    document.getElementById('siaams-viewer-copy-rich')?.addEventListener('click', () => copyContent(true));
    document.getElementById('siaams-viewer-copy-plain')?.addEventListener('click', () => copyContent(false));

    document.getElementById('siaams-viewer-insert')?.addEventListener('click', () => {
      const label = ctx.formatFriendlyFieldName(activeKey);
      if (!window.confirm(t('viewer.confirmInsert', { field: label }))) return;
      ctx.restoreSnapshotToDom({ changedFields: { [activeKey]: editorEl.innerHTML } });
      flashStatus(t('viewer.inserted'));
    });

    function close() {
      if (rteCtrl) rteCtrl.detach();
      backdrop.remove();
    }

    document.getElementById('siaams-viewer-close')?.addEventListener('click', close);
    document.getElementById('siaams-viewer-close-btn')?.addEventListener('click', close);
    backdrop.addEventListener('click', (e) => { if (e.target === backdrop) close(); });
  }

  if (window.__SIAAMS_I18N__) {
    window.__SIAAMS_I18N__.onChange(() => {
      if (typeof activeModalRefresh === 'function') activeModalRefresh();
    });
  }

  window.__SIAAMS_VAULT_UI__ = {
    configure,
    openDraftHistoryModal,
    openGlobalVaultManager,
    openDraftViewerModal,
    scanAllVaultRecords
  };
})();