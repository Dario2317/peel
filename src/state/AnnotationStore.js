// Holds the annotations (post-its, tapes, later ink and text) of the open
// notebook in memory, saves them to the database, and keeps the undo/redo
// history.
//
// Every page has one document: { pageId, notebookId, schema, items, updatedAt }.
// A change is described as { pageId, before, after }:
//   before = null           → the item was created
//   after  = null           → the item was deleted
//   both set                → the item was changed
// Undo simply applies the change backwards (after → before).
import { db } from '../db/db.js';

// Saving writes the whole page (every stroke on it) to the database, so it
// waits for a pause: while you keep writing, at most every SAVE_MAX_WAIT_MS.
// (Leaving the notebook, or the app going to the background, saves at once.)
const SAVE_DELAY_MS = 2000;
const SAVE_MAX_WAIT_MS = 15000;
const HISTORY_LIMIT = 200;

export class AnnotationStore {
  constructor(notebookId) {
    this.notebookId = notebookId;
    this.items = new Map(); // pageId -> array of items
    this.pageListeners = new Map(); // pageId -> Set of callbacks
    this.listeners = new Set(); // called on any change (e.g. undo buttons)
    this.dirty = new Set(); // pages waiting to be saved
    this.saveTimer = 0;
    this.saveDeadline = 0; // when the oldest unsaved change must be saved at the latest
    this.undoStack = [];
    this.redoStack = [];
    this.version = 0; // bumps on every change, for React
  }

  // Loads every page of the notebook at once (small JSON documents), so a
  // page never shows up before its tapes do.
  async loadAll() {
    const docs = await db.annotations.where('notebookId').equals(this.notebookId).toArray();
    for (const doc of docs) this.items.set(doc.pageId, doc.items);
  }

  getItems(pageId) {
    return this.items.get(pageId) ?? EMPTY;
  }

  getItem(pageId, itemId) {
    return this.getItems(pageId).find((item) => item.id === itemId) ?? null;
  }

  // All items of one type in the notebook, e.g. every tape for study mode.
  allOfType(type) {
    const result = [];
    for (const [pageId, items] of this.items) {
      for (const item of items) if (item.type === type) result.push({ pageId, item });
    }
    return result;
  }

  // --- Changing things -----------------------------------------------------

  /**
   * Applies changes. Options:
   *   history: false → not undoable on its own (used while dragging/typing,
   *            followed by one pushHistory() at the end)
   */
  apply(changes, { history = true } = {}) {
    for (const change of changes) this.applyOne(change.pageId, change.before, change.after);
    if (history) this.pushHistory(changes);
    this.emit(changes.map((c) => c.pageId));
  }

  // Shortcut for one change.
  change(pageId, before, after, options) {
    this.apply([{ pageId, before, after }], options);
  }

  applyOne(pageId, before, after) {
    const items = [...this.getItems(pageId)];
    const id = (after ?? before).id;
    const index = items.findIndex((item) => item.id === id);
    if (after && index >= 0) items[index] = after;
    else if (after) items.push(after);
    else if (index >= 0) items.splice(index, 1);
    this.items.set(pageId, items);
    this.dirty.add(pageId);
    this.scheduleSave();
  }

  // Records changes that were already applied (e.g. the whole drag of a
  // note becomes one undo step).
  pushHistory(changes) {
    const real = changes.filter((c) => JSON.stringify(c.before) !== JSON.stringify(c.after));
    if (!real.length) return;
    this.undoStack.push(real);
    if (this.undoStack.length > HISTORY_LIMIT) this.undoStack.shift();
    this.redoStack = [];
    this.emit([]);
  }

  // --- Undo / redo ---------------------------------------------------------

  get canUndo() {
    return this.undoStack.length > 0;
  }

  get canRedo() {
    return this.redoStack.length > 0;
  }

  // Returns the pageId that changed, so the viewer can show it.
  undo() {
    const changes = this.undoStack.pop();
    if (!changes) return null;
    for (const c of [...changes].reverse()) this.applyOne(c.pageId, c.after, c.before);
    this.redoStack.push(changes);
    this.emit(changes.map((c) => c.pageId));
    return changes[0].pageId;
  }

  redo() {
    const changes = this.redoStack.pop();
    if (!changes) return null;
    for (const c of changes) this.applyOne(c.pageId, c.before, c.after);
    this.undoStack.push(changes);
    this.emit(changes.map((c) => c.pageId));
    return changes[0].pageId;
  }

  // --- Saving ----------------------------------------------------------------

  scheduleSave() {
    const now = Date.now();
    if (!this.saveDeadline) this.saveDeadline = now + SAVE_MAX_WAIT_MS;
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => this.flush(), Math.max(0, Math.min(SAVE_DELAY_MS, this.saveDeadline - now)));
  }

  // Writes all changed pages now (also called when the app goes to the background).
  async flush() {
    clearTimeout(this.saveTimer);
    this.saveDeadline = 0;
    const pages = [...this.dirty];
    this.dirty.clear();
    if (!pages.length) return;
    const now = Date.now();
    await db.annotations.bulkPut(
      pages.map((pageId) => ({
        pageId,
        notebookId: this.notebookId,
        schema: 1,
        items: this.getItems(pageId).filter((item) => !item.draft),
        updatedAt: now,
      })),
    );
  }

  // --- Listening (for React) -----------------------------------------------

  subscribePage(pageId, callback) {
    if (!this.pageListeners.has(pageId)) this.pageListeners.set(pageId, new Set());
    this.pageListeners.get(pageId).add(callback);
    return () => this.pageListeners.get(pageId).delete(callback);
  }

  subscribe(callback) {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  emit(pageIds) {
    this.version++;
    for (const pageId of new Set(pageIds)) this.pageListeners.get(pageId)?.forEach((cb) => cb());
    this.listeners.forEach((cb) => cb());
  }
}

const EMPTY = [];
