// All touch, Apple Pencil and mouse input on the pages goes through here.
//
// Pointer Events give one stream of events for every kind of input, and
// e.pointerType tells us which: 'pen' (Apple Pencil), 'touch' (finger) or
// 'mouse'. This file decides what each pointer does:
//   - navigation: pan with one finger, pinch-zoom with two, fling to scroll
//   - taps: one-finger tap, two-finger tap (undo), three-finger tap (redo)
//   - tools (tape, moving notes, later drawing): `routePointer(e)` decides;
//     it returns 'navigate' or a handler { move(e), up(e), cancel() }
// It also does palm rejection: while the Pencil is on the screen, fingers
// are ignored, and if a resting palm moved the page just before the Pencil
// touched down, that movement is undone.
//
// This is a plain JavaScript class, not React: it runs on every input event
// (up to 240 per second with the Pencil) and must never wait for React.

import { zoomAround } from './camera.js';

const TAP_SLOP = 10; // px a finger may wobble and still count as a tap
const TAP_MAX_MS = 300; // one-finger tap
const MULTI_TAP_MAX_MS = 400; // two/three-finger taps
const PALM_RESTORE_MS = 1000; // a touch this recent when the Pencil lands = palm
const PALM_RESTORE_DISTANCE = 40; // …or one that has barely moved
const FRICTION_MS = 325; // how quickly a fling slows down (like iOS)

export class GestureController {
  /**
   * options: {
   *   getCamera(), setCamera(cam), clampScale(scale),
   *   onGestureStart(), onGestureEnd(),
   *   onTap({ x, y, pointerType, target }), onUndo(), onRedo(),
   *   onPencilSeen(), onHover(event | null)  (Pencil hovering, iPad Pro/Air M2+)
   *   routePointer(event) -> 'navigate' | { move(e), up(e), cancel() }
   * }
   */
  constructor(element, options) {
    this.el = element;
    this.o = options;
    this.pointers = new Map(); // navigation pointers: pointerId -> { x, y, startX, startY, type }
    this.tools = new Map(); // tool pointers: pointerId -> { handler, type, x, y }
    this.penDown = false;
    this.gesture = null; // the current navigation gesture
    this.last = null; // centroid/spread of the pointers at the previous event
    this.samples = []; // recent positions, to measure fling speed
    this.inertiaFrame = 0;
    this.gestureScale = null; // Safari trackpad pinch
    this.lastTouchAt = -Infinity;

    this.handlers = {
      pointerdown: this.onPointerDown.bind(this),
      pointermove: this.onPointerMove.bind(this),
      pointerup: this.onPointerUp.bind(this),
      pointercancel: this.onPointerUp.bind(this),
      wheel: this.onWheel.bind(this),
      gesturestart: this.onSafariGesture.bind(this),
      gesturechange: this.onSafariGesture.bind(this),
      gestureend: this.onSafariGesture.bind(this),
      touchstart: this.onTouchStart.bind(this),
      contextmenu: (e) => e.preventDefault(),
      // The Pencil moved away from the screen: hide the hover dot.
      pointerleave: (e) => e.pointerType === 'pen' && this.o.onHover?.(null),
    };
    for (const [name, fn] of Object.entries(this.handlers)) {
      element.addEventListener(name, fn, { passive: false });
    }
  }

  destroy() {
    this.stopInertia();
    for (const [name, fn] of Object.entries(this.handlers)) {
      this.el.removeEventListener(name, fn);
    }
  }

  // --- Pointer events -----------------------------------------------------

  onPointerDown(e) {
    if (!this.o.getCamera()) return; // not laid out yet
    // Text fields, sliders and buttons keep their normal behavior.
    if (e.target.closest?.('input, textarea, select, button, [contenteditable="true"]')) return;
    if (e.pointerType === 'pen') {
      this.o.onPencilSeen?.();
      this.o.onHover?.(null);
      this.penDown = true;
      this.rejectPalm();
    } else if (e.pointerType === 'touch') {
      this.lastTouchAt = performance.now();
      // While the Pencil is down every finger is ignored (palm rejection).
      // (We don't judge palms by contact size: iPad reports normal
      // fingertips as quite large, and iPadOS already rejects palms itself.)
      if (this.penDown) return;
    } else if (e.button !== 0 && e.button !== 1) {
      return; // right-click etc.
    }

    if (e.pointerType !== 'touch') {
      // Keep receiving events even if the mouse/Pencil leaves the element.
      try {
        this.el.setPointerCapture(e.pointerId);
      } catch {
        // The pointer is already gone; nothing to capture.
      }
    }
    this.stopInertia();

    if (e.pointerType === 'touch') {
      // A second finger while one finger uses a tool (no Pencil): it was a
      // pinch after all. Cancel the tool and navigate with both fingers.
      for (const [id, tool] of this.tools) {
        if (tool.type !== 'touch') continue;
        tool.handler.cancel();
        this.tools.delete(id);
        this.addNavigationPointer(id, tool.x, tool.y, 'touch');
      }
    }

    // Tools only get a pointer when nothing else is going on with fingers.
    const navigating = this.pointers.size > 0;
    const route = navigating ? 'navigate' : this.o.routePointer?.(e) ?? 'navigate';
    if (route !== 'navigate') {
      this.tools.set(e.pointerId, { handler: route, type: e.pointerType, x: e.clientX, y: e.clientY });
      return;
    }
    this.addNavigationPointer(e.pointerId, e.clientX, e.clientY, e.pointerType);
  }

