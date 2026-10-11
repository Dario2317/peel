// "Wet ink": the stroke you are drawing right now, painted on a canvas that
// covers the screen. It is redrawn on every Pencil event without waiting
// for React, so the line keeps up with the tip. When you lift the Pencil
// the stroke is saved and drawn as SVG instead, and this canvas is cleared.
import { strokePath } from './ink.js';
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

  /**
   * Draws a stroke given in world units. `camera` = { x, y, scale } maps
   * world → screen (screen = world * scale + offset). `extra` are predicted
   * points (drawn, never saved). Set `dark` when the background is black.
   */
  draw(stroke, camera, extra = []) {
    this.clear();
    if (!stroke) return;
    const dpr = window.devicePixelRatio || 1;
    const { ctx } = this;
    ctx.setTransform(dpr * camera.scale, 0, 0, dpr * camera.scale, dpr * camera.x, dpr * camera.y);
    ctx.globalAlpha = stroke.tool === 'highlighter' ? HIGHLIGHT_OPACITY : 1;
    ctx.fillStyle = displayColor(stroke.color, this.dark);
    ctx.fill(new Path2D(strokePath({ ...stroke, points: [...stroke.points, ...extra] }, false)));
  }
}
