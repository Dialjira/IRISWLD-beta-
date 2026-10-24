// Narración (texto a voz) y dictado (voz a texto).
// Dos motores: voz IA de Gemini (muy natural, acento latinoamericano) o la mejor voz del teléfono.
import { Capacitor } from '@capacitor/core';
import { TextToSpeech } from '@capacitor-community/text-to-speech';
import { SpeechRecognition } from '@capacitor-community/speech-recognition';
import { splitSentences } from './text.js';
import { geminiTTS, pcmToWav } from './gemini.js';

const native = () => Capacitor.isNativePlatform();

export const LATAM_STYLE = 'Lee el siguiente texto en voz alta en español latinoamericano neutro, con acento latino suave, tono natural, cálido y pausado, como un narrador profesional de audiolibros. Respeta la puntuación y no añadas nada';
const styleFor = (lang) => (lang?.startsWith('es') ? LATAM_STYLE : 'Read the following text aloud naturally, warmly and at a relaxed pace, like a professional audiobook narrator, in the language it is written in');

export async function ttsLanguages() {
  try {
    if (native()) return (await TextToSpeech.getSupportedLanguages()).languages || [];
    return [...new Set((speechSynthesis.getVoices() || []).map(v => v.lang))];
  } catch { return []; }
}

let voiceCache = null;
async function allVoices() {
  if (voiceCache) return voiceCache;
  try {
    if (native()) voiceCache = ((await TextToSpeech.getSupportedVoices()).voices || []).map((v, index) => ({ ...v, index }));
    else {
      let vs = speechSynthesis.getVoices();
      if (!vs.length) { await new Promise(r => { speechSynthesis.onvoiceschanged = r; setTimeout(r, 800); }); vs = speechSynthesis.getVoices(); }
      voiceCache = vs.map((v, index) => ({ voiceURI: v.voiceURI, name: v.name, lang: v.lang, localService: v.localService, index }));
    }
  } catch { voiceCache = []; }
  return voiceCache;
}

const REGION = { 'es-us': 0, 'es-mx': 1, 'es-419': 2, 'es-co': 3, 'es-ar': 4, 'es-cl': 5, 'es-pe': 6, 'es-es': 9 };
/**
 * Voces del teléfono para un idioma, de mejor a peor: para español primero Latinoamérica,
 * y dentro de cada región las de alta calidad (en línea) antes que las locales.
 */
export async function deviceVoices(lang = 'es-US') {
  const base = lang.slice(0, 2).toLowerCase();
  const list = (await allVoices()).filter(v => (v.lang || '').toLowerCase().replace('_', '-').startsWith(base));
  const reg = (v) => REGION[(v.lang || '').toLowerCase().replace('_', '-')] ?? 7;
  const quality = (v) => (/network|neural|wavenet|enhanced|premium|natural/i.test(v.name + v.voiceURI) || v.localService === false ? 0 : 1);
  list.sort((a, b) => (base === 'es' ? reg(a) - reg(b) : 0) || quality(a) - quality(b) || a.name.localeCompare(b.name));
  return list.map((v, i) => ({
    id: v.voiceURI || v.name, index: v.index, lang: v.lang,
    label: `${regionName(v.lang)} · voz ${i + 1}${quality(v) === 0 ? ' · alta calidad' : ''}${v.localService === false ? ' (en línea)' : ''}`,
  }));
}
function regionName(lang = '') {
  const l = lang.toLowerCase().replace('_', '-');
  return { 'es-us': 'Español latino (EE. UU.)', 'es-mx': 'Español de México', 'es-419': 'Español latinoamericano', 'es-co': 'Español de Colombia', 'es-ar': 'Español de Argentina', 'es-es': 'Español de España' }[l] || lang;
}

async function speakDevice(text, { lang, rate, pitch, voiceId }) {
  const voices = await allVoices();
  const v = voiceId ? voices.find(x => (x.voiceURI || x.name) === voiceId) : null;
  if (native()) return TextToSpeech.speak({ text, lang: v?.lang || lang, rate, pitch, volume: 1, voice: v ? v.index : -1, category: 'playback', queueStrategy: 0 });
  return new Promise((resolve, reject) => {
    if (!('speechSynthesis' in window)) return reject(new Error('Este dispositivo no tiene síntesis de voz'));
    const u = new SpeechSynthesisUtterance(text);
    u.lang = v?.lang || lang; u.rate = rate; u.pitch = pitch;
    const sv = speechSynthesis.getVoices();
    u.voice = (v && sv[v.index]) || sv.find(x => x.lang.replace('_', '-').toLowerCase().startsWith(lang.slice(0, 2).toLowerCase())) || null;
    u.onend = () => resolve();
    u.onerror = (e) => (e.error === 'interrupted' || e.error === 'canceled') ? resolve() : reject(new Error(e.error));
    speechSynthesis.speak(u);
  });
}

