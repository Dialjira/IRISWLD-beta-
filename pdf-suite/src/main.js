import './style.css';
import { h, icon, toast, ask, modal, confirmBox, busy, pickFiles, readBytes, select, field, seg, closeTopModal } from './ui.js';
import { openPdf, pageToBlob } from './lib/pdfview.js';
import * as ops from './lib/ops.js';
import * as store from './lib/store.js';
import { PROVIDERS, listModels, complete, draftDocument } from './lib/ai.js';
import { safeFileName, formatBytes, LANGUAGES, wrapLines } from './lib/text.js';
import { startDictation } from './lib/voice.js';
import { onIncomingPdf, onBackButton, exitApp, isNative, shareFile } from './lib/native.js';
import { docView, narrator } from './docview.js';
import { fileToImage } from './editor.js';

const BASE = import.meta.env.BASE_URL;
ops.setFontLoader(async (w) => new Uint8Array(await (await fetch(BASE + `fonts/DejaVuSans${w === 'bold' ? '-Bold' : ''}.ttf`)).arrayBuffer()));

const DEFAULTS = { theme: 'auto', ai: { provider: 'anthropic', key: '', model: PROVIDERS.anthropic.model, baseUrl: '' }, ttsRate: 1, ttsPitch: 1, ocrLangs: 'spa+eng', pageSize: 'A4', fontSize: 12, dictLang: 'es-ES' };

