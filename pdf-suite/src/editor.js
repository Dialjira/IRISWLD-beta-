// Editor visual de una página: texto, lápiz, resaltador, tapar, recuadros, firma e imágenes.
import { h, icon, toast, ask, modal, pickFiles } from './ui.js';
import { renderPage, openPdf, pageToBlob } from './lib/pdfview.js';
import { applyAnnotations, replacePageWithImage } from './lib/ops.js';
import { getKV, setKV } from './lib/store.js';

const TOOLS = [
  ['move', 'Mover', 'move'], ['text', 'Texto', 'text'], ['pen', 'Lápiz', 'pen'], ['marker', 'Resaltar', 'marker'],
  ['whiteout', 'Tapar', 'eraser'], ['box', 'Recuadro', 'square'], ['sign', 'Firma', 'sign'], ['stamp', 'Sello', 'stamp'],
  ['image', 'Imagen', 'image'], ['redact', 'Censurar', 'redact'],
];
const COLORS = ['#111111', '#d62828', '#1d4ed8', '#15803d', '#f59e0b', '#7c3aed', '#ffffff'];
const FONT = '"DejaVu Sans", sans-serif';
const ASC = 0.93; // ascendente de DejaVu Sans: la línea base queda igual en pantalla y en el PDF

export function createEditor(ctx) {
  // ctx: { getPdf(), getBytes(), apply(newBytes, label), pageNum, onDirty(bool) }
  const st = { page: ctx.pageNum || 1, tool: 'text', color: '#d62828', size: 18, items: [], viewport: null, scale: 1.5, drag: null, pendingImage: null };
  const base = h('canvas', { class: 'ed-base' });
  const over = h('canvas', { class: 'ed-over', 'aria-label': 'Lienzo de edición' });
  const stage = h('div', { class: 'ed-stage' }, base, over);
  const pageLbl = h('span', { class: 'mono' });
  const sizeIn = h('input', { type: 'range', min: 6, max: 72, value: st.size, 'aria-label': 'Tamaño', oninput: () => { st.size = +sizeIn.value; sizeOut.textContent = st.size; } });
  const sizeOut = h('span', { class: 'mono small' }, st.size);
  const toolBar = h('div', { class: 'tools' });
  const colorBar = h('div', { class: 'colors' });

  const renderTools = () => toolBar.replaceChildren(...TOOLS.map(([id, label, ic]) =>
    h('button', { class: 'tool' + (st.tool === id ? ' on' : ''), 'aria-pressed': String(st.tool === id), onclick: () => selectTool(id) }, icon(ic, 20), h('span', {}, label))));
  const renderColors = () => colorBar.replaceChildren(...COLORS.map(c =>
    h('button', { class: 'swatch' + (st.color === c ? ' on' : ''), style: { background: c }, 'aria-label': 'Color ' + c, onclick: () => { st.color = c; renderColors(); } })),
    h('label', { class: 'swatch pick', title: 'Otro color' }, h('input', { type: 'color', value: st.color, oninput: (e) => { st.color = e.target.value; renderColors(); } })));

  async function selectTool(id) {
    st.tool = id; renderTools();
    if (id === 'sign') { const img = await signatureDialog(); if (img) { st.pendingImage = img; toast('Toca la página donde va la firma'); } else { st.tool = 'move'; renderTools(); } }
    if (id === 'image') { const img = await pickImage(); if (img) { st.pendingImage = img; toast('Toca la página donde va la imagen'); } else { st.tool = 'move'; renderTools(); } }
  }

  async function load() {
    const pdf = ctx.getPdf();
    st.page = Math.max(1, Math.min(st.page, pdf.numPages));
    pageLbl.textContent = `${st.page} / ${pdf.numPages}`;
    const width = Math.min(stage.parentElement?.clientWidth || window.innerWidth, 900) - 4;
    const p = await pdf.getPage(st.page);
    const vp1 = p.getViewport({ scale: 1 });
    st.scale = width / vp1.width;
    const { viewport } = await renderPage(pdf, st.page, base, st.scale);
    st.viewport = viewport;
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    over.width = base.width; over.height = base.height; over.style.aspectRatio = base.style.aspectRatio;
    over.getContext('2d').setTransform(ratio, 0, 0, ratio, 0, 0);
    draw();
  }

  function draw() {
    const c = over.getContext('2d');
    c.save(); c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, over.width, over.height); c.restore();
    for (const it of st.items) drawItem(c, it);
    if (st.drag?.preview) drawItem(c, st.drag.preview);
  }

  function drawItem(c, it) {
    c.save();
    if (it.type === 'text') {
      c.font = `${it.bold ? 'bold ' : ''}${it.size}px ${FONT}`; c.fillStyle = it.color; c.textBaseline = 'alphabetic';
      if (it.stamp) { const b = bounds(it); c.strokeStyle = it.color; c.lineWidth = Math.max(2, it.size / 8); c.strokeRect(b.x - it.size * 0.4, b.y - it.size * 0.25, b.w + it.size * 0.8, b.h + it.size * 0.3); }
      it.text.split('\n').forEach((ln, k) => c.fillText(ln, it.x, it.y + it.size * ASC + k * it.size * 1.25));
    } else if (it.type === 'rect') {
      c.globalAlpha = it.opacity ?? 1;
      if (it.fill !== false) { c.fillStyle = it.color; c.fillRect(it.x, it.y, it.w, it.h); }
      if (it.border) { c.strokeStyle = it.color; c.lineWidth = it.borderWidth || 2; c.strokeRect(it.x, it.y, it.w, it.h); }
      if (it.color === '#ffffff' && it.fill !== false) { c.globalAlpha = 1; c.setLineDash([4, 3]); c.strokeStyle = '#999'; c.lineWidth = 1; c.strokeRect(it.x, it.y, it.w, it.h); }
    } else if (it.type === 'line') {
      c.globalAlpha = it.opacity ?? 1; c.strokeStyle = it.color; c.lineWidth = it.width; c.lineCap = 'round'; c.lineJoin = 'round';
      c.beginPath(); it.points.forEach(([x, y], k) => k ? c.lineTo(x, y) : c.moveTo(x, y)); c.stroke();
    } else if (it.type === 'image') {
      c.drawImage(it.el, it.x, it.y, it.w, it.h);
    }
    c.restore();
  }

  function bounds(it) {
    if (it.type === 'text') {
      const c = over.getContext('2d'); c.font = `${it.bold ? 'bold ' : ''}${it.size}px ${FONT}`;
      const lines = it.text.split('\n');
      return { x: it.x, y: it.y, w: Math.max(...lines.map(l => c.measureText(l).width)), h: lines.length * it.size * 1.25 };
    }
    if (it.type === 'line') {
      const xs = it.points.map(p => p[0]), ys = it.points.map(p => p[1]);
      return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
    }
    return { x: it.x, y: it.y, w: it.w, h: it.h };
  }
  const hit = (x, y) => [...st.items].reverse().find(it => { const b = bounds(it); return x >= b.x - 8 && x <= b.x + b.w + 8 && y >= b.y - 8 && y <= b.y + b.h + 8; });

  const pos = (e) => { const r = over.getBoundingClientRect(); const k = st.viewport.width / r.width; return [(e.clientX - r.left) * k, (e.clientY - r.top) * k]; };
  const dirty = () => ctx.onDirty?.(st.items.length > 0);

  over.addEventListener('pointerdown', async (e) => {
    if (!st.viewport) return;
    const [x, y] = pos(e);
    if (st.tool === 'move') {
      const it = hit(x, y);
      if (it) { st.drag = { mode: 'move', it, ox: x, oy: y, orig: JSON.parse(JSON.stringify({ x: it.x, y: it.y, points: it.points })) }; over.setPointerCapture(e.pointerId); }
      return;
    }
    if (st.tool === 'text') {
      const existing = st.items.find(it => it.type === 'text' && hit(x, y) === it);
      const txt = await ask(existing ? 'Editar texto' : 'Añadir texto', { value: existing?.text || '', multiline: true, placeholder: 'Escribe aquí…' });
      if (txt === null) return;
      if (existing) { if (txt.trim()) existing.text = txt; else st.items.splice(st.items.indexOf(existing), 1); }
      else if (txt.trim()) st.items.push({ type: 'text', x, y: y - st.size / 2, text: txt, size: st.size, color: st.color });
      draw(); dirty(); return;
    }
    if (st.tool === 'stamp') {
      const text = await stampDialog();
      if (!text) return;
      const color = /RECHAZ|ANULAD|URGENTE|CONFIDENCIAL/.test(text) ? '#c62f2f' : /BORRADOR|COPIA/.test(text) ? '#555555' : '#1f8a4c';
      const item = { type: 'text', stamp: true, x, y: y - st.size, text, size: Math.max(14, st.size), color, bold: true };
      const b = bounds(item);
      // que el sello quede dentro de la página
      item.x = Math.max(item.size * 0.5, Math.min(item.x, st.viewport.width - b.w - item.size * 0.6));
      st.items.push(item);
      st.tool = 'move'; renderTools(); draw(); dirty(); return;
    }
    if ((st.tool === 'sign' || st.tool === 'image') && st.pendingImage) {
      const im = st.pendingImage;
      const w = Math.min(st.viewport.width * (st.tool === 'sign' ? 0.35 : 0.5), im.el.naturalWidth);
      const hgt = w * im.el.naturalHeight / im.el.naturalWidth;
      st.items.push({ type: 'image', x: x - w / 2, y: y - hgt / 2, w, h: hgt, el: im.el, bytes: im.bytes, imgType: im.type });
      st.pendingImage = null; st.tool = 'move'; renderTools(); draw(); dirty();
      toast('Arrástrala para moverla. Usa el control de tamaño para ajustarla.');
      return;
    }
    over.setPointerCapture(e.pointerId);
    if (st.tool === 'pen' || st.tool === 'marker') {
      const marker = st.tool === 'marker';
      st.drag = { mode: 'draw', preview: { type: 'line', points: [[x, y]], color: marker ? (st.color === '#111111' ? '#ffe600' : st.color) : st.color, width: marker ? st.size * 1.2 : Math.max(1, st.size / 6), opacity: marker ? 0.35 : 1 } };
    } else {
      st.drag = { mode: 'rect', x0: x, y0: y, preview: { type: 'rect', x, y, w: 0, h: 0, color: st.tool === 'whiteout' ? '#ffffff' : st.tool === 'redact' ? '#000000' : st.color, fill: st.tool === 'whiteout' || st.tool === 'redact', redact: st.tool === 'redact', border: st.tool === 'box', borderWidth: Math.max(1, st.size / 8), opacity: 1 } };
    }
  });
  over.addEventListener('pointermove', (e) => {
    if (!st.drag) return;
    const [x, y] = pos(e);
    const d = st.drag;
    if (d.mode === 'move') {
      const dx = x - d.ox, dy = y - d.oy;
      if (d.it.points) d.it.points = d.orig.points.map(([px, py]) => [px + dx, py + dy]);
      else { d.it.x = d.orig.x + dx; d.it.y = d.orig.y + dy; }
    } else if (d.mode === 'draw') d.preview.points.push([x, y]);
    else Object.assign(d.preview, { x: Math.min(d.x0, x), y: Math.min(d.y0, y), w: Math.abs(x - d.x0), h: Math.abs(y - d.y0) });
    draw();
  });
  const end = () => {
    const d = st.drag; st.drag = null;
    if (!d) return;
    if (d.mode === 'draw' && d.preview.points.length > 1) st.items.push(d.preview);
    if (d.mode === 'rect' && d.preview.w > 3 && d.preview.h > 3) st.items.push(d.preview);
    draw(); dirty();
  };
  over.addEventListener('pointerup', end);
  over.addEventListener('pointercancel', end);

  // El control de tamaño también redimensiona el último elemento seleccionado (texto o imagen)
  sizeIn.addEventListener('change', () => {
    const last = st.items[st.items.length - 1];
    if (!last || st.tool !== 'move') return;
    if (last.type === 'text') last.size = st.size;
    if (last.type === 'image') { const r = last.h / last.w; last.w = st.viewport.width * st.size / 100; last.h = last.w * r; }
    draw();
  });

  /** Convierte los elementos (px de pantalla) a coordenadas PDF y los incrusta. */
  async function applyChanges() {
    if (!st.items.length) { toast('No hay cambios que aplicar', 'warn'); return false; }
    const vp = st.viewport, s = st.scale;
    const P = (x, y) => vp.convertToPdfPoint(x, y);
    const out = [];
    for (const it of st.items) {
      if (it.type === 'rect') {
        const [ax, ay] = P(it.x, it.y), [bx, by] = P(it.x + it.w, it.y + it.h);
        out.push({ ...it, x: Math.min(ax, bx), y: Math.min(ay, by), w: Math.abs(bx - ax), h: Math.abs(by - ay), borderWidth: (it.borderWidth || 2) / s });
      } else if (it.type === 'line') {
        out.push({ ...it, points: it.points.map(([x, y]) => P(x, y)), width: it.width / s });
      } else if (it.type === 'text') {
        const [x, y] = P(it.x, it.y + it.size * ASC);
        out.push({ type: 'text', x, y, text: it.text, size: it.size / s, color: it.color, bold: it.bold });
        if (it.stamp) {
          const b = bounds(it);
          const [ax, ay] = P(b.x - it.size * 0.4, b.y - it.size * 0.25), [bx, by] = P(b.x + b.w + it.size * 0.4, b.y + b.h + it.size * 0.05);
          out.push({ type: 'rect', x: Math.min(ax, bx), y: Math.min(ay, by), w: Math.abs(bx - ax), h: Math.abs(by - ay), color: it.color, fill: false, border: true, borderWidth: Math.max(2, it.size / 8) / s });
        }
      } else if (it.type === 'image') {
        const [x, y] = P(it.x, it.y + it.h);
        out.push({ type: 'image', x, y, w: it.w / s, h: it.h / s, bytes: it.bytes, imgType: it.imgType });
      }
    }
    let bytes = await applyAnnotations(ctx.getBytes(), st.page - 1, out);
    const redacted = st.items.some(it => it.redact);
    if (redacted) {
      // Censura real: la página se convierte en imagen para que el texto tapado no se pueda recuperar
      const pdf = await openPdf(bytes);
      const { blob } = await pageToBlob(pdf, st.page, { scale: 2.5, quality: 0.9 });
      bytes = await replacePageWithImage(bytes, st.page - 1, new Uint8Array(await blob.arrayBuffer()));
      pdf.destroy();
    }
    st.items = []; dirty();
    await ctx.apply(bytes, redacted ? 'Censura permanente en la página ' + st.page : 'Edición de la página ' + st.page);
    return true;
  }

  const el = h('div', { class: 'editor' },
    h('div', { class: 'ed-nav' },
      h('button', { class: 'icon-btn', 'aria-label': 'Página anterior', onclick: () => go(-1) }, icon('back')),
      pageLbl,
      h('button', { class: 'icon-btn flip', 'aria-label': 'Página siguiente', onclick: () => go(1) }, icon('back')),
      h('span', { class: 'grow' }),
      h('button', { class: 'icon-btn', 'aria-label': 'Deshacer último trazo', onclick: () => { st.items.pop(); draw(); dirty(); } }, icon('undo')),
      h('button', { class: 'btn sm primary', onclick: () => applyChanges().catch(e => toast(e.message, 'err')) }, icon('check', 18), 'Aplicar'),
    ),
    toolBar,
    h('div', { class: 'ed-opts' }, colorBar, h('div', { class: 'sizer' }, h('span', { class: 'small' }, 'Tamaño'), sizeIn, sizeOut)),
    stage,
    h('p', { class: 'hint center' }, 'Toca para escribir · arrastra para dibujar o tapar · con "Mover" desplazas lo añadido. Pulsa "Aplicar" para guardar en el PDF.'),
  );

  async function go(d) {
    if (st.items.length && !(await modal('Cambios sin aplicar', h('p', {}, '¿Aplicar los cambios de esta página antes de cambiar?'),
      [{ label: 'Descartar', value: 'discard' }, { label: 'Aplicar', value: 'apply', primary: true }]).then(async v => {
      if (v === 'apply') return applyChanges();
      if (v === 'discard') { st.items = []; dirty(); return true; }
      return false;
    }))) return;
    st.page += d; load();
  }

  renderTools(); renderColors();
  return { el, load, selectTool, setPage(n) { st.page = n; }, hasChanges: () => st.items.length > 0, applyChanges, get page() { return st.page; } };
}

