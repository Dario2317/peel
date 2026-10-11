import { memo } from 'react';
import { tapeBackground, textColorOn, tornTapeShape } from './looks.js';

const HANDLES = ['nw', 'ne', 'sw', 'se'];

/**
 * One piece of tape. Sizes are in page units (the page is 1000 wide).
 *   state: 'edit' | 'hidden' | 'current' | 'peeling' | 'got' | 'missed'
 *          (all but 'edit' are study mode)
 */
export const Tape = memo(function Tape({ item, pageId, pageHeight, state, peek, selected, handleSize }) {
  const left = item.x * 1000;
  const top = item.y * pageHeight;
  const width = item.w * 1000;
  const height = item.h * pageHeight;
  const shape = tornTapeShape(width, height, item.seed);
  const peeled = state === 'peeling' || state === 'got' || state === 'missed';
  const fontSize = Math.max(8, Math.min((shape.horizontal ? height : width) * 0.42, 40));

  return (
    <div
      className={`tape state-${state} ${peek ? 'peek' : ''} ${selected ? 'selected' : ''} ${item.draft ? 'draft' : ''}`}
      data-item-id={item.id}
      data-page-id={pageId}
      style={{ left, top, width, height }}
      role="button"
      aria-label={item.question ? `Tape: ${item.question}` : 'Tape'}
    >
      {/* Where the tape was, once it has been peeled off */}
      {peeled && <div className="tape-outline" />}
      {(state === 'got' || state === 'missed') && (
        <div className={`tape-badge ${state}`}>{state === 'got' ? '✓' : '✗'}</div>
      )}

      {state !== 'got' && state !== 'missed' && (
        <div
          className={`tape-body ${state === 'peeling' ? 'peel' : ''}`}
          style={{
            left: shape.left,
            top: shape.top,
            width: shape.width,
            height: shape.height,
            clipPath: shape.polygon,
            ...tapeBackground(item.color, item.pattern),
          }}
        >
          {item.question && (
            <span
              className="tape-question"
              style={{
                color: textColorOn(item.color, item.pattern),
                fontSize,
                writingMode: shape.horizontal ? 'horizontal-tb' : 'vertical-rl',
                padding: shape.horizontal ? `0 ${-shape.left + 4}px` : `${-shape.top + 4}px 0`,
              }}
            >
              {item.question}
            </span>
          )}
        </div>
      )}

      {selected &&
        HANDLES.map((h) => (
          <div
            key={h}
            className={`handle ${h}`}
            data-handle={h}
            style={{ width: handleSize, height: handleSize, margin: -handleSize / 2 }}
          />
        ))}
    </div>
  );
});
