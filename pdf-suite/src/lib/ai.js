// IA con clave propia del usuario: Claude (Anthropic), Google Gemini, Groq o cualquier API compatible con OpenAI.
import Anthropic from '@anthropic-ai/sdk';
import { chunkText } from './text.js';
import { geminiGenerate, listGeminiModels, rankModels, MODES } from './gemini.js';

export { MODES };

export const PROVIDERS = {
  gemini: { name: 'Google Gemini (recomendado, gratis)', model: 'auto', keyUrl: 'https://aistudio.google.com/apikey' },
  anthropic: { name: 'Claude (Anthropic)', model: 'claude-opus-5-5', keyUrl: 'https://console.anthropic.com/settings/keys' },
  groq: { name: 'Groq', model: 'llama-3.3-70b-versatile', keyUrl: 'https://console.groq.com/keys' },
  openai: { name: 'Compatible con OpenAI', model: 'gpt-4o-mini', baseUrl: 'https://api.openai.com/v1', keyUrl: 'https://platform.openai.com/api-keys' },
};

export const TASKS = {
  translate: { label: 'Traducir', needsLang: true,
    prompt: (o) => `Traduce el siguiente texto al ${o.langName}. Conserva el formato, los saltos de párrafo, los números y los nombres propios. Responde solo con la traducción, sin comentarios.` },
  rewrite: { label: 'Reescribir', needsStyle: true,
    prompt: (o) => `Reescribe el siguiente texto con un estilo ${o.style}. Conserva el significado y todos los datos. Mantén el mismo idioma del original salvo que se indique otro. Responde solo con el texto reescrito.` },
  summarize: { label: 'Resumir',
    prompt: () => 'Resume el siguiente texto en español de forma clara: primero un párrafo con la idea central y luego los puntos clave en viñetas ("- "). Responde solo con el resumen.' },
  correct: { label: 'Corregir ortografía y gramática',
    prompt: () => 'Corrige la ortografía, la gramática y la puntuación del siguiente texto sin cambiar su estilo ni su significado. Responde solo con el texto corregido.' },
  simplify: { label: 'Simplificar (lectura fácil)',
    prompt: () => 'Reescribe el siguiente texto en lenguaje sencillo, con frases cortas y palabras comunes, para que cualquier persona lo entienda. Mantén el idioma original. Responde solo con el texto.' },
  expand: { label: 'Ampliar y desarrollar',
    prompt: () => 'Amplía y desarrolla el siguiente texto con más detalle y ejemplos, manteniendo el tono y el idioma. Responde solo con el texto ampliado.' },
  keypoints: { label: 'Extraer datos clave',
    prompt: () => 'Extrae del siguiente texto los datos clave (nombres, fechas, cifras, lugares, obligaciones, plazos) en una lista con viñetas ("- "). Responde en español.' },
  custom: { label: 'Instrucción libre', needsCustom: true, prompt: (o) => o.custom },
};

export const STYLES = ['formal y profesional', 'claro y directo', 'amigable y cercano', 'académico', 'persuasivo (marketing)', 'jurídico', 'más breve (la mitad de largo)', 'para niños'];

const SYSTEM = 'Eres el asistente de documentos de AICraft PDF. Trabajas con texto extraído de documentos PDF. Sigues la instrucción con precisión y devuelves texto plano listo para insertar en un documento (puedes usar "# " para títulos y "- " para viñetas; no uses otro Markdown).';

/**
 * Llamada única al proveedor configurado. `images` = [{mime, data(base64)}] para visión.
 * onText(acumulado) recibe el texto en directo cuando el proveedor lo permite (Gemini).
 */
/* Caché de respuestas: repetir la misma tarea sobre el mismo texto es instantáneo (y no gasta cuota). */
const memCache = new Map();
async function cacheKey(cfg, parts) {
  try {
    const raw = new TextEncoder().encode([cfg.provider, cfg.model || '', cfg.mode || '', ...parts].join('\u0001'));
    const d = await crypto.subtle.digest('SHA-256', raw);
    return 'ai:' + [...new Uint8Array(d)].map(b => b.toString(16).padStart(2, '0')).join('');
  } catch { return null; }
}
async function cacheGet(key) {
  if (!key) return null;
  if (memCache.has(key)) return memCache.get(key);
  try { const { getKV } = await import('./store.js'); const v = await getKV(key, null); if (v) memCache.set(key, v); return v; } catch { return null; }
}
async function cachePut(key, text) {
  if (!key || !text || text.length > 300000) return;
  memCache.set(key, text);
  try {
    const { getKV, setKV } = await import('./store.js');
    await setKV(key, text);
    // se guardan como máximo 250 respuestas (las más antiguas se borran)
    const idx = (await getKV('ai:index', [])) || [];
    idx.push(key);
    while (idx.length > 250) await setKV(idx.shift(), undefined);
    await setKV('ai:index', idx);
  } catch { /* sin caché persistente */ }
}

