// Makes test-fixtures/sample.pdf: a 12-page "book" with text, one landscape
// page and one rotated page, to test PDF import and rendering during
// development (npm run dev serves it at /test-fixtures/sample.pdf).
import fs from 'node:fs';

const objects = [];
const add = (body) => {
  objects.push(body);
  return objects.length; // object number
};

const font = add('<< /Type /Font /Subtype /Type1 /BaseFont /Times-Roman >>');
const bold = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>');
const pagesId = objects.length + 1 + 12 * 2; // filled in after the pages
const pageIds = [];

const words = 'cell membrane protein enzyme glucose energy mitochondria nucleus ribosome gene chromosome photosynthesis'.split(' ');
for (let n = 1; n <= 12; n++) {
  const landscape = n === 5;
  const [w, h] = landscape ? [842, 595] : [595, 842];
  let text = `BT /F2 28 Tf 60 ${h - 90} Td (Chapter ${n}: Page ${n}) Tj ET\n`;
  for (let line = 0; line < (landscape ? 20 : 34); line++) {
    const sentence = Array.from({ length: 9 }, (_, i) => words[(n * 7 + line * 3 + i) % words.length]).join(' ');
    text += `BT /F1 13 Tf 60 ${h - 140 - line * 19} Td (${line + 1}. The ${sentence}.) Tj ET\n`;
  }
  text += `0.85 0.35 0.26 RG 4 w 60 ${h - 104} m ${w - 60} ${h - 104} l S\n`;
  const content = add(`<< /Length ${text.length} >>\nstream\n${text}endstream`);
  const rotate = n === 9 ? ' /Rotate 90' : '';
  pageIds.push(add(
    `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${w} ${h}]${rotate} ` +
    `/Resources << /Font << /F1 ${font} 0 R /F2 ${bold} 0 R >> >> /Contents ${content} 0 R >>`,
  ));
}
add(`<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pageIds.length} >>`);
const catalog = add(`<< /Type /Catalog /Pages ${pagesId} 0 R >>`);

let pdf = '%PDF-1.4\n';
const offsets = [];
objects.forEach((body, i) => {
  offsets.push(pdf.length);
  pdf += `${i + 1} 0 obj\n${body}\nendobj\n`;
});
const xref = pdf.length;
pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
for (const offset of offsets) pdf += `${String(offset).padStart(10, '0')} 00000 n \n`;
pdf += `trailer\n<< /Size ${objects.length + 1} /Root ${catalog} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;

fs.mkdirSync('test-fixtures', { recursive: true });
fs.writeFileSync('test-fixtures/sample.pdf', pdf, 'latin1');
console.log('wrote test-fixtures/sample.pdf');
