// Mejora de escaneos: Nano Banana (modelo de imagen de Gemini) o la mejora gratuita en el teléfono.
import { h, modal, seg } from './ui.js';
import { geminiImageEdit } from './lib/gemini.js';
import { complete } from './lib/ai.js';
import { loadCV } from './scanner/cv.js';
import { smartEnhance, PRESETS } from './scanner/smart-enhance.js';

export const ENGINES = [['auto', 'Automático'], ['free', 'Gratuita (en el teléfono)'], ['ai', 'Nano Banana']];

export const ENHANCE_PROMPT = [
  'Convierte esta foto de un documento en un escaneo profesional, como si se hubiera hecho con un escáner plano de oficina de alta calidad.',
  'Corrige: sombras, reflejos, iluminación desigual, manchas, arrugas, dobleces, dedos, bordes del fondo, desenfoque leve y ruido.',
  'Resultado: papel blanco limpio y uniforme con su textura natural sutil, tinta negra nítida y bien definida, colores fieles en sellos, logotipos, firmas y fotos.',
  'Debe parecer un escaneo real: sin aspecto de ilustración, sin suavizado artificial, sin halos, sin brillos ni efectos.',
  'Mantén exactamente el mismo encuadre, proporción, márgenes, posición y tamaño de cada elemento.',
  'MUY IMPORTANTE: no cambies, añadas, borres, traduzcas ni inventes ningún texto, número, letra, firma, sello, foto, código ni elemento. Cada carácter debe quedar idéntico al original.',
  'Devuelve solo la imagen.',
].join(' ');

const isGemini = (cfg) => cfg?.provider === 'gemini' && !!cfg?.key;
// Errores que no se arreglan reintentando: sin cuota, sin acceso al modelo o modelo inexistente
const noImageAccess = (e) => /cuota|no tiene acceso|no tiene un modelo|429|404|permiso|billing|factura/i.test(e?.message || '');

/**
 * Análisis gratuito con el modelo de texto (Flash-Lite, con cuota gratuita): solo dice qué ajuste conviene.
 * Devuelve { preset, strength } o null.
 */
export async function analyzeForEnhance(cfg, src, signal) {
  if (!isGemini(cfg)) return null;
  const k = 640 / Math.max(src.width, src.height);
  const c = document.createElement('canvas'); c.width = Math.round(src.width * k); c.height = Math.round(src.height * k);
  c.getContext('2d').drawImage(src, 0, 0, c.width, c.height);
  try {
    const out = await Promise.race([
      complete(cfg, {
        system: 'Analizas fotos de documentos para elegir el mejor ajuste de escaneo. Respondes solo JSON.',
        user: 'Mira esta foto de un documento y responde un JSON con: "tipo" ("papel" si es una hoja con texto sobre fondo blanco o claro; "tarjeta" si es una cédula, carné, tarjeta o documento con fondo de color o fotos; "foto" si es sobre todo una imagen), "sombras" (true/false), "problemas" (0 a 3: 0 imagen ya limpia, 3 muy mala: oscura, amarillenta, con sombras o borrosa).',
        images: [{ mime: 'image/jpeg', data: c.toDataURL('image/jpeg', 0.7).split(',')[1] }], json: true, maxTokens: 200, signal,
      }),
      new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 15000)),
    ]);
    const j = JSON.parse(out.replace(/^```(?:json)?|```$/g, '').trim());
    const preset = { papel: 'paper', tarjeta: 'card', foto: 'photo' }[String(j.tipo || '').toLowerCase()] || 'auto';
    const p = Math.max(0, Math.min(3, Number(j.problemas) || 1));
    return { preset, strength: 0.55 + p * 0.15 + (j.sombras ? 0.05 : 0) };
  } catch { return null; }
}

/** Mejora gratuita en el teléfono (con el análisis de la IA si hay clave). */
export async function enhanceFree(cfg, src, { preset, strength, signal, analyze = true, hint } = {}) {
  const { cv } = await loadCV();
  let tune = { preset: preset || hint || 'auto', strength: strength ?? 0.8 };
  if (!preset && !hint && analyze) { const a = await analyzeForEnhance(cfg, src, signal); if (a) tune = a; }
  const out = smartEnhance(cv, src, tune);
  out.engine = 'free';
  out.tune = { ...tune, preset: tune.preset === 'auto' ? out.kind : tune.preset };
  return out;
}

