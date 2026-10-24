// Búsqueda profunda de PDF y Word en el almacenamiento del teléfono (plugin nativo DeviceFiles).
// En el navegador se usa el selector de carpetas (si existe) o el de archivos.
import { Capacitor, registerPlugin } from '@capacitor/core';

const DeviceFiles = registerPlugin('DeviceFiles');
export const nativeSearch = () => Capacitor.isNativePlatform();

const EXTS = ['pdf', 'docx', 'doc'];
const extOf = (n) => (n.match(/\.([^.]+)$/)?.[1] || '').toLowerCase();

/** ¿Tiene permiso para leer todo el almacenamiento? */
export async function hasAccess() {
  if (!nativeSearch()) return true;
  try { return (await DeviceFiles.hasAccess()).granted; } catch { return false; }
}

/** Pide el permiso (en Android 11+ abre "Acceso a todos los archivos" en Ajustes). */
export async function requestAccess() {
  if (!nativeSearch()) return true;
  try { return (await DeviceFiles.requestAccess()).granted; } catch { return false; }
}

/**
 * Recorre todo el almacenamiento. onProgress({ dirs, found, current }).
 * Devuelve [{ path, name, size, modified, ext, folder, file? }] ordenados por fecha.
 */
export async function scanDevice(onProgress = () => {}) {
  if (!nativeSearch()) return scanWeb(onProgress);
  const sub = await DeviceFiles.addListener('scanProgress', onProgress);
  try {
    const { files } = await DeviceFiles.scan();
    return files.filter(f => EXTS.includes(f.ext)).sort((a, b) => b.modified - a.modified);
  } finally { sub.remove(); }
}

/** Lee un archivo encontrado por scanDevice. */
export async function readDeviceFile(item) {
  if (item.file) return new Uint8Array(await item.file.arrayBuffer());
  const { data } = await DeviceFiles.read({ path: item.path });
  const bin = atob(data);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Navegador: recorre una carpeta elegida por el usuario (o, sin soporte, deja elegir archivos). */
async function scanWeb(onProgress) {
  const out = [];
  if (window.showDirectoryPicker) {
    let root;
    try { root = await window.showDirectoryPicker(); } catch { return null; }
    let dirs = 0;
    const walk = async (dir, path, depth) => {
      if (depth > 14) return;
      dirs++;
      if (dirs % 20 === 0) onProgress({ dirs, found: out.length, current: path });
      for await (const [name, entry] of dir.entries()) {
        if (name.startsWith('.')) continue;
        if (entry.kind === 'directory') await walk(entry, path + '/' + name, depth + 1);
        else if (EXTS.includes(extOf(name))) {
          const file = await entry.getFile();
          out.push({ path: path + '/' + name, name, size: file.size, modified: file.lastModified, ext: extOf(name), folder: path, file });
        }
      }
    };
    await walk(root, root.name, 0);
  } else {
    const files = await new Promise(resolve => {
      const inp = Object.assign(document.createElement('input'), { type: 'file', multiple: true, accept: '.pdf,.docx,.doc,application/pdf' });
      inp.onchange = () => resolve([...inp.files]);
      inp.oncancel = () => resolve([]);
      inp.click();
    });
    if (!files.length) return null;
    for (const file of files) {
      const ext = extOf(file.name);
      if (EXTS.includes(ext)) out.push({ path: file.name, name: file.name, size: file.size, modified: file.lastModified, ext, folder: '', file });
    }
  }
  return out.sort((a, b) => b.modified - a.modified);
}

/** Convierte un .docx en texto con marcas de título ("# ") y listas ("- ") para textToPdf. */
export async function docxToText(bytes) {
  const mammoth = (await import('mammoth/mammoth.browser.js')).default;
  const { value: html } = await mammoth.convertToHtml({ arrayBuffer: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) });
  return htmlToMarked(html);
}

export function htmlToMarked(html) {
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
  const lines = [];
  const txt = (el) => el.textContent.replace(/\s+/g, ' ').trim();
  for (const el of doc.body.children) {
    const tag = el.tagName.toLowerCase();
    if (/^h[1-6]$/.test(tag)) { const t = txt(el); if (t) lines.push('', '#'.repeat(Math.min(3, +tag[1])) + ' ' + t); }
    else if (tag === 'ul' || tag === 'ol') [...el.querySelectorAll('li')].forEach((li, i) => lines.push((tag === 'ol' ? `${i + 1}. ` : '• ') + txt(li)));
    else if (tag === 'table') {
      for (const tr of el.querySelectorAll('tr')) lines.push([...tr.children].map(txt).join('  |  '));
      lines.push('');
    } else { const t = txt(el); lines.push(t); }
  }
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}
