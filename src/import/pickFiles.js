// Ways files can come in: the file picker, drag & drop, and paste.
import { isImportable } from './fileTypes.js';

// One hidden <input type="file"> reused for every import. On iPad its menu
// offers Photo Library, Take Photo and Choose Files.
let input = null;
let resolvePick = null;

export function pickFiles() {
  if (!input) {
    input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.accept = 'image/*,application/pdf,.pdf';
    input.style.display = 'none';
    input.addEventListener('change', () => {
      resolvePick?.([...input.files]);
      resolvePick = null;
      input.value = ''; // so picking the same file again still works
    });
    input.addEventListener('cancel', () => {
      resolvePick?.([]);
      resolvePick = null;
    });
    document.body.append(input);
  }
  return new Promise((resolve) => {
    resolvePick = resolve;
    input.click();
  });
}

// Files from a drag & drop event (e.g. from Files or Photos in Split View).
export function filesFromDrop(event) {
  return [...(event.dataTransfer?.files ?? [])].filter(isImportable);
}

export function dragHasFiles(event) {
  return [...(event.dataTransfer?.types ?? [])].includes('Files');
}

// Files from a paste event (Cmd/Ctrl+V).
export function filesFromPaste(event) {
  const files = [];
  for (const item of event.clipboardData?.items ?? []) {
    if (item.kind !== 'file') continue;
    const file = item.getAsFile();
    if (file && isImportable(file)) files.push(renamePasted(file, files.length));
  }
  return files;
}

// The "Paste" button: reads images from the clipboard. Safari shows a small
// "Paste" bubble you tap to allow it.
export async function readClipboardFiles() {
  if (!navigator.clipboard?.read) {
    throw new Error('Pasting from a button is not supported here. Use Cmd/Ctrl+V instead.');
  }
  const files = [];
  for (const item of await navigator.clipboard.read()) {
    const type = item.types.find((t) => t.startsWith('image/') || t === 'application/pdf');
    if (!type) continue;
    const blob = await item.getType(type);
    const ext = type === 'application/pdf' ? 'pdf' : type.split('/')[1];
    files.push(new File([blob], `Pasted ${files.length + 1}.${ext}`, { type, lastModified: Date.now() }));
  }
  return files;
}

// Pasted screenshots are often all called "image.png"; give them distinct names.
function renamePasted(file, index) {
  if (!/^image\.\w+$/i.test(file.name)) return file;
  const ext = file.name.split('.').pop();
  return new File([file], `Pasted ${index + 1}.${ext}`, { type: file.type, lastModified: Date.now() });
}
