/**
 * SIA AMS Chrome Wrapper & Crash-Guard — v1.1.0
 * ui-and-crash-guard.js — Injected at document_end in MAIN world
 *
 * Fixes & v1.1.0 Enhancements:
 *  - Multi-language Extension UI (RO / RU / EN) with instant live switcher in Top Bar
 *  - #2 & #3: Modern Docked, Collapsible, Searchable Left Sidebar (global + CONTEXT/IMPRIMARE)
 *  - #4: 1-Step "Save to Server (ALT+S)" in CKEditor + Sticky Unsaved Warning Bar
 *  - #5: Session Keep-Alive Heartbeat (every 3 minutes) + Pre-Submit Session Check
 *  - #6: 2-Second Continuous LocalStorage Auto-Save Vault + 20-Version History + Delete/Viewer + Global Manager
 *  - #7 & Editor Upgrade: Shared Word + Notion Style Rich Editor (Fixed Toolbar, Bubble Menu, "/" Slash Menu, Markdown)
 *        for both CKEditor (#ToolPopUPHTML) and In-Page Editors (#siaams-preview-*)
 *  - #8: Visual Editor for Epicriza & Extras on checkout.asp + checkin.asp previews
 *  - #10: Auto-Expand Hidden Patient/Referral Header (<tool:ah id="ah1">)
 *  - #12: Native Date Picker Bridge (dd/mm/yyyy) + Dot-to-Slash Auto-Normalizer
 *  - #15 (Helper): 1-Click Glycemic Table Row inside Rich Editor & CKEditor
 *  - #27: Suppress False-Positive "Nu aveti suficiente drepturi" Banner
 */
