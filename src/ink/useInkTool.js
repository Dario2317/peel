// The current drawing tool, remembered between sessions:
//   { tool: 'pen' | 'highlighter' | 'eraser', penColor, penSize,
//     highlightColor, highlightSize, smoothing }
import { useEffect, useState } from 'react';
import { getSetting, setSetting } from '../db/settings.js';
import { DEFAULT_SMOOTHING, HIGHLIGHT_COLORS, HIGHLIGHT_SIZES, PEN_COLORS, PEN_SIZES } from './inkStyle.js';

const DEFAULT = {
  tool: 'pen',
  penColor: PEN_COLORS[0],
  penSize: PEN_SIZES[1],
  highlightColor: HIGHLIGHT_COLORS[0],
  highlightSize: HIGHLIGHT_SIZES[1],
  smoothing: DEFAULT_SMOOTHING,
};

export function useInkTool() {
  const [ink, setInk] = useState(DEFAULT);

  useEffect(() => {
    getSetting('inkTool', null).then((saved) => saved && setInk({ ...DEFAULT, ...saved }));
  }, []);

  const update = (fields) => {
    setInk((current) => {
      const next = { ...current, ...fields };
      setSetting('inkTool', next);
      return next;
    });
  };

  return [ink, update];
}

// The stroke settings for the current tool (null for the eraser).
// The smoothing is saved in every stroke, so changing it later doesn't
// change what you already drew.
export function strokeStyle(ink) {
  if (ink.tool === 'pen') return { tool: 'pen', color: ink.penColor, size: ink.penSize, smooth: ink.smoothing };
  if (ink.tool === 'highlighter') {
    return { tool: 'highlighter', color: ink.highlightColor, size: ink.highlightSize, smooth: ink.smoothing };
  }
  return null;
}
