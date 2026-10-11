import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { eventPoints, hasRealPressure, predictedPoints, round1, strokeBox, strokeHit, strokePath } from '../ink/ink.js';
import { markPencilSeen, pencil } from '../viewer/pencil.js';
import { newId } from '../utils/ids.js';

const PEN_SIZE = 2.6;
const ERASER_RADIUS = 10;

/**
 * The inside of an open post-it: you draw on it with the Pencil (real ink,
 * never turned into text), and can also type text with a keyboard.
 *   - Pencil or mouse: draw (or erase)
 *   - fingers: scroll the note (once a Pencil has been used); without a
 *     Pencil, one finger draws and two fingers scroll
 *   - typing: the text becomes a normal text field (keyboard, paste)
 * Positions in the note are in screen pixels from its top-left corner, so
 * making the note bigger just gives you more room.
 */
export function NoteSheet({ store, pageId, item, editable, pen, typing, onType, onTypingDone }) {
  const bodyRef = useRef(null);
  const sheetRef = useRef(null);
  const wetRef = useRef(null);
  const textRef = useRef(null);
  const [view, setView] = useState({ width: 0, height: 0 });
  const latest = useRef();
  latest.current = { pen, typing };

  const ink = item.ink ?? [];
  // The sheet grows as you write further down, so there's always room.
  const inkBottom = ink.reduce((bottom, s) => Math.max(bottom, strokeBox(s).bottom), 0);
  const sheetHeight = Math.max(view.height, inkBottom + 120);

  useLayoutEffect(() => {
    const body = bodyRef.current;
    const measure = () => setView({ width: body.clientWidth, height: body.clientHeight });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(body);
    return () => observer.disconnect();
  }, []);

  // The "wet ink" canvas shows the line while you draw it.
  useLayoutEffect(() => {
    const canvas = wetRef.current;
    if (!canvas || !view.width) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(view.width * dpr);
    canvas.height = Math.round(sheetHeight * dpr);
    canvas.getContext('2d').setTransform(dpr, 0, 0, dpr, 0, 0);
  }, [view.width, sheetHeight]);

  // Grow the text field with its text.
  useLayoutEffect(() => {
    const el = textRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [typing, item.text]);

  // Pen, eraser and scrolling: plain listeners, they run for every point.
  useEffect(() => {
    if (!editable) return;
    const body = bodyRef.current;
    let stroke = null; // the line being drawn
    let erasing = null; // { pointerId, before }
    let scroll = null; // { startY, startTop }
    let penDown = false;
    const fingers = new Map(); // pointerId -> clientY

    const local = (ev) => {
      const r = sheetRef.current.getBoundingClientRect();
      return [ev.clientX - r.left, ev.clientY - r.top];
    };
    const fingersY = () => [...fingers.values()].reduce((a, b) => a + b, 0) / fingers.size;
    const restartScroll = () => {
      scroll = fingers.size ? { startY: fingersY(), startTop: body.scrollTop } : null;
    };

    const drawWet = (extra = []) => {
      const canvas = wetRef.current;
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      if (!stroke) return;
      const shape = { ...stroke, points: [...stroke.points, ...extra] };
      ctx.fillStyle = shape.color;
      ctx.fill(new Path2D(strokePath(shape, false)));
    };

    const note = () => store.getItem(pageId, item.id);

    const erase = (x, y) => {
      const current = note();
      const hit = (current?.ink ?? []).filter((s) => strokeHit(s, x, y, ERASER_RADIUS));
      if (hit.length) store.change(pageId, current, { ...current, ink: current.ink.filter((s) => !hit.includes(s)) }, { history: false });
    };

    const cancelStroke = () => {
      stroke = null;
      drawWet();
    };

    const onDown = (e) => {
      if (latest.current.typing) return;
      if (e.pointerType === 'pen') {
        markPencilSeen();
        penDown = true;
        scroll = null; // a palm was scrolling: stop
      }
      if (e.pointerType === 'touch') {
        if (penDown) return; // palm while writing
        fingers.set(e.pointerId, e.clientY);
        if (pencil.seen || fingers.size >= 2) {
          if (stroke?.touch) cancelStroke(); // two fingers: it's a scroll
          restartScroll();
          return;
        }
      }
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      try {
        body.setPointerCapture(e.pointerId);
      } catch {
        // pointer already gone
      }
      const [x, y] = local(e);
      if (latest.current.pen.eraser) {
        erasing = { pointerId: e.pointerId, before: note() };
        erase(x, y);
        return;
      }
      stroke = {
        id: newId('ink'),
        tool: 'pen',
        color: latest.current.pen.color,
        size: PEN_SIZE,
        pressure: false,
        points: [round1(x), round1(y), e.pressure || 0.5],
        pointerId: e.pointerId,
        touch: e.pointerType === 'touch',
      };
      drawWet();
    };

    const onMove = (e) => {
      if (e.pointerType === 'touch' && fingers.has(e.pointerId)) fingers.set(e.pointerId, e.clientY);
      if (stroke && e.pointerId === stroke.pointerId) {
        for (const ev of eventPoints(e)) {
          const [x, y] = local(ev);
          stroke.points.push(round1(x), round1(y), ev.pressure || 0.5);
        }
        const ahead = predictedPoints(e).flatMap((ev) => [...local(ev), ev.pressure || 0.5]);
        drawWet(ahead);
      } else if (erasing && e.pointerId === erasing.pointerId) {
        for (const ev of eventPoints(e)) erase(...local(ev));
      } else if (scroll && fingers.has(e.pointerId)) {
        body.scrollTop = scroll.startTop - (fingersY() - scroll.startY);
      }
    };

    const onUp = (e) => {
      if (e.pointerType === 'pen') penDown = false;
      if (fingers.delete(e.pointerId)) restartScroll();
      if (stroke && e.pointerId === stroke.pointerId) {
        const { pointerId, touch, ...line } = stroke;
        cancelStroke();
        const current = note();
        if (e.type !== 'pointercancel' && current) {
          line.pressure = hasRealPressure(line.points);
          store.change(pageId, current, { ...current, ink: [...(current.ink ?? []), line] }); // one undo step
        }
      } else if (erasing && e.pointerId === erasing.pointerId) {
        const { before } = erasing;
        erasing = null;
        const after = note();
        if (before && after && before !== after) store.pushHistory([{ pageId, before, after }]);
      }
    };

    // Stop iPad Safari's own touch behavior (magnifier, menus) on the sheet.
    const onTouchStart = (e) => {
      if (!latest.current.typing) e.preventDefault();
    };

    body.addEventListener('pointerdown', onDown);
    body.addEventListener('pointermove', onMove);
    body.addEventListener('pointerup', onUp);
    body.addEventListener('pointercancel', onUp);
    body.addEventListener('touchstart', onTouchStart, { passive: false });
    return () => {
      body.removeEventListener('pointerdown', onDown);
      body.removeEventListener('pointermove', onMove);
      body.removeEventListener('pointerup', onUp);
      body.removeEventListener('pointercancel', onUp);
      body.removeEventListener('touchstart', onTouchStart);
    };
  }, [editable, store, pageId, item.id]);

  return (
    <div
      ref={bodyRef}
      className={`note-body ${editable && !typing ? 'drawing' : ''} ${pen?.eraser ? 'erasing' : ''}`}
    >
      <div ref={sheetRef} className="note-sheet" style={{ height: sheetHeight }}>
        {typing ? (
          <textarea
            ref={textRef}
            className="note-text editing"
            value={item.text}
            placeholder="Type here (or paste)…"
            autoFocus
            onChange={(e) => onType(e.target.value)}
            onBlur={onTypingDone}
          />
        ) : (
          item.text && <div className="note-text">{item.text}</div>
        )}
        <svg className="note-ink" width={view.width} height={sheetHeight} aria-hidden="true">
          {ink.map((s) => (
            <path key={s.id} d={strokePath(s)} fill={s.color} />
          ))}
        </svg>
        {editable && <canvas ref={wetRef} className="note-wet" style={{ width: view.width, height: sheetHeight }} />}
      </div>
    </div>
  );
}
