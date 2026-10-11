// Rendering PDF pages and thumbnails is heavy, so jobs wait in a line and at
// most two run at the same time. Lower priority number = runs sooner
// (0 = sharp detail of what's on screen, 5 = thumbnails).

const MAX_ACTIVE = 2;
const waiting = [];
let active = 0;

export function abortError() {
  return new DOMException('Render cancelled', 'AbortError');
}

export function queueRender(priority, job, signal) {
  return new Promise((resolve, reject) => {
    waiting.push({ priority, job, signal, resolve, reject });
    waiting.sort((a, b) => a.priority - b.priority);
    pump();
  });
}

function pump() {
  while (active < MAX_ACTIVE && waiting.length) {
    const entry = waiting.shift();
    if (entry.signal?.aborted) {
      entry.reject(abortError());
      continue;
    }
    active++;
    Promise.resolve()
      .then(entry.job)
      .then(entry.resolve, entry.reject)
      .finally(() => {
        active--;
        pump();
      });
  }
}
