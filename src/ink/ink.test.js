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

  it('keeps the ends close to where you drew them', () => {
    const smooth = smoothPoints(wobbly, 3);
    const first = smooth[0];
    const last = smooth[smooth.length - 1];
    expect(Math.hypot(first[0] - wobbly[0][0], first[1] - wobbly[0][1])).toBeLessThan(3);
    expect(Math.hypot(last[0] - wobbly[59][0], last[1] - wobbly[59][1])).toBeLessThan(3);
  });

  it('does not leave a knob when the Pencil rests before lifting', () => {
    const line = Array.from({ length: 30 }, (_, i) => [i * 2, 0, 0.5]);
    const rest = Array.from({ length: 12 }, (_, i) => [60 + (i % 2 ? 0.5 : -0.5), i % 3 ? 0.4 : -0.4, 0.5]);
    const smooth = smoothPoints([...line, ...rest], 2);
    const last = smooth[smooth.length - 1];
    expect(last[0]).toBeGreaterThan(57);
    expect(Math.abs(last[1])).toBeLessThan(0.5);
    // the resting points became one: nothing close to the end but the end itself
    const nearEnd = smooth.filter((p) => Math.hypot(p[0] - last[0], p[1] - last[1]) < 1);
    expect(nearEnd.length).toBe(1);
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
