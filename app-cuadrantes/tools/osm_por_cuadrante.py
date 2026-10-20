import json,re,math,collections
base=json.load(open('belen.json'))
zones=[]
for p in base['polys']:
    a=p['attrs'];zones.append({'num':a['Cuadrant_1'],'ring':p['rings'][0]})
def inring(pt,ring):
    y,x=pt;ins=False;j=len(ring)-1
    for i in range(len(ring)):
        yi,xi=ring[i];yj,xj=ring[j]
        if ((yi>y)!=(yj>y)) and (x<(xj-xi)*(y-yi)/(yj-yi)+xi): ins=not ins
        j=i
    return ins
bb=[[min(q[0] for q in z['ring']),min(q[1] for q in z['ring']),max(q[0] for q in z['ring']),max(q[1] for q in z['ring'])] for z in zones]
def zone_of(pt):
    for z,b in zip(zones,bb):
        if b[0]<=pt[0]<=b[2] and b[1]<=pt[1]<=b[3] and inring(pt,z['ring']): return z['num']
    return None
LA0,LA1,LO0,LO1=min(b[0] for b in bb)-.002,max(b[2] for b in bb)+.002,min(b[1] for b in bb)-.002,max(b[3] for b in bb)+.002
r5=lambda v:round(v,5)
# streets
S=json.load(open('osm/streets.json'))['elements']
streets=[];zstreets=collections.defaultdict(set)
skip={'footway','path','steps','cycleway','track','pedestrian','corridor','bridleway','platform','elevator','proposed','construction'}
for e in S:
    t=e['tags'];hw=t.get('highway')
    if hw in skip and not re.match(r'(Calle|Carrera|Circular|Transversal|Diagonal)\b',t['name']): continue
    g=[[r5(q['lat']),r5(q['lon'])] for q in e.get('geometry',[])]
    if not any(LA0<=q[0]<=LA1 and LO0<=q[1]<=LO1 for q in g): continue
    nm=t['name'].strip()
    streets.append({'n':nm,'g':[c for q in g for c in q]})
    zs=set(zone_of(q) for q in g);zs.discard(None)
    # also midpoints for short segments
    for i in range(1,len(g)):
        m=[(g[i][0]+g[i-1][0])/2,(g[i][1]+g[i-1][1])/2];zz=zone_of(m)
        if zz: zs.add(zz)
    for zz in zs: zstreets[zz].add(nm)
    for k in ('alt_name','old_name','official_name'):
        if k in t: streets[-1].setdefault('alt',[]).append(t[k])
# places / barrios
P=json.load(open('osm/places.json'))['elements']
nb=[]
for e in P:
    t=e['tags'];ll=[e['lat'],e['lon']] if 'lat' in e else [e['center']['lat'],e['center']['lon']]
    if t.get('place') in ('neighbourhood','village','locality','hamlet','quarter'): nb.append((t['name'],ll))
zbarrios={}
def cen(r): return [sum(q[0] for q in r)/len(r),sum(q[1] for q in r)/len(r)]
dist=lambda a,b:math.hypot((a[0]-b[0])*111320,(a[1]-b[1])*110700)
for z in zones:
    inside=[n for n,ll in nb if inring(ll,z['ring'])]
    c=cen(z['ring'])
    near=sorted(nb,key=lambda x:dist(x[1],c))
    zbarrios[z['num']]={'en':sorted(set(inside)),'cerca':[n for n,ll in near[:4] if n not in inside][:3]}
