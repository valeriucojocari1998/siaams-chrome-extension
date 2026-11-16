/**
 * SIA AMS Chrome Wrapper v1.1.0
 * tools/capture-guide-screenshots.mjs
 *
 * Captures 7 annotated, privacy-safe installation step screenshots in 3 languages (RO / RU / EN)
 * using Google Chrome + Playwright and saves them to v1/tools/guide-assets/<lang>/step1..7.png.
 */
import { createRequire } from 'module';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const V1_DIR = path.resolve(__dirname, '..');
const ASSETS_DIR = path.join(__dirname, 'guide-assets');
const SCRATCH_MODULES = 'C:/Users/valer/.gemini/antigravity-cli/brain/3cb3a4eb-99f9-4077-b2fd-da7450db3f34/scratch/node_modules/playwright-core/index.mjs';

const { chromium } = await import(`file:///${SCRATCH_MODULES}`);

const LANG_CONFIG = {
  ro: {
    chromeLang: 'ro',
    msgTitle: 'SIA AMS Chrome Wrapper v1.1.0 - Gata!',
    msgBody: [
      'Fișierele extensiei au fost extrase cu succes în:',
      'C:\\Users\\Medic\\AppData\\Local\\SIAAMS_Chrome_Wrapper',
      '',
      '✅ Calea folderului a fost deja COPIATĂ în Clipboard (Ctrl+V)!',
      '',
      'În Google Chrome (la pagina chrome://extensions):',
      '1. Activați „Developer mode / Modul dezvoltator” (dreapta-sus)',
      '2. Apăsați „Load unpacked / Încarcă extensia despachetată” (stânga-sus)',
      '3. În căsuța „Folder:” apăsați Ctrl+V și apoi Enter de 2 ori!'
    ],
    step1Callout: '1. Dublu-click pe INSTALL.bat → calea se copiază automat!',
    addrCallout: '2. Scrieți chrome://extensions în bara de adrese și apăsați Enter',
    devModeLabel: 'Modul dezvoltator',
    devCallout: '3. Activați comutatorul „Developer mode / Modul dezvoltator” (dreapta-sus)',
    loadUnpackedLabel: 'Încarcă extensia despachetată',
    loadCallout: '4. Apăsați „Load unpacked / Încarcă extensia despachetată” (stânga-sus)',
    pickerTitle: 'Selectați folderul extensiei',
    pickerFolderLabel: 'Folder:',
    pickerSelectBtn: 'Selectează folderul',
    pickerCancelBtn: 'Anulează',
    pickerCallout: '5. Apăsați Ctrl+V în căsuța „Folder:” și apoi click pe „Selectează folderul”',
    cardCallout: '6. Extensia SIA AMS Chrome Wrapper v1.1.0 este activă!',
    liveCallout: '7. Comutator limbă RO | RU | EN, Toate ciornele și Editor stil Word + Notion!'
  },
  ru: {
    chromeLang: 'ru',
    msgTitle: 'SIA AMS Chrome Wrapper v1.1.0 - Готово!',
    msgBody: [
      'Файлы расширения успешно распакованы в папку:',
      'C:\\Users\\Medic\\AppData\\Local\\SIAAMS_Chrome_Wrapper',
      '',
      '✅ Путь к папке УЖЕ СКОПИРОВАН в буфер обмена (Ctrl+V)!',
      '',
      'В Google Chrome (на странице chrome://extensions):',
      '1. Включите «Режим разработчика / Developer mode» (справа вверху)',
      '2. Нажмите «Загрузить распакованное расширение» (слева вверху)',
      '3. В поле «Папка:» нажмите Ctrl+V и затем дважды Enter!'
    ],
    step1Callout: '1. Дважды щёлкните INSTALL.bat — путь скопируется автоматически!',
    addrCallout: '2. Введите chrome://extensions в адресной строке и нажмите Enter',
    devModeLabel: 'Режим разработчика',
    devCallout: '3. Включите переключатель «Режим разработчика» (в правом верхнем углу)',
    loadUnpackedLabel: 'Загрузить распакованное расширение',
    loadCallout: '4. Нажмите «Загрузить распакованное расширение» (в левом верхнем углу)',
    pickerTitle: 'Выбор папки расширения',
    pickerFolderLabel: 'Папка:',
    pickerSelectBtn: 'Выбор папки',
    pickerCancelBtn: 'Отмена',
    pickerCallout: '5. Нажмите Ctrl+V в поле «Папка:» и нажмите «Выбор папки»',
    cardCallout: '6. Расширение SIA AMS Chrome Wrapper v1.1.0 активно и включено!',
    liveCallout: '7. Переключатель языка RO | RU | EN, Все черновики и редактор Word + Notion!'
  },
  en: {
    chromeLang: 'en-US',
    msgTitle: 'SIA AMS Chrome Wrapper v1.1.0 - Ready!',
    msgBody: [
      'Extension files were extracted to:',
      'C:\\Users\\Medic\\AppData\\Local\\SIAAMS_Chrome_Wrapper',
      '',
      '✅ The folder path is ALREADY COPIED to your Clipboard (Ctrl+V)!',
      '',
      'In Google Chrome (on chrome://extensions):',
      '1. Turn ON "Developer mode" (top-right corner)',
      '2. Click "Load unpacked" (top-left)',
      '3. In the "Folder:" box press Ctrl+V and press Enter twice!'
    ],
    step1Callout: '1. Double-click INSTALL.bat — path copies automatically!',
    addrCallout: '2. Type chrome://extensions in the address bar and press Enter',
    devModeLabel: 'Developer mode',
    devCallout: '3. Turn ON the "Developer mode" toggle (top-right corner)',
    loadUnpackedLabel: 'Load unpacked',
    loadCallout: '4. Click the "Load unpacked" button (top-left)',
    pickerTitle: 'Select the extension directory',
    pickerFolderLabel: 'Folder:',
    pickerSelectBtn: 'Select Folder',
    pickerCancelBtn: 'Cancel',
    pickerCallout: '5. Press Ctrl+V in the "Folder:" box and click "Select Folder"',
    cardCallout: '6. SIA AMS Chrome Wrapper v1.1.0 is installed and enabled!',
    liveCallout: '7. Live RO | RU | EN language switcher, All Drafts & Word + Notion Editor!'
  }
};

