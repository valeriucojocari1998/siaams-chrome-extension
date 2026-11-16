/**
 * SIA AMS Chrome Wrapper & Crash-Guard — v1.1.0
 * build.mjs — Generates all v1.1.0 distribution artifacts in v1/dist/:
 *   1. dist/INSTALL_GUIDE.html                (self-contained EN/RU/RO guide with 21 embedded step images)
 *   2. dist/Instaleaza_SIAAMS_Chrome_v1.1.bat (localized RO/RU/EN self-extracting installer, UTF-8 safe via base64)
 *   3. dist/siaams-chrome-extension-v1.1.0.zip
 *   4. dist/siaams-chrome-wrapper-v1.1.user.js
 */
import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const V1_DIR = __dirname;
const ROOT_DIR = path.resolve(V1_DIR, '..');
const DIST_DIR = path.join(V1_DIR, 'dist');
const ASSETS_DIR = path.join(V1_DIR, 'tools', 'guide-assets');

fs.mkdirSync(DIST_DIR, { recursive: true });

// ---------------------------------------------------------------------------
// 1. Build self-contained 3-language INSTALL_GUIDE.html
// ---------------------------------------------------------------------------
function readImgDataUri(lang, step) {
  const p = path.join(ASSETS_DIR, lang, `step${step}.png`);
  const b64 = fs.readFileSync(p).toString('base64');
  return `data:image/png;base64,${b64}`;
}

