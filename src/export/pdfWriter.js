// A very small PDF writer: one JPEG picture per page, plus clickable links.
// That's all the PDF export needs, so no big library: pdf-lib would load the
// whole book into memory (300 MB PDFs crash the iPad).
//
// The file is built from pieces (text and the JPEG Blobs) and only joined
// into one Blob at the end, so the pictures never have to be copied.
//
//   const pdf = createPdfWriter({ title: 'Biology' });
//   pdf.addPage({ width, height, image: { blob, width, height }, links });
//   const blob = pdf.finish();
//
// Sizes and positions are in points (1/72 inch), measured from the TOP-LEFT
// corner (the writer flips them: PDF measures from the bottom-left).
// A link is { rect: { x, y, w, h }, page: index, top } (a page of this PDF,
// scrolled to `top`) or { rect, url }.

const encoder = new TextEncoder();

export function createPdfWriter({ title = '' } = {}) {
  const parts = []; // strings (as bytes) and Blobs, in file order
  let size = 0; // bytes written so far
  const offsets = []; // object number -> byte offset where it starts
  let nextNumber = 4; // 1 = catalog, 2 = page list, 3 = document info
  const pageNumbers = []; // page index -> object number (reserved before the page is written)
  const pageHeights = []; // page index -> height in points
  let pageCount = 0;

  const write = (part) => {
    if (typeof part === 'string') {
      const bytes = encoder.encode(part);
      parts.push(bytes);
      size += bytes.length;
    } else {
      parts.push(part);
      size += part.size ?? part.byteLength;
    }
  };
  const newObject = () => nextNumber++;
  const startObject = (n) => {
    offsets[n] = size;
    write(`${n} 0 obj\n`);
  };
  // Links can point to pages that come later: their object number is
  // reserved the first time it's needed.
  const pageRef = (index) => {
    if (pageNumbers[index] == null) pageNumbers[index] = newObject();
    return pageNumbers[index];
  };

  write('%PDF-1.4\n');
  // A comment with 4 bytes above 127 tells programs the file is binary.
  write(new Uint8Array([0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a]));

  function addPage({ width, height, image, links = [] }) {
    const index = pageCount++;
    const pageNumber = pageRef(index);
    pageHeights[index] = height;
    const imageNumber = newObject();
    const contentNumber = newObject();
    const linkNumbers = links.map(() => newObject());

    startObject(imageNumber);
    write(
      `<< /Type /XObject /Subtype /Image /Width ${image.width} /Height ${image.height}` +
        ` /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${image.blob.size} >>\nstream\n`,
    );
    write(image.blob);
    write('\nendstream\nendobj\n');

    const content = `q ${num(width)} 0 0 ${num(height)} 0 0 cm /Im0 Do Q\n`;
    startObject(contentNumber);
    write(`<< /Length ${encoder.encode(content).length} >>\nstream\n${content}endstream\nendobj\n`);

    links.forEach((link, i) => {
      const { x, y, w, h } = link.rect;
      const rect = [x, height - y - h, x + w, height - y].map(num).join(' ');
      let action;
      if (link.url != null) action = `/A << /S /URI /URI ${pdfString(asciiUrl(link.url))} >>`;
      else action = `/Dest [${pageRef(link.page)} 0 R /XYZ null ${link.top == null ? 'null' : `{TOP${link.page}:${num(link.top)}}`} null]`;
      startObject(linkNumbers[i]);
      // The top of the target is measured from its bottom, and its height may
      // not be known yet: it's filled in at the end (see finish()).
      write(`<< /Type /Annot /Subtype /Link /Rect [${rect}] /Border [0 0 0] ${action} >>\nendobj\n`);
    });

    startObject(pageNumber);
    write(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${num(width)} ${num(height)}]` +
        ` /Resources << /XObject << /Im0 ${imageNumber} 0 R >> >> /Contents ${contentNumber} 0 R` +
        (linkNumbers.length ? ` /Annots [${linkNumbers.map((n) => `${n} 0 R`).join(' ')}]` : '') +
        ' >>\nendobj\n',
    );
    return index;
  }

  function finish() {
    if (pageCount === 0) throw new Error('A PDF needs at least one page');
    if (pageNumbers.length > pageCount) throw new Error('A link points to a page that was never added');

    startObject(1);
    write('<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');
    startObject(2);
    const kids = pageNumbers.map((n) => `${n} 0 R`).join(' ');
    write(`<< /Type /Pages /Kids [${kids}] /Count ${pageCount} >>\nendobj\n`);
    startObject(3);
    write(`<< /Title ${utf16Hex(title)} /Producer (Peel) /CreationDate ${pdfString(pdfDate(new Date()))} >>\nendobj\n`);

    const xrefAt = size;
    const count = nextNumber;
    let xref = `xref\n0 ${count}\n0000000000 65535 f \n`;
    for (let n = 1; n < count; n++) {
      if (offsets[n] == null) throw new Error(`PDF object ${n} was never written`);
      xref += `${String(offsets[n]).padStart(10, '0')} 00000 n \n`;
    }
    write(xref);
    write(`trailer\n<< /Size ${count} /Root 1 0 R /Info 3 0 R >>\nstartxref\n${xrefAt}\n%%EOF\n`);

    return fillTops(parts, pageHeights);
  }

  return { addPage, finish, get pageCount() { return pageCount; } };
}

// Link targets were written as {TOPn:y} (y from the top of page n), because
// that page might not exist yet. Now every height is known. The placeholder
// and the number are padded to the same length, so no byte offset moves.
function fillTops(parts, pageHeights) {
  const decoder = new TextDecoder();
  const out = parts.map((part) => {
    if (!(part instanceof Uint8Array)) return part;
    const text = decoder.decode(part);
    if (!text.includes('{TOP')) return part;
    const filled = text.replace(/\{TOP(\d+):([\d.]+)\}/g, (match, page, top) => {
      const fromBottom = num(Math.max(0, pageHeights[Number(page)] - Number(top)));
      if (fromBottom.length > match.length) throw new Error('Link target out of range');
      return fromBottom.padEnd(match.length, ' ');
    });
    return encoder.encode(filled);
  });
  return new Blob(out, { type: 'application/pdf' });
}

// Numbers: at most 2 decimals, no exponent (PDF doesn't understand 1e-7).
export function num(value) {
  const rounded = Math.round(value * 100) / 100;
  return Object.is(rounded, -0) ? '0' : String(rounded);
}

// A PDF text string in ( ), with the special characters escaped.
export function pdfString(text) {
  return `(${text.replace(/[\\()]/g, (c) => `\\${c}`).replace(/\r/g, '\\r').replace(/\n/g, '\\n')})`;
}

// Any text (accents, emoji…) as UTF-16 with a byte order mark, in hex.
export function utf16Hex(text) {
  let hex = 'FEFF';
  for (let i = 0; i < text.length; i++) hex += text.charCodeAt(i).toString(16).padStart(4, '0').toUpperCase();
  return `<${hex}>`;
}

// URLs in a PDF must be plain ASCII.
function asciiUrl(url) {
  return url.replace(/[^\x21-\x7e]/g, (c) => encodeURIComponent(c));
}

function pdfDate(date) {
  const p = (n) => String(n).padStart(2, '0');
  return `D:${date.getUTCFullYear()}${p(date.getUTCMonth() + 1)}${p(date.getUTCDate())}${p(date.getUTCHours())}${p(date.getUTCMinutes())}${p(date.getUTCSeconds())}Z`;
}
