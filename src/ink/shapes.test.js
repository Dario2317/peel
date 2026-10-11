import { describe, expect, it } from 'vitest';
import { recognizeShape, shapePoints } from './shapes.js';

// Builds a flat [x, y, p, …] array from [x, y] pairs, with a bit of hand wobble.
const stroke = (pairs, wobble = 1.5) =>
  pairs.flatMap(([x, y], i) => [x + Math.sin(i * 1.7) * wobble, y + Math.cos(i * 2.3) * wobble, 0.5]);

const ellipse = (cx, cy, rx, ry, turns = 1.02) =>
  Array.from({ length: 60 }, (_, i) => {
    const t = (i / 59) * Math.PI * 2 * turns;
    return [cx + Math.cos(t) * rx, cy + Math.sin(t) * ry];
  });

const along = (points, stepsPerSide = 15) =>
  points.slice(1).flatMap((b, i) => {
    const a = points[i];
    return Array.from({ length: stepsPerSide }, (_, k) => [a[0] + ((b[0] - a[0]) * k) / stepsPerSide, a[1] + ((b[1] - a[1]) * k) / stepsPerSide]);
  });

describe('recognizeShape', () => {
  it('recognizes an oval', () => {
    const shape = recognizeShape(stroke(ellipse(200, 150, 120, 60)));
    expect(shape.kind).toBe('ellipse');
    expect(shape.rx).toBeGreaterThan(100);
  });

  it('turns an almost-circle into a circle', () => {
    const shape = recognizeShape(stroke(ellipse(100, 100, 80, 76)));
    expect(shape.kind).toBe('ellipse');
    expect(shape.rx).toBe(shape.ry);
  });

  it('recognizes a rectangle', () => {
    const corners = [[50, 50], [350, 50], [350, 200], [50, 200], [52, 55]];
    expect(recognizeShape(stroke(along(corners))).kind).toBe('rect');
  });

  it('recognizes a straight line and snaps it horizontal', () => {
    const shape = recognizeShape(stroke(along([[10, 100], [300, 104]], 40), 1));
    expect(shape.kind).toBe('line');
    expect(shape.y2).toBeCloseTo(shape.y1, 0);
  });

  it('recognizes an arrow (line, then a little hook at the end)', () => {
    const points = [...along([[10, 100], [300, 100]], 40), [285, 88], [270, 80], [285, 90], [300, 100], [285, 110], [272, 118]];
    expect(recognizeShape(stroke(points, 0.5)).kind).toBe('arrow');
  });

  it('leaves scribbles and handwriting alone', () => {
    const zigzag = Array.from({ length: 40 }, (_, i) => [i * 8, i % 2 ? 0 : 40]);
    expect(recognizeShape(stroke(zigzag))).toBe(null);
  });

  it('samples points along a shape for the eraser', () => {
    expect(shapePoints({ kind: 'rect', x: 0, y: 0, w: 80, h: 40 }).length).toBeGreaterThan(30);
  });
});
