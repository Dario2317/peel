import { describe, expect, it } from 'vitest';
import { folderPath, folderTree, subfolderIds } from './folders.js';

const folders = [
  { id: 'a', name: 'Biology', parentId: null },
  { id: 'b', name: 'Chapter 10', parentId: 'a' },
  { id: 'c', name: 'Chapter 2', parentId: 'a' },
  { id: 'd', name: 'Cells', parentId: 'c' },
  { id: 'e', name: 'Art', parentId: null },
];

describe('folders', () => {
  it('finds every folder inside one', () => {
    expect([...subfolderIds(folders, 'a')].sort()).toEqual(['b', 'c', 'd']);
    expect(subfolderIds(folders, 'e').size).toBe(0);
  });

  it('builds the path from the top of the library', () => {
    expect(folderPath(folders, 'd').map((f) => f.id)).toEqual(['a', 'c', 'd']);
    expect(folderPath(folders, 'missing')).toEqual([]);
  });

  it('lists the tree sorted by name, numbers in order', () => {
    expect(folderTree(folders).map((r) => `${r.depth}${r.folder.id}`)).toEqual(['0e', '0a', '1c', '2d', '1b']);
  });
});
