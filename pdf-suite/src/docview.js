// Pantalla de documento: Ver · Editar · Páginas · Texto · IA · Narrar · Más
import { h, icon, toast, ask, modal, confirmBox, busy, pickFiles, readBytes, select, field, seg } from './ui.js';
import { renderPage, allText, pageText, pageToBlob } from './lib/pdfview.js';
import * as ops from './lib/ops.js';
import { parseRanges, safeFileName, formatBytes, LANGUAGES, guessLang, splitSentences } from './lib/text.js';
import { TASKS, STYLES, runTask, askDocument, aiOcr, lastModel } from './lib/ai.js';
import { Narrator, installVoices, deviceVoices, exportAudio } from './lib/voice.js';
import { GEMINI_VOICES } from './lib/gemini.js';
import { ocrImage, ocrLayout } from './lib/ocr.js';
import { pagesToDocx } from './lib/docx-export.js';
import { createTextEditor, pickLanguage, translateDocumentLayout } from './textedit.js';
import { lineWords } from './scanner/scanner.js';
import { enhanceCanvas, enhanceFree, compareDialog } from './enhance.js';
import { saveToDevice, shareFile, shareText } from './lib/native.js';
import { createEditor } from './editor.js';
import { createViewer } from './viewer.js';

const TASK_ICONS = { translate: 'translate', rewrite: 'edit', summarize: 'text', correct: 'check', simplify: 'magic', expand: 'expand', keypoints: 'sort', custom: 'chat' };

const TABS = [['view', 'Ver', 'file'], ['textedit', 'Editar texto', 'textedit'], ['edit', 'Anotar', 'edit'], ['pages', 'Páginas', 'pages'],
  ['text', 'Texto y OCR', 'text'], ['ai', 'IA', 'ai'], ['narrate', 'Narrar', 'voice'], ['more', 'Más', 'more']];

export const narrator = new Narrator();

export function docView(app) {
  const d = app.doc;
  const body = h('div', { class: 'tab-body' });
  const tabBar = h('nav', { class: 'tabs', role: 'tablist', 'aria-label': 'Herramientas del documento' });
  const renderTabs = () => tabBar.replaceChildren(...TABS.map(([id, label, ic]) =>
    h('button', { class: 'tab' + (d.tab === id ? ' on' : ''), role: 'tab', 'aria-selected': String(d.tab === id), onclick: () => switchTab(id) }, icon(ic, 19), h('span', {}, label))));

  async function switchTab(id) {
    if (d.editor?.hasChanges() && d.tab === 'edit' && id !== 'edit') {
      const ok = await confirmBox('Cambios sin aplicar', 'Tienes cambios en el editor que no se han aplicado. ¿Descartarlos?', { okLabel: 'Descartar', danger: true });
      if (!ok) return;
    }
    d.tab = id; renderTabs(); render();
    tabBar.querySelector('.on')?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
  }

  function render() {
    const fn = { view: viewTab, textedit: (a) => (a.doc.readonly ? lockedNotice(a) : createTextEditor(a)), edit: editTab, pages: pagesTab, text: textTab, ai: aiTab, narrate: narrateTab, more: moreTab }[d.tab] || viewTab;
    body.replaceChildren();
    body.append(fn(app));
  }
  app.refreshDoc = render;
  app.switchTab = switchTab;
  renderTabs(); render();
  return h('div', { class: 'docview' }, tabBar, body);
}

/* ---------- Ver ---------- */
function viewTab(app) {
  const d = app.doc;
  const zoomLbl = h('span', { class: 'mono small zoom-lbl' });
  const viewer = createViewer({
    pdf: d.pdf, zoom: d.zoom || 1, scroll: d.viewScroll,
    onZoom: (z) => { d.zoom = z; zoomLbl.textContent = Math.round(z * 100) + '%'; },
    onScroll: (pos) => { d.viewScroll = pos; },
  });
  zoomLbl.textContent = Math.round(viewer.zoom * 100) + '%';
  const list = viewer.el;
  return h('div', { class: 'view-tab' },
    h('div', { class: 'toolbar' },
      h('button', { class: 'icon-btn', 'aria-label': 'Alejar', onclick: () => viewer.setZoom(viewer.zoom / 1.25) }, icon('zout')),
      zoomLbl,
      h('button', { class: 'icon-btn', 'aria-label': 'Acercar', onclick: () => viewer.setZoom(viewer.zoom * 1.25) }, icon('zin')),
      h('button', { class: 'btn sm ghost', onclick: () => viewer.setZoom(1) }, 'Ajustar'),
      h('span', { class: 'grow' }),
      h('button', { class: 'btn sm', onclick: async () => {
        const n = await ask('Ir a la página', { type: 'number', value: '1' });
        if (n) viewer.goTo(+n);
      } }, 'Ir a…'),
      h('button', { class: 'btn sm', 'aria-label': 'Buscar', onclick: () => searchDialog(app, list) }, icon('search', 18)),
    ),
    list,
    h('p', { class: 'hint center' }, 'Pellizca con dos dedos o toca dos veces para acercar; arrastra para moverte por la página.'));
}

async function ensureText(app, { silent = false } = {}) {
  const d = app.doc;
  if (d.text) return d.text;
  const b = silent ? null : busy('Extrayendo texto…');
  try { d.text = await allText(d.pdf, (i, n) => b?.set(`Extrayendo texto… página ${i} de ${n}`, i / n)); }
  finally { b?.done(); }
  return d.text;
}
const joinPages = (pages) => pages.map((t, i) => `[Página ${i + 1}]\n${t}`).join('\n\n');
const plainText = (pages) => pages.filter(Boolean).join('\n\n');

async function searchDialog(app, list) {
  const q = await ask('Buscar en el documento', { placeholder: 'Palabra o frase' });
  if (!q) return;
  const pages = await ensureText(app);
  const needle = q.toLowerCase();
  const hits = pages.map((t, i) => ({ i, n: t.toLowerCase().split(needle).length - 1, t })).filter(x => x.n > 0);
  if (!hits.length) { toast('Sin resultados. Si es un escaneo, usa OCR en la pestaña Texto.', 'warn'); return; }
  const res = h('div', { class: 'list' }, hits.map(x => {
    const k = x.t.toLowerCase().indexOf(needle);
    const snip = x.t.slice(Math.max(0, k - 50), k + q.length + 50).replace(/\s+/g, ' ');
    return h('button', { class: 'list-item', onclick: () => { document.querySelector('#modals .modal:last-child .icon-btn').click(); list.querySelector(`[data-page="${x.i + 1}"]`)?.scrollIntoView({ behavior: 'smooth' }); } },
      h('b', {}, `Página ${x.i + 1}`), h('span', { class: 'small' }, ` · ${x.n} coincidencia(s)`), h('div', { class: 'small muted' }, '…' + snip + '…'));
  }));
  modal(`"${q}" · ${hits.reduce((a, x) => a + x.n, 0)} resultados`, res, []);
}

