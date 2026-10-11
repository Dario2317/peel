// Ink on book pages is saved relative to the page, like everything else
// (x as a fraction of the page width, y of the page height, sizes as a
// fraction of the width), so it never drifts when you zoom, rotate or crop.
// For drawing and hit-testing we need "page units" instead: the page is
// 1000 units wide and as tall as its shape (the same in x and y, which the
// pen engine needs). These helpers convert between the two.

const X_KEYS = ['x', 'x1', 'x2', 'cx', 'ax', 'vx', 'bx'];
const Y_KEYS = ['y', 'y1', 'y2', 'cy', 'ay', 'vy', 'by'];
const W_KEYS = ['w', 'rx', 'head']; // lengths measured with the width
const H_KEYS = ['h', 'ry'];

function convertShape(shape, sx, sy) {
  if (!shape) return shape;
  const out = { ...shape };
  for (const k of X_KEYS) if (k in out) out[k] *= sx;
  for (const k of Y_KEYS) if (k in out) out[k] *= sy;
  for (const k of W_KEYS) if (k in out) out[k] *= sx;
  for (const k of H_KEYS) if (k in out) out[k] *= sy;
  return out;
}

function convertPoints(points, sx, sy) {
  const out = new Array(points.length);
  for (let i = 0; i < points.length; i += 3) {
    out[i] = points[i] * sx;
    out[i + 1] = points[i + 1] * sy;
    out[i + 2] = points[i + 2];
  }
  return out;
}

// Saved ink item → stroke in page units. Cached: the same item on a page of
// the same height always gives the same object (so its drawing is cached too).
const cache = new WeakMap();
export function inkToUnits(item, pageHeight) {
  const hit = cache.get(item);
  if (hit && hit.pageHeight === pageHeight) return hit.stroke;
  const stroke = {
    ...item,
    size: item.size * 1000,
    points: convertPoints(item.points, 1000, pageHeight),
    shape: convertShape(item.shape, 1000, pageHeight),
  };
  cache.set(item, { pageHeight, stroke });
  return stroke;
}

// A stroke drawn in page units → the item to save.
export function unitsToInk(stroke, pageHeight) {
  const round = (v) => Math.round(v * 1e6) / 1e6;
  const { id, tool, color, smooth, pressure } = stroke;
  return {
    id,
    type: 'ink',
    tool,
    color,
    smooth,
    pressure,
    size: stroke.size / 1000,
    points: convertPoints(stroke.points, 1 / 1000, 1 / pageHeight).map(round),
    ...(stroke.shape ? { shape: convertShape(stroke.shape, 1 / 1000, 1 / pageHeight) } : {}),
  };
}
