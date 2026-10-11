// The camera says where the world (the stack of pages) appears on screen:
//   screenX = worldX * scale + x
//   screenY = worldY * scale + y
// These are plain functions with no React, so they are easy to test.
import { clamp } from '../utils/platform.js';
import { PAGE_WIDTH } from './layout.js';

export function screenToWorld(cam, sx, sy) {
  return { x: (sx - cam.x) / cam.scale, y: (sy - cam.y) / cam.scale };
}

export function worldToScreen(cam, wx, wy) {
  return { x: wx * cam.scale + cam.x, y: wy * cam.scale + cam.y };
}

// The zoom where a page exactly fills the screen width (minus a small margin).
export function fitWidthScale(viewWidth) {
  const margin = viewWidth < 600 ? 6 : 16;
  return Math.max(0.01, (viewWidth - margin * 2) / PAGE_WIDTH);
}

export function scaleLimits(viewWidth) {
  const fit = fitWidthScale(viewWidth);
  return { min: fit * 0.3, max: fit * 8 };
}

// Zoom to newScale while the world point under (sx, sy) stays in place.
export function zoomAround(cam, sx, sy, newScale) {
  const w = screenToWorld(cam, sx, sy);
  return { scale: newScale, x: sx - w.x * newScale, y: sy - w.y * newScale };
}

// Stops you from scrolling the pages away. If the pages are narrower than
// the screen they are centered; same for height.
export function clampCamera(cam, view, contentHeight) {
  let { x, y } = cam;
  const contentW = PAGE_WIDTH * cam.scale;
  x = contentW <= view.width ? (view.width - contentW) / 2 : clamp(x, view.width - contentW, 0);
  const contentH = contentHeight * cam.scale;
  y = contentH <= view.height ? (view.height - contentH) / 2 : clamp(y, view.height - contentH, 0);
  return { x, y, scale: cam.scale };
}
