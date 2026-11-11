// Export a notebook as a PDF: every page as a picture (the book page with
// your ink, text, tapes and post-its on it), plus a page for each post-it
// board right after its page. Pins and boards are linked both ways.
//
// Each page is drawn on a canvas, saved as a JPEG and added to the PDF by
// our own small writer (pdfWriter.js), one page at a time, so even a big
// book never has to be in memory all at once.
import { db } from '../db/db.js';
import { renderPdfRegion } from '../import/pdf.js';
import { canvasToBlob, freeCanvas, loadImage } from '../import/images.js';
import { inkToUnits } from '../ink/pageInk.js';
import { PEN_COLORS, displayColor } from '../ink/inkStyle.js';
import { colorValue, POSTIT_COLORS } from '../overlay/looks.js';
import { FULL_CROP } from '../utils/geometry.js';
import { queueRender, abortError } from '../viewer/renderQueue.js';
import { pageAspect } from '../viewer/layout.js';
import { createPdfWriter } from './pdfWriter.js';
import {
  exportBounds, fitPointsPerUnit, noteHasContent, pageWidthPt, pdfFileName, pixelSize,
} from './exportLayout.js';
import {
  drawInk, drawPin, drawTape, drawText, fontFor, inkBox, layoutText, pinBox, tapeBox,
} from './drawItems.js';

export const QUALITY = {
  standard: { density: 2, jpeg: 0.85 }, // pixels per point
  high: { density: 3, jpeg: 0.9 },
};

const PAGE_LINE_HEIGHT = 1.3; // text boxes on pages (text.css)
const BOARD_LINE_HEIGHT = 1.4; // text boxes on post-it boards (board.css)
const BOARD_POINTS_PER_UNIT = 0.75; // a board unit is a CSS pixel: 96 per inch, 72 points
const BOARD_MARGIN = 40;
const BOARD_MIN_WIDTH = 800;
const HEADER = 72; // the title strip at the top of a board page (board units)

/**
 * Makes the PDF. Returns { blob, fileName, pageCount }.
 *   from, to:  the first and last page to export (0-based, inclusive)
 *   tapes:     draw the tapes (they hide the answers) or leave them out
 *   notes:     include post-its (pins on the pages + a page for each board)
 *   quality:   'standard' | 'high'
 *   onProgress({ done, total, label })
 *   signal:    an AbortSignal, to cancel
 */
export async function exportNotebookPdf({
  notebookId, from = 0, to = Infinity, tapes = true, notes = true, quality = 'standard', onProgress, signal,
}) {
  const notebook = await db.notebooks.get(notebookId);
  if (!notebook) throw new Error('Notebook not found');
  const rows = await db.pages.where('notebookId').equals(notebookId).toArray();
  const byId = new Map(rows.map((p) => [p.id, p]));
  const allPages = notebook.pageIds.map((id) => byId.get(id)).filter(Boolean);
  const pages = allPages.slice(Math.max(0, from), Math.min(allPages.length, to + 1));
  if (!pages.length) throw new Error('There are no pages to export');
  const firstNumber = Math.max(0, from) + 1; // page number (as shown in the app) of pages[0]

  const docs = await db.annotations.where('notebookId').equals(notebookId).toArray();
  const itemsOf = new Map(docs.map((d) => [d.pageId, (d.items ?? []).filter((item) => !item.draft)]));

  // The plan: which PDF page is which, so links can point ahead.
  const plan = [];
  let noteNumber = 0;
  pages.forEach((page, i) => {
    const items = itemsOf.get(page.id) ?? [];
    const bookIndex = plan.length;
    // numbers: note id -> its number; boards: note id -> its board's PDF page
    const entry = { kind: 'book', index: bookIndex, page, items, pageNumber: firstNumber + i, numbers: new Map(), boards: new Map() };
    plan.push(entry);
    if (!notes) return;
    // Notes are numbered in reading order: top to bottom, then left to right.
    const withBoards = items
      .filter((item) => item.type === 'postit' && noteHasContent(item))
      .sort((a, b) => a.y - b.y || a.x - b.x);
    for (const item of withBoards) {
      const number = ++noteNumber;
      entry.numbers.set(item.id, number);
      entry.boards.set(item.id, plan.length);
      plan.push({ kind: 'board', index: plan.length, note: item, number, bookIndex, pageNumber: entry.pageNumber });
    }
  });

  await loadFonts(plan, signal);

  const settings = QUALITY[quality] ?? QUALITY.standard;
  const pdf = createPdfWriter({ title: notebook.title });
  const pinTops = new Map(); // note id -> where its pin is (points from the top of its page)

  for (const entry of plan) {
    if (signal?.aborted) throw abortError();
    onProgress?.({
      done: entry.index,
      total: plan.length,
      label: entry.kind === 'book' ? `Page ${entry.pageNumber}` : `Note ${entry.number} (page ${entry.pageNumber})`,
    });
    if (entry.kind === 'book') {
      const result = await renderBookPage(entry, { tapes, notes, settings, signal });
      const links = [];
      for (const pin of result.pins) {
        pinTops.set(pin.id, pin.rect.y);
        const target = entry.boards.get(pin.id);
        if (target != null) links.push({ rect: pin.rect, page: target, top: 0 });
      }
      pdf.addPage({ width: result.widthPt, height: result.heightPt, image: result.image, links });
    } else {
      const result = await renderBoardPage(entry, { settings });
      const links = [{ rect: result.backRect, page: entry.bookIndex, top: Math.max(0, (pinTops.get(entry.note.id) ?? 0) - 40) }];
      if (result.linkRect) links.push({ rect: result.linkRect, url: entry.note.link.url });
      pdf.addPage({ width: result.widthPt, height: result.heightPt, image: result.image, links });
    }
  }
  onProgress?.({ done: plan.length, total: plan.length, label: 'Done' });
  return { blob: pdf.finish(), fileName: pdfFileName(notebook.title), pageCount: plan.length };
}

