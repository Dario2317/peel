import { useEffect, useLayoutEffect, useRef, useState } from 'react';
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
import { strokeStyle, useInkTool } from '../ink/useInkTool.js';
import { useEditSession } from '../tools/useEditSession.js';
import { clamp } from '../utils/platform.js';
import { CheckIcon, ExpandIcon, RedoIcon, TrashIcon, UndoIcon } from '../ui/icons.jsx';
import './board.css';

const LINE = 36; // distance between the ruled lines, in board units
const TEXT_LEFT = 28;
const ERASER_RADIUS_PX = 12;

/**
 * An opened post-it: a full-screen lined board, like Freeform.
 *   - Pencil (or mouse): draw, highlight, erase
 *   - fingers: scroll (with a fling) and pinch to zoom; two-finger tap = undo
 *   - Type: write text with the keyboard (or paste)
 * The board grows as you use it: you can always scroll a bit past what's
 * on it. In study mode it is read-only.
 */
export function NoteBoard({ store, pageId, itemId, editable, startTyping, onClose, onColorUsed }) {
  const item = useItem(store, pageId, itemId);
  const [ink, setInk] = useInkTool();
  const [typing, setTyping] = useState(Boolean(startTyping) && editable);
  const [showColors, setShowColors] = useState(false);
  const [textWidth, setTextWidth] = useState(600);
  const edit = useEditSession(store, pageId, itemId);
  const { canUndo, canRedo } = useHistoryState(store);

  const containerRef = useRef(null);
  const worldRef = useRef(null);
  const wetRef = useRef(null);
  const hoverRef = useRef(null);
  const textRef = useRef(null);
  const engine = useRef(null);
  const latest = useRef();
  latest.current = { ink, typing, editable, item, textWidth };

  // Notes made before the board existed: keep their title as the first line.
  useEffect(() => {
    if (item?.title) {
      const text = item.text ? `${item.title}\n${item.text}` : item.title;
      store.change(pageId, item, { ...item, title: '', text }, { history: false });
    }
  }, []);

  // --- The board engine (plain JS: camera, gestures, drawing) --------------
  useLayoutEffect(() => {
    const container = containerRef.current;
    const world = worldRef.current;
    const wet = new WetInk(wetRef.current);
    let size = { width: container.clientWidth, height: container.clientHeight };
    wet.resize(size.width, size.height);
    setTextWidth(Math.min(640, Math.max(260, size.width - TEXT_LEFT * 2)));

    let camera = latest.current.item?.view ?? { x: 0, y: 0, scale: 1 };
    let frame = 0;

    // Everything on the board (+ the first screen), to limit scrolling.
    const contentBox = () => {
      const box = { left: 0, top: 0, right: size.width, bottom: size.height };
      for (const s of latest.current.item?.ink ?? []) {
        const b = strokeBox(s);
        box.left = Math.min(box.left, b.left);
        box.top = Math.min(box.top, b.top);
        box.right = Math.max(box.right, b.right);
        box.bottom = Math.max(box.bottom, b.bottom);
      }
      const textEl = textRef.current;
      if (textEl) box.bottom = Math.max(box.bottom, textEl.offsetTop + textEl.offsetHeight);
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
      // Ruled lines: drawn on the background so they go on forever.
      const step = LINE * scale;
      container.style.backgroundSize = `100% ${step}px`;
      container.style.backgroundPosition = `0 ${y % step}px`;
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

    const note = () => store.getItem(pageId, itemId);

    const routePointer = (e) => {
      const { ink, typing, editable } = latest.current;
      if (!editable || typing) return 'navigate';
      if (e.pointerType === 'touch' && pencil.seen) return 'navigate';
      const style = strokeStyle(ink);
      if (style) {
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
        onDone: () => {
          const after = note();
          if (before && after && before !== after) store.pushHistory([{ pageId, before, after }]);
        },
        onCancel: () => store.change(pageId, note(), before, { history: false }),
      });
    };

    // Where the Pencil will land (only shows on iPads that support hover).
    const onHover = (e) => {
      const dot = hoverRef.current;
      const { ink, typing, editable } = latest.current;
      if (!e || !editable || typing) {
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
      dot.style.background = eraser ? '' : style.color;
      dot.style.transform = `translate(${e.clientX - r.left - diameter / 2}px, ${e.clientY - r.top - diameter / 2}px)`;
    };

    const gestures = new GestureController(container, {
      getCamera: () => camera,
      setCamera,
      clampScale: (s) => clamp(s, 0.3, 6),
      onGestureStart: () => (world.style.willChange = 'transform'),
      onGestureEnd: () => (world.style.willChange = 'auto'),
      routePointer,
      onTap: () => {},
      onUndo: () => store.undo(),
      onRedo: () => store.redo(),
      onPencilSeen: markPencilSeen,
      onHover,
    });

    const observer = new ResizeObserver(() => {
      size = { width: container.clientWidth, height: container.clientHeight };
      wet.resize(size.width, size.height);
      setCamera(camera);
    });
    observer.observe(container);

    engine.current = {
      fit: () => setCamera({ x: 0, y: 0, scale: 1 }),
      zoomBy: (f) => setCamera(zoomAround(camera, size.width / 2, size.height / 2, clamp(camera.scale * f, 0.3, 6))),
      camera: () => camera,
      apply,
    };
    if (import.meta.env.DEV) window.__board = engine.current; // for debugging in the console

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      gestures.destroy();
      // Remember where you were on this board (not an undo step).
      const current = note();
      if (current && editable) store.change(pageId, current, { ...current, view: camera }, { history: false });
    };
  }, []);

  // Grow the text field with its text.
  useLayoutEffect(() => {
    const el = textRef.current;
    if (!el || el.tagName !== 'TEXTAREA') return;
    el.style.height = 'auto';
    el.style.height = `${Math.ceil(el.scrollHeight / LINE) * LINE}px`;
  }, [typing, item?.text]);

  if (!item) return null;
  const noteColor = colorValue(POSTIT_COLORS, item.color);
  const textStyle = { left: TEXT_LEFT, width: textWidth };

  return (
    <div className="note-board" style={{ '--note': noteColor }}>
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
          </>
        )}
        <button className="icon-button" onClick={() => engine.current?.fit()} aria-label="Back to the start" title="Back to the start">
          <ExpandIcon />
        </button>
        {editable && (
          <>
            <button
              className="swatch board-color"
              style={{ background: noteColor }}
              onClick={() => setShowColors(!showColors)}
              aria-label="Note color"
              title="Note color"
            />
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
        {showColors && (
          <div className="board-colors">
            {POSTIT_COLORS.map((c) => (
              <button
                key={c.id}
                className={`swatch ${item.color === c.id ? 'on' : ''}`}
                style={{ background: c.value }}
                aria-label={`Note color ${c.id}`}
                onClick={() => {
                  edit.discrete({ color: c.id });
                  onColorUsed?.(c.id);
                  setShowColors(false);
                }}
              />
            ))}
          </div>
        )}
      </header>

      <div ref={containerRef} className={`board-surface ${editable && !typing ? 'drawing' : ''}`}>
        <div ref={worldRef} className="board-world">
          {typing ? (
            <textarea
              ref={textRef}
              className="board-text editing"
              style={textStyle}
              value={item.text}
              placeholder="Type here, or paste…"
              autoFocus
              onChange={(e) => edit.typing({ text: e.target.value })}
              onBlur={edit.commit}
            />
          ) : (
            item.text && (
              <div ref={textRef} className="board-text" style={textStyle}>
                {item.text}
              </div>
            )
          )}
          <InkLayer strokes={item.ink ?? []} />
        </div>
        <canvas ref={wetRef} className="wet-ink" />
        <div ref={hoverRef} className="hover-dot" style={{ display: 'none' }} />
      </div>

      {editable && (
        <div className="board-tools">
          <DrawingToolbar ink={ink} onInk={setInk} typing={typing} onTyping={setTyping} />
        </div>
      )}
    </div>
  );
}