const GUIDE_DATA = {
  ro: {
    langName: 'Română',
    badge: 'v1.1.0 · Ghid Oficial de Instalare',
    title: '🛡️ Instalare SIA AMS Chrome Wrapper v1.1.0 (30 secunde)',
    subtitle: 'Compatibilitate completă Google Chrome & Microsoft Edge pentru SIA AMS (Hipocrate H3), interfață în 3 limbi (RO / RU / EN), editor modern stil Word + Notion, protecție anti-expirare sesiune și salvare automată a ciornelor.',
    whatsNewTitle: '✨ Ce aduce nou versiunea v1.1.0',
    whatsNew: [
      '🌐 <strong>3 limbi (RO / RU / EN)</strong> — comutator instantaneu în bara de sus, fără reîncărcarea paginii.',
      '📝 <strong>Editor stil Word + Notion</strong> — bară de formatare cu pictograme clare, meniu plutitor la selectarea textului, comenzi rapide cu tasta <code>/</code> și scurtături Markdown atât în fereastra CKEditor, cât și la editarea directă în pagină.',
      '🗄️ <strong>Gestionare completă a ciornelor Auto-Save</strong> — ștergere individuală sau în masă (cu buton <em>Anulează</em>), fereastră globală „Toate ciornele” și <strong>Vizualizator pentru copiere</strong> (Copy formatat / text simplu) fără risc de modificare pe server.'
    ],
    steps: [
      {
        num: 1,
        title: 'Pasul 1: Rulați INSTALL.bat (sau dezarhivați .zip)',
        body: 'Faceți dublu-click pe <code>INSTALL.bat</code> din folderul principal. Acesta extrage automat fișierele în <code>%LOCALAPPDATA%\\SIAAMS_Chrome_Wrapper</code> și <strong>copiază automat calea folderului în Clipboard (Ctrl+V)</strong>.'
      },
      {
        num: 2,
        title: 'Pasul 2: Deschideți pagina de extensii în Chrome / Edge',
        body: 'Deschideți Google Chrome, tastați <code>chrome://extensions</code> în bara de adrese de sus (sau <code>edge://extensions</code> în Microsoft Edge) și apăsați <strong>Enter</strong>.'
      },
      {
        num: 3,
        title: 'Pasul 3: Activați „Developer mode / Modul dezvoltator”',
        body: 'În colțul din <strong>dreapta-sus</strong> al paginii <code>chrome://extensions</code>, activați comutatorul <strong>Developer mode (Modul dezvoltator)</strong>.'
      },
      {
        num: 4,
        title: 'Pasul 4: Apăsați „Load unpacked / Încarcă extensia despachetată”',
        body: 'Apăsați butonul <strong>Load unpacked (Încarcă extensia despachetată)</strong> care a apărut în <strong>stânga-sus</strong>.'
      },
      {
        num: 5,
        title: 'Pasul 5: Lipiți calea folderului (Ctrl+V) și confirmați',
        body: 'În fereastra de selectare a folderului, faceți click în căsuța <strong>Folder:</strong> de jos, apăsați <code>Ctrl+V</code> (pentru a lipi calea copiată la Pasul 1) și apăsați <strong>Select Folder (Selectează folderul)</strong>.'
      },
      {
        num: 6,
        title: 'Pasul 6: Verificați că extensia este activă',
        body: 'Cardul <strong>SIA AMS Chrome Wrapper & Crash-Guard 1.1.0</strong> apare în listă cu comutatorul albastru activat.'
      },
      {
        num: 7,
        title: 'Pasul 7: Deschideți SIA AMS și alegeți limba RO | RU | EN',
        body: 'Deschideți <a href="https://www.ams.md/SIAAMS_Republican/" target="_blank">https://www.ams.md/SIAAMS_Republican/</a>. În bara de sus puteți schimba oricând limba interfeței (<strong>RO | RU | EN</strong>), accesa <strong>🗄️ Toate ciornele</strong> și folosi noul editor!'
      }
    ],
    faqTitle: '🔧 Întrebări frecvente & Rezolvare probleme',
    faqs: [
      [ 'Pot instala extensia și în Microsoft Edge?', 'Da! Pașii sunt identici: deschideți <code>edge://extensions</code>, activați „Developer mode” și apăsați „Load unpacked”. De asemenea, instalatorul creează pe Desktop scurtătura „SIA AMS (Modern)”.' ],
      [ 'Cum actualizez de la v1.0.0 la v1.1.0?', 'Rulați noul <code>INSTALL.bat</code> (care suprascrie fișierele din același folder), apoi în <code>chrome://extensions</code> apăsați pictograma de reîncărcare (⟳) de pe cardul extensiei.' ],
      [ 'Cum funcționează comenzile stil Notion în editor?', 'În orice câmp deschis în CKEditor sau la „Editează direct în pagină”: tastați <code>/</code> la începutul rândului pentru meniul de blocuri și secțiuni clinice, selectați text pentru bara plutitoare, sau tastați <code># </code> pentru titlu și <code>- </code> pentru listă.' ]
    ]
  },
  ru: {
    langName: 'Русский',
    badge: 'v1.1.0 · Официальная инструкция по установке',
    title: '🛡️ Установка SIA AMS Chrome Wrapper v1.1.0 (за 30 секунд)',
    subtitle: 'Полная совместимость SIA AMS (Hipocrate H3) с Google Chrome и Microsoft Edge, интерфейс на 3 языках (RO / RU / EN), современный редактор в стиле Word + Notion, защита сессии и автосохранение черновиков.',
    whatsNewTitle: '✨ Что нового в версии v1.1.0',
    whatsNew: [
      '🌐 <strong>3 языка интерфейса (RO / RU / EN)</strong> — мгновенное переключение в верхней панели без перезагрузки страницы.',
      '📝 <strong>Редактор в стиле Word + Notion</strong> — удобная панель с иконками, всплывающее меню при выделении текста, быстрые команды через клавишу <code>/</code> и автоформатирование Markdown как в окне CKEditor, так и прямо на странице.',
      '🗄️ <strong>Управление локальными черновиками</strong> — удаление отдельных или выбранных версий (с кнопкой <em>Отменить</em>), окно «Все черновики» и <strong>Просмотр текста для копирования</strong> (с форматированием или как простой текст) без отправки на сервер.'
    ],
    steps: [
      {
        num: 1,
        title: 'Шаг 1: Запустите INSTALL.bat (или распакуйте .zip)',
        body: 'Дважды щёлкните <code>INSTALL.bat</code> в главной папке. Файлы автоматически распакуются в <code>%LOCALAPPDATA%\\SIAAMS_Chrome_Wrapper</code>, а <strong>путь к папке автоматически скопируется в буфер обмена (Ctrl+V)</strong>.'
      },
      {
        num: 2,
        title: 'Шаг 2: Откройте страницу расширений в Chrome / Edge',
        body: 'Откройте Google Chrome, введите <code>chrome://extensions</code> в адресной строке (или <code>edge://extensions</code> в Microsoft Edge) и нажмите <strong>Enter</strong>.'
      },
      {
        num: 3,
        title: 'Шаг 3: Включите «Режим разработчика» (Developer mode)',
        body: 'В <strong>правом верхнем углу</strong> страницы <code>chrome://extensions</code> включите переключатель <strong>Режим разработчика (Developer mode)</strong>.'
      },
      {
        num: 4,
        title: 'Шаг 4: Нажмите «Загрузить распакованное расширение»',
        body: 'Нажмите кнопку <strong>Загрузить распакованное расширение (Load unpacked)</strong> в <strong>левом верхнем углу</strong>.'
      },
      {
        num: 5,
        title: 'Шаг 5: Вставьте путь к папке (Ctrl+V) и подтвердите',
        body: 'В окне выбора папки щёлкните в поле <strong>Папка: (Folder:)</strong> внизу, нажмите <code>Ctrl+V</code> и нажмите кнопку <strong>Выбор папки (Select Folder)</strong>.'
      },
      {
        num: 6,
        title: 'Шаг 6: Убедитесь, что расширение включено',
        body: 'Карточка <strong>SIA AMS Chrome Wrapper & Crash-Guard 1.1.0</strong> появится в списке с активным синим переключателем.'
      },
      {
        num: 7,
        title: 'Шаг 7: Откройте SIA AMS и выберите язык RO | RU | EN',
        body: 'Откройте <a href="https://www.ams.md/SIAAMS_Republican/" target="_blank">https://www.ams.md/SIAAMS_Republican/</a>. В верхней панели можно в любой момент переключить язык (<strong>RO | RU | EN</strong>), открыть <strong>🗄️ Все черновики</strong> и пользоваться новым редактором!'
      }
    ],
    faqTitle: '🔧 Частые вопросы и решение проблем',
    faqs: [
      [ 'Можно ли установить расширение в Microsoft Edge?', 'Да! Шаги те же: откройте <code>edge://extensions</code>, включите «Режим разработчика» и нажмите «Загрузить распакованное». Также установщик создаёт ярлык «SIA AMS (Modern)» на Рабочем столе.' ],
      [ 'Как обновиться с версии v1.0.0 до v1.1.0?', 'Запустите новый <code>INSTALL.bat</code> (он обновит файлы в той же папке), затем на странице <code>chrome://extensions</code> нажмите значок обновления (⟳) на карточке расширения.' ],
      [ 'Как пользоваться командами Notion в редакторе?', 'В любом поле CKEditor или в режиме «Редактировать на странице»: введите <code>/</code> в начале строки для вызова меню блоков и клинических заголовков, выделите текст для всплывающей панели или введите <code># </code> для заголовка и <code>- </code> для списка.' ]
    ]
  },
  en: {
    langName: 'English',
    badge: 'v1.1.0 · Official Installation Guide',
    title: '🛡️ Install SIA AMS Chrome Wrapper v1.1.0 (30 seconds)',
    subtitle: 'Full Google Chrome & Microsoft Edge compatibility for SIA AMS (Hipocrate H3), 3-language interface (RO / RU / EN), modern Word + Notion style editor, session Keep-Alive protection, and continuous local Auto-Save.',
    whatsNewTitle: '✨ What’s New in v1.1.0',
    whatsNew: [
      '🌐 <strong>3 UI Languages (RO / RU / EN)</strong> — instant switcher in the top bar without reloading the page.',
      '📝 <strong>Word + Notion Style Rich Editor</strong> — clean icon toolbar, floating selection bubble, <code>/</code> slash command menu, and Markdown shortcuts inside both the CKEditor modal and the in-page editor.',
      '🗄️ <strong>Full Draft Vault Management</strong> — delete single or selected versions (with <em>Undo</em>), a global "All drafts" manager, and a <strong>Copy-Only Draft Viewer</strong> (Copy formatted or plain text) that never touches the server.'
    ],
    steps: [
      {
        num: 1,
        title: 'Step 1: Run INSTALL.bat (or extract the .zip)',
        body: 'Double-click <code>INSTALL.bat</code> in the main folder. It extracts the extension to <code>%LOCALAPPDATA%\\SIAAMS_Chrome_Wrapper</code> and <strong>automatically copies the folder path to your Clipboard (Ctrl+V)</strong>.'
      },
      {
        num: 2,
        title: 'Step 2: Open the Extensions page in Chrome / Edge',
        body: 'Open Google Chrome, type <code>chrome://extensions</code> in the top address bar (or <code>edge://extensions</code> in Microsoft Edge) and press <strong>Enter</strong>.'
      },
      {
        num: 3,
        title: 'Step 3: Turn ON "Developer mode"',
        body: 'In the <strong>top-right corner</strong> of <code>chrome://extensions</code>, switch on <strong>Developer mode</strong>.'
      },
      {
        num: 4,
        title: 'Step 4: Click "Load unpacked"',
        body: 'Click the <strong>Load unpacked</strong> button that appeared in the <strong>top-left corner</strong>.'
      },
      {
        num: 5,
        title: 'Step 5: Paste the folder path (Ctrl+V) & Select Folder',
        body: 'In the folder picker dialog, click inside the bottom <strong>Folder:</strong> box, press <code>Ctrl+V</code> (pasting the path from Step 1), and click <strong>Select Folder</strong>.'
      },
      {
        num: 6,
        title: 'Step 6: Verify the extension card is enabled',
        body: 'The <strong>SIA AMS Chrome Wrapper & Crash-Guard 1.1.0</strong> card appears with its blue toggle enabled.'
      },
      {
        num: 7,
        title: 'Step 7: Open SIA AMS and switch languages (RO | RU | EN)',
        body: 'Open <a href="https://www.ams.md/SIAAMS_Republican/" target="_blank">https://www.ams.md/SIAAMS_Republican/</a>. Use the top-right <strong>RO | RU | EN</strong> switcher anytime, open <strong>🗄️ All drafts</strong>, and enjoy the new Word + Notion editor!'
      }
    ],
    faqTitle: '🔧 Troubleshooting & FAQ',
    faqs: [
      [ 'Can I also install it in Microsoft Edge?', 'Yes! The steps are identical: open <code>edge://extensions</code>, turn on "Developer mode", and click "Load unpacked". The installer also places a "SIA AMS (Modern)" shortcut on your Desktop.' ],
      [ 'How do I update from v1.0.0 to v1.1.0?', 'Run the new <code>INSTALL.bat</code> (which updates the files in place), then on <code>chrome://extensions</code> click the reload icon (⟳) on the extension card.' ],
      [ 'How do the Notion-style editor commands work?', 'Inside CKEditor or "Edit directly in page": type <code>/</code> at the start of a line to open the block & clinical section menu, select any text for the floating formatting bubble, or type <code># </code> for headings and <code>- </code> for bullet lists.' ]
    ]
  }
};

