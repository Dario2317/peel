import { describe, expect, it } from 'vitest';
import { moveStroke, pointInPolygon, selectInLasso } from './lasso.js';

const square = [[0, 0], [100, 0], [100, 100], [0, 100]];

describe('lasso', () => {
  it('knows what is inside a loop', () => {
    expect(pointInPolygon(50, 50, square)).toBe(true);
    expect(pointInPolygon(150, 50, square)).toBe(false);
  });

  it('selects strokes mostly inside and texts whose middle is inside', () => {
    const strokes = [
      { id: 'in', points: [10, 10, 0.5, 50, 50, 0.5, 90, 90, 0.5] },
      { id: 'half', points: [50, 50, 0.5, 150, 50, 0.5, 200, 50, 0.5] },
    ];
    const texts = [{ id: 't', x: 20, y: 20, w: 40, size: 20, text: 'hi' }];
    const { strokeIds, textIds } = selectInLasso(square, strokes, texts);
    expect([...strokeIds]).toEqual(['in']);
    expect([...textIds]).toEqual(['t']);
  });

  it('moves strokes and shapes', () => {
    expect(moveStroke({ points: [1, 2, 0.5] }, 10, 20).points).toEqual([11, 22, 0.5]);
    const moved = moveStroke({ size: 2, shape: { kind: 'rect', x: 0, y: 0, w: 10, h: 10 }, points: [] }, 5, 5);
    expect(moved.shape.x).toBe(5);
    expect(moved.points.length).toBeGreaterThan(0);
  });
});
