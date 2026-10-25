// Edición del texto existente en cualquier PDF (digital o escaneado) y traducción conservando el diseño.
import { h, icon, toast, modal, busy } from './ui.js';
import { renderPage } from './lib/pdfview.js';
import { replaceLines } from './lib/ops.js';
import { ocrLayout } from './lib/ocr.js';
import { transformLines } from './lib/ai.js';
import { LANGUAGES } from './lib/text.js';

const FONT_CSS = { sans: '"DejaVu Sans", sans-serif', serif: 'Times New Roman, serif', mono: 'Courier New, monospace' };

/**
 * Líneas de texto de una página con su posición en puntos PDF.
 * PDF digital: a partir del contenido de texto. Escaneado: OCR con cajas.
 */
export async function getPageLines(pdf, pageNum, { ocrLangs = 'spa+eng', onProgress = () => {}, forceOcr = false } = {}) {
  const page = await pdf.getPage(pageNum);
  const scale = 2;
  const canvas = document.createElement('canvas');
  const { viewport } = await renderPageInto(pdf, pageNum, canvas, scale);
  const tc = await page.getTextContent();
  const chars = tc.items.reduce((a, it) => a + (it.str?.trim().length || 0), 0);
  let lines;
  let scanned = false;
  if (chars > 20 && !forceOcr) lines = groupItems(tc.items, page, tc.styles);
  else {
    scanned = true;
    const lay = await ocrLayout(canvas, ocrLangs, onProgress);
    lines = lay.lines.map(l => {
      const [x0, yTop] = viewport.convertToPdfPoint(l.bbox.x0, l.bbox.y0);
      const [x1, yBot] = viewport.convertToPdfPoint(l.bbox.x1, l.bbox.y1);
      const hPdf = Math.abs(yTop - yBot);
      // Tesseract da la línea base: es la mejor referencia para colocar el texto nuevo
      const baseY = l.baseline && l.baseline.y0 > 0 ? viewport.convertToPdfPoint(l.baseline.x0, (l.baseline.y0 + l.baseline.y1) / 2)[1] : Math.min(yTop, yBot) + hPdf * 0.22;
      return { text: l.text, x0: Math.min(x0, x1), x1: Math.max(x0, x1), base: baseY, size: Math.max(5, hPdf / 1.25), top: Math.max(yTop, yBot), bottom: Math.min(yTop, yBot), bold: false, family: 'sans' };
    });
  }
  for (const l of lines) Object.assign(l, sampleColors(canvas, viewport, l));
  return { lines, scanned, viewport, canvas, scale };
}

async function renderPageInto(pdf, n, canvas, scale) {
  const page = await pdf.getPage(n);
  const viewport = page.getViewport({ scale });
  canvas.width = Math.floor(viewport.width); canvas.height = Math.floor(viewport.height);
  const g = canvas.getContext('2d', { willReadFrequently: true });
  g.fillStyle = '#fff'; g.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvasContext: g, viewport }).promise;
  return { viewport };
}

