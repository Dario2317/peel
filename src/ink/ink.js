// Pen strokes ("ink"). A stroke is stored as:
//   { id, tool: 'pen', color, size, pressure: true|false, points: [x, y, p, x, y, p, …] }
// perfect-freehand turns the points into the outline of a smooth stroke,
// which we draw as an SVG path (sharp at any zoom) or on a canvas (while
// you are still drawing it).
import { getStroke } from 'perfect-freehand';

// Apple Pencil (USB-C) has no pressure: the browser then reports the same
// value for every point. Only use pressure if it really changes.
export function hasRealPressure(flatPoints) {
  let min = Infinity;
  let max = -Infinity;
  for (let i = 2; i < flatPoints.length; i += 3) {
    min = Math.min(min, flatPoints[i]);
    max = Math.max(max, flatPoints[i]);
  }
  return max - min > 0.05;
}

function strokeOptions(stroke, finished) {
  return {
    size: stroke.size,
    thinning: stroke.pressure ? 0.55 : 0, // no pressure → even width, like a fineliner
    smoothing: 0.6,
    streamline: 0.4,
    simulatePressure: false,
    last: finished,
  };
}

function toPoints(flat) {
  const points = [];
  for (let i = 0; i < flat.length; i += 3) points.push([flat[i], flat[i + 1], flat[i + 2] || 0.5]);
  return points;
}

// SVG path for a stroke ("d" attribute). A single tap becomes a dot.
// Finished strokes never change, so their path is computed only once.
const paths = new WeakMap();
export function strokePath(stroke, finished = true) {
  if (finished && paths.has(stroke)) return paths.get(stroke);
  const d = computePath(stroke, finished);
  if (finished) paths.set(stroke, d);
  return d;
}

function computePath(stroke, finished) {
  const points = toPoints(stroke.points);
  if (points.length === 1 || isDot(points)) {
    const [x, y] = points[0];
    const r = stroke.size / 2;
    return `M${x - r},${y}a${r},${r} 0 1,0 ${r * 2},0a${r},${r} 0 1,0 ${-r * 2},0`;
  }
  return outlineToPath(getStroke(points, strokeOptions(stroke, finished)));
}

function isDot(points) {
  const [x0, y0] = points[0];
  return points.every(([x, y]) => Math.abs(x - x0) < 0.5 && Math.abs(y - y0) < 0.5);
}

// From the perfect-freehand README: outline points → smooth closed SVG path.
function outlineToPath(outline) {
  if (outline.length < 4) return '';
  const avg = (a, b) => ((a + b) / 2).toFixed(2);
  let [a, b] = outline;
  const c = outline[2];
  let d = `M${a[0].toFixed(2)},${a[1].toFixed(2)} Q${b[0].toFixed(2)},${b[1].toFixed(2)} ${avg(b[0], c[0])},${avg(b[1], c[1])} T`;
  for (let i = 2; i < outline.length - 1; i++) {
    a = outline[i];
    b = outline[i + 1];
    d += `${avg(a[0], b[0])},${avg(a[1], b[1])} `;
  }
  return d + 'Z';
}

// The bounding box of a stroke (cached, strokes never change).
const boxes = new WeakMap();
export function strokeBox(stroke) {
  let box = boxes.get(stroke);
  if (!box) {
    box = { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity };
    for (let i = 0; i < stroke.points.length; i += 3) {
      box.left = Math.min(box.left, stroke.points[i]);
      box.right = Math.max(box.right, stroke.points[i]);
      box.top = Math.min(box.top, stroke.points[i + 1]);
      box.bottom = Math.max(box.bottom, stroke.points[i + 1]);
    }
    boxes.set(stroke, box);
  }
  return box;
}

// Does a circle at (x, y) with this radius touch the stroke? (for the eraser)
export function strokeHit(stroke, x, y, radius) {
  const reach = radius + stroke.size / 2;
  const box = strokeBox(stroke);
  if (x < box.left - reach || x > box.right + reach || y < box.top - reach || y > box.bottom + reach) return false;
  const p = stroke.points;
  if (p.length <= 3) return Math.hypot(p[0] - x, p[1] - y) <= reach;
  for (let i = 0; i + 3 < p.length; i += 3) {
    if (distanceToSegment(x, y, p[i], p[i + 1], p[i + 3], p[i + 4]) <= reach) return true;
  }
  return false;
}

function distanceToSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSquared = dx * dx + dy * dy;
  const t = lengthSquared ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lengthSquared)) : 0;
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

// All the positions of a pointer move, including the in-between ones the
// browser grouped together (coalesced events, for smooth Pencil lines).
export function eventPoints(e) {
  const events = e.getCoalescedEvents?.() ?? [];
  return events.length ? events : [e];
}

// Where the browser expects the Pencil to go next (drawn but never saved),
// so the line keeps up with the tip.
export function predictedPoints(e) {
  return e.getPredictedEvents?.() ?? [];
}

export const round1 = (v) => Math.round(v * 10) / 10;
