// Mejora de escaneos con Nano Banana (modelo de imagen de Gemini) y comparador antes/después.
import { h, modal } from './ui.js';
import { geminiImageEdit } from './lib/gemini.js';

export const ENHANCE_PROMPT = [
  'Convierte esta foto de un documento en un escaneo profesional, como si se hubiera hecho con un escáner plano de oficina de alta calidad.',
  'Corrige: sombras, reflejos, iluminación desigual, manchas, arrugas, dobleces, dedos, bordes del fondo, desenfoque leve y ruido.',
  'Resultado: papel blanco limpio y uniforme con su textura natural sutil, tinta negra nítida y bien definida, colores fieles en sellos, logotipos, firmas y fotos.',
  'Debe parecer un escaneo real: sin aspecto de ilustración, sin suavizado artificial, sin halos, sin brillos ni efectos.',
  'Mantén exactamente el mismo encuadre, proporción, márgenes, posición y tamaño de cada elemento.',
  'MUY IMPORTANTE: no cambies, añadas, borres, traduzcas ni inventes ningún texto, número, letra, firma, sello, foto, código ni elemento. Cada carácter debe quedar idéntico al original.',
  'Devuelve solo la imagen.',
].join(' ');

/** Mejora un canvas con IA y devuelve otro canvas del mismo tamaño. */
export async function enhanceCanvas(cfg, src, signal) {
  const data = src.toDataURL('image/jpeg', 0.92).split(',')[1];
  const r = await geminiImageEdit(cfg, { mime: 'image/jpeg', data }, ENHANCE_PROMPT, signal, { width: src.width, height: src.height });
  const img = new Image();
  img.src = `data:${r.mime};base64,${r.data}`;
  await img.decode();
  // Se devuelve al tamaño exacto del original (la IA trabaja en proporciones estándar)
  const out = document.createElement('canvas');
  out.width = src.width; out.height = src.height;
  const g = out.getContext('2d');
  g.imageSmoothingQuality = 'high';
  g.drawImage(img, 0, 0, src.width, src.height);
  out.model = r.model;
  return out;
}

/** Comparador con deslizador. Devuelve true si el usuario acepta el resultado. */
export async function compareDialog(before, after, { title = 'Mejora con IA', note = 'Revisa que todos los textos y números sigan iguales antes de usarlo.' } = {}) {
  const a = h('img', { src: after.toDataURL('image/jpeg', 0.85), alt: 'Después' });
  const bimg = h('img', { src: before.toDataURL('image/jpeg', 0.85), alt: 'Antes' });
  const clip = h('div', { class: 'cmp-before' }, bimg);
  const knob = h('i', { class: 'cmp-knob' });
  const range = h('input', { type: 'range', min: 0, max: 100, value: 50, 'aria-label': 'Comparar antes y después', oninput: () => { clip.style.width = range.value + '%'; knob.style.left = range.value + '%'; } });
  // la imagen "antes" ocupa el mismo ancho que la de "después" aunque esté recortada
  requestAnimationFrame(() => { bimg.style.width = a.getBoundingClientRect().width + 'px'; });
  return modal(title, h('div', { class: 'stack' },
    h('div', { class: 'cmp' }, a, clip, knob, h('span', { class: 'cmp-l' }, 'Antes'), h('span', { class: 'cmp-r' }, 'Después')), range,
    h('p', { class: 'small muted' }, note)),
  [{ label: 'Descartar', value: false }, { label: 'Usar mejora', value: true, primary: true }], { wide: true });
}