/** Agrupa los fragmentos de pdf.js en líneas visuales. */
function groupItems(items, page, styles) {
  const frags = [];
  for (const it of items) {
    if (!it.str || !it.str.trim()) continue;
    const [a, b, c, d, e, f] = it.transform;
    if (Math.abs(b) > 0.01 || Math.abs(c) > 0.01) continue; // texto girado: no editable
    const size = Math.hypot(c, d) || it.height || 10;
    let fontName = '';
    try { fontName = page.commonObjs.has(it.fontName) ? (page.commonObjs.get(it.fontName)?.name || '') : ''; } catch { /* sin nombre */ }
    const fam = styles?.[it.fontName]?.fontFamily || '';
    frags.push({ str: it.str, x: e, y: f, w: it.width, size, bold: /bold|black|heavy|semibold/i.test(fontName), family: /mono|courier/i.test(fam + fontName) ? 'mono' : /serif|times|georgia|garamond|roman|cambria/i.test(fam + fontName) && !/sans/i.test(fam + fontName) ? 'serif' : 'sans' });
  }
  frags.sort((p, q) => (Math.abs(q.y - p.y) > Math.min(p.size, q.size) * 0.35 ? q.y - p.y : p.x - q.x));
  const lines = [];
  for (const fr of frags) {
    const L = lines[lines.length - 1];
    if (L && Math.abs(L.base - fr.y) < Math.min(L.size, fr.size) * 0.35 && fr.x - L.x1 < L.size * 1.8 && fr.x - L.x1 > -L.size * 2) {
      const gap = fr.x - L.x1;
      L.text += (gap > L.size * 0.15 && !L.text.endsWith(' ') && !fr.str.startsWith(' ') ? ' ' : '') + fr.str;
      L.x1 = Math.max(L.x1, fr.x + fr.w); L.size = Math.max(L.size, fr.size); L.bold = L.bold && fr.bold;
    } else lines.push({ text: fr.str, x0: fr.x, x1: fr.x + fr.w, base: fr.y, size: fr.size, bold: fr.bold, family: fr.family });
  }
  for (const l of lines) { l.text = l.text.replace(/\s+/g, ' ').trim(); l.top = l.base + l.size * 0.9; l.bottom = l.base - l.size * 0.25; }
  return lines.filter(l => l.text);
}

const toHex = (r, g, b) => '#' + [r, g, b].map(v => Math.round(v).toString(16).padStart(2, '0')).join('');

/** Color del fondo (bordes de la caja) y de la tinta (píxeles más distintos al fondo). */
function sampleColors(canvas, viewport, l) {
  const [x0, y0, x1, y1] = viewport.convertToViewportRectangle([l.x0, l.bottom, l.x1, l.top]);
  const X = Math.max(0, Math.floor(Math.min(x0, x1)) - 2), Y = Math.max(0, Math.floor(Math.min(y0, y1)) - 2);
  const W = Math.min(canvas.width - X, Math.ceil(Math.abs(x1 - x0)) + 4), H = Math.min(canvas.height - Y, Math.ceil(Math.abs(y1 - y0)) + 4);
  if (W < 2 || H < 2) return { color: '#111111', bg: '#ffffff' };
  const d = canvas.getContext('2d', { willReadFrequently: true }).getImageData(X, Y, W, H).data;
  const border = [];
  for (let x = 0; x < W; x++) for (const y of [0, H - 1]) border.push(((y * W) + x) * 4);
  for (let y = 0; y < H; y++) for (const x of [0, W - 1]) border.push(((y * W) + x) * 4);
  const med = (k) => { const v = border.map(i => d[i + k]).sort((a, b) => a - b); return v[v.length >> 1]; };
  const bg = [med(0), med(1), med(2)];
  const px = [];
  for (let i = 0; i < d.length; i += 4) px.push([d[i], d[i + 1], d[i + 2], Math.abs(d[i] - bg[0]) + Math.abs(d[i + 1] - bg[1]) + Math.abs(d[i + 2] - bg[2])]);
  px.sort((a, b) => b[3] - a[3]);
  const top = px.slice(0, Math.max(1, Math.floor(px.length * 0.08)));
  const fg = top[0][3] < 60 ? [17, 17, 17] : [0, 1, 2].map(k => top.reduce((s, p) => s + p[k], 0) / top.length);
  return { color: toHex(...fg), bg: toHex(...bg) };
}

/** Ediciones para ops.replaceLines a partir de líneas y sus textos nuevos. */
export function buildEdits(lines, fit = true) {
  return lines.filter(l => l.newText !== undefined && l.newText !== l.text).map(l => ({
    // margen extra: en escaneos los trazos (acentos, descendentes, desenfoque) sobresalen de la caja
    cover: { x: l.x0 - 2 - l.size * 0.05, y: l.bottom - l.size * 0.15, w: l.x1 - l.x0 + 4 + l.size * 0.1, h: l.top - l.bottom + l.size * 0.3 }, bg: l.bg,
    text: l.newText, x: l.x0, y: l.base, size: l.newSize || l.size, color: l.newColor || l.color, bold: l.newBold ?? l.bold, family: l.family,
    fit, maxW: Math.max(l.x1 - l.x0, (l.size || 10) * 3),
  }));
}

