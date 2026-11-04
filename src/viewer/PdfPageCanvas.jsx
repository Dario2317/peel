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
// Every PDF render costs battery, so the pictures are only as big as needed:
// the screen at full sharpness plus a small margin (moving further renders
// a new one ahead of time, see PRERENDER).
const MAX_DETAIL_PIXELS = 6_000_000;
// [margin all around, extra margin in the direction you are moving], as
// fractions of the screen: the first one that fits in the pixel limit is used.
const DETAIL_MARGINS = [[0.1, 0], [0.05, 0], [0, 0]];
const MOVING_MARGINS = [[0.05, 0.45], [0.05, 0.3], [0.05, 0.15], [0, 0]];
// While you pinch, the page is redrawn a few times a second: smaller pictures,
// so each one is ready fast and the pinch stays smooth. The full one comes
// when you let go.
const ZOOMING_MARGINS = [[0.05, 0], [0, 0]];
const MAX_ZOOMING_PIXELS = 2_500_000;
// ...and only once the zoom has changed this much since the last picture
// (a picture up to 30% off still looks fine while it moves).
const ZOOMING_TOLERANCE = 0.3;
// While you move the page, a new detail render starts when the screen gets this
// close (as a fraction of the screen) to the edge of the sharp area, so the
// blurry base is never reached.
const PRERENDER = 0.05; // (the margins below are at least this big, or every check would fail)
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
    const sameScale = (a, tolerance = 0.01) => Math.abs(a / view.scale - 1) < tolerance;
    // While the zoom changes a quick, smaller picture will do, and one made at
    // a slightly different zoom too; once it stops (even with the fingers
    // still on the screen), only a full one at the right zoom does.
    const goodEnough = (r) =>
      view.zooming ? sameScale(r.scale, ZOOMING_TOLERANCE) : sameScale(r.scale) && r.full;
    const d = detail.current;
    // While moving, the sharp area must reach a bit past the screen (so the
    // next one is ready in time); at rest, covering the screen is enough.
    // (While zooming, covering the screen is enough too: the zoom changes the
    // area anyway.)
    if (d.canvas && goodEnough(d) && contains(d.region, view.live && !view.zooming ? wanted : onScreen)) {
      cancelPending(); // still covered: a render in progress is no longer needed
      return;
    }
    const p = pending.current;
    if (p) {
      // While you move or pinch, a render in progress always finishes (if each
      // new position restarted it, it would never finish while you keep
      // moving); the next one starts from wherever you are then.
      if (view.live) return;
      // You stopped: keep it only if it is right for where you stopped.
      if (goodEnough(p) && contains(p.region, onScreen)) return;
    }
    cancelPending();

    // Render a bit more than what's visible, so small pans stay sharp. If that
    // would be more pixels than a canvas may have, shrink the margin first:
    // what you see should stay at full sharpness, the margin is a bonus.
    let region = null;
    let pixelWidth = 0;
    let pixelHeight = 0;
    const budget = view.zooming ? MAX_ZOOMING_PIXELS : MAX_DETAIL_PIXELS;
    const heading = view.heading ?? { x: 0, y: 0 };
    const moving = view.live && !view.zooming && (heading.x || heading.y);
    const options = view.zooming ? ZOOMING_MARGINS : moving ? MOVING_MARGINS : DETAIL_MARGINS;
    for (const [margin, ahead] of options) {
      const left = margin + (heading.x < 0 ? ahead : 0);
      const right = margin + (heading.x > 0 ? ahead : 0);
      const top = margin + (heading.y < 0 ? ahead : 0);
      const bottom = margin + (heading.y > 0 ? ahead : 0);
      region = intersect(
        {
          x: onScreen.x - onScreen.w * left,
          y: onScreen.y - onScreen.h * top,
          w: onScreen.w * (1 + left + right),
          h: onScreen.h * (1 + top + bottom),
        },
        FULL_CROP,
      );
      pixelWidth = region.w * fullWidth;
      pixelHeight = region.h * fullWidth * aspect;
      if (pixelWidth * pixelHeight <= budget) break;
    }
    const area = pixelWidth * pixelHeight;
    if (area > budget) {
      const k = Math.sqrt(budget / area);
      pixelWidth *= k;
      pixelHeight *= k;
    }

    const controller = new AbortController();
    const full = !view.zooming;
    pending.current = { controller, scale: view.scale, region, full };
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
        detail.current = { canvas, scale: view.scale, region, full };
      })
      .catch((error) => {
        if (pending.current?.controller === controller) pending.current = null;
        freeCanvas(canvas);
        if (!isCancel(error)) console.warn('PDF detail render failed', error);
      });
  }, [view, cropKey, rect.x, rect.y, rect.w, rect.h, baseWidth, aspect, dpr]);

  return <div className="pdf-holder" ref={holderRef} />;
}
