// Pequeñas utilidades de interfaz: creación de nodos, avisos, diálogos y barra de progreso.

export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'html') el.innerHTML = v;
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, v);
  }
  for (const c of children.flat(Infinity)) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

const P = {
  home: 'M3 10.5 12 3l9 7.5V21h-6v-6H9v6H3z',
  folder: 'M3 6a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z',
  plus: 'M12 5v14M5 12h14',
  gear: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z',
  file: 'M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9zM14 3v6h6',
  open: 'M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9zM14 3v6h6M12 18v-6M9 15l3-3 3 3',
  camera: 'M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1zM12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  image: 'M4 4h16v16H4zM4 16l5-5 4 4 3-3 4 4M15 9h.01',
  merge: 'M6 3v6a6 6 0 0 0 6 6h0a6 6 0 0 1 6 6M18 3v6M12 15v6',
  edit: 'M12 20h9M16.5 3.5a2.1 2.1 0 1 1 3 3L7 19l-4 1 1-4z',
  pages: 'M8 3h11a2 2 0 0 1 2 2v11M4 7h11a2 2 0 0 1 2 2v11H6a2 2 0 0 1-2-2z',
  text: 'M4 6h16M4 12h16M4 18h10',
  ai: 'M12 3l1.9 4.6L18.5 9l-4.6 1.9L12 15.5l-1.9-4.6L5.5 9l4.6-1.4zM19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8zM5 15l.6 1.4L7 17l-1.4.6L5 19l-.6-1.4L3 17l1.4-.6z',
  voice: 'M11 5 6 9H3v6h3l5 4zM15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
  back: 'M15 18l-6-6 6-6',
  undo: 'M9 14 4 9l5-5M4 9h10.5a5.5 5.5 0 0 1 0 11H11',
  share: 'M4 12v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7M16 6l-4-4-4 4M12 2v14',
  save: 'M12 3v12M7 10l5 5 5-5M5 21h14',
  trash: 'M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6',
  play: 'M7 4v16l13-8z',
  pause: 'M7 4h4v16H7zM14 4h4v16h-4z',
  stop: 'M6 6h12v12H6z',
  prev: 'M19 20 9 12l10-8zM5 4v16',
  next: 'M5 4l10 8-10 8zM19 4v16',
  mic: 'M12 3a3 3 0 0 1 3 3v6a3 3 0 0 1-6 0V6a3 3 0 0 1 3-3zM19 11a7 7 0 0 1-14 0M12 18v3',
  rotr: 'M21 12a9 9 0 1 1-3-6.7L21 8M21 3v5h-5',
  rotl: 'M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5',
  copy: 'M9 9h11v11H9zM5 15H4V4h11v1',
  search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM21 21l-4.3-4.3',
  check: 'M20 6 9 17l-5-5',
  close: 'M18 6 6 18M6 6l12 12',
  pen: 'M3 21c3-1 5-3 7-6l7-7a2 2 0 1 0-3-3l-7 7c-3 2-5 4-6 7z',
  marker: 'M9 11l-6 6v3h9l3-3M22 12l-4.6 4.6a2 2 0 0 1-2.8 0l-5.2-5.2a2 2 0 0 1 0-2.8L14 4',
  square: 'M4 4h16v16H4z',
  eraser: 'M7 21h10M5 15l9-9 5 5-9 9H7z',
  sign: 'M3 17c3 0 4-8 6-8s1 7 3 7 2-4 4-4 2 3 5 3M3 21h18',
  move: 'M5 9l-3 3 3 3M9 5l3-3 3 3M15 19l-3 3-3-3M19 9l3 3-3 3M2 12h20M12 2v20',
  zin: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM21 21l-4.3-4.3M8 11h6M11 8v6',
  zout: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM21 21l-4.3-4.3M8 11h6',
  lock: 'M5 11h14v10H5zM8 11V7a4 4 0 0 1 8 0v4',
  info: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 16v-4M12 8h.01',
  drop: 'M12 3s7 7.5 7 12a7 7 0 0 1-14 0c0-4.5 7-12 7-12z',
  hash: 'M4 9h16M4 15h16M10 3 8 21M16 3l-2 18',
  form: 'M4 4h16v16H4zM8 9h8M8 13h8M8 17h5',
  split: 'M4 4h6v16H4zM14 4h6v16h-6z',
  compress: 'M4 14h6v6M20 10h-6V4M14 10l7-7M3 21l7-7',
  chat: 'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z',
  translate: 'M4 5h8M8 3v2M5 11c1.5 2 3.5 3 6 3M11 5c-1 4-3 7-6 9M13 21l4-10 4 10M14.5 18h5',
};

export function icon(name, size = 22) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', size); svg.setAttribute('height', size);
  svg.setAttribute('fill', 'none'); svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2'); svg.setAttribute('stroke-linecap', 'round'); svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  p.setAttribute('d', P[name] || P.file);
  svg.append(p);
  return svg;
}