export async function complete(cfg, opts = {}) {
  const { system = SYSTEM, user, images = [], onText = () => {}, noCache = false } = opts;
  if (!cfg?.key) throw new Error('Configura tu clave de IA en Ajustes.');
  const key = noCache ? null : await cacheKey(cfg, [system, user, opts.json ? 'json' : '', String(opts.maxTokens || ''), ...images.map(im => im.data.length + ':' + im.data.slice(0, 2000) + im.data.slice(-2000))]);
  const hit = await cacheGet(key);
  if (hit) { onText(hit); return hit; }
  const out = await completeLive(cfg, opts);
  if (out?.trim()) cachePut(key, out);
  return out;
}

async function completeLive(cfg, { system = SYSTEM, user, images = [], maxTokens = 16000, json = false, signal, onText = () => {}, onModel } = {}) {
  const model = cfg.model || PROVIDERS[cfg.provider]?.model;
  if (cfg.provider === 'gemini') {
    const parts = [...images.map(im => ({ inline_data: { mime_type: im.mime, data: im.data } })), { text: user }];
    const r = await geminiGenerate(cfg, { system, parts, maxTokens, json, onText, signal, onModel: (m) => { lastModel.id = m; onModel?.(m); } });
    return r.text;
  }
  let out;
  if (cfg.provider === 'anthropic') {
    const client = new Anthropic({ apiKey: cfg.key, dangerouslyAllowBrowser: true, maxRetries: 2 });
    const content = [...images.map(im => ({ type: 'image', source: { type: 'base64', media_type: im.mime, data: im.data } })), { type: 'text', text: user }];
    const res = await client.messages.create({ model, max_tokens: maxTokens, system, messages: [{ role: 'user', content }] }, { signal });
    if (res.stop_reason === 'refusal') throw new Error('El modelo rechazó la solicitud' + (res.stop_details?.explanation ? ': ' + res.stop_details.explanation : '.'));
    out = res.content.filter(b => b.type === 'text').map(b => b.text).join('');
  } else {
    const base = cfg.provider === 'groq' ? 'https://api.groq.com/openai/v1' : (cfg.baseUrl || PROVIDERS.openai.baseUrl).replace(/\/+$/, '');
    const content = images.length ? [...images.map(im => ({ type: 'image_url', image_url: { url: `data:${im.mime};base64,${im.data}` } })), { type: 'text', text: user }] : user;
    const data = await postJson(`${base}/chat/completions`, {
      model, max_tokens: maxTokens, ...(json ? { response_format: { type: 'json_object' } } : {}),
      messages: [{ role: 'system', content: system }, { role: 'user', content }],
    }, { Authorization: `Bearer ${cfg.key}` }, signal);
    out = data.choices?.[0]?.message?.content || '';
  }
  lastModel.id = model;
  onText(out);
  return out;
}

/** Último modelo que respondió (para mostrarlo en la interfaz). */
export const lastModel = { id: '' };

async function postJson(url, body, headers, signal, tries = 3) {
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body), signal });
    if (res.ok) return res.json();
    const text = await res.text().catch(() => '');
    if ((res.status === 429 || res.status >= 500) && attempt < tries) {
      await new Promise(r => setTimeout(r, 1500 * attempt));
      continue;
    }
    let msg = text;
    try { const j = JSON.parse(text); msg = j.error?.message || j.message || text; } catch { /* texto plano */ }
    throw new Error(`Error ${res.status}: ${String(msg).slice(0, 300)}`);
  }
}

/** Lista los modelos disponibles para la clave (para no depender de nombres fijos). */
export async function listModels(cfg) {
  if (cfg.provider === 'anthropic') {
    const client = new Anthropic({ apiKey: cfg.key, dangerouslyAllowBrowser: true });
    const ids = [];
    for await (const m of client.models.list()) ids.push(m.id);
    return ids;
  }
  if (cfg.provider === 'gemini') return rankModels(await listGeminiModels(cfg.key, { force: true }), cfg.mode);
  const base = cfg.provider === 'groq' ? 'https://api.groq.com/openai/v1' : (cfg.baseUrl || PROVIDERS.openai.baseUrl).replace(/\/+$/, '');
  const r = await fetch(`${base}/models`, { headers: { Authorization: `Bearer ${cfg.key}` } });
  if (!r.ok) throw new Error(`Error ${r.status}`);
  const j = await r.json();
  return (j.data || []).map(m => m.id).sort();
}

/**
 * Ejecuta una tarea sobre un texto largo por fragmentos.
 * onProgress(i, total, parcial) se llama tras cada fragmento.
 */