function buildInstallGuideHtml() {
  const sectionsHtml = Object.entries(GUIDE_DATA).map(([ lang, d ]) => {
    const stepsHtml = d.steps.map((s) => {
      const imgUri = readImgDataUri(lang, s.num);
      return `
        <div class="step-card">
          <div class="step-header">
            <span class="step-badge">${s.num}</span>
            <h2>${s.title}</h2>
          </div>
          <p class="step-desc">${s.body}</p>
          <div class="step-img-wrap">
            <img src="${imgUri}" alt="${s.title.replace(/"/g, '&quot;')}" loading="lazy" />
          </div>
        </div>
      `;
    }).join('\n');

    const faqHtml = d.faqs.map(([ q, a ]) => `
      <div class="faq-item">
        <div class="faq-q">❓ ${q}</div>
        <div class="faq-a">${a}</div>
      </div>
    `).join('\n');

    return `
      <section class="lang-section" data-lang-section="${lang}">
        <div class="hero">
          <span class="hero-badge">${d.badge}</span>
          <h1>${d.title}</h1>
          <p class="hero-sub">${d.subtitle}</p>
        </div>
        <div class="whats-new">
          <h3>${d.whatsNewTitle}</h3>
          <ul>
            ${d.whatsNew.map((w) => `<li>${w}</li>`).join('')}
          </ul>
        </div>
        <div class="steps-list">
          ${stepsHtml}
        </div>
        <div class="faq-box">
          <h3>${d.faqTitle}</h3>
          ${faqHtml}
        </div>
      </section>
    `;
  }).join('\n');

  return `<!DOCTYPE html>
<html lang="ro">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>SIA AMS Chrome Wrapper v1.1.0 — Installation Guide (RO / RU / EN)</title>
  <style>
    :root {
      --primary: #1d4ed8;
      --primary-dark: #1e3a8a;
      --bg: #f1f5f9;
      --card: #ffffff;
      --border: #cbd5e1;
      --text: #0f172a;
      --muted: #475569;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: var(--bg);
      color: var(--text);
      line-height: 1.6;
      padding-bottom: 60px;
    }
    .topbar {
      position: sticky;
      top: 0;
      z-index: 100;
      background: linear-gradient(90deg, #0f172a 0%, #1e293b 100%);
      color: #f8fafc;
      padding: 12px 24px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      box-shadow: 0 4px 12px rgba(15, 23, 42, 0.2);
    }
    .topbar-brand {
      display: flex;
      align-items: center;
      gap: 10px;
      font-weight: 700;
      font-size: 15px;
    }
    .lang-tabs {
      display: flex;
      gap: 6px;
      background: #0f172a;
      padding: 4px;
      border-radius: 8px;
      border: 1px solid #334155;
    }
    .lang-tab {
      background: transparent;
      color: #cbd5e1;
      border: none;
      border-radius: 6px;
      padding: 6px 14px;
      font-size: 13px;
      font-weight: 700;
      cursor: pointer;
      transition: all 0.15s;
    }
    .lang-tab:hover {
      color: #ffffff;
      background: #1e293b;
    }
    .lang-tab.active {
      background: #2563eb;
      color: #ffffff;
      box-shadow: 0 2px 6px rgba(37, 99, 235, 0.4);
    }
    .container {
      max-width: 920px;
      margin: 28px auto;
      padding: 0 20px;
    }
    .lang-section { display: none; }
    .lang-section.active { display: block; }
    .hero {
      background: linear-gradient(135deg, #1e3a8a 0%, #1d4ed8 100%);
      color: #ffffff;
      border-radius: 14px;
      padding: 28px 32px;
      margin-bottom: 22px;
      box-shadow: 0 10px 25px rgba(29, 78, 216, 0.2);
    }
    .hero-badge {
      display: inline-block;
      background: rgba(255, 255, 255, 0.18);
      padding: 4px 12px;
      border-radius: 999px;
      font-size: 12px;
      font-weight: 700;
      margin-bottom: 10px;
    }
    .hero h1 {
      margin: 0 0 10px 0;
      font-size: 24px;
    }
    .hero-sub {
      margin: 0;
      color: #e0f2fe;
      font-size: 14px;
    }
    .whats-new {
      background: #eff6ff;
      border: 1px solid #93c5fd;
      border-radius: 12px;
      padding: 18px 24px;
      margin-bottom: 24px;
    }
    .whats-new h3 {
      margin: 0 0 10px 0;
      color: #1e40af;
      font-size: 16px;
    }
    .whats-new ul {
      margin: 0;
      padding-left: 20px;
      font-size: 14px;
    }
    .whats-new li { margin-bottom: 6px; }
    .step-card {
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 22px 26px;
      margin-bottom: 22px;
      box-shadow: 0 4px 12px rgba(15, 23, 42, 0.05);
    }
    .step-header {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 8px;
    }
    .step-badge {
      width: 32px;
      height: 32px;
      border-radius: 50%;
      background: var(--primary);
      color: #ffffff;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font-weight: 800;
      font-size: 15px;
      flex-shrink: 0;
    }
    .step-card h2 {
      margin: 0;
      font-size: 18px;
      color: #1e293b;
    }
    .step-desc {
      margin: 6px 0 14px 0;
      color: var(--muted);
      font-size: 14px;
    }
    .step-img-wrap {
      border: 1px solid #cbd5e1;
      border-radius: 10px;
      overflow: hidden;
      background: #0f172a;
    }
    .step-img-wrap img {
      display: block;
      width: 100%;
      height: auto;
    }
    code {
      background: #e2e8f0;
      padding: 2px 7px;
      border-radius: 5px;
      font-family: Consolas, monospace;
      font-size: 13px;
      font-weight: 700;
      color: #0f172a;
    }
    .faq-box {
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 22px 26px;
      margin-top: 28px;
    }
    .faq-box h3 {
      margin: 0 0 14px 0;
      font-size: 18px;
      color: #1e293b;
    }
    .faq-item {
      border-top: 1px solid #e2e8f0;
      padding: 12px 0;
    }
    .faq-q {
      font-weight: 700;
      color: #0f172a;
      margin-bottom: 4px;
    }
    .faq-a {
      color: var(--muted);
      font-size: 14px;
    }
  </style>
</head>
<body>
  <header class="topbar">
    <div class="topbar-brand">🛡️ SIA AMS Chrome Wrapper v1.1.0</div>
    <div class="lang-tabs" role="tablist">
      <button type="button" class="lang-tab" data-lang-btn="ro">🇷🇴 Română (RO)</button>
      <button type="button" class="lang-tab" data-lang-btn="ru">🇷🇺 Русский (RU)</button>
      <button type="button" class="lang-tab" data-lang-btn="en">🇬🇧 English (EN)</button>
    </div>
  </header>
  <main class="container">
    ${sectionsHtml}
  </main>
  <script>
    (function () {
      var VALID = ['ro', 'ru', 'en'];
      function detectLang() {
        var params = new URLSearchParams(window.location.search);
        var q = (params.get('lang') || '').toLowerCase();
        if (VALID.indexOf(q) !== -1) return q;
        try {
          var saved = localStorage.getItem('siaams_guide_lang');
          if (VALID.indexOf(saved) !== -1) return saved;
        } catch (e) {}
        var nav = (navigator.language || 'ro').toLowerCase();
        if (nav.indexOf('ro') === 0 || nav.indexOf('mo') === 0) return 'ro';
        if (nav.indexOf('ru') === 0 || nav.indexOf('uk') === 0) return 'ru';
        return 'en';
      }
      function setLang(lang) {
        if (VALID.indexOf(lang) === -1) lang = 'ro';
        document.documentElement.lang = lang;
        try { localStorage.setItem('siaams_guide_lang', lang); } catch (e) {}
        document.querySelectorAll('[data-lang-btn]').forEach(function (b) {
          b.classList.toggle('active', b.getAttribute('data-lang-btn') === lang);
        });
        document.querySelectorAll('[data-lang-section]').forEach(function (s) {
          s.classList.toggle('active', s.getAttribute('data-lang-section') === lang);
        });
      }
      document.querySelectorAll('[data-lang-btn]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          setLang(btn.getAttribute('data-lang-btn'));
        });
      });
      setLang(detectLang());
    })();
  </script>
</body>
</html>`;
}

