// Escáner de documentos: cámara en vivo con detección de bordes, captura automática, lotes,
// tarjetas de identidad, libros, QR, foto a texto y editor de páginas (recorte, filtros, ajustes).
import { h, icon, toast, ask, modal, busy, pickFiles, pushBack, seg, field, select } from '../ui.js';
import { loadCV, detectQuad, warp, applyFilter, rotateCanvas, fullQuad, FILTERS } from './cv.js';
import * as ops from '../lib/ops.js';
import { ocrLayout } from '../lib/ocr.js';
import { aiOcr } from '../lib/ai.js';
import { shareText, shareFile, saveToDevice } from '../lib/native.js';
import { safeFileName } from '../lib/text.js';
import jsQR from 'jsqr';

export const MODES = [
  ['doc', 'Documento', 'file'], ['batch', 'Lote', 'pages'], ['id', 'Tarjeta ID', 'idcard'], ['book', 'Libro', 'book'],
  ['ocr', 'A texto', 'text'], ['qr', 'QR', 'qr'],
];
const HINTS = {
  doc: 'Encuadra el documento sobre un fondo oscuro', batch: 'Captura todas las páginas seguidas', id: 'Coloca el ANVERSO de la tarjeta',
  book: 'Encuadra el libro abierto (dos páginas)', ocr: 'Encuadra el texto que quieres copiar', qr: 'Apunta a un código QR o de barras',
};

let cv = null;
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

