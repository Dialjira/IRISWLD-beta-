// Copia de seguridad de la biblioteca: un .zip con todos los PDF, sus datos y las carpetas.
import { zipSync, unzipSync, strToU8, strFromU8 } from 'fflate';
import * as store from './store.js';
import { safeFileName } from './text.js';

export async function exportBackup(onProgress = () => {}) {
  const docs = await store.listDocs();
  const folders = (await store.getKV('folders', [])) || [];
  const files = {};
  const meta = [];
  for (let i = 0; i < docs.length; i++) {
    onProgress(i, docs.length);
    const d = docs[i];
    const path = `pdf/${d.id}-${safeFileName(d.name)}`;
    files[path] = [await store.loadBytes(d.id), { level: 0 }]; // los PDF ya van comprimidos
    meta.push({ ...d, path });
  }
  files['artcraft-backup.json'] = strToU8(JSON.stringify({ app: 'AICraft PDF', version: 1, date: new Date().toISOString(), folders, docs: meta }, null, 1));
  return zipSync(files);
}

/** Restaura una copia; no duplica documentos que ya existan con el mismo id. Devuelve cuántos importó. */
export async function importBackup(bytes) {
  const files = unzipSync(bytes);
  const manifest = files['artcraft-backup.json'];
  if (!manifest) throw new Error('El archivo no es una copia de seguridad de AICraft PDF');
  const data = JSON.parse(strFromU8(manifest));
  const existing = new Set((await store.listDocs()).map(d => d.id));
  const folders = (await store.getKV('folders', [])) || [];
  const known = new Set(folders.map(f => f.id));
  await store.setKV('folders', [...folders, ...(data.folders || []).filter(f => !known.has(f.id))]);
  let n = 0;
  for (const d of data.docs || []) {
    if (existing.has(d.id) || !files[d.path]) continue;
    const { path, size, ...metaData } = d;
    await store.saveDoc(metaData, files[path]);
    n++;
  }
  return n;
}
