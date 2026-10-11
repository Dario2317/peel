// Where each page sits in the "world": pages are stacked vertically, every
// page is PAGE_WIDTH units wide and as tall as its shape requires.

export const PAGE_WIDTH = 1000;
export const PAGE_GAP = 32;

// Height divided by width of the visible (cropped) page.
export function pageAspect(page) {
  return (page.height * page.crop.h) / (page.width * page.crop.w);
}

export function computeLayout(pages) {
  const rects = [];
  let y = PAGE_GAP;
  for (const page of pages) {
    const h = PAGE_WIDTH * pageAspect(page);
    rects.push({ x: 0, y, w: PAGE_WIDTH, h });
    y += h + PAGE_GAP;
  }
  return { rects, height: y };
}

// Index of the first page whose bottom edge is at or below worldY.
// (Binary search: fast even with thousands of pages.)
export function firstPageEndingAfter(rects, worldY) {
  let lo = 0;
  let hi = rects.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (rects[mid].y + rects[mid].h < worldY) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

// [first, last] indexes of the pages that overlap top…bottom (inclusive).
// If none do, last < first.
export function pagesInRange(rects, top, bottom) {
  const first = firstPageEndingAfter(rects, top);
  let last = first - 1;
  while (last + 1 < rects.length && rects[last + 1].y <= bottom) last++;
  return [first, last];
}

// The page at worldY, or the nearest one.
export function pageIndexAt(rects, worldY) {
  if (!rects.length) return -1;
  return Math.min(firstPageEndingAfter(rects, worldY), rects.length - 1);
}
