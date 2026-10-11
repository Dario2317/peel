import { memo } from 'react';
import { PageImage } from './PageImage.jsx';
import { PdfPageCanvas } from './PdfPageCanvas.jsx';

// One page in the stack. Later milestones add the annotation overlay
// (ink, post-its, tape, text) on top of the page picture.
export const PageView = memo(function PageView({ page, rect, view }) {
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
    </div>
  );
});
