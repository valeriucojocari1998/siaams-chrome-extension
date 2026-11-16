# SIA AMS Chrome Wrapper & Crash-Guard (`v1.1.4`)

Modern **Google Chrome** & **Microsoft Edge** compatibility extension for **SIA AMS (Hipocrate H3)** — fixing legacy IE6/HTC issues while adding a multi-language UI, Word + Notion style editor, session keep-alive, and crash-proof local drafts with 2-doctor conflict combining.

## Quick Install (Unpacked Extension)
1. Clone this repository or click **Code → Download ZIP** and extract it.
2. Open `chrome://extensions` in Google Chrome (or `edge://extensions` in Microsoft Edge).
3. Enable **Developer mode** (top-right).
4. Click **Load unpacked** (top-left) and select the **`v1/`** folder containing `manifest.json`.

## Features (`v1.1.4`)
- **Multi-Language Extension UI (`RO | RU | EN`)**: Instant live switcher in the top bar without reloading the page or losing unsaved edits.
- **Word + Notion Style Rich Editor** (inside both CKEditor popups and In-Page Editors):
  - Full formatting toolbar with **Font Family**, **Font Size (`10px–28px`)**, Headings, Bold/Italic/Underline/Strikethrough/Sup/Sub, Colors & Highlights, Lists, Alignment, 8×8 Table Picker + row/column tools, Today's Date, and **➕ Glycemic Table Row**.
  - Notion-style **floating selection bubble**, **`/` slash command menu** (with clinical section headers), and live **Markdown shortcuts** (`# `, `## `, `- `, `1. `, `> `, `--- `, `**bold**`).
- **Simple, Crash-Proof Local Drafts (1 Entry per Editor Field)**:
  - Closing the editor (`✕ Close`) always preserves your local draft automatically.
  - Drafts auto-load across page refreshes and tab switches, showing a friendly `"Local draft"` bar inside the editor with **`↶ Back`** / **`↷ Forward`** (all the way back to the original server text) and **`↺ Reset to server`**.
  - **2-Doctor Conflict Detection (`🔀 Combine changes`)**: Only triggers if another user updated the server text underneath you (checked on load, tab return, and right before **`💾 Save`**), letting you visually combine both edits.
- **IE6/Chrome Compatibility & Session Keep-Alive**:
  - Polyfills `submitForm()`, `dirty()`, `removeNode()`, `.all()`, `attachEvent`, native date picker (`dd/mm/yyyy`), auto-expands patient details (`#ah1`), provides a searchable docked left sidebar, and pings every 3 minutes to prevent 20-minute session timeouts.

## Repository Structure

```text
├── LICENSE                                      # MIT License
├── README.md
└── v1/                                          # Production Extension (v1.1.4)
    ├── manifest.json                            # Manifest V3 (load unpacked from v1/)
    ├── build.mjs                                # Rebuilds INSTALL.bat, INSTALL.html, .zip & .user.js
    ├── _locales/{ro,ru,en}/messages.json        # Extension metadata localization
    ├── src/
    │   ├── main-world-polyfills.js              # IE6/HTC polyfills
    │   ├── i18n.js                              # Live RO/RU/EN dictionary & switcher
    │   ├── rich-editor.js                       # Shared Word + Notion rich editor
    │   ├── diff-merge-ui.js                     # 2-doctor "Combine changes" visual modal
    │   ├── draft-vault-ui.js                    # Simplified 1-line-per-field Drafts modal
    │   ├── ui-and-crash-guard.js                # Sidebar, Keep-Alive, Per-Field Drafts & 1-Step Save
    │   └── modern-chrome.css                    # Responsive layout, Rich Editor & Draft Bar styles
    └── tools/
        └── capture-guide-screenshots.mjs        # Playwright generator for 21 RO/RU/EN guide screenshots
```

## Build Installers & Userscript Locally
If you want to generate `INSTALL.bat`, `INSTALL.html`, `v1/dist/*.zip`, and `v1/dist/siaams-chrome-wrapper-v1.1.user.js`:
```bash
node v1/tools/capture-guide-screenshots.mjs   # generates 21 RO/RU/EN step screenshots (requires playwright-core)
node v1/build.mjs                             # builds INSTALL.bat, INSTALL.html, .zip & .user.js
```
