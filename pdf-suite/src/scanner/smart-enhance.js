// Mejora "inteligente" gratuita, 100 % en el teléfono (OpenCV): sin internet y sin clave de pago.
// Detecta el tipo de documento y aplica: aumento de resolución, reducción de ruido que respeta bordes,
// eliminación de sombras, balance de blancos, contraste local, enderezado y nitidez.

export const PRESETS = [
  ['auto', 'Automático'], ['paper', 'Papel / texto'], ['card', 'Tarjeta / cédula'], ['photo', 'Foto / colorido'],
];

const del = (...m) => m.forEach(x => x && !x.isDeleted?.() && x.delete());

/** Clasifica la imagen: papel con texto, tarjeta (fondo de color) o foto. */
export function detectPreset(cv, rgb) {
  const small = new cv.Mat();
  const k = 300 / Math.max(rgb.cols, rgb.rows);
  cv.resize(rgb, small, new cv.Size(Math.max(1, Math.round(rgb.cols * k)), Math.max(1, Math.round(rgb.rows * k))), 0, 0, cv.INTER_AREA);
  // Se neutraliza antes el tono del papel (amarillento, azulado…) para no confundirlo con un fondo de color
  const d = small.data, n = d.length / 3;
  const p95 = [0, 1, 2].map(c => { const v = []; for (let i = c; i < d.length; i += 3) v.push(d[i]); v.sort((x, y) => x - y); return Math.max(1, v[Math.floor(v.length * 0.95)]); });
  const top = Math.max(...p95);
  let paper = 0, sat = 0, bright = 0;
  for (let i = 0; i < d.length; i += 3) {
    const r = d[i] * top / p95[0], g = d[i + 1] * top / p95[1], bl = d[i + 2] * top / p95[2];
    const mx = Math.max(r, g, bl), mn = Math.min(r, g, bl);
    const s = mx ? (mx - mn) / mx : 0;
    sat += s;
    if (s < 0.16 && mx > top * 0.45) paper++;
    if (mx > top * 0.45) bright++;
  }
  small.delete();
  const paperFrac = paper / n, meanSat = sat / n;
  // Proporción de tarjeta o pasaporte (apaisada 1,3–1,8): casi nunca es una hoja
  const ratio = rgb.cols / rgb.rows;
  if (ratio > 1.3 && ratio < 1.8 && paperFrac < 0.9) return meanSat > 0.3 ? 'photo' : 'card';
  if (paperFrac > 0.5 && paperFrac / Math.max(1, bright / n) > 0.62) return 'paper';
  if (paperFrac < 0.15 && meanSat > 0.3) return 'photo';
  return 'card';
}

/** Fondo (iluminación) estimado de un canal: se usa para borrar sombras sin tocar la tinta. */
function flattenChannel(cv, plane, ksize) {
  const bg = new cv.Mat();
  const k = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(ksize, ksize));
  cv.dilate(plane, bg, k);
  cv.medianBlur(bg, bg, ksize * 3 + (ksize * 3 % 2 ? 0 : 1));
  const f = new cv.Mat(), b = new cv.Mat();
  plane.convertTo(f, cv.CV_32F); bg.convertTo(b, cv.CV_32F);
  cv.divide(f, b, f, 255);
  f.convertTo(plane, cv.CV_8U);
  del(bg, k, f, b);
}

/** Percentil de luminancia (0–255) sobre una muestra. */
function percentile(cv, rgb, p) {
  const gray = new cv.Mat(); cv.cvtColor(rgb, gray, cv.COLOR_RGB2GRAY);
  const hist = new Uint32Array(256), d = gray.data;
  const step = Math.max(1, Math.floor(d.length / 200000));
  let n = 0;
  for (let i = 0; i < d.length; i += step) { hist[d[i]]++; n++; }
  gray.delete();
  let acc = 0;
  for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc >= n * p) return v; }
  return 255;
}

function applyLUT(cv, mat, fn) {
  const lut = new cv.Mat(1, 256, cv.CV_8UC1);
  for (let i = 0; i < 256; i++) lut.data[i] = Math.max(0, Math.min(255, Math.round(fn(i))));
  cv.LUT(mat, lut, mat);
  lut.delete();
}