/** Imagen elegida por el usuario → {el, bytes, type}. Convierte formatos no admitidos a JPEG. */
async function pickImage() {
  const [f] = await pickFiles({ accept: 'image/*' });
  if (!f) return null;
  return fileToImage(f);
}

export async function fileToImage(file, { maxSide = 2400, filter = 'none' } = {}) {
  const url = URL.createObjectURL(file);
  const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('Imagen no válida')); i.src = url; });
  const k = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
  const type = file.type === 'image/png' && filter === 'none' ? 'png' : 'jpg';
  const c = h('canvas'); c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
  const g = c.getContext('2d');
  g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
  g.drawImage(img, 0, 0, c.width, c.height);
  URL.revokeObjectURL(url);
  if (filter !== 'none') applyScanFilter(g, c.width, c.height, filter);
  return canvasToImage(c, type);
}

export async function canvasToImage(c, type = 'jpg', quality = 0.85) {
  const blob = await new Promise(r => c.toBlob(r, type === 'png' ? 'image/png' : 'image/jpeg', quality));
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const el = new Image();
  el.src = URL.createObjectURL(blob);
  await el.decode().catch(() => {});
  return { el, bytes, type, width: c.width, height: c.height };
}

/** Filtros de "escáner": gris, documento (papel blanco y tinta nítida) o blanco y negro. */
export function applyScanFilter(g, w, hgt, filter) {
  const d = g.getImageData(0, 0, w, hgt), a = d.data;
  const lum = (i) => 0.299 * a[i] + 0.587 * a[i + 1] + 0.114 * a[i + 2];
  // Niveles de tinta (percentil 2) y de papel (percentil 90) para estirar el contraste
  const hist = new Uint32Array(256);
  for (let i = 0; i < a.length; i += 4) hist[lum(i) | 0]++;
  const total = a.length / 4;
  const pct = (p) => { let acc = 0; for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc >= total * p) return v; } return 255; };
  const lo = pct(0.02), hi = Math.max(lo + 30, pct(0.9));
  const stretch = (v) => Math.max(0, Math.min(255, (v - lo) * 255 / (hi - lo)));
  for (let i = 0; i < a.length; i += 4) {
    if (filter === 'gray') { a[i] = a[i + 1] = a[i + 2] = stretch(lum(i)); continue; }
    if (filter === 'contrast') { for (let k = 0; k < 3; k++) a[i + k] = stretch(a[i + k]); continue; }
    a[i] = a[i + 1] = a[i + 2] = stretch(lum(i)) > 165 ? 255 : 0;
  }
  g.putImageData(d, 0, 0);
}

