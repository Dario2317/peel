import { useEffect, useMemo, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db.js';
import { markOpened, renameNotebook } from '../db/notebooks.js';
import { addBlankPage } from '../db/pages.js';
import { getSetting, setSetting } from '../db/settings.js';
import { closeAllPdfs } from '../import/pdf.js';
import { useFileIntake } from '../import/useFileIntake.js';
import { ImportDialog } from '../import/ImportDialog.jsx';
import { Viewer } from './Viewer.jsx';
import { Thumbnails } from './Thumbnails.jsx';
import { CropTool } from './CropTool.jsx';
import { askText } from '../ui/dialogs.jsx';
import { Menu } from '../ui/Menu.jsx';
import { BackIcon, CropIcon, FitWidthIcon, ImportIcon, PageIcon, PagesIcon, PasteIcon, PlusIcon } from '../ui/icons.jsx';
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

  const [initialView, setInitialView] = useState(undefined);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [showPages, setShowPages] = useState(false);
  const [cropPage, setCropPage] = useState(null);
  const [incoming, setIncoming] = useState(null);
  const viewerRef = useRef(null);
  const { pick, pasteFromClipboard, dragging } = useFileIntake(setIncoming, !incoming && !cropPage);

  useEffect(() => {
    getSetting('view:' + notebookId, null).then(setInitialView);
    markOpened(notebookId);
    setSetting('lastNotebook', notebookId);
    return () => closeAllPdfs();
  }, [notebookId]);

  // The notebook was deleted (e.g. in another window).
  useEffect(() => {
    if (notebook === null) onBack();
  }, [notebook]);

  if (!notebook || !pages || initialView === undefined) return <div className="notebook" />;

  const index = Math.min(currentIndex, pages.length - 1);
  const current = pages[index];

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
    <div className="notebook">
      <header className="topbar">
        <button className="icon-button" onClick={onBack} aria-label="Back to library" title="Library">
          <BackIcon />
        </button>
        <button className="title-button" onClick={rename} title="Rename">
          {notebook.title}
        </button>
        <div className="spacer" />
        {pages.length > 0 && (
          <button className="page-indicator" onClick={jumpTo} title="Go to page">
            {index + 1} / {pages.length}
          </button>
        )}
        <button
          className={`icon-button ${showPages ? 'on' : ''}`}
          onClick={() => setShowPages(!showPages)}
          aria-label="Pages"
          title="Pages"
        >
          <PagesIcon />
        </button>
        <button className="icon-button" onClick={() => viewerRef.current?.fitWidth()} aria-label="Fit width" title="Fit width">
          <FitWidthIcon />
        </button>
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
      </header>

      <div className="notebook-body">
        <Viewer
          ref={viewerRef}
          pages={pages}
          initialView={initialView}
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

        {showPages && (
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
      </div>

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
