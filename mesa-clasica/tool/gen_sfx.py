"""Genera los efectos de sonido de Mesa Clásica (sintetizados, sin licencias de terceros).

Uso: python3 tool/gen_sfx.py  (escribe assets/sfx/*.wav)
"""
import math
import os
import random
import struct
import wave

SR = 22050
OUT = os.path.join(os.path.dirname(__file__), '..', 'assets', 'sfx')
rng = random.Random(7)


def write(name, samples, gain=0.9):
    peak = max(1e-9, max(abs(s) for s in samples))
    data = b''.join(struct.pack('<h', int(max(-1, min(1, s / peak * gain)) * 32767)) for s in samples)
    with wave.open(os.path.join(OUT, name + '.wav'), 'wb') as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(data)


def silence(sec):
    return [0.0] * int(SR * sec)


def noise_burst(sec, decay, lp=0.5, gain=1.0):
    out, y = [], 0.0
    for i in range(int(SR * sec)):
        t = i / SR
        y = y + lp * (rng.uniform(-1, 1) - y)  # filtro pasa bajos simple
        out.append(y * math.exp(-t * decay) * gain)
    return out


def tone(freq, sec, decay=4.0, harmonics=(1.0, 0.4, 0.2), attack=0.004, sweep=0.0):
    out = []
    phase = 0.0
    for i in range(int(SR * sec)):
        t = i / SR
        f = freq + sweep * t
        phase += 2 * math.pi * f / SR
        env = min(1.0, t / attack) * math.exp(-t * decay)
        s = sum(a * math.sin(phase * (k + 1)) for k, a in enumerate(harmonics))
        out.append(s * env)
    return out


def mix(*tracks):
    n = max(len(t) for t in tracks)
    return [sum(t[i] for t in tracks if i < len(t)) for i in range(n)]


def at(sec, track):
    return silence(sec) + track


def concat(*tracks):
    out = []
    for t in tracks:
        out += t
    return out


os.makedirs(OUT, exist_ok=True)

# Carta: roce corto y brillante.
write('draw', noise_burst(0.09, 45, lp=0.55))
write('deal', noise_burst(0.06, 70, lp=0.7), gain=0.7)
# Descarte: golpe seco sobre el paño.
write('discard', mix(noise_burst(0.08, 60, lp=0.35), tone(140, 0.12, decay=30, harmonics=(1.0,))), gain=0.85)
# Barajar: ráfaga de roces cada vez más rápida.
riffle = []
pos = 0.0
for k in range(26):
    riffle.append(at(pos, noise_burst(0.035, 90, lp=0.6, gain=0.6 + 0.4 * rng.random())))
    pos += 0.03 * (1 - k / 40)
write('shuffle', mix(*riffle, at(pos, noise_burst(0.12, 25, lp=0.3))), gain=0.8)
# Bajar juego: acorde que se abre.
write('meld', mix(*[at(i * 0.07, tone(f, 0.6, decay=5)) for i, f in enumerate([523.25, 659.25, 783.99])]), gain=0.7)
# Tu turno: campanita de dos notas.
write('turn', mix(tone(880, 0.5, decay=6, harmonics=(1.0, 0.3, 0.1)), at(0.12, tone(1318.5, 0.5, decay=6))), gain=0.6)
# Error: zumbido grave.
write('error', tone(150, 0.22, decay=6, harmonics=(1.0, 0.0, 0.5, 0.0, 0.3)), gain=0.6)
# Pinchazo: zap ascendente + golpe.
write('pinch', mix(tone(500, 0.16, decay=8, harmonics=(1.0, 0.5), sweep=9000),
                   at(0.15, tone(90, 0.3, decay=12, harmonics=(1.0, 0.4))),
                   at(0.15, noise_burst(0.12, 30, lp=0.5))), gain=0.95)
# Pinchazo en falso: "uaa-uaa" descendente.
write('falsePinch', concat(tone(392, 0.25, decay=3, harmonics=(1.0, 0.6, 0.3), sweep=-200),
                           tone(330, 0.45, decay=3, harmonics=(1.0, 0.6, 0.3), sweep=-180)), gain=0.6)
# Cerrar/bajarse: acorde brillante.
write('goDown', mix(*[at(i * 0.05, tone(f, 0.7, decay=4)) for i, f in enumerate([392.0, 523.25, 659.25, 783.99])]), gain=0.75)
# Victoria: fanfarria.
notes = [(0.0, 523.25), (0.14, 659.25), (0.28, 783.99), (0.42, 1046.5)]
fan = [at(t, tone(f, 0.9 if i == 3 else 0.35, decay=2.5 if i == 3 else 6, harmonics=(1.0, 0.5, 0.35, 0.2)))
       for i, (t, f) in enumerate(notes)]
write('win', mix(*fan, at(0.42, tone(523.25, 0.9, decay=2.5))), gain=0.8)
# Golpe en la mesa (tocar en Gin / cerrar).
write('knock', mix(tone(180, 0.12, decay=35, harmonics=(1.0, 0.3)), at(0.13, tone(170, 0.12, decay=35, harmonics=(1.0, 0.3)))))
print('ok', sorted(os.listdir(OUT)))
