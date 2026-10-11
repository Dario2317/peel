import { memo } from 'react';
import { strokePath } from './ink.js';
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

  const group = (list) => (
    <>
      {list.filter((s) => !isMoving(s)).map((s) => renderStroke(s, dark))}
      {moving && <g transform={offset}>{list.filter(isMoving).map((s) => renderStroke(s, dark))}</g>}
    </>
  );

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

// Freehand strokes are filled outlines; shapes are drawn as clean lines.
function renderStroke(s, dark) {
  const color = s.tool === 'highlighter' ? s.color : displayColor(s.color, dark);
  if (s.shape) {
    return (
      <path
        key={s.id}
        d={shapePath(s.shape, s.size)}
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
