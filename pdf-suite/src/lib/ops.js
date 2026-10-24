// Operaciones sobre PDF con pdf-lib. Todas reciben y devuelven Uint8Array (no mutan la entrada).
import { PDFDocument, StandardFonts, rgb, degrees, LineCapStyle, PDFName, PDFTextField, PDFCheckBox, PDFDropdown, PDFRadioGroup } from '@cantoo/pdf-lib';
import fontkit from '@cantoo/fontkit';
import { wrapLines } from './text.js';
import { stripPageText } from './contentedit.js';

export const PAGE_SIZES = {
  A4: [595.28, 841.89],
  Carta: [612, 792],
  Oficio: [612, 936],
  Legal: [612, 1008],
  A5: [419.53, 595.28],
};

let fontLoader = null;
let fontCache = null;
let fontkitFace = null;
/** Registra cómo obtener los bytes de la fuente Unicode (DejaVuSans). */
export function setFontLoader(fn) { fontLoader = fn; fontCache = null; fontkitFace = null; }

async function unicodeFontBytes() {
  if (!fontLoader) return null;
  if (!fontCache) fontCache = { regular: await fontLoader('regular'), bold: await fontLoader('bold') };
  return fontCache;
}

/** ¿Puede la fuente Unicode embebida dibujar todo el texto? (si no, hay que rasterizar) */
export async function fontCovers(text) {
  const bytes = await unicodeFontBytes();
  if (!bytes) return /^[\x00-\xff–—‘’“”•…€]*$/.test(text);
  if (!fontkitFace) fontkitFace = fontkit.create(bytes.regular);
  for (const ch of text) {
    const cp = ch.codePointAt(0);
    if (cp < 32) continue;
    if (!fontkitFace.hasGlyphForCodePoint(cp)) return false;
  }
  return true;
}

async function embedFonts(doc) {
  const bytes = await unicodeFontBytes();
  if (bytes) {
    doc.registerFontkit(fontkit);
    return {
      regular: await doc.embedFont(bytes.regular, { subset: true }),
      bold: await doc.embedFont(bytes.bold, { subset: true }),
    };
  }
  return { regular: await doc.embedFont(StandardFonts.Helvetica), bold: await doc.embedFont(StandardFonts.HelveticaBold) };
}

function sanitizeFor(font, text) {
  // Sustituye caracteres que la fuente no puede codificar para que pdf-lib no falle
  let out = '';
  for (const ch of text) {
    try { font.encodeText(ch); out += ch; } catch { out += ch === '\t' ? '    ' : '?'; }
  }
  return out;
}

const load = (bytes, opts = {}) => PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false, ...opts });

export async function isEncrypted(bytes) {
  return (await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false })).isEncrypted;
}

/** Quita la contraseña (necesita la correcta). */
export async function decrypt(bytes, password) {
  const src = await PDFDocument.load(bytes, { password, updateMetadata: false });
  // La librería conserva el diccionario /Encrypt al guardar: se copian las páginas a un documento limpio
  const out = await PDFDocument.create();
  (await out.copyPages(src, src.getPageIndices())).forEach(p => out.addPage(p));
  copyInfo(src, out);
  return out.save();
}

/** Protege con contraseña (AES-256). Sin `ownerPassword` se usa la misma. */
export async function encrypt(bytes, { userPassword, ownerPassword, allowPrint = true, allowCopy = false, allowEdit = false }) {
  const doc = await load(bytes);
  doc.encrypt({
    userPassword, ownerPassword: ownerPassword || userPassword,
    permissions: { printing: allowPrint ? 'highResolution' : undefined, copying: allowCopy, modifying: allowEdit, annotating: allowEdit, fillingForms: true },
  });
  return doc.save();
}

export async function pageCount(bytes) { return (await load(bytes)).getPageCount(); }

export async function merge(list) {
  const out = await PDFDocument.create();
  for (const bytes of list) {
    const src = await load(bytes);
    const pages = await out.copyPages(src, src.getPageIndices());
    pages.forEach(p => out.addPage(p));
  }
  return out.save();
}

/** Crea un PDF nuevo solo con las páginas indicadas (0-based), en ese orden. */
export async function selectPages(bytes, indices) {
  if (!indices.length) throw new Error('No hay páginas seleccionadas');
  const src = await load(bytes);
  const out = await PDFDocument.create();
  const pages = await out.copyPages(src, indices);
  pages.forEach(p => out.addPage(p));
  copyInfo(src, out);
  return out.save();
}

