import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { useHistoryState, useItem } from '../state/useAnnotations.js';
import { GestureController } from '../viewer/input.js';
import { markPencilSeen, pencil } from '../viewer/pencil.js';
import { zoomAround } from '../viewer/camera.js';
import { colorValue, POSTIT_COLORS } from '../overlay/looks.js';
import { InkLayer } from '../ink/InkLayer.jsx';
import { WetInk } from '../ink/WetInk.js';
import { strokeBox } from '../ink/ink.js';
import { drawStroke, eraseStrokes } from '../ink/drawHandlers.js';
import { DrawingToolbar } from '../ink/DrawingToolbar.jsx';
import { displayColor, PEN_COLORS } from '../ink/inkStyle.js';
import { strokeStyle, useInkTool } from '../ink/useInkTool.js';
import { useEditSession } from '../tools/useEditSession.js';
import { newId } from '../utils/ids.js';
import { clamp } from '../utils/platform.js';
import { CheckIcon, PaletteIcon, RedoIcon, TrashIcon, UndoIcon } from '../ui/icons.jsx';
import './board.css';

const GRID = 24; // distance between the dots, in board units
const ERASER_RADIUS_PX = 12;
const TEXT_SIZE = 20;
const MIN_SCALE = 0.25;
const MAX_SCALE = 6;
export const BOARD_BACKGROUNDS = [
  { id: 'white', label: 'White' },
  { id: 'black', label: 'Black' },
  { id: 'note', label: 'Note color' },
];

/**
 * An opened post-it: a full-screen dotted board, like Freeform.
 *   - Pencil (or mouse): draw, highlight, erase
 *   - fingers: scroll (with a fling) and pinch to zoom; two-finger tap = undo
 *   - Type: tap anywhere to write a text box there; tap a text to edit it,
 *     drag its handle to move it
 * The note stores: ink (strokes), texts [{ id, x, y, w, text, color, size }],
 * bg ('white' | 'black' | 'note') and view (where you were).
 */
