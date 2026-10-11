// Turns imported files into pages of a notebook. The original files are
// stored exactly as they are; pages only point at them.
import { db } from '../db/db.js';
import { createNotebook } from '../db/notebooks.js';
import { newId } from '../utils/ids.js';
import { FULL_CROP } from '../utils/geometry.js';
import { isImage, isPdf } from './fileTypes.js';
import { prepareImage } from './images.js';
import { readPdfPageSizes } from './pdf.js';

/**
 * files:      already in the order you want
 * notebookId: add to this notebook, or null to create a new one with `title`
 *             (in folder `folderId`)
 * insertAt:   page index to insert at (default: at the end)
 * onProgress: ({ done, total, label }) => void
 * Returns { notebookId, added, errors }
 */
export async function importFiles({ files, notebookId = null, folderId = null, title, insertAt = null, onProgress }) {
  const errors = [];
  let added = 0;
  let position = insertAt;

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const report = (label) => onProgress?.({ done: i, total: files.length, label });
    report(file.name);
    try {
      const { source, pages } = await prepareFile(file, (n, total) => report(`${file.name} — page ${n} of ${total}`));
      if (!notebookId) notebookId = await createNotebook(title, folderId);
      position = await saveFile(notebookId, source, pages, position);
      added += pages.length;
    } catch (error) {
      console.error(error);
      errors.push(`${file.name}: ${friendlyError(error)}`);
    }
  }
  onProgress?.({ done: files.length, total: files.length, label: 'Done' });
  if (added) navigator.storage?.persist?.().catch(() => {});
  return { notebookId, added, errors };
}

async function prepareFile(file, onPdfProgress) {
  const now = Date.now();
  const source = {
    id: newId('src'),
    notebookId: null,
    kind: null,
    name: file.name,
    type: file.type,
    size: file.size,
    lastModified: file.lastModified,
    blob: file, // the original bytes, never changed
    displayBlob: null,
    addedAt: now,
  };
  const makePage = (fields) => ({
    id: newId('pg'),
    notebookId: null,
    sourceFileId: source.id,
    pdfPageNumber: null,
    crop: { ...FULL_CROP },
    createdAt: now,
    ...fields,
  });

  if (isPdf(file)) {
    source.kind = 'pdf';
    const sizes = await readPdfPageSizes(file, onPdfProgress);
    const pages = sizes.map((size, i) => makePage({ kind: 'pdf', pdfPageNumber: i + 1, ...size }));
    return { source, pages };
  }
  if (isImage(file)) {
    source.kind = 'image';
    const { width, height, displayBlob } = await prepareImage(file);
    source.displayBlob = displayBlob;
    return { source, pages: [makePage({ kind: 'image', width, height })] };
  }
  throw new Error('not an image or a PDF');
}

// Saves one file and its pages in a single transaction (all or nothing).
// Returns the position for the next file's pages.
async function saveFile(notebookId, source, pages, position) {
  let next = position;
  await db.transaction('rw', db.notebooks, db.sourceFiles, db.pages, async () => {
    const notebook = await db.notebooks.get(notebookId);
    source.notebookId = notebookId;
    for (const page of pages) page.notebookId = notebookId;
    await db.sourceFiles.add(source);
    await db.pages.bulkAdd(pages);

    const pageIds = [...notebook.pageIds];
    const at = position === null ? pageIds.length : Math.min(position, pageIds.length);
    pageIds.splice(at, 0, ...pages.map((p) => p.id));
    next = position === null ? null : at + pages.length;
    await db.notebooks.update(notebookId, {
      pageIds,
      coverPageId: notebook.coverPageId ?? pageIds[0],
      updatedAt: Date.now(),
    });
  });
  return next;
}

function friendlyError(error) {
  if (error?.name === 'PasswordException') return 'this PDF is password-protected';
  if (error?.name === 'InvalidPDFException') return 'this PDF seems damaged';
  if (error?.name === 'QuotaExceededError') return 'not enough storage space on this device';
  return error?.message || 'could not be imported';
}