  addNavigationPointer(pointerId, x, y, type) {
    this.pointers.set(pointerId, { x, y, startX: x, startY: y, type });
    if (!this.gesture) {
      this.gesture = {
        startTime: performance.now(),
        startCamera: this.o.getCamera(),
        maxPointers: 0,
        moved: false,
        type,
      };
      this.samples = [];
      this.o.onGestureStart?.();
    }
    this.gesture.maxPointers = Math.max(this.gesture.maxPointers, this.pointers.size);
    this.last = this.measure();
  }

  onPointerMove(e) {
    if (e.pointerType === 'touch') this.lastTouchAt = performance.now();
    if (e.pointerType === 'pen' && e.buttons === 0) {
      this.o.onPencilSeen?.(); // Pencil hovering above the screen
      this.o.onHover?.(e);
      return;
    }
    const tool = this.tools.get(e.pointerId);
    if (tool) {
      tool.x = e.clientX;
      tool.y = e.clientY;
      tool.handler.move(e);
      return;
    }
    const p = this.pointers.get(e.pointerId);
    if (!p) return;
    p.x = e.clientX;
    p.y = e.clientY;
    if (Math.hypot(p.x - p.startX, p.y - p.startY) > TAP_SLOP) this.gesture.moved = true;
    this.navigate();
  }

  onPointerUp(e) {
    if (e.pointerType === 'pen') this.penDown = false;
    const tool = this.tools.get(e.pointerId);
    if (tool) {
      this.tools.delete(e.pointerId);
      if (e.type === 'pointercancel') tool.handler.cancel();
      else tool.handler.up(e);
      return;
    }
    if (!this.pointers.has(e.pointerId)) return;
    this.pointers.delete(e.pointerId);
    if (this.pointers.size > 0) {
      this.last = this.measure(); // e.g. pinch → pan: continue smoothly
      return;
    }
    this.endGesture(e, e.type === 'pointercancel');
  }

  // --- Navigation ---------------------------------------------------------

  // Center point and spread of all pointers on the screen.
  measure() {
    const pts = [...this.pointers.values()];
    const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length;
    const cy = pts.reduce((s, p) => s + p.y, 0) / pts.length;
    const spread = pts.length < 2 ? 0 : pts.reduce((s, p) => s + Math.hypot(p.x - cx, p.y - cy), 0) / pts.length;
    return { x: cx, y: cy, spread, count: pts.length };
  }

  // Moves the camera by how much the fingers moved since the last event.
  navigate() {
    const now = this.measure();
    const last = this.last;
    this.last = now;
    if (!last || last.count !== now.count) return;

    let cam = this.o.getCamera();
    if (now.count >= 2 && last.spread > 0) {
      const scale = this.o.clampScale(cam.scale * (now.spread / last.spread));
      cam = zoomAround(cam, last.x, last.y, scale);
    }
    this.o.setCamera({ ...cam, x: cam.x + now.x - last.x, y: cam.y + now.y - last.y });

    if (now.count === 1) {
      const t = performance.now();
      this.samples.push({ t, x: now.x, y: now.y });
      while (this.samples.length && t - this.samples[0].t > 100) this.samples.shift();
    } else {
      this.samples = [];
    }
  }

  endGesture(e, cancelled) {
    const g = this.gesture;
    this.gesture = null;
    this.last = null;
    if (!g) return;
    const duration = performance.now() - g.startTime;

    if (!cancelled && !g.moved) {
      if (g.maxPointers === 1 && duration < TAP_MAX_MS) {
        // What's under the finger (e.target can be the viewer itself when
        // the pointer was captured, so look it up by position).
        const target = document.elementFromPoint(e.clientX, e.clientY);
        this.o.onTap?.({ x: e.clientX, y: e.clientY, pointerType: e.pointerType, target });
      } else if (g.maxPointers === 2 && g.type === 'touch' && duration < MULTI_TAP_MAX_MS) {
        this.o.onUndo?.();
      } else if (g.maxPointers === 3 && g.type === 'touch' && duration < MULTI_TAP_MAX_MS) {
        this.o.onRedo?.();
      }
    }

    // Fling: keep scrolling with the finger's last speed, slowing down.
    const s = this.samples;
    if (!cancelled && g.maxPointers === 1 && s.length >= 2) {
      const dt = s[s.length - 1].t - s[0].t;
      const vx = dt > 0 ? (s[s.length - 1].x - s[0].x) / dt : 0;
      const vy = dt > 0 ? (s[s.length - 1].y - s[0].y) / dt : 0;
      if (Math.hypot(vx, vy) > 0.3 && performance.now() - s[s.length - 1].t < 60) {
        this.startInertia(vx, vy);
        return;
      }
    }
    this.o.onGestureEnd?.();
  }

