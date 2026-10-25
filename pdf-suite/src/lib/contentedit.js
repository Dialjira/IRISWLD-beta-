// Edición del flujo de contenido de una página: elimina el texto original dentro de unas zonas,
// para que al sustituir una línea no quede el texto antiguo (ni visible ni al buscar/copiar).
import { PDFArray, PDFName, PDFRawStream, PDFRef, PDFStream, decodePDFRawStream } from '@cantoo/pdf-lib';

const WS = new Set([0x00, 0x09, 0x0a, 0x0c, 0x0d, 0x20]);
const DELIM = new Set('()<>[]{}/%'.split('').map(c => c.charCodeAt(0)));

/** Tokeniza un flujo de contenido. Devuelve [{op, args:[str], start, end}] o null si hay imágenes en línea. */
export function tokenize(src) {
  const ops = [];
  let args = [], argStart = -1, i = 0;
  const n = src.length;
  const push = (tok, s) => { if (argStart < 0) argStart = s; args.push(tok); };
  while (i < n) {
    const c = src.charCodeAt(i);
    if (WS.has(c)) { i++; continue; }
    if (c === 0x25) { while (i < n && src[i] !== '\n' && src[i] !== '\r') i++; continue; } // comentario
    const s = i;
    if (c === 0x28) { // (cadena)
      let depth = 0;
      for (; i < n; i++) {
        const ch = src[i];
        if (ch === '\\') { i++; continue; }
        if (ch === '(') depth++;
        else if (ch === ')') { depth--; if (depth === 0) { i++; break; } }
      }
      push(src.slice(s, i), s); continue;
    }
    if (c === 0x3c && src[i + 1] === '<') { push('<<', s); i += 2; continue; }
    if (c === 0x3e && src[i + 1] === '>') { push('>>', s); i += 2; continue; }
    if (c === 0x3c) { const e = src.indexOf('>', i); i = e < 0 ? n : e + 1; push(src.slice(s, i), s); continue; }
    if (c === 0x5b || c === 0x5d || c === 0x7b || c === 0x7d) { push(src[i], s); i++; continue; }
    if (c === 0x2f) { i++; while (i < n && !WS.has(src.charCodeAt(i)) && !DELIM.has(src.charCodeAt(i))) i++; push(src.slice(s, i), s); continue; }
    while (i < n && !WS.has(src.charCodeAt(i)) && !DELIM.has(src.charCodeAt(i))) i++;
    if (i === s) { i++; continue; }
    const tok = src.slice(s, i);
    if (/^[+-]?(\d+\.?\d*|\.\d+)$/.test(tok) || tok === 'true' || tok === 'false' || tok === 'null') { push(tok, s); continue; }
    // Operador (los arrays/diccionarios forman parte de los argumentos)
    if (tok === 'BI') return null;
    ops.push({ op: tok, args, start: argStart < 0 ? s : argStart, end: i });
    args = []; argStart = -1;
  }
  return ops;
}

const mul = (a, b) => [a[0] * b[0] + a[1] * b[2], a[0] * b[1] + a[1] * b[3], a[2] * b[0] + a[3] * b[2], a[2] * b[1] + a[3] * b[3], a[4] * b[0] + a[5] * b[2] + b[4], a[4] * b[1] + a[5] * b[3] + b[5]];
const SHOW = new Set(['Tj', 'TJ', "'", '"']);
const POS = new Set(['Td', 'TD', 'Tm', 'T*']);

/**
 * Elimina los textos cuyo punto de inicio cae dentro de `rects` ([{x,y,w,h}] en espacio de usuario).
 * Si quitar un texto movería el resto de su línea, se vuelve invisible (modo 3) en vez de borrarlo.
 * Devuelve el contenido nuevo y cuántos textos se tocaron, o null si no se pudo analizar.
 */
