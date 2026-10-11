import { memo } from 'react';
import { colorValue, POSTIT_COLORS, tiltFor } from './looks.js';

// A closed post-it note: a small square with a folded corner and a shadow,
// so it's clear it can be opened. Shows its title, or lines if it has text.
export const PostIt = memo(function PostIt({ item, pageId, pageHeight, open }) {
  const size = item.size * 1000;
  return (
    <div
      className={`postit ${open ? 'open' : ''}`}
      data-item-id={item.id}
      data-page-id={pageId}
      role="button"
      aria-label={item.title ? `Note: ${item.title}` : 'Note'}
      style={{
        left: item.x * 1000,
        top: item.y * pageHeight,
        width: size,
        height: size,
        '--note': colorValue(POSTIT_COLORS, item.color),
        '--tilt': `${tiltFor(item.id)}deg`,
      }}
    >
      <div className="postit-paper">
        {item.title ? (
          <span className="postit-title" style={{ fontSize: size * 0.2 }}>
            {item.title}
          </span>
        ) : (
          item.text && <span className="postit-lines" />
        )}
      </div>
    </div>
  );
});
