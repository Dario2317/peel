// Study statistics for tapes. One row per tape in `tapeStats`, plus one row
// in `reviewLog` for every answer (the full history, for spaced repetition
// later).
import { db } from './db.js';

export function newStats(tapeId, notebookId, pageId) {
  return {
    tapeId,
    notebookId,
    pageId,
    seen: 0,
    missed: 0,
    lastResult: null, // 'got' | 'missed'
    lastReviewedAt: null,
    // Reserved for spaced repetition (not used yet):
    due: null,
    interval: 0,
    ease: 2.5,
    reps: 0,
    lapses: 0,
  };
}

// Stats for all tapes of a notebook, as { tapeId: stats }.
export async function loadStats(notebookId) {
  const rows = await db.tapeStats.where('notebookId').equals(notebookId).toArray();
  return Object.fromEntries(rows.map((row) => [row.tapeId, row]));
}

// Saves one "Got it" / "Missed" answer.
export async function recordReview({ tapeId, notebookId, pageId, result, sessionId }) {
  const now = Date.now();
  await db.transaction('rw', db.tapeStats, db.reviewLog, db.notebooks, async () => {
    const stats = (await db.tapeStats.get(tapeId)) ?? newStats(tapeId, notebookId, pageId);
    stats.seen += 1;
    if (result === 'missed') stats.missed += 1;
    stats.lastResult = result;
    stats.lastReviewedAt = now;
    stats.pageId = pageId;
    await db.tapeStats.put(stats);
    await db.reviewLog.add({ tapeId, notebookId, sessionId, at: now, result });
    await db.notebooks.update(notebookId, { lastStudiedAt: now });
  });
}