const app = {
  view: 'home', doc: null, settings: structuredClone(DEFAULTS), draft: { title: '', body: '' },

  async init() {
    const saved = await store.getKV('settings', {});
    this.settings = { ...structuredClone(DEFAULTS), ...saved, ai: { ...DEFAULTS.ai, ...(saved?.ai || {}) } };
    this.draft = (await store.getKV('draft', null)) || this.draft;
    applyTheme(this.settings.theme);
    store.persist();
    onIncomingPdf((file, err) => {
      if (err || !file) return toast('No se pudo abrir el archivo: ' + (err?.message || ''), 'err');
      this.openBytes(file.bytes, file.name);
    });
    onBackButton(() => {
      if (closeTopModal()) return;
      if (this.view === 'doc') return this.closeDoc();
      if (this.view !== 'home') return this.go('home');
      exitApp();
    });
    this.render();
  },

  saveSettings() { return store.setKV('settings', this.settings); },

  go(view) { if (this.view === 'doc' && view !== 'doc') narrator.stop(); this.view = view; this.render(); window.scrollTo(0, 0); },

  render() {
    const main = document.getElementById('main');
    const top = document.getElementById('topbar');
    const nav = document.getElementById('bottomnav');
    top.replaceChildren(...topBar());
    nav.replaceChildren(...[['home', 'Inicio', 'home'], ['library', 'Biblioteca', 'folder'], ['create', 'Crear', 'plus'], ['settings', 'Ajustes', 'gear']].map(([v, l, ic]) =>
      h('button', { class: 'nav-btn' + (this.view === v ? ' on' : ''), 'aria-current': this.view === v ? 'page' : undefined, onclick: () => this.leaveDocThen(() => this.go(v)) }, icon(ic), h('span', {}, l))));
    nav.hidden = this.view === 'doc';
    const views = { home: homeView, library: libraryView, create: createView, settings: settingsView, doc: () => docView(this), scan: scanView, merge: mergeView };
    main.replaceChildren((views[this.view] || homeView)());
  },

  async leaveDocThen(fn) {
    if (this.view === 'doc' && this.doc?.editor?.hasChanges() && this.doc.tab === 'edit') {
      if (!(await confirmBox('Cambios sin aplicar', 'Hay cambios en el editor sin aplicar. ¿Salir y descartarlos?', { okLabel: 'Salir', danger: true }))) return;
    }
    fn();
  },
  closeDoc() { this.leaveDocThen(() => { this.doc = null; this.go('home'); }); },

  async openRecord(rec) {
    const b = busy('Abriendo…');
    try { await this.loadDoc(await store.loadBytes(rec.id), rec); }
    catch (e) { toast(e.message, 'err'); } finally { b.done(); }
  },

  async openBytes(bytes, name) {
    const rec = await store.saveDoc({ name: safeFileName(name) }, bytes);
    await this.loadDoc(bytes, rec);
  },

  async loadDoc(bytes, rec) {
    let pdf, readonly = false;
    try { pdf = await openPdf(bytes); }
    catch (e) {
      if (e?.name !== 'PasswordException') throw new Error('No se pudo leer el PDF (¿archivo dañado?)');
      for (;;) {
        const pw = await ask('PDF protegido', { label: 'Escribe la contraseña', type: 'password' });
        if (pw === null) return;
        try { pdf = await openPdf(bytes, pw); readonly = true; break; } catch { toast('Contraseña incorrecta', 'err'); }
      }
    }
    // pdf-lib no puede modificar PDF cifrados (con contraseña o restricciones): se abren como solo lectura
    if (!readonly) readonly = await ops.isEncrypted(bytes);
    narrator.stop();
    this.doc = { id: rec.id, name: rec.name, bytes, pdf, history: [], tab: 'view', readonly };
    store.updateMeta(rec.id, { opened: Date.now(), pages: pdf.numPages });
    this.go('doc');
  },

  /** Sustituye el documento por una versión nueva (con deshacer) y lo guarda. */
  async apply(bytes, label, { keepTab = true } = {}) {
    const d = this.doc;
    d.history.push({ bytes: d.bytes, label });
    if (d.history.length > 15) d.history.shift();
    await this._swap(bytes);
    toast(label + ' ✓');
    if (!keepTab) d.tab = 'view';
    this.render();
  },
  async _swap(bytes) {
    const d = this.doc;
    d.pdf?.destroy?.();
    d.bytes = bytes; d.pdf = await openPdf(bytes); d.text = null; d.editedText = undefined;
    await this.persist();
  },
  async undo() {
    const d = this.doc;
    const last = d.history.pop();
    if (!last) return toast('Nada que deshacer', 'warn');
    await this._swap(last.bytes);
    toast('Deshecho: ' + last.label);
    this.render();
  },
  async persist() { const d = this.doc; await store.saveDoc({ id: d.id, name: d.name, pages: d.pdf.numPages }, d.bytes); },

  async saveNew(bytes, name, { open = true } = {}) {
    const rec = await store.saveDoc({ name: safeFileName(name) }, bytes);
    if (open) await this.loadDoc(bytes, rec);
    return rec;
  },

  async deleteCurrent() { await store.deleteDoc(this.doc.id); this.doc = null; toast('Eliminado'); this.go('library'); },

  /** Renderiza todas las páginas a JPG y crea un PDF nuevo (comprimir / desbloquear). */
  async rasterize({ scale = 1.6, quality = 0.72 } = {}) {
    const d = this.doc;
    const b = busy('Procesando páginas…', { cancellable: true });
    try {
      const imgs = [];
      for (let i = 1; i <= d.pdf.numPages; i++) {
        if (b.signal.aborted) throw new Error('Cancelado');
        b.set(`Página ${i} de ${d.pdf.numPages}`, i / d.pdf.numPages);
        const page = await d.pdf.getPage(i);
        const vp = page.getViewport({ scale: 1 });
        const { blob } = await pageToBlob(d.pdf, i, { scale, quality });
        imgs.push({ bytes: new Uint8Array(await blob.arrayBuffer()), type: 'jpg', pageW: vp.width, pageH: vp.height });
      }
      return await ops.imagesToPdf(imgs);
    } finally { b.done(); }
  },

  async unlockCopy() {
    const out = await this.rasterize({ scale: 2, quality: 0.85 });
    await this.saveNew(out, this.doc.name.replace(/\.pdf$/i, '') + ' (editable).pdf');
    toast('Copia editable creada');
  },

  /** Texto → PDF nuevo. Si hay escrituras no cubiertas por la fuente (chino, árabe…), se dibuja con las fuentes del sistema. */
  async textToNewPdf(text, title, opts = {}) {
    if (!text?.trim()) return toast('No hay texto', 'warn');
    const b = busy('Creando PDF…');
    try {
      const o = { pageSize: this.settings.pageSize, fontSize: this.settings.fontSize, ...opts };
      let bytes = await ops.textToPdf(text, { ...o, title: opts.withTitle ? title : '' });
      if (!bytes) bytes = await textToPdfCanvas(text, o);
      b.done();
      return await this.saveNew(bytes, title);
    } catch (e) { b.done(); toast(e.message, 'err'); }
  },
};
window.__app = app;

