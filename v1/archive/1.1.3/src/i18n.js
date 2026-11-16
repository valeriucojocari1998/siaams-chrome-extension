/**
 * SIA AMS Chrome Wrapper & Crash-Guard — v1.1.0
 * i18n.js — Extension UI translations (RO / RU / EN), injected in MAIN world before the UI.
 *
 * API: window.__SIAAMS_I18N__ = { t, getLang, setLang, apply, onChange, locale, LANGS }
 *  - t(key, params)         -> translated string ({param} interpolation, falls back RO -> key)
 *  - apply(root)            -> re-translates [data-i18n], [data-i18n-html], [data-i18n-title], [data-i18n-placeholder]
 *  - setLang('ro'|'ru'|'en')-> persists to localStorage.siaams_lang, re-applies DOM, fires listeners (no reload)
 *
 * NOTE: Only the extension's own UI is translated. SIA AMS server-rendered pages stay Romanian.
 */
(function () {
  'use strict';
  if (window.__SIAAMS_I18N__) return;

  const LANGS = [ 'ro', 'ru', 'en' ];
  const STORAGE_KEY = 'siaams_lang';
  const LOCALES = { ro: 'ro-RO', ru: 'ru-RU', en: 'en-GB' };

  const D = {
    // ---------------------------------------------------------------- common
    'common.close': [ 'Închide', 'Закрыть', 'Close' ],
    'common.cancel': [ 'Anulează', 'Отмена', 'Cancel' ],
    'common.confirm': [ 'Confirmă', 'Подтвердить', 'Confirm' ],
    'common.undo': [ '↶ Anulează acțiunea', '↶ Отменить', '↶ Undo' ],
    'common.empty': [ '(Câmp gol)', '(Пустое поле)', '(Empty field)' ],
    'lang.title': [ 'Limba interfeței extensiei', 'Язык интерфейса расширения', 'Extension interface language' ],

    // ---------------------------------------------------------------- top bar
    'topbar.menu': [ '☰ Meniu SIA AMS', '☰ Меню SIA AMS', '☰ SIA AMS Menu' ],
    'topbar.menuTitle': [ 'Comută meniul lateral (Ascunde/Arată)', 'Показать/скрыть боковое меню', 'Toggle the side menu (show/hide)' ],
    'topbar.allDrafts': [ '🗄️ Toate ciornele', '🗄️ Все черновики', '🗄️ All drafts' ],
    'topbar.allDraftsTitle': [ 'Gestionează ciornele salvate local pentru toți pacienții', 'Управление локальными черновиками всех пациентов', 'Manage locally saved drafts for all patients' ],
    'session.title': [
      'Ping automat la fiecare 3 minute pentru a preveni expirarea sesiunii (20 min). Click pentru reînnoire.',
      'Автоматический пинг каждые 3 минуты, чтобы сессия (20 мин) не истекла. Нажмите, чтобы обновить.',
      'Automatic ping every 3 minutes keeps the 20-minute session alive. Click to renew now.'
    ],
    'session.active': [ '🟢 Sesiune Activă', '🟢 Сессия активна', '🟢 Session active' ],
    'session.checkedNow': [ '(verificat acum)', '(проверено сейчас)', '(checked now)' ],
    'session.activeAt': [ '(activ {time})', '(активна {time})', '(active {time})' ],
    'session.renewedAt': [ '(reînnoit {time})', '(обновлено {time})', '(renewed {time})' ],
    'session.expired': [ '🔴 Sesiune Expirată!', '🔴 Сессия истекла!', '🔴 Session expired!' ],
    'session.expiredHint': [
      '(Ciorna este salvată local — autentificați-vă în altă filă înainte de salvare!)',
      '(Черновик сохранён локально — войдите в систему в другой вкладке перед сохранением!)',
      '(Your draft is saved locally — log in again in another tab before saving!)'
    ],
    'session.warn': [ '🟠 Conexiune instabilă', '🟠 Нестабильное соединение', '🟠 Connection unstable' ],
    'autosave.title': [ 'Salvare automată a ciornei la fiecare 2 secunde', 'Автосохранение черновика каждые 2 секунды', 'Automatic draft saving every 2 seconds' ],
    'autosave.label': [ '💾 Ciornă:', '💾 Черновик:', '💾 Draft:' ],
    'autosave.active': [ 'Activă', 'Активен', 'Active' ],
    'autosave.savedAt': [ 'Salvată {time}', 'Сохранён {time}', 'Saved {time}' ],
    'autosave.serverCleared': [ 'Salvat (ciornă curățată)', 'Сохранено (черновик очищен)', 'Saved (draft cleared)' ],
    'history.btn': [ '🕒 Ciorne', '🕒 Черновики', '🕒 Drafts' ],
    'history.btnTitle': [ 'Vezi ciornele salvate pentru această fișă', 'Сохранённые черновики этой карты', 'See saved drafts for this record' ],
    'unsaved.text': [
      '⚠️ <strong>Ciornă nesalvată</strong>',
      '⚠️ <strong>Несохранённый черновик</strong>',
      '⚠️ <strong>Unsaved draft</strong>'
    ],
    'unsaved.saveNow': [ '💾 Salvează', '💾 Сохранить', '💾 Save' ],
    'unsaved.beforeUnload': [
      'Aveți modificări nesalvate pe server în SIA AMS! (Ciorna locală este salvată).',
      'В SIA AMS есть несохранённые на сервере изменения! (Локальный черновик сохранён).',
      'You have changes not saved on the SIA AMS server! (The local draft is kept).'
    ],

    // ---------------------------------------------------------------- sidebar
    'sidebar.search': [ '🔍 Caută în meniu (ex: Internari, Extras, F16)...', '🔍 Поиск в меню (напр.: Internari, Extras, F16)...', '🔍 Search the menu (e.g. Internari, Extras, F16)...' ],
    'sidebar.home': [ '🏠 Principală', '🏠 Главная', '🏠 Home' ],
    'sidebar.homeTitle': [ 'Pagina principală', 'Главная страница', 'Main page' ],
    'sidebar.section': [ '🏥 Secție', '🏥 Отделение', '🏥 Ward' ],
    'sidebar.sectionTitle': [ 'Pagina secției (pacienți internați)', 'Страница отделения (госпитализированные пациенты)', 'Ward page (admitted patients)' ],
    'sidebar.admissions': [ '🔎 Internări', '🔎 Госпитализации', '🔎 Admissions' ],
    'sidebar.admissionsTitle': [ 'Caută internări', 'Поиск госпитализаций', 'Search admissions' ],
    'sidebar.loading': [ 'Se încarcă meniul SIA AMS...', 'Загрузка меню SIA AMS...', 'Loading the SIA AMS menu...' ],
    'sidebar.error': [ 'Nu s-a putut încărca meniul ({msg}).', 'Не удалось загрузить меню ({msg}).', 'Could not load the menu ({msg}).' ],
    'sidebar.newTab': [ 'Se deschide în filă nouă', 'Откроется в новой вкладке', 'Opens in a new tab' ],
    'cat.CONTEXT': [ 'Contextul pacientului curent', 'Контекст текущего пациента', 'Current patient context' ],
    'cat.IMPRIMARE': [ 'Imprimare', 'Печать', 'Printing' ],
    'cat.SECTII': [ 'Secții', 'Отделения', 'Wards' ],
    'cat.PROCEDURI': [ 'Proceduri', 'Процедуры', 'Procedures' ],
    'cat.STATISTICA': [ 'Statistică', 'Статистика', 'Statistics' ],
    'cat.RAPOARTE': [ 'Rapoarte', 'Отчёты', 'Reports' ],
    'cat.ANUNTURI': [ 'Anunțuri', 'Объявления', 'Announcements' ],
    'cat.GENERAL': [ 'General', 'Общее', 'General' ],
    'cat.UTILIZATOR': [ 'Utilizator', 'Пользователь', 'User' ],
    'ctx.title': [ '⚡ Acțiuni rapide pacient (CIID: {id})', '⚡ Быстрые действия (CIID: {id})', '⚡ Patient quick actions (CIID: {id})' ],
    'ctx.patient': [ '👤 Fișa Pacient', '👤 Карта пациента', '👤 Patient record' ],
    'ctx.presentation': [ '📋 Prezentare', '📋 Направление', '📋 Presentation' ],
    'ctx.checkin': [ '🛏️ Fișa Internare', '🛏️ Госпитализация', '🛏️ Admission record' ],
    'ctx.checkout': [ '🏁 Fișa Externare', '🏁 Выписка', '🏁 Discharge record' ],
    'ctx.extras': [ '🖨️ Extras (027/e)', '🖨️ Выписка (027/e)', '🖨️ Discharge summary (027/e)' ],
    'ctx.cost': [ '💰 Decont Cost', '💰 Расчёт стоимости', '💰 Cost statement' ],
    'ctx.full': [ '📑 Fișa Completă', '📑 Полная карта', '📑 Full record' ],

    // ---------------------------------------------------------------- CKEditor footer
    'cke.cancel': [ '❌ Anulează', '❌ Отмена', '❌ Cancel' ],
    'cke.cancelTitle': [ 'Închide fereastra fără a aplica modificările', 'Закрыть окно без применения изменений', 'Close the window without applying changes' ],
    'cke.closeOnly': [ '📋 Închide (Ciornă)', '📋 Закрыть (Черновик)', '📋 Close (Draft)' ],
    'cke.closeOnlyTitle': [ 'Păstrează textul în pagină și în ciornă, fără a salva încă', 'Оставить текст на странице и в черновике без отправки', 'Keep text in page and draft without saving yet' ],
    'cke.saveServer': [ '💾 Salvează', '💾 Сохранить', '💾 Save' ],
    'cke.saveServerTitle': [ 'Aplică textul și salvează în SIA AMS (ALT+S)', 'Применить текст и сохранить в SIA AMS (ALT+S)', 'Apply text and save in SIA AMS (ALT+S)' ],

    // ---------------------------------------------------------------- checkout cards
    'checkout.epicrisis': [ 'Epicriza (Sinteză clinică, paraclinică și tratament)', 'Эпикриз (клинические и параклинические данные, лечение)', 'Epicrisis (clinical & paraclinical summary, treatment)' ],
    'checkout.extras': [ 'Extras (Formular 027/e — Recomandări la externare)', 'Выписка (форма 027/e — рекомендации при выписке)', 'Discharge summary (Form 027/e — recommendations)' ],
    'checkout.badge': [ 'Vizualizare formatată activă', 'Форматированный просмотр', 'Formatted view active' ],
    'checkout.openCke': [ '✨ Deschide în Editor (CKEditor)', '✨ Открыть в редакторе (CKEditor)', '✨ Open in editor (CKEditor)' ],
    'checkout.inlineEdit': [ '✏️ Editează direct în pagină', '✏️ Редактировать на странице', '✏️ Edit directly in page' ],
    'checkout.inlineDone': [ '✅ Finalizează editarea', '✅ Завершить редактирование', '✅ Finish editing' ],
    'checkout.raw': [ '&lt;/&gt; Cod HTML brut', '&lt;/&gt; Исходный HTML', '&lt;/&gt; Raw HTML' ],

    // ---------------------------------------------------------------- crash recovery banner
    'banner.title': [
      'Ciornă nesalvată pe server detectată! (Salvată automat la <strong>{time}</strong>)',
      'Обнаружен черновик, не сохранённый на сервере! (Автосохранение: <strong>{time}</strong>)',
      'Unsaved draft detected! (Auto-saved at <strong>{time}</strong>)'
    ],
    'banner.subtitle': [
      'Câmpuri modificate: <strong>{fields}</strong>. Puteți restaura textul cu un singur click.',
      'Изменённые поля: <strong>{fields}</strong>. Текст можно восстановить одним щелчком.',
      'Changed fields: <strong>{fields}</strong>. You can restore the text with one click.'
    ],
    'banner.restore': [ '✅ Restaurează ultima ciornă', '✅ Восстановить последний черновик', '✅ Restore latest draft' ],
    'banner.view': [ '👁️ Deschide textul', '👁️ Открыть текст', '👁️ Open text' ],
    'banner.history': [ '🕒 Vezi istoric', '🕒 История', '🕒 View history' ],
    'banner.dismiss': [ '🗑️ Ignoră', '🗑️ Игнорировать', '🗑️ Dismiss' ],
    'banner.restored': [
      '✅ <strong>Ciorna din {time} a fost restaurată în pagină!</strong> Apăsați <strong>💾 Salvează pe Server Acum (ALT+S)</strong> pentru a o salva definitiv.',
      '✅ <strong>Черновик от {time} восстановлен на странице!</strong> Нажмите <strong>💾 Сохранить на сервере (ALT+S)</strong>, чтобы сохранить окончательно.',
      '✅ <strong>The draft from {time} was restored into the page!</strong> Press <strong>💾 Save to server now (ALT+S)</strong> to save it permanently.'
    ],

    // ---------------------------------------------------------------- misc page fixes
    'ah1.title': [
      '👤 <strong>Date pacient, IDNP, statut asigurare CNAM și fișa de prezentare</strong> (afișat automat)',
      '👤 <strong>Данные пациента, IDNP, страховой статус CNAM и направление</strong> (показано автоматически)',
      '👤 <strong>Patient data, IDNP, CNAM insurance status & referral</strong> (shown automatically)'
    ],
    'ah1.toggle': [ 'Ascunde / Arată ▾', 'Скрыть / Показать ▾', 'Hide / Show ▾' ],
    'date.pickerTitle': [ 'Deschide calendarul (zz/ll/aaaa)', 'Открыть календарь (дд/мм/гггг)', 'Open the calendar (dd/mm/yyyy)' ],
    'perm.ok': [
      '✔️ Pagină încărcată și activă în Google Chrome (SIA AMS Chrome Wrapper)',
      '✔️ Страница загружена и работает в Google Chrome (SIA AMS Chrome Wrapper)',
      '✔️ Page loaded and active in Google Chrome (SIA AMS Chrome Wrapper)'
    ],

    // ---------------------------------------------------------------- field names
    'field.sExamCI': [ 'Examinarea primară în secție', 'Первичный осмотр в отделении', 'Initial ward examination' ],
    'field.sEpicrisys': [ 'Epicriza', 'Эпикриз', 'Epicrisis' ],
    'field.sRecommendations': [ 'Extras / Recomandări', 'Выписка / Рекомендации', 'Discharge summary / Recommendations' ],
    'field.sDayDiagnosis': [ 'Evoluția zilnică', 'Дневник наблюдения', 'Daily progress note' ],
    'field.sCOTextDiagnosis': [ 'Diagnostic externare (text liber)', 'Диагноз при выписке (свободный текст)', 'Discharge diagnosis (free text)' ],

    // ---------------------------------------------------------------- draft vault
    'vault.historyTitle': [ '🕒 Istoric ciorne auto-save — {title}', '🕒 История автосохранений — {title}', '🕒 Auto-save draft history — {title}' ],
    'vault.empty': [ 'Nu există versiuni salvate local pentru această fișă.', 'Для этой карты нет локально сохранённых версий.', 'There are no locally saved versions for this record.' ],
    'vault.fields': [ 'Câmpuri: {fields}', 'Поля: {fields}', 'Fields: {fields}' ],
    'vault.synced': [ '✔️ Salvat', '✔️ Сохранено', '✔️ Saved' ],
    'vault.localOnly': [ '📝 Ciornă', '📝 Черновик', '📝 Draft' ],
    'vault.goAndRestore': [ '🔗 Deschide și Restaurează', '🔗 Открыть и восстановить', '🔗 Go & Restore' ],
    'vault.branchSaves': [ '🌿 {n} actualizări', '🌿 {n} сохр.', '🌿 {n} updates' ],
    'vault.branchSingle': [ '🌿 1 salvare', '🌿 1 сохр.', '🌿 1 save' ],
    'vault.forked': [ 'Ramură nouă', 'Ответвление', 'Forked' ],
    'vault.open': [ '👁️ Deschide textul', '👁️ Открыть текст', '👁️ Open text' ],
    'vault.restore': [ '🔄 Restaurează', '🔄 Восстановить', '🔄 Restore' ],
    'vault.restoreDisabled': [ 'Restaurarea este posibilă doar pe pagina acestei fișe', 'Восстановление возможно только на странице этой карты', 'Restore is only available on this record\'s page' ],
    'vault.delete': [ '🗑️ Șterge', '🗑️ Удалить', '🗑️ Delete' ],
    'vault.selectAll': [ 'Selectează tot', 'Выбрать все', 'Select all' ],
    'vault.deleteSelected': [ '🗑️ Șterge selectate ({n})', '🗑️ Удалить выбранные ({n})', '🗑️ Delete selected ({n})' ],
    'vault.deleteSynced': [ 'Șterge cele trimise la server', 'Удалить отправленные на сервер', 'Delete those sent to server' ],
    'vault.deleteAll': [ 'Șterge tot istoricul fișei', 'Удалить всю историю карты', 'Delete this record\'s entire history' ],
    'vault.confirmDelete': [ 'Ștergeți {n} versiune(i) de ciornă?', 'Удалить версии черновика ({n})?', 'Delete {n} draft version(s)?' ],
    'vault.confirmDeleteAll': [ 'Ștergeți TOT istoricul de ciorne pentru „{title}”?', 'Удалить ВСЮ историю черновиков для «{title}»?', 'Delete the ENTIRE draft history for "{title}"?' ],
    'vault.deleted': [ '{n} versiune(i) ștearsă(e).', 'Удалено версий: {n}.', '{n} version(s) deleted.' ],
    'vault.nothing': [ 'Nimic de șters.', 'Нечего удалять.', 'Nothing to delete.' ],
    'vault.managerTitle': [ '🗄️ Toate ciornele salvate local', '🗄️ Все локальные черновики', '🗄️ All locally saved drafts' ],
    'vault.managerEmpty': [ 'Nu există ciorne salvate în acest browser.', 'В этом браузере нет сохранённых черновиков.', 'No drafts are saved in this browser.' ],
    'vault.storage': [ 'Spațiu folosit: {used} din ~5 MB ({pct}%)', 'Использовано: {used} из ~5 МБ ({pct}%)', 'Storage used: {used} of ~5 MB ({pct}%)' ],
    'vault.colRecord': [ 'Pacient / ce se edita', 'Пациент / действие', 'Patient / what was being done' ],
    'vault.colVersions': [ 'Versiuni', 'Версии', 'Versions' ],
    'vault.colLast': [ 'Ultima salvare', 'Последнее сохранение', 'Last saved' ],
    'vault.colSize': [ 'Mărime', 'Размер', 'Size' ],
    'vault.colUnsynced': [ 'Doar local', 'Только локально', 'Local only' ],
    'vault.colActions': [ 'Acțiuni', 'Действия', 'Actions' ],
    'vault.openHistory': [ '🕒 Istoric', '🕒 История', '🕒 History' ],
    'vault.deleteRecord': [ '🗑️ Șterge', '🗑️ Удалить', '🗑️ Delete' ],
    'vault.olderThan': [ 'Șterge mai vechi de:', 'Удалить старше:', 'Delete older than:' ],
    'vault.days': [ '{n} zile', '{n} дн.', '{n} days' ],
    'vault.deleteAllSynced': [ 'Șterge toate cele trimise la server', 'Удалить все отправленные на сервер', 'Delete all sent to server' ],
    'vault.confirmOlder': [ 'Ștergeți toate versiunile mai vechi de {n} zile?', 'Удалить все версии старше {n} дн.?', 'Delete all versions older than {n} days?' ],
    'vault.confirmSyncedAll': [ 'Ștergeți toate versiunile deja trimise la server (pentru toți pacienții)?', 'Удалить все версии, уже отправленные на сервер (для всех пациентов)?', 'Delete all versions already sent to the server (for all patients)?' ],
    'vault.confirmRecord': [ 'Ștergeți toate ciornele pentru „{title}”?', 'Удалить все черновики для «{title}»?', 'Delete all drafts for "{title}"?' ],
    'vault.currentPage': [ 'pagina curentă', 'текущая страница', 'current page' ],
    'vault.back': [ '← Înapoi la toate ciornele', '← Назад ко всем черновикам', '← Back to all drafts' ],
    'vault.pageType.checkin': [ 'Internare', 'Госпитализация', 'Admission' ],
    'vault.pageType.checkout': [ 'Externare', 'Выписка', 'Discharge' ],
    'vault.pageType.presentation': [ 'Prezentare', 'Направление', 'Presentation' ],
    'vault.pageType.pacient': [ 'Pacient', 'Пациент', 'Patient' ],
    'vault.pageType.page': [ 'Pagină', 'Страница', 'Page' ],

    // ---------------------------------------------------------------- draft viewer
    'viewer.title': [ '👁️ Textul salvat — {time}', '👁️ Сохранённый текст — {time}', '👁️ Saved text — {time}' ],
    'viewer.hint': [
      'Puteți ajusta textul aici înainte de copiere. Modificările din această fereastră NU se trimit la server.',
      'Текст можно поправить здесь перед копированием. Изменения в этом окне НЕ отправляются на сервер.',
      'You can tidy the text here before copying. Changes in this window are NOT sent to the server.'
    ],
    'viewer.copyRich': [ '📋 Copiază formatat', '📋 Копировать с форматированием', '📋 Copy formatted' ],
    'viewer.copyPlain': [ '📄 Copiază ca text simplu', '📄 Копировать как текст', '📄 Copy as plain text' ],
    'viewer.copied': [ '✅ Copiat! Lipiți cu Ctrl+V.', '✅ Скопировано! Вставьте через Ctrl+V.', '✅ Copied! Paste with Ctrl+V.' ],
    'viewer.copyFailed': [ 'Copierea a eșuat — selectați textul și apăsați Ctrl+C.', 'Не удалось скопировать — выделите текст и нажмите Ctrl+C.', 'Copy failed — select the text and press Ctrl+C.' ],
    'viewer.insert': [ '↩️ Inserează în câmpul formularului', '↩️ Вставить в поле формы', '↩️ Insert into form field' ],
    'viewer.confirmInsert': [
      'Înlocuiți conținutul câmpului „{field}” din formular cu acest text? (Va trebui apoi salvat pe server.)',
      'Заменить содержимое поля «{field}» этим текстом? (Затем нужно сохранить на сервере.)',
      'Replace the content of the "{field}" form field with this text? (You will then need to save to the server.)'
    ],
    'viewer.inserted': [ '✅ Text inserat. Nu uitați să salvați pe server (ALT+S).', '✅ Текст вставлен. Не забудьте сохранить на сервере (ALT+S).', '✅ Text inserted. Remember to save to the server (ALT+S).' ],

    // ---------------------------------------------------------------- rich editor
    'editor.undo': [ 'Anulează (Ctrl+Z)', 'Отменить (Ctrl+Z)', 'Undo (Ctrl+Z)' ],
    'editor.redo': [ 'Refă (Ctrl+Y)', 'Повторить (Ctrl+Y)', 'Redo (Ctrl+Y)' ],
    'editor.blockStyle': [ 'Stil paragraf', 'Стиль абзаца', 'Paragraph style' ],
    'editor.fontFamily': [ 'Font text', 'Шрифт', 'Font family' ],
    'editor.fontDefault': [ 'Implicit', 'По умолчанию', 'Default' ],
    'editor.fontSize': [ 'Mărime font', 'Размер шрифта', 'Font size' ],
    'editor.text': [ 'Text normal', 'Обычный текст', 'Normal text' ],
    'editor.h1': [ 'Titlu 1', 'Заголовок 1', 'Heading 1' ],
    'editor.h2': [ 'Titlu 2', 'Заголовок 2', 'Heading 2' ],
    'editor.h3': [ 'Titlu 3', 'Заголовок 3', 'Heading 3' ],
    'editor.quote': [ 'Citat', 'Цитата', 'Quote' ],
    'editor.bold': [ 'Aldin (Ctrl+B)', 'Полужирный (Ctrl+B)', 'Bold (Ctrl+B)' ],
    'editor.italic': [ 'Cursiv (Ctrl+I)', 'Курсив (Ctrl+I)', 'Italic (Ctrl+I)' ],
    'editor.underline': [ 'Subliniat (Ctrl+U)', 'Подчёркнутый (Ctrl+U)', 'Underline (Ctrl+U)' ],
    'editor.strike': [ 'Tăiat', 'Зачёркнутый', 'Strikethrough' ],
    'editor.sup': [ 'Exponent (ex: m²)', 'Надстрочный (напр. м²)', 'Superscript (e.g. m²)' ],
    'editor.sub': [ 'Indice', 'Подстрочный', 'Subscript' ],
    'editor.color': [ 'Culoare text', 'Цвет текста', 'Text color' ],
    'editor.highlight': [ 'Evidențiere', 'Выделение цветом', 'Highlight' ],
    'editor.noColor': [ 'Fără culoare', 'Без цвета', 'No color' ],
    'editor.bullet': [ 'Listă cu puncte', 'Маркированный список', 'Bulleted list' ],
    'editor.numbered': [ 'Listă numerotată', 'Нумерованный список', 'Numbered list' ],
    'editor.indent': [ 'Mărește indentarea', 'Увеличить отступ', 'Increase indent' ],
    'editor.outdent': [ 'Micșorează indentarea', 'Уменьшить отступ', 'Decrease indent' ],
    'editor.alignLeft': [ 'Aliniere stânga', 'По левому краю', 'Align left' ],
    'editor.alignCenter': [ 'Centrat', 'По центру', 'Center' ],
    'editor.alignRight': [ 'Aliniere dreapta', 'По правому краю', 'Align right' ],
    'editor.justify': [ 'Aliniere stânga-dreapta', 'По ширине', 'Justify' ],
    'editor.table': [ 'Inserează tabel', 'Вставить таблицу', 'Insert table' ],
    'editor.tableSize': [ 'Tabel {r} × {c}', 'Таблица {r} × {c}', 'Table {r} × {c}' ],
    'editor.tableOps': [ 'Operații tabel', 'Операции с таблицей', 'Table operations' ],
    'editor.rowAbove': [ 'Inserează rând deasupra', 'Вставить строку выше', 'Insert row above' ],
    'editor.rowBelow': [ 'Inserează rând dedesubt', 'Вставить строку ниже', 'Insert row below' ],
    'editor.colLeft': [ 'Inserează coloană la stânga', 'Вставить столбец слева', 'Insert column left' ],
    'editor.colRight': [ 'Inserează coloană la dreapta', 'Вставить столбец справа', 'Insert column right' ],
    'editor.delRow': [ 'Șterge rândul', 'Удалить строку', 'Delete row' ],
    'editor.delCol': [ 'Șterge coloana', 'Удалить столбец', 'Delete column' ],
    'editor.delTable': [ 'Șterge tabelul', 'Удалить таблицу', 'Delete table' ],
    'editor.hr': [ 'Linie separatoare', 'Разделительная линия', 'Divider line' ],
    'editor.date': [ 'Data de azi', 'Сегодняшняя дата', 'Today\'s date' ],
    'editor.glycemic': [ 'Rând tabel glicemic (azi)', 'Строка гликемического профиля (сегодня)', 'Glycemic table row (today)' ],
    'editor.clear': [ 'Șterge formatarea', 'Очистить форматирование', 'Clear formatting' ],
    'editor.plainPaste': [ 'Lipire ca text simplu (fără formatare)', 'Вставка как простой текст (без форматирования)', 'Paste as plain text (no formatting)' ],
    'editor.classic': [ '⇄ Bara clasică', '⇄ Классическая панель', '⇄ Classic toolbar' ],
    'editor.modern': [ '⇄ Bara nouă', '⇄ Новая панель', '⇄ New toolbar' ],
    'editor.classicTitle': [ 'Comută între bara nouă și bara originală CKEditor', 'Переключение между новой и оригинальной панелью CKEditor', 'Switch between the new and the original CKEditor toolbar' ],
    'editor.hint': [
      'Sfat: tastați „/” pentru comenzi · „# ” titlu · „- ” listă · „1. ” numerotare',
      'Совет: «/» — команды · «# » — заголовок · «- » — список · «1. » — нумерация',
      'Tip: type "/" for commands · "# " heading · "- " list · "1. " numbering'
    ],
    'editor.slashEmpty': [ 'Nicio comandă găsită', 'Команды не найдены', 'No commands found' ],
    'editor.groupBasic': [ 'Blocuri', 'Блоки', 'Blocks' ],
    'editor.groupInsert': [ 'Inserare', 'Вставка', 'Insert' ],
    'editor.groupClinical': [ 'Secțiuni clinice (RO)', 'Клинические разделы (RO)', 'Clinical sections (RO)' ],
    'editor.paragraph': [ 'Paragraf', 'Абзац', 'Paragraph' ],
    'editor.table3': [ 'Tabel 3 × 3', 'Таблица 3 × 3', 'Table 3 × 3' ],
    'editor.glycemicTable': [ 'Tabel profil glicemic', 'Таблица гликемического профиля', 'Glycemic profile table' ],
    'editor.placeholder': [ 'Scrieți aici sau tastați „/” pentru comenzi…', 'Пишите здесь или введите «/» для команд…', 'Write here or type "/" for commands…' ],

    // ---------------------------------------------------------------- git-style merge restore
    'merge.title': [ '🔀 Comparare și Restaurare Ciornă — {field}', '🔀 Сравнение и восстановление черновика — {field}', '🔀 Compare & Restore Draft — {field}' ],
    'merge.subtitle': [ 'Verde = adăugat în ciornă · Roșu = șters față de textul curent · Conflictele pot fi alese manual.', 'Зелёный = добавлено в черновике · Красный = удалено из текущего · Конфликты выбираются вручную.', 'Green = added in draft · Red = removed from current · Pick your choice for any conflicts.' ],
    'merge.useAllDraft': [ 'Folosește toată ciorna', 'Взять весь черновик', 'Use all draft' ],
    'merge.keepAllCurrent': [ 'Păstrează textul curent', 'Оставить текущий текст', 'Keep all current' ],
    'merge.accept': [ '✅ Acceptă și Aplică', '✅ Принять и применить', '✅ Accept & Apply' ],
    'merge.cancel': [ 'Anulează', 'Отмена', 'Cancel' ],
    'merge.added': [ '+ Adăugat în ciornă', '+ Добавлено в черновике', '+ Added in draft' ],
    'merge.removed': [ '− Șters din textul curent', '− Удалено из текущего', '− Removed from current' ],
    'merge.conflict': [ '⚡ Conflict — alegeți versiunea:', '⚡ Конфликт — выберите вариант:', '⚡ Conflict — choose version:' ],
    'merge.currentLabel': [ 'Text curent', 'Текущий текст', 'Current' ],
    'merge.draftLabel': [ 'Ciornă', 'Черновик', 'Draft' ],
    'merge.keepCurrent': [ 'Păstrează curent', 'Оставить текущий', 'Keep Current' ],
    'merge.useDraft': [ 'Folosește ciorna', 'Взять черновик', 'Use Draft' ],
    'merge.keepBoth': [ 'Păstrează ambele', 'Оставить оба', 'Keep Both' ],
    'merge.include': [ 'Include', 'Включить', 'Include' ],
    'merge.skip': [ 'Ignoră', 'Пропустить', 'Skip' ],
    'merge.keep': [ 'Păstrează', 'Оставить', 'Keep' ],
    'merge.remove': [ 'Șterge', 'Удалить', 'Remove' ],
    'merge.noDiff': [ 'Nu există diferențe — textul ciornei este identic cu cel curent.', 'Отличий нет — текст черновика совпадает с текущим.', 'No differences — draft matches current text.' ]
  };

  const IDX = { ro: 0, ru: 1, en: 2 };
  const listeners = new Set();

  function detectDefaultLang() {
    const nav = String(navigator.language || navigator.userLanguage || 'ro').toLowerCase();
    if (nav.startsWith('ro') || nav.startsWith('mo')) return 'ro';
    if (nav.startsWith('ru') || nav.startsWith('uk') || nav.startsWith('be')) return 'ru';
    return 'en';
  }

  let current = (function () {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (LANGS.includes(saved)) return saved;
    } catch (_e) {}
    return detectDefaultLang();
  })();

  function t(key, params) {
    const entry = D[key];
    let str = entry ? (entry[IDX[current]] ?? entry[0]) : key;
    if (params) {
      str = str.replace(/\{(\w+)\}/g, (m, p) => (params[p] !== undefined ? String(params[p]) : m));
    }
    return str;
  }

  function readParams(el) {
    const raw = el.getAttribute('data-i18n-params');
    if (!raw) return undefined;
    try { return JSON.parse(raw); } catch (_e) { return undefined; }
  }

  function apply(root) {
    const scope = root || document;
    const q = (sel) => (scope.querySelectorAll ? Array.from(scope.querySelectorAll(sel)) : []);
    const self = scope.nodeType === 1 ? [ scope ] : [];
    const pick = (sel) => self.filter((el) => el.matches(sel)).concat(q(sel));

    pick('[data-i18n]').forEach((el) => { el.textContent = t(el.getAttribute('data-i18n'), readParams(el)); });
    pick('[data-i18n-html]').forEach((el) => { el.innerHTML = t(el.getAttribute('data-i18n-html'), readParams(el)); });
    pick('[data-i18n-title]').forEach((el) => { el.title = t(el.getAttribute('data-i18n-title'), readParams(el)); });
    pick('[data-i18n-placeholder]').forEach((el) => { el.placeholder = t(el.getAttribute('data-i18n-placeholder'), readParams(el)); });
  }

  function setLang(lang) {
    if (!LANGS.includes(lang) || lang === current) return;
    current = lang;
    try { localStorage.setItem(STORAGE_KEY, lang); } catch (_e) {}
    apply(document);
    listeners.forEach((fn) => { try { fn(lang); } catch (e) { console.warn('[SIAAMS i18n] listener error', e); } });
  }

  window.__SIAAMS_I18N__ = {
    LANGS,
    t,
    apply,
    setLang,
    getLang: () => current,
    locale: () => LOCALES[current] || 'ro-RO',
    onChange: (fn) => { listeners.add(fn); return () => listeners.delete(fn); },
    has: (key) => Object.prototype.hasOwnProperty.call(D, key),
    _dict: D
  };
})();
