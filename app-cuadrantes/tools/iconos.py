# Genera ícono y splash de la app (python3 tools/iconos.py)
from PIL import Image, ImageDraw
import os
R='android/app/src/main/res'; G=(14,107,71); W=(255,255,255); A=(255,212,59)
def art(size, pad):
    im=Image.new('RGBA',(size,size),(0,0,0,0)); d=ImageDraw.Draw(im)
    s=size; p=pad*s
    # mapa de cuadrantes: polígonos irregulares
    pts=[(p+.05*s,p+.20*s),(.50*s,p+.05*s),(s-p-.05*s,p+.22*s),(s-p,.62*s),(.55*s,s-p-.08*s),(p+.08*s,s-p-.18*s)]
    d.polygon(pts,fill=None,outline=W,width=max(2,int(s*.035)))
    c=(.50*s,.50*s)
    for q in [pts[0],pts[2],pts[4]]: d.line([c,q],fill=W,width=max(2,int(s*.03)))
    # pin
    r=.13*s; cx,cy=.62*s,.40*s
    d.ellipse([cx-r,cy-r,cx+r,cy+r],fill=A)
    d.polygon([(cx-r*.75,cy+r*.6),(cx+r*.75,cy+r*.6),(cx,cy+r*2.1)],fill=A)
    d.ellipse([cx-r*.4,cy-r*.4,cx+r*.4,cy+r*.4],fill=G)
    return im
for dpi,(leg,fg) in {'mdpi':(48,108),'hdpi':(72,162),'xhdpi':(96,216),'xxhdpi':(144,324),'xxxhdpi':(192,432)}.items():
    d=f'{R}/mipmap-{dpi}'
    bg=Image.new('RGBA',(leg,leg),G+(255,)); bg.alpha_composite(art(leg,.14))
    m=Image.new('L',(leg,leg),0); ImageDraw.Draw(m).rounded_rectangle([0,0,leg-1,leg-1],radius=int(leg*.22),fill=255)
    sq=Image.new('RGBA',(leg,leg),(0,0,0,0)); sq.paste(bg,(0,0),m); sq.save(f'{d}/ic_launcher.png')
    m2=Image.new('L',(leg,leg),0); ImageDraw.Draw(m2).ellipse([0,0,leg-1,leg-1],fill=255)
    rd=Image.new('RGBA',(leg,leg),(0,0,0,0)); rd.paste(bg,(0,0),m2); rd.save(f'{d}/ic_launcher_round.png')
    art(fg,.27).save(f'{d}/ic_launcher_foreground.png')
open(f'{R}/values/ic_launcher_background.xml','w').write('<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">#0E6B47</color>\n</resources>\n')
for root,_,files in os.walk(R):
    for f in files:
        if f=='splash.png':
            p=os.path.join(root,f); w,h=Image.open(p).size
            im=Image.new('RGBA',(w,h),G+(255,)); a=art(int(min(w,h)*.42),.05); im.alpha_composite(a,((w-a.width)//2,(h-a.height)//2)); im.convert('RGB').save(p)
print('iconos ok')