# POIs
GROUPS={'comida':'Comida y bebida','comercio':'Comercio','salud':'Salud','educacion':'Educación','finanzas':'Bancos y cajeros','seguridad':'Seguridad y gobierno','religion':'Iglesias y culto','transporte':'Transporte y vehículos','recreacion':'Parques y recreación','oficinas':'Empresas y oficinas','edificios':'Edificios y unidades','otros':'Otros'}
A={'restaurant':('comida','Restaurante'),'fast_food':('comida','Comidas rápidas'),'cafe':('comida','Café'),'bar':('comida','Bar'),'pub':('comida','Bar'),'ice_cream':('comida','Heladería'),'food_court':('comida','Plazoleta de comidas'),'biergarten':('comida','Bar'),
'hospital':('salud','Hospital'),'clinic':('salud','Clínica / IPS'),'doctors':('salud','Consultorio médico'),'dentist':('salud','Odontología'),'pharmacy':('salud','Farmacia / droguería'),'veterinary':('salud','Veterinaria'),
'school':('educacion','Colegio / escuela'),'university':('educacion','Universidad'),'college':('educacion','Instituto'),'kindergarten':('educacion','Jardín infantil'),'library':('educacion','Biblioteca'),'language_school':('educacion','Escuela de idiomas'),'driving_school':('educacion','Escuela de conducción'),'childcare':('educacion','Guardería'),
'bank':('finanzas','Banco'),'atm':('finanzas','Cajero automático'),'bureau_de_change':('finanzas','Casa de cambio'),'money_transfer':('finanzas','Giros / corresponsal'),'payment_centre':('finanzas','Centro de pagos'),
'police':('seguridad','Policía'),'fire_station':('seguridad','Bomberos'),'townhall':('seguridad','Alcaldía / sede pública'),'courthouse':('seguridad','Juzgado'),'public_building':('seguridad','Edificio público'),'prison':('seguridad','Centro de reclusión'),'community_centre':('seguridad','Centro comunitario / JAC'),'social_facility':('seguridad','Asistencia social'),'post_office':('seguridad','Correo'),
'place_of_worship':('religion','Iglesia / templo'),'monastery':('religion','Convento'),
'fuel':('transporte','Estación de servicio'),'parking':('transporte','Parqueadero'),'bus_station':('transporte','Terminal de buses'),'taxi':('transporte','Taxis'),'car_wash':('transporte','Lavadero de carros'),'charging_station':('transporte','Carga eléctrica'),'car_rental':('transporte','Alquiler de vehículos'),'motorcycle_parking':('transporte','Parqueadero de motos'),'bicycle_parking':('transporte','Parqueadero de bicicletas'),'bicycle_rental':('transporte','EnCicla / bicicletas'),'vehicle_inspection':('transporte','Revisión técnico-mecánica'),
'marketplace':('comercio','Plaza de mercado'),'theatre':('recreacion','Teatro'),'cinema':('recreacion','Cine'),'arts_centre':('recreacion','Centro cultural'),'nightclub':('comida','Discoteca'),'events_venue':('recreacion','Salón de eventos'),'casino':('recreacion','Casino'),'gambling':('recreacion','Juegos de azar'),
'toilets':('otros','Baños públicos'),'drinking_water':('otros','Agua potable'),'shelter':('otros','Refugio'),'telephone':('otros','Teléfono público'),'recycling':('otros','Reciclaje'),'waste_disposal':('otros','Basuras'),'grave_yard':('religion','Cementerio'),'funeral_hall':('religion','Funeraria'),'internet_cafe':('comercio','Café internet'),'coworking_space':('oficinas','Coworking'),'studio':('oficinas','Estudio')}
SH={'supermarket':'Supermercado','convenience':'Tienda / minimercado','bakery':'Panadería','butcher':'Carnicería','clothes':'Ropa','shoes':'Calzado','hairdresser':'Peluquería','beauty':'Estética / belleza','hardware':'Ferretería','car_repair':'Taller mecánico','motorcycle':'Motos','car':'Concesionario','car_parts':'Repuestos','mobile_phone':'Celulares','electronics':'Electrónica','furniture':'Muebles','greengrocer':'Fruver','alcohol':'Licorera','beverages':'Bebidas','optician':'Óptica','jewelry':'Joyería','pet':'Mascotas','books':'Librería','stationery':'Papelería','florist':'Floristería','laundry':'Lavandería','dry_cleaning':'Lavandería','mall':'Centro comercial','department_store':'Almacén','variety_store':'Variedades','gift':'Regalos','tyres':'Llantas','bicycle':'Bicicletas','sports':'Deportes','toys':'Juguetería','cosmetics':'Cosméticos','chemist':'Droguería','deli':'Charcutería','seafood':'Pescadería','dairy':'Lácteos','computer':'Computadores','copyshop':'Fotocopias','tailor':'Modistería','kiosk':'Kiosco','lottery':'Lotería / chance','paint':'Pinturas','doityourself':'Construcción','trade':'Distribuidora','wholesale':'Mayorista','massage':'Masajes','tattoo':'Tatuajes','travel_agency':'Agencia de viajes','funeral_directors':'Funeraria','pawnbroker':'Compraventa','second_hand':'Segunda mano','yes':'Local comercial'}
LE={'park':'Parque','playground':'Parque infantil','pitch':'Cancha','sports_centre':'Unidad deportiva','stadium':'Estadio','fitness_centre':'Gimnasio','swimming_pool':'Piscina','garden':'Jardín','track':'Pista','dance':'Academia de baile','sports_hall':'Coliseo'}
BLD={'residential':'Unidad residencial','apartments':'Edificio de apartamentos','house':'Residencia','commercial':'Edificio comercial','retail':'Local / centro comercial','office':'Edificio de oficinas','industrial':'Industria / bodega','warehouse':'Bodega','school':'Colegio','church':'Iglesia','hospital':'Hospital','university':'Universidad','public':'Edificio público','government':'Edificio público','yes':'Edificio'}
POI=json.load(open('osm/pois.json'))['elements']
pois=[];seen=set()
IMPORTANT={'police','hospital','clinic','school','bank','atm','fuel','pharmacy','place_of_worship','fire_station','university','kindergarten','marketplace','townhall','bus_station','community_centre'}
for e in POI:
    t=e['tags'];ll=[e['lat'],e['lon']] if 'lat' in e else ([e['center']['lat'],e['center']['lon']] if 'center' in e else None)
    if not ll: continue
    z=zone_of(ll)
    if not z: continue
    name=t.get('name','').strip()
    g=None;lab=None;raw=''
    if 'amenity' in t:
        v=t['amenity'];raw='amenity='+v
        if v in A: g,lab=A[v]
        else: g,lab='otros',v.replace('_',' ').capitalize()
        if v in ('bench','waste_basket','vending_machine','parking_entrance','parking_space','hunting_stand','clock','fountain','post_box','bicycle_parking','motorcycle_parking','shelter','drinking_water','telephone','recycling','waste_disposal','toilets') and not name: continue
    elif 'shop' in t:
        v=t['shop'];raw='shop='+v;g='comercio';lab=SH.get(v,v.replace('_',' ').capitalize())
    elif 'healthcare' in t:
        v=t['healthcare'];raw='healthcare='+v;g='salud';lab={'laboratory':'Laboratorio','hospital':'Hospital','clinic':'Clínica / IPS','doctor':'Consultorio médico','dentist':'Odontología','pharmacy':'Farmacia','physiotherapist':'Fisioterapia','optometrist':'Optometría','centre':'Centro de salud'}.get(v,'Salud')
    elif 'office' in t:
        v=t['office'];raw='office='+v;g='seguridad' if v=='government' else 'oficinas';lab={'government':'Entidad pública','company':'Empresa','lawyer':'Abogados','estate_agent':'Inmobiliaria','insurance':'Aseguradora','accountant':'Contadores','ngo':'ONG / fundación','telecommunication':'Telecomunicaciones','educational_institution':'Institución educativa','association':'Asociación','employment_agency':'Agencia de empleo','notary':'Notaría','financial':'Financiera','it':'Tecnología'}.get(v,'Oficina')
    elif 'leisure' in t:
        v=t['leisure'];raw='leisure='+v;g='recreacion';lab=LE.get(v,v.replace('_',' ').capitalize())
    elif 'tourism' in t:
        v=t['tourism'];raw='tourism='+v;g='recreacion' if v not in ('hotel','hostel','motel','guest_house','apartment') else 'comercio';lab={'hotel':'Hotel','hostel':'Hostal','motel':'Motel','guest_house':'Hospedaje','apartment':'Apartamento turístico','viewpoint':'Mirador','artwork':'Obra de arte','museum':'Museo','attraction':'Atractivo','information':'Información turística','picnic_site':'Zona de picnic'}.get(v,v.capitalize())
        if v in ('information','artwork') and not name: continue
    elif 'craft' in t:
        v=t['craft'];raw='craft='+v;g='comercio';lab='Taller'
    elif 'historic' in t:
        v=t['historic'];raw='historic='+v;g='recreacion';lab='Sitio histórico'
    elif 'building' in t:
        v=t['building'];raw='building='+v;lab=BLD.get(v,'Edificio');g='edificios' if v in ('residential','apartments','house','yes','commercial','office','retail','industrial','warehouse') else 'otros'
        if v in ('school','university'): g='educacion'
        if v in ('church',): g='religion'
        if v in ('hospital',): g='salud'
        if v in ('public','government'): g='seguridad'
    if not name and raw.split('=')[1] not in IMPORTANT and 'shop' not in t: continue
    key=(name,round(ll[0],4),round(ll[1],4))
    if key in seen: continue
    seen.add(key)
    addr=' '.join(x for x in [t.get('addr:street',''),('# '+t['addr:housenumber']) if 'addr:housenumber' in t else ''] if x).strip()
    o={'n':name,'g':g,'l':lab,'ll':[r5(ll[0]),r5(ll[1])],'z':z}
    if addr:o['a']=addr
    for k,kk in (('phone','tel'),('contact:phone','tel'),('opening_hours','h'),('website','w'),('contact:website','w'),('brand','b')):
        if k in t and kk not in o:o[kk]=t[k]
    pois.append(o)
