import { describe, expect, it } from 'vitest';
import { buildQueue, nextUnanswered, score } from './studyQueue.js';

const tape = (tapeId, pageIndex, y = 0, x = 0) => ({ tapeId, pageIndex, x, y });

describe('buildQueue', () => {
  it('uses page order when nothing has been studied yet', () => {
    const queue = buildQueue([tape('c', 2), tape('a', 0, 0.5), tape('b', 0, 0.1)], {});
    expect(queue.map((t) => t.tapeId)).toEqual(['b', 'a', 'c']);
  });

  it('puts missed tapes first, then new ones, then the oldest reviewed', () => {
    const stats = {
      got1: { seen: 1, missed: 0, lastResult: 'got', lastReviewedAt: 200 },
      got2: { seen: 1, missed: 0, lastResult: 'got', lastReviewedAt: 100 },
      miss1: { seen: 4, missed: 1, lastResult: 'missed', lastReviewedAt: 50 },
      miss2: { seen: 2, missed: 2, lastResult: 'missed', lastReviewedAt: 60 },
    };
    const tapes = [tape('got1', 0), tape('miss1', 1), tape('new', 2), tape('got2', 3), tape('miss2', 4)];
    expect(buildQueue(tapes, stats).map((t) => t.tapeId)).toEqual(['miss2', 'miss1', 'new', 'got2', 'got1']);
  });
});

describe('nextUnanswered', () => {
  const queue = [tape('a', 0), tape('b', 1), tape('c', 2)];
  it('skips answered tapes and wraps around', () => {
    expect(nextUnanswered(queue, { b: 'got' }, 'a').tapeId).toBe('c');
    expect(nextUnanswered(queue, { c: 'got' }, 'b').tapeId).toBe('a');
    expect(nextUnanswered(queue, { a: 'got', b: 'missed', c: 'got' }, 'a')).toBe(null);
  });
});

describe('score', () => {
  it('counts answers', () => {
    expect(score({ a: 'got', b: 'missed', c: 'got' })).toEqual({ answered: 3, got: 2, missed: 1 });
  });
});