const guideHtml = buildInstallGuideHtml();
for (const dir of [ ROOT_DIR, V1_DIR, DIST_DIR ]) {
  const p = path.join(dir, 'INSTALL.html');
  fs.writeFileSync(p, guideHtml, 'utf8');
  console.log(`✅ Built ${p} (${(Buffer.byteLength(guideHtml) / 1024).toFixed(1)} KB)`);
}
const guidePath = path.join(V1_DIR, 'INSTALL.html');

if (fs.existsSync(path.join(DIST_DIR, 'siaams-chrome-extension-v1.1.0.zip'))) fs.unlinkSync(path.join(DIST_DIR, 'siaams-chrome-extension-v1.1.0.zip'));
for (const oldName of [
  'INSTALARE_RAPIDA.html',
  'INSTALL_GUIDE.html',
  'Instaleaza_SIAAMS_Chrome_v1.bat',
  'Instaleaza_SIAAMS_Chrome_v1.1.bat',
  'siaams-chrome-extension-v1.0.0.zip',
  'siaams-chrome-wrapper-v1.user.js'
]) {
  const p = path.join(DIST_DIR, oldName);
  if (fs.existsSync(p)) fs.unlinkSync(p);
}

// ---------------------------------------------------------------------------
// 2. Build self-extracting localized INSTALL.bat
//    Uses base64-encoded UTF-8 messages so Cyrillic & Romanian diacritics never break!
// ---------------------------------------------------------------------------
const EXT_FILES = [
  'manifest.json',
  '_locales/ro/messages.json',
  '_locales/ru/messages.json',
  '_locales/en/messages.json',
  'src/main-world-polyfills.js',
  'src/i18n.js',
  'src/rich-editor.js',
  'src/draft-vault-ui.js',
  'src/ui-and-crash-guard.js',
  'src/modern-chrome.css'
];

