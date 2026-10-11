import { useEffect, useRef, useState } from 'react';
import { useItem } from '../state/useAnnotations.js';
import { colorValue, POSTIT_COLORS } from '../overlay/looks.js';
import { clamp } from '../utils/platform.js';
import { Popover } from './Popover.jsx';
import { NoteSheet } from './NoteSheet.jsx';
import { useEditSession } from './useEditSession.js';
import { CheckIcon, EraserIcon, KeyboardIcon, TrashIcon } from '../ui/icons.jsx';

export const INK_COLORS = [
  { id: 'black', value: '#2b2620' },
  { id: 'blue', value: '#1f5fbf' },
  { id: 'red', value: '#c8332a' },
];

const DEFAULT_SIZE = { width: 340, height: 320 };

/**
 * An opened post-it, next to the note on the page. You draw in it with the
 * Pencil; the keyboard button lets you type or paste text instead. Drag the
 * bottom-right corner to make it bigger. In study mode it is read-only.
 */
export function PostItCard({ store, viewport, anchor, pageId, itemId, editable, startTyping, onClose, onColorUsed }) {
  const item = useItem(store, pageId, itemId);
  const edit = useEditSession(store, pageId, itemId);
  const [pen, setPen] = useState({ color: INK_COLORS[0].value, eraser: false });
  const [typing, setTyping] = useState(Boolean(startTyping));
  const [showColors, setShowColors] = useState(false);
  const resize = useRef(null);

  // Notes made before titles were removed: keep the title as the first line.
  useEffect(() => {
    if (item?.title) {
      const text = item.text ? `${item.title}\n${item.text}` : item.title;
      store.change(pageId, item, { ...item, title: '', text }, { history: false });
    }
  }, []);

  if (!item) return null;

  const width = clamp(item.cardW ?? DEFAULT_SIZE.width, 220, window.innerWidth - 16);
  const height = clamp(item.cardH ?? DEFAULT_SIZE.height, 180, window.innerHeight - 80);

  // Resize by dragging the corner (not an undo step: it's just the view).
  const startResize = (e) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    resize.current = { x: e.clientX, y: e.clientY, width, height };
  };
  const moveResize = (e) => {
    const r = resize.current;
    if (!r) return;
    const current = store.getItem(pageId, itemId);
    store.change(
      pageId,
      current,
      { ...current, cardW: Math.round(r.width + e.clientX - r.x), cardH: Math.round(r.height + e.clientY - r.y) },
      { history: false },
    );
  };
  const endResize = () => {
    resize.current = null;
  };

  const choosePen = (fields) => {
    setPen({ ...pen, eraser: false, ...fields });
    setTyping(false);
  };

  return (
    <Popover
      viewport={viewport}
      anchor={anchor}
      placement="beside"
      className={`postit-card ${editable ? '' : 'read-only'}`}
      style={{ '--note': colorValue(POSTIT_COLORS, item.color), width, height }}
    >
      <div className="card-bar">
        {editable && (
          <>
            {INK_COLORS.map((c) => (
              <button
                key={c.id}
                className={`ink-swatch ${!pen.eraser && !typing && pen.color === c.value ? 'on' : ''}`}
                style={{ '--ink': c.value }}
                aria-label={`Draw in ${c.id}`}
                onClick={() => choosePen({ color: c.value })}
              />
            ))}
            <button
              className={`icon-button small ${pen.eraser && !typing ? 'on' : ''}`}
              onClick={() => choosePen({ eraser: !pen.eraser })}
              aria-label="Eraser"
              title="Eraser"
            >
              <EraserIcon size={18} />
            </button>
            <button
              className={`icon-button small ${typing ? 'on' : ''}`}
              onClick={() => setTyping(!typing)}
              aria-label="Type with the keyboard"
              title="Type"
            >
              <KeyboardIcon size={19} />
            </button>
          </>
        )}
        <span className="spacer" />
        {editable && (
          <>
            <button
              className="swatch note-color"
              style={{ background: colorValue(POSTIT_COLORS, item.color) }}
              onClick={() => setShowColors(!showColors)}
              aria-label="Note color"
              title="Note color"
            />
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
          </>
        )}
        <button className="icon-button small" onClick={onClose} aria-label="Done" title="Done">
          <CheckIcon size={20} />
        </button>
      </div>

      {showColors && editable && (
        <div className="swatches note-colors">
          {POSTIT_COLORS.map((c) => (
            <button
              key={c.id}
              className={`swatch ${item.color === c.id ? 'on' : ''}`}
              style={{ background: c.value }}
              aria-label={`Color ${c.id}`}
              onClick={() => {
                edit.discrete({ color: c.id });
                onColorUsed?.(c.id);
                setShowColors(false);
              }}
            />
          ))}
        </div>
      )}

      <NoteSheet
        store={store}
        pageId={pageId}
        item={item}
        editable={editable}
        pen={pen}
        typing={editable && typing}
        onType={(text) => edit.typing({ text })}
        onTypingDone={edit.commit}
      />

      {editable && (
        <div
          className="card-resize"
          onPointerDown={startResize}
          onPointerMove={moveResize}
          onPointerUp={endResize}
          onPointerCancel={endResize}
          aria-label="Resize note"
        />
      )}
    </Popover>
  );
}
