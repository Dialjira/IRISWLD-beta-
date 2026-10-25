// PDF → Word (.docx): texto editable por páginas; las páginas sin texto se insertan como imagen.
import { Document, Packer, Paragraph, TextRun, HeadingLevel, ImageRun, PageBreak } from 'docx';

const isHeading = (p) => p.length < 90 && !/[.,;:]$/.test(p) && (/^[A-ZÁÉÍÓÚÑ0-9 .\-–:]{4,}$/.test(p) || /^(cap[ií]tulo|secci[oó]n|art[ií]culo|anexo|\d+(\.\d+)*\s)/i.test(p));

/** pages: [{text, image?: {bytes, width, height}}] */
export async function pagesToDocx(pages, { title = '' } = {}) {
  const children = [];
  if (title) children.push(new Paragraph({ text: title, heading: HeadingLevel.TITLE }));
  pages.forEach((pg, i) => {
    if (i > 0) children.push(new Paragraph({ children: [new PageBreak()] }));
    if (pg.text?.trim()) {
      for (const block of pg.text.split(/\n{2,}/)) {
        const lines = block.split('\n').map(s => s.trim()).filter(Boolean);
        if (!lines.length) continue;
        // Las líneas de viñetas se mantienen separadas; el resto se une como un párrafo
        if (lines.every(l => /^([-•*–]|\d+[.)])\s/.test(l))) {
          for (const l of lines) children.push(new Paragraph({ text: l.replace(/^([-•*–])\s*/, ''), bullet: /^[-•*–]/.test(l) ? { level: 0 } : undefined }));
          continue;
        }
        const para = lines.join(' ').replace(/(\p{L})- (\p{Ll})/gu, '$1$2');
        if (isHeading(para)) children.push(new Paragraph({ text: para, heading: HeadingLevel.HEADING_2 }));
        else children.push(new Paragraph({ children: [new TextRun(para)], spacing: { after: 160 } }));
      }
    } else if (pg.image) {
      const w = 600, hgt = Math.round(600 * pg.image.height / pg.image.width);
      children.push(new Paragraph({ children: [new ImageRun({ type: 'jpg', data: pg.image.bytes, transformation: { width: w, height: hgt } })] }));
    }
  });
  const doc = new Document({
    creator: 'AICraft PDF', title,
    styles: { default: { document: { run: { font: 'Calibri', size: 22 } } } },
    sections: [{ children }],
  });
  return new Uint8Array(await (await Packer.toBlob(doc)).arrayBuffer());
}
