import { describe, expect, it } from 'vitest';
import { clampCamera, fitWidthScale, screenToWorld, worldToScreen, zoomAround } from './camera.js';
import { computeLayout, pageIndexAt, pagesInRange, PAGE_GAP, PAGE_WIDTH } from './layout.js';

describe('camera', () => {
  it('converts screen ↔ world both ways', () => {
    const cam = { x: 30, y: -500, scale: 0.8 };
    const w = screenToWorld(cam, 200, 300);
    const s = worldToScreen(cam, w.x, w.y);
    expect(s.x).toBeCloseTo(200);
    expect(s.y).toBeCloseTo(300);
  });

  it('zooming keeps the point under the fingers in place', () => {
    const cam = { x: 10, y: -1200, scale: 0.9 };
    const before = screenToWorld(cam, 400, 250);
    const zoomed = zoomAround(cam, 400, 250, 2.7);
    const after = screenToWorld(zoomed, 400, 250);
    expect(after.x).toBeCloseTo(before.x);
    expect(after.y).toBeCloseTo(before.y);
  });

  it('centers pages narrower than the screen', () => {
    const view = { width: 1000, height: 800 };
    const cam = clampCamera({ x: -300, y: 0, scale: 0.5 }, view, 10000);
    expect(cam.x).toBe((1000 - PAGE_WIDTH * 0.5) / 2);
  });

  it('cannot scroll past the first or last page', () => {
    const view = { width: 800, height: 600 };
    expect(clampCamera({ x: 0, y: 500, scale: 1 }, view, 5000).y).toBe(0);
    expect(clampCamera({ x: 0, y: -99999, scale: 1 }, view, 5000).y).toBe(600 - 5000);
  });

  it('fit width leaves a small margin', () => {
    expect(fitWidthScale(1032)).toBeCloseTo(1);
  });
});

describe('layout', () => {
  const page = (w, h, crop = { x: 0, y: 0, w: 1, h: 1 }) => ({ width: w, height: h, crop });

  it('stacks pages with gaps and respects the crop', () => {
    const { rects, height } = computeLayout([page(1000, 2000), page(500, 500, { x: 0, y: 0.1, w: 1, h: 0.5 })]);
    expect(rects[0]).toEqual({ x: 0, y: PAGE_GAP, w: PAGE_WIDTH, h: 2000 });
    expect(rects[1].y).toBe(PAGE_GAP * 2 + 2000);
    expect(rects[1].h).toBe(500); // half of a square page
    expect(height).toBe(PAGE_GAP * 3 + 2500);
  });

  it('finds pages in a range with binary search', () => {
    const { rects } = computeLayout(Array.from({ length: 100 }, () => page(1000, 1000)));
    expect(pagesInRange(rects, 0, 10)).toEqual([0, -1]); // only the gap above page 1
    expect(pagesInRange(rects, 0, 40)).toEqual([0, 0]);
    expect(pagesInRange(rects, 1500, 2500)).toEqual([1, 2]);
    expect(pageIndexAt(rects, 99999999)).toBe(99);
    expect(pageIndexAt(rects, 0)).toBe(0);
  });
});