export async function runTask(cfg, task, text, opts = {}, onProgress = () => {}, signal) {
  const def = TASKS[task];
  if (!def) throw new Error('Tarea desconocida');
  const instruction = def.prompt(opts);
  if (!instruction) throw new Error('Escribe la instrucción.');
  // Resumir y extraer datos funcionan mejor con el texto entero si cabe
  const whole = ['summarize', 'keypoints', 'custom'].includes(task);
  const chunks = chunkText(text, whole ? 200000 : cfg.provider === 'gemini' ? 14000 : 7000);
  if (!chunks.length) throw new Error('No hay texto. Extrae el texto del PDF (o usa OCR) primero.');
  // Varios fragmentos a la vez (3): el texto se muestra en orden a medida que llega
  const out = new Array(chunks.length).fill('');
  const done = new Array(chunks.length).fill(false);
  let finished = 0;
  const show = () => onProgress(finished, chunks.length, out.slice(0, (done.indexOf(false) + 1 || chunks.length + 1)).filter(Boolean).join('\n\n'));
  let next = 0;
  const worker = async () => {
    while (next < chunks.length) {
      const i = next++;
      if (signal?.aborted) throw new Error('Cancelado');
      const part = chunks.length > 1 ? `\n\n(Fragmento ${i + 1} de ${chunks.length}; mantén el estilo de los demás fragmentos.)` : '';
      const res = await complete(cfg, { user: `${instruction}${part}\n\n<<<TEXTO\n${chunks[i]}\nTEXTO>>>`, signal,
        onText: (t) => { out[i] = t; show(); } });
      out[i] = res.trim(); done[i] = true; finished++;
      show();
    }
  };
  await Promise.all(Array.from({ length: Math.min(3, chunks.length) }, worker));
  if (whole && out.length > 1 && task !== 'custom') {
    const merged = await complete(cfg, { user: `Une estos resúmenes parciales en uno solo, coherente y sin repeticiones:\n\n${out.join('\n\n---\n\n')}`, signal });
    return merged.trim();
  }
  return out.join('\n\n');
}

/** Pregunta sobre el documento (chat). `history` = [{role:'user'|'assistant', content}] */
export async function askDocument(cfg, docText, question, history = [], signal, onText) {
  const ctx = docText.length > 150000 ? docText.slice(0, 150000) + '\n[…documento recortado…]' : docText;
  const conv = history.slice(-6).map(m => `${m.role === 'user' ? 'Usuario' : 'Asistente'}: ${m.content}`).join('\n');
  return complete(cfg, {
    system: 'Respondes preguntas sobre un documento. Usa solo la información del documento; si no está, dilo. Cita la página cuando sea posible (el texto incluye marcas "[Página N]"). Responde en el idioma de la pregunta.',
    user: `<<<DOCUMENTO\n${ctx}\nDOCUMENTO>>>\n\n${conv ? conv + '\n' : ''}Usuario: ${question}`,
    maxTokens: 6000, signal, onText,
  });
}

/** Redacta un documento nuevo a partir de una descripción. */
export function draftDocument(cfg, description, signal, onText) {
  return complete(cfg, { onText,
    user: `Redacta un documento completo según esta descripción. Empieza con un título en una línea "# Título". Usa párrafos bien estructurados y "## " para secciones.\n\nDescripción: ${description}`,
    signal,
  });
}

/** Transcribe una imagen de documento (OCR con IA): mucho más preciso que el OCR local en fotos difíciles. */
export function aiOcr(cfg, image, signal, onText) {
  return complete(cfg, {
    system: 'Eres un motor de OCR. Devuelves exactamente el texto visible, sin comentarios.',
    user: 'Transcribe todo el texto de esta imagen de documento en orden de lectura. Conserva los párrafos y los saltos de línea; en tablas separa columnas con " | ". Si hay texto manuscrito, transcríbelo también. No traduzcas, no resumas, no añadas nada.',
    images: [image], maxTokens: 12000, signal, onText,
  });
}

/** Traduce o reescribe una lista de líneas manteniendo la cantidad (para conservar el diseño de la página). */
export async function transformLines(cfg, lines, instruction, signal) {
  const batches = [];
  for (let i = 0; i < lines.length; i += 120) batches.push(lines.slice(i, i + 120));
  const results = new Array(batches.length);
  let next = 0;
  // Lotes en paralelo (3 a la vez)
  const worker = async () => {
    while (next < batches.length) {
      const b = next++;
      const part = batches[b];
      const res = await complete(cfg, {
        system: 'Transformas listas de líneas de un documento. Respondes solo con JSON válido.',
        user: `${instruction}\nDevuelve un objeto JSON {"lines": [...]} con exactamente ${part.length} cadenas, una por línea de entrada, en el mismo orden. Las líneas son fragmentos consecutivos del mismo texto: tradúcelas pensando en el contexto, pero no fusiones ni dividas líneas. Conserva números, nombres propios y códigos.\n\n${JSON.stringify({ lines: part })}`,
        json: true, maxTokens: 16000, signal,
      });
      let arr;
      try { arr = JSON.parse(res.replace(/^```(?:json)?|```$/g, '').trim()).lines; } catch { throw new Error('La IA no devolvió el formato esperado. Inténtalo de nuevo.'); }
      if (!Array.isArray(arr)) throw new Error('Respuesta de la IA incompleta');
      results[b] = part.map((l, k) => String(arr[k] ?? l));
    }
  };
  await Promise.all(Array.from({ length: Math.min(3, batches.length) }, worker));
  return results.flat();
}
