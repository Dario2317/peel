// Moves the stack of pages on screen. Like input.js it is plain JavaScript:
// it updates the page position directly (one CSS transform per frame) and
// only tells React when something React cares about changes:
//   - onRange(first, last): which pages should exist (near the screen)
//   - onCurrentPage(index): the page you are looking at
//   - onSettle(view): you stopped moving → time to render sharper PDF pages
import { clampCamera, fitWidthScale, scaleLimits, zoomAround } from './camera.js';
import { pageIndexAt, pagesInRange, PAGE_GAP } from './layout.js';
import { clamp } from '../utils/platform.js';

const SETTLE_MS = 150;

export class Viewport {
  constructor(container, world, callbacks) {
    this.container = container; // the visible area
    this.world = world; // the element holding all pages
    this.cb = callbacks;
    this.frameListeners = new Set();
    this.camera = null;
    this.size = { width: 0, height: 0 };
    this.layout = { rects: [], height: 0 };
    this.pageIds = [];
    this.range = [0, -1];
    this.currentIndex = -1;
    this.interacting = false;
    this.frame = 0;
    this.settleTimer = 0;
  }

  destroy() {
    cancelAnimationFrame(this.frame);
    clearTimeout(this.settleTimer);
  }

  // Ready once we know the screen size and have placed the camera.
  get ready() {
    return this.camera !== null && this.size.width > 0;
  }

  getCamera() {
    return this.camera;
  }

  setCamera(cam) {
    this.camera = clampCamera(cam, this.size, this.layout.height);
    if (!this.frame) {
      // Many input events can arrive per frame; draw only once per frame.
      this.frame = requestAnimationFrame(() => {
        this.frame = 0;
        this.apply();
      });
    }
  }

  clampScale(scale) {
    const { min, max } = scaleLimits(this.size.width);
    return clamp(scale, min, max);
  }

  // --- Layout and size changes keep your place ----------------------------

  setLayout(layout, pageIds) {
    const anchor = this.ready ? this.getAnchor() : null;
    this.layout = layout;
    this.pageIds = pageIds;
    if (!this.ready) return;
    if (anchor) this.restoreAnchor(anchor);
    else this.fitWidth(0); // the notebook was empty until now
  }

  setSize(width, height) {
    const anchor = this.ready ? this.getAnchor() : null;
    this.size = { width, height };
    if (anchor) this.restoreAnchor(anchor);
  }

  // "Where am I": which page is at the top of the screen, how far into it,
  // and the zoom compared to fit-width. Saved per notebook, and used to keep
  // your place when the iPad rotates.
  getAnchor() {
    const { rects } = this.layout;
    const { x, y, scale } = this.camera;
    const top = -y / scale;
    const index = pageIndexAt(rects, top);
    if (index < 0) return null;
    const r = rects[index];
    return {
      pageId: this.pageIds[index],
      index,
      offset: (top - r.y) / r.h,
      zoom: scale / fitWidthScale(this.size.width),
      centerX: (this.size.width / 2 - x) / scale,
    };
  }

  restoreAnchor(anchor) {
    if (!this.size.width) return;
    const { rects } = this.layout;
    if (!rects.length || !anchor) {
      this.fitWidth(0);
      return;
    }
    let index = this.pageIds.indexOf(anchor.pageId);
    if (index < 0) index = clamp(anchor.index ?? 0, 0, rects.length - 1);
    const scale = this.clampScale((anchor.zoom ?? 1) * fitWidthScale(this.size.width));
    const r = rects[index];
    const top = r.y + (anchor.offset ?? 0) * r.h;
    const centerX = anchor.centerX ?? r.w / 2;
    this.setCamera({ scale, x: this.size.width / 2 - centerX * scale, y: -top * scale });
  }

  // --- Commands from the toolbar -------------------------------------------

  fitWidth(index = this.currentIndex) {
    if (!this.size.width) return;
    const r = this.layout.rects[index];
    const scale = fitWidthScale(this.size.width);
    const anchor = this.ready ? this.getAnchor() : null;
    if (anchor && anchor.index === index) {
      // Keep the same spot of the current page at the top.
      this.restoreAnchor({ ...anchor, zoom: 1, centerX: r.w / 2 });
    } else {
      this.setCamera({ scale, x: 0, y: r ? -(r.y - PAGE_GAP / 2) * scale : 0 });
    }
    this.settleSoon();
  }

  goToPage(index) {
    const r = this.layout.rects[index];
    if (!r || !this.ready) return;
    const cam = this.camera;
    this.setCamera({ ...cam, y: -(r.y - PAGE_GAP / 2) * cam.scale });
    this.settleSoon();
  }

  zoomBy(factor) {
    if (!this.ready) return;
    const cam = this.camera;
    const scale = this.clampScale(cam.scale * factor);
    this.setCamera(zoomAround(cam, this.size.width / 2, this.size.height / 2, scale));
    this.settleSoon();
  }

