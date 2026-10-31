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


# ---------- Sonidos de emociones ----------

def saw(freq, sec, decay=3.0, attack=0.01, sweep=0.0, vibrato=0.0, vib_hz=6.0):
    out, phase = [], 0.0
    for i in range(int(SR * sec)):
        t = i / SR
        f = freq + sweep * t + vibrato * math.sin(2 * math.pi * vib_hz * t)
        phase += f / SR
        x = 2 * (phase % 1.0) - 1
        env = min(1.0, t / attack) * math.exp(-t * decay)
        out.append(x * env)
    return out


# 👏 Aplausos: ráfagas de palmas desordenadas.
claps = []
for k in range(14):
    claps.append(at(k * 0.07 + rng.random() * 0.03, noise_burst(0.05, 60, lp=0.8, gain=0.6 + 0.4 * rng.random())))
write('emo_clap', mix(*claps), gain=0.8)

# 😂 Risa: "ja-ja-ja-ja" descendente con vibrato.
laugh = [at(i * 0.14, tone(620 - i * 45, 0.12, decay=14, harmonics=(1.0, 0.6, 0.4, 0.2))) for i in range(6)]
write('emo_laugh', mix(*laugh), gain=0.7)

# 🔥 Fuego: chisporroteo y llamarada.
crackle = [at(rng.random() * 0.8, noise_burst(0.02, 120, lp=0.9, gain=rng.random())) for _ in range(40)]
whoosh = [n * min(1.0, i / (SR * 0.4)) for i, n in enumerate(noise_burst(0.9, 2.5, lp=0.08))]
write('emo_fire', mix(whoosh, *crackle), gain=0.8)

# 😡 Enojo: gruñido grave con trémolo.
growl = saw(85, 0.6, decay=2.5, vibrato=8, vib_hz=18)
write('emo_angry', mix(growl, [0.4 * x for x in saw(127, 0.6, decay=2.5, vibrato=6, vib_hz=17)]), gain=0.6)

# 😮 Sorpresa: "¡oooh!" ascendente.
write('emo_wow', tone(280, 0.7, decay=2.0, harmonics=(1.0, 0.5, 0.25), sweep=450, attack=0.05), gain=0.7)

# 🎉 Fiesta: corneta de fiesta + estallidos.
horn = saw(420, 0.45, decay=1.5, sweep=180, vibrato=12, vib_hz=9)
pops = [at(0.45 + i * 0.09, noise_burst(0.05, 50, lp=0.6)) for i in range(4)]
write('emo_party', mix(horn, *pops), gain=0.65)

# 😎 Cool: acorde suave de jazz.
write('emo_cool', mix(tone(392, 0.8, decay=2.5), tone(493.9, 0.8, decay=2.5), tone(587.3, 0.8, decay=2.5),
                      at(0.25, tone(698.5, 0.6, decay=3))), gain=0.6)

# 🙏 Gracias: arpa ascendente.
write('emo_pray', mix(*[at(i * 0.06, tone(f, 0.7, decay=4, harmonics=(1.0, 0.3)))
                        for i, f in enumerate([523.25, 659.25, 783.99, 1046.5, 1318.5])]), gain=0.6)

# 💩 Burla: "buuu" que cae con rebote cómico.
write('emo_poop', concat(saw(180, 0.25, decay=3, sweep=-260), tone(220, 0.25, decay=8, sweep=-400)), gain=0.55)

# 👑 Corona: fanfarria real corta.
royal = [at(t, saw(f, 0.25 if i < 3 else 0.6, decay=4 if i < 3 else 2)) for i, (t, f) in
         enumerate([(0.0, 392.0), (0.12, 392.0), (0.24, 523.25), (0.36, 659.25)])]
write('emo_crown', mix(*royal), gain=0.5)

# Frase rápida: burbuja que aparece.
write('emo_phrase', mix(tone(660, 0.18, decay=14, sweep=900), at(0.08, tone(1320, 0.2, decay=12))), gain=0.6)

# Mensaje escrito: notificación de dos tonos.
write('emo_message', mix(tone(988, 0.25, decay=9), at(0.11, tone(1319, 0.3, decay=8))), gain=0.6)
print('ok emociones')
