// Pen strokes ("ink"). A stroke is stored as:
//   { id, tool: 'pen', color, size, smooth, sw, pressure: true|false,
//     points: [x, y, p, x, y, p, …] }
// (sw = how wide the smoothing is, in the same units as the points.)
// Without pressure (Apple Pencil USB-C, mouse, finger) a stroke is the same
// width all along: it's drawn as a smooth curve through the points with a
// round pen tip, crisp at any zoom and for tiny handwriting. With pressure,
// perfect-freehand turns the points into the outline of a stroke that gets
// thinner and thicker. Both are SVG paths (sharp at any zoom), or drawn on
// a canvas while you are still drawing.
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

// "Smooth" (0 = raw, 1 = very smooth) evens out the wobble of your hand by
// smoothing the drawn points themselves (see smoothPoints). perfect-freehand's
// own `smoothing` stays low: a high value makes it skip outline points, which
// turns curves into straight pieces (jagged lines).
const SMOOTH_WIDTH = 3.5; // units, at full smoothing (strokes saved before `sw`)
// How wide the smoothing is on screen: a bit even at 0 (it hides the tiny
// steps of the screen's pixel grid), up to about 3 px at full smoothing.
const SMOOTH_PX = 2.6;
const SMOOTH_MIN = 0.3;
const SIMPLIFY = 0.04; // units a simplified line may differ from the smoothed one

// The smoothing width (in units) for a stroke drawn at this zoom.
export function smoothWidthFor(smooth, scale) {
  return ((SMOOTH_MIN + (smooth ?? 0.5)) * SMOOTH_PX) / (scale || 1);
}

function sigmaOf(stroke) {
  return stroke.sw ?? (stroke.smooth ?? 0.5) * SMOOTH_WIDTH;
}

// Is it drawn as a line with a round tip (same width all along)?
export function isLineStroke(stroke) {
  return !stroke.pressure;
}

function strokeOptions(stroke, finished) {
  const smooth = stroke.smooth ?? 0.5;
  return {
    size: stroke.size,
    thinning: stroke.pressure ? 0.55 : 0, // no pressure → even width, like a fineliner
    smoothing: 0.25, // keep the outline detailed
    streamline: 0.05 + 0.3 * smooth, // steadier line, but keep up with fast strokes
    simulatePressure: false,
    last: finished,
  };
}

/**
 * Smooths a line without making it lag: every point becomes a weighted
 * average of its neighbors along the line (a Gaussian, `sigma` units wide).
 * Near the ends the window gets narrower, so the line starts and ends
 * exactly where you drew it.
 *   points: [[x, y, pressure], …]
 */
export function smoothPoints(points, sigma) {
  if (sigma < 0.05 || points.length < 3) return points;
  const dist = [0]; // distance along the line to each point
  for (let i = 1; i < points.length; i++) {
    dist.push(dist[i - 1] + Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]));
  }
  const total = dist[dist.length - 1];
  return points.map((p, i) => {
    const s = Math.min(sigma, dist[i] / 2, (total - dist[i]) / 2);
    if (s < 0.05) return p;
    let weights = 0;
    let x = 0;
    let y = 0;
    const add = (j) => {
      const w = Math.exp(-((dist[j] - dist[i]) ** 2) / (2 * s * s));
      weights += w;
      x += w * points[j][0];
      y += w * points[j][1];
    };
    for (let j = i; j >= 0 && dist[i] - dist[j] <= 3 * s; j--) add(j);
    for (let j = i + 1; j < points.length && dist[j] - dist[i] <= 3 * s; j++) add(j);
    return [x / weights, y / weights, p[2]];
  });
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
  const dot = points.length === 1 || isDot(points);
  if (isLineStroke(stroke)) {
    if (dot) return `M${f(points[0][0])},${f(points[0][1])}l0.01,0`; // the round tip makes it a dot
    return curvePath(simplify(smoothPoints(points, sigmaOf(stroke)), SIMPLIFY));
  }
  if (dot) {
    const [x, y] = points[0];
    const r = stroke.size / 2;
    return `M${x - r},${y}a${r},${r} 0 1,0 ${r * 2},0a${r},${r} 0 1,0 ${-r * 2},0`;
  }
  return outlineToPath(getStroke(smoothPoints(points, sigmaOf(stroke)), strokeOptions(stroke, finished)));
}

// The smoothed points of a stroke as it is being drawn (for the canvas).
export function liveLinePoints(stroke) {
  return smoothPoints(toPoints(stroke.points), sigmaOf(stroke));
}

const f = (v) => v.toFixed(2);

/**
 * A smooth curve through the points (centripetal Catmull-Rom, as cubic
 * Béziers). It passes exactly through every point and never overshoots or
 * makes little loops, even where the points are unevenly spaced.
 */
export function curvePath(points) {
  if (points.length === 1) return `M${f(points[0][0])},${f(points[0][1])}l0.01,0`;
  let d = `M${f(points[0][0])},${f(points[0][1])}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] ?? points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] ?? p2;
    const [c1, c2] = bezierControls(p0, p1, p2, p3);
    d += `C${f(c1[0])},${f(c1[1])} ${f(c2[0])},${f(c2[1])} ${f(p2[0])},${f(p2[1])}`;
  }
  return d;
}

// The two Bézier control points for the curve from p1 to p2 (p0 and p3 are
// the neighbors). From Yuksel et al., "Parameterization of Catmull-Rom curves".
function bezierControls(p0, p1, p2, p3) {
  const d1 = Math.sqrt(Math.hypot(p1[0] - p0[0], p1[1] - p0[1]));
  const d2 = Math.sqrt(Math.hypot(p2[0] - p1[0], p2[1] - p1[1]));
  const d3 = Math.sqrt(Math.hypot(p3[0] - p2[0], p3[1] - p2[1]));
  const control = (a, b, c, da, db) => [0, 1].map(
    (k) => (da * da * c[k] - db * db * a[k] + (2 * da * da + 3 * da * db + db * db) * b[k]) / (3 * da * (da + db)),
  );
  const c1 = d1 > 1e-6 && d2 > 1e-6 ? control(p0, p1, p2, d1, d2) : p1;
  const c2 = d3 > 1e-6 && d2 > 1e-6 ? control(p3, p2, p1, d3, d2) : p2;
  return [c1, c2];
}

/**
 * Fewer points, same line (Ramer–Douglas–Peucker): drops points that are
 * within `tolerance` of the line through their neighbors. Keeps saved
 * drawings small without changing how they look.
 */
export function simplify(points, tolerance) {
  if (points.length < 3) return points;
  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;
  const stack = [[0, points.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    let farthest = 0;
    let index = -1;
    for (let i = a + 1; i < b; i++) {
      const d = distanceToSegment(points[i][0], points[i][1], points[a][0], points[a][1], points[b][0], points[b][1]);
      if (d > farthest) {
        farthest = d;
        index = i;
      }
    }
    if (farthest > tolerance) {
      keep[index] = 1;
      stack.push([a, index], [index, b]);
    }
  }
  return points.filter((_, i) => keep[i]);
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
