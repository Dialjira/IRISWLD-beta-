// Sonido de escáner al capturar. En Android solo suena si el teléfono no está en silencio ni en vibración.
import { Capacitor, registerPlugin } from '@capacitor/core';

const DeviceSound = registerPlugin('DeviceSound');
let ctx = null;

async function ringerAllowsSound() {
  if (!Capacitor.isNativePlatform()) return true;
  try { return (await DeviceSound.getRingerMode()).mode === 'normal'; } catch { return false; }
}

/** Barrido del cabezal del escáner (ruido filtrado que sube de tono) y un "bip" corto al final. Sintetizado: sin archivos. */
export async function playScanSound() {
  if (!(await ringerAllowsSound())) return;
  try {
    ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') await ctx.resume();
    const t = ctx.currentTime, dur = 0.55;
    const master = ctx.createGain();
    master.gain.value = 0.32;
    master.connect(ctx.destination);
    // motor del cabezal: ruido blanco por un filtro paso banda que se desplaza
    const noise = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * dur), ctx.sampleRate);
    const ch = noise.getChannelData(0);
    for (let i = 0; i < ch.length; i++) ch[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource(); src.buffer = noise;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 6;
    bp.frequency.setValueAtTime(700, t); bp.frequency.exponentialRampToValueAtTime(2600, t + dur);
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(0.0001, t); ng.gain.exponentialRampToValueAtTime(0.9, t + 0.06);
    ng.gain.setValueAtTime(0.9, t + dur - 0.12); ng.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(bp).connect(ng).connect(master);
    // zumbido del motor paso a paso
    const hum = ctx.createOscillator(); hum.type = 'sawtooth';
    hum.frequency.setValueAtTime(110, t); hum.frequency.linearRampToValueAtTime(180, t + dur);
    const hg = ctx.createGain(); hg.gain.setValueAtTime(0.0001, t); hg.gain.exponentialRampToValueAtTime(0.08, t + 0.05); hg.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900;
    hum.connect(lp).connect(hg).connect(master);
    // bip de "listo"
    const beep = ctx.createOscillator(); beep.type = 'sine'; beep.frequency.value = 1760;
    const bg = ctx.createGain(); bg.gain.setValueAtTime(0.0001, t + dur); bg.gain.exponentialRampToValueAtTime(0.35, t + dur + 0.015); bg.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.16);
    beep.connect(bg).connect(master);
    src.start(t); src.stop(t + dur);
    hum.start(t); hum.stop(t + dur);
    beep.start(t + dur); beep.stop(t + dur + 0.18);
  } catch { /* sin audio disponible */ }
}
