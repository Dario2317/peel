// Measurements for the PDF export that don't need a browser (so they can be
// tested): wrapping text like the app does, and how big each PDF page is.

/**
 * Splits text into lines the way a text box shows it (CSS white-space:
 * pre-wrap + overflow-wrap: anywhere): line breaks are kept, long lines wrap
 * at spaces, and a word longer than the whole line is cut wherever it must.
 *   measure(text) → width, in the same units as maxWidth
 */
export function wrapText(text, maxWidth, measure) {
  const lines = [];
  for (const paragraph of String(text).split('\n')) {
    // Words with the spaces after them ("hello  " "world").
    const tokens = paragraph.match(/\s*\S+\s*|\s+/g) ?? [''];
    let line = '';
    for (const token of tokens) {
      const candidate = line + token;
      // Spaces at the end of a line don't count (they "hang" past the edge).
      if (!line || measure(candidate.trimEnd()) <= maxWidth) {
        if (!line && measure(token.trimEnd()) > maxWidth) {
          // A word longer than the line: cut it into pieces that fit.
          const pieces = breakWord(token, maxWidth, measure);
          lines.push(...pieces.slice(0, -1));
          line = pieces[pieces.length - 1];
        } else {
          line = candidate;
        }
        continue;
      }
      lines.push(line.trimEnd());
      const word = token.replace(/^\s+/, '');
      if (measure(word.trimEnd()) > maxWidth) {
        const pieces = breakWord(word, maxWidth, measure);
        lines.push(...pieces.slice(0, -1));
        line = pieces[pieces.length - 1];
      } else {
        line = word;
      }
    }
    lines.push(line.trimEnd());
  }
  return lines;
}

function breakWord(word, maxWidth, measure) {
  const pieces = [];
  let piece = '';
  for (const char of Array.from(word)) {
    if (piece && measure((piece + char).trimEnd()) > maxWidth) {
      pieces.push(piece);
      piece = char.trim() ? char : '';
    } else {
      piece += char;
    }
  }
  pieces.push(piece);
  return pieces;
}

/**
 * Where the first line's baseline goes, like CSS: every line is
 * lineHeight tall and the letters (ascent + descent) sit in its middle.
 */
export function firstBaseline(lineHeight, ascent, descent) {
  return (lineHeight - (ascent + descent)) / 2 + ascent;
}

// --- Page sizes ------------------------------------------------------------

export const A4_WIDTH_PT = 595;
// PDF pages can't be bigger than this (200 inches).
export const MAX_PAGE_PT = 14400;
// Room left around ink/notes that go past the edge of the page (page units).
export const EDGE_MARGIN = 20;
// How far past the page edge the export follows your ink (page units, each side).
export const MAX_OVERHANG = 1000;

// Width of the PDF page for a book page, in points: PDF pages keep their own
// size, screenshots and blank pages become A4 wide.
export function pageWidthPt(page) {
  if (page.kind === 'pdf') return page.width * page.crop.w;
  return A4_WIDTH_PT;
}

/**
 * The area to export for one page (page units, the page is 1000 wide):
 * the page itself, grown to fit what you wrote next to it.
 *   boxes: [{ left, top, right, bottom }] of everything drawn on the page
 */
export function exportBounds(pageHeight, boxes) {
  let left = 0;
  let top = 0;
  let right = 1000;
  let bottom = pageHeight;
  for (const b of boxes) {
    if (![b.left, b.top, b.right, b.bottom].every(Number.isFinite)) continue;
    left = Math.min(left, b.left);
    top = Math.min(top, b.top);
    right = Math.max(right, b.right);
    bottom = Math.max(bottom, b.bottom);
  }
  // A side only grows if something sticks out there; then it gets a margin.
  const grow = (edge, limit, outward) => (edge === limit ? limit : edge + outward * EDGE_MARGIN);
  return {
    left: Math.max(-MAX_OVERHANG, grow(left, 0, -1)),
    top: Math.max(-MAX_OVERHANG, grow(top, 0, -1)),
    right: Math.min(1000 + MAX_OVERHANG, grow(right, 1000, 1)),
    bottom: Math.min(pageHeight + MAX_OVERHANG, grow(bottom, pageHeight, 1)),
  };
}

/**
 * Picture size in pixels for a PDF page of widthPt × heightPt points.
 *   density: pixels per point (2 = standard, 3 = high)
 * Never more than maxPixels (iPad memory), never more than 16000 px a side.
 */
export function pixelSize(widthPt, heightPt, density, maxPixels = 12_000_000) {
  let k = density;
  if (widthPt * heightPt * k * k > maxPixels) k = Math.sqrt(maxPixels / (widthPt * heightPt));
  k = Math.min(k, 16000 / widthPt, 16000 / heightPt);
  return { width: Math.max(1, Math.round(widthPt * k)), height: Math.max(1, Math.round(heightPt * k)) };
}

// Points per page unit, so the whole PDF page stays under MAX_PAGE_PT.
export function fitPointsPerUnit(pointsPerUnit, widthUnits, heightUnits) {
  return Math.min(pointsPerUnit, MAX_PAGE_PT / widthUnits, MAX_PAGE_PT / heightUnits);
}

// A file name made from the notebook title.
export function pdfFileName(title) {
  const clean = String(title ?? '')
    .replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 100);
  return `${clean || 'Notebook'}.pdf`;
}

// Does a post-it have anything on its board worth a page?
export function noteHasContent(note) {
  if (note.ink?.length) return true;
  if (note.texts?.some((t) => t.text?.trim())) return true;
  return Boolean(note.text?.trim() || note.title?.trim() || note.link);
}
