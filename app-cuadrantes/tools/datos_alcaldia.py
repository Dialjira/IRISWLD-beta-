"""Datos públicos del servidor de mapas de la Alcaldía de Medellín → www/data/alcaldia.js

Uso:  python3 tools/descargar_alcaldia.py   (descarga a alc/)
      python3 tools/datos_alcaldia.py alc belen.json www/data/alcaldia.js
Fuente: https://www.medellin.gov.co/servidormapas/rest/services
  seguridad_defensa/VM_Policia_MAP5 (cámaras CCTV, Metro, fotodetección, movilidad, cuadrantes)
  seguridad_defensa/VM_Indicador_Seguridad (hurtos, riñas, homicidios 2015-2017)
  ServiciosCiudad/CartografiaBase_BN_Seguridad (nomenclatura domiciliaria, barrios)
"""
import json, sys, math, datetime, collections
A, BASE, OUT = sys.argv[1], sys.argv[2], sys.argv[3]
L = lambda n: json.load(open(f'{A}/{n}.json'))
base = json.load(open(BASE))
rings = [p['rings'][0] for p in base['polys']]
nums = [p['attrs'].get('Cuadrant_1') for p in base['polys']]
bbs = [(min(q[0] for q in r), min(q[1] for q in r), max(q[0] for q in r), max(q[1] for q in r)) for r in rings]
LA0, LO0 = min(b[0] for b in bbs) - .004, min(b[1] for b in bbs) - .004
LA1, LO1 = max(b[2] for b in bbs) + .004, max(b[3] for b in bbs) + .004
near = lambda la, lo: LA0 <= la <= LA1 and LO0 <= lo <= LO1
# Cámaras: también San Antonio de Prado y alrededores (aparecen en el KML de la estación)
nearw = lambda la, lo: 6.165 <= la <= 6.258 and -75.672 <= lo <= -75.568
def inring(y, x, ring):
    ins = False; j = len(ring) - 1
    for i in range(len(ring)):
        yi, xi = ring[i]; yj, xj = ring[j]
        if ((yi > y) != (yj > y)) and (x < (xj - xi) * (y - yi) / (yj - yi) + xi): ins = not ins
        j = i
    return ins
def zone(la, lo):
    for r, b, n in zip(rings, bbs, nums):
        if b[0] <= la <= b[2] and b[1] <= lo <= b[3] and inring(la, lo, r): return n
    return ''
r5 = lambda v: round(v, 5)
def dp(pts, tol=1.2e-5):
    if len(pts) < 4: return pts
    a, b = pts[0], pts[-1]; dx, dy = b[0] - a[0], b[1] - a[1]; L2 = dx * dx + dy * dy
    best, idx = -1, 0
    for i in range(1, len(pts) - 1):
        p = pts[i]
        t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L2 if L2 else 0
        t = max(0, min(1, t)); d = math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy)
        if d > best: best, idx = d, i
    if best <= tol: return [a, b]
    return dp(pts[:idx + 1], tol)[:-1] + dp(pts[idx:], tol)
ring_ll = lambda r: [[r5(y), r5(x)] for x, y in r]
idx = lambda lst: (lambda v: (lst.index(v) if v in lst else (lst.append(v) or len(lst) - 1)))
ms = lambda t: datetime.datetime.fromtimestamp(t / 1000, datetime.timezone.utc) if t else None

# ---- Cámaras de la Policía (SIES-M) ----
cams = {}
for name in ('cctv', 'vmgcctv'):
    for f in L(name):
        a = f['attributes']; la, lo = a.get('latitud') or f['geometry']['y'], a.get('longitud') or f['geometry']['x']
        if not nearw(la, lo): continue
        c = cams.setdefault(a['n_camara'], {})
        c.update({k: v for k, v in a.items() if v not in (None, '')}); c['la'], c['lo'] = la, lo
TIPOS, ESTADOS = [], []
ti, ei = idx(TIPOS), idx(ESTADOS)
cam_out = []
for n, a in sorted(cams.items()):
    fi = ms(a.get('fecha_instalacion'))
    cam_out.append([n.strip(), (a.get('direccion') or '').strip(), ti(a.get('tipo_camara') or ''), ei(a.get('estado') or ''),
                    fi.strftime('%Y-%m') if fi else '', a.get('barrio') or '', r5(a['la']), r5(a['lo']), zone(a['la'], a['lo'])])