/* ---------- Editar ---------- */
function editTab(app) {
  const d = app.doc;
  if (d.readonly) return lockedNotice(app);
  d.editor = createEditor({
    getPdf: () => d.pdf, getBytes: () => d.bytes, pageNum: d.editPage || d.editor?.page || 1,
    onDirty: () => {},
    apply: async (bytes, label) => { await app.apply(bytes, label, { keepTab: true }); },
  });
  d.editPage = null;
  setTimeout(async () => {
    await d.editor.load().catch(e => toast(e.message, 'err'));
    if (d.pendingTool) { const t = d.pendingTool; d.pendingTool = null; d.editor.selectTool(t); }
  }, 0);
  return d.editor.el;
}

function lockedNotice(app) {
  return h('div', { class: 'card' }, h('h3', {}, icon('lock'), ' Documento protegido'),
    h('p', {}, 'Este PDF tiene contraseña o restricciones. Puedes leerlo, extraer el texto, traducirlo y narrarlo. Para editarlo, quita la protección (se conserva el texto original).'),
    h('button', { class: 'btn primary', onclick: () => app.unlockCopy() }, icon('unlock', 18), 'Quitar protección'));
}

/* ---------- Páginas ---------- */
function pagesTab(app) {
  const d = app.doc;
  if (d.readonly) return lockedNotice(app);
  const sel = new Set(d.selPages || []);
  const grid = h('div', { class: 'thumbs' });
  const count = h('span', { class: 'small' });
  const upd = () => { d.selPages = [...sel].sort((a, b) => a - b); count.textContent = sel.size ? `${sel.size} seleccionada(s)` : 'Toca páginas para seleccionarlas'; grid.querySelectorAll('.thumb').forEach(t => t.classList.toggle('on', sel.has(+t.dataset.i))); };
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting || e.target.dataset.done) continue;
      e.target.dataset.done = '1';
      const i = +e.target.dataset.i;
      d.pdf.getPage(i + 1).then(p => renderPage(d.pdf, i + 1, e.target.querySelector('canvas'), 150 / p.getViewport({ scale: 1 }).width)).catch(() => {});
    }
  }, { rootMargin: '300px' });
  for (let i = 0; i < d.pdf.numPages; i++) {
    const t = h('button', { class: 'thumb', 'data-i': i, 'aria-label': 'Página ' + (i + 1), onclick: () => { sel.has(i) ? sel.delete(i) : sel.add(i); upd(); } },
      h('canvas'), h('span', { class: 'tnum' }, i + 1), h('span', { class: 'tcheck' }, icon('check', 16)));
    grid.append(t); io.observe(t);
  }
  const need = (fn) => async () => {
    if (!sel.size) { toast('Selecciona al menos una página', 'warn'); return; }
    try { await fn([...sel].sort((a, b) => a - b)); } catch (e) { toast(e.message, 'err'); }
  };
  const run = async (label, fn) => { const b = busy(label); try { return await fn(); } finally { b.done(); } };
  const n = d.pdf.numPages;
  const actions = [
    ['rotr', 'Girar →', need(async (ix) => app.apply(await run('Girando…', () => ops.rotate(d.bytes, ix, 90)), 'Girar páginas'))],
    ['rotl', 'Girar ←', need(async (ix) => app.apply(await run('Girando…', () => ops.rotate(d.bytes, ix, -90)), 'Girar páginas'))],
    ['trash', 'Eliminar', need(async (ix) => {
      if (!(await confirmBox('Eliminar páginas', `¿Eliminar ${ix.length} página(s)?`, { okLabel: 'Eliminar', danger: true }))) return;
      d.selPages = []; await app.apply(await run('Eliminando…', () => ops.deletePages(d.bytes, ix)), 'Eliminar páginas');
    })],
    ['copy', 'Duplicar', need(async (ix) => app.apply(await run('Duplicando…', () => ops.duplicatePages(d.bytes, ix)), 'Duplicar páginas'))],
    ['back', 'Mover antes', need(async (ix) => {
      if (ix[0] === 0) return toast('Ya está al principio', 'warn');
      const order = [...Array(n).keys()];
      for (const i of ix) [order[i - 1], order[i]] = [order[i], order[i - 1]];
      d.selPages = ix.map(i => i - 1);
      await app.apply(await ops.reorder(d.bytes, order), 'Mover páginas');
    })],
    ['next', 'Mover después', need(async (ix) => {
      if (ix[ix.length - 1] === n - 1) return toast('Ya está al final', 'warn');
      const order = [...Array(n).keys()];
      for (const i of [...ix].reverse()) [order[i + 1], order[i]] = [order[i], order[i + 1]];
      d.selPages = ix.map(i => i + 1);
      await app.apply(await ops.reorder(d.bytes, order), 'Mover páginas');
    })],
    ['split', 'Extraer a PDF nuevo', need(async (ix) => {
      const bytes = await run('Extrayendo…', () => ops.selectPages(d.bytes, ix));
      const rec = await app.saveNew(bytes, `${d.name.replace(/\.pdf$/i, '')} (págs. ${ix.map(i => i + 1).join(',')}).pdf`);
      toast('Guardado en la biblioteca: ' + rec.name);
    })],
    ['plus', 'Página en blanco', async () => {
      const after = sel.size ? Math.max(...sel) : n - 1;
      await app.apply(await ops.insertBlank(d.bytes, after), 'Insertar página en blanco');
    }],
    ['open', 'Insertar otro PDF', async () => {
      const [f] = await pickFiles({ accept: 'application/pdf' });
      if (!f) return;
      const after = sel.size ? Math.max(...sel) : n - 1;
      await app.apply(await run('Insertando…', async () => ops.insertPdf(d.bytes, await readBytes(f), after)), 'Insertar PDF');
    }],
    ['split', 'Dividir…', () => splitDialog(app)],
  ];
  setTimeout(upd, 0);
  return h('div', {},
    h('div', { class: 'toolbar' }, count, h('span', { class: 'grow' }),
      h('button', { class: 'btn sm', onclick: () => { for (let i = 0; i < n; i++) sel.add(i); upd(); } }, 'Todas'),
      h('button', { class: 'btn sm', onclick: () => { sel.clear(); upd(); } }, 'Ninguna'),
      h('button', { class: 'btn sm', onclick: async () => {
        const r = await ask('Seleccionar por rango', { placeholder: 'Ej.: 1-3, 5, 8-' });
        if (r === null) return;
        try { sel.clear(); parseRanges(r, n).forEach(i => sel.add(i)); upd(); } catch (e) { toast(e.message, 'err'); }
      } }, 'Rango…')),
    h('div', { class: 'action-grid' }, actions.map(([ic, label, fn]) => h('button', { class: 'action', onclick: fn }, icon(ic), h('span', {}, label)))),
    grid);
}

