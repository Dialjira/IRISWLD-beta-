// Visor de páginas con zoom de dos dedos (pellizco), doble toque y desplazamiento libre en ambas direcciones.
import { h } from './ui.js';
import { renderPage } from './lib/pdfview.js';

const MIN = 0.5, MAX = 5;
const clamp = (z) => Math.max(MIN, Math.min(MAX, z));

/**
 * Crea el visor. opts: { pdf, zoom, scroll, onZoom(z), onScroll({left, top}), onPageDblTap(n) }
 * Devuelve { el, setZoom(z, cx, cy), goTo(n), container }
 */
export function createViewer({ pdf, zoom = 1, scroll = null, onZoom = () => {}, onScroll = () => {} }) {
  let z = clamp(zoom);
  const inner = h('div', { class: 'viewer-inner' });
  const box = h('div', { class: 'viewer', tabindex: 0, 'aria-label': 'Documento' }, inner);
  const cards = [];
  let baseW = 0;

  for (let i = 1; i <= pdf.numPages; i++) {
    const cv = h('canvas', { class: 'page-canvas', 'aria-label': 'Página ' + i });
    const card = h('div', { class: 'page-card', 'data-page': i }, cv, h('div', { class: 'page-num' }, `${i} / ${pdf.numPages}`));
    card.renderedZoom = 0;
    cards.push(card);
    inner.append(card);
  }

  // Tamaño de cada página antes de dibujarla (evita saltos al hacer scroll)
  (async () => {
    for (const card of cards) {
      const p = await pdf.getPage(+card.dataset.page);
      const vp = p.getViewport({ scale: 1 });
      card.style.aspectRatio = `${vp.width} / ${vp.height}`;
    }
  })().catch(() => {});

  const layout = () => {
    baseW = Math.min(box.clientWidth || innerWidth, 1100) - 8;
    inner.style.width = Math.round(baseW * z) + 'px';
  };

  async function draw(card) {
    if (card.drawing || card.renderedZoom === z) return;
    card.drawing = true;
    const want = z;
    try {
      const n = +card.dataset.page;
      const p = await pdf.getPage(n);
      const w1 = p.getViewport({ scale: 1 }).width;
      // Resolución limitada para no agotar la memoria con zoom alto
      const scale = Math.min(baseW * want / w1, 4096 / (w1 * Math.min(devicePixelRatio || 1, 2)));
      const tmp = document.createElement('canvas');
      await renderPage(pdf, n, tmp, scale);
      const cv = card.querySelector('canvas');
      cv.width = tmp.width; cv.height = tmp.height;
      cv.getContext('2d').drawImage(tmp, 0, 0);
      card.renderedZoom = want;
    } catch { /* página no disponible */ }
    card.drawing = false;
    if (card.visible && card.renderedZoom !== z) draw(card);
  }

  const io = new IntersectionObserver((entries) => {
    for (const e of entries) { e.target.visible = e.isIntersecting; if (e.isIntersecting) draw(e.target); }
  }, { root: box, rootMargin: '400px' });
  cards.forEach(c => io.observe(c));

  let redrawT;
  /** Cambia el zoom manteniendo fijo el punto (cx, cy) de la pantalla. */
  function setZoom(nz, cx = box.clientWidth / 2, cy = box.clientHeight / 2) {
    nz = clamp(nz);
    const k = nz / z;
    const left = (box.scrollLeft + cx) * k - cx, top = (box.scrollTop + cy) * k - cy;
    z = nz;
    layout();
    box.scrollLeft = left; box.scrollTop = top;
    onZoom(z);
    clearTimeout(redrawT);
    redrawT = setTimeout(() => cards.filter(c => c.visible).forEach(draw), 120);
  }

  // Pellizco con dos dedos: escala visual inmediata y redibujado nítido al soltar
  let pinch = null;
  const dist = (t) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
  box.addEventListener('touchstart', (e) => {
    if (e.touches.length === 2) {
      const r = box.getBoundingClientRect();
      pinch = { d0: dist(e.touches), z0: z, cx: (e.touches[0].clientX + e.touches[1].clientX) / 2 - r.left, cy: (e.touches[0].clientY + e.touches[1].clientY) / 2 - r.top };
      inner.style.transformOrigin = `${box.scrollLeft + pinch.cx}px ${box.scrollTop + pinch.cy}px`;
    }
  }, { passive: true });
  box.addEventListener('touchmove', (e) => {
    if (!pinch || e.touches.length !== 2) return;
    e.preventDefault();
    const f = clamp(pinch.z0 * dist(e.touches) / pinch.d0) / pinch.z0;
    pinch.f = f;
    inner.style.transform = `scale(${f})`;
  }, { passive: false });
  const endPinch = () => {
    if (!pinch) return;
    const { z0, f = 1, cx, cy } = pinch;
    pinch = null;
    inner.style.transform = ''; inner.style.transformOrigin = '';
    if (Math.abs(f - 1) > 0.01) { z = z0; setZoom(z0 * f, cx, cy); }
  };
  box.addEventListener('touchend', (e) => { if (e.touches.length < 2) endPinch(); });
  box.addEventListener('touchcancel', endPinch);

  // Doble toque: acercar al punto tocado o volver a ajustar al ancho
  let lastTap = 0;
  box.addEventListener('click', (e) => {
    const now = Date.now();
    if (now - lastTap < 300) {
      const r = box.getBoundingClientRect();
      setZoom(z > 1.2 ? 1 : 2.5, e.clientX - r.left, e.clientY - r.top);
      lastTap = 0;
    } else lastTap = now;
  });

  // Ctrl + rueda (o gesto del trackpad) en pantallas grandes
  box.addEventListener('wheel', (e) => {
    if (!e.ctrlKey) return;
    e.preventDefault();
    const r = box.getBoundingClientRect();
    setZoom(z * (e.deltaY < 0 ? 1.12 : 1 / 1.12), e.clientX - r.left, e.clientY - r.top);
  }, { passive: false });

  let scrollT;
  box.addEventListener('scroll', () => { clearTimeout(scrollT); scrollT = setTimeout(() => onScroll({ left: box.scrollLeft, top: box.scrollTop }), 150); });

  requestAnimationFrame(() => {
    layout();
    if (scroll) { box.scrollLeft = scroll.left; box.scrollTop = scroll.top; }
  });
  window.addEventListener('resize', layout);

  return {
    el: box, container: box,
    get zoom() { return z; },
    setZoom,
    goTo(n) { const c = cards[n - 1]; if (c) box.scrollTo({ top: c.offsetTop - 8, behavior: 'smooth' }); },
  };
}
