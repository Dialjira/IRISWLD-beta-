// Utilidades de texto puras (sin DOM), probadas en tests/text.test.js

/** Divide un texto en fragmentos de como máximo `max` caracteres, cortando en párrafos o frases. */
export function chunkText(text, max = 6000) {
  const clean = (text || '').replace(/\r\n?/g, '\n').trim();
  if (!clean) return [];
  if (clean.length <= max) return [clean];
  const paras = clean.split(/\n{2,}/);
  const chunks = [];
  let cur = '';
  const push = () => { if (cur.trim()) chunks.push(cur.trim()); cur = ''; };
  for (const p of paras) {
    if (p.length > max) {
      push();
      for (const s of splitSentences(p)) {
        if (s.length > max) {
          for (let i = 0; i < s.length; i += max) chunks.push(s.slice(i, i + max));
        } else if ((cur + ' ' + s).length > max) { push(); cur = s; }
        else cur = cur ? cur + ' ' + s : s;
      }
      push();
    } else if ((cur + '\n\n' + p).length > max) { push(); cur = p; }
    else cur = cur ? cur + '\n\n' + p : p;
  }
  push();
  return chunks;
}

/** Divide en frases para la narración (respeta abreviaturas comunes y números decimales). */
export function splitSentences(text) {
  const t = (text || '').replace(/\s+/g, ' ').trim();
  if (!t) return [];
  const raw = t.split(/(?<=[.!?…]["'»”)]?)\s+/);
  const abbr = /\b(Sr|Sra|Srta|Dr|Dra|Ing|Lic|etc|art|núm|No|pág|Mr|Mrs|Ms|vs|Av|Cra|Cl|[A-Z])\.$/;
  const out = [];
  for (const piece of raw) {
    if (out.length && abbr.test(out[out.length - 1])) out[out.length - 1] += ' ' + piece;
    else out.push(piece);
  }
  // Une frases muy cortas para que la voz no suene entrecortada
  const merged = [];
  for (const s of out) {
    if (merged.length && merged[merged.length - 1].length < 25) merged[merged.length - 1] += ' ' + s;
    else merged.push(s);
  }
  return merged;
}

/** Interpreta rangos de páginas "1-3, 5, 8-" (1-based) → índices 0-based únicos y ordenados. */
export function parseRanges(spec, pageCount) {
  const set = new Set();
  const parts = String(spec || '').split(/[,;\s]+/).filter(Boolean);
  for (const part of parts) {
    const m = part.match(/^(\d*)\s*-\s*(\d*)$/);
    if (m) {
      const a = m[1] ? parseInt(m[1], 10) : 1;
      const b = m[2] ? parseInt(m[2], 10) : pageCount;
      for (let i = Math.max(1, Math.min(a, b)); i <= Math.min(pageCount, Math.max(a, b)); i++) set.add(i - 1);
    } else if (/^\d+$/.test(part)) {
      const n = parseInt(part, 10);
      if (n >= 1 && n <= pageCount) set.add(n - 1);
    } else {
      throw new Error(`Rango no válido: "${part}"`);
    }
  }
  return [...set].sort((x, y) => x - y);
}

/** Nombre de archivo seguro, conservando tildes y ñ. */
/** Deshace la codificación de URL que traen algunos nombres de Android ("Mi%20archivo" → "Mi archivo"). */
export function decodeName(name) {
  let s = String(name || '');
  for (let i = 0; i < 3 && /%[0-9a-f]{2}/i.test(s); i++) { try { s = decodeURIComponent(s); } catch { s = s.replace(/%20/gi, ' '); break; } }
  return s.replace(/\s+/g, ' ').trim();
}

export function safeFileName(name, ext = '.pdf') {
  let base = decodeName(name).replace(/\.[a-z0-9]{2,4}$/i, '');
  base = base.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80) || 'documento';
  return base + ext;
}

export function formatBytes(n) {
  if (!n && n !== 0) return '';
  if (n < 1024) return n + ' B';
  if (n < 1024 * 1024) return (n / 1024).toFixed(0) + ' KB';
  return (n / 1024 / 1024).toFixed(1) + ' MB';
}

/** Ajuste de líneas genérico: `measure(str)` devuelve el ancho. */
export function wrapLines(text, maxWidth, measure) {
  const lines = [];
  for (const para of String(text).replace(/\r\n?/g, '\n').split('\n')) {
    if (!para.trim()) { lines.push(''); continue; }
    const words = para.split(/(\s+)/).filter(w => w.length);
    let cur = '';
    for (const w of words) {
      const test = cur + w;
      if (measure(test.trimEnd()) <= maxWidth || !cur.trim()) {
        if (measure(test.trimEnd()) > maxWidth && !cur.trim()) {
          // palabra más ancha que la línea: se corta por caracteres
          let piece = '';
          for (const ch of w) {
            if (measure(piece + ch) > maxWidth && piece) { lines.push(piece); piece = ch; }
            else piece += ch;
          }
          cur = piece;
        } else cur = test;
      } else {
        lines.push(cur.trimEnd());
        cur = /^\s+$/.test(w) ? '' : w;
      }
    }
    lines.push(cur.trimEnd());
  }
  return lines;
}

export const LANGUAGES = [
  ['es', 'Español', 'es-ES'], ['en', 'Inglés', 'en-US'], ['pt', 'Portugués', 'pt-BR'],
  ['fr', 'Francés', 'fr-FR'], ['it', 'Italiano', 'it-IT'], ['de', 'Alemán', 'de-DE'],
  ['nl', 'Neerlandés', 'nl-NL'], ['ca', 'Catalán', 'ca-ES'], ['ru', 'Ruso', 'ru-RU'],
  ['uk', 'Ucraniano', 'uk-UA'], ['pl', 'Polaco', 'pl-PL'], ['tr', 'Turco', 'tr-TR'],
  ['ar', 'Árabe', 'ar-SA'], ['hi', 'Hindi', 'hi-IN'], ['zh', 'Chino (simplificado)', 'zh-CN'],
  ['ja', 'Japonés', 'ja-JP'], ['ko', 'Coreano', 'ko-KR'], ['el', 'Griego', 'el-GR'],
  ['he', 'Hebreo', 'he-IL'], ['sv', 'Sueco', 'sv-SE'],
];

/** Intenta adivinar el idioma (es/en/pt/fr/it/de) por palabras frecuentes. */
export function guessLang(text) {
  const t = ' ' + (text || '').toLowerCase().slice(0, 4000) + ' ';
  const score = {
    es: [' el ', ' la ', ' de ', ' que ', ' y ', ' los ', ' para ', ' con ', ' por ', ' una '],
    en: [' the ', ' and ', ' of ', ' to ', ' is ', ' that ', ' for ', ' with ', ' this '],
    pt: [' não ', ' uma ', ' para ', ' com ', ' que ', ' os ', ' do ', ' da ', ' em '],
    fr: [' le ', ' les ', ' des ', ' est ', ' et ', ' une ', ' pour ', ' dans ', ' pas '],
    it: [' il ', ' della ', ' che ', ' è ', ' per ', ' una ', ' non ', ' gli ', ' sono '],
    de: [' der ', ' die ', ' und ', ' das ', ' ist ', ' nicht ', ' mit ', ' ein ', ' auf '],
  };
  let best = 'es', bestN = 0;
  for (const [k, words] of Object.entries(score)) {
    const n = words.reduce((acc, w) => acc + (t.split(w).length - 1), 0);
    if (n > bestN) { best = k; bestN = n; }
  }
  return best;
}
