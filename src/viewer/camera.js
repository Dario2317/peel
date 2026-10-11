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

// Room around the pages to write in, like a desk (page units; a page is
// 1000 wide): beside the pages, and above the first / below the last one.
export const SIDE_ROOM = 750;
export const END_ROOM = 500;

// Stops you from scrolling the pages away: you can go past their edges into
// the room around them, but not further. If everything fits on the screen,
// the pages are centered.
export function clampCamera(cam, view, contentHeight) {
  return {
    x: clampAxis(cam.x, cam.scale, view.width, PAGE_WIDTH, SIDE_ROOM),
    y: clampAxis(cam.y, cam.scale, view.height, contentHeight, END_ROOM),
    scale: cam.scale,
  };
}

function clampAxis(position, scale, viewSize, contentSize, room) {
  const size = contentSize * scale;
  const roomPx = room * scale;
  if (size + roomPx * 2 <= viewSize) return (viewSize - size) / 2;
  return clamp(position, viewSize - size - roomPx, roomPx);
}

// Where the camera must be for the pages to be centered across the screen.
export function centeredX(viewWidth, scale) {
  return (viewWidth - PAGE_WIDTH * scale) / 2;
}