# addresses (addr points that are not POIs)
AD=json.load(open('osm/addr.json'))['elements'];addrs=[]
for e in AD:
    t=e['tags'];ll=[e['lat'],e['lon']] if 'lat' in e else ([e['center']['lat'],e['center']['lon']] if 'center' in e else None)
    if not ll or 'addr:housenumber' not in t: continue
    z=zone_of(ll)
    if not z: continue
    addrs.append({'a':t['addr:street']+' # '+t['addr:housenumber'],'ll':[r5(ll[0]),r5(ll[1])],'z':z,**({'n':t['name']} if 'name' in t else {})})
out={'nb':[[n,r5(ll[0]),r5(ll[1])] for n,ll in nb],'fecha':json.load(open('osm/streets.json'))['osm3s']['timestamp_osm_base'][:10],'groups':GROUPS,'streets':streets,'zstreets':{k:sorted(v) for k,v in zstreets.items()},'barrios':zbarrios,'pois':pois,'addrs':addrs}
s=json.dumps(out,separators=(',',':'),ensure_ascii=False)
open('osm-belen.json','w').write(s)
print(len(s),len(streets),len(pois),len(addrs),out['fecha'])
print(collections.Counter(p['g'] for p in pois))
print(collections.Counter(p['z'] for p in pois).most_common(30))
for k in ['16','1','20','26']: print(k,zbarrios[k],len(zstreets[k]),sorted(zstreets[k])[:12])
