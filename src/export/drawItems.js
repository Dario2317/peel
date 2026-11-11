// Drawing annotations on a canvas, so they look the same as in the app
// (where they are SVG and HTML). Used by the PDF export.
//
// Everything is drawn in page units (or board units): the caller sets the
// canvas transform so 1 unit = k pixels. Text is drawn at its real pixel
// size (sharper than drawing small text and scaling it up).
import { isLineStroke, strokeBox, strokePath } from '../ink/ink.js';
import { shapePath } from '../ink/shapes.js';
import { displayColor, HIGHLIGHT_OPACITY } from '../ink/inkStyle.js';
import { fontFamily } from '../text/fonts.js';
import { colorValue, POSTIT_COLORS, TAPE_COLORS, textColorOn, tiltFor, tornTapeShape } from '../overlay/looks.js';
import { firstBaseline, wrapText } from './exportLayout.js';

// --- Ink -------------------------------------------------------------------

// The box around a stroke, including its width.
export function inkBox(stroke) {
  const box = strokeBox(stroke);
  const r = stroke.size / 2;
  return { left: box.left - r, top: box.top - r, right: box.right + r, bottom: box.bottom + r };
}

function drawStroke(ctx, s, dark) {
  const color = s.tool === 'highlighter' ? s.color : displayColor(s.color, dark);
  if (s.shape || isLineStroke(s)) {
    const d = s.shape ? shapePath(s.shape, s.size) : strokePath(s);
    if (!d) return;
    ctx.strokeStyle = color;
    ctx.lineWidth = s.size;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke(new Path2D(d));
  } else {
    const d = strokePath(s);
    if (!d) return;
    ctx.fillStyle = color;
    ctx.fill(new Path2D(d));
  }
}

/**
 * Draws strokes like InkLayer: highlighter first, see-through and blended
 * with what's under it (overlapping highlights don't get darker), then pens.
 * Highlights need a canvas of their own for that (made only if there are any).
 */
export function drawInk(ctx, strokes, { dark = false } = {}) {
  const highlights = strokes.filter((s) => s.tool === 'highlighter');
  const pens = strokes.filter((s) => s.tool !== 'highlighter');
  if (highlights.length) {
    const { canvas } = ctx;
    const layer = document.createElement('canvas');
    layer.width = canvas.width;
    layer.height = canvas.height;
    const lctx = layer.getContext('2d');
    lctx.setTransform(ctx.getTransform());
    for (const s of highlights) drawStroke(lctx, s, dark);
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = HIGHLIGHT_OPACITY;
    ctx.globalCompositeOperation = dark ? 'screen' : 'multiply';
    ctx.drawImage(layer, 0, 0);
    ctx.restore();
    layer.width = 0; // free its memory now (iPad)
    layer.height = 0;
  }
  for (const s of pens) drawStroke(ctx, s, dark);
}

// --- Text ----------------------------------------------------------------------

// The CSS font for a text box at `px` pixels.
export function fontFor(box, px) {
  return `${box.italic ? 'italic ' : ''}${box.bold ? 700 : 400} ${px}px ${fontFamily(box.font)}`;
}

/**
 * Lays out a text box: { lines, height } in units.
 *   ctx:        any 2D context, for measuring
 *   lineHeight: 1.3 on pages, 1.4 on boards (as in the CSS)
 */
export function layoutText(ctx, box, lineHeight) {
  const size = box.size ?? 20;
  // Measure at a fixed, large pixel size and scale (the same at any zoom).
  const MEASURE_PX = 100;
  ctx.font = fontFor(box, MEASURE_PX);
  const measure = (t) => (ctx.measureText(t).width * size) / MEASURE_PX;
  const lines = wrapText(box.text ?? '', box.w, measure);
  return { lines, height: Math.max(1, lines.length) * size * lineHeight };
}

/**
 * Draws a laid-out text box. k = pixels per unit.
 */
export function drawText(ctx, box, layout, { k, lineHeight, color }) {
  const size = box.size ?? 20;
  const px = size * k;
  ctx.save();
  ctx.translate(box.x, box.y);
  ctx.scale(1 / k, 1 / k); // back to pixels, for sharp text
  ctx.font = fontFor(box, px);
  ctx.fillStyle = color;
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
  const m = ctx.measureText('Hg');
  const ascent = m.fontBoundingBoxAscent ?? px * 0.8;
  const descent = m.fontBoundingBoxDescent ?? px * 0.2;
  const step = px * lineHeight;
  let y = firstBaseline(step, ascent, descent);
  for (const line of layout.lines) {
    if (line) ctx.fillText(line, 0, y);
    y += step;
  }
  ctx.restore();
}

// --- Tape ----------------------------------------------------------------------

