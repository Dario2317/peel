import { memo, useMemo } from 'react';
import { usePageItems } from '../state/useAnnotations.js';
import { InkLayer } from '../ink/InkLayer.jsx';
import { inkToUnits } from '../ink/pageInk.js';
import { Tape } from './Tape.jsx';
import { PostIt } from './PostIt.jsx';
import './overlay.css';

/**
 * Everything drawn on top of one page. Layers, bottom to top:
 * marker → pen ink → (text boxes, milestone 4) → tape → post-its.
 * Tape is above the ink so it can hide your own handwritten answers too.
 *   overlay: { store, mode, peek, selected, study, lasso } shared by all pages
 *   lasso:   { pageId, ids: Set, box, dx, dy } the lasso selection (page units)
 */
export const PageOverlay = memo(function PageOverlay({ page, pageHeight, scale, overlay }) {
  const { store, mode, peek, selected, study, lasso } = overlay;
  const items = usePageItems(store, page.id);
  const selectedId = selected?.pageId === page.id ? selected.itemId : null;
  // Handles stay the same size on screen at any zoom.
  const handleSize = 28 / (scale || 1);
  const pageLasso = lasso?.pageId === page.id ? lasso : null;

  // Ink in page units (1000 wide), for drawing.
  const strokes = useMemo(
    () => items.filter((i) => i.type === 'ink').map((i) => inkToUnits(i, pageHeight)),
    [items, pageHeight],
  );
  const moving = pageLasso && (pageLasso.dx || pageLasso.dy) ? { ids: pageLasso.ids, dx: pageLasso.dx, dy: pageLasso.dy } : null;
  // Tapes and post-its in the lasso selection move along while dragging.
  const offsetOf = (id) => (moving?.ids.has(id) ? { dx: moving.dx, dy: moving.dy } : null);

  const tapeState = (tape) => {
    if (mode !== 'study') return 'edit';
    const result = study?.results[tape.id];
    if (result) return result; // 'got' | 'missed'
    if (study?.revealedId === tape.id) return 'peeling';
    if (study?.currentId === tape.id) return 'current';
    return 'hidden';
  };

  return (
    <div className="overlay">
      <InkLayer strokes={strokes} moving={moving} />
      {pageLasso?.box && (
        <div
          className="page-selection"
          style={{
            left: pageLasso.box.left + (pageLasso.dx ?? 0),
            top: pageLasso.box.top + (pageLasso.dy ?? 0),
            width: pageLasso.box.right - pageLasso.box.left,
            height: pageLasso.box.bottom - pageLasso.box.top,
          }}
        />
      )}
      {items
        .filter((item) => item.type === 'tape')
        .map((tape) => (
          <Tape
            key={tape.id}
            item={tape}
            pageId={page.id}
            pageHeight={pageHeight}
            state={tapeState(tape)}
            peek={mode === 'edit' && peek}
            selected={mode === 'edit' && selectedId === tape.id}
            handleSize={handleSize}
            offset={offsetOf(tape.id)}
          />
        ))}
      {items
        .filter((item) => item.type === 'postit')
        .map((note) => (
          <PostIt
            key={note.id}
            item={note}
            pageId={page.id}
            pageHeight={pageHeight}
            open={selectedId === note.id}
            offset={offsetOf(note.id)}
          />
        ))}
    </div>
  );
});
