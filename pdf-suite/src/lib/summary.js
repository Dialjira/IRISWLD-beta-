// Resumen corto de cada documento ("de qué trata"), hecho con IA en segundo plano, de uno en uno.
import { openPdf, pageText } from './pdfview.js';
import { complete } from './ai.js';
import * as store from './store.js';

const queue = [];
let running = false, pausedUntil = 0;
const listeners = new Set();
export const onSummary = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };

/** Describe el documento en una frase a partir del texto y de la imagen de la primera página. */
export async function summarizeBytes(cfg, bytes) {
  const pdf = await openPdf(bytes);
  try {
    let text = '';
    for (let i = 1; i <= Math.min(2, pdf.numPages); i++) text += (await pageText(pdf, i)) + '\n';
    const page = await pdf.getPage(1);
    const vp1 = page.getViewport({ scale: 1 });
    const vp = page.getViewport({ scale: 900 / Math.max(vp1.width, vp1.height) });
    const c = document.createElement('canvas'); c.width = Math.round(vp.width); c.height = Math.round(vp.height);
    const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
    await page.render({ canvasContext: g, viewport: vp }).promise;
    const img = { mime: 'image/jpeg', data: c.toDataURL('image/jpeg', 0.7).split(',')[1] };
    const out = await complete(cfg, {
      system: 'Describes documentos en una sola frase breve y útil para reconocerlos en una lista de archivos.',
      user: `Di en una sola frase (máximo 20 palabras, en español) de qué trata este documento: tipo de documento, de quién o para quién, y el dato clave (asunto, fecha o importe). Sin comillas ni introducciones.${text.trim() ? `\n\nTexto de las primeras páginas:\n${text.slice(0, 3000)}` : ''}`,
      images: [img], maxTokens: 120,
    });
    return out.trim().split('\n')[0].replace(/^["“'«]|["”'»]$/g, '').slice(0, 220);
  } finally { pdf.destroy(); }
}

/** Añade documentos a la cola (si hay IA configurada). */
export function queueSummaries(cfg, ids) {
  if (!cfg?.key) return;
  for (const id of ids) if (!queue.includes(id)) queue.push(id);
  run(cfg);
}

async function run(cfg) {
  if (running) return;
  running = true;
  try {
    while (queue.length) {
      if (Date.now() < pausedUntil) break;
      const id = queue.shift();
      try {
        const summary = await summarizeBytes(cfg, await store.loadBytes(id));
        if (summary) { await store.updateMeta(id, { summary }); listeners.forEach(fn => fn(id, summary)); }
      } catch (e) {
        // límite de uso o sin red: se deja para más tarde sin insistir
        if (/límite|cuota|429|saturad|red|fetch/i.test(e.message || '')) { pausedUntil = Date.now() + 5 * 60e3; queue.unshift(id); break; }
        await store.updateMeta(id, { summary: '' , summaryFailed: true }).catch(() => {});
      }
    }
  } finally { running = false; }
}
