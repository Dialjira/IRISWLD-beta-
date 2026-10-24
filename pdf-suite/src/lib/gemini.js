// Google Gemini: elección del mejor modelo según la clave, streaming, reintentos y cadena de respaldo.
const API = 'https://generativelanguage.googleapis.com/v1beta';

// Modelos que no sirven para texto/visión general
const EXCLUDE = /(embedding|tts|image|audio|live|aqa|imagen|veo|robotics|computer-use|learnlm|gemma|nano|banana|lyria|deep-research|bidi)/i;
const TIER = { pro: 3, flash: 2, 'flash-lite': 1 };

/** Analiza un id ("gemini-2.5-flash-preview-05-20") → {version, tier, stage, alias} o null si no es útil. */
export function parseModel(id) {
  const name = String(id).replace(/^models\//, '');
  if (EXCLUDE.test(name)) return null;
  const alias = name.match(/^gemini-(pro|flash|flash-lite)-latest$/);
  if (alias) return { id: name, version: 999, tier: alias[1], stage: 'latest', alias: true };
  const m = name.match(/^gemini-(\d+(?:\.\d+)?)-(pro|flash-lite|flash)(?:-(.*))?$/);
  if (!m) return null;
  const rest = m[3] || '';
  if (/thinking|tuning|8b/.test(rest)) return null;
  const stage = /exp/.test(rest) ? 'exp' : /preview/.test(rest) ? 'preview' : /^\d{3}$/.test(rest) || !rest ? 'stable' : 'other';
  return { id: name, version: parseFloat(m[1]), tier: m[2], stage, alias: false };
}

export const MODES = {
  // Flash-Lite de la generación más nueva: el más estable y con más cuota gratuita
  balanced: { label: 'Recomendado (Flash-Lite)', order: ['flash-lite', 'flash', 'pro'] },
  quality: { label: 'Máxima calidad', order: ['pro', 'flash', 'flash-lite'] },
  fast: { label: 'Más rápido', order: ['flash-lite', 'flash', 'pro'] },
};

/**
 * Ordena los modelos disponibles del mejor al peor para un modo.
 * Criterio: versión más nueva primero, dentro de la versión el nivel preferido por el modo,
 * estable antes que preview/exp, y los alias "-latest" al final como último respaldo.
 */
export function rankModels(ids, mode = 'balanced') {
  const order = MODES[mode]?.order || MODES.balanced.order;
  const stageRank = { stable: 0, other: 1, preview: 2, exp: 3, latest: 4 };
  const parsed = [...new Set(ids)].map(parseModel).filter(Boolean);
  const real = parsed.filter(p => !p.alias), aliases = parsed.filter(p => p.alias);
  // Clave de orden por modo (comparación lexicográfica de tuplas, siempre transitiva)
  const key = (p) => {
    const t = order.indexOf(p.tier), st = stageRank[p.stage];
    if (mode === 'fast') return [t, -p.version, st];
    if (mode === 'quality') return [p.tier === 'flash-lite' ? 1 : 0, -p.version, t, st];
    return [-p.version, t, st];
  };
  real.sort((a, b) => {
    const ka = key(a), kb = key(b);
    for (let i = 0; i < ka.length; i++) if (ka[i] !== kb[i]) return ka[i] - kb[i];
    return b.id.localeCompare(a.id);
  });
  aliases.sort((a, b) => order.indexOf(a.tier) - order.indexOf(b.tier));
  return [...real, ...aliases].map(p => p.id);
}

/** Configuración de razonamiento adecuada para cada generación (los 3.x usan thinkingLevel; los 2.5, thinkingBudget). */
export function thinkingFor(id, mode = 'balanced') {
  const p = parseModel(id);
  if (!p) return undefined;
  if (p.alias || p.version >= 3) return { thinkingLevel: mode === 'quality' ? 'high' : 'low' };
  if (p.version >= 2.5) {
    if (p.tier === 'pro') return { thinkingBudget: mode === 'quality' ? 4096 : 512 };
    return { thinkingBudget: mode === 'quality' ? 2048 : 0 };
  }
  return undefined;
}

// Modelos saturados o sin cuota recientemente: se saltan unos minutos para no esperar en cada petición
const cooldown = new Map();
const COOL_MS = 3 * 60e3;

const FALLBACK_IDS = ['gemini-3.5-flash-lite', 'gemini-2.5-flash-lite', 'gemini-2.5-flash', 'gemini-flash-lite-latest', 'gemini-flash-latest'];
const cache = { key: '', ids: null, at: 0 };

/** Todos los ids con generateContent (sin filtrar): sirve para buscar modelos de imagen o de voz. */
export async function listAllGeminiIds(key) { return listGeminiModels(key); }

/** Mejor modelo de un tipo especial ('image' | 'tts'), el más nuevo y preferentemente flash. */
export function pickSpecialModel(ids, kind) {
  const re = kind === 'image' ? /^gemini-(\d+(?:\.\d+)?)-(pro|flash(?:-lite)?)?-?(?:preview-)?image/ : /^gemini-(\d+(?:\.\d+)?)-(pro|flash(?:-lite)?)?-?(?:preview-)?tts/;
  const c = ids.map(id => { const m = id.match(re); return m && { id, v: parseFloat(m[1]), pro: m[2] === 'pro' }; }).filter(Boolean);
  c.sort((a, b) => b.v - a.v || (a.pro - b.pro) || (a.id.includes('preview') - b.id.includes('preview')));
  return c[0]?.id || null;
}

export async function listGeminiModels(key, { force = false } = {}) {
  if (!force && cache.key === key && cache.ids && Date.now() - cache.at < 6 * 3600e3) return cache.ids;
  const ids = [];
  let page = '';
  do {
    const r = await fetch(`${API}/models?pageSize=1000&key=${encodeURIComponent(key)}${page ? '&pageToken=' + page : ''}`);
    if (!r.ok) throw new GeminiError(r.status, await r.text());
    const j = await r.json();
    for (const m of j.models || []) if ((m.supportedGenerationMethods || []).includes('generateContent')) ids.push(m.name.replace(/^models\//, ''));
    page = j.nextPageToken || '';
  } while (page);
  Object.assign(cache, { key, ids, at: Date.now() });
  return ids;
}

/** Lista de modelos a probar en orden: el elegido (o el mejor) y después los respaldos. */
export async function modelChain(cfg) {
  let ranked;
  try { ranked = rankModels(await listGeminiModels(cfg.key), cfg.mode); }
  catch (e) { if (e instanceof GeminiError && e.status < 500 && e.status !== 429) throw e; ranked = FALLBACK_IDS; }
  if (!ranked.length) ranked = FALLBACK_IDS;
  const chosen = cfg.model && cfg.model !== 'auto' ? [cfg.model] : [];
  const all = [...new Set([...chosen, ...ranked])];
  const fresh = all.filter(m => !(Date.now() - (cooldown.get(m) || 0) < COOL_MS));
  return [...fresh, ...all.filter(m => !fresh.includes(m))].slice(0, 5);
}

export class GeminiError extends Error {
  constructor(status, body) {
    let msg = body, reason = '';
    try { const j = JSON.parse(body); msg = j.error?.message || body; reason = j.error?.details?.find(d => d.reason)?.reason || j.error?.status || ''; } catch { /* texto plano */ }
    super(humanize(status, msg, reason));
    this.status = status; this.reason = reason; this.raw = String(msg).slice(0, 400);
  }
}

function humanize(status, msg, reason) {
  if (reason === 'API_KEY_INVALID' || /API key not valid/i.test(msg)) return 'La clave de Gemini no es válida. Cópiala de nuevo desde aistudio.google.com/apikey.';
  if (status === 403) return 'Gemini rechazó la clave (permiso o región no disponible): ' + String(msg).slice(0, 160);
  if (status === 429) return 'Se alcanzó el límite de uso gratuito de Gemini. Espera un minuto o elige un modelo "flash".';
  if (status === 404) return 'Ese modelo ya no existe para tu clave.';
  if (status >= 500) return 'Los servidores de Gemini están saturados. Intenta de nuevo en un momento.';
  return `Gemini (${status}): ${String(msg).slice(0, 200)}`;
}

const sleep = (ms, signal) => new Promise((res, rej) => {
  const t = setTimeout(res, ms);
  signal?.addEventListener('abort', () => { clearTimeout(t); rej(new Error('Cancelado')); }, { once: true });
});

/**
 * Genera contenido con streaming. `parts` = [{text}|{inline_data:{mime_type,data}}].
 * onText(acumulado) recibe el texto a medida que llega. Devuelve {text, model}.
 */
export async function geminiGenerate(cfg, { system, parts, maxTokens = 16384, json = false, onText = () => {}, signal, onModel = () => {} }) {
  if (!cfg?.key) throw new Error('Configura tu clave de Gemini en Ajustes.');
  const chain = await modelChain(cfg);
  let lastErr;
  for (const model of chain) {
    let thinking = thinkingFor(model, cfg.mode);
    for (let attempt = 1; attempt <= 3; attempt++) {
      if (signal?.aborted) throw new Error('Cancelado');
      onModel(model, attempt);
      try {
        const text = await streamOnce(cfg.key, model, { system, parts, maxTokens, json, thinking }, onText, signal);
        cooldown.delete(model);
        return { text, model };
      } catch (e) {
        lastErr = e;
        if (signal?.aborted || e.message === 'Cancelado') throw new Error('Cancelado');
        const st = e.status || 0;
        if (st === 400 && thinking && /thinking/i.test(e.raw || e.message)) { thinking = undefined; attempt--; continue; }
        if (st === 400 || st === 403 || e.reason === 'API_KEY_INVALID') throw e; // no se arregla cambiando de modelo
        if (st === 404 || e.code === 'EMPTY' || e.code === 'BLOCKED') break; // siguiente modelo
        if (st === 429 && attempt >= 2) { cooldown.set(model, Date.now()); break; } // cuota del modelo agotada: probar otro
        if (attempt === 3) { cooldown.set(model, Date.now()); break; } // tres intentos fallidos: siguiente modelo, sin esperar más
        await sleep(1000 * attempt * attempt, signal); // 503/500/red: reintento con espera creciente (1 s, 4 s)
      }
    }
  }
  throw lastErr || new Error('Gemini no respondió');
}

async function streamOnce(key, model, { system, parts, maxTokens, json, thinking }, onText, signal) {
  const body = {
    contents: [{ role: 'user', parts }],
    generationConfig: { maxOutputTokens: maxTokens, ...(thinking ? { thinkingConfig: thinking } : {}), ...(json ? { responseMimeType: 'application/json' } : {}) },
    safetySettings: ['HARASSMENT', 'HATE_SPEECH', 'SEXUALLY_EXPLICIT', 'DANGEROUS_CONTENT'].map(c => ({ category: 'HARM_CATEGORY_' + c, threshold: 'BLOCK_ONLY_HIGH' })),
  };
  if (system) body.systemInstruction = { parts: [{ text: system }] };
  const ctrl = new AbortController();
  const onAbort = () => ctrl.abort();
  signal?.addEventListener('abort', onAbort, { once: true });
  let idle = setTimeout(() => ctrl.abort(), 90000);
  try {
    const res = await fetch(`${API}/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse&key=${encodeURIComponent(key)}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: ctrl.signal,
    });
    if (!res.ok) throw new GeminiError(res.status, await res.text());
    let text = '', finish = '', block = '', buf = '';
    const handle = (line) => {
      if (!line.startsWith('data:')) return;
      const j = JSON.parse(line.slice(5));
      if (j.promptFeedback?.blockReason) block = j.promptFeedback.blockReason;
      const c = j.candidates?.[0];
      if (!c) return;
      for (const p of c.content?.parts || []) if (p.text && !p.thought) text += p.text;
      if (c.finishReason) finish = c.finishReason;
      onText(text);
    };
    if (res.body?.getReader) {
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        clearTimeout(idle); idle = setTimeout(() => ctrl.abort(), 90000);
        buf += dec.decode(value, { stream: true });
        let i;
        while ((i = buf.indexOf('\n')) >= 0) { handle(buf.slice(0, i).trim()); buf = buf.slice(i + 1); }
      }
      handle(buf.trim());
    } else {
      (await res.text()).split('\n').forEach(l => handle(l.trim()));
    }
    if (block || ['SAFETY', 'PROHIBITED_CONTENT', 'BLOCKLIST', 'RECITATION'].includes(finish)) {
      const e = new Error(`Gemini bloqueó la respuesta (${block || finish}).`); e.code = 'BLOCKED'; throw e;
    }
    if (!text.trim()) { const e = new Error('Gemini devolvió una respuesta vacía' + (finish ? ` (${finish})` : '')); e.code = 'EMPTY'; throw e; }
    if (finish === 'MAX_TOKENS') text += '\n\n[…respuesta cortada por longitud]';
    return text;
  } catch (e) {
    if (ctrl.signal.aborted && !signal?.aborted) { const t = new Error('Gemini tardó demasiado en responder'); t.status = 504; throw t; }
    throw e;
  } finally {
    clearTimeout(idle);
    signal?.removeEventListener('abort', onAbort);
  }
}

async function postOnce(key, model, body, signal) {
  const res = await fetch(`${API}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal,
  });
  if (!res.ok) throw new GeminiError(res.status, await res.text());
  return res.json();
}

/**
 * Retoque de una imagen con el modelo de imagen de Gemini. Devuelve {mime, data(base64)}.
 * Lanza un error claro si la clave no tiene un modelo de imagen o cuota para él.
 */
export async function geminiImageEdit(cfg, image, prompt, signal) {
  if (!cfg?.key) throw new Error('Configura tu clave de Gemini en Ajustes.');
  const model = pickSpecialModel(await listGeminiModels(cfg.key), 'image');
  if (!model) throw new Error('Tu clave de Gemini no tiene acceso a un modelo de edición de imágenes.');
  let lastErr;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const j = await postOnce(cfg.key, model, {
        contents: [{ role: 'user', parts: [{ inline_data: { mime_type: image.mime, data: image.data } }, { text: prompt }] }],
        generationConfig: { responseModalities: ['IMAGE', 'TEXT'] },
      }, signal);
      const part = (j.candidates?.[0]?.content?.parts || []).find(p => p.inlineData || p.inline_data);
      const d = part?.inlineData || part?.inline_data;
      if (!d?.data) throw new Error('La IA no devolvió una imagen' + (j.candidates?.[0]?.finishReason ? ` (${j.candidates[0].finishReason})` : ''));
      return { mime: d.mimeType || d.mime_type || 'image/png', data: d.data, model };
    } catch (e) {
      lastErr = e;
      if (e.status === 429) throw new Error('Tu clave no tiene cuota para el retoque con IA (modelo de imagen). Prueba más tarde o activa la facturación en Google AI Studio.');
      if (!(e.status >= 500) || signal?.aborted) throw e;
      await sleep(1500, signal);
    }
  }
  throw lastErr;
}

/** Voces de Gemini TTS con su carácter (todas hablan español). */
export const GEMINI_VOICES = [
  ['Kore', 'Kore · mujer, firme y clara'], ['Aoede', 'Aoede · mujer, cálida y fluida'], ['Leda', 'Leda · mujer, juvenil'],
  ['Sulafat', 'Sulafat · mujer, cálida'], ['Despina', 'Despina · mujer, suave'], ['Achernar', 'Achernar · mujer, muy suave'],
  ['Vindemiatrix', 'Vindemiatrix · mujer, amable'], ['Gacrux', 'Gacrux · mujer, madura'],
  ['Charon', 'Charon · hombre, informativo'], ['Puck', 'Puck · hombre, animado'], ['Orus', 'Orus · hombre, firme'],
  ['Iapetus', 'Iapetus · hombre, claro'], ['Algieba', 'Algieba · hombre, suave'], ['Sadaltager', 'Sadaltager · hombre, experto'],
  ['Achird', 'Achird · hombre, cercano'], ['Schedar', 'Schedar · hombre, sereno'],
];

/**
 * Texto → voz natural con Gemini. Devuelve PCM 16 bits mono (Int16Array) y su frecuencia.
 * El estilo se indica en lenguaje natural (p. ej. acento latinoamericano).
 */
export async function geminiTTS(cfg, text, { voice = 'Kore', style = '', signal } = {}) {
  if (!cfg?.key) throw new Error('Configura tu clave de Gemini en Ajustes.');
  const model = pickSpecialModel(await listGeminiModels(cfg.key), 'tts');
  if (!model) throw new Error('Tu clave de Gemini no tiene un modelo de voz (TTS).');
  let lastErr;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const j = await postOnce(cfg.key, model, {
        contents: [{ role: 'user', parts: [{ text: style ? `${style}:\n\n${text}` : text }] }],
        generationConfig: { responseModalities: ['AUDIO'], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } } },
      }, signal);
      const part = (j.candidates?.[0]?.content?.parts || []).find(p => p.inlineData || p.inline_data);
      const d = part?.inlineData || part?.inline_data;
      if (!d?.data) throw new Error('La IA no devolvió audio');
      const rate = parseInt((d.mimeType || '').match(/rate=(\d+)/)?.[1] || '24000', 10);
      const bin = atob(d.data);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      return { pcm: new Int16Array(bytes.buffer, 0, bytes.length >> 1), rate, model };
    } catch (e) {
      lastErr = e;
      if (signal?.aborted) throw new Error('Cancelado');
      if (e.status === 429) throw new Error('Se agotó la cuota gratuita de la voz IA de Gemini por ahora.');
      if (!(e.status >= 500) && e.status !== 504) throw e;
      await sleep(1200 * attempt, signal);
    }
  }
  throw lastErr;
}

/** Empaqueta PCM 16 bits mono en un archivo WAV. */
export function pcmToWav(chunks, rate) {
  const total = chunks.reduce((a, c) => a + c.length, 0);
  const buf = new ArrayBuffer(44 + total * 2);
  const v = new DataView(buf);
  const w = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  w(0, 'RIFF'); v.setUint32(4, 36 + total * 2, true); w(8, 'WAVE'); w(12, 'fmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, rate, true);
  v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); w(36, 'data'); v.setUint32(40, total * 2, true);
  let o = 44;
  for (const c of chunks) { new Int16Array(buf, o, c.length).set(c); o += c.length * 2; }
  return new Uint8Array(buf);
}