const TAPE_FONT = "Noteworthy, 'Marker Felt', 'Segoe Print', 'Comic Sans MS', cursive";
const LIGHT = 'rgba(255,255,255,.38)';

// The box of a tape including its torn ends (units).
export function tapeBox(item, pageHeight) {
  const left = item.x * 1000;
  const top = item.y * pageHeight;
  const shape = tornTapeShape(item.w * 1000, item.h * pageHeight, item.seed);
  return {
    left: left + shape.left,
    top: top + shape.top,
    right: left + shape.left + shape.width,
    bottom: top + shape.top + shape.height,
  };
}

let noise = null;
function noiseCanvas() {
  if (!noise) {
    // Random dark specks, like the frosted tape's texture in the app.
    noise = document.createElement('canvas');
    noise.width = 120;
    noise.height = 120;
    const nctx = noise.getContext('2d');
    const image = nctx.createImageData(120, 120);
    let seed = 7;
    for (let i = 0; i < image.data.length; i += 4) {
      seed = (seed * 16807) % 2147483647;
      image.data[i + 3] = Math.round(255 * 0.18 * (0.2 + 0.6 * (seed / 2147483647)));
    }
    nctx.putImageData(image, 0, 0);
  }
  return noise;
}

// The pattern of the tape (CSS backgrounds in looks.js), drawn in a box
// w × h that starts at 0,0. The tape's outline is already the clip.
function drawTapePattern(ctx, pattern, base, w, h) {
  const sheen = () => {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, 'rgba(255,255,255,.18)');
    g.addColorStop(0.45, 'rgba(255,255,255,0)');
    g.addColorStop(1, 'rgba(0,0,0,.05)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  };
  switch (pattern) {
    case 'stripes': {
      // 135° stripes: 7 light, 8 clear.
      ctx.save();
      ctx.rotate(Math.PI / 4);
      ctx.fillStyle = LIGHT;
      const reach = w + h;
      for (let u = -reach; u < reach; u += 15) ctx.fillRect(u, -reach, 7, reach * 2);
      ctx.restore();
      sheen();
      break;
    }
    case 'dots':
      ctx.fillStyle = 'rgba(255,255,255,.6)';
      ctx.beginPath();
      for (let x = 7; x < w + 14; x += 14) {
        for (let y = 7; y < h + 14; y += 14) {
          ctx.moveTo(x + 2.9, y);
          ctx.arc(x, y, 2.9, 0, Math.PI * 2);
        }
      }
      ctx.fill();
      sheen();
      break;
    case 'grid':
      ctx.fillStyle = LIGHT;
      for (let y = 0; y < h; y += 13) ctx.fillRect(0, y, w, 1.5);
      for (let x = 0; x < w; x += 13) ctx.fillRect(x, 0, 1.5, h);
      sheen();
      break;
    case 'frosted': {
      const g = ctx.createLinearGradient(0, 0, (w + h) / 2, (w + h) / 2);
      g.addColorStop(0, `${base}33`);
      g.addColorStop(1, '#ffffff55');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = ctx.createPattern(noiseCanvas(), 'repeat');
      ctx.fillRect(0, 0, w, h);
      break;
    }
    default:
      sheen();
  }
}

/**
 * Draws one tape like Tape.jsx: torn ends, color, pattern, soft shadow and
 * the question written on it. k = pixels per unit.
 */
export function drawTape(ctx, item, pageHeight, k) {
  const width = item.w * 1000;
  const height = item.h * pageHeight;
  const shape = tornTapeShape(width, height, item.seed);
  const base = colorValue(TAPE_COLORS, item.color);
  const pattern = item.pattern ?? 'solid';

  ctx.save();
  ctx.translate(item.x * 1000 + shape.left, item.y * pageHeight + shape.top);
  const outline = new Path2D();
  shape.points.forEach(([x, y], i) => (i ? outline.lineTo(x - shape.left, y - shape.top) : outline.moveTo(x - shape.left, y - shape.top)));
  outline.closePath();

  // The base color, with the shadow (shadow sizes are in pixels).
  ctx.save();
  ctx.shadowColor = 'rgba(40,25,10,.3)';
  ctx.shadowOffsetY = 1 * k;
  ctx.shadowBlur = 1.2 * k;
  ctx.fillStyle = pattern === 'frosted' ? '#e9e6df' : base;
  ctx.fill(outline);
  ctx.restore();

  ctx.save();
  ctx.clip(outline);
  drawTapePattern(ctx, pattern, base, shape.width, shape.height);
  ctx.restore();

  if (item.question?.trim()) {
    const thickness = shape.horizontal ? height : width;
    const length = (shape.horizontal ? shape.width : shape.height) - 2 * (Math.max(-shape.left, -shape.top) + 4);
    const fontSize = Math.max(8, Math.min(thickness * 0.42, 40));
    ctx.save();
    ctx.clip(outline);
    ctx.translate(shape.width / 2, shape.height / 2);
    if (!shape.horizontal) ctx.rotate(Math.PI / 2); // written top to bottom
    ctx.scale(1 / k, 1 / k);
    ctx.font = `700 ${fontSize * k}px ${TAPE_FONT}`;
    ctx.fillStyle = textColorOn(item.color, pattern);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(fitWithEllipsis(ctx, item.question.replace(/\s+/g, ' ').trim(), Math.max(0, length * k)), 0, 0);
    ctx.restore();
  }
  ctx.restore();
}

// Shortens text with … so it fits in maxWidth (pixels), like CSS text-overflow.
function fitWithEllipsis(ctx, text, maxWidth) {
  if (ctx.measureText(text).width <= maxWidth) return text;
  const chars = Array.from(text);
  let lo = 0;
  let hi = chars.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (ctx.measureText(chars.slice(0, mid).join('') + '…').width <= maxWidth) lo = mid;
    else hi = mid - 1;
  }
  return lo ? chars.slice(0, lo).join('') + '…' : '';
}