const payloadMap = {};
for (const rel of EXT_FILES) {
  payloadMap[rel] = fs.readFileSync(path.join(V1_DIR, rel)).toString('base64');
}
payloadMap['INSTALL.html'] = Buffer.from(guideHtml, 'utf8').toString('base64');

const payloadB64 = Buffer.from(JSON.stringify(payloadMap), 'utf8').toString('base64');

const INSTALLER_MSGS = {
  ro: {
    title: 'SIA AMS Chrome Wrapper v1.1.0 - Gata!',
    body: [
      'Fișierele extensiei v1.1.0 au fost extrase cu succes în:',
      '{TARGET}',
      '',
      '✅ Calea folderului a fost deja COPIATĂ în Clipboard (Ctrl+V)!',
      '📖 Ghidul ilustrat (RO / RU / EN) s-a deschis în browser.',
      '',
      'În Google Chrome (la pagina chrome://extensions):',
      '1. Activați „Developer mode / Modul dezvoltator” (dreapta-sus)',
      '2. Apăsați „Load unpacked / Încarcă extensia despachetată” (stânga-sus)',
      '3. În căsuța „Folder:” de jos, apăsați Ctrl+V (Paste) și apoi Enter de 2 ori!'
    ].join('\r\n')
  },
  ru: {
    title: 'SIA AMS Chrome Wrapper v1.1.0 - Готово!',
    body: [
      'Файлы расширения v1.1.0 успешно распакованы в:',
      '{TARGET}',
      '',
      '✅ Путь к папке УЖЕ СКОПИРОВАН в буфер обмена (Ctrl+V)!',
      '📖 Иллюстрированная инструкция (RO / RU / EN) открыта в браузере.',
      '',
      'В Google Chrome (на странице chrome://extensions):',
      '1. Включите «Режим разработчика / Developer mode» (справа вверху)',
      '2. Нажмите «Загрузить распакованное расширение / Load unpacked» (слева вверху)',
      '3. В поле «Папка:» внизу нажмите Ctrl+V и дважды нажмите Enter!'
    ].join('\r\n')
  },
  en: {
    title: 'SIA AMS Chrome Wrapper v1.1.0 - Ready!',
    body: [
      'The v1.1.0 extension files have been extracted to:',
      '{TARGET}',
      '',
      '✅ The folder path is ALREADY COPIED to your Clipboard (Ctrl+V)!',
      '📖 The illustrated guide (RO / RU / EN) has opened in your browser.',
      '',
      'In Google Chrome (on chrome://extensions):',
      '1. Turn ON "Developer mode" (top-right corner)',
      '2. Click "Load unpacked" (top-left)',
      '3. In the "Folder:" box at the bottom, press Ctrl+V and press Enter twice!'
    ].join('\r\n')
  }
};

