import { useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { GestureController } from './input.js';
import { Viewport } from './viewport.js';
import { computeLayout } from './layout.js';
import { PageView } from './PageView.jsx';
import { markPencilSeen } from './pencil.js';
import { WetInk } from '../ink/WetInk.js';
import '../ink/ink.css';

/**
 * The scrolling, zoomable stack of pages.
 *   overlay:      what to draw on the pages (store, mode, selection…), or null
 *   routePointer: decides if a touch/Pencil/mouse press uses a tool or navigates
 *   onTap, onUndo, onRedo: taps and two/three-finger taps
 *   cursorFor(): what the Pencil hover dot looks like right now
 *                ({ diameter, color } or { eraser: true }), or null for none
 * `ref` gives the notebook screen commands like fitWidth() and goToPage(i),
 * plus `wet` (the canvas that shows the line you're drawing).
 */
export function Viewer({
  pages, initialView, overlay, routePointer, cursorFor,
  onCurrentPageChange, onViewSettled, onTap, onUndo, onRedo, ref,
}) {
  const containerRef = useRef(null);
  const worldRef = useRef(null);
  const viewportRef = useRef(null);
  const wetRef = useRef(null);
  const wetInk = useRef(null);
  const hoverRef = useRef(null);
  const [range, setRange] = useState([0, -1]);
  const [view, setView] = useState(null); // the settled view, for sharp rendering

  const layout = useMemo(() => computeLayout(pages), [pages]);
  const pageIds = useMemo(() => pages.map((p) => p.id), [pages]);

  // Callbacks change on every render; keep the latest in a ref so the
  // engine (created once) always calls the current ones.
  const props = useRef();
  props.current = {
    onCurrentPageChange, onViewSettled, onTap, onUndo, onRedo, routePointer, cursorFor, initialView, layout, pageIds,
  };

  // The Pencil hover dot (or the eraser circle), in screen pixels.
  const showCursor = (clientX, clientY) => {
    const dot = hoverRef.current;
    const look = clientX === null ? null : props.current.cursorFor?.();
    if (!dot) return;
    if (!look) {
      dot.style.display = 'none';
      return;
    }
    const box = containerRef.current.getBoundingClientRect();
    const diameter = look.eraser ? 24 : Math.max(4, look.diameter);
    dot.className = `hover-dot ${look.eraser ? 'eraser' : ''}`;
    dot.style.display = 'block';
    dot.style.width = dot.style.height = `${diameter}px`;
    dot.style.background = look.eraser ? '' : look.color;
    dot.style.left = `${clientX - box.left}px`;
    dot.style.top = `${clientY - box.top}px`;
  };

  // Create the engine and the input handler once.
  useLayoutEffect(() => {
    const container = containerRef.current;
    const viewport = new Viewport(container, worldRef.current, {
      onRange: (first, last) => setRange([first, last]),
      onCurrentPage: (index) => props.current.onCurrentPageChange?.(index),
      onSettle: (settled) => {
        setView(settled);
        props.current.onViewSettled?.(viewport.getAnchor());
      },
    });
    viewportRef.current = viewport;
    viewport.setLayout(props.current.layout, props.current.pageIds);
    if (import.meta.env.DEV) window.__viewport = viewport; // for debugging in the console

    const gestures = new GestureController(container, {
      getCamera: () => viewport.getCamera(),
      setCamera: (cam) => viewport.setCamera(cam),
      clampScale: (scale) => viewport.clampScale(scale),
      onGestureStart: () => viewport.beginInteraction(),
      onGestureEnd: () => viewport.endInteraction(),
      routePointer: (e) => props.current.routePointer?.(e) ?? 'navigate',
      onTap: (info) => props.current.onTap?.(info),
      onUndo: () => props.current.onUndo?.(),
      onRedo: () => props.current.onRedo?.(),
      onPencilSeen: markPencilSeen,
      onHover: (e) => showCursor(e ? e.clientX : null, e ? e.clientY : null),
    });
    wetInk.current = new WetInk(wetRef.current);

    // Size changes (first layout, rotating the iPad, Split View) keep your place.
    const measure = () => {
      const { clientWidth, clientHeight } = container;
      if (!clientWidth || !clientHeight) return;
      const firstTime = !viewport.ready;
      viewport.setSize(clientWidth, clientHeight);
      wetInk.current.resize(clientWidth, clientHeight);
      if (firstTime) viewport.restoreAnchor(props.current.initialView);
    };
    measure(); // right away, so the pages appear in the very first frame
    const observer = new ResizeObserver(measure);
    observer.observe(container);

    return () => {
      observer.disconnect();
      gestures.destroy();
      viewport.destroy();
    };
  }, []);

  // Pages added, removed, reordered or cropped.
  useLayoutEffect(() => {
    viewportRef.current.setLayout(layout, pageIds);
  }, [layout, pageIds]);

  useImperativeHandle(ref, () => ({
    get viewport() {
      return viewportRef.current;
    },
    get wet() {
      return wetInk.current;
    },
    showCursor,
    fitWidth: () => viewportRef.current.fitWidth(),
    goToPage: (index) => viewportRef.current.goToPage(index),
    zoomBy: (factor) => viewportRef.current.zoomBy(factor),
    showRegion: (index, rect) => viewportRef.current.showRegion(index, rect),
    ensurePageVisible: (index) => viewportRef.current.ensurePageVisible(index),
  }), []);

  // Keyboard: arrows/Page Up/Down/space scroll, Ctrl/Cmd +/−/0 zoom.
  useEffect(() => {
    const onKey = (e) => {
      if (e.target.closest?.('input, textarea, select, [contenteditable="true"]')) return;
      if (document.querySelector('.dialog-backdrop, .crop-tool, .note-board')) return;
      const viewport = viewportRef.current;
      if (!viewport.ready) return;
      const mod = e.ctrlKey || e.metaKey;
      const screen = viewport.size.height * 0.85;
      const actions = {
        ArrowDown: () => viewport.scrollBy(80),
        ArrowUp: () => viewport.scrollBy(-80),
        PageDown: () => viewport.scrollBy(screen),
        PageUp: () => viewport.scrollBy(-screen),
        ' ': () => viewport.scrollBy(e.shiftKey ? -screen : screen),
        Home: () => viewport.goToPage(0),
        End: () => viewport.goToPage(pages.length - 1),
      };
      if (mod && (e.key === '=' || e.key === '+')) viewport.zoomBy(1.25);
      else if (mod && e.key === '-') viewport.zoomBy(0.8);
      else if (mod && e.key === '0') viewport.fitWidth();
      else if (!mod && actions[e.key]) actions[e.key]();
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [pages.length]);

  const children = [];
  for (let i = Math.max(0, range[0]); i <= Math.min(range[1], pages.length - 1); i++) {
    children.push(
      <PageView key={pages[i].id} page={pages[i]} rect={layout.rects[i]} view={view} overlay={overlay} />,
    );
  }

  return (
    <div className="viewer" ref={containerRef}>
      <div className="world" ref={worldRef}>
        {children}
      </div>
      <canvas ref={wetRef} className="wet-ink" />
      <div ref={hoverRef} className="hover-dot" style={{ display: 'none' }} />
    </div>
  );
}