(function () {
  'use strict';

  if (window.__SIAAMS_UI_GUARD_INSTALLED__) return;
  window.__SIAAMS_UI_GUARD_INSTALLED__ = true;

  // Avoid running inside tiny hidden helper iframes (like 1x1 fis_pac_new print iframe)
  if (window !== window.top && (window.innerWidth < 100 || window.frameElement?.id === 'fis_pac_new')) {
    return;
  }

  // If on login screen (default.asp / frmLogin), wire Enter key to submit frmLogin and skip sidebar
  if (document.forms?.frmLogin || window.location.pathname.toLowerCase().endsWith('/default.asp')) {
    document.addEventListener('DOMContentLoaded', () => {
      const frm = document.forms?.frmLogin;
      if (frm) {
        frm.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            frm.submit();
          }
        });
      }
    });
    if (document.forms?.frmLogin) return;
  }

  const APP_BASE = '/SIAAMS_Republican';
  const MENU_URL = `${APP_BASE}/Template/menu.asp`;
  const KEEP_ALIVE_INTERVAL_MS = 3 * 60 * 1000; // 3 minutes
  const AUTOSAVE_INTERVAL_MS = 2000; // 2 seconds
  const MAX_DRAFT_HISTORY = 20;

  const i18n = window.__SIAAMS_I18N__;
  const t = (k, p) => (i18n ? i18n.t(k, p) : k);
  const locale = () => (i18n ? i18n.locale() : 'ro-RO');

  let hasUnsavedServerChanges = false;
  let isSubmittingToServer = false;
  let initialFieldBaseline = {};
  let lastSavedHash = '';
  let lastSessionPingTime = '';
  let lastSessionPingState = 'checkedNow'; // 'checkedNow' | 'activeAt' | 'renewedAt' | 'expired' | 'warn'
  let lastAutoSaveTime = '';
  let lastAutoSaveState = 'active'; // 'active' | 'savedAt' | 'serverCleared'
  let activeBranchId = null;
  let activeForkedFrom = null;

  function generateBranchId() {
    return `br_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  }

  // ---------------------------------------------------------------------------
  // Utility: Identify current page & record key for the Auto-Save Vault
  // ---------------------------------------------------------------------------
  function getPageVaultInfo() {
    const path = window.location.pathname.toLowerCase();
    const params = new URLSearchParams(window.location.search);
    const id = params.get('id') || params.get('ciid') || 'global';
    const ciid = params.get('ciid') || (path.includes('checkin.asp') ? params.get('id') : null);

    let pageType = 'page';
    if (path.includes('checkin.asp')) pageType = 'checkin';
    else if (path.includes('checkout.asp')) pageType = 'checkout';
    else if (path.includes('presentation.asp')) pageType = 'presentation';
    else if (path.includes('edit.asp')) pageType = 'pacient';

    const titleEl = document.getElementById('div_menu_caps');
    const patientTitle = titleEl ? titleEl.textContent.replace(/\s+/g, ' ').trim() : `${pageType.toUpperCase()} #${id}`;

    return {
      pageType,
      recordId: id,
      ciid,
      patientTitle,
      vaultKey: `siaams_vault_${pageType}_${id}`,
      historyKey: `siaams_vault_hist_${pageType}_${id}`,
      isClinicalForm: Boolean(document.forms?.frmEdit) && (pageType === 'checkin' || pageType === 'checkout' || pageType === 'presentation')
    };
  }

  // ---------------------------------------------------------------------------
  // 1. Top Crash-Guard, Language Switcher & Session Keep-Alive Status Bar
  // ---------------------------------------------------------------------------
  function createTopStatusBar() {
    if (document.getElementById('siaams-top-bar')) return;

    const vaultInfo = getPageVaultInfo();
    const curLang = i18n ? i18n.getLang() : 'ro';
    const bar = document.createElement('div');
    bar.id = 'siaams-top-bar';
    bar.innerHTML = `
      <div class="siaams-top-left">
        <button type="button" id="siaams-sidebar-toggle" class="siaams-btn-icon" data-i18n="topbar.menu" data-i18n-title="topbar.menuTitle">
          ${escapeHtml(t('topbar.menu'))}
        </button>
        <span class="siaams-brand-badge">🛡️ Crash-Guard v1.1.2</span>
        <span id="siaams-session-pill" class="siaams-pill siaams-pill-ok" data-i18n-title="session.title" title="${escapeAttr(t('session.title'))}">
          <span id="siaams-session-label" data-i18n="session.active">${escapeHtml(t('session.active'))}</span>
          <small id="siaams-session-time">${escapeHtml(t('session.checkedNow'))}</small>
        </span>
        ${vaultInfo.isClinicalForm ? `
          <span id="siaams-autosave-pill" class="siaams-pill siaams-pill-info" data-i18n-title="autosave.title" title="${escapeAttr(t('autosave.title'))}">
            <span data-i18n="autosave.label">${escapeHtml(t('autosave.label'))}</span>
            <strong id="siaams-autosave-status">${escapeHtml(t('autosave.active'))}</strong>
          </span>
          <button type="button" id="siaams-btn-history" class="siaams-btn-subtle" data-i18n-title="history.btnTitle" title="${escapeAttr(t('history.btnTitle'))}">
            <span data-i18n="history.btn">${escapeHtml(t('history.btn'))}</span> (<span id="siaams-history-count">0</span>)
          </button>
        ` : ''}
        <button type="button" id="siaams-btn-all-drafts" class="siaams-btn-subtle" data-i18n="topbar.allDrafts" data-i18n-title="topbar.allDraftsTitle" title="${escapeAttr(t('topbar.allDraftsTitle'))}">
          ${escapeHtml(t('topbar.allDrafts'))}
        </button>
      </div>
      <div class="siaams-top-right">
        <div id="siaams-unsaved-warning" class="siaams-unsaved-pill" style="display: none;">
          <span data-i18n-html="unsaved.text">${t('unsaved.text')}</span>
          <button type="button" id="siaams-top-save-btn" class="siaams-btn-save-now" data-i18n="unsaved.saveNow">
            ${escapeHtml(t('unsaved.saveNow'))}
          </button>
        </div>
        <div id="siaams-lang-switcher" class="siaams-lang-switcher" role="group" data-i18n-title="lang.title" title="${escapeAttr(t('lang.title'))}">
          <button type="button" class="siaams-lang-btn ${curLang === 'ro' ? 'active' : ''}" data-lang="ro">RO</button>
          <button type="button" class="siaams-lang-btn ${curLang === 'ru' ? 'active' : ''}" data-lang="ru">RU</button>
          <button type="button" class="siaams-lang-btn ${curLang === 'en' ? 'active' : ''}" data-lang="en">EN</button>
        </div>
        <span class="siaams-patient-badge" title="${escapeAttr(vaultInfo.patientTitle)}">
          ${escapeHtml(vaultInfo.patientTitle)}
        </span>
      </div>
    `;

    document.body.prepend(bar);
    document.body.classList.add('siaams-has-topbar');

    // Toggle sidebar
    document.getElementById('siaams-sidebar-toggle')?.addEventListener('click', () => {
      const collapsed = document.body.classList.toggle('siaams-sidebar-collapsed');
      localStorage.setItem('siaams_sidebar_collapsed', collapsed ? '1' : '0');
    });

    // Save Now button in sticky top bar
    document.getElementById('siaams-top-save-btn')?.addEventListener('click', () => {
      triggerOneStepServerSave();
    });

    // Draft History modal button
    document.getElementById('siaams-btn-history')?.addEventListener('click', () => {
      openDraftHistoryModal();
    });

    // Global All Drafts modal button
    document.getElementById('siaams-btn-all-drafts')?.addEventListener('click', () => {
      if (window.__SIAAMS_VAULT_UI__) window.__SIAAMS_VAULT_UI__.openGlobalVaultManager();
    });

    // Manual session ping on click
    document.getElementById('siaams-session-pill')?.addEventListener('click', () => {
      pingSessionKeepAlive(true);
    });

    // Language switcher buttons
    bar.querySelectorAll('.siaams-lang-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const lang = btn.getAttribute('data-lang');
        if (i18n && lang) i18n.setLang(lang);
      });
    });

    updateHistoryCountBadge();
  }

  function refreshDynamicTopBarLabels() {
    const curLang = i18n ? i18n.getLang() : 'ro';
    document.querySelectorAll('#siaams-lang-switcher .siaams-lang-btn').forEach((btn) => {
      btn.classList.toggle('active', btn.getAttribute('data-lang') === curLang);
    });

    const pill = document.getElementById('siaams-session-pill');
    const timeEl = document.getElementById('siaams-session-time');
    const labelEl = document.getElementById('siaams-session-label');
    if (pill) {
      if (lastSessionPingState === 'expired') {
        pill.className = 'siaams-pill siaams-pill-danger';
        pill.innerHTML = `${escapeHtml(t('session.expired'))} <small>${escapeHtml(t('session.expiredHint'))}</small>`;
      } else if (labelEl && timeEl) {
        labelEl.textContent = t('session.active');
        if (lastSessionPingState === 'checkedNow') {
          timeEl.textContent = t('session.checkedNow');
        } else if (lastSessionPingState === 'renewedAt') {
          timeEl.textContent = t('session.renewedAt', { time: lastSessionPingTime });
        } else if (lastSessionPingState === 'activeAt') {
          timeEl.textContent = t('session.activeAt', { time: lastSessionPingTime });
        }
      }
    }

    const autoStatus = document.getElementById('siaams-autosave-status');
    if (autoStatus) {
      if (lastAutoSaveState === 'serverCleared') {
        autoStatus.textContent = t('autosave.serverCleared');
      } else if (lastAutoSaveState === 'savedAt' && lastAutoSaveTime) {
        autoStatus.textContent = t('autosave.savedAt', { time: lastAutoSaveTime });
      } else {
        autoStatus.textContent = t('autosave.active');
      }
    }
  }

  // ---------------------------------------------------------------------------
  // 2. Modern Docked, Collapsible, Searchable Left Sidebar (#2 & #3)
  // ---------------------------------------------------------------------------
  async function initModernSidebar() {
    if (document.getElementById('siaams-chrome-sidebar')) return;

    const sidebar = document.createElement('aside');
    sidebar.id = 'siaams-chrome-sidebar';
    sidebar.innerHTML = `
      <div class="siaams-sidebar-header">
        <div class="siaams-sidebar-search-wrap">
          <input type="search" id="siaams-sidebar-search" data-i18n-placeholder="sidebar.search" placeholder="${escapeAttr(t('sidebar.search'))}" autocomplete="off" />
        </div>
        <div class="siaams-quick-nav">
          <a href="${APP_BASE}/main.asp" class="siaams-quick-btn" data-i18n="sidebar.home" data-i18n-title="sidebar.homeTitle" title="${escapeAttr(t('sidebar.homeTitle'))}">${escapeHtml(t('sidebar.home'))}</a>
          <a href="${APP_BASE}/SectionPage.asp" class="siaams-quick-btn" data-i18n="sidebar.section" data-i18n-title="sidebar.sectionTitle" title="${escapeAttr(t('sidebar.sectionTitle'))}">${escapeHtml(t('sidebar.section'))}</a>
          <a href="${APP_BASE}/Files/search.asp?what=I" class="siaams-quick-btn" data-i18n="sidebar.admissions" data-i18n-title="sidebar.admissionsTitle" title="${escapeAttr(t('sidebar.admissionsTitle'))}">${escapeHtml(t('sidebar.admissions'))}</a>
        </div>
      </div>
      <div id="siaams-sidebar-patient-context"></div>
      <div id="siaams-sidebar-content" class="siaams-sidebar-scroll">
        <div class="siaams-sidebar-loading" data-i18n="sidebar.loading">${escapeHtml(t('sidebar.loading'))}</div>
      </div>
    `;

    document.body.appendChild(sidebar);
    document.body.classList.add('siaams-has-sidebar');

    if (localStorage.getItem('siaams_sidebar_collapsed') === '1') {
      document.body.classList.add('siaams-sidebar-collapsed');
    }

    const searchInput = document.getElementById('siaams-sidebar-search');
    searchInput?.addEventListener('input', () => {
      filterSidebarMenu(searchInput.value);
    });

    renderDirectPatientQuickLinks();
    await fetchAndRenderMenu();
  }

  function renderDirectPatientQuickLinks() {
    const container = document.getElementById('siaams-sidebar-patient-context');
    if (!container) return;

    const info = getPageVaultInfo();
    if (!info.ciid && info.pageType !== 'checkin' && info.pageType !== 'checkout') {
      return;
    }

    const ciid = info.ciid || info.recordId;
    const coid = info.pageType === 'checkout' ? info.recordId : null;

    const pacLink = document.querySelector('a[href*="Pacient/edit.asp"]')?.getAttribute('href');
    const presLink = document.querySelector('a[href*="presentation.asp"]')?.getAttribute('href');

    container.innerHTML = `
      <div class="siaams-context-card">
        <div class="siaams-context-title">${escapeHtml(t('ctx.title', { id: String(ciid) }))}</div>
        <div class="siaams-context-grid">
          ${pacLink ? `<a href="${escapeAttr(pacLink)}" class="siaams-ctx-chip" data-i18n="ctx.patient">${escapeHtml(t('ctx.patient'))}</a>` : ''}
          ${presLink ? `<a href="${escapeAttr(presLink)}" class="siaams-ctx-chip" data-i18n="ctx.presentation">${escapeHtml(t('ctx.presentation'))}</a>` : ''}
          <a href="${APP_BASE}/Files/checkin.asp?id=${encodeURIComponent(ciid)}" class="siaams-ctx-chip ${info.pageType === 'checkin' ? 'active' : ''}" data-i18n="ctx.checkin">${escapeHtml(t('ctx.checkin'))}</a>
          ${coid ? `<a href="${APP_BASE}/Files/checkout.asp?id=${encodeURIComponent(coid)}&ciid=${encodeURIComponent(ciid)}" class="siaams-ctx-chip ${info.pageType === 'checkout' ? 'active' : ''}" data-i18n="ctx.checkout">${escapeHtml(t('ctx.checkout'))}</a>` : ''}
          <a href="${APP_BASE}/Print/Recommendations/recommendations.asp?ciid=${encodeURIComponent(ciid)}" target="_blank" class="siaams-ctx-chip siaams-chip-print" data-i18n="ctx.extras">${escapeHtml(t('ctx.extras'))}</a>
          <a href="${APP_BASE}/Print/checkout/decont_cost.asp?ciid=${encodeURIComponent(ciid)}" target="_blank" class="siaams-ctx-chip siaams-chip-print" data-i18n="ctx.cost">${escapeHtml(t('ctx.cost'))}</a>
          <a href="${APP_BASE}/Print/FisaCompleta/FisaPacient_NewFull.asp?ciid=${encodeURIComponent(ciid)}" target="_blank" class="siaams-ctx-chip siaams-chip-print" data-i18n="ctx.full">${escapeHtml(t('ctx.full'))}</a>
        </div>
      </div>
    `;
  }

  async function fetchAndRenderMenu() {
    const contentEl = document.getElementById('siaams-sidebar-content');
    if (!contentEl) return;

    try {
      const resp = await fetch(MENU_URL, {
        method: 'GET',
        credentials: 'include',
        cache: 'no-store'
      });
      const html = await resp.text();
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');

      const rows = Array.from(doc.querySelectorAll('#TblMenu tr'));
      const categories = [];
      let currentCat = null;

      for (const tr of rows) {
        const headerTd = tr.querySelector('td.menu_caps1');
        if (headerTd) {
          const text = headerTd.textContent.replace(/\s+/g, ' ').trim();
          if (!text) continue;
          if (currentCat && currentCat.title === 'UTILIZATOR') {
            currentCat.items.push({ label: text, href: null, isInfo: true });
          } else {
            currentCat = { title: text, items: [] };
            categories.push(currentCat);
          }
          continue;
        }

        const td = tr.querySelector('td');
        if (!td) continue;

        const a = td.querySelector('a.lnk, a');
        const onclickRaw = td.getAttribute('onclick') || '';
        let href = a?.getAttribute('href') || '';

        if ((!href || href === '#') && onclickRaw) {
          const m = onclickRaw.match(/doNavigate\(["']([^"']+)["']\)/i) ||
                    onclickRaw.match(/window\.open\(["']([^"']+)["']/i);
          if (m) href = m[1];
        }

        if (!href) continue;

        const rawLabel = (a ? a.textContent : td.textContent)
          .replace(/^::\s*/, '')
          .replace(/\s+/g, ' ')
          .trim();

        if (!rawLabel) continue;

        if (!currentCat) {
          currentCat = { title: 'MENIU', items: [] };
          categories.push(currentCat);
        }

        const isSelected = td.id === 'SelMenu' || window.location.pathname.toLowerCase() === href.split('?')[0].toLowerCase();
        const isTargetBlank = a?.getAttribute('target') === '_blank' || currentCat.title === 'IMPRIMARE' || href.toLowerCase().includes('/print/');

        currentCat.items.push({
          label: rawLabel,
          href,
          isSelected,
          isTargetBlank
        });
      }

      const priorityTitles = new Set([ 'CONTEXT', 'IMPRIMARE' ]);
      const priorityCats = categories.filter((c) => priorityTitles.has(c.title.toUpperCase()));
      const standardCats = categories.filter((c) => !priorityTitles.has(c.title.toUpperCase()));
      const orderedCats = [ ...priorityCats, ...standardCats ];

      contentEl.innerHTML = orderedCats
        .filter((cat) => cat.items.length > 0)
        .map((cat) => {
          const upper = cat.title.toUpperCase();
          const isPriority = priorityTitles.has(upper);
          const icon = getCategoryIcon(cat.title);
          const catKey = `cat.${upper}`;
          const hasCatTooltip = i18n && i18n.has(catKey);
          return `
            <div class="siaams-menu-group ${isPriority ? 'siaams-menu-group-priority' : ''}" data-category="${escapeAttr(cat.title)}">
              <div class="siaams-menu-group-header" ${hasCatTooltip ? `data-i18n-title="${catKey}" title="${escapeAttr(t(catKey))}"` : ''} onclick="this.parentElement.classList.toggle('collapsed')">
                <span>${icon} ${escapeHtml(cat.title)} <small>(${cat.items.length})</small></span>
                <span class="siaams-chevron">▾</span>
              </div>
              <ul class="siaams-menu-list">
                ${cat.items
                  .map((item) => {
                    if (item.isInfo) {
                      return `<li class="siaams-menu-info">${escapeHtml(item.label)}</li>`;
                    }
                    return `
                      <li class="siaams-menu-item ${item.isSelected ? 'selected' : ''}">
                        <a href="${escapeAttr(item.href)}" ${item.isTargetBlank ? 'target="_blank" rel="noopener"' : ''}>
                          <span class="siaams-bullet">›</span>
                          <span class="siaams-item-label">${escapeHtml(item.label)}</span>
                          ${item.isTargetBlank ? `<span class="siaams-ext-icon" data-i18n-title="sidebar.newTab" title="${escapeAttr(t('sidebar.newTab'))}">↗</span>` : ''}
                        </a>
                      </li>
                    `;
                  })
                  .join('')}
              </ul>
            </div>
          `;
        })
        .join('');
    } catch (err) {
      console.error('[SIAAMS Sidebar] Eroare la încărcarea menu.asp:', err);
      contentEl.innerHTML = `<div class="siaams-sidebar-error">${escapeHtml(t('sidebar.error', { msg: err.message }))}</div>`;
    }
  }

  function getCategoryIcon(title) {
    const tUpper = title.toUpperCase();
    if (tUpper === 'CONTEXT') return '🩺';
    if (tUpper === 'IMPRIMARE') return '🖨️';
    if (tUpper === 'SECTII') return '🏥';
    if (tUpper === 'PROCEDURI') return '🔬';
    if (tUpper === 'STATISTICA') return '📊';
    if (tUpper === 'RAPOARTE') return '📑';
    if (tUpper === 'ANUNTURI') return '📢';
    if (tUpper === 'GENERAL') return '⚙️';
    if (tUpper === 'UTILIZATOR') return '👩‍⚕️';
    return '📁';
  }

  function filterSidebarMenu(query) {
    const q = String(query || '').trim().toLowerCase();
    const groups = document.querySelectorAll('#siaams-sidebar-content .siaams-menu-group');
    groups.forEach((group) => {
      const items = group.querySelectorAll('.siaams-menu-item');
      let visibleCount = 0;
      items.forEach((li) => {
        const text = li.textContent.toLowerCase();
        const match = !q || text.includes(q);
        li.style.display = match ? '' : 'none';
        if (match) visibleCount++;
      });
      if (q) {
        group.classList.remove('collapsed');
        group.style.display = visibleCount > 0 ? '' : 'none';
      } else {
        group.style.display = '';
      }
    });
  }

  // ---------------------------------------------------------------------------
  // 3. Session Keep-Alive Heartbeat (#5 — Prevents 20-minute IIS Session Loss)
  // ---------------------------------------------------------------------------
  async function pingSessionKeepAlive(isManual = false) {
    const pill = document.getElementById('siaams-session-pill');
    try {
      const resp = await fetch(`${MENU_URL}?_keepalive=${Date.now()}`, {
        method: 'GET',
        credentials: 'include',
        cache: 'no-store'
      });
      const text = await resp.text();
      const nowStr = new Date().toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit', second: '2-digit' });

      const isLoggedOut = resp.url.toLowerCase().includes('default.asp') ||
                          resp.url.toLowerCase().includes('logon.asp') ||
                          (!text.includes('TblMenu') && text.toLowerCase().includes('strpwd'));

      if (isLoggedOut) {
        lastSessionPingState = 'expired';
        refreshDynamicTopBarLabels();
        return false;
      }

      lastSessionPingTime = nowStr;
      lastSessionPingState = isManual ? 'renewedAt' : 'activeAt';
      if (pill) pill.className = 'siaams-pill siaams-pill-ok';
      refreshDynamicTopBarLabels();
      return true;
    } catch (_e) {
      lastSessionPingState = 'warn';
      if (pill) pill.className = 'siaams-pill siaams-pill-warn';
      return false;
    }
  }

  // ---------------------------------------------------------------------------
  // 4. CKEditor (#ToolPopUPHTML) Overhaul + Shared Rich Editor + 1-Step Save
  // ---------------------------------------------------------------------------
  let activeCkeRteCtrl = null;
  let ckePollTimer = null;

  function upgradeCkeditorModalAndSavePipeline() {
    if (typeof window.__SIAAMS_ENSURE_JQUERY_PLUGINS__ === 'function') {
      window.__SIAAMS_ENSURE_JQUERY_PLUGINS__();
    }

    const popupEl = document.getElementById('ToolPopUPHTML');
    if (!popupEl) return;

    // 4a. Replace floating <center> buttons inside #ToolPopUPHTML with a docked bottom toolbar (#7 & #4)
    const oldCenter = popupEl.querySelector('center');
    if (oldCenter) {
      oldCenter.style.display = 'none';
    }

    if (!document.getElementById('siaams-ckeditor-footer')) {
      const footer = document.createElement('div');
      footer.id = 'siaams-ckeditor-footer';
      footer.innerHTML = `
        <div class="siaams-cke-footer-left">
          <button type="button" id="siaams-cke-cancel" class="siaams-cke-btn siaams-cke-btn-cancel" data-i18n="cke.cancel" data-i18n-title="cke.cancelTitle" title="${escapeAttr(t('cke.cancelTitle'))}">
            ${escapeHtml(t('cke.cancel'))}
          </button>
          <button type="button" id="siaams-cke-add-glycemic" class="siaams-cke-btn siaams-cke-btn-helper" data-i18n-title="editor.glycemic" title="${escapeAttr(t('editor.glycemic'))}">
            ➕ <span data-i18n="editor.glycemic">${escapeHtml(t('editor.glycemic'))}</span>
          </button>
          <button type="button" id="siaams-cke-toggle-classic" class="siaams-cke-btn siaams-cke-btn-subtle" data-i18n="editor.classic" data-i18n-title="editor.classicTitle" title="${escapeAttr(t('editor.classicTitle'))}">
            ${escapeHtml(t('editor.classic'))}
          </button>
        </div>
        <div class="siaams-cke-footer-right">
          <button type="button" id="siaams-cke-close-only" class="siaams-cke-btn siaams-cke-btn-secondary" data-i18n="cke.closeOnly" data-i18n-title="cke.closeOnlyTitle" title="${escapeAttr(t('cke.closeOnlyTitle'))}">
            ${escapeHtml(t('cke.closeOnly'))}
          </button>
          <button type="button" id="siaams-cke-save-server" class="siaams-cke-btn siaams-cke-btn-primary" data-i18n="cke.saveServer" data-i18n-title="cke.saveServerTitle" title="${escapeAttr(t('cke.saveServerTitle'))}">
            ${escapeHtml(t('cke.saveServer'))}
          </button>
        </div>
      `;
      popupEl.appendChild(footer);

      document.getElementById('siaams-cke-cancel')?.addEventListener('click', () => {
        if (typeof window.ClosePopUpHtml === 'function') {
          window.ClosePopUpHtml();
        } else if (window.$) {
          window.$('#ToolPopUPHTML').dialog('close');
        }
      });

      document.getElementById('siaams-cke-add-glycemic')?.addEventListener('click', () => {
        if (activeCkeRteCtrl) activeCkeRteCtrl.glycemicRow();
        else insertGlycemicRowInCkeditor();
      });

      document.getElementById('siaams-cke-toggle-classic')?.addEventListener('click', () => {
        const useClassic = popupEl.classList.toggle('siaams-cke-use-classic');
        const btn = document.getElementById('siaams-cke-toggle-classic');
        if (btn) btn.textContent = t(useClassic ? 'editor.modern' : 'editor.classic');
      });

      document.getElementById('siaams-cke-close-only')?.addEventListener('click', () => {
        enhancedUpdatePopUpHtml(false);
      });

      document.getElementById('siaams-cke-save-server')?.addEventListener('click', () => {
        enhancedUpdatePopUpHtml(true);
      });
    }

    // 4b. Wrap global ShowPopUpHtmlInput so #ToolPopUPHTML dialog is properly sized
    //     and our Word + Notion Rich Editor toolbar attaches to the CKEditor iframe body
    if (typeof window.ShowPopUpHtmlInput === 'function' && !window.ShowPopUpHtmlInput._siaamsWrapped) {
      const origShow = window.ShowPopUpHtmlInput;
      const wrappedShow = function (pLabel, pReturnInputID, abspath) {
        if (typeof window.__SIAAMS_ENSURE_JQUERY_PLUGINS__ === 'function') {
          window.__SIAAMS_ENSURE_JQUERY_PLUGINS__();
        }
        const res = origShow.call(this, pLabel, pReturnInputID, abspath || APP_BASE);
        fixToolPopupDialogDimensions(pReturnInputID);
        attachRichEditorToCkeditorWhenReady(popupEl);
        return res;
      };
      wrappedShow._siaamsWrapped = true;
      window.ShowPopUpHtmlInput = wrappedShow;
    }

    // 4c. Replace UpdatePopUpHtml with reliable CKEditor sync + 1-Step Server Save (#4)
    window.UpdatePopUpHtml = function (savePage) {
      return enhancedUpdatePopUpHtml(Boolean(savePage));
    };
  }

  function attachRichEditorToCkeditorWhenReady(popupEl) {
    if (!window.__SIAAMS_RTE__) return;
    if (ckePollTimer) { clearInterval(ckePollTimer); ckePollTimer = null; }

    let attempts = 0;
    const tryMount = () => {
      attempts++;
      const iframe = popupEl.querySelector('iframe.cke_wysiwyg_frame, .cke_contents iframe, td.cke_contents iframe, iframe');
      const iframeDoc = iframe && (iframe.contentDocument || iframe.contentWindow?.document);
      const body = iframeDoc && iframeDoc.body;

      if (body && (body.getAttribute('contenteditable') === 'true' || iframeDoc.designMode === 'on' || attempts > 8)) {
        if (ckePollTimer) { clearInterval(ckePollTimer); ckePollTimer = null; }
        if (activeCkeRteCtrl && activeCkeRteCtrl.el === body) {
          activeCkeRteCtrl.refresh();
          return;
        }
        if (activeCkeRteCtrl) {
          activeCkeRteCtrl.detach();
          activeCkeRteCtrl = null;
        }

        // Ensure editable inside iframe
        if (body.getAttribute('contenteditable') !== 'true') {
          body.setAttribute('contenteditable', 'true');
        }

        // Ensure slot above CKEditor area
        let slot = document.getElementById('siaams-cke-rte-slot');
        if (!slot) {
          slot = document.createElement('div');
          slot.id = 'siaams-cke-rte-slot';
          slot.className = 'siaams-cke-rte-slot';
          const htmlDiv = popupEl.querySelector('div[name="htmldiv"]') || popupEl.firstElementChild;
          popupEl.insertBefore(slot, htmlDiv);
        }
        slot.innerHTML = '';

        // Hide the broken text-only CKEditor 3 toolbar by default (user can toggle via "Classic toolbar")
        popupEl.classList.add('siaams-cke-has-rte');

        const inst = window.CKEDITOR?.instances?.ToolPopUPHTML_fck ||
                     (window.CKEDITOR?.instances ? Object.values(window.CKEDITOR.instances)[0] : null);

        activeCkeRteCtrl = window.__SIAAMS_RTE__.attach(body, {
          doc: iframeDoc,
          mount: (tb) => slot.appendChild(tb),
          beforeCommand: () => { try { inst?.fire?.('saveSnapshot'); } catch (_e) {} },
          afterCommand: () => {
            try {
              inst?.updateElement?.();
              inst?.fire?.('saveSnapshot');
            } catch (_e) {}
          },
          onChange: () => {
            try { inst?.updateElement?.(); } catch (_e) {}
            const activeFieldId = popupEl.getAttribute('Info');
            if (activeFieldId) markUnsavedServerChanges(true, activeFieldId);
            runAutoSaveSnapshot(false);
          }
        });
        return;
      }

      if (attempts > 40 && ckePollTimer) {
        clearInterval(ckePollTimer);
        ckePollTimer = null;
      }
    };

    tryMount();
    if (!activeCkeRteCtrl) {
      ckePollTimer = setInterval(tryMount, 100);
    }
  }

  function fixToolPopupDialogDimensions() {
    try {
      const htmlDiv = document.querySelector('#ToolPopUPHTML div[name="htmldiv"]');
      if (htmlDiv) {
        htmlDiv.style.height = 'auto';
        htmlDiv.style.minHeight = '410px';
      }
      if (window.$ && window.$('#ToolPopUPHTML').dialog) {
        window.$('#ToolPopUPHTML').dialog('option', 'width', Math.min(1020, window.innerWidth - 50));
        window.$('#ToolPopUPHTML').dialog('option', 'height', Math.min(660, window.innerHeight - 36));
        window.$('#ToolPopUPHTML').dialog('option', 'position', 'center');
      }
    } catch (_e) {}
  }

  function getActiveCkeditorHtml() {
    try {
      const popupEl = document.getElementById('ToolPopUPHTML');
      const iframe = popupEl?.querySelector('iframe.cke_wysiwyg_frame, .cke_contents iframe, td.cke_contents iframe, iframe');
      const body = iframe && (iframe.contentDocument || iframe.contentWindow?.document)?.body;
      if (window.CKEDITOR && window.CKEDITOR.instances) {
        const inst = window.CKEDITOR.instances.ToolPopUPHTML_fck || Object.values(window.CKEDITOR.instances)[0];
        if (inst && typeof inst.getData === 'function') {
          inst.updateElement();
          const data = inst.getData();
          if (data || !body) return data;
        }
      }
      if (body && body.innerHTML) return body.innerHTML;
    } catch (_e) {}
    const fckTextarea = document.getElementById('ToolPopUPHTML_fck');
    return fckTextarea ? fckTextarea.value : '';
  }

  function enhancedUpdatePopUpHtml(saveToServer = false) {
    const popupEl = document.getElementById('ToolPopUPHTML');
    if (!popupEl) return;

    const targetFieldId = popupEl.getAttribute('Info');
    if (!targetFieldId) return;

    const rawHtml = getActiveCkeditorHtml();
    const wrapperPrefix = '<div style="overflow-wrap:break-word;word-wrap:break-word !important;-webkit-hyphens:auto !important;-ms-hyphens:auto !important;-moz-hyphens:auto !important;hyphens:auto !important;">';
    const finalHtml = rawHtml.includes('overflow-wrap:break-word')
      ? rawHtml
      : `${wrapperPrefix}${rawHtml}</div>`;

    const targetEl = document.getElementById(targetFieldId);
    if (targetEl) {
      targetEl.value = finalHtml;

      const nextEl = targetEl.nextElementSibling;
      if (nextEl && nextEl.tagName === 'DIV' && !nextEl.classList.contains('siaams-formatted-preview')) {
        nextEl.innerHTML = finalHtml.substring(0, 1200) + (finalHtml.length > 1200 ? '...' : '');
      }

      const customPreview = document.getElementById(`siaams-preview-${targetFieldId}`);
      if (customPreview) {
        customPreview.innerHTML = finalHtml;
      }

      const updatedInput = targetEl.parentElement?.querySelector('.HtmlUpdated');
      if (updatedInput) {
        updatedInput.value = '1';
      }
    }

    try {
      if (window.$ && window.$('#ToolPopUPHTML').dialog) {
        window.$('#ToolPopUPHTML').dialog('close');
      } else {
        popupEl.style.display = 'none';
      }
    } catch (_e) {
      popupEl.style.display = 'none';
    }

    markUnsavedServerChanges(true, targetFieldId);
    runAutoSaveSnapshot(true);

    if (saveToServer) {
      triggerOneStepServerSave();
    }
  }

  function triggerOneStepServerSave() {
    isSubmittingToServer = true;
    markUnsavedServerChanges(false);

    if (typeof window.EditLink === 'function') {
      window.EditLink('S');
    } else if (document.frmEdit && typeof document.frmEdit.submitForm === 'function') {
      if (document.frmEdit.elements?.hdnAction) {
        document.frmEdit.elements.hdnAction.value = 'S';
      }
      document.frmEdit.submitForm();
    } else if (document.frmEdit) {
      document.frmEdit.submit();
    }
  }

  // Fallback helper (#15) when CKEditor iframe isn't attached yet
  function insertGlycemicRowInCkeditor() {
    const currentHtml = getActiveCkeditorHtml();
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = currentHtml;

    if (window.__SIAAMS_RTE__) {
      const added = window.__SIAAMS_RTE__.insertGlycemicRow(tempDiv);
      if (!added) {
        tempDiv.insertAdjacentHTML('beforeend', window.__SIAAMS_RTE__.glycemicTableHtml());
      }
    }

    const updatedHtml = tempDiv.innerHTML;
    if (window.CKEDITOR && window.CKEDITOR.instances) {
      const inst = window.CKEDITOR.instances.ToolPopUPHTML_fck || Object.values(window.CKEDITOR.instances)[0];
      if (inst && typeof inst.setData === 'function') {
        inst.setData(updatedHtml);
      }
    }
    const fckTextarea = document.getElementById('ToolPopUPHTML_fck');
    if (fckTextarea) fckTextarea.value = updatedHtml;
  }

  // ---------------------------------------------------------------------------
  // 5. Visual Editor & In-Page Rich Editor (Word + Notion) for checkout.asp
  //    & checkin.asp HTML fields (#8)
  // ---------------------------------------------------------------------------
  function upgradeCheckoutRawHtmlTextareas() {
    const targets = [
      { id: 'sEpicrisys', labelKey: 'checkout.epicrisis' },
      { id: 'sRecommendations', labelKey: 'checkout.extras' }
    ];

    targets.forEach(({ id, labelKey }) => {
      const textarea = document.getElementById(id);
      if (!textarea || textarea.dataset.siaamsUpgraded === '1') return;
      textarea.dataset.siaamsUpgraded = '1';

      let inlineRteCtrl = null;

      const wrapper = document.createElement('div');
      wrapper.className = 'siaams-rich-field-card';
      wrapper.innerHTML = `
        <div class="siaams-rich-field-toolbar">
          <div class="siaams-rich-field-title">
            📑 <strong data-i18n="${labelKey}">${escapeHtml(t(labelKey))}</strong>
            <span class="siaams-badge-clean" data-i18n="checkout.badge">${escapeHtml(t('checkout.badge'))}</span>
          </div>
          <div class="siaams-rich-field-actions">
            <button type="button" class="siaams-rich-btn siaams-rich-btn-primary" data-action="open-ckeditor" data-target="${id}" data-i18n="checkout.openCke">
              ${escapeHtml(t('checkout.openCke'))}
            </button>
            <button type="button" class="siaams-rich-btn siaams-rich-btn-inline" data-action="toggle-inline-edit" data-target="${id}" data-i18n="checkout.inlineEdit">
              ${escapeHtml(t('checkout.inlineEdit'))}
            </button>
            <button type="button" class="siaams-rich-btn siaams-rich-btn-raw" data-action="toggle-raw" data-target="${id}" data-i18n-html="checkout.raw">
              ${t('checkout.raw')}
            </button>
          </div>
        </div>
        <div id="siaams-rte-slot-${id}" class="siaams-inline-rte-slot"></div>
        <div id="siaams-preview-${id}" class="siaams-formatted-preview" contenteditable="false" spellcheck="false"></div>
      `;

      textarea.parentNode.insertBefore(wrapper, textarea);
      const previewEl = wrapper.querySelector(`#siaams-preview-${id}`);
      const rteSlot = wrapper.querySelector(`#siaams-rte-slot-${id}`);
      previewEl.innerHTML = textarea.value || `<em>${escapeHtml(t('common.empty'))}</em>`;

      textarea.classList.add('siaams-raw-textarea-hidden');

      const syncPreviewToTextarea = () => {
        textarea.value = previewEl.innerHTML;
        const updatedInput = textarea.parentElement?.querySelector('.HtmlUpdated');
        if (updatedInput) updatedInput.value = '1';
        markUnsavedServerChanges(true, id);
      };

      textarea.addEventListener('input', () => {
        previewEl.innerHTML = textarea.value;
        markUnsavedServerChanges(true, id);
      });

      previewEl.addEventListener('input', syncPreviewToTextarea);

      wrapper.querySelector('[data-action="open-ckeditor"]')?.addEventListener('click', () => {
        if (typeof window.__SIAAMS_ENSURE_JQUERY_PLUGINS__ === 'function') {
          window.__SIAAMS_ENSURE_JQUERY_PLUGINS__();
        }
        if (typeof window.ShowPopUpHtmlInput === 'function') {
          window.ShowPopUpHtmlInput(textarea, id, APP_BASE);
        }
      });

      const inlineBtn = wrapper.querySelector('[data-action="toggle-inline-edit"]');
      inlineBtn?.addEventListener('click', () => {
        const isEditing = previewEl.getAttribute('contenteditable') === 'true';
        if (isEditing) {
          previewEl.setAttribute('contenteditable', 'false');
          previewEl.classList.remove('siaams-inline-editing');
          inlineBtn.setAttribute('data-i18n', 'checkout.inlineEdit');
          inlineBtn.textContent = t('checkout.inlineEdit');
          if (inlineRteCtrl) {
            inlineRteCtrl.detach();
            inlineRteCtrl = null;
          }
          syncPreviewToTextarea();
          runAutoSaveSnapshot(true);
        } else {
          previewEl.setAttribute('contenteditable', 'true');
          previewEl.classList.add('siaams-inline-editing');
          inlineBtn.setAttribute('data-i18n', 'checkout.inlineDone');
          inlineBtn.textContent = t('checkout.inlineDone');
          if (window.__SIAAMS_RTE__ && !inlineRteCtrl) {
            inlineRteCtrl = window.__SIAAMS_RTE__.attach(previewEl, {
              mount: (tb) => rteSlot.appendChild(tb),
              placeholder: true,
              onChange: () => {
                syncPreviewToTextarea();
                runAutoSaveSnapshot(false);
              }
            });
          }
          previewEl.focus();
        }
      });

      const rawBtn = wrapper.querySelector('[data-action="toggle-raw"]');
      rawBtn?.addEventListener('click', () => {
        textarea.classList.toggle('siaams-raw-textarea-hidden');
      });
    });
  }

  // Also upgrade checkin.asp in-page preview divs next to hidden inputs (#sExamCI, #sDayDiagnosis*)
  // so doctors can edit directly in-page with the Word + Notion toolbar on admission charts too!
  function upgradeCheckinInlinePreviews() {
    const form = document.forms?.frmEdit;
    if (!form) return;

    const hiddenHtmlInputs = Array.from(form.querySelectorAll('input[type="hidden"][id^="sExamCI"], input[type="hidden"][id^="sDayDiagnosis"]'));
    hiddenHtmlInputs.forEach((input) => {
      const id = input.id;
      const previewDiv = input.nextElementSibling;
      if (!previewDiv || previewDiv.tagName !== 'DIV' || previewDiv.dataset.siaamsInlineUpgraded === '1') return;
      previewDiv.dataset.siaamsInlineUpgraded = '1';
      previewDiv.id = `siaams-preview-${id}`;
      previewDiv.classList.add('siaams-checkin-inline-preview');

      // Sync full value into preview so editing never truncates at 1200 chars
      if (input.value) {
        previewDiv.innerHTML = input.value;
      }

      const bar = document.createElement('div');
      bar.className = 'siaams-checkin-inline-bar';
      bar.innerHTML = `
        <button type="button" class="siaams-rich-btn siaams-rich-btn-inline siaams-btn-sm" data-action="checkin-inline-toggle" data-i18n="checkout.inlineEdit">
          ${escapeHtml(t('checkout.inlineEdit'))}
        </button>
      `;
      const slot = document.createElement('div');
      slot.className = 'siaams-inline-rte-slot';
      previewDiv.parentNode.insertBefore(bar, previewDiv);
      previewDiv.parentNode.insertBefore(slot, previewDiv);

      let rteCtrl = null;
      const syncBack = () => {
        input.value = previewDiv.innerHTML;
        const updatedInput = input.parentElement?.querySelector('.HtmlUpdated');
        if (updatedInput) updatedInput.value = '1';
        markUnsavedServerChanges(true, id);
      };

      previewDiv.addEventListener('input', syncBack);

      const toggleBtn = bar.querySelector('[data-action="checkin-inline-toggle"]');
      toggleBtn?.addEventListener('click', () => {
        const isEditing = previewDiv.getAttribute('contenteditable') === 'true';
        if (isEditing) {
          previewDiv.setAttribute('contenteditable', 'false');
          previewDiv.classList.remove('siaams-inline-editing');
          toggleBtn.setAttribute('data-i18n', 'checkout.inlineEdit');
          toggleBtn.textContent = t('checkout.inlineEdit');
          if (rteCtrl) { rteCtrl.detach(); rteCtrl = null; }
          syncBack();
          runAutoSaveSnapshot(true);
        } else {
          if (input.value) previewDiv.innerHTML = input.value;
          previewDiv.setAttribute('contenteditable', 'true');
          previewDiv.classList.add('siaams-inline-editing');
          toggleBtn.setAttribute('data-i18n', 'checkout.inlineDone');
          toggleBtn.textContent = t('checkout.inlineDone');
          if (window.__SIAAMS_RTE__ && !rteCtrl) {
            rteCtrl = window.__SIAAMS_RTE__.attach(previewDiv, {
              mount: (tb) => slot.appendChild(tb),
              placeholder: true,
              onChange: () => {
                syncBack();
                runAutoSaveSnapshot(false);
              }
            });
          }
          previewDiv.focus();
        }
      });
    });
  }

  // ---------------------------------------------------------------------------
  // 6. Auto-Save Vault & 1-Click Crash Recovery Banner (#6)
  // ---------------------------------------------------------------------------
  function getTrackedFieldsMap() {
    const fields = {};
    const form = document.forms?.frmEdit;
    if (!form) return fields;

    const elements = form.querySelectorAll('textarea, input[type="text"], input[type="hidden"][id^="sExamCI"], input[type="hidden"][id^="sDayDiagnosis"], select');
    elements.forEach((el) => {
      const key = el.id || el.name;
      if (!key) return;
      if (key === 'suppSearch' || key === 'reloadValueRefresh') return;
      fields[key] = el.value;
    });

    const popupEl = document.getElementById('ToolPopUPHTML');
    if (popupEl && popupEl.offsetParent !== null) {
      const activeFieldId = popupEl.getAttribute('Info');
      if (activeFieldId) {
        const liveCke = getActiveCkeditorHtml();
        if (liveCke) {
          fields[activeFieldId] = liveCke;
        }
      }
    }

    return fields;
  }

  function computeFieldsDiff(currentMap, baselineMap) {
    const changedFields = {};
    for (const [ k, val ] of Object.entries(currentMap)) {
      if (baselineMap[k] !== undefined && baselineMap[k] !== val) {
        changedFields[k] = val;
      }
    }
    return changedFields;
  }

  function initAutoSaveVault() {
    if (window.__SIAAMS_VAULT_UI__) {
      window.__SIAAMS_VAULT_UI__.configure({
        getPageVaultInfo,
        restoreSnapshotToDom,
        restoreWithMerge,
        updateHistoryCountBadge,
        formatFriendlyFieldName
      });
    }

    const info = getPageVaultInfo();
    if (!info.isClinicalForm) return;

    initialFieldBaseline = getTrackedFieldsMap();
    confirmPendingServerSaveIfSucceeded(info);
    checkAndRenderCrashRecoveryBanner(info);
    processPendingCrossPageRestore(info);

    document.forms.frmEdit.addEventListener('input', (e) => {
      const target = e.target;
      if (target && (target.tagName === 'TEXTAREA' || target.tagName === 'INPUT' || target.tagName === 'SELECT')) {
        markUnsavedServerChanges(true, target.id || target.name);
      }
    });

    window.addEventListener('siaams:before-submit', () => {
      isSubmittingToServer = true;
      runAutoSaveSnapshot(true);
      markVaultPendingServerSave(info);
      markUnsavedServerChanges(false);
    });

    installAjaxSaveCleanupHook(info);

    window.addEventListener('beforeunload', (e) => {
      if (hasUnsavedServerChanges && !isSubmittingToServer) {
        runAutoSaveSnapshot(true);
        e.preventDefault();
        e.returnValue = t('unsaved.beforeUnload');
        return e.returnValue;
      }
    });

    setInterval(() => {
      runAutoSaveSnapshot(false);
    }, AUTOSAVE_INTERVAL_MS);
  }

  function hasRealServerError() {
    const divError = document.getElementById('divError');
    if (!divError || divError.dataset.siaamsSuppressedError === '1') return false;
    const txt = (divError.textContent || '').trim();
    if (!txt) return false;
    if (txt.includes('Nu aveti suficiente drepturi pentru pagina ceruta')) return false;
    return /eroare|error|invalid|nu a fost salvat|failed|esuat/i.test(txt);
  }

  function clearBranchChurn(info, branchId) {
    if (!info || !branchId) return false;
    let removed = false;
    try {
      const rawHist = localStorage.getItem(info.historyKey);
      const hist = rawHist ? JSON.parse(rawHist) : [];
      const nextHist = Array.isArray(hist) ? hist.filter((item) => item && item.branchId !== branchId) : [];
      removed = nextHist.length !== (Array.isArray(hist) ? hist.length : 0);

      if (nextHist.length === 0) {
        localStorage.removeItem(info.historyKey);
        localStorage.removeItem(info.vaultKey);
      } else {
        localStorage.setItem(info.historyKey, JSON.stringify(nextHist));
        const rawVault = localStorage.getItem(info.vaultKey);
        if (rawVault) {
          const curVault = JSON.parse(rawVault);
          if (curVault && curVault.branchId === branchId) {
            const nextUnsynced = nextHist.find((x) => !x.syncedToServer);
            if (nextUnsynced) localStorage.setItem(info.vaultKey, JSON.stringify(nextUnsynced));
            else localStorage.removeItem(info.vaultKey);
          }
        }
      }

      if (branchId === activeBranchId) {
        activeBranchId = null;
        activeForkedFrom = null;
        lastSavedHash = '';
      }
      lastAutoSaveState = 'serverCleared';
      refreshDynamicTopBarLabels();
      updateHistoryCountBadge();
    } catch (_e) {}
    return removed;
  }

  function markVaultPendingServerSave(info) {
    if (!activeBranchId) return;
    try {
      sessionStorage.setItem(
        `siaams_pending_save_${info.vaultKey}`,
        JSON.stringify({ branchId: activeBranchId, timestamp: Date.now() })
      );
      const raw = localStorage.getItem(info.vaultKey);
      if (raw) {
        const snap = JSON.parse(raw);
        if (snap && snap.branchId === activeBranchId) {
          snap.pendingServerSave = true;
          localStorage.setItem(info.vaultKey, JSON.stringify(snap));
        }
      }
      const rawHist = localStorage.getItem(info.historyKey);
      if (rawHist) {
        const hist = JSON.parse(rawHist);
        if (Array.isArray(hist)) {
          const item = hist.find((x) => x && x.branchId === activeBranchId);
          if (item) {
            item.pendingServerSave = true;
            localStorage.setItem(info.historyKey, JSON.stringify(hist));
          }
        }
      }
    } catch (_e) {}
  }

  function confirmPendingServerSaveIfSucceeded(info) {
    const pendingKey = `siaams_pending_save_${info.vaultKey}`;
    try {
      const raw = sessionStorage.getItem(pendingKey);
      if (!raw) return;
      sessionStorage.removeItem(pendingKey);
      const pending = JSON.parse(raw);
      if (!pending || !pending.branchId) return;
      // Ignore stale markers older than 2 minutes
      if (Date.now() - (pending.timestamp || 0) > 2 * 60 * 1000) return;

      const isLoginPage = window.location.pathname.toLowerCase().includes('default.asp') ||
                          window.location.pathname.toLowerCase().includes('logon.asp') ||
                          !document.forms?.frmEdit;

      if (!isLoginPage && !hasRealServerError()) {
        clearBranchChurn(info, pending.branchId);
      } else {
        // Server save did not succeed — clear pending flag so crash recovery banner stays active
        const rawVault = localStorage.getItem(info.vaultKey);
        if (rawVault) {
          const snap = JSON.parse(rawVault);
          if (snap && snap.branchId === pending.branchId) {
            delete snap.pendingServerSave;
            localStorage.setItem(info.vaultKey, JSON.stringify(snap));
          }
        }
      }
    } catch (_e) {}
  }

  function installAjaxSaveCleanupHook(info) {
    if (window.__SIAAMS_AJAX_SAVE_HOOKED__) return;
    window.__SIAAMS_AJAX_SAVE_HOOKED__ = true;

    const isAjaxSaveResponseOk = (status, bodyText) => {
      if (status !== 200) return false;
      const tLower = String(bodyText || '').trim().toLowerCase();
      if (tLower.includes('strpwd') || tLower.includes('logon.asp') || tLower.includes('eroare')) return false;
      return true;
    };

    if (typeof window.fetch === 'function') {
      const origFetch = window.fetch.bind(window);
      window.fetch = async function (input, init) {
        const res = await origFetch(input, init);
        try {
          const url = typeof input === 'string' ? input : (input?.url || '');
          const method = String(init?.method || input?.method || 'GET').toUpperCase();
          if (method !== 'GET' && url.includes(APP_BASE) && !url.includes('menu.asp') && activeBranchId) {
            const clone = res.clone();
            const txt = await clone.text();
            if (isAjaxSaveResponseOk(res.status, txt)) {
              clearBranchChurn(info, activeBranchId);
            }
          }
        } catch (_e) {}
        return res;
      };
    }

    const origOpen = XMLHttpRequest.prototype.open;
    const origSend = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.open = function (method, url) {
      this._siaamsMethod = String(method || 'GET').toUpperCase();
      this._siaamsUrl = String(url || '');
      return origOpen.apply(this, arguments);
    };
    XMLHttpRequest.prototype.send = function () {
      if (this._siaamsMethod !== 'GET' && this._siaamsUrl.includes(APP_BASE) && !this._siaamsUrl.includes('menu.asp')) {
        this.addEventListener('load', () => {
          if (activeBranchId && isAjaxSaveResponseOk(this.status, this.responseText)) {
            clearBranchChurn(info, activeBranchId);
          }
        });
      }
      return origSend.apply(this, arguments);
    };
  }

  function runAutoSaveSnapshot(forceSave = false) {
    const info = getPageVaultInfo();
    if (!info.isClinicalForm) return;

    const currentMap = getTrackedFieldsMap();
    const changedFields = computeFieldsDiff(currentMap, initialFieldBaseline);
    const changedKeys = Object.keys(changedFields);

    if (changedKeys.length === 0 && !forceSave) {
      return;
    }

    const hash = JSON.stringify(changedFields);
    if (hash === lastSavedHash && !forceSave) {
      return;
    }
    lastSavedHash = hash;

    if (changedKeys.length === 0) return;

    const now = Date.now();
    const timeStr = new Date(now).toLocaleTimeString(locale(), {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });

    if (!activeBranchId) {
      activeBranchId = generateBranchId();
    }

    try {
      const rawHist = localStorage.getItem(info.historyKey);
      const hist = rawHist ? JSON.parse(rawHist) : [];
      const existingIdx = Array.isArray(hist) ? hist.findIndex((x) => x && x.branchId === activeBranchId) : -1;
      const prev = existingIdx >= 0 ? hist[existingIdx] : null;

      const snapshot = {
        branchId: activeBranchId,
        forkedFrom: prev ? prev.forkedFrom : activeForkedFrom,
        createdAt: prev ? (prev.createdAt || prev.timestamp || now) : now,
        saveCount: prev ? ((prev.saveCount || 1) + 1) : 1,
        vaultKey: info.vaultKey,
        pageType: info.pageType,
        recordId: info.recordId,
        pageUrl: window.location.pathname + window.location.search,
        editorState: detectCurrentEditorState(changedKeys),
        patientTitle: info.patientTitle,
        timestamp: now,
        timeFormatted: new Date(now).toLocaleString(locale()),
        syncedToServer: false,
        changedFieldNames: changedKeys,
        changedFields
      };

      localStorage.setItem(info.vaultKey, JSON.stringify(snapshot));

      if (existingIdx >= 0) {
        // Continuity: remove old position and place updated branch at index 0
        hist.splice(existingIdx, 1);
      }
      hist.unshift(snapshot);
      if (hist.length > MAX_DRAFT_HISTORY) {
        hist.length = MAX_DRAFT_HISTORY;
      }
      localStorage.setItem(info.historyKey, JSON.stringify(hist));

      lastAutoSaveTime = timeStr;
      lastAutoSaveState = 'savedAt';
      refreshDynamicTopBarLabels();
      updateHistoryCountBadge();
    } catch (e) {
      console.warn('[SIAAMS Vault] Eroare la salvarea în localStorage:', e);
    }
  }

  function markVaultSyncedToServer() {
    const info = getPageVaultInfo();
    try {
      const raw = localStorage.getItem(info.vaultKey);
      if (raw) {
        const snap = JSON.parse(raw);
        snap.syncedToServer = true;
        localStorage.setItem(info.vaultKey, JSON.stringify(snap));
      }
      const rawHist = localStorage.getItem(info.historyKey);
      if (rawHist) {
        const hist = JSON.parse(rawHist);
        if (Array.isArray(hist) && hist[0]) {
          hist[0].syncedToServer = true;
          localStorage.setItem(info.historyKey, JSON.stringify(hist));
        }
      }
    } catch (_e) {}
  }

  function markUnsavedServerChanges(unsaved) {
    hasUnsavedServerChanges = unsaved;
    const warnEl = document.getElementById('siaams-unsaved-warning');
    if (warnEl) {
      warnEl.style.display = unsaved ? 'flex' : 'none';
    }
    const spn = document.getElementById('sAlertChange');
    if (spn) {
      spn.style.visibility = unsaved ? 'visible' : 'hidden';
    }
  }

  function checkAndRenderCrashRecoveryBanner(info) {
    try {
      const raw = localStorage.getItem(info.vaultKey);
      if (!raw) return;
      const snap = JSON.parse(raw);
      if (!snap || snap.syncedToServer || !snap.changedFields) return;

      const differingKeys = Object.keys(snap.changedFields).filter(
        (k) => initialFieldBaseline[k] !== undefined && initialFieldBaseline[k] !== snap.changedFields[k]
      );

      if (differingKeys.length === 0) return;

      const banner = document.createElement('div');
      banner.id = 'siaams-crash-recovery-banner';
      let restoredState = false;

      const renderBannerContent = () => {
        const timeStr = snap.timestamp ? new Date(snap.timestamp).toLocaleString(locale()) : (snap.timeFormatted || '');
        if (restoredState) {
          banner.innerHTML = `<div class="siaams-recovery-restored">${t('banner.restored', { time: escapeHtml(timeStr) })}</div>`;
          return;
        }
        const friendlyNames = differingKeys.map(formatFriendlyFieldName).join(', ');
        banner.innerHTML = `
          <div class="siaams-recovery-icon">🛡️</div>
          <div class="siaams-recovery-body">
            <div class="siaams-recovery-title">
              ${t('banner.title', { time: escapeHtml(timeStr) })}
            </div>
            <div class="siaams-recovery-subtitle">
              ${t('banner.subtitle', { fields: escapeHtml(friendlyNames) })}
            </div>
          </div>
          <div class="siaams-recovery-actions">
            <button type="button" id="siaams-btn-restore-draft" class="siaams-recovery-btn siaams-recovery-btn-restore">
              ${escapeHtml(t('banner.restore'))}
            </button>
            <button type="button" id="siaams-btn-open-draft-viewer" class="siaams-recovery-btn siaams-recovery-btn-history">
              ${escapeHtml(t('banner.view'))}
            </button>
            <button type="button" id="siaams-btn-view-drafts" class="siaams-recovery-btn siaams-recovery-btn-history">
              ${escapeHtml(t('banner.history'))}
            </button>
            <button type="button" id="siaams-btn-dismiss-draft" class="siaams-recovery-btn siaams-recovery-btn-dismiss">
              ${escapeHtml(t('banner.dismiss'))}
            </button>
          </div>
        `;

        document.getElementById('siaams-btn-restore-draft')?.addEventListener('click', () => {
          restoreWithMerge(snap, { resumeBranch: true });
          restoredState = true;
          renderBannerContent();
        });

        document.getElementById('siaams-btn-open-draft-viewer')?.addEventListener('click', () => {
          if (window.__SIAAMS_VAULT_UI__) window.__SIAAMS_VAULT_UI__.openDraftViewerModal(snap, null, true);
        });

        document.getElementById('siaams-btn-view-drafts')?.addEventListener('click', () => {
          openDraftHistoryModal();
        });

        document.getElementById('siaams-btn-dismiss-draft')?.addEventListener('click', () => {
          snap.syncedToServer = true;
          localStorage.setItem(info.vaultKey, JSON.stringify(snap));
          banner.remove();
        });
      };

      const targetContainer = document.getElementById('divContent') || document.body;
      targetContainer.prepend(banner);
      renderBannerContent();

      if (i18n) {
        i18n.onChange(() => {
          if (document.body.contains(banner)) renderBannerContent();
        });
      }
    } catch (e) {
      console.warn('[SIAAMS Vault] Eroare la verificarea ciornei:', e);
    }
  }

  function detectCurrentEditorState(changedKeys) {
    const popupEl = document.getElementById('ToolPopUPHTML');
    if (popupEl && popupEl.offsetParent !== null) {
      const fId = popupEl.getAttribute('Info');
      if (fId) return { mode: 'ckeditor', fieldId: fId };
    }
    const activeInline = document.querySelector('[id^="siaams-preview-"][contenteditable="true"]');
    if (activeInline) {
      return { mode: 'inline', fieldId: activeInline.id.replace('siaams-preview-', '') };
    }
    const htmlKey = (changedKeys || []).find((k) => /^(sExamCI|sEpicrisys|sRecommendations|sDayDiagnosis)/.test(k));
    return { mode: htmlKey ? 'ckeditor' : 'form', fieldId: htmlKey || (changedKeys && changedKeys[0]) || null };
  }

  function processPendingCrossPageRestore(info) {
    try {
      const raw = sessionStorage.getItem('siaams_pending_restore');
      if (!raw) return;
      const pending = JSON.parse(raw);
      if (!pending || !pending.snapshot) return;
      if (pending.snapshot.vaultKey && pending.snapshot.vaultKey !== info.vaultKey) return;
      sessionStorage.removeItem('siaams_pending_restore');
      setTimeout(() => {
        restoreWithMerge(pending.snapshot, pending.opts || {});
      }, 350);
    } catch (_e) {}
  }

  function openEditorForField(fieldId, mode) {
    const el = document.getElementById(fieldId);
    if (!el) return;
    if (mode === 'inline') {
      const toggleBtn = document.querySelector(`[data-action="toggle-inline-edit"][data-target="${fieldId}"]`) ||
                        document.getElementById(`siaams-preview-${fieldId}`)?.previousElementSibling?.previousElementSibling?.querySelector('[data-action="checkin-inline-toggle"]');
      const preview = document.getElementById(`siaams-preview-${fieldId}`);
      if (preview && preview.getAttribute('contenteditable') !== 'true' && toggleBtn) {
        toggleBtn.click();
      }
      preview?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    if (typeof window.ShowPopUpHtmlInput === 'function' && /^(sExamCI|sEpicrisys|sRecommendations|sDayDiagnosis)/.test(fieldId)) {
      if (typeof window.__SIAAMS_ENSURE_JQUERY_PLUGINS__ === 'function') {
        window.__SIAAMS_ENSURE_JQUERY_PLUGINS__();
      }
      window.ShowPopUpHtmlInput(el, fieldId, APP_BASE);
    }
  }

  function restoreWithMerge(snap, opts = {}) {
    if (!snap || !snap.changedFields) return;
    const keys = Object.keys(snap.changedFields);
    if (!keys.length) return;

    const targetFieldId = (snap.editorState && snap.editorState.fieldId && snap.changedFields[snap.editorState.fieldId] !== undefined)
      ? snap.editorState.fieldId
      : (keys.find((k) => /^(sExamCI|sEpicrisys|sRecommendations|sDayDiagnosis)/.test(k)) || keys[0]);

    const targetEl = document.getElementById(targetFieldId) || document.forms?.frmEdit?.elements?.[targetFieldId];
    const currentHtml = targetEl ? String(targetEl.value || '') : '';
    const draftHtml = String(snap.changedFields[targetFieldId] || '');
    const mode = snap.editorState?.mode || (/^(sExamCI|sEpicrisys|sRecommendations|sDayDiagnosis)/.test(targetFieldId) ? 'ckeditor' : 'form');

    // Open the editor where the user was working
    if (mode === 'ckeditor' || mode === 'inline') {
      openEditorForField(targetFieldId, mode);
    }

    if (window.__SIAAMS_MERGE__ && /^(sExamCI|sEpicrisys|sRecommendations|sDayDiagnosis)/.test(targetFieldId)) {
      window.__SIAAMS_MERGE__.openMergeRestore({
        fieldLabel: formatFriendlyFieldName(targetFieldId),
        currentHtml,
        draftHtml,
        onAccept: (mergedHtml) => {
          const finalSnap = {
            ...snap,
            changedFields: { ...snap.changedFields, [targetFieldId]: mergedHtml }
          };
          restoreSnapshotToDom(finalSnap, opts);
          // Also push merged HTML into open CKEditor if active
          const popupEl = document.getElementById('ToolPopUPHTML');
          if (popupEl && popupEl.offsetParent !== null && popupEl.getAttribute('Info') === targetFieldId) {
            if (window.CKEDITOR && window.CKEDITOR.instances) {
              const inst = window.CKEDITOR.instances.ToolPopUPHTML_fck || Object.values(window.CKEDITOR.instances)[0];
              if (inst && typeof inst.setData === 'function') inst.setData(mergedHtml);
            }
            const fckTa = document.getElementById('ToolPopUPHTML_fck');
            if (fckTa) fckTa.value = mergedHtml;
          }
        }
      });
    } else {
      restoreSnapshotToDom(snap, opts);
    }
  }

  function restoreSnapshotToDom(snap, opts = {}) {
    if (!snap || !snap.changedFields) return;
    if (opts.resumeBranch && snap.branchId) {
      activeBranchId = snap.branchId;
      activeForkedFrom = snap.forkedFrom || null;
    } else {
      activeBranchId = null;
      activeForkedFrom = snap.branchId || null;
    }
    lastSavedHash = '';
    for (const [ key, val ] of Object.entries(snap.changedFields)) {
      const el = document.getElementById(key) || document.forms?.frmEdit?.elements?.[key];
      if (!el) continue;
      el.value = val;

      const nextEl = el.nextElementSibling;
      if (nextEl && nextEl.tagName === 'DIV' && !nextEl.classList.contains('siaams-formatted-preview')) {
        nextEl.innerHTML = String(val);
      }

      const customPreview = document.getElementById(`siaams-preview-${key}`);
      if (customPreview) {
        customPreview.innerHTML = val;
      }

      const updatedInput = el.parentElement?.querySelector('.HtmlUpdated');
      if (updatedInput) {
        updatedInput.value = '1';
      }
    }
    if (document.forms?.frmEdit && typeof document.forms.frmEdit.dirty === 'function') {
      document.forms.frmEdit.dirty();
    }
    markUnsavedServerChanges(true);
    runAutoSaveSnapshot(true);
  }

  function updateHistoryCountBadge() {
    const info = getPageVaultInfo();
    const countEl = document.getElementById('siaams-history-count');
    if (!countEl) return;
    try {
      const raw = localStorage.getItem(info.historyKey);
      const list = raw ? JSON.parse(raw) : [];
      countEl.textContent = String(list.length);
    } catch (_e) {
      countEl.textContent = '0';
    }
  }

  function openDraftHistoryModal() {
    if (window.__SIAAMS_VAULT_UI__) {
      window.__SIAAMS_VAULT_UI__.openDraftHistoryModal();
    }
  }

  function formatFriendlyFieldName(fieldId) {
    if (fieldId === 'sExamCI') return `${t('field.sExamCI')} (sExamCI)`;
    if (fieldId === 'sEpicrisys') return `${t('field.sEpicrisys')} (sEpicrisys)`;
    if (fieldId === 'sRecommendations') return `${t('field.sRecommendations')} (sRecommendations)`;
    if (fieldId.startsWith('sDayDiagnosis')) return `${t('field.sDayDiagnosis')} (${fieldId})`;
    if (fieldId === 'sCOTextDiagnosis') return t('field.sCOTextDiagnosis');
    return fieldId;
  }

  // ---------------------------------------------------------------------------
  // 7. Auto-Expand Hidden Patient/Referral Header <tool:ah id="ah1"> (#10)
  // ---------------------------------------------------------------------------
  function autoExpandHiddenPatientCard() {
    const ah1 = document.getElementById('ah1');
    if (!ah1) return;

    ah1.style.display = 'block';
    ah1.classList.add('siaams-expanded-patient-card');

    if (!document.getElementById('siaams-ah1-toggle-bar')) {
      const toggleBar = document.createElement('div');
      toggleBar.id = 'siaams-ah1-toggle-bar';
      toggleBar.className = 'siaams-ah1-header';
      toggleBar.innerHTML = `
        <span data-i18n-html="ah1.title">${t('ah1.title')}</span>
        <button type="button" class="siaams-btn-tiny" data-i18n="ah1.toggle">${escapeHtml(t('ah1.toggle'))}</button>
      `;
      toggleBar.addEventListener('click', () => {
        const isHidden = ah1.style.display === 'none';
        ah1.style.display = isHidden ? 'block' : 'none';
      });
      ah1.parentNode.insertBefore(toggleBar, ah1);
    }
  }

  // ---------------------------------------------------------------------------
  // 8. Native Date Picker Bridge (calendar.htc replacement, #12)
  // ---------------------------------------------------------------------------
  function upgradeDatePickersAndInputs() {
    const calImgs = document.querySelectorAll('img[id="imgShowCal"], img[ahParent]');
    calImgs.forEach((img) => {
      if (img.dataset.siaamsCalUpgraded === '1') return;
      img.dataset.siaamsCalUpgraded = '1';

      const targetName = img.getAttribute('ahParent');
      if (!targetName) return;

      const targetInput = document.getElementById(targetName) ||
                          document.forms?.frmEdit?.elements?.[targetName] ||
                          document.getElementsByName(targetName)[0];
      if (!targetInput) return;

      img.style.cursor = 'pointer';
      img.setAttribute('data-i18n-title', 'date.pickerTitle');
      img.title = t('date.pickerTitle');

      const nativeDate = document.createElement('input');
      nativeDate.type = 'date';
      nativeDate.className = 'siaams-hidden-date-picker';
      img.parentNode.insertBefore(nativeDate, img.nextSibling);

      img.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const m = String(targetInput.value || '').trim().match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{4})$/);
        if (m) {
          nativeDate.value = `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
        }
        if (typeof nativeDate.showPicker === 'function') {
          try {
            nativeDate.showPicker();
            return;
          } catch (_err) {}
        }
        nativeDate.focus();
        nativeDate.click();
      });

      nativeDate.addEventListener('change', () => {
        if (!nativeDate.value) return;
        const [ yyyy, mm, dd ] = nativeDate.value.split('-');
        if (yyyy && mm && dd) {
          targetInput.value = `${dd}/${mm}/${yyyy}`;
          targetInput.dispatchEvent(new Event('change', { bubbles: true }));
          markUnsavedServerChanges(true, targetName);
        }
      });

      targetInput.addEventListener('blur', () => {
        const val = String(targetInput.value || '').trim();
        const m = val.match(/^(\d{1,2})[.\-](\d{1,2})[.\-](\d{4})$/);
        if (m) {
          targetInput.value = `${m[1].padStart(2, '0')}/${m[2].padStart(2, '0')}/${m[3]}`;
        }
      });
    });
  }

  // ---------------------------------------------------------------------------
  // 9. Suppress False-Positive "Nu aveti suficiente drepturi" Banner (#27)
  // ---------------------------------------------------------------------------
  function cleanFalsePositivePermissionError() {
    const divError = document.getElementById('divError');
    if (!divError) return;
    if (
      divError.textContent.includes('Nu aveti suficiente drepturi pentru pagina ceruta') &&
      document.forms?.frmEdit
    ) {
      divError.dataset.siaamsSuppressedError = '1';
      divError.innerHTML = `<div style="color:#15803d; font-weight:600;" data-i18n="perm.ok">${escapeHtml(t('perm.ok'))}</div>`;
    }
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------
  function escapeHtml(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function escapeAttr(str) {
    return escapeHtml(str);
  }

  // ---------------------------------------------------------------------------
  // Bootstrapping
  // ---------------------------------------------------------------------------
  function boot() {
    createTopStatusBar();
    initModernSidebar();
    autoExpandHiddenPatientCard();
    upgradeCkeditorModalAndSavePipeline();
    upgradeCheckoutRawHtmlTextareas();
    upgradeCheckinInlinePreviews();
    upgradeDatePickersAndInputs();
    cleanFalsePositivePermissionError();
    initAutoSaveVault();

    if (i18n) {
      i18n.onChange(() => {
        refreshDynamicTopBarLabels();
        renderDirectPatientQuickLinks();
      });
    }

    setInterval(() => {
      pingSessionKeepAlive(false);
    }, KEEP_ALIVE_INTERVAL_MS);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
