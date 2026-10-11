// "Wet ink": the stroke you are drawing right now, painted on a canvas that
// covers the screen. It is redrawn on every Pencil event without waiting
// for React, so the line keeps up with the tip. When you lift the Pencil
// the stroke is saved and drawn as SVG instead, and this canvas is cleared.
import { strokePath } from './ink.js';
import { shapePath } from './shapes.js';
import { displayColor, HIGHLIGHT_OPACITY } from './inkStyle.js';

export class WetInk {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.width = 0;
    this.height = 0;
    this.dark = false; // black background: show black ink white
  }

  // Match the canvas to its on-screen size (sharp on Retina screens).
  resize(width, height) {
    const dpr = window.devicePixelRatio || 1;
    this.width = width;
    this.height = height;
    this.canvas.width = Math.round(width * dpr);
    this.canvas.height = Math.round(height * dpr);
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;
  }

  clear() {
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  // world → screen: screen = world * scale + offset
  setCamera(camera) {
    const dpr = window.devicePixelRatio || 1;
    this.ctx.setTransform(dpr * camera.scale, 0, 0, dpr * camera.scale, dpr * camera.x, dpr * camera.y);
  }

  /**
   * Draws a stroke given in world units. `extra` are predicted points
   * (drawn, never saved). Strokes with a `shape` are drawn as that shape.
   */
  draw(stroke, camera, extra = []) {
    this.clear();
    if (!stroke) return;
    const { ctx } = this;
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
    ctx.fillStyle = color;
    ctx.fill(new Path2D(strokePath({ ...stroke, points: [...stroke.points, ...extra] }, false)));
  }

  // The lasso loop while you draw it (dashed line, constant width on screen).
  drawLasso(points, camera) {
    this.clear();
    if (points.length < 4) return;
    const { ctx } = this;
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
