"""Une lugares de OpenStreetMap, Overture Maps y equipamientos de la Alcaldía → www/data/lugares.js
Uso: python3 tools/lugares.py <dir_scratch con osm/, alc/, overture.parquet> belen.json"""
import json, sys, re, math, unicodedata, collections, duckdb
S, BASE = sys.argv[1], sys.argv[2]
base = json.load(open(BASE))
rings = [p['rings'][0] for p in base['polys']]; nums = [p['attrs']['Cuadrant_1'] for p in base['polys']]
bbs = [(min(q[0] for q in r), min(q[1] for q in r), max(q[0] for q in r), max(q[1] for q in r)) for r in rings]
LA0, LO0 = min(b[0] for b in bbs) - .004, min(b[1] for b in bbs) - .004
LA1, LO1 = max(b[2] for b in bbs) + .004, max(b[3] for b in bbs) + .004
near = lambda la, lo: la is not None and LA0 <= la <= LA1 and LO0 <= lo <= LO1
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
norm = lambda s: re.sub(r'[^a-z0-9]', '', unicodedata.normalize('NFD', (s or '').lower()).encode('ascii', 'ignore').decode())
r5 = lambda v: round(v, 5)

# Categoría propia (clave del ícono) a partir de palabras de la categoría de origen y del nombre.
RULES = [  # (clave, regex sobre "categoria|nombre")
 ('mascotas', r'veterinar|\bpet\b|pet_store|animal|mascota|grooming'),
 ('salud', r'dental|dentist|odontolog|optic|optometr|physiother|fisioter|psycholog|mental_health|behavioral|laboratory|diagnostic|plastic_and_reconstructive|dermatolog|chiropract|nutrition|cannabis'),
 ('cajero', r'\batm\b|cajero'), ('banco', r'\bbank\b|bank_or_credit|^banco|\|banco|credit_union|bancolombia|davivienda|bbva|banco de bogota|av villas|scotiabank|itau|cooperativa financiera|caja social|cotrafa|confiar'),
 ('giros', r'money_transfer|currency_exchange|payment_centre|giros|efecty|gana|baloto|corresponsal|bureau_de_change|western union|super ?giros'),
 ('ferreteria', r'hardware|building_supply|ferreter|home_improvement|paint|doityourself|deposito de materiales|electrical_supply|plumbing'),
 ('supermercado', r'supermarket|hypermarket|exito|carulla|d1\b|ara\b|olimpica|jumbo|makro|euro super'),
 ('licorera', r'liquor|alcohol|licorera|licores|beverages|wine_store|beer_store'),
 ('bar', r'\bbar\b|\bpub\b|night_?club|dance_club|discoteca|karaoke|billar|cocktail|tabern|cantina|lounge|beer_garden'),
 ('tienda', r'grocery|convenience|minimercado|tienda|abarrotes|food_and_beverage|butcher|carnicer|greengrocer|produce|fruver|deli|dairy|kiosk|tobacco|cigarrer'),
 ('panaderia', r'bakery|panader|pasteler|bake'),
 ('cafe', r'coffee|\bcafe|cafeteria|tea_room|juice|heladeria|ice_cream|dessert'),
 ('comida_rapida', r'fast_food|burger|pizza|hot_dog|fried_chicken|empanada|food_truck|sandwich'),
 ('restaurante', r'restaurant|eatery|food_court|bistro|asadero|grill|parrilla|steakhouse|seafood|sushi|food$'),
 ('hospital', r'hospital|emergency_room|urgencias|clinica / ips|medical_center|centro de salud|\|clinic\||\bips\b'),
 ('farmacia', r'pharmacy|drug_?store|chemist|drogueria|farmacia'),
 ('salud', r'dent|doctor|medic|health|lab|diagnost|optic|optometr|physiother|psych|mental|eps\b|ips\b|salud|nursing|veterinar(?!y_store)'),
 ('colegio', r'school|colegio|escuela|institucion educativa|jardin infantil|kindergarten|preschool|preescolar|childcare|\beducation\b|place_of_learning|tutor'),
 ('universidad', r'universit|college|campus|instituto universitario|tecnologico|politecnico|\bsena\b|higher_education'),
 ('biblioteca', r'library|biblioteca'),
 ('iglesia', r'church|worship|parroquia|iglesia|templo|temple|mosque|synagogue|religio|kingdom_hall|chapel|capilla'),
 ('hotel', r'hotel|motel|hostel|lodging|guest_house|apartahotel|residencias|hospedaje|bed_and_breakfast|inn\b'),
 ('gasolinera', r'gas_station|\bfuel\b|estacion de servicio|\bterpel|\btexaco|\bprimax|\bbiomax|\besso\b|\bmobil\b'),
 ('parqueadero', r'parking|parqueadero'),
 ('taller', r'automotive|car_repair|auto_body|tire|car_wash|lavadero|detailing|motorcycle_repair|taller|mechanic|oil_change|vehicle_service|car_window'),
 ('repuestos', r'vehicle_parts|car_parts|auto_parts|repuestos|motorcycle(?!_repair)|motos|auto_dealer|car_dealer|vehicle_dealer|concesionario'),
 ('centro_comercial', r'shopping_mall|\bmall\b|centro comercial|department_store'),
 ('gimnasio', r'\bgym\b|fitness|crossfit|gimnasio|yoga|pilates|martial_arts|boxing'),
 ('cancha', r'cancha|pitch|stadium|sports_centre|sport_or_fitness|placa polideportiva|coliseo|polideportivo|athletics|swimming|piscina|tennis|pista|skate|unidad deportiva|escenario'),
 ('parque', r'\bpark\b|parque|playground|garden|plaza|mirador|viewpoint|recreation'),
 ('belleza', r'beauty|hair|barber|nail|salon|spa\b|cosmetic|estetica|peluquer|barberia|tattoo|massage|wellness|makeup|eyelash|waxing'),
 ('ropa', r'apparel|clothing|clothes|fashion|shoe|boutique|jewel|accessor|lingerie|bridal|textile'),
 ('celulares', r'mobile_phone|cell|electronics|computer|celular|technology|tecnolog|video_game|camera_store|appliance'),
 
 ('papeleria', r'stationery|papeler|print|copy|fotocop|book|libreria|office_supply|art_supply|craft'),
 ('muebles', r'furniture|mattress|home_goods|lighting|decor|kitchen|interior_design|carpet|flooring|nursery|garden_center'),
 ('gobierno', r'government|townhall|courthouse|public_building|post_office|notar|registrad|alcaldia|jac\b|junta de accion|community_cent|social_facility|embassy|fiscal'),
 ('policia', r'police|policia|cai\b|estacion de policia|fire_station|bomberos'),
 ('transporte', r'bus_station|bus_stop|train|metro|taxi|transport|station|terminal|metroplus|tram'),
 ('oficina', r'office|professional|lawyer|attorney|accountant|insurance|real_estate|inmobiliaria|consult|agency|marketing|advertis|software|engineering|architect|b2b|media|design|travel|notary|employment|business|corporate|financial|investing|appraisal'),
 ('industria', r'manufactur|factory|industrial|warehouse|bodega|wholesale|distribu|fabricator|metal|plastic|printing_service|construction|contractor'),
 ('edificio', r'apartment|residential|condominium|urbanizacion|unidad residencial|edificio|torres|conjunto'),
 ('comercio', r'store|shop|retail|market|outlet|variety|gift|flower|florist|toy|sport|music|bicycle|optician|laundry|dry_clean|tailor|shoe_repair|locksmith|pawn|second_hand|lottery'),
 ('servicios', r'service|repair|cleaning|event|wedding|photograph|funeral|storage|moving|security|courier'),
]
CRE = [(k, re.compile(rx)) for k, rx in RULES]
def classify(*txt):
    t = '|'.join((x or '').lower() for x in txt)
    t = unicodedata.normalize('NFD', t).encode('ascii', 'ignore').decode()
    for k, rx in CRE:
        if rx.search(t): return k
    return 'otros'

