# Genera el icono y la pantalla de inicio de Android (ejecutar con: python3 scripts/make-icons.py)
import glob
from PIL import Image, ImageDraw, ImageFont

CORAL = (229, 83, 61)
FONT = 'node_modules/dejavu-fonts-ttf/ttf/DejaVuSans-Bold.ttf'
RES = 'android/app/src/main/res'

def glyph(size, bg=None, scale=1.0):
    """Hoja con esquina doblada y una "A"; `scale` reduce el dibujo dentro de la zona segura."""
    S = size * 4
    im = Image.new('RGBA', (S, S), bg or (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    w, h = S * 0.46 * scale, S * 0.58 * scale
    x0, y0 = (S - w) / 2, (S - h) / 2
    fold = w * 0.3
    d.polygon([(x0, y0), (x0 + w - fold, y0), (x0 + w, y0 + fold), (x0 + w, y0 + h), (x0, y0 + h)], fill=(255, 255, 255, 255))
    d.polygon([(x0 + w - fold, y0), (x0 + w - fold, y0 + fold), (x0 + w, y0 + fold)], fill=(250, 200, 190, 255))
    f = ImageFont.truetype(FONT, int(h * 0.55))
    d.text((S / 2, y0 + h * 0.6), 'A', font=f, fill=CORAL + (255,), anchor='mm')
    return im.resize((size, size), Image.LANCZOS)

for dens, legacy, fg in [('mdpi', 48, 108), ('hdpi', 72, 162), ('xhdpi', 96, 216), ('xxhdpi', 144, 324), ('xxxhdpi', 192, 432)]:
    sq = glyph(legacy, CORAL + (255,), 1.25)
    sq.save(f'{RES}/mipmap-{dens}/ic_launcher.png')
    mask = Image.new('L', (legacy * 4, legacy * 4), 0)
    ImageDraw.Draw(mask).ellipse((0, 0, legacy * 4, legacy * 4), fill=255)
    rnd = Image.new('RGBA', (legacy, legacy), (0, 0, 0, 0))
    rnd.paste(sq, (0, 0), mask.resize((legacy, legacy), Image.LANCZOS))
    rnd.save(f'{RES}/mipmap-{dens}/ic_launcher_round.png')
    glyph(fg, None, 0.85).save(f'{RES}/mipmap-{dens}/ic_launcher_foreground.png')

for p in glob.glob(f'{RES}/drawable*/splash.png'):
    w, h = Image.open(p).size
    im = Image.new('RGBA', (w, h), CORAL + (255,))
    g = glyph(min(w, h) // 3, None, 1.2)
    im.paste(g, ((w - g.width) // 2, (h - g.height) // 2), g)
    im.convert('RGB').save(p)

glyph(512, CORAL + (255,), 1.25).save('resources/icon-512.png')
print('iconos generados')
