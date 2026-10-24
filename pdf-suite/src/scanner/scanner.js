// Escáner de documentos: cámara en vivo con detección de bordes, captura automática, lotes,
// tarjetas de identidad, libros, QR, foto a texto y editor de páginas (recorte, filtros, ajustes).
import { h, icon, toast, ask, modal, busy, pickFiles, pushBack, seg, field, select } from '../ui.js';
import { loadCV, detectQuad, warp, applyFilter, rotateCanvas, fullQuad, FILTERS } from './cv.js';
import * as ops from '../lib/ops.js';
import { ocrLayout } from '../lib/ocr.js';
import { aiOcr, complete } from '../lib/ai.js';
import { enhanceCanvas, compareDialog } from '../enhance.js';
import { playScanSound } from '../lib/sound.js';
import { parseMRZ, FIELD_LABELS } from '../lib/mrz.js';
import { ocrImage } from '../lib/ocr.js';
import { shareText, shareFile, saveToDevice } from '../lib/native.js';
import { safeFileName } from '../lib/text.js';
import jsQR from 'jsqr';

export const MODES = [
  ['doc', 'Documento', 'file'], ['batch', 'Lote', 'pages'], ['id', 'Tarjeta ID', 'idcard'], ['passport', 'Pasaporte', 'passport'],
  ['book', 'Libro', 'book'], ['ocr', 'A texto', 'text'], ['qr', 'QR', 'qr'],
];
const MODE_DESC = {
  doc: 'Una página · se recorta, endereza y mejora sola', batch: 'Varias páginas seguidas en un solo PDF',
  id: 'Anverso y reverso juntos en una hoja, a tamaño real', passport: 'Página de datos · lee nombre, número y fechas (MRZ)',
  book: 'Libro abierto · separa las dos páginas', ocr: 'Convierte la foto en texto editable', qr: 'Lee códigos QR y de barras al instante',
};
const HINTS = {
  doc: 'Busca el documento sobre un fondo oscuro', batch: 'Captura las páginas una tras otra', id: 'Coloca el ANVERSO de la tarjeta',
  passport: 'Abre el pasaporte por la página de la foto', book: 'Encuadra el libro abierto', ocr: 'Encuadra el texto que quieres copiar', qr: 'Apunta a un código QR o de barras',
};
const AUTO_MODES = ['doc', 'batch', 'id', 'book', 'passport'];
const AUTO_FRAMES = 7;
// Proporción ancho/alto de la guía de cada modo
const GUIDE = { doc: 1 / 1.414, batch: 1 / 1.414, ocr: 1 / 1.414, id: 85.6 / 54, passport: 125 / 88, book: 1.414, qr: 1 };

