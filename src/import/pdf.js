// Everything to do with PDF files, using Mozilla's pdf.js.
import { db } from '../db/db.js';
import { abortError } from '../viewer/renderQueue.js';

// pdf.js is large, so it is only downloaded the first time a PDF is opened
// (`import()` with parentheses loads a module on demand). We use its
// "legacy" build, which also runs on slightly older Safari versions.
let pdfjsPromise = null;
function loadPdfjs() {
  if (!pdfjsPromise) {
    pdfjsPromise = Promise.all([
      import('pdfjs-dist/legacy/build/pdf.min.mjs'),
      import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url'),
    ]).then(([pdfjs, worker]) => {
      pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
      return pdfjs;
    });
  }
  return pdfjsPromise;
}

// Extra files pdf.js needs (copied to public/pdfjs by vite.config.js).
function assetUrl(folder) {
  return new URL(`${import.meta.env.BASE_URL}pdfjs/${folder}/`, location.href).href;
}

// Opens a PDF stored as a Blob. Instead of loading the whole file into
// memory, pdf.js asks for the byte ranges it needs and we slice them from
// the Blob, so even a 300 MB book opens without using much memory.
export async function openPdf(blob) {
  const pdfjs = await loadPdfjs();
  class BlobRangeTransport extends pdfjs.PDFDataRangeTransport {
    requestDataRange(begin, end) {
      blob
        .slice(begin, end)
        .arrayBuffer()
        .then((buffer) => this.onDataRange(begin, new Uint8Array(buffer)));
    }
  }
  const task = pdfjs.getDocument({
    range: new BlobRangeTransport(blob.size, null),
    rangeChunkSize: 256 * 1024,
    disableAutoFetch: true,
    disableStream: true,
    cMapUrl: assetUrl('cmaps'),
    cMapPacked: true,
    standardFontDataUrl: assetUrl('standard_fonts'),
    wasmUrl: assetUrl('wasm'),
    iccUrl: assetUrl('iccs'),
    isEvalSupported: false,
    enableXfa: false,
  });
  return task.promise;
}

// Reads the size of every page (in PDF points) without rendering anything.
export async function readPdfPageSizes(blob, onProgress) {
  const doc = await openPdf(blob);
  try {
    const sizes = [];
    for (let n = 1; n <= doc.numPages; n++) {
      const page = await doc.getPage(n);
      const viewport = page.getViewport({ scale: 1 });
      sizes.push({ width: viewport.width, height: viewport.height });
      page.cleanup();
      onProgress?.(n, doc.numPages);
    }
    return sizes;
  } finally {
    doc.loadingTask.destroy(); // closes the document and frees its memory
  }
}

// Open documents, shared by all pages that come from the same file.
const openDocs = new Map(); // sourceFileId -> Promise<PDFDocumentProxy>

export function getPdfDocument(sourceFileId) {
  let promise = openDocs.get(sourceFileId);
  if (!promise) {
    promise = db.sourceFiles.get(sourceFileId).then((source) => {
      if (!source) throw new Error('PDF file is missing');
      return openPdf(source.blob);
    });
    promise.catch(() => openDocs.delete(sourceFileId));
    openDocs.set(sourceFileId, promise);
  }
  return promise;
}

// Called when you leave a notebook, to free memory.
export function closeAllPdfs() {
  for (const promise of openDocs.values()) {
    promise.then((doc) => doc.loadingTask.destroy()).catch(() => {});
  }
  openDocs.clear();
}

/**
 * Draws part of a PDF page into a canvas.
 *   crop:   the page's crop (fractions of the full PDF page)
 *   region: the part to draw, in fractions of the cropped page
 *   pixelWidth/pixelHeight: canvas size in pixels
 */
export async function renderPdfRegion({ page, region, canvas, pixelWidth, pixelHeight, signal }) {
  const doc = await getPdfDocument(page.sourceFileId);
  if (signal?.aborted) throw abortError();
  const pdfPage = await doc.getPage(page.pdfPageNumber);
  if (signal?.aborted) throw abortError();

  const { crop } = page;
  const base = pdfPage.getViewport({ scale: 1 });
  // The region in fractions of the whole PDF page:
  const fx = crop.x + region.x * crop.w;
  const fy = crop.y + region.y * crop.h;
  const fw = region.w * crop.w;
  const scale = pixelWidth / (fw * base.width);
  const viewport = pdfPage.getViewport({ scale });

  canvas.width = pixelWidth;
  canvas.height = pixelHeight;
  const task = pdfPage.render({
    canvas,
    viewport,
    // Shift the page so the region's top-left corner is at the canvas origin.
    transform: [1, 0, 0, 1, -fx * viewport.width, -fy * viewport.height],
    background: 'white',
  });
  const cancel = () => task.cancel();
  signal?.addEventListener('abort', cancel);
  try {
    await task.promise;
  } finally {
    signal?.removeEventListener('abort', cancel);
  }
}
