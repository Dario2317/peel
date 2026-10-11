// A React hook: listens for files dropped on the window or pasted with
// Cmd/Ctrl+V, and gives you pick() and pasteFromClipboard() for buttons.
// All of them end up calling onFiles(files).
import { useEffect, useRef, useState } from 'react';
import { dragHasFiles, filesFromDrop, filesFromPaste, pickFiles, readClipboardFiles } from './pickFiles.js';
import { isImportable } from './fileTypes.js';
import { showToast } from '../ui/toast.jsx';

export function useFileIntake(onFiles, enabled = true) {
  const [dragging, setDragging] = useState(false);
  const callback = useRef(onFiles);
  callback.current = onFiles;

  useEffect(() => {
    if (!enabled) return;
    let dragTimer = 0;
    const onPaste = (e) => {
      if (e.target.closest?.('input, textarea, [contenteditable="true"]')) return;
      const files = filesFromPaste(e);
      if (files.length) {
        e.preventDefault();
        callback.current(files);
      }
    };
    const onDragOver = (e) => {
      if (!dragHasFiles(e)) return;
      e.preventDefault(); // needed to allow dropping
      setDragging(true);
      // dragover repeats while dragging; when it stops, the drag has left.
      clearTimeout(dragTimer);
      dragTimer = setTimeout(() => setDragging(false), 200);
    };
    const onDrop = (e) => {
      if (!dragHasFiles(e)) return;
      e.preventDefault();
      setDragging(false);
      const files = filesFromDrop(e);
      if (files.length) callback.current(files);
      else showToast('Only images and PDFs can be imported.');
    };
    window.addEventListener('paste', onPaste);
    window.addEventListener('dragover', onDragOver);
    window.addEventListener('drop', onDrop);
    return () => {
      clearTimeout(dragTimer);
      window.removeEventListener('paste', onPaste);
      window.removeEventListener('dragover', onDragOver);
      window.removeEventListener('drop', onDrop);
    };
  }, [enabled]);

  const pick = async () => {
    const files = (await pickFiles()).filter(isImportable);
    if (files.length) callback.current(files);
  };

  const pasteFromClipboard = async () => {
    try {
      const files = await readClipboardFiles();
      if (files.length) callback.current(files);
      else showToast('There is no image on the clipboard.');
    } catch (error) {
      showToast(error.name === 'NotAllowedError' ? 'Paste was not allowed.' : error.message);
    }
  };

  return { pick, pasteFromClipboard, dragging };
}
