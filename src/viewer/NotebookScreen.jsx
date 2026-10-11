import { useEffect, useMemo, useRef, useState } from 'react';
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
import { Viewer } from './Viewer.jsx';
import { Thumbnails } from './Thumbnails.jsx';
import { CropTool } from './CropTool.jsx';
import { askText } from '../ui/dialogs.jsx';
import { Menu } from '../ui/Menu.jsx';
import {
  BackIcon, CropIcon, FitWidthIcon, ImportIcon, PageIcon, PagesIcon, PasteIcon, PlusIcon, StudyIcon,
} from '../ui/icons.jsx';
import '../styles/viewer.css';

const POSTIT_SIZE = 0.07; // of the page width

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
  const [tool, setTool] = useState('select'); // 'select' | 'postit' | 'tape'
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
  latest.current = { mode, tool, tapeStyle, postItColor, selected, pages, study };

  const actions = {
    tapItem(pageId, itemId, pointerType) {
      const item = store.getItem(pageId, itemId);
      if (!item) return;
      const { mode } = latest.current;
      if (mode === 'study' && item.type === 'tape') latest.current.study.reveal(item.id);
      else if (mode === 'study' && item.type !== 'postit') return;
      else setSelected({ pageId, itemId });
    },
    tapEmpty({ x, y, pointerType }) {
      const { mode, tool, selected } = latest.current;
      if (selected) {
        setSelected(null); // tap outside closes the open note/tape options
        return;
      }
      if (mode === 'edit' && tool === 'postit') actions.createPostIt(x, y, pointerType);
    },
    createPostIt(clientX, clientY, pointerType) {
      const hit = viewerRef.current?.viewport.clientToPage(clientX, clientY);
      if (!hit) return;
      const height = (POSTIT_SIZE * hit.rect.w) / hit.rect.h; // as a fraction of the page height
      const note = {
        id: newId('note'),
        type: 'postit',
        x: clamp(hit.x - POSTIT_SIZE / 2, 0, 1 - POSTIT_SIZE),
        y: clamp(hit.y - height / 2, 0, 1 - height),
        size: POSTIT_SIZE,
        color: latest.current.postItColor,
        ink: [], // drawn with the Pencil inside the open note
        text: '', // optional typed text
        style: { font: 'system', fontSize: 0.02, color: '#2b2620', bold: false, italic: false },
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
        actions: {
          tapItem: (...args) => actions.tapItem(...args),
          tapEmpty: (...args) => actions.tapEmpty(...args),
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
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && !typing) {
        const sel = latest.current.selected;
        const item = sel && store.getItem(sel.pageId, sel.itemId);
        if (item && latest.current.mode === 'edit') {
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
    () => store && { store, mode, peek, selected, study: s },
    [store, mode, peek, selected, s],
  );

  if (!notebook || !pages || initialView === undefined || !store) return <div className="notebook" />;

  const index = Math.min(currentIndex, pages.length - 1);
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