places = []  # [nombre, clave, etiqueta, lat, lng, dir, tel, fuente]
# 1) OpenStreetMap (ya procesado: osm-belen.json)
osm = json.load(open(f'{S}/osm-belen.json'))
for p in osm['pois']:
    places.append([p['n'] or p['l'], classify(p['l'], p['n'], p['g']), p['l'], p['ll'][0], p['ll'][1], p.get('a', ''), p.get('tel', ''), 'osm'])
# 2) Alcaldía: colegios, universidades, escenarios deportivos, bibliotecas
A = lambda n: json.load(open(f'{S}/alc/{n}.json'))
for f in A('colegios'):
    a = f['attributes']; places.append([(a.get('nombre_sede') or a.get('nombre_est') or 'Sede educativa').strip().title(), 'colegio', 'Sede educativa ' + (a.get('sector') or '').lower(), a['latitud'], a['longitud'], a.get('direccion') or '', a.get('telefono') or '', 'alc'])
for f in A('superiores'):
    a = f['attributes']; places.append([a['institucion'], 'universidad', 'Educación superior', a['latitud'], a['longitud'], a.get('direccion') or '', '', 'alc'])
for n in ('canchas', 'escenarios', 'gymaire', 'parqueinf'):
    for f in A(n):
        a = f['attributes']; t = (a.get('tipologia_escenario') or '').capitalize()
        k = 'gimnasio' if 'gimnasio' in t.lower() else 'parque' if 'parque' in t.lower() else 'cancha'
        places.append([(a.get('nombre') or t).strip().title(), k, t or 'Escenario deportivo (INDER)', a['latitud'], a['longitud'], a.get('direccion') or '', '', 'alc'])