/** Pantalla "Editar texto": toca una línea para cambiarla. */
export function createTextEditor(app) {
  const d = app.doc;
  const st = { page: d.textEditPage || 1, data: null, sel: -1 };
  const base = h('canvas', { class: 'ed-base' });
  const over = h('canvas', { class: 'ed-over te-over', 'aria-label': 'Líneas de texto' });
  const stage = h('div', { class: 'ed-stage' }, base, over);
  const pageLbl = h('span', { class: 'mono' });
  const info = h('p', { class: 'hint center' });
  const changed = () => st.data?.lines.filter(l => l.newText !== undefined && l.newText !== l.text).length || 0;
  const applyBtn = h('button', { class: 'btn sm primary', onclick: () => apply() }, icon('check', 18), 'Aplicar');

  async function load(forceOcr = false) {
    st.page = Math.max(1, Math.min(st.page, d.pdf.numPages));
    pageLbl.textContent = `${st.page} / ${d.pdf.numPages}`;
    const b = busy('Detectando texto…');
    try {
      st.data = await getPageLines(d.pdf, st.page, { ocrLangs: app.settings.ocrLangs, forceOcr, onProgress: (f) => b.set(`Leyendo la página escaneada… ${Math.round(f * 100)}%`, f) });
      const width = Math.min(stage.parentElement?.clientWidth || innerWidth, 900) - 4;
      const p = await d.pdf.getPage(st.page);
      const scale = width / p.getViewport({ scale: 1 }).width;
      const { viewport } = await renderPage(d.pdf, st.page, base, scale);
      st.vp = viewport;
      const ratio = Math.min(devicePixelRatio || 1, 2);
      over.width = base.width; over.height = base.height; over.style.aspectRatio = base.style.aspectRatio;
      over.getContext('2d').setTransform(ratio, 0, 0, ratio, 0, 0);
      info.textContent = st.data.lines.length
        ? `${st.data.lines.length} líneas ${st.data.scanned ? 'reconocidas (página escaneada)' : 'detectadas'}. Toca una para editarla.`
        : 'No se encontró texto en esta página.';
      draw();
    } catch (e) { toast(e.message, 'err'); } finally { b.done(); }
  }

  const rectOf = (l) => {
    const [x0, y0, x1, y1] = st.vp.convertToViewportRectangle([l.x0, l.bottom, l.x1, l.top]);
    return { x: Math.min(x0, x1), y: Math.min(y0, y1), w: Math.abs(x1 - x0), h: Math.abs(y1 - y0) };
  };

  function draw() {
    const g = over.getContext('2d');
    g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, over.width, over.height); g.restore();
    if (!st.data) return;
    const k = st.vp.scale;
    st.data.lines.forEach((l, i) => {
      const r = rectOf(l);
      const edited = l.newText !== undefined && l.newText !== l.text;
      if (edited) {
        const pad = l.size * k * 0.15;
        g.fillStyle = l.bg; g.fillRect(r.x - 2 - pad / 3, r.y - pad, r.w + 4 + pad * 0.66, r.h + pad * 2);
        const size = (l.newSize || l.size) * k;
        g.font = `${(l.newBold ?? l.bold) ? 'bold ' : ''}${size}px ${FONT_CSS[l.family] || FONT_CSS.sans}`;
        g.fillStyle = l.newColor || l.color; g.textBaseline = 'alphabetic';
        const [bx, by] = st.vp.convertToViewportPoint(l.x0, l.base);
        let text = l.newText.replace(/\s*\n\s*/g, ' ');
        const maxW = Math.max(r.w, l.size * 3 * k);
        const tw = g.measureText(text).width;
        if (tw > maxW) g.font = `${(l.newBold ?? l.bold) ? 'bold ' : ''}${size * maxW / tw}px ${FONT_CSS[l.family] || FONT_CSS.sans}`;
        g.fillText(text, bx, by);
      }
      g.strokeStyle = i === st.sel ? '#e5533d' : edited ? 'rgba(31,138,76,.8)' : 'rgba(47,91,211,.45)';
      g.lineWidth = i === st.sel ? 2 : 1; g.setLineDash(edited || i === st.sel ? [] : [4, 3]);
      g.strokeRect(r.x - 2, r.y - 2, r.w + 4, r.h + 4);
    });
    applyBtn.disabled = !changed();
    applyBtn.lastChild.textContent = changed() ? `Aplicar (${changed()})` : 'Aplicar';
  }

  over.addEventListener('click', async (e) => {
    if (!st.data) return;
    const r = over.getBoundingClientRect();
    const x = (e.clientX - r.left) * st.vp.width / r.width, y = (e.clientY - r.top) * st.vp.height / r.height;
    let best = -1, bd = Infinity;
    st.data.lines.forEach((l, i) => {
      const b = rectOf(l);
      const dx = Math.max(b.x - x, 0, x - b.x - b.w), dy = Math.max(b.y - y, 0, y - b.y - b.h);
      const dd = Math.hypot(dx, dy);
      if (dd < bd) { bd = dd; best = i; }
    });
    if (best < 0 || bd > 14) return;
    st.sel = best; draw();
    await editLine(st.data.lines[best]);
    st.sel = -1; draw();
  });

  async function editLine(l) {
    const ta = h('textarea', { rows: 3 }); ta.value = l.newText ?? l.text;
    const size = h('input', { type: 'range', min: 4, max: Math.max(40, Math.ceil(l.size * 2)), step: 0.5, value: l.newSize || l.size });
    const sizeOut = h('span', { class: 'mono small' }, (+size.value).toFixed(1) + ' pt');
    size.oninput = () => { sizeOut.textContent = (+size.value).toFixed(1) + ' pt'; };
    const color = h('input', { type: 'color', value: l.newColor || l.color });
    const bold = h('input', { type: 'checkbox' }); bold.checked = l.newBold ?? l.bold;
    const v = await modal('Editar línea', h('div', { class: 'stack' },
      h('p', { class: 'small muted' }, 'Original: ', h('i', {}, l.text)), ta,
      h('div', { class: 'row' }, h('span', { class: 'small' }, 'Tamaño'), size, sizeOut),
      h('div', { class: 'row' }, h('label', { class: 'row small' }, bold, ' Negrita'), h('span', { class: 'grow' }), h('span', { class: 'small' }, 'Color'), h('span', { style: { width: '64px' } }, color))),
    [{ label: 'Borrar línea', value: 'del', danger: true }, { label: 'Restaurar', value: 'reset' }, { label: 'Listo', value: 'ok', primary: true }]);
    if (v === 'ok') Object.assign(l, { newText: ta.value, newSize: +size.value, newColor: color.value, newBold: bold.checked });
    if (v === 'del') Object.assign(l, { newText: '' });
    if (v === 'reset') { delete l.newText; delete l.newSize; delete l.newColor; delete l.newBold; }
  }

  async function apply() {
    const edits = buildEdits(st.data.lines);
    if (!edits.length) return;
    const b = busy('Guardando cambios…');
    try {
      const bytes = await replaceLines(d.bytes, st.page - 1, edits);
      d.textEditPage = st.page;
      b.done();
      await app.apply(bytes, `Texto editado en la página ${st.page}`);
    } catch (e) { b.done(); toast(e.message, 'err'); }
  }

  async function translatePage() {
    if (!app.settings.ai?.key) return app.go('settings');
    const lang = await pickLanguage();
    if (!lang) return;
    const b = busy(`Traduciendo la página al ${lang[1].toLowerCase()}…`, { cancellable: true });
    try {
      const out = await transformLines(app.settings.ai, st.data.lines.map(l => l.text), `Traduce cada línea al ${lang[1].toLowerCase()}.`, b.signal);
      st.data.lines.forEach((l, i) => { l.newText = out[i]; });
      draw();
      toast('Revisa la traducción y pulsa Aplicar');
    } catch (e) { toast(e.message, 'err'); } finally { b.done(); }
  }

  const go = async (dlt) => {
    if (changed() && !(await modal('Cambios sin aplicar', h('p', {}, '¿Descartar los cambios de esta página?'), [{ label: 'Cancelar', value: false }, { label: 'Descartar', value: true, danger: true }]))) return;
    st.page += dlt; st.sel = -1; load();
  };

  const el = h('div', { class: 'editor' },
    h('div', { class: 'ed-nav' },
      h('button', { class: 'icon-btn', 'aria-label': 'Página anterior', onclick: () => go(-1) }, icon('back')),
      pageLbl,
      h('button', { class: 'icon-btn flip', 'aria-label': 'Página siguiente', onclick: () => go(1) }, icon('back')),
      h('span', { class: 'grow' }),
      applyBtn),
    h('div', { class: 'row wrap' },
      h('button', { class: 'btn sm', onclick: translatePage }, icon('translate', 16), 'Traducir página'),
      h('button', { class: 'btn sm', onclick: () => load(true) }, icon('search', 16), 'Leer con OCR'),
      h('button', { class: 'btn sm ghost', onclick: () => { st.data?.lines.forEach(l => { delete l.newText; }); draw(); } }, 'Deshacer todo')),
    info, stage,
    h('p', { class: 'hint center' }, 'El texto nuevo se escribe en el mismo lugar, con un tamaño y color parecidos, sobre el original tapado con el color del fondo.'));
  setTimeout(() => load(), 0);
  return el;
}

