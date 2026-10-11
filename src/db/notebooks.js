import { db } from './db.js';
import { newId } from '../utils/ids.js';

export async function createNotebook(title) {
  const now = Date.now();
  const notebook = {
    id: newId('nb'),
    title: title || 'New notebook',
    createdAt: now,
    updatedAt: now,
    openedAt: now,
    pageIds: [], // the order of the pages = the order of this array
    coverPageId: null,
    lastStudiedAt: null,
    lastBackupAt: null,
  };
  await db.notebooks.add(notebook);
  return notebook.id;
}

export function renameNotebook(id, title) {
  return db.notebooks.update(id, { title: title.trim() || 'Untitled', updatedAt: Date.now() });
}

export function markOpened(id) {
  return db.notebooks.update(id, { openedAt: Date.now() });
}

// Deletes the notebook and everything that belongs to it, right away.
export function deleteNotebook(id) {
  return db.transaction(
    'rw',
    [db.notebooks, db.sourceFiles, db.pages, db.thumbnails, db.annotations, db.tapeStats, db.reviewLog, db.settings],
    async () => {
      const pageIds = await db.pages.where('notebookId').equals(id).primaryKeys();
      await db.thumbnails.bulkDelete(pageIds);
      await db.pages.where('notebookId').equals(id).delete();
      await db.sourceFiles.where('notebookId').equals(id).delete();
      await db.annotations.where('notebookId').equals(id).delete();
      await db.tapeStats.where('notebookId').equals(id).delete();
      await db.reviewLog.where('notebookId').equals(id).delete();
      await db.settings.delete('view:' + id);
      await db.notebooks.delete(id);
    },
  );
}
