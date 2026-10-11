// Simple dialogs any code can open and wait for:
//   if (await askConfirm({ title: 'Delete?' })) …
//   const name = await askText({ title: 'Rename', initial: 'Old name' });
//   const pick = await askChoice({ title, choices: [{ label, value, danger }] });
// One <DialogHost/> in App.jsx shows whichever dialog is open.
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';

let current = null;
let nextId = 1;
const listeners = new Set();

function show(dialog) {
  current = dialog && { ...dialog, id: nextId++ };
  listeners.forEach((listener) => listener());
}

export function askConfirm({ title, message = '', confirmLabel = 'OK', danger = false }) {
  return new Promise((resolve) => {
    show({ kind: 'confirm', title, message, confirmLabel, danger, resolve });
  });
}

export function askText({ title, message = '', initial = '', confirmLabel = 'Save', inputMode = 'text' }) {
  return new Promise((resolve) => {
    show({ kind: 'text', title, message, initial, confirmLabel, inputMode, resolve });
  });
}

// Several answers; resolves to the chosen value, or null for Cancel.
export function askChoice({ title, message = '', choices }) {
  return new Promise((resolve) => {
    show({ kind: 'choice', title, message, choices, resolve });
  });
}

export function DialogHost() {
  const dialog = useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => current,
  );
  if (!dialog) return null;
  const close = (value) => {
    show(null);
    dialog.resolve(value);
  };
  return <Dialog key={dialog.id} dialog={dialog} close={close} />;
}

function Dialog({ dialog, close }) {
  const [text, setText] = useState(dialog.initial ?? '');
  const inputRef = useRef(null);
  const isText = dialog.kind === 'text';
  const cancelValue = dialog.kind === 'confirm' ? false : null;

  useEffect(() => {
    if (isText) inputRef.current?.select();
    const onKey = (e) => e.key === 'Escape' && close(cancelValue);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const submit = (e) => {
    e.preventDefault();
    if (dialog.kind !== 'choice') close(isText ? text : true);
  };

  return (
    <div className="dialog-backdrop" onPointerDown={(e) => e.target === e.currentTarget && close(cancelValue)}>
      <form className="dialog" onSubmit={submit}>
        <h2>{dialog.title}</h2>
        {dialog.message && <p>{dialog.message}</p>}
        {isText && (
          <input
            ref={inputRef}
            className="text-input"
            value={text}
            inputMode={dialog.inputMode}
            onChange={(e) => setText(e.target.value)}
            autoFocus
          />
        )}
        {dialog.kind === 'choice' ? (
          <div className="dialog-buttons stacked">
            {dialog.choices.map((choice) => (
              <button
                key={choice.label}
                type="button"
                className={`button ${choice.danger ? 'danger' : 'primary'}`}
                onClick={() => close(choice.value)}
              >
                {choice.label}
              </button>
            ))}
            <button type="button" className="button" onClick={() => close(cancelValue)}>
              Cancel
            </button>
          </div>
        ) : (
          <div className="dialog-buttons">
            <button type="button" className="button" onClick={() => close(cancelValue)}>
              Cancel
            </button>
            <button type="submit" className={`button ${dialog.danger ? 'danger' : 'primary'}`}>
              {dialog.confirmLabel}
            </button>
          </div>
        )}
      </form>
    </div>
  );
}
