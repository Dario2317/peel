import { useLayoutEffect, useRef } from 'react';
import { clamp } from '../utils/platform.js';

/**
 * A panel on top of everything, attached to something on a page (a post-it,
 * a tape). It is NOT inside the zoomed page, so its text is always a normal,
 * readable size, and it follows the item while you pan and zoom.
 *   anchor: { index, rect } — page index and rectangle (fractions of the page)
 *   placement: 'over' (covers the item) | 'below' (under it, or above if no
 *              room) | 'beside' (right of it, or left, or below if no room)
 */
export function Popover({ viewport, anchor, placement = 'below', className = '', style, children }) {
  const ref = useRef(null);
  const { index, rect } = anchor;

  useLayoutEffect(() => {
    const el = ref.current;
    const place = () => {
      const target = viewport.pageRectToClient(index, rect);
      if (!target) return;
      // The visible area shrinks when the on-screen keyboard is open.
      const vv = window.visualViewport;
      const viewTop = vv ? vv.offsetTop : 0;
      const viewBottom = vv ? vv.offsetTop + vv.height : window.innerHeight;
      const viewWidth = vv ? vv.width : window.innerWidth;
      const w = el.offsetWidth;
      const h = el.offsetHeight;
      const margin = 8;
      let left;
      let top;
      if (placement === 'over') {
        left = target.left - 6;
        top = target.top - 6;
      } else if (placement === 'beside') {
        top = target.top;
        left = target.left + target.width + 14;
        if (left + w > viewWidth - margin) left = target.left - w - 14;
        if (left < margin) {
          left = target.left;
          top = target.top + target.height + 12;
        }
      } else {
        left = target.left + target.width / 2 - w / 2;
        top = target.top + target.height + 12;
        if (top + h > viewBottom - margin) top = target.top - h - 12;
      }
      left = clamp(left, margin, Math.max(margin, viewWidth - w - margin));
      top = clamp(top, viewTop + margin, Math.max(viewTop + margin, viewBottom - h - margin));
      el.style.transform = `translate(${Math.round(left)}px, ${Math.round(top)}px)`;
    };
    place();
    const stopFollowing = viewport.addFrameListener(place);
    const observer = new ResizeObserver(place);
    observer.observe(el);
    window.visualViewport?.addEventListener('resize', place);
    window.visualViewport?.addEventListener('scroll', place);
    return () => {
      stopFollowing();
      observer.disconnect();
      window.visualViewport?.removeEventListener('resize', place);
      window.visualViewport?.removeEventListener('scroll', place);
    };
  }, [viewport, index, rect.x, rect.y, rect.w, rect.h, placement]);

  return (
    <div ref={ref} className={`popover ${className}`} style={style}>
      {children}
    </div>
  );
}
