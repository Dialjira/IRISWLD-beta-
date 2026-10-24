import '@fontsource-variable/inter';
import './style.css';
import { h, icon, toast, ask, modal, confirmBox, busy, pickFiles, readBytes, select, field, seg, closeTopModal, pushBack } from './ui.js';
import { openPdf, pageToBlob } from './lib/pdfview.js';
import * as ops from './lib/ops.js';
import * as store from './lib/store.js';
import { PROVIDERS, MODES, listModels, complete, draftDocument, lastModel } from './lib/ai.js';
import { safeFileName, formatBytes, LANGUAGES, wrapLines } from './lib/text.js';
import { startDictation } from './lib/voice.js';
import { onIncomingPdf, onBackButton, exitApp, isNative, shareFile } from './lib/native.js';
import { docView, narrator, docActions } from './docview.js';
import { openScanner } from './scanner/scanner.js';
import { queueSummaries, onSummary } from './lib/summary.js';
import { exportBackup, importBackup } from './lib/backup.js';
import { saveToDevice } from './lib/native.js';
import { BiometricAuth } from '@aparajita/capacitor-biometric-auth';
import { GEMINI_VOICES, listImageModels, imageModelLabel } from './lib/gemini.js';

let bioPrompting = false;

const BASE = import.meta.env.BASE_URL;
ops.setFontLoader(async (w) => new Uint8Array(await (await fetch(BASE + `fonts/DejaVuSans${w === 'bold' ? '-Bold' : ''}.ttf`)).arrayBuffer()));

const DEFAULTS = {
  theme: 'auto', ai: { provider: 'gemini', key: '', model: 'auto', mode: 'balanced', baseUrl: '' },
  ttsRate: 1, ttsPitch: 1, ocrLangs: 'spa+eng', pageSize: 'A4', fontSize: 12, dictLang: 'es-US', pin: '', bio: false, lockAfter: 60,
  ttsEngine: 'ai', aiVoice: 'Kore', deviceVoice: '', ver: 3,
};

/** Deduce el proveedor por el formato de la clave (evita enviar una clave de Gemini a otro servicio). */
export function providerForKey(key) {
  if (/^AIza[\w-]{20,}/.test(key)) return 'gemini';
  if (/^sk-ant-/.test(key)) return 'anthropic';
  if (/^gsk_/.test(key)) return 'groq';
  if (/^sk-/.test(key)) return 'openai';
  return null;
}