async function splitDialog(app) {
  const d = app.doc, n = d.pdf.numPages;
  let mode = 'every';
  const every = h('input', { type: 'number', min: 1, value: 1 });
  const ranges = h('input', { placeholder: 'Ej.: 1-3; 4-6; 7-' });
  const pane = h('div');
  const show = () => pane.replaceChildren(mode === 'every' ? field('Páginas por archivo', every) : field('Grupos separados por punto y coma', ranges));
  const body = h('div', { class: 'stack' }, seg([['every', 'Cada N páginas'], ['ranges', 'Por rangos']], mode, (v) => { mode = v; show(); }), pane);
  show();
  if (!(await modal('Dividir documento', body, [{ label: 'Cancelar', value: false }, { label: 'Dividir', value: true, primary: true }]))) return;
  let groups;
  try {
    if (mode === 'every') { const k = Math.max(1, +every.value || 1); groups = []; for (let i = 0; i < n; i += k) groups.push([...Array(Math.min(k, n - i)).keys()].map(j => i + j)); }
    else groups = ranges.value.split(';').map(s => parseRanges(s, n)).filter(g => g.length);
  } catch (e) { return toast(e.message, 'err'); }
  if (!groups.length) return toast('No hay grupos válidos', 'warn');
  const b = busy('Dividiendo…');
  try {
    const parts = await ops.split(d.bytes, groups);
    const base = d.name.replace(/\.pdf$/i, '');
    for (let k = 0; k < parts.length; k++) await app.saveNew(parts[k], `${base} - parte ${k + 1}.pdf`, { open: false });
    toast(`${parts.length} archivos creados en la biblioteca`);
  } catch (e) { toast(e.message, 'err'); } finally { b.done(); }
}

/* ---------- Texto ---------- */
function textTab(app) {
  const d = app.doc;
  const wrap = h('div', { class: 'stack' });
  (async () => {
    const pages = await ensureText(app);
    const empty = pages.map((t, i) => (t.replace(/\s/g, '').length < 15 ? i : -1)).filter(i => i >= 0);
    if (d.editedText === undefined) d.editedText = plainText(pages);
    const ta = h('textarea', { class: 'bigtext', rows: 18, 'aria-label': 'Texto del documento', oninput: () => { d.editedText = ta.value; stats(); } });
    ta.value = d.editedText;
    const info = h('span', { class: 'small muted' });
    const stats = () => { const w = (ta.value.match(/\S+/g) || []).length; info.textContent = `${w.toLocaleString('es')} palabras · ~${Math.max(1, Math.round(w / 180))} min de lectura`; };
    stats();
    const ocrBtn = async (indices, useAI = !!app.settings.ai?.key) => {
      const langSel = app.settings.ocrLangs || 'spa+eng';
      const b = busy(useAI ? 'Leyendo con IA…' : 'Preparando OCR… (la primera vez descarga el idioma)', { cancellable: true });
      try {
        for (let k = 0; k < indices.length; k++) {
          if (b.signal.aborted) break;
          const i = indices[k];
          b.set(`Reconociendo texto · página ${i + 1} (${k + 1} de ${indices.length})`, k / indices.length);
          const { canvas } = await pageToBlob(d.pdf, i + 1, { scale: 2.2 });
          if (useAI) {
            try {
              const data = canvas.toDataURL('image/jpeg', 0.85).split(',')[1];
              pages[i] = (await aiOcr(app.settings.ai, { mime: 'image/jpeg', data }, b.signal)).trim();
              continue;
            } catch (e) { if (b.signal.aborted) break; toast('IA no disponible, uso el OCR del teléfono: ' + e.message, 'warn'); useAI = false; }
          }
          pages[i] = await ocrImage(canvas, langSel, (p) => b.set(null, (k + p) / indices.length));
        }
        d.text = pages; d.editedText = plainText(pages);
        toast('OCR terminado'); app.refreshDoc();
      } catch (e) { toast('OCR: ' + e.message, 'err'); } finally { b.done(); }
    };
    wrap.append(
      empty.length ? h('div', { class: 'card warn' },
        h('p', {}, empty.length === pages.length ? 'Este PDF parece escaneado (no tiene texto). Usa OCR para reconocerlo.' : `${empty.length} página(s) sin texto (posibles imágenes escaneadas).`),
        h('div', { class: 'row wrap' },
          h('button', { class: 'btn primary', onclick: () => ocrBtn(empty) }, icon('search', 18), `Reconocer texto en ${empty.length} página(s)`),
          d.readonly ? null : h('button', { class: 'btn', onclick: () => docActions.searchable(app, empty) }, icon('textedit', 18), 'Hacer el PDF buscable')),
        h('p', { class: 'small muted' }, app.settings.ai?.key ? 'Se usará la IA (más precisa en fotos difíciles y manuscritos). "Hacer buscable" añade el texto dentro del PDF para seleccionarlo y buscarlo.' : 'Sin clave de IA se usa el OCR del teléfono.')) : null,
      h('div', { class: 'toolbar' }, info, h('span', { class: 'grow' }),
        h('button', { class: 'btn sm', onclick: () => { d.editedText = plainText(d.text); app.refreshDoc(); } }, 'Restaurar')),
      ta,
      h('div', { class: 'action-grid' },
        h('button', { class: 'action', onclick: async () => { await navigator.clipboard.writeText(ta.value).catch(() => {}); toast('Texto copiado'); } }, icon('copy'), h('span', {}, 'Copiar')),
        h('button', { class: 'action', onclick: () => shareText(ta.value, d.name).catch(() => {}) }, icon('share'), h('span', {}, 'Compartir texto')),
        h('button', { class: 'action', onclick: async () => { const where = await saveToDevice(new TextEncoder().encode(ta.value), safeFileName(d.name, '.txt'), 'text/plain'); toast('Guardado en ' + where); } }, icon('save'), h('span', {}, 'Guardar .txt')),
        h('button', { class: 'action', onclick: () => app.textToNewPdf(ta.value, d.name.replace(/\.pdf$/i, '') + ' (editado)') }, icon('file'), h('span', {}, 'Crear PDF con este texto')),
        h('button', { class: 'action', onclick: () => { d.narrateSource = 'text'; app.switchTab('narrate'); } }, icon('voice'), h('span', {}, 'Narrar')),
        h('button', { class: 'action', onclick: () => { d.aiSource = 'edited'; app.switchTab('ai'); } }, icon('ai'), h('span', {}, 'Traducir / reescribir')),
        h('button', { class: 'action', onclick: () => ocrBtn([...pages.keys()]) }, icon('search'), h('span', {}, 'OCR de todo')),
        h('button', { class: 'action', onclick: () => docActions.word(app) }, icon('word'), h('span', {}, 'Exportar a Word')),
      ),
    );
  })().catch(e => wrap.append(h('p', { class: 'err' }, e.message)));
  return wrap;
}

