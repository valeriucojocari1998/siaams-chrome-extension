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
  const DRAFT_PREFIX = 'siaams_draft_';
  const MAX_CHECKPOINTS = 35;

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
  let conflictServerMap = {};
  let lastServerCheckTs = 0;

  // ---------------------------------------------------------------------------
  // Utility: Identify current page & record key for the Auto-Save Vault
  // ---------------------------------------------------------------------------
  function extractPatientName(titleEl, pageType, id) {
    const raw = titleEl ? titleEl.textContent.replace(/\s+/g, ' ').trim() : '';
    if (raw) {
      const m = raw.match(/^(.+?)\s*-\s*FISA\b/i);
      if (m && m[1] && !/NECUNOSCUT|NUMARUL/i.test(m[1])) {
        return m[1].trim();
      }
    }
    const ah1 = document.getElementById('ah1');
    if (ah1) {
      const b = ah1.querySelector('b, strong');
      const bt = b ? b.textContent.replace(/\s+/g, ' ').trim() : '';
      if (bt && bt.length > 2 && !/PACIENT|PREZENTARE/i.test(bt)) return bt;
    }
    return raw || `${pageType.toUpperCase()} #${id}`;
  }

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
    const patientName = extractPatientName(titleEl, pageType, id);

    return {
      pageType,
      recordId: id,
      ciid,
      patientTitle,
      patientName,
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
        <span class="siaams-brand-badge">🛡️ Crash-Guard v1.1.4</span>
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
          <button type="button" id="siaams-cke-save-server" class="siaams-cke-btn siaams-cke-btn-primary" data-i18n="cke.saveServer" data-i18n-title="cke.saveServerTitle" title="${escapeAttr(t('cke.saveServerTitle'))}">
            ${escapeHtml(t('cke.saveServer'))}
          </button>
        </div>
      `;
      popupEl.appendChild(footer);

      document.getElementById('siaams-cke-cancel')?.addEventListener('click', () => {
        enhancedUpdatePopUpHtml(false);
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
        // Baseline dynamic fields (e.g., Zilnice sDayDiagnosis_*) before editing begins
        if (pReturnInputID && initialFieldBaseline[pReturnInputID] === undefined) {
          const targetField = document.getElementById(pReturnInputID) || document.forms?.frmEdit?.elements?.[pReturnInputID];
          if (targetField) initialFieldBaseline[pReturnInputID] = targetField.value;
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
          renderInEditorDraftBar(document.getElementById('siaams-cke-draft-bar'), popupEl.getAttribute('Info'));
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

        // Ensure draft status bar + RTE slot above CKEditor area
        let draftBarSlot = document.getElementById('siaams-cke-draft-bar');
        if (!draftBarSlot) {
          draftBarSlot = document.createElement('div');
          draftBarSlot.id = 'siaams-cke-draft-bar';
          const htmlDiv = popupEl.querySelector('div[name="htmldiv"]') || popupEl.firstElementChild;
          popupEl.insertBefore(draftBarSlot, htmlDiv);
        }
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
            const activeFieldId = popupEl.getAttribute('Info');
            if (activeFieldId) {
              markUnsavedServerChanges(true, activeFieldId);
              runAutoSaveSnapshot(true, activeFieldId);
            }
          },
          onChange: () => {
            try { inst?.updateElement?.(); } catch (_e) {}
            const activeFieldId = popupEl.getAttribute('Info');
            if (activeFieldId) markUnsavedServerChanges(true, activeFieldId);
            runAutoSaveSnapshot(false);
          }
        });

        // If the user closes via the dialog's top-right X button, keep the local draft synced
        if (window.$ && !popupEl.dataset.siaamsCloseBound) {
          popupEl.dataset.siaamsCloseBound = '1';
          try {
            window.$(popupEl).on('dialogbeforeclose', () => {
              if (!isSubmittingToServer) {
                syncCkeditorToTargetField(popupEl);
                runAutoSaveSnapshot(true, popupEl.getAttribute('Info'));
              }
            });
          } catch (_e) {}
        }

        renderInEditorDraftBar(draftBarSlot, popupEl.getAttribute('Info'));
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

  function syncCkeditorToTargetField(popupEl) {
    if (!popupEl) return null;
    const targetFieldId = popupEl.getAttribute('Info');
    if (!targetFieldId) return null;

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
        nextEl.innerHTML = finalHtml;
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
    return targetFieldId;
  }

  function enhancedUpdatePopUpHtml(saveToServer = false) {
    const popupEl = document.getElementById('ToolPopUPHTML');
    if (!popupEl) return;

    const targetFieldId = syncCkeditorToTargetField(popupEl);
    if (!targetFieldId) return;

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
    runAutoSaveSnapshot(true, targetFieldId);

    if (saveToServer) {
      triggerOneStepServerSave();
    }
  }

  async function triggerOneStepServerSave() {
    const info = getPageVaultInfo();
    const drafts = getRecordDrafts(info);

    // Pre-save 2-doctor conflict check (skipped if already confirmed or test-blocked unless explicitly requested)
    if (drafts.length > 0 && !window.__SIAAMS_SKIP_PRESAVE_CHECK__) {
      const conflict = await detectServerConflictViaGet(info, drafts);
      if (conflict) {
        conflictServerMap[conflict.fieldId] = conflict.serverHtml;
        refreshAllVisibleDraftBars();
        openCombineForField(conflict.fieldId, () => {
          triggerOneStepServerSave();
        });
        return;
      }
    }

    isSubmittingToServer = true;
    markUnsavedServerChanges(false);

    if (drafts.length > 0) {
      try {
        sessionStorage.setItem(
          `siaams_pending_save_${info.vaultKey}`,
          JSON.stringify({ draftKeys: drafts.map((d) => d.key), timestamp: Date.now() })
        );
      } catch (_e) {}
    }

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
        <div id="siaams-draft-bar-${id}" class="siaams-inline-draft-slot"></div>
        <div id="siaams-rte-slot-${id}" class="siaams-inline-rte-slot"></div>
        <div id="siaams-preview-${id}" class="siaams-formatted-preview" contenteditable="false" spellcheck="false"></div>
      `;

      textarea.parentNode.insertBefore(wrapper, textarea);
      const previewEl = wrapper.querySelector(`#siaams-preview-${id}`);
      const rteSlot = wrapper.querySelector(`#siaams-rte-slot-${id}`);
      const draftBarSlot = wrapper.querySelector(`#siaams-draft-bar-${id}`);
      previewEl.innerHTML = textarea.value || `<em>${escapeHtml(t('common.empty'))}</em>`;
      renderInEditorDraftBar(draftBarSlot, id);

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

    const hiddenHtmlInputs = Array.from(form.querySelectorAll('input[id^="sExamCI"], textarea[id^="sExamCI"], input[id^="sDayDiagnosis"], textarea[id^="sDayDiagnosis"]'));
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
      const draftBarSlot = document.createElement('div');
      draftBarSlot.id = `siaams-draft-bar-${id}`;
      draftBarSlot.className = 'siaams-inline-draft-slot';
      const slot = document.createElement('div');
      slot.className = 'siaams-inline-rte-slot';
      previewDiv.parentNode.insertBefore(bar, previewDiv);
      previewDiv.parentNode.insertBefore(draftBarSlot, previewDiv);
      previewDiv.parentNode.insertBefore(slot, previewDiv);
      renderInEditorDraftBar(draftBarSlot, id);

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
  // 6. v1.1.4 Simplified Per-Field Drafts + Back/Forward/Reset + 2-Doctor Combine
  // ---------------------------------------------------------------------------
  function isEditorFieldKey(key) {
    return Boolean(key) && /^(sExamCI|sEpicrisys|sRecommendations|sDayDiagnosis|sCOTextDiagnosis)/.test(key);
  }

  function getDraftKey(info, fieldId) {
    return `${DRAFT_PREFIX}${info.pageType}_${info.recordId}_${fieldId}`;
  }

  function readDraft(key) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch (_e) {
      return null;
    }
  }

  function writeDraft(key, draft) {
    try {
      localStorage.setItem(key, JSON.stringify(draft));
    } catch (e) {
      console.warn('[SIAAMS Draft] Eroare la salvarea în localStorage:', e);
    }
  }

  function getRecordDrafts(info) {
    const prefix = `${DRAFT_PREFIX}${info.pageType}_${info.recordId}_`;
    const list = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k || !k.startsWith(prefix)) continue;
      const d = readDraft(k);
      if (d && d.fieldId) list.push(d);
    }
    return list.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  }

  function normCompare(html) {
    const tmp = document.createElement('div');
    tmp.innerHTML = String(html || '').trim();
    if (tmp.children.length === 1 && tmp.firstElementChild.tagName === 'DIV') {
      const st = tmp.firstElementChild.getAttribute('style') || '';
      if (st.includes('overflow-wrap')) {
        tmp.innerHTML = tmp.firstElementChild.innerHTML;
      }
    }
    return tmp.innerHTML.replace(/\s+/g, ' ').trim();
  }

  function getTrackedFieldsMap() {
    const fields = {};
    const form = document.forms?.frmEdit;
    if (!form) return fields;

    const elements = form.querySelectorAll(
      '[id^="sExamCI"], [id^="sEpicrisys"], [id^="sRecommendations"], [id="sCOTextDiagnosis"], ' +
      '[id^="sDayDiagnosis"], [name^="sDayDiagnosis"]'
    );
    elements.forEach((el) => {
      if (el.tagName !== 'TEXTAREA' && el.tagName !== 'INPUT') return;
      const key = el.id || el.name;
      if (!key || !isEditorFieldKey(key)) return;
      if (initialFieldBaseline[key] === undefined && Object.keys(initialFieldBaseline).length > 0) {
        initialFieldBaseline[key] = el.value;
      }
      fields[key] = el.value;
    });

    const popupEl = document.getElementById('ToolPopUPHTML');
    const isPopupVisible = popupEl && popupEl.offsetWidth > 0 && getComputedStyle(popupEl).display !== 'none';
    if (isPopupVisible) {
      const activeFieldId = popupEl.getAttribute('Info');
      if (activeFieldId && isEditorFieldKey(activeFieldId)) {
        if (initialFieldBaseline[activeFieldId] === undefined) {
          const baseEl = document.getElementById(activeFieldId);
          if (baseEl) initialFieldBaseline[activeFieldId] = baseEl.value;
        }
        const liveCke = getActiveCkeditorHtml();
        if (liveCke !== undefined && liveCke !== null) {
          fields[activeFieldId] = liveCke;
        }
      }
    }

    return fields;
  }

  function initAutoSaveVault() {
    if (window.__SIAAMS_VAULT_UI__) {
      window.__SIAAMS_VAULT_UI__.configure({
        getPageVaultInfo,
        openEditorForField,
        resetFieldDraft,
        syncCurrentPageDrafts,
        updateHistoryCountBadge,
        formatFriendlyFieldName
      });
    }

    const info = getPageVaultInfo();
    if (!info.isClinicalForm) return;

    initialFieldBaseline = getTrackedFieldsMap();
    confirmPendingServerSaveIfSucceeded(info);
    syncCurrentPageDrafts(info);
    processPendingOpenEditor(info);

    document.forms.frmEdit.addEventListener('input', (e) => {
      const target = e.target;
      const key = target && (target.id || target.name);
      if (isEditorFieldKey(key)) {
        markUnsavedServerChanges(true, key);
      }
    });

    window.addEventListener('siaams:before-submit', () => {
      isSubmittingToServer = true;
      runAutoSaveSnapshot(true);
      const drafts = getRecordDrafts(info);
      if (drafts.length > 0) {
        try {
          sessionStorage.setItem(
            `siaams_pending_save_${info.vaultKey}`,
            JSON.stringify({ draftKeys: drafts.map((d) => d.key), timestamp: Date.now() })
          );
        } catch (_e) {}
      }
      markUnsavedServerChanges(false);
    });

    // Keep local draft synced across tab switches & focus returns
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        syncCurrentPageDrafts(info);
        checkServerForConflictsThrottled(info);
      } else if (hasUnsavedServerChanges && !isSubmittingToServer) {
        runAutoSaveSnapshot(true);
      }
    });

    window.addEventListener('focus', () => {
      syncCurrentPageDrafts(info);
    });

    window.addEventListener('storage', (e) => {
      if (e.key && e.key.startsWith(`${DRAFT_PREFIX}${info.pageType}_${info.recordId}_`)) {
        syncCurrentPageDrafts(info);
      }
    });

    window.addEventListener('beforeunload', () => {
      if (hasUnsavedServerChanges && !isSubmittingToServer) {
        runAutoSaveSnapshot(true);
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

  function confirmPendingServerSaveIfSucceeded(info) {
    const pendingKey = `siaams_pending_save_${info.vaultKey}`;
    try {
      const raw = sessionStorage.getItem(pendingKey);
      if (!raw) return;
      sessionStorage.removeItem(pendingKey);
      const pending = JSON.parse(raw);
      if (!pending || !Array.isArray(pending.draftKeys)) return;
      if (Date.now() - (pending.timestamp || 0) > 2 * 60 * 1000) return;

      const isLoginPage = window.location.pathname.toLowerCase().includes('default.asp') ||
                          window.location.pathname.toLowerCase().includes('logon.asp') ||
                          !document.forms?.frmEdit;

      if (!isLoginPage && !hasRealServerError()) {
        pending.draftKeys.forEach((k) => { localStorage.removeItem(k); });
        lastSavedHash = '';
        lastAutoSaveState = 'serverCleared';
        refreshDynamicTopBarLabels();
        updateHistoryCountBadge();
      }
    } catch (_e) {}
  }

  function applyFieldHtmlToDom(fieldId, html, updateOpenCke = true) {
    const el = document.getElementById(fieldId) || document.forms?.frmEdit?.elements?.[fieldId];
    if (!el) return;
    el.value = html;

    const nextEl = el.nextElementSibling;
    if (nextEl && nextEl.tagName === 'DIV' && !nextEl.classList.contains('siaams-formatted-preview')) {
      nextEl.innerHTML = String(html);
    }

    const customPreview = document.getElementById(`siaams-preview-${fieldId}`);
    if (customPreview && customPreview.innerHTML !== html) {
      customPreview.innerHTML = html;
    }

    const updatedInput = el.parentElement?.querySelector('.HtmlUpdated');
    if (updatedInput) {
      updatedInput.value = '1';
    }

    if (updateOpenCke) {
      const popupEl = document.getElementById('ToolPopUPHTML');
      const isPopupVisible = popupEl && popupEl.offsetWidth > 0 && getComputedStyle(popupEl).display !== 'none';
      if (isPopupVisible && popupEl.getAttribute('Info') === fieldId) {
        if (window.CKEDITOR && window.CKEDITOR.instances) {
          const inst = window.CKEDITOR.instances.ToolPopUPHTML_fck || Object.values(window.CKEDITOR.instances)[0];
          if (inst && typeof inst.setData === 'function' && normCompare(inst.getData()) !== normCompare(html)) {
            inst.setData(html);
          }
        }
        const fckTa = document.getElementById('ToolPopUPHTML_fck');
        if (fckTa) fckTa.value = html;
      }
    }
  }

  function syncCurrentPageDrafts(infoOverride = null) {
    const info = infoOverride || getPageVaultInfo();
    if (!info.isClinicalForm) return;

    const drafts = getRecordDrafts(info);
    let anyActive = false;

    drafts.forEach((d) => {
      const fieldId = d.fieldId;
      const serverVal = initialFieldBaseline[fieldId];
      if (serverVal === undefined) return;

      if (normCompare(serverVal) === normCompare(d.baseHtml)) {
        // Server unchanged -> auto-load local draft seamlessly
        delete conflictServerMap[fieldId];
        const activeHtml = (Array.isArray(d.checkpoints) && d.checkpoints[d.cursor]?.html) || d.latestHtml;
        if (activeHtml !== undefined) {
          applyFieldHtmlToDom(fieldId, activeHtml, true);
          if (normCompare(activeHtml) !== normCompare(serverVal)) anyActive = true;
        }
      } else if (normCompare(serverVal) !== normCompare(d.latestHtml)) {
        // Another doctor updated this field on the server while we had a local draft!
        conflictServerMap[fieldId] = serverVal;
        anyActive = true;
      }
    });

    if (anyActive) markUnsavedServerChanges(true);
    updateHistoryCountBadge();
    refreshAllVisibleDraftBars();
  }

  async function detectServerConflictViaGet(info, drafts) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 2500);
      const resp = await fetch(window.location.href, {
        method: 'GET',
        credentials: 'include',
        cache: 'no-store',
        signal: controller.signal
      });
      clearTimeout(timer);
      if (!resp.ok) return null;
      const html = await resp.text();
      if (html.toLowerCase().includes('strpwd')) return null;

      const doc = new DOMParser().parseFromString(html, 'text/html');
      for (const d of drafts) {
        const remoteEl = doc.getElementById(d.fieldId);
        if (!remoteEl) continue;
        const remoteVal = remoteEl.value || '';
        if (normCompare(remoteVal) !== normCompare(d.baseHtml) && normCompare(remoteVal) !== normCompare(d.latestHtml)) {
          return { fieldId: d.fieldId, serverHtml: remoteVal };
        }
      }
    } catch (_e) {}
    return null;
  }

  async function checkServerForConflictsThrottled(info) {
    const now = Date.now();
    if (now - lastServerCheckTs < 15000) return;
    lastServerCheckTs = now;
    const drafts = getRecordDrafts(info);
    if (drafts.length === 0) return;
    const conflict = await detectServerConflictViaGet(info, drafts);
    if (conflict) {
      conflictServerMap[conflict.fieldId] = conflict.serverHtml;
      refreshAllVisibleDraftBars();
    }
  }

  function runAutoSaveSnapshot(forceCheckpoint = false, onlyFieldId = null) {
    const info = getPageVaultInfo();
    if (!info.isClinicalForm) return;

    const currentMap = getTrackedFieldsMap();
    const keys = onlyFieldId ? (currentMap[onlyFieldId] !== undefined ? [ onlyFieldId ] : []) : Object.keys(currentMap);
    if (keys.length === 0) return;

    const hash = JSON.stringify(currentMap);
    if (hash === lastSavedHash && !forceCheckpoint) return;
    lastSavedHash = hash;

    const now = Date.now();
    const timeStr = new Date(now).toLocaleTimeString(locale(), {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });

    let savedAny = false;
    keys.forEach((fieldId) => {
      const val = currentMap[fieldId];
      const baseVal = initialFieldBaseline[fieldId];
      if (baseVal === undefined) return;

      const key = getDraftKey(info, fieldId);
      const existing = readDraft(key);
      const unchangedFromBase = normCompare(val) === normCompare(baseVal);

      // If no draft exists yet and value hasn't changed from server, skip creating a draft
      if (!existing && unchangedFromBase) return;

      // If draft exists and content matches current cursor, skip
      if (existing && Array.isArray(existing.checkpoints)) {
        const curCp = existing.checkpoints[existing.cursor];
        if (curCp && normCompare(curCp.html) === normCompare(val) && !forceCheckpoint) return;
      }

      const mode = detectEditorModeForField(fieldId);
      let checkpoints = existing && Array.isArray(existing.checkpoints)
        ? existing.checkpoints.slice(0, (existing.cursor ?? existing.checkpoints.length - 1) + 1)
        : [ { html: baseVal, ts: now - 1 } ];

      const lastCp = checkpoints[checkpoints.length - 1];
      if (!lastCp || normCompare(lastCp.html) !== normCompare(val)) {
        // Group rapid keystrokes within 2.5s into the same checkpoint unless forceCheckpoint
        if (!forceCheckpoint && checkpoints.length > 1 && (now - (lastCp.ts || 0)) < 2500) {
          checkpoints[checkpoints.length - 1] = { html: val, ts: now };
        } else {
          checkpoints.push({ html: val, ts: now });
          if (checkpoints.length > MAX_CHECKPOINTS) {
            // Always preserve index 0 (initial server text)!
            checkpoints = [ checkpoints[0], ...checkpoints.slice(-(MAX_CHECKPOINTS - 1)) ];
          }
        }
      }

      const draft = {
        key,
        pageType: info.pageType,
        recordId: info.recordId,
        fieldId,
        pageUrl: window.location.pathname + window.location.search,
        editorMode: mode,
        patientName: info.patientName,
        patientTitle: info.patientTitle,
        baseHtml: existing ? existing.baseHtml : baseVal,
        latestHtml: val,
        checkpoints,
        cursor: checkpoints.length - 1,
        createdAt: existing ? existing.createdAt : now,
        updatedAt: now
      };

      writeDraft(key, draft);
      savedAny = true;
    });

    if (savedAny) {
      lastAutoSaveTime = timeStr;
      lastAutoSaveState = 'savedAt';
      refreshDynamicTopBarLabels();
      updateHistoryCountBadge();
      refreshAllVisibleDraftBars();
    }
  }

  function stepDraftCheckpoint(fieldId, delta) {
    const info = getPageVaultInfo();
    const key = getDraftKey(info, fieldId);
    const d = readDraft(key);
    if (!d || !Array.isArray(d.checkpoints) || d.checkpoints.length === 0) return;

    const nextCursor = Math.max(0, Math.min(d.checkpoints.length - 1, (d.cursor ?? d.checkpoints.length - 1) + delta));
    if (nextCursor === d.cursor) return;

    d.cursor = nextCursor;
    const targetHtml = d.checkpoints[nextCursor].html;
    d.latestHtml = targetHtml;
    d.updatedAt = Date.now();
    writeDraft(key, d);

    applyFieldHtmlToDom(fieldId, targetHtml, true);
    lastSavedHash = '';
    markUnsavedServerChanges(normCompare(targetHtml) !== normCompare(d.baseHtml));
    refreshAllVisibleDraftBars();
  }

  function resetFieldDraft(fieldId, skipConfirm = false) {
    const info = getPageVaultInfo();
    const key = getDraftKey(info, fieldId);
    const d = readDraft(key);
    if (!skipConfirm && !window.confirm(t('draftBar.confirmReset'))) return;

    const serverHtml = conflictServerMap[fieldId] ?? d?.baseHtml ?? initialFieldBaseline[fieldId] ?? '';
    delete conflictServerMap[fieldId];
    localStorage.removeItem(key);

    applyFieldHtmlToDom(fieldId, serverHtml, true);
    lastSavedHash = '';
    const remaining = getRecordDrafts(info);
    markUnsavedServerChanges(remaining.length > 0);
    updateHistoryCountBadge();
    refreshAllVisibleDraftBars();
  }

  function openCombineForField(fieldId, afterCombine = null) {
    const info = getPageVaultInfo();
    const key = getDraftKey(info, fieldId);
    const d = readDraft(key);
    const serverHtml = conflictServerMap[fieldId];
    if (!d || serverHtml === undefined || !window.__SIAAMS_MERGE__) return;

    window.__SIAAMS_MERGE__.openMergeRestore({
      fieldLabel: formatFriendlyFieldName(fieldId),
      currentHtml: serverHtml,
      draftHtml: d.latestHtml,
      onAccept: (mergedHtml) => {
        delete conflictServerMap[fieldId];
        initialFieldBaseline[fieldId] = serverHtml;
        d.baseHtml = serverHtml;
        d.latestHtml = mergedHtml;
        d.checkpoints = [ { html: serverHtml, ts: Date.now() - 1 }, { html: mergedHtml, ts: Date.now() } ];
        d.cursor = 1;
        d.updatedAt = Date.now();
        writeDraft(key, d);
        applyFieldHtmlToDom(fieldId, mergedHtml, true);
        markUnsavedServerChanges(true);
        refreshAllVisibleDraftBars();
        if (typeof afterCombine === 'function') afterCombine(mergedHtml);
      }
    });
  }

  function renderInEditorDraftBar(slotEl, fieldId) {
    if (!slotEl || !fieldId) return;
    const info = getPageVaultInfo();
    const d = readDraft(getDraftKey(info, fieldId));
    const hasConflict = conflictServerMap[fieldId] !== undefined;

    if (!d && !hasConflict) {
      slotEl.innerHTML = '';
      slotEl.style.display = 'none';
      return;
    }

    slotEl.style.display = 'block';
    const cps = d && Array.isArray(d.checkpoints) ? d.checkpoints : [];
    const cur = d ? (d.cursor ?? cps.length - 1) : 0;
    const canBack = cur > 0;
    const canFwd = cur < cps.length - 1;

    slotEl.innerHTML = `
      <div class="siaams-draft-bar ${hasConflict ? 'siaams-draft-bar-conflict' : ''}">
        <span class="siaams-draft-bar-msg">
          ${escapeHtml(hasConflict ? t('draftBar.conflict') : t('draftBar.local'))}
        </span>
        <div class="siaams-draft-bar-actions">
          ${hasConflict ? `
            <button type="button" class="siaams-draft-bar-btn siaams-draft-bar-combine" data-db-action="combine">
              ${escapeHtml(t('draftBar.combine'))}
            </button>
          ` : ''}
          ${cps.length > 1 ? `
            <button type="button" class="siaams-draft-bar-btn" data-db-action="back" title="${escapeAttr(t('draftBar.backTitle'))}" ${canBack ? '' : 'disabled'}>
              ${escapeHtml(t('draftBar.back'))}
            </button>
            <button type="button" class="siaams-draft-bar-btn" data-db-action="forward" title="${escapeAttr(t('draftBar.forwardTitle'))}" ${canFwd ? '' : 'disabled'}>
              ${escapeHtml(t('draftBar.forward'))}
            </button>
          ` : ''}
          <button type="button" class="siaams-draft-bar-btn siaams-draft-bar-reset" data-db-action="reset">
            ${escapeHtml(t('draftBar.reset'))}
          </button>
        </div>
      </div>
    `;

    slotEl.querySelector('[data-db-action="back"]')?.addEventListener('click', () => stepDraftCheckpoint(fieldId, -1));
    slotEl.querySelector('[data-db-action="forward"]')?.addEventListener('click', () => stepDraftCheckpoint(fieldId, 1));
    slotEl.querySelector('[data-db-action="reset"]')?.addEventListener('click', () => resetFieldDraft(fieldId, false));
    slotEl.querySelector('[data-db-action="combine"]')?.addEventListener('click', () => openCombineForField(fieldId));
  }

  function refreshAllVisibleDraftBars() {
    const popupEl = document.getElementById('ToolPopUPHTML');
    const ckeSlot = document.getElementById('siaams-cke-draft-bar');
    if (popupEl && ckeSlot) {
      renderInEditorDraftBar(ckeSlot, popupEl.getAttribute('Info'));
    }
    document.querySelectorAll('[id^="siaams-draft-bar-"]').forEach((slot) => {
      const fId = slot.id.replace('siaams-draft-bar-', '');
      renderInEditorDraftBar(slot, fId);
    });

    // Top-of-page 2-doctor conflict banner (shown ONLY when server changed underneath a local draft)
    let conflictBanner = document.getElementById('siaams-conflict-banner');
    const conflictIds = Object.keys(conflictServerMap);
    if (conflictIds.length === 0) {
      conflictBanner?.remove();
      return;
    }
    if (!conflictBanner) {
      conflictBanner = document.createElement('div');
      conflictBanner.id = 'siaams-conflict-banner';
      (document.getElementById('divContent') || document.body).prepend(conflictBanner);
    }
    const firstId = conflictIds[0];
    const names = conflictIds.map(formatFriendlyFieldName).join(', ');
    conflictBanner.innerHTML = `
      <div class="siaams-recovery-icon">⚠️</div>
      <div class="siaams-recovery-body">
        <div class="siaams-recovery-title">${escapeHtml(t('draftBar.conflict'))}</div>
        <div class="siaams-recovery-subtitle"><strong>${escapeHtml(names)}</strong></div>
      </div>
      <div class="siaams-recovery-actions">
        <button type="button" class="siaams-recovery-btn siaams-recovery-btn-restore" data-cb-combine="${escapeAttr(firstId)}">
          ${escapeHtml(t('draftBar.combine'))}
        </button>
        <button type="button" class="siaams-recovery-btn siaams-recovery-btn-dismiss" data-cb-reset="${escapeAttr(firstId)}">
          ${escapeHtml(t('draftBar.reset'))}
        </button>
      </div>
    `;
    conflictBanner.querySelector('[data-cb-combine]')?.addEventListener('click', () => {
      openEditorForField(firstId, 'ckeditor');
      openCombineForField(firstId);
    });
    conflictBanner.querySelector('[data-cb-reset]')?.addEventListener('click', () => {
      resetFieldDraft(firstId, false);
    });
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

  function detectEditorModeForField(fieldId) {
    const popupEl = document.getElementById('ToolPopUPHTML');
    if (popupEl && popupEl.offsetWidth > 0 && getComputedStyle(popupEl).display !== 'none' && popupEl.getAttribute('Info') === fieldId) {
      return 'ckeditor';
    }
    const inlineEl = document.getElementById(`siaams-preview-${fieldId}`);
    if (inlineEl && inlineEl.getAttribute('contenteditable') === 'true') {
      return 'inline';
    }
    return 'ckeditor';
  }

  function processPendingOpenEditor(info) {
    try {
      const raw = sessionStorage.getItem('siaams_pending_open_editor');
      if (!raw) return;
      const pending = JSON.parse(raw);
      if (!pending || !pending.fieldId) return;
      if (pending.pageType !== info.pageType || String(pending.recordId) !== String(info.recordId)) return;
      sessionStorage.removeItem('siaams_pending_open_editor');
      setTimeout(() => {
        openEditorForField(pending.fieldId, pending.editorMode);
      }, 300);
    } catch (_e) {}
  }

  function openEditorForField(fieldId, mode) {
    const el = document.getElementById(fieldId);
    if (!el) return;
    if (mode === 'inline') {
      const toggleBtn = document.querySelector(`[data-action="toggle-inline-edit"][data-target="${fieldId}"]`) ||
                        document.getElementById(`siaams-preview-${fieldId}`)?.parentElement?.querySelector('[data-action="checkin-inline-toggle"]');
      const preview = document.getElementById(`siaams-preview-${fieldId}`);
      if (preview && preview.getAttribute('contenteditable') !== 'true' && toggleBtn) {
        toggleBtn.click();
      }
      preview?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    if (typeof window.ShowPopUpHtmlInput === 'function' && isEditorFieldKey(fieldId)) {
      if (typeof window.__SIAAMS_ENSURE_JQUERY_PLUGINS__ === 'function') {
        window.__SIAAMS_ENSURE_JQUERY_PLUGINS__();
      }
      window.ShowPopUpHtmlInput(el, fieldId, APP_BASE);
    }
  }

  function updateHistoryCountBadge() {
    const info = getPageVaultInfo();
    const countEl = document.getElementById('siaams-history-count');
    if (!countEl) return;
    countEl.textContent = String(getRecordDrafts(info).length);
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
        refreshAllVisibleDraftBars();
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