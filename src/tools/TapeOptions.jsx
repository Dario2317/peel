import { useItem } from '../state/useAnnotations.js';
import { TAPE_COLORS, TAPE_PATTERNS, tapeBackground } from '../overlay/looks.js';
import { Popover } from './Popover.jsx';
import { useEditSession } from './useEditSession.js';
import { CheckIcon, TrashIcon } from '../ui/icons.jsx';

// Options for the selected tape: color, pattern, the question written on it,
// delete. Drag the tape to move it; drag its corners to resize it.
export function TapeOptions({ store, viewport, anchor, pageId, itemId, onClose, onStyleUsed }) {
  const item = useItem(store, pageId, itemId);
  const edit = useEditSession(store, pageId, itemId);
  if (!item) return null;

  const setStyle = (fields) => {
    edit.discrete(fields);
    onStyleUsed?.({ color: item.color, pattern: item.pattern, ...fields });
  };

  return (
    <Popover viewport={viewport} anchor={anchor} placement="below" className="tape-options">
      <div className="swatches">
        {TAPE_COLORS.map((c) => (
          <button
            key={c.id}
            className={`swatch ${item.color === c.id ? 'on' : ''}`}
            style={{ background: c.value }}
            aria-label={`Color ${c.id}`}
            onClick={() => setStyle({ color: c.id })}
          />
        ))}
      </div>
      <div className="patterns">
        {TAPE_PATTERNS.map((p) => (
          <button
            key={p}
            className={`pattern ${item.pattern === p ? 'on' : ''}`}
            style={tapeBackground(item.color, p)}
            aria-label={`Pattern ${p}`}
            title={p}
            onClick={() => setStyle({ pattern: p })}
          />
        ))}
      </div>
      <input
        className="text-input"
        value={item.question}
        placeholder="Question on the tape (optional)"
        maxLength={80}
        onChange={(e) => edit.typing({ question: e.target.value })}
        onBlur={edit.commit}
      />
      <div className="card-actions">
        <button
          className="button small"
          onClick={() => {
            edit.remove();
            onClose();
          }}
        >
          <TrashIcon size={16} /> Delete
        </button>
        <button className="button small primary" onClick={onClose}>
          <CheckIcon size={16} /> Done
        </button>
      </div>
    </Popover>
  );
}
