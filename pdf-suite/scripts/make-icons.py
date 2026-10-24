# Genera el icono de AICraft PDF (adaptativo, monocromo y clásico), la pantalla de inicio y el logo interno.
# Uso: python3 scripts/make-icons.py
import glob, math
from PIL import Image, ImageDraw, ImageFilter, ImageChops

RES = 'android/app/src/main/res'

def lerp(a, b, t): return tuple(round(a[i] + (b[i] - a[i]) * t) for i in range(len(a)))

def gradient(size, stops):
    """Degradado diagonal con varias paradas (numpy: rápido incluso a 4096 px)."""
    import numpy as np
    yy, xx = np.mgrid[0:size, 0:size].astype(np.float32)
    t = (xx * .55 + yy) / (1.55 * size)
    out = np.zeros((size, size, 3), np.float32)
    ts = [st[0] for st in stops]
    for ch in range(3): out[..., ch] = np.interp(t, ts, [st[1][ch] for st in stops])
    return Image.fromarray(out.round().astype(np.uint8), 'RGB')

BG = [(0, (49, 46, 129)), (.45, (109, 40, 217)), (1, (219, 39, 119))]   # índigo → violeta → fucsia
SPARK = [(0, (253, 224, 71)), (1, (249, 115, 22))]                      # ámbar → rosa

def background(size):
    img = gradient(size, BG).convert('RGBA')
    glow = Image.new('L', (size, size), 0)
    ImageDraw.Draw(glow).ellipse((-size * .35, -size * .6, size * .7, size * .35), fill=48)
    img = Image.composite(Image.new('RGBA', (size, size), (255, 255, 255, 255)), img, glow.filter(ImageFilter.GaussianBlur(size * .14)))
    return img

def sparkle_poly(cx, cy, R, fat=2.6, n=180):
    """Estrella de 4 puntas con lados cóncavos (astroide suavizado)."""
    pts = []
    for i in range(n):
        t = 2 * math.pi * i / n
        c, s = math.cos(t), math.sin(t)
        pts.append((cx + R * math.copysign(abs(c) ** fat, c), cy + R * math.copysign(abs(s) ** fat, s)))
    return pts

