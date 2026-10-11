// Small page previews, used for notebook covers and the page strip.
// They are made once, saved in the database, and rebuilt when a page's crop
// changes (setCrop deletes the old one).
import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db.js';
import { FULL_CROP } from '../utils/geometry.js';
import { canvasToBlob, freeCanvas, loadImage } from '../import/images.js';
import { renderPdfRegion } from '../import/pdf.js';
import { queueRender } from './renderQueue.js';
import { pageAspect } from './layout.js';

const THUMB_WIDTH = 320;
const pending = new Map(); // pageId -> promise, so we never make one twice

function ensureThumbnail(page) {
  if (!pending.has(page.id)) {
    const promise = queueRender(5, () => makeThumbnail(page))
      .then((blob) => db.thumbnails.put({ pageId: page.id, blob }))
      .catch((error) => console.warn('Thumbnail failed', error))
      .finally(() => pending.delete(page.id));
    pending.set(page.id, promise);
  }
  return pending.get(page.id);
}

async function makeThumbnail(page) {
  const width = THUMB_WIDTH;
  const height = Math.round(width * pageAspect(page));
  const canvas = document.createElement('canvas');
  try {
    if (page.kind === 'pdf') {
      await renderPdfRegion({ page, region: FULL_CROP, canvas, pixelWidth: width, pixelHeight: height });
    } else {
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, width, height);
      if (page.kind === 'image') {
        const source = await db.sourceFiles.get(page.sourceFileId);
        const { img, release } = await loadImage(source.displayBlob ?? source.blob);
        const iw = img.naturalWidth;
        const ih = img.naturalHeight;
        const { crop } = page;
        ctx.drawImage(img, crop.x * iw, crop.y * ih, crop.w * iw, crop.h * ih, 0, 0, width, height);
        release();
      }
    }
    return await canvasToBlob(canvas, 'image/jpeg', 0.82);
  } finally {
    freeCanvas(canvas);
  }
}

// React hook: an image URL for the page's thumbnail (null while it's being
// made). Pass enabled=false to not make it yet (e.g. while scrolled away).
export function useThumbnailUrl(page, enabled = true) {
  const pageId = page?.id;
  const row = useLiveQuery(
    async () => (pageId ? (await db.thumbnails.get(pageId)) ?? null : undefined),
    [pageId],
  );
  const [url, setUrl] = useState(null);

  useEffect(() => {
    if (!row?.blob) {
      setUrl(null);
      return;
    }
    const objectUrl = URL.createObjectURL(row.blob);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [row]);

  useEffect(() => {
    if (enabled && page && row === null) ensureThumbnail(page);
  }, [enabled, page, row]);

  return url;
}
