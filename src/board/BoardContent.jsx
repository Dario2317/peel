import { InkLayer } from '../ink/InkLayer.jsx';
import { displayColor } from '../ink/inkStyle.js';

/**
 * What's on a post-it board: the ink and the text boxes, in board units.
 * Used twice: on the board itself, and magnified in the zoom window.
 *   moving:  { strokeIds, textIds, dx, dy } things being dragged with the lasso
 *   editing: props for the text box being edited (only on the main board)
 */
export function BoardContent({ note, dark, moving = null, editing = null }) {
  const texts = note.texts ?? [];
  const inkMoving = moving && { ids: moving.strokeIds, dx: moving.dx, dy: moving.dy };

  return (
    <>
      <InkLayer strokes={note.ink ?? []} dark={dark} moving={inkMoving} />
      {texts.map((box) => {
        const offset = moving?.textIds.has(box.id) ? moving : null;
        const left = box.x + (offset?.dx ?? 0);
        const top = box.y + (offset?.dy ?? 0);
        const color = displayColor(box.color, dark);

        if (editing && editing.id === box.id) {
          return (
            <div key={box.id} className="board-textbox editing" style={{ left, top, width: box.w }}>
              {/* Drag to move; × to delete. They keep the keyboard open. */}
              <div className="text-handle" data-text-handle={box.id} title="Drag to move" onMouseDown={(e) => e.preventDefault()} />
              <button
                className="text-delete"
                aria-label="Delete text"
                title="Delete text"
                onPointerDown={(e) => {
                  e.preventDefault();
                  editing.onDelete(box.id);
                }}
              >
                ×
              </button>
              <textarea
                ref={editing.setRef(box.id)}
                defaultValue={box.text}
                rows={1}
                style={{ color, fontSize: box.size }}
                onInput={(e) => editing.onInput(box.id, e.target.value)}
                onBlur={() => editing.onBlur(box.id)}
              />
            </div>
          );
        }
        return (
          <div
            key={box.id}
            className="board-textbox"
            data-text-id={box.id}
            style={{ left, top, width: box.w, color, fontSize: box.size }}
          >
            {box.text}
          </div>
        );
      })}
    </>
  );
}
