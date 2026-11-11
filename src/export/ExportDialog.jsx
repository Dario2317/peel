import { useEffect, useRef, useState } from 'react';
import { getSetting, setSetting } from '../db/settings.js';
import { isIOS } from '../utils/platform.js';
import { exportNotebookPdf } from './exportPdf.js';

const DEFAULTS = { tapes: 'on', notes: 'on', quality: 'standard' };

/**
 * "Export PDF": choose the pages and what to include, wait for it, then
 * share or save the file.
 *   notebook:     { id, title, pageIds }
 *   currentIndex: the page you're on (null from the library)
 */
export function ExportDialog({ notebook, currentIndex = null, onClose }) {
  const pageCount = notebook.pageIds.length;
  const [range, setRange] = useState('all'); // 'all' | 'this' | 'some'
  const [from, setFrom] = useState(String((currentIndex ?? 0) + 1));
  const [to, setTo] = useState(String(pageCount));
  const [options, setOptions] = useState(DEFAULTS);
  const [progress, setProgress] = useState(null); // { done, total, label } while working
  const [result, setResult] = useState(null); // { blob, fileName, pageCount }
  const [error, setError] = useState('');
  const controller = useRef(null);

  // The choices are remembered for next time.
  useEffect(() => {
    getSetting('exportPdf', null).then((saved) => saved && setOptions({ ...DEFAULTS, ...saved }));
    return () => controller.current?.abort(); // closed while working
  }, []);
  const choose = (fields) => {
    const next = { ...options, ...fields };
    setOptions(next);
    setSetting('exportPdf', next);
  };

  const pageRange = () => {
    if (range === 'this' && currentIndex !== null) return [currentIndex, currentIndex];
    if (range === 'some') {
      const a = parseInt(from, 10);
      const b = parseInt(to, 10);
      if (!(a >= 1 && b >= a && a <= pageCount)) return null;
      return [a - 1, Math.min(b, pageCount) - 1];
    }
    return [0, pageCount - 1];
  };
  const chosen = pageRange();

  const start = async () => {
    if (!chosen) return;
    setError('');
    setProgress({ done: 0, total: 1, label: 'Getting ready…' });
    controller.current = new AbortController();
    try {
      const made = await exportNotebookPdf({
        notebookId: notebook.id,
        from: chosen[0],
        to: chosen[1],
        tapes: options.tapes === 'on',
        notes: options.notes === 'on',
        quality: options.quality,
        onProgress: setProgress,
        signal: controller.current.signal,
      });
      setResult(made);
    } catch (e) {
      if (e?.name !== 'AbortError' && e?.name !== 'RenderingCancelledException') {
        console.error('PDF export failed', e);
        setError(e?.message || 'Something went wrong.');
      }
    } finally {
      controller.current = null;
      setProgress(null);
    }
  };

  const cancel = () => controller.current?.abort();
  const busy = progress !== null;

  // --- Done: share or save ---------------------------------------------------
  const file = result && new File([result.blob], result.fileName, { type: 'application/pdf' });
  const canShare = Boolean(file && navigator.canShare?.({ files: [file] }));

  const share = async () => {
    try {
      await navigator.share({ files: [file], title: notebook.title });
    } catch (e) {
      if (e?.name !== 'AbortError') setError('Sharing did not work. Try Save instead.');
    }
  };
  const save = () => {
    const url = URL.createObjectURL(result.blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = result.fileName;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  };

  if (result) {
    const shareFirst = canShare && isIOS(); // on the iPad, Share is how you save to Files
    const mb = result.blob.size / 1024 / 1024;
    const size = mb >= 1 ? `${mb.toFixed(1)} MB` : `${Math.max(1, Math.round(mb * 1024))} KB`;
    return (
      <Backdrop onClose={onClose}>
        <h2>PDF ready</h2>
        <p className="muted">
          {result.fileName} · {result.pageCount} page{result.pageCount === 1 ? '' : 's'} · {size}
        </p>
        {error && <div className="error-box">{error}</div>}
        <div className="dialog-buttons">
          <button className="button" onClick={onClose}>Close</button>
          {canShare && (
            <button className={`button ${shareFirst ? 'primary' : ''}`} onClick={share}>Share…</button>
          )}
          <button className={`button ${shareFirst ? '' : 'primary'}`} onClick={save}>Save</button>
        </div>
      </Backdrop>
    );
  }

  // --- Options ---------------------------------------------------------------
  const segmented = (value, onPick, choices) => (
    <div className="segmented">
      {choices.map(([id, label]) => (
        <button key={id} className={value === id ? 'on' : ''} disabled={busy} onClick={() => onPick(id)}>
          {label}
        </button>
      ))}
    </div>
  );

  return (
    <Backdrop onClose={busy ? null : onClose}>
      <h2>Export PDF</h2>
      <p className="muted">{notebook.title}</p>

      {error && <div className="error-box">{error}</div>}

      <div className="field">
        <span>Pages</span>
        {segmented(range, setRange, [
          ['all', `All (${pageCount})`],
          ...(currentIndex !== null ? [['this', `This page (${currentIndex + 1})`]] : []),
          ['some', 'From – to'],
        ])}
        {range === 'some' && (
          <div className="export-range">
            <input className="text-input" inputMode="numeric" value={from} disabled={busy} onChange={(e) => setFrom(e.target.value)} aria-label="From page" />
            <span>to</span>
            <input className="text-input" inputMode="numeric" value={to} disabled={busy} onChange={(e) => setTo(e.target.value)} aria-label="To page" />
          </div>
        )}
      </div>

      <div className="field">
        <span>Tapes</span>
        {segmented(options.tapes, (tapes) => choose({ tapes }), [['on', 'On (answers hidden)'], ['off', 'Off']])}
      </div>

      <div className="field">
        <span>Post-it notes</span>
        {segmented(options.notes, (notes) => choose({ notes }), [['on', 'Include'], ['off', 'Leave out']])}
        {options.notes === 'on' && (
          <span className="muted small export-hint">Each note gets its own page after its page. Tap a numbered note to jump there.</span>
        )}
      </div>

      <div className="field">
        <span>Quality</span>
        {segmented(options.quality, (quality) => choose({ quality }), [['standard', 'Standard'], ['high', 'High (bigger file)']])}
      </div>

      {busy && (
        <div className="progress">
          <div className="progress-bar">
            <div style={{ width: `${(progress.done / Math.max(1, progress.total)) * 100}%` }} />
          </div>
          <span className="muted small">{progress.label}</span>
        </div>
      )}

      <div className="dialog-buttons">
        <button className="button" onClick={busy ? cancel : onClose}>Cancel</button>
        <button className="button primary" disabled={busy || !chosen} onClick={start}>
          {busy ? 'Exporting…' : 'Export'}
        </button>
      </div>
    </Backdrop>
  );
}

function Backdrop({ onClose, children }) {
  useEffect(() => {
    if (!onClose) return;
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="dialog-backdrop" onPointerDown={(e) => onClose && e.target === e.currentTarget && onClose()}>
      <div className="dialog export-dialog">{children}</div>
    </div>
  );
}
