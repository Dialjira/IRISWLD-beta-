// Visión por computador del escáner con OpenCV: detección de bordes, perspectiva y filtros.
const BASE = import.meta.env.BASE_URL;
let cvPromise = null;

/** Carga OpenCV (≈10 MB) solo cuando se abre el escáner. Devuelve { cv }. */
export function loadCV() {
  if (cvPromise) return cvPromise;
  cvPromise = new Promise((resolve, reject) => {
    // Se entrega envuelto: resolver una promesa con el módulo (thenable) lo dejaría esperando para siempre
    const ready = (cv) => resolve({ cv });
    const s = document.createElement('script');
    s.src = BASE + 'opencv/opencv.js';
    s.async = true;
    s.onerror = () => { cvPromise = null; reject(new Error('No se pudo cargar el motor del escáner')); };
    s.onload = () => {
      // Ojo: el módulo de Emscripten es "thenable" y se resuelve a sí mismo; un await lo deja colgado
      const start = Date.now();
      const poll = () => {
        const cv = window.cv;
        if (cv && cv.Mat) return ready(cv);
        if (Date.now() - start > 60000) { cvPromise = null; return reject(new Error('El motor del escáner tardó demasiado en iniciar')); }
        setTimeout(poll, 50);
      };
      poll();
    };
    document.head.append(s);
  });
  return cvPromise;
}

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

/** Ordena 4 puntos como sup-izq, sup-der, inf-der, inf-izq. */
export function orderQuad(pts) {
  const bySum = [...pts].sort((a, b) => (a.x + a.y) - (b.x + b.y));
  const byDiff = [...pts].sort((a, b) => (a.y - a.x) - (b.y - b.x));
  return [bySum[0], byDiff[0], bySum[3], byDiff[3]];
}

export function fullQuad(w, h, inset = 0) {
  const ix = w * inset, iy = h * inset;
  return [{ x: ix, y: iy }, { x: w - ix, y: iy }, { x: w - ix, y: h - iy }, { x: ix, y: h - iy }];
}

function isConvex(q) {
  let sign = 0;
  for (let i = 0; i < 4; i++) {
    const a = q[i], b = q[(i + 1) % 4], c = q[(i + 2) % 4];
    const cross = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
    if (cross !== 0) { if (sign && Math.sign(cross) !== sign) return false; sign = Math.sign(cross); }
  }
  return true;
}

/**
 * Busca el documento en la imagen. Devuelve 4 puntos en coordenadas de `source` o null.
 * Borra el texto con un cierre morfológico para que solo queden los bordes del papel.
 */
export function detectQuad(cv, source, maxSide = 480) {
  const sw = source.videoWidth || source.naturalWidth || source.width, sh = source.videoHeight || source.naturalHeight || source.height;
  if (!sw || !sh) return null;
  const k = Math.min(1, maxSide / Math.max(sw, sh));
  const w = Math.round(sw * k), hgt = Math.round(sh * k);
  const c = document.createElement('canvas'); c.width = w; c.height = hgt;
  c.getContext('2d', { willReadFrequently: true }).drawImage(source, 0, 0, w, hgt);
  const mats = [];
  const M = (m) => (mats.push(m), m);
  try {
    const src = M(cv.imread(c));
    const gray = M(new cv.Mat());
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
    const kernel = M(cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(7, 7)));
    cv.morphologyEx(gray, gray, cv.MORPH_CLOSE, kernel, new cv.Point(-1, -1), 3);
    cv.GaussianBlur(gray, gray, new cv.Size(5, 5), 0);
    const edges = M(new cv.Mat());
    cv.Canny(gray, edges, 30, 120);
    cv.dilate(edges, edges, M(cv.getStructuringElement(cv.MORPH_ELLIPSE, new cv.Size(5, 5))));
    const contours = M(new cv.MatVector()), hier = M(new cv.Mat());
    cv.findContours(edges, contours, hier, cv.RETR_LIST, cv.CHAIN_APPROX_SIMPLE);
    const minArea = w * hgt * 0.15;
    const cands = [];
    for (let i = 0; i < contours.size(); i++) {
      const cnt = contours.get(i);
      const area = cv.contourArea(cnt);
      if (area >= minArea) cands.push({ cnt, area }); else cnt.delete();
    }
    cands.sort((a, b) => b.area - a.area);
    let best = null;
    for (const { cnt } of cands.slice(0, 8)) {
      const peri = cv.arcLength(cnt, true);
      for (const eps of [0.02, 0.035, 0.05]) {
        const approx = new cv.Mat();
        cv.approxPolyDP(cnt, approx, eps * peri, true);
        if (approx.rows === 4) {
          const pts = [];
          for (let j = 0; j < 4; j++) pts.push({ x: approx.data32S[j * 2] / k, y: approx.data32S[j * 2 + 1] / k });
          const q = orderQuad(pts);
          if (isConvex(q)) best = q;
        }
        approx.delete();
        if (best) break;
      }
      if (best) break;
    }
    // Sin cuadrilátero claro: rectángulo mínimo del contorno más grande
    if (!best && cands.length && cands[0].area > w * hgt * 0.25) {
      const r = cv.minAreaRect(cands[0].cnt);
      const pts = cv.RotatedRect.points(r).map(p => ({ x: p.x / k, y: p.y / k }));
      best = orderQuad(pts);
    }
    cands.forEach(x => x.cnt.delete());
    if (best) best = best.map(p => ({ x: Math.max(0, Math.min(sw, p.x)), y: Math.max(0, Math.min(sh, p.y)) }));
    return best;
  } finally { mats.forEach(m => m.delete()); }
}