for f in A('bibliotecas'):
    a = f['attributes']; g = f['geometry']; places.append([a['nombre'], 'biblioteca', (a.get('tipo') or 'Biblioteca').capitalize(), g['y'], g['x'], a.get('ubicacion') or '', a.get('telefono') or '', 'alc'])
# 3) Overture Maps (Meta, Microsoft, Foursquare…), filtrado por confianza
con = duckdb.connect()
ov = con.execute(f"select name,bcat,cat,hier,confidence,addr,phone,brand,lat,lon,src from '{S}/overture.parquet' where name is not null").fetchall()
LAB = {}
for name, bcat, cat, hier, conf, addr, phone, brand, la, lo, src in ov:
    if not near(la, lo): continue
    k = classify(cat, bcat, name, brand)
    minc = .7 if k in ('otros', 'servicios') or (bcat in ('historic_site', None)) else .45
    if (conf or 0) < minc: continue
    lab = (cat or bcat or '').replace('_', ' ')
    places.append([name.strip(), k, lab, la, lo, addr or '', phone or '', 'ov'])
# Filtrar por área, quitar duplicados (mismo nombre a menos de 60 m; se conserva el primero: OSM > Alcaldía > Overture)
out, grid = [], collections.defaultdict(list)
for p in places:
    if not near(p[3], p[4]) or not p[0]: continue
    key = norm(p[0])[:18]; g = (round(p[3] / .002), round(p[4] / .002))
    dup = False
    for dx in (-1, 0, 1):
        for dy in (-1, 0, 1):
            for q in grid[(g[0] + dx, g[1] + dy)]:
                if q[0] == key and math.hypot((q[1] - p[3]) * 110574, (q[2] - p[4]) * 110570) < 60: dup = True
    if dup: continue
    grid[g].append((key, p[3], p[4]))
    out.append([p[0][:80], p[1], p[2][:40], r5(p[3]), r5(p[4]), (p[5] or '')[:70], (p[6] or '')[:30], p[7], zone(p[3], p[4])])
c = collections.Counter(p[1] for p in out); src = collections.Counter(p[7] for p in out)
s = json.dumps({'fuente': 'OpenStreetMap (ODbL), Overture Maps Foundation (CDLA), Alcaldía de Medellín', 'n': len(out), 'rows': out}, separators=(',', ':'), ensure_ascii=False)
open(sys.argv[3] if len(sys.argv) > 3 else 'www/data/lugares.js', 'w').write('window.LUGARES=' + s + ';')
print(f'{len(s)/1e6:.2f} MB', len(out), src, '\n', c.most_common(), '\nen Belén', sum(1 for p in out if p[8]))
print('bancos C3', [(p[0], p[7]) for p in out if p[8] == '3' and p[1] in ('banco', 'cajero')])
