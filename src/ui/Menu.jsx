import { useEffect, useRef, useState } from 'react';

// A button that opens a small list of actions below it.
//   <Menu label="More" icon={<MoreIcon/>} items={[{ label: 'Rename', onSelect }, …]} />
export function Menu({ label, icon, items, className = 'icon-button', align = 'right' }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const close = (e) => {
      if (!ref.current?.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('pointerdown', close);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', close);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="menu" ref={ref}>
      <button
        className={className}
        aria-label={label}
        title={label}
        aria-expanded={open}
        onClick={(e) => {
          e.stopPropagation();
          setOpen(!open);
        }}
      >
        {icon ?? label}
      </button>
      {open && (
        <div className={`menu-list ${align}`} role="menu">
          {items.filter(Boolean).map((item) => (
            <button
              key={item.label}
              role="menuitem"
              className={`menu-item ${item.danger ? 'danger' : ''}`}
              disabled={item.disabled}
              onClick={(e) => {
                e.stopPropagation();
                setOpen(false);
                item.onSelect();
              }}
            >
              {item.icon}
              <span>{item.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