// The bundled fonts download only when something uses them: make sure every
// font in the export is ready before drawing (or the canvas would quietly
// use another one).
async function loadFonts(plan, signal) {
  if (typeof document === 'undefined' || !document.fonts) return;
  const fonts = new Set();
  for (const entry of plan) {
    const texts = entry.kind === 'book' ? entry.items.filter((i) => i.type === 'text') : boardTexts(entry.note);
    for (const box of texts) fonts.add(fontFor(box, 20));
  }
  try {
    await Promise.race([
      Promise.all([...fonts].map((font) => document.fonts.load(font))),
      new Promise((resolve) => setTimeout(resolve, 8000)), // don't wait forever
    ]);
  } catch (error) {
    console.warn('Fonts did not load', error);
  }
  if (signal?.aborted) throw abortError();
}

// A canvas just for measuring text.
let measurer = null;
function measureContext() {
  if (!measurer) measurer = document.createElement('canvas').getContext('2d');
  return measurer;
}

function newCanvas(width, height, background) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, width, height);
  return { canvas, ctx };
}

async function toJpeg(canvas, quality) {
  const blob = await canvasToBlob(canvas, 'image/jpeg', quality);
  return { blob, width: canvas.width, height: canvas.height };
}

// --- A book page ---------------------------------------------------------------