def mark(size, scale=1.0, mono=False):
    S = size * 4
    im = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    cx, cy = S / 2, S / 2
    w, h = S * .44 * scale, S * .56 * scale
    x0, y0 = cx - w / 2 - S * .04 * scale, cy - h / 2
    fold = w * .3
    white = (255, 255, 255, 255)
    if not mono:  # sombra suave
        sh = Image.new('RGBA', (S, S), (0, 0, 0, 0))
        ImageDraw.Draw(sh).rounded_rectangle((x0, y0 + S * .025, x0 + w, y0 + h + S * .025), radius=S * .04, fill=(20, 5, 60, 120))
        im.alpha_composite(sh.filter(ImageFilter.GaussianBlur(S * .025)))
    doc = Image.new('RGBA', (S, S), (0, 0, 0, 0)); d = ImageDraw.Draw(doc)
    d.rounded_rectangle((x0, y0, x0 + w, y0 + h), radius=S * .04, fill=white)
    d.polygon([(x0 + w - fold, y0 - 2), (x0 + w + 2, y0 - 2), (x0 + w + 2, y0 + fold)], fill=(0, 0, 0, 0))
    d.polygon([(x0 + w - fold, y0), (x0 + w - fold, y0 + fold * .85), (x0 + w - fold * .15, y0 + fold)], fill=(221, 214, 254, 255) if not mono else white)
    ink = (0, 0, 0, 0) if mono else (124, 58, 237, 255)
    lh = h * .05
    d.rounded_rectangle((x0 + w * .15, y0 + h * .2, x0 + w * .55, y0 + h * .2 + lh * 1.6), radius=lh, fill=ink)
    for i, frac in enumerate([.7, .58, .66]):
        ly = y0 + h * (.40 + i * .12)
        d.rounded_rectangle((x0 + w * .15, ly, x0 + w * (.15 + .7 * frac), ly + lh), radius=lh / 2, fill=ink if not mono else (0, 0, 0, 0))
    im.alpha_composite(doc)
    # Estrella IA grande sobre la esquina inferior derecha, con borde para separarla de la hoja
    R = S * .17 * scale
    sx, sy = x0 + w * .96, y0 + h * .86
    FAT = 3.6  # puntas finas y lados muy cóncavos
    halo = Image.new('L', (S, S), 0); ImageDraw.Draw(halo).polygon(sparkle_poly(sx, sy, R * 1.25, 3.0), fill=255)
    if mono:
        cut = Image.new('RGBA', (S, S), (0, 0, 0, 0)); ImageDraw.Draw(cut).polygon(sparkle_poly(sx, sy, R * 1.22, 2.4), fill=white)
        im = Image.composite(Image.new('RGBA', (S, S), (0, 0, 0, 0)), im, halo)
        ImageDraw.Draw(im).polygon(sparkle_poly(sx, sy, R, FAT), fill=white)
    else:
        ring = Image.new('RGBA', (S, S), (0, 0, 0, 0)); ring.putalpha(halo)
        ring = Image.composite(gradient(S, BG).convert('RGBA'), Image.new('RGBA', (S, S), (0, 0, 0, 0)), halo)
        im.alpha_composite(ring)
        # degradado propio de la estrella (de su punta superior a la inferior)
        import numpy as np
        yy = np.clip((np.arange(S, dtype=np.float32) - (sy - R)) / (2 * R), 0, 1)
        col = np.stack([np.interp(yy, [0, 1], [SPARK[0][1][c], SPARK[1][1][c]]) for c in range(3)], -1)
        spark = Image.fromarray(np.repeat(col[:, None, :], S, 1).round().astype(np.uint8), 'RGB').convert('RGBA')
        m = Image.new('L', (S, S), 0); ImageDraw.Draw(m).polygon(sparkle_poly(sx, sy, R, FAT), fill=255)
        glow = Image.new('RGBA', (S, S), (251, 191, 36, 0)); glow.putalpha(m.filter(ImageFilter.GaussianBlur(S * .03)).point(lambda v: int(v * .7)))
        im.alpha_composite(glow)
        im.alpha_composite(Image.composite(spark, Image.new('RGBA', (S, S), (0, 0, 0, 0)), m))
        # destellos pequeños
        for (dx, dy, rr) in [(.15, -1.45, .34), (.95, -.95, .2)]:
            ImageDraw.Draw(im).polygon(sparkle_poly(sx + R * dx, sy + R * dy, R * rr, FAT), fill=(255, 255, 255, 240))
    return im.resize((size, size), Image.LANCZOS)

def rounded(img, rf=.23):
    s = img.size[0] * 4
    mask = Image.new('L', (s, s), 0); ImageDraw.Draw(mask).rounded_rectangle((0, 0, s, s), radius=s * rf, fill=255)
    out = Image.new('RGBA', img.size, (0, 0, 0, 0)); out.paste(img, (0, 0), mask.resize(img.size, Image.LANCZOS))
    return out

def full(size):
    b = background(size); b.alpha_composite(mark(size, 1.05)); return b

for dens, legacy, fg in [('mdpi', 48, 108), ('hdpi', 72, 162), ('xhdpi', 96, 216), ('xxhdpi', 144, 324), ('xxxhdpi', 192, 432)]:
    f = full(legacy * 2).resize((legacy, legacy), Image.LANCZOS)
    rounded(f).save(f'{RES}/mipmap-{dens}/ic_launcher.png')
    circ = Image.new('RGBA', (legacy, legacy), (0, 0, 0, 0))
    mk = Image.new('L', (legacy * 4, legacy * 4), 0); ImageDraw.Draw(mk).ellipse((0, 0, legacy * 4, legacy * 4), fill=255)
    circ.paste(f, (0, 0), mk.resize((legacy, legacy), Image.LANCZOS)); circ.save(f'{RES}/mipmap-{dens}/ic_launcher_round.png')
    mark(fg, .74).save(f'{RES}/mipmap-{dens}/ic_launcher_foreground.png')
    background(fg).save(f'{RES}/mipmap-{dens}/ic_launcher_background.png')
    mark(fg, .74, mono=True).save(f'{RES}/mipmap-{dens}/ic_launcher_monochrome.png')

for p in glob.glob(f'{RES}/drawable*/splash.png'):
    w, h = Image.open(p).size
    bg = Image.new('RGB', (w, h), (13, 14, 21))
    s = min(w, h) // 3
    icon = rounded(full(s))
    bg.paste(icon, ((w - s) // 2, (h - s) // 2), icon)
    bg.save(p)

rounded(full(1024)).save('resources/icon-1024.png')
mark(512, 1.0).save('public/logo-mark.png')
print('iconos generados')
