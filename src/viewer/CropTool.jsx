import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { db } from '../db/db.js';
import { setCrop } from '../db/pages.js';
import { FULL_CROP } from '../utils/geometry.js';
import { clamp } from '../utils/platform.js';
import { renderPdfRegion } from '../import/pdf.js';
import { freeCanvas } from '../import/images.js';

const MIN_SIZE = 0.05; // a crop can't be smaller than 5% of the page
const HANDLES = ['n', 's', 'e', 'w', 'nw', 'ne', 'sw', 'se'];
const round = (v) => Math.round(v * 10000) / 10000;

// Full-screen tool to cut status bars and app buttons off screenshots.
// Shows the whole original page with a box you can drag and resize.
export function CropTool({ page, pages, onClose }) {
  const areaRef = useRef(null);
  const [box, setBox] = useState(null); // on-screen size of the full page
  const [crop, setCropBox] = useState(page.crop);
  const drag = useRef(null);
  const sourceAspect = page.height / page.width;
  // Pages with exactly the same size, e.g. all screenshots from one device.
  const sameSize = pages.filter((p) => p.kind === page.kind && p.width === page.width && p.height === page.height);

  useLayoutEffect(() => {
    const area = areaRef.current;
    const fit = () => {
      const w = area.clientWidth - 48;
      const h = area.clientHeight - 48;
      const width = Math.max(50, Math.min(w, h / sourceAspect));
      setBox({ width, height: width * sourceAspect });
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(area);
    return () => observer.disconnect();
  }, [sourceAspect]);

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const startDrag = (mode) => (e) => {
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { mode, x: e.clientX, y: e.clientY, start: crop };
  };

  const moveDrag = (e) => {
    const d = drag.current;
    if (!d) return;
    const dx = (e.clientX - d.x) / box.width;
    const dy = (e.clientY - d.y) / box.height;
    const { x, y, w, h } = d.start;
    if (d.mode === 'move') {
      setCropBox({ x: clamp(x + dx, 0, 1 - w), y: clamp(y + dy, 0, 1 - h), w, h });
      return;
    }
    let left = x, top = y, right = x + w, bottom = y + h;
    if (d.mode.includes('w')) left = clamp(x + dx, 0, right - MIN_SIZE);
    if (d.mode.includes('e')) right = clamp(right + dx, left + MIN_SIZE, 1);
    if (d.mode.includes('n')) top = clamp(y + dy, 0, bottom - MIN_SIZE);
    if (d.mode.includes('s')) bottom = clamp(bottom + dy, top + MIN_SIZE, 1);
    setCropBox({ x: left, y: top, w: right - left, h: bottom - top });
  };

  const endDrag = () => {
    drag.current = null;
  };

  const apply = async (targetPages) => {
    const rounded = { x: round(crop.x), y: round(crop.y), w: round(crop.w), h: round(crop.h) };
    await setCrop(targetPages.map((p) => p.id), rounded);
    onClose();
  };

  const cropStyle = {
    left: `${crop.x * 100}%`,
    top: `${crop.y * 100}%`,
    width: `${crop.w * 100}%`,
    height: `${crop.h * 100}%`,
  };

  const dragProps = (mode) => ({
    onPointerDown: startDrag(mode),
    onPointerMove: moveDrag,
    onPointerUp: endDrag,
    onPointerCancel: endDrag,
  });

  return (
    <div className="crop-tool">
      <div className="crop-bar">
        <button className="button dark" onClick={onClose}>Cancel</button>
        <strong>Crop page</strong>
        <button className="button dark" onClick={() => setCropBox(FULL_CROP)}>Reset</button>
      </div>

      <div className="crop-area" ref={areaRef}>
        {box && (
          <div className="crop-stage" style={{ width: box.width, height: box.height }}>
            <div className="crop-clip">
              <FullPagePicture page={page} box={box} />
              <div className="crop-mask" style={cropStyle} />
            </div>
            <div className="crop-rect" style={cropStyle} {...dragProps('move')}>
              {HANDLES.map((h) => (
                <div key={h} className={`crop-handle ${h}`} {...dragProps(h)} />
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="crop-bar">
        <button className="button primary" onClick={() => apply([page])}>Apply to this page</button>
        {sameSize.length > 1 && (
          <button className="button primary" onClick={() => apply(sameSize)}>
            Apply to all {sameSize.length} pages of this size
          </button>
        )}
      </div>
    </div>
  );
}

// The whole, uncropped page.
function FullPagePicture({ page, box }) {
  const [url, setUrl] = useState(null);
  const canvasRef = useRef(null);

  useEffect(() => {
    if (page.kind !== 'image') return;
    let objectUrl = null;
    let alive = true;
    db.sourceFiles.get(page.sourceFileId).then((source) => {
      if (!alive) return;
      objectUrl = URL.createObjectURL(source.displayBlob ?? source.blob);
      setUrl(objectUrl);
    });
    return () => {
      alive = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [page.kind, page.sourceFileId]);

  useEffect(() => {
    if (page.kind !== 'pdf') return;
    const canvas = canvasRef.current;
    const controller = new AbortController();
    const dpr = window.devicePixelRatio || 1;
    renderPdfRegion({
      page: { ...page, crop: FULL_CROP },
      region: FULL_CROP,
      canvas,
      pixelWidth: Math.round(box.width * dpr),
      pixelHeight: Math.round(box.height * dpr),
      signal: controller.signal,
    }).catch(() => {});
    return () => controller.abort();
  }, [page.id, page.kind, box.width, box.height]);

  useEffect(() => {
    const canvas = canvasRef.current;
    return () => canvas && freeCanvas(canvas);
  }, []);

  if (page.kind === 'pdf') return <canvas ref={canvasRef} className="crop-picture" />;
  return url ? <img src={url} className="crop-picture" alt="" draggable={false} /> : null;
}
