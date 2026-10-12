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

## Using Peel

- **Library**: notebooks and folders. **New folder** makes a folder where you
  are; open it to see what's inside, and use the path at the top to go back.
  Move things with ··· → **Move to…**, or drag a notebook onto a folder (on
  the iPad: touch and hold it, then drag). Deleting a folder asks whether to
  keep what's inside.
- **Move** (hand): open post-its and tapes by tapping them; drag them with the
  Pencil (or mouse) to move them, drag a tape's corners to resize it.
- **Pen / Marker / Eraser**: write and highlight directly on the page (8 colors,
  3 sizes, smoothing). Hold the Pencil still at the end of an oval, rectangle,
  line or arrow and it snaps into a clean shape. There's room around the
  pages, like a desk: scroll past a page's edge and write next to it.
- **Lasso**: circle ink, text, tapes and post-its, then drag them somewhere else or delete.
- **Text**: tap the page (or next to it) to type there. Above the toolbar:
  font (4 regular, 4 handwritten), size, bold, italic, color. Tap a text box
  to edit it; drag its round handle to move it, its right edge to change the
  width, × to delete it.
- **Zoom window** (top bar): a box on the page and a big writing area under
  the pages. Write big there and it lands small in the box; it moves on by
  itself near the edge, ↵ goes to the next line, − / + change the zoom. Drag
  the box's round handle to put it somewhere else.
- **Post-it**: tap the page to pin a note there (it stays the same small
  size at any zoom). Tap a note to open its board: dotted paper to draw on with
  the Pencil (pen, marker, eraser, 8 colors, 3 sizes), scroll and pinch-zoom
  with your fingers, or tap Type to use the keyboard (same fonts and
  options as text on the pages).
- **Tape**: drag over what you want to hide. Tap the tool again for color and pattern.
- **Peek**: see through all tapes while editing.
- **Undo / Redo**: buttons, two-finger tap (undo), three-finger tap (redo), Ctrl/Cmd+Z.
- **Study**: every tape goes back on. Tap the highlighted one to peel it, then
  answer Got it or Missed. Missed tapes come first next time.

Once an Apple Pencil has been used, fingers only scroll, zoom and tap, so a
resting palm never moves anything.

## How the code is organized

```
src/
  main.jsx, App.jsx    start-up and switching between Library and Notebook
  db/                  the on-device database (Dexie / IndexedDB)
  import/              file picker, drag & drop, paste, PDF reading (pdf.js)
  library/             the notebook grid, install hint, storage info
  viewer/              the page viewer: pan/zoom engine, touch & Pencil input,
                       page rendering, page strip, crop tool
  overlay/             what's drawn on the pages: tape, post-its
  text/                text boxes: the bundled fonts, the options bar
  tools/               toolbar, what each tool does, the post-it and tape panels
  study/               study mode: session order, study bar, summary
  state/               the annotation store (saving, undo/redo)
  ui/                  dialogs, menus, toasts, icons
  styles/              CSS
  utils/               small helpers (ids, geometry)
scripts/               make-icons.js (app icon), make-test-pdf.js (test file)
test-fixtures/         a sample PDF for testing during development
```

Every position on a page is stored relative to the page (0–1 of its width and
height), so annotations never drift when you zoom, rotate or change screen.