function guideRect(W, H, mode) {
  const ratio = GUIDE[mode] || GUIDE.doc;
  const maxW = W * 0.84, maxH = H * 0.56;
  let w = maxW, hh = w / ratio;
  if (hh > maxH) { hh = maxH; w = hh * ratio; }
  const x = (W - w) / 2, y = (H - hh) / 2 - H * 0.03;
  return [{ x, y }, { x: x + w, y }, { x: x + w, y: y + hh }, { x, y: y + hh }];
}
const poly = (g, q) => { q.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y))); g.closePath(); };
const lerp = (a, b, t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const towards = (p, q, len) => { const d = dist(p, q) || 1; return { x: p.x + (q.x - p.x) * len / d, y: p.y + (q.y - p.y) * len / d }; };
const cap = (s) => s[0].toUpperCase() + s.slice(1);

/** Anillo del botón: se llena mientras el documento se mantiene quieto (captura automática). */
function svgRing() {
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 100 100'); svg.setAttribute('class', 'sc-ring');
  const c = document.createElementNS(NS, 'circle');
  c.setAttribute('cx', '50'); c.setAttribute('cy', '50'); c.setAttribute('r', '46');
  c.setAttribute('pathLength', '100'); c.setAttribute('stroke-dasharray', '100'); c.setAttribute('stroke-dashoffset', '100');
  svg.append(c);
  let last = -1;
  return { el: svg, set(f) { const v = Math.round((1 - f) * 100); if (v !== last) { last = v; c.setAttribute('stroke-dashoffset', String(v)); } } };
}


let cv = null;
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

/** Abre el escáner a pantalla completa. Al terminar llama a app.saveNew con el PDF. */
export async function openScanner(app, { mode = 'doc', importFiles = null, retouch = false } = {}) {
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

  if (importFiles) {
    await addFiles(importFiles);
    review();
    if (retouch) setTimeout(() => aiRetouch(0, () => review()), 300);
    return;
  }
  camera();

  /* ---------------- Cámara ---------------- */
  async function camera() {
    st.view = 'camera';
    st.quad = null; st.shown = null; st.stable = 0; st.prevQuad = null;
    // poster transparente: evita el icono de "play" gris que Android muestra antes de que llegue la imagen
    const video = h('video', { class: 'sc-video', playsinline: true, muted: true, autoplay: true, poster: 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7' });
    const overlay = h('canvas', { class: 'sc-overlay' });
    const starting = h('div', { class: 'sc-starting' }, h('div', { class: 'sc-doc-anim' }, h('i'), h('b'), h('b'), h('b'), h('b')), h('span', {}, 'Abriendo el escáner…'));
    const hintIcon = h('span', { class: 'sc-dot' });
    const hintText = h('span', {}, '');
    const hint = h('div', { class: 'sc-hint' }, hintIcon, hintText);
    const flash = h('div', { class: 'sc-flash' });
    const thumb = h('button', { class: 'sc-thumb', 'aria-label': 'Revisar páginas', onclick: () => st.pages.length && review() });
    const doneBtn = h('button', { class: 'sc-done', onclick: () => (st.pages.length ? review() : toast('Aún no hay páginas', 'warn')) }, icon('check', 18), h('span', {}, 'Listo'));
    const ring = svgRing();
    const shutter = h('button', { class: 'sc-shutter', 'aria-label': 'Capturar', onclick: () => capture() }, ring.el, h('i', {}, icon('scan', 26)));
    const autoBtn = h('button', { class: 'sc-chip' + (st.auto ? ' on' : ''), onclick: () => { st.auto = !st.auto; autoBtn.classList.toggle('on', st.auto); app.settings.scanAuto = st.auto; app.saveSettings(); setHint(); } }, icon('magic', 15), 'AUTO');
    const torchBtn = h('button', { class: 'sc-icon', 'aria-label': 'Linterna', onclick: toggleTorch }, icon('flash'));
    const gridBtn = h('button', { class: 'sc-icon' + (st.grid ? ' on' : ''), 'aria-label': 'Cuadrícula', onclick: () => { st.grid = !st.grid; gridBtn.classList.toggle('on', st.grid); } }, icon('grid'));
    const desc = h('div', { class: 'sc-desc' });
    const modes = h('div', { class: 'sc-modes', role: 'tablist' });
    const renderModes = () => {
      modes.replaceChildren(...MODES.map(([id, label, ic]) =>
        h('button', { class: 'sc-mode' + (st.mode === id ? ' on' : ''), role: 'tab', 'aria-selected': String(st.mode === id), onclick: (e) => {
          st.mode = id; st.idSide = 0; st.stable = 0;
          renderModes(); setHint();
          shutter.hidden = id === 'qr'; autoBtn.hidden = id === 'qr';
          e.currentTarget.scrollIntoView?.({ inline: 'center', behavior: 'smooth', block: 'nearest' });
        } }, h('span', { class: 'sc-mode-ic' }, icon(ic, 20)), h('span', {}, label))));
      desc.textContent = MODE_DESC[st.mode];
      requestAnimationFrame(() => modes.querySelector('.on')?.scrollIntoView?.({ inline: 'center', block: 'nearest' }));
    };
    const updThumb = () => {
      const last = st.pages[st.pages.length - 1];
      thumb.replaceChildren(...(last ? [h('img', { src: thumbURL(last), alt: '' }), h('b', {}, st.pages.length)] : []));
      thumb.classList.toggle('empty', !last);
      doneBtn.classList.toggle('ready', !!last);
    };
    st.updThumb = updThumb;
    root.replaceChildren(
      h('div', { class: 'sc-cam' }, video, overlay, flash, starting, hint),
      h('div', { class: 'sc-top' },
        h('button', { class: 'sc-icon', 'aria-label': 'Cerrar', onclick: () => confirmExit() }, icon('close')),
        h('span', { class: 'grow' }), autoBtn, torchBtn, gridBtn,
        h('button', { class: 'sc-icon', 'aria-label': 'Importar de la galería', onclick: async () => {
          const files = await pickFiles({ accept: 'image/*', multiple: true });
          if (files.length) { await addFiles(files); review(); }
        } }, icon('image'))),
      h('div', { class: 'sc-bottom' }, modes, desc, h('div', { class: 'sc-controls' }, thumb, shutter, doneBtn)),
    );
    Object.assign(st, { hintEl: hint, hintText, hintIcon, flashEl: flash, video, overlay, ring, starting });
    renderModes(); updThumb(); setHint();
    shutter.hidden = st.mode === 'qr'; autoBtn.hidden = st.mode === 'qr';
    video.addEventListener('playing', () => { video.classList.add('live'); starting.classList.add('gone'); }, { once: true });
    try {
      st.stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: 'environment' }, width: { ideal: 3264 }, height: { ideal: 2448 } } });
    } catch (e) {
      starting.classList.add('gone');
      setHint('No hay acceso a la cámara. Usa la galería o la cámara del sistema.', 'warn');
      shutter.onclick = async () => {
        const files = await pickFiles({ accept: 'image/*', capture: 'environment' });
        if (files.length) { await addFiles(files); if (st.mode === 'doc' || st.mode === 'ocr' || st.mode === 'passport') review(); else updThumb(); }
      };
      return;
    }
    if (st.view !== 'camera' || !root.isConnected) return stopCamera();
    st.track = st.stream.getVideoTracks()[0];
    try { await st.track.applyConstraints({ advanced: [{ focusMode: 'continuous' }] }); } catch { /* opcional */ }
    torchBtn.hidden = !st.track.getCapabilities?.().torch;
    video.srcObject = st.stream;
    await video.play().catch(() => {});
    loop();
    animate();
  }

  function setHint(text, kind) {
    if (!st.hintText) return;
    const what = st.mode === 'id' ? (st.idSide ? 'reverso' : 'anverso') : st.mode === 'passport' ? 'pasaporte' : 'documento';
    if (!text) {
      if (st.mode === 'qr') { text = 'Buscando código QR o de barras…'; kind = 'search'; }
      else if (!st.quad) { text = st.mode === 'id' ? `Coloca el ${what.toUpperCase()} de la tarjeta` : HINTS[st.mode]; kind = 'search'; }
      else if (st.auto && AUTO_MODES.includes(st.mode)) { text = st.stable >= 3 ? 'No te muevas… escaneando' : `${cap(what)} detectado`; kind = st.stable >= 3 ? 'lock' : 'ok'; }
      else { text = `${cap(what)} detectado · pulsa el botón`; kind = 'ok'; }
    }
    if (st.hintText.textContent !== text) st.hintText.textContent = text;
    st.hintEl.className = 'sc-hint' + (kind ? ' h-' + kind : '');
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

  /** Bucle de detección (unas 6 veces por segundo). El dibujo va aparte, a 60 fps. */
  async function loop() {
    st.loopOn = true;
    let lastQr = 0;
    while (st.loopOn && st.view === 'camera') {
      const v = st.video;
      if (v.readyState >= 2 && v.videoWidth && !st.busy) {
        if (st.mode === 'qr') {
          if (Date.now() - lastQr > 280) { lastQr = Date.now(); const code = await scanCode(v); if (code) { await showCode(code); continue; } }
          st.quad = null;
          setHint();
        } else {
          try { st.quad = detectQuad(cv, v, 360); } catch { st.quad = null; }
          trackStability();
        }
      }
      await sleep(st.mode === 'qr' ? 120 : 150);
    }
  }

  function trackStability() {
    const q = st.quad, v = st.video;
    const diag = Math.hypot(v.videoWidth, v.videoHeight);
    if (q && st.prevQuad && q.every((p, i) => Math.hypot(p.x - st.prevQuad[i].x, p.y - st.prevQuad[i].y) < diag * 0.018)) st.stable++;
    else st.stable = 0;
    st.prevQuad = q;
    setHint();
    if (q && st.auto && AUTO_MODES.includes(st.mode) && st.stable >= AUTO_FRAMES && Date.now() - st.lastCapture > 2200) capture();
  }

  /** Animación del visor: guía con forma de documento, láser de escaneo y contorno del documento detectado. */
  function animate() {
    if (st.view !== 'camera' || !root.isConnected) return;
    requestAnimationFrame(animate);
    const c = st.overlay, v = st.video;
    const r = c.getBoundingClientRect();
    if (!r.width) return;
    const dpr = Math.min(devicePixelRatio || 1, 2);
    if (c.width !== Math.round(r.width * dpr) || c.height !== Math.round(r.height * dpr)) { c.width = Math.round(r.width * dpr); c.height = Math.round(r.height * dpr); }
    const g = c.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, r.width, r.height);
    const t = performance.now() / 1000;
    const progress = st.auto && AUTO_MODES.includes(st.mode) && st.quad ? Math.min(1, st.stable / AUTO_FRAMES) : 0;
    st.ring.set(progress);
    if (st.grid) {
      g.strokeStyle = 'rgba(255,255,255,.28)'; g.lineWidth = 1;
      for (const f of [1 / 3, 2 / 3]) { g.beginPath(); g.moveTo(r.width * f, 0); g.lineTo(r.width * f, r.height); g.moveTo(0, r.height * f); g.lineTo(r.width, r.height * f); g.stroke(); }
    }
    // Contorno a mostrar: el detectado (suavizado) o la guía del modo
    let target;
    if (st.quad && st.mode !== 'qr' && v.videoWidth) {
      const k = Math.max(r.width / v.videoWidth, r.height / v.videoHeight);
      const ox = (r.width - v.videoWidth * k) / 2, oy = (r.height - v.videoHeight * k) / 2;
      target = st.quad.map(p => ({ x: ox + p.x * k, y: oy + p.y * k }));
    }
    const guide = guideRect(r.width, r.height, st.mode);
    const shape = target || guide;
    st.shown = st.shown ? st.shown.map((p, i) => ({ x: p.x + (shape[i].x - p.x) * 0.28, y: p.y + (shape[i].y - p.y) * 0.28 })) : shape.map(p => ({ ...p }));
    const q = st.shown;
    const found = !!target;
    const color = found ? (progress >= 0.5 ? '#34d399' : '#8b7dff') : 'rgba(255,255,255,.95)';
    // oscurecer fuera del documento
    g.fillStyle = 'rgba(5,5,12,.42)';
    g.beginPath(); g.rect(0, 0, r.width, r.height); poly(g, q); g.fill('evenodd');
    if (found) { g.fillStyle = progress >= 0.5 ? 'rgba(52,211,153,.12)' : 'rgba(139,125,255,.12)'; g.beginPath(); poly(g, q); g.fill(); }
    // láser: recorre el documento de arriba abajo y vuelve
    const s = (Math.sin(t * (found ? 2.6 : 1.8)) + 1) / 2;
    const L = lerp(q[0], q[3], s), R = lerp(q[1], q[2], s);
    const grad = g.createLinearGradient(L.x, L.y, R.x, R.y);
    grad.addColorStop(0, 'rgba(139,125,255,0)'); grad.addColorStop(0.5, found ? 'rgba(52,211,153,.95)' : 'rgba(167,139,250,.95)'); grad.addColorStop(1, 'rgba(139,125,255,0)');
    g.save(); g.beginPath(); poly(g, q); g.clip();
    g.strokeStyle = grad; g.lineWidth = 3; g.shadowColor = found ? '#34d399' : '#a78bfa'; g.shadowBlur = 18;
    g.beginPath(); g.moveTo(L.x, L.y); g.lineTo(R.x, R.y); g.stroke();
    // estela del láser
    const back = Math.cos(t * (found ? 2.6 : 1.8)) > 0 ? -1 : 1;
    const L2 = lerp(q[0], q[3], Math.max(0, Math.min(1, s + back * 0.08))), R2 = lerp(q[1], q[2], Math.max(0, Math.min(1, s + back * 0.08)));
    const g2 = g.createLinearGradient((L.x + R.x) / 2, (L.y + R.y) / 2, (L2.x + R2.x) / 2, (L2.y + R2.y) / 2);
    g2.addColorStop(0, found ? 'rgba(52,211,153,.28)' : 'rgba(167,139,250,.25)'); g2.addColorStop(1, 'rgba(0,0,0,0)');
    g.shadowBlur = 0; g.fillStyle = g2; g.beginPath(); g.moveTo(L.x, L.y); g.lineTo(R.x, R.y); g.lineTo(R2.x, R2.y); g.lineTo(L2.x, L2.y); g.closePath(); g.fill();
    g.restore();
    // esquinas tipo escáner
    g.strokeStyle = color; g.lineWidth = found ? 4 : 3.5; g.lineCap = 'round'; g.lineJoin = 'round';
    if (found) { g.globalAlpha = 0.85; g.lineWidth = 2; g.beginPath(); poly(g, q); g.stroke(); g.globalAlpha = 1; g.lineWidth = 4.5; }
    for (let i = 0; i < 4; i++) {
      const p = q[i], a = q[(i + 1) % 4], b = q[(i + 3) % 4];
      const la = Math.min(34, dist(p, a) * 0.22), lb = Math.min(34, dist(p, b) * 0.22);
      const pa = towards(p, a, la), pb = towards(p, b, lb);
      g.beginPath(); g.moveTo(pa.x, pa.y); g.lineTo(p.x, p.y); g.lineTo(pb.x, pb.y); g.stroke();
    }
  }

  async function capture() {
    if (!st.video?.videoWidth || st.busy) return;
    st.busy = true;
    st.lastCapture = Date.now(); st.stable = 0;
    st.flashEl.classList.remove('go'); void st.flashEl.offsetWidth; st.flashEl.classList.add('go');
    navigator.vibrate?.(30);
    if (app.settings.scanSound !== false) playScanSound();
    const v = st.video;
    const c = h('canvas'); c.width = v.videoWidth; c.height = v.videoHeight;
    c.getContext('2d').drawImage(v, 0, 0);
    let quad = null;
    try { quad = detectQuad(cv, c, 640); } catch { /* sin detección */ }
    const page = newPage(c, quad);
    if (st.mode === 'id') page.kind = st.idSide ? 'id-back' : 'id-front';
    if (st.mode === 'book') page.kind = 'book';
    if (st.mode === 'passport') page.kind = 'passport';
    await scanAnimation(page);
    st.busy = false;
    st.pages.push(page);
    st.cur = st.pages.length - 1; // la revisión se abre en la página recién capturada
    st.updThumb();
    if (st.mode === 'id') {
      st.idSide = st.idSide ? 0 : 1;
      if (st.idSide) { setHint('Ahora da la vuelta a la tarjeta: REVERSO', 'ok'); toast('Anverso listo ✓ · ahora el reverso'); }
      else review();
      return;
    }
    if (st.mode === 'doc' || st.mode === 'ocr' || st.mode === 'passport') review();
  }

  /** Muestra el documento recortado mientras una barra de escaneo lo recorre (sensación de escáner real). */
  async function scanAnimation(page) {
    const out = processed(page, 1000);
    const img = h('img', { src: out.toDataURL('image/jpeg', 0.75), alt: '' });
    const layer = h('div', { class: 'sc-scanning' },
      h('div', { class: 'sc-paper' }, img, h('i', { class: 'beam' })),
      h('div', { class: 'sc-scan-label' }, h('span', { class: 'spinner sm' }), 'Escaneando documento…'));
    root.append(layer);
    await sleep(1150);
    if (AUTO_MODES.includes(st.mode) && st.mode !== 'doc' && st.mode !== 'passport') {
      // vuela hacia la miniatura
      layer.classList.add('fly');
      await sleep(380);
    }
    layer.remove();
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
      } else if (p.kind === 'passport') {
        out.push(composeCard(c, null, 125, 88));
      } else if (p.kind === 'id-front') {
        const back = st.pages[i + 1]?.kind === 'id-back' ? processed(st.pages[++i], maxSide) : null;
        out.push(composeCard(c, back, 85.6, 54));
      } else out.push(c);
    }
    return out;
  }

  function composeCard(front, back, mmW, mmH) {
    // Hoja A4 a 200 ppp con cada cara a tamaño real (tarjeta 85,6 × 54 mm; pasaporte 125 × 88 mm)
    const W = 1654, H = 2339, cw = Math.round(mmW / 25.4 * 200), ch = Math.round(mmH / 25.4 * 200);
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
        h('button', { class: 'sc-ai-btn', onclick: () => aiRetouch(st.cur, drawBig) }, icon('wand', 18), st.pages[st.cur]?.enhanced ? 'Mejorado con IA ✓' : 'Mejorar con IA'),
        h('button', { class: 'sc-nav l', 'aria-label': 'Anterior', onclick: () => { if (st.cur > 0) { st.cur--; drawBig(); } } }, icon('back')),
        h('button', { class: 'sc-nav r', 'aria-label': 'Siguiente', onclick: () => { if (st.cur < st.pages.length - 1) { st.cur++; drawBig(); } } }, icon('back'))),
      panel,
      strip,
      h('div', { class: 'sc-tools' },
        tool('crop', 'Recortar', () => cropEditor(st.cur, review)),
        tool('filter', 'Filtros', filtersPanel),
        tool('rotr', 'Girar', () => { st.pages[st.cur].rot = (st.pages[st.cur].rot + 90) % 360; drawBig(); }),
        tool('sliders', 'Ajustar', adjustPanel),
        ['passport', 'id-front', 'id-back'].includes(st.pages[st.cur]?.kind) || st.mode === 'passport' ? tool('passport', 'Leer datos', () => readIdData(st.pages[st.cur])) : null,
        tool('text', 'A texto', () => ocrResult(st.pages[st.cur])),
        tool('back', 'Mover', () => { if (st.cur > 0) { [st.pages[st.cur - 1], st.pages[st.cur]] = [st.pages[st.cur], st.pages[st.cur - 1]]; st.cur--; drawBig(); } }),
        tool('trash', 'Borrar', () => { st.pages.splice(st.cur, 1); if (!st.pages.length) return camera(); st.cur = Math.min(st.cur, st.pages.length - 1); drawBig(); }),
        tool('plus', 'Añadir', () => camera())),
    );
    drawBig();
    filtersPanel();
    const cp = st.pages[st.cur];
    if (cp.kind === 'passport' && !cp.dataAsked) { cp.dataAsked = true; setTimeout(() => readIdData(cp), 400); }
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

  /* ---------------- Mejora con IA (Nano Banana) ---------------- */
  async function aiRetouch(index, redraw, { ask = true } = {}) {
    if (app.settings.ai?.provider !== 'gemini' || !app.settings.ai?.key) { toast('La mejora con IA usa tu clave de Gemini: configúrala en Ajustes', 'warn'); return false; }
    const p = st.pages[index];
    const src = processed(p, 2000);
    const b = ask ? busy('Mejorando el escaneo con IA (Nano Banana)…', { cancellable: true }) : null;
    let result;
    try { result = await enhanceCanvas(app.settings.ai, src, b?.signal); }
    catch (e) { b?.done(); if (e.message !== 'Cancelado') toast(e.message, 'err'); return false; }
    b?.done();
    if (ask && !(await compareDialog(src, result))) return false;
    Object.assign(p, { orig: result, quad: fullQuad(result.width, result.height), filter: 'original', rot: 0, bright: 0, contrast: 0, cache: null, thumb: null, enhanced: true });
    redraw?.();
    if (ask) toast('Escaneo mejorado ✓');
    return true;
  }

  /* ---------------- Datos de pasaporte / tarjeta (MRZ) ---------------- */
  async function readIdData(page) {
    const c = processed(page, 2400);
    const b = busy('Leyendo los datos del documento…', { cancellable: true });
    let data = null, mrz = null;
    try {
      if (app.settings.ai?.key) {
        const img = { mime: 'image/jpeg', data: c.toDataURL('image/jpeg', 0.9).split(',')[1] };
        const out = await complete(app.settings.ai, {
          system: 'Extraes datos de documentos de identidad. Respondes solo JSON válido.',
          user: 'Extrae los datos de este pasaporte o documento de identidad. Devuelve un objeto JSON con: "mrz" (array con las líneas de la zona de lectura mecánica copiadas carácter por carácter, con los "<"), "surname", "givenNames", "number", "nationality", "birthDate" (AAAA-MM-DD), "sex" (M/F/X), "expiryDate" (AAAA-MM-DD), "issuer", "birthPlace". Usa "" si un dato no aparece.',
          images: [img], json: true, maxTokens: 2000, signal: b.signal,
        });
        data = JSON.parse(out.replace(/^```(?:json)?|```$/g, '').trim());
        mrz = data.mrz?.length ? parseMRZ(data.mrz.join('\n')) : null;
      }
      if (!mrz) {
        // MRZ con el OCR del teléfono: franja inferior del documento
        const strip = h('canvas'); strip.width = c.width; strip.height = Math.round(c.height * 0.32);
        strip.getContext('2d').drawImage(c, 0, c.height - strip.height, c.width, strip.height, 0, 0, c.width, strip.height);
        mrz = parseMRZ(await ocrImage(strip, 'eng'));
      }
    } catch (e) { b.done(); if (e.message !== 'Cancelado') toast('No se pudieron leer los datos: ' + e.message, 'err'); return; }
    b.done();
    // Los datos de la MRZ validados con dígitos de control tienen prioridad
    const merged = { ...(data || {}) };
    if (mrz) for (const k of Object.keys(FIELD_LABELS)) if (mrz[k]) merged[k] = mrz[k];
    delete merged.mrz;
    if (!Object.keys(FIELD_LABELS).some(k => merged[k])) return toast('No se encontraron datos legibles. Acerca la cámara a la página de la foto.', 'warn');
    const checks = mrz ? Object.values(mrz.valid).every(Boolean) : null;
    const rows = Object.entries(FIELD_LABELS).filter(([k]) => merged[k]).map(([k, l]) => h('div', { class: 'id-row' }, h('span', { class: 'muted small' }, l), h('b', {}, merged[k])));
    const add = h('input', { type: 'checkbox' }); add.checked = true;
    const v = await modal('Datos del documento', h('div', { class: 'stack' },
      checks === null ? h('p', { class: 'small muted' }, 'Leído por la IA (sin zona MRZ verificable).')
        : h('p', { class: 'badge-line ' + (checks ? 'ok' : 'warn') }, checks ? '✓ Zona MRZ verificada con los dígitos de control' : '⚠ Revisa los datos: algún dígito de control no coincide'),
      h('div', { class: 'id-card' }, rows),
      h('label', { class: 'row small' }, add, ' Añadir una hoja con estos datos al PDF')),
    [{ label: 'Copiar', value: 'copy' }, { label: 'Listo', value: 'ok', primary: true }], { wide: true });
    st.idData = { ...merged, addSheet: add.checked };
    if (v === 'copy') { await navigator.clipboard.writeText(Object.entries(FIELD_LABELS).filter(([k]) => merged[k]).map(([k, l]) => `${l}: ${merged[k]}`).join('\n')).catch(() => {}); toast('Datos copiados'); }
  }

  /* ---------------- Guardar ---------------- */
  async function saveDialog() {
    const defName = (st.pages.some(p => p.kind?.startsWith('id')) ? 'Tarjeta ' : st.pages.some(p => p.kind === 'passport') ? 'Pasaporte ' : 'Escaneo ') + new Date().toLocaleString('es').replace(/[/:]/g, '-').replace(',', '');
    const name = h('input', { value: defName });
    let firstText = '';
    let size = app.settings.scanPageSize || 'fit', quality = app.settings.scanQuality || 'normal', format = 'pdf';
    const ocr = h('input', { type: 'checkbox' }); ocr.checked = app.settings.scanOcr ?? true;
    const hasAI = app.settings.ai?.provider === 'gemini' && !!app.settings.ai?.key;
    const enh = h('input', { type: 'checkbox' }); enh.checked = hasAI && (app.settings.scanEnhance ?? false);
    const ok = await modal('Guardar escaneo', h('div', { class: 'stack' },
      field('Nombre', name),
      field('Formato', seg([['pdf', 'PDF'], ['jpg', 'Imágenes JPG']], format, v => { format = v; })),
      field('Tamaño de página', select([['fit', 'Igual que el documento'], ['A4', 'A4'], ['Carta', 'Carta'], ['Oficio', 'Oficio'], ['Legal', 'Legal']], size, v => { size = v; })),
      field('Calidad', seg([['high', 'Alta'], ['normal', 'Normal'], ['small', 'Compacta']], quality, v => { quality = v; })),
      h('label', { class: 'row' }, ocr, h('span', {}, h('b', {}, 'Texto seleccionable (OCR)'), h('br'), h('small', { class: 'muted' }, 'Permite buscar, copiar, traducir y narrar el texto del escaneo.'))),
      hasAI ? h('label', { class: 'row' }, enh, h('span', {}, h('b', {}, '✨ Mejorar todas las páginas con IA'), h('br'), h('small', { class: 'muted' }, 'Nano Banana deja cada página como un escaneo profesional (las ya mejoradas se saltan).'))) : null),
    [{ label: 'Cancelar', value: false }, { label: 'Guardar', value: true, primary: true }]);
    if (!ok) return;
    Object.assign(app.settings, { scanPageSize: size, scanQuality: quality, scanOcr: ocr.checked, scanEnhance: enh.checked }); app.saveSettings();
    if (enh.checked) {
      const eb = busy('Mejorando las páginas con IA…', { cancellable: true });
      let ok = 0;
      for (let i = 0; i < st.pages.length; i++) {
        if (eb.signal.aborted) break;
        if (st.pages[i].enhanced) continue;
        eb.set(`Mejorando página ${i + 1} de ${st.pages.length} con IA…`, i / st.pages.length);
        if (await aiRetouch(i, null, { ask: false })) ok++; else break;
      }
      eb.done();
      if (ok) toast(`${ok} página(s) mejoradas con IA`);
    }
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
            if (!firstText) firstText = lay.text;
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
      // Nombre inteligente con IA si el usuario no escribió uno
      let finalName = name.value;
      if (finalName === defName && app.settings.ai?.key && (firstText || st.idData)) {
        b.set('Poniendo nombre al documento…');
        try {
          const t = (await complete(app.settings.ai, { user: `Propón un nombre de archivo corto (máximo 6 palabras, en español, sin extensión ni comillas) que describa este documento escaneado. Incluye el tipo de documento y el dato más identificativo (nombre, empresa o número). Responde solo con el nombre.\n\n${st.idData ? JSON.stringify(st.idData) : firstText.slice(0, 2500)}`, maxTokens: 60 })).trim().split('\n')[0].replace(/["'.]/g, '').slice(0, 70);
          if (t.length > 3) finalName = t;
        } catch { /* se queda el nombre por defecto */ }
      }
      let pdf = await ops.scanToPdf(images, { pageSize: size, title: finalName });
      if (st.idData?.addSheet) {
        const sheet = await ops.textToPdf(`# Datos del documento\n\n${Object.entries(FIELD_LABELS).filter(([k]) => st.idData[k]).map(([k, l]) => `${l}: ${st.idData[k]}`).join('\n')}`, { pageSize: 'A4' });
        if (sheet) pdf = await ops.merge([pdf, sheet]);
      }
      b.done();
      close();
      await app.saveNew(pdf, finalName, { kind: 'scan' });
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