/* ---------- IA ---------- */
function aiTab(app) {
  const d = app.doc, s = app.settings;
  const o = d.aiOpts = d.aiOpts || { task: 'translate', lang: 'en', style: STYLES[0], custom: '', source: d.aiSource || 'doc', range: '' };
  const wrap = h('div', { class: 'stack' });
  if (!s.ai?.key) {
    wrap.append(h('div', { class: 'card warn' }, h('p', {}, 'Para traducir, reescribir, resumir o preguntar al documento necesitas una clave de IA (Claude, Gemini, Groq u OpenAI). Se guarda solo en este teléfono.'),
      h('button', { class: 'btn primary', onclick: () => app.go('settings') }, 'Configurar IA')));
  }
  const opts = h('div', { class: 'stack' });
  const renderOpts = () => {
    const t = TASKS[o.task];
    opts.replaceChildren(
      t.needsLang ? field('Idioma de destino', select(LANGUAGES.map(([c, n]) => [c, n]), o.lang, v => { o.lang = v; })) : null,
      t.needsStyle ? field('Estilo', select(STYLES.map(x => [x, x[0].toUpperCase() + x.slice(1)]), o.style, v => { o.style = v; })) : null,
      t.needsCustom ? field('¿Qué quieres que haga la IA?', Object.assign(h('textarea', { rows: 3, placeholder: 'Ej.: Convierte este contrato en una lista de obligaciones de cada parte', oninput: (e) => { o.custom = e.target.value; } }), { value: o.custom })) : null,
    );
  };
  const rangeIn = h('input', { placeholder: 'Ej.: 1-3, 5', value: o.range, oninput: () => { o.range = rangeIn.value; } });
  const rangeField = field('Páginas', rangeIn);
  const srcSel = select([['doc', 'Todo el documento'], ['range', 'Solo algunas páginas'], ['edited', 'Texto editado (pestaña Texto)']], o.source, v => { o.source = v; rangeField.hidden = v !== 'range'; });
  rangeField.hidden = o.source !== 'range';
  renderOpts();

  const modelLbl = h('span', { class: 'small muted' });
  const result = h('textarea', { class: 'bigtext', rows: 14, placeholder: 'Aquí aparecerá el resultado. Puedes editarlo.', oninput: () => { d.aiResult = result.value; } });
  result.value = d.aiResult || '';

  async function getSourceText() {
    if (o.source === 'edited' && d.editedText !== undefined) return d.editedText;
    const pages = await ensureText(app);
    if (o.source === 'range') return parseRanges(o.range, pages.length).map(i => pages[i]).join('\n\n');
    return plainText(pages);
  }

  async function run() {
    if (!s.ai?.key) return app.go('settings');
    let text;
    try { text = await getSourceText(); } catch (e) { return toast(e.message, 'err'); }
    if (!text.trim()) return toast('No hay texto. Si es un escaneo, usa OCR en la pestaña Texto.', 'warn');
    const langName = LANGUAGES.find(l => l[0] === o.lang)?.[1].toLowerCase();
    const b = busy('La IA está trabajando…', { cancellable: true });
    try {
      const out = await runTask(s.ai, o.task, text, { ...o, langName }, (i, n, partial) => {
        b.set(n > 1 ? `Procesando parte ${i} de ${n}…` : 'Terminando…', i / n);
        result.value = partial;
      }, b.signal);
      result.value = d.aiResult = out;
      modelLbl.textContent = lastModel.id ? 'Respondió: ' + lastModel.id : '';
      d.aiLang = o.task === 'translate' ? o.lang : guessLang(out);
      toast('Listo');
    } catch (e) { toast(e.message, 'err'); } finally { b.done(); }
  }

  // Chat con el documento
  d.chat = d.chat || [];
  const chatLog = h('div', { class: 'chat' });
  const renderChat = () => chatLog.replaceChildren(...d.chat.map(m => h('div', { class: 'msg ' + m.role }, m.content)));
  renderChat();
  const q = h('input', { placeholder: 'Pregunta algo sobre el documento…', onkeydown: (e) => { if (e.key === 'Enter') sendQ(); } });
  async function sendQ() {
    const question = q.value.trim();
    if (!question) return;
    if (!s.ai?.key) return app.go('settings');
    q.value = '';
    d.chat.push({ role: 'user', content: question }); renderChat();
    const pending = h('div', { class: 'msg assistant pending' }, 'Pensando…'); chatLog.append(pending);
    try {
      const pages = await ensureText(app, { silent: true });
      const ans = await askDocument(s.ai, joinPages(pages), question, d.chat.slice(0, -1), undefined, (t) => { pending.textContent = t; pending.classList.remove('pending'); });
      d.chat.push({ role: 'assistant', content: ans.trim() });
    } catch (e) { d.chat.push({ role: 'assistant', content: '⚠ ' + e.message }); }
    renderChat(); chatLog.lastChild?.scrollIntoView({ block: 'nearest' });
  }

  wrap.append(
    h('div', { class: 'card' },
      h('div', { class: 'tasks' }, Object.entries(TASKS).map(([id, t]) => h('button', { class: 'task' + (o.task === id ? ' on' : ''), onclick: () => { o.task = id; d.aiResult = result.value; app.refreshDoc(); } },
        icon(TASK_ICONS[id] || 'ai', 20), h('span', {}, t.label.replace(' (lectura fácil)', '').replace(' ortografía y gramática', ''))))),
      opts,
      field('Texto de origen', srcSel), rangeField,
      h('button', { class: 'btn primary block', onclick: run }, icon('ai', 18), 'Ejecutar'),
      o.task === 'translate' && !d.readonly ? h('button', { class: 'btn block', onclick: () => docActions.translateLayout(app, o.lang) }, icon('layers', 18), 'Traducir con el mismo diseño') : null,
      h('p', { class: 'hint' }, `Proveedor: ${s.ai?.provider ? s.ai.provider + ' · ' + (s.ai.model || '') : 'sin configurar'}. El texto se envía a ese servicio; los PDF no salen del teléfono.`)),
    h('div', { class: 'section-head' }, h('h3', {}, 'Resultado'), modelLbl),
    result,
    h('div', { class: 'action-grid' },
      h('button', { class: 'action', onclick: () => app.textToNewPdf(result.value, d.name.replace(/\.pdf$/i, '') + ' (' + TASKS[o.task].label.toLowerCase() + ')') }, icon('file'), h('span', {}, 'Crear PDF')),
      h('button', { class: 'action', onclick: () => { d.narrateSource = 'ai'; app.switchTab('narrate'); } }, icon('voice'), h('span', {}, 'Narrar')),
      h('button', { class: 'action', onclick: () => { d.editedText = result.value; app.switchTab('text'); } }, icon('text'), h('span', {}, 'Pasar a Texto')),
      h('button', { class: 'action', onclick: async () => { await navigator.clipboard.writeText(result.value).catch(() => {}); toast('Copiado'); } }, icon('copy'), h('span', {}, 'Copiar')),
      h('button', { class: 'action', onclick: () => shareText(result.value, d.name).catch(() => {}) }, icon('share'), h('span', {}, 'Compartir')),
    ),
    h('h3', { class: 'section-title' }, icon('chat', 18), ' Preguntar al documento'),
    h('div', { class: 'card' }, chatLog, h('div', { class: 'row' }, q, h('button', { class: 'btn primary', onclick: sendQ }, 'Enviar'))),
  );
  return wrap;
}