async function renderBookPage(entry, { tapes, notes, settings, signal }) {
  const { page, items } = entry;
  const pageHeight = 1000 * pageAspect(page);
  const mctx = measureContext();

  const strokes = items.filter((i) => i.type === 'ink').map((i) => inkToUnits(i, pageHeight));
  const texts = items
    .filter((i) => i.type === 'text' && i.text?.trim())
    .map((i) => {
      const box = { ...i, x: i.x * 1000, y: i.y * pageHeight, w: i.w * 1000 };
      return { box, layout: layoutText(mctx, box, PAGE_LINE_HEIGHT) };
    });
  const tapeItems = tapes ? items.filter((i) => i.type === 'tape') : [];
  const pins = notes ? items.filter((i) => i.type === 'postit') : [];

  // Grow the page to fit what's next to it.
  const bounds = exportBounds(pageHeight, [
    ...strokes.map(inkBox),
    ...texts.map(({ box, layout }) => ({ left: box.x, top: box.y, right: box.x + box.w, bottom: box.y + layout.height })),
    ...tapeItems.map((t) => tapeBox(t, pageHeight)),
    ...pins.map((p) => pinBox(p, pageHeight)),
  ]);
  const widthUnits = bounds.right - bounds.left;
  const heightUnits = bounds.bottom - bounds.top;
  const ptPerUnit = fitPointsPerUnit(pageWidthPt(page) / 1000, widthUnits, heightUnits);
  const widthPt = widthUnits * ptPerUnit;
  const heightPt = heightUnits * ptPerUnit;
  const px = pixelSize(widthPt, heightPt, settings.density);
  const k = px.width / widthUnits; // pixels per unit

  const { canvas, ctx } = newCanvas(px.width, px.height, '#ffffff');
  try {
    // The book page itself.
    const pageX = Math.round(-bounds.left * k);
    const pageY = Math.round(-bounds.top * k);
    const pageW = Math.max(1, Math.round(1000 * k));
    const pageH = Math.max(1, Math.round(pageHeight * k));
    await drawBookPage(ctx, page, pageX, pageY, pageW, pageH, signal);
    if (widthUnits > 1000 || heightUnits > pageHeight + 0.5) {
      // There's room around the page: show where the page ends.
      ctx.strokeStyle = 'rgba(60,45,20,.35)';
      ctx.lineWidth = Math.max(1, k * 0.8);
      ctx.strokeRect(pageX, pageY, pageW, pageH);
    }

    // Annotations, in the same order as on screen.
    ctx.setTransform(k, 0, 0, k, -bounds.left * k, -bounds.top * k);
    drawInk(ctx, strokes);
    for (const { box, layout } of texts) {
      drawText(ctx, box, layout, { k, lineHeight: PAGE_LINE_HEIGHT, color: box.color ?? PEN_COLORS[0] });
    }
    for (const tape of tapeItems) drawTape(ctx, tape, pageHeight, k);
    const pinRects = [];
    for (const pin of pins) {
      const number = entry.numbers.get(pin.id) ?? null;
      drawPin(ctx, pin, pageHeight, k, number);
      if (number != null) {
        pinRects.push({
          id: pin.id,
          rect: {
            x: (pin.x * 1000 - bounds.left) * ptPerUnit,
            y: (pin.y * pageHeight - bounds.top) * ptPerUnit,
            w: 38 * ptPerUnit,
            h: 38 * ptPerUnit,
          },
        });
      }
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    return { widthPt, heightPt, image: await toJpeg(canvas, settings.jpeg), pins: pinRects };
  } finally {
    freeCanvas(canvas);
  }
}

// Draws the PDF page / screenshot (blank pages stay white).
async function drawBookPage(ctx, page, x, y, w, h, signal) {
  if (page.kind === 'pdf') {
    const temp = document.createElement('canvas');
    try {
      await queueRender(
        3,
        () => renderPdfRegion({ page, region: FULL_CROP, canvas: temp, pixelWidth: w, pixelHeight: h, signal, cleanup: true }),
        signal,
      );
      ctx.drawImage(temp, x, y, w, h);
    } finally {
      freeCanvas(temp);
    }
  } else if (page.kind === 'image') {
    const source = await db.sourceFiles.get(page.sourceFileId);
    if (!source) return;
    const { img, release } = await loadImage(source.displayBlob ?? source.blob);
    try {
      const iw = img.naturalWidth;
      const ih = img.naturalHeight;
      const { crop } = page;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, crop.x * iw, crop.y * ih, crop.w * iw, crop.h * ih, x, y, w, h);
    } finally {
      release();
    }
  }
}

// --- A post-it board -------------------------------------------------------------

// The note's text boxes; older notes kept a single text (and title), which the
// board turns into a text box the first time it's opened (NoteBoard.jsx).
function boardTexts(note) {
  const texts = (note.texts ?? []).filter((t) => t.text?.trim());
  let legacy = note.text ?? '';
  if (note.title) legacy = legacy ? `${note.title}\n${legacy}` : note.title;
  if (legacy.trim()) texts.push({ id: 'legacy', x: 28, y: 32, w: 600, text: legacy, color: PEN_COLORS[0], size: 20 });
  return texts;
}