/** Panel para dibujar la firma con el dedo; guarda las últimas firmas para reutilizarlas. */
async function signatureDialog() {
  const saved = (await getKV('signatures', [])) || [];
  const c = h('canvas', { class: 'sigpad', width: 900, height: 360 });
  const g = c.getContext('2d');
  g.lineWidth = 6; g.lineCap = 'round'; g.lineJoin = 'round'; g.strokeStyle = '#0b1f5c';
  let drawing = false, any = false;
  const p = (e) => { const r = c.getBoundingClientRect(); return [(e.clientX - r.left) * c.width / r.width, (e.clientY - r.top) * c.height / r.height]; };
  c.addEventListener('pointerdown', (e) => { drawing = true; any = true; c.setPointerCapture(e.pointerId); g.beginPath(); g.moveTo(...p(e)); });
  c.addEventListener('pointermove', (e) => { if (drawing) { g.lineTo(...p(e)); g.stroke(); } });
  c.addEventListener('pointerup', () => { drawing = false; });
  const colorSel = h('div', { class: 'colors' }, ['#0b1f5c', '#111111', '#1d4ed8'].map(col => h('button', { class: 'swatch', style: { background: col }, 'aria-label': 'Tinta ' + col, onclick: () => { g.strokeStyle = col; } })));
  let chosen = null;
  const savedRow = saved.length ? h('div', { class: 'sig-saved' }, h('span', { class: 'small' }, 'Firmas guardadas:'),
    saved.map(src => h('button', { class: 'sig-thumb', onclick: () => { chosen = src; document.querySelector('#modals .modal:last-child .btn.primary').click(); } }, h('img', { src, alt: 'Firma guardada' })))) : null;
  const body = h('div', { class: 'stack' }, savedRow, h('p', { class: 'small' }, 'Firma con el dedo dentro del recuadro:'), c, colorSel,
    h('button', { class: 'btn sm', onclick: () => { g.clearRect(0, 0, c.width, c.height); any = false; } }, 'Borrar'));
  const ok = await modal('Firma', body, [{ label: 'Cancelar', value: false }, { label: 'Usar firma', value: true, primary: true }], { wide: true });
  if (!ok) return null;
  let src = chosen;
  if (!src) {
    if (!any) { toast('No dibujaste ninguna firma', 'warn'); return null; }
    const trimmed = trimCanvas(c);
    src = trimmed.toDataURL('image/png');
    await setKV('signatures', [src, ...saved.filter(s => s !== src)].slice(0, 4));
  }
  const img = new Image(); img.src = src; await img.decode();
  const bytes = Uint8Array.from(atob(src.split(',')[1]), ch => ch.charCodeAt(0));
  return { el: img, bytes, type: 'png' };
}

