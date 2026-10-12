import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { GestureController } from './input.js';
import { markPencilSeen, pencil } from './pencil.js';
import { PageView } from './PageView.jsx';
import { PAGE_WIDTH } from './layout.js';
import { WetInk } from '../ink/WetInk.js';
import { strokeBox } from '../ink/ink.js';
import { pageDrawingHandler } from '../tools/pageDrawing.js';
import { clamp } from '../utils/platform.js';
import { CloseIcon } from '../ui/icons.jsx';
import '../board/board.css';

// How much bigger the page looks in the window (screen px per page unit).
const MIN_ZOOM = 1.25;
const MAX_ZOOM = 8;
const SETTLE_MS = 200;
const DRAWING_TOOLS = new Set(['pen', 'highlighter', 'eraser', 'lasso']);

/**
 * The zoom window on the pages (like GoodNotes): the panel under the pages
 * shows the box on a page, magnified. Write big here with the pen, marker,
 * eraser or lasso and it lands small inside the box. When your writing gets
 * near the right edge the box moves on by itself; ↵ goes to the start of the
 * next line. − / + (or pinching) change the magnification; one finger (or
 * the Pencil with the Move tool) slides the box.
 *   page, pageHeight: the page the box is on (page units: 1000 wide)
 *   box:      { pageId, x, y, w, h, lineStartX } in page units
 *   onChange(box), onMoved(box): while / after moving it (onMoved may move
 *             the box to the next page when it runs past this one)
 *   overlay:  what to draw on the page (like the main view, without editing)
 *   drawing():  what pageDrawing.js needs (store, getState, setLasso)
 */
export function PageZoomWindow({ page, pageHeight, box, onChange, onMoved, overlay, drawing, onUndo, onRedo, onClose }) {
  const surfaceRef = useRef(null);
  const wetRef = useRef(null);
  const [width, setWidth] = useState(0);
  const [view, setView] = useState(null); // settled: the PDF is drawn sharp for it
  // The box, updated right away while you write or drag (state can lag a frame).
  const current = useRef(box);
  useEffect(() => {
    current.current = box;
  }, [box]);
  const latest = useRef();
  latest.current = { onChange, onMoved, drawing, onUndo, onRedo, page, pageHeight };
  const area = useRef({ width: 0, height: 0 });

  const move = (fields, done = false) => {
    current.current = { ...current.current, ...fields };
    latest.current.onChange(current.current);
    if (done) latest.current.onMoved(current.current);
  };

  // Change the magnification, keeping the box's top-left corner in place.
  const zoomBy = (factor) => {
    const { width: w0, height: h0 } = area.current;
    if (!w0) return;
    const zoom = clamp((w0 / current.current.w) * factor, MIN_ZOOM, MAX_ZOOM);
    const w = w0 / zoom;
    move({ w, h: (w * h0) / w0 }, true);
  };

  useLayoutEffect(() => {
    const surface = surfaceRef.current;
    const wet = new WetInk(wetRef.current);

    // The page sits at (0, 0) in this window's world, in page units.
    const getCamera = () => {
      const s = area.current.width / current.current.w;
      return { x: -current.current.x * s, y: -current.current.y * s, scale: s };
    };
    const pageRect = () => ({ x: 0, y: 0, w: PAGE_WIDTH, h: latest.current.pageHeight });
    // A tiny "viewport" with just this page, for pageDrawing.js.
    const viewport = {
      layout: { get rects() { return [pageRect()]; } },
      get pageIds() { return [latest.current.page.id]; },
      getCamera,
      clientToPage(clientX, clientY) {
        const r = surface.getBoundingClientRect();
        const c = getCamera();
        const rect = pageRect();
        const wx = (clientX - r.left - c.x) / c.scale;
        const wy = (clientY - r.top - c.y) / c.scale;
        return { index: 0, pageId: latest.current.page.id, x: wx / rect.w, y: wy / rect.h, rect };
      },
      clientToNearestPage(clientX, clientY) {
        return this.clientToPage(clientX, clientY);
      },
    };

    // Writing near the right edge: slide the box on.
    const onStroke = (stroke) => {
      const { x, w } = current.current;
      if (strokeBox(stroke).right > x + w * 0.78) move({ x: x + w * 0.55 }, true);
    };

    const measure = () => {
      const w = surface.clientWidth;
      const h = surface.clientHeight;
      area.current = { width: w, height: h };
      setWidth(w);
      wet.resize(w, h);
      // Keep the box the same shape as the window.
      if (w) move({ h: (current.current.w * h) / w });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(surface);

    const gestures = new GestureController(surface, {
      getCamera,
      // Sliding (one finger) moves the box; pinching (two) changes the zoom.
      setCamera: (cam) => {
        const { width: w0, height: h0 } = area.current;
        const w = w0 / cam.scale;
        move({ x: -cam.x / cam.scale, y: -cam.y / cam.scale, w, h: (w * h0) / w0, lineStartX: -cam.x / cam.scale });
      },
      clampScale: (s) => clamp(s, MIN_ZOOM, MAX_ZOOM),
      onGestureStart: () => {},
      onGestureEnd: () => latest.current.onMoved(current.current),
      routePointer: (e) => {
        if (e.pointerType === 'touch' && pencil.seen) return 'navigate';
        const ctx = latest.current.drawing();
        if (!DRAWING_TOOLS.has(ctx.getState().tool)) return 'navigate';
        return pageDrawingHandler(e, { ...ctx, viewport, wet, showCursor: () => {}, onStroke });
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

  // Once the box stops moving, draw the page sharp at this magnification.
  const scale = width ? width / box.w : 1;
  useEffect(() => {
    const timer = setTimeout(
      () => setView({ left: box.x, top: box.y, right: box.x + box.w, bottom: box.y + box.h, scale }),
      SETTLE_MS,
    );
    return () => clearTimeout(timer);
  }, [box.x, box.y, box.w, box.h, scale]);

  const camera = { x: -box.x * scale, y: -box.y * scale };

  return (
    <div className="page-zoom-window">
      <div ref={surfaceRef} className="page-zoom-surface">
        <div
          className="world"
          style={{ transform: `translate(${camera.x}px, ${camera.y}px) scale(${scale})`, '--zoom': scale }}
        >
          <PageView page={page} rect={{ x: 0, y: 0, w: PAGE_WIDTH, h: pageHeight }} view={view} overlay={overlay} />
        </div>
        <canvas ref={wetRef} className="wet-ink" />
      </div>
      <div className="zoom-controls">
        <button onClick={() => zoomBy(1 / 1.25)} aria-label="Zoom out" title="Less zoom">−</button>
        <span className="zoom-level">{scale.toFixed(1)}×</span>
        <button onClick={() => zoomBy(1.25)} aria-label="Zoom in" title="More zoom">+</button>
        <span className="zoom-gap" />
        <button onClick={() => move({ x: current.current.x - current.current.w * 0.5 }, true)} aria-label="Move left" title="Move left">←</button>
        <button onClick={() => move({ x: current.current.x + current.current.w * 0.5 }, true)} aria-label="Move right" title="Move right">→</button>
        <button
          onClick={() => move({ x: current.current.lineStartX, y: current.current.y + current.current.h * 0.85 }, true)}
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
