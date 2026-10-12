// Decides what a press on the pages does in edit mode, and runs it:
//   - pen, marker, eraser, lasso: draw on the page (see pageDrawing.js)
//   - on a tape or post-it: drag it to move it (a tap opens it)
//   - on a tape's corner handle: resize the tape
//   - on a text box's handles: move it or change its width (fingers too)
//   - on the zoom window's box: drag it somewhere else (fingers too)
//   - with the tape tool on the page: drag to lay down a new tape
//   - with the text tool: a tap makes a text box (see onTap)
//   - anything else: pan/zoom (handled by input.js)
// Fingers only do this when no Apple Pencil has been used yet; otherwise
// fingers just pan, zoom and tap.
//
// Plain JavaScript (no React): it runs on every pointer event.
import { newId } from '../utils/ids.js';
import { clamp } from '../utils/platform.js';
import { pencil } from '../viewer/pencil.js';
import { NOTE_MARKER_PX } from '../overlay/looks.js';
import { pageDrawingHandler } from './pageDrawing.js';

const DRAG_SLOP = 4; // px the Pencil/mouse may move and still count as a tap
const DRAWING_TOOLS = new Set(['pen', 'highlighter', 'eraser', 'lasso']);
const MIN_TAPE = { width: 12, height: 6 }; // page units (a page is 1000 wide)
const MIN_TEXT_WIDTH = 40; // page units

/**
 * ctx: {
 *   getState() -> { mode, tool, tapeStyle, ink, lasso },
 *   getViewport(), store,
 *   drawing() -> what pageDrawing.js needs (viewport, wet ink, setLasso…),
 *   actions: { tapItem(pageId, itemId, pointerType), tapEmpty({ x, y, pointerType }),
 *              isEditingText(itemId), getZoomBox(), setZoomBox(box), zoomBoxMoved(box) }
 * }
 * Returns { routePointer(e), onTap(info) } for the Viewer.
 */
