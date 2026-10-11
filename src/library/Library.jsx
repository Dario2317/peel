import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db.js';
import { useFileIntake } from '../import/useFileIntake.js';
import { ImportDialog } from '../import/ImportDialog.jsx';
import { NotebookCard } from './NotebookCard.jsx';
import { InstallHint } from './InstallHint.jsx';
import { StorageInfo } from './StorageInfo.jsx';
import { ImportIcon, PasteIcon } from '../ui/icons.jsx';
import '../styles/library.css';

export function Library({ onOpen }) {
  // Most recently opened first. useLiveQuery re-runs when notebooks change.
  const notebooks = useLiveQuery(async () => {
    const list = await db.notebooks.toArray();
    return list.sort((a, b) => (b.openedAt ?? b.createdAt) - (a.openedAt ?? a.createdAt));
  }, []);
  const [incoming, setIncoming] = useState(null); // files waiting for the import dialog
  const { pick, pasteFromClipboard, dragging } = useFileIntake(setIncoming, !incoming);

  return (
    <div className="library">
      <header className="library-header">
        <h1>Peel</h1>
        <div className="header-actions">
          <button className="button" onClick={pasteFromClipboard}>
            <PasteIcon size={18} /> Paste
          </button>
          <button className="button primary" onClick={pick}>
            <ImportIcon size={18} /> Import
          </button>
        </div>
      </header>

      <main className="library-main">
        <InstallHint />

        {notebooks && notebooks.length === 0 && (
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

        <div className="notebook-grid">
          {notebooks?.map((notebook) => (
            <NotebookCard key={notebook.id} notebook={notebook} onOpen={() => onOpen(notebook.id)} />
          ))}
        </div>

        <StorageInfo />
      </main>

      {dragging && <div className="drop-overlay">Drop to make a new notebook</div>}

      {incoming && (
        <ImportDialog
          files={incoming}
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
