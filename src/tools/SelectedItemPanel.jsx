import { useEffect } from 'react';
import { useItem } from '../state/useAnnotations.js';
import { PostItCard } from './PostItCard.jsx';
import { TapeOptions } from './TapeOptions.jsx';

/**
 * The panel for the selected item: an opened post-it, or tape options.
 *   selected: { pageId, itemId, autoFocus }
 */
export function SelectedItemPanel({ store, viewport, pageIndex, selected, mode, onClose, onTapeStyleUsed, onPostItColorUsed }) {
  const item = useItem(store, selected.pageId, selected.itemId);

  // The item disappeared (deleted, undone): close.
  useEffect(() => {
    if (!item) onClose();
  }, [item]);

  if (!item || pageIndex < 0 || !viewport) return null;

  if (item.type === 'postit') {
    const rect = viewport.layout.rects[pageIndex];
    const anchor = {
      index: pageIndex,
      rect: { x: item.x, y: item.y, w: item.size, h: (item.size * rect.w) / rect.h },
    };
    return (
      <PostItCard
        key={item.id}
        store={store}
        viewport={viewport}
        anchor={anchor}
        pageId={selected.pageId}
        itemId={item.id}
        editable={mode === 'edit'}
        autoFocus={selected.autoFocus}
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
