import { memo } from 'react';
import { isLineStroke, strokePath } from './ink.js';
import { shapePath } from './shapes.js';
import { displayColor, HIGHLIGHT_OPACITY } from './inkStyle.js';

/**
 * Draws finished strokes as SVG (sharp at every zoom).
 * Highlighter strokes are see-through and drawn under the pen strokes;
 * they're grouped so overlapping highlights don't get darker and darker.
 *   dark:   the background is black (black ink is then shown white)
 *   moving: { ids: Set, dx, dy } strokes being dragged with the lasso
 */
export const InkLayer = memo(function InkLayer({ strokes, dark = false, moving = null, className = '' }) {
  const isMoving = (s) => moving?.ids.has(s.id);
  const highlights = strokes.filter((s) => s.tool === 'highlighter');
  const pens = strokes.filter((s) => s.tool !== 'highlighter');
  const offset = moving ? `translate(${moving.dx} ${moving.dy})` : undefined;

  const group = (list) => {
    const still = moving ? list.filter((s) => !isMoving(s)) : list;
    return (
      <>
        {chunks(still).map((chunk, i) => <StrokeChunk key={i} strokes={chunk} dark={dark} />)}
        {moving && <g transform={offset}>{list.filter(isMoving).map((s) => renderStroke(s, dark))}</g>}
      </>
    );
  };

  return (
    <svg className={`ink-layer ${className}`} aria-hidden="true">
      {highlights.length > 0 && (
        <g opacity={HIGHLIGHT_OPACITY} style={{ mixBlendMode: dark ? 'screen' : 'multiply' }}>
          {group(highlights)}
        </g>
      )}
      {group(pens)}
    </svg>
  );
});

// A page can hold hundreds of strokes. Adding one shouldn't make React go
// through all of them again: they're drawn in groups of CHUNK, and a group
// whose strokes are all the same as last time is skipped.
const CHUNK = 50;
function chunks(list) {
  const out = [];
  for (let i = 0; i < list.length; i += CHUNK) out.push(list.slice(i, i + CHUNK));
  return out;
}
const sameStrokes = (a, b) => a.dark === b.dark && a.strokes.length === b.strokes.length && a.strokes.every((s, i) => s === b.strokes[i]);
const StrokeChunk = memo(function StrokeChunk({ strokes, dark }) {
  return strokes.map((s) => renderStroke(s, dark));
}, sameStrokes);

// Shapes and strokes without pressure are lines with a round tip; strokes
// with pressure are filled outlines (thinner and thicker).
function renderStroke(s, dark) {
  const color = s.tool === 'highlighter' ? s.color : displayColor(s.color, dark);
  if (s.shape || isLineStroke(s)) {
    return (
      <path
        key={s.id}
        d={s.shape ? shapePath(s.shape, s.size) : strokePath(s)}
        fill="none"
        stroke={color}
        strokeWidth={s.size}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    );
  }
  return <path key={s.id} d={strokePath(s)} fill={color} />;
}
