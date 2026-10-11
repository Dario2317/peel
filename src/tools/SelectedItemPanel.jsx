import { useEffect } from 'react';
import { useItem } from '../state/useAnnotations.js';
import { NoteBoard } from '../board/NoteBoard.jsx';
import { TapeOptions } from './TapeOptions.jsx';

/**
 * What opens when you tap an item: a post-it opens its full-screen board,
 * a tape shows its options next to it.
 *   selected: { pageId, itemId, startTyping }
 */
export function SelectedItemPanel({ store, viewport, pageIndex, selected, mode, onClose, onTapeStyleUsed, onPostItColorUsed }) {
  const item = useItem(store, selected.pageId, selected.itemId);

  // The item disappeared (deleted, undone): close.
  useEffect(() => {
    if (!item) onClose();
  }, [item]);

  if (!item || pageIndex < 0 || !viewport) return null;

  if (item.type === 'postit') {
    return (
      <NoteBoard
        key={item.id}
        store={store}
        pageId={selected.pageId}
        itemId={item.id}
        editable={mode === 'edit'}
        startTyping={selected.startTyping}
        onClose={onClose}
        onColorUsed={onPostItColorUsed}
      />
    );
  }
  if (item.type === 'tape' && mode === 'edit') {
    return (
      <TapeOptions
        key={item.id}
        store={store}
        viewport={viewport}
        anchor={{ index: pageIndex, rect: { x: item.x, y: item.y, w: item.w, h: item.h } }}
        pageId={selected.pageId}
        itemId={item.id}
        onClose={onClose}
        onStyleUsed={onTapeStyleUsed}
      />
    );
  }
  return null;
}
