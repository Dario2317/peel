import { useEffect, useState } from 'react';

// "Stored on this device · 120 MB · protected ✓" at the bottom of the library.
export function StorageInfo() {
  const [info, setInfo] = useState(null);

  useEffect(() => {
    const load = async () => {
      if (!navigator.storage?.estimate) return;
      const { usage } = await navigator.storage.estimate();
      const persisted = (await navigator.storage.persisted?.()) ?? false;
      setInfo({ usage, persisted });
    };
    load();
    const timer = setInterval(load, 10_000);
    return () => clearInterval(timer);
  }, []);

  if (!info) return null;
  const mb = info.usage / (1024 * 1024);
  return (
    <p className="storage-info muted small">
      Everything is stored only on this device · {mb < 10 ? mb.toFixed(1) : Math.round(mb)} MB used ·{' '}
      {info.persisted
        ? 'protected from automatic clearing ✓'
        : 'not protected yet: the browser could clear it if space runs low, so keep backups'}
    </p>
  );
}