// --- Post-it pins ------------------------------------------------------------

export const PIN_SIZE = 38; // units (in the app it's 38 px on screen at any zoom)

// The box around a pin (a little bigger: it's tilted, and may have a link badge).
export function pinBox(item, pageHeight) {
  const x = item.x * 1000;
  const y = item.y * pageHeight;
  return { left: x - 3, top: y - 8, right: x + PIN_SIZE + 8, bottom: y + PIN_SIZE + 3 };
}

const hexToRgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

/**
 * Draws a closed post-it like PostIt.jsx + overlay.css: a see-through note,
 * tilted a little, with faint ruled lines and a folded corner. `number` (if
 * any) is written on it, so you can find its board further on in the PDF.
 */
export function drawPin(ctx, item, pageHeight, k, number = null) {
  const S = PIN_SIZE;
  const note = colorValue(POSTIT_COLORS, item.color);
  const [r, g, b] = hexToRgb(note);
  ctx.save();
  ctx.translate(item.x * 1000, item.y * pageHeight);
  ctx.rotate((tiltFor(item.id) * Math.PI) / 180);

  // Paper with the bottom-right corner cut off.
  const paper = new Path2D();
  paper.moveTo(0, 0);
  paper.lineTo(S, 0);
  paper.lineTo(S, S * 0.74);
  paper.lineTo(S * 0.74, S);
  paper.lineTo(0, S);
  paper.closePath();
  ctx.fillStyle = `rgba(${r},${g},${b},0.62)`;
  ctx.fill(paper);

  // Ruled lines, inside the padding (18% top, 12% sides, 26% bottom).
  ctx.save();
  ctx.clip(paper);
  ctx.fillStyle = 'rgba(60,45,20,.18)';
  const top = S * 0.18;
  const h = S * (1 - 0.18 - 0.26);
  for (let start = 0.26; start < 1; start += 0.29) {
    ctx.fillRect(S * 0.12, top + h * start, S * 0.76, h * 0.03);
  }
  ctx.restore();

  // The folded corner: the note color mixed with a shadow (color-mix in CSS).
  const alpha = 0.62 + 0.38 * 0.35;
  const mix = (c, d) => Math.round((0.62 * c + 0.38 * 0.35 * d) / alpha);
  ctx.fillStyle = `rgba(${mix(r, 60)},${mix(g, 45)},${mix(b, 20)},${alpha})`;
  ctx.beginPath();
  ctx.moveTo(S * 0.74, S * 0.74);
  ctx.lineTo(S, S * 0.74);
  ctx.lineTo(S * 0.74, S);
  ctx.closePath();
  ctx.fill();

  if (number != null) {
    ctx.save();
    ctx.translate(S * 0.46, S * 0.48);
    ctx.scale(1 / k, 1 / k);
    ctx.font = `700 ${16 * k}px system-ui, -apple-system, 'Segoe UI', sans-serif`;
    ctx.fillStyle = 'rgba(43,38,32,.9)';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(number), 0, 0);
    ctx.restore();
  }

  if (item.link) {
    // The blue ↗ badge: this note has a link.
    ctx.fillStyle = '#1f5fbf';
    ctx.beginPath();
    ctx.arc(S - 1, 1, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.save();
    ctx.translate(S - 1, 1.5);
    ctx.scale(1 / k, 1 / k);
    ctx.font = `700 ${11 * k}px system-ui, -apple-system, sans-serif`;
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('↗', 0, 0);
    ctx.restore();
  }
  ctx.restore();
}
