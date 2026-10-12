# Peel roadmap

What's done, what's next, and requests to remember.

## Done

- **Milestone 1** — library, import (screenshots, PDFs, paste, drag & drop),
  page viewer (pan, pinch zoom, fling, palm rejection), crop with "apply to
  all", page strip (reorder, delete, add), saving, offline app.
- **Milestone 2** — tape (washi look, torn ends, always opaque, questions),
  study mode (peel, Got it / Missed, score, redo missed, stats, missed first
  next time), undo/redo, post-its.
- **Post-its, second version** — closed notes are small see-through pins that
  keep the same size on screen at any zoom; opening one shows a full-screen
  dotted board (like Freeform) with a white, black or note-color background,
  to draw on with the Pencil (pen, marker, eraser, smoothing), scroll and
  zoom (zoom pill bottom-left), text boxes you can place anywhere, shapes
  (hold still to snap ovals, rectangles, lines, arrows), lasso to move or
  delete, a zoom window to write small precisely, and a link with a name
  (e.g. to a Freeform board).
- **Milestone 3** — draw directly on the pages: pen, marker, eraser, 8
  colors, 3 sizes, smoothing, Pencil hover dot, shapes (hold to snap), lasso
  to move or delete ink, tapes and post-its; ink can run past the page edge.
- **After Milestone 3** — room around the pages to write next to them (like
  Freeform; one-finger scrolling sticks to up/down so it doesn't drift);
  folders in the library (nested, Move to…, drag onto a folder, delete keeps
  or removes what's inside).
- **Milestone 4** — text boxes on the pages (anywhere, also next to the page)
  and on the post-it boards: 8 bundled fonts (4 handwritten), size, bold,
  italic, 8 colors; zoom window on the pages; smoothing that really smooths
  (it used to make lines more jagged).

## Next

- **Milestone 5** — backup & export:
  - export one notebook as a file and import it back
  - **"Back up everything" / "Restore"** to move all notebooks between the
    PC and the iPad (via AirDrop, iCloud Drive, USB…)
  - export to PDF with annotations, tapes on or off
  - credits page for the open-source libraries
  - offline/PWA polish

## Requests to fit in

- **iPadOS three-finger undo bar**: not possible for a web app (the system
  only connects it to text fields). Peel uses two-finger tap = undo,
  three-finger tap = redo, plus on-screen buttons.

- **Dark mode** for the whole interface.
- **Invert pages** switch: show white PDF/screenshot pages dark (for dark
  mode / reading at night).
- **PC parity**: on a computer you can do everything you can do on the iPad
  (except comfortable drawing) — mouse and keyboard for everything.
- **Paid access (undecided)**: if Peel is ever sold (e.g. to classmates), it
  must move off GitHub Pages (its rules forbid commercial use), get real
  logins (e.g. Cloudflare Pages + Access), and the code should become private.
  Never share exported notebooks that contain book pages.

## Later (data model already ready)

- Spaced repetition: a "due today" queue of tapes across all notebooks
  (`tapeStats.due` + `reviewLog`).
