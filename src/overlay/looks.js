// Colors, patterns and shapes for tape and post-its.

export const TAPE_COLORS = [
  { id: 'mint', value: '#93cdb9' },
  { id: 'pink', value: '#f2a6b8' },
  { id: 'yellow', value: '#f3d36b' },
  { id: 'blue', value: '#9cc1e4' },
  { id: 'lavender', value: '#c2b0e0' },
  { id: 'coral', value: '#ee9a78' },
  { id: 'kraft', value: '#c9a67b' },
  { id: 'gray', value: '#b4aea4' },
];

export const TAPE_PATTERNS = ['solid', 'stripes', 'dots', 'grid', 'frosted'];

export const POSTIT_COLORS = [
  { id: 'yellow', value: '#ffe476' },
  { id: 'pink', value: '#ffb8cb' },
  { id: 'blue', value: '#aedcff' },
  { id: 'green', value: '#bdeba0' },
  { id: 'orange', value: '#ffc98a' },
];

export function colorValue(list, id) {
  return (list.find((c) => c.id === id) ?? list[0]).value;
}

// A tiny frosted-glass texture (random noise), drawn by the browser from SVG.
const NOISE =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='2' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 .18 0'/%3E%3C/filter%3E%3Crect width='120' height='120' filter='url(%23n)'/%3E%3C/svg%3E\")";

// CSS background for a tape. The base color is always fully opaque, so
// nothing under the tape can ever show through; patterns are drawn on top.
export function tapeBackground(colorId, pattern) {
  const base = colorValue(TAPE_COLORS, colorId);
  const sheen = 'linear-gradient(180deg, rgba(255,255,255,.18), rgba(255,255,255,0) 45%, rgba(0,0,0,.05))';
  const light = 'rgba(255,255,255,.38)';
  switch (pattern) {
    case 'stripes':
      return { backgroundColor: base, backgroundImage: `${sheen}, repeating-linear-gradient(135deg, ${light} 0 7px, transparent 7px 15px)` };
    case 'dots':
      return {
        backgroundColor: base,
        backgroundImage: `${sheen}, radial-gradient(circle, rgba(255,255,255,.6) 0 2.6px, transparent 3.2px)`,
        backgroundSize: '100% 100%, 14px 14px',
      };
    case 'grid':
      return {
        backgroundColor: base,
        backgroundImage: `${sheen}, linear-gradient(${light} 1.5px, transparent 1.5px), linear-gradient(90deg, ${light} 1.5px, transparent 1.5px)`,
        backgroundSize: '100% 100%, 13px 13px, 13px 13px',
      };
    case 'frosted':
      // Matte, like frosted tape, but completely opaque (it is not a real blur
      // of the page, so no text can ever be read through it).
      return {
        backgroundColor: '#e9e6df',
        backgroundImage: `${NOISE}, linear-gradient(135deg, ${base}33, #ffffff55)`,
      };
    default:
      return { backgroundColor: base, backgroundImage: sheen };
  }
}

// Dark or light text, whichever reads better on the tape.
export function textColorOn(colorId, pattern) {
  if (pattern === 'frosted') return '#2b2620';
  const hex = colorValue(TAPE_COLORS, colorId).slice(1);
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return 0.299 * r + 0.587 * g + 0.114 * b > 150 ? '#2b2620' : '#ffffff';
}

// Same "random" numbers every time for the same seed.
function seededRandom(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Shape of a tape with torn ends. The tape covers the rectangle you dragged
 * (width × height) completely; the torn ends are added OUTSIDE it, in a
 * margin of `tear` on the two short sides, so tearing never uncovers anything.
 * Returns the box (relative to the rectangle) and a CSS clip-path polygon.
 */
export function tornTapeShape(width, height, seed) {
  const horizontal = width >= height;
  const thickness = horizontal ? height : width;
  const length = horizontal ? width : height;
  const tear = Math.min(14, Math.max(3, thickness * 0.28));
  const teeth = Math.max(3, Math.round(thickness / 7));
  const random = seededRandom(seed);
  const total = length + tear * 2;

  // Jagged edge across the tape at distance `along` from the start, going
  // from one side of the tape to the other. depth 0..1 within the margin.
  const edge = (atStart) => {
    const points = [];
    for (let i = 0; i <= teeth; i++) {
      const across = (i / teeth) * thickness;
      const depth = (i % 2 ? 0.75 : 0.2) + (random() - 0.5) * 0.35;
      const along = atStart ? tear * (1 - Math.min(1, Math.max(0, depth))) : length + tear + tear * Math.min(1, Math.max(0, depth));
      points.push([along, across]);
    }
    return points;
  };
  const start = edge(true); // across 0 → thickness
  const end = edge(false);
  const outline = [...end, ...start.reverse()]; // right side down, left side up
  const toXY = ([along, across]) => (horizontal ? [along, across] : [across, along]);
  const polygon = `polygon(${outline.map((p) => toXY(p).map((v) => `${v.toFixed(1)}px`).join(' ')).join(', ')})`;

  return horizontal
    ? { left: -tear, top: 0, width: total, height, polygon, horizontal }
    : { left: 0, top: -tear, width, height: total, polygon, horizontal };
}

// A small, stable tilt for each post-it (-2.5° … 2.5°), so they look stuck on by hand.
export function tiltFor(id) {
  let hash = 0;
  for (const char of id) hash = (hash * 31 + char.charCodeAt(0)) | 0;
  return ((Math.abs(hash) % 100) / 100) * 5 - 2.5;
}
