// Pointer handlers for drawing, erasing and the lasso, used by the post-it
// boards now and by the pages in milestone 3. They plug into input.js
// through routePointer: each returns { move(e), up(e), cancel() }.
import { eventPoints, hasRealPressure, predictedPoints, round1, strokeHit } from './ink.js';
import { recognizeShape, shapePoints } from './shapes.js';
import { newId } from '../utils/ids.js';

const HOLD_MS = 550; // hold the Pencil still this long at the end → shape
const HOLD_SLOP_PX = 4; // a little wobble still counts as holding still

/**
 * Draws one stroke. If you hold still at the end of an oval, rectangle,
 * line or arrow, it snaps into a clean shape (like Apple Notes).
 *   style:   { tool, color, size, smooth }
 *   toWorld: (clientX, clientY) -> [x, y] in the surface's units
 *   wet:     a WetInk, and getCamera() for drawing it on screen
 *   onDone(stroke): save the finished stroke
 */
export function drawStroke(e, { style, toWorld, wet, getCamera, onDone }) {
  const [x, y] = toWorld(e.clientX, e.clientY);
  const stroke = {
    id: newId('ink'),
    ...style,
    pressure: false,
    points: [round1(x), round1(y), e.pressure || 0.5],
  };
  let shape = null;
  let holdTimer = 0;
  let still = { x: e.clientX, y: e.clientY };

  const snapped = () => ({ ...stroke, shape, points: shapePoints(shape, stroke.size) });
  const armHold = () => {
    clearTimeout(holdTimer);
    holdTimer = setTimeout(() => {
      shape = recognizeShape(stroke.points);
      if (shape) wet.draw(snapped(), getCamera());
    }, HOLD_MS);
  };
  wet.draw(stroke, getCamera());
  armHold();

  // Adds the positions of a pointer event (and the in-between ones).
  const addPoints = (ev) => {
    for (const p of eventPoints(ev)) {
      const [px, py] = toWorld(p.clientX, p.clientY);
      const n = stroke.points.length;
      if (round1(px) === stroke.points[n - 3] && round1(py) === stroke.points[n - 2]) continue; // same spot
      stroke.points.push(round1(px), round1(py), p.pressure || 0.5);
    }
  };

  return {
    move(ev) {
      if (shape) return; // snapped: lift the Pencil to keep the shape
      addPoints(ev);
      if (Math.hypot(ev.clientX - still.x, ev.clientY - still.y) > HOLD_SLOP_PX) {
        still = { x: ev.clientX, y: ev.clientY };
        armHold(); // moved: start counting the hold again
      }
      const ahead = predictedPoints(ev).flatMap((p) => [...toWorld(p.clientX, p.clientY), p.pressure || 0.5]);
      wet.draw(stroke, getCamera(), ahead);
    },
    up(ev) {
      clearTimeout(holdTimer);
      wet.clear();
      if (shape) {
        onDone(snapped());
        return;
      }
      // When you draw fast, the last bit of the line arrives with the
      // "lifted" event: keep it, or fast strokes end too early.
      if (ev) addPoints(ev);
      stroke.pressure = hasRealPressure(stroke.points);
      onDone(stroke);
    },
    cancel() {
      clearTimeout(holdTimer);
      wet.clear();
    },
  };
}

/**
 * Stroke eraser: every stroke the eraser touches disappears.
 *   radius:   eraser size in surface units
 *   getStrokes(), removeStrokes(ids): read / remove (live, not undoable)
 *   onDone(): make the whole erase one undo step
 *   onCancel(): put everything back
 *   onPoint(clientX, clientY): optional, called for every eraser position
 */
export function eraseStrokes(e, { toWorld, radius, getStrokes, removeStrokes, onDone, onCancel, onPoint }) {
  const erase = (clientX, clientY) => {
    onPoint?.(clientX, clientY);
    const [x, y] = toWorld(clientX, clientY);
    const r = radius();
    const hit = getStrokes().filter((s) => strokeHit(s, x, y, r));
    if (hit.length) removeStrokes(new Set(hit.map((s) => s.id)));
  };
  erase(e.clientX, e.clientY);
  return {
    move(ev) {
      for (const p of eventPoints(ev)) erase(p.clientX, p.clientY);
    },
    up(ev) {
      if (ev) erase(ev.clientX, ev.clientY);
      onDone();
    },
    cancel: onCancel,
  };
}

/**
 * Lasso: draw a loop around things to select them.
 *   onDone(polygon [[x, y], …] in world units)
 */
export function drawLasso(e, { toWorld, wet, getCamera, onDone }) {
  const points = [...toWorld(e.clientX, e.clientY)];
  return {
    move(ev) {
      for (const p of eventPoints(ev)) points.push(...toWorld(p.clientX, p.clientY));
      wet.drawLasso(points, getCamera());
    },
    up(ev) {
      if (ev) points.push(...toWorld(ev.clientX, ev.clientY));
      wet.clear();
      const polygon = [];
      for (let i = 0; i < points.length; i += 2) polygon.push([points[i], points[i + 1]]);
      onDone(polygon);
    },
    cancel() {
      wet.clear();
    },
  };
}

/**
 * Drag the lasso selection. onMove(dx, dy) shows it moved (cheap preview);
 * onDone(dx, dy) moves it for real (one undo step).
 */
export function dragSelection(e, { toWorld, onMove, onDone, onCancel }) {
  const [sx, sy] = toWorld(e.clientX, e.clientY);
  let delta = [0, 0];
  return {
    move(ev) {
      const [x, y] = toWorld(ev.clientX, ev.clientY);
      delta = [x - sx, y - sy];
      onMove(...delta);
    },
    up() {
      onDone(...delta);
    },
    cancel: onCancel,
  };
}
