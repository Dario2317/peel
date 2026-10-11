import { useMemo, useState } from 'react';
import { defaultNotebookTitle, isPdf, sortFiles } from './fileTypes.js';
import { importFiles } from './importFiles.js';
import { PageIcon } from '../ui/icons.jsx';

/**
 * Shown after picking/dropping/pasting files.
 *   notebookId:   add to this notebook (null = make a new one)
 *   currentIndex: the page you're on, for "insert after this page"
 *   onDone(notebookId)
 */
export function ImportDialog({ files, notebookId = null, currentIndex = null, onDone, onClose }) {
  const [sortBy, setSortBy] = useState('name');
  const [title, setTitle] = useState(() => defaultNotebookTitle(files));
  const [where, setWhere] = useState('end');
  const [progress, setProgress] = useState(null); // { done, total, label } while importing
  const [errors, setErrors] = useState([]);
  const [finished, setFinished] = useState(null);

  const sorted = useMemo(() => sortFiles(files, sortBy), [files, sortBy]);
  const pdfCount = files.filter(isPdf).length;
  const imageCount = files.length - pdfCount;
  const summary = [
    imageCount && `${imageCount} image${imageCount > 1 ? 's' : ''}`,
    pdfCount && `${pdfCount} PDF${pdfCount > 1 ? 's' : ''}`,
  ].filter(Boolean).join(' and ');

  const start = async () => {
    setProgress({ done: 0, total: files.length, label: '' });
    const result = await importFiles({
      files: sorted,
      notebookId,
      title: title.trim() || defaultNotebookTitle(files),
      insertAt: notebookId && where === 'after' && currentIndex !== null ? currentIndex + 1 : null,
      onProgress: setProgress,
    });
    if (result.errors.length) {
      // Show what went wrong; closing then opens whatever did get imported.
      setErrors(result.errors);
      setProgress(null);
      setFinished(result);
      return;
    }
    onDone(result.notebookId);
  };

  const close = () => (finished?.added ? onDone(finished.notebookId) : onClose());
  const busy = progress !== null;

  return (
    <div className="dialog-backdrop" onPointerDown={(e) => !busy && e.target === e.currentTarget && close()}>
      <div className="dialog import-dialog">
        <h2>{notebookId ? 'Add pages' : 'New notebook'}</h2>
        <p className="muted">{summary}</p>

        {errors.length > 0 && (
          <div className="error-box">
            <strong>Some files could not be imported:</strong>
            <ul>{errors.map((e) => <li key={e}>{e}</li>)}</ul>
          </div>
        )}

        {!notebookId && (
          <label className="field">
            <span>Title</span>
            <input className="text-input" value={title} disabled={busy} onChange={(e) => setTitle(e.target.value)} />
          </label>
        )}

        {files.length > 1 && (
          <div className="field">
            <span>Order</span>
            <div className="segmented">
              <button className={sortBy === 'name' ? 'on' : ''} disabled={busy} onClick={() => setSortBy('name')}>By name</button>
              <button className={sortBy === 'date' ? 'on' : ''} disabled={busy} onClick={() => setSortBy('date')}>By date</button>
            </div>
          </div>
        )}

        {notebookId && currentIndex !== null && (
          <div className="field">
            <span>Insert</span>
            <div className="segmented">
              <button className={where === 'end' ? 'on' : ''} disabled={busy} onClick={() => setWhere('end')}>At the end</button>
              <button className={where === 'after' ? 'on' : ''} disabled={busy} onClick={() => setWhere('after')}>After page {currentIndex + 1}</button>
            </div>
          </div>
        )}

        <ol className="file-list">
          {sorted.slice(0, 200).map((file, i) => (
            <li key={i}>
              <PageIcon size={16} />
              <span>{file.name}</span>
            </li>
          ))}
          {sorted.length > 200 && <li className="muted">…and {sorted.length - 200} more</li>}
        </ol>

        {busy && (
          <div className="progress">
            <div className="progress-bar">
              <div style={{ width: `${(progress.done / Math.max(1, progress.total)) * 100}%` }} />
            </div>
            <span className="muted small">{progress.label}</span>
          </div>
        )}

        <div className="dialog-buttons">
          <button className="button" disabled={busy} onClick={close}>
            {errors.length ? 'Close' : 'Cancel'}
          </button>
          {!errors.length && (
            <button className="button primary" disabled={busy} onClick={start}>
              {busy ? 'Importing…' : 'Import'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
