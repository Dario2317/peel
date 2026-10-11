import { memo } from 'react';
import { usePageItems } from '../state/useAnnotations.js';
import { Tape } from './Tape.jsx';
import { PostIt } from './PostIt.jsx';
import './overlay.css';

/**
 * Everything drawn on top of one page. Layers, bottom to top:
 * (ink and text boxes come in later milestones) → tape → post-its.
 *   overlay: { store, mode, peek, selected, study } shared by all pages
 */
export const PageOverlay = memo(function PageOverlay({ page, pageHeight, scale, overlay }) {
  const { store, mode, peek, selected, study } = overlay;
  const items = usePageItems(store, page.id);
  const selectedId = selected?.pageId === page.id ? selected.itemId : null;
  // Handles stay the same size on screen at any zoom.
  const handleSize = 28 / (scale || 1);

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
          />
        ))}
      {items
        .filter((item) => item.type === 'postit')
        .map((note) => (
          <PostIt key={note.id} item={note} pageId={page.id} pageHeight={pageHeight} open={selectedId === note.id} />
        ))}
    </div>
  );
});