function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

async function renderHtmlCard(page, html, outPath) {
  await page.setViewportSize({ width: 980, height: 500 });
  await page.setContent(html, { waitUntil: 'load' });
  await page.waitForTimeout(120);
  await page.screenshot({ path: outPath, fullPage: false });
}

function buildStep1Html(cfg) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
    body { margin:0; font-family:"Segoe UI", system-ui, sans-serif; background:linear-gradient(135deg,#0f172a,#1e3a8a); color:#0f172a; height:500px; display:flex; align-items:center; justify-content:center; gap:28px; padding:0 30px; box-sizing:border-box; }
    .bat-card { background:#1e293b; color:#f8fafc; border:2px solid #38bdf8; border-radius:12px; padding:22px 24px; width:270px; box-shadow:0 16px 32px rgba(0,0,0,.35); text-align:center; position:relative; }
    .bat-icon { font-size:48px; margin-bottom:10px; }
    .bat-name { font-family:Consolas,monospace; font-size:13px; font-weight:700; background:#0f172a; padding:8px 10px; border-radius:6px; color:#38bdf8; word-break:break-all; }
    .win-box { background:#f8fafc; border:1px solid #94a3b8; border-radius:8px; width:560px; box-shadow:0 20px 40px rgba(0,0,0,.45); overflow:hidden; }
    .win-title { background:#ffffff; padding:10px 14px; font-size:13px; font-weight:600; border-bottom:1px solid #e2e8f0; display:flex; justify-content:space-between; align-items:center; }
    .win-body { padding:18px 20px; font-size:13px; line-height:1.5; color:#1e293b; display:flex; gap:14px; }
    .win-info { font-size:32px; color:#2563eb; line-height:1; }
    .win-lines { white-space:pre-line; font-family:"Segoe UI",sans-serif; }
    .win-footer { background:#f1f5f9; padding:10px 16px; text-align:right; border-top:1px solid #e2e8f0; }
    .win-ok { background:#2563eb; color:#fff; border:none; border-radius:4px; padding:6px 28px; font-weight:600; font-size:13px; }
    .callout { position:fixed; bottom:16px; left:30px; right:30px; background:#dc2626; color:#fff; padding:10px 18px; border-radius:8px; font-weight:700; font-size:14px; text-align:center; box-shadow:0 8px 20px rgba(220,38,38,.45); }
  </style></head><body>
    <div class="bat-card">
      <div class="bat-icon">⚙️</div>
      <div class="bat-name">INSTALL.bat</div>
      <div style="margin-top:10px;font-size:12px;color:#cbd5e1;">Double-Click</div>
    </div>
    <div class="win-box">
      <div class="win-title"><span>🛡️ ${escapeHtml(cfg.msgTitle)}</span><span>✕</span></div>
      <div class="win-body">
        <div class="win-info">ℹ️</div>
        <div class="win-lines">${escapeHtml(cfg.msgBody.join('\n'))}</div>
      </div>
      <div class="win-footer"><button class="win-ok">OK</button></div>
    </div>
    <div class="callout">${escapeHtml(cfg.step1Callout)}</div>
  </body></html>`;
}

function buildStep2Through4And6Html(cfg, stepNum) {
  // Renders a pixel-accurate Chrome window header + chrome://extensions toolbar & card in the target language
  const devOn = stepNum >= 3;
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
    body { margin:0; font-family:"Segoe UI", Roboto, sans-serif; background:#f1f3f4; color:#202124; height:500px; overflow:hidden; }
    .chrome-bar { background:#dfe1e5; padding:8px 14px; display:flex; align-items:center; gap:12px; border-bottom:1px solid #dadce0; }
    .dots { display:flex; gap:6px; }
    .dot { width:10px; height:10px; border-radius:50%; background:#9aa0a6; }
    .omnibox { flex:1; background:#ffffff; border-radius:20px; padding:7px 18px; font-size:14px; color:#202124; display:flex; align-items:center; gap:10px; border:2px solid ${stepNum === 2 ? '#dc2626' : 'transparent'}; box-shadow:${stepNum === 2 ? '0 0 0 4px rgba(220,38,38,.25)' : 'none'}; }
    .ext-header { background:#ffffff; padding:14px 24px; display:flex; align-items:center; justify-content:space-between; border-bottom:1px solid #dadce0; }
    .ext-title { font-size:20px; font-weight:500; display:flex; align-items:center; gap:10px; }
    .dev-wrap { display:flex; align-items:center; gap:10px; font-size:13px; padding:6px 12px; border-radius:8px; border:2px solid ${stepNum === 3 ? '#dc2626' : 'transparent'}; box-shadow:${stepNum === 3 ? '0 0 0 4px rgba(220,38,38,.25)' : 'none'}; }
    .toggle { width:36px; height:18px; border-radius:18px; background:${devOn ? '#1a73e8' : '#bdc1c6'}; position:relative; }
    .knob { width:14px; height:14px; border-radius:50%; background:#fff; position:absolute; top:2px; ${devOn ? 'right:2px' : 'left:2px'}; }
    .sub-bar { background:#ffffff; padding:10px 24px; display:flex; gap:12px; border-bottom:1px solid #dadce0; }
    .btn-outline { border:1px solid #dadce0; background:#fff; color:#1a73e8; border-radius:4px; padding:7px 14px; font-size:13px; font-weight:600; }
    .btn-load { border:2px solid ${stepNum === 4 ? '#dc2626' : '#dadce0'}; box-shadow:${stepNum === 4 ? '0 0 0 4px rgba(220,38,38,.25)' : 'none'}; background:${stepNum === 4 ? '#fef2f2' : '#fff'}; }
    .cards { padding:24px; display:flex; gap:20px; }
    .card { background:#fff; border-radius:8px; width:430px; padding:18px 20px; box-shadow:0 1px 3px rgba(60,64,67,.3); border:2px solid ${stepNum === 6 ? '#16a34a' : 'transparent'}; }
    .card-top { display:flex; gap:14px; align-items:flex-start; }
    .card-icon { width:40px; height:40px; border-radius:8px; background:#1e40af; color:#fff; display:flex; align-items:center; justify-content:center; font-size:22px; flex-shrink:0; }
    .card-name { font-size:15px; font-weight:600; margin-bottom:4px; }
    .card-desc { font-size:12px; color:#5f6368; line-height:1.45; }
    .card-foot { margin-top:16px; display:flex; justify-content:space-between; align-items:center; }
    .callout { position:fixed; bottom:18px; left:30px; right:30px; background:${stepNum === 6 ? '#15803d' : '#dc2626'}; color:#fff; padding:11px 18px; border-radius:8px; font-weight:700; font-size:14px; text-align:center; box-shadow:0 8px 20px rgba(0,0,0,.3); }
  </style></head><body>
    <div class="chrome-bar">
      <div class="dots"><span class="dot"></span><span class="dot"></span><span class="dot"></span></div>
      <div class="omnibox">🧩 <strong>chrome://extensions</strong> <span style="margin-left:auto;color:#1a73e8;font-weight:700;">↵ Enter</span></div>
    </div>
    <div class="ext-header">
      <div class="ext-title">🧩 Extensions</div>
      <div class="dev-wrap">
        <span>${escapeHtml(cfg.devModeLabel)}</span>
        <div class="toggle"><div class="knob"></div></div>
      </div>
    </div>
    ${devOn ? `
      <div class="sub-bar">
        <button class="btn-outline btn-load">${escapeHtml(cfg.loadUnpackedLabel)}</button>
        <button class="btn-outline">Pack extension</button>
        <button class="btn-outline">Update</button>
      </div>
    ` : ''}
    ${stepNum === 6 ? `
      <div class="cards">
        <div class="card">
          <div class="card-top">
            <div class="card-icon">🛡️</div>
            <div>
              <div class="card-name">SIA AMS Chrome Wrapper & Crash-Guard <span style="color:#5f6368;font-weight:400;">1.1.4</span></div>
              <div class="card-desc">RO / RU / EN · Word + Notion Editor · Auto-Save Vault · Keep-Alive</div>
              <div style="margin-top:6px;font-size:11px;color:#16a34a;font-weight:600;">ID: SiaamsChromeWrapperV110 · Loaded from: %LOCALAPPDATA%\\SIAAMS_Chrome_Wrapper</div>
            </div>
          </div>
          <div class="card-foot">
            <span style="color:#1a73e8;font-size:12px;font-weight:600;">Details · Remove</span>
            <div class="toggle"><div class="knob"></div></div>
          </div>
        </div>
      </div>
    ` : ''}
    <div class="callout">${escapeHtml(stepNum === 2 ? cfg.addrCallout : stepNum === 3 ? cfg.devCallout : stepNum === 4 ? cfg.loadCallout : cfg.cardCallout)}</div>
  </body></html>`;
}

function buildStep5Html(cfg) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
    body { margin:0; font-family:"Segoe UI", sans-serif; background:#1e293b; height:500px; display:flex; align-items:center; justify-content:center; }
    .dlg { width:680px; background:#f8fafc; border:1px solid #64748b; border-radius:8px; box-shadow:0 24px 48px rgba(0,0,0,.5); overflow:hidden; }
    .dlg-title { background:#ffffff; padding:10px 16px; font-size:13px; font-weight:600; border-bottom:1px solid #cbd5e1; display:flex; justify-content:space-between; }
    .dlg-tree { height:220px; background:#ffffff; margin:12px 16px; border:1px solid #cbd5e1; border-radius:4px; padding:12px; font-size:13px; color:#334155; }
    .folder-row { padding:5px 8px; border-radius:4px; display:flex; align-items:center; gap:8px; }
    .folder-row.sel { background:#dbeafe; color:#1e40af; font-weight:600; border:1px solid #93c5fd; }
    .dlg-input-row { display:flex; align-items:center; gap:10px; padding:4px 16px 12px 16px; font-size:13px; }
    .dlg-input { flex:1; padding:7px 10px; border:2px solid #dc2626; box-shadow:0 0 0 4px rgba(220,38,38,.2); border-radius:4px; font-family:Consolas,monospace; font-size:13px; font-weight:700; background:#fff; color:#0f172a; }
    .kbd { background:#dc2626; color:#fff; padding:4px 8px; border-radius:4px; font-weight:700; font-size:12px; }
    .dlg-foot { background:#f1f5f9; padding:10px 16px; display:flex; justify-content:flex-end; gap:10px; border-top:1px solid #cbd5e1; }
    .btn-pri { background:#2563eb; color:#fff; border:2px solid #1d4ed8; border-radius:4px; padding:6px 18px; font-weight:600; font-size:13px; }
    .btn-sec { background:#fff; color:#334155; border:1px solid #cbd5e1; border-radius:4px; padding:6px 18px; font-size:13px; }
    .callout { position:fixed; bottom:16px; left:30px; right:30px; background:#dc2626; color:#fff; padding:10px 18px; border-radius:8px; font-weight:700; font-size:14px; text-align:center; }
  </style></head><body>
    <div class="dlg">
      <div class="dlg-title"><span>📁 ${escapeHtml(cfg.pickerTitle)}</span><span>✕</span></div>
      <div class="dlg-tree">
        <div class="folder-row">💻 Local Disk (C:) ▸ Users ▸ Medic ▸ AppData ▸ Local</div>
        <div class="folder-row sel" style="margin-left:22px;margin-top:6px;">📂 SIAAMS_Chrome_Wrapper <span style="margin-left:auto;font-size:11px;color:#15803d;">✔ manifest.json · src/ · _locales/</span></div>
      </div>
      <div class="dlg-input-row">
        <strong>${escapeHtml(cfg.pickerFolderLabel)}</strong>
        <div class="dlg-input">C:\\Users\\Medic\\AppData\\Local\\SIAAMS_Chrome_Wrapper</div>
        <span class="kbd">Ctrl + V</span>
      </div>
      <div class="dlg-foot">
        <button class="btn-pri">${escapeHtml(cfg.pickerSelectBtn)}</button>
        <button class="btn-sec">${escapeHtml(cfg.pickerCancelBtn)}</button>
      </div>
    </div>
    <div class="callout">${escapeHtml(cfg.pickerCallout)}</div>
  </body></html>`;
}

// Step 7: Renders the actual v1.1.0 extension UI (top bar, sidebar, language switcher, Word+Notion editor) in the target language
const I18N_SRC = fs.readFileSync(path.join(V1_DIR, 'src/i18n.js'), 'utf8');
const RTE_SRC = fs.readFileSync(path.join(V1_DIR, 'src/rich-editor.js'), 'utf8');
const MERGE_SRC = fs.readFileSync(path.join(V1_DIR, 'src/diff-merge-ui.js'), 'utf8');
const VAULT_SRC = fs.readFileSync(path.join(V1_DIR, 'src/draft-vault-ui.js'), 'utf8');
const GUARD_SRC = fs.readFileSync(path.join(V1_DIR, 'src/ui-and-crash-guard.js'), 'utf8');
const CSS_SRC = fs.readFileSync(path.join(V1_DIR, 'src/modern-chrome.css'), 'utf8');

async function renderStep7LiveUi(page, lang, cfg, outPath) {
  await page.setViewportSize({ width: 1240, height: 600 });
  const mockSiaHtml = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>${CSS_SRC}
    .guide-highlight-lang { outline: 3px solid #ef4444 !important; box-shadow: 0 0 0 5px rgba(239,68,68,.45) !important; }
    .guide-callout-bottom { position:fixed; bottom:12px; left:266px; right:16px; z-index:20000; background:#15803d; color:#fff; padding:9px 16px; border-radius:8px; font-family:"Segoe UI",sans-serif; font-weight:700; font-size:14px; text-align:center; box-shadow:0 8px 20px rgba(0,0,0,.35); }
  </style></head><body>
    <div id="div_menu_caps" style="display:none">FIȘA EXTERNARE #100 (DEMO)</div>
    <div id="divContent">
      <form name="frmEdit" id="frmEdit">
        <textarea id="sEpicrisys">&lt;h2&gt;Epicriza / Sinteză Clinică&lt;/h2&gt;&lt;p&gt;&lt;strong&gt;Diagnostic clinic:&lt;/strong&gt; Diabet zaharat tip 2 compensat.&lt;/p&gt;&lt;p&gt;&lt;strong&gt;Recomandări:&lt;/strong&gt; Monitorizarea glicemiei și regim alimentar.&lt;/p&gt;</textarea>
        <textarea id="sRecommendations">&lt;p&gt;&lt;strong&gt;RECOMANDĂRI LA EXTERNARE (027/e):&lt;/strong&gt; Control peste 30 zile.&lt;/p&gt;</textarea>
      </form>
    </div>
  </body></html>`;

  const mockMenuHtml = `<table id="TblMenu">
    <tr><td class="menu_caps1">CONTEXT</td></tr>
    <tr><td><a class="lnk" href="/SIAAMS_Republican/Files/checkin.asp?id=100">:: Fisa Internare</a></td></tr>
    <tr><td><a class="lnk" href="/SIAAMS_Republican/Files/checkout.asp?id=100&ciid=100">:: Fisa Externare</a></td></tr>
    <tr><td class="menu_caps1">IMPRIMARE</td></tr>
    <tr><td><a class="lnk" href="/SIAAMS_Republican/Print/Recommendations/recommendations.asp?ciid=100" target="_blank">:: Extras (027/e)</a></td></tr>
    <tr><td class="menu_caps1">SECTII</td></tr>
    <tr><td><a class="lnk" href="/SIAAMS_Republican/SectionPage.asp">:: Pacienti in sectie</a></td></tr>
  </table>`;

  await page.route('https://demo.siaams.local/**', (route) => {
    const u = route.request().url();
    if (u.includes('menu.asp')) {
      return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: mockMenuHtml });
    }
    return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: mockSiaHtml });
  });

  await page.goto('https://demo.siaams.local/SIAAMS_Republican/Files/checkout.asp?id=100&ciid=100', { waitUntil: 'domcontentloaded' });
  await page.evaluate((l) => { localStorage.setItem('siaams_lang', l); }, lang);
  await page.addScriptTag({ content: I18N_SRC });
  await page.addScriptTag({ content: RTE_SRC });
  await page.addScriptTag({ content: MERGE_SRC });
  await page.addScriptTag({ content: VAULT_SRC });
  await page.addScriptTag({ content: GUARD_SRC });

  await page.evaluate((calloutText) => {
    document.querySelector('[data-action="toggle-inline-edit"][data-target="sEpicrisys"]')?.click();
    document.getElementById('siaams-lang-switcher')?.classList.add('guide-highlight-lang');
    const c = document.createElement('div');
    c.className = 'guide-callout-bottom';
    c.textContent = calloutText;
    document.body.appendChild(c);
  }, cfg.liveCallout);

  await page.waitForTimeout(250);
  await page.screenshot({ path: outPath, fullPage: false });
  await page.unroute('https://demo.siaams.local/**');
}

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage();

  for (const [ lang, cfg ] of Object.entries(LANG_CONFIG)) {
    const dir = path.join(ASSETS_DIR, lang);
    fs.mkdirSync(dir, { recursive: true });

    await renderHtmlCard(page, buildStep1Html(cfg), path.join(dir, 'step1.png'));
    await renderHtmlCard(page, buildStep2Through4And6Html(cfg, 2), path.join(dir, 'step2.png'));
    await renderHtmlCard(page, buildStep2Through4And6Html(cfg, 3), path.join(dir, 'step3.png'));
    await renderHtmlCard(page, buildStep2Through4And6Html(cfg, 4), path.join(dir, 'step4.png'));
    await renderHtmlCard(page, buildStep5Html(cfg), path.join(dir, 'step5.png'));
    await renderHtmlCard(page, buildStep2Through4And6Html(cfg, 6), path.join(dir, 'step6.png'));
    await renderStep7LiveUi(page, lang, cfg, path.join(dir, 'step7.png'));

    console.log(`✅ Generated 7 screenshots for [${lang.toUpperCase()}] in ${dir}`);
  }

  await browser.close();
})();