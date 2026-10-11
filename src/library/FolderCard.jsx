import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db.js';
import { renameFolder } from '../db/folders.js';
import { useThumbnailUrl } from '../viewer/thumbnails.js';
import { askText } from '../ui/dialogs.jsx';
import { Menu } from '../ui/Menu.jsx';
import { MoreIcon } from '../ui/icons.jsx';
import { dragSource, useDropTarget } from './dragDrop.js';

/**
 * A folder in the library grid. Shows the cover of a notebook inside it.
 *   preview:  a notebook in the folder (for the cover peeking out), or null
 *   summary:  e.g. "3 notebooks"
 */
export function FolderCard({ folder, preview, summary, onOpen, onMove, onDelete }) {
  const coverId = preview && (preview.coverPageId ?? preview.pageIds[0]);
  const coverPage = useLiveQuery(() => (coverId ? db.pages.get(coverId) : undefined), [coverId]);
  const coverUrl = useThumbnailUrl(coverPage);
  const drop = useDropTarget(folder.id);

  const rename = async () => {
    const name = await askText({ title: 'Rename folder', initial: folder.name });
    if (name !== null) renameFolder(folder.id, name);
  };

  return (
    <div className={`notebook-card folder-card ${drop.over ? 'drop-over' : ''}`} {...dragSource('folder', folder.id)} {...drop.props}>
      <button className="cover folder-cover" onClick={onOpen} aria-label={`Open folder ${folder.name}`}>
        <span className="folder-back" />
        {preview && (
          <span className="folder-paper">{coverUrl && <img src={coverUrl} alt="" draggable={false} />}</span>
        )}
        <span className="folder-front" />
      </button>
      <div className="card-info">
        <button className="card-title" onClick={onOpen}>
          <strong>{folder.name}</strong>
          <span className="muted small">{summary}</span>
        </button>
        <Menu
          label="Folder options"
          icon={<MoreIcon />}
          items={[
            { label: 'Rename', onSelect: rename },
            { label: 'Move to…', onSelect: onMove },
            { label: 'Delete', onSelect: onDelete, danger: true },
          ]}
        />
      </div>
    </div>
  );
}
