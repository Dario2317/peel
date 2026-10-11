import { memo } from 'react';
import { PageImage } from './PageImage.jsx';
import { PdfPageCanvas } from './PdfPageCanvas.jsx';
import { PageOverlay } from '../overlay/PageOverlay.jsx';

// One page in the stack: the page picture (cut to the page), and on top the
// overlay (ink, tape, post-its), which may go past the page's edges, so
// what you write in the margin isn't cut off.
export const PageView = memo(function PageView({ page, rect, view, overlay }) {
  const onScreen = view && rect.y < view.bottom && rect.y + rect.h > view.top;
  return (
    <div
      className="page"
      data-page-id={page.id}
      style={{ left: rect.x, top: rect.y, width: rect.w, height: rect.h }}
    >
      <div className="page-content">
        {page.kind === 'image' && <PageImage page={page} />}
        {page.kind === 'pdf' && (
          <PdfPageCanvas page={page} rect={rect} view={view} priority={onScreen ? 1 : 2} />
        )}
      </div>
      {overlay && <PageOverlay page={page} pageHeight={rect.h} scale={view?.scale} overlay={overlay} />}
    </div>
  );
});