const msgsB64 = Buffer.from(JSON.stringify(INSTALLER_MSGS), 'utf8').toString('base64');

const batContent = [
  '<# :',
  '@echo off',
  'title Install - SIA AMS Chrome Wrapper v1.1.0',
  'echo =====================================================================',
  'echo   Installing SIA AMS Chrome Wrapper v1.1.0 (RO / RU / EN)...',
  'echo =====================================================================',
  'powershell -NoProfile -ExecutionPolicy Bypass -Command "$s = [System.IO.File]::ReadAllText(\'%~f0\', [System.Text.Encoding]::UTF8); Invoke-Expression $s"',
  'exit /b',
  '#>',
  '',
  '$ErrorActionPreference = \'Stop\'',
  '$target = Join-Path $env:LOCALAPPDATA \'SIAAMS_Chrome_Wrapper\'',
  'New-Item -ItemType Directory -Force -Path $target | Out-Null',
  '',
  `$b64 = '${payloadB64}'`,
  '$json = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String($b64))',
  '$files = ConvertFrom-Json $json',
  '',
  'foreach ($prop in $files.PSObject.Properties) {',
  '  $relPath = $prop.Name -replace \'/\', \'\\\'',
  '  $filePath = Join-Path $target $relPath',
  '  $parentDir = Split-Path -Parent $filePath',
  '  if (-not (Test-Path $parentDir)) {',
  '    New-Item -ItemType Directory -Force -Path $parentDir | Out-Null',
  '  }',
  '  $bytes = [System.Convert]::FromBase64String($prop.Value)',
  '  [System.IO.File]::WriteAllBytes($filePath, $bytes)',
  '}',
  '',
  'Set-Clipboard -Value $target',
  '',
  'try {',
  '  $desktop = [Environment]::GetFolderPath(\'Desktop\')',
  '  $lnkPath = Join-Path $desktop \'SIA AMS (Modern).lnk\'',
  '  $wsh = New-Object -ComObject WScript.Shell',
  '  $sc = $wsh.CreateShortcut($lnkPath)',
  '  $edgePath = \'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe\'',
  '  if (-not (Test-Path $edgePath)) {',
  '    $edgePath = \'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe\'',
  '  }',
  '  $profileDir = Join-Path $env:LOCALAPPDATA \'SIAAMS_Browser_Profile\'',
  '  $sc.TargetPath = $edgePath',
  '  $sc.Arguments = \'--user-data-dir="\' + $profileDir + \'" --load-extension="\' + $target + \'" https://www.ams.md/SIAAMS_Republican/\'',
  '  $sc.Save()',
  '} catch {}',
  '',
  '$iso = (Get-UICulture).TwoLetterISOLanguageName.ToLower()',
  '$lang = if ($iso -eq \'ro\') { \'ro\' } elseif ($iso -eq \'ru\' -or $iso -eq \'uk\' -or $iso -eq \'be\') { \'ru\' } else { \'en\' }',
  '',
  'Start-Process \'explorer.exe\' (\'/select,"\' + (Join-Path $target \'manifest.json\') + \'"\')',
  'try {',
  '  $guideFile = Join-Path $target \'INSTALL.html\'',
  '  Start-Process $guideFile',
  '} catch {}',
  '',
  `$msgsB64 = '${msgsB64}'`,
  '$msgsJson = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String($msgsB64))',
  '$msgs = ConvertFrom-Json $msgsJson',
  '$m = $msgs.$lang',
  '$bodyText = $m.body.Replace(\'{TARGET}\', $target)',
  '',
  'Add-Type -AssemblyName PresentationFramework',
  '[System.Windows.MessageBox]::Show($bodyText, $m.title, \'OK\', \'Information\') | Out-Null',
  ''
].join('\r\n');

