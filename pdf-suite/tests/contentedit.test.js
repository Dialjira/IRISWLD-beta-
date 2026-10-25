import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PDFDocument, StandardFonts } from '@cantoo/pdf-lib';
import { tokenize, stripText } from '../src/lib/contentedit.js';
import * as ops from '../src/lib/ops.js';

test('tokenize y stripText: borra un Tj dentro de la zona', () => {
  const src = 'q 1 0 0 1 10 0 cm BT /F1 12 Tf 1 0 0 1 50 700 Tm (Hola \\(mundo\\)) Tj ET BT /F1 12 Tf 50 650 Td <00410042> Tj ET Q';
  assert.equal(tokenize(src).filter(o => o.op === 'Tj').length, 2);
  const r = stripText(src, [{ x: 55, y: 695, w: 100, h: 15 }]);
  assert.equal(r.touched, 1);
  assert.ok(!r.content.includes('Hola'));
  assert.ok(r.content.includes('<00410042> Tj'));
});

test('stripText: si hay más texto en la línea lo vuelve invisible (modo 3)', () => {
  const src = 'BT 100 100 Td (A) Tj (B) Tj ET';
  const r = stripText(src, [{ x: 99, y: 99, w: 5, h: 5 }]);
  assert.ok(r.content.includes('3 Tr (A) Tj 0 Tr'));
});

test('stripText rechaza imágenes en línea', () => {
  assert.equal(stripText('BI /W 1 /H 1 ID x EI', []), null);
});

test('replaceLines elimina el texto original del contenido', async () => {
  const d = await PDFDocument.create();
  const font = await d.embedFont(StandardFonts.Helvetica);
  const p = d.addPage([400, 400]);
  p.drawText('Importe 1250', { x: 50, y: 300, size: 12, font });
  p.drawText('Otra linea', { x: 50, y: 200, size: 12, font });
  const bytes = await d.save({ useObjectStreams: false });
  const out = await ops.replaceLines(bytes, 0, [{ cover: { x: 49, y: 296, w: 80, h: 15 }, bg: '#ffffff', text: 'Importe 2500', x: 50, y: 300, size: 12 }]);
  const doc = await PDFDocument.load(out);
  const { decodePDFRawStream, PDFRawStream } = await import('@cantoo/pdf-lib');
  let all = '';
  for (const r of doc.getPage(0).node.Contents().asArray()) { const st = doc.context.lookup(r); all += Buffer.from(st instanceof PDFRawStream ? decodePDFRawStream(st).decode() : st.getContents()).toString('latin1'); }
  const hex = (t) => Buffer.from(t, 'latin1').toString('hex').toUpperCase();
  assert.ok(!all.includes(hex('Importe 1250')), 'el texto viejo sigue en el contenido');
  assert.ok(all.includes(hex('Otra linea')), 'se borró una línea que no tocaba');
});
