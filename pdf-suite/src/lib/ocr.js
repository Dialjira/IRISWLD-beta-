// OCR en el dispositivo con Tesseract. El motor va dentro de la app; los idiomas se descargan una vez y quedan guardados.
import { createWorker } from 'tesseract.js';

// rutas absolutas: el worker resuelve las relativas desde su propia carpeta
const abs = (p) => new URL(import.meta.env.BASE_URL + p, location.href).href;
let worker = null, workerLangs = '', progressCb = () => {};

async function getWorker(langs) {
  if (!worker || workerLangs !== langs) {
    if (worker) await worker.terminate();
    worker = await createWorker(langs, 1, {
      workerPath: abs('tesseract/worker.min.js'),
      corePath: abs('tesseract/'),
      langPath: 'https://tessdata.projectnaptha.com/4.0.0_fast',
      logger: (m) => { if (m.status === 'recognizing text') progressCb(m.progress); },
    });
    workerLangs = langs;
  }
  return worker;
}

const clean = (t) => t.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();

export async function ocrImage(image, langs = 'spa+eng', onProgress = () => {}) {
  const w = await getWorker(langs);
  progressCb = onProgress;
  const { data } = await w.recognize(image);
  return clean(data.text);
}

/**
 * OCR con posiciones: devuelve el texto y cada línea/palabra con su caja en píxeles de la imagen.
 * Sirve para hacer el PDF buscable y para editar el texto de páginas escaneadas.
 */
export async function ocrLayout(image, langs = 'spa+eng', onProgress = () => {}) {
  const w = await getWorker(langs);
  progressCb = onProgress;
  const { data } = await w.recognize(image, {}, { text: true, blocks: true });
  const lines = [];
  for (const b of data.blocks || []) for (const p of b.paragraphs || []) for (const l of p.lines || []) {
    const text = l.text.replace(/\s+$/, '');
    if (!text.trim() || l.confidence < 50) continue; // descarta ruido (fotos, sellos, tramas)
    lines.push({
      text, bbox: l.bbox, confidence: l.confidence, para: p,
      words: (l.words || []).filter(wd => wd.text.trim() && wd.confidence > 40).map(wd => ({ text: wd.text, bbox: wd.bbox })),
    });
  }
  // Agrupa en párrafos para el texto plano
  let text = '', lastPara = null;
  for (const l of lines) { text += (lastPara && l.para !== lastPara ? '\n\n' : text ? '\n' : '') + l.text; lastPara = l.para; }
  lines.forEach(l => delete l.para);
  return { text: clean(text), lines };
}

export async function ocrDispose() { if (worker) { await worker.terminate(); worker = null; } }
