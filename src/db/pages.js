import { db } from './db.js';
import { newId } from '../utils/ids.js';
import { remapItemsForCrop, sameCrop, FULL_CROP } from '../utils/geometry.js';

// Removes pages from the notebook. The page records themselves are deleted
// by cleanUpOrphans() at the next app start, which keeps this undoable later.
export async function removePages(notebookId, pageIds) {
  const remove = new Set(pageIds);
  await db.transaction('rw', db.notebooks, async () => {
    const notebook = await db.notebooks.get(notebookId);
    const kept = notebook.pageIds.filter((id) => !remove.has(id));
    await db.notebooks.update(notebookId, {
      pageIds: kept,
      coverPageId: remove.has(notebook.coverPageId) ? kept[0] ?? null : notebook.coverPageId,
      updatedAt: Date.now(),
    });
  });
}

export async function movePage(notebookId, fromIndex, toIndex) {
  await db.transaction('rw', db.notebooks, async () => {
    const notebook = await db.notebooks.get(notebookId);
    const pageIds = [...notebook.pageIds];
    const [moved] = pageIds.splice(fromIndex, 1);
    pageIds.splice(toIndex, 0, moved);
    await db.notebooks.update(notebookId, {
      pageIds,
      coverPageId: pageIds[0],
      updatedAt: Date.now(),
    });
  });
}

// Inserts an empty white page at `index`, the same size as `likePage`
// (or A4 shape if there is none).
export async function addBlankPage(notebookId, index, likePage) {
  const width = likePage ? likePage.width * likePage.crop.w : 1000;
  const height = likePage ? likePage.height * likePage.crop.h : 1414;
  const page = {
    id: newId('pg'),
    notebookId,
    kind: 'blank',
    sourceFileId: null,
    pdfPageNumber: null,
    width,
    height,
    crop: { ...FULL_CROP },
    createdAt: Date.now(),
  };
  await db.transaction('rw', db.notebooks, db.pages, async () => {
    const notebook = await db.notebooks.get(notebookId);
    const pageIds = [...notebook.pageIds];
    pageIds.splice(index, 0, page.id);
    await db.pages.add(page);
    await db.notebooks.update(notebookId, {
      pageIds,
      coverPageId: notebook.coverPageId ?? page.id,
      updatedAt: Date.now(),
    });
  });
  return page.id;
}

// Sets the crop of one or more pages. Annotations are moved so they stay on
// the same spot of the book page, and the thumbnails get rebuilt.
export async function setCrop(pageIds, crop) {
  await db.transaction('rw', db.pages, db.annotations, db.thumbnails, db.notebooks, async () => {
    for (const pageId of pageIds) {
      const page = await db.pages.get(pageId);
      if (!page || sameCrop(page.crop, crop)) continue;
      const doc = await db.annotations.get(pageId);
      if (doc && doc.items.length) {
        await db.annotations.update(pageId, {
          items: remapItemsForCrop(doc.items, page.crop, crop),
          updatedAt: Date.now(),
        });
      }
      await db.pages.update(pageId, { crop: { ...crop } });
      await db.thumbnails.delete(pageId);
    }
    const first = await db.pages.get(pageIds[0]);
    if (first) await db.notebooks.update(first.notebookId, { updatedAt: Date.now() });
  });
}
