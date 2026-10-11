import { useEffect, useRef } from 'react';
import { renderPdfRegion } from '../import/pdf.js';
import { freeCanvas } from '../import/images.js';
import { FULL_CROP } from '../utils/geometry.js';
import { queueRender } from './renderQueue.js';
import { PAGE_WIDTH, pageAspect } from './layout.js';

// iPad Safari has a hard limit on canvas memory, so a PDF page is drawn in
// two layers:
//   - base:   the whole page, at most ~3 megapixels (sharp enough at normal zoom)
//   - detail: only when zoomed in: just the part you can see, at full sharpness
// Canvases are created and swapped by hand (not by React) so the old one
// stays on screen until the new one is ready, then gets freed right away.
const MAX_BASE_PIXELS = 3_000_000;
const MAX_DETAIL_PIXELS = 6_000_000;
const STEP = 1.5; // base sharpness changes in steps, so tiny zooms don't re-render

function stepUp(width) {
  if (width <= 256) return 256;
  return 256 * Math.pow(STEP, Math.ceil(Math.log(width / 256) / Math.log(STEP)));
}

function isCancel(error) {
  return error?.name === 'AbortError' || error?.name === 'RenderingCancelledException';
}

function intersect(a, b) {
  const x = Math.max(a.x, b.x);
  const y = Math.max(a.y, b.y);
  const right = Math.min(a.x + a.w, b.x + b.w);
  const bottom = Math.min(a.y + a.h, b.y + b.h);
  return right > x && bottom > y ? { x, y, w: right - x, h: bottom - y } : null;
}

function contains(outer, inner) {
  return (
    inner.x >= outer.x - 1e-6 && inner.y >= outer.y - 1e-6 &&
    inner.x + inner.w <= outer.x + outer.w + 1e-6 && inner.y + inner.h <= outer.y + outer.h + 1e-6
  );
}

function removeCanvas(slot) {
  if (slot.current.canvas) {
    slot.current.canvas.remove();
    freeCanvas(slot.current.canvas);
  }
  slot.current = { canvas: null };
}

export function PdfPageCanvas({ page, rect, view, priority }) {
  const holderRef = useRef(null);
  const base = useRef({ canvas: null });
  const detail = useRef({ canvas: null });
  // The latest values, readable inside effects without re-running them.
  const latest = useRef({});
  latest.current = { page, priority };

  const dpr = window.devicePixelRatio || 1;
  const aspect = pageAspect(page);
  const cropKey = JSON.stringify(page.crop);
  const scale = view?.scale ?? 0;
  const baseWidth = scale
    ? Math.round(Math.min(Math.sqrt(MAX_BASE_PIXELS / aspect), stepUp(PAGE_WIDTH * scale * dpr)))
    : 0;

  // A new crop means the old pictures are wrong: drop them. (This cleanup
  // also runs when the page leaves the screen, freeing the canvases.)
  useEffect(() => {
    return () => {
      removeCanvas(base);
      removeCanvas(detail);
    };
  }, [cropKey]);

  // Base layer
  useEffect(() => {
    if (!baseWidth) return;
    const current = base.current;
    if (current.canvas && current.width >= baseWidth && current.width <= baseWidth * STEP * STEP) return;

    const controller = new AbortController();
    const canvas = document.createElement('canvas');
    canvas.className = 'pdf-base';
    const pixelHeight = Math.max(1, Math.round(baseWidth * aspect));
    queueRender(
      latest.current.priority,
      () => renderPdfRegion({
        page: latest.current.page, region: FULL_CROP, canvas,
        pixelWidth: baseWidth, pixelHeight, signal: controller.signal,
      }),
      controller.signal,
    )
      .then(() => {
        if (controller.signal.aborted || !holderRef.current) return freeCanvas(canvas);
        removeCanvas(base);
        holderRef.current.prepend(canvas); // under the detail layer
        base.current = { canvas, width: baseWidth };
      })
      .catch((error) => {
        freeCanvas(canvas);
        if (!isCancel(error)) console.warn('PDF render failed', error);
      });
    return () => controller.abort();
  }, [page.id, cropKey, baseWidth, aspect]);

  // Detail layer
  useEffect(() => {
    if (!view) return;
    const fullWidth = PAGE_WIDTH * view.scale * dpr; // whole page width in device pixels
    if (fullWidth <= baseWidth * 1.1) {
      removeCanvas(detail); // the base is sharp enough
      return;
    }
    // The part of this page on screen, in fractions of the page.
    const onScreen = intersect(
      {
        x: (view.left - rect.x) / rect.w,
        y: (view.top - rect.y) / rect.h,
        w: (view.right - view.left) / rect.w,
        h: (view.bottom - view.top) / rect.h,
      },
      FULL_CROP,
    );
    if (!onScreen) {
      removeCanvas(detail);
      return;
    }
    const d = detail.current;
    if (d.canvas && d.scale === view.scale && contains(d.region, onScreen)) return; // still covers it

    // Render a bit more than what's visible, so small pans stay sharp.
    const marginX = onScreen.w * 0.15;
    const marginY = onScreen.h * 0.15;
    const region = intersect(
      { x: onScreen.x - marginX, y: onScreen.y - marginY, w: onScreen.w + 2 * marginX, h: onScreen.h + 2 * marginY },
      FULL_CROP,
    );
    let pixelWidth = region.w * fullWidth;
    let pixelHeight = region.h * fullWidth * aspect;
    const area = pixelWidth * pixelHeight;
    if (area > MAX_DETAIL_PIXELS) {
      const k = Math.sqrt(MAX_DETAIL_PIXELS / area);
      pixelWidth *= k;
      pixelHeight *= k;
    }

    const controller = new AbortController();
    const canvas = document.createElement('canvas');
    canvas.className = 'pdf-detail';
    Object.assign(canvas.style, {
      left: `${region.x * 100}%`,
      top: `${region.y * 100}%`,
      width: `${region.w * 100}%`,
      height: `${region.h * 100}%`,
    });
    queueRender(
      0,
      () => renderPdfRegion({
        page: latest.current.page, region, canvas,
        pixelWidth: Math.max(1, Math.round(pixelWidth)),
        pixelHeight: Math.max(1, Math.round(pixelHeight)),
        signal: controller.signal,
      }),
      controller.signal,
    )
      .then(() => {
        if (controller.signal.aborted || !holderRef.current) return freeCanvas(canvas);
        removeCanvas(detail);
        holderRef.current.append(canvas);
        detail.current = { canvas, scale: view.scale, region };
      })
      .catch((error) => {
        freeCanvas(canvas);
        if (!isCancel(error)) console.warn('PDF detail render failed', error);
      });
    return () => controller.abort();
  }, [view, cropKey, rect.x, rect.y, rect.w, rect.h, baseWidth, aspect, dpr]);

  return <div className="pdf-holder" ref={holderRef} />;
}