/* ---------- Narrar ---------- */
function narrateTab(app) {
  const d = app.doc, s = app.settings;
  const hasAI = s.ai?.provider === 'gemini' && !!s.ai?.key;
  const st = d.narr = d.narr || { source: d.narrateSource || 'doc', fromPage: 1, rate: s.ttsRate || 1, pitch: s.ttsPitch || 1, lang: '', engine: hasAI ? (s.ttsEngine || 'ai') : 'device' };
  if (d.narrateSource) { st.source = d.narrateSource; d.narrateSource = null; }
  if (!hasAI) st.engine = 'device';
  const wrap = h('div', { class: 'stack' });
  const list = h('div', { class: 'sentences', 'aria-live': 'off' });
  const playBtn = h('button', { class: 'round big', 'aria-label': 'Reproducir' }, icon('play', 30));
  const status = h('div', { class: 'small muted center' });
  const wave = h('div', { class: 'wave', 'aria-hidden': 'true' }, [...Array(5)].map(() => h('i')));

  async function sourceText() {
    if (st.source === 'ai') return d.aiResult || '';
    if (st.source === 'text') return d.editedText ?? plainText(await ensureText(app));
    const pages = await ensureText(app);
    return pages.slice(Math.max(0, st.fromPage - 1)).join('\n\n');
  }
  async function loadText() {
    const text = await sourceText();
    narrator.load(text);
    if (!st.lang) st.lang = (LANGUAGES.find(l => l[0] === (st.source === 'ai' && d.aiLang ? d.aiLang : guessLang(text))) || LANGUAGES[0])[2];
    if (st.lang === 'es-ES') st.lang = 'es-US'; // español latino por defecto
    langSel.value = st.lang;
    await fillVoices();
    list.replaceChildren(...narrator.sentences.map((t, i) => h('button', { class: 'sent', 'data-i': i, onclick: () => narrator.seek(i, opts) }, t)));
    status.textContent = narrator.sentences.length ? `${narrator.sentences.length} frases · toca una para empezar desde ahí` : 'No hay texto para narrar (prueba OCR en la pestaña Texto).';
  }
  const opts = () => ({ engine: st.engine, lang: st.lang, rate: st.rate, pitch: st.pitch, voiceId: st.voiceId, aiVoice: st.aiVoice || s.aiVoice || 'Kore', cfg: s.ai });
  narrator.onSentence = (i) => {
    list.querySelectorAll('.sent.on').forEach(x => x.classList.remove('on'));
    const el = list.querySelector(`[data-i="${i}"]`);
    if (el) { el.classList.add('on'); el.scrollIntoView({ block: 'center', behavior: 'smooth' }); }
  };
  narrator.onState = (state, err) => {
    playBtn.replaceChildren(icon(state === 'playing' || state === 'loading' ? 'pause' : 'play', 30));
    playBtn.setAttribute('aria-label', state === 'playing' ? 'Pausa' : 'Reproducir');
    wave.classList.toggle('on', state === 'playing');
    playBtn.classList.toggle('loading', state === 'loading');
    if (state === 'loading') status.textContent = 'Preparando la voz natural…';
    if (state === 'playing') status.textContent = st.engine === 'ai' ? `Voz IA · ${st.aiVoice || s.aiVoice || 'Kore'}` : 'Voz del teléfono';
    if (state === 'fallback') toast('Voz IA no disponible: ' + (err?.message || '') + ' Sigo con la voz del teléfono.', 'warn');
    if (state === 'error') toast('Voz: ' + (err?.message || 'error') + '. Instala voces en Ajustes de Android.', 'err');
  };
  playBtn.onclick = () => (narrator.playing ? narrator.pause() : narrator.play(opts));

  const langSel = select(LANGUAGES.map(([, n, code]) => [code === 'es-ES' ? 'es-US' : code, code === 'es-ES' ? 'Español (latino)' : n]), st.lang, v => { st.lang = v; st.voiceId = ''; narrator.stop(); fillVoices(); });
  const voiceSel = h('select', { 'aria-label': 'Voz', onchange: () => { if (st.engine === 'ai') { st.aiVoice = voiceSel.value; s.aiVoice = voiceSel.value; } else { st.voiceId = voiceSel.value; s.deviceVoice = voiceSel.value; } app.saveSettings(); narrator.stop(); narrator.cache?.clear(); } });
  async function fillVoices() {
    if (st.engine === 'ai') {
      voiceSel.replaceChildren(...GEMINI_VOICES.map(([id, label]) => h('option', { value: id, selected: id === (st.aiVoice || s.aiVoice || 'Kore') || undefined }, label)));
    } else {
      const vs = await deviceVoices(st.lang);
      if (!st.voiceId) st.voiceId = (vs.find(v => v.id === s.deviceVoice) || vs[0])?.id || '';
      voiceSel.replaceChildren(...(vs.length ? vs.map(v => h('option', { value: v.id, selected: v.id === st.voiceId || undefined }, v.label)) : [h('option', { value: '' }, 'Voz predeterminada del sistema')]));
    }
  }
  const engineSeg = seg([['ai', '✨ Voz IA natural'], ['device', 'Voz del teléfono']], st.engine, (v) => {
    if (v === 'ai' && !hasAI) { toast('La voz IA usa tu clave de Gemini: configúrala en Ajustes', 'warn'); return app.go('settings'); }
    st.engine = v; s.ttsEngine = v; app.saveSettings(); narrator.stop(); fillVoices();
  });
  const rate = h('input', { type: 'range', min: 0.5, max: 2, step: 0.05, value: st.rate, oninput: () => { st.rate = +rate.value; rateOut.textContent = st.rate.toFixed(2).replace(/0$/, '') + '×'; if (narrator.audio) narrator.audio.playbackRate = st.rate; } });
  const rateOut = h('span', { class: 'mono small' }, (+st.rate).toFixed(1) + '×');
  const pitch = h('input', { type: 'range', min: 0.5, max: 1.6, step: 0.05, value: st.pitch, oninput: () => { st.pitch = +pitch.value; } });
  const fromPage = h('input', { type: 'number', min: 1, max: d.pdf.numPages, value: st.fromPage, onchange: () => { st.fromPage = +fromPage.value || 1; narrator.stop(); loadText(); } });

  const exportBtn = h('button', { class: 'btn sm', onclick: async () => {
    if (!hasAI) return toast('El audiolibro usa la voz IA: configura Gemini en Ajustes', 'warn');
    const text = narrator.sentences.join(' ');
    if (!text) return;
    const b = busy('Creando audiolibro…', { cancellable: true });
    try {
      const wav = await exportAudio(s.ai, text, { voice: st.aiVoice || s.aiVoice || 'Kore', lang: st.lang, signal: b.signal, onProgress: (i, n) => b.set(`Grabando parte ${Math.min(i + 1, n)} de ${n}…`, i / n) });
      b.done();
      const name = safeFileName(d.name, '.wav');
      toast('Audio guardado en ' + await saveToDevice(wav, name, 'audio/wav'));
      shareFile(wav, name, 'audio/wav').catch(() => {});
    } catch (e) { b.done(); if (e.message !== 'Cancelado') toast(e.message, 'err'); }
  } }, icon('save', 16), 'Guardar como audio');

  wrap.append(
    h('div', { class: 'card' },
      engineSeg,
      st.engine === 'ai' || hasAI ? null : h('p', { class: 'small muted' }, 'Activa Gemini en Ajustes para la voz IA: suena como una persona real y con acento latino.'),
      field('¿Qué narrar?', select([['doc', 'Documento'], ['text', 'Texto editado'], ['ai', 'Resultado de la IA (p. ej. traducción)']], st.source, v => { st.source = v; st.lang = ''; narrator.stop(); loadText(); })),
      st.source === 'doc' ? field('Empezar en la página', fromPage) : null,
      h('div', { class: 'grid2' }, field('Idioma', langSel), field('Voz', voiceSel)),
      h('div', { class: 'grid2' }, field(h('span', {}, 'Velocidad ', rateOut), rate), st.engine === 'device' ? field('Tono', pitch) : null),
      h('div', { class: 'player' },
        h('button', { class: 'round', 'aria-label': 'Frase anterior', onclick: () => narrator.seek(narrator.index - 1, opts) }, icon('prev')),
        playBtn,
        h('button', { class: 'round', 'aria-label': 'Detener', onclick: () => narrator.stop() }, icon('stop')),
        h('button', { class: 'round', 'aria-label': 'Frase siguiente', onclick: () => narrator.seek(narrator.index + 1, opts) }, icon('next'))),
      wave, status,
      h('div', { class: 'row wrap', style: { justifyContent: 'center' } }, exportBtn,
        st.engine === 'device' ? h('button', { class: 'btn sm ghost', onclick: () => installVoices() }, 'Instalar voces de Android') : null)),
    list);
  loadText().catch(e => toast(e.message, 'err'));
  return wrap;
}

