import { describe, expect, it } from 'vitest';
import { defaultNotebookTitle, isImportable, sortFiles } from './fileTypes.js';

const file = (name, lastModified = 0, type = '') => ({ name, lastModified, type });

describe('sortFiles', () => {
  it('sorts names like a human (2 before 10)', () => {
    const sorted = sortFiles([file('IMG_10.png'), file('IMG_2.png'), file('IMG_1.png')], 'name');
    expect(sorted.map((f) => f.name)).toEqual(['IMG_1.png', 'IMG_2.png', 'IMG_10.png']);
  });

  it('sorts by date', () => {
    const sorted = sortFiles([file('b', 3), file('a', 2), file('c', 1)], 'date');
    expect(sorted.map((f) => f.name)).toEqual(['c', 'a', 'b']);
  });
});

describe('file types', () => {
  it('accepts images and PDFs, even without a MIME type', () => {
    expect(isImportable(file('scan.PDF'))).toBe(true);
    expect(isImportable(file('photo.heic'))).toBe(true);
    expect(isImportable(file('x', 0, 'image/png'))).toBe(true);
    expect(isImportable(file('notes.txt', 0, 'text/plain'))).toBe(false);
  });

  it('names a notebook after a single PDF', () => {
    expect(defaultNotebookTitle([file('Biology 101.pdf', 0, 'application/pdf')])).toBe('Biology 101');
  });
});
