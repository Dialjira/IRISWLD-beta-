// Narración (texto a voz) y dictado (voz a texto). En Android usa los motores nativos; en navegador, Web Speech.
import { Capacitor } from '@capacitor/core';
import { TextToSpeech } from '@capacitor-community/text-to-speech';
import { SpeechRecognition } from '@capacitor-community/speech-recognition';
import { splitSentences } from './text.js';

const native = () => Capacitor.isNativePlatform();

export async function ttsLanguages() {
  try {
    if (native()) return (await TextToSpeech.getSupportedLanguages()).languages || [];
    return [...new Set((speechSynthesis.getVoices() || []).map(v => v.lang))];
  } catch { return []; }
}

function speakOnce(text, { lang, rate, pitch }) {
  if (native()) return TextToSpeech.speak({ text, lang, rate, pitch, volume: 1, category: 'playback', queueStrategy: 0 });
  return new Promise((resolve, reject) => {
    if (!('speechSynthesis' in window)) return reject(new Error('Este dispositivo no tiene síntesis de voz'));
    const u = new SpeechSynthesisUtterance(text);
    u.lang = lang; u.rate = rate; u.pitch = pitch;
    const v = speechSynthesis.getVoices().find(x => x.lang.replace('_', '-').toLowerCase().startsWith(lang.slice(0, 2).toLowerCase()));
    if (v) u.voice = v;
    u.onend = () => resolve();
    u.onerror = (e) => (e.error === 'interrupted' || e.error === 'canceled') ? resolve() : reject(new Error(e.error));
    speechSynthesis.speak(u);
  });
}

/** Narrador con frases, pausa/continuar y salto. */
export class Narrator {
  constructor() { this.sentences = []; this.index = 0; this.playing = false; this.token = 0; this.onSentence = () => {}; this.onState = () => {}; }
  load(text) { this.stop(); this.sentences = splitSentences(text); this.index = 0; }
  async play(opts) {
    if (!this.sentences.length) return;
    this.playing = true; this.onState('playing');
    const my = ++this.token;
    while (this.index < this.sentences.length && this.token === my) {
      this.onSentence(this.index, this.sentences[this.index]);
      try { await speakOnce(this.sentences[this.index], opts()); }
      catch (e) { this.playing = false; this.onState('error', e); return; }
      if (this.token !== my) return;
      this.index++;
    }
    if (this.token === my) { this.playing = false; this.index = 0; this.onState('ended'); }
  }
  async pause() { this.token++; this.playing = false; await this._halt(); this.onState('paused'); }
  async stop() { this.token++; this.playing = false; this.index = 0; await this._halt(); this.onState('stopped'); }
  async seek(i, opts) { await this.pause(); this.index = Math.max(0, Math.min(i, this.sentences.length - 1)); this.play(opts); }
  async _halt() {
    try { if (native()) await TextToSpeech.stop(); else speechSynthesis.cancel(); } catch { /* nada que parar */ }
  }
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