export function NoteBoard({ store, pageId, itemId, editable, startTyping, onClose, onColorUsed }) {
  const item = useItem(store, pageId, itemId);
  const [ink, setInk] = useInkTool();
  const [typing, setTyping] = useState(Boolean(startTyping) && editable); // the Type tool
  const [editingId, setEditingId] = useState(null); // the text box being edited
  const [menu, setMenu] = useState(null); // 'look' | 'zoom' | null
  const [zoom, setZoom] = useState(100);
  const edit = useEditSession(store, pageId, itemId);
  const { canUndo, canRedo } = useHistoryState(store);

  const containerRef = useRef(null);
  const worldRef = useRef(null);
  const wetRef = useRef(null);
  const hoverRef = useRef(null);
  const textRefs = useRef(new Map()); // text box id -> <textarea>
  const editStart = useRef(new Map()); // text box id -> the box before editing (null if new)
  const engine = useRef(null);

  const bg = item?.bg ?? 'white';
  const dark = bg === 'black';

  // --- Text boxes -------------------------------------------------------------
  const note = () => store.getItem(pageId, itemId);
  const findBox = (id) => note()?.texts?.find((t) => t.id === id) ?? null;

  const setTexts = (texts, options) => {
    const current = note();
    if (current) store.change(pageId, current, { ...current, texts }, options);
  };

  // Record one undo step for a single text box: from `before` (null = it
  // didn't exist) to how it is now.
  const recordTextChange = (id, before) => {
    const current = note();
    if (!current) return;
    const texts = current.texts ?? [];
    const now = texts.find((t) => t.id === id) ?? null;
    if (JSON.stringify(before) === JSON.stringify(now)) return;
    let reverted;
    if (!before) reverted = texts.filter((t) => t.id !== id);
    else if (!now) reverted = [...texts, before];
    else reverted = texts.map((t) => (t.id === id ? before : t));
    store.pushHistory([{ pageId, before: { ...current, texts: reverted }, after: current }]);
  };

  // Start editing a text box. Focusing inside the tap itself is what makes
  // iPad show the keyboard (flushSync puts the text field on screen first).
  const beginEdit = (id) => {
    if (!editStart.current.has(id)) editStart.current.set(id, findBox(id));
    flushSync(() => {
      setTyping(true);
      setEditingId(id);
    });
    const field = textRefs.current.get(id);
    field?.focus();
    field?.setSelectionRange(field.value.length, field.value.length);
  };

  const endEdit = (id) => {
    setEditingId((current) => (current === id ? null : current));
    const box = findBox(id);
    if (box && !box.text.trim()) setTexts((note()?.texts ?? []).filter((t) => t.id !== id), { history: false });
    const before = editStart.current.has(id) ? editStart.current.get(id) : box;
    editStart.current.delete(id);
    recordTextChange(id, before);
  };

  const createText = (x, y) => {
    const id = newId('txt');
    const visibleRight = engine.current ? engine.current.visibleRight() : x + 400;
    const box = {
      id,
      x,
      y: y - TEXT_SIZE * 0.8, // the first line sits where you tapped
      w: clamp(visibleRight - x - 16, 120, 520),
      text: '',
      color: ink.penColor,
      size: TEXT_SIZE,
    };
    editStart.current.set(id, null);
    setTexts([...(note()?.texts ?? []), box], { history: false });
    beginEdit(id);
  };

  const latest = useRef();
  latest.current = {
    ink, typing, editable, dark, editingId, beginEdit, createText, findBox, recordTextChange, setTexts,
    isEditing: (id) => editStart.current.has(id),
  };

  // Older notes: their single text (and title) becomes a text box.
  useEffect(() => {
    if (!item) return;
    let text = item.text ?? '';
    if (item.title) text = text ? `${item.title}\n${text}` : item.title;
    if (!text) return;
    const box = { id: newId('txt'), x: 28, y: 32, w: 600, text, color: PEN_COLORS[0], size: TEXT_SIZE };
    store.change(pageId, item, { ...item, title: '', text: '', texts: [...(item.texts ?? []), box] }, { history: false });
  }, []);

  // --- The board engine (plain JS: camera, gestures, drawing) ----------------
  useLayoutEffect(() => {
    const container = containerRef.current;
    const world = worldRef.current;
    const wet = new WetInk(wetRef.current);
    let size = { width: container.clientWidth, height: container.clientHeight };
    wet.resize(size.width, size.height);
    let camera = note()?.view ?? { x: 0, y: 0, scale: 1 };
    let frame = 0;
    let zoomTimer = 0;

    // Everything on the board (+ the first screen), to limit scrolling.
    const contentBox = () => {
      const box = { left: 0, top: 0, right: size.width, bottom: size.height };
      const grow = (l, t, r, b) => {
        box.left = Math.min(box.left, l);
        box.top = Math.min(box.top, t);
        box.right = Math.max(box.right, r);
        box.bottom = Math.max(box.bottom, b);
      };
      const current = note();
      for (const s of current?.ink ?? []) {
        const b = strokeBox(s);
        grow(b.left, b.top, b.right, b.bottom);
      }
      for (const t of current?.texts ?? []) grow(t.x, t.y, t.x + t.w, t.y + t.size * 1.4 * (t.text.split('\n').length + 1));
      return box;
    };

    // How far you can scroll past what's on the board: lots of room below
    // (to keep writing), some to the sides and above. Drawing further out
    // makes the board bigger.
    const clampCamera = (cam) => {
      const s = cam.scale;
      const b = contentBox();
      const screenW = size.width / s;
      const screenH = size.height / s;
      const fit = (value, min, max) => (min > max ? (min + max) / 2 : clamp(value, min, max));
      return {
        scale: s,
        x: fit(cam.x, size.width - (b.right + screenW * 0.75) * s, -(b.left - screenW * 0.5) * s),
        y: fit(cam.y, size.height - (b.bottom + screenH * 1.5) * s, -(b.top - screenH * 0.5) * s),
      };
    };

    const apply = () => {
      const { x, y, scale } = camera;
      world.style.transform = `translate(${x}px, ${y}px) scale(${scale})`;
      // The dots are the background, so they go on forever.
      const step = GRID * scale;
      container.style.backgroundSize = `${step}px ${step}px`;
      container.style.backgroundPosition = `${x % step}px ${y % step}px`;
      clearTimeout(zoomTimer);
      zoomTimer = setTimeout(() => setZoom(Math.round(camera.scale * 100)), 120);
    };
    const setCamera = (cam) => {
      camera = clampCamera(cam);
      if (!frame) {
        frame = requestAnimationFrame(() => {
          frame = 0;
          apply();
        });
      }
    };
    camera = clampCamera(camera);
    apply();

    const toWorld = (clientX, clientY) => {
      const r = container.getBoundingClientRect();
      return [(clientX - r.left - camera.x) / camera.scale, (clientY - r.top - camera.y) / camera.scale];
    };

    // The dot that shows where the Pencil is (hover), or the eraser circle.
    const showCursor = (clientX, clientY) => {
      const dot = hoverRef.current;
      const { ink, typing, editable } = latest.current;
      if (clientX === null || !editable || typing) {
        dot.style.display = 'none';
        return;
      }
      const r = container.getBoundingClientRect();
      const eraser = ink.tool === 'eraser';
      const style = strokeStyle(ink);
      const diameter = eraser ? ERASER_RADIUS_PX * 2 : Math.max(4, style.size * camera.scale);
      dot.className = `hover-dot ${eraser ? 'eraser' : ''}`;
      dot.style.display = 'block';
      dot.style.width = dot.style.height = `${diameter}px`;
      dot.style.background = eraser ? '' : displayColor(style.color, latest.current.dark);
      dot.style.left = `${clientX - r.left}px`;
      dot.style.top = `${clientY - r.top}px`;
    };

    const routePointer = (e) => {
      const { ink, typing, editable } = latest.current;
      if (!editable) return 'navigate';

      // A text box's handle: drag to move it (with anything, it's a small target).
      const handle = e.target.closest?.('[data-text-handle]');
      if (handle) return dragText(e, handle.dataset.textHandle);

      if (typing) return 'navigate'; // taps create/edit text (see onTap)
      if (e.pointerType === 'touch' && pencil.seen) return 'navigate';

      const style = strokeStyle(ink);
      if (style) {
        wet.dark = latest.current.dark;
        return drawStroke(e, {
          style,
          toWorld,
          wet,
          getCamera: () => camera,
          onDone: (stroke) => {
            const current = note();
            if (current) store.change(pageId, current, { ...current, ink: [...(current.ink ?? []), stroke] });
          },
        });
      }
      const before = note();
      return eraseStrokes(e, {
        toWorld,
        radius: () => ERASER_RADIUS_PX / camera.scale,
        getStrokes: () => note()?.ink ?? [],
        removeStrokes: (ids) => {
          const current = note();
          store.change(pageId, current, { ...current, ink: current.ink.filter((s) => !ids.has(s.id)) }, { history: false });
        },
        onPoint: showCursor,
        onDone: () => {
          showCursor(null);
          const after = note();
          if (before && after && before !== after) store.pushHistory([{ pageId, before, after }]);
        },
        onCancel: () => {
          showCursor(null);
          store.change(pageId, note(), before, { history: false });
        },
      });
    };

    const dragText = (e, id) => {
      const start = latest.current.findBox(id);
      if (!start) return 'navigate';
      const [sx, sy] = toWorld(e.clientX, e.clientY);
      return {
        move(ev) {
          const [x, y] = toWorld(ev.clientX, ev.clientY);
          const texts = (note()?.texts ?? []).map((t) => (t.id === id ? { ...t, x: start.x + x - sx, y: start.y + y - sy } : t));
          latest.current.setTexts(texts, { history: false });
        },
        up() {
          // While the text is being edited, the whole edit (typing + moving)
          // becomes one undo step when you finish; otherwise the move is one.
          if (!latest.current.isEditing(id)) latest.current.recordTextChange(id, start);
        },
        cancel() {
          latest.current.setTexts((note()?.texts ?? []).map((t) => (t.id === id ? start : t)), { history: false });
        },
      };
    };

    const onTap = ({ x, y, target }) => {
      const { typing, editable } = latest.current;
      if (!editable) return;
      const textEl = target?.closest?.('[data-text-id]');
      if (textEl) {
        latest.current.beginEdit(textEl.dataset.textId); // edit an existing text
      } else if (latest.current.editingId) {
        document.activeElement?.blur(); // first tap outside: just stop editing
      } else if (typing) {
        const [wx, wy] = toWorld(x, y);
        latest.current.createText(wx, wy); // new text where you tapped
      }
    };

    const gestures = new GestureController(container, {
      getCamera: () => camera,
      setCamera,
      clampScale: (s) => clamp(s, MIN_SCALE, MAX_SCALE),
      onGestureStart: () => (world.style.willChange = 'transform'),
      onGestureEnd: () => (world.style.willChange = 'auto'),
      routePointer,
      onTap,
      onUndo: () => store.undo(),
      onRedo: () => store.redo(),
      onPencilSeen: markPencilSeen,
      onHover: (e) => showCursor(e ? e.clientX : null, e ? e.clientY : null),
    });

    const observer = new ResizeObserver(() => {
      size = { width: container.clientWidth, height: container.clientHeight };
      wet.resize(size.width, size.height);
      setCamera(camera);
    });
    observer.observe(container);

    const zoomTo = (scale) => setCamera(zoomAround(camera, size.width / 2, size.height / 2, clamp(scale, MIN_SCALE, MAX_SCALE)));
    engine.current = {
      zoomTo,
      // Zoom so everything on the board fits on the screen.
      fitAll: () => {
        const b = contentBox();
        const scale = clamp(Math.min(size.width / (b.right - b.left + 40), size.height / (b.bottom - b.top + 40)), MIN_SCALE, 2);
        setCamera({ scale, x: -(b.left - 20) * scale, y: -(b.top - 20) * scale });
      },
      visibleRight: () => (size.width - camera.x) / camera.scale,
      camera: () => camera,
      apply,
    };
    if (import.meta.env.DEV) window.__board = engine.current; // for debugging in the console

    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(zoomTimer);
      observer.disconnect();
      gestures.destroy();
      // Remember where you were on this board (not an undo step).
      const current = note();
      if (current && editable) store.change(pageId, current, { ...current, view: camera }, { history: false });
    };
  }, []);

  // Grow the text field being edited with its text.
  useLayoutEffect(() => {
    const field = editingId && textRefs.current.get(editingId);
    if (!field) return;
    field.style.height = 'auto';
    field.style.height = `${field.scrollHeight}px`;
  }, [editingId, item?.texts]);

  // Leaving the Type tool ends text editing.
  useEffect(() => {
    if (!typing && editingId) textRefs.current.get(editingId)?.blur();
  }, [typing]);

  if (!item) return null;
  const noteColor = colorValue(POSTIT_COLORS, item.color);
  const setBackground = (id) => edit.discrete({ bg: id });

  return (
    <div className={`note-board bg-${bg}`} style={{ '--note': noteColor }}>
      <header className="board-bar">
        <button className="button small" onClick={onClose}>
          <CheckIcon size={18} /> Done
        </button>
        <div className="spacer" />
        {editable && (
          <>
            <button className="icon-button" onClick={() => store.undo()} disabled={!canUndo} aria-label="Undo" title="Undo">
              <UndoIcon />
            </button>
            <button className="icon-button" onClick={() => store.redo()} disabled={!canRedo} aria-label="Redo" title="Redo">
              <RedoIcon />
            </button>
            <button
              className={`icon-button ${menu === 'look' ? 'on' : ''}`}
              onClick={() => setMenu(menu === 'look' ? null : 'look')}
              aria-label="Background and note color"
              title="Background and note color"
            >
              <PaletteIcon />
            </button>
            <button
              className="icon-button"
              onClick={() => {
                edit.remove();
                onClose();
              }}
              aria-label="Delete note"
              title="Delete note"
            >
              <TrashIcon />
            </button>
          </>
        )}
        {menu === 'look' && (
          <div className="board-menu look">
            <span className="menu-label">Background</span>
            <div className="bg-choices">
              {BOARD_BACKGROUNDS.map((b) => (
                <button
                  key={b.id}
                  className={`bg-choice bg-${b.id} ${bg === b.id ? 'on' : ''}`}
                  onClick={() => setBackground(b.id)}
                >
                  <span className="bg-swatch" />
                  {b.label}
                </button>
              ))}
            </div>
            <span className="menu-label">Note color</span>
            <div className="swatches">
              {POSTIT_COLORS.map((c) => (
                <button
                  key={c.id}
                  className={`swatch ${item.color === c.id ? 'on' : ''}`}
                  style={{ background: c.value }}
                  aria-label={`Note color ${c.id}`}
                  onClick={() => {
                    edit.discrete({ color: c.id });
                    onColorUsed?.(c.id);
                  }}
                />
              ))}
            </div>
          </div>
        )}
      </header>

      <div
        ref={containerRef}
        className={`board-surface ${editable && !typing ? 'drawing' : ''} ${typing ? 'typing' : ''}`}
        onPointerDown={() => menu && setMenu(null)}
      >
        <div ref={worldRef} className="board-world">
          <InkLayer strokes={item.ink ?? []} dark={dark} />
          {(item.texts ?? []).map((box) =>
            box.id === editingId && editable ? (
              <div key={box.id} className="board-textbox editing" style={{ left: box.x, top: box.y, width: box.w }}>
                <div className="text-handle" data-text-handle={box.id} title="Drag to move" />
                <textarea
                  ref={(el) => (el ? textRefs.current.set(box.id, el) : textRefs.current.delete(box.id))}
                  value={box.text}
                  rows={1}
                  style={{ color: displayColor(box.color, dark), fontSize: box.size }}
                  onChange={(e) =>
                    latest.current.setTexts(
                      (note()?.texts ?? []).map((t) => (t.id === box.id ? { ...t, text: e.target.value } : t)),
                      { history: false },
                    )
                  }
                  onBlur={() => endEdit(box.id)}
                />
              </div>
            ) : (
              <div
                key={box.id}
                className="board-textbox"
                data-text-id={box.id}
                style={{ left: box.x, top: box.y, width: box.w, color: displayColor(box.color, dark), fontSize: box.size }}
              >
                {box.text}
              </div>
            ),
          )}
        </div>
        <canvas ref={wetRef} className="wet-ink" />
        <div ref={hoverRef} className="hover-dot" style={{ display: 'none' }} />
      </div>

      <div className="board-zoom">
        {menu === 'zoom' && (
          <div className="board-menu zoom">
            <button onClick={() => { engine.current.zoomTo(1); setMenu(null); }}>100%</button>
            <button onClick={() => { engine.current.zoomTo(2); setMenu(null); }}>200%</button>
            <button onClick={() => { engine.current.fitAll(); setMenu(null); }}>Fit everything</button>
          </div>
        )}
        <button className="zoom-pill" onClick={() => setMenu(menu === 'zoom' ? null : 'zoom')} title="Zoom">
          {zoom}%
        </button>
      </div>

      {editable && (
        <div className="board-tools">
          <DrawingToolbar ink={ink} onInk={setInk} typing={typing} onTyping={setTyping} />
        </div>
      )}
    </div>
  );
}