export async function deletePages(bytes, indices) {
  const n = await pageCount(bytes);
  const keep = [...Array(n).keys()].filter(i => !indices.includes(i));
  if (!keep.length) throw new Error('No se pueden borrar todas las páginas');
  return selectPages(bytes, keep);
}

export async function reorder(bytes, order) { return selectPages(bytes, order); }

export async function duplicatePages(bytes, indices) {
  const n = await pageCount(bytes);
  const order = [];
  for (let i = 0; i < n; i++) { order.push(i); if (indices.includes(i)) order.push(i); }
  return selectPages(bytes, order);
}

/** Divide en un PDF por grupo. `groups` = array de arrays de índices. */
export async function split(bytes, groups) {
  const results = [];
  for (const g of groups) results.push(await selectPages(bytes, g));
  return results;
}

export async function rotate(bytes, indices, delta = 90) {
  const doc = await load(bytes);
  for (const i of indices) {
    const p = doc.getPage(i);
    p.setRotation(degrees(((p.getRotation().angle + delta) % 360 + 360) % 360));
  }
  return doc.save();
}

export async function insertBlank(bytes, afterIndex, size) {
  const doc = await load(bytes);
  const ref = doc.getPage(Math.max(0, Math.min(afterIndex, doc.getPageCount() - 1)));
  const [w, h] = size || [ref.getWidth(), ref.getHeight()];
  doc.insertPage(afterIndex + 1, [w, h]);
  return doc.save();
}

/** Inserta todas las páginas de `other` después de `afterIndex` (-1 = al principio). */
export async function insertPdf(bytes, other, afterIndex) {
  const doc = await load(bytes);
  const src = await load(other);
  const pages = await doc.copyPages(src, src.getPageIndices());
  pages.forEach((p, k) => doc.insertPage(afterIndex + 1 + k, p));
  return doc.save();
}

function copyInfo(src, out) {
  try {
    const t = src.getTitle(); if (t) out.setTitle(t);
    const a = src.getAuthor(); if (a) out.setAuthor(a);
  } catch { /* metadatos opcionales */ }
}

export async function getMetadata(bytes) {
  const doc = await load(bytes);
  return {
    title: doc.getTitle() || '', author: doc.getAuthor() || '', subject: doc.getSubject() || '',
    keywords: doc.getKeywords() || '', creator: doc.getCreator() || '', producer: doc.getProducer() || '',
    pages: doc.getPageCount(),
    created: doc.getCreationDate()?.toISOString() || '', modified: doc.getModificationDate()?.toISOString() || '',
  };
}

export async function setMetadata(bytes, meta) {
  const doc = await load(bytes);
  doc.setTitle(meta.title || '');
  doc.setAuthor(meta.author || '');
  doc.setSubject(meta.subject || '');
  doc.setKeywords((meta.keywords || '').split(',').map(s => s.trim()).filter(Boolean));
  doc.setProducer('ArtCraft PDF');
  doc.setModificationDate(new Date());
  return doc.save();
}

