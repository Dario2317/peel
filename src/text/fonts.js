// The fonts for text boxes. They are bundled with the app (no internet
// needed, and they look the same on the iPad and on the PC). Only the
// "latin" letters are included (English, Italian, other western languages);
// anything else falls back to the device's own font.
import interNormal from '@fontsource-variable/inter/files/inter-latin-wght-normal.woff2?url';
import interItalic from '@fontsource-variable/inter/files/inter-latin-wght-italic.woff2?url';
import loraNormal from '@fontsource-variable/lora/files/lora-latin-wght-normal.woff2?url';
import loraItalic from '@fontsource-variable/lora/files/lora-latin-wght-italic.woff2?url';
import nunitoNormal from '@fontsource-variable/nunito/files/nunito-latin-wght-normal.woff2?url';
import nunitoItalic from '@fontsource-variable/nunito/files/nunito-latin-wght-italic.woff2?url';
import courier400 from '@fontsource/courier-prime/files/courier-prime-latin-400-normal.woff2?url';
import courier400i from '@fontsource/courier-prime/files/courier-prime-latin-400-italic.woff2?url';
import courier700 from '@fontsource/courier-prime/files/courier-prime-latin-700-normal.woff2?url';
import courier700i from '@fontsource/courier-prime/files/courier-prime-latin-700-italic.woff2?url';
import caveat from '@fontsource-variable/caveat/files/caveat-latin-wght-normal.woff2?url';
import patrickHand from '@fontsource/patrick-hand/files/patrick-hand-latin-400-normal.woff2?url';
import kalam400 from '@fontsource/kalam/files/kalam-latin-400-normal.woff2?url';
import kalam700 from '@fontsource/kalam/files/kalam-latin-700-normal.woff2?url';
import marker from '@fontsource/permanent-marker/files/permanent-marker-latin-400-normal.woff2?url';

// id is what's saved in a text box; family is the CSS font-family.
export const FONTS = [
  { id: 'sans', label: 'Sans', family: "'Peel Inter', system-ui, sans-serif" },
  { id: 'serif', label: 'Serif', family: "'Peel Lora', Georgia, serif" },
  { id: 'rounded', label: 'Rounded', family: "'Peel Nunito', system-ui, sans-serif" },
  { id: 'typewriter', label: 'Typewriter', family: "'Peel Courier Prime', 'Courier New', monospace" },
  { id: 'caveat', label: 'Caveat', family: "'Peel Caveat', cursive", handwritten: true },
  { id: 'patrick', label: 'Patrick Hand', family: "'Peel Patrick Hand', cursive", handwritten: true },
  { id: 'kalam', label: 'Kalam', family: "'Peel Kalam', cursive", handwritten: true },
  { id: 'marker', label: 'Marker', family: "'Peel Permanent Marker', cursive", handwritten: true },
];
export const DEFAULT_FONT = 'sans';

// [family, file, weight, style]
const FILES = [
  ['Peel Inter', interNormal, '100 900', 'normal'],
  ['Peel Inter', interItalic, '100 900', 'italic'],
  ['Peel Lora', loraNormal, '400 700', 'normal'],
  ['Peel Lora', loraItalic, '400 700', 'italic'],
  ['Peel Nunito', nunitoNormal, '200 1000', 'normal'],
  ['Peel Nunito', nunitoItalic, '200 1000', 'italic'],
  ['Peel Courier Prime', courier400, '400', 'normal'],
  ['Peel Courier Prime', courier400i, '400', 'italic'],
  ['Peel Courier Prime', courier700, '700', 'normal'],
  ['Peel Courier Prime', courier700i, '700', 'italic'],
  ['Peel Caveat', caveat, '400 700', 'normal'],
  ['Peel Patrick Hand', patrickHand, '400', 'normal'],
  ['Peel Kalam', kalam400, '400', 'normal'],
  ['Peel Kalam', kalam700, '700', 'normal'],
  ['Peel Permanent Marker', marker, '400', 'normal'],
];

// Adds the fonts to the page once. The browser only downloads a font file
// when some text uses it (they're all saved for offline use anyway).
let installed = false;
export function installFonts() {
  if (installed || typeof document === 'undefined') return;
  installed = true;
  const style = document.createElement('style');
  style.textContent = FILES.map(
    ([family, url, weight, fontStyle]) =>
      `@font-face{font-family:'${family}';src:url('${url}') format('woff2');font-weight:${weight};font-style:${fontStyle};font-display:swap}`,
  ).join('\n');
  document.head.append(style);
}

export function fontFamily(id) {
  return (FONTS.find((f) => f.id === id) ?? FONTS[0]).family;
}

// The CSS for a text box: { font, size, color, bold, italic }.
// `color` may already be adjusted for a dark background.
export function textCss(box, color = box.color) {
  return {
    fontFamily: fontFamily(box.font),
    fontSize: box.size,
    fontWeight: box.bold ? 700 : 400,
    fontStyle: box.italic ? 'italic' : 'normal',
    color,
  };
}
