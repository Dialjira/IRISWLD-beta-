// Biblioteca local en IndexedDB: los PDF nunca salen del teléfono salvo que el usuario los comparta.
const DB = 'artcraft-pdf', VER = 1;
let dbp = null;

function db() {
  if (!dbp) dbp = new Promise((resolve, reject) => {
    const r = indexedDB.open(DB, VER);
    r.onupgradeneeded = () => {
      const d = r.result;
      if (!d.objectStoreNames.contains('docs')) d.createObjectStore('docs', { keyPath: 'id' });
      if (!d.objectStoreNames.contains('blobs')) d.createObjectStore('blobs');
      if (!d.objectStoreNames.contains('kv')) d.createObjectStore('kv');
    };
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
  return dbp;
}

function tx(stores, mode, fn) {
  return db().then(d => new Promise((resolve, reject) => {
    const t = d.transaction(stores, mode);
    let out;
    Promise.resolve(fn(t)).then(v => { out = v; });
    t.oncomplete = () => resolve(out);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error || new Error('Sin espacio de almacenamiento'));
  }));
}
const req = (r) => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });

export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

export async function listDocs() {
  const all = await tx(['docs'], 'readonly', t => req(t.objectStore('docs').getAll()));
  return all.sort((a, b) => (b.updated || 0) - (a.updated || 0));
}

export async function saveDoc(meta, bytes) {
  const now = Date.now();
  // Si el documento ya existe se conservan sus datos (favorito, carpeta, resumen, miniatura…)
  const prev = meta.id ? await tx(['docs'], 'readonly', t => req(t.objectStore('docs').get(meta.id))) : null;
  const clean = Object.fromEntries(Object.entries(meta).filter(([, v]) => v !== undefined));
  const rec = { created: now, ...(prev || {}), ...clean, id: meta.id || uid(), updated: now, size: bytes.length };
  // Al guardar contenido propio deja de depender del archivo original del teléfono
  delete rec.linked;
  await tx(['docs', 'blobs'], 'readwrite', t => {
    t.objectStore('docs').put(rec);
    t.objectStore('blobs').put(new Blob([bytes], { type: 'application/pdf' }), rec.id);
  });
  return rec;
}

export async function updateMeta(id, patch) {
  return tx(['docs'], 'readwrite', async t => {
    const s = t.objectStore('docs');
    const cur = await req(s.get(id));
    if (cur) s.put({ ...cur, ...patch });
  });
}

/**
 * Documentos vinculados: se añaden a la biblioteca sin copiar el archivo (se lee del teléfono al abrirlo).
 * Así importar miles de documentos es instantáneo y no duplica gigas de almacenamiento.
 */
export async function linkMany(metas) {
  const now = Date.now();
  const recs = metas.map((m, i) => ({ created: now, updated: now - i, ...m, id: uid() + i.toString(36), linked: true }));
  await tx(['docs'], 'readwrite', t => { const s = t.objectStore('docs'); recs.forEach(r => s.put(r)); });
  return recs;
}

// Quien sabe leer los archivos del teléfono (lo registra main.js): (rec) => Uint8Array con el PDF
let linkedReader = null;
export function setLinkedReader(fn) { linkedReader = fn; }

export async function loadBytes(id) {
  const blob = await tx(['blobs'], 'readonly', t => req(t.objectStore('blobs').get(id)));
  if (blob) return new Uint8Array(await blob.arrayBuffer());
  const rec = await tx(['docs'], 'readonly', t => req(t.objectStore('docs').get(id)));
  if (rec?.linked && linkedReader) return linkedReader(rec);
  throw new Error('Documento no encontrado');
}

/** Blob guardado (null si el documento está vinculado o no existe). */
export function getBlob(id) { return tx(['blobs'], 'readonly', t => req(t.objectStore('blobs').get(id))); }

export async function deleteDoc(id) {
  await tx(['docs', 'blobs'], 'readwrite', t => { t.objectStore('docs').delete(id); t.objectStore('blobs').delete(id); });
}

export async function getKV(key, def = null) {
  const v = await tx(['kv'], 'readonly', t => req(t.objectStore('kv').get(key)));
  return v === undefined ? def : v;
}
export async function setKV(key, val) { await tx(['kv'], 'readwrite', t => { t.objectStore('kv').put(val, key); }); }

export async function usage() {
  try { const e = await navigator.storage?.estimate(); return e || null; } catch { return null; }
}
export async function persist() { try { return await navigator.storage?.persist?.(); } catch { return false; } }