upd = max((a.get('fecha_actualizacion') or 0) for a in cams.values())
metro = [[a['id_cam'], a.get('direccion') or '', a.get('estado') or '', a.get('ubicacion') or '', r5(f['geometry']['y']), r5(f['geometry']['x'])]
         for f in L('metro') for a in [f['attributes']] if near(f['geometry']['y'], f['geometry']['x'])]
fdt = [[a.get('descripcion') or a.get('direccion') or '', a.get('direccion') or '', a.get('sentido') or '', a.get('operando') or '', a.get('vel_max_k') or '', r5(f['geometry']['y']), r5(f['geometry']['x'])]
       for f in L('fdt') for a in [f['attributes']] if near(f['geometry']['y'], f['geometry']['x'])]
mov = [[a.get('localizacion') or '', a.get('direccion') or '', a.get('link_foto') or '', r5(f['geometry']['y']), r5(f['geometry']['x'])]
       for f in L('cctvmov') for a in [f['attributes']] if near(f['geometry']['y'], f['geometry']['x'])]

# ---- Cuadrantes oficiales (todas las estaciones cercanas) y barrios ----
cuad = []
for f in L('cuadrantes'):
    a = f['attributes']; r = f['geometry']['rings'][0]
    rl = ring_ll(r)
    if not any(near(*p) for p in rl): continue
    cuad.append({'c': a.get('n_cuadrante'), 'n': a.get('id_cuadrante'), 'cai': a.get('distrito'), 'tel': a.get('telefono'),
                 'est': a.get('estacion'), 'sub': a.get('subestacion'), 'mun': a.get('municipio'), 'r': dp(rl)})
barrios = []
for f in L('barrios'):
    a = f['attributes']
    for r in f['geometry']['rings'][:1]:
        barrios.append({'n': a['nombre'], 'cod': a['codigo'], 'com': a.get('nombre_comuna_corregimiento'), 'r': dp(ring_ll(r))})

# ---- Nomenclatura domiciliaria ----
nom = collections.defaultdict(list)
for f in L('nomenclatura'):
    a = f['attributes']
    if a.get('via') and a.get('placa') and a.get('latitud'):
        nom[a['via'].strip()].append([a['placa'].strip(), r5(a['latitud']), r5(a['longitud'])])

# ---- Delitos 2015-2017 ----
CATS, MODS = [], []
ci, mi = idx(CATS), idx(MODS)
deli = []
def add(f, cat):
    a = f['attributes']; g = f.get('geometry') or {}
    la, lo = g.get('y'), g.get('x')
    if la is None or not near(la, lo): return
    d = ms(a.get('fecha'))
    mod = (a.get('modalidad') or '').strip().capitalize().replace('cerraduta', 'cerradura')
    deli.append([r5(la), r5(lo), ci(cat), mi(mod), int(d.strftime('%Y%m%d')) if d else 0, zone(la, lo)])
for y in (2015, 2016, 2017):
    for f in L(f'hurto{y}'):
        c = (f['attributes'].get('conducta') or 'Hurto').strip().capitalize()
        if c not in ('Hurto a persona', 'Hurto a establecimiento comercial', 'Hurto de moto', 'Hurto a residencia', 'Hurto de carro'): c = 'Otros hurtos'
        add(f, c)
    for f in L(f'rina{y}'): add(f, 'Riña')
    for f in L(f'homicidio{y}'): add(f, 'Homicidio')

out = {'fuente': 'Alcaldía de Medellín — servidormapas (ArcGIS REST), datos públicos', 'descargado': datetime.date.today().isoformat(),
       'camActualizado': ms(upd).strftime('%Y-%m-%d') if upd else '',
       'camTipos': TIPOS, 'camEstados': ESTADOS, 'cams': cam_out, 'metro': metro, 'fdt': fdt, 'mov': mov,
       'cuadrantes': cuad, 'barrios': barrios, 'nom': nom, 'delCats': CATS, 'delMods': MODS, 'delitos': deli, 'delPeriodo': '2015–2017'}
s = json.dumps(out, separators=(',', ':'), ensure_ascii=False)
open(OUT, 'w').write('window.ALCALDIA=' + s + ';')
print(f'{len(s)/1e6:.2f} MB · cámaras {len(cam_out)} · en Belén {sum(1 for c in cam_out if c[8])} · metro {len(metro)} · fdt {len(fdt)} · mov {len(mov)} · cuadrantes {len(cuad)} · barrios {len(barrios)} · direcciones {sum(len(v) for v in nom.values())} · delitos {len(deli)} (en Belén {sum(1 for d in deli if d[5])})')
print(TIPOS, ESTADOS, CATS, MODS[:20], sep='\n')
