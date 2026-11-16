/**
 * SIA AMS Chrome Wrapper & Crash-Guard — v1.1.0
 * rich-editor.js — Shared "Word + Notion" style editing layer for any contenteditable surface.
 *
 * Used by:
 *   - CKEditor 3 popup (#ToolPopUPHTML) -> attached to the editor iframe <body>
 *   - In-page editor on checkout.asp / checkin.asp previews (#siaams-preview-*)
 *   - Draft Viewer modal (draft-vault-ui.js)
 *
 * API: window.__SIAAMS_RTE__ = { attach(el, opts) -> controller, sanitizeHtml(html, doc), insertGlycemicRow(el) }
 *   opts = {
 *     doc,            // document that owns `el` (defaults to el.ownerDocument; may be an iframe document)
 *     mount(toolbar), // custom toolbar mounting (default: inserted right before `el`)
 *     onChange(),     // called after each formatting command / DOM change
 *     beforeCommand(), afterCommand(), // hooks (CKEditor uses them for undo snapshots)
 *     undo(), redo(), // optional overrides (CKEditor undo manager)
 *     handlePaste,    // default true (CKEditor has its own paste pipeline -> false)
 *     placeholder,    // show "type / for commands" placeholder when empty
 *     extraButtons: [{ id, html, titleKey, run(ctrl) }]
 *   }
 *
 * Engine: document.execCommand (the same primitive CKEditor 3 uses) -> output stays simple HTML
 * (p, strong/b, em/i, u, ul/ol, table, span style) compatible with SIA AMS storage & print templates.
 */
