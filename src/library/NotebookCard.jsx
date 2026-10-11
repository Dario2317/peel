import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db.js';
import { deleteNotebook, renameNotebook } from '../db/notebooks.js';
import { useThumbnailUrl } from '../viewer/thumbnails.js';
import { askConfirm, askText } from '../ui/dialogs.jsx';
import { Menu } from '../ui/Menu.jsx';
import { MoreIcon } from '../ui/icons.jsx';

export function NotebookCard({ notebook, onOpen }) {
  const coverId = notebook.coverPageId ?? notebook.pageIds[0];
  const coverPage = useLiveQuery(() => (coverId ? db.pages.get(coverId) : undefined), [coverId]);
  const coverUrl = useThumbnailUrl(coverPage);
  const count = notebook.pageIds.length;

  const rename = async () => {
    const title = await askText({ title: 'Rename notebook', initial: notebook.title });
    if (title !== null) renameNotebook(notebook.id, title);
  };

  const remove = async () => {
    const ok = await askConfirm({
      title: `Delete “${notebook.title}”?`,
      message: 'Its pages and all your notes on them will be removed from this device. This cannot be undone.',
      confirmLabel: 'Delete',
      danger: true,
    });
    if (ok) deleteNotebook(notebook.id);
  };

  return (
    <div className="notebook-card">
      <button className="cover" onClick={onOpen} aria-label={`Open ${notebook.title}`}>
        {coverUrl ? <img src={coverUrl} alt="" draggable={false} /> : <div className="cover-placeholder" />}
      </button>
      <div className="card-info">
        <button className="card-title" onClick={onOpen}>
          <strong>{notebook.title}</strong>
          <span className="muted small">
            {count} page{count === 1 ? '' : 's'}
          </span>
        </button>
        <Menu
          label="Notebook options"
          icon={<MoreIcon />}
          items={[
            { label: 'Rename', onSelect: rename },
            { label: 'Delete', onSelect: remove, danger: true },
          ]}
        />
      </div>
    </div>
  );
}
