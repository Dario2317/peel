// Recognizing and sorting imported files. (No browser-only code here, so
// it can be tested.)

const IMAGE_EXTENSIONS = /\.(png|jpe?g|gif|webp|heic|heif|avif|bmp|tiff?)$/i;

export function isPdf(file) {
  return file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
}

export function isImage(file) {
  return file.type.startsWith('image/') || IMAGE_EXTENSIONS.test(file.name);
}

export function isImportable(file) {
  return isPdf(file) || isImage(file);
}

// Natural order: "IMG_2.png" comes before "IMG_10.png".
const byName = (a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });

export function sortFiles(files, by) {
  const list = [...files];
  if (by === 'date') list.sort((a, b) => a.lastModified - b.lastModified || byName(a, b));
  else list.sort(byName);
  return list;
}

export function defaultNotebookTitle(files) {
  if (files.length === 1 && isPdf(files[0])) return files[0].name.replace(/\.pdf$/i, '');
  const date = new Date().toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  return `Notebook ${date}`;
}
