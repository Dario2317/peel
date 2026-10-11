// Drawing on the book pages: pen, marker, eraser and lasso. Ink is saved
// per page (relative to the page); while drawing we work in "page units"
// (the page is 1000 wide) so the pen engine sees round strokes.
import { drawLasso, drawStroke, dragSelection } from '../ink/drawHandlers.js';
import { eventPoints, strokeBox, strokeHit } from '../ink/ink.js';
import { moveStroke, pointInPolygon, selectInLasso } from '../ink/lasso.js';
import { inkToUnits, unitsToInk } from '../ink/pageInk.js';
import { arrowFromChevron, recognizeShape, shapePoints } from '../ink/shapes.js';
import { NOTE_MARKER_PX } from '../overlay/looks.js';

const ERASER_RADIUS_PX = 12;

/**
 * ctx: { store, viewport, wet, getState() -> { tool, ink, lasso }, showCursor,
 *        setLasso(lasso | null) }
 * Returns a pointer handler, or 'navigate'.
 */
export function pageDrawingHandler(e, ctx) {
  const { store, viewport, wet } = ctx;
  const { tool, ink, lasso } = ctx.getState();
  const hit = viewport.clientToNearestPage(e.clientX, e.clientY);
  if (!hit) return 'navigate';
  const { index, pageId, rect } = hit;

  // Screen point → page units on this page (also outside it: margins).
  const toUnits = (clientX, clientY) => {
    const p = viewport.clientToPage(clientX, clientY, index);
    return [p.x * rect.w, p.y * rect.h];
  };
  // Where this page's units are on screen (for the wet ink canvas).
  const pageCamera = () => {
    const c = viewport.getCamera();
    return { x: c.x + rect.x * c.scale, y: c.y + rect.y * c.scale, scale: c.scale };
  };
  const pageInk = () => store.getItems(pageId).filter((i) => i.type === 'ink');

  if (tool === 'pen' || tool === 'highlighter') {
    const style = tool === 'pen'
      ? { tool: 'pen', color: ink.penColor, size: ink.penSize, smooth: ink.smoothing }
      : { tool: 'highlighter', color: ink.highlightColor, size: ink.highlightSize, smooth: ink.smoothing };
    wet.dark = false;
    return drawStroke(e, {
      style,
      toWorld: toUnits,
      wet,
      getCamera: pageCamera,
      // A "V" on its own only snaps when it's an arrow head for a line.
      recognize: (points) => {
        const shape = recognizeShape(points);
        if (shape?.kind === 'chevron' && !arrowFromChevron(shape, pageInk().map((i) => inkToUnits(i, rect.h)))) return null;
        return shape;
      },
      onDone: (stroke) => addStroke(store, pageId, rect.h, stroke),
    });
  }

  if (tool === 'eraser') return erasePages(e, ctx);

  if (tool === 'lasso') {
    // Inside the current selection: drag it.
    if (lasso?.pageId === pageId && lasso.box) {
      const [x, y] = toUnits(e.clientX, e.clientY);
      const { box } = lasso;
      if (x >= box.left && x <= box.right && y >= box.top && y <= box.bottom) {
        return dragSelection(e, {
          toWorld: toUnits,
          onMove: (dx, dy) => ctx.setLasso({ ...lasso, dx, dy }),
          onDone: (dx, dy) => {
            moveSelection(store, pageId, rect.h, lasso.ids, dx, dy);
            ctx.setLasso({ ...lasso, dx: 0, dy: 0, box: shiftBox(box, dx, dy) });
          },
          onCancel: () => ctx.setLasso({ ...lasso, dx: 0, dy: 0 }),
        });
      }
    }
    ctx.setLasso(null);
    return drawLasso(e, {
      toWorld: toUnits,
      wet,
      getCamera: pageCamera,
      onDone: (polygon) => ctx.setLasso(selectOnPage(store, pageId, rect.h, polygon, viewport.getCamera().scale)),
    });
  }
  return 'navigate';
}

// Save a finished stroke. A "V" at the end of a line turns the line into an arrow.
function addStroke(store, pageId, pageHeight, stroke) {
  if (stroke.shape?.kind === 'chevron') {
    const items = store.getItems(pageId).filter((i) => i.type === 'ink');
    const head = arrowFromChevron(stroke.shape, items.map((i) => inkToUnits(i, pageHeight)));
    const target = head && items.find((i) => i.id === head.strokeId);
    if (target) {
      const units = inkToUnits(target, pageHeight);
      const arrow = { ...units, shape: head.shape, points: shapePoints(head.shape, units.size) };
      store.change(pageId, target, { ...target, ...unitsToInk(arrow, pageHeight) });
      return;
    }
  }
  store.change(pageId, null, unitsToInk(stroke, pageHeight));
}