const hex = (c) => {
  const m = /^#?([0-9a-f]{6})$/i.exec(c || '#000000');
  const n = parseInt(m ? m[1] : '000000', 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
};

export async function watermark(bytes, { text, size = 60, color = '#c0392b', opacity = 0.18, angle = 45, pages } = {}) {
  const doc = await load(bytes);
  const fonts = await embedFonts(doc);
  const t = sanitizeFor(fonts.bold, text || 'CONFIDENCIAL');
  const idx = pages || doc.getPageIndices();
  for (const i of idx) {
    const p = doc.getPage(i);
    const { width, height } = p.getSize();
    const tw = fonts.bold.widthOfTextAtSize(t, size);
    const rad = angle * Math.PI / 180;
    p.drawText(t, {
      x: width / 2 - (tw / 2) * Math.cos(rad) + (size / 3) * Math.sin(rad),
      y: height / 2 - (tw / 2) * Math.sin(rad) - (size / 3) * Math.cos(rad),
      size, font: fonts.bold, color: hex(color), opacity, rotate: degrees(angle),
    });
  }
  return doc.save();
}

export async function pageNumbers(bytes, { format = 'Página {n} de {total}', size = 10, position = 'bottom-center', start = 1, margin = 24 } = {}) {
  const doc = await load(bytes);
  const fonts = await embedFonts(doc);
  const total = doc.getPageCount();
  doc.getPages().forEach((p, i) => {
    const label = sanitizeFor(fonts.regular, format.replace('{n}', String(i + start)).replace('{total}', String(total + start - 1)));
    const { width, height } = p.getSize();
    const tw = fonts.regular.widthOfTextAtSize(label, size);
    const [v, h] = position.split('-');
    const x = h === 'left' ? margin : h === 'right' ? width - margin - tw : (width - tw) / 2;
    const y = v === 'top' ? height - margin - size : margin;
    p.drawText(label, { x, y, size, font: fonts.regular, color: rgb(0.25, 0.25, 0.25) });
  });
  return doc.save();
}

/**
 * Crea un PDF desde texto. Títulos: líneas que empiezan con "# ".
 * Devuelve null si la fuente no cubre el texto (el llamador debe rasterizar).
 */
export async function textToPdf(text, { title = '', pageSize = 'A4', fontSize = 12, margin = 56, lineHeight = 1.45, align = 'left' } = {}) {
  const full = (title ? `# ${title}\n\n` : '') + (text || '');
  if (!(await fontCovers(full))) return null;
  const doc = await PDFDocument.create();
  const fonts = await embedFonts(doc);
  const [W, H] = PAGE_SIZES[pageSize] || PAGE_SIZES.A4;
  const maxW = W - margin * 2;
  let page = doc.addPage([W, H]);
  let y = H - margin;
  const newPage = () => { page = doc.addPage([W, H]); y = H - margin; };
  for (const rawPara of full.replace(/\r\n?/g, '\n').split('\n')) {
    const isH = /^#{1,3}\s/.test(rawPara);
    const level = isH ? rawPara.match(/^#+/)[0].length : 0;
    const para = isH ? rawPara.replace(/^#+\s*/, '') : rawPara;
    const font = isH ? fonts.bold : fonts.regular;
    const size = isH ? fontSize * (level === 1 ? 1.6 : level === 2 ? 1.3 : 1.12) : fontSize;
    const lh = size * lineHeight;
    const lines = wrapLines(sanitizeFor(font, para), maxW, s => font.widthOfTextAtSize(s, size));
    if (isH && y - lh * 2 < margin) newPage();
    for (const line of lines) {
      if (y - lh < margin - size * 0.3) newPage();
      y -= lh;
      if (line) {
        const tw = font.widthOfTextAtSize(line, size);
        const x = align === 'center' || isH && level === 1 ? margin + (maxW - tw) / 2 : align === 'right' ? margin + maxW - tw : margin;
        page.drawText(line, { x, y, size, font, color: rgb(0.1, 0.1, 0.12) });
      }
    }
    if (isH) y -= size * 0.4;
  }
  doc.setTitle(title || 'Documento');
  doc.setProducer('ArtCraft PDF');
  doc.setCreationDate(new Date());
  return doc.save();
}

/** Crea un PDF a partir de imágenes ({bytes, type:'png'|'jpg', width, height}). */
export async function imagesToPdf(images, { pageSize = 'fit', margin = 0 } = {}) {
  const doc = await PDFDocument.create();
  for (const im of images) {
    const img = im.type === 'png' ? await doc.embedPng(im.bytes) : await doc.embedJpg(im.bytes);
    let W, H;
    if (im.pageW && im.pageH) { W = im.pageW; H = im.pageH; }
    else if (pageSize === 'fit') { W = img.width * 0.75 + margin * 2; H = img.height * 0.75 + margin * 2; }
    else {
      [W, H] = PAGE_SIZES[pageSize] || PAGE_SIZES.A4;
      if (img.width > img.height && W < H) [W, H] = [H, W];
    }
    const page = doc.addPage([W, H]);
    const s = Math.min((W - margin * 2) / img.width, (H - margin * 2) / img.height);
    const w = img.width * s, h = img.height * s;
    page.drawImage(img, { x: (W - w) / 2, y: (H - h) / 2, width: w, height: h });
  }
  doc.setProducer('ArtCraft PDF');
  return doc.save();
}

/**
 * Aplica anotaciones (ya convertidas a coordenadas PDF) a una página.
 * Tipos: text {x,y,text,size,color}, rect {x,y,w,h,color,opacity,border}, line {points:[[x,y]...],width,color,opacity},
 * image {x,y,w,h,bytes,type}
 */
export async function applyAnnotations(bytes, pageIndex, items) {
  const doc = await load(bytes);
  const page = doc.getPage(pageIndex);
  const fonts = await embedFonts(doc);
  const rot = page.getRotation().angle;
  for (const it of items) {
    if (it.type === 'rect') {
      page.drawRectangle({ x: it.x, y: it.y, width: it.w, height: it.h, color: it.fill === false ? undefined : hex(it.color), opacity: it.opacity ?? 1,
        borderColor: it.border ? hex(it.color) : undefined, borderWidth: it.border ? (it.borderWidth || 2) : 0, borderOpacity: it.opacity ?? 1 });
    } else if (it.type === 'line') {
      // Un único trazo: con transparencia no se acumulan puntos más oscuros en las uniones
      const path = it.points.map(([x, y], k) => `${k ? 'L' : 'M'}${x.toFixed(2)} ${(-y).toFixed(2)}`).join(' ');
      page.drawSvgPath(path, { x: 0, y: 0, borderColor: hex(it.color), borderWidth: it.width || 2, borderOpacity: it.opacity ?? 1, borderLineCap: LineCapStyle.Round });
    } else if (it.type === 'text') {
      const font = it.bold ? fonts.bold : fonts.regular;
      const lines = String(it.text).split('\n');
      lines.forEach((ln, k) => {
        const off = k * it.size * 1.25;
        // desplaza cada línea "hacia abajo" en el sentido visual de la página rotada
        const dx = rot === 90 ? off : rot === 270 ? -off : 0;
        const dy = rot === 0 ? -off : rot === 180 ? off : 0;
        page.drawText(sanitizeFor(font, ln), { x: it.x + dx, y: it.y + dy, size: it.size, font, color: hex(it.color), rotate: degrees(rot) });
      });
    } else if (it.type === 'image') {
      const img = it.imgType === 'png' ? await doc.embedPng(it.bytes) : await doc.embedJpg(it.bytes);
      page.drawImage(img, { x: it.x, y: it.y, width: it.w, height: it.h, rotate: degrees(rot) });
    }
  }
  return doc.save();
}

/** Lista los campos de formulario rellenables. */
export async function listFormFields(bytes) {
  const doc = await load(bytes);
  let form;
  try { form = doc.getForm(); } catch { return []; }
  return form.getFields().map(f => {
    const base = { name: f.getName() };
    if (f instanceof PDFTextField) return { ...base, kind: 'text', value: f.getText() || '' };
    if (f instanceof PDFCheckBox) return { ...base, kind: 'checkbox', value: f.isChecked() };
    if (f instanceof PDFDropdown) return { ...base, kind: 'select', value: f.getSelected()[0] || '', options: f.getOptions() };
    if (f instanceof PDFRadioGroup) return { ...base, kind: 'radio', value: f.getSelected() || '', options: f.getOptions() };
    return { ...base, kind: 'other' };
  });
}

export async function fillForm(bytes, values, { flatten = false } = {}) {
  const doc = await load(bytes);
  const form = doc.getForm();
  const fonts = await embedFonts(doc);
  for (const [name, val] of Object.entries(values)) {
    const f = form.getFieldMaybe(name);
    if (!f) continue;
    if (f instanceof PDFTextField) f.setText(String(val ?? ''));
    else if (f instanceof PDFCheckBox) val ? f.check() : f.uncheck();
    else if (f instanceof PDFDropdown && val) f.select(val);
    else if (f instanceof PDFRadioGroup && val) f.select(val);
  }
  try { form.updateFieldAppearances(fonts.regular); } catch { /* apariencias por defecto */ }
  if (flatten) form.flatten();
  return doc.save();
}

/** Reescribe el archivo con flujos de objetos (reduce tamaño sin perder calidad). */
export async function optimize(bytes) {
  const doc = await load(bytes);
  return doc.save({ useObjectStreams: true });
}

/**
 * Dibuja texto invisible (seleccionable y buscable) sobre una página. words: [{text, x, y, w, h}] en puntos PDF
 * (x,y = esquina inferior izquierda de la palabra).
 */
function drawInvisibleWords(page, font, words) {
  for (const wd of words) {
    const t = sanitizeFor(font, wd.text);
    if (!t.trim() || wd.w <= 0 || wd.h <= 0) continue;
    const unit = font.widthOfTextAtSize(t, 1) || 1;
    const size = Math.max(1, Math.min(wd.w / unit, wd.h * 1.6));
    // el espacio final hace que al copiar las palabras no salgan pegadas
    page.drawText(t + ' ', { x: wd.x, y: wd.y + wd.h * 0.22, size, font, opacity: 0 });
  }
}

export async function addTextLayer(bytes, pages) {
  // pages: [{index, words}]
  const doc = await load(bytes);
  const fonts = await embedFonts(doc);
  for (const p of pages) drawInvisibleWords(doc.getPage(p.index), fonts.regular, p.words);
  return doc.save();
}

/**
 * PDF de escaneos: cada imagen ocupa su página y, si trae `words` (cajas en píxeles de la imagen),
 * se añade la capa de texto invisible para que el PDF sea buscable y copiable.
 */
export async function scanToPdf(images, { pageSize = 'fit', margin = 0, title = '' } = {}) {
  const doc = await PDFDocument.create();
  const fonts = images.some(i => i.words?.length) ? await embedFonts(doc) : null;
  for (const im of images) {
    const img = im.type === 'png' ? await doc.embedPng(im.bytes) : await doc.embedJpg(im.bytes);
    let W, H;
    if (pageSize === 'fit') { const k = 595.28 / Math.max(img.width, 1); W = 595.28; H = img.height * k; }
    else { [W, H] = PAGE_SIZES[pageSize] || PAGE_SIZES.A4; if (img.width > img.height && W < H) [W, H] = [H, W]; }
    const page = doc.addPage([W, H]);
    const s = Math.min((W - margin * 2) / img.width, (H - margin * 2) / img.height);
    const w = img.width * s, hgt = img.height * s, ox = (W - w) / 2, oy = (H - hgt) / 2;
    page.drawImage(img, { x: ox, y: oy, width: w, height: hgt });
    if (fonts && im.words?.length) {
      drawInvisibleWords(page, fonts.regular, im.words.map(wd => ({
        text: wd.text, x: ox + wd.bbox.x0 * s, y: oy + hgt - wd.bbox.y1 * s, w: (wd.bbox.x1 - wd.bbox.x0) * s, h: (wd.bbox.y1 - wd.bbox.y0) * s,
      })));
    }
  }
  if (title) doc.setTitle(title);
  doc.setProducer('ArtCraft PDF');
  doc.setCreationDate(new Date());
  return doc.save();
}

/**
 * Sustituye líneas de texto: tapa la original con el color de fondo y escribe la nueva en su sitio.
 * edits: [{cover:{x,y,w,h}, bg, text, x, y, size, color, bold, fit}]  (coordenadas PDF)
 */
export async function replaceLines(bytes, pageIndex, edits) {
  const doc = await load(bytes);
  const page = doc.getPage(pageIndex);
  const fonts = await embedFonts(doc);
  const rot = page.getRotation().angle;
  // Primero se borra el texto original bajo las zonas editadas (antes de dibujar nada en la página)
  try { stripPageText(doc, page, edits.filter(e => e.cover).map(e => e.cover)); } catch { /* si no se puede analizar, solo se tapa */ }
  const std = {};
  for (const e of edits) {
    if (e.cover) page.drawRectangle({ x: e.cover.x, y: e.cover.y, width: e.cover.w, height: e.cover.h, color: hex(e.bg || '#ffffff') });
    const text = String(e.text ?? '').replace(/\s*\n\s*/g, ' ');
    if (!text.trim()) continue;
    let font = e.bold ? fonts.bold : fonts.regular;
    if (e.family === 'serif' || e.family === 'mono') {
      // Fuente parecida a la original (Times/Courier) si el texto se puede escribir con ella
      const key = e.family + (e.bold ? 'B' : '');
      std[key] = std[key] || await doc.embedFont({ serif: StandardFonts.TimesRoman, serifB: StandardFonts.TimesRomanBold, mono: StandardFonts.Courier, monoB: StandardFonts.CourierBold }[key]);
      try { std[key].encodeText(text); font = std[key]; } catch { /* caracteres fuera de WinAnsi: se usa DejaVu */ }
    }
    const t = sanitizeFor(font, text);
    let size = e.size;
    if (e.fit && e.maxW) { const tw = font.widthOfTextAtSize(t, size); if (tw > e.maxW) size = Math.max(4, size * e.maxW / tw); }
    page.drawText(t, { x: e.x, y: e.y, size, font, color: hex(e.color || '#111111'), rotate: degrees(rot) });
  }
  return doc.save();
}

/** Reemplaza una página por una imagen (censura permanente: el contenido original desaparece). */
export async function replacePageWithImage(bytes, pageIndex, jpgBytes) {
  const doc = await load(bytes);
  const old = doc.getPage(pageIndex);
  const { width, height } = old.getSize();
  const img = await doc.embedJpg(jpgBytes);
  const page = doc.insertPage(pageIndex, [width, height]);
  page.drawImage(img, { x: 0, y: 0, width, height });
  doc.removePage(pageIndex + 1);
  return doc.save();
}

export const _internal = { hex, PDFName };
