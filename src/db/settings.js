import { useLiveQuery } from 'dexie-react-hooks';
import { db } from './db.js';

export async function getSetting(key, fallback = undefined) {
  const row = await db.settings.get(key);
  return row ? row.value : fallback;
}

export function setSetting(key, value) {
  return db.settings.put({ key, value });
}

// React hook: returns the setting and re-renders when it changes.
// (useLiveQuery re-runs the query whenever the data it read changes.)
// `whileLoading` is returned for the split second before the database answers.
export function useSetting(key, fallback = undefined, whileLoading = fallback) {
  return useLiveQuery(() => getSetting(key, fallback), [key], whileLoading);
}