/* ---------- Más ---------- */
function moreTab(app) {
  const d = app.doc;
  const item = (ic, label, desc, fn, cls = '') => h('button', { class: 'list-item ' + cls, onclick: () => Promise.resolve(fn()).catch(e => toast(e.message, 'err')) },
    h('span', { class: 'li-ic' }, icon(ic)), h('span', { class: 'li-txt' }, h('b', {}, label), h('small', {}, desc)));
  const guard = (fn) => () => d.readonly ? toast('Documento protegido: quita primero la protección', 'warn') : fn();
  return h('div', { class: 'list' },
    d.readonly ? item('unlock', 'Quitar protección', 'Contraseña o restricciones de edición', () => app.unlockCopy(), 'accent') : null,
    item('wand', 'Mejorar escaneo', 'Gratis en el teléfono o con Nano Banana: como un escáner profesional', guard(() => docActions.enhance(app)), 'accent'),
    item('word', 'Exportar a Word (.docx)', 'Texto editable en Word o Google Docs', () => docActions.word(app)),
    item('layers', 'Traducir conservando el diseño', 'Crea una copia traducida con el mismo aspecto', guard(() => docActions.translate(app))),
    item('textedit', 'Hacer buscable (OCR)', 'Añade texto seleccionable a páginas escaneadas', guard(() => docActions.searchable(app))),
    item('key', 'Proteger con contraseña', 'Cifrado AES-256', guard(() => docActions.protect(app))),
    item('save', 'Guardar en el teléfono', 'Copia en Documentos/AICraftPDF', async () => toast('Guardado en ' + await saveToDevice(d.bytes, safeFileName(d.name)))),
    item('share', 'Compartir', 'WhatsApp, correo, Drive…', () => shareFile(d.bytes, safeFileName(d.name))),
    item('edit', 'Renombrar', d.name, async () => {
      const n = await ask('Nuevo nombre', { value: d.name.replace(/\.pdf$/i, '') });
      if (n) { d.name = safeFileName(n); await app.persist(); app.render(); }
    }),
    item('drop', 'Marca de agua', 'Texto diagonal en todas las páginas', guard(() => watermarkDialog(app))),
    item('hash', 'Numerar páginas', '“Página 1 de N” u otro formato', guard(() => numbersDialog(app))),
    item('form', 'Rellenar formulario', 'Campos interactivos del PDF', guard(() => formDialog(app))),
    item('compress', 'Comprimir', 'Reducir el tamaño (actual: ' + formatBytes(d.bytes.length) + ')', () => compressDialog(app)),
    item('image', 'Exportar páginas como imagen', 'JPG de alta calidad', () => exportImages(app)),
    item('info', 'Propiedades', 'Título, autor, palabras clave', guard(() => metaDialog(app))),
    item('copy', 'Duplicar documento', 'Crea una copia en la biblioteca', async () => { await app.saveNew(d.bytes, d.name.replace(/\.pdf$/i, '') + ' (copia).pdf', { open: false }); toast('Copia creada'); }),
    item('trash', 'Eliminar de la biblioteca', 'No se puede deshacer', async () => {
      if (await confirmBox('Eliminar', `¿Eliminar "${d.name}" de la biblioteca?`, { okLabel: 'Eliminar', danger: true })) await app.deleteCurrent();
    }, 'danger'),
  );
}

async function watermarkDialog(app) {
  const text = h('input', { value: 'CONFIDENCIAL' });
  const color = h('input', { type: 'color', value: '#c0392b' });
  const op = h('input', { type: 'range', min: 0.05, max: 0.6, step: 0.05, value: 0.18 });
  const size = h('input', { type: 'number', value: 60, min: 10, max: 200 });
  const ok = await modal('Marca de agua', h('div', { class: 'stack' }, field('Texto', text), h('div', { class: 'grid2' }, field('Color', color), field('Tamaño', size)), field('Opacidad', op)),
    [{ label: 'Cancelar', value: false }, { label: 'Aplicar', value: true, primary: true }]);
  if (!ok) return;
  await app.apply(await ops.watermark(app.doc.bytes, { text: text.value, color: color.value, opacity: +op.value, size: +size.value }), 'Marca de agua');
}

async function numbersDialog(app) {
  const fmt = h('input', { value: 'Página {n} de {total}' });
  let pos = 'bottom-center';
  const start = h('input', { type: 'number', value: 1, min: 0 });
  const ok = await modal('Numerar páginas', h('div', { class: 'stack' }, field('Formato', fmt, '{n} = número de página, {total} = total'),
    field('Posición', select([['bottom-center', 'Abajo, centro'], ['bottom-right', 'Abajo, derecha'], ['bottom-left', 'Abajo, izquierda'], ['top-center', 'Arriba, centro'], ['top-right', 'Arriba, derecha']], pos, v => { pos = v; })),
    field('Empezar en', start)), [{ label: 'Cancelar', value: false }, { label: 'Aplicar', value: true, primary: true }]);
  if (!ok) return;
  await app.apply(await ops.pageNumbers(app.doc.bytes, { format: fmt.value, position: pos, start: +start.value || 1 }), 'Numerar páginas');
}

