// The color dictionary: what each color means to you (e.g. red = "exam
// question", yellow = "definition"). Saved as { '#c8332a': 'exam question' }.
import { setSetting, useSetting } from '../db/settings.js';

const KEY = 'colorLegend';
const EMPTY = {};

// [legend, setMeaning(color, text)]. Updates every place that shows it.
export function useColorLegend() {
  const legend = useSetting(KEY, EMPTY) ?? EMPTY;
  const setMeaning = (color, text) => {
    const next = { ...legend };
    const clean = text.slice(0, 60);
    if (clean.trim()) next[color] = clean;
    else delete next[color];
    return setSetting(KEY, next);
  };
  return [legend, setMeaning];
}
