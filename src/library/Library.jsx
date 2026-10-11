import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db.js';
import { createFolder, deleteFolder, folderPath, sortFolders, subfolderIds } from '../db/folders.js';
import { useFileIntake } from '../import/useFileIntake.js';
import { ImportDialog } from '../import/ImportDialog.jsx';
import { NotebookCard } from './NotebookCard.jsx';
import { FolderCard } from './FolderCard.jsx';
import { MoveDialog } from './MoveDialog.jsx';
import { InstallHint } from './InstallHint.jsx';
import { StorageInfo } from './StorageInfo.jsx';
import { useDropTarget } from './dragDrop.js';
import { askChoice, askConfirm, askText } from '../ui/dialogs.jsx';
import { BackIcon, ChevronIcon, ImportIcon, NewFolderIcon, PasteIcon } from '../ui/icons.jsx';
import '../styles/library.css';

const recentFirst = (a, b) => (b.openedAt ?? b.createdAt) - (a.openedAt ?? a.createdAt);
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

/**
 * The library: folders and notebooks. folderId = the folder shown (null =
 * the top of the library).
 */
export function Library({ folderId = null, onOpen, onOpenFolder }) {
  // useLiveQuery re-runs when notebooks or folders change.
  const data = useLiveQuery(async () => {
    const [notebooks, folders] = await Promise.all([db.notebooks.toArray(), db.folders.toArray()]);
    return { notebooks, folders };
  }, []);
  const [incoming, setIncoming] = useState(null); // files waiting for the import dialog
  const [moving, setMoving] = useState(null); // the item in the "Move to…" dialog
  const { pick, pasteFromClipboard, dragging } = useFileIntake(setIncoming, !incoming);

  const allFolders = data?.folders ?? [];
  const allNotebooks = data?.notebooks ?? [];
  const folder = folderId ? allFolders.find((f) => f.id === folderId) : null;
  const here = folder?.id ?? null;

  // The folder was deleted (or the link is old): go to the top.
  useEffect(() => {
    if (data && folderId && !folder) onOpenFolder(null);
  }, [data, folderId, folder]);

  const folders = sortFolders(allFolders.filter((f) => (f.parentId ?? null) === here));
  const notebooks = allNotebooks.filter((n) => (n.folderId ?? null) === here).sort(recentFirst);
  const path = folder ? folderPath(allFolders, folder.id) : [];
  const empty = data && !folders.length && !notebooks.length;

  const inside = (id) => ({
    folders: allFolders.filter((f) => f.parentId === id),
    notebooks: allNotebooks.filter((n) => n.folderId === id),
  });
  // The most recent notebook anywhere in a folder (its cover peeks out).
  const latestIn = (id) => {
    const ids = subfolderIds(allFolders, id).add(id);
    return allNotebooks.filter((n) => ids.has(n.folderId)).sort(recentFirst)[0] ?? null;
  };

  const newFolder = async () => {
    const name = await askText({ title: 'New folder', initial: '', confirmLabel: 'Create' });
    if (name !== null) createFolder(name, here);
  };

  const removeFolder = async (f) => {
    const ids = subfolderIds(allFolders, f.id).add(f.id);
    const count = allNotebooks.filter((n) => ids.has(n.folderId)).length;
    if (!count && ids.size === 1) {
      const ok = await askConfirm({ title: `Delete “${f.name}”?`, message: 'The folder is empty.', confirmLabel: 'Delete', danger: true });
      if (ok) deleteFolder(f.id, { keepContents: true });
      return;
    }
    const choice = await askChoice({
      title: `Delete “${f.name}”?`,
      message: `It has ${plural(count, 'notebook')} inside${ids.size > 1 ? ' (counting its subfolders)' : ''}.`,
      choices: [
        { label: 'Delete only the folder, keep what’s inside', value: 'keep' },
        { label: `Delete the folder and ${count === 1 ? 'its notebook' : 'everything in it'}`, value: 'all', danger: true },
      ],
    });
    if (choice) deleteFolder(f.id, { keepContents: choice === 'keep' });
  };

  return (
    <div className="library">
      <header className="library-header">
        {folder ? (
          <div className="library-title">
            <button className="icon-button" onClick={() => onOpenFolder(folder.parentId ?? null)} aria-label="Back">
              <BackIcon />
            </button>
            <div className="library-title-text">
              <nav className="crumbs">
                <Crumb folderId={null} label="Library" onOpen={onOpenFolder} />
                {path.slice(0, -1).map((f) => (
                  <Crumb key={f.id} folderId={f.id} label={f.name} onOpen={onOpenFolder} />
                ))}
              </nav>
              <h1>{folder.name}</h1>
            </div>
          </div>
        ) : (
          <h1>Peel</h1>
        )}
        <div className="header-actions">
          <button className="button" onClick={newFolder} aria-label="New folder">
            <NewFolderIcon size={18} /> <span className="label">New folder</span>
          </button>
          <button className="button" onClick={pasteFromClipboard} aria-label="Paste">
            <PasteIcon size={18} /> <span className="label">Paste</span>
          </button>
          <button className="button primary" onClick={pick}>
            <ImportIcon size={18} /> Import
          </button>
        </div>
      </header>

      <main className="library-main">
        {!folder && <InstallHint />}

        {empty && !folder && (
          <div className="empty-state">
            <h2>Your study desk is empty</h2>
            <p>
              Import screenshots or a PDF of a book you own. Pick files, drop them here, or paste
              an image.
            </p>
            <button className="button primary large" onClick={pick}>
              <ImportIcon size={20} /> Import pages
            </button>
          </div>
        )}
        {empty && folder && (
          <div className="empty-state">
            <h2>This folder is empty</h2>
            <p>
              Import pages here, or bring notebooks in: drag them onto the folder, or use ··· → Move to…
            </p>
          </div>
        )}

        <div className="notebook-grid">
          {folders.map((f) => {
            const content = inside(f.id);
            const parts = [
              content.folders.length && plural(content.folders.length, 'folder'),
              content.notebooks.length && plural(content.notebooks.length, 'notebook'),
            ].filter(Boolean);
            return (
              <FolderCard
                key={f.id}
                folder={f}
                preview={latestIn(f.id)}
                summary={parts.join(' · ') || 'Empty'}
                onOpen={() => onOpenFolder(f.id)}
                onMove={() => setMoving({ kind: 'folder', id: f.id, name: f.name, folderId: here })}
                onDelete={() => removeFolder(f)}
              />
            );
          })}
          {notebooks.map((notebook) => (
            <NotebookCard
              key={notebook.id}
              notebook={notebook}
              onOpen={() => onOpen(notebook.id)}
              onMove={() => setMoving({ kind: 'notebook', id: notebook.id, name: notebook.title, folderId: here })}
            />
          ))}
        </div>

        {!folder && <StorageInfo />}
      </main>

      {dragging && <div className="drop-overlay">Drop to make a new notebook{folder ? ` in “${folder.name}”` : ''}</div>}

      {moving && <MoveDialog item={moving} folders={allFolders} here={here} onClose={() => setMoving(null)} />}

      {incoming && (
        <ImportDialog
          files={incoming}
          folderId={here}
          onClose={() => setIncoming(null)}
          onDone={(notebookId) => {
            setIncoming(null);
            if (notebookId) onOpen(notebookId);
          }}
        />
      )}
    </div>
  );
}

// A folder name in the path at the top: tap to go there, or drop things on it.
function Crumb({ folderId, label, onOpen }) {
  const drop = useDropTarget(folderId);
  return (
    <>
      <button className={`crumb ${drop.over ? 'drop-over' : ''}`} onClick={() => onOpen(folderId)} {...drop.props}>
        {label}
      </button>
      <ChevronIcon size={14} />
    </>
  );
}
