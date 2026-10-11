import { describe, expect, it } from 'vitest';
import { remapItemsForCrop, FULL_CROP } from './geometry.js';

describe('remapItemsForCrop', () => {
  it('keeps a post-it on the same spot of the original page', () => {
    // On the full page the note is at (0.5, 0.5).
    const note = { type: 'postit', x: 0.5, y: 0.5, size: 0.06 };
    const crop = { x: 0, y: 0.1, w: 1, h: 0.8 }; // cut 10% top and bottom
    const [moved] = remapItemsForCrop([note], FULL_CROP, crop);
    expect(moved.x).toBeCloseTo(0.5);
    expect(moved.y).toBeCloseTo((0.5 - 0.1) / 0.8);
    expect(moved.size).toBeCloseTo(0.06); // width unchanged → size unchanged
  });

  it('scales sizes when the width changes, and round-trips', () => {
    const items = [
      { type: 'tape', x: 0.2, y: 0.3, w: 0.4, h: 0.05 },
      { type: 'text', x: 0.1, y: 0.1, w: 0.5, style: { fontSize: 0.02 } },
      { type: 'ink', size: 0.004, points: [0.1, 0.2, 0.5, 0.3, 0.4, 0.7] },
    ];
    const crop = { x: 0.1, y: 0.05, w: 0.8, h: 0.9 };
    const there = remapItemsForCrop(items, FULL_CROP, crop);
    expect(there[1].style.fontSize).toBeCloseTo(0.025);
    const back = remapItemsForCrop(there, crop, FULL_CROP);
    expect(back[0].x).toBeCloseTo(0.2);
    expect(back[0].h).toBeCloseTo(0.05);
    expect(back[2].points[3]).toBeCloseTo(0.3);
    expect(back[2].points[5]).toBe(0.7); // pressure untouched
  });
});
