// React hooks for the AnnotationStore. useSyncExternalStore is React's way
// to read data that lives outside React and re-render when it changes.
import { useEffect, useState, useSyncExternalStore } from 'react';
import { AnnotationStore } from './AnnotationStore.js';

// Creates the store for a notebook, loads it, and saves when leaving.
export function useNotebookStore(notebookId) {
  const [state, setState] = useState({ store: null, notebookId: null });

  useEffect(() => {
    const store = new AnnotationStore(notebookId);
    let alive = true;
    store.loadAll().then(() => alive && setState({ store, notebookId }));

    // Save right away when the app is hidden or closed.
    const flush = () => store.flush();
    const onVisibility = () => document.visibilityState === 'hidden' && flush();
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', flush);
    return () => {
      alive = false;
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', flush);
      flush();
    };
  }, [notebookId]);

  return state.notebookId === notebookId ? state.store : null;
}

// The items of one page; re-renders only when that page changes.
export function usePageItems(store, pageId) {
  return useSyncExternalStore(
    (callback) => store.subscribePage(pageId, callback),
    () => store.getItems(pageId),
  );
}

// One item (or null), e.g. for the post-it editor.
export function useItem(store, pageId, itemId) {
  const items = usePageItems(store, pageId);
  return items.find((item) => item.id === itemId) ?? null;
}

// { canUndo, canRedo }, for the toolbar buttons.
export function useHistoryState(store) {
  useSyncExternalStore(
    (callback) => store.subscribe(callback),
    () => store.version,
  );
  return { canUndo: store.canUndo, canRedo: store.canRedo };
}
