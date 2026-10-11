// Remembers whether an Apple Pencil has ever been used on this device.
// Once it has, fingers only pan, zoom and tap: they never draw or move
// things (so a resting palm can't either).
import { getSetting, setSetting } from '../db/settings.js';

export const pencil = { seen: false };

getSetting('pencilSeen', false).then((seen) => {
  if (seen) pencil.seen = true;
});

export function markPencilSeen() {
  if (pencil.seen) return;
  pencil.seen = true;
  setSetting('pencilSeen', true);
}
