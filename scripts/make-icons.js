// Draws the Peel app icon (a book page with a peeling washi tape) and saves it
// as PNG files in public/icons. Run with: npm run icons
// No image library needed: we compute every pixel ourselves and use Node's
// built-in zlib to write the PNG format.
import fs from 'node:fs';
import zlib from 'node:zlib';

const COLORS = {
  background: [224, 101, 79],
  page: [255, 253, 248],
  line: [217, 210, 197],
  tape: [140, 199, 181],
  tapeStripe: [168, 216, 201],
  flap: [203, 232, 223],
  shadow: [60, 40, 30],
};

// Everything is designed on a 512×512 grid and scaled to the output size.
function colorAt(x, y) {
  let color = COLORS.background;
  let alpha = 1;

  // A slight shadow under the page
  if (inRoundRect(x, y, 136, 106, 384, 424, 28)) color = mix(color, COLORS.shadow, 0.25);
  // The white page
  const onPage = inRoundRect(x, y, 128, 96, 384, 416, 24);
  if (onPage) color = COLORS.page;

  // Text lines on the page
  const lines = [
    [160, 150, 352], [160, 190, 330], [160, 230, 352], [160, 270, 300],
    [160, 310, 352], [160, 350, 280],
  ];
  for (const [x0, ly, x1] of lines) {
    if (inRoundRect(x, y, x0, ly, x1, ly + 14, 7)) color = COLORS.line;
  }

  // The tape: a strip rotated -12°, zigzag torn ends, top-right corner peeling.
  const angle = (-12 * Math.PI) / 180;
  const cx = 256, cy = 252, L = 320, T = 88;
  const dx = x - cx, dy = y - cy;
  const u = dx * Math.cos(-angle) - dy * Math.sin(-angle); // along the tape
  const v = dx * Math.sin(-angle) + dy * Math.cos(-angle); // across the tape
  const zig = (val) => 7 * Math.abs(((val / 14) % 2 + 2) % 2 - 1); // triangle wave
  const inStrip = Math.abs(v) <= T / 2 && u >= -L / 2 + zig(v) && u <= L / 2 - zig(v);
  const fold = 60;
  // Corner triangle that has been peeled away (we see the page through it)
  const inPeeledCorner = u - (L / 2 - fold) > v + T / 2;
  if (inStrip && !inPeeledCorner) {
    const stripe = Math.floor((u + v) / 16) % 2 === 0;
    color = stripe ? COLORS.tapeStripe : COLORS.tape;
  }
  // The flap: the peeled corner folded back over the tape (its mirror image
  // across the fold line).
  const fu = u - (L / 2 - fold), fv = v + T / 2; // relative to where the fold starts
  if (inTriangle(fu, fv, 0, 0, fold, fold, 0, fold)) color = COLORS.flap;
  return [...color, alpha];
}

function inTriangle(px, py, ax, ay, bx, by, cx, cy) {
  const d1 = (px - bx) * (ay - by) - (ax - bx) * (py - by);
  const d2 = (px - cx) * (by - cy) - (bx - cx) * (py - cy);
  const d3 = (px - ax) * (cy - ay) - (cx - ax) * (py - ay);
  const hasNeg = d1 < 0 || d2 < 0 || d3 < 0;
  const hasPos = d1 > 0 || d2 > 0 || d3 > 0;
  return !(hasNeg && hasPos);
}

function inRoundRect(x, y, x0, y0, x1, y1, r) {
  if (x < x0 || x > x1 || y < y0 || y > y1) return false;
  const nx = Math.max(x0 + r - x, 0, x - (x1 - r));
  const ny = Math.max(y0 + r - y, 0, y - (y1 - r));
  return nx * nx + ny * ny <= r * r;
}

function mix(a, b, t) {
  return a.map((value, i) => value * (1 - t) + b[i] * t);
}

// Render with 4×4 samples per pixel for smooth (anti-aliased) edges.
function render(size) {
  const data = Buffer.alloc(size * size * 4);
  const scale = 512 / size;
  const S = 4;
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      const sum = [0, 0, 0, 0];
      for (let sy = 0; sy < S; sy++) {
        for (let sx = 0; sx < S; sx++) {
          const c = colorAt((px + (sx + 0.5) / S) * scale, (py + (sy + 0.5) / S) * scale);
          for (let i = 0; i < 4; i++) sum[i] += c[i];
        }
      }
      const o = (py * size + px) * 4;
      data[o] = Math.round(sum[0] / (S * S));
      data[o + 1] = Math.round(sum[1] / (S * S));
      data[o + 2] = Math.round(sum[2] / (S * S));
      data[o + 3] = Math.round((sum[3] / (S * S)) * 255);
    }
  }
  return encodePng(size, size, data);
}

// --- Minimal PNG encoder ---
const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
function encodePng(width, height, rgba) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // bits per channel
  header[9] = 6; // RGBA
  const rows = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    rows[y * (width * 4 + 1)] = 0; // no filter
    rgba.copy(rows, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', zlib.deflateSync(rows, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

fs.mkdirSync('public/icons', { recursive: true });
const outputs = {
  'icon-512.png': 512,
  'icon-512-maskable.png': 512, // the design already fits Android's "safe circle"
  'icon-192.png': 192,
  'apple-touch-icon.png': 180,
};
for (const [name, size] of Object.entries(outputs)) {
  fs.writeFileSync(`public/icons/${name}`, render(size));
  console.log('wrote public/icons/' + name);
}