(function () {
  'use strict';
  if (window.__SIAAMS_RTE__) return;

  const TOP = document;
  const t = (k, p) => (window.__SIAAMS_I18N__ ? window.__SIAAMS_I18N__.t(k, p) : k);

  // ---------------------------------------------------------------------------
  // Icons (inline SVG, stroke style)
  // ---------------------------------------------------------------------------
  const svg = (inner) => `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;
  const ICON = {
    undo: svg('<path d="M9 14L4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 0 10h-3"/>'),
    redo: svg('<path d="M15 14l5-5-5-5"/><path d="M20 9H9a5 5 0 0 0 0 10h3"/>'),
    bullet: svg('<path d="M9 6h11M9 12h11M9 18h11"/><circle cx="4.5" cy="6" r="1.2" fill="currentColor"/><circle cx="4.5" cy="12" r="1.2" fill="currentColor"/><circle cx="4.5" cy="18" r="1.2" fill="currentColor"/>'),
    numbered: svg('<path d="M10 6h10M10 12h10M10 18h10"/><path d="M4 4.5h1.5V9M4 9h3" stroke-width="1.6"/><path d="M4 14.2c.4-.6 1-.9 1.6-.8.8.1 1.3.8 1 1.5L4 19h3" stroke-width="1.6"/>'),
    indent: svg('<path d="M11 7h9M11 12h9M11 17h9M4 9l3 3-3 3"/>'),
    outdent: svg('<path d="M11 7h9M11 12h9M11 17h9M7 9l-3 3 3 3"/>'),
    alignLeft: svg('<path d="M4 6h16M4 10h10M4 14h16M4 18h10"/>'),
    alignCenter: svg('<path d="M4 6h16M7 10h10M4 14h16M7 18h10"/>'),
    alignRight: svg('<path d="M4 6h16M10 10h10M4 14h16M10 18h10"/>'),
    justify: svg('<path d="M4 6h16M4 10h16M4 14h16M4 18h16"/>'),
    table: svg('<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18M3 15h18M9 4v16M15 4v16"/>'),
    tableOps: svg('<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18M9 4v16"/><path d="M15 13v6M12 16h6"/>'),
    hr: svg('<path d="M3 12h18"/><path d="M8 7h8M8 17h8" stroke-width="1.2" opacity=".5"/>'),
    date: svg('<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 11h18"/>'),
    glycemic: svg('<path d="M12 3c3 4 6 7.5 6 11a6 6 0 0 1-12 0c0-3.5 3-7 6-11z"/><path d="M12 11v6M9 14h6" stroke-width="1.6"/>'),
    clear: svg('<path d="M4 7V5h16v2M9 19h6M12 5l-2.2 14"/><path d="M15 14l5 5M20 14l-5 5" stroke-width="1.8"/>'),
    plain: svg('<rect x="6" y="4" width="12" height="17" rx="2"/><path d="M9 4V3h6v1M9 10h6M9 14h6M9 18h3"/>'),
    chevron: '<span class="siaams-rte-chev">▾</span>'
  };

  const TEXT_COLORS = [ '#000000', '#475569', '#b91c1c', '#c2410c', '#a16207', '#15803d', '#1d4ed8', '#7e22ce' ];
  const HIGHLIGHTS = [ '#fef08a', '#bbf7d0', '#bfdbfe', '#fecaca', '#e9d5ff', '#fed7aa' ];
  const BLOCKS = [
    { tag: 'p', key: 'editor.text' },
    { tag: 'h1', key: 'editor.h1' },
    { tag: 'h2', key: 'editor.h2' },
    { tag: 'h3', key: 'editor.h3' },
    { tag: 'blockquote', key: 'editor.quote' }
  ];

  // Clinical section headers (inserted in Romanian — they belong to the official medical record)
  const CLINICAL = [
    { id: 'acuze', label: 'Acuze:', aliases: 'acuze жалобы complaints' },
    { id: 'anamneza_bolii', label: 'Anamneza bolii:', aliases: 'anamneza bolii анамнез заболевания history present illness' },
    { id: 'anamneza_vietii', label: 'Anamneza vieții:', aliases: 'anamneza vietii анамнез жизни life history' },
    { id: 'status_obiectiv', label: 'Status obiectiv:', aliases: 'status obiectiv объективный статус objective examination' },
    { id: 'status_local', label: 'Status local:', aliases: 'status local локальный статус local status' },
    { id: 'stare_generala', label: 'Starea generală:', aliases: 'starea generala общее состояние general condition' },
    { id: 'examen_paraclinic', label: 'Examen paraclinic:', aliases: 'examen paraclinic analize параклинические анализы labs paraclinical' },
    { id: 'diagnostic_clinic', label: 'Diagnostic clinic:', aliases: 'diagnostic clinic диагноз diagnosis' },
    { id: 'tratament', label: 'Tratament efectuat:', aliases: 'tratament лечение treatment' },
    { id: 'recomandari', label: 'Recomandări:', aliases: 'recomandari рекомендации recommendations' }
  ];

  const BLOCK_TAGS = new Set([ 'P', 'DIV', 'LI', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'BLOCKQUOTE', 'TD', 'TH', 'PRE' ]);

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------
  function escapeHtml(str) {
    return String(str ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function normalize(str) {
    return String(str || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  }

  function todayStr() {
    const d = new Date();
    return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`;
  }

  // ---------------------------------------------------------------------------
  // Paste sanitizer (Word / web -> clean SIA-compatible HTML)
  // ---------------------------------------------------------------------------
  const ALLOWED_TAGS = new Set([
    'p', 'br', 'b', 'strong', 'i', 'em', 'u', 's', 'strike', 'sub', 'sup', 'ul', 'ol', 'li',
    'table', 'thead', 'tbody', 'tfoot', 'tr', 'td', 'th', 'h1', 'h2', 'h3', 'h4', 'blockquote', 'span', 'div', 'hr'
  ]);
  const DROP_TAGS = new Set([ 'style', 'script', 'meta', 'link', 'title', 'head', 'xml', 'iframe', 'object', 'embed', 'noscript', 'img', 'svg' ]);
  const ALLOWED_STYLE = [ 'font-weight', 'font-style', 'text-decoration', 'text-decoration-line', 'text-align', 'color', 'background-color', 'vertical-align' ];

  function cleanTree(node) {
    Array.from(node.childNodes).forEach((child) => {
      if (child.nodeType === 8) { child.remove(); return; }
      if (child.nodeType !== 1) return;
      const tag = child.tagName.toLowerCase();
      if (DROP_TAGS.has(tag)) { child.remove(); return; }
      cleanTree(child);
      if (tag.includes(':') || !ALLOWED_TAGS.has(tag)) {
        child.replaceWith(...Array.from(child.childNodes));
        return;
      }
      const styleParts = [];
      if (child.style) {
        ALLOWED_STYLE.forEach((prop) => {
          const v = child.style.getPropertyValue(prop);
          if (v && !/windowtext|mso|initial|inherit/i.test(v)) styleParts.push(`${prop}:${v}`);
        });
      }
      Array.from(child.attributes).forEach((attr) => {
        const n = attr.name.toLowerCase();
        const keep = ((tag === 'td' || tag === 'th') && (n === 'colspan' || n === 'rowspan')) ||
                     (tag === 'table' && (n === 'border' || n === 'cellspacing' || n === 'cellpadding'));
        if (!keep) child.removeAttribute(attr.name);
      });
      if (styleParts.length) child.setAttribute('style', styleParts.join(';'));
      if (tag === 'span' && !child.attributes.length) child.replaceWith(...Array.from(child.childNodes));
    });
  }

  function sanitizeHtml(html, doc) {
    const d = doc || TOP;
    const tpl = d.createElement('template');
    tpl.innerHTML = String(html || '')
      .replace(/<!--\[if[\s\S]*?<!\[endif\]-->/gi, '')
      .replace(/<!--StartFragment-->|<!--EndFragment-->/gi, '');
    cleanTree(tpl.content);
    return tpl.innerHTML.trim();
  }

  // ---------------------------------------------------------------------------
  // Glycemic profile helper (#15) — works on any editable root (CKEditor body or in-page div)
  // ---------------------------------------------------------------------------
  const F = (inner) => `<span style="font-size:16px"><span style="font-family:times new roman,times,serif">${inner}</span></span>`;

  function glycemicRowHtml() {
    const now = new Date();
    const ddMm = `${String(now.getDate()).padStart(2, '0')}.${String(now.getMonth() + 1).padStart(2, '0')}`;
    return `<tr><td>${F('<strong>Glicemia</strong>')}</td><td>${F(ddMm)}</td>${('<td>' + F('&nbsp;') + '</td>').repeat(5)}</tr>`;
  }

  function glycemicTableHtml() {
    return `<h3>${F('<strong>Profil glicemic la glucometru:</strong>')}</h3>` +
      '<table border="1" cellspacing="0" style="border-collapse:collapse; width:100%;"><tbody>' +
      '<tr><td>&nbsp;</td><td><strong>Data</strong></td><td><strong>8.00</strong></td><td><strong>11.00</strong></td><td><strong>14.00</strong></td><td><strong>18.00</strong></td><td><strong>21.00</strong></td></tr>' +
      glycemicRowHtml() + '</tbody></table><p><br></p>';
  }

  function findGlycemicTable(root) {
    return Array.from(root.querySelectorAll('table')).find((tb) => /Glicemia|8\.00/.test(tb.textContent));
  }

  /** Appends a row to an existing glycemic table inside `root`. Returns the new row or null. */
  function insertGlycemicRow(root) {
    const table = findGlycemicTable(root);
    if (!table) return null;
    const tbody = table.tBodies[0] || table;
    tbody.insertAdjacentHTML('beforeend', glycemicRowHtml());
    return tbody.lastElementChild;
  }

  // ---------------------------------------------------------------------------
  // Controller
  // ---------------------------------------------------------------------------
  function attach(el, opts = {}) {
    const doc = opts.doc || el.ownerDocument;
    const win = doc.defaultView;
    const frameEl = doc !== TOP ? win.frameElement : null;
    const cleanups = [];
    const state = { savedRange: null, slash: null, slashActive: 0, plainPaste: false, shiftDown: false, destroyed: false, popOwner: null };
    const on = (target, ev, fn, o) => { target.addEventListener(ev, fn, o); cleanups.push(() => target.removeEventListener(ev, fn, o)); };

    if (opts.placeholder) {
      el.setAttribute('data-siaams-placeholder', t('editor.placeholder'));
      el.classList.add('siaams-rte-has-placeholder');
    }

    // UI shells (always live in the TOP document so they stack above jQuery UI dialogs)
    const toolbar = TOP.createElement('div');
    toolbar.className = 'siaams-rte-toolbar';
    toolbar.setAttribute('role', 'toolbar');
    const bubble = TOP.createElement('div');
    bubble.className = 'siaams-rte-bubble';
    const slashMenu = TOP.createElement('div');
    slashMenu.className = 'siaams-rte-slash';
    const pop = TOP.createElement('div');
    pop.className = 'siaams-rte-pop';
    [ bubble, slashMenu, pop ].forEach((n) => { n.style.display = 'none'; TOP.body.appendChild(n); });

    if (typeof opts.mount === 'function') opts.mount(toolbar);
    else el.parentNode.insertBefore(toolbar, el);

    // Prevent toolbar/bubble/menus from stealing focus & selection
    [ toolbar, bubble, slashMenu, pop ].forEach((n) => {
      n.addEventListener('mousedown', (e) => {
        if (e.target.closest('input, select')) return;
        e.preventDefault();
      });
    });

    // -------------------------------------------------------------- selection
    function selection() { return win.getSelection(); }

    function inEditor(node) { return Boolean(node) && (node === el || el.contains(node)); }

    function saveSelection() {
      const sel = selection();
      if (sel && sel.rangeCount && inEditor(sel.anchorNode)) {
        state.savedRange = sel.getRangeAt(0).cloneRange();
      }
    }

    function focusEditor() {
      try {
        if (frameEl) win.focus();
        el.focus({ preventScroll: true });
      } catch (_e) {}
    }

    function restoreSelection() {
      focusEditor();
      const sel = selection();
      if (state.savedRange && inEditor(state.savedRange.commonAncestorContainer)) {
        sel.removeAllRanges();
        sel.addRange(state.savedRange);
      } else if (!sel.rangeCount || !inEditor(sel.anchorNode)) {
        const r = doc.createRange();
        r.selectNodeContents(el);
        r.collapse(false);
        sel.removeAllRanges();
        sel.addRange(r);
      }
    }

    function toTopRect(rect) {
      if (!frameEl) return rect;
      const f = frameEl.getBoundingClientRect();
      const dx = f.left + frameEl.clientLeft;
      const dy = f.top + frameEl.clientTop;
      return { left: rect.left + dx, right: rect.right + dx, top: rect.top + dy, bottom: rect.bottom + dy, width: rect.width, height: rect.height };
    }

    function currentCell() {
      const sel = selection();
      let n = sel && sel.anchorNode;
      if (!inEditor(n)) n = state.savedRange && state.savedRange.startContainer;
      while (n && n !== el) {
        if (n.nodeType === 1 && (n.tagName === 'TD' || n.tagName === 'TH')) return n;
        n = n.parentNode;
      }
      return null;
    }

    function closestBlock(node) {
      let n = node;
      while (n && n !== el) {
        if (n.nodeType === 1 && BLOCK_TAGS.has(n.tagName)) return n;
        n = n.parentNode;
      }
      return el;
    }

    // -------------------------------------------------------------- commands
    function afterChange(manual) {
      saveSelection();
      if (manual) el.dispatchEvent(new Event('input', { bubbles: true }));
      if (typeof opts.afterCommand === 'function') opts.afterCommand();
      if (typeof opts.onChange === 'function') opts.onChange();
      updateToolbarState();
    }

    function exec(cmd, val = null) {
      restoreSelection();
      if (typeof opts.beforeCommand === 'function') opts.beforeCommand();
      const useCss = cmd === 'hiliteColor' || cmd === 'foreColor' || cmd === 'backColor';
      try { doc.execCommand('styleWithCSS', false, useCss); } catch (_e) {}
      let ok = false;
      try { ok = doc.execCommand(cmd, false, val); } catch (_e) {}
      if (cmd === 'hiliteColor' && !ok) {
        try { doc.execCommand('backColor', false, val); } catch (_e) {}
      }
      try { doc.execCommand('styleWithCSS', false, false); } catch (_e) {}
      afterChange(false);
    }

    function insertHtml(html) { exec('insertHTML', html); }

    function domChange(fn) {
      restoreSelection();
      if (typeof opts.beforeCommand === 'function') opts.beforeCommand();
      fn();
      afterChange(true);
    }

    function placeCaret(node, atStart = true) {
      const r = doc.createRange();
      r.selectNodeContents(node);
      r.collapse(atStart);
      const sel = selection();
      sel.removeAllRanges();
      sel.addRange(r);
      saveSelection();
    }

    function insertTable(rows, cols) {
      const row = `<tr>${'<td>&nbsp;</td>'.repeat(cols)}</tr>`;
      insertHtml(`<table border="1" cellspacing="0" cellpadding="4" style="border-collapse:collapse;width:100%"><tbody>${row.repeat(rows)}</tbody></table><p><br></p>`);
    }

    function tableOp(op) {
      const cell = currentCell();
      if (!cell) return;
      const tr = cell.parentElement;
      const table = cell.closest('table');
      const idx = cell.cellIndex;
      domChange(() => {
        const newCell = () => { const td = doc.createElement('td'); td.innerHTML = '&nbsp;'; return td; };
        if (op === 'rowAbove' || op === 'rowBelow') {
          const nr = doc.createElement('tr');
          for (let i = 0; i < tr.cells.length; i++) nr.appendChild(newCell());
          tr.parentNode.insertBefore(nr, op === 'rowAbove' ? tr : tr.nextSibling);
          placeCaret(nr.cells[Math.min(idx, nr.cells.length - 1)]);
        } else if (op === 'colLeft' || op === 'colRight') {
          Array.from(table.rows).forEach((row) => {
            const ref = row.cells[idx];
            const c = newCell();
            if (!ref) row.appendChild(c);
            else row.insertBefore(c, op === 'colLeft' ? ref : ref.nextSibling);
          });
        } else if (op === 'delRow') {
          const next = tr.nextElementSibling || tr.previousElementSibling;
          tr.remove();
          if (!table.rows.length) table.remove();
          else if (next && next.cells[0]) placeCaret(next.cells[Math.min(idx, next.cells.length - 1)]);
        } else if (op === 'delCol') {
          Array.from(table.rows).forEach((row) => { if (row.cells[idx]) row.cells[idx].remove(); });
          if (!table.rows[0] || !table.rows[0].cells.length) table.remove();
        } else if (op === 'delTable') {
          table.remove();
        }
      });
    }

    function glycemicRow() {
      const existing = findGlycemicTable(el);
      if (existing) {
        domChange(() => {
          const row = insertGlycemicRow(el);
          if (row && row.cells[2]) placeCaret(row.cells[2]);
        });
      } else {
        insertHtml(glycemicTableHtml());
      }
    }

    function insertClinical(label) {
      insertHtml(`<strong>${escapeHtml(label)}</strong>&nbsp;`);
    }

    const ctrl = {
      el, doc, exec, insertHtml, insertTable, tableOp, glycemicRow,
      undo: () => (typeof opts.undo === 'function' ? (restoreSelection(), opts.undo(), afterChange(false)) : exec('undo')),
      redo: () => (typeof opts.redo === 'function' ? (restoreSelection(), opts.redo(), afterChange(false)) : exec('redo')),
      refresh: () => { renderToolbar(); updateToolbarState(); },
      detach
    };

    // -------------------------------------------------------------- toolbar
    function buttonDefs() {
      const defs = [
        { id: 'undo', html: ICON.undo, title: 'editor.undo', run: () => ctrl.undo() },
        { id: 'redo', html: ICON.redo, title: 'editor.redo', run: () => ctrl.redo() },
        'sep',
        { id: 'block', kind: 'dropdown', wide: true, html: () => `<span class="siaams-rte-block-label">${escapeHtml(blockLabel())}</span>${ICON.chevron}`, title: 'editor.blockStyle', menu: blockMenu },
        'sep',
        { id: 'bold', html: '<b>B</b>', title: 'editor.bold', run: () => exec('bold'), state: 'bold' },
        { id: 'italic', html: '<i style="font-family:Georgia,serif">I</i>', title: 'editor.italic', run: () => exec('italic'), state: 'italic' },
        { id: 'underline', html: '<u>U</u>', title: 'editor.underline', run: () => exec('underline'), state: 'underline' },
        { id: 'strike', html: '<s>S</s>', title: 'editor.strike', run: () => exec('strikeThrough'), state: 'strikeThrough' },
        { id: 'sup', html: 'x<sup>2</sup>', title: 'editor.sup', run: () => exec('superscript'), state: 'superscript' },
        { id: 'sub', html: 'x<sub>2</sub>', title: 'editor.sub', run: () => exec('subscript'), state: 'subscript' },
        'sep',
        { id: 'color', kind: 'dropdown', html: `<span class="siaams-rte-color-a">A<span style="background:#b91c1c"></span></span>${ICON.chevron}`, title: 'editor.color', menu: () => colorMenu('foreColor') },
        { id: 'hilite', kind: 'dropdown', html: `<span class="siaams-rte-hilite-a">ab</span>${ICON.chevron}`, title: 'editor.highlight', menu: () => colorMenu('hiliteColor') },
        'sep',
        { id: 'ul', html: ICON.bullet, title: 'editor.bullet', run: () => exec('insertUnorderedList'), state: 'insertUnorderedList' },
        { id: 'ol', html: ICON.numbered, title: 'editor.numbered', run: () => exec('insertOrderedList'), state: 'insertOrderedList' },
        { id: 'outdent', html: ICON.outdent, title: 'editor.outdent', run: () => exec('outdent') },
        { id: 'indent', html: ICON.indent, title: 'editor.indent', run: () => exec('indent') },
        'sep',
        { id: 'left', html: ICON.alignLeft, title: 'editor.alignLeft', run: () => exec('justifyLeft'), state: 'justifyLeft' },
        { id: 'center', html: ICON.alignCenter, title: 'editor.alignCenter', run: () => exec('justifyCenter'), state: 'justifyCenter' },
        { id: 'right', html: ICON.alignRight, title: 'editor.alignRight', run: () => exec('justifyRight'), state: 'justifyRight' },
        { id: 'full', html: ICON.justify, title: 'editor.justify', run: () => exec('justifyFull'), state: 'justifyFull' },
        'sep',
        { id: 'table', kind: 'dropdown', html: ICON.table + ICON.chevron, title: 'editor.table', menu: tableGridMenu },
        { id: 'tableOps', kind: 'dropdown', html: ICON.tableOps + ICON.chevron, title: 'editor.tableOps', menu: tableOpsMenu, hidden: true },
        { id: 'hr', html: ICON.hr, title: 'editor.hr', run: () => exec('insertHorizontalRule') },
        { id: 'date', html: ICON.date, title: 'editor.date', run: () => exec('insertText', todayStr()) },
        { id: 'glycemic', html: ICON.glycemic, title: 'editor.glycemic', run: glycemicRow, cls: 'siaams-rte-btn-clinical' },
        'sep',
        { id: 'clear', html: ICON.clear, title: 'editor.clear', run: () => { exec('removeFormat'); exec('formatBlock', 'p'); } }
      ];
      if (opts.handlePaste !== false) {
        defs.push({ id: 'plain', html: ICON.plain, title: 'editor.plainPaste', run: () => { state.plainPaste = !state.plainPaste; updateToolbarState(); }, toggle: () => state.plainPaste });
      }
      (opts.extraButtons || []).forEach((b) => defs.push('sep', { id: b.id, html: typeof b.html === 'function' ? b.html : b.html, title: b.titleKey, run: () => b.run(ctrl), cls: 'siaams-rte-btn-text' }));
      return defs;
    }

    let defsCache = [];
    function renderToolbar() {
      defsCache = buttonDefs();
      toolbar.innerHTML = '';
      const group = () => { const g = TOP.createElement('div'); g.className = 'siaams-rte-group'; toolbar.appendChild(g); return g; };
      let g = group();
      defsCache.forEach((d) => {
        if (d === 'sep') { g = group(); return; }
        const btn = TOP.createElement('button');
        btn.type = 'button';
        btn.className = `siaams-rte-btn ${d.wide ? 'siaams-rte-btn-wide' : ''} ${d.cls || ''}`;
        btn.dataset.id = d.id;
        btn.title = t(d.title);
        btn.setAttribute('aria-label', t(d.title));
        btn.innerHTML = typeof d.html === 'function' ? d.html() : d.html;
        if (d.hidden) btn.style.display = 'none';
        btn.addEventListener('click', (e) => {
          e.preventDefault();
          if (d.kind === 'dropdown') togglePop(btn, d);
          else { closePop(); d.run(); }
        });
        g.appendChild(btn);
      });
      const hint = TOP.createElement('div');
      hint.className = 'siaams-rte-hint';
      hint.textContent = t('editor.hint');
      toolbar.appendChild(hint);
    }

    function blockLabel() {
      let v = '';
      try { v = String(doc.queryCommandValue('formatBlock') || '').toLowerCase().replace(/[<>]/g, ''); } catch (_e) {}
      const b = BLOCKS.find((x) => x.tag === v);
      return t(b ? b.key : 'editor.text');
    }

    function updateToolbarState() {
      if (state.destroyed) return;
      defsCache.forEach((d) => {
        if (d === 'sep') return;
        const btn = toolbar.querySelector(`[data-id="${d.id}"]`);
        if (!btn) return;
        if (d.state) {
          let active = false;
          try { active = inEditor(selection().anchorNode) && doc.queryCommandState(d.state); } catch (_e) {}
          btn.classList.toggle('active', active);
        }
        if (d.toggle) btn.classList.toggle('active', d.toggle());
      });
      const label = toolbar.querySelector('.siaams-rte-block-label');
      if (label) label.textContent = blockLabel();
      const ops = toolbar.querySelector('[data-id="tableOps"]');
      if (ops) ops.style.display = currentCell() ? '' : 'none';
    }

    // -------------------------------------------------------------- popovers
    function closePop() { pop.style.display = 'none'; state.popOwner = null; }

    function positionFixed(node, rect, prefer = 'below') {
      node.style.display = 'block';
      const h = node.offsetHeight;
      const w = node.offsetWidth;
      let top = prefer === 'below' ? rect.bottom + 6 : rect.top - h - 8;
      if (prefer === 'above' && top < 44) top = rect.bottom + 8;
      if (top + h > window.innerHeight - 6) top = Math.max(6, rect.top - h - 8);
      let left = Math.min(rect.left, window.innerWidth - w - 8);
      node.style.top = `${Math.max(6, top)}px`;
      node.style.left = `${Math.max(6, left)}px`;
    }

    function togglePop(btn, def) {
      if (state.popOwner === def.id && pop.style.display !== 'none') { closePop(); return; }
      saveSelection();
      pop.innerHTML = '';
      pop.appendChild(def.menu());
      state.popOwner = def.id;
      positionFixed(pop, btn.getBoundingClientRect(), 'below');
    }

    function menuItem(label, run, extraHtml = '') {
      const item = TOP.createElement('button');
      item.type = 'button';
      item.className = 'siaams-rte-menu-item';
      item.innerHTML = `${extraHtml}<span>${escapeHtml(label)}</span>`;
      item.addEventListener('click', () => { closePop(); run(); });
      return item;
    }

    function blockMenu() {
      const wrap = TOP.createElement('div');
      wrap.className = 'siaams-rte-menu';
      BLOCKS.forEach((b) => {
        const item = menuItem(t(b.key), () => exec('formatBlock', b.tag));
        item.classList.add(`siaams-rte-menu-${b.tag}`);
        wrap.appendChild(item);
      });
      return wrap;
    }

    function colorMenu(cmd) {
      const wrap = TOP.createElement('div');
      wrap.className = 'siaams-rte-swatches';
      const list = cmd === 'foreColor' ? TEXT_COLORS : HIGHLIGHTS;
      list.forEach((c) => {
        const s = TOP.createElement('button');
        s.type = 'button';
        s.className = 'siaams-rte-swatch';
        s.style.background = c;
        s.title = c;
        s.addEventListener('click', () => { closePop(); exec(cmd, c); });
        wrap.appendChild(s);
      });
      const none = TOP.createElement('button');
      none.type = 'button';
      none.className = 'siaams-rte-swatch-none';
      none.textContent = t('editor.noColor');
      none.addEventListener('click', () => { closePop(); exec(cmd, cmd === 'foreColor' ? '#000000' : 'transparent'); });
      wrap.appendChild(none);
      return wrap;
    }

    function tableGridMenu() {
      const wrap = TOP.createElement('div');
      wrap.className = 'siaams-rte-grid-wrap';
      const label = TOP.createElement('div');
      label.className = 'siaams-rte-grid-label';
      label.textContent = t('editor.table');
      const grid = TOP.createElement('div');
      grid.className = 'siaams-rte-grid';
      const N = 8;
      for (let r = 1; r <= N; r++) {
        for (let c = 1; c <= N; c++) {
          const cell = TOP.createElement('span');
          cell.dataset.r = r;
          cell.dataset.c = c;
          grid.appendChild(cell);
        }
      }
      grid.addEventListener('mouseover', (e) => {
        const cell = e.target.closest('span[data-r]');
        if (!cell) return;
        const R = Number(cell.dataset.r);
        const C = Number(cell.dataset.c);
        grid.querySelectorAll('span').forEach((s) => s.classList.toggle('on', Number(s.dataset.r) <= R && Number(s.dataset.c) <= C));
        label.textContent = t('editor.tableSize', { r: R, c: C });
      });
      grid.addEventListener('click', (e) => {
        const cell = e.target.closest('span[data-r]');
        if (!cell) return;
        closePop();
        insertTable(Number(cell.dataset.r), Number(cell.dataset.c));
      });
      wrap.append(label, grid);
      return wrap;
    }

    function tableOpsMenu() {
      const wrap = TOP.createElement('div');
      wrap.className = 'siaams-rte-menu';
      [ 'rowAbove', 'rowBelow', 'colLeft', 'colRight', 'delRow', 'delCol', 'delTable' ].forEach((op) => {
        const item = menuItem(t(`editor.${op}`), () => tableOp(op));
        if (op.startsWith('del')) item.classList.add('danger');
        wrap.appendChild(item);
      });
      return wrap;
    }

    // -------------------------------------------------------------- bubble (Notion-style)
    function renderBubble() {
      const items = [
        { html: '<b>B</b>', title: 'editor.bold', run: () => exec('bold'), state: 'bold' },
        { html: '<i style="font-family:Georgia,serif">I</i>', title: 'editor.italic', run: () => exec('italic'), state: 'italic' },
        { html: '<u>U</u>', title: 'editor.underline', run: () => exec('underline'), state: 'underline' },
        { html: '<s>S</s>', title: 'editor.strike', run: () => exec('strikeThrough'), state: 'strikeThrough' },
        'sep',
        { html: 'H1', title: 'editor.h1', run: () => exec('formatBlock', 'h1') },
        { html: 'H2', title: 'editor.h2', run: () => exec('formatBlock', 'h2') },
        'sep',
        { html: '<span class="siaams-rte-dot" style="background:#b91c1c"></span>', title: 'editor.color', run: () => exec('foreColor', '#b91c1c') },
        { html: '<span class="siaams-rte-dot" style="background:#fef08a;border:1px solid #ca8a04"></span>', title: 'editor.highlight', run: () => exec('hiliteColor', '#fef08a') },
        'sep',
        { html: ICON.clear, title: 'editor.clear', run: () => exec('removeFormat') }
      ];
      bubble.innerHTML = '';
      items.forEach((it) => {
        if (it === 'sep') { const s = TOP.createElement('span'); s.className = 'siaams-rte-bubble-sep'; bubble.appendChild(s); return; }
        const b = TOP.createElement('button');
        b.type = 'button';
        b.className = 'siaams-rte-bubble-btn';
        b.innerHTML = it.html;
        b.title = t(it.title);
        if (it.state) b.dataset.state = it.state;
        b.addEventListener('click', (e) => { e.preventDefault(); it.run(); updateBubble(); });
        bubble.appendChild(b);
      });
    }

    function updateBubble() {
      if (state.destroyed) return;
      const sel = selection();
      if (!sel || !sel.rangeCount || sel.isCollapsed || !inEditor(sel.anchorNode) || state.slash || el.getAttribute('contenteditable') === 'false') {
        bubble.style.display = 'none';
        return;
      }
      const range = sel.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      if (!rect || (!rect.width && !rect.height)) { bubble.style.display = 'none'; return; }
      bubble.querySelectorAll('[data-state]').forEach((b) => {
        let a = false;
        try { a = doc.queryCommandState(b.dataset.state); } catch (_e) {}
        b.classList.toggle('active', a);
      });
      positionFixed(bubble, toTopRect(rect), 'above');
    }

    // -------------------------------------------------------------- slash menu
    function slashItems() {
      const basic = [
        { id: 'p', label: t('editor.paragraph'), aliases: 'text paragraf абзац paragraph', run: () => exec('formatBlock', 'p') },
        { id: 'h1', label: t('editor.h1'), aliases: 'h1 titlu заголовок heading', run: () => exec('formatBlock', 'h1') },
        { id: 'h2', label: t('editor.h2'), aliases: 'h2 titlu заголовок heading', run: () => exec('formatBlock', 'h2') },
        { id: 'h3', label: t('editor.h3'), aliases: 'h3 titlu заголовок heading', run: () => exec('formatBlock', 'h3') },
        { id: 'ul', label: t('editor.bullet'), aliases: 'lista puncte список маркированный bullet list', run: () => exec('insertUnorderedList') },
        { id: 'ol', label: t('editor.numbered'), aliases: 'lista numerotata нумерованный numbered list', run: () => exec('insertOrderedList') },
        { id: 'quote', label: t('editor.quote'), aliases: 'citat цитата quote', run: () => exec('formatBlock', 'blockquote') }
      ].map((x) => ({ ...x, group: 'editor.groupBasic' }));
      const insert = [
        { id: 'table', label: t('editor.table3'), aliases: 'tabel таблица table', run: () => insertTable(3, 3) },
        { id: 'hr', label: t('editor.hr'), aliases: 'linie separator разделитель divider line hr', run: () => exec('insertHorizontalRule') },
        { id: 'date', label: `${t('editor.date')} (${todayStr()})`, aliases: 'data azi дата сегодня date today', run: () => exec('insertText', todayStr()) },
        { id: 'glyc', label: t('editor.glycemic'), aliases: 'glicemia glicemic гликемия glucose glycemic', run: glycemicRow },
        { id: 'glyct', label: t('editor.glycemicTable'), aliases: 'profil glicemic таблица гликемии glycemic table', run: () => insertHtml(glycemicTableHtml()) }
      ].map((x) => ({ ...x, group: 'editor.groupInsert' }));
      const clinical = CLINICAL.map((c) => ({ id: c.id, label: c.label, aliases: c.aliases, group: 'editor.groupClinical', run: () => insertClinical(c.label) }));
      return [ ...basic, ...insert, ...clinical ];
    }

    function filteredSlashItems() {
      const q = normalize(state.slash ? state.slash.query : '');
      return slashItems().filter((it) => !q || normalize(`${it.label} ${it.aliases}`).includes(q));
    }

    function renderSlash() {
      const items = filteredSlashItems();
      state.slashItems = items;
      if (state.slashActive >= items.length) state.slashActive = 0;
      slashMenu.innerHTML = '';
      if (!items.length) {
        const empty = TOP.createElement('div');
        empty.className = 'siaams-rte-slash-empty';
        empty.textContent = t('editor.slashEmpty');
        slashMenu.appendChild(empty);
        return;
      }
      let lastGroup = '';
      items.forEach((it, i) => {
        if (it.group !== lastGroup) {
          lastGroup = it.group;
          const h = TOP.createElement('div');
          h.className = 'siaams-rte-slash-group';
          h.textContent = t(it.group);
          slashMenu.appendChild(h);
        }
        const b = TOP.createElement('button');
        b.type = 'button';
        b.className = `siaams-rte-slash-item ${i === state.slashActive ? 'active' : ''}`;
        b.textContent = it.label;
        b.addEventListener('mouseenter', () => { state.slashActive = i; slashMenu.querySelectorAll('.siaams-rte-slash-item').forEach((n, j) => n.classList.toggle('active', j === i)); });
        b.addEventListener('click', (e) => { e.preventDefault(); chooseSlash(i); });
        slashMenu.appendChild(b);
      });
      const act = slashMenu.querySelector('.siaams-rte-slash-item.active');
      if (act) act.scrollIntoView({ block: 'nearest' });
    }

    function openSlash(node, start) {
      state.slash = { node, start, query: '' };
      state.slashActive = 0;
      bubble.style.display = 'none';
      renderSlash();
      const r = doc.createRange();
      r.setStart(node, start);
      r.setEnd(node, start + 1);
      positionFixed(slashMenu, toTopRect(r.getBoundingClientRect()), 'below');
    }

    function closeSlash() {
      state.slash = null;
      slashMenu.style.display = 'none';
    }

    function updateSlashQuery() {
      const s = state.slash;
      const sel = selection();
      if (!s || !sel.rangeCount) return closeSlash();
      if (sel.anchorNode !== s.node || sel.anchorOffset <= s.start || s.node.data[s.start] !== '/') return closeSlash();
      const q = s.node.data.slice(s.start + 1, sel.anchorOffset);
      if (q.length > 30 || /\s\s/.test(q) || /\n/.test(q)) return closeSlash();
      s.query = q;
      renderSlash();
    }

    function chooseSlash(i) {
      const s = state.slash;
      const items = state.slashItems || [];
      const item = items[i];
      if (!s || !item) return closeSlash();
      const sel = selection();
      const end = Math.min(s.node.data.length, s.start + 1 + s.query.length);
      const r = doc.createRange();
      r.setStart(s.node, s.start);
      r.setEnd(s.node, end);
      sel.removeAllRanges();
      sel.addRange(r);
      try { doc.execCommand('delete', false, null); } catch (_e) { r.deleteContents(); }
      closeSlash();
      saveSelection();
      item.run();
    }

    // -------------------------------------------------------------- markdown shortcuts
    function tryBlockShortcut() {
      const sel = selection();
      if (!sel.isCollapsed || !sel.anchorNode || sel.anchorNode.nodeType !== 3) return false;
      const node = sel.anchorNode;
      const block = closestBlock(node);
      if (block.tagName === 'TD' || block.tagName === 'TH') return false;
      const r = doc.createRange();
      r.setStart(block, 0);
      r.setEnd(node, sel.anchorOffset);
      const prefix = r.toString().replace(/\u00a0/g, ' ');
      const map = [
        [ /^### $/, () => exec('formatBlock', 'h3') ],
        [ /^## $/, () => exec('formatBlock', 'h2') ],
        [ /^# $/, () => exec('formatBlock', 'h1') ],
        [ /^[-*•] $/, () => exec('insertUnorderedList') ],
        [ /^1[.)] $/, () => exec('insertOrderedList') ],
        [ /^> $/, () => exec('formatBlock', 'blockquote') ],
        [ /^--- $/, () => exec('insertHorizontalRule') ]
      ];
      const hit = map.find(([ re ]) => re.test(prefix));
      if (!hit) return false;
      if (block.tagName === 'LI' && /[-*•1]/.test(prefix[0])) return false;
      sel.removeAllRanges();
      sel.addRange(r);
      try { doc.execCommand('delete', false, null); } catch (_e) { r.deleteContents(); }
      saveSelection();
      hit[1]();
      return true;
    }

    function tryInlineShortcut(ch) {
      const sel = selection();
      if (!sel.isCollapsed || !sel.anchorNode || sel.anchorNode.nodeType !== 3) return false;
      const node = sel.anchorNode;
      const off = sel.anchorOffset;
      const before = node.data.slice(0, off);
      const re = ch === '*' ? /(^|[\s\u00a0])\*\*([^*\s][^*]*?)\*\*$/ : /(^|[\s\u00a0])_([^_\s][^_]*?)_$/;
      const m = before.match(re);
      if (!m) return false;
      const inner = m[2];
      const start = off - (m[0].length - m[1].length);
      const r = doc.createRange();
      r.setStart(node, start);
      r.setEnd(node, off);
      sel.removeAllRanges();
      sel.addRange(r);
      doc.execCommand('insertText', false, inner);
      const s2 = selection();
      const n2 = s2.anchorNode;
      const o2 = s2.anchorOffset;
      if (n2 && n2.nodeType === 3 && o2 >= inner.length) {
        const r2 = doc.createRange();
        r2.setStart(n2, o2 - inner.length);
        r2.setEnd(n2, o2);
        s2.removeAllRanges();
        s2.addRange(r2);
        const cmd = ch === '*' ? 'bold' : 'italic';
        doc.execCommand(cmd, false, null);
        s2.collapseToEnd();
        doc.execCommand(cmd, false, null);
      }
      afterChange(false);
      return true;
    }

    // -------------------------------------------------------------- events
    function onInput(e) {
      if (state.slash) updateSlashQuery();
      if (e.inputType !== 'insertText' || !e.data) return;
      const sel = selection();
      if (e.data === '/' && !state.slash && sel.anchorNode && sel.anchorNode.nodeType === 3) {
        const off = sel.anchorOffset;
        const prev = off >= 2 ? sel.anchorNode.data[off - 2] : '';
        if (off === 1 || /[\s\u00a0]/.test(prev)) {
          openSlash(sel.anchorNode, off - 1);
          return;
        }
      }
      if (e.data === ' ') { if (tryBlockShortcut()) return; }
      if (e.data === '*' || e.data === '_') tryInlineShortcut(e.data);
    }

    function moveCell(cell, backwards) {
      const table = cell.closest('table');
      const cells = Array.from(table.querySelectorAll('td, th'));
      const i = cells.indexOf(cell);
      let target = cells[backwards ? i - 1 : i + 1];
      if (!target && !backwards) {
        tableOp('rowBelow');
        return;
      }
      if (target) {
        const r = doc.createRange();
        r.selectNodeContents(target);
        const sel = selection();
        sel.removeAllRanges();
        sel.addRange(r);
        saveSelection();
      }
    }

    function onKeyDown(e) {
      state.shiftDown = e.shiftKey;
      if (!inEditor(e.target) && e.target !== doc.body && e.target !== doc.documentElement) return;
      if (state.slash) {
        const n = (state.slashItems || []).length;
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
          e.preventDefault(); e.stopImmediatePropagation();
          if (n) state.slashActive = (state.slashActive + (e.key === 'ArrowDown' ? 1 : n - 1)) % n;
          renderSlash();
          return;
        }
        if (e.key === 'Enter' || e.key === 'Tab') {
          if (n) { e.preventDefault(); e.stopImmediatePropagation(); chooseSlash(state.slashActive); return; }
          closeSlash();
        }
        if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); closeSlash(); return; }
      }
      if (e.key === 'Escape' && pop.style.display !== 'none') { closePop(); return; }
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.shiftKey && (e.code === 'Digit7' || e.code === 'Digit8')) {
        e.preventDefault(); e.stopImmediatePropagation();
        exec(e.code === 'Digit7' ? 'insertOrderedList' : 'insertUnorderedList');
        return;
      }
      if (e.key === 'Tab' && !mod) {
        const cell = currentCell();
        if (cell) { e.preventDefault(); e.stopImmediatePropagation(); moveCell(cell, e.shiftKey); return; }
        const sel = selection();
        const block = sel.anchorNode ? closestBlock(sel.anchorNode) : null;
        if (block && block.tagName === 'LI') { e.preventDefault(); e.stopImmediatePropagation(); exec(e.shiftKey ? 'outdent' : 'indent'); }
      }
    }

    function onPaste(e) {
      const cd = e.clipboardData;
      if (!cd) return;
      const html = cd.getData('text/html');
      const text = cd.getData('text/plain');
      e.preventDefault();
      saveSelection();
      if (state.plainPaste || state.shiftDown || !html) exec('insertText', text);
      else insertHtml(sanitizeHtml(html, doc));
    }

    function onSelectionChange() {
      if (state.destroyed) return;
      const sel = selection();
      if (sel && sel.rangeCount && inEditor(sel.anchorNode)) {
        saveSelection();
        updateToolbarState();
        if (state.slash) updateSlashQuery();
      }
      updateBubble();
    }

    function onOutsideMouseDown(e) {
      const n = e.target;
      if (pop.contains(n) || toolbar.contains(n)) return;
      closePop();
      if (!slashMenu.contains(n)) closeSlash();
    }

    function onScroll() {
      if (bubble.style.display !== 'none') updateBubble();
      if (state.slash) closeSlash();
      if (pop.style.display !== 'none') closePop();
    }

    on(el, 'input', onInput);
    on(doc, 'keydown', onKeyDown, true);
    on(doc, 'keyup', (e) => { state.shiftDown = e.shiftKey; }, true);
    on(doc, 'selectionchange', onSelectionChange);
    on(el, 'mouseup', () => setTimeout(updateBubble, 0));
    on(el, 'focus', updateToolbarState);
    if (opts.handlePaste !== false) on(el, 'paste', onPaste);
    on(TOP, 'mousedown', onOutsideMouseDown, true);
    if (doc !== TOP) on(doc, 'mousedown', onOutsideMouseDown, true);
    on(window, 'scroll', onScroll, true);
    if (doc !== TOP) on(win, 'scroll', onScroll, true);
    on(window, 'resize', onScroll);

    if (window.__SIAAMS_I18N__) {
      const off = window.__SIAAMS_I18N__.onChange(() => {
        renderToolbar();
        renderBubble();
        updateToolbarState();
        if (opts.placeholder) el.setAttribute('data-siaams-placeholder', t('editor.placeholder'));
      });
      cleanups.push(off);
    }

    function detach() {
      if (state.destroyed) return;
      state.destroyed = true;
      cleanups.forEach((fn) => { try { fn(); } catch (_e) {} });
      [ toolbar, bubble, slashMenu, pop ].forEach((n) => n.remove());
      el.classList.remove('siaams-rte-has-placeholder');
      el.removeAttribute('data-siaams-placeholder');
    }

    renderToolbar();
    renderBubble();
    updateToolbarState();
    return ctrl;
  }

  window.__SIAAMS_RTE__ = { attach, sanitizeHtml, insertGlycemicRow, glycemicTableHtml };
})();