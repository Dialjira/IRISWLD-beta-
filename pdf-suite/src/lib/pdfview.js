// Lectura y renderizado con pdf.js
import * as pdfjs from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
const BASE = import.meta.env.BASE_URL;

export async function openPdf(bytes, password) {
  // pdf.js transfiere el buffer al worker: se le pasa una copia para no vaciar el original
  const task = pdfjs.getDocument({
    data: bytes.slice(0), password,
    cMapUrl: BASE + 'pdfjs/cmaps/', cMapPacked: true,
    standardFontDataUrl: BASE + 'pdfjs/standard_fonts/',
    isEvalSupported: false,
  });
  return task.promise;
}

export async function renderPage(pdf, pageNumber, canvas, scale = 1.5) {
  const page = await pdf.getPage(pageNumber);
  const viewport = page.getViewport({ scale });
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.floor(viewport.width * ratio);
  canvas.height = Math.floor(viewport.height * ratio);
  canvas.style.aspectRatio = `${viewport.width} / ${viewport.height}`;
  const ctx = canvas.getContext('2d');
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  await page.render({ canvasContext: ctx, viewport }).promise;
  return { page, viewport, ratio };
}

/** Texto de una página, reconstruyendo saltos de línea a partir de las posiciones. */
export async function pageText(pdf, pageNumber) {
  const page = await pdf.getPage(pageNumber);
  const tc = await page.getTextContent();
  let out = '', lastY = null;
  for (const it of tc.items) {
    if (!('str' in it)) continue;
    const y = it.transform[5];
    if (lastY !== null && Math.abs(y - lastY) > 2) out += Math.abs(y - lastY) > (it.height || 10) * 1.8 ? '\n\n' : '\n';
    else if (out && !out.endsWith(' ') && it.str && !it.str.startsWith(' ')) out += it.hasEOL ? '\n' : '';
    out += it.str;
    if (it.hasEOL) { out += '\n'; lastY = null; continue; }
    lastY = y;
  }
  // une palabras cortadas con guion al final de línea
  return out.replace(/(\p{L})-\n(\p{Ll})/gu, '$1$2').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

export async function allText(pdf, onProgress = () => {}) {
  const pages = [];
  for (let i = 1; i <= pdf.numPages; i++) { pages.push(await pageText(pdf, i)); onProgress(i, pdf.numPages); }
  return pages;
}

/** Renderiza una página a imagen (Blob). */
export async function pageToBlob(pdf, pageNumber, { scale = 2, type = 'image/jpeg', quality = 0.85 } = {}) {
  const canvas = document.createElement('canvas');
  const page = await pdf.getPage(pageNumber);
  const viewport = page.getViewport({ scale });
  canvas.width = Math.floor(viewport.width); canvas.height = Math.floor(viewport.height);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvasContext: ctx, viewport }).promise;
  const blob = await new Promise(r => canvas.toBlob(r, type, quality));
  return { blob, width: canvas.width, height: canvas.height, canvas };
}

export { pdfjs };
