import { useEffect, useRef, useState } from 'react';
import { pageAspect } from './layout.js';
import { useThumbnailUrl } from './thumbnails.js';
import { movePage, removePages } from '../db/pages.js';
import { askConfirm } from '../ui/dialogs.jsx';
import { CloseIcon, GripIcon, ImportIcon, PageIcon, TrashIcon } from '../ui/icons.jsx';

// The side panel with all pages: tap to jump, "Edit" to reorder (drag the
// grip) or delete, and buttons to add pages.
export function Thumbnails({ notebookId, pages, currentIndex, onSelect, onClose, onAddFiles, onAddBlank }) {
  const listRef = useRef(null);
  const [editing, setEditing] = useState(false);
  const [drag, setDrag] = useState(null); // { from, to, dy, shift }
  const dragInfo = useRef(null);

  useEffect(() => {
    listRef.current?.querySelector('.thumb.current')?.scrollIntoView({ block: 'center' });
  }, []);

  // --- Drag to reorder ------------------------------------------------------
  // Positions are measured in the list's own coordinates (including how far
  // it is scrolled) so the list can scroll while you drag.
  const listY = (clientY) => {
    const list = listRef.current;
    return clientY - list.getBoundingClientRect().top + list.scrollTop;
  };

  const startDrag = (e, index) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    const list = listRef.current;
    const top = list.getBoundingClientRect().top;
    const slots = [...list.querySelectorAll('.thumb-item')].map((el) => {
      const r = el.getBoundingClientRect();
      return { top: r.top - top + list.scrollTop, height: r.height };
    });
    const gap = slots.length > 1 ? slots[1].top - slots[0].top - slots[0].height : 0;
    dragInfo.current = { from: index, slots, startY: listY(e.clientY) };
    setDrag({ from: index, to: index, dy: 0, shift: slots[index].height + gap });
  };

  const moveDrag = (e) => {
    const info = dragInfo.current;
    if (!info) return;
    const list = listRef.current;
    const box = list.getBoundingClientRect();
    if (e.clientY < box.top + 48) list.scrollTop -= 14;
    else if (e.clientY > box.bottom - 48) list.scrollTop += 14;
    const dy = listY(e.clientY) - info.startY;
    const dragged = info.slots[info.from];
    const center = dragged.top + dragged.height / 2 + dy;
    let to = 0;
    info.slots.forEach((slot, i) => {
      if (i !== info.from && slot.top + slot.height / 2 < center) to++;
    });
    info.to = to; // the ref is up to date right away; React state may lag a frame
    setDrag((d) => ({ ...d, to, dy }));
  };

  const endDrag = () => {
    const info = dragInfo.current;
    dragInfo.current = null;
    setDrag(null);
    if (info && info.to !== undefined && info.to !== info.from) movePage(notebookId, info.from, info.to);
  };

  const itemStyle = (i) => {
    if (!drag) return undefined;
    if (i === drag.from) return { transform: `translateY(${drag.dy}px)`, zIndex: 2 };
    if (drag.from < drag.to && i > drag.from && i <= drag.to) return { transform: `translateY(${-drag.shift}px)` };
    if (drag.from > drag.to && i >= drag.to && i < drag.from) return { transform: `translateY(${drag.shift}px)` };
    return undefined;
  };

  const remove = async (page, index) => {
    const ok = await askConfirm({
      title: `Delete page ${index + 1}?`,
      message: 'The page and your notes on it will be removed from this notebook.',
      confirmLabel: 'Delete',
      danger: true,
    });
    if (ok) removePages(notebookId, [page.id]);
  };

  return (
    <aside className="thumbs-panel">
      <div className="panel-header">
        <strong>Pages</strong>
        <button className={`button small ${editing ? 'primary' : ''}`} onClick={() => setEditing(!editing)}>
          {editing ? 'Done' : 'Edit'}
        </button>
        <button className="icon-button" onClick={onClose} aria-label="Close pages">
          <CloseIcon />
        </button>
      </div>

      <div className={`thumbs-list ${drag ? 'dragging' : ''}`} ref={listRef}>
        {pages.map((page, i) => (
          <ThumbItem
            key={page.id}
            page={page}
            index={i}
            current={i === currentIndex}
            editing={editing}
            listRef={listRef}
            style={itemStyle(i)}
            dragging={drag?.from === i}
            onSelect={() => onSelect(i)}
            onDelete={() => remove(page, i)}
            grip={{
              onPointerDown: (e) => startDrag(e, i),
              onPointerMove: moveDrag,
              onPointerUp: endDrag,
              onPointerCancel: endDrag,
            }}
          />
        ))}
      </div>

      <div className="panel-footer">
        <button className="button small" onClick={onAddFiles}>
          <ImportIcon size={16} /> Add pages
        </button>
        <button className="button small" onClick={onAddBlank}>
          <PageIcon size={16} /> Blank page
        </button>
      </div>
    </aside>
  );
}

function ThumbItem({ page, index, current, editing, listRef, style, dragging, onSelect, onDelete, grip }) {
  const ref = useRef(null);
  const [near, setNear] = useState(false);

  // Only show (and make) thumbnails near the visible part of the list.
  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => setNear(entry.isIntersecting), {
      root: listRef.current,
      rootMargin: '600px 0px',
    });
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, [listRef]);

  const url = useThumbnailUrl(near ? page : null);

  return (
    <div ref={ref} className={`thumb-item ${dragging ? 'is-dragged' : ''}`} style={style}>
      <button
        className={`thumb ${current ? 'current' : ''}`}
        style={{ aspectRatio: `1 / ${pageAspect(page)}` }}
        onClick={onSelect}
        aria-label={`Go to page ${index + 1}`}
      >
        {url && <img src={url} alt="" draggable={false} />}
      </button>
      <div className="thumb-label">
        {editing && (
          <button className="icon-button small" onClick={onDelete} aria-label={`Delete page ${index + 1}`}>
            <TrashIcon size={16} />
          </button>
        )}
        <span>{index + 1}</span>
        {editing && (
          <button className="icon-button small grip" aria-label="Drag to reorder" {...grip}>
            <GripIcon size={18} />
          </button>
        )}
      </div>
    </div>
  );
}