  scrollBy(dy) {
    if (!this.ready) return;
    const cam = this.camera;
    this.setCamera({ ...cam, y: cam.y - dy });
    this.settleSoon();
  }

  // Scrolls so that a rectangle of a page (fractions 0–1) is on screen,
  // centered if it wasn't fully visible. Keeps the zoom.
  showRegion(index, rect) {
    const r = this.layout.rects[index];
    if (!r || !this.ready) return;
    const view = this.visibleWorldRect();
    const left = r.x + rect.x * r.w;
    const top = r.y + rect.y * r.h;
    const right = left + rect.w * r.w;
    const bottom = top + rect.h * r.h;
    if (left >= view.left && right <= view.right && top >= view.top && bottom <= view.bottom) return;
    const { scale } = this.camera;
    this.setCamera({
      scale,
      x: this.size.width / 2 - ((left + right) / 2) * scale,
      y: this.size.height / 2 - ((top + bottom) / 2) * scale,
    });
    this.settleSoon();
  }

  // Scrolls to a page only if none of it is on screen.
  ensurePageVisible(index) {
    const r = this.layout.rects[index];
    if (!r || !this.ready) return;
    const view = this.visibleWorldRect();
    if (r.y + r.h < view.top || r.y > view.bottom) this.goToPage(index);
  }

  // --- Converting positions ------------------------------------------------

  /**
   * Screen point → position on a page, as fractions of the page (0–1).
   * With `index`, always measures on that page (values may be <0 or >1);
   * without, finds the page under the point (null if there is none).
   */
  clientToPage(clientX, clientY, index = null) {
    if (!this.ready) return null;
    const box = this.container.getBoundingClientRect();
    const { x, y, scale } = this.camera;
    const wx = (clientX - box.left - x) / scale;
    const wy = (clientY - box.top - y) / scale;
    const { rects } = this.layout;
    let i = index;
    if (i === null) {
      i = pageIndexAt(rects, wy);
      const r = rects[i];
      if (!r || wy < r.y || wy > r.y + r.h || wx < r.x || wx > r.x + r.w) return null;
    }
    const r = rects[i];
    return { index: i, pageId: this.pageIds[i], x: (wx - r.x) / r.w, y: (wy - r.y) / r.h, rect: r };
  }

  // A rectangle on a page (fractions) → where it is on screen (client px).
  pageRectToClient(index, rect) {
    const r = this.layout.rects[index];
    if (!r || !this.ready) return null;
    const box = this.container.getBoundingClientRect();
    const { x, y, scale } = this.camera;
    return {
      left: box.left + x + (r.x + rect.x * r.w) * scale,
      top: box.top + y + (r.y + rect.y * r.h) * scale,
      width: rect.w * r.w * scale,
      height: rect.h * r.h * scale,
    };
  }

  // Called after every frame the pages moved (used by popovers to follow).
  addFrameListener(callback) {
    this.frameListeners.add(callback);
    return () => this.frameListeners.delete(callback);
  }

  // --- Interaction state ---------------------------------------------------

  // While you are touching the screen the pages are moved as one GPU layer
  // (fast). When you stop, that hint is removed so the browser redraws
  // everything sharp at the new zoom.
  beginInteraction() {
    this.interacting = true;
    clearTimeout(this.settleTimer);
    this.world.style.willChange = 'transform';
  }

  endInteraction() {
    this.interacting = false;
    this.settleSoon();
  }

  settleSoon() {
    clearTimeout(this.settleTimer);
    this.settleTimer = setTimeout(() => this.settle(), SETTLE_MS);
  }

  settle() {
    if (this.interacting || !this.ready) return;
    this.world.style.willChange = 'auto';
    this.cb.onSettle?.(this.visibleWorldRect());
  }

  visibleWorldRect() {
    const { x, y, scale } = this.camera;
    return {
      scale,
      left: -x / scale,
      top: -y / scale,
      right: (this.size.width - x) / scale,
      bottom: (this.size.height - y) / scale,
    };
  }

  // --- Drawing one frame ---------------------------------------------------

  apply() {
    if (!this.ready) return;
    const { x, y, scale } = this.camera;
    this.world.style.transform = `translate(${x}px, ${y}px) scale(${scale})`;

    // Pages within ~1 screen above/below exist; the rest are removed to free memory.
    const view = this.visibleWorldRect();
    const buffer = (view.bottom - view.top) * 0.75;
    const [first, last] = pagesInRange(this.layout.rects, view.top - buffer, view.bottom + buffer);
    if (first !== this.range[0] || last !== this.range[1]) {
      this.range = [first, last];
      this.cb.onRange?.(first, last);
    }

    const current = pageIndexAt(this.layout.rects, view.top + (view.bottom - view.top) * 0.3);
    if (current !== this.currentIndex) {
      this.currentIndex = current;
      this.cb.onCurrentPage?.(current);
    }

    this.frameListeners.forEach((callback) => callback());
    if (!this.interacting) this.settleSoon();
  }
}
