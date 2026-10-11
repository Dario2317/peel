// Folders in the library. They can hold notebooks and other folders.
import { db } from './db.js';
import { deleteNotebook } from './notebooks.js';
import { newId } from '../utils/ids.js';

export async function createFolder(name, parentId = null) {
  const now = Date.now();
  const folder = {
    id: newId('fd'),
    name: name.trim() || 'New folder',
    parentId, // the folder it's in (null = top of the library)
    createdAt: now,
    updatedAt: now,
  };
  await db.folders.add(folder);
  return folder.id;
}

export function renameFolder(id, name) {
  return db.folders.update(id, { name: name.trim() || 'Untitled', updatedAt: Date.now() });
}

// Moves a folder into another one (null = top of the library). A folder
// can't go inside itself or one of its own subfolders.
export async function moveFolder(id, parentId) {
  const folders = await db.folders.toArray();
  if (parentId && (parentId === id || subfolderIds(folders, id).has(parentId))) return false;
  await db.folders.update(id, { parentId: parentId ?? null });
  return true;
}

/**
 * Deletes a folder. keepContents: its notebooks and folders move up to
 * where the folder was; otherwise they are deleted too.
 */
export async function deleteFolder(id, { keepContents }) {
  const folders = await db.folders.toArray();
  const folder = folders.find((f) => f.id === id);
  if (!folder) return;
  if (keepContents) {
    const parentId = folder.parentId ?? null;
    await db.transaction('rw', db.folders, db.notebooks, async () => {
      await db.notebooks.where('folderId').equals(id).modify({ folderId: parentId });
      await db.folders.where('parentId').equals(id).modify({ parentId });
      await db.folders.delete(id);
    });
    return;
  }
  const ids = subfolderIds(folders, id).add(id);
  const notebookIds = await db.notebooks.where('folderId').anyOf([...ids]).primaryKeys();
  for (const notebookId of notebookIds) await deleteNotebook(notebookId);
  await db.folders.bulkDelete([...ids]);
}

// --- Helpers working on the list of all folders -------------------------

// Every folder inside this one, at any depth.
export function subfolderIds(folders, id) {
  const ids = new Set();
  const visit = (parentId) => {
    for (const f of folders) {
      if (f.parentId === parentId && !ids.has(f.id)) {
        ids.add(f.id);
        visit(f.id);
      }
    }
  };
  visit(id);
  return ids;
}

// The folders from the top of the library down to this one (inclusive).
export function folderPath(folders, id) {
  const byId = new Map(folders.map((f) => [f.id, f]));
  const path = [];
  for (let f = byId.get(id); f && path.length < 50; f = byId.get(f.parentId)) path.unshift(f);
  return path;
}

// All folders as a tree, flattened: [{ folder, depth }] in display order.
export function folderTree(folders) {
  const rows = [];
  const visit = (parentId, depth) => {
    for (const folder of sortFolders(folders.filter((f) => (f.parentId ?? null) === parentId))) {
      rows.push({ folder, depth });
      visit(folder.id, depth + 1);
    }
  };
  visit(null, 0);
  return rows;
}

export function sortFolders(folders) {
  return [...folders].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
}
