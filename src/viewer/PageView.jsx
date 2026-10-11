import { memo } from 'react';
import { PageImage } from './PageImage.jsx';
import { PdfPageCanvas } from './PdfPageCanvas.jsx';
import { PageOverlay } from '../overlay/PageOverlay.jsx';

// One page in the stack: the page picture, and the overlay (tape, post-its…)
// on top of it.
export const PageView = memo(function PageView({ page, rect, view, overlay }) {
  const onScreen = view && rect.y < view.bottom && rect.y + rect.h > view.top;
  return (
    <div
      className="page"
      data-page-id={page.id}
      style={{ left: rect.x, top: rect.y, width: rect.w, height: rect.h }}
    >
      {page.kind === 'image' && <PageImage page={page} />}
      {page.kind === 'pdf' && (
        <PdfPageCanvas page={page} rect={rect} view={view} priority={onScreen ? 1 : 2} />
      )}
      {overlay && <PageOverlay page={page} pageHeight={rect.h} scale={view?.scale} overlay={overlay} />}
    </div>
  );
});
