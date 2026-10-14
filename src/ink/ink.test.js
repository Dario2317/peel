import { describe, expect, it } from 'vitest';
import { curvePath, simplify, smoothPoints, smoothWidthFor } from './ink.js';

describe('smoothing', () => {
  // A straight line with a zig-zag wobble.
  const wobbly = Array.from({ length: 60 }, (_, i) => [i, i % 2 ? 0.8 : -0.8, 0.5]);

  it('evens out the wobble', () => {
    const smooth = smoothPoints(wobbly, 3);
    const middle = smooth.slice(10, 50).map((p) => Math.abs(p[1]));
    expect(Math.max(...middle)).toBeLessThan(0.1);
  });

  it('keeps the ends where you drew them', () => {
    const smooth = smoothPoints(wobbly, 3);
    expect(smooth[0]).toEqual(wobbly[0]);
    expect(smooth[59]).toEqual(wobbly[59]);
  });

  it('leaves the line alone at zero', () => {
    expect(smoothPoints(wobbly, 0)).toBe(wobbly);
  });
});

describe('line strokes', () => {
  it('simplify drops points on a straight line, keeps the corners', () => {
    const line = [[0, 0], [1, 0], [2, 0], [3, 0], [3, 1], [3, 2]];
    expect(simplify(line, 0.01)).toEqual([[0, 0], [3, 0], [3, 2]]);
  });

  it('the curve goes exactly through the points', () => {
    const d = curvePath([[0, 0], [1, 0], [2, 0], [3, 0]]);
    expect(d.startsWith('M0.00,0.00C')).toBe(true);
    // Evenly spaced points on a line: control points at 1/3 and 2/3.
    expect(d).toContain('C0.00,0.00 0.67,0.00 1.00,0.00');
    expect(d).toContain('C1.33,0.00 1.67,0.00 2.00,0.00');
    expect(d.endsWith('3.00,0.00')).toBe(true);
  });

  it('smoothing follows the zoom: the same on screen', () => {
    expect(smoothWidthFor(0.5, 2)).toBeCloseTo(smoothWidthFor(0.5, 1) / 2);
    expect(smoothWidthFor(0, 1)).toBeGreaterThan(0); // a little even at 0
  });
});