for (const dir of [ ROOT_DIR, V1_DIR, DIST_DIR ]) {
  const p = path.join(dir, 'INSTALL.bat');
  fs.writeFileSync(p, batContent, 'ascii');
  console.log(`✅ Built ${p} (${(Buffer.byteLength(batContent) / 1024).toFixed(1)} KB, pure ASCII + Base64 UTF-8)`);
}
const batPath = path.join(V1_DIR, 'INSTALL.bat');

// ---------------------------------------------------------------------------
// 3. Build siaams-chrome-wrapper-v1.1.user.js (Userscript bundle)
// ---------------------------------------------------------------------------
const polyfillsSrc = fs.readFileSync(path.join(V1_DIR, 'src/main-world-polyfills.js'), 'utf8');
const i18nSrc = fs.readFileSync(path.join(V1_DIR, 'src/i18n.js'), 'utf8');
const rteSrc = fs.readFileSync(path.join(V1_DIR, 'src/rich-editor.js'), 'utf8');
const vaultSrc = fs.readFileSync(path.join(V1_DIR, 'src/draft-vault-ui.js'), 'utf8');
const guardSrc = fs.readFileSync(path.join(V1_DIR, 'src/ui-and-crash-guard.js'), 'utf8');
const cssSrc = fs.readFileSync(path.join(V1_DIR, 'src/modern-chrome.css'), 'utf8');

