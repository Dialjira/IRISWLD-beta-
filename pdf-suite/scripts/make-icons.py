# Genera el icono de la app (adaptativo, monocromo y clásico) y la pantalla de inicio.
# Uso: python3 scripts/make-icons.py
import glob, math
from PIL import Image, ImageDraw, ImageFilter

RES = 'android/app/src/main/res'
C1, C2, C3 = (99, 82, 255), (139, 92, 246), (217, 70, 239)   # violeta → magenta

def gradient(size):
    """Degradado diagonal de la marca con un brillo suave arriba a la izquierda."""
    img = Image.new('RGB', (size, size))
    px = img.load()
    for y in range(size):
        for x in range(size):
            t = (x + y) / (2 * size)
            if t < .55: a, b, k = C1, C2, t / .55
            else: a, b, k = C2, C3, (t - .55) / .45
            px[x, y] = tuple(round(a[i] + (b[i] - a[i]) * k) for i in range(3))
    glow = Image.new('L', (size, size), 0)
    ImageDraw.Draw(glow).ellipse((-size * .35, -size * .45, size * .75, size * .55), fill=70)
    glow = glow.filter(ImageFilter.GaussianBlur(size * .12))
    img = Image.composite(Image.new('RGB', (size, size), (255, 255, 255)), img, glow)
    return img

def mark(size, scale=1.0, mono=False):
    """Hoja con esquina doblada, líneas de texto, láser de escaneo y esquinas de visor."""
    S = size * 4
    im = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    cx, cy = S / 2, S / 2
    w, h = S * .40 * scale, S * .50 * scale
    x0, y0 = cx - w / 2, cy - h / 2
    fold = w * .30
    white = (255, 255, 255, 255)
    ink = (255, 255, 255, 255) if mono else (124, 92, 250, 255)
    # sombra suave de la hoja
    if not mono:
        sh = Image.new('RGBA', (S, S), (0, 0, 0, 0))
        ImageDraw.Draw(sh).rounded_rectangle((x0, y0 + S * .02, x0 + w, y0 + h + S * .02), radius=S * .03, fill=(40, 10, 90, 110))
        im.alpha_composite(sh.filter(ImageFilter.GaussianBlur(S * .02)))
    # hoja
    d.rounded_rectangle((x0, y0, x0 + w, y0 + h), radius=S * .03, fill=white if not mono else None, outline=white if mono else None, width=int(S * .02) if mono else 0)
    d.polygon([(x0 + w - fold, y0 - 1), (x0 + w + 1, y0 - 1), (x0 + w + 1, y0 + fold)], fill=(0, 0, 0, 0))
    d.polygon([(x0 + w - fold, y0), (x0 + w - fold, y0 + fold * .82), (x0 + w - fold * .18, y0 + fold)], fill=(225, 213, 255, 255) if not mono else white)
    # líneas de texto
    lh = h * .055
    for i, frac in enumerate([.62, .78, .70, .5]):
        ly = y0 + h * (.40 + i * .13)
        d.rounded_rectangle((x0 + w * .16, ly, x0 + w * (.16 + .68 * frac), ly + lh), radius=lh / 2, fill=ink if not mono else (0, 0, 0, 0))
    # título
    d.rounded_rectangle((x0 + w * .16, y0 + h * .2, x0 + w * .54, y0 + h * .2 + lh * 1.5), radius=lh, fill=ink if not mono else (0, 0, 0, 0))
    # láser de escaneo con brillo
    by = y0 + h * .58
    beam = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    bd = ImageDraw.Draw(beam)
    bd.rounded_rectangle((cx - w * .68, by - S * .012, cx + w * .68, by + S * .012), radius=S * .012, fill=(255, 255, 255, 255))
    if not mono:
        glow = Image.new('RGBA', (S, S), (0, 0, 0, 0))
        ImageDraw.Draw(glow).rounded_rectangle((cx - w * .7, by - S * .05, cx + w * .7, by + S * .05), radius=S * .05, fill=(56, 239, 205, 200))
        im.alpha_composite(glow.filter(ImageFilter.GaussianBlur(S * .03)))
        bd.rounded_rectangle((cx - w * .68, by - S * .009, cx + w * .68, by + S * .009), radius=S * .01, fill=(110, 255, 225, 255))
    im.alpha_composite(beam)
    # esquinas del visor
    m, L, t = S * .075 * scale, S * .11 * scale, S * .028
    bx0, by0, bx1, by1 = x0 - m, y0 - m, x0 + w + m, y0 + h + m
    for (px, py, sx, sy) in [(bx0, by0, 1, 1), (bx1, by0, -1, 1), (bx1, by1, -1, -1), (bx0, by1, 1, -1)]:
        d.line([(px, py + sy * L), (px, py), (px + sx * L, py)], fill=white, width=int(t), joint='curve')
        for qx, qy in [(px, py + sy * L), (px + sx * L, py), (px, py)]:
            d.ellipse((qx - t / 2, qy - t / 2, qx + t / 2, qy + t / 2), fill=white)
    return im.resize((size, size), Image.LANCZOS)

def rounded(img, radius_frac=.22):
    s = img.size[0] * 4
    mask = Image.new('L', (s, s), 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, s, s), radius=s * radius_frac, fill=255)
    out = Image.new('RGBA', img.size, (0, 0, 0, 0))
    out.paste(img, (0, 0), mask.resize(img.size, Image.LANCZOS))
    return out

for dens, legacy, fg in [('mdpi', 48, 108), ('hdpi', 72, 162), ('xhdpi', 96, 216), ('xxhdpi', 144, 324), ('xxxhdpi', 192, 432)]:
    base = gradient(legacy).convert('RGBA'); base.alpha_composite(mark(legacy, 1.12))
    rounded(base).save(f'{RES}/mipmap-{dens}/ic_launcher.png')
    circ = Image.new('RGBA', (legacy, legacy), (0, 0, 0, 0))
    mk = Image.new('L', (legacy * 4, legacy * 4), 0); ImageDraw.Draw(mk).ellipse((0, 0, legacy * 4, legacy * 4), fill=255)
    circ.paste(base, (0, 0), mk.resize((legacy, legacy), Image.LANCZOS)); circ.save(f'{RES}/mipmap-{dens}/ic_launcher_round.png')
    mark(fg, .78).save(f'{RES}/mipmap-{dens}/ic_launcher_foreground.png')
    gradient(fg).save(f'{RES}/mipmap-{dens}/ic_launcher_background.png')
    mark(fg, .78, mono=True).save(f'{RES}/mipmap-{dens}/ic_launcher_monochrome.png')

for p in glob.glob(f'{RES}/drawable*/splash.png'):
    w, h = Image.open(p).size
    bg = Image.new('RGB', (w, h), (13, 14, 21))
    s = min(w, h) // 3
    icon = gradient(s).convert('RGBA'); icon.alpha_composite(mark(s, 1.12))
    icon = rounded(icon)
    bg.paste(icon, ((w - s) // 2, (h - s) // 2), icon)
    bg.save(p)

big = gradient(1024).convert('RGBA'); big.alpha_composite(mark(1024, 1.12)); rounded(big).save('resources/icon-1024.png')
mark(512, 1.0).save('public/logo-mark.png')
print('iconos generados')
