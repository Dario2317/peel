// The app's database. IndexedDB is a database built into every browser that
// can also store files (Blobs); Dexie is a small library that makes it much
// easier to use. Everything stays on this device.
import Dexie from 'dexie';

export const db = new Dexie('peel');

// Each line is a table. The first name is the primary key; the others are
// indexes (fields we can search by quickly). Fields that aren't listed here
// are still saved, they just can't be searched.
db.version(1).stores({
  notebooks: 'id, updatedAt',
  sourceFiles: 'id, notebookId', // the original imported files, never modified
  pages: 'id, notebookId, sourceFileId',
  thumbnails: 'pageId', // small cached JPEGs, can always be rebuilt
  annotations: 'pageId, notebookId', // one JSON document per page
  tapeStats: 'tapeId, notebookId, pageId, due', // study stats (+ spaced repetition later)
  reviewLog: '++id, tapeId, notebookId, at', // every "Got it" / "Missed"
  settings: 'key', // small key → value preferences
});

// All tables, handy for transactions that touch everything.
export const ALL_TABLES = [
  db.notebooks, db.sourceFiles, db.pages, db.thumbnails,
  db.annotations, db.tapeStats, db.reviewLog, db.settings,
];
