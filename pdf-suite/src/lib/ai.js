// IA con clave propia del usuario: Claude (Anthropic), Google Gemini, Groq o cualquier API compatible con OpenAI.
import Anthropic from '@anthropic-ai/sdk';
import { chunkText } from './text.js';

export const PROVIDERS = {
  anthropic: { name: 'Claude (Anthropic)', model: 'claude-opus-5-5', keyUrl: 'https://console.anthropic.com/settings/keys' },
  gemini: { name: 'Google Gemini', model: 'gemini-2.5-flash', keyUrl: 'https://aistudio.google.com/apikey' },
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

const SYSTEM = 'Eres el asistente de documentos de ArtCraft PDF. Trabajas con texto extraído de documentos PDF. Sigues la instrucción con precisión y devuelves texto plano listo para insertar en un documento (puedes usar "# " para títulos y "- " para viñetas; no uses otro Markdown).';

export async function complete(cfg, { system = SYSTEM, user, maxTokens = 8000, signal }) {
  if (!cfg?.key) throw new Error('Configura tu clave de IA en Ajustes.');
  const model = cfg.model || PROVIDERS[cfg.provider]?.model;
  if (cfg.provider === 'anthropic') {
    const client = new Anthropic({ apiKey: cfg.key, dangerouslyAllowBrowser: true, maxRetries: 2 });
    const res = await client.beta.messages.create({
      model, max_tokens: maxTokens, system,
      betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default',
      messages: [{ role: 'user', content: user }],
    }, { signal });
    if (res.stop_reason === 'refusal') throw new Error('El modelo rechazó la solicitud' + (res.stop_details?.explanation ? ': ' + res.stop_details.explanation : '.'));
    return res.content.filter(b => b.type === 'text').map(b => b.text).join('');
  }
  if (cfg.provider === 'gemini') {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(cfg.key)}`;
    const data = await postJson(url, {
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: 'user', parts: [{ text: user }] }],
      generationConfig: { maxOutputTokens: maxTokens },
    }, {}, signal);
    const cand = data.candidates?.[0];
    if (!cand) throw new Error('Gemini no devolvió respuesta' + (data.promptFeedback?.blockReason ? ` (${data.promptFeedback.blockReason})` : ''));
    return (cand.content?.parts || []).filter(p => !p.thought).map(p => p.text || '').join('');
  }
  const base = cfg.provider === 'groq' ? 'https://api.groq.com/openai/v1' : (cfg.baseUrl || PROVIDERS.openai.baseUrl).replace(/\/+$/, '');
  const data = await postJson(`${base}/chat/completions`, {
    model, max_tokens: maxTokens,
    messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
  }, { Authorization: `Bearer ${cfg.key}` }, signal);
  return data.choices?.[0]?.message?.content || '';
}

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
  if (cfg.provider === 'gemini') {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?pageSize=200&key=${encodeURIComponent(cfg.key)}`);
    if (!r.ok) throw new Error(`Error ${r.status}`);
    const j = await r.json();
    return (j.models || []).filter(m => (m.supportedGenerationMethods || []).includes('generateContent')).map(m => m.name.replace(/^models\//, ''));
  }
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
  const chunks = chunkText(text, whole ? 60000 : 7000);
  if (!chunks.length) throw new Error('No hay texto. Extrae el texto del PDF (o usa OCR) primero.');
  const out = [];
  for (let i = 0; i < chunks.length; i++) {
    if (signal?.aborted) throw new Error('Cancelado');
    const part = chunks.length > 1 ? `\n\n(Fragmento ${i + 1} de ${chunks.length}; trátalo como continuación del anterior.)` : '';
    const res = await complete(cfg, { user: `${instruction}${part}\n\n<<<TEXTO\n${chunks[i]}\nTEXTO>>>`, signal });
    out.push(res.trim());
    onProgress(i + 1, chunks.length, out.join('\n\n'));
  }
  if (whole && out.length > 1 && task !== 'custom') {
    const merged = await complete(cfg, { user: `Une estos resúmenes parciales en uno solo, coherente y sin repeticiones:\n\n${out.join('\n\n---\n\n')}`, signal });
    return merged.trim();
  }
  return out.join('\n\n');
}

/** Pregunta sobre el documento (chat). `history` = [{role:'user'|'assistant', content}] */
export async function askDocument(cfg, docText, question, history = [], signal) {
  const ctx = docText.length > 150000 ? docText.slice(0, 150000) + '\n[…documento recortado…]' : docText;
  const conv = history.slice(-6).map(m => `${m.role === 'user' ? 'Usuario' : 'Asistente'}: ${m.content}`).join('\n');
  return complete(cfg, {
    system: 'Respondes preguntas sobre un documento. Usa solo la información del documento; si no está, dilo. Cita la página cuando sea posible (el texto incluye marcas "[Página N]"). Responde en el idioma de la pregunta.',
    user: `<<<DOCUMENTO\n${ctx}\nDOCUMENTO>>>\n\n${conv ? conv + '\n' : ''}Usuario: ${question}`,
    maxTokens: 4000, signal,
  });
}

/** Redacta un documento nuevo a partir de una descripción. */
export function draftDocument(cfg, description, signal) {
  return complete(cfg, {
    user: `Redacta un documento completo según esta descripción. Empieza con un título en una línea "# Título". Usa párrafos bien estructurados y "## " para secciones.\n\nDescripción: ${description}`,
    signal,
  });
}
