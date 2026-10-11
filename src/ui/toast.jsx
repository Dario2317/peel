// Short messages at the bottom of the screen:
//   showToast('Saved'), or with a button:
//   showToast('Update ready', { actionLabel: 'Reload', onAction: …, duration: 0 })
import { useSyncExternalStore } from 'react';

let toasts = [];
let nextId = 1;
const listeners = new Set();

function emit() {
  listeners.forEach((listener) => listener());
}

export function showToast(message, { actionLabel, onAction, duration = 3500 } = {}) {
  const id = nextId++;
  toasts = [...toasts, { id, message, actionLabel, onAction }];
  emit();
  if (duration) setTimeout(() => dismissToast(id), duration);
  return id;
}

export function dismissToast(id) {
  toasts = toasts.filter((t) => t.id !== id);
  emit();
}

export function ToastHost() {
  const list = useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => toasts,
  );
  return (
    <div className="toasts" aria-live="polite">
      {list.map((t) => (
        <div key={t.id} className="toast">
          <span>{t.message}</span>
          {t.actionLabel && (
            <button
              className="button small primary"
              onClick={() => {
                dismissToast(t.id);
                t.onAction?.();
              }}
            >
              {t.actionLabel}
            </button>
          )}
          <button className="icon-button small" aria-label="Dismiss" onClick={() => dismissToast(t.id)}>
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
