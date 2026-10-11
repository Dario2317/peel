import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { GestureController } from '../viewer/input.js';
import { markPencilSeen, pencil } from '../viewer/pencil.js';
import { WetInk } from '../ink/WetInk.js';
import { strokeBox } from '../ink/ink.js';
import { clamp } from '../utils/platform.js';
import { BoardContent } from './BoardContent.jsx';
import { CloseIcon } from '../ui/icons.jsx';

const GRID = 24;
// How much bigger things look in the window (screen px per board unit).
const MIN_ZOOM = 1.25;
const MAX_ZOOM = 8;

/**
 * The zoom window (like GoodNotes): the bottom of the screen shows the box
 * on the board, magnified. Write big here and it lands small inside the box.
 * When your writing gets near the right edge the box moves on by itself;
 * ↵ goes to the start of the next line. − / + (or pinching with two
 * fingers) change how much it's magnified. One finger slides the box.
 *   zw: { x, y, w, h, lineStartX } the box, in board units
 *   makeHandler(e, { toWorld, wet, getCamera, onStroke }): the board's tools
 */
export function ZoomWindow({ note, dark, zw, onChange, makeHandler, onUndo, onRedo, onClose }) {
  const surfaceRef = useRef(null);
  const wetRef = useRef(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  // The box, updated right away while you drag (React state can lag a frame).
  const box = useRef(zw);
  useEffect(() => {
    box.current = zw;
  }, [zw]);
  const latest = useRef();
  latest.current = { onChange, makeHandler, onUndo, onRedo };
  const area = useRef({ width: 0, height: 0 });

  const move = (fields) => {
    box.current = { ...box.current, ...fields };
    latest.current.onChange(box.current);
  };

  // Change the magnification, keeping the box's top-left corner in place.
  const zoomBy = (factor) => {
    const { width, height } = area.current;
    if (!width) return;
    const zoom = clamp((width / box.current.w) * factor, MIN_ZOOM, MAX_ZOOM);
    const w = width / zoom;
    move({ w, h: (w * height) / width });
  };

  useLayoutEffect(() => {
    const surface = surfaceRef.current;
    const wet = new WetInk(wetRef.current);

    const getCamera = () => {
      const s = area.current.width / box.current.w;
      return { x: -box.current.x * s, y: -box.current.y * s, scale: s };
    };
    const toWorld = (clientX, clientY) => {
      const r = surface.getBoundingClientRect();
      const c = getCamera();
      return [(clientX - r.left - c.x) / c.scale, (clientY - r.top - c.y) / c.scale];
    };

    // Writing near the right edge: slide the box on.
    const onStroke = (stroke) => {
      const { x, w } = box.current;
      if (strokeBox(stroke).right > x + w * 0.78) move({ x: x + w * 0.55 });
    };

    const measure = () => {
      const width = surface.clientWidth;
      const height = surface.clientHeight;
      area.current = { width, height };
      setSize({ width, height });
      wet.resize(width, height);
      // Keep the box the same shape as the window.
      if (width) move({ h: (box.current.w * height) / width });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(surface);

    const gestures = new GestureController(surface, {
      getCamera,
      // Sliding (one finger) moves the box; pinching (two) changes the zoom.
      setCamera: (cam) => {
        const { width, height } = area.current;
        const w = width / cam.scale;
        move({ x: -cam.x / cam.scale, y: -cam.y / cam.scale, w, h: (w * height) / width });
      },
      clampScale: (s) => clamp(s, MIN_ZOOM, MAX_ZOOM),
      onGestureStart: () => {},
      onGestureEnd: () => {},
      routePointer: (e) => {
        if (e.pointerType === 'touch' && pencil.seen) return 'navigate';
        return latest.current.makeHandler(e, { toWorld, wet, getCamera, onStroke });
      },
      onTap: () => {},
      onUndo: () => latest.current.onUndo(),
      onRedo: () => latest.current.onRedo(),
      onPencilSeen: markPencilSeen,
    });

    return () => {
      observer.disconnect();
      gestures.destroy();
    };
  }, []);

  const scale = size.width ? size.width / zw.w : 1;
  const camera = { x: -zw.x * scale, y: -zw.y * scale, scale };
  const step = GRID * scale;

  return (
    <div className="zoom-window">
      <div
        ref={surfaceRef}
        className="zoom-surface"
        style={{ backgroundSize: `${step}px ${step}px`, backgroundPosition: `${camera.x % step}px ${camera.y % step}px` }}
      >
        <div className="board-world" style={{ transform: `translate(${camera.x}px, ${camera.y}px) scale(${scale})` }}>
          <BoardContent note={note} dark={dark} />
        </div>
        <canvas ref={wetRef} className="wet-ink" />
      </div>
      <div className="zoom-controls">
        <button onClick={() => zoomBy(1 / 1.25)} aria-label="Zoom out" title="Less zoom">−</button>
        <span className="zoom-level">{scale.toFixed(1)}×</span>
        <button onClick={() => zoomBy(1.25)} aria-label="Zoom in" title="More zoom">+</button>
        <span className="zoom-gap" />
        <button onClick={() => move({ x: box.current.x - box.current.w * 0.5 })} aria-label="Move left" title="Move left">←</button>
        <button onClick={() => move({ x: box.current.x + box.current.w * 0.5 })} aria-label="Move right" title="Move right">→</button>
        <button
          onClick={() => move({ x: box.current.lineStartX, y: box.current.y + box.current.h * 0.85 })}
          aria-label="Next line"
          title="Next line"
        >
          ↵
        </button>
        <button onClick={onClose} aria-label="Close zoom window" title="Close">
          <CloseIcon size={18} />
        </button>
      </div>
    </div>
  );
}