/** Endereza el documento (corrección de perspectiva). Devuelve un canvas nuevo. */
export function warp(cv, srcCanvas, quad, maxSide = 2400) {
  const [tl, tr, br, bl] = quad;
  let W = Math.max(dist(tl, tr), dist(bl, br)), H = Math.max(dist(tl, bl), dist(tr, br));
  const k = Math.min(1, maxSide / Math.max(W, H));
  W = Math.max(10, Math.round(W * k)); H = Math.max(10, Math.round(H * k));
  const src = cv.imread(srcCanvas), dst = new cv.Mat();
  const from = cv.matFromArray(4, 1, cv.CV_32FC2, [tl.x, tl.y, tr.x, tr.y, br.x, br.y, bl.x, bl.y]);
  const to = cv.matFromArray(4, 1, cv.CV_32FC2, [0, 0, W, 0, W, H, 0, H]);
  const T = cv.getPerspectiveTransform(from, to);
  cv.warpPerspective(src, dst, T, new cv.Size(W, H), cv.INTER_LINEAR, cv.BORDER_REPLICATE);
  const out = document.createElement('canvas');
  cv.imshow(out, dst);
  [src, dst, from, to, T].forEach(m => m.delete());
  return out;
}

export const FILTERS = [
  ['original', 'Original'], ['magic', 'Mejorado'], ['nosombra', 'Sin sombras'], ['gray', 'Gris'], ['bw', 'B/N'], ['ink', 'Ahorro tinta'], ['vivid', 'Vívido'],
];

/** Fondo del papel estimado (iluminación): permite borrar sombras y manchas de luz. */
function background(cv, plane) {
  const bg = new cv.Mat();
  const k = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(9, 9));
  cv.dilate(plane, bg, k);
  k.delete();
  cv.medianBlur(bg, bg, 31);
  return bg;
}
function flatten(cv, plane) {
  // plano / fondo × 255: el papel queda blanco y uniforme, la tinta conserva su intensidad
  const bg = background(cv, plane);
  const f = new cv.Mat(), b = new cv.Mat();
  plane.convertTo(f, cv.CV_32F); bg.convertTo(b, cv.CV_32F);
  cv.divide(f, b, f, 255);
  f.convertTo(plane, cv.CV_8U);
  [bg, f, b].forEach(m => m.delete());
}

/** Aplica filtro + brillo/contraste. Devuelve un canvas nuevo. */
export function applyFilter(cv, canvas, filter = 'original', { brightness = 0, contrast = 0 } = {}) {
  const src = cv.imread(canvas);
  let out = new cv.Mat();
  if (filter === 'original') src.copyTo(out);
  else if (filter === 'vivid') {
    const hsv = new cv.Mat(); cv.cvtColor(src, out, cv.COLOR_RGBA2RGB); cv.cvtColor(out, hsv, cv.COLOR_RGB2HSV);
    const ch = new cv.MatVector(); cv.split(hsv, ch);
    const s = ch.get(1); s.convertTo(s, -1, 1.35, 0); const v = ch.get(2); v.convertTo(v, -1, 1.08, 6);
    cv.merge(ch, hsv); cv.cvtColor(hsv, out, cv.COLOR_HSV2RGB);
    [hsv, ch, s, v].forEach(m => m.delete());
  } else if (filter === 'magic' || filter === 'nosombra') {
    const rgb = new cv.Mat(); cv.cvtColor(src, rgb, cv.COLOR_RGBA2RGB);
    const ch = new cv.MatVector(); cv.split(rgb, ch);
    for (let i = 0; i < 3; i++) { const p = ch.get(i); flatten(cv, p); if (filter === 'magic') p.convertTo(p, -1, 1.25, -35); p.delete(); }
    cv.merge(ch, out);
    if (filter === 'magic') { // un poco más de saturación para que sellos y firmas resalten
      const hsv = new cv.Mat(); cv.cvtColor(out, hsv, cv.COLOR_RGB2HSV);
      const hc = new cv.MatVector(); cv.split(hsv, hc); const s = hc.get(1); s.convertTo(s, -1, 1.3, 0); cv.merge(hc, hsv); cv.cvtColor(hsv, out, cv.COLOR_HSV2RGB);
      [hsv, hc, s].forEach(m => m.delete());
    }
    [rgb, ch].forEach(m => m.delete());
  } else {
    const gray = new cv.Mat(); cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
    flatten(cv, gray);
    if (filter === 'gray') { cv.normalize(gray, gray, 0, 255, cv.NORM_MINMAX); gray.copyTo(out); }
    else {
      const block = Math.max(15, (Math.round(Math.min(gray.cols, gray.rows) / 40) | 1));
      cv.adaptiveThreshold(gray, out, 255, cv.ADAPTIVE_THRESH_GAUSSIAN_C, cv.THRESH_BINARY, block, filter === 'ink' ? 18 : 10);
      if (filter === 'ink') { const k = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(2, 2)); cv.dilate(out, out, k); k.delete(); }
    }
    gray.delete();
  }
  if (brightness || contrast) {
    const alpha = 1 + contrast / 100, beta = brightness * 1.6 - (alpha - 1) * 128;
    out.convertTo(out, -1, alpha, beta);
  }
  const c = document.createElement('canvas');
  cv.imshow(c, out);
  src.delete(); out.delete();
  return c;
}

export function rotateCanvas(canvas, deg) {
  deg = ((deg % 360) + 360) % 360;
  if (!deg) return canvas;
  const c = document.createElement('canvas');
  const swap = deg === 90 || deg === 270;
  c.width = swap ? canvas.height : canvas.width; c.height = swap ? canvas.width : canvas.height;
  const g = c.getContext('2d');
  g.translate(c.width / 2, c.height / 2); g.rotate(deg * Math.PI / 180);
  g.drawImage(canvas, -canvas.width / 2, -canvas.height / 2);
  return c;
}