let toastTimer;
export function toast(msg, kind = 'ok') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = 'toast show ' + kind;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.className = 'toast'; }, kind === 'err' ? 5000 : 2600);
}

const modalStack = [];
export function closeTopModal() {
  const m = modalStack.pop();
  if (m) { m.close(null); return true; }
  return false;
}

/** Diálogo genérico. `body` es un nodo; `buttons` [{label, value, primary, danger}] */
export function modal(title, body, buttons = [{ label: 'Cerrar', value: null }], { wide = false } = {}) {
  return new Promise(resolve => {
    const root = document.getElementById('modals');
    const card = h('div', { class: 'modal-card' + (wide ? ' wide' : ''), role: 'dialog', 'aria-modal': 'true', 'aria-label': title });
    const wrap = h('div', { class: 'modal', onclick: (e) => { if (e.target === wrap) close(null); } }, card);
    const entry = { close: (v) => close(v) };
    function close(v) {
      const i = modalStack.indexOf(entry);
      if (i >= 0) modalStack.splice(i, 1);
      wrap.remove();
      resolve(typeof v === 'function' ? v() : v);
    }
    card.append(
      h('div', { class: 'modal-head' }, h('h3', {}, title), h('button', { class: 'icon-btn', 'aria-label': 'Cerrar', onclick: () => close(null) }, icon('close'))),
      h('div', { class: 'modal-body' }, body),
      buttons.length ? h('div', { class: 'modal-foot' }, buttons.map(b =>
        h('button', { class: 'btn' + (b.primary ? ' primary' : '') + (b.danger ? ' danger' : ''), onclick: () => close(b.value) }, b.label))) : null,
    );
    root.append(wrap);
    modalStack.push(entry);
    setTimeout(() => card.querySelector('input,textarea,select')?.focus(), 50);
  });
}

export async function ask(title, { label = '', value = '', placeholder = '', multiline = false, type = 'text' } = {}) {
  const input = multiline
    ? h('textarea', { rows: 5, placeholder })
    : h('input', { type, placeholder, onkeydown: (e) => { if (e.key === 'Enter') ok.click(); } });
  input.value = value;
  const body = h('div', { class: 'stack' }, label ? h('label', { class: 'lbl' }, label) : null, input);
  let ok;
  const p = modal(title, body, [{ label: 'Cancelar', value: null }, { label: 'Aceptar', value: () => input.value, primary: true }]);
  ok = document.querySelector('#modals .modal:last-child .btn.primary');
  return p;
}

export function confirmBox(title, text, { okLabel = 'Aceptar', danger = false } = {}) {
  return modal(title, h('p', {}, text), [{ label: 'Cancelar', value: false }, { label: okLabel, value: true, primary: !danger, danger }]);
}

/** Barra de progreso modal con cancelación opcional. */
export function busy(text = 'Procesando…', { cancellable = false } = {}) {
  const ctrl = new AbortController();
  const label = h('div', { class: 'busy-text' }, text);
  const bar = h('div', { class: 'busy-bar' }, h('i'));
  const el = h('div', { class: 'busy', role: 'status', 'aria-live': 'polite' },
    h('div', { class: 'busy-card' }, h('div', { class: 'spinner' }), label, bar,
      cancellable ? h('button', { class: 'btn', onclick: () => ctrl.abort() }, 'Cancelar') : null));
  document.body.append(el);
  return {
    signal: ctrl.signal,
    set(t, frac) { if (t) label.textContent = t; if (frac !== undefined) { bar.classList.add('det'); bar.firstChild.style.width = Math.round(frac * 100) + '%'; } },
    done() { el.remove(); },
  };
}

export function pickFiles({ accept = 'application/pdf', multiple = false, capture } = {}) {
  return new Promise(resolve => {
    const inp = h('input', { type: 'file', accept, multiple: multiple || undefined, capture, style: { display: 'none' } });
    inp.addEventListener('change', () => { resolve([...inp.files]); inp.remove(); });
    inp.addEventListener('cancel', () => { resolve([]); inp.remove(); });
    document.body.append(inp);
    inp.click();
  });
}

export const readBytes = async (file) => new Uint8Array(await file.arrayBuffer());

export function seg(options, value, onChange) {
  const wrap = h('div', { class: 'seg', role: 'tablist' });
  const render = (v) => {
    wrap.replaceChildren(...options.map(([val, label]) =>
      h('button', { class: val === v ? 'on' : '', role: 'tab', 'aria-selected': String(val === v), onclick: () => { render(val); onChange(val); } }, label)));
  };
  render(value);
  return wrap;
}

export function select(options, value, onChange, attrs = {}) {
  const s = h('select', { ...attrs, onchange: () => onChange(s.value) },
    options.map(([v, l]) => h('option', { value: v, selected: v === value || undefined }, l)));
  return s;
}

export function field(label, control, hint) {
  return h('label', { class: 'field' }, h('span', { class: 'lbl' }, label), control, hint ? h('small', { class: 'hint' }, hint) : null);
}