/** Balance de blancos: lo más claro de la imagen pasa a blanco neutro (quita tonos amarillos o azulados). */
function whiteBalance(cv, rgb, amount = 1) {
  const ch = new cv.MatVector(); cv.split(rgb, ch);
  const gray = new cv.Mat(); cv.cvtColor(rgb, gray, cv.COLOR_RGB2GRAY);
  const thr = percentile(cv, rgb, 0.95);
  const mask = new cv.Mat(); cv.threshold(gray, mask, Math.max(0, thr - 1), 255, cv.THRESH_BINARY);
  if (cv.countNonZero(mask) > 50) {
    for (let i = 0; i < 3; i++) {
      const c = ch.get(i);
      const m = cv.mean(c, mask)[0] || 255;
      c.convertTo(c, -1, 1 + (Math.min(1.6, 245 / m) - 1) * amount, 0);
      c.delete();
    }
    cv.merge(ch, rgb);
  }
  del(ch, gray, mask);
}

/** Contraste local (CLAHE) sobre la luminosidad, sin alterar los colores. */
function localContrast(cv, rgb, clip, tiles = 8) {
  const lab = new cv.Mat(); cv.cvtColor(rgb, lab, cv.COLOR_RGB2Lab);
  const ch = new cv.MatVector(); cv.split(lab, ch);
  const L = ch.get(0);
  const clahe = new cv.CLAHE(clip, new cv.Size(tiles, tiles));
  clahe.apply(L, L);
  cv.merge(ch, lab); cv.cvtColor(lab, rgb, cv.COLOR_Lab2RGB);
  clahe.delete(); del(L, ch, lab);
}

/** Bordes de la hoja en blanco (quita restos de la mesa o del recorte). */
function whiteBorder(cv, rgb, frac) {
  const bw = Math.max(2, Math.round(Math.min(rgb.cols, rgb.rows) * frac));
  const white = new cv.Scalar(255, 255, 255, 255);
  for (const r of [[0, 0, rgb.cols, bw], [0, rgb.rows - bw, rgb.cols, bw], [0, 0, bw, rgb.rows], [rgb.cols - bw, 0, bw, rgb.rows]]) {
    cv.rectangle(rgb, new cv.Point(r[0], r[1]), new cv.Point(r[0] + r[2], r[1] + r[3]), white, -1);
  }
}

function unsharp(cv, rgb, sigma, amount) {
  const blur = new cv.Mat();
  cv.GaussianBlur(rgb, blur, new cv.Size(0, 0), sigma);
  cv.addWeighted(rgb, 1 + amount, blur, -amount, 0, rgb);
  blur.delete();
}

/** Ángulo de inclinación del texto (grados) a partir de las líneas de texto; 0 si no es fiable. */
function skewAngle(cv, rgb) {
  const k = 1000 / Math.max(rgb.cols, rgb.rows);
  const small = new cv.Mat();
  cv.resize(rgb, small, new cv.Size(Math.round(rgb.cols * Math.min(1, k)), Math.round(rgb.rows * Math.min(1, k))), 0, 0, cv.INTER_AREA);
  const gray = new cv.Mat(); cv.cvtColor(small, gray, cv.COLOR_RGB2GRAY);
  const bin = new cv.Mat(); cv.threshold(gray, bin, 0, 255, cv.THRESH_BINARY_INV | cv.THRESH_OTSU);
  const kern = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(Math.max(15, Math.round(small.cols / 30)), 3));
  cv.morphologyEx(bin, bin, cv.MORPH_CLOSE, kern);
  const cs = new cv.MatVector(), hier = new cv.Mat();
  cv.findContours(bin, cs, hier, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);
  const angles = [];
  for (let i = 0; i < cs.size(); i++) {
    const c = cs.get(i);
    const r = cv.minAreaRect(c);
    c.delete();
    let { width: w, height: hh } = r.size;
    let a = r.angle;
    if (w < hh) { [w, hh] = [hh, w]; a += 90; }
    if (w < small.cols * 0.18 || w / Math.max(1, hh) < 4) continue; // solo líneas de texto largas
    while (a > 45) a -= 90; while (a < -45) a += 90;
    angles.push(a);
  }
  del(small, gray, bin, kern, cs, hier);
  if (angles.length < 3) return 0;
  angles.sort((x, y) => x - y);
  return angles[angles.length >> 1];
}

function rotate(cv, rgb, deg, white = false) {
  const M = cv.getRotationMatrix2D(new cv.Point(rgb.cols / 2, rgb.rows / 2), deg, 1);
  // En papel las esquinas que quedan al girar se rellenan de blanco (repetir el borde deja rayas)
  cv.warpAffine(rgb, rgb, M, new cv.Size(rgb.cols, rgb.rows), cv.INTER_CUBIC, white ? cv.BORDER_CONSTANT : cv.BORDER_REPLICATE, new cv.Scalar(255, 255, 255, 255));
  M.delete();
}