// The eraser removes whole strokes it touches, on this page and its
// neighbors (ink can run past a page's edge). One undo step per erase.
function erasePages(e, ctx) {
  const { store, viewport } = ctx;
  const removed = []; // { pageId, item }

  const eraseAt = (clientX, clientY) => {
    ctx.showCursor(clientX, clientY);
    const hit = viewport.clientToNearestPage(clientX, clientY);
    if (!hit) return;
    const radius = ERASER_RADIUS_PX / viewport.getCamera().scale;
    for (const index of [hit.index - 1, hit.index, hit.index + 1]) {
      const rect = viewport.layout.rects[index];
      if (!rect) continue;
      const pageId = viewport.pageIds[index];
      const p = viewport.clientToPage(clientX, clientY, index);
      const x = p.x * rect.w;
      const y = p.y * rect.h;
      for (const item of store.getItems(pageId)) {
        if (item.type !== 'ink' || !strokeHit(inkToUnits(item, rect.h), x, y, radius)) continue;
        removed.push({ pageId, item });
        store.change(pageId, item, null, { history: false });
      }
    }
  };

  eraseAt(e.clientX, e.clientY);
  return {
    move(ev) {
      for (const p of eventPoints(ev)) eraseAt(p.clientX, p.clientY);
    },
    up(ev) {
      if (ev) eraseAt(ev.clientX, ev.clientY);
      ctx.showCursor(null);
      if (removed.length) store.pushHistory(removed.map(({ pageId, item }) => ({ pageId, before: item, after: null })));
    },
    cancel() {
      ctx.showCursor(null);
      for (const { pageId, item } of removed) store.change(pageId, null, item, { history: false });
    },
  };
}

// What the lasso loop catches on a page: ink mostly inside, tapes and
// post-its whose middle is inside. Returns the selection or null.
function selectOnPage(store, pageId, pageHeight, polygon, scale) {
  const items = store.getItems(pageId);
  const strokes = items.filter((i) => i.type === 'ink').map((i) => inkToUnits(i, pageHeight));
  const { strokeIds } = selectInLasso(polygon, strokes, []);
  const ids = new Set(strokeIds);
  const box = { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity };
  const grow = (l, t, r, b) => {
    box.left = Math.min(box.left, l);
    box.top = Math.min(box.top, t);
    box.right = Math.max(box.right, r);
    box.bottom = Math.max(box.bottom, b);
  };
  for (const s of strokes) {
    if (!ids.has(s.id)) continue;
    const b = strokeBox(s);
    grow(b.left - s.size, b.top - s.size, b.right + s.size, b.bottom + s.size);
  }
  for (const item of items) {
    if (item.type === 'tape') {
      const l = item.x * 1000;
      const t = item.y * pageHeight;
      const r = l + item.w * 1000;
      const b = t + item.h * pageHeight;
      if (pointInPolygon((l + r) / 2, (t + b) / 2, polygon)) {
        ids.add(item.id);
        grow(l, t, r, b);
      }
    } else if (item.type === 'postit') {
      const size = NOTE_MARKER_PX / scale; // pins have a fixed size on screen
      const l = item.x * 1000;
      const t = item.y * pageHeight;
      if (pointInPolygon(l + size / 2, t + size / 2, polygon)) {
        ids.add(item.id);
        grow(l, t, l + size, t + size);
      }
    }
  }
  return ids.size ? { pageId, ids, box, dx: 0, dy: 0 } : null;
}

// Move the selected things by (dx, dy) page units. One undo step.
function moveSelection(store, pageId, pageHeight, ids, dx, dy) {
  if (!dx && !dy) return;
  const changes = [];
  for (const item of store.getItems(pageId)) {
    if (!ids.has(item.id)) continue;
    let after;
    if (item.type === 'ink') {
      after = { ...item, ...unitsToInk(moveStroke(inkToUnits(item, pageHeight), dx, dy), pageHeight) };
    } else {
      after = { ...item, x: item.x + dx / 1000, y: item.y + dy / pageHeight };
    }
    changes.push({ pageId, before: item, after });
  }
  store.apply(changes);
}

// Delete the selected things. One undo step.
export function deleteSelection(store, lasso) {
  const changes = store
    .getItems(lasso.pageId)
    .filter((item) => lasso.ids.has(item.id))
    .map((item) => ({ pageId: lasso.pageId, before: item, after: null }));
  if (changes.length) store.apply(changes);
}

function shiftBox(box, dx, dy) {
  return { left: box.left + dx, top: box.top + dy, right: box.right + dx, bottom: box.bottom + dy };
}