export function stripText(src, rects, pad = 1.5) {
  const ops = tokenize(src);
  if (!ops) return null;
  const inside = (x, y) => rects.some(r => x >= r.x - pad && x <= r.x + r.w + pad && y >= r.y - pad && y <= r.y + r.h + pad);
  let ctm = [1, 0, 0, 1, 0, 0];
  const stack = [];
  let tm = [1, 0, 0, 1, 0, 0], tlm = tm, leading = 0, tr = 0, inText = false;
  const edits = []; // {start, end, text}
  let touched = 0;
  for (let k = 0; k < ops.length; k++) {
    const { op, args } = ops[k];
    const num = (i) => parseFloat(args[i]);
    switch (op) {
      case 'q': stack.push(ctm); break;
      case 'Q': ctm = stack.pop() || [1, 0, 0, 1, 0, 0]; break;
      case 'cm': if (args.length === 6) ctm = mul(args.map(Number), ctm); break;
      case 'BT': inText = true; tm = tlm = [1, 0, 0, 1, 0, 0]; break;
      case 'ET': inText = false; break;
      case 'Tr': tr = num(0) || 0; break;
      case 'TL': leading = num(0) || 0; break;
      case 'Tm': if (args.length === 6) tm = tlm = args.map(Number); break;
      case 'Td': tm = tlm = mul([1, 0, 0, 1, num(0), num(1)], tlm); break;
      case 'TD': leading = -num(1); tm = tlm = mul([1, 0, 0, 1, num(0), num(1)], tlm); break;
      case 'T*': tm = tlm = mul([1, 0, 0, 1, 0, -leading], tlm); break;
      default: break;
    }
    if (!inText || !SHOW.has(op)) continue;
    if (op === "'" || op === '"') tm = tlm = mul([1, 0, 0, 1, 0, -leading], tlm);
    const o = mul(tm, ctm);
    if (!inside(o[4], o[5])) continue;
    touched++;
    // ¿Hay otro texto después en el mismo bloque sin reposicionar antes? Entonces borrar desplazaría ese texto
    let safe = true;
    for (let j = k + 1; j < ops.length; j++) {
      const nop = ops[j].op;
      if (nop === 'ET' || POS.has(nop) || nop === "'" || nop === '"') break;
      if (nop === 'Tj' || nop === 'TJ') { safe = false; break; }
    }
    const { start, end } = ops[k];
    const prefix = op === "'" ? 'T* ' : op === '"' ? `${args[0]} Tw ${args[1]} Tc T* ` : '';
    if (safe) edits.push({ start, end, text: prefix });
    else edits.push({ start, end, text: `3 Tr ${src.slice(start, end)} ${tr} Tr` });
  }
  if (!edits.length) return { content: src, touched: 0 };
  let out = '', pos = 0;
  for (const e of edits) { out += src.slice(pos, e.start) + e.text; pos = e.end; }
  out += src.slice(pos);
  return { content: out, touched };
}

const latin1 = (bytes) => { let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000)); return s; };
const toBytes = (s) => { const b = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i) & 0xff; return b; };

/** Aplica stripText a todo el contenido de la página (une sus flujos en uno). Devuelve true si cambió algo. */
export function stripPageText(doc, page, rects) {
  const ctx = doc.context;
  const contents = page.node.Contents();
  if (!contents) return false;
  const refs = contents instanceof PDFArray ? contents.asArray() : [page.node.get(PDFName.of('Contents'))];
  let src = '';
  for (const r of refs) {
    const st = r instanceof PDFRef ? ctx.lookup(r) : r;
    if (!(st instanceof PDFStream)) return false;
    const bytes = st instanceof PDFRawStream ? decodePDFRawStream(st).decode() : st.getContents();
    src += latin1(bytes) + '\n';
  }
  const res = stripText(src, rects);
  if (!res || !res.touched) return false;
  const stream = ctx.flateStream(toBytes(res.content));
  page.node.set(PDFName.of('Contents'), ctx.register(stream));
  return true;
}
