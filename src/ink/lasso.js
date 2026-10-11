// Lasso selection: which strokes and texts are inside a loop you drew, and
// moving them. Plain functions, so they can be tested.
import { moveShape, shapePoints } from './shapes.js';

// Is the point inside the polygon [[x, y], …]? (ray casting)
export function pointInPolygon(x, y, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/**
 * strokes: [{ id, points }], texts: [{ id, x, y, w, size, text }]
 * A stroke is selected when most of it (60%) is inside the loop; a text
 * when its middle is inside.
 */
export function selectInLasso(polygon, strokes, texts) {
  const strokeIds = new Set();
  for (const s of strokes) {
    let inside = 0;
    let total = 0;
    for (let i = 0; i < s.points.length; i += 3) {
      total++;
      if (pointInPolygon(s.points[i], s.points[i + 1], polygon)) inside++;
    }
    if (total && inside / total >= 0.6) strokeIds.add(s.id);
  }
  const textIds = new Set(
    texts.filter((t) => pointInPolygon(t.x + t.w / 2, t.y + textHeight(t) / 2, polygon)).map((t) => t.id),
  );
  return { strokeIds, textIds };
}

export function textHeight(t) {
  return t.size * 1.4 * Math.max(1, t.text.split('\n').length);
}

// A stroke moved by (dx, dy).
export function moveStroke(stroke, dx, dy) {
  const points = stroke.points.map((v, i) => (i % 3 === 0 ? v + dx : i % 3 === 1 ? v + dy : v));
  if (!stroke.shape) return { ...stroke, points };
  const shape = moveShape(stroke.shape, dx, dy);
  return { ...stroke, shape, points: shapePoints(shape, stroke.size) };
}
