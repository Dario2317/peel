import { describe, expect, it } from 'vitest';
import { createPdfWriter, num, pdfString, utf16Hex } from './pdfWriter.js';
import {
  EDGE_MARGIN, MAX_OVERHANG, exportBounds, firstBaseline, fitPointsPerUnit, noteHasContent, pageWidthPt,
  pdfFileName, pixelSize, wrapText,
} from './exportLayout.js';

// A fake JPEG: the writer copies the bytes without looking at them.
const fakeJpeg = (n) => ({ blob: new Blob([new Uint8Array(n).fill(0xab)]), width: 10, height: 20 });

async function bytesOf(blob) {
  return new Uint8Array(await blob.arrayBuffer());
}
const latin1 = (bytes) => Array.from(bytes, (b) => String.fromCharCode(b)).join('');

describe('pdfWriter', () => {
  it('writes a cross-reference table with the exact place of every object', async () => {
    const pdf = createPdfWriter({ title: 'Biologia è bella' });
    pdf.addPage({ width: 595, height: 842, image: fakeJpeg(1000), links: [{ rect: { x: 10, y: 10, w: 20, h: 20 }, page: 1, top: 100 }] });
    pdf.addPage({ width: 600, height: 400, image: fakeJpeg(37), links: [{ rect: { x: 0, y: 0, w: 50, h: 30 }, page: 0, top: 0 }, { rect: { x: 0, y: 0, w: 1, h: 1 }, url: 'https://example.com/a b' }] });
    const text = latin1(await bytesOf(pdf.finish()));

    expect(text.startsWith('%PDF-1.4\n')).toBe(true);
    expect(text.trimEnd().endsWith('%%EOF')).toBe(true);

    const startxref = Number(text.match(/startxref\n(\d+)\n%%EOF/)[1]);
    expect(text.slice(startxref, startxref + 4)).toBe('xref');
    const [, count] = text.slice(startxref).match(/xref\n0 (\d+)\n/);
    const entries = text.slice(startxref).split('\n').slice(3, 3 + Number(count) - 1);
    entries.forEach((line, i) => {
      const offset = Number(line.slice(0, 10));
      expect(text.slice(offset, offset + 20)).toMatch(new RegExp(`^${i + 1} 0 obj\\n`));
    });

    // Two pages, both listed.
    expect(text).toMatch(/\/Type \/Pages \/Kids \[\d+ 0 R \d+ 0 R\] \/Count 2/);
    // The link to page 2 (written before page 2 existed) got its height: 400 - 100.
    expect(text).toMatch(/\/XYZ null 300 +null/);
    expect(text).not.toContain('{TOP');
    // URL made plain ASCII.
    expect(text).toContain('(https://example.com/a%20b)');
    // The stream length matches the JPEG.
    expect(text).toContain('/Length 1000 >>');
  });

  it('refuses links to pages that never came', () => {
    const pdf = createPdfWriter();
    pdf.addPage({ width: 10, height: 10, image: fakeJpeg(1), links: [{ rect: { x: 0, y: 0, w: 1, h: 1 }, page: 5 }] });
    expect(() => pdf.finish()).toThrow();
  });

  it('formats numbers, strings and titles for PDF', () => {
    expect(num(1 / 3)).toBe('0.33');
    expect(num(-0.001)).toBe('0');
    expect(num(1e-9)).toBe('0');
    expect(pdfString('a(b)\\c')).toBe('(a\\(b\\)\\\\c)');
    expect(utf16Hex('Aè')).toBe('<FEFF004100E8>');
  });
});

// Every character is 10 wide.
const mono = (t) => t.length * 10;

describe('wrapText', () => {
  it('keeps line breaks and wraps at spaces', () => {
    expect(wrapText('one two three', 70, mono)).toEqual(['one two', 'three']);
    expect(wrapText('a\n\nb', 100, mono)).toEqual(['a', '', 'b']);
  });

  it('lets spaces at the end of a line hang past the edge', () => {
    expect(wrapText('abcd   efg', 40, mono)).toEqual(['abcd', 'efg']);
  });

  it('cuts words longer than the line', () => {
    expect(wrapText('abcdefghij', 40, mono)).toEqual(['abcd', 'efgh', 'ij']);
    expect(wrapText('hi abcdefghij', 40, mono)).toEqual(['hi', 'abcd', 'efgh', 'ij']);
  });

  it('puts the first baseline where CSS does', () => {
    // 26 tall line, letters 16 + 4: 3 above, so the baseline is 3 + 16 down.
    expect(firstBaseline(26, 16, 4)).toBe(19);
  });
});

describe('page bounds', () => {
  it('stays the page when everything is on it', () => {
    expect(exportBounds(1400, [{ left: 5, top: 5, right: 995, bottom: 1395 }])).toEqual({ left: 0, top: 0, right: 1000, bottom: 1400 });
  });

  it('grows only on the side where ink sticks out, with a margin', () => {
    expect(exportBounds(1400, [{ left: 900, top: 100, right: 1200, bottom: 200 }])).toEqual({
      left: 0, top: 0, right: 1200 + EDGE_MARGIN, bottom: 1400,
    });
    expect(exportBounds(1400, [{ left: -50, top: -10, right: 10, bottom: 10 }])).toEqual({
      left: -50 - EDGE_MARGIN, top: -10 - EDGE_MARGIN, right: 1000, bottom: 1400,
    });
  });

  it('never grows without limit', () => {
    const b = exportBounds(1000, [{ left: -99999, top: 0, right: 0, bottom: 99999 }]);
    expect(b.left).toBe(-MAX_OVERHANG);
    expect(b.bottom).toBe(1000 + MAX_OVERHANG);
  });

  it('PDF pages keep their size, others are A4 wide', () => {
    expect(pageWidthPt({ kind: 'pdf', width: 612, crop: { w: 0.5 } })).toBe(306);
    expect(pageWidthPt({ kind: 'image', width: 3000, crop: { w: 1 } })).toBe(595);
  });

  it('limits pictures to the pixel budget and pages to the PDF maximum', () => {
    expect(pixelSize(595, 842, 2)).toEqual({ width: 1190, height: 1684 });
    const big = pixelSize(2000, 3000, 3, 12_000_000);
    expect(big.width * big.height).toBeLessThanOrEqual(12_000_000 * 1.001);
    expect(fitPointsPerUnit(1, 30000, 100)).toBeCloseTo(14400 / 30000);
  });
});

describe('small helpers', () => {
  it('makes a safe file name', () => {
    expect(pdfFileName('Bio: cap. 3/4')).toBe('Bio cap. 3 4.pdf');
    expect(pdfFileName('  ')).toBe('Notebook.pdf');
  });

  it('knows when a note has something on its board', () => {
    expect(noteHasContent({ ink: [], text: '' })).toBe(false);
    expect(noteHasContent({ ink: [{}] })).toBe(true);
    expect(noteHasContent({ texts: [{ text: '  ' }] })).toBe(false);
    expect(noteHasContent({ texts: [{ text: 'hi' }] })).toBe(true);
    expect(noteHasContent({ title: 'old note' })).toBe(true);
  });
});