async function metaDialog(app) {
  const m = await ops.getMetadata(app.doc.bytes);
  const inputs = Object.fromEntries(['title', 'author', 'subject', 'keywords'].map(k => [k, Object.assign(h('input'), { value: m[k] })]));
  const ok = await modal('Propiedades', h('div', { class: 'stack' },
    field('Título', inputs.title), field('Autor', inputs.author), field('Asunto', inputs.subject), field('Palabras clave (separadas por coma)', inputs.keywords),
    h('p', { class: 'small muted' }, `${m.pages} páginas · ${formatBytes(app.doc.bytes.length)}${m.producer ? ' · Creado con ' + m.producer : ''}`)),
  [{ label: 'Cancelar', value: false }, { label: 'Guardar', value: true, primary: true }]);
  if (!ok) return;
  await app.apply(await ops.setMetadata(app.doc.bytes, Object.fromEntries(Object.entries(inputs).map(([k, v]) => [k, v.value]))), 'Propiedades');
}

async function formDialog(app) {
  const fields = await ops.listFormFields(app.doc.bytes);
  if (!fields.length) return toast('Este PDF no tiene campos de formulario. Usa la pestaña Editar para escribir encima.', 'warn');
  const ctrls = {};
  const rows = fields.filter(f => f.kind !== 'other').map(f => {
    let c;
    if (f.kind === 'checkbox') { c = h('input', { type: 'checkbox' }); c.checked = f.value; }
    else if (f.kind === 'select' || f.kind === 'radio') c = select([['', '—'], ...f.options.map(o => [o, o])], f.value, () => {});
    else { c = h('input'); c.value = f.value; }
    ctrls[f.name] = c;
    return field(f.name, c);
  });
  const flat = h('input', { type: 'checkbox' });
  const ok = await modal('Rellenar formulario', h('div', { class: 'stack' }, rows, h('label', { class: 'row small' }, flat, ' Aplanar (los campos dejan de ser editables)')),
    [{ label: 'Cancelar', value: false }, { label: 'Guardar', value: true, primary: true }], { wide: true });
  if (!ok) return;
  const values = Object.fromEntries(Object.entries(ctrls).map(([k, c]) => [k, c.type === 'checkbox' ? c.checked : c.value]));
  await app.apply(await ops.fillForm(app.doc.bytes, values, { flatten: flat.checked }), 'Rellenar formulario');
}

async function compressDialog(app) {
  let level = 'medium';
  const ok = await modal('Comprimir', h('div', { class: 'stack' },
    seg([['lossless', 'Sin pérdida'], ['medium', 'Media'], ['strong', 'Fuerte']], level, v => { level = v; }),
    h('p', { class: 'small' }, '“Sin pérdida” reorganiza el archivo. “Media” y “Fuerte” convierten las páginas en imágenes JPG (ideal para escaneos; el texto deja de ser seleccionable). El original se conserva hasta que pulses Deshacer o elijas otra cosa.')),
  [{ label: 'Cancelar', value: false }, { label: 'Comprimir', value: true, primary: true }]);
  if (!ok) return;
  const before = app.doc.bytes.length;
  let out;
  if (level === 'lossless') out = await ops.optimize(app.doc.bytes);
  else out = await app.rasterize({ scale: level === 'strong' ? 1.1 : 1.6, quality: level === 'strong' ? 0.5 : 0.7 });
  if (out.length >= before) return toast('No se pudo reducir más el tamaño', 'warn');
  if (app.doc.readonly) { await app.saveNew(out, app.doc.name.replace(/\.pdf$/i, '') + ' (comprimido).pdf'); }
  else await app.apply(out, 'Comprimir');
  toast(`${formatBytes(before)} → ${formatBytes(out.length)} (−${Math.round((1 - out.length / before) * 100)}%)`);
}

async function exportImages(app) {
  const d = app.doc;
  const r = await ask('Exportar como imagen', { label: `Páginas (1-${d.pdf.numPages})`, value: d.pdf.numPages > 1 ? '1-' + d.pdf.numPages : '1' });
  if (r === null) return;
  let idx; try { idx = parseRanges(r, d.pdf.numPages); } catch (e) { return toast(e.message, 'err'); }
  const b = busy('Exportando…');
  try {
    const base = d.name.replace(/\.pdf$/i, '');
    let where = '';
    for (let k = 0; k < idx.length; k++) {
      b.set(`Página ${idx[k] + 1} (${k + 1}/${idx.length})`, k / idx.length);
      const { blob } = await pageToBlob(d.pdf, idx[k] + 1, { scale: 2.5, quality: 0.9 });
      const name = safeFileName(`${base} - página ${idx[k] + 1}`, '.jpg');
      const bytes = new Uint8Array(await blob.arrayBuffer());
      if (idx.length === 1) { b.done(); await shareFile(bytes, name, 'image/jpeg'); return; }
      where = await saveToDevice(bytes, name, 'image/jpeg');
    }
    toast(`${idx.length} imágenes guardadas en ${where.replace(/\/[^/]*$/, '')}`);
  } catch (e) { toast(e.message, 'err'); } finally { b.done(); }
}

export { ensureText, plainText, splitSentences };

