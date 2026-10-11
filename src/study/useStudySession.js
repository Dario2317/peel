// A study session: which tapes are in it, in what order, which one is
// peeled right now, and your answers. Answers are saved immediately, so
// closing the app in the middle loses nothing.
import { useRef, useState } from 'react';
import { loadStats, recordReview } from '../db/reviews.js';
import { newId } from '../utils/ids.js';
import { showToast } from '../ui/toast.jsx';
import { buildQueue, nextUnanswered } from './studyQueue.js';

/**
 * session = {
 *   id, scope: 'notebook' | 'page',
 *   queue: [{ tapeId, pageId, pageIndex, x, y }],
 *   results: { tapeId: 'got' | 'missed' },
 *   currentId,   // the highlighted tape
 *   revealedId,  // the peeled tape waiting for Got it / Missed
 *   finished,
 * }
 */
export function useStudySession({ store, notebookId, pages, getViewer }) {
  const [session, setSession] = useState(null);
  const latest = useRef(session);
  latest.current = session;

  // Scroll so the tape is on screen.
  const focusTape = (entry) => {
    const item = store.getItem(entry.pageId, entry.tapeId);
    if (item) getViewer()?.showRegion(entry.pageIndex, { x: item.x, y: item.y, w: item.w, h: item.h });
  };

  const start = async (scope, currentIndex, onlyTapeIds = null) => {
    await store.flush();
    const indexOf = new Map(pages.map((p, i) => [p.id, i]));
    let tapes = store
      .allOfType('tape')
      .filter(({ item }) => !item.draft)
      .map(({ pageId, item }) => ({ tapeId: item.id, pageId, pageIndex: indexOf.get(pageId) ?? -1, x: item.x, y: item.y }))
      .filter((t) => t.pageIndex >= 0);
    if (scope === 'page') tapes = tapes.filter((t) => t.pageIndex === currentIndex);
    if (onlyTapeIds) tapes = tapes.filter((t) => onlyTapeIds.includes(t.tapeId));
    if (!tapes.length) {
      showToast(
        scope === 'page'
          ? 'There is no tape on this page yet.'
          : 'No tape yet: choose Tape and drag over what you want to hide.',
      );
      return false;
    }
    const queue = buildQueue(tapes, await loadStats(notebookId));
    setSession({
      id: newId('ses'),
      scope,
      queue,
      results: {},
      currentId: queue[0].tapeId,
      revealedId: null,
      finished: false,
    });
    focusTape(queue[0]);
    return true;
  };

  // You tapped a tape: peel it (if it's part of the session and not answered).
  const reveal = (tapeId) => {
    const s = latest.current;
    if (!s || s.finished || s.revealedId || s.results[tapeId]) return;
    if (!s.queue.some((t) => t.tapeId === tapeId)) return;
    setSession({ ...s, revealedId: tapeId, currentId: tapeId });
  };

  const answer = (result) => {
    const s = latest.current;
    const entry = s?.queue.find((t) => t.tapeId === s.revealedId);
    if (!entry) return;
    recordReview({ tapeId: entry.tapeId, notebookId, pageId: entry.pageId, result, sessionId: s.id }).catch(
      (error) => console.error('Could not save the answer', error),
    );
    const results = { ...s.results, [entry.tapeId]: result };
    const next = nextUnanswered(s.queue, results, entry.tapeId);
    setSession({ ...s, results, revealedId: null, currentId: next?.tapeId ?? null, finished: !next });
    if (next) setTimeout(() => focusTape(next), 350); // after the peel animation
  };

  const skip = () => {
    const s = latest.current;
    if (!s || s.revealedId) return;
    const next = nextUnanswered(s.queue, s.results, s.currentId);
    if (next && next.tapeId !== s.currentId) {
      setSession({ ...s, currentId: next.tapeId });
      focusTape(next);
    }
  };

  const finish = () => {
    const s = latest.current;
    if (s) setSession({ ...s, revealedId: null, finished: true });
  };

  const stop = () => setSession(null);

  return { session, start, reveal, answer, skip, finish, stop };
}
