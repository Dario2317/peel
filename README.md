# Peel

Study on top of the pages of books you own: import screenshots or PDFs, then add
post-it notes, "tape" that hides parts of the page so you can test yourself,
drawings and text. Everything stays on your device: no accounts, no uploads, no
backend.

**Live app:** https://dario2317.github.io/peel/ (open it in Safari on the iPad,
then Share → Add to Home Screen).

## Run it on your computer

You need [Node.js](https://nodejs.org) 22 or newer.

```bash
npm install      # once, downloads the libraries
npm run dev      # starts the app at http://localhost:5173
npm test         # runs the automated tests
```

## Try it on the iPad over Wi-Fi

1. On the PC run `npm run host` (instead of `npm run dev`).
2. It prints a line like `Network: http://192.168.1.203:5173/`.
3. Open that address in Safari on the iPad (same Wi-Fi/network as the PC).
4. The first time, Windows asks whether Node.js may use the network: allow it on
   **private networks**.

Changes you save on the PC show up on the iPad right away. Note: this address is
plain `http`, so offline mode and the share sheet only work on the real
https link above. Data you create here is separate from the Home Screen app.

## Publishing

Every `git push` to `main` runs the tests, builds the app and publishes it to
GitHub Pages automatically (see `.github/workflows/deploy.yml`). Only the app's
code goes online, never your books or notes.

## How the code is organized

```
src/
  main.jsx, App.jsx    start-up and switching between Library and Notebook
  db/                  the on-device database (Dexie / IndexedDB)
  import/              file picker, drag & drop, paste, PDF reading (pdf.js)
  library/             the notebook grid, install hint, storage info
  viewer/              the page viewer: pan/zoom engine, touch & Pencil input,
                       page rendering, page strip, crop tool
  ui/                  dialogs, menus, toasts, icons
  styles/              CSS
  utils/               small helpers (ids, geometry)
scripts/               make-icons.js (app icon), make-test-pdf.js (test file)
test-fixtures/         a sample PDF for testing during development
```

Every position on a page is stored relative to the page (0–1 of its width and
height), so annotations never drift when you zoom, rotate or change screen.
