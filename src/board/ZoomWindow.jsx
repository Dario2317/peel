import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { GestureController } from '../viewer/input.js';
import { markPencilSeen, pencil } from '../viewer/pencil.js';
import { WetInk } from '../ink/WetInk.js';
import { strokeBox } from '../ink/ink.js';
import { BoardContent } from './BoardContent.jsx';
import { CloseIcon } from '../ui/icons.jsx';

const GRID = 24;

/**
 * The zoom window (like GoodNotes): the bottom of the screen shows the box
 * on the board, magnified. Write big here and it lands small inside the box.
 * When your writing gets near the right edge the box moves on by itself;
 * ↵ goes to the start of the next line. Fingers slide the box around.
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

  const move = (fields) => {
    box.current = { ...box.current, ...fields };
    latest.current.onChange(box.current);
  };

  useLayoutEffect(() => {
    const surface = surfaceRef.current;
    const wet = new WetInk(wetRef.current);
    let width = 0;

    const getCamera = () => {
      const s = width / box.current.w;
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
      width = surface.clientWidth;
      const height = surface.clientHeight;
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
      setCamera: (cam) => move({ x: -cam.x / cam.scale, y: -cam.y / cam.scale }),
      clampScale: () => getCamera().scale, // no pinch-zoom inside the window
      onGestureStart: () => {},
      onGestureEnd: () => {},
      routePointer: (e) => {
        if (e.pointerType === 'touch' && pencil.seen) return 'navigate'; // fingers slide the box
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
