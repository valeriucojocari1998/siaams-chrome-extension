/**
 * SIA AMS Chrome Wrapper & Crash-Guard
 * main-world-polyfills.js — Injected at document_start in MAIN world
 *
 * Polyfills IE5.5 / IE6 / HTC behaviors required by SIA AMS (Hipocrate H3):
 *  - form.htc: HTMLFormElement.prototype.submitForm() & .dirty() (#11)
 *  - IE DOM: Element.prototype.removeNode() (#13)
 *  - IE Collections: Element.prototype.all(idOrIndex), HTMLCollection callable bridge (#26)
 *  - IE Events: attachEvent / detachEvent / fireEvent (#26)
 *  - IE userData persistence: .load() / .save() via localStorage (#8 / #26)
 *  - Developer debug alert() suppression (#27)
 *  - jQuery multi-version protection for CKEditor & jQuery UI Dialog on checkout.asp (#8)
 */
(function () {
  'use strict';

  if (window.__SIAAMS_POLYFILLS_INSTALLED__) return;
  window.__SIAAMS_POLYFILLS_INSTALLED__ = true;

  // ---------------------------------------------------------------------------
  // 1. Suppress leftover developer debug alerts (#27)
  // ---------------------------------------------------------------------------
  const nativeAlert = window.alert.bind(window);
  const SUPPRESSED_EXACT_ALERTS = new Set([
    '1',
    '2',
    'true',
    'false',
    'undefined',
    'null',
    '[object object]'
  ]);

  window.alert = function (msg) {
    const str = String(msg ?? '').trim();
    if (
      SUPPRESSED_EXACT_ALERTS.has(str.toLowerCase()) ||
      str.includes('<autohide.htc>') ||
      str.includes('Nu a fost gasita pe aceasta pagina')
    ) {
      console.warn('[SIAAMS Chrome Guard] Alerta de debug suprimată:', str);
      return;
    }
    return nativeAlert(msg);
  };

  // ---------------------------------------------------------------------------
  // 2. IE attachEvent / detachEvent / fireEvent polyfill (#26)
  // ---------------------------------------------------------------------------
  function normalizeEventName(ev) {
    return String(ev || '').replace(/^on/i, '').toLowerCase();
  }

  function attachEventPolyfill(eventName, handler) {
    if (typeof handler !== 'function') return false;
    const type = normalizeEventName(eventName);
    this.addEventListener(type, handler, false);
    return true;
  }

  function detachEventPolyfill(eventName, handler) {
    if (typeof handler !== 'function') return false;
    const type = normalizeEventName(eventName);
    this.removeEventListener(type, handler, false);
    return true;
  }

  function fireEventPolyfill(eventName) {
    const type = normalizeEventName(eventName);
    const ev = new Event(type, { bubbles: true, cancelable: true });
    return this.dispatchEvent(ev);
  }

  for (const proto of [ window, Document.prototype, Element.prototype ]) {
    if (proto && !proto.attachEvent) {
      proto.attachEvent = attachEventPolyfill;
      proto.detachEvent = detachEventPolyfill;
      proto.fireEvent = fireEventPolyfill;
    }
  }

  // ---------------------------------------------------------------------------
  // 3. IE Element.prototype.removeNode (#13 — Deleting secondary diagnoses/procs)
  // ---------------------------------------------------------------------------
  if (!Element.prototype.removeNode) {
    Element.prototype.removeNode = function (removeChildren) {
      if (!this.parentNode) return this;
      if (removeChildren) {
        return this.parentNode.removeChild(this);
      }
      const range = document.createRange();
      range.selectNodeContents(this);
      return this.parentNode.replaceChild(range.extractContents(), this);
    };
  }
  if (!Node.prototype.removeNode) {
    Node.prototype.removeNode = Element.prototype.removeNode;
  }

  // ---------------------------------------------------------------------------
  // 4. IE Element.prototype.all & HTMLFormElement.prototype.all (#26)
  //    Supports both property access `frmEdit.all["field"]` AND function call
  //    `frmEdit.all("field")` or `frmEdit.all(0)` used across SIA AMS scripts.
  // ---------------------------------------------------------------------------
  function createCallableCollection(rootEl) {
    const lookup = function (keyOrIndex) {
      if (typeof keyOrIndex === 'number') {
        const list = rootEl.querySelectorAll('*');
        return list[keyOrIndex] || null;
      }
      const key = String(keyOrIndex || '');
      if (!key) return null;
      if (rootEl.elements && rootEl.elements.namedItem) {
        const named = rootEl.elements.namedItem(key);
        if (named) return named;
      }
      // Search by id or name inside rootEl
      const byId = rootEl.querySelector(`[id="${CSS.escape(key)}"], [name="${CSS.escape(key)}"]`);
      if (byId) return byId;
      return document.getElementById(key) || document.getElementsByName(key)[0] || null;
    };

    return new Proxy(lookup, {
      get(_target, prop) {
        if (prop === 'length') {
          return rootEl.querySelectorAll('*').length;
        }
        if (prop === 'item' || prop === 'namedItem') {
          return (k) => lookup(k);
        }
        if (typeof prop === 'symbol') {
          const list = rootEl.querySelectorAll('*');
          return list[prop]?.bind(list);
        }
        if (!Number.isNaN(Number(prop))) {
          return lookup(Number(prop));
        }
        return lookup(prop);
      },
      apply(_target, _thisArg, args) {
        return lookup(args[0]);
      }
    });
  }

  if (!('all' in Element.prototype)) {
    Object.defineProperty(Element.prototype, 'all', {
      configurable: true,
      get() {
        return createCallableCollection(this);
      }
    });
  }

  // ---------------------------------------------------------------------------
  // 5. IE #default#userData persistence (.load / .save) on Element.prototype
  // ---------------------------------------------------------------------------
  if (!Element.prototype.load) {
    Element.prototype.load = function (storeName) {
      try {
        const raw = localStorage.getItem('siaams_userdata_' + storeName);
        if (!raw) return;
        const data = JSON.parse(raw);
        for (const [ k, v ] of Object.entries(data)) {
          this.setAttribute(k, v);
        }
      } catch (_e) {}
    };
  }
  if (!Element.prototype.save) {
    Element.prototype.save = function (storeName) {
      try {
        const data = {};
        for (const attr of Array.from(this.attributes || [])) {
          if (attr.name.startsWith('p_')) {
            data[attr.name] = attr.value;
          }
        }
        localStorage.setItem('siaams_userdata_' + storeName, JSON.stringify(data));
      } catch (_e) {}
    };
  }

  // ---------------------------------------------------------------------------
  // 6. IE document.createStyleSheet polyfill (used by calendar.htc / legacy JS)
  // ---------------------------------------------------------------------------
  if (!document.createStyleSheet) {
    document.createStyleSheet = function () {
      const style = document.createElement('style');
      (document.head || document.documentElement).appendChild(style);
      const sheet = style.sheet;
      if (sheet && !sheet.addRule) {
        sheet.addRule = function (selector, rules, index) {
          return sheet.insertRule(`${selector} { ${rules} }`, index || sheet.cssRules.length);
        };
      }
      return sheet;
    };
  }

  // ---------------------------------------------------------------------------
  // 7. IE window.showModalDialog polyfill (#26)
  // ---------------------------------------------------------------------------
  if (!window.showModalDialog) {
    window.showModalDialog = function (url, arg, featureStr) {
      const w = 600;
      const h = 500;
      const left = Math.max(0, (window.screen.width - w) / 2);
      const top = Math.max(0, (window.screen.height - h) / 2);
      window.dialogArguments = arg;
      const win = window.open(
        url,
        '_blank',
        `width=${w},height=${h},left=${left},top=${top},scrollbars=yes,resizable=yes`
      );
      if (win) {
        try {
          win.dialogArguments = arg;
        } catch (_e) {}
      }
      return win;
    };
  }

  // ---------------------------------------------------------------------------
  // 8. form.htc Polyfill: HTMLFormElement.prototype.submitForm & .dirty (#11)
  //    In Chrome, clicking "Modifică (ALT+S)" calls `EditLink('S')`, which calls
  //    `document.frmEdit.submitForm()`. Without form.htc, Chrome throws:
  //    `TypeError: document.frmEdit.submitForm is not a function`.
  // ---------------------------------------------------------------------------
  HTMLFormElement.prototype.dirty = function () {
    this._siaamsDirty = true;
    const spn = document.getElementById('sAlertChange');
    if (spn) {
      spn.style.visibility = 'visible';
    }
    window.dispatchEvent(
      new CustomEvent('siaams:form-dirty', {
        detail: { form: this, timestamp: Date.now() }
      })
    );
  };

  HTMLFormElement.prototype.get_dirty = function () {
    return Boolean(this._siaamsDirty);
  };

  HTMLFormElement.prototype.submitForm = function () {
    this._siaamsDirty = false;
    if (document.body) {
      document.body.setAttribute('bu', 'form');
      document.body.bu = 'form';
    }

    // Notify our Crash-Guard & Auto-Save Vault before submitting
    const ev = new CustomEvent('siaams:before-submit', {
      cancelable: true,
      detail: { form: this, action: this.action, timestamp: Date.now() }
    });
    window.dispatchEvent(ev);
    if (ev.defaultPrevented) {
      return false;
    }

    // Safety hook for read-only E2E verification tests (guarantees ZERO server mutations!)
    if (window.__SIAAMS_BLOCK_SUBMIT_FOR_TEST__) {
      window.__SIAAMS_LAST_INTERCEPTED_SUBMIT__ = {
        action: this.getAttribute('action') || this.action,
        method: this.method,
        hdnAction: this.elements?.hdnAction?.value || null,
        timestamp: Date.now()
      };
      console.info(
        '[SIAAMS Chrome Guard] TEST MODE: submitForm() interceptat fără mutație pe server:',
        window.__SIAAMS_LAST_INTERCEPTED_SUBMIT__
      );
      window.dispatchEvent(
        new CustomEvent('siaams:submit-intercepted', {
          detail: window.__SIAAMS_LAST_INTERCEPTED_SUBMIT__
        })
      );
      return false;
    }

    return HTMLFormElement.prototype.submit.call(this);
  };

  // ---------------------------------------------------------------------------
  // 9. Preserve jQuery 1.7.2 plugins (.ckeditor & .dialog) when checkout.asp
  //    loads a second jQuery 1.6.2 at the bottom of the page (#8)
  // ---------------------------------------------------------------------------
  let savedCkePlugin = null;
  let savedDialogPlugin = null;
  let savedFancyboxPlugin = null;

  function snapshotJqueryPlugins(jq) {
    if (!jq || !jq.fn) return;
    if (jq.fn.ckeditor && !savedCkePlugin) savedCkePlugin = jq.fn.ckeditor;
    if (jq.fn.dialog && !savedDialogPlugin) savedDialogPlugin = jq.fn.dialog;
    if (jq.fn.fancybox && !savedFancyboxPlugin) savedFancyboxPlugin = jq.fn.fancybox;
  }

  function restoreJqueryPlugins(jq) {
    if (!jq || !jq.fn) return;
    if (savedCkePlugin && !jq.fn.ckeditor) jq.fn.ckeditor = savedCkePlugin;
    if (savedDialogPlugin && !jq.fn.dialog) jq.fn.dialog = savedDialogPlugin;
    if (savedFancyboxPlugin && !jq.fn.fancybox) jq.fn.fancybox = savedFancyboxPlugin;
  }

  window.__SIAAMS_ENSURE_JQUERY_PLUGINS__ = function () {
    if (window.jQuery) {
      snapshotJqueryPlugins(window.jQuery);
      restoreJqueryPlugins(window.jQuery);
    }
    if (window.$ && window.$ !== window.jQuery) {
      snapshotJqueryPlugins(window.$);
      restoreJqueryPlugins(window.$);
    }
    if (!window.$ && window.jQuery) {
      window.$ = window.jQuery;
    }
  };

  document.addEventListener('DOMContentLoaded', () => {
    window.__SIAAMS_ENSURE_JQUERY_PLUGINS__();
  });
})();