/** Mejora con Nano Banana. Devuelve un canvas del mismo tamaño que el original. */
async function enhanceAI(cfg, src, signal) {
  const data = src.toDataURL('image/jpeg', 0.92).split(',')[1];
  const r = await geminiImageEdit(cfg, { mime: 'image/jpeg', data }, ENHANCE_PROMPT, signal, { width: src.width, height: src.height });
  const img = new Image();
  img.src = `data:${r.mime};base64,${r.data}`;
  await img.decode();
  const out = document.createElement('canvas');
  out.width = src.width; out.height = src.height;
  const g = out.getContext('2d');
  g.imageSmoothingQuality = 'high';
  g.drawImage(img, 0, 0, src.width, src.height);
  out.engine = 'ai'; out.model = r.model;
  return out;
}

/**
 * Mejora un canvas según el motor elegido en Ajustes (cfg.enhanceEngine):
 * 'auto' = Nano Banana y, si no hay cuota o acceso, la gratuita; 'free' = siempre gratuita; 'ai' = solo Nano Banana.
 * El canvas devuelto lleva .engine ('ai' | 'free') y .fallback (motivo si se cambió a la gratuita).
 */
export async function enhanceCanvas(cfg, src, signal, { hint } = {}) {
  const engine = cfg?.enhanceEngine || 'auto';
  if (engine === 'free' || !isGemini(cfg)) return enhanceFree(cfg, src, { signal, hint });
  try { return await enhanceAI(cfg, src, signal); }
  catch (e) {
    if (engine === 'ai' || signal?.aborted || !noImageAccess(e)) throw e;
    const out = await enhanceFree(cfg, src, { signal, hint });
    out.fallback = e.message;
    return out;
  }
}

/**
 * Comparador antes/después. Con la mejora gratuita permite cambiar el tipo y la intensidad al momento.
 * Devuelve el canvas aceptado o null.
 */
export async function compareDialog(before, after, { title, note = 'Revisa que todos los textos y números sigan iguales antes de usarlo.', cfg } = {}) {
  let current = after;
  const a = h('img', { alt: 'Después' });
  const bimg = h('img', { src: before.toDataURL('image/jpeg', 0.85), alt: 'Antes' });
  const clip = h('div', { class: 'cmp-before' }, bimg);
  const knob = h('i', { class: 'cmp-knob' });
  const range = h('input', { type: 'range', min: 0, max: 100, value: 50, 'aria-label': 'Comparar antes y después', oninput: () => { clip.style.width = range.value + '%'; knob.style.left = range.value + '%'; } });
  const show = () => { a.src = current.toDataURL('image/jpeg', 0.85); a.onload = () => { bimg.style.width = a.getBoundingClientRect().width + 'px'; }; };
  show();
  const badge = h('p', { class: 'badge-line ' + (after.engine === 'ai' ? 'ok' : 'free') });
  const setBadge = () => {
    badge.textContent = current.engine === 'ai' ? `✨ Mejorado con Nano Banana (${current.model || 'IA'})`
      : current.fallback ? '⚡ Sin cuota para Nano Banana: se usó la mejora gratuita en el teléfono' : '⚡ Mejora gratuita en el teléfono (sin internet)';
  };
  setBadge();
  let tuner = null;
  if (after.engine === 'free') {
    const tune = { ...(after.tune || { preset: 'auto', strength: 0.8 }) };
    let t;
    const redo = () => { clearTimeout(t); t = setTimeout(async () => { current = await enhanceFree(cfg, before, { ...tune, analyze: false }); current.fallback = after.fallback; show(); }, 120); };
    const strength = h('input', { type: 'range', min: 20, max: 100, value: Math.round(tune.strength * 100), 'aria-label': 'Intensidad', oninput: () => { tune.strength = strength.value / 100; redo(); } });
    tuner = h('div', { class: 'stack tight' },
      seg(PRESETS.filter(([k]) => k !== 'auto'), tune.preset, v => { tune.preset = v; redo(); }),
      h('label', { class: 'row small' }, h('span', {}, 'Intensidad'), strength));
  }
  const ok = await modal(title || (after.engine === 'ai' ? 'Mejora con IA' : 'Mejora del escaneo'), h('div', { class: 'stack' },
    badge,
    h('div', { class: 'cmp' }, a, clip, knob, h('span', { class: 'cmp-l' }, 'Antes'), h('span', { class: 'cmp-r' }, 'Después')), range,
    tuner, h('p', { class: 'small muted' }, note)),
  [{ label: 'Descartar', value: false }, { label: 'Usar mejora', value: true, primary: true }], { wide: true });
  return ok ? current : null;
}