/** Agrupa frases en bloques para la voz IA: el primero corto para empezar rápido, los demás largos para ahorrar peticiones. */
export function groupSentences(sentences, first = 260, rest = 1400) {
  const groups = [];
  let cur = [], len = 0;
  for (let i = 0; i < sentences.length; i++) {
    const max = groups.length ? rest : first;
    if (cur.length && len + sentences[i].length > max) { groups.push(cur); cur = []; len = 0; }
    cur.push(i); len += sentences[i].length + 1;
  }
  if (cur.length) groups.push(cur);
  return groups;
}

/** Narrador con frases, pausa/continuar, salto y dos motores de voz. */
export class Narrator {
  constructor() { this.sentences = []; this.index = 0; this.playing = false; this.token = 0; this.onSentence = () => {}; this.onState = () => {}; this.audio = null; this.cache = new Map(); }
  load(text) { this.stop(); this.sentences = splitSentences(text); this.index = 0; this.groups = groupSentences(this.sentences); this.cache.clear(); }

  async play(opts) {
    if (!this.sentences.length) return;
    const o = opts();
    if (o.engine === 'ai' && o.cfg?.key) return this._playAI(opts);
    this.playing = true; this.onState('playing');
    const my = ++this.token;
    while (this.index < this.sentences.length && this.token === my) {
      this.onSentence(this.index, this.sentences[this.index]);
      try { await speakDevice(this.sentences[this.index], opts()); }
      catch (e) { this.playing = false; this.onState('error', e); return; }
      if (this.token !== my) return;
      this.index++;
    }
    if (this.token === my) { this.playing = false; this.index = 0; this.onState('ended'); }
  }

  _groupOf(i) { return this.groups.findIndex(g => g.includes(i)); }

  async _audioFor(gi, o) {
    if (!this.cache.has(gi)) {
      const text = this.groups[gi].map(i => this.sentences[i]).join(' ');
      const p = geminiTTS(o.cfg, text, { voice: o.aiVoice, style: styleFor(o.lang) }).then(({ pcm, rate }) => {
        const wav = pcmToWav([pcm], rate);
        return { url: URL.createObjectURL(new Blob([wav], { type: 'audio/wav' })), seconds: pcm.length / rate };
      });
      p.catch(() => this.cache.delete(gi));
      this.cache.set(gi, p);
    }
    return this.cache.get(gi);
  }

  async _playAI(opts) {
    const my = ++this.token;
    this.playing = true; this.onState('playing');
    // Reanudar el audio en pausa si sigue en la misma frase
    if (this.audio && this.audioGroup === this._groupOf(this.index) && this.audio.paused && this.audio.currentTime > 0) {
      this.audio.playbackRate = opts().rate;
      await this.audio.play().catch(() => {});
      await new Promise(r => { this.audio.onended = r; this.audio.onpause = () => { if (this.token !== my) r(); }; });
      if (this.token !== my) return;
      this.index = this.groups[this.audioGroup].at(-1) + 1;
    }
    let gi = this._groupOf(this.index);
    while (gi >= 0 && gi < this.groups.length && this.token === my) {
      const o = opts();
      this.onSentence(this.groups[gi][0], this.sentences[this.groups[gi][0]]);
      this.onState('loading');
      let clip;
      try { clip = await this._audioFor(gi, o); }
      catch (e) {
        if (this.token !== my) return;
        // Sin voz IA (cuota, red…): se sigue con la voz del teléfono sin cortar la lectura
        this.onState('fallback', e);
        this.playing = false;
        return this.play(() => ({ ...opts(), engine: 'device' }));
      }
      if (this.token !== my) return;
      if (gi + 1 < this.groups.length) this._audioFor(gi + 1, o).catch(() => {});
      this.onState('playing');
      const audio = this.audio = new Audio(clip.url);
      this.audioGroup = gi;
      audio.playbackRate = o.rate; audio.preservesPitch = true;
      const g = this.groups[gi];
      const lens = g.map(i => this.sentences[i].length), total = lens.reduce((a, b) => a + b, 0);
      audio.ontimeupdate = () => {
        // Resaltado aproximado: la frase según la proporción de tiempo transcurrido
        let t = audio.currentTime / (audio.duration || clip.seconds) * total, k = 0;
        while (k < g.length - 1 && t > lens[k]) { t -= lens[k]; k++; }
        if (this.index !== g[k]) { this.index = g[k]; this.onSentence(g[k], this.sentences[g[k]]); }
      };
      await audio.play().catch(() => {});
      await new Promise(r => { audio.onended = r; audio.onpause = () => { if (this.token !== my) r(); }; audio.onerror = r; });
      if (this.token !== my) return;
      gi++;
      if (gi < this.groups.length) this.index = this.groups[gi][0];
    }
    if (this.token === my) { this.playing = false; this.index = 0; this.audio = null; this.onState('ended'); }
  }

