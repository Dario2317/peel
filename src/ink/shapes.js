// Shape recognition: draw a shape and hold the Pencil still at the end, and
// it turns into a clean oval, rectangle, line or arrow (like Apple Notes).
// Plain functions, no React, so they can be tested.

const pointsOf = (flat) => {
  const pts = [];
  for (let i = 0; i < flat.length; i += 3) pts.push([flat[i], flat[i + 1]]);
  return pts;
};
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

function boundingBox(pts) {
  let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity;
  for (const [x, y] of pts) {
    left = Math.min(left, x);
    top = Math.min(top, y);
    right = Math.max(right, x);
    bottom = Math.max(bottom, y);
  }
  return { left, top, right, bottom, w: right - left, h: bottom - top };
}

function pathLength(pts) {
  let length = 0;
  for (let i = 1; i < pts.length; i++) length += dist(pts[i - 1], pts[i]);
  return length;
}

function distanceToSegment(p, a, b) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy;
  const t = len2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2)) : 0;
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

// Snap an angle to horizontal/vertical when it's within 6°.
function snapLine(a, b) {
  const angle = Math.atan2(b[1] - a[1], b[0] - a[0]);
  const step = Math.PI / 2;
  const nearest = Math.round(angle / step) * step;
  if (Math.abs(angle - nearest) > (6 * Math.PI) / 180) return b;
  const length = dist(a, b);
  return [a[0] + Math.cos(nearest) * length, a[1] + Math.sin(nearest) * length];
}

/**
 * Looks at a stroke's points ([x, y, p, …]) and returns a shape, or null:
 *   { kind: 'ellipse', cx, cy, rx, ry } | { kind: 'rect', x, y, w, h }
 *   { kind: 'line', x1, y1, x2, y2 }    | { kind: 'arrow', x1, y1, x2, y2 }
 */
export function recognizeShape(flatPoints) {
  const pts = pointsOf(flatPoints);
  if (pts.length < 6) return null;
  const box = boundingBox(pts);
  const diag = Math.hypot(box.w, box.h);
  if (diag < 24) return null;
  const start = pts[0];
  const end = pts[pts.length - 1];
  const length = pathLength(pts);

  // Closed shapes: the end comes back near the start.
  const gap = dist(start, end);
  if (gap < diag * 0.3 && length > diag * 1.6) {
    const cx = (box.left + box.right) / 2;
    const cy = (box.top + box.bottom) / 2;
    const a = box.w / 2 || 1;
    const b = box.h / 2 || 1;
    // How far each point is from a perfect ellipse in the same box.
    const ellipseError = pts.reduce((sum, [x, y]) => sum + Math.abs(Math.hypot((x - cx) / a, (y - cy) / b) - 1), 0) / pts.length;
    // How far each point is from the box's edges.
    const short = Math.min(box.w, box.h) || 1;
    const rectError = pts.reduce((sum, [x, y]) => {
      const dx = Math.min(Math.abs(x - box.left), Math.abs(x - box.right));
      const dy = Math.min(Math.abs(y - box.top), Math.abs(y - box.bottom));
      return sum + Math.min(dx, dy) / short;
    }, 0) / pts.length;
    // A rectangle has ink near its corners; an ellipse doesn't.
    const corners = [[box.left, box.top], [box.right, box.top], [box.right, box.bottom], [box.left, box.bottom]];
    const cornersHit = corners.filter((c) => pts.some((p) => dist(p, c) < short * 0.2)).length;

    if (cornersHit >= 3 && rectError < 0.1) {
      let { w, h } = box;
      if (Math.abs(w - h) / Math.max(w, h) < 0.1) w = h = (w + h) / 2; // almost square → square
      return { kind: 'rect', x: box.left, y: box.top, w, h };
    }
    if (ellipseError < 0.16) {
      let rx = a;
      let ry = b;
      if (Math.abs(rx - ry) / Math.max(rx, ry) < 0.1) rx = ry = (rx + ry) / 2; // almost round → circle
      return { kind: 'ellipse', cx, cy, rx, ry };
    }
    return null;
  }

  // Open shapes: a straight line, maybe with an arrow head at the end.
  let tipIndex = 0;
  pts.forEach((p, i) => {
    if (dist(start, p) > dist(start, pts[tipIndex])) tipIndex = i;
  });
  const tip = pts[tipIndex];
  const shaft = dist(start, tip);
  if (shaft < 30) return null;
  const straight = pts.slice(0, tipIndex + 1).every((p) => distanceToSegment(p, start, tip) < shaft * 0.08 + 4);
  if (!straight) return null;
  const tail = pts.slice(tipIndex);
  const tailLength = pathLength(tail);
  const [x2, y2] = snapLine(start, tip);
  if (tailLength < shaft * 0.08) return { kind: 'line', x1: start[0], y1: start[1], x2, y2 };
  if (tail.every((p) => dist(p, tip) < shaft * 0.45)) return { kind: 'arrow', x1: start[0], y1: start[1], x2, y2 };
  return null;
}

