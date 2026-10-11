import { memo } from 'react';
import { colorValue, POSTIT_COLORS, tiltFor } from './looks.js';

// A closed post-it: a small see-through note pinned to the page. It keeps
// the same size on screen at every zoom (CSS divides by --zoom), so it's
// always easy to tap and never covers half the page. Tap it to open its board.
export const PostIt = memo(function PostIt({ item, pageId, pageHeight, open }) {
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
        '--note': colorValue(POSTIT_COLORS, item.color),
        '--tilt': `${tiltFor(item.id)}deg`,
      }}
    >
      <div className="postit-paper" />
    </div>
  );
});
