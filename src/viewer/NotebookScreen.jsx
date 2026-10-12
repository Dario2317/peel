import { useEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db.js';
import { markOpened, renameNotebook } from '../db/notebooks.js';
import { addBlankPage } from '../db/pages.js';
import { getSetting, setSetting } from '../db/settings.js';
import { closeAllPdfs } from '../import/pdf.js';
import { useFileIntake } from '../import/useFileIntake.js';
import { ImportDialog } from '../import/ImportDialog.jsx';
import { useNotebookStore } from '../state/useAnnotations.js';
import { createToolRouter } from '../tools/toolRouter.js';
import { Toolbar } from '../tools/Toolbar.jsx';
import { SelectedItemPanel } from '../tools/SelectedItemPanel.jsx';
import { useStudySession } from '../study/useStudySession.js';
import { StudyBar } from '../study/StudyBar.jsx';
import { StudySummary } from '../study/StudySummary.jsx';
import { newId } from '../utils/ids.js';
import { clamp } from '../utils/platform.js';
import { NOTE_MARKER_PX } from '../overlay/looks.js';
import { Viewer } from './Viewer.jsx';
import { PageZoomWindow } from './PageZoomWindow.jsx';
import { pageAspect, pageIndexAt, PAGE_WIDTH } from './layout.js';
import { Thumbnails } from './Thumbnails.jsx';
import { CropTool } from './CropTool.jsx';
import { askText } from '../ui/dialogs.jsx';
import { Menu } from '../ui/Menu.jsx';
import {
  BackIcon, CropIcon, FitWidthIcon, ImportIcon, PageIcon, PagesIcon, PasteIcon, PlusIcon, StudyIcon, ZoomWindowIcon,
} from '../ui/icons.jsx';
import { useInkTool } from '../ink/useInkTool.js';
import { HIGHLIGHT_OPACITY } from '../ink/inkStyle.js';
import { deleteSelection } from '../tools/pageDrawing.js';
import { styleOf, useTextStyle } from '../text/useTextStyle.js';
import { TrashIcon } from '../ui/icons.jsx';
import '../styles/viewer.css';

export function NotebookScreen({ notebookId, onBack }) {
  const notebook = useLiveQuery(async () => (await db.notebooks.get(notebookId)) ?? null, [notebookId]);
  const pageRows = useLiveQuery(() => db.pages.where('notebookId').equals(notebookId).toArray(), [notebookId]);
  // The pages in notebook order.
  const pages = useMemo(() => {
    if (!notebook || !pageRows) return null;
    const byId = new Map(pageRows.map((p) => [p.id, p]));
    return notebook.pageIds.map((id) => byId.get(id)).filter(Boolean);
  }, [notebook?.pageIds, pageRows]);
  const store = useNotebookStore(notebookId);

  const [initialView, setInitialView] = useState(undefined);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [showPages, setShowPages] = useState(false);
  const [cropPage, setCropPage] = useState(null);
  const [incoming, setIncoming] = useState(null);
  const viewerRef = useRef(null);

  // Editing state
  const [mode, setMode] = useState('edit'); // 'edit' | 'study'
  // 'select' (Move) | 'pen' | 'highlighter' | 'eraser' | 'lasso' | 'text' | 'postit' | 'tape'
  const [tool, setTool] = useState('select');
  const [ink, setInk] = useInkTool(); // pen colors, sizes, smoothing
  const [textStyle, setTextStyle] = useTextStyle(); // font etc. for new text boxes
  const [activeText, setActiveText] = useState(null); // { pageId, id, editing } the text box you're working on
  const textFields = useRef(new Map()); // text box id -> its <textarea> while editing
  const editStart = useRef(new Map()); // text box id -> how it was before this edit (null = new)
  const [zoomBox, setZoomBox] = useState(null); // the zoom window's box: { pageId, x, y, w, h, lineStartX }
  const zoomWidth = useRef(null); // its size (= magnification), remembered
  const [lasso, setLasso] = useState(null); // lasso selection: { pageId, ids, box, dx, dy }
  const [tapeStyle, setTapeStyle] = useState({ color: 'mint', pattern: 'stripes' });
  const [postItColor, setPostItColor] = useState('yellow');
  const [peek, setPeek] = useState(false);
  const [selected, setSelected] = useState(null); // { pageId, itemId, startTyping }

  const study = useStudySession({ store, notebookId, pages: pages ?? [], getViewer: () => viewerRef.current });
  const { pick, pasteFromClipboard, dragging } = useFileIntake(setIncoming, !incoming && !cropPage && mode === 'edit');

  useEffect(() => {
    getSetting('view:' + notebookId, null).then(setInitialView);
    getSetting('tool', 'select').then(setTool);
    getSetting('tapeStyle', null).then((style) => style && setTapeStyle(style));
    getSetting('postItColor', null).then((color) => color && setPostItColor(color));
    markOpened(notebookId);
    setSetting('lastNotebook', notebookId);
    return () => closeAllPdfs();
  }, [notebookId]);

  // The notebook was deleted (e.g. in another window).
  useEffect(() => {
    if (notebook === null) onBack();
  }, [notebook]);

  // --- Actions (kept in a ref so the tool router always sees the latest) ---
  const latest = useRef({});
  latest.current = { mode, tool, tapeStyle, postItColor, selected, pages, study, ink, lasso, textStyle, activeText, zoomBox };

  // --- Zoom window ------------------------------------------------------------
  useEffect(() => {
    getSetting('pageZoomWidth', null).then((w) => (zoomWidth.current = w));
  }, []);

  // Opens with the box near the top-left of what you see of the current page.
  const openZoomWindow = () => {
    const viewport = viewerRef.current?.viewport;
    if (!viewport?.ready || !latest.current.pages?.length) return;
    const index = Math.min(viewport.currentIndex, latest.current.pages.length - 1);
    const r = viewport.layout.rects[index];
    const view = viewport.visibleWorldRect();
    const visibleW = Math.min(view.right, r.x + r.w) - Math.max(view.left, r.x);
    const w = zoomWidth.current ?? clamp(visibleW * 0.4, 120, 400);
    const left = Math.max(view.left, r.x) - r.x;
    const top = Math.max(view.top, r.y) - r.y;
    const x = clamp(left + visibleW * 0.06, 0, PAGE_WIDTH - w);
    const y = clamp(top + (Math.min(view.bottom, r.y + r.h) - Math.max(view.top, r.y)) * 0.1, 0, r.h);
    setZoomBox({ pageId: viewport.pageIds[index], x, y, w, h: w * 0.35, lineStartX: x });
    setLasso(null);
  };

  // After the box moved: if it ran off its page (top or bottom), it goes on
  // the page it's over now. Also remembers its size, and keeps it on screen.
  const zoomBoxMoved = (box) => {
    const viewport = viewerRef.current?.viewport;
    if (!viewport?.ready) return;
    let index = viewport.pageIds.indexOf(box.pageId);
    if (index < 0) return;
    const worldY = viewport.layout.rects[index].y + box.y + box.h / 2;
    const next = pageIndexAt(viewport.layout.rects, worldY);
    let moved = box;
    if (next !== index) {
      const shift = viewport.layout.rects[index].y - viewport.layout.rects[next].y;
      moved = { ...box, pageId: viewport.pageIds[next], y: box.y + shift };
      index = next;
      setZoomBox(moved);
    }
    if (zoomWidth.current !== moved.w) {
      zoomWidth.current = moved.w;
      setSetting('pageZoomWidth', moved.w);
    }
    const r = viewport.layout.rects[index];
    viewport.showRegion(index, { x: moved.x / r.w, y: moved.y / r.h, w: moved.w / r.w, h: moved.h / r.h });
  };

  // --- Text boxes on the pages -------------------------------------------------
  // Typing in a box (creating it + typing + moving) is one undo step,
  // recorded when you finish.
  const recordTextChange = (pageId, id, before) => {
    const now = store.getItem(pageId, id) ?? null;
    if (JSON.stringify(before) === JSON.stringify(now)) return;
    store.pushHistory([{ pageId, before, after: now }]);
  };

  // Focusing inside the tap itself is what makes the iPad show the keyboard
  // (flushSync puts the text field on screen first).
  const beginTextEdit = (pageId, id) => {
    if (!editStart.current.has(id)) editStart.current.set(id, store.getItem(pageId, id) ?? null);
    flushSync(() => setActiveText({ pageId, id, editing: true }));
    const field = textFields.current.get(id);
    if (!field) return;
    field.focus({ preventScroll: true });
    field.setSelectionRange(field.value.length, field.value.length);
  };

  // The text field lost focus: keep the box selected (for its handles and
  // the text options), remove it if it's empty, record the undo step.
  const endTextEdit = (pageId, id) => {
    if (!editStart.current.has(id)) return; // already finished (e.g. deleted)
    const box = store.getItem(pageId, id);
    const empty = !box || !box.text.trim();
    if (box && empty) store.change(pageId, box, null, { history: false });
    const before = editStart.current.get(id);
    editStart.current.delete(id);
    recordTextChange(pageId, id, before);
    setActiveText((current) => (current?.id !== id ? current : empty ? null : { ...current, editing: false }));
  };

  const deleteText = (pageId, id) => {
    const before = editStart.current.has(id) ? editStart.current.get(id) : store.getItem(pageId, id);
    editStart.current.delete(id);
    const box = store.getItem(pageId, id);
    if (box) store.change(pageId, box, null, { history: false });
    if (before) recordTextChange(pageId, id, before);
    setActiveText((current) => (current?.id === id ? null : current));
  };

  // Stop working on the active text box (closes the keyboard).
  const finishText = () => {
    const active = latest.current.activeText;
    if (!active) return;
    textFields.current.get(active.id)?.blur();
    setActiveText(null);
  };

  const createText = (clientX, clientY) => {
    const viewport = viewerRef.current?.viewport;
    const hit = viewport?.clientToNearestPage(clientX, clientY);
    if (!hit) return;
    const style = latest.current.textStyle;
    const onPage = hit.x >= 0 && hit.x <= 1;
    const box = {
      id: newId('text'),
      type: 'text',
      x: hit.x,
      y: hit.y - (style.size * 0.65) / hit.rect.h, // the first line sits where you tapped
      w: onPage ? clamp(1 - hit.x - 0.03, 0.2, 0.6) : 0.4,
      text: '',
      ...style,
      createdAt: Date.now(),
    };
    editStart.current.set(box.id, null);
    store.change(hit.pageId, null, box, { history: false });
    beginTextEdit(hit.pageId, box.id);
  };

  // Font, size, color, bold, italic: for the active text box (if any) and
  // for new ones.
  const changeTextStyle = (fields) => {
    setTextStyle(fields);
    const active = latest.current.activeText;
    const box = active && store.getItem(active.pageId, active.id);
    if (!box) return;
    // While typing it's part of the edit (one undo step); otherwise its own step.
    store.change(active.pageId, box, { ...box, ...fields }, { history: !editStart.current.has(box.id) });
  };

  // What the text field calls. Stable, so the pages don't redraw for it.
  const textEdit = useMemo(
    () => ({
      setRef: (id, el) => (el ? textFields.current.set(id, el) : textFields.current.delete(id)),
      onInput: (pageId, id, text) => {
        const box = store?.getItem(pageId, id);
        if (box) store.change(pageId, box, { ...box, text }, { history: false });
        latest.current.keepTextVisible?.();
      },
      onBlur: (pageId, id) => latest.current.endTextEdit(pageId, id),
      onDelete: (pageId, id) => latest.current.deleteText(pageId, id),
    }),
    [store],
  );
  latest.current.endTextEdit = endTextEdit;
  latest.current.deleteText = deleteText;

  const actions = {
    tapItem(pageId, itemId, pointerType) {
      const item = store.getItem(pageId, itemId);
      if (!item) return;
      const { mode } = latest.current;
      if (mode === 'study' && item.type === 'tape') latest.current.study.reveal(item.id);
      else if (mode === 'study' && item.type !== 'postit') return;
      else if (item.type === 'text') beginTextEdit(pageId, itemId);
      else {
        finishText();
        setSelected({ pageId, itemId });
      }
    },
    tapEmpty({ x, y, pointerType }) {
      const { mode, tool, selected, activeText } = latest.current;
      if (selected) {
        setSelected(null); // tap outside closes the open note/tape options
        return;
      }
      if (activeText) {
        finishText(); // first tap outside: just stop working on the text
        return;
      }
      if (mode === 'edit' && tool === 'postit') actions.createPostIt(x, y, pointerType);
      if (mode === 'edit' && tool === 'text') createText(x, y);
    },
    createPostIt(clientX, clientY, pointerType) {
      const viewport = viewerRef.current?.viewport;
      const hit = viewport?.clientToPage(clientX, clientY);
      if (!hit) return;
      // The pin is NOTE_MARKER_PX on screen; center it where you tapped.
      const scale = viewport.getCamera().scale;
      const w = NOTE_MARKER_PX / scale / hit.rect.w;
      const h = NOTE_MARKER_PX / scale / hit.rect.h;
      const note = {
        id: newId('note'),
        type: 'postit',
        x: clamp(hit.x - w / 2, 0, 1 - w),
        y: clamp(hit.y - h / 2, 0, 1 - h),
        color: latest.current.postItColor,
        ink: [], // drawn on the note's board (board units)
        text: '', // optional typed text
        view: null, // where you last were on the board
        createdAt: Date.now(),
      };
      store.change(hit.pageId, null, note);
      // With a mouse, start typing; with the Pencil or a finger, start drawing.
      setSelected({ pageId: hit.pageId, itemId: note.id, startTyping: pointerType === 'mouse' });
    },
  };

  const router = useMemo(
    () =>
      store &&
      createToolRouter({
        getState: () => latest.current,
        getViewport: () => viewerRef.current?.viewport,
        store,
        // What drawing on the pages needs (see tools/pageDrawing.js).
        drawing: () => ({
          store,
          viewport: viewerRef.current.viewport,
          wet: viewerRef.current.wet,
          getState: () => latest.current,
          showCursor: (x, y) => viewerRef.current?.showCursor(x, y),
          setLasso,
        }),
        actions: {
          tapItem: (...args) => actions.tapItem(...args),
          tapEmpty: (...args) => actions.tapEmpty(...args),
          isEditingText: (id) => editStart.current.has(id),
          getZoomBox: () => latest.current.zoomBox,
          setZoomBox: (box) => setZoomBox(box),
          zoomBoxMoved: (box) => zoomBoxMoved(box),
        },
      }),
    [store],
  );

  // --- Undo / redo ----------------------------------------------------------
  const pageIndexOf = (pageId) => (pages ? pages.findIndex((p) => p.id === pageId) : -1);
  const afterHistory = (pageId) => {
    if (pageId) viewerRef.current?.ensurePageVisible(pageIndexOf(pageId));
  };
  const undo = () => latest.current.mode === 'edit' && afterHistory(store.undo());
  const redo = () => latest.current.mode === 'edit' && afterHistory(store.redo());

  // Keyboard: Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z or Ctrl+Y, Delete, Escape.
  useEffect(() => {
    if (!store) return;
    const onKey = (e) => {
      const typing = e.target.closest?.('input, textarea, [contenteditable="true"]');
      const mod = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();
      if (mod && key === 'z' && !typing) {
        e.preventDefault();
        e.shiftKey ? redo() : undo();
      } else if (mod && key === 'y' && !typing) {
        e.preventDefault();
        redo();
      } else if (e.key === 'Escape') {
        setSelected(null);
        setLasso(null);
        finishText();
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && !typing && latest.current.lasso) {
        e.preventDefault();
        deleteSelection(store, latest.current.lasso);
        setLasso(null);
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && !typing && latest.current.activeText) {
        e.preventDefault();
        deleteText(latest.current.activeText.pageId, latest.current.activeText.id);
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && !typing) {
        const sel = latest.current.selected;
        const item = sel && store.getItem(sel.pageId, sel.itemId);
        // Only tapes: on an open post-it board the key must never delete the note.
        if (item?.type === 'tape' && latest.current.mode === 'edit') {
          e.preventDefault();
          store.change(sel.pageId, item, null);
          setSelected(null);
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [store, pages]);

  // --- Settings that are remembered ----------------------------------------
  const chooseTool = (t) => {
    setTool(t);
    setSetting('tool', t);
    setLasso(null);
    finishText();
    viewerRef.current?.showCursor(null);
  };

  // What the Pencil hover dot looks like for the current tool.
  const cursorFor = () => {
    const { mode, tool, ink } = latest.current;
    if (mode !== 'edit') return null;
    const scale = viewerRef.current?.viewport.getCamera()?.scale ?? 1;
    if (tool === 'pen') return { diameter: ink.penSize * scale, color: ink.penColor };
    if (tool === 'highlighter') return { diameter: ink.highlightSize * scale, color: ink.highlightColor + Math.round(HIGHLIGHT_OPACITY * 255).toString(16) };
    if (tool === 'eraser') return { eraser: true };
    return null;
  };
  const chooseTapeStyle = (style) => {
    setTapeStyle(style);
    setSetting('tapeStyle', style);
  };
  const choosePostItColor = (color) => {
    setPostItColor(color);
    setSetting('postItColor', color);
  };

  // --- Study ----------------------------------------------------------------
  const startStudy = async (scope, onlyTapeIds = null) => {
    setSelected(null);
    setLasso(null);
    finishText();
    setZoomBox(null);
    setShowPages(false);
    if (await study.start(scope, Math.min(currentIndex, (pages?.length ?? 1) - 1), onlyTapeIds)) setMode('study');
  };
  const endStudy = () => {
    study.stop();
    setMode('edit');
    setSelected(null);
  };
  const s = study.session;
  const missedIds = s ? Object.keys(s.results).filter((id) => s.results[id] === 'missed') : [];
  const revealedEntry = s?.revealedId ? s.queue.find((t) => t.tapeId === s.revealedId) : null;
  const revealedQuestion = revealedEntry ? store?.getItem(revealedEntry.pageId, revealedEntry.tapeId)?.question : '';

  const overlay = useMemo(
    () => store && { store, mode, peek, selected, study: s, lasso, text: { active: activeText, edit: textEdit }, zoomBox },
    [store, mode, peek, selected, s, lasso, activeText, textEdit, zoomBox],
  );
  // The same, for the copy of the page inside the zoom window.
  const zoomOverlay = useMemo(() => overlay && { ...overlay, inZoom: true }, [overlay]);

  // The keyboard covers the bottom of the screen: keep the text you're
  // typing above it.
  latest.current.keepTextVisible = () => {
    const active = latest.current.activeText;
    const field = active?.editing && textFields.current.get(active.id);
    const vv = window.visualViewport;
    if (!field || !vv) return;
    const bottom = field.getBoundingClientRect().bottom;
    const limit = vv.offsetTop + vv.height - 24;
    if (bottom > limit) viewerRef.current?.viewport.scrollBy(bottom - limit + 24);
  };
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv || !activeText?.editing) return;
    const check = () => latest.current.keepTextVisible();
    vv.addEventListener('resize', check);
    const timer = setTimeout(check, 400); // after the keyboard slid in
    return () => {
      vv.removeEventListener('resize', check);
      clearTimeout(timer);
    };
  }, [activeText?.id, activeText?.editing]);

  // The style the text options show: the active box's, or the one for new text.
  const activeBox = activeText && store?.getItem(activeText.pageId, activeText.id);
  const shownTextStyle = activeBox ? styleOf(activeBox) : textStyle;

  if (!notebook || !pages || initialView === undefined || !store) return <div className="notebook" />;

  const index = Math.min(currentIndex, pages.length - 1);
  const zoomPage = zoomBox && pages.find((p) => p.id === zoomBox.pageId);
  const current = pages[index];
  const editing = mode === 'edit';

  const rename = async () => {
    const title = await askText({ title: 'Rename notebook', initial: notebook.title });
    if (title !== null) renameNotebook(notebook.id, title);
  };

  const jumpTo = async () => {
    const answer = await askText({
      title: 'Go to page',
      message: `1 – ${pages.length}`,
      initial: String(index + 1),
      confirmLabel: 'Go',
      inputMode: 'numeric',
    });
    const n = parseInt(answer, 10);
    if (n >= 1 && n <= pages.length) viewerRef.current.goToPage(n - 1);
  };

  const addBlank = () => addBlankPage(notebook.id, index + 1, current);

  return (
    <div className={`notebook mode-${mode}`}>
      <header className="topbar">
        <button
          className="icon-button"
          onClick={() => {
            store.flush();
            onBack();
          }}
          aria-label="Back to library"
          title="Library"
        >
          <BackIcon />
        </button>
        <button className="title-button" onClick={rename} title="Rename">
          {editing ? notebook.title : 'Studying'}
        </button>
        <div className="spacer" />
        {pages.length > 0 && (
          <button className="page-indicator" onClick={jumpTo} title="Go to page">
            {index + 1} / {pages.length}
          </button>
        )}
        {editing && (
          <button
            className={`icon-button ${showPages ? 'on' : ''}`}
            onClick={() => setShowPages(!showPages)}
            aria-label="Pages"
            title="Pages"
          >
            <PagesIcon />
          </button>
        )}
        {editing && pages.length > 0 && (
          <button
            className={`icon-button ${zoomBox ? 'on' : ''}`}
            onClick={() => (zoomBox ? setZoomBox(null) : openZoomWindow())}
            aria-label="Zoom window"
            title="Zoom window: write big, it lands small"
          >
            <ZoomWindowIcon />
          </button>
        )}
        <button className="icon-button" onClick={() => viewerRef.current?.fitWidth()} aria-label="Fit width" title="Fit width">
          <FitWidthIcon />
        </button>
        {editing && (
          <>
            <button
              className="icon-button"
              onClick={() => setCropPage(current)}
              disabled={!current || current.kind === 'blank'}
              aria-label="Crop"
              title="Crop"
            >
              <CropIcon />
            </button>
            <Menu
              label="Add pages"
              icon={<PlusIcon />}
              items={[
                { label: 'Import files', icon: <ImportIcon size={18} />, onSelect: pick },
                { label: 'Paste image', icon: <PasteIcon size={18} />, onSelect: pasteFromClipboard },
                { label: 'Blank page after this one', icon: <PageIcon size={18} />, onSelect: addBlank },
              ]}
            />
            <Menu
              label="Study"
              className="button small study"
              icon={
                <>
                  <StudyIcon size={18} /> Study
                </>
              }
              items={[
                { label: 'Study the whole notebook', onSelect: () => startStudy('notebook') },
                { label: `Study page ${index + 1} only`, onSelect: () => startStudy('page') },
              ]}
            />
          </>
        )}
        {!editing && (
          <button className="button small study" onClick={study.finish}>
            End
          </button>
        )}
      </header>

      <div className="notebook-body">
        <Viewer
          ref={viewerRef}
          pages={pages}
          initialView={initialView}
          overlay={overlay}
          routePointer={router.routePointer}
          cursorFor={cursorFor}
          onTap={router.onTap}
          onUndo={undo}
          onRedo={redo}
          onCurrentPageChange={setCurrentIndex}
          onViewSettled={(anchor) => anchor && setSetting('view:' + notebookId, anchor)}
        />

        {pages.length === 0 && (
          <div className="empty-state floating">
            <h2>No pages yet</h2>
            <p>Add screenshots or a PDF, or drop files here.</p>
            <div className="row">
              <button className="button primary" onClick={pick}><ImportIcon size={18} /> Import files</button>
              <button className="button" onClick={() => addBlankPage(notebook.id, 0, null)}>Blank page</button>
            </div>
          </div>
        )}

        {editing && showPages && (
          <Thumbnails
            notebookId={notebook.id}
            pages={pages}
            currentIndex={index}
            onSelect={(i) => viewerRef.current.goToPage(i)}
            onClose={() => setShowPages(false)}
            onAddFiles={pick}
            onAddBlank={addBlank}
          />
        )}

        {editing && pages.length > 0 && (
          <Toolbar
            tool={tool}
            onTool={chooseTool}
            store={store}
            ink={ink}
            onInk={setInk}
            textStyle={shownTextStyle}
            onTextStyle={changeTextStyle}
            showTextOptions={tool === 'text' || Boolean(activeText)}
            peek={peek}
            onPeek={() => setPeek(!peek)}
            tapeStyle={tapeStyle}
            onTapeStyle={chooseTapeStyle}
            postItColor={postItColor}
            onPostItColor={choosePostItColor}
            onUndo={undo}
            onRedo={redo}
          />
        )}

        {editing && lasso && !lasso.dx && !lasso.dy && (
          <div className="selection-bar page">
            <span>{lasso.ids.size} selected · drag to move</span>
            <button
              className="button small"
              onClick={() => {
                deleteSelection(store, lasso);
                setLasso(null);
              }}
            >
              <TrashIcon size={16} /> Delete
            </button>
            <button className="button small" onClick={() => setLasso(null)}>
              Done
            </button>
          </div>
        )}

        {!editing && s && !s.finished && (
          <StudyBar
            session={s}
            question={revealedQuestion}
            onAnswer={study.answer}
            onSkip={study.skip}
            onFinish={study.finish}
          />
        )}
      </div>

      {editing && zoomPage && (
        <PageZoomWindow
          page={zoomPage}
          pageHeight={PAGE_WIDTH * pageAspect(zoomPage)}
          box={zoomBox}
          onChange={setZoomBox}
          onMoved={zoomBoxMoved}
          overlay={zoomOverlay}
          drawing={() => ({ store, getState: () => latest.current, setLasso })}
          onUndo={undo}
          onRedo={redo}
          onClose={() => setZoomBox(null)}
        />
      )}

      {selected && (
        <SelectedItemPanel
          key={selected.itemId}
          store={store}
          viewport={viewerRef.current?.viewport}
          pageIndex={pageIndexOf(selected.pageId)}
          selected={selected}
          mode={mode}
          onClose={() => setSelected(null)}
          onTapeStyleUsed={chooseTapeStyle}
          onPostItColorUsed={choosePostItColor}
        />
      )}

      {s?.finished && (
        <StudySummary
          session={s}
          onDone={endStudy}
          onRestart={() => startStudy(s.scope)}
          onRedoMissed={() => startStudy(s.scope, missedIds)}
        />
      )}

      {dragging && <div className="drop-overlay">Drop to add pages</div>}

      {cropPage && <CropTool page={cropPage} pages={pages} onClose={() => setCropPage(null)} />}

      {incoming && (
        <ImportDialog
          files={incoming}
          notebookId={notebook.id}
          currentIndex={pages.length ? index : null}
          onClose={() => setIncoming(null)}
          onDone={() => setIncoming(null)}
        />
      )}
    </div>
  );
}