/* ---------- Acciones reutilizables (también desde las herramientas de Inicio) ---------- */
export const docActions = {
  textedit: (app) => app.switchTab('textedit'),
  unlock: async (app) => {
    if (!app.doc.readonly && !app.doc.password) return toast('Este PDF no tiene contraseña ni restricciones', 'ok');
    await app.unlockCopy({ copy: true });
  },
  sign: (app) => { app.doc.pendingTool = 'sign'; app.switchTab('edit'); },
  summarize: (app) => { app.doc.aiOpts = { ...(app.doc.aiOpts || {}), task: 'summarize', source: 'doc' }; app.switchTab('ai'); },
  narrate: (app) => app.switchTab('narrate'),
  pages: (app) => app.switchTab('pages'),
  chat: (app) => { app.doc.aiOpts = { ...(app.doc.aiOpts || {}), focusChat: true }; app.switchTab('ai'); setTimeout(() => document.querySelector('.chat + .row input')?.focus(), 300); },
  /** Mejora páginas escaneadas con Nano Banana: la página se sustituye por la imagen mejorada y se rehace la capa de texto. */
  async enhance(app) {
    const s = app.settings;
    const d = app.doc, n = d.pdf.numPages;
    if (d.readonly) return toast('Quita primero la protección del PDF', 'warn');
    const r = await ask('Mejorar escaneo', { label: `Páginas a mejorar (1-${n})`, value: n > 1 ? `1-${n}` : '1' });
    if (r === null) return;
    let idx; try { idx = parseRanges(r, n); } catch (e) { return toast(e.message, 'err'); }
    if (!idx.length) return;
    let b = busy('Mejorando el escaneo…', { cancellable: true });
    let bytes = d.bytes, tune = null, engine = null;
    const layers = [];
    try {
      for (let k = 0; k < idx.length; k++) {
        if (b.signal.aborted) throw new Error('Cancelado');
        const i = idx[k];
        b.set(`Mejorando página ${i + 1} (${k + 1} de ${idx.length})…`, k / idx.length);
        const page = await d.pdf.getPage(i + 1);
        const vp1 = page.getViewport({ scale: 1 });
        const scale = 2000 / Math.max(vp1.width, vp1.height);
        const { canvas } = await pageToBlob(d.pdf, i + 1, { scale });
        let better = engine === 'free' ? await enhanceFree(s.ai, canvas, { ...tune, analyze: false }) : await enhanceCanvas(s.ai, canvas, b.signal);
        if (k === 0) {
          b.done();
          better = await compareDialog(canvas, better, { cfg: s.ai, note: idx.length > 1 ? `Así quedará la página ${i + 1}. Si te gusta, se mejorarán las ${idx.length} páginas con el mismo ajuste.` : undefined });
          if (!better) return;
          engine = better.engine; tune = better.tune;
          b = busy('Aplicando la mejora…', { cancellable: true });
        }
        const blob = await new Promise(res => better.toBlob(res, 'image/jpeg', 0.9));
        bytes = await ops.replacePageWithImage(bytes, i, new Uint8Array(await blob.arrayBuffer()));
        // texto seleccionable de nuevo (la página ahora es una imagen)
        try {
          const vp = page.getViewport({ scale: scale * better.width / canvas.width });
          const lay = await ocrLayout(better, s.ocrLangs);
          layers.push({ index: i, words: lineWords(lay.lines).map(w => {
            const [x0, y0] = vp.convertToPdfPoint(w.bbox.x0, w.bbox.y1), [x1, y1] = vp.convertToPdfPoint(w.bbox.x1, w.bbox.y0);
            return { text: w.text, x: Math.min(x0, x1), y: Math.min(y0, y1), w: Math.abs(x1 - x0), h: Math.abs(y1 - y0) };
          }) });
        } catch { /* sin OCR: la página queda como imagen */ }
      }
      if (layers.length) bytes = await ops.addTextLayer(bytes, layers);
      b.done();
      await app.apply(bytes, `${idx.length} página(s) mejoradas`);
    } catch (e) { b.done(); if (e.message !== 'Cancelado') toast(e.message, 'err'); }
  },
  async translate(app) {
    if (!app.settings.ai?.key) { toast('Configura la IA en Ajustes', 'warn'); return app.go('settings'); }
    const lang = await pickLanguage();
    if (lang) await translateDocumentLayout(app, lang, [...Array(app.doc.pdf.numPages).keys()]);
  },
  async translateLayout(app, code) {
    if (!app.settings.ai?.key) return app.go('settings');
    const lang = LANGUAGES.find(l => l[0] === code) || await pickLanguage();
    if (lang) await translateDocumentLayout(app, lang, [...Array(app.doc.pdf.numPages).keys()]);
  },
  async word(app) {
    const d = app.doc;
    const pages = await ensureText(app);
    const b = busy('Creando documento de Word…');
    try {
      const items = [];
      for (let i = 0; i < pages.length; i++) {
        const it = { text: pages[i] };
        if (!pages[i].trim()) {
          const { blob, width, height } = await pageToBlob(d.pdf, i + 1, { scale: 1.6, quality: 0.8 });
          it.image = { bytes: new Uint8Array(await blob.arrayBuffer()), width, height };
        }
        items.push(it);
      }
      const bytes = await pagesToDocx(items, { title: '' });
      b.done();
      const name = safeFileName(d.name, '.docx');
      const where = await saveToDevice(bytes, name, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
      toast('Word guardado en ' + where);
      shareFile(bytes, name, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document').catch(() => {});
    } catch (e) { b.done(); toast(e.message, 'err'); }
  },
  async protect(app) {
    const pw1 = h('input', { type: 'password', placeholder: 'Contraseña para abrir' });
    const pw2 = h('input', { type: 'password', placeholder: 'Repite la contraseña' });
    const print = h('input', { type: 'checkbox' }); print.checked = true;
    const copy = h('input', { type: 'checkbox' });
    const ok = await modal('Proteger con contraseña', h('div', { class: 'stack' }, pw1, pw2,
      h('label', { class: 'row small' }, print, ' Permitir imprimir'), h('label', { class: 'row small' }, copy, ' Permitir copiar texto'),
      h('p', { class: 'small muted' }, 'Guárdala bien: sin ella no se podrá abrir el documento.')),
    [{ label: 'Cancelar', value: false }, { label: 'Proteger', value: true, primary: true }]);
    if (!ok) return;
    if (pw1.value.length < 4) return toast('Usa al menos 4 caracteres', 'warn');
    if (pw1.value !== pw2.value) return toast('Las contraseñas no coinciden', 'err');
    const out = await ops.encrypt(app.doc.bytes, { userPassword: pw1.value, allowPrint: print.checked, allowCopy: copy.checked });
    await app.saveNew(out, app.doc.name.replace(/\.pdf$/i, '') + ' (protegido).pdf', { open: false });
    toast('Copia protegida guardada en Archivos');
  },
  /** Añade una capa de texto invisible (OCR con posiciones) a las páginas escaneadas. */
  async searchable(app, only) {
    const d = app.doc;
    const pages = await ensureText(app, { silent: true });
    const idx = only || pages.map((t, i) => (t.replace(/\s/g, '').length < 15 ? i : -1)).filter(i => i >= 0);
    if (!idx.length) return toast('Todas las páginas ya tienen texto', 'warn');
    const b = busy('Reconociendo texto…', { cancellable: true });
    try {
      const layers = [];
      for (let k = 0; k < idx.length; k++) {
        if (b.signal.aborted) throw new Error('Cancelado');
        const n = idx[k] + 1;
        b.set(`Página ${n} (${k + 1} de ${idx.length})`, k / idx.length);
        const page = await d.pdf.getPage(n);
        const vp = page.getViewport({ scale: 2.2 });
        const { canvas } = await pageToBlob(d.pdf, n, { scale: 2.2 });
        const lay = await ocrLayout(canvas, app.settings.ocrLangs, (f) => b.set(null, (k + f) / idx.length));
        layers.push({ index: idx[k], words: lineWords(lay.lines).map(w => {
          const [x0, y0] = vp.convertToPdfPoint(w.bbox.x0, w.bbox.y1), [x1, y1] = vp.convertToPdfPoint(w.bbox.x1, w.bbox.y0);
          return { text: w.text, x: Math.min(x0, x1), y: Math.min(y0, y1), w: Math.abs(x1 - x0), h: Math.abs(y1 - y0) };
        }) });
      }
      b.done();
      await app.apply(await ops.addTextLayer(d.bytes, layers), 'PDF buscable');
    } catch (e) { b.done(); if (e.message !== 'Cancelado') toast(e.message, 'err'); }
  },
};
