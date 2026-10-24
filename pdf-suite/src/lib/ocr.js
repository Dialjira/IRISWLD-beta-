// OCR en el dispositivo con Tesseract. El motor va dentro de la app; los idiomas se descargan una vez y quedan guardados.
import { createWorker } from 'tesseract.js';

// rutas absolutas: el worker resuelve las relativas desde su propia carpeta
const abs = (p) => new URL(import.meta.env.BASE_URL + p, location.href).href;
let worker = null, workerLangs = '';

export async function ocrImage(image, langs = 'spa+eng', onProgress = () => {}) {
  if (!worker || workerLangs !== langs) {
    if (worker) await worker.terminate();
    worker = await createWorker(langs, 1, {
      workerPath: abs('tesseract/worker.min.js'),
      corePath: abs('tesseract/'),
      langPath: 'https://tessdata.projectnaptha.com/4.0.0_fast',
      logger: (m) => { if (m.status === 'recognizing text') onProgress(m.progress); },
    });
    workerLangs = langs;
  }
  const { data } = await worker.recognize(image);
  return data.text.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

export async function ocrDispose() { if (worker) { await worker.terminate(); worker = null; } }