async function textToPdfCanvas(text, { pageSize = 'A4', fontSize = 12 }) {
  const [W, H] = ops.PAGE_SIZES[pageSize] || ops.PAGE_SIZES.A4;
  const k = 2.5, margin = 56 * k, size = fontSize * k, lh = size * 1.5;
  const c = h('canvas'); c.width = W * k; c.height = H * k;
  const g = c.getContext('2d');
  const rtl = /[֐-ࣿ]/.test(text);
  g.font = `${size}px system-ui, "Noto Sans", sans-serif`;
  g.direction = rtl ? 'rtl' : 'ltr';
  const lines = wrapLines(text, c.width - margin * 2, s => g.measureText(s).width);
  const perPage = Math.floor((c.height - margin * 2) / lh);
  const images = [];
  for (let p = 0; p * perPage < lines.length; p++) {
    g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
    g.fillStyle = '#16161a'; g.textBaseline = 'top'; g.textAlign = rtl ? 'right' : 'left';
    lines.slice(p * perPage, (p + 1) * perPage).forEach((ln, i) => g.fillText(ln, rtl ? c.width - margin : margin, margin + i * lh));
    const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.9));
    images.push({ bytes: new Uint8Array(await blob.arrayBuffer()), type: 'jpg', pageW: W, pageH: H });
  }
  return ops.imagesToPdf(images);
}

function applyTheme(t) {
  document.documentElement.dataset.theme = t === 'auto' ? '' : t;
  if (t === 'auto') delete document.documentElement.dataset.theme;
}

function topBar() {
  if (app.view === 'doc' && app.doc) {
    const d = app.doc;
    return [
      h('button', { class: 'icon-btn', 'aria-label': 'Volver', onclick: () => app.closeDoc() }, icon('back')),
      h('div', { class: 'title-block' }, h('div', { class: 'doc-title', title: d.name }, d.name),
        h('div', { class: 'small muted' }, `${d.pdf.numPages} pág. · ${formatBytes(d.bytes.length)}${d.readonly ? ' · protegido' : ''}`)),
      h('button', { class: 'icon-btn', 'aria-label': 'Deshacer', disabled: !d.history.length || undefined, onclick: () => app.undo() }, icon('undo')),
      h('button', { class: 'icon-btn', 'aria-label': 'Compartir', onclick: () => shareFile(d.bytes, safeFileName(d.name)).catch(e => toast(e.message, 'err')) }, icon('share')),
    ];
  }
  const titles = { home: '', library: 'Biblioteca', create: 'Crear documento', settings: 'Ajustes', scan: 'Escanear documento', merge: 'Unir PDF' };
  return app.view === 'home'
    ? [h('div', { class: 'brand' }, h('span', { class: 'logo' }, 'A'), h('div', {}, h('b', {}, 'ArtCraft PDF'), h('div', { class: 'small muted' }, 'Suite de documentos')))]
    : [h('button', { class: 'icon-btn', 'aria-label': 'Inicio', onclick: () => app.go('home') }, icon('back')), h('h2', {}, titles[app.view] || '')];
}

/* ---------- Inicio ---------- */
async function openFromDevice() {
  const files = await pickFiles({ accept: 'application/pdf,.pdf', multiple: false });
  if (!files.length) return;
  const b = busy('Abriendo…');
  try { await app.openBytes(await readBytes(files[0]), files[0].name); }
  catch (e) { toast(e.message, 'err'); } finally { b.done(); }
}