const app = {
  view: 'home', doc: null, settings: structuredClone(DEFAULTS), draft: { title: '', body: '' }, libFilter: 'all', libSort: 'recent', libFolder: '',

  async init() {
    const saved = (await store.getKV('settings', {})) || {};
    this.settings = { ...structuredClone(DEFAULTS), ...saved, ai: { ...DEFAULTS.ai, ...(saved.ai || {}) } };
    const ai = this.settings.ai;
    const guessed = ai.key && providerForKey(ai.key);
    if (guessed && guessed !== ai.provider) { ai.provider = guessed; ai.model = PROVIDERS[guessed].model; this.saveSettings(); }
    if (ai.provider === 'gemini' && !ai.model) ai.model = 'auto';
    if ((saved.ver || 0) < 3) {
      // 1.2: el predeterminado pasa a ser automático con Flash-Lite y el dictado en español latino
      if (ai.provider === 'gemini') { ai.model = 'auto'; ai.mode = 'balanced'; }
      if (this.settings.dictLang === 'es-ES') this.settings.dictLang = 'es-US';
      this.settings.ver = 3; this.saveSettings();
    }
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
    let hiddenAt = 0;
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) hiddenAt = Date.now();
      else if ((this.settings.pin || this.settings.bio) && !bioPrompting && Date.now() - hiddenAt > this.settings.lockAfter * 1000) lockScreen(this);
    });
    this.render();
    if (this.settings.pin || this.settings.bio) lockScreen(this);
  },

  saveSettings() { return store.setKV('settings', this.settings); },

  go(view) { if (this.view === 'doc' && view !== 'doc') narrator.stop(); this.view = view; this.render(); window.scrollTo(0, 0); },

  render() {
    const main = document.getElementById('main');
    const top = document.getElementById('topbar');
    const nav = document.getElementById('bottomnav');
    top.replaceChildren(...topBar());
    top.className = 'topbar' + (this.view === 'home' ? ' home' : '');
    const navBtn = (v, l, ic) => h('button', { class: 'nav-btn' + (this.view === v ? ' on' : ''), 'aria-current': this.view === v ? 'page' : undefined, onclick: () => this.leaveDocThen(() => this.go(v)) }, icon(ic), h('span', {}, l));
    nav.replaceChildren(navBtn('home', 'Inicio', 'home'), navBtn('library', 'Archivos', 'folder'),
      h('button', { class: 'nav-fab', 'aria-label': 'Escanear', onclick: () => openScanner(this) }, icon('scan', 28)),
      navBtn('create', 'Crear', 'edit'), navBtn('settings', 'Ajustes', 'gear'));
    nav.hidden = this.view === 'doc';
    const views = { home: homeView, library: libraryView, create: createView, settings: settingsView, doc: () => docView(this), merge: mergeView };
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
    const rec = await store.saveDoc({ name: safeFileName(name), folder: this.libFolder || '' }, bytes);
    queueSummaries(this.settings.ai, [rec.id]);
    await this.loadDoc(bytes, rec);
  },

  async loadDoc(bytes, rec) {
    let pdf, password = '';
    try { pdf = await openPdf(bytes); }
    catch (e) {
      if (e?.name !== 'PasswordException') throw new Error('No se pudo leer el PDF (¿archivo dañado?)');
      for (;;) {
        const pw = await ask('PDF protegido', { label: 'Escribe la contraseña', type: 'password' });
        if (pw === null) return;
        try { pdf = await openPdf(bytes, pw); password = pw; break; } catch { toast('Contraseña incorrecta', 'err'); }
      }
    }
    let readonly = false;
    try { readonly = await ops.isEncrypted(bytes); } catch { readonly = true; }
    narrator.stop();
    this.doc = { id: rec.id, name: rec.name, kind: rec.kind, bytes, pdf, history: [], tab: 'view', readonly, password };
    store.updateMeta(rec.id, { opened: Date.now(), pages: pdf.numPages });
    if (!rec.thumb) this.updateThumb();
    this.go('doc');
  },

  async updateThumb() {
    const d = this.doc;
    try {
      const { canvas } = await pageToBlob(d.pdf, 1, { scale: 0.35 });
      await store.updateMeta(d.id, { thumb: canvas.toDataURL('image/jpeg', 0.7) });
    } catch { /* miniatura opcional */ }
  },

  /** Sustituye el documento por una versión nueva (con deshacer) y lo guarda. */
  async apply(bytes, label, { keepTab = true } = {}) {
    const d = this.doc;
    d.history.push({ bytes: d.bytes, label, readonly: d.readonly });
    if (d.history.length > 15) d.history.shift();
    await this._swap(bytes);
    toast(label + ' ✓');
    if (!keepTab) d.tab = 'view';
    this.render();
  },
  async _swap(bytes) {
    const d = this.doc;
    d.pdf?.destroy?.();
    d.bytes = bytes; d.pdf = await openPdf(bytes, d.password || undefined).catch(() => openPdf(bytes)); d.text = null; d.editedText = undefined;
    try { d.readonly = await ops.isEncrypted(bytes); } catch { /* sin cambio */ }
    await this.persist();
    this.updateThumb();
  },
  async undo() {
    const d = this.doc;
    const last = d.history.pop();
    if (!last) return toast('Nada que deshacer', 'warn');
    await this._swap(last.bytes);
    toast('Deshecho: ' + last.label);
    this.render();
  },
  async persist() { const d = this.doc; await store.saveDoc({ id: d.id, name: d.name, pages: d.pdf.numPages, kind: d.kind }, d.bytes); },

  async saveNew(bytes, name, { open = true, kind } = {}) {
    const rec = await store.saveDoc({ name: safeFileName(name), kind, folder: this.libFolder || '' }, bytes);
    queueSummaries(this.settings.ai, [rec.id]);
    if (open) await this.loadDoc(bytes, rec);
    return rec;
  },

  async deleteCurrent() { await store.deleteDoc(this.doc.id); this.doc = null; toast('Eliminado'); this.go('library'); },

  /** Renderiza todas las páginas a JPG y crea un PDF nuevo (comprimir / último recurso para desbloquear). */
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

  /** Quita la protección: descifra con la contraseña conocida (o vacía para PDF con solo restricciones). */
  async unlockCopy({ copy = false } = {}) {
    const d = this.doc;
    let pw = d.password || '';
    for (let tries = 0; tries < 3; tries++) {
      try {
        const out = await ops.decrypt(d.bytes, pw);
        d.password = '';
        if (copy) { await this.saveNew(out, d.name.replace(/\.pdf$/i, '') + ' (sin contraseña).pdf'); toast('Copia sin contraseña guardada ✓'); }
        else await this.apply(out, 'Protección eliminada');
        return;
      } catch {
        pw = await ask('Contraseña del propietario', { label: 'Este PDF tiene restricciones de edición. Escribe la contraseña para quitarlas.', type: 'password' });
        if (pw === null) break;
      }
    }
    if (await confirmBox('Copia editable', 'Sin la contraseña se puede crear una copia editable convirtiendo las páginas en imágenes. ¿Crearla?', { okLabel: 'Crear copia' })) {
      const out = await this.rasterize({ scale: 2, quality: 0.85 });
      await this.saveNew(out, d.name.replace(/\.pdf$/i, '') + ' (editable).pdf');
    }
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

  /** Herramientas que necesitan un PDF: lo pide (teléfono o archivos) y ejecuta la acción. */
  async withDoc(action) {
    const docs = await store.listDocs();
    let picked = null, v = 'device';
    if (docs.length) {
      v = await modal('Elige un PDF', h('div', { class: 'list' }, docs.slice(0, 8).map(r => h('button', { class: 'list-item', onclick: () => { picked = r; document.querySelector('#modals .modal:last-child .icon-btn').click(); } },
        thumbEl(r), h('span', { class: 'li-txt' }, h('b', {}, r.name), h('small', {}, formatBytes(r.size)))))),
      [{ label: 'Del teléfono…', value: 'device', primary: true }]);
    }
    if (picked) await this.openRecord(picked);
    else if (v === 'device') await openFromDevice();
    else return;
    if (this.doc) await docActions[action]?.(this);
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
  if (t === 'auto') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = t;
}

function topBar() {
  if (app.view === 'doc' && app.doc) {
    const d = app.doc;
    return [
      h('button', { class: 'icon-btn', 'aria-label': 'Volver', onclick: () => app.closeDoc() }, icon('back')),
      h('div', { class: 'title-block' }, h('div', { class: 'doc-title', title: d.name }, d.name),
        h('div', { class: 'small muted' }, `${d.pdf.numPages} pág. · ${formatBytes(d.bytes.length)}`, d.readonly ? h('span', { class: 'badge warn' }, icon('lock', 12), 'protegido') : null)),
      h('button', { class: 'icon-btn', 'aria-label': 'Deshacer', disabled: !d.history.length || undefined, onclick: () => app.undo() }, icon('undo')),
      h('button', { class: 'icon-btn', 'aria-label': 'Compartir', onclick: () => shareFile(d.bytes, safeFileName(d.name)).catch(e => toast(e.message, 'err')) }, icon('share')),
    ];
  }
  const titles = { library: 'Mis archivos', create: 'Crear documento', settings: 'Ajustes', merge: 'Unir PDF' };
  if (app.view === 'home') {
    const hour = new Date().getHours();
    return [h('div', { class: 'brand' }, h('span', { class: 'logo' }, h('img', { src: BASE + 'logo-mark.png', alt: '' })),
      h('div', {}, h('div', { class: 'small hello' }, hour < 12 ? 'Buenos días' : hour < 19 ? 'Buenas tardes' : 'Buenas noches'), h('b', {}, 'ArtCraft PDF'))),
      h('span', { class: 'grow' }),
      h('button', { class: 'icon-btn', 'aria-label': 'Buscar', onclick: () => app.go('library') }, icon('search'))];
  }
  return [h('button', { class: 'icon-btn', 'aria-label': 'Inicio', onclick: () => app.go('home') }, icon('back')), h('h2', {}, titles[app.view] || '')];
}

/* ---------- Inicio ---------- */
async function openFromDevice() {
  const files = await pickFiles({ accept: 'application/pdf', multiple: false });
  if (!files.length) return;
  const b = busy('Abriendo…');
  try { await app.openBytes(await readBytes(files[0]), files[0].name); }
  catch (e) { toast(e.message, 'err'); } finally { b.done(); }
}

const GROUPS = [
  ['Escanear', [
    ['scan', 'Documento', '#6d5dfc', () => openScanner(app)],
    ['idcard', 'Tarjeta ID', '#8b5cf6', () => openScanner(app, { mode: 'id' })],
    ['passport', 'Pasaporte', '#0f766e', () => openScanner(app, { mode: 'passport' })],
    ['book', 'Libro', '#14b8a6', () => openScanner(app, { mode: 'book' })],
    ['text', 'Foto a texto', '#f59e0b', () => openScanner(app, { mode: 'ocr' })],
    ['qr', 'Lector QR', '#334155', () => openScanner(app, { mode: 'qr' })],
    ['image', 'Fotos a PDF', '#ea580c', async () => { const f = await pickFiles({ accept: 'image/*', multiple: true }); if (f.length) openScanner(app, { importFiles: f }); }],
    ['wand', 'Mejorar con IA', '#c026d3', () => enhanceChooser()],
  ]],
  ['Editar y organizar', [
    ['textedit', 'Editar texto', '#0ea5e9', () => app.withDoc('textedit')],
    ['sign', 'Firmar', '#2563eb', () => app.withDoc('sign')],
    ['split', 'Páginas', '#475569', () => app.withDoc('pages')],
    ['merge', 'Unir PDF', '#db2777', () => app.go('merge')],
  ]],
  ['Convertir y proteger', [
    ['word', 'PDF a Word', '#1d4ed8', () => app.withDoc('word')],
    ['compress', 'Comprimir', '#16a34a', () => app.withDoc('compress')],
    ['key', 'Proteger', '#b45309', () => app.withDoc('protect')],
    ['unlock', 'Quitar contraseña', '#dc2626', () => app.withDoc('unlock')],
  ]],
  ['Inteligencia artificial', [
    ['translate', 'Traducir PDF', '#10b981', () => app.withDoc('translate')],
    ['ai', 'Resumir', '#9333ea', () => app.withDoc('summarize')],
    ['voice', 'Escuchar', '#0891b2', () => app.withDoc('narrate')],
    ['chat', 'Preguntar', '#7c3aed', () => app.withDoc('chat')],
  ]],
];

/** "Mejorar con IA": fotos nuevas (escáner) o un PDF escaneado ya guardado. */
async function enhanceChooser() {
  const v = await modal('Mejorar con IA', h('p', { class: 'muted' }, 'Nano Banana deja cada página como un escaneo profesional: sin sombras, manchas ni dedos, con el papel blanco y la tinta nítida.'),
    [{ label: 'Un PDF guardado', value: 'pdf' }, { label: 'Fotos de la galería', value: 'img', primary: true }]);
  if (v === 'img') { const f = await pickFiles({ accept: 'image/*', multiple: true }); if (f.length) openScanner(app, { importFiles: f, retouch: true }); }
  if (v === 'pdf') app.withDoc('enhance');
}

function toolTile([ic, label, color, fn]) {
  return h('button', { class: 'tile', style: { '--c': color }, onclick: () => Promise.resolve(fn()).catch(e => toast(e.message, 'err')) },
    h('span', { class: 'tile-ic' }, icon(ic, 24)), h('span', { class: 'tile-l' }, label));
}

function recentCard(r) {
  return h('button', { class: 'rcard', 'data-id': r.id, onclick: () => app.openRecord(r) },
    h('span', { class: 'rcard-img' }, r.thumb ? h('img', { src: r.thumb, alt: '', loading: 'lazy' }) : icon(r.kind === 'scan' ? 'scan' : 'file', 30)),
    h('b', {}, r.name.replace(/\.pdf$/i, '')),
    r.summary ? h('span', { class: 'doc-sum' }, r.summary) : h('small', { class: 'muted' }, relTime(r.updated)));
}

function homeView() {
  const recent = h('div', { class: 'rcards' });
  const recentHead = h('div', { class: 'section-head' }, h('h3', {}, 'Recientes'), h('button', { class: 'btn sm ghost', onclick: () => app.go('library') }, 'Ver todo'));
  const off = onSummary((id, summary) => {
    if (!recent.isConnected) return off();
    const el = recent.querySelector(`[data-id="${id}"]`);
    if (el) store.listDocs().then(ds => { const r = ds.find(x => x.id === id); if (r) el.replaceWith(recentCard(r)); });
  });
  store.listDocs().then(docs => {
    queueSummaries(app.settings.ai, docs.slice(0, 8).filter(d => !d.summary && !d.summaryFailed).map(d => d.id));
    if (!docs.length) { recentHead.remove(); recent.remove(); return; } // biblioteca vacía: las herramientas suben
    docs.slice(0, 8).forEach(r => recent.append(recentCard(r)));
  });
  const ai = app.settings.ai;
  return h('div', { class: 'stack home' },
    h('div', { class: 'hero-card' },
      h('div', { class: 'hero-text' }, h('span', { class: 'hero-kicker' }, icon('ai', 14), 'Escáner y PDF con IA'), h('h1', {}, 'Tus documentos, perfectos en segundos')),
      h('div', { class: 'hero-actions' },
        h('button', { class: 'hero-main', onclick: () => openScanner(app) }, icon('scan', 22), 'Escanear'),
        h('button', { class: 'hero-sec', onclick: openFromDevice }, icon('open', 20), 'Abrir PDF'))),
    h('button', { class: 'searchbar fake', onclick: () => app.go('library') }, icon('search', 18), h('span', {}, 'Buscar en tus documentos…')),
    !ai.key ? h('button', { class: 'promo', onclick: () => app.go('settings') }, h('span', { class: 'promo-ic' }, icon('ai', 22)),
      h('span', { class: 'li-txt' }, h('b', {}, 'Activa la IA gratis con Gemini'), h('small', {}, 'Traducir, resumir, voz natural y mejorar escaneos')), icon('back', 18)) : null,
    recentHead,
    recent,
    GROUPS.map(([title, tools]) => h('section', { class: 'tool-group' }, h('h3', { class: 'group-title' }, title), h('div', { class: 'tiles' }, tools.map(toolTile)))),
  );
}

function thumbEl(r) {
  return r.thumb ? h('span', { class: 'li-thumb' }, h('img', { src: r.thumb, alt: '', loading: 'lazy' })) : h('span', { class: 'li-ic pdf' }, r.kind === 'scan' ? icon('scan', 20) : 'PDF');
}

function docItem(r, onChange) {
  const open = () => app.openRecord(r);
  const refresh = () => (onChange ? onChange() : app.render());
  const menu = async (e) => {
    e.stopPropagation();
    const folders = (await store.getKV('folders', [])) || [];
    const v = await modal(r.name, h('div', { class: 'stack' },
      r.summary ? h('p', { class: 'doc-sum big' }, icon('ai', 14), r.summary) : null,
      h('p', { class: 'small muted' }, `${r.pages ? r.pages + ' pág. · ' : ''}${formatBytes(r.size)} · ${new Date(r.updated).toLocaleString('es')}${r.folder ? ' · 📁 ' + (folders.find(f => f.id === r.folder)?.name || '') : ''}`)), [
      { label: 'Eliminar', value: 'del', danger: true }, { label: 'Renombrar', value: 'ren' }, { label: 'Mover a carpeta', value: 'move' },
      { label: r.fav ? 'Quitar favorito' : 'Favorito', value: 'fav' }, { label: app.settings.ai?.key ? 'Resumir con IA' : '', value: 'sum' }, { label: 'Abrir', value: 'open', primary: true }].filter(x => x.label));
    if (v === 'open') open();
    if (v === 'fav') { await store.updateMeta(r.id, { fav: !r.fav }); refresh(); }
    if (v === 'ren') { const n = await ask('Nuevo nombre', { value: r.name.replace(/\.pdf$/i, '') }); if (n) { await store.updateMeta(r.id, { name: safeFileName(n) }); refresh(); } }
    if (v === 'move') { const f = await pickFolder(r.folder); if (f !== null) { await store.updateMeta(r.id, { folder: f }); toast(f ? 'Movido a la carpeta' : 'Movido a Archivos'); refresh(); } }
    if (v === 'sum') { await store.updateMeta(r.id, { summary: '', summaryFailed: false }); queueSummaries(app.settings.ai, [r.id]); toast('Generando el resumen…'); }
    if (v === 'del' && await confirmBox('Eliminar', `¿Eliminar "${r.name}"?`, { okLabel: 'Eliminar', danger: true })) { await store.deleteDoc(r.id); refresh(); }
  };
  return h('div', { class: 'list-item doc', role: 'button', tabindex: 0, 'data-id': r.id, onclick: open, onkeydown: (e) => { if (e.key === 'Enter') open(); } },
    thumbEl(r),
    h('span', { class: 'li-txt' }, h('b', {}, r.fav ? h('span', { class: 'fav' }, icon('star', 13)) : null, r.name),
      r.summary ? h('span', { class: 'doc-sum' }, icon('ai', 12), r.summary)
        : app.settings.ai?.key && !r.summaryFailed ? h('span', { class: 'doc-sum pending' }, icon('ai', 12), 'Generando resumen…') : null,
      h('small', {}, `${r.pages ? r.pages + ' pág. · ' : ''}${formatBytes(r.size)} · ${relTime(r.updated)}`)),
    h('button', { class: 'icon-btn', 'aria-label': 'Opciones de ' + r.name, onclick: menu }, icon('more')));
}

const FOLDER_COLORS = ['#6d5dfc', '#ef5a3c', '#10b981', '#f59e0b', '#0ea5e9', '#db2777', '#475569', '#8b5cf6'];

/** Elige carpeta: devuelve su id, '' para "sin carpeta" o null si se cancela. */
async function pickFolder(current = '') {
  const folders = (await store.getKV('folders', [])) || [];
  let chosen = null;
  const pick = (id) => { chosen = id; document.querySelector('#modals .modal:last-child .icon-btn').click(); };
  const v = await modal('Mover a carpeta', h('div', { class: 'list' },
    h('button', { class: 'list-item' + (!current ? ' accent' : ''), onclick: () => pick('') }, h('span', { class: 'li-ic' }, icon('home')), h('span', { class: 'li-txt' }, h('b', {}, 'Archivos (sin carpeta)'))),
    folders.map(f => h('button', { class: 'list-item' + (f.id === current ? ' accent' : ''), onclick: () => pick(f.id) }, h('span', { class: 'li-ic folder-ic', style: { '--c': f.color } }, icon('folder')), h('span', { class: 'li-txt' }, h('b', {}, f.name))))),
  [{ label: 'Nueva carpeta…', value: 'new', primary: true }]);
  if (v === 'new') { const f = await createFolder(); return f ? f.id : null; }
  return chosen;
}

async function createFolder() {
  const name = (await ask('Nueva carpeta', { placeholder: 'Ej.: Facturas 2026' }))?.trim();
  if (!name) return null;
  const folders = (await store.getKV('folders', [])) || [];
  const f = { id: store.uid(), name: name.slice(0, 40), color: FOLDER_COLORS[folders.length % FOLDER_COLORS.length], created: Date.now() };
  await store.setKV('folders', [...folders, f]);
  toast('Carpeta creada');
  return f;
}

function relTime(t) {
  const s = (Date.now() - t) / 1000;
  if (s < 60) return 'ahora';
  if (s < 3600) return `hace ${Math.floor(s / 60)} min`;
  if (s < 86400) return `hace ${Math.floor(s / 3600)} h`;
  if (s < 86400 * 7) return `hace ${Math.floor(s / 86400)} d`;
  return new Date(t).toLocaleDateString('es');
}

/* ---------- Biblioteca ---------- */
function libraryView() {
  const list = h('div', { class: 'list' });
  const folderBox = h('div', { class: 'folders' });
  const crumbs = h('div', { class: 'crumbs' });
  const q = h('input', { type: 'search', placeholder: 'Buscar por nombre o contenido…', 'aria-label': 'Buscar', oninput: () => draw() });
  const usage = h('p', { class: 'small muted center' });
  let docs = [], folders = [];
  const sorters = { recent: (a, b) => b.updated - a.updated, name: (a, b) => a.name.localeCompare(b.name, 'es'), size: (a, b) => b.size - a.size };
  const draw = () => {
    const f = q.value.trim().toLowerCase();
    const inFolder = app.libFolder || '';
    const cur = folders.find(x => x.id === inFolder);
    // Con búsqueda se buscan todos los documentos; sin ella, solo los de la carpeta actual
    const shown = docs.filter(d => (f ? (d.name + ' ' + (d.summary || '')).toLowerCase().includes(f) : (d.folder || '') === inFolder)
      && (app.libFilter === 'all' || (app.libFilter === 'fav' && d.fav) || (app.libFilter === 'scan' && d.kind === 'scan')))
      .sort(sorters[app.libSort]);
    crumbs.replaceChildren(...(cur ? [
      h('button', { class: 'crumb', onclick: () => { app.libFolder = ''; draw(); } }, icon('back', 16), 'Archivos'),
      h('span', { class: 'crumb-cur', style: { '--c': cur.color } }, icon('folder', 16), cur.name),
      h('button', { class: 'icon-btn', 'aria-label': 'Opciones de la carpeta', onclick: () => folderMenu(cur) }, icon('more')),
    ] : []));
    folderBox.replaceChildren(...(cur || f ? [] : [
      ...folders.map(fo => {
        const n = docs.filter(d => d.folder === fo.id).length;
        return h('button', { class: 'folder', style: { '--c': fo.color }, onclick: () => { app.libFolder = fo.id; draw(); } },
          h('span', { class: 'folder-ic' }, icon('folder', 22)), h('b', {}, fo.name), h('small', {}, `${n} doc.`));
      }),
      h('button', { class: 'folder new', onclick: async () => { if (await createFolder()) load(); } }, h('span', { class: 'folder-ic' }, icon('plus', 22)), h('b', {}, 'Nueva carpeta'), h('small', {}, ' ')),
    ]));
    list.replaceChildren(...(shown.length ? shown.map(r => docItem(r, load)) : [h('div', { class: 'empty' }, icon(cur ? 'folder' : 'layers', 32), h('span', { class: 'muted' }, f ? 'Sin resultados' : cur ? 'Carpeta vacía. Mueve documentos aquí desde su menú ⋯' : 'No hay documentos sueltos'))]));
  };
  async function folderMenu(fo) {
    const v = await modal(fo.name, h('p', { class: 'small muted' }, `${docs.filter(d => d.folder === fo.id).length} documento(s)`),
      [{ label: 'Eliminar carpeta', value: 'del', danger: true }, { label: 'Renombrar', value: 'ren', primary: true }]);
    if (v === 'ren') {
      const n = (await ask('Nombre de la carpeta', { value: fo.name }))?.trim();
      if (n) { await store.setKV('folders', folders.map(x => (x.id === fo.id ? { ...x, name: n.slice(0, 40) } : x))); load(); }
    }
    if (v === 'del' && await confirmBox('Eliminar carpeta', 'Los documentos no se borran: vuelven a Archivos.', { okLabel: 'Eliminar carpeta', danger: true })) {
      for (const d of docs.filter(x => x.folder === fo.id)) await store.updateMeta(d.id, { folder: '' });
      await store.setKV('folders', folders.filter(x => x.id !== fo.id));
      app.libFolder = ''; load();
    }
  }
  const load = async () => {
    [docs, folders] = await Promise.all([store.listDocs(), store.getKV('folders', []).then(x => x || [])]);
    draw();
    const u = await store.usage();
    usage.textContent = `${docs.length} documento(s) · ${folders.length} carpeta(s) · ${formatBytes(docs.reduce((a, d) => a + (d.size || 0), 0))}${u?.quota ? ' · libre ~' + formatBytes(u.quota - u.usage) : ''}`;
    queueSummaries(app.settings.ai, docs.filter(d => !d.summary && !d.summaryFailed).slice(0, 6).map(d => d.id));
  };
  const off = onSummary((id, summary) => {
    if (!list.isConnected) return off();
    const d = docs.find(x => x.id === id); if (d) { d.summary = summary; draw(); }
  });
  load();
  return h('div', { class: 'stack' },
    h('div', { class: 'searchbar' }, icon('search', 18), q),
    h('div', { class: 'row' },
      seg([['all', 'Todos'], ['fav', 'Favoritos'], ['scan', 'Escaneos']], app.libFilter, v => { app.libFilter = v; draw(); }),
      select([['recent', 'Recientes'], ['name', 'Nombre'], ['size', 'Tamaño']], app.libSort, v => { app.libSort = v; draw(); }, { class: 'sort-sel', 'aria-label': 'Ordenar' })),
    crumbs, folderBox, list,
    h('button', { class: 'btn primary block', onclick: async () => {
      const files = await pickFiles({ accept: 'application/pdf', multiple: true });
      if (!files.length) return;
      if (files.length === 1) { const b = busy('Abriendo…'); try { await app.openBytes(await readBytes(files[0]), files[0].name); } catch (e) { toast(e.message, 'err'); } finally { b.done(); } return; }
      const b = busy('Importando…');
      try {
        for (let i = 0; i < files.length; i++) {
          b.set(`Importando ${i + 1} de ${files.length}…`, i / files.length);
          const rec = await store.saveDoc({ name: safeFileName(files[i].name), folder: app.libFolder || '' }, await readBytes(files[i]));
          queueSummaries(app.settings.ai, [rec.id]);
        }
        toast(`${files.length} PDF importados`);
      } catch (e) { toast(e.message, 'err'); } finally { b.done(); load(); }
    } }, icon('open', 18), 'Importar PDF del teléfono'),
    usage);
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
      const prev = body.value;
      const out = await draftDocument(s.ai, desc, b.signal, (t) => { b.set('Escribiendo…'); body.value = (prev ? prev + '\n\n' : '') + t; });
      body.value = prev;
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
      const out = await complete(s.ai, { user: `${how} Responde solo con el texto.\n\n<<<TEXTO\n${body.value}\nTEXTO>>>`, signal: b.signal, onText: () => b.set('Escribiendo…') });
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

/* ---------- Unir ---------- */
const mergeState = { items: [] };
function mergeView() {
  const list = h('div', { class: 'list' });
  const draw = () => list.replaceChildren(...(mergeState.items.length ? mergeState.items.map((it, i) => h('div', { class: 'list-item' },
    h('span', { class: 'li-ic pdf' }, i + 1), h('span', { class: 'li-txt' }, h('b', {}, it.name), h('small', {}, formatBytes(it.bytes.length))),
    h('button', { class: 'icon-btn', 'aria-label': 'Subir', disabled: i === 0 || undefined, onclick: () => { [mergeState.items[i - 1], mergeState.items[i]] = [mergeState.items[i], mergeState.items[i - 1]]; draw(); } }, h('span', { class: 'rot90' }, icon('back', 18))),
    h('button', { class: 'icon-btn', 'aria-label': 'Quitar', onclick: () => { mergeState.items.splice(i, 1); draw(); } }, icon('close', 18)))) : [h('p', { class: 'muted center' }, 'Añade dos o más PDF. Se unirán en este orden.')]));
  const fromDevice = async () => {
    const files = await pickFiles({ accept: 'application/pdf', multiple: true });
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
  const status = h('div', { class: 'ai-status' });
  const setStatus = (kind, text) => { status.className = 'ai-status ' + kind; status.textContent = text; };
  if (ai.key) setStatus('', ai.provider === 'gemini' ? `Modelo: ${ai.model === 'auto' ? 'automático' : ai.model}` : `Modelo: ${ai.model}`);

  const modelBox = h('div', { class: 'stack' });
  const keyIn = h('input', { type: 'password', value: ai.key, placeholder: 'Pega aquí tu clave', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false' });
  const keyState = h('div', { class: 'small key-state' });
  const showKeyState = () => {
    const k = ai.key;
    keyState.className = 'small key-state ' + (k ? 'ok' : '');
    keyState.textContent = k ? `✓ Clave guardada (${k.slice(0, 4)}…${k.slice(-4)})${providerForKey(k) ? ' · ' + PROVIDERS[providerForKey(k)].name.replace(/ \(.*/, '') : ''}` : 'Sin clave guardada';
  };
  let refreshT, refreshModels = null;
  // La clave se lee siempre del campo: el autocompletado y algunos teclados de Android no avisan con "input"
  const readKey = () => {
    const v = keyIn.value.replace(/\s+/g, '');
    if (v !== ai.key) {
      ai.key = v;
      const g = providerForKey(v);
      if (g && g !== ai.provider) { ai.provider = g; ai.model = PROVIDERS[g].model; provSel.value = g; renderModel(); toast('Proveedor detectado: ' + PROVIDERS[g].name.replace(/ \(.*/, '')); }
      save();
      clearTimeout(refreshT);
      if (ai.provider === 'gemini' && v.length > 30) refreshT = setTimeout(() => refreshModels?.(), 600);
    }
    showKeyState();
    return ai.key;
  };
  for (const ev of ['input', 'change', 'blur', 'keyup']) keyIn.addEventListener(ev, readKey);
  keyIn.addEventListener('paste', () => setTimeout(readKey, 30));
  const eye = h('button', { class: 'icon-btn key-eye', type: 'button', 'aria-label': 'Mostrar u ocultar la clave', onclick: () => { keyIn.type = keyIn.type === 'password' ? 'text' : 'password'; } }, icon('eye', 20));
  const pasteBtn = h('button', { class: 'btn sm', type: 'button', onclick: async () => {
    try { const t = await navigator.clipboard.readText(); if (t) { keyIn.value = t.trim(); readKey(); } } catch { toast('Mantén pulsado el campo y elige Pegar', 'warn'); }
  } }, icon('copy', 16), 'Pegar');
  const keyLink = h('a', { target: '_blank', rel: 'noopener' });
  const provSel = select(Object.entries(PROVIDERS).map(([k, p]) => [k, p.name]), ai.provider, v => { ai.provider = v; ai.model = PROVIDERS[v].model; renderModel(); save(); });

  function renderModel() {
    keyLink.href = PROVIDERS[ai.provider].keyUrl;
    keyLink.textContent = ai.provider === 'gemini' ? 'Conseguir clave gratis en Google AI Studio →' : 'Conseguir una clave →';
    if (ai.provider === 'gemini') {
      const imgSel = select([['auto', '✨ Automático (el mejor Nano Banana)']], ai.imageModel || 'auto', v => { ai.imageModel = v; save(); });
      const modelSel = select([['auto', '✨ Automático: el mejor disponible']], ai.model || 'auto', v => { ai.model = v; save(); setStatus('', `Modelo: ${v === 'auto' ? 'automático' : v}`); });
      if (ai.model && ai.model !== 'auto') modelSel.append(h('option', { value: ai.model, selected: true }, ai.model));
      const refresh = async () => {
        if (!readKey()) return toast('Primero pega tu clave', 'warn');
        setStatus('busy', 'Consultando los modelos de tu clave…');
        try {
          const ids = await listModels(ai);
          modelSel.replaceChildren(h('option', { value: 'auto' }, `✨ Automático (ahora: ${ids[0] || '—'})`), ...ids.map((id, i) => h('option', { value: id }, `${i === 0 ? '★ ' : ''}${id}${/flash-lite/.test(id) && i === 0 ? ' (recomendado)' : ''}`)));
          modelSel.value = ids.includes(ai.model) ? ai.model : 'auto';
          if (modelSel.value === 'auto') ai.model = 'auto';
          setStatus('ok', `${ids.length} modelos disponibles · el mejor ahora es ${ids[0]}`);
        } catch (e) { setStatus('err', e.message); }
      };
      modelBox.replaceChildren(
        field('Modelo', modelSel, 'En automático la app elige el modelo más nuevo y, si está saturado, pasa al siguiente sin que lo notes.'),
        field('Prioridad', seg(Object.entries(MODES).map(([k, m]) => [k, m.label.replace(/ \(.*/, '')]), ai.mode || 'balanced', v => { ai.mode = v; save(); })),
        h('button', { class: 'btn sm', onclick: refresh }, icon('sort', 16), 'Actualizar lista de modelos'),
        field('Modelo para mejorar escaneos', imgSel, 'Nano Banana corrige fotos de documentos para que parezcan escaneos profesionales.'));
      if (ai.key) listImageModels(ai.key).then(ids => {
        imgSel.replaceChildren(h('option', { value: 'auto' }, ids.length ? `✨ Automático (${imageModelLabel(ids[0])})` : 'Tu clave no tiene Nano Banana'), ...ids.map(id => h('option', { value: id, selected: ai.imageModel === id || undefined }, imageModelLabel(id))));
      }).catch(() => {});
      refreshModels = refresh;
      if (ai.key) refresh();
    } else {
      const modelIn = h('input', { value: ai.model, list: 'models', oninput: () => { ai.model = modelIn.value.trim(); save(); } });
      const dl = h('datalist', { id: 'models' });
      const baseIn = h('input', { value: ai.baseUrl, placeholder: PROVIDERS.openai.baseUrl, oninput: () => { ai.baseUrl = baseIn.value.trim(); save(); } });
      modelBox.replaceChildren(
        ai.provider === 'openai' ? field('URL base (OpenRouter, LM Studio…)', baseIn) : null,
        field('Modelo', h('div', {}, modelIn, dl)),
        h('button', { class: 'btn sm', onclick: async () => {
          try { const ids = await listModels(ai); dl.replaceChildren(...ids.map(id => h('option', { value: id }))); toast(`${ids.length} modelos: toca el campo Modelo`); } catch (e) { toast(e.message, 'err'); }
        } }, 'Ver modelos'));
    }
  }
  renderModel();
  showKeyState();

  const test = async () => {
    if (!readKey()) return toast('Pega tu clave primero', 'warn');
    setStatus('busy', 'Probando…');
    const t0 = performance.now();
    try {
      let txt = '';
      await complete(ai, { user: 'Responde exactamente: Conexión correcta', maxTokens: 200, onText: (t) => { txt = t; setStatus('busy', 'Recibiendo: ' + t.slice(0, 40)); } });
      setStatus('ok', `✓ Funciona con ${lastModel.id} (${((performance.now() - t0) / 1000).toFixed(1)} s): “${txt.trim().slice(0, 40)}”`);
    } catch (e) { setStatus('err', '✗ ' + e.message); }
  };

  const pinState = h('span', { class: 'small muted' }, s.pin ? 'Activado' : 'Desactivado');
  return h('div', { class: 'stack' },
    h('div', { class: 'card' }, h('h3', {}, h('span', { class: 'card-ic', style: { '--c': '#9333ea' } }, icon('ai', 18)), 'Inteligencia artificial'),
      h('p', { class: 'small muted' }, 'Traducir, reescribir, resumir, leer escaneos difíciles y preguntar al documento. Tu clave se guarda solo en este teléfono.'),
      field('Proveedor', provSel), field('Clave de API', h('div', { class: 'key-row' }, keyIn, eye)), h('div', { class: 'row' }, keyState, h('span', { class: 'grow' }), pasteBtn), keyLink, modelBox,
      h('button', { class: 'btn primary', onclick: test }, icon('check', 18), 'Probar conexión'), status),
    h('div', { class: 'card' }, h('h3', {}, h('span', { class: 'card-ic', style: { '--c': '#0891b2' } }, icon('voice', 18)), 'Voz'),
      field('Voz de narración', seg([['ai', '✨ Voz IA natural'], ['device', 'Voz del teléfono']], s.ttsEngine, v => { s.ttsEngine = v; save(); }),
        'La voz IA (Gemini) suena como una persona real, con acento latino. Sin internet se usa la voz del teléfono.'),
      field('Voz IA preferida', select(GEMINI_VOICES, s.aiVoice, v => { s.aiVoice = v; save(); })),
      field('Idioma del dictado', select(LANGUAGES.map(([, n, c]) => [c === 'es-ES' ? 'es-US' : c, c === 'es-ES' ? 'Español (latino)' : n]), s.dictLang, v => { s.dictLang = v; save(); })),
      h('div', { class: 'grid2' },
        field('Velocidad de narración', select([['0.75', 'Lenta'], ['1', 'Normal'], ['1.25', 'Rápida'], ['1.5', 'Muy rápida']], String(s.ttsRate), v => { s.ttsRate = +v; save(); })),
        field('Tono', select([['0.8', 'Grave'], ['1', 'Normal'], ['1.2', 'Agudo']], String(s.ttsPitch), v => { s.ttsPitch = +v; save(); })))),
    h('div', { class: 'card' }, h('h3', {}, h('span', { class: 'card-ic', style: { '--c': '#ef5a3c' } }, icon('file', 18)), 'Documentos y escáner'),
      h('div', { class: 'grid2' },
        field('Página por defecto', select(Object.keys(ops.PAGE_SIZES).map(k => [k, k]), s.pageSize, v => { s.pageSize = v; save(); })),
        field('Letra (pt)', select(['10', '11', '12', '13', '14', '16'].map(x => [x, x]), String(s.fontSize), v => { s.fontSize = +v; save(); }))),
      field('Sonido de escáner al capturar', seg([['on', 'Activado'], ['off', 'Desactivado']], s.scanSound === false ? 'off' : 'on', v => { s.scanSound = v === 'on'; save(); }),
        'No suena si el teléfono está en silencio o vibración.'),
      field('Idiomas del OCR', select([['spa+eng', 'Español + inglés'], ['spa', 'Español'], ['eng', 'Inglés'], ['por', 'Portugués'], ['fra', 'Francés'], ['deu', 'Alemán'], ['ita', 'Italiano'], ['spa+eng+por+fra', 'Varios (más lento)']], s.ocrLangs, v => { s.ocrLangs = v; save(); }),
        'Cada idioma se descarga una vez (2–4 MB) y después funciona sin internet.')),
    h('div', { class: 'card' }, h('h3', {}, h('span', { class: 'card-ic', style: { '--c': '#b45309' } }, icon('lock', 18)), 'Privacidad'),
      h('div', { class: 'row' }, h('span', { class: 'grow' }, h('b', {}, 'Bloqueo con PIN'), h('br'), pinState),
        h('button', { class: 'btn sm', onclick: async () => {
          if (s.pin) { if (await confirmBox('Quitar PIN', '¿Desactivar el bloqueo con PIN?', { okLabel: 'Quitar' })) { s.pin = ''; save(); app.render(); } return; }
          const p1 = await ask('Nuevo PIN', { type: 'password', label: 'De 4 a 8 números' });
          if (!p1 || !/^\d{4,8}$/.test(p1)) return p1 !== null && toast('El PIN debe tener de 4 a 8 números', 'warn');
          const p2 = await ask('Repite el PIN', { type: 'password' });
          if (p1 !== p2) return toast('Los PIN no coinciden', 'err');
          s.pin = await sha(p1); save(); toast('Bloqueo activado'); app.render();
        } }, s.pin ? 'Quitar' : 'Activar')),
      h('div', { class: 'row' }, h('span', { class: 'grow' }, h('b', {}, 'Bloqueo con huella'), h('br'), h('span', { class: 'small muted' }, s.bio ? 'Activado · huella, rostro o el bloqueo del teléfono' : 'Desactivado')),
        h('button', { class: 'btn sm', onclick: async () => {
          if (s.bio) { s.bio = false; save(); return app.render(); }
          try {
            const r = await BiometricAuth.checkBiometry();
            if (!r.isAvailable && !r.deviceIsSecure) return toast('Este teléfono no tiene huella ni bloqueo de pantalla configurado', 'warn');
            bioPrompting = true;
            await BiometricAuth.authenticate({ reason: 'Confirma para activar el bloqueo', androidTitle: 'ArtCraft PDF', androidSubtitle: 'Activar bloqueo con huella', allowDeviceCredential: true, cancelTitle: 'Cancelar' });
            s.bio = true; save(); toast('Bloqueo con huella activado'); app.render();
          } catch (e) { toast(isNative() ? 'No se pudo verificar la huella' : 'La huella solo funciona en la app de Android', 'warn'); }
          finally { setTimeout(() => { bioPrompting = false; }, 1500); }
        } }, s.bio ? 'Quitar' : 'Activar')),
      s.pin || s.bio ? field('Bloquear al volver a la app tras', select([['0', 'Inmediatamente'], ['60', '1 minuto'], ['300', '5 minutos'], ['1800', '30 minutos']], String(s.lockAfter), v => { s.lockAfter = +v; save(); })) : null),
    h('div', { class: 'card' }, h('h3', {}, h('span', { class: 'card-ic', style: { '--c': '#16a34a' } }, icon('save', 18)), 'Copia de seguridad'),
      h('p', { class: 'small muted' }, 'Guarda todos tus documentos, carpetas y resúmenes en un solo archivo .zip para cambiar de teléfono o reinstalar la app.'),
      h('div', { class: 'row wrap' },
        h('button', { class: 'btn sm', onclick: async () => {
          const b = busy('Creando la copia…');
          try {
            const zip = await exportBackup((i, n) => b.set(`Copiando ${i + 1} de ${n}…`, i / Math.max(1, n)));
            const name = `ArtCraft-copia-${new Date().toISOString().slice(0, 10)}.zip`;
            b.done();
            toast('Copia guardada en ' + await saveToDevice(zip, name, 'application/zip'));
            shareFile(zip, name, 'application/zip').catch(() => {});
          } catch (e) { b.done(); toast(e.message, 'err'); }
        } }, icon('save', 16), 'Exportar copia'),
        h('button', { class: 'btn sm', onclick: async () => {
          const [f] = await pickFiles({ accept: 'application/zip,application/x-zip-compressed,application/octet-stream' });
          if (!f) return;
          const b = busy('Restaurando…');
          try { const n = await importBackup(await readBytes(f)); b.done(); toast(`${n} documento(s) restaurados ✓`); } catch (e) { b.done(); toast(e.message, 'err'); }
        } }, icon('open', 16), 'Restaurar copia'))),
    h('div', { class: 'card' }, h('h3', {}, 'Apariencia'),
      seg([['auto', 'Automático'], ['light', 'Claro'], ['dark', 'Oscuro']], s.theme, v => { s.theme = v; applyTheme(v); save(); })),
    h('p', { class: 'small muted center' }, `ArtCraft PDF ${__APP_VERSION__} · ${isNative() ? 'Android' : 'Web'} · Tus documentos se guardan solo en este dispositivo.`),
  );
}

async function sha(text) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('artcraft:' + text));
  return [...new Uint8Array(d)].map(b => b.toString(16).padStart(2, '0')).join('');
}

/** Pantalla de bloqueo con teclado numérico. */
function lockScreen(appRef) {
  if (document.querySelector('.lock')) return;
  const S = appRef.settings;
  let entry = '';
  const dots = h('div', { class: 'lock-dots' });
  const draw = () => dots.replaceChildren(...[...Array(Math.max(4, entry.length))].map((_, i) => h('i', { class: i < entry.length ? 'on' : '' })));
  const el = h('div', { class: 'lock', role: 'dialog', 'aria-label': 'Desbloquear' });
  let unback = null;
  const unlock = () => { el.classList.add('out'); setTimeout(() => el.remove(), 250); unback?.(); };
  const press = async (k) => {
    if (k === 'bio') return bio();
    if (k === 'del') entry = entry.slice(0, -1);
    else if (entry.length < 8) entry += k;
    draw();
    if (entry.length >= 4 && await sha(entry) === S.pin) unlock();
    else if (entry.length >= 8) { el.classList.add('shake'); setTimeout(() => el.classList.remove('shake'), 400); entry = ''; draw(); }
  };
  const msg = h('p', { class: 'muted' }, S.pin ? (S.bio ? 'Usa tu huella o tu PIN' : 'Introduce tu PIN') : 'Usa tu huella para entrar');
  async function bio() {
    if (!S.bio) return;
    bioPrompting = true;
    try {
      await BiometricAuth.authenticate({ reason: 'Desbloquear ArtCraft PDF', androidTitle: 'ArtCraft PDF', androidSubtitle: 'Desbloquea con tu huella', allowDeviceCredential: true, cancelTitle: S.pin ? 'Usar PIN' : 'Cancelar' });
      unlock();
    } catch { msg.textContent = S.pin ? 'Introduce tu PIN' : 'Toca la huella para intentarlo de nuevo'; }
    finally { setTimeout(() => { bioPrompting = false; }, 1500); }
  }
  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', S.bio ? 'bio' : '', '0', 'del'];
  el.append(h('div', { class: 'lock-in' }, h('span', { class: 'logo big' }, h('img', { src: BASE + 'logo-mark.png', alt: '' })), h('h2', {}, 'ArtCraft PDF'), msg,
    S.pin ? dots : null,
    S.pin ? h('div', { class: 'keypad' }, keys.map(k => k ? h('button', { class: 'key' + (k === 'bio' ? ' bio' : ''), 'aria-label': k === 'del' ? 'Borrar' : k === 'bio' ? 'Usar huella' : k, onclick: () => press(k) }, k === 'del' ? icon('back') : k === 'bio' ? icon('finger', 26) : k) : h('span')))
      : h('button', { class: 'finger-big', 'aria-label': 'Usar huella', onclick: bio }, icon('finger', 44))));
  draw();
  document.body.append(el);
  unback = pushBack(() => { exitApp(); });
  if (S.bio) setTimeout(bio, 250);
}

app.init();
