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
const MAX_DETAIL_PIXELS = 8_000_000;
const DETAIL_MARGINS = [0.2, 0.12, 0.06, 0]; // extra area around the screen, biggest that fits
// While you move the page, a new detail render starts when the screen gets this
// close (as a fraction of the screen) to the edge of the sharp area, so the
// blurry base is never reached.
const PRERENDER = 0.1;
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
  const pending = useRef(null); // the detail render in progress: { controller, scale, region }
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
      pending.current?.controller.abort();
      pending.current = null;
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
    const cancelPending = () => {
      pending.current?.controller.abort();
      pending.current = null;
    };
    if (!view) return;
    const fullWidth = PAGE_WIDTH * view.scale * dpr; // whole page width in device pixels
    if (fullWidth <= baseWidth * 1.1) {
      cancelPending();
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
      cancelPending();
      removeCanvas(detail);
      return;
    }
    // The screen plus a little: if the sharp area doesn't cover this, it is
    // time for a new one (before the edge of the old one is reached).
    const wanted = intersect(
      {
        x: onScreen.x - onScreen.w * PRERENDER,
        y: onScreen.y - onScreen.h * PRERENDER,
        w: onScreen.w * (1 + 2 * PRERENDER),
        h: onScreen.h * (1 + 2 * PRERENDER),
      },
      FULL_CROP,
    );
    const d = detail.current;
    if (d.canvas && d.scale === view.scale && contains(d.region, wanted)) {
      cancelPending(); // still covered: a render in progress is no longer needed
      return;
    }
    // A render in progress that covers the screen keeps going (restarting it
    // on every move would mean it never finishes while you keep moving).
    const p = pending.current;
    if (p && p.scale === view.scale && contains(p.region, onScreen)) return;
    cancelPending();

    // Render a bit more than what's visible, so small pans stay sharp. If that
    // would be more pixels than a canvas may have, shrink the margin first:
    // what you see should stay at full sharpness, the margin is a bonus.
    let region = null;
    let pixelWidth = 0;
    let pixelHeight = 0;
    for (const margin of DETAIL_MARGINS) {
      region = intersect(
        {
          x: onScreen.x - onScreen.w * margin,
          y: onScreen.y - onScreen.h * margin,
          w: onScreen.w * (1 + 2 * margin),
          h: onScreen.h * (1 + 2 * margin),
        },
        FULL_CROP,
      );
      pixelWidth = region.w * fullWidth;
      pixelHeight = region.h * fullWidth * aspect;
      if (pixelWidth * pixelHeight <= MAX_DETAIL_PIXELS) break;
    }
    const area = pixelWidth * pixelHeight;
    if (area > MAX_DETAIL_PIXELS) {
      const k = Math.sqrt(MAX_DETAIL_PIXELS / area);
      pixelWidth *= k;
      pixelHeight *= k;
    }

    const controller = new AbortController();
    pending.current = { controller, scale: view.scale, region };
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
        if (pending.current?.controller === controller) pending.current = null;
        if (controller.signal.aborted || !holderRef.current) return freeCanvas(canvas);
        removeCanvas(detail);
        holderRef.current.append(canvas);
        detail.current = { canvas, scale: view.scale, region };
      })
      .catch((error) => {
        if (pending.current?.controller === controller) pending.current = null;
        freeCanvas(canvas);
        if (!isCancel(error)) console.warn('PDF detail render failed', error);
      });
  }, [view, cropKey, rect.x, rect.y, rect.w, rect.h, baseWidth, aspect, dpr]);

  return <div className="pdf-holder" ref={holderRef} />;
}