  async pause() { this.token++; this.playing = false; await this._halt(true); this.onState('paused'); }
  async stop() { this.token++; this.playing = false; this.index = 0; await this._halt(false); this.audio = null; this.onState('stopped'); }
  async seek(i, opts) { await this.pause(); this.audio = null; this.index = Math.max(0, Math.min(i, this.sentences.length - 1)); this.play(opts); }
  async _halt(keepAudio) {
    try { if (this.audio) { this.audio.pause(); if (!keepAudio) this.audio.src = ''; } } catch { /* nada */ }
    try { if (native()) await TextToSpeech.stop(); else speechSynthesis.cancel(); } catch { /* nada que parar */ }
  }
}

/** Genera un audiolibro WAV con la voz IA. onProgress(hecho, total). */
export async function exportAudio(cfg, text, { voice = 'Kore', lang = 'es-US', signal, onProgress = () => {} } = {}) {
  const groups = groupSentences(splitSentences(text), 2600, 2600).map(g => g);
  const sentences = splitSentences(text);
  const pcm = [];
  let rate = 24000;
  for (let i = 0; i < groups.length; i++) {
    if (signal?.aborted) throw new Error('Cancelado');
    onProgress(i, groups.length);
    const r = await geminiTTS(cfg, groups[i].map(k => sentences[k]).join(' '), { voice, style: styleFor(lang), signal });
    pcm.push(r.pcm, new Int16Array(Math.round(r.rate * 0.35))); // pequeña pausa entre bloques
    rate = r.rate;
  }
  onProgress(groups.length, groups.length);
  return pcmToWav(pcm, rate);
}

/** Abre la instalación de voces del sistema (Android). */
export async function installVoices() { if (native()) await TextToSpeech.openInstall(); }

/** Dictado: devuelve una función para detenerlo. onText(texto, esFinal) */
export async function startDictation(lang, onText, onEnd) {
  if (native()) {
    const { available } = await SpeechRecognition.available();
    if (!available) throw new Error('El reconocimiento de voz no está disponible en este teléfono.');
    const perm = await SpeechRecognition.requestPermissions();
    if (perm.speechRecognition !== 'granted') throw new Error('Permiso de micrófono denegado.');
    await SpeechRecognition.removeAllListeners();
    let last = '';
    await SpeechRecognition.addListener('partialResults', (d) => { last = d.matches?.[0] || ''; onText(last, false); });
    await SpeechRecognition.addListener('listeningState', (d) => {
      if (d.status === 'stopped') { if (last) onText(last, true); last = ''; onEnd?.(); }
    });
    await SpeechRecognition.start({ language: lang, partialResults: true, popup: false, maxResults: 1 });
    return async () => { try { await SpeechRecognition.stop(); } catch { /* ya detenido */ } };
  }
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) throw new Error('Tu navegador no permite dictado por voz.');
  const r = new SR();
  r.lang = lang; r.interimResults = true; r.continuous = true;
  r.onresult = (e) => {
    for (let i = e.resultIndex; i < e.results.length; i++) onText(e.results[i][0].transcript, e.results[i].isFinal);
  };
  r.onend = () => onEnd?.();
  r.start();
  return async () => r.stop();
}
