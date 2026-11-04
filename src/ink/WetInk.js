// "Wet ink": the stroke you are drawing right now, painted on a canvas that
// covers the screen. It is redrawn on every Pencil event without waiting
// for React, so the line keeps up with the tip. When you lift the Pencil
// the stroke is saved and drawn as SVG instead, and this canvas is cleared.
import { isLineStroke, liveLinePoints, strokePath } from './ink.js';
import { shapePath } from './shapes.js';
import { displayColor, HIGHLIGHT_OPACITY } from './inkStyle.js';

// The canvas is only as big as what is drawn on it (the stroke you are writing,
// plus some room to grow), not the whole screen. A Retina screen-sized canvas
// that changes on every Pencil event has to be handed to the compositor again
// each time, and that was most of the battery used while writing.
const EMPTY = { x: 0, y: 0, w: 0, h: 0 };
const PAD_PX = 6; // room around what is drawn (antialiasing, line ends)
const GROW = 0.4; // when it doesn't fit: the new canvas is this much bigger on each side
const GROW_PX = 60;

export class WetInk {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.width = 0; // the screen area it may draw on (CSS px)
    this.height = 0;
    this.rect = EMPTY; // where the canvas is now, in that area (CSS px)
    this.dark = false; // black background: show black ink white
  }

  // The screen area (CSS px). Nothing is allocated until something is drawn.
  resize(width, height) {
    this.width = width;
    this.height = height;
    this.collapse();
  }

  // Wipes it and gives the memory back (when there is something to wipe).
  clear() {
    if (this.rect !== EMPTY) this.collapse();
  }

  collapse() {
    this.canvas.width = 1;
    this.canvas.height = 1;
    Object.assign(this.canvas.style, { left: '0px', top: '0px', width: '1px', height: '1px' });
    this.rect = EMPTY;
  }

  // Makes sure the canvas covers `box` ({ left, top, right, bottom }, CSS px),
  // growing it (and so wiping it) if it doesn't, then wipes the picture.
  // Callers draw everything again after this anyway.
  prepare(box) {
    const left = Math.max(0, Math.floor(box.left - PAD_PX));
    const top = Math.max(0, Math.floor(box.top - PAD_PX));
    const right = Math.min(this.width, Math.ceil(box.right + PAD_PX));
    const bottom = Math.min(this.height, Math.ceil(box.bottom + PAD_PX));
    const r = this.rect;
    if (right > left && bottom > top) {
      const fits = r !== EMPTY && left >= r.x && top >= r.y && right <= r.x + r.w && bottom <= r.y + r.h;
      if (!fits) {
        const gx = Math.max(GROW_PX, (right - left) * GROW);
        const gy = Math.max(GROW_PX, (bottom - top) * GROW);
        this.place(Math.max(0, left - gx), Math.max(0, top - gy), Math.min(this.width, right + gx), Math.min(this.height, bottom + gy));
      }
    } else if (r === EMPTY) {
      this.place(0, 0, 1, 1); // nothing visible to draw
    }
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  place(left, top, right, bottom) {
    const dpr = window.devicePixelRatio || 1;
    const x = Math.floor(left);
    const y = Math.floor(top);
    const w = Math.max(1, Math.ceil(right) - x);
    const h = Math.max(1, Math.ceil(bottom) - y);
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    Object.assign(this.canvas.style, { left: `${x}px`, top: `${y}px`, width: `${w}px`, height: `${h}px` });
    this.rect = { x, y, w, h };
  }

  // world → screen: screen = world * scale + offset (the canvas starts at this.rect)
  setCamera(camera) {
    const dpr = window.devicePixelRatio || 1;
    this.ctx.setTransform(dpr * camera.scale, 0, 0, dpr * camera.scale, dpr * (camera.x - this.rect.x), dpr * (camera.y - this.rect.y));
  }

  // The screen area covered by flat world points [x, y, (pressure), x, y, …]
  // (`stride` numbers per point), `margin` world units around them.
  boxOf(flat, stride, margin, camera) {
    let left = Infinity;
    let top = Infinity;
    let right = -Infinity;
    let bottom = -Infinity;
    for (let i = 0; i + 1 < flat.length; i += stride) {
      const x = flat[i] * camera.scale + camera.x;
      const y = flat[i + 1] * camera.scale + camera.y;
      if (x < left) left = x;
      if (x > right) right = x;
      if (y < top) top = y;
      if (y > bottom) bottom = y;
    }
    const m = margin * camera.scale;
    return { left: left - m, top: top - m, right: right + m, bottom: bottom + m };
  }

  fullBox() {
    return { left: 0, top: 0, right: this.width, bottom: this.height };
  }

  /**
   * Draws a stroke given in world units. `extra` are predicted points
   * (drawn, never saved). Strokes with a `shape` are drawn as that shape.
   */
  draw(stroke, camera, extra = []) {
    if (!stroke) return this.clear();
    const { ctx } = this;
    // Shapes can reach beyond their points: those get the whole screen area.
    // A line reaches half its width (a little more with pressure) past its points.
    const live = stroke.shape ? stroke : { ...stroke, points: [...stroke.points, ...extra] };
    this.prepare(stroke.shape ? this.fullBox() : this.boxOf(live.points, 3, stroke.size, camera));
    this.setCamera(camera);
    const color = stroke.tool === 'highlighter' ? stroke.color : displayColor(stroke.color, this.dark);
    ctx.globalAlpha = stroke.tool === 'highlighter' ? HIGHLIGHT_OPACITY : 1;
    if (stroke.shape) {
      ctx.strokeStyle = color;
      ctx.lineWidth = stroke.size;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.stroke(new Path2D(shapePath(stroke.shape, stroke.size)));
      return;
    }
    if (isLineStroke(live)) {
      // Same width all along: a line with a round tip through the smoothed points.
      const points = liveLinePoints(live);
      ctx.strokeStyle = color;
      ctx.lineWidth = stroke.size;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(points[0][0], points[0][1]);
      if (points.length === 1) ctx.lineTo(points[0][0] + 0.01, points[0][1]);
      for (let i = 1; i < points.length; i++) ctx.lineTo(points[i][0], points[i][1]);
      ctx.stroke();
      return;
    }
    ctx.fillStyle = color;
    ctx.fill(new Path2D(strokePath(live, false)));
  }

  // The lasso loop while you draw it (dashed line, constant width on screen).
  drawLasso(points, camera) {
    if (points.length < 4) return this.clear();
    const { ctx } = this;
    this.prepare(this.boxOf(points, 2, 2 / camera.scale, camera));
    this.setCamera(camera);
    ctx.globalAlpha = 1;
    ctx.beginPath();
    ctx.moveTo(points[0], points[1]);
    for (let i = 2; i < points.length; i += 2) ctx.lineTo(points[i], points[i + 1]);
    ctx.lineWidth = 1.5 / camera.scale;
    ctx.setLineDash([6 / camera.scale, 5 / camera.scale]);
    ctx.strokeStyle = this.dark ? '#ff8a73' : '#d95a43';
    ctx.stroke();
    ctx.setLineDash([]);
  }
}
