import { describe, expect, it } from 'vitest';
import { inkToUnits, unitsToInk } from './pageInk.js';
import { remapItemsForCrop, FULL_CROP } from '../utils/geometry.js';

describe('page ink', () => {
  it('converts between page units and fractions of the page', () => {
    const stroke = { id: 'a', tool: 'pen', color: '#000', size: 2.8, smooth: 0.5, pressure: false, points: [100, 400, 0.5, 900, 800, 0.5] };
    const saved = unitsToInk(stroke, 2000);
    expect(saved.type).toBe('ink');
    expect(saved.points.slice(0, 2)).toEqual([0.1, 0.2]);
    expect(saved.size).toBeCloseTo(0.0028);
    const back = inkToUnits(saved, 2000);
    expect(back.points).toEqual(stroke.points);
    expect(back.size).toBeCloseTo(2.8);
  });

  it('converts shapes too, and keeps them on the same spot when the crop changes', () => {
    const stroke = { id: 'o', tool: 'pen', color: '#000', size: 2, points: [], shape: { kind: 'ellipse', cx: 500, cy: 500, rx: 100, ry: 50 } };
    const saved = unitsToInk(stroke, 1000);
    expect(saved.shape).toEqual({ kind: 'ellipse', cx: 0.5, cy: 0.5, rx: 0.1, ry: 0.05 });
    const crop = { x: 0, y: 0.25, w: 1, h: 0.5 };
    const [moved] = remapItemsForCrop([saved], FULL_CROP, crop);
    expect(moved.shape.cy).toBeCloseTo(0.5); // 0.5 of the full page = middle of the cropped page
    expect(moved.shape.ry).toBeCloseTo(0.1); // the page got half as tall
  });
});
