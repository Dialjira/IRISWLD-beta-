import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PDFDocument } from '@cantoo/pdf-lib';
import * as ops from '../src/lib/ops.js';

ops.setFontLoader(async (w) => readFileSync(`node_modules/dejavu-fonts-ttf/ttf/DejaVuSans${w === 'bold' ? '-Bold' : ''}.ttf`));

async function sample(n = 3) {
  const d = await PDFDocument.create();
  for (let i = 0; i < n; i++) d.addPage([300 + i, 400]);
  return d.save();
}
const widths = async (b) => (await PDFDocument.load(b)).getPages().map(p => Math.round(p.getWidth()));

test('merge, select, delete, reorder, duplicate', async () => {
  const a = await sample(3), b = await sample(2);
  assert.equal(await ops.pageCount(await ops.merge([a, b])), 5);
  assert.deepEqual(await widths(await ops.selectPages(a, [2, 0])), [302, 300]);
  assert.deepEqual(await widths(await ops.deletePages(a, [1])), [300, 302]);
  assert.deepEqual(await widths(await ops.reorder(a, [2, 1, 0])), [302, 301, 300]);
  assert.deepEqual(await widths(await ops.duplicatePages(a, [0])), [300, 300, 301, 302]);
  await assert.rejects(ops.deletePages(a, [0, 1, 2]));
});

test('rotate, insert blank, insert pdf, split', async () => {
  const a = await sample(2);
  const r = await PDFDocument.load(await ops.rotate(a, [1], 90));
  assert.equal(r.getPage(1).getRotation().angle, 90);
  const r2 = await PDFDocument.load(await ops.rotate(await ops.rotate(a, [0], -90), [0], -90));
  assert.equal(r2.getPage(0).getRotation().angle, 180);
  assert.equal(await ops.pageCount(await ops.insertBlank(a, 0)), 3);
  assert.deepEqual(await widths(await ops.insertPdf(a, await sample(1), -1)), [300, 300, 301]);
  const parts = await ops.split(a, [[0], [1]]);
  assert.equal(parts.length, 2);
});

test('textToPdf con acentos, cirílico y salto de página', async () => {
  const long = Array(200).fill('Línea con ñ, á, é, ü — «comillas» y € y Привет мир.').join('\n');
  const out = await ops.textToPdf(long, { title: 'Prueba', pageSize: 'Carta' });
  assert.ok(out);
  const d = await PDFDocument.load(out);
  assert.ok(d.getPageCount() > 3);
  assert.equal(Math.round(d.getPage(0).getWidth()), 612);
  assert.equal(d.getTitle(), 'Prueba');
});

test('textToPdf devuelve null si la fuente no cubre (chino)', async () => {
  assert.equal(await ops.textToPdf('你好世界'), null);
});

test('watermark, numeración, metadatos, optimizar', async () => {
  let a = await sample(2);
  a = await ops.watermark(a, { text: 'BORRADOR' });
  a = await ops.pageNumbers(a, {});
  a = await ops.setMetadata(a, { title: 'T', author: 'Yo', keywords: 'a, b' });
  const m = await ops.getMetadata(a);
  assert.equal(m.title, 'T'); assert.equal(m.author, 'Yo'); assert.equal(m.pages, 2);
  assert.ok((await ops.optimize(a)).length > 0);
});

test('anotaciones e imágenes', async () => {
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
  const a = await sample(1);
  const out = await ops.applyAnnotations(a, 0, [
    { type: 'text', x: 10, y: 300, text: 'Hola ñandú\nsegunda', size: 14, color: '#ff0000' },
    { type: 'rect', x: 10, y: 10, w: 50, h: 20, color: '#ffff00', opacity: 0.4 },
    { type: 'line', points: [[0, 0], [50, 50], [80, 20]], width: 3, color: '#0000ff' },
    { type: 'image', x: 100, y: 100, w: 40, h: 40, bytes: png, imgType: 'png' },
  ]);
  assert.ok(out.length > a.length);
  const imgs = await ops.imagesToPdf([{ bytes: png, type: 'png' }], { pageSize: 'A4' });
  assert.equal(await ops.pageCount(imgs), 1);
});

test('formularios: listar y rellenar', async () => {
  const d = await PDFDocument.create();
  const p = d.addPage([400, 400]);
  const form = d.getForm();
  form.createTextField('nombre').addToPage(p, { x: 10, y: 300, width: 200, height: 20 });
  form.createCheckBox('acepto').addToPage(p, { x: 10, y: 250, width: 15, height: 15 });
  const bytes = await d.save();
  const fields = await ops.listFormFields(bytes);
  assert.deepEqual(fields.map(f => f.kind), ['text', 'checkbox']);
  const filled = await ops.fillForm(bytes, { nombre: 'José Núñez', acepto: true });
  const f2 = await ops.listFormFields(filled);
  assert.equal(f2[0].value, 'José Núñez'); assert.equal(f2[1].value, true);
});

test('cifrar, detectar y descifrar', async () => {
  const a = await sample(2);
  const enc = await ops.encrypt(a, { userPassword: 'clave123' });
  assert.equal(await ops.isEncrypted(enc), true);
  assert.equal(await ops.isEncrypted(a), false);
  await assert.rejects(ops.decrypt(enc, 'mala'));
  const dec = await ops.decrypt(enc, 'clave123');
  assert.equal(await ops.isEncrypted(dec), false);
  assert.equal(await ops.pageCount(dec), 2);
});

test('scanToPdf con capa de texto y replaceLines', async () => {
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
  const out = await ops.scanToPdf([{ bytes: png, type: 'png', words: [{ text: 'Hola', bbox: { x0: 0, y0: 0, x1: 1, y1: 1 } }] }], { pageSize: 'A4' });
  assert.equal(await ops.pageCount(out), 1);
  const r = await ops.replaceLines(out, 0, [{ cover: { x: 10, y: 10, w: 100, h: 14 }, bg: '#ffffff', text: 'Texto nuevo con ñ', x: 10, y: 12, size: 12, fit: true, maxW: 40 }]);
  assert.ok(r.length > out.length);
  const r2 = await ops.replacePageWithImage(await sample(2), 1, Buffer.from('/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=', 'base64'));
  assert.equal(await ops.pageCount(r2), 2);
});
