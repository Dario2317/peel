// Pointer handlers for drawing and erasing, used by the post-it board now
// and by the pages in milestone 3. They plug into input.js through
// routePointer: each returns { move(e), up(e), cancel() }.
import { eventPoints, hasRealPressure, predictedPoints, round1, strokeHit } from './ink.js';
import { newId } from '../utils/ids.js';

/**
 * Draws one stroke.
 *   style:   { tool, color, size }
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
  wet.draw(stroke, getCamera());

  return {
    move(ev) {
      for (const p of eventPoints(ev)) {
        const [px, py] = toWorld(p.clientX, p.clientY);
        stroke.points.push(round1(px), round1(py), p.pressure || 0.5);
      }
      const ahead = predictedPoints(ev).flatMap((p) => [...toWorld(p.clientX, p.clientY), p.pressure || 0.5]);
      wet.draw(stroke, getCamera(), ahead);
    },
    up() {
      wet.clear();
      stroke.pressure = hasRealPressure(stroke.points);
      onDone(stroke);
    },
    cancel() {
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
 */
export function eraseStrokes(e, { toWorld, radius, getStrokes, removeStrokes, onDone, onCancel }) {
  const erase = (clientX, clientY) => {
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
    up: onDone,
    cancel: onCancel,
  };
}
