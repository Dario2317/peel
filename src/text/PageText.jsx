import { memo, useLayoutEffect, useRef } from 'react';
import { textCss } from './fonts.js';
import './text.css';

/**
 * A text box on a page. Positions are fractions of the page (x, y, w);
 * the font size is in page units (a page is 1000 wide).
 *   active:  show its frame and handles (move, width, delete)
 *   editing: it's a text field with the keyboard
 *   edit:    { setRef(id), onInput(pageId, id, text), onBlur(pageId, id), onDelete(pageId, id) }
 *   offset:  { dx, dy } while dragged with the lasso (page units)
 */
export const PageText = memo(function PageText({ item, pageId, pageHeight, active, editing, edit, offset }) {
  const fieldRef = useRef(null);
  const style = {
    left: item.x * 1000 + (offset?.dx ?? 0),
    top: item.y * pageHeight + (offset?.dy ?? 0),
    width: item.w * 1000,
    ...textCss(item),
  };

  // The text field grows with its text.
  useLayoutEffect(() => {
    const field = fieldRef.current;
    if (!field) return;
    field.style.height = 'auto';
    field.style.height = `${field.scrollHeight}px`;
  });

  return (
    <div
      className={`page-text ${active || editing ? 'active' : ''}`}
      style={style}
      data-item-id={editing ? undefined : item.id}
      data-page-id={pageId}
      data-text-id={item.id}
    >
      {editing ? (
        <textarea
          ref={(el) => {
            fieldRef.current = el;
            edit.setRef(item.id, el);
          }}
          defaultValue={item.text}
          rows={1}
          autoCapitalize="sentences"
          onInput={(e) => edit.onInput(pageId, item.id, e.target.value)}
          onBlur={() => edit.onBlur(pageId, item.id)}
        />
      ) : (
        item.text
      )}
      {(active || editing) && (
        <>
          <div className="text-grip" data-text-move={item.id} data-page-id={pageId} title="Drag to move" onMouseDown={(e) => e.preventDefault()} />
          <div className="text-width" data-text-width={item.id} data-page-id={pageId} title="Drag to change the width" onMouseDown={(e) => e.preventDefault()} />
          <button
            className="text-x"
            aria-label="Delete text"
            title="Delete text"
            onPointerDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
              edit.onDelete(pageId, item.id);
            }}
          >
            ×
          </button>
        </>
      )}
    </div>
  );
});
