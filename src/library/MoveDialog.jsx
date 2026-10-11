import { useEffect } from 'react';
import { createFolder, folderTree, subfolderIds } from '../db/folders.js';
import { askText } from '../ui/dialogs.jsx';
import { FolderIcon, NewFolderIcon } from '../ui/icons.jsx';
import { moveItem } from './dragDrop.js';

/**
 * "Move to…": pick the folder a notebook or folder goes in.
 *   item:    { kind: 'notebook' | 'folder', id, name, folderId (where it is now) }
 *   folders: every folder
 *   here:    the folder the library is showing (a new folder is made there)
 */
export function MoveDialog({ item, folders, here, onClose }) {
  // A folder can't go inside itself or its own subfolders.
  const blocked = item.kind === 'folder' ? subfolderIds(folders, item.id).add(item.id) : new Set();
  const rows = folderTree(folders);

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const moveTo = async (folderId) => {
    onClose();
    if (folderId !== item.folderId) await moveItem(item, folderId);
  };

  const newFolder = async () => {
    const name = await askText({ title: 'New folder', initial: '', confirmLabel: 'Create' });
    if (name === null) return;
    moveTo(await createFolder(name, here));
  };

  const row = (folderId, label, depth) => (
    <button
      key={folderId ?? 'top'}
      className={`folder-row ${folderId === item.folderId ? 'current' : ''}`}
      style={{ paddingLeft: 12 + depth * 22 }}
      disabled={blocked.has(folderId)}
      onClick={() => moveTo(folderId)}
    >
      <FolderIcon size={20} />
      <span>{label}</span>
      {folderId === item.folderId && <span className="muted small">Here now</span>}
    </button>
  );

  return (
    <div className="dialog-backdrop" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dialog move-dialog">
        <h2>Move “{item.name}”</h2>
        <div className="folder-list">
          {row(null, 'Library (top)', 0)}
          {rows.map(({ folder, depth }) => row(folder.id, folder.name, depth + 1))}
        </div>
        <div className="dialog-buttons">
          <button className="button" onClick={newFolder}>
            <NewFolderIcon size={18} /> New folder
          </button>
          <span className="spacer" />
          <button className="button" onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
