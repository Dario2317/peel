// Helpers for image files (screenshots, photos).

// iPad Safari can't decode or draw images bigger than about 16.7 megapixels.
// For bigger photos we keep the original untouched and also store a smaller
// copy for showing on screen.
const MAX_DISPLAY_PIXELS = 16_000_000;
const DISPLAY_LONG_SIDE = 4096;

// Loads a Blob into an <img> element and waits until it's decoded.
// Remember to call release() when done, to free memory.
export async function loadImage(blob) {
  const url = URL.createObjectURL(blob);
  const img = new Image();
  img.src = url;
  try {
    await img.decode();
  } catch (error) {
    URL.revokeObjectURL(url);
    throw new Error('This image could not be read');
  }
  const release = () => {
    img.src = '';
    URL.revokeObjectURL(url);
  };
  return { img, release };
}

// Returns { width, height, displayBlob } for an image file.
export async function prepareImage(file) {
  const { img, release } = await loadImage(file);
  try {
    const width = img.naturalWidth;
    const height = img.naturalHeight;
    let displayBlob = null;
    if (width * height > MAX_DISPLAY_PIXELS) {
      const ratio = DISPLAY_LONG_SIDE / Math.max(width, height);
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      displayBlob = await canvasToBlob(canvas, 'image/jpeg', 0.9);
      freeCanvas(canvas);
    }
    return { width, height, displayBlob };
  } finally {
    release();
  }
}

export function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Could not save image'))), type, quality);
  });
}

// iOS keeps canvas memory around until the canvas is resized to nothing.
export function freeCanvas(canvas) {
  canvas.width = 0;
  canvas.height = 0;
}