export async function pickLanguage(def = 'en') {
  let v = def;
  const sel = h('select', { onchange: () => { v = sel.value; } }, LANGUAGES.map(([c, n]) => h('option', { value: c, selected: c === def || undefined }, n)));
  const ok = await modal('Idioma de destino', sel, [{ label: 'Cancelar', value: false }, { label: 'Traducir', value: true, primary: true }]);
  return ok ? LANGUAGES.find(l => l[0] === v) : null;
}

/** Traduce el documento completo conservando el diseño: crea una copia nueva. */
export async function translateDocumentLayout(app, lang, pagesIdx) {
  const d = app.doc;
  let bytes = d.bytes;
  const b = busy('Preparando…', { cancellable: true });
  try {
    for (let k = 0; k < pagesIdx.length; k++) {
      const n = pagesIdx[k] + 1;
      if (b.signal.aborted) throw new Error('Cancelado');
      b.set(`Página ${n}: leyendo texto…`, k / pagesIdx.length);
      const data = await getPageLines(d.pdf, n, { ocrLangs: app.settings.ocrLangs, onProgress: (f) => b.set(`Página ${n}: OCR ${Math.round(f * 100)}%`) });
      if (!data.lines.length) continue;
      b.set(`Página ${n}: traduciendo ${data.lines.length} líneas…`);
      const out = await transformLines(app.settings.ai, data.lines.map(l => l.text), `Traduce cada línea al ${lang[1].toLowerCase()}.`, b.signal);
      data.lines.forEach((l, i) => { l.newText = out[i]; });
      bytes = await replaceLines(bytes, n - 1, buildEdits(data.lines));
    }
    b.done();
    await app.saveNew(bytes, `${d.name.replace(/\.pdf$/i, '')} (${lang[1]}).pdf`);
    toast('Traducción creada como documento nuevo');
  } catch (e) { b.done(); if (e.message !== 'Cancelado') toast(e.message, 'err'); }
}
