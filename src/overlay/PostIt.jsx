import { memo } from 'react';
import { colorValue, POSTIT_COLORS, tiltFor } from './looks.js';

// A closed post-it note: a plain, see-through square with a folded corner,
// so the page stays readable under it and it's clear it can be opened.
// While it's open (in edit mode) a corner handle lets you resize it.
export const PostIt = memo(function PostIt({ item, pageId, pageHeight, open, resizable, handleSize }) {
  const size = item.size * 1000;
  return (
    <div
      className={`postit ${open ? 'open' : ''}`}
      data-item-id={item.id}
      data-page-id={pageId}
      role="button"
      aria-label="Note"
      style={{
        left: item.x * 1000,
        top: item.y * pageHeight,
        width: size,
        height: size,
        '--note': colorValue(POSTIT_COLORS, item.color),
        '--tilt': `${tiltFor(item.id)}deg`,
      }}
    >
      <div className="postit-paper" />
      {open && resizable && (
        <div
          className="handle se"
          data-handle="se"
          style={{ width: handleSize, height: handleSize, margin: -handleSize / 2 }}
        />
      )}
    </div>
  );
});
