// Dragging notebooks and folders onto a folder (or onto a folder name in
// the path at the top) moves them there. Works with the mouse, and on the
// iPad by touching and holding a card, then dragging it.
import { useState } from 'react';
import { moveNotebook } from '../db/notebooks.js';
import { moveFolder } from '../db/folders.js';
import { showToast } from '../ui/toast.jsx';

let dragged = null; // { kind: 'notebook' | 'folder', id }

// Props for a card that can be picked up.
export function dragSource(kind, id) {
  return {
    draggable: true,
    onDragStart(e) {
      dragged = { kind, id };
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', ''); // some browsers only drag with data
      e.currentTarget.classList.add('is-dragged');
    },
    onDragEnd(e) {
      dragged = null;
      e.currentTarget.classList.remove('is-dragged');
    },
  };
}

// Props for something you can drop on (folderId null = top of the library),
// and whether something is being held over it right now.
export function useDropTarget(folderId) {
  const [over, setOver] = useState(false);
  const accepts = () => dragged && !(dragged.kind === 'folder' && dragged.id === folderId);
  const props = {
    onDragOver(e) {
      if (!accepts()) return;
      e.preventDefault(); // allows dropping here
      e.dataTransfer.dropEffect = 'move';
      setOver(true);
    },
    onDragLeave(e) {
      if (!e.currentTarget.contains(e.relatedTarget)) setOver(false);
    },
    onDrop(e) {
      setOver(false);
      if (!accepts()) return;
      e.preventDefault();
      const item = dragged;
      dragged = null;
      moveItem(item, folderId);
    },
  };
  return { props, over };
}

export async function moveItem({ kind, id }, folderId) {
  if (kind === 'notebook') return moveNotebook(id, folderId);
  if (!(await moveFolder(id, folderId))) showToast('A folder can’t go inside itself.');
}