const userScriptContent = `// ==UserScript==
// @name         SIA AMS Chrome Wrapper & Crash-Guard
// @namespace    https://www.ams.md/
// @version      1.1.1
// @description  Full Chrome compatibility for SIA AMS (Hipocrate H3), RO/RU/EN UI, Word + Notion style editor, session Keep-Alive & Auto-Save Vault.
// @author       SIA AMS Wrapper
// @match        https://www.ams.md/*
// @match        http://www.ams.md/*
// @run-at       document-start
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  // 1. MAIN-world IE6/HTC polyfills at document-start
${polyfillsSrc}

  // 2. Inject CSS & UI modules when DOM is ready
  function injectStylesAndUi() {
    if (window === window.top || window.innerWidth >= 100) {
      var style = document.createElement('style');
      style.id = 'siaams-modern-chrome-css';
      style.textContent = ${JSON.stringify(cssSrc)};
      (document.head || document.documentElement).appendChild(style);
    }
${i18nSrc}
${rteSrc}
${vaultSrc}
${guardSrc}
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectStylesAndUi, { once: true });
  } else {
    injectStylesAndUi();
  }
})();
`;

const userScriptPath = path.join(DIST_DIR, 'siaams-chrome-wrapper-v1.1.user.js');
fs.writeFileSync(userScriptPath, userScriptContent, 'utf8');
console.log(`✅ Built ${userScriptPath} (${(Buffer.byteLength(userScriptContent) / 1024).toFixed(1)} KB)`);

// ---------------------------------------------------------------------------
// 4. Build siaams-chrome-extension-v1.1.0.zip
// ---------------------------------------------------------------------------
const zipPath = path.join(DIST_DIR, 'siaams-chrome-extension-v1.1.1.zip');
const stageDir = path.join(DIST_DIR, '_zip_stage');
if (fs.existsSync(stageDir)) fs.rmSync(stageDir, { recursive: true, force: true });
if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);

for (const rel of EXT_FILES) {
  const dst = path.join(stageDir, rel);
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.copyFileSync(path.join(V1_DIR, rel), dst);
}
fs.copyFileSync(guidePath, path.join(stageDir, 'INSTALL.html'));
fs.copyFileSync(batPath, path.join(stageDir, 'INSTALL.bat'));

execFileSync('powershell.exe', [
  '-NoProfile',
  '-Command',
  `Compress-Archive -Path '${stageDir}\\*' -DestinationPath '${zipPath}' -Force`
]);
fs.rmSync(stageDir, { recursive: true, force: true });
console.log(`✅ Built ${zipPath} (${(fs.statSync(zipPath).size / 1024).toFixed(1)} KB)`);
