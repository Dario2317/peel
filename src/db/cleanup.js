import { db } from './db.js';

// Runs at app start. Deletes data that no notebook uses any more: pages that
// were removed from a notebook, and original files with no pages left.
export async function cleanUpOrphans() {
  await db.transaction(
    'rw',
    [db.notebooks, db.pages, db.sourceFiles, db.thumbnails, db.annotations, db.tapeStats],
    async () => {
      const notebooks = await db.notebooks.toArray();
      const usedPageIds = new Set(notebooks.flatMap((n) => n.pageIds));

      const pages = await db.pages.toArray(); // small records, no file data
      const deadPageIds = pages.filter((p) => !usedPageIds.has(p.id)).map((p) => p.id);
      if (deadPageIds.length) {
        await db.pages.bulkDelete(deadPageIds);
        await db.thumbnails.bulkDelete(deadPageIds);
        await db.annotations.bulkDelete(deadPageIds);
        await db.tapeStats.where('pageId').anyOf(deadPageIds).delete();
      }

      const usedSourceIds = new Set(
        pages.filter((p) => usedPageIds.has(p.id)).map((p) => p.sourceFileId),
      );
      // primaryKeys() lists only the ids, without loading the (big) files.
      const sourceIds = await db.sourceFiles.toCollection().primaryKeys();
      const deadSourceIds = sourceIds.filter((id) => !usedSourceIds.has(id));
      if (deadSourceIds.length) await db.sourceFiles.bulkDelete(deadSourceIds);

      // Study stats of tapes that were deleted.
      const tapeIds = new Set();
      await db.annotations.each((doc) => {
        for (const item of doc.items) if (item.type === 'tape') tapeIds.add(item.id);
      });
      const statIds = await db.tapeStats.toCollection().primaryKeys();
      const deadStats = statIds.filter((id) => !tapeIds.has(id));
      if (deadStats.length) await db.tapeStats.bulkDelete(deadStats);
    },
  );
}
