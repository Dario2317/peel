import { useEffect, useRef } from 'react';
import { useItem } from '../state/useAnnotations.js';
import { colorValue, POSTIT_COLORS } from '../overlay/looks.js';
import { Popover } from './Popover.jsx';
import { useEditSession } from './useEditSession.js';
import { CheckIcon, TrashIcon } from '../ui/icons.jsx';

/**
 * An opened post-it. In edit mode you can write in it (real text fields, so
 * iPadOS Scribble works), change its color or delete it. In study mode it is
 * read-only.
 */
export function PostItCard({ store, viewport, anchor, pageId, itemId, editable, autoFocus, onClose, onColorUsed }) {
  const item = useItem(store, pageId, itemId);
  const edit = useEditSession(store, pageId, itemId);
  const textRef = useRef(null);

  useEffect(() => {
    if (autoFocus) textRef.current?.focus();
  }, []);

  if (!item) return null;

  return (
    <Popover
      viewport={viewport}
      anchor={anchor}
      placement="over"
      className="postit-card"
      style={{ '--note': colorValue(POSTIT_COLORS, item.color) }}
    >
      {editable ? (
        <>
          <div className="card-bar">
            <div className="swatches">
              {POSTIT_COLORS.map((c) => (
                <button
                  key={c.id}
                  className={`swatch ${item.color === c.id ? 'on' : ''}`}
                  style={{ background: c.value }}
                  aria-label={`Color ${c.id}`}
                  onClick={() => {
                    edit.discrete({ color: c.id });
                    onColorUsed?.(c.id);
                  }}
                />
              ))}
            </div>
            <button
              className="icon-button small"
              onClick={() => {
                edit.remove();
                onClose();
              }}
              aria-label="Delete note"
              title="Delete"
            >
              <TrashIcon size={18} />
            </button>
            <button className="icon-button small" onClick={onClose} aria-label="Done" title="Done">
              <CheckIcon size={20} />
            </button>
          </div>
          <input
            className="card-title"
            value={item.title}
            placeholder="Title (optional)"
            maxLength={60}
            onChange={(e) => edit.typing({ title: e.target.value })}
            onBlur={edit.commit}
          />
          <textarea
            ref={textRef}
            className="card-text"
            value={item.text}
            placeholder="Write your note…"
            onChange={(e) => edit.typing({ text: e.target.value })}
            onBlur={edit.commit}
          />
        </>
      ) : (
        <>
          <div className="card-bar">
            <strong className="card-title read">{item.title || 'Note'}</strong>
            <button className="icon-button small" onClick={onClose} aria-label="Close">
              <CheckIcon size={20} />
            </button>
          </div>
          <div className="card-text read">{item.text || <span className="muted">(empty)</span>}</div>
        </>
      )}
    </Popover>
  );
}
