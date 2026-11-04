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
// How far a simplified line may differ from the smoothed one, as a fraction of
// the smoothing width (so it stays invisible at any zoom).
const SIMPLIFY = 0.05;
// The smallest gap kept between points, as a fraction of the pen width: closer
// points only add the Pencil's jitter (see thinPoints).
const MIN_SPACING = 0.15;

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

// perfect-freehand is made for screen pixels and a pen about 16 px wide: some of
// its limits are fixed numbers (it drops the last 3 px of a line as noise, a
// first point gets a 1 px nudge, …). Our strokes are in page units, where a thin
// pen at high zoom is 0.6 wide: those 3 "px" are 5 pen widths, which made a
// straight spike at the end of the line. So it always gets a 16-wide pen: the
// points are scaled up for it and the outline is scaled back down.
const FREEHAND_SIZE = 16;

function strokeOptions(stroke, finished) {
  const smooth = stroke.smooth ?? 0.5;
  return {
    size: FREEHAND_SIZE,
    thinning: stroke.pressure ? 0.55 : 0, // no pressure → even width, like a fineliner
    smoothing: 0.25, // keep the outline detailed
    streamline: 0.05 + 0.3 * smooth, // steadier line, but keep up with fast strokes
    simulatePressure: false,
    last: finished,
  };
}

// When the Pencil slows down or stops (at the end of a stroke, in a corner),
// it reports many points almost on top of each other. Their jitter would
// stay in the line (the smoothing window is tiny there) and show as a blob
// or a little hook at the end. So points closer than this fraction of the
// smoothing width to the previous kept one are dropped. The first and last
// point always stay.
const THIN_FRACTION = 0.5;
export function thinPoints(points, minDist) {
  if (minDist <= 0 || points.length < 3) return points;
  points = collapseEnd(collapseEnd(points, minDist * 1.5).reverse(), minDist * 1.5).reverse();
  if (points.length < 3) return points;
  const out = [points[0]];
  for (let i = 1; i < points.length - 1; i++) {
    const last = out[out.length - 1];
    if (Math.hypot(points[i][0] - last[0], points[i][1] - last[1]) >= minDist) out.push(points[i]);
  }
  const end = points[points.length - 1];
  const last = out[out.length - 1];
  // A last point right next to the previous one replaces it (keeps where you lifted off).
  if (out.length > 1 && Math.hypot(end[0] - last[0], end[1] - last[1]) < minDist) out.pop();
  out.push(end);
  return out;
}

// The points at the very end that all lie within `radius` of the last one
// (the Pencil resting before it lifts) become one point, their average.
// Otherwise the last point's jitter makes a knob at the end of the line.
function collapseEnd(points, radius) {
  const end = points[points.length - 1];
  let start = points.length - 1;
  while (start > 0 && Math.hypot(points[start - 1][0] - end[0], points[start - 1][1] - end[1]) <= radius) start--;
  if (start >= points.length - 1 || start === 0) return points;
  let x = 0;
  let y = 0;
  let p = 0;
  for (let i = start; i < points.length; i++) {
    x += points[i][0];
    y += points[i][1];
    p += points[i][2];
  }
  const n = points.length - start;
  return [...points.slice(0, start), [x / n, y / n, p / n]];
}

/**
 * Smooths a line without making it lag: every point becomes a weighted
 * average of its neighbors along the line (a Gaussian, `sigma` units wide).
 * Near the ends the window gets narrower, so the line starts and ends
 * exactly where you drew it.
 *   points: [[x, y, pressure], …]
 */
export function smoothPoints(points, sigma, minSpacing = 0) {
  if (!(sigma > 0) || points.length < 3) return points;
  points = thinPoints(points, Math.max(sigma * THIN_FRACTION, minSpacing));
  if (points.length < 3) return points;
  const dist = [0]; // distance along the line to each point
  for (let i = 1; i < points.length; i++) {
    dist.push(dist[i - 1] + Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]));
  }
  const total = dist[dist.length - 1];
  return points.map((p, i) => {
    const s = Math.min(sigma, dist[i] / 2, (total - dist[i]) / 2);
    if (s < sigma * 1e-3) return p;
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
  }).map(smoothPressureAt(points, dist, sigma));
}