/**
 * Mejora un canvas y devuelve otro. opts: { preset: 'auto'|'paper'|'card'|'photo', strength: 0..1, deskew }
 */
export function smartEnhance(cv, canvas, { preset = 'auto', strength = 0.8, deskew = true } = {}) {
  const src = cv.imread(canvas);
  const rgb = new cv.Mat(); cv.cvtColor(src, rgb, cv.COLOR_RGBA2RGB);
  src.delete();
  const kind = preset === 'auto' ? detectPreset(cv, rgb) : preset;
  const s = Math.max(0, Math.min(1, strength));

  // 1) Más resolución en fotos pequeñas (bicúbico) antes de afinar
  const maxSide = Math.max(rgb.cols, rgb.rows);
  if (maxSide < 1800) {
    const f = Math.min(2, 2000 / maxSide);
    cv.resize(rgb, rgb, new cv.Size(Math.round(rgb.cols * f), Math.round(rgb.rows * f)), 0, 0, cv.INTER_CUBIC);
  }
  const scale = Math.max(rgb.cols, rgb.rows) / 2000;

  // 2) Ruido del sensor y de la compresión, conservando los bordes del texto
  const den = new cv.Mat();
  cv.bilateralFilter(rgb, den, 7, 18 + 22 * s, 6);
  den.copyTo(rgb); den.delete();

  if (kind === 'paper') {
    // 3) Sombras e iluminación desigual fuera, canal a canal (conserva sellos y firmas de color)
    const ch = new cv.MatVector(); cv.split(rgb, ch);
    const ks = Math.max(7, Math.round(11 * scale) | 1);
    for (let i = 0; i < 3; i++) { const c = ch.get(i); flattenChannel(cv, c, ks); c.delete(); }
    cv.merge(ch, rgb); ch.delete();
    // 4) Niveles: tinta más negra y papel blanco con una transición suave (sin aspecto "quemado")
    const black = Math.min(90, percentile(cv, rgb, 0.015));
    const knee = 228 - 18 * s;
    const gamma = 1 + 0.35 * s;
    applyLUT(cv, rgb, (v) => {
      let x = Math.max(0, (v - black) / (255 - black));
      x = Math.pow(x, gamma);
      let y = x * 255;
      if (y > knee) y = knee + (255 - knee) * Math.min(1, ((y - knee) / (255 - knee)) * (1.6 + s));
      return y;
    });
    if (deskew) { const a = skewAngle(cv, rgb); if (Math.abs(a) > 0.25 && Math.abs(a) < 8) rotate(cv, rgb, a, true); }
    whiteBorder(cv, rgb, 0.012);
    unsharp(cv, rgb, 1.1 * Math.max(1, scale), 0.55 + 0.5 * s);
  } else {
    // Tarjetas y fotos: color fiel, sin blanquear el fondo. Primero más limpieza de ruido (el contraste lo amplificaría)
    cv.medianBlur(rgb, rgb, 3);
    const den2 = new cv.Mat(); cv.bilateralFilter(rgb, den2, 9, 35 + 30 * s, 7); den2.copyTo(rgb); den2.delete();
    whiteBalance(cv, rgb, 0.45);
    localContrast(cv, rgb, kind === 'photo' ? 1.0 + 0.6 * s : 1.2 + 0.8 * s, 4);
    const den3 = new cv.Mat(); cv.bilateralFilter(rgb, den3, 5, 22, 5); den3.copyTo(rgb); den3.delete(); // grano que deja el contraste
    if (kind === 'card' && deskew) { const a = skewAngle(cv, rgb); if (Math.abs(a) > 0.3 && Math.abs(a) < 6) rotate(cv, rgb, a); }
    // un poco más de viveza en los colores
    const hsv = new cv.Mat(); cv.cvtColor(rgb, hsv, cv.COLOR_RGB2HSV);
    const ch = new cv.MatVector(); cv.split(hsv, ch);
    const S = ch.get(1); S.convertTo(S, -1, 1 + 0.18 * s, 0);
    cv.merge(ch, hsv); cv.cvtColor(hsv, rgb, cv.COLOR_HSV2RGB);
    del(S, ch, hsv);
    unsharp(cv, rgb, 1.4 * Math.max(1, scale), 0.3 + 0.3 * s);
  }

  const out = document.createElement('canvas');
  cv.imshow(out, rgb);
  rgb.delete();
  out.kind = kind;
  return out;
}
