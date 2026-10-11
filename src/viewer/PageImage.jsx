import { useEffect, useState } from 'react';
import { db } from '../db/db.js';

// A screenshot/photo page: a plain <img>. The crop is done by making the
// image bigger than the page box and shifting it, so the original file is
// never changed.
export function PageImage({ page }) {
  const [url, setUrl] = useState(null);

  useEffect(() => {
    let alive = true;
    let objectUrl = null;
    db.sourceFiles.get(page.sourceFileId).then((source) => {
      if (!alive || !source) return;
      objectUrl = URL.createObjectURL(source.displayBlob ?? source.blob);
      setUrl(objectUrl);
    });
    return () => {
      alive = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [page.sourceFileId]);

  if (!url) return null;
  const { crop } = page;
  return (
    <img
      className="page-image"
      src={url}
      alt=""
      draggable={false}
      decoding="async"
      onLoad={(e) => e.currentTarget.classList.add('loaded')}
      style={{
        width: `${100 / crop.w}%`,
        height: `${100 / crop.h}%`,
        left: `${(-crop.x / crop.w) * 100}%`,
        top: `${(-crop.y / crop.h) * 100}%`,
      }}
    />
  );
}