  startInertia(vx, vy) {
    let lastTime = performance.now();
    const step = (time) => {
      const dt = Math.min(time - lastTime, 34);
      lastTime = time;
      const cam = this.o.getCamera();
      const want = { ...cam, x: cam.x + vx * dt, y: cam.y + vy * dt };
      this.o.setCamera(want);
      const got = this.o.getCamera();
      // Stop in a direction once we hit the end of the pages.
      if (Math.abs(got.x - want.x) > 0.5) vx = 0;
      if (Math.abs(got.y - want.y) > 0.5) vy = 0;
      const decay = Math.exp(-dt / FRICTION_MS);
      vx *= decay;
      vy *= decay;
      if (Math.hypot(vx, vy) < 0.02) {
        this.inertiaFrame = 0;
        this.o.onGestureEnd?.();
        return;
      }
      this.inertiaFrame = requestAnimationFrame(step);
    };
    this.inertiaFrame = requestAnimationFrame(step);
  }

  stopInertia() {
    if (this.inertiaFrame) {
      cancelAnimationFrame(this.inertiaFrame);
      this.inertiaFrame = 0;
    }
  }

  // The Pencil just touched the screen: any finger gesture going on is a
  // palm. Drop it, and undo the scrolling it caused if it is recent/small.
  rejectPalm() {
    // A palm that started using a tool (e.g. dragging a note): undo that too.
    for (const [id, tool] of this.tools) {
      if (tool.type === 'touch') {
        tool.handler.cancel();
        this.tools.delete(id);
      }
    }
    const g = this.gesture;
    if (!g || g.type !== 'touch') return;
    let travel = 0;
    for (const [id, p] of this.pointers) {
      if (p.type === 'touch') {
        travel = Math.max(travel, Math.hypot(p.x - p.startX, p.y - p.startY));
        this.pointers.delete(id);
      }
    }
    if (performance.now() - g.startTime < PALM_RESTORE_MS || travel < PALM_RESTORE_DISTANCE) {
      this.o.setCamera(g.startCamera);
    }
    this.stopInertia();
    this.gesture = null;
    this.last = null;
    this.o.onGestureEnd?.();
  }

  // --- Mouse wheel / trackpad --------------------------------------------

  onWheel(e) {
    e.preventDefault();
    if (!this.o.getCamera()) return;
    this.stopInertia();
    const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? this.el.clientHeight : 1;
    const dx = e.deltaX * unit;
    const dy = e.deltaY * unit;
    const rect = this.el.getBoundingClientRect();
    const cam = this.o.getCamera();
    this.o.onGestureStart?.();
    if (e.ctrlKey || e.metaKey) {
      // Ctrl+scroll, or a trackpad pinch (browsers report it as Ctrl+wheel)
      const factor = Math.exp(-Math.max(-50, Math.min(50, dy)) * 0.006);
      const scale = this.o.clampScale(cam.scale * factor);
      this.o.setCamera(zoomAround(cam, e.clientX - rect.left, e.clientY - rect.top, scale));
    } else {
      this.o.setCamera({ ...cam, x: cam.x - (e.shiftKey && !dx ? dy : dx), y: cam.y - (e.shiftKey && !dx ? 0 : dy) });
    }
    this.o.onGestureEnd?.();
  }

  // Safari's own pinch events (trackpad on a Mac/iPad keyboard, and fingers
  // on iPad). Fingers are already handled above, so we only stop Safari from
  // zooming the whole page; for a trackpad (no touches) we zoom the pages.
  onSafariGesture(e) {
    e.preventDefault();
    const recentTouch = performance.now() - this.lastTouchAt < 1000;
    if (recentTouch || this.pointers.size > 0 || this.penDown || !this.o.getCamera()) return;
    const rect = this.el.getBoundingClientRect();
    if (e.type === 'gesturestart') {
      this.gestureScale = this.o.getCamera().scale;
      this.o.onGestureStart?.();
    } else if (e.type === 'gesturechange' && this.gestureScale) {
      const cam = this.o.getCamera();
      const scale = this.o.clampScale(this.gestureScale * e.scale);
      this.o.setCamera(zoomAround(cam, e.clientX - rect.left, e.clientY - rect.top, scale));
    } else if (e.type === 'gestureend') {
      this.gestureScale = null;
      this.o.onGestureEnd?.();
    }
  }

  // iPad Safari: cancelling touchstart stops the text-selection magnifier,
  // the long-press menu and double-tap zoom. Text fields and buttons inside
  // the pages (later milestones) still need their normal behavior.
  onTouchStart(e) {
    if (e.target.closest?.('input, textarea, button, select, [contenteditable="true"], [data-native-touch]')) return;
    e.preventDefault();
  }
}
