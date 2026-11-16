/**
 * SIA AMS Chrome Wrapper & Crash-Guard — v1.1.2
 * diff-merge-ui.js — Interactive Git-style visual diff & merge UI for restoring drafts.
 *
 * API: window.__SIAAMS_MERGE__ = {
 *   buildMergeHunks(currentHtml, draftHtml),
 *   resolveHunks(hunks),
 *   openMergeRestore({ fieldLabel, currentHtml, draftHtml, onAccept, onCancel })
 * }
 */
(function () {
  'use strict';
  if (window.__SIAAMS_MERGE__) return;

  const t = (k, p) => (window.__SIAAMS_I18N__ ? window.__SIAAMS_I18N__.t(k, p) : k);

  function escapeHtml(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function normText(html) {
    const d = document.createElement('div');
    d.innerHTML = String(html || '');
    return (d.textContent || d.innerText || '').replace(/\s+/g, ' ').trim();
  }

  function splitHtmlBlocks(html) {
    let raw = String(html || '').trim();
    if (!raw) return [];

    const container = document.createElement('div');
    container.innerHTML = raw;

    // Unwrap single outer wrapper div (e.g. SIA AMS overflow-wrap div)
    while (
      container.children.length === 1 &&
      container.firstElementChild.tagName === 'DIV' &&
      !container.textContent.trim().length === false &&
      container.childNodes.length === 1
    ) {
      const inner = container.firstElementChild;
      if (inner.children.length === 0) break;
      container.innerHTML = inner.innerHTML;
    }

    const blocks = [];
    let inlineBuf = '';
    const flushInline = () => {
      const trimmed = inlineBuf.trim();
      if (trimmed) blocks.push({ html: `<p>${trimmed}</p>`, key: normText(trimmed) });
      inlineBuf = '';
    };

    const BLOCK_TAGS = new Set([ 'P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'DIV', 'UL', 'OL', 'TABLE', 'BLOCKQUOTE', 'HR', 'PRE' ]);

    Array.from(container.childNodes).forEach((node) => {
      if (node.nodeType === 3) {
        const txt = node.textContent || '';
        if (txt.trim()) inlineBuf += escapeHtml(txt);
      } else if (node.nodeType === 1) {
        if (BLOCK_TAGS.has(node.tagName)) {
          flushInline();
          const key = node.tagName === 'HR' ? '---hr---' : normText(node.outerHTML);
          if (key || node.tagName === 'HR') {
            blocks.push({ html: node.outerHTML, key });
          }
        } else if (node.tagName === 'BR') {
          flushInline();
        } else {
          inlineBuf += node.outerHTML;
        }
      }
    });
    flushInline();
    return blocks;
  }

  function lcsDiff(curBlocks, draftBlocks) {
    const n = curBlocks.length;
    const m = draftBlocks.length;
    const dp = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));

    for (let i = n - 1; i >= 0; i--) {
      for (let j = m - 1; j >= 0; j--) {
        if (curBlocks[i].key === draftBlocks[j].key) {
          dp[i][j] = 1 + dp[i + 1][j + 1];
        } else {
          dp[i][j] = dp[i + 1][j] >= dp[i][j + 1] ? dp[i + 1][j] : dp[i][j + 1];
        }
      }
    }

    const ops = [];
    let i = 0;
    let j = 0;
    while (i < n && j < m) {
      if (curBlocks[i].key === draftBlocks[j].key) {
        ops.push({ type: 'equal', html: draftBlocks[j].html });
        i++; j++;
      } else if (dp[i + 1][j] >= dp[i][j + 1]) {
        ops.push({ type: 'del', html: curBlocks[i].html });
        i++;
      } else {
        ops.push({ type: 'add', html: draftBlocks[j].html });
        j++;
      }
    }
    while (i < n) { ops.push({ type: 'del', html: curBlocks[i++].html }); }
    while (j < m) { ops.push({ type: 'add', html: draftBlocks[j++].html }); }
    return ops;
  }

  function buildMergeHunks(currentHtml, draftHtml) {
    const curBlocks = splitHtmlBlocks(currentHtml);
    const draftBlocks = splitHtmlBlocks(draftHtml);
    const ops = lcsDiff(curBlocks, draftBlocks);

    const hunks = [];
    let idx = 0;
    while (idx < ops.length) {
      const op = ops[idx];
      if (op.type === 'equal') {
        hunks.push({ type: 'equal', html: op.html });
        idx++;
        continue;
      }

      // Collect contiguous del/add runs; if both del & add appear together -> conflict hunk
      const dels = [];
      const adds = [];
      while (idx < ops.length && ops[idx].type !== 'equal') {
        if (ops[idx].type === 'del') dels.push(ops[idx].html);
        else adds.push(ops[idx].html);
        idx++;
      }

      if (dels.length > 0 && adds.length > 0) {
        hunks.push({
          type: 'conflict',
          currentHtml: dels.join('\n'),
          draftHtml: adds.join('\n'),
          choice: 'draft' // 'draft' | 'current' | 'both'
        });
      } else if (adds.length > 0) {
        adds.forEach((h) => hunks.push({ type: 'add', html: h, include: true }));
      } else if (dels.length > 0) {
        dels.forEach((h) => hunks.push({ type: 'del', html: h, keep: false }));
      }
    }
    return hunks;
  }

  function resolveHunks(hunks) {
    const parts = [];
    hunks.forEach((h) => {
      if (h.type === 'equal') {
        parts.push(h.html);
      } else if (h.type === 'add') {
        if (h.include) parts.push(h.html);
      } else if (h.type === 'del') {
        if (h.keep) parts.push(h.html);
      } else if (h.type === 'conflict') {
        if (h.choice === 'draft') parts.push(h.draftHtml);
        else if (h.choice === 'current') parts.push(h.currentHtml);
        else if (h.choice === 'both') parts.push(h.currentHtml, h.draftHtml);
      }
    });
    return parts.join('\n');
  }

  function openMergeRestore({ fieldLabel = '', currentHtml = '', draftHtml = '', onAccept, onCancel } = {}) {
    const existing = document.getElementById('siaams-merge-backdrop');
    if (existing) existing.remove();

    const hunks = buildMergeHunks(currentHtml, draftHtml);
    const hasChanges = hunks.some((h) => h.type !== 'equal');

    const backdrop = document.createElement('div');
    backdrop.id = 'siaams-merge-backdrop';
    document.body.appendChild(backdrop);

    function render() {
      const hunksHtml = !hasChanges
        ? `<div class="siaams-merge-empty">${escapeHtml(t('merge.noDiff'))}</div>`
        : hunks.map((h, i) => {
          if (h.type === 'equal') {
            return `<div class="siaams-merge-block siaams-merge-equal">${h.html}</div>`;
          }
          if (h.type === 'add') {
            return `
              <div class="siaams-merge-block siaams-merge-add ${h.include ? '' : 'skipped'}" data-hunk="${i}">
                <div class="siaams-merge-block-bar">
                  <span class="siaams-merge-tag-add">${escapeHtml(t('merge.added'))}</span>
                  <button type="button" class="siaams-merge-toggle" data-toggle-add="${i}">
                    ${escapeHtml(h.include ? t('merge.include') : t('merge.skip'))}
                  </button>
                </div>
                <div class="siaams-merge-content">${h.html}</div>
              </div>
            `;
          }
          if (h.type === 'del') {
            return `
              <div class="siaams-merge-block siaams-merge-del ${h.keep ? 'kept' : ''}" data-hunk="${i}">
                <div class="siaams-merge-block-bar">
                  <span class="siaams-merge-tag-del">${escapeHtml(t('merge.removed'))}</span>
                  <button type="button" class="siaams-merge-toggle" data-toggle-del="${i}">
                    ${escapeHtml(h.keep ? t('merge.keep') : t('merge.remove'))}
                  </button>
                </div>
                <div class="siaams-merge-content">${h.html}</div>
              </div>
            `;
          }
          return `
            <div class="siaams-merge-block siaams-merge-conflict" data-hunk="${i}">
              <div class="siaams-merge-block-bar">
                <span class="siaams-merge-tag-conflict">${escapeHtml(t('merge.conflict'))}</span>
                <div class="siaams-merge-choice-group">
                  <button type="button" class="siaams-merge-choice ${h.choice === 'current' ? 'active' : ''}" data-conflict="${i}" data-choice="current">${escapeHtml(t('merge.keepCurrent'))}</button>
                  <button type="button" class="siaams-merge-choice ${h.choice === 'draft' ? 'active' : ''}" data-conflict="${i}" data-choice="draft">${escapeHtml(t('merge.useDraft'))}</button>
                  <button type="button" class="siaams-merge-choice ${h.choice === 'both' ? 'active' : ''}" data-conflict="${i}" data-choice="both">${escapeHtml(t('merge.keepBoth'))}</button>
                </div>
              </div>
              <div class="siaams-merge-split">
                <div class="siaams-merge-side siaams-merge-side-cur ${h.choice === 'current' || h.choice === 'both' ? 'chosen' : ''}">
                  <div class="siaams-merge-side-label">− ${escapeHtml(t('merge.currentLabel'))}</div>
                  <div class="siaams-merge-content">${h.currentHtml}</div>
                </div>
                <div class="siaams-merge-side siaams-merge-side-draft ${h.choice === 'draft' || h.choice === 'both' ? 'chosen' : ''}">
                  <div class="siaams-merge-side-label">+ ${escapeHtml(t('merge.draftLabel'))}</div>
                  <div class="siaams-merge-content">${h.draftHtml}</div>
                </div>
              </div>
            </div>
          `;
        }).join('');

      backdrop.innerHTML = `
        <div class="siaams-merge-modal" role="dialog" aria-modal="true">
          <div class="siaams-history-header">
            <div>
              <h3>${escapeHtml(t('merge.title', { field: fieldLabel }))}</h3>
              <div class="siaams-viewer-sub">${escapeHtml(t('merge.subtitle'))}</div>
            </div>
            <button type="button" id="siaams-merge-close" class="siaams-btn-close" aria-label="${escapeHtml(t('common.close'))}">✕</button>
          </div>
          <div class="siaams-merge-toolbar">
            <div class="siaams-merge-toolbar-left">
              <button type="button" id="siaams-merge-all-draft" class="siaams-vault-btn">${escapeHtml(t('merge.useAllDraft'))}</button>
              <button type="button" id="siaams-merge-all-current" class="siaams-vault-btn">${escapeHtml(t('merge.keepAllCurrent'))}</button>
            </div>
            <div class="siaams-merge-toolbar-right">
              <button type="button" id="siaams-merge-cancel" class="siaams-cke-btn siaams-cke-btn-cancel">${escapeHtml(t('merge.cancel'))}</button>
              <button type="button" id="siaams-merge-accept" class="siaams-cke-btn siaams-cke-btn-primary">${escapeHtml(t('merge.accept'))}</button>
            </div>
          </div>
          <div class="siaams-merge-body">
            ${hunksHtml}
          </div>
        </div>
      `;

      backdrop.querySelectorAll('[data-toggle-add]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const idx = Number(btn.getAttribute('data-toggle-add'));
          hunks[idx].include = !hunks[idx].include;
          render();
        });
      });

      backdrop.querySelectorAll('[data-toggle-del]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const idx = Number(btn.getAttribute('data-toggle-del'));
          hunks[idx].keep = !hunks[idx].keep;
          render();
        });
      });

      backdrop.querySelectorAll('[data-conflict]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const idx = Number(btn.getAttribute('data-conflict'));
          hunks[idx].choice = btn.getAttribute('data-choice');
          render();
        });
      });

      document.getElementById('siaams-merge-all-draft')?.addEventListener('click', () => {
        hunks.forEach((h) => {
          if (h.type === 'add') h.include = true;
          if (h.type === 'del') h.keep = false;
          if (h.type === 'conflict') h.choice = 'draft';
        });
        render();
      });

      document.getElementById('siaams-merge-all-current')?.addEventListener('click', () => {
        hunks.forEach((h) => {
          if (h.type === 'add') h.include = false;
          if (h.type === 'del') h.keep = true;
          if (h.type === 'conflict') h.choice = 'current';
        });
        render();
      });

      const close = (accepted) => {
        backdrop.remove();
        if (!accepted && typeof onCancel === 'function') onCancel();
      };

      document.getElementById('siaams-merge-close')?.addEventListener('click', () => close(false));
      document.getElementById('siaams-merge-cancel')?.addEventListener('click', () => close(false));
      backdrop.addEventListener('click', (e) => { if (e.target === backdrop) close(false); });

      document.getElementById('siaams-merge-accept')?.addEventListener('click', () => {
        const mergedHtml = resolveHunks(hunks);
        close(true);
        if (typeof onAccept === 'function') onAccept(mergedHtml);
      });
    }

    render();
  }

  window.__SIAAMS_MERGE__ = { buildMergeHunks, resolveHunks, openMergeRestore };
})();