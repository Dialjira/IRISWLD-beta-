// Puente con Android: guardar, compartir y abrir PDF desde otras apps.
import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { App } from '@capacitor/app';

export const isNative = () => Capacitor.isNativePlatform();

export function toBase64(bytes) {
  let s = '';
  const step = 0x8000;
  for (let i = 0; i < bytes.length; i += step) s += String.fromCharCode.apply(null, bytes.subarray(i, i + step));
  return btoa(s);
}
export function fromBase64(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function download(bytes, name, mime) {
  const url = URL.createObjectURL(new Blob([bytes], { type: mime }));
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/** Guarda en Documentos/AICraftPDF. Devuelve una descripción de dónde quedó. */
export async function saveToDevice(bytes, name, mime = 'application/pdf') {
  if (!isNative()) { download(bytes, name, mime); return 'Descargas'; }
  const path = `AICraftPDF/${name}`;
  try {
    await Filesystem.writeFile({ path, data: toBase64(bytes), directory: Directory.Documents, recursive: true });
    return `Documentos/AICraftPDF/${name}`;
  } catch {
    // Algunos Android limitan Documentos: se ofrece compartir/guardar con el selector del sistema
    await shareFile(bytes, name, mime);
    return 'el destino elegido';
  }
}

export async function shareFile(bytes, name, mime = 'application/pdf') {
  if (isNative()) {
    const res = await Filesystem.writeFile({ path: `share/${name}`, data: toBase64(bytes), directory: Directory.Cache, recursive: true });
    await Share.share({ title: name, files: [res.uri], dialogTitle: 'Compartir' });
    return;
  }
  const file = new File([bytes], name, { type: mime });
  if (navigator.canShare?.({ files: [file] })) { await navigator.share({ files: [file], title: name }); return; }
  download(bytes, name, mime);
}

export async function shareText(text, title = 'Texto') {
  if (isNative()) return Share.share({ title, text, dialogTitle: 'Compartir' });
  if (navigator.share) return navigator.share({ title, text });
  await navigator.clipboard.writeText(text);
}

/** Lee un PDF que otra app abrió con AICraft PDF ("Abrir con…"). */
async function readIncoming(url) {
  const r = await Filesystem.readFile({ path: url });
  const name = decodeURIComponent((url.split('/').pop() || 'documento.pdf').split('?')[0]);
  const data = typeof r.data === 'string' ? fromBase64(r.data) : new Uint8Array(await r.data.arrayBuffer());
  return { name: /\.pdf$/i.test(name) ? name : name.replace(/^.*%3A/, '') + '.pdf', bytes: data };
}

export async function onIncomingPdf(handler) {
  if (!isNative()) return;
  const handle = async (url) => {
    if (!url || !/^(content|file):/.test(url)) return;
    try { handler(await readIncoming(url)); } catch (e) { handler(null, e); }
  };
  const launch = await App.getLaunchUrl();
  if (launch?.url) handle(launch.url);
  App.addListener('appUrlOpen', ({ url }) => handle(url));
}

export function onBackButton(fn) {
  if (isNative()) App.addListener('backButton', fn);
}
export const exitApp = () => App.exitApp();
