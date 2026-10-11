import { memo } from 'react';
import { strokePath } from './ink.js';
import { HIGHLIGHT_OPACITY } from './inkStyle.js';

/**
 * Draws finished strokes as SVG (sharp at every zoom).
 * Highlighter strokes are see-through and drawn under the pen strokes;
 * they're grouped so overlapping highlights don't get darker and darker.
 */
export const InkLayer = memo(function InkLayer({ strokes, className = '' }) {
  const highlights = strokes.filter((s) => s.tool === 'highlighter');
  const pens = strokes.filter((s) => s.tool !== 'highlighter');
  return (
    <svg className={`ink-layer ${className}`} aria-hidden="true">
      {highlights.length > 0 && (
        <g opacity={HIGHLIGHT_OPACITY} style={{ mixBlendMode: 'multiply' }}>
          {highlights.map((s) => (
            <path key={s.id} d={strokePath(s)} fill={s.color} />
          ))}
        </g>
      )}
      {pens.map((s) => (
        <path key={s.id} d={strokePath(s)} fill={s.color} />
      ))}
    </svg>
  );
});