function homeView() {
  const recent = h('div', { class: 'list' });
  store.listDocs().then(docs => {
    if (!docs.length) recent.append(h('p', { class: 'muted center' }, 'Aún no hay documentos. Abre o crea uno.'));
    docs.slice(0, 5).forEach(r => recent.append(docItem(r)));
  });
  const big = (ic, label, desc, fn, cls = '') => h('button', { class: 'hero-btn ' + cls, onclick: () => Promise.resolve(fn()).catch(e => toast(e.message, 'err')) },
    h('span', { class: 'hero-ic' }, icon(ic, 26)), h('b', {}, label), h('small', {}, desc));
  return h('div', { class: 'stack' },
    h('div', { class: 'hero' },
      big('open', 'Abrir PDF', 'Del teléfono o Drive', openFromDevice, 'accent'),
      big('camera', 'Escanear', 'Cámara → PDF', () => app.go('scan')),
      big('plus', 'Crear', 'Escribe, dicta o usa IA', () => app.go('create')),
      big('image', 'Imágenes a PDF', 'Fotos de la galería', imagesToPdfFlow),
      big('merge', 'Unir PDF', 'Varios en uno', () => app.go('merge')),
      big('translate', 'Traducir PDF', 'Abre y elige IA', async () => { await openFromDevice(); if (app.doc) app.switchTab?.('ai'); }),
    ),
    h('div', { class: 'section-head' }, h('h3', {}, 'Recientes'), h('button', { class: 'btn sm ghost', onclick: () => app.go('library') }, 'Ver todo')),
    recent,
  );
}

function docItem(r, onChange) {
  const open = () => app.openRecord(r);
  const menu = async (e) => {
    e.stopPropagation();
    const v = await modal(r.name, h('p', { class: 'small muted' }, `${r.pages ? r.pages + ' pág. · ' : ''}${formatBytes(r.size)} · ${new Date(r.updated).toLocaleString('es')}`), [
      { label: 'Eliminar', value: 'del', danger: true }, { label: 'Renombrar', value: 'ren' }, { label: 'Abrir', value: 'open', primary: true }]);
    if (v === 'open') open();
    if (v === 'ren') { const n = await ask('Nuevo nombre', { value: r.name.replace(/\.pdf$/i, '') }); if (n) { await store.updateMeta(r.id, { name: safeFileName(n) }); app.render(); } }
    if (v === 'del' && await confirmBox('Eliminar', `¿Eliminar "${r.name}"?`, { okLabel: 'Eliminar', danger: true })) { await store.deleteDoc(r.id); onChange ? onChange() : app.render(); }
  };
  return h('div', { class: 'list-item doc', role: 'button', tabindex: 0, onclick: open, onkeydown: (e) => { if (e.key === 'Enter') open(); } },
    h('span', { class: 'li-ic pdf' }, 'PDF'),
    h('span', { class: 'li-txt' }, h('b', {}, r.name), h('small', {}, `${r.pages ? r.pages + ' pág. · ' : ''}${formatBytes(r.size)} · ${relTime(r.updated)}`)),
    h('button', { class: 'icon-btn', 'aria-label': 'Opciones de ' + r.name, onclick: menu }, icon('more')));
}

function relTime(t) {
  const s = (Date.now() - t) / 1000;
  if (s < 60) return 'ahora';
  if (s < 3600) return `hace ${Math.floor(s / 60)} min`;
  if (s < 86400) return `hace ${Math.floor(s / 3600)} h`;
  return new Date(t).toLocaleDateString('es');
}

/* ---------- Biblioteca ---------- */
function libraryView() {
  const list = h('div', { class: 'list' });
  const q = h('input', { type: 'search', placeholder: 'Buscar por nombre…', 'aria-label': 'Buscar', oninput: () => draw() });
  const usage = h('p', { class: 'small muted center' });
  let docs = [];
  const draw = () => {
    const f = q.value.trim().toLowerCase();
    const shown = docs.filter(d => !f || d.name.toLowerCase().includes(f));
    list.replaceChildren(...(shown.length ? shown.map(r => docItem(r, load)) : [h('p', { class: 'muted center' }, f ? 'Sin resultados' : 'La biblioteca está vacía')]));
  };
  const load = async () => {
    docs = await store.listDocs(); draw();
    const u = await store.usage();
    usage.textContent = `${docs.length} documento(s) · ${formatBytes(docs.reduce((a, d) => a + (d.size || 0), 0))}${u?.quota ? ' · espacio libre ~' + formatBytes(u.quota - u.usage) : ''}`;
  };
  load();
  return h('div', { class: 'stack' }, h('div', { class: 'row' }, q, h('button', { class: 'btn primary', onclick: openFromDevice }, icon('open', 18), 'Abrir')), list, usage);
}

