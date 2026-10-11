// Coordinates of everything on a page are stored relative to the (cropped)
// page: x and w are fractions of the page width, y and h fractions of the
// page height. Stroke widths and font sizes are fractions of the page width.

export const FULL_CROP = { x: 0, y: 0, w: 1, h: 1 };

// When the crop of a page changes, the "page" becomes a different rectangle
// of the original image. This moves every annotation so it stays on top of
// the same content.
export function remapItemsForCrop(items, oldCrop, newCrop) {
  const mapX = (x) => (oldCrop.x + x * oldCrop.w - newCrop.x) / newCrop.w;
  const mapY = (y) => (oldCrop.y + y * oldCrop.h - newCrop.y) / newCrop.h;
  const scaleW = oldCrop.w / newCrop.w; // for widths and width-relative sizes
  const scaleH = oldCrop.h / newCrop.h;

  return items.map((item) => {
    const out = { ...item };
    if ('x' in item) out.x = mapX(item.x);
    if ('y' in item) out.y = mapY(item.y);
    if ('w' in item) out.w = item.w * scaleW;
    if ('h' in item) out.h = item.h * scaleH;
    if ('size' in item) out.size = item.size * scaleW;
    if ('openW' in item) out.openW = item.openW * scaleW;
    if ('openH' in item) out.openH = item.openH * scaleH;
    if (item.style && 'fontSize' in item.style) {
      out.style = { ...item.style, fontSize: item.style.fontSize * scaleW };
    }
    if (Array.isArray(item.points)) {
      // Ink points are stored flat: [x, y, pressure, x, y, pressure, …]
      out.points = item.points.map((value, i) =>
        i % 3 === 0 ? mapX(value) : i % 3 === 1 ? mapY(value) : value,
      );
    }
    return out;
  });
}

export function sameCrop(a, b) {
  return a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h;
}