function trimCanvas(c) {
  const g = c.getContext('2d');
  const { data, width, height } = g.getImageData(0, 0, c.width, c.height);
  let x0 = width, y0 = height, x1 = 0, y1 = 0;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    if (data[(y * width + x) * 4 + 3] > 10) { if (x < x0) x0 = x; if (y < y0) y0 = y; if (x > x1) x1 = x; if (y > y1) y1 = y; }
  }
  const pad = 8;
  x0 = Math.max(0, x0 - pad); y0 = Math.max(0, y0 - pad); x1 = Math.min(width, x1 + pad); y1 = Math.min(height, y1 + pad);
  const out = h('canvas'); out.width = Math.max(1, x1 - x0); out.height = Math.max(1, y1 - y0);
  out.getContext('2d').drawImage(c, x0, y0, out.width, out.height, 0, 0, out.width, out.height);
  return out;
}

const STAMPS = ['APROBADO', 'PAGADO', 'RECIBIDO', 'REVISADO', 'COPIA', 'BORRADOR', 'CONFIDENCIAL', 'URGENTE', 'RECHAZADO', 'ANULADO'];
async function stampDialog() {
  const today = new Date().toLocaleDateString('es');
  let chosen = null;
  const custom = h('input', { placeholder: 'Texto propio…' });
  const withDate = h('input', { type: 'checkbox' }); withDate.checked = true;
  const v = await modal('Sello', h('div', { class: 'stack' },
    h('div', { class: 'chips' }, STAMPS.map(t => h('button', { class: 'chip stamp-chip', onclick: () => { chosen = t; document.querySelector('#modals .modal:last-child .btn.primary').click(); } }, t))),
    custom, h('label', { class: 'row small' }, withDate, ` Añadir fecha (${today})`)),
  [{ label: 'Cancelar', value: false }, { label: 'Usar texto propio', value: true, primary: true }]);
  if (!v) return null;
  const t = (chosen || custom.value.trim().toUpperCase());
  if (!t) return null;
  return withDate.checked ? `${t} · ${today}` : t;
}
