// In which order the tapes come up in a study session. Plain functions, no
// React, so they can be tested.

/**
 * tapes: [{ tapeId, pageIndex, x, y, ... }]  (any order)
 * stats: { tapeId: { seen, missed, lastResult, lastReviewedAt } }
 * Order:
 *   1. tapes you missed last time (the most often missed first)
 *   2. tapes you have never studied (in page order)
 *   3. the rest, the ones you saw longest ago first
 */
export function buildQueue(tapes, stats) {
  const inPageOrder = [...tapes].sort(
    (a, b) => a.pageIndex - b.pageIndex || a.y - b.y || a.x - b.x,
  );
  const missed = [];
  const fresh = [];
  const known = [];
  for (const tape of inPageOrder) {
    const s = stats[tape.tapeId];
    if (!s || !s.seen) fresh.push(tape);
    else if (s.lastResult === 'missed') missed.push(tape);
    else known.push(tape);
  }
  const missRate = (t) => stats[t.tapeId].missed / stats[t.tapeId].seen;
  missed.sort((a, b) => missRate(b) - missRate(a)); // stable: page order for ties
  known.sort((a, b) => stats[a.tapeId].lastReviewedAt - stats[b.tapeId].lastReviewedAt);
  return [...missed, ...fresh, ...known];
}

// The next tape to study after `currentId`, skipping answered ones.
// Wraps around to the start. Returns null when everything is answered.
export function nextUnanswered(queue, results, currentId = null) {
  const start = currentId ? queue.findIndex((t) => t.tapeId === currentId) + 1 : 0;
  for (let i = 0; i < queue.length; i++) {
    const tape = queue[(start + i) % queue.length];
    if (!results[tape.tapeId]) return tape;
  }
  return null;
}

export function score(results) {
  const values = Object.values(results);
  return {
    answered: values.length,
    got: values.filter((r) => r === 'got').length,
    missed: values.filter((r) => r === 'missed').length,
  };
}