/* ---------- Crear ---------- */
function createView() {
  const s = app.settings, dr = app.draft;
  const title = h('input', { placeholder: 'Título del documento', value: dr.title, oninput: () => { dr.title = title.value; saveDraft(); } });
  const body = h('textarea', { class: 'bigtext', rows: 16, placeholder: 'Escribe o dicta tu documento…\n\nConsejo: empieza una línea con "# " para un título o "## " para una sección.', oninput: () => { dr.body = body.value; saveDraft(); } });
  body.value = dr.body;
  let saveT; const saveDraft = () => { clearTimeout(saveT); saveT = setTimeout(() => store.setKV('draft', dr), 400); };

  let stopFn = null, base = '', wantDictation = false;
  const micBtn = h('button', { class: 'btn' }, icon('mic', 18), h('span', {}, 'Dictar'));
  const setMic = (on) => { micBtn.classList.toggle('rec', on); micBtn.lastChild.textContent = on ? 'Detener' : 'Dictar'; };
  const startDict = async () => {
    base = body.value ? body.value.replace(/\s*$/, ' ') : '';
    try {
      stopFn = await startDictation(s.dictLang, (t, final) => {
        body.value = base + t;
        if (final) { base = body.value + ' '; dr.body = body.value; saveDraft(); }
      }, () => { stopFn = null; if (wantDictation) startDict(); else setMic(false); });
      setMic(true);
    } catch (e) { wantDictation = false; setMic(false); toast(e.message, 'err'); }
  };
  micBtn.onclick = async () => {
    if (wantDictation) { wantDictation = false; await stopFn?.(); setMic(false); return; }
    wantDictation = true; startDict();
  };

  const aiDraft = async () => {
    if (!s.ai?.key) return app.go('settings');
    const desc = await ask('Redactar con IA', { multiline: true, placeholder: 'Ej.: Carta formal a mi arrendador solicitando la reparación de una fuga de agua, con tono cordial.' });
    if (!desc) return;
    const b = busy('Redactando…', { cancellable: true });
    try {
      const out = await draftDocument(s.ai, desc, b.signal);
      const m = out.match(/^#\s+(.+)\n+/);
      if (m && !title.value) { title.value = dr.title = m[1].trim(); }
      body.value = dr.body = (body.value ? body.value + '\n\n' : '') + (m ? out.slice(m[0].length) : out).trim();
      saveDraft();
    } catch (e) { toast(e.message, 'err'); } finally { b.done(); }
  };
  const aiImprove = async () => {
    if (!s.ai?.key) return app.go('settings');
    if (!body.value.trim()) return toast('Escribe algo primero', 'warn');
    const how = await modal('Mejorar con IA', h('p', {}, '¿Qué quieres hacer con el texto?'), [
      { label: 'Corregir', value: 'Corrige ortografía y gramática sin cambiar el estilo.' },
      { label: 'Más formal', value: 'Reescríbelo con un tono formal y profesional.' },
      { label: 'Ordenar', value: 'Organízalo con títulos ("## ") y párrafos claros, sin perder información.' }]);
    if (!how) return;
    const b = busy('Mejorando…', { cancellable: true });
    try {
      const out = await complete(s.ai, { user: `${how} Responde solo con el texto.\n\n<<<TEXTO\n${body.value}\nTEXTO>>>`, signal: b.signal });
      body.value = dr.body = out.trim(); saveDraft();
    } catch (e) { toast(e.message, 'err'); } finally { b.done(); }
  };

  let pageSize = s.pageSize, align = 'left';
  const fsIn = h('input', { type: 'number', min: 8, max: 24, value: s.fontSize });
  return h('div', { class: 'stack' },
    title,
    h('div', { class: 'row wrap' }, micBtn,
      h('button', { class: 'btn', onclick: aiDraft }, icon('ai', 18), 'Redactar con IA'),
      h('button', { class: 'btn', onclick: aiImprove }, icon('edit', 18), 'Mejorar')),
    body,
    h('div', { class: 'grid2' },
      field('Tamaño de página', select(Object.keys(ops.PAGE_SIZES).map(k => [k, k]), pageSize, v => { pageSize = v; })),
      field('Letra (pt)', fsIn)),
    field('Alineación', seg([['left', 'Izquierda'], ['center', 'Centro'], ['right', 'Derecha']], align, v => { align = v; })),
    h('div', { class: 'row' },
      h('button', { class: 'btn ghost', onclick: async () => { if (await confirmBox('Vaciar', '¿Borrar el borrador?', { okLabel: 'Borrar', danger: true })) { dr.title = dr.body = ''; await store.setKV('draft', dr); app.render(); } } }, icon('trash', 18), 'Vaciar'),
      h('span', { class: 'grow' }),
      h('button', { class: 'btn primary', onclick: async () => {
        const rec = await app.textToNewPdf(body.value, dr.title || 'Documento', { pageSize, fontSize: +fsIn.value || 12, align, withTitle: !!dr.title });
        if (rec) { dr.title = dr.body = ''; store.setKV('draft', dr); }
      } }, icon('file', 18), 'Crear PDF')),
    h('p', { class: 'hint' }, 'El borrador se guarda solo mientras escribes.'),
  );
}

/* ---------- Escanear ---------- */
const scanState = { pages: [], filter: 'contrast' };
function scanView() {
  const grid = h('div', { class: 'thumbs' });
  const foot = h('div');
  const createPdf = async () => {
    const name = await ask('Nombre del PDF', { value: 'Escaneo ' + new Date().toLocaleDateString('es').replace(/\//g, '-') });
    if (name === null) return;
    const b = busy('Creando PDF…');
    try {
      const bytes = await ops.imagesToPdf(scanState.pages.map(p => ({ bytes: p.bytes, type: p.type })), { pageSize: app.settings.pageSize, margin: 0 });
      scanState.pages = [];
      b.done();
      await app.saveNew(bytes, name);
      toast('PDF creado. Usa Texto → OCR para hacerlo buscable.');
    } catch (e) { b.done(); toast(e.message, 'err'); }
  };
  const draw = () => {
    grid.replaceChildren(...scanState.pages.map((p, i) => h('div', { class: 'thumb' },
      h('img', { src: p.el.src, alt: 'Página ' + (i + 1) }), h('span', { class: 'tnum' }, i + 1),
      h('button', { class: 'tdel', 'aria-label': 'Quitar página ' + (i + 1), onclick: () => { scanState.pages.splice(i, 1); draw(); } }, icon('close', 14)))));
    foot.replaceChildren(scanState.pages.length
      ? h('button', { class: 'btn primary block', onclick: createPdf }, icon('check', 18), `Crear PDF (${scanState.pages.length} pág.)`)
      : h('p', { class: 'muted center' }, 'Toma fotos de cada página. Puedes mezclar cámara y galería.'));
  };
  const add = async (capture) => {
    const files = await pickFiles({ accept: 'image/*', multiple: !capture, capture: capture ? 'environment' : undefined });
    if (!files.length) return;
    const b = busy('Procesando fotos…');
    try { for (const f of files) scanState.pages.push(await fileToImage(f, { filter: scanState.filter, maxSide: 2200 })); }
    catch (e) { toast(e.message, 'err'); } finally { b.done(); draw(); }
  };
  draw();
  return h('div', { class: 'stack' },
    field('Mejora de imagen (para las próximas fotos)', seg([['none', 'Original'], ['gray', 'Gris'], ['contrast', 'Documento'], ['bw', 'Blanco y negro']], scanState.filter, v => { scanState.filter = v; })),
    h('div', { class: 'row' },
      h('button', { class: 'btn primary grow', onclick: () => add(true) }, icon('camera', 18), 'Tomar foto'),
      h('button', { class: 'btn grow', onclick: () => add(false) }, icon('image', 18), 'Galería')),
    grid, foot);
}

async function imagesToPdfFlow() {
  const files = await pickFiles({ accept: 'image/*', multiple: true });
  if (!files.length) return;
  const b = busy('Creando PDF…');
  try {
    const imgs = [];
    for (const f of files) imgs.push(await fileToImage(f));
    const bytes = await ops.imagesToPdf(imgs.map(p => ({ bytes: p.bytes, type: p.type })), { pageSize: app.settings.pageSize });
    b.done();
    await app.saveNew(bytes, files.length === 1 ? files[0].name : `Imágenes ${new Date().toLocaleDateString('es').replace(/\//g, '-')}`);
  } catch (e) { b.done(); toast(e.message, 'err'); }
}

/* ---------- Unir ---------- */
const mergeState = { items: [] };
function mergeView() {
  const list = h('div', { class: 'list' });
  const draw = () => list.replaceChildren(...(mergeState.items.length ? mergeState.items.map((it, i) => h('div', { class: 'list-item' },
    h('span', { class: 'li-ic pdf' }, i + 1), h('span', { class: 'li-txt' }, h('b', {}, it.name), h('small', {}, formatBytes(it.bytes.length))),
    h('button', { class: 'icon-btn', 'aria-label': 'Subir', disabled: i === 0 || undefined, onclick: () => { [mergeState.items[i - 1], mergeState.items[i]] = [mergeState.items[i], mergeState.items[i - 1]]; draw(); } }, h('span', { class: 'rot90' }, icon('back', 18))),
    h('button', { class: 'icon-btn', 'aria-label': 'Quitar', onclick: () => { mergeState.items.splice(i, 1); draw(); } }, icon('close', 18)))) : [h('p', { class: 'muted center' }, 'Añade dos o más PDF. Se unirán en este orden.')]));
  const fromDevice = async () => {
    const files = await pickFiles({ accept: 'application/pdf,.pdf', multiple: true });
    for (const f of files) mergeState.items.push({ name: f.name, bytes: await readBytes(f) });
    draw();
  };
  const fromLibrary = async () => {
    const docs = await store.listDocs();
    if (!docs.length) return toast('La biblioteca está vacía', 'warn');
    const checks = docs.map(d => ({ d, c: h('input', { type: 'checkbox' }) }));
    const ok = await modal('Elegir de la biblioteca', h('div', { class: 'list' }, checks.map(({ d, c }) => h('label', { class: 'list-item' }, c, h('span', { class: 'li-txt' }, h('b', {}, d.name), h('small', {}, formatBytes(d.size)))))),
      [{ label: 'Cancelar', value: false }, { label: 'Añadir', value: true, primary: true }]);
    if (!ok) return;
    for (const { d, c } of checks) if (c.checked) mergeState.items.push({ name: d.name, bytes: await store.loadBytes(d.id) });
    draw();
  };
  draw();
  return h('div', { class: 'stack' },
    h('div', { class: 'row' }, h('button', { class: 'btn grow', onclick: fromDevice }, icon('open', 18), 'Del teléfono'), h('button', { class: 'btn grow', onclick: fromLibrary }, icon('folder', 18), 'De la biblioteca')),
    list,
    h('button', { class: 'btn primary block', onclick: async () => {
      if (mergeState.items.length < 2) return toast('Añade al menos 2 PDF', 'warn');
      const b = busy('Uniendo…');
      try {
        const bytes = await ops.merge(mergeState.items.map(i => i.bytes));
        const name = mergeState.items[0].name.replace(/\.pdf$/i, '') + ' (unido).pdf';
        mergeState.items = [];
        b.done();
        await app.saveNew(bytes, name);
      } catch (e) { b.done(); toast('No se pudo unir: ' + e.message, 'err'); }
    } }, icon('merge', 18), 'Unir PDF'));
}

/* ---------- Ajustes ---------- */
function settingsView() {
  const s = app.settings;
  const ai = s.ai;
  const save = () => app.saveSettings();
  const keyIn = h('input', { type: 'password', value: ai.key, placeholder: 'Pega aquí tu clave', autocomplete: 'off', oninput: () => { ai.key = keyIn.value.trim(); save(); } });
  const modelIn = h('input', { value: ai.model, list: 'models', oninput: () => { ai.model = modelIn.value.trim(); save(); } });
  const dl = h('datalist', { id: 'models' });
  const baseIn = h('input', { value: ai.baseUrl, placeholder: PROVIDERS.openai.baseUrl, oninput: () => { ai.baseUrl = baseIn.value.trim(); save(); } });
  const baseField = field('URL base (OpenRouter, LM Studio, etc.)', baseIn);
  const keyLink = h('a', { target: '_blank', rel: 'noopener' }, 'Conseguir una clave');
  const sync = () => { baseField.hidden = ai.provider !== 'openai'; keyLink.href = PROVIDERS[ai.provider].keyUrl; };
  sync();
  const provSel = select(Object.entries(PROVIDERS).map(([k, p]) => [k, p.name]), ai.provider, v => {
    ai.provider = v; ai.model = PROVIDERS[v].model; modelIn.value = ai.model; dl.replaceChildren(); sync(); save();
  });
  const test = async () => {
    const b = busy('Probando conexión…');
    try {
      const out = await complete(ai, { user: 'Responde solo: "Conexión correcta".', maxTokens: 50 });
      toast('✓ ' + out.trim().slice(0, 60));
    } catch (e) { toast(e.message, 'err'); } finally { b.done(); }
  };
  const loadModels = async () => {
    const b = busy('Consultando modelos…');
    try { const ids = await listModels(ai); dl.replaceChildren(...ids.map(id => h('option', { value: id }))); toast(`${ids.length} modelos disponibles: toca el campo Modelo`); }
    catch (e) { toast(e.message, 'err'); } finally { b.done(); }
  };

  return h('div', { class: 'stack' },
    h('div', { class: 'card' }, h('h3', {}, icon('ai', 20), ' Inteligencia artificial'),
      h('p', { class: 'small muted' }, 'Traducir, reescribir, resumir y preguntar al documento usan tu propia clave. Se guarda solo en este teléfono. Solo se envía el texto que procesas.'),
      field('Proveedor', provSel), field('Clave de API', keyIn), keyLink, baseField,
      field('Modelo', h('div', {}, modelIn, dl)),
      h('div', { class: 'row' }, h('button', { class: 'btn', onclick: loadModels }, 'Ver modelos'), h('button', { class: 'btn primary', onclick: test }, 'Probar'))),
    h('div', { class: 'card' }, h('h3', {}, icon('voice', 20), ' Voz'),
      field('Idioma del dictado', select(LANGUAGES.map(([, n, c]) => [c, n]), s.dictLang, v => { s.dictLang = v; save(); })),
      h('div', { class: 'grid2' },
        field('Velocidad de narración', select([['0.75', 'Lenta'], ['1', 'Normal'], ['1.25', 'Rápida'], ['1.5', 'Muy rápida']], String(s.ttsRate), v => { s.ttsRate = +v; save(); })),
        field('Tono', select([['0.8', 'Grave'], ['1', 'Normal'], ['1.2', 'Agudo']], String(s.ttsPitch), v => { s.ttsPitch = +v; save(); })))),
    h('div', { class: 'card' }, h('h3', {}, icon('file', 20), ' Documentos'),
      h('div', { class: 'grid2' },
        field('Tamaño de página por defecto', select(Object.keys(ops.PAGE_SIZES).map(k => [k, k]), s.pageSize, v => { s.pageSize = v; save(); })),
        field('Letra por defecto (pt)', select(['10', '11', '12', '13', '14', '16'].map(x => [x, x]), String(s.fontSize), v => { s.fontSize = +v; save(); }))),
      field('Idiomas del OCR', select([['spa+eng', 'Español + inglés'], ['spa', 'Español'], ['eng', 'Inglés'], ['por', 'Portugués'], ['fra', 'Francés'], ['deu', 'Alemán'], ['ita', 'Italiano']], s.ocrLangs, v => { s.ocrLangs = v; save(); }),
        'El idioma se descarga la primera vez (unos 2–4 MB) y luego funciona sin internet.')),
    h('div', { class: 'card' }, h('h3', {}, 'Apariencia'),
      seg([['auto', 'Automático'], ['light', 'Claro'], ['dark', 'Oscuro']], s.theme, v => { s.theme = v; applyTheme(v); save(); })),
    h('p', { class: 'small muted center' }, `ArtCraft PDF ${__APP_VERSION__} · ${isNative() ? 'Android' : 'Web'} · Tus PDF se guardan solo en este dispositivo.`),
  );
}

app.init();
