import { describe, expect, it } from 'vitest';
import { smoothPoints } from './ink.js';

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