/** Abre el escáner a pantalla completa. Al terminar llama a app.saveNew con el PDF. */
export async function openScanner(app, { mode = 'doc', importFiles = null } = {}) {
  const st = {
    mode, pages: [], stream: null, track: null, auto: app.settings.scanAuto ?? true, torch: false, grid: false,
    quad: null, shown: null, stable: 0, lastCapture: 0, loopOn: false, defaultFilter: app.settings.scanFilter || 'magic',
  };
  const root = h('div', { class: 'scanner', role: 'dialog', 'aria-label': 'Escáner' });
  document.body.append(root);
  document.body.classList.add('no-scroll');
  let removeBack = pushBack(() => close());

  function close() {
    stopCamera();
    removeBack();
    root.remove();
    document.body.classList.remove('no-scroll');
  }

  const loading = busy('Preparando el escáner…');
  try { ({ cv } = await loadCV()); } catch (e) { loading.done(); close(); toast(e.message, 'err'); return; }
  loading.done();

  if (importFiles) { await addFiles(importFiles); return review(); }
  camera();

  /* ---------------- Cámara ---------------- */
  async function camera() {
    st.view = 'camera';
    const video = h('video', { class: 'sc-video', playsinline: true, muted: true, autoplay: true });
    const overlay = h('canvas', { class: 'sc-overlay' });
    const hint = h('div', { class: 'sc-hint' }, HINTS[st.mode]);
    const flash = h('div', { class: 'sc-flash' });
    const thumb = h('button', { class: 'sc-thumb', 'aria-label': 'Revisar páginas', onclick: () => st.pages.length && review() });
    const doneBtn = h('button', { class: 'sc-done', onclick: () => st.pages.length ? review() : toast('Aún no hay páginas', 'warn') }, 'Listo');
    const shutter = h('button', { class: 'sc-shutter', 'aria-label': 'Capturar', onclick: () => capture() }, h('i'));
    const autoBtn = h('button', { class: 'sc-chip' + (st.auto ? ' on' : ''), onclick: () => { st.auto = !st.auto; autoBtn.classList.toggle('on', st.auto); app.settings.scanAuto = st.auto; app.saveSettings(); } }, 'AUTO');
    const torchBtn = h('button', { class: 'sc-icon', 'aria-label': 'Linterna', onclick: toggleTorch }, icon('flash'));
    const gridBtn = h('button', { class: 'sc-icon', 'aria-label': 'Cuadrícula', onclick: () => { st.grid = !st.grid; gridBtn.classList.toggle('on', st.grid); } }, icon('grid'));
    const modes = h('div', { class: 'sc-modes', role: 'tablist' }, MODES.map(([id, label]) =>
      h('button', { class: 'sc-mode' + (st.mode === id ? ' on' : ''), role: 'tab', 'aria-selected': String(st.mode === id), onclick: (e) => {
        st.mode = id; modes.querySelectorAll('.sc-mode').forEach(b => b.classList.toggle('on', b === e.currentTarget));
        e.currentTarget.scrollIntoView({ inline: 'center', behavior: 'smooth', block: 'nearest' });
        hint.textContent = HINTS[id]; st.idSide = 0; shutter.hidden = id === 'qr'; autoBtn.hidden = id === 'qr';
      } }, label)));
    const updThumb = () => {
      const last = st.pages[st.pages.length - 1];
      thumb.replaceChildren(...(last ? [h('img', { src: thumbURL(last), alt: '' }), h('b', {}, st.pages.length)] : []));
      thumb.classList.toggle('empty', !last);
    };
    st.updThumb = updThumb;
    root.replaceChildren(
      h('div', { class: 'sc-cam' }, video, overlay, flash, hint),
      h('div', { class: 'sc-top' },
        h('button', { class: 'sc-icon', 'aria-label': 'Cerrar', onclick: () => confirmExit() }, icon('close')),
        h('span', { class: 'grow' }), autoBtn, torchBtn, gridBtn,
        h('button', { class: 'sc-icon', 'aria-label': 'Importar de la galería', onclick: async () => {
          const files = await pickFiles({ accept: 'image/*', multiple: true });
          if (files.length) { await addFiles(files); review(); }
        } }, icon('image'))),
      h('div', { class: 'sc-bottom' }, modes, h('div', { class: 'sc-controls' }, thumb, shutter, doneBtn)),
    );
    updThumb();
    st.hintEl = hint; st.flashEl = flash; st.video = video; st.overlay = overlay;
    try {
      st.stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: 'environment' }, width: { ideal: 3264 }, height: { ideal: 2448 } } });
    } catch (e) {
      hint.textContent = 'No hay acceso a la cámara. Usa la galería o la cámara del sistema.';
      shutter.onclick = async () => {
        const files = await pickFiles({ accept: 'image/*', capture: 'environment' });
        if (files.length) { await addFiles(files); if (st.mode === 'doc' || st.mode === 'ocr') review(); else updThumb(); }
      };
      return;
    }
    st.track = st.stream.getVideoTracks()[0];
    try { await st.track.applyConstraints({ advanced: [{ focusMode: 'continuous' }] }); } catch { /* opcional */ }
    torchBtn.hidden = !st.track.getCapabilities?.().torch;
    video.srcObject = st.stream;
    await video.play().catch(() => {});
    loop();
  }

  async function toggleTorch() {
    st.torch = !st.torch;
    try { await st.track.applyConstraints({ advanced: [{ torch: st.torch }] }); } catch { toast('Linterna no disponible', 'warn'); }
    root.querySelector('[aria-label="Linterna"]')?.classList.toggle('on', st.torch);
  }

  function stopCamera() {
    st.loopOn = false;
    st.stream?.getTracks().forEach(t => t.stop());
    st.stream = null;
  }

  async function loop() {
    st.loopOn = true;
    let lastQr = 0;
    while (st.loopOn && st.view === 'camera') {
      const v = st.video;
      if (v.readyState >= 2 && v.videoWidth) {
        if (st.mode === 'qr') {
          if (Date.now() - lastQr > 280) { lastQr = Date.now(); const code = await scanCode(v); if (code) { await showCode(code); continue; } }
          st.quad = null;
        } else {
          try { st.quad = detectQuad(cv, v, 360); } catch { st.quad = null; }
          trackStability();
        }
        drawOverlay();
      }
      await sleep(st.mode === 'qr' ? 120 : 160);
    }
  }

  function trackStability() {
    const q = st.quad, v = st.video;
    const diag = Math.hypot(v.videoWidth, v.videoHeight);
    if (q && st.prevQuad && q.every((p, i) => Math.hypot(p.x - st.prevQuad[i].x, p.y - st.prevQuad[i].y) < diag * 0.018)) st.stable++;
    else st.stable = 0;
    st.prevQuad = q;
    const what = st.mode === 'id' ? (st.idSide ? 'Reverso' : 'Anverso') : 'Documento';
    if (!q) st.hintEl.textContent = st.mode === 'id' ? `Coloca el ${what.toUpperCase()} de la tarjeta` : HINTS[st.mode];
    else if (st.auto && ['doc', 'batch', 'id', 'book'].includes(st.mode)) {
      st.hintEl.textContent = st.stable >= 3 ? 'No te muevas…' : `${what} detectado`;
      if (st.stable >= 6 && Date.now() - st.lastCapture > 2200) capture();
    } else st.hintEl.textContent = `${what} detectado · pulsa para capturar`;
  }

  function drawOverlay() {
    const c = st.overlay, v = st.video;
    const r = c.getBoundingClientRect();
    const dpr = Math.min(devicePixelRatio || 1, 2);
    if (c.width !== Math.round(r.width * dpr)) { c.width = Math.round(r.width * dpr); c.height = Math.round(r.height * dpr); }
    const g = c.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, r.width, r.height);
    if (st.grid) {
      g.strokeStyle = 'rgba(255,255,255,.35)'; g.lineWidth = 1;
      for (const f of [1 / 3, 2 / 3]) { g.beginPath(); g.moveTo(r.width * f, 0); g.lineTo(r.width * f, r.height); g.moveTo(0, r.height * f); g.lineTo(r.width, r.height * f); g.stroke(); }
    }
    if (st.mode === 'qr') {
      const s = Math.min(r.width, r.height) * 0.62, x = (r.width - s) / 2, y = (r.height - s) / 2;
      g.strokeStyle = '#fff'; g.lineWidth = 4; g.lineCap = 'round';
      const L = s * 0.18;
      for (const [cx, cy, dx, dy] of [[x, y, 1, 1], [x + s, y, -1, 1], [x + s, y + s, -1, -1], [x, y + s, 1, -1]]) {
        g.beginPath(); g.moveTo(cx + dx * L, cy); g.lineTo(cx, cy); g.lineTo(cx, cy + dy * L); g.stroke();
      }
      return;
    }
    const q = st.quad;
    if (!q) { st.shown = null; return; }
    // object-fit: cover → escala y desplazamiento del vídeo en pantalla
    const k = Math.max(r.width / v.videoWidth, r.height / v.videoHeight);
    const ox = (r.width - v.videoWidth * k) / 2, oy = (r.height - v.videoHeight * k) / 2;
    const target = q.map(p => ({ x: ox + p.x * k, y: oy + p.y * k }));
    st.shown = st.shown ? st.shown.map((p, i) => ({ x: p.x + (target[i].x - p.x) * 0.5, y: p.y + (target[i].y - p.y) * 0.5 })) : target;
    const ok = st.stable >= 3;
    g.fillStyle = ok ? 'rgba(52, 211, 153, .22)' : 'rgba(255, 107, 85, .18)';
    g.strokeStyle = ok ? '#34d399' : '#ff6b55'; g.lineWidth = 3; g.lineJoin = 'round';
    g.beginPath(); st.shown.forEach((p, i) => i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y)); g.closePath(); g.fill(); g.stroke();
    g.fillStyle = '#fff';
    st.shown.forEach(p => { g.beginPath(); g.arc(p.x, p.y, 6, 0, Math.PI * 2); g.fill(); });
  }

  async function capture() {
    if (!st.video?.videoWidth) return;
    st.lastCapture = Date.now(); st.stable = 0;
    st.flashEl.classList.remove('go'); void st.flashEl.offsetWidth; st.flashEl.classList.add('go');
    navigator.vibrate?.(30);
    const v = st.video;
    const c = h('canvas'); c.width = v.videoWidth; c.height = v.videoHeight;
    c.getContext('2d').drawImage(v, 0, 0);
    let quad = null;
    try { quad = detectQuad(cv, c, 640); } catch { /* sin detección */ }
    const page = newPage(c, quad);
    if (st.mode === 'id') { page.kind = st.idSide ? 'id-back' : 'id-front'; }
    if (st.mode === 'book') page.kind = 'book';
    st.pages.push(page);
    st.updThumb();
    if (st.mode === 'id') {
      st.idSide = st.idSide ? 0 : 1;
      st.hintEl.textContent = st.idSide ? 'Ahora da la vuelta: REVERSO de la tarjeta' : 'Tarjeta completa. Captura otra o pulsa Listo';
      if (!st.idSide) review();
      return;
    }
    if (st.mode === 'doc' || st.mode === 'ocr') review();
  }

  function newPage(canvas, quad) {
    return { orig: canvas, quad: quad || fullQuad(canvas.width, canvas.height, 0.02), filter: st.mode === 'ocr' ? 'gray' : st.defaultFilter, rot: 0, bright: 0, contrast: 0, cache: null };
  }

  async function addFiles(files) {
    const b = busy('Procesando imágenes…');
    try {
      for (const f of files) {
        const img = await loadImage(f);
        const k = Math.min(1, 3200 / Math.max(img.naturalWidth, img.naturalHeight));
        const c = h('canvas'); c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        let quad = null;
        try { quad = detectQuad(cv, c, 640); } catch { /* foto sin bordes claros */ }
        st.pages.push(newPage(c, quad));
      }
    } finally { b.done(); }
  }

  /* ---------------- Procesado ---------------- */
  function processed(page, maxSide = 1400) {
    const key = [page.quad.map(p => p.x.toFixed(1) + ',' + p.y.toFixed(1)).join(';'), page.filter, page.rot, page.bright, page.contrast, maxSide].join('|');
    if (page.cache?.key === key) return page.cache.canvas;
    let c = warp(cv, page.orig, page.quad, maxSide);
    c = applyFilter(cv, c, page.filter, { brightness: page.bright, contrast: page.contrast });
    c = rotateCanvas(c, page.rot);
    if (maxSide <= 1400) page.cache = { key, canvas: c };
    page.thumb = null;
    return c;
  }
  function thumbURL(page) {
    if (!page.thumb) {
      const src = processed(page);
      const t = h('canvas'); const k = 200 / Math.max(src.width, src.height);
      t.width = Math.round(src.width * k); t.height = Math.round(src.height * k);
      t.getContext('2d').drawImage(src, 0, 0, t.width, t.height);
      page.thumb = t.toDataURL('image/jpeg', 0.7);
    }
    return page.thumb;
  }

  /** Páginas finales: los libros se parten en dos y las tarjetas se combinan anverso+reverso en una hoja. */
  function outputCanvases(maxSide) {
    const out = [];
    for (let i = 0; i < st.pages.length; i++) {
      const p = st.pages[i];
      const c = processed(p, maxSide);
      if (p.kind === 'book') {
        const half = Math.floor(c.width / 2);
        for (const x of [0, half]) { const s = h('canvas'); s.width = half; s.height = c.height; s.getContext('2d').drawImage(c, x, 0, half, c.height, 0, 0, half, c.height); out.push(s); }
      } else if (p.kind === 'id-front') {
        const back = st.pages[i + 1]?.kind === 'id-back' ? processed(st.pages[++i], maxSide) : null;
        out.push(composeId(c, back));
      } else out.push(c);
    }
    return out;
  }

  function composeId(front, back) {
    // Hoja A4 a 200 ppp con cada cara a tamaño real (85,6 × 54 mm)
    const W = 1654, H = 2339, cw = 674, ch = 425;
    const c = h('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, W, H);
    const put = (img, y) => { if (!img) return; const r = img.width >= img.height ? img : rotateCanvas(img, 90); g.drawImage(r, (W - cw) / 2, y, cw, ch); };
    put(front, 360); put(back, 360 + ch + 160);
    return c;
  }

  /* ---------------- Revisión ---------------- */
  function review() {
    st.view = 'review';
    st.loopOn = false;
    if (!st.pages.length) return camera();
    st.cur = Math.min(st.cur ?? 0, st.pages.length - 1);
    if (st.mode === 'ocr') return cropEditor(st.pages.length - 1, () => ocrResult(st.pages[st.pages.length - 1]));
    const big = h('canvas', { class: 'sc-big' });
    const strip = h('div', { class: 'sc-strip' });
    const title = h('b');
    const panel = h('div', { class: 'sc-panel' });
    const drawBig = () => {
      const p = st.pages[st.cur];
      const c = processed(p);
      big.width = c.width; big.height = c.height; big.getContext('2d').drawImage(c, 0, 0);
      title.textContent = `Página ${st.cur + 1} de ${st.pages.length}${p.kind?.startsWith('id') ? ' · tarjeta' : p.kind === 'book' ? ' · libro (2 págs.)' : ''}`;
      strip.replaceChildren(...st.pages.map((pg, i) => h('button', { class: 'sc-sthumb' + (i === st.cur ? ' on' : ''), onclick: () => { st.cur = i; drawBig(); } },
        h('img', { src: thumbURL(pg), alt: 'Página ' + (i + 1) }), h('span', {}, i + 1))));
      strip.querySelector('.on')?.scrollIntoView({ inline: 'center', block: 'nearest' });
    };
    const tool = (ic, label, fn) => h('button', { class: 'sc-tool', onclick: fn }, icon(ic, 22), h('span', {}, label));
    const filtersPanel = () => {
      const p = st.pages[st.cur];
      const small = warp(cv, p.orig, p.quad, 220);
      panel.replaceChildren(h('div', { class: 'sc-filters' }, FILTERS.map(([id, label]) => {
        const c = rotateCanvas(applyFilter(cv, small, id), p.rot);
        return h('button', { class: 'sc-filter' + (p.filter === id ? ' on' : ''), onclick: () => { p.filter = id; st.defaultFilter = id; app.settings.scanFilter = id; app.saveSettings(); drawBig(); filtersPanel(); } },
          h('img', { src: c.toDataURL('image/jpeg', 0.7), alt: '' }), h('span', {}, label));
      })), h('button', { class: 'btn sm ghost', onclick: () => { st.pages.forEach(pg => { pg.filter = p.filter; }); drawBig(); toast('Filtro aplicado a todas las páginas'); } }, 'Aplicar a todas'));
    };
    const adjustPanel = () => {
      const p = st.pages[st.cur];
      let t;
      const sl = (label, key) => h('label', { class: 'sc-slider' }, h('span', {}, label), h('input', { type: 'range', min: -60, max: 60, value: p[key], oninput: (e) => { p[key] = +e.target.value; clearTimeout(t); t = setTimeout(drawBig, 80); } }));
      panel.replaceChildren(sl('Brillo', 'bright'), sl('Contraste', 'contrast'),
        h('button', { class: 'btn sm ghost', onclick: () => { p.bright = p.contrast = 0; drawBig(); adjustPanel(); } }, 'Restablecer'));
    };
    root.replaceChildren(
      h('div', { class: 'sc-rtop' },
        h('button', { class: 'sc-icon', 'aria-label': 'Volver a la cámara', onclick: () => camera() }, icon('back')),
        title, h('span', { class: 'grow' }),
        h('button', { class: 'btn primary sm', onclick: () => saveDialog() }, icon('check', 18), 'Guardar')),
      h('div', { class: 'sc-stage' }, big,
        h('button', { class: 'sc-nav l', 'aria-label': 'Anterior', onclick: () => { if (st.cur > 0) { st.cur--; drawBig(); } } }, icon('back')),
        h('button', { class: 'sc-nav r', 'aria-label': 'Siguiente', onclick: () => { if (st.cur < st.pages.length - 1) { st.cur++; drawBig(); } } }, icon('back'))),
      panel,
      strip,
      h('div', { class: 'sc-tools' },
        tool('crop', 'Recortar', () => cropEditor(st.cur, review)),
        tool('filter', 'Filtros', filtersPanel),
        tool('rotr', 'Girar', () => { st.pages[st.cur].rot = (st.pages[st.cur].rot + 90) % 360; drawBig(); }),
        tool('sliders', 'Ajustar', adjustPanel),
        tool('text', 'A texto', () => ocrResult(st.pages[st.cur])),
        tool('back', 'Mover', () => { if (st.cur > 0) { [st.pages[st.cur - 1], st.pages[st.cur]] = [st.pages[st.cur], st.pages[st.cur - 1]]; st.cur--; drawBig(); } }),
        tool('trash', 'Borrar', () => { st.pages.splice(st.cur, 1); if (!st.pages.length) return camera(); st.cur = Math.min(st.cur, st.pages.length - 1); drawBig(); }),
        tool('plus', 'Añadir', () => camera())),
    );
    drawBig();
    filtersPanel();
    // Deslizar a izquierda/derecha para cambiar de página
    let sx = null;
    big.addEventListener('touchstart', (e) => { sx = e.touches[0].clientX; }, { passive: true });
    big.addEventListener('touchend', (e) => {
      if (sx === null) return; const dx = e.changedTouches[0].clientX - sx; sx = null;
      if (Math.abs(dx) > 60) { st.cur = Math.max(0, Math.min(st.pages.length - 1, st.cur + (dx < 0 ? 1 : -1))); drawBig(); }
    });
  }

  async function confirmExit() {
    if (st.pages.length && !(await modal('Salir del escáner', h('p', {}, `Se perderán ${st.pages.length} página(s) sin guardar.`), [{ label: 'Seguir escaneando', value: false }, { label: 'Salir', value: true, danger: true }]))) return;
    close();
  }

  /* ---------------- Recorte con lupa ---------------- */
  function cropEditor(index, after) {
    st.view = 'crop';
    const p = st.pages[index];
    const img = p.orig;
    const wrap = h('div', { class: 'sc-cropwrap' });
    const c = h('canvas', { class: 'sc-crop' });
    const loupe = h('canvas', { class: 'sc-loupe', width: 220, height: 220 });
    wrap.append(c, loupe);
    let quad = p.quad.map(q => ({ ...q }));
    let drag = -1;
    let scale = 1;
    const fit = () => {
      const r = wrap.getBoundingClientRect();
      scale = Math.min((r.width - 32) / img.width, (r.height - 32) / img.height);
      c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
      draw();
    };
    const draw = () => {
      const g = c.getContext('2d');
      g.drawImage(img, 0, 0, c.width, c.height);
      g.fillStyle = 'rgba(0,0,0,.45)';
      g.beginPath(); g.rect(0, 0, c.width, c.height);
      quad.forEach((q, i) => i ? g.lineTo(q.x * scale, q.y * scale) : g.moveTo(q.x * scale, q.y * scale)); g.closePath();
      g.fill('evenodd');
      g.strokeStyle = '#34d399'; g.lineWidth = 2.5;
      g.beginPath(); quad.forEach((q, i) => i ? g.lineTo(q.x * scale, q.y * scale) : g.moveTo(q.x * scale, q.y * scale)); g.closePath(); g.stroke();
      quad.forEach((q, i) => { g.beginPath(); g.arc(q.x * scale, q.y * scale, i === drag ? 15 : 12, 0, Math.PI * 2); g.fillStyle = 'rgba(52,211,153,.35)'; g.fill(); g.lineWidth = 3; g.strokeStyle = '#fff'; g.stroke(); });
    };
    const toImg = (e) => { const r = c.getBoundingClientRect(); return { x: (e.clientX - r.left) / r.width * img.width, y: (e.clientY - r.top) / r.height * img.height }; };
    const showLoupe = (pt, e) => {
      const lg = loupe.getContext('2d'), z = 2.5 / scale * (c.getBoundingClientRect().width / c.width);
      const sw = 220 / (scale * 2.5);
      lg.fillStyle = '#000'; lg.fillRect(0, 0, 220, 220);
      lg.drawImage(img, pt.x - sw / 2, pt.y - sw / 2, sw, sw, 0, 0, 220, 220);
      lg.strokeStyle = '#34d399'; lg.lineWidth = 2; lg.beginPath(); lg.moveTo(110, 90); lg.lineTo(110, 130); lg.moveTo(90, 110); lg.lineTo(130, 110); lg.stroke();
      const r = wrap.getBoundingClientRect();
      const left = e.clientX - r.left < r.width / 2;
      loupe.style.left = left ? '' : '12px'; loupe.style.right = left ? '12px' : '';
      loupe.hidden = false; void z;
    };
    c.addEventListener('pointerdown', (e) => {
      const pt = toImg(e);
      const tol = 40 / scale;
      let best = -1, bd = Infinity;
      quad.forEach((q, i) => { const d = Math.hypot(q.x - pt.x, q.y - pt.y); if (d < bd) { bd = d; best = i; } });
      if (bd < tol * 1.6) { drag = best; c.setPointerCapture(e.pointerId); showLoupe(quad[drag], e); draw(); }
    });
    c.addEventListener('pointermove', (e) => {
      if (drag < 0) return;
      const pt = toImg(e);
      quad[drag] = { x: Math.max(0, Math.min(img.width, pt.x)), y: Math.max(0, Math.min(img.height, pt.y)) };
      showLoupe(quad[drag], e); draw();
    });
    const end = () => { drag = -1; loupe.hidden = true; draw(); };
    c.addEventListener('pointerup', end); c.addEventListener('pointercancel', end);
    loupe.hidden = true;
    root.replaceChildren(
      h('div', { class: 'sc-rtop' },
        h('button', { class: 'sc-icon', 'aria-label': 'Cancelar', onclick: () => (st.mode === 'ocr' ? camera() : after()) }, icon('close')),
        h('b', {}, 'Recortar'), h('span', { class: 'grow' }),
        h('button', { class: 'btn primary sm', onclick: () => { p.quad = quad; p.cache = null; p.thumb = null; after(); } }, icon('check', 18), 'Aplicar')),
      wrap,
      h('div', { class: 'sc-tools' },
        h('button', { class: 'sc-tool', onclick: () => { const q = detectQuad(cv, img, 640); if (q) { quad = q; draw(); } else toast('No se encontraron bordes', 'warn'); } }, icon('magic', 22), h('span', {}, 'Auto')),
        h('button', { class: 'sc-tool', onclick: () => { quad = fullQuad(img.width, img.height); draw(); } }, icon('expand', 22), h('span', {}, 'Todo')),
        h('button', { class: 'sc-tool', onclick: () => { p.rot = (p.rot + 90) % 360; toast('Se girará al aplicar'); } }, icon('rotr', 22), h('span', {}, 'Girar'))),
    );
    requestAnimationFrame(fit);
  }

  /* ---------------- Foto a texto ---------------- */
  async function ocrResult(page) {
    const c = processed(page, 2400);
    const out = h('textarea', { class: 'bigtext', rows: 14, placeholder: 'Reconociendo texto…' });
    const status = h('p', { class: 'small muted' });
    const useAI = !!app.settings.ai?.key;
    const run = async (ai) => {
      out.value = ''; status.textContent = ai ? 'Leyendo con IA…' : 'Leyendo en el teléfono… (la primera vez descarga el idioma)';
      try {
        if (ai) {
          const data = c.toDataURL('image/jpeg', 0.88).split(',')[1];
          out.value = (await aiOcr(app.settings.ai, { mime: 'image/jpeg', data }, undefined, (t) => { out.value = t; })).trim();
        } else {
          out.value = (await ocrLayout(c, app.settings.ocrLangs || 'spa+eng', (f) => { status.textContent = `Leyendo en el teléfono… ${Math.round(f * 100)}%`; })).text;
        }
        status.textContent = out.value ? `${(out.value.match(/\S+/g) || []).length} palabras · puedes editar el texto` : 'No se encontró texto.';
      } catch (e) { status.textContent = '⚠ ' + e.message; }
    };
    const res = modal('Texto reconocido', h('div', { class: 'stack' }, h('img', { class: 'ocr-prev', src: c.toDataURL('image/jpeg', 0.6), alt: '' }), status, out,
      h('div', { class: 'row wrap' },
        h('button', { class: 'btn sm', onclick: () => run(true) }, icon('ai', 16), 'Leer con IA'),
        h('button', { class: 'btn sm', onclick: () => run(false) }, 'Leer sin internet'))),
    [{ label: 'Copiar', value: 'copy' }, { label: 'Compartir', value: 'share' }, { label: 'Crear PDF', value: 'pdf', primary: true }], { wide: true });
    run(useAI);
    const v = await res;
    if (v === 'copy') { await navigator.clipboard.writeText(out.value).catch(() => {}); toast('Texto copiado'); }
    if (v === 'share') shareText(out.value, 'Texto escaneado').catch(() => {});
    if (v === 'pdf') { close(); app.textToNewPdf(out.value, 'Texto escaneado ' + new Date().toLocaleDateString('es').replace(/\//g, '-')); }
    if (st.mode === 'ocr' && root.isConnected && v !== 'pdf') { st.pages = []; camera(); }
  }

  /* ---------------- QR / códigos de barras ---------------- */
  let detector = null;
  async function scanCode(video) {
    try {
      if ('BarcodeDetector' in window) {
        detector = detector || new window.BarcodeDetector();
        const r = await detector.detect(video);
        if (r[0]) return { text: r[0].rawValue, format: r[0].format };
      }
    } catch { detector = null; }
    const k = Math.min(1, 720 / Math.max(video.videoWidth, video.videoHeight));
    const c = h('canvas'); c.width = Math.round(video.videoWidth * k); c.height = Math.round(video.videoHeight * k);
    const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(video, 0, 0, c.width, c.height);
    const d = g.getImageData(0, 0, c.width, c.height);
    const r = jsQR(d.data, c.width, c.height, { inversionAttempts: 'attemptBoth' });
    return r ? { text: r.data, format: 'qr_code' } : null;
  }
  async function showCode(code) {
    navigator.vibrate?.(60);
    st.loopOn = false;
    const isUrl = /^https?:\/\//i.test(code.text);
    const wifi = code.text.match(/^WIFI:.*?S:([^;]*);.*?(?:P:([^;]*);)?/i);
    const v = await modal('Código leído', h('div', { class: 'stack' },
      h('p', { class: 'small muted' }, (code.format || '').replace(/_/g, ' ').toUpperCase()),
      wifi ? h('p', {}, `Red Wi-Fi: ${wifi[1]}`, h('br'), `Contraseña: ${wifi[2] || '(sin contraseña)'}`) : h('p', { class: 'qr-text' }, code.text)),
    [{ label: 'Copiar', value: 'copy' }, ...(isUrl ? [{ label: 'Abrir enlace', value: 'open', primary: true }] : [{ label: 'Compartir', value: 'share', primary: true }])]);
    if (v === 'copy') { await navigator.clipboard.writeText(wifi?.[2] || code.text).catch(() => {}); toast('Copiado'); }
    if (v === 'open') window.open(code.text, '_blank');
    if (v === 'share') shareText(code.text, 'Código QR').catch(() => {});
    await sleep(600);
    if (root.isConnected && st.view === 'camera') loop();
  }

  /* ---------------- Guardar ---------------- */
  async function saveDialog() {
    const name = h('input', { value: (st.pages.some(p => p.kind?.startsWith('id')) ? 'Tarjeta ' : 'Escaneo ') + new Date().toLocaleString('es').replace(/[/:]/g, '-').replace(',', '') });
    let size = app.settings.scanPageSize || 'fit', quality = app.settings.scanQuality || 'normal', format = 'pdf';
    const ocr = h('input', { type: 'checkbox' }); ocr.checked = app.settings.scanOcr ?? true;
    const ok = await modal('Guardar escaneo', h('div', { class: 'stack' },
      field('Nombre', name),
      field('Formato', seg([['pdf', 'PDF'], ['jpg', 'Imágenes JPG']], format, v => { format = v; })),
      field('Tamaño de página', select([['fit', 'Igual que el documento'], ['A4', 'A4'], ['Carta', 'Carta'], ['Oficio', 'Oficio'], ['Legal', 'Legal']], size, v => { size = v; })),
      field('Calidad', seg([['high', 'Alta'], ['normal', 'Normal'], ['small', 'Compacta']], quality, v => { quality = v; })),
      h('label', { class: 'row' }, ocr, h('span', {}, h('b', {}, 'Texto seleccionable (OCR)'), h('br'), h('small', { class: 'muted' }, 'Permite buscar, copiar, traducir y narrar el texto del escaneo.')))),
    [{ label: 'Cancelar', value: false }, { label: 'Guardar', value: true, primary: true }]);
    if (!ok) return;
    Object.assign(app.settings, { scanPageSize: size, scanQuality: quality, scanOcr: ocr.checked }); app.saveSettings();
    const Q = { high: [3000, 0.9], normal: [2000, 0.82], small: [1400, 0.62] }[quality];
    const b = busy('Generando…', { cancellable: true });
    try {
      const canvases = outputCanvases(Q[0]);
      const images = [];
      for (let i = 0; i < canvases.length; i++) {
        if (b.signal.aborted) throw new Error('Cancelado');
        const cv2 = canvases[i];
        b.set(`Página ${i + 1} de ${canvases.length}`, i / canvases.length);
        const blob = await new Promise(r => cv2.toBlob(r, 'image/jpeg', Q[1]));
        const im = { bytes: new Uint8Array(await blob.arrayBuffer()), type: 'jpg' };
        if (format === 'pdf' && ocr.checked) {
          try {
            b.set(`Reconociendo texto · página ${i + 1} de ${canvases.length}`);
            const lay = await ocrLayout(cv2, app.settings.ocrLangs || 'spa+eng', (f) => b.set(null, (i + f) / canvases.length));
            im.words = lineWords(lay.lines);
          } catch (e) { toast('OCR no disponible (¿sin internet la primera vez?): se guarda sin texto', 'warn'); ocr.checked = false; }
        }
        images.push(im);
      }
      if (format === 'jpg') {
        for (let i = 0; i < images.length; i++) await saveToDevice(images[i].bytes, safeFileName(`${name.value} ${i + 1}`, '.jpg'), 'image/jpeg');
        b.done(); toast(`${images.length} imágenes guardadas en Documentos/ArtCraftPDF`);
        if (images.length === 1) shareFile(images[0].bytes, safeFileName(name.value, '.jpg'), 'image/jpeg').catch(() => {});
        close(); return;
      }
      const pdf = await ops.scanToPdf(images, { pageSize: size, title: name.value });
      b.done();
      close();
      await app.saveNew(pdf, name.value, { kind: 'scan' });
      toast(ocr.checked ? 'PDF guardado con texto seleccionable' : 'PDF guardado');
    } catch (e) { b.done(); if (e.message !== 'Cancelado') toast(e.message, 'err'); }
  }
}

/** Palabras con la altura de su línea: así el texto invisible queda en una sola línea al copiarlo. */
export function lineWords(lines) {
  return lines.flatMap(l => l.words.map(w => ({ text: w.text, bbox: { x0: w.bbox.x0, x1: w.bbox.x1, y0: l.bbox.y0, y1: l.bbox.y1 } })));
}

function loadImage(file) {
  return new Promise((res, rej) => {
    const url = URL.createObjectURL(file);
    const i = new Image();
    i.onload = () => { res(i); setTimeout(() => URL.revokeObjectURL(url), 1000); };
    i.onerror = () => rej(new Error('Imagen no válida: ' + file.name));
    i.src = url;
  });
}