// The two short lines of an arrow head.
function arrowHead({ x1, y1, x2, y2 }, size) {
  const angle = Math.atan2(y2 - y1, x2 - x1);
  const length = Math.min(Math.max(Math.hypot(x2 - x1, y2 - y1) * 0.22, 12 + size * 2), 40 + size * 2);
  const spread = (28 * Math.PI) / 180;
  return [
    [x2 - Math.cos(angle - spread) * length, y2 - Math.sin(angle - spread) * length],
    [x2 - Math.cos(angle + spread) * length, y2 - Math.sin(angle + spread) * length],
  ];
}

// SVG path ("d") for a shape; drawn as an outline with the stroke's width.
export function shapePath(shape, size = 2) {
  switch (shape.kind) {
    case 'ellipse': {
      const { cx, cy, rx, ry } = shape;
      return `M${cx - rx},${cy}a${rx},${ry} 0 1,0 ${rx * 2},0a${rx},${ry} 0 1,0 ${-rx * 2},0Z`;
    }
    case 'rect':
      return `M${shape.x},${shape.y}H${shape.x + shape.w}V${shape.y + shape.h}H${shape.x}Z`;
    case 'arrow': {
      const [h1, h2] = arrowHead(shape, size);
      return `M${shape.x1},${shape.y1}L${shape.x2},${shape.y2}M${h1[0]},${h1[1]}L${shape.x2},${shape.y2}L${h2[0]},${h2[1]}`;
    }
    default:
      return `M${shape.x1},${shape.y1}L${shape.x2},${shape.y2}`;
  }
}

// Points along the shape (for the eraser, the lasso and the board size).
export function shapePoints(shape, size = 2) {
  const out = [];
  const add = (x, y) => out.push(Math.round(x * 10) / 10, Math.round(y * 10) / 10, 0.5);
  const segment = (a, b) => {
    const steps = Math.max(1, Math.ceil(dist(a, b) / 8));
    for (let i = 0; i <= steps; i++) add(a[0] + ((b[0] - a[0]) * i) / steps, a[1] + ((b[1] - a[1]) * i) / steps);
  };
  if (shape.kind === 'ellipse') {
    for (let i = 0; i <= 64; i++) {
      const t = (i / 64) * Math.PI * 2;
      add(shape.cx + Math.cos(t) * shape.rx, shape.cy + Math.sin(t) * shape.ry);
    }
  } else if (shape.kind === 'rect') {
    const { x, y, w, h } = shape;
    segment([x, y], [x + w, y]);
    segment([x + w, y], [x + w, y + h]);
    segment([x + w, y + h], [x, y + h]);
    segment([x, y + h], [x, y]);
  } else {
    segment([shape.x1, shape.y1], [shape.x2, shape.y2]);
    if (shape.kind === 'arrow') {
      const [h1, h2] = arrowHead(shape, size);
      segment(h1, [shape.x2, shape.y2]);
      segment([shape.x2, shape.y2], h2);
    }
  }
  return out;
}

// The same shape moved by (dx, dy).
export function moveShape(shape, dx, dy) {
  switch (shape.kind) {
    case 'ellipse':
      return { ...shape, cx: shape.cx + dx, cy: shape.cy + dy };
    case 'rect':
      return { ...shape, x: shape.x + dx, y: shape.y + dy };
    default:
      return { ...shape, x1: shape.x1 + dx, y1: shape.y1 + dy, x2: shape.x2 + dx, y2: shape.y2 + dy };
  }
}
