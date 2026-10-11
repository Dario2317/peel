// Editing one item from a panel, with sensible undo steps:
//   - discrete(fields): a click (e.g. a color) = one undo step right away
//   - typing(fields):   typing is saved as you go, and becomes ONE undo step
//                       when you leave the field (commit) or close the panel
import { useEffect, useRef } from 'react';

export function useEditSession(store, pageId, itemId) {
  const startedFrom = useRef(null); // the item before the first keystroke

  const commit = () => {
    const before = startedFrom.current;
    startedFrom.current = null;
    const after = store.getItem(pageId, itemId);
    if (before && after) store.pushHistory([{ pageId, before, after }]);
  };

  useEffect(() => commit, []); // closing the panel commits

  return {
    typing(fields) {
      const item = store.getItem(pageId, itemId);
      if (!item) return;
      if (!startedFrom.current) startedFrom.current = item;
      store.change(pageId, item, { ...item, ...fields }, { history: false });
    },
    discrete(fields) {
      commit();
      const item = store.getItem(pageId, itemId);
      if (item) store.change(pageId, item, { ...item, ...fields });
    },
    remove() {
      commit();
      const item = store.getItem(pageId, itemId);
      if (item) store.change(pageId, item, null);
    },
    commit,
  };
}
