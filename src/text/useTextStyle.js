// The style for new text boxes, remembered between sessions:
//   { font, size, color, bold, italic }
// Used on the pages and on the post-it boards.
import { useEffect, useState } from 'react';
import { getSetting, setSetting } from '../db/settings.js';
import { PEN_COLORS } from '../ink/inkStyle.js';
import { DEFAULT_FONT } from './fonts.js';

// Sizes in page units (a page is 1000 wide) or board units.
export const TEXT_SIZES = [10, 12, 14, 16, 18, 20, 24, 28, 32, 40, 48, 64, 80];

export const DEFAULT_TEXT_STYLE = {
  font: DEFAULT_FONT,
  size: 20,
  color: PEN_COLORS[0],
  bold: false,
  italic: false,
};

export function useTextStyle() {
  const [style, setStyle] = useState(DEFAULT_TEXT_STYLE);

  useEffect(() => {
    getSetting('textStyle', null).then((saved) => saved && setStyle({ ...DEFAULT_TEXT_STYLE, ...saved }));
  }, []);

  const update = (fields) => {
    setStyle((current) => {
      const next = { ...current, ...fields };
      setSetting('textStyle', next);
      return next;
    });
  };

  return [style, update];
}

// Just the style fields of a text box.
export function styleOf(box) {
  return {
    font: box.font ?? DEFAULT_TEXT_STYLE.font,
    size: box.size ?? DEFAULT_TEXT_STYLE.size,
    color: box.color ?? DEFAULT_TEXT_STYLE.color,
    bold: Boolean(box.bold),
    italic: Boolean(box.italic),
  };
}

// The next size up (+1) or down (-1) from `size`.
export function stepSize(size, direction) {
  let i = TEXT_SIZES.findIndex((s) => s >= size);
  if (i < 0) i = TEXT_SIZES.length - 1;
  else if (direction < 0 && TEXT_SIZES[i] > size) i -= 1; // between two sizes: "down" is the lower one
  return TEXT_SIZES[Math.max(0, Math.min(TEXT_SIZES.length - 1, i + direction))];
}