export function createToolRouter(ctx) {
  const { store } = ctx;

  function routePointer(e) {
    const { mode, tool } = ctx.getState();
    if (mode !== 'edit') return 'navigate';
    const viewport = ctx.getViewport();

    // A text box's handles are small targets you aim for: fingers work too.
    const grip = e.target.closest?.('[data-text-move]');
    if (grip) return dragItem(e, viewport, grip.dataset.pageId, grip.dataset.textMove, { tap: false });
    const widthHandle = e.target.closest?.('[data-text-width]');
    if (widthHandle) return resizeText(e, viewport, widthHandle.dataset.pageId, widthHandle.dataset.textWidth);
    if (e.target.closest?.('[data-zoom-handle]')) return dragZoomBox(e, viewport);

    if (e.pointerType === 'touch' && pencil.seen) return 'navigate';
    const itemEl = e.target.closest?.('[data-item-id]');

    // Pen, marker, eraser, lasso: draw on the page (tapping a post-it pin
    // with the pen or marker still opens it).
    if (DRAWING_TOOLS.has(tool)) {
      const pin = e.target.closest?.('.postit[data-item-id]');
      if (pin && (tool === 'pen' || tool === 'highlighter')) return tapOnly(e, pin.dataset.pageId, pin.dataset.itemId);
      return pageDrawingHandler(e, ctx.drawing());
    }

    if (itemEl) {
      const { pageId, itemId } = itemEl.dataset;
      const handle = e.target.closest('[data-handle]')?.dataset.handle;
      return handle ? resizeTape(e, viewport, pageId, itemId, handle) : dragItem(e, viewport, pageId, itemId);
    }
    if (tool === 'tape') {
      const hit = viewport.clientToPage(e.clientX, e.clientY);
      if (hit) return drawTape(e, viewport, hit);
    }
    return 'navigate';
  }

  // A tap (finger, or Pencil/mouse when they navigate).
  function onTap({ x, y, pointerType, target }) {
    const itemEl = target?.closest?.('[data-item-id]');
    if (itemEl) ctx.actions.tapItem(itemEl.dataset.pageId, itemEl.dataset.itemId, pointerType);
    else ctx.actions.tapEmpty({ x, y, pointerType });
  }

  // Only reacts to a tap (no drag): used for post-its with a drawing tool.
  function tapOnly(e, pageId, itemId) {
    const start = { x: e.clientX, y: e.clientY };
    let moved = false;
    return {
      move(ev) {
        if (Math.hypot(ev.clientX - start.x, ev.clientY - start.y) > DRAG_SLOP) moved = true;
      },
      up(ev) {
        if (!moved) ctx.actions.tapItem(pageId, itemId, ev.pointerType);
      },
      cancel() {},
    };
  }

  // Size of an item as fractions of the page. A post-it pin has a fixed
  // size on screen, so its size on the page depends on the zoom.
  function itemSize(item, rect, scale) {
    if (item.type === 'postit') return { w: NOTE_MARKER_PX / scale / rect.w, h: NOTE_MARKER_PX / scale / rect.h };
    return { w: item.w, h: item.h };
  }

  // Drag a tape, post-it or text box. A tap (no drag) opens it, unless
  // `tap` is false. Text boxes may go off the page (like ink); tapes and
  // post-its stay on it.
  function dragItem(e, viewport, pageId, itemId, { tap = true } = {}) {
    const original = store.getItem(pageId, itemId);
    const index = viewport.pageIds.indexOf(pageId);
    if (!original || index < 0) return 'navigate';
    const rect = viewport.layout.rects[index];
    const scale = viewport.getCamera().scale;
    const start = { x: e.clientX, y: e.clientY };
    const free = original.type === 'text';
    let current = original;
    let moved = false;

    return {
      move(ev) {
        const dx = ev.clientX - start.x;
        const dy = ev.clientY - start.y;
        if (!moved && Math.hypot(dx, dy) < DRAG_SLOP) return;
        moved = true;
        const { w, h } = itemSize(original, rect, scale);
        const x = original.x + dx / (rect.w * scale);
        const y = original.y + dy / (rect.h * scale);
        const next = { ...original, x: free ? x : clamp(x, 0, 1 - w), y: free ? y : clamp(y, 0, 1 - h) };
        store.change(pageId, current, next, { history: false });
        current = next;
      },
      up(ev) {
        if (!moved) {
          if (tap) ctx.actions.tapItem(pageId, itemId, ev.pointerType);
        } else if (!ctx.actions.isEditingText(itemId)) {
          // (While a text is being typed, the whole edit is one undo step.)
          store.pushHistory([{ pageId, before: original, after: current }]);
        }
      },
      cancel() {
        if (moved) store.change(pageId, current, original, { history: false });
      },
    };
  }

  function drawTape(e, viewport, hit) {
    const { index, pageId, rect } = hit;
    const start = { x: clamp(hit.x, 0, 1), y: clamp(hit.y, 0, 1) };
    const startClient = { x: e.clientX, y: e.clientY };
    const style = ctx.getState().tapeStyle;
    let draft = null;

    return {
      move(ev) {
        if (!draft && Math.hypot(ev.clientX - startClient.x, ev.clientY - startClient.y) < DRAG_SLOP) return;
        const p = viewport.clientToPage(ev.clientX, ev.clientY, index);
        const x = clamp(p.x, 0, 1);
        const y = clamp(p.y, 0, 1);
        const next = {
          id: draft?.id ?? newId('tape'),
          type: 'tape',
          x: Math.min(start.x, x),
          y: Math.min(start.y, y),
          w: Math.abs(x - start.x),
          h: Math.abs(y - start.y),
          color: style.color,
          pattern: style.pattern,
          question: '',
          seed: draft?.seed ?? Math.floor(Math.random() * 1e9),
          createdAt: draft?.createdAt ?? Date.now(),
          draft: true, // drawn see-through while dragging; never saved
        };
        store.change(pageId, draft, next, { history: false });
        draft = next;
      },
      up(ev) {
        if (!draft) {
          ctx.actions.tapEmpty({ x: ev.clientX, y: ev.clientY, pointerType: ev.pointerType });
          return;
        }
        if (draft.w * rect.w < MIN_TAPE.width || draft.h * rect.h < MIN_TAPE.height) {
          store.change(pageId, draft, null, { history: false }); // too small: a slip
          return;
        }
        const { draft: _, ...tape } = draft;
        store.change(pageId, draft, tape, { history: false });
        store.pushHistory([{ pageId, before: null, after: tape }]);
      },
      cancel() {
        if (draft) store.change(pageId, draft, null, { history: false });
      },
    };
  }

  function resizeTape(e, viewport, pageId, itemId, handle) {
    const original = store.getItem(pageId, itemId);
    const index = viewport.pageIds.indexOf(pageId);
    if (!original || index < 0) return 'navigate';
    const rect = viewport.layout.rects[index];
    const minW = MIN_TAPE.width / rect.w;
    const minH = MIN_TAPE.height / rect.h;
    let current = original;

    return {
      move(ev) {
        const p = viewport.clientToPage(ev.clientX, ev.clientY, index);
        let left = original.x;
        let top = original.y;
        let right = original.x + original.w;
        let bottom = original.y + original.h;
        if (handle.includes('w')) left = clamp(p.x, 0, right - minW);
        if (handle.includes('e')) right = clamp(p.x, left + minW, 1);
        if (handle.includes('n')) top = clamp(p.y, 0, bottom - minH);
        if (handle.includes('s')) bottom = clamp(p.y, top + minH, 1);
        const next = { ...original, x: left, y: top, w: right - left, h: bottom - top };
        store.change(pageId, current, next, { history: false });
        current = next;
      },
      up() {
        store.pushHistory([{ pageId, before: original, after: current }]);
      },
      cancel() {
        store.change(pageId, current, original, { history: false });
      },
    };
  }

  // Drag the zoom window's box (page units, like the page: 1000 wide).
  function dragZoomBox(e, viewport) {
    const start = ctx.actions.getZoomBox();
    if (!start) return 'navigate';
    const scale = viewport.getCamera().scale;
    const from = { x: e.clientX, y: e.clientY };
    let box = start;
    return {
      move(ev) {
        const x = start.x + (ev.clientX - from.x) / scale;
        box = { ...start, x, y: start.y + (ev.clientY - from.y) / scale, lineStartX: x };
        ctx.actions.setZoomBox(box);
      },
      up() {
        ctx.actions.zoomBoxMoved(box);
      },
      cancel() {
        ctx.actions.setZoomBox(start);
      },
    };
  }

  // Drag the right edge of a text box to change its width.
  function resizeText(e, viewport, pageId, itemId) {
    const original = store.getItem(pageId, itemId);
    const index = viewport.pageIds.indexOf(pageId);
    if (!original || index < 0) return 'navigate';
    const minW = MIN_TEXT_WIDTH / viewport.layout.rects[index].w;
    let current = original;

    return {
      move(ev) {
        const p = viewport.clientToPage(ev.clientX, ev.clientY, index);
        const next = { ...original, w: Math.max(minW, p.x - original.x) };
        store.change(pageId, current, next, { history: false });
        current = next;
      },
      up() {
        if (current !== original && !ctx.actions.isEditingText(itemId)) {
          store.pushHistory([{ pageId, before: original, after: current }]);
        }
      },
      cancel() {
        store.change(pageId, current, original, { history: false });
      },
    };
  }

  return { routePointer, onTap };
}
