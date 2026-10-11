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
  lined board (like Freeform) to draw on with the Pencil, scroll and zoom,
  with optional typing.

## Next

- **Milestone 3** — draw directly on the pages: pen, highlighter, eraser,
  colors, sizes, Pencil hover dot. Strokes may go past the edge of the page
  into the margin and must not be cut off. Select tool to move/resize/delete
  anything.
- **Milestone 4** — text boxes anywhere on the page, ~8 bundled fonts
  (some handwritten), size/color/bold/italic, same options inside post-its.
- **Milestone 5** — backup & export:
  - export one notebook as a file and import it back
  - **"Back up everything" / "Restore"** to move all notebooks between the
    PC and the iPad (via AirDrop, iCloud Drive, USB…)
  - export to PDF with annotations, tapes on or off
  - credits page for the open-source libraries
  - offline/PWA polish

## Requests to fit in

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