// The Pencil's pressure is noisy, and the outline of a pressure stroke gets
// thicker and thinner with it: raw values make bumpy edges. So pressure is
// averaged over a longer stretch of the line than the position is.
const PRESSURE_SIGMA = 3; // times the smoothing width
function smoothPressureAt(points, dist, sigma) {
  const ps = sigma * PRESSURE_SIGMA;
  return (smoothed, i) => {
    let weights = 0;
    let pressure = 0;
    const add = (j) => {
      const w = Math.exp(-((dist[j] - dist[i]) ** 2) / (2 * ps * ps));
      weights += w;
      pressure += w * points[j][2];
    };
    for (let j = i; j >= 0 && dist[i] - dist[j] <= 3 * ps; j--) add(j);
    for (let j = i + 1; j < points.length && dist[j] - dist[i] <= 3 * ps; j++) add(j);
    return [smoothed[0], smoothed[1], pressure / weights];
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

// The drawn points, cleaned up: jitter dropped, smoothed (see smoothPoints).
function cleanPoints(stroke, points) {
  return smoothPoints(points, sigmaOf(stroke), stroke.size * MIN_SPACING);
}

function computePath(stroke, finished) {
  const points = toPoints(stroke.points);
  const dot = points.length === 1 || isDot(points, stroke.size);
  if (isLineStroke(stroke)) {
    if (dot) return `M${f(points[0][0])},${f(points[0][1])}l0.001,0`; // the round tip makes it a dot
    return curvePath(simplify(cleanPoints(stroke, points), sigmaOf(stroke) * SIMPLIFY));
  }
  if (dot) {
    const [x, y] = points[0];
    const r = stroke.size / 2;
    return `M${x - r},${y}a${r},${r} 0 1,0 ${r * 2},0a${r},${r} 0 1,0 ${-r * 2},0`;
  }
  return outlineToPath(freehandOutline(cleanPoints(stroke, points), stroke, finished));
}

// perfect-freehand's outline, computed for a 16-wide pen (see FREEHAND_SIZE).
function freehandOutline(points, stroke, finished) {
  const k = FREEHAND_SIZE / stroke.size;
  const scaled = points.map(([x, y, p]) => [x * k, y * k, p]);
  return getStroke(scaled, strokeOptions(stroke, finished)).map(([x, y]) => [x / k, y / k]);
}

// The smoothed points of a stroke as it is being drawn (for the canvas).
export function liveLinePoints(stroke) {
  return cleanPoints(stroke, toPoints(stroke.points));
}

const f = (v) => v.toFixed(3); // 0.001 units: invisible even at the highest zoom

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

// A tap (all points within about half a pen width) is drawn as a dot.
function isDot(points, size) {
  const [x0, y0] = points[0];
  const r = Math.min(0.5, size * 0.4);
  return points.every(([x, y]) => Math.abs(x - x0) < r && Math.abs(y - y0) < r);
}

// From the perfect-freehand README: outline points → smooth closed SVG path.
function outlineToPath(outline) {
  if (outline.length < 4) return '';
  const avg = (a, b) => f((a + b) / 2);
  let [a, b] = outline;
  const c = outline[2];
  let d = `M${f(a[0])},${f(a[1])} Q${f(b[0])},${f(b[1])} ${avg(b[0], c[0])},${avg(b[1], c[1])} T`;
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

// Where the Pencil was, in page units. Rounded to 0.001: at 20x zoom that is
// 0.02 px. (Rounding to 0.1 made a staircase at high zoom: 1.6 px steps at 16x,
// bigger than the Pencil moves between two samples, which showed as hairy edges.)
export const roundUnit = (v) => Math.round(v * 1000) / 1000;