async function renderBoardPage(entry, { settings }) {
  const { note, number, pageNumber } = entry;
  const bg = note.bg ?? 'white';
  const dark = bg === 'black';
  const noteColor = colorValue(POSTIT_COLORS, note.color);
  const background = dark ? '#0b0b0c' : bg === 'note' ? noteColor : '#ffffff';
  const ink = dark ? '#f2f2f2' : '#2b2620';
  const muted = dark ? 'rgba(242,242,242,.6)' : 'rgba(43,38,32,.6)';
  const mctx = measureContext();

  const strokes = note.ink ?? [];
  const texts = boardTexts(note).map((box) => ({ box, layout: layoutText(mctx, box, BOARD_LINE_HEIGHT) }));
  const boxes = [
    ...strokes.map(inkBox),
    ...texts.map(({ box, layout }) => ({ left: box.x, top: box.y, right: box.x + box.w, bottom: box.y + layout.height })),
  ];
  let content = { left: 0, top: 0, right: 0, bottom: 0 };
  if (boxes.length) {
    content = {
      left: Math.min(...boxes.map((b) => b.left)),
      top: Math.min(...boxes.map((b) => b.top)),
      right: Math.max(...boxes.map((b) => b.right)),
      bottom: Math.max(...boxes.map((b) => b.bottom)),
    };
  }
  const widthUnits = Math.max(BOARD_MIN_WIDTH, content.right - content.left + BOARD_MARGIN * 2);
  const heightUnits = HEADER + Math.max(320, content.bottom - content.top + BOARD_MARGIN * 2);
  const ptPerUnit = fitPointsPerUnit(BOARD_POINTS_PER_UNIT, widthUnits, heightUnits);
  const widthPt = widthUnits * ptPerUnit;
  const heightPt = heightUnits * ptPerUnit;
  const px = pixelSize(widthPt, heightPt, settings.density);
  const k = px.width / widthUnits;
  // Where board point (0, 0) lands on the PDF page (units).
  const originX = BOARD_MARGIN - content.left;
  const originY = HEADER + BOARD_MARGIN - content.top;

  const { canvas, ctx } = newCanvas(px.width, px.height, background);
  try {
    // The header: "Note 3 · page 12", which also takes you back to the page.
    ctx.setTransform(k, 0, 0, k, 0, 0);
    ctx.fillStyle = dark ? 'rgba(255,255,255,.12)' : 'rgba(60,45,20,.16)';
    ctx.fillRect(0, HEADER - 1, widthUnits, 1);
    drawLabel(ctx, k, `Note ${number}`, BOARD_MARGIN, 44, `700 ${24 * k}px system-ui, -apple-system, 'Segoe UI', sans-serif`, ink);
    const titleWidth = measureLabel(ctx, k, `Note ${number}`, `700 ${24 * k}px system-ui, -apple-system, 'Segoe UI', sans-serif`);
    const back = `↩ back to page ${pageNumber}`;
    const backFont = `400 ${17 * k}px system-ui, -apple-system, 'Segoe UI', sans-serif`;
    const backX = BOARD_MARGIN + titleWidth + 16;
    drawLabel(ctx, k, back, backX, 44, backFont, muted);
    const backWidth = measureLabel(ctx, k, back, backFont);
    const backRect = { x: 0, y: 0, w: (backX + backWidth + 8) * ptPerUnit, h: HEADER * ptPerUnit };

    // The note's link (e.g. a Freeform board), as a chip on the right.
    let linkRect = null;
    if (note.link?.url) {
      const label = `↗ ${note.link.name || note.link.url}`.slice(0, 60);
      const font = `600 ${15 * k}px system-ui, -apple-system, 'Segoe UI', sans-serif`;
      const w = measureLabel(ctx, k, label, font) + 28;
      const x = Math.max(backX + backWidth + 24, widthUnits - BOARD_MARGIN - w);
      ctx.fillStyle = dark ? '#1f3355' : '#e8f0ff';
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(x, 18, w, 36, 18);
      else ctx.rect(x, 18, w, 36);
      ctx.fill();
      drawLabel(ctx, k, label, x + 14, 41, font, dark ? '#a9c8ff' : '#1f5fbf');
      linkRect = { x: x * ptPerUnit, y: 18 * ptPerUnit, w: w * ptPerUnit, h: 36 * ptPerUnit };
    }

    // What's on the board.
    ctx.setTransform(k, 0, 0, k, originX * k, originY * k);
    drawInk(ctx, strokes, { dark });
    for (const { box, layout } of texts) {
      drawText(ctx, box, layout, { k, lineHeight: BOARD_LINE_HEIGHT, color: displayColor(box.color ?? PEN_COLORS[0], dark) });
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    return { widthPt, heightPt, image: await toJpeg(canvas, settings.jpeg), backRect, linkRect };
  } finally {
    freeCanvas(canvas);
  }
}

// One line of text at (x, baseline y) in units, drawn at pixel size.
function drawLabel(ctx, k, text, x, y, font, color) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(1 / k, 1 / k);
  ctx.font = font;
  ctx.fillStyle = color;
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
  ctx.fillText(text, 0, 0);
  ctx.restore();
}

function measureLabel(ctx, k, text, font) {
  ctx.save();
  ctx.font = font;
  const width = ctx.measureText(text).width / k;
  ctx.restore();
  return width;
}
