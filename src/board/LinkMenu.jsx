import { useState } from 'react';

// A link saved on a note, e.g. to a Freeform board: { name, url }.
// Opening it leaves Peel (Freeform, Safari…).
export function openLink(link) {
  window.open(link.url, '_blank', 'noopener');
}

export function isValidUrl(text) {
  try {
    const url = new URL(text.trim());
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
}

/**
 * Add, change or remove the note's link.
 *   link: { name, url } or undefined; onSave(link | null)
 */
export function LinkMenu({ link, onSave, onClose }) {
  const [name, setName] = useState(link?.name ?? '');
  const [url, setUrl] = useState(link?.url ?? '');
  const valid = isValidUrl(url);

  return (
    <div className="board-menu link">
      <span className="menu-label">Link (e.g. a Freeform board)</span>
      <input className="text-input" placeholder="Name, e.g. Krebs cycle map" value={name} onChange={(e) => setName(e.target.value)} />
      <input
        className="text-input"
        placeholder="Paste the link (Freeform: Share → Copy Link)"
        value={url}
        inputMode="url"
        autoCapitalize="off"
        autoCorrect="off"
        onChange={(e) => setUrl(e.target.value)}
      />
      {url && !valid && <span className="link-warning">That doesn't look like a link (it should start with https://).</span>}
      <span className="muted small">Shared links can expire, but the name stays as a reminder.</span>
      <div className="dialog-buttons">
        {link && (
          <button
            className="button small"
            onClick={() => {
              onSave(null);
              onClose();
            }}
          >
            Remove
          </button>
        )}
        <button
          className="button small primary"
          disabled={!valid}
          onClick={() => {
            onSave({ name: name.trim() || 'Link', url: url.trim() });
            onClose();
          }}
        >
          Save
        </button>
      </div>
    </div>
  );
}
