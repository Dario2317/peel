// Decides what a press on the pages does in edit mode, and runs it:
//   - on a tape or post-it: drag it to move it (a tap opens it)
//   - on a tape's corner handle: resize the tape
//   - with the tape tool on the page: drag to lay down a new tape
//   - anything else: pan/zoom (handled by input.js)
// Fingers only do this when no Apple Pencil has been used yet; otherwise
// fingers just pan, zoom and tap.
//
// Plain JavaScript (no React): it runs on every pointer event.
import { newId } from '../utils/ids.js';
import { clamp } from '../utils/platform.js';
import { pencil } from '../viewer/pencil.js';

const DRAG_SLOP = 4; // px the Pencil/mouse may move and still count as a tap
const MIN_TAPE = { width: 12, height: 6 }; // page units (a page is 1000 wide)

/**
 * ctx: {
 *   getState() -> { mode, tool, tapeStyle },
 *   getViewport(), store,
 *   actions: { tapItem(pageId, itemId, pointerType), tapEmpty({ x, y, pointerType }) }
 * }
 * Returns { routePointer(e), onTap(info) } for the Viewer.
 */
export function createToolRouter(ctx) {
  const { store } = ctx;

  function routePointer(e) {
    const { mode, tool } = ctx.getState();
    if (mode !== 'edit') return 'navigate';
    if (e.pointerType === 'touch' && pencil.seen) return 'navigate';

    const viewport = ctx.getViewport();
    const itemEl = e.target.closest?.('[data-item-id]');
    if (itemEl) {
      const { pageId, itemId } = itemEl.dataset;
      const handle = e.target.closest('[data-handle]')?.dataset.handle;
      if (!handle) return dragItem(e, viewport, pageId, itemId);
      return store.getItem(pageId, itemId)?.type === 'postit'
        ? resizeNote(viewport, pageId, itemId)
        : resizeTape(e, viewport, pageId, itemId, handle);
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

  // Size of an item as fractions of the page.
  function itemSize(item, rect) {
    if (item.type === 'postit') return { w: item.size, h: (item.size * rect.w) / rect.h };
    return { w: item.w, h: item.h };
  }

  function dragItem(e, viewport, pageId, itemId) {
    const original = store.getItem(pageId, itemId);
    const index = viewport.pageIds.indexOf(pageId);
    if (!original || index < 0) return 'navigate';
    const rect = viewport.layout.rects[index];
    const scale = viewport.getCamera().scale;
    const start = { x: e.clientX, y: e.clientY };
    let current = original;
    let moved = false;

    return {
      move(ev) {
        const dx = ev.clientX - start.x;
        const dy = ev.clientY - start.y;
        if (!moved && Math.hypot(dx, dy) < DRAG_SLOP) return;
        moved = true;
        const { w, h } = itemSize(original, rect);
        const next = {
          ...original,
          x: clamp(original.x + dx / (rect.w * scale), 0, 1 - w),
          y: clamp(original.y + dy / (rect.h * scale), 0, 1 - h),
        };
        store.change(pageId, current, next, { history: false });
        current = next;
      },
      up(ev) {
        if (!moved) ctx.actions.tapItem(pageId, itemId, ev.pointerType);
        else store.pushHistory([{ pageId, before: original, after: current }]);
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

  // A post-it stays square: its size follows the corner you drag.
  function resizeNote(viewport, pageId, itemId) {
    const original = store.getItem(pageId, itemId);
    const index = viewport.pageIds.indexOf(pageId);
    if (!original || index < 0) return 'navigate';
    const rect = viewport.layout.rects[index];
    const maxSize = Math.min(1 - original.x, ((1 - original.y) * rect.h) / rect.w, 0.35);
    let current = original;

    return {
      move(ev) {
        const p = viewport.clientToPage(ev.clientX, ev.clientY, index);
        const wanted = Math.max(p.x - original.x, ((p.y - original.y) * rect.h) / rect.w);
        const next = { ...original, size: clamp(wanted, 0.03, maxSize) };
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

  return { routePointer, onTap };
}
