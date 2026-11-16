/**
 * SIA AMS Chrome Wrapper & Crash-Guard
 * ui-and-crash-guard.js — Injected at document_end in MAIN world
 *
 * Fixes:
 *  - #2 & #3: Modern Docked, Collapsible, Searchable Left Sidebar (global + CONTEXT/IMPRIMARE)
 *  - #4: 1-Step "Închide și Salvează pe Server (ALT+S)" in CKEditor + Sticky Unsaved Warning Bar
 *  - #5: Session Keep-Alive Heartbeat (every 3 minutes) + Pre-Submit Session Check
 *  - #6: 2-Second Continuous LocalStorage Auto-Save Vault + 20-Version History + Crash Recovery Banner
 *  - #7: CKEditor (#ToolPopUPHTML) Non-Overlapping Footer & Proper Sizing
 *  - #8: Visual Editor (CKEditor + Direct ContentEditable + Formatted Preview) for Epicriza & Extras on checkout.asp
 *  - #10: Auto-Expand Hidden Patient/Referral Header (<tool:ah id="ah1">)
 *  - #12: Native Date Picker Bridge (dd/mm/yyyy) + Dot-to-Slash Auto-Normalizer
 *  - #15 (Helper): 1-Click "➕ Rând Tabel Glicemic" inside CKEditor
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

  let hasUnsavedServerChanges = false;
  let isSubmittingToServer = false;
  let initialFieldBaseline = {};
  let lastSavedHash = '';

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
  // 1. Top Crash-Guard & Session Keep-Alive Status Bar (#4, #5, #6)
  // ---------------------------------------------------------------------------
  function createTopStatusBar() {
    if (document.getElementById('siaams-top-bar')) return;

    const vaultInfo = getPageVaultInfo();
    const bar = document.createElement('div');
    bar.id = 'siaams-top-bar';
    bar.innerHTML = `
      <div class="siaams-top-left">
        <button type="button" id="siaams-sidebar-toggle" class="siaams-btn-icon" title="Comută Meniul Lateral (Ascunde/Arată)">
          ☰ Meniu SIA AMS
        </button>
        <span class="siaams-brand-badge">🛡️ Chrome Crash-Guard v1.0</span>
        <span id="siaams-session-pill" class="siaams-pill siaams-pill-ok" title="Ping automat la fiecare 3 minute pentru a preveni expirarea sesiunii IIS (20 min)">
          🟢 Sesiune Activă <small id="siaams-session-time">(verificat acum)</small>
        </span>
        ${vaultInfo.isClinicalForm ? `
          <span id="siaams-autosave-pill" class="siaams-pill siaams-pill-info" title="Salvare locală continuă la fiecare 2 secunde în browser">
            💾 Auto-Save Local: <strong id="siaams-autosave-status">Activ</strong>
          </span>
          <button type="button" id="siaams-btn-history" class="siaams-btn-subtle" title="Vezi ultimele 20 de versiuni salvate local pentru această fișă">
            🕒 Istoric Ciorne (<span id="siaams-history-count">0</span>)
          </button>
        ` : ''}
      </div>
      <div class="siaams-top-right">
        <div id="siaams-unsaved-warning" class="siaams-unsaved-pill" style="display: none;">
          <span>⚠️ <strong>Modificări nesalvate pe server!</strong> (Salvate în ciorna locală)</span>
          <button type="button" id="siaams-top-save-btn" class="siaams-btn-save-now">
            💾 Salvează pe Server Acum (ALT+S)
          </button>
        </div>
        <span class="siaams-patient-badge" title="${escapeHtml(vaultInfo.patientTitle)}">
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

    // Manual session ping on click
    document.getElementById('siaams-session-pill')?.addEventListener('click', () => {
      pingSessionKeepAlive(true);
    });

    updateHistoryCountBadge();
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
          <input type="search" id="siaams-sidebar-search" placeholder="🔍 Caută în meniu (ex: Internari, Extras, F16)..." autocomplete="off" />
        </div>
        <div class="siaams-quick-nav">
          <a href="${APP_BASE}/main.asp" class="siaams-quick-btn" title="Pagina Principală">🏠 Principală</a>
          <a href="${APP_BASE}/SectionPage.asp" class="siaams-quick-btn" title="Pagina Secției (Pacienți Internați)">🏥 Secție</a>
          <a href="${APP_BASE}/Files/search.asp?what=I" class="siaams-quick-btn" title="Caută Internări">🔎 Internări</a>
        </div>
      </div>
      <div id="siaams-sidebar-patient-context"></div>
      <div id="siaams-sidebar-content" class="siaams-sidebar-scroll">
        <div class="siaams-sidebar-loading">Se încarcă meniul SIA AMS...</div>
      </div>
    `;

    document.body.appendChild(sidebar);
    document.body.classList.add('siaams-has-sidebar');

    if (localStorage.getItem('siaams_sidebar_collapsed') === '1') {
      document.body.classList.add('siaams-sidebar-collapsed');
    }

    // Wire search input
    const searchInput = document.getElementById('siaams-sidebar-search');
    searchInput?.addEventListener('input', () => {
      filterSidebarMenu(searchInput.value);
    });

    // Render deterministic patient context links if on checkin.asp or checkout.asp
    renderDirectPatientQuickLinks();

    // Fetch live menu.asp with session cookies
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

    // Look for presentation & patient links in the page DOM
    const pacLink = document.querySelector('a[href*="Pacient/edit.asp"]')?.getAttribute('href');
    const presLink = document.querySelector('a[href*="presentation.asp"]')?.getAttribute('href');

    container.innerHTML = `
      <div class="siaams-context-card">
        <div class="siaams-context-title">⚡ Acțiuni Rapide Pacient (CIID: ${escapeHtml(String(ciid))})</div>
        <div class="siaams-context-grid">
          ${pacLink ? `<a href="${escapeAttr(pacLink)}" class="siaams-ctx-chip">👤 Fișa Pacient</a>` : ''}
          ${presLink ? `<a href="${escapeAttr(presLink)}" class="siaams-ctx-chip">📋 Prezentare</a>` : ''}
          <a href="${APP_BASE}/Files/checkin.asp?id=${encodeURIComponent(ciid)}" class="siaams-ctx-chip ${info.pageType === 'checkin' ? 'active' : ''}">🛏️ Fișa Internare</a>
          ${coid ? `<a href="${APP_BASE}/Files/checkout.asp?id=${encodeURIComponent(coid)}&ciid=${encodeURIComponent(ciid)}" class="siaams-ctx-chip ${info.pageType === 'checkout' ? 'active' : ''}">🏁 Fișa Externare</a>` : ''}
          <a href="${APP_BASE}/Print/Recommendations/recommendations.asp?ciid=${encodeURIComponent(ciid)}" target="_blank" class="siaams-ctx-chip siaams-chip-print">🖨️ Extras (027/e)</a>
          <a href="${APP_BASE}/Print/checkout/decont_cost.asp?ciid=${encodeURIComponent(ciid)}" target="_blank" class="siaams-ctx-chip siaams-chip-print">💰 Decont Cost</a>
          <a href="${APP_BASE}/Print/FisaCompleta/FisaPacient_NewFull.asp?ciid=${encodeURIComponent(ciid)}" target="_blank" class="siaams-ctx-chip siaams-chip-print">📑 Fișa Completă</a>
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
          // Check if it's a category header vs UTILIZATOR info row
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

      // Prioritize CONTEXT and IMPRIMARE at the very top of the menu!
      const priorityTitles = new Set([ 'CONTEXT', 'IMPRIMARE' ]);
      const priorityCats = categories.filter((c) => priorityTitles.has(c.title.toUpperCase()));
      const standardCats = categories.filter((c) => !priorityTitles.has(c.title.toUpperCase()));
      const orderedCats = [ ...priorityCats, ...standardCats ];

      contentEl.innerHTML = orderedCats
        .filter((cat) => cat.items.length > 0)
        .map((cat) => {
          const isPriority = priorityTitles.has(cat.title.toUpperCase());
          const icon = getCategoryIcon(cat.title);
          return `
            <div class="siaams-menu-group ${isPriority ? 'siaams-menu-group-priority' : ''}" data-category="${escapeAttr(cat.title)}">
              <div class="siaams-menu-group-header" onclick="this.parentElement.classList.toggle('collapsed')">
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
                          ${item.isTargetBlank ? '<span class="siaams-ext-icon" title="Se deschide în filă nouă">↗</span>' : ''}
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
      contentEl.innerHTML = `<div class="siaams-sidebar-error">Nu s-a putut încărca meniul (${escapeHtml(err.message)}).</div>`;
    }
  }

  function getCategoryIcon(title) {
    const t = title.toUpperCase();
    if (t === 'CONTEXT') return '🩺';
    if (t === 'IMPRIMARE') return '🖨️';
    if (t === 'SECTII') return '🏥';
    if (t === 'PROCEDURI') return '🔬';
    if (t === 'STATISTICA') return '📊';
    if (t === 'RAPOARTE') return '📑';
    if (t === 'ANUNTURI') return '📢';
    if (t === 'GENERAL') return '⚙️';
    if (t === 'UTILIZATOR') return '👩‍⚕️';
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
    const timeEl = document.getElementById('siaams-session-time');
    try {
      const resp = await fetch(`${MENU_URL}?_keepalive=${Date.now()}`, {
        method: 'GET',
        credentials: 'include',
        cache: 'no-store'
      });
      const text = await resp.text();
      const nowStr = new Date().toLocaleTimeString('ro-RO', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

      const isLoggedOut = resp.url.toLowerCase().includes('default.asp') ||
                          resp.url.toLowerCase().includes('logon.asp') ||
                          (!text.includes('TblMenu') && text.toLowerCase().includes('strpwd'));

      if (isLoggedOut) {
        if (pill) {
          pill.className = 'siaams-pill siaams-pill-danger';
          pill.innerHTML = `🔴 Sesiune Expirată! <small>(Ciorna dvs. este salvată local — autentificați-vă în altă filă înainte de salvare!)</small>`;
        }
        return false;
      }

      if (pill && timeEl) {
        pill.className = 'siaams-pill siaams-pill-ok';
        timeEl.textContent = `(${isManual ? 'reînnoit' : 'activ'} ${nowStr})`;
      }
      return true;
    } catch (_e) {
      if (pill) {
        pill.className = 'siaams-pill siaams-pill-warn';
      }
      return false;
    }
  }

  // ---------------------------------------------------------------------------
  // 4. CKEditor (#ToolPopUPHTML) Overhaul + 1-Step Server Save (#4, #7, #15)
  // ---------------------------------------------------------------------------
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
          <button type="button" id="siaams-cke-cancel" class="siaams-cke-btn siaams-cke-btn-cancel" title="Închide fereastra fără a aplica modificările din această sesiune">
            ❌ Anulează
          </button>
          <button type="button" id="siaams-cke-add-glycemic" class="siaams-cke-btn siaams-cke-btn-helper" title="Adaugă automat un rând nou cu data de azi în tabelul Profil Glicemic (sau creează tabelul)">
            ➕ Rând Tabel Glicemic
          </button>
        </div>
        <div class="siaams-cke-footer-right">
          <button type="button" id="siaams-cke-close-only" class="siaams-cke-btn siaams-cke-btn-secondary" title="Copiază textul în pagină și salvează în ciorna locală, fără a trimite încă la server">
            📋 Închide în Pagină (Ciornă)
          </button>
          <button type="button" id="siaams-cke-save-server" class="siaams-cke-btn siaams-cke-btn-primary" title="Copiază textul din CKEditor ȘI apelează automat Modifică (ALT+S) pentru a salva pe server într-un singur pas!">
            💾 Închide și Salvează pe Server (ALT+S)
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
        insertGlycemicRowInCkeditor();
      });

      document.getElementById('siaams-cke-close-only')?.addEventListener('click', () => {
        enhancedUpdatePopUpHtml(false);
      });

      document.getElementById('siaams-cke-save-server')?.addEventListener('click', () => {
        enhancedUpdatePopUpHtml(true);
      });
    }

    // 4b. Wrap global ShowPopUpHtmlInput so #ToolPopUPHTML dialog is properly sized (960x600)
    //     and div[name='htmldiv'] never forces a 250px height that causes button overlap (#7)
    if (typeof window.ShowPopUpHtmlInput === 'function' && !window.ShowPopUpHtmlInput._siaamsWrapped) {
      const origShow = window.ShowPopUpHtmlInput;
      const wrappedShow = function (pLabel, pReturnInputID, abspath) {
        if (typeof window.__SIAAMS_ENSURE_JQUERY_PLUGINS__ === 'function') {
          window.__SIAAMS_ENSURE_JQUERY_PLUGINS__();
        }
        const res = origShow.call(this, pLabel, pReturnInputID, abspath || APP_BASE);
        fixToolPopupDialogDimensions(pReturnInputID);
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

  function fixToolPopupDialogDimensions(fieldId) {
    try {
      const htmlDiv = document.querySelector('#ToolPopUPHTML div[name="htmldiv"]');
      if (htmlDiv) {
        htmlDiv.style.height = 'auto';
        htmlDiv.style.minHeight = '430px';
      }
      if (window.$ && window.$('#ToolPopUPHTML').dialog) {
        window.$('#ToolPopUPHTML').dialog('option', 'width', Math.min(980, window.innerWidth - 60));
        window.$('#ToolPopUPHTML').dialog('option', 'height', Math.min(620, window.innerHeight - 40));
        window.$('#ToolPopUPHTML').dialog('option', 'position', 'center');
      }
    } catch (_e) {}
  }

  function getActiveCkeditorHtml() {
    try {
      if (window.CKEDITOR && window.CKEDITOR.instances) {
        const inst = window.CKEDITOR.instances.ToolPopUPHTML_fck || Object.values(window.CKEDITOR.instances)[0];
        if (inst && typeof inst.getData === 'function') {
          inst.updateElement();
          return inst.getData();
        }
      }
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

      // Update native SIA AMS preview div if present (on checkin.asp)
      const nextEl = targetEl.nextElementSibling;
      if (nextEl && nextEl.tagName === 'DIV' && !nextEl.classList.contains('siaams-formatted-preview')) {
        nextEl.innerHTML = finalHtml.substring(0, 1200) + (finalHtml.length > 1200 ? '...' : '');
      }

      // Update our formatted visual preview card (on checkout.asp or checkin.asp)
      const customPreview = document.getElementById(`siaams-preview-${targetFieldId}`);
      if (customPreview) {
        customPreview.innerHTML = finalHtml;
      }

      // Mark .HtmlUpdated = 1 as expected by SIA AMS backend
      const updatedInput = targetEl.parentElement?.querySelector('.HtmlUpdated');
      if (updatedInput) {
        updatedInput.value = '1';
      }
    }

    // Close the dialog
    try {
      if (window.$ && window.$('#ToolPopUPHTML').dialog) {
        window.$('#ToolPopUPHTML').dialog('close');
      } else {
        popupEl.style.display = 'none';
      }
    } catch (_e) {
      popupEl.style.display = 'none';
    }

    // Mark form dirty & snapshot immediately to Auto-Save Vault
    markUnsavedServerChanges(true, targetFieldId);
    runAutoSaveSnapshot(true);

    // If user clicked "💾 Închide și Salvează pe Server (ALT+S)" (#4)
    if (saveToServer) {
      triggerOneStepServerSave();
    }
  }

  function triggerOneStepServerSave() {
    isSubmittingToServer = true;
    markUnsavedServerChanges(false);
    markVaultSyncedToServer();

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

  // ---------------------------------------------------------------------------
  // Deterministic Helper (#15): Add Row to Glycemic Profile Table in CKEditor
  // ---------------------------------------------------------------------------
  function insertGlycemicRowInCkeditor() {
    const now = new Date();
    const ddMm = `${String(now.getDate()).padStart(2, '0')}.${String(now.getMonth() + 1).padStart(2, '0')}`;
    const newRowHtml = `
      <tr>
        <td><span style="font-size:16px"><span style="font-family:times new roman,times,serif"><strong>Glicemia</strong></span></span></td>
        <td><span style="font-size:16px"><span style="font-family:times new roman,times,serif">${ddMm}</span></span></td>
        <td><span style="font-size:16px"><span style="font-family:times new roman,times,serif">&nbsp;</span></span></td>
        <td><span style="font-size:16px"><span style="font-family:times new roman,times,serif">&nbsp;</span></span></td>
        <td><span style="font-size:16px"><span style="font-family:times new roman,times,serif">&nbsp;</span></span></td>
        <td><span style="font-size:16px"><span style="font-family:times new roman,times,serif">&nbsp;</span></span></td>
        <td><span style="font-size:16px"><span style="font-family:times new roman,times,serif">&nbsp;</span></span></td>
      </tr>
    `;

    let currentHtml = getActiveCkeditorHtml();
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = currentHtml;

    // Look for an existing Profil glicemic table
    const tables = Array.from(tempDiv.querySelectorAll('table'));
    const glycTable = tables.find((t) => t.textContent.includes('8.00') || t.textContent.includes('Glicemia'));

    if (glycTable) {
      const tbody = glycTable.querySelector('tbody') || glycTable;
      tbody.insertAdjacentHTML('beforeend', newRowHtml);
    } else {
      tempDiv.insertAdjacentHTML(
        'beforeend',
        `
        <h3><span style="font-size:16px"><span style="font-family:times new roman,times,serif"><strong>Profil glicemic la glucometru:</strong></span></span></h3>
        <table border="1" cellspacing="0" style="border-collapse:collapse; width:100%;">
          <tbody>
            <tr>
              <td>&nbsp;</td>
              <td><strong>Data</strong></td>
              <td><strong>8.00</strong></td>
              <td><strong>11.00</strong></td>
              <td><strong>14.00</strong></td>
              <td><strong>18.00</strong></td>
              <td><strong>21.00</strong></td>
            </tr>
            ${newRowHtml}
          </tbody>
        </table>
        `
      );
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
  // 5. Visual Editor & Formatted HTML Preview for checkout.asp (#8)
  //    Transforms #sEpicrisys ("Epicriza") and #sRecommendations ("Extras")
  //    from raw HTML <textarea> code boxes into clean formatted visual editors!
  // ---------------------------------------------------------------------------
  function upgradeCheckoutRawHtmlTextareas() {
    const targets = [
      { id: 'sEpicrisys', label: 'Epicriza ( Sinteză Clinică, Paraclinică & Tratament )' },
      { id: 'sRecommendations', label: 'Extras ( Formular 027/e — Recomandări la Externare )' }
    ];

    targets.forEach(({ id, label }) => {
      const textarea = document.getElementById(id);
      if (!textarea || textarea.dataset.siaamsUpgraded === '1') return;
      textarea.dataset.siaamsUpgraded = '1';

      const wrapper = document.createElement('div');
      wrapper.className = 'siaams-rich-field-card';
      wrapper.innerHTML = `
        <div class="siaams-rich-field-toolbar">
          <div class="siaams-rich-field-title">
            📑 <strong>${escapeHtml(label)}</strong>
            <span class="siaams-badge-clean">Vizualizare Formatată Activă</span>
          </div>
          <div class="siaams-rich-field-actions">
            <button type="button" class="siaams-rich-btn siaams-rich-btn-primary" data-action="open-ckeditor" data-target="${id}">
              ✨ Deschide în Editor Vizual (CKEditor)
            </button>
            <button type="button" class="siaams-rich-btn siaams-rich-btn-inline" data-action="toggle-inline-edit" data-target="${id}">
              ✏️ Editează Direct în Pagină
            </button>
            <button type="button" class="siaams-rich-btn siaams-rich-btn-raw" data-action="toggle-raw" data-target="${id}">
              &lt;/&gt; Cod HTML Brut
            </button>
          </div>
        </div>
        <div id="siaams-preview-${id}" class="siaams-formatted-preview" contenteditable="false" spellcheck="false"></div>
      `;

      textarea.parentNode.insertBefore(wrapper, textarea);
      const previewEl = wrapper.querySelector(`#siaams-preview-${id}`);
      previewEl.innerHTML = textarea.value || '<em>(Câmp gol)</em>';

      // Hide the ugly raw HTML <textarea> by default!
      textarea.classList.add('siaams-raw-textarea-hidden');

      // Sync textarea -> preview when raw textarea is edited manually
      textarea.addEventListener('input', () => {
        previewEl.innerHTML = textarea.value;
        markUnsavedServerChanges(true, id);
      });

      // Sync preview -> textarea when inline contenteditable is active
      previewEl.addEventListener('input', () => {
        textarea.value = previewEl.innerHTML;
        markUnsavedServerChanges(true, id);
      });

      // Wire toolbar buttons
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
          inlineBtn.innerHTML = '✏️ Editează Direct în Pagină';
          textarea.value = previewEl.innerHTML;
          runAutoSaveSnapshot(true);
        } else {
          previewEl.setAttribute('contenteditable', 'true');
          previewEl.classList.add('siaams-inline-editing');
          inlineBtn.innerHTML = '✅ Finalizează Editarea Directă';
          previewEl.focus();
        }
      });

      const rawBtn = wrapper.querySelector('[data-action="toggle-raw"]');
      rawBtn?.addEventListener('click', () => {
        textarea.classList.toggle('siaams-raw-textarea-hidden');
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

    const elements = form.querySelectorAll('textarea, input[type="text"], select');
    elements.forEach((el) => {
      const key = el.id || el.name;
      if (!key) return;
      // Skip noise/hidden search fields
      if (key === 'suppSearch' || key === 'reloadValueRefresh') return;
      fields[key] = el.value;
    });

    // If CKEditor modal is currently open, include its live content for the active field!
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
    const info = getPageVaultInfo();
    if (!info.isClinicalForm) return;

    // 1. Capture server baseline on initial page load
    initialFieldBaseline = getTrackedFieldsMap();

    // 2. Check if localStorage has an unsynced draft from a prior crash/session timeout!
    checkAndRenderCrashRecoveryBanner(info);

    // 3. Listen for input/change events on frmEdit
    document.forms.frmEdit.addEventListener('input', (e) => {
      const target = e.target;
      if (target && (target.tagName === 'TEXTAREA' || target.tagName === 'INPUT' || target.tagName === 'SELECT')) {
        markUnsavedServerChanges(true, target.id || target.name);
      }
    });

    // 4. Listen for before-submit to mark vault synced
    window.addEventListener('siaams:before-submit', () => {
      isSubmittingToServer = true;
      runAutoSaveSnapshot(true);
      markVaultSyncedToServer();
      markUnsavedServerChanges(false);
    });

    // 5. Warn before closing tab if unsaved server changes exist (#4)
    window.addEventListener('beforeunload', (e) => {
      if (hasUnsavedServerChanges && !isSubmittingToServer) {
        runAutoSaveSnapshot(true);
        e.preventDefault();
        e.returnValue = 'Aveți modificări nesalvate pe server în SIA AMS! (Ciorna locală este salvată).';
        return e.returnValue;
      }
    });

    // 6. Continuous 2-second Auto-Save loop (#6)
    setInterval(() => {
      runAutoSaveSnapshot(false);
    }, AUTOSAVE_INTERVAL_MS);
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
    const timeStr = new Date(now).toLocaleTimeString('ro-RO', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });

    const snapshot = {
      vaultKey: info.vaultKey,
      pageType: info.pageType,
      recordId: info.recordId,
      patientTitle: info.patientTitle,
      timestamp: now,
      timeFormatted: new Date(now).toLocaleString('ro-RO'),
      syncedToServer: isSubmittingToServer,
      changedFieldNames: changedKeys,
      changedFields
    };

    try {
      localStorage.setItem(info.vaultKey, JSON.stringify(snapshot));

      // Append to rolling 20-version history
      const rawHist = localStorage.getItem(info.historyKey);
      const hist = rawHist ? JSON.parse(rawHist) : [];
      hist.unshift(snapshot);
      if (hist.length > MAX_DRAFT_HISTORY) {
        hist.length = MAX_DRAFT_HISTORY;
      }
      localStorage.setItem(info.historyKey, JSON.stringify(hist));

      const statusEl = document.getElementById('siaams-autosave-status');
      if (statusEl) {
        statusEl.textContent = `Salvat la ${timeStr}`;
      }
      updateHistoryCountBadge();
    } catch (e) {
      console.warn('[SIAAMS Vault] Eroare la salvarea în localStorage:', e);
    }
  }

  function markVaultSyncedToServer() {
    const info = getPageVaultInfo();
    try {
      const raw = localStorage.getItem(info.vaultKey);
      if (!raw) return;
      const snap = JSON.parse(raw);
      snap.syncedToServer = true;
      localStorage.setItem(info.vaultKey, JSON.stringify(snap));
    } catch (_e) {}
  }

  function markUnsavedServerChanges(unsaved, fieldName = '') {
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

      // Verify at least one field in snap.changedFields actually differs from current server baseline
      const differingKeys = Object.keys(snap.changedFields).filter(
        (k) => initialFieldBaseline[k] !== undefined && initialFieldBaseline[k] !== snap.changedFields[k]
      );

      if (differingKeys.length === 0) return;

      const friendlyNames = differingKeys.map(formatFriendlyFieldName).join(', ');
      const banner = document.createElement('div');
      banner.id = 'siaams-crash-recovery-banner';
      banner.innerHTML = `
        <div class="siaams-recovery-icon">🛡️</div>
        <div class="siaams-recovery-body">
          <div class="siaams-recovery-title">
            Ciornă nesalvată pe server detectată! (Salvată automat la <strong>${escapeHtml(snap.timeFormatted || '')}</strong>)
          </div>
          <div class="siaams-recovery-subtitle">
            Câmpuri modificate în ciornă: <strong>${escapeHtml(friendlyNames)}</strong>. Puteți restaura textul cu un singur click.
          </div>
        </div>
        <div class="siaams-recovery-actions">
          <button type="button" id="siaams-btn-restore-draft" class="siaams-recovery-btn siaams-recovery-btn-restore">
            ✅ Restaurează Ultima Ciornă
          </button>
          <button type="button" id="siaams-btn-view-drafts" class="siaams-recovery-btn siaams-recovery-btn-history">
            🕒 Vezi Istoric
          </button>
          <button type="button" id="siaams-btn-dismiss-draft" class="siaams-recovery-btn siaams-recovery-btn-dismiss">
            🗑️ Ignoră
          </button>
        </div>
      `;

      const targetContainer = document.getElementById('divContent') || document.body;
      targetContainer.prepend(banner);

      document.getElementById('siaams-btn-restore-draft')?.addEventListener('click', () => {
        restoreSnapshotToDom(snap);
        banner.innerHTML = `
          <div class="siaams-recovery-restored">
            ✅ <strong>Ciorna din ${escapeHtml(snap.timeFormatted)} a fost restaurată în pagină!</strong>
            Apăsați <strong>💾 Salvează pe Server Acum (ALT+S)</strong> din bara de sus pentru a o salva definitiv pe server.
          </div>
        `;
      });

      document.getElementById('siaams-btn-view-drafts')?.addEventListener('click', () => {
        openDraftHistoryModal();
      });

      document.getElementById('siaams-btn-dismiss-draft')?.addEventListener('click', () => {
        snap.syncedToServer = true;
        localStorage.setItem(info.vaultKey, JSON.stringify(snap));
        banner.remove();
      });
    } catch (e) {
      console.warn('[SIAAMS Vault] Eroare la verificarea ciornei:', e);
    }
  }

  function restoreSnapshotToDom(snap) {
    if (!snap || !snap.changedFields) return;
    for (const [ key, val ] of Object.entries(snap.changedFields)) {
      const el = document.getElementById(key) || document.forms?.frmEdit?.elements?.[key];
      if (!el) continue;
      el.value = val;

      // Update native checkin.asp preview div if present
      const nextEl = el.nextElementSibling;
      if (nextEl && nextEl.tagName === 'DIV' && !nextEl.classList.contains('siaams-formatted-preview')) {
        nextEl.innerHTML = String(val).substring(0, 1200) + (String(val).length > 1200 ? '...' : '');
      }

      // Update custom formatted preview card if present
      const customPreview = document.getElementById(`siaams-preview-${key}`);
      if (customPreview) {
        customPreview.innerHTML = val;
      }

      const updatedInput = el.parentElement?.querySelector('.HtmlUpdated');
      if (updatedInput) {
        updatedInput.value = '1';
      }
    }
    markUnsavedServerChanges(true);
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
    const existing = document.getElementById('siaams-history-modal-backdrop');
    if (existing) existing.remove();

    const info = getPageVaultInfo();
    let list = [];
    try {
      const raw = localStorage.getItem(info.historyKey);
      list = raw ? JSON.parse(raw) : [];
    } catch (_e) {}

    const backdrop = document.createElement('div');
    backdrop.id = 'siaams-history-modal-backdrop';
    backdrop.innerHTML = `
      <div class="siaams-history-modal">
        <div class="siaams-history-header">
          <h3>🕒 Istoric Ciorne Auto-Save — ${escapeHtml(info.patientTitle)}</h3>
          <button type="button" id="siaams-history-close" class="siaams-btn-close">✕</button>
        </div>
        <div class="siaams-history-body">
          ${list.length === 0 ? `
            <p class="siaams-empty-history">Nu există încă versiuni modificate salvate local pentru această fișă.</p>
          ` : list.map((item, idx) => {
            const fieldsStr = (item.changedFieldNames || Object.keys(item.changedFields || {}))
              .map(formatFriendlyFieldName)
              .join(', ');
            const sampleText = Object.values(item.changedFields || {})[0] || '';
            const cleanExcerpt = stripHtmlTags(String(sampleText)).substring(0, 220);
            return `
              <div class="siaams-history-card">
                <div class="siaams-history-meta">
                  <strong>#${idx + 1} — ${escapeHtml(item.timeFormatted || '')}</strong>
                  <span class="siaams-history-fields">Câmpuri: ${escapeHtml(fieldsStr)}</span>
                  <span class="siaams-history-status ${item.syncedToServer ? 'synced' : 'unsynced'}">
                    ${item.syncedToServer ? '✔️ Trimis la server' : '⚠️ Doar local'}
                  </span>
                </div>
                <div class="siaams-history-excerpt">${escapeHtml(cleanExcerpt)}...</div>
                <div class="siaams-history-card-actions">
                  <button type="button" class="siaams-btn-restore-idx" data-idx="${idx}">
                    🔄 Restaurează această versiune
                  </button>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;

    document.body.appendChild(backdrop);

    document.getElementById('siaams-history-close')?.addEventListener('click', () => backdrop.remove());
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) backdrop.remove();
    });

    backdrop.querySelectorAll('.siaams-btn-restore-idx').forEach((btn) => {
      btn.addEventListener('click', () => {
        const idx = Number(btn.getAttribute('data-idx'));
        if (list[idx]) {
          restoreSnapshotToDom(list[idx]);
          backdrop.remove();
        }
      });
    });
  }

  function formatFriendlyFieldName(fieldId) {
    if (fieldId === 'sExamCI') return 'Examinarea primară în secție (sExamCI)';
    if (fieldId === 'sEpicrisys') return 'Epicriza (sEpicrisys)';
    if (fieldId === 'sRecommendations') return 'Extras / Recomandări (sRecommendations)';
    if (fieldId.startsWith('sDayDiagnosis')) return `Evoluția Zilnică (${fieldId})`;
    if (fieldId === 'sCOTextDiagnosis') return 'Diagnostic externare liber';
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
        <span>👤 <strong>Date Pacient, IDNP, Statut Asigurare CNAM & Fișa de Prezentare</strong> ( Afișat automat )</span>
        <button type="button" class="siaams-btn-tiny">Ascunde / Arată ▾</button>
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
  //    Attaches a modern calendar picker to every <img id="imgShowCal" ahParent="...">
  //    and normalizes "15.11.2026" -> "15/11/2026" on blur.
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
      img.title = 'Deschide calendarul (zz/ll/aaaa)';

      // Create hidden native date input next to the calendar icon
      const nativeDate = document.createElement('input');
      nativeDate.type = 'date';
      nativeDate.className = 'siaams-hidden-date-picker';
      img.parentNode.insertBefore(nativeDate, img.nextSibling);

      img.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        // Parse current dd/mm/yyyy value
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

      // Normalize dots/hyphens (e.g. 15.11.2026 -> 15/11/2026) on blur
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
      divError.innerHTML = `<div style="color:#15803d; font-weight:600;">✔️ Pagină încărcată și activă în Google Chrome (SIA AMS Chrome Wrapper)</div>`;
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

  function stripHtmlTags(html) {
    const tmp = document.createElement('div');
    tmp.innerHTML = html;
    return (tmp.textContent || tmp.innerText || '').replace(/\s+/g, ' ').trim();
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
    upgradeDatePickersAndInputs();
    cleanFalsePositivePermissionError();
    initAutoSaveVault();

    // Schedule 3-minute Session Keep-Alive heartbeat (#5)
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